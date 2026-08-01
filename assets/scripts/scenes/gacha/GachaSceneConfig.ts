import { Color } from 'cc';
import { equipQualityColorByCode } from '../lobby/EquipIconAssets';
import type { HeroCardArtProfile } from '../lobby/HeroCardArtAssets';

export type GachaRarity = 'R' | 'SR' | 'SSR' | 'UR';

export interface GachaPreviewPool {
  id: string;
  poolCode?: string;
  poolType?: string | null;
  displayType?: string | null;
  title: string;
  subline: string;
  rarity: GachaRarity;
  active: boolean;
  locked: boolean;
  drawEnabled?: boolean;
  previewOnly?: boolean;
  logoAsset?: string | null;
  tabLogoAsset?: string | null;
  logoText?: string;
  themeColor?: string | null;
  badgeText?: string | null;
  centerSpineResource?: string | null;
  centerSpineUuid?: string | null;
  centerSpineSkin?: string | null;
  centerIntroAnimation?: string | null;
  centerIdleAnimation?: string | null;
  rateNote?: string | null;
  recordNote?: string | null;
  exchangeNote?: string | null;
  guaranteeNote?: string | null;
  buttonSingleText?: string | null;
  buttonTenText?: string | null;
  buttonDisabledReason?: string | null;
  noticeText?: string | null;
  singleCost?: string | number | null;
  tenCost?: string | number | null;
  costCode?: string | null;
  primaryCostType?: string | null;
  primaryCostCode?: string | null;
  primarySingleCost?: string | number | null;
  primaryTenCost?: string | number | null;
  backupCostType?: string | null;
  backupCostCode?: string | null;
  backupSingleCost?: string | number | null;
  backupTenCost?: string | number | null;
}

export interface GachaPreviewCard {
  name: string;
  title: string;
  rarity: GachaRarity;
  stars: number;
  scale: number;
}

export interface GachaMockResultItem extends GachaPreviewCard {
  /** 装备奖励编码(rewardType=EQUIP):结果卡显示装备真图。 */
  equipCode?: string | null;
  kind: 'hero' | 'shard' | 'material';
  featured: boolean;
  /** 结果卡框色(五色稀有度框);缺省按 rarity 推导。 */
  frameColor?: GachaFrameColor;
  /** 材料/碎片中央图标(背包同款解析);无图走奖励槽底+剪影。 */
  iconAsset?: string | null;
  /** 英雄立绘显示档案(HeroCardArtAssets 镜像);未配立绘走剪影。 */
  heroArt?: HeroCardArtProfile | null;
  /** 后端奖励编码(详情弹窗查已拥有用):英雄=heroCode/材料=itemCode。 */
  rewardCode?: string | null;
  /** 本次获得数量(材料按稀有度多发)。 */
  obtainCount?: number;
  /** 英雄重复获得(已转碎片)。 */
  duplicate?: boolean;
}

export interface GachaActionItem {
  key: GachaActionKey;
  label: string;
  note: string;
}

export type GachaActionKey = 'info' | 'record' | 'exchange' | 'pool';

export interface GachaRevealStep {
  title: string;
  detail: string;
  progress: number;
}

export interface GachaRarityTone {
  fill: Color;
  stroke: Color;
  glow: Color;
  text: Color;
}

