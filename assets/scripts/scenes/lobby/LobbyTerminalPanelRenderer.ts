import { BlockInputEvents, Button, Graphics, HorizontalTextAlignment, Label, Node, Size, UITransform } from 'cc';
import { rgba, type LobbyHudHost, type UiLayout } from './LobbyHudTypes';
import { TERMINAL_ASSETS, TOWN_HUD_PROTO, type TownProtoFrame } from './LobbyTownHudProto';
import { resolveHeroAvatarPath } from './HeroHeadCrop';

export type LobbyTerminalAction =
  | 'heroes' | 'formation' | 'bag' | 'forge' | 'gacha'
  | 'raid' | 'daily' | 'crystal' | 'codex' | 'quest'
  | 'shop' | 'guild' | 'idle' | 'worldmap' | 'rank'
  | 'mail' | 'notice' | 'gift' | 'settings' | 'logout' | 'profile';

export interface LobbyTerminalPanelHost extends LobbyHudHost {
  closeLobbyTerminalPanel(): void;
  runLobbyTerminalAction(action: LobbyTerminalAction): void;
}

/** 功能格(原型 proto_terminal_b2):列左沿 630 / 856 / 1083 / 1309 / 1536,宽 210;行顶 105 / 326 / 537,高 205 / 195 / 195。 */
const TILE_KEYS: LobbyTerminalAction[][] = [
  ['heroes', 'formation', 'bag', 'forge', 'gacha'],
  // 第 2 行第 1 格「矿境掠夺」;第 3 行第 3 格「野外探索」(动作仍叫 idle,挂机下线后进世界地图)
  ['raid', 'daily', 'crystal', 'codex', 'quest'],
  ['shop', 'guild', 'idle', 'worldmap', 'rank'],
];
const TILE_X0 = [630, 856, 1083, 1309, 1536];
const TILE_W = 210;
const TILE_Y0 = [105, 326, 537];
const TILE_H = [205, 195, 195];
const TEXT = rgba(242, 242, 242);
const SUB = rgba(163, 168, 179);

/**
 * 终端 B 风格 1:1(2026-10-30 用户确认原型 周报截图/2026-10-30_终端B风格/proto_terminal_b2):
 * 原型(1870×841)整张当静态底层(tools/qa/terminal_b_extract.py 抠掉动态内容),按整屏等比铺满(u = min(高 / 841, 宽 / 1870)),
 * 头像 / 名字 / ID / 等级 / 战力 / 经验 / 货币 / 红点按原型像素坐标画回去;头像上压一块带透明圆孔的环覆盖层(盖住方头像四角)。
 * 按钮只是透明点击区。
 */
export class LobbyTerminalPanelRenderer {
  static readonly NODE_NAME = 'LobbyTerminal';

  constructor(private readonly host: LobbyTerminalPanelHost) {}

  render(layout: UiLayout): void {
    const P = terminalFrame(layout);
    const root = this.host.createUiNode(LobbyTerminalPanelRenderer.NODE_NAME);
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(10, 12, 18, 255);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    const w = TOWN_HUD_PROTO.w * P.u;
    const h = TOWN_HUD_PROTO.h * P.u;
    this.host.addSprite('Static', TERMINAL_ASSETS.staticLayer, P.C(TOWN_HUD_PROTO.w / 2), P.Y(TOWN_HUD_PROTO.h / 2), w, h, root);
    this.renderCard(root, P);
    this.renderTiles(root, P);
    this.renderBottom(root, P);
    // 关闭钮(原型 (1771, 55))
    this.hit(root, 'Close', 1771, 55, 90, 90, P, () => this.host.closeLobbyTerminalPanel());
  }

