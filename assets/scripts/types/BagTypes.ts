import type { DateTimeString, DecimalValue } from './CommonTypes';

/** 背包条目展示模型；当前只做只读展示，不开放使用/出售。 */
export interface BagItemEntryVO {
  bagId: number;
  itemCode: string;
  itemName: string;
  itemType: string;
  rarity: string;
  itemCount: number;
  expireTime?: DateTimeString | null;
  maxStack: number;
  sellGold: DecimalValue;
  useEffectType?: string | null;
  /** 用途文案(item_template.use_desc,配置表直读);老数据缺失回退 useEffectType。 */
  useDesc?: string | null;
}

export interface ItemTypeBagGroupVO {
  itemType: string;
  itemTypeLabel: string;
  items: BagItemEntryVO[];
}

export interface PlayerBagGroupedVO {
  groups: ItemTypeBagGroupVO[];
}

export interface ItemSourceVO {
  itemCode: string;
  sourceDesc: string;
}

/** 大厅背包全屏场景状态；所有字段仅用于前端只读展示。 */
export interface LobbyBagPanelState {
  loading: boolean;
  loaded: boolean;
  error: string;
  groups: ItemTypeBagGroupVO[];
  selectedItemCode: string | null;
  sourceItemCode: string | null;
  sourceLoading: boolean;
  sourceDesc: string;
  sourceError: string;
}
