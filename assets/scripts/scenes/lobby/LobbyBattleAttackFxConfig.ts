// 英雄普攻表现配置(2026-09-12 用户反馈:近战/远程普攻都是同一颗魔法弹太单调 → 一人一套专属普攻表现)。
// 素材:assets/resources/ui/battle/attack/atk_<name>.png(gpt-image-2 透明底直出,仅裁透明边+等比缩放,原图备份 素材原始备份/battle-attack-fx-20260912)。
// kind=bolt:弹道贴图(朝右绘制,飞行时按方向旋转,命中才结算飘字);kind=strike:斩击/撞击贴图直接落在目标身上(近战即时结算)。
// 纯表现配置:不碰结算、不改数值(doc 24 安全边界)。

export type BattleAttackFxKind = 'bolt' | 'strike';

export interface BattleAttackFxSpec {
  kind: BattleAttackFxKind;
  /** ui/battle/attack/<sprite>.png 基名。 */
  sprite: string;
  /** 显示尺寸:bolt=弹体长度 / strike=斩击宽度,均为 unitSize 倍率。 */
  size: number;
  /** 贴图高宽比(入库时按实际像素写死,渲染层等比设尺寸,不拉伸)。 */
  aspect: number;
  /** 命中爆闪/飘字主色 [r, g, b]。 */
  color: [number, number, number];
}

const HERO_ATTACK_FX: Record<string, BattleAttackFxSpec> = {
  // ── 远程弹道(法师/射手/辅助/控制)──
  UR_EVELYN: { kind: 'bolt', sprite: 'atk_evelyn_ice', size: 1.1, aspect: 0.289, color: [140, 220, 255] }, // 深渊魔女:冰晶尖刺
  SSR_LIVIA: { kind: 'bolt', sprite: 'atk_livia_nightfire', size: 1.0, aspect: 0.344, color: [255, 120, 60] }, // 夜烬女王:夜烬火球
  SR_WITCH_03: { kind: 'bolt', sprite: 'atk_witch_rune', size: 0.95, aspect: 0.379, color: [200, 120, 255] }, // 契约魔女:紫色契约符文弹
  R_CULT_05: { kind: 'bolt', sprite: 'atk_cult_whisper', size: 0.9, aspect: 0.465, color: [120, 255, 120] }, // 低语教徒:幽绿低语咒球
  UR_AURELIA: { kind: 'bolt', sprite: 'atk_aurelia_lightarrow', size: 1.15, aspect: 0.273, color: [150, 210, 255] }, // 苍翎神射:苍翎光箭
  SR_SNIPER_05: { kind: 'bolt', sprite: 'atk_sniper_bolt', size: 1.05, aspect: 0.301, color: [255, 200, 150] }, // 峡谷狙击手:穿刺弩箭
  R_RANGER_06: { kind: 'bolt', sprite: 'atk_ranger_arrow', size: 0.95, aspect: 0.223, color: [230, 190, 140] }, // 荒原游侠:木羽箭
  UR_SERAPHINA: { kind: 'bolt', sprite: 'atk_seraphina_moonstar', size: 1.0, aspect: 0.527, color: [240, 240, 255] }, // 晨星圣女:月华星光弹
  SR_PRIEST_01: { kind: 'bolt', sprite: 'atk_priest_holyorb', size: 0.9, aspect: 0.457, color: [255, 240, 200] }, // 银色祭司:银白圣光弹
  R_ACOLY_02: { kind: 'bolt', sprite: 'atk_acoly_glimmer', size: 0.8, aspect: 0.273, color: [255, 235, 190] }, // 礼拜堂侍僧:微光弹
  // ── 近战打击(刺客/战士/坦克)──
  UR_NYX: { kind: 'strike', sprite: 'atk_nyx_shadowx', size: 1.9, aspect: 1.022, color: [200, 120, 255] }, // 影刃女皇:暗紫双影刃交叉斩
  SSR_RON: { kind: 'strike', sprite: 'atk_ron_ember', size: 1.7, aspect: 0.991, color: [255, 150, 80] }, // 灰烬猎手:灰烬匕首斩
  SR_ABYSS_06: { kind: 'strike', sprite: 'atk_abyss_rift', size: 1.6, aspect: 1.016, color: [100, 160, 255] }, // 深渊行者:深蓝裂痕斩
  R_SCOUT_03: { kind: 'strike', sprite: 'atk_scout_steel', size: 1.5, aspect: 0.928, color: [220, 230, 255] }, // 灰谷斥候:钢刃匕首斩
  UR_ARTHAS: { kind: 'strike', sprite: 'atk_arthas_dragonflame', size: 2.1, aspect: 1.0, color: [255, 90, 60] }, // 永夜龙骑:龙焰巨剑弧斩
  SSR_MICHAEL: { kind: 'strike', sprite: 'atk_michael_holycross', size: 1.9, aspect: 1.042, color: [255, 230, 150] }, // 圣光审判者:金白圣光十字斩
  SR_BLADE_04: { kind: 'strike', sprite: 'atk_blade_redarc', size: 1.6, aspect: 1.016, color: [255, 110, 110] }, // 断刃佣兵:断刃红剑弧
  R_PATROL_01: { kind: 'strike', sprite: 'atk_patrol_bluearc', size: 1.5, aspect: 0.978, color: [160, 200, 255] }, // 王国巡逻兵:蓝白长剑弧
  UR_ATLAS: { kind: 'strike', sprite: 'atk_atlas_shieldwave', size: 1.9, aspect: 1.022, color: [255, 210, 120] }, // 圣铠壁垒:金色盾击冲击波
  SSR_KANE: { kind: 'strike', sprite: 'atk_kane_lancethrust', size: 1.7, aspect: 0.881, color: [240, 240, 255] }, // 白银圣枪:银白长枪刺击光矛
  SR_PALADIN_02: { kind: 'strike', sprite: 'atk_paladin_shield', size: 1.6, aspect: 1.022, color: [255, 220, 150] }, // 见习圣骑士:淡金盾击
  R_GUARD_07: { kind: 'strike', sprite: 'atk_guard_ironbash', size: 1.5, aspect: 1.046, color: [220, 220, 220] }, // 城门卫兵:铁盾撞击
};

