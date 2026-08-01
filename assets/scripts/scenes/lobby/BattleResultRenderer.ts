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
  UIOpacity,
  tween,
} from 'cc';
import { rgba } from './LobbyHudTypes';
import { safeText } from '../UiTextFormatter';

// Stage 13H 胜利结算渲染器：胜利大标题(金光横幅) + 出战英雄头像/状态 + 获得奖励/战斗经验 + 返回/战后统计。

export interface BattleResultHost {
  node: Node;
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  returnToLobby(): void;
  showStats(): void;
}

const VICTORY_BANNER_ASSET = 'ui/battle/ai/banner_victory/spriteFrame';

export interface BattleResultData {
  victory: boolean;
  heroNames: string[];
  rewards: string[];
  expGained: number;
}

export class BattleResultRenderer {
  constructor(private readonly host: BattleResultHost) {}

  render(width: number, height: number, scale: number, data: BattleResultData): void {
    const dim = this.host.createUiNode('BattleResultDim');
    dim.setPosition(new Vec3(width / 2, height / 2, 0));
    dim.addComponent(UITransform).setContentSize(new Size(width, height));
    const dg = dim.addComponent(Graphics);
    dg.fillColor = rgba(0, 0, 0, 180);
    dg.rect(-width / 2, -height / 2, width, height);
    dg.fill();
    dim.addComponent(BlockInputEvents);
    const opacity = dim.addComponent(UIOpacity);
    opacity.opacity = 0;
    tween(opacity).to(0.4, { opacity: 255 }).start();

    // 胜利大标题横幅
    const bannerY = height * 0.28;
    const banner = this.host.addSprite('BattleResultBanner', VICTORY_BANNER_ASSET, 0, bannerY, 420 * scale, 120 * scale, dim);
    const titleText = data.victory ? '战斗胜利' : '战斗失败';
    const titleColor = data.victory ? rgba(255, 220, 120) : rgba(220, 120, 120);
    const title = this.host.addChildLabel(dim, 'BattleResultTitle', titleText, 0, bannerY, 42 * scale, titleColor, new Size(400 * scale, 60 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 240);
    title.outlineWidth = Math.max(1, 2 * scale);
    if (data.victory) {
      // 金光缩放动画
      title.node.setScale(0.5, 0.5, 1);
      tween(title.node).to(0.5, { scale: new Vec3(1.1, 1.1, 1) }).to(0.2, { scale: new Vec3(1, 1, 1) }).start();
    }

    // 出战英雄
    const heroY = height * 0.08;
    const heroTitle = this.host.addChildLabel(dim, 'BattleResultHeroTitle', '出战英雄', 0, heroY + 30 * scale, 18 * scale, rgba(231, 205, 142), new Size(300 * scale, 24 * scale));
    heroTitle.overflow = Label.Overflow.SHRINK;
    const heroText = data.heroNames.slice(0, 5).map((n) => safeText(n)).join('  ');
    const heroLabel = this.host.addChildLabel(dim, 'BattleResultHeroes', heroText, 0, heroY, 17 * scale, rgba(210, 190, 150), new Size(width - 80 * scale, 28 * scale));
    heroLabel.overflow = Label.Overflow.SHRINK;

    // 获得奖励
    const rewardY = -height * 0.08;
    const rewardTitle = this.host.addChildLabel(dim, 'BattleResultRewardTitle', '获得奖励', 0, rewardY + 30 * scale, 18 * scale, rgba(238, 204, 138), new Size(300 * scale, 24 * scale));
    rewardTitle.overflow = Label.Overflow.SHRINK;
    const rewardText = data.rewards.length > 0 ? data.rewards.slice(0, 4).map((r) => '· ' + safeText(r)).join('\n') : '无奖励';
    const rewardLabel = this.host.addChildLabel(dim, 'BattleResultRewards', rewardText, 0, rewardY - 10 * scale, 17 * scale, rgba(220, 200, 160), new Size(width - 80 * scale, 80 * scale));
    rewardLabel.overflow = Label.Overflow.SHRINK;

    // 战斗经验
    const expLabel = this.host.addChildLabel(dim, 'BattleResultExp', '战斗经验 +' + data.expGained, 0, -height * 0.22, 18 * scale, rgba(186, 225, 173), new Size(300 * scale, 24 * scale));
    expLabel.overflow = Label.Overflow.SHRINK;

    // 底部按钮：返回 + 战后统计
    const btnY = -height * 0.38;
    const returnBtn = this.host.addChildPlainNode(dim, 'BattleResultReturnButton', -90 * scale, btnY, 150 * scale, 42 * scale);
    this.styleButton(returnBtn, '返回', scale, true);
    returnBtn.addComponent(Button);
    returnBtn.on(Button.EventType.CLICK, () => this.host.returnToLobby(), this);
    this.host.applyImageButtonFeedback(returnBtn, 1.025, 0.975);

    const statsBtn = this.host.addChildPlainNode(dim, 'BattleResultStatsButton', 90 * scale, btnY, 150 * scale, 42 * scale);
    this.styleButton(statsBtn, '战后统计', scale, true);
    statsBtn.addComponent(Button);
    statsBtn.on(Button.EventType.CLICK, () => this.host.showStats(), this);
    this.host.applyImageButtonFeedback(statsBtn, 1.025, 0.975);
  }

  private styleButton(node: Node, text: string, scale: number, enabled: boolean): void {
    const g = node.addComponent(Graphics);
    g.fillColor = enabled ? rgba(34, 24, 17, 226) : rgba(24, 21, 18, 184);
    g.roundRect(-75 * scale, -21 * scale, 150 * scale, 42 * scale, 6 * scale);
    g.fill();
    g.strokeColor = enabled ? rgba(188, 137, 58, 216) : rgba(119, 91, 48, 148);
    g.stroke();
    const label = this.host.addChildLabel(node, node.name + 'Label', text, 0, 0, 20 * scale, enabled ? rgba(245, 211, 123) : rgba(151, 133, 93), new Size(150 * scale, 42 * scale));
    label.overflow = Label.Overflow.SHRINK;
  }
}
