// 战斗技能特效配置(2026-08-17,doc 28 / docs/29):英雄大招特效映射 + BOSS 读条三段特效 + 破防金光。
// 资源目录 assets/resources/spine/effect/<effect>/<effect>.skel(Spine 4.2.43 二进制,代码侧 premultipliedAlpha=false)。
// 注意:技能特效骨骼 setup pose 通常无可见附件 → skel 头 bounds 为 0;渲染层在加载后采样动画实测包围盒,
// 自动把特效适配到目标尺寸(target=目标单位高×1.4 / self=施法者高×1.3 / fullscreen=战场宽×0.9),
// 因此这里的 scale 是**相对倍率**(1=标准尺寸;弱版 0.56~0.72 更小),不再是绝对缩放(2026-08-19 视频验收改)。
// 纯表现配置:不碰结算、不改数值、不新增玩家 API(doc 24 安全边界)。

export type BattleSkillEffectAnchor = 'target' | 'self' | 'fullscreen';

export interface BattleSkillEffectSpec {
  /** effect_code = assets/resources/spine/effect/<effect>/<effect> 目录与文件基名(取素材包原始命名,可溯源)。 */
  effect: string;
  /** 期望动画名;运行时大小写不敏感解析,找不到回退骨骼首个动画(素材命名大小写不统一:Skill/skill)。 */
  animation: string;
  /** target=挂目标位置;self=挂施法者;fullscreen=战场中心全屏。 */
  anchor: BattleSkillEffectAnchor;
  /** 相对倍率(1=按锚点自动适配的标准尺寸;渲染层按实测包围盒适配后再乘此值)。 */
  scale: number;
  /** 相对锚点的 Y 偏移(设计像素,乘布局 scale;锚点已抬到躯干中心,一般 0~20)。 */
  offsetY: number;
  /** 循环播放(仅 BOSS 蓄力光环等持续型;一次性特效不填)。 */
  loop?: boolean;
  /** 贴脚底(地面魔圈类):锚点压到单位脚下且随目标体型放大。 */
  placeAtFeet?: boolean;
}

