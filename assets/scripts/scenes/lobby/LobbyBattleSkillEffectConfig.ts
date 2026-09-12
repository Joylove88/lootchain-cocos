// 战斗技能特效配置(2026-08-17,doc 28 / docs/29):英雄大招特效映射 + BOSS 读条三段特效 + 破防金光。
// 资源目录 assets/resources/spine/effect/<effect>/<effect>.skel(Spine 4.2.43 二进制,代码侧 premultipliedAlpha=false)。
// 注意:技能特效骨骼 setup pose 通常无可见附件 → skel 头 bounds 为 0;渲染层在加载后采样动画实测包围盒,
// 自动把特效适配到目标尺寸(target=目标单位高×1.4 / self=施法者高×1.3 / fullscreen=战场宽×0.9),
// 因此这里的 scale 是**相对倍率**(1=标准尺寸),不再是绝对缩放(2026-08-19 视频验收改)。
// 2026-09-12 用户反馈低稀有度技能太小:按稀有度分档 R 1.15 / SR 1.25 / SSR 1.4 / UR 1.6,低阶也不小于标准尺寸。
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
// 选型原则 v2(2026-09-07 专属技能体系,docs/29 v2):22 名启用英雄**一人一套不共用**,
// 职业/元素对味,稀有度越高越华丽;T0(每档天花板)配库内最顶级全套。兜底 6 套独立不与专属冲突。
const HERO_ULT_EFFECTS: Record<string, BattleSkillEffectSpec> = {
  // ── 刺客:暗影系 ──
  UR_NYX: { effect: 'fx_65002_luxifa_skill', animation: 'Skill_down', anchor: 'target', scale: 1.6, offsetY: 20 }, // 影刃·千夜追猎:路西法堕影
  SSR_RON: { effect: 'fx_450081_shaxing_jineng', animation: 'skill', anchor: 'target', scale: 1.4, offsetY: 16 }, // 灰烬·致命猎杀:杀星(2026-09-07 全量换新)
  SR_ABYSS_06: { effect: 'fx_65008_anubisi_skill', animation: 'skill_sf1_down', anchor: 'target', scale: 1.25, offsetY: 12 }, // 深渊·冥神审判:阿努比斯
  R_SCOUT_03: { effect: 'fx_6601_sishen_skill', animation: 'skill', anchor: 'target', scale: 1.15, offsetY: 14 }, // 灰谷·绝影猎杀(R T0):死神暗镰(毕业感)
  // ── 法师:元素爆发系 ──
  UR_EVELYN: { effect: 'fx_4601_bingyuanjulang_skill', animation: 'skill', anchor: 'target', scale: 1.6, offsetY: 18 }, // 深渊·冰狱湮灭:冰原巨浪
  SSR_LIVIA: { effect: 'fx_25017_yanlingnvwang_skill', animation: 'skill', anchor: 'target', scale: 1.4, offsetY: 18 }, // 夜烬·焚世之焰(SSR T0):焰灵女王(2026-09-07 全量换新)
  SR_WITCH_03: { effect: 'fx_35012_shuoyemonv_skill', animation: 'skill', anchor: 'target', scale: 1.25, offsetY: 14 }, // 契约·朔夜降临:朔夜魔女
  R_CULT_05: { effect: 'fx_34001_lilian_skill', animation: 'Skill2_down', anchor: 'target', scale: 1.15, offsetY: 12 }, // 低语·暗蚀诅咒:紫雾蚀涡(2026-09-12 二次换新;幽影蜘蛛实测渲染为空被退回,本套紫红雾涡实测可见且大于原毒藤,2.7s)
  // ── 射手:箭雨/穿刺系 ──
  UR_AURELIA: { effect: 'fx_13601_menghuanfengdie_skill', animation: 'Skill1', anchor: 'target', scale: 1.6, offsetY: 18 }, // 苍翎·万箭裂空:梦幻凤蝶(2026-09-07 全量换新)
  SR_SNIPER_05: { effect: 'fx_35005_kuangliechangmao_hit', animation: 'Skill_hit', anchor: 'target', scale: 1.25, offsetY: 12 }, // 峡谷·狂裂贯穿(SR T0):狂裂爆点(2026-09-07 用户反馈瘦长矛太小,换大爆点版)
  R_RANGER_06: { effect: 'fx_45013_yingshu_skill', animation: 'skill_down', anchor: 'target', scale: 1.15, offsetY: 12 }, // 荒原·疾风连射:猎鹰之术(2026-09-07 全量换新)
  // ── 战士:龙焰/圣光/剑气系 ──
  UR_ARTHAS: { effect: 'fx_350159_alukaduo_skill', animation: 'Skill_dowm', anchor: 'target', scale: 1.6, offsetY: 22 }, // 永夜·龙焰审判(UR T0):阿鲁卡多暗夜领主(素材内拼写就是 dowm)
  SSR_MICHAEL: { effect: 'fx_55011_yadianna_skill', animation: 'skill2', anchor: 'target', scale: 1.4, offsetY: 16 }, // 圣光·终极审判:雅典娜圣裁(2026-09-07 全量换新)
  SR_BLADE_04: { effect: 'fx_55008_yase_skill', animation: 'Skill_down', anchor: 'target', scale: 1.25, offsetY: 14 }, // 断刃·狂乱斩:亚瑟王剑气(2026-09-07 升级)
  R_PATROL_01: { effect: 'fx_25013_guijianshi_skill', animation: 'Skill_down', anchor: 'target', scale: 1.15, offsetY: 14 }, // 王国·誓约剑气:鬼剑士
  // ── 坦克:冲击波/盾击系 ──
  UR_ATLAS: { effect: 'fx_15001_tianqiqishi_skill', animation: 'skill_01', anchor: 'self', scale: 1.6, offsetY: 12 }, // 圣铠·不动壁垒:天启骑士
  SSR_KANE: { effect: 'fx_45014_shengqishi_skill', animation: 'Skill2', anchor: 'target', scale: 1.4, offsetY: 14 }, // 白银·圣枪穿刺:圣骑士圣枪光爆(2026-09-12 换新:原拉斐尔音符十字是治疗向、与圣枪不搭且实测仅 435px)
  SR_PALADIN_02: { effect: 'fx_15013_waerjili_skill', animation: 'Skill_down', anchor: 'self', scale: 1.25, offsetY: 10 }, // 圣盾·守御反击:瓦尔基里圣枪(2026-09-07 升级)
  R_GUARD_07: { effect: 'fx_43001_shouwei_jineng', animation: 'Skill', anchor: 'self', scale: 1.15, offsetY: 10 }, // 城门·坚守盾击:守卫壁障
  // ── 辅助:圣光/自然系 ──
  UR_SERAPHINA: { effect: 'fx_55010_yuerennvshen_skill', animation: 'skill', anchor: 'self', scale: 1.6, offsetY: 14 }, // 晨星·月华圣辉:月神降临
  SR_PRIEST_01: { effect: 'fx_45010_xiunv_skill', animation: 'skill', anchor: 'self', scale: 1.25, offsetY: 12 }, // 银色·圣愈祷言:修女圣光(2026-09-07 升级)
  R_ACOLY_02: { effect: 'fx_450101_shengnvpifu_skill', animation: 'Skill_down', anchor: 'self', scale: 1.15, offsetY: 12 }, // 祈福·微光庇护:圣女光柱(2026-09-07 全量换新)
};

