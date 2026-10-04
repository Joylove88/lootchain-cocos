import { assetManager, sys } from 'cc';
import { PREVIEW } from 'cc/env';

/**
 * 静态资源离线缓存(2026-09-17 用户拍板;2026-09-25 改:首次只预载登录+大厅界面图,其余用到才下载):
 * 下载过的资源都经 Service Worker 存本地,二次访问不再显示预载屏、用过的资源不再走网络。
 *
 * - 构建包:注册根目录 sw.js(build-templates/web-mobile/sw.js),资源请求经 Service Worker 写入 Cache Storage,
 *   二次访问直接从本地读,不走网络。
 * - 编辑器预览:不注册 Service Worker(预览服务器随时改文件),只用本地标记跳过预载屏。
 * - 标记按资源包版本记录:发版后 resources 包 md5 变化,标记失效,自动重新走一次预载下载新资源。
 */
const PRELOAD_DONE_KEY = 'lootchain.bootPreload.version';
const SW_URL = 'sw.js';
const SW_CONTROL_TIMEOUT_MS = 4000;

/** 当前资源版本:构建开启 md5Cache 时取 resources 包的 md5;预览/未开启时为 'dev'。 */
export function assetCacheVersion(): string {
  const vers = (assetManager.downloader as unknown as { bundleVers?: Record<string, string> }).bundleVers;
  return (vers && vers.resources) || 'dev';
}

function canUseServiceWorker(): boolean {
  if (PREVIEW || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  // Service Worker 只在安全上下文可用(https 或 localhost)。
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

/** 本地已有与当前版本一致的完整预载,且(构建包)资源已由 Service Worker 接管 → 可跳过预载屏。 */
export function isBootPreloadCached(): boolean {
  let saved: string | null = null;
  try {
    saved = sys.localStorage.getItem(PRELOAD_DONE_KEY);
  } catch (error) {
    void error;
    return false;
  }
  if (saved !== assetCacheVersion()) {
    return false;
  }
  if (!canUseServiceWorker()) {
    // 预览环境没有 Service Worker,资源本就在本机,标记即可;不支持 SW 的浏览器也按标记放行,走普通 HTTP 缓存。
    return true;
  }
  return !!navigator.serviceWorker.controller;
}

export function markBootPreloadCached(): void {
  try {
    sys.localStorage.setItem(PRELOAD_DONE_KEY, assetCacheVersion());
  } catch (error) {
    void error;
  }
}

/**
 * 注册 Service Worker,并等它接管当前页面(首次访问时预载请求才能被写入缓存)。
 * 超时或不支持时照常返回,预载继续走网络,不阻塞进游戏。
 */
export async function ensureAssetServiceWorker(waitForControl: boolean): Promise<boolean> {
  if (!canUseServiceWorker()) {
    return false;
  }
  try {
    await navigator.serviceWorker.register(SW_URL);
  } catch (error) {
    console.warn('[LootChain] asset service worker register failed', error);
    return false;
  }
  if (navigator.serviceWorker.controller || !waitForControl) {
    return !!navigator.serviceWorker.controller;
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(value);
    };
    const onChange = (): void => done(true);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    setTimeout(() => done(!!navigator.serviceWorker.controller), SW_CONTROL_TIMEOUT_MS);
  });
}

/**
 * 登录页"修复"(2026-09-25):注销本站 Service Worker、删除 lootchain-assets-* 缓存、清预载标记。
 * 之后刷新页面会重新走一次首访预载(只拉登录+大厅),其余素材用到时重新下载。任何一步失败都跳过继续。
 */
export async function resetAssetOfflineCache(): Promise<void> {
  try {
    sys.localStorage.removeItem(PRELOAD_DONE_KEY);
    sys.localStorage.removeItem('lootchain.fullPack.version');
  } catch (error) {
    void error;
  }
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    void error;
  }
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('lootchain-assets-')).map((name) => caches.delete(name)));
    }
  } catch (error) {
    void error;
  }
}


/**
 * Web/H5 首次访问整包下载(2026-10-04 用户拍板,取代 09-25 的"首次只下用到的"):
 * 出包脚本在构建根目录写 asset-manifest.json(assets/ 与 cocos-js/ 下全部文件 + 字节数),
 * 首访加载屏按清单把缺的文件逐个下载进 Cache Storage(与 sw.js 同名缓存,之后引擎请求由 SW 缓存优先命中),
 * 二次访问 / 刷新只补清单里新出现的文件(发版后的增量),已在本地的不再走网络。
 *
 * - 原生包(Android / iOS / Windows):资源随安装包,不走这里。
 * - 编辑器预览、没有清单的旧部署、不支持 Cache Storage 的浏览器:返回 null,退回按页面首开时加载。
 * - 剩余存储空间不够整包:同样退回按需加载,不硬塞。
 * - 中途刷新 / 断网:已下好的文件留在缓存,下次从断点继续(按文件粒度)。
 */
export const ASSET_MANIFEST_URL = 'asset-manifest.json';
const FULL_PACK_DONE_KEY = 'lootchain.fullPack.version';
/** 页面自己下载、不经 SW 再写一遍缓存(sw.js 见到这个请求头直接放行到网络)。 */
const PREFETCH_HEADER = 'x-lootchain-prefetch';
const FULL_PACK_CONCURRENCY = 6;
const FULL_PACK_RETRY = 3;
const ASSET_CACHE_NAME = 'lootchain-assets-v1';

