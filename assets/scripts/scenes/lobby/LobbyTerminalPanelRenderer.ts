import { BlockInputEvents, Button, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UITransform } from 'cc';
import { rgba, LOBBY_C1812_RESOURCE_ICON_ASSETS, type LobbyHudHost, type UiLayout } from './LobbyHudTypes';
import { REF_ORNATE_FRAME, mountRefSliced } from '../UiRefKit';
import { TERMINAL_ASSETS, TERMINAL_TILE_ICONS as TILE_ICONS, TOWN_HUD_PROTO, TOWN_HUD_ASSETS, mountRingBase, type TownProtoFrame } from './LobbyTownHudProto';
import { resolveHeroAvatarPath } from './HeroHeadCrop';

/** 终端是整页菜单:原型整体等比缩进舞台(u = min(高 / 841, 宽 / 1870))并居中,L / R / C 同一套坐标。 */
function terminalFrame(layout: UiLayout): TownProtoFrame {
  const u = Math.min(layout.stageHeight / TOWN_HUD_PROTO.h, layout.stageWidth / TOWN_HUD_PROTO.w);
  const cx = (layout.stageLeft + layout.stageRight) / 2;
  const cy = (layout.stageTop + layout.stageBottom) / 2;
  const X = (px: number): number => cx + (px - TOWN_HUD_PROTO.w / 2) * u;
  return { u, L: X, R: X, C: X, Y: (py) => cy - (py - TOWN_HUD_PROTO.h / 2) * u, S: (size) => size * u };
}

export type LobbyTerminalAction =
  | 'heroes' | 'formation' | 'bag' | 'forge' | 'gacha'
  | 'adventure' | 'daily' | 'crystal' | 'codex' | 'quest'
  | 'shop' | 'guild' | 'idle' | 'worldmap' | 'rank'
  | 'mail' | 'notice' | 'gift' | 'settings' | 'logout' | 'profile';

export interface LobbyTerminalPanelHost extends LobbyHudHost {
  closeLobbyTerminalPanel(): void;
  runLobbyTerminalAction(action: LobbyTerminalAction): void;
}


/**
 * 终端(docs/51 §2.1,原型 proto_terminal_v2,1870×841 像素 × u):主界面收起来的功能都在这里——
 * 左侧玩家名片(头像 / 名字 / 等级 / 阵容战力 / 经验 / 三种货币)、右侧 5×3 功能宫格、底栏退出登录 + 邮件 / 公告 / 兑换码 / 设置。
 * 是大厅上的全屏覆盖层(整页重绘后由 GameRoot 重挂),点格子先关终端再打开对应功能。
 */
export class LobbyTerminalPanelRenderer {
  static readonly NODE_NAME = 'LobbyTerminal';

  constructor(private readonly host: LobbyTerminalPanelHost) {}

  render(layout: UiLayout): void {
    const P = terminalFrame(layout);
    const root = this.host.createUiNode(LobbyTerminalPanelRenderer.NODE_NAME);
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    // 背景:虚化的夜城(原型终端背后是模糊城景),按 1870:841 铺满再压一层暗;缺图时纯暗底
    const cover = Math.max(layout.width / TOWN_HUD_PROTO.w, layout.height / TOWN_HUD_PROTO.h);
    const bg = this.host.addSprite('Bg', TERMINAL_ASSETS.background, 0, 0, TOWN_HUD_PROTO.w * cover, TOWN_HUD_PROTO.h * cover, root);
    const dim = this.host.addChildPlainNode(root, 'Dim', 0, 0, layout.width, layout.height).addComponent(Graphics);
    dim.fillColor = rgba(8, 7, 9, bg ? 120 : 232);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    this.renderHeader(root, layout, P);
    this.renderCard(root, P);
    this.renderGrid(root, P);
    this.renderBottom(root, layout, P);
  }

