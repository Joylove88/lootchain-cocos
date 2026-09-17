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
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import { C1812_BUTTON_PRIMARY_ASSET } from '../C1812CommonUiAssets';
import type {
  LobbyCodexClaimPayload,
  LobbyCodexItemVO,
  LobbyCodexMilestoneVO,
  LobbyCodexPanelState,
  LobbyCodexRarityFilter,
} from '../../types/LobbyCodexTypes';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';
import type { QuestRewardItemVO } from '../../types/QuestTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { clamp, rgba, type UiLayout } from './LobbyHudTypes';

/** 图鉴页素材(2026-09-15):复用任务弹框/背包/英雄卡素材;宝箱三态为图鉴专属(用户自出图,缺图退手绘)。 */
const CODEX_UI_ASSETS = {
  tabActive: 'ui/mission/ai/tab_active/spriteFrame',
  tabNormal: 'ui/mission/ai/tab_normal/spriteFrame',
  btnClaim: 'ui/mission/ai/btn_claim/spriteFrame',
  btnDisabled: 'ui/mission/ai/btn_disabled/spriteFrame',
  progressFrame: 'ui/mission/ai/progress_frame/spriteFrame',
  progressFilled: 'ui/mission/ai/progress_filled/spriteFrame',
  popupFrame: 'ui/common/ai/popup_frame_large/spriteFrame',
  close: 'ui/common/ai/button_close/spriteFrame',
  lock: 'ui/common/ai/ic_lock/spriteFrame',
  /** 里程碑宝箱三态(ui/codex/ai,512×512 透明底,用户自出图)。 */
  chestLocked: 'ui/codex/ai/chest_locked/spriteFrame',
  chestReady: 'ui/codex/ai/chest_ready/spriteFrame',
  chestOpened: 'ui/codex/ai/chest_opened/spriteFrame',
  /** 图鉴全屏背景(ui/codex/ai,2048×1152 一体构图,cover 等比裁切;缺图保留深色面板)。 */
  background: 'ui/codex/ai/codex_bg/spriteFrame',
};

/** 奖励图标按资源码精确映射(背包 C 组 160×160 方图),未知码退回文字。 */
const REWARD_ICON_BY_CODE: Record<string, string> = {
  GOLD: 'ui/bag/ai/icon_gold/spriteFrame',
  DIAMOND: 'ui/bag/ai/icon_diamond/spriteFrame',
  BOUND_DIAMOND: 'ui/bag/ai/icon_bound_diamond/spriteFrame',
  HERO_EXP_BOOK: 'ui/bag/ai/icon_expbook/spriteFrame',
  ENHANCE_STONE: 'ui/bag/ai/icon_enhance_low/spriteFrame',
  ENHANCE_STONE_HIGH: 'ui/bag/ai/icon_enhance_high/spriteFrame',
  HERO_CONTRACT_TICKET: 'ui/bag/ai/icon_ticket_hero/spriteFrame',
  LIMITED_CONTRACT_TICKET: 'ui/bag/ai/icon_ticket_limited/spriteFrame',
};

/** 卡片宽高比:沿用英雄名册卡框(937×1676)的 1.2 倍显示宽度。 */
const CODEX_CARD_ASPECT = (937 / 1676) * 1.2;
const CODEX_FILTERS: LobbyCodexRarityFilter[] = ['ALL', 'UR', 'SSR', 'SR', 'R'];
const CODEX_FILTER_LABELS: Record<LobbyCodexRarityFilter, string> = {
  ALL: '全部',
  UR: 'UR',
  SSR: 'SSR',
  SR: 'SR',
  R: 'R',
};

export interface LobbyCodexPanelHost {
  node: Node;
  currentLobbyCodexState(): LobbyCodexPanelState;
  closeLobbyCodexPanel(): void;
  reloadLobbyCodex(): void;
  setLobbyCodexFilter(filter: LobbyCodexRarityFilter): void;
  toggleLobbyCodexUnownedOnly(): void;
  selectLobbyCodexHero(heroCode: string | null): void;
  selectLobbyCodexMilestone(targetCount: number | null): void;
  claimLobbyCodexReward(payload: LobbyCodexClaimPayload): void;
  claimAllLobbyCodexRewards(): void;
  /** 渲染器播完领取特效后调用,静默清掉票据。 */
  acknowledgeLobbyCodexClaimFx(): void;
  openLobbyGachaSceneFromCodex(): void;
  /** 复用英雄名册的卡面绘制(阴影+卡框+立绘+稀有度边框动效),图鉴自己叠三态。 */
  renderCodexHeroCardArtwork(card: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number, borderEffect: boolean): void;
  createUiNode(name: string): Node;
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
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
}

/**
 * 英雄图鉴页(2026-09-15 图鉴系统一期):
 * 顶部收录进度条 + 里程碑宝箱 + 一键领取;稀有度页签 + 仅看未收集;
 * 立绘卡墙三态(已激活 / 可领取金框角标 / 未收集灰影加锁);点卡片弹详情(奖励清单 + 领取 / 前往召唤)。
 */
