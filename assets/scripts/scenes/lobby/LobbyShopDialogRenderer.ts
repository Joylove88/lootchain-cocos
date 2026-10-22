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
  UIOpacity,
  UITransform,
  Vec3,
  tween,
} from 'cc';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { ShopCatalogVO, ShopPayMode, ShopRechargeChannelVO } from '../../types/ShopTypes';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { addPhoneDialogTitle, drawPhoneDialogFrame, resolvePhoneDialogSize } from './LobbyPhoneDialogFrame';
import { renderTopCurrencyBar, type SceneBackButtonHost, type TopCurrencyEntry } from '../UiSceneBackButton';
import { mountRefButton, mountRefHeaderBand, mountRefSectionDiamond, mountRefSliced, mountRefTitledPanel, raiseRefFrame, REF_CARD_FRAME_LINE, REF_ICON_RING_ASSET, REF_KIT, refCardFrameK } from '../UiRefKit';

/**
 * 货币商店弹窗(2026-09-22 用户拍板"你来设计",docs/33):
 * - 金币:点顶部金币打开;4 档钻石→金币一排,图标 单枚金币 → 一堆 → 金币山 → 金币宝箱 递进。
 * - 体力:点顶部体力打开;左侧当前体力 + 回复进度,右侧"补充 1 份 / 5 份"两张卡;60 钻 = 30 体力,每日限次,可超上限。
 * - 钻石:点顶部钻石打开;6 档人民币→钻石按 3×2 排,图标 少量 → 中量 → 大量 → 钻石宝箱 递进;支付渠道未接入时只预览。
 * 面板底与守卫战各弹层同款素净框(4:3),尺寸同时满足内容宽与内容高(2026-09-23 用户反馈"过于紧凑":卡距/边距放宽,卡内加光晕、赠送标签,
 * 价格带钻石图标;2026-09-24 去掉底部余额行,改成醒目的结果横幅);字号按限时副本面板口径(标题 34、正文 18、卡名 20、数额 28)。
 * 作为全屏覆盖层挂在当前视图之上(大厅 / 锻造等功能页都能开),数据与写入全走服务端 ShopApi;购买成功由根节点做飘字 + 飞币动效。
 */
export type LobbyShopKind = 'gold' | 'stamina' | 'diamond';

export interface LobbyShopDialogState {
  kind: LobbyShopKind;
  catalog: ShopCatalogVO | null;
  loading: boolean;
  busy: boolean;
  notice: string;
  /** 钻石页选中的充值通道(空=第一个可用通道)。 */
  channelCode?: string | null;
}

