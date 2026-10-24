/** 大厅左上角玩家资料与资料弹窗使用的只读展示模型。 */
import type { DecimalValue } from './CommonTypes';

export interface PlayerLobbyLevelProgressVO {
  currentLevel: number;
  currentExp: number;
  currentLevelNeedExp: number;
  nextLevel?: number | null;
  nextLevelNeedExp?: number | null;
  expIntoLevel: number;
  expToNextLevel: number;
  progressPercent: number;
  maxHeroLevel?: number | null;
  nextUnlockDesc?: string | null;
}

export interface PlayerLobbyProfileVO {
  userId: number;
  displayName: string;
  protagonistName?: string | null;
  username?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  playerLevel: number;
  exp: number;
  levelProgress?: PlayerLobbyLevelProgressVO | null;
  stamina: number;
  maxStamina: number;
  gold?: DecimalValue | null;
  diamond?: DecimalValue | null;
  /** 绑钻(普通召唤消耗;docs/45 §14)。旧服务端缺省。 */
  boundDiamond?: DecimalValue | null;
  /** 矿晶(打金结算积分,docs/27 P金-1a)。 */
  sacredCrystal?: DecimalValue | null;
  /** 英雄总战力(全部英雄之和,只做展示)。 */
  combatPower: number;
  /** 阵容战力(冒险编队前 4 人,与推荐战力同口径;docs/45 §4)。旧服务端缺省。 */
  lineupPower?: number | null;
  status?: number | null;
  accountStatus: string;
  walletBound: boolean;
  walletAddress?: string | null;
  loginMethod: string;
}
