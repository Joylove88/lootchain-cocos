import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Node,
  ScrollView,
  Size,
  Sprite,
  UIOpacity,
  UITransform,
  Vec3,
  view,
  type EventTouch,
} from 'cc';
import { equipIconAssetByCode } from './EquipIconAssets';
import { mountEquipIconBacking, mountItemRarityBacking } from './EquipRarityShine';
import { parseGemCode } from './EquipDetailCard';
import type { BagItemEntryVO, ItemTypeBagGroupVO, LobbyBagPanelState } from '../../types/BagTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { glassLabel, glassProtoMap, GLASS_BAG_ICON, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, glassTagPillWidthOf, mountGlassButton, mountGlassClippedIcon, mountGlassFrame, mountGlassLine, mountGlassPanel, mountGlassScrollBar, mountGlassSectionHeader, mountGlassSlice, mountGlassTagPill, mountGlassTopBar } from '../UiGlassKit';
import { mountRefScrollBar, mountRefButton, mountRefDialogBackdrop, mountRefTitleBand, mountRefLineFrame, mountRefOrnateDialog, mountRefPlate, mountRefSliced, mountRefSlicedByWidth, mountRefSolid, mountRefTitledPanel, raiseRefFrame, REF_CLOSE_ASSET, REF_CLOSE_RING_ASSET, REF_BAG_DLG, REF_DETAIL, REF_DETAIL_INNER_BG, REF_DETAIL_SLOT_FRAME_ASSET, REF_HALL_BG, REF_ICON_RING_ASSET, REF_KIT, REF_ROW, REF_ROW_SELECTED, REF_SECTION_EMBLEM, REF_ULT, refDetailSourceKind } from '../UiRefKit';

// C1812 背包视觉资源：道具格底、选中高亮、主按钮、分割线与道具类型图标。
export const BAG_C1812_ITEM_SLOT_ASSET = 'ui/common/ai/item_slot/spriteFrame';
export const BAG_C1812_ITEM_SLOT_HIGHLIGHT_ASSET = 'ui/common/ai/item_slot_glow/spriteFrame';
export const BAG_C1812_BUTTON_PRIMARY_ASSET = 'ui/common/ai/button_primary/spriteFrame';
export const BAG_C1812_DIVIDER_ASSET = 'ui/common/ai/divider_gold/spriteFrame';
export const BAG_C1812_TITLE_BANNER_ASSET = 'ui/common/ai/title_banner/spriteFrame';
export const BAG_C1812_MODAL_FRAME_ASSET = 'ui/common/ai/popup_frame_small/spriteFrame';
export const BAG_C1812_ITEM_TYPE_ICON_ASSETS: Record<string, string> = {
  GACHA_TICKET: 'ui/bag/c1812/item_ticket/spriteFrame',
  HERO_FRAGMENT: 'ui/bag/c1812/item_fragment/spriteFrame',
  CURRENCY_BOX: 'ui/bag/c1812/item_chest/spriteFrame',
  MATERIAL: 'ui/bag/c1812/item_material/spriteFrame',
  EQUIPMENT: 'ui/bag/c1812/item_equipment/spriteFrame',
  CONSUMABLE: 'ui/bag/c1812/item_consumable/spriteFrame',
};

// P1.5 背包结构件与详情弹窗件(common/ai):横梁/胶囊/宽按钮/格框/侧栏图标/详情竖框/来源行/操作按钮。
export const BAG_AI_HEADER_BEAM_ASSET = 'ui/common/ai/bag_header_beam/spriteFrame';
export const BAG_AI_CURRENCY_BAR_ASSET = 'ui/common/ai/bag_currency_bar/spriteFrame';
export const BAG_AI_BUTTON_DARK_ASSET = 'ui/common/ai/bag_button_dark/spriteFrame';
export const BAG_AI_BUTTON_CRIMSON_ASSET = 'ui/common/ai/bag_button_crimson/spriteFrame';
export const BAG_AI_SLOT_BASE_ASSET = 'ui/common/ai/bag_slot/spriteFrame';
export const BAG_AI_SIDEBAR_PANEL_ASSET = 'ui/common/ai/bag_sidebar/spriteFrame';
export const BAG_AI_TAB_ACTIVE_ASSET = 'ui/common/ai/bag_tab_active/spriteFrame';
export const BAG_AI_GRID_PANEL_ASSET = 'ui/common/ai/bag_grid_panel/spriteFrame';
export const BAG_AI_DETAIL_FRAME_ASSET = 'ui/common/ai/item_detail_frame/spriteFrame';
// 背包页背景暗罩(纯色贴图);2026-10-20 用户「背包界面背景没有调暗」,以原型实测亮度定
const BAG_SCENE_SHADE_ALPHA = 120;
/** 2026-10-29 B 风格(毛玻璃)开关:手机横屏背包主界面按原型 bag_b 1:1(物品详情等弹窗待原型确认后接入)。 */
const BAG_GLASS = true;
/** B 风格背景:同一张哥特大厅图去饱和 / 偏冷 / 提亮 / 虚化(色调对齐原型 bag_b,其余整页界面共用)。 */
const BAG_GLASS_BG = 'ui/common/ref/hall_bg_glass/spriteFrame';
/** 背包合成规则(固定规则镜像,与服务器 COMPOSE_RULES 对齐):强化石x10→高阶x1 / 旧低阶石1:1并入 / 宝石 3 合 1。 */
const BAG_COMPOSE_RULES: Record<string, number> = {
  ENHANCE_STONE: 10,
  LOW_ENHANCE_STONE: 1,
  GEM_HP_1: 3, GEM_HP_2: 3, GEM_HP_3: 3, GEM_HP_4: 3,
  GEM_ATK_1: 3, GEM_ATK_2: 3, GEM_ATK_3: 3, GEM_ATK_4: 3,
  GEM_DEF_1: 3, GEM_DEF_2: 3, GEM_DEF_3: 3, GEM_DEF_4: 3,
};
/** 粗估文字宽(中文按字号、其余按 0.56 字号),标签胶囊定宽用。 */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of Array.from(text)) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.56;
  }
  return w;
}
/** 使用后获得物的简称(只给「使用 ×N → 获得 X」用;具体数额由服务端结算后飘字)。 */
function bagUseRewardLabel(item: BagItemEntryVO): string {
  const effect = (item.useEffectType || '').toUpperCase();
  const map: Record<string, string> = { ADD_GOLD: '金币', ADD_DIAMOND: '钻石', ADD_STAMINA: '体力', ADD_HERO_EXP: '英雄经验', RANDOM_REWARD: '随机奖励', FIXED_REWARD: '礼包奖励' };
  return map[effect] ?? '道具效果';
}

/** 合成产物尚未持有时卡框用的稀有度:源稀有度升一档。 */
function bagComposeTargetRarity(rarity: string | null | undefined): string {
  const order = ['N', 'R', 'SR', 'SSR', 'UR'];
  const i = order.indexOf((rarity || 'N').toUpperCase());
  return order[Math.min(order.length - 1, Math.max(0, i) + 1)];
}

export const BAG_AI_SOURCE_ROW_ASSET = 'ui/common/ai/item_source_row/spriteFrame';
export const BAG_AI_ACTION_BUTTON_ASSET = 'ui/common/ai/item_action_button/spriteFrame';
export const BAG_AI_SELL_BUTTON_ASSET = 'ui/common/ai/item_sell_button/spriteFrame';
export const BAG_AI_CLOSE_BUTTON_ASSET = 'ui/common/ai/button_close/spriteFrame';
export const BAG_AI_OP_ICON_SOURCE_ASSET = 'ui/common/ai/ic_source/spriteFrame';
export const BAG_AI_OP_ICON_USE_ASSET = 'ui/common/ai/ic_use/spriteFrame';
export const BAG_AI_OP_ICON_FORGE_ASSET = 'ui/common/ai/ic_forge/spriteFrame';
export const BAG_AI_OP_ICON_SHARE_ASSET = 'ui/common/ai/ic_share/spriteFrame';
export const BAG_AI_OP_ICON_GOLD_ASSET = 'ui/bag/ai/icon_gold/spriteFrame';
// 2026-10-17 按原型重出的提亮版分类图标(ui/bag/ref,同款造型、金色高光更亮);门票单独一枚。
export const BAG_AI_SIDEBAR_ICON_ASSETS: Record<string, string> = {
  ALL: 'ui/bag/ref/rail_all/spriteFrame',
  GACHA_TICKET: 'ui/bag/ref/rail_gacha_ticket/spriteFrame',
  HERO_FRAGMENT: 'ui/bag/ref/rail_hero_fragment/spriteFrame',
  CURRENCY_BOX: 'ui/bag/ref/rail_currency_box/spriteFrame',
  MATERIAL: 'ui/bag/ref/rail_material/spriteFrame',
  EQUIPMENT: 'ui/bag/ref/rail_equipment/spriteFrame',
  CONSUMABLE: 'ui/bag/ref/rail_consumable/spriteFrame',
  TICKET: 'ui/bag/ref/rail_ticket/spriteFrame',
};

// C 组物品图标(ui/bag/ai):itemCode 精确映射优先,再按类型/稀有度规则,最后回退旧水晶图。
export const BAG_AI_ITEM_ICON_ASSETS: Record<string, string> = {
  GOLD: 'ui/bag/ai/icon_gold/spriteFrame',
  DIAMOND: 'ui/bag/ai/icon_diamond/spriteFrame',
  BOUND_DIAMOND: 'ui/bag/ai/icon_bound_diamond/spriteFrame',
  STAMINA: 'ui/bag/ai/icon_stamina/spriteFrame',
  // 矿晶(P金-1c,docs/27):2026-10-26 换正式图标(熔岩矿石上的红色原生晶簇,和钻石 / 绑钻轮廓区分开)。
  SACRED_CRYSTAL: 'ui/bag/ai/icon_sacred_crystal/spriteFrame',
  LOW_ENHANCE_STONE: 'ui/bag/ai/icon_enhance_low/spriteFrame',
  HIGH_ENHANCE_STONE: 'ui/bag/ai/icon_enhance_high/spriteFrame',
  // 强化道具精确映射(否则会掉进 includes('ENHANCE') 分支错拿强化石图):
  ENHANCE_STONE: 'ui/bag/ai/icon_enhance_low/spriteFrame',
  ENHANCE_STONE_HIGH: 'ui/bag/ai/icon_enhance_high/spriteFrame',
  ENHANCE_BLESS_STONE: 'ui/forge/ai/icon_bless_stone/spriteFrame',
  ENHANCE_GUARD_RUNE: 'ui/forge/ai/icon_guard_rune/spriteFrame',
  // 宝石图标(2026-10-21 新做):3 种 × 5 阶各一张(赤魂石红 / 焰锋石橙金 / 苍岩石蓝,阶越高切工越繁)。
  GEM_HP_1: 'ui/equip/gems/gem_hp_1/spriteFrame',
  GEM_HP_2: 'ui/equip/gems/gem_hp_2/spriteFrame',
  GEM_HP_3: 'ui/equip/gems/gem_hp_3/spriteFrame',
  GEM_HP_4: 'ui/equip/gems/gem_hp_4/spriteFrame',
  GEM_HP_5: 'ui/equip/gems/gem_hp_5/spriteFrame',
  GEM_ATK_1: 'ui/equip/gems/gem_atk_1/spriteFrame',
  GEM_ATK_2: 'ui/equip/gems/gem_atk_2/spriteFrame',
  GEM_ATK_3: 'ui/equip/gems/gem_atk_3/spriteFrame',
  GEM_ATK_4: 'ui/equip/gems/gem_atk_4/spriteFrame',
  GEM_ATK_5: 'ui/equip/gems/gem_atk_5/spriteFrame',
  GEM_DEF_1: 'ui/equip/gems/gem_def_1/spriteFrame',
  GEM_DEF_2: 'ui/equip/gems/gem_def_2/spriteFrame',
  GEM_DEF_3: 'ui/equip/gems/gem_def_3/spriteFrame',
  GEM_DEF_4: 'ui/equip/gems/gem_def_4/spriteFrame',
  GEM_DEF_5: 'ui/equip/gems/gem_def_5/spriteFrame',
  HERO_EXP_BOOK: 'ui/bag/ai/icon_expbook/spriteFrame',
  HERO_CONTRACT_TICKET: 'ui/bag/ai/icon_ticket_hero/spriteFrame',
  LIMITED_CONTRACT_TICKET: 'ui/bag/ai/icon_ticket_limited/spriteFrame',
  NORMAL_CONTRACT_TICKET: 'ui/bag/ai/icon_ticket_normal/spriteFrame',
  CONTRACT_TICKET: 'ui/bag/ai/icon_ticket_normal/spriteFrame',
  REGRESSION_ITEM: 'ui/bag/ai/icon_regression/spriteFrame',
  // 2026-07-24 预埋:以下 5 图待 AI 生成后放入 ui/bag/ai(sprite-frame meta),全局(背包/召唤结果/洗练消耗行)即生效。
  DEEP_REFORGE_STONE: 'ui/bag/ai/icon_reforge_stone/spriteFrame',
  AWAKEN_STONE: 'ui/bag/ai/icon_awaken_stone/spriteFrame',
  BOSS_MARK: 'ui/bag/ai/icon_boss_mark/spriteFrame',
  EQUIP_REROLL_STONE: 'ui/bag/ai/icon_reroll_stone/spriteFrame',
  FUSION_LUCK_STONE: 'ui/bag/ai/icon_luck_stone/spriteFrame',
  // P6/P7 材料:临时兜底图(专属图生成后换回 icon_ult_scroll / icon_abyss_crystal):
  ULT_SCROLL: 'ui/bag/ai/icon_expbook/spriteFrame',
  ABYSS_CRYSTAL: 'ui/bag/ai/icon_bound_diamond/spriteFrame',
  // 守卫水晶升级材料(docs/38 §9):水晶塔顶晶簇裁出的图标。
  GUARD_CORE: 'ui/bag/ai/icon_guard_core/spriteFrame',
};
// 格阵实建封顶:装备虚拟条目可能上百件,全建会拖慢开屏(同锻造列表 60 行封顶的口径);超出时尾部提示按分类筛选。
const BAG_GRID_RENDER_CAP = 240;

const BAG_AI_SHARD_ICON_ASSETS: Record<string, string> = {
  N: 'ui/bag/ai/icon_shard_n/spriteFrame',
  R: 'ui/bag/ai/icon_shard_r/spriteFrame',
  SR: 'ui/bag/ai/icon_shard_sr/spriteFrame',
  SSR: 'ui/bag/ai/icon_shard_ssr/spriteFrame',
  UR: 'ui/bag/ai/icon_shard_ur/spriteFrame',
};

/** 道具/碎片图标预载清单(登录时拉):锻造材料台/召唤结果/背包首屏都吃这批图。 */
export const BAG_ITEM_ICON_PRELOAD_ASSETS: readonly string[] = [
  ...Object.values(BAG_AI_ITEM_ICON_ASSETS),
  ...Object.values(BAG_AI_SHARD_ICON_ASSETS),
  'ui/bag/ai/icon_gold_chest/spriteFrame',
];

/** 背包条目若是装备(EQUIP:<equipCode>)返回装备编码,否则 null。 */
function bagEquipCode(item: BagItemEntryVO): string | null {
  const code = (item.itemCode || '').toUpperCase();
  return code.startsWith('EQUIP:') && equipIconAssetByCode(code.slice(6)) ? code.slice(6) : null;
}

function bagItemIconAsset(item: BagItemEntryVO): string | null {
  const code = (item.itemCode || '').toUpperCase();
  // 装备真图(AI 逐件素材):EQUIP:<equipCode> 精确映射;3:2 横图由绘制侧等比处理。
  if (code.startsWith('EQUIP:')) {
    const equipIcon = equipIconAssetByCode(code.slice(6));
    if (equipIcon) {
      return equipIcon;
    }
  }
  const exact = BAG_AI_ITEM_ICON_ASSETS[code];
  if (exact) {
    return exact;
  }
  const type = (item.itemType || '').toUpperCase();
  if (type === 'HERO_FRAGMENT' || code.startsWith('HERO_FRAGMENT:')) {
    const rarity = (item.rarity || '').toUpperCase();
    return BAG_AI_SHARD_ICON_ASSETS[rarity === 'EPIC' ? 'SR' : rarity === 'RARE' ? 'R' : rarity] ?? BAG_AI_SHARD_ICON_ASSETS.N;
  }
  if (type === 'CURRENCY_BOX' || code.includes('GOLD_BOX') || code.includes('CURRENCY_BOX')) {
    return 'ui/bag/ai/icon_gold_chest/spriteFrame';
  }
  if (type === 'GACHA_TICKET' || code.includes('TICKET')) {
    return BAG_AI_ITEM_ICON_ASSETS.NORMAL_CONTRACT_TICKET;
  }
  if (code.includes('REGRESSION')) {
    return BAG_AI_ITEM_ICON_ASSETS.REGRESSION_ITEM;
  }
  if (code.includes('ENHANCE')) {
    return code.includes('HIGH') ? BAG_AI_ITEM_ICON_ASSETS.HIGH_ENHANCE_STONE : BAG_AI_ITEM_ICON_ASSETS.LOW_ENHANCE_STONE;
  }
  if (code.includes('EXP_BOOK')) {
    return BAG_AI_ITEM_ICON_ASSETS.HERO_EXP_BOOK;
  }
  return null;
}

/** 供召唤结果等外部面板复用:按 itemCode/itemType/稀有度解析背包风格图标,查不到返回 null。 */
export function resolveBagStyleItemIconAsset(itemCode: string, itemType?: string | null, rarity?: string | null): string | null {
  return bagItemIconAsset({ itemCode, itemType: itemType ?? '', rarity: rarity ?? '' } as BagItemEntryVO);
}

// 装备格光晕配色(按背包稀有度)。
function bagRarityGlowColor(rarity: string): { r: number; g: number; b: number } {
  const key = (rarity || '').toUpperCase();
  if (key === 'UR') {
    return { r: 236, g: 92, b: 74 };
  }
  if (key === 'SSR') {
    return { r: 236, g: 194, b: 92 };
  }
  if (key === 'SR' || key === 'EPIC') {
    return { r: 176, g: 126, b: 220 };
  }
  if (key === 'R' || key === 'RARE') {
    return { r: 98, g: 158, b: 224 };
  }
  return { r: 168, g: 162, b: 152 };
}

function bagItemTypeIconAsset(itemType: string): string {
  return BAG_C1812_ITEM_TYPE_ICON_ASSETS[(itemType || '').toUpperCase()] ?? BAG_C1812_ITEM_TYPE_ICON_ASSETS.MATERIAL;
}

// 格框金属线配色:中性哑光金属混入稀有度色(保留品质辨识但不花哨,参考图1的干净线框)。
function bagRarityFrameBandColor(rarity: string): { r: number; g: number; b: number } {
  // 2026-10-17 按原型:格框以古金为主、只带一点稀有度色(原来一半稀有度色,蓝紫框太跳)
  const tint = bagRarityGlowColor(rarity);
  return {
    r: Math.round(tint.r * 0.28 + 190 * 0.72),
    g: Math.round(tint.g * 0.28 + 150 * 0.72),
    b: Math.round(tint.b * 0.28 + 86 * 0.72),
  };
}

function bagSidebarIconAsset(itemType: string): string {
  return BAG_AI_SIDEBAR_ICON_ASSETS[(itemType || '').toUpperCase()] ?? BAG_AI_SIDEBAR_ICON_ASSETS.ALL;
}

export interface LobbyBagPanelHost {
  node: Node;
  currentLobbyBagState(): LobbyBagPanelState;
  closeLobbyBagPanel(): void;
  reloadLobbyBag(): void;
  selectLobbyBagItem(itemCode: string): void;
  clearLobbyBagSelection(): void;
  useLobbyBagItem(itemCode: string): void;
  composeLobbyBagItem(itemCode: string, times: number): void;
  currentLobbyBagComposeState(): { itemCode: string | null; times: number };
  currentLobbyBagComposeResult(): { sourceCode: string; usedCount: number; targetCode: string; gainedCount: number } | null;
  clearLobbyBagComposeResult(): void;
  openLobbyBagComposeDialog(itemCode: string): void;
  closeLobbyBagComposeDialog(): void;
  setLobbyBagComposeTimes(times: number): void;
  /** 出售(2026-09-25 开放):弹窗态(道具+数量+提交中+错误)存 host,重绘回种。 */
  currentLobbyBagSellState(): { itemCode: string | null; count: number; busy: boolean; error: string };
  openLobbyBagSellDialog(itemCode: string): void;
  closeLobbyBagSellDialog(): void;
  setLobbyBagSellCount(count: number): void;
  confirmLobbyBagSell(): void;
  /** 使用数量窗(2026-10-20):多于 1 个时弹出;confirm(all) 全部使用按持有数提交。 */
  currentLobbyBagUseState(): { itemCode: string | null; count: number; busy: boolean };
  setLobbyBagUseCount(count: number): void;
  closeLobbyBagUseDialog(): void;
  confirmLobbyBagUse(all: boolean): void;
  reloadLobbyBagItemSource(itemCode: string): void;
  refreshLobbyOverlay?(): void;
  currentLobbyProfile?(): PlayerLobbyProfileVO;
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize?: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

/** 大厅背包只读场景。 */
export class LobbyBagPanelRenderer {
  // 本地展示态:侧栏过滤分类 + 详情弹窗开关(纯前端,不写任何接口)。
  private selectedGroupKey = 'ALL';
  private detailPopupOpen = false;
  // 格阵滚动位置(content.y)与其所属分类:重绘时恢复,换分类/关背包回顶。
  private gridScrollY: number | null = null;
  private gridScrollKey = '';
  // 手机全屏弹窗区域(相对背包场景中心,已扣安全边距);电脑为 null,走原居中弹窗。每次 render 重算。
  private phoneDialogRect: PhoneDialogRect | null = null;
  /** 物品详情所在面板尺寸(二级弹窗按同一整屏映射算 u)。 */
  private phoneDetailPanelSize: { w: number; h: number } | null = null;
  /** 本次整刷的 uiScale(B 风格详情里沿用旧二级弹窗时要用)。 */
  private lastScale = 1;

  /** 道具卖光后关掉详情弹窗(否则会回落显示列表第一件)。 */
  closeDetailPopup(): void {
    this.detailPopupOpen = false;
  }

