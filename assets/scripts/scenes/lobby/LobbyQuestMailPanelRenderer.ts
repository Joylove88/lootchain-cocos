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
  UITransform,
  Vec3,
} from 'cc';
import { rgba, type UiLayout } from './LobbyHudTypes';
import type { PlayerMailVO, PlayerQuestSummaryVO, PlayerQuestVO, QuestRewardItemVO } from '../../types/QuestTypes';

// 任务弹框素材(2026-09-10 用户切图,原名已 ascii 化):全部一体构图只能等比显示。
const QUEST_UI_ASSETS = {
  /** 恶魔犄角哥特大弹框 1536×1024(空内容、四角透明,整图等比)。 */
  panelFrame: 'ui/mission/ai/panel_frame/spriteFrame',
  /** 页签选中态 673×205(红大理石+金框)/未选态 621×162(暗石纹)。 */
  tabActive: 'ui/mission/ai/tab_active/spriteFrame',
  tabNormal: 'ui/mission/ai/tab_normal/spriteFrame',
  /** 领取钮 571×203(红底金框)/暗态钮 393×142(黑牌)。 */
  btnClaim: 'ui/mission/ai/btn_claim/spriteFrame',
  btnDisabled: 'ui/mission/ai/btn_disabled/spriteFrame',
  /** 进度条:空框 603×86 + 满格绿填充 604×89(FILLED 水平裁剪做进度)。 */
  progressFrame: 'ui/mission/ai/progress_frame/spriteFrame',
  progressFilled: 'ui/mission/ai/progress_filled/spriteFrame',
  close: 'ui/common/ai/button_close/spriteFrame',
  dividerLeft: 'ui/common/ai/footer_divider_left/spriteFrame',
  dividerRight: 'ui/common/ai/footer_divider_right/spriteFrame',
};

/** 任务类型图标:按任务名/描述关键词匹配(ratio=宽/高,等比显示)。 */
const QUEST_ICON_RULES: Array<{ match: RegExp; path: string; ratio: number }> = [
  { match: /登录|签到/, path: 'ui/common/ai/ic_quest_login/spriteFrame', ratio: 192 / 225 },
  { match: /爬塔|主线/, path: 'ui/common/ai/ic_quest_tower/spriteFrame', ratio: 292 / 318 },
  { match: /副本/, path: 'ui/common/ai/ic_quest_dungeon/spriteFrame', ratio: 238 / 271 },
  { match: /召唤|抽卡/, path: 'ui/common/ai/ic_quest_summon/spriteFrame', ratio: 249 / 274 },
  { match: /锻造|强化|洗练/, path: 'ui/common/ai/ic_quest_forge/spriteFrame', ratio: 258 / 264 },
];

/** 奖励图标:按资源名匹配(金币按数额分大小堆)。 */
function resolveRewardIcon(item: QuestRewardItemVO): { path: string; ratio: number } | null {
  const name = item.name ?? '';
  if (name.includes('金币')) {
    return item.amount >= 1500
      ? { path: 'ui/common/ai/ic_gold_large/spriteFrame', ratio: 184 / 171 }
      : { path: 'ui/common/ai/ic_gold_medium/spriteFrame', ratio: 176 / 153 };
  }
  if (name.includes('经验书')) {
    return { path: 'ui/common/ai/ic_exp_book/spriteFrame', ratio: 193 / 154 };
  }
  if (name.includes('强化石')) {
    return { path: 'ui/common/ai/ic_enhance_gem/spriteFrame', ratio: 131 / 196 };
  }
  return null;
}

export interface LobbyQuestMailHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  closeLobbyQuestPanel(): void;
  closeLobbyMailPanel(): void;
  claimLobbyQuest(questCode: string): void;
  setLobbyQuestTab(tab: 'DAILY' | 'ACHIEVE'): void;
  claimLobbyMail(mailId: number): void;
  claimAllLobbyMails(): void;
  currentLobbyQuestState(): { loading: boolean; error: string; summary: PlayerQuestSummaryVO | null; tab: 'DAILY' | 'ACHIEVE'; claiming: string | null };
  currentLobbyMailState(): { loading: boolean; error: string; mails: PlayerMailVO[]; claiming: number | null };
}

