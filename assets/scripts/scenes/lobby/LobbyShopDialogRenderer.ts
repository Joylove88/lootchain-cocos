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
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { ShopCatalogVO } from '../../types/ShopTypes';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 货币商店弹窗(2026-09-22 用户拍板"你来设计",docs/33):
 * - 金币:点顶部金币打开;4 档钻石→金币一排,图标 单枚金币 → 一堆 → 金币山 → 金币宝箱 递进。
 * - 体力:点顶部体力打开;左侧当前体力 + 回复进度,右侧"补充 1 份 / 5 份"两张卡;60 钻 = 30 体力,每日限次,可超上限。
 * - 钻石:点顶部钻石打开;6 档人民币→钻石按 3×2 排,图标 少量 → 中量 → 大量 → 钻石宝箱 递进;支付渠道未接入时只预览。
 * 面板底与守卫战各弹层同款素净框(4:3),高度按内容算;字号按限时副本面板口径(标题 34、正文 18、卡名 20、数额 28)。
 * 作为全屏覆盖层挂在当前视图之上(大厅 / 锻造等功能页都能开),数据与写入全走服务端 ShopApi;购买成功由根节点飞字到顶部对应货币。
 */
export type LobbyShopKind = 'gold' | 'stamina' | 'diamond';

export interface LobbyShopDialogState {
  kind: LobbyShopKind;
  catalog: ShopCatalogVO | null;
  loading: boolean;
  busy: boolean;
  notice: string;
}

export interface LobbyShopDialogHost {
  currentLobbyProfile(): PlayerLobbyProfileVO;
  currentLobbyShopState(): LobbyShopDialogState | null;
  closeLobbyShopDialog(): void;
  /** fromWorld=被点卡片的世界坐标,成功后飞字从这里起飞。 */
  buyShopGold(tierCode: string, fromWorld?: Vec3): void;
  buyShopStamina(count: number, fromWorld?: Vec3): void;
  rechargeShopDiamond(tierCode: string, fromWorld?: Vec3): void;
  createUiNode(name: string): Node;
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
  formatInteger(value: number | null | undefined): string;
}

interface SpriteSpec {
  path: string;
  /** 高/宽,等比显示用。 */
  aspect: number;
}

/** 面板底:与守卫战各弹层同款素净框 refine_panel_bg(1448×1086,细金线 + 小顶饰;2026-09-22 用户反馈 popup_frame_large 坠饰太大)。 */
const PANEL_FRAME: SpriteSpec = { path: 'ui/hero/ai/refine_panel_bg/spriteFrame', aspect: 1086 / 1448 };
const TITLE_DIVIDER_L: SpriteSpec = { path: 'ui/common/ai/title_divider_left/spriteFrame', aspect: 76 / 390 };
const TITLE_DIVIDER_R: SpriteSpec = { path: 'ui/common/ai/title_divider_right/spriteFrame', aspect: 73 / 392 };
const CLOSE_BUTTON: SpriteSpec = { path: 'ui/common/ai/button_close/spriteFrame', aspect: 161 / 155 };
const BUY_BUTTON: SpriteSpec = { path: 'ui/common/ai/bag_button_crimson/spriteFrame', aspect: 128 / 512 };
/** 档位卡框:绿 → 蓝 → 紫 → 橙(现成抽卡框,只能等比)。 */
const TIER_FRAMES: SpriteSpec[] = [
  { path: 'ui/gacha/ai/green/spriteFrame', aspect: 416 / 294 },
  { path: 'ui/gacha/ai/blue/spriteFrame', aspect: 419 / 293 },
  { path: 'ui/gacha/ai/purple/spriteFrame', aspect: 421 / 299 },
  { path: 'ui/gacha/ai/orange/spriteFrame', aspect: 422 / 299 },
];
const ICONS: Record<string, SpriteSpec> = {
  gold_small: { path: 'ui/bag/ai/icon_gold/spriteFrame', aspect: 1 },
  gold_medium: { path: 'ui/common/ai/ic_gold_medium/spriteFrame', aspect: 153 / 176 },
  gold_large: { path: 'ui/common/ai/ic_gold_large/spriteFrame', aspect: 171 / 184 },
  gold_chest: { path: 'ui/bag/ai/icon_gold_chest/spriteFrame', aspect: 1 },
  diamond: { path: 'ui/bag/ai/icon_diamond/spriteFrame', aspect: 1 },
  chest: { path: 'ui/codex/ai/chest_ready/spriteFrame', aspect: 1 },
  stamina: { path: 'ui/bag/ai/icon_stamina/spriteFrame', aspect: 1 },
};

