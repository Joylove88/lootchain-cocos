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
  sp,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { safeText } from '../UiTextFormatter';
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
import { mountHeroAvatar } from './HeroHeadCrop';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';

const FORMATION_SPINE_RUNTIME_RETRY_DELAYS_MS = [180, 420, 900];
const FORMATION_BATTLE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame';
const FORMATION_CHECK_GOLD_ASSET = 'ui/formation/check_gold/spriteFrame';
// 2026-10-15 第五版(用户给参考图:「按照参考图调整,不需要左侧栏,需要的素材用 gpt 生成,1:1 还原」「不需要阵营,按职业分」):
// 素材全部按参考图局部让 GPT 逐件生成(ui/formation/ref/,原图在 素材原始备份/formation-ui-20261015/v5);
// 布局直接按参考图像素(1672×941)摆:u = 舞台高 / 941 换算成设计单位(比 16:9 更窄的屏再按宽收),
// 手机端字号由 addChildLabel 统一抬高。
const FORMATION_REF_H = 941;
const FORMATION_REF_MIN_W = 1500;
const REF_DIR = 'ui/formation/ref/';
const FR = {
  bg: `${REF_DIR}formation_bg/spriteFrame`,
  titlePlaque: `${REF_DIR}title_plaque/spriteFrame`,
  help: `${REF_DIR}btn_help/spriteFrame`,
  powerBanner: `${REF_DIR}power_banner/spriteFrame`,
  close: `${REF_DIR}btn_close/spriteFrame`,
  pedestal: `${REF_DIR}pedestal/spriteFrame`,
  nameplate: `${REF_DIR}nameplate/spriteFrame`,
  unequip: `${REF_DIR}btn_unequip/spriteFrame`,
  iconSwords: `${REF_DIR}icon_swords/spriteFrame`,
  panelFrame: `${REF_DIR}panel_frame/spriteFrame`,
  tabOn: `${REF_DIR}tab_on/spriteFrame`,
  tabOff: `${REF_DIR}tab_off/spriteFrame`,
  boxDark: `${REF_DIR}box_dark/spriteFrame`,
  btnSquare: `${REF_DIR}btn_square/spriteFrame`,
} as const;
/** 背景(用户 2026-10-15:「背景 UI 像之前那样」→ 换回第三版重画的大教堂,水晶在图宽 27.8% 处、左三分之二都亮)。 */
const FORMATION_BG_CRYSTAL_X = 0.278;
/** 背景最多放大到 1.2:再大水晶会占到三分之一屏高(用户嫌过);对不齐时英雄组就近。 */
const FORMATION_BG_MAX_SCALE = 1.2;
/** 职业图标(用户「不需要阵营,按职业分」):名牌第二行 + 英雄卡底行。 */
const FORMATION_CLASS_ICONS: Record<string, string> = {
  战士: `${REF_DIR}class_warrior/spriteFrame`,
  法师: `${REF_DIR}class_mage/spriteFrame`,
  刺客: `${REF_DIR}class_assassin/spriteFrame`,
  射手: `${REF_DIR}class_archer/spriteFrame`,
  辅助: `${REF_DIR}class_support/spriteFrame`,
  坦克: `${REF_DIR}class_tank/spriteFrame`,
};
// 星星:英雄详情的 star_filled/empty 亮区只占画布 68%、缩到 25px 后糊成一团(用户 2026-10-15),改用按参考图新出的星星(满画布)
const FORMATION_STAR_FILLED_ASSET = `${REF_DIR}star_on/spriteFrame`;
const FORMATION_STAR_EMPTY_ASSET = `${REF_DIR}star_off/spriteFrame`;
const FORMATION_CARD_FRAME_ASSETS: Record<string, string> = {
  UR: 'ui/formation/ai/card_frame_ur/spriteFrame',
  SSR: 'ui/formation/ai/card_frame_ssr/spriteFrame',
  SR: 'ui/formation/ai/card_frame_sr/spriteFrame',
  R: 'ui/formation/ai/card_frame_r/spriteFrame',
};
/** 卡框素材边长与九宫格内边(素材像素)。 */
const FORMATION_CARD_FRAME_PX = 256;
const FORMATION_CARD_FRAME_INSET = 34;
type FormationSortKey = 'quality' | 'power' | 'level' | 'star';
const FORMATION_SORT_OPTIONS: Array<{ key: FormationSortKey; label: string }> = [
  { key: 'quality', label: '品质' },
  { key: 'power', label: '战力' },
  { key: 'level', label: '等级' },
  { key: 'star', label: '星级' },
];
const FORMATION_RARITY_RANK: Record<string, number> = { UR: 4, SSR: 3, SR: 2, R: 1 };