  constructor(private readonly host: LobbyBagPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyBagState();
    const scale = Math.max(0.64, Math.min(1, layout.uiScale));
    this.lastScale = scale;
    const panelWidth = Math.max(320 * scale, layout.stageWidth);
    const panelHeight = Math.max(280 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.createUiNode('LobbyBagDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyBagSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);

    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyBagSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(6, 6, 9, 232),
      rgba(190, 142, 64, 228),
      18 * scale,
    );
    // 实景背景垫底 + 轻压暗(2026-10-17 界面统一:换无棋盘格的哥特大厅图,等比 cover,不再拉伸变形)。
    // 按整屏(含安全边距)铺满,原型通屏不留黑边;压暗减轻到能看清烛光 / 旗帜
    const coverW = Math.max(panelWidth, layout.width + Math.abs(centerX) * 2);
    const coverH = Math.max(panelHeight, layout.height + Math.abs(centerY) * 2);
    const bgW = Math.max(coverW, coverH * REF_HALL_BG.ratio);
    const glass = BAG_GLASS && isPhoneDesign();
    this.host.addSprite('LobbyBagSceneBackdrop', glass ? BAG_GLASS_BG : REF_HALL_BG.path, 0, 0, bgW, bgW / REF_HALL_BG.ratio, panel)
      ?? this.host.addSprite('LobbyBagSceneBackdrop', 'ui/battle/ai/battle_bg_cathedral/spriteFrame', 0, 0, panelWidth, panelHeight, panel);
    const shade = this.host.addChildPlainNode(panel, 'LobbyBagSceneShade', 0, 0, panelWidth, panelHeight);
    // 2026-10-19 用户「背景太显眼」「背包界面背景没有调暗」:暗罩原是 Graphics,原生端面板局部刷新后不再绘制(实际一直没压暗),
    // 改纯色贴图;缺图才退 Graphics
    if (!glass && !mountRefSolid(this.host, shade, 'Fill', 0, 0, coverW, coverH, rgba(4, 3, 6, BAG_SCENE_SHADE_ALPHA))) {
      const shadeGraphics = shade.addComponent(Graphics);
      shadeGraphics.fillColor = rgba(4, 3, 6, BAG_SCENE_SHADE_ALPHA);
      shadeGraphics.rect(-coverW / 2, -coverH / 2, coverW, coverH);
      shadeGraphics.fill();
    }
    // 顶部装饰(横梁/副标题/chips)移除:左上标题+顶部货币展示+右上关闭。
    const closeBag = (): void => {
      this.detailPopupOpen = false;
      this.gridScrollY = null;
      this.host.closeLobbyBagPanel();
    };
    if (glass) {
      const profile = this.host.currentLobbyProfile?.();
      mountGlassTopBar(this.host, panel, 'LobbyBag', panelWidth, panelHeight, '背包', profile ? [
        { key: 'gold', icon: 'ui/bag/ai/icon_gold/spriteFrame', value: formatCompact(safeNumber(profile.gold)), width: 156 },
        { key: 'diamond', icon: 'ui/bag/ai/icon_diamond/spriteFrame', value: formatCompact(safeNumber(profile.diamond)), width: 181 },
      ] : [], closeBag, closeBag, { chipRight: 1716 });
      this.renderGlassBag(panel, panelWidth, panelHeight, state);
    } else {
      this.renderBagCurrencyBar(panel, panelWidth, panelHeight, scale);
      this.renderBagBody(panel, panelWidth, panelHeight, scale, state);
    }
    const renderBackButton = (): void => {
      if (glass) {
        return;
      }
      renderSceneBackButton(this.host, panelGroup, layout, 'LobbyBagBackButton', closeBag, scale, '背包');
    };
    // 手机(H5 横屏,2026-10-02 用户拍板):详情/合成/出售/合成结果弹窗铺满舞台,返回钮先画、被全屏弹窗盖住,
    // 免得与弹窗右上的关闭钮叠在同一位置误关整个背包。电脑保持原来居中弹窗 + 返回钮压在最上。
    this.phoneDialogRect = isPhoneDesign() ? resolvePhoneDialogRect(layout, centerX, centerY) : null;
    if (this.phoneDialogRect) {
      renderBackButton();
    }
    // 详情改为居中弹窗:点格子打开,叠在场景内容之上,随场景一起清理。
    const popupItems = flatItems(state.groups);
    if (this.detailPopupOpen && popupItems.length > 0) {
      const popupItem = popupItems.find((item) => item.itemCode === state.selectedItemCode) ?? popupItems[0];
      this.renderDetailPopup(panelGroup, popupItem, panelWidth, panelHeight, scale, state);
    }
    const composeResult = this.host.currentLobbyBagComposeResult();
    if (composeResult) {
      this.renderComposeResultDialog(panelGroup, composeResult, scale);
    }
    if (!this.phoneDialogRect) {
      renderBackButton();
    }
  }

  // 面板复用内容签名:凡影响渲染的输入都纳入(侧栏筛选/详情弹窗态/加载态/钱包/道具逐项数量/来源信息)。
  // 钱包(profile.gold/diamond)必须计入——货币栏读的是实时 profile,战斗/挂机后进背包不能露旧数值。
  currentContentSignature(): string {
    const state = this.host.currentLobbyBagState();
    const profile = this.host.currentLobbyProfile?.();
    const wallet = profile ? `${safeNumber(profile.gold)}:${safeNumber(profile.diamond)}` : 'no-profile';
    const flags = `${state.loading ? 1 : 0}${state.loaded ? 1 : 0}${state.error ? 1 : 0}`;
    const popup = this.detailPopupOpen
      ? `popup:${state.selectedItemCode ?? ''}:${state.sourceItemCode ?? ''}:${state.sourceLoading ? 1 : 0}:${safeText(state.sourceDesc)}:${safeText(state.sourceError)}`
      : 'nopopup';
    const composeState = this.host.currentLobbyBagComposeState();
    const composeSig = composeState.itemCode ? `compose:${composeState.itemCode}:${composeState.times}` : 'nocompose';
    const composeResult = this.host.currentLobbyBagComposeResult();
    const composeResultSig = composeResult ? `cres:${composeResult.targetCode}:${composeResult.gainedCount}:${composeResult.usedCount}` : 'nocres';
    const sellState = this.host.currentLobbyBagSellState();
    const sellSig = sellState.itemCode ? `sell:${sellState.itemCode}:${sellState.count}:${sellState.busy ? 1 : 0}:${sellState.error}` : 'nosell';
    const useState = this.host.currentLobbyBagUseState();
    const useSig = useState.itemCode ? `use:${useState.itemCode}:${useState.count}:${useState.busy ? 1 : 0}` : 'nouse';
    const groups = state.groups
      .map((group) => `${group.itemType}#${group.items.map((item) => `${item.itemCode}:${item.itemCount}:${item.rarity ?? ''}`).join(',')}`)
      .join('|');
    return `${this.selectedGroupKey}|${flags}|${wallet}|${state.selectedItemCode ?? ''}|${popup}|${composeSig}|${composeResultSig}|${sellSig}|${useSig}|${groups}`;
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  // 顶部货币展示(参考图):金币/钻石胶囊,只读无购买交互;资料缺失时不渲染。
  private renderBagCurrencyBar(parent: Node, width: number, height: number, scale: number): void {
    const profile = this.host.currentLobbyProfile?.();
    if (!profile) {
      return;
    }
    renderTopCurrencyBar(this.host, parent, width / 2, height / 2, scale, [
      { key: 'gold', icon: 'ui/bag/ai/icon_gold/spriteFrame', value: formatCompact(safeNumber(profile.gold)) },
      { key: 'diamond', icon: 'ui/bag/ai/icon_diamond/spriteFrame', value: formatCompact(safeNumber(profile.diamond)) },
    ]);
  }

  private renderBagBody(parent: Node, width: number, height: number, scale: number, state: LobbyBagPanelState): void {
    // 顶部只留返回+标题行,底部说明/刷新移入容器板:主体区上下都放开。
    const bodyTop = height / 2 - 66 * scale;
    const bodyBottom = -height / 2 + 26 * scale;
    const bodyHeight = Math.max(130 * scale, bodyTop - bodyBottom);
    const items = flatItems(state.groups);
    if (state.loading && items.length === 0) {
      this.renderEmpty(parent, width, bodyHeight, scale, '背包读取中，请稍候。');
      return;
    }
    if (items.length === 0) {
      this.renderEmpty(parent, width, bodyHeight, scale, state.error || '当前背包暂无可展示道具。');
      return;
    }

    const selectedItem = items.find((item) => item.itemCode === state.selectedItemCode) ?? items[0];
    // 侧栏过滤:固定分类(即使为 0)可选,选中空分类展示空格阵;未知残留键回退"全部"。
    const knownKeys = new Set([
      'MATERIAL', 'EQUIPMENT', 'GACHA_TICKET', 'CONSUMABLE', 'HERO_FRAGMENT', 'CURRENCY_BOX',
      ...state.groups.map((group) => (group.itemType || '').toUpperCase()),
    ]);
    if (this.selectedGroupKey !== 'ALL' && !knownKeys.has(this.selectedGroupKey)) {
      this.selectedGroupKey = 'ALL';
    }
    const filteredItems = this.selectedGroupKey === 'ALL'
      ? items
      : state.groups.find((group) => (group.itemType || '').toUpperCase() === this.selectedGroupKey)?.items ?? [];

    const wide = width >= 860 * scale && bodyHeight >= 260 * scale;
    if (wide) {
      // 参考图布局:左分类侧栏(窄高,贴紧背包) + 右侧加宽方格阵;详情走居中弹窗。
      const railWidth = Math.min(326 * scale, width * 0.27);
      // 两块细金框面板之间留一道可见间距(旧素材两侧有透明边,原来按负间距补偿;2026-10-17 换细金框后改正间距)。
      const gap = 16 * scale;
      const gridWidth = Math.max(320 * scale, width - 56 * scale - railWidth - gap);
      const railX = -width / 2 + 28 * scale + railWidth / 2;
      const gridX = railX + railWidth / 2 + gap + gridWidth / 2;
      this.renderGroupRail(parent, state.groups, railX, (bodyTop + bodyBottom) / 2, railWidth, bodyHeight, scale);
      this.renderItemGrid(parent, filteredItems, selectedItem, gridX, (bodyTop + bodyBottom) / 2, gridWidth, bodyHeight, scale, items.length, state);
      return;
    }

    this.renderItemGrid(parent, filteredItems, selectedItem, 0, (bodyTop + bodyBottom) / 2, width - 82 * scale, bodyHeight, scale, items.length, state);
  }

  // 分类侧栏(2026-10-17 界面统一,按 GPT 原型):细金框面板 + 金边暗行(选中亮金行),图标 + 名称 + 右对齐计数,可点过滤。
  /** 左栏分类行:固定分类全集(参考图,没有道具也展示计数 0)+ 服务端额外分类追加。 */
  private railRows(groups: ItemTypeBagGroupVO[]): Array<{ key: string; label: string; count: number }> {
    const totalCount = groups.reduce((sum, group) => sum + group.items.reduce((inner, item) => inner + safeNumber(item.itemCount), 0), 0);
    // 固定分类全集(参考图):没有道具的分类也展示,计数 0;服务端有额外分类则追加。
    const presetGroups: Array<{ key: string; label: string }> = [
      { key: 'MATERIAL', label: '材料' },
      { key: 'EQUIPMENT', label: '装备' },
      { key: 'GACHA_TICKET', label: '召唤券' },
      { key: 'CONSUMABLE', label: '消耗品' },
      { key: 'HERO_FRAGMENT', label: '英雄碎片' },
      { key: 'CURRENCY_BOX', label: '资源箱' },
    ];
    const groupByKey = new Map(groups.map((group) => [(group.itemType || '').toUpperCase(), group]));
    const rows: Array<{ key: string; label: string; count: number }> = [
      { key: 'ALL', label: '全部', count: totalCount },
      ...presetGroups.map((preset) => {
        const group = groupByKey.get(preset.key);
        return {
          key: preset.key,
          label: group ? safeText(group.itemTypeLabel) || preset.label : preset.label,
          count: group ? group.items.reduce((sum, item) => sum + safeNumber(item.itemCount), 0) : 0,
        };
      }),
      ...groups
        .filter((group) => !presetGroups.some((preset) => preset.key === (group.itemType || '').toUpperCase()))
        .map((group) => ({
          key: (group.itemType || '').toUpperCase(),
          label: safeText(group.itemTypeLabel),
          count: group.items.reduce((sum, item) => sum + safeNumber(item.itemCount), 0),
        })),
    ];
    return rows;
  }

  private renderGroupRail(parent: Node, groups: ItemTypeBagGroupVO[], x: number, y: number, width: number, height: number, scale: number): void {
    const rail = mountRefTitledPanel(this.host, parent, 'LobbyBagGroupRail', x, y, width, height, scale, '', { fill: rgba(10, 8, 8, 232) }).node;
    const rowWidth = width - 30 * scale;
    const railTopInset = 16 * scale;
    const railBottomInset = 14 * scale;
    const availableHeight = height - railTopInset - railBottomInset;
    const rows = this.railRows(groups);
    // 行高收紧(上限 72),从板顶顺排;行数按实际分类数分配(2026-10-02:手机设计高 720 下原按 7 行均分,
    // 服务端追加的第 8 类「门票」被截掉点不到)。
    const rowHeight = Math.min(72 * scale, availableHeight / Math.max(7, rows.length));
    const maxRows = Math.max(1, Math.floor(availableHeight / rowHeight));

    rows.slice(0, maxRows).forEach((row, index) => {
      const rowY = height / 2 - railTopInset - rowHeight / 2 - index * rowHeight;
      const rowH = rowHeight - 8 * scale;
      const rowNode = this.host.addChildPlainNode(rail, `LobbyBagGroupRow_${index}`, 0, rowY, rowWidth, rowH);
      const selected = row.key === this.selectedGroupKey;
      if (!mountRefSliced(this.host, rowNode, 'Art', selected ? REF_ROW_SELECTED : REF_ROW, 0, 0, rowWidth, rowH)) {
        const rowGraphics = rowNode.addComponent(Graphics);
        rowGraphics.fillColor = selected ? rgba(58, 42, 16, 235) : rgba(16, 13, 12, 220);
        rowGraphics.roundRect(-rowWidth / 2, -rowH / 2, rowWidth, rowH, 6 * scale);
        rowGraphics.fill();
        rowGraphics.strokeColor = selected ? rgba(246, 200, 104, 240) : rgba(132, 102, 60, 170);
        rowGraphics.lineWidth = Math.max(1, (selected ? 2 : 1.2) * scale);
        rowGraphics.roundRect(-rowWidth / 2, -rowH / 2, rowWidth, rowH, 6 * scale);
        rowGraphics.stroke();
      }
      // 图标 + 名称 + 右对齐计数。
      // 原型的分类图标大而亮(约行高 80%)
      const iconSize = Math.min(52 * scale, rowH - 6 * scale);
      this.host.addSprite(`LobbyBagGroupIcon_${index}`, bagSidebarIconAsset(row.key), -rowWidth / 2 + 16 * scale + iconSize / 2, 0, iconSize, iconSize, rowNode);
      const label = this.host.addChildLabel(rowNode, `LobbyBagGroupLabel_${index}`, row.label, -rowWidth / 2 + 28 * scale + iconSize, 0, 21 * scale, selected ? rgba(255, 230, 172) : rgba(235, 222, 196), new Size(rowWidth - iconSize - 100 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, selected);
      const countLabel = this.host.addChildLabel(rowNode, `LobbyBagGroupCount_${index}`, formatCompact(row.count), rowWidth / 2 - 20 * scale, 0, 18 * scale, selected ? rgba(252, 222, 150) : rgba(218, 205, 178), new Size(64 * scale, 22 * scale), HorizontalTextAlignment.RIGHT);
      countLabel.overflow = Label.Overflow.SHRINK;
      rowNode.addComponent(Button);
      this.host.applyImageButtonFeedback(rowNode, 1.02, 0.985);
      rowNode.on(Button.EventType.CLICK, () => {
        this.selectedGroupKey = row.key;
        this.host.refreshLobbyOverlay?.();
      }, this);
    });
  }

  /**
   * 2026-10-29 B 风格主界面(原型 bag_b 1:1,原型坐标 1870×841):左栏分类(无底板,选中 = 暗金块 + ›)、
   * 右侧玻璃面板(分区标题 + 共 N 种 + 9 列格阵 + 底部说明);格子 = 共用装备框 + 图标 + 右下数量 + 底部稀有度细线。
   */
  private renderGlassBag(parent: Node, panelWidth: number, panelHeight: number, state: LobbyBagPanelState): void {
    const { LX, FY, S, k } = glassProtoMap(panelWidth, panelHeight);
    const T = (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align: HorizontalTextAlignment = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const l = glassLabel(this.host, p, name, text, x, y, S(size), color, w, align, bold);
      l.fontSize = Math.max(12, Math.round(S(size)));
      l.lineHeight = l.fontSize + 4;
      return l;
    };
    const items = flatItems(state.groups);
    const rows = this.railRows(state.groups);
    if (this.selectedGroupKey !== 'ALL' && !rows.some((row) => row.key === this.selectedGroupKey)) {
      this.selectedGroupKey = 'ALL';
    }
    // 左栏无底板:背景在这一侧压暗、向右渐隐(10-29 用户:背景亮扎眼,字和背景糊在一起;原型此处约 (26,26,30))
    const shade = this.host.addSprite('LobbyBagRailShade', GLASS_ICON.shadeH, (LX(-80) + LX(600)) / 2, 0, LX(600) - LX(-80), panelHeight + S(40), parent);
    if (shade) {
      shade.color = rgba(255, 255, 255, 165);
    }
    // ── 左栏(45..375,行心 158 起步 81.5;分类多时压缩行距)──
    const step = Math.min(81.5, (775 - 118) / Math.max(1, rows.length));
    const railCx = (LX(45) + LX(375)) / 2;
    const railW = LX(375) - LX(45);
    const ox = (px: number): number => LX(px) - railCx;
    rows.forEach((row, index) => {
      const selected = row.key === this.selectedGroupKey;
      const node = this.host.addChildPlainNode(parent, `LobbyBagGroupRow_${index}`, railCx, FY(158 + index * step), railW, S(Math.min(80, step - 2)));
      if (selected) {
        mountGlassSlice(this.host, node, 'Bg', GLASS_SLICES.tabSel, 0, 0, railW, S(80), k);
      }
      const icon = this.host.addSprite('Icon', GLASS_BAG_ICON[row.key] ?? GLASS_BAG_ICON.PASS, ox(89), 0, S(50), S(50), node);
      if (icon) {
        icon.color = selected ? rgba(246, 240, 228) : rgba(176, 184, 198);
      }
      T(node, `LobbyBagGroupLabel_${index}`, row.label, ox(137), 0, 23, selected ? rgba(253, 253, 252) : rgba(206, 212, 222), S(130), HorizontalTextAlignment.LEFT, selected);
      T(node, `LobbyBagGroupCount_${index}`, formatCompact(row.count), ox(selected ? 334 : 346), 0, selected ? 20 : 22, selected ? rgba(246, 240, 228) : rgba(182, 189, 205), S(110), HorizontalTextAlignment.RIGHT);
      if (selected) {
        const chev = this.host.addSprite('Chevron', GLASS_ICON.chevron, ox(354), 0, S(18), S(18), node);
        if (chev) {
          chev.color = rgba(246, 240, 228);
        }
      } else {
        node.addComponent(Button);
        this.host.applyImageButtonFeedback(node, 1.02, 0.985);
        node.on(Button.EventType.CLICK, () => {
          this.selectedGroupKey = row.key;
          this.host.refreshLobbyOverlay?.();
        }, this);
      }
    });

    // ── 右:玻璃面板(415..1830 × 92..795)──
    const pCx = (LX(415) + LX(1830)) / 2;
    const pCy = (FY(92) + FY(795)) / 2;
    const grid = mountGlassPanel(this.host, parent, 'LobbyBagItemGrid', pCx, pCy, LX(1830) - LX(415), FY(92) - FY(795), k);
    const PX = (px: number): number => LX(px) - pCx;
    const PY = (py: number): number => FY(py) - pCy;
    const filtered = this.selectedGroupKey === 'ALL'
      ? items
      : state.groups.find((group) => (group.itemType || '').toUpperCase() === this.selectedGroupKey)?.items ?? [];
    const title = rows.find((row) => row.key === this.selectedGroupKey)?.label ?? '全部';
    mountGlassSectionHeader(this.host, grid, 'LobbyBagGridHeader', title, PX(454), PY(130), k, 27);
    T(grid, 'LobbyBagCapacityLabel', filtered.length === items.length ? `共 ${items.length} 种` : `${filtered.length} / 共 ${items.length} 种`, PX(1780), PY(130), 19, GLASS_COLOR.sub, S(260), HorizontalTextAlignment.RIGHT);
    if (state.loading && items.length === 0) {
      T(grid, 'LobbyBagGridEmptyHint', '背包读取中,请稍候。', 0, PY(440), 20, GLASS_COLOR.sub, S(600), HorizontalTextAlignment.CENTER);
    } else if (filtered.length === 0) {
      T(grid, 'LobbyBagGridEmptyHint', items.length === 0 ? (state.error || '当前背包暂无可展示道具。') : '该分类暂无道具', 0, PY(440), 20, GLASS_COLOR.sub, S(900), HorizontalTextAlignment.CENTER);
    }

    // 格阵:9 列(格 131×127,步 149 / 142.5,首格左上 451,170);视口 = 4 整行,四周留选中外晕余量
    const columns = 9;
    const cellW = S(131);
    const cellH = S(127);
    const stepX = S(149);
    const stepY = S(142.5);
    const pad = S(10);
    const shown = filtered.slice(0, BAG_GRID_RENDER_CAP);
    const rowCount = Math.ceil(shown.length / columns);
    const viewTop = PY(170) + pad;
    const viewBottom = PY(170 + 3 * 142.5 + 127) - pad;
    const viewW = stepX * (columns - 1) + cellW + pad * 2;
    const viewH = viewTop - viewBottom;
    const contentH = Math.max(viewH, rowCount * stepY - (stepY - cellH) + pad * 2);
    const viewCx = (PX(451) + PX(451 + 8 * 149 + 131)) / 2;
    const viewport = this.host.addChildPlainNode(grid, 'LobbyBagItemGridScroll', viewCx, (viewTop + viewBottom) / 2, viewW, viewH);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;
    const baseY = (viewH - contentH) / 2;
    const content = this.host.addChildPlainNode(viewport, 'LobbyBagItemGridScrollContent', 0, baseY, viewW, contentH);
    scrollView.content = content;
    // 选中框只跟着当前打开详情的道具走(原型首格选中 = 详情默认项)
    const selectedCode = state.selectedItemCode ?? shown[0]?.itemCode ?? null;
    shown.forEach((item, index) => {
      const x = -viewW / 2 + pad + cellW / 2 + (index % columns) * stepX;
      const y = contentH / 2 - pad - cellH / 2 - Math.floor(index / columns) * stepY;
      this.renderGlassItemCell(content, item, index, item.itemCode === selectedCode, x, y, cellW, cellH, k, S);
    });
    const maxOffset = Math.max(0, contentH - viewH);
    if (this.gridScrollKey !== this.selectedGroupKey) {
      this.gridScrollKey = this.selectedGroupKey;
      this.gridScrollY = null;
    }
    if (this.gridScrollY !== null) {
      content.setPosition(0, Math.min(baseY + maxOffset, Math.max(baseY, this.gridScrollY)));
    }
    if (maxOffset > 1) {
      const trackH = viewH - pad * 2;
      const thumbH = Math.max(S(40), trackH * (viewH / contentH));
      const update = mountGlassScrollBar(this.host, grid, 'LobbyBagItemGridScrollBar', PX(1806), viewport.position.y, S(4), trackH, thumbH);
      const draw = (): void => update(Math.min(maxOffset, Math.max(0, content.position.y - baseY)) / maxOffset);
      draw();
      viewport.on(ScrollView.EventType.SCROLLING, () => {
        this.gridScrollY = content.position.y;
        draw();
      }, this);
    } else {
      this.gridScrollY = null;
    }
    T(grid, 'LobbyBagBoundaryNote', '点击道具查看详情、获取途径,可使用的道具可直接使用或合成。', PX(1083), PY(759), 19, GLASS_COLOR.sub, S(1200), HorizontalTextAlignment.CENTER);
  }

  /** B 风格道具格:共用装备框(选中 = 选中态)+ 图标 + 底部稀有度细线 + 右下数量;点击开详情。 */
  private renderGlassItemCell(parent: Node, item: BagItemEntryVO, index: number, selected: boolean, x: number, y: number, w: number, h: number, k: number, S: (v: number) => number): void {
    const cell = mountGlassFrame(this.host, parent, `LobbyBagItemCard_${index}`, x, y, w, h, k, selected);
    const icon = bagItemIconAsset(item);
    const iconSize = Math.min(w, h) * 0.88;
    if (icon && bagEquipCode(item)) {
      // 装备图标自带稀有度圆角框:裁掉自带框,只留格子这一层框(10-28 用户:图标只要一层框)
      mountGlassClippedIcon(this.host, cell, 'LobbyBagItemIcon', icon, 0, S(3), iconSize * 0.92);
    } else if (!icon || !this.host.addSprite('LobbyBagItemIcon', icon, 0, S(3), iconSize, iconSize, cell)) {
      this.host.addSprite('LobbyBagItemTypeIcon', bagItemTypeIconAsset(item.itemType), 0, S(3), iconSize * 0.8, iconSize * 0.8, cell);
    }
    // 稀有度细线(原型取色,饱和):压在格子底边、几乎铺满格宽
    const key = (item.rarity || '').toUpperCase();
    const q = key === 'UR' || key === 'SSR' ? rgba(240, 163, 52) : key === 'SR' || key === 'EPIC' ? rgba(186, 84, 246) : key === 'R' || key === 'RARE' ? rgba(52, 132, 242) : rgba(150, 158, 170);
    mountGlassLine(this.host, cell, 'Rarity', 0, -h / 2 + S(4), w - S(7), Math.max(2, S(4)), q);
    const count = glassLabel(this.host, cell, 'LobbyBagItemCount', formatCompact(safeNumber(item.itemCount)), w / 2 - S(12), -h / 2 + S(19), S(21), rgba(250, 250, 250), w - S(16), HorizontalTextAlignment.RIGHT, true);
    count.fontSize = Math.round(S(21));
    count.lineHeight = count.fontSize + 2;
    count.enableOutline = true;
    count.outlineColor = rgba(0, 0, 0, 200);
    count.outlineWidth = Math.max(1, Math.round(S(1.5)));
    cell.addComponent(Button);
    this.host.applyImageButtonFeedback(cell, 1.03, 0.975);
    cell.on(Button.EventType.CLICK, () => {
      this.detailPopupOpen = true;
      this.host.selectLobbyBagItem(item.itemCode);
      this.host.refreshLobbyOverlay?.();
    }, this);
  }

  private renderItemGrid(parent: Node, items: BagItemEntryVO[], selectedItem: BagItemEntryVO, x: number, y: number, width: number, height: number, scale: number, totalItems: number, state: LobbyBagPanelState): void {
    // 2026-10-17 界面统一(GPT 原型):细金框面板 + 暗红标题带(徽记 + 当前分类名),容量签放在标题带右端。
    const panelInfo = mountRefTitledPanel(this.host, parent, 'LobbyBagItemGrid', x, y, width, height, scale, this.selectedGroupTitle(state.groups), { center: false, bandH: 52 * scale, fill: rgba(10, 8, 8, 232), legacyRed: true });
    const grid = panelInfo.node;
    const capWidth = 196 * scale;
    const capHeight = 38 * scale;
    const capX = width / 2 - 44 * scale - capWidth / 2;
    const capNode = this.host.addChildPlainNode(grid, 'LobbyBagCapacity', capX, panelInfo.bandY, capWidth, capHeight);
    mountRefSliced(this.host, capNode, 'Art', REF_KIT.statBar, 0, 0, capWidth, capHeight);
    // 2026-10-27 UI 审核:背包没有格数上限,原「容量 55/55」像是背包满了;改成道具种数
    const capLabel = this.host.addChildLabel(capNode, 'LobbyBagCapacityLabel', items.length === totalItems ? `共 ${totalItems} 种` : `${items.length} / 共 ${totalItems} 种`, 0, 0, 18 * scale, rgba(240, 214, 156), new Size(capWidth - 40 * scale, 24 * scale));
    capLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(capLabel, scale, false);

    // 方形格阵:稀有度边框 + 物品图标 + 右下数量;左右让开细金框与滚动条。
    const gap = 10 * scale;
    const cellAreaWidth = width - (isPhoneDesign() ? 96 : 64) * scale;
    let cellSize = Math.min(92 * scale, Math.max(72 * scale, cellAreaWidth / 8 - gap));
    if (isPhoneDesign()) {
      // 手机按原型一屏正好 9 列 × 4 行(不露半行):宽、高两头取小
      // 视口(gridTop + 8 → 底部说明上沿)再扣上下选中光环余量 8 + 8
      const availH = panelInfo.bodyTop - 22 * scale - (-height / 2 + height * 0.155 + 14 * scale);
      cellSize = Math.min((cellAreaWidth - 8 * gap) / 9, (availH - 3 * gap) / 4);
    }
    const columns = Math.max(1, Math.floor((cellAreaWidth + gap) / (cellSize + gap)));
    const gridTop = panelInfo.bodyTop - 14 * scale;
    const footerReserve = height * 0.155;
    const innerWidth = cellSize * columns + gap * (columns - 1);

    // 2026-10-02 用户反馈「背包中无法上下滚动,看不到其他道具」:格阵改 Mask + ScrollView 纵向滚动
    // (触屏拖动 + 鼠标滚轮,电脑/手机通用),原来只画首屏几行、其余只给「已显示 N/M 件」提示。
    // 视口上下各留选中光环外扩余量;下沿让开板内说明文字。重绘(点格子开详情等)按分类记住滚动位置。
    const ringPad = 8 * scale;
    let viewportBottom = -height / 2 + footerReserve + 14 * scale;
    const viewportWidth = innerWidth + ringPad * 2;
    const shownItems = items.slice(0, BAG_GRID_RENDER_CAP);
    const hiddenCount = items.length - shownItems.length;
    const rows = Math.ceil(shownItems.length / columns);
    const hintHeight = hiddenCount > 0 ? 36 * scale : 0;
    const neededHeight = ringPad * 2 + rows * cellSize + Math.max(0, rows - 1) * gap + hintHeight;
    // 视口上沿贴标题带下沿(容量签在带内,滚动的格子不会从签底下露出来)。
    const viewportTop = gridTop + ringPad;
    if (isPhoneDesign()) {
      // 原型:一屏正好 4 整行(不露半截格子),下沿就停在第 4 行下
      viewportBottom = Math.max(viewportBottom, viewportTop - (4 * cellSize + 3 * gap + ringPad * 2));
    }
    const viewportHeight = Math.max(cellSize + ringPad * 2, viewportTop - viewportBottom);
    const contentHeight = Math.max(viewportHeight, neededHeight);
    const viewport = this.host.addChildPlainNode(grid, 'LobbyBagItemGridScroll', 0, (viewportTop + viewportBottom) / 2, viewportWidth, viewportHeight);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;
    const contentBaseY = (viewportHeight - contentHeight) / 2;
    const content = this.host.addChildPlainNode(viewport, 'LobbyBagItemGridScrollContent', 0, contentBaseY, viewportWidth, contentHeight);
    scrollView.content = content;
    const startX = -innerWidth / 2 + cellSize / 2;
    const startY = contentHeight / 2 - ringPad - cellSize / 2;

    shownItems.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      this.renderItemCard(content, item, index, item.itemCode === selectedItem.itemCode, startX + column * (cellSize + gap), startY - row * (cellSize + gap), cellSize, cellSize, scale);
    });
    if (hiddenCount > 0) {
      const more = this.host.addChildLabel(content, 'LobbyBagMoreHint', `已显示 ${shownItems.length}/${items.length} 件 · 用左侧分类筛选查看其余`, 0, -contentHeight / 2 + ringPad + hintHeight / 2, 17 * scale, rgba(212, 201, 179), new Size(viewportWidth - 24 * scale, 24 * scale));
      more.overflow = Label.Overflow.SHRINK;
    }

    // 滚动位置:同一分类内重绘时恢复(夹到合法区间),换分类回顶。
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    if (this.gridScrollKey !== this.selectedGroupKey) {
      this.gridScrollKey = this.selectedGroupKey;
      this.gridScrollY = null;
    }
    if (this.gridScrollY !== null) {
      content.setPosition(0, Math.min(contentBaseY + maxOffset, Math.max(contentBaseY, this.gridScrollY)));
    }
    // 右侧细滚动条:内容超出视口时才画,提示还能往下翻;滚动中跟随重绘。
    if (maxOffset > 1) {
      const trackHeight = viewportHeight - ringPad * 2;
      const thumbHeight = Math.max(36 * scale, trackHeight * (viewportHeight / contentHeight));
      const barWidth = 5 * scale;
      const barX = Math.min(width / 2 - width * 0.035, viewportWidth / 2 + 10 * scale);
      // 2026-10-21 滚动卡顿:拇指改贴图,滚动时只挪位置(不再每帧重画 Graphics)
      const updateBar = mountRefScrollBar(this.host, grid, 'LobbyBagItemGridScrollBar', barX, viewport.position.y, barWidth, trackHeight, thumbHeight);
      const drawBar = (): void => updateBar(Math.min(maxOffset, Math.max(0, content.position.y - contentBaseY)) / maxOffset);
      drawBar();
      viewport.on(ScrollView.EventType.SCROLLING, () => {
        this.gridScrollY = content.position.y;
        drawBar();
      }, this);
    } else {
      this.gridScrollY = null;
    }

    if (items.length === 0) {
      const empty = this.host.addChildLabel(grid, 'LobbyBagGridEmptyHint', '该分类暂无道具', 0, 0, 19 * scale, rgba(208, 196, 173), new Size(width - 40 * scale, 26 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      this.applyOutline(empty, scale, false);
    }

    // 底部说明与刷新移入板内(不遮下边框)。
    const note = this.host.addChildLabel(grid, 'LobbyBagBoundaryNote', '点击道具查看详情、获取途径,可使用的道具可直接使用或合成。', 0, -height / 2 + height * 0.155, 17 * scale, rgba(230, 217, 191), new Size(width - width * 0.14, 24 * scale));
    note.overflow = Label.Overflow.SHRINK;
    this.applyOutline(note, scale, false);
    mountRefButton(this.host, grid, 'LobbyBagReloadButton', state.loading ? '读取中' : '刷新', 0, -height / 2 + height * 0.085, 176 * scale, 50 * scale, scale, state.loading ? 'disabled' : 'secondary',
      state.loading ? undefined : () => this.host.reloadLobbyBag(), { fontSize: 20 * scale });
  }

  // 方形道具格(参考图):格底 + itemCode 映射图标(缺图回退水晶图) + 稀有度边框 + 右下数量;点击打开详情弹窗。
  // 格子边框(参考图1):程序画细金属线框——外暗缘衬托 + 哑光金属主线(带稀有度色调)+ 高光棱线 + 内暗缘,
  // 替代原雕花框图(角饰在小格子里显得杂乱)。
  private addCleanSlotFrame(parent: Node, name: string, x: number, y: number, size: number, scale: number, rarity: string): void {
    const frame = this.host.addChildPlainNode(parent, name, x, y, size + 6 * scale, size + 6 * scale);
    const graphics = frame.addComponent(Graphics);
    const half = size / 2;
    const band = bagRarityFrameBandColor(rarity);
    // 外缘暗线:把框从深色底上衬出来
    graphics.lineWidth = 2 * scale;
    graphics.strokeColor = rgba(5, 4, 7, 255);
    graphics.roundRect(-half - 2.5 * scale, -half - 2.5 * scale, size + 5 * scale, size + 5 * scale, 6 * scale);
    graphics.stroke();
    // 哑光金属主线
    graphics.lineWidth = 3 * scale;
    graphics.strokeColor = rgba(band.r, band.g, band.b, 255);
    graphics.roundRect(-half, -half, size, size, 4 * scale);
    graphics.stroke();
    // 高光棱线:主线外侧一道亮细线,做斜上受光的金属棱感
    graphics.lineWidth = 1 * scale;
    graphics.strokeColor = rgba(Math.min(255, band.r + 62), Math.min(255, band.g + 58), Math.min(255, band.b + 50), 170);
    graphics.roundRect(-half - 1.2 * scale, -half - 1.2 * scale, size + 2.4 * scale, size + 2.4 * scale, 5 * scale);
    graphics.stroke();
    // 内缘暗线:压住格内图与框的交界
    graphics.lineWidth = 2 * scale;
    graphics.strokeColor = rgba(12, 10, 14, 235);
    graphics.roundRect(-half + 2 * scale, -half + 2 * scale, size - 4 * scale, size - 4 * scale, 3 * scale);
    graphics.stroke();
  }

  private renderItemCard(parent: Node, item: BagItemEntryVO, index: number, selected: boolean, x: number, y: number, width: number, height: number, scale: number): void {
    const size = Math.min(width, height);
    const card = this.host.addChildPlainNode(parent, `LobbyBagItemCard_${index}`, x, y, size, size);
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, () => {
      this.detailPopupOpen = true;
      this.host.selectLobbyBagItem(item.itemCode);
      this.host.refreshLobbyOverlay?.();
    }, this);
    this.host.applyImageButtonFeedback(card, 1.03, 0.975);

    const customIcon = bagItemIconAsset(item);
    // 2026-10-22 用户「背包物品两个框,移除外部框」:有图标时图标自带暗底 + 稀有度描边,不再画格底与外层稀有度格框
    if (!customIcon && !this.host.addSprite('LobbyBagItemSlotArt', BAG_AI_SLOT_BASE_ASSET, 0, 0, size, size, card)) {
      const graphics = card.addComponent(Graphics);
      graphics.fillColor = rgba(9, 9, 12, 208);
      graphics.roundRect(-size / 2, -size / 2, size, size, 5 * scale);
      graphics.fill();
    }
    let customIconShown = false;
    if (customIcon) {
      const iconW = size;
      // 装备图标是透明底:先垫暗底(橙 / 红装带背景流光),再贴装备图
      if (bagEquipCode(item)) {
        mountEquipIconBacking(this.host, card, 'LobbyBagItemIconBacking', iconW, bagEquipCode(item));
      } else {
        // 材料 / 道具(A 方案):暗底 + 稀有度细描边,与装备同款
        mountItemRarityBacking(this.host, card, 'LobbyBagItemIconBacking', iconW, item.rarity);
      }
      customIconShown = !!this.host.addSprite('LobbyBagItemIcon', customIcon, 0, 0, iconW, iconW, card);
    }
    if (!customIconShown) {
      if (customIcon) {
        this.host.addSprite('LobbyBagItemSlotArt', BAG_AI_SLOT_BASE_ASSET, 0, 0, size, size, card);
      }
      this.host.addSprite('LobbyBagItemTypeIcon', bagItemTypeIconAsset(item.itemType), 0, 0, size * 0.66, size * 0.66, card);
      this.addCleanSlotFrame(card, 'LobbyBagItemRarityFrame', 0, 0, size, scale, item.rarity);
    }
    if (selected) {
      // 选中态:程序画金色描边环(外柔光+内亮线)。item_slot_glow 中心不透明,整图叠加会盖住道具图,弃用。
      const highlight = this.host.addChildPlainNode(card, 'LobbyBagItemSlotHighlight', 0, 0, size + 12 * scale, size + 12 * scale);
      const highlightGraphics = highlight.addComponent(Graphics);
      highlightGraphics.lineWidth = 5 * scale;
      highlightGraphics.strokeColor = rgba(255, 190, 92, 88);
      highlightGraphics.roundRect(-size / 2 - 5 * scale, -size / 2 - 5 * scale, size + 10 * scale, size + 10 * scale, 8 * scale);
      highlightGraphics.stroke();
      highlightGraphics.lineWidth = 2.5 * scale;
      highlightGraphics.strokeColor = rgba(255, 216, 132, 235);
      highlightGraphics.roundRect(-size / 2 - 2 * scale, -size / 2 - 2 * scale, size + 4 * scale, size + 4 * scale, 7 * scale);
      highlightGraphics.stroke();
    }
    // 数量:原型字更大更白(2026-10-17 用户「字体看着也有些暗」)
    const count = this.host.addChildLabel(card, 'LobbyBagItemCount', formatCompact(safeNumber(item.itemCount)), size / 2 - 7 * scale, -size / 2 + 13 * scale, 18 * scale, rgba(252, 240, 212), new Size(size - 12 * scale, 22 * scale), HorizontalTextAlignment.RIGHT);
    count.overflow = Label.Overflow.SHRINK;
    count.lineHeight = count.fontSize;
    this.applyOutline(count, scale, true);
  }

  // 居中详情弹窗(参考图):遮罩点击或右上 X 关闭;用途/获取途径/操作按钮(只读禁用)/出售横幅。
  // 框整图非等比拉宽到参考图比例(角饰轻微加宽可接受),内容按比例内边距排布。
  private renderDetailPopup(parent: Node, item: BagItemEntryVO, panelWidth: number, panelHeight: number, scale: number, state: LobbyBagPanelState): void {
    if (BAG_GLASS && isPhoneDesign()) {
      this.renderGlassDetail(parent, item, panelWidth, panelHeight, state);
      return;
    }
    if (this.phoneDialogRect) {
      this.renderDetailPopupPhone(parent, item, this.phoneDialogRect, panelWidth, panelHeight, scale, state);
      return;
    }
    const frameAspect = 1.5;
    let width = Math.min(584 * scale, panelWidth - 110 * scale);
    let height = width * frameAspect;
    if (height > panelHeight - 24 * scale) {
      height = panelHeight - 24 * scale;
      width = height / frameAspect;
    }
    const dim = this.host.addChildPlainNode(parent, 'LobbyBagDetailPopupDim', 0, 0, panelWidth, panelHeight);
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 158);
    dimGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const detail = this.host.addChildPlainNode(parent, 'LobbyBagItemDetail', 0, 0, width, height);
    detail.addComponent(BlockInputEvents);
    // P1.5 详情竖框(黑曜石面板+金红角饰,SLICED 保角);缺图回退轻量暗底。
    const detailFrame = this.host.addSprite('LobbyBagItemDetailFrame', BAG_AI_DETAIL_FRAME_ASSET, 0, 0, width, height, detail);
    if (!detailFrame) {
      const graphics = detail.addComponent(Graphics);
      graphics.fillColor = rgba(12, 10, 13, 236);
      graphics.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(196, 150, 76, 186);
      graphics.lineWidth = Math.max(1, 1.2 * scale);
      graphics.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
      graphics.stroke();
    }
    const closePopup = (): void => {
      this.detailPopupOpen = false;
      if (detail.isValid) {
        detail.destroy();
      }
      if (dim.isValid) {
        dim.destroy();
      }
      // 必须清 state 选中:复用签名含 selectedItemCode,只销毁节点会让同物品二次点击命中复用不再弹框。
      this.host.clearLobbyBagSelection();
    };
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, closePopup, this);
    // 内容区按框体比例内边距排布:左右各留 17%(角饰+呼吸空间,参考图排版),内容占 66%。
    const contentLeft = -width / 2 + width * 0.17;
    const contentWidth = width * 0.66;
    const contentRight = contentLeft + contentWidth;

    // 关闭按钮对齐召唤记录弹框规格(58)。
    const closeSize = 58 * scale;
    const closeButton = this.host.addChildPlainNode(detail, 'LobbyBagDetailCloseButton', width / 2 - width * 0.095, height / 2 - height * 0.05, closeSize + 6 * scale, closeSize + 6 * scale);
    this.host.addSprite('LobbyBagDetailCloseArt', BAG_AI_CLOSE_BUTTON_ASSET, 0, 0, closeSize, closeSize, closeButton);
    closeButton.addComponent(Button);
    this.host.applyImageButtonFeedback(closeButton, 1.08, 0.92);
    closeButton.on(Button.EventType.CLICK, closePopup, this);

    // 标题/副标题/展示图整体下移,全部落在框顶饰(约占高 15%)下方。
    const title = this.host.addChildLabel(detail, 'LobbyBagDetailName', safeText(item.itemName), width * 0.02, height / 2 - height * 0.162, 24 * scale, rgba(248, 220, 153), new Size(contentWidth - 60 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const subtitle = this.host.addChildLabel(detail, 'LobbyBagDetailSubtitle', `${safeText(item.rarity || 'N')} · ${itemTypeLabel(item.itemType)}`, width * 0.02, height / 2 - height * 0.196, 18 * scale, this.rarityColor(item.rarity), new Size(contentWidth - 60 * scale, 21 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(subtitle, scale, false);

    // 道具展示图:副标题下方居中(不压框饰),映射图标优先。
    const popupIconSize = Math.min(62 * scale, height * 0.09);
    const popupIcon = bagItemIconAsset(item);
    const popupIconY = height / 2 - height * 0.246;
    this.host.addSprite('LobbyBagDetailSlotArt', BAG_AI_SLOT_BASE_ASSET, 0, popupIconY, popupIconSize, popupIconSize, detail);
    if (popupIcon) {
      const popupW = popupIconSize * 0.86;
      this.host.addSprite('LobbyBagDetailIcon', popupIcon, 0, popupIconY, popupW, popupW, detail);
    } else {
      this.host.addSprite('LobbyBagDetailTypeIcon', bagItemTypeIconAsset(item.itemType), 0, popupIconY, popupIconSize * 0.68, popupIconSize * 0.68, detail);
    }
    this.addCleanSlotFrame(detail, 'LobbyBagDetailRarityFrame', 0, popupIconY, popupIconSize, scale, item.rarity);
    // 分割线加粗;各信息段再补淡金细线,层次可读。
    this.host.addSprite('LobbyBagDetailDivider', BAG_C1812_DIVIDER_ASSET, 0, height / 2 - height * 0.308, Math.min(contentWidth, 400 * scale), 30 * scale, detail);
    const separators = this.host.addChildPlainNode(detail, 'LobbyBagDetailSeparators', 0, 0, width, height);
    const separatorGraphics = separators.addComponent(Graphics);
    separatorGraphics.strokeColor = rgba(206, 168, 104, 62);
    separatorGraphics.lineWidth = Math.max(1, 1 * scale);

    // 拥有数量行(参考图):左标签右数值。
    const ownedY = height / 2 - height * 0.348;
    const ownedLabel = this.host.addChildLabel(detail, 'LobbyBagDetailOwnedLabel', '拥有数量', contentLeft, ownedY, 19 * scale, rgba(236, 221, 190), new Size(contentWidth * 0.5, 22 * scale), HorizontalTextAlignment.LEFT);
    ownedLabel.overflow = Label.Overflow.SHRINK;
    const ownedValue = this.host.addChildLabel(detail, 'LobbyBagDetailOwnedValue', formatCompact(safeNumber(item.itemCount)), contentRight - contentWidth * 0.25, ownedY, 19 * scale, rgba(255, 232, 168), new Size(contentWidth * 0.5, 22 * scale), HorizontalTextAlignment.RIGHT);
    ownedValue.overflow = Label.Overflow.SHRINK;
    this.applyOutline(ownedValue, scale, true);
    separatorGraphics.moveTo(contentLeft, ownedY - height * 0.021);
    separatorGraphics.lineTo(contentRight, ownedY - height * 0.021);
    separatorGraphics.stroke();

    // 用途整行(2026-07-24 接配置表 use_desc;老数据缺失回退效果类型码):长文案整行展示不再挤两列格。
    const rowStep = height * 0.044;
    const useRowY = height / 2 - height * 0.39;
    const useTitle = this.host.addChildLabel(detail, 'LobbyBagDetailUseTitle', '用途', contentLeft, useRowY, 19 * scale, rgba(236, 221, 190), new Size(contentWidth * 0.18, 22 * scale), HorizontalTextAlignment.LEFT);
    useTitle.overflow = Label.Overflow.SHRINK;
    const useValue = this.host.addChildLabel(detail, 'LobbyBagDetailUseValue', safeText(item.useDesc || item.useEffectType || '仅展示'), contentLeft + contentWidth * 0.16, useRowY, 19 * scale, rgba(220, 208, 185), new Size(contentWidth * 0.82, 20 * scale), HorizontalTextAlignment.LEFT);
    useValue.overflow = Label.Overflow.SHRINK;
    separatorGraphics.moveTo(contentLeft, useRowY - rowStep / 2);
    separatorGraphics.lineTo(contentRight, useRowY - rowStep / 2);
    separatorGraphics.stroke();
    // 信息两列(堆叠+出售价 / 过期):
    const rowCells: Array<Array<[string, string]>> = [
      [['堆叠', formatCompact(safeNumber(item.maxStack))], ['出售价', safeNumber(item.sellGold) > 0 ? `${formatMoney(item.sellGold)} 金币` : '不可出售']],
      [['过期', item.expireTime ? safeText(String(item.expireTime)) : '永久'], ['', '']],
    ];
    const rowsTopY = useRowY - rowStep;
    rowCells.forEach((cells, rowIndex) => {
      cells.forEach(([cellTitle, cellValue], colIndex) => {
        if (!cellTitle) {
          return;
        }
        const cellX = colIndex === 0 ? contentLeft : contentLeft + contentWidth * 0.54;
        const cellY = rowsTopY - rowIndex * rowStep;
        const titleLabel = this.host.addChildLabel(detail, `LobbyBagDetailRowTitle_${rowIndex}_${colIndex}`, cellTitle, cellX, cellY, 19 * scale, rgba(236, 221, 190), new Size(contentWidth * 0.18, 22 * scale), HorizontalTextAlignment.LEFT);
        titleLabel.overflow = Label.Overflow.SHRINK;
        const valueLabel = this.host.addChildLabel(detail, `LobbyBagDetailRowValue_${rowIndex}_${colIndex}`, cellValue, cellX + contentWidth * 0.16, cellY, 19 * scale, rgba(220, 208, 185), new Size(contentWidth * (colIndex === 0 ? 0.36 : 0.3), 18 * scale), HorizontalTextAlignment.LEFT);
        valueLabel.overflow = Label.Overflow.SHRINK;
      });
      // 每段信息行之间加淡金分隔线。
      separatorGraphics.moveTo(contentLeft, rowsTopY - rowIndex * rowStep - rowStep / 2);
      separatorGraphics.lineTo(contentRight, rowsTopY - rowIndex * rowStep - rowStep / 2);
      separatorGraphics.stroke();
    });

    // 获取途径:标题 + 最多 3 条途径行,长文案自动按字数拆条,字号与上方属性行一致。
    const sourceTitleY = rowsTopY - rowCells.length * rowStep - height * 0.024;
    const sourceTitle = this.host.addChildLabel(detail, 'LobbyBagSourceRowLabel', '获取途径', contentLeft, sourceTitleY, 19 * scale, rgba(236, 221, 190), new Size(contentWidth * 0.6, 22 * scale), HorizontalTextAlignment.LEFT);
    sourceTitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(sourceTitle, scale, false);
    const segments = this.resolveSourceSegments(item, state);
    // 参考图样式:不用素材底图,直接绘制深底 + 淡金描边行条,右侧画折角箭头(>)。
    // 行数按剩余纵向空间自适应(1-3 条):先给 2×2 按钮 + 出售横幅留足预算,途径再多也不会把按钮压到重叠。
    const sourceRowWidth = contentWidth;
    const sourceRowHeight = Math.min(44 * scale, height * 0.05);
    const sourceRowGap = 10 * scale;
    const budgetButtonHeight = Math.min(66 * scale, height * 0.085);
    const budgetSellHeight = Math.min(58 * scale, height * 0.072);
    const sellFloorCenterY = -height / 2 + height * 0.13;
    const minPlatesBottom = sellFloorCenterY + budgetSellHeight / 2 + 18 * scale + budgetButtonHeight * 2 + 6 * scale;
    const rowsTopEdge = sourceTitleY - height * 0.03;
    const maxSourceRows = Math.max(1, Math.min(3, Math.floor((rowsTopEdge - minPlatesBottom + sourceRowGap) / (sourceRowHeight + sourceRowGap))));
    const visibleSegments = segments.slice(0, maxSourceRows);
    if (segments.length > maxSourceRows) {
      visibleSegments[maxSourceRows - 1] = `${visibleSegments[maxSourceRows - 1]}…`;
    }
    let platesBottom = sourceTitleY - height * 0.03;
    visibleSegments.forEach((segment, index) => {
      const rowY = sourceTitleY - height * 0.03 - sourceRowHeight / 2 - index * (sourceRowHeight + sourceRowGap);
      const rowNode = this.host.addChildPlainNode(detail, `LobbyBagSourceRowPlate_${index}`, 0, rowY, sourceRowWidth, sourceRowHeight);
      const rowGraphics = rowNode.addComponent(Graphics);
      rowGraphics.fillColor = rgba(26, 21, 17, 224);
      rowGraphics.rect(-sourceRowWidth / 2, -sourceRowHeight / 2, sourceRowWidth, sourceRowHeight);
      rowGraphics.fill();
      // 全不透明细描边:预览缩采样下 1px 半透明线会被抗锯齿吃掉。
      rowGraphics.strokeColor = rgba(186, 160, 114, 255);
      rowGraphics.lineWidth = Math.max(1.5, 1.5 * scale);
      rowGraphics.rect(-sourceRowWidth / 2, -sourceRowHeight / 2, sourceRowWidth, sourceRowHeight);
      rowGraphics.stroke();
      // 右侧折角箭头(>):与描边同色系稍亮,行内垂直居中。
      const chevronX = sourceRowWidth / 2 - 24 * scale;
      const chevronHalf = Math.min(7 * scale, sourceRowHeight * 0.24);
      rowGraphics.strokeColor = rgba(216, 190, 138, 214);
      rowGraphics.lineWidth = Math.max(1, 1.6 * scale);
      rowGraphics.moveTo(chevronX - chevronHalf * 0.62, -chevronHalf);
      rowGraphics.lineTo(chevronX + chevronHalf * 0.62, 0);
      rowGraphics.lineTo(chevronX - chevronHalf * 0.62, chevronHalf);
      rowGraphics.stroke();
      const segLabel = this.host.addChildLabel(rowNode, `LobbyBagSourceDesc_${index}`, segment, -sourceRowWidth / 2 + 18 * scale, 0, 19 * scale, rgba(231, 221, 199), new Size(sourceRowWidth - 72 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
      segLabel.overflow = Label.Overflow.SHRINK;
      platesBottom = rowY - sourceRowHeight / 2;
    });

    // 操作按钮 2×2:使用/合成 + 来源/出售(2026-09-25 出售开放;不可出售的道具按钮灰显"不可出售")。
    const buttonWidth = contentWidth * 0.485;
    const buttonHeight = budgetButtonHeight;
    const buttonLeftX = -contentWidth * 0.253;
    const buttonRightX = contentWidth * 0.253;
    const buttonRow1Y = platesBottom - 5 * scale - buttonHeight / 2;
    const buttonRow2Y = buttonRow1Y - buttonHeight - 0.3 * scale;
    this.renderDetailActions(detail, item, state, scale, buttonWidth, buttonHeight, [
      [buttonLeftX, buttonRow1Y],
      [buttonRightX, buttonRow1Y],
      [buttonLeftX, buttonRow2Y],
      [buttonRightX, buttonRow2Y],
    ]);
  }

  // 详情操作钮(使用/合成/来源/出售,按 slots 顺序摆放)+ 挂在其上的出售/合成确认弹窗;电脑 2×2、手机一排 4 个共用。
  private renderDetailActions(detail: Node, item: BagItemEntryVO, state: LobbyBagPanelState, scale: number, buttonWidth: number, buttonHeight: number, slots: Array<[number, number]>, plate = false): void {
    // 使用(2026-07-24 开放):金币/钻石/体力/固定礼包/随机箱可直接用;经验书走英雄页,虚拟条目(装备/碎片)不可用。
    const usableEffects = ['ADD_GOLD', 'ADD_DIAMOND', 'ADD_STAMINA', 'RANDOM_REWARD', 'FIXED_REWARD'];
    const isVirtualEntry = (item.itemCode || '').includes(':');
    const canUse = !isVirtualEntry && usableEffects.includes((item.useEffectType || '').toUpperCase()) && safeNumber(item.itemCount) > 0;
    const useButton = this.addDetailActionButton(detail, 'LobbyBagUseButton', '使用', plate ? REF_DETAIL.btnIcon.use : BAG_AI_OP_ICON_USE_ASSET, slots[0][0], slots[0][1], buttonWidth, buttonHeight, scale, canUse, false, plate);
    if (canUse) {
      useButton.on(Button.EventType.CLICK, () => this.host.useLobbyBagItem(item.itemCode), this);
    }
    // 合成(固定规则镜像,与服务器 COMPOSE_RULES 对齐)
    const composeNeed = BAG_COMPOSE_RULES[(item.itemCode || '').toUpperCase()];
    const canCompose = composeNeed != null && safeNumber(item.itemCount) >= composeNeed;
    const composeButton = this.addDetailActionButton(detail, 'LobbyBagComposeButton', '合成', plate ? REF_DETAIL.btnIcon.fuse : BAG_AI_OP_ICON_FORGE_ASSET, slots[1][0], slots[1][1], buttonWidth, buttonHeight, scale, canCompose, false, plate);
    if (canCompose) {
      composeButton.on(Button.EventType.CLICK, () => this.host.openLobbyBagComposeDialog(item.itemCode), this);
    }
    // 「来源」按钮(2026-10-20 用户:界面已展示获取途径,不需要):手机详情去掉,只留 使用 / 合成 / 出售;读取失败改为点途径行重试
    if (!plate) {
      const sourceButton = this.addDetailActionButton(detail, 'LobbyBagSourceButton', state.sourceLoading ? '读取中' : '来源', BAG_AI_OP_ICON_SOURCE_ASSET, slots[2][0], slots[2][1], buttonWidth, buttonHeight, scale, !state.sourceLoading);
      sourceButton.on(Button.EventType.CLICK, () => this.host.reloadLobbyBagItemSource(item.itemCode), this);
    }
    const sellSlot = plate ? slots[2] : slots[3];
    const sellable = !isVirtualEntry && safeNumber(item.sellGold) > 0 && safeNumber(item.itemCount) > 0;
    const sellButton = this.addDetailActionButton(detail, 'LobbyBagSellButton', sellable ? '出售' : '不可出售', plate ? REF_DETAIL.btnIcon.sell : BAG_AI_OP_ICON_GOLD_ASSET, sellSlot[0], sellSlot[1], buttonWidth, buttonHeight, scale, sellable, true, plate);
    if (sellable) {
      sellButton.on(Button.EventType.CLICK, () => this.host.openLobbyBagSellDialog(item.itemCode), this);
    }
    const sellState = this.host.currentLobbyBagSellState();
    if (sellState.itemCode === item.itemCode) {
      this.renderSellDialog(detail.parent ?? detail, item, sellState, scale);
    }
    const composeState = this.host.currentLobbyBagComposeState();
    if (composeState.itemCode === item.itemCode) {
      this.renderComposeDialog(detail.parent ?? detail, item, composeState.times, scale);
    }
    const useState = this.host.currentLobbyBagUseState();
    if (useState.itemCode === item.itemCode && plate) {
      this.renderPhoneUseDialog(detail.parent ?? detail, item, useState, scale);
    }
  }

  // 手机全屏详情(2026-10-19 按原型 1:1 第二轮):原型整屏 1870×841(= 20:9)按屏等比,u = 屏高 / 841(宽取整屏可见宽,刘海机面板宽已扣安全区);
  // 框(双金线外沿)x 285..1587 / y 64..784;通栏标题带暗红 y 66..120 贴框顶线内侧;左列 物品卡(开口 405..670 × 180..435)+ 名 + 稀有度签 + 四行信息(330..745 × 537..755);
  // 右列 用途面板(772..1553 × 161..350)+ 获取途径面板(376..630,行心 485 / 580)+ 四钮(心 867 / 1065 / 1260 / 1460,y 717)。
  private renderDetailPopupPhone(parent: Node, item: BagItemEntryVO, rect: PhoneDialogRect, panelWidth: number, panelHeight: number, scale: number, state: LobbyBagPanelState): void {
    void rect;
    this.phoneDetailPanelSize = { w: panelWidth, h: panelHeight };
    const FL = 285;
    const FRt = 1587;
    const FT = 64;
    const FB = 784;
    const screenW = Math.max(panelWidth, view.getVisibleSize().width);
    const u = Math.min(panelHeight / 841, screenW / 1870, (panelWidth * 0.98) / (FRt - FL));
    const width = (FRt - FL) * u;
    const height = (FB - FT) * u;
    const fcx = (FL + FRt) / 2;
    const fcy = (FT + FB) / 2;
    const X = (px: number): number => (px - fcx) * u;
    const Y = (py: number): number => (fcy - py) * u;
    const S = (v: number): number => v * u;
    const tight = (label: Label): Label => {
      label.lineHeight = label.fontSize;
      return label;
    };
    // 遮罩(原型:只有弹窗亮,背包整体压暗):铺满整屏(含刘海安全区外两侧);不透明度 85 = 实测弹窗外亮度 33 → 15,与原型 16 一致
    const dimW = Math.max(panelWidth, screenW) * 1.6;
    const dimH = panelHeight * 1.6;
    const dim = this.host.addChildPlainNode(parent, 'LobbyBagDetailPopupDim', 0, 0, dimW, dimH);
    if (!mountRefSolid(this.host, dim, 'Fill', 0, 0, dimW, dimH, rgba(0, 0, 0, 85))) {
      const dimGraphics = dim.addComponent(Graphics);
      dimGraphics.fillColor = rgba(0, 0, 0, 85);
      dimGraphics.rect(-dimW / 2, -dimH / 2, dimW, dimH);
      dimGraphics.fill();
    }
    dim.addComponent(BlockInputEvents);

    const detail = this.host.addChildPlainNode(parent, 'LobbyBagItemDetail', (fcx - 935) * u, (420.5 - fcy) * u, width, height);
    detail.addComponent(BlockInputEvents);
    // 底:实景底图(原型能透出教堂场景)+ 轻暗罩;再盖细双线金框
    const back = detail.addComponent(Graphics);
    back.fillColor = rgba(10, 8, 9, 236);
    back.rect(-width / 2, -height / 2, width, height);
    back.fill();
    mountRefDialogBackdrop(this.host, detail, REF_DETAIL_INNER_BG, 0, 0, width, height, 44);
    mountRefLineFrame(this.host, detail, 'LobbyBagDetailFrame', width, height);
    const closePopup = (): void => {
      this.detailPopupOpen = false;
      if (detail.isValid) {
        detail.destroy();
      }
      if (dim.isValid) {
        dim.destroy();
      }
      this.host.clearLobbyBagSelection();
    };
    // 通栏标题带:素材本体 y 84..192 ↔ 原型 66..120,整张等比挂(宽 = 框宽);标题 (959, 93) 字高 ~36;四芒星 (832, 92);关闭 (1551, 93) 径 72
    const HB = REF_DETAIL.headerBand;
    const hk = S(120 - 66) / (HB.bodyY1 - HB.bodyY0);
    const bandY = Y(66) - (HB.h / 2 - HB.bodyY0) * hk;
    if (!this.host.addSprite('LobbyBagDetailBand', HB.path, 0, bandY, HB.w * hk, HB.h * hk, detail)) {
      mountRefTitleBand(this.host, detail, 'LobbyBagDetailBand', 0, Y(93), width - S(14), S(54), scale);
    }
    this.host.addSprite('LobbyBagDetailEmblem', 'ui/common/ref/ult_title_star/spriteFrame', X(832), Y(92), S(74), S(74), detail);
    const title = tight(this.host.addChildLabel(detail, 'LobbyBagDetailTitle', '物品详情'.split('').join(String.fromCharCode(0x2009)), X(959), Y(93), S(40), rgba(255, 228, 156), new Size(S(260), S(52))));
    title.isBold = true;
    this.applyOutline(title, scale, true);
    const closeSize = S(72);
    const closeButton = this.host.addChildPlainNode(detail, 'LobbyBagDetailCloseButton', X(1551), Y(93), closeSize + S(10), closeSize + S(10));
    // 2026-10-27 UI 审核:小叉点击区放大到 1.7 倍(图标大小不变),手机上好点
    closeButton.getComponent(UITransform)?.setContentSize((closeSize) * 1.7, (closeSize) * 1.7);
    if (!this.host.addSprite('LobbyBagDetailCloseArt', REF_CLOSE_RING_ASSET, 0, 0, closeSize, closeSize, closeButton)) {
      this.host.addSprite('LobbyBagDetailCloseArt', REF_CLOSE_ASSET, 0, 0, closeSize, closeSize, closeButton);
    }
    closeButton.addComponent(Button);
    this.host.applyImageButtonFeedback(closeButton, 1.08, 0.92);
    closeButton.on(Button.EventType.CLICK, closePopup, this);

    // ── 左列物品卡:原型内开口 405..670 × 180..435;卡框素材开口 x 57..454 → 整图按开口宽定比例 ──
    const rarity = this.rarityColor(item.rarity);
    const CF = REF_DETAIL.cardFrame;
    const ck = S(670 - 405) / (CF.open.x1 - CF.open.x0);
    const openCx = X((405 + 670) / 2);
    const openCy = Y((180 + 435) / 2);
    const openW = S(670 - 405);
    const openH = S(435 - 180);
    // 开口底:暗底 → 稀有度色符文法阵底图(原型石头脚下的发光法阵)→ 轻暗罩(底图偏亮,压一压免得抢物品图)
    const popupIcon = bagItemIconAsset(item);
    // 2026-10-22 用户「背包详情两个框,移除外部的」:有图标时只留图标自带的暗底 + 稀有度描边,不画法阵底 / 金卡框 / 左上稀有度字母
    if (!popupIcon) {
      const glow = this.host.addChildPlainNode(detail, 'LobbyBagDetailGlow', openCx, openCy, openW, openH).addComponent(Graphics);
      glow.fillColor = rgba(6, 6, 10, 230);
      glow.rect(-openW / 2, -openH / 2, openW, openH);
      glow.fill();
      const bgSide = Math.max(openW, openH);
      if (this.host.addSprite('LobbyBagDetailCardBg', REF_DETAIL.cardBgPath(item.rarity), openCx, openCy, bgSide, bgSide, detail)) {
        const veil = this.host.addChildPlainNode(detail, 'LobbyBagDetailCardVeil', openCx, openCy, bgSide, bgSide).addComponent(Graphics);
        veil.fillColor = rgba(4, 4, 8, 70);
        veil.rect(-bgSide / 2, -bgSide / 2, bgSide, bgSide);
        veil.fill();
      }
    }
    const iconSize = popupIcon ? Math.min(openW, openH) * 1.04 : Math.min(openW, openH) * 0.92;
    if (popupIcon) {
      if (bagEquipCode(item)) {
        mountEquipIconBacking(this.host, detail, 'LobbyBagDetailIconBacking', iconSize, bagEquipCode(item), { x: openCx, y: openCy });
      } else {
        mountItemRarityBacking(this.host, detail, 'LobbyBagDetailIconBacking', iconSize, item.rarity, { x: openCx, y: openCy });
      }
      this.host.addSprite('LobbyBagDetailIcon', popupIcon, openCx, openCy, iconSize, iconSize, detail);
    } else {
      this.host.addSprite('LobbyBagDetailTypeIcon', bagItemTypeIconAsset(item.itemType), openCx, openCy, iconSize * 0.7, iconSize * 0.7, detail);
    }
    if (!popupIcon) {
      const frameCy = openCy + ((CF.open.y0 + CF.open.y1) / 2 - CF.h / 2) * ck;
      if (!this.host.addSprite('LobbyBagDetailSlotArt', REF_DETAIL.cardFramePath(item.rarity), openCx, frameCy, CF.w * ck, CF.h * ck, detail)) {
        this.host.addSprite('LobbyBagDetailSlotArt', REF_DETAIL_SLOT_FRAME_ASSET, openCx, openCy, S(313), S(313), detail);
      }
      // 左上角稀有度字母 (437, 205);有图标时稀有度看描边色 + 名下「SSR · 材料」签
      const rarityTag = tight(this.host.addChildLabel(detail, 'LobbyBagDetailRarityLetter', safeText(item.rarity || 'N'), X(420), Y(207), S(40), rarity, new Size(S(130), S(48)), HorizontalTextAlignment.LEFT));
      rarityTag.enableWrapText = false;
      rarityTag.overflow = Label.Overflow.SHRINK;
      rarityTag.isBold = true;
      rarityTag.isItalic = true;
      this.applyOutline(rarityTag, scale, true);
    }
    // 名 (537, 475) 垫名牌(原型:暗带 + 上下细金线 + 两端金箭羽,x 322..752);稀有度签 (537, 519):暗条 + 两侧细金线,字为稀有度色
    this.host.addSprite('LobbyBagDetailNamePlate', REF_DETAIL.namePlate.path, X(537), Y(475), S(430), S(58), detail);
    const nameLabel = tight(this.host.addChildLabel(detail, 'LobbyBagDetailName', safeText(item.itemName), X(537), Y(475), S(42), rgba(255, 232, 170), new Size(S(400), S(52))));
    nameLabel.overflow = Label.Overflow.SHRINK;
    nameLabel.isBold = true;
    this.applyOutline(nameLabel, scale, true);
    const chipText = `${safeText(item.rarity || 'N')} · ${itemTypeLabel(item.itemType)}`;
    const chipW = S(250);
    const chipH = S(32);
    const chip = this.host.addChildPlainNode(detail, 'LobbyBagDetailSubtitleChip', X(537), Y(521), chipW, chipH);
    const lineH = Math.max(1, S(1.6));
    mountRefSolid(this.host, chip, 'Fill', 0, 0, chipW, chipH, rgba(4, 6, 12, 170));
    mountRefSolid(this.host, chip, 'LineL', -chipW / 2 - S(39), 0, S(62), lineH, rgba(214, 170, 92, 160));
    mountRefSolid(this.host, chip, 'LineR', chipW / 2 + S(39), 0, S(62), lineH, rgba(214, 170, 92, 160));
    tight(this.host.addChildLabel(chip, 'LobbyBagDetailSubtitle', chipText, 0, 0, S(24), rarity, new Size(chipW - S(10), chipH)));
    // 信息块:金框 312..752 × 538..772(按宽挂,金线缩进约 9);四行心 y 586 / 632 / 678 / 724(行距 46,上下各留 ~25);图标 (356) 径 32;名 (392);值右对齐 (724)
    const infoW = S(752 - 312);
    const infoH = S(772 - 538);
    const infoCx = X((312 + 752) / 2);
    const infoCy = Y((538 + 772) / 2);
    const infoBox = this.host.addChildPlainNode(detail, 'LobbyBagDetailInfoBox', infoCx, infoCy, infoW, infoH);
    mountRefSolid(this.host, infoBox, 'Fill', 0, 0, infoW - S(12), infoH - S(12), rgba(8, 6, 8, 200));
    mountRefSlicedByWidth(this.host, infoBox, 'Frame', REF_ULT.statBox, 0, 0, infoW, infoH);
    // 2026-10-25 策划审核 P2-6:"堆叠 999.9K"对玩家没意义,去掉;过期只在有期限时显示(永久不写)。行在框内居中
    const infoRows: Array<[string, string, string, boolean]> = [
      ['拥有数量', formatCompact(safeNumber(item.itemCount)), 'ui/common/ref/ic_owned/spriteFrame', true],
      ['出售价', safeNumber(item.sellGold) > 0 ? `${formatMoney(item.sellGold)} 金币` : '不可出售', 'ui/common/ref/ic_price/spriteFrame', false],
    ];
    if (item.expireTime) {
      infoRows.push(['过期', safeText(String(item.expireTime)), 'ui/common/ref/ic_expire/spriteFrame', false]);
    }
    const infoStep = 56;
    const infoTop = (538 + 772) / 2 - (infoRows.length - 1) * infoStep / 2;
    infoRows.forEach(([rowTitle, rowValue, icon, strong], index) => {
      const cy = Y(infoTop + index * infoStep) - infoCy;
      if (index > 0) {
        mountRefSolid(this.host, infoBox, `Sep_${index}`, 0, cy + S(infoStep / 2), infoW - S(60), Math.max(1, S(1.4)), rgba(214, 170, 92, 95));
      }
      this.host.addSprite(`Ic_${index}`, icon, X(356) - infoCx, cy, S(32), S(32), infoBox);
      tight(this.host.addChildLabel(infoBox, `Title_${index}`, rowTitle, X(392) - infoCx, cy, S(24), rgba(240, 226, 200), new Size(S(180), S(30)), HorizontalTextAlignment.LEFT));
      const valueLabel = tight(this.host.addChildLabel(infoBox, `Value_${index}`, rowValue, X(724) - infoCx, cy, S(strong ? 32 : 24), strong ? rgba(255, 222, 130) : rgba(244, 234, 212), new Size(S(220), S(40)), HorizontalTextAlignment.RIGHT));
      valueLabel.overflow = Label.Overflow.SHRINK;
      valueLabel.isBold = strong;
      this.applyOutline(valueLabel, scale, strong);
    });

    // ── 右列两块面板:沿用终极技能消耗面板(暗红头带 + 星徽 + 金框);头带高按原型 49 定比例(k ≤ 0.505),中段横向拉 ──
    const rightW = S(1553 - 772);
    const rightCx = X((772 + 1553) / 2);
    const panelK = (55 / 97) * u;
    const mountSection = (name: string, y0: number, y1: number, text: string): void => {
      const cy = Y((y0 + y1) / 2);
      // 2026-10-22 A 方案:内层分区不再用自带红头带的整图面板,改细金框 + 暗带渐隐金线标题(外层「物品详情」红带不动)
      void panelK;
      mountRefTitledPanel(this.host, detail, name, rightCx, cy, rightW, S(y1 - y0), scale, text, { bandH: S(58), fontSize: S(30), fill: rgba(8, 6, 8, 190) });
    };
    mountSection('LobbyBagDetailUsePanel', 154, 352, '用途');
    // 用途正文区透出场景(原型:正文背后是暗化的教堂画面);2026-10-21 用户「描述背景暗一些,字更清楚」→ 暗罩 36 → 150
    mountRefDialogBackdrop(this.host, detail, REF_DETAIL_INNER_BG, rightCx, Y((216 + 343) / 2), rightW - S(22), S(343 - 216), 150, true);
    const useText = this.host.addChildLabel(detail, 'LobbyBagDetailUseValue', safeText(item.useDesc || item.useEffectType || '仅展示'), X(812), Y(282), S(28), rgba(250, 242, 222), new Size(S(700), S(110)), HorizontalTextAlignment.LEFT);
    useText.enableWrapText = true;
    useText.lineHeight = S(36);
    useText.overflow = Label.Overflow.SHRINK;
    this.applyOutline(useText, scale, false);
    mountSection('LobbyBagDetailSourcePanel', 371, 640, '获取途径');
    // 来源行:800..1528 × 高 80;行心 y 485 / 580;圆徽 (850) 径 80;文字 (918);箭头 (1488) 径 58
    const segments = this.resolveSourceSegments(item, state, 34);
    const visibleSegments = segments.slice(0, 2);
    if (segments.length > 2) {
      visibleSegments[1] = `${visibleSegments[1]}…`;
    }
    const srcRowW = S(1528 - 800);
    const srcRowH = S(86);
    const rowCx = X((800 + 1528) / 2);
    visibleSegments.forEach((segment, index) => {
      const cy = Y(484 + index * 98);
      const rowNode = this.host.addChildPlainNode(detail, `LobbyBagSourceRowPlate_${index}`, rowCx, cy, srcRowW, srcRowH);
      if (!mountRefSlicedByWidth(this.host, rowNode, 'Bg', REF_ULT.costRow, 0, 0, srcRowW, srcRowH)) {
        mountRefSliced(this.host, rowNode, 'Bg', REF_ROW, 0, 0, srcRowW, srcRowH);
      }
      const medal = S(80);
      const medalX = X(850) - rowCx;
      if (!this.host.addSprite('Medal', REF_DETAIL.sourceIcon(refDetailSourceKind(segment)), medalX, 0, medal, medal, rowNode)) {
        this.host.addSprite('Ring', REF_ICON_RING_ASSET, medalX, 0, medal * 0.9, medal * 0.9, rowNode);
      }
      const segLabel = tight(this.host.addChildLabel(rowNode, `LobbyBagSourceDesc_${index}`, segment, X(918) - rowCx, 0, S(26), rgba(246, 236, 214), new Size(S(520), S(34)), HorizontalTextAlignment.LEFT));
      segLabel.overflow = Label.Overflow.SHRINK;
      if (state.sourceItemCode === item.itemCode && state.sourceError) {
        rowNode.addComponent(Button);
        rowNode.on(Button.EventType.CLICK, () => this.host.reloadLobbyBagItemSource(item.itemCode), this);
      }
      const arrowX = X(1488) - rowCx;
      if (!this.host.addSprite('Arrow', REF_DETAIL.arrow, arrowX, 0, S(58), S(58), rowNode)) {
        this.host.addSprite('ArrowRing', REF_ICON_RING_ASSET, arrowX, 0, S(52), S(52), rowNode);
      }
    });
    // 三钮(去掉「来源」后):右列 772..1553 三等分,心 x 902 / 1162 / 1423,y 717;照原型干净底板 196 × 72(暗金 / 红 / 灰)+ 原型图标
    this.renderDetailActions(detail, item, state, scale, S(196), S(72), [902, 1162, 1423].map((px) => [X(px), Y(717)] as [number, number]), true);
  }

  /**
   * 2026-10-29 B 风格物品详情(原型 bag_detail_b 1:1,原型坐标 1870×841):整屏压暗 + 居中玻璃面板(361..1510 × 90..752);
   * 左列 物品框 + 名 + 稀有度签 + 数量 / 售价小面板,右列 用途 / 获取途径 + 三钮(使用 / 合成 = 次钮,出售 = 主钮)。
   */
  private renderGlassDetail(parent: Node, item: BagItemEntryVO, panelWidth: number, panelHeight: number, state: LobbyBagPanelState): void {
    const { FX, FY, S, k } = glassProtoMap(panelWidth, panelHeight);
    const T = (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align: HorizontalTextAlignment = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const l = glassLabel(this.host, p, name, text, x, y, S(size), color, w, align, bold);
      l.fontSize = Math.max(12, Math.round(S(size)));
      l.lineHeight = l.fontSize + 4;
      return l;
    };
    // 遮罩:原型弹窗外亮度约原来的 55%
    const screenW = Math.max(panelWidth, view.getVisibleSize().width);
    const dimW = screenW * 1.6;
    const dimH = panelHeight * 1.6;
    const dim = this.host.addChildPlainNode(parent, 'LobbyBagDetailPopupDim', 0, 0, dimW, dimH);
    mountRefSolid(this.host, dim, 'Fill', 0, 0, dimW, dimH, rgba(0, 0, 0, 115));
    dim.addComponent(BlockInputEvents);
    const cx = (FX(361) + FX(1510)) / 2;
    const cy = (FY(90) + FY(752)) / 2;
    const detail = mountGlassPanel(this.host, parent, 'LobbyBagItemDetail', cx, cy, FX(1510) - FX(361), FY(90) - FY(752), k);
    // 弹窗底再垫一层同款玻璃(叠起来约 96% 不透明):原型里弹窗后面的道具格看不见,单层会隐约透出来
    const base = mountGlassSlice(this.host, detail, 'GlassBase', GLASS_SLICES.panel, 0, 0, FX(1510) - FX(361), FY(90) - FY(752), k);
    base?.node.setSiblingIndex(0);
    detail.addComponent(BlockInputEvents);
    const X = (px: number): number => FX(px) - cx;
    const Y = (py: number): number => FY(py) - cy;
    const closePopup = (): void => {
      this.detailPopupOpen = false;
      if (detail.isValid) {
        detail.destroy();
      }
      if (dim.isValid) {
        dim.destroy();
      }
      this.host.clearLobbyBagSelection();
    };
    // 标题行 + 圆圈关闭钮 + 通栏细线
    mountGlassSectionHeader(this.host, detail, 'LobbyBagDetailTitle', '物品详情', X(409), Y(135), k, 30);
    const close = this.host.addChildPlainNode(detail, 'LobbyBagDetailCloseButton', X(1464), Y(134), S(96), S(96));
    const ring = this.host.addChildPlainNode(close, 'Ring', 0, 0, S(58), S(58)).addComponent(Graphics);
    ring.fillColor = rgba(24, 30, 38, 200);
    ring.circle(0, 0, S(28));
    ring.fill();
    ring.strokeColor = rgba(150, 160, 176, 220);
    ring.lineWidth = Math.max(1.2, S(1.6));
    ring.circle(0, 0, S(28));
    ring.stroke();
    this.host.addSprite('X', GLASS_ICON.close, 0, 0, S(30), S(30), close);
    close.addComponent(Button);
    this.host.applyImageButtonFeedback(close, 1.08, 0.92);
    close.on(Button.EventType.CLICK, closePopup, this);
    mountGlassLine(this.host, detail, 'LobbyBagDetailHeadLine', (X(405) + X(1466)) / 2, Y(175), X(1466) - X(405), Math.max(1, S(1.5)), rgba(52, 60, 72, 255));

    // ── 左列:物品框 473..729 × 211..460;名 (600, 491);稀有度签 (600, 532);数量 / 售价面板 405..795 × 567..708 ──
    const frameCx = X(601);
    const frameCy = Y(335.5);
    const frame = mountGlassFrame(this.host, detail, 'LobbyBagDetailIconFrame', frameCx, frameCy, S(256), S(249), k);
    const icon = bagItemIconAsset(item);
    if (icon && bagEquipCode(item)) {
      mountGlassClippedIcon(this.host, frame, 'LobbyBagDetailIcon', icon, 0, 0, S(196));
    } else if (!icon || !this.host.addSprite('LobbyBagDetailIcon', icon, 0, 0, S(212), S(212), frame)) {
      this.host.addSprite('LobbyBagDetailTypeIcon', bagItemTypeIconAsset(item.itemType), 0, 0, S(150), S(150), frame);
    }
    T(detail, 'LobbyBagDetailName', safeText(item.itemName), X(600), Y(491), 31, GLASS_COLOR.text, S(380), HorizontalTextAlignment.CENTER, true);
    const rarityKey = (item.rarity || '').toUpperCase();
    const tint = rarityKey === 'UR' || rarityKey === 'SSR' ? rgba(240, 170, 70) : rarityKey === 'SR' || rarityKey === 'EPIC' ? rgba(190, 120, 250) : rarityKey === 'R' || rarityKey === 'RARE' ? rgba(110, 160, 245) : rgba(182, 189, 205);
    const tagText = `${safeText(item.rarity || 'N')} · ${itemTypeLabel(item.itemType)}`;
    const tagFont = S(20);
    const tagW = glassTagPillWidthOf(tagText, tagFont, S(34), estimateTextWidth);
    mountGlassTagPill(this.host, detail, 'LobbyBagDetailSubtitleChip', tagText, X(600) - tagW / 2, Y(532), S(34), k, tagFont, estimateTextWidth, tint);
    // 稀有度签底色带一点稀有度色(原型「SR · 材料」紫底紫边)
    const tagBg = detail.getChildByName('LobbyBagDetailSubtitleChip')?.getChildByName('Bg')?.getComponent(Sprite);
    if (tagBg) {
      tagBg.color = rgba(Math.min(255, 150 + tint.r / 3), Math.min(255, 150 + tint.g / 3), Math.min(255, 150 + tint.b / 3));
    }
    const infoCx = X(600);
    const infoCy = Y(637.5);
    const infoBox = mountGlassPanel(this.host, detail, 'LobbyBagDetailInfoBox', infoCx, infoCy, S(390), S(141), k);
    const infoRows: Array<[string, string, string, boolean]> = [
      ['拥有数量', formatCompact(safeNumber(item.itemCount)), 'ui/common/ref/ic_owned/spriteFrame', true],
      ['出售价', safeNumber(item.sellGold) > 0 ? `${formatMoney(item.sellGold)} 金币` : '不可出售', 'ui/common/ref/ic_price/spriteFrame', false],
    ];
    if (item.expireTime) {
      infoRows.push(['过期', safeText(String(item.expireTime)), 'ui/common/ref/ic_expire/spriteFrame', false]);
    }
    const rowStep = infoRows.length > 2 ? 42 : 58;
    const firstRow = 637.5 - (infoRows.length - 1) * rowStep / 2;
    infoRows.forEach(([title, value, rowIcon, strong], index) => {
      const ry = Y(firstRow + index * rowStep) - infoCy;
      if (index > 0) {
        mountGlassLine(this.host, infoBox, `Sep_${index}`, (X(430) + X(773)) / 2 - infoCx, ry + S(rowStep / 2), X(773) - X(430), Math.max(1, S(1.4)), rgba(58, 66, 78, 255));
      }
      this.host.addSprite(`Ic_${index}`, rowIcon, X(445) - infoCx, ry, S(32), S(32), infoBox);
      T(infoBox, `Title_${index}`, title, X(486) - infoCx, ry, 22, GLASS_COLOR.text, S(160));
      T(infoBox, `Value_${index}`, value, X(773) - infoCx, ry, strong ? 29 : 22, strong ? GLASS_COLOR.champagne : GLASS_COLOR.text, S(200), HorizontalTextAlignment.RIGHT, strong);
    });
    mountGlassLine(this.host, detail, 'LobbyBagDetailColLine', X(820), (Y(200) + Y(718)) / 2, Math.max(1, S(1.5)), Y(200) - Y(718), rgba(46, 54, 66, 255));

    // ── 右列:用途(标题 y 219;正文框 858..1466 × 255..340)/ 分隔线 y 364 / 获取途径(标题 y 404;行 858..1466,行心 482 / 582,高 84)──
    const rightCx = (X(858) + X(1466)) / 2;
    const rightW = X(1466) - X(858);
    mountGlassSectionHeader(this.host, detail, 'LobbyBagDetailUse', '用途', X(860), Y(219), k, 26);
    const useBox = mountGlassPanel(this.host, detail, 'LobbyBagDetailUseBox', rightCx, Y(297.5), rightW, S(85), k);
    const useText = T(useBox, 'LobbyBagDetailUseValue', safeText(item.useDesc || item.useEffectType || '仅展示'), X(884) - rightCx, 0, 22, rgba(226, 230, 238), rightW - S(50));
    useText.enableWrapText = true;
    useText.getComponent(UITransform)?.setContentSize(rightW - S(50), S(76));
    mountGlassLine(this.host, detail, 'LobbyBagDetailMidLine', rightCx, Y(364), rightW, Math.max(1, S(1.5)), rgba(46, 54, 66, 255));
    mountGlassSectionHeader(this.host, detail, 'LobbyBagDetailSource', '获取途径', X(860), Y(404), k, 26);
    const segments = this.resolveSourceSegments(item, state, 30);
    const visible = segments.slice(0, 2);
    if (segments.length > 2) {
      visible[1] = `${visible[1]}…`;
    }
    visible.forEach((segment, index) => {
      const ry = Y(482 + index * 100);
      const row = mountGlassPanel(this.host, detail, `LobbyBagSourceRowPlate_${index}`, rightCx, ry, rightW, S(84), k);
      this.host.addSprite('Medal', REF_DETAIL.sourceIcon(refDetailSourceKind(segment)), X(906) - rightCx, 0, S(66), S(66), row);
      T(row, `LobbyBagSourceDesc_${index}`, segment, X(962) - rightCx, 0, 22, GLASS_COLOR.text, S(430));
      const chev = this.host.addSprite('Chevron', GLASS_ICON.chevron, X(1432) - rightCx, 0, S(22), S(22), row);
      if (chev) {
        chev.color = rgba(214, 220, 230);
      }
      if (state.sourceItemCode === item.itemCode && state.sourceError) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.reloadLobbyBagItemSource(item.itemCode), this);
      }
    });

    // ── 三钮 y 690:使用 858..1052 / 合成 1070..1263(次钮)/ 出售 1278..1472(主钮)──
    const usableEffects = ['ADD_GOLD', 'ADD_DIAMOND', 'ADD_STAMINA', 'RANDOM_REWARD', 'FIXED_REWARD'];
    const isVirtualEntry = (item.itemCode || '').includes(':');
    const canUse = !isVirtualEntry && usableEffects.includes((item.useEffectType || '').toUpperCase()) && safeNumber(item.itemCount) > 0;
    const composeNeed = BAG_COMPOSE_RULES[(item.itemCode || '').toUpperCase()];
    const canCompose = composeNeed != null && safeNumber(item.itemCount) >= composeNeed;
    const sellable = !isVirtualEntry && safeNumber(item.sellGold) > 0 && safeNumber(item.itemCount) > 0;
    const btnY = Y(690);
    mountGlassButton(this.host, detail, 'LobbyBagUseButton', '使用', (X(858) + X(1052)) / 2, btnY, X(1052) - X(858), S(56), k,
      canUse ? 'secondaryLit' : 'disabled', canUse ? () => this.host.useLobbyBagItem(item.itemCode) : undefined, 23);
    mountGlassButton(this.host, detail, 'LobbyBagComposeButton', '合成', (X(1070) + X(1263)) / 2, btnY, X(1263) - X(1070), S(56), k,
      canCompose ? 'secondaryLit' : 'disabled', canCompose ? () => this.host.openLobbyBagComposeDialog(item.itemCode) : undefined, 23);
    mountGlassButton(this.host, detail, 'LobbyBagSellButton', sellable ? '出售' : '不可出售', (X(1278) + X(1472)) / 2, btnY, X(1472) - X(1278), S(56), k,
      sellable ? 'primary' : 'primaryOff', sellable ? () => this.host.openLobbyBagSellDialog(item.itemCode) : undefined, 23);

    // 二级弹窗(使用 / 出售 / 合成)沿用旧实现,待 B 原型确认后替换
    const sellState = this.host.currentLobbyBagSellState();
    if (sellState.itemCode === item.itemCode) {
      this.renderSellDialog(parent, item, sellState, this.lastScale);
    }
    const composeState = this.host.currentLobbyBagComposeState();
    if (composeState.itemCode === item.itemCode) {
      this.renderComposeDialog(parent, item, composeState.times, this.lastScale);
    }
    const useState = this.host.currentLobbyBagUseState();
    if (useState.itemCode === item.itemCode) {
      this.renderPhoneUseDialog(parent, item, useState, this.lastScale);
    }
  }

  // 手机全屏确认弹窗壳:底板铺满舞台;withShowcase 时左侧留道具展示列。返回右侧控件区中心 X 与放大倍数 k
  // (控件沿用原设计坐标 × k,k 上限 1.4:标题 26→36、正文 18→25,按钮也同比放大好点按)。
  private addPhoneConfirmShell(overlay: Node, name: string, rect: PhoneDialogRect, designWidth: number, designHeight: number, scale: number, withShowcase = true): { node: Node; controlsX: number; k: number; showcaseX: number; showcaseWidth: number } {
    const node = this.host.addChildPlainNode(overlay, name, rect.x, rect.y, rect.width, rect.height);
    node.addComponent(BlockInputEvents);
    this.drawPhoneDialogPanel(node, rect.width, rect.height, scale);
    const pad = 36 * scale;
    const showcaseWidth = withShowcase ? rect.width * 0.34 : 0;
    const gutter = withShowcase ? 40 * scale : 0;
    const showcaseX = -rect.width / 2 + pad + showcaseWidth / 2;
    const regionLeft = -rect.width / 2 + pad + showcaseWidth + gutter;
    const regionRight = rect.width / 2 - pad;
    const k = Math.max(1, Math.min(1.4, (regionRight - regionLeft) / (designWidth * scale), (rect.height - 40 * scale) / (designHeight * scale)));
    return { node, controlsX: (regionLeft + regionRight) / 2, k, showcaseX, showcaseWidth };
  }

  // 手机确认弹窗左列道具展示:暗底卡 + 1~2 个大图标格(两个时中间画箭头)+ 名称/副标题 + 信息行。
  private renderPhoneItemShowcase(parent: Node, x: number, width: number, dialogHeight: number, cells: Array<{ item: BagItemEntryVO; badge: string }>, name: string, subtitle: string, rows: Array<[string, string]>, scale: number): void {
    const height = dialogHeight - 72 * scale;
    const card = this.host.addChildPlainNode(parent, 'LobbyBagPhoneShowcase', x, 0, width, height);
    const graphics = card.addComponent(Graphics);
    graphics.fillColor = rgba(26, 21, 16, 210);
    graphics.roundRect(-width / 2, -height / 2, width, height, 12 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(176, 136, 72, 140);
    graphics.lineWidth = Math.max(1, 1.4 * scale);
    graphics.roundRect(-width / 2, -height / 2, width, height, 12 * scale);
    graphics.stroke();

    const arrowWidth = cells.length > 1 ? 56 * scale : 0;
    const cellSize = Math.min(cells.length > 1 ? (width - 64 * scale - arrowWidth) / 2 : width * 0.5, 190 * scale, height * 0.4);
    const rowHeight = 44 * scale;
    // 图标 + 名称 + 副标题 + 信息行整组在卡内纵向居中。
    const groupHeight = cellSize + 40 * scale + 64 * scale + rows.length * rowHeight;
    const cellY = Math.min(height / 2 - 30 * scale, groupHeight / 2) - cellSize / 2;
    cells.forEach((cell, index) => {
      const cellX = cells.length > 1 ? (index === 0 ? -1 : 1) * (arrowWidth / 2 + cellSize / 2) : 0;
      const icon = bagItemIconAsset(cell.item);
      if (icon) {
        // 单框:图标自带暗底 + 稀有度描边,不画格底 / 外层格框
        if (bagEquipCode(cell.item)) {
          mountEquipIconBacking(this.host, card, `LobbyBagShowcaseIconBacking_${index}`, cellSize, bagEquipCode(cell.item), { x: cellX, y: cellY });
        } else {
          mountItemRarityBacking(this.host, card, `LobbyBagShowcaseIconBacking_${index}`, cellSize, cell.item.rarity, { x: cellX, y: cellY });
        }
        this.host.addSprite(`LobbyBagShowcaseIcon_${index}`, icon, cellX, cellY, cellSize, cellSize, card);
      } else {
        this.host.addSprite(`LobbyBagShowcaseSlot_${index}`, BAG_AI_SLOT_BASE_ASSET, cellX, cellY, cellSize, cellSize, card);
        this.host.addSprite(`LobbyBagShowcaseTypeIcon_${index}`, bagItemTypeIconAsset(cell.item.itemType), cellX, cellY, cellSize * 0.68, cellSize * 0.68, card);
        this.addCleanSlotFrame(card, `LobbyBagShowcaseFrame_${index}`, cellX, cellY, cellSize, scale * 1.3, cell.item.rarity);
      }
      const badge = this.host.addChildLabel(card, `LobbyBagShowcaseBadge_${index}`, cell.badge, cellX + cellSize / 2 - 10 * scale, cellY - cellSize / 2 + 18 * scale, 22 * scale, rgba(255, 236, 180), new Size(cellSize - 16 * scale, 28 * scale), HorizontalTextAlignment.RIGHT);
      badge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(badge, scale, true);
    });
    if (cells.length > 1) {
      const arrow = this.host.addChildPlainNode(card, 'LobbyBagShowcaseArrow', 0, cellY, arrowWidth, 40 * scale);
      const arrowGraphics = arrow.addComponent(Graphics);
      arrowGraphics.strokeColor = rgba(236, 200, 120, 235);
      arrowGraphics.lineWidth = 4 * scale;
      arrowGraphics.moveTo(-arrowWidth * 0.32, 0);
      arrowGraphics.lineTo(arrowWidth * 0.3, 0);
      arrowGraphics.moveTo(arrowWidth * 0.08, 12 * scale);
      arrowGraphics.lineTo(arrowWidth * 0.32, 0);
      arrowGraphics.lineTo(arrowWidth * 0.08, -12 * scale);
      arrowGraphics.stroke();
    }

    const textWidth = width - 48 * scale;
    const nameY = cellY - cellSize / 2 - 40 * scale;
    const nameLabel = this.host.addChildLabel(card, 'LobbyBagShowcaseName', name, 0, nameY, 28 * scale, rgba(248, 220, 153), new Size(textWidth, 36 * scale));
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(nameLabel, scale, true);
    const subtitleLabel = this.host.addChildLabel(card, 'LobbyBagShowcaseSubtitle', subtitle, 0, nameY - 36 * scale, 20 * scale, this.rarityColor(cells[0]?.item.rarity ?? ''), new Size(textWidth, 26 * scale));
    subtitleLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(subtitleLabel, scale, false);
    const rowsTop = nameY - 64 * scale;
    const lines = this.host.addChildPlainNode(card, 'LobbyBagShowcaseLines', 0, 0, width, height);
    const lineGraphics = lines.addComponent(Graphics);
    lineGraphics.strokeColor = rgba(206, 168, 104, 70);
    lineGraphics.lineWidth = Math.max(1, 1 * scale);
    rows.forEach(([rowTitle, rowValue], index) => {
      const rowY = rowsTop - rowHeight / 2 - index * rowHeight;
      if (rowY - rowHeight / 2 < -height / 2 + 8 * scale) {
        return;
      }
      lineGraphics.moveTo(-textWidth / 2, rowY + rowHeight / 2);
      lineGraphics.lineTo(textWidth / 2, rowY + rowHeight / 2);
      lineGraphics.stroke();
      const titleLabel = this.host.addChildLabel(card, `LobbyBagShowcaseRowTitle_${index}`, rowTitle, -textWidth / 2, rowY, 20 * scale, rgba(236, 221, 190), new Size(textWidth * 0.5, 28 * scale), HorizontalTextAlignment.LEFT);
      titleLabel.overflow = Label.Overflow.SHRINK;
      const valueLabel = this.host.addChildLabel(card, `LobbyBagShowcaseRowValue_${index}`, rowValue, textWidth / 2, rowY, 20 * scale, rgba(255, 232, 168), new Size(textWidth * 0.5, 28 * scale), HorizontalTextAlignment.RIGHT);
      valueLabel.overflow = Label.Overflow.SHRINK;
    });
  }

  // 手机全屏弹窗底板:程序绘制暗底 + 金色外框 + 内细线(不拉伸一体构图框素材)。
  private drawPhoneDialogPanel(node: Node, width: number, height: number, scale: number): void {
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(12, 10, 9, 255);
    graphics.roundRect(-width / 2, -height / 2, width, height, 14 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(214, 168, 82, 230);
    graphics.lineWidth = 2 * scale;
    graphics.roundRect(-width / 2, -height / 2, width, height, 14 * scale);
    graphics.stroke();
    graphics.strokeColor = rgba(214, 168, 82, 70);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.roundRect(-width / 2 + 7 * scale, -height / 2 + 7 * scale, width - 14 * scale, height - 14 * scale, 10 * scale);
    graphics.stroke();
  }

  // 合成确认弹窗(2026-07-24):组数选择(-/+/最大)+ 消耗→产出 + 合成前/后对比;确认才真正提交。
  private renderComposeDialog(parent: Node, item: BagItemEntryVO, times: number, scale: number): void {
    const rules: Record<string, { need: number; target: string; targetLabel: string }> = {
      ENHANCE_STONE: { need: 10, target: 'ENHANCE_STONE_HIGH', targetLabel: '高阶强化石' },
      LOW_ENHANCE_STONE: { need: 1, target: 'ENHANCE_STONE', targetLabel: '强化石' },
      GEM_HP_1: { need: 3, target: 'GEM_HP_2', targetLabel: '纯·赤魂石' },
      GEM_HP_2: { need: 3, target: 'GEM_HP_3', targetLabel: '璀·赤魂石' },
      GEM_HP_3: { need: 3, target: 'GEM_HP_4', targetLabel: '炽·赤魂石' },
      GEM_HP_4: { need: 3, target: 'GEM_HP_5', targetLabel: '神·赤魂石' },
      GEM_ATK_1: { need: 3, target: 'GEM_ATK_2', targetLabel: '纯·焰锋石' },
      GEM_ATK_2: { need: 3, target: 'GEM_ATK_3', targetLabel: '璀·焰锋石' },
      GEM_ATK_3: { need: 3, target: 'GEM_ATK_4', targetLabel: '炽·焰锋石' },
      GEM_ATK_4: { need: 3, target: 'GEM_ATK_5', targetLabel: '神·焰锋石' },
      GEM_DEF_1: { need: 3, target: 'GEM_DEF_2', targetLabel: '纯·苍岩石' },
      GEM_DEF_2: { need: 3, target: 'GEM_DEF_3', targetLabel: '璀·苍岩石' },
      GEM_DEF_3: { need: 3, target: 'GEM_DEF_4', targetLabel: '炽·苍岩石' },
      GEM_DEF_4: { need: 3, target: 'GEM_DEF_5', targetLabel: '神·苍岩石' },
    };
    const rule = rules[(item.itemCode || '').toUpperCase()];
    if (!rule) {
      return;
    }
    if (this.phoneDialogRect) {
      this.renderPhoneComposeDialog(parent, item, rule, times, scale);
      return;
    }
    const held = safeNumber(item.itemCount);
    const maxTimes = Math.max(1, Math.min(500, Math.floor(held / rule.need)));
    const safeTimes = Math.max(1, Math.min(maxTimes, times));
    const bag = this.host.currentLobbyBagState();
    const targetHeld = safeNumber(bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === rule.target)?.itemCount ?? 0);

    const overlay = this.host.addChildPlainNode(parent, 'LobbyBagComposeOverlay', 0, 0, 4000, 4000);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 170);
    og.rect(-2000, -2000, 4000, 4000);
    og.fill();

    let dialog: Node;
    // 手机已在函数开头分走(renderPhone*Dialog),这里只剩桌面;保留旧分支以防 phoneDialogRect 在别处被置空后重入
    const phone = this.phoneDialogRect as PhoneDialogRect | null;
    if (phone) {
      // 手机全屏:左列「源材料 → 产物」展示,右侧控件按原设计尺寸 × k 放大排布。
      const shell = this.addPhoneConfirmShell(overlay, 'LobbyBagComposeDialog', phone, 470, 360, scale);
      const targetEntry = bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === rule.target);
      const targetItem = targetEntry ?? ({ ...item, itemCode: rule.target, itemName: rule.targetLabel, itemCount: 0 } as BagItemEntryVO);
      this.renderPhoneItemShowcase(shell.node, shell.showcaseX, shell.showcaseWidth, phone.height, [
        { item, badge: `×${rule.need}` },
        { item: targetItem, badge: '×1' },
      ], `${safeText(item.itemName)} → ${rule.targetLabel}`, `每 ${rule.need} 个合成 1 个`, [
        ['持有', `×${formatCompact(held)}`],
        [rule.targetLabel, `×${formatCompact(targetHeld)}`],
      ], scale);
      scale *= shell.k;
      dialog = this.host.addChildPlainNode(shell.node, 'LobbyBagComposeControls', shell.controlsX, 0, 470 * scale, 360 * scale);
    } else {
      dialog = this.host.addChildPlainNode(overlay, 'LobbyBagComposeDialog', 0, 0, 470 * scale, 360 * scale);
      const g = dialog.addComponent(Graphics);
      g.fillColor = rgba(12, 10, 9, 250);
      g.roundRect(-235 * scale, -180 * scale, 470 * scale, 360 * scale, 12 * scale);
      g.fill();
      g.strokeColor = rgba(214, 168, 82, 230);
      g.lineWidth = 2 * scale;
      g.roundRect(-235 * scale, -180 * scale, 470 * scale, 360 * scale, 12 * scale);
      g.stroke();
    }
    const w = 470 * scale;
    const h = 360 * scale;

    const title = this.host.addChildLabel(dialog, 'LobbyBagComposeTitle', '材料合成', 0, h / 2 - 32 * scale, 24 * scale, rgba(248, 220, 153), new Size(w - 48 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    this.addDialogTitleDividers(dialog, 'LobbyBagComposeTitleDivider', h / 2 - 32 * scale, 2 * 24 * scale, w, scale);
    const ruleRow = this.host.addChildLabel(dialog, 'LobbyBagComposeRule', `${safeText(item.itemName)} ×${rule.need} → ${rule.targetLabel} ×1`, 0, h / 2 - 66 * scale, 18 * scale, rgba(230, 218, 195), new Size(w - 52 * scale, 24 * scale));
    ruleRow.overflow = Label.Overflow.SHRINK;

    // 组数选择:[-] N 组 [+] [最大]
    const pickY = h / 2 - 112 * scale;
    const makePickButton = (name: string, x: number, textValue: string, enabled: boolean, onClick: () => void, wide = false): void => {
      const bw = (wide ? 84 : 52) * scale;
      const bh = 44 * scale;
      const btn = this.host.addChildPlainNode(dialog, name, x, pickY, bw, bh);
      const bg = btn.addComponent(Graphics);
      bg.fillColor = enabled ? rgba(48, 38, 22, 235) : rgba(24, 22, 20, 210);
      bg.roundRect(-bw / 2, -bh / 2, bw, bh, 8 * scale);
      bg.fill();
      bg.strokeColor = enabled ? rgba(214, 176, 100, 225) : rgba(110, 96, 70, 150);
      bg.lineWidth = 1.5 * scale;
      bg.stroke();
      const bl = this.host.addChildLabel(btn, 'Label', textValue, 0, 0, 20 * scale, enabled ? rgba(244, 222, 168) : rgba(190, 182, 169), new Size(bw - 8 * scale, bh - 8 * scale));
      bl.overflow = Label.Overflow.SHRINK;
      if (enabled) {
        btn.addComponent(Button);
        btn.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
      }
    };
    makePickButton('LobbyBagComposeMinus', -w / 2 + 60 * scale, '−', safeTimes > 1, () => this.host.setLobbyBagComposeTimes(safeTimes - 1));
    const countLabel = this.host.addChildLabel(dialog, 'LobbyBagComposeCount', `${formatCompact(safeTimes)} 组`, -w / 2 + 145 * scale, pickY, 20 * scale, rgba(255, 236, 180), new Size(110 * scale, 30 * scale));
    countLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(countLabel, scale, true);
    makePickButton('LobbyBagComposePlus', -w / 2 + 230 * scale, '＋', safeTimes < maxTimes, () => this.host.setLobbyBagComposeTimes(safeTimes + 1));
    makePickButton('LobbyBagComposeMax', w / 2 - 78 * scale, `最大 ${formatCompact(maxTimes)}`, safeTimes < maxTimes, () => this.host.setLobbyBagComposeTimes(maxTimes), true);

    const costRow = this.host.addChildLabel(dialog, 'LobbyBagComposeCost', `消耗 ${safeText(item.itemName)} ×${formatCompact(rule.need * safeTimes)} → 获得 ${rule.targetLabel} ×${formatCompact(safeTimes)}`, 0, h / 2 - 158 * scale, 18 * scale, rgba(238, 208, 144), new Size(w - 52 * scale, 24 * scale));
    costRow.overflow = Label.Overflow.SHRINK;

    // 合成前/后对比。
    const beforeRow = this.host.addChildLabel(dialog, 'LobbyBagComposeBefore', `合成前：${safeText(item.itemName)} ×${formatCompact(held)} · ${rule.targetLabel} ×${formatCompact(targetHeld)}`, -w / 2 + 30 * scale, h / 2 - 196 * scale, 17 * scale, rgba(218, 210, 191), new Size(w - 60 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    beforeRow.overflow = Label.Overflow.SHRINK;
    const afterRow = this.host.addChildLabel(dialog, 'LobbyBagComposeAfter', `合成后：${safeText(item.itemName)} ×${formatCompact(held - rule.need * safeTimes)} · ${rule.targetLabel} ×${formatCompact(targetHeld + safeTimes)}`, -w / 2 + 30 * scale, h / 2 - 226 * scale, 17 * scale, rgba(202, 233, 190), new Size(w - 60 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    afterRow.overflow = Label.Overflow.SHRINK;

    const buttonW = 190 * scale;
    const buttonH = buttonW * (211 / 740);
    const confirm = this.host.addChildPlainNode(dialog, 'LobbyBagComposeConfirm', -buttonW / 2 - 18 * scale, -h / 2 + 52 * scale, buttonW, buttonH);
    confirm.addComponent(Button);
    confirm.on(Button.EventType.CLICK, () => this.host.composeLobbyBagItem(item.itemCode, safeTimes), this);
    this.host.applyImageButtonFeedback(confirm, 1.035, 0.965);
    if (!this.host.addSprite('LobbyBagComposeConfirmArt', 'ui/common/ai/button_primary/spriteFrame', 0, 0, buttonW, buttonH, confirm)) {
      const cg = confirm.addComponent(Graphics);
      cg.fillColor = rgba(122, 42, 30, 235);
      cg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      cg.fill();
    }
    const confirmLabel = this.host.addChildLabel(confirm, 'Label', '合 成', 0, 1 * scale, 20 * scale, rgba(255, 240, 200), new Size(buttonW - 46 * scale, buttonH * 0.7));
    confirmLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(confirmLabel, scale, true);
    const cancel = this.host.addChildPlainNode(dialog, 'LobbyBagComposeCancel', buttonW / 2 + 18 * scale, -h / 2 + 52 * scale, buttonW, buttonH);
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyBagComposeDialog(), this);
    this.host.applyImageButtonFeedback(cancel, 1.035, 0.965);
    if (!this.host.addSprite('LobbyBagComposeCancelArt', 'ui/common/ai/button_return_dis/spriteFrame', 0, 0, buttonW, buttonH, cancel)) {
      const xg = cancel.addComponent(Graphics);
      xg.fillColor = rgba(28, 24, 22, 230);
      xg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      xg.fill();
    }
    const cancelLabel = this.host.addChildLabel(cancel, 'Label', '取消', 0, 1 * scale, 20 * scale, rgba(228, 218, 200), new Size(buttonW - 46 * scale, buttonH * 0.7));
    cancelLabel.overflow = Label.Overflow.SHRINK;
  }

  // ───────── 手机二级弹窗(2026-10-20 按原型 1:1:proto/bag_use|bag_sell|bag_compose.png)─────────
  // 原型整屏 1870×841 等比(u 与物品详情同算法,取 renderDetailPopupPhone 记下的面板尺寸);外框 = 细双线金框,短版通栏标题带,
  // 背后整屏压暗(压在物品详情之上)。数量选择统一为:圆形 − / 数字框 / 圆形 + / 小钮(+10、最大)+ 金色滑条。
  private phoneDialogMap(FL: number, FR: number, FT: number, FB: number): { u: number; X: (px: number) => number; Y: (py: number) => number; S: (v: number) => number; w: number; h: number; cx: number; cy: number } {
    const size = this.phoneDetailPanelSize ?? { w: 1600, h: 720 };
    const screenW = Math.max(size.w, view.getVisibleSize().width);
    const u = Math.min(size.h / 841, screenW / 1870, (size.w * 0.98) / (FR - FL));
    const fcx = (FL + FR) / 2;
    const fcy = (FT + FB) / 2;
    return {
      u,
      X: (px: number): number => (px - fcx) * u,
      Y: (py: number): number => (fcy - py) * u,
      S: (v: number): number => v * u,
      w: (FR - FL) * u,
      h: (FB - FT) * u,
      cx: (fcx - 935) * u,
      cy: (420.5 - fcy) * u,
    };
  }

  /** 弹窗壳:整屏压暗 + 实底 + 实景底图 + 细双线框 + 短版标题带(暗红本体 y bandY0..bandY1)+ 四芒星标题 + 关闭钮。返回弹窗节点(坐标系 = 弹窗中心)。 */
  private mountPhoneSubDialog(parent: Node, name: string, map: ReturnType<LobbyBagPanelRenderer['phoneDialogMap']>, FT: number, bandY0: number, bandY1: number, title: string, closeX: number, onClose: () => void, scale: number): Node {
    const { X, Y, S, w, h, cx, cy } = map;
    const size = this.phoneDetailPanelSize ?? { w: 1600, h: 720 };
    const dimW = Math.max(size.w, view.getVisibleSize().width) * 1.6;
    const dimH = size.h * 1.6;
    const dim = this.host.addChildPlainNode(parent, `${name}Dim`, 0, 0, dimW, dimH);
    // 二级弹窗压在物品详情之上:压暗 210,详情退成背景(原型里只看得到弹窗)
    mountRefSolid(this.host, dim, 'Fill', 0, 0, dimW, dimH, rgba(0, 0, 0, 210));
    dim.addComponent(BlockInputEvents);
    const dialog = this.host.addChildPlainNode(dim, name, cx, cy, w, h);
    dialog.addComponent(BlockInputEvents);
    mountRefSolid(this.host, dialog, 'Back', 0, 0, w, h, rgba(10, 8, 9, 244));
    mountRefDialogBackdrop(this.host, dialog, REF_DETAIL_INNER_BG, 0, 0, w, h, 215, true);
    mountRefLineFrame(this.host, dialog, 'Frame', w, h);
    // 标题带:短版素材本体 y 91..183,宽 = 弹窗宽(素材比例 15.5,和原型 15~17 接近,高度随宽)
    const HB = REF_BAG_DLG.headerBand;
    const hk = w / HB.w;
    const bodyH = (HB.bodyY1 - HB.bodyY0) * hk;
    const bodyCy = Y((bandY0 + bandY1) / 2);
    // 素材本体中心比图心低 ((y0 + y1) / 2 - h / 2) 像素 → 整图中心 = 本体中心上移这么多
    this.host.addSprite('Band', HB.path, 0, bodyCy + ((HB.bodyY0 + HB.bodyY1) / 2 - HB.h / 2) * hk, HB.w * hk, HB.h * hk, dialog);
    void bodyH;
    void FT;
    const titleSize = S(36);
    const titleText = title.split('').join(String.fromCharCode(0x2009));
    const titleW = title.length * titleSize * 1.12;
    this.host.addSprite('Star', 'ui/common/ref/ult_title_star/spriteFrame', -titleW / 2 - S(30), bodyCy, S(56), S(56), dialog);
    const titleLabel = this.host.addChildLabel(dialog, 'Title', titleText, S(8), bodyCy, titleSize, rgba(255, 228, 156), new Size(titleW + S(30), S(48)));
    titleLabel.lineHeight = titleLabel.fontSize;
    titleLabel.isBold = true;
    this.applyOutline(titleLabel, scale, true);
    const closeSize = S(62);
    const close = this.host.addChildPlainNode(dialog, 'Close', X(closeX), bodyCy, closeSize + S(10), closeSize + S(10));
    // 2026-10-27 UI 审核:小叉点击区放大到 1.7 倍(图标大小不变),手机上好点
    close.getComponent(UITransform)?.setContentSize((closeSize) * 1.7, (closeSize) * 1.7);
    this.host.addSprite('Art', REF_CLOSE_RING_ASSET, 0, 0, closeSize, closeSize, close);
    close.addComponent(Button);
    this.host.applyImageButtonFeedback(close, 1.08, 0.92);
    close.on(Button.EventType.CLICK, onClose, this);
    return dialog;
  }

  /** 物品卡:稀有度法阵底 + 物品图 + 稀有度卡框 + 左上稀有度字母 + 右下 ×N(原型开口 x0..x1 × y0..y1)。 */
  private mountPhoneItemCard(dialog: Node, item: BagItemEntryVO, map: ReturnType<LobbyBagPanelRenderer['phoneDialogMap']>, x0: number, x1: number, y0: number, y1: number, badge: string, scale: number): void {
    const { X, Y, S } = map;
    const openW = S(x1 - x0);
    const openH = S(y1 - y0);
    const ocx = X((x0 + x1) / 2);
    const ocy = Y((y0 + y1) / 2);
    const side = Math.max(openW, openH);
    const icon = bagItemIconAsset(item);
    // 2026-10-22 单框:有图标时只留图标自带的暗底 + 稀有度描边
    if (!icon) {
      mountRefSolid(this.host, dialog, `CardBack_${item.itemCode}`, ocx, ocy, openW, openH, rgba(6, 6, 10, 235));
      this.host.addSprite('CardBg', REF_DETAIL.cardBgPath(item.rarity), ocx, ocy, side, side, dialog);
      mountRefSolid(this.host, dialog, 'CardVeil', ocx, ocy, openW, openH, rgba(4, 4, 8, 60));
    }
    const iconSize = icon ? Math.min(openW, openH) * 1.04 : Math.min(openW, openH) * 0.86;
    if (icon) {
      if (bagEquipCode(item)) {
        mountEquipIconBacking(this.host, dialog, 'CardIconBacking', iconSize, bagEquipCode(item), { x: ocx, y: ocy });
      } else {
        mountItemRarityBacking(this.host, dialog, 'CardIconBacking', iconSize, item.rarity, { x: ocx, y: ocy });
      }
      this.host.addSprite('CardIcon', icon, ocx, ocy, iconSize, iconSize, dialog);
    } else {
      this.host.addSprite('CardIcon', bagItemTypeIconAsset(item.itemType), ocx, ocy, iconSize * 0.7, iconSize * 0.7, dialog);
    }
    if (!icon) {
      const CF = REF_DETAIL.cardFrame;
      const ck = openW / (CF.open.x1 - CF.open.x0);
      this.host.addSprite('CardFrame', REF_DETAIL.cardFramePath(item.rarity), ocx, ocy + ((CF.open.y0 + CF.open.y1) / 2 - CF.h / 2) * ck, CF.w * ck, CF.h * ck, dialog);
      const rarity = this.rarityColor(item.rarity);
      const letter = this.host.addChildLabel(dialog, 'CardRarity', safeText(item.rarity || 'N'), ocx - openW / 2 + S(14), ocy + openH / 2 - S(28), S(34), rarity, new Size(S(110), S(42)), HorizontalTextAlignment.LEFT);
      letter.lineHeight = letter.fontSize;
      letter.isBold = true;
      letter.isItalic = true;
      letter.enableWrapText = false;
      this.applyOutline(letter, scale, true);
    }
    if (badge) {
      const b = this.host.addChildLabel(dialog, 'CardBadge', badge, ocx + openW / 2 - S(12), ocy - openH / 2 + S(24), S(28), rgba(255, 246, 228), new Size(S(160), S(36)), HorizontalTextAlignment.RIGHT);
      b.lineHeight = b.fontSize;
      b.isBold = true;
      this.applyOutline(b, scale, true);
    }
  }

  /** 数量选择行:圆形 − / 数字框 / 圆形 + / 小钮若干;y = 行心(原型坐标)。 */
  private mountPhoneStepper(dialog: Node, map: ReturnType<LobbyBagPanelRenderer['phoneDialogMap']>, y: number, minusX: number, fieldX0: number, fieldX1: number, plusX: number, round: number, chipH: number, valueText: string,
    canMinus: boolean, canPlus: boolean, onMinus: () => void, onPlus: () => void, chips: Array<{ x0: number; x1: number; text: string; enabled: boolean; onClick: () => void }>, scale: number): void {
    const { X, Y, S } = map;
    const cy = Y(y);
    const roundBtn = (name: string, x: number, glyph: string, enabled: boolean, onClick: () => void): void => {
      const node = this.host.addChildPlainNode(dialog, name, X(x), cy, S(round), S(round));
      this.host.addSprite('Art', REF_BAG_DLG.roundBtn, 0, 0, S(round), S(round), node);
      const g = this.host.addChildLabel(node, 'Glyph', glyph, 0, S(2), S(round * 0.62), enabled ? rgba(255, 236, 190) : rgba(130, 122, 110), new Size(S(round), S(round)));
      g.lineHeight = g.fontSize;
      g.isBold = true;
      if (enabled) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(node, 1.08, 0.92);
      } else {
        node.addComponent(UIOpacity).opacity = 150;
      }
    };
    roundBtn('Minus', minusX, '−', canMinus, onMinus);
    roundBtn('Plus', plusX, '+', canPlus, onPlus);
    const fw = S(fieldX1 - fieldX0);
    const fh = S(chipH);
    const field = this.host.addChildPlainNode(dialog, 'Field', X((fieldX0 + fieldX1) / 2), cy, fw, fh);
    // 数字框:暗底 + 四边金线(原型是完整细金框;九宫格行条在窄框里按宽缩,上下线细到看不见,改纯色线)
    const line = Math.max(1.5, S(2));
    const gold = rgba(200, 156, 84, 230);
    mountRefSolid(this.host, field, 'Fill', 0, 0, fw - line * 2, fh - line * 2, rgba(6, 5, 6, 235));
    mountRefSolid(this.host, field, 'LineT', 0, fh / 2 - line / 2, fw, line, gold);
    mountRefSolid(this.host, field, 'LineB', 0, -fh / 2 + line / 2, fw, line, gold);
    mountRefSolid(this.host, field, 'LineL', -fw / 2 + line / 2, 0, line, fh, gold);
    mountRefSolid(this.host, field, 'LineR', fw / 2 - line / 2, 0, line, fh, gold);
    const v = this.host.addChildLabel(field, 'Value', valueText, 0, 0, S(30), rgba(255, 244, 222), new Size(fw - S(16), fh));
    v.lineHeight = v.fontSize;
    v.overflow = Label.Overflow.SHRINK;
    v.isBold = true;
    chips.forEach((chip, index) => {
      const cw = S(chip.x1 - chip.x0);
      const node = this.host.addChildPlainNode(dialog, `Chip_${index}`, X((chip.x0 + chip.x1) / 2), cy, cw, fh);
      this.host.addSprite('Art', REF_BAG_DLG.chip, 0, 0, cw, fh, node);
      const t = this.host.addChildLabel(node, 'Label', chip.text, 0, 0, S(26), chip.enabled ? rgba(255, 236, 190) : rgba(150, 142, 128), new Size(cw - S(10), fh));
      t.lineHeight = t.fontSize;
      t.overflow = Label.Overflow.SHRINK;
      t.isBold = true;
      if (chip.enabled) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, chip.onClick, this);
        this.host.applyImageButtonFeedback(node, 1.05, 0.95);
      } else {
        node.addComponent(UIOpacity).opacity = 160;
      }
    });
  }

  /** 金色滑条:左右端标 min / max;拖动或点按改数量(松手才提交,拖动中只挪滑块与预览)。 */
  private mountPhoneSlider(dialog: Node, map: ReturnType<LobbyBagPanelRenderer['phoneDialogMap']>, y: number, minLabelX: number, x0: number, x1: number, maxLabelX: number, min: number, max: number, value: number, enabled: boolean, onSet: (v: number) => void, scale: number): void {
    const { X, Y, S } = map;
    const cy = Y(y);
    const trackW = S(x1 - x0);
    const trackH = S(16);
    const left = X(x0);
    const lab = (name: string, x: number, text: string): void => {
      const l = this.host.addChildLabel(dialog, name, text, X(x), cy, S(24), rgba(226, 214, 192), new Size(S(90), S(30)));
      l.lineHeight = l.fontSize;
    };
    lab('SliderMin', minLabelX, formatCompact(min));
    lab('SliderMax', maxLabelX, formatCompact(max));
    const track = this.host.addChildPlainNode(dialog, 'SliderTrack', X((x0 + x1) / 2), cy, trackW, S(48));
    mountRefPlate(this.host, track, 'Track', REF_BAG_DLG.sliderTrack, 0, 0, trackW, trackH);
    const ratio = max > min ? (value - min) / (max - min) : 1;
    const fillW = Math.max(trackH, trackW * ratio);
    const fill = this.host.addChildPlainNode(track, 'FillHolder', -trackW / 2 + fillW / 2, 0, fillW, trackH);
    mountRefPlate(this.host, fill, 'Fill', REF_BAG_DLG.sliderFill, 0, 0, fillW, trackH);
    const knob = this.host.addSprite('Knob', REF_BAG_DLG.sliderKnob, -trackW / 2 + trackW * ratio, 0, S(38), S(38), track);
    if (!enabled || max <= min) {
      return;
    }
    const valueAt = (worldX: number): number => {
      const ut = track.getComponent(UITransform);
      const local = ut ? ut.convertToNodeSpaceAR(new Vec3(worldX, 0, 0)).x : 0;
      const r = Math.max(0, Math.min(1, (local + trackW / 2) / trackW));
      return Math.round(min + r * (max - min));
    };
    let pending = value;
    const preview = (v: number): void => {
      pending = v;
      const r = (v - min) / (max - min);
      knob?.node.setPosition(new Vec3(-trackW / 2 + trackW * r, 0, 0));
    };
    track.on(Node.EventType.TOUCH_START, (e: EventTouch) => preview(valueAt(e.getUILocation().x)), this);
    track.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => preview(valueAt(e.getUILocation().x)), this);
    track.on(Node.EventType.TOUCH_END, () => onSet(pending), this);
    track.on(Node.EventType.TOUCH_CANCEL, () => onSet(pending), this);
    void left;
    void scale;
  }

  /** 两侧带细金线的居中说明行(原型:合成消耗行 / 弹窗分隔)。 */
  private mountPhoneRuledLine(dialog: Node, map: ReturnType<LobbyBagPanelRenderer['phoneDialogMap']>, y: number, x0: number, x1: number, gap: number): void {
    const { X, Y, S } = map;
    const lineH = Math.max(1, S(1.4));
    const cx = X((x0 + x1) / 2);
    const half = S(x1 - x0) / 2;
    const seg = half - S(gap);
    if (seg > 0) {
      mountRefSolid(this.host, dialog, 'RuleL', cx - S(gap) - seg / 2, Y(y), seg, lineH, rgba(214, 170, 92, 150));
      mountRefSolid(this.host, dialog, 'RuleR', cx + S(gap) + seg / 2, Y(y), seg, lineH, rgba(214, 170, 92, 150));
    }
  }

  // 使用道具(原型 bag_use:框 440..1430 × 100..712)
  private renderPhoneUseDialog(parent: Node, item: BagItemEntryVO, useState: { itemCode: string | null; count: number; busy: boolean }, scale: number): void {
    const held = safeNumber(item.itemCount);
    if (held <= 1) {
      return;
    }
    const map = this.phoneDialogMap(440, 1430, 100, 712);
    const { X, Y, S } = map;
    const count = Math.max(1, Math.min(held, useState.count));
    const busy = useState.busy;
    const dialog = this.mountPhoneSubDialog(parent, 'LobbyBagUseDialog', map, 100, 110, 165, '使用道具', 1404, () => this.host.closeLobbyBagUseDialog(), scale);
    // 2026-10-20 用户:整个图标框缩小 10%(开口 244×234 → 220×210,心不变),名字跟着上移
    this.mountPhoneItemCard(dialog, item, map, 520, 740, 230, 440, `×${formatCompact(held)}`, scale);
    const name = this.host.addChildLabel(dialog, 'Name', safeText(item.itemName), X(630), Y(493), S(34), rgba(255, 232, 170), new Size(S(300), S(42)));
    name.lineHeight = name.fontSize;
    name.isBold = true;
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    mountRefSolid(this.host, dialog, 'NameRule', X(630), Y(516), S(270), Math.max(1, S(1.4)), rgba(214, 170, 92, 140));
    const tag = this.host.addChildLabel(dialog, 'Tag', `${safeText(item.rarity || 'N')} · ${itemTypeLabel(item.itemType)}`, X(630), Y(539), S(24), this.rarityColor(item.rarity), new Size(S(280), S(30)));
    tag.lineHeight = tag.fontSize;
    // 说明框 815..1392 × 205..302
    const descW = S(1392 - 815);
    const descH = S(302 - 205);
    const desc = this.host.addChildPlainNode(dialog, 'Desc', X((815 + 1392) / 2), Y((205 + 302) / 2), descW, descH);
    mountRefSolid(this.host, desc, 'Fill', 0, 0, descW - S(6), descH - S(6), rgba(8, 6, 7, 210));
    mountRefSlicedByWidth(this.host, desc, 'Frame', REF_ULT.costRow, 0, 0, descW, descH);
    const descText = this.host.addChildLabel(desc, 'Text', safeText(item.useDesc || '使用后获得道具效果'), -descW / 2 + S(24), 0, S(26), rgba(246, 236, 214), new Size(descW - S(48), descH - S(16)), HorizontalTextAlignment.LEFT);
    descText.enableWrapText = true;
    descText.lineHeight = S(34);
    descText.overflow = Label.Overflow.SHRINK;
    const set = (v: number): void => this.host.setLobbyBagUseCount(Math.max(1, Math.min(held, v)));
    this.mountPhoneStepper(dialog, map, 355, 845, 895, 1068, 1113, 58, 52, formatCompact(count), !busy && count > 1, !busy && count < held, () => set(count - 1), () => set(count + 1), [
      { x0: 1165, x1: 1270, text: '+10', enabled: !busy && count < held, onClick: () => set(count + 10) },
      { x0: 1287, x1: 1392, text: '最大', enabled: !busy && count < held, onClick: () => set(held) },
    ], scale);
    this.mountPhoneSlider(dialog, map, 418, 822, 852, 1345, 1378, 1, held, count, !busy, set, scale);
    this.mountPhoneRuledLine(dialog, map, 466, 815, 1392, 30);
    this.host.addSprite('RuleGem', 'ui/common/ref/ult_title_star/spriteFrame', X(1104), Y(466), S(26), S(26), dialog);
    const sum = this.host.addChildLabel(dialog, 'Summary', `使用 ×${formatCompact(count)}  →  获得 ${bagUseRewardLabel(item)}`, X(1104), Y(508), S(30), rgba(255, 214, 120), new Size(S(560), S(40)));
    sum.lineHeight = sum.fontSize;
    sum.isBold = true;
    sum.overflow = Label.Overflow.SHRINK;
    this.applyOutline(sum, scale, true);
    const remain = this.host.addChildLabel(dialog, 'Remain', `使用后剩余 ×${formatCompact(held - count)}`, X(1104), Y(556), S(22), rgba(190, 180, 164), new Size(S(500), S(30)));
    remain.lineHeight = remain.fontSize;
    const use = this.addDetailPlateButton(dialog, 'UseConfirm', busy ? '使用中…' : '使用', REF_BAG_DLG.icPouch, X(645), Y(640), S(280), S(72), scale, !busy, true);
    use.on(Button.EventType.CLICK, () => this.host.confirmLobbyBagUse(false), this);
    const all = this.addDetailPlateButton(dialog, 'UseAll', '全部使用', REF_BAG_DLG.icPouches, X(962), Y(640), S(285), S(72), scale, !busy, false);
    all.on(Button.EventType.CLICK, () => this.host.confirmLobbyBagUse(true), this);
    const cancel = this.addDetailPlateButton(dialog, 'UseCancel', '取消', '', X(1258), Y(640), S(243), S(72), scale, !busy, false);
    cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyBagUseDialog(), this);
  }

  // 出售道具(原型 bag_sell:框 383..1490 × 92..752)
  private renderPhoneSellDialog(parent: Node, item: BagItemEntryVO, sellState: { itemCode: string | null; count: number; busy: boolean; error: string }, scale: number): void {
    const held = safeNumber(item.itemCount);
    const unitPrice = safeNumber(item.sellGold);
    if (held <= 0 || unitPrice <= 0) {
      return;
    }
    const maxCount = Math.max(1, Math.min(9999, held));
    const count = Math.max(1, Math.min(maxCount, sellState.count));
    const busy = sellState.busy;
    const map = this.phoneDialogMap(383, 1490, 92, 752);
    const { X, Y, S } = map;
    const dialog = this.mountPhoneSubDialog(parent, 'LobbyBagSellDialog', map, 92, 98, 158, '出售道具', 1432, () => this.host.closeLobbyBagSellDialog(), scale);
    // 2026-10-20 用户「出售里上下左右间距太大」:按「使用道具」的留白对齐 —— 卡离左框线 80、离标题带底 65,
    // 左列 383..770 里居中 → 开口 463..707 × 223..456(比例同使用卡 220:210),名字紧跟卡下
    // 10-20 再调:卡下移 5,名字与卡间距再加 5
    this.mountPhoneItemCard(dialog, item, map, 463, 707, 228, 461, `×${formatCompact(held)}`, scale);
    const name = this.host.addChildLabel(dialog, 'Name', safeText(item.itemName), X(585), Y(514), S(36), rgba(255, 232, 170), new Size(S(300), S(44)));
    name.lineHeight = name.fontSize;
    name.isBold = true;
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    mountRefSolid(this.host, dialog, 'NameRule', X(585), Y(537), S(210), Math.max(1, S(1.4)), rgba(214, 170, 92, 140));
    const tag = this.host.addChildLabel(dialog, 'Tag', `${safeText(item.rarity || 'N')} · ${itemTypeLabel(item.itemType)}`, X(585), Y(560), S(24), this.rarityColor(item.rarity), new Size(S(280), S(30)));
    tag.lineHeight = tag.fontSize;
    mountRefSolid(this.host, dialog, 'VDivider', X(770), Y(465), Math.max(1, S(1.4)), S(550), rgba(214, 170, 92, 70));
    // 单价 / 持有两行 790..1440
    const rowW = S(1440 - 790);
    const rowH = S(70);
    ([['单价', `${formatMoney(unitPrice)} 金币`, 'ui/common/ref/ic_price/spriteFrame', 229], ['持有', `×${formatCompact(held)}`, 'ui/common/ref/ic_stack/spriteFrame', 310]] as Array<[string, string, string, number]>).forEach(([k, v, icon, y], index) => {
      const row = this.host.addChildPlainNode(dialog, `Row_${index}`, X((790 + 1440) / 2), Y(y), rowW, rowH);
      mountRefSolid(this.host, row, 'Fill', 0, 0, rowW - S(6), rowH - S(6), rgba(10, 8, 8, 200));
      mountRefSlicedByWidth(this.host, row, 'Frame', REF_ULT.costRow, 0, 0, rowW, rowH);
      this.host.addSprite('Icon', icon, X(835) - X((790 + 1440) / 2), 0, S(48), S(48), row);
      const kl = this.host.addChildLabel(row, 'Key', k, X(892) - X((790 + 1440) / 2), 0, S(26), rgba(240, 226, 200), new Size(S(200), S(34)), HorizontalTextAlignment.LEFT);
      kl.lineHeight = kl.fontSize;
      const vl = this.host.addChildLabel(row, 'Value', v, X(1412) - X((790 + 1440) / 2), 0, S(28), rgba(255, 232, 170), new Size(S(260), S(36)), HorizontalTextAlignment.RIGHT);
      vl.lineHeight = vl.fontSize;
      vl.isBold = true;
    });
    const set = (v: number): void => this.host.setLobbyBagSellCount(Math.max(1, Math.min(maxCount, v)));
    this.mountPhoneStepper(dialog, map, 405, 828, 878, 1020, 1068, 60, 62, formatCompact(count), !busy && count > 1, !busy && count < maxCount, () => set(count - 1), () => set(count + 1), [
      { x0: 1123, x1: 1270, text: '+10', enabled: !busy && count < maxCount, onClick: () => set(count + 10) },
      { x0: 1293, x1: 1440, text: '最大', enabled: !busy && count < maxCount, onClick: () => set(maxCount) },
    ], scale);
    this.mountPhoneSlider(dialog, map, 480, 812, 845, 1372, 1420, 1, maxCount, count, !busy, set, scale);
    // 结果框 790..1440 × 530..612
    const resW = S(1440 - 790);
    const resH = S(612 - 530);
    const res = this.host.addChildPlainNode(dialog, 'Result', X((790 + 1440) / 2), Y(571), resW, resH);
    if (!mountRefPlate(this.host, res, 'Art', REF_BAG_DLG.resultPanel, 0, 0, resW, resH)) {
      mountRefSlicedByWidth(this.host, res, 'Art', REF_ULT.costRow, 0, 0, resW, resH);
    }
    const rx = (px: number): number => X(px) - X((790 + 1440) / 2);
    this.host.addSprite('Coin', 'ui/common/ref/ic_price/spriteFrame', rx(848), 0, S(60), S(60), res);
    const seg = (n: string, x: number, text: string, size: number, color: Color, align: HorizontalTextAlignment, bold = false): void => {
      const l = this.host.addChildLabel(res, n, text, rx(x), 0, S(size), color, new Size(S(240), S(size * 1.3)), align);
      l.lineHeight = l.fontSize;
      l.isBold = bold;
      l.enableWrapText = false;
      this.applyOutline(l, scale, bold);
    };
    seg('Sell', 900, `出售 ×${formatCompact(count)}`, 28, rgba(246, 236, 214), HorizontalTextAlignment.LEFT);
    seg('Arrow', 1075, '→', 28, rgba(246, 236, 214), HorizontalTextAlignment.CENTER);
    seg('Gain', 1118, '获得', 28, rgba(246, 236, 214), HorizontalTextAlignment.LEFT);
    seg('Gold', 1243, formatMoney(unitPrice * count), 52, rgba(255, 214, 120), HorizontalTextAlignment.CENTER, true);
    seg('Unit', 1312, '金币', 28, rgba(246, 236, 214), HorizontalTextAlignment.LEFT);
    const remain = this.host.addChildLabel(dialog, 'Remain', sellState.error || `出售后剩余 ×${formatCompact(held - count)} · 出售后不可撤销`, X(1115), Y(637), S(21), sellState.error ? rgba(255, 128, 110) : rgba(190, 180, 164), new Size(S(640), S(28)));
    remain.lineHeight = remain.fontSize;
    remain.overflow = Label.Overflow.SHRINK;
    const sell = this.addDetailPlateButton(dialog, 'SellConfirm', busy ? '出售中…' : '出售', REF_DETAIL.btnIcon.sell, X(957), Y(702), S(305), S(66), scale, !busy, true);
    sell.on(Button.EventType.CLICK, () => this.host.confirmLobbyBagSell(), this);
    const cancel = this.addDetailPlateButton(dialog, 'SellCancel', '取消', '', X(1287), Y(702), S(255), S(66), scale, !busy, false);
    cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyBagSellDialog(), this);
  }

  // 材料合成(原型 bag_compose:框 525..1345 × 68..780)
  private renderPhoneComposeDialog(parent: Node, item: BagItemEntryVO, rule: { need: number; target: string; targetLabel: string }, times: number, scale: number): void {
    const held = safeNumber(item.itemCount);
    const maxTimes = Math.max(1, Math.min(500, Math.floor(held / rule.need)));
    const safeTimes = Math.max(1, Math.min(maxTimes, times));
    const bag = this.host.currentLobbyBagState();
    const targetEntry = bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === rule.target);
    const targetHeld = safeNumber(targetEntry?.itemCount ?? 0);
    const targetItem = targetEntry ?? ({ ...item, itemCode: rule.target, itemName: rule.targetLabel, itemCount: 0, rarity: bagComposeTargetRarity(item.rarity) } as BagItemEntryVO);
    const map = this.phoneDialogMap(525, 1345, 68, 780);
    const { X, Y, S } = map;
    const dialog = this.mountPhoneSubDialog(parent, 'LobbyBagComposeDialog', map, 68, 72, 125, '材料合成', 1316, () => this.host.closeLobbyBagComposeDialog(), scale);
    // 2026-10-20 用户:道具框下移 10;「每 N 个合成 1 个」与卡名保持 8 间距
    this.mountPhoneItemCard(dialog, item, map, 695, 865, 170, 340, `×${rule.need}`, scale);
    this.mountPhoneItemCard(dialog, targetItem, map, 1010, 1180, 170, 340, '×1', scale);
    this.host.addSprite('Arrow', REF_BAG_DLG.arrow, X(937), Y(258), S(72), S(72), dialog);
    const cardName = (n: string, x: number, text: string): void => {
      const l = this.host.addChildLabel(dialog, n, text, X(x), Y(376), S(28), rgba(255, 236, 196), new Size(S(240), S(36)));
      l.lineHeight = l.fontSize;
      l.isBold = true;
      l.overflow = Label.Overflow.SHRINK;
      this.applyOutline(l, scale, true);
    };
    cardName('SrcName', 780, safeText(item.itemName));
    cardName('DstName', 1095, rule.targetLabel);
    const cap = this.host.addChildLabel(dialog, 'Caption', `每 ${rule.need} 个合成 1 个`, X(935), Y(409), S(22), rgba(150, 190, 255), new Size(S(300), S(28)));
    cap.lineHeight = cap.fontSize;
    const set = (v: number): void => this.host.setLobbyBagComposeTimes(Math.max(1, Math.min(maxTimes, v)));
    this.mountPhoneStepper(dialog, map, 460, 670, 738, 958, 1020, 56, 52, `${formatCompact(safeTimes)} 组`, safeTimes > 1, safeTimes < maxTimes, () => set(safeTimes - 1), () => set(safeTimes + 1), [
      { x0: 1097, x1: 1225, text: `最大 ${formatCompact(maxTimes)}`, enabled: safeTimes < maxTimes, onClick: () => set(maxTimes) },
    ], scale);
    this.mountPhoneSlider(dialog, map, 511, 627, 660, 1210, 1240, 1, maxTimes, safeTimes, true, set, scale);
    // 合成前 / 后对比框 570..1300 × 533..633
    const cmpW = S(1300 - 570);
    const cmpH = S(633 - 533);
    const cmp = this.host.addChildPlainNode(dialog, 'Compare', X(935), Y(583), cmpW, cmpH);
    mountRefSolid(this.host, cmp, 'Fill', 0, 0, cmpW - S(10), cmpH - S(10), rgba(8, 6, 8, 210));
    mountRefSlicedByWidth(this.host, cmp, 'Frame', REF_ULT.costRow, 0, 0, cmpW, cmpH);
    mountRefSolid(this.host, cmp, 'Sep', 0, 0, cmpW - S(40), Math.max(1, S(1.2)), rgba(214, 170, 92, 80));
    mountRefSolid(this.host, cmp, 'VSep', X(728) - X(935), 0, Math.max(1, S(1.2)), cmpH - S(30), rgba(214, 170, 92, 80));
    const after = held - rule.need * safeTimes;
    ([['合成前', `${safeText(item.itemName)} ×${formatCompact(held)} · ${rule.targetLabel} ×${formatCompact(targetHeld)}`, 562, rgba(236, 228, 210)],
      ['合成后', `${safeText(item.itemName)} ×${formatCompact(after)} · ${rule.targetLabel} ×${formatCompact(targetHeld + safeTimes)}`, 607, rgba(170, 230, 160)]] as Array<[string, string, number, Color]>).forEach(([k, v, y, color], index) => {
      const kl = this.host.addChildLabel(cmp, `Key_${index}`, k, X(650) - X(935), Y(y) - Y(583), S(24), color, new Size(S(130), S(30)));
      kl.lineHeight = kl.fontSize;
      const vl = this.host.addChildLabel(cmp, `Val_${index}`, v, X(768) - X(935), Y(y) - Y(583), S(25), color, new Size(S(500), S(30)), HorizontalTextAlignment.LEFT);
      vl.lineHeight = vl.fontSize;
      vl.overflow = Label.Overflow.SHRINK;
    });
    this.mountPhoneRuledLine(dialog, map, 660, 590, 1280, 250);
    const sum = this.host.addChildLabel(dialog, 'Summary', `消耗 ${safeText(item.itemName)} ×${formatCompact(rule.need * safeTimes)}  →  获得 ${rule.targetLabel} ×${formatCompact(safeTimes)}`, X(935), Y(660), S(24), rgba(255, 220, 150), new Size(S(480), S(30)));
    sum.lineHeight = sum.fontSize;
    sum.overflow = Label.Overflow.SHRINK;
    const go = this.addDetailPlateButton(dialog, 'ComposeConfirm', '合成', REF_DETAIL.btnIcon.fuse, X(772), Y(722), S(275), S(66), scale, true, true);
    go.on(Button.EventType.CLICK, () => this.host.composeLobbyBagItem(item.itemCode, safeTimes), this);
    const cancel = this.addDetailPlateButton(dialog, 'ComposeCancel', '取消', REF_CLOSE_RING_ASSET, X(1097), Y(722), S(275), S(66), scale, true, false);
    cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyBagComposeDialog(), this);
  }

