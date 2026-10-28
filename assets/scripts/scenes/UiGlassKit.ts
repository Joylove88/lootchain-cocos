import { Button, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite } from 'cc';
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
  /** 贴图四周留给外晕的透明边(贴图像素):挂载时按同比例向外扩,本体仍对齐给定宽高。 */
  pad?: number;
}

const slice = (name: string, w: number, h: number, lr: number, tb: number, pad = 0): GlassSlice => ({ path: G(name), w, h, l: lr, r: lr, t: tb, b: tb, pad });

export const GLASS_SLICES = {
  panel: slice('panel', 64, 64, 16, 16),
  // 选中态(10-28 v2):金边 + 金边外晕 + 左右强上下弱的暖金内光 + 暗心;全站选中行 / 选中格共用
  panelSel: slice('panel_sel', 112, 112, 44, 24, 8),
  // 装备框 / 物品格(原型合成槽位):浅灰亮边 + 冷色内光向中心渐暗
  frame: slice('frame', 112, 112, 18, 18),
  // 选中格:金边 + 浅暖内光 + 暗心(格子小,用选中行的宽暖光会整格发棕)
  frameSel: slice('frame_sel', 112, 112, 18, 18),
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
  railSel: slice('rail_sel', 120, 114, 22, 22),
  // 10-28 锻造原型的光照款:次钮上中部一束光、材料不足哑光暗金、分类页签贴边内发光
  pillSecondaryLit: slice('pill_secondary_lit', 160, 56, 28, 27),
  pillPrimaryDim: slice('pill_primary_dim', 160, 56, 28, 27),
  tabGlow: slice('tab_glow', 120, 64, 24, 24),
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
  navFuse: G('nav_fuse'),
  navGem: G('nav_gem'),
  arrowLeft: G('icon_arrow_l'),
  arrowRight: G('icon_arrow_r'),
  lock: G('lock'),
  lineFade: G('line_fade'),
  lineFadeV: G('line_fade_v'),
  shadeH: G('shade_h'),
};

