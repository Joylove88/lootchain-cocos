// 守卫战词条配置(docs/32 v2,2026-09-21 用户拍板开工):普攻原型、蓝卡(普攻强化)、紫卡(英雄专属)、金卡(专属大招觉醒)。
// 纯数据、无 cc 依赖(与 GuardBattleModel 一起可 node 离线跑)。数值改这里,逻辑在 GuardBattleModel。
// 用户 2026-09-21 定:契约魔女=紫电球(元素球+雷);旋风给伊芙琳与夜烬女王莉维娅(持镰);合成身份不保留(投资作废也是运气的一部分)。

export type GuardPerkRarity = 'white' | 'blue' | 'purple' | 'gold';
export type GuardAttackArchetype = 'orb' | 'whirl' | 'slash' | 'dagger' | 'arrow' | 'shock' | 'holy';
export type GuardElement = 'fire' | 'ice' | 'thunder' | 'dark' | 'poison' | 'holy' | 'edge';

export const GUARD_ARCHETYPE_LABEL: Record<GuardAttackArchetype, string> = {
  orb: '元素球',
  whirl: '旋风',
  slash: '剑光',
  dagger: '双匕',
  arrow: '箭矢',
  shock: '盾枪',
  holy: '圣光',
};

// ── 蓝卡:普攻强化(P1 六条;分裂/弹射/环绕/回响/驻留等 P2)──
export type GuardBluePerkId = 'atk_multishot' | 'atk_spread' | 'atk_pierce' | 'atk_giant' | 'atk_crit' | 'atk_haste';

export interface GuardBluePerkDef {
  id: GuardBluePerkId;
  name: string;
  /** count=数量类 / form=形态类(每英雄只能持有 1 条)/ func=功能类。 */
  category: 'count' | 'form' | 'func';
  /** 适用原型;null=全部。 */
  archetypes: GuardAttackArchetype[] | null;
  maxStack: number;
  /** 近战原型(剑光/双匕/盾枪)的卡面名:同一机制换近战说法(多重→连斩、穿透→贯穿),避免近战英雄拿到"弹道"字样的卡。 */
  meleeName?: string;
  /** 卡面描述(按将要到达的层数 + 该英雄的普攻原型:措辞用他自己的普攻形态,不写"主弹/发"这类远程词)。 */
  describe: (level: number, archetype: GuardAttackArchetype) => string;
}

/** 各原型普攻的名词与量词(卡面描述用):近战打出去的是剑光/刃光/枪芒,不是"弹"。 */
export const GUARD_ARCHETYPE_NOUN: Record<GuardAttackArchetype, { noun: string; unit: string }> = {
  orb: { noun: '元素球', unit: '颗' },
  whirl: { noun: '旋风', unit: '道' },
  slash: { noun: '剑光', unit: '道' },
  dagger: { noun: '刃光', unit: '道' },
  arrow: { noun: '箭矢', unit: '支' },
  shock: { noun: '枪芒', unit: '道' },
  holy: { noun: '圣光', unit: '道' },
};

export function guardArchetypeIsMelee(archetype: GuardAttackArchetype): boolean {
  return archetype === 'slash' || archetype === 'dagger' || archetype === 'shock';
}

export function guardBluePerkName(def: GuardBluePerkDef, archetype: GuardAttackArchetype): string {
  return guardArchetypeIsMelee(archetype) && def.meleeName ? def.meleeName : def.name;
}

