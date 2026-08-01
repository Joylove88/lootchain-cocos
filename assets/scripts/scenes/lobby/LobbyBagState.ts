import type { BagItemEntryVO, ItemTypeBagGroupVO, LobbyBagPanelState } from '../../types/BagTypes';

/** 大厅背包只读状态。 */
export class LobbyBagState {
  private panelState: LobbyBagPanelState = {
    loading: false,
    loaded: false,
    error: '',
    groups: [],
    selectedItemCode: null,
    sourceItemCode: null,
    sourceLoading: false,
    sourceDesc: '',
    sourceError: '',
  };
  private revision = 0;

  get version(): number {
    return this.revision;
  }

  reset(): void {
    // 切换账号时清空上一位玩家背包，避免道具数量短暂串号展示。
    this.panelState = {
      loading: false,
      loaded: false,
      error: '',
      groups: [],
      selectedItemCode: null,
      sourceItemCode: null,
      sourceLoading: false,
      sourceDesc: '',
      sourceError: '',
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

  applyLoaded(groups: ItemTypeBagGroupVO[]): void {
    const safeGroups = normalizeGroups(groups);
    const selectedStillExists = Boolean(this.panelState.selectedItemCode)
      && flatItems(safeGroups).some((item) => item.itemCode === this.panelState.selectedItemCode);
    const selectedItemCode = selectedStillExists
      ? this.panelState.selectedItemCode
      : flatItems(safeGroups)[0]?.itemCode ?? null;
    this.panelState = {
      loading: false,
      loaded: true,
      error: '',
      groups: safeGroups,
      selectedItemCode,
      sourceItemCode: selectedItemCode === this.panelState.sourceItemCode ? this.panelState.sourceItemCode : null,
      sourceLoading: false,
      sourceDesc: selectedItemCode === this.panelState.sourceItemCode ? this.panelState.sourceDesc : '',
      sourceError: '',
    };
    this.revision += 1;
  }

  applyError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.panelState = {
      ...this.panelState,
      loading: false,
      loaded: false,
      error: message || '背包读取失败',
      groups: [],
      selectedItemCode: null,
      sourceItemCode: null,
      sourceLoading: false,
      sourceDesc: '',
      sourceError: '',
    };
    this.revision += 1;
  }

  /** 清除选中(关闭详情弹窗):复用签名含 selectedItemCode,必须走状态而非只销毁节点,否则同物品二次点击命中复用不再弹框。 */
  clearSelection(): boolean {
    if (this.panelState.selectedItemCode == null) {
      return false;
    }
    this.panelState = {
      ...this.panelState,
      selectedItemCode: null,
      sourceItemCode: null,
      sourceLoading: false,
      sourceDesc: '',
      sourceError: '',
    };
    return true;
  }

  selectItem(itemCode: string): boolean {
    const safeCode = itemCode.trim();
    const itemExists = flatItems(this.panelState.groups).some((item) => item.itemCode === safeCode);
    if (!safeCode || !itemExists) {
      return false;
    }
    if (this.panelState.selectedItemCode === safeCode) {
      return true;
    }
    this.panelState = {
      ...this.panelState,
      selectedItemCode: safeCode,
      sourceItemCode: null,
      sourceLoading: false,
      sourceDesc: '',
      sourceError: '',
    };
    this.revision += 1;
    return true;
  }

  startSourceLoading(itemCode: string): void {
    const safeCode = itemCode.trim();
    this.panelState = {
      ...this.panelState,
      selectedItemCode: safeCode,
      sourceItemCode: safeCode,
      sourceLoading: true,
      sourceDesc: '',
      sourceError: '',
    };
    this.revision += 1;
  }

  applySourceLoaded(itemCode: string, sourceDesc: string): void {
    const safeCode = itemCode.trim();
    if (this.panelState.sourceItemCode !== safeCode) {
      return;
    }
    this.panelState = {
      ...this.panelState,
      selectedItemCode: safeCode,
      sourceItemCode: safeCode,
      sourceLoading: false,
      sourceDesc: sourceDesc.trim() || '暂无来源说明。',
      sourceError: '',
    };
    this.revision += 1;
  }

  applySourceError(itemCode: string, error: unknown): void {
    const safeCode = itemCode.trim();
    if (this.panelState.sourceItemCode !== safeCode) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.panelState = {
      ...this.panelState,
      selectedItemCode: safeCode,
      sourceItemCode: safeCode,
      sourceLoading: false,
      sourceDesc: '',
      sourceError: message || '来源读取失败',
    };
    this.revision += 1;
  }

  snapshot(): LobbyBagPanelState {
    return {
      ...this.panelState,
      groups: this.panelState.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item })),
      })),
    };
  }
}

function normalizeGroups(groups: ItemTypeBagGroupVO[]): ItemTypeBagGroupVO[] {
  return (groups ?? [])
    .filter((group) => group && Array.isArray(group.items))
    .map((group) => ({
      itemType: group.itemType || 'UNKNOWN',
      itemTypeLabel: group.itemTypeLabel || group.itemType || '未分类',
      items: group.items
        .filter((item) => item && item.itemCode)
        .map((item) => ({ ...item }))
        .slice(0, 120),
    }))
    .filter((group) => group.items.length > 0);
}

function flatItems(groups: ItemTypeBagGroupVO[]): BagItemEntryVO[] {
  return groups.flatMap((group) => group.items);
}