  // 出售确认弹窗(2026-09-25):单价 + 数量选择(−/＋/+10/最大)+ 获得金币 + 出售后剩余;确认才提交,出售不可撤销。
  private renderSellDialog(parent: Node, item: BagItemEntryVO, sellState: { itemCode: string | null; count: number; busy: boolean; error: string }, scale: number): void {
    if (this.phoneDialogRect) {
      this.renderPhoneSellDialog(parent, item, sellState, scale);
      return;
    }
    const held = safeNumber(item.itemCount);
    const unitPrice = safeNumber(item.sellGold);
    if (held <= 0 || unitPrice <= 0) {
      return;
    }
    const maxCount = Math.max(1, Math.min(9999, held));
    const count = Math.max(1, Math.min(maxCount, sellState.count));

    const overlay = this.host.addChildPlainNode(parent, 'LobbyBagSellOverlay', 0, 0, 4000, 4000);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 170);
    og.rect(-2000, -2000, 4000, 4000);
    og.fill();

    let dialog: Node;
    // 手机已在函数开头分走(renderPhone*Dialog),这里只剩桌面;保留旧分支以防 phoneDialogRect 在别处被置空后重入
    const phone = this.phoneDialogRect as PhoneDialogRect | null;
    if (phone) {
      // 手机全屏:左列道具展示(大图标 + 单价/持有),右侧控件按原设计尺寸 × k 放大排布。
      const shell = this.addPhoneConfirmShell(overlay, 'LobbyBagSellDialog', phone, 500, 380, scale);
      this.renderPhoneItemShowcase(shell.node, shell.showcaseX, shell.showcaseWidth, phone.height, [{ item, badge: `×${formatCompact(held)}` }],
        safeText(item.itemName), `${safeText(item.rarity || 'N')} · ${itemTypeLabel(item.itemType)}`, [
          ['单价', `${formatMoney(unitPrice)} 金币`],
          ['持有', `×${formatCompact(held)}`],
        ], scale);
      scale *= shell.k;
      dialog = this.host.addChildPlainNode(shell.node, 'LobbyBagSellControls', shell.controlsX, 0, 500 * scale, 380 * scale);
    } else {
      dialog = this.host.addChildPlainNode(overlay, 'LobbyBagSellDialog', 0, 0, 500 * scale, 380 * scale);
      const g = dialog.addComponent(Graphics);
      g.fillColor = rgba(12, 10, 9, 250);
      g.roundRect(-250 * scale, -190 * scale, 500 * scale, 380 * scale, 12 * scale);
      g.fill();
      g.strokeColor = rgba(214, 168, 82, 230);
      g.lineWidth = 2 * scale;
      g.roundRect(-250 * scale, -190 * scale, 500 * scale, 380 * scale, 12 * scale);
      g.stroke();
    }
    const w = 500 * scale;
    const h = 380 * scale;

