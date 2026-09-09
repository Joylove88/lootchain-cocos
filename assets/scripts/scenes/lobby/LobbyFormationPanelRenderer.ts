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
const FORMATION_ROSTER_PANEL_ASPECT = 1024 / 1536;
const FORMATION_TAB_ACTIVE_ASSET = 'ui/formation/name_plate/spriteFrame';
const FORMATION_TAB_ACTIVE_ASPECT = 88 / 166;
const FORMATION_TAB_IDLE_ASSET = 'ui/formation/plate_dark/spriteFrame';
const FORMATION_CHECK_GOLD_ASSET = 'ui/formation/check_gold/spriteFrame';
const DECO_DIVIDER_LEFT_ASSET = 'ui/common/ai/deco_divider_left/spriteFrame';
const DECO_DIVIDER_RIGHT_ASSET = 'ui/common/ai/deco_divider_right/spriteFrame';
const DECO_DIVIDER_LEFT_ASPECT = 76 / 463;
const DECO_DIVIDER_RIGHT_ASPECT = 77 / 471;

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

    const dim = this.createUiNode('LobbyFormationDim');
    // 背景层锚窗口中心(0,0)而非 stage 中心:stage 顶部让给 HUD 的带子也要被场景盖住。
    dim.setPosition(new Vec3(0, 0, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    // 2026-09-08 用户反馈:背景要铺满到窗口顶部——场景图挂在全窗口 dim 层(stage 区之外的
    // 顶部 HUD 带也要盖住),等比 cover 全窗口;缺图回退深色底。
    const bgAspect = 1920 / 1080;
    const bgWidth = layout.width / layout.height > bgAspect ? layout.width : layout.height * bgAspect;
    const bgHeight = bgWidth / bgAspect;
    const dimGraphics = dim.addComponent(Graphics);
    if (!this.host.addSprite('LobbyFormationSceneBgSprite', FORMATION_BATTLE_BG_ASSET, 0, 0, bgWidth, bgHeight, dim)) {
      dimGraphics.fillColor = rgba(10, 7, 8, 250);
      dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
      dimGraphics.fill();
    }
    // 顶/底压暗带(悬浮 UI 可读性)+ 中部极轻全局压暗,全窗口跨度。
    const veil = this.host.addChildPlainNode(dim, 'LobbyFormationSceneVeil', 0, 0, layout.width, layout.height);
    const veilGraphics = veil.addComponent(Graphics);
    veilGraphics.fillColor = rgba(8, 6, 8, 46);
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
    const bannerWidth = Math.min(540 * scale, width * 0.46);
    const bannerHeight = bannerWidth * FORMATION_POWER_BAR_ASPECT;
    const bannerY = height / 2 - 52 * scale;
    const banner = this.host.addChildPlainNode(parent, 'LobbyFormationPowerBanner', 0, bannerY, bannerWidth, bannerHeight);
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
    const gap = 18 * scale;
    // 2026-09-08 用户反馈:右栏面板加高 15%(中心不变,向上下各溢出 body 一截);
    // 栏宽跟随竖版面板素材 2:3 等比(加高后栏高×0.68),战场吃剩余宽度。
    const pickerHeight = height * 1.15;
    const rightWidth = Math.max(250 * scale, Math.min(width - 330 * scale - gap, pickerHeight * 0.68));
    const leftWidth = Math.max(200 * scale, width - rightWidth - gap);
    const leftX = x - width / 2 + leftWidth / 2;
    const rightX = x + width / 2 - rightWidth / 2;
    this.renderFormationBattlefield(parent, slots, leftX, y, leftWidth, height, scale);
    this.renderFormationHeroPicker(parent, heroes, selectedHeroIds, rightX, y, rightWidth, pickerHeight, scale);
  }

  private renderFormationBattlefield(parent: Node, slots: Array<LobbyHeroItemVO | null>, x: number, y: number, width: number, height: number, scale: number): void {
    // 2026-09-08 用户反馈:场景背景已整屏铺满(render 顶层),战场区不再画自己的底图/描边框/压暗带,
    // 英雄直接站在全屏场景上(参考图);field 仅作站位坐标容器。
    const field = this.host.addChildPlainNode(parent, 'LobbyFormationBattlefieldScene', x, y, width, height);

    // 站位 2+2 浅弧(2026-09-08 用户反馈二调:全员站地面带——场景地平线约在栏中线,
    // 后排此前 +0.06h 踩到了远山上;整体压到下半区,后排只比前排高 0.13h 且收进中路)。
    const spanWidth = Math.min(width, height * 1.55);
    const positions = [
      { x: -spanWidth * 0.12, y: -height * 0.17, depth: 1 },
      { x: spanWidth * 0.12, y: -height * 0.17, depth: 1 },
      { x: -spanWidth * 0.31, y: -height * 0.04, depth: 0.9 },
      { x: spanWidth * 0.31, y: -height * 0.04, depth: 0.9 },
    ];
    const standWidth = Math.min(270 * scale, spanWidth * 0.32);
    const standHeight = Math.min(350 * scale, height * 0.66);
    slots.forEach((hero, index) => {
      const pos = positions[index] ?? positions[positions.length - 1];
      this.renderFormationActorStand(field, hero, index, pos.x, pos.y, standWidth * pos.depth, standHeight * pos.depth, scale);
    });
  }

  private renderFormationActorStand(parent: Node, hero: LobbyHeroItemVO | null, index: number, x: number, y: number, width: number, height: number, scale: number): void {
    const actor = this.host.addChildPlainNode(parent, `LobbyFormationActorStand_${index}`, x, y, width, height);
    const graphics = actor.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 104);
    graphics.ellipse(0, -height * 0.42, width * 0.34, Math.max(6 * scale, height * 0.045));
    graphics.fill();
    // 阵位基座(2026-09-05 改版):image2 魔法阵素材(透视椭圆,等比),空位半透明;缺图回退手绘光圈。
    const baseSize = width * 0.92;
    const baseHolder = this.host.addChildPlainNode(actor, 'LobbyFormationSlotBase', 0, -height * 0.42, baseSize, baseSize);
    if (this.host.addSprite('LobbyFormationSlotBaseArt', FORMATION_SLOT_BASE_ASSET, 0, 0, baseSize, baseSize, baseHolder)) {
      const fade = baseHolder.addComponent(UIOpacity);
      fade.opacity = hero ? 255 : 128;
      if (hero) {
        // 已上阵基座呼吸微光,画面不再全静止。
        tween(fade)
          .repeatForever(tween()
            .to(1.1, { opacity: 205 })
            .to(1.1, { opacity: 255 }))
          .start();
      }
    } else {
      if (hero) {
        const glow = hero.protagonist ? rgba(244, 194, 86, 40) : this.resolveRarityColor(hero.rarity, 44);
        graphics.fillColor = glow;
        graphics.ellipse(0, -height * 0.42, width * 0.38, Math.max(8 * scale, height * 0.054));
        graphics.fill();
      }
      graphics.strokeColor = hero ? (hero.protagonist ? rgba(244, 194, 86, 232) : this.resolveRarityColor(hero.rarity, 236)) : rgba(105, 91, 68, 112);
      graphics.lineWidth = Math.max(1, hero ? 2.6 * scale : scale);
      graphics.ellipse(0, -height * 0.42, width * 0.38, Math.max(8 * scale, height * 0.054));
      graphics.stroke();
      if (hero) {
        graphics.strokeColor = rgba(255, 224, 138, 130);
        graphics.lineWidth = Math.max(1, 1.1 * scale);
        graphics.ellipse(0, -height * 0.42, width * 0.3, Math.max(6 * scale, height * 0.042));
        graphics.stroke();
      }
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
    const plateWidth = Math.min(width * 1.6, 204 * scale);
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
    const label = this.host.addChildLabel(plate, 'LobbyFormationActorName', hero ? safeText(hero.heroName) : '空位', 0, 8 * scale, actorNameFontSize, hero ? rgba(246, 218, 156) : rgba(132, 118, 88), new Size(plateWidth - 14 * scale, 24 * scale));
    label.overflow = Label.Overflow.SHRINK;
    const sub = this.host.addChildLabel(plate, 'LobbyFormationActorSub', hero ? `${safeText(hero.rarity)} · Lv.${hero.level}${hero.protagonist ? '' : ' · 点击下阵'}` : '待上阵', 0, -11 * scale, actorSubFontSize, rgba(182, 160, 111), new Size(plateWidth - 14 * scale, 18 * scale));
    sub.overflow = Label.Overflow.SHRINK;
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
    // 2026-09-08 参考图还原:右栏整体换用户竖版金框面板素材(1024×1536 等比,四周透明边距),
    // 内容按素材内框(约 8% 内缩)排布;缺图回退旧手绘暗盒。
    const artHeight = Math.min(height, width / FORMATION_ROSTER_PANEL_ASPECT);
    const artWidth = artHeight * FORMATION_ROSTER_PANEL_ASPECT;
    const graphics = panel.addComponent(Graphics);
    if (!this.host.addSprite('LobbyFormationHeroPickerPanelArt', FORMATION_ROSTER_PANEL_ASSET, 0, 0, artWidth, artHeight, panel)) {
      graphics.fillColor = rgba(7, 6, 8, 214);
      graphics.roundRect(-artWidth / 2, -artHeight / 2, artWidth, artHeight, 10 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(142, 106, 55, 166);
      graphics.lineWidth = Math.max(1, 1.1 * scale);
      graphics.stroke();
    }
    const innerWidth = artWidth * 0.8;
    const titleY = artHeight / 2 - artHeight * 0.075;
    const title = this.host.addChildLabel(panel, 'LobbyFormationHeroPickerTitle', '可出战英雄', 0, titleY, 24 * scale, rgba(244, 216, 152), new Size(innerWidth - 20 * scale, 32 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const dividerInner = ('可出战英雄'.length * 24 * scale) / 2 + 10 * scale;
    const dividerWidth = Math.min(innerWidth * 0.2, innerWidth / 2 - dividerInner);
    if (dividerWidth >= 40 * scale) {
      const leftArt = this.host.addSprite('LobbyFormationHeroPickerDividerL', DECO_DIVIDER_LEFT_ASSET, -dividerInner - dividerWidth / 2, titleY, dividerWidth, dividerWidth * DECO_DIVIDER_LEFT_ASPECT, panel);
      const rightArt = this.host.addSprite('LobbyFormationHeroPickerDividerR', DECO_DIVIDER_RIGHT_ASSET, dividerInner + dividerWidth / 2, titleY, dividerWidth, dividerWidth * DECO_DIVIDER_RIGHT_ASPECT, panel);
      if (!leftArt || !rightArt) {
        leftArt?.node.destroy();
        rightArt?.node.destroy();
        graphics.strokeColor = rgba(206, 160, 82, 190);
        graphics.lineWidth = Math.max(1, 1.2 * scale);
        graphics.moveTo(-innerWidth / 2, titleY - 22 * scale);
        graphics.lineTo(innerWidth / 2, titleY - 22 * scale);
        graphics.stroke();
      }
    }
    // 稀有度过滤页签:选中=用户小金匾素材(等比撑满格宽),未选=纯黑胶囊素材(可拉伸);缺图手绘。
    const tabs: Array<{ key: 'ALL' | 'UR' | 'SSR' | 'SR' | 'R'; label: string }> = [
      { key: 'ALL', label: '全部' },
      { key: 'UR', label: 'UR' },
      { key: 'SSR', label: 'SSR' },
      { key: 'SR', label: 'SR' },
      { key: 'R', label: 'R' },
    ];
    const tabRowY = titleY - 52 * scale;
    const tabGap = 6 * scale;
    const tabWidth = (innerWidth - tabGap * (tabs.length - 1)) / tabs.length;
    const tabHeight = 30 * scale;
    tabs.forEach((tab, tabIndex) => {
      const tabX = -innerWidth / 2 + tabWidth / 2 + tabIndex * (tabWidth + tabGap);
      const active = this.pickerRarityFilter === tab.key;
      const tabNode = this.host.addChildPlainNode(panel, `LobbyFormationRarityTab_${tab.key}`, tabX, tabRowY, tabWidth, tabHeight);
      const tabArt = active
        ? this.host.addSprite('LobbyFormationRarityTabArt', FORMATION_TAB_ACTIVE_ASSET, 0, 0, tabWidth, tabWidth * FORMATION_TAB_ACTIVE_ASPECT, tabNode)
        : this.host.addSprite('LobbyFormationRarityTabArt', FORMATION_TAB_IDLE_ASSET, 0, 0, tabWidth, tabHeight, tabNode);
      if (!tabArt) {
        const tg = tabNode.addComponent(Graphics);
        tg.fillColor = active ? rgba(120, 78, 26, 235) : rgba(16, 14, 15, 205);
        tg.roundRect(-tabWidth / 2, -tabHeight / 2, tabWidth, tabHeight, tabHeight / 2);
        tg.fill();
        tg.strokeColor = active ? rgba(248, 202, 108, 240) : rgba(110, 92, 58, 150);
        tg.lineWidth = Math.max(1, active ? 1.4 * scale : scale);
        tg.roundRect(-tabWidth / 2, -tabHeight / 2, tabWidth, tabHeight, tabHeight / 2);
        tg.stroke();
      }
      const tabLabel = this.host.addChildLabel(tabNode, 'Label', tab.label, 0, 0, 16 * scale, active ? rgba(255, 236, 178) : rgba(216, 198, 158), new Size(tabWidth - 6 * scale, 20 * scale));
      tabLabel.overflow = Label.Overflow.SHRINK;
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
    // 底部保存阵容按钮(阵容变更本就自动回写,按钮提供显式确认);压在面板内框底部。
    // 2026-09-08 用户反馈:按钮放大一档。
    const saveHeight = 60 * scale;
    const saveWidth = Math.min(innerWidth, 380 * scale);
    const saveY = -artHeight / 2 + artHeight * 0.058 + saveHeight / 2;
    const saveButton = this.host.addChildPlainNode(panel, 'LobbyFormationSaveButton', 0, saveY, saveWidth, saveHeight);
    // 主按钮素材(与底部三按钮同款红金 button_primary);缺图回退手绘。
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
    const saveLabel = this.host.addChildLabel(saveButton, 'Label', '保存阵容', 0, 0, 23 * scale, rgba(255, 230, 168), new Size(saveWidth - 16 * scale, 30 * scale));
    saveLabel.overflow = Label.Overflow.SHRINK;
    saveButton.addComponent(Button);
    saveButton.on(Button.EventType.CLICK, () => this.host.saveLobbyFormationNow?.(), this);
    this.host.applyImageButtonFeedback(saveButton);
    if (visible.length === 0) {
      const empty = this.host.addChildLabel(panel, 'LobbyFormationPickerEmpty', '该稀有度暂无可出战英雄。', 0, 0, 15 * scale, rgba(170, 152, 116), new Size(innerWidth - 12 * scale, 22 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }
    // 列表区(2026-09-08 用户反馈):恒定单列、行高固定,超出 Mask 视口用 ScrollView 拖动滚动
    // (不再 >8 人切两列)。行全量渲染进 content,页签切换仍走 rebuildHeroPicker 整栏重建。
    const rowTop = tabRowY - 26 * scale;
    const listBottom = saveY + saveHeight / 2 + 12 * scale;
    const listHeight = Math.max(60 * scale, rowTop - listBottom);
    const listWidth = innerWidth + 12 * scale;
    const rowHeight = 68 * scale;
    const listNode = this.host.addChildPlainNode(panel, 'LobbyFormationHeroPickerList', 0, listBottom + listHeight / 2, listWidth, listHeight);
    listNode.addComponent(Mask);
    const contentHeight = Math.max(listHeight, visible.length * rowHeight);
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
      // content 锚点在顶部中心:行从 0 起向下负值排。
      const rowY = -rowHeight / 2 - index * rowHeight;
      this.renderFormationHeroPickerRow(contentNode, hero, index, 0, rowY, listWidth, rowHeight - 6 * scale, scale, selectedSet.has(hero.id));
    });
  }

  private renderFormationHeroPickerRow(parent: Node, hero: LobbyHeroItemVO, index: number, x: number, y: number, width: number, height: number, scale: number, selected: boolean): void {
    const row = this.host.addChildPlainNode(parent, `LobbyFormationHeroPickerRow_${hero.id}`, x, y, width, height);
    const graphics = row.addComponent(Graphics);
    // 行底(2026-09-08 参考图):近黑底细边;选中=暗红底+金亮边(参考图选中行红金描边高亮)。
    graphics.fillColor = selected ? rgba(64, 20, 22, 225) : rgba(14, 12, 16, 205);
    graphics.roundRect(-width / 2, -height / 2, width, height, 5 * scale);
    graphics.fill();
    graphics.fillColor = selected ? rgba(42, 12, 14, 225) : rgba(9, 8, 11, 205);
    graphics.roundRect(-width / 2 + 1.5 * scale, -height / 2 + 1.5 * scale, width - 3 * scale, height * 0.5, 4 * scale);
    graphics.fill();
    graphics.strokeColor = selected ? rgba(240, 184, 90, 240) : rgba(90, 76, 48, 120);
    graphics.lineWidth = Math.max(1, selected ? 1.6 * scale : scale);
    graphics.roundRect(-width / 2, -height / 2, width, height, 5 * scale);
    graphics.stroke();
    // 行结构:左侧稀有度竖条 + 金环稀有度徽标 → 名字/职业等级 → 右端战力右对齐,出战中金 chip。
    // 窄列(两列网格)走紧凑单行布局:徽标 + 名字·Lv + 出战小点,信息在英雄页可查。
    const compact = width < 300 * scale;
    graphics.fillColor = this.resolveRarityColor(hero.rarity, selected ? 236 : 188);
    graphics.roundRect(-width / 2 + 2 * scale, -height / 2 + 4 * scale, 3.5 * scale, height - 8 * scale, 1.6 * scale);
    graphics.fill();
    // 2026-09-09 用户反馈:稀有度徽章放大 20%。
    const crestSize = (compact ? 29 : 43) * scale;
    const crest = this.host.addChildPlainNode(row, 'LobbyFormationHeroPickerRarity', -width / 2 + 26 * scale, 0, crestSize, crestSize);
    const crestGraphics = crest.addComponent(Graphics);
    crestGraphics.fillColor = this.resolveRarityColor(hero.rarity, selected ? 224 : 176);
    crestGraphics.circle(0, 0, crestSize * 0.36);
    crestGraphics.fill();
    // 金环素材套在徽标外(缺图退回手绘描边圈)。
    if (!this.host.addSprite('LobbyFormationHeroPickerRingArt', FORMATION_HERO_RING_ASSET, 0, 0, crestSize, crestSize, crest)) {
      crestGraphics.strokeColor = rgba(255, 232, 168, selected ? 180 : 112);
      crestGraphics.circle(0, 0, crestSize * 0.46);
      crestGraphics.stroke();
    }
    const tag = this.host.addChildLabel(crest, 'LobbyFormationHeroPickerRarityText', safeText(hero.rarity).slice(0, 3), 0, 0, 14 * scale, rgba(255, 246, 210), new Size(34 * scale, 18 * scale));
    tag.overflow = Label.Overflow.SHRINK;
    // 出战标记(2026-09-08 参考图):行尾常驻圆位——选中=用户金勾素材(缺图手绘金圆✓),
    // 未选=空心暗圆;标记占位恒定,切换选中不再引起文字横移。
    const markX = width / 2 - 20 * scale;
    const markSize = Math.min(34 * scale, height * 0.62);
    const drawCheckMark = (): void => {
      if (this.host.addSprite('LobbyFormationHeroPickerCheckArt', FORMATION_CHECK_GOLD_ASSET, markX, 0, markSize, markSize, row)) {
        return;
      }
      graphics.fillColor = rgba(232, 176, 64, 240);
      graphics.circle(markX, 0, 9 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(255, 240, 196, 245);
      graphics.lineWidth = Math.max(1.4, 2 * scale);
      graphics.moveTo(markX - 4.2 * scale, 0.4 * scale);
      graphics.lineTo(markX - 1.2 * scale, -3.2 * scale);
      graphics.lineTo(markX + 4.6 * scale, 3.6 * scale);
      graphics.stroke();
    };
    const drawIdleMark = (): void => {
      graphics.fillColor = rgba(8, 8, 10, 150);
      graphics.circle(markX, 0, markSize * 0.36);
      graphics.fill();
      graphics.strokeColor = rgba(118, 102, 68, 160);
      graphics.lineWidth = Math.max(1, 1.3 * scale);
      graphics.circle(markX, 0, markSize * 0.36);
      graphics.stroke();
    };
    const markWidth = 32 * scale;
    if (compact) {
      const name = this.host.addChildLabel(row, 'LobbyFormationHeroPickerName', `${safeText(hero.heroName)} Lv.${hero.level}`, -width / 2 + 40 * scale, 0, 17 * scale, selected ? rgba(255, 232, 166) : rgba(218, 198, 151), new Size(width - 54 * scale - markWidth, 20 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
    } else {
      // 2026-09-08 用户反馈:整体字体放大一档。
      const name = this.host.addChildLabel(row, 'LobbyFormationHeroPickerName', `${safeText(hero.heroName)}${hero.protagonist ? '  队长' : ''}`, -width / 2 + 56 * scale, 11 * scale, 22 * scale, selected ? rgba(255, 232, 166) : rgba(218, 198, 151), new Size(width - 146 * scale - markWidth, 26 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      const meta = this.host.addChildLabel(row, 'LobbyFormationHeroPickerMeta', `${safeText(hero.heroClass || '未分类')} · Lv.${hero.level}`, -width / 2 + 56 * scale, -12 * scale, 17 * scale, rgba(170, 151, 108), new Size(width - 146 * scale - markWidth, 20 * scale), HorizontalTextAlignment.LEFT);
      meta.overflow = Label.Overflow.SHRINK;
      const power = this.host.addChildLabel(row, 'LobbyFormationHeroPickerPower', `战力 ${formatInteger(hero.power)}`, width / 2 - 62 * scale - markWidth, -12 * scale, 17 * scale, rgba(214, 190, 138), new Size(110 * scale, 20 * scale), HorizontalTextAlignment.RIGHT);
      power.overflow = Label.Overflow.SHRINK;
    }
    if (selected) {
      drawCheckMark();
    } else {
      drawIdleMark();
    }
    row.addComponent(Button);
    row.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
    this.host.applyImageButtonFeedback(row, 1.012, 0.988);
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
    const noteText = powerShort
      ? `战力不足（还差 ${formatInteger(power.powerGap)}），仍可挑战。`
      : '点击候选英雄上阵，点击已上阵英雄下阵；阵容仅用于本次出战快照。';
    // 2026-09-08 右栏加高 15% 后面板左缘会压到居中的"挑战"按钮:提示行与三按钮
    // 重新居中到战场区正下方(分栏公式须与 renderBattleFormationScene 保持一致)。
    const compact = width < 720 * scale || height < 450 * scale;
    let footerCenterX = 0;
    if (!compact) {
      const bodyWidth = width - 76 * scale;
      const bodyHeight = Math.max(150 * scale, height - 218 * scale);
      const splitGap = 18 * scale;
      const pickerHeight = bodyHeight * 1.15;
      const rightWidth = Math.max(250 * scale, Math.min(bodyWidth - 330 * scale - splitGap, pickerHeight * 0.68));
      const leftWidth = Math.max(200 * scale, bodyWidth - rightWidth - splitGap);
      footerCenterX = -bodyWidth / 2 + leftWidth / 2;
    }
    // 提示行上移到底部按钮上方,避免被三个按钮盖住(按钮中心 y=-h/2+38、高 60,顶到 y=-h/2+68)。
    const note = this.host.addChildLabel(parent, 'LobbyFormationBoundaryNote', noteText, footerCenterX, -height / 2 + 92 * scale, 15 * scale, powerShort ? rgba(255, 110, 100, 235) : rgba(168, 148, 112, 220), new Size(Math.min(width - 110 * scale, 760 * scale), 22 * scale));
    note.overflow = Label.Overflow.SHRINK;
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
