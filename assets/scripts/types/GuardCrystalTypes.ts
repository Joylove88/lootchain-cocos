/** 守卫水晶养成(docs/38,后端 /api/player/guard-crystal)。 */

/** 某等级的累计效果(开战快照与面板共用)。 */
export interface GuardCrystalEffectVO {
  level: number;
  crystalHpPct: number;
  startGold: number;
  spellPowerPct: number;
  startEnergy: number;
  energyMaxBonus: number;
  unlockedSpells: string[];
}

export interface GuardCrystalLevelVO {
  level: number;
  upgradeGold: number;
  effect: GuardCrystalEffectVO;
  unlockSpells: string | null;
}

export interface GuardCrystalInfoVO {
  level: number;
  maxLevel: number;
  current: GuardCrystalEffectVO;
  next: GuardCrystalEffectVO | null;
  nextUpgradeGold: number | null;
  goldBalance: number | string;
  levels: GuardCrystalLevelVO[];
}

export interface GuardCrystalUpgradeResultVO {
  fromLevel: number;
  toLevel: number;
  goldCost: number;
  replayed: boolean;
  info: GuardCrystalInfoVO;
}
