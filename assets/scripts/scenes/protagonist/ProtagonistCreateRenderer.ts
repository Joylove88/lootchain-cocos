import {
  BlockInputEvents,
  Button,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
  UITransform,
  Vec3,
} from 'cc';
import { PROTAGONIST_FORM_OPTIONS, type ProtagonistCreateFormState, type ProtagonistForm, type ProtagonistGender } from '../../types/ProtagonistTypes';
import { clamp, rgba, type UiLayout } from '../lobby/LobbyHudTypes';

const PROTAGONIST_ART_ASSETS: Record<ProtagonistGender, string> = {
  male: 'ui/protagonist/protagonist_male_attack/spriteFrame',
  female: 'ui/protagonist/protagonist_female_attack/spriteFrame',
};

export interface ProtagonistCreateRendererHost {
  node: Node;
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
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean): EditBox;
  addGoldButton(text: string, x: number, y: number, callback: () => void, layout: UiLayout, width: number, height: number): Button;
  setProtagonistNameInput(input: EditBox | null): void;
  selectProtagonistGender(gender: ProtagonistGender): void;
  previewProtagonistForm(form: ProtagonistForm): void;
  submitProtagonistCreate(): void;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor(node: Node): void;
}

/** 主角色创建界面渲染器；只负责 Cocos UI，不决定主角属性和战斗强度。 */
export class ProtagonistCreateRenderer {
  constructor(private readonly host: ProtagonistCreateRendererHost) {}

  render(layout: UiLayout, state: ProtagonistCreateFormState): void {
    const metrics = this.resolveMetrics(layout);
    this.renderBackdrop(layout);
    const scene = this.createRootGroup('ProtagonistCreatePanel', metrics.centerX, metrics.centerY, metrics.panelWidth, metrics.panelHeight);
    scene.addComponent(BlockInputEvents);
    this.drawFullSceneFrame(scene, metrics.panelWidth, metrics.panelHeight, metrics.scale);
    this.renderTitle(scene, metrics);
    this.renderGenderCards(scene, metrics, state);
    this.renderFormArea(scene, metrics, state);
    this.renderCreateControls(layout, metrics, state);
  }

  private resolveMetrics(layout: UiLayout): ProtagonistMetrics {
    const rawScale = Math.min(layout.safeWidth / 1520, layout.safeHeight / 860);
    const scale = clamp(rawScale, 0.34, 1);
    const panelWidth = Math.max(320 * scale, layout.safeWidth - 16 * scale);
    const panelHeight = Math.max(180 * scale, layout.safeHeight - 12 * scale);
    const centerX = (layout.safeLeft + layout.safeRight) / 2;
    const centerY = (layout.safeTop + layout.safeBottom) / 2;
    const compact = panelWidth < 720 || panelHeight < 420;
    return {
      scale,
      panelWidth,
      panelHeight,
      centerX,
      centerY,
      compact,
    };
  }

  private renderBackdrop(layout: UiLayout): void {
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const backdrop = this.createRootGroup('ProtagonistCreateBackdrop', centerX, centerY, layout.width, layout.height);
    const graphics = backdrop.addComponent(Graphics);
    graphics.fillColor = rgba(4, 4, 7, 214);
    graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    graphics.fill();

    // 用低成本 Cocos 图形塑造大殿轮廓，最终资产会拆成背景图和 UI 切图。
    graphics.fillColor = rgba(104, 12, 18, 56);
    graphics.rect(-layout.stageWidth * 0.08, -layout.stageHeight / 2, layout.stageWidth * 0.16, layout.stageHeight);
    graphics.fill();
    graphics.strokeColor = rgba(188, 42, 39, 84);
    graphics.lineWidth = Math.max(1, layout.uiScale * 2);
    for (let index = -3; index <= 3; index += 1) {
      const x = index * layout.stageWidth * 0.12;
      const towerHeight = layout.stageHeight * (0.28 + Math.abs(index) * 0.025);
      graphics.moveTo(x, -layout.stageHeight / 2);
      graphics.lineTo(x, -layout.stageHeight / 2 + towerHeight);
      graphics.lineTo(x + layout.stageWidth * 0.018, -layout.stageHeight / 2 + towerHeight * 0.78);
      graphics.stroke();
    }
  }