// 职业兜底(未登记 heroCode:主角/下架英雄):借用同职业 R 级素材。
const CLASS_FALLBACK_ATTACK_FX: Record<string, BattleAttackFxSpec> = {
  刺客: HERO_ATTACK_FX.R_SCOUT_03,
  战士: HERO_ATTACK_FX.R_PATROL_01,
  坦克: HERO_ATTACK_FX.R_GUARD_07,
  法师: HERO_ATTACK_FX.SR_WITCH_03,
  射手: HERO_ATTACK_FX.R_RANGER_06,
  辅助: HERO_ATTACK_FX.R_ACOLY_02,
};

/**
 * 普攻音效键(2026-09-18 正式音源):SSR/UR 英雄用 C1812 包里本角色自带的攻击音(audio/sfx/atk/hero_<code>),
 * 其余按职业兜底(近战/远程/法师/辅助)。文件名见 素材原始备份/audio-picks-20260918.md。
 */
const HERO_ATTACK_SFX_CODES = new Set(['SSR_KANE', 'SSR_LIVIA', 'SSR_MICHAEL', 'SSR_RON', 'UR_ARTHAS', 'UR_ATLAS', 'UR_AURELIA', 'UR_EVELYN', 'UR_NYX', 'UR_SERAPHINA']);
const CLASS_ATTACK_SFX: Record<string, string> = {
  刺客: 'atk/class_melee',
  战士: 'atk/class_melee',
  坦克: 'atk/class_melee',
  法师: 'atk/class_mage',
  射手: 'atk/class_ranged',
  辅助: 'atk/class_support',
};

/** 大招/技能音效键(2026-09-18):22 位英雄各一条(通用音效包 技能音效 目录按元素挑),未知英雄回退通用 skill。 */
const HERO_SKILL_SFX_CODES = new Set([
  'UR_NYX', 'SSR_RON', 'SR_ABYSS_06', 'R_SCOUT_03', 'UR_EVELYN', 'SSR_LIVIA', 'SR_WITCH_03', 'R_CULT_05',
  'UR_AURELIA', 'SR_SNIPER_05', 'R_RANGER_06', 'UR_ARTHAS', 'SSR_MICHAEL', 'SSR_KANE', 'SR_BLADE_04', 'R_PATROL_01',
  'UR_ATLAS', 'SR_PALADIN_02', 'R_GUARD_07', 'UR_SERAPHINA', 'SR_PRIEST_01', 'R_ACOLY_02',
]);

export function resolveHeroSkillSfxKey(heroCode: string | null | undefined): string {
  const code = (heroCode || '').trim().toUpperCase();
  return HERO_SKILL_SFX_CODES.has(code) ? `skill/hero_${code.toLowerCase()}` : 'skill';
}

export function resolveHeroAttackSfxKey(heroCode: string | null | undefined, heroClass: string | null | undefined, meleeRole: boolean): string {
  const code = (heroCode || '').trim().toUpperCase();
  if (HERO_ATTACK_SFX_CODES.has(code)) {
    return `atk/hero_${code.toLowerCase()}`;
  }
  const byClass = CLASS_ATTACK_SFX[(heroClass || '').trim()];
  if (byClass) {
    return byClass;
  }
  return meleeRole ? 'atk/class_melee' : 'atk/class_ranged';
}

/** 按 heroCode → 职业 → 角色(近战 strike / 其余 bolt)三级兜底解析普攻表现。 */
export function resolveHeroAttackFx(heroCode: string | null | undefined, heroClass: string | null | undefined, meleeRole: boolean): BattleAttackFxSpec {
  const code = (heroCode || '').trim().toUpperCase();
  const byCode = HERO_ATTACK_FX[code];
  if (byCode) {
    return byCode;
  }
  const byClass = CLASS_FALLBACK_ATTACK_FX[(heroClass || '').trim()];
  if (byClass) {
    return byClass;
  }
  return meleeRole ? HERO_ATTACK_FX.R_SCOUT_03 : HERO_ATTACK_FX.R_ACOLY_02;
}

