import {
  BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UITransform, Vec3,
} from 'cc';
import type { LobbyAdventureStageVO } from '../../types/LobbyAdventureTypes';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';
import { safeText } from '../UiTextFormatter';
import { rgba } from './LobbyHudTypes';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { drawPhoneDialogFrame, phoneDialogSizeForStage } from './LobbyPhoneDialogFrame';
import { mountKitButton, mountKitSection } from '../UiKit';
import { resolveC1812HeroResultPortraitPath } from '../C1812CommonUiAssets';
export interface BattleChallengeDialogHost { node: Node; createUiNode(name: string): Node; addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node; addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node; addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label; addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null; applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void; openFormation(stageCode: string): void; startBattle(stageCode: string): void; closeChallengeDialog(): void; }

const CLOSE_ASSET = 'ui/common/ai/button_close/spriteFrame';
const TITLE_DIVIDER_LEFT_ASSET = 'ui/common/ai/title_divider_left/spriteFrame';
const TITLE_DIVIDER_RIGHT_ASSET = 'ui/common/ai/title_divider_right/spriteFrame';
const REWARD_SLOT_ASSET = 'ui/common/ai/bag_slot/spriteFrame';
/** 奖励预览文案 → 图标(按关键词;认不出的只显示文字格)。 */
const REWARD_ICON_RULES: Array<{ match: RegExp; path: string; aspect: number }> = [
  { match: /金币/, path: 'ui/common/ai/ic_gold_medium/spriteFrame', aspect: 153 / 176 },
  { match: /经验书/, path: 'ui/common/ai/ic_exp_book/spriteFrame', aspect: 154 / 193 },
  { match: /强化石/, path: 'ui/common/ai/ic_enhance_gem/spriteFrame', aspect: 196 / 131 },
  { match: /钻/, path: 'ui/common/ai/ic_diamond_gem/spriteFrame', aspect: 95 / 97 },
];
const RARITY_COLORS: Record<string, Color> = {
  UR: rgba(255, 96, 80), SSR: rgba(255, 190, 70), SR: rgba(196, 120, 255), R: rgba(96, 170, 255),
};

/**
 * 关卡挑战确认弹框(敌方阵容 / 奖励 / 我方阵容 / 布阵 / 挑战)。
 * 2026-10-10 全界面美化:原来是黑底平框 + 文字清单 + 字母 X;改为全屏实景框(电脑居中大框)、金饰标题、
 * 区块换四角金饰框,奖励改图标格、我方阵容改头像排,关闭钮与按钮换切图。
 */
export class BattleChallengeDialogRenderer {
  constructor(private readonly host: BattleChallengeDialogHost) {}

