// 战斗技能特效配置(2026-08-17,doc 28 / docs/29):英雄大招特效映射 + BOSS 读条三段特效 + 破防金光。
// 资源目录 assets/resources/spine/effect/<effect>/<effect>.skel(Spine 4.2.43 二进制,代码侧 premultipliedAlpha=false)。
// 注意:技能特效骨骼 setup pose 通常无可见附件 → skel 头 bounds 为 0;渲染层在加载后采样动画实测包围盒,
// 自动把特效适配到目标尺寸(target=目标单位高×1.4 / self=施法者高×1.3 / fullscreen=战场宽×0.9),
// 因此这里的 scale 是**相对倍率**(1=标准尺寸),不再是绝对缩放(2026-08-19 视频验收改)。
// 2026-09-12 用户反馈低稀有度技能太小:按稀有度分档 R 1.15 / SR 1.25 / SSR 1.4 / UR 1.6,低阶也不小于标准尺寸。
// 2026-09-18 用户反馈 UR 技能仍太小:UR 1.6→2.4(渲染层 baseFit=单位高×1.7×scale/特效实测尺寸,UR 未触及 2.0 放大上限)。
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
// ── 英雄大招特效(heroCode → spec)──
// v3(2026-09-28,docs/29 v3):22 名英雄全部换成 S681「鬼灭魂色」专属大招包(短编号 v2_s681_<号>,溯源见 docs/29 v3 附表);
// 由三视角多智能体逐页目视分配 + 裁判综合 + 双质疑者校验,元素/主题对味、稀有度越高越华丽、战场可读优先。
// 上一版(2026-09-07 v2,fx_pack 550 套)映射保留在 docs/29 v2 章节,素材仍在库中作回退。
const HERO_ULT_EFFECTS: Record<string, BattleSkillEffectSpec> = {
  UR_NYX: { effect: 'v2_s681_4029', animation: 'skill02', anchor: 'target', scale: 2.4, offsetY: 20 }, // 影刃·千夜追猎:紫蓝交叉影刃(S681 4029,1.567s)
  SSR_RON: { effect: 'v2_s681_3022', animation: 'skill01_1', anchor: 'target', scale: 1.4, offsetY: 16 }, // 灰烬·致命猎杀:橙红斩击爆火(S681 3022,1.933s)
  SR_ABYSS_06: { effect: 'v2_s681_6031', animation: 'attackall', anchor: 'target', scale: 1.25, offsetY: 12 }, // 深渊·冥神审判(S681 6031,1.067s)
  R_SCOUT_03: { effect: 'v2_s681_6015', animation: 'attackall', anchor: 'target', scale: 1.15, offsetY: 14 }, // 灰谷·绝影猎杀(S681 6015,1.5s)
  UR_EVELYN: { effect: 'v2_s681_6014', animation: 'skill01_1', anchor: 'target', scale: 2.4, offsetY: 18 }, // 深渊·冰狱湮灭:冰晶环爆(S681 6014,1.467s)
  SSR_LIVIA: { effect: 'v2_s681_5001', animation: 'skill01_3', anchor: 'target', scale: 1.4, offsetY: 18 }, // 夜烬·焚世之焰:烈焰龙卷柱(S681 5001,0.833s)
  SR_WITCH_03: { effect: 'v2_s681_2014', animation: 'skill04_1', anchor: 'target', scale: 1.25, offsetY: 14 }, // 契约·朔夜降临(S681 2014,0.867s)
  R_CULT_05: { effect: 'v2_s681_1006', animation: 'skill01_2', anchor: 'target', scale: 1.15, offsetY: 12 }, // 低语·暗蚀诅咒(S681 1006,0.633s)
  UR_AURELIA: { effect: 'v2_s681_3012', animation: 'skill01_1', anchor: 'target', scale: 2.4, offsetY: 18 }, // 苍翎·万箭裂空(S681 3012,2.167s)
  SR_SNIPER_05: { effect: 'v2_s681_4024', animation: 'skill01', anchor: 'target', scale: 1.25, offsetY: 12 }, // 峡谷·狂裂贯穿(S681 4024,0.733s)
  R_RANGER_06: { effect: 'v2_s681_2001', animation: 'skill02_2', anchor: 'target', scale: 1.15, offsetY: 12 }, // 荒原·疾风连射(S681 2001,0.667s)
  UR_ARTHAS: { effect: 'v2_s681_5008', animation: 'skill01_1', anchor: 'target', scale: 2.4, offsetY: 22 }, // 永夜·龙焰审判:火龙俯冲(S681 5008,0.833s)
  SSR_MICHAEL: { effect: 'v2_s681_4003', animation: 'skill01_2', anchor: 'target', scale: 1.4, offsetY: 16 }, // 圣光·终极审判(S681 4003,0.5s)
  SR_BLADE_04: { effect: 'v2_s681_5012', animation: 'skill03', anchor: 'target', scale: 1.25, offsetY: 14 }, // 断刃·狂乱斩(S681 5012,1.333s)
  R_PATROL_01: { effect: 'v2_s681_1001', animation: 'attackall', anchor: 'target', scale: 1.15, offsetY: 14 }, // 王国·誓约剑气(S681 1001,1.233s)
  UR_ATLAS: { effect: 'v2_s681_6009', animation: 'skill02_3', anchor: 'self', scale: 2.4, offsetY: 12 }, // 圣铠·不动壁垒:金色星芒大爆发(S681 6009,0.767s)
  SSR_KANE: { effect: 'v2_s681_4006', animation: 'skill03', anchor: 'target', scale: 1.4, offsetY: 14 }, // 白银·圣枪穿刺(S681 4006,0.867s)
  SR_PALADIN_02: { effect: 'v2_s681_4030', animation: 'skill03', anchor: 'self', scale: 1.25, offsetY: 10 }, // 圣盾·守御反击(S681 4030,1.2s)
  R_GUARD_07: { effect: 'v2_s681_1007', animation: 'skill02', anchor: 'self', scale: 1.15, offsetY: 10 }, // 城门·坚守盾击(S681 1007,1.533s)
  UR_SERAPHINA: { effect: 'v2_s681_6033', animation: 'skill03_1', anchor: 'self', scale: 2.4, offsetY: 14 }, // 晨星·月华圣辉(S681 6033,1.733s)
  SR_PRIEST_01: { effect: 'v2_s681_1015', animation: 'skill01_1', anchor: 'self', scale: 1.25, offsetY: 12 }, // 银色·圣愈祷言(S681 1015,1.267s)
  R_ACOLY_02: { effect: 'v2_s681_4004', animation: 'skill01_1', anchor: 'self', scale: 1.15, offsetY: 12 }, // 祈福·微光庇护(S681 4004,2.667s)
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

// ── 通用战技特效(docs/29 v3,2026-09-27 用户:"战斗中英雄的战技从通用技能里找合适的用")──
// 未觉醒(ultLv=0)的 2★ 战技:此前只有一颗技能弹 + 冲击环;现在按角色机制配骨骼特效——
// 近战「裂地横扫」=横扫斩击(target);远程「烈焰领域」=灼烧区本体(zone 循环到期);控制「飓风呼啸」=旋风本体;辅助走圣辉涌泉三件套。
// 键=heroCode(一人一套,元素/武器对味),缺省按角色兜底。scale 同大招口径(相对倍率),战技整体比大招小一档。
export type GuardSkillFxRole = 'melee' | 'ranged' | 'control' | 'support';
const HERO_GUARD_SKILL_EFFECTS: Record<string, BattleSkillEffectSpec> = {
  UR_NYX: { effect: 'v2_a47_268', animation: 'effect_SB_5_ZXD_baodian', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-268,0.5s)
  SSR_RON: { effect: 'v2_a47_215', animation: 'effect_chiyou_gongji_qianghuabaodian', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-215,0.4s)
  SR_ABYSS_06: { effect: 'v2_a47_444', animation: 'action3', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-444,1.033s)
  R_SCOUT_03: { effect: 'v2_a47_073', animation: 'idle', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-073,1.133s)
  UR_EVELYN: { effect: 'v2_a47_481', animation: 'action1', anchor: 'target', scale: 1.1, offsetY: 0 }, // control(A47-481,1.967s)
  SSR_LIVIA: { effect: 'v2_a47_420', animation: 'action', anchor: 'target', scale: 1.1, offsetY: 0 }, // ranged(A47-420,5.333s)
  SR_WITCH_03: { effect: 'v2_a47_217', animation: 'effect_debuff', anchor: 'target', scale: 1.1, offsetY: 0 }, // ranged(A47-217,2.1s)
  R_CULT_05: { effect: 'v2_a47_125', animation: 'idle', anchor: 'target', scale: 1.1, offsetY: 0 }, // ranged(A47-125,3.333s)
  UR_AURELIA: { effect: 'v2_a47_490', animation: 'action1', anchor: 'target', scale: 1.1, offsetY: 0 }, // ranged(A47-490,2.2s)
  SR_SNIPER_05: { effect: 'v2_a47_274', animation: 'effect_xihe_jineng_di', anchor: 'target', scale: 1.1, offsetY: 0 }, // ranged(A47-274,0.833s)
  R_RANGER_06: { effect: 'v2_a47_257', animation: 'effect_qinglong_jineng_di', anchor: 'target', scale: 1.1, offsetY: 0 }, // ranged(A47-257,1.4s)
  UR_ARTHAS: { effect: 'v2_a47_014', animation: 'animation', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-014,1s)
  SSR_MICHAEL: { effect: 'v2_a47_208', animation: 'effect_change_jineng_baodian', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-208,0.433s)
  SR_BLADE_04: { effect: 'v2_a47_198', animation: 'effect_baihu_jineng_baodian', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-198,0.733s)
  R_PATROL_01: { effect: 'v2_a47_004', animation: 'animation', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-004,0.267s)
  UR_ATLAS: { effect: 'v2_a47_114', animation: 'idle', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-114,0.6s)
  SSR_KANE: { effect: 'v2_a47_064', animation: 'idle', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-064,0.867s)
  SR_PALADIN_02: { effect: 'v2_a47_202', animation: 'effect_baize_gongji_baodian', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-202,0.6s)
  R_GUARD_07: { effect: 'v2_a47_188', animation: 'ty_sj', anchor: 'target', scale: 1.0, offsetY: 10 }, // melee(A47-188,1.5s)
  UR_SERAPHINA: { effect: 'v2_a47_429', animation: 'action', anchor: 'self', scale: 1.0, offsetY: 0 }, // support(A47-429,1.333s)
  SR_PRIEST_01: { effect: 'v2_a47_427', animation: 'action', anchor: 'self', scale: 1.0, offsetY: 0 }, // support(A47-427,1.033s)
  R_ACOLY_02: { effect: 'v2_a47_391', animation: 'action1', anchor: 'self', scale: 1.0, offsetY: 0 }, // support(A47-391,1.433s)
};
const ROLE_FALLBACK_SKILL_EFFECTS: Record<GuardSkillFxRole, BattleSkillEffectSpec> = {
  melee: { effect: 'fx_44003_daofengzhanshi_jineng', animation: 'skill', anchor: 'target', scale: 1.0, offsetY: 12 },
  ranged: { effect: 'fx_15015_hongtiansilng_hit', animation: 'skill2', anchor: 'target', scale: 1.0, offsetY: 0 },
  control: { effect: 'fx_45018_adaier_hit', animation: 'Attack_hit', anchor: 'target', scale: 1.0, offsetY: 8 },
  support: { effect: 'fx_45014_shengqishi_skill', animation: 'Skill', anchor: 'self', scale: 1.0, offsetY: 10 },
};

export function resolveHeroGuardSkillEffect(heroCode: string | null | undefined, role: GuardSkillFxRole | null | undefined): BattleSkillEffectSpec {
  const code = (heroCode || '').trim().toUpperCase();
  return HERO_GUARD_SKILL_EFFECTS[code] ?? ROLE_FALLBACK_SKILL_EFFECTS[role ?? 'melee'] ?? ROLE_FALLBACK_SKILL_EFFECTS.melee;
}

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
  // 守卫战 BOSS 蓄力法阵(2026-09-24 实拍 4 时刻亮区 bbox):法阵在骨骼原点下方 ~286,运行时三帧采样会把它挪到 BOSS 右下方。
  'fx_6602_moquanlingyu:xia': { w: 1337, h: 735, cx: 0, cy: -286 },
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
  // 守卫战宝箱 / 开箱轮盘(2026-09-27 实拍 6 时刻亮区 bbox,scratchpad fx_measure_cdp):凤翼光柱从原点向上冲 ~2000 高,熔岩环在原点下方。
  'fx_5602_fenghuanglingyu:shang': { w: 1344, h: 1968, cx: -40, cy: 392 },
  'fx_5602_fenghuanglingyu:xia': { w: 1360, h: 744, cx: 0, cy: -244 },
  'fx_2602_yanguilingyu:xia': { w: 1456, h: 760, cx: 48, cy: -260 },
  // fx_pack_v2 新批次(2026-09-28,spine-webgl 无头渲染 12 时刻亮区 bbox,scratchpad fxprev;短编号 → 原套名见 docs/29 v3)
  'v2_a47_162:fz': { w: 295, h: 308, cx: 0, cy: -3 },
  'v2_a47_340:action': { w: 362, h: 298, cx: 8, cy: 101 },
  'v2_a47_343:action2': { w: 338, h: 351, cx: 12, cy: 27 },
  'v2_a47_376:action2': { w: 294, h: 139, cx: 2, cy: 1 },
  'v2_a47_447:action2': { w: 792, h: 589, cx: 14, cy: 93 },
  'v2_a49_089:animation': { w: 163, h: 156, cx: 2, cy: 2 },
  'v2_a49_206:action': { w: 359, h: 312, cx: 11, cy: 44 },
  'v2_a49_212:action': { w: 446, h: 323, cx: -2, cy: -31 },
  'v2_a49_373:idle1': { w: 222, h: 201, cx: -16, cy: 5 },
  'v2_a49_392:idle': { w: 210, h: 211, cx: 6, cy: 5 },
  'v2_a49_448:idle': { w: 727, h: 373, cx: 16, cy: 907 },
  'v2_a49_455:idle': { w: 282, h: 284, cx: 0, cy: 0 },
  'v2_s576_022:e705_special_skillultra_sd': { w: 859, h: 1381, cx: 2, cy: 549 },
  'v2_s576_040:e803_special_skillultra2_sj_up': { w: 988, h: 817, cx: -26, cy: 225 },
  'v2_a47_004:animation': { w: 206, h: 254, cx: 37, cy: 75 },
  'v2_a47_014:animation': { w: 989, h: 781, cx: 655, cy: 33 },
  'v2_a47_064:idle': { w: 398, h: 347, cx: 19, cy: 289 },
  'v2_a47_073:idle': { w: 379, h: 387, cx: -41, cy: 291 },
  'v2_a47_114:idle': { w: 316, h: 289, cx: 32, cy: 261 },
  'v2_a47_125:idle': { w: 476, h: 454, cx: -30, cy: 323 },
  'v2_a47_188:ty_sj': { w: 1370, h: 1069, cx: -8, cy: 58 },
  'v2_a47_198:effect_baihu_jineng_baodian': { w: 619, h: 518, cx: 26, cy: 77 },
  'v2_a47_202:effect_baize_gongji_baodian': { w: 330, h: 271, cx: 13, cy: 8 },
  'v2_a47_208:effect_change_jineng_baodian': { w: 442, h: 382, cx: 14, cy: 0 },
  'v2_a47_215:effect_chiyou_gongji_qianghuabaodian': { w: 396, h: 202, cx: 7, cy: 4 },
  'v2_a47_217:effect_debuff': { w: 436, h: 276, cx: 1, cy: 66 },
  'v2_a47_257:effect_qinglong_jineng_di': { w: 363, h: 247, cx: 0, cy: 51 },
  'v2_a47_268:effect_sb_5_zxd_baodian': { w: 323, h: 317, cx: -3, cy: 129 },
  'v2_a47_274:effect_xihe_jineng_di': { w: 148, h: 148, cx: -5, cy: 76 },
  'v2_a47_391:action1': { w: 468, h: 390, cx: -2, cy: 106 },
  'v2_a47_420:action': { w: 491, h: 494, cx: 2, cy: -42 },
  'v2_a47_427:action': { w: 232, h: 310, cx: 0, cy: 27 },
  'v2_a47_429:action': { w: 508, h: 657, cx: 9, cy: 123 },
  'v2_a47_444:action3': { w: 1380, h: 1533, cx: -99, cy: 406 },
  'v2_a47_481:action1': { w: 1224, h: 1154, cx: 256, cy: 278 },
  'v2_a47_490:action1': { w: 582, h: 583, cx: 45, cy: 192 },
  'v2_a49_031:shengji': { w: 897, h: 1787, cx: -3, cy: 519 },
  'v2_a49_032:shengxing': { w: 983, h: 2284, cx: -19, cy: 910 },
  'v2_a49_180:action': { w: 410, h: 407, cx: -8, cy: -1 },
  'v2_a49_397:idle3': { w: 757, h: 614, cx: 1, cy: 8 },
  'v2_s681_1001:attackall': { w: 1296, h: 810, cx: 99, cy: 322 },
  'v2_s681_1006:skill01_2': { w: 1736, h: 750, cx: 62, cy: 214 },
  'v2_s681_1007:skill02': { w: 1445, h: 850, cx: 232, cy: 243 },
  'v2_s681_1015:skill01_1': { w: 1960, h: 1296, cx: 150, cy: 638 },
  'v2_s681_2001:skill02_2': { w: 745, h: 638, cx: -3, cy: 282 },
  'v2_s681_2014:skill04_1': { w: 655, h: 696, cx: 105, cy: 303 },
  'v2_s681_3012:skill01_1': { w: 1755, h: 1262, cx: 222, cy: 334 },
  'v2_s681_3022:skill01_1': { w: 3076, h: 1743, cx: 908, cy: 271 },
  'v2_s681_4003:skill01_2': { w: 1453, h: 2032, cx: -50, cy: 790 },
  'v2_s681_4004:skill01_1': { w: 467, h: 607, cx: 5, cy: 261 },
  'v2_s681_4006:skill03': { w: 1806, h: 1183, cx: 365, cy: 318 },
  'v2_s681_4024:skill01': { w: 2592, h: 723, cx: 1328, cy: 288 },
  'v2_s681_4029:skill02': { w: 1049, h: 424, cx: 2, cy: 62 },
  'v2_s681_4030:skill03': { w: 685, h: 516, cx: 116, cy: 217 },
  'v2_s681_5001:skill01_3': { w: 3915, h: 3227, cx: 99, cy: 963 },
  'v2_s681_5008:skill01_1': { w: 1520, h: 1433, cx: 20, cy: 555 },
  'v2_s681_5012:skill03': { w: 2289, h: 1054, cx: 748, cy: 292 },
  'v2_s681_6009:skill02_3': { w: 651, h: 646, cx: 6, cy: -34 },
  'v2_s681_6014:skill01_1': { w: 1813, h: 1199, cx: 39, cy: 202 },
  'v2_s681_6015:attackall': { w: 1425, h: 643, cx: 195, cy: 226 },
  'v2_s681_6031:attackall': { w: 1513, h: 1050, cx: 131, cy: 469 },
  'v2_s681_6033:skill03_1': { w: 854, h: 846, cx: 24, cy: 295 },
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
  Object.values(HERO_GUARD_SKILL_EFFECTS).forEach((spec) => codes.add(spec.effect));
  Object.values(ROLE_FALLBACK_SKILL_EFFECTS).forEach((spec) => codes.add(spec.effect));
  codes.add(DEFAULT_ULT_EFFECT.effect);
  [BOSS_CAST_CHARGE_EFFECT, BOSS_CAST_BURST_EFFECT, BOSS_CAST_INTERRUPT_EFFECT, BOSS_BREAK_EFFECT].forEach((spec) => codes.add(spec.effect));
  return [...Array.from(codes)];
}
