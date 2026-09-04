import {
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  tween,
} from 'cc';
import {
  LOBBY_ACTIVITY_ITEMS,
  LOBBY_CHALLENGE_ITEMS,
  LOBBY_NAV_ITEMS,
  LOBBY_SCENE_HOTSPOTS,
} from './LobbyHudConfig';
import {
  lobbyHudEdgeInset as resolveLobbyHudEdgeInset,
  lobbyHudScale as resolveLobbyHudScale,
  resolveLobbyHudModeSize,
  resolveLobbyPlayerInfoLayout as resolveHudPlayerInfoLayout,
  type LobbyHudEdgeAxis,
  type LobbyHudModeSize,
} from './LobbyHudLayout';
import {
  clamp,
  rgba,
  type LobbyActivityIconKey,
  type LobbyHudHost,
  type LobbyNavIconKey,
  type LobbyPlayerInfoLayout,
  type UiLayout,
} from './LobbyHudTypes';
import { gameAudio } from '../../audio/GameAudio';
import { LOBBY_C1812_NAV_ICON_ASSETS } from '../C1812CommonUiAssets';
import { LobbyTopHudRenderer } from './LobbyTopHudRenderer';
import { LobbyIdleStageRenderer } from './LobbyIdleStageRenderer';
import type { PlayerBattleRecentVO } from '../../types/BattleTypes';
import type { LobbyAdventureStageVO } from '../../types/LobbyAdventureTypes';
export type { LobbyHudHost } from './LobbyHudTypes';

type LobbyNextGoalTone = 'loading' | 'error' | 'empty' | 'locked' | 'ready' | 'recent';

const SHOW_LOBBY_WORLD_CHAT = false;
const SHOW_LOBBY_RIGHT_CHALLENGE_RAIL = false;

interface LobbyNextGoalView {
  title: string;
  stageLine: string;
  recentLine: string;
  boundaryLine: string;
  actionLabel: string;
  disabled: boolean;
  tone: LobbyNextGoalTone;
}

/**
 * 大厅 HUD 渲染器。
 *
 * 负责左上玩家信息、顶部资源栏、系统按钮、活动栏、中心建筑热点、右侧挑战和底部导航。
 * 所有点击目前只走本地占位提示，不能在这里直接接入玩法或经济写入。
 */
export class LobbyHudRenderer {
  private readonly topHudRenderer: LobbyTopHudRenderer;
  private readonly idleStageRenderer: LobbyIdleStageRenderer;
  private idleStageRoot: Node | null = null;

  constructor(private readonly host: LobbyHudHost) {
    this.topHudRenderer = new LobbyTopHudRenderer(host);
    this.idleStageRenderer = new LobbyIdleStageRenderer(host);
  }

  render(layout: UiLayout): void {
    // 渲染顺序按参考图层级排列：压暗氛围、顶部信息、侧栏/热点、底部导航。
    this.renderLobbyAtmosphere(layout);
    if (this.isMicroViewport(layout)) {
      this.renderMicroLobbyHud(layout);
      return;
    }
    this.topHudRenderer.render(layout);
    this.renderLobbyActivityRail(layout);
    // 大厅重心改为挂机战斗演出:功能入口已收进底部导航,场景热点不再渲染(方法保留)。
    this.renderIdleStage(layout);
    this.renderLobbyGoalTracker(layout);
    if (SHOW_LOBBY_RIGHT_CHALLENGE_RAIL) {
      this.renderLobbyChallengeRail(layout);
    }
    this.renderLobbyBottomHud(layout);
    this.renderCompactSceneEntrances(layout);
    this.renderCompactGoalTracker(layout);
    this.renderCompactActionEntrances(layout);
  }

  private get node(): Node {
    return this.host.node;
  }

  /** 领取挂机收益动效(2026-09-03 用户):一串金币从领取按钮抛物线飞向顶部金币胶囊,首枚到达时胶囊弹跳;金额滚动由 TopHud 侧接手。 */
  playIdleClaimCoinFx(): void {
    const src = this.findLobbyNode('LobbyIdleClaimButton');
    const dst = this.findLobbyNode('LobbyResourceItem_coin');
    if (!src || !dst) {
      return;
    }
    gameAudio.sfx('coin');
    const layer = this.createUiNode('LobbyCoinFxLayer');
    layer.setPosition(Vec3.ZERO);
    const layerTf = layer.addComponent(UITransform);
    layerTf.setContentSize(new Size(10, 10));
    if (layer.parent) {
      layer.setSiblingIndex(layer.parent.children.length - 1);
    }
    const srcLocal = layerTf.convertToNodeSpaceAR(src.worldPosition.clone());
    const dstLocal = layerTf.convertToNodeSpaceAR(dst.worldPosition.clone());
    const coinCount = 14;
    let arrived = 0;
    for (let i = 0; i < coinCount; i += 1) {
      const size = 26 + Math.random() * 10;
      const sx = srcLocal.x + (Math.random() - 0.5) * 130;
      const sy = srcLocal.y + (Math.random() - 0.5) * 50;
      const coin = this.addChildPlainNode(layer, `LobbyCoinFx_${i}`, sx, sy, size, size);
      if (!this.host.addSprite('Img', 'ui/guard/coin_gold/spriteFrame', 0, 0, size, size, coin)) {
        const g = coin.addComponent(Graphics);
        g.fillColor = rgba(255, 208, 96, 245);
        g.circle(0, 0, size / 2);
        g.fill();
        g.strokeColor = rgba(150, 96, 24, 255);
        g.lineWidth = 2;
        g.circle(0, 0, size / 2 - 1);
        g.stroke();
      }
      coin.active = false;
      const ctrlX = (sx + dstLocal.x) / 2 + (Math.random() - 0.5) * 220;
      const ctrlY = Math.max(sy, dstLocal.y) + 90 + Math.random() * 150;
      const proxy = { t: 0 };
      tween(proxy)
        .delay(0.032 * i)
        .call(() => {
          if (coin.isValid) {
            coin.active = true;
          }
        })
        .to(0.5 + Math.random() * 0.18, { t: 1 }, {
          onUpdate: () => {
            if (!coin.isValid) {
              return;
            }
            const t = proxy.t;
            const inv = 1 - t;
            const x = inv * inv * sx + 2 * inv * t * ctrlX + t * t * dstLocal.x;
            const y = inv * inv * sy + 2 * inv * t * ctrlY + t * t * dstLocal.y;
            coin.setPosition(x, y, 0);
            const shrink = 1 - 0.45 * t;
            coin.setScale(shrink, shrink, 1);
          },
        })
        .call(() => {
          if (coin.isValid) {
            coin.destroy();
          }
          arrived += 1;
          if (arrived === 1 && dst.isValid) {
            tween(dst).to(0.1, { scale: new Vec3(1.16, 1.16, 1) }).to(0.16, { scale: new Vec3(1, 1, 1) }).start();
          }
          if (arrived === coinCount && layer.isValid) {
            layer.destroy();
          }
        })
        .start();
    }
  }

  private findLobbyNode(name: string): Node | null {
    let found: Node | null = null;
    this.node.walk((node) => {
      if (!found && node.name === name) {
        found = node;
      }
    });
    return found;
  }

  private renderIdleStage(layout: UiLayout): void {
    // 大厅数据(资料/阵容/关卡)分批到位会触发多次 HUD render;挂机演出带随机时序动画,旧舞台必须先拆,否则叠层。
    if (this.idleStageRoot && this.idleStageRoot.isValid) {
      this.stopIdleStageTweens(this.idleStageRoot);
      this.idleStageRoot.destroy();
    }
    this.idleStageRoot = null;
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const root = this.createSizedUiNode('LobbyIdleStageRoot', centerX, centerY, layout.stageWidth, layout.stageHeight);
    this.idleStageRoot = root;
    const towerStageCode = this.resolveIdleTowerStageCode();
    this.idleStageRenderer.render(root, layout, towerStageCode, this.resolveIdleTowerFloor(towerStageCode));
  }

  // 真实爬塔层数 = 该关卡在主线全序列里的累计序号(每关=1层),而不是"每章16层"的估算。
  // 各章关卡数不固定(如第一章9关、第二章…),按 adventure 章节里的关卡顺序数到该关即真实层数。
  private resolveIdleTowerFloor(stageCode: string): number {
    const adventure = this.host.currentLobbyAdventureState().adventure;
    if (adventure && stageCode) {
      const stages = adventure.chapters.flatMap((chapter) => chapter.stages);
      const index = stages.findIndex((stage) => stage.stageCode === stageCode);
      if (index >= 0) {
        return index + 1;
      }
    }
    return 0;
  }

  // 挂机层显示"真实已爬到的层数"=已通关最高关(maxCompletedStageCode),不是"下一关"的推荐关。
  // 未通关(新号)则退回推荐关(=第一关,显示第1层)/最后解锁关兜底。
  private resolveIdleTowerStageCode(): string {
    const adventure = this.host.currentLobbyAdventureState().adventure;
    if (adventure) {
      const maxCompleted = adventure.maxCompletedStageCode
        ? this.normalizeMainStageCode(adventure.maxCompletedStageCode)
        : '';
      if (maxCompleted) {
        return maxCompleted;
      }
      const stages = adventure.chapters.flatMap((chapter) => chapter.stages);
      const recommendedCode = this.normalizeMainStageCode(adventure.recommendedStageCode);
      const stage = (recommendedCode ? stages.find((item) => item.stageCode === recommendedCode) : null)
        ?? stages.find((item) => item.recommended)
        ?? [...stages].reverse().find((item) => item.unlocked)
        ?? null;
      if (stage) {
        return stage.stageCode;
      }
    }
    return this.host.currentLobbySelectedStageCode() || 'MAIN_1_1';
  }

  // destroy 不会连带停掉 tween,挂机演出的循环 tween 必须逐节点手动止住,避免残留动作驱动已失效节点。
  private stopIdleStageTweens(node: Node): void {
    Tween.stopAllByTarget(node);
    const opacity = node.getComponent(UIOpacity);
    if (opacity) {
      Tween.stopAllByTarget(opacity);
    }
    for (const child of node.children) {
      this.stopIdleStageTweens(child);
    }
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private createSizedUiNode(name: string, x: number, y: number, width: number, height: number): Node {
    // 顶层 HUD 节点必须进入统一内容根节点，避免挂到 Canvas 后无法随大厅 HUD 重排和清理。
    const node = this.createUiNode(name);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    return node;
  }

  private addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize?: Size,
    horizontalAlign: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
  ): Label {
    return this.host.addChildLabel(parent, name, text, x, y, fontSize, color, contentSize, horizontalAlign);
  }