export interface LobbyShopDialogHost {
  currentLobbyProfile(): PlayerLobbyProfileVO;
  currentLobbyShopState(): LobbyShopDialogState | null;
  closeLobbyShopDialog(): void;
  /** fromWorld=被点卡片的世界坐标,成功后动效从这里起飞。 */
  buyShopGold(tierCode: string, fromWorld?: Vec3): void;
  buyShopStamina(count: number, fromWorld?: Vec3): void;
  rechargeShopDiamond(tierCode: string, fromWorld?: Vec3): void;
  selectShopRechargeChannel(channelCode: string): void;
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

/**
 * 档位卡样式(2026-10-17 v2 用户「更还原原型图:金币图、宝箱图、边框都要一样」):
 * ornate = 金币页荆棘金框(GPT 按原型逐件出,含顶饰尖 + 红标题带,一体构图只能等比,best 版自带金光);
 * plain = 钻石 / 体力页细金框(card_frame_open 九宫格)+ 暗红标题带 + ✦ 徽记。
 * 纵向口径(卡顶往下的卡高比例)量自原型:名字带 / 主图中心 / 数额 / 单位 / 赠送签 / 价格钮。
 */
interface CardLayout {
  sideF: number;
  bodyTopF: number;
  bodyBottomF: number;
  bandF: number;
  bandHF: number;
  illuF: number;
  illuWF: number;
  illuHF: number;
  amountF: number;
  unitF: number;
  tagF: number;
  priceF: number;
  priceHF: number;
}
/** 卡内字号(卡高比例)。 */
interface CardFonts {
  name: number;
  amount: number;
  unit: number;
  tag: number;
  price: number;
}
interface CardStyle {
  kind: 'ornate' | 'plain';
  /** 高 / 宽。 */
  aspect: number;
  /** 不填 = 按 kind 取默认(ornate 金币卡 / plain 钻石卡)。 */
  layout?: CardLayout;
  fonts?: CardFonts;
  /** 体力卡:主图是金环徽章(直径 = 主图区高 × ringK)。 */
  ringK?: number;
}
const SHOP_REF_DIR = 'ui/shop/ref/';
const ORNATE_CARD = {
  path: `${SHOP_REF_DIR}card_ornate/spriteFrame`,
  bestPath: `${SHOP_REF_DIR}card_ornate_best/spriteFrame`,
  aspect: 1100 / 685,
  layout: { sideF: 0.069, bodyTopF: 0.172, bodyBottomF: 0.972, bandF: 0.1245, bandHF: 0.079, illuF: 0.44, illuWF: 0.84, illuHF: 0.36, amountF: 0.655, unitF: 0.72, tagF: 0.785, priceF: 0.888, priceHF: 0.112 } as CardLayout,
};
const PLAIN_CARD_LAYOUT: CardLayout = { sideF: 0.02, bodyTopF: 0.02, bodyBottomF: 0.98, bandF: 0.07, bandHF: 0.11, illuF: 0.385, illuWF: 0.94, illuHF: 0.38, amountF: 0.628, unitF: 0.7, tagF: 0.778, priceF: 0.89, priceHF: 0.125 };
// 字号量自原型(字形高 ÷ 卡高,再折回字号):金币卡字小、钻石卡中、体力卡数额最大
const ORNATE_FONTS: CardFonts = { name: 0.048, amount: 0.068, unit: 0.036, tag: 0.032, price: 0.05 };
const PLAIN_FONTS: CardFonts = { name: 0.062, amount: 0.095, unit: 0.05, tag: 0.044, price: 0.06 };
const GOLD_CARD: CardStyle = { kind: 'ornate', aspect: ORNATE_CARD.aspect };
const PLAIN_CARD: CardStyle = { kind: 'plain', aspect: 1.46 };
const STAMINA_CARD: CardStyle = {
  kind: 'plain',
  aspect: 1.46,
  layout: { ...PLAIN_CARD_LAYOUT, bandHF: 0.11, illuF: 0.4, illuHF: 0.38, amountF: 0.645, unitF: 0.735, priceF: 0.875, priceHF: 0.13 },
  fonts: { name: 0.066, amount: 0.13, unit: 0.06, tag: 0.044, price: 0.075 },
  ringK: 1.2,
};
/** 原型插画(带底座,透明底;aspect = 高 / 宽):键 = 服务端 iconKey,或钻石页按档位编码挑的 artKey。 */
const SHOP_ILLUSTRATIONS: Record<string, SpriteSpec> = {
  gold_small: { path: 'ui/shop/ref/illu_gold_small/spriteFrame', aspect: 480 / 560 },
  gold_medium: { path: 'ui/shop/ref/illu_gold_medium/spriteFrame', aspect: 436 / 560 },
  gold_large: { path: 'ui/shop/ref/illu_gold_large/spriteFrame', aspect: 446 / 560 },
  gold_chest: { path: 'ui/shop/ref/illu_gold_chest/spriteFrame', aspect: 508 / 560 },
  diamond_few: { path: 'ui/shop/ref/illu_diamond_few/spriteFrame', aspect: 534 / 560 },
  diamond_some: { path: 'ui/shop/ref/illu_diamond_some/spriteFrame', aspect: 451 / 560 },
  diamond_many: { path: 'ui/shop/ref/illu_diamond_many/spriteFrame', aspect: 445 / 560 },
  diamond_mountain: { path: 'ui/shop/ref/illu_diamond_mountain/spriteFrame', aspect: 437 / 560 },
  diamond_chest: { path: 'ui/shop/ref/illu_diamond_chest/spriteFrame', aspect: 560 / 548 },
};
/** 钻石页同 iconKey 的档位按档位编码换图(钻石山与大量钻石同为 diamond_many)。 */
const RECHARGE_ART_BY_TIER: Record<string, string> = { RC_328: 'diamond_mountain' };

/** 字号口径(2026-09-22 用户:与限时副本面板一致,以后所有弹窗统一)。 */
const FONT = { title: 34, subtitle: 18, body: 18, small: 16, cardName: 20, amount: 28, unit: 16, tag: 15, price: 20, big: 26 };
/** 面板顶边 → 内容区顶 / 内容区底 → 面板底边 的固定留白(顶部含标题、副标题;底部含结果横幅)。 */
const HEADER_H = 206;
const FOOTER_H = 156;
/** 结果横幅中心离面板底边的距离与字号(2026-09-24:去掉余额行后横幅下移放大)。 */
const NOTICE_Y = 102;
const NOTICE_FONT = 22;
/** 内容区左右各留的边距(2026-09-23 放宽)。 */
const SIDE_PAD = 80;
/** 卡片框最高的高宽比(排版预留)。 */
const TALLEST_FRAME = Math.max(...TIER_FRAMES.map((frame) => frame.aspect));
/** 各页卡宽上限与每排张数。 */
const CARD_W = { gold: 224, stamina: 196, diamond: 210 };
const GAP = { col: 32, row: 26 };
/** 钻石页支付方式行占的高度(ONLINE 且有通道时)。 */
const CHANNEL_ROW_H = 58;
/**
 * 手机横屏全屏版(2026-10-02 用户:「横屏模式下弹框都调整成全屏」):面板铺满舞台、程序画框(原 4:3 素材框只能等比);
 * 标题带更紧凑,卡片上限放大、文字随卡宽同比放大(上限 1.35 倍);钻石页 6 档按"卡最大"自动选每排张数(宽屏一排 6 张)。
 */
// 2026-10-05 用户「上面部分不太好看」:标题带改单行(标题牌 · 说明 · 余额同一行),高 104 → 88
const PHONE_GEO = { headerH: 104, footerH: 84, noticeY: 42, sidePad: 28, gapCol: 18, titleBand: 88 };
// 2026-10-04 用户「每个充值的框都放大」:卡宽上限放开,实际由可用高度决定(框素材只能等比);钻石 6 档一排放不下时横向滑动。
const PHONE_CARD_W = { gold: 380, stamina: 340, diamond: 340 };
const PHONE_TEXT_SCALE_MAX = 1.6;

interface TierCardSpec {
  name: string;
  iconKey: string;
  amount: string;
  unit: string;
  amountColor: Color;
  /** 卡内文字 / 细节放大倍数(手机全屏版卡片变大时同比放大;缺省 1)。 */
  textScale?: number;
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
  /** 左上角斜角标「最划算」:plain 卡加金色外发光,ornate 卡换发光金框。 */
  ribbon?: string;
  /** 主图键(钻石页按档位编码换图;空 = 按 iconKey)。 */
  artKey?: string;
  onTap: ((fromWorld: Vec3) => void) | null;
}

export class LobbyShopDialogRenderer {
  /** 上一次渲染的结果文案(只在文案变化时弹一下)。 */
  private lastNotice = '';
  /** 本次渲染是否手机全屏版(render 开头确定,排版工具函数共用)。 */
  private phone = false;

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
    // 手机:全屏(铺满舞台留安全边距),程序画框。
    const catalog = state.catalog;
    const phone = isPhoneDesign();
    this.phone = phone;
    let panelW: number;
    let panelH: number;
    if (phone) {
      const size = resolvePhoneDialogSize(layout);
      panelW = size.width;
      panelH = size.height;
    } else {
      const need = this.contentNeeds(state.kind, catalog, scale);
      panelW = Math.max(need.w + SIDE_PAD * 2 * scale, (need.h + (HEADER_H + FOOTER_H) * scale) / PANEL_FRAME.aspect);
      panelH = panelW * PANEL_FRAME.aspect;
      if (panelH > layout.stageHeight * 0.9) {
        panelH = layout.stageHeight * 0.9;
        panelW = panelH / PANEL_FRAME.aspect;
      }
      if (panelW > layout.stageWidth - 32 * scale) {
        panelW = layout.stageWidth - 32 * scale;
        panelH = panelW * PANEL_FRAME.aspect;
      }
    }
    const panel = this.host.addChildPlainNode(overlay, 'LobbyShopPanel', 0, 0, panelW, panelH);
    // 面板自己吞掉点击:点面板不关闭,点外面暗幕才关闭。
    panel.addComponent(BlockInputEvents);
    if (phone) {
      // 背景按整屏铺满(原型通屏,两侧不留黑边)
      drawPhoneDialogFrame(this.host, panel, panelW, panelH, PHONE_GEO.titleBand * scale, { bare: true, coverW: layout.width + Math.abs(centerX) * 2, coverH: layout.height + Math.abs(centerY) * 2 });
    } else {
      this.host.addSprite('LobbyShopPanelFrame', PANEL_FRAME.path, 0, 0, panelW, panelH, panel);
    }

    const closeSize = (phone ? 66 : 44) * scale;
    const closeX = phone ? panelW / 2 - 46 * scale : panelW / 2 - 64 * scale;
    const closeY = phone ? panelH / 2 - (6 + (PHONE_GEO.titleBand * scale) / 2) : panelH / 2 - 62 * scale;
    const close = this.host.addChildPlainNode(panel, 'LobbyShopClose', closeX, closeY, closeSize, closeSize * CLOSE_BUTTON.aspect);
    this.host.addSprite('LobbyShopCloseArt', CLOSE_BUTTON.path, 0, 0, closeSize, closeSize * CLOSE_BUTTON.aspect, close);
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeLobbyShopDialog(), this);
    this.host.applyImageButtonFeedback(close, 1.08, 0.94);

