import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { PlayerBattleRewardItemVO } from '../../types/BattleTypes';
import type { RaidStagesVO, RaidStageVO } from '../../types/RaidTypes';
import { C1812_BUTTON_PRIMARY_ASSET } from '../C1812CommonUiAssets';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { mountKitLoading } from '../UiKit';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { resolveHeroAvatarPath } from './HeroHeadCrop';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 矿境面板(docs/48,2026-10-26 原型 panel_v1 1:1):左列 6 个矿区、中间当前矿区 2×5 座矿口节点、右侧当前矿信息卡
 *(守卫头像 / 推荐战力 / 掠夺奖励 / 首通 / 「掠夺」钮)。开战走 startLobbyRaidBattle(stageCode) → 编队确认 → 战斗。
 */
export interface LobbyRaidPanelState {
  loading: boolean;
  error: string;
  stages: RaidStagesVO | null;
  selectedStageCode: string;
  version: number;
}

export interface LobbyRaidPanelHost {
  node: Node;
  currentLobbyRaidState(): LobbyRaidPanelState;
  currentLobbyProfile?(): PlayerLobbyProfileVO;
  closeLobbyRaidPanel(): void;
  reloadLobbyRaidStages(): void;
  selectLobbyRaidStage(stageCode: string): void;
  startLobbyRaidBattle(stageCode: string): void;
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
    size?: Size,
    align?: HorizontalTextAlignment,
  ): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

const STAMINA_ICON_ASSET = 'ui/bag/ai/icon_stamina/spriteFrame';
const LOCK_ICON_ASSET = 'ui/common/ai/ic_lock/spriteFrame';
const STAGES_PER_ZONE = 10;
const GOLD_LINE = rgba(190, 141, 62, 226);
const GOLD_TEXT = rgba(244, 220, 166, 255);
const DIM_TEXT = rgba(150, 140, 120, 235);