/**
 * 任务/成就 + 邮件面板(P1,2026-09-04,docs/14/15):遮罩弹层样式(同设置页),
 * 任务=日常/成就双页签行列表(进度条+奖励+领取钮),邮件=列表+单封领取+一键领取。
 */
export class LobbyQuestMailPanelRenderer {
  constructor(private readonly host: LobbyQuestMailHost) {}

  // ── 任务面板(2026-09-10 参考图素材化改版:恶魔犄角哥特弹框,叠在活的大厅之上) ──
  renderQuestPanel(layout: UiLayout): void {
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    // 弹框按素材可见框等比锚高(画布 1536×1024 带大片透明光晕:实体框只占 y 0.048~0.828、
    // 宽约 0.96,画布按比例放大并偏移使框心对齐面板原点),窄屏再按宽钳一道。
    const frameAspect = 1536 / 1024;
    const ART_TOP = 0.048;
    const ART_BOTTOM = 0.828;
    const ART_SIDE = 0.96;
    const artHeightFrac = ART_BOTTOM - ART_TOP;
    let panelHeight = Math.min(layout.stageHeight - 28 * scale, 640 * scale);
    let panelWidth = (panelHeight / artHeightFrac) * frameAspect * ART_SIDE;
    if (panelWidth > layout.stageWidth - 36 * scale) {
      panelWidth = layout.stageWidth - 36 * scale;
      panelHeight = (panelWidth / ART_SIDE / frameAspect) * artHeightFrac;
    }
    const state = this.host.currentLobbyQuestState();

    this.mountDim('LobbyQuestDim', centerX, centerY, layout, () => this.host.closeLobbyQuestPanel());
    const group = this.host.createUiNode('LobbyQuestSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(group, 'Frame', 0, 0, panelWidth, panelHeight);
    const artHeight = panelHeight / artHeightFrac;
    const artWidth = artHeight * frameAspect;
    const artYOffset = ((ART_TOP + ART_BOTTOM) / 2 - 0.5) * artHeight;
    if (!this.host.addSprite('FrameArt', QUEST_UI_ASSETS.panelFrame, 0, artYOffset, artWidth, artHeight, panel)) {
      const g = panel.addComponent(Graphics);
      g.fillColor = rgba(7, 7, 10, 240);
      g.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18 * scale);
      g.fill();
      g.strokeColor = rgba(192, 145, 66, 226);
      g.lineWidth = Math.max(1, 1.6 * scale);
      g.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18 * scale);
      g.stroke();
    }

    // 标题+两侧星饰线(以下 Y 均以可见框为基准)。
    const titleY = panelHeight * 0.375;
    const title = this.host.addChildLabel(panel, 'Title', '任务', 0, titleY, 30 * scale, rgba(244, 220, 166, 255), new Size(panelWidth * 0.4, 40 * scale));
    title.isBold = true;
    this.outline(title, scale, true);
    const dividerW = 92 * scale;
    const dividerH = dividerW * (71 / 224);
    const dividerGap = 46 * scale + dividerW / 2;
    this.host.addSprite('TitleDividerL', QUEST_UI_ASSETS.dividerLeft, -dividerGap, titleY, dividerW, dividerH, panel);
    this.host.addSprite('TitleDividerR', QUEST_UI_ASSETS.dividerRight, dividerGap, titleY, dividerW, dividerH, panel);
    this.addAssetCloseButton(panel, panelWidth * 0.43, panelHeight * 0.39, scale, () => this.host.closeLobbyQuestPanel());

