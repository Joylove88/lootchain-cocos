import type { sp } from 'cc';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';

export interface BattleUnitSpineRuntimeData {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  skins?: Array<{ name?: string } | null>;
  animations?: Array<{ name?: string } | null>;
}

// 战斗单位动画角色类型：决定动画名映射规则。
// SSR/UR 用英文标准命名；SR/R 用旧中文拼音/数字命名；怪物走伪动画占位。
export type BattleUnitSpineRarityTier = 'SSR' | 'UR' | 'SR' | 'R' | 'BOSS' | 'ENEMY' | 'DEFAULT';

// Stage 13D 严格稀有度动画名映射契约。
// SSR/UR：run/atk/hit/dead/skill1/skill2/skill3/ult/victory。
// SR/R：run/skill0(普攻)/skill1/skill2/skill4/die/hurt/win_1(回退 win_2)。
// 怪物/BOSS：idle/run/attack/hit/dead（资源缺失时由渲染层做伪动画占位）。
export interface BattleUnitSpineAnimationNames {
  idle: string | null;
  move: string | null;
  attack: string | null;
  skill1: string | null;
  skill2: string | null;
  skill3: string | null;
  ult: string | null;
  hit: string | null;
  death: string | null;
  victory: string | null;
  // skill*_kz：目标点技能特效动画名（在敌人区域播放），按稀有度规则解析。
  skill1Kz: string | null;
  skill2Kz: string | null;
  skill3Kz: string | null;
  skill4Kz: string | null;
  // 旧字段兼容：当前战斗渲染层仍用 attack/skill/hit/death/victory 聚合访问。
  skill: string | null;
}

type BattleUnitSpineEnumMap = { [key: string]: number | string };
type BattleUnitSpineVisualProfile = {
  targetHeightRatio: number;
  maxWidthRatio: number;
  minScale: number;
  maxScale: number;
  fallbackRawHeight: number;
  scaleMultiplier: number;
};

export const BATTLE_STAGE4_SPINE_REQUIRED_ANIMATIONS = [
  'idle',
  'move',
  'attack_01',
  'skill_01',
  'hit',
  'death',
  'victory',
] as const;

export const BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY: Record<string, BattleUnitSpineVisualProfile> = {
  R: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18, fallbackRawHeight: 620, scaleMultiplier: 2.18 },
  SR: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18, fallbackRawHeight: 660, scaleMultiplier: 2.18 },
  SSR: { targetHeightRatio: 0.72, maxWidthRatio: 1.38, minScale: 0.034, maxScale: 0.25, fallbackRawHeight: 1180, scaleMultiplier: 0.98 },
  UR: { targetHeightRatio: 0.68, maxWidthRatio: 1.38, minScale: 0.032, maxScale: 0.23, fallbackRawHeight: 1280, scaleMultiplier: 0.94 },
  BOSS: { targetHeightRatio: 0.82, maxWidthRatio: 1.24, minScale: 0.036, maxScale: 0.3, fallbackRawHeight: 1000, scaleMultiplier: 1 },
  FORMATION_PREVIEW: { targetHeightRatio: 1.42, maxWidthRatio: 3.35, minScale: 0.058, maxScale: 2.72, fallbackRawHeight: 720, scaleMultiplier: 2.62 },
  DEFAULT: { targetHeightRatio: 0.76, maxWidthRatio: 1.38, minScale: 0.036, maxScale: 0.28, fallbackRawHeight: 900, scaleMultiplier: 1 },
};

const BATTLE_STAGE12_NAMED_SPINE_PROFILE: BattleUnitSpineVisualProfile = {
  targetHeightRatio: 0.82,
  maxWidthRatio: 2.05,
  minScale: 0.034,
  maxScale: 0.32,
  fallbackRawHeight: 1180,
  scaleMultiplier: 0.94,
};

const BATTLE_STAGE12_NUU_SPINE_PROFILE: BattleUnitSpineVisualProfile = {
  targetHeightRatio: 0.78,
  maxWidthRatio: 2.2,
  minScale: 0.032,
  maxScale: 0.24,
  fallbackRawHeight: 1280,
  scaleMultiplier: 1.02,
};

const BATTLE_STAGE12_SPINE_PROFILE_BY_ASSET: Record<string, BattleUnitSpineVisualProfile> = {
  Belladonna: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
  Carmilla: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
  Eulenspigel: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
  Ishmael: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
  IshmaelA: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
  LucienA: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
  Lucrecia: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
  Nuu: BATTLE_STAGE12_NUU_SPINE_PROFILE,
  Sphinx: BATTLE_STAGE12_NAMED_SPINE_PROFILE,
};

const BATTLE_STAGE12_FORMATION_PREVIEW_HEIGHT_RATIO_BY_ASSET: Record<string, number> = {
  act_1028: 1.32,
  Eulenspigel: 0.272,
  Ishmael: 0.528,
  Nuu: 0.43,
};

const ACT_FAMILY_CANVAS_BOOST = 1.75;
// 战斗/大厅整体体型系数:与布阵同一基础公式后,用它控制两场景相对布阵的整体放大档
// (0.53 布阵基准 × 1.35 ≈ 0.72,大致维持旧战斗视觉档)。
const BATTLE_COMBAT_SIZE_SCALE = 1.35;

