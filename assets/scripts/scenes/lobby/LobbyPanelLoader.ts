/**
 * 大厅面板通用只读加载器(2026-08-12 复用重构批5)。
 * 收编 Codex/Notice/Adventure/HeroRoster 四份同构加载器(loading/loaded 守卫 + ticket 竞态
 * + 前后各刷一次 HUD),并把 HeroRoster 独有的"in-flight 请求合并"下放给所有面板:
 * 多个入口同时触发 load 时复用同一个请求,避免拿到中间态。
 * Bag 通过组合本类实现主加载(来源查询/选中态等领域逻辑留在 LobbyBagLoader);
 * Profile 因 userId 键控契约不同,保持独立实现。
 */
export interface LobbyPanelLoaderHost {
  isLobbyViewActive(): boolean;
  refreshLobbyOverlay(): void;
}

/** 各面板 State 类的公共面(LobbyCodexState/LobbyNoticeState/... 天然满足)。 */
export interface LobbyPanelStateLike<TSnapshot> {
  readonly version: number;
  snapshot(): TSnapshot;
  reset(): void;
  startLoading(): void;
  applyError(error: unknown): void;
}

export class LobbyPanelLoader<TSnapshot extends { loading: boolean; loaded: boolean }, TData> {
  private loadTicket = 0;
  private inFlightLoad: Promise<void> | null = null;

  constructor(
    private readonly state: LobbyPanelStateLike<TSnapshot>,
    /** 拉取数据(内部可并发多接口、自带兜底);apply 负责按各 State 的参数形态写入。 */
    private readonly fetchData: () => Promise<TData>,
    private readonly applyData: (data: TData) => void,
    private readonly host: LobbyPanelLoaderHost,
    /** 告警日志标签,如 'lobby codex'。 */
    private readonly logLabel: string,
    /** 可选:apply 成功后的追加动作(仍在 ticket 守卫内),如背包选中项来源联动刷新。 */
    private readonly onLoaded?: () => void,
  ) {}

  get loading(): boolean {
    return this.state.snapshot().loading;
  }

  get loaded(): boolean {
    return this.state.snapshot().loaded;
  }

  get version(): number {
    return this.state.version;
  }

  cancel(): void {
    // 销毁场景或重新登录时让旧请求失效,避免慢响应覆盖新玩家状态。
    this.loadTicket += 1;
    this.inFlightLoad = null;
  }

  resetForLogin(): void {
    this.cancel();
    this.state.reset();
  }

  currentState(): TSnapshot {
    return this.state.snapshot();
  }

  async load(force = false): Promise<void> {
    if (this.loading && this.inFlightLoad) {
      return this.inFlightLoad;
    }
    if (this.loaded && !force) {
      return;
    }

    const ticket = this.nextTicket();
    this.state.startLoading();
    this.refreshIfActive();

    let loadPromise: Promise<void> | null = null;
    loadPromise = (async () => {
      try {
        const data = await this.fetchData();
        if (!this.isCurrentRequest(ticket)) {
          return;
        }
        this.applyData(data);
        this.onLoaded?.();
      } catch (error) {
        if (!this.isCurrentRequest(ticket)) {
          return;
        }
        this.state.applyError(error);
        console.warn(`[LootChain] ${this.logLabel} load failed:`, error);
      } finally {
        if (this.inFlightLoad === loadPromise) {
          this.inFlightLoad = null;
        }
        if (this.isCurrentRequest(ticket)) {
          this.refreshIfActive();
        }
      }
    })();

    this.inFlightLoad = loadPromise;
    return loadPromise;
  }

  private nextTicket(): number {
    this.loadTicket += 1;
    return this.loadTicket;
  }

  private isCurrentRequest(ticket: number): boolean {
    return ticket === this.loadTicket;
  }

  private refreshIfActive(): void {
    if (this.host.isLobbyViewActive()) {
      this.host.refreshLobbyOverlay();
    }
  }
}
