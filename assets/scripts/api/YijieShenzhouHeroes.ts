/**
 * 异界神州英雄(2026-11-07,LootChain sql/156):D26 古风骨骼包(spine/hero/sz_*,原分辨率)。
 * 一处登记,各展示 / 资源表从这里取:资源兜底(LobbyHeroApi / LobbyCodexApi)、职业兜底、召唤卡立绘(HeroCardArtAssets)、
 * 头像 / 横版卡面(HeroHeadCrop)、契约之选卡文案(LobbyContractPickRenderer)。
 * 骨骼自带技能特效(D26 动作里画好了刀光 / 法术),外挂特效由 isBuiltinFxHero 判断是否跳过。
 */
export interface YijieHero {
  code: string;
  /** spine/hero/<asset>/<asset> 与 ui/hero-roster/card_background/<asset>.png */
  asset: string;
  heroClass: '战士' | '法师' | '刺客' | '射手' | '辅助' | '坦克';
  /** 透明立绘宽高比(render_portrait.py 实测) */
  artAspect: number;
  /** 契约之选卡:定位 + 两个特点标签 */
  role: string;
  tags: [string, string];
  /** 大招名(详情页技能组 / 战斗大招横幅;没有专属徽章图,详情页用通用徽章) */
  ultName: string;
  /** 待机首帧实际可见高度(骨骼单位,render_portrait.py --measure);D26 骨骼头部高度是 0,体型补偿按它算 */
  bodyH: number;
}

export const YIJIE_HEROES: readonly YijieHero[] = [
  { code: 'UR_ZHAOYUN', asset: 'sz_zhaoyun', heroClass: '战士', artAspect: 1.4633, role: '战士 · 突进连刺', tags: ['单骑破阵', '七进七出'], ultName: '龙胆·百鸟朝凤', bodyH: 930 },
  { code: 'UR_ZHUGELIANG', asset: 'sz_zhugeliang', heroClass: '法师', artAspect: 0.7362, role: '法师 · 星阵布控', tags: ['群体法术', '远程'], ultName: '卧龙·借东风', bodyH: 1790 },
  { code: 'UR_LVBU', asset: 'sz_lvbu', heroClass: '战士', artAspect: 1.382, role: '战士 · 横扫千军', tags: ['范围斩击', '无双'], ultName: '无双·神鬼乱舞', bodyH: 812 },
  { code: 'SSR_SUNWUKONG', asset: 'sz_sunwukong', heroClass: '刺客', artAspect: 0.9671, role: '刺客 · 如意棒法', tags: ['闪身连击', '高暴击'], ultName: '齐天·大闹天宫', bodyH: 1249 },
  { code: 'SSR_DIAOCHAN', asset: 'sz_diaochan', heroClass: '法师', artAspect: 0.9341, role: '法师 · 魅舞控场', tags: ['范围法伤', '远程'], ultName: '闭月·倾国之舞', bodyH: 1397 },
  { code: 'SSR_SUNSHANGXIANG', asset: 'sz_sunshangxiang', heroClass: '射手', artAspect: 1.2404, role: '射手 · 烈焰弩炮', tags: ['远程压制', '溅射'], ultName: '枭姬·红莲炮', bodyH: 1271 },
  { code: 'SSR_ZHANGFEI', asset: 'sz_zhangfei', heroClass: '坦克', artAspect: 1.3844, role: '坦克 · 怒吼镇场', tags: ['扛伤', '眩晕'], ultName: '燕人·丈八蛇矛', bodyH: 1308 },
  { code: 'SR_YANGJIAN', asset: 'sz_yangjian', heroClass: '战士', artAspect: 1.1415, role: '战士 · 天眼破邪', tags: ['高单段', '破防'], ultName: '显圣·天眼神光', bodyH: 1621 },
  { code: 'SR_HUATUO', asset: 'sz_huatuo', heroClass: '辅助', artAspect: 0.9443, role: '辅助 · 药炉回春', tags: ['群体回复', '续航'], ultName: '青囊·回春药炉', bodyH: 1127 },
  { code: 'SR_ZHANGCHUNHUA', asset: 'sz_zhangchunhua', heroClass: '刺客', artAspect: 0.9649, role: '刺客 · 镰刃影袭', tags: ['切后排', '收割残血'], ultName: '绝情·幽镰伤逝', bodyH: 1186 },
  { code: 'SR_ZHANGJIAO', asset: 'sz_zhangjiao', heroClass: '法师', artAspect: 0.9811, role: '法师 · 符雷齐落', tags: ['范围雷击', '远程'], ultName: '太平·黄天雷劫', bodyH: 1280 },
  { code: 'SR_HUANGZHONG', asset: 'sz_huangzhong', heroClass: '射手', artAspect: 0.9005, role: '射手 · 百步穿杨', tags: ['超远程', '高暴击'], ultName: '烈弓·定军一箭', bodyH: 1292 },
  { code: 'SR_CAOREN', asset: 'sz_caoren', heroClass: '坦克', artAspect: 1.2367, role: '坦克 · 巨盾坚守', tags: ['扛伤', '护盾队友'], ultName: '铁壁·坚城不破', bodyH: 1424 },
  { code: 'R_DAQIAO', asset: 'sz_daqiao', heroClass: '辅助', artAspect: 0.9358, role: '辅助 · 灯火祈福', tags: ['回复队友', '生存稳定'], ultName: '祈愿·明灯照归', bodyH: 1290 },
  { code: 'R_HUAXIONG', asset: 'sz_huaxiong', heroClass: '战士', artAspect: 1.2324, role: '战士 · 前排输出', tags: ['上手简单', '近战连击'], ultName: '骁将·赤刃斩', bodyH: 1370 },
  { code: 'R_GANNING', asset: 'sz_ganning', heroClass: '刺客', artAspect: 1.195, role: '刺客 · 突进爆发', tags: ['切入后排', '高暴击'], ultName: '锦帆·百骑劫营', bodyH: 1266 },
  { code: 'R_XUNYOU', asset: 'sz_xunyou', heroClass: '法师', artAspect: 0.9327, role: '法师 · 范围伤害', tags: ['清怪最快', '远程'], ultName: '奇策·墨卷连环', bodyH: 1214 },
  { code: 'R_TAISHICI', asset: 'sz_taishici', heroClass: '射手', artAspect: 0.9756, role: '射手 · 远程单点', tags: ['放风筝', '高暴击'], ultName: '神射·连珠火箭', bodyH: 1270 },
  { code: 'R_DIANWEI', asset: 'sz_dianwei', heroClass: '坦克', artAspect: 1.4234, role: '坦克 · 前排承伤', tags: ['皮糙肉厚', '保护队友'], ultName: '恶来·双戟镇门', bodyH: 1304 },
];

