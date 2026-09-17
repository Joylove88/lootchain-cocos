import type { QuestRewardItemVO } from './QuestTypes';

/** 大厅图鉴展示项(2026-09-15 图鉴系统一期:带激活奖励三态)。 */
export interface LobbyCodexItemVO {
  heroCode: string;
  heroName: string;
  rarity: string;
  faction: string;
  heroClass: string;
  roleDesc?: string | null;
  portraitAsset?: string | null;
  cardBackgroundAsset?: string | null;
  spineAsset?: string | null;
  spineUuid?: string | null;
  owned: boolean;
  ownedCount: number;
  /** 激活奖励清单(按稀有度配置,服务端下发)。 */
  activateRewards: QuestRewardItemVO[];
  /** 已拥有且未领取激活奖励。 */
  rewardClaimable: boolean;
  /** 激活奖励已领取。 */
  rewardClaimed: boolean;
}

/** 收录里程碑(进度条上的宝箱节点)。 */
export interface LobbyCodexMilestoneVO {
  rewardCode: string;
  targetCount: number;
  rewardName: string;
  rewards: QuestRewardItemVO[];
  reached: boolean;
  claimed: boolean;
  claimable: boolean;
}

/** 图鉴汇总:卡墙 + 收录进度 + 里程碑。 */
export interface LobbyCodexSummaryVO {
  total: number;
  ownedCount: number;
  claimableCount: number;
  milestones: LobbyCodexMilestoneVO[];
  items: LobbyCodexItemVO[];
}

/** 领取请求:HERO 传 heroCode;MILESTONE 传 targetCount。 */
export type LobbyCodexClaimPayload =
  | { type: 'HERO'; heroCode: string }
  | { type: 'MILESTONE'; targetCount: number };

/** 领取结果:本次发放明细 + 领取后的最新汇总。 */
export interface LobbyCodexClaimResultVO {
  rewardName: string;
  rewards: QuestRewardItemVO[];
  claimedCount: number;
  summary: LobbyCodexSummaryVO;
}

export type LobbyCodexRarityFilter = 'ALL' | 'UR' | 'SSR' | 'SR' | 'R';

/** 图鉴面板渲染所需的本地状态快照(数据 + 页内 UI 态)。 */
export interface LobbyCodexPanelState {
  loading: boolean;
  loaded: boolean;
  error: string;
  total: number;
  ownedCount: number;
  claimableCount: number;
  milestones: LobbyCodexMilestoneVO[];
  items: LobbyCodexItemVO[];
  /** 稀有度页签。 */
  filter: LobbyCodexRarityFilter;
  /** 仅看未收集开关。 */
  unownedOnly: boolean;
  /** 详情弹框选中的英雄;null=关闭。 */
  selectedHeroCode: string | null;
  /** 里程碑弹框选中的阈值;null=关闭。 */
  selectedMilestone: number | null;
  /** 领取中的键('HERO:<code>' / 'MILESTONE:<n>' / 'ALL'),用于禁用按钮。 */
  claiming: string | null;
  /** 领取成功后待播放的特效(渲染器消费一次后清空):key 同 claiming 键。 */
  claimFx: { key: string; rewards: QuestRewardItemVO[]; token: number } | null;
}
