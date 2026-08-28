import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
  UITransform,
  Vec3,
} from 'cc';
import type { LobbyAdventureChapterVO, LobbyAdventurePanelState, LobbyAdventureStageVO } from '../../types/LobbyAdventureTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';
import type { LobbyBattlePanelState } from './LobbyBattleState';
import type { LobbyFormationPowerSnapshot } from './LobbyFormationPanelRenderer';
import type { LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { BattleStageMapRenderer, type BattleStageMapHost } from './BattleStageMapRenderer';
import { BattleChallengeDialogRenderer, type BattleChallengeDialogHost } from './BattleChallengeDialogRenderer';

// C1812 冒险地图视觉资源：关卡节点（普通/推荐/锁定）、章节图标与锁定标记。
export const ADVENTURE_C1812_STAGE_NODE_ASSET = 'ui/adventure/c1812/stage_node/spriteFrame';
export const ADVENTURE_C1812_STAGE_NODE_BOSS_ASSET = 'ui/adventure/c1812/stage_node_boss/spriteFrame';
export const ADVENTURE_C1812_STAGE_NODE_CLEAR_ASSET = 'ui/adventure/c1812/stage_node_clear/spriteFrame';
export const ADVENTURE_AI_CHAPTER_TAB_ASSET = 'ui/adventure/ai/chapter_tab/spriteFrame';
const ADVENTURE_AI_CHAPTER_TAB_ACTIVE_ASSET = 'ui/adventure/ai/chapter_tab_active/spriteFrame';
export const ADVENTURE_C1812_CHAPTER_ICON_ASSET = 'ui/adventure/c1812/chapter_icon/spriteFrame';
export const ADVENTURE_C1812_ICON_LOCK_ASSET = 'ui/common/c1812/icon_lock/spriteFrame';
export const ADVENTURE_C1812_TITLE_BANNER_ASSET = 'ui/common/ai/title_banner/spriteFrame';

const ANNUAL_MAINLINE_TOTAL_STAGES = 393;
const FIRST_CHAPTER_STAGE_COUNT = 9;
const STAGES_PER_CHAPTER_AFTER_FIRST = 16;

export interface LobbyAdventurePanelHost {
  node: Node;
  currentLobbyAdventureState(): LobbyAdventurePanelState;
  currentLobbyBattleState(): LobbyBattlePanelState;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  currentLobbySelectedStageCode(): string;
  currentLobbyFormationHeroIds(): number[];
  currentLobbyFormationPowerSnapshot(stageCode?: string): LobbyFormationPowerSnapshot;
  selectLobbyAdventureStage(stageCode: string): void;
  previewLockedLobbyAdventureStage(stageCode: string): void;
  openLobbyFormationPanel(stageCode?: string): void;
  openLobbyBattlePreviewPanel(stageCode: string): void;
  openLobbyHeroRosterPanel(): void;
  closeLobbyAdventurePanel(): void;
  reloadLobbyAdventure(): void;
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

/** 大厅冒险主线地图面板；MAIN_1_1 至 MAIN_25_16 首通结算以后端白名单为准。 */
export class LobbyAdventurePanelRenderer {
  private currentLayout: UiLayout | null = null;
  private challengeDialogRoot: Node | null = null;

  constructor(private readonly host: LobbyAdventurePanelHost) {}

  render(layout: UiLayout): void {
    this.currentLayout = layout;
    const state = this.host.currentLobbyAdventureState();
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(330 * scale, layout.stageWidth);
    const panelHeight = Math.max(270 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.createUiNode('LobbyAdventureDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    // 功能页采用场景式导航，遮罩只阻断底层输入，不再承担点击关闭语义。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyAdventureSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    // 面板内容区必须吞掉点击，避免点地图节点时穿透遮罩关闭面板。
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyAdventureSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(5, 5, 8, 232),
      rgba(196, 145, 62, 230),
      20 * scale,
    );
    this.drawPanelAtmosphere(panel, panelWidth, panelHeight, scale);
    this.renderHeader(panel, panelWidth, panelHeight, scale, state);
    this.renderBody(panel, panelWidth, panelHeight, scale, state);
    this.renderFooter(panel, panelWidth, panelHeight, scale);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyAdventureBackButton', () => this.host.closeLobbyAdventurePanel(), scale, '深渊爬塔', '挑战 BOSS 推进层数，层数越高挂机产出越高；挑战失败不掉层。\n\n战力不足时，先在英雄页升级、穿戴并强化装备，再回来挑战。');
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private renderHeader(parent: Node, width: number, height: number, scale: number, state: LobbyAdventurePanelState): void {
    // 中央标题移除:页面标题统一由左上返回组件的横幅承担。

    const adventure = state.adventure;
    const statusText = state.loading
      ? '正在读取主线推荐...'
      : state.error
        ? '主线推荐暂不可用，当前不进入战斗。'
        : adventure
          ? safeText(adventure.recommendationText)
          : '等待主线数据';
    const status = this.host.addChildLabel(
      parent,
      'LobbyAdventureStatus',
      statusText,
      0,
      height / 2 - 80 * scale, 19 * scale,
      rgba(204, 167, 88),
      new Size(width - 116 * scale, 28 * scale),
    );
    status.overflow = Label.Overflow.SHRINK;
    this.applyOutline(status, scale, false);
  }

  private renderBody(parent: Node, width: number, height: number, scale: number, state: LobbyAdventurePanelState): void {
    const top = height / 2 - 112 * scale;
    const bottom = -height / 2 + 86 * scale;
    const bodyHeight = Math.max(160 * scale, top - bottom);
    const bodyWidth = width - 76 * scale;
    if (state.loading && !state.adventure) {
      this.renderEmpty(parent, bodyWidth, bodyHeight, scale, '主线地图读取中，请稍候。');
      return;
    }
    if (!state.adventure) {
      this.renderEmpty(parent, bodyWidth, bodyHeight, scale, '主线地图暂不可用；不会进入战斗或结算。');
      return;
    }

    const compact = width < 780 * scale || height < 480 * scale;
    if (compact) {
      this.renderCompactBody(parent, bodyWidth, bodyHeight, scale, state);
      return;
    }

    // 横板布局:移除右侧详情栏,地图占满;关卡信息与编队入口改为地图右下浮动卡(完整详情在挑战确认弹框仍可见)。
    const leftWidth = bodyWidth * 0.16;
    const mapWidth = bodyWidth - leftWidth - 15 * scale;
    const leftX = -bodyWidth / 2 + leftWidth / 2;
    const mapX = -bodyWidth / 2 + leftWidth + 15 * scale + mapWidth / 2;
    const bodyY = (top + bottom) / 2;
    const selectedStage = this.resolveSelectedStage(state);
    this.renderChapterList(parent, state.adventure.chapters, leftX, bodyY, leftWidth, bodyHeight, scale, selectedStage?.stageCode ?? state.adventure.recommendedStageCode ?? '');
    this.renderStageMap(parent, state.adventure.chapters, mapX, bodyY, mapWidth, bodyHeight, scale, selectedStage?.stageCode ?? '');
    this.renderMapActionCard(parent, selectedStage, mapX, bodyY, mapWidth, bodyHeight, scale);
  }

  // 地图右下浮动行动卡:选中关卡名 + 战力线 + 编队确认按钮(节点名保持 LobbyAdventureFormationButton,验收脚本兼容)。
  private renderMapActionCard(parent: Node, stage: LobbyAdventureStageVO | null, mapX: number, mapY: number, mapWidth: number, mapHeight: number, scale: number): void {
    if (!stage) {
      return;
    }
    const cardWidth = Math.min(300 * scale, mapWidth * 0.34);
    const cardHeight = 118 * scale;
    const card = this.host.addChildPlainNode(parent, 'LobbyAdventureMapActionCard', mapX + mapWidth / 2 - cardWidth / 2 - 14 * scale, mapY - mapHeight / 2 + cardHeight / 2 + 14 * scale, cardWidth, cardHeight);
    const graphics = card.addComponent(Graphics);
    graphics.fillColor = rgba(10, 8, 9, 222);
    graphics.roundRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 8 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(196, 158, 92, 196);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.roundRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 8 * scale);
    graphics.stroke();
    const title = this.host.addChildLabel(card, 'LobbyAdventureMapActionTitle', safeText(stage.stageName), 0, cardHeight / 2 - 20 * scale, 18 * scale, rgba(248, 219, 151), new Size(cardWidth - 24 * scale, 24 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const powerLine = this.host.addChildLabel(card, 'LobbyAdventureMapActionPower', this.stagePowerLine(stage), 0, cardHeight / 2 - 44 * scale, 14 * scale, rgba(206, 186, 140), new Size(cardWidth - 24 * scale, 18 * scale));
    powerLine.overflow = Label.Overflow.SHRINK;
    const buttonWidth = Math.min(180 * scale, cardWidth - 36 * scale);
    const formationButton = this.host.addChildPlainNode(card, 'LobbyAdventureFormationButton', 0, -cardHeight / 2 + 28 * scale, buttonWidth, 36 * scale);
    const action = this.resolveStageAction(stage);
    if (action.enabled) {
      const buttonGraphics = formationButton.addComponent(Graphics);
      buttonGraphics.fillColor = rgba(34, 24, 17, 226);
      buttonGraphics.rect(-buttonWidth / 2, -18 * scale, buttonWidth, 36 * scale);
      buttonGraphics.fill();
      buttonGraphics.strokeColor = rgba(188, 137, 58, 216);
      buttonGraphics.stroke();
      formationButton.addComponent(Button);
      formationButton.on(Button.EventType.CLICK, () => {
        if (action.kind === 'upgrade') {
          this.host.openLobbyHeroRosterPanel();
          return;
        }
        this.host.selectLobbyAdventureStage(stage.stageCode);
        this.showChallengeDialog(stage.stageCode);
      }, this);
      this.host.applyImageButtonFeedback(formationButton, 1.025, 0.975);
    } else {
      this.drawDisabledButton(formationButton, buttonWidth, 36 * scale, scale);
    }
    const formationLabel = this.host.addChildLabel(formationButton, 'LobbyAdventureFormationButtonLabel', action.label, 0, 0, 19 * scale, action.enabled ? rgba(245, 211, 123) : rgba(179, 150, 91), new Size(buttonWidth, 34 * scale));
    formationLabel.overflow = Label.Overflow.SHRINK;
  }

  private renderCompactBody(parent: Node, width: number, height: number, scale: number, state: LobbyAdventurePanelState): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyAdventureCompactMap', 0, -4 * scale, width, height);
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(8, 8, 12, 186);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(138, 99, 50, 142);
    graphics.stroke();
    const allStages = state.adventure?.chapters.flatMap((chapter) => chapter.stages) ?? [];
    const selectedStage = this.resolveSelectedStage(state);
    const stages = this.visibleStageWindow(allStages, selectedStage?.stageCode ?? state.adventure?.recommendedStageCode ?? '', 5);
    const ctaHeight = 38 * scale;
    const rowAreaHeight = Math.max(80 * scale, height - ctaHeight - 18 * scale);
    const rowHeight = Math.min(44 * scale, Math.max(30 * scale, rowAreaHeight / Math.max(1, stages.length)));
    let y = height / 2 - rowHeight * 0.62;
    for (const [index, stage] of stages.entries()) {
      this.renderCompactStageRow(panel, stage, index, 0, y, width - 28 * scale, rowHeight - 6 * scale, scale, stage.stageCode === selectedStage?.stageCode);
      y -= rowHeight;
    }
    const recommended = selectedStage ?? stages.find((stage) => stage.recommended) ?? stages.find((stage) => this.canOpenBattleEntryStage(stage)) ?? null;
    const ctaWidth = Math.min(width - 34 * scale, 220 * scale);
    const cta = this.host.addChildPlainNode(panel, 'LobbyAdventureCompactFormationButton', 0, -height / 2 + ctaHeight / 2 + 10 * scale, ctaWidth, ctaHeight);
    if (recommended && this.canOpenBattleEntryStage(recommended)) {
      const stageCode = recommended.stageCode;
      const ctaGraphics = cta.addComponent(Graphics);
      ctaGraphics.fillColor = rgba(34, 24, 17, 226);
      ctaGraphics.rect(-ctaWidth / 2, -ctaHeight / 2, ctaWidth, ctaHeight);
      ctaGraphics.fill();
      ctaGraphics.strokeColor = rgba(188, 137, 58, 216);
      ctaGraphics.stroke();
      cta.addComponent(Button);
      cta.on(Button.EventType.CLICK, () => {
        this.host.selectLobbyAdventureStage(stageCode);
        this.showChallengeDialog(stageCode);
      }, this);
      this.host.applyImageButtonFeedback(cta, 1.025, 0.975);
    } else {
      this.drawDisabledButton(cta, ctaWidth, ctaHeight, scale);
    }
    const ctaLabel = this.host.addChildLabel(
      cta,
      'LobbyAdventureCompactFormationButtonLabel',
      this.stageActionLabel(recommended),
      0,
      0, 19 * scale,
      this.canOpenBattleEntryStage(recommended) ? rgba(245, 211, 123) : rgba(179, 150, 91),
      new Size(ctaWidth - 16 * scale, ctaHeight),
    );
    ctaLabel.overflow = Label.Overflow.SHRINK;
  }

  // 章节切换本地覆盖:点击锁定章节也能切地图查看(不写任何玩家状态)。
  private selectedChapterCode: string | null = null;

  private renderChapterList(parent: Node, chapters: LobbyAdventureChapterVO[], x: number, y: number, width: number, height: number, scale: number, activeStageCode: string): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyAdventureChapterList', x, y, width, height);
    const graphics = panel.addComponent(Graphics);
    this.drawSectionFrame(graphics, width, height, scale, rgba(7, 7, 10, 186));
    const title = this.host.addChildLabel(panel, 'LobbyAdventureChapterListTitle', '章节', 0, height / 2 - 26 * scale, 19 * scale, rgba(238, 204, 138), new Size(width - 24 * scale, 26 * scale));
    title.overflow = Label.Overflow.SHRINK;
    const rowHeight = Math.min(92 * scale, Math.max(66 * scale, (height - 70 * scale) / Math.max(1, chapters.length)));
    let rowY = height / 2 - 62 * scale;
    this.visibleChapterWindow(chapters, activeStageCode, 5).forEach((chapter, index) => {
      const active = this.selectedChapterCode
        ? chapter.chapterCode === this.selectedChapterCode
        : chapter.stages.some((stage) => stage.stageCode === activeStageCode || (!activeStageCode && stage.recommended));
      this.renderChapterRow(panel, chapter, index, 0, rowY - rowHeight / 2, width - 22 * scale, rowHeight - 8 * scale, scale, active);
      rowY -= rowHeight;
    });
  }

  private renderChapterRow(parent: Node, chapter: LobbyAdventureChapterVO, index: number, x: number, y: number, width: number, height: number, scale: number, active: boolean): void {
    const row = this.host.addChildPlainNode(parent, `LobbyAdventureChapter_${index}`, x, y, width, height);
    // 参考英雄界面分类签:默认纯深底细描边,仅选中行用 chapter_tab_active 金签;
    // 签图 1536×198 偏扁,按行高纵向加胖撑满(横幅构图轻度加胖可接受)。
    if (active) {
      const artHeight = Math.min(height - 4 * scale, width * (198 / 1536) * 2.0);
      if (!this.host.addSprite('LobbyAdventureChapterTabArt', ADVENTURE_AI_CHAPTER_TAB_ACTIVE_ASSET, 0, 0, width, artHeight, row)) {
        const graphics = row.addComponent(Graphics);
        graphics.fillColor = rgba(45, 14, 14, 218);
        graphics.rect(-width / 2, -height / 2 + 4 * scale, width, height - 8 * scale);
        graphics.fill();
        graphics.strokeColor = rgba(207, 145, 64, 196);
        graphics.lineWidth = Math.max(1, 1.2 * scale);
        graphics.rect(-width / 2, -height / 2 + 4 * scale, width, height - 8 * scale);
        graphics.stroke();
      }
    } else {
      const graphics = row.addComponent(Graphics);
      graphics.fillColor = rgba(14, 12, 14, 198);
      graphics.rect(-width / 2, -height / 2 + 4 * scale, width, height - 8 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(126, 106, 74, 122);
      graphics.lineWidth = Math.max(1, scale);
      graphics.rect(-width / 2, -height / 2 + 4 * scale, width, height - 8 * scale);
      graphics.stroke();
    }
    // 整行可点:切换地图显示章节;锁定章节走预览提示,不写玩家状态。
    row.addComponent(Button);
    row.on(Button.EventType.CLICK, () => {
      this.selectedChapterCode = chapter.chapterCode;
      const enterable = chapter.stages.find((stage) => this.canOpenBattleEntryStage(stage)) ?? null;
      if (enterable) {
        this.host.selectLobbyAdventureStage(enterable.stageCode);
        return;
      }
      const first = chapter.stages[0] ?? null;
      if (first) {
        this.host.previewLockedLobbyAdventureStage(first.stageCode);
      }
    }, this);
    this.host.applyImageButtonFeedback(row, 1.02, 0.98);
    // 章节名:单行,行内上下左右居中(旧羊皮图标与副标题按需求移除)。
    const title = this.host.addChildLabel(row, 'LobbyAdventureChapterName', safeText(chapter.chapterName), 0, 0, 20 * scale, active ? rgba(255, 228, 160) : rgba(216, 196, 150), new Size(width - 44 * scale, 26 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, active);
  }

  private renderStageMap(parent: Node, chapters: LobbyAdventureChapterVO[], x: number, y: number, width: number, height: number, scale: number, selectedStageCode: string): void {
    // Stage 13A：接入 BattleStageMapRenderer（虚线路径 + Boss 节点 + 章节标题）
    const mapHost: BattleStageMapHost = {
      createUiNode: (name) => this.host.createUiNode(name),
      addChildPlainNode: (p2, name, x2, y2, w2, h2) => this.host.addChildPlainNode(p2, name, x2, y2, w2, h2),
      addChildLabel: (p2, name, text, x2, y2, fs, color, size, align) => this.host.addChildLabel(p2, name, text, x2, y2, fs, color, size, align),
      addSprite: (name, assetPath, x2, y2, w2, h2, p2) => this.host.addSprite(name, assetPath, x2, y2, w2, h2, p2),
      applyImageButtonFeedback: (node, hover, pressed) => this.host.applyImageButtonFeedback(node, hover, pressed),
      selectStage: (stageCode) => {
        const stage = chapters.flatMap((chapter) => chapter.stages).find((item) => item.stageCode === stageCode) ?? null;
        if (!this.canOpenBattleEntryStage(stage)) {
          this.host.previewLockedLobbyAdventureStage(stageCode);
          return;
        }
        this.host.selectLobbyAdventureStage(stageCode);
        this.showChallengeDialog(stageCode);
      },
      previewLockedStage: (stageCode) => this.host.previewLockedLobbyAdventureStage(stageCode),
    };
    const mapPanel = this.host.addChildPlainNode(parent, 'LobbyAdventureStageMap', x, y, width, height);
    const overrideChapter = this.selectedChapterCode ? chapters.find((c) => c.chapterCode === this.selectedChapterCode) ?? null : null;
    const activeChapter = overrideChapter || chapters.find((c) => c.stages.some((s) => s.stageCode === selectedStageCode)) || chapters[0] || null;
    const renderer = new BattleStageMapRenderer(mapHost);
    renderer.render(mapPanel, chapters, width, height, scale, selectedStageCode, activeChapter);
  }

  private renderStageNode(parent: Node, stage: LobbyAdventureStageVO, index: number, x: number, y: number, size: number, scale: number, selected: boolean): void {
    const node = this.host.addChildPlainNode(parent, `LobbyAdventureStageNode_${index}`, x, y, size, size);
    const graphics = node.addComponent(Graphics);
    const active = selected || stage.recommended;
    graphics.fillColor = selected ? rgba(112, 28, 24, 236) : stage.recommended ? rgba(102, 18, 22, 228) : stage.unlocked ? rgba(26, 20, 16, 216) : rgba(12, 12, 15, 170);
    graphics.circle(0, 0, size * 0.34);
    graphics.fill();
    graphics.strokeColor = selected ? rgba(255, 215, 118, 250) : active ? rgba(245, 184, 76, 232) : stage.unlocked ? rgba(168, 124, 61, 178) : rgba(88, 78, 66, 132);
    graphics.lineWidth = Math.max(1, selected ? 2.4 * scale : active ? 2 * scale : 1.2 * scale);
    graphics.circle(0, 0, size * 0.34);
    graphics.stroke();
    // C1812 关卡节点贴图：选中/推荐用 Boss 徽记，已通关用绿芽标记，普通可进入用红色路标，锁定保持暗圆底。
    if (stage.unlocked) {
      if (active) {
        const bossHeight = size * 0.92;
        this.host.addSprite('LobbyAdventureStageNodeArtBoss', ADVENTURE_C1812_STAGE_NODE_BOSS_ASSET, 0, size * 0.1, bossHeight * (73 / 90), bossHeight, node);
      } else if (safeText(stage.statusLabel).includes('通关')) {
        this.host.addSprite('LobbyAdventureStageNodeArtClear', ADVENTURE_C1812_STAGE_NODE_CLEAR_ASSET, 0, size * 0.04, size * 0.62, size * 0.62, node);
      } else {
        this.host.addSprite('LobbyAdventureStageNodeArt', ADVENTURE_C1812_STAGE_NODE_ASSET, 0, size * 0.04, size * 0.62, size * 0.62, node);
      }
    }
    if (this.canOpenBattleEntryStage(stage)) {
      // 点击关卡只更新本地本次选择，不保存主线进度，也不触发战斗或经济写入。
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => this.host.selectLobbyAdventureStage(stage.stageCode), this);
      this.host.applyImageButtonFeedback(node, 1.035, 0.965);
    } else {
      // 锁定或未进入前端白名单的节点只允许查看预览，不会进入编队或战斗。
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => this.host.previewLockedLobbyAdventureStage(stage.stageCode), this);
      this.host.applyImageButtonFeedback(node, 1.012, 0.988);
    }
    const label = this.host.addChildLabel(node, 'LobbyAdventureStageLabel', `${stage.orderNo}`, 0, 2 * scale, 22 * scale, active ? rgba(255, 222, 148) : rgba(210, 181, 125), new Size(size, 28 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    if (!stage.unlocked) {
      // 锁定标记优先用 C1812 锁图标，未就绪时回退“锁”字角标。
      const lockSize = size * 0.3;
      const lockArt = this.host.addSprite('LobbyAdventureStageLockArt', ADVENTURE_C1812_ICON_LOCK_ASSET, size * 0.22, size * 0.22, lockSize * (56 / 66), lockSize, node);
      if (!lockArt) {
        const lockBadge = this.host.addChildLabel(node, 'LobbyAdventureStageLockBadge', '锁', size * 0.22, size * 0.22, 15 * scale, rgba(151, 128, 82), new Size(size * 0.42, 20 * scale));
        lockBadge.overflow = Label.Overflow.SHRINK;
        this.applyOutline(lockBadge, scale, false);
      }
    }
    const stageName = selected ? `已选 ${safeText(stage.stageName)}` : stage.unlocked ? safeText(stage.stageName) : `锁定 ${safeText(stage.stageName)}`;
    const name = this.host.addChildLabel(node, 'LobbyAdventureStageName', stageName, 0, -size * 0.48, 16 * scale, selected ? rgba(255, 222, 148) : stage.unlocked ? rgba(214, 188, 128) : rgba(151, 128, 82), new Size(size * 1.45, 22 * scale));
    name.overflow = Label.Overflow.SHRINK;
  }

  private renderStageDetail(parent: Node, stage: LobbyAdventureStageVO | null, x: number, y: number, width: number, height: number, scale: number, state: LobbyAdventurePanelState): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyAdventureStageDetail', x, y, width, height);
    const graphics = panel.addComponent(Graphics);
    this.drawSectionFrame(graphics, width, height, scale, rgba(8, 8, 10, 196));
    const adventure = state.adventure;
    const titleText = stage ? safeText(stage.stageName) : safeText(adventure?.recommendedStageName || '推荐关卡');
    const title = this.host.addChildLabel(panel, 'LobbyAdventureStageDetailTitle', titleText, 0, height / 2 - 34 * scale, 24 * scale, rgba(248, 219, 151), new Size(width - 34 * scale, 34 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);

    if (!stage) {
      const empty = this.host.addChildLabel(panel, 'LobbyAdventureStageDetailEmpty', '暂无推荐关卡。', 0, 0, 20 * scale, rgba(205, 185, 146), new Size(width - 40 * scale, 44 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }
    this.addDetailLine(panel, 'LobbyAdventureReqLevel', `等级要求 Lv.${stage.requiredLevel}`, -height * 0, height / 2 - 78 * scale, width, scale);
    this.addDetailLine(panel, 'LobbyAdventureUnlockHint', `解锁状态：${stage.unlocked ? safeText(stage.unlockHint) : safeText(stage.statusLabel)}`, 0, height / 2 - 108 * scale, width, scale);
    this.addDetailLine(panel, 'LobbyAdventureUnlockGap', this.stageUnlockGapText(stage), 0, height / 2 - 138 * scale, width, scale);
    this.addDetailLine(panel, 'LobbyAdventureReqPower', this.stagePowerLine(stage), 0, height / 2 - 168 * scale, width, scale);
    this.addDetailLine(panel, 'LobbyAdventureEnemy', `敌方：${safeText(stage.enemySummary)}`, 0, height / 2 - 198 * scale, width, scale);
    const rewardTitle = this.host.addChildLabel(panel, 'LobbyAdventureRewardTitle', this.stageRewardTitle(stage), -width / 2 + 20 * scale, height / 2 - 234 * scale, 17 * scale, rgba(221, 173, 85), new Size(width - 40 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    rewardTitle.overflow = Label.Overflow.SHRINK;
    const rewards = stage.rewardPreview.length > 0 ? stage.rewardPreview : ['当前阶段不发放奖励；仅展示关卡配置占位'];
    rewards.slice(0, 4).forEach((reward, index) => {
      this.addDetailLine(panel, `LobbyAdventureReward_${index}`, `· ${safeText(reward)}`, 0, height / 2 - (262 + index * 24) * scale, width, scale);
    });
    this.renderRecentBattleSummary(panel, stage.stageCode, width, height, scale);
    const lockedText = this.stageNextGuidanceText(stage);
    const lock = this.host.addChildLabel(panel, 'LobbyAdventureReadonlyNote', lockedText, 0, -height / 2 + 58 * scale, 17 * scale, rgba(170, 148, 105), new Size(width - 36 * scale, 42 * scale));
    lock.lineHeight = 21 * scale;
    lock.overflow = Label.Overflow.SHRINK;
    const buttonWidth = Math.min(160 * scale, width - 40 * scale);
    const formationButton = this.host.addChildPlainNode(panel, 'LobbyAdventureFormationButton', 0, -height / 2 + 24 * scale, buttonWidth, 36 * scale);
    const action = this.resolveStageAction(stage);
    if (action.enabled) {
      const graphics = formationButton.addComponent(Graphics);
      graphics.fillColor = rgba(34, 24, 17, 226);
      graphics.rect(-buttonWidth / 2, -18 * scale, buttonWidth, 36 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(188, 137, 58, 216);
      graphics.stroke();
      formationButton.addComponent(Button);
      formationButton.on(Button.EventType.CLICK, () => {
        if (action.kind === 'upgrade') {
          this.host.openLobbyHeroRosterPanel();
          return;
        }
        this.host.selectLobbyAdventureStage(stage.stageCode);
        this.showChallengeDialog(stage.stageCode);
      }, this);
      this.host.applyImageButtonFeedback(formationButton, 1.025, 0.975);
    } else {
      this.drawDisabledButton(formationButton, buttonWidth, 36 * scale, scale);
    }
    const formationLabel = this.host.addChildLabel(formationButton, 'LobbyAdventureFormationButtonLabel', action.label, 0, 0, 19 * scale, action.enabled ? rgba(245, 211, 123) : rgba(179, 150, 91), new Size(buttonWidth, 34 * scale));
    formationLabel.overflow = Label.Overflow.SHRINK;
  }

  private renderRecentBattleSummary(parent: Node, stageCode: string, width: number, height: number, scale: number): void {
    const battleState = this.host.currentLobbyBattleState();
    const stageRecord = battleState.recentBattles.find((record) => record.stageCode === stageCode) ?? null;
    const latest = battleState.recentBattles[0] ?? null;
    const primaryText = battleState.recentLoading
      ? '最近挑战记录读取中...'
      : battleState.recentError
        ? '最近挑战记录暂不可用'
        : stageRecord
          ? `本关 ${stageRecord.result} · ${formatRecentTime(stageRecord.recordedTime)}`
          : latest
            ? `本关暂无记录；最近挑战 ${latest.stageCode}`
            : '本关暂无最近挑战记录';
    const guardText = battleState.recentLoading
      ? '只读接口同步中，不进入结算。'
      : battleState.recentError
        ? '可刷新重试；失败不会改变玩家资源。'
          : stageRecord
            ? stageRecord.rewardGranted && stageRecord.economyApplied
              ? `首通奖励已结算 · ${stageRecord.settlementMode}`
              : stageRecord.readonlyEconomy && !stageRecord.economyApplied
                ? '无奖励记录 · 资源未变更'
                : '资源状态待核验'
          : latest
            ? latest.rewardGranted && latest.economyApplied
              ? `${latest.result} · ${latest.stageCode} 首通奖励已结算`
              : `${latest.result} · 无奖励记录 · 只读展示`
            : '完成一次主线挑战后会在这里显示记录。';
    const cardWidth = width - 38 * scale;
    const cardHeight = 54 * scale;
    const card = this.host.addChildPlainNode(parent, 'LobbyAdventureRecentBattleSummaryCard', 0, -height / 2 + 118 * scale, cardWidth, cardHeight);
    const graphics = card.addComponent(Graphics);
    graphics.fillColor = rgba(6, 7, 10, 202);
    graphics.rect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
    graphics.fill();
    graphics.strokeColor = stageRecord ? rgba(94, 151, 164, 154) : rgba(124, 96, 51, 128);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();
    const title = this.host.addChildLabel(card, 'LobbyAdventureRecentBattleTitle', '最近战斗记录', -cardWidth / 2 + 12 * scale, 11 * scale, 13 * scale, rgba(221, 173, 85), new Size(cardWidth - 24 * scale, 18 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    const label = this.host.addChildLabel(card, 'LobbyAdventureRecentBattleSummary', primaryText, -cardWidth / 2 + 12 * scale, -4 * scale, 15 * scale, latest || stageRecord ? rgba(186, 218, 231) : rgba(156, 139, 101), new Size(cardWidth - 24 * scale, 18 * scale), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
    const guard = this.host.addChildLabel(card, 'LobbyAdventureRecentBattleGuard', guardText, -cardWidth / 2 + 12 * scale, -18 * scale, 13 * scale, rgba(162, 145, 106), new Size(cardWidth - 24 * scale, 16 * scale), HorizontalTextAlignment.LEFT);
    guard.overflow = Label.Overflow.SHRINK;
  }

  private addDetailLine(parent: Node, name: string, text: string, x: number, y: number, width: number, scale: number): void {
    const label = this.host.addChildLabel(parent, name, text, x, y, 18 * scale, rgba(211, 192, 151), new Size(width - 40 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
  }

  private stageUnlockGapText(stage: LobbyAdventureStageVO): string {
    if (stage.levelGap > 0 || stage.expToRequiredLevel > 0) {
      return `距离要求：${formatInteger(stage.levelGap)} 级 / ${formatInteger(stage.expToRequiredLevel)} EXP`;
    }
    return `进入条件：${safeText(stage.unlockHint)}`;
  }

  private stagePowerLine(stage: LobbyAdventureStageVO): string {
    const power = this.host.currentLobbyFormationPowerSnapshot(stage.stageCode);
    if (!power.rosterLoaded) {
      return `战力：推荐 ${formatInteger(stage.recommendedPower)}；英雄队列读取中`;
    }
    if (power.recommendedPower <= 0) {
      return `战力：当前阵容 ${formatInteger(power.currentPower)}；推荐战力读取中`;
    }
    if (power.enough) {
      return `战力：当前阵容 ${formatInteger(power.currentPower)} / 推荐 ${formatInteger(power.recommendedPower)}，达标`;
    }
    return `战力：当前阵容 ${formatInteger(power.currentPower)} / 推荐 ${formatInteger(power.recommendedPower)}，还差 ${formatInteger(power.powerGap)}`;
  }

  private stageRewardTitle(stage: LobbyAdventureStageVO): string {
    if (stage.growthSourceStatus === 'FIRST_CLEAR_USED_UP') {
      return '首通奖励已发放（重复挑战不再发放）';
    }
    if (!this.canOpenBattleEntryStage(stage) || !stage.unlocked || stage.lockReasonCode === 'PHASE_LOCKED') {
      return '奖励预览（首通结算后发放）';
    }
    return '首通奖励（胜利结算后发放）';
  }

  private stageActionLabel(stage: LobbyAdventureStageVO | null): string {
    if (!stage) {
      return '暂无可进入关卡';
    }
    if (this.canOpenBattleEntryStage(stage)) {
      const power = this.host.currentLobbyFormationPowerSnapshot(stage.stageCode);
      if (!power.rosterLoaded) {
        return '读取英雄';
      }
      return power.enough ? '编队确认' : '去升级英雄';
    }
    if (stage.unlocked || stage.lockReasonCode === 'PHASE_LOCKED' || stage.growthSourceStatus === 'FIRST_CLEAR_USED_UP') {
      return '仅预览';
    }
    if (stage.lockReasonCode === 'PROGRESS_REQUIRED') {
      return '主线未达';
    }
    return '等级不足';
  }

  private resolveStageAction(stage: LobbyAdventureStageVO): { label: string; enabled: boolean; kind: 'formation' | 'upgrade' | 'disabled' } {
    if (!this.canOpenBattleEntryStage(stage)) {
      return { label: this.stageActionLabel(stage), enabled: false, kind: 'disabled' };
    }
    const power = this.host.currentLobbyFormationPowerSnapshot(stage.stageCode);
    if (!power.rosterLoaded) {
      return { label: '读取英雄', enabled: false, kind: 'disabled' };
    }
    if (!power.enough) {
      return { label: '去升级英雄', enabled: true, kind: 'upgrade' };
    }
    return { label: '编队确认', enabled: true, kind: 'formation' };
  }

  private stageNextGuidanceText(stage: LobbyAdventureStageVO): string {
    if (!this.canOpenBattleEntryStage(stage)) {
      const title = safeText(stage.nextGuidanceTitle) || safeText(stage.statusLabel) || '关卡暂未解锁';
      const hint = this.compactGrowthHint(stage) || safeText(stage.unlockHint) || '当前未开放新的经验获取入口。';
      return `${title}\n${hint}`;
    }
    if (stage.unlocked) {
      const summary = stage.repeatableExpAvailable ? '存在可重复经验入口' : this.compactGrowthHint(stage);
      return `${safeText(stage.nextGuidanceText) || '可进入编队确认；战斗胜利后自动提交结算。'}\n${summary || '结算成功后扣除体力并发放首通奖励。'}`;
    }
    const title = safeText(stage.nextGuidanceTitle) || safeText(stage.statusLabel) || '关卡暂未解锁';
    const hint = this.compactGrowthHint(stage) || safeText(stage.unlockHint) || '当前未开放新的经验获取入口。';
    return `${title}\n${hint}`;
  }

  private compactGrowthHint(stage: LobbyAdventureStageVO): string {
    if (stage.growthSourceStatus === 'FIRST_CLEAR_USED_UP') {
      return '首通经验已用完；暂无重复经验入口。';
    }
    if (stage.growthSourceStatus === 'NEXT_FIRST_CLEAR_AVAILABLE') {
      return '首通胜利才发放玩家经验；重复挑战不加经验。';
    }
    if (stage.growthSourceStatus === 'NEXT_STAGE_READONLY') {
      return '解锁后进入首通结算；胜利自动发放奖励与经验。';
    }
    return safeText(stage.growthSourceHint);
  }

  private renderCompactStageRow(parent: Node, stage: LobbyAdventureStageVO, index: number, x: number, y: number, width: number, height: number, scale: number, selected: boolean): void {
    const row = this.host.addChildPlainNode(parent, `LobbyAdventureCompactStage_${index}`, x, y, width, height);
    const graphics = row.addComponent(Graphics);
    graphics.fillColor = selected ? rgba(82, 22, 20, 230) : !stage.unlocked ? rgba(12, 12, 15, 156) : stage.recommended ? rgba(67, 16, 18, 220) : rgba(10, 10, 13, 178);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = selected ? rgba(245, 190, 84, 230) : !stage.unlocked ? rgba(83, 73, 58, 126) : stage.recommended ? rgba(225, 162, 69, 190) : rgba(120, 90, 48, 126);
    graphics.stroke();
    if (this.canOpenBattleEntryStage(stage)) {
      row.addComponent(Button);
      row.on(Button.EventType.CLICK, () => {
        this.host.selectLobbyAdventureStage(stage.stageCode);
        this.showChallengeDialog(stage.stageCode);
      }, this);
      this.host.applyImageButtonFeedback(row, 1.012, 0.988);
    } else {
      // 紧凑视图同样只给锁定提示，不把锁定关卡传入编队确认。
      row.addComponent(Button);
      row.on(Button.EventType.CLICK, () => this.host.previewLockedLobbyAdventureStage(stage.stageCode), this);
      this.host.applyImageButtonFeedback(row, 1.006, 0.994);
    }
    const text = `${selected ? '已选 ' : stage.unlocked ? '' : '锁定 '}${stage.stageName}  Lv.${stage.requiredLevel}  ${stage.statusLabel}`;
    const label = this.host.addChildLabel(row, 'LobbyAdventureCompactStageText', text, 0, 0, 18 * scale, selected ? rgba(255, 222, 148) : stage.unlocked ? rgba(226, 199, 139) : rgba(154, 132, 91), new Size(width - 18 * scale, height), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderEmpty(parent: Node, width: number, bodyHeight: number, scale: number, text: string): void {
    const box = this.host.addChildPlainNode(parent, 'LobbyAdventureEmptyBox', 0, -8 * scale, width, Math.min(160 * scale, bodyHeight));
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(9, 9, 12, 168);
    graphics.rect(-width / 2, -60 * scale, width, 120 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 124);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyAdventureEmptyText', text, 0, 0, 20 * scale, rgba(213, 193, 151), new Size(width - 48 * scale, 48 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private renderFooter(parent: Node, width: number, height: number, scale: number): void {
    const note = this.host.addChildLabel(
      parent,
      'LobbyAdventureBoundaryNote',
      '年度主线 MAIN_1_1 至 MAIN_25_16 已配置；战斗胜利后自动提交结算并发放奖励。',
      0,
      -height / 2 + 62 * scale, 17 * scale,
      rgba(168, 146, 105),
      new Size(width - 112 * scale, 24 * scale),
    );
    note.overflow = Label.Overflow.SHRINK;
    const reload = this.addFooterButton(parent, 'LobbyAdventureReloadButton', '刷新', 0, -height / 2 + 30 * scale, 112 * scale, 36 * scale, scale);
    reload.on(Button.EventType.CLICK, () => this.host.reloadLobbyAdventure(), this);
  }

  private addFooterButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number): Node {
    const button = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const graphics = button.addComponent(Graphics);
    graphics.fillColor = rgba(20, 16, 15, 226);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(188, 137, 58, 216);
    graphics.stroke();
    button.addComponent(Button);
    this.host.applyImageButtonFeedback(button, 1.025, 0.975);
    const label = this.host.addChildLabel(button, `${name}Label`, text, 0, 0, 20 * scale, rgba(245, 211, 123), new Size(width, height));
    label.overflow = Label.Overflow.SHRINK;
    return button;
  }

  private showChallengeDialog(stageCode: string): void {
    // Stage 13B：选关后弹出挑战弹框（敌方阵容/奖励/条件/我方阵容/布阵/挑战）
    this.closeChallengeDialog();
    const state = this.host.currentLobbyAdventureState();
    if (!state.adventure) return;
    const allStages = state.adventure.chapters.flatMap((c) => c.stages);
    const stage = allStages.find((s) => s.stageCode === stageCode);
    if (!stage) return;
    const heroState = this.host.currentLobbyHeroRosterState();
    const visibleHeroes = heroState.heroes.filter((hero) => hero.id > 0 && !hero.protagonist && hero.rarity.toUpperCase() !== 'EX' && !hero.heroCode.toUpperCase().startsWith('EX_'));
    const heroById = new Map(visibleHeroes.map((hero) => [hero.id, hero]));
    const selectedIds = this.host.currentLobbyFormationHeroIds();
    const formation = (selectedIds.length > 0
      ? selectedIds.map((heroId) => heroById.get(heroId)).filter((hero): hero is (typeof visibleHeroes)[number] => !!hero)
      : visibleHeroes.sort((a, b) => b.power - a.power)
    ).slice(0, 4);
    const power = this.host.currentLobbyFormationPowerSnapshot(stageCode);
    // 战力不足也允许挑战(策划 2026-07-10):不再用 power.enough 拦截,只要关卡开放+英雄队列已加载即可挑战。
    const canChallenge = this.canOpenBattleEntryStage(stage) && power.rosterLoaded;
    const layout = this.currentLayout;
    const layoutWidth = Math.max(1, layout?.width ?? 1280);
    const layoutHeight = Math.max(1, layout?.height ?? 720);
    const centerX = layout ? (layout.stageLeft + layout.stageRight) / 2 : 0;
    const centerY = layout ? (layout.stageTop + layout.stageBottom) / 2 : 0;
    const scale = Math.max(0.62, Math.min(1, layout?.uiScale ?? 1));
    let dialogRoot: Node | null = null;
    const closeDialog = (): void => {
      if (dialogRoot?.isValid) {
        dialogRoot.removeFromParent();
        dialogRoot.destroy();
      }
      if (this.challengeDialogRoot === dialogRoot) {
        this.challengeDialogRoot = null;
      }
      dialogRoot = null;
    };
    const dialogHost: BattleChallengeDialogHost = {
      node: this.host.node,
      createUiNode: (name) => this.host.createUiNode(name),
      addChildPlainNode: (p, name, x, y, w, h) => this.host.addChildPlainNode(p, name, x, y, w, h),
      addChildBeveledPanelNode: (p, name, x, y, w, h, fill, stroke, bevel) => this.host.addChildBeveledPanelNode(p, name, x, y, w, h, fill, stroke, bevel),
      addChildLabel: (p, name, text, x, y, fs, color, size, align) => this.host.addChildLabel(p, name, text, x, y, fs, color, size, align),
      addSprite: (name, assetPath, x, y, w, h, p) => this.host.addSprite(name, assetPath, x, y, w, h, p),
      applyImageButtonFeedback: (node, hover, pressed) => this.host.applyImageButtonFeedback(node, hover, pressed),
      openFormation: (stageCode) => {
        closeDialog();
        if (stageCode === stage.stageCode) {
          this.host.openLobbyFormationPanel(stage.stageCode);
          return;
        }
        this.host.openLobbyFormationPanel(stageCode);
      },
      startBattle: () => {
        closeDialog();
        this.host.openLobbyBattlePreviewPanel(stage.stageCode);
      },
      closeChallengeDialog: () => closeDialog(),
    };
    const renderer = new BattleChallengeDialogRenderer(dialogHost);
    dialogRoot = renderer.render(centerX, centerY, layoutWidth, layoutHeight, scale, stage, formation, canChallenge);
    this.challengeDialogRoot = dialogRoot;
  }

  private closeChallengeDialog(): void {
    const root = this.challengeDialogRoot;
    this.challengeDialogRoot = null;
    if (!root?.isValid) {
      return;
    }
    root.removeFromParent();
    root.destroy();
  }

  private resolveSelectedStage(state: LobbyAdventurePanelState): LobbyAdventureStageVO | null {
    const adventure = state.adventure;
    if (!adventure) {
      return null;
    }
    const stages = adventure.chapters.flatMap((chapter) => chapter.stages);
    const selectedStageCode = this.host.currentLobbySelectedStageCode();
    const recommended = stages.find((stage) => stage.stageCode === adventure.recommendedStageCode)
      ?? stages.find((stage) => stage.recommended)
      ?? null;
    const selected = stages.find((stage) => stage.stageCode === selectedStageCode) ?? null;
    if (this.isReadonlyRecommendedStage(recommended) && selected?.stageCode !== recommended?.stageCode) {
      return recommended;
    }
    return selected
      ?? recommended
      ?? stages.find((stage) => this.canOpenBattleEntryStage(stage))
      ?? null;
  }

  private canOpenBattleEntryStage(stage: LobbyAdventureStageVO | null): boolean {
    return !!stage && stage.unlocked && isAnnualMainlineStage(stage.stageCode);
  }

  private isReadonlyRecommendedStage(stage: LobbyAdventureStageVO | null): boolean {
    return !!stage
      && stage.recommended
      && !this.canOpenBattleEntryStage(stage)
      && (stage.lockReasonCode === 'PHASE_LOCKED' || stage.growthSourceStatus === 'FIRST_CLEAR_USED_UP' || !stage.unlocked);
  }

  private visibleStageWindow(stages: LobbyAdventureStageVO[], centerStageCode: string, maxCount: number): LobbyAdventureStageVO[] {
    if (stages.length <= maxCount) {
      return stages;
    }
    const safeMax = Math.max(1, maxCount);
    const preferredIndex = Math.max(
      0,
      stages.findIndex((stage) => stage.stageCode === centerStageCode),
    );
    const half = Math.floor(safeMax / 2);
    const start = Math.max(0, Math.min(stages.length - safeMax, preferredIndex - half));
    return stages.slice(start, start + safeMax);
  }

  private visibleChapterWindow(chapters: LobbyAdventureChapterVO[], activeStageCode: string, maxCount: number): LobbyAdventureChapterVO[] {
    if (chapters.length <= maxCount) {
      return chapters;
    }
    const safeMax = Math.max(1, maxCount);
    const preferredIndex = Math.max(
      0,
      chapters.findIndex((chapter) => chapter.stages.some((stage) => stage.stageCode === activeStageCode || (!activeStageCode && stage.recommended))),
    );
    const half = Math.floor(safeMax / 2);
    const start = Math.max(0, Math.min(chapters.length - safeMax, preferredIndex - half));
    return chapters.slice(start, start + safeMax);
  }

  private drawPanelAtmosphere(parent: Node, width: number, height: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'LobbyAdventurePanelAtmosphere', 0, 0, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(99, 12, 19, 44);
    graphics.rect(-width / 2 + 18 * scale, height / 2 - 94 * scale, width - 36 * scale, 50 * scale);
    graphics.fill();
    graphics.fillColor = rgba(197, 64, 42, 36);
    graphics.circle(width * 0.16, height * 0.06, Math.min(width, height) * 0.22);
    graphics.fill();
  }

  private drawSectionFrame(graphics: Graphics, width: number, height: number, scale: number, fill: Color): void {
    graphics.fillColor = fill;
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(137, 100, 50, 136);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.stroke();
  }

  private drawMapVeins(graphics: Graphics, width: number, height: number, scale: number): void {
    graphics.strokeColor = rgba(107, 40, 38, 120);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(-width / 2 + 40 * scale, -height * 0.05);
    graphics.bezierCurveTo(-width * 0.18, height * 0.22, width * 0.08, -height * 0.18, width / 2 - 44 * scale, height * 0.06);
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

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 226 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
  }
}

function isAnnualMainlineStage(stageCode: string): boolean {
  const match = /^MAIN_(\d{1,2})_(\d{1,2})$/.exec(stageCode);
  if (!match) {
    return false;
  }
  const chapter = Number(match[1]);
  const stage = Number(match[2]);
  let order = 0;
  if (chapter === 1) {
    order = stage >= 1 && stage <= FIRST_CHAPTER_STAGE_COUNT ? stage : 0;
  } else if (chapter >= 2 && chapter <= 25 && stage >= 1 && stage <= STAGES_PER_CHAPTER_AFTER_FIRST) {
    order = FIRST_CHAPTER_STAGE_COUNT + (chapter - 2) * STAGES_PER_CHAPTER_AFTER_FIRST + stage;
  }
  return order >= 1 && order <= ANNUAL_MAINLINE_TOTAL_STAGES;
}

function formatInteger(value: number | null | undefined): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return numeric.toLocaleString('en-US');
}

function formatRecentTime(value: string): string {
  const safe = safeText(value);
  if (!safe) {
    return '时间未知';
  }
  return safe.slice(0, 16).replace('T', ' ');
}