    // 页签(素材:选中=红大理石金框,未选=暗石纹;缺图退手绘)。
    const tabW = 186 * scale;
    const tabY = panelHeight * 0.25;
    this.addQuestTabButton(panel, '日常任务', state.tab === 'DAILY', -tabW / 2 - 16 * scale, tabY, tabW, scale, () => this.host.setLobbyQuestTab('DAILY'));
    this.addQuestTabButton(panel, '成就', state.tab === 'ACHIEVE', tabW / 2 + 16 * scale, tabY, tabW, scale, () => this.host.setLobbyQuestTab('ACHIEVE'));

    // 底部标语+饰线。
    const footerY = -panelHeight * 0.415;
    const footer = this.host.addChildLabel(panel, 'FooterMotto', '于黑暗中前行 · 以意志铸就荣耀', 0, footerY, 14 * scale, rgba(190, 174, 144, 215), new Size(panelWidth * 0.5, 20 * scale));
    footer.overflow = Label.Overflow.SHRINK;
    const footDivW = 70 * scale;
    const footDivGap = 128 * scale + footDivW / 2;
    this.host.addSprite('FooterDividerL', QUEST_UI_ASSETS.dividerLeft, -footDivGap, footerY, footDivW, footDivW * (71 / 224), panel);
    this.host.addSprite('FooterDividerR', QUEST_UI_ASSETS.dividerRight, footDivGap, footerY, footDivW, footDivW * (71 / 224), panel);