  /** 名片:头像 (226,213) 孔 r80、名字 x331 / y190、ID y231、等级 / 战力右沿 573 @ 344 / 397、EXP y450 + 条 y476(x150..573)、货币右沿 497 @ 560 / 623 / 687。 */
  private renderCard(root: Node, P: TownProtoFrame): void {
    const profile = this.host.currentLobbyProfile();
    const heroes = this.host.currentLobbyHeroRosterState().heroes;
    const leaderId = this.host.currentLobbyFormationHeroIds()[0];
    const hero = heroes.find((item) => item.protagonist) ?? heroes.find((item) => item.id === leaderId) ?? heroes.find((item) => item.id > 0);
    const avatarPath = hero ? resolveHeroAvatarPath(hero.heroCode) : null;
    // 方头像 168(四角 r119)在环覆盖层(200 方、孔 r80)下面:孔外全部被覆盖层盖住
    if (!avatarPath || !this.host.addSprite('Avatar', avatarPath, P.C(226), P.Y(213), P.S(168), P.S(168), root)) {
      this.host.addLobbyAvatar(root, P.C(226), P.Y(213), P.S(160), profile.displayName);
    }
    this.host.addSprite('Ring', TERMINAL_ASSETS.ringOverlay, P.C(226), P.Y(213), P.S(200), P.S(200), root);
    this.hit(root, 'Profile', 226, 213, 190, 190, P, () => this.host.runLobbyTerminalAction('profile'));
    const text = (name: string, value: string, px: number, py: number, size: number, color: ReturnType<typeof rgba>, width: number, align: HorizontalTextAlignment, bold = false): Label => {
      const label = this.host.addChildLabel(root, name, value, P.C(px), P.Y(py), P.S(size), color, new Size(P.S(width), P.S(size + 12)), align);
      label.overflow = Label.Overflow.SHRINK;
      label.isBold = bold;
      return label;
    };
    text('Name', profile.displayName, 331, 190, 34, TEXT, 250, HorizontalTextAlignment.LEFT, true);
    text('Uid', `ID ${profile.userId}`, 331, 231, 22, SUB, 250, HorizontalTextAlignment.LEFT);
    text('Level', `Lv.${profile.playerLevel}`, 573, 344, 24, TEXT, 150, HorizontalTextAlignment.RIGHT);
    text('Power', this.host.formatInteger(profile.lineupPower ?? profile.combatPower), 573, 397, 24, TEXT, 180, HorizontalTextAlignment.RIGHT);
    const progress = profile.levelProgress;
    const pct = progress && progress.nextLevel != null ? Math.max(0, Math.min(100, progress.progressPercent)) : 100;
    // 进度条:暗槽 (68,77,92) + 白色填充 (220,226,239),x 150..573、y 476、高 13 全圆角(原型取色)
    const barW = P.S(423);
    const barH = P.S(13);
    const groove = this.host.addChildPlainNode(root, 'ExpGroove', P.C(150) + barW / 2, P.Y(476), barW, barH).addComponent(Graphics);
    groove.fillColor = rgba(68, 77, 92, 255);
    groove.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    groove.fill();
    const fillW = Math.max(barH, barW * pct / 100);
    const bar = this.host.addChildPlainNode(root, 'ExpFill', P.C(150) + fillW / 2, P.Y(476), fillW, barH).addComponent(Graphics);
    bar.fillColor = rgba(220, 226, 239, 255);
    bar.roundRect(-fillW / 2, -barH / 2, fillW, barH, barH / 2);
    bar.fill();
    text('Exp', progress && progress.nextLevel != null ? `EXP ${Math.floor(pct)}%` : 'EXP MAX', 150, 450, 20, SUB, 200, HorizontalTextAlignment.LEFT);
    const currencies: Array<{ py: number; value: string; shop: 'stamina' | 'gold' | 'diamond' }> = [
      { py: 560, value: `${this.host.formatInteger(profile.stamina)}/${this.host.formatInteger(profile.maxStamina)}`, shop: 'stamina' },
      { py: 623, value: this.host.compactResourceValue(Number(profile.gold ?? 0)), shop: 'gold' },
      { py: 687, value: this.host.compactResourceValue(Number(profile.diamond ?? 0)), shop: 'diamond' },
    ];
    for (const item of currencies) {
      if (item.shop === 'stamina' && profile.stamina > profile.maxStamina) {
        // 体力超上限(10-28 写成「1,164/120」看着像 bug):超出时数值香槟金 + 小号灰字「/ 120 上限」
        const capText = `/ ${this.host.formatInteger(profile.maxStamina)} 上限`;
        const capW = capText.length * 12 + 6;
        text('Cur_stamina_cap', capText, 497, item.py + 1, 18, SUB, capW, HorizontalTextAlignment.RIGHT);
        text('Cur_stamina', this.host.formatInteger(profile.stamina), 497 - capW - 4, item.py, 24, rgba(227, 196, 138), 120, HorizontalTextAlignment.RIGHT);
      } else {
        text(`Cur_${item.shop}`, item.value, 497, item.py, 24, TEXT, 160, HorizontalTextAlignment.RIGHT);
      }
      this.hit(root, `Plus_${item.shop}`, 551, item.py, 52, 52, P, () => {
        this.host.closeLobbyTerminalPanel();
        this.host.openLobbyShopDialog?.(item.shop);
      });
    }
  }

