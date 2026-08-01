// 英雄战斗特殊属性来源(策划,2026-07-09 定稿)。特殊属性只来自「技能/装备/宝石」,职业不触发。
//
// 归属:
//  · 连击 / 斩杀 等「非持续性」属性 → 不放英雄技能,后期走**装备/宝石**词条(此表不登记;sim 机制保留待接入)。
//  · 英雄技能的特殊属性 = **概率触发**:冻结X秒 / 眩晕X秒 / 真伤穿透 / 溅射 / 反弹 / 吸血。
//    触发概率 = 技能 baseChance × **稀有度系数**(稀有度越高触发率越高,见 resolveRaritySkillChanceMultiplier)。
//  · 能量护盾 = 通用百分比属性(非概率),强度按稀有度缩放(见 resolveEnergyShieldHpRatio)。
//
// 本表是客户端占位,对应未来后端 `hero_skill_config` 表;战斗 sim 只认这张表,不再按职业判定。
// heroCode 取值见 assets/scripts/api/LobbyHeroApi.ts 的 HERO_CLASS_FALLBACKS(后端下发同名字段)。

export type BattleHeroShieldScope = 'single' | 'team';

export interface BattleHeroEnergyShieldSkill {
  // 单体=只护自己;全体=开场给全队各叠一层。强度(占 maxHp 比例)由稀有度决定,见 resolveEnergyShieldHpRatio。
  scope: BattleHeroShieldScope;
}

// 概率触发的技能特殊属性类型。
//  lifesteal  吸血:命中按 magnitude(%) 回施法者血
//  truePierce 真伤穿透:本次命中无视防御(magnitude 预留为附带增伤系数)
//  freeze     冻结:目标定身 magnitude 秒(硬控,跳过行动)
//  stun       眩晕:目标晕眩 magnitude 秒(硬控,跳过行动)
//  splash     溅射:对相邻目标追加 magnitude(%) 伤害
//  reflect    反弹:受击时反弹 magnitude(%) 伤害给攻击者
// atkUp/hpUp:属性加成类被动(常驻,baseChance 固定 1,magnitude=加成比例),战斗开场按解锁状态入面板。
export type BattleHeroSkillEffectType = 'lifesteal' | 'truePierce' | 'freeze' | 'stun' | 'splash' | 'reflect' | 'atkUp' | 'hpUp';

export interface BattleHeroSkillEffect {
  type: BattleHeroSkillEffectType;
  // 基础触发概率(0~1),实际概率再乘稀有度系数。
  baseChance: number;
  // 效果量,语义随 type:吸血/穿透/溅射/反弹=比例;冻结/眩晕=秒数。
  magnitude: number;
}

export interface BattleHeroSkillProfile {
  // 【通用百分比·全稀有度】能量护盾:是否有 + 范围;强度按稀有度缩放。缺省无盾。
  energyShield?: BattleHeroEnergyShieldSkill;
  // 【概率触发·稀有度提升触发率】技能特殊属性列表。缺省无。
  effects?: BattleHeroSkillEffect[];
}

const EMPTY_PROFILE: BattleHeroSkillProfile = {};

// 稀有度越高,技能触发概率越高。
const RARITY_SKILL_CHANCE_MULT: Record<string, number> = { UR: 1.6, SSR: 1.3, SR: 1.0, R: 0.75 };

export function resolveRaritySkillChanceMultiplier(rarity: string | null | undefined): number {
  return RARITY_SKILL_CHANCE_MULT[(rarity || '').trim().toUpperCase()] ?? 1;
}

// 技能实际触发概率:baseChance × 稀有度系数,夹在 [0, 0.95](留手感,不做必触发)。
export function resolveSkillTriggerChance(baseChance: number, rarity: string | null | undefined): number {
  const chance = baseChance * resolveRaritySkillChanceMultiplier(rarity);
  return Math.max(0, Math.min(0.95, chance));
}