// ── 英雄大招特效(heroCode → spec)──
// 选型原则(docs/29):按职业/元素对味;同职业不同稀有度用同一系列由弱到强(强=完整 skill 套,弱=hit 爆点/缩小),
// 复用少量高质量套,不搞每人一套。
const HERO_ULT_EFFECTS: Record<string, BattleSkillEffectSpec> = {
  // 刺客:暗影/多段斩击系(幽影蜘蛛 / 死神)
  UR_NYX: { effect: 'fx_6601_sishen_skill', animation: 'skill', anchor: 'target', scale: 0.9, offsetY: 20 }, // 影刃·千夜追猎:死神暗镰
  SSR_RON: { effect: 'fx_12601_youyingzhizhu_skill', animation: 'skill', anchor: 'target', scale: 0.8, offsetY: 16 }, // 灰烬·致命猎杀:幽影突袭
  SR_ABYSS_06: { effect: 'fx_12601_youyingzhizhu_hit', animation: 'skill_hit', anchor: 'target', scale: 0.72, offsetY: 12 }, // 深渊·虚空突袭:幽影爆点
  R_SCOUT_03: { effect: 'fx_12601_youyingzhizhu_hit', animation: 'skill_hit', anchor: 'target', scale: 0.58, offsetY: 12 }, // 灰谷·暗影突袭:幽影爆点(弱)
  // 法师:元素爆发系(冰=雪女 / 火=凤凰 / 暗=女法师)
  UR_EVELYN: { effect: 'fx_14601_xuenv_skill', animation: 'skill', anchor: 'target', scale: 0.9, offsetY: 18 }, // 深渊·湮灭领域:冰霜湮灭(技能组带冻结)
  SSR_LIVIA: { effect: 'fx_5601_fenghuang_skill', animation: 'skill', anchor: 'target', scale: 0.85, offsetY: 18 }, // 夜烬·焚世之焰:凤凰焚世
  SR_WITCH_03: { effect: 'fx_14002_nvfashi_skill', animation: 'Skill', anchor: 'target', scale: 0.72, offsetY: 14 }, // 契约·暗蚀术
  R_CULT_05: { effect: 'fx_14002_nvfashi_skill', animation: 'Skill', anchor: 'target', scale: 0.58, offsetY: 14 }, // 低语·暗蚀诅咒(同系列弱版)
  // 射手:箭雨/穿刺系(艾莉娜飞箭)
  UR_AURELIA: { effect: 'fx_45008_ailina_skill', animation: 'skill_down', anchor: 'target', scale: 0.9, offsetY: 18 }, // 苍翎·万箭裂空(down=箭雨落点段)
  SR_SNIPER_05: { effect: 'fx_45008_ailina_hit', animation: 'skill', anchor: 'target', scale: 0.72, offsetY: 12 }, // 峡谷·致命狙击:箭雨爆点
  R_RANGER_06: { effect: 'fx_45008_ailina_hit', animation: 'skill', anchor: 'target', scale: 0.58, offsetY: 12 }, // 荒原·疾风连射(弱)
  // 战士:斩击/龙焰/圣光审判系
  UR_ARTHAS: { effect: 'fx_7601_shigujulong_skill', animation: 'skill', anchor: 'target', scale: 0.95, offsetY: 22 }, // 永夜·龙焰审判:蚀骨巨龙
  SSR_MICHAEL: { effect: 'fx_14001_shizijun_skill', animation: 'Skill', anchor: 'target', scale: 0.82, offsetY: 16 }, // 圣光·终极审判:十字军圣裁
  SR_BLADE_04: { effect: 'fx_44003_daofengzhanshi_jineng', animation: 'skill', anchor: 'target', scale: 0.72, offsetY: 14 }, // 断刃·狂乱斩:刀锋乱舞
  R_PATROL_01: { effect: 'fx_44003_daofengzhanshi_jineng', animation: 'skill', anchor: 'target', scale: 0.58, offsetY: 14 }, // 巡逻·奋勇突刺(同系列弱版)
  // 坦克:冲击波/盾击系(义盾骑士 / 圣骑士)
  UR_ATLAS: { effect: 'fx_15005_yidunqishi_skill', animation: 'skill', anchor: 'self', scale: 0.9, offsetY: 12 }, // 圣铠·不动壁垒:开盾冲击(挂自身)
  SSR_KANE: { effect: 'fx_45014_shengqishi_skill', animation: 'skill', anchor: 'target', scale: 0.82, offsetY: 14 }, // 白银·圣枪壁垒:圣骑士盾击
  SR_PALADIN_02: { effect: 'fx_15005_yidunqishi_skill', animation: 'skill', anchor: 'self', scale: 0.7, offsetY: 10 }, // 圣盾·守御反击(同系列弱版)
  R_GUARD_07: { effect: 'fx_15005_yidunqishi_skill', animation: 'skill', anchor: 'self', scale: 0.56, offsetY: 10 }, // 城门·坚守盾击(更弱)
  // 辅助:治疗光环/圣光系(圣辉上下半场)
  UR_SERAPHINA: { effect: 'fx_13001_shenghui_jineng_up', animation: 'Skill', anchor: 'self', scale: 0.9, offsetY: 14 }, // 晨星·圣光庇佑:圣辉升华(挂自身光环)
  SR_PRIEST_01: { effect: 'fx_13001_shenghui_jineng_down', animation: 'Skill', anchor: 'self', scale: 0.72, offsetY: 12 }, // 银色·圣愈祷言:圣辉落光
  R_ACOLY_02: { effect: 'fx_13001_shenghui_hit', animation: 'hit', anchor: 'self', scale: 0.6, offsetY: 12 }, // 祈福·微光庇护:微光爆点
};

