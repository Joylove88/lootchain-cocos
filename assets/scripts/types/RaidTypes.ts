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
  /** docs/61:矿主首领(第 4 名 / 矿区池下一位,星 +1);旧服务端无此字段 → null。defenders 为前 3 名守卫。 */
  owner: RaidDefenderPreviewVO | null;
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
  /** 野外清怪(docs/50):这只怪每一击对进攻方的最终伤害。 */
  hit?: number;
  /** docs/61:守矿首领(对方主角 / NPC 矿主),站水晶前、顶部单独血条。 */
  boss?: boolean;
  /** 首领称号:真人矿 = 对方境界(炼魂 · 中期),NPC = 矿主。 */
  title?: string | null;
}

/** docs/61 主角带队:进攻方(主角时带表现信息,主角不在 lineup 里)。 */
export interface RaidSetupRaiderVO {
  heroCode: string;
  attack: number;
  hp: number;
  protagonist?: boolean;
  heroName?: string | null;
  spineAsset?: string | null;
  title?: string | null;
  /** docs/61 §8:主角已到炼魂,可放大招「夜帝残影」。 */
  ult?: boolean;
}

/** docs/61 AI 同伴(编队英雄;heroCode 在开战回执 lineup 里)。 */
export interface RaidSetupAllyVO {
  heroId: number | null;
  heroCode: string;
  attack: number;
  hp: number;
}

export interface RaidSetupVO {
  stageCode: string;
  timeLimitMs: number;
  crystalHp: number;
  raider: RaidSetupRaiderVO;
  defenders: RaidSetupDefenderVO[];
  /** docs/61:AI 同伴(旧服务端 / 野外没有)。 */
  allies?: RaidSetupAllyVO[];
  /** 野外清怪模式(docs/50):无水晶,怪全灭即胜。 */
  clear?: boolean;
}

export function isRaidStageCode(stageCode: string | null | undefined): boolean {
  return /^RAID_\d{1,3}$/i.test((stageCode ?? '').trim());
}

/** 真人矿关卡码 RAIDPVP_<对方 userId>[_R<战报 id>](docs/49)。 */
export function isRaidPvpStageCode(stageCode: string | null | undefined): boolean {
  return /^RAIDPVP_\d{1,12}(_R\d{1,12})?$/i.test((stageCode ?? '').trim());
}

/** 野外怪群关卡码 FIELD_<地图>_<营地>(docs/50),例:FIELD_WOODS_1、FIELD_GRAY_E。 */
export function isFieldStageCode(stageCode: string | null | undefined): boolean {
  return /^FIELD_[A-Z]{2,12}_[A-Z0-9]{1,3}$/i.test((stageCode ?? '').trim());
}

/** 矿境掠夺(NPC 矿 / 真人矿,不含野外):开战声明支持主角带队(docs/61)。 */
export function isRaidSquadStageCode(stageCode: string | null | undefined): boolean {
  return isRaidStageCode(stageCode) || isRaidPvpStageCode(stageCode);
}

/** NPC 矿、真人矿或野外怪群:都走掠夺(动作)战斗流。 */
export function isRaidBattleStageCode(stageCode: string | null | undefined): boolean {
  return isRaidStageCode(stageCode) || isRaidPvpStageCode(stageCode) || isFieldStageCode(stageCode);
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
  /** 对方编队 3 名英雄(不含主角)。 */
  defenders: RaidDefenderPreviewVO[];
  /** docs/61:对方主角(守矿首领);旧服务端无此字段 → null。 */
  protagonist: RaidDefenderPreviewVO | null;
  /** 对方境界称号(例「炼魂 · 中期」)。 */
  realmTitle: string | null;
  /** 已到炼魂:立绘用换装版。 */
  lianhun: boolean;
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
  /** docs/61:我的防守阵(主角在前 + 编队 3 人)。 */
  myTeam: RaidDefenderPreviewVO[];
}
