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

/** 真人矿关卡码 RAIDPVP_<对方 userId>[_R<战报 id>](docs/49)。 */
export function isRaidPvpStageCode(stageCode: string | null | undefined): boolean {
  return /^RAIDPVP_\d{1,12}(_R\d{1,12})?$/i.test((stageCode ?? '').trim());
}

/** NPC 矿或真人矿:都走掠夺战斗流。 */
export function isRaidBattleStageCode(stageCode: string | null | undefined): boolean {
  return isRaidStageCode(stageCode) || isRaidPvpStageCode(stageCode);
}

export function raidPvpStageCode(defenderUserId: number, revengeOf?: number | null): string {
  return `RAIDPVP_${Math.trunc(defenderUserId)}${revengeOf ? `_R${Math.trunc(revengeOf)}` : ''}`;
}

/** 真人矿页(GET /api/player/raid/pvp/home)。 */
export interface RaidPvpCandidateVO {
  userId: number;
  nickname: string;
  level: number;
  lineupPower: number;
  crystal: number;
  stealPreview: number;
  attackedRecently: boolean;
  defenders: RaidDefenderPreviewVO[];
}

export interface RaidPvpReportVO {
  id: number;
  battleNo: string;
  role: 'ATTACK' | 'DEFEND';
  opponentUserId: number;
  opponentName: string;
  opponentLevel: number;
  result: string;
  crystalDelta: number;
  createdAt: string;
  canRevenge: boolean;
}

export interface RaidPvpHomeVO {
  myCrystal: number;
  lineupPower: number;
  shieldUntil: string | null;
  protectUntil: string | null;
  shieldPrice: number;
  canBuyShield: boolean;
  shieldNote: string;
  stealPct: number;
  penaltyPct: number;
  staminaCost: number;
  candidates: RaidPvpCandidateVO[];
  reports: RaidPvpReportVO[];
}
