import { resources, SpriteFrame } from 'cc';
import type { VideoClip } from 'cc';
import { LOBBY_POSTER_PATH } from './LobbyBackgroundController';
import type { LobbyLoadingState } from './LobbyLoadingRenderer';


export interface LobbyLoadingFlowHost {
  showLobbyLoadingView(): void;
  refreshLobbyLoadingView(): void;
  setLobbyBackgroundResources(posterFrame: SpriteFrame, videoClip: VideoClip | null): void;
  enterLobbyView(): void;
  /** 大厅已在显示时补画背景(海报晚到)。 */
  refreshLobbyBackground(): void;
}

/**
 * 登录成功 → 进大厅。
 *
 * 2026-10-07 用户「卡在这个加载页不动了,这个加载页有用吗?没有就移除」:原先这里有一页「资源加载中」,只为读一张大厅海报;
 * 海报早在启动预载 / 整包缓存里,这一页纯属多余,而且进大厅一旦抛错就永远停在 100%。现在直接进大厅:
 * 海报已在内存就同步铺上;不在就先用深色底进大厅,读到后补画背景(不再有加载页)。
 */
export class LobbyLoadingFlow {
  private loadingTicket = 0;
  private currentState: LobbyLoadingState = {
    progress: 0,
    message: '准备进入游戏...',
    error: '',
  };

  constructor(private readonly host: LobbyLoadingFlowHost) {}

  get state(): LobbyLoadingState {
    return this.currentState;
  }

  start(_tokenName: string): void {
    const ticket = ++this.loadingTicket;
    const posterPath = `${LOBBY_POSTER_PATH}/spriteFrame`;
    const cached = resources.get(posterPath, SpriteFrame);
    if (cached) {
      this.host.setLobbyBackgroundResources(cached, null);
    }
    this.host.enterLobbyView();
    if (cached) {
      return;
    }
    resources.load(posterPath, SpriteFrame, (error, frame) => {
      if (error || !frame) {
        console.warn('[LootChain] lobby poster load failed', error);
        return;
      }
      if (!this.isCurrentTicket(ticket)) {
        return;
      }
      this.host.setLobbyBackgroundResources(frame, null);
      this.host.refreshLobbyBackground();
    });
  }

  retry(tokenName: string): void {
    this.start(tokenName);
  }

  cancel(): void {
    // 根节点销毁或切换流程时让当前异步回调失效。
    this.loadingTicket += 1;
  }

  private isCurrentTicket(ticket: number): boolean {
    return ticket === this.loadingTicket;
  }
}
