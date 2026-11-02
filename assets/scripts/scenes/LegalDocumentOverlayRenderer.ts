import {
  BlockInputEvents,
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
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassIconButton, mountGlassLine, mountGlassScrollBar, mountGlassSlice } from './UiGlassKit';

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
 * 用户协议 / 隐私政策查看层(2026-09-25):登录页协议勾选处与设置弹框底条打开,整页压暗 + 居中面板 + 可滚动正文。
 * 11-02 用户「协议查看页也改成 B 风格」:毛玻璃窗(同终端弹框)+ 香槟竖条标题 + 灰色版本信息 + 细滚动条 + 香槟主按钮。
 * 覆盖层挂在内容根最上层,整页重绘后由宿主重新挂回;正文逐段一个 Label(避免单个超长文字纹理超限)。
 */
export class LegalDocumentOverlayRenderer {
  static readonly ROOT_NAME = 'LegalDocumentOverlay';

  constructor(private readonly host: LegalDocumentOverlayHost) {}

  render(layout: UiLayout, key: LegalDocumentKey): void {
    const doc = legalDocument(key);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const T = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const label = glassLabel(this.host, parent, name, text, x, y, S(size), color, width, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };

    const root = this.host.createUiNode(LegalDocumentOverlayRenderer.ROOT_NAME);
    root.setPosition(new Vec3(centerX, centerY, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(4, 6, 10, 196);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();

    // 窗口 335..1535 × 62..786(原型坐标,同终端弹框的毛玻璃窗,叠两层更实)
    const winW = S(1535 - 335);
    const winH = S(786 - 62);
    const win = this.host.addChildPlainNode(root, 'LegalDocumentPanel', FX(935), FY(424), winW, winH);
    win.addComponent(BlockInputEvents);
    mountGlassSlice(this.host, win, 'GlassBase', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    mountGlassSlice(this.host, win, 'Glass', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    const panel = this.host.addChildPlainNode(root, 'LegalDocumentBody', 0, 0, layout.stageWidth, layout.stageHeight);

    // 标题行:香槟竖条 + 文档名 + 灰色版本信息;✕ (1478,111);分割线 y 158
    this.host.addSprite('LegalDocumentTitleBar', GLASS_ICON.accent, FX(365), FY(112), S(6), S(32), panel);
    const title = T(panel, 'LegalDocumentTitle', doc.title, FX(382), FY(112), 32, GLASS_COLOR.text, S(420), HorizontalTextAlignment.LEFT, true);
    let titleW = 0;
    for (const ch of Array.from(doc.title)) {
      titleW += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? title.fontSize : title.fontSize * 0.56;
    }
    T(panel, 'LegalDocumentMeta', `版本 ${doc.version} · 生效日期 ${doc.effectiveDate}`, FX(382) + titleW + S(26), FY(115), 19, GLASS_COLOR.sub, S(600));
    mountGlassIconButton(this.host, panel, 'LegalDocumentClose', GLASS_ICON.close, FX(1478), FY(111), S(36), S(72), () => this.host.closeLegalDocument());
    mountGlassLine(this.host, panel, 'LegalDocumentTitleLine', FX(935), FY(158), S(1511 - 359), Math.max(1, S(1)), new Color(255, 255, 255, 22));

    // 正文 375..1495 × 176..688:逐段 RESIZE_HEIGHT 量高后排版,超出纵向滚动 + 细滚动条
    const viewportTop = FY(176);
    const viewportBottom = FY(688);
    const viewportW = S(1495 - 375);
    const viewportH = viewportTop - viewportBottom;
    const viewport = this.host.addChildPlainNode(panel, 'LegalDocumentViewport', FX(935), (viewportTop + viewportBottom) / 2, viewportW, viewportH);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;

    const textW = viewportW - S(24);
    const content = this.host.addChildPlainNode(viewport, 'LegalDocumentContent', 0, 0, viewportW, viewportH);
    const blocks: Array<{ label: Label; gapBefore: number }> = [];
    const addBlock = (name: string, text: string, fontSize: number, color: Color, lineHeight: number, gapBefore: number, bold = false): void => {
      const label = this.host.addChildLabel(content, name, text, 0, 0, fontSize, color, new Size(textW, lineHeight), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.RESIZE_HEIGHT;
      label.lineHeight = lineHeight;
      label.enableWrapText = true;
      label.isBold = bold;
      label.enableOutline = false;
      blocks.push({ label, gapBefore });
    };
    const body = Math.max(12, Math.round(S(FONT.body + 2)));
    const heading = Math.max(12, Math.round(S(FONT.heading + 3)));
    doc.intro.forEach((text, index) => addBlock(`LegalIntro_${index}`, text, body, rgba(214, 218, 226), Math.round(body * 1.65), index === 0 ? 0 : S(10)));
    doc.sections.forEach((section, sectionIndex) => {
      addBlock(`LegalHeading_${sectionIndex}`, section.heading, heading, GLASS_COLOR.champagne, Math.round(heading * 1.5), S(24), true);
      section.paragraphs.forEach((text, index) => addBlock(`LegalPara_${sectionIndex}_${index}`, text, body, rgba(200, 206, 216), Math.round(body * 1.65), S(8)));
    });

    const padY = S(10);
    let total = padY;
    const heights = blocks.map(({ label, gapBefore }) => {
      const height = this.measureLabelHeight(label, textW);
      total += gapBefore + height;
      return height;
    });
    total += padY;
    const contentH = Math.max(viewportH, total);
    content.getComponent(UITransform)?.setContentSize(new Size(viewportW, contentH));
    const baseY = (viewportH - contentH) / 2;
    content.setPosition(new Vec3(0, baseY, 0));
    let cursor = contentH / 2 - padY;
    blocks.forEach(({ label, gapBefore }, index) => {
      cursor -= gapBefore;
      const height = heights[index];
      label.node.setPosition(new Vec3(-S(6), cursor - height / 2, 0));
      cursor -= height;
    });
    scrollView.content = content;
    scrollView.scrollToTop(0);
    const maxOffset = contentH - viewportH;
    if (maxOffset > 1) {
      const trackH = viewportH - S(8);
      const update = mountGlassScrollBar(this.host, panel, 'LegalDocumentScrollBar', FX(1507), (viewportTop + viewportBottom) / 2, S(5), trackH, Math.max(S(40), trackH * (viewportH / contentH)));
      const draw = (): void => update(Math.min(maxOffset, Math.max(0, content.position.y - baseY)) / maxOffset);
      draw();
      viewport.on(ScrollView.EventType.SCROLLING, draw, this);
      T(panel, 'LegalDocumentScrollHint', '滑动或滚动鼠标滚轮查看全文', FX(375), FY(742), 18, GLASS_COLOR.dim, S(420));
    }

    // 底部:分割线 y 702 + 「我知道了」主按钮 (935,742)
    mountGlassLine(this.host, panel, 'LegalDocumentFooterLine', FX(935), FY(702), S(1511 - 359), Math.max(1, S(1)), new Color(255, 255, 255, 18));
    mountGlassButton(this.host, panel, 'LegalDocumentConfirm', '我知道了', FX(935), FY(742), S(220), S(58), k, 'primary', () => this.host.closeLegalDocument(), 22);
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
}
