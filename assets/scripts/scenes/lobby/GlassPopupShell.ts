import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, view } from 'cc';
import type { UiKitHost } from '../UiKit';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassLine, mountGlassSlice } from '../UiGlassKit';

/**
 * B 风格通用小窗外壳(2026-11-11,原型 周报截图/2026-11-11_通用小窗/proto/confirm_b.png、item_source_b.png):
 * 整屏压暗 + 居中双层毛玻璃面板 + 标题行(香槟竖条 + 白色标题 [+ 竖分隔 + 副标题])+ 右上细线圆形 ✕ + 标题下细分隔线。
 * 坐标按原型像素给:X(dx) / Y(dy) = 相对面板左上角的原型像素 → 面板中心原点的设计坐标;k 同 glassProtoMap(1870×841 装进可视区)。
 * 挂在内容根(原点 = 屏幕中心)最上层;整页重建会清掉它,由宿主按状态补挂。
 */
export interface GlassPopupShell {
  overlay: Node;
  panel: Node;
  k: number;
  S: (v: number) => number;
  X: (dx: number) => number;
  Y: (dy: number) => number;
  /** 原型字号 → 设计字号的文字(LEFT / RIGHT 时 x 为左沿 / 右沿)。 */
  T: (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align?: HorizontalTextAlignment, bold?: boolean) => Label;
}

export interface GlassPopupShellOptions {
  name: string;
  /** 面板原型尺寸(像素)。 */
  width: number;
  height: number;
  title: string;
  /** 标题后竖分隔 + 副标题(获取途径的物品名)。 */
  subtitle?: string;
  onClose: () => void;
}

/** 标题行原型口径(两张原型取平均):竖条中心 dx 53 / 7×37,标题左沿 dx 78 字号 32,行中 dy 43;✕ 中心距右沿 54、直径 48;分隔线 dy 86,左右各缩 49。 */
const TITLE_DY = 43;
const DIVIDER_DY = 86;
export const GLASS_POPUP_DIVIDER_DY = DIVIDER_DY;

/** 粗估文字宽(原型像素):中文 1 字宽,半角 0.56,空格 0.3。只用于把几段不同颜色的字首尾相接。 */
export function estimateGlassTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of Array.from(text)) {
    w += ch === ' ' ? 0.3 : /[\x21-\x7e]/.test(ch) ? 0.56 : 1;
  }
  return w * fontSize;
}

export function mountGlassPopupShell(host: UiKitHost, root: Node, options: GlassPopupShellOptions): GlassPopupShell {
  const vis = view.getVisibleSize();
  const { k, S } = glassProtoMap(vis.width, vis.height);
  const X = (dx: number): number => (dx - options.width / 2) * k;
  const Y = (dy: number): number => (options.height / 2 - dy) * k;
  const T: GlassPopupShell['T'] = (parent, name, text, x, y, size, color, width, align = HorizontalTextAlignment.LEFT, bold = false) => {
    const label = glassLabel(host, parent, name, text, x, y, S(size), color, width, align, bold);
    label.fontSize = Math.max(12, Math.round(S(size)));
    label.lineHeight = label.fontSize + 4;
    return label;
  };

  const overlay = host.addChildPlainNode(root, options.name, 0, 0, vis.width * 2, vis.height * 2);
  overlay.setSiblingIndex(root.children.length - 1);
  overlay.addComponent(BlockInputEvents);
  const dim = overlay.addComponent(Graphics);
  dim.fillColor = new Color(4, 6, 10, 170);
  dim.rect(-vis.width, -vis.height, vis.width * 2, vis.height * 2);
  dim.fill();
  overlay.addComponent(Button);
  overlay.on(Button.EventType.CLICK, options.onClose);

  const w = S(options.width);
  const h = S(options.height);
  const panel = host.addChildPlainNode(overlay, 'Panel', 0, 0, w, h);
  panel.addComponent(BlockInputEvents);
  // 玻璃叠两层:单层半透明压在野外 / 大厅上会透出底下的图标(同兑换码弹框)
  mountGlassSlice(host, panel, 'GlassBase', GLASS_SLICES.panel, 0, 0, w, h, k);
  mountGlassSlice(host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, k);

  host.addSprite('TitleBar', GLASS_ICON.accent, X(53), Y(TITLE_DY), S(7), S(37), panel);
  T(panel, 'Title', options.title, X(78), Y(TITLE_DY), 32, GLASS_COLOR.text, S(options.subtitle ? 300 : options.width - 190), HorizontalTextAlignment.LEFT, true);
  if (options.subtitle) {
    const sepX = 78 + estimateGlassTextWidth(options.title, 32) + 37;
    mountGlassLine(host, panel, 'TitleSep', X(sepX), Y(TITLE_DY), Math.max(1, S(2)), S(30), new Color(120, 128, 140, 200));
    T(panel, 'Subtitle', options.subtitle, X(sepX + 37), Y(TITLE_DY + 1), 28, GLASS_COLOR.text, S(options.width - sepX - 37 - 110));
  }

  // ✕:细线圆环 + 叉(点击区放大到 72,手机好点)
  const close = host.addChildPlainNode(panel, 'Close', X(options.width - 54), Y(TITLE_DY), S(72), S(72));
  const ring = close.addComponent(Graphics);
  ring.strokeColor = new Color(214, 218, 226, 190);
  ring.lineWidth = Math.max(1.2, S(2));
  ring.circle(0, 0, S(24));
  ring.stroke();
  host.addSprite('X', GLASS_ICON.close, 0, 0, S(30), S(30), close);
  close.addComponent(Button);
  close.on(Button.EventType.CLICK, options.onClose);
  host.applyImageButtonFeedback(close, 1.08, 0.94);

  mountGlassLine(host, panel, 'TitleDivider', 0, Y(DIVIDER_DY), S(options.width - 98), Math.max(1, S(1.5)), new Color(150, 158, 172, 70));
  return { overlay, panel, k, S, X, Y, T };
}
