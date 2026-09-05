import {
  assetManager,
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Node,
  resources,
  Size,
  Sprite,
  ScrollView,
  sp,
  UITransform,
  UIOpacity,
  Vec3,
  VideoClip,
  VideoPlayer,
  AudioClip,
  AudioSource,
  tween,
} from 'cc';
import { C1812_BUTTON_DISABLED_ASSET, C1812_BUTTON_PRIMARY_ASSET, C1812_BUTTON_RETURN_ASSET, C1812_POPUP_FRAME_PARCHMENT_ASSET, C1812_TITLE_BANNER_ASSET } from '../C1812CommonUiAssets';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { clamp, LOBBY_C1812_RESOURCE_ICON_ASSETS, rgba, type UiLayout } from '../lobby/LobbyHudTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { GachaDrawItemVO, GachaDrawLogVO, GachaDrawResultVO, GachaPityVO, GachaPoolDetailVO } from '../../types/GachaTypes';
import type { LobbyBagPanelState } from '../../types/BagTypes';
import type { EquipmentItemVO } from '../../api/EquipmentApi';
import type { LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { renderEquipDetailCard } from '../lobby/EquipDetailCard';
import { resolveAttributes, resolveSkills } from '../lobby/LobbyHeroDetailPanelRenderer';
import {
  GACHA_ABYSS_FALLBACK_SPINE_IDLE_ANIMATION,
  GACHA_ABYSS_FALLBACK_SPINE_INTRO_ANIMATION,
  GACHA_ABYSS_FALLBACK_SPINE_RESOURCE,
  GACHA_ABYSS_FALLBACK_SPINE_SKIN,
  GACHA_ABYSS_FALLBACK_SPINE_UUID,
  GACHA_ABYSS_SPINE_RESOURCE,
  GACHA_ABYSS_SPINE_IDLE_ANIMATION,
  GACHA_ABYSS_SPINE_INTRO_ANIMATION,
  GACHA_ABYSS_SPINE_SKIN,
  GACHA_ABYSS_SPINE_UUID,
  GACHA_BACKGROUND_ASSET,
  GACHA_C1812_SUMMON_CASE_FRAME_ASSET,
  GACHA_C1812_SUMMON_FLOOR_ASSET,
  GACHA_C1812_SUMMON_MAGIC_CIRCLE_ASSET,
  GACHA_C1812_SUMMON_REWARD_SLOT_ASSET,
  GACHA_MODAL_CLOSE_BUTTON_ASSET,
  GACHA_ACTION_ICON_ASSETS,
  GACHA_COST_DIAMOND_ICON_ASSET,
  GACHA_COST_GOLD_ICON_ASSET,
  GACHA_COST_TICKET_ICON_ASSET,
  GACHA_FRAME_STAR_COUNTS,
  GACHA_LOCK_ICON_ASSET,
  GACHA_MOCK_RESULT_ONCE,
  GACHA_MOCK_RESULT_TEN,
  GACHA_PREVIEW_POOLS,
  GACHA_RESULT_DIVIDER_LEFT_ASSET,
  GACHA_RESULT_DIVIDER_RIGHT_ASSET,
  GACHA_RESULT_FRAME_ASSETS,
  GACHA_RESULT_PANEL_ASPECT,
  GACHA_RESULT_PANEL_ASSET,
  GACHA_RESULT_STAR_ASSETS,
  GACHA_REVEAL_STEPS,
  GACHA_RIGHT_ACTIONS,
  GACHA_SUMMON_AUDIO_RESOURCE,
  GACHA_SUMMON_VIDEO_ASPECT_HEIGHT,
  GACHA_SUMMON_VIDEO_ASPECT_WIDTH,
  GACHA_SUMMON_VIDEO_FALLBACK_SECONDS,
  GACHA_SUMMON_VIDEO_NORMAL_RESOURCE,
  GACHA_SUMMON_VIDEO_RARE_RESOURCE,
  GACHA_TAB_CIRCLE_CX_RATIO,
  GACHA_TAB_PLATE_ASPECT,
  GACHA_TAB_PLATE_ASSET,
  gachaFrameColorByRarity,
  gachaFrameTextColor,
  gachaPoolTabIconAsset,
  gachaRarityTone,
  gachaResultFrameColor,
  type GachaActionKey,
  type GachaMockResultItem,
  type GachaPreviewPool,
  type GachaRarity,
  type GachaRevealStep,
} from './GachaSceneConfig';
import { equipIconAssetByCode, equipSlotKeyByCode } from '../lobby/EquipIconAssets';
import { resolveBagStyleItemIconAsset } from '../lobby/LobbyBagPanelRenderer';
import { heroCardArtProfileByCode } from '../lobby/HeroCardArtAssets';
import { renderLockGlyph } from '../UiLockGlyph';

export type GachaPreviewResultMode = 'once' | 'ten';

export interface GachaSceneState {
  loading: boolean;
  drawing: boolean;
  error: string | null;
  pools: GachaPreviewPool[];
  selectedPoolCode: string | null;
  pity: GachaPityVO[];
  poolDetail: GachaPoolDetailVO | null;
  poolDetailLoading: boolean;
  poolDetailError: string;
  logs: GachaDrawLogVO[];
  logsLoading: boolean;
  logsError: string;
  lastDrawResult: GachaDrawResultVO | null;
  activeAction: GachaActionKey | null;
  /** 每日免费单抽(2026-09-05 新手闭环):null=未加载;选中池命中 poolCode 且 available 时单抽按钮亮"免费"。 */
  freeSingle: { poolCode: string; available: boolean } | null;
}

export interface GachaSceneHost {
  node: Node;
  closeGachaScene(): void;
  closeGachaActionScene(): void;
  selectGachaPool(poolCode: string): void;
  startGachaDraw(mode: GachaPreviewResultMode): void;
  finishGachaSummonVideoScene(): void;
  openGachaActionScene(action: GachaActionKey): void;
  openGachaMockRevealScene(mode: GachaPreviewResultMode): void;
  closeGachaMockRevealScene(): void;
  openGachaMockResultScene(mode: GachaPreviewResultMode): void;
  closeGachaMockResultScene(): void;
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
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
    contentSize: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  currentLobbyBagState(): LobbyBagPanelState;
  isGachaSkipAnimationEnabled(): boolean;
  toggleGachaSkipAnimation(): void;
  currentLobbyEquipmentItems(): EquipmentItemVO[];
  /** 抽卡前装备 id 快照(可选):用于把结果卡定位到本次新获得的实例而不是同编码旧装备。 */
  currentGachaEquipIdsBeforeDraw?(): ReadonlySet<number> | null;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  setStatus(text: string): void;
  currentLobbyProfile(): PlayerLobbyProfileVO;
}

const GACHA_SPINE_GROUND_Y_RATIO = -0.55;
const GACHA_HERO_POOL_SPINE_GROUND_Y_EXTRA_RATIO = -0.075;
const GACHA_BOX_SUMMON_SPINE_SCALE_MULTIPLIER = 1.18;
const GACHA_BOX_SUMMON_SPINE_GROUND_Y_EXTRA_RATIO = -0.045;

/** 抽奖全屏预览页。
 * 当前阶段只做视觉、布局和只读规则入口，不触发真实扣费、发奖、保底或兑换写入。 */
export class GachaSceneRenderer {
  // 结果卡详情浮层:悬浮=临时(移出即收),点击=固定(遮罩点击关闭)。
  private resultTooltipNode: Node | null = null;
  /** 当前结果页的结果卡列表(用于同批多件同编码装备逐件对应实例)。 */
  private currentResultItems: GachaMockResultItem[] | null = null;
  private resultTooltipSticky = false;
  private abyssSpineData: sp.SkeletonData | null = null;
  private abyssSpineLoading = false;
  private abyssSpineLoadFailed = false;
  private readonly abyssSpineLoadCallbacks: Array<(data: sp.SkeletonData) => void> = [];
  private abyssFallbackSpineData: sp.SkeletonData | null = null;
  private abyssFallbackSpineLoading = false;
  private abyssFallbackSpineLoadFailed = false;
  private readonly abyssFallbackSpineLoadCallbacks: Array<(data: sp.SkeletonData) => void> = [];
  private readonly configuredSpineDataCache = new Map<string, sp.SkeletonData>();
  private readonly configuredSpineLoadingKeys = new Set<string>();
  private readonly configuredSpineLoadFailedKeys = new Set<string>();
  private readonly configuredSpineLoadCallbacks = new Map<string, Array<(data: sp.SkeletonData) => void>>();

  constructor(private readonly host: GachaSceneHost) {}

  render(layout: UiLayout, state: GachaSceneState): void {
    const scale = this.resolveScale(layout);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const root = this.createUiNode('GachaSceneRoot');
    root.setPosition(new Vec3(centerX, centerY, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    // 全屏页面必须吞掉底层大厅输入，避免召唤按钮或功能图标穿透到大厅热点。
    root.addComponent(BlockInputEvents);

    this.renderBackground(root, layout);
    this.renderTopBar(root, layout, scale);
    if (layout.safeWidth < 900 || layout.safeHeight < 520) {
      this.renderCompactContent(root, layout, scale, state);
      this.renderActionModal(root, layout, scale, state);
      return;
    }
    const selectedPool = this.resolveSelectedPool(state);
    this.renderPoolRail(root, layout, scale, state);
    this.renderCenterStage(root, layout, scale, selectedPool, state);
    this.renderRightPanel(root, layout, scale, selectedPool);
    this.renderBottomSummonBar(root, layout, scale, selectedPool, state);
    this.renderActionModal(root, layout, scale, state);
  }

  renderResultScene(layout: UiLayout, mode: GachaPreviewResultMode, state: GachaSceneState): void {
    const scale = this.resolveScale(layout);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const root = this.createUiNode('GachaResultSceneRoot');
    root.setPosition(new Vec3(centerX, centerY, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);

    this.renderBackground(root, layout);
    this.renderMockResultSceneContent(root, layout, scale, mode, state.lastDrawResult);
    this.renderTopBar(root, layout, scale, 'GachaResultBackButton', () => this.host.closeGachaMockResultScene(), '召唤结果');
  }

  renderRevealScene(layout: UiLayout, mode: GachaPreviewResultMode): void {
    const scale = this.resolveScale(layout);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const root = this.createUiNode('GachaRevealSceneRoot');
    root.setPosition(new Vec3(centerX, centerY, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);

    this.renderBackground(root, layout);
    this.renderRevealTopBar(root, layout, scale);
    this.renderRevealSceneContent(root, layout, scale, mode);
  }

  renderSummonVideoScene(layout: UiLayout, mode: GachaPreviewResultMode, rarity: GachaRarity | null): void {
    const scale = this.resolveScale(layout);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const root = this.createUiNode('GachaSummonVideoSceneRoot');
    root.setPosition(new Vec3(centerX, centerY, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);

    this.renderSummonVideoContent(root, layout, scale, mode, rarity);
    // 播放中右上跳过:直接走收尾(结果页+回读),与自然播完同一出口。
    const skipW = 130 * scale;
    const skipH = 44 * scale;
    const skip = this.host.addChildPlainNode(root, 'GachaSummonSkipButton', layout.width / 2 - skipW / 2 - 26 * scale, layout.height / 2 - skipH / 2 - 24 * scale, skipW, skipH);
    const sg = skip.addComponent(Graphics);
    sg.fillColor = rgba(8, 7, 8, 196);
    sg.roundRect(-skipW / 2, -skipH / 2, skipW, skipH, skipH / 2);
    sg.fill();
    sg.strokeColor = rgba(214, 176, 100, 220);
    sg.lineWidth = 1.6 * scale;
    sg.roundRect(-skipW / 2, -skipH / 2, skipW, skipH, skipH / 2);
    sg.stroke();
    const skipLabel = this.host.addChildLabel(skip, 'GachaSummonSkipLabel', '跳过 »', 0, 1 * scale, 19 * scale, rgba(240, 218, 168), new Size(skipW - 18 * scale, skipH - 8 * scale));
    skipLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(skipLabel, scale, true);
    skip.addComponent(Button);
    skip.on(Button.EventType.CLICK, () => this.host.finishGachaSummonVideoScene(), this);
    this.host.applyImageButtonFeedback(skip, 1.05, 0.95);
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private resolveScale(layout: UiLayout): number {
    return clamp(Math.min(layout.uiScale, layout.safeWidth / 1280, layout.safeHeight / 720), 0.56, 1);
  }

  private resolvePools(state: GachaSceneState): GachaPreviewPool[] {
    return state.pools.length > 0 ? state.pools : GACHA_PREVIEW_POOLS;
  }

  private resolveSelectedPool(state: GachaSceneState): GachaPreviewPool {
    const pools = this.resolvePools(state);
    return pools.find((pool) => this.isSelectedPool(pool, state.selectedPoolCode)) ?? pools[0];
  }

  private isSelectedPool(pool: GachaPreviewPool, selectedPoolCode: string | null): boolean {
    if (selectedPoolCode) {
      return pool.poolCode === selectedPoolCode || pool.id === selectedPoolCode;
    }
    return pool.active === true;
  }

  private renderBackground(parent: Node, layout: UiLayout): void {
    const aspect = 1672 / 941;
    let width = layout.width;
    let height = width / aspect;
    if (height < layout.height) {
      height = layout.height;
      width = height * aspect;
    }
    const sprite = this.host.addSprite('GachaSceneBackground', GACHA_BACKGROUND_ASSET, 0, 0, width, height, parent);
    if (!sprite) {
      const fallback = parent.addComponent(Graphics);
      fallback.fillColor = rgba(2, 2, 4);
      fallback.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
      fallback.fill();
    }
  }

  renderActionScene(layout: UiLayout, state: GachaSceneState, action: GachaActionKey): void {
    const scale = this.resolveScale(layout);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const root = this.createUiNode(`GachaActionSceneRoot_${action}`);
    root.setPosition(new Vec3(centerX, centerY, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);

    this.renderBackground(root, layout);
    this.renderTopBar(root, layout, scale, 'GachaActionBackButton', () => this.host.closeGachaActionScene(), this.actionTitle(action));
    this.renderActionSceneContent(root, layout, scale, state, action);
  }

  private renderActionModal(parent: Node, layout: UiLayout, scale: number, state: GachaSceneState): void {
    const action = state.activeAction;
    if (!action) {
      return;
    }
    const overlay = this.host.addChildPlainNode(parent, `GachaActionModalOverlay_${action}`, 0, 0, layout.width, layout.height);
    overlay.addComponent(BlockInputEvents);
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => this.host.closeGachaActionScene(), this);
    const graphics = overlay.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 128);
    graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    graphics.fill();
    this.renderActionModalContent(overlay, layout, scale, state, action);
  }

  private renderTopBar(parent: Node, layout: UiLayout, scale: number, backName = 'GachaBackButton', onBack: () => void = () => this.host.closeGachaScene(), titleText = '召唤'): void {
    const y = layout.stageTop - 42 * scale;
    renderSceneBackButton(this.host, parent, layout, backName, onBack, scale, titleText);

    const profile = this.host.currentLobbyProfile();
    // 召唤页顶部只展示召唤相关通货(钻石);样式走全局统一货币胶囊(背包基准)。
    renderTopCurrencyBar(this.host, parent, layout.stageRight, layout.stageTop, scale, [
      { key: 'diamond', icon: 'ui/bag/ai/icon_diamond/spriteFrame', value: compactValue(profile.diamond) },
    ], 130);
  }

  private renderRevealTopBar(parent: Node, layout: UiLayout, scale: number): void {
    const y = layout.stageTop - 42 * scale;
    renderSceneBackButton(this.host, parent, layout, 'GachaRevealBackButton', () => this.host.closeGachaMockRevealScene(), scale, '召唤仪式');
    const note = this.host.addChildLabel(parent, 'GachaRevealTopGuard', '本地演出预览', layout.stageRight - 138 * scale, y, 20 * scale, rgba(190, 166, 116), new Size(220 * scale, 34 * scale), HorizontalTextAlignment.RIGHT);
    note.overflow = Label.Overflow.SHRINK;
  }

  private renderResourceCapsule(
    parent: Node,
    key: keyof typeof LOBBY_C1812_RESOURCE_ICON_ASSETS,
    label: string,
    value: string,
    tint: Color,
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
  ): void {
    const node = this.host.addChildPlainNode(parent, `GachaResource_${label}`, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(4, 4, 7, 196);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(159, 113, 55, 150);
    graphics.stroke();
    this.addResourceGlyph(node, key, -width / 2 + 22 * scale, 0, 21 * scale, tint, scale);
    const valueLabel = this.host.addChildLabel(node, 'GachaResourceValue', value, 12 * scale, 0, 20 * scale, rgba(244, 218, 159), new Size(width - 58 * scale, height), HorizontalTextAlignment.RIGHT);
    valueLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(valueLabel, scale, false);
  }

  private addResourceGlyph(
    parent: Node,
    key: keyof typeof LOBBY_C1812_RESOURCE_ICON_ASSETS,
    x: number,
    y: number,
    size: number,
    tint: Color,
    scale: number,
  ): void {
    const iconAsset = LOBBY_C1812_RESOURCE_ICON_ASSETS[key];
    if (iconAsset) {
      const iconHeight = size * 1.18;
      const iconWidth = iconHeight * iconAsset.aspect;
      const sprite = this.host.addSprite(`GachaResourceIcon_${key}`, iconAsset.path, x, y, iconWidth, iconHeight, parent);
      if (sprite) {
        return;
      }
    }
    const glyph = this.host.addChildPlainNode(parent, `GachaResourceGlyph_${key}`, x, y, size, size);
    const graphics = glyph.addComponent(Graphics);
    graphics.fillColor = rgba(tint.r, tint.g, tint.b, 225);
    graphics.circle(0, 0, size * 0.36);
    graphics.fill();
    graphics.strokeColor = rgba(18, 13, 8, 220);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();
  }

  private renderActionSceneContent(parent: Node, layout: UiLayout, scale: number, state: GachaSceneState, action: GachaActionKey): void {
    this.renderActionModalContent(parent, layout, scale, state, action);
  }

  private renderActionModalContent(parent: Node, layout: UiLayout, scale: number, state: GachaSceneState, action: GachaActionKey): void {
    const selectedPool = this.resolveSelectedPool(state);
    const rows = this.actionRows(action, state, selectedPool);
    const frame = this.resolveActionPanelFrame(layout, scale, action, rows.length);
    const { width, height } = frame;
    // 只用 AI 弹框素材做底:beveled 黑底会在金框外露出一圈黑色矩形("双层框")。
    const panel = this.host.addChildPlainNode(parent, `GachaActionScenePanel_${action}`, 0, frame.y, width, height);
    panel.addComponent(BlockInputEvents);
    const panelArt = this.host.addSprite(`GachaActionScenePanelArt_${action}`, C1812_POPUP_FRAME_PARCHMENT_ASSET, 0, 0, width, height, panel);
    if (panelArt) {
      panelArt.type = Sprite.Type.SLICED;
    } else {
      const fallback = panel.addComponent(Graphics);
      fallback.fillColor = rgba(7, 7, 10, 230);
      fallback.roundRect(-width / 2, -height / 2, width, height, 12 * scale);
      fallback.fill();
      fallback.strokeColor = rgba(199, 145, 64, 210);
      fallback.stroke();
    }
    this.renderActionModalCloseButton(panel, width, height, scale);

    const titleText = this.actionTitle(action);
    // 标题匾底部搭在框顶沿:先按同公式估匾高,再定位中心。
    const estBannerWidth = Math.min(width - 120 * scale, Math.max(300 * scale, Math.max(200 * scale, titleText.length * 24 * scale) + 44 * scale));
    const titleY = height / 2 + estBannerWidth * (268 / 800) / 2 - 48 * scale;
    const bannerMetrics = this.renderPanelTitleBanner(panel, 'GachaActionScene', titleText, titleY, width, scale);
    const subtitle = this.host.addChildLabel(
      panel,
      'GachaActionSceneSubtitle',
      `${safeText(selectedPool.title)} · ${this.actionSubtitle(action, state, selectedPool)}`,
      0,
      height / 2 - 118 * scale, 17 * scale,
      rgba(184, 159, 108),
      new Size(width - 280 * scale, 24 * scale),
    );
    subtitle.overflow = Label.Overflow.SHRINK;

    if (rows.length === 0) {
      this.renderActionEmpty(panel, width, height, scale, this.emptyActionText(action, state));
    } else {
      this.renderActionRows(panel, width, height, scale, rows, action);
    }

    if (action === 'exchange') {
      this.renderExchangeDisabledButton(panel, width, height, scale);
    }
  }

  private renderActionModalCloseButton(parent: Node, width: number, height: number, scale: number): void {
    const size = 58 * scale;
    const x = width / 2 - 34 * scale;
    const y = height / 2 - 34 * scale;
    const sprite = this.host.addSprite('GachaActionModalCloseArt', GACHA_MODAL_CLOSE_BUTTON_ASSET, x, y, size, size, parent);
    const buttonNode = sprite?.node ?? this.host.addChildPlainNode(parent, 'GachaActionModalCloseFallback', x, y, size, size);
    buttonNode.addComponent(Button);
    buttonNode.on(Button.EventType.CLICK, () => this.host.closeGachaActionScene(), this);
    this.host.applyImageButtonFeedback(buttonNode, 1.08, 0.92);
    if (!sprite) {
      const graphics = buttonNode.addComponent(Graphics);
      graphics.fillColor = rgba(32, 7, 8, 220);
      graphics.circle(0, 0, size * 0.42);
      graphics.fill();
      graphics.strokeColor = rgba(226, 172, 82, 230);
      graphics.lineWidth = Math.max(1.5, 2 * scale);
      graphics.circle(0, 0, size * 0.42);
      graphics.moveTo(-size * 0.16, size * 0.16);
      graphics.lineTo(size * 0.16, -size * 0.16);
      graphics.moveTo(size * 0.16, size * 0.16);
      graphics.lineTo(-size * 0.16, -size * 0.16);
      graphics.stroke();
    }
  }

  private resolveActionPanelFrame(layout: UiLayout, scale: number, action: GachaActionKey, rowCount: number): { width: number; height: number; y: number } {
    void action;
    void rowCount;
    // 弹框统一固定尺寸:四个弹框(概率/记录/兑换/奖池)完全一致,不随内容伸缩;内容超出由滚动列表承接。
    const width = Math.max(360 * scale, Math.min(layout.safeWidth - 80 * scale, 960 * scale));
    const height = Math.max(340 * scale, Math.min(layout.safeHeight - 140 * scale, 620 * scale));
    return { width, height, y: -8 * scale };
  }

  private actionTitle(action: GachaActionKey): string {
    if (action === 'info') {
      return '概率保底';
    }
    if (action === 'record') {
      return '召唤记录';
    }
    if (action === 'exchange') {
      return '兑换';
    }
    return '奖池内容';
  }

  private actionSubtitle(action: GachaActionKey, state: GachaSceneState, selectedPool: GachaPreviewPool): string {
    if (action === 'record') {
      return state.logsLoading ? '正在读取召唤记录...' : state.logsError || '只读读取当前玩家召唤记录，不提供补发或重抽。';
    }
    if (state.poolDetailLoading) {
      return '正在读取卡池展示配置...';
    }
    if (state.poolDetailError) {
      return `卡池详情读取失败：${safeText(state.poolDetailError)}`;
    }
    if (action === 'exchange') {
      return selectedPool.exchangeNote ?? '兑换涉及经济写入，当前阶段仅展示规则说明并保持关闭。';
    }
    return selectedPool.noticeText ?? '信息来自后端卡池配置，只读展示。';
  }

  private actionRows(action: GachaActionKey, state: GachaSceneState, selectedPool: GachaPreviewPool): string[] {
    if (action === 'record') {
      return state.logs.slice(0, 14).map((log) => `${formatDateTime(log.createTime)}  ${log.drawCount}抽  ${safeText(log.poolCode)}  消耗 ${compactValue(log.costAmount)} ${safeText(log.costCode)}  ${safeText(log.drawNo)}`);
    }
    const detail = state.poolDetail;
    if (!detail) {
      return [];
    }
    if (action === 'info') {
      const activeRateRarities = new Set(detail.rates.filter((rate) => rate.status === 1).map((rate) => safeText(rate.rarity)));
      const rateRows = selectedPool.rateNote
        ? [`概率说明：${safeText(selectedPool.rateNote)}`]
        : detail.rates
          .filter((rate) => rate.status === 1)
          .map((rate) => `概率 ${safeText(rate.rarity)}：${formatPercentValue(rate.rate)}%`);
      const pityRows = selectedPool.guaranteeNote
        ? [`保底说明：${safeText(selectedPool.guaranteeNote)}`]
        : detail.pityConfigs
          .filter((pity) => pity.status === 1 && activeRateRarities.has(safeText(pity.rarity)))
          .map((pity) => `保底 ${safeText(pity.rarity)}：${pity.pityCount} 抽，重置 ${safeText(pity.resetRarity || '-')}`);
      const currentRows = state.pity.filter((pity) => activeRateRarities.has(safeText(pity.rarity))).map((pity) => {
        const left = Math.max(0, Number(pity.pityCount) - Number(pity.counter));
        return `当前 ${safeText(pity.rarity)} 保底：已 ${pity.counter} / ${pity.pityCount}，还需 ${left} 抽`;
      });
      const duplicateRows = detail.duplicateConfigs
        .filter((config) => config.status === 1)
        .map((config) => `重复 ${safeText(config.rarity)} 英雄：转化 ${compactValue(config.fragmentCount)} 同名碎片`);
      return [...rateRows, ...pityRows, ...currentRows, ...duplicateRows];
    }
    if (action === 'exchange') {
      const exchangeNote = selectedPool.exchangeNote ? [`说明：${safeText(selectedPool.exchangeNote)}`] : [];
      const duplicateRows = detail.duplicateConfigs
        .filter((config) => config.status === 1)
        .map((config) => `碎片来源：重复 ${safeText(config.rarity)} 英雄转化 ${compactValue(config.fragmentCount)} 碎片`);
      return [...exchangeNote, ...duplicateRows, '当前不开放兑换、补发、碎片消耗或资源变更接口。'];
    }
    return detail.items
      .filter((item) => item.status === 1)
      .map((item) => `${safeText(item.rarity)}  ${rewardTypeLabel(item.rewardType)}  ${safeText(item.rewardCode)}  权重 ${item.weight}${item.upFlag === 1 ? '  UP' : ''}${item.limitedFlag === 1 ? '  限定' : ''}`);
  }

  private renderActionRows(parent: Node, width: number, height: number, scale: number, rows: string[], action: GachaActionKey): void {
    const footerReserve = action === 'exchange' ? 58 * scale : 0;
    // 内容区完全收进框内石板区:框图四角藤蔓宽,列表区左右各让 120、纵向避开顶底角装饰。
    const bodyOuterWidth = width - 240 * scale;
    const bodyOuterHeight = Math.max(96 * scale, height - 138 * scale - footerReserve) - 40 * scale;
    const bodyY = -40 * scale + footerReserve / 2;
    // 行区不再叠半透明底板:石板纹理本身就是内容底,叠黑块像补丁。
    const body = this.host.addChildPlainNode(parent, `GachaActionRows_${action}`, 0, bodyY, bodyOuterWidth, bodyOuterHeight);

    // 行文字/滚动视口严格窄于容器(此前 width-116 比容器还宽 32px,文字直接刷出框外)。
    const bodyWidth = bodyOuterWidth - 24 * scale;
    const lineHeight = 27 * scale;
    const topInset = 14 * scale;
    const bottomInset = 14 * scale;
    const hintReserve = 28 * scale;
    const rowCapacity = Math.max(1, Math.floor((bodyOuterHeight - topInset - bottomInset) / lineHeight));
    const scrollable = rows.length > rowCapacity;
    const viewportTop = bodyOuterHeight / 2 - topInset;
    const viewportBottom = -bodyOuterHeight / 2 + (scrollable ? hintReserve : bottomInset);
    const viewportHeight = Math.max(lineHeight, viewportTop - viewportBottom);
    const viewportCenterY = (viewportTop + viewportBottom) / 2;
    const viewport = this.host.addChildPlainNode(body, `GachaActionRowsViewport_${action}`, 0, viewportCenterY, bodyWidth, viewportHeight);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;

    const contentPaddingY = 12 * scale;
    const contentHeight = Math.max(viewportHeight, rows.length * lineHeight + contentPaddingY * 2);
    const content = this.host.addChildPlainNode(viewport, `GachaActionRowsContent_${action}`, 0, (viewportHeight - contentHeight) / 2, bodyWidth, contentHeight);
    scrollView.content = content;

    const startY = contentHeight / 2 - contentPaddingY - lineHeight / 2;
    rows.forEach((row, index) => {
      const label = this.host.addChildLabel(content, `GachaActionRow_${index}`, row, -bodyWidth / 2, startY - index * lineHeight, 17 * scale, rgba(220, 196, 135), new Size(bodyWidth, 23 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });
    if (scrollable) {
      const hint = this.host.addChildLabel(body, 'GachaActionRowsScrollHint', `共 ${rows.length} 条，拖动查看完整列表。`, 0, -bodyOuterHeight / 2 + 22 * scale, 15 * scale, rgba(152, 130, 91), new Size(bodyWidth, 20 * scale));
      hint.overflow = Label.Overflow.SHRINK;
    }
  }

  private renderActionEmpty(parent: Node, width: number, height: number, scale: number, text: string): void {
    const label = this.host.addChildLabel(parent, 'GachaActionSceneEmpty', text, 0, -4 * scale, 20 * scale, rgba(212, 188, 130), new Size(width - 98 * scale, 66 * scale));
    label.lineHeight = 27 * scale;
    label.overflow = Label.Overflow.RESIZE_HEIGHT;
    this.applyOutline(label, scale, false);
  }

  private emptyActionText(action: GachaActionKey, state: GachaSceneState): string {
    if (action === 'record') {
      return state.logsLoading ? '召唤记录读取中...' : state.logsError || '当前还没有召唤记录。';
    }
    return state.poolDetailLoading ? '卡池详情读取中...' : state.poolDetailError || '当前卡池暂未返回展示详情。';
  }

  private renderExchangeDisabledButton(parent: Node, width: number, height: number, scale: number): void {
    const buttonWidth = Math.min(260 * scale, width - 96 * scale);
    const button = this.host.addChildPlainNode(parent, 'GachaExchangeDisabledButton', 0, -height / 2 + 34 * scale, buttonWidth, 40 * scale);
    const graphics = button.addComponent(Graphics);
    graphics.fillColor = rgba(24, 20, 18, 142);
    graphics.rect(-buttonWidth / 2, -20 * scale, buttonWidth, 40 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(116, 95, 66, 160);
    graphics.stroke();
    const component = button.addComponent(Button);
    component.interactable = false;
    const label = this.host.addChildLabel(button, 'GachaExchangeDisabledLabel', '兑换未开放', 0, 0, 19 * scale, rgba(154, 137, 105), new Size(230 * scale, 34 * scale));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderPoolRail(parent: Node, layout: UiLayout, scale: number, state: GachaSceneState): void {
    const pools = this.resolvePools(state);
    const railWidth = clamp(layout.safeWidth * 0.205, 262 * scale, 348 * scale);
    // 行高比素材原比拉高约 20%(用户要求页签更高;板轻度纵向拉伸,徽章按圆的横径定尺不压圆边)。
    const gap = 12 * scale;
    const rawItemHeight = railWidth / (GACHA_TAB_PLATE_ASPECT / 1.2);
    const available = layout.stageTop - layout.stageBottom - 24 * scale;
    const itemHeight = Math.min(rawItemHeight, (available - gap * (pools.length - 1)) / Math.max(1, pools.length));
    const totalHeight = pools.length * itemHeight + (pools.length - 1) * gap;
    const x = layout.stageLeft + railWidth / 2 + 22 * scale;
    const y = (layout.stageTop + layout.stageBottom) / 2 + 4 * scale;
    const rail = this.host.addChildPlainNode(parent, 'GachaPoolRail', x, y, railWidth, totalHeight);
    let cursorY = totalHeight / 2 - itemHeight / 2;
    for (const pool of pools) {
      const active = this.isSelectedPool(pool, state.selectedPoolCode);
      this.renderPoolItem(rail, { ...pool, active }, 0, cursorY, railWidth, itemHeight, scale);
      cursorY -= itemHeight + gap;
    }
  }

  private renderPoolItem(parent: Node, pool: GachaPreviewPool, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, `GachaPool_${pool.id}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.selectGachaPool(pool.poolCode ?? pool.id), this);
    this.host.applyImageButtonFeedback(node, 1.025, 0.975);
    const tone = gachaRarityTone(pool.rarity);
    const graphics = node.addComponent(Graphics);
    // 选中态:板下垫暗红晕(素材不乘色,选中/非选中用底晕+透明度表达)。
    if (pool.active) {
      graphics.fillColor = rgba(132, 26, 18, 92);
      graphics.roundRect(-width / 2 - 4 * scale, -height / 2 - 4 * scale, width + 8 * scale, height + 8 * scale, height * 0.24);
      graphics.fill();
    }
    const plate = this.host.addSprite('GachaPoolPlate', GACHA_TAB_PLATE_ASSET, 0, 0, width, height, node);
    if (plate) {
      if (!pool.active) {
        const dim = plate.node.addComponent(UIOpacity);
        dim.opacity = pool.locked ? 132 : 168;
      }
      // 池徽章:自带圆环,盖在板圆位置;板有纵向拉伸,按圆的"横径"(宽×0.309)定尺才不压圆边。
      const circleX = -width / 2 + width * GACHA_TAB_CIRCLE_CX_RATIO;
      const iconH = width * (68 / 220) * 0.96;
      const iconW = iconH * (452 / 482);
      const icon = this.host.addSprite('GachaPoolTabIcon', gachaPoolTabIconAsset(pool.poolCode, pool.displayType ?? pool.poolType, pool.id), circleX, 0, iconW, iconH, node);
      if (icon && !pool.active) {
        const iconDim = icon.node.addComponent(UIOpacity);
        iconDim.opacity = pool.locked ? 150 : 190;
      }
      if (pool.locked) {
        const lockH = height * 0.46;
        if (!renderLockGlyph(this.host, node, 'GachaPoolLockIcon', width / 2 - height * 0.3, 0, lockH, true)) {
          this.host.addSprite('GachaPoolLockFallback', GACHA_LOCK_ICON_ASSET, width / 2 - height * 0.3, 0, lockH * 0.7 * (135 / 192), lockH * 0.7, node);
        }
      }
      const textLeft = circleX + iconH * 0.62;
      const textWidth = width / 2 - textLeft - 14 * scale;
      // 标题/副行收紧行距并作为整体在板内上下居中(±0.105 高)。
      const title = this.host.addChildLabel(node, 'GachaPoolTitle', pool.title, textLeft, height * 0.105, 21 * scale, pool.active ? rgba(252, 224, 156) : rgba(212, 188, 138), new Size(textWidth, 26 * scale), HorizontalTextAlignment.LEFT);
      title.overflow = Label.Overflow.SHRINK;
      this.applyOutline(title, scale, true);
      const subline = this.host.addChildLabel(node, 'GachaPoolSubline', pool.locked ? (pool.buttonDisabledReason ?? '锁定') : pool.subline, textLeft, -height * 0.105, 15 * scale, pool.locked ? rgba(151, 137, 110) : pool.active ? rgba(222, 172, 92) : rgba(178, 152, 106), new Size(textWidth, 20 * scale), HorizontalTextAlignment.LEFT);
      subline.overflow = Label.Overflow.SHRINK;
      return;
    }
    // 兜底:板图未就绪时沿用旧程序绘制页签。
    graphics.fillColor = pool.active ? rgba(54, 8, 11, 218) : rgba(4, 4, 7, 184);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = pool.active ? tone.stroke : rgba(142, 105, 55, 126);
    graphics.lineWidth = Math.max(1, pool.active ? 2 * scale : 1 * scale);
    graphics.stroke();
    graphics.fillColor = tone.glow;
    graphics.rect(width * 0.12, -height / 2, width * 0.38, height);
    graphics.fill();
    this.drawPoolTabLogoBackdrop(node, pool, width, height);
    if (pool.locked) {
      graphics.fillColor = rgba(0, 0, 0, 116);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.fill();
    }
    const logo = this.host.addChildPlainNode(node, 'GachaPoolLogoSlot', -width / 2 + 33 * scale, 5 * scale, 42 * scale, 42 * scale);
    this.drawPoolLogoSlot(logo, pool, 42 * scale, scale);
    const title = this.host.addChildLabel(node, 'GachaPoolTitle', pool.title, -width / 2 + 66 * scale, 13 * scale, 21 * scale, rgba(248, 218, 150), new Size(width - 92 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const subline = this.host.addChildLabel(node, 'GachaPoolSubline', pool.locked ? (pool.buttonDisabledReason ?? '锁定') : pool.subline, -width / 2 + 66 * scale, -19 * scale, 18 * scale, pool.locked ? rgba(151, 137, 110) : rgba(214, 170, 86), new Size(width - 92 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    subline.overflow = Label.Overflow.SHRINK;
  }

  private drawPoolTabLogoBackdrop(parent: Node, pool: GachaPreviewPool, width: number, height: number): void {
    const logoPath = this.normalizeSpriteFramePath(pool.tabLogoAsset || pool.logoAsset);
    if (!logoPath) {
      return;
    }
    const logo = this.host.addSprite('GachaPoolTabLogoBackdrop', logoPath, width * 0.31, 0, width * 0.33, height * 0.82, parent);
    if (!logo) {
      return;
    }
    const opacity = logo.node.addComponent(UIOpacity);
    opacity.opacity = pool.active ? 118 : 86;
  }

  private drawPoolLogoSlot(parent: Node, pool: GachaPreviewPool, size: number, scale: number): void {
    const graphics = parent.addComponent(Graphics);
    const tone = gachaRarityTone(pool.rarity);
    graphics.fillColor = rgba(5, 5, 8, 196);
    graphics.circle(0, 0, size * 0.42);
    graphics.fill();
    graphics.strokeColor = tone.stroke;
    graphics.lineWidth = Math.max(1.2, 1.5 * scale);
    graphics.circle(0, 0, size * 0.42);
    graphics.stroke();
    const logoPath = this.normalizeSpriteFramePath(pool.logoAsset);
    const logo = logoPath ? this.host.addSprite('GachaPoolLogoImage', logoPath, 0, 0, size * 0.74, size * 0.74, parent) : null;
    if (!logo) {
      const label = this.host.addChildLabel(parent, 'GachaPoolLogoText', pool.logoText ?? pool.badgeText ?? pool.rarity, 0, 0, 15 * scale, tone.text, new Size(size * 0.72, size * 0.72));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, false);
    }
  }

  private normalizeSpriteFramePath(path: string | null | undefined): string | null {
    const value = (path ?? '').trim();
    if (!value) {
      return null;
    }
    return value.endsWith('/spriteFrame') ? value : `${value}/spriteFrame`;
  }

  private renderCenterStage(parent: Node, layout: UiLayout, scale: number, selectedPool: GachaPreviewPool, state: GachaSceneState): void {
    this.renderAbyssSpineStage(parent, layout, scale, selectedPool);
    this.renderPityLine(parent, layout, scale, selectedPool, state);
  }

  private renderAbyssSpineStage(parent: Node, layout: UiLayout, scale: number, selectedPool: GachaPreviewPool): void {
    const stageWidth = clamp(layout.stageWidth * 0.46, 390 * scale, 730 * scale);
    const stageHeight = clamp(layout.stageHeight * 0.63, 360 * scale, 610 * scale);
    const centerY = (layout.stageTop + layout.stageBottom) / 2 - 18 * scale;
    const stage = this.host.addChildPlainNode(parent, 'GachaAbyssSpineStage', 0, centerY, stageWidth, stageHeight);
    const graphics = stage.addComponent(Graphics);
    const spineGroundY = this.resolveGachaSpineGroundY(stageHeight, selectedPool);
    graphics.fillColor = rgba(0, 0, 0, 70);
    graphics.ellipse(0, spineGroundY - 22 * scale, stageWidth * 0.34, stageHeight * 0.09);
    graphics.fill();
    this.renderC1812SummonStageDecor(stage, stageWidth, stageHeight, scale, spineGroundY, selectedPool);

    const fallback = this.renderAbyssSpineFallback(stage, stageWidth, stageHeight, scale, selectedPool);
    const resource = selectedPool.centerSpineResource || GACHA_ABYSS_SPINE_RESOURCE;
    const uuid = selectedPool.centerSpineUuid || GACHA_ABYSS_SPINE_UUID;
    const skin = selectedPool.centerSpineSkin || GACHA_ABYSS_SPINE_SKIN;
    const intro = selectedPool.centerIntroAnimation || GACHA_ABYSS_SPINE_INTRO_ANIMATION;
    const idle = selectedPool.centerIdleAnimation || GACHA_ABYSS_SPINE_IDLE_ANIMATION;
    const spineNode = this.host.addChildPlainNode(stage, 'GachaAbyssSpineNode', 0, spineGroundY, stageWidth, stageHeight);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    skeleton.timeScale = 0.78;
    const spineScale = this.resolveAbyssSpineScale(layout, scale, resource);
    spineNode.setScale(new Vec3(spineScale, spineScale, 1));
    this.ensureConfiguredSpineData(resource, uuid, (data) => {
      if (!this.isSkeletonNodeAlive(skeleton)) {
        return;
      }
      if (this.applyAbyssSpineData(skeleton, data, safeText(selectedPool.title), skin, intro, idle)) {
        if (this.isNodeAlive(fallback)) {
          fallback.destroy();
        }
        return;
      }
      this.ensureAbyssFallbackSpineData((fallbackData) => {
        if (!this.isSkeletonNodeAlive(skeleton)) {
          return;
        }
        if (this.applyAbyssSpineData(skeleton, fallbackData, 'Lord of the Dark Abyss', GACHA_ABYSS_FALLBACK_SPINE_SKIN, GACHA_ABYSS_FALLBACK_SPINE_INTRO_ANIMATION, GACHA_ABYSS_FALLBACK_SPINE_IDLE_ANIMATION)) {
          if (this.isNodeAlive(fallback)) {
            fallback.destroy();
          }
          this.host.setStatus('huangfengjiaozong Spine 运行时解析失败，已临时显示可用预览 Spine；需要重新导出 huangfengjiaozong。');
        }
      });
    });
  }

  private renderC1812SummonStageDecor(parent: Node, stageWidth: number, stageHeight: number, scale: number, spineGroundY: number, selectedPool: GachaPreviewPool): void {
    const floorWidth = clamp(stageWidth * 0.98, 420 * scale, 740 * scale);
    const floorHeight = floorWidth * (356 / 1024);
    const floorY = spineGroundY - floorHeight * 0.16;
    const floor = this.host.addSprite('GachaC1812SummonFloor', GACHA_C1812_SUMMON_FLOOR_ASSET, 0, floorY, floorWidth, floorHeight, parent);
    if (floor) {
      const opacity = floor.node.addComponent(UIOpacity);
      opacity.opacity = 132;
    }

    const ringSize = clamp(
      stageWidth * (this.isBoxSummonGachaPool(selectedPool) ? 0.38 : 0.32),
      172 * scale,
      268 * scale,
    );
    const ringY = spineGroundY - 8 * scale;
    const ring = this.host.addSprite('GachaC1812SummonMagicCircle', GACHA_C1812_SUMMON_MAGIC_CIRCLE_ASSET, 0, ringY, ringSize, ringSize, parent);
    if (!ring) {
      return;
    }
    const opacity = ring.node.addComponent(UIOpacity);
    opacity.opacity = this.isHeroGachaPool(selectedPool) ? 78 : 104;
    tween(ring.node).by(18, { angle: 360 }).repeatForever().start();
  }

  private resolveGachaSpineGroundY(stageHeight: number, selectedPool: GachaPreviewPool): number {
    const poolOffset = this.isBoxSummonGachaPool(selectedPool)
      ? GACHA_BOX_SUMMON_SPINE_GROUND_Y_EXTRA_RATIO
      : this.isHeroGachaPool(selectedPool)
        ? GACHA_HERO_POOL_SPINE_GROUND_Y_EXTRA_RATIO
        : 0;
    return stageHeight * (GACHA_SPINE_GROUND_Y_RATIO + poolOffset);
  }

  private isBoxSummonGachaPool(selectedPool: GachaPreviewPool): boolean {
    const resource = safeText(selectedPool.centerSpineResource);
    return resource.includes('/box_summon/');
  }

  private isHeroGachaPool(selectedPool: GachaPreviewPool): boolean {
    const poolCode = (selectedPool.poolCode ?? selectedPool.id ?? '').toUpperCase();
    const poolType = (selectedPool.poolType ?? '').toUpperCase();
    const displayType = (selectedPool.displayType ?? '').toUpperCase();
    if (displayType === 'LIMITED' || poolType === 'LIMITED' || poolCode.includes('LIMITED')) {
      return false;
    }
    return poolCode === 'NORMAL_HERO'
      || poolCode === 'HERO'
      || selectedPool.id === 'hero'
      || poolType === 'HERO'
      || displayType === 'HERO';
  }

  private renderAbyssSpineFallback(parent: Node, width: number, height: number, scale: number, selectedPool: GachaPreviewPool): Node {
    const node = this.host.addChildPlainNode(parent, 'GachaAbyssSpineLoadingFallback', 0, -height * 0.12, width * 0.46, height * 0.52);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(10, 5, 8, 116);
    graphics.rect(-width * 0.23, -height * 0.26, width * 0.46, height * 0.52);
    graphics.fill();
    graphics.strokeColor = rgba(210, 154, 73, 140);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.stroke();
    graphics.fillColor = rgba(122, 12, 18, 78);
    graphics.circle(0, 0, Math.min(width, height) * 0.18);
    graphics.fill();
    const loadingText = `${safeText(selectedPool.title) || '召唤'}准备中`;
    const label = this.host.addChildLabel(node, 'GachaAbyssSpineLoadingLabel', loadingText, 0, -height * 0.18, 20 * scale, rgba(225, 190, 112), new Size(width * 0.42, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 160;
    tween(opacity).repeatForever(tween().to(0.9, { opacity: 230 }).to(0.9, { opacity: 130 })).start();
    return node;
  }

  private resolveAbyssSpineScale(layout: UiLayout, scale: number, resource: string): number {
    const stageFactor = clamp(Math.min(layout.stageWidth / 1920, layout.stageHeight / 1080), 0.58, 1.15);
    const poolMultiplier = resource.includes('/box_summon/') ? GACHA_BOX_SUMMON_SPINE_SCALE_MULTIPLIER : 1;
    return 0.43 * scale * stageFactor * poolMultiplier;
  }

  private ensureAbyssSpineData(onLoaded: (data: sp.SkeletonData) => void): void {
    if (this.abyssSpineData) {
      onLoaded(this.abyssSpineData);
      return;
    }
    if (this.abyssSpineLoadFailed) {
      return;
    }
    this.abyssSpineLoadCallbacks.push(onLoaded);
    if (this.abyssSpineLoading) {
      return;
    }
    this.abyssSpineLoading = true;
    assetManager.loadAny({ uuid: GACHA_ABYSS_SPINE_UUID }, (uuidError: Error | null, asset: unknown) => {
      if (!uuidError && asset) {
        this.finishAbyssSpineLoad(asset as sp.SkeletonData);
        return;
      }
      resources.load(GACHA_ABYSS_SPINE_RESOURCE, sp.SkeletonData, (resourceError: Error | null, data: sp.SkeletonData | null) => {
        if (!resourceError && data) {
          this.finishAbyssSpineLoad(data);
          return;
        }
        this.abyssSpineLoading = false;
        this.abyssSpineLoadFailed = true;
        this.abyssSpineLoadCallbacks.length = 0;
        const message = resourceError?.message || uuidError?.message || 'unknown error';
        console.warn(`[Gacha] huangfengjiaozong spine load failed: ${message}`);
        this.host.setStatus('召唤 Spine 资源加载失败，请确认 assets/resources/spine/gacha/huangfengjiaozong 已重新导入。');
      });
    });
  }

  private finishAbyssSpineLoad(data: sp.SkeletonData): void {
    this.abyssSpineLoading = false;
    this.abyssSpineData = data;
    const callbacks = this.abyssSpineLoadCallbacks.splice(0);
    this.runSpineLoadCallbacks(callbacks, data, 'huangfengjiaozong');
  }

  private ensureAbyssFallbackSpineData(onLoaded: (data: sp.SkeletonData) => void): void {
    if (this.abyssFallbackSpineData) {
      onLoaded(this.abyssFallbackSpineData);
      return;
    }
    if (this.abyssFallbackSpineLoadFailed) {
      return;
    }
    this.abyssFallbackSpineLoadCallbacks.push(onLoaded);
    if (this.abyssFallbackSpineLoading) {
      return;
    }
    this.abyssFallbackSpineLoading = true;
    resources.load(GACHA_ABYSS_FALLBACK_SPINE_RESOURCE, sp.SkeletonData, (resourceError: Error | null, data: sp.SkeletonData | null) => {
      if (!resourceError && data) {
        this.finishAbyssFallbackSpineLoad(data);
        return;
      }
      assetManager.loadAny({ uuid: GACHA_ABYSS_FALLBACK_SPINE_UUID }, (uuidError: Error | null, asset: unknown) => {
        if (!uuidError && asset) {
          this.finishAbyssFallbackSpineLoad(asset as sp.SkeletonData);
          return;
        }
        this.abyssFallbackSpineLoading = false;
        this.abyssFallbackSpineLoadFailed = true;
        this.abyssFallbackSpineLoadCallbacks.length = 0;
        const message = resourceError?.message || uuidError?.message || 'unknown error';
        console.warn(`[Gacha] fallback spine load failed: ${message}`);
        this.host.setStatus('huangfengjiaozong Spine 解析失败，备用预览 Spine 也加载失败，请检查 resources/spine/gacha 资源导入。');
      });
    });
  }

  private finishAbyssFallbackSpineLoad(data: sp.SkeletonData): void {
    this.abyssFallbackSpineLoading = false;
    this.abyssFallbackSpineData = data;
    const callbacks = this.abyssFallbackSpineLoadCallbacks.splice(0);
    this.runSpineLoadCallbacks(callbacks, data, 'fallback');
  }

  private runSpineLoadCallbacks(callbacks: Array<(data: sp.SkeletonData) => void>, data: sp.SkeletonData, label: string): void {
    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[Gacha] ${label} spine callback failed after async load: ${message}`);
      }
    });
  }

  private isNodeAlive(node: Node | null | undefined): node is Node {
    return Boolean(node && node.isValid);
  }

  private isSkeletonNodeAlive(skeleton: sp.Skeleton): boolean {
    const node = skeleton.node as Node | null;
    return this.isNodeAlive(node);
  }

  private ensureConfiguredSpineData(resource: string, uuid: string | null, onLoaded: (data: sp.SkeletonData) => void): void {
    if (resource === GACHA_ABYSS_SPINE_RESOURCE || uuid === GACHA_ABYSS_SPINE_UUID) {
      this.ensureAbyssSpineData(onLoaded);
      return;
    }
    if (resource === GACHA_ABYSS_FALLBACK_SPINE_RESOURCE || uuid === GACHA_ABYSS_FALLBACK_SPINE_UUID) {
      this.ensureAbyssFallbackSpineData(onLoaded);
      return;
    }
    const cacheKey = uuid ? `uuid:${uuid}` : `path:${resource}`;
    const cachedData = this.configuredSpineDataCache.get(cacheKey);
    if (cachedData) {
      onLoaded(cachedData);
      return;
    }
    if (this.configuredSpineLoadFailedKeys.has(cacheKey)) {
      return;
    }
    const callbacks = this.configuredSpineLoadCallbacks.get(cacheKey) ?? [];
    callbacks.push(onLoaded);
    this.configuredSpineLoadCallbacks.set(cacheKey, callbacks);
    if (this.configuredSpineLoadingKeys.has(cacheKey)) {
      return;
    }
    this.configuredSpineLoadingKeys.add(cacheKey);
    const finishLoad = (data: sp.SkeletonData) => {
      this.configuredSpineLoadingKeys.delete(cacheKey);
      this.configuredSpineDataCache.set(cacheKey, data);
      const loadedCallbacks = this.configuredSpineLoadCallbacks.get(cacheKey) ?? [];
      this.configuredSpineLoadCallbacks.delete(cacheKey);
      this.runSpineLoadCallbacks(loadedCallbacks, data, resource);
    };
    const failLoad = (message: string) => {
      this.configuredSpineLoadingKeys.delete(cacheKey);
      this.configuredSpineLoadFailedKeys.add(cacheKey);
      this.configuredSpineLoadCallbacks.delete(cacheKey);
      console.warn(`[Gacha] configured spine load failed: ${resource}, ${message}`);
      this.host.setStatus(`卡池 Spine 资源加载失败：${resource}`);
    };
    const loadByResource = () => {
      resources.load(resource, sp.SkeletonData, (resourceError: Error | null, data: sp.SkeletonData | null) => {
        if (!resourceError && data) {
          finishLoad(data);
          return;
        }
        const message = resourceError?.message || 'unknown error';
        failLoad(message);
      });
    };
    if (!uuid) {
      loadByResource();
      return;
    }
    assetManager.loadAny({ uuid }, (uuidError: Error | null, asset: unknown) => {
      if (!uuidError && asset) {
        finishLoad(asset as sp.SkeletonData);
        return;
      }
      loadByResource();
    });
  }

  private applyAbyssSpineData(
    skeleton: sp.Skeleton,
    data: sp.SkeletonData,
    assetLabel: string,
    preferredSkin: string,
    preferredIntroAnimation: string,
    preferredIdleAnimation: string,
  ): boolean {
    try {
      if (!this.isSkeletonNodeAlive(skeleton)) {
        return false;
      }
      skeleton.skeletonData = data;
      const runtimeData = data.getRuntimeData(true);
      if (!runtimeData) {
        console.warn(`[Gacha] ${assetLabel} spine runtime data missing; skel/atlas/texture may be mismatched or unsupported by Cocos Spine runtime.`);
        this.host.setStatus(`${assetLabel} Spine 运行时解析失败，请检查 skel/atlas/texture 是否匹配。`);
        return false;
      }
      const skinName = this.resolveAbyssSpineSkinName(data, preferredSkin);
      if (skinName) {
        skeleton.setSkin(skinName);
        skeleton.setSlotsToSetupPose();
      }
      const idleAnimation = this.resolveAbyssSpineAnimationName(data, preferredIdleAnimation);
      if (!idleAnimation) {
        skeleton.setToSetupPose();
        this.logAbyssSpineResolved(data, skinName, '<setup-pose>', assetLabel);
        this.host.setStatus(`${assetLabel} 未找到导出动画，已显示静态骨骼首帧。`);
        return true;
      }
      const introAnimation = this.resolveAbyssSpineAnimationName(data, preferredIntroAnimation);
      if (introAnimation && introAnimation !== idleAnimation) {
        const introTrack = skeleton.setAnimation(0, introAnimation, false);
        const idleTrack = skeleton.addAnimation(0, idleAnimation, true, 0);
        if (!introTrack && !idleTrack) {
          this.host.setStatus(`召唤 Spine 动画 ${introAnimation}/${idleAnimation} 播放失败。`);
          return false;
        }
        this.logAbyssSpineResolved(data, skinName, idleAnimation, assetLabel);
        return true;
      }
      const track = skeleton.setAnimation(0, idleAnimation, true);
      if (!track) {
        this.host.setStatus(`召唤 Spine 动画 ${idleAnimation} 播放失败。`);
        return false;
      }
      this.logAbyssSpineResolved(data, skinName, idleAnimation, assetLabel);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Gacha] ${assetLabel} spine apply failed: ${message}`);
      this.host.setStatus(`召唤 Spine 播放失败：${message}`);
      return false;
    }
  }

  private resolveAbyssSpineSkinName(data: sp.SkeletonData, preferred: string): string | null {
    return this.resolveSpineEnumName(data.getSkinsEnum(), preferred, []);
  }

  private resolveAbyssSpineAnimationName(data: sp.SkeletonData, preferred: string): string | null {
    return this.resolveSpineEnumName(data.getAnimsEnum(), preferred, ['idle', 'stand', 'loop', 'animation', 'daiji', 'wait', '待机']);
  }

  private resolveSpineEnumName(enumMap: { [key: string]: number } | null, preferred: string, fallbackHints: string[]): string | null {
    if (!enumMap) {
      return null;
    }
    const names = Object.keys(enumMap).filter((name) => name !== '<None>' && typeof enumMap[name] === 'number');
    if (preferred && names.includes(preferred)) {
      return preferred;
    }
    for (const hint of fallbackHints) {
      const matched = names.find((name) => name.toLowerCase().includes(hint.toLowerCase()));
      if (matched) {
        return matched;
      }
    }
    return names[0] ?? null;
  }

  private logAbyssSpineResolved(data: sp.SkeletonData, skinName: string | null, animationName: string, assetLabel: string): void {
    const runtimeData = data.getRuntimeData(true);
    const width = runtimeData?.width ?? 0;
    const height = runtimeData?.height ?? 0;
    console.info(`[Gacha] ${assetLabel} spine applied: skin=${skinName ?? '<setup>'}, animation=${animationName}, size=${Math.round(width)}x${Math.round(height)}`);
  }

  private drawCardOrnaments(graphics: Graphics, width: number, height: number, scale: number, active: boolean): void {
    const corner = 22 * scale;
    graphics.strokeColor = active ? rgba(255, 222, 122, 190) : rgba(220, 175, 96, 130);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(-width / 2 + corner, height / 2 - 8 * scale);
    graphics.lineTo(width / 2 - corner, height / 2 - 8 * scale);
    graphics.moveTo(-width / 2 + corner, -height / 2 + 8 * scale);
    graphics.lineTo(width / 2 - corner, -height / 2 + 8 * scale);
    graphics.moveTo(-width / 2 + 8 * scale, height / 2 - corner);
    graphics.lineTo(-width / 2 + 8 * scale, -height / 2 + corner);
    graphics.moveTo(width / 2 - 8 * scale, height / 2 - corner);
    graphics.lineTo(width / 2 - 8 * scale, -height / 2 + corner);
    graphics.stroke();
  }

  private drawPortraitSilhouette(graphics: Graphics, width: number, height: number, scale: number, rarity: GachaRarity): void {
    const tone = gachaRarityTone(rarity);
    graphics.fillColor = new Color(tone.stroke.r, tone.stroke.g, tone.stroke.b, 42);
    graphics.circle(0, height * 0.14, width * 0.22);
    graphics.fill();
    graphics.fillColor = rgba(5, 5, 8, 210);
    graphics.circle(0, height * 0.08, width * 0.18);
    graphics.fill();
    graphics.moveTo(-width * 0.26, -height * 0.22);
    graphics.lineTo(-width * 0.14, -height * 0.02);
    graphics.lineTo(0, height * 0.05);
    graphics.lineTo(width * 0.15, -height * 0.02);
    graphics.lineTo(width * 0.28, -height * 0.22);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = new Color(tone.stroke.r, tone.stroke.g, tone.stroke.b, 120);
    graphics.lineWidth = Math.max(1, scale);
    graphics.moveTo(-width * 0.28, height * 0.2);
    graphics.lineTo(width * 0.28, height * 0.34);
    graphics.moveTo(width * 0.24, height * 0.2);
    graphics.lineTo(-width * 0.16, height * 0.34);
    graphics.stroke();
  }

  private renderPityLine(parent: Node, layout: UiLayout, scale: number, selectedPool: GachaPreviewPool, state: GachaSceneState): void {
    const y = layout.stageTop - 92 * scale;
    const pityText = this.resolvePityText(selectedPool, state);
    // 参考图:保底次数金色放大突出,"再召唤 N 次必得 XX"拆段排布;其他句式整句居中兜底。
    const match = /^再召唤 (\d+) 次必得 (.+)$/.exec(pityText);
    if (match) {
      const segments: { name: string; text: string; width: number; size: number; color: Color; bold: boolean }[] = [
        { name: 'GachaPityPrefix', text: '再召唤 ', width: 3 * 24 * scale + 10 * scale, size: 24 * scale, color: rgba(240, 226, 200), bold: false },
        { name: 'GachaPityCount', text: match[1], width: match[1].length * 22 * scale + 6 * scale, size: 37 * scale, color: rgba(255, 200, 64), bold: true },
        { name: 'GachaPityMiddle', text: ' 次必得 ', width: 4 * 24 * scale + 12 * scale, size: 24 * scale, color: rgba(240, 226, 200), bold: false },
        { name: 'GachaPityRarity', text: match[2], width: match[2].length * 27 * scale, size: 27 * scale, color: rgba(252, 216, 130), bold: true },
      ];
      let cursorX = -segments.reduce((sum, seg) => sum + seg.width, 0) / 2;
      for (const seg of segments) {
        const label = this.host.addChildLabel(parent, seg.name, seg.text, cursorX + seg.width / 2, y, seg.size, seg.color, new Size(seg.width + 8 * scale, 46 * scale));
        label.overflow = Label.Overflow.SHRINK;
        this.applyOutline(label, scale, seg.bold);
        cursorX += seg.width;
      }
    } else {
      const text = this.host.addChildLabel(parent, 'GachaPityLine', pityText, 0, y, 24 * scale, rgba(248, 216, 143), new Size(layout.stageWidth * 0.5, 34 * scale));
      text.overflow = Label.Overflow.SHRINK;
      this.applyOutline(text, scale, true);
    }
    // 副行:文字按估宽收拢,两侧金色菱形装饰线贴近文字(复用 summon_divider,菱形端朝内)。
    const noteText = selectedPool.noticeText ?? '卡池信息由后端配置驱动。';
    let noteWidth = 0;
    for (const ch of noteText) {
      noteWidth += ch.charCodeAt(0) > 255 ? 14.5 * scale : 8 * scale;
    }
    noteWidth = Math.min(noteWidth + 12 * scale, layout.stageWidth * 0.6);
    const noteY = y - 31 * scale;
    const note = this.host.addChildLabel(parent, 'GachaPhaseGuardNote', noteText, 0, noteY, 16 * scale, rgba(186, 163, 118), new Size(noteWidth, 22 * scale));
    note.overflow = Label.Overflow.SHRINK;
    const dividerWidth = Math.min(layout.stageWidth * 0.115, 168 * scale);
    const dividerHeight = dividerWidth * (66 / 389);
    this.host.addSprite('GachaPityDividerL', GACHA_RESULT_DIVIDER_LEFT_ASSET, -noteWidth / 2 - dividerWidth / 2 - 8 * scale, noteY, dividerWidth, dividerHeight, parent);
    this.host.addSprite('GachaPityDividerR', GACHA_RESULT_DIVIDER_RIGHT_ASSET, noteWidth / 2 + dividerWidth / 2 + 8 * scale, noteY, dividerWidth, dividerHeight, parent);
  }

  private resolvePityText(selectedPool: GachaPreviewPool, state: GachaSceneState): string {
    if (selectedPool.locked || selectedPool.previewOnly || selectedPool.drawEnabled !== true) {
      return selectedPool.buttonDisabledReason ?? '该召唤暂未开放';
    }
    const priority = state.pity.find((pity) => pity.rarity === 'UR') ?? state.pity.find((pity) => pity.rarity === 'SSR') ?? state.pity[0];
    // 装备池保底词按装备品质命名,英雄池保持英雄称谓。
    const isEquipPool = ((selectedPool.poolCode ?? selectedPool.id) || '').toUpperCase().includes('EQUIP');
    if (!priority) {
      return isEquipPool ? '再召唤 40 次必得 橙色传说装备' : '再召唤 30 次必得 传说英雄';
    }
    const left = Math.max(0, priority.pityCount - priority.counter);
    const rarityText = isEquipPool
      ? (priority.rarity === 'UR' ? '炽红神话装备' : priority.rarity === 'SSR' ? '橙色传说装备' : priority.rarity === 'SR' ? '紫色史诗装备' : `${priority.rarity} 级装备`)
      : (priority.rarity === 'UR' ? '神话英雄' : priority.rarity === 'SSR' ? '传说英雄' : `${priority.rarity}英雄`);
    return `再召唤 ${left} 次必得 ${rarityText}`;
  }

  private renderRightPanel(parent: Node, layout: UiLayout, scale: number, selectedPool: GachaPreviewPool): void {
    const actionSize = 62 * scale;
    const gap = 22 * scale;
    const totalHeight = GACHA_RIGHT_ACTIONS.length * actionSize + (GACHA_RIGHT_ACTIONS.length - 1) * gap;
    const x = layout.stageRight - 86 * scale;
    let cursorY = (layout.stageTop + layout.stageBottom) / 2 + totalHeight / 2 - actionSize / 2;
    for (const action of this.resolveRightActions(selectedPool)) {
      this.renderActionButton(parent, action.key, action.label, action.note, x, cursorY, actionSize, scale);
      cursorY -= actionSize + gap;
    }
    this.renderUpPreview(parent, layout, scale);
  }

  private renderActionButton(parent: Node, key: GachaActionKey, label: string, note: string, x: number, y: number, size: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, `GachaAction_${key}`, x, y, size, size + 28 * scale);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => {
      this.host.setStatus(note);
      this.host.openGachaActionScene(key);
    }, this);
    this.host.applyImageButtonFeedback(node, 1.04, 0.96);
    const art = this.host.addSprite('GachaActionArt', GACHA_ACTION_ICON_ASSETS[key], 0, 10 * scale, size, size, node);
    if (!art) {
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = rgba(5, 5, 8, 168);
      graphics.circle(0, 10 * scale, size * 0.42);
      graphics.fill();
      graphics.strokeColor = rgba(205, 154, 72, 205);
      graphics.lineWidth = Math.max(1.2, 1.5 * scale);
      graphics.circle(0, 10 * scale, size * 0.42);
      graphics.stroke();
      this.drawActionGlyph(graphics, key, size, scale);
    }
    const text = this.host.addChildLabel(node, 'GachaActionLabel', label, 0, -size * 0.42, 19 * scale, rgba(225, 190, 112), new Size(size + 24 * scale, 24 * scale));
    text.overflow = Label.Overflow.SHRINK;
    this.applyOutline(text, scale, false);
  }

  private drawActionGlyph(graphics: Graphics, key: GachaActionKey, size: number, scale: number): void {
    graphics.strokeColor = rgba(244, 203, 113, 230);
    graphics.lineWidth = Math.max(2, 2 * scale);
    if (key === 'info') {
      graphics.moveTo(-size * 0.18, 10 * scale);
      graphics.lineTo(size * 0.18, 10 * scale);
      graphics.moveTo(-size * 0.1, size * 0.19);
      graphics.lineTo(-size * 0.2, -size * 0.05);
      graphics.moveTo(size * 0.1, size * 0.19);
      graphics.lineTo(size * 0.2, -size * 0.05);
      graphics.stroke();
      return;
    }
    if (key === 'record') {
      graphics.rect(-size * 0.16, -size * 0.08, size * 0.32, size * 0.32);
      graphics.moveTo(-size * 0.08, size * 0.14);
      graphics.lineTo(size * 0.08, size * 0.14);
      graphics.moveTo(-size * 0.08, size * 0.04);
      graphics.lineTo(size * 0.08, size * 0.04);
      graphics.stroke();
      return;
    }
    if (key === 'exchange') {
      graphics.moveTo(-size * 0.18, size * 0.08);
      graphics.lineTo(size * 0.14, size * 0.08);
      graphics.lineTo(size * 0.05, size * 0.17);
      graphics.moveTo(size * 0.18, -size * 0.08);
      graphics.lineTo(-size * 0.14, -size * 0.08);
      graphics.lineTo(-size * 0.05, -size * 0.17);
      graphics.stroke();
      return;
    }
    graphics.moveTo(0, size * 0.19);
    graphics.lineTo(size * 0.14, 4 * scale);
    graphics.lineTo(size * 0.08, -size * 0.18);
    graphics.lineTo(-size * 0.08, -size * 0.18);
    graphics.lineTo(-size * 0.14, 4 * scale);
    graphics.close();
    graphics.stroke();
  }

  private resolveRightActions(selectedPool: GachaPreviewPool): Array<{ key: GachaActionKey; label: string; note: string }> {
    return GACHA_RIGHT_ACTIONS.map((action) => ({
      key: action.key,
      label: action.label,
      note: action.key === 'info'
        ? [selectedPool.rateNote, selectedPool.guaranteeNote].filter((text) => Boolean(text)).join(' / ') || action.note
        : action.key === 'record'
          ? selectedPool.recordNote ?? action.note
          : action.key === 'exchange'
            ? selectedPool.exchangeNote ?? action.note
            : selectedPool.noticeText ?? action.note,
    }));
  }

  private renderUpPreview(parent: Node, layout: UiLayout, scale: number): void {
    const width = 238 * scale;
    const height = 132 * scale;
    const x = layout.stageRight - width / 2 - 22 * scale;
    const y = layout.stageBottom + height / 2 + 26 * scale;
    const panel = this.host.addChildBeveledPanelNode(parent, 'GachaUpPreviewPanel', x, y, width, height, rgba(8, 7, 8, 206), rgba(184, 134, 57, 184), 12 * scale);
    const title = this.host.addChildLabel(panel, 'GachaUpTitle', '概率提升预览', 0, 31 * scale, 21 * scale, rgba(245, 213, 139), new Size(width - 28 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const line = this.host.addChildLabel(panel, 'GachaUpLine', '限定英雄卡池规则冻结后接入', 0, -3 * scale, 17 * scale, rgba(201, 170, 109), new Size(width - 32 * scale, 44 * scale));
    line.overflow = Label.Overflow.SHRINK;
  }

  private renderBottomSummonBar(parent: Node, layout: UiLayout, scale: number, selectedPool: GachaPreviewPool, state: GachaSceneState): void {
    const y = layout.stageBottom + 88 * scale;
    const buttonWidth = 372 * scale;
    // 按钮高按 button_primary 原比(740:211)走,文字与框体比例才协调。
    const buttonHeight = buttonWidth * (211 / 740);
    const buttonGap = 72 * scale;
    const onceX = -(buttonWidth + buttonGap) / 2;
    const tenX = (buttonWidth + buttonGap) / 2;
    // 每日免费单抽(2026-09-05 新手闭环):选中池命中且今日未用 → 单抽按钮亮"免费召唤"。
    const freeSingle = state.freeSingle != null && state.freeSingle.available && state.freeSingle.poolCode === selectedPool.poolCode;
    const singleCost = freeSingle ? '今日免费 1 次' : this.resolveSummonCostText(selectedPool, 'once');
    const tenCost = this.resolveSummonCostText(selectedPool, 'ten');
    this.renderSummonButton(parent, layout, 'once', 'GachaSummonOnceButton', freeSingle ? '免费召唤' : selectedPool.buttonSingleText ?? '召唤1次', singleCost, onceX, y, buttonWidth, buttonHeight, scale, false, selectedPool, state);
    this.renderSummonButton(parent, layout, 'ten', 'GachaSummonTenButton', selectedPool.buttonTenText ?? '召唤10次', tenCost, tenX, y, buttonWidth, buttonHeight, scale, true, selectedPool, state);
    this.renderSkipAnimationToggle(parent, tenX + buttonWidth / 2 + 96 * scale, y, scale);
  }

  // 跳过动画勾选(偏好持久化):勾选后召唤不播放视频直接出结果;播放中右上另有跳过钮。
  private renderSkipAnimationToggle(parent: Node, x: number, y: number, scale: number): void {
    const enabled = this.host.isGachaSkipAnimationEnabled();
    const boxW = 150 * scale;
    const boxH = 46 * scale;
    const node = this.host.addChildPlainNode(parent, 'GachaSkipAnimToggle', x, y, boxW, boxH);
    const g = node.addComponent(Graphics);
    g.fillColor = enabled ? rgba(56, 40, 15, 238) : rgba(20, 18, 16, 220);
    g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 9 * scale);
    g.fill();
    g.strokeColor = enabled ? rgba(244, 200, 104, 240) : rgba(140, 118, 80, 180);
    g.lineWidth = (enabled ? 2 : 1.4) * scale;
    g.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 9 * scale);
    g.stroke();
    g.fillColor = enabled ? rgba(190, 142, 48, 245) : rgba(12, 11, 10, 235);
    g.roundRect(-boxW / 2 + 10 * scale, -11 * scale, 22 * scale, 22 * scale, 5 * scale);
    g.fill();
    g.strokeColor = enabled ? rgba(252, 224, 150, 250) : rgba(140, 120, 88, 200);
    g.lineWidth = 1.5 * scale;
    g.roundRect(-boxW / 2 + 10 * scale, -11 * scale, 22 * scale, 22 * scale, 5 * scale);
    g.stroke();
    if (enabled) {
      g.strokeColor = rgba(30, 20, 8, 255);
      g.lineWidth = 2.6 * scale;
      g.moveTo(-boxW / 2 + 15 * scale, 0);
      g.lineTo(-boxW / 2 + 19 * scale, -5 * scale);
      g.lineTo(-boxW / 2 + 27 * scale, 6 * scale);
      g.stroke();
    }
    const label = this.host.addChildLabel(node, 'GachaSkipAnimLabel', '跳过动画', -boxW / 2 + 40 * scale, 0, 17 * scale, enabled ? rgba(250, 226, 160) : rgba(206, 190, 158), new Size(boxW - 46 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.toggleGachaSkipAnimation(), this);
    this.host.applyImageButtonFeedback(node, 1.03, 0.97);
  }

  private resolveSummonCostText(selectedPool: GachaPreviewPool, mode: GachaPreviewResultMode): string {
    const primaryType = selectedPool.primaryCostType ?? null;
    const primaryCode = selectedPool.primaryCostCode ?? selectedPool.costCode ?? '预览';
    const primaryAmount = mode === 'ten'
      ? selectedPool.primaryTenCost ?? selectedPool.tenCost ?? 10
      : selectedPool.primarySingleCost ?? selectedPool.singleCost ?? 1;
    const primaryCost = this.resolveCostPart(
      primaryType,
      primaryCode,
      primaryAmount,
    );
    const backupCode = selectedPool.backupCostCode;
    const backupAmount = mode === 'ten' ? selectedPool.backupTenCost : selectedPool.backupSingleCost;
    if (backupCode && backupAmount != null) {
      const backupCost = this.resolveCostPart(selectedPool.backupCostType, backupCode, backupAmount);
      return `${primaryCost} / ${backupCost}`;
    }
    return primaryCost;
  }

  private resolveCostPart(costType: string | null | undefined, costCode: string | null | undefined, amount: string | number | null | undefined): string {
    const label = this.costCodeLabel(costCode);
    const value = compactValue(amount);
    return (costType ?? '').toUpperCase() === 'TICKET' ? `${label} x${value}` : `${label} ${value}`;
  }

  private costCodeLabel(costCode: string | null | undefined): string {
    const code = (costCode ?? '').toUpperCase();
    if (code === 'LIMITED_CONTRACT_TICKET') {
      return '限定券';
    }
    if (code === 'HERO_CONTRACT_TICKET') {
      return '英雄券';
    }
    if (code === 'NORMAL_CONTRACT_TICKET') {
      return '普通券';
    }
    if (code === 'BOUND_DIAMOND') {
      return '绑钻';
    }
    if (code === 'DIAMOND') {
      return '钻石';
    }
    if (code === 'GOLD') {
      return '金币';
    }
    if (code === 'EQUIP_GACHA_TICKET') {
      return '装备券';
    }
    if (code.includes('TICKET')) {
      return '召唤券';
    }
    return costCode ?? '预览';
  }

  private renderSummonButton(parent: Node, layout: UiLayout, mode: GachaPreviewResultMode, name: string, title: string, cost: string, x: number, y: number, width: number, height: number, scale: number, strong: boolean, selectedPool: GachaPreviewPool, state: GachaSceneState): void {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => {
      if (state.drawing) {
        this.host.setStatus('召唤请求处理中，请勿重复点击。');
        return;
      }
      if (selectedPool.locked || selectedPool.previewOnly || selectedPool.drawEnabled !== true) {
        this.host.setStatus(selectedPool.buttonDisabledReason ?? '该卡池暂未开放真实抽卡。');
        return;
      }
      this.host.startGachaDraw(mode);
    }, this);
    this.host.applyImageButtonFeedback(node, 1.028, 0.965);
    const enabled = !state.drawing && !selectedPool.locked && !selectedPool.previewOnly && selectedPool.drawEnabled === true;
    const buttonAsset = enabled ? C1812_BUTTON_PRIMARY_ASSET : C1812_BUTTON_DISABLED_ASSET;
    const art = this.host.addSprite(`${name}Art`, buttonAsset, 0, 0, width, height, node);
    if (!art) {
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = enabled ? (strong ? rgba(82, 15, 17, 232) : rgba(9, 9, 12, 226)) : rgba(18, 18, 20, 214);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.fill();
      graphics.strokeColor = enabled ? (strong ? rgba(229, 67, 47, 230) : rgba(205, 154, 72, 214)) : rgba(116, 102, 78, 170);
      graphics.lineWidth = Math.max(1.5, 1.8 * scale);
      graphics.stroke();
      graphics.fillColor = strong ? rgba(231, 37, 38, 36) : rgba(231, 182, 92, 24);
      graphics.rect(-width / 2, 0, width, height / 2);
      graphics.fill();
    }
    const titleColor = enabled
      ? (art ? (strong ? rgba(255, 244, 228) : rgba(255, 246, 215)) : rgba(248, 221, 160))
      : rgba(168, 154, 122);
    const label = this.host.addChildLabel(node, `${name}Label`, state.drawing ? '召唤中' : title, 0, 2 * scale, 25 * scale, titleColor, new Size(width - 76 * scale, height * 0.6), HorizontalTextAlignment.CENTER);
    label.overflow = Label.Overflow.SHRINK;
    if (!art) {
      this.applyOutline(label, scale, true);
    }
    this.renderSummonCostRow(node, cost, width, height, scale, enabled);
  }

  // 按钮下方消耗行(参考图):每段前置图标(券/钻石/金币),两段以 " / " 分隔各占半侧。
  private renderSummonCostRow(parent: Node, cost: string, width: number, height: number, scale: number, enabled: boolean): void {
    const parts = cost.split(' / ').map((part) => part.trim()).filter((part) => part.length > 0).slice(0, 2);
    if (parts.length === 0) {
      return;
    }
    const rowY = -height / 2 - 15 * scale;
    const centers = parts.length === 2 ? [-width * 0.2, width * 0.2] : [0];
    parts.forEach((part, index) => {
      const cx = centers[index];
      const isFreeText = part.includes('免费');
      const iconAsset = part.includes('券') ? GACHA_COST_TICKET_ICON_ASSET : part.includes('金币') ? GACHA_COST_GOLD_ICON_ASSET : GACHA_COST_DIAMOND_ICON_ASSET;
      // 估宽:CJK 全宽、数字符号半宽,用于图标贴文字左缘。
      let est = 0;
      for (const ch of part) {
        est += ch.charCodeAt(0) > 255 ? 16 * scale : 9 * scale;
      }
      const iconH = 20 * scale;
      const iconW = iconAsset === GACHA_COST_TICKET_ICON_ASSET ? iconH * (136 / 110) : iconH;
      if (!isFreeText) {
        this.host.addSprite(`GachaSummonCostIcon_${index}`, iconAsset, cx - est / 2 - iconW / 2 - 4 * scale, rowY, iconW, iconH, parent);
      }
      // 免费文案不配货币图标,用亮金色突出"白给"。
      const label = this.host.addChildLabel(parent, `GachaSummonCostText_${index}`, part, cx, rowY, 18 * scale, isFreeText ? rgba(255, 226, 120) : enabled ? rgba(226, 210, 172) : rgba(158, 146, 120), new Size(est + 14 * scale, 24 * scale), HorizontalTextAlignment.CENTER);
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, false);
    });
  }

  private renderSummonVideoContent(parent: Node, layout: UiLayout, scale: number, mode: GachaPreviewResultMode, rarity: GachaRarity | null): void {
    const backdrop = this.host.addChildPlainNode(parent, 'GachaSummonVideoFallbackBackdrop', 0, 0, layout.width, layout.height);
    const backdropGraphics = backdrop.addComponent(Graphics);
    backdropGraphics.fillColor = rgba(0, 0, 0, 255);
    backdropGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    backdropGraphics.fill();

    const loading = this.host.addChildLabel(
      parent,
      'GachaSummonVideoLoadingLabel',
      mode === 'ten' ? '十连契约唤醒中' : '契约唤醒中',
      0,
      0,
      28 * scale,
      rgba(250, 224, 158),
      new Size(Math.min(layout.safeWidth - 80 * scale, 520 * scale), 40 * scale),
    );
    loading.overflow = Label.Overflow.SHRINK;
    this.applyOutline(loading, scale, true);
    const loadingOpacity = loading.node.addComponent(UIOpacity);
    loadingOpacity.opacity = 210;

    const videoResource = this.resolveSummonVideoResource(rarity);
    const videoCoverSize = this.resolveSummonVideoCoverSize(layout);
    const videoNode = this.host.addChildPlainNode(parent, 'GachaSummonVideoPlayer', 0, 0, videoCoverSize.width, videoCoverSize.height);
    videoNode.getComponent(UITransform)?.setContentSize(videoCoverSize);
    const videoPlayer = videoNode.addComponent(VideoPlayer);
    videoPlayer.resourceType = VideoPlayer.ResourceType.LOCAL;
    videoPlayer.playOnAwake = false;
    videoPlayer.loop = false;
    videoPlayer.keepAspectRatio = true;
    videoPlayer.mute = true;
    videoPlayer.volume = 0;

    const audioNode = this.host.addChildPlainNode(parent, 'GachaSummonCallAudio', 0, 0, 1, 1);
    const audioSource = audioNode.addComponent(AudioSource);
    audioSource.loop = false;
    let videoStarted = false;
    let finished = false;

    const tryPlayAudio = () => {
      if (!videoStarted || !audioSource.clip || !this.isNodeAlive(audioNode)) {
        return;
      }
      try {
        audioSource.play();
      } catch (error) {
        console.warn(`[Gacha] summon call audio play failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    const finishOnce = (reason: string) => {
      if (finished) {
        return;
      }
      finished = true;
      try {
        videoPlayer.stop();
      } catch {
        // VideoPlayer may already be stopped after COMPLETED.
      }
      try {
        audioSource.stop();
      } catch {
        // AudioSource may not have started yet.
      }
      console.info(`[Gacha] summon video finished: ${videoResource}, reason=${reason}`);
      this.host.finishGachaSummonVideoScene();
    };

    videoNode.on(VideoPlayer.EventType.PLAYING, () => {
      videoStarted = true;
      loadingOpacity.opacity = 0;
      tryPlayAudio();
    }, this);
    videoNode.on(VideoPlayer.EventType.COMPLETED, () => finishOnce('completed'), this);
    videoNode.on(VideoPlayer.EventType.ERROR, () => {
      this.host.setStatus('召唤视频播放异常，返回召唤结果。');
      finishOnce('video-error');
    }, this);

    resources.load(videoResource, VideoClip, (error: Error | null, clip: VideoClip | null) => {
      if (finished || !this.isNodeAlive(videoNode)) {
        return;
      }
      if (error || !clip) {
        console.warn(`[Gacha] summon video load failed: ${videoResource}, ${error?.message ?? 'empty clip'}`);
        this.host.setStatus('召唤视频加载失败，返回召唤结果。');
        finishOnce('video-load-failed');
        return;
      }
      videoPlayer.clip = clip;
      try {
        videoPlayer.play();
        videoStarted = true;
        loadingOpacity.opacity = 0;
        tryPlayAudio();
      } catch (playError) {
        console.warn(`[Gacha] summon video play failed: ${playError instanceof Error ? playError.message : String(playError)}`);
        this.host.setStatus('召唤视频播放失败，返回召唤结果。');
        finishOnce('video-play-failed');
      }
    });

    resources.load(GACHA_SUMMON_AUDIO_RESOURCE, AudioClip, (error: Error | null, clip: AudioClip | null) => {
      if (finished || !this.isNodeAlive(audioNode)) {
        return;
      }
      if (error || !clip) {
        console.warn(`[Gacha] summon call audio load failed: ${GACHA_SUMMON_AUDIO_RESOURCE}, ${error?.message ?? 'empty clip'}`);
        return;
      }
      audioSource.clip = clip;
      tryPlayAudio();
    });

    tween(videoNode)
      .delay(GACHA_SUMMON_VIDEO_FALLBACK_SECONDS)
      .call(() => finishOnce('fallback-timeout'))
      .start();
  }

  private resolveSummonVideoResource(rarity: GachaRarity | null): string {
    return rarity === 'SSR' || rarity === 'UR' ? GACHA_SUMMON_VIDEO_RARE_RESOURCE : GACHA_SUMMON_VIDEO_NORMAL_RESOURCE;
  }

  private resolveSummonVideoCoverSize(layout: UiLayout): Size {
    const videoAspect = GACHA_SUMMON_VIDEO_ASPECT_WIDTH / GACHA_SUMMON_VIDEO_ASPECT_HEIGHT;
    const viewportAspect = layout.width / layout.height;
    if (viewportAspect > videoAspect) {
      return new Size(layout.width, layout.width / videoAspect);
    }
    return new Size(layout.height * videoAspect, layout.height);
  }

  private renderRevealSceneContent(parent: Node, layout: UiLayout, scale: number, mode: GachaPreviewResultMode): void {
    const results = mode === 'once' ? GACHA_MOCK_RESULT_ONCE : GACHA_MOCK_RESULT_TEN;
    const veil = this.host.addChildPlainNode(parent, 'GachaRevealSceneVeil', 0, 0, layout.width, layout.height);
    const veilGraphics = veil.addComponent(Graphics);
    veilGraphics.fillColor = rgba(0, 0, 0, 118);
    veilGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    veilGraphics.fill();

    const stageWidth = clamp(layout.stageWidth * 0.58, 430 * scale, 860 * scale);
    const stageHeight = clamp(layout.stageHeight * 0.58, 330 * scale, 560 * scale);
    const stage = this.host.addChildPlainNode(parent, 'GachaRevealSceneContent', 0, -10 * scale, stageWidth, stageHeight);
    stage.addComponent(BlockInputEvents);
    const graphics = stage.addComponent(Graphics);
    graphics.fillColor = rgba(8, 6, 8, 158);
    graphics.rect(-stageWidth / 2, -stageHeight / 2, stageWidth, stageHeight);
    graphics.fill();
    graphics.strokeColor = rgba(214, 157, 72, 152);
    graphics.lineWidth = Math.max(1.2, 1.6 * scale);
    graphics.stroke();

    this.drawRevealSigil(stage, stageWidth, stageHeight, scale);
    this.renderRevealHeader(stage, mode, stageWidth, stageHeight, scale);
    this.renderRevealCardFan(stage, results, mode, stageWidth, stageHeight, scale);
    this.renderRevealStepTimeline(stage, stageWidth, stageHeight, scale);
    this.renderRevealNoWriteStrip(parent, layout, scale);
    this.renderRevealContinueButton(parent, mode, layout, scale);
  }

  private renderRevealHeader(parent: Node, mode: GachaPreviewResultMode, width: number, height: number, scale: number): void {
    const title = this.host.addChildLabel(parent, 'GachaRevealSceneTitle', mode === 'once' ? '单次召唤演出预览' : '十连召唤演出预览', 0, height / 2 - 42 * scale, 30 * scale, rgba(253, 224, 151), new Size(width - 70 * scale, 42 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const subtitle = this.host.addChildLabel(parent, 'GachaRevealSceneSubtitle', '当前只展示本地 mock 揭示节奏，不代表真实概率或奖励。', 0, height / 2 - 76 * scale, 18 * scale, rgba(194, 168, 114), new Size(width - 78 * scale, 26 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;
  }

  private renderRevealCardFan(parent: Node, results: GachaMockResultItem[], mode: GachaPreviewResultMode, width: number, height: number, scale: number): void {
    if (mode === 'once') {
      const cardHeight = Math.min(height * 0.52, 280 * scale);
      const cardWidth = cardHeight / 1.46;
      this.renderRevealCardBack(parent, results[0], 0, 0, 4 * scale, cardWidth, cardHeight, scale, true);
      return;
    }

    const columns = 5;
    const rows = 2;
    const gapX = 14 * scale;
    const gapY = 14 * scale;
    const maxWidth = width - 84 * scale;
    const maxHeight = height * 0.43;
    let cardWidth = Math.min(108 * scale, (maxWidth - gapX * (columns - 1)) / columns);
    let cardHeight = cardWidth * 1.46;
    const rowHeightLimit = (maxHeight - gapY * (rows - 1)) / rows;
    if (cardHeight > rowHeightLimit) {
      cardHeight = rowHeightLimit;
      cardWidth = cardHeight / 1.46;
    }
    const gridWidth = columns * cardWidth + (columns - 1) * gapX;
    const gridHeight = rows * cardHeight + (rows - 1) * gapY;
    const startX = -gridWidth / 2 + cardWidth / 2;
    const startY = 30 * scale + gridHeight / 2 - cardHeight / 2;
    results.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      this.renderRevealCardBack(parent, item, index, startX + column * (cardWidth + gapX), startY - row * (cardHeight + gapY), cardWidth, cardHeight, scale, item.featured);
    });
  }

  private renderRevealCardBack(parent: Node, item: GachaMockResultItem, index: number, x: number, y: number, width: number, height: number, scale: number, featured: boolean): void {
    const node = this.host.addChildPlainNode(parent, `GachaRevealCardBack_${index}_${item.rarity}`, x, y, width, height);
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 0;
    tween(opacity).delay(index * 0.055).to(0.2, { opacity: 255 }).start();

    const tone = gachaRarityTone(item.rarity);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(5, 5, 8, 228);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = new Color(tone.glow.r, tone.glow.g, tone.glow.b, featured ? 92 : 58);
    graphics.rect(-width / 2, -height * 0.08, width, height * 0.58);
    graphics.fill();
    graphics.strokeColor = featured ? rgba(255, 224, 122, 255) : tone.stroke;
    graphics.lineWidth = Math.max(1.4, featured ? 2.8 * scale : 1.5 * scale);
    graphics.stroke();
    this.drawCardOrnaments(graphics, width, height, scale, featured);
    const frameSize = Math.min(width * 0.72, height * 0.5);
    const frame = this.host.addSprite('GachaC1812RevealCaseFrame', GACHA_C1812_SUMMON_CASE_FRAME_ASSET, 0, height * 0.12, frameSize, frameSize, node);
    if (frame) {
      const frameOpacity = frame.node.addComponent(UIOpacity);
      frameOpacity.opacity = featured ? 118 : 88;
    }
    this.drawRevealCardSeal(graphics, width, height, scale, tone.stroke);
    const label = this.host.addChildLabel(node, 'GachaRevealCardBackLabel', featured ? 'UP' : item.rarity, 0, -height / 2 + 24 * scale, featured ? 20 * scale : 16 * scale, tone.text, new Size(width - 20 * scale, 26 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
  }

  private drawRevealSigil(parent: Node, width: number, height: number, scale: number): void {
    const sigil = this.host.addChildPlainNode(parent, 'GachaRevealSigilPulse', 0, 34 * scale, width * 0.68, height * 0.54);
    const graphics = sigil.addComponent(Graphics);
    const radius = Math.min(width, height) * 0.23;
    graphics.strokeColor = rgba(230, 70, 54, 118);
    graphics.lineWidth = Math.max(1.4, 1.8 * scale);
    graphics.circle(0, 0, radius);
    graphics.circle(0, 0, radius * 0.68);
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const start = radius * 0.38;
      const end = radius * 1.08;
      graphics.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
      graphics.lineTo(Math.cos(angle) * end, Math.sin(angle) * end);
    }
    graphics.stroke();
    graphics.fillColor = rgba(180, 18, 26, 48);
    graphics.circle(0, 0, radius * 0.82);
    graphics.fill();
    const opacity = sigil.addComponent(UIOpacity);
    opacity.opacity = 160;
    tween(opacity).repeatForever(tween().to(0.75, { opacity: 238 }).to(0.75, { opacity: 132 })).start();
  }

  private drawRevealCardSeal(graphics: Graphics, width: number, height: number, scale: number, color: Color): void {
    graphics.strokeColor = new Color(color.r, color.g, color.b, 170);
    graphics.lineWidth = Math.max(1.2, 1.5 * scale);
    graphics.circle(0, height * 0.12, Math.min(width, height) * 0.18);
    graphics.moveTo(-width * 0.18, height * 0.12);
    graphics.lineTo(width * 0.18, height * 0.12);
    graphics.moveTo(0, height * 0.3);
    graphics.lineTo(0, -height * 0.06);
    graphics.moveTo(-width * 0.23, -height * 0.12);
    graphics.lineTo(width * 0.23, height * 0.36);
    graphics.moveTo(width * 0.23, -height * 0.12);
    graphics.lineTo(-width * 0.23, height * 0.36);
    graphics.stroke();
  }

  private renderRevealStepTimeline(parent: Node, width: number, height: number, scale: number): void {
    const y = -height / 2 + 58 * scale;
    const totalWidth = width - 112 * scale;
    const stepGap = totalWidth / Math.max(1, GACHA_REVEAL_STEPS.length - 1);
    const startX = -totalWidth / 2;
    const lineNode = this.host.addChildPlainNode(parent, 'GachaRevealStepProgressLine', 0, y + 16 * scale, totalWidth, 30 * scale);
    const graphics = lineNode.addComponent(Graphics);
    graphics.strokeColor = rgba(126, 91, 48, 176);
    graphics.lineWidth = Math.max(1.4, 1.8 * scale);
    graphics.moveTo(-totalWidth / 2, 0);
    graphics.lineTo(totalWidth / 2, 0);
    graphics.stroke();
    GACHA_REVEAL_STEPS.forEach((step, index) => {
      this.renderRevealStep(parent, step, startX + stepGap * index, y, totalWidth, scale, index);
    });
  }

  private renderRevealStep(parent: Node, step: GachaRevealStep, x: number, y: number, totalWidth: number, scale: number, index: number): void {
    const node = this.host.addChildPlainNode(parent, `GachaRevealStep_${index}`, x, y + 16 * scale, 132 * scale, 68 * scale);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(7, 6, 8, 196);
    graphics.circle(0, 0, 13 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(229, 175, 86, 210);
    graphics.lineWidth = Math.max(1.2, 1.5 * scale);
    graphics.circle(0, 0, 13 * scale);
    graphics.stroke();
    const title = this.host.addChildLabel(node, 'GachaRevealStepTitle', step.title, 0, -25 * scale, 16 * scale, rgba(238, 205, 132), new Size(96 * scale, 22 * scale));
    title.overflow = Label.Overflow.SHRINK;
    const detail = this.host.addChildLabel(node, 'GachaRevealStepDetail', step.detail, 0, -45 * scale, 14 * scale, rgba(161, 137, 96), new Size(Math.min(170 * scale, totalWidth / 3), 18 * scale));
    detail.overflow = Label.Overflow.SHRINK;
  }

  private renderRevealNoWriteStrip(parent: Node, layout: UiLayout, scale: number): void {
    const width = Math.min(layout.safeWidth - 72 * scale, 760 * scale);
    const y = layout.stageBottom + 124 * scale;
    const strip = this.host.addChildPlainNode(parent, 'GachaRevealNoWriteStrip', 0, y, width, 36 * scale);
    const graphics = strip.addComponent(Graphics);
    graphics.fillColor = rgba(3, 4, 7, 184);
    graphics.rect(-width / 2, -18 * scale, width, 36 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(181, 134, 65, 138);
    graphics.stroke();
    const label = this.host.addChildLabel(strip, 'GachaRevealNoWriteText', '视觉演出阶段：不扣资源、不生成 drawNo、不写记录、不更新保底。', 0, 1 * scale, 17 * scale, rgba(187, 164, 112), new Size(width - 28 * scale, 28 * scale));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderRevealContinueButton(parent: Node, mode: GachaPreviewResultMode, layout: UiLayout, scale: number): void {
    const width = mode === 'once' ? 270 * scale : 310 * scale;
    const height = 54 * scale;
    const y = layout.stageBottom + 62 * scale;
    const button = this.host.addChildPlainNode(parent, 'GachaRevealContinueButton', 0, y, width, height);
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => {
      this.host.setStatus('查看本地 mock 结果：仍不扣资源、不发英雄、不写入抽卡记录或保底。');
      this.host.openGachaMockResultScene(mode);
    }, this);
    this.host.applyImageButtonFeedback(button, 1.035, 0.965);
    const art = this.host.addSprite('GachaRevealContinueArt', C1812_BUTTON_PRIMARY_ASSET, 0, 0, width, height, button);
    if (!art) {
      const graphics = button.addComponent(Graphics);
      graphics.fillColor = rgba(82, 15, 17, 235);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.fill();
      graphics.strokeColor = rgba(230, 73, 52, 235);
      graphics.lineWidth = Math.max(1.5, 1.8 * scale);
      graphics.stroke();
    }
    const label = this.host.addChildLabel(button, 'GachaRevealContinueLabel', '查看本地结果', 0, 1 * scale, 22 * scale, art ? rgba(255, 240, 200) : rgba(250, 224, 162), new Size(width - 36 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
  }

  private renderMockResultSceneContent(parent: Node, layout: UiLayout, scale: number, mode: GachaPreviewResultMode, drawResult: GachaDrawResultVO | null): void {
    const results = drawResult ? this.toResultPreviewItems(drawResult.items) : (mode === 'once' ? GACHA_MOCK_RESULT_ONCE : GACHA_MOCK_RESULT_TEN);
    this.currentResultItems = results;
    const backdropNode = this.host.addChildPlainNode(parent, 'GachaResultSceneBackdrop', 0, 0, layout.width, layout.height);
    const backdrop = backdropNode.addComponent(Graphics);
    backdrop.fillColor = rgba(0, 0, 0, 196);
    backdrop.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    backdrop.fill();

    // summon_result 整框:按素材原比适配安全区;标题直接写进框自带顶部牌位。
    let panelWidth = Math.max(320 * scale, layout.safeWidth - 26 * scale);
    let panelHeight = panelWidth / GACHA_RESULT_PANEL_ASPECT;
    const maxPanelHeight = Math.max(260 * scale, layout.safeHeight - 30 * scale);
    if (panelHeight > maxPanelHeight) {
      panelHeight = maxPanelHeight;
      panelWidth = panelHeight * GACHA_RESULT_PANEL_ASPECT;
    }
    const panel = this.host.addChildPlainNode(parent, 'GachaResultScenePanel', 0, -6 * scale, panelWidth, panelHeight);
    panel.addComponent(BlockInputEvents);
    const panelGraphics = panel.addComponent(Graphics);
    panelGraphics.fillColor = rgba(9, 7, 8, 244);
    panelGraphics.rect(-panelWidth * 0.47, -panelHeight * 0.45, panelWidth * 0.94, panelHeight * 0.9);
    panelGraphics.fill();
    const panelArt = this.host.addSprite('GachaResultScenePanelArt', GACHA_RESULT_PANEL_ASSET, 0, 0, panelWidth, panelHeight, panel);
    if (!panelArt) {
      panelGraphics.strokeColor = rgba(213, 160, 74, 224);
      panelGraphics.lineWidth = 2 * scale;
      panelGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
      panelGraphics.stroke();
    }

    const title = this.host.addChildLabel(panel, 'GachaResultSceneTitle', drawResult ? '召唤结果' : (mode === 'once' ? '召唤结果预览' : '十连结果预览'), 0, panelHeight / 2 - panelHeight * 0.088, Math.max(20 * scale, panelHeight * 0.042), rgba(252, 222, 153), new Size(panelWidth * 0.24, panelHeight * 0.07));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);

    // drawNo 行:两侧金色装饰线,菱形端点朝向文字(参考图)。
    const subtitleText = drawResult ? `真实 drawNo：${drawResult.drawNo}` : '本结果为本地 mock：未扣资源、未写入记录、未更新保底。';
    const subtitleY = -panelHeight / 2 + panelHeight * 0.17;
    const subtitleWidth = panelWidth * 0.32;
    const subtitle = this.host.addChildLabel(panel, 'GachaResultSceneNoWriteNote', subtitleText, 0, subtitleY, 16 * scale, rgba(196, 172, 122), new Size(subtitleWidth, 26 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;
    const dividerWidth = panelWidth * 0.2;
    const dividerHeight = dividerWidth * (66 / 389);
    this.host.addSprite('GachaResultSceneDividerL', GACHA_RESULT_DIVIDER_LEFT_ASSET, -subtitleWidth / 2 - dividerWidth / 2 - 6 * scale, subtitleY, dividerWidth, dividerHeight, panel);
    this.host.addSprite('GachaResultSceneDividerR', GACHA_RESULT_DIVIDER_RIGHT_ASSET, subtitleWidth / 2 + dividerWidth / 2 + 6 * scale, subtitleY, dividerWidth, dividerHeight, panel);

    this.renderMockResultCards(panel, results, mode, panelWidth, panelHeight, scale);
    this.renderMockResultActionButtons(panel, panelWidth, panelHeight, scale);
  }

  private toResultPreviewItems(items: GachaDrawItemVO[]): GachaMockResultItem[] {
    return items.map((item) => {
      const rarity = this.normalizeRarity(item.rarity);
      const frameColor = gachaResultFrameColor(item.rewardType, item.rewardCode, item.rarity);
      return {
        name: item.rewardName || item.rewardCode,
        title: item.duplicate ? `重复转化 ${item.fragmentCount ?? 0} 碎片` : '',
        rarity,
        stars: GACHA_FRAME_STAR_COUNTS[frameColor],
        scale: rarity === 'UR' || rarity === 'SSR' ? 1 : rarity === 'SR' ? 0.86 : 0.72,
        kind: item.rewardType === 'HERO_FRAGMENT' ? 'shard' : item.rewardType === 'HERO' ? 'hero' : 'material',
        equipCode: item.rewardType === 'EQUIP' ? item.rewardCode : null,
        frameColor,
        iconAsset: item.rewardType === 'HERO' || item.rewardType === 'EQUIP' ? null : resolveBagStyleItemIconAsset(item.rewardCode, item.rewardType, item.rarity),
        heroArt: item.rewardType === 'HERO' ? heroCardArtProfileByCode(item.rewardCode) : null,
        rewardCode: item.rewardCode,
        duplicate: item.duplicate,
        obtainCount: Math.max(1, Math.trunc(Number(item.amount ?? 1) || 1)),
        featured: item.up,
      };
    });
  }

  private normalizeRarity(rarity: string): GachaRarity {
    const value = rarity.toUpperCase();
    if (value === 'UR' || value === 'SSR' || value === 'SR') {
      return value;
    }
    return 'R';
  }

  private renderMockResultCards(parent: Node, results: GachaMockResultItem[], mode: GachaPreviewResultMode, panelWidth: number, panelHeight: number, scale: number): void {
    const top = panelHeight / 2 - panelHeight * 0.16;
    const bottom = -panelHeight / 2 + panelHeight * 0.215;
    const availableHeight = Math.max(120 * scale, top - bottom);
    if (mode === 'once') {
      const cardHeight = Math.min(availableHeight, 300 * scale);
      const cardWidth = cardHeight / 1.42;
      this.renderMockResultCard(parent, results[0], 0, (top + bottom) / 2, cardWidth, cardHeight, scale, true);
      return;
    }

    const columns = 5;
    const rows = Math.ceil(results.length / columns);
    const gapX = 20 * scale;
    const gapY = 22 * scale;
    const availableWidth = Math.max(220 * scale, panelWidth * 0.92);
    let cardWidth = Math.min(190 * scale, (availableWidth - gapX * (columns - 1)) / columns);
    let cardHeight = cardWidth * 1.42;
    const maxCardHeight = (availableHeight - gapY * (rows - 1)) / rows;
    if (cardHeight > maxCardHeight) {
      cardHeight = maxCardHeight;
      cardWidth = cardHeight / 1.42;
    }
    const gridWidth = columns * cardWidth + (columns - 1) * gapX;
    const gridHeight = rows * cardHeight + (rows - 1) * gapY;
    const startX = -gridWidth / 2 + cardWidth / 2;
    const startY = (top + bottom) / 2 + gridHeight / 2 - cardHeight / 2;
    results.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + column * (cardWidth + gapX);
      const y = startY - row * (cardHeight + gapY);
      this.renderMockResultCard(parent, item, x, y, cardWidth, cardHeight, scale, item.featured);
    });
  }

  private renderMockResultCard(parent: Node, item: GachaMockResultItem, x: number, y: number, width: number, height: number, scale: number, featured: boolean): void {
    const node = this.host.addChildPlainNode(parent, `GachaMockResultCard_${item.rarity}_${safeText(item.name)}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.showResultItemDetail(parent, item, scale, true), this);
    node.on(Node.EventType.MOUSE_ENTER, () => this.showResultItemDetail(parent, item, scale, false), this);
    node.on(Node.EventType.MOUSE_LEAVE, () => this.hideResultTooltip(false), this);
    this.host.applyImageButtonFeedback(node, 1.02, 0.985);
    const frameColor = item.frameColor ?? gachaFrameColorByRarity(item.rarity);
    const frameTone = gachaFrameTextColor(frameColor);
    const graphics = node.addComponent(Graphics);
    // 五色框素材中空透明:自绘深色卡底;UP/featured 保留暖色微光带。
    graphics.fillColor = rgba(12, 10, 13, 236);
    graphics.rect(-width * 0.47, -height * 0.48, width * 0.94, height * 0.96);
    graphics.fill();
    if (featured) {
      graphics.fillColor = rgba(255, 213, 111, 26);
      graphics.rect(-width * 0.47, height * 0.04, width * 0.94, height * 0.42);
      graphics.fill();
    }
    const frameArt = this.host.addSprite('GachaResultCardFrame', GACHA_RESULT_FRAME_ASSETS[frameColor], 0, 0, width, height, node);
    if (!frameArt) {
      graphics.strokeColor = frameTone;
      graphics.lineWidth = Math.max(1.4, 1.6 * scale);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.stroke();
    }
    // 中央展示:装备真图 > 英雄立绘 > 材料/碎片背包图标 > 奖励槽底+剪影。
    const slotSize = Math.min(width * 0.66, height * 0.4);
    const centerY = height * 0.06;
    const equipAsset = item.equipCode ? equipIconAssetByCode(item.equipCode) : null;
    if (equipAsset) {
      const equipW = Math.min(width * 0.78, slotSize * 1.16);
      this.host.addSprite('GachaResultEquipIcon', equipAsset, 0, centerY, equipW, equipW, node);
    } else if (item.heroArt) {
      // 英雄立绘:矩形遮罩内显示。npc 紧裁图等比 contain 贴底;Illust 方图按可见高放大 + 焦点偏移(与花名册同参数)。
      const art = item.heroArt;
      const maskTop = height / 2 - 52 * scale;
      const maskBottom = -height / 2 + 66 * scale;
      const maskW = width * 0.84;
      const maskH = Math.max(40 * scale, maskTop - maskBottom);
      const maskNode = this.host.addChildPlainNode(node, 'GachaResultHeroArtMask', 0, (maskTop + maskBottom) / 2, maskW, maskH);
      maskNode.addComponent(Mask);
      let displayH: number;
      let displayW: number;
      if (art.tight) {
        displayH = maskH;
        displayW = displayH * art.aspect;
        if (displayW > maskW) {
          displayW = maskW;
          displayH = displayW / art.aspect;
        }
      } else {
        displayH = Math.min(maskH / Math.max(0.3, art.visibleRatio), maskH * 2.4);
        displayW = Math.max(maskW, displayH * art.aspect);
      }
      const artNode = this.host.addSprite('GachaResultHeroArt', art.asset, -displayW * art.focusXRatio, -maskH / 2 + displayH / 2, displayW, displayH, maskNode);
      if (!artNode) {
        this.drawPortraitSilhouette(graphics, width, height, scale, item.rarity);
      }
    } else if (item.iconAsset) {
      this.host.addSprite('GachaResultItemIcon', item.iconAsset, 0, centerY, slotSize, slotSize, node);
    } else {
      const slot = this.host.addSprite('GachaC1812ResultRewardSlot', GACHA_C1812_SUMMON_REWARD_SLOT_ASSET, 0, centerY, slotSize, slotSize, node);
      if (slot) {
        const slotOpacity = slot.node.addComponent(UIOpacity);
        slotOpacity.opacity = featured ? 116 : 88;
      }
      this.drawPortraitSilhouette(graphics, width, height, scale, item.rarity);
    }

    const rarity = this.host.addChildLabel(node, 'GachaMockResultRarity', item.rarity, -width / 2 + 15 * scale, height / 2 - 26 * scale, featured ? 24 * scale : 20 * scale, frameTone, new Size(width - 30 * scale, 30 * scale), HorizontalTextAlignment.LEFT);
    rarity.overflow = Label.Overflow.SHRINK;
    this.applyOutline(rarity, scale, true);
    const kind = item.equipCode ? '装备' : item.kind === 'hero' ? '英雄' : item.kind === 'shard' ? '碎片' : '材料';
    const kindLabel = this.host.addChildLabel(node, 'GachaMockResultKind', kind, width / 2 - 38 * scale, height / 2 - 26 * scale, 15 * scale, rgba(236, 214, 156), new Size(52 * scale, 22 * scale), HorizontalTextAlignment.RIGHT);
    kindLabel.overflow = Label.Overflow.SHRINK;

    const hasSubtitle = (item.title || '').length > 0;
    const obtainCount = Math.max(1, Math.trunc(item.obtainCount ?? 1));
    const displayName = obtainCount > 1 ? `${item.name} ×${obtainCount}` : item.name;
    const name = this.host.addChildLabel(node, 'GachaMockResultName', displayName, 0, -height / 2 + (hasSubtitle ? 58 : 46) * scale, featured ? 22 * scale : 18 * scale, rgba(249, 224, 166), new Size(width - 26 * scale, 28 * scale));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    if (hasSubtitle) {
      const title = this.host.addChildLabel(node, 'GachaMockResultSubtitle', item.title, 0, -height / 2 + 36 * scale, 15 * scale, rgba(201, 169, 111), new Size(width - 26 * scale, 20 * scale));
      title.overflow = Label.Overflow.SHRINK;
    }
    // 星级:与框同色的星星切图(参考图),数量多时自动收缩尺寸;抬离框底装饰。
    const starCount = Math.max(1, Math.min(8, Math.trunc(item.stars || 1)));
    const starAsset = GACHA_RESULT_STAR_ASSETS[frameColor];
    const starGap = 2.5 * scale;
    const starSize = Math.min(17 * scale, (width - 30 * scale - starGap * (starCount - 1)) / starCount);
    const starsY = -height / 2 + 21 * scale;
    const starsStartX = -(starCount * starSize + (starCount - 1) * starGap) / 2 + starSize / 2;
    for (let i = 0; i < starCount; i += 1) {
      this.host.addSprite(`GachaResultStar_${i}`, starAsset, starsStartX + i * (starSize + starGap), starsY, starSize, starSize, node);
    }
  }

  private hideResultTooltip(force: boolean): void {
    if (!force && this.resultTooltipSticky) {
      return;
    }
    if (this.resultTooltipNode && this.resultTooltipNode.isValid) {
      this.resultTooltipNode.destroy();
    }
    this.resultTooltipNode = null;
    this.resultTooltipSticky = false;
  }

  // 结果卡详情(悬浮/点击共用):装备=英雄详情同款大卡(属性/词条/宝石,不显示已拥有);
  // 英雄=属性+技能卡(与详情页属性栏同口径);碎片/材料=通用信息卡(含已拥有)。
  private showResultItemDetail(parent: Node, item: GachaMockResultItem, scale: number, sticky: boolean): void {
    if (this.resultTooltipSticky && !sticky) {
      return;
    }
    this.hideResultTooltip(true);
    let holder: Node = parent;
    if (sticky) {
      const overlay = this.host.addChildPlainNode(parent, 'GachaResultInfoOverlay', 0, 0, 4000, 4000);
      overlay.addComponent(BlockInputEvents);
      const og = overlay.addComponent(Graphics);
      og.fillColor = rgba(0, 0, 0, 152);
      og.rect(-2000, -2000, 4000, 4000);
      og.fill();
      overlay.addComponent(Button);
      overlay.on(Button.EventType.CLICK, () => this.hideResultTooltip(true), this);
      holder = overlay;
    }
    let content: Node | null = null;
    if (item.equipCode) {
      const equip = this.resolveResultEquipInstance(item);
      if (equip) {
        content = renderEquipDetailCard(this.host, holder, equip, 0, 0, scale * 0.88, !sticky);
      }
    } else if (item.kind === 'hero') {
      content = this.buildHeroResultCard(holder, item, scale);
    }
    if (!content) {
      content = this.buildGenericResultInfo(holder, item, scale);
    }
    this.resultTooltipNode = sticky ? holder : content;
    this.resultTooltipSticky = sticky;
  }

  // 结果卡 → 装备实例:后端抽卡结果只给编码,背包里可能已有同编码旧装备(已穿戴/已强化/镶了宝石)。
  // 优先取"抽卡前快照里没有的新实例";同批多件同编码按结果卡顺序依次分配;无快照时退化为
  // 未穿戴/未强化/未镶嵌且 id 最新的那件,避免把旧装备的穿戴与宝石信息当成新装备展示。
  private resolveResultEquipInstance(item: GachaMockResultItem): EquipmentItemVO | null {
    const code = (item.equipCode || '').toUpperCase();
    const sameCode = this.host.currentLobbyEquipmentItems()
      .filter((entry) => (entry.equipCode || '').toUpperCase() === code)
      .sort((a, b) => b.id - a.id);
    if (sameCode.length === 0) {
      return null;
    }
    const before = this.host.currentGachaEquipIdsBeforeDraw?.() ?? null;
    const fresh = before ? sameCode.filter((entry) => !before.has(entry.id)) : [];
    if (fresh.length > 0) {
      // 同批同编码多件:第 n 张结果卡对应第 n 件新实例(按 id 升序即获得顺序)
      const ordinal = this.resultEquipOrdinal(item);
      const ascending = [...fresh].sort((a, b) => a.id - b.id);
      return ascending[Math.min(ordinal, ascending.length - 1)] ?? ascending[0];
    }
    const pristine = sameCode.find((entry) => entry.heroId == null && (entry.enhanceLevel ?? 0) === 0 && !(entry.gems ?? []).some((gem) => !!gem));
    return pristine ?? sameCode[0];
  }

  /** 该结果卡在当前结果列表中、同编码装备里的序号(第几件),用于同批多件同编码时逐件对应实例。 */
  private resultEquipOrdinal(item: GachaMockResultItem): number {
    const results = this.currentResultItems ?? [];
    let ordinal = 0;
    for (const entry of results) {
      if (entry === item) {
        return ordinal;
      }
      if (entry.equipCode && (entry.equipCode || '').toUpperCase() === (item.equipCode || '').toUpperCase()) {
        ordinal += 1;
      }
    }
    return 0;
  }

  // 英雄详情卡(结果页):名称/等级星级战力行 + 属性双列(与英雄详情属性栏同数据源)+ 技能列表。
  private buildHeroResultCard(parent: Node, item: GachaMockResultItem, scale: number): Node | null {
    const rewardCode = (item.rewardCode || '').toUpperCase();
    const hero = this.host.currentLobbyHeroRosterState().heroes.find((entry) => (entry.heroCode || '').toUpperCase() === rewardCode) ?? null;
    if (!hero) {
      return null;
    }
    const frameColor = item.frameColor ?? gachaFrameColorByRarity(item.rarity);
    const tone = gachaFrameTextColor(frameColor);
    const attrs = resolveAttributes(hero);
    const skills = resolveSkills(hero).slice(0, 5);
    const attrRows = Math.ceil(attrs.length / 2);
    const w = 470 * scale;
    const h = (168 + attrRows * 30 + 44 + skills.length * 42 + 42) * scale;
    const card = this.host.addChildPlainNode(parent, 'GachaResultHeroCard', 0, 0, w, h);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(11, 9, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = tone;
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();
    const title = this.host.addChildLabel(card, 'Title', item.name, 0, h / 2 - 34 * scale, 23 * scale, tone, new Size(w - 44 * scale, 32 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const summary = this.host.addChildLabel(card, 'Summary', `英雄 · ${item.rarity} · Lv${Math.max(1, hero.level)} · ${Math.max(1, Math.trunc(hero.star || 1))}星 · 战力 ${compactValue(hero.power)}`, 0, h / 2 - 64 * scale, 17 * scale, rgba(206, 190, 156), new Size(w - 48 * scale, 22 * scale));
    summary.overflow = Label.Overflow.SHRINK;
    const dup = this.host.addChildLabel(card, 'DupLine', item.duplicate ? (item.title || '重复获得,已转化同名碎片') : '新英雄入队！', 0, h / 2 - 88 * scale, 16 * scale, item.duplicate ? rgba(196, 178, 140) : rgba(150, 232, 120), new Size(w - 48 * scale, 20 * scale));
    dup.overflow = Label.Overflow.SHRINK;
    // 属性双列
    let cursor = h / 2 - 122 * scale;
    attrs.forEach((attr, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const label = this.host.addChildLabel(card, `Attr_${index}`, `${attr.label}  ${attr.value}`, -w / 2 + 36 * scale + col * (w / 2 - 18 * scale), cursor - row * 30 * scale, 18 * scale, rgba(236, 230, 218), new Size(w / 2 - 52 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });
    cursor -= attrRows * 30 * scale + 12 * scale;
    const skillTitle = this.host.addChildLabel(card, 'SkillTitle', '技能', -w / 2 + 36 * scale, cursor, 17 * scale, rgba(238, 210, 148), new Size(120 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    skillTitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(skillTitle, scale, true);
    cursor -= 30 * scale;
    skills.forEach((skill, index) => {
      const isUltimate = skill.kind === 'ultimate';
      const nameLabel = this.host.addChildLabel(card, `SkillName_${index}`, skill.name, -w / 2 + 36 * scale, cursor, 17 * scale, isUltimate ? rgba(252, 196, 96) : skill.locked ? rgba(158, 148, 128) : rgba(230, 218, 192), new Size(w * 0.62, 20 * scale), HorizontalTextAlignment.LEFT);
      nameLabel.overflow = Label.Overflow.SHRINK;
      const tagLabel = this.host.addChildLabel(card, `SkillTag_${index}`, skill.tag, w / 2 - 34 * scale, cursor, 14 * scale, rgba(170, 156, 130), new Size(w * 0.32, 18 * scale), HorizontalTextAlignment.RIGHT);
      tagLabel.overflow = Label.Overflow.SHRINK;
      const descLabel = this.host.addChildLabel(card, `SkillDesc_${index}`, skill.description, -w / 2 + 36 * scale, cursor - 18 * scale, 14 * scale, rgba(168, 156, 134), new Size(w - 70 * scale, 16 * scale), HorizontalTextAlignment.LEFT);
      descLabel.overflow = Label.Overflow.SHRINK;
      cursor -= 42 * scale;
    });
    return card;
  }

  // 通用信息卡(材料/碎片/兜底):名称/类别/本次获得/已拥有/用途说明。
  private buildGenericResultInfo(parent: Node, item: GachaMockResultItem, scale: number): Node {
    const frameColor = item.frameColor ?? gachaFrameColorByRarity(item.rarity);
    const tone = gachaFrameTextColor(frameColor);
    const w = 440 * scale;
    const h = 300 * scale;
    const dialog = this.host.addChildPlainNode(parent, 'GachaResultInfoDialog', 0, 0, w, h);
    const g = dialog.addComponent(Graphics);
    g.fillColor = rgba(11, 9, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = tone;
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();
    const info = this.resolveResultItemInfo(item);
    const title = this.host.addChildLabel(dialog, 'Title', item.name, 0, h / 2 - 34 * scale, 22 * scale, tone, new Size(w - 44 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const category = this.host.addChildLabel(dialog, 'Category', info.category, 0, h / 2 - 64 * scale, 17 * scale, rgba(196, 178, 140), new Size(w - 48 * scale, 22 * scale));
    category.overflow = Label.Overflow.SHRINK;
    const rows: { text: string; color: Color }[] = [
      { text: info.obtainLine, color: rgba(236, 222, 190) },
      { text: info.ownedLine, color: rgba(250, 214, 128) },
    ].filter((row) => row.text.length > 0);
    rows.forEach((row, index) => {
      const label = this.host.addChildLabel(dialog, `InfoRow_${index}`, row.text, -w / 2 + 30 * scale, h / 2 - 104 * scale - index * 30 * scale, 18 * scale, row.color, new Size(w - 60 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });
    const note = this.host.addChildLabel(dialog, 'Note', info.note, -w / 2 + 30 * scale, h / 2 - 176 * scale, 16 * scale, rgba(178, 162, 132), new Size(w - 60 * scale, 42 * scale), HorizontalTextAlignment.LEFT);
    note.lineHeight = 19 * scale;
    note.overflow = Label.Overflow.SHRINK;
    return dialog;
  }

  // 详情信息组织:装备/英雄/碎片/材料各自口径,统一带"已拥有"。
  private resolveResultItemInfo(item: GachaMockResultItem): { category: string; obtainLine: string; ownedLine: string; note: string } {
    const bag = this.host.currentLobbyBagState();
    const bagCount = (code: string): number =>
      bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === code.toUpperCase())?.itemCount ?? 0;
    const obtain = Math.max(1, Math.trunc(item.obtainCount ?? 1));
    const rewardCode = (item.rewardCode || '').toUpperCase();
    if (item.equipCode) {
      const slotLabels: Record<string, string> = { weapon: '武器', helmet: '头盔', chest: '胸甲', boots: '战靴', ring: '戒指', neck: '项链', necklace: '项链' };
      const slotLabel = slotLabels[equipSlotKeyByCode(item.equipCode) ?? ''] ?? '装备';
      return {
        category: `装备 · ${slotLabel} · 抽取档位 ${item.rarity}`,
        obtainLine: `本次获得：${item.name} ×${obtain}`,
        ownedLine: '',
        note: '可在英雄详情穿戴；锻造工坊可强化、合成升阶或分解回强化石。（属性同步中,稍后可再次查看完整属性卡）',
      };
    }
    if (item.kind === 'hero') {
      const fragOwned = bagCount(`HERO_FRAGMENT:${rewardCode}`);
      return {
        category: `英雄 · ${item.rarity}`,
        obtainLine: item.duplicate ? `本次获得：${item.title || '重复转化同名碎片'}` : '本次获得：新英雄入队 ×1',
        ownedLine: item.duplicate ? `已拥有：该英雄已在麾下 · 同名碎片 ×${fragOwned}` : `已拥有：首次获得 · 同名碎片 ×${fragOwned}`,
        note: '同名碎片用于英雄升星（英雄详情 → 升星页），10 星可觉醒。',
      };
    }
    if (item.kind === 'shard') {
      return {
        category: `英雄碎片 · ${item.rarity}`,
        obtainLine: `本次获得：${item.name} ×${obtain}`,
        ownedLine: `已拥有：×${bagCount(`HERO_FRAGMENT:${rewardCode}`)}（含本次）`,
        note: '同名碎片用于英雄升星（英雄详情 → 升星页）。',
      };
    }
    const notes: Record<string, string> = {
      ENHANCE_STONE: '锻造强化装备的基础材料（+1 至 +10）。',
      ENHANCE_STONE_HIGH: '+10 以上强化所需的高阶强化材料。',
      HERO_EXP_BOOK: '英雄升级经验书，在英雄详情升级页消耗。',
      DEEP_REFORGE_STONE: '英雄词条洗练（重铸）消耗的深渊重铸石。',
      EQUIP_REROLL_STONE: '装备词条洗练材料（后续版本开放）。',
      FUSION_LUCK_STONE: '装备合成成功率 +20%（锻造工坊合成页勾选）。',
      ENHANCE_BLESS_STONE: '强化成功率 +20%（锻造工坊强化页勾选）。',
      ENHANCE_GUARD_RUNE: '强化失败不掉级的守护符（锻造工坊强化页勾选）。',
    };
    return {
      category: `材料 · ${item.rarity}`,
      obtainLine: `本次获得：${item.name} ×${obtain}`,
      ownedLine: `已拥有：×${bagCount(rewardCode)}（含本次）`,
      note: notes[rewardCode] ?? '召唤获得的养成素材，可在背包查看。',
    };
  }

  // 底部双按钮(参考图):返回召唤(暗色 button_return_dis) + 召唤十次(红金 button_primary,关结果后立即再抽十连)。
  private renderMockResultActionButtons(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const width = Math.min(panelWidth * 0.21, 300 * scale);
    const y = -panelHeight / 2 + panelHeight * 0.098;
    const makeButton = (name: string, x: number, height: number, asset: string, text: string, onClick: () => void): void => {
      const button = this.host.addChildPlainNode(parent, name, x, y, width, height);
      button.addComponent(Button);
      button.on(Button.EventType.CLICK, onClick, this);
      this.host.applyImageButtonFeedback(button, 1.035, 0.965);
      const art = this.host.addSprite(`${name}Art`, asset, 0, 0, width, height, button);
      if (!art) {
        const graphics = button.addComponent(Graphics);
        graphics.fillColor = rgba(24, 20, 19, 232);
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        graphics.strokeColor = rgba(205, 154, 72, 214);
        graphics.stroke();
      }
      const label = this.host.addChildLabel(button, `${name}Label`, text, 0, 1 * scale, 20 * scale, rgba(255, 240, 200), new Size(width - 46 * scale, height * 0.7));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, true);
    };
    makeButton('GachaResultSceneReturnButton', -width / 2 - 26 * scale, width * (165 / 695), C1812_BUTTON_RETURN_ASSET, '返回召唤', () => {
      this.host.closeGachaMockResultScene();
      this.host.setStatus('已返回召唤页；兑换和补发入口仍未开放。');
    });
    makeButton('GachaResultSceneTenButton', width / 2 + 26 * scale, width * (211 / 740), C1812_BUTTON_PRIMARY_ASSET, '召唤十次', () => {
      this.host.closeGachaMockResultScene();
      this.host.startGachaDraw('ten');
    });
  }

  private renderCompactContent(parent: Node, layout: UiLayout, scale: number, state: GachaSceneState): void {
    const tabsY = layout.stageTop - 92 * scale;
    const tabWidth = Math.max(92 * scale, Math.min(150 * scale, layout.stageWidth / 4.8));
    const tabGap = 7 * scale;
    const visiblePools = this.resolvePools(state).slice(0, 4);
    const startX = -((visiblePools.length - 1) * (tabWidth + tabGap)) / 2;
    visiblePools.forEach((pool, index) => {
      const active = this.isSelectedPool(pool, state.selectedPoolCode);
      this.renderCompactPoolTab(parent, { ...pool, active }, startX + index * (tabWidth + tabGap), tabsY, tabWidth, 42 * scale, scale);
    });
    const selectedPool = this.resolveSelectedPool(state);
    this.renderCenterStage(parent, layout, scale * 0.9, selectedPool, state);
    this.renderCompactActionBar(parent, layout, scale, selectedPool);
    this.renderBottomSummonBar(parent, layout, scale, selectedPool, state);
  }

  private renderCompactActionBar(parent: Node, layout: UiLayout, scale: number, selectedPool: GachaPreviewPool): void {
    const actions = this.resolveRightActions(selectedPool);
    const width = Math.min(layout.safeWidth - 34 * scale, 520 * scale);
    const gap = 6 * scale;
    const buttonWidth = (width - gap * (actions.length - 1)) / actions.length;
    const y = layout.stageBottom + 134 * scale;
    const startX = -width / 2 + buttonWidth / 2;
    actions.forEach((action, index) => {
      const node = this.host.addChildPlainNode(parent, `GachaCompactAction_${action.key}`, startX + index * (buttonWidth + gap), y, buttonWidth, 34 * scale);
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => {
        this.host.setStatus(action.note);
        this.host.openGachaActionScene(action.key);
      }, this);
      this.host.applyImageButtonFeedback(node, 1.025, 0.97);
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = rgba(7, 7, 10, 184);
      graphics.rect(-buttonWidth / 2, -17 * scale, buttonWidth, 34 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(177, 127, 60, 160);
      graphics.stroke();
      const label = this.host.addChildLabel(node, 'GachaCompactActionLabel', action.label, 0, 0, 15 * scale, rgba(225, 190, 112), new Size(buttonWidth - 8 * scale, 30 * scale));
      label.overflow = Label.Overflow.SHRINK;
    });
  }

  private renderCompactPoolTab(parent: Node, pool: GachaPreviewPool, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, `GachaCompactPool_${pool.id}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.selectGachaPool(pool.poolCode ?? pool.id), this);
    this.host.applyImageButtonFeedback(node, 1.025, 0.975);
    const tone = gachaRarityTone(pool.rarity);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = pool.active ? rgba(62, 9, 12, 218) : rgba(5, 5, 8, 178);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = pool.active ? tone.stroke : rgba(145, 107, 56, 130);
    graphics.stroke();
    const label = this.host.addChildLabel(node, 'GachaCompactPoolLabel', pool.title, 0, 0, 18 * scale, rgba(240, 207, 134), new Size(width - 12 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderPanelTitleBanner(
    parent: Node,
    namePrefix: string,
    text: string,
    y: number,
    panelWidth: number,
    scale: number,
  ): { bannerWidth: number; bannerHeight: number } {
    // 标题横幅按素材原比例(800×238)整图显示,与战斗结算标题同款,不再压扁成条。
    const horizontalPadding = 44 * scale;
    const estimatedTextWidth = Math.max(200 * scale, text.length * 24 * scale);
    const bannerWidth = Math.min(panelWidth - 120 * scale, Math.max(300 * scale, estimatedTextWidth + horizontalPadding));
    const bannerHeight = bannerWidth * (268 / 800);
    this.host.addSprite(`${namePrefix}TitleBanner`, C1812_TITLE_BANNER_ASSET, 0, y, bannerWidth, bannerHeight, parent);
    const title = this.host.addChildLabel(
      parent,
      `${namePrefix}Title`,
      text,
      0,
      y,
      24 * scale,
      rgba(252, 225, 158),
      new Size(bannerWidth - horizontalPadding, bannerHeight - 10 * scale),
    );
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    return { bannerWidth, bannerHeight };
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 230 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}

function compactValue(value: unknown): string {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return '0';
  }
  if (numberValue >= 1_000_000_000) {
    return `${Math.floor(numberValue / 100_000_000) / 10}B`;
  }
  if (numberValue >= 1_000_000) {
    return `${Math.floor(numberValue / 100_000) / 10}M`;
  }
  if (numberValue >= 100_000) {
    return `${Math.floor(numberValue / 100) / 10}K`;
  }
  return Math.floor(numberValue).toLocaleString('en-US');
}

function formatPercentValue(value: unknown): string {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) {
    return '0';
  }
  return (numberValue * 100).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function rewardTypeLabel(rewardType: string): string {
  const type = (rewardType || '').toUpperCase();
  if (type === 'HERO') {
    return '英雄';
  }
  if (type === 'HERO_FRAGMENT') {
    return '英雄碎片';
  }
  if (type === 'EQUIP') {
    return '装备';
  }
  if (type === 'ITEM') {
    return '道具';
  }
  if (type === 'CURRENCY') {
    return '货币';
  }
  return safeText(rewardType || '奖励');
}

function formatDateTime(value: string | null | undefined): string {
  const text = safeText(value || '');
  if (!text) {
    return '-';
  }
  return text.replace('T', ' ').slice(0, 19);
}
