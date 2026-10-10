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
  Sprite,
  UITransform,
  Vec3,
} from 'cc';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { PHONE_DIALOG_CONTENT_PAD, drawPhoneDialogFrame, resolvePhoneDialogSize } from './LobbyPhoneDialogFrame';
import type { PlayerMailVO } from '../../types/QuestTypes';
import { mountKitButton, mountKitSection } from '../UiKit';
import type { PlayerBattleRecentVO } from '../../types/BattleTypes';

export interface LobbyMorePanelHost {
  /** 最近战报里的关卡称呼(深渊爬塔第 N 层 / 限时副本),不露关卡代码。 */
  lobbyStageDisplayLabel?(stageCode: string): string;
  /** 打开用户协议/隐私政策(2026-09-25)。 */
  openLegalDocument?(key: 'terms' | 'privacy'): void;
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean, options?: { frameless?: boolean; placeholder?: string }): EditBox;
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

const TITLE_DIVIDER_LEFT_ASSET = 'ui/common/ai/title_divider_left/spriteFrame';
const TITLE_DIVIDER_RIGHT_ASSET = 'ui/common/ai/title_divider_right/spriteFrame';
const TITLE_DIVIDER_LEFT_ASPECT = 76 / 390;
const TITLE_DIVIDER_RIGHT_ASPECT = 73 / 392;

/**
 * "更多"面板(2026-09-06):低频系统入口收纳——邮件/设置/公告宫格 + 最近战报列表 +
 * 兑换码输入区 + 客服占位。邮件/设置从右上图标区迁入,右上只留一个"更多"钮(带未读红点)。
 */
export class LobbyMorePanelRenderer {
  private giftCodeInput: EditBox | null = null;

  constructor(private readonly host: LobbyMorePanelHost) {}

  render(layout: UiLayout): void {
    // 2026-10-10 全界面美化:电脑端也用全屏实景框版式(原电脑版是黑底上的小平框,背后一片空)
    if (isPhoneDesign() || layout.stageWidth >= 900) {
      this.renderPhone(layout);
      return;
    }
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
    const titleY = panelHeight / 2 - 34 * scale;
    const dividerInner = ('更多'.length * 26 * scale) / 2 + 10 * scale;
    const dividerWidth = Math.min(130 * scale, panelWidth / 2 - 70 * scale - dividerInner);
    if (dividerWidth >= 40 * scale) {
      const leftDivider = this.host.addSprite('TitleDividerL', TITLE_DIVIDER_LEFT_ASSET, -dividerInner - dividerWidth / 2, titleY, dividerWidth, dividerWidth * TITLE_DIVIDER_LEFT_ASPECT, panel);
      const rightDivider = this.host.addSprite('TitleDividerR', TITLE_DIVIDER_RIGHT_ASSET, dividerInner + dividerWidth / 2, titleY, dividerWidth, dividerWidth * TITLE_DIVIDER_RIGHT_ASPECT, panel);
      if (!leftDivider || !rightDivider) {
        leftDivider?.destroy();
        rightDivider?.destroy();
      }
    }
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
      const empty = this.host.addChildLabel(panel, 'BattleEmpty', '暂无战斗记录', -panelWidth / 2 + 42 * scale, cursor, 16 * scale, rgba(150, 134, 104, 200), new Size(panelWidth * 0.7, 22 * scale), HorizontalTextAlignment.LEFT);
      empty.overflow = Label.Overflow.SHRINK;
      cursor -= rowH;
    } else {
      for (const battle of battles) {
        const win = battle.result === 'WIN';
        const when = (battle.recordedTime ?? '').replace('T', ' ').slice(5, 16);
        const line = `${when}  ${this.host.lobbyStageDisplayLabel?.(battle.stageCode) ?? '主线关卡'}`;
        const row = this.host.addChildLabel(panel, `BattleRow_${battle.battleNo}`, line, -panelWidth / 2 + 42 * scale, cursor, 16 * scale, rgba(196, 178, 140, 225), new Size(panelWidth * 0.62, 22 * scale), HorizontalTextAlignment.LEFT);
        row.overflow = Label.Overflow.SHRINK;
        const verdict = this.host.addChildLabel(panel, `BattleVerdict_${battle.battleNo}`, win ? '胜利' : '失败', panelWidth / 2 - 60 * scale, cursor, 16 * scale, win ? rgba(150, 226, 130, 235) : rgba(240, 120, 100, 235), new Size(60 * scale, 22 * scale));
        verdict.overflow = Label.Overflow.SHRINK;
        cursor -= rowH;
      }
    }