    const title = this.host.addChildLabel(dialog, 'LobbyBagSellTitle', '出售道具', 0, h / 2 - 34 * scale, 26 * scale, rgba(248, 220, 153), new Size(w - 48 * scale, 32 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    this.addDialogTitleDividers(dialog, 'LobbyBagSellTitleDivider', h / 2 - 34 * scale, 2 * 26 * scale, w, scale);
    const priceRow = this.host.addChildLabel(dialog, 'LobbyBagSellPrice', `${safeText(item.itemName)}  ·  单价 ${formatMoney(unitPrice)} 金币  ·  持有 ×${formatCompact(held)}`, 0, h / 2 - 72 * scale, 18 * scale, rgba(230, 218, 195), new Size(w - 52 * scale, 24 * scale));
    priceRow.overflow = Label.Overflow.SHRINK;

    // 数量选择:[−] N 个 [＋] [+10] [最大]
    const pickY = h / 2 - 122 * scale;
    const enabled = !sellState.busy;
    const makePickButton = (name: string, x: number, bw: number, textValue: string, on: boolean, onClick: () => void): void => {
      const bh = 44 * scale;
      const btn = this.host.addChildPlainNode(dialog, name, x, pickY, bw, bh);
      const bg = btn.addComponent(Graphics);
      bg.fillColor = on ? rgba(48, 38, 22, 235) : rgba(24, 22, 20, 210);
      bg.roundRect(-bw / 2, -bh / 2, bw, bh, 8 * scale);
      bg.fill();
      bg.strokeColor = on ? rgba(214, 176, 100, 225) : rgba(110, 96, 70, 150);
      bg.lineWidth = 1.5 * scale;
      bg.stroke();
      const bl = this.host.addChildLabel(btn, 'Label', textValue, 0, 0, 20 * scale, on ? rgba(244, 222, 168) : rgba(190, 182, 169), new Size(bw - 8 * scale, bh - 8 * scale));
      bl.overflow = Label.Overflow.SHRINK;
      if (on) {
        btn.addComponent(Button);
        btn.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
      }
    };
    makePickButton('LobbyBagSellMinus', -w / 2 + 52 * scale, 52 * scale, '−', enabled && count > 1, () => this.host.setLobbyBagSellCount(count - 1));
    const countLabel = this.host.addChildLabel(dialog, 'LobbyBagSellCount', `${formatCompact(count)} 个`, -w / 2 + 138 * scale, pickY, 22 * scale, rgba(255, 236, 180), new Size(110 * scale, 30 * scale));
    countLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(countLabel, scale, true);
    makePickButton('LobbyBagSellPlus', -w / 2 + 224 * scale, 52 * scale, '＋', enabled && count < maxCount, () => this.host.setLobbyBagSellCount(count + 1));
    makePickButton('LobbyBagSellPlus10', -w / 2 + 300 * scale, 70 * scale, '+10', enabled && count < maxCount, () => this.host.setLobbyBagSellCount(Math.min(maxCount, count + 10)));
    makePickButton('LobbyBagSellMax', w / 2 - 70 * scale, 100 * scale, `最大 ${formatCompact(maxCount)}`, enabled && count < maxCount, () => this.host.setLobbyBagSellCount(maxCount));

    const gainRow = this.host.addChildLabel(dialog, 'LobbyBagSellGain', `出售 ×${formatCompact(count)}  →  获得 ${formatMoney(unitPrice * count)} 金币`, 0, h / 2 - 174 * scale, 22 * scale, rgba(250, 214, 120), new Size(w - 52 * scale, 30 * scale));
    gainRow.overflow = Label.Overflow.SHRINK;
    this.applyOutline(gainRow, scale, true);
    const afterRow = this.host.addChildLabel(dialog, 'LobbyBagSellAfter', `出售后剩余 ×${formatCompact(held - count)}  ·  出售后不可撤销`, 0, h / 2 - 210 * scale, 16 * scale, rgba(215, 204, 184), new Size(w - 52 * scale, 22 * scale));
    afterRow.overflow = Label.Overflow.SHRINK;
    if (sellState.error) {
      const err = this.host.addChildLabel(dialog, 'LobbyBagSellError', sellState.error, 0, h / 2 - 240 * scale, 16 * scale, rgba(255, 128, 110), new Size(w - 52 * scale, 22 * scale));
      err.overflow = Label.Overflow.SHRINK;
    }

    const buttonW = 190 * scale;
    const buttonH = buttonW * (211 / 740);
    const confirm = this.host.addChildPlainNode(dialog, 'LobbyBagSellConfirm', -buttonW / 2 - 18 * scale, -h / 2 + 52 * scale, buttonW, buttonH);
    if (!this.host.addSprite('LobbyBagSellConfirmArt', 'ui/common/ai/button_primary/spriteFrame', 0, 0, buttonW, buttonH, confirm)) {
      const cg = confirm.addComponent(Graphics);
      cg.fillColor = rgba(122, 42, 30, 235);
      cg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      cg.fill();
    }
    const confirmLabel = this.host.addChildLabel(confirm, 'Label', sellState.busy ? '出售中…' : '出 售', 0, 1 * scale, 22 * scale, rgba(255, 240, 200), new Size(buttonW - 46 * scale, buttonH * 0.7));
    confirmLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(confirmLabel, scale, true);
    if (enabled) {
      confirm.addComponent(Button);
      confirm.on(Button.EventType.CLICK, () => this.host.confirmLobbyBagSell(), this);
      this.host.applyImageButtonFeedback(confirm, 1.035, 0.965);
    } else {
      confirm.addComponent(UIOpacity).opacity = 150;
    }
    const cancel = this.host.addChildPlainNode(dialog, 'LobbyBagSellCancel', buttonW / 2 + 18 * scale, -h / 2 + 52 * scale, buttonW, buttonH);
    if (!this.host.addSprite('LobbyBagSellCancelArt', 'ui/common/ai/button_return_dis/spriteFrame', 0, 0, buttonW, buttonH, cancel)) {
      const xg = cancel.addComponent(Graphics);
      xg.fillColor = rgba(28, 24, 22, 230);
      xg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      xg.fill();
    }
    const cancelLabel = this.host.addChildLabel(cancel, 'Label', '取消', 0, 1 * scale, 22 * scale, rgba(228, 218, 200), new Size(buttonW - 46 * scale, buttonH * 0.7));
    cancelLabel.overflow = Label.Overflow.SHRINK;
    if (enabled) {
      cancel.addComponent(Button);
      cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyBagSellDialog(), this);
      this.host.applyImageButtonFeedback(cancel, 1.035, 0.965);
    }
  }

