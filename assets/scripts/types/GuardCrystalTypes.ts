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
  /** 法术装备格数(含外观追加;旧快照缺省按 2)。 */
  spellSlots?: number;
  /** 出战法术(按格位顺序;面板当前等级与开战快照填写,等级表行为 null)。 */
  spellLoadout?: string[] | null;
}

export interface GuardCrystalLevelVO {
  level: number;
  upgradeGold: number;
  upgradeCore?: number;
  effect: GuardCrystalEffectVO;
  unlockSpells: string | null;
}

export interface GuardCrystalInfoVO {
  level: number;
  maxLevel: number;
  current: GuardCrystalEffectVO;
  next: GuardCrystalEffectVO | null;
  nextUpgradeGold: number | null;
  /** 下一级所需守卫晶核(满级 null)。 */
  nextUpgradeCore?: number | null;
  goldBalance: number | string;
  coreBalance?: number;
  coreItemCode?: string;
  /** 法术装备:当前格数(含外观追加)、格数上限、下一格由水晶几级解锁(没有则 null)。 */
  spellSlots?: number;
  maxSpellSlots?: number;
  nextSlotLevel?: number | null;
  levels: GuardCrystalLevelVO[];
}

export interface GuardCrystalUpgradeResultVO {
  fromLevel: number;
  toLevel: number;
  goldCost: number;
  coreCost?: number;
  replayed: boolean;
  info: GuardCrystalInfoVO;
}
