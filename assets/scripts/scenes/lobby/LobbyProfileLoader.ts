import type { PlayerProfileApi } from '../../api/PlayerProfileApi';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { LobbyProfileState } from './LobbyProfileState';

export interface LobbyProfileLoaderHost {
  isLobbyViewActive(): boolean;
  refreshLobbyOverlay(): void;
  /** 玩家等级涨了(docs/08 升级礼包走邮件):回读邮件 / 红点。 */
  onPlayerLevelUp?(before: number, after: number): void;
}

/**
 * 只读大厅资料加载器。
 *
 * 负责调用玩家大厅资料接口并更新 LobbyProfileState；加载完成后只刷新 HUD 覆盖层，
 * 不触发整页大厅重绘，避免背景视频或 poster 闪烁。
 */
export class LobbyProfileLoader {
  private readonly profileState: LobbyProfileState;
  private loadTicket = 0;

  constructor(
    private readonly profileApi: PlayerProfileApi,
    defaultUserId: number,
    private readonly host: LobbyProfileLoaderHost,
  ) {
    this.profileState = new LobbyProfileState(defaultUserId);
  }

  get loading(): boolean {
    return this.profileState.loading;
  }

  get error(): string {
    return this.profileState.error;
  }

  cancel(): void {
    // 场景销毁或重新登录时让旧请求失效，避免异步回调刷新已经离开的大厅。
    this.loadTicket += 1;
  }

  resetForLogin(userId: number): void {
    this.cancel();
    this.profileState.resetForLogin(userId);
  }

  currentProfile(): PlayerLobbyProfileVO {
    return this.profileState.currentProfile();
  }

  async load(userId: number): Promise<void> {
    const ticket = this.nextTicket();
    if (!this.profileState.isCurrentUser(userId)) {
      return;
    }
    this.profileState.startLoading();
    if (this.host.isLobbyViewActive()) {
      this.host.refreshLobbyOverlay();
    }
    const levelBefore = this.profileState.currentProfile().playerLevel ?? 0;
    try {
      const profile = await this.profileApi.lobbyProfile();
      if (!this.isCurrentRequest(ticket, userId)) {
        return;
      }
      // 如果用户已经重新登录，旧请求返回的数据直接丢弃。
      if (!this.profileState.applyLoadedProfile(userId, profile)) {
        return;
      }
      const levelAfter = profile.playerLevel ?? 0;
      if (levelBefore > 0 && levelAfter > levelBefore) {
        this.host.onPlayerLevelUp?.(levelBefore, levelAfter);
      }
    } catch (error) {
      if (!this.isCurrentRequest(ticket, userId)) {
        return;
      }
      // 错误也要带 userId 校验，防止旧请求把新用户状态写坏。
      if (!this.profileState.applyLoadError(userId, error)) {
        return;
      }
      console.warn('[LootChain] lobby profile load failed:', error);
    } finally {
      if (!this.isCurrentRequest(ticket, userId)) {
        return;
      }
      if (!this.profileState.finishLoading(userId)) {
        return;
      }
      if (this.host.isLobbyViewActive()) {
        this.host.refreshLobbyOverlay();
      }
    }
  }

  private nextTicket(): number {
    this.loadTicket += 1;
    return this.loadTicket;
  }

  private isCurrentRequest(ticket: number, userId: number): boolean {
    return ticket === this.loadTicket && this.profileState.isCurrentUser(userId);
  }
}