    // ── 兑换码 ──
    const giftTop = cursor - 10 * scale;
    this.addSectionTitle(panel, 'gift', '兑换码', -panelWidth / 2 + 30 * scale, giftTop, panelWidth, scale);
    // 带金框后框体更高,与小标题拉开距离。
    const inputY = giftTop - 44 * scale;
    const inputWidth = Math.min(280 * scale, panelWidth * 0.5);
    const inputX = centerX - panelWidth / 2 + 42 * scale + inputWidth / 2;
    // EditBox 走内容根绝对坐标(工厂挂根节点)。
    // 带金框 + 创建时传占位文字(原来用无框版且事后设 placeholder,输入框在画面上是隐形的)。
    this.giftCodeInput = this.host.addFramedEditBox('', inputX, centerY + inputY, inputWidth, layout, false, { placeholder: '输入礼包码' });
    const btnW = 108 * scale;
    const btnH = 40 * scale;
    this.addGiftRedeemButton(panel, -panelWidth / 2 + 42 * scale + inputWidth + 18 * scale + btnW / 2, inputY, btnW, btnH, scale);

    // ── 协议链接 + 客服邮箱(2026-09-25:协议可点开全文;字号按口径 16) ──
    this.addFooterLinks(panel, -panelHeight / 2 + 28 * scale, 16 * scale, scale);
  }

  /**
   * 手机横屏全屏版(2026-10-02 用户「横屏模式下弹框都调整成全屏」):
   * 顶部标题带 + 右上 ×;左栏 = 邮件/设置/公告 三张大卡 + 兑换码,右栏 = 最近战报(行更高、可多列几条);底部协议链接。
   */
  private renderPhone(layout: UiLayout): void {
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const { width: panelWidth, height: panelHeight } = resolvePhoneDialogSize(layout);
    const headerH = 74;
    const pad = PHONE_DIALOG_CONTENT_PAD;
    this.giftCodeInput = null;

    this.mountDim(centerX, centerY, layout);
    const group = this.host.createUiNode('LobbyMoreSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(group, 'Frame', 0, 0, panelWidth, panelHeight);
    drawPhoneDialogFrame(this.host, panel, panelWidth, panelHeight, headerH);

    const titleY = panelHeight / 2 - 6 - headerH / 2;
    const title = this.host.addChildLabel(panel, 'Title', '更多', 0, titleY, 34, rgba(244, 220, 166, 255), new Size(260, 46));
    this.outline(title, 1, true);
    const dividerW = 150;
    const dividerInner = 34 + 22;
    this.host.addSprite('TitleDividerL', TITLE_DIVIDER_LEFT_ASSET, -dividerInner - dividerW / 2, titleY, dividerW, dividerW * TITLE_DIVIDER_LEFT_ASPECT, panel);
    this.host.addSprite('TitleDividerR', TITLE_DIVIDER_RIGHT_ASSET, dividerInner + dividerW / 2, titleY, dividerW, dividerW * TITLE_DIVIDER_RIGHT_ASPECT, panel);
    this.addCloseButton(panel, panelWidth / 2 - 46, titleY, 1.3);

    const bodyTop = panelHeight / 2 - 6 - headerH - 22;
    const footY = -panelHeight / 2 + 30;
    const bodyBottom = footY + 30;
    const colGap = 48;
    const leftL = -panelWidth / 2 + pad;
    const leftR = -colGap / 2;
    const rightL = colGap / 2;
    const rightR = panelWidth / 2 - pad;
    const leftW = leftR - leftL;
    const rightW = rightR - rightL;
    const leftCx = (leftL + leftR) / 2;
    // 两栏分隔细线
    const sep = this.host.addChildPlainNode(panel, 'ColumnSep', 0, (bodyTop + bodyBottom) / 2, 4, bodyTop - bodyBottom);
    const sg = sep.addComponent(Graphics);
    sg.strokeColor = rgba(150, 114, 62, 110);
    sg.lineWidth = 1.5;
    sg.moveTo(0, (bodyTop - bodyBottom) / 2);
    sg.lineTo(0, -(bodyTop - bodyBottom) / 2);
    sg.stroke();

    // ── 左栏:宫格(邮件 / 设置 / 公告)──
    const unread = this.host.currentLobbyMailState().mails.filter((mail) => !mail.read).length;
    const cards: Array<{ key: string; label: string; badge: number; onClick: () => void }> = [
      { key: 'mail', label: '邮件', badge: unread, onClick: () => this.host.openLobbyMailPanel?.() },
      { key: 'settings', label: '设置', badge: 0, onClick: () => this.host.openLobbySettingsPanel() },
      { key: 'notice', label: '公告', badge: 0, onClick: () => this.host.openLobbyNoticePanel() },
    ];
    const cardGap = 28;
    const cardW = Math.min(210, (leftW - cardGap * 2) / 3);
    const cardH = cardW * 0.94;
    const cardY = bodyTop - cardH / 2;
    cards.forEach((card, index) => {
      this.addGridCard(panel, card.key, card.label, card.badge, leftCx + (index - 1) * (cardW + cardGap), cardY, cardW, cardH, 1.3, card.onClick);
    });

    // ── 左栏:兑换码 ──
    const giftTop = cardY - cardH / 2 - 44;
    this.addSectionTitle(panel, 'gift', '兑换码', leftL, giftTop, panelWidth, 1.2, leftR);
    const inputY = giftTop - 62;
    const btnW = 190;
    const btnH = 60;
    const inputWidth = Math.min(420, leftW - btnW - 60);
    const inputX = leftL + 14 + inputWidth / 2;
    this.giftCodeInput = this.host.addFramedEditBox('', centerX + inputX, centerY + inputY, inputWidth, layout, false, { placeholder: '输入礼包码' });
    this.addGiftRedeemButton(panel, inputX + inputWidth / 2 + 14 + 24 + btnW / 2, inputY, btnW, btnH, 1.3);

    // ── 右栏:最近战报 ──
    this.addSectionTitle(panel, 'battle', '最近战报', rightL, bodyTop - 14, panelWidth, 1.2, rightR);
    const rowH = 46;
    const listTop = bodyTop - 14 - 44;
    const maxRows = Math.max(1, Math.floor((listTop - bodyBottom) / rowH));
    const battles = this.host.currentLobbyBattleState().recentBattles.slice(0, maxRows);
    if (battles.length === 0) {
      const empty = this.host.addChildLabel(panel, 'BattleEmpty', '暂无战斗记录', rightL + 12, listTop, 20, rgba(150, 134, 104, 200), new Size(rightW - 24, 30), HorizontalTextAlignment.LEFT);
      empty.overflow = Label.Overflow.SHRINK;
    }
    battles.forEach((battle, index) => {
      const y = listTop - index * rowH;
      const stripe = this.host.addChildPlainNode(panel, `BattleStripe_${index}`, (rightL + rightR) / 2, y, rightW, rowH - 6);
      const bg = stripe.addComponent(Graphics);
      bg.fillColor = index % 2 === 0 ? rgba(30, 24, 20, 170) : rgba(18, 15, 14, 140);
      bg.roundRect(-rightW / 2, -(rowH - 6) / 2, rightW, rowH - 6, 6);
      bg.fill();
      const win = battle.result === 'WIN';
      const when = (battle.recordedTime ?? '').replace('T', ' ').slice(5, 16);
      const line = `${when}  ${this.host.lobbyStageDisplayLabel?.(battle.stageCode) ?? '主线关卡'}`;
      const row = this.host.addChildLabel(panel, `BattleRow_${battle.battleNo}`, line, rightL + 16, y, 20, rgba(196, 178, 140, 225), new Size(rightW - 120, 30), HorizontalTextAlignment.LEFT);
      row.overflow = Label.Overflow.SHRINK;
      const verdict = this.host.addChildLabel(panel, `BattleVerdict_${battle.battleNo}`, win ? '胜利' : '失败', rightR - 50, y, 20, win ? rgba(150, 226, 130, 235) : rgba(240, 120, 100, 235), new Size(80, 30));
      verdict.overflow = Label.Overflow.SHRINK;
    });

    this.addFooterLinks(panel, footY, 20, 1);
  }

  /** 兑换按钮(红底金边,兑换中置灰不可点)。 */
  private addGiftRedeemButton(panel: Node, x: number, y: number, btnW: number, btnH: number, scale: number): void {
    const redeeming = this.host.isLobbyGiftRedeeming();
    // 2026-10-10:红金主按钮切图(UiKit),兑换中置灰不可点
    mountKitButton(this.host, panel, 'GiftRedeemButton', redeeming ? '兑换中…' : '兑 换', x, y, btnW, btnH, scale / 1.3, redeeming ? 'disabled' : 'primary', () => {
      const code = (this.giftCodeInput?.string ?? '').trim();
      this.host.redeemLobbyGiftCode(code);
    }, 24);
  }

  /** 协议链接 + 客服邮箱(2026-09-25:协议可点开全文);中文按 1 字宽、ASCII 按半字宽估算,整行居中。 */
  private addFooterLinks(panel: Node, footY: number, linkFont: number, scale: number): void {
    const parts: Array<{ name: string; text: string; doc?: 'terms' | 'privacy' }> = [
      { name: 'TermsLink', text: '用户协议', doc: 'terms' },
      { name: 'FooterDot1', text: ' · ' },
      { name: 'PrivacyLink', text: '隐私政策', doc: 'privacy' },
      { name: 'FooterDot2', text: ' · ' },
      { name: 'SupportNote', text: '客服:support@lootchain.game' },
    ];
    const textWidth = (text: string): number => Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0xff ? 1 : 0.55), 0) * linkFont;
    const widths = parts.map((part) => textWidth(part.text));
    let footX = -widths.reduce((sum, width) => sum + width, 0) / 2;
    parts.forEach((part, index) => {
      const width = widths[index];
      const label = this.host.addChildLabel(panel, part.name, part.text, footX + width / 2, footY, linkFont, part.doc ? rgba(236, 192, 104, 240) : rgba(150, 134, 104, 220), new Size(width + 6 * scale, 24 * scale));
      label.overflow = Label.Overflow.SHRINK;
      if (part.doc) {
        const doc = part.doc;
        label.isUnderline = true;
        label.node.addComponent(Button);
        label.node.on(Button.EventType.CLICK, () => this.host.openLegalDocument?.(doc), this);
        this.host.applyImageButtonFeedback(label.node, 1.04, 0.96);
      }
      footX += width;
    });
  }

  private addGridCard(parent: Node, key: string, label: string, badge: number, x: number, y: number, width: number, height: number, scale: number, onClick: () => void): void {
    // 2026-10-10:宫格底换四角金饰框(UiKit 区块框,与设置 / 水晶同款)
    const card = mountKitSection(this.host, parent, `LobbyMoreCard_${key}`, x, y, width, height, scale, 0.16);
    const iconSize = width * 0.46;
    const iconY = height * 0.14;
    if (!this.host.addSprite(`LobbyMoreCardIcon_${key}`, MORE_ICON_ASSETS[key] ?? '', 0, iconY, iconSize, iconSize, card)) {
      const fallback: Record<string, string> = { mail: '✉', settings: '⚙', notice: '📜' };
      const glyph = this.host.addChildLabel(card, 'IconGlyph', fallback[key] ?? '•', 0, iconY, iconSize * 0.72, rgba(226, 186, 110, 235), new Size(iconSize, iconSize));
      glyph.overflow = Label.Overflow.SHRINK;
    }
    const text = this.host.addChildLabel(card, 'CardLabel', label, 0, -height * 0.3, 18 * scale, rgba(238, 210, 152, 245), new Size(width - 12 * scale, 24 * scale));
    text.overflow = Label.Overflow.SHRINK;
    this.outline(text, scale, false);
    if (badge > 0) {
      const badgeNode = this.host.addChildPlainNode(card, 'CardBadge', width / 2 - 12 * scale, height / 2 - 12 * scale, 24 * scale, 24 * scale);
      const bg = badgeNode.addComponent(Graphics);
      bg.fillColor = rgba(214, 54, 42, 245);
      bg.circle(0, 0, 11 * scale);
      bg.fill();
      const count = this.host.addChildLabel(badgeNode, 'Text', badge > 99 ? '99+' : String(badge), 0, 0, 13 * scale, rgba(255, 240, 230), new Size(24 * scale, 19 * scale));
      count.overflow = Label.Overflow.SHRINK;
    }
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(card, 1.04, 0.96);
  }

  private addSectionTitle(parent: Node, iconKey: string, text: string, leftX: number, y: number, panelWidth: number, scale: number, lineEndX = panelWidth / 2 - 30 * scale): void {
    const iconSize = 20 * scale;
    this.host.addSprite(`SectionIcon_${iconKey}`, MORE_ICON_ASSETS[iconKey] ?? '', leftX + iconSize / 2, y, iconSize, iconSize, parent);
    const label = this.host.addChildLabel(parent, `SectionTitle_${iconKey}`, text, leftX + iconSize + 8 * scale, y, 18 * scale, rgba(231, 205, 142, 245), new Size(160 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, false);
    const parentGraphics = parent.getComponent(Graphics) ?? parent.addComponent(Graphics);
    parentGraphics.strokeColor = rgba(150, 114, 62, 130);
    parentGraphics.lineWidth = Math.max(1, scale);
    parentGraphics.moveTo(leftX + iconSize + 8 * scale + 76 * scale, y);
    parentGraphics.lineTo(lineEndX, y);
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
