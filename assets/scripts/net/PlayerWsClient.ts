/**
 * 玩家通知长连接客户端(docs/27 长连接通知通道)。
 * 收服务端推送 {type,data,ts};上行:心跳 ping + 野外坐标 pos / warp(docs/55,send);领奖等游戏行为仍走 REST。
 * 断线自动重连(1s→2s→3s→5s 退避),心跳 10s(发出 8s 内没任何回包 = 连接已死,主动断开重连),token 变化自动重握手。
 * onStatus 报连上 / 断开(连接监视据此挡操作,见 ConnectionWatch)。
 */
export type PlayerWsListener = (data: Record<string, unknown>) => void;

const HEARTBEAT_MS = 10_000;
/** 心跳 / 探测发出后这么久没有任何回包 = 连接已死(手机断网时 onclose 常常迟迟不来)。 */
const PONG_TIMEOUT_MS = 8_000;
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 3_000, 5_000];

export class PlayerWsClient {
  private socket: WebSocket | null = null;
  private connectedToken: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
  /** 等回包起点(0 = 不在等);发 ping 时置上,收到任何消息清零。 */
  private awaitingSince = 0;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  /** 连上 / 断开回调(手动 disconnect 不报)。 */
  onStatus: ((open: boolean) => void) | null = null;
  private readonly listeners = new Map<string, PlayerWsListener[]>();

  constructor(private readonly resolveWsUrl: () => string | null) {}

  /** 订阅某类型推送;重复调用追加监听。 */
  on(type: string, listener: PlayerWsListener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  /** 幂等连接:已连同一 token 则跳过;token 变化(重登)则重握手。 */
  connect(): void {
    const url = this.resolveWsUrl();
    if (!url) {
      return;
    }
    if (this.socket && this.connectedToken === url && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }
    this.manuallyClosed = false;
    this.teardownSocket();
    this.connectedToken = url;
    try {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onopen = () => {
        this.reconnectAttempt = 0;
        this.awaitingSince = 0;
        this.startHeartbeat();
        this.onStatus?.(true);
      };
      socket.onmessage = (event) => {
        this.awaitingSince = 0;
        this.dispatch(String(event.data ?? ''));
      };
      socket.onclose = () => {
        this.onStatus?.(false);
        this.scheduleReconnect();
      };
      socket.onerror = () => {
        // onclose 会跟着触发,重连统一在 onclose 里排
      };
    } catch (error) {
      void error;
      this.scheduleReconnect();
    }
  }

  /** 上行一条消息(docs/55 野外坐标);没连上就丢掉(坐标是高频增量,断线期间的丢了不补)。 */
  send(message: Record<string, unknown>): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      void error;
      return false;
    }
  }

  /** 立即重连(网络恢复时调用):不等退避。 */
  reconnectNow(): void {
    if (this.manuallyClosed || !this.connectedToken) {
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.probe();
      return;
    }
    this.reconnectAttempt = 0;
    this.teardownSocket();
    this.connectedToken = null;
    this.connect();
  }

  /** 探一下连接是否还活着(REST 请求失败时调用):发 ping,8 秒内没回包就断开重连。 */
  probe(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.awaitingSince > 0) {
      return;
    }
    this.sendPing();
    if (this.probeTimer !== null) {
      clearTimeout(this.probeTimer);
    }
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      this.checkAlive();
    }, PONG_TIMEOUT_MS + 100);
  }

  /** 登出/退出时调用:停止重连并关闭。 */
  disconnect(): void {
    this.manuallyClosed = true;
    this.connectedToken = null;
    this.teardownSocket();
  }

  private dispatch(raw: string): void {
    if (!raw || raw.length > 64_000) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (!type || type === 'pong') {
        return;
      }
      const data = parsed.data && typeof parsed.data === 'object' ? (parsed.data as Record<string, unknown>) : {};
      for (const listener of this.listeners.get(type) ?? []) {
        try {
          listener(data);
        } catch (error) {
          void error; // 单个监听异常不影响其它
        }
      }
    } catch (error) {
      void error; // 非 JSON 消息忽略
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.checkAlive()) {
        return;
      }
      if (this.awaitingSince === 0) {
        this.sendPing();
      }
    }, HEARTBEAT_MS);
  }

  private sendPing(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send('{"type":"ping"}');
        this.awaitingSince = Date.now();
      } catch (error) {
        void error;
      }
    }
  }

  /** 等回包超时 = 连接已死:拆掉、报断开、排重连;返回连接是否还算活着。 */
  private checkAlive(): boolean {
    if (this.awaitingSince === 0 || Date.now() - this.awaitingSince < PONG_TIMEOUT_MS) {
      return true;
    }
    this.awaitingSince = 0;
    this.teardownSocket();
    this.onStatus?.(false);
    this.scheduleReconnect();
    return false;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.stopHeartbeat();
    if (this.manuallyClosed || this.reconnectTimer !== null) {
      return;
    }
    const delay = RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // token 可能已变化(重登),connect 会用最新 url 重握手。
      this.connectedToken = null;
      this.connect();
    }, delay);
  }

  private teardownSocket(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch (error) {
        void error;
      }
    }
  }
}
