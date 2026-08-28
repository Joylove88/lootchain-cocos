import {
  BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UITransform, Vec3,
} from 'cc';
import type { LobbyAdventureStageVO } from '../../types/LobbyAdventureTypes';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';
import { safeText } from '../UiTextFormatter';
import { rgba } from './LobbyHudTypes';
export interface BattleChallengeDialogHost { node: Node; createUiNode(name: string): Node; addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node; addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node; addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label; addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null; applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void; openFormation(stageCode: string): void; startBattle(stageCode: string): void; closeChallengeDialog(): void; }
const CHALLENGE_BUTTON_PRIMARY_ASSET = 'ui/common/ai/button_primary/spriteFrame';
const CHALLENGE_BUTTON_RETURN_DIS_ASSET = 'ui/common/ai/button_return_dis/spriteFrame';
// C1812 弹窗统一视觉：羊皮纸主框 + 标题横幅(加载失败自动回退原黑底金边框)。
const CHALLENGE_POPUP_PARCHMENT_ASSET = 'ui/common/ai/popup_frame_large/spriteFrame';
const CHALLENGE_TITLE_BANNER_ASSET = 'ui/common/ai/title_banner/spriteFrame';
export class BattleChallengeDialogRenderer {
  constructor(private readonly host: BattleChallengeDialogHost) {}
  render(centerX: number, centerY: number, layoutWidth: number, layoutHeight: number, scale: number, stage: LobbyAdventureStageVO, formation: LobbyHeroItemVO[], canChallenge: boolean): Node {
    const panelWidth = Math.min(720 * scale, layoutWidth - 60 * scale);
    const panelHeight = Math.min(520 * scale, layoutHeight - 60 * scale);
    const dim = this.host.createUiNode('BattleChallengeDialogDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layoutWidth, layoutHeight));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 166);
    dimGraphics.rect(-layoutWidth / 2, -layoutHeight / 2, layoutWidth, layoutHeight);
    dimGraphics.fill();
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, () => this.host.closeChallengeDialog(), this);
    dim.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(dim, 'BattleChallengeDialogPanel', 0, 0, panelWidth, panelHeight, rgba(8, 6, 9, 240), rgba(196, 145, 62, 230), 18 * scale);
    panel.addComponent(BlockInputEvents);
    const title = this.host.addChildLabel(panel, 'BattleChallengeDialogTitle', safeText(stage.stageName), 0, panelHeight / 2 - 36 * scale, 26 * scale, rgba(252, 225, 158), new Size(panelWidth - 80 * scale, 34 * scale));
    title.overflow = Label.Overflow.SHRINK; title.enableOutline = true; title.outlineColor = rgba(0, 0, 0, 226); title.outlineWidth = Math.max(1, 1.4 * scale);
    const closeButton = this.host.addChildPlainNode(panel, 'BattleChallengeDialogCloseButton', panelWidth / 2 - 34 * scale, panelHeight / 2 - 32 * scale, 42 * scale, 42 * scale);
    const closeGraphics = closeButton.addComponent(Graphics);
    closeGraphics.fillColor = rgba(36, 16, 12, 226);
    closeGraphics.circle(0, 0, 18 * scale);
    closeGraphics.fill();
    closeGraphics.strokeColor = rgba(227, 156, 75, 220);
    closeGraphics.stroke();
    closeButton.addComponent(Button);
    closeButton.on(Button.EventType.CLICK, () => this.host.closeChallengeDialog(), this);
    this.host.applyImageButtonFeedback(closeButton, 1.035, 0.94);
    const closeLabel = this.host.addChildLabel(closeButton, 'BattleChallengeDialogCloseLabel', 'X', 0, 1 * scale, 20 * scale, rgba(255, 214, 150), new Size(36 * scale, 34 * scale));
    closeLabel.overflow = Label.Overflow.SHRINK;
    const colWidth = (panelWidth - 60 * scale) / 2; const leftX = -colWidth / 2 - 10 * scale; const rightX = colWidth / 2 + 10 * scale;
    const bodyTop = panelHeight / 2 - 72 * scale; const bodyBottom = -panelHeight / 2 + 90 * scale; const bodyHeight = bodyTop - bodyBottom;
    this.renderEnemySection(panel, leftX, (bodyTop + bodyBottom) / 2, colWidth, bodyHeight, scale, stage);
    this.renderRewardSection(panel, rightX, (bodyTop + bodyBottom) / 2 + bodyHeight * 0.25, colWidth, bodyHeight * 0.5, scale, stage);
    this.renderAllySection(panel, rightX, (bodyTop + bodyBottom) / 2 - bodyHeight * 0.25, colWidth, bodyHeight * 0.5, scale, formation);
    const buttonY = -panelHeight / 2 + 40 * scale;
    const formationBtn = this.renderButton(panel, 'BattleChallengeDialogFormationButton', '布阵', -90 * scale, buttonY, 150 * scale, 42 * scale, scale, true);
    formationBtn.on(Button.EventType.CLICK, () => this.host.openFormation(stage.stageCode), this);
    const challengeLabel = canChallenge ? '挑战' : stage.unlocked ? '加载中' : '未开放';
    const challengeBtn = this.renderButton(panel, 'BattleChallengeDialogChallengeButton', challengeLabel, 90 * scale, buttonY, 150 * scale, 42 * scale, scale, canChallenge);
    if (canChallenge) { challengeBtn.on(Button.EventType.CLICK, () => this.host.startBattle(stage.stageCode), this); }
    return dim;
  }
  private renderEnemySection(parent: Node, x: number, y: number, width: number, height: number, scale: number, stage: LobbyAdventureStageVO): void {
    const section = this.host.addChildPlainNode(parent, 'BattleChallengeDialogEnemySection', x, y, width, height);
    const g = section.addComponent(Graphics); g.fillColor = rgba(20, 8, 8, 180); g.roundRect(-width / 2, -height / 2, width, height, 8 * scale); g.fill(); g.strokeColor = rgba(135, 50, 50, 150); g.stroke();
    const title = this.host.addChildLabel(section, 'BattleChallengeDialogEnemyTitle', '敌方阵容', 0, height / 2 - 20 * scale, 18 * scale, rgba(243, 150, 120), new Size(width - 20 * scale, 24 * scale)); title.overflow = Label.Overflow.SHRINK;
    const enemy = this.host.addChildLabel(section, 'BattleChallengeDialogEnemySummary', safeText(stage.enemySummary), 0, height / 2 - 56 * scale, 17 * scale, rgba(220, 200, 170), new Size(width - 24 * scale, 60 * scale)); enemy.overflow = Label.Overflow.SHRINK;
    // 职业克制提示:按敌方阵容给出针对性配队建议,让每一关都成为一道可解的小谜题。
    const summaryText = safeText(stage.enemySummary);
    const enemyLooksRanged = /法|弓|射|术|巫|远程/.test(summaryText);
    const counterAdvice = enemyLooksRanged
      ? '敌方偏远程 · 推荐上刺客切后排'
      : '敌方偏近战 · 推荐法师/射手输出';
    const advice = this.host.addChildLabel(section, 'BattleChallengeDialogCounterAdvice', counterAdvice, 0, 8 * scale, 17 * scale, rgba(255, 216, 130), new Size(width - 24 * scale, 22 * scale)); advice.overflow = Label.Overflow.SHRINK;
    const counterRule = this.host.addChildLabel(section, 'BattleChallengeDialogCounterRule', '克制:近战 → 刺客 → 远程 → 近战(伤害 +30%)', 0, -14 * scale, 14.5 * scale, rgba(176, 158, 122), new Size(width - 24 * scale, 20 * scale)); counterRule.overflow = Label.Overflow.SHRINK;
    const condTitle = this.host.addChildLabel(section, 'BattleChallengeDialogCondTitle', '通关条件', 0, -height / 2 + 56 * scale, 16 * scale, rgba(221, 173, 85), new Size(width - 20 * scale, 22 * scale)); condTitle.overflow = Label.Overflow.SHRINK;
    const cond = this.host.addChildLabel(section, 'BattleChallengeDialogCondText', '击败全部敌方单位\n推荐战力 ' + stage.recommendedPower.toLocaleString('en-US'), 0, -height / 2 + 22 * scale, 16 * scale, rgba(205, 185, 146), new Size(width - 24 * scale, 40 * scale)); cond.overflow = Label.Overflow.SHRINK;
  }
  private renderRewardSection(parent: Node, x: number, y: number, width: number, height: number, scale: number, stage: LobbyAdventureStageVO): void {
    const section = this.host.addChildPlainNode(parent, 'BattleChallengeDialogRewardSection', x, y, width, height);
    const g = section.addComponent(Graphics); g.fillColor = rgba(14, 12, 8, 180); g.roundRect(-width / 2, -height / 2, width, height, 8 * scale); g.fill(); g.strokeColor = rgba(142, 106, 55, 150); g.stroke();
    const title = this.host.addChildLabel(section, 'BattleChallengeDialogRewardTitle', '奖励预览', 0, height / 2 - 20 * scale, 18 * scale, rgba(238, 204, 138), new Size(width - 20 * scale, 24 * scale)); title.overflow = Label.Overflow.SHRINK;
    const rewards = stage.rewardPreview.length > 0 ? stage.rewardPreview : ['奖励配置预览，胜利结算后发放'];
    const rewardText = rewards.slice(0, 4).map((r) => '· ' + safeText(r)).join('\n') + '\n· 胜利结算后自动发放';
    const reward = this.host.addChildLabel(section, 'BattleChallengeDialogRewardText', rewardText, 0, -4 * scale, 16 * scale, rgba(210, 190, 150), new Size(width - 24 * scale, height - 40 * scale)); reward.overflow = Label.Overflow.SHRINK;
  }
  private renderAllySection(parent: Node, x: number, y: number, width: number, height: number, scale: number, formation: LobbyHeroItemVO[]): void {
    const section = this.host.addChildPlainNode(parent, 'BattleChallengeDialogAllySection', x, y, width, height);
    const g = section.addComponent(Graphics); g.fillColor = rgba(8, 10, 13, 180); g.roundRect(-width / 2, -height / 2, width, height, 8 * scale); g.fill(); g.strokeColor = rgba(142, 106, 55, 150); g.stroke();
    const title = this.host.addChildLabel(section, 'BattleChallengeDialogAllyTitle', '我方阵容', 0, height / 2 - 20 * scale, 18 * scale, rgba(231, 205, 142), new Size(width - 20 * scale, 24 * scale)); title.overflow = Label.Overflow.SHRINK;
    const count = formation.length;
    const heroes = formation.slice(0, 4).map((h) => safeText(h.heroName)).join('、') || '点击布阵选择英雄';
    const ally = this.host.addChildLabel(section, 'BattleChallengeDialogAllyText', '出战 ' + count + '/5：' + heroes, 0, -4 * scale, 16 * scale, rgba(210, 190, 150), new Size(width - 24 * scale, height - 40 * scale)); ally.overflow = Label.Overflow.SHRINK;
  }
  private renderButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, scale: number, enabled: boolean): Node {
    const btn = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const art = this.host.addSprite(name + 'Art', enabled ? CHALLENGE_BUTTON_PRIMARY_ASSET : CHALLENGE_BUTTON_RETURN_DIS_ASSET, 0, 0, width, height, btn);
    if (!art) { const g = btn.addComponent(Graphics); g.fillColor = enabled ? rgba(34, 24, 17, 226) : rgba(24, 21, 18, 184); g.roundRect(-width / 2, -height / 2, width, height, 6 * scale); g.fill(); g.strokeColor = enabled ? rgba(188, 137, 58, 216) : rgba(119, 91, 48, 148); g.stroke(); }
    const button = btn.addComponent(Button); button.interactable = enabled;
    if (enabled) { this.host.applyImageButtonFeedback(btn, 1.025, 0.975); }
    const label = this.host.addChildLabel(btn, name + 'Label', text, 0, 0, 20 * scale, enabled ? rgba(245, 211, 123) : rgba(151, 133, 93), new Size(width, height)); label.overflow = Label.Overflow.SHRINK;
    return btn;
  }
}