  // 合成道具名(合成规则涉及的道具都在此;宝石走 parseGemCode)。
  private bagComposeItemLabel(code: string): string {
    const fixed: Record<string, string> = {
      ENHANCE_STONE: '强化石',
      ENHANCE_STONE_HIGH: '高阶强化石',
      LOW_ENHANCE_STONE: '旧低阶强化石',
    };
    const upper = (code || '').toUpperCase();
    return fixed[upper] ?? parseGemCode(upper)?.label ?? upper;
  }

  // 合成结果弹窗(2026-07-30):产物图标格 + 消耗行 + 已拥有(含本次);确定关闭。
  private renderComposeResultDialog(parent: Node, result: { sourceCode: string; usedCount: number; targetCode: string; gainedCount: number }, scale: number): void {
    const overlay = this.host.addChildPlainNode(parent, 'LobbyBagComposeResultOverlay', 0, 0, 4000, 4000);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 175);
    og.rect(-2000, -2000, 4000, 4000);
    og.fill();

    let dialog: Node;
    const phone = this.phoneDialogRect;
    if (phone) {
      // 手机全屏:底板铺满舞台,结果内容按原设计尺寸 × k 放大居中。
      const shell = this.addPhoneConfirmShell(overlay, 'LobbyBagComposeResultDialog', phone, 440, 400, scale, false);
      scale *= shell.k;
      dialog = this.host.addChildPlainNode(shell.node, 'LobbyBagComposeResultContent', shell.controlsX, 0, 440 * scale, 400 * scale);
    } else {
      dialog = this.host.addChildPlainNode(overlay, 'LobbyBagComposeResultDialog', 0, 0, 440 * scale, 400 * scale);
      const g = dialog.addComponent(Graphics);
      g.fillColor = rgba(12, 10, 9, 250);
      g.roundRect(-220 * scale, -200 * scale, 440 * scale, 400 * scale, 12 * scale);
      g.fill();
      g.strokeColor = rgba(214, 168, 82, 230);
      g.lineWidth = 2 * scale;
      g.roundRect(-220 * scale, -200 * scale, 440 * scale, 400 * scale, 12 * scale);
      g.stroke();
    }
    const w = 440 * scale;
    const h = 400 * scale;

