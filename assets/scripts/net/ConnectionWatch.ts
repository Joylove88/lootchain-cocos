/**
 * 连接状态监视(2026-10-31 用户:「网络不好 / 没网时显示连接服务器中,不能有其他操作」)。
 * 三路信号合判「该不该挡住操作」:
 * - 浏览器 / 系统报离线(navigator.onLine=false、offline 事件)→ 立即算断;
 * - 长连接:本会话连上过一次之后又断开,超过 WS_GRACE_MS 还没重连上 → 算断(从没连上过的不算,防长连接被代理挡时整局卡死);
 * - REST 请求网络层失败(连不上 / 超时 / 网关 502~504)→ 算断,每 PROBE_MS 发一次探测请求,任一请求回来即恢复。
 * 只出判断,不画界面;界面由游戏根按 blocked() 挂「连接服务器中」遮罩。
 */
const WS_GRACE_MS = 2_500;
const PROBE_MS = 3_000;

export class ConnectionWatch {
  private online = true;
  private wsOpen = false;
  private wsEverOpen = false;
  private wsDownSince = 0;
  private httpDown = false;
  private nextProbeAt = 0;

  /** probe = 一个轻量 REST 请求(结果经 HttpClient.onNetworkStatus 回到 setHttp,这里不看返回值)。 */
  constructor(private readonly probe: () => Promise<unknown>, private readonly onOnline: () => void) {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.online = false;
    }
    window.addEventListener('offline', () => {
      this.online = false;
    });
    window.addEventListener('online', () => {
      this.online = true;
      // 网络回来:长连接别等退避,立刻重连;REST 立刻探一次
      this.nextProbeAt = 0;
      this.onOnline();
    });
  }

  setWs(open: boolean): void {
    if (open) {
      this.wsOpen = true;
      this.wsEverOpen = true;
      this.wsDownSince = 0;
      // 长连接能连上 = 服务端可达
      this.httpDown = false;
      return;
    }
    if (this.wsOpen || this.wsDownSince === 0) {
      this.wsDownSince = Date.now();
    }
    this.wsOpen = false;
  }

  setHttp(reachable: boolean): void {
    if (reachable) {
      this.httpDown = false;
      return;
    }
    if (!this.httpDown) {
      this.httpDown = true;
      this.nextProbeAt = Date.now() + PROBE_MS;
    }
  }

  /** 登出:清掉长连接 / 请求状态(下个会话重新算「连上过」)。 */
  reset(): void {
    this.wsOpen = false;
    this.wsEverOpen = false;
    this.wsDownSince = 0;
    this.httpDown = false;
  }

  /** 当前是否离线(offline = 系统报无网;否则是连不上服务器)。 */
  state(now: number): 'ok' | 'offline' | 'unreachable' {
    if (!this.online) {
      return 'offline';
    }
    if (this.httpDown) {
      return 'unreachable';
    }
    if (this.wsEverOpen && !this.wsOpen && this.wsDownSince > 0 && now - this.wsDownSince >= WS_GRACE_MS) {
      return 'unreachable';
    }
    return 'ok';
  }

  /** 每帧调用:REST 判断为断时定时探测。 */
  tick(now: number): void {
    if (!this.httpDown || !this.online || now < this.nextProbeAt) {
      return;
    }
    this.nextProbeAt = now + PROBE_MS;
    this.probe().catch(() => undefined);
  }
}
