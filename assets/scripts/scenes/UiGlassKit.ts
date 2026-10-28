import { Button, Color, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite } from 'cc';
import type { UiKitHost } from './UiKit';
import { fitButtonLabel } from './UiPrimitiveFactory';

/**
 * B 风格(毛玻璃)共用组件(2026-10-28 用户选定,原型 周报截图/2026-10-28_整体UI去AI感/proto/hero_b2.png):
 * 深色半透明玻璃面板 + 12px 圆角 + 淡白细描边;香槟金只给选中项和唯一主按钮;次按钮半透明胶囊;白字 / 灰字两级。
 * 贴图由 tools/qa/glass_kit_gen.py 程序生成(ui/glass/*),九宫格边距在这里设;k = 原型像素 → 设计像素的缩放。
 */
const G = (name: string): string => `ui/glass/${name}/spriteFrame`;

interface GlassSlice {
  path: string;
  w: number;
  h: number;
  l: number;
  r: number;
  t: number;
  b: number;
}

const slice = (name: string, w: number, h: number, lr: number, tb: number): GlassSlice => ({ path: G(name), w, h, l: lr, r: lr, t: tb, b: tb });

export const GLASS_SLICES = {
  panel: slice('panel', 64, 64, 16, 16),
  panelSel: slice('panel_sel', 64, 64, 16, 16),
  row: slice('row', 64, 40, 10, 10),
  pillPrimary: slice('pill_primary', 160, 56, 28, 27),
  pillSecondary: slice('pill_secondary', 160, 56, 28, 27),
  pillDisabled: slice('pill_disabled', 160, 56, 28, 27),
  chip: slice('chip', 120, 44, 22, 21),
  tabActive: slice('tab_active', 120, 64, 18, 18),
  tabIdle: slice('tab_idle', 120, 64, 18, 18),
  tabSel: slice('tab_sel', 120, 64, 18, 18),
  plate: slice('plate', 160, 88, 44, 43),
  tag: slice('tag', 48, 28, 8, 8),
  tagPill: slice('tag_pill', 120, 36, 18, 17),
};

export const GLASS_ICON = {
  back: G('icon_back'),
  close: G('icon_close'),
  chevron: G('icon_chevron'),
  plus: G('icon_plus'),
  accent: G('accent_bar'),
  divider: G('divider'),
  navAttr: G('nav_attr'),
  navEquip: G('nav_equip'),
  navSkill: G('nav_skill'),
  navStar: G('nav_star'),
  arrowLeft: G('icon_arrow_l'),
  arrowRight: G('icon_arrow_r'),
  lock: G('lock'),
};

/** 属性小图标(直接从原型 hero_b2 抠的扁平暗金剪影,glass_kit_gen.extract_proto_icons)。 */
export const GLASS_STAT_ICON = {
  hp: G('stat_hp'),
  def: G('stat_def'),
  crit: G('stat_crit'),
  luck: G('stat_luck'),
  atk: G('stat_atk'),
  spd: G('stat_spd'),
  awaken: G('stat_awaken'),
  sword: G('stat_sword'),
  loot: G('stat_loot'),
};

/** 装备部位空格线稿(原型 hero_equip_b 抠,白色,运行时染色)+ 铜锁(原型 hero_star_b)。 */
export const GLASS_PART_ICON: Record<string, string> = {
  WEAPON: G('part_weapon'),
  HELMET: G('part_helmet'),
  CHEST: G('part_chest'),
  BOOTS: G('part_boots'),
  RING: G('part_ring'),
  NECKLACE: G('part_necklace'),
};

export const GLASS_ASSET_PATHS: readonly string[] = [
  ...Object.values(GLASS_SLICES).map((item) => item.path),
  ...Object.values(GLASS_ICON),
  ...Object.values(GLASS_STAT_ICON),
  ...Object.values(GLASS_PART_ICON),
  G('lock'),
];

/** 色板(原型取色)。 */
export const GLASS_COLOR = {
  text: new Color(242, 242, 242, 255),
  sub: new Color(182, 189, 205, 255),
  dim: new Color(120, 126, 138, 255),
  champagne: new Color(227, 196, 138, 255),
  onChampagne: new Color(46, 34, 18, 255),
  green: new Color(132, 214, 140, 255),
  red: new Color(232, 108, 96, 255),
  gold: new Color(201, 168, 106, 255),
};

/**
 * 九宫格贴图:节点按 (w/k, h/k) 建,再整体缩放 k —— 圆角只等比缩放不被拉伸。
 * 宽 / 高小于左右(上下)边距之和时把 k 压小,保证不出现角饰重叠。
 */
