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
  /**
   * 只播动画的一段(秒,动画自身时间轴):新批次「满屏大招」是 4~18 秒的整段演出,战场里只取高潮片段。
   * speed = 播放倍速(缺省 1)。不填 = 整段播完。
   * 2026-10-05 用户「有的大招一闪就没,还是要长一点」:每个大招上屏时长不少于约 1.7 秒——优先把片段取长,取不长的放慢;
   * 慢放不低于 0.8 倍(更慢像慢镜头,2026-10-06 用户「实机看着假」)。
   * 战技灼烧区(循环到期):start→end 播一遍后在 loopFrom→end 循环(跳过起手小火苗,只循环满状态段)。
   */
  clip?: { start: number; end: number; speed?: number; loopFrom?: number };
}

// ── 英雄大招特效(heroCode → spec)──
// 选型原则 v2(2026-09-07 专属技能体系,docs/29 v2):22 名启用英雄**一人一套不共用**,
// 职业/元素对味,稀有度越高越华丽;T0(每档天花板)配库内最顶级全套。兜底 6 套独立不与专属冲突。
// ── 英雄大招特效(heroCode → spec)──
// v3(2026-09-28,docs/29 v3):22 名英雄全部换成 S681「鬼灭魂色」专属大招包(短编号 v2_s681_<号>,溯源见 docs/29 v3 附表);
// 由三视角多智能体逐页目视分配 + 裁判综合 + 双质疑者校验,元素/主题对味、稀有度越高越华丽、战场可读优先。
// 上一版(2026-09-07 v2,fx_pack 550 套)映射保留在 docs/29 v2 章节,素材仍在库中作回退。
// v4(2026-10-05,docs/29 v4):22 名英雄换成新购「满屏技能大招」包(短编号 hu_<号>,源 D:\\骨骼动画素材\\hero_ult_out_4243)。
// 这批是 4~18 秒的整段演出(单动画 skill2),战场里只播 clip 指定的高潮片段(1~2.6 秒);
// 逐套看固定机位横条挑选:元素 / 主题对味、片段内主体有边界(不带满屏底色),稀有度越高越华丽。
// 上一版(v3,S681 v2_s681_*)映射:
//   UR_NYX: { effect: 'v2_s681_4029', animation: 'skill02', anchor: 'target', scale: 2.4, offsetY: 20 }, // 影刃·千夜追猎:紫蓝交叉影刃(S681 4029,1.567s)
//   SSR_RON: { effect: 'v2_s681_3022', animation: 'skill01_1', anchor: 'target', scale: 1.4, offsetY: 16 }, // 灰烬·致命猎杀:橙红斩击爆火(S681 3022,1.933s)
//   SR_ABYSS_06: { effect: 'v2_s681_6031', animation: 'attackall', anchor: 'target', scale: 1.25, offsetY: 12 }, // 深渊·冥神审判(S681 6031,1.067s)
//   R_SCOUT_03: { effect: 'v2_s681_6015', animation: 'attackall', anchor: 'target', scale: 1.15, offsetY: 14 }, // 灰谷·绝影猎杀(S681 6015,1.5s)
//   UR_EVELYN: { effect: 'v2_s681_6014', animation: 'skill01_1', anchor: 'target', scale: 2.4, offsetY: 18 }, // 深渊·冰狱湮灭:冰晶环爆(S681 6014,1.467s)
//   SSR_LIVIA: { effect: 'v2_s681_5001', animation: 'skill01_3', anchor: 'target', scale: 1.4, offsetY: 18 }, // 夜烬·焚世之焰:烈焰龙卷柱(S681 5001,0.833s)
//   SR_WITCH_03: { effect: 'v2_s681_2014', animation: 'skill04_1', anchor: 'target', scale: 1.25, offsetY: 14 }, // 契约·朔夜降临(S681 2014,0.867s)
//   R_CULT_05: { effect: 'v2_s681_1006', animation: 'skill01_2', anchor: 'target', scale: 1.15, offsetY: 12 }, // 低语·暗蚀诅咒(S681 1006,0.633s)
//   UR_AURELIA: { effect: 'v2_s681_3012', animation: 'skill01_1', anchor: 'target', scale: 2.4, offsetY: 18 }, // 苍翎·万箭裂空(S681 3012,2.167s)
//   SR_SNIPER_05: { effect: 'v2_s681_4024', animation: 'skill01', anchor: 'target', scale: 1.25, offsetY: 12 }, // 峡谷·狂裂贯穿(S681 4024,0.733s)
//   R_RANGER_06: { effect: 'v2_s681_2001', animation: 'skill02_2', anchor: 'target', scale: 1.15, offsetY: 12 }, // 荒原·疾风连射(S681 2001,0.667s)
//   UR_ARTHAS: { effect: 'v2_s681_5008', animation: 'skill01_1', anchor: 'target', scale: 2.4, offsetY: 22 }, // 永夜·龙焰审判:火龙俯冲(S681 5008,0.833s)
//   SSR_MICHAEL: { effect: 'v2_s681_4003', animation: 'skill01_2', anchor: 'target', scale: 1.4, offsetY: 16 }, // 圣光·终极审判(S681 4003,0.5s)
//   SR_BLADE_04: { effect: 'v2_s681_5012', animation: 'skill03', anchor: 'target', scale: 1.25, offsetY: 14 }, // 断刃·狂乱斩(S681 5012,1.333s)
//   R_PATROL_01: { effect: 'v2_s681_1001', animation: 'attackall', anchor: 'target', scale: 1.15, offsetY: 14 }, // 王国·誓约剑气(S681 1001,1.233s)
//   UR_ATLAS: { effect: 'v2_s681_6009', animation: 'skill02_3', anchor: 'self', scale: 2.4, offsetY: 12 }, // 圣铠·不动壁垒:金色星芒大爆发(S681 6009,0.767s)
//   SSR_KANE: { effect: 'v2_s681_4006', animation: 'skill03', anchor: 'target', scale: 1.4, offsetY: 14 }, // 白银·圣枪穿刺(S681 4006,0.867s)
//   SR_PALADIN_02: { effect: 'v2_s681_6030', animation: 'skill01_2_1', anchor: 'target', scale: 1.25, offsetY: 12 }, // 圣盾·圣纹壁垒:金色圣盾罩升起 → 地面符文金环炸开(S681 6030,1.3s;2026-10-01 用户嫌原 4030 小金火花太弱,换套;贴图已半分辨率入库)
//   R_GUARD_07: { effect: 'v2_s681_1007', animation: 'skill02', anchor: 'self', scale: 1.15, offsetY: 10 }, // 城门·坚守盾击(S681 1007,1.533s)
//   UR_SERAPHINA: { effect: 'v2_s681_6033', animation: 'skill03_1', anchor: 'self', scale: 2.4, offsetY: 14 }, // 晨星·月华圣辉(S681 6033,1.733s)
//   SR_PRIEST_01: { effect: 'v2_s681_1015', animation: 'skill01_1', anchor: 'self', scale: 1.25, offsetY: 12 }, // 银色·圣愈祷言(S681 1015,1.267s)
//   R_ACOLY_02: { effect: 'v2_s681_4004', animation: 'skill01_1', anchor: 'self', scale: 1.15, offsetY: 12 }, // 祈福·微光庇护(S681 4004,2.667s)
const HERO_ULT_EFFECTS: Record<string, BattleSkillEffectSpec> = {
  UR_NYX: { effect: 'hu_098', animation: 'skill2', anchor: 'target', scale: 2.4, offsetY: 20, clip: { start: 2.0, end: 4.0 } }, // 影刃·千夜追猎:紫蓝利爪连撕 → 幽蓝弧斩(hu_098)
  SSR_RON: { effect: 'hu_058', animation: 'skill2', anchor: 'target', scale: 1.4, offsetY: 16, clip: { start: 2.2, end: 4.5 } }, // 灰烬·致命猎杀:火环爆开 → 烟灰爪痕夹火焰撕裂(hu_058;2026-10-09 用户嫌原 hu_100 紫青彩带不好看换的)
  SR_ABYSS_06: { effect: 'hu_054', animation: 'skill2', anchor: 'target', scale: 1.25, offsetY: 12, clip: { start: 2.0, end: 4.2 } }, // 深渊·冥神审判:幽紫鬼火与冥眼(hu_054)
  R_SCOUT_03: { effect: 'hu_073', animation: 'skill2', anchor: 'target', scale: 1.15, offsetY: 14, clip: { start: 4.2, end: 5.3, speed: 0.8 } }, // 灰谷·绝影猎杀:幽蓝月牙一斩(hu_073)
  UR_EVELYN: { effect: 'hu_077', animation: 'skill2', anchor: 'target', scale: 2.4, offsetY: 18, clip: { start: 1.2, end: 3.1 } }, // 深渊·冰狱湮灭:巨型冰晶雪华绽开(hu_077)
  SSR_LIVIA: { effect: 'hu_008', animation: 'skill2', anchor: 'target', scale: 1.4, offsetY: 18, clip: { start: 7.85, end: 9.65 } }, // 夜烬·焚世之焰:烈焰龙卷(hu_008)
  SR_WITCH_03: { effect: 'hu_018', animation: 'skill2', anchor: 'target', scale: 1.25, offsetY: 14, clip: { start: 5.6, end: 7.2, speed: 0.85 } }, // 契约·朔夜降临:紫色冥球膨胀 → 斩裂(hu_018)
  R_CULT_05: { effect: 'hu_035', animation: 'skill2', anchor: 'target', scale: 1.15, offsetY: 12, clip: { start: 1.3, end: 3.0 } }, // 低语·暗蚀诅咒:紫色蚀月残影(hu_035)
  UR_AURELIA: { effect: 'hu_093', animation: 'skill2', anchor: 'target', scale: 2.4, offsetY: 18, clip: { start: 4.4, end: 6.6 } }, // 苍翎·万箭裂空:金色箭雨坠落 + 连环爆点(hu_093)
  SR_SNIPER_05: { effect: 'hu_074', animation: 'skill2', anchor: 'target', scale: 1.25, offsetY: 12, clip: { start: 2.9, end: 4.4, speed: 0.8 } }, // 峡谷·狂裂贯穿:青蓝光束贯穿(hu_074)
  R_RANGER_06: { effect: 'hu_063', animation: 'skill2', anchor: 'target', scale: 1.15, offsetY: 12, clip: { start: 4.6, end: 6.8 } }, // 荒原·疾风连射:翠绿风刃连斩(hu_063)
  UR_ARTHAS: { effect: 'hu_085', animation: 'skill2', anchor: 'target', scale: 2.4, offsetY: 22, clip: { start: 14.5, end: 18.3 } }, // 永夜·龙焰审判:天火坠落 → 蓝炎火海 → 焰柱(hu_085)
  SSR_MICHAEL: { effect: 'hu_044', animation: 'skill2', anchor: 'target', scale: 1.4, offsetY: 16, clip: { start: 8.9, end: 10.8 } }, // 圣光·雷霆裁决:雷云压顶,多道金色落雷劈下 + 地面雷爆(hu_044;2026-10-05 用户嫌原 hu_057 金色闪光不好看,换套)
  SR_BLADE_04: { effect: 'hu_065', animation: 'skill2', anchor: 'target', scale: 1.25, offsetY: 14, clip: { start: 4.5, end: 5.7, speed: 0.8 } }, // 断刃·狂乱斩:烈焰乱斩爆燃(hu_065)
  R_PATROL_01: { effect: 'hu_014', animation: 'skill2', anchor: 'target', scale: 1.15, offsetY: 14, clip: { start: 1.8, end: 3.9 } }, // 王国·誓约剑气:金色剑气掠地(hu_014)
  UR_ATLAS: { effect: 'hu_027', animation: 'skill2', anchor: 'self', scale: 2.4, offsetY: 12, clip: { start: 0.2, end: 2.9 } }, // 圣铠·不动壁垒:金莲法阵 + 圣纹轮(hu_027)
  SSR_KANE: { effect: 'hu_013', animation: 'skill2', anchor: 'target', scale: 1.4, offsetY: 14, clip: { start: 2.6, end: 4.6 } }, // 白银·圣枪穿刺:金枪俯冲 + 光柱(hu_013)
  SR_PALADIN_02: { effect: 'hu_052', animation: 'skill2', anchor: 'target', scale: 1.25, offsetY: 12, clip: { start: 2.2, end: 4.0 } }, // 圣盾·圣纹壁垒:金色雷纹圣球 → 穹顶爆开(hu_052)
  R_GUARD_07: { effect: 'hu_028', animation: 'skill2', anchor: 'self', scale: 1.15, offsetY: 10, clip: { start: 4.5, end: 6.0, speed: 0.8 } }, // 城门·坚守盾击:金色冲击环(hu_028)
  UR_SERAPHINA: { effect: 'hu_067', animation: 'skill2', anchor: 'self', scale: 2.4, offsetY: 14, clip: { start: 6.0, end: 8.2 } }, // 晨星·月华圣辉:星河旋涡托起新月(hu_067)
  SR_PRIEST_01: { effect: 'hu_049', animation: 'skill2', anchor: 'self', scale: 1.25, offsetY: 12, clip: { start: 1.0, end: 3.0 } }, // 银色·圣愈祷言:光柱 + 粉莲绽放(hu_049)
  R_ACOLY_02: { effect: 'hu_050', animation: 'skill2', anchor: 'self', scale: 1.15, offsetY: 12, clip: { start: 4.25, end: 6.2 } }, // 祈福·微光庇护:柔光 + 花瓣飘落(hu_050)
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
  // 2026-10-12 用户「夜烬女王的战技不好看」:原 A47-420 橙色火龙卷与她的大招(hu_008 烈焰龙卷)撞型,
  // 换 A49-447 紫焰火环 + 旋转涟漪法阵(夜烬 = 紫粉幽焰);0~1.9s 是起手小火苗,跳过,满状态 2.8~4.3s 循环
  SSR_LIVIA: { effect: 'v2_a49_447', animation: 'idle', anchor: 'target', scale: 1.2, offsetY: 0, clip: { start: 1.9, end: 4.3, loopFrom: 2.8 } }, // ranged(A49-447,4.933s)
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
  // 集火标记(2026-10-09):红色电光环 / 红色星芒冲击环(fx_pack_v2_选型 render.jsonl 实测)
  'v2_a49_081:red': { w: 206, h: 199, cx: -4, cy: -5 },
  'v2_a47_189:sj': { w: 403, h: 442, cx: 2, cy: -5 },
  'v2_a47_340:action': { w: 362, h: 298, cx: 8, cy: 101 },
  'v2_a47_343:action2': { w: 338, h: 351, cx: 12, cy: 27 },
  'v2_a47_376:action2': { w: 294, h: 139, cx: 2, cy: 1 },
  'v2_a47_447:action2': { w: 792, h: 589, cx: 14, cy: 93 },
  'v2_a49_089:animation': { w: 163, h: 156, cx: 2, cy: 2 },
  'v2_a49_206:action': { w: 359, h: 312, cx: 11, cy: 44 },
  'v2_a49_212:action': { w: 446, h: 323, cx: -2, cy: -31 },
  // 蓝色细弧光环星点(A49-153 action 0.67s 循环):统一读取态转圈(原能量条金框 A49-394 已于 2026-10-15 改为程序圆角金边)
  'v2_a49_153:action': { w: 135, h: 135, cx: 1, cy: 99 },
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
  'v2_a49_447:idle': { w: 807, h: 510, cx: -464, cy: 383 },
  'v2_a47_427:action': { w: 232, h: 310, cx: 0, cy: 27 },
  'v2_a47_429:action': { w: 508, h: 657, cx: 9, cy: 123 },
  'v2_a47_444:action3': { w: 1380, h: 1533, cx: -99, cy: 406 },
  'v2_a47_481:action1': { w: 1224, h: 1154, cx: 256, cy: 278 },
  'v2_a47_490:action1': { w: 582, h: 583, cx: 45, cy: 192 },
  'v2_a49_031:shengji': { w: 897, h: 1787, cx: -3, cy: 519 },
  'v2_a49_032:shengxing': { w: 983, h: 2284, cx: -19, cy: 910 },
  'v2_a49_180:action': { w: 410, h: 407, cx: -8, cy: -1 },
  'v2_a49_397:idle3': { w: 757, h: 614, cx: 1, cy: 8 },
  // 锻造结果特效(2026-10-16,fx_pack_v2 render.jsonl 实测亮区)
  'v2_a47_059:idle': { w: 319, h: 346, cx: -1, cy: 66 },
  'v2_a47_419:action': { w: 479, h: 589, cx: 33, cy: -22 },
  'v2_a49_213:action': { w: 216, h: 219, cx: -1, cy: 1 },
  'v2_a49_413:idle': { w: 326, h: 327, cx: 2, cy: 2 },
  // 金矿爆发金币堆(烘焙版 A49-005,只算金币 = GUARD_GOLD_PILE_SPINE.heap[0])。原先缺表项:原生不做现场测量,
  // 安卓上永远登记不进就绪表,每次施放都退回静态金币图(2026-10-16 排查工作流确认);spawnGoldPile 自己按 heap 缩放,这里只为登记就绪
  'v2_a49_005c:jiangli_2': { w: 648, h: 158, cx: -10, cy: -21 },
  'v2_a47_375:action1': { w: 392, h: 341, cx: 25, cy: 1 },
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
  'v2_s681_6030:skill01_2_1': { w: 6599, h: 2837, cx: 374, cy: 500 },
  'v2_s681_5001:skill01_3': { w: 3915, h: 3227, cx: 99, cy: 963 },
  'v2_s681_5008:skill01_1': { w: 1520, h: 1433, cx: 20, cy: 555 },
  'v2_s681_5012:skill03': { w: 2289, h: 1054, cx: 748, cy: 292 },
  'v2_s681_6009:skill02_3': { w: 651, h: 646, cx: 6, cy: -34 },
  'v2_s681_6014:skill01_1': { w: 1813, h: 1199, cx: 39, cy: 202 },
  'v2_s681_6015:attackall': { w: 1425, h: 643, cx: 195, cy: 226 },
  'v2_s681_6031:attackall': { w: 1513, h: 1050, cx: 131, cy: 469 },
  'v2_s681_6033:skill03_1': { w: 854, h: 846, cx: 24, cy: 295 },
  // 新批次英雄大招 hu_*(2026-10-05,只量 clip 片段;宽松框 = 片段内亮度 2~98% 分位框,scratchpad fxprev/core_hu.py)
  'hu_098:skill2': { w: 2015, h: 2135, cx: -641, cy: 636 },
  'hu_058:skill2': { w: 1580, h: 1180, cx: 60, cy: 234 },
  'hu_054:skill2': { w: 1223, h: 637, cx: 129, cy: 62 },
  'hu_073:skill2': { w: 1800, h: 900, cx: 0, cy: 150 },
  'hu_077:skill2': { w: 1612, h: 1681, cx: 89, cy: 61 },
  'hu_008:skill2': { w: 800, h: 800, cx: 110, cy: 160 },
  'hu_018:skill2': { w: 4235, h: 3770, cx: 896, cy: 947 },
  'hu_035:skill2': { w: 884, h: 592, cx: 314, cy: 5 },
  'hu_093:skill2': { w: 1844, h: 1600, cx: -176, cy: 206 },
  'hu_074:skill2': { w: 1191, h: 1173, cx: 625, cy: -219 },
  'hu_063:skill2': { w: 2398, h: 1033, cx: 688, cy: 213 },
  'hu_085:skill2': { w: 2171, h: 1220, cx: -35, cy: 212 },
  'hu_044:skill2': { w: 1694, h: 987, cx: 152, cy: 94 },
  'hu_065:skill2': { w: 3631, h: 2474, cx: 1307, cy: -301 },
  'hu_014:skill2': { w: 1258, h: 989, cx: -84, cy: 150 },
  'hu_027:skill2': { w: 901, h: 755, cx: 117, cy: 28 },
  'hu_013:skill2': { w: 1712, h: 1717, cx: 366, cy: 754 },
  'hu_052:skill2': { w: 929, h: 870, cx: 3, cy: 322 },
  'hu_028:skill2': { w: 1201, h: 1081, cx: -255, cy: 23 },
  'hu_067:skill2': { w: 1500, h: 1100, cx: 0, cy: 180 },
  'hu_049:skill2': { w: 1107, h: 1422, cx: -28, cy: 99 },
  'hu_050:skill2': { w: 2149, h: 784, cx: -94, cy: 229 },
  // 安卓补表(2026-10-15 真机:新手阵营普攻全是圆点):原生不能实时测包围盒,表里没有的普攻弹体 / 命中 / 战技特效永远预热不成、
  // 退回通用光点。以下 64 项由 tools/qa/fxprev/bounds_measure.py 按网页端运行时测量同一算法离线算出(动画 25/50/80% 三时刻附件顶点并集),
  // 与网页端实时量的结果一致;新增特效配置后重跑该脚本补表。
  'fx_350131_jialulupifu_fly:skill3_fly': { w: 702, h: 318, cx: -5, cy: -13 },
  'fx_350131_jialulupifu_hit:attack_hit': { w: 1249, h: 1040, cx: -50, cy: 22 },
  'fx_15007_laierde_fly:skill': { w: 1336, h: 964, cx: 4, cy: 1 },
  'fx_15007_laierde_hit:skill_bomb_up': { w: 1996, h: 1504, cx: -171, cy: 496 },
  'fx_24001_haerbie_fly:attack': { w: 604, h: 188, cx: -121, cy: 2 },
  'fx_24001_haerbie_hit:attack': { w: 449, h: 380, cx: 116, cy: 8 },
  'fx_45018_adaier_fly:skill_fly': { w: 716, h: 404, cx: 2, cy: -6 },
  'fx_45018_adaier_hit:attack_hit': { w: 925, h: 976, cx: -4, cy: -2 },
  'fx_65007_fulade_fly:attack': { w: 901, h: 444, cx: -141, cy: -2 },
  'fx_65007_fulade_hit:attack': { w: 488, h: 414, cx: 14, cy: -3 },
  'fx_64012_jingleicanglong_fxw:attack_fly': { w: 407, h: 321, cx: -25, cy: -8 },
  'fx_45013_yingshu_hit:attack': { w: 382, h: 328, cx: -12, cy: 17 },
  'fx_43002_ruilin_fly:attack_fly': { w: 909, h: 154, cx: 99, cy: 207 },
  'fx_43002_ruilin_hit:attack_hit': { w: 901, h: 814, cx: 26, cy: 22 },
  'fx_450081_shaxing_fxw:animation': { w: 709, h: 345, cx: -104, cy: 39 },
  'fx_450081_shaxing_hit:attack': { w: 462, h: 467, cx: 3, cy: 0 },
  'fx_15010_lengjingmofashi_fly:skill': { w: 1652, h: 544, cx: 609, cy: 16 },
  'fx_15010_lengjingmofashi_hit:attack': { w: 679, h: 708, cx: -12, cy: 26 },
  'fx_13002_modaoshu_fxw:attack': { w: 427, h: 81, cx: -79, cy: -3 },
  'fx_13002_modaoshu_shouji:hit': { w: 404, h: 389, cx: -1, cy: 186 },
  'fx_45008_ailina_fly:skill': { w: 2144, h: 676, cx: -99, cy: -26 },
  'fx_45008_ailina_hit:attack': { w: 512, h: 596, cx: 49, cy: 36 },
  'fx_12601_youyingzhizhu_fly:attack_fly': { w: 696, h: 543, cx: 60, cy: 8 },
  'fx_450141_miaomokepifu_hit:attack_hit': { w: 878, h: 518, cx: 10, cy: 182 },
  'fx_450101_shengnvpifu_fly:attack_fly': { w: 754, h: 292, cx: -179, cy: -2 },
  'fx_450101_shengnvpifu_hit:attack_hit': { w: 756, h: 756, cx: 6, cy: 2 },
  'fx_15004_xe_fxw:zidan': { w: 480, h: 78, cx: 0, cy: -3 },
  'fx_15004_xe_hit:hit': { w: 352, h: 284, cx: 0, cy: -2 },
  'fx_35004_kaerweisi_fly:attack': { w: 412, h: 84, cx: 4, cy: 6 },
  'fx_35004_kaerweisi_hit:attack': { w: 567, h: 572, cx: 5, cy: 49 },
  'fx_150079_laierde_fly:skill': { w: 1332, h: 972, cx: 14, cy: 1 },
  'fx_150079_laierde_hit:skill_bomb_up': { w: 2004, h: 1544, cx: -175, cy: 521 },
  'fx_45013_yingshu_fly:attack': { w: 472, h: 199, cx: -119, cy: 9 },
  'fx_25002_dutengnv_fly:attack_fly': { w: 412, h: 184, cx: 6, cy: 0 },
  'fx_25002_dutengnv_hit:attack': { w: 836, h: 780, cx: 28, cy: 16 },
  'fx_650011_zuozhupifu_fly:skill2_fly': { w: 468, h: 206, cx: -125, cy: 61 },
  'fx_650011_zuozhupifu_hit:attack_hit': { w: 1448, h: 1448, cx: 6, cy: 6 },
  'fx_240019_haerbie_fly:skill_idle': { w: 916, h: 527, cx: -255, cy: 3 },
  'fx_240019_haerbie_hit:skill': { w: 712, h: 636, cx: 113, cy: -22 },
  'fx_35005_kuangliechangmao_toushewu:toushewu2': { w: 373, h: 91, cx: 11, cy: 5 },
  'fx_35005_kuangliechangmao_hit:hit': { w: 592, h: 471, cx: 35, cy: 14 },
  'fx_450141_miaomokepifu_fly:attack_fly': { w: 658, h: 111, cx: -44, cy: -9 },
  'fx_14601_xuenv_hit:skill2_hit': { w: 3304, h: 3304, cx: 0, cy: 34 },
  'fx_45014_shengqishi_hit:skill_hit_down': { w: 2448, h: 965, cx: -82, cy: 4 },
  'fx_13001_shenghui_hit:hit': { w: 418, h: 425, cx: 6, cy: 1 },
  'fx_15015_hongtiansilng_hit:skill2': { w: 800, h: 776, cx: 0, cy: 204 },
  'fx_14003_leige_hit:skill2_hit2': { w: 952, h: 960, cx: 6, cy: 2 },
  'fx_23002_shuren_hit2:skill': { w: 574, h: 582, cx: 3, cy: 186 },
  'fx_45002_jiangui_hit:skill': { w: 692, h: 564, cx: -16, cy: 6 },
  'fx_43001_daozei_hit:skill_hit': { w: 778, h: 532, cx: -24, cy: 8 },
  'fx_1602_xiongshilingyu:xia': { w: 2379, h: 1231, cx: 174, cy: -178 },
  'fx_35016_batuoli_fly:attack_fly': { w: 564, h: 290, cx: -136, cy: 0 },
  'fx_450131_jiangziya_fly:attack_fly': { w: 484, h: 78, cx: -14, cy: -4 },
  'fx_33002_kuloufashi_fly:attack': { w: 676, h: 344, cx: -196, cy: -7 },
  'fx_43001_daozei_skill:skill': { w: 451, h: 608, cx: 43, cy: 262 },
  'fx_33002_kuloufashi_skill:skill': { w: 760, h: 1014, cx: 2, cy: 305 },
  'fx_25011_paoshou_jjineng:attack': { w: 498, h: 277, cx: -57, cy: 102 },
  'fx_65001_heichao_skill:skill_down': { w: 1820, h: 1533, cx: -36, cy: 236 },
  'fx_450071_haibozhiyong_jineng:skill': { w: 1457, h: 1551, cx: 101, cy: 375 },
  'fx_35009_caolingshi_skill:skill': { w: 1969, h: 910, cx: 961, cy: 340 },
  'fx_14001_shizijun_hit:skill': { w: 1103, h: 1112, cx: 5, cy: 57 },
  'fx_650079_mieshizhiyuan_texiao:skill': { w: 592, h: 552, cx: 137, cy: 95 },
  'fx_650059_specialhit:hit': { w: 362, h: 290, cx: 10, cy: 2 },
  'fx_63001_yanguang_texiao:skill1': { w: 922, h: 636, cx: 48, cy: 271 },
};