/** 多重:共 N 发、每发系数(对群 ×1.56/2.04/2.48,单体 ×1.17/1.36/1.55)。 */
export const GUARD_MULTISHOT_SHOTS = [1, 2, 3, 4];
export const GUARD_MULTISHOT_COEF = [1, 0.78, 0.68, 0.62];
/** 多重的多余发(目标不足时打主目标)只计 50%。 */
export const GUARD_MULTISHOT_OVERFLOW = 0.5;
/** 散射:额外 2 发侧翼弹打射程内最远的 2 只。 */
export const GUARD_SPREAD_COEF = [0, 0.35, 0.5, 0.65];
/** 穿透:主弹穿透主目标身后最近 N 只,各 50%。 */
export const GUARD_PIERCE_COUNT = [0, 1, 2, 3];
export const GUARD_PIERCE_COEF = 0.5;
/** 巨型:命中点 ±0.7 格内最近 N 只各 25% 溅射;表现体积倍率。 */
export const GUARD_GIANT_COUNT = [0, 2, 3, 4];
export const GUARD_GIANT_COEF = 0.25;
export const GUARD_GIANT_RADIUS = 0.7;
/** 2026-09-21 用户反馈"巨型没看出效果":1.3/1.6/2.0 → 1.5/1.9/2.4,且近战命中爆开的斩击也按此放大。 */
export const GUARD_GIANT_VISUAL_SCALE = [1, 1.5, 1.9, 2.4];
/** 会心:每第 5 次出手必暴击。 */
export const GUARD_CRIT_EVERY = 5;
export const GUARD_CRIT_MULT = [1, 1.6, 1.9, 2.2];
/** 急速:出手频率倍率。 */
export const GUARD_HASTE_MULT = [1, 1.1, 1.2, 1.3];

/** 硬钳(docs/32 §10.2):单次出手所有命中合计 / 同一目标合计 / 命中数 / 本击倍率×条件乘区。 */
export const GUARD_ATTACK_TOTAL_COEF_CAP = 4.0;
export const GUARD_ATTACK_TARGET_COEF_CAP = 2.0;
export const GUARD_ATTACK_MAX_HITS = 12;
export const GUARD_ATTACK_MULT_CAP = 3.2;
/** 常驻出手频率钳(白卡攻速 × 急速);≥1.9 时攻速类词条不再入池。 */
export const GUARD_FREQ_CAP = 2.0;
export const GUARD_FREQ_POOL_CUTOFF = 1.9;
/** 每名英雄蓝卡合计层数上限。 */
export const GUARD_BLUE_LAYERS_PER_HERO = 6;
/** 词条新增的治疗每波上限(占水晶最大生命)。 */
export const GUARD_PERK_HEAL_CAP_PER_WAVE = 0.08;

export const GUARD_BLUE_PERKS: GuardBluePerkDef[] = [
  {
    id: 'atk_multishot',
    name: '多重',
    category: 'count',
    archetypes: null,
    maxStack: 3,
    meleeName: '连斩',
    describe: (level, archetype) => {
      const { noun, unit } = GUARD_ARCHETYPE_NOUN[archetype];
      return `每次普攻打出 ${GUARD_MULTISHOT_SHOTS[level]} ${unit}${noun},每${unit} ${Math.round(GUARD_MULTISHOT_COEF[level] * 100)}% 伤害;多出的${noun}打向下一只怪`;
    },
  },
  {
    id: 'atk_spread',
    name: '散射',
    category: 'count',
    archetypes: ['orb', 'arrow', 'holy'],
    maxStack: 3,
    describe: (level, archetype) => {
      const { noun, unit } = GUARD_ARCHETYPE_NOUN[archetype];
      return `额外向两侧各射出 1 ${unit}${noun},打最远的 2 只怪,各 ${Math.round(GUARD_SPREAD_COEF[level] * 100)}% 伤害`;
    },
  },
  {
    id: 'atk_pierce',
    name: '穿透',
    category: 'form',
    archetypes: ['arrow', 'slash', 'shock'],
    maxStack: 3,
    meleeName: '贯穿',
    describe: (level, archetype) => `${GUARD_ARCHETYPE_NOUN[archetype].noun}命中后继续贯穿目标身后最近 ${GUARD_PIERCE_COUNT[level]} 只怪,各 ${Math.round(GUARD_PIERCE_COEF * 100)}% 伤害`,
  },
  {
    id: 'atk_giant',
    name: '巨型',
    category: 'func',
    archetypes: null,
    maxStack: 3,
    describe: (level, archetype) => `${GUARD_ARCHETYPE_NOUN[archetype].noun}放大 ×${GUARD_GIANT_VISUAL_SCALE[level]};命中时波及目标旁最近 ${GUARD_GIANT_COUNT[level]} 只怪,各 ${Math.round(GUARD_GIANT_COEF * 100)}% 伤害`,
  },
  {
    id: 'atk_crit',
    name: '会心',
    category: 'func',
    archetypes: null,
    maxStack: 3,
    describe: (level) => `每第 ${GUARD_CRIT_EVERY} 次出手必暴击 ×${GUARD_CRIT_MULT[level]}`,
  },
  {
    id: 'atk_haste',
    name: '急速',
    category: 'func',
    // 圣光(辅助)的出手节拍同时是回血节拍,急速不入池(docs/32:新增频率来源不加快回血)。
    archetypes: ['orb', 'whirl', 'slash', 'dagger', 'arrow', 'shock'],
    maxStack: 3,
    describe: (level) => `出手频率 ×${GUARD_HASTE_MULT[level]}`,
  },
];

