import {
  BlockInputEvents,
  Button,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  UITransform,
  Vec3,
} from 'cc';
import { rgba, type UiLayout } from './LobbyHudTypes';
import type { PlayerMailVO } from '../../types/QuestTypes';
import type { PlayerBattleRecentVO } from '../../types/BattleTypes';

export interface LobbyMorePanelHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Node | null;
  addEditBox(initialText: string, x: number, y: number, width: number, layout?: UiLayout, password?: boolean): EditBox;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  closeLobbyMorePanel(): void;
  openLobbyMailPanel?(): void;
  openLobbySettingsPanel(): void;
  openLobbyNoticePanel(): void;
  redeemLobbyGiftCode(code: string): void;
  currentLobbyMailState(): { mails: PlayerMailVO[] };
  currentLobbyBattleState(): { recentBattles: PlayerBattleRecentVO[] };
  isLobbyGiftRedeeming(): boolean;
}

/** "更多"面板宫格项图标(image2,2026-09-06);缺图程序绘制字符兜底。 */
const MORE_ICON_ASSETS: Record<string, string> = {
  mail: 'ui/lobby/more/micon_mail/spriteFrame',
  settings: 'ui/lobby/more/micon_settings/spriteFrame',
  notice: 'ui/lobby/more/micon_notice/spriteFrame',
  battle: 'ui/lobby/more/micon_battle_log/spriteFrame',
  gift: 'ui/lobby/more/micon_gift_code/spriteFrame',
  support: 'ui/lobby/more/micon_support/spriteFrame',
};

/**
 * "更多"面板(2026-09-06):低频系统入口收纳——邮件/设置/公告宫格 + 最近战报列表 +
 * 兑换码输入区 + 客服占位。邮件/设置从右上图标区迁入,右上只留一个"更多"钮(带未读红点)。
 */
export class LobbyMorePanelRenderer {
  private giftCodeInput: EditBox | null = null;

  constructor(private readonly host: LobbyMorePanelHost) {}