/** 资源路径:ui/battle/attack/<sprite>/spriteFrame。 */
export function resolveAttackFxSpritePath(spec: BattleAttackFxSpec): string {
  return `ui/battle/attack/${spec.sprite}/spriteFrame`;
}

// ── 普攻飞行特效(Spine,2026-09-21 用户要求:从 D:\骨骼动画素材\fx_pack 的 500+ 特效里挑普攻效果)──
// fx_pack 里 _fly / _fxw(飞行物)/ _toushewu(投射物)共 54 个弹道类特效,引擎内逐个实拍后按"武器原型 + 元素"给 22 名英雄各配一个;
// 全部朝右绘制,渲染层按实测包围盒等比缩到 size×unitSize 长,挂在弹道节点下随飞行方向旋转。素材原样入库(spine/effect/<effect>),未改图。
// 贴图版(上表)保留为回退:特效数据未预热完成 / 同屏 Spine 弹道满额 / 表外英雄。
export interface BattleAttackSpineFxSpec {
  /** spine/effect/<effect>/<effect>。 */
  effect: string;
  /** 动画名(大小写不敏感;找不到取第一个)。 */
  animation: string;
  /** 目标长度(最长边),unitSize 倍率。 */
  size: number;
}

const HERO_ATTACK_SPINE_FX: Record<string, BattleAttackSpineFxSpec> = {
  UR_ARTHAS: { effect: 'fx_350131_jialulupifu_fly', animation: 'skill3_fly', size: 1.9 }, // 龙焰月牙剑光
  UR_ATLAS: { effect: 'fx_15007_laierde_fly', animation: 'Skill', size: 1.5 }, // 金色盾波
  UR_AURELIA: { effect: 'fx_24001_haerbie_fly', animation: 'attack', size: 1.5 }, // 青翎光箭
  UR_EVELYN: { effect: 'fx_45018_adaier_fly', animation: 'Skill_fly', size: 1.3 }, // 冰蓝旋风
  UR_NYX: { effect: 'fx_65007_fulade_fly', animation: 'attack', size: 1.7 }, // 暗紫影刃
  UR_SERAPHINA: { effect: 'fx_64012_jingleicanglong_fxw', animation: 'attack_fly', size: 1.0 }, // 银蓝星光
  SSR_KANE: { effect: 'fx_43002_ruilin_fly', animation: 'Attack_fly', size: 1.7 }, // 银白枪芒
  SSR_LIVIA: { effect: 'fx_450081_shaxing_fxw', animation: 'animation', size: 1.4 }, // 夜烬镰刃旋风
  SSR_MICHAEL: { effect: 'fx_15010_lengjingmofashi_fly', animation: 'skill', size: 1.7 }, // 金白圣剑光
  SSR_RON: { effect: 'fx_13002_modaoshu_fxw', animation: 'Attack', size: 1.1 }, // 余烬飞刃
  SR_ABYSS_06: { effect: 'fx_45008_ailina_fly', animation: 'skill', size: 0.9 }, // 深蓝裂刃
  SR_BLADE_04: { effect: 'fx_12601_youyingzhizhu_fly', animation: 'attack_fly', size: 1.4 }, // 猩红月牙
  SR_PALADIN_02: { effect: 'fx_450101_shengnvpifu_fly', animation: 'Attack_fly', size: 1.3 }, // 淡金盾波
  SR_PRIEST_01: { effect: 'fx_15004_xe_fxw', animation: 'zidan', size: 1.2 }, // 圣光细弹
  SR_SNIPER_05: { effect: 'fx_35004_kaerweisi_fly', animation: 'Attack', size: 1.5 }, // 尾焰弩矢
  SR_WITCH_03: { effect: 'fx_150079_laierde_fly', animation: 'Skill', size: 1.4 }, // 紫电球
  R_ACOLY_02: { effect: 'fx_45013_yingshu_fly', animation: 'attack', size: 0.9 }, // 暖黄微光
  R_CULT_05: { effect: 'fx_25002_dutengnv_fly', animation: 'Attack_fly', size: 1.1 }, // 幽绿咒球
  R_GUARD_07: { effect: 'fx_650011_zuozhupifu_fly', animation: 'skill2_fly', size: 1.2 }, // 灰白撞击棱
  R_PATROL_01: { effect: 'fx_240019_haerbie_fly', animation: 'skill_idle', size: 1.4 }, // 蓝白霜刃
  R_RANGER_06: { effect: 'fx_35005_kuangliechangmao_toushewu', animation: 'toushewu2', size: 1.5 }, // 草绿羽箭
  R_SCOUT_03: { effect: 'fx_450141_miaomokepifu_fly', animation: 'attack_fly', size: 1.0 }, // 钢匕飞刃
};

export function resolveHeroAttackSpineFx(heroCode: string | null | undefined): BattleAttackSpineFxSpec | null {
  return HERO_ATTACK_SPINE_FX[(heroCode ?? '').trim().toUpperCase()] ?? null;
}

export function resolveAttackSpineFxResource(spec: BattleAttackSpineFxSpec): string {
  return `spine/effect/${spec.effect}/${spec.effect}`;
}