    if (state.loading && !state.summary) {
      this.centerHint(panel, '任务读取中…', rgba(214, 196, 156, 235), scale);
      return;
    }
    if (state.error && !state.summary) {
      this.centerHint(panel, `读取失败:${state.error}`, rgba(255, 150, 130, 235), scale);
      return;
    }
    const quests = state.tab === 'DAILY' ? state.summary?.daily ?? [] : state.summary?.achievements ?? [];
    if (quests.length === 0) {
      this.centerHint(panel, '暂无任务', rgba(196, 182, 152, 220), scale);
      return;
    }
    // 行列表:Mask+ScrollView 单列滚动(成就多时不再静默截断)。
    const listTop = tabY - 40 * scale;
    const listBottom = footerY + 26 * scale;
    const listHeight = Math.max(80 * scale, listTop - listBottom);
    const rowW = panelWidth * 0.86;
    const rowH = 88 * scale;
    const listNode = this.host.addChildPlainNode(panel, 'QuestList', 0, listBottom + listHeight / 2, rowW + 12 * scale, listHeight);
    listNode.addComponent(Mask);
    const contentHeight = Math.max(listHeight, quests.length * rowH);
    const contentNode = this.host.addChildPlainNode(listNode, 'QuestListContent', 0, 0, rowW + 12 * scale, contentHeight);
    contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
    contentNode.setPosition(0, listHeight / 2, 0);
    const scroll = listNode.addComponent(ScrollView);
    scroll.content = contentNode;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    quests.forEach((quest, index) => {
      this.addQuestRow(contentNode, quest, 0, -rowH / 2 - index * rowH, rowW, rowH - 10 * scale, scale, state.claiming);
    });
  }

  private addQuestRow(parent: Node, quest: PlayerQuestVO, x: number, y: number, width: number, height: number, scale: number, claiming: string | null): void {
    const row = this.host.addChildPlainNode(parent, `QuestRow_${quest.questCode}`, x, y, width, height);
    const g = row.addComponent(Graphics);
    g.fillColor = quest.claimable ? rgba(56, 42, 18, 230) : rgba(15, 13, 14, 225);
    g.roundRect(-width / 2, -height / 2, width, height, 7 * scale);
    g.fill();
    g.strokeColor = quest.claimable ? rgba(240, 194, 104, 230) : rgba(112, 90, 58, 150);
    g.lineWidth = Math.max(1, quest.claimable ? 1.7 * scale : 1.1 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 7 * scale);
    g.stroke();

    // 任务类型图标(按名称/描述关键词;无匹配不占位画暗框)。
    const iconRule = QUEST_ICON_RULES.find((rule) => rule.match.test(`${quest.questName}${quest.questDesc ?? ''}`)) ?? null;
    const iconBoxX = -width / 2 + 44 * scale;
    if (iconRule) {
      const iconH = 58 * scale;
      this.host.addSprite('TypeIcon', iconRule.path, iconBoxX, 0, iconH * iconRule.ratio, iconH, row);
    }
    const textLeft = -width / 2 + 84 * scale;
    const name = this.host.addChildLabel(row, 'Name', quest.questName, textLeft, height / 2 - 22 * scale, 19 * scale, rgba(245, 222, 160, 250), new Size(width * 0.26, 26 * scale), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.outline(name, scale, true);
    const desc = this.host.addChildLabel(row, 'Desc', quest.questDesc ?? '', textLeft, -height / 2 + 18 * scale, 15 * scale, rgba(186, 172, 144, 225), new Size(width * 0.28, 21 * scale), HorizontalTextAlignment.LEFT);
    desc.overflow = Label.Overflow.SHRINK;

    // 进度条(素材金框+满格绿填充 FILLED 水平裁剪;缺图退手绘)。
    const barW = width * 0.21;
    const barH = barW * (86 / 603);
    const barX = -width * 0.035;
    const barY = -8 * scale;
    const ratio = quest.targetCount > 0 ? Math.min(1, quest.progress / quest.targetCount) : 0;
    const frameSprite = this.host.addSprite('BarFrame', QUEST_UI_ASSETS.progressFrame, barX, barY, barW, barH, row);
    const fillSprite = ratio > 0 ? this.host.addSprite('BarFill', QUEST_UI_ASSETS.progressFilled, barX, barY, barW, barH, row) : frameSprite;
    if (fillSprite && ratio > 0 && fillSprite !== frameSprite) {
      fillSprite.type = Sprite.Type.FILLED;
      fillSprite.fillType = Sprite.FillType.HORIZONTAL;
      fillSprite.fillStart = 0;
      fillSprite.fillRange = ratio;
    }
    if (!frameSprite) {
      const bar = this.host.addChildPlainNode(row, 'Bar', barX, barY, barW, 8 * scale);
      const bg = bar.addComponent(Graphics);
      bg.fillColor = rgba(40, 34, 26, 220);
      bg.roundRect(-barW / 2, -4 * scale, barW, 8 * scale, 4 * scale);
      bg.fill();
      bg.fillColor = quest.claimable || quest.claimed ? rgba(150, 226, 130, 240) : rgba(224, 178, 90, 235);
      bg.roundRect(-barW / 2, -4 * scale, Math.max(4 * scale, barW * ratio), 8 * scale, 4 * scale);
      bg.fill();
    }
    const progress = this.host.addChildLabel(row, 'Progress', `${quest.progress}/${quest.targetCount}`, barX, barY + barH / 2 + 13 * scale, 15 * scale, rgba(206, 192, 160, 235), new Size(barW + 30 * scale, 20 * scale));
    progress.overflow = Label.Overflow.SHRINK;

    // 奖励区:最多两行 图标+文字(金币按量分大小堆;无图标纯文字)。
    const rewardIconX = width * 0.115;
    const rewardTextX = width * 0.145;
    const rewards = quest.rewards.slice(0, 2);
    rewards.forEach((item, index) => {
      const ry = rewards.length === 1 ? 0 : (index === 0 ? 19 * scale : -19 * scale);
      const icon = resolveRewardIcon(item);
      if (icon) {
        const iconH = 30 * scale;
        this.host.addSprite(`RewardIcon_${index}`, icon.path, rewardIconX, ry, iconH * icon.ratio, iconH, row);
      }
      const label = this.host.addChildLabel(row, `Reward_${index}`, `${item.name}×${item.amount}`, rewardTextX + 12 * scale, ry, 16 * scale, rgba(255, 226, 150, 245), new Size(width * 0.17, 22 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
    });

    // 领取按钮(可领时命名 LobbyQuestClaimReady:新手引导 CLAIM 步的光圈目标,findLobbyNode 命中第一个可领行)
    const btnW = 118 * scale;
    const btnH = 42 * scale;
    const claimable = quest.claimable && claiming === null;
    const btn = this.host.addChildPlainNode(row, claimable ? 'LobbyQuestClaimReady' : 'Claim', width / 2 - btnW / 2 - 16 * scale, 0, btnW, btnH);
    const useClaimArt = !quest.claimed && claimable;
    if (!this.host.addSprite('Art', useClaimArt ? QUEST_UI_ASSETS.btnClaim : QUEST_UI_ASSETS.btnDisabled, 0, 0, btnW, btnH, btn)) {
      const bgB = btn.addComponent(Graphics);
      bgB.fillColor = quest.claimed ? rgba(30, 28, 26, 200) : claimable ? rgba(122, 32, 26, 240) : rgba(44, 38, 30, 210);
      bgB.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
      bgB.fill();
      bgB.strokeColor = quest.claimed ? rgba(96, 86, 70, 140) : claimable ? rgba(240, 180, 90, 235) : rgba(120, 100, 70, 150);
      bgB.lineWidth = Math.max(1, 1.2 * scale);
      bgB.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
      bgB.stroke();
    }
    const btnText = quest.claimed ? '已领取' : claiming === quest.questCode ? '领取中…' : quest.claimable ? '领取' : '未完成';
    const label = this.host.addChildLabel(btn, 'Text', btnText, 0, 0, 18 * scale, quest.claimed ? rgba(150, 138, 118) : claimable ? rgba(255, 236, 190) : rgba(170, 156, 130), new Size(btnW - 12 * scale, btnH));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, claimable);
    if (claimable) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => this.host.claimLobbyQuest(quest.questCode), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    }
  }

  /** 任务弹框专用页签(素材化);缺图退回通用手绘页签样式。 */
  private addQuestTabButton(parent: Node, text: string, active: boolean, x: number, y: number, width: number, scale: number, onClick: () => void): void {
    const height = active ? width * (205 / 673) : width * (162 / 621);
    const btn = this.host.addChildPlainNode(parent, `Tab_${text}`, x, y, width, Math.max(height, 44 * scale));
    if (!this.host.addSprite('Art', active ? QUEST_UI_ASSETS.tabActive : QUEST_UI_ASSETS.tabNormal, 0, 0, width, height, btn)) {
      const g = btn.addComponent(Graphics);
      g.fillColor = active ? rgba(89, 65, 30, 238) : rgba(14, 13, 15, 218);
      g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
      g.fill();
      g.strokeColor = active ? rgba(245, 203, 101, 236) : rgba(132, 96, 50, 188);
      g.lineWidth = Math.max(1, active ? 1.8 * scale : 1.2 * scale);
      g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
      g.stroke();
    }
    const label = this.host.addChildLabel(btn, 'Text', text, 0, 0, 20 * scale, active ? rgba(255, 231, 166) : rgba(200, 182, 142), new Size(width - 24 * scale, 28 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, active);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(btn, 1.03, 0.97);
  }

  /** 素材化关闭钮(金圈X);缺图退回文字 ✕。 */
  private addAssetCloseButton(parent: Node, x: number, y: number, scale: number, onClose: () => void): void {
    const size = 46 * scale;
    const btn = this.host.addChildPlainNode(parent, 'CloseBtn', x, y, size, size);
    if (!this.host.addSprite('Art', QUEST_UI_ASSETS.close, 0, 0, size * (155 / 161), size, btn)) {
      const label = this.host.addChildLabel(btn, 'Text', '✕', 0, 0, 22 * scale, rgba(214, 190, 150, 240), new Size(size, size));
      this.outline(label, scale, false);
    }
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClose, this);
    this.host.applyImageButtonFeedback(btn, 1.1, 0.92);
  }

  // ── 邮件面板 ──
  renderMailPanel(layout: UiLayout): void {
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelWidth = Math.min(layout.stageWidth - 44 * scale, 680 * scale);
    const panelHeight = Math.min(layout.stageHeight - 60 * scale, 560 * scale);
    const state = this.host.currentLobbyMailState();

    this.mountDim('LobbyMailDim', centerX, centerY, layout, () => this.host.closeLobbyMailPanel());
    const group = this.host.createUiNode('LobbyMailSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(group, 'Frame', 0, 0, panelWidth, panelHeight, rgba(7, 7, 10, 240), rgba(192, 145, 66, 226), 18 * scale);

    const title = this.host.addChildLabel(panel, 'Title', '邮件', 0, panelHeight / 2 - 34 * scale, 26 * scale, rgba(244, 220, 166, 255), new Size(panelWidth - 120 * scale, 34 * scale));
    this.outline(title, scale, true);
    this.addCloseButton(panel, panelWidth / 2 - 34 * scale, panelHeight / 2 - 34 * scale, scale, () => this.host.closeLobbyMailPanel());

    if (state.loading && state.mails.length === 0) {
      this.centerHint(panel, '邮件读取中…', rgba(214, 196, 156, 235), scale);
      return;
    }
    if (state.error && state.mails.length === 0) {
      this.centerHint(panel, `读取失败:${state.error}`, rgba(255, 150, 130, 235), scale);
      return;
    }
    if (state.mails.length === 0) {
      this.centerHint(panel, '暂无邮件', rgba(196, 182, 152, 220), scale);
      return;
    }

    // 一键领取(有可领附件时)
    const anyClaimable = state.mails.some((mail) => !mail.claimed && mail.attachments.length > 0);
    if (anyClaimable) {
      const btnW = 150 * scale;
      const btnH = 38 * scale;
      const btn = this.host.addChildPlainNode(panel, 'ClaimAll', 0, -panelHeight / 2 + 34 * scale, btnW, btnH);
      const g = btn.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 26, 240);
      g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 7 * scale);
      g.fill();
      g.strokeColor = rgba(240, 180, 90, 235);
      g.lineWidth = Math.max(1, 1.3 * scale);
      g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 7 * scale);
      g.stroke();
      const label = this.host.addChildLabel(btn, 'Text', state.claiming === -1 ? '领取中…' : '一键领取', 0, 0, 16 * scale, rgba(255, 236, 190), new Size(btnW - 10 * scale, btnH));
      label.overflow = Label.Overflow.SHRINK;
      if (state.claiming === null) {
        btn.addComponent(Button);
        btn.on(Button.EventType.CLICK, () => this.host.claimAllLobbyMails(), this);
        this.host.applyImageButtonFeedback(btn, 1.04, 0.96);
      }
    }

    const rowH = 74 * scale;
    const rowW = panelWidth - 64 * scale;
    let cursor = panelHeight / 2 - 82 * scale - rowH / 2;
    const bottomLimit = -panelHeight / 2 + (anyClaimable ? 64 : 24) * scale;
    for (const mail of state.mails) {
      if (cursor - rowH / 2 < bottomLimit) {
        break;
      }
      this.addMailRow(panel, mail, 0, cursor, rowW, rowH - 8 * scale, scale, state.claiming);
      cursor -= rowH;
    }
  }

  private addMailRow(parent: Node, mail: PlayerMailVO, x: number, y: number, width: number, height: number, scale: number, claiming: number | null): void {
    const row = this.host.addChildPlainNode(parent, `MailRow_${mail.mailId}`, x, y, width, height);
    const g = row.addComponent(Graphics);
    const unread = !mail.read;
    g.fillColor = unread ? rgba(46, 38, 22, 235) : rgba(20, 18, 18, 210);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.fill();
    g.strokeColor = unread ? rgba(230, 186, 100, 210) : rgba(110, 92, 62, 150);
    g.lineWidth = Math.max(1, 1.1 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.stroke();

    const title = this.host.addChildLabel(row, 'Title', `${unread ? '● ' : ''}${mail.title}`, -width / 2 + 16 * scale, height / 2 - 16 * scale, 18 * scale, rgba(245, 222, 160, 250), new Size(width * 0.6, 24 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.outline(title, scale, unread);
    const content = this.host.addChildLabel(row, 'Content', mail.content, -width / 2 + 16 * scale, -1 * scale, 15 * scale, rgba(190, 176, 148, 230), new Size(width * 0.62, 21 * scale), HorizontalTextAlignment.LEFT);
    content.overflow = Label.Overflow.SHRINK;
    const attachText = mail.attachments.length > 0
      ? `附件:${mail.attachments.map((item) => `${item.name}×${item.amount}`).join(' ')}`
      : '';
    const attach = this.host.addChildLabel(row, 'Attach', attachText, -width / 2 + 16 * scale, -height / 2 + 13 * scale, 16 * scale, rgba(255, 226, 150, 240), new Size(width * 0.62, 22 * scale), HorizontalTextAlignment.LEFT);
    attach.overflow = Label.Overflow.SHRINK;

    const btnW = 92 * scale;
    const btnH = 34 * scale;
    const hasAttachment = mail.attachments.length > 0;
    const claimable = hasAttachment && !mail.claimed && claiming === null;
    const btn = this.host.addChildPlainNode(row, 'Claim', width / 2 - btnW / 2 - 12 * scale, 0, btnW, btnH);
    const bg = btn.addComponent(Graphics);
    bg.fillColor = mail.claimed ? rgba(30, 28, 26, 200) : claimable ? rgba(122, 32, 26, 240) : rgba(40, 36, 30, 205);
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
    bg.fill();
    bg.strokeColor = mail.claimed ? rgba(96, 86, 70, 140) : claimable ? rgba(240, 180, 90, 235) : rgba(116, 98, 70, 145);
    bg.lineWidth = Math.max(1, 1.1 * scale);
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
    bg.stroke();
    const btnText = !hasAttachment ? '无附件' : mail.claimed ? '已领取' : claiming === mail.mailId ? '领取中…' : '领取';
    const label = this.host.addChildLabel(btn, 'Text', btnText, 0, 0, 16 * scale, mail.claimed || !hasAttachment ? rgba(140, 128, 108) : rgba(255, 236, 190), new Size(btnW - 8 * scale, btnH));
    label.overflow = Label.Overflow.SHRINK;
    if (claimable) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => this.host.claimLobbyMail(mail.mailId), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    }
  }

  // ── 共用小件 ──
  private mountDim(name: string, centerX: number, centerY: number, layout: UiLayout, onClose: () => void): void {
    const dim = this.host.createUiNode(name);
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const g = dim.addComponent(Graphics);
    g.fillColor = rgba(0, 0, 0, 132);
    g.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    g.fill();
    dim.addComponent(BlockInputEvents);
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, onClose, this);
  }

  private addCloseButton(parent: Node, x: number, y: number, scale: number, onClose: () => void): void {
    const btn = this.host.addChildPlainNode(parent, 'CloseBtn', x, y, 40 * scale, 40 * scale);
    const label = this.host.addChildLabel(btn, 'Text', '✕', 0, 0, 22 * scale, rgba(214, 190, 150, 240), new Size(40 * scale, 40 * scale));
    this.outline(label, scale, false);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClose, this);
    this.host.applyImageButtonFeedback(btn, 1.1, 0.92);
  }

  private centerHint(parent: Node, text: string, color: Color, scale: number): void {
    const hint = this.host.addChildLabel(parent, 'CenterHint', text, 0, 0, 17 * scale, color, new Size(460 * scale, 44 * scale));
    hint.overflow = Label.Overflow.SHRINK;
  }

  private outline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 228 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}
