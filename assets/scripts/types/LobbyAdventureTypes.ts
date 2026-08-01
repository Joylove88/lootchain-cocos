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
}

/** 冒险地图面板渲染所需的本地状态快照。 */
export interface LobbyAdventurePanelState {
  loading: boolean;
  loaded: boolean;
  error: string;
  adventure: LobbyAdventureVO | null;
}