export function mountGlassSlice(host: UiKitHost, parent: Node, name: string, item: GlassSlice, x: number, y: number, width: number, height: number, k: number): Sprite | null {
  const fit = Math.min(k, width / (item.l + item.r), height / (item.t + item.b));
  const s = Math.max(0.05, fit);
  const sprite = host.addSprite(name, item.path, x, y, width / s, height / s, parent);
  if (sprite) {
    const frame = sprite.spriteFrame;
    if (frame) {
      frame.insetLeft = item.l;
      frame.insetRight = item.r;
      frame.insetTop = item.t;
      frame.insetBottom = item.b;
    }
    sprite.type = Sprite.Type.SLICED;
    sprite.node.setScale(s, s, 1);
  }
  return sprite;
}

/** 毛玻璃面板(返回容器节点,内容挂在它下面;坐标以面板中心为原点)。 */
export function mountGlassPanel(host: UiKitHost, parent: Node, name: string, x: number, y: number, width: number, height: number, k: number, selected = false): Node {
  const node = host.addChildPlainNode(parent, name, x, y, width, height);
  mountGlassSlice(host, node, 'Glass', selected ? GLASS_SLICES.panelSel : GLASS_SLICES.panel, 0, 0, width, height, k);
  return node;
}

export function glassLabel(
  host: UiKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: Color,
  width: number,
  align: HorizontalTextAlignment = HorizontalTextAlignment.LEFT,
  bold = false,
): Label {
  // LEFT / RIGHT 对齐:x 为文字左沿 / 右沿(UiPrimitiveFactory.resolveAlignedLabelX 已按对齐方式平移框),与原型量的文字起点一致
  const w = Math.max(10, width);
  const label = host.addChildLabel(parent, name, text, x, y, fontSize, color, new Size(w, fontSize + 12), align);
  label.lineHeight = fontSize + 4;
  label.overflow = Label.Overflow.SHRINK;
  label.isBold = bold;
  label.enableOutline = false;
  label.enableShadow = true;
  label.shadowColor = new Color(0, 0, 0, 120);
  label.shadowOffset.set(0, -1);
  label.shadowBlur = 2;
  return label;
}

export type GlassButtonKind = 'primary' | 'secondary' | 'disabled';

/** 胶囊按钮:primary 香槟金实心深字 / secondary 半透明白字 / disabled 灰(不响应)。 */
export function mountGlassButton(
  host: UiKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  k: number,
  kind: GlassButtonKind,
  onClick?: () => void,
  fontSize = 24,
): Node {
  const node = host.addChildPlainNode(parent, name, x, y, width, height);
  const item = kind === 'primary' ? GLASS_SLICES.pillPrimary : kind === 'secondary' ? GLASS_SLICES.pillSecondary : GLASS_SLICES.pillDisabled;
  mountGlassSlice(host, node, 'Pill', item, 0, 0, width, height, k);
  const color = kind === 'primary' ? GLASS_COLOR.onChampagne : kind === 'secondary' ? GLASS_COLOR.text : GLASS_COLOR.dim;
  const label = host.addChildLabel(node, 'Label', text, 0, 0, fontSize * k, color, new Size(width * 0.82, height * 0.8), HorizontalTextAlignment.CENTER);
  label.overflow = Label.Overflow.SHRINK;
  label.isBold = kind === 'primary';
  label.enableOutline = false;
  fitButtonLabel(label, height);
  if (kind !== 'disabled') {
    node.addComponent(Button);
    if (onClick) {
      node.on(Button.EventType.CLICK, onClick);
    }
    host.applyImageButtonFeedback(node, 1.03, 0.97);
  }
  return node;
}

/** 分区标题:左侧香槟竖条 + 标题;rightText 给右侧「属性详情 ›」一类的文字链接。 */
export function mountGlassSectionHeader(
  host: UiKitHost,
  parent: Node,
  name: string,
  title: string,
  leftX: number,
  y: number,
  k: number,
  fontSize = 26,
  right?: { text: string; rightX: number; onClick?: () => void },
): void {
  host.addSprite(`${name}Bar`, GLASS_ICON.accent, leftX, y, 4 * k, 24 * k, parent);
  glassLabel(host, parent, `${name}Title`, title, leftX + 14 * k, y, fontSize * k, GLASS_COLOR.text, 260 * k, HorizontalTextAlignment.LEFT, true);
  if (right) {
    const w = 200 * k;
    const node = host.addChildPlainNode(parent, `${name}Link`, right.rightX - w / 2, y, w, 40 * k);
    glassLabel(host, node, 'Text', right.text, w / 2 - 24 * k, 0, 18 * k, GLASS_COLOR.sub, w - 24 * k, HorizontalTextAlignment.RIGHT);
    host.addSprite('Chevron', GLASS_ICON.chevron, w / 2 - 8 * k, 0, 16 * k, 16 * k, node);
    if (right.onClick) {
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, right.onClick);
      host.applyImageButtonFeedback(node, 1.03, 0.97);
    }
  }
}

