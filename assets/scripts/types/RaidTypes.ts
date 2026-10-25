import type { PlayerBattleLineupHeroVO, PlayerBattleRewardItemVO } from './BattleTypes';

/** 矿境掠夺 NPC 矿(docs/48):GET /api/player/raid/stages。 */
export interface RaidDefenderPreviewVO {
  heroCode: string;
  heroName: string;
  rarity: string;
  star: number;
  level: number;
}

export interface RaidStageVO {
  stageCode: string;
  orderNo: number;
  zoneName: string;
  stageName: string;
  recommendedPower: number;
  staminaCost: number;
  unlocked: boolean;
  cleared: boolean;
  defenders: RaidDefenderPreviewVO[];
  rewardPreview: PlayerBattleRewardItemVO[];
  firstClearRewards: PlayerBattleRewardItemVO[];
}

export interface RaidStagesVO {
  clearedMax: number;
  nextStageCode: string;
  totalWins: number;
  totalRaids: number;
  stages: RaidStageVO[];
}

/** 开战回执里的掠夺建场参数(服务端算好;客户端与复演只认它)。 */
export interface RaidSetupDefenderVO {
  cell: number;
  hp: number;
  hero: PlayerBattleLineupHeroVO;
  /** 模板表现资源(NPC 不在玩家名册里,骨骼 / 立绘靠它们解析)。 */
  spineAsset?: string | null;
  portraitAsset?: string | null;
}

export interface RaidSetupVO {
  stageCode: string;
  timeLimitMs: number;
  crystalHp: number;
  raider: { heroCode: string; attack: number; hp: number };
  defenders: RaidSetupDefenderVO[];
}

export function isRaidStageCode(stageCode: string | null | undefined): boolean {
  return /^RAID_\d{1,3}$/i.test((stageCode ?? '').trim());
}
