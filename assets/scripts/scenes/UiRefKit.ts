import { Button, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UIOpacity, type Color } from 'cc';
import { rgba } from './lobby/LobbyHudTypes';

/**
 * 2026-10-15 「参考图风格」UI 套件:终极技能弹窗 / 锻造界面按 GPT 原型逐件拆出的素材(ui/common/ref、ui/forge/ref)。
 * 尺寸与九宫格内边由 scratchpad gen/install_ref.py 量金线得出(素材原图在 素材原始备份/ult-forge-ui-20261015)。
 * 用法:mountRefSliced(host, parent, name, REF_KIT.cardFrame, x, y, w, h) → 节点按素材像素空间建 + 整体 setScale,角饰不变形。
 */
export interface RefKitItem {
  path: string;
  w: number;
  h: number;
  /** 左 / 右 / 上 / 下(素材像素)。 */
  inset: [number, number, number, number];
}

export interface RefKitHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

export const REF_KIT = {
  dialogFrame: { path: 'ui/common/ref/dialog_frame/spriteFrame', w: 1000, h: 632, inset: [120, 120, 90, 90] } as RefKitItem,
  titlePlaque: { path: 'ui/common/ref/title_plaque_wings/spriteFrame', w: 627, h: 160, inset: [0, 0, 0, 0] } as RefKitItem,
  cardFrame: { path: 'ui/common/ref/card_frame/spriteFrame', w: 900, h: 159, inset: [60, 60, 40, 40] } as RefKitItem,
  /** 内芯镂空版(只留金线与角花):标题带垫在它下面,金线 / 角花压在红底上无缝衔接(2026-10-16)。 */
  cardFrameOpen: { path: 'ui/common/ref/card_frame_open/spriteFrame', w: 900, h: 159, inset: [60, 60, 40, 40] } as RefKitItem,
  iconRing: { path: 'ui/common/ref/icon_ring/spriteFrame', w: 256, h: 256, inset: [0, 0, 0, 0] } as RefKitItem,
  statBar: { path: 'ui/common/ref/stat_bar/spriteFrame', w: 900, h: 85, inset: [60, 60, 30, 30] } as RefKitItem,
  btnPrimary: { path: 'ui/common/ref/btn_primary/spriteFrame', w: 757, h: 160, inset: [160, 160, 60, 60] } as RefKitItem,
  btnSecondary: { path: 'ui/common/ref/btn_secondary/spriteFrame', w: 725, h: 160, inset: [150, 150, 60, 60] } as RefKitItem,
  pipOn: { path: 'ui/common/ref/pip_on/spriteFrame', w: 96, h: 96, inset: [0, 0, 0, 0] } as RefKitItem,
  pipMid: { path: 'ui/common/ref/pip_mid/spriteFrame', w: 96, h: 96, inset: [0, 0, 0, 0] } as RefKitItem,
  pipOff: { path: 'ui/common/ref/pip_off/spriteFrame', w: 96, h: 96, inset: [0, 0, 0, 0] } as RefKitItem,
};

export const REF_CLOSE_ASSET = 'ui/formation/ref/btn_close/spriteFrame';
/** 金边暗行 / 选中亮金行(锻造列表行素材,水晶属性行、法术列表、终极技能弹窗共用)。 */
export const REF_ROW: RefKitItem = { path: 'ui/forge/ref/row_normal/spriteFrame', w: 538, h: 120, inset: [40, 40, 32, 32] };
export const REF_ROW_SELECTED: RefKitItem = { path: 'ui/forge/ref/row_selected/spriteFrame', w: 535, h: 120, inset: [40, 40, 32, 32] };
export const REF_ICON_RING_ASSET = 'ui/common/ref/icon_ring/spriteFrame';
export const REF_SECTION_EMBLEM = { path: 'ui/crystal/ai/section_emblem/spriteFrame', aspect: 121 / 107 };
/** 标题带铺到的位置(素材像素,外侧亮金线所在行):带子垫在镂空边框下面,金线压住带子边缘,不留缝。 */
export const REF_CARD_FRAME_LINE = { top: 6, side: 6 };

/** 把框节点里的边框(Frame)提到最上层:先画的标题带就会被金线 / 角花压住。 */
export function raiseRefFrame(frameHost: Node): void {
  const frame = frameHost.getChildByName('Frame');
  if (frame) {
    frame.setSiblingIndex(frameHost.children.length - 1);
  }
}

/** cardFrame 在给定框尺寸下的九宫格缩放系数(与 mountRefSliced 同算法)。 */
export function refCardFrameK(width: number, height: number): number {
  return Math.min(width / REF_KIT.cardFrame.w, height / REF_KIT.cardFrame.h, 1);
}

function fillRefDiamond(host: RefKitHost, parent: Node, x: number, y: number, r: number, color: Color): void {
  const g = host.addChildPlainNode(parent, 'Diamond', x, y, r * 2, r * 2).addComponent(Graphics);
  g.fillColor = color;
  g.moveTo(0, r);
  g.lineTo(r, 0);
  g.lineTo(0, -r);
  g.lineTo(-r, 0);
  g.close();
  g.fill();
}