const TITLE: Record<LobbyShopKind, string> = { gold: '金币商店', stamina: '体力补充', diamond: '钻石充值' };

/** 字号口径(2026-09-22 用户:与限时副本面板一致,以后所有弹窗统一)。 */
const FONT = { title: 34, subtitle: 18, body: 18, small: 16, cardName: 20, amount: 28, unit: 16, bonus: 15, price: 20, big: 26 };
/** 面板顶边 → 内容区顶 / 内容区底 → 面板底边 的固定留白(含标题、副标题、余额行)。 */
const HEADER_H = 200;
const FOOTER_H = 128;
/** 卡片框最高的高宽比(排版预留)。 */
const TALLEST_FRAME = Math.max(...TIER_FRAMES.map((frame) => frame.aspect));

interface TierCardSpec {
  name: string;
  iconKey: string;
  amount: string;
  unit: string;
  amountColor: Color;
  bonus: string;
  price: string;
  enabled: boolean;
  dimmed: boolean;
  /** 图标角标(体力 5 份包的 ×5)。 */
  badge?: string;
  onTap: ((fromWorld: Vec3) => void) | null;
}

export class LobbyShopDialogRenderer {
  constructor(private readonly host: LobbyShopDialogHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyShopState();
    if (!state) {
      return;
    }
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const overlay = this.host.createUiNode('LobbyShopOverlay');
    overlay.setPosition(new Vec3(centerX, centerY, 0));
    overlay.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    overlay.addComponent(BlockInputEvents);
    const dim = overlay.addComponent(Graphics);
    dim.fillColor = rgba(0, 0, 0, 176);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => this.host.closeLobbyShopDialog(), this);

    // 面板高度按内容算(用户 2026-09-22:标题离下面的框太远时缩小整个框),4:3 等比;宽度放不下再按宽反推。
    const catalog = state.catalog;
    const contentH = this.contentHeight(state.kind, catalog, scale);
    let panelH = Math.min(layout.stageHeight * 0.92, (HEADER_H + FOOTER_H) * scale + contentH);
    let panelW = panelH / PANEL_FRAME.aspect;
    if (panelW > layout.stageWidth - 32 * scale) {
      panelW = layout.stageWidth - 32 * scale;
      panelH = panelW * PANEL_FRAME.aspect;
    }
    const panel = this.host.addChildPlainNode(overlay, 'LobbyShopPanel', 0, 0, panelW, panelH);
    // 面板自己吞掉点击:点面板不关闭,点外面暗幕才关闭。
    panel.addComponent(BlockInputEvents);
    this.host.addSprite('LobbyShopPanelFrame', PANEL_FRAME.path, 0, 0, panelW, panelH, panel);

