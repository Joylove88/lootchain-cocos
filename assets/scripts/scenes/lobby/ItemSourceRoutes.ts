import type { RefDetailSourceKind } from '../UiRefKit';

/**
 * 获取途径跳转表(2026-10-25 策划审核 P1-7 / P1-8,docs/45 §6-7)。
 * 跳转是客户端导航,用前端表;背包详情里的服务端来源文本保留给"说明"用。
 * key:物品编码(ENHANCE_STONE…)、英雄碎片 `FRAGMENT:<heroCode>`(带稀有度)、货币 GOLD、等级上限 LEVEL_CAP。
 */
export type ItemSourceTarget =
  | { type: 'gacha'; poolCode: string }
  | { type: 'adventure' }
  | { type: 'daily'; theme: 'AWAKEN' | 'FORGE' | 'ARCANE' | 'ABYSS' }
  | { type: 'shop'; kind: 'gold' | 'rune' }
  | { type: 'forge'; tab: 'decompose' }
  | { type: 'quest' }
  | { type: 'codex' }
  | { type: 'idle' };

export interface ItemSourceRoute {
  kind: RefDetailSourceKind;
  title: string;
  desc: string;
  target: ItemSourceTarget;
}

/** 每日副本主题开放日(与服务端 DailyDungeonConfig.THEMES 一致;JS getDay:0=周日)。 */
export const DAILY_THEME_OPEN_DAYS: Record<'AWAKEN' | 'FORGE' | 'ARCANE' | 'ABYSS', { name: string; days: number[]; label: string }> = {
  AWAKEN: { name: '觉醒之门', days: [2, 5, 0], label: '周二 / 五 / 日开放' },
  FORGE: { name: '熔火矿脉', days: [1, 4, 0], label: '周一 / 四 / 日开放' },
  ARCANE: { name: '秘法圣殿', days: [3, 6, 0], label: '周三 / 六 / 日开放' },
  ABYSS: { name: '深渊裂隙', days: [5, 6, 0], label: '周五 / 六 / 日开放' },
};

const POOL = { normal: 'BASIC_CONTRACT_PREVIEW', hero: 'NORMAL_HERO', limited: 'LIMITED_ABYSS_PREVIEW', equip: 'EQUIP_POOL' };

const daily = (theme: keyof typeof DAILY_THEME_OPEN_DAYS, desc: string): ItemSourceRoute => ({
  kind: 'daily',
  title: `每日副本 · ${DAILY_THEME_OPEN_DAYS[theme].name}`,
  desc,
  target: { type: 'daily', theme },
});
const adventure = (desc: string): ItemSourceRoute => ({ kind: 'tower', title: '冒险', desc, target: { type: 'adventure' } });
const gacha = (poolCode: string, title: string, desc: string): ItemSourceRoute => ({ kind: 'summon', title, desc, target: { type: 'gacha', poolCode } });

