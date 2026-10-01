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
  /** 法术等级(docs/39;只含已解锁法术,缺项 = 1;等级表行为 null)。 */
  spellLevels?: Partial<Record<string, number>> | null;
}

/** 单个法术的等级与下一级花费(docs/39;满级时 next* / needCrystalLevel 为 null)。 */
export interface GuardSpellLevelVO {
  spellId: string;
  level: number;
  maxLevel: number;
  unlocked: boolean;
  nextGold: number | null;
  nextCore: number | null;
  needCrystalLevel: number | null;
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
  /** 法术等级列表(docs/39;按 quake/frost/thunder/goldrush/aegis/warhorn 顺序)。 */
  spells?: GuardSpellLevelVO[] | null;
}

export interface GuardCrystalUpgradeResultVO {
  fromLevel: number;
  toLevel: number;
  goldCost: number;
  coreCost?: number;
  replayed: boolean;
  info: GuardCrystalInfoVO;
}

/** 法术升级回执(docs/39 POST /api/player/guard-crystal/spell-upgrade)。 */
export interface GuardSpellUpgradeResultVO {
  spellId: string;
  fromLevel: number;
  toLevel: number;
  goldCost: number;
  coreCost: number;
  replayed: boolean;
  info: GuardCrystalInfoVO;
}