/** 查实测包围盒(key = effect:animation 小写);没有返回 null。 */
export function lookupBattleFxBounds(effect: string, animation: string): BattleFxMeasuredBounds | null {
  return BATTLE_FX_MEASURED_BOUNDS[`${effect}:${(animation || '').toLowerCase()}`] ?? null;
}

/**
 * 专属大招"核心亮区"(2026-10-01 用户:"战场中的大招比较小,不易被区分出来")。
 * BATTLE_FX_MEASURED_BOUNDS 是 12 帧里所有 >24/255 像素的并集,飞得很远的淡粒子把框撑得很大,
 * 按它做面积适配后亮的主体只剩框的 ~57%(中位数),多数大招主体比一个英雄还小。
 * 本表 = 逐帧按亮度加权取 10%~90% 分位框,再取亮度 ≥ 峰值 45% 的帧求并集(scratchpad fxprev/core_measure.py),
 * 同口径骨骼坐标 {w,h,cx,cy};战场大招按它定尺寸、按它的中心对准目标。
 */
export const BATTLE_FX_CORE_BOUNDS: Record<string, BattleFxMeasuredBounds> = {
  'v2_s681_1001:attackall': { w: 1013, h: 534, cx: 49, cy: 299 },
  'v2_s681_1006:skill01_2': { w: 711, h: 472, cx: 67, cy: 169 },
  'v2_s681_1007:skill02': { w: 1015, h: 486, cx: 159, cy: 249 },
  'v2_s681_1015:skill01_1': { w: 1227, h: 947, cx: 37, cy: 520 },
  'v2_s681_2001:skill02_2': { w: 348, h: 389, cx: 49, cy: 242 },
  'v2_s681_2014:skill04_1': { w: 258, h: 465, cx: -23, cy: 334 },
  'v2_s681_3012:skill01_1': { w: 704, h: 565, cx: 336, cy: 199 },
  'v2_s681_3022:skill01_1': { w: 1397, h: 718, cx: 883, cy: 255 },
  'v2_s681_4003:skill01_2': { w: 686, h: 1401, cx: 9, cy: 653 },
  'v2_s681_4004:skill01_1': { w: 289, h: 368, cx: 24, cy: 192 },
  'v2_s681_4006:skill03': { w: 747, h: 518, cx: 483, cy: 316 },
  'v2_s681_4024:skill01': { w: 1890, h: 482, cx: 1416, cy: 232 },
  'v2_s681_4029:skill02': { w: 618, h: 248, cx: -4, cy: 51 },
  'v2_s681_6030:skill01_2_1': { w: 3612, h: 1219, cx: 623, cy: 94 },
  'v2_s681_5001:skill01_3': { w: 1441, h: 2283, cx: 176, cy: 861 },
  'v2_s681_5008:skill01_1': { w: 1302, h: 1082, cx: 38, cy: 608 },
  'v2_s681_5012:skill03': { w: 1090, h: 585, cx: 811, cy: 253 },
  'v2_s681_6009:skill02_3': { w: 314, h: 369, cx: 13, cy: -18 },
  'v2_s681_6014:skill01_1': { w: 901, h: 552, cx: 8, cy: 224 },
  'v2_s681_6015:attackall': { w: 1163, h: 548, cx: 130, cy: 243 },
  'v2_s681_6031:attackall': { w: 1085, h: 816, cx: 126, cy: 453 },
  'v2_s681_6033:skill03_1': { w: 490, h: 498, cx: 31, cy: 294 },
  // 新批次英雄大招 hu_*(2026-10-05,只量 clip 片段;核心 = 片段内亮度 10~90% 分位框,scratchpad fxprev/core_hu.py)
  'hu_098:skill2': { w: 1232, h: 1301, cx: -806, cy: 674 },
  'hu_058:skill2': { w: 1224, h: 687, cx: 67, cy: 66 },
  'hu_054:skill2': { w: 862, h: 455, cx: 163, cy: 58 },
  'hu_073:skill2': { w: 900, h: 560, cx: 0, cy: 150 },
  'hu_077:skill2': { w: 712, h: 618, cx: 84, cy: 83 },
  'hu_008:skill2': { w: 600, h: 700, cx: 110, cy: 160 },
  'hu_018:skill2': { w: 1600, h: 1400, cx: 613, cy: 721 }, // 实测 3141×2890 被后段巨型丝带撑大,上屏只剩 0.15 倍(2026-10-06 定格图冥球像颗豆);手定成冥球 + 斩击主体
  'hu_035:skill2': { w: 736, h: 375, cx: 345, cy: 84 },
  'hu_093:skill2': { w: 1329, h: 841, cx: -92, cy: 184 },
  'hu_074:skill2': { w: 795, h: 949, cx: 560, cy: -187 },
  'hu_063:skill2': { w: 1386, h: 629, cx: 479, cy: 111 },
  'hu_085:skill2': { w: 1341, h: 830, cx: 3, cy: 87 },
  'hu_044:skill2': { w: 857, h: 792, cx: -111, cy: 51 },
  'hu_065:skill2': { w: 1800, h: 1200, cx: 1173, cy: -236 }, // 实测 2528×1425 含飞出的火星,手定成火焰爆点主体(2026-10-06 定格图红月牙太小)
  'hu_014:skill2': { w: 529, h: 359, cx: 216, cy: 57 },
  'hu_027:skill2': { w: 700, h: 623, cx: 105, cy: 17 },
  'hu_013:skill2': { w: 630, h: 1250, cx: 648, cy: 627 },
  'hu_052:skill2': { w: 690, h: 571, cx: 13, cy: 234 },
  'hu_028:skill2': { w: 673, h: 644, cx: -224, cy: 88 },
  'hu_067:skill2': { w: 700, h: 700, cx: 0, cy: 200 },
  'hu_049:skill2': { w: 673, h: 732, cx: -2, cy: 14 },
  'hu_050:skill2': { w: 784, h: 534, cx: -25, cy: 301 },
};