  private renderTitle(parent: Node, metrics: ProtagonistMetrics): void {
    const title = this.host.addChildLabel(
      parent,
      'ProtagonistCreateTitle',
      '选择角色',
      -metrics.panelWidth / 2 + 64 * metrics.scale,
      metrics.panelHeight / 2 - 54 * metrics.scale,
      40 * metrics.scale,
      rgba(248, 219, 150),
      new Size(220 * metrics.scale, 52 * metrics.scale),
      HorizontalTextAlignment.LEFT,
    );
    this.applyOutline(title, metrics.scale, true);
    const subtitle = this.host.addChildLabel(
      parent,
      'ProtagonistCreateSubtitle',
      '创建你的 SSR 主角。主角不进入抽卡池，攻击形态默认开放。',
      -metrics.panelWidth / 2 + 64 * metrics.scale,
      metrics.panelHeight / 2 - 96 * metrics.scale,
      18 * metrics.scale,
      rgba(185, 155, 100),
      new Size(metrics.compact ? metrics.panelWidth - 110 * metrics.scale : metrics.panelWidth * 0.58, 32 * metrics.scale),
      HorizontalTextAlignment.LEFT,
    );
    subtitle.overflow = Label.Overflow.SHRINK;
  }

  private renderGenderCards(parent: Node, metrics: ProtagonistMetrics, state: ProtagonistCreateFormState): void {
    const dense = this.isDenseCompact(metrics);
    const cardWidth = metrics.compact ? metrics.panelWidth * 0.31 : Math.min(metrics.panelWidth * 0.22, 330 * metrics.scale);
    const cardHeight = metrics.compact ? metrics.panelHeight * (dense ? 0.34 : 0.4) : Math.min(metrics.panelHeight * 0.66, 520 * metrics.scale);
    const cardY = metrics.compact ? metrics.panelHeight * (dense ? 0.26 : 0.2) : -metrics.panelHeight * 0.01;
    const gap = metrics.compact ? metrics.panelWidth * 0.1 : Math.max(72 * metrics.scale, metrics.panelWidth * 0.07);
    const maleX = metrics.compact ? -cardWidth / 2 - gap / 2 : -metrics.panelWidth * 0.21;
    const femaleX = metrics.compact ? cardWidth / 2 + gap / 2 : maleX + cardWidth + gap;
    this.renderGenderCard(parent, 'male', maleX, cardY, cardWidth, cardHeight, metrics.scale, state.selectedGender === 'male');
    this.renderGenderCard(parent, 'female', femaleX, cardY, cardWidth, cardHeight, metrics.scale, state.selectedGender === 'female');
  }

  private renderGenderCard(parent: Node, gender: ProtagonistGender, x: number, y: number, width: number, height: number, scale: number, selected: boolean): void {
    const card = this.host.addChildPlainNode(parent, `ProtagonistGenderCard_${gender}`, x, y, width, height);
    const graphics = card.addComponent(Graphics);
    this.drawCardFrame(graphics, width, height, scale, selected);
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, () => this.host.selectProtagonistGender(gender), this);
    this.host.applyImageButtonFeedback(card, 1.018, 0.985);
    this.host.applyPointerCursor(card);