// 能量护盾强度按稀有度给不同比例:盾量 = 受益者 maxHp × 此比例。稀有度越高护盾越厚。
const ENERGY_SHIELD_HP_RATIO: Record<BattleHeroShieldScope, Record<string, number>> = {
  single: { UR: 0.5, SSR: 0.44, SR: 0.36, R: 0.3 },
  team: { UR: 0.22, SSR: 0.19, SR: 0.15, R: 0.12 },
};

export function resolveEnergyShieldHpRatio(scope: BattleHeroShieldScope, rarity: string | null | undefined): number {
  const table = ENERGY_SHIELD_HP_RATIO[scope];
  return table[(rarity || '').trim().toUpperCase()] ?? table.R;
}

// 占位技能表(兜底):权威源为后端 hero_battle_skill_config,battle start / 大厅英雄列表回执会下发替换本表。
// 本表与 sql/85 全英雄技能配置逐条对齐(2026-07-14 全英雄设计,docs/25):
//   被动有序 = [护盾?, ...概率效果];护盾若有占被动 #1(最早解锁);数量随稀有度(R/SR 2 / SSR/UR 4)。
const BATTLE_HERO_SKILL_CONFIG: Record<string, BattleHeroSkillProfile> = {
  UR_NYX: { effects: [{ type: 'truePierce', baseChance: 0.28, magnitude: 1 }, { type: 'lifesteal', baseChance: 0.26, magnitude: 0.4 }, { type: 'stun', baseChance: 0.22, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.2 }] }, // UR 刺客(末条=属性加成)
  UR_ATLAS: { energyShield: { scope: 'single' }, effects: [{ type: 'reflect', baseChance: 0.28, magnitude: 0.38 }, { type: 'stun', baseChance: 0.22, magnitude: 1 }, { type: 'hpUp', baseChance: 1, magnitude: 0.25 }] }, // UR 坦克(末条=属性加成)
  UR_AURELIA: { effects: [{ type: 'truePierce', baseChance: 0.28, magnitude: 1 }, { type: 'splash', baseChance: 0.32, magnitude: 0.55 }, { type: 'lifesteal', baseChance: 0.26, magnitude: 0.4 }, { type: 'atkUp', baseChance: 1, magnitude: 0.2 }] }, // UR 射手(末条=属性加成)
  UR_ARTHAS: { effects: [{ type: 'stun', baseChance: 0.22, magnitude: 1.0 }, { type: 'splash', baseChance: 0.32, magnitude: 0.55 }, { type: 'reflect', baseChance: 0.28, magnitude: 0.38 }, { type: 'atkUp', baseChance: 1, magnitude: 0.2 }] }, // UR 战士(末条=属性加成示范)
  UR_EVELYN: { effects: [{ type: 'splash', baseChance: 0.32, magnitude: 0.55 }, { type: 'freeze', baseChance: 0.2, magnitude: 1.2 }, { type: 'truePierce', baseChance: 0.28, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.2 }] }, // UR 法师(末条=属性加成)
  UR_SERAPHINA: { energyShield: { scope: 'team' }, effects: [{ type: 'lifesteal', baseChance: 0.26, magnitude: 0.4 }, { type: 'reflect', baseChance: 0.28, magnitude: 0.38 }, { type: 'hpUp', baseChance: 1, magnitude: 0.25 }] }, // UR 辅助(末条=属性加成)
  SSR_RON: { effects: [{ type: 'truePierce', baseChance: 0.24, magnitude: 1 }, { type: 'lifesteal', baseChance: 0.24, magnitude: 0.36 }, { type: 'stun', baseChance: 0.18, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.16 }] }, // SSR 刺客(末条=属性加成)
  SSR_KANE: { energyShield: { scope: 'single' }, effects: [{ type: 'reflect', baseChance: 0.26, magnitude: 0.35 }, { type: 'stun', baseChance: 0.18, magnitude: 1.0 }, { type: 'hpUp', baseChance: 1, magnitude: 0.25 }] }, // SSR 坦克(末条=属性加成示范)
  SSR_MICHAEL: { effects: [{ type: 'stun', baseChance: 0.18, magnitude: 1 }, { type: 'splash', baseChance: 0.28, magnitude: 0.52 }, { type: 'reflect', baseChance: 0.26, magnitude: 0.35 }, { type: 'atkUp', baseChance: 1, magnitude: 0.16 }] }, // SSR 战士(末条=属性加成)
  SSR_LIVIA: { effects: [{ type: 'splash', baseChance: 0.28, magnitude: 0.52 }, { type: 'freeze', baseChance: 0.18, magnitude: 1.1 }, { type: 'truePierce', baseChance: 0.24, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.16 }] }, // SSR 法师(末条=属性加成)
  SR_ABYSS_06: { effects: [{ type: 'truePierce', baseChance: 0.28, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.12 }] }, // SR 刺客(末条=属性加成)
  SR_PALADIN_02: { energyShield: { scope: 'single' }, effects: [{ type: 'hpUp', baseChance: 1, magnitude: 0.15 }] }, // SR 坦克(末条=属性加成)
  SR_SNIPER_05: { effects: [{ type: 'truePierce', baseChance: 0.28, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.12 }] }, // SR 射手(末条=属性加成)
  SR_BLADE_04: { effects: [{ type: 'stun', baseChance: 0.2, magnitude: 0.9 }, { type: 'atkUp', baseChance: 1, magnitude: 0.12 }] }, // SR 战士(末条=属性加成)
  SR_WITCH_03: { effects: [{ type: 'splash', baseChance: 0.34, magnitude: 0.48 }, { type: 'atkUp', baseChance: 1, magnitude: 0.12 }] }, // SR 法师(末条=属性加成)
  SR_PRIEST_01: { energyShield: { scope: 'team' }, effects: [{ type: 'hpUp', baseChance: 1, magnitude: 0.15 }] }, // SR 辅助(末条=属性加成)
  R_SCOUT_03: { effects: [{ type: 'truePierce', baseChance: 0.26, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.09 }] }, // R 刺客(末条=属性加成)
  R_GUARD_07: { energyShield: { scope: 'single' }, effects: [{ type: 'hpUp', baseChance: 1, magnitude: 0.12 }] }, // R 坦克(末条=属性加成)
  R_RANGER_06: { effects: [{ type: 'truePierce', baseChance: 0.26, magnitude: 1 }, { type: 'atkUp', baseChance: 1, magnitude: 0.09 }] }, // R 射手(末条=属性加成)
  R_PATROL_01: { effects: [{ type: 'stun', baseChance: 0.18, magnitude: 0.8 }, { type: 'atkUp', baseChance: 1, magnitude: 0.09 }] }, // R 战士(末条=属性加成)
  R_CULT_05: { effects: [{ type: 'splash', baseChance: 0.32, magnitude: 0.45 }, { type: 'atkUp', baseChance: 1, magnitude: 0.09 }] }, // R 法师(末条=属性加成)
  R_ACOLY_02: { energyShield: { scope: 'team' }, effects: [{ type: 'hpUp', baseChance: 1, magnitude: 0.12 }] }, // R 辅助(末条=属性加成)
};

