import {
  assetManager,
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  resources,
  Size,
  Sprite,
  sp,
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
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    // 功能页采用场景式导航，遮罩只阻断底层输入，不再承担点击关闭语义。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyFormationSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    // 面板内容区阻挡输入，避免点英雄槽时穿透遮罩关闭弹窗。
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyFormationSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(5, 5, 8, 232),
      rgba(195, 144, 61, 230),
      18 * scale,
    );
    this.drawPanelAtmosphere(panel, panelWidth, panelHeight, scale);
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
    const selectedCount = this.resolveSelectedSlots(state.heroes, selectedHeroIds).filter((hero) => hero !== null).length;
    const power = this.host.currentLobbyFormationPowerSnapshot(stageCode);
    const footerHidden = this.host.isLobbyFormationFooterHidden?.() ?? false;
    const bannerWidth = Math.min(400 * scale, width * 0.46);
    const bannerHeight = 44 * scale;
    const bannerY = height / 2 - 56 * scale;
    const banner = this.host.addChildPlainNode(parent, 'LobbyFormationPowerBanner', 0, bannerY, bannerWidth, bannerHeight);
    const bannerGraphics = banner.addComponent(Graphics);
    bannerGraphics.fillColor = rgba(14, 9, 6, 228);
    bannerGraphics.roundRect(-bannerWidth / 2, -bannerHeight / 2, bannerWidth, bannerHeight, bannerHeight / 2);
    bannerGraphics.fill();
    bannerGraphics.strokeColor = rgba(216, 170, 84, 235);
    bannerGraphics.lineWidth = Math.max(1, 1.5 * scale);
    bannerGraphics.roundRect(-bannerWidth / 2, -bannerHeight / 2, bannerWidth, bannerHeight, bannerHeight / 2);
    bannerGraphics.stroke();
    // 左右延伸饰线(渐弱双段)+ 端头菱形,呼应参考图的双翼横幅构图。
    const flourish = (direction: number): void => {
      bannerGraphics.strokeColor = rgba(216, 170, 84, 150);
      bannerGraphics.lineWidth = Math.max(1, 1.2 * scale);
      bannerGraphics.moveTo(direction * (bannerWidth / 2 + 10 * scale), 0);
      bannerGraphics.lineTo(direction * (bannerWidth / 2 + 58 * scale), 0);
      bannerGraphics.stroke();
      bannerGraphics.fillColor = rgba(230, 186, 96, 210);
      const tipX = direction * (bannerWidth / 2 + 64 * scale);
      bannerGraphics.moveTo(tipX, 0);
      bannerGraphics.lineTo(tipX - direction * 7 * scale, 4 * scale);
      bannerGraphics.lineTo(tipX - direction * 7 * scale, -4 * scale);
      bannerGraphics.close();
      bannerGraphics.fill();
    };
    flourish(-1);
    flourish(1);
    const powerReady = power.rosterLoaded;
    const bannerLabel = this.host.addChildLabel(banner, 'LobbyFormationPowerBannerLabel', '当前阵容战力', -bannerWidth * 0.16, 0, 17 * scale, rgba(228, 198, 134), new Size(bannerWidth * 0.5, 22 * scale));
    bannerLabel.overflow = Label.Overflow.SHRINK;
    const numberColor = !powerReady ? rgba(180, 162, 124, 255) : footerHidden || power.enough || power.recommendedPower <= 0 ? rgba(255, 216, 112, 255) : rgba(255, 172, 96, 255);
    const bannerNumber = this.host.addChildLabel(banner, 'LobbyFormationPowerBannerNumber', powerReady ? formatInteger(power.currentPower) : '—', bannerWidth * 0.2, 0, 26 * scale, numberColor, new Size(bannerWidth * 0.42, 32 * scale));
    bannerNumber.overflow = Label.Overflow.SHRINK;
    // 副行:推荐战力(挑战布阵才有意义;纯布阵/未就绪时省略或给读取提示)。
    const subText = !powerReady
      ? '英雄队列读取中，阵容战力稍后刷新。'
      : !footerHidden && power.recommendedPower > 0
        ? power.enough
          ? `推荐战力 ${formatInteger(power.recommendedPower)}，已达标。`
          : `推荐战力 ${formatInteger(power.recommendedPower)}，还差 ${formatInteger(power.powerGap)}。`
        : '';
    if (subText) {
      const subColor = !powerReady ? rgba(170, 152, 116) : power.enough ? rgba(186, 225, 173) : rgba(255, 181, 116);
      const sub = this.host.addChildLabel(parent, 'LobbyFormationPowerStatus', subText, 0, bannerY - 32 * scale, 15 * scale, subColor, new Size(width - 112 * scale, 20 * scale));
      sub.overflow = Label.Overflow.SHRINK;
    }
    const statusText = state.loading
      ? '正在读取可上阵英雄...'
      : state.error
        ? '英雄队列暂不可用，当前不能进入战斗。'
        : `已确认 ${selectedCount}/4 名出战英雄：目标 ${stageCode}；点击已上阵英雄可下阵。`;
    const status = this.host.addChildLabel(parent, 'LobbyFormationStatus', statusText, 0, height / 2 - 112 * scale, 16 * scale, rgba(204, 167, 88), new Size(width - 112 * scale, 24 * scale));
    status.overflow = Label.Overflow.SHRINK;
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
    // 左侧战场加宽(0.58→0.66),立绘站位更宽松;右侧列表相应收窄。
    const leftWidth = Math.max(330 * scale, width * 0.66);
    const rightWidth = Math.max(240 * scale, width - leftWidth - gap);
    const leftX = x - width / 2 + leftWidth / 2;
    const rightX = x + width / 2 - rightWidth / 2;
    this.renderFormationBattlefield(parent, slots, leftX, y, leftWidth, height, scale);
    this.renderFormationHeroPicker(parent, heroes, selectedHeroIds, rightX, y, rightWidth, height, scale);
  }

  private renderFormationBattlefield(parent: Node, slots: Array<LobbyHeroItemVO | null>, x: number, y: number, width: number, height: number, scale: number): void {
    const field = this.host.addChildPlainNode(parent, 'LobbyFormationBattlefieldScene', x, y, width, height);
    this.host.addSprite('LobbyFormationBattlefieldBackgroundSprite', FORMATION_BATTLE_BG_ASSET, 0, 0, width, height, field);
    if (FORMATION_BATTLE_GROUND_ASSET !== FORMATION_BATTLE_BG_ASSET) {
      this.host.addSprite('LobbyFormationBattlefieldGroundSprite', FORMATION_BATTLE_GROUND_ASSET, 0, -height * 0.2, width, height * 0.48, field);
    }
    const graphics = field.addComponent(Graphics);
    graphics.fillColor = rgba(6, 7, 10, 92);
    graphics.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(146, 108, 55, 168);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.stroke();
    graphics.fillColor = rgba(126, 22, 26, 38);
    graphics.ellipse(-width * 0.18, -height * 0.28, width * 0.36, height * 0.08);
    graphics.fill();
    graphics.fillColor = rgba(58, 98, 132, 24);
    graphics.ellipse(width * 0.2, height * 0.12, width * 0.28, height * 0.07);
    graphics.fill();

    // 站位压到实景背景的地面带且整体内收,立绘缩小一档,全员完整落在面板内。
    const positions = [
      { x: -width * 0.24, y: -height * 0.06 },
      { x: 0, y: -height * 0.06 },
      { x: width * 0.24, y: -height * 0.06 },
      { x: -width * 0.12, y: -height * 0.24 },
      { x: width * 0.12, y: -height * 0.24 },
    ];
    const standWidth = Math.min(270 * scale, width * 0.38);
    const standHeight = Math.min(350 * scale, height * 0.66);
    slots.forEach((hero, index) => {
      const pos = positions[index] ?? positions[positions.length - 1];
      this.renderFormationActorStand(field, hero, index, pos.x, pos.y, standWidth, standHeight, scale);
    });
  }

  private renderFormationActorStand(parent: Node, hero: LobbyHeroItemVO | null, index: number, x: number, y: number, width: number, height: number, scale: number): void {
    const actor = this.host.addChildPlainNode(parent, `LobbyFormationActorStand_${index}`, x, y, width, height);
    const graphics = actor.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 104);
    graphics.ellipse(0, -height * 0.42, width * 0.34, Math.max(6 * scale, height * 0.045));
    graphics.fill();
    // 站位光圈(2026-08-05 参考图强化):上阵位=稀有度色淡填充+粗外圈+金内圈的发光魔法阵观感。
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
    if (hero) {
      this.renderFormationHeroSpinePreview(actor, hero, width, height, scale);
    } else {
      graphics.fillColor = rgba(76, 65, 48, 126);
      graphics.roundRect(-15 * scale, -height * 0.28, 30 * scale, height * 0.52, 14 * scale);
      graphics.fill();
      graphics.circle(0, height * 0.11, 11 * scale);
      graphics.fill();
    }
    const actorNameFontSize = 16 * scale;
    const actorSubFontSize = 11.5 * scale;
    const plateWidth = Math.min(width * 1.55, 176 * scale);
    const plateHeight = 40 * scale;
    const plate = this.host.addChildPlainNode(actor, 'LobbyFormationActorNameplate', 0, -height * 0.48, plateWidth, plateHeight);
    const plateGraphics = plate.addComponent(Graphics);
    // 名牌:上深下黑双段底 + 顶部稀有度色条 + 金描边,配合新素材的黑金质感。
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
    const label = this.host.addChildLabel(plate, 'LobbyFormationActorName', hero ? safeText(hero.heroName) : '空位', 0, 7 * scale, actorNameFontSize, hero ? rgba(246, 218, 156) : rgba(132, 118, 88), new Size(plateWidth - 14 * scale, 20 * scale));
    label.overflow = Label.Overflow.SHRINK;
    const sub = this.host.addChildLabel(plate, 'LobbyFormationActorSub', hero ? `${safeText(hero.rarity)} · Lv.${hero.level}${hero.protagonist ? '' : ' · 点击下阵'}` : '待上阵', 0, -10 * scale, actorSubFontSize, rgba(182, 160, 111), new Size(plateWidth - 14 * scale, 16 * scale));
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
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(7, 6, 8, 214);
    graphics.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(142, 106, 55, 166);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.stroke();
    graphics.fillColor = rgba(111, 31, 28, 82);
    graphics.rect(-width / 2 + 10 * scale, height / 2 - 52 * scale, width - 20 * scale, 34 * scale);
    graphics.fill();
    const title = this.host.addChildLabel(panel, 'LobbyFormationHeroPickerTitle', '可出战英雄', 0, height / 2 - 32 * scale, 18 * scale, rgba(231, 205, 142), new Size(width - 36 * scale, 24 * scale));
    title.overflow = Label.Overflow.SHRINK;
    // 金色分隔线(Graphics 渐淡双线):divider 素材是粗雕花图,压到 14px 高会失真,改手绘。
    graphics.strokeColor = rgba(206, 160, 82, 190);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(-width / 2 + 16 * scale, height / 2 - 56 * scale);
    graphics.lineTo(width / 2 - 16 * scale, height / 2 - 56 * scale);
    graphics.stroke();
    // 稀有度过滤页签(2026-08-05 参考图):全部/UR/SSR/SR/R 胶囊,选中金框亮字。
    const tabs: Array<{ key: 'ALL' | 'UR' | 'SSR' | 'SR' | 'R'; label: string }> = [
      { key: 'ALL', label: '全部' },
      { key: 'UR', label: 'UR' },
      { key: 'SSR', label: 'SSR' },
      { key: 'SR', label: 'SR' },
      { key: 'R', label: 'R' },
    ];
    const tabRowY = height / 2 - 74 * scale;
    const tabGap = 6 * scale;
    const tabWidth = (width - 28 * scale - tabGap * (tabs.length - 1)) / tabs.length;
    const tabHeight = 24 * scale;
    tabs.forEach((tab, tabIndex) => {
      const tabX = -width / 2 + 14 * scale + tabWidth / 2 + tabIndex * (tabWidth + tabGap);
      const active = this.pickerRarityFilter === tab.key;
      const tabNode = this.host.addChildPlainNode(panel, `LobbyFormationRarityTab_${tab.key}`, tabX, tabRowY, tabWidth, tabHeight);
      const tg = tabNode.addComponent(Graphics);
      tg.fillColor = active ? rgba(120, 78, 26, 235) : rgba(16, 14, 15, 205);
      tg.roundRect(-tabWidth / 2, -tabHeight / 2, tabWidth, tabHeight, tabHeight / 2);
      tg.fill();
      tg.strokeColor = active ? rgba(248, 202, 108, 240) : rgba(110, 92, 58, 150);
      tg.lineWidth = Math.max(1, active ? 1.4 * scale : scale);
      tg.roundRect(-tabWidth / 2, -tabHeight / 2, tabWidth, tabHeight, tabHeight / 2);
      tg.stroke();
      const tabLabel = this.host.addChildLabel(tabNode, 'Label', tab.label, 0, 0, 13 * scale, active ? rgba(255, 236, 178) : rgba(196, 178, 138), new Size(tabWidth - 6 * scale, 16 * scale));
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
    const visible = this.pickerRarityFilter === 'ALL'
      ? allVisible
      : allVisible.filter((hero) => safeText(hero.rarity).toUpperCase() === this.pickerRarityFilter);
    // 底部保存阵容按钮(阵容变更本就自动回写,按钮提供显式确认)。
    const saveHeight = 40 * scale;
    const saveWidth = Math.min(width - 36 * scale, 230 * scale);
    const saveY = -height / 2 + 14 * scale + saveHeight / 2;
    const saveButton = this.host.addChildPlainNode(panel, 'LobbyFormationSaveButton', 0, saveY, saveWidth, saveHeight);
    const sg = saveButton.addComponent(Graphics);
    sg.fillColor = rgba(122, 32, 24, 240);
    sg.roundRect(-saveWidth / 2, -saveHeight / 2, saveWidth, saveHeight, 9 * scale);
    sg.fill();
    sg.strokeColor = rgba(242, 190, 98, 235);
    sg.lineWidth = Math.max(1, 1.5 * scale);
    sg.roundRect(-saveWidth / 2, -saveHeight / 2, saveWidth, saveHeight, 9 * scale);
    sg.stroke();
    const saveLabel = this.host.addChildLabel(saveButton, 'Label', '保存阵容', 0, 0, 18 * scale, rgba(255, 230, 168), new Size(saveWidth - 16 * scale, 24 * scale));
    saveLabel.overflow = Label.Overflow.SHRINK;
    saveButton.addComponent(Button);
    saveButton.on(Button.EventType.CLICK, () => this.host.saveLobbyFormationNow?.(), this);
    this.host.applyImageButtonFeedback(saveButton);
    if (visible.length === 0) {
      const empty = this.host.addChildLabel(panel, 'LobbyFormationPickerEmpty', '该稀有度暂无可出战英雄。', 0, 0, 15 * scale, rgba(170, 152, 116), new Size(width - 36 * scale, 22 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }
    // 列表区:页签之下、保存按钮之上;行高按数量自适应,>8 人两列。
    const columns = visible.length > 8 ? 2 : 1;
    const rowsPerColumn = Math.max(1, Math.ceil(visible.length / columns));
    const rowTop = height / 2 - 96 * scale;
    const listBottom = saveY + saveHeight / 2 + 10 * scale;
    const rowHeight = Math.max(34 * scale, Math.min(58 * scale, (rowTop - listBottom) / rowsPerColumn));
    const columnWidth = (width - 24 * scale - (columns - 1) * 8 * scale) / columns;
    visible.forEach((hero, index) => {
      const col = index % columns;
      const rowIndex = Math.floor(index / columns);
      const rowY = rowTop - rowHeight / 2 - rowIndex * rowHeight;
      const rowX = columns === 1 ? 0 : (col === 0 ? -(columnWidth / 2 + 4 * scale) : columnWidth / 2 + 4 * scale);
      this.renderFormationHeroPickerRow(panel, hero, index, rowX, rowY, columnWidth, rowHeight - 5 * scale, scale, selectedSet.has(hero.id));
    });
  }

  private renderFormationHeroPickerRow(parent: Node, hero: LobbyHeroItemVO, index: number, x: number, y: number, width: number, height: number, scale: number, selected: boolean): void {
    const row = this.host.addChildPlainNode(parent, `LobbyFormationHeroPickerRow_${hero.id}`, x, y, width, height);
    const graphics = row.addComponent(Graphics);
    graphics.fillColor = selected ? rgba(76, 22, 24, 210) : rgba(12, 12, 15, 168);
    graphics.roundRect(-width / 2, -height / 2, width, height, 5 * scale);
    graphics.fill();
    graphics.strokeColor = selected ? rgba(216, 158, 65, 210) : rgba(94, 80, 50, 128);
    graphics.lineWidth = Math.max(1, selected ? 1.2 * scale : scale);
    graphics.stroke();
    // 行结构:左侧稀有度竖条 + 稀有度徽标 → 名字/职业等级 → 右端战力右对齐,出战中金 chip。
    // 窄列(两列网格)走紧凑单行布局:徽标 + 名字·Lv + 出战小点,信息在英雄页可查。
    const compact = width < 300 * scale;
    graphics.fillColor = this.resolveRarityColor(hero.rarity, selected ? 236 : 188);
    graphics.roundRect(-width / 2 + 2 * scale, -height / 2 + 4 * scale, 3.5 * scale, height - 8 * scale, 1.6 * scale);
    graphics.fill();
    const crest = this.host.addChildPlainNode(row, 'LobbyFormationHeroPickerRarity', -width / 2 + 22 * scale, 0, 26 * scale, 26 * scale);
    const crestGraphics = crest.addComponent(Graphics);
    crestGraphics.fillColor = this.resolveRarityColor(hero.rarity, selected ? 224 : 176);
    crestGraphics.circle(0, 0, (compact ? 9 : 11) * scale);
    crestGraphics.fill();
    crestGraphics.strokeColor = rgba(255, 232, 168, selected ? 180 : 112);
    crestGraphics.circle(0, 0, (compact ? 11 : 13) * scale);
    crestGraphics.stroke();
    const tag = this.host.addChildLabel(crest, 'LobbyFormationHeroPickerRarityText', safeText(hero.rarity).slice(0, 3), 0, 0, 10 * scale, rgba(255, 246, 210), new Size(24 * scale, 12 * scale));
    tag.overflow = Label.Overflow.SHRINK;
    // 出战标记(2026-08-05 参考图):行尾金圆✓,替代旧"出战中"胶囊/小圆点。
    const drawCheckMark = (): void => {
      const markX = width / 2 - 15 * scale;
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
    const markWidth = selected ? 26 * scale : 0;
    if (compact) {
      const name = this.host.addChildLabel(row, 'LobbyFormationHeroPickerName', `${safeText(hero.heroName)} Lv.${hero.level}`, -width / 2 + 40 * scale, 0, 17 * scale, selected ? rgba(255, 232, 166) : rgba(218, 198, 151), new Size(width - 54 * scale - markWidth, 20 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
    } else {
      const name = this.host.addChildLabel(row, 'LobbyFormationHeroPickerName', `${safeText(hero.heroName)}${hero.protagonist ? '  队长' : ''}`, -width / 2 + 45 * scale, 9 * scale, 19 * scale, selected ? rgba(255, 232, 166) : rgba(218, 198, 151), new Size(width - 130 * scale - markWidth, 22 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      const meta = this.host.addChildLabel(row, 'LobbyFormationHeroPickerMeta', `${safeText(hero.heroClass || '未分类')} · Lv.${hero.level}`, -width / 2 + 45 * scale, -10 * scale, 15 * scale, rgba(170, 151, 108), new Size(width - 130 * scale - markWidth, 17 * scale), HorizontalTextAlignment.LEFT);
      meta.overflow = Label.Overflow.SHRINK;
      const power = this.host.addChildLabel(row, 'LobbyFormationHeroPickerPower', `战力 ${formatInteger(hero.power)}`, width / 2 - 62 * scale - markWidth, -10 * scale, 14 * scale, rgba(214, 190, 138), new Size(100 * scale, 16 * scale), HorizontalTextAlignment.RIGHT);
      power.overflow = Label.Overflow.SHRINK;
    }
    if (selected) {
      drawCheckMark();
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

  private renderFormationSlot(parent: Node, hero: LobbyHeroItemVO | null, index: number, x: number, y: number, width: number, height: number, scale: number): void {
    const slot = this.host.addChildPlainNode(parent, `LobbyFormationSlot_${index}`, x, y, width, height);
    const graphics = slot.addComponent(Graphics);
    graphics.fillColor = hero ? (hero.protagonist ? rgba(45, 12, 14, 220) : rgba(10, 10, 13, 198)) : rgba(6, 6, 8, 170);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = hero?.protagonist ? rgba(226, 166, 72, 220) : rgba(132, 98, 52, 150);
    graphics.lineWidth = Math.max(1, hero?.protagonist ? 1.6 * scale : scale);
    graphics.stroke();
    const title = this.host.addChildLabel(slot, 'LobbyFormationSlotTitle', hero ? safeText(hero.heroName) : '空位', 0, height / 2 - 24 * scale, 18 * scale, rgba(246, 218, 156), new Size(width - 18 * scale, 26 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const badgeText = hero?.protagonist ? '队长 / 主角' : hero ? safeText(hero.rarity) : '待上阵';
    const badge = this.host.addChildLabel(slot, 'LobbyFormationSlotBadge', badgeText, 0, height / 2 - 52 * scale, 16 * scale, hero?.protagonist ? rgba(236, 172, 78) : rgba(185, 160, 105), new Size(width - 18 * scale, 20 * scale));
    badge.overflow = Label.Overflow.SHRINK;
    const level = this.host.addChildLabel(slot, 'LobbyFormationSlotLevel', hero ? `Lv.${hero.level}  星 ${hero.star}` : '未选择', 0, -8 * scale, 16 * scale, rgba(196, 176, 134), new Size(width - 18 * scale, 22 * scale));
    level.overflow = Label.Overflow.SHRINK;
    const power = this.host.addChildLabel(slot, 'LobbyFormationSlotPower', hero ? `战力 ${formatInteger(hero.power)}` : '战力 0', 0, -34 * scale, 18 * scale, rgba(231, 207, 143), new Size(width - 18 * scale, 24 * scale));
    power.overflow = Label.Overflow.SHRINK;
    if (hero && !hero.protagonist) {
      slot.addComponent(Button);
      slot.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
      this.host.applyImageButtonFeedback(slot, 1.018, 0.982);
    }
  }

  private renderCandidateList(parent: Node, heroes: LobbyHeroItemVO[], selectedHeroIds: number[], x: number, y: number, width: number, height: number, scale: number): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyFormationCandidateList', x, y, width, height);
    const graphics = panel.addComponent(Graphics);
    this.drawSectionFrame(graphics, width, height, scale, rgba(6, 6, 9, 176));
    const title = this.host.addChildLabel(panel, 'LobbyFormationCandidateTitle', '候选英雄（点击上阵/下阵）', -width / 2 + 18 * scale, height / 2 - 24 * scale, 17 * scale, rgba(221, 173, 85), new Size(width - 36 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    const maxRows = Math.max(1, Math.min(4, Math.floor((height - 52 * scale) / (30 * scale))));
    const selectedSet = new Set(selectedHeroIds);
    this.visibleHeroes(heroes).slice(0, maxRows).forEach((hero, index) => {
      const y = height / 2 - 58 * scale - index * 30 * scale;
      const rowWidth = width - 28 * scale;
      const selected = selectedSet.has(hero.id);
      const row = this.host.addChildPlainNode(panel, `LobbyFormationCandidateButton_${hero.id}`, 0, y, rowWidth, 26 * scale);
      const rowGraphics = row.addComponent(Graphics);
      rowGraphics.fillColor = selected ? rgba(70, 20, 22, 190) : rgba(9, 9, 12, 112);
      rowGraphics.rect(-rowWidth / 2, -13 * scale, rowWidth, 26 * scale);
      rowGraphics.fill();
      rowGraphics.strokeColor = selected ? rgba(210, 152, 64, 190) : rgba(112, 83, 44, 120);
      rowGraphics.stroke();
      row.addComponent(Button);
      row.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
      this.host.applyImageButtonFeedback(row, 1.012, 0.988);
      const text = `${selected ? '已上阵' : hero.protagonist ? '队长' : safeText(hero.rarity)}  ${safeText(hero.heroName)}  Lv.${hero.level}  战力 ${formatInteger(hero.power)}`;
      const label = this.host.addChildLabel(row, `LobbyFormationCandidate_${index}`, text, -rowWidth / 2 + 12 * scale, 0, 17 * scale, selected ? rgba(246, 218, 156) : rgba(207, 188, 145), new Size(rowWidth - 24 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });
  }

  private renderStage13Battlefield(parent: Node, width: number, height: number, scale: number, state: LobbyHeroRosterPanelState, selectedHeroIds: number[]): void {
    // Stage 13C 战场站位区：在编队面板顶部显示 3x3 战场站位
    if (state.loading || state.heroes.length === 0) return;
    const battlefieldHeight = Math.min(180 * scale, height * 0.28);
    const battlefieldY = height / 2 - 132 * scale - battlefieldHeight / 2 - 8 * scale;
    const battlefieldWidth = width - 76 * scale;
    const slots = this.resolveSelectedSlots(state.heroes, selectedHeroIds);
    const battlefield = this.host.addChildPlainNode(parent, 'LobbyFormationStage13Battlefield', 0, battlefieldY, battlefieldWidth, battlefieldHeight);
    const graphics = battlefield.addComponent(Graphics);
    graphics.fillColor = rgba(6, 6, 9, 200);
    graphics.roundRect(-battlefieldWidth / 2, -battlefieldHeight / 2, battlefieldWidth, battlefieldHeight, 8 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(142, 106, 55, 150);
    graphics.stroke();
    const title = this.host.addChildLabel(battlefield, 'LobbyFormationStage13BattlefieldTitle', '战场站位', 0, battlefieldHeight / 2 - 16 * scale, 16 * scale, rgba(231, 205, 142), new Size(battlefieldWidth - 20 * scale, 20 * scale));
    title.overflow = Label.Overflow.SHRINK;
    // 3x3 站位
    const rows = 3, cols = 3;
    const slotSize = Math.min(48 * scale, (battlefieldWidth - 40 * scale) / cols - 8 * scale, (battlefieldHeight - 40 * scale) / rows - 6 * scale);
    const startY = battlefieldHeight / 2 - 40 * scale - slotSize / 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        const hero = slots[idx] || null;
        const sx = (col - 1) * (slotSize + 8 * scale);
        const sy = startY - row * (slotSize + 6 * scale);
        const slot = this.host.addChildPlainNode(battlefield, 'LobbyFormationStage13Slot_' + idx, sx, sy, slotSize, slotSize);
        const g = slot.addComponent(Graphics);
        g.fillColor = hero ? (hero.protagonist ? rgba(45, 12, 14, 220) : rgba(10, 10, 13, 198)) : rgba(6, 6, 8, 150);
        g.roundRect(-slotSize / 2, -slotSize / 2, slotSize, slotSize, 4 * scale);
        g.fill();
        g.strokeColor = hero?.protagonist ? rgba(226, 166, 72, 220) : hero ? rgba(132, 98, 52, 160) : rgba(80, 72, 58, 100);
        g.stroke();
        if (hero) {
          const heroName = safeText(hero.heroName || hero.heroCode || '英雄');
          const name = this.host.addChildLabel(slot, 'LobbyFormationStage13SlotName_' + idx, heroName.slice(0, 3), 0, 0, 12 * scale, rgba(246, 218, 156), new Size(slotSize - 4 * scale, 14 * scale));
          name.overflow = Label.Overflow.SHRINK;
        } else {
          const empty = this.host.addChildLabel(slot, 'LobbyFormationStage13SlotEmpty_' + idx, '空', 0, 0, 12 * scale, rgba(120, 108, 84), new Size(slotSize - 4 * scale, 14 * scale));
          empty.overflow = Label.Overflow.SHRINK;
        }
      }
    }
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
      : '点击候选英雄调整本次出战；阵容只用于 battle start 快照，不保存长期队伍，不改变玩家资源。';
    // 提示行上移到底部按钮上方,避免被三个按钮盖住(按钮中心 y=-h/2+38、高 60,顶到 y=-h/2+68)。
    const note = this.host.addChildLabel(parent, 'LobbyFormationBoundaryNote', noteText, 0, -height / 2 + 92 * scale, 17 * scale, powerShort ? rgba(255, 96, 96) : rgba(168, 146, 105), new Size(width - 110 * scale, 24 * scale));
    note.overflow = Label.Overflow.SHRINK;
    if (footerHidden) {
      // 从英雄界面进入:纯布阵场景,隐藏刷新/去升级/挑战三按钮。
      return;
    }
    const reload = this.addFooterButton(parent, 'LobbyFormationReloadButton', '刷新英雄', -226 * scale, -height / 2 + 38 * scale, 196 * scale, 60 * scale, scale);
    reload.on(Button.EventType.CLICK, () => this.host.reloadLobbyHeroRoster(), this);
    const grow = this.addFooterButton(parent, 'LobbyFormationGrowButton', power.enough ? '查看英雄' : '去升级', 0, -height / 2 + 38 * scale, 196 * scale, 60 * scale, scale, !state.loading && this.visibleHeroes(state.heroes).length > 0);
    if (!state.loading && this.visibleHeroes(state.heroes).length > 0) {
      grow.on(Button.EventType.CLICK, () => this.host.openLobbyHeroRosterPanel(), this);
    }
    const previewEnabled = this.canOpenBattlePreview(state, stageCode);
    const previewLabel = previewEnabled ? '挑战' : state.loading ? '读取中' : '不可出战';
    const preview = this.addFooterButton(parent, 'LobbyFormationBattlePreviewButton', previewLabel, 226 * scale, -height / 2 + 38 * scale, 196 * scale, 60 * scale, scale, previewEnabled);
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

  private drawPanelAtmosphere(parent: Node, width: number, height: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'LobbyFormationPanelAtmosphere', 0, 0, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(102, 15, 21, 40);
    graphics.rect(-width / 2 + 18 * scale, height / 2 - 94 * scale, width - 36 * scale, 48 * scale);
    graphics.fill();
  }

  private drawSectionFrame(graphics: Graphics, width: number, height: number, scale: number, fill: Color): void {
    graphics.fillColor = fill;
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(137, 100, 50, 136);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();
  }

  private drawDisabledButton(node: Node, width: number, height: number, scale: number): void {
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(24, 21, 18, 184);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(119, 91, 48, 148);
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