    const closeSize = 44 * scale;
    const close = this.host.addChildPlainNode(panel, 'LobbyShopClose', panelW / 2 - 64 * scale, panelH / 2 - 62 * scale, closeSize, closeSize * CLOSE_BUTTON.aspect);
    this.host.addSprite('LobbyShopCloseArt', CLOSE_BUTTON.path, 0, 0, closeSize, closeSize * CLOSE_BUTTON.aspect, close);
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeLobbyShopDialog(), this);
    this.host.applyImageButtonFeedback(close, 1.08, 0.94);

    // 标题压到顶饰之下,两侧任务页同款 title_divider 饰件(与守卫战弹层一致)。
    const titleY = panelH / 2 - 112 * scale;
    const titleSize = FONT.title * scale;
    const title = this.host.addChildLabel(panel, 'LobbyShopTitle', TITLE[state.kind], 0, titleY, titleSize, rgba(255, 226, 150), new Size(panelW * 0.6, titleSize + 10 * scale));
    title.isBold = true;
    this.outline(title, scale, rgba(60, 30, 10, 255));
    const titleHalf = (TITLE[state.kind].length * titleSize) / 2;
    const dividerW = 150 * scale;
    const dividerX = titleHalf + 22 * scale + dividerW / 2;
    this.host.addSprite('LobbyShopTitleDividerL', TITLE_DIVIDER_L.path, -dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_L.aspect, panel);
    this.host.addSprite('LobbyShopTitleDividerR', TITLE_DIVIDER_R.path, dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_R.aspect, panel);
    const subtitleText = state.kind === 'gold'
      ? '用钻石换取金币,档位越高赠送越多'
      : state.kind === 'stamina'
        ? `${catalog?.staminaOffer.diamondCost ?? 60} 钻石 = ${catalog?.staminaOffer.staminaGain ?? 30} 体力 · 每 5 分钟自然回复 1 点`
        : catalog?.mockPay
          ? '联调环境:点击档位即模拟支付到账;正式环境接入支付渠道后走真实支付'
          : '支付渠道接入中,档位仅供预览';
    const subtitle = this.host.addChildLabel(panel, 'LobbyShopSubtitle', subtitleText, 0, titleY - 36 * scale, FONT.subtitle * scale, rgba(212, 190, 150, 235), new Size(panelW * 0.82, 24 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;
    if (state.notice) {
      const notice = this.host.addChildLabel(panel, 'LobbyShopNotice', state.notice, 0, titleY - 62 * scale, FONT.small * scale, state.notice.includes('失败') || state.notice.includes('不足') ? rgba(255, 150, 130) : rgba(160, 240, 170), new Size(panelW * 0.84, 22 * scale));
      notice.overflow = Label.Overflow.SHRINK;
    }

    const profile = this.host.currentLobbyProfile();
    const gold = catalog ? Number(catalog.gold ?? 0) : Number(profile.gold ?? 0);
    const diamond = catalog ? Number(catalog.diamond ?? 0) : Number(profile.diamond ?? 0);
    const stamina = catalog ? catalog.stamina : profile.stamina;
    const maxStamina = catalog ? catalog.maxStamina : profile.maxStamina;
    const footer = this.host.addChildLabel(panel, 'LobbyShopFooter', `当前:金币 ${this.host.formatInteger(gold)} · 钻石 ${this.host.formatInteger(diamond)} · 体力 ${stamina}/${maxStamina}`, 0, -panelH / 2 + 74 * scale, FONT.body * scale, rgba(226, 212, 182, 240), new Size(panelW * 0.84, 24 * scale));
    footer.overflow = Label.Overflow.SHRINK;

    const bodyTop = panelH / 2 - HEADER_H * scale;
    const bodyBottom = -panelH / 2 + FOOTER_H * scale;
    if (!catalog) {
      this.host.addChildLabel(panel, 'LobbyShopLoading', state.loading ? '商店读取中…' : '商店暂不可用', 0, (bodyTop + bodyBottom) / 2, FONT.body * scale, rgba(200, 186, 160), new Size(panelW * 0.6, 26 * scale));
      return;
    }
    if (state.kind === 'gold') {
      this.renderGoldTiers(panel, catalog, panelW, bodyTop, bodyBottom, scale, state.busy, diamond);
    } else if (state.kind === 'stamina') {
      this.renderStamina(panel, catalog, panelW, bodyTop, bodyBottom, scale, state.busy, diamond);
    } else {
      this.renderRechargeTiers(panel, catalog, panelW, bodyTop, bodyBottom, scale, state.busy);
    }
    if (state.busy) {
      const cover = this.host.addChildPlainNode(panel, 'LobbyShopBusy', 0, 0, panelW, panelH);
      cover.addComponent(BlockInputEvents);
      const busyLabel = this.host.addChildLabel(cover, 'LobbyShopBusyText', '处理中…', 0, (bodyTop + bodyBottom) / 2, FONT.big * scale, rgba(255, 238, 190), new Size(panelW * 0.5, 34 * scale));
      this.outline(busyLabel, scale, rgba(0, 0, 0, 255));
    }
  }

  /** 各页内容区需要的高度(决定面板高度):金币一排 4 卡;体力 两卡 + 左侧状态;充值 3×2 两排。 */
  private contentHeight(kind: LobbyShopKind, catalog: ShopCatalogVO | null, scale: number): number {
    if (!catalog) {
      return 220 * scale;
    }
    if (kind === 'gold') {
      return 210 * scale * TALLEST_FRAME + 24 * scale;
    }
    if (kind === 'stamina') {
      return 190 * scale * TALLEST_FRAME + 70 * scale;
    }
    const rows = Math.ceil(catalog.rechargeTiers.length / 3);
    return rows * 196 * scale * TALLEST_FRAME + (rows - 1) * 18 * scale + 24 * scale;
  }

  // ── 金币:4 档一排 ──
  private renderGoldTiers(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean, diamond: number): void {
    const tiers = catalog.goldTiers;
    const grid = this.tierGrid(panelW, top, bottom, scale, tiers.length, tiers.length, 210 * scale);
    tiers.forEach((tier, index) => {
      const slot = grid.slots[index];
      const affordable = diamond >= tier.diamondCost;
      this.buildTierCard(panel, `LobbyShopGold_${tier.code}`, slot.x, slot.y, grid.cardW, TIER_FRAMES[Math.min(index, TIER_FRAMES.length - 1)], scale, {
        name: tier.name,
        iconKey: tier.iconKey,
        amount: this.host.formatInteger(tier.goldAmount),
        unit: '金币',
        amountColor: rgba(255, 214, 110),
        bonus: tier.bonusPct > 0 ? `含赠送 +${tier.bonusPct}%` : '',
        price: `${this.host.formatInteger(tier.diamondCost)} 钻石`,
        enabled: !busy,
        dimmed: !affordable,
        onTap: (from) => this.host.buyShopGold(tier.code, from),
      });
    });
  }

  // ── 体力:左侧当前体力 + 回复进度,右侧 1 份 / 5 份两张卡 ──
  private renderStamina(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean, diamond: number): void {
    const offer = catalog.staminaOffer;
    const remaining = Math.max(0, offer.dailyLimit - offer.usedToday);
    const centerY = (top + bottom) / 2;
    // 左栏:药剂 + 数值 + 进度条 + 说明
    const leftX = -panelW * 0.25;
    const iconBox = Math.min(150 * scale, (top - bottom) * 0.4);
    this.fitSprite(panel, 'LobbyShopStaminaIcon', ICONS.stamina, leftX, centerY + 78 * scale, iconBox);
    const value = this.host.addChildLabel(panel, 'LobbyShopStaminaValue', `体力 ${catalog.stamina}/${catalog.maxStamina}`, leftX, centerY - 26 * scale, FONT.big * scale, rgba(140, 230, 255), new Size(panelW * 0.4, 32 * scale));
    this.outline(value, scale, rgba(10, 30, 50, 255));
    const barW = Math.min(250 * scale, panelW * 0.36);
    const barH = 16 * scale;
    const bar = this.host.addChildPlainNode(panel, 'LobbyShopStaminaBar', leftX, centerY - 58 * scale, barW, barH);
    const bg = bar.addComponent(Graphics);
    bg.fillColor = rgba(14, 18, 26, 240);
    bg.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    bg.fill();
    const ratio = Math.max(0, Math.min(1, catalog.maxStamina > 0 ? catalog.stamina / catalog.maxStamina : 0));
    if (ratio > 0) {
      bg.fillColor = rgba(90, 200, 250, 250);
      bg.roundRect(-barW / 2, -barH / 2, Math.max(barH, barW * ratio), barH, barH / 2);
      bg.fill();
    }
    bg.strokeColor = rgba(150, 190, 230, 200);
    bg.lineWidth = Math.max(1, 1.4 * scale);
    bg.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    bg.stroke();
    const notes = ['每 5 分钟自然回复 1 点(上限内)', '购买的体力可超过上限,超出部分不会消失'];
    notes.forEach((text, index) => {
      const note = this.host.addChildLabel(panel, `LobbyShopStaminaNote_${index}`, text, leftX, centerY - (90 + index * 26) * scale, FONT.small * scale, rgba(206, 194, 168), new Size(panelW * 0.42, 22 * scale));
      note.overflow = Label.Overflow.SHRINK;
    });
    // 右栏:两张购买卡(1 份 / 5 份)
    const rightX = panelW * 0.2;
    const packs = [1, offer.maxCountPerBuy].filter((count, index, all) => count >= 1 && all.indexOf(count) === index);
    const grid = this.tierGrid(panelW * 0.5, top, bottom, scale, packs.length, packs.length, 190 * scale);
    packs.forEach((count, index) => {
      const slot = grid.slots[index];
      const cost = offer.diamondCost * count;
      const sellable = offer.dailyLimit > 0 && count <= remaining;
      this.buildTierCard(panel, `LobbyShopStaminaBuy_${count}`, rightX + slot.x, slot.y + 14 * scale, grid.cardW, TIER_FRAMES[index === 0 ? 1 : 2], scale, {
        name: `补充 ${count} 份`,
        iconKey: 'stamina',
        amount: `+${offer.staminaGain * count}`,
        unit: '体力',
        amountColor: rgba(140, 230, 255),
        bonus: '',
        price: offer.dailyLimit <= 0 ? '暂未开放' : sellable ? `${this.host.formatInteger(cost)} 钻石` : '今日已达上限',
        enabled: !busy && sellable,
        dimmed: !sellable || diamond < cost,
        badge: count > 1 ? `×${count}` : undefined,
        onTap: (from) => this.host.buyShopStamina(count, from),
      });
    });
    const quotaText = offer.dailyLimit > 0 ? `今日已购 ${offer.usedToday}/${offer.dailyLimit} 次 · 还可购买 ${remaining} 次` : '体力购买暂未开放';
    const quota = this.host.addChildLabel(panel, 'LobbyShopStaminaQuota', quotaText, rightX, grid.slots[0].y + 14 * scale - (grid.cardW * TALLEST_FRAME) / 2 - 22 * scale, FONT.small * scale, remaining > 0 ? rgba(206, 194, 168) : rgba(255, 170, 150), new Size(panelW * 0.46, 22 * scale));
    quota.overflow = Label.Overflow.SHRINK;
  }

  // ── 钻石充值:6 档 3×2,图标 少量 → 中量 → 大量 → 宝箱 ──
  private renderRechargeTiers(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean): void {
    const tiers = catalog.rechargeTiers;
    const grid = this.tierGrid(panelW, top, bottom, scale, tiers.length, 3, 196 * scale);
    const frameByIndex = [0, 0, 1, 2, 2, 3];
    tiers.forEach((tier, index) => {
      const slot = grid.slots[index];
      const price = Number(tier.priceCny ?? 0);
      this.buildTierCard(panel, `LobbyShopRecharge_${tier.code}`, slot.x, slot.y, grid.cardW, TIER_FRAMES[frameByIndex[index] ?? 3], scale, {
        name: tier.name,
        iconKey: tier.iconKey,
        amount: this.host.formatInteger(tier.diamondTotal),
        unit: '钻石',
        amountColor: rgba(170, 215, 255),
        bonus: tier.diamondBonus > 0 ? `含赠送 +${this.host.formatInteger(tier.diamondBonus)}` : '',
        price: `¥ ${Number.isInteger(price) ? price : price.toFixed(2)}`,
        enabled: !busy && catalog.mockPay,
        dimmed: !catalog.mockPay,
        onTap: (from) => this.host.rechargeShopDiamond(tier.code, from),
      });
    });
  }

  /** 网格排版:perRow 张一排,超出换行;卡宽受 maxCardW、一排可用宽、可用高(全部行)三者约束;整体在内容区居中。 */
  private tierGrid(areaW: number, top: number, bottom: number, scale: number, count: number, perRow: number, maxCardW: number): { cardW: number; slots: Array<{ x: number; y: number }> } {
    const gap = Math.min(18 * scale, areaW * 0.02);
    const rowGap = 18 * scale;
    const rows = Math.max(1, Math.ceil(count / perRow));
    const available = areaW - 96 * scale;
    let cardW = Math.min(maxCardW, (available - gap * (perRow - 1)) / perRow);
    const bodyH = top - bottom;
    const rowsH = (rowsCount: number, width: number): number => rowsCount * width * TALLEST_FRAME + (rowsCount - 1) * rowGap;
    if (rowsH(rows, cardW) > bodyH * 0.98) {
      cardW = ((bodyH * 0.98) - (rows - 1) * rowGap) / (rows * TALLEST_FRAME);
    }
    const cardH = cardW * TALLEST_FRAME;
    const totalH = rowsH(rows, cardW);
    const centerY = (top + bottom) / 2;
    const slots: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / perRow);
      const inRow = Math.min(perRow, count - row * perRow);
      const col = index % perRow;
      const rowW = inRow * cardW + (inRow - 1) * gap;
      slots.push({
        x: -rowW / 2 + cardW / 2 + col * (cardW + gap),
        y: centerY + totalH / 2 - cardH / 2 - row * (cardH + rowGap),
      });
    }
    return { cardW, slots };
  }

  private buildTierCard(parent: Node, name: string, x: number, y: number, cardW: number, frame: SpriteSpec, scale: number, spec: TierCardSpec): void {
    const cardH = cardW * frame.aspect;
    const card = this.host.addChildPlainNode(parent, name, x, y, cardW, cardH);
    const bg = card.addComponent(Graphics);
    bg.fillColor = rgba(12, 10, 14, 230);
    bg.roundRect(-cardW / 2 + 6 * scale, -cardH / 2 + 6 * scale, cardW - 12 * scale, cardH - 12 * scale, 10 * scale);
    bg.fill();
    this.host.addSprite(`${name}Frame`, frame.path, 0, 0, cardW, cardH, card);
    const inner = cardW * 0.86;
    const nameLabel = this.host.addChildLabel(card, `${name}Name`, spec.name, 0, cardH * 0.40, FONT.cardName * scale, rgba(255, 238, 190), new Size(inner, 26 * scale));
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.outline(nameLabel, scale, rgba(20, 10, 6, 255));
    const iconBox = cardW * 0.54;
    this.addTierIcon(card, `${name}Icon`, spec.iconKey, 0, cardH * 0.12, iconBox);
    if (spec.badge) {
      const badge = this.host.addChildLabel(card, `${name}Badge`, spec.badge, iconBox * 0.42, cardH * 0.12 + iconBox * 0.34, FONT.cardName * scale, rgba(255, 238, 150), new Size(iconBox * 0.6, 26 * scale));
      badge.isBold = true;
      this.outline(badge, scale, rgba(20, 10, 6, 255));
    }
    const amount = this.host.addChildLabel(card, `${name}Amount`, spec.amount, 0, -cardH * 0.14, FONT.amount * scale, spec.amountColor, new Size(inner, 34 * scale));
    amount.overflow = Label.Overflow.SHRINK;
    amount.isBold = true;
    this.outline(amount, scale, rgba(20, 10, 6, 255));
    const unit = this.host.addChildLabel(card, `${name}Unit`, spec.unit, 0, -cardH * 0.245, FONT.unit * scale, rgba(226, 212, 182), new Size(inner, 22 * scale));
    unit.overflow = Label.Overflow.SHRINK;
    if (spec.bonus) {
      const bonus = this.host.addChildLabel(card, `${name}Bonus`, spec.bonus, 0, -cardH * 0.325, FONT.bonus * scale, rgba(150, 235, 160), new Size(inner, 20 * scale));
      bonus.overflow = Label.Overflow.SHRINK;
    }
    const buttonW = cardW * 0.84;
    const buttonH = buttonW * BUY_BUTTON.aspect;
    const button = this.host.addChildPlainNode(card, `${name}Buy`, 0, -cardH / 2 + buttonH / 2 + cardH * 0.06, buttonW, buttonH);
    this.host.addSprite(`${name}BuyArt`, BUY_BUTTON.path, 0, 0, buttonW, buttonH, button);
    const priceLabel = this.host.addChildLabel(button, `${name}Price`, spec.price, 0, 1 * scale, FONT.price * scale, rgba(255, 238, 190), new Size(buttonW * 0.86, buttonH * 0.8));
    priceLabel.overflow = Label.Overflow.SHRINK;
    this.outline(priceLabel, scale, rgba(60, 10, 6, 255));
    if (spec.dimmed) {
      const opacity = card.addComponent(UIOpacity);
      opacity.opacity = 150;
    }
    if (spec.enabled && spec.onTap) {
      const onTap = spec.onTap;
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, () => onTap(card.getWorldPosition()), this);
      this.host.applyImageButtonFeedback(card, 1.03, 0.97);
    }
  }

  /** 档位图标:金币四档各一张图;钻石按数量用同一颗钻石组合成 1/3/5 颗,宝箱档=宝箱 + 钻石角标(纯显示组合,不改素材)。 */
  private addTierIcon(parent: Node, name: string, iconKey: string, cx: number, cy: number, box: number): void {
    const single = ICONS[iconKey];
    if (single) {
      this.fitSprite(parent, name, single, cx, cy, box * 0.86);
      return;
    }
    const gem = ICONS.diamond;
    if (iconKey === 'diamond_few') {
      this.fitSprite(parent, name, gem, cx, cy, box * 0.72);
      return;
    }
    if (iconKey === 'diamond_some') {
      this.fitSprite(parent, `${name}_l`, gem, cx - box * 0.24, cy - box * 0.14, box * 0.42);
      this.fitSprite(parent, `${name}_r`, gem, cx + box * 0.24, cy - box * 0.14, box * 0.42);
      this.fitSprite(parent, `${name}_c`, gem, cx, cy + box * 0.08, box * 0.6);
      return;
    }
    if (iconKey === 'diamond_many') {
      this.fitSprite(parent, `${name}_1`, gem, cx - box * 0.3, cy - box * 0.2, box * 0.36);
      this.fitSprite(parent, `${name}_2`, gem, cx + box * 0.3, cy - box * 0.2, box * 0.36);
      this.fitSprite(parent, `${name}_3`, gem, cx - box * 0.26, cy + box * 0.18, box * 0.34);
      this.fitSprite(parent, `${name}_4`, gem, cx + box * 0.26, cy + box * 0.18, box * 0.34);
      this.fitSprite(parent, `${name}_c`, gem, cx, cy, box * 0.58);
      return;
    }
    if (iconKey === 'diamond_chest') {
      this.fitSprite(parent, `${name}_chest`, ICONS.chest, cx, cy - box * 0.04, box * 0.92);
      this.fitSprite(parent, `${name}_gem`, gem, cx + box * 0.27, cy + box * 0.26, box * 0.36);
      return;
    }
    this.fitSprite(parent, name, gem, cx, cy, box * 0.7);
  }

  private fitSprite(parent: Node, name: string, spec: SpriteSpec, cx: number, cy: number, box: number): void {
    const width = spec.aspect >= 1 ? box / spec.aspect : box;
    const height = spec.aspect >= 1 ? box : box * spec.aspect;
    this.host.addSprite(name, spec.path, cx, cy, width, height, parent);
  }

  private outline(label: Label, scale: number, color: Color): void {
    label.enableOutline = true;
    label.outlineColor = color;
    label.outlineWidth = Math.max(1, 2 * scale);
  }
}
