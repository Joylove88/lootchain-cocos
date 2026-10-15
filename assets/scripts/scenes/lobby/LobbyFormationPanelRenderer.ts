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
  ScrollView,
  Size,
  Sprite,
  sp,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import { C1812_BUTTON_DISABLED_ASSET, C1812_BUTTON_PRIMARY_ASSET, C1812_DIVIDER_GOLD_ASSET, C1812_TITLE_BANNER_ASSET } from '../C1812CommonUiAssets';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';
import {
  isBattleUnitSpineDataAsset,
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineAnimationNames,
  resolveBattleUnitSpineNodePosition,
  resolveBattleUnitSpinePrimaryAsset,
  resolveBattleUnitSpineResource,
  resolveBattleUnitSpineRuntimeData,
  resolveBattleUnitSpineScale,
  resolveBattleUnitSpineSkinName,
  resolveBattleUnitSpineLoadUuid,
  resolveBattleUnitSpineTelemetryVisualHeight,
} from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';
import { mountLobbySpineFx, prewarmLobbySpineFx, type LobbyUiSpineFxHost } from './LobbyUiSpineFx';
import { mountHeroAvatar } from './HeroHeadCrop';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';

const FORMATION_SPINE_RUNTIME_RETRY_DELAYS_MS = [180, 420, 900];
const FORMATION_BATTLE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame';
const FORMATION_BATTLE_GROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame';
// 布阵改版素材(image2,2026-09-05):阵位魔法阵基座/候选行头像金环;缺图走程序绘制兜底。
const FORMATION_SLOT_BASE_ASSET = 'ui/formation/fpanel_slot_base/spriteFrame';
const FORMATION_HERO_RING_ASSET = 'ui/formation/fpanel_hero_ring/spriteFrame';
// 名牌复用英雄详情现成素材(黑金铭牌)。
const FORMATION_NAMEPLATE_ASSET = 'ui/hero/ai/hero_nameplate/spriteFrame';
// 2026-09-08 参考图还原(用户提供切图):顶部战力金匾/右栏竖版金框面板/页签选中金匾+未选黑胶囊/行选中金勾。
// 全部等比或纯色可拉伸素材;缺图各自走手绘兜底。
const FORMATION_POWER_BAR_ASSET = 'ui/formation/power_bar/spriteFrame';
const FORMATION_POWER_BAR_ASPECT = 202 / 1073;
const FORMATION_ROSTER_PANEL_ASSET = 'ui/formation/roster_panel/spriteFrame';
const FORMATION_ROSTER_PANEL_PX_H = 1536;
/** 右栏面板素材九宫格内边(素材像素,四角饰纹约 120px)。 */
const FORMATION_ROSTER_PANEL_INSET = 130;
const FORMATION_TAB_ACTIVE_ASSET = 'ui/formation/name_plate/spriteFrame';
const FORMATION_TAB_ACTIVE_ASPECT = 88 / 166;
const FORMATION_TAB_IDLE_ASSET = 'ui/formation/plate_dark/spriteFrame';
const FORMATION_CHECK_GOLD_ASSET = 'ui/formation/check_gold/spriteFrame';
const DECO_DIVIDER_LEFT_ASSET = 'ui/common/ai/deco_divider_left/spriteFrame';
const DECO_DIVIDER_RIGHT_ASSET = 'ui/common/ai/deco_divider_right/spriteFrame';
const DECO_DIVIDER_LEFT_ASPECT = 76 / 463;
const DECO_DIVIDER_RIGHT_ASPECT = 77 / 471;
// 2026-10-15 布阵改版(用户:布阵列表换头像,整个界面重新设计,GPT 出原型图 + 拆素材;背景换掉;脚底光环从特效里找;
// 守卫战不分前后排 → 4 个站位一排弧线):
// - 背景:GPT 生成的布阵专用场景(无 UI),缺图回退大教堂战斗背景
// - 右栏:3 列英雄头像卡网格,卡框按稀有度 4 色(GPT 拆素材,九宫格在 256px 帧空间拉伸再整体缩放,角饰不变形)
// - 脚底光环:A47-345 金色透视地面法阵(循环);空位 A47-464 淡金同心环(半透明)
const FORMATION_BG_ASSET = 'ui/formation/ai/formation_bg/spriteFrame';
const FORMATION_CARD_FRAME_ASSETS: Record<string, string> = {
  UR: 'ui/formation/ai/card_frame_ur/spriteFrame',
  SSR: 'ui/formation/ai/card_frame_ssr/spriteFrame',
  SR: 'ui/formation/ai/card_frame_sr/spriteFrame',
  R: 'ui/formation/ai/card_frame_r/spriteFrame',
};
/** 卡框素材边长与九宫格内边(素材像素)。 */
const FORMATION_CARD_FRAME_PX = 256;
const FORMATION_CARD_FRAME_INSET = 34;
const FORMATION_HALO_FX = { effect: 'v2_a47_345', animation: 'action' };
// 第二轮(2026-10-15 用户「整体还是比较丑,右侧栏也需要美化」):右栏专用素材(GPT 按原型拆)——面板框 / 页签两态 / 已上阵缎带 / 战力剑图标
const FORMATION_PANEL_FRAME_ASSET = 'ui/formation/ai/panel_frame/spriteFrame';
/** 面板框素材像素尺寸与九宫格内边(顶部含宝石冠饰,内边更大)。 */
const FORMATION_PANEL_FRAME_PX_W = 512;
const FORMATION_PANEL_FRAME_PX_H = 768;
const FORMATION_PANEL_FRAME_INSET_TOP = 72;
const FORMATION_PANEL_FRAME_INSET_SIDE = 50;
const FORMATION_PANEL_FRAME_INSET_BOTTOM = 60;
const FORMATION_TAB_ON_ASSET = 'ui/formation/ai/tab_on/spriteFrame';
const FORMATION_TAB_OFF_ASSET = 'ui/formation/ai/tab_off/spriteFrame';
const FORMATION_RIBBON_ASSET = 'ui/formation/ai/deployed_ribbon/spriteFrame';
const FORMATION_POWER_ICON_ASSET = 'ui/formation/ai/icon_power/spriteFrame';
// 第三轮(2026-10-15 用户「右侧栏太丑,直接上下拉长」+ GPT 设计稿 proto_2):右栏改成贴右边缘、从屏幕顶拉到底的侧边栏
const FORMATION_SIDEBAR_BG_ASSET = 'ui/formation/ai/sidebar_bg/spriteFrame';
const FORMATION_SIDEBAR_TRIM_BAR_ASSET = 'ui/formation/ai/sidebar_trim_bar/spriteFrame';
const FORMATION_SIDEBAR_TRIM_CAP_ASSET = 'ui/formation/ai/sidebar_trim_cap/spriteFrame';
const FORMATION_SIDEBAR_TRIM_GEM_ASSET = 'ui/formation/ai/sidebar_trim_gem/spriteFrame';
const FORMATION_EMPTY_HALO_FX = { effect: 'v2_a47_464', animation: 'idle3' };

export interface LobbyFormationPanelHost {
  node: Node;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  currentLobbySelectedStageCode(): string;
  currentLobbyFormationHeroIds(): number[];
  currentLobbyFormationPowerSnapshot(stageCode?: string): LobbyFormationPowerSnapshot;
  toggleLobbyFormationHero(heroId: number): void;
  saveLobbyFormationNow?(): void;
  isLobbyFormationFooterHidden?(): boolean;
  openLobbyHeroRosterPanel(): void;
  openLobbyBattlePreviewPanel(stageCode: string): void;
  closeLobbyFormationPanel(): void;
  reloadLobbyHeroRoster(): void;
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
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
}

export interface LobbyFormationPowerSnapshot {
  currentPower: number;
  recommendedPower: number;
  powerGap: number;
  enough: boolean;
  rosterLoaded: boolean;
  selectedCount: number;
}

/** 编队确认面板；只确认本次 battle start 阵容，不保存长期队伍，也不触发经济写入。 */
export class LobbyFormationPanelRenderer {
  // 骨骼数据缓存已收敛到全局 SpineDataStore(2026-08-04),不再各页私有。
  // 右栏稀有度过滤(2026-08-05 参考图改版):跨重渲存活;页签点击只局部重建右栏。
  private pickerRarityFilter: 'ALL' | 'UR' | 'SSR' | 'SR' | 'R' = 'ALL';
  private rebuildHeroPicker: (() => void) | null = null;
  private lastFormationSpineFailureReason = '资源解析失败';
  /** 站位名牌宽度上限(随站位间距,避免相邻名牌互压)。 */
  private formationPlateMaxWidth = Number.POSITIVE_INFINITY;
  /** 右栏上下沿(面板坐标)与战场区中心 x(底部三按钮对齐用),renderBody 时算好。 */
  private pickerTop = 0;
  private pickerBottom = 0;
  private battlefieldCenterX = 0;
  /** 屏幕右缘(面板坐标);侧边栏贴到这里。 */
  private screenRight = 0;
  /** 侧边栏宽与左缘(面板坐标)。 */
  private sidebarWidth = 0;

