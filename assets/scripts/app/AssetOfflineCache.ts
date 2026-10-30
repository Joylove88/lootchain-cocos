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

/**
 * 当前资源版本:构建开启 md5Cache 时取 resources 包的 md5 + 发版编号(release:web 写进 index.html 的 window.__lootchainBuild);
 * 预览/未开启时为 'dev'。只改代码 / 出包后处理的发版包 md5 不变,必须带发版编号,老玩家才会走核对流程换掉改过内容的旧文件。
 */
export function assetCacheVersion(): string {
  const vers = (assetManager.downloader as unknown as { bundleVers?: Record<string, string> }).bundleVers;
  const base = (vers && vers.resources) || 'dev';
  const build = typeof window !== 'undefined' ? (window as unknown as { __lootchainBuild?: string }).__lootchainBuild : undefined;
  return build ? `${base}-${build}` : base;
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
const MUTABLE_CHECKED_KEY = 'lootchain.mutableChecked';
const FULL_PACK_CONCURRENCY = 6;
const FULL_PACK_RETRY = 3;
const ASSET_CACHE_NAME = 'lootchain-assets-v1';

export interface AssetManifest {
  version: string;
  /** [相对路径, 字节数] */
  files: Array<[string, number]>;
  /**
   * 文件名没变、内容却改过的文件(出包后处理策略变了,如 PNG 压缩规则):相对路径 → 当前内容 SHA-1 前 16 位。
   * 带 md5 后缀的文件按"缓存优先、永不过期"存,同名新内容永远进不了老玩家的缓存,必须按内容核对后删掉重下
   * (2026-10-09 手机大招一块块绿方块:10-07 前的包把预乘图集压成调色板图,修复后文件名不变,手机一直用缓存里的坏图)。
   */
  mutable?: Record<string, string>;
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

/** 清单里本地缓存还缺的文件(全齐返回空数组)。先把内容已过期的同名文件删掉,它们随缺失文件一起重下。 */
export async function missingManifestFiles(manifest: AssetManifest): Promise<Array<[string, number]>> {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const keys = await cache.keys();
  const have = new Set<string>(keys.map((request) => new URL(request.url).pathname));
  const base = new URL('.', location.href).pathname;
  await evictMutatedFiles(cache, manifest, base, have);
  return manifest.files.filter(([path]) => !have.has(base + path));
}

/**
 * 启动核对删掉的过期文件:重下时要绕过浏览器 HTTP 缓存(md5 名文件是一年 immutable 强缓存,
 * 默认 fetch 会从磁盘缓存原样拿回那份旧内容,核对等于白做)。
 */
const evictedPaths = new Set<string>();

/** 下载器用的 fetch 选项:被核对删掉的文件强制回源。 */
function packFetchInit(path: string): RequestInit {
  return { headers: { [PREFETCH_HEADER]: '1' }, cache: evictedPaths.has(path) ? 'reload' : 'default' };
}

/** 核对 manifest.mutable 里在缓存中的文件:内容哈希对不上就删掉并从 have 里移除。任何一步失败都跳过(不影响启动)。 */
async function evictMutatedFiles(cache: Cache, manifest: AssetManifest, base: string, have: Set<string>): Promise<void> {
  const mutable = manifest.mutable;
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!mutable || !subtle) {
    return;
  }
  // 每个版本只核对一次:清单可能有上千个文件(10-30 压缩规则改动后 2000+),每次启动都逐个算哈希会拖慢进游戏
  const checkedKey = `${MUTABLE_CHECKED_KEY}.${manifest.version ?? assetCacheVersion()}`;
  try {
    if (sys.localStorage.getItem(MUTABLE_CHECKED_KEY) === checkedKey) {
      return;
    }
  } catch {
    // 本地存储不可用:照常核对
  }
  for (const path of Object.keys(mutable)) {
    if (!have.has(base + path)) {
      continue;
    }
    try {
      const hit = await cache.match(path, { ignoreVary: true });
      if (!hit) {
        continue;
      }
      const digest = new Uint8Array(await subtle.digest('SHA-1', await hit.arrayBuffer()));
      const hex = Array.from(digest.subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (hex !== mutable[path]) {
        await cache.delete(path, { ignoreVary: true });
        have.delete(base + path);
        evictedPaths.add(path);
        console.warn(`[LootChain] full pack: ${path} 缓存内容已过期,重新下载`);
      }
    } catch (error) {
      void error;
    }
  }
  try {
    sys.localStorage.setItem(MUTABLE_CHECKED_KEY, checkedKey);
  } catch {
    // 忽略
  }
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
export async function downloadFullPack(missing: Array<[string, number]>, totalBytesAll: number, cachedBytes: number, onProgress: (progress: FullPackProgress) => void, markDone = true): Promise<boolean> {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const progress: FullPackProgress = { doneBytes: cachedBytes, totalBytes: totalBytesAll, doneFiles: 0, totalFiles: missing.length };
  onProgress(progress);
  let cursor = 0;
  let failed = 0;
  const fetchOne = async (path: string): Promise<boolean> => {
    for (let attempt = 0; attempt < FULL_PACK_RETRY; attempt += 1) {
      try {
        const response = await fetch(path, packFetchInit(path));
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
  // 只下开局包时不记「整包已在本地」(后台下载器全部下完才记)
  if (markDone) {
    markFullPackCached();
  }
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

// ── 分层下载(2026-10-30 领导反馈「首访 500 多 M 会吓跑用户」;规则见 scripts/web-pack-tiers.mjs)──
// 首访只下开局包(manifest.files 前 manifest.core 个,约 100MB,下完进游戏);其余进游戏后后台低并发慢慢下。
// 玩家去了还没下完的地方(地图 / 界面 / 战斗):调用方先 ensurePackResources 把那一块整块提到队首、提速下完,
// 期间显示加载页,绝不先画出缺素材的画面。

export interface TieredManifest extends AssetManifest {
  /** 与 files 平行的资源路径(resources 包内;引擎 / 配置为空串)。 */
  res?: string[];
  /** files 前多少个是开局包;缺省 = 全部(旧清单)。 */
  core?: number;
}

const BACKGROUND_CONCURRENCY = 3;
const URGENT_CONCURRENCY = 6;

interface PackWaiter {
  need: Set<string>;
  total: number;
  onProgress?: (done: number, total: number) => void;
  resolve: () => void;
}

/** 后台下载器(全局唯一):queue = 还没下的清单文件(按清单顺序),urgent = 被 ensure 提到队首的。 */
class PackDownloader {
  private cache: Cache | null = null;
  private manifest: TieredManifest | null = null;
  private resOf = new Map<string, string>();
  private sizeOf = new Map<string, number>();
  private queue: string[] = [];
  private urgent: string[] = [];
  private inFlight = new Set<string>();
  private have = new Set<string>();
  private failed = new Set<string>();
  private waiters: PackWaiter[] = [];
  private running = 0;
  private paused = false;
  private started = false;
  private doneBytes = 0;
  private totalBytes = 0;

  /** 记清单与本地已有文件;missing = 本地缺的(已按清单顺序)。 */
  init(manifest: TieredManifest, missing: Array<[string, number]>, cache: Cache): void {
    this.manifest = manifest;
    this.cache = cache;
    manifest.files.forEach(([path, size], index) => {
      this.resOf.set(path, manifest.res?.[index] ?? '');
      this.sizeOf.set(path, size);
      this.totalBytes += size;
    });
    const lack = new Set(missing.map(([path]) => path));
    for (const [path, size] of manifest.files) {
      if (lack.has(path)) {
        this.queue.push(path);
      } else {
        this.have.add(path);
        this.doneBytes += size;
      }
    }
  }

  hasManifest(): boolean {
    return !!this.manifest;
  }

  /** 开始后台下载(进游戏后调一次)。 */
  start(): void {
    this.started = true;
    this.pump();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) {
      this.pump();
    }
  }

  /** 资源路径匹配 match 的文件本地缺几个(0 = 齐了)。 */
  missingFor(match: (res: string) => boolean): string[] {
    if (!this.manifest) {
      return [];
    }
    const out: string[] = [];
    for (const path of this.queue.concat(this.urgent, Array.from(this.inFlight))) {
      const res = this.resOf.get(path) ?? '';
      if (res && match(res) && !this.have.has(path)) {
        out.push(path);
      }
    }
    return Array.from(new Set(out));
  }

  /** 后台队列里匹配的文件挪到队首(仍按后台并发下,不算紧急);返回挪动个数。 */
  prioritize(match: (res: string) => boolean): number {
    const front: string[] = [];
    const rest: string[] = [];
    for (const path of this.queue) {
      const res = this.resOf.get(path) ?? '';
      (res && match(res) ? front : rest).push(path);
    }
    this.queue = front.concat(rest);
    return front.length;
  }

  /** 把匹配的文件提到队首加速下,全部到本地(或重试后放弃)时 resolve。 */
  ensure(match: (res: string) => boolean, onProgress?: (done: number, total: number) => void): Promise<void> {
    const need = this.missingFor(match);
    if (need.length === 0) {
      return Promise.resolve();
    }
    const needSet = new Set(need);
    this.queue = this.queue.filter((path) => !needSet.has(path));
    this.urgent = need.filter((path) => !this.inFlight.has(path)).concat(this.urgent.filter((path) => !needSet.has(path)));
    return new Promise<void>((resolve) => {
      const waiter: PackWaiter = { need: needSet, total: need.length, onProgress, resolve };
      this.waiters.push(waiter);
      onProgress?.(0, waiter.total);
      this.pump();
    });
  }

  progress(): { doneBytes: number; totalBytes: number } {
    return { doneBytes: this.doneBytes, totalBytes: this.totalBytes };
  }

  isComplete(): boolean {
    return !!this.manifest && this.queue.length === 0 && this.urgent.length === 0 && this.inFlight.size === 0;
  }

  private pump(): void {
    if (!this.cache) {
      return;
    }
    // 紧急(有人在等)不受暂停影响、并发拉满;纯后台受暂停 / 低并发限制
    const limit = this.urgent.length > 0 ? URGENT_CONCURRENCY : (this.started && !this.paused ? BACKGROUND_CONCURRENCY : 0);
    while (this.running < limit) {
      const next = this.urgent.shift() ?? (this.urgent.length === 0 && this.running < BACKGROUND_CONCURRENCY && this.started && !this.paused ? this.queue.shift() : undefined);
      if (!next) {
        break;
      }
      this.running += 1;
      this.inFlight.add(next);
      void this.fetchOne(next).then((ok) => {
        this.running -= 1;
        this.inFlight.delete(next);
        if (ok) {
          this.have.add(next);
        } else {
          this.failed.add(next);
        }
        this.doneBytes += this.sizeOf.get(next) ?? 0;
        this.settle(next);
        if (this.isComplete() && this.failed.size === 0) {
          markFullPackCached();
        }
        this.pump();
      });
    }
  }

  private settle(path: string): void {
    for (const waiter of this.waiters.slice()) {
      if (waiter.need.delete(path)) {
        waiter.onProgress?.(waiter.total - waiter.need.size, waiter.total);
        if (waiter.need.size === 0) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve();
        }
      }
    }
  }

  private async fetchOne(path: string): Promise<boolean> {
    for (let attempt = 0; attempt < FULL_PACK_RETRY; attempt += 1) {
      try {
        const response = await fetch(path, packFetchInit(path));
        if (response.ok && response.status === 200) {
          await this.cache!.put(path, response);
          return true;
        }
      } catch (error) {
        void error;
      }
    }
    return false;
  }
}

const packDownloader = new PackDownloader();

/** 开局包:manifest 前 core 个文件里本地缺的(旧清单没有 core 字段 = 全部)。 */
export function coreManifestFiles(manifest: TieredManifest, missing: Array<[string, number]>): Array<[string, number]> {
  const coreCount = manifest.core ?? manifest.files.length;
  const core = new Set(manifest.files.slice(0, coreCount).map(([path]) => path));
  return missing.filter(([path]) => core.has(path));
}

/** 启动:开局包下完后调用,登记清单 + 本地还缺的(含后台部分),进游戏后再 startBackgroundPack。 */
export async function initPackDownloader(manifest: TieredManifest): Promise<void> {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const missing = await missingManifestFiles(manifest);
  packDownloader.init(manifest, missing, cache);
  // 自验脚本(tools/qa/web_tier_check.py)读进度 / 暂停后台用
  (globalThis as unknown as { __lootchainPack?: PackDownloader }).__lootchainPack = packDownloader;
  if (missing.length === 0) {
    markFullPackCached();
  }
}

export function startBackgroundPack(): void {
  packDownloader.start();
}

/** 战斗等重负载场景暂停后台下载(不抢网络 / 解码);有人在 ensure 等的照常下。 */
export function setBackgroundPackPaused(paused: boolean): void {
  packDownloader.setPaused(paused);
}

/**
 * 进入某块(地图 / 界面 / 战斗)前确保它用到的素材文件都已下到本地:prefixes = 资源路径前缀(如 'ui/forge'、'spine/hero/npc_1036')。
 * 没有清单(预览 / 原生 / 旧部署)直接 resolve。onProgress 给加载页显示进度。
 */
export function ensurePackResources(prefixes: readonly string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  if (!packDownloader.hasManifest() || prefixes.length === 0) {
    return Promise.resolve();
  }
  return packDownloader.ensure((res) => prefixes.some((prefix) => res.startsWith(prefix)), onProgress);
}

/** 后台下载顺序按玩家调整(老玩家:自己的英雄 / 已解锁地图 / 常用功能页先下);返回挪到前面的文件数。 */
export function prioritizeBackgroundPack(prefixes: readonly string[]): number {
  if (!packDownloader.hasManifest() || prefixes.length === 0) {
    return 0;
  }
  return packDownloader.prioritize((res) => prefixes.some((prefix) => res.startsWith(prefix)));
}

/** 同步判断:这些前缀的素材是否都已在本地(没有清单 = 视为都在)。 */
export function packResourcesReady(prefixes: readonly string[]): boolean {
  if (!packDownloader.hasManifest() || prefixes.length === 0) {
    return true;
  }
  return packDownloader.missingFor((res) => prefixes.some((prefix) => res.startsWith(prefix))).length === 0;
}

/** 网页分层下载还没全部下完(没有清单 = false)。 */
export function packDownloadPending(): boolean {
  return packDownloader.hasManifest() && !packDownloader.isComplete();
}

/** 后台下载总进度(设置页 / 调试显示)。 */
export function backgroundPackProgress(): { doneBytes: number; totalBytes: number; complete: boolean } {
  return { ...packDownloader.progress(), complete: packDownloader.isComplete() };
}
