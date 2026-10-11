import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';

/** 大厅英雄队列只读状态。 */
export class LobbyHeroRosterState {
  private panelState: LobbyHeroRosterPanelState = {
    loading: false,
    loaded: false,
    error: '',
    heroes: [],
    heroClassOptions: [],
  };
  private revision = 0;

  get version(): number {
    return this.revision;
  }

  /** 升级 / 升星接口返回后本地先落账(等级 / 战力),让按钮与特效不用等五次回读(2026-10-11)。 */
  patchHero(heroId: number, patch: Partial<Pick<LobbyHeroItemVO, 'level' | 'power' | 'star'>>): void {
    const hero = this.panelState.heroes.find((item) => item.id === heroId);
    if (!hero) {
      return;
    }
    Object.assign(hero, patch);
    this.revision += 1;
  }

  reset(): void {
    // 切换账号时清空上一位玩家的英雄队列，避免主角卡短暂串号显示。
    this.panelState = {
      loading: false,
      loaded: false,
      error: '',
      heroes: [],
      heroClassOptions: [],
    };
    this.revision += 1;
  }

  startLoading(): void {
    this.panelState = {
      ...this.panelState,
      loading: true,
      error: '',
    };
    this.revision += 1;
  }

  applyLoaded(heroes: LobbyHeroItemVO[], heroClassOptions: string[] = []): void {
    this.panelState = {
      loading: false,
      loaded: true,
      error: '',
      heroes: [...heroes],
      heroClassOptions: [...heroClassOptions],
    };
    this.revision += 1;
  }

  applyError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.panelState = {
      loading: false,
      loaded: false,
      error: message || '英雄队列读取失败',
      heroes: [],
      heroClassOptions: [],
    };
    this.revision += 1;
  }

  snapshot(): LobbyHeroRosterPanelState {
    return {
      ...this.panelState,
      heroes: [...this.panelState.heroes],
      heroClassOptions: [...this.panelState.heroClassOptions],
    };
  }
}