export class LobbyRaidPanelRenderer {
  constructor(private readonly host: LobbyRaidPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyRaidState();
    const scale = Math.max(0.68, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(300 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.host.createUiNode('LobbyRaidDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.host.createUiNode('LobbyRaidSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(panelGroup, 'LobbyRaidSceneFrame', 0, 0, panelWidth, panelHeight, rgba(6, 6, 8, 232), GOLD_LINE, 18 * scale);

    const profile = this.host.currentLobbyProfile?.();
    if (profile) {
      renderTopCurrencyBar(this.host, panel, panelWidth / 2, panelHeight / 2, scale, [
        { key: 'stamina', icon: STAMINA_ICON_ASSET, value: `${profile.stamina}/${profile.maxStamina}` },
      ]);
    }
    if (state.loading && !state.stages) {
      mountKitLoading(this.host, panel, 0, 10 * scale, scale, '矿境读取中…');
    } else if (state.error && !state.stages) {
      const hint = this.host.addChildLabel(panel, 'LobbyRaidError', `读取失败:${state.error}`, 0, 20 * scale, 18 * scale, rgba(255, 150, 130, 235), new Size(panelWidth * 0.7, 26 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      this.renderRetryButton(panel, scale);
    } else if (state.stages) {
      const selected = this.resolveSelected(state);
      this.renderZoneList(panel, panelWidth, panelHeight, scale, state.stages, selected);
      this.renderMineNodes(panel, panelWidth, panelHeight, scale, state.stages, selected);
      this.renderInfoCard(panel, panelWidth, panelHeight, scale, state.stages, selected, profile);
    }
    const phoneHelp = isPhoneDesign()
      ? '冲进别人的矿,打倒守卫、砸碎水晶就能把矿晶抢走。\n\n摇杆移动,普攻三连段,三技能带冷却,翻滚有无敌帧。\n\n每座矿胜利扣 6 体力,失败不扣;首通有额外钻石。'
      : '';
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyRaidBackButton', () => this.host.closeLobbyRaidPanel(), scale, '矿境', phoneHelp);
  }

  private resolveSelected(state: LobbyRaidPanelState): RaidStageVO | null {
    const stages = state.stages?.stages ?? [];
    if (stages.length === 0) {
      return null;
    }
    return stages.find((stage) => stage.stageCode === state.selectedStageCode)
      ?? stages.find((stage) => stage.stageCode === state.stages?.nextStageCode)
      ?? stages[0];
  }

  // ── 左列:矿区 ──

  private renderZoneList(parent: Node, width: number, height: number, scale: number, data: RaidStagesVO, selected: RaidStageVO | null): void {
    const zones = this.zonesOf(data);
    const phone = isPhoneDesign();
    const colW = width * 0.19;
    const left = -width / 2 + 16 * scale;
    const top = height / 2 - (phone ? 70 : 84) * scale;
    const bottom = -height / 2 + 16 * scale;
    const gap = 8 * scale;
    const itemH = Math.min(96 * scale, (top - bottom - gap * (zones.length - 1)) / Math.max(1, zones.length));
    zones.forEach((zone, index) => {
      const y = top - itemH / 2 - index * (itemH + gap);
      const active = !!selected && selected.zoneName === zone.name;
      const unlocked = zone.stages.some((stage) => stage.unlocked);
      const node = this.host.addChildPlainNode(parent, `LobbyRaidZone_${index}`, left + colW / 2, y, colW, itemH);
      const g = node.addComponent(Graphics);
      g.fillColor = active ? rgba(44, 32, 18, 240) : rgba(14, 12, 12, 225);
      g.roundRect(-colW / 2, -itemH / 2, colW, itemH, 6 * scale);
      g.fill();
      g.strokeColor = active ? rgba(236, 196, 110, 250) : rgba(120, 96, 56, 180);
      g.lineWidth = Math.max(1, (active ? 2 : 1.2) * scale);
      g.roundRect(-colW / 2, -itemH / 2, colW, itemH, 6 * scale);
      g.stroke();
      const label = this.host.addChildLabel(node, 'Name', zone.name, unlocked ? 0 : -colW * 0.06, 0, (phone ? 26 : 24) * scale, active ? GOLD_TEXT : unlocked ? rgba(220, 206, 176, 240) : DIM_TEXT, new Size(colW * 0.74, 32 * scale));
      label.overflow = Label.Overflow.SHRINK;
      if (active) {
        label.isBold = true;
      }
      if (!unlocked) {
        const lockSize = Math.min(26 * scale, itemH * 0.4);
        this.host.addSprite('Lock', LOCK_ICON_ASSET, colW / 2 - lockSize / 2 - 10 * scale, 0, lockSize, lockSize, node);
      }
      const cleared = zone.stages.filter((stage) => stage.cleared).length;
      const progress = this.host.addChildLabel(node, 'Progress', `${cleared}/${zone.stages.length}`, colW / 2 - 28 * scale, -itemH / 2 + 12 * scale, 12 * scale, rgba(170, 160, 136, 220), new Size(60 * scale, 16 * scale), HorizontalTextAlignment.RIGHT);
      progress.overflow = Label.Overflow.SHRINK;
      node.on(Node.EventType.TOUCH_END, () => {
        const target = zone.stages.find((stage) => stage.unlocked && !stage.cleared) ?? zone.stages.find((stage) => stage.unlocked) ?? zone.stages[0];
        if (target) {
          this.host.selectLobbyRaidStage(target.stageCode);
        }
      }, this);
      this.host.applyImageButtonFeedback(node, 1.02, 0.98);
    });
  }

  private zonesOf(data: RaidStagesVO): Array<{ name: string; stages: RaidStageVO[] }> {
    const zones: Array<{ name: string; stages: RaidStageVO[] }> = [];
    for (const stage of data.stages) {
      let zone = zones.find((entry) => entry.name === stage.zoneName);
      if (!zone) {
        zone = { name: stage.zoneName, stages: [] };
        zones.push(zone);
      }
      zone.stages.push(stage);
    }
    return zones;
  }

  // ── 中间:当前矿区的矿口节点 ──

  private renderMineNodes(parent: Node, width: number, height: number, scale: number, data: RaidStagesVO, selected: RaidStageVO | null): void {
    if (!selected) {
      return;
    }
    const zone = this.zonesOf(data).find((entry) => entry.name === selected.zoneName);
    if (!zone) {
      return;
    }
    const phone = isPhoneDesign();
    const areaLeft = -width / 2 + width * 0.19 + 40 * scale;
    const areaRight = width / 2 - width * 0.235 - 30 * scale;
    const areaTop = height / 2 - (phone ? 76 : 90) * scale;
    const areaBottom = -height / 2 + 30 * scale;
    const cols = Math.ceil(STAGES_PER_ZONE / 2);
    const rows = 2;
    const cellW = (areaRight - areaLeft) / cols;
    const radius = Math.min(cellW * 0.33, (areaTop - areaBottom) * 0.15);
    // 两排矿口居中靠拢(原型 v1:两排间距约 3.6 个半径,不铺满整个高度)
    const rowGap = Math.min((areaTop - areaBottom) / rows, radius * 3.6);
    const midY = (areaTop + areaBottom) / 2;
    const centers: Array<{ x: number; y: number }> = [];
    zone.stages.forEach((stage, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      centers.push({ x: areaLeft + cellW * (col + 0.5), y: midY + rowGap / 2 - rowGap * row + radius * 0.25 });
    });
    // 节点之间的巷道连线(同排相邻)
    const rail = this.host.addChildPlainNode(parent, 'LobbyRaidRails', 0, 0, width, height);
    const rg = rail.addComponent(Graphics);
    rg.strokeColor = rgba(120, 96, 56, 150);
    rg.lineWidth = Math.max(2, 4 * scale);
    centers.forEach((center, index) => {
      if (index % cols !== cols - 1 && index + 1 < centers.length) {
        rg.moveTo(center.x + radius, center.y);
        rg.lineTo(centers[index + 1].x - radius, center.y);
      }
    });
    rg.stroke();
    zone.stages.forEach((stage, index) => {
      const center = centers[index];
      const current = selected.stageCode === stage.stageCode;
      const node = this.host.addChildPlainNode(parent, `LobbyRaidMine_${stage.orderNo}`, center.x, center.y, radius * 2.2, radius * 2.2);
      const g = node.addComponent(Graphics);
      g.fillColor = stage.unlocked ? rgba(26, 22, 18, 240) : rgba(12, 11, 11, 230);
      g.circle(0, 0, radius);
      g.fill();
      g.strokeColor = current ? rgba(240, 200, 110, 255) : stage.unlocked ? rgba(176, 142, 82, 230) : rgba(70, 64, 56, 200);
      g.lineWidth = Math.max(1.5, (current ? 4 : 2) * scale);
      g.circle(0, 0, current ? radius * 1.06 : radius);
      g.stroke();
      // 矿口示意:暗色拱门
      g.fillColor = stage.unlocked ? rgba(60, 44, 26, 255) : rgba(30, 26, 24, 255);
      g.roundRect(-radius * 0.42, -radius * 0.5, radius * 0.84, radius * 0.9, radius * 0.2);
      g.fill();
      g.fillColor = stage.unlocked ? rgba(16, 10, 6, 255) : rgba(10, 9, 9, 255);
      g.roundRect(-radius * 0.3, -radius * 0.5, radius * 0.6, radius * 0.7, radius * 0.14);
      g.fill();
      if (stage.cleared) {
        const badge = this.host.addChildPlainNode(node, 'Cleared', -radius * 0.55, -radius * 0.6, radius * 0.7, radius * 0.7);
        const bg = badge.addComponent(Graphics);
        bg.fillColor = rgba(60, 170, 80, 250);
        bg.circle(0, 0, radius * 0.3);
        bg.fill();
        const check = this.host.addChildLabel(badge, 'Check', '✓', 0, 0, radius * 0.42, rgba(255, 255, 255, 255), new Size(radius * 0.7, radius * 0.6));
        check.isBold = true;
      } else if (!stage.unlocked) {
        const lockSize = radius * 0.5;
        this.host.addSprite('Lock', LOCK_ICON_ASSET, 0, -radius * 0.55, lockSize, lockSize, node);
      }
      const name = this.host.addChildLabel(parent, `LobbyRaidMineName_${stage.orderNo}`, `${(stage.orderNo - 1) % STAGES_PER_ZONE + 1} 号矿`, center.x, center.y - radius - 18 * scale, (phone ? 22 : 18) * scale, current ? GOLD_TEXT : stage.unlocked ? rgba(220, 206, 176, 240) : DIM_TEXT, new Size(cellW, 26 * scale));
      name.overflow = Label.Overflow.SHRINK;
      if (current) {
        name.isBold = true;
      }
      node.on(Node.EventType.TOUCH_END, () => this.host.selectLobbyRaidStage(stage.stageCode), this);
      this.host.applyImageButtonFeedback(node, 1.05, 0.95);
    });
  }

  // ── 右侧:当前矿信息卡 ──

  private renderInfoCard(parent: Node, width: number, height: number, scale: number, data: RaidStagesVO, selected: RaidStageVO | null, profile: PlayerLobbyProfileVO | undefined): void {
    if (!selected) {
      return;
    }
    const phone = isPhoneDesign();
    const cardW = width * 0.235;
    const cardH = height - (phone ? 86 : 100) * scale;
    const cx = width / 2 - 16 * scale - cardW / 2;
    const cy = -height / 2 + 16 * scale + cardH / 2;
    const card = this.host.addChildBeveledPanelNode(parent, 'LobbyRaidInfoCard', cx, cy, cardW, cardH, rgba(14, 12, 12, 236), GOLD_LINE, 12 * scale);
    let y = cardH / 2 - 30 * scale;
    const title = this.host.addChildLabel(card, 'Title', selected.stageName, 0, y, (phone ? 26 : 24) * scale, GOLD_TEXT, new Size(cardW * 0.9, 34 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    y -= 30 * scale;
    this.drawDivider(card, y, cardW, scale);
    // 守卫头像行
    const defenders = selected.defenders.slice(0, 4);
    const avatar = Math.min(cardW / Math.max(3, defenders.length) * 0.62, 78 * scale);
    const rowY = y - 14 * scale - avatar / 2;
    const slotW = cardW * 0.88 / Math.max(1, defenders.length);
    defenders.forEach((defender, index) => {
      const x = -cardW * 0.44 + slotW * (index + 0.5);
      const holder = this.host.addChildPlainNode(card, `Defender_${index}`, x, rowY, avatar, avatar);
      const ring = holder.addComponent(Graphics);
      ring.fillColor = rgba(30, 26, 24, 255);
      ring.circle(0, 0, avatar / 2);
      ring.fill();
      const art = resolveHeroAvatarPath(defender.heroCode);
      const sprite = art ? this.host.addSprite('Art', art, 0, 0, avatar * 0.92, avatar * 0.92, holder) : null;
      if (!sprite) {
        const initial = this.host.addChildLabel(holder, 'Initial', (defender.heroName || defender.heroCode).slice(0, 1), 0, 0, avatar * 0.4, rgba(220, 206, 176, 240), new Size(avatar, avatar * 0.6));
        initial.isBold = true;
      }
      ring.strokeColor = rgba(196, 154, 86, 230);
      ring.lineWidth = Math.max(1.2, 2 * scale);
      ring.circle(0, 0, avatar / 2);
      ring.stroke();
      const name = this.host.addChildLabel(card, `DefenderName_${index}`, defender.heroName || defender.heroCode, x, rowY - avatar / 2 - 12 * scale, (phone ? 17 : 14) * scale, rgba(220, 206, 176, 240), new Size(slotW * 0.98, 20 * scale));
      name.overflow = Label.Overflow.SHRINK;
      const stars = this.host.addChildLabel(card, `DefenderStar_${index}`, '★'.repeat(Math.max(1, Math.min(5, defender.star))), x, rowY - avatar / 2 - 30 * scale, (phone ? 15 : 13) * scale, rgba(255, 220, 110, 250), new Size(slotW, 18 * scale));
      stars.overflow = Label.Overflow.SHRINK;
    });
    y = rowY - avatar / 2 - 48 * scale;
    this.drawDivider(card, y, cardW, scale);
    // 推荐战力 / 当前
    const lineupPower = profile?.lineupPower ?? 0;
    const enough = lineupPower >= selected.recommendedPower;
    y -= 22 * scale;
    const power = this.host.addChildLabel(card, 'Power', `推荐战力 ${selected.recommendedPower.toLocaleString()} / 当前 ${lineupPower.toLocaleString()}`, 0, y, (phone ? 19 : 16) * scale, enough ? rgba(140, 230, 150, 250) : rgba(255, 170, 120, 250), new Size(cardW * 0.92, 24 * scale));
    power.overflow = Label.Overflow.SHRINK;
    y -= 22 * scale;
    this.drawDivider(card, y, cardW, scale);
    // 掠夺奖励
    y -= 24 * scale;
    this.host.addChildLabel(card, 'RewardTitle', '掠夺奖励', -cardW * 0.44, y, (phone ? 19 : 17) * scale, GOLD_TEXT, new Size(cardW * 0.5, 24 * scale), HorizontalTextAlignment.LEFT);
    y -= 38 * scale;
    this.renderRewardRow(card, 'Reward', selected.rewardPreview, y, cardW, scale);
    y -= 36 * scale;
    this.drawDivider(card, y, cardW, scale);
    // 首通
    if (selected.firstClearRewards.length > 0) {
      y -= 26 * scale;
      this.host.addChildLabel(card, 'FirstTitle', selected.cleared ? '首通(已领)' : '首通', -cardW * 0.44, y, (phone ? 19 : 17) * scale, selected.cleared ? DIM_TEXT : GOLD_TEXT, new Size(cardW * 0.4, 24 * scale), HorizontalTextAlignment.LEFT);
      this.renderRewardRow(card, 'First', selected.firstClearRewards, y, cardW, scale, cardW * 0.1);
    }
    // 「掠夺」钮 + 体力说明
    const buttonH = Math.min(64 * scale, cardH * 0.1);
    const buttonW = Math.min(cardW * 0.86, buttonH * (740 / 211));
    const buttonY = -cardH / 2 + 24 * scale + 24 * scale + buttonH / 2;
    const button = this.host.addChildPlainNode(card, 'LobbyRaidStartButton', 0, buttonY, buttonW, buttonH);
    if (!this.host.addSprite('Bg', C1812_BUTTON_PRIMARY_ASSET, 0, 0, buttonW, buttonH, button)) {
      const g = button.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 26, 235);
      g.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 6 * scale);
      g.fill();
    }
    const buttonLabel = this.host.addChildLabel(button, 'Label', selected.unlocked ? '掠夺' : '未解锁', 0, 0, (phone ? 30 : 26) * scale, rgba(255, 240, 205, 255), new Size(buttonW - 16 * scale, 36 * scale));
    buttonLabel.isBold = true;
    buttonLabel.enableOutline = true;
    buttonLabel.outlineColor = rgba(60, 10, 8, 255);
    buttonLabel.outlineWidth = Math.max(1, 2 * scale);
    if (selected.unlocked) {
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidBattle(selected.stageCode), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    } else {
      button.addComponent(UIOpacity).opacity = 120;
    }
    const note = this.host.addChildLabel(card, 'Note', selected.unlocked ? `消耗体力 ${selected.staminaCost}(胜利才扣)` : `先掠夺上一座矿`, 0, -cardH / 2 + 22 * scale, (phone ? 16 : 14) * scale, rgba(190, 178, 150, 220), new Size(cardW * 0.9, 20 * scale));
    note.overflow = Label.Overflow.SHRINK;
    void data;
  }

  private renderRewardRow(card: Node, prefix: string, rewards: PlayerBattleRewardItemVO[], y: number, cardW: number, scale: number, startX = -cardW * 0.44): void {
    const iconSize = 34 * scale;
    let x = startX + iconSize / 2;
    rewards.slice(0, 3).forEach((reward, index) => {
      const asset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      const holder = this.host.addChildPlainNode(card, `${prefix}Icon_${index}`, x, y, iconSize, iconSize);
      if (!asset || !this.host.addSprite('Img', asset, 0, 0, iconSize, iconSize, holder)) {
        const g = holder.addComponent(Graphics);
        g.fillColor = rgba(60, 50, 36, 240);
        g.circle(0, 0, iconSize / 2);
        g.fill();
        this.host.addChildLabel(holder, 'Txt', (reward.resourceName || reward.resourceCode).slice(0, 1), 0, 0, iconSize * 0.45, GOLD_TEXT, new Size(iconSize, iconSize * 0.7));
      }
      const amount = this.host.addChildLabel(card, `${prefix}Amount_${index}`, `×${Math.round(reward.amount)}`, x + iconSize / 2 + 4 * scale, y, 16 * scale, rgba(236, 224, 196, 250), new Size(60 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
      amount.overflow = Label.Overflow.SHRINK;
      x += iconSize + 60 * scale;
    });
  }

  private drawDivider(card: Node, y: number, cardW: number, scale: number): void {
    const line = this.host.addChildPlainNode(card, 'Divider', 0, y, cardW * 0.9, 2);
    const g = line.addComponent(Graphics);
    g.strokeColor = rgba(120, 96, 56, 150);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.moveTo(-cardW * 0.45, 0);
    g.lineTo(cardW * 0.45, 0);
    g.stroke();
  }

  private renderRetryButton(parent: Node, scale: number): void {
    const w = 180 * scale;
    const h = 46 * scale;
    const button = this.host.addChildPlainNode(parent, 'LobbyRaidRetry', 0, -40 * scale, w, h);
    if (!this.host.addSprite('Bg', C1812_BUTTON_PRIMARY_ASSET, 0, 0, w, h, button)) {
      const g = button.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 26, 235);
      g.roundRect(-w / 2, -h / 2, w, h, 6 * scale);
      g.fill();
    }
    this.host.addChildLabel(button, 'Label', '重试', 0, 0, 20 * scale, rgba(255, 240, 205, 255), new Size(w - 16 * scale, 26 * scale));
    button.on(Node.EventType.TOUCH_END, () => this.host.reloadLobbyRaidStages(), this);
    this.host.applyImageButtonFeedback(button, 1.04, 0.96);
  }
}