export function resolveBattleHeroSkillProfile(heroCode: string | null | undefined): BattleHeroSkillProfile {
  if (!heroCode) {
    return EMPTY_PROFILE;
  }
  return BATTLE_HERO_SKILL_CONFIG[heroCode.trim().toUpperCase()] ?? EMPTY_PROFILE;
}

// ===== 技能系统:稀有度定技能数 + 被动升星解锁(策划 2026-07-14 定稿,详见 docs/25-技能系统.md)=====
//  · 每个英雄技能组 = 1 终极技能(大招,拥有即默认解锁 Lv1,战斗可手动释放) + N 被动技能。
//  · 技能组总数由稀有度决定:R/SR = 3(1+2),SSR/UR/EX = 5(1+4)。
//  · 被动技能(护盾/概率特殊属性/BUFF/属性加成)靠升星逐条解锁,顺序 = 技能配置里 [护盾?, ...effects] 的顺序。
//  · 稀有度对技能的三重影响:①数量(此处) ②触发概率(resolveRaritySkillChanceMultiplier) ③护盾强度(resolveEnergyShieldHpRatio)。

// 被动技能解锁星级阶梯(下标 = 第几条被动;终极技能不在此列,默认解锁)。
const PASSIVE_UNLOCK_STARS_BY_TIER: Record<'low' | 'high', number[]> = {
  low: [3, 6], // R / SR:2 条被动
  high: [2, 4, 6, 9], // SSR / UR / EX:4 条被动
};

