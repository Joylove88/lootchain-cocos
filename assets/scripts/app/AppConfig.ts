/**
 * 安卓 / 原生包的服务器地址(2026-10-14 安卓第一阶段):原生没有网页地址可推,按下面顺序取——
 * 1) 本机存储 `lootchain.apiBaseUrl`(调试时可改指局域网 / 测试服,不用重新打包);
 * 2) NATIVE_API_BASE_URL(正式包填正式域名,第三阶段出正式包前改);
 * 调试默认 http://localhost:8081:手机执行 `adb reverse tcp:8081 tcp:8081` 后,手机的 localhost:8081 就是电脑上的游戏服。
 */
const NATIVE_API_BASE_URL = 'http://localhost:8081';
const NATIVE_API_BASE_KEY = 'lootchain.apiBaseUrl';

function resolveNativeApiBaseUrl(): string {
  try {
    const store = (globalThis as { localStorage?: { getItem(key: string): string | null } }).localStorage;
    const override = store?.getItem(NATIVE_API_BASE_KEY);
    if (override && /^https?:\/\//.test(override)) {
      return override.replace(/\/$/, '');
    }
  } catch (error) {
    void error;
  }
  return NATIVE_API_BASE_URL;
}

function resolveDefaultApiBaseUrl(): string {
  const runtimeLocation = (globalThis as { location?: { hostname?: string; protocol?: string; host?: string } }).location;
  const hostname = runtimeLocation?.hostname;
  if (!hostname) {
    // 原生包(安卓)没有 location.hostname
    return resolveNativeApiBaseUrl();
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8081';
  }

  // 生产(https 站点):同域反代——/api 与 /ws 由站点反代转发到 game 服务,
  // WS 地址由 apiBaseUrl 的 http→ws 替换派生,同域自然升级 wss(docs/31 部署方案)。
  if (runtimeLocation.protocol === 'https:' && runtimeLocation.host) {
    return `https://${runtimeLocation.host}`;
  }

  // 局域网/裸 IP 联调:直连同主机 8081。
  return `http://${hostname}:8081`;
}

// Cocos 前端运行配置。预览环境默认连接同主机 8081 的 game service。
export const AppConfig = {
  apiBaseUrl: resolveDefaultApiBaseUrl(),
  defaultDevUserId: 1,
  requestTimeoutMs: 15000,
  supportedTargets: ['cocos-web'] as const,
};
