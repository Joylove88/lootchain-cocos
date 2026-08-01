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
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import type { EquipmentItemVO } from '../../api/EquipmentApi';
import type { LobbyBagPanelState } from '../../types/BagTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';
import {
  describeEquipAttrs,
  equipQualityColor,
  equipQualityLabel,
  EQUIP_FUSE_BASE_CHANCE,
  EQUIP_FUSE_GOLD_COST,
  EQUIP_QUALITY_ORDER,
  HERO_EQUIP_SLOTS,
  LOBBY_HERO_DETAIL_BACKDROP_ASSET,
} from './LobbyHeroDetailPanelRenderer';
import { equipIconAssetByCode } from './EquipIconAssets';
import { parseGemCode, gemOpenSlots, gemUnsocketGold, gemIconAsset, GEM_TIER_QUALITY } from './EquipDetailCard';

// AI 素材钩子(生成后按路径导入,meta 改 sprite-frame 即自动换装;缺图时走 Graphics 兜底)。
export const FORGE_AI_BG_ASSET = 'ui/forge/ai/forge_bg/spriteFrame';
export const FORGE_AI_ANVIL_ASSET = 'ui/forge/ai/forge_anvil/spriteFrame';
export const FORGE_AI_FUSE_ALTAR_ASSET = 'ui/forge/ai/fuse_altar/spriteFrame';
export const FORGE_AI_SLOT_FRAME_ASSET = 'ui/forge/ai/slot_frame/spriteFrame';
export const FORGE_AI_TAB_ACTIVE_ASSET = 'ui/forge/ai/tab_active/spriteFrame';
export const FORGE_AI_TAB_NORMAL_ASSET = 'ui/forge/ai/tab_normal/spriteFrame';
export const FORGE_AI_BUTTON_ASSET = 'ui/forge/ai/btn_forge/spriteFrame';
// 部位小图标(装备行/槽位用;生成后导入即换装,缺图走 Graphics 线稿兜底)。
export const FORGE_AI_SLOT_ICON_ASSETS: Record<string, string> = {
  WEAPON: 'ui/forge/ai/icon_weapon/spriteFrame',
  HELMET: 'ui/forge/ai/icon_helmet/spriteFrame',
  CHEST: 'ui/forge/ai/icon_chest/spriteFrame',
  BOOTS: 'ui/forge/ai/icon_boots/spriteFrame',
  RING: 'ui/forge/ai/icon_ring/spriteFrame',
  NECKLACE: 'ui/forge/ai/icon_necklace/spriteFrame',
};
// 强化页参考图新增素材钩子(待生成;缺图 Graphics 兜底)。
export const FORGE_AI_ENHANCE_RING_ASSET = 'ui/forge/ai/enhance_ring/spriteFrame';
export const FORGE_AI_GUARD_ICON_ASSET = 'ui/forge/ai/icon_guard_rune/spriteFrame';
// 雕花面板底(九宫格,meta 已配边距)与右下导航徽章。
const FORGE_AI_NAV_PREFIX = 'ui/forge/ai/nav_forge_';
// 白色渐变衬底(生成图,上暗下亮圆角):运行时按品质色染色,垫在装备图后(参考图卡面质感)。
// 现成素材复用:货币胶囊/道具图标(bag 套件)。
const BAG_CURRENCY_BAR_ASSET = 'ui/common/ai/bag_currency_bar/spriteFrame';
const BAG_ICON_GOLD_ASSET = 'ui/bag/ai/icon_gold/spriteFrame';
const BAG_ICON_DIAMOND_ASSET = 'ui/bag/ai/icon_diamond/spriteFrame';
const BAG_ICON_ENHANCE_STONE_ASSET = 'ui/bag/ai/icon_enhance_low/spriteFrame';
const BAG_ICON_ENHANCE_STONE_HIGH_ASSET = 'ui/bag/ai/icon_enhance_high/spriteFrame';
const FORGE_AI_BLESS_ICON_ASSET = 'ui/forge/ai/icon_bless_stone/spriteFrame';

/** 锻造页预载清单(登录时拉,进面板即整树一次成型;强化流光序列帧按需仍现拉)。 */
export const FORGE_PRELOAD_ASSETS: readonly string[] = [
  FORGE_AI_BG_ASSET,
  FORGE_AI_ANVIL_ASSET,
  FORGE_AI_FUSE_ALTAR_ASSET,
  FORGE_AI_SLOT_FRAME_ASSET,
  FORGE_AI_TAB_ACTIVE_ASSET,
  FORGE_AI_TAB_NORMAL_ASSET,
  FORGE_AI_BUTTON_ASSET,
  FORGE_AI_ENHANCE_RING_ASSET,
  FORGE_AI_GUARD_ICON_ASSET,
  FORGE_AI_BLESS_ICON_ASSET,
  ...Object.values(FORGE_AI_SLOT_ICON_ASSETS),
  `${FORGE_AI_NAV_PREFIX}enhance/spriteFrame`,
  `${FORGE_AI_NAV_PREFIX}fuse/spriteFrame`,
  `${FORGE_AI_NAV_PREFIX}decompose/spriteFrame`,
];
const STAR_FILLED_ASSET = 'ui/hero/c1812/star_filled/spriteFrame';
const STAR_EMPTY_ASSET = 'ui/hero/c1812/star_empty/spriteFrame';

// AI 图原始宽高比(2026-07-13 实测导入尺寸;一体构图素材只能等比显示,不许拉伸)。
const FORGE_BG_RATIO = 1672 / 941;
const FORGE_ANVIL_RATIO = 1920 / 1088;
const FORGE_ALTAR_RATIO = 1600 / 560;
const FORGE_TAB_RATIO = 1.875;
const FORGE_BUTTON_RATIO = 1983 / 793;

// 强化规则(与服务器 PlayerEquipmentServiceImpl 对齐):上限 +20;+1~+10 耗强化石×(等级+1),
// +11~+20 耗高阶强化石×(等级-9);成功率 +11 起每级 -2%(下限 10%)。改数值必须两端同步。
const ENHANCE_MAX_LEVEL = 20;
const ENHANCE_HIGH_FROM_LEVEL = 10;
const ENHANCE_CHANCES = [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1];

// 分解产出预估(与服务器 DECOMPOSE_BASE_STONES + 投入 50% 返还同公式;权威结果以服务器回执为准)。
const DECOMPOSE_BASE_STONES: Record<string, number> = { WHITE: 1, GREEN: 2, BLUE: 4, PURPLE: 8, GOLD: 16, RED: 32 };
// 分解附加产出估算区间(镜像服务端祝福石/护符概率;概览栏展示范围用。金币奖励已移除防通胀)。
const DECOMPOSE_BLESS_RANGE: Record<string, [number, number]> = { PURPLE: [0, 1], GOLD: [0, 2], RED: [2, 3] };
const DECOMPOSE_RUNE_RANGE: Record<string, [number, number]> = { GOLD: [0, 1], RED: [0, 2] };


type ForgeTab = 'enhance' | 'fuse' | 'decompose' | 'gem';

/** 锻造工坊宿主:装备缓存/强化/合成/分解状态与操作全部由 GameRoot 提供(服务器权威)。 */
export interface LobbyForgePanelHost {
  currentLobbyProfile(): PlayerLobbyProfileVO;
  currentLobbyBagState(): LobbyBagPanelState;
  currentLobbyHeroEquipState(): {
    dialogOpen: boolean;
    selectedSlot: string | null;
    items: EquipmentItemVO[];
    loading: boolean;
    busy: boolean;
  };
  currentLobbyEquipFuseState(): { dialogOpen: boolean; useLuckStone: boolean };
  currentLobbyEquipEnhanceState(): { targetId: number | null; useBless: boolean; useGuard: boolean };
  currentLobbyForgeState(): {
    tab: ForgeTab;
    enhanceSlotId: number | null;
    enhanceSlotTab: string | null;
    enhanceRarity: string | null;
    enhanceFilterOpen: boolean;
    enhanceSortAsc: boolean;
    autoRepeat: boolean;
    fuseSlotIds: number[];
    fuseResult: { success: boolean; chance: number; item: EquipmentItemVO } | null;
    decomposeResult: { count: number; stonesGained: number; blessGained: number; runeGained: number; gemsGained: string[] } | null;
    rerollOpen: boolean;
    decomposeSelectedIds: number[];
    decomposeRarity: string | null;
    decomposeEnhance: 'all' | 'zero' | 'plus';
    decomposeBatchOpen: boolean;
    gemEquipId: number | null;
    gemPickSlot: number | null;
  };
  /** 关闭合成结果弹窗。 */
  clearLobbyForgeFuseResult(): void;
  clearLobbyForgeDecomposeResult(): void;
  openLobbyForgeRerollDialog(): void;
  closeLobbyForgeRerollDialog(): void;
  rerollLobbyForgeEquipment(equipmentId: number): void;
  selectLobbyForgeTab(tab: ForgeTab): void;
  selectLobbyForgeEnhanceSlot(equipmentId: number | null): void;
  // 强化页(参考图版):部位页签 / 稀有度筛选下拉 / 排序方向 / 连续强化勾选。
  setLobbyForgeEnhanceSlotTab(slot: string | null): void;
  setLobbyForgeEnhanceRarity(quality: string | null): void;
  toggleLobbyForgeEnhanceFilterMenu(): void;
  toggleLobbyForgeEnhanceSort(): void;
  toggleLobbyForgeAutoRepeat(): void;
  setLobbyForgeFuseSlots(equipmentIds: number[]): void;
  fuseLobbyForgeSelected(): void;
  toggleLobbyForgeDecomposeSelect(equipmentId: number): void;
  setLobbyForgeDecomposeRarity(quality: string | null): void;
  setLobbyForgeDecomposeEnhance(filter: 'all' | 'zero' | 'plus'): void;
  setLobbyForgeDecomposeBatchOpen(open: boolean): void;
  selectLobbyForgeGemEquip(equipmentId: number | null): void;
  setLobbyForgeGemPickSlot(slotIndex: number | null): void;
  socketLobbyForgeGem(equipmentId: number, slotIndex: number, gemCode: string): void;
  unsocketLobbyForgeGem(equipmentId: number, slotIndex: number): void;
  setLobbyForgeDecomposeSelection(equipmentIds: number[]): void;
  decomposeLobbyForgeSelected(): void;
  toggleLobbyEquipFuseLuckStone(): void;
  toggleLobbyEquipEnhanceBless(): void;
  toggleLobbyEquipEnhanceGuard(): void;
  enhanceLobbyEquipment(equipmentId: number): void;
  /** 自动强化:连续强化到失败/满级/材料不足(沿用当前祝福石/护符开关)。 */
  autoEnhanceLobbyEquipment(equipmentId: number): void;
  closeLobbyForgePanel(): void;
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

/**
 * 锻造工坊(导航栏"锻造"):强化/合成/分解三选项卡,默认强化。
 * 强化=左列选装备放入铸造台;合成=三槽一键放入;分解=背包式网格多选(稀有度/强化筛选,单次 ≤20 件)。
 * 全部写入走服务器装备接口,页面无 spine,状态变化整页重绘。
 */
export class LobbyForgePanelRenderer {
  // 强化页左列滚动位置:整页重绘后恢复,避免每次选装备列表跳回顶部。
  private enhanceListScrollY: number | null = null;

  constructor(private readonly host: LobbyForgePanelHost) {}

