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
 * 面板底与守卫战各弹层同款素净框(4:3),尺寸同时满足内容宽与内容高(2026-09-23 用户反馈"过于紧凑":卡距/边距放宽,卡内加光晕、赠送标签,
 * 价格带钻石图标,底部余额改成货币胶囊);字号按限时副本面板口径(标题 34、正文 18、卡名 20、数额 28)。
 * 作为全屏覆盖层挂在当前视图之上(大厅 / 锻造等功能页都能开),数据与写入全走服务端 ShopApi;购买成功由根节点做飘字 + 飞币动效。
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
  /** fromWorld=被点卡片的世界坐标,成功后动效从这里起飞。 */
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
/** 底部余额胶囊(与顶部货币栏同款素材,已裁短 280×91)。 */
const CURRENCY_CAPSULE: SpriteSpec = { path: 'ui/common/ai/bag_currency_bar/spriteFrame', aspect: 91 / 280 };
/** 档位卡框:绿 → 蓝 → 紫 → 橙(现成抽卡框,只能等比);tint 用于卡内光晕与上半区淡染。 */
const TIER_FRAMES: Array<SpriteSpec & { tint: [number, number, number] }> = [
  { path: 'ui/gacha/ai/green/spriteFrame', aspect: 416 / 294, tint: [120, 210, 110] },
  { path: 'ui/gacha/ai/blue/spriteFrame', aspect: 419 / 293, tint: [110, 175, 255] },
  { path: 'ui/gacha/ai/purple/spriteFrame', aspect: 421 / 299, tint: [205, 135, 255] },
  { path: 'ui/gacha/ai/orange/spriteFrame', aspect: 422 / 299, tint: [255, 185, 80] },
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
const FONT = { title: 34, subtitle: 18, body: 18, small: 16, cardName: 20, amount: 28, unit: 16, tag: 15, price: 20, big: 26 };
/** 面板顶边 → 内容区顶 / 内容区底 → 面板底边 的固定留白(含标题、副标题、余额胶囊)。 */
const HEADER_H = 206;
const FOOTER_H = 138;
/** 内容区左右各留的边距(2026-09-23 放宽)。 */
const SIDE_PAD = 80;
/** 卡片框最高的高宽比(排版预留)。 */
const TALLEST_FRAME = Math.max(...TIER_FRAMES.map((frame) => frame.aspect));
/** 各页卡宽上限与每排张数。 */
const CARD_W = { gold: 224, stamina: 196, diamond: 210 };
const GAP = { col: 32, row: 26 };

interface TierCardSpec {
  name: string;
  iconKey: string;
  amount: string;
  unit: string;
  amountColor: Color;
  /** 赠送标签(空=不显示);highlight=金色"最划算"样式。 */
  tag: string;
  tagHighlight?: boolean;
  /** 价格文字;priceIcon 有值时价格前带图标(钻石)。 */
  price: string;
  priceIcon?: SpriteSpec;
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

    // 面板尺寸同时满足内容宽(卡片一排铺开 + 边距)与内容高(标题区 + 卡片 + 余额区),4:3 等比;超出舞台再按舞台收。
    const catalog = state.catalog;
    const need = this.contentNeeds(state.kind, catalog, scale);
    let panelW = Math.max(need.w + SIDE_PAD * 2 * scale, (need.h + (HEADER_H + FOOTER_H) * scale) / PANEL_FRAME.aspect);
    let panelH = panelW * PANEL_FRAME.aspect;
    if (panelH > layout.stageHeight * 0.9) {
      panelH = layout.stageHeight * 0.9;
      panelW = panelH / PANEL_FRAME.aspect;
    }
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

    // 底部余额:货币胶囊(金币 / 钻石;体力页再加体力),替代原来的一行小字。
    const profile = this.host.currentLobbyProfile();
    const gold = catalog ? Number(catalog.gold ?? 0) : Number(profile.gold ?? 0);
    const diamond = catalog ? Number(catalog.diamond ?? 0) : Number(profile.diamond ?? 0);
    const stamina = catalog ? catalog.stamina : profile.stamina;
    const maxStamina = catalog ? catalog.maxStamina : profile.maxStamina;
    const chips: Array<{ key: string; icon: SpriteSpec; value: string }> = [
      { key: 'gold', icon: ICONS.gold_small, value: this.host.formatInteger(gold) },
      { key: 'diamond', icon: ICONS.diamond, value: this.host.formatInteger(diamond) },
    ];
    if (state.kind === 'stamina') {
      chips.push({ key: 'stamina', icon: ICONS.stamina, value: `${stamina}/${maxStamina}` });
    }
    const chipW = 172 * scale;
    const chipGap = 22 * scale;
    const chipsW = chips.length * chipW + (chips.length - 1) * chipGap;
    const chipY = -panelH / 2 + 78 * scale;
    this.host.addChildLabel(panel, 'LobbyShopFooterLabel', '当前持有', -chipsW / 2 - 16 * scale - 40 * scale, chipY, FONT.small * scale, rgba(190, 172, 140, 230), new Size(80 * scale, 22 * scale));
    chips.forEach((chip, index) => {
      this.addCurrencyChip(panel, `LobbyShopFooterChip_${chip.key}`, -chipsW / 2 + chipW / 2 + index * (chipW + chipGap), chipY, chipW, chip.icon, chip.value, scale);
    });

    const bodyTop = panelH / 2 - HEADER_H * scale;
    const bodyBottom = -panelH / 2 + FOOTER_H * scale;
    if (state.notice) {
      // 状态行(购买成功 / 失败)放在卡片行之下、余额胶囊之上,离刚刚点过的卡与变化的余额都近
      const notice = this.host.addChildLabel(panel, 'LobbyShopNotice', state.notice, 0, -panelH / 2 + 160 * scale, FONT.body * scale, state.notice.includes('失败') || state.notice.includes('不足') ? rgba(255, 150, 130) : rgba(160, 240, 170), new Size(panelW * 0.84, 24 * scale));
      notice.overflow = Label.Overflow.SHRINK;
    }
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

  /** 各页内容区需要的宽与高(决定面板尺寸):金币一排 4 卡;体力 左状态 + 右两卡;充值 3×2 两排。 */
  private contentNeeds(kind: LobbyShopKind, catalog: ShopCatalogVO | null, scale: number): { w: number; h: number } {
    if (!catalog) {
      return { w: 760 * scale, h: 220 * scale };
    }
    if (kind === 'gold') {
      const n = Math.max(1, catalog.goldTiers.length);
      return { w: (n * CARD_W.gold + (n - 1) * GAP.col) * scale, h: (CARD_W.gold * TALLEST_FRAME + 40) * scale };
    }
    if (kind === 'stamina') {
      return { w: 940 * scale, h: (CARD_W.stamina * TALLEST_FRAME + 90) * scale };
    }
    const rows = Math.ceil(catalog.rechargeTiers.length / 3);
    return { w: (3 * CARD_W.diamond + 2 * GAP.col) * scale, h: (rows * CARD_W.diamond * TALLEST_FRAME + (rows - 1) * GAP.row + 40) * scale };
  }

  // ── 金币:4 档一排;赠送最高的一档标"最划算" ──
  private renderGoldTiers(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean, diamond: number): void {
    const tiers = catalog.goldTiers;
    const bestBonus = Math.max(0, ...tiers.map((tier) => tier.bonusPct));
    const grid = this.tierGrid(panelW, top, bottom, scale, tiers.length, tiers.length, CARD_W.gold * scale);
    tiers.forEach((tier, index) => {
      const slot = grid.slots[index];
      const affordable = diamond >= tier.diamondCost;
      const best = tier.bonusPct > 0 && tier.bonusPct === bestBonus;
      this.buildTierCard(panel, `LobbyShopGold_${tier.code}`, slot.x, slot.y, grid.cardW, TIER_FRAMES[Math.min(index, TIER_FRAMES.length - 1)], scale, {
        name: tier.name,
        iconKey: tier.iconKey,
        amount: this.host.formatInteger(tier.goldAmount),
        unit: '金币',
        amountColor: rgba(255, 214, 110),
        tag: tier.bonusPct > 0 ? (best ? `最划算 · 赠 ${tier.bonusPct}%` : `赠 ${tier.bonusPct}%`) : '',
        tagHighlight: best,
        price: this.host.formatInteger(tier.diamondCost),
        priceIcon: ICONS.diamond,
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
    this.drawGlow(panel, 'LobbyShopStaminaGlow', leftX, centerY + 78 * scale, iconBox * 0.62, [255, 110, 120], scale);
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
    const grid = this.tierGrid(panelW * 0.5, top, bottom, scale, packs.length, packs.length, CARD_W.stamina * scale);
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
        tag: '',
        price: offer.dailyLimit <= 0 ? '暂未开放' : sellable ? this.host.formatInteger(cost) : '今日已达上限',
        priceIcon: offer.dailyLimit > 0 && sellable ? ICONS.diamond : undefined,
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

  // ── 钻石充值:6 档 3×2,图标 少量 → 中量 → 大量 → 宝箱;赠送最高的一档标"最划算" ──
  private renderRechargeTiers(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean): void {
    const tiers = catalog.rechargeTiers;
    const bestBonus = Math.max(0, ...tiers.map((tier) => tier.diamondBonus));
    const grid = this.tierGrid(panelW, top, bottom, scale, tiers.length, 3, CARD_W.diamond * scale);
    const frameByIndex = [0, 0, 1, 2, 2, 3];
    tiers.forEach((tier, index) => {
      const slot = grid.slots[index];
      const price = Number(tier.priceCny ?? 0);
      const best = tier.diamondBonus > 0 && tier.diamondBonus === bestBonus;
      this.buildTierCard(panel, `LobbyShopRecharge_${tier.code}`, slot.x, slot.y, grid.cardW, TIER_FRAMES[frameByIndex[index] ?? 3], scale, {
        name: tier.name,
        iconKey: tier.iconKey,
        amount: this.host.formatInteger(tier.diamondTotal),
        unit: '钻石',
        amountColor: rgba(170, 215, 255),
        tag: tier.diamondBonus > 0 ? (best ? `最划算 · 赠 ${this.host.formatInteger(tier.diamondBonus)}` : `赠 ${this.host.formatInteger(tier.diamondBonus)}`) : '',
        tagHighlight: best,
        price: `¥ ${Number.isInteger(price) ? price : price.toFixed(2)}`,
        enabled: !busy && catalog.mockPay,
        dimmed: !catalog.mockPay,
        onTap: (from) => this.host.rechargeShopDiamond(tier.code, from),
      });
    });
  }

  /** 网格排版:perRow 张一排,超出换行;卡宽受 maxCardW、一排可用宽、可用高(全部行)三者约束;整体在内容区居中。 */
  private tierGrid(areaW: number, top: number, bottom: number, scale: number, count: number, perRow: number, maxCardW: number): { cardW: number; slots: Array<{ x: number; y: number }> } {
    const gap = GAP.col * scale;
    const rowGap = GAP.row * scale;
    const rows = Math.max(1, Math.ceil(count / perRow));
    const available = areaW - SIDE_PAD * 2 * scale;
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

  /**
   * 单张档位卡:深底 + 档位色上半区淡染 + 素材框(等比)→ 名 → 档位色光晕 + 图标(+角标)→ 数额 → 单位 → 赠送标签 → 价格钮(钻石图标 + 数字)。
   * 纵向按卡高比例定位,赠送标签与价格钮各占自己的带,互不压盖(此前赠送行被价格钮盖住)。
   */
  private buildTierCard(parent: Node, name: string, x: number, y: number, cardW: number, frame: SpriteSpec & { tint: [number, number, number] }, scale: number, spec: TierCardSpec): void {
    const cardH = cardW * frame.aspect;
    const card = this.host.addChildPlainNode(parent, name, x, y, cardW, cardH);
    const bg = card.addComponent(Graphics);
    bg.fillColor = rgba(12, 10, 14, 236);
    bg.roundRect(-cardW / 2 + 6 * scale, -cardH / 2 + 6 * scale, cardW - 12 * scale, cardH - 12 * scale, 10 * scale);
    bg.fill();
    // 上半区档位色淡染(名字带 + 图标区),下半区留深底衬数字
    bg.fillColor = rgba(frame.tint[0], frame.tint[1], frame.tint[2], 26);
    bg.roundRect(-cardW / 2 + 10 * scale, cardH * 0.02, cardW - 20 * scale, cardH * 0.46, 8 * scale);
    bg.fill();
    this.host.addSprite(`${name}Frame`, frame.path, 0, 0, cardW, cardH, card);
    const inner = cardW * 0.86;
    const nameLabel = this.host.addChildLabel(card, `${name}Name`, spec.name, 0, cardH * 0.405, FONT.cardName * scale, rgba(255, 238, 190), new Size(inner, 26 * scale));
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.outline(nameLabel, scale, rgba(20, 10, 6, 255));
    const iconBox = cardW * 0.5;
    const iconY = cardH * 0.155;
    this.drawGlow(card, `${name}Glow`, 0, iconY, iconBox * 0.62, frame.tint, scale);
    this.addTierIcon(card, `${name}Icon`, spec.iconKey, 0, iconY, iconBox);
    if (spec.badge) {
      const badge = this.host.addChildLabel(card, `${name}Badge`, spec.badge, iconBox * 0.42, iconY + iconBox * 0.34, FONT.cardName * scale, rgba(255, 238, 150), new Size(iconBox * 0.6, 26 * scale));
      badge.isBold = true;
      this.outline(badge, scale, rgba(20, 10, 6, 255));
    }
    const amount = this.host.addChildLabel(card, `${name}Amount`, spec.amount, 0, -cardH * 0.085, FONT.amount * scale, spec.amountColor, new Size(inner, 34 * scale));
    amount.overflow = Label.Overflow.SHRINK;
    amount.isBold = true;
    this.outline(amount, scale, rgba(20, 10, 6, 255));
    const unit = this.host.addChildLabel(card, `${name}Unit`, spec.unit, 0, -cardH * 0.175, FONT.unit * scale, rgba(226, 212, 182), new Size(inner, 22 * scale));
    unit.overflow = Label.Overflow.SHRINK;
    if (spec.tag) {
      // 赠送标签:圆角小签,普通=绿,最划算=金
      const tagH = 22 * scale;
      const tagW = Math.min(inner, Math.max(cardW * 0.5, spec.tag.length * FONT.tag * scale * 0.95 + 18 * scale));
      const tag = this.host.addChildPlainNode(card, `${name}Tag`, 0, -cardH * 0.27, tagW, tagH);
      const tg = tag.addComponent(Graphics);
      tg.fillColor = spec.tagHighlight ? rgba(150, 100, 20, 235) : rgba(26, 78, 40, 235);
      tg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, tagH / 2);
      tg.fill();
      tg.strokeColor = spec.tagHighlight ? rgba(255, 214, 110, 250) : rgba(120, 220, 130, 230);
      tg.lineWidth = Math.max(1, 1.3 * scale);
      tg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, tagH / 2);
      tg.stroke();
      const tagLabel = this.host.addChildLabel(tag, `${name}TagText`, spec.tag, 0, 0, FONT.tag * scale, spec.tagHighlight ? rgba(255, 236, 170) : rgba(170, 245, 175), new Size(tagW - 8 * scale, tagH));
      tagLabel.overflow = Label.Overflow.SHRINK;
    }
    const buttonW = cardW * 0.84;
    const buttonH = buttonW * BUY_BUTTON.aspect;
    const button = this.host.addChildPlainNode(card, `${name}Buy`, 0, -cardH / 2 + buttonH / 2 + cardH * 0.055, buttonW, buttonH);
    this.host.addSprite(`${name}BuyArt`, BUY_BUTTON.path, 0, 0, buttonW, buttonH, button);
    if (spec.priceIcon) {
      // 价格 = 钻石图标 + 数字,整体居中
      const priceSize = FONT.price * scale;
      const iconSize = buttonH * 0.62;
      const textW = spec.price.length * priceSize * 0.62;
      const groupW = iconSize + 6 * scale + textW;
      this.fitSprite(button, `${name}PriceIcon`, spec.priceIcon, -groupW / 2 + iconSize / 2, 1 * scale, iconSize);
      const priceLabel = this.host.addChildLabel(button, `${name}Price`, spec.price, -groupW / 2 + iconSize + 6 * scale + textW / 2, 1 * scale, priceSize, rgba(255, 238, 190), new Size(textW + 12 * scale, buttonH * 0.8));
      priceLabel.overflow = Label.Overflow.SHRINK;
      this.outline(priceLabel, scale, rgba(60, 10, 6, 255));
    } else {
      const priceLabel = this.host.addChildLabel(button, `${name}Price`, spec.price, 0, 1 * scale, FONT.price * scale, rgba(255, 238, 190), new Size(buttonW * 0.86, buttonH * 0.8));
      priceLabel.overflow = Label.Overflow.SHRINK;
      this.outline(priceLabel, scale, rgba(60, 10, 6, 255));
    }
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

  /** 图标背后的柔光:三层同心圆递减透明度,档位色。 */
  private drawGlow(parent: Node, name: string, cx: number, cy: number, radius: number, tint: [number, number, number], scale: number): void {
    const glow = this.host.addChildPlainNode(parent, name, cx, cy, radius * 2, radius * 2);
    const g = glow.addComponent(Graphics);
    const layers: Array<[number, number]> = [[1, 20], [0.78, 32], [0.55, 46]];
    for (const [ratio, alpha] of layers) {
      g.fillColor = rgba(tint[0], tint[1], tint[2], alpha);
      g.circle(0, 0, radius * ratio);
      g.fill();
    }
    void scale;
  }

  /** 底部余额胶囊:与顶部货币栏同款(素材已裁短,槽心在宽 17.1% 处,图标高=胶囊高 56%)。 */
  private addCurrencyChip(parent: Node, name: string, x: number, y: number, capWidth: number, icon: SpriteSpec, value: string, scale: number): void {
    const capHeight = capWidth * CURRENCY_CAPSULE.aspect;
    const chip = this.host.addChildPlainNode(parent, name, x, y, capWidth, capHeight);
    if (!this.host.addSprite(`${name}Capsule`, CURRENCY_CAPSULE.path, 0, 0, capWidth, capHeight, chip)) {
      const g = chip.addComponent(Graphics);
      g.fillColor = rgba(12, 10, 10, 190);
      g.roundRect(-capWidth / 2, -capHeight / 2, capWidth, capHeight, capHeight / 2);
      g.fill();
      g.strokeColor = rgba(157, 118, 60, 170);
      g.stroke();
    }
    this.fitSprite(chip, `${name}Icon`, icon, -capWidth / 2 + capWidth * 0.171 + 7 * scale, 0, capHeight * 0.56);
    const label = this.host.addChildLabel(chip, `${name}Value`, value, capWidth * 0.05, 0, FONT.body * scale, rgba(245, 222, 168), new Size(capWidth * 0.52, 22 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 220);
    label.outlineWidth = Math.max(1, 1.4 * scale);
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
