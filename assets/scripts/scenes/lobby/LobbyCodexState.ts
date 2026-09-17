import type {
  LobbyCodexPanelState,
  LobbyCodexRarityFilter,
  LobbyCodexSummaryVO,
} from '../../types/LobbyCodexTypes';

function emptyState(): LobbyCodexPanelState {
  return {
    loading: false,
    loaded: false,
    error: '',
    total: 0,
    ownedCount: 0,
    claimableCount: 0,
    milestones: [],
    items: [],
    filter: 'ALL',
    unownedOnly: false,
    selectedHeroCode: null,
    selectedMilestone: null,
    claiming: null,
    claimFx: null,
  };
}

/** 大厅图鉴状态(2026-09-15):服务端汇总 + 页内 UI 态(页签/未收集开关/详情弹框/领取中)。 */
export class LobbyCodexState {
  private panelState: LobbyCodexPanelState = emptyState();
  private revision = 0;

  get version(): number {
    return this.revision;
  }

  reset(): void {
    // 切换账号时清掉上一位玩家的图鉴拥有状态,避免短暂串号展示。
    this.panelState = emptyState();
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

  applyLoaded(summary: LobbyCodexSummaryVO): void {
    const items = summary.items.slice(0, 80);
    const selectedHeroCode = this.panelState.selectedHeroCode;
    this.panelState = {
      ...this.panelState,
      loading: false,
      loaded: true,
      error: '',
      total: summary.total,
      ownedCount: summary.ownedCount,
      claimableCount: summary.claimableCount,
      milestones: [...summary.milestones],
      items,
      // 弹框里的英雄若刷新后不存在(配置下线)则自动关闭。
      selectedHeroCode: selectedHeroCode && items.some((item) => item.heroCode === selectedHeroCode) ? selectedHeroCode : null,
    };
    this.revision += 1;
  }

  applyError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.panelState = {
      ...this.panelState,
      loading: false,
      loaded: false,
      error: message || '图鉴读取失败',
      items: [],
      milestones: [],
      selectedHeroCode: null,
      selectedMilestone: null,
    };
    this.revision += 1;
  }

  setFilter(filter: LobbyCodexRarityFilter): void {
    if (this.panelState.filter === filter) {
      return;
    }
    this.panelState = { ...this.panelState, filter };
    this.revision += 1;
  }

  toggleUnownedOnly(): void {
    this.panelState = { ...this.panelState, unownedOnly: !this.panelState.unownedOnly };
    this.revision += 1;
  }

  selectHero(heroCode: string | null): void {
    this.panelState = { ...this.panelState, selectedHeroCode: heroCode, selectedMilestone: null };
    this.revision += 1;
  }

  selectMilestone(targetCount: number | null): void {
    this.panelState = { ...this.panelState, selectedMilestone: targetCount, selectedHeroCode: null };
    this.revision += 1;
  }

  setClaiming(key: string | null): void {
    this.panelState = { ...this.panelState, claiming: key };
    this.revision += 1;
  }

  setClaimFx(fx: LobbyCodexPanelState['claimFx']): void {
    this.panelState = { ...this.panelState, claimFx: fx };
    this.revision += 1;
  }

  /** 渲染器播完特效后静默清票据(不 bump,避免再触发一次整页重绘)。 */
  clearClaimFx(): void {
    this.panelState = { ...this.panelState, claimFx: null };
  }

  snapshot(): LobbyCodexPanelState {
    return {
      ...this.panelState,
      items: [...this.panelState.items],
      milestones: [...this.panelState.milestones],
    };
  }
}