// 逐英雄体型调优:act 系在表值上再乘族系基准 1.75(抵消画布空白),named 骨骼直接用表值。
// 布阵传 BATTLE_ACT_CANVAS_COMPENSATION_BY_ASSET,战斗/大厅传 BATTLE_COMBAT_CANVAS_COMPENSATION_BY_ASSET。
function resolveCanvasCompensation(asset: string | null, table: Record<string, number>): number {
  if (!asset) {
    return 1;
  }
  const tuned = table[asset] ?? 1;
  return asset.startsWith('act_') ? ACT_FAMILY_CANVAS_BOOST * tuned : tuned;
}

// 战斗中按资源对个别英雄骨骼体型做比例微调（不影响编队预览）。见习圣骑士(SR_PALADIN_02 / act_1002)体型偏大，战斗里缩小 15%。
const BATTLE_STAGE12_COMBAT_SCALE_MULTIPLIER_BY_ASSET: Record<string, number> = {
  act_1002: 0.85,
};

// 战斗/大厅侧(不含布阵)在共用 ACT 补偿之上的额外体型修正:
// Nuu(深渊魔女)布阵观感正常但大厅/战斗仍明显偏小(2026-08-02 用户比对截图),仅这两个场景再放大。
const BATTLE_COMBAT_EXTRA_SCALE_BY_ASSET: Record<string, number> = {
  Nuu: 1.45,
  // 灰烬猎手·罗恩:站台专属比例 0.272(全表最低)带进大厅/战斗后明显偏小(2026-09-02 用户大厅+守卫两处截图),补回默认档观感。
  Eulenspigel: 1.55,
  // 契约魔女(SR_WITCH_03):站台比例 1.32 全表最高,大厅偏大,缩 15%(2026-09-02 用户)。
  act_1028: 0.85,
};

// 编队预览按资源体型修正:部分 act 骨骼 bounds 与实际画面不符,同稀有度站台大小悬殊。
// 礼拜堂侍僧(act_1012) bounds 偏大显示过小 → 放大;低语教徒(act_1008) bounds 偏小显示过大 → 缩小。
// act 系画布补偿(编队/战斗/大厅共用):act 骨骼画布内角色占比参差,该表由编队站台人工调优得出,
// 与族系基准 1.75 相乘后可精确抵消各骨骼的画布空白差,让同稀有度与 named/SSR 视觉体型一致。
const BATTLE_ACT_CANVAS_COMPENSATION_BY_ASSET: Record<string, number> = {
  act_1001: 2,
  act_1002: 0.6,
  act_1003: 1.5,
  act_1004: 1.6,
  act_1008: 0.65,
  act_1012: 1.5,
  act_1016: 1.6,
  act_1028: 0.7,
  act_1036: 0.7,
  act_1037: 2,
  act_1038: 1.8,
  act_21006: 0.7,
  Eulenspigel: 1.2,
  Carmilla: 1.2,
  // Nuu 专属站台比例(0.43)偏低,战斗/大厅统一用本表后需要更高补偿维持旧观感(旧战斗表 1.5)。
  Nuu: 1.35,
  Ishmael: 1.2,
  IshmaelA: 1.3,
};

// 战斗 + 大厅挂机逐英雄体型调优(与布阵表独立:两处基础公式不同,倍率需分开调)。
// 规则同上:act_ 系表值再乘族系基准 1.75,named 骨骼表值直接生效。
// 大厅/战斗友军统一体型:以 Nuu(UR_EVELYN)渲染高度为基准,逐英雄用实测像素高
// 反解补偿系数(newVal = oldVal × Nuu_px / hero_px),让每个英雄画面高度对齐 Nuu。
const BATTLE_COMBAT_CANVAS_COMPENSATION_BY_ASSET: Record<string, number> = {
  act_1001: 1.17,
  act_1002: 0.48,
  act_1003: 1.01,
  act_1004: 1.14,
  act_1008: 0.53,
  act_1012: 1.13,
  act_1016: 1.13,
  act_1028: 0.41,
  act_1036: 0.54,
  act_1037: 1.37,
  act_1038: 0.9,
  act_21006: 0.44,
  Eulenspigel: 1.83,
  Carmilla: 0.94,
  Nuu: 1.5,
  Ishmael: 0.94,
  IshmaelA: 0.94,
};

const BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO = 0.84;
// 编队站台统一体型:全稀有度对齐 SSR 一档(0.53),不再按档位分大小。
const BATTLE_FORMATION_DEFAULT_MAX_HEIGHT_RATIO = 0.53;
const BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO = 0.53;

export function resolveBattleUnitSpineResource(unit: BattlePresentationUnitSnapshot): string | null {
  if (unit.side === 'enemy') {
    return resolveBattleUnitEnemySpineResource(unit.spineAsset);
  }
  const asset = resolveBattleUnitSpinePrimaryAsset(unit);
  if (!asset) {
    return null;
  }
  return `spine/hero/${asset}/${asset}`;
}

function resolveBattleUnitEnemySpineResource(asset: string | null | undefined): string | null {
  const configured = sanitizeSpineResource(asset);
  if (configured) {
    return configured;
  }
  const directory = sanitizeSpineAsset(asset);
  return directory ? `spine/enemy/${directory}/${directory}` : null;
}

export function resolveBattleUnitSpinePrimaryAsset(unit: BattlePresentationUnitSnapshot): string | null {
  const portraitBattleSpineAsset = resolveBattleUnitPortraitAssetAsBattleSpine(unit.portraitAsset);
  return portraitBattleSpineAsset
    ?? sanitizeSpineAsset(unit.spineAsset)
    ?? deriveBattleSpineAssetFromPortrait(unit.portraitAsset)
    ?? sanitizeSpineAsset(unit.portraitAsset);
}