export const GACHA_BACKGROUND_ASSET = 'ui/gacha/gacha_bg_abyss_ring/spriteFrame';
// 弹框关闭钮统一走 AI 套件圆形金 X。
export const GACHA_MODAL_CLOSE_BUTTON_ASSET = 'ui/common/ai/button_close/spriteFrame';
export const GACHA_C1812_SUMMON_FLOOR_ASSET = 'ui/gacha/c1812/summon_floor/spriteFrame';
export const GACHA_C1812_SUMMON_MAGIC_CIRCLE_ASSET = 'ui/gacha/c1812/summon_magic_circle/spriteFrame';
export const GACHA_C1812_SUMMON_REWARD_SLOT_ASSET = 'ui/gacha/c1812/summon_reward_slot/spriteFrame';
export const GACHA_C1812_SUMMON_CASE_FRAME_ASSET = 'ui/gacha/c1812/summon_case_frame/spriteFrame';
export const GACHA_C1812_CURRENCY_GOLD_ASSET = 'ui/gacha/c1812/currency_gold/spriteFrame';
export const GACHA_POOL_LOGO_ASSETS = [
  'ui/gacha/logo_limited/spriteFrame',
  'ui/gacha/logo_hero/spriteFrame',
  'ui/gacha/logo_normal/spriteFrame',
  'ui/gacha/logo_locked/spriteFrame',
] as const;
export const GACHA_ABYSS_SPINE_RESOURCE = 'spine/gacha/huangfengjiaozong/huangfengjiaozong';
export const GACHA_ABYSS_SPINE_UUID = '178d1dbd-5a53-459b-83bb-2f05c623d99e';
export const GACHA_ABYSS_SPINE_SKIN = 'default';
export const GACHA_ABYSS_SPINE_INTRO_ANIMATION = 'idle';
export const GACHA_ABYSS_SPINE_IDLE_ANIMATION = 'idle';
export const GACHA_ABYSS_FALLBACK_SPINE_RESOURCE = 'spine/gacha/Lord of the Dark Abyss/1605';
export const GACHA_ABYSS_FALLBACK_SPINE_UUID = 'ce6aee72-45cb-4315-abfd-74ac40b8d0ce';
export const GACHA_ABYSS_FALLBACK_SPINE_SKIN = 'default';
export const GACHA_ABYSS_FALLBACK_SPINE_INTRO_ANIMATION = 'appear';
export const GACHA_ABYSS_FALLBACK_SPINE_IDLE_ANIMATION = 'idle';
export const GACHA_SUMMON_VIDEO_NORMAL_RESOURCE = 'video/gacha/call1';
export const GACHA_SUMMON_VIDEO_RARE_RESOURCE = 'video/gacha/call2';
export const GACHA_SUMMON_AUDIO_RESOURCE = 'audio/gacha/call';
export const GACHA_SUMMON_VIDEO_ASPECT_WIDTH = 1680;
export const GACHA_SUMMON_VIDEO_ASPECT_HEIGHT = 720;
export const GACHA_SUMMON_VIDEO_FALLBACK_SECONDS = 5.5;

// 当前为抽奖系统视觉预览配置，所有数据都只在客户端展示，不代表真实卡池概率或奖励。
export const GACHA_PREVIEW_POOLS: GachaPreviewPool[] = [
  { id: 'limited', title: '暗渊之主', subline: '限定召唤预览', rarity: 'SSR', active: true, locked: false },
  { id: 'hero', title: '永夜祭司', subline: '英雄召唤预览', rarity: 'SR', active: false, locked: false },
  { id: 'normal', title: '亡语者', subline: '普通召唤预览', rarity: 'R', active: false, locked: false },
];

export const GACHA_PREVIEW_CARDS: GachaPreviewCard[] = [
  { name: '亡语者', title: '格雷夫', rarity: 'R', stars: 2, scale: 0.72 },
  { name: '月蚀之影', title: '莱奥娜', rarity: 'SR', stars: 4, scale: 0.86 },
  { name: '暗渊之主', title: '维洛斯', rarity: 'SSR', stars: 6, scale: 1 },
  { name: '永夜祭司', title: '艾莉西亚', rarity: 'SR', stars: 4, scale: 0.86 },
  { name: '荒野狂战', title: '克莱恩', rarity: 'R', stars: 2, scale: 0.72 },
];

// 本地 mock 结果只用于前端验收动效，不代表真实抽卡结果，不写入后端。
export const GACHA_MOCK_RESULT_ONCE: GachaMockResultItem[] = [
  { name: '暗渊之主', title: '维洛斯', rarity: 'SSR', stars: 6, scale: 1, kind: 'hero', featured: true },
];

