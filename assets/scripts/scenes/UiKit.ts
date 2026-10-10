import { Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite } from 'cc';
import { rgba } from './lobby/LobbyHudTypes';

/**
 * 全局 UI 套件(2026-10-10 全界面美化):把商店 / 水晶 / 任务里已验收的切图收成几种通用部件,
 * 让设置、公告、更多、爬塔等还在用手绘矩形的界面统一换成同一套黑金红风格。
 * 九宫格一律「源尺寸 SLICED + 整体等比缩放 k」:角饰只等比缩放,不被拉变形(见水晶弹窗 mountSliced)。
 * 切图没读到时回退手绘(addSprite 返回 null 时会自动排队加载,读到后界面重建即换成切图)。
 */
export interface UiKitHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

interface SliceSpec {
  path: string;
  w: number;
  h: number;
  inset: { l: number; r: number; t: number; b: number };
}

const spec = (path: string, w: number, h: number, l: number, r: number, t = 0, b = 0): SliceSpec => ({ path: `ui/${path}/spriteFrame`, w, h, inset: { l, r, t, b } });

/** 红金主按钮(确认 / 领取 / 兑换)。 */
export const KIT_BUTTON_PRIMARY = spec('common/ai/button_primary', 740, 211, 150, 150);
/** 暗色次按钮(刷新 / 取消 / 返回)。 */
export const KIT_BUTTON_SECONDARY = spec('common/ai/button_return_dis', 695, 165, 150, 150);
/** 禁用 / 未完成按钮。 */
export const KIT_BUTTON_DISABLED = spec('mission/ai/btn_disabled', 393, 142, 60, 60);
/** 二选一 / 开关:选中金框、未选暗框(水晶弹窗页签同款)。 */
export const KIT_TOGGLE_ON = spec('crystal/ai/tab_on', 440, 122, 70, 70);
export const KIT_TOGGLE_OFF = spec('crystal/ai/tab_off', 512, 122, 70, 70);
/** 页签:选中红底金边、未选暗底(任务页签同款)。 */
export const KIT_TAB_ACTIVE = spec('mission/ai/tab_active', 673, 205, 110, 110);
export const KIT_TAB_NORMAL = spec('mission/ai/tab_normal', 621, 162, 100, 100);
/** 区块底框:四角金饰暗底(水晶内面板同款)。 */
export const KIT_SECTION_FRAME = spec('crystal/ai/inner_panel_bg', 1948, 1259, 110, 110, 110, 110);

export const KIT_ASSET_PATHS: readonly string[] = [
  KIT_BUTTON_PRIMARY, KIT_BUTTON_SECONDARY, KIT_BUTTON_DISABLED, KIT_TOGGLE_ON, KIT_TOGGLE_OFF, KIT_TAB_ACTIVE, KIT_TAB_NORMAL, KIT_SECTION_FRAME,
].map((item) => item.path);

/** 横条类切图:按高度定缩放 k,宽度方向九宫格拉伸。 */
function mountStrip(host: UiKitHost, parent: Node, item: SliceSpec, width: number, height: number): Sprite | null {
  const k = height / item.h;
  // 宽度太窄放不下左右角饰时退回整图等比压缩(仍比手绘好看)
  const minWidth = (item.inset.l + item.inset.r) * k;
  if (width < minWidth) {
    return host.addSprite('Art', item.path, 0, 0, width, height, parent);
  }
  const sprite = host.addSprite('Art', item.path, 0, 0, width / k, item.h, parent);
  if (sprite) {
    applyInsets(sprite, item);
    sprite.node.setScale(k, k, 1);
  }
  return sprite;
}

function applyInsets(sprite: Sprite, item: SliceSpec): void {
  const frame = sprite.spriteFrame;
  if (frame) {
    frame.insetLeft = item.inset.l;
    frame.insetRight = item.inset.r;
    frame.insetTop = item.inset.t;
    frame.insetBottom = item.inset.b;
  }
  sprite.type = Sprite.Type.SLICED;
}