export function resolveBattleUnitSpineUuid(unit: BattlePresentationUnitSnapshot): string | null {
  const uuid = (unit.spineUuid || '').trim();
  return /^[0-9a-fA-F-]{36}$/.test(uuid) ? uuid : null;
}

export function resolveBattleUnitSpineLoadUuid(unit: BattlePresentationUnitSnapshot): string | null {
  const primaryAsset = resolveBattleUnitSpinePrimaryAsset(unit);
  const portraitBattleSpineAsset = resolveBattleUnitPortraitAssetAsBattleSpine(unit.portraitAsset);
  return primaryAsset === portraitBattleSpineAsset ? null : resolveBattleUnitSpineUuid(unit);
}

export function isBattleUnitSpineDataAsset(asset: unknown): asset is sp.SkeletonData {
  return asset instanceof Object
    && typeof (asset as sp.SkeletonData).getRuntimeData === 'function';
}

export function resolveBattleUnitSpineRuntimeData(data: sp.SkeletonData): BattleUnitSpineRuntimeData | null {
  const runtimeData = data.getRuntimeData(true) as BattleUnitSpineRuntimeData | null;
  return runtimeData && typeof runtimeData === 'object' ? runtimeData : null;
}

// Stage 13D：按稀有度解析动画名契约。
// 调用方需要先通过 resolveBattleUnitSpineRarityTier() 得到单位所属稀有度档位，
// 再用该档位映射规则从骨骼资源实际动画列表里挑出严格动画名。
export function resolveBattleUnitSpineRarityTier(unit: { rarity?: string | null; scaleProfile?: string | null; side?: string }): BattleUnitSpineRarityTier {
  const scaleProfile = (unit.scaleProfile || '').trim().toUpperCase();
  const rarity = (unit.rarity || '').trim().toUpperCase();
  const raw = scaleProfile === 'FORMATION_PREVIEW' ? rarity : (unit.scaleProfile || unit.rarity || '').trim().toUpperCase();
  if (unit.side === 'enemy') {
    return raw === 'BOSS' ? 'BOSS' : 'ENEMY';
  }
  if (raw === 'SSR' || raw === 'UR' || raw === 'SR' || raw === 'R') {
    return raw;
  }
  return 'DEFAULT';
}

export function resolveBattleUnitSpineAnimationNames(data: sp.SkeletonData, unit?: { rarity?: string | null; scaleProfile?: string | null; side?: string }): BattleUnitSpineAnimationNames {
  const names = resolveBattleUnitSpineAnimationNameList(data);
  const tier = unit ? resolveBattleUnitSpineRarityTier(unit) : 'DEFAULT';
  return resolveBattleUnitSpineAnimationNamesByTier(names, tier);
}

// 按 Stage 13D 稀有度规则解析动画名；SSR/UR、SR/R、BOSS/ENEMY 各有独立映射。
export function resolveBattleUnitSpineAnimationNamesByTier(names: string[], tier: BattleUnitSpineRarityTier): BattleUnitSpineAnimationNames {
  if (tier === 'SSR' || tier === 'UR') {
    return resolveSsrUrSpineAnimationNames(names);
  }
  if (tier === 'SR' || tier === 'R') {
    return resolveSrRSpineAnimationNames(names);
  }
  if (tier === 'BOSS' || tier === 'ENEMY') {
    return resolveEnemySpineAnimationNames(names);
  }
  return resolveDefaultSpineAnimationNames(names);
}

// SSR/UR：run/atk/hit/dead/skill1/skill2/skill3/ult/victory（英文标准命名优先）。
function resolveSsrUrSpineAnimationNames(names: string[]): BattleUnitSpineAnimationNames {
  const idle = resolvePreferredBattleUnitSpineName(names, 'idle', ['daiji', 'daji', 'dj', 'stand', 'wait', 'loop', '待机']);
  const move = resolvePreferredBattleUnitSpineName(names, 'run', ['move', 'walk', 'run', 'zou', '移动', '跑']);
  const attack = resolvePreferredBattleUnitSpineName(names, 'atk', ['attack', 'attack_01', 'atk1', 'gongji', 'gj', 'normal', 'skill0', '普攻']);
  const skill1 = resolvePreferredBattleUnitSpineName(names, 'skill1', ['skill_01', 'skill_1', 'jineng1', 'jn1', '技能1']);
  const skill2 = resolvePreferredBattleUnitSpineName(names, 'skill2', ['skill_02', 'skill_2', 'jineng2', 'jn2', '技能2']);
  const skill3 = resolvePreferredBattleUnitSpineName(names, 'skill3', ['skill_03', 'skill_3', 'jineng3', 'jn3', '技能3']);
  const ult = resolvePreferredBattleUnitSpineName(names, 'ult', ['ultimate', 'dazhao', '大招', 'skill4', 'skill_04']);
  const hit = resolvePreferredBattleUnitSpineName(names, 'hit', ['hurt', 'shouji', 'damage', '受击']);
  const death = resolvePreferredBattleUnitSpineName(names, 'dead', ['death', 'die', 'down_start', '死亡']);
  const victory = resolvePreferredBattleUnitSpineName(names, 'victory', ['shengli', 'win', '胜利']);
  return {
    idle, move, attack, skill1, skill2, skill3, ult, hit, death, victory,
    skill1Kz: resolvePreferredBattleUnitSpineName(names, 'skill1_kz', ['skill_01_kz', 'skill1kz']),
    skill2Kz: resolvePreferredBattleUnitSpineName(names, 'skill2_kz', ['skill_02_kz', 'skill2kz']),
    skill3Kz: resolvePreferredBattleUnitSpineName(names, 'skill3_kz', ['skill_03_kz', 'skill3kz']),
    skill4Kz: resolvePreferredBattleUnitSpineName(names, 'skill4_kz', ['skill_04_kz', 'ult_kz', 'skill4kz']),
    skill: skill1 ?? skill2 ?? skill3 ?? ult,
  };
}