    const title = this.host.addChildLabel(dialog, 'LobbyBagComposeResultTitle', '合成成功！', 0, h / 2 - 36 * scale, 24 * scale, rgba(250, 216, 120), new Size(w - 48 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    this.addDialogTitleDividers(dialog, 'LobbyBagComposeResultTitleDivider', h / 2 - 36 * scale, 2.5 * 24 * scale, w, scale);

    // 产物图标格:图标 + 右下 ×N 角标。
    const cellSize = 96 * scale;
    const cell = this.host.addChildPlainNode(dialog, 'LobbyBagComposeResultCell', 0, h / 2 - 118 * scale, cellSize, cellSize);
    const cg = cell.addComponent(Graphics);
    cg.fillColor = rgba(30, 26, 22, 245);
    cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
    cg.fill();
    cg.strokeColor = rgba(122, 176, 236, 235);
    cg.lineWidth = 2.4 * scale;
    cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
    cg.stroke();
    const iconAsset = BAG_AI_ITEM_ICON_ASSETS[(result.targetCode || '').toUpperCase()];
    if (iconAsset) {
      this.host.addSprite('LobbyBagComposeResultIcon', iconAsset, 0, 3 * scale, cellSize * 0.72, cellSize * 0.72, cell);
    }
    const countBadge = this.host.addChildLabel(cell, 'LobbyBagComposeResultCount', `×${formatCompact(result.gainedCount)}`, cellSize / 2 - 8 * scale, -cellSize / 2 + 13 * scale, 19 * scale, rgba(255, 236, 180), new Size(cellSize, 24 * scale), HorizontalTextAlignment.RIGHT);
    countBadge.overflow = Label.Overflow.SHRINK;
    this.applyOutline(countBadge, scale, true);

    const targetLabel = this.bagComposeItemLabel(result.targetCode);
    const name = this.host.addChildLabel(dialog, 'LobbyBagComposeResultName', `${targetLabel} ×${formatCompact(result.gainedCount)}`, 0, h / 2 - 192 * scale, 20 * scale, rgba(150, 198, 255), new Size(w * 0.8, 28 * scale));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);

    const cost = this.host.addChildLabel(dialog, 'LobbyBagComposeResultCost', `消耗：${this.bagComposeItemLabel(result.sourceCode)} ×${formatCompact(result.usedCount)}`, 0, h / 2 - 226 * scale, 17 * scale, rgba(218, 210, 191), new Size(w * 0.82, 24 * scale));
    cost.overflow = Label.Overflow.SHRINK;

    const bag = this.host.currentLobbyBagState();
    const owned = safeNumber(bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === (result.targetCode || '').toUpperCase())?.itemCount ?? 0);
    const ownedLabel = this.host.addChildLabel(dialog, 'LobbyBagComposeResultOwned', `已拥有：${targetLabel} ×${formatCompact(owned)}（含本次）`, 0, h / 2 - 256 * scale, 16 * scale, rgba(250, 214, 128), new Size(w * 0.84, 22 * scale));
    ownedLabel.overflow = Label.Overflow.SHRINK;