  render(centerX: number, centerY: number, layoutWidth: number, layoutHeight: number, scale: number, stage: LobbyAdventureStageVO, formation: LobbyHeroItemVO[], canChallenge: boolean): Node {
    const phone = isPhoneDesign();
    const phoneSize = phoneDialogSizeForStage(layoutWidth, layoutHeight);
    const panelWidth = phone ? phoneSize.width : Math.min(1080 * scale, layoutWidth - 60 * scale);
    const panelHeight = phone ? phoneSize.height : Math.min(640 * scale, layoutHeight - 60 * scale);
    // 区块内字号缩放:手机全屏框按设计高 720 放大,电脑跟 scale
    const ts = phone ? 1.25 : scale;
    const dim = this.host.createUiNode('BattleChallengeDialogDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layoutWidth, layoutHeight));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 180);
    dimGraphics.rect(-layoutWidth / 2, -layoutHeight / 2, layoutWidth, layoutHeight);
    dimGraphics.fill();
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, () => this.host.closeChallengeDialog(), this);
    dim.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(dim, 'BattleChallengeDialogPanel', 0, 0, panelWidth, panelHeight);
    panel.addComponent(BlockInputEvents);
    const headerH = 74 * (phone ? 1 : scale);
    drawPhoneDialogFrame(this.host, panel, panelWidth, panelHeight, headerH);

    // 标题 + 两侧金饰
    const titleY = panelHeight / 2 - 6 - headerH / 2;
    const titleText = safeText(stage.stageName);
    const titleSize = 34 * (phone ? 1 : scale);
    const title = this.host.addChildLabel(panel, 'BattleChallengeDialogTitle', titleText, 0, titleY, titleSize, rgba(252, 225, 158), new Size(panelWidth * 0.5, titleSize + 12));
    title.overflow = Label.Overflow.SHRINK; title.enableOutline = true; title.outlineColor = rgba(0, 0, 0, 226); title.outlineWidth = Math.max(1, 1.6 * ts);
    const dividerW = 150 * ts;
    const dividerInner = Math.min(panelWidth * 0.25, (Array.from(titleText).length * titleSize) / 2 + 22 * ts);
    this.host.addSprite('TitleDividerL', TITLE_DIVIDER_LEFT_ASSET, -dividerInner - dividerW / 2, titleY, dividerW, dividerW * (76 / 390), panel);
    this.host.addSprite('TitleDividerR', TITLE_DIVIDER_RIGHT_ASSET, dividerInner + dividerW / 2, titleY, dividerW, dividerW * (73 / 392), panel);
    // 关闭钮(圆形金边切图)
    const closeSize = 56 * (phone ? 1 : scale);
    const closeButton = this.host.addChildPlainNode(panel, 'BattleChallengeDialogCloseButton', panelWidth / 2 - closeSize / 2 - 22 * ts, titleY, closeSize, closeSize);
    if (!this.host.addSprite('Art', CLOSE_ASSET, 0, 0, closeSize, closeSize * (161 / 155), closeButton)) {
      const closeLabel = this.host.addChildLabel(closeButton, 'BattleChallengeDialogCloseLabel', '×', 0, 0, 30 * ts, rgba(255, 214, 150), new Size(closeSize, closeSize));
      closeLabel.overflow = Label.Overflow.SHRINK;
    }
    closeButton.addComponent(Button);
    closeButton.on(Button.EventType.CLICK, () => this.host.closeChallengeDialog(), this);
    this.host.applyImageButtonFeedback(closeButton, 1.05, 0.94);

    // 正文:左敌方(通高),右上奖励、右下我方
    const padX = 32 * ts;
    const gap = 20 * ts;
    const colWidth = (panelWidth - padX * 2 - gap) / 2;
    const leftX = -gap / 2 - colWidth / 2;
    const rightX = gap / 2 + colWidth / 2;
    const bodyTop = panelHeight / 2 - 6 - headerH - 14 * ts;
    const bodyBottom = -panelHeight / 2 + 96 * ts;
    const bodyHeight = bodyTop - bodyBottom;
    const bodyMid = (bodyTop + bodyBottom) / 2;
    const half = (bodyHeight - gap) / 2;
    this.renderEnemySection(panel, leftX, bodyMid, colWidth, bodyHeight, ts, stage);
    this.renderRewardSection(panel, rightX, bodyTop - half / 2, colWidth, half, ts, stage);
    this.renderAllySection(panel, rightX, bodyBottom + half / 2, colWidth, half, ts, formation);

    const buttonY = -panelHeight / 2 + 50 * ts;
    const buttonW = 230 * ts;
    const buttonH = 62 * ts;
    mountKitButton(this.host, panel, 'BattleChallengeDialogFormationButton', '布阵', -buttonW / 2 - 24 * ts, buttonY, buttonW, buttonH, ts, 'secondary', () => this.host.openFormation(stage.stageCode), 24);
    const challengeLabel = canChallenge ? '挑战' : stage.unlocked ? '加载中' : '未开放';
    mountKitButton(this.host, panel, 'BattleChallengeDialogChallengeButton', challengeLabel, buttonW / 2 + 24 * ts, buttonY, buttonW, buttonH, ts, canChallenge ? 'primary' : 'disabled',
      canChallenge ? () => this.host.startBattle(stage.stageCode) : undefined, 26);
    return dim;
  }