// SR/R：run/skill0(普攻)/skill1/skill2/skill4/die/hurt/win_1(回退 win_2)，无终极大招。
function resolveSrRSpineAnimationNames(names: string[]): BattleUnitSpineAnimationNames {
  const idle = resolvePreferredBattleUnitSpineName(names, 'idle', ['daiji', 'daji', 'dj', 'stand', 'wait', 'loop', '待机']);
  const move = resolvePreferredBattleUnitSpineName(names, 'run', ['move', 'walk', 'run', 'zou', '移动', '跑']);
  const attack = resolvePreferredBattleUnitSpineName(names, 'skill0', ['skill_0', 'atk', 'attack', 'attack_01', 'gongji', 'gj', 'normal', '普攻']);
  const skill1 = resolvePreferredBattleUnitSpineName(names, 'skill1', ['skill_01', 'skill_1', 'jineng1', 'jn1', '技能1']);
  const skill2 = resolvePreferredBattleUnitSpineName(names, 'skill2', ['skill_02', 'skill_2', 'jineng2', 'jn2', '技能2']);
  const skill3 = resolvePreferredBattleUnitSpineName(names, 'skill4', ['skill_04', 'skill_4', 'jineng4', 'jn4', '技能4']);
  const hit = resolvePreferredBattleUnitSpineName(names, 'hurt', ['hit', 'shouji', 'damage', '受击']);
  const death = resolvePreferredBattleUnitSpineName(names, 'die', ['dead', 'death', 'down_start', '死亡']);
  const victory = resolvePreferredBattleUnitSpineName(names, 'win_1', ['win1', 'win_2', 'win2', 'shengli', 'victory', '胜利']);
  return {
    idle, move, attack, skill1, skill2, skill3, ult: null, hit, death, victory,
    skill1Kz: resolvePreferredBattleUnitSpineName(names, 'skill1_kz', ['skill_01_kz', 'skill1kz']),
    skill2Kz: resolvePreferredBattleUnitSpineName(names, 'skill2_kz', ['skill_02_kz', 'skill2kz']),
    skill3Kz: resolvePreferredBattleUnitSpineName(names, 'skill4_kz', ['skill_04_kz', 'skill4kz']),
    skill4Kz: null,
    skill: skill1 ?? skill2 ?? skill3,
  };
}

// 怪物/BOSS：idle/run/attack/hit/dead，无技能/大招/胜利（渲染层做伪动画占位）。
function resolveEnemySpineAnimationNames(names: string[]): BattleUnitSpineAnimationNames {
  // S196 怪物包命名坑:含 _turn_(转身过渡)/_link_(衔接段)的动画绝不能被包含匹配选中
  // (如 'run_h' 会命中 'run_b_turn_run_h',移动时反复播转身=卡顿+背对);先过滤再选主动画。
  const mainNames = names.filter((name) => !name.includes('_turn_') && !name.includes('_link_'));
  const pool = mainNames.length > 0 ? mainNames : names;
  const idle = resolvePreferredBattleUnitSpineName(pool, 'idle', ['daiji', 'daji', 'stand', 'wait', '待机']);
  const move = resolvePreferredBattleUnitSpineName(pool, 'run_h', ['run', 'move', 'walk', 'zou', '移动']);
  const attack = resolveEnemyAttackSpineName(pool);
  const hit = resolvePreferredBattleUnitSpineName(pool, 'hit', ['hurt', 'beaten_slash_start', 'beaten', 'shouji', 'damage', '受击']);
  const death = resolvePreferredBattleUnitSpineName(pool, 'dead', ['death', 'die', 'down_start', '死亡']);
  return {
    idle, move, attack, skill1: null, skill2: null, skill3: null, ult: null, hit, death, victory: null,
    skill1Kz: null, skill2Kz: null, skill3Kz: null, skill4Kz: null, skill: null,
  };
}

// S196 怪物攻击命名为 p{N}_动作(普攻在 p1,如 p1_attack_slash / p1_shot / p1_strike_01)
// 或 basic_normal_attack_01;旧 hints('atk'/'attack_01')全匹配不上 → 站桩放 idle。
// 选择规则:主池 = p 系进攻动作 + 任何含 attack 的名字(剔除 buff/summon/dodge 等非进攻);
// 主池空则退 p 系召唤/增益当伪攻击(召唤怪/增益怪的"出手")。p 序号小者优先,
// 分段动画取释放段(_fire)、退循环段(_loop),避免只播起手(_start)/收招(_end/_reload)。
const ENEMY_ATTACK_NON_OFFENSE_HINTS = ['buff', 'debuff', 'summon', 'spawn', 'dodge', 'heal', 'revive', 'teleport', 'phase', 'cry', 'stun', 'beaten', 'death', 'dead', 'appear', 'stuck'];