/**
 * 标题带(守卫水晶页定的样式,2026-10-16):整条暗红实底 + 左侧提亮渐变 + 底边金线 + 金线两端菱形点。
 * 放在细金框里时,顶边 / 两侧对齐 REF_CARD_FRAME_LINE(带子压在框之上,框内芯不透明)。
 */
export function mountRefHeaderBand(host: RefKitHost, parent: Node, name: string, x: number, y: number, w: number, h: number, scale: number): Node {
  const band = host.addChildPlainNode(parent, name, x, y, w, h);
  const g = band.addComponent(Graphics);
  g.fillColor = rgba(62, 16, 12, 232);
  g.rect(-w / 2, -h / 2, w, h);
  g.fill();
  const steps = 24;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const alpha = Math.round(110 * (1 - t) * (1 - t));
    if (alpha <= 0) {
      continue;
    }
    g.fillColor = rgba(150, 38, 26, alpha);
    g.rect(-w / 2 + (w * i) / steps, -h / 2, w / steps, h);
    g.fill();
  }
  g.strokeColor = rgba(214, 170, 92, 230);
  g.lineWidth = Math.max(1.5, 1.6 * scale);
  g.moveTo(-w / 2, -h / 2);
  g.lineTo(w / 2, -h / 2);
  g.stroke();
  g.strokeColor = rgba(214, 170, 92, 90);
  g.lineWidth = 1;
  g.moveTo(-w / 2, h / 2);
  g.lineTo(w / 2, h / 2);
  g.stroke();
  fillRefDiamond(host, band, -w / 2, -h / 2, 5 * scale, rgba(236, 196, 112));
  fillRefDiamond(host, band, w / 2, -h / 2, 5 * scale, rgba(236, 196, 112));
  return band;
}

/** 九宫格不变形缩放:缺图返回 null(调用方自行兜底)。k 不超过 1(素材不放大,只缩)。 */
export function mountRefSliced(host: RefKitHost, parent: Node, name: string, item: RefKitItem, x: number, y: number, width: number, height: number, maxK = 1): Node | null {
  const k = Math.min(width / item.w, height / item.h, maxK);
  const holder = host.addChildPlainNode(parent, name, x, y, width / k, height / k);
  holder.setScale(k, k, 1);
  const sprite = host.addSprite(`${name}Art`, item.path, 0, 0, width / k, height / k, holder);
  if (!sprite || !sprite.spriteFrame) {
    holder.destroy();
    return null;
  }
  const sf = sprite.spriteFrame;
  sf.insetLeft = item.inset[0];
  sf.insetRight = item.inset[1];
  sf.insetTop = item.inset[2];
  sf.insetBottom = item.inset[3];
  sprite.type = Sprite.Type.SLICED;
  return holder;
}

/** 面板 / 卡框兜底(缺图):深色底 + 细金描边。 */
export function drawRefPanelFallback(node: Node, width: number, height: number, u: number, fill = rgba(14, 11, 10, 235)): void {
  const g = node.addComponent(Graphics);
  g.fillColor = fill;
  g.roundRect(-width / 2, -height / 2, width, height, 8 * u);
  g.fill();
  g.strokeColor = rgba(196, 150, 76, 220);
  g.lineWidth = Math.max(1, 1.4 * u);
  g.roundRect(-width / 2, -height / 2, width, height, 8 * u);
  g.stroke();
}

export type RefButtonKind = 'primary' | 'secondary' | 'disabled';

/** 原型套件按钮:红金主钮 / 暗金副钮 / 灰态(副钮底 + 半透明);文字框收到中间 70%(两端尖饰);可带左侧图标。 */
export function mountRefButton(
  host: RefKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  u: number,
  kind: RefButtonKind,
  onClick?: () => void,
  options: { fontSize?: number; iconPath?: string; iconSize?: number } = {},
): Node {
  const button = host.addChildPlainNode(parent, name, x, y, width, height);
  const item = kind === 'primary' ? REF_KIT.btnPrimary : REF_KIT.btnSecondary;
  if (!mountRefSliced(host, button, 'Art', item, 0, 0, width, height)) {
    drawRefPanelFallback(button, width, height, u, kind === 'primary' ? rgba(120, 22, 18, 238) : rgba(18, 15, 14, 230));
  }
  if (kind === 'disabled') {
    (button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity)).opacity = 150;
  }
  const fontSize = options.fontSize ?? 26 * u;
  let labelX = 0;
  if (options.iconPath) {
    const iconSize = options.iconSize ?? height * 0.56;
    const icon = host.addSprite(`${name}Icon`, options.iconPath, -width * 0.22, 0, iconSize, iconSize, button);
    if (icon) {
      labelX = width * 0.07;
    }
  }
  const label = host.addChildLabel(button, 'Label', text, labelX, 0, fontSize, kind === 'disabled' ? rgba(190, 172, 140) : rgba(255, 238, 206), new Size(width * (labelX ? 0.5 : 0.7), height * 0.6));
  label.overflow = Label.Overflow.SHRINK;
  label.isBold = kind === 'primary';
  label.enableOutline = true;
  label.outlineColor = rgba(0, 0, 0, 226);
  label.outlineWidth = Math.max(1, 1.4 * u);
  if (onClick) {
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, onClick);
    host.applyImageButtonFeedback(button, 1.03, 0.97);
  }
  return button;
}
