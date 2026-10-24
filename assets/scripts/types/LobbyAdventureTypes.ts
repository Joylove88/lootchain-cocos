/** 大厅爬塔关卡只读展示项；当前不代表真实战斗或结算配置。 */
export interface LobbyAdventureStageVO {
  stageCode: string;
  stageName: string;
  orderNo: number;
  unlocked: boolean;
  recommended: boolean;
  requiredLevel: number;
  recommendedPower: number;
  enemySummary: string;
  rewardPreview: string[];
  /** 首通奖励(与结算同源,带数量;docs/45 §13)。旧服务端缺省,回退 rewardPreview 名字列表。 */
  firstClearRewards?: LobbyAdventureRewardItemVO[];
  statusLabel: string;
  unlockHint: string;
  lockReasonCode: 'NONE' | 'LEVEL_REQUIRED' | 'PROGRESS_REQUIRED' | 'PHASE_LOCKED' | string;
  levelGap: number;
  requiredLevelNeedExp: number;
  expToRequiredLevel: number;
  nextGuidanceTitle: string;
  nextGuidanceText: string;
  growthSourceSummary: string;
  growthSourceStatus: string;
  growthSourceHint: string;
  repeatableExpAvailable: boolean;
}

/** 冒险首通奖励一项。 */
export interface LobbyAdventureRewardItemVO {
  resourceType: string;
  resourceCode: string;
  resourceName: string;
  amount: number;
}

/** 大厅爬塔章节只读展示项。 */
export interface LobbyAdventureChapterVO {
  chapterCode: string;
  chapterName: string;
  subtitle: string;
  summary: string;
  unlocked: boolean;
  stages: LobbyAdventureStageVO[];
}

/** 大厅冒险只读状态；不包含任何战斗开始、奖励发放或进度写入动作。 */
export interface LobbyAdventureVO {
  mode: string;
  readonly: boolean;
  playerLevel: number;
  playerPower: number;
  currentChapterCode: string;
  currentChapterName: string;
  recommendedStageCode: string;
  recommendedStageName: string;
  recommendationText: string;
  guardrails: string[];
  chapters: LobbyAdventureChapterVO[];
  // 已通关最高关卡编码(真实爬塔层数);未通关为空。挂机层显示据此,不用"下一关"的推荐关。
  maxCompletedStageCode: string;
  /** 开战战力软闸比例:阵容战力 ≥ 推荐战力 × 本值才能开战(后端下发,旧服务端缺省 0.4)。 */
  powerGateRatio: number;
}

/** 冒险地图面板渲染所需的本地状态快照。 */
export interface LobbyAdventurePanelState {
  loading: boolean;
  loaded: boolean;
  error: string;
  adventure: LobbyAdventureVO | null;
}