/** 背包左栏分类线稿(原型 bag_b 抠的白色剪影,运行时染色)。 */
export const GLASS_BAG_ICON: Record<string, string> = {
  ALL: G('bag_all'),
  MATERIAL: G('bag_material'),
  EQUIPMENT: G('bag_equip'),
  GACHA_TICKET: G('bag_ticket'),
  CONSUMABLE: G('bag_consume'),
  HERO_FRAGMENT: G('bag_fragment'),
  CURRENCY_BOX: G('bag_box'),
  PASS: G('bag_pass'),
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

/** 锻造列表部位页签实心图标(原型 forge_b 抠,白色,运行时染色)。 */
export const GLASS_FORGE_TAB_ICON: Record<string, string> = {
  WEAPON: G('tab_weapon'),
  HELMET: G('tab_helmet'),
  CHEST: G('tab_chest'),
  BOOTS: G('tab_boots'),
  RING: G('tab_ring'),
  NECKLACE: G('tab_necklace'),
};

export const GLASS_ASSET_PATHS: readonly string[] = [
  ...Object.values(GLASS_SLICES).map((item) => item.path),
  ...Object.values(GLASS_ICON),
  ...Object.values(GLASS_STAT_ICON),
  ...Object.values(GLASS_PART_ICON),
  ...Object.values(GLASS_FORGE_TAB_ICON),
  ...Object.values(GLASS_BAG_ICON),
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
  const pad = item.pad ?? 0;
  const fit = Math.min(k, width / Math.max(1, item.l + item.r - pad * 2), height / Math.max(1, item.t + item.b - pad * 2));
  const s = Math.max(0.05, fit);
  const sprite = host.addSprite(name, item.path, x, y, width / s + pad * 2, height / s + pad * 2, parent);
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
/** 装备框 / 物品格(全站统一,10-28 用户):未选中 = frame(亮边 + 内光渐暗),选中 = frameSel(金边 + 暗心)。 */
export function mountGlassFrame(host: UiKitHost, parent: Node, name: string, x: number, y: number, width: number, height: number, k: number, selected = false): Node {
  const node = host.addChildPlainNode(parent, name, x, y, width, height);
  mountGlassSlice(host, node, 'Glass', selected ? GLASS_SLICES.frameSel : GLASS_SLICES.frame, 0, 0, width, height, k);
  return node;
}

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

/**
 * disabled = 次按钮外观 + 灰字(不响应);primaryOff = 主按钮外观 + 暗一档的字(不响应)。
 * 10-28 用户:不可用按钮「透明化过重导致看不清」——不可用也保持原型外观,只靠字色区分,不做半透明。
 */
export type GlassButtonKind = 'primary' | 'secondary' | 'disabled' | 'primaryOff' | 'secondaryLit' | 'primaryDim';

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
  const item = kind === 'primary' || kind === 'primaryOff' ? GLASS_SLICES.pillPrimary
    : kind === 'primaryDim' ? GLASS_SLICES.pillPrimaryDim
      : kind === 'secondaryLit' ? GLASS_SLICES.pillSecondaryLit : GLASS_SLICES.pillSecondary;
  mountGlassSlice(host, node, 'Pill', item, 0, 0, width, height, k);
  // primaryDim(材料不足):暗金底 + 米白字(原型 (238,226,202)),不再亮底亮字糊在一起
  const color = kind === 'primary' ? GLASS_COLOR.onChampagne : kind === 'primaryOff' ? new Color(110, 92, 64, 255)
    : kind === 'primaryDim' ? new Color(238, 226, 202, 255) : kind === 'secondary' || kind === 'secondaryLit' ? GLASS_COLOR.text : GLASS_COLOR.sub;
  const label = host.addChildLabel(node, 'Label', text, 0, 0, fontSize * k, color, new Size(width * 0.82, height * 0.8), HorizontalTextAlignment.CENTER);
  label.overflow = Label.Overflow.SHRINK;
  label.isBold = kind === 'primary' || kind === 'primaryOff';
  label.enableOutline = false;
  fitButtonLabel(label, height);
  if (kind !== 'disabled' && kind !== 'primaryOff') {
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
  // 字号按调用方给的原型字号写死(不走手机 20 下限,10-28 用户:标签比原型大)
  const label = glassLabel(host, node, 'Text', text, 0, 0, fontSize, color, w - 10 * k, HorizontalTextAlignment.CENTER);
  label.fontSize = Math.max(12, Math.round(fontSize));
  label.lineHeight = label.fontSize + 4;
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

/** 勾选框(原型:圆角方框 + 浅灰细边;勾上 = 香槟实底 + 深色对勾)。 */
export function mountGlassCheckbox(host: UiKitHost, parent: Node, name: string, x: number, y: number, size: number, on: boolean): Node {
  const node = host.addChildPlainNode(parent, name, x, y, size, size);
  const g = node.addComponent(Graphics);
  const r = size * 0.18;
  g.fillColor = on ? new Color(227, 196, 138, 255) : new Color(18, 22, 29, 200);
  g.roundRect(-size / 2, -size / 2, size, size, r);
  g.fill();
  g.strokeColor = on ? new Color(240, 220, 176, 255) : new Color(150, 160, 172, 220);
  g.lineWidth = Math.max(1.2, size * 0.05);
  g.roundRect(-size / 2, -size / 2, size, size, r);
  g.stroke();
  if (on) {
    g.strokeColor = new Color(46, 34, 18, 255);
    g.lineWidth = Math.max(2, size * 0.11);
    g.moveTo(-size * 0.26, 0);
    g.lineTo(-size * 0.06, -size * 0.2);
    g.lineTo(size * 0.28, size * 0.2);
    g.stroke();
  }
  return node;
}

/** 细分割线(原型取色,Graphics 矩形;GLASS_ICON.divider 贴图太淡时用)。 */
export function mountGlassLine(host: UiKitHost, parent: Node, name: string, x: number, y: number, width: number, height: number, color: Color): Node {
  const node = host.addChildPlainNode(parent, name, x, y, Math.max(1, width), Math.max(1, height));
  const g = node.addComponent(Graphics);
  g.fillColor = color;
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  return node;
}

/** 渐隐分割线(原型强化页):中间最实、两端淡出,上压 1px 暗线;color 为最实处颜色,height 为亮线粗细。vertical 时 width 为粗细、height 为长度。 */
export function mountGlassFadeLine(host: UiKitHost, parent: Node, name: string, x: number, y: number, width: number, height: number, color: Color, vertical = false): Node | null {
  const w = vertical ? Math.max(2, width * 1.5) : width;
  const h = vertical ? height : Math.max(2, height * 1.5);
  const sprite = host.addSprite(name, vertical ? GLASS_ICON.lineFadeV : GLASS_ICON.lineFade, x, y, w, h, parent);
  if (!sprite) {
    return mountGlassLine(host, parent, name, x, y, vertical ? width : width, vertical ? height : height, color);
  }
  sprite.color = color;
  return sprite.node;
}


/** 原型坐标映射(1870×841):k 按"装得下"取;LX / RX 贴左右缘,FX / FY 以面板中心为原点。 */
export function glassProtoMap(panelWidth: number, panelHeight: number): { k: number; LX: (px: number) => number; RX: (px: number) => number; FX: (px: number) => number; FY: (py: number) => number; S: (v: number) => number } {
  const k = Math.min(panelWidth / 1870, panelHeight / 841);
  return {
    k,
    LX: (px: number): number => -panelWidth / 2 + px * k,
    RX: (px: number): number => panelWidth / 2 - (1870 - px) * k,
    FX: (px: number): number => (px - 935) * k,
    FY: (py: number): number => (420.5 - py) * k,
    S: (v: number): number => v * k,
  };
}

/**
 * B 风格顶栏(各整页共用,原型 forge_b / bag_b):‹ + 标题(+ 可选 ?)左上;货币胶囊 + 竖分隔 + × 右上。
 * chips 从右缘 chipRight(原型 x)往左排,宽按各原型实测;节点名带 prefix 便于自验脚本定位。
 */
export function mountGlassTopBar(
  host: UiKitHost,
  parent: Node,
  prefix: string,
  panelWidth: number,
  panelHeight: number,
  title: string,
  chips: Array<{ key: string; icon: string; value: string; width: number }>,
  onBack: () => void,
  onClose: () => void,
  opts: { chipRight?: number; onHelp?: () => void } = {},
): void {
  const { LX, RX, FY, S, k } = glassProtoMap(panelWidth, panelHeight);
  mountGlassIconButton(host, parent, `${prefix}GlassBack`, GLASS_ICON.back, LX(68), FY(44), S(34), S(72), onBack);
  const t = glassLabel(host, parent, `${prefix}GlassTitle`, title, LX(115), FY(44), S(34), GLASS_COLOR.text, S(200), HorizontalTextAlignment.LEFT, true);
  t.fontSize = Math.round(S(34));
  t.lineHeight = t.fontSize + 4;
  if (opts.onHelp) {
    let w = 0;
    for (const ch of Array.from(title)) {
      w += /[　-鿿＀-￯]/.test(ch) ? t.fontSize : t.fontSize * 0.56;
    }
    const help = host.addChildPlainNode(parent, `${prefix}GlassHelp`, LX(115) + w + S(40), FY(46), S(56), S(56));
    const hg = help.addComponent(Graphics);
    hg.strokeColor = new Color(170, 178, 192, 220);
    hg.lineWidth = Math.max(1.2, S(1.6));
    hg.circle(0, 0, S(18));
    hg.stroke();
    const q = glassLabel(host, help, 'Q', '?', 0, 0, S(22), new Color(200, 206, 216, 255), S(30), HorizontalTextAlignment.CENTER);
    q.fontSize = Math.round(S(22));
    help.addComponent(Button);
    help.on(Button.EventType.CLICK, opts.onHelp);
  }
  let right = opts.chipRight ?? 1725;
  const spans: Array<{ l: number; r: number }> = [];
  for (let i = chips.length - 1; i >= 0; i -= 1) {
    spans.unshift({ l: right - chips[i].width, r: right });
    right -= chips[i].width + 14;
  }
  chips.forEach((chip, index) => {
    const { l, r } = spans[index];
    mountGlassChip(host, parent, `${prefix}GlassChip_${chip.key}`, chip.icon, chip.value, (RX(l) + RX(r)) / 2, FY(44), RX(r) - RX(l), S(42), k);
  });
  const divider = host.addSprite(`${prefix}GlassDivider`, GLASS_ICON.divider, RX(1752), FY(44), S(36), S(2), parent);
  if (divider) {
    divider.node.angle = 90;
  }
  mountGlassIconButton(host, parent, `${prefix}GlassClose`, GLASS_ICON.close, RX(1805), FY(43), S(36), S(72), onClose);
}

/** B 风格滚动条:淡灰轨道 + 灰白滑块;返回按进度(0..1)挪滑块的函数。 */
export function mountGlassScrollBar(host: UiKitHost, parent: Node, name: string, x: number, y: number, barW: number, trackH: number, thumbH: number): (progress: number) => void {
  const bar = host.addChildPlainNode(parent, name, x, y, barW, trackH);
  mountGlassLine(host, bar, 'Track', 0, 0, barW, trackH, new Color(255, 255, 255, 18));
  const thumb = mountGlassLine(host, bar, 'Thumb', 0, trackH / 2 - thumbH / 2, barW, thumbH, new Color(150, 160, 176, 170));
  return (progress: number): void => {
    if (!thumb.isValid) {
      return;
    }
    const p = Math.min(1, Math.max(0, progress));
    thumb.setPosition(0, trackH / 2 - thumbH / 2 - (trackH - thumbH) * p, 0);
  };
}
