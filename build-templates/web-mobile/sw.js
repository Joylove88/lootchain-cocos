/*
 * LootChain 静态资源离线缓存(2026-09-17 起;2026-09-25 改为首次只下登录+大厅,其余用到才下载)。
 * 用到过的资源都经本文件写入 Cache Storage,二次访问直接读本地。
 *
 * 构建时本文件原样拷到 build/web-mobile/ 根目录,由游戏脚本 AssetOfflineCache.ts 注册。
 * 策略:
 * - 只接管同源 GET 的 /assets/ 与 /cocos-js/ 请求;index.html、src/ 等入口始终走网络,保证发版能生效。
 * - 文件名带 md5 后缀(构建开启 md5Cache,如 xxx.1a2b3.png):内容变了文件名就变,可放心"缓存优先、永不过期"。
 * - 不带 md5 的资源:网络优先,成功就刷新缓存;断网时才回落缓存,避免拿到旧文件。
 * - Range 请求(视频分段)与非 200 响应不入缓存,直接透传。
 */
const CACHE_NAME = 'lootchain-assets-v1';
const MANAGED_PATH = /\/(assets|cocos-js)\//;
const MD5_SUFFIX = /\.[0-9a-f]{5}\.[a-z0-9]+$/i;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('lootchain-assets-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !MANAGED_PATH.test(url.pathname)) {
    return;
  }
  const hashed = MD5_SUFFIX.test(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (hashed) {
      const hit = await cache.match(request);
      if (hit) {
        return hit;
      }
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.status === 200) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    } catch (error) {
      const fallback = await cache.match(request);
      if (fallback) {
        return fallback;
      }
      throw error;
    }
  })());
});