  /** 区块标题:左右小金线 + 居中标题。 */
  private sectionTitle(section: Node, name: string, text: string, width: number, height: number, scale: number, color: Color): void {
    const y = height / 2 - 30 * scale;
    const label = this.host.addChildLabel(section, name, text, 0, y, 22 * scale, color, new Size(width * 0.6, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true; label.outlineColor = rgba(0, 0, 0, 220); label.outlineWidth = Math.max(1, 1.4 * scale);
    const lineW = Math.min(90 * scale, width * 0.18);
    const inner = 60 * scale;
    const line = this.host.addChildPlainNode(section, `${name}Lines`, 0, y, width, 4);
    const g = line.addComponent(Graphics);
    g.strokeColor = rgba(200, 156, 84, 170);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.moveTo(-inner - lineW, 0); g.lineTo(-inner, 0);
    g.moveTo(inner, 0); g.lineTo(inner + lineW, 0);
    g.stroke();
  }

  private renderEnemySection(parent: Node, x: number, y: number, width: number, height: number, scale: number, stage: LobbyAdventureStageVO): void {
    const section = mountKitSection(this.host, parent, 'BattleChallengeDialogEnemySection', x, y, width, height, scale, 0.2);
    this.sectionTitle(section, 'BattleChallengeDialogEnemyTitle', '敌方阵容', width, height, scale, rgba(250, 156, 120));
    const summaryText = safeText(stage.enemySummary);
    const enemy = this.host.addChildLabel(section, 'BattleChallengeDialogEnemySummary', summaryText || '未知敌人', 0, height / 2 - 76 * scale, 20 * scale, rgba(232, 212, 178), new Size(width - 60 * scale, 56 * scale));
    enemy.overflow = Label.Overflow.SHRINK;
    // 职业克制提示:按敌方阵容给出针对性配队建议,让每一关都成为一道可解的小谜题。
    const enemyLooksRanged = /法|弓|射|术|巫|远程/.test(summaryText);
    const counterAdvice = enemyLooksRanged ? '敌方偏远程 · 推荐上刺客切后排' : '敌方偏近战 · 推荐法师/射手输出';
    const tip = this.host.addChildPlainNode(section, 'BattleChallengeDialogCounterBox', 0, 4 * scale, width - 60 * scale, 66 * scale);
    const tg = tip.addComponent(Graphics);
    tg.fillColor = rgba(60, 22, 14, 150);
    tg.roundRect(-(width - 60 * scale) / 2, -33 * scale, width - 60 * scale, 66 * scale, 8 * scale);
    tg.fill();
    const advice = this.host.addChildLabel(tip, 'BattleChallengeDialogCounterAdvice', counterAdvice, 0, 13 * scale, 19 * scale, rgba(255, 216, 130), new Size(width - 80 * scale, 26 * scale)); advice.overflow = Label.Overflow.SHRINK;
    const counterRule = this.host.addChildLabel(tip, 'BattleChallengeDialogCounterRule', '克制:近战 → 刺客 → 远程 → 近战(伤害 +30%)', 0, -15 * scale, 16 * scale, rgba(190, 170, 132), new Size(width - 80 * scale, 22 * scale)); counterRule.overflow = Label.Overflow.SHRINK;
    const condY = -height / 2 + 74 * scale;
    const condTitle = this.host.addChildLabel(section, 'BattleChallengeDialogCondTitle', '通关条件', 0, condY + 24 * scale, 20 * scale, rgba(226, 178, 92), new Size(width - 40 * scale, 26 * scale)); condTitle.overflow = Label.Overflow.SHRINK;
    const cond = this.host.addChildLabel(section, 'BattleChallengeDialogCondText', `击败全部敌方单位 · 推荐战力 ${stage.recommendedPower.toLocaleString('en-US')}`, 0, condY - 8 * scale, 18 * scale, rgba(210, 192, 152), new Size(width - 60 * scale, 26 * scale)); cond.overflow = Label.Overflow.SHRINK;
  }

  private renderRewardSection(parent: Node, x: number, y: number, width: number, height: number, scale: number, stage: LobbyAdventureStageVO): void {
    const section = mountKitSection(this.host, parent, 'BattleChallengeDialogRewardSection', x, y, width, height, scale, 0.2);
    this.sectionTitle(section, 'BattleChallengeDialogRewardTitle', '奖励预览', width, height, scale, rgba(244, 210, 140));
    const rewards = stage.rewardPreview.length > 0 ? stage.rewardPreview.slice(0, 5).map((r) => safeText(r)) : ['金币'];
    const slot = Math.min(84 * scale, (height - 64 * scale) * 0.72, (width - 60 * scale) / rewards.length - 14 * scale);
    const step = slot + 16 * scale;
    const rowY = -12 * scale;
    rewards.forEach((text, index) => {
      const cx = (index - (rewards.length - 1) / 2) * step;
      const cell = this.host.addChildPlainNode(section, `BattleChallengeDialogReward_${index}`, cx, rowY + 10 * scale, slot, slot);
      if (!this.host.addSprite('Slot', REWARD_SLOT_ASSET, 0, 0, slot, slot, cell)) {
        const g = cell.addComponent(Graphics);
        g.fillColor = rgba(20, 16, 14, 220); g.roundRect(-slot / 2, -slot / 2, slot, slot, 6 * scale); g.fill();
        g.strokeColor = rgba(150, 114, 62, 200); g.roundRect(-slot / 2, -slot / 2, slot, slot, 6 * scale); g.stroke();
      }
      const rule = REWARD_ICON_RULES.find((item) => item.match.test(text));
      const iconMax = slot * 0.62;
      if (!rule || !this.host.addSprite('Icon', rule.path, 0, 0, rule.aspect > 1 ? iconMax / rule.aspect : iconMax, rule.aspect > 1 ? iconMax : iconMax * rule.aspect, cell)) {
        const glyph = this.host.addChildLabel(cell, 'Glyph', /经验/.test(text) ? 'EXP' : Array.from(text)[0] ?? '?', 0, 0, 22 * scale, rgba(255, 220, 140), new Size(slot * 0.8, slot * 0.6));
        glyph.overflow = Label.Overflow.SHRINK;
        glyph.enableOutline = true; glyph.outlineColor = rgba(0, 0, 0, 220); glyph.outlineWidth = Math.max(1, 1.4 * scale);
      }
      const name = this.host.addChildLabel(section, `BattleChallengeDialogRewardName_${index}`, text, cx, rowY + 10 * scale - slot / 2 - 16 * scale, 16 * scale, rgba(214, 194, 152), new Size(step - 4 * scale, 22 * scale));
      name.overflow = Label.Overflow.SHRINK;
    });
  }

  private renderAllySection(parent: Node, x: number, y: number, width: number, height: number, scale: number, formation: LobbyHeroItemVO[]): void {
    const section = mountKitSection(this.host, parent, 'BattleChallengeDialogAllySection', x, y, width, height, scale, 0.2);
    this.sectionTitle(section, 'BattleChallengeDialogAllyTitle', `我方阵容  ${formation.length}/5`, width, height, scale, rgba(236, 210, 148));
    if (formation.length === 0) {
      const empty = this.host.addChildLabel(section, 'BattleChallengeDialogAllyText', '点击「布阵」选择出战英雄', 0, -10 * scale, 18 * scale, rgba(190, 172, 136), new Size(width - 60 * scale, 26 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }
    const heroes = formation.slice(0, 5);
    const size = Math.min(78 * scale, (height - 70 * scale) * 0.7, (width - 60 * scale) / heroes.length - 12 * scale);
    const step = size + 14 * scale;
    const rowY = -8 * scale;
    heroes.forEach((hero, index) => {
      const cx = (index - (heroes.length - 1) / 2) * step;
      const cell = this.host.addChildPlainNode(section, `BattleChallengeDialogAlly_${index}`, cx, rowY + 10 * scale, size, size);
      const color = RARITY_COLORS[(hero.rarity || '').toUpperCase()] ?? rgba(200, 170, 110);
      const g = cell.addComponent(Graphics);
      const portrait = resolveC1812HeroResultPortraitPath(hero.spineAsset ?? hero.portraitAsset);
      // 没有头像图的英雄(SR/R act 系):稀有度色暗底 + 名字首字(与守卫战统计行同口径)
      g.fillColor = portrait ? rgba(16, 13, 14, 235) : rgba(Math.round(color.r * 0.42), Math.round(color.g * 0.42), Math.round(color.b * 0.42), 245);
      g.circle(0, 0, size / 2);
      g.fill();
      if (!portrait || !this.host.addSprite('Portrait', portrait, 0, 0, size * 0.86, size * 0.86, cell)) {
        const glyph = this.host.addChildLabel(cell, 'Glyph', Array.from(safeText(hero.heroName))[0] ?? '?', 0, 0, 30 * scale, rgba(255, 244, 222), new Size(size * 0.8, size * 0.8));
        glyph.overflow = Label.Overflow.SHRINK;
        glyph.enableOutline = true; glyph.outlineColor = rgba(10, 8, 6, 240); glyph.outlineWidth = Math.max(1, 1.8 * scale);
      }
      // 稀有度色描边环(画在头像之上)
      const ring = this.host.addChildPlainNode(cell, 'Ring', 0, 0, size, size).addComponent(Graphics);
      ring.strokeColor = color;
      ring.lineWidth = Math.max(2, 2.6 * scale);
      ring.circle(0, 0, size / 2 - 1.5 * scale);
      ring.stroke();
      const name = this.host.addChildLabel(section, `BattleChallengeDialogAllyName_${index}`, safeText(hero.heroName), cx, rowY + 10 * scale - size / 2 - 16 * scale, 15 * scale, rgba(214, 194, 152), new Size(step - 2 * scale, 22 * scale));
      name.overflow = Label.Overflow.SHRINK;
    });
  }
}
