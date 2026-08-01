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
  UITransform,
  Vec3,
} from 'cc';
import { C1812_BUTTON_PRIMARY_ASSET, C1812_TITLE_BANNER_ASSET } from '../C1812CommonUiAssets';
import type { LobbyCodexItemVO, LobbyCodexPanelState } from '../../types/LobbyCodexTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';

export interface LobbyCodexPanelHost {
  node: Node;
  currentLobbyCodexState(): LobbyCodexPanelState;
  closeLobbyCodexPanel(): void;
  reloadLobbyCodex(): void;
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
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
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
}

/** 英雄图鉴只读预览面板。 */
export class LobbyCodexPanelRenderer {
  constructor(private readonly host: LobbyCodexPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyCodexState();
    const scale = Math.max(0.64, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(300 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.createUiNode('LobbyCodexDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    // 功能页采用场景式导航，遮罩只阻断底层输入，不再承担点击关闭语义。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyCodexSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    // 面板本体吞掉点击，避免内容区点击穿透到遮罩关闭面板。
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyCodexSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(6, 6, 9, 232),
      rgba(190, 141, 62, 226),
      18 * scale,
    );
    this.drawPanelAtmosphere(panel, panelWidth, panelHeight, scale);
    this.renderHeader(panel, panelWidth, panelHeight, scale, state);
    this.renderCodexBody(panel, panelWidth, panelHeight, scale, state);
    this.renderFooter(panel, panelWidth, panelHeight, scale);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyCodexBackButton', () => this.host.closeLobbyCodexPanel(), scale, '图鉴');
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private renderHeader(parent: Node, width: number, height: number, scale: number, state: LobbyCodexPanelState): void {
    // 中央标题移除:页面标题统一由左上返回组件的横幅承担。

    const statusText = state.loading ? '正在读取只读图鉴...' : state.error ? '服务端图鉴暂不可用，已显示空状态' : state.loaded ? '只读英雄图鉴' : '等待图鉴数据';
    const status = this.host.addChildLabel(
      parent,
      'LobbyCodexStatus',
      statusText,
      0,
      height / 2 - 76 * scale, 19 * scale,
      rgba(198, 164, 91),
      new Size(width - 104 * scale, 27 * scale),
    );
    status.overflow = Label.Overflow.SHRINK;
    this.applyOutline(status, scale, false);

    const ownedCount = state.items.filter((item) => item.owned).length;
    this.addCodexChip(parent, 'LobbyCodexChipTotal', `收录 ${state.items.length}`, -132 * scale, height / 2 - 108 * scale, 122 * scale, scale);
    this.addCodexChip(parent, 'LobbyCodexChipOwned', `已拥有 ${ownedCount}`, 0, height / 2 - 108 * scale, 122 * scale, scale);
    this.addCodexChip(parent, 'LobbyCodexChipReadonly', '只读预览', 132 * scale, height / 2 - 108 * scale, 122 * scale, scale);
  }

  private addCodexChip(parent: Node, name: string, text: string, x: number, y: number, width: number, scale: number): void {
    const chip = this.host.addChildPlainNode(parent, name, x, y, width, 25 * scale);
    const graphics = chip.addComponent(Graphics);
    graphics.fillColor = rgba(12, 10, 10, 180);
    graphics.rect(-width / 2, -12.5 * scale, width, 25 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(157, 118, 60, 160);
    graphics.stroke();
    const label = this.host.addChildLabel(chip, `${name}Label`, text, 0, 0, 16 * scale, rgba(224, 190, 118), new Size(width - 10 * scale, 23 * scale));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderCodexBody(parent: Node, width: number, height: number, scale: number, state: LobbyCodexPanelState): void {
    const bodyTop = height / 2 - 134 * scale;
    const bodyBottom = -height / 2 + 82 * scale;
    const bodyHeight = Math.max(130 * scale, bodyTop - bodyBottom);
    if (state.loading && state.items.length === 0) {
      this.renderEmpty(parent, width, bodyHeight, scale, '图鉴读取中，请稍候。');
      return;
    }
    if (state.items.length === 0) {
      this.renderEmpty(parent, width, bodyHeight, scale, '当前暂无可展示的英雄图鉴。');
      return;
    }

    const columns = width >= 700 * scale ? 4 : width >= 520 * scale ? 3 : 2;
    const gap = 10 * scale;
    const cardWidth = Math.min(176 * scale, (width - 86 * scale - gap * (columns - 1)) / columns);
    const cardHeight = Math.min(92 * scale, Math.max(78 * scale, cardWidth * 0.54));
    const rows = Math.max(1, Math.min(Math.floor((bodyHeight + gap) / (cardHeight + gap)), Math.ceil(state.items.length / columns)));
    const maxItems = Math.min(state.items.length, columns * rows);
    const gridWidth = cardWidth * columns + gap * (columns - 1);
    const startX = -gridWidth / 2 + cardWidth / 2;
    const startY = bodyTop - cardHeight / 2;

    for (let index = 0; index < maxItems; index += 1) {
      const item = state.items[index];
      if (!item) {
        continue;
      }
      const column = index % columns;
      const row = Math.floor(index / columns);
      this.renderCodexCard(parent, item, index, startX + column * (cardWidth + gap), startY - row * (cardHeight + gap), cardWidth, cardHeight, scale);
    }
  }

  private renderEmpty(parent: Node, width: number, bodyHeight: number, scale: number, text: string): void {
    const box = this.host.addChildPlainNode(parent, 'LobbyCodexEmptyBox', 0, -12 * scale, width - 96 * scale, Math.min(150 * scale, bodyHeight));
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(9, 9, 12, 160);
    graphics.rect(-(width - 96 * scale) / 2, -60 * scale, width - 96 * scale, 120 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 118);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyCodexEmptyText', text, 0, 0, 20 * scale, rgba(213, 193, 151), new Size(width - 128 * scale, 48 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private renderCodexCard(parent: Node, item: LobbyCodexItemVO, index: number, x: number, y: number, width: number, height: number, scale: number): void {
    const card = this.host.addChildPlainNode(parent, `LobbyCodexCard_${index}`, x, y, width, height);
    const graphics = card.addComponent(Graphics);
    this.drawCodexCard(graphics, width, height, scale, item);

    const rarity = this.host.addChildLabel(card, 'LobbyCodexRarity', safeText(item.rarity || 'R'), -width / 2 + 25 * scale, height / 2 - 18 * scale, 17 * scale, this.rarityColor(item.rarity), new Size(46 * scale, 22 * scale));
    rarity.overflow = Label.Overflow.SHRINK;
    this.applyOutline(rarity, scale, true);

    const name = this.host.addChildLabel(card, 'LobbyCodexHeroName', safeText(item.heroName), -width / 2 + 55 * scale, height / 2 - 18 * scale, 20 * scale, rgba(244, 219, 163), new Size(width - 68 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);

    const metaText = `${safeText(item.faction)} / ${safeText(item.heroClass)}`;
    const meta = this.host.addChildLabel(card, 'LobbyCodexMeta', metaText, -width / 2 + 16 * scale, 4 * scale, 16 * scale, rgba(182, 166, 131), new Size(width - 32 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
    meta.overflow = Label.Overflow.SHRINK;

    const role = this.host.addChildLabel(card, 'LobbyCodexRole', safeText(item.roleDesc || '定位待补充'), -width / 2 + 16 * scale, -17 * scale, 15 * scale, rgba(144, 132, 105), new Size(width - 32 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
    role.overflow = Label.Overflow.SHRINK;

    const ownedText = item.owned ? `已拥有 x${Math.max(1, item.ownedCount)}` : '未收集';
    const owned = this.host.addChildLabel(card, 'LobbyCodexOwnedState', ownedText, width / 2 - 54 * scale, -height / 2 + 15 * scale, 15 * scale, item.owned ? rgba(124, 220, 151) : rgba(151, 127, 96), new Size(96 * scale, 20 * scale), HorizontalTextAlignment.RIGHT);
    owned.overflow = Label.Overflow.SHRINK;
  }

  private drawCodexCard(graphics: Graphics, width: number, height: number, scale: number, item: LobbyCodexItemVO): void {
    const ownedAlpha = item.owned ? 190 : 138;
    graphics.fillColor = rgba(9, 9, 12, ownedAlpha);
    graphics.moveTo(-width / 2 + 10 * scale, height / 2);
    graphics.lineTo(width / 2 - 10 * scale, height / 2);
    graphics.lineTo(width / 2, height / 2 - 10 * scale);
    graphics.lineTo(width / 2, -height / 2 + 10 * scale);
    graphics.lineTo(width / 2 - 10 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 10 * scale, -height / 2);
    graphics.lineTo(-width / 2, -height / 2 + 10 * scale);
    graphics.lineTo(-width / 2, height / 2 - 10 * scale);
    graphics.close();
    graphics.fill();
    graphics.fillColor = this.rarityFill(item.rarity);
    graphics.rect(-width / 2 + 6 * scale, -height / 2 + 6 * scale, 5 * scale, height - 12 * scale);
    graphics.fill();
    graphics.strokeColor = item.owned ? rgba(202, 158, 76, 162) : rgba(113, 91, 58, 128);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.stroke();
  }

  private renderFooter(parent: Node, width: number, height: number, scale: number): void {
    const note = this.host.addChildLabel(
      parent,
      'LobbyCodexBoundaryNote',
      '当前面板只读取图鉴基础信息，不提供升级、升星、获取或资源变更入口。',
      0,
      -height / 2 + 62 * scale, 17 * scale,
      rgba(167, 146, 105),
      new Size(width - 110 * scale, 24 * scale),
    );
    note.overflow = Label.Overflow.SHRINK;

    const reload = this.addFooterButton(parent, 'LobbyCodexReloadButton', '刷新', 0, -height / 2 + 30 * scale, 112 * scale, 36 * scale, scale);
    reload.on(Button.EventType.CLICK, () => this.host.reloadLobbyCodex(), this);
  }

  private addFooterButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number): Node {
    const button = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const art = this.host.addSprite(`${name}Art`, C1812_BUTTON_PRIMARY_ASSET, 0, 0, width, height, button);
    if (!art) {
      const graphics = button.addComponent(Graphics);
      graphics.fillColor = rgba(22, 18, 17, 222);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.fill();
      graphics.strokeColor = rgba(184, 138, 62, 210);
      graphics.stroke();
    }
    button.addComponent(Button);
    this.host.applyImageButtonFeedback(button, 1.025, 0.97);
    const label = this.host.addChildLabel(button, `${name}Label`, text, 0, 0, 20 * scale, art ? rgba(255, 240, 200) : rgba(242, 207, 122), new Size(width, height));
    label.overflow = Label.Overflow.SHRINK;
    if (!art) {
      this.applyOutline(label, scale, false);
    }
    return button;
  }

  private drawPanelAtmosphere(panel: Node, width: number, height: number, scale: number): void {
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(117, 12, 20, 24);
    graphics.rect(-width * 0.42, -height * 0.28, width * 0.34, height * 0.56);
    graphics.fill();
    graphics.strokeColor = rgba(229, 181, 92, 64);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(-width / 2 + 36 * scale, height / 2 - 122 * scale);
    graphics.lineTo(width / 2 - 36 * scale, height / 2 - 122 * scale);
    graphics.moveTo(-width / 2 + 38 * scale, -height / 2 + 74 * scale);
    graphics.lineTo(width / 2 - 38 * scale, -height / 2 + 74 * scale);
    graphics.stroke();
  }

  private rarityColor(rarity: string): Color {
    const key = rarity.toUpperCase();
    if (key === 'UR') {
      return rgba(255, 84, 48);
    }
    if (key === 'SSR') {
      return rgba(255, 168, 54);
    }
    if (key === 'SR') {
      return rgba(200, 111, 255);
    }
    if (key === 'R') {
      return rgba(93, 151, 255);
    }
    if (key === 'SSS') {
      return rgba(255, 188, 103);
    }
    if (key === 'SS') {
      return rgba(214, 148, 255);
    }
    if (key === 'S') {
      return rgba(111, 180, 255);
    }
    if (key === 'A') {
      return rgba(129, 222, 154);
    }
    return rgba(195, 178, 138);
  }

  private rarityFill(rarity: string): Color {
    const base = this.rarityColor(rarity);
    return new Color(base.r, base.g, base.b, 164);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 220 : 180);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}