// ── 紫卡:英雄专属(A 批,每英雄 1 条,3 层)──
export interface GuardPurplePerkDef {
  /** 后缀;完整 id = hero_<英雄编码>_<suffix>。 */
  suffix: string;
  name: string;
  /** 流派名(写进英雄信息卡)。 */
  school: string;
  /** 三层数值(含义见 describe)。 */
  values: [number, number, number];
  describe: (value: number) => string;
  /** 车轮战禁用(血契)。 */
  standardOnly?: boolean;
}

export interface GuardHeroPerkProfile {
  archetype: GuardAttackArchetype;
  element: GuardElement;
  /** 普攻外观一句话(卡面/信息卡用)。 */
  look: string;
  purple: GuardPurplePerkDef | null;
}

const pct = (value: number): string => `${Math.round(value * 100)}%`;

export const GUARD_HERO_PERK_PROFILE: Record<string, GuardHeroPerkProfile> = {
  UR_ARTHAS: {
    archetype: 'slash', element: 'fire', look: '暗红巨型月牙,龙焰火星',
    purple: { suffix: 'dragonslayer', name: '屠龙者', school: '屠龙火剑', values: [0.10, 0.18, 0.25], describe: (v) => `对精英与 BOSS +${pct(v)};击杀精英时龙焰爆,最近 10 只各 150%(每波 1 次)` },
  },
  UR_ATLAS: {
    archetype: 'shock', element: 'holy', look: '金色大扇形盾波',
    purple: { suffix: 'riposte', name: '盾反', school: '反击壁垒', values: [0.4, 0.7, 1.0], describe: (v) => `水晶每受击攒 1 枚金印(最多 3 枚);每枚让他的下一击 +${pct(v)}` },
  },
  UR_AURELIA: {
    archetype: 'arrow', element: 'edge', look: '青翠光箭,翎羽拖尾',
    purple: { suffix: 'focus', name: '追猎之翎', school: '破甲追击', values: [0.04, 0.06, 0.08], describe: (v) => `连续命中同一目标每次 +${pct(v)},最多 5 次` },
  },
  UR_EVELYN: {
    archetype: 'whirl', element: 'ice', look: '冰蓝霜旋风,卷起冰晶',
    purple: { suffix: 'deepchill', name: '深寒', school: '冰控', values: [0.4, 0.6, 0.8], describe: (v) => `每第 5 击,减速中的怪(最近 5 只)脚下升起冰刺,各 ${pct(v)}` },
  },
  UR_NYX: {
    archetype: 'dagger', element: 'dark', look: '暗紫双影 X 斩,带残影',
    purple: { suffix: 'execute', name: '处刑宣告', school: '处刑', values: [0.2, 0.25, 0.3], describe: (v) => `目标生命低于 ${pct(v)} 时该击 ×${v <= 0.2 ? 1.5 : v <= 0.25 ? 1.75 : 2.0}(对 BOSS 加成减半)` },
  },
  UR_SERAPHINA: {
    archetype: 'holy', element: 'holy', look: '银蓝星光坠落',
    purple: { suffix: 'grace', name: '晨星恩典', school: '续航星落', values: [0.03, 0.035, 0.04], describe: (v) => `出手回水晶从 2.5% 提到 ${(v * 100).toFixed(1)}%` },
  },
  SSR_KANE: {
    archetype: 'shock', element: 'holy', look: '银白直线枪芒',
    purple: { suffix: 'longlance', name: '贯日长枪', school: '贯穿荆棘', values: [1, 2, 3], describe: (v) => `普攻自带贯穿,身后最近 ${v} 只各 50%` },
  },
  SSR_LIVIA: {
    // 用户 2026-09-21:夜烬女王持镰,普攻用旋风。
    archetype: 'whirl', element: 'fire', look: '夜烬橙红镰刃旋风,黑烟拖尾',
    purple: { suffix: 'pyre', name: '余烬爆燃', school: '灼烧爆燃', values: [0.3, 0.45, 0.6], describe: (v) => `被她击杀的怪爆燃,±0.8 格内最近 4 只受 ${pct(v)}(不连锁)` },
  },
  SSR_MICHAEL: {
    archetype: 'slash', element: 'thunder', look: '金白十字剑光,带电弧',
    purple: { suffix: 'verdict', name: '审判', school: '单体审判', values: [1.9, 2.2, 2.5], describe: (v) => `技能击倍率从 1.6 提到 ${v}` },
  },
  SSR_RON: {
    archetype: 'dagger', element: 'fire', look: '灰橙匕首二连,余烬飘散',
    purple: { suffix: 'mark', name: '灰烬印记', school: '连击暴击', values: [0.2, 0.35, 0.5], describe: (v) => `会心倍率与技能击倍率都 +${v}` },
  },
  SR_ABYSS_06: {
    archetype: 'dagger', element: 'dark', look: '深蓝裂痕斩,空间裂纹',
    purple: { suffix: 'phase', name: '相位突袭', school: '相位突袭', values: [0.8, 1.1, 1.4], describe: (v) => `每第 5 击,闪现到生命比例最高的怪身后补一击 ${pct(v)}` },
  },
  SR_BLADE_04: {
    archetype: 'slash', element: 'edge', look: '猩红缺口短弧',
    purple: { suffix: 'fury', name: '断刃狂怒', school: '背水', values: [0.03, 0.04, 0.05], describe: (v) => `水晶每损失 10% 生命,自身攻击 +${pct(v)}` },
  },
  SR_PALADIN_02: {
    archetype: 'shock', element: 'holy', look: '淡金小盾波',
    purple: { suffix: 'punish', name: '惩戒', school: '守晶惩戒', values: [0.5, 0.75, 1.0], describe: (v) => `每第 4 击,对正在攻击水晶的怪(最近 3 只)落下光锤,各 ${pct(v)}` },
  },
  SR_PRIEST_01: {
    archetype: 'holy', element: 'holy', look: '银白细光柱',
    purple: { suffix: 'echo', name: '祷言回响', school: '圣光回响', values: [1.0, 1.4, 1.8], describe: (v) => `每第 2 次出手追加一道回响圣光,${pct(v)} 攻击(不带回血)` },
  },
  SR_SNIPER_05: {
    archetype: 'arrow', element: 'fire', look: '钢灰弩矢,橙色尾焰',
    purple: { suffix: 'headhunt', name: '猎首', school: '爆破猎首', values: [0.6, 0.9, 1.2], describe: (v) => `优先锁定精英/BOSS 与血量最高的怪;每第 4 箭爆头 +${pct(v)}` },
  },
  SR_WITCH_03: {
    // 用户 2026-09-21:契约魔女=紫电球(元素球+雷)。
    archetype: 'orb', element: 'thunder', look: '紫电球,符文电弧',
    purple: { suffix: 'pact', name: '血契', school: '代价换输出', values: [0.2, 0.35, 0.5], standardOnly: true, describe: (v) => `自身攻击 +${pct(v)};代价:她在场的波次开始时水晶 -${v <= 0.2 ? 2 : v <= 0.35 ? 3 : 4}%(单局至多 -12%)` },
  },
  R_ACOLY_02: {
    archetype: 'holy', element: 'holy', look: '暖黄微光点',
    purple: { suffix: 'prayer', name: '微光祷告', school: '低配续航', values: [1.5, 1.75, 2.0], describe: (v) => `水晶生命低于 50% 时,他给水晶的回复 ×${v}` },
  },
  R_CULT_05: {
    archetype: 'orb', element: 'poison', look: '幽绿咒球,绿雾拖尾',
    purple: { suffix: 'curseburst', name: '疫咒', school: '叠毒咒爆', values: [0.6, 0.8, 1.0], describe: (v) => `每第 4 次普攻改为咒爆,±0.8 格内最近 4 只受 ${pct(v)}` },
  },
  R_GUARD_07: {
    archetype: 'shock', element: 'edge', look: '铁灰盾撞尘环',
    purple: { suffix: 'veteran', name: '老兵', school: 'R 卡逆袭', values: [0.25, 0.4, 0.6], describe: (v) => `自身攻击 +${pct(v)}` },
  },
  R_PATROL_01: {
    archetype: 'slash', element: 'ice', look: '蓝白霜刃细月牙',
    purple: { suffix: 'formation', name: '王国编制', school: '群狼', values: [0.06, 0.09, 0.12], describe: (v) => `场上每多 1 个巡逻兵单位,全体巡逻兵攻击 +${pct(v)}(最多计 4 个)` },
  },
  R_RANGER_06: {
    archetype: 'arrow', element: 'edge', look: '草绿木羽箭,落叶拖尾',
    purple: { suffix: 'skirmish', name: '游击', school: '防空游击', values: [0.5, 0.7, 0.9], describe: (v) => `每第 3 箭,同时向射程内最远的怪补射一箭 ${pct(v)}` },
  },
  R_SCOUT_03: {
    archetype: 'dagger', element: 'edge', look: '钢银单匕快斩,带血线',
    purple: { suffix: 'cutthroat', name: '割喉', school: '收割', values: [0.6, 0.9, 1.2], describe: (v) => `每第 5 击,对射程内生命最低的怪补一刀 ${pct(v)}` },
  },
};

