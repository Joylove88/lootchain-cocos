import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
} from 'cc';
import { rgba, type UiLayout } from './lobby/LobbyHudTypes';

// 旧资产路径保留供布局守护基线引用;实际渲染用 AI 圆形关闭钮。
export const SCENE_BACK_BUTTON_LEGACY_ASSET = 'ui/common/scene_back_button/spriteFrame';
export const SCENE_BACK_BUTTON_ASSET = 'ui/common/ai/button_close/spriteFrame';
// 左上标题横幅托底(title_banner_new 596×201:左金盔徽记+暗红牌身,文字压牌身;按标题字数自适应宽)。
export const SCENE_TITLE_BANNER_ASSET = 'ui/common/ai/title_banner_new/spriteFrame';
// 标题右侧问号帮助钮(可选,传 helpText 即显示;点击弹说明浮层)。
export const SCENE_HELP_BUTTON_ASSET = 'ui/common/ai/btn_help/spriteFrame';

export interface SceneBackButtonHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite?(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel?(
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

/**
 * 全屏逻辑场景统一返回按钮。
 * 与 Gacha 预览页保持同一套位置、尺寸、标题和按压反馈。
 */
export function renderSceneBackButton(
  host: SceneBackButtonHost,
  parent: Node,
  layout: UiLayout,
  name: string,
  onClick: () => void,
  scale: number,
  titleText = '',
  helpText = '',
): Node {
  const buttonScale = Math.max(0.56, Math.min(1, scale));
  const buttonWidth = 96 * buttonScale;
  const buttonHeight = 46 * buttonScale;
  // 关闭按钮统一放右上角(参考 Diablo 布局),标题留左上。
  const button = host.addChildPlainNode(
    parent,
    name,
    layout.stageRight - 58 * buttonScale,
    layout.stageTop - 42 * buttonScale,
    buttonWidth,
    buttonHeight,
  );
  button.addComponent(Button);
  button.on(Button.EventType.CLICK, onClick);
  host.applyImageButtonFeedback(button, 1.04, 0.96);

  // AI 圆形关闭钮是正方图:按短边显示为圆钮,点击热区保持原横向尺寸。
  const closeSize = Math.min(buttonWidth, buttonHeight) * 1.16;
  const sprite = host.addSprite?.('SceneBackButtonArt', SCENE_BACK_BUTTON_ASSET, 0, 0, closeSize, closeSize, button);
  if (!sprite) {
    drawFallbackBackButton(button, buttonWidth, buttonHeight, buttonScale);
  }
  renderBackTitle(host, parent, layout, buttonScale, titleText, helpText);
  return button;
}

function renderBackTitle(host: SceneBackButtonHost, parent: Node, layout: UiLayout, scale: number, titleText: string, helpText: string): void {
  if (!titleText || !host.addChildLabel) {
    return;
  }
  const titleY = layout.stageTop - 42 * scale;
  // 新横幅整图等比(不再纵向拉伸);左侧徽记占约 0.22 宽,文字中心压在牌身(约 0.59 处)。
  const bannerWidth = Math.max(250 * scale, titleText.length * 52 * scale + 72 * scale);
  const bannerHeight = bannerWidth * (201 / 596);
  const bannerX = layout.stageLeft + 18 * scale + bannerWidth / 2;
  const banner = host.addSprite?.('SceneBackTitleBanner', SCENE_TITLE_BANNER_ASSET, bannerX, titleY, bannerWidth, bannerHeight, parent);
  let bannerRight = bannerX + bannerWidth / 2;
  if (banner) {
    const title = host.addChildLabel(parent, 'SceneBackTitle', titleText, bannerX + bannerWidth * 0.09, titleY + bannerHeight * 0.02, 25 * scale, rgba(250, 222, 158), new Size(bannerWidth * 0.56, 40 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 220);
    title.outlineWidth = Math.max(1, 1.4 * scale);
    // 牌身右缘约在 0.95 宽处,帮助钮贴着放(间隔 6)。
    bannerRight = bannerX - bannerWidth / 2 + bannerWidth * 0.95;
  } else {
    const titleX = layout.stageLeft + 44 * scale;
    const titleWidth = Math.max(116 * scale, Math.min(320 * scale, layout.stageRight - titleX - 18 * scale));
    const title = host.addChildLabel(parent, 'SceneBackTitle', titleText, titleX, titleY + 1 * scale, 30 * scale, rgba(250, 222, 158), new Size(titleWidth, 44 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 220);
    title.outlineWidth = Math.max(1, 1.4 * scale);
    bannerRight = titleX + titleWidth * 0.5;
  }
  if (helpText) {
    renderHelpButton(host, parent, layout, bannerRight, titleY, scale, titleText, helpText);
  }
}

// 标题右侧问号钮:紧贴横幅,点击弹出说明浮层(点任意处关闭)。
function renderHelpButton(host: SceneBackButtonHost, parent: Node, layout: UiLayout, anchorRight: number, y: number, scale: number, titleText: string, helpText: string): void {
  const size = 42 * scale;
  const btn = host.addChildPlainNode(parent, 'SceneHelpButton', anchorRight + 6 * scale + size / 2, y, size, size);
  const art = host.addSprite?.('SceneHelpButtonArt', SCENE_HELP_BUTTON_ASSET, 0, 0, size, size, btn);
  if (!art) {
    const g = btn.addComponent(Graphics);
    g.fillColor = rgba(20, 16, 12, 235);
    g.circle(0, 0, size / 2);
    g.fill();
    g.strokeColor = rgba(214, 172, 96, 220);
    g.lineWidth = 1.6 * scale;
    g.circle(0, 0, size / 2);
    g.stroke();
    const glyph = host.addChildLabel?.(btn, 'SceneHelpButtonGlyph', '?', 0, 0, 22 * scale, rgba(238, 206, 138), new Size(size, size));
    if (glyph) {
      glyph.overflow = Label.Overflow.SHRINK;
    }
  }
  btn.addComponent(Button);
  btn.on(Button.EventType.CLICK, () => showSceneHelpPopup(host, parent, layout, scale, titleText, helpText));
  host.applyImageButtonFeedback(btn, 1.06, 0.94);
}

// 说明浮层:半透明遮罩 + 深色金框面板;即建即显,点击关闭,整页重绘时随父节点销毁。
function showSceneHelpPopup(host: SceneBackButtonHost, parent: Node, layout: UiLayout, scale: number, titleText: string, helpText: string): void {
  if (!host.addChildLabel) {
    return;
  }
  const overlay = host.addChildPlainNode(parent, 'SceneHelpOverlay', 0, 0, 4000, 4000);
  overlay.addComponent(BlockInputEvents);
  const og = overlay.addComponent(Graphics);
  og.fillColor = rgba(0, 0, 0, 150);
  og.rect(-2000, -2000, 4000, 4000);
  og.fill();
  const w = Math.min(600 * scale, (layout.stageRight - layout.stageLeft) * 0.82);
  const h = 330 * scale;
  const panel = host.addChildPlainNode(overlay, 'SceneHelpPanel', 0, 0, w, h);
  const g = panel.addComponent(Graphics);
  g.fillColor = rgba(12, 10, 9, 248);
  g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
  g.fill();
  g.strokeColor = rgba(214, 168, 82, 225);
  g.lineWidth = 2 * scale;
  g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
  g.stroke();
  g.strokeColor = rgba(150, 112, 58, 150);
  g.lineWidth = 1.1 * scale;
  g.roundRect(-w / 2 + 5 * scale, -h / 2 + 5 * scale, w - 10 * scale, h - 10 * scale, 8 * scale);
  g.stroke();
  const title = host.addChildLabel(panel, 'SceneHelpTitle', titleText + ' · 说明', 0, h / 2 - 32 * scale, 22 * scale, rgba(240, 210, 140), new Size(w - 48 * scale, 30 * scale));
  title.overflow = Label.Overflow.SHRINK;
  title.enableOutline = true;
  title.outlineColor = rgba(0, 0, 0, 220);
  title.outlineWidth = Math.max(1, 1.4 * scale);
  const body = host.addChildLabel(panel, 'SceneHelpBody', helpText, 0, 8 * scale, 19 * scale, rgba(222, 208, 178), new Size(w - 64 * scale, h - 128 * scale), HorizontalTextAlignment.LEFT);
  body.overflow = Label.Overflow.SHRINK;
  const hint = host.addChildLabel(panel, 'SceneHelpHint', '点击任意处关闭', 0, -h / 2 + 26 * scale, 16 * scale, rgba(160, 146, 120), new Size(w - 48 * scale, 22 * scale));
  hint.overflow = Label.Overflow.SHRINK;
  overlay.addComponent(Button);
  overlay.on(Button.EventType.CLICK, () => {
    if (overlay.isValid) {
      overlay.destroy();
    }
  });
}

// 顶部货币胶囊(全局统一,背包样式为基准):bag_currency_bar 底 + 左端圆槽图标 + 数值,右对齐排布。
export const SCENE_CURRENCY_BAR_ASSET = 'ui/common/ai/bag_currency_bar/spriteFrame';

export interface TopCurrencyEntry {
  key: string;
  icon: string;
  value: string;
}

export function renderTopCurrencyBar(host: SceneBackButtonHost, parent: Node, rightX: number, topY: number, scale: number, entries: TopCurrencyEntry[], rightInset = 150): void {
  if (!host.addChildLabel || !host.addSprite) {
    return;
  }
  const capWidth = 196 * scale;
  const capHeight = capWidth * (91 / 400);
  const gap = 18 * scale;
  const barY = topY - 40 * scale;
  let cursorX = rightX - rightInset * scale - capWidth / 2;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const chip = host.addChildPlainNode(parent, `TopCurrency_${entry.key}`, cursorX, barY, capWidth, capHeight);
    if (!host.addSprite(`TopCurrencyCapsule_${entry.key}`, SCENE_CURRENCY_BAR_ASSET, 0, 0, capWidth, capHeight, chip)) {
      const graphics = chip.addComponent(Graphics);
      graphics.fillColor = rgba(12, 10, 10, 190);
      graphics.roundRect(-capWidth / 2, -capHeight / 2, capWidth, capHeight, capHeight / 2);
      graphics.fill();
      graphics.strokeColor = rgba(157, 118, 60, 170);
      graphics.stroke();
    }
    // 图标嵌胶囊左端圆槽(源图圆槽中心约在宽 12% 处)。
    host.addSprite(`TopCurrencyIcon_${entry.key}`, entry.icon, -capWidth / 2 + capWidth * 0.12, 0, capHeight * 0.78, capHeight * 0.78, chip);
    const value = host.addChildLabel(chip, `TopCurrencyValue_${entry.key}`, entry.value, capWidth * 0.02, 0, 18 * scale, rgba(245, 222, 168), new Size(capWidth * 0.56, 22 * scale));
    value.overflow = Label.Overflow.SHRINK;
    value.enableOutline = true;
    value.outlineColor = rgba(0, 0, 0, 220);
    value.outlineWidth = Math.max(1, 1.4 * scale);
    cursorX -= capWidth + gap;
  }
}

function drawFallbackBackButton(button: Node, width: number, height: number, scale: number): void {
  const graphics = button.addComponent(Graphics);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  graphics.fillColor = rgba(18, 9, 7, 214);
  graphics.moveTo(-halfWidth + 10 * scale, 0);
  graphics.lineTo(-halfWidth + 30 * scale, halfHeight - 4 * scale);
  graphics.lineTo(halfWidth - 12 * scale, halfHeight - 4 * scale);
  graphics.lineTo(halfWidth - 4 * scale, 0);
  graphics.lineTo(halfWidth - 12 * scale, -halfHeight + 4 * scale);
  graphics.lineTo(-halfWidth + 30 * scale, -halfHeight + 4 * scale);
  graphics.close();
  graphics.fill();
  graphics.strokeColor = rgba(230, 180, 88, 232);
  graphics.lineWidth = Math.max(2, 2.2 * scale);
  graphics.stroke();
  graphics.strokeColor = rgba(255, 226, 144, 250);
  graphics.lineWidth = Math.max(2, 2.5 * scale);
  graphics.moveTo(13 * scale, 14 * scale);
  graphics.lineTo(-16 * scale, 0);
  graphics.lineTo(13 * scale, -14 * scale);
  graphics.moveTo(-11 * scale, 0);
  graphics.lineTo(24 * scale, 0);
  graphics.stroke();
}