// 职业兜底(未登记 heroCode 的英雄,如 R_MILITIA_04/SR_TEMPLAR_07/SSR_DRACULA/主角):按职业给同系列中档特效。
const CLASS_FALLBACK_ULT_EFFECTS: Record<string, BattleSkillEffectSpec> = {
  刺客: { effect: 'fx_12601_youyingzhizhu_hit', animation: 'skill_hit', anchor: 'target', scale: 0.66, offsetY: 12 },
  法师: { effect: 'fx_14002_nvfashi_skill', animation: 'Skill', anchor: 'target', scale: 0.66, offsetY: 14 },
  射手: { effect: 'fx_45008_ailina_hit', animation: 'skill', anchor: 'target', scale: 0.66, offsetY: 12 },
  战士: { effect: 'fx_14001_shizijun_skill', animation: 'Skill', anchor: 'target', scale: 0.66, offsetY: 14 },
  坦克: { effect: 'fx_15005_yidunqishi_skill', animation: 'skill', anchor: 'self', scale: 0.62, offsetY: 10 },
  辅助: { effect: 'fx_13001_shenghui_hit', animation: 'hit', anchor: 'self', scale: 0.6, offsetY: 12 },
};

// 没有职业信息时的最终兜底(通用金色冲击)。
const DEFAULT_ULT_EFFECT: BattleSkillEffectSpec = { effect: 'fx_14001_shizijun_hit', animation: 'Skill', anchor: 'target', scale: 0.6, offsetY: 12 };

export function resolveHeroUltEffect(heroCode: string | null | undefined, heroClass: string | null | undefined): BattleSkillEffectSpec {
  const code = (heroCode || '').trim().toUpperCase();
  const byCode = HERO_ULT_EFFECTS[code];
  if (byCode) {
    return byCode;
  }
  const byClass = CLASS_FALLBACK_ULT_EFFECTS[(heroClass || '').trim()];
  return byClass ?? DEFAULT_ULT_EFFECT;
}

// ── BOSS 读条三段(doc 28:灭世咆哮)+ 破防金光 ──
// charge:读条 2.4s 内挂 BOSS 脚下的循环蓄力光环(读满/打断即销毁);
// burst:读满全屏暗红冲击(灭世之愿,契合"灭世咆哮");
// interrupt:被打断的破碎反馈(特殊受击爆点);
// break:破防窗口开启的裂甲金光。
export const BOSS_CAST_CHARGE_EFFECT: BattleSkillEffectSpec = { effect: 'fx_6602_moquanlingyu', animation: 'xia', anchor: 'self', scale: 0.9, offsetY: 0, loop: true, placeAtFeet: true }; // 魔圈领域(xia=脚下层):暗红蓄力光环
export const BOSS_CAST_BURST_EFFECT: BattleSkillEffectSpec = { effect: 'fx_650079_mieshizhiyuan_texiao', animation: 'skill', anchor: 'fullscreen', scale: 1.1, offsetY: 0 }; // 灭世之愿:全屏暗红爆发
export const BOSS_CAST_INTERRUPT_EFFECT: BattleSkillEffectSpec = { effect: 'fx_650059_specialhit', animation: 'hit', anchor: 'target', scale: 0.78, offsetY: 20 }; // 特殊受击:打断破碎反馈
export const BOSS_BREAK_EFFECT: BattleSkillEffectSpec = { effect: 'fx_63001_yanguang_texiao', animation: 'skill1', anchor: 'target', scale: 0.62, offsetY: 16 }; // 焰光:破防裂甲金光

/** 资源路径:assets/resources/spine/effect/<effect>/<effect>(与 SpineDataStore.loadSharedSpineData 直接对接)。 */
export function resolveBattleSkillEffectResource(spec: BattleSkillEffectSpec): string {
  return `spine/effect/${spec.effect}/${spec.effect}`;
}

/** 本配置引用到的全部 effect_code(去重;供入库校验/预热用)。 */
export function listBattleSkillEffectCodes(): string[] {
  const codes = new Set<string>();
  Object.values(HERO_ULT_EFFECTS).forEach((spec) => codes.add(spec.effect));
  Object.values(CLASS_FALLBACK_ULT_EFFECTS).forEach((spec) => codes.add(spec.effect));
  codes.add(DEFAULT_ULT_EFFECT.effect);
  [BOSS_CAST_CHARGE_EFFECT, BOSS_CAST_BURST_EFFECT, BOSS_CAST_INTERRUPT_EFFECT, BOSS_BREAK_EFFECT].forEach((spec) => codes.add(spec.effect));
  return [...codes];
}