    const label = gender === 'male' ? '男' : '女';
    const epithet = gender === 'male' ? '深渊誓刃' : '血月圣裁';
    const symbol = gender === 'male' ? '♂' : '♀';
    if (!this.renderCharacterArt(card, gender, width, height, scale)) {
      this.drawCharacterSilhouette(card, gender, width, height, scale, selected);
    }
    const genderLabel = this.host.addChildLabel(card, 'ProtagonistGenderLabel', label, 0, -height / 2 + 46 * scale, 30 * scale, rgba(246, 220, 155), new Size(width * 0.8, 42 * scale));
    this.applyOutline(genderLabel, scale, true);
    const epithetLabel = this.host.addChildLabel(card, 'ProtagonistEpithet', epithet, 0, -height / 2 + 18 * scale, 18 * scale, rgba(190, 156, 92), new Size(width * 0.86, 24 * scale));
    epithetLabel.overflow = Label.Overflow.SHRINK;
    const symbolLabel = this.host.addChildLabel(card, 'ProtagonistGenderSymbol', symbol, -width / 2 + 42 * scale, height / 2 - 52 * scale, 34 * scale, selected ? rgba(242, 92, 70) : rgba(148, 118, 70), new Size(56 * scale, 56 * scale));
    this.applyOutline(symbolLabel, scale, true);
    const badge = this.host.addChildLabel(card, 'ProtagonistSsrBadge', 'SSR 主角', width / 2 - 74 * scale, height / 2 - 34 * scale, 17 * scale, rgba(250, 221, 150), new Size(112 * scale, 26 * scale));
    badge.overflow = Label.Overflow.SHRINK;
  }

  private renderCharacterArt(parent: Node, gender: ProtagonistGender, width: number, height: number, scale: number): boolean {
    // P1 使用概念图裁切出的男女主角卡面资产；加载失败时保留剪影兜底，避免预览空卡。
    const artWidth = Math.min(width * 0.76, 250 * scale);
    const artHeight = Math.min(height * 0.72, 330 * scale);
    const sprite = this.host.addSprite(
      `ProtagonistCharacterArt_${gender}`,
      PROTAGONIST_ART_ASSETS[gender],
      0,
      24 * scale,
      artWidth,
      artHeight,
      parent,
    );
    return !!sprite;
  }

  private renderFormArea(parent: Node, metrics: ProtagonistMetrics, state: ProtagonistCreateFormState): void {
    const dense = this.isDenseCompact(metrics);
    const areaX = metrics.compact ? 0 : metrics.panelWidth * 0.34;
    const areaY = metrics.compact ? -metrics.panelHeight * (dense ? 0.08 : 0.14) : 8 * metrics.scale;
    const areaWidth = metrics.compact ? metrics.panelWidth * 0.78 : Math.min(metrics.panelWidth * 0.26, 440 * metrics.scale);
    const areaHeight = metrics.compact ? metrics.panelHeight * (dense ? 0.17 : 0.2) : Math.min(metrics.panelHeight * 0.44, 390 * metrics.scale);
    const area = this.host.addChildPlainNode(parent, 'ProtagonistFormPreview', areaX, areaY, areaWidth, areaHeight);
    const graphics = area.addComponent(Graphics);
    graphics.fillColor = rgba(8, 7, 8, 205);
    graphics.rect(-areaWidth / 2, -areaHeight / 2, areaWidth, areaHeight);
    graphics.fill();
    graphics.strokeColor = rgba(167, 121, 55, 180);
    graphics.stroke();

    const title = this.host.addChildLabel(
      area,
      'ProtagonistFormTitle',
      'SSR 主角形态',
      0,
      areaHeight / 2 - (dense ? 11 : 28) * metrics.scale,
      (dense ? 13 : 20) * metrics.scale,
      rgba(247, 220, 154),
      new Size(areaWidth - 34 * metrics.scale, (dense ? 18 : 30) * metrics.scale),
    );
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, metrics.scale, true);

    if (dense) {
      this.renderDenseFormChips(area, areaWidth, areaHeight, metrics.scale, state);
      return;
    }

    const chipHeight = 40 * metrics.scale;
    const chipGap = 10 * metrics.scale;
    const totalHeight = PROTAGONIST_FORM_OPTIONS.length * chipHeight + (PROTAGONIST_FORM_OPTIONS.length - 1) * chipGap;
    let y = Math.min(areaHeight / 2 - 72 * metrics.scale, totalHeight / 2 - chipHeight / 2);
    for (const option of PROTAGONIST_FORM_OPTIONS) {
      this.renderFormChip(area, option.code, option.label, option.detail, option.unlocked, state.selectedForm === option.code, 0, y, areaWidth - 32 * metrics.scale, chipHeight, metrics.scale);
      y -= chipHeight + chipGap;
    }
  }

  private renderFormChip(parent: Node, form: ProtagonistForm, label: string, detail: string, unlocked: boolean, selected: boolean, x: number, y: number, width: number, height: number, scale: number): void {
    const chip = this.host.addChildPlainNode(parent, `ProtagonistForm_${form}`, x, y, width, height);
    const graphics = chip.addComponent(Graphics);
    graphics.fillColor = selected ? rgba(100, 18, 20, 210) : rgba(15, 13, 12, unlocked ? 200 : 150);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = selected ? rgba(230, 164, 74, 235) : rgba(130, 101, 59, unlocked ? 170 : 104);
    graphics.stroke();
    chip.addComponent(Button);
    chip.on(Button.EventType.CLICK, () => this.host.previewProtagonistForm(form), this);
    this.host.applyImageButtonFeedback(chip, 1.014, 0.986);
    const icon = form === 'attack' ? '剑' : form === 'defense' ? '盾' : '契';
    this.host.addChildLabel(chip, 'ProtagonistFormIcon', icon, -width / 2 + 30 * scale, 0, 20 * scale, unlocked ? rgba(242, 210, 140) : rgba(132, 118, 92), new Size(42 * scale, height));
    const text = unlocked ? label : `${label}  锁定`;
    const title = this.host.addChildLabel(chip, 'ProtagonistFormLabel', text, -width / 2 + 58 * scale, 7 * scale, 18 * scale, unlocked ? rgba(242, 214, 156) : rgba(144, 132, 108), new Size(width - 70 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    const detailLabel = this.host.addChildLabel(chip, 'ProtagonistFormDetail', detail, -width / 2 + 58 * scale, -10 * scale, 14 * scale, rgba(159, 135, 92), new Size(width - 72 * scale, 18 * scale), HorizontalTextAlignment.LEFT);
    detailLabel.overflow = Label.Overflow.SHRINK;
  }

  private renderDenseFormChips(parent: Node, width: number, height: number, scale: number, state: ProtagonistCreateFormState): void {
    const chipGap = 6 * scale;
    const chipWidth = (width - 32 * scale - chipGap * 2) / 3;
    const chipHeight = Math.max(16 * scale, height - 38 * scale);
    const chipY = -height / 2 + 12 * scale + chipHeight / 2;
    for (let index = 0; index < PROTAGONIST_FORM_OPTIONS.length; index += 1) {
      const option = PROTAGONIST_FORM_OPTIONS[index];
      const chipX = -width / 2 + 16 * scale + chipWidth / 2 + index * (chipWidth + chipGap);
      this.renderDenseFormChip(parent, option.code, option.label, option.unlocked, state.selectedForm === option.code, chipX, chipY, chipWidth, chipHeight, scale);
    }
  }

  private renderDenseFormChip(parent: Node, form: ProtagonistForm, label: string, unlocked: boolean, selected: boolean, x: number, y: number, width: number, height: number, scale: number): void {
    const chip = this.host.addChildPlainNode(parent, `ProtagonistDenseForm_${form}`, x, y, width, height);
    const graphics = chip.addComponent(Graphics);
    graphics.fillColor = selected ? rgba(100, 18, 20, 210) : rgba(15, 13, 12, unlocked ? 196 : 138);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = selected ? rgba(230, 164, 74, 225) : rgba(130, 101, 59, unlocked ? 160 : 96);
    graphics.stroke();
    chip.addComponent(Button);
    chip.on(Button.EventType.CLICK, () => this.host.previewProtagonistForm(form), this);
    this.host.applyImageButtonFeedback(chip, 1.012, 0.988);
    const text = unlocked ? label : `${label} 锁`;
    const chipLabel = this.host.addChildLabel(chip, 'ProtagonistDenseFormLabel', text, 0, 0, Math.max(8, 12 * scale), unlocked ? rgba(238, 210, 150) : rgba(144, 132, 108), new Size(width - 8 * scale, height));
    chipLabel.overflow = Label.Overflow.SHRINK;
  }

  private renderCreateControls(layout: UiLayout, metrics: ProtagonistMetrics, state: ProtagonistCreateFormState): void {
    const dense = this.isDenseCompact(metrics);
    const compactControls = dense || layout.inputHeight > 30 * metrics.scale;
    const controlX = metrics.centerX + (metrics.compact ? 0 : metrics.panelWidth * 0.34);
    const buttonYOffset = dense ? 20 : compactControls ? 46 : 70;
    const buttonHeight = (dense ? 32 : compactControls ? 42 : 54) * metrics.scale;
    const inputWidth = Math.min(390 * metrics.scale, metrics.panelWidth * (dense ? 0.62 : 0.28));
    const inputY = metrics.centerY - metrics.panelHeight / 2 + (dense ? 128 : compactControls ? 132 : 154) * metrics.scale;
    const input = this.host.addFramedEditBox(state.protagonistName, controlX, inputY, inputWidth, layout);
    input.maxLength = 12;
    this.host.setProtagonistNameInput(input);

    this.host.addChildLabel(
      this.createRootGroup('ProtagonistCreateInputLabelLayer', controlX, inputY + (dense ? 30 : 39) * metrics.scale, inputWidth, 26 * metrics.scale),
      'ProtagonistNameLabel',
      '角色名',
      0,
      0,
      17 * metrics.scale,
      rgba(232, 194, 109),
      new Size(inputWidth, 26 * metrics.scale),
    );

    const buttonText = state.creating ? '创建中' : '进入游戏';
    const createButton = this.host.addGoldButton(
      buttonText,
      controlX,
      metrics.centerY - metrics.panelHeight / 2 + buttonYOffset * metrics.scale,
      () => this.host.submitProtagonistCreate(),
      layout,
      Math.min(360 * metrics.scale, metrics.panelWidth * (dense ? 0.54 : 0.42)),
      buttonHeight,
    );
    createButton.interactable = !state.creating;
    if (state.error) {
      const error = this.host.addChildLabel(
        this.createRootGroup('ProtagonistCreateErrorLayer', controlX, metrics.centerY - metrics.panelHeight / 2 + (dense ? 55 : 102) * metrics.scale, metrics.panelWidth * (metrics.compact ? 0.86 : 0.34), 24 * metrics.scale),
        'ProtagonistCreateError',
        state.error,
        0,
        0,
        14 * metrics.scale,
        rgba(255, 118, 118),
        new Size(metrics.panelWidth - 60 * metrics.scale, 24 * metrics.scale),
      );
      error.overflow = Label.Overflow.SHRINK;
    }
  }

  private drawFullSceneFrame(parent: Node, width: number, height: number, scale: number): void {
    const graphics = parent.addComponent(Graphics);
    // 全屏场景只保留薄边框和顶部/底部暗色压层，不再使用居中弹框视觉。
    graphics.fillColor = rgba(3, 3, 6, 92);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = rgba(0, 0, 0, 112);
    graphics.rect(-width / 2, height / 2 - 126 * scale, width, 126 * scale);
    graphics.rect(-width / 2, -height / 2, width, 118 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(207, 151, 68, 170);
    graphics.lineWidth = Math.max(1, 1.5 * scale);
    graphics.rect(-width / 2 + 10 * scale, -height / 2 + 10 * scale, width - 20 * scale, height - 20 * scale);
    graphics.stroke();
    graphics.strokeColor = rgba(199, 45, 41, 110);
    graphics.moveTo(-width * 0.18, height / 2 - 110 * scale);
    graphics.lineTo(width * 0.18, height / 2 - 110 * scale);
    graphics.moveTo(-width * 0.14, -height / 2 + 92 * scale);
    graphics.lineTo(width * 0.14, -height / 2 + 92 * scale);
    graphics.stroke();
  }

  private createRootGroup(name: string, x: number, y: number, width: number, height: number): Node {
    const node = this.host.createUiNode(name);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    return node;
  }

  private drawCardFrame(graphics: Graphics, width: number, height: number, scale: number, selected: boolean): void {
    graphics.fillColor = selected ? rgba(20, 10, 10, 230) : rgba(8, 8, 10, 214);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = selected ? rgba(224, 166, 72, 240) : rgba(128, 100, 58, 170);
    graphics.lineWidth = Math.max(1, 2 * scale);
    graphics.stroke();
    graphics.strokeColor = selected ? rgba(196, 26, 30, 170) : rgba(60, 32, 32, 110);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.rect(-width / 2 + 8 * scale, -height / 2 + 8 * scale, width - 16 * scale, height - 16 * scale);
    graphics.stroke();
  }

  private drawCharacterSilhouette(parent: Node, gender: ProtagonistGender, width: number, height: number, scale: number, selected: boolean): void {
    const figure = this.host.addChildPlainNode(parent, 'ProtagonistFigure', 0, 18 * scale, width * 0.72, height * 0.58);
    const graphics = figure.addComponent(Graphics);
    const glow = selected ? 255 : 150;
    graphics.fillColor = gender === 'male' ? rgba(34, 34, 38, glow) : rgba(38, 30, 34, glow);
    graphics.circle(0, height * 0.16, 20 * scale);
    graphics.fill();
    graphics.moveTo(-44 * scale, height * 0.04);
    graphics.lineTo(0, height * 0.15);
    graphics.lineTo(44 * scale, height * 0.04);
    graphics.lineTo(28 * scale, -height * 0.2);
    graphics.lineTo(-28 * scale, -height * 0.2);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = selected ? rgba(226, 64, 52, 185) : rgba(122, 89, 52, 132);
    graphics.lineWidth = Math.max(1, 2 * scale);
    graphics.moveTo(gender === 'male' ? -52 * scale : 50 * scale, -height * 0.18);
    graphics.lineTo(gender === 'male' ? 50 * scale : -50 * scale, height * 0.18);
    graphics.stroke();
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 220 : 170);
    label.outlineWidth = Math.max(1, (strong ? 1.1 : 0.8) * scale);
  }

  private isDenseCompact(metrics: ProtagonistMetrics): boolean {
    return metrics.compact;
  }
}

interface ProtagonistMetrics {
  scale: number;
  panelWidth: number;
  panelHeight: number;
  centerX: number;
  centerY: number;
  compact: boolean;
}