// 职业兜底(未登记 heroCode:下架英雄/主角):独立 6 套,不与任何专属特效冲突。
const CLASS_FALLBACK_ULT_EFFECTS: Record<string, BattleSkillEffectSpec> = {
  刺客: { effect: 'fx_43001_daozei_skill', animation: 'skill', anchor: 'target', scale: 0.64, offsetY: 12 },
  法师: { effect: 'fx_33002_kuloufashi_skill', animation: 'skill', anchor: 'target', scale: 0.64, offsetY: 14 },
  射手: { effect: 'fx_25011_paoshou_jjineng', animation: 'attack', anchor: 'target', scale: 0.64, offsetY: 12 },
  战士: { effect: 'fx_65001_heichao_skill', animation: 'Skill_down', anchor: 'target', scale: 0.64, offsetY: 14 },
  坦克: { effect: 'fx_450071_haibozhiyong_jineng', animation: 'skill', anchor: 'self', scale: 0.6, offsetY: 10 },
  辅助: { effect: 'fx_35009_caolingshi_skill', animation: 'Skill', anchor: 'self', scale: 0.6, offsetY: 12 },
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

// ── 技能特效实测包围盒(2026-09-12)──
// 预览页探针实拍(黑底 + 8 时刻采样取最亮帧亮区 bbox,单位=骨骼原生设计像素,cx 右正 / cy 上正 = 视觉中心相对骨骼原点偏移)。
// 此前渲染层用 computeWorldVertices 采样 3 时刻求 AABB,对"先小后大"的素材(如永夜龙骑横斩)严重低估
// → 放大到上限 1.5× 后横贯整屏且只露一半(2026-09-12 用户反馈图 2)。有表项优先用表,无表项才回退运行时采样。
export interface BattleFxMeasuredBounds { w: number; h: number; cx: number; cy: number; }
export const BATTLE_FX_MEASURED_BOUNDS: Record<string, BattleFxMeasuredBounds> = {
  'fx_65002_luxifa_skill:skill_down': { w: 2306, h: 1082, cx: 188, cy: -147 },
  'fx_450081_shaxing_jineng:skill': { w: 2153, h: 659, cx: 500, cy: 65 },
  'fx_65008_anubisi_skill:skill_sf1_down': { w: 576, h: 400, cx: -76, cy: 194 },
  'fx_6601_sishen_skill:skill': { w: 2306, h: 1035, cx: 718, cy: -124 },
  'fx_4601_bingyuanjulang_skill:skill': { w: 2600, h: 953, cx: 6, cy: -82 },
  'fx_25017_yanlingnvwang_skill:skill': { w: 1518, h: 459, cx: 6, cy: 165 },
  'fx_35012_shuoyemonv_skill:skill': { w: 682, h: 482, cx: 0, cy: 153 },
  'fx_34001_lilian_skill:skill2_down': { w: 682, h: 600, cx: 24, cy: 82 },
  'fx_13601_menghuanfengdie_skill:skill1': { w: 2871, h: 1082, cx: 35, cy: -147 },
  'fx_35005_kuangliechangmao_hit:skill_hit': { w: 494, h: 494, cx: 0, cy: 112 },
  'fx_45013_yingshu_skill:skill_down': { w: 659, h: 541, cx: 12, cy: 124 },
  'fx_350159_alukaduo_skill:skill_dowm': { w: 5776, h: 612, cx: 876, cy: 88 },
  'fx_55011_yadianna_skill:skill2': { w: 2306, h: 482, cx: 753, cy: 153 },
  'fx_55008_yase_skill:skill_down': { w: 1329, h: 565, cx: 41, cy: -6 },
  'fx_25013_guijianshi_skill:skill_down': { w: 1659, h: 776, cx: -29, cy: 6 },
  'fx_15001_tianqiqishi_skill:skill_01': { w: 1165, h: 906, cx: 6, cy: -59 },
  'fx_55003_lafeier_hit:skill': { w: 435, h: 435, cx: 6, cy: 176 },
  'fx_15013_waerjili_skill:skill_down': { w: 1576, h: 765, cx: 482, cy: 12 },
  'fx_43001_shouwei_jineng:skill': { w: 588, h: 306, cx: 94, cy: 53 },
  'fx_55010_yuerennvshen_skill:skill': { w: 694, h: 600, cx: 547, cy: 94 },
  'fx_45010_xiunv_skill:skill': { w: 2706, h: 1082, cx: -353, cy: -147 },
  'fx_450101_shengnvpifu_skill:skill_down': { w: 2376, h: 988, cx: 0, cy: -100 },
  'fx_45014_shengqishi_skill:skill': { w: 800, h: 635, cx: -94, cy: 76 },
  'fx_45014_shengqishi_skill:skill2': { w: 400, h: 424, cx: -106, cy: 182 },
  'fx_15005_yidunqishi_skill:skill': { w: 2953, h: 1012, cx: 88, cy: -182 },
  'fx_15005_yidunqishi_skill:skill2': { w: 1294, h: 824, cx: -35, cy: -18 },
  'fx_44003_daofengzhanshi_jineng:skill': { w: 1506, h: 800, cx: 400, cy: -6 },
  'fx_44003_daofengzhanshi_jineng:skill2': { w: 1129, h: 482, cx: 118, cy: 153 },
};

/** 查实测包围盒(key = effect:animation 小写);没有返回 null。 */
export function lookupBattleFxBounds(effect: string, animation: string): BattleFxMeasuredBounds | null {
  return BATTLE_FX_MEASURED_BOUNDS[`${effect}:${(animation || '').toLowerCase()}`] ?? null;
}

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