    // 确定按钮(button_primary 原比 250 宽,缺图红底回退)。
    const buttonW = 230 * scale;
    const buttonH = buttonW * (211 / 740);
    const ok = this.host.addChildPlainNode(dialog, 'LobbyBagComposeResultOk', 0, -h / 2 + 62 * scale, buttonW, buttonH);
    ok.addComponent(Button);
    ok.on(Button.EventType.CLICK, () => this.host.clearLobbyBagComposeResult(), this);
    this.host.applyImageButtonFeedback(ok, 1.035, 0.965);
    if (!this.host.addSprite('LobbyBagComposeResultOkArt', 'ui/common/ai/button_primary/spriteFrame', 0, 0, buttonW, buttonH, ok)) {
      const okg = ok.addComponent(Graphics);
      okg.fillColor = rgba(122, 42, 30, 235);
      okg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      okg.fill();
    }
    const okLabel = this.host.addChildLabel(ok, 'Label', '确 定', 0, 1 * scale, 20 * scale, rgba(255, 240, 200), new Size(buttonW - 46 * scale, buttonH * 0.7));
    okLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(okLabel, scale, true);
  }

  // 来源说明拆条:分号/句号/换行切分;超长段再按字数二次拆分,避免单行 SHRINK 把字压小到看不清。
  private resolveSourceSegments(item: BagItemEntryVO, state: LobbyBagPanelState, chunkSize = 15): string[] {
    if (state.sourceItemCode === item.itemCode && state.sourceLoading) {
      return ['来源读取中...'];
    }
    if (state.sourceItemCode === item.itemCode && state.sourceError) {
      return ['来源读取失败,点击此处重试'];
    }
    if (state.sourceItemCode === item.itemCode && state.sourceDesc) {
      const raw = safeText(state.sourceDesc).split(/[;；。\n]+/).map((part) => part.trim()).filter((part) => part.length > 0);
      const segments = (raw.length > 0 ? raw : [safeText(state.sourceDesc)]).flatMap((part) => {
        if (part.length <= chunkSize + 2) {
          return [part];
        }
        const chunks: string[] = [];
        for (let start = 0; start < part.length; start += chunkSize) {
          chunks.push(part.slice(start, start + chunkSize));
        }
        return chunks;
      });
      return segments;
    }
    return ['获取途径读取中...'];
  }