const ROUTES: Record<string, ItemSourceRoute[]> = {
  HERO_EXP_BOOK: [
    { kind: 'tower', title: '挂机收益', desc: '大厅挂机持续产出经验书', target: { type: 'idle' } },
    adventure('冒险首通奖励'),
    { kind: 'quest', title: '每日任务', desc: '完成每日任务领取', target: { type: 'quest' } },
  ],
  ULT_SCROLL: [daily('ABYSS', '深渊裂隙掉落'), adventure('冒险首领层首通')],
  BOSS_MARK: [daily('AWAKEN', '觉醒之门掉落'), adventure('冒险首领层首通')],
  ABYSS_CRYSTAL: [daily('ABYSS', '深渊裂隙Ⅲ起掉落'), adventure('冒险深层首领首通')],
  AWAKEN_STONE: [adventure('冒险首领层首通'), daily('AWAKEN', '觉醒之门掉落')],
  ENHANCE_STONE: [
    daily('FORGE', '熔火矿脉掉落'),
    { kind: 'forge', title: '锻造 · 分解', desc: '分解多余装备', target: { type: 'forge', tab: 'decompose' } },
    gacha(POOL.equip, '召唤 · 装备召唤', '装备召唤产出'),
  ],
  LOW_ENHANCE_STONE: [adventure('冒险首通奖励'), { kind: 'forge', title: '锻造 · 分解', desc: '分解多余装备', target: { type: 'forge', tab: 'decompose' } }],
  ENHANCE_STONE_HIGH: [daily('FORGE', '熔火矿脉Ⅲ起掉落'), gacha(POOL.equip, '召唤 · 装备召唤', '装备召唤产出')],
  DEEP_REFORGE_STONE: [daily('ARCANE', '秘法圣殿掉落'), adventure('冒险首领层首通')],
  EQUIP_REROLL_STONE: [daily('ARCANE', '秘法圣殿Ⅱ起掉落'), gacha(POOL.equip, '召唤 · 装备召唤', '装备召唤产出')],
  FUSION_LUCK_STONE: [daily('ARCANE', '秘法圣殿掉落'), gacha(POOL.equip, '召唤 · 装备召唤', '装备召唤产出')],
  ENHANCE_BLESS_STONE: [gacha(POOL.equip, '召唤 · 装备召唤', '装备召唤产出')],
  // docs/45 §12:+10 以上的核心消耗品 → 商店限购在前;分解橙装 35% / 红装 80% 附带护符
  ENHANCE_GUARD_RUNE: [
    { kind: 'shop', title: '商店 · 强化护符', desc: '80 钻石 / 张,每日限购 5 张', target: { type: 'shop', kind: 'rune' } },
    daily('FORGE', '熔火矿脉Ⅲ 胜利概率掉落'),
    { kind: 'forge', title: '锻造 · 分解', desc: '分解橙装 / 红装概率附带', target: { type: 'forge', tab: 'decompose' } },
    gacha(POOL.equip, '召唤 · 装备召唤', '装备召唤产出'),
  ],
  GUARD_CORE: [adventure('冒险首通奖励'), daily('FORGE', '每日副本胜利获得')],
  GOLD: [
    { kind: 'shop', title: '金币商店', desc: '用钻石兑换金币', target: { type: 'shop', kind: 'gold' } },
    { kind: 'tower', title: '挂机收益', desc: '大厅挂机持续产出金币', target: { type: 'idle' } },
    daily('FORGE', '每日副本奖励'),
  ],
  // docs/45 §14:绑钻目前只来自图鉴激活奖励(sql/112)
  BOUND_DIAMOND: [{ kind: 'event', title: '英雄图鉴', desc: '激活英雄图鉴领取绑钻', target: { type: 'codex' } }],
  LEVEL_CAP: [adventure('冒险首通获得玩家经验,提升英雄等级上限')],
};

/** 英雄碎片:R / SR 走普通 / 英雄召唤;SSR / UR 走限定 / 英雄召唤。 */
function fragmentRoutes(rarity: string): ItemSourceRoute[] {
  const high = /^(SSR|UR)$/i.test(rarity.trim());
  return high
    ? [gacha(POOL.limited, '召唤 · 限定召唤', '抽到重复英雄转为碎片'), gacha(POOL.hero, '召唤 · 英雄召唤', '抽到重复英雄转为碎片')]
    : [gacha(POOL.normal, '召唤 · 普通召唤', '抽到重复英雄转为碎片'), gacha(POOL.hero, '召唤 · 英雄召唤', '抽到重复英雄转为碎片')];
}

/** 查途径;没有登记的键返回空数组并告警(防止又出现点了没反应的按钮)。 */
export function resolveItemSourceRoutes(key: string, rarity = ''): ItemSourceRoute[] {
  const code = (key || '').trim().toUpperCase();
  if (code.startsWith('FRAGMENT')) {
    return fragmentRoutes(rarity);
  }
  if (code.startsWith('GEM_')) {
    return [adventure('冒险首领层首通'), { kind: 'forge', title: '锻造 · 分解', desc: '分解炽红装备', target: { type: 'forge', tab: 'decompose' } }];
  }
  const routes = ROUTES[code];
  if (!routes) {
    console.warn('[LootChain] item source route missing:', code);
    return [];
  }
  return routes;
}

export function hasItemSourceRoutes(key: string): boolean {
  const code = (key || '').trim().toUpperCase();
  return code.startsWith('FRAGMENT') || code.startsWith('GEM_') || !!ROUTES[code];
}

/** 每日副本主题今天是否开放:按北京时间的星期(与服务端切日一致,不受设备时区影响)。 */
export function dailyThemeOpenToday(theme: keyof typeof DAILY_THEME_OPEN_DAYS, nowMs = Date.now()): boolean {
  const beijingDay = new Date(nowMs + 8 * 3600 * 1000).getUTCDay();
  return DAILY_THEME_OPEN_DAYS[theme].days.indexOf(beijingDay) >= 0;
}