/** 布局几何(面板坐标,原点 = 舞台中心);u = 参考图 1px 对应的设计单位。 */
interface FormationGeometry {
  u: number;
  /** 手机组件放大(标题行 / 站位 / 底部按钮):手机字号下限 20,按参考图等比缩到 720 设计高时三行名牌会挤,手机屏更宽,横向放得下。 */
  b: number;
  scale: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  panelBottom: number;
  heroesCenterX: number;
  /** 英雄组中心可取范围(4 个站位 + 名牌不出战场区)。 */
  heroesMinX: number;
  heroesMaxX: number;
  slotSpacing: number;
}

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
  // 右栏稀有度过滤 / 排序 / 卡片密度:跨重渲存活;右栏内的操作只局部重建右栏。
  private pickerRarityFilter: 'ALL' | 'UR' | 'SSR' | 'SR' | 'R' = 'ALL';
  private pickerSortKey: FormationSortKey = 'quality';
  private pickerSortAsc = false;
  private pickerDense = false;
  private pickerSortMenuOpen = false;
  private rebuildHeroPicker: (() => void) | null = null;
  private lastFormationSpineFailureReason = '资源解析失败';
  private geo: FormationGeometry = {
    u: 1, b: 1, scale: 1, left: 0, right: 0, top: 0, bottom: 0, panelLeft: 0, panelRight: 0, panelTop: 0, panelBottom: 0, heroesCenterX: 0, heroesMinX: 0, heroesMaxX: 0, slotSpacing: 0,
  };

  constructor(private readonly host: LobbyFormationPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyHeroRosterState();
    const selectedStageCode = this.host.currentLobbySelectedStageCode();
    const selectedHeroIds = this.host.currentLobbyFormationHeroIds();
    this.recordFormationDebugSnapshot(selectedStageCode, state, selectedHeroIds);
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const stageWidth = Math.max(320 * scale, layout.stageWidth);
    const stageHeight = Math.max(270 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const geo = this.resolveGeometry(stageWidth, stageHeight, scale);
    this.geo = geo;
    const bgAspect = 1672 / 941;
    const bgCover = layout.width / layout.height > bgAspect ? layout.width : layout.height * bgAspect;
    // 英雄组中心对准背景水晶(背景放大 4%、左缘贴屏):宽屏手机上不必为了对齐把背景放到很大;
    // 站位放不下(水晶太靠左 / 右)时才夹到可取范围,再由下面的放大公式补齐对位
    const crystalStageX = -layout.width / 2 + FORMATION_BG_CRYSTAL_X * bgCover * 1.04 - centerX;
    geo.heroesCenterX = Math.max(geo.heroesMinX, Math.min(crystalStageX, geo.heroesMaxX));

    const dim = this.createUiNode('LobbyFormationDim');
    // 背景层锚窗口中心(0,0)而非 stage 中心:stage 之外的边带也要被场景盖住。
    dim.setPosition(new Vec3(0, 0, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    // 背景:参考图同款大教堂(水晶在图宽 33%),等比铺满全窗口;放大到水晶能对准英雄站位中心(左右都不露底)
    const heroesFromScreenLeft = centerX + geo.heroesCenterX + layout.width / 2;
    const bgWidth = bgCover * Math.min(FORMATION_BG_MAX_SCALE, Math.max(1.04, heroesFromScreenLeft / (FORMATION_BG_CRYSTAL_X * bgCover)));
    const bgHeight = bgWidth / bgAspect;
    const wantX = centerX + geo.heroesCenterX - (FORMATION_BG_CRYSTAL_X - 0.5) * bgWidth;
    const bgX = Math.max(layout.width / 2 - bgWidth / 2, Math.min(wantX, -layout.width / 2 + bgWidth / 2));
    const dimGraphics = dim.addComponent(Graphics);
    // 旧背景水晶在图高 30% 处:垂直居中裁(顶对齐会把地面裁掉、水晶落到英雄身后)
    const bgY = 0;
    if (!this.host.addSprite('LobbyFormationSceneBgSprite', FR.bg, bgX, bgY, bgWidth, bgHeight, dim)
      && !this.host.addSprite('LobbyFormationSceneBgSprite', FORMATION_BATTLE_BG_ASSET, 0, 0, bgCover, bgCover / bgAspect, dim)) {
      dimGraphics.fillColor = rgba(10, 7, 8, 250);
      dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
      dimGraphics.fill();
    }
    // 极轻全局压暗(参考图背景本身就是暗调,只压一点让名牌 / 面板更跳)
    const veil = this.host.addChildPlainNode(dim, 'LobbyFormationSceneVeil', 0, 0, layout.width, layout.height);
    const veilGraphics = veil.addComponent(Graphics);
    veilGraphics.fillColor = rgba(6, 4, 6, 48);
    veilGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    veilGraphics.fill();
    // 功能页采用场景式导航，遮罩只阻断底层输入，不再承担点击关闭语义。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyFormationSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(stageWidth, stageHeight));
    // 面板内容区阻挡输入，避免点英雄槽时穿透遮罩关闭弹窗。
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(panelGroup, 'LobbyFormationSceneFrame', 0, 0, stageWidth, stageHeight);
    this.renderHeader(panel, state, selectedStageCode, selectedHeroIds);
    this.renderBody(panel, state, selectedHeroIds);
    this.renderCloseButton(panel);
  }

  /**
   * 参考图几何(1672×941):右栏 515 宽、距右缘 22、上 62 / 下 36;战场 = 左缘到右栏左缘,
   * 4 个站位一排(间距 262),站位中心比战场中点偏右 40(参考图英雄组中心 608 / 战场 0~1130)。
   */
  private resolveGeometry(stageWidth: number, stageHeight: number, scale: number): FormationGeometry {
    const u = Math.min(stageHeight / FORMATION_REF_H, stageWidth / FORMATION_REF_MIN_W);
    const b = isPhoneDesign() ? 1.3 : 1;
    const left = -stageWidth / 2;
    const right = stageWidth / 2;
    const top = stageHeight / 2;
    const bottom = -stageHeight / 2;
    const panelRight = right - 22 * u;
    const panelLeft = panelRight - 515 * u;
    const fieldRight = panelLeft - 5 * u;
    const slotSpacing = Math.min(262 * u * Math.min(b, 1.1), (fieldRight - left - 240 * u * b) / 3);
    const halfSpan = 1.5 * slotSpacing + 115 * u * b;
    const heroesMinX = left + halfSpan + 6 * u;
    const heroesMaxX = Math.max(heroesMinX, fieldRight - halfSpan);
    const heroesCenterX = Math.max(heroesMinX, Math.min((left + fieldRight) / 2 + 40 * u, heroesMaxX));
    return {
      u,
      b,
      scale,
      left,
      right,
      top,
      bottom,
      panelLeft,
      panelRight,
      panelTop: top - 62 * u,
      panelBottom: bottom + 36 * u,
      heroesCenterX,
      heroesMinX,
      heroesMaxX,
      slotSpacing,
    };
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

  /** 顶行(参考图 y=48):左上恶魔徽章标题牌「编队」+ 「?」说明钮;中间战力横匾(剑图标 / 阵容战力 / 数值 | 已上阵 n/4)。 */
  private renderHeader(parent: Node, state: LobbyHeroRosterPanelState, stageCode: string, selectedHeroIds: number[]): void {
    const g = this.geo;
    const u = g.u * g.b;
    const rowY = g.top - 48 * u;
    const plaqueH = 92 * u;
    const plaqueW = plaqueH * (564 / 180);
    const plaqueX = g.left + 10 * u + plaqueW / 2;
    const plaque = this.host.addChildPlainNode(parent, 'LobbyFormationTitlePlaque', plaqueX, rowY, plaqueW, plaqueH);
    if (!this.host.addSprite('Art', FR.titlePlaque, 0, 0, plaqueW, plaqueH, plaque)) {
      const pg = plaque.addComponent(Graphics);
      pg.fillColor = rgba(14, 10, 10, 228);
      pg.roundRect(-plaqueW / 2, -plaqueH * 0.3, plaqueW, plaqueH * 0.6, 6 * u);
      pg.fill();
    }
    // 匾面(去掉左侧徽章后的暗区)中心在素材宽 54% 处
    const title = this.host.addChildLabel(plaque, 'Title', '编队', plaqueW * 0.05, 0, 32 * u, rgba(244, 222, 176), new Size(plaqueW * 0.46, 44 * u));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    this.applyOutline(title, u, true);

    const helpSize = 44 * u;
    const helpX = plaqueX + plaqueW / 2 + 12 * u + helpSize / 2;
    const help = this.host.addChildPlainNode(parent, 'LobbyFormationHelpButton', helpX, rowY, helpSize, helpSize);
    if (!this.host.addSprite('Art', FR.help, 0, 0, helpSize, helpSize, help)) {
      const hg = help.addComponent(Graphics);
      hg.fillColor = rgba(16, 13, 12, 230);
      hg.circle(0, 0, helpSize / 2);
      hg.fill();
      hg.strokeColor = rgba(196, 156, 92, 220);
      hg.lineWidth = Math.max(1, 1.5 * u);
      hg.circle(0, 0, helpSize / 2);
      hg.stroke();
    }
    const q = this.host.addChildLabel(help, 'Label', '?', 0, u, 26 * u, rgba(228, 208, 168), new Size(helpSize, helpSize));
    q.isBold = true;
    help.addComponent(Button);
    help.on(Button.EventType.CLICK, () => this.toggleFormationHelp(parent), this);
    this.host.applyImageButtonFeedback(help, 1.06, 0.94);
    // 战力横匾:顶部正中(参考图 670~1120,贴右栏左侧),窄屏时不压「?」钮
    const bannerH = 66 * u;
    const bannerW = bannerH * (710 / 120);
    const bannerX = Math.max(helpX + helpSize / 2 + 18 * u + bannerW / 2, g.panelLeft - 14 * u - bannerW / 2);
    const power = this.host.currentLobbyFormationPowerSnapshot(stageCode);
    this.renderPowerBanner(parent, bannerX, rowY, bannerW, bannerH, u, power, this.host.isLobbyFormationFooterHidden?.() ?? false, selectedHeroIds.length);

    if (state.loading || state.error) {
      const statusText = state.loading ? '正在读取可上阵英雄...' : '英雄队列暂不可用，当前不能进入战斗。';
      const status = this.host.addChildLabel(parent, 'LobbyFormationStatus', statusText, g.heroesCenterX, g.top - 110 * u, 16 * u, state.error ? rgba(255, 150, 130, 235) : rgba(214, 190, 140, 230), new Size(640 * u, 24 * u));
      status.overflow = Label.Overflow.SHRINK;
    }
  }

  /** 「?」说明:半透明遮罩 + 金框说明卡,点任意处关闭。 */
  private toggleFormationHelp(parent: Node): void {
    const existing = parent.getChildByName('LobbyFormationHelpOverlay');
    if (existing && existing.isValid) {
      existing.destroy();
      return;
    }
    const g = this.geo;
    const u = g.u;
    const overlay = this.host.addChildPlainNode(parent, 'LobbyFormationHelpOverlay', 0, 0, g.right - g.left, g.top - g.bottom);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 150);
    og.rect(g.left, g.bottom, g.right - g.left, g.top - g.bottom);
    og.fill();
    const boxW = Math.min(680 * u, (g.right - g.left) * 0.8);
    const boxH = 330 * u;
    const k = boxW / 485;
    if (!this.addSliced(overlay, 'Frame', FR.panelFrame, 0, k, 500 * k, boxH + 50 * k, k, [50, 50, 70, 70])) {
      og.fillColor = rgba(14, 12, 12, 245);
      og.rect(-boxW / 2, -boxH / 2, boxW, boxH);
      og.fill();
    }
    const title = this.host.addChildLabel(overlay, 'Title', '编队说明', 0, boxH / 2 - 44 * u, 26 * u, rgba(244, 222, 176), new Size(boxW - 60 * u, 34 * u));
    title.isBold = true;
    this.applyOutline(title, u, true);
    const lines = [
      '· 守卫战最多上阵 4 名英雄，不分前后排。',
      '· 点右侧英雄卡上阵 / 下阵，已上阵的卡右上角有金色对勾。',
      '· 点名牌上的「×」或下方「下阵」可撤下该英雄。',
      '· 右栏底部可切换排序（品质 / 战力 / 等级 / 星级）、',
      '   升序 / 降序，以及大卡 / 小卡显示。',
    ];
    const body = this.host.addChildLabel(overlay, 'Body', lines.join('\n'), -boxW / 2 + 44 * u, -8 * u, 18 * u, rgba(226, 214, 192), new Size(boxW - 88 * u, boxH - 130 * u), HorizontalTextAlignment.LEFT);
    body.overflow = Label.Overflow.SHRINK;
    const hint = this.host.addChildLabel(overlay, 'Hint', '点击任意处关闭', 0, -boxH / 2 + 30 * u, 14 * u, rgba(170, 156, 130), new Size(boxW - 60 * u, 22 * u));
    hint.overflow = Label.Overflow.SHRINK;
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => {
      if (overlay.isValid) {
        overlay.destroy();
      }
    }, this);
  }

  private renderBody(parent: Node, state: LobbyHeroRosterPanelState, selectedHeroIds: number[]): void {
    if (state.loading && state.heroes.length === 0) {
      this.renderEmpty(parent, '正在读取英雄队列，请稍候。');
      return;
    }
    if (state.heroes.length === 0) {
      this.renderEmpty(parent, '暂无可展示英雄；请先获取英雄或刷新英雄队列。');
      return;
    }
    const slots = this.resolveSelectedSlots(state.heroes, selectedHeroIds);
    this.renderFormationBattlefield(parent, slots);
    this.renderFormationHeroPicker(parent, state.heroes, selectedHeroIds);
  }

  /** 战场:守卫战不分前后排,4 个站位一排(参考图脚底 y≈615,间距 262),英雄站在石台上,下面名牌 + 下阵钮。 */
  private renderFormationBattlefield(parent: Node, slots: Array<LobbyHeroItemVO | null>): void {
    const g = this.geo;
    const field = this.host.addChildPlainNode(parent, 'LobbyFormationBattlefieldScene', 0, 0, g.right - g.left, g.top - g.bottom);
    const feetY = g.bottom + (212 + 60 * g.b) * g.u;
    slots.forEach((hero, index) => {
      this.renderFormationSlot(field, hero ?? null, index, g.heroesCenterX + (index - 1.5) * g.slotSpacing, feetY);
    });
  }

  private renderFormationSlot(parent: Node, hero: LobbyHeroItemVO | null, index: number, x: number, feetY: number): void {
    const g = this.geo;
    const u = g.u * g.b;
    const slot = this.host.addChildPlainNode(parent, `LobbyFormationActorStand_${index}`, x, feetY, 240 * u, 40 * u);
    // 石台(金边 + 顶面金光):顶面椭圆中心约在素材高 26% 处,对到脚底
    const pedW = 222 * u;
    const pedH = pedW * (203 / 420);
    const pedestal = this.host.addSprite('LobbyFormationPedestal', FR.pedestal, 0, -pedH * 0.24, pedW, pedH, slot);
    if (pedestal) {
      if (!hero) {
        pedestal.node.addComponent(UIOpacity).opacity = 165;
      }
    } else {
      const pg = slot.addComponent(Graphics);
      pg.fillColor = rgba(20, 16, 14, 220);
      pg.ellipse(0, 0, pedW * 0.45, pedH * 0.22);
      pg.fill();
      pg.strokeColor = rgba(222, 176, 92, hero ? 230 : 120);
      pg.lineWidth = Math.max(1, 2 * u);
      pg.ellipse(0, 0, pedW * 0.45, pedH * 0.22);
      pg.stroke();
    }
    if (hero) {
      const standH = 380 * u;
      const standW = standH * 0.72;
      const actor = this.host.addChildPlainNode(slot, 'LobbyFormationActor', 0, standH * 0.42, standW, standH);
      this.renderFormationHeroSpinePreview(actor, hero, standW, standH, g.scale);
    } else {
      const plus = this.host.addChildLabel(slot, 'LobbyFormationSlotPlus', '+', 0, 64 * u, 48 * u, rgba(232, 200, 130, 170), new Size(60 * u, 60 * u));
      plus.overflow = Label.Overflow.SHRINK;
    }
    // 名牌(参考图 210×80,三行:稀有度 + Lv + ×;职业图标 + 名字;星级)
    const plateW = Math.min(224 * u, g.slotSpacing - 16 * u);
    const plateH = 84 * u;
    const plateY = -68 * u;
    const plate = this.host.addChildPlainNode(slot, 'LobbyFormationActorNameplate', 0, plateY, plateW, plateH);
    if (!this.host.addSprite('Art', FR.nameplate, 0, 0, plateW, plateH, plate)) {
      const pg = plate.addComponent(Graphics);
      pg.fillColor = rgba(14, 11, 10, 232);
      pg.roundRect(-plateW / 2, -plateH / 2, plateW, plateH, 6 * u);
      pg.fill();
      pg.strokeColor = rgba(196, 152, 82, 210);
      pg.lineWidth = Math.max(1, 1.2 * u);
      pg.roundRect(-plateW / 2, -plateH / 2, plateW, plateH, 6 * u);
      pg.stroke();
    }
    if (!hero) {
      const empty = this.host.addChildLabel(plate, 'LobbyFormationActorName', '空位', 0, 10 * u, 20 * u, rgba(196, 176, 136), new Size(plateW - 40 * u, 26 * u));
      empty.overflow = Label.Overflow.SHRINK;
      const tip = this.host.addChildLabel(plate, 'LobbyFormationActorSub', '点击右侧英雄上阵', 0, -14 * u, 14 * u, rgba(160, 146, 118), new Size(plateW - 40 * u, 20 * u));
      tip.overflow = Label.Overflow.SHRINK;
      return;
    }
    const rarity = safeText(hero.rarity).toUpperCase();
    const row1 = 24 * u;
    const row2 = 2 * u;
    const row3 = -20 * u;
    const rarityLabel = this.host.addChildLabel(plate, 'Rarity', rarity || '—', -plateW / 2 + 22 * u, row1, 20 * u, this.resolveRarityColor(rarity, 255), new Size(52 * u, 24 * u), HorizontalTextAlignment.LEFT);
    rarityLabel.overflow = Label.Overflow.SHRINK;
    rarityLabel.isBold = true;
    this.applyOutline(rarityLabel, u, true);
    const level = this.host.addChildLabel(plate, 'Level', `Lv.${hero.level}`, 2 * u, row1, 18 * u, rgba(236, 228, 210), new Size(90 * u, 24 * u));
    level.overflow = Label.Overflow.SHRINK;
    this.applyOutline(level, u, false);
    const remove = this.host.addChildPlainNode(plate, 'LobbyFormationActorRemove', plateW / 2 - 28 * u, row1, 32 * u, 28 * u);
    const cross = this.host.addChildLabel(remove, 'Label', '×', 0, u, 26 * u, rgba(208, 198, 180), new Size(32 * u, 30 * u));
    cross.overflow = Label.Overflow.SHRINK;
    remove.addComponent(Button);
    remove.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
    this.host.applyImageButtonFeedback(remove, 1.12, 0.9);
    const classIcon = this.resolveClassIcon(hero);
    if (classIcon) {
      this.host.addSprite('Class', classIcon, -plateW / 2 + 36 * u, row2, 36 * u, 36 * u, plate);
    }
    const name = this.host.addChildLabel(plate, 'LobbyFormationActorName', safeText(hero.heroName), 4 * u, row2, 17 * u, rgba(246, 230, 196), new Size(128 * u, 22 * u));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, u, false);
    this.renderStars(plate, 4 * u, row3, hero.star, 19 * u, 21 * u);
    // 下阵钮(参考图 120×36,名牌下方)
    const btnW = 122 * u;
    const btnH = 38 * u;
    const unequip = this.host.addChildPlainNode(slot, 'LobbyFormationActorUnequip', 0, -130 * u, btnW, btnH);
    if (!this.addSliced(unequip, 'Art', FR.unequip, 0, 0, btnW, btnH, btnH / 80, [18, 18, 18, 18])) {
      const ug = unequip.addComponent(Graphics);
      ug.fillColor = rgba(106, 20, 18, 238);
      ug.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 4 * u);
      ug.fill();
    }
    const unequipLabel = this.host.addChildLabel(unequip, 'Label', '下阵', 0, 0, 19 * u, rgba(255, 228, 206), new Size(btnW - 16 * u, btnH));
    unequipLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(unequipLabel, u, true);
    unequip.addComponent(Button);
    unequip.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
    this.host.applyImageButtonFeedback(unequip, 1.05, 0.95);
  }

  /** 5 颗星(实心 = 星级),居中排在 cx。 */
  private renderStars(parent: Node, cx: number, y: number, star: number, size: number, step: number): void {
    const filled = Math.max(0, Math.min(5, Math.floor(star || 0)));
    for (let i = 0; i < 5; i += 1) {
      const sx = cx + (i - 2) * step;
      const lit = i < filled;
      if (!this.host.addSprite(`Star_${i}`, lit ? FORMATION_STAR_FILLED_ASSET : FORMATION_STAR_EMPTY_ASSET, sx, y, size, size, parent)) {
        const dot = this.host.addChildPlainNode(parent, `StarDot_${i}`, sx, y, size, size);
        const dg = dot.addComponent(Graphics);
        dg.fillColor = lit ? rgba(255, 206, 92, 240) : rgba(90, 80, 70, 200);
        dg.circle(0, 0, size * 0.32);
        dg.fill();
      }
    }
  }

  private resolveClassIcon(hero: LobbyHeroItemVO): string | null {
    const key = safeText(hero.heroClass).trim();
    return FORMATION_CLASS_ICONS[key] ?? null;
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

  /**
   * 右栏(参考图 1135~1650 × 62~905):细金框面板 + 顶部宝石;标题「可出战英雄」+ 金卷草;稀有度页签;
   * 3 列英雄卡(135×185,可滚动);底部排序栏(升降序钮 / 品质下拉 / 大小卡切换)。右栏内操作只局部重建右栏。
   */
  private renderFormationHeroPicker(parent: Node, heroes: LobbyHeroItemVO[], selectedHeroIds: number[]): void {
    this.rebuildHeroPicker = () => {
      if (!parent.isValid) {
        return;
      }
      const stale = parent.getChildByName('LobbyFormationHeroPicker');
      if (stale && stale.isValid) {
        stale.destroy();
      }
      this.renderFormationHeroPicker(parent, heroes, selectedHeroIds);
      // 右上关闭钮压在面板角上,局部重建后要留在最上层
      parent.getChildByName('LobbyFormationCloseButton')?.setSiblingIndex(parent.children.length - 1);
    };
    const g = this.geo;
    const u = g.u;
    const pw = g.panelRight - g.panelLeft;
    const ph = g.panelTop - g.panelBottom;
    const panel = this.host.addChildPlainNode(parent, 'LobbyFormationHeroPicker', (g.panelLeft + g.panelRight) / 2, (g.panelTop + g.panelBottom) / 2, pw, ph);
    // 面板框素材 500×821(2026-10-15 按参考图重出,细金线):金线矩形在 (7..492, 24..795),上下宝石凸在线外 —— 金线矩形对齐面板矩形
    const k = pw / 485;
    if (!this.addSliced(panel, 'LobbyFormationPickerFrame', FR.panelFrame, 0, k, 500 * k, ph + 50 * k, k, [50, 50, 70, 70])) {
      const fg = panel.addComponent(Graphics);
      fg.fillColor = rgba(16, 15, 16, 238);
      fg.rect(-pw / 2, -ph / 2, pw, ph);
      fg.fill();
      fg.strokeColor = rgba(196, 152, 82, 220);
      fg.lineWidth = Math.max(1, 1.5 * u);
      fg.rect(-pw / 2, -ph / 2, pw, ph);
      fg.stroke();
    }
    const top = ph / 2;
    const bot = -ph / 2;
    const titleY = top - 40 * u;
    const title = this.host.addChildLabel(panel, 'LobbyFormationHeroPickerTitle', '可出战英雄', 0, titleY, 28 * u, rgba(244, 224, 182), new Size(200 * u, 36 * u));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    this.applyOutline(title, u, true);

    const tabs: Array<{ key: 'ALL' | 'UR' | 'SSR' | 'SR' | 'R'; label: string }> = [
      { key: 'ALL', label: '全部' },
      { key: 'UR', label: 'UR' },
      { key: 'SSR', label: 'SSR' },
      { key: 'SR', label: 'SR' },
      { key: 'R', label: 'R' },
    ];
    const tabY = top - 96 * u;
    const tabH = 42 * u;
    const tabsW = 467 * u;
    const tabGap = 8 * u;
    const tabW = (tabsW - tabGap * (tabs.length - 1)) / tabs.length;
    tabs.forEach((tab, tabIndex) => {
      const active = this.pickerRarityFilter === tab.key;
      const tabNode = this.host.addChildPlainNode(panel, `LobbyFormationRarityTab_${tab.key}`, -tabsW / 2 + tabW / 2 + tabIndex * (tabW + tabGap), tabY, tabW, tabH);
      if (!this.addSliced(tabNode, 'Art', active ? FR.tabOn : FR.tabOff, 0, 0, tabW, tabH, tabH / 64, [20, 20, 20, 20])) {
        const tg = tabNode.addComponent(Graphics);
        tg.fillColor = active ? rgba(120, 82, 36, 240) : rgba(28, 28, 30, 220);
        tg.roundRect(-tabW / 2, -tabH / 2, tabW, tabH, 6 * u);
        tg.fill();
      }
      const tabLabel = this.host.addChildLabel(tabNode, 'Label', tab.label, 0, 0, 18 * u, active ? rgba(255, 240, 206) : rgba(190, 184, 172), new Size(tabW - 8 * u, 26 * u));
      tabLabel.overflow = Label.Overflow.SHRINK;
      tabLabel.isBold = active;
      this.applyOutline(tabLabel, u, false);
      tabNode.addComponent(Button);
      tabNode.on(Button.EventType.CLICK, () => {
        if (this.pickerRarityFilter !== tab.key) {
          this.pickerRarityFilter = tab.key;
          this.pickerSortMenuOpen = false;
          this.rebuildHeroPicker?.();
        }
      }, this);
      this.host.applyImageButtonFeedback(tabNode, 1.04, 0.96);
    });
    const lineNode = this.host.addChildPlainNode(panel, 'LobbyFormationPickerLine', 0, top - 126 * u, tabsW, 2 * u);
    const lg = lineNode.addComponent(Graphics);
    lg.fillColor = rgba(150, 116, 62, 110);
    lg.rect(-tabsW / 2, -0.6 * u, tabsW, 1.2 * u);
    lg.fill();

    // 底部排序栏(参考图 y=853:左 60×52 方钮 / 中 286×52 下拉框 / 右 62×52 方钮)
    const barY = bot + 50 * u;
    const barH = 52 * u;
    this.renderPickerSortBar(panel, -pw / 2 + 55 * u, -pw / 2 + 240 * u, -pw / 2 + 453 * u, barY, barH);

    // 英雄卡网格
    const selectedSet = new Set(selectedHeroIds);
    const allVisible = this.visibleHeroes(heroes);
    const filtered = this.pickerRarityFilter === 'ALL'
      ? allVisible
      : allVisible.filter((hero) => safeText(hero.rarity).toUpperCase() === this.pickerRarityFilter);
    const visible = this.sortPickerHeroes(filtered, selectedSet);
    const gridTop = top - 138 * u;
    const gridBottom = barY + barH / 2 + 14 * u;
    const listHeight = Math.max(60 * u, gridTop - gridBottom);
    if (visible.length === 0) {
      const empty = this.host.addChildLabel(panel, 'LobbyFormationPickerEmpty', '该稀有度暂无可出战英雄。', 0, (gridTop + gridBottom) / 2, 17 * u, rgba(170, 152, 116), new Size(420 * u, 26 * u));
      empty.overflow = Label.Overflow.SHRINK;
    } else {
      const columns = this.pickerDense ? 4 : 3;
      const gapX = this.pickerDense ? 12 * u : 26 * u;
      const gapY = this.pickerDense ? 12 * u : 18 * u;
      const gridW = 457 * u;
      const cardW = (gridW - gapX * (columns - 1)) / columns;
      const cardH = cardW * (185 / 135);
      const rowStep = cardH + gapY;
      const listWidth = gridW + 16 * u;
      const listNode = this.host.addChildPlainNode(panel, 'LobbyFormationHeroPickerList', 0, gridBottom + listHeight / 2, listWidth, listHeight);
      listNode.addComponent(Mask);
      const padTop = 4 * u;
      const contentHeight = Math.max(listHeight, padTop + Math.ceil(visible.length / columns) * rowStep - gapY + 4 * u);
      const contentNode = this.host.addChildPlainNode(listNode, 'LobbyFormationHeroPickerListContent', 0, 0, listWidth, contentHeight);
      contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
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
        const cardX = -gridW / 2 + cardW / 2 + col * (cardW + gapX);
        const cardY = -padTop - cardH / 2 - row * rowStep;
        this.renderFormationHeroPickerCard(contentNode, hero, cardX, cardY, cardW, cardH, selectedSet.has(hero.id));
      });
    }
    if (this.pickerSortMenuOpen) {
      this.renderPickerSortMenu(panel, -pw / 2 + 240 * u, barY + barH / 2 + 6 * u);
    }
  }

  /** 已上阵置顶,其余按当前排序键(同值按战力降序)。 */
  private sortPickerHeroes(heroes: LobbyHeroItemVO[], selectedSet: Set<number>): LobbyHeroItemVO[] {
    const dir = this.pickerSortAsc ? 1 : -1;
    const keyOf = (hero: LobbyHeroItemVO): number => {
      switch (this.pickerSortKey) {
        case 'power':
          return hero.power || 0;
        case 'level':
          return hero.level || 0;
        case 'star':
          return hero.star || 0;
        default:
          return FORMATION_RARITY_RANK[safeText(hero.rarity).toUpperCase()] ?? 0;
      }
    };
    return heroes.slice().sort((a, b) => {
      const deployed = (selectedSet.has(b.id) ? 1 : 0) - (selectedSet.has(a.id) ? 1 : 0);
      if (deployed !== 0) {
        return deployed;
      }
      const diff = (keyOf(a) - keyOf(b)) * dir;
      return diff !== 0 ? diff : (b.power || 0) - (a.power || 0);
    });
  }

  private renderPickerSortBar(panel: Node, orderX: number, dropX: number, densityX: number, y: number, height: number): void {
    const u = this.geo.u;
    const gold = rgba(226, 186, 112, 240);
    // 升 / 降序钮:三道横线,降序上长下短
    const order = this.addPickerSquareButton(panel, 'LobbyFormationSortOrder', orderX, y, 60 * u, height);
    const og = this.host.addChildPlainNode(order, 'Icon', 0, 0, 30 * u, 26 * u).addComponent(Graphics);
    og.fillColor = gold;
    const lens = this.pickerSortAsc ? [10, 17, 24] : [24, 17, 10];
    lens.forEach((len, i) => {
      og.rect(-12 * u, 8 * u - i * 8 * u - 1.5 * u, len * u, 3 * u);
    });
    og.fill();
    og.rect(14 * u, -9 * u, 3 * u, 18 * u);
    og.fill();
    og.moveTo(10 * u, this.pickerSortAsc ? 6 * u : -6 * u);
    og.lineTo(21 * u, this.pickerSortAsc ? 6 * u : -6 * u);
    og.lineTo(15.5 * u, this.pickerSortAsc ? 12 * u : -12 * u);
    og.close();
    og.fill();
    order.on(Button.EventType.CLICK, () => {
      this.pickerSortAsc = !this.pickerSortAsc;
      this.pickerSortMenuOpen = false;
      this.rebuildHeroPicker?.();
    }, this);

    // 排序下拉框
    const dropW = 286 * u;
    const drop = this.host.addChildPlainNode(panel, 'LobbyFormationSortDropdown', dropX, y, dropW, height);
    if (!this.addSliced(drop, 'Art', FR.boxDark, 0, 0, dropW, height, height / 72, [20, 20, 20, 20])) {
      const dg = drop.addComponent(Graphics);
      dg.fillColor = rgba(14, 13, 14, 236);
      dg.roundRect(-dropW / 2, -height / 2, dropW, height, 6 * u);
      dg.fill();
    }
    const current = FORMATION_SORT_OPTIONS.find((option) => option.key === this.pickerSortKey) ?? FORMATION_SORT_OPTIONS[0];
    const dropLabel = this.host.addChildLabel(drop, 'Label', current.label, -dropW / 2 + 18 * u, 0, 20 * u, rgba(228, 218, 198), new Size(dropW - 70 * u, height - 8 * u), HorizontalTextAlignment.LEFT);
    dropLabel.overflow = Label.Overflow.SHRINK;
    const chevron = this.host.addChildPlainNode(drop, 'Chevron', dropW / 2 - 28 * u, 0, 20 * u, 14 * u).addComponent(Graphics);
    chevron.strokeColor = rgba(220, 210, 190, 230);
    chevron.lineWidth = Math.max(1.5, 2.4 * u);
    const up = this.pickerSortMenuOpen ? -1 : 1;
    chevron.moveTo(-8 * u, 4 * u * up);
    chevron.lineTo(0, -4 * u * up);
    chevron.lineTo(8 * u, 4 * u * up);
    chevron.stroke();
    drop.addComponent(Button);
    drop.on(Button.EventType.CLICK, () => {
      this.pickerSortMenuOpen = !this.pickerSortMenuOpen;
      this.rebuildHeroPicker?.();
    }, this);
    this.host.applyImageButtonFeedback(drop, 1.02, 0.98);

    // 大 / 小卡切换钮:三行列表图标(小卡模式时亮金)
    const density = this.addPickerSquareButton(panel, 'LobbyFormationCardDensity', densityX, y, 62 * u, height);
    const lgx = this.host.addChildPlainNode(density, 'Icon', 0, 0, 30 * u, 26 * u).addComponent(Graphics);
    lgx.fillColor = this.pickerDense ? rgba(255, 220, 140, 255) : rgba(214, 206, 190, 230);
    for (let i = 0; i < 3; i += 1) {
      const ly = 8 * u - i * 8 * u;
      lgx.rect(-13 * u, ly - 1.8 * u, 4 * u, 3.6 * u);
      lgx.rect(-6 * u, ly - 1.5 * u, 19 * u, 3 * u);
    }
    lgx.fill();
    density.on(Button.EventType.CLICK, () => {
      this.pickerDense = !this.pickerDense;
      this.pickerSortMenuOpen = false;
      this.rebuildHeroPicker?.();
    }, this);
  }

  private addPickerSquareButton(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
    const u = this.geo.u;
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    if (!this.addSliced(node, 'Art', FR.btnSquare, 0, 0, width, height, height / 96, [24, 24, 24, 24])) {
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(16, 15, 16, 236);
      g.roundRect(-width / 2, -height / 2, width, height, 6 * u);
      g.fill();
      g.strokeColor = rgba(176, 140, 80, 200);
      g.lineWidth = Math.max(1, 1.2 * u);
      g.roundRect(-width / 2, -height / 2, width, height, 6 * u);
      g.stroke();
    }
    node.addComponent(Button);
    this.host.applyImageButtonFeedback(node, 1.05, 0.95);
    return node;
  }

  /** 排序下拉选项:在下拉框上方展开一列。 */
  private renderPickerSortMenu(panel: Node, x: number, bottomY: number): void {
    const u = this.geo.u;
    const optW = 286 * u;
    const optH = 46 * u;
    const menuH = optH * FORMATION_SORT_OPTIONS.length + 10 * u;
    const menu = this.host.addChildPlainNode(panel, 'LobbyFormationSortMenu', x, bottomY + menuH / 2, optW, menuH);
    const mg = menu.addComponent(Graphics);
    mg.fillColor = rgba(12, 11, 12, 246);
    mg.roundRect(-optW / 2, -menuH / 2, optW, menuH, 6 * u);
    mg.fill();
    mg.strokeColor = rgba(176, 140, 80, 220);
    mg.lineWidth = Math.max(1, 1.2 * u);
    mg.roundRect(-optW / 2, -menuH / 2, optW, menuH, 6 * u);
    mg.stroke();
    menu.addComponent(BlockInputEvents);
    FORMATION_SORT_OPTIONS.forEach((option, index) => {
      const active = option.key === this.pickerSortKey;
      const oy = menuH / 2 - 5 * u - optH / 2 - index * optH;
      const item = this.host.addChildPlainNode(menu, `Option_${option.key}`, 0, oy, optW - 12 * u, optH - 6 * u);
      if (active && !this.addSliced(item, 'Art', FR.tabOn, 0, 0, optW - 12 * u, optH - 6 * u, (optH - 6 * u) / 64, [20, 20, 20, 20])) {
        const ig = item.addComponent(Graphics);
        ig.fillColor = rgba(120, 82, 36, 240);
        ig.roundRect(-(optW - 12 * u) / 2, -(optH - 6 * u) / 2, optW - 12 * u, optH - 6 * u, 5 * u);
        ig.fill();
      }
      const label = this.host.addChildLabel(item, 'Label', option.label, 0, 0, 19 * u, active ? rgba(255, 240, 206) : rgba(206, 198, 182), new Size(optW - 40 * u, optH - 8 * u));
      label.overflow = Label.Overflow.SHRINK;
      item.addComponent(Button);
      item.on(Button.EventType.CLICK, () => {
        this.pickerSortKey = option.key;
        this.pickerSortMenuOpen = false;
        this.rebuildHeroPicker?.();
      }, this);
    });
  }

  /**
   * 英雄卡(参考图 135×185):头像铺满,稀有度色框;左上稀有度、右上已上阵金勾;
   * 底部暗渐变上一行 Lv(左)+ 职业图标(中),最下一行 5 星。点卡上下阵。
   */
  private renderFormationHeroPickerCard(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, selected: boolean): void {
    // 卡片内单位:参考图卡宽 135(小卡模式等比缩小)
    const u = width / 135;
    const card = this.host.addChildPlainNode(parent, `LobbyFormationHeroCard_${hero.id}`, x, y, width, height);
    const rarity = safeText(hero.rarity).toUpperCase();
    const rarityColor = this.resolveRarityColor(rarity, 255);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 12, 245);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    const inset = width * 0.045;
    const innerW = width - inset * 2;
    const innerH = height - inset * 2;
    const avatarHolder = this.host.addChildPlainNode(card, 'Avatar', 0, 0, innerW, innerH);
    const ag = avatarHolder.addComponent(Graphics);
    ag.fillColor = rgba(Math.round(rarityColor.r * 0.3), Math.round(rarityColor.g * 0.3), Math.round(rarityColor.b * 0.3), 255);
    ag.rect(-innerW / 2, -innerH / 2, innerW, innerH);
    ag.fill();
    const glyph = this.host.addChildLabel(avatarHolder, 'Glyph', Array.from(safeText(hero.heroName))[0] ?? '?', 0, innerH * 0.1, innerW * 0.42, rgba(255, 244, 222), new Size(innerW, innerW));
    glyph.overflow = Label.Overflow.SHRINK;
    // 头像方图铺满(cover):边长取宽高较大者,顶对齐、水平居中,超出由 Mask 裁掉
    avatarHolder.addComponent(Mask);
    const side = Math.max(innerW, innerH);
    const square = this.host.addChildPlainNode(avatarHolder, 'Square', 0, innerH / 2 - side / 2, side, side);
    mountHeroAvatar(square, hero.heroCode, side, 'square', () => {
      if (glyph.node.isValid) {
        glyph.node.destroy();
      }
    });
    // 底部暗渐变(只覆盖 Lv / 职业行到卡底,逐 1.5 单位细条 smoothstep,无台阶)
    this.addBottomShade(card, innerW, height * 0.36, -innerH / 2, 205);
    const rarityTag = this.host.addChildLabel(card, 'Rarity', rarity || '—', -width / 2 + 9 * u, height / 2 - 17 * u, 19 * u, rarityColor, new Size(60 * u, 24 * u), HorizontalTextAlignment.LEFT);
    rarityTag.overflow = Label.Overflow.SHRINK;
    rarityTag.isBold = true;
    this.applyOutline(rarityTag, u, true);
    const rowY = -height / 2 + 46 * u;
    const level = this.host.addChildLabel(card, 'Level', `Lv.${hero.level}`, -width / 2 + 10 * u, rowY, 15 * u, rgba(228, 216, 192), new Size(78 * u, 22 * u), HorizontalTextAlignment.LEFT);
    level.overflow = Label.Overflow.SHRINK;
    this.applyOutline(level, u, false);
    const classIcon = this.resolveClassIcon(hero);
    if (classIcon) {
      this.host.addSprite('Class', classIcon, width / 2 - 24 * u, rowY + 3 * u, 38 * u, 38 * u, card);
    }
    this.renderStars(card, 0, -height / 2 + 22 * u, hero.star, 20 * u, 22 * u);
    // 稀有度卡框:在 256px 帧空间里九宫格拉伸到卡片比例,再整体缩放(角饰不变形)
    const frameK = width / FORMATION_CARD_FRAME_PX;
    const framePath = FORMATION_CARD_FRAME_ASSETS[rarity] ?? FORMATION_CARD_FRAME_ASSETS.R;
    if (!this.addSliced(card, 'Frame', framePath, 0, 0, width, height, frameK, [FORMATION_CARD_FRAME_INSET, FORMATION_CARD_FRAME_INSET, FORMATION_CARD_FRAME_INSET, FORMATION_CARD_FRAME_INSET])) {
      g.strokeColor = rarityColor;
      g.lineWidth = Math.max(1.5, 2 * u);
      g.rect(-width / 2, -height / 2, width, height);
      g.stroke();
    }
    if (selected) {
      const markSize = 30 * u;
      if (!this.host.addSprite('Check', FORMATION_CHECK_GOLD_ASSET, width / 2 - markSize * 0.62, height / 2 - markSize * 0.62, markSize, markSize, card)) {
        g.fillColor = rgba(232, 176, 64, 240);
        g.circle(width / 2 - markSize * 0.62, height / 2 - markSize * 0.62, markSize * 0.36);
        g.fill();
      }
    }
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, () => this.host.toggleLobbyFormationHero(hero.id), this);
    this.host.applyImageButtonFeedback(card, 1.03, 0.97);
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

  private renderEmpty(parent: Node, text: string): void {
    const g = this.geo;
    const u = g.u;
    const boxW = Math.min(620 * u, g.panelLeft - g.left - 40 * u);
    const box = this.host.addChildPlainNode(parent, 'LobbyFormationEmptyBox', g.heroesCenterX, 0, boxW, 120 * u);
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(9, 9, 12, 190);
    graphics.roundRect(-boxW / 2, -60 * u, boxW, 120 * u, 8 * u);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 150);
    graphics.lineWidth = Math.max(1, 1.2 * u);
    graphics.roundRect(-boxW / 2, -60 * u, boxW, 120 * u, 8 * u);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyFormationEmptyText', text, 0, 0, 20 * u, rgba(213, 193, 151), new Size(boxW - 48 * u, 48 * u));
    label.overflow = Label.Overflow.SHRINK;
  }

  /** 底部三钮(参考图 y=853,相对英雄组中心 -313 / -41 / +279):刷新英雄、查看英雄(暗金)+ 挑战(红)。 */
  /** 战力横匾:剑图标 / 阵容战力 / 数值 | 已上阵 n/4(素材 710×120,两端金饰各占宽 7.5%)。 */
  private renderPowerBanner(parent: Node, x: number, y: number, bannerW: number, bannerH: number, u: number, power: LobbyFormationPowerSnapshot, footerHidden: boolean, selectedCount: number): void {
    const banner = this.host.addChildPlainNode(parent, 'LobbyFormationPowerBanner', x, y, bannerW, bannerH);
    if (!this.host.addSprite('Art', FR.powerBanner, 0, 0, bannerW, bannerH, banner)) {
      const bg = banner.addComponent(Graphics);
      bg.fillColor = rgba(14, 10, 9, 228);
      bg.roundRect(-bannerW / 2, -bannerH * 0.32, bannerW, bannerH * 0.64, bannerH * 0.32);
      bg.fill();
    }
    const innerW = bannerW * 0.85;
    const x0 = -innerW / 2 + 6 * u;
    this.host.addSprite('Icon', FR.iconSwords, x0 + 13 * u, 0, 28 * u, 28 * u, banner);
    const caption = this.host.addChildLabel(banner, 'Caption', '阵容战力', x0 + 32 * u, 0, 17 * u, rgba(224, 210, 182), new Size(78 * u, 26 * u), HorizontalTextAlignment.LEFT);
    caption.overflow = Label.Overflow.SHRINK;
    const powerReady = power.rosterLoaded;
    const numberColor = !powerReady ? rgba(180, 162, 124, 255) : footerHidden || power.enough || power.recommendedPower <= 0 ? rgba(255, 216, 122, 255) : rgba(255, 168, 96, 255);
    const number = this.host.addChildLabel(banner, 'Number', powerReady ? formatInteger(power.currentPower) : '—', x0 + 114 * u, 0, 31 * u, numberColor, new Size(100 * u, 38 * u), HorizontalTextAlignment.LEFT);
    number.overflow = Label.Overflow.SHRINK;
    number.isBold = true;
    this.applyOutline(number, u, true);
    const divider = this.host.addChildPlainNode(banner, 'Divider', x0 + 222 * u, 0, 2 * u, 26 * u);
    const dg = divider.addComponent(Graphics);
    dg.fillColor = rgba(176, 146, 96, 170);
    dg.rect(-0.75 * u, -13 * u, 1.5 * u, 26 * u);
    dg.fill();
    const deployed = Math.min(4, selectedCount);
    const count = this.host.addChildLabel(banner, 'Deployed', `已上阵 ${deployed}/4`, x0 + 234 * u, 0, 17 * u, deployed >= 4 ? rgba(240, 226, 196) : rgba(206, 192, 164), new Size(innerW / 2 - (x0 + 234 * u), 26 * u), HorizontalTextAlignment.LEFT);
    count.overflow = Label.Overflow.SHRINK;
  }

  /** 右上圆形关闭钮(参考图 1622,48;压在右栏右上角)。 */
  private renderCloseButton(parent: Node): void {
    const g = this.geo;
    const u = g.u * g.b;
    const size = 66 * u;
    const button = this.host.addChildPlainNode(parent, 'LobbyFormationCloseButton', g.right - 50 * u, g.top - 48 * u, size, size);
    if (!this.host.addSprite('Art', FR.close, 0, 0, size, size, button)) {
      const cg = button.addComponent(Graphics);
      cg.fillColor = rgba(16, 13, 12, 236);
      cg.circle(0, 0, size * 0.42);
      cg.fill();
      cg.strokeColor = rgba(222, 180, 100, 240);
      cg.lineWidth = Math.max(1.5, 3 * u);
      cg.moveTo(-size * 0.16, -size * 0.16);
      cg.lineTo(size * 0.16, size * 0.16);
      cg.moveTo(-size * 0.16, size * 0.16);
      cg.lineTo(size * 0.16, -size * 0.16);
      cg.stroke();
    }
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => this.host.closeLobbyFormationPanel(), this);
    this.host.applyImageButtonFeedback(button, 1.06, 0.94);
  }

  /** 九宫格不变形缩放:节点按素材像素空间尺寸建(目标尺寸 / k),整体 setScale(k);insets = 左 / 右 / 上 / 下(素材像素)。 */
  private addSliced(parent: Node, name: string, path: string, x: number, y: number, width: number, height: number, k: number, insets: [number, number, number, number]): Sprite | null {
    const holder = this.host.addChildPlainNode(parent, name, x, y, width / k, height / k);
    holder.setScale(k, k, 1);
    const sprite = this.host.addSprite(`${name}Art`, path, 0, 0, width / k, height / k, holder);
    if (!sprite || !sprite.spriteFrame) {
      holder.destroy();
      return null;
    }
    const sf = sprite.spriteFrame;
    sf.insetLeft = insets[0];
    sf.insetRight = insets[1];
    sf.insetTop = insets[2];
    sf.insetBottom = insets[3];
    sprite.type = Sprite.Type.SLICED;
    return sprite;
  }

  /** 底部暗渐变:下 40% 恒定 maxAlpha,上 60% 按 smoothstep 逐细条淡出(细条 ≤1.5 单位,看不出台阶)。 */
  private addBottomShade(parent: Node, width: number, height: number, bottomY: number, maxAlpha: number): void {
    const node = this.host.addChildPlainNode(parent, 'Shade', 0, bottomY + height / 2, width, height);
    const g = node.addComponent(Graphics);
    const flat = height * 0.4;
    g.fillColor = rgba(4, 3, 6, maxAlpha);
    g.rect(-width / 2, -height / 2, width, flat);
    g.fill();
    const ramp = height - flat;
    const steps = Math.max(8, Math.ceil(ramp / 1.5));
    for (let i = 0; i < steps; i += 1) {
      const t = 1 - (i + 0.5) / steps;
      const alpha = Math.round(maxAlpha * t * t * (3 - 2 * t));
      if (alpha <= 0) {
        continue;
      }
      g.fillColor = rgba(4, 3, 6, alpha);
      g.rect(-width / 2, -height / 2 + flat + (ramp * i) / steps, width, ramp / steps);
      g.fill();
    }
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
  return String(numeric).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