export interface AssetManifest {
  version: string;
  /** [相对路径, 字节数] */
  files: Array<[string, number]>;
}

export interface FullPackProgress {
  doneBytes: number;
  totalBytes: number;
  doneFiles: number;
  totalFiles: number;
}

function canUseCacheStorage(): boolean {
  return canUseServiceWorker() && typeof caches !== 'undefined' && typeof fetch === 'function';
}

/** 这个环境走整包下载(构建包 + 安全上下文 + 支持 Cache Storage);预览 / 原生返回 false。 */
export function supportsFullPack(): boolean {
  return !sys.isNative && canUseCacheStorage();
}

/** 原生安装包:资源全在包里,没有下载等待。 */
export function isNativePackage(): boolean {
  return sys.isNative;
}

/** 已整包下载过当前版本(本地标记):可以放心在后台把各页面素材从本地读进内存。 */
export function isFullPackCached(): boolean {
  if (sys.isNative) {
    return true;
  }
  try {
    const saved = sys.localStorage.getItem(FULL_PACK_DONE_KEY);
    return !!saved && saved === assetCacheVersion();
  } catch (error) {
    void error;
    return false;
  }
}

/** 拉清单(不走缓存);预览 / 没有清单 / 网络失败 → null。 */
export async function fetchAssetManifest(): Promise<AssetManifest | null> {
  if (!canUseCacheStorage()) {
    return null;
  }
  try {
    const response = await fetch(ASSET_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const manifest = (await response.json()) as AssetManifest;
    if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0) {
      return null;
    }
    return manifest;
  } catch (error) {
    void error;
    return null;
  }
}

/** 清单里本地缓存还缺的文件(全齐返回空数组)。 */
export async function missingManifestFiles(manifest: AssetManifest): Promise<Array<[string, number]>> {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const keys = await cache.keys();
  const have = new Set<string>(keys.map((request) => new URL(request.url).pathname));
  const base = new URL('.', location.href).pathname;
  return manifest.files.filter(([path]) => !have.has(base + path));
}

/** 剩余空间够不够放下这些字节(留 15% 余量);拿不到估算时按"够"处理。 */
export async function hasStorageRoomFor(bytes: number): Promise<boolean> {
  try {
    const storage = (navigator as Navigator & { storage?: StorageManager }).storage;
    if (!storage || !storage.estimate) {
      return true;
    }
    // 申请持久化,避免浏览器空间紧张时把整包缓存清掉(Chrome/Safari 不弹窗,拒绝也不影响下载)。
    if (storage.persist) {
      void storage.persist().catch(() => false);
    }
    const estimate = await storage.estimate();
    if (!estimate.quota) {
      return true;
    }
    return estimate.quota - (estimate.usage || 0) > bytes * 1.15;
  } catch (error) {
    void error;
    return true;
  }
}

/**
 * 下载清单里缺的文件进缓存,按字节回调进度。全部成功返回 true 并记标记;
 * 有文件重试后仍失败返回 false(已下好的保留,下次访问继续补)。
 */
export async function downloadFullPack(missing: Array<[string, number]>, totalBytesAll: number, cachedBytes: number, onProgress: (progress: FullPackProgress) => void): Promise<boolean> {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const progress: FullPackProgress = { doneBytes: cachedBytes, totalBytes: totalBytesAll, doneFiles: 0, totalFiles: missing.length };
  onProgress(progress);
  let cursor = 0;
  let failed = 0;
  const fetchOne = async (path: string): Promise<boolean> => {
    for (let attempt = 0; attempt < FULL_PACK_RETRY; attempt += 1) {
      try {
        const response = await fetch(path, { headers: { [PREFETCH_HEADER]: '1' } });
        if (response.ok && response.status === 200) {
          await cache.put(path, response);
          return true;
        }
      } catch (error) {
        void error;
      }
    }
    return false;
  };
  const worker = async (): Promise<void> => {
    while (cursor < missing.length) {
      const [path, size] = missing[cursor++];
      const ok = await fetchOne(path);
      if (!ok) {
        failed += 1;
      }
      progress.doneBytes += size;
      progress.doneFiles += 1;
      onProgress(progress);
    }
  };
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(FULL_PACK_CONCURRENCY, missing.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  if (failed > 0) {
    console.warn(`[LootChain] full pack: ${failed}/${missing.length} 个文件下载失败,下次访问继续补`);
    return false;
  }
  markFullPackCached();
  return true;
}

export function markFullPackCached(): void {
  try {
    sys.localStorage.setItem(FULL_PACK_DONE_KEY, assetCacheVersion());
  } catch (error) {
    void error;
  }
}

/** 发版后清掉缓存里不在新清单里的旧文件(后台,不阻塞)。 */
export async function pruneStaleAssetCache(manifest: AssetManifest): Promise<void> {
  try {
    const cache = await caches.open(ASSET_CACHE_NAME);
    const base = new URL('.', location.href).pathname;
    const keep = new Set<string>(manifest.files.map(([path]) => base + path));
    const keys = await cache.keys();
    for (const request of keys) {
      const pathname = new URL(request.url).pathname;
      if (!keep.has(pathname)) {
        await cache.delete(request);
      }
    }
  } catch (error) {
    void error;
  }
}