function resolveRaritySkillTier(rarity: string | null | undefined): 'low' | 'high' {
  const key = (rarity || '').trim().toUpperCase();
  return key === 'SSR' || key === 'UR' || key === 'EX' ? 'high' : 'low';
}

// 该稀有度各被动技能位的解锁星级(有序)。R/SR → [3,6];SSR/UR/EX → [2,4,6,9]。
export function resolveHeroPassiveUnlockStars(rarity: string | null | undefined): number[] {
  return PASSIVE_UNLOCK_STARS_BY_TIER[resolveRaritySkillTier(rarity)];
}

// 技能组总数(含终极技能):R/SR = 3,SSR/UR/EX = 5。
export function resolveHeroSkillSlotTotal(rarity: string | null | undefined): number {
  return 1 + resolveHeroPassiveUnlockStars(rarity).length;
}

// 当前星级下已解锁的被动技能条数(终极技能不计)。
export function resolveUnlockedPassiveCount(rarity: string | null | undefined, star: number | null | undefined): number {
  const currentStar = Math.max(1, Math.trunc(star ?? 1));
  return resolveHeroPassiveUnlockStars(rarity).filter((needStar) => currentStar >= needStar).length;
}

// ===== 终极技能升级(P6,镜像服务端 UltimateConfig;改数值必须两端+docs/25 同步)=====
export const ULTIMATE_MAX_LEVEL = 10;
export const ULTIMATE_PRE_AWAKEN_CAP = 5;

export interface UltimateUpCost {
  scroll: number;
  gold: number;
  bossMark: number;
  abyssCrystal: number;
}

const ULTIMATE_COSTS: Record<number, UltimateUpCost> = {
  2: { scroll: 1, gold: 2_000, bossMark: 0, abyssCrystal: 0 },
  3: { scroll: 2, gold: 4_000, bossMark: 0, abyssCrystal: 0 },
  4: { scroll: 3, gold: 8_000, bossMark: 1, abyssCrystal: 0 },
  5: { scroll: 4, gold: 12_000, bossMark: 2, abyssCrystal: 0 },
  6: { scroll: 6, gold: 20_000, bossMark: 3, abyssCrystal: 1 },
  7: { scroll: 8, gold: 30_000, bossMark: 4, abyssCrystal: 2 },
  8: { scroll: 10, gold: 45_000, bossMark: 6, abyssCrystal: 3 },
  9: { scroll: 12, gold: 60_000, bossMark: 8, abyssCrystal: 4 },
  10: { scroll: 15, gold: 80_000, bossMark: 10, abyssCrystal: 6 },
};

/** 升到 targetLevel 的消耗;非法档位返回 null。 */
export function ultimateUpCost(targetLevel: number): UltimateUpCost | null {
  return ULTIMATE_COSTS[targetLevel] ?? null;
}

/** 当前上限:未觉醒 5,觉醒 10。 */
export function ultimateCap(awakened: boolean): number {
  return awakened ? ULTIMATE_MAX_LEVEL : ULTIMATE_PRE_AWAKEN_CAP;
}

/** 手动大招伤害倍率系数:×(1+0.15×(Lv-1));等级缺省/越界按 1..10 收敛。 */
export function ultimateDamageScale(level: number | null | undefined): number {
  const safe = Math.max(1, Math.min(ULTIMATE_MAX_LEVEL, Math.trunc(level ?? 1) || 1));
  return 1 + 0.15 * (safe - 1);
}