  private addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
    return this.host.addChildPlainNode(parent, name, x, y, width, height);
  }

  private applyImageButtonFeedback(node: Node, hoverScale = 1.035, pressedScale = 0.975): void {
    this.host.applyImageButtonFeedback(node, hoverScale, pressedScale);
  }

  private applyPointerCursor(node: Node): void {
    this.host.applyPointerCursor(node);
  }

  private setStatus(text: string): void {
    this.host.setStatus(text);
  }

  private isMicroViewport(layout: UiLayout): boolean {
    return layout.viewportWidth < 640 || layout.viewportHeight < 420;
  }

  private hudMode(layout: UiLayout): LobbyHudModeSize {
    return resolveLobbyHudModeSize(layout);
  }

  private viewportUnit(layout: UiLayout): number {
    // 微型 HUD 需要补偿 Cocos 设计舞台被浏览器小窗口缩放后的物理像素差异，但必须封顶，避免 390 宽 Preview 被放大到接近 5 倍后压住画面。
    const widthUnit = layout.stageWidth / Math.max(1, layout.viewportWidth);
    const heightUnit = layout.stageHeight / Math.max(1, layout.viewportHeight);
    return clamp(Math.max(widthUnit, heightUnit), 1, 4);
  }

  private openLobbyPlaceholderDialog(title: string, detail?: string): void {
    this.host.openLobbyPlaceholderDialog(title, detail);
  }

  private openLobbyNoticePanel(): void {
    this.host.openLobbyNoticePanel();
  }

  private openLobbyDailyDungeonPanel(): void {
    this.host.openLobbyDailyDungeonPanel();
  }

  private openLobbyCodexPanel(): void {
    this.host.openLobbyCodexPanel();
  }

  private openLobbyHeroRosterPanel(): void {
    this.host.openLobbyHeroRosterPanel();
  }

  private openLobbyBagPanel(): void {
    this.host.openLobbyBagPanel();
  }

  private openLobbyForgePanel(): void {
    this.host.openLobbyForgePanel();
  }

  private openLobbyAdventurePanel(): void {
    this.host.openLobbyAdventurePanel();
  }

  private openLobbyBattleMapFromDungeonEntry(source: string): void {
    // 副本/挑战入口只进入主线关卡地图；真正 battle start 仍必须经过关卡弹框和战力校验。
    this.openLobbyAdventurePanel();
    this.setStatus(`${source}：已进入关卡地图；战斗胜利后自动提交结算并发放奖励。`);
  }

  private openLobbyGachaScene(): void {
    this.host.openLobbyGachaScene();
  }

  private openPlayerProfileDialog(): void {
    // 玩家资料弹窗只读展示账号与角色概况，不触发玩法或经济写入。
    this.host.openPlayerProfileDialog();
  }

  private showUnopenedFeature(title: string, detail?: string): void {
    // 大厅占位入口统一走根节点弹窗，避免各入口散落不同的临时提示逻辑。
    this.openLobbyPlaceholderDialog(title, detail);
  }

  private resolveLobbyPlayerInfoLayout(layout: UiLayout): LobbyPlayerInfoLayout {
    return resolveHudPlayerInfoLayout(layout);
  }

  private renderLobbyAtmosphere(layout: UiLayout): void {
    const group = this.createUiNode('LobbyAtmosphereOverlay');
    group.setPosition(Vec3.ZERO);
    group.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const graphics = group.addComponent(Graphics);
    const left = layout.stageLeft;
    const right = layout.stageRight;
    const top = layout.stageTop;
    const bottom = layout.stageBottom;
    const width = layout.stageWidth;
    const height = layout.stageHeight;

    // 全场轻压暗(2026-09-03 用户:背景稍微暗一点点)——盖在背景之上、HUD/挂机演出之下。
    graphics.fillColor = rgba(0, 0, 0, 30);
    graphics.rect(left, bottom, width, height);
    graphics.fill();
    // 用多层透明矩形模拟参考图的暗角和压边，让 HUD 文字在视频背景上更稳。
    for (let index = 0; index < 5; index += 1) {
      const ratio = index / 5;
      const topHeight = height * (0.055 + ratio * 0.025);
      graphics.fillColor = rgba(0, 0, 0, 58 - index * 9);
      graphics.rect(left, top - topHeight, width, topHeight);
      graphics.fill();

      const bottomHeight = height * (0.075 + ratio * 0.028);
      graphics.fillColor = rgba(0, 0, 0, 70 - index * 10);
      graphics.rect(left, bottom, width, bottomHeight);
      graphics.fill();

      const sideWidth = width * (0.035 + ratio * 0.02);
      graphics.fillColor = rgba(0, 0, 0, 46 - index * 7);
      graphics.rect(left, bottom, sideWidth, height);
      graphics.rect(right - sideWidth, bottom, sideWidth, height);
      graphics.fill();
    }

    const redGlowWidth = width * 0.22;
    const redGlowHeight = height * 0.18;
    graphics.fillColor = rgba(105, 9, 17, 22);
    graphics.rect(layout.stageLeft + width * 0.62, bottom + height * 0.45, redGlowWidth, redGlowHeight);
    graphics.fill();
  }

  private renderMicroLobbyHud(layout: UiLayout): void {
    const unit = this.viewportUnit(layout);
    this.renderMicroPlayerInfo(layout, unit);
    this.renderMicroStamina(layout, unit);
    this.renderMicroGoalChip(layout, unit);
    this.renderMicroActionBar(layout, unit);
  }

  private renderMicroPlayerInfo(layout: UiLayout, unit: number): void {
    const profile = this.host.currentLobbyProfile();
    const margin = 8 * unit;
    const width = Math.min(190 * unit, layout.stageWidth * 0.52);
    const height = 58 * unit;
    const x = layout.stageLeft + margin + width / 2;
    const y = layout.stageTop - margin - height / 2;
    const node = this.createSizedUiNode('LobbyMicroPlayerInfo', x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.openPlayerProfileDialog(), this);
    this.applyImageButtonFeedback(node, 1.01, 0.99);
    const graphics = node.addComponent(Graphics);
    this.drawMicroPanel(graphics, width, height, unit, rgba(2, 3, 5, 190), rgba(183, 134, 64, 170));
    const avatarSize = 42 * unit;
    this.host.addLobbyAvatar(node, -width / 2 + 29 * unit, 0, avatarSize, profile.displayName);
    const textLeft = -width / 2 + 58 * unit;
    const textWidth = width - 66 * unit;
    const level = this.addChildLabel(node, 'LobbyMicroPlayerLevel', `Lv.${profile.playerLevel}`, textLeft, 17 * unit, 11 * unit, rgba(226, 201, 145), new Size(textWidth, 14 * unit), HorizontalTextAlignment.LEFT);
    level.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(level, unit, false);
    const name = this.addChildLabel(node, 'LobbyMicroPlayerName', profile.displayName, textLeft, 2 * unit, 13 * unit, rgba(250, 226, 164), new Size(textWidth, 16 * unit), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(name, unit, true);
    const power = this.addChildLabel(node, 'LobbyMicroPlayerPower', `战力 ${this.host.formatInteger(profile.combatPower)}`, textLeft, -16 * unit, 11 * unit, rgba(224, 190, 112), new Size(textWidth, 14 * unit), HorizontalTextAlignment.LEFT);
    power.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(power, unit, false);
  }

  private renderMicroStamina(layout: UiLayout, unit: number): void {
    const profile = this.host.currentLobbyProfile();
    const margin = 8 * unit;
    const width = Math.min(112 * unit, layout.stageWidth * 0.34);
    const height = 24 * unit;
    const x = layout.stageRight - margin - width / 2;
    const y = layout.stageTop - margin - height / 2;
    const node = this.createSizedUiNode('LobbyMicroStamina', x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.showUnopenedFeature('体力', '当前仅展示体力数值，不开放购买、领取或消耗入口。'), this);
    this.applyImageButtonFeedback(node, 1.015, 0.985);
    const graphics = node.addComponent(Graphics);
    this.drawMicroPanel(graphics, width, height, unit, rgba(2, 3, 5, 184), rgba(99, 190, 218, 150));
    this.addMicroStaminaGlyph(node, -width / 2 + 14 * unit, 0, 16 * unit, unit);
    const label = this.addChildLabel(
      node,
      'LobbyMicroStaminaValue',
      `${this.host.formatInteger(profile.stamina)}/${this.host.formatInteger(profile.maxStamina)}`,
      -width / 2 + 30 * unit,
      0,
      11 * unit,
      rgba(245, 222, 168),
      new Size(width - 36 * unit, height),
      HorizontalTextAlignment.LEFT,
    );
    label.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(label, unit, true);
  }

  private renderMicroActionBar(layout: UiLayout, unit: number): void {
    const actions = [
      { label: '公告', detail: '', notice: true },
      { label: '爬塔', detail: '', adventure: true },
      { label: '英雄', detail: '', heroRoster: true },
      { label: '背包', detail: '', bag: true },
      { label: '召唤', detail: '', gacha: true },
      { label: '图鉴', detail: '', codex: true },
    ];
    const margin = 8 * unit;
    const width = Math.min(340 * unit, layout.stageWidth - margin * 2);
    const height = 38 * unit;
    const x = (layout.stageLeft + layout.stageRight) / 2;
    const y = layout.stageBottom + margin + height / 2;
    const group = this.createSizedUiNode('LobbyMicroActionBar', x, y, width, height);
    const graphics = group.addComponent(Graphics);
    this.drawMicroPanel(graphics, width, height, unit, rgba(2, 3, 5, 178), rgba(174, 126, 63, 150));
    const itemWidth = width / actions.length;
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      this.addCompactActionEntrance(
        group,
        action.label,
        action.detail,
        Boolean(action.notice),
        -width / 2 + itemWidth * index + itemWidth / 2,
        0,
        itemWidth - 6 * unit,
        height - 8 * unit,
        unit,
        Boolean(action.codex),
        Boolean(action.heroRoster),
        Boolean(action.bag),
        Boolean(action.adventure),
        Boolean(action.gacha),
      );
    }
  }

  private renderMicroGoalChip(layout: UiLayout, unit: number): void {
    if (layout.viewportHeight < 260) {
      return;
    }
    const goal = this.resolveLobbyNextGoalView();
    const margin = 8 * unit;
    const actionHeight = 38 * unit;
    const gap = 8 * unit;
    const width = Math.min(330 * unit, layout.stageWidth - margin * 2);
    const height = 28 * unit;
    const x = (layout.stageLeft + layout.stageRight) / 2;
    const y = layout.stageBottom + margin + actionHeight + gap + height / 2;
    if (y + height / 2 > layout.stageTop - margin - 64 * unit) {
      return;
    }
    const node = this.createSizedUiNode('LobbyMicroGoalChip', x, y, width, height);
    const button = node.addComponent(Button);
    button.interactable = !goal.disabled;
    if (!goal.disabled) {
      node.on(Button.EventType.CLICK, () => this.activateLobbyNextGoal(goal), this);
      this.applyImageButtonFeedback(node, 1.015, 0.985);
    }
    const graphics = node.addComponent(Graphics);
    this.drawLobbyGoalPill(graphics, width, height, unit, goal.tone);
    const text = this.addChildLabel(
      node,
      'LobbyMicroGoalChipText',
      `下一步 · ${goal.actionLabel}`,
      0,
      0,
      11 * unit,
      goal.disabled ? rgba(156, 139, 104) : rgba(246, 218, 150),
      new Size(width - 18 * unit, height),
    );
    text.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(text, unit, true);
  }

  private renderLobbyGoalTracker(layout: UiLayout): void {
    if (layout.stageWidth < 1180 || layout.stageHeight < 620) {
      return;
    }
    const scale = this.lobbyHudScale(layout);
    const hudInsetX = this.lobbyHudEdgeInset(layout, 'x', scale);
    // 2026-09-03 二调:面板缩小(430→360 档),logo 收进面板内部右上角。
    const width = Math.min(360 * scale, Math.max(300 * scale, layout.stageWidth * 0.21));
    const height = width * (400 / 595);
    const x = layout.stageRight - hudInsetX - width / 2 - 6 * scale;
    const y = (layout.stageTop + layout.stageBottom) / 2 + height * 0.34;
    const group = this.createSizedUiNode('LobbyGoalTracker', x, y, width, height);
    const goal = this.resolveLobbyNextGoalView();
    if (this.host.addSprite('LobbyGoalTrackerArt', 'ui/lobby/ai/lhud_goal_panel/spriteFrame', 0, 0, width, height, group)) {
      const logoW = width * 0.18;
      const logoH = logoW * (363 / 322);
      this.host.addSprite('LobbyGoalTrackerLogo', 'ui/lobby/ai/lhud_goal_logo/spriteFrame', width / 2 - logoW * 0.78 - width * 0.04, height / 2 - logoH * 0.62 - height * 0.04, logoW, logoH, group);
      this.addLobbyGoalTrackerContent(group, goal, width, height, scale);
      return;
    }
    const graphics = group.addComponent(Graphics);
    this.drawLobbyGoalTrackerPanel(graphics, width, height, scale, goal.tone);
    this.addLobbyGoalTrackerContent(group, goal, width, height, scale);
  }

  private renderCompactGoalTracker(layout: UiLayout): void {
    if (layout.stageWidth >= 1180 && layout.stageHeight >= 620) {
      return;
    }
    if (layout.viewportWidth < 640 || layout.viewportHeight < 420 || layout.stageHeight < 360) {
      return;
    }
    const scale = this.lobbyHudScale(layout);
    const hudInsetX = this.lobbyHudEdgeInset(layout, 'x', scale);
    const hudInsetY = this.lobbyHudEdgeInset(layout, 'y', scale);
    const mode = this.hudMode(layout);
    const bottomHudVisible = mode.width >= 900 && mode.height >= 500;
    const width = bottomHudVisible
      ? Math.min(330 * scale, Math.max(270 * scale, layout.stageWidth * 0.34))
      : Math.min(300 * scale, Math.max(230 * scale, layout.stageWidth * 0.32));
    const height = bottomHudVisible ? 68 * scale : 48 * scale;
    let x: number;
    let y: number;
    if (bottomHudVisible) {
      const leftRailReserve = mode.width >= 900 && mode.height >= 520 ? Math.min(206 * scale, layout.stageWidth * 0.18) + 18 * scale : 0;
      const minX = layout.stageLeft + hudInsetX + leftRailReserve + width / 2;
      const maxX = layout.stageRight - hudInsetX - width / 2;
      x = minX <= maxX ? clamp(layout.stageLeft + layout.stageWidth * 0.34, minX, maxX) : (layout.stageLeft + layout.stageRight) / 2;
      y = layout.stageBottom + 96 * scale + height / 2 + 10 * scale;
    } else {
      x = layout.stageRight - hudInsetX - width / 2;
      y = layout.stageTop - hudInsetY - 46 * scale - height / 2;
    }
    const group = this.createSizedUiNode('LobbyCompactGoalTracker', x, y, width, height);
    const graphics = group.addComponent(Graphics);
    const goal = this.resolveLobbyNextGoalView();
    this.drawLobbyGoalTrackerPanel(graphics, width, height, scale, goal.tone);
    this.addLobbyCompactGoalContent(group, goal, width, height, scale);
  }

  private addLobbyGoalTrackerContent(parent: Node, goal: LobbyNextGoalView, width: number, height: number, scale: number): void {
    // 2026-09-03 参考图排版:标题小行/大号目标行/两行说明/居中素材红按钮。
    const left = -width / 2;
    const top = height / 2;
    const padX = width * 0.09;
    const title = this.addChildLabel(parent, 'LobbyGoalTrackerTitle', goal.title, left + padX, top - height * 0.16, 17 * scale, rgba(245, 213, 145), new Size(width - padX * 2 - width * 0.2, 24 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(title, scale, true);
    const stage = this.addChildLabel(parent, 'LobbyGoalTrackerStage', goal.stageLine, left + padX, top - height * 0.335, 23 * scale, rgba(248, 226, 169), new Size(width - padX * 2, 30 * scale), HorizontalTextAlignment.LEFT);
    stage.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(stage, scale, true);
    const recent = this.addChildLabel(parent, 'LobbyGoalTrackerRecent', goal.recentLine, left + padX, top - height * 0.475, 15 * scale, rgba(205, 187, 143), new Size(width - padX * 2, 20 * scale), HorizontalTextAlignment.LEFT);
    recent.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(recent, scale, false);
    const boundary = this.addChildLabel(parent, 'LobbyGoalTrackerBoundary', goal.boundaryLine, left + padX, top - height * 0.575, 14 * scale, rgba(151, 126, 82), new Size(width - padX * 2, 18 * scale), HorizontalTextAlignment.LEFT);
    boundary.overflow = Label.Overflow.SHRINK;
    const btnW = width * 0.56;
    const btnH = btnW * (137 / 510);
    this.addLobbyGoalActionButton(parent, goal, 0, -height / 2 + btnH / 2 + height * 0.115, btnW, btnH, scale);
  }

  private addLobbyCompactGoalContent(parent: Node, goal: LobbyNextGoalView, width: number, height: number, scale: number): void {
    const title = this.addChildLabel(parent, 'LobbyCompactGoalTitle', `下一步：${goal.actionLabel}`, -width / 2 + 16 * scale, height / 2 - 18 * scale, 14 * scale, rgba(246, 218, 150), new Size(width - 126 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(title, scale, true);
    const stage = this.addChildLabel(parent, 'LobbyCompactGoalStage', goal.stageLine, -width / 2 + 16 * scale, -height / 2 + 17 * scale, 15 * scale, rgba(204, 186, 141), new Size(width - 126 * scale, 19 * scale), HorizontalTextAlignment.LEFT);
    stage.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(stage, scale, false);
    this.addLobbyGoalActionButton(parent, goal, width / 2 - 52 * scale, 0, 88 * scale, Math.min(32 * scale, height - 12 * scale), scale);
  }

  private addLobbyGoalActionButton(parent: Node, goal: LobbyNextGoalView, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, 'LobbyGoalTrackerButton', x, y, width, height);
    const button = node.addComponent(Button);
    button.interactable = !goal.disabled;
    if (!goal.disabled) {
      node.on(Button.EventType.CLICK, () => this.activateLobbyNextGoal(goal), this);
      this.applyImageButtonFeedback(node, 1.025, 0.975);
    }
    // 2026-09-03 用户素材红按钮(510×137);禁用态压暗;缺图回退六边形绘制。
    if (this.host.addSprite('LobbyGoalTrackerButtonArt', 'ui/lobby/ai/lhud_goal_button/spriteFrame', 0, 0, width, height, node)) {
      if (goal.disabled) {
        const dim = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        dim.opacity = 140;
      }
      const artLabel = this.addChildLabel(node, 'LobbyGoalTrackerButtonLabel', goal.actionLabel, 0, 0, height * 0.42, goal.disabled ? rgba(190, 168, 130) : rgba(252, 226, 168), new Size(width * 0.8, height * 0.7));
      artLabel.overflow = Label.Overflow.SHRINK;
      this.applyLobbyResourceTextStyle(artLabel, scale, true);
      return;
    }
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = goal.disabled ? rgba(24, 20, 16, 142) : rgba(78, 12, 13, 210);
    graphics.moveTo(-width / 2 + 10 * scale, height / 2);
    graphics.lineTo(width / 2 - 10 * scale, height / 2);
    graphics.lineTo(width / 2, 0);
    graphics.lineTo(width / 2 - 10 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 10 * scale, -height / 2);
    graphics.lineTo(-width / 2, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = goal.disabled ? rgba(104, 86, 58, 120) : rgba(222, 174, 83, 202);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.stroke();
    const label = this.addChildLabel(node, 'LobbyGoalTrackerButtonLabel', goal.actionLabel, 0, 0, 16 * scale, goal.disabled ? rgba(153, 137, 104) : rgba(248, 219, 138), new Size(width - 12 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(label, scale, true);
  }

  private resolveLobbyNextGoalView(): LobbyNextGoalView {
    const adventureState = this.host.currentLobbyAdventureState();
    const battleState = this.host.currentLobbyBattleState();
    const adventure = adventureState.adventure;
    const selectedStageCode = this.normalizeMainStageCode(this.host.currentLobbySelectedStageCode());
    const stage = adventure ? this.resolveLobbyGoalStage(adventure.chapters.flatMap((chapter) => chapter.stages), selectedStageCode ?? this.normalizeMainStageCode(adventure.recommendedStageCode)) : null;
    const recent = this.resolveLobbyGoalRecentBattle(battleState.recentBattles, stage?.stageCode ?? null);
    if (adventureState.loading && !adventure) {
      return {
        title: '同步主线目标',
        stageLine: '主线状态读取中',
        recentLine: '正在回读最近无奖励战斗记录',
        boundaryLine: '仅读取大厅状态，不写入资源。',
        actionLabel: '加载中',
        disabled: true,
        tone: 'loading',
      };
    }
    if (adventureState.error && !adventure) {
      return {
        title: '主线目标异常',
        stageLine: '爬塔状态暂时不可用',
        recentLine: battleState.recentError ? '最近记录也读取异常' : this.formatRecentBattleLine(recent, false, ''),
        boundaryLine: '可打开爬塔面板重试，不发起战斗。',
        actionLabel: '进入爬塔',
        disabled: false,
        tone: 'error',
      };
    }
    if (!adventure || !stage) {
      return {
        title: '开始主线预演',
        stageLine: '等待服务器推荐主线目标',
        recentLine: this.formatRecentBattleLine(recent, battleState.recentLoading, battleState.recentError),
        boundaryLine: '准备英雄队伍后从爬塔面板选择关卡。',
        actionLabel: '进入爬塔',
        disabled: false,
        tone: 'empty',
      };
    }
    if (!stage.unlocked) {
      return {
        title: '主线目标未解锁',
        stageLine: `${stage.stageName} · ${stage.stageCode}`,
        recentLine: `状态：${stage.statusLabel || '查看解锁条件'}`,
        boundaryLine: '只能查看目标，不绕过锁定进入编队。',
        actionLabel: '查看目标',
        disabled: false,
        tone: 'locked',
      };
    }
    return {
      title: '下一步目标',
      stageLine: `${stage.stageName} · ${stage.stageCode}`,
      recentLine: this.formatRecentBattleLine(recent, battleState.recentLoading, battleState.recentError),
      boundaryLine: '打开深渊爬塔选关；战斗胜利后自动结算发奖并推进主线。',
      actionLabel: recent ? '继续爬塔' : '进入爬塔',
      disabled: false,
      tone: recent ? 'recent' : 'ready',
    };
  }

  private resolveLobbyGoalStage(stages: LobbyAdventureStageVO[], preferredStageCode: string | null): LobbyAdventureStageVO | null {
    if (preferredStageCode) {
      const preferred = stages.find((stage) => stage.stageCode === preferredStageCode);
      if (preferred) {
        return preferred;
      }
    }
    return stages.find((stage) => stage.recommended) ?? stages.find((stage) => stage.unlocked) ?? stages[0] ?? null;
  }

  private resolveLobbyGoalRecentBattle(recentBattles: PlayerBattleRecentVO[], stageCode: string | null): PlayerBattleRecentVO | null {
    if (stageCode) {
      const stageRecent = recentBattles.find((record) => record.stageCode === stageCode);
      if (stageRecent) {
        return stageRecent;
      }
    }
    return recentBattles[0] ?? null;
  }

  private formatRecentBattleLine(recent: PlayerBattleRecentVO | null, loading: boolean, error: string): string {
    if (loading && !recent) {
      return '最近记录同步中';
    }
    if (error && !recent) {
      return '最近记录读取异常，可从爬塔面板重试';
    }
    if (!recent) {
      return '尚无战斗记录，先完成一次主线挑战';
    }
    const readonlyTag = recent.rewardGranted && recent.economyApplied
      ? '首通奖励已结算'
      : !recent.rewardGranted && recent.readonlyEconomy && !recent.economyApplied
        ? '无奖励记录'
        : '记录待核验';
    return `最近 ${recent.stageCode} · ${recent.result} · ${readonlyTag}`;
  }

  private normalizeMainStageCode(value: string | null | undefined): string | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    return /^MAIN_\d+_\d+$/.test(normalized) ? normalized : null;
  }

  private activateLobbyNextGoal(goal: LobbyNextGoalView): void {
    if (goal.disabled) {
      return;
    }
    this.openLobbyAdventurePanel();
    this.setStatus(`${goal.stageLine}：已打开深渊爬塔；战斗胜利后自动提交结算。`);
  }

  private drawLobbyGoalTrackerPanel(graphics: Graphics, width: number, height: number, scale: number, tone: LobbyNextGoalTone): void {
    const bevel = 18 * scale;
    const accent = this.lobbyGoalAccent(tone);
    graphics.fillColor = rgba(0, 0, 0, 118);
    this.traceLobbyGoalFrame(graphics, width + 8 * scale, height + 5 * scale, bevel, -3 * scale);
    graphics.fill();
    graphics.fillColor = rgba(4, 4, 6, 210);
    this.traceLobbyGoalFrame(graphics, width, height, bevel, 0);
    graphics.fill();
    graphics.fillColor = rgba(accent.r, accent.g, accent.b, tone === 'error' ? 52 : 34);
    graphics.rect(-width / 2 + 14 * scale, height / 2 - 36 * scale, width - 28 * scale, 26 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(165, 119, 58, 178);
    graphics.lineWidth = Math.max(1, 1 * scale);
    this.traceLobbyGoalFrame(graphics, width, height, bevel, 0);
    graphics.stroke();
    graphics.strokeColor = rgba(accent.r, accent.g, accent.b, 190);
    graphics.moveTo(-width / 2 + 24 * scale, height / 2 - 35 * scale);
    graphics.lineTo(width / 2 - 24 * scale, height / 2 - 35 * scale);
    graphics.stroke();
  }

  private drawLobbyGoalPill(graphics: Graphics, width: number, height: number, scale: number, tone: LobbyNextGoalTone): void {
    const accent = this.lobbyGoalAccent(tone);
    const bevel = 10 * scale;
    graphics.fillColor = rgba(3, 4, 6, 196);
    this.traceLobbyGoalFrame(graphics, width, height, bevel, 0);
    graphics.fill();
    graphics.strokeColor = rgba(accent.r, accent.g, accent.b, 184);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    this.traceLobbyGoalFrame(graphics, width, height, bevel, 0);
    graphics.stroke();
  }

  private traceLobbyGoalFrame(graphics: Graphics, width: number, height: number, bevel: number, yOffset: number): void {
    graphics.moveTo(-width / 2 + bevel, height / 2 + yOffset);
    graphics.lineTo(width / 2 - bevel, height / 2 + yOffset);
    graphics.lineTo(width / 2, height / 2 - bevel + yOffset);
    graphics.lineTo(width / 2, -height / 2 + bevel + yOffset);
    graphics.lineTo(width / 2 - bevel, -height / 2 + yOffset);
    graphics.lineTo(-width / 2 + bevel, -height / 2 + yOffset);
    graphics.lineTo(-width / 2, -height / 2 + bevel + yOffset);
    graphics.lineTo(-width / 2, height / 2 - bevel + yOffset);
    graphics.close();
  }

  private lobbyGoalAccent(tone: LobbyNextGoalTone): Color {
    if (tone === 'error') {
      return rgba(214, 70, 75);
    }
    if (tone === 'locked') {
      return rgba(126, 111, 86);
    }
    if (tone === 'recent') {
      return rgba(104, 202, 226);
    }
    if (tone === 'loading') {
      return rgba(194, 157, 90);
    }
    return rgba(222, 174, 83);
  }

  private addMicroStaminaGlyph(parent: Node, x: number, y: number, size: number, unit: number): void {
    const node = this.addChildPlainNode(parent, 'LobbyMicroStaminaGlyph', x, y, size, size);
    const graphics = node.addComponent(Graphics);
    const half = size / 2;
    graphics.fillColor = rgba(14, 35, 42, 210);
    graphics.circle(0, 0, half * 0.92);
    graphics.fill();
    graphics.strokeColor = rgba(104, 202, 226, 190);
    graphics.lineWidth = Math.max(1, 0.8 * unit);
    graphics.circle(0, 0, half * 0.88);
    graphics.stroke();
    graphics.fillColor = rgba(116, 219, 240, 230);
    graphics.moveTo(-half * 0.04, half * 0.7);
    graphics.lineTo(half * 0.34, half * 0.06);
    graphics.lineTo(half * 0.08, half * 0.06);
    graphics.lineTo(half * 0.26, -half * 0.7);
    graphics.lineTo(-half * 0.34, -half * 0.02);
    graphics.lineTo(-half * 0.08, -half * 0.02);
    graphics.close();
    graphics.fill();
  }

  private drawMicroPanel(graphics: Graphics, width: number, height: number, unit: number, fill: Color, stroke: Color): void {
    const bevel = Math.min(10 * unit, height * 0.42);
    graphics.fillColor = fill;
    graphics.moveTo(-width / 2 + bevel, height / 2);
    graphics.lineTo(width / 2 - bevel, height / 2);
    graphics.lineTo(width / 2, height / 2 - bevel);
    graphics.lineTo(width / 2, -height / 2 + bevel);
    graphics.lineTo(width / 2 - bevel, -height / 2);
    graphics.lineTo(-width / 2 + bevel, -height / 2);
    graphics.lineTo(-width / 2, -height / 2 + bevel);
    graphics.lineTo(-width / 2, height / 2 - bevel);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = stroke;
    graphics.lineWidth = Math.max(1, 0.9 * unit);
    graphics.stroke();
  }

  private renderLobbyActivityRail(layout: UiLayout): void {
    const mode = this.hudMode(layout);
    if (mode.width < 900 || mode.height < 520) {
      return;
    }
    const playerLayout = this.resolveLobbyPlayerInfoLayout(layout);
    const scale = this.lobbyHudScale(layout);
    const hudInsetX = this.lobbyHudEdgeInset(layout, 'x', scale);
    // 2026-09-03 用户验收:五入口牌匾放大加长(206×68→252×80)。
    const itemWidth = Math.min(252 * scale, layout.stageWidth * 0.2);
    const itemHeight = 80 * scale;
    const gap = 8 * scale;
    const railX = layout.stageLeft + hudInsetX + itemWidth / 2;
    const top = playerLayout.bottom - 26 * scale;
    const bottomLimit = layout.stageBottom + Math.max(96 * scale, layout.stageHeight * 0.11);
    const maxCount = Math.max(0, Math.floor((top - bottomLimit + gap) / (itemHeight + gap)));
    const items = LOBBY_ACTIVITY_ITEMS.slice(0, maxCount);
    if (items.length === 0) {
      return;
    }

    const totalHeight = items.length * itemHeight + Math.max(0, items.length - 1) * gap;
    const group = this.createUiNode('LobbyActivityRail');
    group.setPosition(new Vec3(railX, top - totalHeight / 2, 0));
    group.addComponent(UITransform).setContentSize(new Size(itemWidth, totalHeight));
    let cursorY = totalHeight / 2 - itemHeight / 2;
    for (const item of items) {
      this.addLobbyActivityItem(group, item.icon, item.title, item.subline, item.hot, 0, cursorY, itemWidth, itemHeight, scale);
      cursorY -= itemHeight + gap;
    }
  }

  private renderLobbySceneHotspots(layout: UiLayout): void {
    const mode = this.hudMode(layout);
    if (mode.width < 900 || mode.height < 560) {
      return;
    }
    const scale = this.lobbyHudScale(layout);
    const group = this.createUiNode('LobbySceneHotspots');
    group.setPosition(Vec3.ZERO);
    group.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const hotspots = LOBBY_SCENE_HOTSPOTS;
    const plaqueHeight = 32 * scale;
    for (const hotspot of hotspots) {
      const x = layout.stageLeft + layout.stageWidth * hotspot.x;
      const y = layout.stageBottom + layout.stageHeight * hotspot.y;
      const hitX = layout.stageLeft + layout.stageWidth * hotspot.hitX;
      const hitY = layout.stageBottom + layout.stageHeight * hotspot.hitY;
      this.addLobbyHotspotHitArea(group, hotspot.label, hitX, hitY, layout.stageWidth * hotspot.hitW, layout.stageHeight * hotspot.hitH, scale);
      this.addLobbyHotspotPlaque(group, hotspot.label, x, y, hotspot.width * scale, plaqueHeight, scale, hotspot.hot);
    }
  }

  private renderLobbyChallengeRail(layout: UiLayout): void {
    if (layout.stageWidth < 1000 || layout.stageHeight < 520) {
      return;
    }
    const scale = this.lobbyHudScale(layout);
    const hudInsetX = this.lobbyHudEdgeInset(layout, 'x', scale);
    const cardWidth = Math.min(184 * scale, layout.stageWidth * 0.16);
    const cardHeight = 94 * scale;
    const gap = 8 * scale;
    const items = LOBBY_CHALLENGE_ITEMS;
    const topLimit = layout.stageTop - Math.max(130 * scale, layout.stageHeight * 0.14);
    const bottomLimit = layout.stageBottom + Math.max(98 * scale, layout.stageHeight * 0.12);
    const maxCount = Math.max(0, Math.min(items.length, Math.floor((topLimit - bottomLimit + gap) / (cardHeight + gap))));
    const visible = items.slice(0, maxCount);
    if (visible.length === 0) {
      return;
    }
    const totalHeight = visible.length * cardHeight + Math.max(0, visible.length - 1) * gap;
    const groupX = layout.stageRight - hudInsetX - cardWidth / 2;
    const groupY = topLimit - totalHeight / 2;
    const group = this.createUiNode('LobbyChallengeRail');
    group.setPosition(new Vec3(groupX, groupY, 0));
    group.addComponent(UITransform).setContentSize(new Size(cardWidth, totalHeight));
    const railGraphics = group.addComponent(Graphics);
    this.drawLobbyChallengeRailTrack(railGraphics, cardWidth, totalHeight, scale);

    let cursorY = totalHeight / 2 - cardHeight / 2;
    for (const item of visible) {
      this.addLobbyChallengeCard(group, item.title, item.subline, item.tint, item.hot, 0, cursorY, cardWidth, cardHeight, scale);
      cursorY -= cardHeight + gap;
    }
  }

  private renderLobbyBottomHud(layout: UiLayout): void {
    const mode = this.hudMode(layout);
    if (mode.width < 900 || mode.height < 500) {
      return;
    }
    const scale = this.lobbyHudScale(layout);
    const hudInsetX = this.lobbyHudEdgeInset(layout, 'x', scale);
    const bandHeight = 96 * scale;
    const groupY = layout.stageBottom + bandHeight / 2;
    const group = this.createUiNode('LobbyBottomHud');
    group.setPosition(new Vec3((layout.stageLeft + layout.stageRight) / 2, groupY, 0));
    group.addComponent(UITransform).setContentSize(new Size(layout.stageWidth, bandHeight));
    const graphics = group.addComponent(Graphics);
    this.drawLobbyBottomPlatform(graphics, layout.stageWidth, bandHeight, scale);
    // AI 导航底板(整图拉伸,盖在手绘平台上;缺图时平台兜底)。
    this.host.addSprite('LobbyBottomHudBar', 'ui/lobby/ai/nav_bar_bg/spriteFrame', 0, 12 * scale, layout.stageWidth, bandHeight + 80 * scale, group);

    const compassSize = 86 * scale;
    this.addLobbyCompass(group, -layout.stageWidth / 2 + hudInsetX + compassSize / 2, 4 * scale, compassSize, scale);

    const adventureWidth = Math.min(320 * scale, layout.stageWidth * 0.24);
    const adventureHeight = 84 * scale;
    const adventureX = layout.stageWidth / 2 - hudInsetX - adventureWidth / 2;
    this.addLobbyAdventureButton(group, adventureX, 6 * scale, adventureWidth, adventureHeight, scale);

    const navLeft = -layout.stageWidth / 2 + hudInsetX + compassSize + 30 * scale;
    const navRight = adventureX - adventureWidth / 2 - 28 * scale;
    const navWidth = navRight - navLeft;
    if (navWidth > 360 * scale) {
      this.addLobbyBottomNav(group, navLeft + navWidth / 2, 0, navWidth, bandHeight, scale);
    }
    if (SHOW_LOBBY_WORLD_CHAT) {
      this.addLobbyChatPreview(group, -layout.stageWidth / 2 + hudInsetX, -bandHeight / 2 + 14 * scale, Math.min(520 * scale, navWidth), scale);
    }
  }

  private drawLobbyBottomPlatform(graphics: Graphics, width: number, height: number, scale: number): void {
    // 底部横梁拆成上沿、主承托和底部厚度三层，更接近参考图的黑金平台质感。
    this.drawLobbyBottomPlatformStep(graphics, width, height, height / 2 - 15 * scale, 18 * scale, rgba(26, 18, 13, 132), rgba(185, 135, 65, 116), scale);
    this.drawLobbyBottomPlatformStep(graphics, width, height, 0, height - 24 * scale, rgba(2, 3, 5, 186), rgba(84, 56, 31, 98), scale);
    this.drawLobbyBottomPlatformStep(graphics, width, height, -height / 2 + 14 * scale, 30 * scale, rgba(0, 0, 0, 144), rgba(131, 91, 45, 86), scale);

    graphics.fillColor = rgba(0, 0, 0, 78);
    graphics.rect(-width / 2, -height / 2, 128 * scale, height);
    graphics.rect(width / 2 - 128 * scale, -height / 2, 128 * scale, height);
    graphics.fill();

    graphics.fillColor = rgba(121, 14, 20, 30);
    graphics.rect(width / 2 - 380 * scale, -height / 2 + 8 * scale, 330 * scale, height - 14 * scale);
    graphics.fill();
    graphics.fillColor = rgba(210, 39, 49, 22);
    graphics.rect(-width / 2 + 34 * scale, -height / 2 + 12 * scale, 170 * scale, height - 20 * scale);
    graphics.fill();

    graphics.strokeColor = rgba(176, 130, 67, 122);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    const segmentCount = 7;
    const gap = 22 * scale;
    const segmentWidth = (width - gap * (segmentCount + 1)) / segmentCount;
    for (let index = 0; index < segmentCount; index += 1) {
      const start = -width / 2 + gap + index * (segmentWidth + gap);
      graphics.moveTo(start, height / 2 - 4 * scale);
      graphics.lineTo(start + segmentWidth, height / 2 - 4 * scale);
    }
    graphics.stroke();
  }

  private drawLobbyBottomPlatformStep(graphics: Graphics, width: number, totalHeight: number, centerY: number, height: number, fill: Color, stroke: Color, scale: number): void {
    const bevel = 18 * scale;
    const left = -width / 2;
    const right = width / 2;
    const top = centerY + height / 2;
    const bottom = centerY - height / 2;
    graphics.fillColor = fill;
    graphics.moveTo(left + bevel, top);
    graphics.lineTo(right - bevel, top);
    graphics.lineTo(right, top - Math.min(bevel, height * 0.5));
    graphics.lineTo(right, bottom + Math.min(bevel, height * 0.36));
    graphics.lineTo(right - bevel * 0.72, bottom);
    graphics.lineTo(left + bevel * 0.72, bottom);
    graphics.lineTo(left, bottom + Math.min(bevel, height * 0.36));
    graphics.lineTo(left, top - Math.min(bevel, height * 0.5));
    graphics.close();
    graphics.fill();
    graphics.strokeColor = stroke;
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.stroke();

    graphics.strokeColor = rgba(226, 177, 92, 46);
    graphics.moveTo(left + 42 * scale, Math.min(totalHeight / 2 - 6 * scale, top - 3 * scale));
    graphics.lineTo(right - 42 * scale, Math.min(totalHeight / 2 - 6 * scale, top - 3 * scale));
    graphics.stroke();
  }

  private lobbyHudScale(layout: UiLayout): number {
    return resolveLobbyHudScale(layout);
  }

  private lobbyHudEdgeInset(layout: UiLayout, axis: LobbyHudEdgeAxis, scale: number): number {
    return resolveLobbyHudEdgeInset(layout, axis, scale);
  }

  private applyLobbyResourceTextStyle(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 220 : 185);
    label.outlineWidth = Math.max(1, (strong ? 1.2 : 0.9) * scale);
  }

  private addLobbyActivityItem(
    parent: Node,
    icon: LobbyActivityIconKey,
    title: string,
    subline: string,
    hot: boolean,
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
  ): void {
    const node = this.addChildPlainNode(parent, `LobbyActivityItem_${icon}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => {
      if (icon === 'event') {
        this.openLobbyDailyDungeonPanel();
        return;
      }
      if (icon === 'summon') {
        this.openLobbyGachaScene();
        return;
      }
      this.showUnopenedFeature(title, '活动、召唤和运营入口将在后续阶段接入；当前只保留大厅本地展示。');
    }, this);
    this.applyImageButtonFeedback(node, 1.025, 0.98);
    // 2026-09-03 用户素材:五个入口各有专属牌匾(图标烧在图里,~495×184),文字叠加;缺图回退旗帜绘制。
    const plaqueAsset: Partial<Record<LobbyActivityIconKey, string>> = {
      event: 'ui/lobby/ai/lhud_menu_dungeon/spriteFrame',
      summon: 'ui/lobby/ai/lhud_menu_summon/spriteFrame',
      contract: 'ui/lobby/ai/lhud_menu_covenant/spriteFrame',
      market: 'ui/lobby/ai/lhud_menu_blackmarket/spriteFrame',
      gift: 'ui/lobby/ai/lhud_menu_firstcharge/spriteFrame',
    };
    const plaquePath = plaqueAsset[icon];
    const plaqueW = height * (495 / 184);
    if (plaquePath && this.host.addSprite(`LobbyActivityPlaque_${icon}`, plaquePath, -width / 2 + plaqueW / 2, 0, plaqueW, height, node)) {
      const plaqueTextX = -width / 2 + height * 1.12;
      const plaqueTextW = plaqueW - height * 1.3;
      const plaqueTitle = this.addChildLabel(node, `LobbyActivityTitle_${icon}`, title, plaqueTextX, height * 0.16, 24 * scale, rgba(243, 218, 164), new Size(plaqueTextW, 30 * scale), HorizontalTextAlignment.LEFT);
      plaqueTitle.overflow = Label.Overflow.SHRINK;
      this.applyLobbyResourceTextStyle(plaqueTitle, scale, true);
      const plaqueSub = this.addChildLabel(node, `LobbyActivitySubline_${icon}`, subline, plaqueTextX, -height * 0.2, 18 * scale, rgba(199, 169, 108), new Size(plaqueTextW, 23 * scale), HorizontalTextAlignment.LEFT);
      plaqueSub.overflow = Label.Overflow.SHRINK;
      this.applyLobbyResourceTextStyle(plaqueSub, scale, false);
      this.addLobbyRedDot(node, -width / 2 + plaqueW - 16 * scale, height / 2 - 12 * scale, 6 * scale, hot);
      return;
    }
    const graphics = node.addComponent(Graphics);
    // 活动栏当前是本地预览态，用暗金旗帜表达“入口存在但未开放”，避免倒计时/红点误导。
    graphics.fillColor = rgba(0, 0, 0, 92);
    this.traceLobbyActivityBanner(graphics, width + 8 * scale, height + 5 * scale, scale, -2 * scale);
    graphics.fill();
    graphics.fillColor = rgba(5, 5, 7, 174);
    this.traceLobbyActivityBanner(graphics, width, height, scale, 0);
    graphics.fill();
    graphics.fillColor = hot ? rgba(113, 18, 24, 156) : rgba(97, 72, 38, 108);
    graphics.rect(-width / 2 + 3 * scale, -height / 2 + 8 * scale, 4 * scale, height - 16 * scale);
    graphics.fill();
    graphics.strokeColor = hot ? rgba(174, 45, 47, 166) : rgba(156, 116, 62, 145);
    graphics.lineWidth = Math.max(1, 1.15 * scale);
    this.traceLobbyActivityBanner(graphics, width, height, scale, 0);
    graphics.stroke();
    graphics.strokeColor = rgba(231, 191, 103, 74);
    graphics.moveTo(-width / 2 + 18 * scale, height / 2 - 7 * scale);
    graphics.lineTo(width / 2 - 28 * scale, height / 2 - 7 * scale);
    graphics.moveTo(-width / 2 + 18 * scale, -height / 2 + 7 * scale);
    graphics.lineTo(width / 2 - 26 * scale, -height / 2 + 7 * scale);
    graphics.stroke();

    this.addLobbyActivityIcon(node, icon, -width / 2 + 34 * scale, 0, 45 * scale, scale);
    const titleLabel = this.addChildLabel(node, `LobbyActivityTitle_${icon}`, title, -width / 2 + 66 * scale, 14 * scale, 22 * scale, rgba(243, 218, 164), new Size(width - 118 * scale, 27 * scale), HorizontalTextAlignment.LEFT);
    titleLabel.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(titleLabel, scale, true);
    const subLabel = this.addChildLabel(node, `LobbyActivitySubline_${icon}`, subline, -width / 2 + 66 * scale, -16 * scale, 20 * scale, hot ? rgba(231, 181, 63) : rgba(199, 169, 108), new Size(width - 118 * scale, 25 * scale), HorizontalTextAlignment.LEFT);
    subLabel.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(subLabel, scale, false);
    this.addLobbyStateBadge(node, 'LobbyActivityPreviewBadge', this.lobbyStateBadgeText(subline), width / 2 - 33 * scale, -12 * scale, 46 * scale, 20 * scale, scale);
    this.addLobbyRedDot(node, width / 2 - 26 * scale, height / 2 - 16 * scale, 6 * scale, hot);
  }

  private traceLobbyActivityBanner(graphics: Graphics, width: number, height: number, scale: number, yOffset: number): void {
    graphics.moveTo(-width / 2 + 8 * scale, height / 2 + yOffset);
    graphics.lineTo(width / 2 - 22 * scale, height / 2 + yOffset);
    graphics.lineTo(width / 2 - 6 * scale, yOffset);
    graphics.lineTo(width / 2 - 22 * scale, -height / 2 + yOffset);
    graphics.lineTo(-width / 2 + 8 * scale, -height / 2 + yOffset);
    graphics.lineTo(-width / 2, yOffset);
    graphics.close();
  }

  private addLobbyActivityIcon(parent: Node, key: LobbyActivityIconKey, x: number, y: number, size: number, scale: number): void {
    const node = this.addChildPlainNode(parent, `LobbyActivityIcon_${key}`, x, y, size, size);
    const graphics = node.addComponent(Graphics);
    const half = size / 2;
    graphics.fillColor = rgba(15, 11, 9, 210);
    graphics.circle(0, 0, half * 0.92);
    graphics.fill();
    graphics.strokeColor = rgba(176, 128, 70, 210);
    graphics.lineWidth = Math.max(1, 1.4 * scale);
    graphics.circle(0, 0, half * 0.9);
    graphics.stroke();
    graphics.fillColor = rgba(201, 161, 94, 230);

    if (key === 'summon') {
      graphics.moveTo(0, half * 0.72);
      graphics.lineTo(half * 0.34, -half * 0.18);
      graphics.lineTo(-half * 0.52, half * 0.2);
      graphics.lineTo(half * 0.52, half * 0.2);
      graphics.lineTo(-half * 0.34, -half * 0.18);
      graphics.close();
    } else if (key === 'market') {
      graphics.moveTo(-half * 0.58, 0);
      graphics.lineTo(0, half * 0.58);
      graphics.lineTo(half * 0.58, 0);
      graphics.lineTo(0, -half * 0.58);
      graphics.close();
    } else if (key === 'gift') {
      graphics.rect(-half * 0.5, -half * 0.36, half, half * 0.72);
      graphics.moveTo(-half * 0.5, half * 0.03);
      graphics.lineTo(half * 0.5, half * 0.03);
      graphics.moveTo(0, -half * 0.36);
      graphics.lineTo(0, half * 0.36);
      graphics.stroke();
      return;
    } else if (key === 'contract') {
      graphics.moveTo(0, half * 0.68);
      graphics.lineTo(half * 0.58, half * 0.18);
      graphics.lineTo(half * 0.36, -half * 0.58);
      graphics.lineTo(0, -half * 0.22);
      graphics.lineTo(-half * 0.36, -half * 0.58);
      graphics.lineTo(-half * 0.58, half * 0.18);
      graphics.close();
    } else {
      graphics.moveTo(0, half * 0.7);
      graphics.lineTo(half * 0.22, half * 0.12);
      graphics.lineTo(half * 0.7, 0);
      graphics.lineTo(half * 0.22, -half * 0.12);
      graphics.lineTo(0, -half * 0.7);
      graphics.lineTo(-half * 0.22, -half * 0.12);
      graphics.lineTo(-half * 0.7, 0);
      graphics.lineTo(-half * 0.22, half * 0.12);
      graphics.close();
    }
    graphics.fill();
    graphics.stroke();
  }

  private addLobbyHotspotHitArea(parent: Node, label: string, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, `LobbyHotspotHitArea_${label}`, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(210, 36, 44, 0);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    node.addComponent(Button);
    node.on(Node.EventType.MOUSE_ENTER, () => {
      this.setStatus(`${label} 暂未开放。`);
      this.drawLobbyHotspotHover(node, width, height, scale, true);
    }, this);
    node.on(Node.EventType.MOUSE_LEAVE, () => this.drawLobbyHotspotHover(node, width, height, scale, false), this);
    node.on(Button.EventType.CLICK, () => this.activateLobbyHotspot(parent, label, x, y, scale), this);
    this.applyPointerCursor(node);
  }

  private addLobbyHotspotPlaque(parent: Node, label: string, x: number, y: number, width: number, height: number, scale: number, hot: boolean): void {
    const node = this.addChildPlainNode(parent, `LobbyHotspot_${label}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Node.EventType.MOUSE_ENTER, () => this.setStatus(`${label} 暂未开放。`), this);
    node.on(Button.EventType.CLICK, () => this.activateLobbyHotspot(parent, label, x, y, scale), this);
    this.applyImageButtonFeedback(node, 1.035, 0.97);
    const graphics = node.addComponent(Graphics);
    if (hot) {
      graphics.fillColor = rgba(126, 17, 24, 44);
      this.traceLobbyPlaque(graphics, width + 24 * scale, height + 18 * scale, scale, -3 * scale);
      graphics.fill();
      graphics.fillColor = rgba(218, 164, 70, 28);
      this.traceLobbyPlaque(graphics, width + 14 * scale, height + 10 * scale, scale, -2 * scale);
      graphics.fill();
    }
    graphics.fillColor = rgba(0, 0, 0, 128);
    this.traceLobbyPlaque(graphics, width + 9 * scale, height + 7 * scale, scale, -2 * scale);
    graphics.fill();
    graphics.fillColor = rgba(48, 8, 11, 92);
    this.traceLobbyPlaque(graphics, width + 2 * scale, height + 2 * scale, scale, 0);
    graphics.fill();
    graphics.fillColor = rgba(4, 4, 5, 196);
    this.traceLobbyPlaque(graphics, width, height, scale, 0);
    graphics.fill();
    graphics.strokeColor = rgba(184, 135, 70, 176);
    graphics.lineWidth = Math.max(1, 1 * scale);
    this.traceLobbyPlaque(graphics, width, height, scale, 0);
    graphics.stroke();
    graphics.strokeColor = rgba(247, 210, 118, 92);
    graphics.lineWidth = Math.max(1, 0.8 * scale);
    this.traceLobbyPlaque(graphics, width - 10 * scale, height - 8 * scale, scale, 0);
    graphics.stroke();
    graphics.strokeColor = rgba(235, 200, 124, 88);
    graphics.moveTo(-width / 2 + 18 * scale, height / 2 - 5 * scale);
    graphics.lineTo(width / 2 - 18 * scale, height / 2 - 5 * scale);
    graphics.moveTo(-width / 2 + 18 * scale, -height / 2 + 5 * scale);
    graphics.lineTo(width / 2 - 18 * scale, -height / 2 + 5 * scale);
    graphics.stroke();
    graphics.fillColor = rgba(220, 170, 82, 176);
    graphics.moveTo(-width / 2 + 18 * scale, 0);
    graphics.lineTo(-width / 2 + 25 * scale, 4 * scale);
    graphics.lineTo(-width / 2 + 25 * scale, -4 * scale);
    graphics.close();
    graphics.moveTo(width / 2 - 18 * scale, 0);
    graphics.lineTo(width / 2 - 25 * scale, 4 * scale);
    graphics.lineTo(width / 2 - 25 * scale, -4 * scale);
    graphics.close();
    graphics.fill();
    const text = this.addChildLabel(node, 'LobbyHotspotLabel', label, 0, 1 * scale, 22 * scale, rgba(236, 208, 145), new Size(width - 18 * scale, height));
    text.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(text, scale, true);
    this.addLobbyRedDot(node, width / 2 - 8 * scale, height / 2 - 3 * scale, 5 * scale, hot);
  }

  private traceLobbyPlaque(graphics: Graphics, width: number, height: number, scale: number, yOffset: number): void {
    graphics.moveTo(-width / 2 + 18 * scale, height / 2 + yOffset);
    graphics.lineTo(width / 2 - 18 * scale, height / 2 + yOffset);
    graphics.lineTo(width / 2 - 8 * scale, height / 2 - 7 * scale + yOffset);
    graphics.lineTo(width / 2, 4 * scale + yOffset);
    graphics.lineTo(width / 2 - 7 * scale, yOffset);
    graphics.lineTo(width / 2, -4 * scale + yOffset);
    graphics.lineTo(width / 2 - 8 * scale, -height / 2 + 7 * scale + yOffset);
    graphics.lineTo(width / 2 - 18 * scale, -height / 2 + yOffset);
    graphics.lineTo(-width / 2 + 18 * scale, -height / 2 + yOffset);
    graphics.lineTo(-width / 2 + 8 * scale, -height / 2 + 7 * scale + yOffset);
    graphics.lineTo(-width / 2, -4 * scale + yOffset);
    graphics.lineTo(-width / 2 + 7 * scale, yOffset);
    graphics.lineTo(-width / 2, 4 * scale + yOffset);
    graphics.lineTo(-width / 2 + 8 * scale, height / 2 - 7 * scale + yOffset);
    graphics.close();
  }

  private drawLobbyHotspotHover(node: Node, width: number, height: number, scale: number, visible: boolean): void {
    const old = node.getChildByName('LobbyHotspotHover');
    if (old) {
      old.removeFromParent();
      old.destroy();
    }
    if (!visible) {
      return;
    }
    const hoverSize = Math.min(Math.min(width, height) * 0.68, 92 * scale);
    const hover = this.addChildPlainNode(node, 'LobbyHotspotHover', 0, 0, hoverSize, hoverSize);
    const graphics = hover.addComponent(Graphics);
    graphics.strokeColor = rgba(214, 42, 52, 132);
    graphics.lineWidth = Math.max(1, 1.25 * scale);
    graphics.circle(0, 0, hoverSize * 0.28);
    graphics.moveTo(0, hoverSize * 0.43);
    graphics.lineTo(hoverSize * 0.43, 0);
    graphics.lineTo(0, -hoverSize * 0.43);
    graphics.lineTo(-hoverSize * 0.43, 0);
    graphics.close();
    graphics.stroke();
    graphics.strokeColor = rgba(232, 187, 94, 118);
    graphics.moveTo(-hoverSize * 0.55, 0);
    graphics.lineTo(-hoverSize * 0.36, 0);
    graphics.moveTo(hoverSize * 0.36, 0);
    graphics.lineTo(hoverSize * 0.55, 0);
    graphics.moveTo(0, -hoverSize * 0.55);
    graphics.lineTo(0, -hoverSize * 0.36);
    graphics.moveTo(0, hoverSize * 0.36);
    graphics.lineTo(0, hoverSize * 0.55);
    graphics.stroke();
  }

  private activateLobbyHotspot(parent: Node, label: string, x: number, y: number, scale: number): void {
    if (label === '召唤祭坛') {
      this.openLobbyGachaScene();
      return;
    }
    if (label === '战役') {
      this.openLobbyBattleMapFromDungeonEntry(label);
      this.playLobbyClickEffect(parent, x, y, scale);
      return;
    }
    this.showUnopenedFeature(label, '场景玩法入口暂未开放；当前不会跳转到玩法页面，也不会调用玩法或经济接口。');
    this.playLobbyClickEffect(parent, x, y, scale);
  }

  private playLobbyClickEffect(parent: Node, x: number, y: number, scale: number): void {
    const size = 92 * scale;
    const node = this.addChildPlainNode(parent, 'LobbyClickEffect', x, y, size, size);
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 210;
    const graphics = node.addComponent(Graphics);
    graphics.strokeColor = rgba(229, 44, 55, 220);
    graphics.lineWidth = Math.max(1, 2 * scale);
    graphics.circle(0, 0, size * 0.28);
    graphics.moveTo(0, size * 0.44);
    graphics.lineTo(size * 0.44, 0);
    graphics.lineTo(0, -size * 0.44);
    graphics.lineTo(-size * 0.44, 0);
    graphics.close();
    graphics.stroke();
    graphics.strokeColor = rgba(244, 195, 96, 180);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(-size * 0.58, 0);
    graphics.lineTo(-size * 0.34, 0);
    graphics.moveTo(size * 0.34, 0);
    graphics.lineTo(size * 0.58, 0);
    graphics.moveTo(0, -size * 0.58);
    graphics.lineTo(0, -size * 0.34);
    graphics.moveTo(0, size * 0.34);
    graphics.lineTo(0, size * 0.58);
    graphics.stroke();
    node.setScale(new Vec3(0.76, 0.76, 1));
    tween(node).to(0.22, { scale: new Vec3(1.25, 1.25, 1) }).call(() => {
      if (node.isValid) {
        node.removeFromParent();
        node.destroy();
      }
    }).start();
    tween(opacity).to(0.22, { opacity: 0 }).start();
  }

  private addLobbyChallengeCard(parent: Node, title: string, subline: string, tint: Color, hot: boolean, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, `LobbyChallengeCard_${title}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.openLobbyBattleMapFromDungeonEntry(title), this);
    this.applyImageButtonFeedback(node, 1.025, 0.975);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 112);
    this.traceLobbyChallengeCard(graphics, width + 5 * scale, height + 5 * scale, scale, -2 * scale);
    graphics.fill();
    graphics.fillColor = rgba(5, 5, 7, 202);
    this.traceLobbyChallengeCard(graphics, width, height, scale, 0);
    graphics.fill();
    graphics.fillColor = rgba(tint.r, tint.g, tint.b, 92);
    this.traceLobbyChallengeCard(graphics, width - 10 * scale, height - 10 * scale, scale, 0);
    graphics.fill();
    this.drawLobbyChallengeArt(graphics, width, height, scale);
    graphics.strokeColor = rgba(131, 93, 50, 185);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    this.traceLobbyChallengeCard(graphics, width - 2 * scale, height - 2 * scale, scale, 0);
    graphics.stroke();
    graphics.fillColor = rgba(0, 0, 0, 112);
    graphics.moveTo(-width / 2 + 10 * scale, -height / 2 + 38 * scale);
    graphics.lineTo(width / 2 - 18 * scale, -height / 2 + 38 * scale);
    graphics.lineTo(width / 2 - 10 * scale, -height / 2 + 8 * scale);
    graphics.lineTo(-width / 2 + 8 * scale, -height / 2 + 8 * scale);
    graphics.close();
    graphics.fill();
    const titleLabel = this.addChildLabel(node, 'LobbyChallengeTitle', title, -width / 2 + 14 * scale, -height / 2 + 30 * scale, 22 * scale, rgba(247, 221, 162), new Size(width - 26 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
    titleLabel.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(titleLabel, scale, true);
    const subLabel = this.addChildLabel(node, 'LobbyChallengeSubline', subline, -width / 2 + 14 * scale, -height / 2 + 10 * scale, 20 * scale, rgba(230, 179, 58), new Size(width - 26 * scale, 23 * scale), HorizontalTextAlignment.LEFT);
    subLabel.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(subLabel, scale, false);
    this.addLobbyStateBadge(node, 'LobbyChallengePreviewBadge', this.lobbyStateBadgeText(subline), width / 2 - 40 * scale, height / 2 - 18 * scale, 52 * scale, 21 * scale, scale);
    this.addLobbyRedDot(node, width / 2 - 9 * scale, height / 2 - 9 * scale, 5 * scale, hot);
  }

  private drawLobbyChallengeRailTrack(graphics: Graphics, width: number, height: number, scale: number): void {
    // 右侧挑战栏加一条暗金轨道，让卡片像固定在画面边缘的模块。
    const trackX = width / 2 - 7 * scale;
    graphics.fillColor = rgba(4, 3, 4, 126);
    graphics.rect(trackX, -height / 2 - 6 * scale, 9 * scale, height + 12 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(164, 119, 58, 105);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(trackX + 2 * scale, -height / 2);
    graphics.lineTo(trackX + 2 * scale, height / 2);
    graphics.stroke();
  }

  private traceLobbyChallengeCard(graphics: Graphics, width: number, height: number, scale: number, yOffset: number): void {
    graphics.moveTo(-width / 2 + 8 * scale, height / 2 + yOffset);
    graphics.lineTo(width / 2 - 18 * scale, height / 2 + yOffset);
    graphics.lineTo(width / 2, height / 2 - 18 * scale + yOffset);
    graphics.lineTo(width / 2 - 8 * scale, -height / 2 + yOffset);
    graphics.lineTo(-width / 2 + 14 * scale, -height / 2 + yOffset);
    graphics.lineTo(-width / 2, -height / 2 + 15 * scale + yOffset);
    graphics.lineTo(-width / 2 + 4 * scale, height / 2 - 8 * scale + yOffset);
    graphics.close();
  }

  private lobbyStateBadgeText(subline: string): string {
    if (subline.includes('锁定')) {
      return '锁定';
    }
    if (subline.includes('占位')) {
      return '占位';
    }
    if (subline.includes('未开放') || subline.includes('暂未开放')) {
      return '未开';
    }
    return '预览';
  }

  private addLobbyStateBadge(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, name, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(6, 5, 5, 182);
    graphics.moveTo(-width / 2 + 7 * scale, height / 2);
    graphics.lineTo(width / 2 - 5 * scale, height / 2);
    graphics.lineTo(width / 2, 0);
    graphics.lineTo(width / 2 - 5 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 7 * scale, -height / 2);
    graphics.lineTo(-width / 2, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(162, 119, 58, 148);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.stroke();
    const label = this.addChildLabel(node, `${name}Label`, text, 0, 0, 16 * scale, rgba(219, 184, 116), new Size(width - 8 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(label, scale, false);
  }

  private drawLobbyChallengeArt(graphics: Graphics, width: number, height: number, scale: number): void {
    graphics.fillColor = rgba(0, 0, 0, 72);
    graphics.moveTo(-width / 2 + 8 * scale, height / 2 - 8 * scale);
    graphics.lineTo(width / 2 - 8 * scale, height / 2 - 8 * scale);
    graphics.lineTo(width / 2 - 44 * scale, -height / 2 + 40 * scale);
    graphics.lineTo(-width / 2 + 24 * scale, -height / 2 + 40 * scale);
    graphics.close();
    graphics.fill();
    graphics.fillColor = rgba(0, 0, 0, 74);
    graphics.moveTo(-width / 2 + 18 * scale, height / 2 - 14 * scale);
    graphics.lineTo(width / 2 - 28 * scale, height / 2 - 16 * scale);
    graphics.lineTo(width / 2 - 48 * scale, -height / 2 + 44 * scale);
    graphics.lineTo(-width / 2 + 36 * scale, -height / 2 + 42 * scale);
    graphics.close();
    graphics.fill();

    graphics.strokeColor = rgba(226, 222, 211, 76);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    for (let index = 0; index < 5; index += 1) {
      const x = -width / 2 + (34 + index * 27) * scale;
      graphics.moveTo(x, height / 2 - 10 * scale);
      graphics.lineTo(x + 18 * scale, 4 * scale);
      graphics.lineTo(x + 4 * scale, -height / 2 + 39 * scale);
    }
    graphics.stroke();
    graphics.fillColor = rgba(235, 48, 58, 34);
    graphics.circle(width / 2 - 42 * scale, height / 2 - 34 * scale, 28 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(236, 195, 113, 72);
    graphics.moveTo(-width / 2 + 10 * scale, height / 2 - 10 * scale);
    graphics.lineTo(width / 2 - 12 * scale, height / 2 - 10 * scale);
    graphics.stroke();
  }

  private addLobbyCompass(parent: Node, x: number, y: number, size: number, scale: number): void {
    const node = this.addChildPlainNode(parent, 'LobbyCompass', x, y, size, size);
    const graphics = node.addComponent(Graphics);
    const half = size / 2;
    graphics.fillColor = rgba(8, 8, 9, 198);
    graphics.circle(0, 0, half * 0.88);
    graphics.fill();
    graphics.strokeColor = rgba(147, 110, 66, 205);
    graphics.lineWidth = Math.max(1, 1.5 * scale);
    graphics.circle(0, 0, half * 0.86);
    graphics.circle(0, 0, half * 0.58);
    graphics.stroke();
    graphics.fillColor = rgba(190, 150, 88, 230);
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const long = index % 2 === 0 ? half * 0.8 : half * 0.58;
      const short = half * 0.16;
      graphics.moveTo(Math.cos(angle) * long, Math.sin(angle) * long);
      graphics.lineTo(Math.cos(angle + 0.18) * short, Math.sin(angle + 0.18) * short);
      graphics.lineTo(Math.cos(angle - 0.18) * short, Math.sin(angle - 0.18) * short);
      graphics.close();
      graphics.fill();
    }
  }

  private addLobbyAdventureButton(parent: Node, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, 'LobbyAdventureButton', x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.openLobbyAdventurePanel(), this);
    this.applyImageButtonFeedback(node, 1.025, 0.97);
    // 2026-09-03 用户素材(741×242,左侧魔王徽记烧在图里):等比铺满按高,文字叠红幅区;缺图回退绘制。
    const artW = height * (741 / 242);
    if (this.host.addSprite('LobbyAdventureArt', 'ui/lobby/ai/lhud_btn_tower/spriteFrame', width / 2 - artW / 2, 0, artW, height, node)) {
      const textLeft = width / 2 - artW + height * 1.06;
      const textW = artW - height * 1.28;
      const artTitle = this.addChildLabel(node, 'LobbyAdventureTitle', '深渊爬塔 »', textLeft + textW / 2, height * 0.16, height * 0.34, rgba(252, 228, 170), new Size(textW, height * 0.42), HorizontalTextAlignment.CENTER);
      artTitle.overflow = Label.Overflow.SHRINK;
      this.applyLobbyResourceTextStyle(artTitle, scale, true);
      const artChapter = this.addChildLabel(node, 'LobbyAdventureChapter', this.resolveAdventureCtaText(), textLeft + textW / 2, -height * 0.2, height * 0.2, rgba(233, 196, 148), new Size(textW, height * 0.3), HorizontalTextAlignment.CENTER);
      artChapter.overflow = Label.Overflow.SHRINK;
      this.applyLobbyResourceTextStyle(artChapter, scale, false);
      return;
    }
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(72, 6, 10, 184);
    graphics.moveTo(-width / 2 + 28 * scale, height / 2);
    graphics.lineTo(width / 2 - 20 * scale, height / 2);
    graphics.lineTo(width / 2, 0);
    graphics.lineTo(width / 2 - 20 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 28 * scale, -height / 2);
    graphics.lineTo(-width / 2, 0);
    graphics.close();
    graphics.fill();
    graphics.fillColor = rgba(5, 4, 5, 92);
    graphics.moveTo(-width / 2 + 38 * scale, height / 2 - 13 * scale);
    graphics.lineTo(width / 2 - 30 * scale, height / 2 - 13 * scale);
    graphics.lineTo(width / 2 - 48 * scale, -height / 2 + 13 * scale);
    graphics.lineTo(-width / 2 + 50 * scale, -height / 2 + 13 * scale);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(163, 35, 40, 210);
    graphics.lineWidth = Math.max(1, 1.5 * scale);
    graphics.stroke();
    graphics.strokeColor = rgba(229, 181, 92, 108);
    graphics.moveTo(-width / 2 + 42 * scale, height / 2 - 9 * scale);
    graphics.lineTo(width / 2 - 42 * scale, height / 2 - 9 * scale);
    graphics.stroke();
    this.addLobbyCompass(node, -width / 2 + 48 * scale, 0, 66 * scale, scale * 0.78);
    const title = this.addChildLabel(node, 'LobbyAdventureTitle', '深渊爬塔', -width / 2 + 104 * scale, 14 * scale, 31 * scale, rgba(249, 220, 166), new Size(width - 130 * scale, 38 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(title, scale, true);
    const chapter = this.addChildLabel(node, 'LobbyAdventureChapter', this.resolveAdventureCtaText(), -width / 2 + 104 * scale, -20 * scale, 20 * scale, rgba(223, 185, 126), new Size(width - 130 * scale, 27 * scale), HorizontalTextAlignment.LEFT);
    chapter.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(chapter, scale, false);
  }

  private resolveAdventureCtaText(): string {
    const state = this.host.currentLobbyAdventureState();
    const adventure = state.adventure;
    if (state.loading && !adventure) {
      return '主线读取中';
    }
    if (!adventure) {
      return '主线 1-1 暗影城门';
    }
    return `主线 ${adventure.recommendedStageName}`;
  }

  private addLobbyBottomNav(parent: Node, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, 'LobbyBottomNav', x, y, width, height);
    const items = LOBBY_NAV_ITEMS;
    const slot = width / items.length;
    const graphics = node.addComponent(Graphics);
    graphics.strokeColor = rgba(172, 130, 74, 92);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    for (let index = 1; index < items.length; index += 1) {
      const splitX = -width / 2 + slot * index;
      graphics.moveTo(splitX, -28 * scale);
      graphics.lineTo(splitX, 32 * scale);
    }
    graphics.stroke();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      this.addLobbyNavItem(node, item.key, item.label, item.hot, -width / 2 + slot * index + slot / 2, 6 * scale, slot, height, scale);
    }
  }

  private renderCompactSceneEntrances(layout: UiLayout): void {
    const mode = this.hudMode(layout);
    if (mode.width >= 900 && mode.height >= 560) {
      return;
    }
    if (layout.stageHeight < 340) {
      return;
    }
    const scale = this.lobbyHudScale(layout);
    const hudInsetX = this.lobbyHudEdgeInset(layout, 'x', scale);
    const hudInsetY = this.lobbyHudEdgeInset(layout, 'y', scale);
    const columns = mode.width >= 720 ? 4 : 2;
    const rows = Math.ceil(LOBBY_SCENE_HOTSPOTS.length / columns);
    const panelWidth = Math.min(layout.stageWidth - hudInsetX * 2, columns * 110 * scale + 22 * scale);
    const itemWidth = panelWidth / columns;
    const itemHeight = 34 * scale;
    const panelHeight = rows * itemHeight + 18 * scale;
    const minY = layout.stageBottom + panelHeight / 2 + 10 * scale;
    const maxY = layout.stageTop - hudInsetY - panelHeight / 2;
    const panelY = Math.max(minY, Math.min(maxY, layout.stageBottom + layout.stageHeight * 0.36));
    const group = this.createUiNode('LobbyCompactSceneEntrances');
    group.setPosition(new Vec3((layout.stageLeft + layout.stageRight) / 2, panelY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    const graphics = group.addComponent(Graphics);
    this.drawCompactScenePanel(graphics, panelWidth, panelHeight, scale);

    for (let index = 0; index < LOBBY_SCENE_HOTSPOTS.length; index += 1) {
      const hotspot = LOBBY_SCENE_HOTSPOTS[index];
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = -panelWidth / 2 + itemWidth * column + itemWidth / 2;
      const y = panelHeight / 2 - 12 * scale - itemHeight / 2 - row * itemHeight;
      this.addCompactSceneEntrance(group, hotspot.label, x, y, itemWidth - 8 * scale, itemHeight - 6 * scale, scale);
    }
  }

  private drawCompactScenePanel(graphics: Graphics, width: number, height: number, scale: number): void {
    // 小屏隐藏建筑铭牌时，用本地入口面板保留 8 个场景入口的可达性。
    graphics.fillColor = rgba(2, 3, 5, 142);
    graphics.moveTo(-width / 2 + 16 * scale, height / 2);
    graphics.lineTo(width / 2 - 16 * scale, height / 2);
    graphics.lineTo(width / 2, height / 2 - 14 * scale);
    graphics.lineTo(width / 2, -height / 2 + 14 * scale);
    graphics.lineTo(width / 2 - 16 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 16 * scale, -height / 2);
    graphics.lineTo(-width / 2, -height / 2 + 14 * scale);
    graphics.lineTo(-width / 2, height / 2 - 14 * scale);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(167, 124, 66, 126);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.stroke();
  }

  private addCompactSceneEntrance(parent: Node, label: string, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, `LobbyCompactSceneEntrance_${label}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.activateLobbyHotspot(parent, label, x, y, scale), this);
    this.applyImageButtonFeedback(node, 1.025, 0.97);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(5, 5, 7, 172);
    graphics.moveTo(-width / 2 + 8 * scale, height / 2);
    graphics.lineTo(width / 2 - 8 * scale, height / 2);
    graphics.lineTo(width / 2, 0);
    graphics.lineTo(width / 2 - 8 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 8 * scale, -height / 2);
    graphics.lineTo(-width / 2, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(145, 109, 62, 142);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.stroke();
    const text = this.addChildLabel(node, 'LobbyCompactSceneEntranceLabel', label, 0, 0, 18 * scale, rgba(226, 198, 137), new Size(width - 12 * scale, height));
    text.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(text, scale, false);
  }

  private renderCompactActionEntrances(layout: UiLayout): void {
    const mode = this.hudMode(layout);
    const sideRailsVisible = mode.width >= 1000 && mode.height >= 520;
    const bottomHudVisible = mode.width >= 900 && mode.height >= 500;
    if (sideRailsVisible && bottomHudVisible) {
      return;
    }
    if (layout.stageHeight < 220) {
      return;
    }
    const scale = this.lobbyHudScale(layout);
    const hudInsetX = this.lobbyHudEdgeInset(layout, 'x', scale);
    const hudInsetY = this.lobbyHudEdgeInset(layout, 'y', scale);
    const entries = this.filterCompactActionEntries(this.compactActionEntries(), layout);
    if (entries.length === 0) {
      return;
    }
    const columns = mode.width >= 720 && entries.length > 2 ? 4 : 2;
    const rows = Math.ceil(entries.length / columns);
    const panelWidth = Math.min(layout.stageWidth - hudInsetX * 2, columns * 116 * scale + 20 * scale);
    const itemWidth = panelWidth / columns;
    const itemHeight = (layout.stageHeight < 300 ? 30 : 32) * scale;
    const panelHeight = rows * itemHeight + 18 * scale;
    const bottomReserved = bottomHudVisible ? 106 * scale : layout.stageHeight < 300 ? 6 * scale : 10 * scale;
    const minY = layout.stageBottom + bottomReserved + panelHeight / 2;
    const maxY = layout.stageTop - hudInsetY - panelHeight / 2;
    if (minY > maxY) {
      return;
    }
    const panelY = minY;
    const group = this.createUiNode('LobbyCompactActionEntrances');
    group.setPosition(new Vec3((layout.stageLeft + layout.stageRight) / 2, panelY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    const graphics = group.addComponent(Graphics);
    this.drawCompactActionPanel(graphics, panelWidth, panelHeight, scale);

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = -panelWidth / 2 + itemWidth * column + itemWidth / 2;
      const y = panelHeight / 2 - 12 * scale - itemHeight / 2 - row * itemHeight;
      this.addCompactActionEntrance(
        group,
        entry.label,
        entry.detail,
        Boolean(entry.notice),
        x,
        y,
        itemWidth - 8 * scale,
        itemHeight - 6 * scale,
        scale,
        Boolean(entry.codex),
        Boolean(entry.heroRoster),
        Boolean(entry.bag),
        Boolean(entry.adventure),
        Boolean(entry.gacha),
      );
    }
  }

  private compactActionEntries(): Array<{ label: string; detail: string; notice?: boolean; codex?: boolean; heroRoster?: boolean; bag?: boolean; adventure?: boolean; gacha?: boolean }> {
    // 小屏隐藏侧栏/底栏时，用本地快捷入口保留大厅模块的可达性。
    return [
      { label: '活动', detail: '活动公告只读展示；当前不进入玩法或改变玩家资源。', notice: true },
      { label: '召唤', detail: '召唤祭坛按后端卡池状态开放真实召唤；当前仅开放 draw，兑换和补发关闭。', gacha: true },
      { label: '挑战', detail: '进入关卡地图后选择关卡；胜利后自动提交结算并发放奖励。', adventure: true },
      { label: '爬塔', detail: '主线章节只读展示；当前不会进入战斗或产生进度写入。', adventure: true },
      { label: '聊天', detail: '聊天系统暂未开放；当前仅展示本地欢迎语，不连接聊天服务，也不会发送消息。' },
      { label: '图鉴', detail: '英雄图鉴只读预览；当前不会进入养成或改变英雄状态。', codex: true },
      { label: '英雄', detail: '英雄队列展示已开放详情页升级；升星、觉醒仍关闭。', heroRoster: true },
      { label: '背包', detail: '背包只读展示道具和来源；当前不会使用、出售或发放任何道具。', bag: true },
      { label: '任务', detail: '任务系统暂未开放；当前不会领取奖励或写入任务进度。' },
      { label: '商店', detail: '商店入口暂未开放；当前不会购买、兑换或消耗资源。' },
    ];
  }

  private filterCompactActionEntries(
    entries: Array<{ label: string; detail: string; notice?: boolean; codex?: boolean; heroRoster?: boolean; bag?: boolean; adventure?: boolean; gacha?: boolean }>,
    layout: UiLayout,
  ): Array<{ label: string; detail: string; notice?: boolean; codex?: boolean; heroRoster?: boolean; bag?: boolean; adventure?: boolean; gacha?: boolean }> {
    const visibleEntries = SHOW_LOBBY_WORLD_CHAT ? entries : entries.filter((_, index) => index !== 4);
    if (layout.stageHeight >= 300) {
      return visibleEntries;
    }
    // 极矮视口下优先保留主流程和只读信息入口，避免完整快捷面板挤压背景与底栏。
    return visibleEntries.filter((entry) => entry.notice || entry.adventure || entry.heroRoster || entry.bag || entry.codex || entry.gacha);
  }

  private drawCompactActionPanel(graphics: Graphics, width: number, height: number, scale: number): void {
    graphics.fillColor = rgba(2, 3, 5, 166);
    graphics.moveTo(-width / 2 + 14 * scale, height / 2);
    graphics.lineTo(width / 2 - 14 * scale, height / 2);
    graphics.lineTo(width / 2, height / 2 - 13 * scale);
    graphics.lineTo(width / 2, -height / 2 + 13 * scale);
    graphics.lineTo(width / 2 - 14 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 14 * scale, -height / 2);
    graphics.lineTo(-width / 2, -height / 2 + 13 * scale);
    graphics.lineTo(-width / 2, height / 2 - 13 * scale);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(174, 126, 63, 138);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.stroke();
    graphics.strokeColor = rgba(226, 177, 92, 48);
    graphics.moveTo(-width / 2 + 24 * scale, height / 2 - 6 * scale);
    graphics.lineTo(width / 2 - 24 * scale, height / 2 - 6 * scale);
    graphics.stroke();
  }

  private addCompactActionEntrance(parent: Node, label: string, detail: string, notice: boolean, x: number, y: number, width: number, height: number, scale: number, codex = false, heroRoster = false, bag = false, adventure = false, gacha = false): void {
    const node = this.addChildPlainNode(parent, `LobbyCompactAction_${label}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => {
      if (notice) {
        this.openLobbyNoticePanel();
        return;
      }
      if (codex) {
        this.openLobbyCodexPanel();
        return;
      }
      if (heroRoster) {
        this.openLobbyHeroRosterPanel();
        return;
      }
      if (bag) {
        this.openLobbyBagPanel();
        return;
      }
      if (adventure) {
        this.openLobbyAdventurePanel();
        return;
      }
      if (gacha) {
        this.openLobbyGachaScene();
        return;
      }
      this.showUnopenedFeature(label, detail);
    }, this);
    this.applyImageButtonFeedback(node, 1.025, 0.97);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(5, 5, 7, 184);
    graphics.moveTo(-width / 2 + 8 * scale, height / 2);
    graphics.lineTo(width / 2 - 8 * scale, height / 2);
    graphics.lineTo(width / 2, 0);
    graphics.lineTo(width / 2 - 8 * scale, -height / 2);
    graphics.lineTo(-width / 2 + 8 * scale, -height / 2);
    graphics.lineTo(-width / 2, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(145, 109, 62, 150);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.stroke();
    const text = this.addChildLabel(node, 'LobbyCompactActionLabel', label, 0, 0, Math.max(11, 15 * scale), rgba(226, 198, 137), new Size(width - 12 * scale, height));
    text.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(text, scale, false);
  }

  private addLobbyNavItem(parent: Node, key: LobbyNavIconKey, label: string, hot: boolean, x: number, y: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, `LobbyNavItem_${key}`, x, y, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => {
      if (key === 'codex') {
        this.openLobbyCodexPanel();
        return;
      }
      if (key === 'hero') {
        this.openLobbyHeroRosterPanel();
        return;
      }
      if (key === 'bag') {
        this.openLobbyBagPanel();
        return;
      }
      if (key === 'forge') {
        // 锻造 = 装备养成工坊:合成/强化/分解。
        this.openLobbyForgePanel();
        return;
      }
      if (key === 'contract') {
        // 圣契 = 召唤:直达召唤(抽卡)场景。
        this.openLobbyGachaScene();
        return;
      }
      this.showUnopenedFeature(label, '底部导航入口暂未开放；当前不会进入养成、商店或其他写入型系统。');
    }, this);
    this.applyImageButtonFeedback(node, 1.04, 0.97);
    // 新导航图标自带徽章造型:去掉旧六边槽,直接放大展示。
    this.addLobbyNavIcon(node, key, 0, 12 * scale, 46 * scale, scale);
    const text = this.addChildLabel(node, `LobbyNavLabel_${key}`, label, 0, -28 * scale, 20 * scale, rgba(214, 190, 138), new Size(width, 26 * scale));
    text.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(text, scale, false);
    this.addLobbyRedDot(node, 22 * scale, 34 * scale, 5 * scale, hot);
  }

  private drawLobbyNavSlot(graphics: Graphics, width: number, height: number, scale: number, hot: boolean): void {
    const slotWidth = Math.min(width - 6 * scale, 72 * scale);
    const baseY = 2 * scale;
    graphics.fillColor = hot ? rgba(43, 8, 10, 112) : rgba(7, 7, 8, 94);
    graphics.moveTo(-slotWidth / 2 + 10 * scale, baseY + 30 * scale);
    graphics.lineTo(slotWidth / 2 - 10 * scale, baseY + 30 * scale);
    graphics.lineTo(slotWidth / 2, baseY + 15 * scale);
    graphics.lineTo(slotWidth / 2 - 10 * scale, baseY - 1 * scale);
    graphics.lineTo(-slotWidth / 2 + 10 * scale, baseY - 1 * scale);
    graphics.lineTo(-slotWidth / 2, baseY + 15 * scale);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = hot ? rgba(181, 55, 50, 138) : rgba(143, 111, 70, 120);
    graphics.lineWidth = Math.max(1, 0.95 * scale);
    graphics.stroke();
    graphics.strokeColor = rgba(219, 178, 98, 46);
    graphics.moveTo(-slotWidth / 2 + 12 * scale, -36 * scale);
    graphics.lineTo(slotWidth / 2 - 12 * scale, -36 * scale);
    graphics.stroke();
  }

  private addLobbyNavIcon(parent: Node, key: LobbyNavIconKey, x: number, y: number, size: number, scale: number): void {
    const asset = LOBBY_C1812_NAV_ICON_ASSETS[key];
    if (asset && this.host.addSprite(`LobbyNavIcon_${key}`, asset, x, y, size, size, parent)) {
      return;
    }
    const node = this.addChildPlainNode(parent, `LobbyNavIcon_${key}`, x, y, size, size);
    const graphics = node.addComponent(Graphics);
    const half = size / 2;
    graphics.strokeColor = rgba(159, 132, 88, 220);
    graphics.fillColor = rgba(153, 123, 79, 190);
    graphics.lineWidth = Math.max(1, 1.3 * scale);
    if (key === 'bag') {
      graphics.rect(-half * 0.5, -half * 0.44, half, half * 0.82);
      graphics.stroke();
      graphics.moveTo(-half * 0.26, half * 0.38);
      graphics.bezierCurveTo(-half * 0.18, half * 0.72, half * 0.18, half * 0.72, half * 0.26, half * 0.38);
      graphics.stroke();
      return;
    }
    if (key === 'codex') {
      graphics.moveTo(-half * 0.62, half * 0.58);
      graphics.lineTo(0, half * 0.34);
      graphics.lineTo(half * 0.62, half * 0.58);
      graphics.lineTo(half * 0.62, -half * 0.52);
      graphics.lineTo(0, -half * 0.32);
      graphics.lineTo(-half * 0.62, -half * 0.52);
      graphics.close();
      graphics.stroke();
      return;
    }
    if (key === 'quest') {
      graphics.moveTo(0, half * 0.68);
      graphics.lineTo(half * 0.52, -half * 0.42);
      graphics.lineTo(0, -half * 0.18);
      graphics.lineTo(-half * 0.52, -half * 0.42);
      graphics.close();
      graphics.stroke();
      return;
    }
    if (key === 'shop') {
      graphics.rect(-half * 0.55, -half * 0.45, half * 1.1, half * 0.68);
      graphics.stroke();
      graphics.moveTo(-half * 0.62, half * 0.22);
      graphics.lineTo(half * 0.62, half * 0.22);
      graphics.stroke();
      return;
    }
    if (key === 'forge') {
      graphics.moveTo(-half * 0.55, -half * 0.42);
      graphics.lineTo(half * 0.5, half * 0.42);
      graphics.moveTo(-half * 0.12, half * 0.52);
      graphics.lineTo(half * 0.58, -half * 0.2);
      graphics.stroke();
      return;
    }
    if (key === 'contract') {
      graphics.moveTo(0, half * 0.68);
      graphics.lineTo(half * 0.56, 0);
      graphics.lineTo(0, -half * 0.68);
      graphics.lineTo(-half * 0.56, 0);
      graphics.close();
      graphics.stroke();
      return;
    }
    graphics.moveTo(0, half * 0.7);
    graphics.lineTo(half * 0.18, half * 0.16);
    graphics.lineTo(half * 0.64, 0);
    graphics.lineTo(half * 0.18, -half * 0.16);
    graphics.lineTo(0, -half * 0.7);
    graphics.lineTo(-half * 0.18, -half * 0.16);
    graphics.lineTo(-half * 0.64, 0);
    graphics.lineTo(-half * 0.18, half * 0.16);
    graphics.close();
    graphics.stroke();
  }

  private addLobbyChatPreview(parent: Node, x: number, y: number, width: number, scale: number): void {
    if (width < 260 * scale) {
      return;
    }
    const node = this.addChildPlainNode(parent, 'LobbyChatPreview', x + width / 2, y, width, 24 * scale);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.showUnopenedFeature('世界聊天', '聊天系统暂未开放；当前仅展示本地欢迎语，不连接聊天服务，也不会发送消息。'), this);
    this.applyPointerCursor(node);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 112);
    graphics.moveTo(-width / 2 + 10 * scale, 12 * scale);
    graphics.lineTo(width / 2 - 10 * scale, 12 * scale);
    graphics.lineTo(width / 2, 0);
    graphics.lineTo(width / 2 - 10 * scale, -12 * scale);
    graphics.lineTo(-width / 2 + 10 * scale, -12 * scale);
    graphics.lineTo(-width / 2, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(139, 104, 63, 82);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.stroke();
    const channel = this.addChildLabel(node, 'LobbyChatChannel', '[世界]', -width / 2 + 39 * scale, 0, 18 * scale, rgba(112, 214, 254), new Size(64 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    channel.overflow = Label.Overflow.SHRINK;
    this.applyLobbyResourceTextStyle(channel, scale, false);
    const text = this.addChildLabel(node, 'LobbyChatText', 'LootChain: 欢迎来到LootChain的世界！', -width / 2 + 102 * scale, 0, 18 * scale, rgba(178, 169, 130), new Size(width - 110 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    text.overflow = Label.Overflow.SHRINK;
  }

  private addLobbyRedDot(parent: Node, x: number, y: number, size: number, visible: boolean): void {
    if (!visible) {
      return;
    }
    const node = this.addChildPlainNode(parent, 'LobbyRedDot', x, y, size * 2, size * 2);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(188, 28, 38, 235);
    graphics.moveTo(0, size);
    graphics.lineTo(size, 0);
    graphics.lineTo(0, -size);
    graphics.lineTo(-size, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(255, 91, 76, 210);
    graphics.lineWidth = Math.max(1, size * 0.18);
    graphics.stroke();
  }

}