const BY_CODE: Record<string, YijieHero> = {};
for (const hero of YIJIE_HEROES) {
  BY_CODE[hero.code] = hero;
}

export function yijieHeroByCode(heroCode: string | null | undefined): YijieHero | null {
  return BY_CODE[(heroCode ?? '').trim().toUpperCase()] ?? null;
}

export const YIJIE_CARD_ART_DIR = 'ui/hero-roster/card_background';

/**
 * 骨骼动作自带整套技能光效(D26 的刀光 / 火柱 / 炮击都画在动作里,11-08 逐个渲染核对过)。
 * 野外 / 掠夺:放技能 / 大招整段播自身动作,不再叠外挂战技 / 大招特效(原来大招被掐到 1.2 秒再叠一层借来的特效)。
 * 守卫战不受影响:英雄站格子、怪在远处,目标处的外挂特效仍要播。
 */
export function isBuiltinFxHero(heroCode: string | null | undefined): boolean {
  return !!yijieHeroByCode(heroCode);
}

/**
 * 战斗 / 大厅 / 布阵体型补偿(LobbyBattleUnitSpineRuntime 的 ACT 补偿表):D26 骨骼导出时头部宽高是 0,
 * 运行时改用该稀有度的兜底高度(R 620 / SR 660 / SSR 1180 / UR 1280)缩放 → 补偿 = 兜底高度 / 实际可见高度,
 * 等于按真实身高缩放。11-07 守卫战实测标定。
 */
/** 整体微调(11-07 实测,同一张表守卫战 / 野外共用):1.4 时守卫战与契约魔女齐平、野外却大 25%,取 1.25 两边折中。 */
const YIJIE_SIZE_TWEAK = 1.25;

export function yijieCanvasCompensation(hero: YijieHero, fallbackRawHeight: number): number {
  return Math.round((YIJIE_SIZE_TWEAK * fallbackRawHeight / Math.max(400, hero.bodyH)) * 1000) / 1000;
}

/** 稀有度 = 英雄码前缀(UR_ / SSR_ / SR_ / R_)。 */
export function yijieRarity(hero: YijieHero): 'R' | 'SR' | 'SSR' | 'UR' {
  return hero.code.slice(0, hero.code.indexOf('_')) as 'R' | 'SR' | 'SSR' | 'UR';
}
