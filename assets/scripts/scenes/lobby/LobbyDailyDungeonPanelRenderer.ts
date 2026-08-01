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
  UITransform,
  Vec3,
} from 'cc';
import type { DailyDungeonThemeVO, DailyDungeonTierVO, LobbyDailyDungeonPanelState } from '../../types/DailyDungeonTypes';
import { C1812_BUTTON_PRIMARY_ASSET } from '../C1812CommonUiAssets';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';

export interface LobbyDailyDungeonPanelHost {
  node: Node;
  currentLobbyDailyDungeonState(): LobbyDailyDungeonPanelState;
  closeLobbyDailyDungeonPanel(): void;
  reloadLobbyDailyDungeonSummary(): void;
  /** 只允许提交 DAILY_{THEME}_{TIER} 关卡码;真正的开放日/次数/解锁校验以后端为准。 */
  startLobbyDailyDungeonBattle(stageCode: string): void;
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

/** 每日材料副本面板:四主题周轮换,今日开放高亮;挑战复用主线战斗全链。 */
export class LobbyDailyDungeonPanelRenderer {
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

    this.renderHeader(panel, panelWidth, panelHeight, scale, state);
    if (state.loading && !state.summary) {
      this.addCenterHint(panel, '正在读取每日副本…', rgba(214, 196, 156, 235), scale);
    } else if (state.error && !state.summary) {
      this.addCenterHint(panel, `读取失败：${state.error}`, rgba(255, 150, 130, 235), scale);
      this.renderRetryButton(panel, scale);
    } else if (state.summary) {
      this.renderThemeCards(panel, panelWidth, panelHeight, scale, state);
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
      26 * scale,
      rgba(244, 220, 166, 255),
      new Size(width * 0.6, 36 * scale),
    );
    title.overflow = Label.Overflow.SHRINK;
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
      14 * scale,
      rgba(203, 186, 152, 225),
      new Size(width * 0.8, 22 * scale),
    );
    sub.overflow = Label.Overflow.SHRINK;
    const divider = parent.getComponent(Graphics) ?? parent.addComponent(Graphics);
    divider.strokeColor = rgba(190, 141, 62, 120);
    divider.lineWidth = Math.max(1, 1.5 * scale);
    divider.moveTo(-width / 2 + 34 * scale, height / 2 - 92 * scale);
    divider.lineTo(width / 2 - 34 * scale, height / 2 - 92 * scale);
    divider.stroke();
  }

  private renderThemeCards(parent: Node, width: number, height: number, scale: number, state: LobbyDailyDungeonPanelState): void {
    const summary = state.summary;
    if (!summary) {
      return;
    }
    const themes = summary.themes.slice(0, 4);
    const margin = 34 * scale;
    const gap = 14 * scale;
    const areaTop = height / 2 - 104 * scale;
    const areaBottom = -height / 2 + 58 * scale;
    const cardHeight = areaTop - areaBottom;
    const cardWidth = (width - margin * 2 - gap * (themes.length - 1)) / Math.max(1, themes.length);
    const centerYPos = (areaTop + areaBottom) / 2;
    themes.forEach((theme, index) => {
      const x = -width / 2 + margin + cardWidth / 2 + index * (cardWidth + gap);
      this.renderThemeCard(parent, theme, summary.staminaCost, x, centerYPos, cardWidth, cardHeight, scale, index);
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
    const card = this.host.addChildBeveledPanelNode(
      parent,
      `LobbyDailyThemeCard_${theme.code || index}`,
      x,
      y,
      width,
      height,
      open ? rgba(18, 14, 11, 236) : rgba(11, 11, 13, 230),
      open ? rgba(226, 177, 92, 235) : rgba(96, 88, 74, 170),
      10 * scale,
    );
    const titleColor = open ? rgba(247, 222, 158, 255) : rgba(168, 158, 140, 220);
    const title = this.host.addChildLabel(card, 'ThemeName', theme.name || theme.code, 0, height / 2 - 24 * scale, 20 * scale, titleColor, new Size(width - 18 * scale, 28 * scale));
    title.overflow = Label.Overflow.SHRINK;
    const daysText = `开放：周${theme.openDays.map((d) => WEEKDAY_TEXT[d] ?? '?').join('/')}`;
    const days = this.host.addChildLabel(card, 'ThemeDays', daysText, 0, height / 2 - 47 * scale, 12.5 * scale, rgba(191, 176, 146, 215), new Size(width - 16 * scale, 18 * scale));
    days.overflow = Label.Overflow.SHRINK;
    const statusText = open ? `今日开放 · 次数 ${theme.usedToday}/${theme.timesPerDay}` : '今日未开放';
    const status = this.host.addChildLabel(
      card,
      'ThemeStatus',
      statusText,
      0,
      height / 2 - 67 * scale,
      13.5 * scale,
      open ? rgba(154, 219, 156, 240) : rgba(150, 140, 126, 205),
      new Size(width - 16 * scale, 20 * scale),
    );
    status.overflow = Label.Overflow.SHRINK;

    const graphics = card.getComponent(Graphics) ?? card.addComponent(Graphics);
    graphics.strokeColor = rgba(190, 141, 62, open ? 130 : 70);
    graphics.lineWidth = Math.max(1, scale);
    graphics.moveTo(-width / 2 + 12 * scale, height / 2 - 80 * scale);
    graphics.lineTo(width / 2 - 12 * scale, height / 2 - 80 * scale);
    graphics.stroke();

    const tierAreaTop = height / 2 - 88 * scale;
    const tierAreaBottom = -height / 2 + 12 * scale;
    const tierHeight = (tierAreaTop - tierAreaBottom) / 3;
    theme.tiers.slice(0, 3).forEach((tier, tierIndex) => {
      const tierY = tierAreaTop - tierHeight * tierIndex - tierHeight / 2;
      this.renderTierBlock(card, theme, tier, staminaCost, tierY, width, tierHeight - 8 * scale, scale);
    });
  }

  private renderTierBlock(
    card: Node,
    theme: DailyDungeonThemeVO,
    tier: DailyDungeonTierVO,
    staminaCost: number,
    y: number,
    cardWidth: number,
    blockHeight: number,
    scale: number,
  ): void {
    const width = cardWidth - 20 * scale;
    const block = this.host.addChildPlainNode(card, `TierBlock_${tier.tier}`, 0, y, width, blockHeight);
    const graphics = block.addComponent(Graphics);
    const canChallenge = theme.openToday && tier.unlocked && theme.usedToday < theme.timesPerDay;
    graphics.fillColor = canChallenge ? rgba(28, 21, 14, 210) : rgba(15, 15, 17, 195);
    graphics.roundRect(-width / 2, -blockHeight / 2, width, blockHeight, 6 * scale);
    graphics.fill();
    graphics.strokeColor = canChallenge ? rgba(211, 157, 72, 200) : rgba(88, 82, 72, 140);
    graphics.lineWidth = Math.max(1, scale);
    graphics.roundRect(-width / 2, -blockHeight / 2, width, blockHeight, 6 * scale);
    graphics.stroke();

    const tierName = `难度${TIER_ROMAN[tier.tier] ?? tier.tier}`;
    const nameColor = canChallenge ? rgba(240, 219, 168, 250) : rgba(160, 152, 138, 215);
    const name = this.host.addChildLabel(block, 'TierName', tierName, -width / 2 + 8 * scale, blockHeight / 2 - 13 * scale, 14.5 * scale, nameColor, new Size(width * 0.4, 20 * scale), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;

    const rewardText = tier.rewards.length > 0
      ? tier.rewards.map((reward) => `${reward.resourceName}×${formatAmount(reward.amount)}`).join('  ')
      : '产出配置读取中';
    const rewards = this.host.addChildLabel(
      block,
      'TierRewards',
      rewardText,
      0,
      2 * scale,
      11.5 * scale,
      canChallenge ? rgba(206, 190, 154, 230) : rgba(142, 134, 120, 195),
      new Size(width - 14 * scale, 30 * scale),
    );
    rewards.overflow = Label.Overflow.SHRINK;

    if (canChallenge) {
      const buttonWidth = Math.min(118 * scale, width * 0.52);
      const buttonHeight = buttonWidth * (211 / 740) * 1.18;
      const button = this.host.addChildPlainNode(block, `TierChallenge_${theme.code}_${tier.tier}`, 0, -blockHeight / 2 + buttonHeight / 2 + 5 * scale, buttonWidth, buttonHeight);
      const sprite = this.host.addSprite(`TierChallengeSprite_${theme.code}_${tier.tier}`, C1812_BUTTON_PRIMARY_ASSET, 0, 0, buttonWidth, buttonHeight, button);
      if (!sprite) {
        const fallback = button.addComponent(Graphics);
        fallback.fillColor = rgba(122, 32, 26, 235);
        fallback.roundRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 5 * scale);
        fallback.fill();
      }
      const label = this.host.addChildLabel(button, 'TierChallengeLabel', `挑战 -${staminaCost}体力`, 0, 0, 12.5 * scale, rgba(255, 240, 205, 255), new Size(buttonWidth - 10 * scale, 18 * scale));
      label.overflow = Label.Overflow.SHRINK;
      button.addComponent(Button);
      button.on(Button.EventType.CLICK, () => this.host.startLobbyDailyDungeonBattle(tier.stageCode), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    } else {
      const hint = !tier.unlocked
        ? `通关 ${tier.unlockStageCode} 解锁`
        : !theme.openToday
          ? '今日未开放'
          : '今日次数已用完';
      const hintLabel = this.host.addChildLabel(block, 'TierLockHint', hint, 0, -blockHeight / 2 + 13 * scale, 12 * scale, rgba(146, 138, 124, 205), new Size(width - 12 * scale, 18 * scale));
      hintLabel.overflow = Label.Overflow.SHRINK;
    }
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

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return Number.isInteger(amount) ? `${amount}` : amount.toFixed(1);
}