function resolveEnemyAttackSpineName(pool: string[]): string | null {
  const exact = pool.find((name) => name.toLowerCase() === 'attack');
  if (exact) {
    return exact;
  }
  const isPhaseName = (lower: string): boolean => /(?:^|_)p\d+_/.test(lower);
  const hasAttackWord = (lower: string): boolean => lower.includes('attack') || lower.includes('atk') || lower.includes('gongji') || lower.includes('普攻');
  const nonOffense = (lower: string): boolean => ENEMY_ATTACK_NON_OFFENSE_HINTS.some((hint) => lower.includes(hint));
  let candidates = pool.filter((name) => {
    const lower = name.toLowerCase();
    return hasAttackWord(lower) || (isPhaseName(lower) && !nonOffense(lower));
  });
  if (candidates.length === 0) {
    // 召唤/增益型怪(如枯木行者 p1_summon、孢子兽 p1_buff)没有进攻动作,用其 p 系动作当出手。
    candidates = pool.filter((name) => {
      const lower = name.toLowerCase();
      return isPhaseName(lower) && !lower.includes('spawn') && !lower.includes('phase');
    });
  }
  if (candidates.length === 0) {
    return null;
  }
  const score = (name: string): number => {
    const lower = name.toLowerCase();
    const phase = /(?:^|_)p(\d+)_/.exec(lower);
    let value = 150;
    if (phase) {
      value = Number(phase[1]) * 100;
    } else if (lower.includes('basic') || lower.includes('normal')) {
      value = 0;
    }
    if (lower.includes('backdash')) {
      value += 70;
    } else if (lower.endsWith('_end') || lower.endsWith('_reload')) {
      value += 60;
    } else if (lower.endsWith('_start')) {
      value += 50;
    } else if (lower.endsWith('_loop')) {
      value += 30;
    } else if (lower.endsWith('_fire')) {
      value += 10;
    }
    return value;
  };
  return [...candidates].sort((a, b) => score(a) - score(b) || a.localeCompare(b))[0];
}

// DEFAULT：旧宽松映射，兼容未提供稀有度的单位，避免回归。
function resolveDefaultSpineAnimationNames(names: string[]): BattleUnitSpineAnimationNames {
  const idle = resolvePreferredBattleUnitSpineName(names, 'idle', ['daiji', 'daji', 'dj', 'stand', 'wait', 'loop', '待机']);
  const move = resolvePreferredBattleUnitSpineName(names, 'run', ['move', 'walk', 'run', 'zou', '移动', '跑']);
  const attack = resolvePreferredBattleUnitSpineName(names, 'atk', ['attack', 'attack_01', 'atk1', 'gongji', 'gj', 'normal', 'skill0', '普攻']);
  const skill1 = resolvePreferredBattleUnitSpineName(names, 'skill1', ['skill_01', 'skill_1', 'jineng1', 'jn1', '技能1']);
  const skill2 = resolvePreferredBattleUnitSpineName(names, 'skill2', ['skill_02', 'skill_2', 'jineng2', 'jn2', '技能2']);
  const skill3 = resolvePreferredBattleUnitSpineName(names, 'skill3', ['skill_03', 'skill_3', 'jineng3', 'jn3', '技能3']);
  const ult = resolvePreferredBattleUnitSpineName(names, 'ult', ['ultimate', 'dazhao', '大招', 'skill4', 'skill_04']);
  const hit = resolvePreferredBattleUnitSpineName(names, 'hit', ['hurt', 'shouji', 'damage', '受击']);
  const death = resolvePreferredBattleUnitSpineName(names, 'dead', ['death', 'die', 'down_start', '死亡']);
  const victory = resolvePreferredBattleUnitSpineName(names, 'victory', ['shengli', 'win', '胜利']);
  return {
    idle, move, attack, skill1, skill2, skill3, ult, hit, death, victory,
    skill1Kz: resolvePreferredBattleUnitSpineName(names, 'skill1_kz', ['skill_01_kz', 'skill1kz']),
    skill2Kz: resolvePreferredBattleUnitSpineName(names, 'skill2_kz', ['skill_02_kz', 'skill2kz']),
    skill3Kz: resolvePreferredBattleUnitSpineName(names, 'skill3_kz', ['skill_03_kz', 'skill3kz']),
    skill4Kz: resolvePreferredBattleUnitSpineName(names, 'skill4_kz', ['skill_04_kz', 'skill4kz']),
    skill: skill1 ?? skill2 ?? skill3 ?? ult,
  };
}