function outline(label: Label, scale: number): void {
  label.enableOutline = true;
  label.outlineColor = rgba(0, 0, 0, 220);
  label.outlineWidth = Math.max(1, 1.5 * scale);
}

function drawFallback(node: Node, width: number, height: number, fill: Color, stroke: Color, scale: number): void {
  const graphics = node.addComponent(Graphics);
  const bevel = Math.min(10 * scale, height / 3);
  graphics.fillColor = fill;
  traceBeveled(graphics, width, height, bevel);
  graphics.fill();
  graphics.strokeColor = stroke;
  graphics.lineWidth = Math.max(1, 1.5 * scale);
  traceBeveled(graphics, width, height, bevel);
  graphics.stroke();
}

function traceBeveled(graphics: Graphics, width: number, height: number, bevel: number): void {
  graphics.moveTo(-width / 2 + bevel, height / 2);
  graphics.lineTo(width / 2 - bevel, height / 2);
  graphics.lineTo(width / 2, height / 2 - bevel);
  graphics.lineTo(width / 2, -height / 2 + bevel);
  graphics.lineTo(width / 2 - bevel, -height / 2);
  graphics.lineTo(-width / 2 + bevel, -height / 2);
  graphics.lineTo(-width / 2, -height / 2 + bevel);
  graphics.lineTo(-width / 2, height / 2 - bevel);
  graphics.close();
}

export type KitButtonKind = 'primary' | 'secondary' | 'disabled';

/** 文字按钮:primary 红金 / secondary 暗金 / disabled 灰暗(不响应点击)。 */
export function mountKitButton(
  host: UiKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  kind: KitButtonKind,
  onClick?: () => void,
  fontSize = 22,
): Node {
  const button = host.addChildPlainNode(parent, name, x, y, width, height);
  const item = kind === 'primary' ? KIT_BUTTON_PRIMARY : kind === 'secondary' ? KIT_BUTTON_SECONDARY : KIT_BUTTON_DISABLED;
  if (!mountStrip(host, button, item, width, height)) {
    drawFallback(button, width, height,
      kind === 'primary' ? rgba(110, 22, 20, 240) : rgba(20, 16, 15, 232),
      kind === 'disabled' ? rgba(100, 86, 66, 160) : rgba(206, 154, 70, 226), scale);
  }
  // 主按钮左右角饰较宽,文字框收窄,SHRINK 兜底长文案
  const textWidth = width * (kind === 'primary' ? 0.66 : 0.72);
  const color = kind === 'primary' ? rgba(255, 232, 178) : kind === 'secondary' ? rgba(240, 210, 140) : rgba(150, 138, 118);
  const label = host.addChildLabel(button, `${name}Label`, text, 0, kind === 'primary' ? 1 * scale : 0, fontSize * scale, color, new Size(textWidth, height * 0.7));
  label.overflow = Label.Overflow.SHRINK;
  outline(label, scale);
  if (kind !== 'disabled') {
    button.addComponent(Button);
    if (onClick) {
      button.on(Button.EventType.CLICK, onClick);
    }
    host.applyImageButtonFeedback(button, 1.03, 0.97);
  }
  return button;
}

/** 选项开关 / 二选一:active 金框亮字,否则暗框灰字;两种状态都可点。 */
export function mountKitToggle(
  host: UiKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  active: boolean,
  onClick: () => void,
  fontSize = 20,
): Node {
  const button = host.addChildPlainNode(parent, name, x, y, width, height);
  if (!mountStrip(host, button, active ? KIT_TOGGLE_ON : KIT_TOGGLE_OFF, width, height)) {
    drawFallback(button, width, height, active ? rgba(89, 65, 30, 238) : rgba(12, 11, 13, 218), active ? rgba(245, 203, 101, 236) : rgba(132, 96, 50, 188), scale);
  }
  const label = host.addChildLabel(button, `${name}Label`, text, 0, 0, fontSize * scale, active ? rgba(255, 236, 180) : rgba(186, 170, 140), new Size(width * 0.76, height * 0.74));
  label.overflow = Label.Overflow.SHRINK;
  outline(label, scale);
  button.addComponent(Button);
  button.on(Button.EventType.CLICK, onClick);
  host.applyImageButtonFeedback(button, 1.025, 0.975);
  return button;
}

