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

