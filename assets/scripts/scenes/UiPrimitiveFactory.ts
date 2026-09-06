import {
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
  VerticalTextAlignment,
} from 'cc';
import { gameAudio } from '../audio/GameAudio';
import { lootChainI18n } from '../i18n/LootChainI18n';
import { clamp, rgba, type UiLayout } from './lobby/LobbyHudTypes';
import { trimText } from './UiTextFormatter';
import { UiSpriteFrameCache, type UiSpriteFrameOverrides } from './UiSpriteFrameCache';

export type ButtonVisualState = 'hover' | 'normal' | 'pressed';

export interface UiPrimitiveFactoryHost {
  node: Node;
  createUiNode(name: string): Node;
  ensureContentRoot(): Node;
  resolveLayout(): UiLayout;
  setPointerCursor(enabled: boolean): void;
}

/**
 * 通用 Cocos UI 原语工厂。
 *
 * 登录页、loading、大厅 HUD 和资料弹窗都通过 Root wrapper 调到这里。
 * 这个类只负责创建/装饰 UI 节点，不持有业务状态，也不调用任何后端接口。
 */
export class UiPrimitiveFactory {
  constructor(
    private readonly host: UiPrimitiveFactoryHost,
    private readonly spriteFrameCache: UiSpriteFrameCache,
    private readonly spriteFrameOverrides: () => UiSpriteFrameOverrides,
  ) {}

  addLabel(text: string, x: number, y: number, size = 20, color = new Color(230, 230, 230), contentSize?: Size): Label {
    const translatedText = this.translateText(text);
    const node = this.host.createUiNode('Label');
    node.setPosition(new Vec3(x, y, 0));
    const transform = node.addComponent(UITransform);
    transform.setContentSize(contentSize ?? new Size(this.host.resolveLayout().statusWidth, 80));
    const label = node.addComponent(Label);
    label.string = trimText(translatedText);
    label.fontSize = size;
    label.lineHeight = size + 8;
    label.color = color;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.RESIZE_HEIGHT;
    return label;
  }

