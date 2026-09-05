function resolveDefaultApiBaseUrl(): string {
  const runtimeLocation = (globalThis as { location?: { hostname?: string; protocol?: string; host?: string } }).location;
  const hostname = runtimeLocation?.hostname;
  if (!hostname) {
    return 'http://localhost:8081';
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
