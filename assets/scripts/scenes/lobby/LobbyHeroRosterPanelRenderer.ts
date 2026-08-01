import {
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
  sp,
  Sprite,
  SpriteFrame,
  Texture2D,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { lootChainI18n } from '../../i18n/LootChainI18n';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { C1812_BUTTON_PRIMARY_ASSET, C1812_TAB_SELECTED_ASSET, starBandAssetOf, starBandTextRgb, starDisplayV3 } from '../C1812CommonUiAssets';
import { clamp, rgba, type UiLayout } from './LobbyHudTypes';

export const LOBBY_HERO_ROSTER_BACKDROP_ASSET = 'ui/hero-detail/hero_detail_backdrop/spriteFrame';
export const LOBBY_HERO_ROSTER_CARD_FRAME_ASSET = 'ui/hero-roster/hero_card_frame/spriteFrame';
export const LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET = 'ui/hero-roster/card_background/Nuu_Illust';
export const LOBBY_HERO_ROSTER_CARD_ASSETS = [
  LOBBY_HERO_ROSTER_CARD_FRAME_ASSET,
];

const HERO_FILTER_ALL = '全部';
const HERO_CLASS_FILTER_ORDER = ['战士', '辅助', '刺客', '法师', '射手', '坦克'];
const HERO_CLASS_KEY_ALIASES: Record<string, string> = {
  '战士': '战士',
  '戰士': '战士',
  '鎴樺+': '战士',
  Warrior: '战士',
  warrior: '战士',
  '辅助': '辅助',
  '輔助': '辅助',
  '杈呭姪': '辅助',
  Support: '辅助',
  support: '辅助',
  '刺客': '刺客',
  '鍒哄': '刺客',
  Assassin: '刺客',
  assassin: '刺客',
  '法师': '法师',
  '法師': '法师',
  '娉曞笀': '法师',
  Mage: '法师',
  mage: '法师',
  '射手': '射手',
  '灏勬墜': '射手',
  Marksman: '射手',
  marksman: '射手',
  '坦克': '坦克',
  '鍧﹀厠': '坦克',
  Tank: '坦克',
  tank: '坦克',
};
const HERO_ROSTER_CARD_ASPECT_WIDTH = 937;
const HERO_ROSTER_CARD_ASPECT_HEIGHT = 1676;
const HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE = 1.2;
const HERO_ROSTER_CARD_MAX_COLUMNS = 5;
const HERO_ROSTER_CARD_DESKTOP_TARGET_HEIGHT = 468;
const HERO_ROSTER_CARD_DESKTOP_MAX_HEIGHT = 492;
const HERO_ROSTER_CARD_COMPACT_TARGET_HEIGHT = 310;
const HERO_ROSTER_CARD_COMPACT_MAX_HEIGHT = 340;
const HERO_ROSTER_CARD_LEFT_INSET = 12;
const HERO_ROSTER_CARD_TOP_INSET = 14;
const HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING = 62;
const HERO_ROSTER_CARD_LEVEL_X_RATIO = -0.38;
const HERO_ROSTER_CARD_LEVEL_Y_RATIO = 0.38;
const HERO_ROSTER_CARD_LEVEL_TEXT_WIDTH_RATIO = 0.29;
const HERO_ROSTER_CARD_BADGE_X_RATIO = 0.37;
const HERO_ROSTER_CARD_BADGE_Y_RATIO = 0.38;
const HERO_ROSTER_CARD_BADGE_SIZE_RATIO = 0.17;
const HERO_ROSTER_CARD_BACKGROUND_WIDTH_RATIO = 1;
const HERO_ROSTER_CARD_BACKGROUND_HEIGHT_RATIO = 0.5;
const HERO_ROSTER_CARD_BACKGROUND_Y_RATIO = 0.02;
const HERO_ROSTER_CARD_BACKGROUND_MASK_WIDTH_RATIO = 0.92;
const HERO_ROSTER_CARD_BACKGROUND_MASK_HEIGHT_RATIO = 0.74;
const HERO_ROSTER_CARD_BACKGROUND_MASK_Y_RATIO = 0.15;
const HERO_ROSTER_CARD_BACKGROUND_NUU_VISIBLE_HEIGHT_RATIO = 0.5;
const HERO_ROSTER_CARD_BACKGROUND_MATCHED_VISIBLE_HEIGHT_RATIO = 0.58;
const HERO_ROSTER_CARD_BACKGROUND_MAX_DISPLAY_HEIGHT_RATIO = 1.06;
const HERO_ROSTER_CARD_BACKGROUND_MIN_VISIBLE_ALPHA_RATIO = 0.56;
const HERO_ROSTER_CARD_BACKGROUND_NPC_PREFIX = 'ui/hero-roster/card_background/npc_';
const HERO_ROSTER_CARD_BACKGROUND_NPC_VISIBLE_HEIGHT_RATIO = 0.58;
const HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_HEIGHT_RATIO = 0.74;
const HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_WIDTH_RATIO = 0.96;
const HERO_ROSTER_CARD_BACKGROUND_VISIBLE_HEIGHT_RATIOS: Record<string, number> = {
  'ui/hero-roster/card_background/Belladonna_Illust': 0.635,
  'ui/hero-roster/card_background/Carmilla_center': 0.93,
  'ui/hero-roster/card_background/Eulenspigel_Illust': 0.603,
  'ui/hero-roster/card_background/HeylelS01_Illust': 0.604,
  'ui/hero-roster/card_background/Ishmael_center': 0.958,
  'ui/hero-roster/card_background/IshmaelA_Illust': 0.739,
  'ui/hero-roster/card_background/LucienA_Illust': 0.768,
  'ui/hero-roster/card_background/Lucrecia_Illust': 0.567,
  'ui/hero-roster/card_background/Nuu_Illust': 1,
  'ui/hero-roster/card_background/Sphinx_Illust': 0.729,
};
const HERO_ROSTER_CARD_BACKGROUND_FOCUS_X_RATIOS: Record<string, number> = {
  'ui/hero-roster/card_background/Belladonna_Illust': -0.075,
  'ui/hero-roster/card_background/Carmilla_center': -0.022,
  'ui/hero-roster/card_background/Eulenspigel_Illust': -0.058,
  'ui/hero-roster/card_background/HeylelS01_Illust': -0.024,
  'ui/hero-roster/card_background/Ishmael_center': 0.068,
  'ui/hero-roster/card_background/IshmaelA_Illust': 0.06,
  'ui/hero-roster/card_background/LucienA_Illust': -0.011,
  'ui/hero-roster/card_background/Lucrecia_Illust': 0.174,
  'ui/hero-roster/card_background/Sphinx_Illust': 0.102,
};
const HERO_ROSTER_BORDER_EFFECT_RESOURCE = 'spine/ui/hero-roster/goods_1_border/goods_1';
const HERO_ROSTER_BORDER_ANIMATION_BY_RARITY: Record<string, string> = {
  R: 'K3',
  SR: 'K4',
  SSR: 'K5',
  UR: 'K7',
};
const HERO_ROSTER_UR_SEQUENCE_BORDER_PATH_PREFIX = 'ui/hero-roster/UR-card-border';
const HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_COUNT = 12;
const HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_DURATION_SECONDS = 0.07;
// 仅 SSR/UR 保留动画 spine 边框;R/SR 降级为静态描边(性能优化)。
const HERO_ROSTER_ANIMATED_BORDER_RARITIES = new Set(['SSR', 'UR']);
// SSR/UR 边框 spine 分帧实例化步长:相邻槽位骨骼创建间隔,错峰摊平首帧尖峰。
const HERO_ROSTER_BORDER_SPINE_STAGGER_SECONDS = 0.05;
// 卡片分帧构建:首屏至少同步建这么多张(保证打开即有内容),其余按批错峰,消除"进入时"整墙同帧构建的卡顿。
const HERO_ROSTER_CARD_INITIAL_SYNC_MIN = 4;
const HERO_ROSTER_CARD_DEFER_BATCH = 3;
const HERO_ROSTER_CARD_DEFER_STEP_SECONDS = 0.032;
const HERO_ROSTER_UR_SEQUENCE_BORDER_ALPHA = 255;
const HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO = 1.25;
const HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO = 1.25;
const HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO = -0.01;
const HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_PATHS = Array.from(
  { length: HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_COUNT },
  (_, index) => `${HERO_ROSTER_UR_SEQUENCE_BORDER_PATH_PREFIX}/${String(index + 1).padStart(2, '0')}/spriteFrame`,
);
const HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 33;
const HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING = 61;
const HERO_ROSTER_GOODS_BORDER_Y_RATIO = -0.03;
const HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8;
const HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.324;
const HERO_ROSTER_CARD_NAME_Y_RATIO = 0.18;
const HERO_ROSTER_CARD_STARS_Y_RATIO = 0.13;
const HERO_ROSTER_RARITY_DISPLAY_ORDER: Record<string, number> = {
  UR: 0,
  SSR: 1,
  SR: 2,
  R: 3,
};

const USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false;

export interface LobbyHeroRosterPanelHost {
  node: Node;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  closeLobbyHeroRosterPanel(): void;
  reloadLobbyHeroRoster(): void;
  openLobbyFormationPanel(stageCode?: string, origin?: string): void;
  refreshLobbyOverlay?(): void;
  openLobbyHeroDetail(heroId: number): void;
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
    contentSize?: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

/** 大厅英雄队列只读面板。参考竖卡英雄墙排版，但保持当前阶段无养成写入口。 */
export class LobbyHeroRosterPanelRenderer {
  private selectedHeroClass = HERO_FILTER_ALL;
  // 边框光效 spine 的分帧实例化槽位:每次名册重建时归零,SSR/UR 卡按槽位错峰创建骨骼,
  // 避免一帧内集中实例化多张 spine 造成开面板卡顿(R/SR 已降级为静态描边,不占 spine)。
  private borderSpineStaggerSlot = 0;
  private borderEffectData: sp.SkeletonData | null = null;
  private borderEffectLoading = false;
  private readonly borderEffectCallbacks: Array<(data: sp.SkeletonData | null) => void> = [];
  private urSequenceBorderFrames: SpriteFrame[] | null = null;
  private urSequenceBorderLoading = false;
  private urSequenceBorderLoadFailed = false;
  private readonly urSequenceBorderCallbacks: Array<(frames: SpriteFrame[] | null) => void> = [];
  private readonly cardBackgroundFrames = new Map<string, SpriteFrame>();
  private readonly cardBackgroundLoadCallbacks = new Map<string, Array<(frame: SpriteFrame | null) => void>>();
  private readonly missingCardBackgroundLogs = new Set<string>();

  constructor(private readonly host: LobbyHeroRosterPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyHeroRosterState();
    const scale = clamp(layout.uiScale, 0.62, 1);
    const panelWidth = Math.max(320 * scale, layout.stageWidth);
    const panelHeight = Math.max(280 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.createUiNode('LobbyHeroRosterDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyHeroRosterSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);

    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyHeroRosterSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(4, 5, 7, 236),
      rgba(0, 0, 0, 0),
      14 * scale,
    );
    if (!this.host.addSprite('LobbyHeroRosterBackdropSprite', LOBBY_HERO_ROSTER_BACKDROP_ASSET, 0, 0, panelWidth, panelHeight, panel)) {
      this.drawFallbackBackdrop(panel, panelWidth, panelHeight, scale);
    }
    this.drawSceneShade(panel, panelWidth, panelHeight, scale);
    this.renderTopBar(panel, panelWidth, panelHeight, scale, state);
    const filterTabs = this.resolveHeroFilterTabs(state.heroes, state.heroClassOptions);
    this.ensureSelectedHeroClass(filterTabs);
    const filterMetrics = this.renderFilterRail(panel, panelWidth, panelHeight, scale, filterTabs);
    this.renderHeroBody(panel, panelWidth, panelHeight, scale, state, filterMetrics);
    this.renderUpgradeDock(panel, panelWidth, panelHeight, scale);
    this.renderFooter(panel, panelWidth, panelHeight, scale);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyHeroRosterBackButton', () => this.host.closeLobbyHeroRosterPanel(), scale, '英雄');
  }

  // 面板复用内容签名:凡是会影响渲染结果的输入都纳入(筛选/加载态/英雄逐项数据/职业选项)。
  // 签名不变 = 面板内容完全一致,可原样复用;宁可多算字段(多重建)也不可漏字段(露旧数据)。
  currentContentSignature(): string {
    const state = this.host.currentLobbyHeroRosterState();
    const flags = `${state.loaded ? 1 : 0}${state.loading ? 1 : 0}${state.error ? 1 : 0}`;
    const options = (state.heroClassOptions ?? []).join('/');
    const heroes = state.heroes
      .map((hero) => [
        hero.id,
        hero.level,
        hero.star,
        hero.power,
        hero.rarity,
        hero.heroClass ?? '',
        safeText(hero.heroName),
        hero.cardBackgroundAsset ?? '',
        hero.protagonist ? 1 : 0,
      ].join(':'))
      .join(',');
    return `${this.selectedHeroClass}|${flags}|${options}|${state.heroes.length}|${heroes}`;
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private renderTopBar(parent: Node, width: number, height: number, scale: number, state: LobbyHeroRosterPanelState): void {
    const y = height / 2 - 42 * scale;
    // 顶右胶囊让位右上关闭按钮(关闭钮占 stageRight-58 一带)。
    const topBarRightInset = 118 * scale;
    const topBarLeftReserve = -width / 2 + 170 * scale;
    const right = width / 2 - topBarRightInset;
    const compact = width < 760 * scale;
    const power = state.heroes.reduce((sum, hero) => sum + Math.max(0, Number(hero.power) || 0), 0);
    const capsules = compact ? [
      { name: 'Owned', text: `拥有 ${state.heroes.length}`, width: 116 * scale, interactive: false },
      { name: 'Readonly', text: '只读', width: 76 * scale, interactive: false },
    ] : [
      { name: 'Owned', text: `拥有 ${state.heroes.length}`, width: 116 * scale, interactive: false },
      { name: 'Power', text: `战力 ${formatCompactInteger(power)}`, width: 152 * scale, interactive: false },
      { name: 'Readonly', text: '只读', width: 76 * scale, interactive: false },
    ];
    let cursorX = right;
    for (let index = capsules.length - 1; index >= 0; index -= 1) {
      const item = capsules[index];
      this.addTopCapsule(parent, `LobbyHeroRosterTop${item.name}`, item.text, cursorX - item.width / 2, y, item.width, 30 * scale, scale);
      cursorX -= item.width + 8 * scale;
    }

    const reloadWidth = 86 * scale;
    if (cursorX - reloadWidth < topBarLeftReserve) {
      return;
    }
    const reload = this.addTopCapsule(parent, 'LobbyHeroRosterReloadButton', '刷新', cursorX - reloadWidth / 2, y, reloadWidth, 30 * scale, scale, true);
    reload.addComponent(Button);
    reload.on(Button.EventType.CLICK, () => this.host.reloadLobbyHeroRoster(), this);
    this.host.applyImageButtonFeedback(reload, 1.025, 0.97);

    if (compact) {
      return;
    }
    const statusText = state.loading ? '读取中' : state.error ? '读取失败' : state.loaded ? '已同步' : '待同步';
    const statusWidth = 94 * scale;
    const statusX = cursorX - reloadWidth - 60 * scale;
    if (statusX - statusWidth / 2 < topBarLeftReserve) {
      return;
    }
    const status = this.host.addChildLabel(
      parent,
      'LobbyHeroRosterStatus',
      statusText,
      statusX,
      y, 17 * scale,
      state.error ? rgba(238, 116, 92) : rgba(213, 191, 137),
      new Size(statusWidth, 24 * scale),
    );
    status.overflow = Label.Overflow.SHRINK;
  }

  private addTopCapsule(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number, active = false): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = active ? rgba(54, 38, 24, 218) : rgba(14, 14, 18, 202);
    this.traceSlantRect(graphics, width, height, 8 * scale);
    graphics.fill();
    graphics.strokeColor = active ? rgba(226, 176, 83, 206) : rgba(112, 92, 58, 150);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    this.traceSlantRect(graphics, width, height, 8 * scale);
    graphics.stroke();
    const label = this.host.addChildLabel(node, `${name}Label`, text, 0, 0, 16 * scale, rgba(238, 218, 166), new Size(width - 12 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
    return node;
  }

  private renderFilterRail(parent: Node, width: number, height: number, scale: number, tabs: string[]): { railWidth: number; railHeight: number; horizontal: boolean } {
    const horizontal = width < 720 * scale || height < 430 * scale;
    if (horizontal) {
      return this.renderHorizontalFilters(parent, width, height, scale, tabs);
    }
    const railWidth = clamp(width * 0.14, 126 * scale, 168 * scale);
    const railHeight = Math.min(height - 138 * scale, 370 * scale);
    const railX = -width / 2 + railWidth / 2 + 30 * scale;
    const railY = height / 2 - 116 * scale - railHeight / 2;
    const rail = this.host.addChildPlainNode(parent, 'LobbyHeroRosterFilterRail', railX, railY, railWidth, railHeight);
    const graphics = rail.addComponent(Graphics);
    graphics.fillColor = rgba(7, 7, 10, 154);
    graphics.rect(-railWidth / 2, -railHeight / 2, railWidth, railHeight);
    graphics.fill();
    graphics.strokeColor = rgba(117, 90, 58, 102);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(railWidth / 2, railHeight / 2);
    graphics.lineTo(railWidth / 2, -railHeight / 2);
    graphics.stroke();

    const tabHeight = Math.min(54 * scale, railHeight / Math.max(1, tabs.length));
    const top = railHeight / 2 - tabHeight / 2;
    tabs.forEach((tab, index) => {
      this.renderFilterTab(rail, index, tab, 0, top - index * tabHeight, railWidth, tabHeight, scale, this.isHeroClassTabActive(tab), false);
    });
    return { railWidth: railWidth + 46 * scale, railHeight, horizontal: false };
  }

  private renderHorizontalFilters(parent: Node, width: number, height: number, scale: number, tabs: string[]): { railWidth: number; railHeight: number; horizontal: boolean } {
    const railWidth = width - 56 * scale;
    const railHeight = 46 * scale;
    const rail = this.host.addChildPlainNode(parent, 'LobbyHeroRosterFilterRail', 0, height / 2 - 92 * scale, railWidth, railHeight);
    const tabWidth = railWidth / Math.max(1, tabs.length);
    tabs.forEach((tab, index) => {
      this.renderFilterTab(rail, index, tab, -railWidth / 2 + tabWidth / 2 + index * tabWidth, 0, tabWidth - 4 * scale, railHeight - 4 * scale, scale, this.isHeroClassTabActive(tab), true);
    });
    return { railWidth: 0, railHeight: railHeight + 18 * scale, horizontal: true };
  }

  private renderFilterTab(parent: Node, index: number, text: string, x: number, y: number, width: number, height: number, scale: number, active: boolean, horizontal: boolean): void {
    const tab = this.host.addChildPlainNode(parent, `LobbyHeroRosterFilterTab_${index}`, x, y, width, height);
    tab.addComponent(Button);
    tab.on(Button.EventType.CLICK, () => this.selectHeroClassFilter(text), this);
    this.host.applyImageButtonFeedback(tab, 1.025, 0.97);
    // 选中背景按素材原比例(400×116)整图显示:SLICED 在窄栏里会把翼饰压成一条线。
    const tabArtWidth = Math.max(width * 1.45, height * (400 / 170) * 1.15);
    const tabArtHeight = tabArtWidth * (170 / 400);
    const tabArt = active ? this.host.addSprite(`LobbyHeroRosterFilterTabArt_${index}`, C1812_TAB_SELECTED_ASSET, 0, 0, tabArtWidth, tabArtHeight, tab) : null;
    if (tabArt) {
      void 0;
    } else {
      const graphics = tab.addComponent(Graphics);
      graphics.fillColor = active ? rgba(82, 55, 31, 218) : rgba(10, 10, 13, horizontal ? 142 : 118);
      this.traceSlantRect(graphics, width, height, active ? 9 * scale : 5 * scale);
      graphics.fill();
      graphics.strokeColor = active ? rgba(232, 177, 82, 206) : rgba(87, 73, 55, 92);
      graphics.lineWidth = Math.max(1, active ? 1.4 * scale : 1 * scale);
      this.traceSlantRect(graphics, width, height, active ? 9 * scale : 5 * scale);
      graphics.stroke();
      if (active && !horizontal) {
        graphics.fillColor = rgba(230, 180, 82, 214);
        graphics.moveTo(width / 2 - 4 * scale, 0);
        graphics.lineTo(width / 2 + 8 * scale, 9 * scale);
        graphics.lineTo(width / 2 + 8 * scale, -9 * scale);
        graphics.close();
        graphics.fill();
      }
    }
    const label = this.host.addChildLabel(tab, 'LobbyHeroRosterFilterLabel', text, 0, 0, 19 * scale, active ? rgba(252, 226, 164) : rgba(158, 146, 125), new Size(width - 12 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    if (!tabArt) {
      this.applyOutline(label, scale, active);
    }
  }

  private selectHeroClassFilter(text: string): void {
    if (this.isHeroClassTabActive(text)) {
      return;
    }
    this.selectedHeroClass = text;
    if (this.host.refreshLobbyOverlay) {
      this.host.refreshLobbyOverlay();
      return;
    }
    this.host.reloadLobbyHeroRoster();
  }

  private renderHeroBody(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    state: LobbyHeroRosterPanelState,
    filterMetrics: { railWidth: number; railHeight: number; horizontal: boolean },
  ): void {
    const bodyLeft = -width / 2 + 32 * scale + filterMetrics.railWidth;
    const bodyRight = width / 2 - 42 * scale;
    const bodyTop = height / 2 - (filterMetrics.horizontal ? 138 : 102) * scale;
    const bodyBottom = -height / 2 + 118 * scale;
    const bodyWidth = Math.max(180 * scale, bodyRight - bodyLeft);
    const bodyHeight = Math.max(110 * scale, bodyTop - bodyBottom);
    const bodyCenterX = (bodyLeft + bodyRight) / 2;
    const bodyCenterY = (bodyTop + bodyBottom) / 2;

    this.drawCardStage(parent, bodyCenterX, bodyCenterY, bodyWidth, bodyHeight, scale);

    if (state.loading && state.heroes.length === 0) {
      this.renderEmpty(parent, bodyCenterX, bodyCenterY, bodyWidth, bodyHeight, scale, '英雄队列读取中，请稍候。');
      return;
    }
    if (state.heroes.length === 0) {
      this.renderEmpty(parent, bodyCenterX, bodyCenterY, bodyWidth, bodyHeight, scale, '当前暂无可展示的已拥有英雄。');
      return;
    }

    const displayHeroes = this.filterHeroesBySelectedClass(this.sortHeroesForRosterDisplay(state.heroes));
    if (displayHeroes.length === 0) {
      this.renderEmpty(parent, bodyCenterX, bodyCenterY, bodyWidth, bodyHeight, scale, '暂无该职业英雄');
      return;
    }
    const gap = (filterMetrics.horizontal ? 10 : 16) * scale;
    const rowGap = (filterMetrics.horizontal ? 14 : 20) * scale;
    const preferredCardHeight = filterMetrics.horizontal
      ? Math.min(HERO_ROSTER_CARD_COMPACT_TARGET_HEIGHT * scale, bodyHeight * 0.98)
      : Math.min(HERO_ROSTER_CARD_DESKTOP_TARGET_HEIGHT * scale, bodyHeight * 0.99);
    const cardHeight = clamp(preferredCardHeight, 168 * scale, (filterMetrics.horizontal ? HERO_ROSTER_CARD_COMPACT_MAX_HEIGHT : HERO_ROSTER_CARD_DESKTOP_MAX_HEIGHT) * scale);
    const maxCardsInRow = Math.max(1, Math.min(displayHeroes.length, HERO_ROSTER_CARD_MAX_COLUMNS));
    const maxCardWidthForRow = Math.max(96 * scale, (bodyWidth - HERO_ROSTER_CARD_LEFT_INSET * scale * 2 - gap * Math.max(0, maxCardsInRow - 1)) / maxCardsInRow);
    const cardWidth = Math.min(cardHeight * HERO_ROSTER_CARD_ASPECT_WIDTH / HERO_ROSTER_CARD_ASPECT_HEIGHT * HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE, maxCardWidthForRow);
    const columns = Math.max(1, Math.min(maxCardsInRow, Math.floor((bodyWidth + gap) / (cardWidth + gap))));
    const cardInsetX = HERO_ROSTER_CARD_LEFT_INSET * scale;
    const cardInsetY = HERO_ROSTER_CARD_TOP_INSET * scale;
    const scrollEffectTopPadding = HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING * scale;
    const viewportHeight = bodyHeight + scrollEffectTopPadding;
    const viewportCenterY = bodyCenterY + scrollEffectTopPadding / 2;
    const rows = Math.max(1, Math.ceil(displayHeroes.length / columns));
    const contentHeight = Math.max(viewportHeight, rows * cardHeight + Math.max(0, rows - 1) * rowGap + cardInsetY * 2 + scrollEffectTopPadding);
    const viewport = this.host.addChildPlainNode(parent, 'LobbyHeroRosterScrollView', bodyCenterX, viewportCenterY, bodyWidth, viewportHeight);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;
    const content = this.host.addChildPlainNode(viewport, 'LobbyHeroRosterScrollContent', 0, (viewportHeight - contentHeight) / 2, bodyWidth, contentHeight);
    scrollView.content = content;
    const startX = -bodyWidth / 2 + cardInsetX + cardWidth / 2;
    const startY = contentHeight / 2 - scrollEffectTopPadding - cardInsetY - cardHeight / 2;

    // 每次重建名册归零边框 spine 错峰槽位,让 SSR/UR 骨骼分帧创建。
    this.borderSpineStaggerSlot = 0;
    const buildCard = (hero: LobbyHeroItemVO, index: number): void => {
      if (!content.isValid) {
        return;
      }
      const col = index % columns;
      const row = Math.floor(index / columns);
      this.renderHeroCard(content, hero, index, startX + col * (cardWidth + gap), startY - row * (cardHeight + rowGap), cardWidth, cardHeight, scale);
    };
    // 首屏(至少两行)同步建好,保证打开即有内容;其余卡按批分帧错峰,消除"进入英雄界面"时整墙节点同帧构建的卡顿。
    // 面板重建时旧 content 失效,已入队的延迟批次通过 content.isValid 兜底跳过(tween 目标销毁也会自动停)。
    const initialSyncCount = Math.min(displayHeroes.length, Math.max(columns, HERO_ROSTER_CARD_INITIAL_SYNC_MIN));
    for (let i = 0; i < initialSyncCount; i += 1) {
      buildCard(displayHeroes[i], i);
    }
    let deferBatch = 0;
    for (let i = initialSyncCount; i < displayHeroes.length; i += HERO_ROSTER_CARD_DEFER_BATCH) {
      deferBatch += 1;
      const batchStart = i;
      tween(content)
        .delay(deferBatch * HERO_ROSTER_CARD_DEFER_STEP_SECONDS)
        .call(() => {
          const batchEnd = Math.min(batchStart + HERO_ROSTER_CARD_DEFER_BATCH, displayHeroes.length);
          for (let j = batchStart; j < batchEnd; j += 1) {
            buildCard(displayHeroes[j], j);
          }
        })
        .start();
    }
  }

  private resolveHeroFilterTabs(heroes: LobbyHeroItemVO[], heroClassOptions: string[] = []): string[] {
    const available = new Map<string, string>();
    HERO_CLASS_FILTER_ORDER.forEach((item) => this.addHeroClassTab(available, item));
    heroClassOptions.forEach((item) => {
      this.addHeroClassTab(available, item);
    });
    heroes.forEach((hero) => {
      this.addHeroClassTab(available, this.resolveHeroClass(hero));
    });
    const defaultKeys = new Set(HERO_CLASS_FILTER_ORDER.map((item) => this.normalizeHeroClassKey(item)));
    const ordered = HERO_CLASS_FILTER_ORDER
      .map((item) => available.get(this.normalizeHeroClassKey(item)))
      .filter((item): item is string => !!item);
    const rest = Array.from(available.entries())
      .filter(([key]) => !defaultKeys.has(key))
      .map(([, text]) => text)
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
    return [HERO_FILTER_ALL, ...ordered, ...rest];
  }

  private ensureSelectedHeroClass(tabs: string[]): void {
    if (this.selectedHeroClass === HERO_FILTER_ALL) {
      return;
    }
    const selectedKey = this.normalizeHeroClassKey(this.selectedHeroClass);
    const matched = tabs.find((tab) => this.normalizeHeroClassKey(tab) === selectedKey);
    if (matched) {
      this.selectedHeroClass = matched;
    } else {
      this.selectedHeroClass = HERO_FILTER_ALL;
    }
  }

  private filterHeroesBySelectedClass(heroes: LobbyHeroItemVO[]): LobbyHeroItemVO[] {
    if (this.selectedHeroClass === HERO_FILTER_ALL) {
      return heroes;
    }
    const selectedKey = this.normalizeHeroClassKey(this.selectedHeroClass);
    return heroes.filter((hero) => this.normalizeHeroClassKey(this.resolveHeroClass(hero)) === selectedKey);
  }

  private resolveHeroClass(hero: LobbyHeroItemVO): string | null {
    const value = safeText(hero.heroClass).trim();
    return value || null;
  }

  private addHeroClassTab(tabByKey: Map<string, string>, value: string | null | undefined): void {
    const text = safeText(value).trim();
    const key = this.normalizeHeroClassKey(text);
    if (!key || tabByKey.has(key)) {
      return;
    }
    tabByKey.set(key, text);
  }

  private isHeroClassTabActive(text: string): boolean {
    if (this.selectedHeroClass === HERO_FILTER_ALL || text === HERO_FILTER_ALL) {
      return this.selectedHeroClass === text;
    }
    return this.normalizeHeroClassKey(text) === this.normalizeHeroClassKey(this.selectedHeroClass);
  }

  private normalizeHeroClassKey(value: string | null | undefined): string {
    const text = safeText(value)
      .replace(/[\s\u00a0\u3000]/g, '')
      .replace(/[＋]/g, '+');
    return HERO_CLASS_KEY_ALIASES[text] ?? text;
  }

  private sortHeroesForRosterDisplay(heroes: LobbyHeroItemVO[]): LobbyHeroItemVO[] {
    return heroes
      .map((hero, index) => ({ hero, index }))
      .sort((left, right) => {
        const rarityDelta = this.resolveRarityDisplayRank(left.hero.rarity) - this.resolveRarityDisplayRank(right.hero.rarity);
        if (rarityDelta !== 0) {
          return rarityDelta;
        }
        return left.index - right.index;
      })
      .map(({ hero }) => hero);
  }

  private resolveRarityDisplayRank(rarity: string): number {
    const normalized = safeText(rarity || 'R').toUpperCase();
    return HERO_ROSTER_RARITY_DISPLAY_ORDER[normalized] ?? 99;
  }

  private drawCardStage(parent: Node, x: number, y: number, width: number, height: number, scale: number): void {
    const stage = this.host.addChildPlainNode(parent, 'LobbyHeroRosterCardStage', x, y, width, height);
    const graphics = stage.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 68);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = rgba(86, 17, 12, 28);
    graphics.ellipse(0, -height * 0.34, width * 0.32, height * 0.075);
    graphics.fill();
    graphics.fillColor = rgba(214, 154, 72, 18);
    graphics.ellipse(0, -height * 0.34, width * 0.18, height * 0.036);
    graphics.fill();
    graphics.strokeColor = rgba(190, 146, 70, 46);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(-width / 2 + 18 * scale, height / 2 - 6 * scale);
    graphics.lineTo(width / 2 - 18 * scale, height / 2 - 6 * scale);
    graphics.moveTo(-width / 2 + 22 * scale, -height / 2 + 8 * scale);
    graphics.lineTo(width / 2 - 22 * scale, -height / 2 + 8 * scale);
    graphics.stroke();

    const dust = this.host.addChildPlainNode(stage, 'LobbyHeroRosterAbyssDust', 0, 0, width, height);
    const dustGraphics = dust.addComponent(Graphics);
    for (let index = 0; index < 34; index += 1) {
      const t = (index * 37 % 101) / 100;
      const u = (index * 53 % 97) / 96;
      const px = -width * 0.45 + t * width * 0.9;
      const py = -height * 0.31 + u * height * 0.54;
      const warm = index % 3 !== 0;
      dustGraphics.fillColor = warm ? rgba(216, 146, 64, 30 + (index % 5) * 5) : rgba(150, 30, 24, 34);
      dustGraphics.circle(px, py, (0.8 + (index % 3) * 0.35) * scale);
      dustGraphics.fill();
    }
  }

  private renderEmpty(parent: Node, x: number, y: number, width: number, height: number, scale: number, text: string): void {
    const boxWidth = Math.min(width - 24 * scale, 460 * scale);
    const box = this.host.addChildPlainNode(parent, 'LobbyHeroRosterEmptyBox', x, y, boxWidth, Math.min(132 * scale, height));
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(7, 7, 10, 172);
    this.traceSlantRect(graphics, boxWidth, 118 * scale, 14 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 124);
    this.traceSlantRect(graphics, boxWidth, 118 * scale, 14 * scale);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyHeroRosterEmptyText', text, 0, 0, 20 * scale, rgba(213, 193, 151), new Size(boxWidth - 36 * scale, 48 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private renderHeroCard(parent: Node, hero: LobbyHeroItemVO, index: number, x: number, y: number, width: number, height: number, scale: number): void {
    const card = this.host.addChildPlainNode(parent, `LobbyHeroRosterCard_${index}`, x, y, width, height);
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, () => this.host.openLobbyHeroDetail(hero.id), this);
    this.host.applyImageButtonFeedback(card, 1.024, 0.982);

    this.drawHeroCardShadow(card, width, height, scale);
    const cardAsset = this.resolveHeroRosterCardAsset();
    if (!this.host.addSprite('LobbyHeroRosterCardSkin', cardAsset, 0, 0, width, height, card)) {
      this.drawHeroCardFallback(card, width, height, scale, hero);
    }
    const hasCardArtwork = this.renderHeroCardBackground(card, hero, width, height, scale);
    this.renderHeroCardBorderEffect(card, hero, width, height);
    if (!hasCardArtwork) {
      this.renderHeroPortrait(card, hero, width, height, scale);
    }
    this.renderHeroCardChrome(card, hero, width, height, scale);
  }

  private drawHeroCardShadow(card: Node, width: number, height: number, scale: number): void {
    const shadow = this.host.addChildPlainNode(card, 'LobbyHeroRosterCardShadow', 0, -7 * scale, width * 1.02, height * 1.02);
    const graphics = shadow.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 88);
    this.traceSlantRect(graphics, width * 1.02, height * 1.02, 18 * scale);
    graphics.fill();
  }

  private renderHeroCardBackground(card: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): boolean {
    const assetPath = this.resolveHeroCardBackgroundAssetPath(hero);
    if (!assetPath) {
      return false;
    }
    const maskWidth = Math.min(width * HERO_ROSTER_CARD_BACKGROUND_MASK_WIDTH_RATIO, width - 22 * scale);
    const maskHeight = Math.min(height * HERO_ROSTER_CARD_BACKGROUND_MASK_HEIGHT_RATIO, height - 76 * scale);
    const maskNode = this.host.addChildPlainNode(
      card,
      'LobbyHeroRosterCardBackgroundMask',
      0,
      height * HERO_ROSTER_CARD_BACKGROUND_MASK_Y_RATIO,
      maskWidth,
      maskHeight,
    );
    const mask = maskNode.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const node = this.host.addChildPlainNode(maskNode, 'LobbyHeroRosterCardBackgroundSprite', 0, 0, maskWidth, maskHeight);
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = rgba(255, 255, 255, 255);
    this.loadHeroCardBackgroundFrame(assetPath, (frame) => {
      if (!maskNode.isValid || !node.isValid) {
        return;
      }
      if (!frame) {
        maskNode.removeFromParent();
        return;
      }
      sprite.spriteFrame = frame;
      const frameSize = this.resolveHeroCardBackgroundFrameSize(frame);
      const displaySize = this.resolveHeroCardBackgroundDisplaySize(assetPath, frameSize, maskWidth, maskHeight, height, scale);
      node.getComponent(UITransform)?.setContentSize(displaySize);
      node.setPosition(new Vec3(this.resolveHeroCardBackgroundOffsetX(assetPath, displaySize.width), this.resolveHeroCardBackgroundOffsetY(displaySize.height, maskHeight), 0));
    });
    return true;
  }

  private resolveHeroCardBackgroundFrameSize(frame: SpriteFrame): Size {
    const meta = frame as unknown as {
      originalSize?: Size;
      rect?: { width?: number; height?: number };
      width?: number;
      height?: number;
    };
    const originalSize = meta.originalSize;
    if (originalSize?.width && originalSize?.height) {
      return new Size(originalSize.width, originalSize.height);
    }
    const rect = meta.rect;
    if (rect?.width && rect?.height) {
      return new Size(rect.width, rect.height);
    }
    if (meta.width && meta.height) {
      return new Size(meta.width, meta.height);
    }
    return new Size(1, 1);
  }

  private resolveHeroCardBackgroundDisplaySize(assetPath: string, frameSize: Size, maskWidth: number, maskHeight: number, cardHeight: number, scale: number): Size {
    const aspect = Math.max(0.18, frameSize.width / Math.max(1, frameSize.height));
    const isNpcCardBackground = this.isNpcHeroCardBackgroundAssetPath(assetPath);
    const visibleAlphaRatio = clamp(
      isNpcCardBackground ? 1 : (HERO_ROSTER_CARD_BACKGROUND_VISIBLE_HEIGHT_RATIOS[assetPath] ?? HERO_ROSTER_CARD_BACKGROUND_MIN_VISIBLE_ALPHA_RATIO),
      isNpcCardBackground ? 1 : HERO_ROSTER_CARD_BACKGROUND_MIN_VISIBLE_ALPHA_RATIO,
      1,
    );
    const targetVisibleHeightRatio = isNpcCardBackground
      ? HERO_ROSTER_CARD_BACKGROUND_NPC_VISIBLE_HEIGHT_RATIO
      : assetPath === LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET
      ? HERO_ROSTER_CARD_BACKGROUND_NUU_VISIBLE_HEIGHT_RATIO
      : HERO_ROSTER_CARD_BACKGROUND_MATCHED_VISIBLE_HEIGHT_RATIO;
    const targetVisibleHeight = cardHeight * targetVisibleHeightRatio;
    const minDisplayHeight = isNpcCardBackground ? maskHeight * 0.24 : maskHeight * 0.56;
    const maxDisplayHeight = cardHeight * (isNpcCardBackground
      ? HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_HEIGHT_RATIO
      : HERO_ROSTER_CARD_BACKGROUND_MAX_DISPLAY_HEIGHT_RATIO);
    const displayHeight = clamp(targetVisibleHeight / visibleAlphaRatio, minDisplayHeight, maxDisplayHeight);
    const aspectWidth = displayHeight * aspect;
    const displayWidth = isNpcCardBackground
      ? Math.min(maskWidth * HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_WIDTH_RATIO, aspectWidth)
      : Math.max(maskWidth, aspectWidth);
    return new Size(displayWidth, displayHeight);
  }

  private isNpcHeroCardBackgroundAssetPath(assetPath: string): boolean {
    return assetPath.startsWith(HERO_ROSTER_CARD_BACKGROUND_NPC_PREFIX);
  }

  private resolveHeroCardBackgroundOffsetX(assetPath: string, displayWidth: number): number {
    const focusXRatio = HERO_ROSTER_CARD_BACKGROUND_FOCUS_X_RATIOS[assetPath] ?? 0;
    return -displayWidth * focusXRatio;
  }

  private resolveHeroCardBackgroundOffsetY(displayHeight: number, maskHeight: number): number {
    return -maskHeight / 2 + displayHeight / 2;
  }

  private loadHeroCardBackgroundFrame(assetPath: string, callback: (frame: SpriteFrame | null) => void): void {
    const cached = this.cardBackgroundFrames.get(assetPath);
    if (cached) {
      callback(cached);
      return;
    }
    const queuedCallbacks = this.cardBackgroundLoadCallbacks.get(assetPath);
    if (queuedCallbacks) {
      queuedCallbacks.push(callback);
      return;
    }
    this.cardBackgroundLoadCallbacks.set(assetPath, [callback]);
    const finish = (frame: SpriteFrame | null) => {
      if (frame) {
        this.cardBackgroundFrames.set(assetPath, frame);
      }
      const callbacks = this.cardBackgroundLoadCallbacks.get(assetPath) ?? [];
      Map.prototype.delete.call(this.cardBackgroundLoadCallbacks, assetPath);
      callbacks.forEach((queued) => queued(frame));
    };
    const spriteFramePath = `${assetPath}/spriteFrame`;
    resources.load(spriteFramePath, SpriteFrame, (spriteFrameError, spriteFrame) => {
      if (!spriteFrameError && spriteFrame) {
        finish(spriteFrame);
        return;
      }
      this.loadHeroCardBackgroundTexture(assetPath, finish);
    });
  }

  private loadHeroCardBackgroundTexture(assetPath: string, callback: (frame: SpriteFrame | null) => void): void {
    resources.load(assetPath, Texture2D, (textureError, texture) => {
      if (!textureError && texture) {
        const frame = new SpriteFrame();
        frame.texture = texture;
        callback(frame);
        return;
      }
      resources.load(`${assetPath}/texture`, Texture2D, (subTextureError, subTexture) => {
        if (!subTextureError && subTexture) {
          const frame = new SpriteFrame();
          frame.texture = subTexture;
          callback(frame);
          return;
        }
        if (!this.missingCardBackgroundLogs.has(assetPath)) {
          this.missingCardBackgroundLogs.add(assetPath);
          console.warn(`[HeroRoster] card background asset missing or not imported as texture/spriteFrame: ${assetPath}`);
        }
        callback(null);
      });
    });
  }

  private drawHeroCardFallback(card: Node, width: number, height: number, scale: number, hero: LobbyHeroItemVO): void {
    const graphics = card.addComponent(Graphics);
    graphics.fillColor = hero.protagonist ? rgba(50, 18, 17, 226) : rgba(22, 18, 16, 214);
    this.traceSlantRect(graphics, width, height, 16 * scale);
    graphics.fill();
    graphics.fillColor = this.rarityFill(hero.rarity);
    graphics.rect(-width / 2 + 8 * scale, -height / 2 + 14 * scale, width - 16 * scale, height * 0.28);
    graphics.fill();
    graphics.strokeColor = this.rarityStroke(hero.rarity);
    graphics.lineWidth = Math.max(1, 1.6 * scale);
    this.traceSlantRect(graphics, width, height, 16 * scale);
    graphics.stroke();
  }

  private renderHeroCardBorderEffect(card: Node, hero: LobbyHeroItemVO, width: number, height: number): void {
    const rarity = safeText(hero.rarity).toUpperCase();
    // 只有 SSR/UR 保留动画 spine 边框;R/SR 不挂任何边框(静态描边已移除),保留卡框底图即可。
    if (!HERO_ROSTER_ANIMATED_BORDER_RARITIES.has(rarity)) {
      return;
    }
    if (rarity === 'UR') {
      this.renderUrCardSequenceBorder(card, width, height);
      this.renderRarityGoodsBorderSpine(card, 'UR', width, height);
      return;
    }
    this.renderRarityGoodsBorderSpine(card, rarity, width, height);
  }

  private renderUrCardSequenceBorder(card: Node, width: number, height: number): void {
    const effectWidth = width * HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO;
    const effectHeight = height * HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO;
    const effectNode = this.host.addChildPlainNode(card, 'LobbyHeroRosterUrSequenceBorderSprite', 0, height * HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO, effectWidth, effectHeight);
    const sprite = effectNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = rgba(255, 255, 255, HERO_ROSTER_UR_SEQUENCE_BORDER_ALPHA);
    this.loadUrSequenceBorderFrames((frames) => {
      if (!effectNode.isValid) {
        return;
      }
      if (!frames || frames.length === 0) {
        effectNode.removeFromParent();
        return;
      }
      this.startSequenceBorderAnimation(effectNode, sprite, frames, HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_DURATION_SECONDS);
    });
  }

  private startSequenceBorderAnimation(effectNode: Node, sprite: Sprite, frames: SpriteFrame[], frameDurationSeconds: number): void {
    let frameIndex = 0;
    sprite.spriteFrame = frames[frameIndex];
    tween(effectNode)
      .repeatForever(
        tween()
          .delay(frameDurationSeconds)
          .call(() => {
            if (!effectNode.isValid) {
              return;
            }
            frameIndex = (frameIndex + 1) % frames.length;
            sprite.spriteFrame = frames[frameIndex];
          }),
      )
      .start();
  }

  private renderRarityGoodsBorderSpine(card: Node, rarity: string, width: number, height: number, siblingIndex = -1): void {
    const effectNode = this.host.addChildPlainNode(card, `LobbyHeroRosterRarityGoodsBorderSpine_${rarity}`, 0, height * HERO_ROSTER_GOODS_BORDER_Y_RATIO, width, height);
    if (siblingIndex >= 0) {
      effectNode.setSiblingIndex(siblingIndex);
    }
    effectNode.setScale(new Vec3(
      clamp((width + HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING) / 120, 1.12, HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX),
      clamp((height + HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING) / 120, 1.75, 4.2),
      1,
    ));
    // 分帧实例化:节点先建好(便宜),昂贵的 spine 骨骼创建 + setAnimation 按错峰槽位延后,
    // 摊平"打开英雄界面时多张 SSR/UR 骨骼同帧实例化"的卡顿尖峰。
    const staggerDelay = this.borderSpineStaggerSlot * HERO_ROSTER_BORDER_SPINE_STAGGER_SECONDS;
    this.borderSpineStaggerSlot += 1;
    const buildSkeleton = (): void => {
      if (!effectNode.isValid) {
        return;
      }
      const skeleton = effectNode.addComponent(sp.Skeleton);
      skeleton.premultipliedAlpha = false;
      this.loadBorderEffectData((data) => {
        if (!data || !effectNode.isValid || !skeleton.isValid) {
          return;
        }
        skeleton.skeletonData = data;
        const animationName = this.resolveRarityBorderAnimationName(data, rarity);
        if (animationName) {
          skeleton.setAnimation(0, animationName, true);
        }
      });
    };
    if (staggerDelay <= 0) {
      buildSkeleton();
    } else {
      tween(effectNode).delay(staggerDelay).call(buildSkeleton).start();
    }
  }

  private loadUrSequenceBorderFrames(callback: (frames: SpriteFrame[] | null) => void): void {
    if (this.urSequenceBorderFrames) {
      callback(this.urSequenceBorderFrames);
      return;
    }
    if (this.urSequenceBorderLoadFailed) {
      callback(null);
      return;
    }
    this.urSequenceBorderCallbacks.push(callback);
    if (this.urSequenceBorderLoading) {
      return;
    }
    this.urSequenceBorderLoading = true;
    const frames: Array<SpriteFrame | null> = new Array(HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_PATHS.length).fill(null);
    let pending = HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_PATHS.length;
    let failed = false;
    HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_PATHS.forEach((path, index) => {
      resources.load(path, SpriteFrame, (error, frame) => {
        if (error || !frame) {
          failed = true;
        } else {
          frames[index] = frame;
        }
        pending -= 1;
        if (pending > 0) {
          return;
        }
        this.urSequenceBorderLoading = false;
        this.urSequenceBorderFrames = failed ? null : frames.filter((item): item is SpriteFrame => !!item);
        this.urSequenceBorderLoadFailed = failed;
        const callbacks = this.urSequenceBorderCallbacks.splice(0);
        callbacks.forEach((queued) => queued(this.urSequenceBorderFrames));
      });
    });
  }

  private loadBorderEffectData(callback: (data: sp.SkeletonData | null) => void): void {
    if (this.borderEffectData) {
      callback(this.borderEffectData);
      return;
    }
    this.borderEffectCallbacks.push(callback);
    if (this.borderEffectLoading) {
      return;
    }
    this.borderEffectLoading = true;
    resources.load(HERO_ROSTER_BORDER_EFFECT_RESOURCE, sp.SkeletonData, (error, data) => {
      this.borderEffectLoading = false;
      this.borderEffectData = error ? null : data ?? null;
      const callbacks = this.borderEffectCallbacks.splice(0);
      callbacks.forEach((queued) => queued(this.borderEffectData));
    });
  }

  private resolveRarityBorderAnimationName(data: sp.SkeletonData, rarity: string): string | null {
    const target = HERO_ROSTER_BORDER_ANIMATION_BY_RARITY[rarity.toUpperCase()];
    if (!target) {
      return null;
    }
    const enumMap = data.getAnimsEnum();
    if (!enumMap) {
      return null;
    }
    const names = Object.keys(enumMap).filter((name) => name !== '<None>' && typeof enumMap[name] === 'number');
    const targetLower = target.toLowerCase();
    return names.find((name) => name.toLowerCase() === targetLower)
      ?? names.find((name) => name.toLowerCase().includes(targetLower))
      ?? null;
  }

  private renderHeroPortrait(card: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const portraitAsset = this.resolveHeroRosterPortraitAsset(hero);
    const portraitWidth = width * 0.82;
    const portraitHeight = height * 0.46;
    const portraitY = height * 0.15;
    if (portraitAsset && this.host.addSprite('LobbyHeroRosterPortraitSprite', portraitAsset, 0, portraitY, portraitWidth, portraitHeight, card)) {
      return;
    }
    this.drawHeroReliefPortrait(card, hero, 0, portraitY, portraitWidth, portraitHeight, scale);
  }

  private renderHeroCardChrome(card: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const rarity = safeText(hero.rarity || 'R').toUpperCase();
    const badgeSize = clamp(width * HERO_ROSTER_CARD_BADGE_SIZE_RATIO, 28 * scale, 42 * scale);
    const badgeX = width * HERO_ROSTER_CARD_BADGE_X_RATIO;
    const badgeY = height * HERO_ROSTER_CARD_BADGE_Y_RATIO;
    const topBadge = this.host.addChildPlainNode(card, 'LobbyHeroRosterClassBadge', badgeX, badgeY, badgeSize, badgeSize);
    this.drawCircleBadge(topBadge, badgeSize, this.rarityStroke(rarity), scale);
    const topLabel = this.host.addChildLabel(topBadge, 'LobbyHeroRosterClassBadgeText', this.resolveHeroClassBadgeText(hero), 0, 0, 17 * scale, rgba(255, 235, 181), new Size(30 * scale, 26 * scale));
    topLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(topLabel, scale, false);

    const infoTop = -height / 2 + height * HERO_ROSTER_CARD_RARITY_Y_RATIO;
    const rarityLabel = this.host.addChildLabel(card, 'LobbyHeroRosterRarity', rarity, 0, infoTop, Math.min(28 * scale, height * 0.078), this.rarityTextColor(rarity), new Size(width - 58 * scale, height * 0.086));
    rarityLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(rarityLabel, scale, true);

    // 五档进阶星行(v2):满档满亮/当前档半亮/未达不画,卡上保持干净;素材缺失回退文字星。
    // v3(用户定稿):每 5 星一轮逐颗点亮,升轮整排换色。
    const starDisplay = starDisplayV3(hero.star);
    const starY = -height / 2 + height * HERO_ROSTER_CARD_STARS_Y_RATIO;
    const starSize = Math.min(24 * scale, height * 0.07);
    const starGap = 4.5 * scale;
    const starFirstX = -(starDisplay.count * starSize + Math.max(0, starDisplay.count - 1) * starGap) / 2 + starSize / 2;
    let anyStarSprite = false;
    for (let index = 0; index < starDisplay.count; index += 1) {
      if (this.host.addSprite(`LobbyHeroRosterStar_${index}`, starBandAssetOf(starDisplay.color), starFirstX + index * (starSize + starGap), starY, starSize, starSize, card)) {
        anyStarSprite = true;
      }
    }
    if (!anyStarSprite) {
      const starBand = starBandTextRgb(hero.star);
      const star = this.host.addChildLabel(card, 'LobbyHeroRosterStars', starText(hero.star), 0, starY, Math.min(16 * scale, height * 0.048), rgba(starBand[0], starBand[1], starBand[2]), new Size(width - 54 * scale, height * 0.06));
      star.overflow = Label.Overflow.SHRINK;
      this.applyOutline(star, scale, false);
    }

    const name = this.host.addChildLabel(card, 'LobbyHeroRosterHeroName', safeText(hero.heroName), 0, -height / 2 + height * HERO_ROSTER_CARD_NAME_Y_RATIO, Math.min(13 * scale, height * 0.038), rgba(250, 218, 146), new Size(width - 72 * scale, height * 0.054));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);

    const level = this.host.addChildLabel(card, 'LobbyHeroRosterLevelText', formatHeroCardLevel(hero.level), width * HERO_ROSTER_CARD_LEVEL_X_RATIO, height * HERO_ROSTER_CARD_LEVEL_Y_RATIO, Math.min(14 * scale, width * 0.078), rgba(246, 225, 170), new Size(width * HERO_ROSTER_CARD_LEVEL_TEXT_WIDTH_RATIO, height * 0.058), HorizontalTextAlignment.CENTER);
    level.overflow = Label.Overflow.SHRINK;
    this.applyOutline(level, scale, false);
  }

  private resolveHeroClassBadgeText(hero: LobbyHeroItemVO): string {
    if (hero.protagonist) {
      return '主';
    }
    const heroClass = this.resolveHeroClass(hero);
    if (!heroClass) {
      return '英';
    }
    const known: Record<string, string> = {
      战士: '战',
      辅助: '辅',
      刺客: '刺',
      法师: '法',
      射手: '射',
      坦克: '坦',
    };
    return known[this.normalizeHeroClassKey(heroClass)] ?? heroClass.slice(0, 1);
  }

  private drawHeroReliefPortrait(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'LobbyHeroRosterHeroRelief', x, y, width, height);
    const graphics = node.addComponent(Graphics);
    const stroke = this.rarityStroke(hero.rarity);
    const color = hero.protagonist ? rgba(214, 58, 43, 224) : new Color(stroke.r, stroke.g, stroke.b, 214);
    graphics.fillColor = color;
    graphics.moveTo(0, height * 0.28);
    graphics.lineTo(width * 0.18, -height * 0.26);
    graphics.lineTo(-width * 0.18, -height * 0.26);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(0, 0, 0, 180);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(0, height * 0.28);
    graphics.lineTo(width * 0.18, -height * 0.26);
    graphics.lineTo(-width * 0.18, -height * 0.26);
    graphics.close();
    graphics.stroke();
  }

  private renderUpgradeDock(parent: Node, width: number, height: number, scale: number): void {
    // 右下角"查看详情"底座已按需求移除,只保留布阵入口;点卡片即可进详情。
    const dockWidth = 0;
    const dockX = width / 2 - 34 * scale;
    const dockY = -height / 2 + 70 * scale;
    void dockWidth;

    // 布阵入口:跳转编队面板,布阵结果同步大厅挂机演出阵容。
    // 按钮整图按素材原比例(240×84)放大显示,不用 SLICED(源像素九宫会把雕花框压变形)。
    const formationWidth = 208 * scale;
    const formationHeight = formationWidth * (84 / 240);
    const formationX = dockX - dockWidth / 2 - formationWidth / 2 - 20 * scale;
    const formation = this.host.addChildPlainNode(parent, 'LobbyHeroRosterFormationButton', formationX, dockY, formationWidth, formationHeight);
    const formationArt = this.host.addSprite('LobbyHeroRosterFormationButtonArt', C1812_BUTTON_PRIMARY_ASSET, 0, 0, formationWidth, formationHeight, formation);
    if (formationArt) {
      // 整图等比,保持雕花边框不变形。
    } else {
      const formationGraphics = formation.addComponent(Graphics);
      formationGraphics.fillColor = rgba(48, 36, 22, 220);
      this.traceSlantRect(formationGraphics, formationWidth, formationHeight, 16 * scale);
      formationGraphics.fill();
      formationGraphics.strokeColor = rgba(206, 162, 82, 190);
      formationGraphics.lineWidth = Math.max(1, 1.3 * scale);
      this.traceSlantRect(formationGraphics, formationWidth, formationHeight, 16 * scale);
      formationGraphics.stroke();
    }
    const formationLabel = this.host.addChildLabel(formation, 'LobbyHeroRosterFormationButtonLabel', '布阵', 10 * scale, 0, 22 * scale, rgba(255, 240, 200), new Size(formationWidth - 76 * scale, 32 * scale));
    formationLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(formationLabel, scale, true);
    formation.addComponent(Button);
    this.host.applyImageButtonFeedback(formation, 1.035, 0.965);
    formation.on(Button.EventType.CLICK, () => this.host.openLobbyFormationPanel(undefined, 'roster'), this);
  }

  private renderFooter(parent: Node, width: number, height: number, scale: number): void {
    const maxWidth = Math.max(160 * scale, width - 420 * scale);
    const note = this.host.addChildLabel(
      parent,
      'LobbyHeroRosterBoundaryNote',
      '英雄列表只读展示；进入英雄详情可升级，升星、觉醒、抽卡、领取仍关闭。',
      -width / 2 + 42 * scale,
      -height / 2 + 30 * scale, 16 * scale,
      rgba(170, 150, 109),
      new Size(maxWidth, 24 * scale),
      HorizontalTextAlignment.LEFT,
    );
    note.overflow = Label.Overflow.SHRINK;
  }

  private drawFallbackBackdrop(parent: Node, width: number, height: number, scale: number): void {
    const graphics = parent.addComponent(Graphics);
    graphics.fillColor = rgba(13, 15, 18, 236);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = rgba(53, 35, 24, 92);
    graphics.rect(-width / 2, -height * 0.12, width, height * 0.28);
    graphics.fill();
    graphics.strokeColor = rgba(150, 108, 58, 74);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(-width / 2 + 20 * scale, height / 2 - 78 * scale);
    graphics.lineTo(width / 2 - 20 * scale, height / 2 - 78 * scale);
    graphics.stroke();
  }

  private drawSceneShade(parent: Node, width: number, height: number, scale: number): void {
    const shade = this.host.addChildPlainNode(parent, 'LobbyHeroRosterSceneShade', 0, 0, width, height);
    const graphics = shade.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 88);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = rgba(0, 0, 0, 132);
    graphics.rect(-width / 2, -height / 2, width, height * 0.24);
    graphics.fill();
  }

  private resolveHeroRosterCardAsset(): string {
    return LOBBY_HERO_ROSTER_CARD_FRAME_ASSET;
  }

  private resolveHeroCardBackgroundAssetPath(hero: LobbyHeroItemVO): string | null {
    const rawPath = safeText(hero.cardBackgroundAsset || '').trim();
    if (!rawPath) {
      return null;
    }
    const normalized = rawPath
      .replace(/\\/g, '/')
      .replace(/\.(png|jpg|jpeg|webp)$/i, '')
      .replace(/\/(spriteFrame|texture)$/i, '')
      .replace(/\/+$/g, '');
    if (!/^[A-Za-z0-9_./-]+$/.test(normalized) || normalized.includes('..')) {
      return null;
    }
    return normalized;
  }

  private resolveHeroRosterPortraitAsset(hero: LobbyHeroItemVO): string | null {
    if (!USE_HERO_ROSTER_EXTERNAL_PORTRAITS) {
      return null;
    }
    return safeText(hero.portraitAsset || hero.spineAsset || '').trim() ? null : null;
  }

  private drawCircleBadge(parent: Node, size: number, color: Color, scale: number): void {
    const graphics = parent.addComponent(Graphics);
    graphics.fillColor = new Color(color.r, color.g, color.b, 150);
    graphics.circle(0, 0, size * 0.45);
    graphics.fill();
    graphics.strokeColor = color;
    graphics.lineWidth = Math.max(1, 1.4 * scale);
    graphics.circle(0, 0, size * 0.45);
    graphics.stroke();
  }

  private traceSlantRect(graphics: Graphics, width: number, height: number, bevel: number): void {
    const left = -width / 2;
    const right = width / 2;
    const top = height / 2;
    const bottom = -height / 2;
    const corner = Math.min(bevel, width * 0.2, height * 0.45);
    graphics.moveTo(left + corner, top);
    graphics.lineTo(right - corner, top);
    graphics.lineTo(right, top - corner);
    graphics.lineTo(right, bottom + corner);
    graphics.lineTo(right - corner, bottom);
    graphics.lineTo(left + corner, bottom);
    graphics.lineTo(left, bottom + corner);
    graphics.lineTo(left, top - corner);
    graphics.close();
  }

  private rarityTextColor(rarity: string): Color {
    const key = rarity.toUpperCase();
    if (key === 'UR') {
      return rgba(255, 112, 78);
    }
    if (key === 'SSR') {
      return rgba(255, 174, 84);
    }
    if (key === 'SR') {
      return rgba(222, 176, 255);
    }
    return rgba(150, 203, 255);
  }

  private rarityStroke(rarity: string): Color {
    const key = rarity.toUpperCase();
    if (key === 'UR') {
      return rgba(240, 72, 44, 224);
    }
    if (key === 'SSR') {
      return rgba(238, 148, 50, 220);
    }
    if (key === 'SR') {
      return rgba(148, 92, 218, 218);
    }
    return rgba(78, 142, 212, 210);
  }

  private rarityFill(rarity: string): Color {
    const stroke = this.rarityStroke(rarity);
    return new Color(stroke.r, stroke.g, stroke.b, 92);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 232 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}

function formatCompactInteger(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (safe >= 1000000) {
    return `${(safe / 1000000).toFixed(safe >= 10000000 ? 0 : 1)}M`;
  }
  if (safe >= 10000) {
    if (lootChainI18n.currentLanguage() === 'en-US') {
      return `${(safe / 1000).toFixed(safe >= 100000 ? 0 : 1)}K`;
    }
    return `${(safe / 10000).toFixed(safe >= 100000 ? 0 : 1)}万`;
  }
  return safe.toLocaleString('en-US');
}

function starText(star: number): string {
  // 星级色带:亮星=档内进度(1-3),颜色由调用侧按档上色;>3 星补真实星数。
  const real = Math.max(1, Math.trunc(star || 1));
  const progress = ((Math.min(15, real) - 1) % 3) + 1;
  const bar = `${'★'.repeat(progress)}${'☆'.repeat(3 - progress)}`;
  return real > 3 ? `${bar} ${real}星` : bar;
}

function formatHeroCardLevel(level: number): string {
  const safeLevel = Math.max(1, Math.trunc(Number(level) || 1));
  return safeLevel >= 100 ? `Lv${safeLevel}` : `Lv.${safeLevel}`;
}