    // 标题压到顶饰之下,两侧任务页同款 title_divider 饰件(与守卫战弹层一致)。
    const titleY = panelH / 2 - (phone ? 40 : 112) * scale;
    const titleSize = FONT.title * scale;
    const phoneRowDrop = 6 + (PHONE_GEO.titleBand * scale) / 2;
    let phoneTitleRight = 0;
    if (phone) {
      // 手机:标题统一成左上角标题牌(与英雄 / 背包页同款,2026-10-05 用户);余额胶囊挪到右上、关闭钮左侧
      phoneTitleRight = addPhoneDialogTitle(this.host, panel, panelW, panelH, TITLE[state.kind], phoneRowDrop, 1.05 * scale);
    } else {
      const title = this.host.addChildLabel(panel, 'LobbyShopTitle', TITLE[state.kind], 0, titleY, titleSize, rgba(255, 226, 150), new Size(panelW * 0.6, titleSize + 10 * scale));
      title.isBold = true;
      this.outline(title, scale, rgba(60, 30, 10, 255));
    }
    const titleHalf = (TITLE[state.kind].length * titleSize) / 2;
    const dividerW = 150 * scale;
    const dividerX = titleHalf + 22 * scale + dividerW / 2;
    // 手机窄屏(16:9):左侧两个余额胶囊会顶到标题左饰件,放不下就不画两侧饰件
    const chipCount = state.kind === 'diamond' ? 1 : 2;
    const chipsRight = -panelW / 2 + (26 + chipCount * 158 + (chipCount - 1) * 18) * scale;
    void chipsRight;
    if (!phone) {
      this.host.addSprite('LobbyShopTitleDividerL', TITLE_DIVIDER_L.path, -dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_L.aspect, panel);
      this.host.addSprite('LobbyShopTitleDividerR', TITLE_DIVIDER_R.path, dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_R.aspect, panel);
    }
    const subtitleText = state.kind === 'gold'
      ? '用钻石换取金币,档位越高赠送越多'
      : state.kind === 'stamina'
        ? `${catalog?.staminaOffer.diamondCost ?? 60} 钻石 = ${catalog?.staminaOffer.staminaGain ?? 30} 体力 · 每 5 分钟自然回复 1 点`
        : this.payMode(catalog) === 'ONLINE'
          ? '选择支付方式后点击档位,在新窗口完成付款,到账后钻石自动发放'
          : this.payMode(catalog) === 'MOCK'
            ? '联调环境:点击档位即模拟支付到账;正式环境接入支付渠道后走真实支付'
            : '钻石充值暂未开放,敬请期待';
    const subtitle = this.host.addChildLabel(panel, 'LobbyShopSubtitle', subtitleText, 0, titleY - (phone ? 40 : 36) * scale, FONT.subtitle * scale, rgba(228, 215, 190, 240), new Size(panelW * 0.82, this.lh(24, scale)));
    subtitle.overflow = Label.Overflow.SHRINK;
    if (phone) {
      // 说明排在标题牌右侧、余额胶囊左侧,同一行左对齐
      const chips = state.kind === 'diamond' ? 1 : 2;
      const subLeft = phoneTitleRight + 20 * scale;
      const subRight = panelW / 2 - (96 + chips * 216) * scale;
      const subW = Math.max(120 * scale, subRight - subLeft);
      subtitle.node.setPosition(subLeft + subW / 2, panelH / 2 - phoneRowDrop, 0);
      subtitle.node.getComponent(UITransform)?.setContentSize(subW, 30 * scale);
      subtitle.horizontalAlign = HorizontalTextAlignment.LEFT;
    }

    // 2026-09-24 用户:去掉底部"当前持有"余额行(顶部货币栏已有),底部整条留给结果横幅。
    const profile = this.host.currentLobbyProfile();
    const diamond = catalog ? Number(catalog.diamond ?? 0) : Number(profile.diamond ?? 0);

