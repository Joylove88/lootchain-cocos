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
import { isPhoneDesign } from '../../app/ScreenAdapter';
import type { LobbyNoticePanelState, LobbyNoticeVO } from '../../types/LobbyNoticeTypes';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';

export interface LobbyNoticePanelHost {
  node: Node;
  currentLobbyNoticeState(): LobbyNoticePanelState;
  closeLobbyNoticePanel(): void;
  reloadLobbyNotices(): void;
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
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
}

/** 公告/活动只读详情面板。 */
export class LobbyNoticePanelRenderer {
  constructor(private readonly host: LobbyNoticePanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyNoticeState();
    const scale = Math.max(0.68, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(300 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.createUiNode('LobbyNoticeDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    // 功能页采用场景式导航，遮罩只阻断底层输入，不再承担点击关闭语义。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyNoticeSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    // 面板本体阻挡输入事件，避免点击内容区时穿透到遮罩导致弹框关闭。
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyNoticeSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(6, 6, 8, 232),
      rgba(190, 141, 62, 226),
      18 * scale,
    );
    this.drawPanelAtmosphere(panel, panelWidth, panelHeight, scale);
    this.renderHeader(panel, panelWidth, panelHeight, scale, state);
    this.renderNoticeBody(panel, panelWidth, panelHeight, scale, state);
    this.renderFooter(panel, panelWidth, panelHeight, scale);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyNoticeBackButton', () => this.host.closeLobbyNoticePanel(), scale, '公告');
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private renderHeader(parent: Node, width: number, height: number, scale: number, state: LobbyNoticePanelState): void {
    // 中央标题移除:页面标题统一由左上返回组件的横幅承担。

    const statusText = state.loading ? '正在读取公告...' : state.error ? '公告读取失败,请稍后重试' : state.loaded ? '最新公告' : '正在读取公告...';
    const status = this.host.addChildLabel(
      parent,
      'LobbyNoticeStatus',
      statusText,
      0,
      height / 2 - 78 * scale, 19 * scale,
      rgba(198, 164, 91),
      new Size(width - 104 * scale, 28 * scale),
    );
    status.overflow = Label.Overflow.SHRINK;
    this.applyOutline(status, scale, false);
  }

  private renderNoticeBody(parent: Node, width: number, height: number, scale: number, state: LobbyNoticePanelState): void {
    const phone = isPhoneDesign();
    const bodyTop = height / 2 - 112 * scale;
    const bodyBottom = phone ? -height / 2 + 112 : -height / 2 + 82 * scale;
    const bodyHeight = Math.max(120 * scale, bodyTop - bodyBottom);
    const rowGap = 10 * scale;
    const notices = state.notices;
    if (state.loading && notices.length === 0) {
      this.renderEmpty(parent, width, bodyHeight, scale, '公告读取中，请稍候。');
      return;
    }
    if (!state.loading && notices.length === 0) {
      this.renderEmpty(parent, width, bodyHeight, scale, '服务端暂无可展示公告。');
      return;
    }

    if (phone) {
      this.renderNoticeListPhone(parent, notices, width, bodyTop, bodyHeight, scale);
      return;
    }
    const maxRows = Math.max(1, Math.min(notices.length, Math.floor((bodyHeight + rowGap) / (84 * scale + rowGap))));
    const rowHeight = Math.min(96 * scale, (bodyHeight - rowGap * Math.max(0, maxRows - 1)) / maxRows);
    let y = bodyTop - rowHeight / 2;
    for (let index = 0; index < maxRows; index += 1) {
      const notice = notices[index];
      if (!notice) {
        continue;
      }
      this.renderNoticeRow(parent, notice, index, 0, y, width - 86 * scale, rowHeight, scale);
      y -= rowHeight + rowGap;
    }
  }

  /**
   * 手机横屏(2026-10-02):设计高只有 720,装不下几条公告——改成 Mask + ScrollView 可上下滑动,全部公告都能看到;
   * 行加高放下 20 号正文两行,发布时间挪到标题行右侧,不再压正文。
   */
  private renderNoticeListPhone(parent: Node, notices: LobbyNoticeVO[], width: number, bodyTop: number, bodyHeight: number, scale: number): void {
    const rowW = width - 86 * scale;
    const rowH = 112;
    const rowGap = 10;
    const listNode = this.host.addChildPlainNode(parent, 'LobbyNoticeList', 0, bodyTop - bodyHeight / 2, rowW + 8, bodyHeight);
    listNode.addComponent(Mask);
    const contentHeight = Math.max(bodyHeight, notices.length * (rowH + rowGap));
    const contentNode = this.host.addChildPlainNode(listNode, 'LobbyNoticeListContent', 0, 0, rowW + 8, contentHeight);
    contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
    contentNode.setPosition(0, bodyHeight / 2, 0);
    const scroll = listNode.addComponent(ScrollView);
    scroll.content = contentNode;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    notices.forEach((notice, index) => {
      this.renderNoticeRow(contentNode, notice, index, 0, -rowH / 2 - index * (rowH + rowGap), rowW, rowH, scale);
    });
  }

  private renderEmpty(parent: Node, width: number, bodyHeight: number, scale: number, text: string): void {
    const box = this.host.addChildPlainNode(parent, 'LobbyNoticeEmptyBox', 0, -12 * scale, width - 96 * scale, Math.min(150 * scale, bodyHeight));
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(9, 9, 12, 160);
    graphics.rect(-(width - 96 * scale) / 2, -60 * scale, width - 96 * scale, 120 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 118);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyNoticeEmptyText', text, 0, 0, 20 * scale, rgba(213, 193, 151), new Size(width - 128 * scale, 48 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private renderNoticeRow(parent: Node, notice: LobbyNoticeVO, index: number, x: number, y: number, width: number, height: number, scale: number): void {
    const phone = isPhoneDesign();
    const row = this.host.addChildPlainNode(parent, `LobbyNoticeRow_${index}`, x, y, width, height);
    const graphics = row.addComponent(Graphics);
    this.traceRow(graphics, width, height, scale, index);

    const badgeWidth = 74 * scale;
    const badge = this.host.addChildPlainNode(row, 'LobbyNoticeTypeBadge', -width / 2 + badgeWidth / 2 + 14 * scale, height / 2 - 25 * scale, badgeWidth, 25 * scale);
    const badgeGraphics = badge.addComponent(Graphics);
    badgeGraphics.fillColor = rgba(74, 19, 23, 190);
    badgeGraphics.rect(-badgeWidth / 2, -12.5 * scale, badgeWidth, 25 * scale);
    badgeGraphics.fill();
    badgeGraphics.strokeColor = rgba(196, 139, 67, 160);
    badgeGraphics.stroke();
    const type = this.host.addChildLabel(badge, 'LobbyNoticeType', this.compactType(notice.noticeType), 0, 0, 16 * scale, rgba(246, 211, 139), new Size(badgeWidth - 8 * scale, 24 * scale));
    type.overflow = Label.Overflow.SHRINK;

    const title = this.host.addChildLabel(
      row,
      'LobbyNoticeRowTitle',
      notice.title,
      -width / 2 + 104 * scale,
      height / 2 - 24 * scale,
      22 * scale,
      rgba(247, 220, 164),
      new Size(width - 136 * scale - (phone ? 260 : 0), 30 * scale),
      HorizontalTextAlignment.LEFT,
    );
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);

    const content = this.host.addChildLabel(
      row,
      'LobbyNoticeRowContent',
      notice.content,
      -width / 2 + 20 * scale,
      -12 * scale, 18 * scale,
      rgba(205, 190, 153),
      new Size(width - 38 * scale, Math.max(34 * scale, height - 44 * scale)),
      HorizontalTextAlignment.LEFT,
    );
    // 手机端正文被工厂抬到 20 号,行高跟着实际字号走,否则两行压字。
    content.lineHeight = phone ? Math.max(21 * scale, content.fontSize + 6) : 21 * scale;
    content.overflow = Label.Overflow.SHRINK;

    const timeText = notice.publishTime ? `发布 ${notice.publishTime.slice(0, 16).replace('T', ' ')}` : '本地只读展示';
    // 手机端发布时间挪到标题行右侧(原来贴在正文下沿,正文一长就与它重叠)。
    const time = phone
      ? this.host.addChildLabel(row, 'LobbyNoticePublishTime', timeText, width / 2 - 24, height / 2 - 24 * scale, 18, rgba(161, 139, 98), new Size(240, 26), HorizontalTextAlignment.RIGHT)
      : this.host.addChildLabel(row, 'LobbyNoticePublishTime', timeText, width / 2 - 114 * scale, -height / 2 + 17 * scale, 16 * scale, rgba(161, 139, 98), new Size(210 * scale, 22 * scale), HorizontalTextAlignment.RIGHT);
    time.overflow = Label.Overflow.SHRINK;
  }

  private renderFooter(parent: Node, width: number, height: number, scale: number): void {
    // 手机端说明与刷新钮各自拉开(原来挤在底边 60 像素内),刷新钮加大好点。
    const phone = isPhoneDesign();
    const note = this.host.addChildLabel(
      parent,
      'LobbyNoticeBoundaryNote',
      '当前面板只读取公告信息，不进入玩法，不改变玩家资源。',
      0,
      phone ? -height / 2 + 92 : -height / 2 + 62 * scale, 17 * scale,
      rgba(167, 146, 105),
      new Size(width - 110 * scale, 24 * scale),
    );
    note.overflow = Label.Overflow.SHRINK;

    const reload = phone
      ? this.addFooterButton(parent, 'LobbyNoticeReloadButton', '刷新', 0, -height / 2 + 38, 150, 46, scale)
      : this.addFooterButton(parent, 'LobbyNoticeReloadButton', '刷新', 0, -height / 2 + 30 * scale, 112 * scale, 36 * scale, scale);
    reload.on(Button.EventType.CLICK, () => this.host.reloadLobbyNotices(), this);
  }

  private addFooterButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number): Node {
    const button = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const graphics = button.addComponent(Graphics);
    graphics.fillColor = rgba(22, 18, 17, 222);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(184, 138, 62, 210);
    graphics.stroke();
    button.addComponent(Button);
    this.host.applyImageButtonFeedback(button, 1.025, 0.97);
    const label = this.host.addChildLabel(button, `${name}Label`, text, 0, 0, 20 * scale, rgba(242, 207, 122), new Size(width, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
    return button;
  }

  private drawPanelAtmosphere(panel: Node, width: number, height: number, scale: number): void {
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(118, 10, 18, 24);
    graphics.rect(width * 0.1, -height * 0.3, width * 0.36, height * 0.6);
    graphics.fill();
    graphics.strokeColor = rgba(229, 181, 92, 64);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(-width / 2 + 36 * scale, height / 2 - 92 * scale);
    graphics.lineTo(width / 2 - 36 * scale, height / 2 - 92 * scale);
    graphics.moveTo(-width / 2 + 38 * scale, -height / 2 + 74 * scale);
    graphics.lineTo(width / 2 - 38 * scale, -height / 2 + 74 * scale);
    graphics.stroke();
  }

  private traceRow(graphics: Graphics, width: number, height: number, scale: number, index: number): void {
    graphics.fillColor = index % 2 === 0 ? rgba(10, 10, 13, 174) : rgba(18, 15, 13, 166);
    graphics.moveTo(-width / 2 + 14 * scale, height / 2);
    graphics.lineTo(width / 2 - 14 * scale, height / 2);
    graphics.lineTo(width / 2, height / 2 - 13 * scale);
    graphics.lineTo(width / 2, -height / 2 + 13 * scale);
    graphics.lineTo(width / 2 - 14 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 14 * scale, -height / 2);
    graphics.lineTo(-width / 2, -height / 2 + 13 * scale);
    graphics.lineTo(-width / 2, height / 2 - 13 * scale);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(135, 101, 54, 125);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.stroke();
  }

  private compactType(type: string): string {
    if (!type) {
      return '公告';
    }
    return type.slice(0, 6);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 220 : 180);
    label.outlineWidth = Math.max(1, (strong ? 1.2 : 0.9) * scale);
  }
}