export function resolveBattleUnitSpineScale(
  rawWidth: number | undefined,
  rawHeight: number | undefined,
  slotWidth: number,
  slotHeight: number,
  uiScale: number,
  boss: boolean,
  unit?: BattlePresentationUnitSnapshot,
): number {
  const profile = resolveBattleUnitSpineVisualProfile(unit, boss);
  const effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(rawWidth, rawHeight, profile, unit);
  const safeWidth = effectiveRawSize.width;
  const safeHeight = effectiveRawSize.height;
  const targetHeight = slotHeight * profile.targetHeightRatio;
  const maxWidth = slotWidth * profile.maxWidthRatio;
  const fit = Math.min(targetHeight / safeHeight, maxWidth / safeWidth) * profile.scaleMultiplier;
  const baseScale = clamp(fit, profile.minScale * uiScale, profile.maxScale * uiScale);
  const tier = unit ? resolveBattleUnitSpineRarityTier(unit) : 'DEFAULT';
  // P8 敌方怪物:目标视高对齐立绘 standin 盒(min(170×ui, 格高×0.9))× 模板 display_scale。
  // S196 的 bounds 常被特效附件(投射物/冲锋轨迹)拉大 → 按它算会偏小,统一交给后台 display_scale 校准。
  if (unit && unit.side === 'enemy') {
    // 上限 3.5:输出试炼巨兽 BOSS(3.4)需要;DB 配置怪最大 1.45 不受影响。
    const monsterScale = Math.max(0.5, Math.min(3.5, unit.monsterDisplayScale ?? 1));
    const standinHeight = Math.min(170 * uiScale, slotHeight * 0.9);
    return clamp((standinHeight * monsterScale) / safeHeight, 0.02 * uiScale, 6 * uiScale);
  }
  if (unit?.scaleProfile === 'FORMATION_PREVIEW') {
    // 站台统一体型:按"统一目标高/有效原高"定缩放(不受 baseScale 封顶),画布差用共用补偿表精确抵消。
    const uniformVisualHeight = slotHeight * resolveBattleUnitFormationPreviewMaxHeightRatio(unit, tier);
    const previewAsset = unit ? resolveBattleUnitSpinePrimaryAsset(unit) : null;
    return (uniformVisualHeight / safeHeight) * resolveCanvasCompensation(previewAsset, BATTLE_ACT_CANVAS_COMPENSATION_BY_ASSET);
  }
  // 我方英雄(战斗/大厅):与布阵完全同一条基础公式(统一目标高×布阵逐资源比例表/有效原高×逐英雄表),
  // 仅乘场景整体系数 BATTLE_COMBAT_SIZE_SCALE;这样布阵调好的相对比例在战斗/大厅原样成立。
  // 敌方与 BOSS 仍走下方原 profile 路径(敌怪体型另有校准)。
  if (unit && unit.side !== 'enemy' && !boss) {
    const allyRatio = resolveBattleUnitFormationPreviewMaxHeightRatio(unit, tier);
    const allyAsset = resolveBattleUnitSpinePrimaryAsset(unit);
    // 2026-08-01:补偿表与布阵统一为 ACT 表——两页相对比例永远一致,体型只需调一张表;
    // 整体大小仍由 BATTLE_COMBAT_SIZE_SCALE 控制。(旧 COMBAT 表弃用保留作参考。)
    return ((slotHeight * allyRatio * BATTLE_COMBAT_SIZE_SCALE) / safeHeight)
      * resolveCanvasCompensation(allyAsset, BATTLE_ACT_CANVAS_COMPENSATION_BY_ASSET)
      * ((allyAsset ? BATTLE_COMBAT_EXTRA_SCALE_BY_ASSET[allyAsset] : undefined) ?? 1);
  }
  // 战斗中按资源缩放微调（仅战斗，不影响编队预览）。
  const primaryAsset = unit ? resolveBattleUnitSpinePrimaryAsset(unit) : null;
  const assetMultiplier = (primaryAsset ? BATTLE_STAGE12_COMBAT_SCALE_MULTIPLIER_BY_ASSET[primaryAsset] : undefined) ?? 1;
  // 战斗内大体型(SSR/UR/named/BOSS)缩小 12%,避免立绘超出实景地面带;
  // SR/R 本就受 0.84 上限约束且贴近可读性下限(守卫 230px),保持原比例。
  const combatGlobalMultiplier = 0.88;
  if (tier === 'SR' || tier === 'R') {
    const maxVisualHeight = slotHeight * BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO;
    return Math.min(baseScale, maxVisualHeight / safeHeight) * assetMultiplier;
  }
  return baseScale * assetMultiplier * combatGlobalMultiplier;
}

export function resolveBattleUnitSpineNodePosition(
  runtimeData: BattleUnitSpineRuntimeData,
  resolvedScale: number,
  slotHeight: number,
  unit: BattlePresentationUnitSnapshot,
  enemy: boolean,
): { x: number; y: number } {
  const profile = resolveBattleUnitSpineVisualProfile(unit, unit.role === 'boss');
  const rawWidth = normalizeRawSpineSize(runtimeData.width, profile.fallbackRawHeight * 0.62);
  const rawHeight = normalizeRawSpineSize(runtimeData.height, profile.fallbackRawHeight);
  const effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(runtimeData.width, runtimeData.height, profile, unit);
  const inflated = isBattleUnitSpineEffectInflatedActBounds(rawWidth, rawHeight, profile, unit);
  const rawX = inflated ? -effectiveRawSize.width / 2 : normalizeRawSpineOffset(runtimeData.x, -effectiveRawSize.width / 2);
  const rawY = inflated ? 0 : normalizeRawSpineOffset(runtimeData.y, 0);
  const centerX = rawX + effectiveRawSize.width / 2;
  const targetFootY = -slotHeight * 0.42;
  // S196 敌怪 bounds 被特效附件拉偏(x/y 大幅为正),中心补偿会把画面推出屏;
  // 素材原点即脚底中心,敌怪直接原点对地、不做 bounds 偏移补偿。
  if (enemy && (unit.monsterSkinAsset || unit.monsterDisplayScale != null)) {
    return { x: 0, y: targetFootY };
  }
  return {
    x: (enemy ? 1 : -1) * centerX * resolvedScale,
    y: targetFootY - rawY * resolvedScale,
  };
}

