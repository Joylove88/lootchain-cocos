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
  UITransform,
  Vec3,
} from 'cc';
import { legalDocument, type LegalDocumentKey } from '../legal/LegalDocuments';
import type { UiLayout } from './lobby/LobbyHudTypes';

export interface LegalDocumentOverlayHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
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
  closeLegalDocument(): void;
}

const rgba = (r: number, g: number, b: number, a = 255): Color => new Color(r, g, b, a);

/** 字号口径与限时副本面板一致(标题 34 / 章节 20 / 正文 18)。 */
const FONT = { title: 34, meta: 16, heading: 20, body: 18 };

/**
 * 用户协议 / 隐私政策查看层(2026-09-25):登录页协议勾选处与"更多"面板打开,整页压暗 + 居中面板 + 可滚动正文。
 * 覆盖层挂在内容根最上层,整页重绘后由宿主重新挂回;正文逐段一个 Label(避免单个超长文字纹理超限)。
 */
export class LegalDocumentOverlayRenderer {
  static readonly ROOT_NAME = 'LegalDocumentOverlay';

  constructor(private readonly host: LegalDocumentOverlayHost) {}

  render(layout: UiLayout, key: LegalDocumentKey): void {
    const doc = legalDocument(key);
    const scale = Math.max(0.6, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const root = this.host.createUiNode(LegalDocumentOverlayRenderer.ROOT_NAME);
    root.setPosition(new Vec3(centerX, centerY, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(0, 0, 0, 196);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();

    const panelW = Math.min(layout.stageWidth - 48 * scale, 1080 * scale);
    const panelH = Math.min(layout.stageHeight - 40 * scale, 860 * scale);
    const panel = this.host.addChildPlainNode(root, 'LegalDocumentPanel', 0, 0, panelW, panelH);
    panel.addComponent(BlockInputEvents);
    const g = panel.addComponent(Graphics);
    g.fillColor = rgba(14, 11, 10, 250);
    g.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 14 * scale);
    g.fill();
    g.strokeColor = rgba(196, 150, 74, 230);
    g.lineWidth = Math.max(1.5, 2 * scale);
    g.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 14 * scale);
    g.stroke();
    g.strokeColor = rgba(120, 88, 44, 150);
    g.lineWidth = 1;
    g.roundRect(-panelW / 2 + 8 * scale, -panelH / 2 + 8 * scale, panelW - 16 * scale, panelH - 16 * scale, 10 * scale);
    g.stroke();

    const titleY = panelH / 2 - 46 * scale;
    const title = this.host.addChildLabel(panel, 'LegalDocumentTitle', `《${doc.title}》`, 0, titleY, FONT.title * scale, rgba(250, 222, 160), new Size(panelW - 160 * scale, 44 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 210);
    title.outlineWidth = Math.max(1, 1.4 * scale);
    const meta = this.host.addChildLabel(panel, 'LegalDocumentMeta', `版本 ${doc.version} · 生效日期 ${doc.effectiveDate}`, 0, titleY - 38 * scale, FONT.meta * scale, rgba(176, 156, 118), new Size(panelW - 120 * scale, 24 * scale));
    meta.overflow = Label.Overflow.SHRINK;
    this.addCloseCross(panel, panelW / 2 - 40 * scale, panelH / 2 - 40 * scale, scale);

    const footerH = 86 * scale;
    const viewportTop = titleY - 64 * scale;
    const viewportBottom = -panelH / 2 + footerH;
    const viewportW = panelW - 72 * scale;
    const viewportH = Math.max(120 * scale, viewportTop - viewportBottom);
    const viewport = this.host.addChildPlainNode(panel, 'LegalDocumentViewport', 0, (viewportTop + viewportBottom) / 2, viewportW, viewportH);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;

    // 先把段落排进一个临时高度的 content,量出总高后再定位(每段 RESIZE_HEIGHT 自适应行数)。
    const textW = viewportW - 24 * scale;
    const content = this.host.addChildPlainNode(viewport, 'LegalDocumentContent', 0, 0, viewportW, viewportH);
    const blocks: Array<{ label: Label; gapBefore: number }> = [];
    const addBlock = (name: string, text: string, fontSize: number, color: Color, lineHeight: number, gapBefore: number, bold = false): void => {
      const label = this.host.addChildLabel(content, name, text, 0, 0, fontSize, color, new Size(textW, lineHeight), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.RESIZE_HEIGHT;
      label.lineHeight = lineHeight;
      label.enableWrapText = true;
      label.isBold = bold;
      blocks.push({ label, gapBefore });
    };
    doc.intro.forEach((text, index) => addBlock(`LegalIntro_${index}`, text, FONT.body * scale, rgba(222, 208, 180), 28 * scale, index === 0 ? 0 : 10 * scale));
    doc.sections.forEach((section, sectionIndex) => {
      addBlock(`LegalHeading_${sectionIndex}`, section.heading, FONT.heading * scale, rgba(240, 196, 110), 30 * scale, 22 * scale, true);
      section.paragraphs.forEach((text, index) => addBlock(`LegalPara_${sectionIndex}_${index}`, text, FONT.body * scale, rgba(214, 200, 172), 28 * scale, index === 0 ? 8 * scale : 8 * scale));
    });

    const padY = 14 * scale;
    let total = padY;
    const heights = blocks.map(({ label, gapBefore }) => {
      const height = this.measureLabelHeight(label, textW);
      total += gapBefore + height;
      return height;
    });
    total += padY;
    const contentH = Math.max(viewportH, total);
    content.getComponent(UITransform)?.setContentSize(new Size(viewportW, contentH));
    content.setPosition(new Vec3(0, (viewportH - contentH) / 2, 0));
    let cursor = contentH / 2 - padY;
    blocks.forEach(({ label, gapBefore }, index) => {
      cursor -= gapBefore;
      const height = heights[index];
      label.node.setPosition(new Vec3(0, cursor - height / 2, 0));
      cursor -= height;
    });
    scrollView.content = content;
    scrollView.scrollToTop(0);

    const hint = total > viewportH ? '滑动或滚动鼠标滚轮查看全文' : '';
    if (hint) {
      const hintLabel = this.host.addChildLabel(panel, 'LegalDocumentScrollHint', hint, -panelW / 2 + 36 * scale + 150 * scale, -panelH / 2 + footerH / 2, FONT.meta * scale, rgba(150, 132, 100), new Size(300 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
      hintLabel.overflow = Label.Overflow.SHRINK;
    }
    this.addPrimaryButton(panel, 'LegalDocumentConfirm', '我知道了', 0, -panelH / 2 + footerH / 2, scale);
  }

  /** 强制排版一次取真实高度;个别环境取不到时按字数估算(中文约 1 字宽 = 字号)。 */
  private measureLabelHeight(label: Label, width: number): number {
    try {
      label.updateRenderData(true);
    } catch {
      // 忽略:下面按估算兜底。
    }
    const measured = label.node.getComponent(UITransform)?.height ?? 0;
    if (measured > label.lineHeight * 0.5) {
      return measured;
    }
    const perLine = Math.max(1, Math.floor(width / Math.max(1, label.fontSize)));
    const lines = Math.max(1, Math.ceil(label.string.length / perLine));
    return lines * label.lineHeight;
  }

  private addCloseCross(parent: Node, x: number, y: number, scale: number): void {
    const size = 44 * scale;
    const node = this.host.addChildPlainNode(parent, 'LegalDocumentClose', x, y, size, size);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(30, 22, 18, 230);
    g.circle(0, 0, size / 2);
    g.fill();
    g.strokeColor = rgba(214, 170, 92, 230);
    g.lineWidth = Math.max(1.5, 2 * scale);
    g.circle(0, 0, size / 2 - 1);
    g.stroke();
    const arm = size * 0.2;
    g.moveTo(-arm, -arm);
    g.lineTo(arm, arm);
    g.moveTo(-arm, arm);
    g.lineTo(arm, -arm);
    g.stroke();
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.closeLegalDocument(), this);
    this.host.applyImageButtonFeedback(node, 1.08, 0.94);
  }

  private addPrimaryButton(parent: Node, name: string, text: string, x: number, y: number, scale: number): void {
    const w = 220 * scale;
    const h = w * (211 / 740);
    const node = this.host.addChildPlainNode(parent, name, x, y, w, h);
    if (!this.host.addSprite(`${name}Art`, 'ui/common/ai/button_primary/spriteFrame', 0, 0, w, h, node)) {
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 24, 240);
      g.roundRect(-w / 2, -h / 2, w, h, 9 * scale);
      g.fill();
      g.strokeColor = rgba(242, 190, 98, 235);
      g.lineWidth = Math.max(1, 1.4 * scale);
      g.roundRect(-w / 2, -h / 2, w, h, 9 * scale);
      g.stroke();
    }
    const label = this.host.addChildLabel(node, 'Label', text, 0, 1 * scale, 22 * scale, rgba(255, 240, 200), new Size(w - 40 * scale, h * 0.7));
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 200);
    label.outlineWidth = Math.max(1, 1.2 * scale);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.closeLegalDocument(), this);
    this.host.applyImageButtonFeedback(node, 1.035, 0.965);
  }
}
