import type { LobbyAdventurePanelState, LobbyAdventureVO } from '../../types/LobbyAdventureTypes';

/** 大厅冒险只读状态。 */
export class LobbyAdventureState {
  private panelState: LobbyAdventurePanelState = {
    loading: false,
    loaded: false,
    error: '',
    adventure: null,
  };
  private revision = 0;

  get version(): number {
    return this.revision;
  }

  reset(): void {
    // 切换账号时清空上一位玩家的主线推荐信息，避免短暂串号显示。
    this.panelState = {
      loading: false,
      loaded: false,
      error: '',
      adventure: null,
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

  applyLoaded(adventure: LobbyAdventureVO): void {
    this.panelState = {
      loading: false,
      loaded: true,
      error: '',
      adventure,
    };
    this.revision += 1;
  }

  applyError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.panelState = {
      loading: false,
      loaded: false,
      error: message || '爬塔主线读取失败',
      adventure: null,
    };
    this.revision += 1;
  }

  snapshot(): LobbyAdventurePanelState {
    return {
      ...this.panelState,
      adventure: this.panelState.adventure ? cloneAdventure(this.panelState.adventure) : null,
    };
  }
}

function cloneAdventure(adventure: LobbyAdventureVO): LobbyAdventureVO {
  return {
    ...adventure,
    guardrails: [...adventure.guardrails],
    chapters: adventure.chapters.map((chapter) => ({
      ...chapter,
      stages: chapter.stages.map((stage) => ({
        ...stage,
        rewardPreview: [...stage.rewardPreview],
      })),
    })),
  };
}
