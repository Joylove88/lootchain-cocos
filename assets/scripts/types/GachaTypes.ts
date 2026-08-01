import type { DateTimeString, DecimalValue } from './CommonTypes';

/** 抽卡池展示模型；当前 Cocos-only 阶段入口仍未开放。 */
export interface GachaPoolVO {
  id: number | null;
  poolCode: string;
  poolName: string;
  poolType: string;
  configVersion: number | null;
  pityGroupCode?: string | null;
  costType?: string | null;
  costCode?: string | null;
  singleCost?: DecimalValue | null;
  tenCost?: DecimalValue | null;
  primaryCostType?: string | null;
  primaryCostCode?: string | null;
  primarySingleCost?: DecimalValue | null;
  primaryTenCost?: DecimalValue | null;
  backupCostType?: string | null;
  backupCostCode?: string | null;
  backupSingleCost?: DecimalValue | null;
  backupTenCost?: DecimalValue | null;
  startTime?: DateTimeString | null;
  endTime?: DateTimeString | null;
  status: number;
  displayType?: string | null;
  sortOrder?: number | null;
  tabTitle?: string | null;
  tabSubtitle?: string | null;
  logoAsset?: string | null;
  tabLogoAsset?: string | null;
  themeColor?: string | null;
  badgeText?: string | null;
  locked?: boolean | null;
  drawEnabled?: boolean | null;
  previewOnly?: boolean | null;
  centerSpineResource?: string | null;
  centerSpineUuid?: string | null;
  centerSpineSkin?: string | null;
  centerIntroAnimation?: string | null;
  centerIdleAnimation?: string | null;
  backgroundAsset?: string | null;
  rateNote?: string | null;
  recordNote?: string | null;
  exchangeNote?: string | null;
  guaranteeNote?: string | null;
  buttonSingleText?: string | null;
  buttonTenText?: string | null;
  buttonDisabledReason?: string | null;
  noticeText?: string | null;
}

export interface GachaPoolDetailVO {
  pool: GachaPoolVO;
  rates: GachaPoolRateVO[];
  items: GachaPoolItemVO[];
  pityConfigs: GachaPoolPityConfigVO[];
  duplicateConfigs: GachaPoolDuplicateConfigVO[];
  ticketConfigs: GachaPoolTicketConfigVO[];
}

export interface GachaPoolRateVO {
  id: number;
  rarity: string;
  rate: DecimalValue;
  status: number;
}

export interface GachaPoolItemVO {
  id: number;
  rewardType: string;
  rewardCode: string;
  rarity: string;
  weight: number;
  upFlag: number;
  limitedFlag: number;
  status: number;
}

export interface GachaPoolPityConfigVO {
  id: number;
  rarity: string;
  pityCount: number;
  resetRarity?: string | null;
  status: number;
}

export interface GachaPoolDuplicateConfigVO {
  id: number;
  rarity: string;
  fragmentCount: number;
  status: number;
}

export interface GachaPoolTicketConfigVO {
  id: number;
  ticketItemCode: string;
  singleTicketCount: number;
  tenTicketCount: number;
  status: number;
}

export interface GachaPityVO {
  poolCode: string;
  pityGroupCode: string;
  rarity: string;
  counter: number;
  pityCount: number;
  totalCount: number;
}

export interface GachaDrawDTO {
  poolCode: string;
  requestId: string;
  drawCount: 1 | 10;
  useTicket?: boolean;
  paymentMode?: 'AUTO' | 'TICKET' | 'CURRENCY';
}

export interface GachaDrawItemVO {
  rewardType: string;
  rewardCode: string;
  rewardName: string;
  rarity: string;
  up: boolean;
  duplicate: boolean;
  grantNo?: string | null;
  fragmentCount?: number | null;
  /** 单次奖励数量(材料按稀有度多发,2026-07-22);历史记录可能为空按 1 处理。 */
  amount?: number | null;
}

export interface GachaDrawResultVO {
  drawNo: string;
  poolCode: string;
  configVersion: number;
  items: GachaDrawItemVO[];
}

export interface GachaDrawLogVO {
  id: number;
  drawNo: string;
  userId: number;
  requestId: string;
  poolCode: string;
  configVersion: number;
  drawCount: number;
  costType: string;
  costCode: string;
  costAmount: DecimalValue;
  createTime: DateTimeString;
}