/** 未登记编码(老账号下架英雄/主角)的兜底:按定位给原型,没有紫卡。 */
export function resolveGuardHeroPerkProfile(heroCode: string, role: 'melee' | 'ranged' | 'support' | 'control'): GuardHeroPerkProfile {
  const found = GUARD_HERO_PERK_PROFILE[(heroCode || '').toUpperCase()];
  if (found) {
    return found;
  }
  const archetype: GuardAttackArchetype = role === 'support' ? 'holy' : role === 'ranged' ? 'arrow' : role === 'control' ? 'orb' : 'slash';
  return { archetype, element: 'edge', look: '', purple: null };
}

export function guardPurplePerkId(heroCode: string, suffix: string): string {
  return `hero_${heroCode.toUpperCase()}_${suffix}`;
}

// ── 金卡:专属大招觉醒(方案 A:2★ 战技原样保留,金卡把战技升级为专属大招)──
export const GUARD_ULT_MAX_LEVEL = 3;
/** 伤害/回复倍率:Lv1 ×1.5;Lv2 再 +30%(×1.95);Lv3 同 Lv2,另加范围/持续 +50%。 */
export const GUARD_ULT_DAMAGE_MULT = [1, 1.5, 1.95, 1.95];
/** 冷却系数:Lv1 -15%;Lv2 再 -15%。 */
export const GUARD_ULT_CD_MULT = [1, 0.85, 0.7225, 0.7225];
/** Lv3:区域持续/击退/增益时长倍率。 */
export const GUARD_ULT_LV3_EXTENT = 1.5;

