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
  combatPower: number;
  status?: number | null;
  accountStatus: string;
  walletBound: boolean;
  walletAddress?: string | null;
  loginMethod: string;
}