export const GACHA_MOCK_RESULT_TEN: GachaMockResultItem[] = [
  { name: '亡语者', title: '格雷夫', rarity: 'R', stars: 2, scale: 0.72, kind: 'hero', featured: false },
  { name: '荒野狂战', title: '克莱恩', rarity: 'R', stars: 2, scale: 0.72, kind: 'hero', featured: false },
  { name: '月蚀之影', title: '莱奥娜', rarity: 'SR', stars: 4, scale: 0.86, kind: 'hero', featured: false },
  { name: '古堡密钥', title: '突破材料', rarity: 'R', stars: 2, scale: 0.72, kind: 'material', featured: false },
  { name: '暗渊之主', title: '维洛斯', rarity: 'SSR', stars: 6, scale: 1, kind: 'hero', featured: true },
  { name: '永夜祭司', title: '艾莉西亚', rarity: 'SR', stars: 4, scale: 0.86, kind: 'hero', featured: false },
  { name: '月蚀碎片', title: '英雄碎片', rarity: 'SR', stars: 4, scale: 0.86, kind: 'shard', featured: false },
  { name: '荒野狂战', title: '克莱恩', rarity: 'R', stars: 2, scale: 0.72, kind: 'hero', featured: false },
  { name: '亡语者', title: '格雷夫', rarity: 'R', stars: 2, scale: 0.72, kind: 'hero', featured: false },
  { name: '星陨余烬', title: '召唤材料', rarity: 'SR', stars: 4, scale: 0.86, kind: 'material', featured: false },
];

export const GACHA_RIGHT_ACTIONS: GachaActionItem[] = [
  { key: 'info', label: '概率保底', note: '概率与保底合并展示，只读取后端卡池配置。' },
  { key: 'record', label: '记录', note: '召唤记录将只读展示历史结果，不能补发或重抽。' },
  { key: 'exchange', label: '兑换', note: '召唤积分兑换属于经济写入，当前阶段保持关闭。' },
  { key: 'pool', label: '奖池内容', note: '展示当前卡池中的英雄与物品条目，不变更卡池。' },
];

// 召唤演出只驱动本地预览页，不生成真实 drawNo，不扣道具，不更新保底。
export const GACHA_REVEAL_STEPS: GachaRevealStep[] = [
  { title: '聚魂', detail: '深渊契约正在聚合', progress: 0.34 },
  { title: '裂隙', detail: '召唤阵打开本地预览', progress: 0.68 },
  { title: '显影', detail: '即将展示 mock 结果', progress: 1 },
];