  private renderHeader(root: Node, layout: UiLayout, P: TownProtoFrame): void {
    const line = this.host.addChildPlainNode(root, 'HeaderLine', 0, P.Y(62), layout.width, P.S(4)).addComponent(Graphics);
    const x0 = P.L(150);
    const x1 = P.R(1700);
    line.fillColor = rgba(170, 130, 70, 150);
    line.rect(x0, -P.S(1), x1 - x0, Math.max(1, P.S(1.5)));
    line.fill();
    const glyph = this.host.addChildPlainNode(root, 'Glyph', P.L(122), P.Y(36), P.S(50), P.S(50)).addComponent(Graphics);
    glyph.fillColor = rgba(214, 172, 96, 255);
    const d = P.S(20);
    glyph.moveTo(0, d);
    glyph.lineTo(d * 0.3, d * 0.3);
    glyph.lineTo(d, 0);
    glyph.lineTo(d * 0.3, -d * 0.3);
    glyph.lineTo(0, -d);
    glyph.lineTo(-d * 0.3, -d * 0.3);
    glyph.lineTo(-d, 0);
    glyph.lineTo(-d * 0.3, d * 0.3);
    glyph.close();
    glyph.fill();
    const title = this.host.addChildLabel(root, 'Title', '终端', P.L(165), P.Y(36), P.S(36), rgba(246, 230, 196), new Size(P.S(160), P.S(46)), HorizontalTextAlignment.LEFT);
    title.isBold = true;
    const close = this.host.addChildPlainNode(root, 'Close', P.R(1757), P.Y(40), P.S(78), P.S(78));
    if (!this.host.addSprite('Art', TERMINAL_ASSETS.btnClose, 0, 0, P.S(78), P.S(81), close)) {
      this.host.addChildLabel(close, 'X', '×', 0, 0, P.S(40), rgba(240, 214, 160), new Size(P.S(60), P.S(60)));
    }
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeLobbyTerminalPanel(), this);
    this.host.applyImageButtonFeedback(close, 1.08, 0.94);
  }

  /** 左侧名片(原型 x 95~515、y 80~725)。 */
  private renderCard(root: Node, P: TownProtoFrame): void {
    const profile = this.host.currentLobbyProfile();
    const cx = P.L(305);
    const cy = P.Y(402);
    const w = P.S(420);
    const h = P.S(645);
    const card = this.host.addChildPlainNode(root, 'Card', cx, cy, w, h);
    if (!mountRefSliced(this.host, card, 'Bg', { path: TERMINAL_ASSETS.cardPanel, w: 1000, h: 632, inset: [120, 120, 90, 90] }, 0, 0, w, h)) {
      const g = card.addComponent(Graphics);
      g.fillColor = rgba(16, 13, 12, 245);
      g.roundRect(-w / 2, -h / 2, w, h, P.S(10));
      g.fill();
    }
    const at = (py: number): number => P.Y(py) - cy;
    // 头像 + 尖刺金环(点开个人资料)
    const avatar = this.host.addChildPlainNode(card, 'Avatar', 0, at(195), P.S(200), P.S(200));
    // 头像 = 主角英雄;没有主角就用编队队长(和主城里走在最前面的是同一个),都缺图才回退通用头像
    const heroes = this.host.currentLobbyHeroRosterState().heroes;
    const leaderId = this.host.currentLobbyFormationHeroIds()[0];
    const hero = heroes.find((item) => item.protagonist) ?? heroes.find((item) => item.id === leaderId) ?? heroes.find((item) => item.id > 0);
    // 不用遮罩(终端整页关掉时一起销毁的模板遮罩,调试包切图时会触发 gfx-validator 断言):方头像 140,四角藏进金环环带(半对角 99 < 环外沿 101)
    const avatarPath = hero ? resolveHeroAvatarPath(hero.heroCode) : null;
    if (!avatarPath || !this.host.addSprite('Face', avatarPath, 0, 0, P.S(140), P.S(140), avatar)) {
      this.host.addLobbyAvatar(avatar, 0, 0, P.S(150), profile.displayName);
    }
    this.host.addSprite('Ring', TOWN_HUD_ASSETS.ringSpiked, 0, 0, P.S(236), P.S(236), avatar);
    avatar.addComponent(Button);
    avatar.on(Button.EventType.CLICK, () => this.host.runLobbyTerminalAction('profile'), this);
    this.host.applyImageButtonFeedback(avatar, 1.03, 0.97);
    const name = this.host.addChildLabel(card, 'Name', profile.displayName, 0, at(335), P.S(38), rgba(250, 244, 232), new Size(w - P.S(40), P.S(48)));
    name.isBold = true;
    name.overflow = Label.Overflow.SHRINK;
    this.host.addChildLabel(card, 'Uid', `UID ${profile.userId}`, 0, at(373), P.S(20), rgba(176, 168, 156), new Size(w, P.S(28)));
    this.divider(card, at(402), w - P.S(70), P);
    const left = -w / 2 + P.S(45);
    const right = w / 2 - P.S(45);
    const row = (label: string, value: string, py: number, valueColor = rgba(240, 232, 216)): void => {
      this.host.addChildLabel(card, `L_${label}`, label, left, at(py), P.S(23), rgba(226, 212, 186), new Size(P.S(170), P.S(32)), HorizontalTextAlignment.LEFT);
      const v = this.host.addChildLabel(card, `V_${label}`, value, right, at(py), P.S(24), valueColor, new Size(P.S(200), P.S(32)), HorizontalTextAlignment.RIGHT);
      v.isBold = true;
    };
    row('等级', `Lv.${profile.playerLevel}`, 432);
    row('阵容战力', this.host.formatInteger(profile.lineupPower ?? profile.combatPower), 476, rgba(244, 196, 100));
    const progress = profile.levelProgress;
    const pct = progress && progress.nextLevel != null ? Math.max(0, Math.min(100, progress.progressPercent)) : 100;
    const barW = P.S(226);
    const barH = P.S(16);
    const bar = this.host.addChildPlainNode(card, 'Exp', left + barW / 2, at(516), barW + 4, barH + 4).addComponent(Graphics);
    bar.fillColor = rgba(12, 9, 7, 240);
    bar.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    bar.fill();
    bar.fillColor = rgba(230, 168, 50, 255);
    bar.roundRect(-barW / 2 + 2, -barH / 2 + 2, Math.max(barH - 4, (barW - 4) * pct / 100), barH - 4, (barH - 4) / 2);
    bar.fill();
    bar.strokeColor = rgba(180, 140, 80, 230);
    bar.lineWidth = Math.max(1, P.S(1.5));
    bar.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    bar.stroke();
    this.host.addChildLabel(card, 'ExpText', progress && progress.nextLevel != null ? `EXP ${Math.floor(pct)}%` : 'MAX', right, at(516), P.S(20), rgba(240, 214, 160), new Size(P.S(110), P.S(28)), HorizontalTextAlignment.RIGHT);
    this.divider(card, at(546), w - P.S(70), P);
    const currencies: Array<{ key: 'stamina' | 'coin' | 'ruby'; label: string; value: string; shop: 'stamina' | 'gold' | 'diamond' }> = [
      { key: 'stamina', label: '体力', value: `${this.host.formatInteger(profile.stamina)}/${this.host.formatInteger(profile.maxStamina)}`, shop: 'stamina' },
      { key: 'coin', label: '金币', value: this.host.compactResourceValue(Number(profile.gold ?? 0)), shop: 'gold' },
      { key: 'ruby', label: '钻石', value: this.host.compactResourceValue(Number(profile.diamond ?? 0)), shop: 'diamond' },
    ];
    currencies.forEach((item, index) => {
      const y = at(586 + index * 48);
      this.host.addSprite(`Icon_${item.key}`, LOBBY_C1812_RESOURCE_ICON_ASSETS[item.key].path, left + P.S(14), y, P.S(34), P.S(34), card);
      this.host.addChildLabel(card, `CL_${item.key}`, item.label, left + P.S(42), y, P.S(22), rgba(232, 220, 198), new Size(P.S(90), P.S(30)), HorizontalTextAlignment.LEFT);
      this.host.addChildLabel(card, `CV_${item.key}`, item.value, right - P.S(44), y, P.S(22), rgba(246, 238, 222), new Size(P.S(170), P.S(30)), HorizontalTextAlignment.RIGHT);
      const plus = this.host.addChildPlainNode(card, `Plus_${item.key}`, right - P.S(14), y, P.S(32), P.S(32));
      const pg = plus.addComponent(Graphics);
      pg.fillColor = rgba(24, 18, 12, 240);
      pg.roundRect(-P.S(15), -P.S(15), P.S(30), P.S(30), P.S(4));
      pg.fill();
      pg.strokeColor = rgba(200, 160, 90, 240);
      pg.lineWidth = Math.max(1, P.S(1.5));
      pg.roundRect(-P.S(15), -P.S(15), P.S(30), P.S(30), P.S(4));
      pg.stroke();
      pg.fillColor = rgba(240, 210, 150, 255);
      pg.rect(-P.S(8), -P.S(1.5), P.S(16), P.S(3));
      pg.rect(-P.S(1.5), -P.S(8), P.S(3), P.S(16));
      pg.fill();
      plus.addComponent(Button);
      plus.on(Button.EventType.CLICK, () => {
        this.host.closeLobbyTerminalPanel();
        this.host.openLobbyShopDialog?.(item.shop);
      }, this);
      this.host.applyImageButtonFeedback(plus, 1.1, 0.92);
    });
  }

  private divider(parent: Node, y: number, w: number, P: TownProtoFrame): void {
    const g = this.host.addChildPlainNode(parent, 'Divider', 0, y, w, P.S(12)).addComponent(Graphics);
    g.fillColor = rgba(170, 132, 74, 160);
    g.rect(-w / 2, -Math.max(0.5, P.S(0.75)), w, Math.max(1, P.S(1.5)));
    g.fill();
    const d = P.S(5);
    g.fillColor = rgba(214, 172, 96, 255);
    g.moveTo(0, d);
    g.lineTo(d, 0);
    g.lineTo(0, -d);
    g.lineTo(-d, 0);
    g.close();
    g.fill();
  }

  /** 右侧 5×3 功能格(原型格心 x 686 + 230i、y 183 / 392 / 600;格 198×190,底部标题条)。 */
  private renderGrid(root: Node, P: TownProtoFrame): void {
    const badges = this.host.currentLobbyBadges?.() ?? null;
    const idle = this.host.currentIdleSummary?.() ?? null;
    const tiles: Array<Array<{ key: LobbyTerminalAction; label: string; dot: boolean }>> = [
      [
        { key: 'heroes', label: '英雄', dot: !!badges?.heroGrowable },
        { key: 'formation', label: '编队', dot: false },
        { key: 'bag', label: '背包', dot: false },
        { key: 'forge', label: '锻造', dot: false },
        { key: 'gacha', label: '召唤', dot: !!badges && (badges.gachaFree || badges.gachaTicketTen) },
      ],
      [
        { key: 'adventure', label: '冒险', dot: false },
        { key: 'daily', label: '秘境试炼', dot: false },
        { key: 'crystal', label: '守卫水晶', dot: false },
        { key: 'codex', label: '图鉴', dot: false },
        { key: 'quest', label: '任务', dot: (badges?.quest ?? 0) > 0 },
      ],
      [
        { key: 'shop', label: '商店', dot: false },
        { key: 'guild', label: '佣兵公会', dot: false },
        { key: 'idle', label: idle && idle.pendingGold > 0 ? `挂机 +${this.host.compactResourceValue(idle.pendingGold)}` : '挂机收益', dot: !!idle?.claimable },
        { key: 'worldmap', label: '世界地图', dot: false },
        { key: 'rank', label: '排行', dot: false },
      ],
    ];
    const tw = P.S(198);
    const th = P.S(190);
    tiles.forEach((row, r) => {
      row.forEach((tile, c) => {
        const node = this.host.addChildPlainNode(root, `LobbyTerminalTile_${tile.key}`, P.R(686 + 230 * c), P.Y([183, 392, 600][r]), tw, th);
        if (!mountRefSliced(this.host, node, 'Frame', { path: TERMINAL_ASSETS.tileFrame, w: 1360, h: 310, inset: [60, 60, 50, 50] }, 0, 0, tw, th)) {
          const g = node.addComponent(Graphics);
          g.fillColor = rgba(18, 14, 12, 245);
          g.roundRect(-tw / 2, -th / 2, tw, th, P.S(8));
          g.fill();
        }
        // 细金线花边(现成 ornate_frame_thin,四角小饰件)压在暗底上,接近原型格子的边饰
        mountRefSliced(this.host, node, 'Ornate', REF_ORNATE_FRAME, 0, 0, tw, th);
        // 底部标题暗条(现成 stat_bar)
        mountRefSliced(this.host, node, 'Strip', { path: TERMINAL_ASSETS.tileStrip, w: 900, h: 85, inset: [60, 60, 30, 30] }, 0, -th / 2 + P.S(25), tw - P.S(14), P.S(38));
        this.addFit(node, TILE_ICONS[tile.key], 0, P.S(18), P.S(134), P.S(124));
        const label = this.host.addChildLabel(node, 'Label', tile.label, 0, -th / 2 + P.S(24), P.S(24), rgba(246, 236, 214), new Size(tw - P.S(30), P.S(32)));
        label.isBold = true;
        label.overflow = Label.Overflow.SHRINK;
        if (tile.dot) {
          const dot = this.host.addChildPlainNode(node, 'Dot', tw / 2 - P.S(16), th / 2 - P.S(16), P.S(22), P.S(22)).addComponent(Graphics);
          dot.fillColor = rgba(208, 28, 32, 255);
          dot.circle(0, 0, P.S(9));
          dot.fill();
          dot.strokeColor = rgba(70, 8, 8, 255);
          dot.lineWidth = Math.max(1, P.S(1.5));
          dot.circle(0, 0, P.S(9));
          dot.stroke();
        }
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.runLobbyTerminalAction(tile.key), this);
        this.host.applyImageButtonFeedback(node, 1.04, 0.96);
      });
    });
  }

  /** 底栏(原型 x 60~1810、y 775):左退出登录,右邮件 / 公告 / 兑换码 / 设置。 */
  private renderBottom(root: Node, layout: UiLayout, P: TownProtoFrame): void {
    void layout;
    const x0 = P.L(60);
    const x1 = P.R(1810);
    const w = x1 - x0;
    const h = P.S(92);
    const bar = this.host.addChildPlainNode(root, 'Bottom', (x0 + x1) / 2, P.Y(777), w, h);
    if (!mountRefSliced(this.host, bar, 'Bg', { path: TERMINAL_ASSETS.bottomStrip, w: 696, h: 150, inset: [70, 70, 40, 40] }, 0, 0, w, h)) {
      const g = bar.addComponent(Graphics);
      g.fillColor = rgba(16, 13, 12, 245);
      g.rect(-w / 2, -h / 2, w, h);
      g.fill();
    }
    const logout = this.host.addChildPlainNode(root, 'Logout', P.L(158), P.Y(775), P.S(66), P.S(66));
    // 暗红圆盘 + 尖刺金环 + 程序画的电源符号(线条干净,不另出图)
    mountRingBase(this.host, logout, P.S(74), false, rgba(96, 22, 18, 245));
    const glyph = this.host.addChildPlainNode(logout, 'Glyph', 0, 0, P.S(40), P.S(40)).addComponent(Graphics);
    glyph.strokeColor = rgba(226, 190, 120, 255);
    glyph.lineWidth = Math.max(2, P.S(4));
    glyph.arc(0, -P.S(1), P.S(13), Math.PI / 2 + 0.6, Math.PI / 2 - 0.6 + Math.PI * 2, true);
    glyph.stroke();
    glyph.moveTo(0, P.S(16));
    glyph.lineTo(0, P.S(2));
    glyph.stroke();
    this.host.addChildLabel(logout, 'Label', '退出登录', P.S(46), 0, P.S(23), rgba(240, 228, 206), new Size(P.S(130), P.S(32)), HorizontalTextAlignment.LEFT);
    logout.addComponent(Button);
    logout.on(Button.EventType.CLICK, () => this.host.runLobbyTerminalAction('logout'), this);
    this.host.applyImageButtonFeedback(logout, 1.06, 0.95);
    const unread = this.host.lobbyMailUnreadCount?.() ?? 0;
    const buttons: Array<{ key: LobbyTerminalAction; label: string; icon: string; dot: boolean }> = [
      { key: 'mail', label: '邮件', icon: TOWN_HUD_ASSETS.icMail, dot: unread > 0 },
      { key: 'notice', label: '公告', icon: TOWN_HUD_ASSETS.icNotice, dot: false },
      { key: 'gift', label: '兑换码', icon: TOWN_HUD_ASSETS.icGift, dot: false },
      { key: 'settings', label: '设置', icon: TOWN_HUD_ASSETS.icGear, dot: false },
    ];
    buttons.forEach((item, index) => {
      const d = P.S(66);
      const node = this.host.addChildPlainNode(root, `LobbyTerminalBtn_${item.key}`, P.R(1403 + 109 * index), P.Y(766), d, d);
      mountRingBase(this.host, node, d * 1.12);
      this.addFit(node, item.icon, 0, 0, d * 0.66, d * 0.66);
      const label = this.host.addChildLabel(node, 'Label', item.label, 0, -d * 0.5 - P.S(6), P.S(18), rgba(240, 230, 210), new Size(P.S(90), P.S(24)));
      label.enableOutline = true;
      label.outlineColor = rgba(0, 0, 0, 230);
      label.outlineWidth = 1;
      if (item.dot) {
        const dot = this.host.addChildPlainNode(node, 'Dot', d * 0.36, d * 0.36, P.S(20), P.S(20)).addComponent(Graphics);
        dot.fillColor = rgba(208, 28, 32, 255);
        dot.circle(0, 0, P.S(8));
        dot.fill();
      }
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => this.host.runLobbyTerminalAction(item.key), this);
      this.host.applyImageButtonFeedback(node, 1.08, 0.94);
    });
  }

  private addFit(parent: Node, asset: string, x: number, y: number, boxW: number, boxH: number): void {
    const sprite = this.host.addSprite('Icon', asset, x, y, boxW, boxH, parent);
    const frame = sprite?.spriteFrame;
    if (!sprite || !frame) {
      return;
    }
    const k = Math.min(boxW / Math.max(1, frame.originalSize.width), boxH / Math.max(1, frame.originalSize.height));
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.node.getComponent(UITransform)?.setContentSize(frame.originalSize.width * k, frame.originalSize.height * k);
  }
}