/** 查核心亮区(key 同 lookupBattleFxBounds);没有或比宽松框还大(测量异常)返回 null,调用方按宽松框 ×0.57 兜底。 */
export function lookupBattleFxCoreBounds(effect: string, animation: string): BattleFxMeasuredBounds | null {
  const key = `${effect}:${(animation || '').toLowerCase()}`;
  const core = BATTLE_FX_CORE_BOUNDS[key] ?? null;
  const loose = BATTLE_FX_MEASURED_BOUNDS[key] ?? null;
  if (!core || (loose && (core.w > loose.w * 1.05 || core.h > loose.h * 1.05))) {
    return null;
  }
  return core;
}

/** 资源路径:assets/resources/spine/effect/<effect>/<effect>(与 SpineDataStore.loadSharedSpineData 直接对接)。 */
/**
 * 整段演出类大招里要隐藏的"铺满画面"插槽(压暗黑底 / 满屏底色 / 镜头遮罩),逐套登记;
 * 来自 scratchpad fxprev/big_hu.py(片段内覆盖固定机位 55% 以上、且是 hei / baidi 贴图或染成纯黑的插槽)。
 * 角色本体部件不用登记,BattleFxSlotFilter 按附件目录统一过滤。
 */
const BATTLE_FX_HIDDEN_SLOTS: Record<string, readonly string[]> = {
  hu_073: ['s1_baidi', 's2_guangqiu', 's2_guangqiu3', 's2_daoguang_yueya_normal2'],
  hu_044: ['effect-guangyun', 'effect-guangyun25'],
  hu_058: ['effect-qichang_1'], // 染纯黑的大爪痕,暗色战场上是一块黑影
  hu_018: ['TX-huidong3_9'],
  hu_098: ['tx-hei'],
  hu_077: ['HEI'],
  hu_093: ['tx-hei'],
  hu_063: ['hei'],
  hu_065: ['tx-hei'],
  hu_027: ['BJ_baidi_di'],
  hu_028: ['tx-guangyun8', 'tx-guangyun9'],
  hu_067: ['tx-hei2', 'tx-hei', 'tx-guangyun3', 'tx-guangyun7', 'tx-guangyun8', 'tx-guangyun9'],
  hu_049: ['tx-hei', 'guanyun', 'guanyun3', 'guanyun4'],
};