/** 页签:active 红底金边,否则暗底。 */
export function mountKitTab(
  host: UiKitHost,
  parent: Node,
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  active: boolean,
  onClick?: () => void,
  fontSize = 20,
): Node {
  const button = host.addChildPlainNode(parent, name, x, y, width, height);
  if (!mountStrip(host, button, active ? KIT_TAB_ACTIVE : KIT_TAB_NORMAL, width, height)) {
    drawFallback(button, width, height, active ? rgba(70, 16, 16, 236) : rgba(14, 12, 14, 210), active ? rgba(226, 170, 80, 230) : rgba(126, 106, 74, 150), scale);
  }
  const label = host.addChildLabel(button, `${name}Label`, text, 0, 0, fontSize * scale, active ? rgba(255, 230, 170) : rgba(206, 188, 150), new Size(width * 0.74, height * 0.74));
  label.overflow = Label.Overflow.SHRINK;
  outline(label, scale);
  if (onClick) {
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, onClick);
    host.applyImageButtonFeedback(button, 1.02, 0.98);
  }
  return button;
}

/**
 * 区块底框(四角金饰暗底)。cornerScale 是角饰相对源图的缩放上限:默认 0.26 ≈ 角饰 28px,
 * 再大会压住框内小标题(水晶弹窗实测)。返回的节点可直接当子内容的父节点(坐标以框中心为原点)。
 */
export function mountKitSection(host: UiKitHost, parent: Node, name: string, x: number, y: number, width: number, height: number, scale: number, cornerScale = 0.26): Node {
  const node = host.addChildPlainNode(parent, name, x, y, width, height);
  const item = KIT_SECTION_FRAME;
  // 角饰(源 110px)不超过框短边的 1/3
  const k = Math.min(cornerScale * Math.max(0.6, scale), Math.min(width, height) / (item.inset.l * 3));
  const sprite = host.addSprite('Art', item.path, 0, 0, width / k, height / k, node);
  if (sprite) {
    applyInsets(sprite, item);
    sprite.node.setScale(k, k, 1);
  } else {
    drawFallback(node, width, height, rgba(14, 12, 13, 214), rgba(135, 99, 52, 176), scale);
  }
  return node;
}

const KIT_BACKDROP_ASSET = 'ui/battle/ai/battle_bg_cathedral/spriteFrame';
const KIT_BACKDROP_ASPECT = 1920 / 1080;

/**
 * 电脑端弹层的整窗背景(2026-10-10:设置 / 更多 / 邮件 / 公告在电脑上背后是纯黑 + 一团红光):
 * 血色大教堂实景等比铺满 + 压暗,与手机全屏框同一张图。读不到图时只画压暗。
 */
export function mountKitBackdrop(host: UiKitHost, parent: Node, width: number, height: number, veilAlpha = 150): Node {
  const node = host.addChildPlainNode(parent, 'KitBackdrop', 0, 0, width, height);
  const coverW = Math.max(width, height * KIT_BACKDROP_ASPECT);
  host.addSprite('Art', KIT_BACKDROP_ASSET, 0, 0, coverW, coverW / KIT_BACKDROP_ASPECT, node);
  const veil = host.addChildPlainNode(node, 'Veil', 0, 0, width, height);
  const graphics = veil.addComponent(Graphics);
  graphics.fillColor = rgba(4, 3, 5, veilAlpha);
  graphics.rect(-width / 2, -height / 2, width, height);
  graphics.fill();
  return node;
}