export function resolveBattleUnitSpineTelemetryVisualHeight(
  rawWidth: number | undefined,
  rawHeight: number | undefined,
  resolvedScale: number,
  unit: BattlePresentationUnitSnapshot,
  boss: boolean,
): number {
  const profile = resolveBattleUnitSpineVisualProfile(unit, boss);
  const effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(rawWidth, rawHeight, profile, unit);
  return effectiveRawSize.height * resolvedScale;
}

export function resolveBattleUnitSpineMirrorScaleX(spineScale: number, enemy: boolean): number {
  return enemy ? -spineScale : spineScale;
}

export function patchBattleUnitSpineRuntimeEnums(data: sp.SkeletonData, runtimeData: BattleUnitSpineRuntimeData): void {
  const skinNames = resolveBattleUnitSpineSkinNames(data, runtimeData);
  const animationNames = resolveBattleUnitSpineAnimationNameList(data);
  const mutableData = data as unknown as {
    getSkinsEnum?: () => { [key: string]: number } | null;
    getAnimsEnum?: () => { [key: string]: number } | null;
  };
  mutableData.getSkinsEnum = () => createBattleUnitSpineEnumMap(skinNames.length > 0 ? skinNames : ['default'], 0) as { [key: string]: number };
  mutableData.getAnimsEnum = () => {
    const enumMap = createBattleUnitSpineEnumMap(animationNames, 1);
    enumMap['<None>'] = 0;
    enumMap[0] = '<None>';
    return enumMap as { [key: string]: number };
  };
}

export function resolveBattleUnitSpineSkinName(data: sp.SkeletonData, runtimeData: BattleUnitSpineRuntimeData): string | null {
  const names = resolveBattleUnitSpineSkinNames(data, runtimeData);
  return resolvePreferredBattleUnitSpineName(names, 'default', []) ?? names[0] ?? null;
}

function sanitizeSpineAsset(asset: string | null | undefined): string | null {
  const value = (asset || '').trim();
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function resolveBattleUnitPortraitAssetAsBattleSpine(asset: string | null | undefined): string | null {
  const value = sanitizeSpineAsset(asset);
  // 战斗中 SR/R 等英雄配置 portrait_asset=act_* 时，必须使用 act_* 骨骼，才能播放 run/skill0/skill1 等动作。
  return value !== null && value.startsWith('act_') ? value : null;
}

function deriveBattleSpineAssetFromPortrait(asset: string | null | undefined): string | null {
  const value = sanitizeSpineAsset(asset);
  if (!value || !value.startsWith('act_')) {
    return null;
  }
  return `npc_${value.slice('act_'.length)}`;
}

function sanitizeSpineResource(asset: string | null | undefined): string | null {
  const value = (asset || '').trim();
  return /^spine\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..') ? value : null;
}

function resolveBattleUnitSpineSkinNames(data: sp.SkeletonData, runtimeData: BattleUnitSpineRuntimeData): string[] {
  const jsonNames = resolveBattleUnitSpineJsonSkinNames(data);
  const runtimeNames = (runtimeData.skins ?? []).map((skin) => (skin?.name || '').trim()).filter(Boolean);
  return Array.from(new Set([...jsonNames, ...runtimeNames]));
}

function resolveBattleUnitSpineAnimationNameList(data: sp.SkeletonData): string[] {
  const jsonAnimations = (data as unknown as { _skeletonJson?: { animations?: unknown } })._skeletonJson?.animations;
  const enumNames = resolveBattleUnitSpineEnumAnimationNames(data);
  if (jsonAnimations && typeof jsonAnimations === 'object' && !Array.isArray(jsonAnimations)) {
    return Array.from(new Set([...Object.keys(jsonAnimations), ...enumNames].filter(Boolean)));
  }
  if (Array.isArray(jsonAnimations)) {
    const jsonNames = jsonAnimations.map((animation) => ((animation as { name?: string } | null)?.name || '').trim()).filter(Boolean);
    return Array.from(new Set([...jsonNames, ...enumNames].filter(Boolean)));
  }
  const runtimeData = data.getRuntimeData(false) as BattleUnitSpineRuntimeData | null;
  const runtimeNames = (runtimeData?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
  return Array.from(new Set([...runtimeNames, ...enumNames].filter(Boolean)));
}

function resolveBattleUnitSpineEnumAnimationNames(data: sp.SkeletonData): string[] {
  const getAnimsEnum = (data as unknown as { getAnimsEnum?: () => BattleUnitSpineEnumMap | null }).getAnimsEnum;
  if (typeof getAnimsEnum !== 'function') {
    return [];
  }
  try {
    const enumMap = getAnimsEnum();
    if (!enumMap || typeof enumMap !== 'object') {
      return [];
    }
    return Object.keys(enumMap)
      .filter((key) => key !== '<None>' && Number.isNaN(Number(key)))
      .map((key) => key.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function resolveBattleUnitSpineJsonSkinNames(data: sp.SkeletonData): string[] {
  const skins = (data as unknown as { _skeletonJson?: { skins?: unknown } })._skeletonJson?.skins;
  if (Array.isArray(skins)) {
    return skins.map((skin) => ((skin as { name?: string } | null)?.name || '').trim()).filter(Boolean);
  }
  if (skins && typeof skins === 'object') {
    return Object.keys(skins);
  }
  return [];
}

function resolvePreferredBattleUnitSpineName(names: string[], preferred: string, fallbackHints: string[]): string | null {
  if (names.length === 0 && preferred) {
    return preferred;
  }
  if (preferred && names.includes(preferred)) {
    return preferred;
  }
  const normalizedPreferred = preferred.toLowerCase();
  const exact = names.find((name) => name.toLowerCase() === normalizedPreferred);
  if (exact) {
    return exact;
  }
  for (const hint of fallbackHints) {
    const lowerHint = hint.toLowerCase();
    const matched = names.find((name) => name.toLowerCase().includes(lowerHint));
    if (matched) {
      return matched;
    }
  }
  return null;
}

export function resolveBattleUnitSpineVisualProfile(unit: BattlePresentationUnitSnapshot | undefined, boss: boolean): BattleUnitSpineVisualProfile {
  if (boss) {
    return BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.BOSS;
  }
  const profileKey = (unit?.scaleProfile || unit?.rarity || '').trim().toUpperCase();
  if (profileKey === 'FORMATION_PREVIEW') {
    const rarityKey = (unit?.rarity || '').trim().toUpperCase();
    const rarityProfile = BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY[rarityKey];
    if (rarityKey === 'R' || rarityKey === 'SR') {
      return {
        ...BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW,
        targetHeightRatio: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.targetHeightRatio, rarityProfile?.targetHeightRatio ?? 0),
        maxWidthRatio: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.maxWidthRatio, rarityProfile?.maxWidthRatio ?? 0),
        maxScale: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.maxScale, rarityProfile?.maxScale ?? 0),
        scaleMultiplier: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.scaleMultiplier, 2.08),
      };
    }
    return BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW;
  }
  const primaryAsset = unit ? resolveBattleUnitSpinePrimaryAsset(unit) : null;
  const tier = unit ? resolveBattleUnitSpineRarityTier(unit) : 'DEFAULT';
  if (tier === 'SR' || tier === 'R') {
    return BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY[tier];
  }
  if (primaryAsset) {
    const assetProfile = BATTLE_STAGE12_SPINE_PROFILE_BY_ASSET[primaryAsset];
    if (assetProfile) {
      return assetProfile;
    }
  }
  return BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY[profileKey] ?? BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.DEFAULT;
}

function normalizeRawSpineSize(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value || value < 8) {
    return fallback;
  }
  return value;
}