/** 这套特效是否需要插槽过滤(只有带 clip 的整段演出类);返回要额外隐藏的插槽名,不需要过滤返回 null。 */
export function resolveBattleFxHiddenSlots(spec: BattleSkillEffectSpec): readonly string[] | null {
  if (!spec.clip) {
    return null;
  }
  return BATTLE_FX_HIDDEN_SLOTS[spec.effect] ?? [];
}

/** 按特效套名取需裁剪的插槽表(只对整段演出类 hu_* 大招;加载门预处理用,与 resolveBattleFxHiddenSlots 同口径)。 */
export function resolveBattleFxHiddenSlotsForEffect(effect: string): readonly string[] | null {
  return effect.startsWith('hu_') ? (BATTLE_FX_HIDDEN_SLOTS[effect] ?? []) : null;
}

export function resolveBattleSkillEffectResource(spec: BattleSkillEffectSpec): string {
  return `spine/effect/${spec.effect}/${spec.effect}`;
}

/**
 * 该特效图集是否为预乘透明(premultiplied alpha)。2026-10-06 排查用户「新大招 Spine 里看还行,实机看着假」时的两项处理之一:
 * 新购满屏大招包 hu_* 原图集非预乘、透明区 RGB 带色(bleed);引擎对"正片叠底"插槽固定用 DST_COLOR / ONE_MINUS_SRC_ALPHA 混合,
 * 非预乘的白透明区会把底图提亮一倍。已把 hu_* 图集像素转成 RGB×A 预乘(原图备份 素材原始备份/hu-ult-pma-20261006,
 * 处理脚本 scratchpad fxprev/hu_fix_tex.py,同时给整帧铺满的烟尘序列帧做了椭圆柔边——那才是"灰棕色硬边矩形"的真凶),
 * 挂骨骼时必须同步 premultipliedAlpha=true;旧特效包(fx_pack_v2 / 早期批次)仍是非预乘,保持 false。
 */
/**
 * 图集经 fx_feather_tex.py 羽化 + 转预乘的单套 v2 特效(2026-10-12 起)。
 * v2_s576_022(守卫被动眩晕雷柱,2026-10-24):原图集有按黑底叠加设计的暗色残影光柱,普通混合下淡出成一条黑竖条;只做去暗 + 预乘(--min-w 9999 不羽化)。
 * fx_14003_leige_hit(深渊行者·相位突袭,2026-10-25):每个爆点外围一圈大面积半透明暗晕,战场上成暗色方块;同样去暗 + 预乘。
 */
const PREMULTIPLIED_V2_EFFECTS = new Set(['v2_a49_447', 'v2_s576_022', 'fx_14003_leige_hit']);

export function battleFxPremultiplied(effectCode: string): boolean {
  return effectCode.startsWith('hu_') || PREMULTIPLIED_V2_EFFECTS.has(effectCode);
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