/** 货币条:暗胶囊 + 左图标 + 数值(+ 可选「+」)。 */
export function mountGlassChip(host: UiKitHost, parent: Node, name: string, iconPath: string, value: string, x: number, y: number, width: number, height: number, k: number, onPlus?: () => void): Node {
  const node = host.addChildPlainNode(parent, name, x, y, width, height);
  mountGlassSlice(host, node, 'Chip', GLASS_SLICES.chip, 0, 0, width, height, k);
  const icon = height * 0.72;
  host.addSprite('Icon', iconPath, -width / 2 + height * 0.18 + icon / 2, 0, icon, icon, node);
  glassLabel(host, node, 'Value', value, -width / 2 + height * 0.18 + icon + 14 * k, 0, 20 * k, GLASS_COLOR.text, width - icon - (onPlus ? 54 : 30) * k);
  if (onPlus) {
    const plus = host.addChildPlainNode(node, 'Plus', width / 2 - 20 * k, 0, 36 * k, height);
    host.addSprite('Icon', GLASS_ICON.plus, 0, 0, 18 * k, 18 * k, plus);
    plus.addComponent(Button);
    plus.on(Button.EventType.CLICK, onPlus);
  }
  return node;
}

/** 线性图标按钮(返回 / 关闭)。 */
export function mountGlassIconButton(host: UiKitHost, parent: Node, name: string, iconPath: string, x: number, y: number, size: number, hit: number, onClick: () => void): Node {
  const node = host.addChildPlainNode(parent, name, x, y, hit, hit);
  host.addSprite('Icon', iconPath, 0, 0, size, size, node);
  node.addComponent(Button);
  node.on(Button.EventType.CLICK, onClick);
  host.applyImageButtonFeedback(node, 1.08, 0.94);
  return node;
}

/** 标签胶囊实际高度:上下留白,高 ≥ 字号 × 1.7(手机字号下限 20 时原来 27 高的胶囊会让字贴边,10-28 用户)。 */
export function glassTagPillHeight(height: number, fontSize: number): number {
  return Math.max(height, fontSize * 1.7);
}

/** 标签胶囊实际宽度(右对齐时先用它算左沿);左右留白随高度走。 */
export function glassTagPillWidthOf(text: string, fontSize: number, height: number, estimateWidth: (text: string, fontSize: number) => number): number {
  return estimateWidth(text, fontSize) + glassTagPillHeight(height, fontSize) * 0.9;
}

/**
 * 标签胶囊(「大招 · Lv.5/5」「★3 解锁」「已解锁」):原型的浅填充 + 细描边;leftX 为胶囊左沿,返回胶囊宽。
 * 全站标签统一用这个(10-28 用户:黑底无边框和原型不一致,其他界面都要统一)。
 */
export function mountGlassTagPill(host: UiKitHost, parent: Node, name: string, text: string, leftX: number, y: number, height: number, k: number, fontSize: number, estimateWidth: (text: string, fontSize: number) => number, color: Color = GLASS_COLOR.sub): number {
  const h = glassTagPillHeight(height, fontSize);
  const w = estimateWidth(text, fontSize) + h * 0.9;
  const node = host.addChildPlainNode(parent, name, leftX + w / 2, y, w, h);
  mountGlassSlice(host, node, 'Bg', GLASS_SLICES.tagPill, 0, 0, w, h, k);
  glassLabel(host, node, 'Text', text, 0, 0, fontSize, color, w - 10 * k, HorizontalTextAlignment.CENTER);
  return w;
}

/** 装备图标素材自带圆角稀有度边框(在图标宽 2.7%~5.7% 处,内部透明):放进玻璃框时用遮罩裁掉,只露图标本体 —— 全站「图标只一层框」。 */
export const EQUIP_ICON_FRAME_INSET = 0.065;

/** 在 (x, y) 放一个裁掉自带边框的图标:size = 露出的可见边长(图标按 size / (1 - 2·inset) 放大后由矩形遮罩裁边)。 */
export function mountGlassClippedIcon(host: UiKitHost, parent: Node, name: string, iconPath: string, x: number, y: number, size: number): Node {
  const clip = host.addChildPlainNode(parent, name, x, y, size, size);
  const mask = clip.addComponent(Mask);
  mask.type = Mask.Type.GRAPHICS_RECT;
  const full = size / (1 - 2 * EQUIP_ICON_FRAME_INSET);
  host.addSprite('Icon', iconPath, 0, 0, full, full, clip);
  return clip;
}

