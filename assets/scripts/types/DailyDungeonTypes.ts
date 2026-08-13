/** 每日材料副本摘要(P7b)。全部只读展示;挑战/结算复用战斗接口(stageCode=DAILY_*)。 */
export interface DailyDungeonRewardVO {
  resourceType: string;
  resourceCode: string;
  resourceName: string;
  amount: number;
}

export interface DailyDungeonTierVO {
  tier: number;
  stageCode: string;
  unlocked: boolean;
  unlockStageCode: string;
  rewards: DailyDungeonRewardVO[];
}

export interface DailyDungeonThemeVO {
  code: string;
  name: string;
  /** 开放日(1=周一..7=周日)。 */
  openDays: number[];
  openToday: boolean;
  usedToday: number;
  timesPerDay: number;
  tiers: DailyDungeonTierVO[];
}

/** 圣晶矿脉状态(P金-1a):旧服务端无此字段时为 null。 */
export interface CrystalMineVO {
  unlocked: boolean;
  dailyBudgetTotal: number;
  dailyUsedTotal: number;
  myTodayDrop: number;
  myDailyCap: number;
}

export interface DailyDungeonSummaryVO {
  todayDayOfWeek: number;
  staminaCost: number;
  themes: DailyDungeonThemeVO[];
  crystalMine: CrystalMineVO | null;
}

// ── 圣晶输出周榜(P金-1b) ──

export interface CrystalRankEntryVO {
  rank: number;
  userId: number;
  displayName: string;
  score: number;
}

export interface CrystalRankTierVO {
  rankFrom: number;
  rankTo: number;
  crystalAmount: number;
  rewardsDesc: string;
}

export interface CrystalRankLastWeekVO {
  weekKey: string;
  myRank: number;
  myScore: number;
  crystalAmount: number;
  rewardsDesc: string;
}

export interface CrystalRankSummaryVO {
  weekKey: string;
  secondsToWeekEnd: number;
  myTodayScore: number;
  myWeekScore: number;
  myRank: number;
  topList: CrystalRankEntryVO[];
  rewardTiers: CrystalRankTierVO[];
  lastWeek: CrystalRankLastWeekVO | null;
}

export interface LobbyCrystalRankState {
  loading: boolean;
  error: string;
  summary: CrystalRankSummaryVO | null;
  version: number;
}

export interface LobbyDailyDungeonPanelState {
  loading: boolean;
  error: string;
  summary: DailyDungeonSummaryVO | null;
  version: number;
}

// ── 圣晶熔炉:圣晶兑代币(P金-2,链下账本;链上发放留 P金-3) ──

export interface TokenWalletVO {
  id: number | null;
  chainType: string;
  walletAddress: string;
  bindStatus: number;
}

export interface TokenWithdrawOrderVO {
  orderNo: string;
  crystalAmount: number;
  feeAmount: number;
  tokenAmount: number;
  chainType: string;
  walletAddress: string;
  status: number;
  statusLabel: string;
  chainTxHash: string | null;
  createTime: string;
}

export interface TokenExchangeSummaryVO {
  tokenSymbol: string;
  crystalPerToken: number;
  feeRate: number;
  minCrystal: number;
  sacredCrystal: number;
  eligible: boolean;
  ineligibleReason: string | null;
  walletBound: boolean;
  todayExchangedToken: number;
  dailyTokenCap: number;
  autoPassToken: number;
  recentOrders: TokenWithdrawOrderVO[];
}

// 熔炉弹窗状态:表单值(链/地址/选中档位/自定义额)存于此,面板重建时回种,避免输入丢失。
export interface LobbyTokenFurnaceState {
  open: boolean;
  loading: boolean;
  error: string;
  summary: TokenExchangeSummaryVO | null;
  version: number;
  bindOpen: boolean;
  bindChain: 'TRON' | 'BSC';
  bindAddress: string;
  selectedCrystal: number | null;
  customCrystal: string;
  submitting: boolean;
  actionMessage: string;
  actionError: boolean;
}