    const bodyTop = panelH / 2 - (phone ? PHONE_GEO.headerH : HEADER_H) * scale;
    const bodyBottom = -panelH / 2 + (phone ? PHONE_GEO.footerH : FOOTER_H) * scale;
    if (state.notice) {
      this.renderNoticeBanner(panel, state.notice, -panelH / 2 + (phone ? PHONE_GEO.noticeY : NOTICE_Y) * scale, panelW, scale);
    } else {
      this.lastNotice = '';
    }
    if (phone) {
      this.renderPhoneBalances(panel, state.kind, catalog, profile, diamond, panelW, panelH, scale);
    }
    if (!catalog) {
      this.host.addChildLabel(panel, 'LobbyShopLoading', state.loading ? '商店读取中…' : '商店暂不可用', 0, (bodyTop + bodyBottom) / 2, FONT.body * scale, rgba(221, 212, 196), new Size(panelW * 0.6, 26 * scale));
      return;
    }
    if (state.kind === 'gold') {
      this.renderGoldTiers(panel, catalog, panelW, bodyTop, bodyBottom, scale, state.busy, diamond);
    } else if (state.kind === 'stamina') {
      this.renderStamina(panel, catalog, panelW, bodyTop, bodyBottom, scale, state.busy, diamond);
    } else {
      this.renderRechargeTiers(panel, catalog, state, panelW, bodyTop, bodyBottom, scale);
    }
    if (state.busy) {
      const cover = this.host.addChildPlainNode(panel, 'LobbyShopBusy', 0, 0, panelW, panelH);
      cover.addComponent(BlockInputEvents);
      const busyLabel = this.host.addChildLabel(cover, 'LobbyShopBusyText', '处理中…', 0, (bodyTop + bodyBottom) / 2, FONT.big * scale, rgba(255, 238, 190), new Size(panelW * 0.5, 34 * scale));
      this.outline(busyLabel, scale, rgba(0, 0, 0, 255));
    }
  }

  /**
   * 手机全屏版盖住了大厅顶部货币栏,在标题带左侧补余额胶囊(同款素材);点胶囊切到对应商店。
   * (2026-10-04 用户「美化钻石充值 / 金币商店 / 体力补充」)
   */
  private renderPhoneBalances(panel: Node, kind: LobbyShopKind, catalog: ShopCatalogVO | null, profile: PlayerLobbyProfileVO, diamond: number, panelW: number, panelH: number, scale: number): void {
    const entries: TopCurrencyEntry[] = [];
    if (kind === 'gold') {
      entries.push({ key: 'gold', icon: ICONS.gold_small.path, value: this.host.formatInteger(Number(profile.gold ?? 0)) });
    } else if (kind === 'stamina') {
      const stamina = catalog ? catalog.stamina : Number(profile.stamina ?? 0);
      const maxStamina = catalog ? catalog.maxStamina : Number(profile.maxStamina ?? 0);
      entries.push({ key: 'stamina', icon: ICONS.stamina.path, value: `${stamina}/${maxStamina}` });
    }
    entries.push({ key: 'diamond', icon: ICONS.diamond.path, value: this.host.formatInteger(diamond) });
    const capW = 158 * scale;
    const gap = 18 * scale;
    void capW;
    void gap;
    // 胶囊放大到 1.25 倍,与标题牌同一行居中
    const capScale = scale * 1.25;
    const rightX = panelW / 2 - 88 * scale;
    const rowY = panelH / 2 - 6 - (PHONE_GEO.titleBand * scale) / 2;
    renderTopCurrencyBar(this.host as unknown as SceneBackButtonHost, panel, rightX, rowY + 40 * capScale, capScale, entries, 0);
  }

  /** 手机:卡片区垫一块内凹底板(深底 + 金色上沿线 + 细边),不再是整块平黑。 */
  /** 各页内容区需要的宽与高(决定面板尺寸):金币一排 4 卡;体力 左状态 + 右两卡;充值 3×2 两排。 */
  private contentNeeds(kind: LobbyShopKind, catalog: ShopCatalogVO | null, scale: number): { w: number; h: number } {
    if (!catalog) {
      return { w: 760 * scale, h: 220 * scale };
    }
    if (kind === 'gold') {
      const n = Math.max(1, catalog.goldTiers.length);
      return { w: (n * CARD_W.gold + (n - 1) * GAP.col) * scale, h: (CARD_W.gold * GOLD_CARD.aspect + 40) * scale };
    }
    if (kind === 'stamina') {
      return { w: 940 * scale, h: (CARD_W.stamina * PLAIN_CARD.aspect + 90) * scale };
    }
    const rows = Math.ceil(catalog.rechargeTiers.length / 3);
    const channelRow = this.onlineChannels(catalog).length > 0 ? CHANNEL_ROW_H : 0;
    return { w: (3 * CARD_W.diamond + 2 * GAP.col) * scale, h: (rows * CARD_W.diamond * PLAIN_CARD.aspect + (rows - 1) * GAP.row + 40 + channelRow) * scale };
  }

  /** 旧服务端没有 payMode 字段时按 mockPay 推断。 */
  private payMode(catalog: ShopCatalogVO | null): ShopPayMode {
    if (!catalog) {
      return 'NONE';
    }
    return catalog.payMode ?? (catalog.mockPay ? 'MOCK' : 'NONE');
  }

  private onlineChannels(catalog: ShopCatalogVO): ShopRechargeChannelVO[] {
    return this.payMode(catalog) === 'ONLINE' ? catalog.rechargeChannels ?? [] : [];
  }

  private static channelFits(channel: ShopRechargeChannelVO | undefined, price: number): boolean {
    if (!channel) {
      return true;
    }
    const min = channel.minAmount == null ? null : Number(channel.minAmount);
    const max = channel.maxAmount == null ? null : Number(channel.maxAmount);
    return (min == null || price >= min) && (max == null || price <= max);
  }

  // ── 金币:4 档一排;赠送最高的一档标"最划算" ──
  private renderGoldTiers(panel: Node, catalog: ShopCatalogVO, panelW: number, top: number, bottom: number, scale: number, busy: boolean, diamond: number): void {
    const tiers = catalog.goldTiers;
    const bestBonus = Math.max(0, ...tiers.map((tier) => tier.bonusPct));
    const grid = this.tierGrid(panelW, top, bottom, scale, tiers.length, tiers.length, (this.phone ? PHONE_CARD_W.gold : CARD_W.gold) * scale, GOLD_CARD.aspect);
    tiers.forEach((tier, index) => {
      const slot = grid.slots[index];
      const affordable = diamond >= tier.diamondCost;
      const best = tier.bonusPct > 0 && tier.bonusPct === bestBonus;
      this.buildTierCard(panel, `LobbyShopGold_${tier.code}`, slot.x, slot.y, grid.cardW, GOLD_CARD, scale, {
        textScale: this.cardTextScale(grid.cardW, CARD_W.gold * scale),
        name: tier.name,
        iconKey: tier.iconKey,
        amount: this.host.formatInteger(tier.goldAmount),
        unit: '金币',
        amountColor: rgba(255, 214, 110),
        tag: tier.bonusPct > 0 ? `赠 ${tier.bonusPct}%` : '',
        tagHighlight: best,
        ribbon: best ? '最划算' : undefined,
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
    // 右栏卡片先排版:左栏信息框与卡片上下对齐(原型)
    const rightX = panelW * 0.2;
    const packs = [1, offer.maxCountPerBuy].filter((count, index, all) => count >= 1 && all.indexOf(count) === index);
    const grid = this.tierGrid(panelW * 0.5, top, bottom + (this.phone ? 40 * scale : 0), scale, packs.length, packs.length, (this.phone ? PHONE_CARD_W.stamina : CARD_W.stamina) * scale, PLAIN_CARD.aspect);
    const cardCy = grid.slots[0].y + 14 * scale;
    const cardH = grid.cardW * PLAIN_CARD.aspect;
    const leftCy = this.phone ? cardCy : centerY;
    const iconBox = Math.min(150 * scale, (top - bottom) * 0.4);
    if (this.phone) {
      // 左栏信息框:细金框 + 暗红标题带「当前体力」(原型),与右侧卡片同高
      const boxW = panelW * 0.4;
      const boxH = cardH;
      const box = mountRefTitledPanel(this.host, panel, 'LobbyShopStaminaBox', leftX, leftCy, boxW, boxH, scale, '当前体力', { bandH: cardH * 0.11, fontSize: cardH * 0.066, fill: rgba(14, 10, 10, 200) }).node;
      if (catalog.stamina > catalog.maxStamina) {
        const over = this.host.addChildLabel(box, 'Over', `已超出上限 +${catalog.stamina - catalog.maxStamina}`, 0, -boxH / 2 + 24 * scale, 20 * scale, rgba(150, 240, 160), new Size(boxW * 0.8, 28 * scale));
        over.overflow = Label.Overflow.SHRINK;
      }
    }
    // 药剂坐在金环徽章里(原型)
    // 纵向按卡高比例(量自原型):徽章中心 37% / 数值 66% / 进度条 75% / 两行说明 84%、91%
    const lat = (f: number): number => leftCy + cardH / 2 - cardH * f;
    const medal = Math.min(cardH * 0.55, panelW * 0.26);
    this.drawGlow(panel, 'LobbyShopStaminaGlow', leftX, lat(0.42), medal * 0.36, [255, 120, 90], scale);
    this.host.addSprite('LobbyShopStaminaRing', REF_ICON_RING_ASSET, leftX, lat(0.42), medal, medal, panel);
    this.fitSprite(panel, 'LobbyShopStaminaIcon', ICONS.stamina, leftX, lat(0.42), this.phone ? medal * 0.66 : iconBox);
    const value = this.host.addChildLabel(panel, 'LobbyShopStaminaValue', `体力 ${catalog.stamina}/${catalog.maxStamina}`, leftX, lat(0.665), this.phone ? cardH * 0.068 : FONT.big * scale, rgba(140, 230, 255), new Size(panelW * 0.4, cardH * 0.09));
    this.outline(value, scale, rgba(10, 30, 50, 255));
    const barW = Math.min(this.phone ? panelW * 0.3 : 250 * scale, panelW * 0.36);
    const barH = this.phone ? cardH * 0.05 : 16 * scale;
    const bar = this.host.addChildPlainNode(panel, 'LobbyShopStaminaBar', leftX, lat(0.745), barW, barH);
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
    // 金框 + 两端金菱形(原型)
    bg.strokeColor = rgba(214, 172, 96, 235);
    bg.lineWidth = Math.max(1.5, 2 * scale);
    bg.roundRect(-barW / 2 - 2 * scale, -barH / 2 - 2 * scale, barW + 4 * scale, barH + 4 * scale, barH / 2 + 2 * scale);
    bg.stroke();
    [-1, 1].forEach((side) => {
      const cap = this.host.addChildPlainNode(bar, `Cap_${side}`, side * (barW / 2 + 6 * scale), 0, 16 * scale, 22 * scale).addComponent(Graphics);
      cap.fillColor = rgba(232, 192, 110, 255);
      cap.moveTo(0, 11 * scale);
      cap.lineTo(7 * scale, 0);
      cap.lineTo(0, -11 * scale);
      cap.lineTo(-7 * scale, 0);
      cap.close();
      cap.fill();
    });
    const notes = ['每 5 分钟自然回复 1 点(上限内)', '购买的体力可超过上限,超出部分不会消失'];
    notes.forEach((text, index) => {
      const note = this.host.addChildLabel(panel, `LobbyShopStaminaNote_${index}`, text, leftX, this.phone ? lat(0.845 + index * 0.068) : centerY - (90 + index * 26) * scale, this.phone ? cardH * 0.046 : FONT.small * scale, rgba(222, 210, 184), new Size(panelW * 0.38, this.phone ? cardH * 0.065 : this.lh(22, scale)));
      note.overflow = Label.Overflow.SHRINK;
      this.outline(note, scale, rgba(10, 6, 4, 255));
    });
    packs.forEach((count, index) => {
      const slot = grid.slots[index];
      const cost = offer.diamondCost * count;
      const sellable = offer.dailyLimit > 0 && count <= remaining;
      this.buildTierCard(panel, `LobbyShopStaminaBuy_${count}`, rightX + slot.x, slot.y + 14 * scale, grid.cardW, STAMINA_CARD, scale, {
        textScale: this.cardTextScale(grid.cardW, CARD_W.stamina * scale),
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
    // 额度行:整页居中 + 两侧饰线(原型)
    const quotaY = cardCy - cardH / 2 - 28 * scale;
    const quotaX = this.phone ? 0 : rightX;
    const quota = this.host.addChildLabel(panel, 'LobbyShopStaminaQuota', quotaText, quotaX, quotaY, this.phone ? 25 * scale : FONT.small * scale, remaining > 0 ? rgba(232, 218, 190) : rgba(255, 170, 150), new Size(panelW * 0.5, this.phone ? 34 * scale : this.lh(26, scale)));
    quota.overflow = Label.Overflow.SHRINK;
    this.outline(quota, scale, rgba(10, 6, 4, 255));
    if (this.phone) {
      const divW = 150 * scale;
      const divGap = (quotaText.length * 25 * scale * 0.82) / 2 + 24 * scale + divW / 2;
      this.host.addSprite('LobbyShopStaminaQuotaDivL', TITLE_DIVIDER_L.path, quotaX - divGap, quotaY, divW, divW * TITLE_DIVIDER_L.aspect, panel);
      this.host.addSprite('LobbyShopStaminaQuotaDivR', TITLE_DIVIDER_R.path, quotaX + divGap, quotaY, divW, divW * TITLE_DIVIDER_R.aspect, panel);
    }
  }

  // ── 钻石充值:6 档 3×2,图标 少量 → 中量 → 大量 → 宝箱;赠送最高的一档标"最划算";ONLINE 时顶部一行支付方式 ──
  private renderRechargeTiers(panel: Node, catalog: ShopCatalogVO, state: LobbyShopDialogState, panelW: number, top: number, bottom: number, scale: number): void {
    const busy = state.busy;
    const mode = this.payMode(catalog);
    const channels = this.onlineChannels(catalog);
    const selected = channels.find((channel) => channel.channelCode === state.channelCode) ?? channels[0];
    let gridTop = top;
    if (channels.length > 0) {
      this.renderChannelRow(panel, channels, selected?.channelCode ?? '', top - 24 * scale, scale, busy);
      gridTop = top - CHANNEL_ROW_H * scale;
    }
    const tiers = catalog.rechargeTiers;
    const bestBonus = Math.max(0, ...tiers.map((tier) => tier.diamondBonus));
    // 手机:卡片按可用高度放到最大;6 张一排超出面板宽时放进横向滑动区(露出半张提示可滑),位置在重绘间保留
    let cardParent = panel;
    let grid: { cardW: number; slots: Array<{ x: number; y: number }> };
    if (this.phone) {
      const gap = PHONE_GEO.gapCol * scale;
      const side = PHONE_GEO.sidePad * scale;
      const viewW = panelW - side * 2;
      const bodyH = gridTop - bottom;
      const cardW = Math.min(PHONE_CARD_W.diamond * scale, (bodyH * 0.9) / PLAIN_CARD.aspect);
      const rowW = tiers.length * cardW + (tiers.length - 1) * gap;
      const centerY = (gridTop + bottom) / 2;
      // 档位区细金框(原型:支付方式行 + 卡片一起框住)
      mountRefTitledPanel(this.host, panel, 'LobbyShopRechargeFrame', 0, (top + bottom) / 2 - 2 * scale, viewW + 28 * scale, top - bottom + 22 * scale, scale, '', { fill: rgba(6, 4, 6, 70) });
      if (rowW <= viewW) {
        grid = { cardW, slots: tiers.map((_, index) => ({ x: -rowW / 2 + cardW / 2 + index * (cardW + gap), y: centerY })) };
      } else {
        const viewport = this.host.addChildPlainNode(panel, 'LobbyShopRechargeScroll', 0, centerY, viewW, bodyH);
        viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const scrollView = viewport.addComponent(ScrollView);
        scrollView.horizontal = true;
        scrollView.vertical = false;
        scrollView.inertia = true;
        scrollView.elastic = true;
        scrollView.cancelInnerEvents = true;
        const contentW = rowW + 52 * scale;
        const maxShift = contentW - viewW;
        const baseX = maxShift / 2;
        this.rechargeScroll = Math.max(0, Math.min(maxShift, this.rechargeScroll));
        const content = this.host.addChildPlainNode(viewport, 'LobbyShopRechargeScrollContent', baseX - this.rechargeScroll, 0, contentW, bodyH);
        scrollView.content = content;
        // 右缘「›」提示还有更多,滑到头就隐藏
        // 右缘「›」金环圆钮(原型),提示还有更多;滑到头就隐藏
        const hintSize = 64 * scale;
        const hint = this.host.addChildPlainNode(panel, 'LobbyShopRechargeMore', viewW / 2 - 4 * scale, centerY, hintSize, hintSize);
        const hg = hint.addComponent(Graphics);
        hg.fillColor = rgba(10, 8, 6, 225);
        hg.circle(0, 0, hintSize * 0.36);
        hg.fill();
        if (!this.host.addSprite('Ring', REF_ICON_RING_ASSET, 0, 0, hintSize, hintSize, hint)) {
          hg.strokeColor = rgba(214, 168, 92, 230);
          hg.lineWidth = Math.max(1, 2 * scale);
          hg.circle(0, 0, hintSize * 0.4);
          hg.stroke();
        }
        const arrow = this.host.addChildLabel(hint, 'Arrow', '›', 2 * scale, 3 * scale, 40 * scale, rgba(255, 230, 160), new Size(hintSize * 0.6, hintSize * 0.8));
        arrow.isBold = true;
        const syncHint = (): void => {
          this.rechargeScroll = Math.max(0, Math.min(maxShift, baseX - content.position.x));
          if (hint.isValid) {
            hint.active = this.rechargeScroll < maxShift - 12 * scale;
          }
        };
        viewport.on('scrolling', syncHint, this);
        viewport.on('scroll-ended', syncHint, this);
        syncHint();
        cardParent = content;
        grid = { cardW, slots: tiers.map((_, index) => ({ x: -contentW / 2 + 26 * scale + cardW / 2 + index * (cardW + gap), y: 0 })) };
      }
    } else {
      grid = this.tierGrid(panelW, gridTop, bottom, scale, tiers.length, 3, CARD_W.diamond * scale, PLAIN_CARD.aspect);
    }
    tiers.forEach((tier, index) => {
      const slot = grid.slots[index];
      const price = Number(tier.priceCny ?? 0);
      const best = tier.diamondBonus > 0 && tier.diamondBonus === bestBonus;
      const payable = mode === 'MOCK' || (mode === 'ONLINE' && LobbyShopDialogRenderer.channelFits(selected, price));
      this.buildTierCard(cardParent, `LobbyShopRecharge_${tier.code}`, slot.x, slot.y, grid.cardW, PLAIN_CARD, scale, {
        textScale: this.cardTextScale(grid.cardW, CARD_W.diamond * scale),
        name: tier.name,
        iconKey: tier.iconKey,
        artKey: RECHARGE_ART_BY_TIER[tier.code],
        amount: this.host.formatInteger(tier.diamondTotal),
        unit: '钻石',
        amountColor: rgba(170, 215, 255),
        tag: tier.diamondBonus > 0 ? `赠 ${this.host.formatInteger(tier.diamondBonus)}` : '',
        tagHighlight: best,
        ribbon: best ? '最划算' : undefined,
        price: `¥ ${Number.isInteger(price) ? price : price.toFixed(2)}`,
        enabled: !busy && payable,
        dimmed: !payable,
        onTap: (from) => this.host.rechargeShopDiamond(tier.code, from),
      });
    });
  }

  /** 支付方式一排圆角签:选中=金边亮底;只有一个通道时也显示,让玩家知道走的是哪种支付。 */
  private renderChannelRow(panel: Node, channels: ShopRechargeChannelVO[], selectedCode: string, y: number, scale: number, busy: boolean): void {
    const chipH = 40 * scale;
    const gap = 16 * scale;
    const widths = channels.map((channel) => Math.max(120 * scale, (channel.channelName.length * FONT.body + 48) * scale));
    const labelW = 96 * scale;
    const total = labelW + widths.reduce((sum, width) => sum + width, 0) + gap * channels.length;
    let x = -total / 2;
    const label = this.host.addChildLabel(panel, 'LobbyShopChannelLabel', '支付方式', x + labelW / 2, y, FONT.body * scale, rgba(232, 214, 176, 245), new Size(labelW, 26 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, rgba(10, 6, 4, 255));
    if (this.phone) {
      const divW = 170 * scale;
      this.host.addSprite('LobbyShopChannelDivL', TITLE_DIVIDER_L.path, x - 24 * scale - divW / 2, y, divW, divW * TITLE_DIVIDER_L.aspect, panel);
      this.host.addSprite('LobbyShopChannelDivR', TITLE_DIVIDER_R.path, -x + 24 * scale + divW / 2, y, divW, divW * TITLE_DIVIDER_R.aspect, panel);
    }
    x += labelW + gap;
    channels.forEach((channel, index) => {
      const width = widths[index];
      const active = channel.channelCode === selectedCode;
      const chip = this.host.addChildPlainNode(panel, `LobbyShopChannel_${channel.channelCode}`, x + width / 2, y, width, chipH);
      const g = chip.addComponent(Graphics);
      g.fillColor = active ? rgba(120, 70, 24, 240) : rgba(22, 18, 24, 230);
      g.roundRect(-width / 2, -chipH / 2, width, chipH, chipH / 2);
      g.fill();
      g.strokeColor = active ? rgba(255, 214, 110, 255) : rgba(150, 120, 80, 200);
      g.lineWidth = Math.max(1, (active ? 2.2 : 1.4) * scale);
      g.roundRect(-width / 2, -chipH / 2, width, chipH, chipH / 2);
      g.stroke();
      const text = this.host.addChildLabel(chip, `LobbyShopChannelText_${channel.channelCode}`, channel.channelName, 0, 0, FONT.body * scale,
        active ? rgba(255, 238, 190) : rgba(210, 196, 170), new Size(width - 16 * scale, chipH));
      text.overflow = Label.Overflow.SHRINK;
      if (active) {
        text.isBold = true;
      }
      if (!busy && !active) {
        chip.addComponent(Button);
        chip.on(Button.EventType.CLICK, () => this.host.selectShopRechargeChannel(channel.channelCode), this);
        this.host.applyImageButtonFeedback(chip, 1.04, 0.96);
      }
      x += width + gap;
    });
  }

  /** 网格排版:perRow 张一排,超出换行;卡宽受 maxCardW、一排可用宽、可用高(全部行)三者约束;整体在内容区居中。 */
  private tierGrid(areaW: number, top: number, bottom: number, scale: number, count: number, perRow: number, maxCardW: number, aspect = TALLEST_FRAME): { cardW: number; slots: Array<{ x: number; y: number }> } {
    const gap = (this.phone ? PHONE_GEO.gapCol : GAP.col) * scale;
    const rowGap = GAP.row * scale;
    const rows = Math.max(1, Math.ceil(count / perRow));
    const available = areaW - (this.phone ? PHONE_GEO.sidePad : SIDE_PAD) * 2 * scale;
    let cardW = Math.min(maxCardW, (available - gap * (perRow - 1)) / perRow);
    const bodyH = top - bottom;
    const rowsH = (rowsCount: number, width: number): number => rowsCount * width * aspect + (rowsCount - 1) * rowGap;
    if (rowsH(rows, cardW) > bodyH * 0.98) {
      cardW = ((bodyH * 0.98) - (rows - 1) * rowGap) / (rows * aspect);
    }
    const cardH = cardW * aspect;
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

  /** 手机全屏版:每排张数取"卡片最大"的那种(宽屏常是一排铺满),同宽时取行数少的。 */
  /** 钻石页横向滑动位置(手机):重绘(选支付方式 / 下单中)后保留。 */
  private rechargeScroll = 0;

  private bestTierGrid(areaW: number, top: number, bottom: number, scale: number, count: number, maxCardW: number): { cardW: number; slots: Array<{ x: number; y: number }> } {
    let best = this.tierGrid(areaW, top, bottom, scale, count, count, maxCardW);
    for (let perRow = count - 1; perRow >= 1; perRow -= 1) {
      const grid = this.tierGrid(areaW, top, bottom, scale, count, perRow, maxCardW);
      if (grid.cardW > best.cardW + 0.5) {
        best = grid;
      }
    }
    return best;
  }

  /** 小字标签盒高:手机端至少 26(工厂已把字抬到 20 号,盒子太矮会被 SHRINK 压回小字);电脑端原样。 */
  private lh(base: number, scale: number): number {
    return this.phone ? Math.max(base * scale, 26) : base * scale;
  }

  /** 卡内文字放大倍数:只在手机全屏版、卡比电脑版基准宽时放大(电脑端恒为 1)。 */
  private cardTextScale(cardW: number, baseW: number): number {
    if (!this.phone || baseW <= 0) {
      return 1;
    }
    return Math.max(1, Math.min(PHONE_TEXT_SCALE_MAX, cardW / baseW));
  }

  /**
   * 单张档位卡(2026-10-17 v2 按原型):半透明暗芯(透出大厅)→ 卡框(ornate 整图 / plain 细金框 + 标题带)→ 名字 → 带底座主图 →
   * 数额 → 单位 → 赠送签(暗绿尖角)→ 红金价格钮;纵向位置按原型量出的卡高比例。
   */
  private buildTierCard(parent: Node, name: string, x: number, y: number, cardW: number, style: CardStyle, scale: number, spec: TierCardSpec): void {
    // 卡内字号 / 标签高 / 描边统一乘 textScale(手机全屏版大卡同比放大;电脑端 1,不变)
    scale *= spec.textScale ?? 1;
    const ornate = style.kind === 'ornate';
    const cardH = cardW * style.aspect;
    const card = this.host.addChildPlainNode(parent, name, x, y, cardW, cardH);
    /** 卡顶往下 f(卡高比例)处的 y。纵向口径量自 GPT 原型(2026-10-17 v2「更还原原型图」)。 */
    const at = (f: number): number => cardH / 2 - cardH * f;
    const L = style.layout ?? (ornate ? ORNATE_CARD.layout : PLAIN_CARD_LAYOUT);
    const F = style.fonts ?? (ornate ? ORNATE_FONTS : PLAIN_FONTS);
    // 字号按卡高比例(量自原型,见 ORNATE_FONTS / PLAIN_FONTS / STAMINA_CARD)
    const fs = { name: cardH * F.name, amount: cardH * F.amount, unit: cardH * F.unit, tag: cardH * F.tag, price: cardH * F.price };
    /** 卡内单行字:行高 = 字号(默认 + 8 会超框被 SHRINK 压小)。 */
    const tight = (label: Label): void => {
      label.lineHeight = label.fontSize;
    };
    if (spec.ribbon && !ornate) {
      // 金色外发光(呼吸):几圈递减透明度的圆角描边,画在卡框后面(荆棘金框自带发光版,不再叠)
      const halo = this.host.addChildPlainNode(card, `${name}Halo`, 0, 0, cardW, cardH);
      const hg = halo.addComponent(Graphics);
      for (let ring = 0; ring < 5; ring += 1) {
        const grow = (3 + ring * 4) * scale;
        hg.strokeColor = rgba(255, 196, 90, 150 - ring * 28);
        hg.lineWidth = 5 * scale;
        hg.roundRect(-cardW / 2 - grow, -cardH / 2 - grow, cardW + grow * 2, cardH + grow * 2, 14 * scale + grow);
        hg.stroke();
      }
      const haloOpacity = halo.addComponent(UIOpacity);
      haloOpacity.opacity = 255;
      tween(haloOpacity).repeatForever(tween<UIOpacity>().to(0.9, { opacity: 120 }).to(0.9, { opacity: 255 })).start();
    }
    // 卡身半透明暗芯:原型里卡内透出背后的大厅(烛台 / 立柱),只压暗到能读字
    const body = card.addComponent(Graphics);
    const bodyLeft = -cardW / 2 + cardW * L.sideF;
    const bodyTop = at(L.bodyTopF);
    const bodyBottom = at(L.bodyBottomF);
    body.fillColor = rgba(8, 6, 9, 150);
    body.rect(bodyLeft, bodyBottom, cardW - cardW * L.sideF * 2, bodyTop - bodyBottom);
    body.fill();
    let nameY = at(L.bandF);
    let bandBottom = at(L.bandF + L.bandHF / 2);
    let nameW = cardW * 0.72;
    if (ornate) {
      // 荆棘金框整图(含顶饰尖 + 红标题带,一体构图只能等比);缺图退回细金框
      // (未缓存时 addSprite 返回空,加载完整页重画;不退回别的框,免得先闪一下旧样式)
      this.host.addSprite(`${name}Frame`, spec.ribbon ? ORNATE_CARD.bestPath : ORNATE_CARD.path, 0, 0, cardW, cardH, card);
    } else if (mountRefSliced(this.host, card, 'Frame', REF_KIT.cardFrameOpen, 0, 0, cardW, cardH)) {
      const fk = refCardFrameK(cardW, cardH);
      const bandH = cardH * L.bandHF;
      nameY = cardH / 2 - REF_CARD_FRAME_LINE.top * fk - bandH / 2;
      bandBottom = nameY - bandH / 2;
      mountRefHeaderBand(this.host, card, `${name}Band`, 0, nameY, cardW - REF_CARD_FRAME_LINE.side * fk * 2, bandH, scale, { center: true });
      raiseRefFrame(card);
      // 标题带左侧徽记:2026-10-20 用户「商店卡片的星也换成大四芒星」,与其它分区标题带同款(约 1 倍带高);缺图退回旧小徽记
      const textHalf = (spec.name.length * fs.name * 0.85) / 2;
      // 2026-10-22 A 方案:内层标题带改暗带 + 金线,四芒星换小金菱形
      const diamond = Math.max(10 * scale, bandH * 0.32);
      mountRefSectionDiamond(this.host, card, `${name}Emblem`, -textHalf - 10 * scale - diamond / 2, nameY, diamond);
      nameW = cardW * 0.64;
    }
    const nameLabel = this.host.addChildLabel(card, `${name}Name`, spec.name, 0, nameY, fs.name, rgba(255, 236, 196), new Size(nameW, fs.name * 1.4));
    nameLabel.overflow = Label.Overflow.SHRINK;
    nameLabel.isBold = true;
    tight(nameLabel);
    this.outline(nameLabel, scale, rgba(20, 8, 6, 255));
    // 主图:原型逐件出的带底座插画(金币 / 钻石 / 宝箱);体力 = 金环徽章里的药剂
    const illuY = at(L.illuF);
    const illuBox = Math.min(cardW * L.illuWF, cardH * L.illuHF);
    this.addTierIllustration(card, `${name}Icon`, spec.iconKey, spec.artKey, 0, illuY, cardW * L.illuWF, cardH * L.illuHF, scale, style.ringK);
    if (spec.badge) {
      const badge = this.host.addChildLabel(card, `${name}Badge`, spec.badge, illuBox * 0.42, illuY + illuBox * 0.4, cardH * 0.075, rgba(255, 240, 210), new Size(illuBox * 0.6, cardH * 0.09));
      badge.isBold = true;
      tight(badge);
      this.outline(badge, scale, rgba(20, 8, 6, 255));
    }
    const inner = cardW * 0.84;
    const amount = this.host.addChildLabel(card, `${name}Amount`, spec.amount, 0, at(L.amountF), fs.amount, rgba(255, 238, 210), new Size(inner, fs.amount * 1.25));
    amount.overflow = Label.Overflow.SHRINK;
    amount.isBold = true;
    tight(amount);
    this.outline(amount, scale, rgba(20, 8, 6, 255));
    const unit = this.host.addChildLabel(card, `${name}Unit`, spec.unit, 0, at(L.unitF), fs.unit, rgba(226, 214, 190), new Size(inner, fs.unit * 1.35));
    unit.overflow = Label.Overflow.SHRINK;
    tight(unit);
    this.outline(unit, scale, rgba(20, 8, 6, 255));
    if (spec.tag) {
      // 赠送签:暗绿底 + 金边 + 两端尖角(原型),字淡绿
      const tagH = fs.tag * 1.6;
      const tagW = Math.min(inner, Math.max(cardW * 0.56, spec.tag.length * fs.tag * 0.95 + tagH * 1.4));
      const tag = this.host.addChildPlainNode(card, `${name}Tag`, 0, at(L.tagF), tagW, tagH);
      const tg = tag.addComponent(Graphics);
      const tip = tagH * 0.42;
      const hexagon = (): void => {
        tg.moveTo(-tagW / 2, 0);
        tg.lineTo(-tagW / 2 + tip, tagH / 2);
        tg.lineTo(tagW / 2 - tip, tagH / 2);
        tg.lineTo(tagW / 2, 0);
        tg.lineTo(tagW / 2 - tip, -tagH / 2);
        tg.lineTo(-tagW / 2 + tip, -tagH / 2);
        tg.close();
      };
      tg.fillColor = rgba(16, 40, 22, 238);
      hexagon();
      tg.fill();
      tg.strokeColor = rgba(204, 168, 96, 235);
      tg.lineWidth = Math.max(1, 1.5 * scale);
      hexagon();
      tg.stroke();
      const tagLabel = this.host.addChildLabel(tag, `${name}TagText`, spec.tag, 0, 0, fs.tag, rgba(214, 242, 196), new Size(tagW - tip * 2, tagH));
      tagLabel.overflow = Label.Overflow.SHRINK;
      tight(tagLabel);
    }
    // 价格钮:原型红金主钮(两端金尖饰),钻石图标 + 数字 / ¥ 价格;整卡可点,钮只做展示
    const buttonW = cardW * 0.88;
    const buttonH = cardH * L.priceHF;
    mountRefButton(this.host, card, `${name}Buy`, spec.price, 0, at(L.priceF), buttonW, buttonH, scale, 'primary', undefined, {
      fontSize: fs.price,
      iconPath: spec.priceIcon?.path,
      iconSize: buttonH * 0.62,
    });
    if (spec.ribbon) {
      // 左上角斜角标:深红底金边,挂在标题带下面(不压名字)
      const rw = Math.max(92 * scale, spec.ribbon.length * 22 * scale + 26 * scale);
      const rh = 32 * scale;
      const ribbon = this.host.addChildPlainNode(card, `${name}Ribbon`, -cardW / 2 + rw * 0.42, bandBottom - rh * 0.7, rw, rh);
      ribbon.angle = 16;
      const rg = ribbon.addComponent(Graphics);
      rg.fillColor = rgba(150, 24, 20, 250);
      rg.roundRect(-rw / 2, -rh / 2, rw, rh, 5 * scale);
      rg.fill();
      rg.strokeColor = rgba(255, 220, 130, 255);
      rg.lineWidth = Math.max(1, 2 * scale);
      rg.roundRect(-rw / 2, -rh / 2, rw, rh, 5 * scale);
      rg.stroke();
      const ribbonText = this.host.addChildLabel(ribbon, `${name}RibbonText`, spec.ribbon, 0, 0, 20 * scale, rgba(255, 240, 190), new Size(rw - 10 * scale, rh));
      ribbonText.isBold = true;
      ribbonText.overflow = Label.Overflow.SHRINK;
      this.outline(ribbonText, scale, rgba(70, 10, 6, 255));
    }
    if (spec.dimmed) {
      const opacity = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);
      opacity.opacity = 150;
    }
    if (spec.enabled && spec.onTap) {
      const onTap = spec.onTap;
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, () => onTap(card.getWorldPosition()), this);
      this.host.applyImageButtonFeedback(card, 1.03, 0.97);
    }
  }

  /**
   * 档位主图(2026-10-17 v2):artKey(按档位编码挑的原型插画)→ iconKey 对应插画 → 旧图标拼图兜底。
   * 体力 = 金环徽章(icon_ring)+ 药剂 + 暖光,与原型一致。
   */
  private addTierIllustration(parent: Node, name: string, iconKey: string, artKey: string | undefined, cx: number, cy: number, maxW: number, maxH: number, scale: number, ringK = 1.02): void {
    if (iconKey === 'stamina') {
      const ring = Math.min(maxW * 0.86, maxH * ringK);
      this.drawGlow(parent, `${name}Glow`, cx, cy, ring * 0.36, [255, 120, 90], scale);
      if (!this.host.addSprite(`${name}Ring`, REF_ICON_RING_ASSET, cx, cy, ring, ring, parent)) {
        this.drawGlow(parent, `${name}GlowFallback`, cx, cy, ring * 0.46, [255, 110, 120], scale);
      }
      this.fitSprite(parent, name, ICONS.stamina, cx, cy, ring * 0.66);
      return;
    }
    const art = SHOP_ILLUSTRATIONS[artKey ?? ''] ?? SHOP_ILLUSTRATIONS[iconKey];
    if (art) {
      // 在 maxW × maxH 内等比放到最大;未缓存时先空着,加载完整页重画(不先闪旧图标拼图)
      const w = Math.min(maxW, maxH / art.aspect);
      this.host.addSprite(name, art.path, cx, cy, w, w * art.aspect, parent);
      return;
    }
    this.addTierIcon(parent, name, iconKey, cx, cy, Math.min(maxW, maxH));
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

  /**
   * 结果横幅(2026-09-24 用户:提示不够明显):圆角底 + 描边 + 大号加粗字,失败红 / 成功绿 / 其余(等待支付等)金;
   * 文案变化时弹一下(弹层会被 HUD 定时重挂,同一条提示不重复弹)。
   */
  private renderNoticeBanner(panel: Node, text: string, y: number, panelW: number, scale: number): void {
    const tone = /失败|不足|异常|拦截|超时|错误|不可用|不支持|不符|过期|频繁/.test(text) ? 'error' : /成功/.test(text) ? 'ok' : 'info';
    const palette = tone === 'error'
      ? { fill: rgba(96, 18, 18, 238), stroke: rgba(255, 110, 90, 255), text: rgba(255, 222, 210) }
      : tone === 'ok'
        ? { fill: rgba(18, 70, 34, 238), stroke: rgba(120, 225, 130, 255), text: rgba(215, 255, 218) }
        : { fill: rgba(70, 50, 16, 238), stroke: rgba(255, 205, 110, 255), text: rgba(255, 238, 190) };
    const fontSize = NOTICE_FONT * scale;
    const bannerH = 50 * scale;
    const bannerW = Math.min(panelW * 0.86, Math.max(360 * scale, text.length * fontSize * 0.95 + 64 * scale));
    const banner = this.host.addChildPlainNode(panel, 'LobbyShopNotice', 0, y, bannerW, bannerH);
    const g = banner.addComponent(Graphics);
    g.fillColor = palette.fill;
    g.roundRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, bannerH / 2);
    g.fill();
    g.strokeColor = palette.stroke;
    g.lineWidth = Math.max(1.5, 2.4 * scale);
    g.roundRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, bannerH / 2);
    g.stroke();
    const label = this.host.addChildLabel(banner, 'LobbyShopNoticeText', text, 0, 0, fontSize, palette.text, new Size(bannerW - 40 * scale, bannerH - 6 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    this.outline(label, scale, rgba(0, 0, 0, 255));
    if (text !== this.lastNotice) {
      this.lastNotice = text;
      banner.setScale(0.86, 0.86, 1);
      tween(banner)
        .to(0.14, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'backOut' })
        .to(0.1, { scale: new Vec3(1, 1, 1) })
        .start();
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
