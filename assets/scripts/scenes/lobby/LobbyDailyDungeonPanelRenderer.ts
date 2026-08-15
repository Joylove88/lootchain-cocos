import {
  BlockInputEvents,
  Button,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Node,
  Size,
  Sprite,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import type { BagItemEntryVO, LobbyBagPanelState } from '../../types/BagTypes';
import type {
  CrystalMineVO,
  DailyDungeonRewardVO,
  DailyDungeonThemeVO,
  DailyDungeonTierVO,
  LobbyCrystalRankState,
  LobbyDailyDungeonPanelState,
  LobbyTokenFurnaceState,
  TokenExchangeSummaryVO,
  TokenWithdrawOrderVO,
  TrialTierVO,
} from '../../types/DailyDungeonTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { C1812_BUTTON_PRIMARY_ASSET } from '../C1812CommonUiAssets';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { rgba, type UiLayout } from './LobbyHudTypes';

export interface LobbyDailyDungeonPanelHost {
  node: Node;
  currentLobbyDailyDungeonState(): LobbyDailyDungeonPanelState;
  currentLobbyProfile?(): PlayerLobbyProfileVO;
  closeLobbyDailyDungeonPanel(): void;
  reloadLobbyDailyDungeonSummary(): void;
  /** 只允许提交 DAILY_{THEME}_{TIER} 关卡码;真正的开放日/次数/解锁校验以后端为准。 */
  startLobbyDailyDungeonBattle(stageCode: string): void;
  /** 难度选中态存在渲染器实例里;切换选中后整页重绘,刷新行高亮与卡底按钮。 */
  refreshLobbyDailyDungeonPanel(): void;
  /** 奖励详情弹框读背包配置(useDesc/稀有度/已拥有);未加载时降级为客户端兜底文案。 */
  currentLobbyBagState?(): LobbyBagPanelState;
  /** 矿晶输出周榜(P金-1c):弹窗按需拉取。 */
  currentLobbyCrystalRankState?(): LobbyCrystalRankState;
  loadLobbyCrystalRankSummary?(force?: boolean): void;
  /** 矿晶熔炉(P金-2b):矿晶兑代币。弹窗开关+表单态存于 host,面板重建时回种。 */
  currentLobbyTokenFurnaceState?(): LobbyTokenFurnaceState;
  openLobbyTokenFurnace?(): void;
  closeLobbyTokenFurnace?(): void;
  loadLobbyTokenFurnaceSummary?(force?: boolean): void;
  /** 表单态变更并整页重绘(切链/选档位/开关绑定表单)。 */
  setLobbyTokenFurnaceForm?(patch: Partial<LobbyTokenFurnaceState>): void;
  /** EditBox 静默写入(不重绘,避免输入中途面板重建丢焦点)。 */
  setLobbyTokenFurnaceBindAddress?(text: string): void;
  setLobbyTokenFurnaceCustomAmount?(text: string): void;
  bindLobbyTokenWallet?(chain: string, address: string): void;
  submitLobbyTokenExchange?(crystalAmount: number): void;
  /** 创建 EditBox(需调用方 addChild 到父节点并定位);复用登录/创角同一工厂。 */
  addEditBox?(initialText: string, x: number, y: number, width: number): EditBox;
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

const WEEKDAY_TEXT = ['', '一', '二', '三', '四', '五', '六', '日'];
const TIER_ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'];

// 数字去尾零显示:5.0→"5",0.15→"0.15"(代币/额度用小数,避免长尾)。
function trimNum(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number(value.toFixed(4)).toString();
}

// 2026-08-05 界面素材(ui/daily/ai,用户出图;原图备份于 素材原始备份/daily_20260805)。
const DAILY_CARD_FRAME_NORMAL = 'ui/daily/ai/card_frame_normal/spriteFrame';   // 467×674
const DAILY_CARD_FRAME_ACTIVE = 'ui/daily/ai/card_frame_active/spriteFrame';   // 501×677
const DAILY_LOCK_BAR_ASSET = 'ui/daily/ai/card_frame_locked/spriteFrame';      // 490×120 横条
const DAILY_FOOTER_BG_ASSET = 'ui/daily/ai/footer_info_bg/spriteFrame';        // 1227×133
const DAILY_IC_NOTICE_ASSET = 'ui/daily/ai/ic_notice/spriteFrame';
const DAILY_IC_LOCK_ASSET = 'ui/daily/ai/ic_lock/spriteFrame';
const DAILY_TIER_BADGE_ASSETS = ['', 'ui/daily/ai/tier_1/spriteFrame', 'ui/daily/ai/tier_2/spriteFrame', 'ui/daily/ai/tier_3/spriteFrame'];  // 141×185
const DAILY_STAMINA_ICON_ASSET = 'ui/bag/ai/icon_stamina/spriteFrame';
// 主题场景图:按 theme.code 关键词映射;src 尺寸用于等比 cover 计算(只看比例,与实际像素同比即可)。
const DAILY_THEME_SCENE_ASSETS: Array<{ keyword: string; asset: string; srcWidth: number; srcHeight: number }> = [
  { keyword: 'AWAKEN', asset: 'ui/daily/ai/scene_awaken/spriteFrame', srcWidth: 430, srcHeight: 317 },
  { keyword: 'FORGE', asset: 'ui/daily/ai/scene_forge/spriteFrame', srcWidth: 430, srcHeight: 438 },
  { keyword: 'ARCANE', asset: 'ui/daily/ai/scene_arcane/spriteFrame', srcWidth: 466, srcHeight: 439 },
  { keyword: 'ABYSS', asset: 'ui/daily/ai/scene_abyss/spriteFrame', srcWidth: 429, srcHeight: 439 },
];

function resolveDailyThemeScene(code: string): { asset: string; srcWidth: number; srcHeight: number } | null {
  const upper = (code || '').toUpperCase();
  return DAILY_THEME_SCENE_ASSETS.find((entry) => upper.includes(entry.keyword)) ?? null;
}

// 奖励详情兜底文案:正式口径是背包配置表 useDesc(item_template.use_desc);仅背包未加载或无此道具时使用。
const DAILY_REWARD_FALLBACK_NOTES: Record<string, string> = {
  GOLD: '通用货币：装备强化、合成、洗练与英雄升级等消耗。',
  ENHANCE_STONE: '锻造强化装备的基础材料（+1 至 +10）。',
  ENHANCE_STONE_HIGH: '+10 以上强化所需的高阶强化材料。',
  DEEP_REFORGE_STONE: '英雄词条洗练（重铸）消耗的深渊重铸石。',
  EQUIP_REROLL_STONE: '装备词条洗练材料（锻造工坊洗练页）。',
  FUSION_LUCK_STONE: '装备合成成功率 +20%（锻造工坊合成页勾选）。',
};

/** 每日材料副本面板(2026-08-05 参考图改版):四主题素材卡,难度徽章+奖励图标格,顶部右侧体力。 */
export class LobbyDailyDungeonPanelRenderer {
  /** 每张主题卡当前选中的难度(实例态,不进 state;面板重开保留本会话内选择)。 */
  private readonly selectedTierByTheme = new Map<string, number>();
  /** 奖励详情弹框(悬浮预览/点击置顶,同召唤结果卡交互);整页重绘会连带销毁,引用一律 isValid 守卫。 */
  private panelNode: Node | null = null;
  private rewardTooltipNode: Node | null = null;
  private rewardTooltipSticky = false;
  /** 输出榜弹窗开关(实例态,整页重绘保留)。 */
  private rankPopupOpen = false;
  // 输出试炼档位阶梯弹窗:非空即展示(点难度Ⅲ奖励区打开)。
  private trialLadderPopupTiers: TrialTierVO[] | null = null;

  constructor(private readonly host: LobbyDailyDungeonPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyDailyDungeonState();
    const scale = Math.max(0.68, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(300 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.host.createUiNode('LobbyDailyDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.host.createUiNode('LobbyDailySceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyDailySceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(6, 6, 8, 232),
      rgba(190, 141, 62, 226),
      18 * scale,
    );

    // 整页重绘后旧弹框节点已随内容销毁,重置引用避免误判"已有置顶弹框"。
    this.panelNode = panel;
    this.rewardTooltipNode = null;
    this.rewardTooltipSticky = false;

    this.renderHeader(panel, panelWidth, panelHeight, scale, state);
    if (state.loading && !state.summary) {
      this.addCenterHint(panel, '正在读取每日副本…', rgba(214, 196, 156, 235), scale);
    } else if (state.error && !state.summary) {
      this.addCenterHint(panel, `读取失败：${state.error}`, rgba(255, 150, 130, 235), scale);
      this.renderRetryButton(panel, scale);
    } else if (state.summary) {
      this.renderThemeCards(panel, panelWidth, panelHeight, scale, state);
      // 熔炉/输出榜入口已收进底部矿脉信息条右端(同主题聚合),不再孤悬顶部体力条下。
      this.renderFooterBar(panel, panelWidth, panelHeight, scale, state.summary.crystalMine);
      if (this.rankPopupOpen) {
        this.renderCrystalRankPopup(panel, panelWidth, panelHeight, scale);
      }
      if (this.trialLadderPopupTiers && this.trialLadderPopupTiers.length > 0) {
        this.renderTrialLadderPopup(panel, panelWidth, panelHeight, scale, this.trialLadderPopupTiers);
      }
      if (this.host.currentLobbyTokenFurnaceState?.().open) {
        this.renderTokenFurnacePopup(panel, panelWidth, panelHeight, scale);
      }
    }
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyDailyBackButton', () => this.host.closeLobbyDailyDungeonPanel(), scale, '限时副本');
  }

  private renderHeader(parent: Node, width: number, height: number, scale: number, state: LobbyDailyDungeonPanelState): void {
    const title = this.host.addChildLabel(
      parent,
      'LobbyDailyTitle',
      '限时副本 · 每日轮换',
      0,
      height / 2 - 40 * scale,
      28 * scale,
      rgba(244, 220, 166, 255),
      new Size(width * 0.4, 38 * scale),
    );
    title.overflow = Label.Overflow.SHRINK;
    // 标题两侧坠饰线(参考图):现有 divider_gold 素材,右侧镜像。
    const dividerWidth = 130 * scale;
    const dividerHeight = dividerWidth * (164 / 800);
    const dividerGap = 150 * scale;
    const leftDivider = this.host.addSprite('LobbyDailyTitleDividerL', 'ui/common/ai/divider_gold/spriteFrame', -dividerGap - dividerWidth / 2, height / 2 - 40 * scale, dividerWidth, dividerHeight, parent);
    const rightDivider = this.host.addSprite('LobbyDailyTitleDividerR', 'ui/common/ai/divider_gold/spriteFrame', dividerGap + dividerWidth / 2, height / 2 - 40 * scale, dividerWidth, dividerHeight, parent);
    if (rightDivider) {
      rightDivider.node.setScale(-1, 1, 1);
    }
    void leftDivider;
    const day = state.summary?.todayDayOfWeek ?? 0;
    const stamina = state.summary?.staminaCost ?? 8;
    const subline = day >= 1 && day <= 7
      ? `今日周${WEEKDAY_TEXT[day]} · 每次挑战消耗体力 ${stamina} · 每主题每日 2 次(胜利才计次)`
      : `每次挑战消耗体力 ${stamina} · 每主题每日 2 次(胜利才计次)`;
    const sub = this.host.addChildLabel(
      parent,
      'LobbyDailySubtitle',
      subline,
      0,
      height / 2 - 72 * scale,
      15 * scale,
      rgba(203, 186, 152, 235),
      new Size(width * 0.8, 22 * scale),
    );
    sub.overflow = Label.Overflow.SHRINK;
    // 右上体力:与背包顶部货币胶囊同款(bag_currency_bar 素材,renderTopCurrencyBar 组件)。
    const profile = this.host.currentLobbyProfile?.();
    if (profile) {
      renderTopCurrencyBar(this.host, parent, width / 2, height / 2, scale, [
        { key: 'stamina', icon: DAILY_STAMINA_ICON_ASSET, value: `${profile.stamina}/${profile.maxStamina}` },
      ]);
    }
  }

  private renderThemeCards(parent: Node, width: number, height: number, scale: number, state: LobbyDailyDungeonPanelState): void {
    const summary = state.summary;
    if (!summary) {
      return;
    }
    const themes = summary.themes.slice(0, 4);
    const margin = 20 * scale;
    const gap = 10 * scale;
    const areaTop = height / 2 - 88 * scale;
    const areaBottom = -height / 2 + 68 * scale;
    const areaHeight = areaTop - areaBottom;
    const columnWidth = (width - margin * 2 - gap * (themes.length - 1)) / Math.max(1, themes.length);
    const cardHeight = Math.min(areaHeight, columnWidth * (1026 / 477));
    // 2026-08-12 定标:高度受限时允许卡框横向加宽到等比宽的 1.22 倍(框身直边,轻度拉宽不显),
    // 配合收窄间距(16→10)与边距(30→20),主题图窗变宽,竖向拉伸感减轻;整条卡带居中。
    const fitCardWidth = Math.min(columnWidth, cardHeight * (477 / 1026) * 1.22);
    const stripWidth = fitCardWidth * themes.length + gap * (themes.length - 1);
    const startX = -stripWidth / 2 + fitCardWidth / 2;
    const centerYPos = areaTop - cardHeight / 2;
    themes.forEach((theme, index) => {
      const x = startX + index * (fitCardWidth + gap);
      this.renderThemeCard(parent, theme, summary.staminaCost, x, centerYPos, fitCardWidth, cardHeight, scale, index);
    });
  }

  private renderThemeCard(
    parent: Node,
    theme: DailyDungeonThemeVO,
    staminaCost: number,
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
    index: number,
  ): void {
    const open = theme.openToday;
    const card = this.host.addChildPlainNode(parent, `LobbyDailyThemeCard_${theme.code || index}`, x, y, width, height);
    // 2026-08-12 终版层序:场景图先画垫底,卡框素材(场景窗已亮度键控镂空)后画盖上——
    // 框头横梁/肩部飘饰/内边框直接压在图上,顶部既无空白带也不存在图压饰。
    // 图窗放大到 8.5%~56%、宽 94%,超出镂空窗(实测 8.8%~55.8%,列 4.8%~95.2%)的
    // 部分被框身不透明区自然遮住;Mask 只负责防止 cover 裁切溢出卡外。
    const sceneWidth = width * 0.94;
    const sceneHeight = height * 0.475;
    const sceneY = height / 2 - height * 0.085 - sceneHeight / 2;
    const scene = resolveDailyThemeScene(theme.code);
    let sceneShown = false;
    if (scene) {
      const sceneWindow = this.host.addChildPlainNode(card, `ThemeSceneWindow_${index}`, 0, sceneY, sceneWidth, sceneHeight);
      sceneWindow.addComponent(Mask);
      const cover = Math.max(sceneWidth / scene.srcWidth, sceneHeight / scene.srcHeight);
      sceneShown = !!this.host.addSprite(`ThemeScene_${index}`, scene.asset, 0, 0, scene.srcWidth * cover, scene.srcHeight * cover, sceneWindow);
      if (!sceneShown) {
        sceneWindow.destroy();
      }
    }
    if (!sceneShown) {
      const sceneNode = this.host.addChildPlainNode(card, `ThemeScenePlaceholder_${index}`, 0, sceneY, sceneWidth, sceneHeight);
      const sceneGraphics = sceneNode.addComponent(Graphics);
      sceneGraphics.fillColor = rgba(4, 4, 6, open ? 150 : 175);
      sceneGraphics.roundRect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, sceneHeight, 6 * scale);
      sceneGraphics.fill();
      sceneGraphics.strokeColor = rgba(150, 116, 62, open ? 130 : 80);
      sceneGraphics.lineWidth = Math.max(1, scale);
      sceneGraphics.roundRect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, sceneHeight, 6 * scale);
      sceneGraphics.stroke();
    }
    // 框素材后画:镂空窗区透出场景图,不透明区(边框/头饰/下半行框)盖住图的溢出。
    const frameAsset = open ? DAILY_CARD_FRAME_ACTIVE : DAILY_CARD_FRAME_NORMAL;
    if (!this.host.addSprite(`LobbyDailyThemeFrame_${index}`, frameAsset, 0, 0, width, height, card)) {
      const fallback = card.addComponent(Graphics);
      fallback.fillColor = open ? rgba(18, 14, 11, 236) : rgba(11, 11, 13, 230);
      fallback.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
      fallback.fill();
      fallback.strokeColor = open ? rgba(226, 177, 92, 235) : rgba(96, 88, 74, 170);
      fallback.lineWidth = Math.max(1, 1.4 * scale);
      fallback.roundRect(-width / 2, -height / 2, width, height, 10 * scale);
      fallback.stroke();
    }

    // 头部三行(在框之后创建=最上层,浮于图上):2026-08-12 定标——标题下移 50 设计px 到 15.9%,
    // 开放/状态行贴排(行距 3.3%/3.0%),不再上下散开。
    const title = this.host.addChildLabel(card, 'ThemeName', theme.name || theme.code, 0, height / 2 - height * 0.159, 24 * scale, open ? rgba(250, 226, 160, 255) : rgba(216, 198, 162, 245), new Size(width * 0.66, 32 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 225);
    title.outlineWidth = Math.max(1, 1.5 * scale);
    const daysText = `开放：周${theme.openDays.map((d) => WEEKDAY_TEXT[d] ?? '?').join('/')}`;
    const days = this.host.addChildLabel(card, 'ThemeDays', daysText, 0, height / 2 - height * 0.192, 15 * scale, rgba(205, 189, 156, 235), new Size(width * 0.72, 20 * scale));
    days.overflow = Label.Overflow.SHRINK;
    days.enableOutline = true;
    days.outlineColor = rgba(0, 0, 0, 225);
    days.outlineWidth = Math.max(1, 1.5 * scale);
    const statusText = open ? `今日开放 · 次数 ${theme.usedToday}/${theme.timesPerDay}` : '今日未开放';
    const status = this.host.addChildLabel(
      card,
      'ThemeStatus',
      statusText,
      0,
      height / 2 - height * 0.222,
      16 * scale,
      open ? rgba(168, 232, 168, 255) : rgba(196, 182, 158, 245),
      new Size(width * 0.74, 22 * scale),
    );
    status.overflow = Label.Overflow.SHRINK;
    status.enableOutline = true;
    status.outlineColor = rgba(0, 0, 0, 235);
    status.outlineWidth = Math.max(1, 1.5 * scale);

    // 交互改版(2026-08-11):难度行只做「选择」,挑战入口收敛到卡底行动区。
    // 卡底(素材锁行区 87.2%~95.4%)跟随选中难度切换:未解锁=解锁条件条 / 未开放·次数用尽=灰条 / 可挑战=挑战按钮。
    const selectedTierNo = this.resolveSelectedTier(theme);
    const selectedTier = theme.tiers.find((tier) => tier.tier === selectedTierNo) ?? theme.tiers[0];
    if (selectedTier) {
      this.renderCardAction(card, theme, selectedTier, width, height, scale);
    }

    // 难度三行:对准卡框素材自带的行框(PIL 实测分界线 56.1%/68.1%/79.5%/87.2%)。
    // 素材行3 框格(79.5%~87.2%)比行1/2 矮,单独给中心与高度,行底不再压锁行区分界线。
    const TIER_ROWS = [
      { center: 0.621, blockHeight: height * 0.104 },
      { center: 0.738, blockHeight: height * 0.104 },
      { center: 0.834, blockHeight: height * 0.07 },
    ];
    theme.tiers.slice(0, 3).forEach((tier, tierIndex) => {
      const row = TIER_ROWS[tierIndex] ?? TIER_ROWS[2];
      const tierY = height / 2 - height * row.center;
      this.renderTierBlock(card, theme, tier, tierY, width, row.blockHeight, scale, tier.tier === selectedTierNo);
    });
    void staminaCost;
  }

  /** 选中难度:默认最高已解锁档;记忆值失效(数据变化)时同样回落。 */
  private resolveSelectedTier(theme: DailyDungeonThemeVO): number {
    const tiers = theme.tiers.slice(0, 3);
    const stored = this.selectedTierByTheme.get(theme.code);
    if (stored !== undefined && tiers.some((tier) => tier.tier === stored)) {
      return stored;
    }
    for (let i = tiers.length - 1; i >= 0; i -= 1) {
      if (tiers[i].unlocked) {
        return tiers[i].tier;
      }
    }
    return tiers[0]?.tier ?? 1;
  }

  /** 卡底行动区:对准素材锁行区(87.2%~95.4%,中心 91.3%),按选中难度的可挑战状态三态切换。 */
  private renderCardAction(
    card: Node,
    theme: DailyDungeonThemeVO,
    tier: DailyDungeonTierVO,
    cardWidth: number,
    cardHeight: number,
    scale: number,
  ): void {
    const centerY = cardHeight / 2 - cardHeight * 0.913;
    if (!tier.unlocked) {
      this.renderCardActionBar(card, `通关 ${tier.unlockStageCode} 解锁`, centerY, cardWidth, cardHeight, scale);
      return;
    }
    if (!theme.openToday) {
      this.renderCardActionBar(card, '今日未开放', centerY, cardWidth, cardHeight, scale);
      return;
    }
    if (theme.usedToday >= theme.timesPerDay) {
      this.renderCardActionBar(card, '今日次数已用完', centerY, cardWidth, cardHeight, scale);
      return;
    }
    const buttonHeight = cardHeight * 0.066;
    const buttonWidth = Math.min(cardWidth * 0.64, buttonHeight * (740 / 211));
    const button = this.host.addChildPlainNode(card, 'ThemeChallengeButton', 0, centerY, buttonWidth, buttonHeight);
    if (!this.host.addSprite('ThemeChallengeButtonBg', C1812_BUTTON_PRIMARY_ASSET, 0, 0, buttonWidth, buttonHeight, button)) {
      const g = button.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 26, 235);
      g.roundRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 5 * scale);
      g.fill();
    }
    const label = this.host.addChildLabel(
      button,
      'ThemeChallengeLabel',
      `挑战 难度${TIER_ROMAN[tier.tier] ?? tier.tier}`,
      0,
      0,
      15 * scale,
      rgba(255, 240, 205, 255),
      new Size(buttonWidth - 16 * scale, 20 * scale),
    );
    label.overflow = Label.Overflow.SHRINK;
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => this.host.startLobbyDailyDungeonBattle(tier.stageCode), this);
    this.host.applyImageButtonFeedback(button, 1.04, 0.96);
  }

  /** 不可挑战三态共用的灰条(锁条素材自带锁图记,承担"不可用"视觉)。 */
  private renderCardActionBar(card: Node, text: string, centerY: number, cardWidth: number, cardHeight: number, scale: number): void {
    const barHeight = cardHeight * 0.05;
    const barWidth = Math.min(cardWidth * 0.74, barHeight * (607 / 118));
    const bar = this.host.addChildPlainNode(card, 'ThemeLockBar', 0, centerY, barWidth, barHeight);
    if (!this.host.addSprite('ThemeLockBarBg', DAILY_LOCK_BAR_ASSET, 0, 0, barWidth, barHeight, bar)) {
      const g = bar.addComponent(Graphics);
      g.fillColor = rgba(12, 12, 14, 215);
      g.roundRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, 6 * scale);
      g.fill();
    }
    const lockText = this.host.addChildLabel(bar, 'ThemeLockText', text, 0, 0, 15 * scale, rgba(206, 190, 156, 240), new Size(barWidth * 0.76, 20 * scale));
    lockText.overflow = Label.Overflow.SHRINK;
  }

  // ── 奖励物品详情弹框(悬浮=轻量预览,点击=置顶+遮罩,交互同召唤结果卡) ──

  private showRewardDetail(reward: DailyDungeonRewardVO, scale: number, sticky: boolean): void {
    const panel = this.panelNode;
    if (!panel || !panel.isValid) {
      return;
    }
    if (this.rewardTooltipSticky && !sticky) {
      return;
    }
    this.hideRewardTooltip(true);
    let holder: Node = panel;
    if (sticky) {
      const overlay = this.host.addChildPlainNode(panel, 'DailyRewardInfoOverlay', 0, 0, 4000, 4000);
      overlay.addComponent(BlockInputEvents);
      const og = overlay.addComponent(Graphics);
      og.fillColor = rgba(0, 0, 0, 152);
      og.rect(-2000, -2000, 4000, 4000);
      og.fill();
      overlay.addComponent(Button);
      overlay.on(Button.EventType.CLICK, () => this.hideRewardTooltip(true), this);
      holder = overlay;
    }
    const content = this.buildRewardInfoCard(holder, reward, scale);
    this.rewardTooltipNode = sticky ? holder : content;
    this.rewardTooltipSticky = sticky;
  }

  private hideRewardTooltip(force: boolean): void {
    if (!force && this.rewardTooltipSticky) {
      return;
    }
    if (this.rewardTooltipNode && this.rewardTooltipNode.isValid) {
      this.rewardTooltipNode.destroy();
    }
    this.rewardTooltipNode = null;
    this.rewardTooltipSticky = false;
  }

  /** 信息卡:名称/稀有度·类别/图标/单次产出/已拥有/用途;数据优先背包配置表(useDesc/稀有度/数量)。 */
  private buildRewardInfoCard(parent: Node, reward: DailyDungeonRewardVO, scale: number): Node {
    const code = (reward.resourceCode || '').toUpperCase();
    const lookup = this.findBagReward(code);
    const isCurrency = (reward.resourceType || '').toUpperCase() === 'CURRENCY' || code === 'GOLD' || code === 'DIAMOND';
    const tone = lookup.entry ? rarityTone(lookup.entry.rarity) : rgba(238, 210, 148, 255);
    const w = 400 * scale;
    const h = 268 * scale;
    const card = this.host.addChildPlainNode(parent, 'DailyRewardInfoCard', 0, 0, w, h);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(11, 9, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = tone;
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();

    const title = this.host.addChildLabel(card, 'Title', reward.resourceName || code, 0, h / 2 - 32 * scale, 21 * scale, tone, new Size(w - 44 * scale, 28 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 225);
    title.outlineWidth = Math.max(1, 1.4 * scale);
    const categoryText = lookup.entry
      ? `${(lookup.entry.rarity || 'N').toUpperCase()} · ${lookup.groupLabel || (isCurrency ? '货币' : '材料')}`
      : isCurrency ? '货币' : '材料';
    const category = this.host.addChildLabel(card, 'Category', categoryText, 0, h / 2 - 60 * scale, 16 * scale, rgba(196, 178, 140, 245), new Size(w - 48 * scale, 20 * scale));
    category.overflow = Label.Overflow.SHRINK;

    // 展示图:与行内奖励格同一图标映射。
    const iconSize = 52 * scale;
    const iconY = h / 2 - 100 * scale;
    const iconHolder = this.host.addChildPlainNode(card, 'IconHolder', 0, iconY, iconSize, iconSize);
    const ig = iconHolder.addComponent(Graphics);
    ig.fillColor = rgba(7, 7, 9, 225);
    ig.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 6 * scale);
    ig.fill();
    ig.strokeColor = tone;
    ig.lineWidth = Math.max(1, 1.2 * scale);
    ig.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 6 * scale);
    ig.stroke();
    const iconAsset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
    if (iconAsset) {
      this.host.addSprite('Icon', iconAsset, 0, 0, iconSize - 6 * scale, iconSize - 6 * scale, iconHolder);
    }

    const left = -w / 2 + 30 * scale;
    const rowWidth = w - 60 * scale;
    let cursor = h / 2 - 150 * scale;
    const addRow = (rowName: string, text: string, color: Color): void => {
      const row = this.host.addChildLabel(card, rowName, text, left, cursor, 16 * scale, color, new Size(rowWidth, 20 * scale), HorizontalTextAlignment.LEFT);
      row.overflow = Label.Overflow.SHRINK;
      cursor -= 27 * scale;
    };
    addRow('ObtainRow', `单次产出：×${formatAmount(reward.amount)}`, rgba(236, 222, 190, 250));
    const ownedText = this.resolveOwnedText(code, lookup);
    if (ownedText) {
      addRow('OwnedRow', ownedText, rgba(250, 214, 128, 250));
    }
    // 用途:背包配置表 useDesc 优先,缺失走客户端兜底文案;两行内自适应。
    const noteText = (lookup.entry?.useDesc || '').trim()
      || DAILY_REWARD_FALLBACK_NOTES[code]
      || (isCurrency ? '通用货币，可在主城顶部资源栏查看余额。' : '养成材料，可在背包查看详细用途与来源。');
    const note = this.host.addChildLabel(card, 'NoteRow', noteText, left, -h / 2 + 40 * scale, 15 * scale, rgba(178, 162, 132, 245), new Size(rowWidth, 42 * scale), HorizontalTextAlignment.LEFT);
    note.lineHeight = 20 * scale;
    note.overflow = Label.Overflow.SHRINK;
    return card;
  }

  private resolveOwnedText(code: string, lookup: { entry: BagItemEntryVO | null; loaded: boolean }): string | null {
    if (code === 'GOLD' || code === 'DIAMOND') {
      const profile = this.host.currentLobbyProfile?.();
      const raw = code === 'GOLD' ? profile?.gold : profile?.diamond;
      if (raw !== undefined && raw !== null) {
        return `已拥有：${formatAmount(Math.trunc(Number(raw) || 0))}`;
      }
      return null;
    }
    if (lookup.entry) {
      return `已拥有：×${formatAmount(lookup.entry.itemCount)}`;
    }
    // 背包已加载但没有该道具=确实没有;未加载则不显示,避免误报 ×0。
    return lookup.loaded ? '已拥有：×0' : null;
  }

  private findBagReward(code: string): { entry: BagItemEntryVO | null; loaded: boolean; groupLabel: string } {
    const state = this.host.currentLobbyBagState?.();
    if (!state || !state.loaded) {
      return { entry: null, loaded: false, groupLabel: '' };
    }
    for (const group of state.groups) {
      const entry = group.items.find((item) => (item.itemCode || '').toUpperCase() === code);
      if (entry) {
        return { entry, loaded: true, groupLabel: group.itemTypeLabel || '' };
      }
    }
    return { entry: null, loaded: true, groupLabel: '' };
  }

  private renderTierBlock(
    card: Node,
    theme: DailyDungeonThemeVO,
    tier: DailyDungeonTierVO,
    y: number,
    cardWidth: number,
    blockHeight: number,
    scale: number,
    selected: boolean,
  ): void {
    const width = cardWidth * 0.78;
    const block = this.host.addChildPlainNode(card, `TierBlock_${tier.tier}`, 0, y, width, blockHeight);
    const available = theme.openToday && tier.unlocked && theme.usedToday < theme.timesPerDay;
    // 行=难度选择项:选中行画金框微光(不可挑战的选中行降亮度,只表达"当前查看");其余行素朴。
    if (selected) {
      const glow = block.addComponent(Graphics);
      glow.fillColor = rgba(214, 158, 72, available ? 30 : 16);
      glow.roundRect(-width / 2, -blockHeight / 2, width, blockHeight, 7 * scale);
      glow.fill();
      glow.strokeColor = rgba(240, 194, 104, available ? 225 : 145);
      glow.lineWidth = Math.max(1.2, 1.6 * scale);
      glow.roundRect(-width / 2, -blockHeight / 2, width, blockHeight, 7 * scale);
      glow.stroke();
    }

    const contentCenterY = 0;
    const contentHeight = blockHeight;

    // 难度徽章素材(141×185),缺失回退文字。
    const badgeHeight = Math.min(contentHeight * 0.78, 54 * scale);
    const badgeWidth = badgeHeight * (141 / 185);
    const badgeX = -width / 2 + badgeWidth / 2 + 9 * scale;
    if (!this.host.addSprite(`TierBadge_${tier.tier}`, DAILY_TIER_BADGE_ASSETS[tier.tier] ?? '', badgeX, contentCenterY, badgeWidth, badgeHeight, block)) {
      const name = this.host.addChildLabel(block, 'TierName', `难度${TIER_ROMAN[tier.tier] ?? tier.tier}`, badgeX, contentCenterY, 15 * scale, rgba(240, 219, 168, 250), new Size(badgeWidth + 22 * scale, 20 * scale));
      name.overflow = Label.Overflow.SHRINK;
    }

    // 奖励改版(2026-08-11):固定四格网格、不足项居中,图标+右下角数量。
    // 输出试炼(难度Ⅲ,docs/27 v3):不是固定材料,改显"矿晶按输出档"摘要,点击看完整档位阶梯。
    const rewardLeft = badgeX + badgeWidth / 2 + 8 * scale;
    const rewardRight = width / 2 - 8 * scale;
    const rewardAreaWidth = Math.max(30 * scale, rewardRight - rewardLeft);
    const trialTiers = tier.tier === 3 ? (tier.outputTiers ?? []) : [];
    if (trialTiers.length > 0) {
      const centerX = (rewardLeft + rewardRight) / 2;
      const iconSize = Math.max(24 * scale, Math.min(contentHeight * 0.58, 44 * scale));
      const crystals = trialTiers.map((t) => t.crystalAmount);
      const minC = Math.min(...crystals);
      const maxC = Math.max(...crystals);
      const iconX = rewardLeft + iconSize / 2 + 2 * scale;
      const crystalIcon = resolveBagStyleItemIconAsset('SACRED_CRYSTAL', 'CURRENCY');
      if (crystalIcon) {
        this.host.addSprite('TierTrialCrystalIcon', crystalIcon, iconX, contentCenterY, iconSize, iconSize, block);
      }
      const textLeft = iconX + iconSize / 2 + 8 * scale;
      const textW = Math.max(40 * scale, rewardRight - textLeft);
      const l1 = this.host.addChildLabel(block, 'TierTrialLine1', `输出试炼 · 矿晶 ${minC}~${maxC}`, textLeft + textW / 2, contentCenterY + 9 * scale, 14 * scale, rgba(250, 226, 160, 250), new Size(textW, 18 * scale));
      l1.overflow = Label.Overflow.SHRINK;
      const l2 = this.host.addChildLabel(block, 'TierTrialLine2', '限时拼输出，档位越高越多 ›', textLeft + textW / 2, contentCenterY - 10 * scale, 12 * scale, rgba(196, 182, 152, 235), new Size(textW, 16 * scale));
      l2.overflow = Label.Overflow.SHRINK;
      if (!available) {
        const dim = block.getComponent(UIOpacity) ?? block.addComponent(UIOpacity);
        void dim; // 不整块降透明以免压掉选中高亮;文字已足够区分
      }
      // 点击奖励区看完整档位阶梯(自带 Button 吞点击,不连带触发整行选中)。
      const hit = this.host.addChildPlainNode(block, 'TierTrialHit', centerX, contentCenterY, rewardAreaWidth, contentHeight);
      hit.addComponent(Button);
      hit.on(Button.EventType.CLICK, () => {
        this.trialLadderPopupTiers = trialTiers;
        this.host.refreshLobbyDailyDungeonPanel();
      }, this);
      // 整行(奖励区外)点击=选中该难度,与 Ⅰ/Ⅱ 一致。
      block.addComponent(Button);
      block.on(Button.EventType.CLICK, () => {
        if (this.resolveSelectedTier(theme) !== tier.tier) {
          this.selectedTierByTheme.set(theme.code, tier.tier);
          this.host.refreshLobbyDailyDungeonPanel();
        }
      }, this);
      this.host.applyImageButtonFeedback(block, 1.01, 0.99);
      return;
    }
    const rewards = tier.rewards.slice(0, 4);
    if (rewards.length === 0) {
      const hint = this.host.addChildLabel(block, 'TierRewardsEmpty', '产出配置读取中', (rewardLeft + rewardRight) / 2, contentCenterY, 14 * scale, rgba(158, 148, 130, 205), new Size(rewardAreaWidth, 20 * scale));
      hint.overflow = Label.Overflow.SHRINK;
    } else {
      const cellWidth = rewardAreaWidth / 4;
      const gridLeft = (rewardLeft + rewardRight) / 2 - (cellWidth * rewards.length) / 2;
      const iconSize = Math.max(26 * scale, Math.min(cellWidth - 6 * scale, contentHeight * 0.66, 50 * scale));
      rewards.forEach((reward, rewardIndex) => {
        const cellX = gridLeft + cellWidth * rewardIndex + cellWidth / 2;
        const iconAsset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
        const slot = this.host.addChildPlainNode(block, `TierRewardSlot_${rewardIndex}`, cellX, contentCenterY, iconSize, iconSize);
        const slotGraphics = slot.addComponent(Graphics);
        slotGraphics.fillColor = rgba(7, 7, 9, 215);
        slotGraphics.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 5 * scale);
        slotGraphics.fill();
        slotGraphics.strokeColor = rgba(178, 140, 74, available ? 215 : 140);
        slotGraphics.lineWidth = Math.max(1, scale);
        slotGraphics.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 5 * scale);
        slotGraphics.stroke();
        if (iconAsset) {
          this.host.addSprite(`TierRewardIcon_${rewardIndex}`, iconAsset, 0, 0, iconSize - 5 * scale, iconSize - 5 * scale, slot);
        }
        // 数量压图标右下角(黑描边保可读),与胜利弹窗/背包同一图标映射自解释道具。
        const count = this.host.addChildLabel(
          slot,
          'TierRewardCount',
          `×${formatAmount(reward.amount)}`,
          iconSize / 2 - 2 * scale,
          -iconSize / 2 + 7 * scale,
          12 * scale,
          rgba(255, 244, 214, 255),
          new Size(iconSize, 15 * scale),
          HorizontalTextAlignment.RIGHT,
        );
        count.overflow = Label.Overflow.SHRINK;
        count.enableOutline = true;
        count.outlineColor = rgba(0, 0, 0, 235);
        count.outlineWidth = Math.max(1, 1.5 * scale);
        if (!available) {
          // 今日不可挑战的行:图标降透明度,与开放卡形成明确视觉区分。
          const dim = slot.getComponent(UIOpacity) ?? slot.addComponent(UIOpacity);
          dim.opacity = 150;
        }
        // 物品详情:悬浮预览/点击置顶(同召唤结果卡);格上 Button 会吞掉触摸,不会连带触发行选中。
        slot.addComponent(Button);
        slot.on(Button.EventType.CLICK, () => this.showRewardDetail(reward, scale, true), this);
        slot.on(Node.EventType.MOUSE_ENTER, () => this.showRewardDetail(reward, scale, false), this);
        slot.on(Node.EventType.MOUSE_LEAVE, () => this.hideRewardTooltip(false), this);
      });
    }

    // 整行点击=选中该难度(未解锁行也可选,便于在卡底查看解锁条件);点已选中行不重绘。
    block.addComponent(Button);
    block.on(Button.EventType.CLICK, () => {
      if (this.resolveSelectedTier(theme) !== tier.tier) {
        this.selectedTierByTheme.set(theme.code, tier.tier);
        this.host.refreshLobbyDailyDungeonPanel();
      }
    }, this);
    this.host.applyImageButtonFeedback(block, 1.01, 0.99);
  }

  // 底部信息条:素材横条+感叹号;矿晶矿脉数据就位后展示矿脉余量,否则回落原提示文案。
  private renderFooterBar(parent: Node, width: number, height: number, scale: number, mine: CrystalMineVO | null): void {
    const barWidth = Math.min(width * 0.6, 760 * scale);
    const barHeight = barWidth * (133 / 1227);
    const bar = this.host.addChildPlainNode(parent, 'LobbyDailyFooterBar', 0, -height / 2 + 36 * scale, barWidth, barHeight);
    if (!this.host.addSprite('LobbyDailyFooterBg', DAILY_FOOTER_BG_ASSET, 0, 0, barWidth, barHeight, bar)) {
      const g = bar.addComponent(Graphics);
      g.fillColor = rgba(12, 10, 9, 215);
      g.roundRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, 8 * scale);
      g.fill();
    }
    const iconSize = barHeight * 0.5;
    this.host.addSprite('LobbyDailyFooterIcon', DAILY_IC_NOTICE_ASSET, -barWidth / 2 + iconSize / 2 + barWidth * 0.06, 0, iconSize * (87 / 83), iconSize, bar);
    // 矿脉文案(P金-1c,docs/27):余量=全服分池预算合计-已产出;未解锁提示门槛。
    let footerText = '限时副本奖励丰厚，每日轮换不同主题，挑战更高难度可获得更稀有奖励！';
    let footerColor = rgba(224, 202, 158, 240);
    if (mine) {
      if (!mine.unlocked) {
        footerText = '矿晶矿脉:通关 MAIN_3_1 后,副本胜利有几率掉落矿晶(打金结算积分)。';
        footerColor = rgba(196, 182, 158, 235);
      } else {
        const remain = Math.max(0, mine.dailyBudgetTotal - mine.dailyUsedTotal);
        footerText = `今日矿脉余量 ${remain}/${mine.dailyBudgetTotal} · 我的矿晶掉落 ${mine.myTodayDrop}/${mine.myDailyCap}`;
        footerColor = rgba(186, 226, 255, 245);
      }
    }
    // 文案让出右端 30% 给两个矿晶功能胶囊(熔炉/输出榜):同主题聚合在矿脉条内,不再孤悬顶部。
    const text = this.host.addChildLabel(
      bar,
      'LobbyDailyFooterText',
      footerText,
      -barWidth * 0.06 + iconSize * 0.5,
      0,
      15 * scale,
      footerColor,
      new Size(barWidth * 0.56, 22 * scale),
    );
    text.overflow = Label.Overflow.SHRINK;
    // 右端两个紧凑胶囊按钮:矿晶熔炉 | 输出榜。
    const pillW = barWidth * 0.125;
    const pillH = barHeight * 0.5;
    const pillGap = barWidth * 0.012;
    const rightEdge = barWidth / 2 - barWidth * 0.045;
    this.renderFooterPill(bar, 'LobbyDailyFurnacePill', '矿晶熔炉', rightEdge - pillW * 1.5 - pillGap, 0, pillW, pillH, scale, () => this.host.openLobbyTokenFurnace?.());
    this.renderFooterPill(bar, 'LobbyDailyRankPill', '输出榜', rightEdge - pillW / 2, 0, pillW, pillH, scale, () => {
      this.rankPopupOpen = true;
      this.host.loadLobbyCrystalRankSummary?.();
      this.host.refreshLobbyDailyDungeonPanel();
    });
  }

  private renderFooterPill(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, scale: number, onClick: () => void): void {
    const pill = this.host.addChildPlainNode(parent, name, x, y, w, h);
    const g = pill.addComponent(Graphics);
    g.fillColor = rgba(38, 24, 16, 235);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    g.strokeColor = rgba(214, 168, 92, 225);
    g.lineWidth = Math.max(1, 1.3 * scale);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.stroke();
    const label = this.host.addChildLabel(pill, `${name}Label`, text, 0, 0, 13.5 * scale, rgba(255, 234, 176, 255), new Size(w - 8 * scale, h - 4 * scale));
    label.overflow = Label.Overflow.SHRINK;
    pill.addComponent(Button);
    pill.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(pill, 1.06, 0.95);
  }

  // 输出周榜弹窗(P金-1c,docs/27):我的分数/排名+榜单前列+阶梯表+上周结果。
  private renderCrystalRankPopup(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const overlay = this.host.addChildPlainNode(parent, 'LobbyDailyRankOverlay', 0, 0, panelWidth * 2, panelHeight * 2);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 165);
    og.rect(-panelWidth, -panelHeight, panelWidth * 2, panelHeight * 2);
    og.fill();
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => {
      this.rankPopupOpen = false;
      this.host.refreshLobbyDailyDungeonPanel();
    }, this);

    const w = Math.min(680 * scale, panelWidth * 0.74);
    const h = Math.min(600 * scale, panelHeight * 0.94);
    const card = this.host.addChildPlainNode(overlay, 'LobbyDailyRankCard', 0, 0, w, h);
    card.addComponent(BlockInputEvents);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(11, 9, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.fill();
    g.strokeColor = rgba(214, 168, 92, 235);
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.stroke();

    const rankState = this.host.currentLobbyCrystalRankState?.();
    const summary = rankState?.summary ?? null;
    const title = this.host.addChildLabel(card, 'RankTitle', summary ? `输出周榜 · ${summary.weekKey}` : '输出周榜', 0, h / 2 - 34 * scale, 26 * scale, rgba(244, 220, 166, 255), new Size(w - 60 * scale, 34 * scale));
    title.overflow = Label.Overflow.SHRINK;

    if (!rankState || rankState.loading) {
      const hint = this.host.addChildLabel(card, 'RankLoading', '正在读取周榜…', 0, 0, 18 * scale, rgba(214, 196, 156, 235), new Size(w - 80 * scale, 24 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      return;
    }
    if (rankState.error && !summary) {
      const hint = this.host.addChildLabel(card, 'RankError', `读取失败：${rankState.error}`, 0, 0, 15 * scale, rgba(255, 150, 130, 235), new Size(w - 80 * scale, 40 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      return;
    }
    if (!summary) {
      return;
    }

    const left = -w / 2 + 30 * scale;
    const lineWidth = w - 60 * scale;
    const days = Math.floor(summary.secondsToWeekEnd / 86400);
    const hours = Math.floor((summary.secondsToWeekEnd % 86400) / 3600);
    const sub = this.host.addChildLabel(card, 'RankSub', `周一 0 点结算 · 距结算 ${days} 天 ${hours} 小时`, 0, h / 2 - 64 * scale, 15 * scale, rgba(196, 182, 152, 235), new Size(lineWidth, 20 * scale));
    sub.overflow = Label.Overflow.SHRINK;
    const mineLine = this.host.addChildLabel(
      card,
      'RankMine',
      `我的：今日 ${summary.myTodayScore} · 本周 ${summary.myWeekScore} · 排名 ${summary.myRank > 0 ? `第${summary.myRank}名` : '未上榜'}`,
      left,
      h / 2 - 92 * scale,
      17 * scale,
      rgba(250, 226, 160, 250),
      new Size(lineWidth, 20 * scale),
      HorizontalTextAlignment.LEFT,
    );
    mineLine.overflow = Label.Overflow.SHRINK;

    // 榜单前列(前 8):我的行金色高亮。
    let cursor = h / 2 - 124 * scale;
    const topRows = summary.topList.slice(0, 8);
    if (topRows.length === 0) {
      const empty = this.host.addChildLabel(card, 'RankEmpty', '本周暂无人上榜——打一场难度Ⅲ抢头名!', left, cursor, 16 * scale, rgba(196, 182, 152, 235), new Size(lineWidth, 20 * scale), HorizontalTextAlignment.LEFT);
      empty.overflow = Label.Overflow.SHRINK;
      cursor -= 26 * scale;
    }
    topRows.forEach((entry, index) => {
      const mineRow = summary.myRank === entry.rank;
      const rowColor = mineRow ? rgba(255, 226, 144, 255) : rgba(224, 210, 182, 240);
      const row = this.host.addChildLabel(card, `RankRow_${index}`, `${entry.rank}. ${entry.displayName}`, left, cursor, 16 * scale, rowColor, new Size(lineWidth * 0.62, 20 * scale), HorizontalTextAlignment.LEFT);
      row.overflow = Label.Overflow.SHRINK;
      const scoreLabel = this.host.addChildLabel(card, `RankRowScore_${index}`, `${entry.score}`, left + lineWidth, cursor, 16 * scale, rowColor, new Size(lineWidth * 0.34, 20 * scale), HorizontalTextAlignment.RIGHT);
      scoreLabel.overflow = Label.Overflow.SHRINK;
      cursor -= 27 * scale;
    });

    // 阶梯奖励表。
    cursor -= 8 * scale;
    const tiersTitle = this.host.addChildLabel(card, 'RankTiersTitle', '周榜阶梯奖励', left, cursor, 16 * scale, rgba(238, 210, 148, 250), new Size(lineWidth, 20 * scale), HorizontalTextAlignment.LEFT);
    tiersTitle.overflow = Label.Overflow.SHRINK;
    cursor -= 26 * scale;
    summary.rewardTiers.slice(0, 6).forEach((tier, index) => {
      const rangeText = tier.rankFrom === tier.rankTo ? `第${tier.rankFrom}名` : `第${tier.rankFrom}~${tier.rankTo}名`;
      const tierLine = this.host.addChildLabel(
        card,
        `RankTier_${index}`,
        `${rangeText}：矿晶${tier.crystalAmount}${tier.rewardsDesc ? ` + ${tier.rewardsDesc}` : ''}`,
        left,
        cursor,
        14.5 * scale,
        rgba(198, 184, 152, 235),
        new Size(lineWidth, 19 * scale),
        HorizontalTextAlignment.LEFT,
      );
      tierLine.overflow = Label.Overflow.SHRINK;
      cursor -= 23 * scale;
    });

    // 上周结果。
    cursor -= 6 * scale;
    const lastWeekText = summary.lastWeek
      ? `上周(${summary.lastWeek.weekKey})第${summary.lastWeek.myRank}名：矿晶${summary.lastWeek.crystalAmount}${summary.lastWeek.rewardsDesc ? ` + ${summary.lastWeek.rewardsDesc}` : ''},已发放。`
      : '上周未上榜。';
    const lastWeekLine = this.host.addChildLabel(card, 'RankLastWeek', lastWeekText, left, cursor, 15 * scale, rgba(168, 216, 168, 240), new Size(lineWidth, 38 * scale), HorizontalTextAlignment.LEFT);
    lastWeekLine.overflow = Label.Overflow.SHRINK;

    const closeHint = this.host.addChildLabel(card, 'RankCloseHint', '点击空白处关闭', 0, -h / 2 + 22 * scale, 13 * scale, rgba(150, 140, 122, 200), new Size(lineWidth, 16 * scale));
    closeHint.overflow = Label.Overflow.SHRINK;
  }

  // ── 矿晶熔炉(P金-2b):矿晶兑代币入口 + 弹窗(绑钱包/预设档位+自定义兑换/近期单) ──

  private furnaceButton(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    w: number,
    hgt: number,
    scale: number,
    active: boolean,
    enabled: boolean,
    onClick: () => void,
    fontSize = 15.5,
  ): void {
    const button = this.host.addChildPlainNode(parent, name, x, y, w, hgt);
    const g = button.addComponent(Graphics);
    g.fillColor = !enabled ? rgba(58, 54, 50, 235) : active ? rgba(150, 102, 34, 245) : rgba(40, 34, 28, 240);
    g.roundRect(-w / 2, -hgt / 2, w, hgt, 6 * scale);
    g.fill();
    g.strokeColor = active ? rgba(255, 214, 120, 235) : rgba(150, 122, 78, 200);
    g.lineWidth = Math.max(1, 1.4 * scale);
    g.roundRect(-w / 2, -hgt / 2, w, hgt, 6 * scale);
    g.stroke();
    const label = this.host.addChildLabel(button, `${name}Label`, text, 0, 0, fontSize * scale, enabled ? rgba(255, 240, 205, 255) : rgba(150, 144, 134, 235), new Size(w - 12 * scale, hgt - 6 * scale));
    label.overflow = Label.Overflow.SHRINK;
    if (enabled) {
      button.addComponent(Button);
      button.on(Button.EventType.CLICK, onClick, this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
  }

  // 工厂 EditBox 无背景,在暗底卡上不可见;在输入框位置垫一层圆角深底+金边,让输入区可辨识。
  private furnaceInputBg(parent: Node, name: string, x: number, y: number, w: number, hgt: number, scale: number): void {
    const bg = this.host.addChildPlainNode(parent, name, x, y, w, hgt);
    const g = bg.addComponent(Graphics);
    g.fillColor = rgba(6, 5, 5, 245);
    g.roundRect(-w / 2, -hgt / 2, w, hgt, 5 * scale);
    g.fill();
    g.strokeColor = rgba(150, 122, 78, 210);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.roundRect(-w / 2, -hgt / 2, w, hgt, 5 * scale);
    g.stroke();
  }

  private resolveFurnaceCrystal(state: LobbyTokenFurnaceState): number {
    const custom = parseInt((state.customCrystal || '').trim(), 10);
    if (Number.isFinite(custom) && custom > 0) {
      return custom;
    }
    return state.selectedCrystal ?? 0;
  }

  // 参考图风格的"信息条":黑底金边圆角横条,左圆形图标位+文字(可带右侧状态勾/叉)。
  private furnaceInfoRow(
    parent: Node,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    scale: number,
    iconAsset: string | null,
    text: string,
    textColor: Color,
    opts: { textRich?: [string, string, Color] | null; status?: 'ok' | 'bad' | null; borderColor?: Color } = {},
  ): void {
    const row = this.host.addChildPlainNode(parent, name, x, y, w, h);
    const g = row.addComponent(Graphics);
    g.fillColor = rgba(14, 11, 10, 236);
    g.roundRect(-w / 2, -h / 2, w, h, 8 * scale);
    g.fill();
    g.strokeColor = opts.borderColor ?? rgba(120, 96, 58, 200);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.roundRect(-w / 2, -h / 2, w, h, 8 * scale);
    g.stroke();
    // 左圆形图标位
    const iconR = h * 0.34;
    const iconX = -w / 2 + iconR + 12 * scale;
    g.fillColor = rgba(30, 24, 18, 240);
    g.circle(iconX, 0, iconR);
    g.fill();
    g.strokeColor = rgba(190, 150, 84, 220);
    g.circle(iconX, 0, iconR);
    g.stroke();
    if (iconAsset) {
      this.host.addSprite(`${name}Icon`, iconAsset, iconX, 0, iconR * 1.35, iconR * 1.35, row);
    }
    const textLeft = iconX + iconR + 12 * scale;
    const statusW = opts.status ? h * 0.9 : 0;
    const textW = w / 2 - textLeft - statusW - 10 * scale;
    if (opts.textRich) {
      const [a, b, bColor] = opts.textRich;
      const la = this.host.addChildLabel(row, `${name}TextA`, a, textLeft, 0, 16 * scale, textColor, new Size(textW * 0.42, h - 6 * scale), HorizontalTextAlignment.LEFT);
      la.overflow = Label.Overflow.SHRINK;
      const lb = this.host.addChildLabel(row, `${name}TextB`, b, textLeft + textW * 0.42, 0, 16 * scale, bColor, new Size(textW * 0.58, h - 6 * scale), HorizontalTextAlignment.LEFT);
      lb.overflow = Label.Overflow.SHRINK;
    } else {
      const l = this.host.addChildLabel(row, `${name}Text`, text, textLeft, 0, 16 * scale, textColor, new Size(textW, h - 6 * scale), HorizontalTextAlignment.LEFT);
      l.overflow = Label.Overflow.SHRINK;
    }
    if (opts.status) {
      // 右侧状态勾/叉:圆底+符号
      const sx = w / 2 - h * 0.45;
      const ok = opts.status === 'ok';
      g.fillColor = ok ? rgba(38, 92, 46, 235) : rgba(110, 30, 26, 235);
      g.circle(sx, 0, h * 0.26);
      g.fill();
      g.strokeColor = ok ? rgba(120, 220, 130, 240) : rgba(240, 100, 90, 240);
      g.lineWidth = Math.max(1, 1.4 * scale);
      g.circle(sx, 0, h * 0.26);
      g.stroke();
      const mark = this.host.addChildLabel(row, `${name}Mark`, ok ? '✓' : '✕', sx, 0, 15 * scale, ok ? rgba(160, 240, 170, 255) : rgba(255, 150, 140, 255), new Size(h * 0.6, h * 0.6));
      mark.overflow = Label.Overflow.SHRINK;
    }
  }

  // 分区标题:左金色小菱形 + 标题文字。
  private furnaceSectionTitle(parent: Node, name: string, text: string, x: number, y: number, w: number, scale: number): void {
    const t = this.host.addChildLabel(parent, name, `◆ ${text}`, x + w / 2, y, 17 * scale, rgba(244, 220, 166, 255), new Size(w, 24 * scale), HorizontalTextAlignment.LEFT);
    t.overflow = Label.Overflow.SHRINK;
    this.applyOutlineIfAvailable(t, scale);
  }

  private applyOutlineIfAvailable(label: Label, scale: number): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 200);
    label.outlineWidth = Math.max(1, 1.2 * scale);
  }

  // 矿晶熔炉弹窗(参考图 2026-08-15 重排):双栏——左"我的资源/门槛/钱包/近期单",右"兑换操作/预计到账/当前状态"。
  private renderTokenFurnacePopup(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const state = this.host.currentLobbyTokenFurnaceState?.();
    if (!state) {
      return;
    }
    const overlay = this.host.addChildPlainNode(parent, 'LobbyTokenFurnaceOverlay', 0, 0, panelWidth * 2, panelHeight * 2);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 178);
    og.rect(-panelWidth, -panelHeight, panelWidth * 2, panelHeight * 2);
    og.fill();
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => this.host.closeLobbyTokenFurnace?.(), this);

    const w = Math.min(980 * scale, panelWidth * 0.9);
    const h = Math.min(760 * scale, panelHeight * 0.97);
    const card = this.host.addChildPlainNode(overlay, 'LobbyTokenFurnaceCard', 0, 0, w, h);
    card.addComponent(BlockInputEvents);
    card.addComponent(Button);
    // 黑曜石金边大框:复用结算框素材(顶部纹章冠自带仪式感);缺失回退 Graphics。
    const art = this.host.addSprite('LobbyTokenFurnaceCardArt', 'ui/battle/ai/result_frame/spriteFrame', 0, 0, w, h, card);
    if (art) {
      art.type = Sprite.Type.SLICED;
    } else {
      const g = card.addComponent(Graphics);
      g.fillColor = rgba(11, 9, 10, 250);
      g.roundRect(-w / 2, -h / 2, w, h, 14 * scale);
      g.fill();
      g.strokeColor = rgba(214, 168, 92, 235);
      g.lineWidth = 2 * scale;
      g.roundRect(-w / 2, -h / 2, w, h, 14 * scale);
      g.stroke();
    }
    // 右上关闭 ×
    this.furnaceButton(card, 'FurnaceCloseX', '×', w / 2 - 34 * scale, h / 2 - 34 * scale, 40 * scale, 40 * scale, scale, false, true, () => this.host.closeLobbyTokenFurnace?.(), 22);

    // 标题(压在纹章冠下方)
    const title = this.host.addChildLabel(card, 'FurnaceTitle', '矿晶熔炉 · 矿晶兑代币', 0, h / 2 - 96 * scale, 30 * scale, rgba(255, 234, 176, 255), new Size(w * 0.7, 40 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutlineIfAvailable(title, scale);
    // 标题下细金分割线
    const divider = this.host.addChildPlainNode(card, 'FurnaceTitleDivider', 0, h / 2 - 122 * scale, w * 0.7, 2);
    const dg = divider.addComponent(Graphics);
    dg.strokeColor = rgba(206, 168, 96, 170);
    dg.lineWidth = Math.max(1, 1.2 * scale);
    dg.moveTo(-w * 0.35, 0);
    dg.lineTo(w * 0.35, 0);
    dg.stroke();

    const summary = state.summary;
    if (state.loading && !summary) {
      const hint = this.host.addChildLabel(card, 'FurnaceLoading', '正在读取熔炉…', 0, 0, 20 * scale, rgba(214, 196, 156, 235), new Size(w * 0.6, 28 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      this.renderFurnaceCloseButton(card, w, h, scale);
      return;
    }
    if (state.error && !summary) {
      const hint = this.host.addChildLabel(card, 'FurnaceError', `读取失败：${state.error}`, 0, 0, 17 * scale, rgba(255, 150, 130, 235), new Size(w * 0.7, 44 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      this.renderFurnaceCloseButton(card, w, h, scale);
      return;
    }
    if (!summary) {
      this.renderFurnaceCloseButton(card, w, h, scale);
      return;
    }

    // ── 双栏几何 ──
    const contentTop = h / 2 - 140 * scale;
    const contentBottom = -h / 2 + 118 * scale;
    const gutter = 20 * scale;
    const sideMargin = 46 * scale;
    const colW = (w - sideMargin * 2 - gutter) / 2;
    const leftX = -w / 2 + sideMargin + colW / 2;   // 左栏中心 x
    const rightX = w / 2 - sideMargin - colW / 2;    // 右栏中心 x
    const colH = contentTop - contentBottom;
    // 栏底板(暗一档,内容更聚拢)
    for (const [nm, cx] of [['FurnaceColL', leftX], ['FurnaceColR', rightX]] as Array<[string, number]>) {
      const col = this.host.addChildPlainNode(card, nm, cx, (contentTop + contentBottom) / 2, colW, colH);
      const cg = col.addComponent(Graphics);
      cg.fillColor = rgba(9, 7, 7, 200);
      cg.roundRect(-colW / 2, -colH / 2, colW, colH, 10 * scale);
      cg.fill();
      cg.strokeColor = rgba(90, 72, 44, 160);
      cg.lineWidth = Math.max(1, scale);
      cg.roundRect(-colW / 2, -colH / 2, colW, colH, 10 * scale);
      cg.stroke();
    }
    const innerPad = 16 * scale;
    const rowW = colW - innerPad * 2;
    const rowH = 46 * scale;
    const crystalIcon = resolveBagStyleItemIconAsset('SACRED_CRYSTAL', 'CURRENCY');
    const feePct = Math.round(summary.feeRate * 100);

    // ═══ 左栏 ═══
    let ly = contentTop - 22 * scale;
    this.furnaceSectionTitle(card, 'FurnaceSecRes', '我的资源', leftX - colW / 2 + innerPad, ly, rowW, scale);
    ly -= 26 * scale;
    // 资源大卡:大水晶 + 数量 + 兑换率/手续费
    const resH = 100 * scale;
    const res = this.host.addChildPlainNode(card, 'FurnaceResCard', leftX, ly - resH / 2, rowW, resH);
    const rg = res.addComponent(Graphics);
    rg.fillColor = rgba(14, 11, 10, 236);
    rg.roundRect(-rowW / 2, -resH / 2, rowW, resH, 10 * scale);
    rg.fill();
    rg.strokeColor = rgba(120, 96, 58, 200);
    rg.lineWidth = Math.max(1, 1.2 * scale);
    rg.roundRect(-rowW / 2, -resH / 2, rowW, resH, 10 * scale);
    rg.stroke();
    if (crystalIcon) {
      this.host.addSprite('FurnaceResCrystal', crystalIcon, -rowW / 2 + 52 * scale, 0, 72 * scale, 72 * scale, res);
    }
    const resName = this.host.addChildLabel(res, 'FurnaceResName', '我的矿晶', -rowW / 2 + 152 * scale, 22 * scale, 16 * scale, rgba(214, 196, 156, 240), new Size(110 * scale, 22 * scale));
    resName.overflow = Label.Overflow.SHRINK;
    const resNum = this.host.addChildLabel(res, 'FurnaceResNum', `${Math.floor(summary.sacredCrystal)}`, -rowW / 2 + 152 * scale, -14 * scale, 34 * scale, rgba(255, 224, 140, 255), new Size(130 * scale, 42 * scale));
    resNum.overflow = Label.Overflow.SHRINK;
    this.applyOutlineIfAvailable(resNum, scale);
    // 右半:兑换率 / 手续费 两行,带小圆图标
    const infoX = rowW * 0.16;
    for (const [i, [txt]] of ([[`${summary.crystalPerToken}矿晶 = 1 ${summary.tokenSymbol}`], [`手续费 ${feePct}%`]] as Array<[string]>).entries()) {
      const iy = i === 0 ? 20 * scale : -20 * scale;
      rg.fillColor = rgba(30, 24, 18, 240);
      rg.circle(infoX, iy, 12 * scale);
      rg.fill();
      rg.strokeColor = rgba(190, 150, 84, 220);
      rg.circle(infoX, iy, 12 * scale);
      rg.stroke();
      const sym = this.host.addChildLabel(res, `FurnaceResInfoSym_${i}`, i === 0 ? '⇄' : '%', infoX, iy, 13 * scale, rgba(230, 200, 130, 255), new Size(24 * scale, 24 * scale));
      sym.overflow = Label.Overflow.SHRINK;
      const t = this.host.addChildLabel(res, `FurnaceResInfo_${i}`, txt, infoX + 20 * scale, iy, 16 * scale, rgba(236, 222, 190, 245), new Size(rowW / 2 - infoX - 24 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
      t.overflow = Label.Overflow.SHRINK;
    }
    ly -= resH + 12 * scale;
    // 门槛行(红框+锁)/钱包行/提示行
    const gateOk = summary.eligible;
    this.furnaceInfoRow(card, 'FurnaceRowGate', leftX, ly - rowH / 2, rowW, rowH, scale, DAILY_IC_LOCK_ASSET,
      gateOk ? '已满足兑换门槛' : (summary.ineligibleReason ?? '暂不可兑换'),
      gateOk ? rgba(150, 230, 160, 245) : rgba(255, 120, 108, 250),
      { borderColor: gateOk ? rgba(80, 140, 90, 200) : rgba(150, 40, 36, 220) });
    ly -= rowH + 10 * scale;
    this.furnaceInfoRow(card, 'FurnaceRowWallet', leftX, ly - rowH / 2, rowW, rowH, scale, 'ui/battle/ai/buff_shield/spriteFrame', '', rgba(214, 196, 156, 240),
      { textRich: ['钱包:', summary.walletBound ? '已绑定' : '未绑定', summary.walletBound ? rgba(150, 230, 160, 250) : rgba(255, 176, 132, 250)] });
    ly -= rowH + 10 * scale;
    this.furnaceInfoRow(card, 'FurnaceRowTip', leftX, ly - rowH / 2, rowW, rowH, scale, null, gateOk ? '选择档位或输入数量后点击兑换。' : '满足上方门槛后即可兑换。', rgba(214, 200, 168, 240));
    // 信息图标(i)
    ly -= rowH + 18 * scale;
    // 近期兑换单
    this.furnaceSectionTitle(card, 'FurnaceSecOrders', '近期兑换单', leftX - colW / 2 + innerPad, ly, rowW, scale);
    ly -= 26 * scale;
    const orders = summary.recentOrders.slice(0, 3);
    if (orders.length === 0) {
      this.furnaceInfoRow(card, 'FurnaceOrderEmpty', leftX, ly - rowH / 2, rowW, rowH, scale, null, '暂无兑换记录', rgba(170, 158, 138, 230));
    } else {
      orders.forEach((order, index) => {
        this.renderFurnaceOrderRow(card, order, summary.tokenSymbol, leftX, rowW, ly - rowH / 2, rowH, scale, index);
        ly -= rowH + 8 * scale;
      });
    }

    // ═══ 右栏 ═══
    let ry = contentTop - 14 * scale;
    // 主按钮:兑换(大金框) / 换绑
    const bigBtnW = rowW * 0.9;
    const canExchange = gateOk && !state.submitting && !state.bindOpen;
    this.furnaceButton(card, 'FurnaceExchangeConfirm', state.submitting ? '提交中…' : '兑 换', rightX, ry - 30 * scale, bigBtnW, 56 * scale, scale, true, canExchange, () => {
      const fresh = this.host.currentLobbyTokenFurnaceState?.();
      if (fresh) {
        this.host.submitLobbyTokenExchange?.(this.resolveFurnaceCrystal(fresh));
      }
    }, 24);
    ry -= 66 * scale;
    this.furnaceButton(card, 'FurnaceBindToggle', state.bindOpen ? '收起绑定' : (summary.walletBound ? '换绑' : '绑定钱包'), rightX, ry - 20 * scale, bigBtnW * 0.62, 38 * scale, scale, state.bindOpen, true, () => {
      this.host.setLobbyTokenFurnaceForm?.({ bindOpen: !state.bindOpen, actionMessage: '', actionError: false });
    });
    ry -= 54 * scale;

    if (state.bindOpen) {
      // 绑定表单占据右栏中段
      ry = this.renderFurnaceBindForm(card, state, rightX - rowW / 2, rowW, ry, scale);
    } else {
      // 预计到账
      this.furnaceSectionTitle(card, 'FurnaceSecPreview', '预计到账', rightX - colW / 2 + innerPad, ry, rowW, scale);
      ry -= 26 * scale;
      const pvH = 150 * scale;
      const pv = this.host.addChildPlainNode(card, 'FurnacePreviewCard', rightX, ry - pvH / 2, rowW, pvH);
      const pg = pv.addComponent(Graphics);
      pg.fillColor = rgba(14, 11, 10, 236);
      pg.roundRect(-rowW / 2, -pvH / 2, rowW, pvH, 10 * scale);
      pg.fill();
      pg.strokeColor = rgba(120, 96, 58, 200);
      pg.lineWidth = Math.max(1, 1.2 * scale);
      pg.roundRect(-rowW / 2, -pvH / 2, rowW, pvH, 10 * scale);
      pg.stroke();
      const crystal = this.resolveFurnaceCrystal(state);
      const token = crystal / summary.crystalPerToken;
      const fee = Math.ceil(crystal * summary.feeRate);
      // 图标行:矿晶 →→ 代币
      if (crystalIcon) {
        this.host.addSprite('FurnacePvCrystal', crystalIcon, -rowW * 0.22, 28 * scale, 58 * scale, 58 * scale, pv);
      }
      const arrows = this.host.addChildLabel(pv, 'FurnacePvArrow', '»»', 0, 28 * scale, 26 * scale, rgba(230, 196, 120, 255), new Size(60 * scale, 32 * scale));
      arrows.overflow = Label.Overflow.SHRINK;
      this.host.addSprite('FurnacePvToken', 'ui/bag/ai/icon_diamond/spriteFrame', rowW * 0.22, 28 * scale, 54 * scale, 54 * scale, pv);
      const pvLine = this.host.addChildLabel(pv, 'FurnacePvLine', crystal > 0 ? `${crystal}矿晶 → ${trimNum(token)} ${summary.tokenSymbol}` : '选择档位或输入数量', 0, -18 * scale, crystal > 0 ? 26 * scale : 17 * scale, rgba(255, 232, 150, 255), new Size(rowW - 20 * scale, 34 * scale));
      pvLine.overflow = Label.Overflow.SHRINK;
      this.applyOutlineIfAvailable(pvLine, scale);
      const pvFee = this.host.addChildLabel(pv, 'FurnacePvFee', crystal > 0 ? `手续费 ${fee} 矿晶(${feePct}%) · 合计扣 ${crystal + fee}` : `手续费 ${feePct}%`, 0, -50 * scale, 14 * scale, rgba(200, 186, 156, 240), new Size(rowW - 20 * scale, 20 * scale));
      pvFee.overflow = Label.Overflow.SHRINK;
      ry -= pvH + 10 * scale;
      // 档位胶囊(500/1000/2000/全部)+ 自定义
      if (gateOk) {
        const balanceMax = Math.floor(summary.sacredCrystal / summary.crystalPerToken) * summary.crystalPerToken;
        const capRemainToken = Math.max(0, summary.dailyTokenCap - summary.todayExchangedToken);
        const allCrystal = Math.min(balanceMax, Math.floor(capRemainToken) * summary.crystalPerToken);
        const presets = [{ label: '500', value: 500 }, { label: '1000', value: 1000 }, { label: '2000', value: 2000 }, { label: '全部', value: allCrystal }];
        const tierW = (rowW - 3 * 8 * scale) / 4;
        presets.forEach((preset, index) => {
          const enabled = preset.value >= summary.minCrystal && preset.value <= balanceMax;
          const active = !state.customCrystal && state.selectedCrystal === preset.value && preset.value > 0;
          this.furnaceButton(card, `FurnaceTier_${index}`, preset.label, rightX - rowW / 2 + tierW / 2 + index * (tierW + 8 * scale), ry - 18 * scale, tierW, 34 * scale, scale, active, enabled, () => {
            this.host.setLobbyTokenFurnaceForm?.({ selectedCrystal: preset.value, customCrystal: '', actionMessage: '', actionError: false });
          }, 15);
        });
        ry -= 44 * scale;
        this.furnaceInputBg(card, 'FurnaceCustomBg', rightX, ry - 18 * scale, rowW, 36 * scale, scale);
        const box = this.host.addEditBox?.(state.customCrystal, rightX, ry - 18 * scale, rowW);
        if (box) {
          box.placeholder = `自定义矿晶(≥${summary.minCrystal},${summary.crystalPerToken}整数倍)`;
          box.inputMode = EditBox.InputMode.NUMERIC;
          box.maxLength = 12;
          card.addChild(box.node);
          box.node.on(EditBox.EventType.TEXT_CHANGED, () => this.host.setLobbyTokenFurnaceCustomAmount?.(box.string), this);
        }
        ry -= 44 * scale;
      }
      // 当前状态
      this.furnaceSectionTitle(card, 'FurnaceSecStatus', '当前状态', rightX - colW / 2 + innerPad, ry, rowW, scale);
      ry -= 26 * scale;
      const stRowH = 40 * scale;
      this.furnaceInfoRow(card, 'FurnaceStWallet', rightX, ry - stRowH / 2, rowW, stRowH, scale, 'ui/battle/ai/buff_shield/spriteFrame', summary.walletBound ? '钱包已绑定' : '钱包未绑定', rgba(236, 222, 190, 245), { status: summary.walletBound ? 'ok' : 'bad' });
      ry -= stRowH + 6 * scale;
      this.furnaceInfoRow(card, 'FurnaceStGate', rightX, ry - stRowH / 2, rowW, stRowH, scale, DAILY_IC_LOCK_ASSET, gateOk ? '兑换权限已解锁' : (summary.ineligibleReason ?? '兑换权限未解锁'), rgba(236, 222, 190, 245), { status: gateOk ? 'ok' : 'bad' });
      ry -= stRowH + 6 * scale;
      this.furnaceInfoRow(card, 'FurnaceStCap', rightX, ry - stRowH / 2, rowW, stRowH, scale, null, `今日额度 ${trimNum(summary.todayExchangedToken)}/${trimNum(summary.dailyTokenCap)} ${summary.tokenSymbol}`, rgba(236, 222, 190, 245), { status: summary.todayExchangedToken < summary.dailyTokenCap ? 'ok' : 'bad' });
      ry -= stRowH + 6 * scale;
    }

    // 操作反馈(卡底提示行上方)
    const footY = -h / 2 + 88 * scale;
    if (state.actionMessage) {
      const msg = this.host.addChildLabel(card, 'FurnaceActionMsg', state.actionMessage, 0, footY + 24 * scale, 15 * scale, state.actionError ? rgba(255, 150, 130, 245) : rgba(168, 226, 168, 250), new Size(w * 0.8, 22 * scale));
      msg.overflow = Label.Overflow.SHRINK;
    }
    const foot = this.host.addChildLabel(card, 'FurnaceFootHint', '✦ 兑换需满足解锁条件，审核通过后将尽快发放至您的钱包。 ✦', 0, footY, 14 * scale, rgba(190, 176, 148, 235), new Size(w * 0.8, 20 * scale));
    foot.overflow = Label.Overflow.SHRINK;
    this.renderFurnaceCloseButton(card, w, h, scale);
  }

  private renderFurnaceBindForm(card: Node, state: LobbyTokenFurnaceState, left: number, lineW: number, startY: number, scale: number): number {
    let cursor = startY - 6 * scale;
    this.furnaceSectionTitle(card, 'FurnaceSecBind', '绑定提币钱包', left, cursor, lineW, scale);
    cursor -= 30 * scale;
    const chainLabel = this.host.addChildLabel(card, 'FurnaceChainLabel', '公链', left + 30 * scale, cursor, 16 * scale, rgba(214, 196, 156, 235), new Size(60 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    chainLabel.overflow = Label.Overflow.SHRINK;
    this.furnaceButton(card, 'FurnaceChainBsc', 'BSC', left + lineW * 0.42, cursor, 96 * scale, 34 * scale, scale, state.bindChain === 'BSC', true, () => this.host.setLobbyTokenFurnaceForm?.({ bindChain: 'BSC' }));
    this.furnaceButton(card, 'FurnaceChainTron', 'TRON', left + lineW * 0.42 + 108 * scale, cursor, 96 * scale, 34 * scale, scale, state.bindChain === 'TRON', true, () => this.host.setLobbyTokenFurnaceForm?.({ bindChain: 'TRON' }));
    cursor -= 44 * scale;
    this.furnaceInputBg(card, 'FurnaceBindAddrBg', left + lineW / 2, cursor, lineW, 38 * scale, scale);
    const box = this.host.addEditBox?.(state.bindAddress, left + lineW / 2, cursor, lineW);
    if (box) {
      box.placeholder = state.bindChain === 'TRON' ? 'T 开头 34 位 TRON 地址' : '0x 开头 42 位 BSC 地址';
      box.maxLength = 64;
      card.addChild(box.node);
      box.node.on(EditBox.EventType.TEXT_CHANGED, () => this.host.setLobbyTokenFurnaceBindAddress?.(box.string), this);
    }
    cursor -= 46 * scale;
    this.furnaceButton(card, 'FurnaceBindConfirm', state.submitting ? '绑定中…' : '确认绑定', left + lineW / 2, cursor, 200 * scale, 40 * scale, scale, true, !state.submitting, () => {
      const fresh = this.host.currentLobbyTokenFurnaceState?.();
      if (fresh) {
        this.host.bindLobbyTokenWallet?.(fresh.bindChain, fresh.bindAddress);
      }
    });
    cursor -= 50 * scale;
    return cursor;
  }

  private renderFurnaceOrderRow(card: Node, order: TokenWithdrawOrderVO, symbol: string, centerX: number, rowW: number, y: number, rowH: number, scale: number, index: number): void {
    const day = (order.createTime || '').replace('T', ' ').slice(5, 16);
    const statusColor = order.status === 2 ? rgba(255, 168, 140, 240) : order.status === 3 ? rgba(168, 216, 168, 240) : rgba(160, 230, 170, 245);
    // 信息条底 + 时钟图标位 + 文案 + 右侧状态胶囊
    this.furnaceInfoRow(card, `FurnaceOrder_${index}`, centerX, y, rowW, rowH, scale, null, `${day} · ${order.crystalAmount}矿晶 → ${trimNum(order.tokenAmount)}${symbol}`, rgba(216, 204, 178, 240));
    const pillW = 128 * scale;
    const pill = this.host.addChildPlainNode(card, `FurnaceOrderStatus_${index}`, centerX + rowW / 2 - pillW / 2 - 8 * scale, y, pillW, rowH * 0.62);
    const g = pill.addComponent(Graphics);
    g.fillColor = rgba(24, 40, 26, 235);
    g.roundRect(-pillW / 2, -rowH * 0.31, pillW, rowH * 0.62, 6 * scale);
    g.fill();
    g.strokeColor = rgba(120, 200, 130, 220);
    g.lineWidth = Math.max(1, scale);
    g.roundRect(-pillW / 2, -rowH * 0.31, pillW, rowH * 0.62, 6 * scale);
    g.stroke();
    const st = this.host.addChildLabel(pill, 'Txt', order.statusLabel, 0, 0, 13 * scale, statusColor, new Size(pillW - 8 * scale, rowH * 0.5));
    st.overflow = Label.Overflow.SHRINK;
  }

  private renderFurnaceCloseButton(card: Node, w: number, h: number, scale: number): void {
    // 底部大"关闭"按钮:复用金框主按钮素材。
    const bw = 300 * scale;
    const bh = bw * (211 / 740) * 1.05;
    const btn = this.host.addChildPlainNode(card, 'FurnaceClose', 0, -h / 2 + 40 * scale, bw, bh);
    if (!this.host.addSprite('FurnaceCloseBg', C1812_BUTTON_PRIMARY_ASSET, 0, 0, bw, bh, btn)) {
      const g = btn.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 26, 235);
      g.roundRect(-bw / 2, -bh / 2, bw, bh, 6 * scale);
      g.fill();
    }
    const label = this.host.addChildLabel(btn, 'FurnaceCloseLabel', '关 闭', 0, 0, 22 * scale, rgba(255, 240, 205, 255), new Size(bw - 40 * scale, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutlineIfAvailable(label, scale);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, () => this.host.closeLobbyTokenFurnace?.(), this);
    this.host.applyImageButtonFeedback(btn, 1.04, 0.96);
  }

  // 输出试炼档位阶梯弹窗:限时打BOSS拼输出,时间到即成功,按输出分发矿晶+材料。
  private renderTrialLadderPopup(parent: Node, panelWidth: number, panelHeight: number, scale: number, tiers: TrialTierVO[]): void {
    const overlay = this.host.addChildPlainNode(parent, 'LobbyTrialLadderOverlay', 0, 0, panelWidth * 2, panelHeight * 2);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 168);
    og.rect(-panelWidth, -panelHeight, panelWidth * 2, panelHeight * 2);
    og.fill();
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => {
      this.trialLadderPopupTiers = null;
      this.host.refreshLobbyDailyDungeonPanel();
    }, this);

    const w = Math.min(640 * scale, panelWidth * 0.74);
    const h = Math.min(540 * scale, panelHeight * 0.92);
    const card = this.host.addChildPlainNode(overlay, 'LobbyTrialLadderCard', 0, 0, w, h);
    card.addComponent(BlockInputEvents);
    card.addComponent(Button);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(11, 9, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.fill();
    g.strokeColor = rgba(214, 168, 92, 235);
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
    g.stroke();

    const left = -w / 2 + 28 * scale;
    const lineW = w - 56 * scale;
    const title = this.host.addChildLabel(card, 'TrialTitle', '输出试炼 · 奖励档位', 0, h / 2 - 34 * scale, 26 * scale, rgba(244, 220, 166, 255), new Size(lineW, 34 * scale));
    title.overflow = Label.Overflow.SHRINK;
    const sub = this.host.addChildLabel(card, 'TrialSub', '限时 90 秒拼总输出,时间到即成功;输出越高档位越高。', 0, h / 2 - 66 * scale, 15.5 * scale, rgba(196, 182, 152, 235), new Size(lineW, 22 * scale));
    sub.overflow = Label.Overflow.SHRINK;

    const crystalIcon = resolveBagStyleItemIconAsset('SACRED_CRYSTAL', 'CURRENCY');
    let cursor = h / 2 - 108 * scale;
    const rowH = 54 * scale;
    tiers.forEach((tier, index) => {
      const row = this.host.addChildPlainNode(card, `TrialRow_${index}`, 0, cursor, lineW, rowH - 6 * scale);
      const rg = row.addComponent(Graphics);
      rg.fillColor = index === 0 ? rgba(60, 44, 20, 235) : rgba(28, 24, 20, 220);
      rg.roundRect(-lineW / 2, -(rowH - 6 * scale) / 2, lineW, rowH - 6 * scale, 6 * scale);
      rg.fill();
      rg.strokeColor = rgba(150, 122, 78, 190);
      rg.lineWidth = Math.max(1, scale);
      rg.roundRect(-lineW / 2, -(rowH - 6 * scale) / 2, lineW, rowH - 6 * scale, 6 * scale);
      rg.stroke();
      const nameLabel = this.host.addChildLabel(row, 'TrialRowName', `${tier.tierName}（${tier.tierCode}）`, -lineW / 2 + 14 * scale, 8 * scale, 17.5 * scale, rgba(250, 226, 160, 250), new Size(lineW * 0.34, 22 * scale), HorizontalTextAlignment.LEFT);
      nameLabel.overflow = Label.Overflow.SHRINK;
      const condLabel = this.host.addChildLabel(row, 'TrialRowCond', `输出 ≥ ${tier.minScore}`, -lineW / 2 + 14 * scale, -12 * scale, 14 * scale, rgba(190, 178, 150, 235), new Size(lineW * 0.34, 18 * scale), HorizontalTextAlignment.LEFT);
      condLabel.overflow = Label.Overflow.SHRINK;
      if (crystalIcon) {
        this.host.addSprite(`TrialRowCrystal_${index}`, crystalIcon, lineW * 0.08, 0, 32 * scale, 32 * scale, row);
      }
      const bonusText = tier.bonusName && tier.bonusAmount ? ` + ${tier.bonusName}×${formatAmount(tier.bonusAmount)}` : '';
      const rewardLabel = this.host.addChildLabel(row, 'TrialRowReward', `矿晶 ${tier.crystalAmount}${bonusText}`, lineW / 2 - 8 * scale, 0, 16.5 * scale, rgba(255, 240, 205, 255), new Size(lineW * 0.5, 22 * scale), HorizontalTextAlignment.RIGHT);
      rewardLabel.overflow = Label.Overflow.SHRINK;
      cursor -= rowH;
    });

    const closeHint = this.host.addChildLabel(card, 'TrialCloseHint', '点击空白处关闭', 0, -h / 2 + 22 * scale, 13 * scale, rgba(150, 140, 122, 200), new Size(lineW, 16 * scale));
    closeHint.overflow = Label.Overflow.SHRINK;
  }

  private renderRetryButton(parent: Node, scale: number): void {
    const buttonWidth = 148 * scale;
    const buttonHeight = buttonWidth * (211 / 740) * 1.15;
    const button = this.host.addChildPlainNode(parent, 'LobbyDailyRetryButton', 0, -60 * scale, buttonWidth, buttonHeight);
    const sprite = this.host.addSprite('LobbyDailyRetrySprite', C1812_BUTTON_PRIMARY_ASSET, 0, 0, buttonWidth, buttonHeight, button);
    if (!sprite) {
      const fallback = button.addComponent(Graphics);
      fallback.fillColor = rgba(122, 32, 26, 235);
      fallback.roundRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 5 * scale);
      fallback.fill();
    }
    const label = this.host.addChildLabel(button, 'LobbyDailyRetryLabel', '重新读取', 0, 0, 14 * scale, rgba(255, 240, 205, 255), new Size(buttonWidth - 12 * scale, 20 * scale));
    label.overflow = Label.Overflow.SHRINK;
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => this.host.reloadLobbyDailyDungeonSummary(), this);
    this.host.applyImageButtonFeedback(button, 1.04, 0.96);
  }

  private addCenterHint(parent: Node, text: string, color: Color, scale: number): void {
    const hint = this.host.addChildLabel(parent, 'LobbyDailyCenterHint', text, 0, 10 * scale, 16 * scale, color, new Size(560 * scale, 26 * scale));
    hint.overflow = Label.Overflow.SHRINK;
  }
}

// 稀有度描边色:与背包详情同一套档色。
function rarityTone(rarity: string): Color {
  const key = (rarity || '').toUpperCase();
  if (key === 'UR' || key === 'SSR') {
    return rgba(255, 202, 102);
  }
  if (key === 'SR' || key === 'EPIC') {
    return rgba(184, 148, 255);
  }
  if (key === 'R' || key === 'RARE') {
    return rgba(150, 190, 255);
  }
  return rgba(195, 178, 138);
}

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return Number.isInteger(amount) ? `${amount}` : amount.toFixed(1);
}
