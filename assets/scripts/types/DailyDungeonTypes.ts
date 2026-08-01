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

export interface DailyDungeonSummaryVO {
  todayDayOfWeek: number;
  staminaCost: number;
  themes: DailyDungeonThemeVO[];
}

export interface LobbyDailyDungeonPanelState {
  loading: boolean;
  error: string;
  summary: DailyDungeonSummaryVO | null;
  version: number;
}