export function describeGuardUltLevel(level: number): string {
  if (level <= 1) {
    return '战技觉醒为专属大招:换专属特效,伤害/回复 ×1.5,冷却 -15%';
  }
  if (level === 2) {
    return '大招 Lv2:伤害/回复再 +30%,冷却再 -15%';
  }
  return '大招 Lv3:范围、击退与持续时间 +50%';
}

// ── 抽取规则参数(docs/32 §2.3)──
/** 在场单位的星级权重:1★=1,2★=2,3★=4,4★=7,5★=12。 */
export const GUARD_STAR_WEIGHT = [0, 1, 2, 4, 7, 12];
/** 非金格按强化次数开闸:白/蓝/紫。 */
export function guardRarityGate(pickIndex: number): { white: number; blue: number; purple: number } {
  if (pickIndex <= 2) {
    return { white: 35, blue: 50, purple: 15 };
  }
  if (pickIndex <= 4) {
    return { white: 25, blue: 45, purple: 30 };
  }
  return { white: 15, blue: 40, purple: 45 };
}
// 2026-09-21 用户反馈"强化买到 2000 金币档才出 1 张金卡,太低":首次 25%→50%,基础 12%→30%,每次未出 +12%→+25%,最多连续不出 3→2 次(平均约每 2 次强化见 1 张)。
export const GUARD_GOLD_FIRST_CHANCE = 0.5;
export const GUARD_GOLD_BASE_CHANCE = 0.3;
export const GUARD_GOLD_STEP_CHANCE = 0.25;
export const GUARD_GOLD_STAR3_BONUS = 0.03;
export const GUARD_GOLD_STAR3_BONUS_CAP = 0.12;
/** 首张之后最多连续 2 次不出。 */
export const GUARD_GOLD_MAX_MISS = 2;
export const GUARD_OWNED_BIAS = 0.45;
/** 上阵但不在场的英雄:前 3 次强化不出,之后权重 0.25。 */
export const GUARD_OFFFIELD_WEIGHT = 0.25;
export const GUARD_OFFFIELD_FROM_PICK = 4;
export const GUARD_SUPPORT_BLUE_WEIGHT = 0.5;
export const GUARD_SUPPORT_FIRST_GOLD_WEIGHT = 0.3;