// 召唤页签套件(2026-07-22):item_action_button 罗盘暗板(圆心在左端 18.2% 宽处,圆径≈板高)+ 池徽章(自带圆环,置于板圆之上)。
export const GACHA_TAB_PLATE_ASSET = 'ui/common/ai/item_action_button/spriteFrame';
export const GACHA_TAB_PLATE_ASPECT = 220 / 68;
export const GACHA_TAB_CIRCLE_CX_RATIO = 40 / 220;
export type GachaPoolTabIconKey = 'LIMITED' | 'HERO' | 'EQUIP' | 'NORMAL' | 'LIGHTDARK';
export const GACHA_POOL_TAB_ICON_ASSETS: Record<GachaPoolTabIconKey, string> = {
  LIMITED: 'ui/gacha/ai/icon_pool_limited/spriteFrame',
  HERO: 'ui/gacha/ai/icon_pool_hero/spriteFrame',
  EQUIP: 'ui/gacha/ai/icon_pool_equip/spriteFrame',
  NORMAL: 'ui/gacha/ai/icon_pool_normal/spriteFrame',
  LIGHTDARK: 'ui/gacha/ai/icon_pool_lightdark/spriteFrame',
};
// 池 → 徽章:poolCode 关键词优先,displayType 兜底。
export function gachaPoolTabIconAsset(poolCode: string | null | undefined, displayType: string | null | undefined, previewId: string | null | undefined): string {
  const code = (poolCode || '').toUpperCase();
  const type = (displayType || '').toUpperCase();
  const id = (previewId || '').toLowerCase();
  if (code.includes('EQUIP')) {
    return GACHA_POOL_TAB_ICON_ASSETS.EQUIP;
  }
  if (code.includes('LIGHT') || code.includes('SEALED') || type === 'LOCKED') {
    return GACHA_POOL_TAB_ICON_ASSETS.LIGHTDARK;
  }
  if (type === 'LIMITED' || id === 'limited') {
    return GACHA_POOL_TAB_ICON_ASSETS.LIMITED;
  }
  if (type === 'HERO' || code === 'NORMAL_HERO' || id === 'hero') {
    return GACHA_POOL_TAB_ICON_ASSETS.HERO;
  }
  return GACHA_POOL_TAB_ICON_ASSETS.NORMAL;
}
// 右栏功能图标 + 消耗行/锁定图标(ui/common/ai,原中文名已改英文)。
export const GACHA_ACTION_ICON_ASSETS: Record<GachaActionKey, string> = {
  info: 'ui/common/ai/ic_gacha_rate/spriteFrame',
  record: 'ui/common/ai/ic_gacha_record/spriteFrame',
  exchange: 'ui/common/ai/ic_gacha_exchange/spriteFrame',
  pool: 'ui/common/ai/ic_gacha_pool/spriteFrame',
};
export const GACHA_COST_TICKET_ICON_ASSET = 'ui/common/ai/ic_ticket_gacha/spriteFrame';
export const GACHA_COST_DIAMOND_ICON_ASSET = 'ui/common/ai/ic_diamond_gem/spriteFrame';
export const GACHA_COST_GOLD_ICON_ASSET = 'ui/bag/ai/icon_gold/spriteFrame';
export const GACHA_LOCK_ICON_ASSET = 'ui/common/ai/ic_lock/spriteFrame';