  render(layout: UiLayout): void {
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelWidth = Math.min(layout.stageWidth - 44 * scale, 680 * scale);
    const panelHeight = Math.min(layout.stageHeight - 60 * scale, 600 * scale);
    this.giftCodeInput = null;

    this.mountDim(centerX, centerY, layout);
    const group = this.host.createUiNode('LobbyMoreSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(group, 'Frame', 0, 0, panelWidth, panelHeight, rgba(7, 7, 10, 240), rgba(192, 145, 66, 226), 18 * scale);

    const title = this.host.addChildLabel(panel, 'Title', '更多', 0, panelHeight / 2 - 34 * scale, 26 * scale, rgba(244, 220, 166, 255), new Size(panelWidth - 120 * scale, 34 * scale));
    this.outline(title, scale, true);
    this.addCloseButton(panel, panelWidth / 2 - 34 * scale, panelHeight / 2 - 34 * scale, scale);

    // ── 宫格:邮件(未读角标)/ 设置 / 公告 ──
    const unread = this.host.currentLobbyMailState().mails.filter((mail) => !mail.read).length;
    const cards: Array<{ key: string; label: string; badge: number; onClick: () => void }> = [
      { key: 'mail', label: '邮件', badge: unread, onClick: () => this.host.openLobbyMailPanel?.() },
      { key: 'settings', label: '设置', badge: 0, onClick: () => this.host.openLobbySettingsPanel() },
      { key: 'notice', label: '公告', badge: 0, onClick: () => this.host.openLobbyNoticePanel() },
    ];
    const cardW = Math.min(150 * scale, (panelWidth - 80 * scale) / 3);
    const cardH = cardW * 0.94;
    const cardGap = 24 * scale;
    const cardY = panelHeight / 2 - 80 * scale - cardH / 2;
    cards.forEach((card, index) => {
      const cx = (index - 1) * (cardW + cardGap);
      this.addGridCard(panel, card.key, card.label, card.badge, cx, cardY, cardW, cardH, scale, card.onClick);
    });

    // ── 最近战报 ──
    const battleTop = cardY - cardH / 2 - 26 * scale;
    this.addSectionTitle(panel, 'battle', '最近战报', -panelWidth / 2 + 30 * scale, battleTop, panelWidth, scale);
    const battles = this.host.currentLobbyBattleState().recentBattles.slice(0, 4);
    const rowH = 26 * scale;
    let cursor = battleTop - 24 * scale;
    if (battles.length === 0) {
      const empty = this.host.addChildLabel(panel, 'BattleEmpty', '暂无战斗记录', -panelWidth / 2 + 42 * scale, cursor, 13.5 * scale, rgba(150, 134, 104, 200), new Size(panelWidth * 0.7, 18 * scale), HorizontalTextAlignment.LEFT);
      empty.overflow = Label.Overflow.SHRINK;
      cursor -= rowH;
    } else {
      for (const battle of battles) {
        const win = battle.result === 'WIN';
        const when = (battle.recordedTime ?? '').replace('T', ' ').slice(5, 16);
        const line = `${when}  ${battle.stageCode}`;
        const row = this.host.addChildLabel(panel, `BattleRow_${battle.battleNo}`, line, -panelWidth / 2 + 42 * scale, cursor, 13.5 * scale, rgba(196, 178, 140, 225), new Size(panelWidth * 0.62, 18 * scale), HorizontalTextAlignment.LEFT);
        row.overflow = Label.Overflow.SHRINK;
        const verdict = this.host.addChildLabel(panel, `BattleVerdict_${battle.battleNo}`, win ? '胜利' : '失败', panelWidth / 2 - 60 * scale, cursor, 13.5 * scale, win ? rgba(150, 226, 130, 235) : rgba(240, 120, 100, 235), new Size(60 * scale, 18 * scale));
        verdict.overflow = Label.Overflow.SHRINK;
        cursor -= rowH;
      }
    }

    // ── 兑换码 ──
    const giftTop = cursor - 10 * scale;
    this.addSectionTitle(panel, 'gift', '兑换码', -panelWidth / 2 + 30 * scale, giftTop, panelWidth, scale);
    const inputY = giftTop - 34 * scale;
    const inputWidth = Math.min(280 * scale, panelWidth * 0.5);
    const inputX = centerX - panelWidth / 2 + 42 * scale + inputWidth / 2;
    // EditBox 走内容根绝对坐标(工厂挂根节点)。
    this.giftCodeInput = this.host.addEditBox('', inputX, centerY + inputY, inputWidth, layout);
    this.giftCodeInput.placeholder = '输入礼包码';
    const redeeming = this.host.isLobbyGiftRedeeming();
    const btnW = 108 * scale;
    const btnH = 40 * scale;
    const btn = this.host.addChildPlainNode(panel, 'GiftRedeemButton', -panelWidth / 2 + 42 * scale + inputWidth + 18 * scale + btnW / 2, inputY, btnW, btnH);
    const bg = btn.addComponent(Graphics);
    bg.fillColor = redeeming ? rgba(50, 40, 32, 220) : rgba(122, 32, 24, 240);
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 8 * scale);
    bg.fill();
    bg.strokeColor = redeeming ? rgba(130, 108, 70, 160) : rgba(242, 190, 98, 235);
    bg.lineWidth = Math.max(1, 1.4 * scale);
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 8 * scale);
    bg.stroke();
    const btnText = this.host.addChildLabel(btn, 'Text', redeeming ? '兑换中…' : '兑 换', 0, 0, 16 * scale, rgba(255, 230, 168), new Size(btnW - 10 * scale, btnH));
    btnText.overflow = Label.Overflow.SHRINK;
    if (!redeeming) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => {
        const code = (this.giftCodeInput?.string ?? '').trim();
        this.host.redeemLobbyGiftCode(code);
      }, this);
      this.host.applyImageButtonFeedback(btn, 1.04, 0.96);
    }

    // ── 客服占位 ──
    const support = this.host.addChildLabel(panel, 'SupportNote', '客服与反馈:support@lootchain.game(上线后接入工单)', 0, -panelHeight / 2 + 26 * scale, 12.5 * scale, rgba(140, 124, 96, 200), new Size(panelWidth - 60 * scale, 18 * scale));
    support.overflow = Label.Overflow.SHRINK;
  }

  private addGridCard(parent: Node, key: string, label: string, badge: number, x: number, y: number, width: number, height: number, scale: number, onClick: () => void): void {
    const card = this.host.addChildPlainNode(parent, `LobbyMoreCard_${key}`, x, y, width, height);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(20, 18, 22, 210);
    g.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
    g.fill();
    g.strokeColor = rgba(150, 114, 62, 190);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
    g.stroke();
    const iconSize = width * 0.46;
    const iconY = height * 0.14;
    if (!this.host.addSprite(`LobbyMoreCardIcon_${key}`, MORE_ICON_ASSETS[key] ?? '', 0, iconY, iconSize, iconSize, card)) {
      const fallback: Record<string, string> = { mail: '✉', settings: '⚙', notice: '📜' };
      const glyph = this.host.addChildLabel(card, 'IconGlyph', fallback[key] ?? '•', 0, iconY, iconSize * 0.72, rgba(226, 186, 110, 235), new Size(iconSize, iconSize));
      glyph.overflow = Label.Overflow.SHRINK;
    }
    const text = this.host.addChildLabel(card, 'CardLabel', label, 0, -height * 0.3, 16 * scale, rgba(238, 210, 152, 245), new Size(width - 12 * scale, 20 * scale));
    text.overflow = Label.Overflow.SHRINK;
    this.outline(text, scale, false);
    if (badge > 0) {
      const badgeNode = this.host.addChildPlainNode(card, 'CardBadge', width / 2 - 12 * scale, height / 2 - 12 * scale, 24 * scale, 24 * scale);
      const bg = badgeNode.addComponent(Graphics);
      bg.fillColor = rgba(214, 54, 42, 245);
      bg.circle(0, 0, 11 * scale);
      bg.fill();
      const count = this.host.addChildLabel(badgeNode, 'Text', badge > 99 ? '99+' : String(badge), 0, 0, 12 * scale, rgba(255, 240, 230), new Size(24 * scale, 16 * scale));
      count.overflow = Label.Overflow.SHRINK;
    }
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(card, 1.04, 0.96);
  }

  private addSectionTitle(parent: Node, iconKey: string, text: string, leftX: number, y: number, panelWidth: number, scale: number): void {
    const iconSize = 20 * scale;
    this.host.addSprite(`SectionIcon_${iconKey}`, MORE_ICON_ASSETS[iconKey] ?? '', leftX + iconSize / 2, y, iconSize, iconSize, parent);
    const label = this.host.addChildLabel(parent, `SectionTitle_${iconKey}`, text, leftX + iconSize + 8 * scale, y, 16 * scale, rgba(231, 205, 142, 245), new Size(160 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, false);
    const parentGraphics = parent.getComponent(Graphics) ?? parent.addComponent(Graphics);
    parentGraphics.strokeColor = rgba(150, 114, 62, 130);
    parentGraphics.lineWidth = Math.max(1, scale);
    parentGraphics.moveTo(leftX + iconSize + 8 * scale + 76 * scale, y);
    parentGraphics.lineTo(panelWidth / 2 - 30 * scale, y);
    parentGraphics.stroke();
  }

  private mountDim(centerX: number, centerY: number, layout: UiLayout): void {
    const dim = this.host.createUiNode('LobbyMoreDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const g = dim.addComponent(Graphics);
    g.fillColor = rgba(0, 0, 0, 132);
    g.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    g.fill();
    dim.addComponent(BlockInputEvents);
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, () => this.host.closeLobbyMorePanel(), this);
  }

  private addCloseButton(parent: Node, x: number, y: number, scale: number): void {
    const btn = this.host.addChildPlainNode(parent, 'CloseBtn', x, y, 40 * scale, 40 * scale);
    const label = this.host.addChildLabel(btn, 'Text', '✕', 0, 0, 22 * scale, rgba(214, 190, 150, 240), new Size(40 * scale, 40 * scale));
    this.outline(label, scale, false);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, () => this.host.closeLobbyMorePanel(), this);
    this.host.applyImageButtonFeedback(btn, 1.1, 0.92);
  }

  private outline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 228 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}
