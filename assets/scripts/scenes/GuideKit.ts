import { Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite } from 'cc';

/**
 * 新手引导 B 风格件(2026-11-07,原型 周报截图/2026-11-07_引导气泡B/proto/guide_bubble_b.png,用户「按原型做」):
 * 「零」头像气泡 + 香槟小三角指针;大厅硬 / 软引导、守卫战局内引导共用(替换旧金框雕花气泡 lguide_bubble / 箭头 lguide_pointer)。
 */
export interface GuideKitHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
}

export const ZERO_GUIDE_PORTRAIT = 'ui/protagonist/b/zero_m_round/spriteFrame';
const CHAMPAGNE = new Color(227, 196, 138, 255);

/** 气泡头像压在左沿外的宽度(按气泡高的比例):调用方算屏幕夹边时要把它算进去。 */
export const GUIDE_BUBBLE_AVATAR_OVERHANG = 0.68;

/**
 * 「零」引导气泡(原型 611×145):深色玻璃圆角卡 + 淡白细边;圆头像(直径 ≈ 1.07 高)压在左沿,中心在左沿外 0.15 高;
 * 头像右侧:香槟「零」+ 白色台词;hint 非空时右下角灰字(软引导「点击继续 ›」)。
 */
export function mountZeroGuideBubble(host: GuideKitHost, parent: Node, name: string, x: number, y: number, w: number, h: number, text: string, hint?: string): Node {
  const bubble = host.addChildPlainNode(parent, name, x, y, w, h);
  const r = Math.min(16, h * 0.12);
  const bg = host.addChildPlainNode(bubble, 'Glass', 0, 0, w, h).addComponent(Graphics);
  bg.fillColor = new Color(20, 24, 33, 240);
  bg.roundRect(-w / 2, -h / 2, w, h, r);
  bg.fill();
  bg.strokeColor = new Color(255, 255, 255, 40);
  bg.lineWidth = Math.max(1, h * 0.012);
  bg.roundRect(-w / 2, -h / 2, w, h, r);
  bg.stroke();
  // 头像:暗圆底 + 零的圆头像 + 浅色细环(同契约之选口径)
  const d = h * 1.07;
  const ax = -w / 2 - h * 0.15;
  const avatar = host.addChildPlainNode(bubble, 'Avatar', ax, 0, d, d);
  const ag = avatar.addComponent(Graphics);
  ag.fillColor = new Color(14, 19, 30, 255);
  ag.circle(0, 0, d / 2);
  ag.fill();
  host.addSprite('Face', ZERO_GUIDE_PORTRAIT, 0, 0, d * 0.94, d * 0.94, avatar);
  const ring = host.addChildPlainNode(avatar, 'Ring', 0, 0, d, d).addComponent(Graphics);
  ring.strokeColor = new Color(196, 204, 220, 170);
  ring.lineWidth = Math.max(1.5, d * 0.014);
  ring.circle(0, 0, d / 2 - 1);
  ring.stroke();
  const textLeft = -w / 2 + h * 0.5;
  const textW = w / 2 - textLeft - h * 0.12;
  const speaker = host.addChildLabel(bubble, 'Speaker', '零', textLeft, h * 0.31, h * 0.19, CHAMPAGNE, new Size(h, h * 0.26), HorizontalTextAlignment.LEFT);
  speaker.isBold = true;
  // 只比一行略长(≤ 1.3 行)时不换行、整行缩字,免得最后一两个字孤零零掉到第二行;更长才换两行
  let estW = 0;
  for (const ch of Array.from(text)) {
    estW += /[　-鿿＀-￯]/.test(ch) ? h * 0.21 : h * 0.21 * 0.55;
  }
  const twoLines = estW > textW * 1.3;
  // 两行时字号收一档、整体下移,和「零」名字之间留缝(11-07 截图:两行顶到名字)
  const fontSize = twoLines ? h * 0.19 : h * 0.21;
  const lineY = twoLines ? -h * 0.05 : hint ? 0 : -h * 0.06;
  const line = host.addChildLabel(bubble, 'GuideText', text, textLeft, lineY, fontSize, new Color(242, 242, 242, 255), new Size(textW, twoLines ? h * 0.44 : h * 0.3), HorizontalTextAlignment.LEFT);
  line.overflow = Label.Overflow.SHRINK;
  line.enableWrapText = twoLines;
  line.lineHeight = line.fontSize + 4;
  if (hint) {
    const tip = host.addChildLabel(bubble, 'Hint', hint, w / 2 - h * 0.18, -h * 0.37, h * 0.15, new Color(163, 168, 179, 255), new Size(w * 0.4, h * 0.22), HorizontalTextAlignment.RIGHT);
    tip.overflow = Label.Overflow.SHRINK;
  }
  return bubble;
}

/** 香槟小三角指针(默认尖朝下 -y);angle 0 = 朝下、180 = 朝上、-90 = 朝右、90 = 朝左。 */
export function mountGuideTriangle(host: GuideKitHost, parent: Node, name: string, x: number, y: number, w: number, h: number, angle = 0): Node {
  const node = host.addChildPlainNode(parent, name, x, y, w, h);
  node.angle = angle;
  const g = node.addComponent(Graphics);
  g.fillColor = new Color(227, 196, 138, 245);
  g.moveTo(-w / 2, h / 2);
  g.lineTo(w / 2, h / 2);
  g.lineTo(0, -h / 2);
  g.close();
  g.fill();
  return node;
}
