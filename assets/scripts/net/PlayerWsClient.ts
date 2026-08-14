/**
 * 玩家通知长连接客户端(docs/27 长连接通知通道)。
 * 只收服务端推送 {type,data,ts},游戏行为仍走 REST;上行仅心跳 ping。
 * 断线自动重连(1s→2s→5s→10s 退避),心跳 30s,token 变化自动重握手。
 */
export type PlayerWsListener = (data: Record<string, unknown>) => void;

const HEARTBEAT_MS = 30_000;
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];

export class PlayerWsClient {
  private socket: WebSocket | null = null;
  private connectedToken: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
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
        this.startHeartbeat();
      };
      socket.onmessage = (event) => this.dispatch(String(event.data ?? ''));
      socket.onclose = () => this.scheduleReconnect();
      socket.onerror = () => {
        // onclose 会跟着触发,重连统一在 onclose 里排
      };
    } catch (error) {
      void error;
      this.scheduleReconnect();
    }
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
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send('{"type":"ping"}');
        } catch (error) {
          void error;
        }
      }
    }, HEARTBEAT_MS);
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