  private renderTiles(root: Node, P: TownProtoFrame): void {
    const badges = this.host.currentLobbyBadges?.() ?? null;
    const unread = this.host.lobbyMailUnreadCount?.() ?? 0;
    const dots: Partial<Record<LobbyTerminalAction, boolean>> = {
      heroes: !!badges?.heroGrowable,
      gacha: !!badges && (badges.gachaFree || badges.gachaTicketTen),
      quest: (badges?.quest ?? 0) > 0,
      mail: unread > 0,
    };
    TILE_KEYS.forEach((row, r) => {
      row.forEach((key, c) => {
        const x0 = TILE_X0[c];
        const y0 = TILE_Y0[r];
        this.hit(root, `Tile_${key}`, x0 + TILE_W / 2, y0 + TILE_H[r] / 2, TILE_W, TILE_H[r], P, () => this.host.runLobbyTerminalAction(key));
        if (dots[key]) {
          // 原型红点在格右上 (+181, +27)
          this.dot(root, x0 + 181, y0 + 27, P);
        }
      });
    });
    if (dots.mail) {
      this.dot(root, 1318, 777, P);
    }
  }

  /** 底栏(y 790):退出登录 x105..255、邮件 1335 / 公告 1462 / 兑换码 1590 / 设置 1730。 */
  private renderBottom(root: Node, P: TownProtoFrame): void {
    this.hit(root, 'Logout', 180, 790, 200, 64, P, () => this.host.runLobbyTerminalAction('logout'));
    const buttons: Array<[LobbyTerminalAction, number]> = [['mail', 1335], ['notice', 1462], ['gift', 1590], ['settings', 1730]];
    for (const [key, px] of buttons) {
      this.hit(root, `Btn_${key}`, px, 790, 124, 64, P, () => this.host.runLobbyTerminalAction(key));
    }
  }

  /** 原型红点:r 12 纯红(B 风格无描边)。 */
  private dot(root: Node, px: number, py: number, P: TownProtoFrame): void {
    const g = this.host.addChildPlainNode(root, 'Dot', P.C(px), P.Y(py), P.S(30), P.S(30)).addComponent(Graphics);
    g.fillColor = rgba(230, 34, 40, 255);
    g.circle(0, 0, P.S(11));
    g.fill();
  }

  /** 透明点击区(静态图上已画好的钮)。 */
  private hit(root: Node, name: string, px: number, py: number, w: number, h: number, P: TownProtoFrame, onTap: () => void): Node {
    const node = this.host.addChildPlainNode(root, `LobbyTerminalHit_${name}`, P.C(px), P.Y(py), P.S(w), P.S(h));
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, onTap, this);
    return node;
  }
}

/** 终端是整页:原型整体等比铺满整屏(u = min(高 / 841, 宽 / 1870)),以整屏中心(不是安全区)居中。 */
function terminalFrame(layout: UiLayout): TownProtoFrame {
  const u = Math.min(layout.height / TOWN_HUD_PROTO.h, layout.width / TOWN_HUD_PROTO.w);
  const cx = (layout.stageLeft + layout.stageRight) / 2;
  const cy = (layout.stageTop + layout.stageBottom) / 2;
  const X = (px: number): number => cx + (px - TOWN_HUD_PROTO.w / 2) * u;
  return { u, L: X, R: X, C: X, Y: (py) => cy - (py - TOWN_HUD_PROTO.h / 2) * u, S: (size) => size * u };
}