  render(layout: UiLayout): void {
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(320 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const group = this.host.createUiNode('LobbyForgeSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);

    const panel = this.host.addChildBeveledPanelNode(
      group,
      'LobbyForgeSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(5, 5, 8, 232),
      rgba(0, 0, 0, 0),
      18 * scale,
    );
    // 背景优先锻造专属 AI 图(等比 cover 裁切,不拉伸),未生成前回退英雄详情底图。
    const bgW = Math.max(panelWidth, panelHeight * FORGE_BG_RATIO);
    const bgH = bgW / FORGE_BG_RATIO;
    const bg = this.host.addSprite('LobbyForgeBackdropSprite', FORGE_AI_BG_ASSET, 0, 0, bgW, bgH, panel)
      ?? this.host.addSprite('LobbyForgeBackdropFallback', LOBBY_HERO_DETAIL_BACKDROP_ASSET, 0, 0, panelWidth, panelHeight, panel);
    if (bg) {
      // 轻压暗保留暖色炉火氛围(对齐参考图):整体薄罩 + 顶部/两侧暗角,中下部熔炉透光。
      const shadeNode = this.host.addChildPlainNode(panel, 'LobbyForgeBackdropShade', 0, 0, panelWidth, panelHeight);
      const shade = shadeNode.addComponent(Graphics);
      shade.fillColor = rgba(4, 3, 5, 96);
      shade.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
      shade.fill();
      shade.fillColor = rgba(0, 0, 0, 40);
      shade.rect(-panelWidth / 2, panelHeight / 4, panelWidth, panelHeight / 4);
      shade.fill();
      shade.rect(-panelWidth / 2, -panelHeight / 2, panelWidth / 5, panelHeight);
      shade.fill();
      shade.rect(panelWidth / 2 - panelWidth / 5, -panelHeight / 2, panelWidth / 5, panelHeight);
      shade.fill();
    }

    const forge = this.host.currentLobbyForgeState();
    const state = this.host.currentLobbyHeroEquipState();
    // 强化页(参考图版):顶部为货币胶囊栏(金币/钻石/强化石),材料展示在中央石台;合成/分解页保留材料持有栏。
    if (forge.tab === 'enhance') {
      this.renderCurrencyBar(panel, panelWidth, panelHeight, scale);
    } else {
      this.renderHoldingsBar(panel, panelWidth, panelHeight, scale);
    }
    // 顶部页签取消,改右下角圆形功能导航(参考图);合成/分解内容区在底部给导航条让位。
    const contentTop = panelHeight / 2 - (forge.tab === 'enhance' ? 104 : 140) * scale;
    const contentBottom = forge.tab === 'enhance' ? -panelHeight / 2 + 26 * scale : -panelHeight / 2 + 180 * scale;
    if (state.loading && state.items.length <= 0) {
      const loading = this.host.addChildLabel(panel, 'LobbyForgeLoading', '装备读取中…', 0, 0, 22 * scale, rgba(196, 182, 150), new Size(panelWidth - 80 * scale, 36 * scale));
      loading.overflow = Label.Overflow.SHRINK;
    } else if (state.items.length <= 0) {
      const empty = this.host.addChildLabel(panel, 'LobbyForgeEmpty', '暂无装备:主线首通与装备召唤均可获取。', 0, 0, 21 * scale, rgba(170, 156, 128), new Size(panelWidth - 80 * scale, 36 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    } else if (forge.tab === 'enhance') {
      this.renderEnhanceTab(panel, state, forge, panelWidth, panelHeight, contentTop, contentBottom, scale);
    } else if (forge.tab === 'fuse') {
      this.renderFuseTab(panel, state, forge, panelWidth, contentTop, contentBottom, scale);
    } else if (forge.tab === 'gem') {
      this.renderGemTab(panel, state, forge, panelWidth, contentTop, contentBottom, scale);
    } else {
      this.renderDecomposeTab(panel, state, forge, panelWidth, contentTop, contentBottom, scale);
    }
    this.renderForgeNav(panel, forge.tab, state.items, panelWidth, panelHeight, scale);

    renderSceneBackButton(this.host, group, layout, 'LobbyForgeBackButton', () => this.host.closeLobbyForgePanel(), scale, forge.tab === 'enhance' ? '强化' : forge.tab === 'fuse' ? '合成' : forge.tab === 'gem' ? '宝石' : '分解', '强化：消耗强化石与金币提升装备等级，+10 起改用高阶强化石，上限 +20；+5 起失败会降 1 级，守护符可保级，祝福石 +20% 成功率。\n\n合成：3 件同部位同稀有度装备合成 1 件更高稀有度装备。\n\n分解：拆解多余装备返还强化石（含部分强化投入），炽红装备附带宝石。\n\n宝石：按装备稀有度开孔（绿1~红5），第 i 孔镶 i 阶宝石；低阶宝石 3 合 1 升阶（背包 → 合成）。');

    if (forge.fuseResult) {
      this.renderFuseResultDialog(group, forge.fuseResult, panelWidth, panelHeight, scale);
    }
    if (forge.decomposeResult) {
      this.renderDecomposeResultDialog(group, forge.decomposeResult, panelWidth, panelHeight, scale);
    }
    if (forge.rerollOpen) {
      const rerollTarget = state.items.find((item) => item.id === forge.enhanceSlotId) ?? null;
      if (rerollTarget) {
        this.renderRerollDialog(group, rerollTarget, state.busy, panelWidth, panelHeight, scale);
      }
    }
  }

  // 词条洗练弹窗(P4):当前词条(档位色/特级★)+ 消耗(洗练石+金币,不足红字)+ 洗练/关闭;洗练后弹窗保持打开看新词条。
  private renderRerollDialog(parent: Node, item: EquipmentItemVO, busy: boolean, panelWidth: number, panelHeight: number, scale: number): void {
    const dim = this.host.addChildPlainNode(parent, 'ForgeRerollDim', 0, 0, panelWidth, panelHeight);
    const dg = dim.addComponent(Graphics);
    dg.fillColor = rgba(0, 0, 0, 190);
    dg.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dg.fill();
    dim.addComponent(BlockInputEvents);

    const affixes = item.specialAffixes ?? [];
    const dialogW = Math.min(500 * scale, panelWidth - 120 * scale);
    const dialogH = (300 + Math.max(1, affixes.length) * 34) * scale;
    const q = equipQualityColor(item.quality);
    const dialog = this.host.addChildBeveledPanelNode(dim, 'ForgeRerollDialog', 0, 0, dialogW, dialogH, rgba(12, 9, 8, 250), rgba(214, 168, 82, 235), 14 * scale);
    const title = this.host.addChildLabel(dialog, 'ForgeRerollTitle', '词条洗练', 0, dialogH / 2 - 38 * scale, 26 * scale, rgba(250, 216, 120), new Size(dialogW - 40 * scale, 36 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const nameRow = this.host.addChildLabel(dialog, 'ForgeRerollName', `${equipQualityLabel(item.quality)} · ${safeText(item.equipName)}${(item.enhanceLevel ?? 0) > 0 ? ` +${item.enhanceLevel}` : ''}`, 0, dialogH / 2 - 70 * scale, 20 * scale, rgba(q.r, q.g, q.b, 255), new Size(dialogW - 44 * scale, 26 * scale));
    nameRow.overflow = Label.Overflow.SHRINK;
    this.applyOutline(nameRow, scale, true);

    // 当前词条列表:档位色 = 数值区间(绿<蓝<紫<橙<炽红),特级词条 ★ 满亮。
    const tierColorMap: Record<string, { r: number; g: number; b: number }> = {
      GREEN: { r: 126, g: 214, b: 126 },
      BLUE: { r: 108, g: 168, b: 236 },
      PURPLE: { r: 186, g: 126, b: 236 },
      ORANGE: { r: 240, g: 168, b: 86 },
      CRIMSON: { r: 238, g: 92, b: 70 },
    };
    let cursor = dialogH / 2 - 108 * scale;
    if (affixes.length === 0) {
      const empty = this.host.addChildLabel(dialog, 'ForgeRerollEmpty', '词条生成中,重新打开面板刷新。', 0, cursor, 17 * scale, rgba(186, 170, 140), new Size(dialogW - 48 * scale, 22 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      cursor -= 34 * scale;
    }
    affixes.forEach((affix, index) => {
      const tc = tierColorMap[(affix.tier || '').toUpperCase()] ?? tierColorMap.GREEN;
      const rowW = dialogW - 76 * scale;
      const row = this.host.addChildPlainNode(dialog, `ForgeRerollAffix_${index}`, 0, cursor, rowW, 30 * scale);
      const rg = row.addComponent(Graphics);
      rg.fillColor = rgba(20, 17, 15, 220);
      rg.roundRect(-rowW / 2, -15 * scale, rowW, 30 * scale, 7 * scale);
      rg.fill();
      rg.strokeColor = rgba(tc.r, tc.g, tc.b, affix.special ? 245 : 165);
      rg.lineWidth = (affix.special ? 1.8 : 1.2) * scale;
      rg.stroke();
      const label = this.host.addChildLabel(row, 'Label', `${affix.special ? '★ ' : ''}${affix.name} +${affix.value}${affix.percent ? '%' : ''}`, -rowW / 2 + 14 * scale, 0, 18 * scale, rgba(tc.r, tc.g, tc.b, 255), new Size(rowW - 28 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
      cursor -= 34 * scale;
    });

    // 消耗:洗练石 ×1 + 金币(紫500/橙2000/红5000),不足红字禁点。
    const goldCost = ({ PURPLE: 500, GOLD: 2000, RED: 5000 } as Record<string, number>)[(item.quality || '').toUpperCase()] ?? 500;
    const bag = this.host.currentLobbyBagState();
    const stoneHeld = bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === 'EQUIP_REROLL_STONE')?.itemCount ?? 0;
    const goldHeld = Number(this.host.currentLobbyProfile().gold) || 0;
    const lack = stoneHeld < 1 || goldHeld < goldCost;
    cursor -= 6 * scale;
    const costRow = this.host.addChildLabel(dialog, 'ForgeRerollCost', `消耗：洗练石 1/${formatInteger(stoneHeld)} · 金币 ${formatInteger(goldCost)}${lack ? ' · 材料不足' : ''}`, 0, cursor, 17 * scale, lack ? rgba(236, 110, 88) : rgba(226, 208, 168), new Size(dialogW - 48 * scale, 22 * scale));
    costRow.overflow = Label.Overflow.SHRINK;
    const hint = this.host.addChildLabel(dialog, 'ForgeRerollHint', '整件重随全部词条；特级词条(连击/斩杀线等)橙装10%/红装20%概率。', 0, cursor - 24 * scale, 14 * scale, rgba(166, 152, 126), new Size(dialogW - 48 * scale, 18 * scale));
    hint.overflow = Label.Overflow.SHRINK;

    this.renderPrimaryButton(dialog, 'ForgeRerollGo', busy ? '洗练中…' : '洗 练', -dialogW / 4, -dialogH / 2 + 48 * scale, 180 * scale, scale, !busy && !lack, () => this.host.rerollLobbyForgeEquipment(item.id));
    this.renderPrimaryButton(dialog, 'ForgeRerollClose', '关 闭', dialogW / 4, -dialogH / 2 + 48 * scale, 180 * scale, scale, !busy, () => this.host.closeLobbyForgeRerollDialog());
  }

  // 结果弹窗确定钮:召唤界面同款 button_primary(原比 740:211,宽 250),缺图回退暗红程序钮。
  private renderResultConfirmButton(dialog: Node, name: string, y: number, scale: number, onClick: () => void): void {
    const width = 250 * scale;
    const height = width * (211 / 740);
    const button = this.host.addChildPlainNode(dialog, name, 0, y, width, height);
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(button, 1.035, 0.965);
    const art = this.host.addSprite(`${name}Art`, 'ui/common/ai/button_primary/spriteFrame', 0, 0, width, height, button);
    if (!art) {
      const graphics = button.addComponent(Graphics);
      graphics.fillColor = rgba(78, 14, 17, 232);
      graphics.roundRect(-width / 2, -height / 2, width, height, 9 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(226, 71, 52, 230);
      graphics.lineWidth = 1.8 * scale;
      graphics.stroke();
    }
    const label = this.host.addChildLabel(button, `${name}Label`, '确 定', 0, 1 * scale, 20 * scale, rgba(255, 240, 200), new Size(width - 60 * scale, height * 0.7));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
  }

  // 分解/合成结果弹窗通用框(2026-07-22):召唤结果同款 summon_result 整框(等比,标题写入顶部牌位),
  // 缺图回退雕花板;内容按框高比例排布,按钮不压说明行。
  private buildForgeResultFrame(parent: Node, name: string, title: string, titleColor: Color, panelWidth: number, panelHeight: number, scale: number): { dialog: Node; w: number; h: number } {
    const dim = this.host.addChildPlainNode(parent, `${name}Dim`, 0, 0, panelWidth, panelHeight);
    const dg = dim.addComponent(Graphics);
    dg.fillColor = rgba(0, 0, 0, 190);
    dg.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dg.fill();
    dim.addComponent(BlockInputEvents);
    const w = Math.min(820 * scale, panelWidth - 90 * scale);
    const h = w / (1672 / 941);
    const dialog = this.host.addChildPlainNode(dim, name, 0, 0, w, h);
    const g = dialog.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 9, 246);
    g.rect(-w * 0.47, -h * 0.44, w * 0.94, h * 0.88);
    g.fill();
    // 直接引素材路径,避免 lobby → gacha 配置模块依赖。
    const art = this.host.addSprite(`${name}Art`, 'ui/gacha/ai/summon_result/spriteFrame', 0, 0, w, h, dialog);
    if (!art) {
      g.strokeColor = rgba(214, 168, 82, 230);
      g.lineWidth = 2 * scale;
      g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
      g.stroke();
    }
    const titleLabel = this.host.addChildLabel(dialog, `${name}Title`, title, 0, h / 2 - h * 0.089, Math.max(20 * scale, h * 0.055), titleColor, new Size(w * 0.24, h * 0.08));
    titleLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(titleLabel, scale, true);
    return { dialog, w, h };
  }

  // 分解结果弹窗:本次获得强化石明细 + 已拥有数量 + 用途说明;确定关闭。
  private renderDecomposeResultDialog(parent: Node, result: { count: number; stonesGained: number; blessGained?: number; runeGained?: number; gemsGained?: string[] }, panelWidth: number, panelHeight: number, scale: number): void {
    const frame = this.buildForgeResultFrame(parent, 'ForgeDecResult', '分解成功！', rgba(250, 216, 120), panelWidth, panelHeight, scale);
    const dialog = frame.dialog;
    const w = frame.w;
    const h = frame.h;
    const subtitle = this.host.addChildLabel(dialog, 'ForgeDecResultSub', `分解 ${result.count} 件装备`, 0, h * 0.3, 19 * scale, rgba(196, 182, 152), new Size(w * 0.6, 26 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;

    // 获得物展示格:强化石 + 附加产出(金币/祝福石/护符)并排小格,格内底部名签 + 右下 ×N 角标。
    const gains: Array<{ key: string; icon: string; label: string; count: number; tint: { r: number; g: number; b: number } }> = [
      { key: 'stone', icon: 'ui/bag/ai/icon_enhance_low/spriteFrame', label: '强化石', count: result.stonesGained, tint: { r: 122, g: 176, b: 236 } },
    ];
    if ((result.blessGained ?? 0) > 0) {
      gains.push({ key: 'bless', icon: 'ui/forge/ai/icon_bless_stone/spriteFrame', label: '祝福石', count: result.blessGained ?? 0, tint: { r: 232, g: 110, b: 110 } });
    }
    if ((result.runeGained ?? 0) > 0) {
      gains.push({ key: 'rune', icon: 'ui/forge/ai/icon_guard_rune/spriteFrame', label: '护符', count: result.runeGained ?? 0, tint: { r: 214, g: 176, b: 100 } });
    }
    // P5:炽红装备分解附带宝石(按编码归组)。
    const gemCounts = new Map<string, number>();
    (result.gemsGained ?? []).forEach((code) => gemCounts.set(code, (gemCounts.get(code) ?? 0) + 1));
    gemCounts.forEach((count, code) => {
      const info = parseGemCode(code);
      if (!info) {
        return;
      }
      const tint = equipQualityColor(GEM_TIER_QUALITY[info.tier - 1] ?? 'GREEN');
      gains.push({ key: `gem_${code}`, icon: gemIconAsset(info.type), label: info.label, count, tint });
    });
    const cellSize = Math.min(gains.length > 1 ? 86 * scale : 96 * scale, h * 0.22);
    const cellGap = 16 * scale;
    const rowWidth = gains.length * cellSize + (gains.length - 1) * cellGap;
    gains.forEach((gain, index) => {
      const cx = -rowWidth / 2 + cellSize / 2 + index * (cellSize + cellGap);
      const cell = this.host.addChildPlainNode(dialog, `ForgeDecResultCell_${gain.key}`, cx, h * 0.075, cellSize, cellSize);
      const cg = cell.addComponent(Graphics);
      cg.fillColor = rgba(30, 26, 22, 245);
      cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
      cg.fill();
      cg.strokeColor = rgba(gain.tint.r, gain.tint.g, gain.tint.b, 235);
      cg.lineWidth = 2.2 * scale;
      cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
      cg.stroke();
      this.host.addSprite(`ForgeDecResultIcon_${gain.key}`, gain.icon, 0, 8 * scale, cellSize * 0.62, cellSize * 0.62, cell);
      const stripH = 18 * scale;
      const strip = this.host.addChildPlainNode(cell, 'ForgeDecResultCellStrip', 0, -cellSize / 2 + stripH / 2 + 3 * scale, cellSize - 6 * scale, stripH);
      const stripBg = strip.addComponent(Graphics);
      stripBg.fillColor = rgba(6, 5, 5, 205);
      stripBg.roundRect(-(cellSize - 6 * scale) / 2, -stripH / 2, cellSize - 6 * scale, stripH, 4 * scale);
      stripBg.fill();
      const stripName = this.host.addChildLabel(strip, 'ForgeDecResultCellName', gain.label, 0, 0, 13 * scale, rgba(gain.tint.r, gain.tint.g, gain.tint.b, 255), new Size(cellSize - 10 * scale, 18 * scale));
      stripName.overflow = Label.Overflow.SHRINK;
      const countBadge = this.host.addChildLabel(cell, 'ForgeDecResultCellCount', `×${formatInteger(gain.count)}`, cellSize / 2 - 6 * scale, cellSize / 2 - 12 * scale, 17 * scale, rgba(255, 236, 180), new Size(cellSize, 22 * scale), HorizontalTextAlignment.RIGHT);
      countBadge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(countBadge, scale, true);
    });

    const bag = this.host.currentLobbyBagState();
    const stoneOwned = bag.groups.flatMap((group) => group.items).find((item) => (item.itemCode || '').toUpperCase() === 'ENHANCE_STONE')?.itemCount ?? 0;
    const name = this.host.addChildLabel(dialog, 'ForgeDecResultName', `强化石 ×${result.stonesGained}`, 0, -h * 0.125, 20 * scale, rgba(150, 198, 255), new Size(w * 0.6, 30 * scale));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    const owned = this.host.addChildLabel(dialog, 'ForgeDecResultOwned', `已拥有：强化石 ×${stoneOwned}（含本次）`, 0, -h * 0.19, 17 * scale, rgba(250, 214, 128), new Size(w * 0.62, 24 * scale));
    owned.overflow = Label.Overflow.SHRINK;
    const note = this.host.addChildLabel(dialog, 'ForgeDecResultNote', '强化石用于装备强化（+1 至 +10），高阶强化另需高阶强化石。', 0, -h * 0.245, 15 * scale, rgba(178, 162, 132), new Size(w * 0.66, 22 * scale));
    note.overflow = Label.Overflow.SHRINK;
    this.renderResultConfirmButton(dialog, 'ForgeDecResultOk', -h / 2 + h * 0.16, scale, () => this.host.clearLobbyForgeDecomposeResult());
  }

  // 合成结果弹窗:成功展示新装备(图标/名称/属性),失败说明返还;确定关闭。
  private renderFuseResultDialog(parent: Node, result: { success: boolean; chance: number; item: EquipmentItemVO }, panelWidth: number, panelHeight: number, scale: number): void {
    const frame = this.buildForgeResultFrame(parent, 'ForgeFuseResult', result.success ? '合成成功！' : '合成失败', result.success ? rgba(250, 216, 120) : rgba(198, 188, 172), panelWidth, panelHeight, scale);
    const dialog = frame.dialog;
    const w = frame.w;
    const h = frame.h;
    const q = equipQualityColor(result.item.quality);
    const subtitle = this.host.addChildLabel(dialog, 'ForgeFuseResultSub', result.success ? `成功率 ${Math.round(result.chance * 100)}% · 获得新装备` : `成功率 ${Math.round(result.chance * 100)}% · 材料消耗,返还同档 1 件`, 0, h * 0.3, 19 * scale, rgba(196, 182, 152), new Size(w * 0.7, 26 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;

    // 新装备展示:大图标格 + 名称 + 属性。
    const cellSize = Math.min(100 * scale, h * 0.25);
    const cell = this.host.addChildPlainNode(dialog, 'ForgeFuseResultCell', 0, h * 0.075, cellSize, cellSize);
    const cg = cell.addComponent(Graphics);
    cg.fillColor = rgba(Math.round(q.r * 0.22 + 8), Math.round(q.g * 0.22 + 8), Math.round(q.b * 0.22 + 8), 245);
    cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
    cg.fill();
    cg.strokeColor = rgba(q.r, q.g, q.b, 240);
    cg.lineWidth = 2.4 * scale;
    cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
    cg.stroke();
    this.addEquipIcon(cell, 'ForgeFuseResultIcon', result.item.equipCode, result.item.slot, cellSize * 0.88, scale);
    // 结果弹窗装备格的流光同样按真实强化等级(合成产物为 +0,不再假借 +5 光效)。
    const name = this.host.addChildLabel(dialog, 'ForgeFuseResultName', `${equipQualityLabel(result.item.quality)} · ${safeText(result.item.equipName)}`, 0, -h * 0.125, 20 * scale, rgba(q.r, q.g, q.b, 255), new Size(w * 0.66, 30 * scale));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    const attrs = this.host.addChildLabel(dialog, 'ForgeFuseResultAttrs', describeEquipAttrs(result.item), 0, -h * 0.2, 17 * scale, rgba(206, 192, 158), new Size(w * 0.7, 26 * scale));
    attrs.overflow = Label.Overflow.SHRINK;

    this.renderResultConfirmButton(dialog, 'ForgeFuseResultOk', -h / 2 + h * 0.16, scale, () => this.host.clearLobbyForgeFuseResult());
  }

  // 顶部材料持有栏:金币 + 4 种锻造道具。
  private renderHoldingsBar(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const barW = Math.min(panelWidth - 56 * scale, 1080 * scale);
    const barH = 42 * scale;
    const bar = this.host.addChildPlainNode(parent, 'LobbyForgeHoldings', 0, panelHeight / 2 - 92 * scale, barW, barH);
    const g = bar.addComponent(Graphics);
    g.fillColor = rgba(12, 10, 10, 200);
    g.roundRect(-barW / 2, -barH / 2, barW, barH, 9 * scale);
    g.fill();
    g.strokeColor = rgba(140, 108, 62, 150);
    g.lineWidth = 1.4 * scale;
    g.stroke();
    const bag = this.host.currentLobbyBagState();
    const gold = Number(this.host.currentLobbyProfile().gold) || 0;
    const text = bag.loading && !bag.loaded
      ? `金币 ${formatInteger(gold)} · 锻造材料读取中…`
      : `金币 ${formatInteger(gold)} · 强化石 x${formatInteger(this.bagCount('ENHANCE_STONE'))} · 合成概率石 x${formatInteger(this.bagCount('FUSION_LUCK_STONE'))} · 祝福石 x${formatInteger(this.bagCount('ENHANCE_BLESS_STONE'))} · 护符 x${formatInteger(this.bagCount('ENHANCE_GUARD_RUNE'))}`;
    const label = this.host.addChildLabel(bar, 'LobbyForgeHoldingsText', text, 0, 0, 20 * scale, rgba(238, 212, 150), new Size(barW - 26 * scale, barH - 8 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private bagCount(itemCode: string): number {
    const bag = this.host.currentLobbyBagState();
    return bag.groups.flatMap((group) => group.items).find((item) => item.itemCode === itemCode)?.itemCount ?? 0;
  }

  // 顶部货币胶囊栏(强化页,参考图右上):金币 / 钻石 / 强化石,复用 bag 货币条与图标。
  private renderCurrencyBar(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const profile = this.host.currentLobbyProfile();
    renderTopCurrencyBar(this.host, parent, panelWidth / 2, panelHeight / 2, scale, [
      { key: 'gold', icon: BAG_ICON_GOLD_ASSET, value: formatInteger(Number(profile.gold) || 0) },
      { key: 'diamond', icon: BAG_ICON_DIAMOND_ASSET, value: formatInteger(Number(profile.diamond) || 0) },
      { key: 'stone', icon: BAG_ICON_ENHANCE_STONE_ASSET, value: formatInteger(this.bagCount('ENHANCE_STONE')) },
    ], 118);
  }

  // 右下功能导航(参考图):强化/合成/分解 圆形徽章 + 祝福占位;合成有可用组时亮红点。
  private renderForgeNav(parent: Node, active: ForgeTab, items: EquipmentItemVO[], panelWidth: number, panelHeight: number, scale: number): void {
    const fuseReady = this.collectFuseGroups(items).some((group) => group.items.length >= 3);
    const entries: { key: ForgeTab | 'bless'; label: string; dot: boolean }[] = [
      { key: 'enhance', label: '强化', dot: false },
      { key: 'fuse', label: '合成', dot: fuseReady },
      { key: 'decompose', label: '分解', dot: false },
      { key: 'gem', label: '宝石', dot: false },
      // 祝福:功能未开放,暂不进导航(素材就绪且玩法上线后再加回 { key: 'bless', label: '祝福' })。
    ];
    const size = 116 * scale;
    const gap = 6 * scale;
    const y = -panelHeight / 2 + 80 * scale;
    const startX = panelWidth / 2 - 40 * scale - size / 2 - (entries.length - 1) * (size + gap);
    entries.forEach((entry, index) => {
      const x = startX + index * (size + gap);
      const selected = entry.key === active;
      const disabled = entry.key === 'bless';
      const node = this.host.addChildPlainNode(parent, `ForgeNav_${entry.key}`, x, y, size, size + 26 * scale);
      // 徽章 AI 图优先(nav_forge_*,祝福未生成走兜底);选中金环 + 红点仍程序绘制。
      const badgeArt = this.host.addSprite(`ForgeNavArt_${entry.key}`, `${FORGE_AI_NAV_PREFIX}${entry.key}/spriteFrame`, 0, 10 * scale, size * 1.1, size * 1.1, node);
      if (badgeArt && disabled) {
        const dimmer = badgeArt.node.addComponent(UIOpacity);
        dimmer.opacity = 108;
      }
      const g = node.addComponent(Graphics);
      if (badgeArt) {
        if (!selected && !disabled) {
          const dim = badgeArt.node.addComponent(UIOpacity);
          dim.opacity = 205;
        }
        if (entry.dot) {
          g.fillColor = rgba(226, 60, 48, 250);
          g.circle(size * 0.55 - 8 * scale, 10 * scale + size * 0.55 - 10 * scale, 6 * scale);
          g.fill();
        }
      } else {
      g.fillColor = selected ? rgba(74, 26, 20, 245) : rgba(16, 14, 13, 228);
      g.circle(0, 10 * scale, size / 2);
      g.fill();
      g.strokeColor = selected ? rgba(248, 202, 106, 250) : rgba(disabled ? 112 : 138, disabled ? 92 : 112, disabled ? 58 : 70, selected ? 250 : disabled ? 150 : 190);
      g.lineWidth = (selected ? 2.6 : 1.5) * scale;
      g.circle(0, 10 * scale, size / 2);
      g.stroke();
      // 徽章内简笔图记:强化=锤 / 合成=三圆 / 分解=碎块 / 祝福=星。
      g.strokeColor = selected ? rgba(250, 226, 160, 250) : rgba(disabled ? 148 : 196, disabled ? 122 : 178, disabled ? 76 : 138, disabled ? 165 : 235);
      g.lineWidth = 2 * scale;
      const r = size * 0.2;
      if (entry.key === 'enhance') {
        g.moveTo(-r, 10 * scale - r * 0.6);
        g.lineTo(r, 10 * scale + r * 0.9);
        g.moveTo(r * 0.1, 10 * scale + r);
        g.lineTo(r * 1.1, 10 * scale);
      } else if (entry.key === 'fuse') {
        g.circle(-r * 0.8, 10 * scale - r * 0.4, r * 0.5);
        g.circle(r * 0.8, 10 * scale - r * 0.4, r * 0.5);
        g.circle(0, 10 * scale + r * 0.7, r * 0.5);
      } else if (entry.key === 'decompose') {
        g.moveTo(-r, 10 * scale + r);
        g.lineTo(r, 10 * scale - r);
        g.moveTo(-r, 10 * scale - r * 0.2);
        g.lineTo(-r * 0.2, 10 * scale - r);
        g.moveTo(r * 0.2, 10 * scale + r);
        g.lineTo(r, 10 * scale + r * 0.2);
      } else if (entry.key === 'gem') {
        g.moveTo(0, 10 * scale + r);
        g.lineTo(r * 0.85, 10 * scale + r * 0.15);
        g.lineTo(r * 0.5, 10 * scale - r);
        g.lineTo(-r * 0.5, 10 * scale - r);
        g.lineTo(-r * 0.85, 10 * scale + r * 0.15);
        g.close();
        g.moveTo(-r * 0.85, 10 * scale + r * 0.15);
        g.lineTo(r * 0.85, 10 * scale + r * 0.15);
      } else {
        g.moveTo(0, 10 * scale + r);
        g.lineTo(r * 0.35, 10 * scale + r * 0.3);
        g.lineTo(r, 10 * scale + r * 0.2);
        g.lineTo(r * 0.45, 10 * scale - r * 0.25);
        g.lineTo(r * 0.6, 10 * scale - r);
        g.lineTo(0, 10 * scale - r * 0.55);
        g.lineTo(-r * 0.6, 10 * scale - r);
        g.lineTo(-r * 0.45, 10 * scale - r * 0.25);
        g.lineTo(-r, 10 * scale + r * 0.2);
        g.lineTo(-r * 0.35, 10 * scale + r * 0.3);
        g.close();
      }
      g.stroke();
      if (entry.dot) {
        g.fillColor = rgba(226, 60, 48, 250);
        g.circle(size / 2 - 8 * scale, 10 * scale + size / 2 - 10 * scale, 5 * scale);
        g.fill();
      }
      }
      const label = this.host.addChildLabel(node, `ForgeNavLabel_${entry.key}`, entry.label, 0, -size / 2 - 4 * scale, 20 * scale, selected ? rgba(250, 226, 160) : rgba(disabled ? 130 : 196, disabled ? 120 : 182, disabled ? 104 : 148, 255), new Size(size + 20 * scale, 26 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, selected);
      if (!selected && !disabled) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.selectLobbyForgeTab(entry.key as ForgeTab), this);
        this.host.applyImageButtonFeedback(node);
      }
    });
  }

  // 星级行:强化等级映射星数(每 2 级 1 星,+10 满 5 星);复用英雄星星素材,缺图画菱形。
  private renderStarRow(parent: Node, name: string, enhanceLevel: number, x: number, y: number, starSize: number, scale: number): void {
    const filled = Math.min(5, Math.floor(enhanceLevel / 2));
    for (let index = 0; index < 5; index += 1) {
      const sx = x + index * (starSize + 3 * scale);
      const asset = index < filled ? STAR_FILLED_ASSET : STAR_EMPTY_ASSET;
      if (!this.host.addSprite(`${name}_${index}`, asset, sx, y, starSize, starSize, parent)) {
        const node = this.host.addChildPlainNode(parent, `${name}_${index}`, sx, y, starSize, starSize);
        const g = node.addComponent(Graphics);
        g.fillColor = index < filled ? rgba(244, 202, 92, 240) : rgba(70, 62, 50, 200);
        g.moveTo(0, starSize / 2);
        g.lineTo(starSize / 2, 0);
        g.lineTo(0, -starSize / 2);
        g.lineTo(-starSize / 2, 0);
        g.close();
        g.fill();
      }
    }
  }

  // ===== 强化页签(参考图 1:1):左装备列表面板 + 中央环形展示/对比面板/材料石台 + 右保护/预览面板 =====
  private renderEnhanceTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: {
      enhanceSlotId: number | null;
      enhanceSlotTab: string | null;
      enhanceRarity: string | null;
      enhanceFilterOpen: boolean;
      enhanceSortAsc: boolean;
      autoRepeat: boolean;
    },
    panelWidth: number,
    panelHeight: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    const enhance = this.host.currentLobbyEquipEnhanceState();
    const stoneHeld = this.bagCount('ENHANCE_STONE');
    const highStoneHeld = this.bagCount('ENHANCE_STONE_HIGH');
    const blessHeld = this.bagCount('ENHANCE_BLESS_STONE');
    const guardHeld = this.bagCount('ENHANCE_GUARD_RUNE');
    const goldHeld = Number(this.host.currentLobbyProfile().gold) || 0;
    const goldCostOf = (level: number) => 100 * Math.pow(2, Math.floor(level / 3));
    const stoneNeedOf = (level: number) => (level >= ENHANCE_HIGH_FROM_LEVEL ? level - 9 : level + 1);
    const stoneHeldOf = (level: number) => (level >= ENHANCE_HIGH_FROM_LEVEL ? highStoneHeld : stoneHeld);
    const canEnhanceNow = (item: EquipmentItemVO) => {
      const level = item.enhanceLevel ?? 0;
      return level < ENHANCE_MAX_LEVEL && stoneHeldOf(level) >= stoneNeedOf(level) && goldHeld >= goldCostOf(level);
    };

    // ---- 左:选择装备面板(部位页签 + 行式列表 + 筛选/排序) ----
    const listW = Math.min(panelWidth * 0.27, 410 * scale);
    const listX = -panelWidth / 2 + 24 * scale + listW / 2;
    const listH = contentTop - contentBottom;
    const listCy = (contentTop + contentBottom) / 2;
    this.addOrnatePanel(parent, 'ForgeEnhListPanel', listX, listCy, listW, listH, scale);

    let items = state.items
      .filter((item) => !forge.enhanceSlotTab || item.slot === forge.enhanceSlotTab)
      .filter((item) => !forge.enhanceRarity || (item.quality || '').toUpperCase() === forge.enhanceRarity)
      .sort((a, b) => {
        const qualityDiff = EQUIP_QUALITY_ORDER.indexOf((b.quality || '').toUpperCase()) - EQUIP_QUALITY_ORDER.indexOf((a.quality || '').toUpperCase());
        if (qualityDiff !== 0) {
          return qualityDiff;
        }
        const enhanceDiff = (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0);
        return enhanceDiff !== 0 ? enhanceDiff : a.slot.localeCompare(b.slot);
      });
    if (forge.enhanceSortAsc) {
      items = items.reverse();
    }
    const headerLabel = this.host.addChildLabel(parent, 'ForgeEnhListHeader', `选择装备（${items.length}）`, listX - listW / 2, contentTop + 16 * scale, 24 * scale, rgba(240, 222, 176), new Size(listW, 30 * scale), HorizontalTextAlignment.LEFT);
    headerLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(headerLabel, scale, true);

    // 部位页签:全部 + 6 部位小图标(下划金线标示选中)。
    const tabRowY = listCy + listH / 2 - 28 * scale;
    const tabAllW = 52 * scale;
    const tabIconW = (listW - 28 * scale - tabAllW) / HERO_EQUIP_SLOTS.length;
    const allSelected = forge.enhanceSlotTab === null;
    const allTab = this.host.addChildPlainNode(parent, 'ForgeEnhSlotTab_ALL', listX - listW / 2 + 14 * scale + tabAllW / 2, tabRowY, tabAllW, 36 * scale);
    const allLabel = this.host.addChildLabel(allTab, 'ForgeEnhSlotTabAllLabel', '全部', 0, 2 * scale, 20 * scale, allSelected ? rgba(250, 222, 150) : rgba(176, 160, 128), new Size(tabAllW, 28 * scale));
    allLabel.overflow = Label.Overflow.SHRINK;
    const allG = allTab.addComponent(Graphics);
    if (allSelected) {
      allG.strokeColor = rgba(248, 202, 106, 245);
      allG.lineWidth = 2.2 * scale;
      allG.moveTo(-tabAllW / 2 + 6 * scale, -16 * scale);
      allG.lineTo(tabAllW / 2 - 6 * scale, -16 * scale);
      allG.stroke();
    } else {
      allTab.addComponent(Button);
      allTab.on(Button.EventType.CLICK, () => this.host.setLobbyForgeEnhanceSlotTab(null), this);
      this.host.applyImageButtonFeedback(allTab);
    }
    HERO_EQUIP_SLOTS.forEach((slot, index) => {
      const x = listX - listW / 2 + 14 * scale + tabAllW + tabIconW * index + tabIconW / 2;
      const selected = forge.enhanceSlotTab === slot.code;
      const tab = this.host.addChildPlainNode(parent, `ForgeEnhSlotTab_${slot.code}`, x, tabRowY, tabIconW, 36 * scale);
      const holder = this.host.addChildPlainNode(tab, 'GlyphHolder', 0, 2 * scale, 24 * scale, 24 * scale);
      const iconAsset = FORGE_AI_SLOT_ICON_ASSETS[slot.code];
      if (!(iconAsset && this.host.addSprite(`ForgeEnhSlotTabIcon_${slot.code}`, iconAsset, 0, 0, 24 * scale, 24 * scale, holder))) {
        this.drawSlotGlyph(holder, slot.code, 22 * scale, scale);
      }
      const opacity = holder.addComponent(UIOpacity);
      opacity.opacity = selected ? 255 : 130;
      const tg = tab.addComponent(Graphics);
      if (selected) {
        tg.strokeColor = rgba(248, 202, 106, 245);
        tg.lineWidth = 2.2 * scale;
        tg.moveTo(-tabIconW / 2 + 5 * scale, -16 * scale);
        tg.lineTo(tabIconW / 2 - 5 * scale, -16 * scale);
        tg.stroke();
      } else {
        tab.addComponent(Button);
        tab.on(Button.EventType.CLICK, () => this.host.setLobbyForgeEnhanceSlotTab(slot.code), this);
        this.host.applyImageButtonFeedback(tab);
      }
    });

    // 行式列表(滚动):图标框[+N角签/流光] + 名称 + 强化等级 + 星级 + 红点(材料足可强化)。
    const rowH = 76 * scale;
    const rowGap = 8 * scale;
    const viewportTop = listCy + listH / 2 - 50 * scale;
    const viewportBottom = listCy - listH / 2 + 58 * scale;
    const viewportH = Math.max(rowH, viewportTop - viewportBottom);
    const innerW = listW - 20 * scale;
    const viewport = this.host.addChildPlainNode(parent, 'ForgeEnhanceScroll', listX, viewportBottom + viewportH / 2, innerW, viewportH);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;
    // 渲染封顶(2026-07-22 性能):装备上百后整列全建(每行 Graphics+图标+Label+5星+流光)会卡住开屏数秒;
    // 只实建前 60 行,尾行提示用部位/稀有度筛选缩小范围(单部位约 1/6,必在封顶内)。
    const ENHANCE_LIST_RENDER_CAP = 60;
    const shownItems = items.slice(0, ENHANCE_LIST_RENDER_CAP);
    const hiddenCount = items.length - shownItems.length;
    const totalRows = shownItems.length + (hiddenCount > 0 ? 1 : 0);
    const contentH = Math.max(viewportH, totalRows * (rowH + rowGap) - rowGap + 6 * scale);
    const content = this.host.addChildPlainNode(viewport, 'ForgeEnhanceScrollContent', 0, (viewportH - contentH) / 2, innerW, contentH);
    scrollView.content = content;
    if (items.length <= 0) {
      const empty = this.host.addChildLabel(content, 'ForgeEnhListEmpty', '该筛选下暂无装备', 0, contentH / 2 - 40 * scale, 19 * scale, rgba(150, 140, 120), new Size(innerW - 20 * scale, 28 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    }
    if (hiddenCount > 0) {
      const hintY = contentH / 2 - rowH / 2 - shownItems.length * (rowH + rowGap);
      const hint = this.host.addChildLabel(content, 'ForgeEnhListMoreHint', `已显示 ${shownItems.length}/${items.length} 件 · 用部位页签或稀有度筛选查看其余`, 0, hintY, 17 * scale, rgba(186, 168, 132), new Size(innerW - 24 * scale, 26 * scale));
      hint.overflow = Label.Overflow.SHRINK;
    }
    shownItems.forEach((item, index) => {
      const cy = contentH / 2 - rowH / 2 - index * (rowH + rowGap);
      const selected = item.id === forge.enhanceSlotId;
      const q = equipQualityColor(item.quality);
      const level = item.enhanceLevel ?? 0;
      const row = this.host.addChildPlainNode(content, `ForgeEnhanceRow_${item.id}`, 0, cy, innerW, rowH);
      const rg = row.addComponent(Graphics);
      rg.fillColor = selected ? rgba(66, 46, 16, 242) : rgba(Math.round(q.r * 0.1 + 10), Math.round(q.g * 0.1 + 10), Math.round(q.b * 0.1 + 10), 222);
      rg.roundRect(-innerW / 2, -rowH / 2, innerW, rowH, 8 * scale);
      rg.fill();
      rg.strokeColor = selected ? rgba(248, 206, 110, 248) : rgba(q.r, q.g, q.b, 96);
      rg.lineWidth = (selected ? 2.6 : 1.2) * scale;
      rg.stroke();
      // 图标框:slot_frame + 部位图标 + 左上 +N 角签 + 流光(装备本体)。
      const frameSize = 60 * scale;
      const frame = this.host.addChildPlainNode(row, 'ForgeEnhRowFrame', -innerW / 2 + 10 * scale + frameSize / 2, 0, frameSize, frameSize);
      if (!this.host.addSprite('ForgeEnhRowFrameArt', FORGE_AI_SLOT_FRAME_ASSET, 0, 0, frameSize, frameSize, frame)) {
        const fg = frame.addComponent(Graphics);
        fg.fillColor = rgba(12, 10, 10, 235);
        fg.roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, 8 * scale);
        fg.fill();
        fg.strokeColor = rgba(q.r, q.g, q.b, 220);
        fg.lineWidth = 1.8 * scale;
        fg.roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, 8 * scale);
        fg.stroke();
      }
      this.addEquipIcon(frame, 'ForgeEnhRowIcon', item.equipCode, item.slot, frameSize * 0.88, scale);
      if (level > 0) {
        const badge = this.host.addChildLabel(frame, 'ForgeEnhRowBadge', `+${level}`, -frameSize / 2 + 14 * scale, frameSize / 2 - 10 * scale, 17 * scale, rgba(250, 224, 150), new Size(34 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
        badge.overflow = Label.Overflow.SHRINK;
        this.applyOutline(badge, scale, true);
      }
      const textX = -innerW / 2 + frameSize + 20 * scale;
      const textW = innerW - frameSize - 40 * scale;
      const equippedMark = item.heroId != null ? ' [已穿]' : '';
      const name = this.host.addChildLabel(row, 'ForgeEnhRowName', `${safeText(item.equipName)}${equippedMark}`, textX, 22 * scale, 20 * scale, rgba(q.r, q.g, q.b, 255), new Size(textW, 28 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      const levelLine = this.host.addChildLabel(row, 'ForgeEnhRowLevel', `强化等级 +${level}`, textX, 0, 19 * scale, rgba(196, 182, 148), new Size(textW, 24 * scale), HorizontalTextAlignment.LEFT);
      levelLine.overflow = Label.Overflow.SHRINK;
      this.renderStarRow(row, 'ForgeEnhRowStar', level, textX + 8 * scale, -22 * scale, 13 * scale, scale);
      if (canEnhanceNow(item)) {
        // 红点:材料足够、未满级,可立刻强化。
        const dotNode = this.host.addChildPlainNode(row, 'ForgeEnhRowDot', innerW / 2 - 12 * scale, rowH / 2 - 11 * scale, 10 * scale, 10 * scale);
        const dg = dotNode.addComponent(Graphics);
        dg.fillColor = rgba(226, 60, 48, 250);
        dg.circle(0, 0, 4.5 * scale);
        dg.fill();
      }
      if (!selected) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.selectLobbyForgeEnhanceSlot(item.id), this);
        this.host.applyImageButtonFeedback(row, 1.015, 0.985);
      }
    });
    const initialY = (viewportH - contentH) / 2;
    const maxOffset = Math.max(0, contentH - viewportH);
    if (this.enhanceListScrollY !== null) {
      content.setPosition(0, Math.min(initialY + maxOffset, Math.max(initialY, this.enhanceListScrollY)));
    }
    scrollView.node.on(ScrollView.EventType.SCROLLING, () => {
      this.enhanceListScrollY = content.position.y;
    }, this);

    // 筛选(下拉) + 排序按钮。
    const filterY = listCy - listH / 2 + 30 * scale;
    const sortW = 40 * scale;
    const filterW = listW - 28 * scale - sortW - 10 * scale;
    const filterBtn = this.host.addChildPlainNode(parent, 'ForgeEnhFilterBtn', listX - listW / 2 + 14 * scale + filterW / 2, filterY, filterW, 40 * scale);
    const fbg = filterBtn.addComponent(Graphics);
    fbg.fillColor = rgba(22, 19, 17, 232);
    fbg.roundRect(-filterW / 2, -20 * scale, filterW, 40 * scale, 9 * scale);
    fbg.fill();
    fbg.strokeColor = rgba(140, 112, 70, 170);
    fbg.lineWidth = 1.3 * scale;
    fbg.stroke();
    const filterText = forge.enhanceRarity ? `筛选:${equipQualityLabel(forge.enhanceRarity)}` : '筛选';
    const filterLabel = this.host.addChildLabel(filterBtn, 'ForgeEnhFilterLabel', `▼ ${filterText}`, 0, 0, 20 * scale, rgba(214, 198, 162), new Size(filterW - 16 * scale, 30 * scale));
    filterLabel.overflow = Label.Overflow.SHRINK;
    if (!state.busy) {
      filterBtn.addComponent(Button);
      filterBtn.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeEnhanceFilterMenu(), this);
      this.host.applyImageButtonFeedback(filterBtn);
    }
    const sortBtn = this.host.addChildPlainNode(parent, 'ForgeEnhSortBtn', listX + listW / 2 - 14 * scale - sortW / 2, filterY, sortW, 40 * scale);
    const sbg = sortBtn.addComponent(Graphics);
    sbg.fillColor = rgba(22, 19, 17, 232);
    sbg.roundRect(-sortW / 2, -20 * scale, sortW, 40 * scale, 9 * scale);
    sbg.fill();
    sbg.strokeColor = rgba(140, 112, 70, 170);
    sbg.lineWidth = 1.3 * scale;
    sbg.stroke();
    sbg.fillColor = rgba(214, 198, 162, 235);
    if (forge.enhanceSortAsc) {
      sbg.moveTo(0, 9 * scale);
      sbg.lineTo(7 * scale, -6 * scale);
      sbg.lineTo(-7 * scale, -6 * scale);
    } else {
      sbg.moveTo(0, -9 * scale);
      sbg.lineTo(7 * scale, 6 * scale);
      sbg.lineTo(-7 * scale, 6 * scale);
    }
    sbg.close();
    sbg.fill();
    if (!state.busy) {
      sortBtn.addComponent(Button);
      sortBtn.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeEnhanceSort(), this);
      this.host.applyImageButtonFeedback(sortBtn);
    }

    // ---- 右:强化保护 + 强化等级预览 ----
    const rightW = Math.min(panelWidth * 0.265, 440 * scale);
    const rightX = panelWidth / 2 - 24 * scale - rightW / 2;
    const target = state.items.find((item) => item.id === forge.enhanceSlotId) ?? items[0] ?? null;
    const level = target?.enhanceLevel ?? 0;
    const maxed = level >= ENHANCE_MAX_LEVEL;

    const protectH = 244 * scale;
    const protectY = contentTop - protectH / 2;
    this.addOrnatePanel(parent, 'ForgeEnhProtectPanel', rightX, protectY, rightW, protectH, scale);
    this.addPanelTitle(parent, 'ForgeEnhProtectTitle', '强化保护', rightX, protectY + protectH / 2 - 26 * scale, rightW, scale);
    const protectRow = (name: string, y: number, iconAsset: string | null, glyphKind: 'bless' | 'guard', held: number, title: string, desc: string, on: boolean, onClick: () => void) => {
      const rowW = rightW - 24 * scale;
      const rowNode = this.host.addChildPlainNode(parent, name, rightX, y, rowW, 86 * scale);
      const rgg = rowNode.addComponent(Graphics);
      rgg.fillColor = on ? rgba(52, 38, 14, 235) : rgba(20, 17, 15, 225);
      rgg.roundRect(-rowW / 2, -43 * scale, rowW, 86 * scale, 9 * scale);
      rgg.fill();
      rgg.strokeColor = on ? rgba(242, 196, 96, 235) : rgba(110, 94, 72, 150);
      rgg.lineWidth = (on ? 2 : 1.2) * scale;
      rgg.stroke();
      const iconFrame = this.host.addChildPlainNode(rowNode, 'Icon', -rowW / 2 + 12 * scale + 31 * scale, 0, 62 * scale, 62 * scale);
      const ig = iconFrame.addComponent(Graphics);
      ig.fillColor = rgba(12, 10, 10, 235);
      ig.roundRect(-31 * scale, -31 * scale, 62 * scale, 62 * scale, 8 * scale);
      ig.fill();
      ig.strokeColor = rgba(168, 128, 66, 190);
      ig.lineWidth = 1.4 * scale;
      ig.stroke();
      if (!(iconAsset && this.host.addSprite(`${name}Icon`, iconAsset, 0, 2 * scale, 46 * scale, 46 * scale, iconFrame))) {
        ig.strokeColor = rgba(226, 204, 158, 225);
        ig.lineWidth = 1.8 * scale;
        if (glyphKind === 'guard') {
          ig.moveTo(0, 16 * scale);
          ig.lineTo(12 * scale, 8 * scale);
          ig.lineTo(12 * scale, -6 * scale);
          ig.lineTo(0, -16 * scale);
          ig.lineTo(-12 * scale, -6 * scale);
          ig.lineTo(-12 * scale, 8 * scale);
          ig.close();
          ig.stroke();
        } else {
          ig.moveTo(0, 15 * scale);
          ig.lineTo(9 * scale, 4 * scale);
          ig.lineTo(5 * scale, -14 * scale);
          ig.lineTo(-5 * scale, -14 * scale);
          ig.lineTo(-9 * scale, 4 * scale);
          ig.close();
          ig.stroke();
        }
      }
      const heldLabel = this.host.addChildLabel(iconFrame, `${name}Held`, `x${formatInteger(held)}`, 10 * scale, -22 * scale, 17 * scale, rgba(238, 220, 170), new Size(40 * scale, 20 * scale), HorizontalTextAlignment.RIGHT);
      heldLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(heldLabel, scale, true);
      const titleLabel = this.host.addChildLabel(rowNode, `${name}Title`, title, -rowW / 2 + 84 * scale, 16 * scale, 20 * scale, rgba(240, 224, 184), new Size(rowW - 140 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
      titleLabel.overflow = Label.Overflow.SHRINK;
      const descLabel = this.host.addChildLabel(rowNode, `${name}Desc`, desc, -rowW / 2 + 84 * scale, -14 * scale, 19 * scale, rgba(178, 164, 134), new Size(rowW - 140 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
      descLabel.overflow = Label.Overflow.SHRINK;
      // 勾选框。
      const box = this.host.addChildPlainNode(rowNode, `${name}Box`, rowW / 2 - 28 * scale, 0, 32 * scale, 32 * scale);
      const bxg = box.addComponent(Graphics);
      bxg.fillColor = on ? rgba(190, 142, 48, 245) : rgba(16, 14, 13, 235);
      bxg.roundRect(-15 * scale, -15 * scale, 30 * scale, 30 * scale, 6 * scale);
      bxg.fill();
      bxg.strokeColor = on ? rgba(252, 224, 150, 250) : rgba(130, 112, 84, 190);
      bxg.lineWidth = 1.6 * scale;
      bxg.stroke();
      if (on) {
        bxg.strokeColor = rgba(30, 20, 8, 255);
        bxg.lineWidth = 3.2 * scale;
        bxg.moveTo(-7 * scale, 0);
        bxg.lineTo(-2 * scale, -6 * scale);
        bxg.lineTo(8 * scale, 7 * scale);
        bxg.stroke();
      }
      if (!state.busy) {
        rowNode.addComponent(Button);
        rowNode.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(rowNode, 1.01, 0.99);
      }
    };
    protectRow('ForgeEnhBlessRow', protectY + 28 * scale, FORGE_AI_BLESS_ICON_ASSET, 'bless', blessHeld, '祝福石保护', '强化成功率 +20%', enhance.useBless, () => this.host.toggleLobbyEquipEnhanceBless());
    protectRow('ForgeEnhGuardRow', protectY - 72 * scale, FORGE_AI_GUARD_ICON_ASSET, 'guard', guardHeld, '守护符保护', '失败时不降低强化等级', enhance.useGuard, () => this.host.toggleLobbyEquipEnhanceGuard());

    // 强化等级预览:当前+1 起最多 5 行,首行高亮;面板高度按行数收拢(恰好包住内容,不再拉到底)。
    const navReserve = 150 * scale;
    const previewTop = protectY - protectH / 2 - 14 * scale;
    const previewRowH = 40 * scale;
    const previewStartLevel = Math.min(level + 1, ENHANCE_MAX_LEVEL);
    const previewRows = target ? Math.max(1, Math.min(5, ENHANCE_MAX_LEVEL - previewStartLevel + 1)) : 1;
    const previewFitH = 58 * scale + previewRows * previewRowH + 22 * scale;
    const previewH = Math.min(Math.max(140 * scale, previewFitH), Math.max(160 * scale, previewTop - contentBottom - navReserve));
    const previewY = previewTop - previewH / 2;
    this.addOrnatePanel(parent, 'ForgeEnhPreviewPanel', rightX, previewY, rightW, previewH, scale);
    this.addPanelTitle(parent, 'ForgeEnhPreviewTitle', '强化等级预览', rightX, previewY + previewH / 2 - 26 * scale, rightW, scale);
    if (!target) {
      const previewEmpty = this.host.addChildLabel(parent, 'ForgeEnhPreviewEmpty', '选择装备后显示', rightX, previewY, 18 * scale, rgba(150, 140, 120), new Size(rightW - 32 * scale, 26 * scale));
      previewEmpty.overflow = Label.Overflow.SHRINK;
    } else {
      const attrDefs: { label: string; value: number }[] = [
        { label: '攻击力', value: target.attrAttack },
        { label: '生命值', value: target.attrHp },
        { label: '防御力', value: target.attrDefense },
        { label: '速度', value: target.attrSpeed },
        { label: '暴击', value: target.attrCrit },
      ].filter((entry) => entry.value > 0);
      const primary = attrDefs[0] ?? null;
      const secondary = attrDefs[1] ?? null;
      const maxRows = Math.max(1, Math.min(previewRows, Math.floor((previewH - 58 * scale) / previewRowH)));
      const startLevel = previewStartLevel;
      for (let row = 0; row < maxRows && startLevel + row <= ENHANCE_MAX_LEVEL; row += 1) {
        const rowLevel = startLevel + row;
        const y = previewY + previewH / 2 - 56 * scale - previewRowH / 2 - row * previewRowH;
        const rowW = rightW - 24 * scale;
        if (row === 0) {
          const hl = this.host.addChildPlainNode(parent, 'ForgeEnhPreviewHl', rightX, y, rowW, previewRowH - 4 * scale);
          const hg = hl.addComponent(Graphics);
          hg.fillColor = rgba(96, 70, 26, 190);
          hg.roundRect(-rowW / 2, -(previewRowH - 4 * scale) / 2, rowW, previewRowH - 4 * scale, 6 * scale);
          hg.fill();
        }
        const levelText = this.host.addChildLabel(parent, `ForgeEnhPreviewLv_${rowLevel}`, `+${rowLevel}`, rightX - rowW / 2 + 12 * scale, y, 20 * scale, rgba(250, 222, 150), new Size(40 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
        levelText.overflow = Label.Overflow.SHRINK;
        const factor = 1 + 0.1 * rowLevel;
        if (primary) {
          const p = this.host.addChildLabel(parent, `ForgeEnhPreviewP_${rowLevel}`, `${primary.label} +${formatInteger(Math.round(primary.value * factor))}`, rightX - rowW / 2 + 60 * scale, y, 20 * scale, rgba(214, 200, 166), new Size(rowW * 0.42, 24 * scale), HorizontalTextAlignment.LEFT);
          p.overflow = Label.Overflow.SHRINK;
        }
        if (secondary) {
          const s = this.host.addChildLabel(parent, `ForgeEnhPreviewS_${rowLevel}`, `${secondary.label} +${formatInteger(Math.round(secondary.value * factor))}`, rightX + rowW / 2 - 12 * scale, y, 20 * scale, rgba(214, 200, 166), new Size(rowW * 0.42, 24 * scale), HorizontalTextAlignment.RIGHT);
          s.overflow = Label.Overflow.SHRINK;
        }
      }
    }

    // ---- 中:环形展示 + 名字横幅 + 对比面板 + 材料石台 + 强化按钮 ----
    const centerL = listX + listW / 2 + 18 * scale;
    const centerR = rightX - rightW / 2 - 18 * scale;
    const cx = (centerL + centerR) / 2;
    if (!target) {
      const hint = this.host.addChildLabel(parent, 'ForgeEnhCenterHint', '← 从左侧选择要强化的装备', cx, (contentTop + contentBottom) / 2, 20 * scale, rgba(206, 190, 152), new Size(centerR - centerL - 20 * scale, 32 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      return;
    }
    const tq = equipQualityColor(target.quality);
    const usesHighStone = level >= ENHANCE_HIGH_FROM_LEVEL;
    const stoneCost = stoneNeedOf(level);
    const goldCost = goldCostOf(level);
    const baseChance = ENHANCE_CHANCES[Math.min(level, ENHANCE_MAX_LEVEL - 1)] ?? 0.1;
    const chance = Math.min(1, baseChance + (enhance.useBless ? 0.2 : 0));

    // 材料石台(forge_anvil):最先创建 = 最底层,对比面板/成功率/材料卡全部盖在它上面,不再遮挡信息。
    const anvilW = Math.min(800 * scale, centerR - centerL);
    const anvilH = anvilW / FORGE_ANVIL_RATIO;
    const anvil = this.host.addChildPlainNode(parent, 'ForgeEnhAnvil', cx, contentBottom + anvilH * 0.5, anvilW, anvilH);
    this.host.addSprite('ForgeEnhAnvilArt', FORGE_AI_ANVIL_ASSET, 0, 0, anvilW, anvilH, anvil);
    const anvilOpacity = anvil.addComponent(UIOpacity);
    // 石台压暗(参考图1):亮台面会把名称条/成功率/材料框衬得发淡,主次让给信息层。
    anvilOpacity.opacity = 158;

    // 环形装备展示。
    const ringSize = Math.min(310 * scale, (centerR - centerL) * 0.52, listH * 0.44);
    const ringCy = contentTop - ringSize / 2 + 4 * scale;
    const ring = this.host.addChildPlainNode(parent, 'ForgeEnhRing', cx, ringCy, ringSize, ringSize);
    if (!this.host.addSprite('ForgeEnhRingArt', FORGE_AI_ENHANCE_RING_ASSET, 0, 0, ringSize, ringSize, ring)) {
      const rgg = ring.addComponent(Graphics);
      rgg.strokeColor = rgba(172, 132, 64, 235);
      rgg.lineWidth = 3.4 * scale;
      rgg.circle(0, 0, ringSize * 0.48);
      rgg.stroke();
      rgg.strokeColor = rgba(110, 86, 46, 190);
      rgg.lineWidth = 1.6 * scale;
      rgg.circle(0, 0, ringSize * 0.42);
      rgg.stroke();
      rgg.fillColor = rgba(216, 172, 92, 235);
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        rgg.circle(Math.cos(angle) * ringSize * 0.48, Math.sin(angle) * ringSize * 0.48, 3 * scale);
        rgg.fill();
      }
    }
    const dispSize = ringSize * 0.33;
    const disp = this.host.addChildPlainNode(ring, 'ForgeEnhRingSlot', 0, 0, dispSize, dispSize);
    if (!this.host.addSprite('ForgeEnhRingSlotArt', FORGE_AI_SLOT_FRAME_ASSET, 0, 0, dispSize, dispSize, disp)) {
      const dg = disp.addComponent(Graphics);
      dg.fillColor = rgba(12, 10, 10, 240);
      dg.roundRect(-dispSize / 2, -dispSize / 2, dispSize, dispSize, 10 * scale);
      dg.fill();
      dg.strokeColor = rgba(tq.r, tq.g, tq.b, 240);
      dg.lineWidth = 2.2 * scale;
      dg.roundRect(-dispSize / 2, -dispSize / 2, dispSize, dispSize, 10 * scale);
      dg.stroke();
    }
    this.addEquipIcon(disp, 'ForgeEnhRingIcon', target.equipCode, target.slot, dispSize * 0.9, scale);
    if (level > 0) {
      // 强化等级角标:装备框内右上角。
      const ringBadge = this.host.addChildLabel(disp, 'ForgeEnhRingBadge', `+${level}`, dispSize / 2 - 10 * scale, dispSize / 2 - 16 * scale, 22 * scale, rgba(250, 224, 150), new Size(60 * scale, 32 * scale), HorizontalTextAlignment.RIGHT);
      ringBadge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(ringBadge, scale, true);
    }

    // 名字条(参考图1):程序画深色横带 + 细金描边,不再用 title_banner 图。
    const bannerW = Math.min(Math.max(240 * scale, safeText(target.equipName).length * 26 * scale + 96 * scale), centerR - centerL - 40 * scale);
    const bannerH = 46 * scale;
    const bannerCy = ringCy - ringSize / 2 - 24 * scale;
    const banner = this.host.addChildPlainNode(parent, 'ForgeEnhNameBanner', cx, bannerCy, bannerW, bannerH);
    const bng = banner.addComponent(Graphics);
    bng.fillColor = rgba(7, 6, 6, 242);
    bng.roundRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 6 * scale);
    bng.fill();
    bng.strokeColor = rgba(162, 126, 68, 195);
    bng.lineWidth = 1.2 * scale;
    bng.roundRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 6 * scale);
    bng.stroke();
    const nameLabel = this.host.addChildLabel(parent, 'ForgeEnhName', safeText(target.equipName), cx, bannerCy, 26 * scale, rgba(tq.r, tq.g, tq.b, 255), new Size(bannerW * 0.85, 34 * scale));
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(nameLabel, scale, true);

    // 对比面板:双线金框,当前 » 下一级逐行对比,末行强化系数 + 成功率/失败惩罚。
    const compareW = Math.min(580 * scale, centerR - centerL - 8 * scale);
    const compareH = 210 * scale;
    const compareCy = bannerCy - bannerH * 0.3 - 14 * scale - compareH / 2;
    const compare = this.host.addChildPlainNode(parent, 'ForgeEnhCompare', cx, compareCy, compareW, compareH);
    // 实底双线金框(程序画):信息层必须有暗底压住炉火背景,主次分明。
    const cg = compare.addComponent(Graphics);
    cg.fillColor = rgba(10, 8, 7, 246);
    cg.roundRect(-compareW / 2, -compareH / 2, compareW, compareH, 10 * scale);
    cg.fill();
    cg.strokeColor = rgba(214, 168, 82, 220);
    cg.lineWidth = 2 * scale;
    cg.roundRect(-compareW / 2, -compareH / 2, compareW, compareH, 10 * scale);
    cg.stroke();
    cg.strokeColor = rgba(150, 112, 58, 150);
    cg.lineWidth = 1.1 * scale;
    cg.roundRect(-compareW / 2 + 5 * scale, -compareH / 2 + 5 * scale, compareW - 10 * scale, compareH - 10 * scale, 8 * scale);
    cg.stroke();
    const headY = compareH / 2 - 24 * scale;
    const curHead = this.host.addChildLabel(compare, 'ForgeEnhCmpHeadL', `强化等级 +${level}`, -compareW / 4, headY, 22 * scale, rgba(228, 216, 188), new Size(compareW / 2 - 30 * scale, 30 * scale));
    curHead.overflow = Label.Overflow.SHRINK;
    this.applyOutline(curHead, scale, false);
    const arrowHead = this.host.addChildLabel(compare, 'ForgeEnhCmpHeadArrow', '»', 0, headY, 34 * scale, rgba(248, 202, 106), new Size(40 * scale, 40 * scale));
    arrowHead.overflow = Label.Overflow.SHRINK;
    const nextHead = this.host.addChildLabel(compare, 'ForgeEnhCmpHeadR', maxed ? '已满级' : `强化等级 +${level + 1}`, compareW / 4, headY, 22 * scale, rgba(250, 222, 150), new Size(compareW / 2 - 30 * scale, 30 * scale));
    nextHead.overflow = Label.Overflow.SHRINK;
    this.applyOutline(nextHead, scale, false);
    cg.strokeColor = rgba(150, 112, 58, 160);
    cg.lineWidth = 1.2 * scale;
    cg.moveTo(-compareW / 2 + 14 * scale, compareH / 2 - 42 * scale);
    cg.lineTo(compareW / 2 - 14 * scale, compareH / 2 - 42 * scale);
    cg.stroke();
    const factorNow = 1 + 0.1 * level;
    const factorNext = 1 + 0.1 * (level + 1);
    const cmpAttrs: { label: string; value: number }[] = [
      { label: '攻击力', value: target.attrAttack },
      { label: '生命值', value: target.attrHp },
      { label: '防御力', value: target.attrDefense },
      { label: '速度', value: target.attrSpeed },
      { label: '暴击', value: target.attrCrit },
    ].filter((entry) => entry.value > 0).slice(0, 3);
    const cmpRowH = 30 * scale;
    cmpAttrs.forEach((entry, index) => {
      const y = compareH / 2 - 58 * scale - index * cmpRowH;
      const labelText = this.host.addChildLabel(compare, `ForgeEnhCmpL_${index}`, entry.label, -compareW / 2 + 20 * scale, y, 20 * scale, rgba(196, 182, 148), new Size(compareW * 0.24, 26 * scale), HorizontalTextAlignment.LEFT);
      labelText.overflow = Label.Overflow.SHRINK;
      const cur = this.host.addChildLabel(compare, `ForgeEnhCmpC_${index}`, `+${formatInteger(Math.round(entry.value * factorNow))}`, -compareW * 0.08, y, 20 * scale, rgba(230, 222, 200), new Size(compareW * 0.2, 26 * scale), HorizontalTextAlignment.RIGHT);
      cur.overflow = Label.Overflow.SHRINK;
      const mid = this.host.addChildLabel(compare, `ForgeEnhCmpM_${index}`, '›', compareW * 0.02, y, 20 * scale, rgba(150, 132, 100), new Size(20 * scale, 26 * scale));
      mid.overflow = Label.Overflow.SHRINK;
      const next = this.host.addChildLabel(compare, `ForgeEnhCmpN_${index}`, maxed ? '—' : `+${formatInteger(Math.round(entry.value * factorNext))} ↑`, compareW / 2 - 24 * scale, y, 20 * scale, maxed ? rgba(150, 140, 120) : rgba(140, 220, 140), new Size(compareW * 0.26, 26 * scale), HorizontalTextAlignment.RIGHT);
      next.overflow = Label.Overflow.SHRINK;
    });
    const factorY = compareH / 2 - 58 * scale - cmpAttrs.length * cmpRowH;
    const factorLabel = this.host.addChildLabel(compare, 'ForgeEnhCmpFL', '强化属性', -compareW / 2 + 20 * scale, factorY, 20 * scale, rgba(196, 182, 148), new Size(compareW * 0.24, 26 * scale), HorizontalTextAlignment.LEFT);
    factorLabel.overflow = Label.Overflow.SHRINK;
    const factorCur = this.host.addChildLabel(compare, 'ForgeEnhCmpFC', `×${factorNow.toFixed(1)}（+${level * 10}%）`, -compareW * 0.05, factorY, 20 * scale, rgba(232, 128, 104), new Size(compareW * 0.28, 26 * scale), HorizontalTextAlignment.RIGHT);
    factorCur.overflow = Label.Overflow.SHRINK;
    const factorNextLabel = this.host.addChildLabel(compare, 'ForgeEnhCmpFN', maxed ? '—' : `×${factorNext.toFixed(1)}（+${(level + 1) * 10}%）`, compareW / 2 - 24 * scale, factorY, 20 * scale, maxed ? rgba(150, 140, 120) : rgba(140, 220, 140), new Size(compareW * 0.3, 26 * scale), HorizontalTextAlignment.RIGHT);
    factorNextLabel.overflow = Label.Overflow.SHRINK;

    // 成功率两行制(参考图):首行"成功率 NN%"居中,次行失败惩罚换行;仅垫极淡暗底保读性,不画边框。
    const successY = compareCy - compareH / 2 - 28 * scale;
    const successChipW = Math.min(compareW, 640 * scale);
    const successChip = this.host.addChildPlainNode(parent, 'ForgeEnhSuccessChip', cx, successY - 14 * scale, successChipW, 86 * scale);
    const scg = successChip.addComponent(Graphics);
    scg.fillColor = rgba(7, 6, 6, 208);
    scg.roundRect(-successChipW / 2, -43 * scale, successChipW, 86 * scale, 12 * scale);
    scg.fill();
    if (maxed) {
      const successLabel = this.host.addChildLabel(parent, 'ForgeEnhSuccess', `已达强化上限 +${ENHANCE_MAX_LEVEL}`, cx, successY, 30 * scale, rgba(232, 222, 196), new Size(successChipW, 40 * scale));
      successLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(successLabel, scale, true);
    } else {
      this.layoutInlineSegments(parent, 'ForgeEnhSuccess', [
        { text: '成功率 ', color: rgba(224, 192, 140), size: 26 * scale },
        { text: `${Math.round(chance * 100)}%`, color: rgba(246, 212, 132), size: 34 * scale },
      ], cx, successY, scale);
      const failSegments = level >= 5
        ? [
          { text: '失败惩罚：', color: rgba(200, 184, 152), size: 18 * scale },
          { text: '强化等级 -1', color: rgba(230, 112, 88), size: 18 * scale },
          { text: '（护符可抵消）', color: rgba(216, 186, 134), size: 18 * scale },
        ]
        : [
          { text: '失败惩罚：', color: rgba(200, 184, 152), size: 18 * scale },
          { text: '无（+5 起失败才会降级）', color: rgba(196, 184, 156), size: 18 * scale },
        ];
      this.layoutInlineSegments(parent, 'ForgeEnhFail', failSegments, cx, successY - 34 * scale, scale);
    }

    // 材料卡(需求/持有,不足红字);石台已提前到最底层创建。
    type MaterialCard = { key: string; icon: string | null; label: string; need: number; held: number };
    const cards: MaterialCard[] = [];
    if (enhance.useBless) {
      cards.push({ key: 'bless', icon: FORGE_AI_BLESS_ICON_ASSET, label: '祝福石', need: 1, held: blessHeld });
    }
    if (enhance.useGuard) {
      cards.push({ key: 'guard', icon: FORGE_AI_GUARD_ICON_ASSET, label: '守护符', need: 1, held: guardHeld });
    }
    cards.push(usesHighStone
      ? { key: 'stone', icon: BAG_ICON_ENHANCE_STONE_HIGH_ASSET, label: '高阶强化石', need: stoneCost, held: highStoneHeld }
      : { key: 'stone', icon: BAG_ICON_ENHANCE_STONE_ASSET, label: '强化石', need: stoneCost, held: stoneHeld });
    cards.push({ key: 'gold', icon: BAG_ICON_GOLD_ASSET, label: '金币', need: goldCost, held: goldHeld });
    const cardW = 102 * scale;
    // 材料卡与强化按钮保持间距(按钮顶 ~contentBottom+98,卡底签底 ~cardsY-58)。
    const cardsY = contentBottom + 172 * scale;
    const cardsStart = cx - ((cards.length - 1) * (cardW + 14 * scale)) / 2;
    cards.forEach((cardDef, index) => {
      const x = cardsStart + index * (cardW + 14 * scale);
      const lacking = cardDef.held < cardDef.need;
      const card = this.host.addChildPlainNode(parent, `ForgeEnhMat_${cardDef.key}`, x, cardsY, cardW, 96 * scale);
      // 道具框:程序画深色半透明底 + 细金描边(不足时红框);无外层包裹框(参考图1)。
      const frameSize = 72 * scale;
      const frame = this.host.addChildPlainNode(card, 'Frame', 0, 14 * scale, frameSize, frameSize);
      const fg = frame.addComponent(Graphics);
      fg.fillColor = rgba(8, 7, 8, 236);
      fg.roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, 8 * scale);
      fg.fill();
      fg.strokeColor = lacking ? rgba(192, 86, 64, 235) : rgba(200, 158, 86, 232);
      fg.lineWidth = 1.6 * scale;
      fg.roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, 8 * scale);
      fg.stroke();
      if (cardDef.icon) {
        this.host.addSprite(`ForgeEnhMatIcon_${cardDef.key}`, cardDef.icon, 0, 0, 56 * scale, 56 * scale, frame);
      }
      const countText = cardDef.key === 'gold' ? formatInteger(cardDef.need) : `${formatInteger(cardDef.need)}/${formatInteger(cardDef.held)}`;
      const count = this.host.addChildLabel(card, `ForgeEnhMatCount_${cardDef.key}`, countText, 0, -30 * scale, 20 * scale, lacking ? rgba(236, 92, 70) : rgba(242, 240, 235), new Size(cardW + 10 * scale, 25 * scale));
      count.overflow = Label.Overflow.SHRINK;
      this.applyOutline(count, scale, true);
      const nameText = this.host.addChildLabel(card, `ForgeEnhMatName_${cardDef.key}`, cardDef.label, 0, -52 * scale, 20 * scale, rgba(232, 204, 150), new Size(cardW + 10 * scale, 24 * scale));
      nameText.overflow = Label.Overflow.SHRINK;
      this.applyOutline(nameText, scale, false);
    });

    // 强化按钮 + 连续强化勾选。
    const buttonY = contentBottom + 52 * scale;
    const buttonW = 230 * scale;
    const materialsOk = stoneHeldOf(level) >= stoneCost && goldHeld >= goldCost && (!enhance.useBless || blessHeld >= 1) && (!enhance.useGuard || guardHeld >= 1);
    const canEnhance = !state.busy && !maxed && materialsOk;
    const strikeThen = (action: () => void) => this.playEnhanceStrike(cx, ringCy, scale, action);
    this.renderPrimaryButton(parent, 'ForgeEnhConfirm', state.busy ? '强化中…' : maxed ? '已满级' : materialsOk ? '强 化' : '材料不足', cx, buttonY, buttonW, scale, canEnhance, () => strikeThen(() => (forge.autoRepeat ? this.host.autoEnhanceLobbyEquipment(target.id) : this.host.enhanceLobbyEquipment(target.id))));
    // 词条洗练入口(P4):紫装起可洗;与强化按钮同排左侧。
    const rerollable = ['PURPLE', 'GOLD', 'RED'].includes((target.quality || '').toUpperCase());
    const rerollW = 172 * scale;
    this.renderPrimaryButton(parent, 'ForgeEnhReroll', '洗练词条', cx - buttonW / 2 - 16 * scale - rerollW / 2, buttonY, rerollW, scale, rerollable && !state.busy, () => this.host.openLobbyForgeRerollDialog());
    const repeatW = 172 * scale;
    const repeatBox = this.host.addChildPlainNode(parent, 'ForgeEnhRepeat', cx + buttonW / 2 + 16 * scale + repeatW / 2, buttonY, repeatW, 48 * scale);
    const rbg = repeatBox.addComponent(Graphics);
    // 整行底签+描边:让"连续强化"从背景中跳出来(勾选态金框高亮)。
    rbg.fillColor = forge.autoRepeat ? rgba(56, 40, 15, 238) : rgba(22, 19, 17, 232);
    rbg.roundRect(-repeatW / 2, -24 * scale, repeatW, 48 * scale, 9 * scale);
    rbg.fill();
    rbg.strokeColor = forge.autoRepeat ? rgba(244, 200, 104, 240) : rgba(150, 124, 82, 190);
    rbg.lineWidth = (forge.autoRepeat ? 2 : 1.4) * scale;
    rbg.roundRect(-repeatW / 2, -24 * scale, repeatW, 48 * scale, 9 * scale);
    rbg.stroke();
    rbg.fillColor = forge.autoRepeat ? rgba(190, 142, 48, 245) : rgba(14, 12, 11, 235);
    rbg.roundRect(-repeatW / 2 + 10 * scale, -13 * scale, 26 * scale, 26 * scale, 5 * scale);
    rbg.fill();
    rbg.strokeColor = forge.autoRepeat ? rgba(252, 224, 150, 250) : rgba(150, 128, 92, 200);
    rbg.lineWidth = 1.6 * scale;
    rbg.roundRect(-repeatW / 2 + 10 * scale, -13 * scale, 26 * scale, 26 * scale, 5 * scale);
    rbg.stroke();
    if (forge.autoRepeat) {
      rbg.strokeColor = rgba(30, 20, 8, 255);
      rbg.lineWidth = 2.8 * scale;
      rbg.moveTo(-repeatW / 2 + 17 * scale, 0);
      rbg.lineTo(-repeatW / 2 + 21 * scale, -6 * scale);
      rbg.lineTo(-repeatW / 2 + 30 * scale, 7 * scale);
      rbg.stroke();
    }
    const repeatLabel = this.host.addChildLabel(repeatBox, 'ForgeEnhRepeatLabel', '连续强化 ⓘ', -repeatW / 2 + 44 * scale, 0, 20 * scale, forge.autoRepeat ? rgba(250, 226, 160) : rgba(216, 200, 166), new Size(repeatW - 50 * scale, 32 * scale), HorizontalTextAlignment.LEFT);
    repeatLabel.overflow = Label.Overflow.SHRINK;
    if (!state.busy) {
      repeatBox.addComponent(Button);
      repeatBox.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeAutoRepeat(), this);
    }

    // 筛选下拉菜单(最后渲染,盖在列表上)。
    if (forge.enhanceFilterOpen) {
      const options: { key: string | null; label: string }[] = [
        { key: null, label: '全部稀有度' },
        ...EQUIP_QUALITY_ORDER.map((quality) => ({ key: quality as string | null, label: equipQualityLabel(quality) })),
      ];
      const menuW = filterW;
      const menuRowH = 34 * scale;
      const menuH = options.length * menuRowH + 12 * scale;
      const menuX = listX - listW / 2 + 14 * scale + filterW / 2;
      const menu = this.host.addChildPlainNode(parent, 'ForgeEnhFilterMenu', menuX, filterY + 20 * scale + menuH / 2 + 6 * scale, menuW, menuH);
      const mg = menu.addComponent(Graphics);
      mg.fillColor = rgba(14, 12, 11, 248);
      mg.roundRect(-menuW / 2, -menuH / 2, menuW, menuH, 9 * scale);
      mg.fill();
      mg.strokeColor = rgba(190, 148, 82, 220);
      mg.lineWidth = 1.5 * scale;
      mg.stroke();
      menu.addComponent(BlockInputEvents);
      options.forEach((option, index) => {
        const y = menuH / 2 - 6 * scale - menuRowH / 2 - index * menuRowH;
        const active = forge.enhanceRarity === option.key;
        const optColor = option.key ? equipQualityColor(option.key) : { r: 214, g: 198, b: 162 };
        const opt = this.host.addChildPlainNode(menu, `ForgeEnhFilterOpt_${option.key ?? 'ALL'}`, 0, y, menuW - 12 * scale, menuRowH - 4 * scale);
        if (active) {
          const og = opt.addComponent(Graphics);
          og.fillColor = rgba(66, 46, 16, 230);
          og.roundRect(-(menuW - 12 * scale) / 2, -(menuRowH - 4 * scale) / 2, menuW - 12 * scale, menuRowH - 4 * scale, 6 * scale);
          og.fill();
        }
        const optLabel = this.host.addChildLabel(opt, 'Label', option.label, 0, 0, 18 * scale, rgba(optColor.r, optColor.g, optColor.b, 255), new Size(menuW - 24 * scale, 26 * scale));
        optLabel.overflow = Label.Overflow.SHRINK;
        opt.addComponent(Button);
        opt.on(Button.EventType.CLICK, () => this.host.setLobbyForgeEnhanceRarity(option.key), this);
        this.host.applyImageButtonFeedback(opt, 1.02, 0.98);
      });
    }
  }

  // 锤击前摇:铸造台上光点蓄力 + 火花四溅(0.45s),结束后才发起强化请求;期间全屏挡输入防连点。
  private playEnhanceStrike(x: number, y: number, scale: number, onDone: () => void): void {
    const node = this.host.createUiNode(`LobbyForgeStrike_${Date.now()}`);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(300 * scale, 300 * scale));
    const blocker = this.host.addChildPlainNode(node, 'ForgeStrikeBlocker', 0, 0, 4000, 4000);
    blocker.addComponent(BlockInputEvents);
    // 蓄力光点。
    const glow = this.host.addChildPlainNode(node, 'ForgeStrikeGlow', 0, 0, 160 * scale, 160 * scale);
    const gg = glow.addComponent(Graphics);
    gg.fillColor = rgba(255, 214, 110, 150);
    gg.circle(0, 0, 52 * scale);
    gg.fill();
    gg.fillColor = rgba(255, 246, 214, 200);
    gg.circle(0, 0, 22 * scale);
    gg.fill();
    const glowOpacity = glow.addComponent(UIOpacity);
    glowOpacity.opacity = 0;
    tween(glowOpacity)
      .to(0.16, { opacity: 255 })
      .to(0.24, { opacity: 60 })
      .start();
    glow.setScale(new Vec3(0.5, 0.5, 1));
    tween(glow)
      .to(0.16, { scale: new Vec3(1.15, 1.15, 1) })
      .to(0.24, { scale: new Vec3(0.9, 0.9, 1) })
      .start();
    // 8 颗火花:锤击瞬间(0.16s 后)向外飞散。
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 + Math.PI / 16;
      const spark = this.host.addChildPlainNode(node, `ForgeStrikeSpark_${index}`, 0, 0, 16 * scale, 16 * scale);
      const sg = spark.addComponent(Graphics);
      sg.fillColor = rgba(255, 200, 96, 235);
      sg.moveTo(0, 6 * scale);
      sg.lineTo(4 * scale, 0);
      sg.lineTo(0, -6 * scale);
      sg.lineTo(-4 * scale, 0);
      sg.close();
      sg.fill();
      const sparkOpacity = spark.addComponent(UIOpacity);
      sparkOpacity.opacity = 0;
      const dx = Math.cos(angle) * (90 + (index % 3) * 26) * scale;
      const dy = Math.sin(angle) * (70 + (index % 2) * 30) * scale - 20 * scale;
      tween(sparkOpacity)
        .delay(0.16)
        .to(0.03, { opacity: 255 })
        .to(0.26, { opacity: 0 })
        .start();
      tween(spark)
        .delay(0.16)
        .to(0.29, { position: new Vec3(dx, dy, 0) })
        .start();
    }
    tween(node)
      .delay(0.45)
      .call(() => {
        onDone();
      })
      .start();
  }

  // ===== 合成页签:三装备槽 + 一键放入 + 合成;下方分组行点击载入 =====
  private renderFuseTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: { fuseSlotIds: number[] },
    panelWidth: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    const fuse = this.host.currentLobbyEquipFuseState();
    const luckOn = fuse.useLuckStone;
    const luckCount = this.bagCount('FUSION_LUCK_STONE');
    const slotIds = forge.fuseSlotIds.filter((id) => state.items.some((item) => item.id === id && item.heroId == null));
    const slotItems = slotIds.map((id) => state.items.find((item) => item.id === id)!).filter(Boolean);

    // 祭坛区:三槽横排(AI 图 2.86:1 等比,放大作为页面主体;右侧留出一键放入按钮位)。
    const altarW = Math.min(780 * scale, panelWidth - 400 * scale);
    const altarH = altarW / FORGE_ALTAR_RATIO;
    const altarCy = contentTop - altarH / 2 - 2 * scale;
    const altar = this.host.addChildPlainNode(parent, 'ForgeFuseAltar', 0, altarCy, altarW, altarH);
    const altarArt = this.host.addSprite('ForgeFuseAltarArt', FORGE_AI_FUSE_ALTAR_ASSET, 0, 0, altarW, altarH, altar);
    if (!altarArt) {
      const g = altar.addComponent(Graphics);
      g.fillColor = rgba(18, 14, 12, 216);
      g.roundRect(-altarW / 2, -altarH / 2, altarW, altarH, 14 * scale);
      g.fill();
      g.strokeColor = rgba(160, 120, 60, 180);
      g.lineWidth = 1.8 * scale;
      g.roundRect(-altarW / 2, -altarH / 2, altarW, altarH, 14 * scale);
      g.stroke();
    }
    // 三槽对准祭坛图的三个符文凹槽(按截图校准:横向 ±26% 宽、纵向中心上方 15% 高、槽径 ≈40% 高)。
    // 有图时不再叠方框(双框打架):改为品质光环压凹槽 + 名字签下挂暗底(避开蓝光,可读)+ ✕ 角标移出。
    const socketY = altarArt ? altarH * 0.15 : 4 * scale;
    const socketSize = altarArt ? altarH * 0.4 : Math.min(104 * scale, altarH * 0.56);
    for (let index = 0; index < 3; index += 1) {
      const x = (index - 1) * altarW * (altarArt ? 0.26 : 0.29);
      const item = slotItems[index] ?? null;
      const q = item ? equipQualityColor(item.quality) : { r: 130, g: 114, b: 90 };
      const slot = this.host.addChildPlainNode(altar, `ForgeFuseSlot_${index}`, x, socketY, socketSize, socketSize);
      if (altarArt) {
        if (item) {
          const ring = slot.addComponent(Graphics);
          ring.strokeColor = rgba(q.r, q.g, q.b, 235);
          ring.lineWidth = 2.8 * scale;
          ring.circle(0, 0, socketSize * 0.54);
          ring.stroke();
          ring.fillColor = rgba(q.r, q.g, q.b, 42);
          ring.circle(0, 0, socketSize * 0.48);
          ring.fill();
        }
      } else {
        const slotArtSprite = this.host.addSprite(`ForgeFuseSlotArt_${index}`, FORGE_AI_SLOT_FRAME_ASSET, 0, 0, socketSize, socketSize, slot);
        if (!slotArtSprite) {
          const sg = slot.addComponent(Graphics);
          sg.fillColor = rgba(12, 10, 10, 235);
          sg.roundRect(-socketSize / 2, -socketSize / 2, socketSize, socketSize, 12 * scale);
          sg.fill();
          sg.strokeColor = rgba(q.r, q.g, q.b, item ? 235 : 120);
          sg.lineWidth = 2 * scale;
          sg.roundRect(-socketSize / 2, -socketSize / 2, socketSize, socketSize, 12 * scale);
          sg.stroke();
        }
      }
      if (item) {
        // 槽内装备真图(v2 不透明方图直出;此前只画品质光环,放入后看不到图标)。
        this.addEquipIcon(slot, `ForgeFuseSlotIcon_${index}`, item.equipCode, item.slot, socketSize * 0.76, scale);
        const level = item.enhanceLevel ?? 0;
        const chipW = Math.max(socketSize * 1.6, 132 * scale);
        const chipH = 28 * scale;
        const chip = this.host.addChildPlainNode(slot, 'ForgeFuseSlotChip', 0, -socketSize * 0.82, chipW, chipH);
        const cg = chip.addComponent(Graphics);
        cg.fillColor = rgba(8, 7, 7, 228);
        cg.roundRect(-chipW / 2, -chipH / 2, chipW, chipH, 7 * scale);
        cg.fill();
        cg.strokeColor = rgba(q.r, q.g, q.b, 180);
        cg.lineWidth = 1.3 * scale;
        cg.stroke();
        const chipName = this.host.addChildLabel(chip, 'ForgeFuseSlotName', `${safeText(item.equipName)}${level > 0 ? ` +${level}` : ''}`, 0, 0, 18 * scale, rgba(q.r, q.g, q.b, 255), new Size(chipW - 12 * scale, chipH - 6 * scale));
        chipName.overflow = Label.Overflow.SHRINK;
        this.applyOutline(chipName, scale, false);
        const removeMark = this.host.addChildLabel(slot, 'ForgeFuseSlotRemove', '✕', socketSize * 0.5, socketSize * 0.46, 20 * scale, rgba(234, 170, 130), new Size(22 * scale, 28 * scale));
        removeMark.overflow = Label.Overflow.SHRINK;
        this.applyOutline(removeMark, scale, true);
        if (!state.busy) {
          slot.addComponent(Button);
          slot.on(Button.EventType.CLICK, () => this.host.setLobbyForgeFuseSlots(slotIds.filter((id) => id !== item.id)), this);
          this.host.applyImageButtonFeedback(slot);
        }
      } else {
        const plus = this.host.addChildLabel(slot, 'ForgeFuseSlotPlus', '+', 0, 0, 34 * scale, rgba(224, 206, 168, 168), new Size(socketSize, socketSize));
        plus.overflow = Label.Overflow.SHRINK;
      }
      if (index < 2 && !altarArt) {
        // 兜底祭坛才画 "+" 连接符;AI 图自带符文连线。
        const sep = this.host.addChildLabel(altar, `ForgeFuseSlotSep_${index}`, '+', x + altarW * 0.145, socketY, 26 * scale, rgba(196, 168, 110), new Size(30 * scale, 36 * scale));
        sep.overflow = Label.Overflow.SHRINK;
      }
    }

    // 一键放入:自动挑"数量最多、稀有度最低优先"的可合成组前 3 件;按钮在祭坛右侧外。
    const autoW = 132 * scale;
    const autoBtn = this.host.addChildPlainNode(parent, 'ForgeFuseAuto', altarW / 2 + 16 * scale + autoW / 2, altarCy, autoW, 44 * scale);
    const autoGroups = this.collectFuseGroups(state.items).filter((group) => group.items.length >= 3);
    const canAuto = !state.busy && autoGroups.length > 0;
    const ag = autoBtn.addComponent(Graphics);
    ag.fillColor = canAuto ? rgba(44, 62, 86, 235) : rgba(48, 44, 38, 205);
    ag.roundRect(-autoW / 2, -22 * scale, autoW, 44 * scale, 9 * scale);
    ag.fill();
    ag.strokeColor = rgba(150, 170, 200, 190);
    ag.lineWidth = 1.5 * scale;
    ag.stroke();
    const autoLabel = this.host.addChildLabel(autoBtn, 'ForgeFuseAutoLabel', '一键放入', 0, 0, 19 * scale, rgba(214, 226, 244), new Size(autoW - 10 * scale, 38 * scale));
    autoLabel.overflow = Label.Overflow.SHRINK;
    if (canAuto) {
      autoBtn.addComponent(Button);
      autoBtn.on(Button.EventType.CLICK, () => this.host.setLobbyForgeFuseSlots(autoGroups[0].items.slice(0, 3).map((item) => item.id)), this);
      this.host.applyImageButtonFeedback(autoBtn);
    }

    // 结果预览 + 概率石开关 + 合成按钮。
    const ready = slotItems.length >= 3;
    const quality = ready ? (slotItems[0].quality || '').toUpperCase() : '';
    const nextQuality = ready ? EQUIP_QUALITY_ORDER[EQUIP_QUALITY_ORDER.indexOf(quality) + 1] ?? '' : '';
    const chance = ready ? Math.min(0.95, (EQUIP_FUSE_BASE_CHANCE[quality] ?? 0) + (luckOn ? 0.2 : 0)) : 0;
    const infoText = ready
      ? `${slotLabelOf(slotItems[0].slot)} · ${equipQualityLabel(quality)} ×3 → ${equipQualityLabel(nextQuality)} ×1 · 成功率 ${Math.round(chance * 100)}% · 金币 ${formatInteger(EQUIP_FUSE_GOLD_COST[quality] ?? 0)}`
      : '放入 3 件同部位同稀有度的未穿戴装备(失败返还同档 1 件;红装为顶级不可合成)。';
    // 结果预览行:暗底签托字,大一号,背景再亮也能读。
    const infoY = altarCy - altarH / 2 - 30 * scale;
    const infoChipW = Math.min(860 * scale, panelWidth - 160 * scale);
    const infoChip = this.host.addChildPlainNode(parent, 'ForgeFuseInfoChip', 0, infoY, infoChipW, 36 * scale);
    const icg = infoChip.addComponent(Graphics);
    icg.fillColor = rgba(8, 7, 7, 218);
    icg.roundRect(-infoChipW / 2, -18 * scale, infoChipW, 36 * scale, 9 * scale);
    icg.fill();
    icg.strokeColor = rgba(140, 108, 62, 150);
    icg.lineWidth = 1.2 * scale;
    icg.stroke();
    const info = this.host.addChildLabel(infoChip, 'ForgeFuseInfo', infoText, 0, 0, 20 * scale, ready ? rgba(240, 212, 148) : rgba(196, 182, 152), new Size(infoChipW - 26 * scale, 32 * scale));
    info.overflow = Label.Overflow.SHRINK;
    this.applyOutline(info, scale, false);

    // 操作行居中:概率石开关 + 合成按钮一组,不再分居屏幕两端。
    const canFuse = ready && !state.busy && !(luckOn && luckCount <= 0);
    const rowY = infoY - 52 * scale;
    const luckW = 340 * scale;
    const luckH = 42 * scale;
    const pairW = luckW + 20 * scale + 190 * scale;
    const luckX = -pairW / 2 + luckW / 2;
    const luckRow = this.host.addChildPlainNode(parent, 'ForgeFuseLuck', luckX, rowY, luckW, luckH);
    const lg = luckRow.addComponent(Graphics);
    lg.fillColor = luckOn ? rgba(58, 44, 16, 235) : rgba(22, 20, 18, 232);
    lg.roundRect(-luckW / 2, -luckH / 2, luckW, luckH, 8 * scale);
    lg.fill();
    lg.strokeColor = luckOn ? rgba(242, 196, 96, 235) : rgba(120, 104, 84, 150);
    lg.lineWidth = (luckOn ? 2.2 : 1.4) * scale;
    lg.stroke();
    const luckLabel = this.host.addChildLabel(luckRow, 'ForgeFuseLuckLabel', `${luckOn ? '☑' : '☐'} 合成概率石 +20%（上限95%）· x${formatInteger(luckCount)}`, 0, 0, 19 * scale, luckOn ? rgba(248, 224, 160) : rgba(200, 186, 154), new Size(luckW - 16 * scale, luckH - 6 * scale));
    luckLabel.overflow = Label.Overflow.SHRINK;
    if (!state.busy) {
      luckRow.addComponent(Button);
      luckRow.on(Button.EventType.CLICK, () => this.host.toggleLobbyEquipFuseLuckStone(), this);
    }
    this.renderPrimaryButton(parent, 'ForgeFuseConfirm', state.busy ? '合成中…' : '合 成', pairW / 2 - 95 * scale, rowY, 190 * scale, scale, canFuse, () => this.host.fuseLobbyForgeSelected());

    // 下方分组列表(双列):点击整组载入三槽。
    const groups = this.collectFuseGroups(state.items);
    const listTop = infoY - 106 * scale;
    const colGap = 20 * scale;
    const colW = (panelWidth - 56 * scale - colGap) / 2;
    const rowH = 48 * scale;
    const rowGap = 8 * scale;
    const rowsPerCol = Math.max(1, Math.floor((listTop - contentBottom - 22 * scale) / (rowH + rowGap)));
    if (groups.length <= 0) {
      const empty = this.host.addChildLabel(parent, 'ForgeFuseGroupsEmpty', '没有可合成的未穿戴装备组。', 0, listTop - 30 * scale, 19 * scale, rgba(150, 140, 120), new Size(panelWidth - 120 * scale, 30 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    }
    groups.slice(0, rowsPerCol * 2).forEach((group, index) => {
      const col = Math.floor(index / rowsPerCol);
      const rowIndex = index % rowsPerCol;
      const x = col === 0 ? -colW / 2 - colGap / 2 : colW / 2 + colGap / 2;
      const cy = listTop - rowH / 2 - rowIndex * (rowH + rowGap);
      const q = equipQualityColor(group.quality);
      const enough = group.items.length >= 3;
      const row = this.host.addChildPlainNode(parent, `ForgeFuseGroup_${group.slot}_${group.quality}`, x, cy, colW, rowH);
      const rg = row.addComponent(Graphics);
      rg.fillColor = rgba(Math.round(q.r * 0.12 + 8), Math.round(q.g * 0.12 + 8), Math.round(q.b * 0.12 + 8), enough ? 238 : 198);
      rg.roundRect(-colW / 2, -rowH / 2, colW, rowH, 7 * scale);
      rg.fill();
      rg.strokeColor = rgba(q.r, q.g, q.b, enough ? 190 : 110);
      rg.lineWidth = 1.3 * scale;
      rg.stroke();
      this.renderEquipIconBox(row, 'ForgeFuseGroupIcon', group.items[0], -colW / 2 + 8 * scale + 19 * scale, 0, 38 * scale, scale);
      const name = this.host.addChildLabel(row, 'ForgeFuseGroupName', `${slotLabelOf(group.slot)} · ${equipQualityLabel(group.quality)} ×${group.items.length}`, -colW / 2 + 56 * scale, 0, 20 * scale, rgba(q.r, q.g, q.b, 255), new Size(colW * 0.58, 28 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      this.applyOutline(name, scale, false);
      const tip = this.host.addChildLabel(row, 'ForgeFuseGroupTip', enough ? '点击放入 →' : '不足 3 件', colW / 2 - 12 * scale, 0, 17 * scale, enough ? rgba(222, 202, 154) : rgba(148, 136, 114), new Size(colW * 0.3, 26 * scale), HorizontalTextAlignment.RIGHT);
      tip.overflow = Label.Overflow.SHRINK;
      if (enough && !state.busy) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.setLobbyForgeFuseSlots(group.items.slice(0, 3).map((item) => item.id)), this);
        this.host.applyImageButtonFeedback(row, 1.015, 0.985);
      }
    });
  }

  // 可合成分组:未穿戴、非红装,按稀有度低→高(先清白装)、数量多→少排序;组内强化低件优先当材料。
  private collectFuseGroups(items: EquipmentItemVO[]): { slot: string; quality: string; items: EquipmentItemVO[] }[] {
    const groups = new Map<string, { slot: string; quality: string; items: EquipmentItemVO[] }>();
    items.forEach((item) => {
      const quality = (item.quality || '').toUpperCase();
      if (item.heroId != null || quality === 'RED') {
        return;
      }
      const key = `${item.slot}:${quality}`;
      const entry = groups.get(key) ?? { slot: item.slot, quality, items: [] };
      entry.items.push(item);
      groups.set(key, entry);
    });
    const list = [...groups.values()];
    list.forEach((group) => group.items.sort((a, b) => (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0)));
    return list.sort((a, b) =>
      EQUIP_QUALITY_ORDER.indexOf(a.quality) - EQUIP_QUALITY_ORDER.indexOf(b.quality)
      || b.items.length - a.items.length
      || a.slot.localeCompare(b.slot));
  }

  // ===== 宝石页签(P5):左装备网格(开孔装备,穿标) + 右孔位面板(第 i 孔=i 阶专槽,镶嵌/拆卸) =====
  private renderGemTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: { gemEquipId: number | null; gemPickSlot: number | null },
    panelWidth: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    const sideW = Math.min(410 * scale, panelWidth * 0.32);
    const sideGap = 18 * scale;
    const leftW = panelWidth - 56 * scale - sideW - sideGap;
    const leftCx = -(sideW + sideGap) / 2;
    // 只列出有孔的装备(绿装起);穿戴优先 → 品质降序 → 强化降序。
    const pool = state.items
      .filter((item) => gemOpenSlots(item.quality) > 0)
      .sort((a, b) =>
        (b.heroId != null ? 1 : 0) - (a.heroId != null ? 1 : 0)
        || EQUIP_QUALITY_ORDER.indexOf((b.quality || '').toUpperCase()) - EQUIP_QUALITY_ORDER.indexOf((a.quality || '').toUpperCase())
        || (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0)
        || a.slot.localeCompare(b.slot));
    const selected = pool.find((item) => item.id === forge.gemEquipId) ?? pool[0] ?? null;

    const gridTop = contentTop - 8 * scale;
    const gridBottom = contentBottom + 8 * scale;
    const cell = 88 * scale;
    const gap = 10 * scale;
    const columns = Math.max(1, Math.floor((leftW + gap) / (cell + gap)));
    const rows = Math.max(1, Math.floor((gridTop - gridBottom + gap) / (cell + gap)));
    const capacity = columns * rows;
    const gridLeft = leftCx - leftW / 2 + cell / 2;
    if (pool.length <= 0) {
      const empty = this.host.addChildLabel(parent, 'ForgeGemEmpty', '暂无可镶嵌装备(绿装起开孔)。', leftCx, (gridTop + gridBottom) / 2, 20 * scale, rgba(150, 140, 120), new Size(leftW, 30 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    }
    pool.slice(0, capacity).forEach((item, index) => {
      const col = index % columns;
      const rowIndex = Math.floor(index / columns);
      const x = gridLeft + col * (cell + gap);
      const y = gridTop - cell / 2 - rowIndex * (cell + gap);
      const node = this.renderEquipCell(parent, `ForgeGemCell_${item.id}`, item, x, y, cell, scale, selected != null && selected.id === item.id);
      if (!state.busy) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.selectLobbyForgeGemEquip(item.id), this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
    if (pool.length > capacity) {
      const more = this.host.addChildLabel(parent, 'ForgeGemMore', `共 ${pool.length} 件,显示前 ${capacity} 件`, leftCx, gridBottom - 2 * scale, 16 * scale, rgba(150, 140, 120), new Size(leftW, 24 * scale));
      more.overflow = Label.Overflow.SHRINK;
    }

    // 右侧孔位面板。
    const sideCx = panelWidth / 2 - 28 * scale - sideW / 2;
    const sideH = contentTop - contentBottom;
    const sideCy = (contentTop + contentBottom) / 2;
    const side = this.host.addChildPlainNode(parent, 'ForgeGemSidePanel', sideCx, sideCy, sideW, sideH);
    const sg = side.addComponent(Graphics);
    sg.fillColor = rgba(12, 10, 9, 232);
    sg.roundRect(-sideW / 2, -sideH / 2, sideW, sideH, 12 * scale);
    sg.fill();
    sg.strokeColor = rgba(190, 148, 78, 200);
    sg.lineWidth = 1.8 * scale;
    sg.roundRect(-sideW / 2, -sideH / 2, sideW, sideH, 12 * scale);
    sg.stroke();
    const sideTitle = this.host.addChildLabel(side, 'ForgeGemSideTitle', '宝石镶嵌', 0, sideH / 2 - 28 * scale, 22 * scale, rgba(248, 220, 153), new Size(sideW - 36 * scale, 28 * scale));
    sideTitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(sideTitle, scale, true);
    if (!selected) {
      const hint = this.host.addChildLabel(side, 'ForgeGemSideHint', '点击左侧装备查看孔位', 0, 0, 18 * scale, rgba(170, 156, 128), new Size(sideW - 40 * scale, 26 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      return;
    }
    const q = equipQualityColor(selected.quality);
    const enhanceSuffix = (selected.enhanceLevel ?? 0) > 0 ? ` +${selected.enhanceLevel}` : '';
    const name = this.host.addChildLabel(side, 'ForgeGemSideName', `${safeText(selected.equipName)}${enhanceSuffix}${selected.heroId != null ? '（已穿）' : ''}`, 0, sideH / 2 - 58 * scale, 19 * scale, rgba(q.r, q.g, q.b, 255), new Size(sideW - 36 * scale, 24 * scale));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, false);

    // 5 行孔位:未开孔灰锁 / 空孔三类型镶嵌钮 / 已镶名称+属性+拆卸钮。
    const open = gemOpenSlots(selected.quality);
    const rowsTop = sideH / 2 - 82 * scale;
    const rowH = (rowsTop - (-sideH / 2 + 14 * scale)) / 5;
    const rowW = sideW - 28 * scale;
    const gems = selected.gems ?? [];
    for (let i = 0; i < 5; i += 1) {
      const rowCy = rowsTop - rowH * i - rowH / 2;
      const opened = i < open;
      const info = opened ? parseGemCode(gems[i]) : null;
      // 任意孔可镶任意阶:行色/阶章跟随已镶宝石的阶,空孔中性暗金。
      const tierQ = info ? equipQualityColor(GEM_TIER_QUALITY[info.tier - 1]) : { r: 168, g: 148, b: 110 };
      const row = this.host.addChildPlainNode(side, `ForgeGemSlotRow_${i}`, 0, rowCy, rowW, rowH - 8 * scale);
      const rg = row.addComponent(Graphics);
      rg.fillColor = opened ? rgba(24, 20, 17, 235) : rgba(16, 14, 13, 200);
      rg.roundRect(-rowW / 2, -(rowH - 8 * scale) / 2, rowW, rowH - 8 * scale, 9 * scale);
      rg.fill();
      rg.strokeColor = opened ? rgba(tierQ.r, tierQ.g, tierQ.b, info ? 220 : 130) : rgba(96, 84, 64, 120);
      rg.lineWidth = (info ? 2 : 1.3) * scale;
      rg.stroke();
      // 阶章。
      const badge = this.host.addChildPlainNode(row, 'TierBadge', -rowW / 2 + 26 * scale, 0, 34 * scale, 34 * scale);
      const bg = badge.addComponent(Graphics);
      bg.fillColor = opened ? rgba(Math.round(tierQ.r * 0.3), Math.round(tierQ.g * 0.3), Math.round(tierQ.b * 0.3), 240) : rgba(30, 27, 24, 220);
      bg.circle(0, 0, 17 * scale);
      bg.fill();
      bg.strokeColor = opened ? rgba(tierQ.r, tierQ.g, tierQ.b, 230) : rgba(96, 84, 64, 160);
      bg.lineWidth = 1.6 * scale;
      bg.circle(0, 0, 17 * scale);
      bg.stroke();
      const badgeLabel = this.host.addChildLabel(badge, 'Label', ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'][i], 0, 0, 17 * scale, opened ? rgba(tierQ.r, tierQ.g, tierQ.b, 255) : rgba(120, 108, 88, 255), new Size(30 * scale, 24 * scale));
      badgeLabel.overflow = Label.Overflow.SHRINK;
      if (!opened) {
        const locked = this.host.addChildLabel(row, 'LockedText', `未开孔 · ${equipQualityLabel(GEM_TIER_QUALITY[i])}及以上装备开放`, -rowW / 2 + 52 * scale, 0, 15 * scale, rgba(130, 118, 98, 255), new Size(rowW - 64 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
        locked.overflow = Label.Overflow.SHRINK;
        continue;
      }
      if (info) {
        this.host.addSprite('GemArt', gemIconAsset(info.type), -rowW / 2 + 68 * scale, 0, 44 * scale, 44 * scale, row);
        const gemName = this.host.addChildLabel(row, 'GemName', info.label, -rowW / 2 + 90 * scale, 11 * scale, 17 * scale, rgba(tierQ.r, tierQ.g, tierQ.b, 255), new Size(rowW * 0.42, 22 * scale), HorizontalTextAlignment.LEFT);
        gemName.overflow = Label.Overflow.SHRINK;
        this.applyOutline(gemName, scale, false);
        const gemAttr = this.host.addChildLabel(row, 'GemAttr', info.attrText, -rowW / 2 + 90 * scale, -11 * scale, 14 * scale, rgba(238, 210, 148), new Size(rowW * 0.48, 18 * scale), HorizontalTextAlignment.LEFT);
        gemAttr.overflow = Label.Overflow.SHRINK;
        const btnW = 108 * scale;
        const btnH = 36 * scale;
        const btn = this.host.addChildPlainNode(row, 'UnsocketBtn', rowW / 2 - 10 * scale - btnW / 2, 0, btnW, btnH);
        const ug = btn.addComponent(Graphics);
        ug.fillColor = state.busy ? rgba(58, 52, 42, 210) : rgba(44, 62, 86, 232);
        ug.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 8 * scale);
        ug.fill();
        ug.strokeColor = rgba(150, 170, 200, 190);
        ug.lineWidth = 1.4 * scale;
        ug.stroke();
        const btnLabel = this.host.addChildLabel(btn, 'Label', `拆卸 ${formatInteger(gemUnsocketGold(info.tier))}金`, 0, 0, 14 * scale, rgba(214, 226, 244), new Size(btnW - 8 * scale, 26 * scale));
        btnLabel.overflow = Label.Overflow.SHRINK;
        if (!state.busy) {
          btn.addComponent(Button);
          btn.on(Button.EventType.CLICK, () => this.host.unsocketLobbyForgeGem(selected.id, i), this);
          this.host.applyImageButtonFeedback(btn);
        }
        continue;
      }
      const emptyHint = this.host.addChildLabel(row, 'EmptyHint', '未镶嵌 · 任意阶宝石可镶', -rowW / 2 + 52 * scale, 0, 15 * scale, rgba(160, 148, 126, 255), new Size(rowW * 0.52, 20 * scale), HorizontalTextAlignment.LEFT);
      emptyHint.overflow = Label.Overflow.SHRINK;
      const pickW = 108 * scale;
      const pickBtn = this.host.addChildPlainNode(row, 'SocketPickBtn', rowW / 2 - 10 * scale - pickW / 2, 0, pickW, 36 * scale);
      const pg = pickBtn.addComponent(Graphics);
      pg.fillColor = state.busy ? rgba(58, 52, 42, 210) : rgba(96, 58, 22, 235);
      pg.roundRect(-pickW / 2, -18 * scale, pickW, 36 * scale, 8 * scale);
      pg.fill();
      pg.strokeColor = rgba(222, 176, 96, 210);
      pg.lineWidth = 1.4 * scale;
      pg.stroke();
      const pickLabel = this.host.addChildLabel(pickBtn, 'Label', '镶 嵌', 0, 0, 16 * scale, rgba(248, 224, 168), new Size(pickW - 8 * scale, 26 * scale));
      pickLabel.overflow = Label.Overflow.SHRINK;
      if (!state.busy) {
        pickBtn.addComponent(Button);
        pickBtn.on(Button.EventType.CLICK, () => this.host.setLobbyForgeGemPickSlot(i), this);
        this.host.applyImageButtonFeedback(pickBtn);
      }
    }
    if (forge.gemPickSlot != null && forge.gemPickSlot < open) {
      this.renderGemPickDialog(parent, selected, forge.gemPickSlot, state.busy, panelWidth, scale);
    }
  }

  // 宝石选择弹窗:列出背包全部宝石(阶升序),点击即镶到目标孔;五阶受"每件限 1 颗"约束置灰。
  private renderGemPickDialog(parent: Node, selected: EquipmentItemVO, slotIndex: number, busy: boolean, panelWidth: number, scale: number): void {
    const overlay = this.host.addChildPlainNode(parent, 'ForgeGemPickOverlay', 0, 0, panelWidth * 2, panelWidth * 2);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 170);
    og.rect(-panelWidth, -panelWidth, panelWidth * 2, panelWidth * 2);
    og.fill();
    const bag = this.host.currentLobbyBagState();
    const owned = bag.groups
      .flatMap((group) => group.items)
      .filter((item) => (item.itemCode || '').toUpperCase().startsWith('GEM_'))
      .map((item) => ({ info: parseGemCode(item.itemCode), count: Number(item.itemCount) || 0 }))
      .filter((entry) => entry.info != null && entry.count > 0)
      .sort((a, b) => a.info!.tier - b.info!.tier || a.info!.type.localeCompare(b.info!.type));
    const hasT5 = (selected.gems ?? []).some((code, index) => index !== slotIndex && (parseGemCode(code)?.tier ?? 0) === 5);
    const shown = owned.slice(0, 10);
    const rowH = 52 * scale;
    const w = 460 * scale;
    const h = (150 + shown.length * 52 + (owned.length === 0 ? 40 : 0)) * scale;
    const dialog = this.host.addChildPlainNode(overlay, 'ForgeGemPickDialog', 0, 0, w, h);
    const g = dialog.addComponent(Graphics);
    g.fillColor = rgba(14, 11, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.fill();
    g.strokeColor = rgba(214, 168, 82, 230);
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.stroke();
    const title = this.host.addChildLabel(dialog, 'ForgeGemPickTitle', `选择宝石 · 第 ${slotIndex + 1} 孔`, 0, h / 2 - 30 * scale, 20 * scale, rgba(248, 220, 153), new Size(w - 48 * scale, 26 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    if (owned.length === 0) {
      const empty = this.host.addChildLabel(dialog, 'ForgeGemPickEmpty', '背包暂无宝石:爬塔BOSS首通、分解炽红装备可获得。', 0, h / 2 - 78 * scale, 15 * scale, rgba(170, 156, 128), new Size(w - 56 * scale, 22 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    }
    shown.forEach((entry, index) => {
      const info = entry.info!;
      const blocked = info.tier === 5 && hasT5;
      const enabled = !busy && !blocked;
      const tq = equipQualityColor(GEM_TIER_QUALITY[info.tier - 1]);
      const rowY = h / 2 - 72 * scale - index * rowH;
      const rowW = w - 48 * scale;
      const row = this.host.addChildPlainNode(dialog, `ForgeGemPickRow_${info.code}`, 0, rowY, rowW, rowH - 8 * scale);
      const rg = row.addComponent(Graphics);
      rg.fillColor = enabled ? rgba(Math.round(tq.r * 0.16 + 12), Math.round(tq.g * 0.16 + 12), Math.round(tq.b * 0.16 + 12), 235) : rgba(22, 20, 18, 210);
      rg.roundRect(-rowW / 2, -(rowH - 8 * scale) / 2, rowW, rowH - 8 * scale, 8 * scale);
      rg.fill();
      rg.strokeColor = enabled ? rgba(tq.r, tq.g, tq.b, 200) : rgba(100, 88, 66, 130);
      rg.lineWidth = 1.4 * scale;
      rg.stroke();
      const gemArt = this.host.addSprite('GemArt', gemIconAsset(info.type), -rowW / 2 + 26 * scale, 0, 40 * scale, 40 * scale, row);
      const textLeft = gemArt ? 48 : 14;
      const nm = this.host.addChildLabel(row, 'Name', info.label, -rowW / 2 + textLeft * scale, 10 * scale, 16 * scale, enabled ? rgba(tq.r, tq.g, tq.b, 255) : rgba(140, 128, 106, 255), new Size(rowW * 0.4, 20 * scale), HorizontalTextAlignment.LEFT);
      nm.overflow = Label.Overflow.SHRINK;
      const attr = this.host.addChildLabel(row, 'Attr', blocked ? '每件装备限 1 颗五阶' : info.attrText, -rowW / 2 + textLeft * scale, -10 * scale, 13 * scale, blocked ? rgba(206, 122, 104, 255) : rgba(238, 210, 148, 255), new Size(rowW * 0.55, 17 * scale), HorizontalTextAlignment.LEFT);
      attr.overflow = Label.Overflow.SHRINK;
      const cnt = this.host.addChildLabel(row, 'Count', `×${formatInteger(entry.count)}`, rowW / 2 - 14 * scale, 0, 16 * scale, rgba(240, 218, 156, 255), new Size(80 * scale, 22 * scale), HorizontalTextAlignment.RIGHT);
      cnt.overflow = Label.Overflow.SHRINK;
      if (enabled) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.socketLobbyForgeGem(selected.id, slotIndex, info.code), this);
        this.host.applyImageButtonFeedback(row);
      }
    });
    if (owned.length > shown.length) {
      const more = this.host.addChildLabel(dialog, 'ForgeGemPickMore', `共 ${owned.length} 种,显示前 ${shown.length} 种`, 0, -h / 2 + 74 * scale, 13 * scale, rgba(150, 140, 120), new Size(w - 48 * scale, 18 * scale));
      more.overflow = Label.Overflow.SHRINK;
    }
    const cancelW = 150 * scale;
    const cancel = this.host.addChildPlainNode(dialog, 'ForgeGemPickCancel', 0, -h / 2 + 40 * scale, cancelW, 42 * scale);
    const xg = cancel.addComponent(Graphics);
    xg.fillColor = rgba(28, 24, 22, 230);
    xg.roundRect(-cancelW / 2, -21 * scale, cancelW, 42 * scale, 9 * scale);
    xg.fill();
    xg.strokeColor = rgba(128, 108, 76, 190);
    xg.lineWidth = 1.5 * scale;
    xg.stroke();
    const cancelLabel = this.host.addChildLabel(cancel, 'Label', '取消', 0, 0, 17 * scale, rgba(214, 198, 168), new Size(cancelW - 12 * scale, 28 * scale));
    cancelLabel.overflow = Label.Overflow.SHRINK;
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, () => this.host.setLobbyForgeGemPickSlot(null), this);
    this.host.applyImageButtonFeedback(cancel);
  }

  // ===== 分解页签(2026-07-24 参考图改版):双行筛选 + 左网格 + 右「分解概览」栏 + 批量分解设置 =====
  private renderDecomposeTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: { decomposeSelectedIds: number[]; decomposeRarity: string | null; decomposeEnhance: 'all' | 'zero' | 'plus'; decomposeBatchOpen: boolean },
    panelWidth: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    const selected = new Set(forge.decomposeSelectedIds);
    const unworn = state.items.filter((item) => item.heroId == null);
    const pool = unworn
      .filter((item) => !forge.decomposeRarity || (item.quality || '').toUpperCase() === forge.decomposeRarity)
      .filter((item) => {
        const level = item.enhanceLevel ?? 0;
        return forge.decomposeEnhance === 'all' || (forge.decomposeEnhance === 'zero' ? level === 0 : level > 0);
      })
      .sort((a, b) =>
        EQUIP_QUALITY_ORDER.indexOf((a.quality || '').toUpperCase()) - EQUIP_QUALITY_ORDER.indexOf((b.quality || '').toUpperCase())
        || (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0)
        || a.slot.localeCompare(b.slot));

    // 版面切分:右侧概览栏固定宽,左侧筛选+网格+底部条。
    const sideW = Math.min(330 * scale, panelWidth * 0.26);
    const sideGap = 18 * scale;
    const leftW = panelWidth - 56 * scale - sideW - sideGap;
    const leftCx = -(sideW + sideGap) / 2;

    // 双行筛选:行1 稀有度 / 行2 强化状态。
    const rowH = 46 * scale;
    const rowGap = 8 * scale;
    const chipH = 34 * scale;
    const makeChip = (bar: Node, name: string, x: number, w: number, text: string, on: boolean, tint: { r: number; g: number; b: number } | null, onClick: () => void) => {
      const chip = this.host.addChildPlainNode(bar, name, x + w / 2, 0, w, chipH);
      const g = chip.addComponent(Graphics);
      g.fillColor = on ? rgba(96, 34, 24, 245) : rgba(24, 21, 19, 225);
      g.roundRect(-w / 2, -chipH / 2, w, chipH, 8 * scale);
      g.fill();
      g.strokeColor = on ? rgba(248, 206, 110, 245) : rgba(tint?.r ?? 130, tint?.g ?? 112, tint?.b ?? 88, on ? 245 : 160);
      g.lineWidth = (on ? 2.2 : 1.3) * scale;
      g.stroke();
      const label = this.host.addChildLabel(chip, `${name}Label`, text, 0, 0, 19 * scale, on ? rgba(252, 230, 168) : rgba(tint?.r ?? 200, tint?.g ?? 186, tint?.b ?? 154, 255), new Size(w - 8 * scale, chipH - 6 * scale));
      label.overflow = Label.Overflow.SHRINK;
      if (on) {
        this.applyOutline(label, scale, false);
      } else {
        chip.addComponent(Button);
        chip.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(chip);
      }
      return x + w + 8 * scale;
    };
    const makeFilterRow = (name: string, y: number, tag: string): { bar: Node; startX: number } => {
      const bar = this.host.addChildPlainNode(parent, name, leftCx, y, leftW, rowH);
      const bg = bar.addComponent(Graphics);
      bg.fillColor = rgba(10, 8, 8, 216);
      bg.roundRect(-leftW / 2, -rowH / 2, leftW, rowH, 10 * scale);
      bg.fill();
      bg.strokeColor = rgba(140, 108, 62, 150);
      bg.lineWidth = 1.3 * scale;
      bg.stroke();
      const tagLabel = this.host.addChildLabel(bar, `${name}Tag`, tag, -leftW / 2 + 16 * scale, 0, 18 * scale, rgba(170, 150, 116), new Size(76 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
      tagLabel.overflow = Label.Overflow.SHRINK;
      return { bar, startX: -leftW / 2 + 96 * scale };
    };
    const rarityRow = makeFilterRow('ForgeDecFilterBar', contentTop - rowH / 2, '稀有度');
    let chipX = rarityRow.startX;
    chipX = makeChip(rarityRow.bar, 'ForgeDecFilterAll', chipX, 66 * scale, '全部', forge.decomposeRarity === null, null, () => this.host.setLobbyForgeDecomposeRarity(null));
    EQUIP_QUALITY_ORDER.forEach((quality) => {
      chipX = makeChip(rarityRow.bar, `ForgeDecFilter_${quality}`, chipX, 66 * scale, equipQualityLabel(quality), forge.decomposeRarity === quality, equipQualityColor(quality), () => this.host.setLobbyForgeDecomposeRarity(quality));
    });
    const enhRow = makeFilterRow('ForgeDecEnhBar', contentTop - rowH - rowGap - rowH / 2, '强化状态');
    chipX = enhRow.startX;
    chipX = makeChip(enhRow.bar, 'ForgeDecEnhAll', chipX, 66 * scale, '全部', forge.decomposeEnhance === 'all', null, () => this.host.setLobbyForgeDecomposeEnhance('all'));
    chipX = makeChip(enhRow.bar, 'ForgeDecEnhZero', chipX, 84 * scale, '未强化', forge.decomposeEnhance === 'zero', null, () => this.host.setLobbyForgeDecomposeEnhance('zero'));
    makeChip(enhRow.bar, 'ForgeDecEnhPlus', chipX, 84 * scale, '已强化', forge.decomposeEnhance === 'plus', null, () => this.host.setLobbyForgeDecomposeEnhance('plus'));

    // 左侧网格。
    const gridTop = contentTop - 2 * (rowH + rowGap) - 8 * scale;
    const footerH = 62 * scale;
    const gridBottom = contentBottom + footerH;
    const gridW = leftW;
    const cell = 88 * scale;
    const gap = 10 * scale;
    const columns = Math.max(1, Math.floor((gridW + gap) / (cell + gap)));
    const rows = Math.max(1, Math.floor((gridTop - gridBottom + gap) / (cell + gap)));
    const capacity = columns * rows;
    const gridLeft = leftCx - gridW / 2 + cell / 2;
    if (pool.length <= 0) {
      const empty = this.host.addChildLabel(parent, 'ForgeDecEmpty', '当前筛选下没有可分解的未穿戴装备。', leftCx, (gridTop + gridBottom) / 2, 20 * scale, rgba(150, 140, 120), new Size(gridW, 30 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    }
    pool.slice(0, capacity).forEach((item, index) => {
      const col = index % columns;
      const rowIndex = Math.floor(index / columns);
      const x = gridLeft + col * (cell + gap);
      const y = gridTop - cell / 2 - rowIndex * (cell + gap);
      const isSelected = selected.has(item.id);
      const node = this.renderEquipCell(parent, `ForgeDecCell_${item.id}`, item, x, y, cell, scale, isSelected);
      if (isSelected) {
        const mark = this.host.addChildLabel(node, 'ForgeDecCellMark', '✓', -cell / 2 + 14 * scale, cell / 2 - 13 * scale, 20 * scale, rgba(248, 206, 110), new Size(22 * scale, 28 * scale));
        mark.overflow = Label.Overflow.SHRINK;
        this.applyOutline(mark, scale, true);
      }
      if (!state.busy) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeDecomposeSelect(item.id), this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
    if (pool.length > capacity) {
      const more = this.host.addChildLabel(parent, 'ForgeDecMore', `共 ${pool.length} 件,显示前 ${capacity} 件(可用筛选缩小范围)`, leftCx, gridBottom - 2 * scale, 16 * scale, rgba(150, 140, 120), new Size(gridW, 24 * scale));
      more.overflow = Label.Overflow.SHRINK;
    }

    // 选中统计与附加产出估算区间。
    const chosen = pool.filter((item) => selected.has(item.id));
    const estimate = chosen.reduce((sum, item) => {
      const level = item.enhanceLevel ?? 0;
      const invested = (level * (level + 1)) / 2;
      return sum + (DECOMPOSE_BASE_STONES[(item.quality || '').toUpperCase()] ?? 1) + Math.floor(invested / 2);
    }, 0);
    const sumRange = (table: Record<string, [number, number]>): [number, number] => chosen.reduce<[number, number]>((acc, item) => {
      const range = table[(item.quality || '').toUpperCase()];
      return range ? [acc[0] + range[0], acc[1] + range[1]] : acc;
    }, [0, 0]);
    const blessRange = sumRange(DECOMPOSE_BLESS_RANGE);
    const runeRange = sumRange(DECOMPOSE_RUNE_RANGE);

    // 底部条(左区):已选统计 + 一键全选 / 清空。
    const footerY = contentBottom + footerH / 2;
    const summary = this.host.addChildLabel(parent, 'ForgeDecSummary', `已选 ${chosen.length} 件 · 预计强化石 ~${formatInteger(estimate)}（单次上限 20 件）`, leftCx - gridW / 2 + 6 * scale, footerY, 18 * scale, rgba(238, 208, 144), new Size(gridW * 0.5, 28 * scale), HorizontalTextAlignment.LEFT);
    summary.overflow = Label.Overflow.SHRINK;
    const makeSmallButton = (name: string, x: number, w: number, text: string, enabled: boolean, onClick: () => void) => {
      const btn = this.host.addChildPlainNode(parent, name, x, footerY, w, 42 * scale);
      const g = btn.addComponent(Graphics);
      g.fillColor = enabled ? rgba(44, 62, 86, 235) : rgba(48, 44, 38, 205);
      g.roundRect(-w / 2, -21 * scale, w, 42 * scale, 9 * scale);
      g.fill();
      g.strokeColor = rgba(150, 170, 200, 190);
      g.lineWidth = 1.5 * scale;
      g.stroke();
      const label = this.host.addChildLabel(btn, `${name}Label`, text, 0, 0, 19 * scale, rgba(214, 226, 244), new Size(w - 10 * scale, 38 * scale));
      label.overflow = Label.Overflow.SHRINK;
      if (enabled) {
        btn.addComponent(Button);
        btn.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(btn);
      }
    };
    const visibleIds = pool.slice(0, capacity).map((item) => item.id);
    makeSmallButton('ForgeDecSelectAll', leftCx + gridW / 2 - 110 * scale - 12 * scale - 55 * scale, 110 * scale, '一键全选', !state.busy && visibleIds.length > 0, () => this.host.setLobbyForgeDecomposeSelection(visibleIds));
    makeSmallButton('ForgeDecClear', leftCx + gridW / 2 - 55 * scale, 110 * scale, '清空', !state.busy && chosen.length > 0, () => this.host.setLobbyForgeDecomposeSelection([]));

    // 右侧「分解概览」栏。
    const sideCx = panelWidth / 2 - 28 * scale - sideW / 2;
    const sideH = contentTop - contentBottom;
    const sideCy = (contentTop + contentBottom) / 2;
    const side = this.host.addChildPlainNode(parent, 'ForgeDecSidePanel', sideCx, sideCy, sideW, sideH);
    const sg = side.addComponent(Graphics);
    sg.fillColor = rgba(12, 10, 9, 232);
    sg.roundRect(-sideW / 2, -sideH / 2, sideW, sideH, 12 * scale);
    sg.fill();
    sg.strokeColor = rgba(190, 148, 78, 200);
    sg.lineWidth = 1.8 * scale;
    sg.roundRect(-sideW / 2, -sideH / 2, sideW, sideH, 12 * scale);
    sg.stroke();
    const sideTitle = this.host.addChildLabel(side, 'ForgeDecSideTitle', '分解概览', 0, sideH / 2 - 30 * scale, 22 * scale, rgba(248, 220, 153), new Size(sideW - 36 * scale, 28 * scale));
    sideTitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(sideTitle, scale, true);
    const drawDivider = (y: number) => {
      const div = this.host.addChildPlainNode(side, 'ForgeDecSideDiv', 0, y, sideW - 40 * scale, 2);
      const dg = div.addComponent(Graphics);
      dg.strokeColor = rgba(150, 118, 66, 130);
      dg.lineWidth = 1.2 * scale;
      dg.moveTo(-(sideW - 40 * scale) / 2, 0);
      dg.lineTo((sideW - 40 * scale) / 2, 0);
      dg.stroke();
    };
    drawDivider(sideH / 2 - 50 * scale);
    const chosenTag = this.host.addChildLabel(side, 'ForgeDecSideChosenTag', '已选装备', 0, sideH / 2 - 76 * scale, 16 * scale, rgba(186, 166, 128), new Size(sideW - 36 * scale, 22 * scale));
    chosenTag.overflow = Label.Overflow.SHRINK;
    const chosenNum = this.host.addChildLabel(side, 'ForgeDecSideChosenNum', `${chosen.length}/20 件`, 0, sideH / 2 - 112 * scale, 34 * scale, rgba(252, 208, 96), new Size(sideW - 36 * scale, 42 * scale));
    chosenNum.overflow = Label.Overflow.SHRINK;
    this.applyOutline(chosenNum, scale, true);
    drawDivider(sideH / 2 - 142 * scale);
    const gainTag = this.host.addChildLabel(side, 'ForgeDecSideGainTag', '预计获得', 0, sideH / 2 - 166 * scale, 16 * scale, rgba(186, 166, 128), new Size(sideW - 36 * scale, 22 * scale));
    gainTag.overflow = Label.Overflow.SHRINK;
    const stoneIconSize = 54 * scale;
    this.host.addSprite('ForgeDecSideStoneIcon', 'ui/bag/ai/icon_enhance_low/spriteFrame', -sideW / 2 + 44 * scale, sideH / 2 - 212 * scale, stoneIconSize, stoneIconSize, side);
    const stoneName = this.host.addChildLabel(side, 'ForgeDecSideStoneName', '强化石', -sideW / 2 + 84 * scale, sideH / 2 - 196 * scale, 17 * scale, rgba(206, 190, 158), new Size(sideW - 130 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    stoneName.overflow = Label.Overflow.SHRINK;
    const stoneNum = this.host.addChildLabel(side, 'ForgeDecSideStoneNum', `${formatInteger(estimate)}`, -sideW / 2 + 84 * scale, sideH / 2 - 226 * scale, 30 * scale, rgba(196, 132, 252), new Size(sideW - 130 * scale, 38 * scale), HorizontalTextAlignment.LEFT);
    stoneNum.overflow = Label.Overflow.SHRINK;
    this.applyOutline(stoneNum, scale, true);
    drawDivider(sideH / 2 - 254 * scale);
    const bonusTag = this.host.addChildLabel(side, 'ForgeDecSideBonusTag', '可能获得材料', 0, sideH / 2 - 278 * scale, 16 * scale, rgba(186, 166, 128), new Size(sideW - 36 * scale, 22 * scale));
    bonusTag.overflow = Label.Overflow.SHRINK;
    const bonusDefs: Array<{ key: string; icon: string; label: string; range: [number, number] }> = [
      { key: 'bless', icon: 'ui/forge/ai/icon_bless_stone/spriteFrame', label: '祝福石', range: blessRange },
      { key: 'rune', icon: 'ui/forge/ai/icon_guard_rune/spriteFrame', label: '护符', range: runeRange },
    ];
    const bonusColW = (sideW - 40 * scale) / 2;
    bonusDefs.forEach((def, index) => {
      const colX = -sideW / 2 + 20 * scale + bonusColW * index + bonusColW / 2;
      const colTop = sideH / 2 - 300 * scale;
      this.host.addSprite(`ForgeDecSideBonusIcon_${def.key}`, def.icon, colX, colTop - 26 * scale, 46 * scale, 46 * scale, side);
      const nameLabel = this.host.addChildLabel(side, `ForgeDecSideBonusName_${def.key}`, def.label, colX, colTop - 58 * scale, 14 * scale, rgba(206, 190, 158), new Size(bonusColW - 4 * scale, 18 * scale));
      nameLabel.overflow = Label.Overflow.SHRINK;
      const rangeText = def.range[1] <= 0 ? 'x0' : `x${def.range[0]}~${def.range[1]}`;
      const rangeLabel = this.host.addChildLabel(side, `ForgeDecSideBonusRange_${def.key}`, rangeText, colX, colTop - 78 * scale, 14 * scale, rgba(238, 208, 144), new Size(bonusColW - 4 * scale, 18 * scale));
      rangeLabel.overflow = Label.Overflow.SHRINK;
    });
    const warn = this.host.addChildLabel(side, 'ForgeDecSideWarn', '！高品质装备分解可获得更多材料', 0, sideH / 2 - 398 * scale, 14 * scale, rgba(232, 130, 92), new Size(sideW - 32 * scale, 20 * scale));
    warn.overflow = Label.Overflow.SHRINK;
    // 分解主按钮 + 批量分解设置。
    const confirmW = Math.min(sideW - 44 * scale, 240 * scale);
    this.renderPrimaryButton(side, 'ForgeDecConfirm', state.busy ? '分解中…' : `分 解${chosen.length > 0 ? `（${chosen.length}）` : ''}`, 0, -sideH / 2 + 118 * scale, confirmW, scale, !state.busy && chosen.length > 0, () => this.host.decomposeLobbyForgeSelected());
    const batchW = confirmW;
    const batchBtn = this.host.addChildPlainNode(side, 'ForgeDecBatchButton', 0, -sideH / 2 + 52 * scale, batchW, 44 * scale);
    const bbg = batchBtn.addComponent(Graphics);
    bbg.fillColor = rgba(26, 22, 20, 235);
    bbg.roundRect(-batchW / 2, -22 * scale, batchW, 44 * scale, 9 * scale);
    bbg.fill();
    bbg.strokeColor = rgba(160, 128, 76, 190);
    bbg.lineWidth = 1.5 * scale;
    bbg.stroke();
    const batchLabel = this.host.addChildLabel(batchBtn, 'ForgeDecBatchButtonLabel', '批量分解设置', 0, 0, 18 * scale, rgba(214, 196, 166), new Size(batchW - 16 * scale, 32 * scale));
    batchLabel.overflow = Label.Overflow.SHRINK;
    if (!state.busy) {
      batchBtn.addComponent(Button);
      batchBtn.on(Button.EventType.CLICK, () => this.host.setLobbyForgeDecomposeBatchOpen(true), this);
      this.host.applyImageButtonFeedback(batchBtn);
    }

    // 批量分解设置弹窗:按规则快速勾选(≤20 件)。
    if (forge.decomposeBatchOpen) {
      this.renderDecomposeBatchDialog(parent, unworn, panelWidth, scale);
    }
  }

  // 批量分解设置:常用规则一键选满(白绿装/蓝装及以下/未强化),交给现有选中集(上限 20)。
  private renderDecomposeBatchDialog(parent: Node, unworn: EquipmentItemVO[], panelWidth: number, scale: number): void {
    const overlay = this.host.addChildPlainNode(parent, 'ForgeDecBatchOverlay', 0, 0, panelWidth * 2, panelWidth * 2);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 170);
    og.rect(-panelWidth, -panelWidth, panelWidth * 2, panelWidth * 2);
    og.fill();
    const w = 420 * scale;
    const h = 330 * scale;
    const dialog = this.host.addChildPlainNode(overlay, 'ForgeDecBatchDialog', 0, 0, w, h);
    const g = dialog.addComponent(Graphics);
    g.fillColor = rgba(14, 11, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.fill();
    g.strokeColor = rgba(214, 168, 82, 230);
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.stroke();
    const title = this.host.addChildLabel(dialog, 'ForgeDecBatchTitle', '批量分解设置', 0, h / 2 - 32 * scale, 21 * scale, rgba(248, 220, 153), new Size(w - 48 * scale, 28 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const hint = this.host.addChildLabel(dialog, 'ForgeDecBatchHint', '按规则快速勾选未穿戴装备(单次上限 20 件)', 0, h / 2 - 62 * scale, 15 * scale, rgba(186, 166, 128), new Size(w - 48 * scale, 20 * scale));
    hint.overflow = Label.Overflow.SHRINK;
    const rules: Array<{ key: string; label: string; filter: (item: EquipmentItemVO) => boolean }> = [
      { key: 'lowq', label: '全选 白装 / 绿装', filter: (item) => ['WHITE', 'GREEN'].includes((item.quality || '').toUpperCase()) },
      { key: 'blue', label: '全选 蓝装及以下', filter: (item) => ['WHITE', 'GREEN', 'BLUE'].includes((item.quality || '').toUpperCase()) },
      { key: 'zero', label: '全选 未强化装备', filter: (item) => (item.enhanceLevel ?? 0) === 0 },
    ];
    rules.forEach((rule, index) => {
      const ids = unworn.filter(rule.filter).map((item) => item.id);
      const rowY = h / 2 - 108 * scale - index * 52 * scale;
      const rowW = w - 56 * scale;
      const row = this.host.addChildPlainNode(dialog, `ForgeDecBatchRule_${rule.key}`, 0, rowY, rowW, 44 * scale);
      const rg = row.addComponent(Graphics);
      rg.fillColor = ids.length > 0 ? rgba(40, 33, 22, 235) : rgba(24, 22, 20, 210);
      rg.roundRect(-rowW / 2, -22 * scale, rowW, 44 * scale, 8 * scale);
      rg.fill();
      rg.strokeColor = ids.length > 0 ? rgba(214, 176, 100, 220) : rgba(110, 96, 70, 150);
      rg.lineWidth = 1.4 * scale;
      rg.stroke();
      const rowLabel = this.host.addChildLabel(row, 'Label', `${rule.label}（${Math.min(ids.length, 20)} 件）`, 0, 0, 18 * scale, ids.length > 0 ? rgba(244, 222, 168) : rgba(150, 138, 116), new Size(rowW - 16 * scale, 30 * scale));
      rowLabel.overflow = Label.Overflow.SHRINK;
      if (ids.length > 0) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => {
          this.host.setLobbyForgeDecomposeSelection(ids);
          this.host.setLobbyForgeDecomposeBatchOpen(false);
        }, this);
        this.host.applyImageButtonFeedback(row);
      }
    });
    const cancelW = 160 * scale;
    const cancel = this.host.addChildPlainNode(dialog, 'ForgeDecBatchCancel', 0, -h / 2 + 42 * scale, cancelW, 44 * scale);
    const xg = cancel.addComponent(Graphics);
    xg.fillColor = rgba(28, 24, 22, 230);
    xg.roundRect(-cancelW / 2, -22 * scale, cancelW, 44 * scale, 9 * scale);
    xg.fill();
    xg.strokeColor = rgba(128, 108, 76, 190);
    xg.lineWidth = 1.5 * scale;
    xg.stroke();
    const cancelLabel = this.host.addChildLabel(cancel, 'Label', '取消', 0, 0, 18 * scale, rgba(214, 198, 168), new Size(cancelW - 12 * scale, 30 * scale));
    cancelLabel.overflow = Label.Overflow.SHRINK;
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, () => this.host.setLobbyForgeDecomposeBatchOpen(false), this);
    this.host.applyImageButtonFeedback(cancel);
  }

  // 主操作按钮(强化/合成/分解共用):AI 图优先(2.5:1 等比,高度由宽度推出),缺图红底金描边兜底。
  private renderPrimaryButton(parent: Node, name: string, text: string, x: number, y: number, width: number, scale: number, enabled: boolean, onClick: () => void): void {
    const height = width / FORGE_BUTTON_RATIO;
    const btn = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const art = enabled ? this.host.addSprite(`${name}Art`, FORGE_AI_BUTTON_ASSET, 0, 0, width, height, btn) : null;
    if (!art) {
      const g = btn.addComponent(Graphics);
      g.fillColor = enabled ? rgba(122, 42, 30, 240) : rgba(42, 22, 18, 232);
      g.roundRect(-width / 2, -height / 2, width, height, 9 * scale);
      g.fill();
      g.strokeColor = enabled ? rgba(240, 186, 96, 235) : rgba(164, 126, 68, 185);
      g.lineWidth = 2 * scale;
      g.roundRect(-width / 2, -height / 2, width, height, 9 * scale);
      g.stroke();
      g.strokeColor = enabled ? rgba(170, 120, 60, 160) : rgba(112, 84, 48, 140);
      g.lineWidth = 1.1 * scale;
      g.roundRect(-width / 2 + 4 * scale, -height / 2 + 4 * scale, width - 8 * scale, height - 8 * scale, 7 * scale);
      g.stroke();
    }
    const label = this.host.addChildLabel(btn, `${name}Label`, text, 0, 0, 23 * scale, enabled ? rgba(250, 228, 172) : rgba(214, 190, 152), new Size(width - 18 * scale, height - 10 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    if (enabled) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, onClick, this);
      this.host.applyImageButtonFeedback(btn);
    }
  }

  // 装备图标:真图(v2 不透明暗底方图,直出无衬底)优先 → 部位图标 → 线稿。box 为容器边长,offsetY 为垂直偏移。
  private addEquipIcon(parent: Node, name: string, equipCode: string | null | undefined, slot: string, box: number, scale: number, offsetY = 0): void {
    const equipAsset = equipIconAssetByCode(equipCode);
    if (equipAsset) {
      const iconW = box * 0.96;
      if (this.host.addSprite(name, equipAsset, 0, offsetY, iconW, iconW, parent)) {
        return;
      }
    }
    const slotAsset = FORGE_AI_SLOT_ICON_ASSETS[slot];
    if (slotAsset && this.host.addSprite(name, slotAsset, 0, offsetY, box * 0.7, box * 0.7, parent)) {
      return;
    }
    const holder = this.host.addChildPlainNode(parent, `${name}Glyph`, 0, offsetY, box * 0.7, box * 0.7);
    this.drawSlotGlyph(holder, slot, box * 0.6, scale);
  }

  // 面板底(参考图1):深色半透明实底 + 细单线金框。返回容器节点。
  private addOrnatePanel(parent: Node, name: string, x: number, y: number, width: number, height: number, scale: number): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(12, 10, 9, 212);
    g.roundRect(-width / 2, -height / 2, width, height, 6 * scale);
    g.fill();
    g.strokeColor = rgba(196, 158, 88, 190);
    g.lineWidth = 1.4 * scale;
    g.roundRect(-width / 2, -height / 2, width, height, 6 * scale);
    g.stroke();
    return node;
  }

  // 面板标题(参考图1):居中金字 + 两侧饰线与菱形点。
  private addPanelTitle(parent: Node, name: string, text: string, cx: number, y: number, width: number, scale: number): void {
    const label = this.host.addChildLabel(parent, name, text, cx, y, 22 * scale, rgba(238, 206, 138), new Size(width * 0.6, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    const deco = this.host.addChildPlainNode(parent, `${name}Deco`, cx, y, width, 12 * scale);
    const g = deco.addComponent(Graphics);
    const inner = (text.length * 22 * scale) / 2 + 20 * scale;
    const outer = width / 2 - 18 * scale;
    if (outer > inner + 12 * scale) {
      g.strokeColor = rgba(168, 132, 74, 170);
      g.lineWidth = 1.2 * scale;
      g.moveTo(-outer, 0);
      g.lineTo(-inner, 0);
      g.moveTo(inner, 0);
      g.lineTo(outer, 0);
      g.stroke();
      g.fillColor = rgba(214, 172, 96, 225);
      for (const dx of [-inner, inner]) {
        g.moveTo(dx - 5 * scale, 0);
        g.lineTo(dx, 4 * scale);
        g.lineTo(dx + 5 * scale, 0);
        g.lineTo(dx, -4 * scale);
        g.close();
      }
      g.fill();
    }
  }

  // 混色同行文本:按字宽估算(CJK≈字号,ASCII≈0.55字号)顺排后整体居中。
  private layoutInlineSegments(parent: Node, name: string, segments: { text: string; color: ReturnType<typeof rgba>; size: number }[], cx: number, y: number, scale: number): void {
    const est = (text: string, size: number) => {
      let w = 0;
      for (const ch of text) {
        w += ch.charCodeAt(0) > 255 ? size : size * 0.55;
      }
      return w;
    };
    const total = segments.reduce((sum, seg) => sum + est(seg.text, seg.size), 0);
    let x = cx - total / 2;
    segments.forEach((seg, index) => {
      const w = est(seg.text, seg.size);
      const label = this.host.addChildLabel(parent, `${name}_${index}`, seg.text, x + w / 2, y, seg.size, seg.color, new Size(w + 10 * scale, seg.size + 12 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, seg.size >= 24 * scale);
      x += w;
    });
  }

  // 背包式方块单元:品质底/描边 + 部位图标 + 底部名字条 + 右上 +N + 左上"穿"标;强化/分解网格共用。
  private renderEquipCell(parent: Node, name: string, item: EquipmentItemVO, x: number, y: number, cell: number, scale: number, highlighted: boolean): Node {
    const q = equipQualityColor(item.quality);
    const node = this.host.addChildPlainNode(parent, name, x, y, cell, cell);
    const g = node.addComponent(Graphics);
    // 方形雕花框(slot_frame,与强化界面同款);缺图回退品质底色方块。品质/选中描边叠在框上。
    const frameArt = this.host.addSprite(`${name}FrameArt`, FORGE_AI_SLOT_FRAME_ASSET, 0, 0, cell, cell, node);
    if (!frameArt) {
      g.fillColor = rgba(Math.round(q.r * 0.18 + 8), Math.round(q.g * 0.18 + 8), Math.round(q.b * 0.18 + 8), 238);
      g.roundRect(-cell / 2, -cell / 2, cell, cell, 9 * scale);
      g.fill();
    }
    g.strokeColor = highlighted ? rgba(248, 206, 110, 250) : rgba(q.r, q.g, q.b, frameArt ? 165 : 190);
    g.lineWidth = (highlighted ? 3 : frameArt ? 1.3 : 1.6) * scale;
    g.roundRect(-cell / 2, -cell / 2, cell, cell, 9 * scale);
    g.stroke();
    this.addEquipIcon(node, `${name}Icon`, item.equipCode, item.slot, cell * 0.74, scale, 8 * scale);
    const stripW = cell - 6 * scale;
    const strip = this.host.addChildPlainNode(node, `${name}Strip`, 0, -cell / 2 + 13 * scale, stripW, 20 * scale);
    const sg = strip.addComponent(Graphics);
    sg.fillColor = rgba(6, 5, 5, 205);
    sg.roundRect(-stripW / 2, -10 * scale, stripW, 20 * scale, 5 * scale);
    sg.fill();
    const nm = this.host.addChildLabel(strip, `${name}Name`, safeText(item.equipName), 0, 0, 15 * scale, rgba(q.r, q.g, q.b, 255), new Size(stripW - 6 * scale, 22 * scale));
    nm.overflow = Label.Overflow.SHRINK;
    const level = item.enhanceLevel ?? 0;
    if (level > 0) {
      const badge = this.host.addChildLabel(node, `${name}Level`, `+${level}`, cell / 2 - 6 * scale, cell / 2 - 13 * scale, 18 * scale, rgba(250, 224, 150), new Size(36 * scale, 24 * scale), HorizontalTextAlignment.RIGHT);
      badge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(badge, scale, true);
    }
    if (item.heroId != null) {
      const wornW = 24 * scale;
      const worn = this.host.addChildPlainNode(node, `${name}Worn`, -cell / 2 + wornW / 2 + 4 * scale, cell / 2 - 13 * scale, wornW, 18 * scale);
      const wg = worn.addComponent(Graphics);
      wg.fillColor = rgba(30, 52, 34, 238);
      wg.roundRect(-wornW / 2, -9 * scale, wornW, 18 * scale, 4 * scale);
      wg.fill();
      wg.strokeColor = rgba(112, 196, 118, 180);
      wg.lineWidth = 1 * scale;
      wg.stroke();
      const wl = this.host.addChildLabel(worn, `${name}WornLabel`, '穿', 0, 0, 15 * scale, rgba(168, 224, 172), new Size(wornW - 2 * scale, 22 * scale));
      wl.overflow = Label.Overflow.SHRINK;
    }
    return node;
  }

  // 装备图标框:品质底色方框 + 部位 AI 图标(缺图画线稿轮廓),给纯文字行补"物件感"。
  private renderEquipIconBox(parent: Node, name: string, item: EquipmentItemVO, x: number, y: number, size: number, scale: number): void {
    const q = equipQualityColor(item.quality);
    const box = this.host.addChildPlainNode(parent, name, x, y, size, size);
    const g = box.addComponent(Graphics);
    g.fillColor = rgba(Math.round(q.r * 0.24 + 8), Math.round(q.g * 0.24 + 8), Math.round(q.b * 0.24 + 8), 242);
    g.roundRect(-size / 2, -size / 2, size, size, 7 * scale);
    g.fill();
    g.strokeColor = rgba(q.r, q.g, q.b, 225);
    g.lineWidth = 1.6 * scale;
    g.roundRect(-size / 2, -size / 2, size, size, 7 * scale);
    g.stroke();
    this.addEquipIcon(box, `${name}Art`, item.equipCode, item.slot, size * 0.84, scale);
  }

  // 兜底线稿:六部位简笔轮廓(与大厅导航图标同思路,AI 图标未生成前的过渡)。
  private drawSlotGlyph(parent: Node, slotCode: string, size: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'SlotGlyph', 0, 0, size, size);
    const g = node.addComponent(Graphics);
    const half = size / 2;
    g.strokeColor = rgba(228, 206, 160, 228);
    g.lineWidth = Math.max(1.4, 1.8 * scale);
    switch (slotCode) {
      case 'WEAPON':
        g.moveTo(-half * 0.55, -half * 0.62);
        g.lineTo(half * 0.5, half * 0.5);
        g.moveTo(-half * 0.05, half * 0.35);
        g.lineTo(half * 0.3, 0);
        g.moveTo(-half * 0.62, half * 0.36);
        g.lineTo(-half * 0.36, half * 0.62);
        g.stroke();
        return;
      case 'HELMET':
        g.arc(0, -half * 0.05, half * 0.58, Math.PI, 0, true);
        g.stroke();
        g.moveTo(-half * 0.58, -half * 0.05);
        g.lineTo(-half * 0.58, half * 0.42);
        g.moveTo(half * 0.58, -half * 0.05);
        g.lineTo(half * 0.58, half * 0.42);
        g.moveTo(0, -half * 0.05);
        g.lineTo(0, half * 0.5);
        g.stroke();
        return;
      case 'CHEST':
        g.moveTo(-half * 0.55, half * 0.5);
        g.lineTo(-half * 0.55, -half * 0.3);
        g.lineTo(-half * 0.25, -half * 0.55);
        g.lineTo(half * 0.25, -half * 0.55);
        g.lineTo(half * 0.55, -half * 0.3);
        g.lineTo(half * 0.55, half * 0.5);
        g.close();
        g.stroke();
        g.moveTo(0, -half * 0.55);
        g.lineTo(0, half * 0.5);
        g.stroke();
        return;
      case 'BOOTS':
        g.moveTo(-half * 0.3, -half * 0.6);
        g.lineTo(-half * 0.3, half * 0.2);
        g.lineTo(half * 0.55, half * 0.2);
        g.lineTo(half * 0.55, half * 0.55);
        g.lineTo(-half * 0.55, half * 0.55);
        g.lineTo(-half * 0.55, -half * 0.6);
        g.close();
        g.stroke();
        return;
      case 'RING':
        g.circle(0, half * 0.1, half * 0.42);
        g.stroke();
        g.moveTo(0, -half * 0.62);
        g.lineTo(half * 0.24, -half * 0.36);
        g.lineTo(0, -half * 0.1);
        g.lineTo(-half * 0.24, -half * 0.36);
        g.close();
        g.stroke();
        return;
      default:
        // NECKLACE:链弧 + 菱形坠。
        g.arc(0, -half * 0.1, half * 0.5, Math.PI * 1.15, Math.PI * -0.15, true);
        g.stroke();
        g.moveTo(0, -half * 0.05);
        g.lineTo(half * 0.22, half * 0.25);
        g.lineTo(0, half * 0.58);
        g.lineTo(-half * 0.22, half * 0.25);
        g.close();
        g.stroke();
    }
  }

  /**
   * 结果闪光:成功=金色光爆(中心光斑+8 道光芒),失败=灰色淡闪;文字随光缩放淡出后自毁。
   * 由 GameRoot 在整页重绘之后调用,叠加在最新画面之上。
   */
  spawnForgeFlash(success: boolean, text: string): void {
    const node = this.host.createUiNode(`LobbyForgeFlash_${Date.now()}`);
    node.setPosition(new Vec3(0, 30, 0));
    node.addComponent(UITransform).setContentSize(new Size(640, 640));
    const color = success ? { r: 255, g: 214, b: 110 } : { r: 168, g: 168, b: 178 };
    const g = node.addComponent(Graphics);
    // 中心光斑。
    g.fillColor = rgba(color.r, color.g, color.b, success ? 132 : 84);
    g.circle(0, 0, 96);
    g.fill();
    g.fillColor = rgba(255, 246, 214, success ? 190 : 90);
    g.circle(0, 0, 46);
    g.fill();
    // 8 道光芒(细长菱形)。
    const rayCount = 8;
    for (let index = 0; index < rayCount; index += 1) {
      const angle = (Math.PI * 2 * index) / rayCount + Math.PI / 8;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const inner = 58;
      const outer = success ? 236 : 150;
      const half = 12;
      g.fillColor = rgba(color.r, color.g, color.b, success ? 168 : 84);
      g.moveTo(cos * inner - sin * half, sin * inner + cos * half);
      g.lineTo(cos * outer, sin * outer);
      g.lineTo(cos * inner + sin * half, sin * inner - cos * half);
      g.close();
      g.fill();
    }
    const label = this.host.addChildLabel(node, 'ForgeFlashText', text, 0, 0, 38, rgba(success ? 255 : 224, success ? 236 : 216, success ? 178 : 200), new Size(620, 60));
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 235);
    label.outlineWidth = 2.4;
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 0;
    node.setScale(new Vec3(0.55, 0.55, 1));
    tween(opacity)
      .to(0.12, { opacity: 255 })
      .delay(success ? 0.5 : 0.35)
      .to(0.4, { opacity: 0 })
      .call(() => node.destroy())
      .start();
    tween(node)
      .to(0.55, { scale: new Vec3(success ? 1.35 : 1.1, success ? 1.35 : 1.1, 1) })
      .to(0.45, { scale: new Vec3(success ? 1.5 : 1.16, success ? 1.5 : 1.16, 1) })
      .start();
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 230 : 188);
    label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
  }
}

function slotLabelOf(slotCode: string): string {
  return HERO_EQUIP_SLOTS.find((slot) => slot.code === slotCode)?.label ?? slotCode;
}

// 成功率分档配色:≥90% 绿 / ≥50% 黄 / <50% 红。
function chanceColor(chance: number): Color {
  if (chance >= 0.9) {
    return rgba(150, 216, 150);
  }
  if (chance >= 0.5) {
    return rgba(238, 208, 130);
  }
  return rgba(236, 120, 96);
}

function formatInteger(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return safe.toLocaleString('en-US');
}
