import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  UITransform,
  Vec3,
} from 'cc';
import { rgba, type UiLayout } from './LobbyHudTypes';
import type { PlayerMailVO, PlayerQuestSummaryVO, PlayerQuestVO, QuestRewardItemVO } from '../../types/QuestTypes';

export interface LobbyQuestMailHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
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

  // ── 任务面板 ──
  renderQuestPanel(layout: UiLayout): void {
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelWidth = Math.min(layout.stageWidth - 44 * scale, 720 * scale);
    const panelHeight = Math.min(layout.stageHeight - 60 * scale, 560 * scale);
    const state = this.host.currentLobbyQuestState();

    this.mountDim('LobbyQuestDim', centerX, centerY, layout, () => this.host.closeLobbyQuestPanel());
    const group = this.host.createUiNode('LobbyQuestSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(group, 'Frame', 0, 0, panelWidth, panelHeight, rgba(7, 7, 10, 240), rgba(192, 145, 66, 226), 18 * scale);

    const title = this.host.addChildLabel(panel, 'Title', '任务', 0, panelHeight / 2 - 34 * scale, 26 * scale, rgba(244, 220, 166, 255), new Size(panelWidth - 120 * scale, 34 * scale));
    this.outline(title, scale, true);
    this.addCloseButton(panel, panelWidth / 2 - 34 * scale, panelHeight / 2 - 34 * scale, scale, () => this.host.closeLobbyQuestPanel());

    // 页签
    const tabW = 150 * scale;
    const tabH = 42 * scale;
    const tabY = panelHeight / 2 - 84 * scale;
    this.addTabButton(panel, '日常任务', state.tab === 'DAILY', -tabW / 2 - 12 * scale, tabY, tabW, tabH, scale, () => this.host.setLobbyQuestTab('DAILY'));
    this.addTabButton(panel, '成就', state.tab === 'ACHIEVE', tabW / 2 + 12 * scale, tabY, tabW, tabH, scale, () => this.host.setLobbyQuestTab('ACHIEVE'));

    const listTop = tabY - tabH / 2 - 14 * scale;
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
    const rowH = 62 * scale;
    const rowW = panelWidth - 64 * scale;
    let cursor = listTop - rowH / 2;
    const bottomLimit = -panelHeight / 2 + 24 * scale;
    for (const quest of quests) {
      if (cursor - rowH / 2 < bottomLimit) {
        break;
      }
      this.addQuestRow(panel, quest, 0, cursor, rowW, rowH - 8 * scale, scale, state.claiming);
      cursor -= rowH;
    }
  }

  private addQuestRow(parent: Node, quest: PlayerQuestVO, x: number, y: number, width: number, height: number, scale: number, claiming: string | null): void {
    const row = this.host.addChildPlainNode(parent, `QuestRow_${quest.questCode}`, x, y, width, height);
    const g = row.addComponent(Graphics);
    g.fillColor = quest.claimable ? rgba(52, 40, 18, 235) : rgba(20, 18, 18, 215);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.fill();
    g.strokeColor = quest.claimable ? rgba(240, 194, 104, 220) : rgba(120, 96, 62, 160);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.stroke();

    const name = this.host.addChildLabel(row, 'Name', quest.questName, -width / 2 + 16 * scale, height / 2 - 15 * scale, 17 * scale, rgba(245, 222, 160, 250), new Size(width * 0.34, 22 * scale), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.outline(name, scale, true);
    const desc = this.host.addChildLabel(row, 'Desc', quest.questDesc ?? '', -width / 2 + 16 * scale, -height / 2 + 14 * scale, 13 * scale, rgba(186, 172, 144, 225), new Size(width * 0.38, 17 * scale), HorizontalTextAlignment.LEFT);
    desc.overflow = Label.Overflow.SHRINK;

    // 进度条
    const barW = width * 0.2;
    const barX = -width * 0.06;
    const bar = this.host.addChildPlainNode(row, 'Bar', barX, -2 * scale, barW, 8 * scale);
    const bg = bar.addComponent(Graphics);
    bg.fillColor = rgba(40, 34, 26, 220);
    bg.roundRect(-barW / 2, -4 * scale, barW, 8 * scale, 4 * scale);
    bg.fill();
    const ratio = quest.targetCount > 0 ? Math.min(1, quest.progress / quest.targetCount) : 0;
    bg.fillColor = quest.claimable || quest.claimed ? rgba(150, 226, 130, 240) : rgba(224, 178, 90, 235);
    bg.roundRect(-barW / 2, -4 * scale, Math.max(4 * scale, barW * ratio), 8 * scale, 4 * scale);
    bg.fill();
    const progress = this.host.addChildLabel(row, 'Progress', `${quest.progress}/${quest.targetCount}`, barX, 13 * scale, 12 * scale, rgba(206, 192, 160, 235), new Size(barW + 30 * scale, 16 * scale));
    progress.overflow = Label.Overflow.SHRINK;

    const rewardText = quest.rewards.map((item) => `${item.name}×${item.amount}`).join(' ');
    const reward = this.host.addChildLabel(row, 'Reward', rewardText, width * 0.17, 0, 13.5 * scale, rgba(255, 226, 150, 245), new Size(width * 0.24, 34 * scale));
    reward.overflow = Label.Overflow.SHRINK;

    // 领取按钮
    const btnW = 88 * scale;
    const btnH = 36 * scale;
    const btn = this.host.addChildPlainNode(row, 'Claim', width / 2 - btnW / 2 - 12 * scale, 0, btnW, btnH);
    const bgB = btn.addComponent(Graphics);
    const claimable = quest.claimable && claiming === null;
    bgB.fillColor = quest.claimed ? rgba(30, 28, 26, 200) : claimable ? rgba(122, 32, 26, 240) : rgba(44, 38, 30, 210);
    bgB.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
    bgB.fill();
    bgB.strokeColor = quest.claimed ? rgba(96, 86, 70, 140) : claimable ? rgba(240, 180, 90, 235) : rgba(120, 100, 70, 150);
    bgB.lineWidth = Math.max(1, 1.2 * scale);
    bgB.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6 * scale);
    bgB.stroke();
    const btnText = quest.claimed ? '已领取' : claiming === quest.questCode ? '领取中…' : quest.claimable ? '领取' : '未完成';
    const label = this.host.addChildLabel(btn, 'Text', btnText, 0, 0, 15 * scale, quest.claimed ? rgba(140, 128, 108) : claimable ? rgba(255, 236, 190) : rgba(160, 146, 120), new Size(btnW - 8 * scale, btnH));
    label.overflow = Label.Overflow.SHRINK;
    if (claimable) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => this.host.claimLobbyQuest(quest.questCode), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    }
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

    const title = this.host.addChildLabel(row, 'Title', `${unread ? '● ' : ''}${mail.title}`, -width / 2 + 16 * scale, height / 2 - 16 * scale, 16.5 * scale, rgba(245, 222, 160, 250), new Size(width * 0.6, 22 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.outline(title, scale, unread);
    const content = this.host.addChildLabel(row, 'Content', mail.content, -width / 2 + 16 * scale, -1 * scale, 13 * scale, rgba(190, 176, 148, 230), new Size(width * 0.62, 17 * scale), HorizontalTextAlignment.LEFT);
    content.overflow = Label.Overflow.SHRINK;
    const attachText = mail.attachments.length > 0
      ? `附件:${mail.attachments.map((item) => `${item.name}×${item.amount}`).join(' ')}`
      : '';
    const attach = this.host.addChildLabel(row, 'Attach', attachText, -width / 2 + 16 * scale, -height / 2 + 13 * scale, 12.5 * scale, rgba(255, 226, 150, 240), new Size(width * 0.62, 16 * scale), HorizontalTextAlignment.LEFT);
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
    const label = this.host.addChildLabel(btn, 'Text', btnText, 0, 0, 14 * scale, mail.claimed || !hasAttachment ? rgba(140, 128, 108) : rgba(255, 236, 190), new Size(btnW - 8 * scale, btnH));
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

  private addTabButton(parent: Node, text: string, active: boolean, x: number, y: number, width: number, height: number, scale: number, onClick: () => void): void {
    const btn = this.host.addChildPlainNode(parent, `Tab_${text}`, x, y, width, height);
    const g = btn.addComponent(Graphics);
    g.fillColor = active ? rgba(89, 65, 30, 238) : rgba(14, 13, 15, 218);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.fill();
    g.strokeColor = active ? rgba(245, 203, 101, 236) : rgba(132, 96, 50, 188);
    g.lineWidth = Math.max(1, active ? 1.8 * scale : 1.2 * scale);
    g.roundRect(-width / 2, -height / 2, width, height, 8 * scale);
    g.stroke();
    const label = this.host.addChildLabel(btn, 'Text', text, 0, 0, 17 * scale, active ? rgba(255, 231, 166) : rgba(200, 182, 142), new Size(width - 12 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, active);
    btn.addComponent(Button);
    btn.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(btn, 1.03, 0.97);
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