  addEditBox(initialText: string, x: number, y: number, width: number, layout?: UiLayout, password = false): EditBox {
    const currentLayout = layout ?? this.host.resolveLayout();
    const node = this.host.createUiNode('EditBox');
    // 先冻结节点(2026-09-06 四修):EditBox 的 __preload 在激活时才建 DOM——激活前把 inputMode
    // 设成 SINGLE_LINE,引擎就会按单行建 <input>(默认 ANY 会建带滚动条/文字顶对齐的 <textarea>),
    // 且尺寸/矩阵走官方 _syncSize 正常路径。此前 clear+init 手动重建的路径矩阵缓存不同步,已废弃。
    node.active = false;
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, currentLayout.inputHeight));
    const editBox = node.addComponent(EditBox);

    // Cocos EditBox 的默认文字样式不稳定，这里显式创建文本和占位 Label 便于统一风格。
    // 注意顺序(2026-09-06 五修):必须先把两个 Label 赋给组件,再碰 inputMode/inputFlag——
    // 这些 setter 会触发 _updateTextLabel,若此刻组件还没有 label 引擎会自建一套
    // 白色 40px 的默认 TEXT_LABEL/PLACEHOLDER_LABEL(占位文案就是"label")留在树上。
    const textNode = new Node('TextLabel');
    textNode.layer = node.layer;
    node.addChild(textNode);
    textNode.setPosition(Vec3.ZERO);
    textNode.addComponent(UITransform).setContentSize(new Size(width - 28, currentLayout.inputHeight));
    const textLabel = textNode.addComponent(Label);
    textLabel.fontSize = Math.max(13, currentLayout.bodyFont - 1);
    textLabel.lineHeight = currentLayout.bodyFont + 5;
    textLabel.color = rgba(231, 226, 214);
    textLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
    textLabel.verticalAlign = VerticalTextAlignment.CENTER;
    textLabel.overflow = Label.Overflow.CLAMP;

    const placeholderNode = new Node('PlaceholderLabel');
    placeholderNode.layer = node.layer;
    node.addChild(placeholderNode);
    placeholderNode.setPosition(Vec3.ZERO);
    placeholderNode.addComponent(UITransform).setContentSize(new Size(width - 28, currentLayout.inputHeight));
    const placeholderLabel = placeholderNode.addComponent(Label);
    placeholderLabel.fontSize = Math.max(13, currentLayout.bodyFont - 1);
    placeholderLabel.lineHeight = currentLayout.bodyFont + 5;
    placeholderLabel.color = rgba(120, 114, 105);
    placeholderLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
    placeholderLabel.verticalAlign = VerticalTextAlignment.CENTER;
    placeholderLabel.overflow = Label.Overflow.CLAMP;
    placeholderLabel.string = '';

    editBox.textLabel = textLabel;
    editBox.placeholderLabel = placeholderLabel;
    editBox.maxLength = 256;
    editBox.placeholder = '';
    editBox.inputMode = EditBox.InputMode.SINGLE_LINE;
    editBox.string = initialText;
    if (password) {
      editBox.inputFlag = EditBox.InputFlag.PASSWORD;
      this.applyPasswordMask(editBox, textLabel);
    }
    // 双保险:万一某 setter 仍触发过默认 label 自建,清掉孤儿节点(此刻组件引用已指向我们的)。
    node.getChildByName('TEXT_LABEL')?.destroy();
    node.getChildByName('PLACEHOLDER_LABEL')?.destroy();
    // 激活 → __preload → 引擎按 SINGLE_LINE 建 <input> 并做官方尺寸同步。
    node.active = true;
    this.styleNativeInput(editBox);
    return editBox;
  }

  /** 编辑态原生元素默认白底黑字,与暗金 UI 脱节:激活后拿引擎元素常驻注入暗色样式(2026-09-06)。 */
  private styleNativeInput(editBox: EditBox): void {
    try {
      const el = (editBox as unknown as { _impl?: { _edTxt?: { style?: Record<string, string> } | null } })._impl?._edTxt;
      if (!el || !el.style) {
        return;
      }
      el.style.background = 'rgba(8,7,9,0.94)';
      el.style.color = '#e7e2d6';
      el.style.border = '1px solid rgba(214,177,94,0.75)';
      el.style.borderRadius = '6px';
      el.style.outline = 'none';
      el.style.caretColor = '#f5d27a';
      el.style.paddingLeft = '10px';
      el.style.overflow = 'hidden';
      el.style.resize = 'none';
    } catch (error) {
      // 非 Web 平台或引擎内部结构变化:静默跳过,输入功能不受影响。
      void error;
    }
  }

  applyPasswordMask(editBox: EditBox, textLabel: Label): void {
    // Web 预览里 EditBox 密码显示可能不一致，因此用独立 Label 做一次统一遮罩。
    const mask = () => {
      textLabel.string = '*'.repeat(editBox.string.length);
    };
    mask();
    editBox.node.on(EditBox.EventType.TEXT_CHANGED, mask, this);
    editBox.node.on(EditBox.EventType.EDITING_DID_ENDED, mask, this);
    editBox.node.on(EditBox.EventType.EDITING_RETURN, mask, this);
  }

  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password = false): EditBox {
    this.addBeveledPanel('InputFrame', x, y, width + 28, layout.inputHeight + 8, rgba(8, 7, 9, 220), rgba(185, 138, 58, 190), 8);
    return this.addEditBox(initialText, x, y, width, layout, password);
  }

  addButton(text: string, x: number, y: number, callback: () => void, layout?: UiLayout, width?: number, height?: number): Button {
    const currentLayout = layout ?? this.host.resolveLayout();
    const buttonWidth = width ?? 140;
    const buttonHeight = height ?? currentLayout.buttonHeight;
    const translatedText = this.translateText(text);
    const node = this.host.createUiNode(`Button_${translatedText || text || 'empty'}`);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(buttonWidth, buttonHeight));
    this.applyButtonVisual(node, buttonWidth, buttonHeight);
    const button = node.addComponent(Button);
    node.on(Button.EventType.CLICK, callback, this);

    const labelNode = new Node('Label');
    labelNode.layer = node.layer;
    node.addChild(labelNode);
    labelNode.setPosition(Vec3.ZERO);
    labelNode.addComponent(UITransform).setContentSize(new Size(buttonWidth, buttonHeight));
    const label = labelNode.addComponent(Label);
    label.string = trimText(translatedText);
    label.fontSize = Math.max(14, Math.min(currentLayout.bodyFont + 2, buttonHeight * 0.46));
    label.lineHeight = label.fontSize + 8;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.color = rgba(245, 210, 122);
    return button;
  }

  addGoldButton(text: string, x: number, y: number, callback: () => void, layout: UiLayout, width: number, height: number): Button {
    return this.addButton(text, x, y, callback, layout, width, height);
  }

  addImageButton(
    name: string,
    assetPath: string,
    text: string,
    x: number,
    y: number,
    callback: () => void,
    layout: UiLayout,
    width: number,
    height: number,
    fontSize: number,
  ): Button {
    const frame = this.spriteFrameCache.resolve(assetPath, this.spriteFrameOverrides());
    if (!frame) {
      // 图片还没加载好时先画一个金色按钮兜底，加载完成后 cache 会触发重绘替换为图片按钮。
      this.spriteFrameCache.request(assetPath);
      return this.addGoldButton(text, x, y, callback, layout, Math.min(width * 0.74, layout.contentWidth * 0.52), Math.min(height * 0.56, 72 * layout.uiScale));
    }

    const node = this.host.createUiNode(name);
    node.setPosition(new Vec3(x, y, 0));
    const transform = node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    transform.setContentSize(new Size(width, height));
    const button = node.addComponent(Button);
    node.on(Button.EventType.CLICK, callback, this);
    this.applyImageButtonFeedback(node);

    const iconScale = Math.max(0.5, Math.min(0.62, fontSize / 46));
    this.addAccountGlyph(node, -54 * layout.uiScale, -1 * layout.uiScale, iconScale);
    this.addChildLabel(node, 'Label', text, 22 * layout.uiScale, 0, fontSize, rgba(235, 213, 166), new Size(width * 0.58, height * 0.52));
    return button;
  }

  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null {
    const frame = this.spriteFrameCache.resolve(assetPath, this.spriteFrameOverrides());
    if (!frame) {
      this.spriteFrameCache.request(assetPath);
      return null;
    }
    const node = new Node(name);
    node.layer = this.host.node.layer;
    (parent ?? this.host.ensureContentRoot()).addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    const transform = node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    transform.setContentSize(new Size(width, height));
    return sprite;
  }

  addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    size: number,
    color: Color,
    contentSize: Size,
    horizontalAlign: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
  ): Label {
    const labelNode = new Node(name);
    labelNode.layer = this.host.node.layer;
    parent.addChild(labelNode);
    labelNode.setPosition(new Vec3(this.resolveAlignedLabelX(x, contentSize.width, horizontalAlign), y, 0));
    labelNode.addComponent(UITransform).setContentSize(contentSize);
    const label = labelNode.addComponent(Label);
    label.string = trimText(this.translateText(text));
    label.fontSize = size;
    label.lineHeight = size + 8;
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.CLAMP;
    label.color = color;
    return label;
  }

  private translateText(text: string): string {
    return lootChainI18n.text(text);
  }

  resolveAlignedLabelX(x: number, width: number, horizontalAlign: HorizontalTextAlignment): number {
    if (horizontalAlign === HorizontalTextAlignment.LEFT) {
      return x + width / 2;
    }
    if (horizontalAlign === HorizontalTextAlignment.RIGHT) {
      return x - width / 2;
    }
    return x;
  }

  addAccountGlyph(parent: Node, x: number, y: number, scale: number): void {
    const iconNode = new Node('AccountGlyph');
    iconNode.layer = this.host.node.layer;
    parent.addChild(iconNode);
    iconNode.setPosition(new Vec3(x, y, 0));
    iconNode.setScale(new Vec3(scale, scale, 1));
    iconNode.addComponent(UITransform).setContentSize(new Size(34, 38));
    const graphics = iconNode.addComponent(Graphics);
    graphics.fillColor = rgba(226, 203, 154, 246);
    graphics.circle(0, 10, 11);
    graphics.fill();
    graphics.rect(-10, -16, 20, 18);
    graphics.fill();
    graphics.circle(0, -16, 10);
    graphics.fill();
  }

  addRect(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke?: Color, lineWidth = 1): Graphics {
    const node = this.host.createUiNode(name);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fill;
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    if (stroke) {
      graphics.strokeColor = stroke;
      graphics.lineWidth = lineWidth;
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.stroke();
    }
    return graphics;
  }

  addBeveledPanel(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel = 10): Graphics {
    const node = this.host.createUiNode(name);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fill;
    this.traceBeveledRect(graphics, width, height, bevel);
    graphics.fill();
    graphics.strokeColor = stroke;
    graphics.lineWidth = 2;
    this.traceBeveledRect(graphics, width, height, bevel);
    graphics.stroke();
    return graphics;
  }

  addProgressBar(x: number, y: number, width: number, height: number, progress: number): void {
    const background = this.addRect('LoadingProgressTrack', x, y, width, height, rgba(8, 7, 9, 236), rgba(185, 138, 58, 210), 2);
    background.lineWidth = 2;
    const fillWidth = Math.max(0, width * clamp(progress, 0, 1));
    if (fillWidth <= 0) {
      return;
    }
    // 进度填充节点按实际 fillWidth 重新定位，保证左侧固定、右侧增长。
    const fillNode = this.host.createUiNode('LoadingProgressFill');
    fillNode.setPosition(new Vec3(x - width / 2 + fillWidth / 2, y, 0));
    fillNode.addComponent(UITransform).setContentSize(new Size(fillWidth, height - 6));
    const fill = fillNode.addComponent(Graphics);
    fill.fillColor = rgba(201, 39, 61, 230);
    fill.rect(-fillWidth / 2, -(height - 6) / 2, fillWidth, height - 6);
    fill.fill();
    fill.strokeColor = rgba(245, 210, 122, 180);
    fill.lineWidth = 1;
    fill.rect(-fillWidth / 2, -(height - 6) / 2, fillWidth, height - 6);
    fill.stroke();
  }

  addBeveledPanelNode(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel = 10): Node {
    const node = this.host.createUiNode(name);
    node.setPosition(new Vec3(x, y, 0));
    this.drawBeveledPanelOnNode(node, width, height, fill, stroke, bevel);
    return node;
  }

  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel = 10): Node {
    const node = new Node(name);
    node.layer = this.host.node.layer;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    this.drawBeveledPanelOnNode(node, width, height, fill, stroke, bevel);
    return node;
  }

  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = this.host.node.layer;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    return node;
  }

  drawBeveledPanelOnNode(node: Node, width: number, height: number, fill: Color, stroke: Color, bevel: number): Graphics {
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fill;
    this.traceBeveledRect(graphics, width, height, bevel);
    graphics.fill();
    graphics.strokeColor = stroke;
    graphics.lineWidth = 2;
    this.traceBeveledRect(graphics, width, height, bevel);
    graphics.stroke();
    return graphics;
  }

  applyButtonVisual(node: Node, width: number, height: number): void {
    const graphics = node.addComponent(Graphics);
    this.drawButtonFrame(graphics, width, height, 'normal');
    this.applyPointerCursor(node);
    node.on(Node.EventType.MOUSE_ENTER, () => this.drawButtonFrame(graphics, width, height, 'hover'), this);
    node.on(Node.EventType.MOUSE_LEAVE, () => {
      node.setScale(Vec3.ONE);
      this.drawButtonFrame(graphics, width, height, 'normal');
    }, this);
    node.on(Node.EventType.TOUCH_START, () => {
      node.setScale(new Vec3(0.96, 0.96, 1));
      this.drawButtonFrame(graphics, width, height, 'pressed');
    }, this);
    node.on(Node.EventType.TOUCH_END, () => {
      node.setScale(Vec3.ONE);
      this.drawButtonFrame(graphics, width, height, 'hover');
    }, this);
    node.on(Node.EventType.TOUCH_CANCEL, () => {
      node.setScale(Vec3.ONE);
      this.drawButtonFrame(graphics, width, height, 'normal');
    }, this);
  }

  applyImageButtonFeedback(node: Node, hoverScale = 1.035, pressedScale = 0.975): void {
    this.applyPointerCursor(node);
    node.on(Node.EventType.MOUSE_ENTER, () => node.setScale(new Vec3(hoverScale, hoverScale, 1)), this);
    node.on(Node.EventType.MOUSE_LEAVE, () => node.setScale(Vec3.ONE), this);
    node.on(Node.EventType.TOUCH_START, () => node.setScale(new Vec3(pressedScale, pressedScale, 1)), this);
    // 全局按钮点击音(音效底铺 2026-09-04):所有走 feedback 的交互一处接入,80ms 节流在管理器内。
    node.on(Node.EventType.TOUCH_END, () => {
      node.setScale(Vec3.ONE);
      gameAudio.sfx('ui_click');
    }, this);
    node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(Vec3.ONE), this);
  }

  applyPointerCursor(node: Node): void {
    node.on(Node.EventType.MOUSE_ENTER, () => this.host.setPointerCursor(true), this);
    node.on(Node.EventType.MOUSE_LEAVE, () => this.host.setPointerCursor(false), this);
  }

  drawButtonFrame(graphics: Graphics, width: number, height: number, state: ButtonVisualState): void {
    graphics.clear();
    const fill = state === 'pressed' ? rgba(78, 20, 25, 232) : state === 'hover' ? rgba(62, 47, 30, 236) : rgba(22, 18, 17, 224);
    const stroke = state === 'pressed' ? rgba(201, 39, 61, 235) : state === 'hover' ? rgba(245, 210, 122, 245) : rgba(185, 138, 58, 218);
    graphics.fillColor = fill;
    this.traceBeveledRect(graphics, width, height, Math.min(16, height * 0.28));
    graphics.fill();
    graphics.strokeColor = stroke;
    graphics.lineWidth = state === 'normal' ? 2 : 3;
    this.traceBeveledRect(graphics, width, height, Math.min(16, height * 0.28));
    graphics.stroke();
  }

  private traceBeveledRect(graphics: Graphics, width: number, height: number, bevel: number): void {
    // 统一斜切角矩形，登录按钮、弹窗面板和 HUD 底框都复用同一套边框语言。
    const left = -width / 2;
    const right = width / 2;
    const top = height / 2;
    const bottom = -height / 2;
    const corner = Math.min(bevel, width / 5, height / 3);
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
}
