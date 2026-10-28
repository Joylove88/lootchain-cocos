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

/** 功能格:原型列左沿 588 + 229.5i、行顶 92 / 297 / 506,格 196×189。 */
const TILE_KEYS: LobbyTerminalAction[][] = [
  ['heroes', 'formation', 'bag', 'forge', 'gacha'],
  // 第 2 行第 1 格:原「冒险」(实际进矿境掠夺),冒险章节下架后改名「矿境掠夺」(2026-10-28,底图同步重画)
  ['raid', 'daily', 'crystal', 'codex', 'quest'],
  ['shop', 'guild', 'idle', 'worldmap', 'rank'],
];
const TILE_X0 = 588;
const TILE_STEP = 229.5;
const TILE_Y0 = [92, 297, 506];
const TILE_W = 196;
const TILE_H = 189;

/**
 * 终端(docs/51 §2.1)1:1 还原(2026-10-27 用户:「和原型还是有差异需要1:1还原」):
 * 原型 proto_terminal_v2(1870×841)整张当静态底层(tools/qa/terminal_proto_extract.py 抠掉动态内容),
 * 按整屏等比铺满(u = min(高 / 841, 宽 / 1870)),头像 / 名字 / UID / 等级 / 战力 / 经验 / 货币 / 红点按原型像素坐标画回去;
 * 头像上压一块带透明圆孔的环覆盖层(盖住方头像四角)。按钮只是透明点击区。
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
    dim.fillColor = rgba(8, 7, 9, 255);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    const w = TOWN_HUD_PROTO.w * P.u;
    const h = TOWN_HUD_PROTO.h * P.u;
    this.host.addSprite('Static', TERMINAL_ASSETS.staticLayer, P.C(TOWN_HUD_PROTO.w / 2), P.Y(TOWN_HUD_PROTO.h / 2), w, h, root);
    this.renderCard(root, P);
    this.renderTiles(root, P);
    this.renderBottom(root, P);
    // 关闭钮(原型 (1757, 40) 直径 66)
    this.hit(root, 'Close', 1757, 40, 80, 80, P, () => this.host.closeLobbyTerminalPanel());
  }

  /** 名片动态内容:头像 (305,195) r100、名字 335、UID 373、等级 432、战力 476、经验条 509..523 / 文字 516、货币 586 / 634 / 682。 */
  private renderCard(root: Node, P: TownProtoFrame): void {
    const profile = this.host.currentLobbyProfile();
    const heroes = this.host.currentLobbyHeroRosterState().heroes;
    const leaderId = this.host.currentLobbyFormationHeroIds()[0];
    const hero = heroes.find((item) => item.protagonist) ?? heroes.find((item) => item.id === leaderId) ?? heroes.find((item) => item.id > 0);
    const avatarPath = hero ? resolveHeroAvatarPath(hero.heroCode) : null;
    // 方头像 200(四角 r141)在环覆盖层(250 方、孔 r100)下面:孔外全部被覆盖层盖住
    if (!avatarPath || !this.host.addSprite('Avatar', avatarPath, P.C(305), P.Y(195), P.S(200), P.S(200), root)) {
      this.host.addLobbyAvatar(root, P.C(305), P.Y(195), P.S(196), profile.displayName);
    }
    this.host.addSprite('Ring', TERMINAL_ASSETS.ringOverlay, P.C(305), P.Y(195), P.S(250), P.S(250), root);
    this.hit(root, 'Profile', 305, 195, 230, 230, P, () => this.host.runLobbyTerminalAction('profile'));
    const text = (name: string, value: string, px: number, py: number, size: number, color: ReturnType<typeof rgba>, width: number, align: HorizontalTextAlignment, bold = false): Label => {
      const label = this.host.addChildLabel(root, name, value, P.C(px), P.Y(py), P.S(size), color, new Size(P.S(width), P.S(size + 12)), align);
      label.overflow = Label.Overflow.SHRINK;
      label.isBold = bold;
      return label;
    };
    text('Name', profile.displayName, 305, 335, 38, rgba(250, 244, 232), 300, HorizontalTextAlignment.CENTER, true);
    text('Uid', `ID ${profile.userId}`, 305, 373, 20, rgba(176, 168, 156), 300, HorizontalTextAlignment.CENTER);
    text('Level', `Lv.${profile.playerLevel}`, 465, 432, 24, rgba(240, 234, 220), 150, HorizontalTextAlignment.RIGHT, true);
    text('Power', this.host.formatInteger(profile.lineupPower ?? profile.combatPower), 465, 476, 24, rgba(244, 196, 100), 150, HorizontalTextAlignment.RIGHT, true);
    const progress = profile.levelProgress;
    const pct = progress && progress.nextLevel != null ? Math.max(0, Math.min(100, progress.progressPercent)) : 100;
    // 经验条填充:原型橙 (252,179,13),槽内 x 140..360 / y 509..523
    const fillW = Math.max(P.S(14), P.S(220) * pct / 100);
    const bar = this.host.addChildPlainNode(root, 'ExpFill', P.C(140) + fillW / 2, P.Y(516), fillW, P.S(14)).addComponent(Graphics);
    bar.fillColor = rgba(252, 179, 13, 255);
    bar.roundRect(-fillW / 2, -P.S(7), fillW, P.S(14), P.S(7));
    bar.fill();
    bar.fillColor = rgba(255, 255, 255, 60);
    bar.roundRect(-fillW / 2 + P.S(3), P.S(1), fillW - P.S(6), P.S(4), P.S(2));
    bar.fill();
    text('Exp', progress && progress.nextLevel != null ? `EXP ${Math.floor(pct)}%` : 'MAX', 465, 516, 20, rgba(240, 214, 160), 110, HorizontalTextAlignment.RIGHT);
    const currencies: Array<{ py: number; value: string; shop: 'stamina' | 'gold' | 'diamond' }> = [
      { py: 586, value: `${this.host.formatInteger(profile.stamina)}/${this.host.formatInteger(profile.maxStamina)}`, shop: 'stamina' },
      { py: 634, value: this.host.compactResourceValue(Number(profile.gold ?? 0)), shop: 'gold' },
      { py: 682, value: this.host.compactResourceValue(Number(profile.diamond ?? 0)), shop: 'diamond' },
    ];
    for (const item of currencies) {
      if (item.shop === 'stamina') {
        // 体力超上限(10-28 终端写成「1,164/120」看着像 bug):超出时数值金色 + 后面小号灰字「/ 120 上限」;没超照旧
        const over = profile.stamina > profile.maxStamina;
        const capText = over ? `/ ${this.host.formatInteger(profile.maxStamina)} 上限` : `/ ${this.host.formatInteger(profile.maxStamina)}`;
        const capW = capText.length * 11 + 6;
        text('Cur_stamina_cap', capText, 420, item.py + 1, 17, rgba(170, 160, 146), capW, HorizontalTextAlignment.RIGHT);
        text('Cur_stamina', this.host.formatInteger(profile.stamina), 420 - capW - 4, item.py, 22, over ? rgba(255, 214, 110) : rgba(246, 238, 222), 120, HorizontalTextAlignment.RIGHT);
      } else {
        text(`Cur_${item.shop}`, item.value, 420, item.py, 22, rgba(246, 238, 222), 140, HorizontalTextAlignment.RIGHT);
      }
      this.hit(root, `Plus_${item.shop}`, 441, item.py, 44, 44, P, () => {
        this.host.closeLobbyTerminalPanel();
        this.host.openLobbyShopDialog?.(item.shop);
      });
    }
  }

  private renderTiles(root: Node, P: TownProtoFrame): void {
    const badges = this.host.currentLobbyBadges?.() ?? null;
    const idle = this.host.currentIdleSummary?.() ?? null;
    const unread = this.host.lobbyMailUnreadCount?.() ?? 0;
    const dots: Partial<Record<LobbyTerminalAction, boolean>> = {
      heroes: !!badges?.heroGrowable,
      gacha: !!badges && (badges.gachaFree || badges.gachaTicketTen),
      quest: (badges?.quest ?? 0) > 0,
      idle: !!idle?.claimable,
      mail: unread > 0,
    };
    TILE_KEYS.forEach((row, r) => {
      row.forEach((key, c) => {
        const x0 = TILE_X0 + TILE_STEP * c;
        const y0 = TILE_Y0[r];
        this.hit(root, `Tile_${key}`, x0 + TILE_W / 2, y0 + TILE_H / 2, TILE_W, TILE_H, P, () => this.host.runLobbyTerminalAction(key));
        if (dots[key]) {
          this.dot(root, x0 + TILE_W - 19, y0 + 20, P);
        }
      });
    });
    if (dots.mail) {
      this.dot(root, 1426, 750, P);
    }
  }

  /** 底栏:退出登录 (150,775)、邮件 1405 / 公告 1512 / 兑换码 1617 / 设置 1722 @ 775。 */
  private renderBottom(root: Node, P: TownProtoFrame): void {
    this.hit(root, 'Logout', 200, 775, 230, 70, P, () => this.host.runLobbyTerminalAction('logout'));
    const buttons: Array<[LobbyTerminalAction, number]> = [['mail', 1405], ['notice', 1512], ['gift', 1617], ['settings', 1722]];
    for (const [key, px] of buttons) {
      this.hit(root, `Btn_${key}`, px, 780, 96, 96, P, () => this.host.runLobbyTerminalAction(key));
    }
  }

  /** 原型红点:r 13 纯红 + 深红描边。 */
  private dot(root: Node, px: number, py: number, P: TownProtoFrame): void {
    const g = this.host.addChildPlainNode(root, 'Dot', P.C(px), P.Y(py), P.S(30), P.S(30)).addComponent(Graphics);
    g.fillColor = rgba(222, 32, 32, 255);
    g.circle(0, 0, P.S(12));
    g.fill();
    g.strokeColor = rgba(90, 10, 10, 200);
    g.lineWidth = Math.max(1, P.S(1.2));
    g.circle(0, 0, P.S(12));
    g.stroke();
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