  // 手机详情四钮(2026-10-19 原型 1:1 第二版):照原型的干净底板(启用暗金 / 主操作红 / 不可用灰,无翼饰挂件)整张贴;
  // 图标在板内左 1/4 处居中(原型图标心 ≈ 板左起 26%),字心在右侧 +16%,字号 0.42 高
  private addDetailPlateButton(parent: Node, name: string, text: string, iconAsset: string, x: number, y: number, width: number, height: number, scale: number, enabled: boolean, primary: boolean): Node {
    const holder = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const platePath = !enabled ? REF_DETAIL.btnPlate.grey : primary ? REF_DETAIL.btnPlate.red : REF_DETAIL.btnPlate.dark;
    if (!this.host.addSprite('Art', platePath, 0, 0, width, height, holder)) {
      holder.destroy();
      return mountRefButton(this.host, parent, name, text, x, y, width, height, scale, !enabled ? 'disabled' : primary ? 'primary' : 'secondary', undefined, { fontSize: height * 0.4, iconPath: iconAsset, iconSize: height * 0.52 });
    }
    const icon = iconAsset ? this.host.addSprite('Icon', iconAsset, -width * 0.24, 0, height * 0.66, height * 0.66, holder) : null;
    const label = this.host.addChildLabel(holder, 'Label', text, iconAsset ? width * 0.16 : 0, 0, height * 0.42, enabled ? rgba(255, 240, 210) : rgba(170, 164, 156), new Size(width * 0.46, height * 0.56));
    label.lineHeight = label.fontSize;
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    this.applyOutline(label, scale, true);
    if (!enabled && icon) {
      icon.grayscale = true;
      (icon.node.getComponent(UIOpacity) ?? icon.node.addComponent(UIOpacity)).opacity = 170;
    }
    const component = holder.addComponent(Button);
    component.interactable = enabled;
    if (enabled) {
      this.host.applyImageButtonFeedback(holder, 1.025, 0.97);
    }
    return holder;
  }

  private addDetailActionButton(parent: Node, name: string, text: string, iconAsset: string, x: number, y: number, width: number, height: number, scale: number, enabled: boolean, primary = false, plate = false): Node {
    if (plate) {
      return this.addDetailPlateButton(parent, name, text, iconAsset, x, y, width, height, scale, enabled, primary);
    }
    // 2026-10-19 按原型:主操作红金钮 / 其余暗金副钮 / 不可用压暗;图标在字左侧
    const button = mountRefButton(this.host, parent, name, text, x, y, width, height, scale, !enabled ? 'disabled' : primary ? 'primary' : 'secondary', undefined, { fontSize: height * 0.4, iconPath: iconAsset, iconSize: height * 0.52 });
    const component = button.getComponent(Button) ?? button.addComponent(Button);
    component.interactable = enabled;
    if (enabled) {
      this.host.applyImageButtonFeedback(button, 1.025, 0.97);
    }
    return button;
  }

  private renderEmpty(parent: Node, width: number, bodyHeight: number, scale: number, text: string): void {
    const box = this.host.addChildPlainNode(parent, 'LobbyBagEmptyBox', 0, -12 * scale, width - 96 * scale, Math.min(150 * scale, bodyHeight));
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(9, 9, 12, 164);
    graphics.rect(-(width - 96 * scale) / 2, -60 * scale, width - 96 * scale, 120 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 124);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyBagEmptyText', text, 0, 12 * scale, 20 * scale, rgba(229, 217, 191), new Size(width - 128 * scale, 48 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
    // P1.5 深红宽按钮做空状态主操作:重新读取背包。
    const retry = this.host.addChildPlainNode(box, 'LobbyBagEmptyRetryButton', 0, -34 * scale, 150 * scale, 44 * scale);
    const retryArt = this.host.addSprite('LobbyBagEmptyRetryArt', BAG_AI_BUTTON_CRIMSON_ASSET, 0, 0, 150 * scale, 44 * scale, retry);
    if (!retryArt) {
      const retryGraphics = retry.addComponent(Graphics);
      retryGraphics.fillColor = rgba(62, 16, 15, 224);
      retryGraphics.rect(-75 * scale, -22 * scale, 150 * scale, 44 * scale);
      retryGraphics.fill();
      retryGraphics.strokeColor = rgba(210, 120, 70, 200);
      retryGraphics.stroke();
    }
    const retryLabel = this.host.addChildLabel(retry, 'LobbyBagEmptyRetryLabel', '重新读取', 0, 0, 18 * scale, rgba(255, 240, 200), new Size(120 * scale, 24 * scale));
    retryLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(retryLabel, scale, true);
    retry.addComponent(Button);
    this.host.applyImageButtonFeedback(retry, 1.03, 0.97);
    retry.on(Button.EventType.CLICK, () => this.host.reloadLobbyBag(), this);
  }

  /** 格阵标题带上的当前分类名(与侧栏同一套名称:固定分类优先用服务端名称)。 */
  private selectedGroupTitle(groups: ItemTypeBagGroupVO[]): string {
    if (this.selectedGroupKey === 'ALL') {
      return '全部';
    }
    const presetLabels: Record<string, string> = {
      MATERIAL: '材料', EQUIPMENT: '装备', GACHA_TICKET: '召唤券', CONSUMABLE: '消耗品', HERO_FRAGMENT: '英雄碎片', CURRENCY_BOX: '资源箱',
    };
    const group = groups.find((entry) => (entry.itemType || '').toUpperCase() === this.selectedGroupKey);
    return (group ? safeText(group.itemTypeLabel) : '') || presetLabels[this.selectedGroupKey] || '全部';
  }

  private rarityColor(rarity: string): Color {
    const key = (rarity || '').toUpperCase();
    if (key === 'UR' || key === 'SSR') {
      return rgba(255, 202, 102);
    }
    if (key === 'SR' || key === 'EPIC') {
      return rgba(184, 148, 255);
    }
    if (key === 'R' || key === 'RARE') {
      return rgba(150, 190, 255);
    }
    return rgba(195, 178, 138);
  }

  private rarityFill(rarity: string): Color {
    const base = this.rarityColor(rarity);
    return new Color(base.r, base.g, base.b, 162);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 220 : 180);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }

  private addDialogTitleDividers(parent: Node, name: string, y: number, halfTextWidth: number, dialogWidth: number, scale: number): void {
    const gap = 10 * scale;
    const avail = dialogWidth / 2 - halfTextWidth - gap - 20 * scale;
    if (avail < 40) {
      return;
    }
    const dividerWidth = Math.min(80 * scale, avail);
    const dividerHeight = dividerWidth * (71 / 224);
    const x = halfTextWidth + gap + dividerWidth / 2;
    const left = this.host.addSprite(`${name}L`, 'ui/common/ai/footer_divider_left/spriteFrame', -x, y, dividerWidth, dividerHeight, parent);
    const right = left ? this.host.addSprite(`${name}R`, 'ui/common/ai/footer_divider_right/spriteFrame', x, y, dividerWidth, dividerHeight, parent) : null;
    if (left && !right) {
      left.node.destroy();
    }
  }
}

function flatItems(groups: ItemTypeBagGroupVO[]): BagItemEntryVO[] {
  return groups.flatMap((group) => group.items);
}

function safeNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
}

function formatCompact(value: number): string {
  const safe = Math.max(0, Math.trunc(value));
  if (safe >= 1_000_000) {
    return `${Math.floor(safe / 100_000) / 10}M`;
  }
  if (safe >= 10_000) {
    return `${Math.floor(safe / 100) / 10}K`;
  }
  return safe.toLocaleString('en-US');
}

function formatMoney(value: unknown): string {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) {
    return '0';
  }
  return numberValue.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function itemTypeLabel(itemType: string): string {
  const key = (itemType || '').toUpperCase();
  if (key === 'GACHA_TICKET') {
    return '召唤券';
  }
  if (key === 'HERO_FRAGMENT') {
    return '英雄碎片';
  }
  if (key === 'CURRENCY_BOX') {
    return '资源箱';
  }
  if (key === 'MATERIAL') {
    return '材料';
  }
  if (key === 'EQUIPMENT') {
    return '装备';
  }
  if (key === 'CONSUMABLE') {
    return '消耗品';
  }
  return safeText(itemType || '道具');
}

interface PhoneDialogRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 手机全屏弹窗区域(相对背包场景中心):四周贴舞台留窄边距。
function resolvePhoneDialogRect(layout: UiLayout, centerX: number, centerY: number): PhoneDialogRect {
  const marginX = 16;
  const marginY = 12;
  const left = layout.stageLeft + marginX - centerX;
  const right = layout.stageRight - marginX - centerX;
  const top = layout.stageTop - marginY - centerY;
  const bottom = layout.stageBottom + marginY - centerY;
  return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: top - bottom };
}