// 召唤结果新套件(ui/gacha/ai,2026-07-21):summon_result 整框 + 五色卡框 + drawNo 行菱形装饰线。
export const GACHA_RESULT_PANEL_ASSET = 'ui/gacha/ai/summon_result/spriteFrame';
export const GACHA_RESULT_PANEL_ASPECT = 1672 / 941;
export const GACHA_RESULT_DIVIDER_LEFT_ASSET = 'ui/gacha/ai/summon_divider_l/spriteFrame';
export const GACHA_RESULT_DIVIDER_RIGHT_ASSET = 'ui/gacha/ai/summon_divider_r/spriteFrame';
export type GachaFrameColor = 'green' | 'blue' | 'purple' | 'orange' | 'red';
export const GACHA_RESULT_FRAME_ASSETS: Record<GachaFrameColor, string> = {
  green: 'ui/gacha/ai/green/spriteFrame',
  blue: 'ui/gacha/ai/blue/spriteFrame',
  purple: 'ui/gacha/ai/purple/spriteFrame',
  orange: 'ui/gacha/ai/orange/spriteFrame',
  red: 'ui/gacha/ai/red/spriteFrame',
};
export const GACHA_RESULT_STAR_ASSETS: Record<GachaFrameColor, string> = {
  green: 'ui/common/ai/star_green/spriteFrame',
  blue: 'ui/common/ai/star_blue/spriteFrame',
  purple: 'ui/common/ai/star_purple/spriteFrame',
  orange: 'ui/common/ai/star_orange/spriteFrame',
  red: 'ui/common/ai/star_red/spriteFrame',
};
// 框色文字调:左上稀有度字与星星同框色系。
export function gachaFrameTextColor(color: GachaFrameColor): Color {
  if (color === 'green') {
    return new Color(158, 232, 122, 255);
  }
  if (color === 'blue') {
    return new Color(126, 184, 255, 255);
  }
  if (color === 'purple') {
    return new Color(210, 146, 255, 255);
  }
  if (color === 'orange') {
    return new Color(255, 190, 92, 255);
  }
  return new Color(255, 112, 88, 255);
}
// 奖励框色设计定稿(docs/26):装备/英雄/碎片按自身品质 N绿/R蓝/SR紫/SSR橙/UR·EX红;
// 材料按固定表:经验书绿、低阶强化石蓝、高阶强化石/洗练石/重铸石/祝福石/守护符紫、觉醒石/BOSS印记橙。
export const GACHA_MATERIAL_FRAME_COLORS: Record<string, GachaFrameColor> = {
  HERO_EXP_BOOK: 'green',
  ENHANCE_STONE: 'blue',
  LOW_ENHANCE_STONE: 'blue',
  ENHANCE_STONE_HIGH: 'purple',
  HIGH_ENHANCE_STONE: 'purple',
  EQUIP_REROLL_STONE: 'purple',
  DEEP_REFORGE_STONE: 'purple',
  ENHANCE_BLESS_STONE: 'purple',
  ENHANCE_GUARD_RUNE: 'purple',
  AWAKEN_STONE: 'orange',
  BOSS_MARK: 'orange',
};
export function gachaFrameColorByRarity(rarity: string | null | undefined): GachaFrameColor {
  const value = (rarity || '').toUpperCase();
  if (value === 'UR' || value === 'EX') {
    return 'red';
  }
  if (value === 'SSR') {
    return 'orange';
  }
  if (value === 'SR') {
    return 'purple';
  }
  if (value === 'N') {
    return 'green';
  }
  return 'blue';
}
export function gachaResultFrameColor(rewardType: string | null | undefined, rewardCode: string | null | undefined, rarity: string | null | undefined): GachaFrameColor {
  const type = (rewardType || '').toUpperCase();
  if (type === 'EQUIP') {
    // 装备按真实品质定色(编码后缀是历史名,不可用;白装并入绿档):抽卡 rarity 字段只作兜底。
    const quality = equipQualityColorByCode(rewardCode);
    if (quality) {
      return quality === 'white' ? 'green' : quality;
    }
  }
  if (type !== 'HERO' && type !== 'HERO_FRAGMENT' && type !== 'EQUIP') {
    const exact = GACHA_MATERIAL_FRAME_COLORS[(rewardCode || '').toUpperCase()];
    if (exact) {
      return exact;
    }
  }
  return gachaFrameColorByRarity(rarity);
}

// 框色 → 结果卡星数(参考图口径):绿2/蓝3/紫4/橙5/红7。
export const GACHA_FRAME_STAR_COUNTS: Record<GachaFrameColor, number> = {
  green: 2,
  blue: 3,
  purple: 4,
  orange: 5,
  red: 7,
};

export function gachaRarityTone(rarity: GachaRarity): GachaRarityTone {
  if (rarity === 'UR') {
    return {
      fill: new Color(38, 8, 9, 222),
      stroke: new Color(234, 81, 50, 235),
      glow: new Color(255, 84, 53, 120),
      text: new Color(255, 191, 118, 255),
    };
  }
  if (rarity === 'SSR') {
    return {
      fill: new Color(42, 29, 8, 226),
      stroke: new Color(247, 202, 91, 245),
      glow: new Color(255, 213, 111, 140),
      text: new Color(255, 224, 147, 255),
    };
  }
  if (rarity === 'SR') {
    return {
      fill: new Color(29, 13, 43, 222),
      stroke: new Color(198, 91, 232, 230),
      glow: new Color(190, 82, 236, 105),
      text: new Color(233, 176, 255, 255),
    };
  }
  return {
    fill: new Color(9, 21, 38, 218),
    stroke: new Color(91, 158, 226, 220),
    glow: new Color(91, 159, 229, 92),
    text: new Color(163, 208, 255, 255),
  };
}