// ── 白卡(通用):标准模式因波末赠送强化而降值,车轮战沿用原值 ──
export type GuardWhitePerkId = 'gen_team_atk' | 'gen_team_aspd' | 'gen_gold_gain' | 'gen_summon_discount' | 'gen_thorns' | 'gen_crystal_repair';
export const GUARD_WHITE_CAP: Record<GuardWhitePerkId, number> = {
  gen_team_atk: 4,
  gen_team_aspd: 4,
  gen_gold_gain: 3,
  gen_summon_discount: 3,
  gen_thorns: 3,
  gen_crystal_repair: 99,
};
export function guardWhiteValue(id: GuardWhitePerkId, rush: boolean): number {
  switch (id) {
    case 'gen_team_atk': return rush ? 10 : 6;
    case 'gen_team_aspd': return rush ? 8 : 5;
    case 'gen_gold_gain': return 10;
    case 'gen_summon_discount': return 10;
    case 'gen_thorns': return 50;
    default: return 25;
  }
}

/** 波末赠送强化(docs/32 §2.2 甲案):10 波局第 2/4/6/8 波末、20 波局第 4/8/12/16 波末;车轮战不送;最多攒 2 次。 */
export const GUARD_FREE_ENHANCE_GRANTS = 4;
export const GUARD_FREE_ENHANCE_BANK = 2;
export const GUARD_FREE_ENHANCE_FALLBACK_GOLD = 200;
export function guardFreeEnhanceWaves(maxWave: number): number[] {
  const step = Math.max(1, Math.round(maxWave / 5));
  return Array.from({ length: GUARD_FREE_ENHANCE_GRANTS }, (_, index) => step * (index + 1)).filter((wave) => wave < maxWave);
}