function resolveBattleUnitSpineEffectiveRawSize(
  rawWidth: number | undefined,
  rawHeight: number | undefined,
  profile: BattleUnitSpineVisualProfile,
  unit: BattlePresentationUnitSnapshot | undefined,
): { width: number; height: number } {
  const safeWidth = Math.max(1, normalizeRawSpineSize(rawWidth, profile.fallbackRawHeight * 0.62));
  const safeHeight = Math.max(1, normalizeRawSpineSize(rawHeight, profile.fallbackRawHeight));
  if (!isBattleUnitSpineEffectInflatedActBounds(safeWidth, safeHeight, profile, unit)) {
    return { width: safeWidth, height: safeHeight };
  }
  return {
    width: Math.max(1, profile.fallbackRawHeight * 0.62),
    height: Math.max(1, profile.fallbackRawHeight),
  };
}

function isBattleUnitSpineEffectInflatedActBounds(
  rawWidth: number,
  rawHeight: number,
  profile: BattleUnitSpineVisualProfile,
  unit: BattlePresentationUnitSnapshot | undefined,
): boolean {
  if (!unit) {
    return false;
  }
  const formationPreview = unit.scaleProfile === 'FORMATION_PREVIEW';
  if (formationPreview) {
    const formationAspect = rawWidth / Math.max(1, rawHeight);
    return formationAspect >= 1.65
      || rawWidth >= profile.fallbackRawHeight * 2.15
      || rawHeight >= profile.fallbackRawHeight * 1.3;
  }
  const tier = resolveBattleUnitSpineRarityTier(unit);
  if (tier !== 'SR' && tier !== 'R') {
    return false;
  }
  const primaryAsset = resolveBattleUnitSpinePrimaryAsset(unit);
  if (primaryAsset && !primaryAsset.startsWith('act_')) {
    return false;
  }
  const aspect = rawWidth / Math.max(1, rawHeight);
  return aspect >= 1.8
    || rawWidth >= profile.fallbackRawHeight * 2.35
    || rawHeight >= profile.fallbackRawHeight * 1.45;
}

function resolveBattleUnitFormationPreviewMaxHeightRatio(unit: BattlePresentationUnitSnapshot, tier: BattleUnitSpineRarityTier): number {
  const primaryAsset = resolveBattleUnitSpinePrimaryAsset(unit);
  const assetRatio = primaryAsset ? BATTLE_STAGE12_FORMATION_PREVIEW_HEIGHT_RATIO_BY_ASSET[primaryAsset] : undefined;
  if (assetRatio !== undefined) {
    return assetRatio;
  }
  return tier === 'SR' || tier === 'R'
    ? BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO
    : BATTLE_FORMATION_DEFAULT_MAX_HEIGHT_RATIO;
}

function normalizeRawSpineOffset(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function createBattleUnitSpineEnumMap(names: string[], startIndex: number): BattleUnitSpineEnumMap {
  const enumMap: BattleUnitSpineEnumMap = {};
  names.filter(Boolean).forEach((name, index) => {
    const value = startIndex + index;
    enumMap[name] = value;
    enumMap[value] = name;
  });
  return enumMap;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
