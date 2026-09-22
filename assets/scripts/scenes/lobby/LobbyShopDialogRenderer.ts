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
import type { ShopCatalogVO, ShopGoldTierVO, ShopRechargeTierVO } from '../../types/ShopTypes';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 货币商店弹窗(2026-09-22 用户拍板"你来设计",docs/33):
 * - 金币:点顶部金币打开;4 档钻石→金币,图标 单枚金币 → 一堆 → 金币山 → 金币宝箱 递进,档位越高赠送越多。
 * - 体力:点顶部体力打开;60 钻 = 30 体力,每日限次,可超上限。
 * - 钻石:点顶部钻石打开;6 档人民币→钻石,图标 少量 → 中量 → 大量 → 钻石宝箱 递进;支付渠道未接入时只预览。
 * 作为全屏覆盖层挂在当前视图之上(大厅 / 锻造等功能页都能开),数据与写入全走服务端 ShopApi。
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
  buyShopGold(tierCode: string): void;
  buyShopStamina(count: number): void;
  rechargeShopDiamond(tierCode: string): void;
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

    // 4:3 素材按高定尺寸(占舞台高 ≤ 92%),宽度放不下时再按宽反推,始终等比。
    let panelH = Math.min(layout.stageHeight * 0.92, 790 * scale);
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

    const catalog = state.catalog;
    // 标题压到顶饰之下,两侧任务页同款 title_divider 饰件(与守卫战弹层一致)。
    const titleY = panelH / 2 - 112 * scale;
    const titleSize = 27 * scale;
    const title = this.host.addChildLabel(panel, 'LobbyShopTitle', TITLE[state.kind], 0, titleY, titleSize, rgba(255, 226, 150), new Size(panelW * 0.6, 34 * scale));
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
    const subtitle = this.host.addChildLabel(panel, 'LobbyShopSubtitle', subtitleText, 0, titleY - 32 * scale, 15 * scale, rgba(212, 190, 150, 235), new Size(panelW * 0.8, 20 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;
    if (state.notice) {
      const notice = this.host.addChildLabel(panel, 'LobbyShopNotice', state.notice, 0, titleY - 54 * scale, 14 * scale, state.notice.includes('失败') || state.notice.includes('不足') ? rgba(255, 150, 130) : rgba(160, 240, 170), new Size(panelW * 0.84, 18 * scale));
      notice.overflow = Label.Overflow.SHRINK;
    }

    const profile = this.host.currentLobbyProfile();
    const gold = catalog ? Number(catalog.gold ?? 0) : Number(profile.gold ?? 0);
    const diamond = catalog ? Number(catalog.diamond ?? 0) : Number(profile.diamond ?? 0);
    const stamina = catalog ? catalog.stamina : profile.stamina;
    const maxStamina = catalog ? catalog.maxStamina : profile.maxStamina;
    const footer = this.host.addChildLabel(panel, 'LobbyShopFooter', `当前:金币 ${this.host.formatInteger(gold)} · 钻石 ${this.host.formatInteger(diamond)} · 体力 ${stamina}/${maxStamina}`, 0, -panelH / 2 + 72 * scale, 15 * scale, rgba(226, 212, 182, 240), new Size(panelW * 0.8, 20 * scale));
    footer.overflow = Label.Overflow.SHRINK;

    const bodyTop = titleY - 78 * scale;
    const bodyBottom = -panelH / 2 + 96 * scale;
    if (!catalog) {
      this.host.addChildLabel(panel, 'LobbyShopLoading', state.loading ? '商店读取中…' : '商店暂不可用', 0, (bodyTop + bodyBottom) / 2, 18 * scale, rgba(200, 186, 160), new Size(panelW * 0.6, 24 * scale));
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
      const busyLabel = this.host.addChildLabel(cover, 'LobbyShopBusyText', '处理中…', 0, (bodyTop + bodyBottom) / 2, 22 * scale, rgba(255, 238, 190), new Size(panelW * 0.5, 30 * scale));
      this.outline(busyLabel, scale, rgba(0, 0, 0, 255));
    }
  }

  // ── 金币:4 档横排 ──
  private renderGoldTiers(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean, diamond: number): void {
    const tiers = catalog.goldTiers;
    const layout = this.tierLayout(panelW, top, bottom, scale, tiers.length, 200 * scale);
    tiers.forEach((tier, index) => {
      const x = layout.startX + index * (layout.cardW + layout.gap);
      const affordable = diamond >= tier.diamondCost;
      this.buildTierCard(panel, `LobbyShopGold_${tier.code}`, x, layout.centerY, layout.cardW, TIER_FRAMES[Math.min(index, TIER_FRAMES.length - 1)], scale, {
        name: tier.name,
        iconKey: tier.iconKey,
        amount: this.host.formatInteger(tier.goldAmount),
        unit: '金币',
        amountColor: rgba(255, 214, 110),
        bonus: tier.bonusPct > 0 ? `含赠送 +${tier.bonusPct}%` : '',
        price: `${this.host.formatInteger(tier.diamondCost)} 钻石`,
        enabled: !busy,
        dimmed: !affordable,
        onTap: () => this.host.buyShopGold(tier.code),
      });
    });
  }

  // ── 体力:左卡片 + 右说明与购买按钮 ──
  private renderStamina(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean, diamond: number): void {
    const offer = catalog.staminaOffer;
    const remaining = Math.max(0, offer.dailyLimit - offer.usedToday);
    const bodyH = top - bottom;
    const frame = TIER_FRAMES[1];
    const cardW = Math.min(236 * scale, (bodyH * 0.96) / frame.aspect);
    const cardX = -panelW * 0.24;
    this.buildTierCard(panel, 'LobbyShopStaminaCard', cardX, (top + bottom) / 2, cardW, frame, scale, {
      name: '体力补充',
      iconKey: 'stamina',
      amount: `+${offer.staminaGain}`,
      unit: '体力 / 份',
      amountColor: rgba(140, 230, 255),
      bonus: offer.dailyLimit > 0 ? `今日 ${offer.usedToday}/${offer.dailyLimit} 次` : '暂未开放',
      price: `${this.host.formatInteger(offer.diamondCost)} 钻石 / 份`,
      enabled: false,
      dimmed: false,
      onTap: null,
    });
    const infoX = panelW * 0.14;
    const infoW = panelW * 0.5;
    const lines = [
      `当前体力 ${catalog.stamina}/${catalog.maxStamina}`,
      '每 5 分钟自然回复 1 点(上限内)',
      '购买的体力可超过上限,超出部分不会消失',
      offer.dailyLimit > 0 ? `每日最多购买 ${offer.dailyLimit} 次,今日还可购买 ${remaining} 次` : '体力购买暂未开放',
    ];
    lines.forEach((text, index) => {
      const label = this.host.addChildLabel(panel, `LobbyShopStaminaLine_${index}`, text, infoX, top - (18 + index * 26) * scale, index === 0 ? 19 * scale : 15 * scale, index === 0 ? rgba(255, 238, 190) : rgba(206, 194, 168), new Size(infoW, 24 * scale), HorizontalTextAlignment.CENTER);
      label.overflow = Label.Overflow.SHRINK;
    });
    const buttonW = Math.min(250 * scale, infoW * 0.8);
    const buttonH = buttonW * BUY_BUTTON.aspect;
    const buttonsTop = top - 132 * scale;
    const packs = [1, Math.min(offer.maxCountPerBuy, remaining)].filter((count, index, all) => count >= 1 && all.indexOf(count) === index);
    packs.forEach((count, index) => {
      const cost = offer.diamondCost * count;
      const enabled = !busy && offer.dailyLimit > 0 && count <= remaining;
      const text = offer.dailyLimit <= 0 ? '暂未开放' : remaining <= 0 ? '今日已达上限' : `购买 ${count} 份 · ${this.host.formatInteger(cost)} 钻`;
      this.buildBuyButton(panel, `LobbyShopStaminaBuy_${count}`, infoX, buttonsTop - index * (buttonH + 14 * scale), buttonW, scale, text, enabled, diamond < cost, () => this.host.buyShopStamina(count));
    });
  }

  // ── 钻石充值:6 档横排,图标 少量 → 中量 → 大量 → 宝箱 ──
  private renderRechargeTiers(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean): void {
    const tiers = catalog.rechargeTiers;
    const layout = this.tierLayout(panelW, top, bottom, scale, tiers.length, 150 * scale);
    const frameByIndex = [0, 0, 1, 2, 2, 3];
    tiers.forEach((tier, index) => {
      const x = layout.startX + index * (layout.cardW + layout.gap);
      const price = Number(tier.priceCny ?? 0);
      this.buildTierCard(panel, `LobbyShopRecharge_${tier.code}`, x, layout.centerY, layout.cardW, TIER_FRAMES[frameByIndex[index] ?? 3], scale, {
        name: tier.name,
        iconKey: tier.iconKey,
        amount: this.host.formatInteger(tier.diamondTotal),
        unit: '钻石',
        amountColor: rgba(170, 215, 255),
        bonus: tier.diamondBonus > 0 ? `含赠送 +${this.host.formatInteger(tier.diamondBonus)}` : '',
        price: `¥ ${Number.isInteger(price) ? price : price.toFixed(2)}`,
        enabled: !busy && catalog.mockPay,
        dimmed: !catalog.mockPay,
        onTap: () => this.host.rechargeShopDiamond(tier.code),
      });
    });
  }

  private tierLayout(panelW: number, top: number, bottom: number, scale: number, count: number, maxCardW: number): { cardW: number; gap: number; startX: number; centerY: number } {
    const gap = Math.min(16 * scale, panelW * 0.016);
    const available = panelW - 96 * scale;
    let cardW = Math.min(maxCardW, (available - gap * (count - 1)) / count);
    const bodyH = top - bottom;
    const tallest = Math.max(...TIER_FRAMES.map((frame) => frame.aspect));
    if (cardW * tallest > bodyH * 0.98) {
      cardW = (bodyH * 0.98) / tallest;
    }
    const totalW = cardW * count + gap * (count - 1);
    return { cardW, gap, startX: -totalW / 2 + cardW / 2, centerY: (top + bottom) / 2 };
  }

  private buildTierCard(
    parent: Node,
    name: string,
    x: number,
    y: number,
    cardW: number,
    frame: SpriteSpec,
    scale: number,
    spec: { name: string; iconKey: string; amount: string; unit: string; amountColor: Color; bonus: string; price: string; enabled: boolean; dimmed: boolean; onTap: (() => void) | null },
  ): void {
    const cardH = cardW * frame.aspect;
    const card = this.host.addChildPlainNode(parent, name, x, y, cardW, cardH);
    const bg = card.addComponent(Graphics);
    bg.fillColor = rgba(12, 10, 14, 230);
    bg.roundRect(-cardW / 2 + 6 * scale, -cardH / 2 + 6 * scale, cardW - 12 * scale, cardH - 12 * scale, 10 * scale);
    bg.fill();
    this.host.addSprite(`${name}Frame`, frame.path, 0, 0, cardW, cardH, card);
    const inner = cardW * 0.84;
    const nameLabel = this.host.addChildLabel(card, `${name}Name`, spec.name, 0, cardH * 0.40, Math.round(cardW * 0.085), rgba(255, 238, 190), new Size(inner, cardW * 0.12));
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.outline(nameLabel, scale, rgba(20, 10, 6, 255));
    this.addTierIcon(card, `${name}Icon`, spec.iconKey, 0, cardH * 0.11, cardW * 0.56);
    const amount = this.host.addChildLabel(card, `${name}Amount`, spec.amount, 0, -cardH * 0.15, Math.round(cardW * 0.125), spec.amountColor, new Size(inner, cardW * 0.16));
    amount.overflow = Label.Overflow.SHRINK;
    this.outline(amount, scale, rgba(20, 10, 6, 255));
    const unit = this.host.addChildLabel(card, `${name}Unit`, spec.unit, 0, -cardH * 0.245, Math.round(cardW * 0.07), rgba(226, 212, 182), new Size(inner, cardW * 0.1));
    unit.overflow = Label.Overflow.SHRINK;
    if (spec.bonus) {
      const bonus = this.host.addChildLabel(card, `${name}Bonus`, spec.bonus, 0, -cardH * 0.325, Math.round(cardW * 0.066), rgba(150, 235, 160), new Size(inner, cardW * 0.1));
      bonus.overflow = Label.Overflow.SHRINK;
    }
    const buttonW = cardW * 0.82;
    const buttonH = buttonW * BUY_BUTTON.aspect;
    const button = this.host.addChildPlainNode(card, `${name}Buy`, 0, -cardH / 2 + buttonH / 2 + cardH * 0.06, buttonW, buttonH);
    this.host.addSprite(`${name}BuyArt`, BUY_BUTTON.path, 0, 0, buttonW, buttonH, button);
    const priceLabel = this.host.addChildLabel(button, `${name}Price`, spec.price, 0, 1 * scale, Math.round(cardW * 0.078), rgba(255, 238, 190), new Size(buttonW * 0.86, buttonH * 0.8));
    priceLabel.overflow = Label.Overflow.SHRINK;
    this.outline(priceLabel, scale, rgba(60, 10, 6, 255));
    if (spec.dimmed) {
      const opacity = card.addComponent(UIOpacity);
      opacity.opacity = 150;
    }
    if (spec.enabled && spec.onTap) {
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, spec.onTap, this);
      this.host.applyImageButtonFeedback(card, 1.03, 0.97);
    }
  }

  private buildBuyButton(parent: Node, name: string, x: number, y: number, width: number, scale: number, text: string, enabled: boolean, short: boolean, onTap: () => void): void {
    const height = width * BUY_BUTTON.aspect;
    const button = this.host.addChildPlainNode(parent, name, x, y, width, height);
    this.host.addSprite(`${name}Art`, BUY_BUTTON.path, 0, 0, width, height, button);
    const label = this.host.addChildLabel(button, `${name}Label`, text, 0, 1 * scale, 17 * scale, enabled ? rgba(255, 238, 190) : rgba(200, 180, 150), new Size(width * 0.86, height * 0.8));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, rgba(60, 10, 6, 255));
    if (!enabled) {
      const opacity = button.addComponent(UIOpacity);
      opacity.opacity = 150;
      return;
    }
    if (short) {
      // 钻石不够也允许点:服务端会回"钻石不足",顺手把差额提示给玩家。
      const opacity = button.addComponent(UIOpacity);
      opacity.opacity = 210;
    }
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, onTap, this);
    this.host.applyImageButtonFeedback(button, 1.04, 0.96);
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