  constructor(private readonly host: LobbyFormationPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyHeroRosterState();
    const selectedStageCode = this.host.currentLobbySelectedStageCode();
    const selectedHeroIds = this.host.currentLobbyFormationHeroIds();
    this.recordFormationDebugSnapshot(selectedStageCode, state, selectedHeroIds);
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(320 * scale, layout.stageWidth);
    const panelHeight = Math.max(270 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    // 侧边栏几何(第三轮):从屏幕顶到屏幕底、贴屏幕右缘,宽 = 屏宽 34%;战场区 = 舞台左缘到侧栏左缘
    this.screenRight = layout.width / 2 - centerX;
    this.pickerTop = layout.height / 2 - centerY;
    this.pickerBottom = -layout.height / 2 - centerY;
    this.sidebarWidth = Math.max(300 * scale, Math.min(layout.width * 0.34, 640 * scale));
    const fieldLeft = -panelWidth / 2 + 38 * scale;
    const fieldRight = this.screenRight - this.sidebarWidth - 12 * scale;
    this.battlefieldCenterX = (fieldLeft + fieldRight) / 2;

    const dim = this.createUiNode('LobbyFormationDim');
    // 背景层锚窗口中心(0,0)而非 stage 中心:stage 顶部让给 HUD 的带子也要被场景盖住。
    dim.setPosition(new Vec3(0, 0, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    // 2026-09-08 用户反馈:背景要铺满到窗口顶部——场景图挂在全窗口 dim 层(stage 区之外的
    // 顶部 HUD 带也要盖住),等比 cover 全窗口;缺图回退深色底。
    const bgAspect = 1920 / 1080;
    // 2026-10-15 用户「背景图向左移一下,中间的水晶被右侧栏压住」「右侧太暗」:背景重画成水晶在图宽 27.8% 处、
    // 左三分之二两侧都有光;放大 8% 后把水晶对到战场区正中(左缘不露底时就近),右三分之一在侧边栏后面
    const bgCover = layout.width / layout.height > bgAspect ? layout.width : layout.height * bgAspect;
    const bgWidth = bgCover * 1.08;
    const bgHeight = bgWidth / bgAspect;
    const crystalFromCenter = (0.278 - 0.5) * bgWidth;
    const wantX = centerX + this.battlefieldCenterX - crystalFromCenter;
    // 左缘不能露底:背景左边至少到屏幕左缘
    const bgX = Math.max(-layout.width / 2 + bgWidth / 2 - (bgWidth - layout.width), Math.min(wantX, -layout.width / 2 + bgWidth / 2));
    const dimGraphics = dim.addComponent(Graphics);
    prewarmLobbySpineFx([FORMATION_HALO_FX, FORMATION_EMPTY_HALO_FX]);
    if (!this.host.addSprite('LobbyFormationSceneBgSprite', FORMATION_BG_ASSET, bgX, 0, bgWidth, bgHeight, dim)
      && !this.host.addSprite('LobbyFormationSceneBgSprite', FORMATION_BATTLE_BG_ASSET, 0, 0, bgCover, bgCover / bgAspect, dim)) {
      dimGraphics.fillColor = rgba(10, 7, 8, 250);
      dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
      dimGraphics.fill();
    }
    // 顶/底压暗带(悬浮 UI 可读性)+ 中部极轻全局压暗,全窗口跨度。
    const veil = this.host.addChildPlainNode(dim, 'LobbyFormationSceneVeil', 0, 0, layout.width, layout.height);
    const veilGraphics = veil.addComponent(Graphics);
    // 第二轮:全局压暗加重,背景细节不再和人物 / 面板抢视线
    veilGraphics.fillColor = rgba(8, 6, 8, 96);
    veilGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    veilGraphics.fill();
    veilGraphics.fillColor = rgba(5, 4, 6, 168);
    veilGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, 96 * scale);
    veilGraphics.fill();
    veilGraphics.fillColor = rgba(5, 4, 6, 90);
    veilGraphics.rect(-layout.width / 2, -layout.height / 2 + 96 * scale, layout.width, 40 * scale);
    veilGraphics.fill();
    // (2026-09-08 用户反馈:顶部整行遮盖暗带移除——标题横幅/战力金匾自带暗底,直接压在场景上。)
    // 功能页采用场景式导航，遮罩只阻断底层输入，不再承担点击关闭语义。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyFormationSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    // 面板内容区阻挡输入，避免点英雄槽时穿透遮罩关闭弹窗。
    panelGroup.addComponent(BlockInputEvents);
    // UI 容器(背景已在 dim 层):标题条/战场站位/右栏/底按钮悬浮在场景上。
    const panel = this.host.addChildPlainNode(panelGroup, 'LobbyFormationSceneFrame', 0, 0, panelWidth, panelHeight);
    this.renderHeader(panel, panelWidth, panelHeight, scale, state, selectedStageCode, selectedHeroIds);
    this.renderBody(panel, panelWidth, panelHeight, scale, state, selectedHeroIds);
    this.renderFooter(panel, panelWidth, panelHeight, scale, selectedStageCode, state);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyFormationBackButton', () => this.host.closeLobbyFormationPanel(), scale, '编队');
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private recordFormationDebugSnapshot(stageCode: string, state: LobbyHeroRosterPanelState, selectedHeroIds: number[]): void {
    const selectedHeroes = this.resolveSelectedSlots(state.heroes, selectedHeroIds).filter((hero): hero is LobbyHeroItemVO => !!hero);
    const root = globalThis as unknown as {
      __lootchainFormationDebug?: {
        stageCode: string;
        selectedHeroIds: number[];
        selectedHeroNames: string[];
        selectedCount: number;
        loading: boolean;
        error: string | null;
        srRVisuals?: Array<{ heroCode: string; rarity: string; primaryAsset?: string; width: number; height: number; visualWidth: number; visualHeight: number; rawWidth?: number; rawHeight?: number; resolvedScale?: number; estimatedHeight?: number }>;
        at: number;
      };
    };
    const previous = root.__lootchainFormationDebug;
    const sameSelection = previous?.stageCode === stageCode
      && Array.isArray(previous.selectedHeroIds)
      && previous.selectedHeroIds.length === selectedHeroIds.length
      && previous.selectedHeroIds.every((heroId, index) => heroId === selectedHeroIds[index]);
    root.__lootchainFormationDebug = {
      stageCode,
      selectedHeroIds: [...selectedHeroIds],
      selectedHeroNames: selectedHeroes.map((hero) => safeText(hero.heroName)),
      selectedCount: selectedHeroes.length,
      loading: state.loading,
      error: state.error ? safeText(state.error) : null,
      srRVisuals: sameSelection ? [...(previous?.srRVisuals ?? [])] : [],
      at: Date.now(),
    };
  }

  private recordFormationActorVisualTelemetry(hero: LobbyHeroItemVO, width: number, height: number, visualWidth: number, visualHeight: number): void {
    const root = globalThis as unknown as {
      __lootchainFormationDebug?: {
        srRVisuals?: Array<{ heroCode: string; rarity: string; primaryAsset?: string; width: number; height: number; visualWidth: number; visualHeight: number; rawWidth?: number; rawHeight?: number; resolvedScale?: number; estimatedHeight?: number }>;
      };
    };
    const debug = root.__lootchainFormationDebug;
    if (!debug) {
      return;
    }
    const visuals = debug.srRVisuals ?? [];
    visuals.push({
      heroCode: safeText(hero.heroCode),
      rarity: safeText(hero.rarity),
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      visualWidth: Math.round(visualWidth * 100) / 100,
      visualHeight: Math.round(visualHeight * 100) / 100,
    });
    debug.srRVisuals = visuals.slice(-8);
  }

  private recordFormationActorResolvedVisualTelemetry(
    unit: BattlePresentationUnitSnapshot,
    rawWidth: number | undefined,
    rawHeight: number | undefined,
    resolvedScale: number,
  ): void {
    const root = globalThis as unknown as {
      __lootchainFormationDebug?: {
        srRVisuals?: Array<{ heroCode: string; rarity: string; primaryAsset?: string; width: number; height: number; visualWidth: number; visualHeight: number; rawWidth?: number; rawHeight?: number; resolvedScale?: number; estimatedHeight?: number }>;
      };
    };
    const debug = root.__lootchainFormationDebug;
    if (!debug?.srRVisuals) {
      return;
    }
    const heroCode = safeText(unit.heroCode || unit.unitKey);
    let existing = [...debug.srRVisuals].reverse().find((visual) => visual.heroCode === heroCode);
    if (!existing) {
      existing = {
        heroCode,
        rarity: safeText(unit.rarity),
        width: 0,
        height: 0,
        visualWidth: 0,
        visualHeight: 0,
      };
      debug.srRVisuals.push(existing);
    }
    existing.primaryAsset = safeText(resolveBattleUnitSpinePrimaryAsset(unit) ?? '');
    existing.rawWidth = Math.round((rawWidth || 0) * 100) / 100;
    existing.rawHeight = Math.round((rawHeight || 0) * 100) / 100;
    existing.resolvedScale = Math.round(resolvedScale * 10000) / 10000;
    existing.estimatedHeight = Math.round(resolveBattleUnitSpineTelemetryVisualHeight(rawWidth, rawHeight, resolvedScale, unit, false) * 100) / 100;
    debug.srRVisuals = debug.srRVisuals.slice(-12);
  }

  private renderHeader(parent: Node, width: number, height: number, scale: number, state: LobbyHeroRosterPanelState, stageCode: string, selectedHeroIds: number[]): void {
    // 2026-08-05 参考图改版:中央战力金横幅(深底胶囊+金描边+左右饰线,数字大号亮金),
    // 推荐战力压缩为横幅下副行;确认状态行下移一档。
    void selectedHeroIds;
    const power = this.host.currentLobbyFormationPowerSnapshot(stageCode);
    const footerHidden = this.host.isLobbyFormationFooterHidden?.() ?? false;
    // 战力横匾(2026-09-08 参考图还原):用户切图金框暗红横匾(1073×202 等比,中央宝石尖顶);
    // 缺图回退 2026-09-06 版手绘胶囊。
    const bannerWidth = Math.min(500 * scale, width * 0.36);
    const bannerHeight = bannerWidth * FORMATION_POWER_BAR_ASPECT;
    const bannerY = height / 2 - 52 * scale;
    // 左上角「编队」标题牌(场景通用件,约到舞台左缘 +268)之后至少留 36 的空隙,再居中到战场区
    const titleBannerRight = -width / 2 + 268 * Math.max(0.56, Math.min(1, scale));
    const bannerX = Math.max(this.battlefieldCenterX, titleBannerRight + 36 * scale + bannerWidth / 2);
    const banner = this.host.addChildPlainNode(parent, 'LobbyFormationPowerBanner', bannerX, bannerY, bannerWidth, bannerHeight);
    if (!this.host.addSprite('LobbyFormationPowerBannerArt', FORMATION_POWER_BAR_ASSET, 0, 0, bannerWidth, bannerHeight, banner)) {
      const capsuleHeight = 44 * scale;
      const bannerGraphics = banner.addComponent(Graphics);
      bannerGraphics.fillColor = rgba(14, 9, 6, 228);
      bannerGraphics.roundRect(-bannerWidth / 2, -capsuleHeight / 2, bannerWidth, capsuleHeight, capsuleHeight / 2);
      bannerGraphics.fill();
      bannerGraphics.strokeColor = rgba(216, 170, 84, 235);
      bannerGraphics.lineWidth = Math.max(1, 1.5 * scale);
      bannerGraphics.roundRect(-bannerWidth / 2, -capsuleHeight / 2, bannerWidth, capsuleHeight, capsuleHeight / 2);
      bannerGraphics.stroke();
    }
    const powerReady = power.rosterLoaded;
    // 2026-09-08 用户反馈:整体字体放大一档(对齐限时副本面板)。
    const bannerLabel = this.host.addChildLabel(banner, 'LobbyFormationPowerBannerLabel', '当前阵容战力', -bannerWidth * 0.15, -bannerHeight * 0.03, 20 * scale, rgba(228, 198, 134), new Size(bannerWidth * 0.42, 26 * scale));
    bannerLabel.overflow = Label.Overflow.SHRINK;
    const numberColor = !powerReady ? rgba(180, 162, 124, 255) : footerHidden || power.enough || power.recommendedPower <= 0 ? rgba(255, 216, 112, 255) : rgba(255, 172, 96, 255);
    const bannerNumber = this.host.addChildLabel(banner, 'LobbyFormationPowerBannerNumber', powerReady ? formatInteger(power.currentPower) : '—', bannerWidth * 0.18, -bannerHeight * 0.03, 32 * scale, numberColor, new Size(bannerWidth * 0.38, 40 * scale));
    bannerNumber.overflow = Label.Overflow.SHRINK;
    // 2026-09-08 用户反馈:横匾下"已就位/目标/推荐战力"状态行移除;仅加载/错误时保留一行提示
    // (推荐战力不足仍由底部提示行红字承担)。
    if (state.loading || state.error) {
      const statusText = state.loading ? '正在读取可上阵英雄...' : '英雄队列暂不可用，当前不能进入战斗。';
      const status = this.host.addChildLabel(parent, 'LobbyFormationStatus', statusText, 0, height / 2 - 122 * scale, 15 * scale, state.error ? rgba(255, 150, 130, 235) : rgba(196, 168, 112, 225), new Size(width - 140 * scale, 20 * scale));
      status.overflow = Label.Overflow.SHRINK;
    }
  }

  private renderBody(parent: Node, width: number, height: number, scale: number, state: LobbyHeroRosterPanelState, selectedHeroIds: number[]): void {
    const top = height / 2 - 132 * scale;
    const bottom = -height / 2 + 86 * scale;
    const compact = width < 720 * scale || height < 450 * scale;
    const availableBodyHeight = Math.max(40 * scale, top - bottom);
    const bodyHeight = compact ? availableBodyHeight : Math.max(150 * scale, availableBodyHeight);
    const bodyWidth = width - 76 * scale;
    if (state.loading && state.heroes.length === 0) {
      this.renderEmpty(parent, bodyWidth, bodyHeight, scale, '正在读取英雄队列，请稍候。');
      return;
    }
    if (state.heroes.length === 0) {
      this.renderEmpty(parent, bodyWidth, bodyHeight, scale, '暂无可展示英雄；请先获取英雄或刷新英雄队列。');
      return;
    }
    const slots = this.resolveSelectedSlots(state.heroes, selectedHeroIds);
    if (compact) {
      this.renderCompactFormation(parent, slots, bodyWidth, bodyHeight, scale);
      return;
    }
    this.renderBattleFormationScene(parent, slots, state.heroes, selectedHeroIds, 0, bottom + bodyHeight / 2, bodyWidth, bodyHeight, scale);
  }

  private renderBattleFormationScene(
    parent: Node,
    slots: Array<LobbyHeroItemVO | null>,
    heroes: LobbyHeroItemVO[],
    selectedHeroIds: number[],
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
  ): void {
    // 第三轮:侧边栏贴屏幕右缘、上下拉通(render 里算好几何);战场 = 舞台左缘到侧栏左缘
    void x;
    const pickerHeight = Math.max(240 * scale, this.pickerTop - this.pickerBottom);
    const pickerY = (this.pickerTop + this.pickerBottom) / 2;
    const rightWidth = this.sidebarWidth;
    const rightX = this.screenRight - rightWidth / 2;
    const fieldLeft = -width / 2;
    const fieldRight = this.screenRight - rightWidth - 12 * scale;
    const leftWidth = Math.max(200 * scale, fieldRight - fieldLeft);
    const leftX = fieldLeft + leftWidth / 2;
    this.renderFormationBattlefield(parent, slots, leftX, y, leftWidth, height, scale);
    this.renderFormationHeroPicker(parent, heroes, selectedHeroIds, rightX, pickerY, rightWidth, pickerHeight, scale);
  }

  private renderFormationBattlefield(parent: Node, slots: Array<LobbyHeroItemVO | null>, x: number, y: number, width: number, height: number, scale: number): void {
    // 2026-09-08 用户反馈:场景背景已整屏铺满(render 顶层),战场区不再画自己的底图/描边框/压暗带,
    // 英雄直接站在全屏场景上(参考图);field 仅作站位坐标容器。
    const field = this.host.addChildPlainNode(parent, 'LobbyFormationBattlefieldScene', x, y, width, height);

    // 2026-10-15 改版:守卫战不分前后排,4 个站位一排浅弧(两端略高略小,中间两位靠前);
    // 两端先画、中间后画,脚下光环和名牌互不遮挡。
    const spanWidth = Math.min(width, height * 1.8);
    const positions = [
      { x: -spanWidth * 0.37, y: -height * 0.07, depth: 0.93 },
      { x: -spanWidth * 0.125, y: -height * 0.15, depth: 1 },
      { x: spanWidth * 0.125, y: -height * 0.15, depth: 1 },
      { x: spanWidth * 0.37, y: -height * 0.07, depth: 0.93 },
    ];
    const standWidth = Math.min(250 * scale, spanWidth * 0.235);
    const standHeight = Math.min(350 * scale, height * 0.66);
    this.formationPlateMaxWidth = spanWidth * 0.235;
    [0, 3, 1, 2].forEach((index) => {
      const pos = positions[index];
      this.renderFormationActorStand(field, slots[index] ?? null, index, pos.x, pos.y, standWidth * pos.depth, standHeight * pos.depth, scale);
    });
  }

  private renderFormationActorStand(parent: Node, hero: LobbyHeroItemVO | null, index: number, x: number, y: number, width: number, height: number, scale: number): void {
    const actor = this.host.addChildPlainNode(parent, `LobbyFormationActorStand_${index}`, x, y, width, height);
    const graphics = actor.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 104);
    graphics.ellipse(0, -height * 0.42, width * 0.34, Math.max(6 * scale, height * 0.045));
    graphics.fill();
    // 脚底:发光金色符文底座(魔法阵素材,空位半透明)打底 + 上阵时叠特效光环(第二轮:单靠特效太淡,像一圈暗影)。
    // 特效 = A47-345 金色透视地面法阵循环(2026-10-15 用户「脚底光环从特效里找」);缺图 / 缺特效各自回退。
    const baseSize = width * 0.98;
    const baseHolder = this.host.addChildPlainNode(actor, 'LobbyFormationSlotBase', 0, -height * 0.42, baseSize, baseSize);
    if (this.host.addSprite('LobbyFormationSlotBaseArt', FORMATION_SLOT_BASE_ASSET, 0, 0, baseSize, baseSize, baseHolder)) {
      const fade = baseHolder.addComponent(UIOpacity);
      fade.opacity = hero ? 255 : 110;
      if (hero) {
        tween(fade)
          .repeatForever(tween()
            .to(1.1, { opacity: 215 })
            .to(1.1, { opacity: 255 }))
          .start();
      }
    } else {
      graphics.strokeColor = hero ? rgba(244, 194, 86, 232) : rgba(105, 91, 68, 112);
      graphics.lineWidth = Math.max(1, hero ? 2.6 * scale : scale);
      graphics.ellipse(0, -height * 0.42, width * 0.38, Math.max(8 * scale, height * 0.054));
      graphics.stroke();
    }
    if (hero) {
      mountLobbySpineFx(this.host as unknown as LobbyUiSpineFxHost, actor, FORMATION_HALO_FX, 0, -height * 0.42, width * 1.02, true, 0, 'LobbyFormationSlotHalo');
    }
    if (hero) {
      this.renderFormationHeroSpinePreview(actor, hero, width, height, scale);
    } else {
      // 空位:基座上方淡金"+",不再画占位剪影(基座本身已说明这是阵位)。
      const plus = this.host.addChildLabel(actor, 'LobbyFormationSlotPlus', '+', 0, -height * 0.3, 34 * scale, rgba(232, 196, 120, 165), new Size(48 * scale, 44 * scale));
      plus.overflow = Label.Overflow.SHRINK;
    }
    // 2026-09-08 用户反馈:整体字体放大一档。
    const actorNameFontSize = 19 * scale;
    const actorSubFontSize = 13.5 * scale;
    const plateWidth = Math.min(width * 1.6, 204 * scale, this.formationPlateMaxWidth);
    const plateHeight = 46 * scale;
    const plate = this.host.addChildPlainNode(actor, 'LobbyFormationActorNameplate', 0, -height * 0.48, plateWidth, plateHeight);
    // 名牌:优先英雄详情现成黑金铭牌素材;缺图回退双段底+稀有度色条+金描边手绘。
    if (!this.host.addSprite('LobbyFormationActorNameplateArt', FORMATION_NAMEPLATE_ASSET, 0, 0, plateWidth, plateHeight, plate)) {
      const plateGraphics = plate.addComponent(Graphics);
      plateGraphics.fillColor = rgba(22, 16, 12, 230);
      plateGraphics.roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 5 * scale);
      plateGraphics.fill();
      plateGraphics.fillColor = rgba(5, 5, 7, 236);
      plateGraphics.roundRect(-plateWidth / 2 + 2 * scale, -plateHeight / 2 + 2 * scale, plateWidth - 4 * scale, plateHeight / 2, 4 * scale);
      plateGraphics.fill();
      if (hero) {
        plateGraphics.fillColor = this.resolveRarityColor(hero.rarity, 226);
        plateGraphics.roundRect(-plateWidth / 2 + 6 * scale, plateHeight / 2 - 4.5 * scale, plateWidth - 12 * scale, 3 * scale, 1.5 * scale);
        plateGraphics.fill();
      }
      plateGraphics.strokeColor = hero ? rgba(206, 160, 82, 198) : rgba(100, 82, 50, 120);
      plateGraphics.lineWidth = Math.max(1, 1.1 * scale);
      plateGraphics.roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 5 * scale);
      plateGraphics.stroke();
    }
    const label = this.host.addChildLabel(plate, 'LobbyFormationActorName', hero ? safeText(hero.heroName) : '空位', 0, 8 * scale, actorNameFontSize, hero ? rgba(246, 218, 156) : rgba(150, 132, 96), new Size(plateWidth - 16 * scale, 24 * scale));
    label.overflow = Label.Overflow.SHRINK;
    // 副行(第二轮:两行居中,不再挤一个小钮):上阵 = 稀有度色「SR · Lv.1」;空位 = 操作提示
    const subText = hero ? `${safeText(hero.rarity)} · Lv.${hero.level}` : '点击右侧英雄上阵';
    const sub = this.host.addChildLabel(plate, 'LobbyFormationActorSub', subText, 0, -11 * scale, actorSubFontSize, hero ? this.resolveRarityColor(hero.rarity, 255) : rgba(182, 160, 111), new Size(plateWidth - 18 * scale, 18 * scale));
    sub.overflow = Label.Overflow.SHRINK;
    // 「下阵」角标:挂在名牌右上角外沿(点整个站位即下阵,角标只做提示)
    if (hero && !hero.protagonist) {
      const chipWidth = 44 * scale;
      const chipHeight = 20 * scale;
      const chip = this.host.addChildPlainNode(plate, 'LobbyFormationActorRemove', plateWidth / 2 - chipWidth / 2 + 4 * scale, plateHeight / 2 + chipHeight / 2 - 3 * scale, chipWidth, chipHeight);
      const cg = chip.addComponent(Graphics);
      cg.fillColor = rgba(110, 24, 20, 240);
      cg.roundRect(-chipWidth / 2, -chipHeight / 2, chipWidth, chipHeight, 5 * scale);
      cg.fill();
      cg.strokeColor = rgba(236, 176, 92, 230);
      cg.lineWidth = Math.max(1, 1.1 * scale);
      cg.roundRect(-chipWidth / 2, -chipHeight / 2, chipWidth, chipHeight, 5 * scale);
      cg.stroke();
      const chipLabel = this.host.addChildLabel(chip, 'Label', '下阵', 0, 0, 13 * scale, rgba(255, 230, 186), new Size(chipWidth - 6 * scale, chipHeight));
      chipLabel.overflow = Label.Overflow.SHRINK;
    }
    if (hero && !hero.protagonist) {
      actor.addComponent(Button);
      actor.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
      this.host.applyImageButtonFeedback(actor, 1.018, 0.982);
    }
  }

