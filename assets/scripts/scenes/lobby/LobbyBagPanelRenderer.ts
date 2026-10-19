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
} from 'cc';
import { equipIconAssetByCode } from './EquipIconAssets';
import { parseGemCode } from './EquipDetailCard';
import type { BagItemEntryVO, ItemTypeBagGroupVO, LobbyBagPanelState } from '../../types/BagTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { mountRefButton, mountRefDialogBackdrop, mountRefHeaderBand, mountRefOrnateDialog, mountRefSliced, mountRefTitledPanel, raiseRefFrame, REF_CLOSE_ASSET, REF_CLOSE_RING_ASSET, REF_DETAIL_INNER_BG, REF_DETAIL_SLOT_FRAME_ASSET, REF_HALL_BG, REF_ICON_RING_ASSET, REF_KIT, REF_ROW, REF_ROW_SELECTED, REF_SECTION_EMBLEM } from '../UiRefKit';

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
  // 矿晶(P金-1c,docs/27):暂用宝石图标,正式图标待出(遗留项)。
  SACRED_CRYSTAL: 'ui/common/ai/ic_diamond_gem/spriteFrame',
  LOW_ENHANCE_STONE: 'ui/bag/ai/icon_enhance_low/spriteFrame',
  HIGH_ENHANCE_STONE: 'ui/bag/ai/icon_enhance_high/spriteFrame',
  // 强化道具精确映射(否则会掉进 includes('ENHANCE') 分支错拿强化石图):
  ENHANCE_STONE: 'ui/bag/ai/icon_enhance_low/spriteFrame',
  ENHANCE_STONE_HIGH: 'ui/bag/ai/icon_enhance_high/spriteFrame',
  ENHANCE_BLESS_STONE: 'ui/forge/ai/icon_bless_stone/spriteFrame',
  ENHANCE_GUARD_RUNE: 'ui/forge/ai/icon_guard_rune/spriteFrame',
  // P5 宝石图标按类型(血玉=红t5/锋晶=橙t4/铁髓=蓝t2,同类型各阶共用一图;阶看名称与稀有度框色)。
  GEM_HP_1: 'ui/equip/gem_t5/spriteFrame',
  GEM_HP_2: 'ui/equip/gem_t5/spriteFrame',
  GEM_HP_3: 'ui/equip/gem_t5/spriteFrame',
  GEM_HP_4: 'ui/equip/gem_t5/spriteFrame',
  GEM_HP_5: 'ui/equip/gem_t5/spriteFrame',
  GEM_ATK_1: 'ui/equip/gem_t4/spriteFrame',
  GEM_ATK_2: 'ui/equip/gem_t4/spriteFrame',
  GEM_ATK_3: 'ui/equip/gem_t4/spriteFrame',
  GEM_ATK_4: 'ui/equip/gem_t4/spriteFrame',
  GEM_ATK_5: 'ui/equip/gem_t4/spriteFrame',
  GEM_DEF_1: 'ui/equip/gem_t2/spriteFrame',
  GEM_DEF_2: 'ui/equip/gem_t2/spriteFrame',
  GEM_DEF_3: 'ui/equip/gem_t2/spriteFrame',
  GEM_DEF_4: 'ui/equip/gem_t2/spriteFrame',
  GEM_DEF_5: 'ui/equip/gem_t2/spriteFrame',
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

  /** 道具卖光后关掉详情弹窗(否则会回落显示列表第一件)。 */
  closeDetailPopup(): void {
    this.detailPopupOpen = false;
  }

  constructor(private readonly host: LobbyBagPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyBagState();
    const scale = Math.max(0.64, Math.min(1, layout.uiScale));
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
    this.host.addSprite('LobbyBagSceneBackdrop', REF_HALL_BG.path, 0, 0, bgW, bgW / REF_HALL_BG.ratio, panel)
      ?? this.host.addSprite('LobbyBagSceneBackdrop', 'ui/battle/ai/battle_bg_cathedral/spriteFrame', 0, 0, panelWidth, panelHeight, panel);
    const shade = this.host.addChildPlainNode(panel, 'LobbyBagSceneShade', 0, 0, panelWidth, panelHeight);
    const shadeGraphics = shade.addComponent(Graphics);
    // 2026-10-19 用户「背景太显眼,字和物品没有主次」:压暗加重(84 → 128),面板后再加一层暗底
    shadeGraphics.fillColor = rgba(4, 3, 6, 128);
    shadeGraphics.rect(-coverW / 2, -coverH / 2, coverW, coverH);
    shadeGraphics.fill();
    // 顶部装饰(横梁/副标题/chips)移除:左上标题+顶部货币展示+右上关闭。
    this.renderBagCurrencyBar(panel, panelWidth, panelHeight, scale);
    this.renderBagBody(panel, panelWidth, panelHeight, scale, state);
    const renderBackButton = (): void => {
      renderSceneBackButton(this.host, panelGroup, layout, 'LobbyBagBackButton', () => {
        this.detailPopupOpen = false;
        this.gridScrollY = null;
        this.host.closeLobbyBagPanel();
      }, scale, '背包');
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
    const groups = state.groups
      .map((group) => `${group.itemType}#${group.items.map((item) => `${item.itemCode}:${item.itemCount}:${item.rarity ?? ''}`).join(',')}`)
      .join('|');
    return `${this.selectedGroupKey}|${flags}|${wallet}|${state.selectedItemCode ?? ''}|${popup}|${composeSig}|${composeResultSig}|${sellSig}|${groups}`;
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
  private renderGroupRail(parent: Node, groups: ItemTypeBagGroupVO[], x: number, y: number, width: number, height: number, scale: number): void {
    const rail = mountRefTitledPanel(this.host, parent, 'LobbyBagGroupRail', x, y, width, height, scale, '', { fill: rgba(10, 8, 8, 232) }).node;

    const totalCount = groups.reduce((sum, group) => sum + group.items.reduce((inner, item) => inner + safeNumber(item.itemCount), 0), 0);
    const rowWidth = width - 30 * scale;
    const railTopInset = 16 * scale;
    const railBottomInset = 14 * scale;
    const availableHeight = height - railTopInset - railBottomInset;
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

  private renderItemGrid(parent: Node, items: BagItemEntryVO[], selectedItem: BagItemEntryVO, x: number, y: number, width: number, height: number, scale: number, totalItems: number, state: LobbyBagPanelState): void {
    // 2026-10-17 界面统一(GPT 原型):细金框面板 + 暗红标题带(徽记 + 当前分类名),容量签放在标题带右端。
    const panelInfo = mountRefTitledPanel(this.host, parent, 'LobbyBagItemGrid', x, y, width, height, scale, this.selectedGroupTitle(state.groups), { center: false, bandH: 52 * scale, fill: rgba(10, 8, 8, 232) });
    const grid = panelInfo.node;
    const capWidth = 196 * scale;
    const capHeight = 38 * scale;
    const capX = width / 2 - 44 * scale - capWidth / 2;
    const capNode = this.host.addChildPlainNode(grid, 'LobbyBagCapacity', capX, panelInfo.bandY, capWidth, capHeight);
    mountRefSliced(this.host, capNode, 'Art', REF_KIT.statBar, 0, 0, capWidth, capHeight);
    const capLabel = this.host.addChildLabel(capNode, 'LobbyBagCapacityLabel', `容量 ${items.length}/${totalItems}`, 0, 0, 18 * scale, rgba(240, 214, 156), new Size(capWidth - 40 * scale, 24 * scale));
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
      const bar = this.host.addChildPlainNode(grid, 'LobbyBagItemGridScrollBar', barX, viewport.position.y, barWidth, trackHeight);
      const barGraphics = bar.addComponent(Graphics);
      const drawBar = (): void => {
        const offset = Math.min(maxOffset, Math.max(0, content.position.y - contentBaseY));
        const thumbTop = trackHeight / 2 - (trackHeight - thumbHeight) * (offset / maxOffset);
        barGraphics.clear();
        barGraphics.fillColor = rgba(60, 50, 38, 150);
        barGraphics.roundRect(-barWidth / 2, -trackHeight / 2, barWidth, trackHeight, barWidth / 2);
        barGraphics.fill();
        barGraphics.fillColor = rgba(214, 176, 104, 220);
        barGraphics.roundRect(-barWidth / 2, thumbTop - thumbHeight, barWidth, thumbHeight, barWidth / 2);
        barGraphics.fill();
      };
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

    if (!this.host.addSprite('LobbyBagItemSlotArt', BAG_AI_SLOT_BASE_ASSET, 0, 0, size, size, card)) {
      const graphics = card.addComponent(Graphics);
      graphics.fillColor = rgba(9, 9, 12, 208);
      graphics.roundRect(-size / 2, -size / 2, size, size, 5 * scale);
      graphics.fill();
    }
    const customIcon = bagItemIconAsset(item);
    let customIconShown = false;
    if (customIcon) {
      // C 组道具图与装备真图(v2)均为自带暗渐晕底的不透明方图,统一直出;加载失败回退类型图标。
      const iconW = size * 0.84;
      customIconShown = !!this.host.addSprite('LobbyBagItemIcon', customIcon, 0, 0, iconW, iconW, card);
    }
    if (!customIconShown) {
      this.host.addSprite('LobbyBagItemTypeIcon', bagItemTypeIconAsset(item.itemType), 0, 0, size * 0.66, size * 0.66, card);
    }
    this.addCleanSlotFrame(card, 'LobbyBagItemRarityFrame', 0, 0, size, scale, item.rarity);
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
  private renderDetailActions(detail: Node, item: BagItemEntryVO, state: LobbyBagPanelState, scale: number, buttonWidth: number, buttonHeight: number, slots: Array<[number, number]>): void {
    // 使用(2026-07-24 开放):金币/钻石/体力/固定礼包/随机箱可直接用;经验书走英雄页,虚拟条目(装备/碎片)不可用。
    const usableEffects = ['ADD_GOLD', 'ADD_DIAMOND', 'ADD_STAMINA', 'RANDOM_REWARD', 'FIXED_REWARD'];
    const isVirtualEntry = (item.itemCode || '').includes(':');
    const canUse = !isVirtualEntry && usableEffects.includes((item.useEffectType || '').toUpperCase()) && safeNumber(item.itemCount) > 0;
    const useButton = this.addDetailActionButton(detail, 'LobbyBagUseButton', '使用', BAG_AI_OP_ICON_USE_ASSET, slots[0][0], slots[0][1], buttonWidth, buttonHeight, scale, canUse);
    if (canUse) {
      useButton.on(Button.EventType.CLICK, () => this.host.useLobbyBagItem(item.itemCode), this);
    }
    // 合成(固定规则镜像,与服务器 COMPOSE_RULES 对齐):强化石x10→高阶x1 / 旧低阶石1:1并入。
    const composeRules: Record<string, number> = {
      ENHANCE_STONE: 10,
      LOW_ENHANCE_STONE: 1,
      GEM_HP_1: 3, GEM_HP_2: 3, GEM_HP_3: 3, GEM_HP_4: 3,
      GEM_ATK_1: 3, GEM_ATK_2: 3, GEM_ATK_3: 3, GEM_ATK_4: 3,
      GEM_DEF_1: 3, GEM_DEF_2: 3, GEM_DEF_3: 3, GEM_DEF_4: 3,
    };
    const composeNeed = composeRules[(item.itemCode || '').toUpperCase()];
    const canCompose = composeNeed != null && safeNumber(item.itemCount) >= composeNeed;
    const composeButton = this.addDetailActionButton(detail, 'LobbyBagComposeButton', '合成', BAG_AI_OP_ICON_FORGE_ASSET, slots[1][0], slots[1][1], buttonWidth, buttonHeight, scale, canCompose);
    if (canCompose) {
      composeButton.on(Button.EventType.CLICK, () => this.host.openLobbyBagComposeDialog(item.itemCode), this);
    }
    const sourceButton = this.addDetailActionButton(detail, 'LobbyBagSourceButton', state.sourceLoading ? '读取中' : '来源', BAG_AI_OP_ICON_SOURCE_ASSET, slots[2][0], slots[2][1], buttonWidth, buttonHeight, scale, !state.sourceLoading);
    sourceButton.on(Button.EventType.CLICK, () => this.host.reloadLobbyBagItemSource(item.itemCode), this);
    const sellable = !isVirtualEntry && safeNumber(item.sellGold) > 0 && safeNumber(item.itemCount) > 0;
    const sellButton = this.addDetailActionButton(detail, 'LobbyBagSellButton', sellable ? '出售' : '不可出售', BAG_AI_OP_ICON_GOLD_ASSET, slots[3][0], slots[3][1], buttonWidth, buttonHeight, scale, sellable, true);
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
  }

  // 手机全屏详情(2026-10-19 按 GPT 原型 1:1):原型 1870×841,弹窗 x 284..1586(宽 1302)、y 52..785(高 733);
  // 所有元素按原型像素 × u 摆放;内部垫实景底图;左列 大格(380..693 × 169..434)+ 名 + 稀有度签 + 四行信息(y 537..755);
  // 右列 用途面板(772..1553 × 161..350)+ 获取途径面板(y 376..630)+ 四钮(y 678..755)。
  private renderDetailPopupPhone(parent: Node, item: BagItemEntryVO, rect: PhoneDialogRect, panelWidth: number, panelHeight: number, scale: number, state: LobbyBagPanelState): void {
    const PW = 1302;
    const PH = 733;
    let width = Math.min(rect.width, panelWidth * (PW / 1870));
    let height = width * (PH / PW);
    if (height > rect.height) {
      height = rect.height;
      width = height * (PW / PH);
    }
    const u = width / PW;
    const X = (px: number): number => (px - 284 - PW / 2) * u;
    const Y = (py: number): number => (PH / 2 - (py - 52)) * u;
    const S = (v: number): number => v * u;
    const tight = (label: Label): Label => {
      label.lineHeight = label.fontSize;
      return label;
    };
    const dim = this.host.addChildPlainNode(parent, 'LobbyBagDetailPopupDim', 0, 0, panelWidth, panelHeight);
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 180);
    dimGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const shell = mountRefOrnateDialog(this.host, parent, 'LobbyBagItemDetail', 0, 0, width, height, scale, rgba(10, 8, 9, 212));
    const detail = shell.node;
    detail.addComponent(BlockInputEvents);
    mountRefDialogBackdrop(this.host, detail, REF_DETAIL_INNER_BG, 0, Y((126 + 780) / 2), width - S(14), S(780 - 126), 60);
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
    // 标题带 y 66..123,标题 (935, 94) 字高 40;关闭 (1555, 92) 径 72
    const bandH = S(57);
    const headY = Y(94.5);
    mountRefHeaderBand(this.host, detail, 'LobbyBagDetailBand', 0, headY, width - S(14), bandH, scale);
    raiseRefFrame(detail);
    const titleSize = S(40);
    const titleText = '物品详情';
    const titleW = titleText.length * titleSize;
    const emblemH = S(44);
    const emblemW = emblemH / REF_SECTION_EMBLEM.aspect;
    this.host.addSprite('LobbyBagDetailEmblem', REF_SECTION_EMBLEM.path, X(935) - titleW / 2 - S(18) - emblemW / 2, headY, emblemW, emblemH, detail);
    const title = tight(this.host.addChildLabel(detail, 'LobbyBagDetailTitle', titleText, X(935), headY, titleSize, rgba(255, 228, 156), new Size(titleW + S(20), titleSize * 1.3)));
    title.isBold = true;
    this.applyOutline(title, scale, true);
    const closeSize = S(72);
    const closeButton = this.host.addChildPlainNode(detail, 'LobbyBagDetailCloseButton', X(1555), Y(92), closeSize + S(10), closeSize + S(10));
    if (!this.host.addSprite('LobbyBagDetailCloseArt', REF_CLOSE_RING_ASSET, 0, 0, closeSize, closeSize, closeButton)) {
      this.host.addSprite('LobbyBagDetailCloseArt', REF_CLOSE_ASSET, 0, 0, closeSize, closeSize, closeButton);
    }
    closeButton.addComponent(Button);
    this.host.applyImageButtonFeedback(closeButton, 1.08, 0.92);
    closeButton.on(Button.EventType.CLICK, closePopup, this);

    // ── 左列:大格 380..693 × 169..434(心 (536, 301) 边 313) ──
    const slot = S(313);
    const slotCx = X(536.5);
    const slotCy = Y(301.5);
    const rarity = this.rarityColor(item.rarity);
    if (!this.host.addSprite('LobbyBagDetailSlotArt', REF_DETAIL_SLOT_FRAME_ASSET, slotCx, slotCy, slot, slot, detail)) {
      this.host.addSprite('LobbyBagDetailSlotArt', BAG_AI_SLOT_BASE_ASSET, slotCx, slotCy, slot, slot, detail);
    }
    const popupIcon = bagItemIconAsset(item);
    if (popupIcon) {
      this.host.addSprite('LobbyBagDetailIcon', popupIcon, slotCx, slotCy, slot * 0.76, slot * 0.76, detail);
    } else {
      this.host.addSprite('LobbyBagDetailTypeIcon', bagItemTypeIconAsset(item.itemType), slotCx, slotCy, slot * 0.6, slot * 0.6, detail);
    }
    // 左上角稀有度字母 (437, 205) 字高 44
    const rarityTag = tight(this.host.addChildLabel(detail, 'LobbyBagDetailRarityLetter', safeText(item.rarity || 'N'), X(420), Y(205), S(44), rarity, new Size(S(70), S(52)), HorizontalTextAlignment.LEFT));
    rarityTag.isBold = true;
    this.applyOutline(rarityTag, scale, true);
    // 名 (536, 474) 字高 44;签 (536, 518) 高 32
    const nameLabel = tight(this.host.addChildLabel(detail, 'LobbyBagDetailName', safeText(item.itemName), X(536), Y(474), S(44), rgba(255, 232, 170), new Size(S(430), S(54))));
    nameLabel.overflow = Label.Overflow.SHRINK;
    nameLabel.isBold = true;
    this.applyOutline(nameLabel, scale, true);
    const chipText = `${safeText(item.rarity || 'N')} · ${itemTypeLabel(item.itemType)}`;
    const chipW = S(chipText.length * 22 + 50);
    const chipH = S(32);
    const chip = this.host.addChildPlainNode(detail, 'LobbyBagDetailSubtitleChip', X(536), Y(518), chipW, chipH);
    const cg = chip.addComponent(Graphics);
    cg.fillColor = rgba(Math.round(rarity.r * 0.2), Math.round(rarity.g * 0.2), Math.round(rarity.b * 0.2), 230);
    cg.roundRect(-chipW / 2, -chipH / 2, chipW, chipH, chipH / 2);
    cg.fill();
    cg.strokeColor = rgba(rarity.r, rarity.g, rarity.b, 220);
    cg.lineWidth = Math.max(1, 1.4 * scale);
    cg.roundRect(-chipW / 2, -chipH / 2, chipW, chipH, chipH / 2);
    cg.stroke();
    tight(this.host.addChildLabel(chip, 'LobbyBagDetailSubtitle', chipText, 0, 0, S(22), rarity, new Size(chipW - S(10), chipH)));
    // 信息块:金框 330..745 × 537..755;四行心 y 572 / 622 / 672 / 722(行高 50);图标 (362) 径 28;名 (392);值右对齐 (727)
    const infoW = S(745 - 330);
    const infoH = S(755 - 537);
    const infoCx = X((330 + 745) / 2);
    const infoBox = mountRefTitledPanel(this.host, detail, 'LobbyBagDetailInfoBox', infoCx, Y((537 + 755) / 2), infoW, infoH, scale, '', { fill: rgba(8, 6, 8, 190) }).node;
    const infoRows: Array<[string, string, string, boolean]> = [
      ['拥有数量', formatCompact(safeNumber(item.itemCount)), 'ui/common/ref/ic_owned/spriteFrame', true],
      ['堆叠', formatCompact(safeNumber(item.maxStack)), 'ui/common/ref/ic_stack/spriteFrame', false],
      ['出售价', safeNumber(item.sellGold) > 0 ? `${formatMoney(item.sellGold)} 金币` : '不可出售', 'ui/common/ref/ic_price/spriteFrame', false],
      ['过期', item.expireTime ? safeText(String(item.expireTime)) : '永久', 'ui/common/ref/ic_expire/spriteFrame', false],
    ];
    const lines = this.host.addChildPlainNode(infoBox, 'Lines', 0, 0, infoW, infoH).addComponent(Graphics);
    lines.strokeColor = rgba(214, 170, 92, 110);
    lines.lineWidth = Math.max(1, 1.2 * scale);
    infoRows.forEach(([rowTitle, rowValue, icon, strong], index) => {
      const cy = Y(572 + index * 50) - Y((537 + 755) / 2);
      if (index > 0) {
        lines.moveTo(-infoW / 2 + S(14), cy + S(25));
        lines.lineTo(infoW / 2 - S(14), cy + S(25));
        lines.stroke();
      }
      this.host.addSprite(`Ic_${index}`, icon, -infoW / 2 + S(32), cy, S(30), S(30), infoBox);
      tight(this.host.addChildLabel(infoBox, `Title_${index}`, rowTitle, -infoW / 2 + S(62), cy, S(24), rgba(240, 226, 200), new Size(S(180), S(32)), HorizontalTextAlignment.LEFT));
      const valueLabel = tight(this.host.addChildLabel(infoBox, `Value_${index}`, rowValue, infoW / 2 - S(18), cy, S(strong ? 36 : 26), strong ? rgba(255, 222, 130) : rgba(244, 234, 212), new Size(S(220), S(44)), HorizontalTextAlignment.RIGHT));
      valueLabel.overflow = Label.Overflow.SHRINK;
      valueLabel.isBold = strong;
      this.applyOutline(valueLabel, scale, strong);
    });

    // ── 右列:用途面板 772..1553 × 161..350(带 y 161..210);获取途径面板 y 376..630(带 376..427);按钮 y 678..755 ──
    const rightW = S(1553 - 772);
    const rightCx = X((772 + 1553) / 2);
    const usePanel = mountRefTitledPanel(this.host, detail, 'LobbyBagDetailUsePanel', rightCx, Y((161 + 350) / 2), rightW, S(350 - 161), scale, '用途', { bandH: S(49), fontSize: S(28), center: false, fill: rgba(8, 6, 8, 170) });
    const useText = this.host.addChildLabel(usePanel.node, 'LobbyBagDetailUseValue', safeText(item.useDesc || item.useEffectType || '仅展示'), -rightW / 2 + S(40), Y(280) - Y((161 + 350) / 2), S(26), rgba(246, 236, 214), new Size(rightW - S(80), S(110)), HorizontalTextAlignment.LEFT);
    useText.enableWrapText = true;
    useText.lineHeight = S(36);
    useText.overflow = Label.Overflow.SHRINK;
    const srcPanel = mountRefTitledPanel(this.host, detail, 'LobbyBagDetailSourcePanel', rightCx, Y((376 + 630) / 2), rightW, S(630 - 376), scale, '获取途径', { bandH: S(51), fontSize: S(28), center: false, fill: rgba(8, 6, 8, 170) });
    // 来源行:800..1528 × 高 80;行心 y 483 / 578;图环 (850) 径 70;文字 (915) 字高 26;箭头环 (1485) 径 52
    const segments = this.resolveSourceSegments(item, state, 34);
    const visibleSegments = segments.slice(0, 2);
    if (segments.length > 2) {
      visibleSegments[1] = `${visibleSegments[1]}…`;
    }
    const srcRowW = S(1528 - 800);
    const srcRowH = S(80);
    visibleSegments.forEach((segment, index) => {
      const cy = Y(483 + index * 95) - Y((376 + 630) / 2);
      const rowNode = this.host.addChildPlainNode(srcPanel.node, `LobbyBagSourceRowPlate_${index}`, X((800 + 1528) / 2) - rightCx, cy, srcRowW, srcRowH);
      if (!mountRefSliced(this.host, rowNode, 'Bg', REF_ROW, 0, 0, srcRowW, srcRowH)) {
        const rowGraphics = rowNode.addComponent(Graphics);
        rowGraphics.fillColor = rgba(26, 21, 17, 224);
        rowGraphics.roundRect(-srcRowW / 2, -srcRowH / 2, srcRowW, srcRowH, 6 * scale);
        rowGraphics.fill();
      }
      const ring = S(70);
      const ringX = -srcRowW / 2 + S(50);
      this.host.addSprite('Ring', REF_ICON_RING_ASSET, ringX, 0, ring, ring, rowNode);
      this.host.addSprite('Ic', BAG_AI_OP_ICON_SOURCE_ASSET, ringX, 0, ring * 0.56, ring * 0.56, rowNode);
      const segLabel = tight(this.host.addChildLabel(rowNode, `LobbyBagSourceDesc_${index}`, segment, -srcRowW / 2 + S(115), 0, S(26), rgba(246, 236, 214), new Size(S(540), S(34)), HorizontalTextAlignment.LEFT));
      segLabel.overflow = Label.Overflow.SHRINK;
      const arrowRing = S(52);
      const arrowX = srcRowW / 2 - S(43);
      this.host.addSprite('ArrowRing', REF_ICON_RING_ASSET, arrowX, 0, arrowRing, arrowRing, rowNode);
      const arrow = tight(this.host.addChildLabel(rowNode, 'Arrow', '›', arrowX + S(2), S(3), S(34), rgba(255, 222, 130), new Size(arrowRing, arrowRing)));
      arrow.isBold = true;
    });
    // 四钮:心 x 865 / 1068 / 1258 / 1468,y 717,宽 170 高 72
    const buttonW = S(170);
    const buttonH = S(72);
    this.renderDetailActions(detail, item, state, scale, buttonW, buttonH, [865, 1068, 1258, 1468].map((px) => [X(px), Y(717)] as [number, number]));
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
      this.host.addSprite(`LobbyBagShowcaseSlot_${index}`, BAG_AI_SLOT_BASE_ASSET, cellX, cellY, cellSize, cellSize, card);
      const icon = bagItemIconAsset(cell.item);
      if (icon) {
        this.host.addSprite(`LobbyBagShowcaseIcon_${index}`, icon, cellX, cellY, cellSize * 0.86, cellSize * 0.86, card);
      } else {
        this.host.addSprite(`LobbyBagShowcaseTypeIcon_${index}`, bagItemTypeIconAsset(cell.item.itemType), cellX, cellY, cellSize * 0.68, cellSize * 0.68, card);
      }
      this.addCleanSlotFrame(card, `LobbyBagShowcaseFrame_${index}`, cellX, cellY, cellSize, scale * 1.3, cell.item.rarity);
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
      GEM_HP_1: { need: 3, target: 'GEM_HP_2', targetLabel: '血玉·Ⅱ' },
      GEM_HP_2: { need: 3, target: 'GEM_HP_3', targetLabel: '血玉·Ⅲ' },
      GEM_HP_3: { need: 3, target: 'GEM_HP_4', targetLabel: '血玉·Ⅳ' },
      GEM_HP_4: { need: 3, target: 'GEM_HP_5', targetLabel: '血玉·Ⅴ' },
      GEM_ATK_1: { need: 3, target: 'GEM_ATK_2', targetLabel: '锋晶·Ⅱ' },
      GEM_ATK_2: { need: 3, target: 'GEM_ATK_3', targetLabel: '锋晶·Ⅲ' },
      GEM_ATK_3: { need: 3, target: 'GEM_ATK_4', targetLabel: '锋晶·Ⅳ' },
      GEM_ATK_4: { need: 3, target: 'GEM_ATK_5', targetLabel: '锋晶·Ⅴ' },
      GEM_DEF_1: { need: 3, target: 'GEM_DEF_2', targetLabel: '铁髓·Ⅱ' },
      GEM_DEF_2: { need: 3, target: 'GEM_DEF_3', targetLabel: '铁髓·Ⅲ' },
      GEM_DEF_3: { need: 3, target: 'GEM_DEF_4', targetLabel: '铁髓·Ⅳ' },
      GEM_DEF_4: { need: 3, target: 'GEM_DEF_5', targetLabel: '铁髓·Ⅴ' },
    };
    const rule = rules[(item.itemCode || '').toUpperCase()];
    if (!rule) {
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
    const phone = this.phoneDialogRect;
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

  // 出售确认弹窗(2026-09-25):单价 + 数量选择(−/＋/+10/最大)+ 获得金币 + 出售后剩余;确认才提交,出售不可撤销。
  private renderSellDialog(parent: Node, item: BagItemEntryVO, sellState: { itemCode: string | null; count: number; busy: boolean; error: string }, scale: number): void {
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
    const phone = this.phoneDialogRect;
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
      return ['来源读取失败,点击「来源」重试'];
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
    return ['点击「来源」读取获取途径'];
  }

  private addDetailActionButton(parent: Node, name: string, text: string, iconAsset: string, x: number, y: number, width: number, height: number, scale: number, enabled: boolean, primary = false): Node {
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