export class LobbyCodexPanelRenderer {
  constructor(private readonly host: LobbyCodexPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyCodexState();
    const scale = Math.max(0.64, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(300 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.createUiNode('LobbyCodexDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    // 功能页采用场景式导航,遮罩只阻断底层输入,不再承担点击关闭语义。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbyCodexSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyCodexSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(6, 6, 9, 232),
      rgba(190, 141, 62, 226),
      18 * scale,
    );
    if (!this.mountBackground(panel, panelWidth, panelHeight)) {
      this.drawPanelAtmosphere(panel, panelWidth, panelHeight, scale);
    }
    this.renderHeader(panel, panelWidth, panelHeight, scale, state);
    this.renderFilterRow(panel, panelWidth, panelHeight, scale, state);
    this.renderCardWall(panel, panelWidth, panelHeight, scale, state);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyCodexBackButton', () => this.host.closeLobbyCodexPanel(), scale, '图鉴', '首次获得一位英雄即完成收录，点开卡片可领取一次性激活奖励（按稀有度）。\n\n收录数达到 5 / 10 / 15 / 22 时，进度条上的宝箱可以打开领取里程碑奖励。\n\n未收集的英雄可从卡片详情直接前往召唤。');

    const selectedHero = state.selectedHeroCode ? state.items.find((item) => item.heroCode === state.selectedHeroCode) ?? null : null;
    const selectedMilestone = state.selectedMilestone !== null
      ? state.milestones.find((milestone) => milestone.targetCount === state.selectedMilestone) ?? null
      : null;
    if (selectedHero) {
      this.renderHeroDetailPopup(panelGroup, layout, panelWidth, panelHeight, scale, state, selectedHero);
    } else if (selectedMilestone) {
      this.renderMilestonePopup(panelGroup, layout, panelWidth, panelHeight, scale, state, selectedMilestone);
    }
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  /** 背景图按 cover 等比铺满面板(Mask 裁掉溢出),上面压一层暗色让卡墙可读;缺图返回 false。 */
  private mountBackground(panel: Node, width: number, height: number): boolean {
    const maskNode = this.host.addChildPlainNode(panel, 'LobbyCodexBackdropMask', 0, 0, width, height);
    const mask = maskNode.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const sprite = this.host.addSprite('LobbyCodexBackdrop', CODEX_UI_ASSETS.background, 0, 0, width, height, maskNode);
    if (!sprite) {
      maskNode.removeFromParent();
      return false;
    }
    const frame = sprite.spriteFrame;
    const srcW = frame?.originalSize?.width || frame?.rect?.width || 2048;
    const srcH = frame?.originalSize?.height || frame?.rect?.height || 1152;
    const coverScale = Math.max(width / srcW, height / srcH);
    sprite.node.getComponent(UITransform)?.setContentSize(new Size(srcW * coverScale, srcH * coverScale));
    const shade = this.host.addChildPlainNode(panel, 'LobbyCodexBackdropShade', 0, 0, width, height);
    const g = shade.addComponent(Graphics);
    g.fillColor = rgba(4, 3, 6, 34);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    return true;
  }

  // ── 顶部:收录进度 + 里程碑宝箱 + 一键领取 ──

  private renderHeader(parent: Node, width: number, height: number, scale: number, state: LobbyCodexPanelState): void {
    // 2026-09-17 用户反馈:标题/关闭一行,进度条 + 一键领取第二行整体横向居中,页签第三行。
    // 2026-09-17 用户反馈二:去掉底板、“收录进度”与计数,只留带宝箱的进度条 + 一键领取,整组横向居中。
    const rowY = height / 2 - 70 * scale;
    const compact = width < 760 * scale;
    // 2026-09-17 用户反馈三:进度条拉长(占屏宽一半),四个宝箱不再挤;条框/填充改九宫格拉伸,只拉中段管身,两端雕花不变形。
    const barW = clamp(width * (compact ? 0.5 : 0.5), 300 * scale, 860 * scale);
    const barH = 64 * scale;
    const btnW = clamp(width * 0.13, 150 * scale, 196 * scale);
    const groupGap = 44 * scale;
    const groupW = barW + groupGap + btnW;
    const groupLeft = -groupW / 2;
    const barX = groupLeft + barW / 2;
    const total = Math.max(1, state.total);
    const ratio = clamp(state.ownedCount / total, 0, 1);

    const frameSprite = this.host.addSprite('LobbyCodexBarFrame', CODEX_UI_ASSETS.progressFrame, barX, rowY, barW, barH, parent);
    if (frameSprite) {
      this.applyBarSlicing(frameSprite, 72);
    }
    if (ratio > 0) {
      // 填充按进度截宽(左对齐),九宫格保证圆头端帽不拉伸;最短保留两端端帽宽度。
      const fillMinW = Math.min(barW, 150 * scale);
      const fillW = Math.max(fillMinW, barW * ratio);
      const fillSprite = this.host.addSprite('LobbyCodexBarFill', CODEX_UI_ASSETS.progressFilled, barX - barW / 2 + fillW / 2, rowY, fillW, barH, parent);
      if (fillSprite) {
        this.applyBarSlicing(fillSprite, 72);
      }
    }
    if (!frameSprite) {
      const bar = this.host.addChildPlainNode(parent, 'LobbyCodexBarFallback', barX, rowY, barW, 10 * scale);
      const g = bar.addComponent(Graphics);
      g.fillColor = rgba(40, 34, 26, 220);
      g.roundRect(-barW / 2, -5 * scale, barW, 10 * scale, 5 * scale);
      g.fill();
      if (ratio > 0) {
        g.fillColor = rgba(150, 226, 130, 240);
        g.roundRect(-barW / 2, -5 * scale, Math.max(6 * scale, barW * ratio), 10 * scale, 5 * scale);
        g.fill();
      }
    }
    const chestSize = clamp(barH * 1.2, 48 * scale, 78 * scale);

    // 里程碑宝箱压在进度条对应刻度上,刻度映射到条内 [7%, 93%] 区间,末档宝箱不再越过条尾金框。
    // 可领取的宝箱点一下直接领(2026-09-17 用户反馈:不弹框),其余状态点开弹框看奖励。
    const chestNodes = new Map<number, Node>();
    state.milestones.forEach((milestone, index) => {
      const fraction = clamp(milestone.targetCount / total, 0, 1);
      const chestX = barX - barW / 2 + barW * (0.07 + 0.86 * fraction);
      chestNodes.set(milestone.targetCount, this.renderMilestoneChest(parent, milestone, index, chestX, rowY + 8 * scale, chestSize, scale));
    });
    // 领取成功特效:票据落在刚变成"已开"的宝箱上,播一次即消费。
    const fx = state.claimFx;
    if (fx) {
      const match = /^MILESTONE:(\d+)$/.exec(fx.key);
      const chest = match ? chestNodes.get(Number(match[1])) ?? null : null;
      if (chest) {
        this.playChestClaimFx(parent, chest, fx.rewards, chestSize, scale);
      }
      this.host.acknowledgeLobbyCodexClaimFx();
    }

    if (state.loaded) {
      const btnX = groupLeft + groupW - btnW / 2;
      const busy = state.claiming !== null;
      const claimable = state.claimableCount > 0;
      this.addAssetButton(parent, 'LobbyCodexClaimAll', claimable ? `一键领取 ${state.claimableCount}` : '暂无可领', btnX, rowY, btnW, scale, claimable && !busy ? 'claim' : 'disabled', claimable && !busy ? () => this.host.claimAllLobbyCodexRewards() : null);
      if (claimable) {
        // 参考图:钮右侧压一枚钻石角标,提示奖励属性。
        const gem = 24 * scale;
        this.host.addSprite('LobbyCodexClaimAllGem', REWARD_ICON_BY_CODE.DIAMOND, btnX + btnW * 0.36, rowY + 1 * scale, gem, gem, parent);
      }
    }

    if (state.error) {
      const err = this.host.addChildLabel(parent, 'LobbyCodexError', '图鉴暂不可用,请稍后重试', 0, height / 2 - 100 * scale, 16 * scale, rgba(226, 132, 110), new Size(width - 120 * scale, 22 * scale));
      err.overflow = Label.Overflow.SHRINK;
    }
  }

  /** 进度条素材(603×86 一体图)改九宫格:两端各留 inset 像素雕花原样,只拉中段管身。 */
  private applyBarSlicing(sprite: Sprite, inset: number): void {
    const frame = sprite.spriteFrame;
    if (frame) {
      frame.insetLeft = inset;
      frame.insetRight = inset;
      frame.insetTop = 0;
      frame.insetBottom = 0;
    }
    sprite.type = Sprite.Type.SLICED;
    sprite.markForUpdateRenderData();
  }

  private renderMilestoneChest(parent: Node, milestone: LobbyCodexMilestoneVO, index: number, x: number, y: number, size: number, scale: number): Node {
    const node = this.host.addChildPlainNode(parent, `LobbyCodexChest_${index}`, x, y, size, size);
    const assetPath = milestone.claimed ? CODEX_UI_ASSETS.chestOpened : milestone.claimable ? CODEX_UI_ASSETS.chestReady : CODEX_UI_ASSETS.chestLocked;
    const art = this.host.addSprite('Art', assetPath, 0, 0, size, size, node);
    if (!art) {
      this.drawChestFallback(node, milestone, size, scale);
    }
    if (milestone.claimable) {
      this.attachPulse(node, 0.92, 1.06);
      this.addRedDot(node, size * 0.38, size * 0.38, 6 * scale);
    }
    const num = this.host.addChildLabel(node, 'Num', `${milestone.targetCount}`, 0, -size * 0.62, 14 * scale, milestone.reached ? rgba(255, 226, 150) : rgba(170, 156, 128), new Size(size * 1.4, 18 * scale));
    num.overflow = Label.Overflow.SHRINK;
    this.applyOutline(num, scale, true);
    node.addComponent(Button);
    this.host.applyImageButtonFeedback(node, 1.08, 0.94);
    node.on(Button.EventType.CLICK, () => {
      // 点击时读实时状态:直领期间不重绘,靠这里挡住连点。
      if (this.host.currentLobbyCodexState().claiming) {
        return;
      }
      if (milestone.claimable) {
        this.host.claimLobbyCodexReward({ type: 'MILESTONE', targetCount: milestone.targetCount });
        return;
      }
      this.host.selectLobbyCodexMilestone(milestone.targetCount);
    }, this);
    return node;
  }

  /**
   * 宝箱直领特效:宝箱弹一下 + 金环扩散 + 火花四散 + 奖励飘字;全部挂在临时节点上,2.2s 后自毁,
   * 不挂 Button 不挡输入;若期间整页重绘被销毁也无副作用。
   */
  private playChestClaimFx(parent: Node, chest: Node, rewards: QuestRewardItemVO[], size: number, scale: number): void {
    const pos = chest.position;
    const fx = this.host.addChildPlainNode(parent, 'LobbyCodexChestFx', pos.x, pos.y, size * 3, size * 3);

    // 宝箱弹跳
    chest.setScale(new Vec3(0.8, 0.8, 1));
    tween(chest)
      .to(0.14, { scale: new Vec3(1.32, 1.32, 1) }, { easing: 'quadOut' })
      .to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();

    // 金环扩散
    for (let r = 0; r < 2; r += 1) {
      const ring = this.host.addChildPlainNode(fx, `Ring_${r}`, 0, 0, size, size);
      const rg = ring.addComponent(Graphics);
      rg.strokeColor = r === 0 ? rgba(255, 220, 120, 240) : rgba(255, 180, 70, 180);
      rg.lineWidth = Math.max(2, (r === 0 ? 3.2 : 2) * scale);
      rg.circle(0, 0, size * 0.42);
      rg.stroke();
      const ro = ring.addComponent(UIOpacity);
      ring.setScale(new Vec3(0.6, 0.6, 1));
      tween(ring).delay(r * 0.12).to(0.6, { scale: new Vec3(2.8, 2.8, 1) }, { easing: 'quadOut' }).start();
      tween(ro).delay(r * 0.12).to(0.6, { opacity: 0 }).start();
    }

    // 火花四散
    const sparkCount = 12;
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
      const dist = size * (0.9 + Math.random() * 0.7);
      const radius = (2.2 + Math.random() * 2.2) * scale;
      const spark = this.host.addChildPlainNode(fx, `Spark_${i}`, 0, 0, radius * 2, radius * 2);
      const sg = spark.addComponent(Graphics);
      sg.fillColor = i % 3 === 0 ? rgba(255, 240, 200, 255) : rgba(255, 200, 90, 255);
      sg.circle(0, 0, radius);
      sg.fill();
      const so = spark.addComponent(UIOpacity);
      tween(spark)
        .to(0.55 + Math.random() * 0.25, { position: new Vec3(Math.cos(angle) * dist, Math.sin(angle) * dist + size * 0.15, 0) }, { easing: 'quadOut' })
        .start();
      tween(so).delay(0.25).to(0.45, { opacity: 0 }).start();
    }

    // 奖励飘字(最多 3 条,错峰上浮淡出)
    rewards.slice(0, 3).forEach((reward, index) => {
      const text = `+${this.formatAmount(reward.amount)} ${safeText(reward.name || reward.code)}`;
      // 宝箱贴着屏幕顶,飘字从箱底起飞、只升到箱子中线附近,不会飘出屏外。
      const label = this.host.addChildLabel(fx, `Float_${index}`, text, 0, -size * 0.85 - index * 8 * scale, 20 * scale, rgba(255, 232, 150), new Size(260 * scale, 28 * scale));
      label.overflow = Label.Overflow.SHRINK;
      label.isBold = true;
      this.applyOutline(label, scale, true);
      const lo = label.node.addComponent(UIOpacity);
      lo.opacity = 0;
      const delay = 0.1 + index * 0.16;
      tween(lo).delay(delay).to(0.15, { opacity: 255 }).delay(0.85).to(0.45, { opacity: 0 }).start();
      tween(label.node).delay(delay).by(1.45, { position: new Vec3(0, size * 0.55 + index * 6 * scale, 0) }, { easing: 'quadOut' }).start();
    });

    tween(fx).delay(2.2).call(() => {
      if (fx.isValid) {
        fx.destroy();
      }
    }).start();
  }

  /** 宝箱缺图时的手绘占位:圆角箱体 + 盖子;锁定灰、可领金、已开绿。 */
  private drawChestFallback(node: Node, milestone: LobbyCodexMilestoneVO, size: number, scale: number): void {
    const g = node.addComponent(Graphics);
    const body = milestone.claimed ? rgba(46, 96, 62, 236) : milestone.claimable ? rgba(150, 104, 30, 240) : rgba(48, 44, 46, 230);
    const stroke = milestone.claimed ? rgba(130, 220, 150, 240) : milestone.claimable ? rgba(255, 214, 110, 250) : rgba(120, 110, 100, 200);
    g.fillColor = body;
    g.roundRect(-size * 0.4, -size * 0.34, size * 0.8, size * 0.5, size * 0.08);
    g.fill();
    g.fillColor = milestone.claimable ? rgba(196, 140, 44, 245) : milestone.claimed ? rgba(60, 120, 80, 240) : rgba(64, 58, 60, 230);
    g.roundRect(-size * 0.44, milestone.claimed ? 0.02 * size : -0.02 * size, size * 0.88, size * 0.3, size * 0.1);
    g.fill();
    g.strokeColor = stroke;
    g.lineWidth = Math.max(1, 1.6 * scale);
    g.roundRect(-size * 0.4, -size * 0.34, size * 0.8, size * 0.5, size * 0.08);
    g.stroke();
    g.fillColor = stroke;
    g.circle(0, size * 0.02, size * 0.06);
    g.fill();
  }

  // ── 页签行:稀有度 + 仅看未收集 ──

  private renderFilterRow(parent: Node, width: number, height: number, scale: number, state: LobbyCodexPanelState): void {
    const rowY = height / 2 - 158 * scale;
    const metrics = this.wallMetrics(width, height, scale);
    // 页签放大一档,左沿与卡墙第一列左沿对齐;页签总宽不超过卡墙宽的 62%,给右侧开关留位。
    const gap = 12 * scale;
    const tabW = clamp((metrics.gridWidth * 0.66 - gap * (CODEX_FILTERS.length - 1)) / CODEX_FILTERS.length, 80 * scale, 156 * scale);
    const startX = -metrics.gridWidth / 2 + tabW / 2;
    CODEX_FILTERS.forEach((filter, index) => {
      const active = state.filter === filter;
      this.addTabButton(parent, `LobbyCodexTab_${filter}`, CODEX_FILTER_LABELS[filter], active, startX + index * (tabW + gap), rowY, tabW, scale, () => this.host.setLobbyCodexFilter(filter));
    });

    // 仅看未收集:勾选框 + 文案。
    const toggleW = 150 * scale;
    const toggleX = startX + CODEX_FILTERS.length * (tabW + gap) + toggleW / 2 + 14 * scale;
    const toggle = this.host.addChildPlainNode(parent, 'LobbyCodexUnownedToggle', Math.min(toggleX, metrics.gridWidth / 2 - toggleW / 2), rowY, toggleW, 30 * scale);
    const g = toggle.addComponent(Graphics);
    const boxSize = 18 * scale;
    const boxX = -toggleW / 2 + 12 * scale;
    g.fillColor = state.unownedOnly ? rgba(196, 146, 60, 235) : rgba(16, 14, 16, 200);
    g.roundRect(boxX, -boxSize / 2, boxSize, boxSize, 3 * scale);
    g.fill();
    g.strokeColor = rgba(214, 170, 92, 220);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.roundRect(boxX, -boxSize / 2, boxSize, boxSize, 3 * scale);
    g.stroke();
    if (state.unownedOnly) {
      g.strokeColor = rgba(28, 20, 12, 255);
      g.lineWidth = Math.max(1.5, 2.2 * scale);
      g.moveTo(boxX + boxSize * 0.22, 0);
      g.lineTo(boxX + boxSize * 0.44, -boxSize * 0.26);
      g.lineTo(boxX + boxSize * 0.8, boxSize * 0.3);
      g.stroke();
    }
    const label = this.host.addChildLabel(toggle, 'Text', '仅看未收集', boxX + boxSize + 8 * scale, 0, 17 * scale, state.unownedOnly ? rgba(255, 228, 160) : rgba(196, 180, 146), new Size(toggleW - boxSize - 28 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
    toggle.addComponent(Button);
    this.host.applyImageButtonFeedback(toggle, 1.03, 0.97);
    toggle.on(Button.EventType.CLICK, () => this.host.toggleLobbyCodexUnownedOnly(), this);
  }

  private addTabButton(parent: Node, name: string, text: string, active: boolean, x: number, y: number, width: number, scale: number, onClick: () => void): void {
    const height = active ? width * (205 / 673) : width * (162 / 621);
    const btn = this.host.addChildPlainNode(parent, name, x, y, width, Math.max(height, 38 * scale));
    if (!this.host.addSprite('Art', active ? CODEX_UI_ASSETS.tabActive : CODEX_UI_ASSETS.tabNormal, 0, 0, width, height, btn)) {
      const g = btn.addComponent(Graphics);
      g.fillColor = active ? rgba(89, 65, 30, 238) : rgba(14, 13, 15, 218);
      g.roundRect(-width / 2, -height / 2, width, height, 6 * scale);
      g.fill();
      g.strokeColor = active ? rgba(245, 203, 101, 236) : rgba(132, 96, 50, 188);
      g.lineWidth = Math.max(1, active ? 1.8 * scale : 1.2 * scale);
      g.roundRect(-width / 2, -height / 2, width, height, 6 * scale);
      g.stroke();
    }
    const label = this.host.addChildLabel(btn, 'Text', text, 0, 0, 23 * scale, active ? rgba(255, 231, 166) : rgba(200, 182, 142), new Size(width - 16 * scale, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, active);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(btn, 1.03, 0.97);
  }

  // ── 卡墙 ──

  /**
   * 卡墙几何(2026-09-17 用户反馈:页签起点要与第一列卡对齐,卡与卡之间要有明显留白)。
   * 头两行固定高度,余下全部给卡墙;列数按最小卡宽推,卡宽封顶 238。
   */
  private wallMetrics(width: number, height: number, scale: number): {
    bodyTop: number; bodyBottom: number; bodyWidth: number; columns: number;
    cardWidth: number; cardHeight: number; gap: number; rowGap: number; gridWidth: number;
  } {
    const bodyTop = height / 2 - 196 * scale;
    const bodyBottom = -height / 2 + 16 * scale;
    const bodyWidth = width - 56 * scale;
    const gap = 26 * scale;
    const minCardW = 150 * scale;
    const columns = clamp(Math.floor((bodyWidth + gap) / (minCardW + gap)), 2, 5);
    const cardWidth = Math.min(238 * scale, (bodyWidth - gap * (columns - 1)) / columns);
    const cardHeight = cardWidth / CODEX_CARD_ASPECT;
    const rowGap = 30 * scale;
    const gridWidth = cardWidth * columns + gap * (columns - 1);
    return { bodyTop, bodyBottom, bodyWidth, columns, cardWidth, cardHeight, gap, rowGap, gridWidth };
  }

  private visibleItems(state: LobbyCodexPanelState): LobbyCodexItemVO[] {
    return state.items.filter((item) => {
      if (state.filter !== 'ALL' && item.rarity.toUpperCase() !== state.filter) {
        return false;
      }
      return !(state.unownedOnly && item.owned);
    });
  }

  private renderCardWall(parent: Node, width: number, height: number, scale: number, state: LobbyCodexPanelState): void {
    const metrics = this.wallMetrics(width, height, scale);
    const { bodyTop, bodyBottom, bodyWidth, columns, cardWidth, cardHeight, gap, rowGap, gridWidth } = metrics;
    const bodyHeight = Math.max(120 * scale, bodyTop - bodyBottom);
    const bodyCenterY = (bodyTop + bodyBottom) / 2;
    if (state.loading && state.items.length === 0) {
      this.renderEmpty(parent, width, bodyCenterY, scale, '图鉴读取中,请稍候。');
      return;
    }
    const items = this.visibleItems(state);
    if (items.length === 0) {
      this.renderEmpty(parent, width, bodyCenterY, scale, state.items.length === 0 ? '当前暂无可展示的英雄图鉴。' : state.unownedOnly ? '这一档已全部收录。' : '该稀有度暂无英雄。');
      return;
    }

    // 顶部留出可领取柔光外扩的余量。
    const effectPad = cardHeight * 0.02;
    const rows = Math.ceil(items.length / columns);
    const contentHeight = Math.max(bodyHeight, rows * cardHeight + (rows - 1) * rowGap + effectPad * 2);

    const viewport = this.host.addChildPlainNode(parent, 'LobbyCodexScrollView', 0, bodyCenterY, bodyWidth, bodyHeight);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;
    const content = this.host.addChildPlainNode(viewport, 'LobbyCodexScrollContent', 0, (bodyHeight - contentHeight) / 2, bodyWidth, contentHeight);
    scrollView.content = content;

    const startX = -gridWidth / 2 + cardWidth / 2;
    const startY = contentHeight / 2 - effectPad - cardHeight / 2;
    items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      this.renderCodexCard(content, item, index, startX + col * (cardWidth + gap), startY - row * (cardHeight + rowGap), cardWidth, cardHeight, scale, state.claiming !== null);
    });
  }

  private renderEmpty(parent: Node, width: number, y: number, scale: number, text: string): void {
    const boxW = Math.min(width - 96 * scale, 520 * scale);
    const box = this.host.addChildPlainNode(parent, 'LobbyCodexEmptyBox', 0, y, boxW, 110 * scale);
    const graphics = box.addComponent(Graphics);
    graphics.fillColor = rgba(9, 9, 12, 160);
    graphics.roundRect(-boxW / 2, -55 * scale, boxW, 110 * scale, 10 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(148, 110, 56, 118);
    graphics.roundRect(-boxW / 2, -55 * scale, boxW, 110 * scale, 10 * scale);
    graphics.stroke();
    const label = this.host.addChildLabel(box, 'LobbyCodexEmptyText', text, 0, 0, 20 * scale, rgba(213, 193, 151), new Size(boxW - 40 * scale, 48 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private toHeroStub(item: LobbyCodexItemVO): LobbyHeroItemVO {
    return {
      id: 0,
      heroCode: item.heroCode,
      heroName: item.heroName,
      rarity: item.rarity,
      faction: item.faction,
      heroClass: item.heroClass,
      level: 1,
      star: 0,
      power: 0,
      protagonist: false,
      sourceType: 'CODEX',
      portraitAsset: item.portraitAsset ?? null,
      cardBackgroundAsset: item.cardBackgroundAsset ?? null,
      spineAsset: item.spineAsset ?? null,
      spineUuid: item.spineUuid ?? null,
    };
  }

  private renderCodexCard(parent: Node, item: LobbyCodexItemVO, index: number, x: number, y: number, width: number, height: number, scale: number, busy: boolean): void {
    const card = this.host.addChildPlainNode(parent, `LobbyCodexCard_${index}`, x, y, width, height);
    card.addComponent(Button);
    card.on(Button.EventType.CLICK, () => {
      if (busy) {
        return;
      }
      this.host.selectLobbyCodexHero(item.heroCode);
    }, this);
    this.host.applyImageButtonFeedback(card, 1.024, 0.982);
    // 图鉴卡不挂 SSR/UR 边框动效(2026-09-15 用户拍板:图鉴去掉,英雄界面保留)。
    this.host.renderCodexHeroCardArtwork(card, this.toHeroStub(item), width, height, scale, false);

    // 2026-09-17 滚动卡顿优化:未收集灰影 / 外沿金边 / 稀有度牌 / 角标全部画进同一个 Graphics,
    // 每卡程序绘制从 5 个节点降到 1 个,draw call 与每帧脏节点重填都少一大截。
    const deco = this.host.addChildPlainNode(card, 'LobbyCodexCardDeco', 0, 0, width, height);
    const g = deco.addComponent(Graphics);
    if (!item.owned) {
      g.fillColor = rgba(4, 4, 8, 172);
      this.traceSlantRect(g, width * 0.985, height * 0.99, 16 * scale);
      g.fill();
    }
    g.strokeColor = item.owned ? rgba(214, 170, 92, 120) : rgba(110, 100, 90, 80);
    g.lineWidth = Math.max(1, 1.2 * scale);
    this.traceSlantRect(g, width * 1.004, height * 1.003, 14 * scale);
    g.stroke();
    this.renderCardChrome(deco, item, width, height, scale, g);

    if (!item.owned) {
      const lockH = clamp(height * 0.2, 30 * scale, 56 * scale);
      const lockW = lockH * (135 / 192);
      this.host.addSprite('LobbyCodexLock', CODEX_UI_ASSETS.lock, 0, height * 0.1, lockW, lockH, deco);
      const tip = this.host.addChildLabel(deco, 'LobbyCodexUnownedText', '未收集', 0, height * 0.1 - lockH * 0.78, Math.min(15 * scale, height * 0.048), rgba(214, 200, 168), new Size(width - 30 * scale, 20 * scale));
      tip.overflow = Label.Overflow.SHRINK;
      this.applyOutline(tip, scale, true);
      tip.cacheMode = Label.CacheMode.BITMAP;
      return;
    }
    if (item.rewardClaimable) {
      this.renderClaimableGlow(card, width, height, scale);
      this.addCornerTag(deco, 'LobbyCodexClaimTag', '领取', width / 2 - 26 * scale, height / 2 - 14 * scale, 50 * scale, 22 * scale, rgba(200, 44, 38, 242), rgba(255, 232, 200), scale, g);
    } else if (item.rewardClaimed) {
      this.addCornerTag(deco, 'LobbyCodexClaimedTag', '已激活', width / 2 - 32 * scale, height / 2 - 14 * scale, 62 * scale, 22 * scale, rgba(30, 92, 58, 228), rgba(200, 240, 206), scale, g);
    }
  }

  /**
   * 卡面文字(2026-09-17 用户反馈优化):稀有度改成左上角六边形色牌,不再压在英雄脚上;
   * 名字落到卡框下部铭牌正中(铭牌区约 0.04h~0.20h)。
   * sharedGraphics 给定时把牌面画进它(卡墙合批路径),否则自建节点(弹框大卡)。
   */
  private renderCardChrome(card: Node, item: LobbyCodexItemVO, width: number, height: number, scale: number, sharedGraphics?: Graphics): void {
    const rarity = safeText(item.rarity || 'R').toUpperCase();
    const badgeW = clamp(width * 0.22, 32 * scale, 52 * scale);
    const badgeH = badgeW * 0.58;
    const badgeX = -width / 2 + badgeW / 2 + width * 0.07;
    const badgeY = height / 2 - badgeH / 2 - height * 0.07;
    const color = item.owned ? this.rarityColor(rarity) : rgba(96, 90, 84);
    const cut = badgeH * 0.5;
    const traceHex = (g: Graphics, cx: number, cy: number, w: number, h: number): void => {
      g.moveTo(cx - w / 2 + cut, cy + h / 2);
      g.lineTo(cx + w / 2 - cut, cy + h / 2);
      g.lineTo(cx + w / 2, cy);
      g.lineTo(cx + w / 2 - cut, cy - h / 2);
      g.lineTo(cx - w / 2 + cut, cy - h / 2);
      g.lineTo(cx - w / 2, cy);
      g.close();
    };
    let labelParent: Node;
    let bg: Graphics;
    let cx = 0;
    let cy = 0;
    if (sharedGraphics) {
      bg = sharedGraphics;
      labelParent = card;
      cx = badgeX;
      cy = badgeY;
    } else {
      labelParent = this.host.addChildPlainNode(card, 'LobbyCodexRarityBadge', badgeX, badgeY, badgeW, badgeH);
      bg = labelParent.addComponent(Graphics);
    }
    bg.fillColor = new Color(Math.round(color.r * 0.55), Math.round(color.g * 0.55), Math.round(color.b * 0.55), 236);
    traceHex(bg, cx, cy, badgeW, badgeH);
    bg.fill();
    bg.strokeColor = item.owned ? rgba(232, 190, 104, 235) : rgba(150, 136, 118, 200);
    bg.lineWidth = Math.max(1, 1.4 * scale);
    traceHex(bg, cx, cy, badgeW, badgeH);
    bg.stroke();
    const rarityLabel = this.host.addChildLabel(labelParent, 'LobbyCodexRarityText', rarity, cx, cy, Math.max(11, badgeH * 0.62), item.owned ? rgba(255, 246, 226) : rgba(196, 186, 170), new Size(badgeW - 6 * scale, badgeH));
    rarityLabel.overflow = Label.Overflow.SHRINK;
    rarityLabel.isBold = true;
    this.applyOutline(rarityLabel, scale, true);
    // 卡上静态文字走位图缓存:进动态图集后可与贴图合批。
    rarityLabel.cacheMode = Label.CacheMode.BITMAP;
    const name = this.host.addChildLabel(card, 'LobbyCodexHeroName', safeText(item.heroName), 0, -height / 2 + height * 0.122, Math.min(17 * scale, height * 0.052), item.owned ? rgba(250, 218, 146) : rgba(168, 156, 132), new Size(width - 56 * scale, Math.max(22 * scale, height * 0.056)));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    name.cacheMode = Label.CacheMode.BITMAP;
  }

  /** 弹框大卡的未收集灰影(卡墙路径已合进 renderCodexCard 的共享 Graphics)。 */
  private renderUnownedOverlay(card: Node, width: number, height: number, scale: number): void {
    const overlay = this.host.addChildPlainNode(card, 'LobbyCodexUnownedShade', 0, 0, width, height);
    const g = overlay.addComponent(Graphics);
    g.fillColor = rgba(4, 4, 8, 172);
    this.traceSlantRect(g, width * 0.985, height * 0.99, 16 * scale);
    g.fill();
    const lockH = clamp(height * 0.2, 30 * scale, 56 * scale);
    const lockW = lockH * (135 / 192);
    this.host.addSprite('LobbyCodexLock', CODEX_UI_ASSETS.lock, 0, height * 0.1, lockW, lockH, overlay);
    const tip = this.host.addChildLabel(overlay, 'LobbyCodexUnownedText', '未收集', 0, height * 0.1 - lockH * 0.78, Math.min(15 * scale, height * 0.048), rgba(214, 200, 168), new Size(width - 30 * scale, 20 * scale));
    tip.overflow = Label.Overflow.SHRINK;
    this.applyOutline(tip, scale, true);
  }

  /** 可领取:金色呼吸描边。 */
  private renderClaimableGlow(card: Node, width: number, height: number, scale: number): void {
    const glow = this.host.addChildPlainNode(card, 'LobbyCodexClaimGlow', 0, 0, width, height);
    const g = glow.addComponent(Graphics);
    // 由外到内四层递减描边模拟外发光(Graphics 无模糊),最内层细亮线贴卡框。
    const layers: Array<[number, number, number]> = [
      [1.045, 10, 30],
      [1.03, 7, 70],
      [1.018, 4, 130],
      [1.008, 2.2, 236],
    ];
    layers.forEach(([grow, lineWidth, alpha]) => {
      g.strokeColor = rgba(255, 214, 110, alpha);
      g.lineWidth = Math.max(1, lineWidth * scale);
      this.traceSlantRect(g, width * grow, height * (1 + (grow - 1) * 0.7), 18 * scale);
      g.stroke();
    });
    const opacity = glow.addComponent(UIOpacity);
    opacity.opacity = 255;
    tween(opacity)
      .repeatForever(tween(opacity).to(1.2, { opacity: 120 }).to(1.2, { opacity: 255 }))
      .start();
  }

  /** 角标:sharedGraphics 给定时画进它(卡墙合批路径),文字挂在 parent 对应位置。 */
  private addCornerTag(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, fill: Color, textColor: Color, scale: number, sharedGraphics?: Graphics): void {
    let g: Graphics;
    let labelParent: Node;
    let lx = 0;
    let ly = 0;
    if (sharedGraphics) {
      g = sharedGraphics;
      labelParent = parent;
      lx = x;
      ly = y;
    } else {
      labelParent = this.host.addChildPlainNode(parent, name, x, y, width, height);
      g = labelParent.addComponent(Graphics);
    }
    g.fillColor = fill;
    g.roundRect(lx - width / 2, ly - height / 2, width, height, 4 * scale);
    g.fill();
    g.strokeColor = rgba(255, 226, 160, 160);
    g.lineWidth = Math.max(1, 1 * scale);
    g.roundRect(lx - width / 2, ly - height / 2, width, height, 4 * scale);
    g.stroke();
    const label = this.host.addChildLabel(labelParent, `${name}Text`, text, lx, ly, Math.max(11, 13 * scale), textColor, new Size(width - 6 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    label.cacheMode = Label.CacheMode.BITMAP;
  }

  private addRedDot(parent: Node, x: number, y: number, radius: number): void {
    const dot = this.host.addChildPlainNode(parent, 'LobbyCodexRedDot', x, y, radius * 2, radius * 2);
    const g = dot.addComponent(Graphics);
    g.fillColor = rgba(232, 56, 48, 250);
    g.circle(0, 0, radius);
    g.fill();
    g.strokeColor = rgba(255, 220, 200, 200);
    g.lineWidth = 1;
    g.circle(0, 0, radius);
    g.stroke();
  }

  private attachPulse(node: Node, from: number, to: number): void {
    node.setScale(new Vec3(from, from, 1));
    tween(node)
      .repeatForever(tween(node).to(0.6, { scale: new Vec3(to, to, 1) }).to(0.6, { scale: new Vec3(from, from, 1) }))
      .start();
  }

  // ── 详情弹框:英雄 ──

  private renderHeroDetailPopup(parent: Node, layout: UiLayout, panelWidth: number, panelHeight: number, scale: number, state: LobbyCodexPanelState, item: LobbyCodexItemVO): void {
    const popup = this.mountPopupShell(parent, layout, panelWidth, panelHeight, scale, () => this.host.selectLobbyCodexHero(null));
    const width = popup.width;
    const height = popup.height;
    const body = popup.node;

    // 左:大卡面(可领取时同样金框)。
    const cardH = height * 0.72;
    const cardW = cardH * CODEX_CARD_ASPECT;
    const cardX = -width * 0.5 + cardW / 2 + width * 0.09;
    const card = this.host.addChildPlainNode(body, 'LobbyCodexPopupCard', cardX, height * 0.02, cardW, cardH);
    this.host.renderCodexHeroCardArtwork(card, this.toHeroStub(item), cardW, cardH, scale, false);
    this.renderCardChrome(card, item, cardW, cardH, scale);
    if (!item.owned) {
      this.renderUnownedOverlay(card, cardW, cardH, scale);
    } else if (item.rewardClaimable) {
      this.renderClaimableGlow(card, cardW, cardH, scale);
    }

    // 右:名字 / 标签 / 奖励清单 / 状态 / 按钮。
    const rightLeft = cardX + cardW / 2 + width * 0.05;
    const rightWidth = width / 2 - rightLeft - width * 0.07;
    const name = this.host.addChildLabel(body, 'LobbyCodexPopupName', safeText(item.heroName), rightLeft, height * 0.31, 28 * scale, rgba(255, 234, 176), new Size(rightWidth, 36 * scale), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);

    const rarity = safeText(item.rarity).toUpperCase();
    const chips = [rarity, safeText(item.faction), safeText(item.heroClass), safeText(item.roleDesc ?? '')].filter((text) => text.length > 0);
    let chipX = rightLeft;
    chips.forEach((text, index) => {
      const chipW = clamp(text.length * 15 * scale + 18 * scale, 36 * scale, 120 * scale);
      if (chipX + chipW > rightLeft + rightWidth) {
        return;
      }
      const color = index === 0 ? this.rarityColor(text) : rgba(196, 176, 140);
      this.addChip(body, `LobbyCodexPopupChip_${index}`, text, chipX + chipW / 2, height * 0.2, chipW, 24 * scale, color, scale);
      chipX += chipW + 6 * scale;
    });

    this.drawPopupDivider(body, rightLeft, height * 0.135, rightWidth, scale);
    const sectionTitle = this.host.addChildLabel(body, 'LobbyCodexPopupRewardTitle', item.owned ? '激活奖励' : '收录激活奖励', rightLeft, height * 0.085, 18 * scale, rgba(226, 196, 132), new Size(rightWidth, 24 * scale), HorizontalTextAlignment.LEFT);
    sectionTitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(sectionTitle, scale, false);
    // 奖励清单装进暗底金边小框(参考图排版),获取途径紧随其后。
    const rewardRows = Math.max(1, Math.min(4, item.activateRewards.length));
    const boxTop = height * 0.085 - 18 * scale;
    const boxH = rewardRows * 38 * scale + 18 * scale;
    this.drawRewardBox(body, rightLeft, boxTop, rightWidth, boxH, scale);
    this.renderRewardRows(body, item.activateRewards, rightLeft + 14 * scale, boxTop - 9 * scale - 19 * scale, rightWidth - 28 * scale, scale);
    const sourceText = `获取途径:${rarity === 'UR' ? '限定召唤 / 英雄召唤' : '英雄召唤'}`;
    const source = this.host.addChildLabel(body, 'LobbyCodexPopupSource', sourceText, rightLeft, boxTop - boxH - 16 * scale, 15 * scale, rgba(176, 164, 138), new Size(rightWidth, 22 * scale), HorizontalTextAlignment.LEFT);
    source.overflow = Label.Overflow.SHRINK;

    const statusText = !item.owned
      ? '尚未收集,可通过召唤获得'
      : item.rewardClaimed
      ? `已收录 ×${Math.max(1, item.ownedCount)} · 激活奖励已领取`
      : item.rewardClaimable
      ? `已收录 ×${Math.max(1, item.ownedCount)} · 首次收录奖励待领取`
      : `已收录 ×${Math.max(1, item.ownedCount)}`;
    const status = this.host.addChildLabel(body, 'LobbyCodexPopupStatus', statusText, rightLeft, -height * 0.27, 15 * scale, item.rewardClaimable ? rgba(255, 214, 130) : rgba(180, 168, 140), new Size(rightWidth, 22 * scale), HorizontalTextAlignment.LEFT);
    status.overflow = Label.Overflow.SHRINK;

    const btnW = clamp(rightWidth * 0.62, 150 * scale, 220 * scale);
    const btnX = rightLeft + rightWidth - btnW / 2;
    const btnY = -height * 0.35;
    const busy = state.claiming !== null;
    if (!item.owned) {
      this.addAssetButton(body, 'LobbyCodexPopupSummon', '前往召唤', btnX, btnY, btnW, scale, 'primary', () => this.host.openLobbyGachaSceneFromCodex());
    } else if (item.rewardClaimable) {
      this.addAssetButton(body, 'LobbyCodexPopupClaim', busy ? '领取中...' : '领取奖励', btnX, btnY, btnW, scale, busy ? 'disabled' : 'claim', busy ? null : () => this.host.claimLobbyCodexReward({ type: 'HERO', heroCode: item.heroCode }));
    } else {
      this.addAssetButton(body, 'LobbyCodexPopupClaimed', '已领取', btnX, btnY, btnW, scale, 'disabled', null);
    }
  }

  // ── 详情弹框:里程碑 ──

  private renderMilestonePopup(parent: Node, layout: UiLayout, panelWidth: number, panelHeight: number, scale: number, state: LobbyCodexPanelState, milestone: LobbyCodexMilestoneVO): void {
    const popup = this.mountPopupShell(parent, layout, panelWidth, panelHeight, scale, () => this.host.selectLobbyCodexMilestone(null));
    const width = popup.width;
    const height = popup.height;
    const body = popup.node;

    const chestSize = height * 0.5;
    const chestX = -width * 0.5 + chestSize / 2 + width * 0.12;
    const chestNode = this.host.addChildPlainNode(body, 'LobbyCodexPopupChest', chestX, height * 0.04, chestSize, chestSize);
    const assetPath = milestone.claimed ? CODEX_UI_ASSETS.chestOpened : milestone.claimable ? CODEX_UI_ASSETS.chestReady : CODEX_UI_ASSETS.chestLocked;
    if (!this.host.addSprite('Art', assetPath, 0, 0, chestSize, chestSize, chestNode)) {
      this.drawChestFallback(chestNode, milestone, chestSize, scale);
    }
    if (milestone.claimable) {
      this.attachPulse(chestNode, 0.96, 1.04);
    }

    const rightLeft = chestX + chestSize / 2 + width * 0.06;
    const rightWidth = width / 2 - rightLeft - width * 0.07;
    const title = this.host.addChildLabel(body, 'LobbyCodexPopupMilestoneTitle', safeText(milestone.rewardName), rightLeft, height * 0.3, 27 * scale, rgba(255, 234, 176), new Size(rightWidth, 36 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const progress = this.host.addChildLabel(body, 'LobbyCodexPopupMilestoneProgress', `收录进度 ${Math.min(state.ownedCount, milestone.targetCount)}/${milestone.targetCount}`, rightLeft, height * 0.19, 17 * scale, milestone.reached ? rgba(160, 230, 150) : rgba(196, 176, 140), new Size(rightWidth, 24 * scale), HorizontalTextAlignment.LEFT);
    progress.overflow = Label.Overflow.SHRINK;

    this.drawPopupDivider(body, rightLeft, height * 0.135, rightWidth, scale);
    const sectionTitle = this.host.addChildLabel(body, 'LobbyCodexPopupRewardTitle', '里程碑奖励', rightLeft, height * 0.08, 18 * scale, rgba(226, 196, 132), new Size(rightWidth, 24 * scale), HorizontalTextAlignment.LEFT);
    sectionTitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(sectionTitle, scale, false);
    const mRows = Math.max(1, Math.min(4, milestone.rewards.length));
    const mBoxTop = height * 0.08 - 18 * scale;
    const mBoxH = mRows * 38 * scale + 18 * scale;
    this.drawRewardBox(body, rightLeft, mBoxTop, rightWidth, mBoxH, scale);
    this.renderRewardRows(body, milestone.rewards, rightLeft + 14 * scale, mBoxTop - 9 * scale - 19 * scale, rightWidth - 28 * scale, scale);

    const statusText = milestone.claimed ? '奖励已领取' : milestone.claimable ? '达成!可领取里程碑奖励' : `再收录 ${Math.max(0, milestone.targetCount - state.ownedCount)} 位英雄即可领取`;
    const status = this.host.addChildLabel(body, 'LobbyCodexPopupStatus', statusText, rightLeft, -height * 0.27, 15 * scale, milestone.claimable ? rgba(255, 214, 130) : rgba(180, 168, 140), new Size(rightWidth, 22 * scale), HorizontalTextAlignment.LEFT);
    status.overflow = Label.Overflow.SHRINK;

    const btnW = clamp(rightWidth * 0.62, 150 * scale, 220 * scale);
    const btnX = rightLeft + rightWidth - btnW / 2;
    const btnY = -height * 0.35;
    const busy = state.claiming !== null;
    if (milestone.claimable) {
      this.addAssetButton(body, 'LobbyCodexPopupClaim', busy ? '领取中...' : '领取奖励', btnX, btnY, btnW, scale, busy ? 'disabled' : 'claim', busy ? null : () => this.host.claimLobbyCodexReward({ type: 'MILESTONE', targetCount: milestone.targetCount }));
    } else {
      this.addAssetButton(body, 'LobbyCodexPopupClaimed', milestone.claimed ? '已领取' : '未达成', btnX, btnY, btnW, scale, 'disabled', null);
    }
  }

  /** 弹框外壳:全屏半透遮罩(点击关闭)+ 金雕花石板(popup_frame_large 926×543 一体构图,等比)+ 右上关闭钮。 */
  private mountPopupShell(parent: Node, layout: UiLayout, panelWidth: number, panelHeight: number, scale: number, onClose: () => void): { node: Node; width: number; height: number } {
    const shade = this.host.addChildPlainNode(parent, 'LobbyCodexPopupDim', 0, 0, layout.width, layout.height);
    const sg = shade.addComponent(Graphics);
    sg.fillColor = rgba(0, 0, 0, 150);
    sg.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    sg.fill();
    shade.addComponent(BlockInputEvents);
    shade.addComponent(Button);
    shade.on(Button.EventType.CLICK, onClose, this);

    const width = clamp(panelWidth * 0.82, 420 * scale, 880 * scale);
    const height = Math.min(width * (543 / 926), panelHeight * 0.82);
    const popup = this.host.addChildPlainNode(parent, 'LobbyCodexPopup', 0, 0, width, height);
    popup.addComponent(BlockInputEvents);
    if (!this.host.addSprite('Frame', CODEX_UI_ASSETS.popupFrame, 0, 0, width, height, popup)) {
      const g = popup.addComponent(Graphics);
      g.fillColor = rgba(14, 12, 14, 244);
      g.roundRect(-width / 2, -height / 2, width, height, 14 * scale);
      g.fill();
      g.strokeColor = rgba(204, 158, 76, 230);
      g.lineWidth = Math.max(1.5, 2 * scale);
      g.roundRect(-width / 2, -height / 2, width, height, 14 * scale);
      g.stroke();
    }
    const closeSize = 40 * scale;
    const closeBtn = this.host.addChildPlainNode(popup, 'LobbyCodexPopupClose', width / 2 - closeSize * 0.9, height / 2 - closeSize * 0.9, closeSize, closeSize);
    if (!this.host.addSprite('Art', CODEX_UI_ASSETS.close, 0, 0, closeSize * (155 / 161), closeSize, closeBtn)) {
      const label = this.host.addChildLabel(closeBtn, 'Text', '✕', 0, 0, 24 * scale, rgba(240, 210, 150), new Size(closeSize, closeSize));
      this.applyOutline(label, scale, true);
    }
    closeBtn.addComponent(Button);
    this.host.applyImageButtonFeedback(closeBtn, 1.08, 0.94);
    closeBtn.on(Button.EventType.CLICK, onClose, this);
    return { node: popup, width, height };
  }

  /** 奖励清单底框:暗底 + 细金边。 */
  private drawRewardBox(parent: Node, left: number, top: number, width: number, height: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'LobbyCodexRewardBox', left + width / 2, top - height / 2, width, height);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(8, 6, 9, 150);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.fill();
    g.strokeColor = rgba(214, 170, 92, 96);
    g.lineWidth = Math.max(1, 1 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.stroke();
  }

  /** 弹框右栏分隔线:金色渐弱细线。 */
  private drawPopupDivider(parent: Node, left: number, y: number, width: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'LobbyCodexPopupDivider', left + width / 2, y, width, 2 * scale);
    const g = node.addComponent(Graphics);
    g.strokeColor = rgba(214, 170, 92, 150);
    g.lineWidth = Math.max(1, 1 * scale);
    g.moveTo(-width / 2, 0);
    g.lineTo(width * 0.2, 0);
    g.stroke();
    g.strokeColor = rgba(214, 170, 92, 60);
    g.moveTo(width * 0.2, 0);
    g.lineTo(width / 2, 0);
    g.stroke();
  }

  private renderRewardRows(parent: Node, rewards: QuestRewardItemVO[], left: number, top: number, width: number, scale: number): void {
    if (rewards.length === 0) {
      const none = this.host.addChildLabel(parent, 'LobbyCodexRewardNone', '暂无奖励配置', left, top, 15 * scale, rgba(160, 150, 130), new Size(width, 22 * scale), HorizontalTextAlignment.LEFT);
      none.overflow = Label.Overflow.SHRINK;
      return;
    }
    const rowH = 38 * scale;
    const iconSize = 32 * scale;
    rewards.slice(0, 4).forEach((reward, index) => {
      const y = top - index * rowH;
      const iconPath = REWARD_ICON_BY_CODE[reward.code.toUpperCase()];
      const iconNode = this.host.addChildPlainNode(parent, `LobbyCodexRewardIcon_${index}`, left + iconSize / 2, y, iconSize, iconSize);
      if (!iconPath || !this.host.addSprite('Art', iconPath, 0, 0, iconSize, iconSize, iconNode)) {
        const g = iconNode.addComponent(Graphics);
        g.fillColor = rgba(60, 48, 30, 230);
        g.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 5 * scale);
        g.fill();
        g.strokeColor = rgba(214, 170, 92, 200);
        g.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 5 * scale);
        g.stroke();
      }
      const text = `${safeText(reward.name || reward.code)} ×${this.formatAmount(reward.amount)}`;
      const label = this.host.addChildLabel(parent, `LobbyCodexRewardText_${index}`, text, left + iconSize + 12 * scale, y, 18 * scale, rgba(236, 222, 186), new Size(width - iconSize - 12 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, false);
    });
  }

  private formatAmount(amount: number): string {
    if (!Number.isFinite(amount)) {
      return '0';
    }
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, '');
  }

  private addChip(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, color: Color, scale: number): void {
    const chip = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const g = chip.addComponent(Graphics);
    g.fillColor = rgba(12, 10, 10, 190);
    g.roundRect(-width / 2, -height / 2, width, height, 5 * scale);
    g.fill();
    g.strokeColor = new Color(color.r, color.g, color.b, 190);
    g.lineWidth = Math.max(1, 1.1 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 5 * scale);
    g.stroke();
    const label = this.host.addChildLabel(chip, 'Text', text, 0, 0, 14 * scale, color, new Size(width - 8 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
  }

  /** 素材化按钮:claim=红底金框(571×203)/disabled=黑牌(393×142)/primary=通用主钮(740×211);缺图退手绘。 */
  private addAssetButton(parent: Node, name: string, text: string, x: number, y: number, width: number, scale: number, style: 'claim' | 'disabled' | 'primary', onClick: (() => void) | null): void {
    const ratio = style === 'claim' ? 203 / 571 : style === 'disabled' ? 142 / 393 : 211 / 740;
    const height = Math.max(width * ratio, 36 * scale);
    const btn = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const asset = style === 'claim' ? CODEX_UI_ASSETS.btnClaim : style === 'disabled' ? CODEX_UI_ASSETS.btnDisabled : C1812_BUTTON_PRIMARY_ASSET;
    const art = this.host.addSprite('Art', asset, 0, 0, width, height, btn);
    if (!art) {
      const g = btn.addComponent(Graphics);
      g.fillColor = style === 'claim' ? rgba(150, 34, 30, 236) : style === 'disabled' ? rgba(26, 24, 26, 226) : rgba(22, 18, 17, 222);
      g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
      g.fill();
      g.strokeColor = style === 'disabled' ? rgba(96, 82, 60, 180) : rgba(232, 184, 92, 220);
      g.lineWidth = Math.max(1, 1.4 * scale);
      g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
      g.stroke();
    }
    const label = this.host.addChildLabel(btn, 'Text', text, 0, 0, 19 * scale, style === 'disabled' ? rgba(170, 160, 140) : rgba(255, 240, 200), new Size(width - 20 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, style !== 'disabled');
    if (onClick) {
      btn.addComponent(Button);
      this.host.applyImageButtonFeedback(btn, 1.04, 0.96);
      btn.on(Button.EventType.CLICK, onClick, this);
    }
  }

  // ── 通用 ──

  private traceSlantRect(graphics: Graphics, width: number, height: number, bevel: number): void {
    const left = -width / 2;
    const right = width / 2;
    const top = height / 2;
    const bottom = -height / 2;
    const corner = Math.min(bevel, width * 0.2, height * 0.45);
    graphics.moveTo(left + corner, top);
    graphics.lineTo(right - corner, top);
    graphics.lineTo(right, top - corner);
    graphics.lineTo(right, bottom + corner);
    graphics.lineTo(right - corner, bottom);
    graphics.lineTo(left + corner, bottom);
    graphics.lineTo(left, bottom + corner);
    graphics.lineTo(left, top - corner);
    graphics.close();
  }

  private drawPanelAtmosphere(panel: Node, width: number, height: number, scale: number): void {
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(117, 12, 20, 24);
    graphics.rect(-width * 0.42, -height * 0.28, width * 0.34, height * 0.56);
    graphics.fill();
    graphics.strokeColor = rgba(229, 181, 92, 64);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(-width / 2 + 36 * scale, height / 2 - 148 * scale);
    graphics.lineTo(width / 2 - 36 * scale, height / 2 - 148 * scale);
    graphics.stroke();
  }

  private rarityColor(rarity: string): Color {
    const key = rarity.toUpperCase();
    if (key === 'UR') {
      return rgba(255, 84, 48);
    }
    if (key === 'SSR') {
      return rgba(255, 168, 54);
    }
    if (key === 'SR') {
      return rgba(200, 111, 255);
    }
    if (key === 'R') {
      return rgba(93, 151, 255);
    }
    return rgba(195, 178, 138);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 220 : 180);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}