  private renderFormationHeroSpinePreview(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const unit = this.toFormationBattleUnit(hero);
    const resourcePath = resolveBattleUnitSpineResource(unit);
    const spineUuid = resolveBattleUnitSpineLoadUuid(unit);
    const visualWidth = width * 2.36;
    const visualHeight = height * 2.28;
    this.recordFormationActorVisualTelemetry(hero, width, height, visualWidth, visualHeight);
    const spineNode = this.host.addChildPlainNode(parent, 'LobbyFormationActorSpinePreview', 0, -height * 0.04, visualWidth, visualHeight);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    skeleton.timeScale = 0.9;
    const fallback = (): void => {
      if (this.isNodeAlive(spineNode)) {
        spineNode.destroy();
      }
      this.renderFormationActorFallback(parent, hero, width, height, scale);
    };
    if (!resourcePath) {
      fallback();
      return;
    }
    this.lastFormationSpineFailureReason = '资源解析失败';

    const applyLoadedData = (data: sp.SkeletonData | null, onFailed: () => void): void => {
      if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
        return;
      }
      if (data) {
        this.applyFormationSpineDataWithRetry(spineNode, skeleton, data, width, height, scale, unit, resourcePath, (applied) => {
          if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
            return;
          }
          if (applied) {
            return;
          }
          onFailed();
        });
        return;
      }
      onFailed();
    };

    const loadResourcePathFallback = (): void => {
      this.loadFormationSpineData(resourcePath, null, (data) => {
        applyLoadedData(data, fallback);
      });
    };

    if (spineUuid) {
      this.loadFormationSpineData(resourcePath, spineUuid, (uuidData) => {
        if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
          return;
        }
        applyLoadedData(uuidData, () => {
          if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
            return;
          }
          console.warn(`[Formation] spine uuid failed, fallback resource path: uuid=${spineUuid}, resource=${resourcePath}, reason=${this.lastFormationSpineFailureReason}`);
          loadResourcePathFallback();
        });
      });
      return;
    }
    loadResourcePathFallback();
  }

  private renderFormationActorFallback(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const fallback = this.host.addChildPlainNode(parent, 'LobbyFormationActorFallbackSilhouette', 0, 0, width, height);
    const graphics = fallback.addComponent(Graphics);
    const unitScale = Math.max(0.72, Math.min(1.15, height / (132 * scale), width / (86 * scale)));
    graphics.fillColor = hero.protagonist ? rgba(96, 34, 30, 228) : this.resolveRarityColor(hero.rarity, 210);
    graphics.moveTo(-24 * scale * unitScale, -height * 0.34);
    graphics.lineTo(-13 * scale * unitScale, height * 0.06);
    graphics.lineTo(0, height * 0.2);
    graphics.lineTo(14 * scale * unitScale, height * 0.06);
    graphics.lineTo(24 * scale * unitScale, -height * 0.34);
    graphics.close();
    graphics.fill();
    graphics.fillColor = rgba(229, 173, 82, 230);
    graphics.circle(0, height * 0.18, 10 * scale * unitScale);
    graphics.fill();
    graphics.strokeColor = rgba(255, 224, 142, 154);
    graphics.moveTo(-30 * scale * unitScale, -height * 0.05);
    graphics.lineTo(-8 * scale * unitScale, height * 0.05);
    graphics.moveTo(8 * scale * unitScale, height * 0.05);
    graphics.lineTo(30 * scale * unitScale, -height * 0.06);
    graphics.stroke();
  }

  private loadFormationSpineData(resourcePath: string, uuid: string | null, onLoaded: (data: sp.SkeletonData | null) => void): void {
    // 2026-08-04 复用重构:改走全局 SpineDataStore,与战斗/详情/大厅共享缓存。
    loadSharedSpineData(resourcePath, uuid, 'Formation', onLoaded);
  }

  private applyFormationSpineData(
    spineNode: Node,
    skeleton: sp.Skeleton,
    data: sp.SkeletonData,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
  ): boolean {
    try {
      const runtimeData = resolveBattleUnitSpineRuntimeData(data);
      if (!runtimeData) {
        const textureCount = data.textures?.length ?? 0;
        const textureNames = (data.textureNames ?? []).join('|') || '<empty>';
        this.lastFormationSpineFailureReason = `运行时解析失败，textures=${textureCount}，atlas=${textureNames}`;
        console.warn(`[Formation] spine runtime data missing: ${unit.unitKey}, reason=${this.lastFormationSpineFailureReason}`);
        return false;
      }
      patchBattleUnitSpineRuntimeEnums(data, runtimeData);
      skeleton.premultipliedAlpha = this.resolveFormationSpinePremultipliedAlpha(data);
      skeleton.skeletonData = data;
      const skinName = resolveBattleUnitSpineSkinName(data, runtimeData);
      if (skinName && skinName !== 'default') {
        skeleton.setSkin(skinName);
        skeleton.setSlotsToSetupPose();
      }
      const animationNames = resolveBattleUnitSpineAnimationNames(data, unit);
      const animationName = animationNames.idle ?? animationNames.victory ?? animationNames.move;
      const spineScale = resolveBattleUnitSpineScale(runtimeData.width, runtimeData.height, width, height, scale, false, unit);
      this.recordFormationActorResolvedVisualTelemetry(unit, runtimeData.width, runtimeData.height, spineScale);
      const nodePosition = resolveBattleUnitSpineNodePosition(runtimeData, spineScale, height, unit, false);
      spineNode.setPosition(new Vec3(nodePosition.x, nodePosition.y, 0));
      spineNode.setScale(new Vec3(spineScale, spineScale, 1));
      if (!animationName) {
        skeleton.setToSetupPose();
        return true;
      }
      const track = skeleton.setAnimation(0, animationName, true);
      if (!track) {
        this.lastFormationSpineFailureReason = `动画播放失败：${animationName}`;
        console.warn(`[Formation] spine animation play failed: ${unit.unitKey}/${animationName}`);
        return false;
      }
      return true;
    } catch (error) {
      this.lastFormationSpineFailureReason = `资源应用异常：${this.formatFormationSpineError(error)}`;
      console.warn(`[Formation] spine apply failed: ${unit.unitKey}, reason=${this.lastFormationSpineFailureReason}`, error);
      return false;
    }
  }

  private applyFormationSpineDataWithRetry(
    spineNode: Node,
    skeleton: sp.Skeleton,
    data: sp.SkeletonData,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    resourcePath: string,
    onDone: (applied: boolean) => void,
    attempt = 0,
  ): void {
    if (!this.isNodeAlive(spineNode) || !this.isNodeAlive(skeleton.node)) {
      return;
    }
    if (this.applyFormationSpineData(spineNode, skeleton, data, width, height, scale, unit)) {
      onDone(true);
      return;
    }
    const retryDelay = FORMATION_SPINE_RUNTIME_RETRY_DELAYS_MS[attempt];
    if (retryDelay !== undefined && this.isRetryableFormationSpineFailure(this.lastFormationSpineFailureReason)) {
      console.warn(`[Formation] spine runtime retry ${attempt + 1}/${FORMATION_SPINE_RUNTIME_RETRY_DELAYS_MS.length}: ${resourcePath}, reason=${this.lastFormationSpineFailureReason}`);
      setTimeout(() => {
        this.applyFormationSpineDataWithRetry(spineNode, skeleton, data, width, height, scale, unit, resourcePath, onDone, attempt + 1);
      }, retryDelay);
      return;
    }
    onDone(false);
  }

  private isRetryableFormationSpineFailure(reason: string): boolean {
    return reason.includes('运行时解析失败') || reason.includes('资源应用异常');
  }

  private resolveFormationSpinePremultipliedAlpha(data: sp.SkeletonData): boolean {
    const atlasText = safeText((data as unknown as { _atlasText?: string })._atlasText || '');
    return /(?:^|\n)\s*pma\s*:\s*true/i.test(atlasText);
  }

  private formatFormationSpineError(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }
    return safeText(String(error || 'unknown'));
  }

  private toFormationBattleUnit(hero: LobbyHeroItemVO): BattlePresentationUnitSnapshot {
    return {
      unitKey: `formation:${hero.id}`,
      side: 'ally',
      slot: 0,
      displayName: safeText(hero.heroName),
      subline: `${safeText(hero.rarity)} · Lv.${hero.level}`,
      rarity: safeText(hero.rarity),
      level: hero.level,
      power: hero.power,
      role: 'front',
      leader: !!hero.protagonist,
      hpRatio: 1,
      sourceHeroId: hero.id,
      heroCode: hero.heroCode,
      heroClass: hero.heroClass,
      portraitAsset: hero.portraitAsset,
      spineAsset: hero.spineAsset,
      spineUuid: hero.spineUuid,
      scaleProfile: 'FORMATION_PREVIEW',
    };
  }

  private isNodeAlive(node: Node | null | undefined): node is Node {
    return !!node && node.isValid;
  }

  private renderFormationHeroPicker(parent: Node, heroes: LobbyHeroItemVO[], selectedHeroIds: number[], x: number, y: number, width: number, height: number, scale: number): void {
    // 页签点击只重建右栏,不整页重渲;整页重渲时闭包被新一轮覆盖。
    this.rebuildHeroPicker = () => {
      if (!parent.isValid) {
        return;
      }
      const stale = parent.getChildByName('LobbyFormationHeroPicker');
      if (stale && stale.isValid) {
        stale.destroy();
      }
      this.renderFormationHeroPicker(parent, heroes, selectedHeroIds, x, y, width, height, scale);
    };
    const panel = this.host.addChildPlainNode(parent, 'LobbyFormationHeroPicker', x, y, width, height);
    // 侧边栏底:暗色实底 + 暗红哥特底纹(拉伸铺满,低不透明度)
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(9, 7, 10, 242);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    const bgArt = this.host.addSprite('LobbyFormationSidebarBg', FORMATION_SIDEBAR_BG_ASSET, 0, 0, width, height, panel);
    if (bgArt) {
      bgArt.node.addComponent(UIOpacity).opacity = 150;
    }
    // 顶部 / 底部再压一层暗,标题行和保存按钮更清楚
    graphics.fillColor = rgba(4, 3, 5, 120);
    graphics.rect(-width / 2, height / 2 - 120 * scale, width, 120 * scale);
    graphics.fill();
    // 左缘竖向金饰边:金条拉通全高 + 上下端冠饰 + 正中宝石章(各自等比,不随高度拉伸)
    // 三件素材同宽 152px(金条段 80 高 / 端冠 250 高 / 宝石章 300 高),节点同宽、高按素材比例,金条只拉长度
    const trimWidth = 34 * scale;
    const trimX = -width / 2 + trimWidth * 0.12;
    const trimBar = this.host.addSprite('LobbyFormationSidebarTrimBar', FORMATION_SIDEBAR_TRIM_BAR_ASSET, trimX, 0, trimWidth, height, panel);
    if (trimBar) {
      const capHeight = trimWidth * (250 / 152);
      this.host.addSprite('LobbyFormationSidebarTrimTop', FORMATION_SIDEBAR_TRIM_CAP_ASSET, trimX, height / 2 - capHeight / 2, trimWidth, capHeight, panel);
      const bottomCap = this.host.addSprite('LobbyFormationSidebarTrimBottom', FORMATION_SIDEBAR_TRIM_CAP_ASSET, trimX, -height / 2 + capHeight / 2, trimWidth, capHeight, panel);
      bottomCap?.node.setScale(1, -1, 1);
      const gemHeight = trimWidth * (300 / 152);
      this.host.addSprite('LobbyFormationSidebarTrimGem', FORMATION_SIDEBAR_TRIM_GEM_ASSET, trimX, 0, trimWidth, gemHeight, panel);
    } else {
      graphics.fillColor = rgba(196, 150, 72, 255);
      graphics.rect(-width / 2, -height / 2, 4 * scale, height);
      graphics.fill();
    }
    // 内容区
    const sidePad = trimWidth * 0.62 + 14 * scale;
    const innerWidth = width - sidePad - 18 * scale;
    const innerX = -width / 2 + sidePad + innerWidth / 2;
    const contentTop = height / 2 - 12 * scale;
    const contentBottom = -height / 2 + 14 * scale;
    // 标题行:标题 + 「已上阵 n/4」;右侧留出关闭按钮
    // 标题行:标题 + 「已上阵 n/4」靠左排(关闭按钮是场景通用件,落在标题行右端,右侧整段留给它)
    const titleY = contentTop - 30 * scale;
    const titleLeft = innerX - innerWidth / 2 + 6 * scale;
    const titleWidth = 5 * 28 * scale + 8 * scale;
    const title = this.host.addChildLabel(panel, 'LobbyFormationHeroPickerTitle', '可出战英雄', titleLeft, titleY, 28 * scale, rgba(250, 222, 160), new Size(titleWidth, 36 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    this.applyOutline(title, scale, true);
    const deployedCount = selectedHeroIds.length;
    const counter = this.host.addChildLabel(panel, 'LobbyFormationHeroPickerCount', `已上阵 ${Math.min(4, deployedCount)}/4`, titleLeft + titleWidth + 10 * scale, titleY - 2 * scale, 17 * scale, deployedCount >= 4 ? rgba(255, 214, 120) : rgba(206, 188, 150), new Size(110 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    counter.overflow = Label.Overflow.SHRINK;
    // 稀有度页签(第二轮素材:选中 = 红底亮金边带光,未选 = 黑底暗铜边;缺图回退旧金匾 / 黑胶囊)
    const tabs: Array<{ key: 'ALL' | 'UR' | 'SSR' | 'SR' | 'R'; label: string }> = [
      { key: 'ALL', label: '全部' },
      { key: 'UR', label: 'UR' },
      { key: 'SSR', label: 'SSR' },
      { key: 'SR', label: 'SR' },
      { key: 'R', label: 'R' },
    ];
    const tabHeight = 38 * scale;
    const tabRowY = titleY - 30 * scale - tabHeight / 2;
    const tabGap = 6 * scale;
    const tabWidth = (innerWidth - tabGap * (tabs.length - 1)) / tabs.length;
    tabs.forEach((tab, tabIndex) => {
      const tabX = innerX - innerWidth / 2 + tabWidth / 2 + tabIndex * (tabWidth + tabGap);
      const active = this.pickerRarityFilter === tab.key;
      const tabNode = this.host.addChildPlainNode(panel, `LobbyFormationRarityTab_${tab.key}`, tabX, tabRowY, tabWidth, tabHeight);
      // 新页签素材高 64px:在素材像素空间九宫格拉伸到页签比例再整体缩放(角饰不变形)
      const tabK = tabHeight / 64;
      const tabHolder = this.host.addChildPlainNode(tabNode, 'ArtHolder', 0, 0, tabWidth / tabK, 64);
      tabHolder.setScale(tabK, tabK, 1);
      const slicedTab = this.host.addSprite('LobbyFormationRarityTabArt', active ? FORMATION_TAB_ON_ASSET : FORMATION_TAB_OFF_ASSET, 0, 0, tabWidth / tabK, 64, tabHolder);
      if (slicedTab && slicedTab.spriteFrame) {
        const tsf = slicedTab.spriteFrame;
        tsf.insetLeft = 22;
        tsf.insetRight = 22;
        tsf.insetTop = 18;
        tsf.insetBottom = 18;
        slicedTab.type = Sprite.Type.SLICED;
      } else {
        tabHolder.destroy();
      }
      const tabArt = slicedTab
        ?? (active
          ? this.host.addSprite('LobbyFormationRarityTabArt', FORMATION_TAB_ACTIVE_ASSET, 0, 0, tabWidth, tabWidth * FORMATION_TAB_ACTIVE_ASPECT, tabNode)
          : this.host.addSprite('LobbyFormationRarityTabArt', FORMATION_TAB_IDLE_ASSET, 0, 0, tabWidth, tabHeight, tabNode));
      if (!tabArt) {
        const tg = tabNode.addComponent(Graphics);
        tg.fillColor = active ? rgba(120, 30, 24, 235) : rgba(16, 14, 15, 215);
        tg.roundRect(-tabWidth / 2, -tabHeight / 2, tabWidth, tabHeight, 6 * scale);
        tg.fill();
        tg.strokeColor = active ? rgba(248, 202, 108, 240) : rgba(110, 92, 58, 150);
        tg.lineWidth = Math.max(1, active ? 1.4 * scale : scale);
        tg.roundRect(-tabWidth / 2, -tabHeight / 2, tabWidth, tabHeight, 6 * scale);
        tg.stroke();
      }
      const tabColor = tab.key === 'ALL' ? rgba(255, 236, 178) : this.resolveRarityColor(tab.key, 255);
      const tabLabel = this.host.addChildLabel(tabNode, 'Label', tab.label, 0, 0, 17 * scale, active ? tabColor : rgba(196, 180, 146), new Size(tabWidth - 8 * scale, 24 * scale));
      tabLabel.overflow = Label.Overflow.SHRINK;
      tabLabel.isBold = active;
      this.applyOutline(tabLabel, scale, false);
      tabNode.addComponent(Button);
      tabNode.on(Button.EventType.CLICK, () => {
        if (this.pickerRarityFilter !== tab.key) {
          this.pickerRarityFilter = tab.key;
          this.rebuildHeroPicker?.();
        }
      }, this);
      this.host.applyImageButtonFeedback(tabNode, 1.04, 0.96);
    });
    const selectedSet = new Set(selectedHeroIds);
    const allVisible = this.visibleHeroes(heroes);
    const filtered = this.pickerRarityFilter === 'ALL'
      ? allVisible
      : allVisible.filter((hero) => safeText(hero.rarity).toUpperCase() === this.pickerRarityFilter);
    // 2026-09-08 用户反馈:已上阵英雄置顶(稳定排序,组内保持原有战力序)。
    const visible = [...filtered].sort((a, b) => (selectedSet.has(b.id) ? 1 : 0) - (selectedSet.has(a.id) ? 1 : 0));
    // 底部保存阵容按钮
    const saveHeight = 64 * scale;
    const saveWidth = Math.min(innerWidth * 0.86, 320 * scale);
    const saveY = contentBottom + saveHeight / 2;
    // 保存钮上方一道细金分隔线
    graphics.strokeColor = rgba(196, 150, 72, 150);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(innerX - innerWidth / 2 + 10 * scale, saveY + saveHeight / 2 + 8 * scale);
    graphics.lineTo(innerX + innerWidth / 2 - 10 * scale, saveY + saveHeight / 2 + 8 * scale);
    graphics.stroke();
    const saveButton = this.host.addChildPlainNode(panel, 'LobbyFormationSaveButton', innerX, saveY, saveWidth, saveHeight);
    if (!this.host.addSprite('LobbyFormationSaveButtonArt', C1812_BUTTON_PRIMARY_ASSET, 0, 0, saveWidth, saveHeight, saveButton)) {
      const sg = saveButton.addComponent(Graphics);
      sg.fillColor = rgba(122, 32, 24, 240);
      sg.roundRect(-saveWidth / 2, -saveHeight / 2, saveWidth, saveHeight, 9 * scale);
      sg.fill();
      sg.strokeColor = rgba(242, 190, 98, 235);
      sg.lineWidth = Math.max(1, 1.5 * scale);
      sg.roundRect(-saveWidth / 2, -saveHeight / 2, saveWidth, saveHeight, 9 * scale);
      sg.stroke();
    }
    const saveLabel = this.host.addChildLabel(saveButton, 'Label', '保存阵容', 8 * scale, 0, 24 * scale, rgba(255, 236, 190), new Size(saveWidth - 60 * scale, 30 * scale));
    saveLabel.overflow = Label.Overflow.SHRINK;
    saveLabel.isBold = true;
    this.applyOutline(saveLabel, scale, true);
    saveButton.addComponent(Button);
    saveButton.on(Button.EventType.CLICK, () => this.host.saveLobbyFormationNow?.(), this);
    this.host.applyImageButtonFeedback(saveButton);
    if (visible.length === 0) {
      const empty = this.host.addChildLabel(panel, 'LobbyFormationPickerEmpty', '该稀有度暂无可出战英雄。', innerX, 0, 16 * scale, rgba(170, 152, 116), new Size(innerWidth - 12 * scale, 24 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }
    // 网格(第二轮):3 列;按可视高度算整行数,卡高铺满可视区——不再出现被裁掉半张的一行(更多的行拖动滚动)
    const rowTop = tabRowY - tabHeight / 2 - 12 * scale;
    const listBottom = saveY + saveHeight / 2 + 18 * scale;
    const listHeight = Math.max(60 * scale, rowTop - listBottom);
    const listWidth = innerWidth;
    // 第三轮:侧栏上下拉通后可视区很高,按 2~3 行铺满(卡高按可视高度反推,卡宽跟着收,网格水平居中)
    const columns = 3;
    const cardGap = 10 * scale;
    // 英雄不足 7 个排 2 行(卡片大、铺满),7 个及以上排 3 行(更多的拖动滚动)
    const fitRows = Math.max(2, Math.min(3, Math.ceil(visible.length / columns)));
    const columnWidth = (listWidth - cardGap * (columns - 1)) / columns;
    const cardHeight = (listHeight - cardGap * (fitRows - 1)) / fitRows;
    const cardWidth = Math.min(columnWidth, cardHeight / 1.2);
    const rowHeight = cardHeight + cardGap;
    const gridWidth = cardWidth * columns + cardGap * (columns - 1);
    const listNode = this.host.addChildPlainNode(panel, 'LobbyFormationHeroPickerList', innerX, listBottom + listHeight / 2, listWidth, listHeight);
    listNode.addComponent(Mask);
    const contentHeight = Math.max(listHeight, Math.ceil(visible.length / columns) * rowHeight - cardGap);
    const contentNode = this.host.addChildPlainNode(listNode, 'LobbyFormationHeroPickerListContent', 0, 0, listWidth, contentHeight);
    const contentTransform = contentNode.getComponent(UITransform);
    if (contentTransform) {
      contentTransform.setAnchorPoint(0.5, 1);
    }
    contentNode.setPosition(0, listHeight / 2, 0);
    const scroll = listNode.addComponent(ScrollView);
    scroll.content = contentNode;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    visible.forEach((hero, index) => {
      // content 锚点在顶部中心:卡片从 0 起向下负值排。
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cardX = -gridWidth / 2 + cardWidth / 2 + col * (cardWidth + cardGap);
      const cardY = -cardHeight / 2 - row * rowHeight;
      this.renderFormationHeroPickerCard(contentNode, hero, cardX, cardY, cardWidth, cardHeight, scale, selectedSet.has(hero.id));
    });
  }

  /**
   * 右栏英雄卡(第二轮,对齐原型):头像铺满卡片上部(方形,卡宽),名字 + 已上阵缎带压在头像下沿的暗渐变上;
   * 最下一行 Lv(左)/ 剑图标 + 战力(右);左上稀有度角标、右上已上阵金勾;外框按稀有度四色九宫格。点卡上下阵。
   */
  private renderFormationHeroPickerCard(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, scale: number, selected: boolean): void {
    const card = this.host.addChildPlainNode(parent, `LobbyFormationHeroCard_${hero.id}`, x, y, width, height);
    const rarity = safeText(hero.rarity).toUpperCase();
    const rarityColor = this.resolveRarityColor(rarity, 255);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 12, 245);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    // 底行高度(Lv / 战力),其余给头像
    const metaHeight = Math.max(24 * scale, height * 0.17);
    const inset = width * 0.045;
    const avatarWidth = width - inset * 2;
    const avatarHeight = height - metaHeight - inset;
    const avatarY = height / 2 - inset - avatarHeight / 2;
    const avatarHolder = this.host.addChildPlainNode(card, 'Avatar', 0, avatarY, avatarWidth, avatarHeight);
    const ag = avatarHolder.addComponent(Graphics);
    ag.fillColor = rgba(Math.round(rarityColor.r * 0.3), Math.round(rarityColor.g * 0.3), Math.round(rarityColor.b * 0.3), 255);
    ag.rect(-avatarWidth / 2, -avatarHeight / 2, avatarWidth, avatarHeight);
    ag.fill();
    const glyph = this.host.addChildLabel(avatarHolder, 'Glyph', Array.from(safeText(hero.heroName))[0] ?? '?', 0, 0, avatarWidth * 0.42, rgba(255, 244, 222), new Size(avatarWidth, avatarHeight));
    glyph.overflow = Label.Overflow.SHRINK;
    // 头像按卡宽方形,底部超出头像区的部分由 Mask 裁掉(头像图上半身居中,裁掉的是下巴以下的衣领)
    avatarHolder.addComponent(Mask);
    const square = this.host.addChildPlainNode(avatarHolder, 'Square', 0, avatarHeight / 2 - avatarWidth / 2, avatarWidth, avatarWidth);
    mountHeroAvatar(square, hero.heroCode, avatarWidth, 'square', () => {
      if (glyph.node.isValid) {
        glyph.node.destroy();
      }
    });
    // 头像下沿暗渐变(逐层叠加)
    const shadeHeight = avatarHeight * (selected ? 0.5 : 0.36);
    const shade = this.host.addChildPlainNode(card, 'Shade', 0, avatarY - avatarHeight / 2 + shadeHeight / 2, avatarWidth, shadeHeight);
    const sg = shade.addComponent(Graphics);
    for (let i = 0; i < 6; i += 1) {
      const h = shadeHeight * (1 - i / 6);
      sg.fillColor = rgba(4, 3, 6, 34);
      sg.rect(-avatarWidth / 2, -shadeHeight / 2, avatarWidth, h);
      sg.fill();
    }
    // 已上阵缎带(贴头像下沿)+ 名字(缎带之上;未上阵贴头像下沿)
    const ribbonHeight = Math.max(18 * scale, avatarHeight * 0.16);
    let nameY = avatarY - avatarHeight / 2 + 14 * scale;
    if (selected) {
      const ribbonY = avatarY - avatarHeight / 2 + ribbonHeight / 2 + 2 * scale;
      const ribbon = this.host.addChildPlainNode(card, 'Deployed', 0, ribbonY, avatarWidth * 1.04, ribbonHeight);
      if (!this.host.addSprite('Art', FORMATION_RIBBON_ASSET, 0, 0, avatarWidth * 1.04, ribbonHeight, ribbon)) {
        const rg = ribbon.addComponent(Graphics);
        rg.fillColor = rgba(110, 76, 24, 240);
        rg.rect(-avatarWidth / 2, -ribbonHeight / 2, avatarWidth, ribbonHeight);
        rg.fill();
      }
      const ribbonLabel = this.host.addChildLabel(ribbon, 'Label', '已上阵', 0, 0, 14 * scale, rgba(255, 238, 190), new Size(avatarWidth * 0.8, ribbonHeight));
      ribbonLabel.overflow = Label.Overflow.SHRINK;
      ribbonLabel.isBold = true;
      this.applyOutline(ribbonLabel, scale, false);
      nameY = ribbonY + ribbonHeight / 2 + 12 * scale;
    }
    const name = this.host.addChildLabel(card, 'Name', safeText(hero.heroName), 0, nameY, 16 * scale, selected ? rgba(255, 236, 176) : rgba(244, 230, 204), new Size(avatarWidth - 4 * scale, 22 * scale));
    name.overflow = Label.Overflow.SHRINK;
    name.isBold = true;
    this.applyOutline(name, scale, true);
    // 稀有度角标(左上)
    const tag = this.host.addChildLabel(card, 'Rarity', rarity || '—', -width / 2 + width * 0.1, height / 2 - inset - 13 * scale, 15 * scale, rarityColor, new Size(40 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    tag.overflow = Label.Overflow.SHRINK;
    tag.isBold = true;
    this.applyOutline(tag, scale, true);
    // 底行:Lv(左)/ 剑图标 + 战力(右);左对齐 x = 左边缘、右对齐 x = 右边缘
    const metaY = -height / 2 + metaHeight / 2 + inset * 0.4;
    // 卡框四角饰纹会压住底行两端:左右各收进卡宽 11%
    const metaEdge = width / 2 - width * 0.11;
    const level = this.host.addChildLabel(card, 'Level', `Lv.${hero.level}`, -metaEdge, metaY, 14 * scale, rgba(220, 202, 162), new Size(width * 0.36, metaHeight), HorizontalTextAlignment.LEFT);
    level.overflow = Label.Overflow.SHRINK;
    const powerText = formatInteger(hero.power);
    const power = this.host.addChildLabel(card, 'Power', powerText, metaEdge, metaY, 14 * scale, rgba(255, 214, 130), new Size(width * 0.34, metaHeight), HorizontalTextAlignment.RIGHT);
    power.overflow = Label.Overflow.SHRINK;
    const iconSize = metaHeight * 0.72;
    const approxTextWidth = Math.min(width * 0.34, powerText.length * 9 * scale);
    if (!this.host.addSprite('PowerIcon', FORMATION_POWER_ICON_ASSET, metaEdge - approxTextWidth - iconSize / 2 - 2 * scale, metaY, iconSize, iconSize, card)) {
      power.string = `战 ${powerText}`;
    }
    // 稀有度卡框:在 256px 帧空间里九宫格拉伸到卡片比例,再整体缩到卡宽(角饰保持原比例)
    const framePath = FORMATION_CARD_FRAME_ASSETS[rarity] ?? FORMATION_CARD_FRAME_ASSETS.R;
    const k = width / FORMATION_CARD_FRAME_PX;
    const frameHolder = this.host.addChildPlainNode(card, 'Frame', 0, 0, FORMATION_CARD_FRAME_PX, height / k);
    frameHolder.setScale(k, k, 1);
    const frame = this.host.addSprite('Art', framePath, 0, 0, FORMATION_CARD_FRAME_PX, height / k, frameHolder);
    if (frame && frame.spriteFrame) {
      const sf = frame.spriteFrame;
      sf.insetTop = FORMATION_CARD_FRAME_INSET;
      sf.insetBottom = FORMATION_CARD_FRAME_INSET;
      sf.insetLeft = FORMATION_CARD_FRAME_INSET;
      sf.insetRight = FORMATION_CARD_FRAME_INSET;
      frame.type = Sprite.Type.SLICED;
    } else {
      frameHolder.destroy();
      g.strokeColor = rarityColor;
      g.lineWidth = Math.max(1.5, 2 * scale);
      g.rect(-width / 2, -height / 2, width, height);
      g.stroke();
    }
    // 已上阵金勾(右上,压在框上)
    if (selected) {
      const markSize = width * 0.24;
      if (!this.host.addSprite('Check', FORMATION_CHECK_GOLD_ASSET, width / 2 - markSize * 0.45, height / 2 - markSize * 0.45, markSize, markSize, card)) {
        g.fillColor = rgba(232, 176, 64, 240);
        g.circle(width / 2 - markSize * 0.45, height / 2 - markSize * 0.45, markSize * 0.36);
        g.fill();
      }
    }
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
    this.host.applyImageButtonFeedback(card, 1.03, 0.97);
  }

  private renderCompactFormation(parent: Node, slots: Array<LobbyHeroItemVO | null>, width: number, height: number, scale: number): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyFormationCompactBody', 0, -4 * scale, width, height);
    const graphics = panel.addComponent(Graphics);
    this.drawSectionFrame(graphics, width, height, scale, rgba(8, 8, 12, 186));
    // 紧凑编队必须始终放下 5 个槽位，行高跟随实际 body 高度缩放。
    const rowHeight = Math.max(10 * scale, Math.min(42 * scale, (height - 12 * scale) / slots.length));
    const startY = height / 2 - 6 * scale - rowHeight / 2;
    const fontSize = Math.max(7, Math.min(16 * scale, rowHeight * 0.62));
    slots.forEach((hero, index) => {
      const y = startY - index * rowHeight;
      const text = hero ? `${index + 1}. ${hero.heroName}  Lv.${hero.level}  战力 ${formatInteger(hero.power)}` : `${index + 1}. 空位`;
      const label = this.host.addChildLabel(panel, `LobbyFormationCompactSlot_${index}`, text, 0, y, fontSize, rgba(226, 199, 139), new Size(width - 28 * scale, rowHeight), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });
  }

  private resolveSelectedSlots(heroes: LobbyHeroItemVO[], selectedHeroIds: number[]): Array<LobbyHeroItemVO | null> {
    const visible = this.visibleHeroes(heroes);
    const byId = new Map(visible.map((hero) => [hero.id, hero]));
    const ordered = selectedHeroIds.length > 0
      ? selectedHeroIds.map((heroId) => byId.get(heroId)).filter((hero): hero is LobbyHeroItemVO => !!hero)
      : this.defaultLineup(visible);
    const slots: Array<LobbyHeroItemVO | null> = [];
    for (const hero of ordered) {
      if (slots.length >= 4) {
        break;
      }
      if (!slots.some((slot) => slot?.id === hero.id)) {
        slots.push(hero);
      }
    }
    while (slots.length < 4) {
      slots.push(null);
    }
    return slots;
  }

  private visibleHeroes(heroes: LobbyHeroItemVO[]): LobbyHeroItemVO[] {
    return heroes.filter((hero) => hero.id > 0 && !hero.protagonist && hero.rarity.toUpperCase() !== 'EX' && !hero.heroCode.toUpperCase().startsWith('EX_'));
  }

  private defaultLineup(heroes: LobbyHeroItemVO[]): LobbyHeroItemVO[] {
    return this.visibleHeroes(heroes).sort((a, b) => b.power - a.power).slice(0, 4);
  }

  private renderEmpty(parent: Node, width: number, bodyHeight: number, scale: number, text: string): void {
    const box = this.host.addChildPlainNode(parent, 'LobbyFormationEmptyBox', 0, -8 * scale, width, Math.min(160 * scale, bodyHeight));
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(9, 9, 12, 168);
    graphics.rect(-width / 2, -60 * scale, width, 120 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 124);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyFormationEmptyText', text, 0, 0, 20 * scale, rgba(213, 193, 151), new Size(width - 48 * scale, 48 * scale));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderFooter(parent: Node, width: number, height: number, scale: number, stageCode: string, state: LobbyHeroRosterPanelState): void {
    const power = this.host.currentLobbyFormationPowerSnapshot(stageCode);
    const footerHidden = this.host.isLobbyFormationFooterHidden?.() ?? false;
    // 从英雄界面进入=纯布阵场景,不显示"战力不足"(这里只是布阵);只有深渊入口才提示。战力不足只红字提示,不拦截挑战。
    const powerShort = !footerHidden && power.rosterLoaded && power.recommendedPower > 0 && !power.enough;
    // 2026-10-10 全局 UI 巡检:常驻操作说明与前排名牌挤在一起(且露"快照"开发口径),只保留战力不足红字。
    const noteText = powerShort ? `战力不足（还差 ${formatInteger(power.powerGap)}），仍可挑战。` : '';
    // 2026-09-08 右栏加高 15% 后面板左缘会压到居中的"挑战"按钮:提示行与三按钮
    // 重新居中到战场区正下方(分栏公式须与 renderBattleFormationScene 保持一致)。
    const compact = width < 720 * scale || height < 450 * scale;
    // 按钮居中到战场区(renderBattleFormationScene 已算好战场中心 x)
    const footerCenterX = compact ? 0 : this.battlefieldCenterX;
    // 提示行上移到底部按钮上方,避免被三个按钮盖住(按钮中心 y=-h/2+38、高 60,顶到 y=-h/2+68)。
    if (noteText) {
      // 红字挪到战力横匾下方(原位置在前排名牌底下)。
      const note = this.host.addChildLabel(parent, 'LobbyFormationBoundaryNote', noteText, footerCenterX, height / 2 - 132 * scale, 18 * scale, rgba(255, 110, 100, 235), new Size(Math.min(width * 0.55, 760 * scale), 24 * scale));
      note.overflow = Label.Overflow.SHRINK;
    }
    if (footerHidden) {
      // 从英雄界面进入:纯布阵场景,隐藏刷新/去升级/挑战三按钮。
      return;
    }
    const reload = this.addFooterButton(parent, 'LobbyFormationReloadButton', '刷新英雄', footerCenterX - 226 * scale, -height / 2 + 38 * scale, 196 * scale, 60 * scale, scale);
    reload.on(Button.EventType.CLICK, () => this.host.reloadLobbyHeroRoster(), this);
    const grow = this.addFooterButton(parent, 'LobbyFormationGrowButton', power.enough ? '查看英雄' : '去升级', footerCenterX, -height / 2 + 38 * scale, 196 * scale, 60 * scale, scale, !state.loading && this.visibleHeroes(state.heroes).length > 0);
    if (!state.loading && this.visibleHeroes(state.heroes).length > 0) {
      grow.on(Button.EventType.CLICK, () => this.host.openLobbyHeroRosterPanel(), this);
    }
    const previewEnabled = this.canOpenBattlePreview(state, stageCode);
    const previewLabel = previewEnabled ? '挑战' : state.loading ? '读取中' : '不可出战';
    const preview = this.addFooterButton(parent, 'LobbyFormationBattlePreviewButton', previewLabel, footerCenterX + 226 * scale, -height / 2 + 38 * scale, 196 * scale, 60 * scale, scale, previewEnabled);
    if (previewEnabled) {
      preview.on(Button.EventType.CLICK, () => this.host.openLobbyBattlePreviewPanel(stageCode), this);
    }
  }

  private canOpenBattlePreview(state: LobbyHeroRosterPanelState, stageCode: string): boolean {
    // 战斗预演只要求:有可上阵英雄、关卡有效、英雄接口无错误、英雄队列已加载。
    // 战力不足也允许进入挑战(策划 2026-07-10):不再用 power.enough 拦截,只在提示行红字提醒。
    const power = this.host.currentLobbyFormationPowerSnapshot(stageCode);
    return /^MAIN_\d+_\d+$/.test(stageCode) && !state.error && this.visibleHeroes(state.heroes).length > 0 && power.rosterLoaded;
  }

  private addFooterButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number, enabled = true): Node {
    const button = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const art = this.host.addSprite(`${name}Art`, enabled ? C1812_BUTTON_PRIMARY_ASSET : C1812_BUTTON_DISABLED_ASSET, 0, 0, width, height, button);
    if (!art) {
      const graphics = button.addComponent(Graphics);
      graphics.fillColor = enabled ? rgba(20, 16, 15, 226) : rgba(22, 20, 18, 168);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.fill();
      graphics.strokeColor = enabled ? rgba(188, 137, 58, 216) : rgba(106, 84, 47, 142);
      graphics.stroke();
    }
    const buttonComponent = button.addComponent(Button);
    buttonComponent.interactable = enabled;
    if (enabled) {
      this.host.applyImageButtonFeedback(button, 1.025, 0.975);
    }
    // AI 按钮中区是暗金属面,深棕字看不见:统一亮金字 + 深色描边。
    const label = this.host.addChildLabel(button, `${name}Label`, text, 10 * scale, 0, 20 * scale, enabled ? rgba(255, 240, 200) : rgba(151, 133, 93), new Size(width - 62 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = rgba(20, 10, 4, 220);
    label.outlineWidth = Math.max(1, 1.3 * scale);
    return button;
  }

  private drawSectionFrame(graphics: Graphics, width: number, height: number, scale: number, fill: Color): void {
    graphics.fillColor = fill;
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(137, 100, 50, 136);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();
  }

  private resolveRarityColor(rarity: string | null | undefined, alpha = 220): Color {
    const key = (rarity || '').trim().toUpperCase();
    if (key === 'UR') {
      return rgba(255, 84, 48, alpha);
    }
    if (key === 'SSR') {
      return rgba(255, 168, 54, alpha);
    }
    if (key === 'SR') {
      return rgba(200, 111, 255, alpha);
    }
    if (key === 'R') {
      return rgba(93, 151, 255, alpha);
    }
    return rgba(96, 91, 88, alpha);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 226 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
  }
}

function formatInteger(value: number | null | undefined): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return numeric.toLocaleString('en-US');
}
