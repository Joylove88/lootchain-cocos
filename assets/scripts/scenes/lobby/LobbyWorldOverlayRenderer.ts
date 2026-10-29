import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { WorldBountyVO, WorldMapCode, WorldQuestVO, WorldRewardItemVO, WorldStateVO } from '../../types/WorldTypes';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { WORLD_MAPS, worldAsset, type WorldNpcCode } from './LobbyWorldMaps';
import { WORLD_NPC_IDLE, WORLD_QUEST_TEXT } from './WorldStoryText';

/** NPC 对话(原型 p4)。mode:offer 接任务 / claim 交任务 / grow 养成类去做 / train 训练场开战 / progress 进行中 / idle 闲聊。 */
export interface WorldDialogState {
  npc: WorldNpcCode;
  mode: 'offer' | 'claim' | 'grow' | 'train' | 'progress' | 'idle';
  questCode: string;
  busy: boolean;
}

/** 世界地图(原型 p3 B 版):tab = 世界页签;selected = 选中的传送阵;region = 地区筛选。 */
export interface WorldMapPanelState {
  tab: number;
  selected: string | null;
  region: string | null;
}

export interface WorldBountyPanelState {
  busy: boolean;
}

export interface LobbyWorldOverlayHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  currentWorldState(): WorldStateVO | null;
  currentWorldMapCode(): WorldMapCode;
  currentWorldDialog(): WorldDialogState | null;
  currentWorldMapPanel(): WorldMapPanelState | null;
  currentWorldBountyPanel(): WorldBountyPanelState | null;
  closeWorldDialog(): void;
  worldDialogPrimary(): void;
  closeWorldMapPanel(): void;
  selectWorldMapTab(tab: number): void;
  selectWorldMapPoint(code: string | null): void;
  selectWorldMapRegion(region: string | null): void;
  teleportWorldMap(code: WorldMapCode): void;
  worldTeleportNote?(): string;
  closeWorldBountyPanel(): void;
  acceptWorldBounty(slot: number): void;
  claimWorldBounty(slot: number): void;
  openLobbyQuestPanel?(): void;
}

const NPC_NAMES: Record<WorldNpcCode, string> = {
  CHIEF: '村长 · 老霍恩',
  INSTRUCTOR: '教官 · 格雷',
  PRIEST: '祭司 · 莉娅',
  SMITH: '铁匠 · 巴洛',
  BOARD: '公告板',
};
const NPC_PORTRAITS: Partial<Record<WorldNpcCode, string>> = {
  CHIEF: worldAsset('portrait_chief'),
  INSTRUCTOR: worldAsset('npc_instructor'),
  PRIEST: worldAsset('npc_priest'),
  SMITH: worldAsset('npc_smith'),
  BOARD: worldAsset('city_board'),
};
const BTN = {
  primary: 'ui/raid/btn_primary/spriteFrame',
  secondary: 'ui/raid/btn_secondary/spriteFrame',
  disabled: 'ui/raid/btn_disabled/spriteFrame',
};
const BTN_SRC_H = 120;
const GOLD = rgba(236, 200, 120);
const BODY = rgba(236, 226, 204);
const DIM = rgba(160, 150, 134);

interface WorldPoint {
  code: string;
  name: string;
  level: string;
  x: number;
  y: number;
  region: string;
  /** 后续地图(P2+):只显示带锁占位。 */
  future?: number;
}

export const WORLD_TABS: ReadonlyArray<{ name: string; level: string; image: string; open: boolean }> = [
  { name: '晨曦大陆', level: 'Lv.1-60', image: worldAsset('map_world1'), open: true },
  { name: '暗潮群岛', level: 'Lv.60-120', image: worldAsset('map_world2'), open: false },
  { name: '天穹浮城', level: 'Lv.120+', image: worldAsset('map_world2'), open: false },
];
const WORLD_REGIONS: ReadonlyArray<{ key: string; name: string }> = [
  { key: 'NOVICE', name: '新手区' },
  { key: 'CENTRAL', name: '中央王国' },
  { key: 'NORTH', name: '北境' },
  { key: 'DRAGON', name: '龙脊边疆' },
];
const WORLD1_POINTS: readonly WorldPoint[] = [
  { code: 'VILLAGE', name: '晨风村', level: 'Lv.1-10', x: 0.19, y: 0.74, region: 'NOVICE' },
  { code: 'WOODS', name: '村外林地', level: 'Lv.1-10', x: 0.29, y: 0.62, region: 'NOVICE' },
  { code: 'CITY', name: '主城', level: '', x: 0.37, y: 0.36, region: 'CENTRAL' },
  { code: 'GRAY', name: '灰岩荒原', level: 'Lv.10-20', x: 0.56, y: 0.58, region: 'CENTRAL' },
  { code: 'DEADWOOD', name: '枯木林', level: 'Lv.20-30', x: 0.76, y: 0.38, region: 'CENTRAL', future: 20 },
  { code: 'SLAG', name: '熔渣矿坑', level: 'Lv.30-40', x: 0.51, y: 0.12, region: 'NORTH', future: 30 },
  { code: 'FROST', name: '霜脊高地', level: 'Lv.40-50', x: 0.18, y: 0.15, region: 'NORTH', future: 40 },
  { code: 'DRAGON', name: '龙骸深谷', level: 'Lv.50-60', x: 0.82, y: 0.18, region: 'DRAGON', future: 50 },
];

/** docs/50 跑图世界的三个浮层:NPC 对话 / 世界地图 / 佣兵公会悬赏(挂内容根,随大厅重绘重挂)。 */
export class LobbyWorldOverlayRenderer {
  static readonly DIALOG = 'LobbyWorldDialogOverlay';
  static readonly MAP = 'LobbyWorldMapOverlay';
  static readonly BOUNTY = 'LobbyWorldBountyOverlay';

  constructor(private readonly host: LobbyWorldOverlayHost) {}

  // ── 公用 ──

  private overlayRoot(name: string, layout: UiLayout, dimAlpha: number, onTapOutside: (() => void) | null): Node {
    const overlay = this.host.createUiNode(name);
    overlay.setPosition(new Vec3((layout.stageLeft + layout.stageRight) / 2, (layout.stageTop + layout.stageBottom) / 2, 0));
    overlay.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    overlay.addComponent(BlockInputEvents);
    const dim = overlay.addComponent(Graphics);
    dim.fillColor = rgba(0, 0, 0, dimAlpha);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    if (onTapOutside) {
      overlay.addComponent(Button);
      overlay.on(Button.EventType.CLICK, onTapOutside, this);
    }
    return overlay;
  }

  private label(parent: Node, name: string, text: string, x: number, y: number, font: number, color: Color, width: number, align = HorizontalTextAlignment.CENTER, bold = false): Label {
    const label = this.host.addChildLabel(parent, name, text, x, y, font, color, new Size(width, font * 1.45), align);
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = bold;
    return label;
  }

  private frame(g: Graphics, w: number, h: number, k: number, fill = rgba(14, 12, 11, 245)): void {
    const c = 10 * k;
    const path = (inset: number): void => {
      const x0 = -w / 2 + inset;
      const x1 = w / 2 - inset;
      const y0 = -h / 2 + inset;
      const y1 = h / 2 - inset;
      const cc = Math.max(0, c - inset * 0.6);
      g.moveTo(x0 + cc, y1);
      g.lineTo(x1 - cc, y1);
      g.lineTo(x1, y1 - cc);
      g.lineTo(x1, y0 + cc);
      g.lineTo(x1 - cc, y0);
      g.lineTo(x0 + cc, y0);
      g.lineTo(x0, y0 + cc);
      g.lineTo(x0, y1 - cc);
      g.close();
    };
    path(0);
    g.fillColor = fill;
    g.fill();
    path(0);
    g.strokeColor = rgba(196, 156, 88, 240);
    g.lineWidth = Math.max(1.5, 2 * k);
    g.stroke();
    path(5 * k);
    g.strokeColor = rgba(96, 74, 42, 210);
    g.lineWidth = Math.max(1, 1.2 * k);
    g.stroke();
  }

  private button(parent: Node, name: string, x: number, y: number, w: number, h: number, text: string, style: 'primary' | 'secondary' | 'disabled', onTap: (() => void) | null): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, w, h);
    const bg = this.host.addSprite('Bg', BTN[style], 0, 0, w, h, node);
    if (bg) {
      const f = BTN_SRC_H / h;
      bg.type = Sprite.Type.SLICED;
      bg.sizeMode = Sprite.SizeMode.CUSTOM;
      bg.node.getComponent(UITransform)?.setContentSize(w * f, BTN_SRC_H);
      bg.node.setScale(1 / f, 1 / f, 1);
    } else {
      const g = node.addComponent(Graphics);
      g.fillColor = style === 'disabled' ? rgba(60, 60, 60, 235) : rgba(122, 32, 26, 235);
      g.roundRect(-w / 2, -h / 2, w, h, 6);
      g.fill();
    }
    const label = this.label(node, 'Label', text, 0, 1, Math.min(h * 0.44, 30), style === 'disabled' ? rgba(176, 172, 164) : rgba(255, 240, 206), w * 0.74, HorizontalTextAlignment.CENTER, true);
    label.enableOutline = true;
    label.outlineColor = rgba(50, 10, 8, 255);
    label.outlineWidth = 2;
    if (onTap) {
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, onTap, this);
      this.host.applyImageButtonFeedback(node, 1.04, 0.96);
    }
    return node;
  }

  private rewardRow(parent: Node, rewards: WorldRewardItemVO[], x0: number, y: number, k: number, maxW: number, textColor: Color = BODY, amountOnly = false): void {
    const icon = 54 * k;
    const cell = Math.min(maxW / Math.max(1, rewards.length), 150 * k);
    rewards.slice(0, 4).forEach((reward, index) => {
      const cx = x0 + cell * index + cell / 2;
      const box = this.host.addChildPlainNode(parent, `Reward_${index}`, cx, y + 10 * k, icon + 8 * k, icon + 8 * k);
      const g = box.addComponent(Graphics);
      g.fillColor = rgba(24, 20, 18, 240);
      g.roundRect(-(icon + 8 * k) / 2, -(icon + 8 * k) / 2, icon + 8 * k, icon + 8 * k, 6 * k);
      g.fill();
      g.strokeColor = rgba(150, 118, 66, 220);
      g.lineWidth = Math.max(1, 1.5 * k);
      g.roundRect(-(icon + 8 * k) / 2, -(icon + 8 * k) / 2, icon + 8 * k, icon + 8 * k, 6 * k);
      g.stroke();
      const asset = reward.resourceType === 'PLAYER_EXP' ? null : resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      if (!asset || !this.host.addSprite('Icon', asset, 0, 0, icon, icon, box)) {
        this.label(box, 'Txt', reward.resourceType === 'PLAYER_EXP' ? 'EXP' : (reward.resourceName || '?').slice(0, 2), 0, 0, 20 * k, rgba(140, 230, 140), icon);
      }
      // 窄格(悬赏纸)只写数量:名字 + 数量塞不下会被压成芝麻字,名字看图标 / 点开详情
      this.label(parent, `RewardAmt_${index}`, amountOnly ? `×${reward.amount}` : `${reward.resourceName} ×${reward.amount}`, cx, y - icon / 2 - (amountOnly ? 16 : 12) * k, (amountOnly ? 22 : 17) * k, textColor, cell);
    });
  }

  // ── NPC 对话(原型 p4) ──

  renderDialog(layout: UiLayout): void {
    const state = this.host.currentWorldDialog();
    if (!state) {
      return;
    }
    const world = this.host.currentWorldState();
    const quest = world?.quests.find((item) => item.code === state.questCode) ?? null;
    const k = Math.max(0.7, Math.min(1.25, layout.stageHeight / 860)) * (isPhoneDesign() ? 1.1 : 1);
    const W = layout.stageWidth;
    const H = layout.stageHeight;
    const overlay = this.overlayRoot(LobbyWorldOverlayRenderer.DIALOG, layout, 110, null);
    // 立绘(左下,下半身被对话框挡住)
    const portrait = NPC_PORTRAITS[state.npc];
    const ph = H * 0.78;
    if (portrait) {
      const sprite = this.host.addSprite('Portrait', portrait, -W / 2 + W * 0.17, -H / 2 + ph / 2 + H * 0.02, ph * 0.62, ph, overlay);
      if (sprite) {
        const frame = sprite.spriteFrame;
        const ow = frame?.originalSize.width ?? 1;
        const oh = frame?.originalSize.height ?? 1;
        sprite.node.getComponent(UITransform)?.setContentSize(ph * (ow / Math.max(1, oh)), ph);
      }
    }
    // 底部对话框
    const boxH = H * 0.24;
    const box = this.host.addChildPlainNode(overlay, 'DialogBox', 0, -H / 2 + boxH / 2, W, boxH);
    this.frame(box.addComponent(Graphics), W - 4, boxH, k, rgba(10, 8, 8, 236));
    box.addComponent(BlockInputEvents);
    const plateW = 300 * k;
    const plate = this.host.addChildPlainNode(box, 'NamePlate', -W / 2 + W * 0.06 + plateW / 2, boxH / 2, plateW, 46 * k);
    this.frame(plate.addComponent(Graphics), plateW, 46 * k, k, rgba(30, 14, 12, 250));
    this.label(plate, 'Name', NPC_NAMES[state.npc], 0, 1, 24 * k, GOLD, plateW - 30 * k, HorizontalTextAlignment.CENTER, true);
    const text = this.dialogText(state, quest);
    const textLabel = this.host.addChildLabel(box, 'Text', text, -W / 2 + W * 0.2, -4 * k, 26 * k, BODY, new Size(W * 0.72, boxH * 0.7), HorizontalTextAlignment.LEFT);
    textLabel.overflow = Label.Overflow.SHRINK;
    textLabel.enableWrapText = true;
    textLabel.lineHeight = 36 * k;
    // 对话框点一下 = 关闭(纯对话 / 进行中)
    if (state.mode === 'idle' || state.mode === 'progress') {
      box.addComponent(Button);
      box.on(Button.EventType.CLICK, () => this.host.closeWorldDialog(), this);
      this.label(box, 'Hint', '点击继续 ▼', W / 2 - 110 * k, -boxH / 2 + 26 * k, 18 * k, DIM, 200 * k);
      return;
    }
    // 右侧任务卡
    if (!quest) {
      return;
    }
    const cardW = Math.min(W * 0.34, 560 * k);
    const cardH = H * 0.6;
    const card = this.host.addChildPlainNode(overlay, 'QuestCard', W / 2 - cardW / 2 - W * 0.03, -H / 2 + boxH + cardH / 2 + H * 0.03, cardW, cardH);
    card.addComponent(BlockInputEvents);
    this.frame(card.addComponent(Graphics), cardW, cardH, k);
    const title = state.mode === 'claim' ? `任务完成 · ${quest.name}` : `剧情任务 · ${quest.name}`;
    this.label(card, 'Title', title, 0, cardH / 2 - 44 * k, 30 * k, GOLD, cardW - 40 * k, HorizontalTextAlignment.CENTER, true);
    this.divider(card, cardW, cardH / 2 - 80 * k, k);
    const left = -cardW / 2 + 32 * k;
    this.label(card, 'GoalTitle', '目标', left, cardH / 2 - 112 * k, 22 * k, rgba(226, 204, 160), 120 * k, HorizontalTextAlignment.LEFT, true);
    const done = state.mode === 'claim';
    const box2 = this.host.addChildPlainNode(card, 'Check', left + 14 * k, cardH / 2 - 150 * k, 26 * k, 26 * k).addComponent(Graphics);
    box2.strokeColor = rgba(196, 156, 88, 240);
    box2.lineWidth = 2;
    box2.rect(-12 * k, -12 * k, 24 * k, 24 * k);
    box2.stroke();
    if (done) {
      box2.strokeColor = rgba(120, 220, 120, 255);
      box2.lineWidth = 3;
      box2.moveTo(-8 * k, 0);
      box2.lineTo(-2 * k, -7 * k);
      box2.lineTo(9 * k, 8 * k);
      box2.stroke();
    }
    const progress = quest.objective === 'KILL' || quest.objective === 'COLLECT' || quest.objective === 'GROW'
      ? ` ${Math.min(quest.progress, quest.target)}/${quest.target}` : '';
    this.label(card, 'Goal', `${quest.desc}${progress}`, left + 40 * k, cardH / 2 - 150 * k, 21 * k, BODY, cardW - 90 * k, HorizontalTextAlignment.LEFT);
    this.divider(card, cardW, cardH / 2 - 186 * k, k);
    this.label(card, 'PlaceTitle', '地点', left, cardH / 2 - 216 * k, 22 * k, rgba(226, 204, 160), 100 * k, HorizontalTextAlignment.LEFT, true);
    this.label(card, 'Place', WORLD_MAPS[quest.map as WorldMapCode]?.name ?? quest.map, left + 110 * k, cardH / 2 - 216 * k, 22 * k, BODY, cardW - 160 * k, HorizontalTextAlignment.LEFT);
    this.divider(card, cardW, cardH / 2 - 248 * k, k);
    this.label(card, 'RewardTitle', '奖励', left, cardH / 2 - 278 * k, 22 * k, rgba(226, 204, 160), 100 * k, HorizontalTextAlignment.LEFT, true);
    this.rewardRow(card, quest.rewards, -cardW / 2 + 20 * k, cardH / 2 - 350 * k, k, cardW - 40 * k);
    const btnY = -cardH / 2 + 56 * k;
    const btnW = (cardW - 90 * k) / 2;
    const primaryText = state.busy ? '请稍候…' : state.mode === 'claim' ? '领取奖励' : state.mode === 'grow' ? this.growActionText(quest) : state.mode === 'train' ? '开始训练' : '接受';
    this.button(card, 'Primary', -btnW / 2 - 15 * k, btnY, btnW, 64 * k, primaryText, state.busy ? 'disabled' : 'primary', state.busy ? null : () => this.host.worldDialogPrimary());
    this.button(card, 'Later', btnW / 2 + 15 * k, btnY, btnW, 64 * k, '稍后', 'secondary', () => this.host.closeWorldDialog());
  }

  private divider(parent: Node, w: number, y: number, k: number): void {
    const g = this.host.addChildPlainNode(parent, `Div_${Math.round(y)}`, 0, y, w, 4).addComponent(Graphics);
    g.strokeColor = rgba(150, 118, 66, 210);
    g.lineWidth = Math.max(1, 1.5 * k);
    g.moveTo(-w / 2 + 24 * k, 0);
    g.lineTo(w / 2 - 24 * k, 0);
    g.stroke();
  }

  private growActionText(quest: WorldQuestVO): string {
    return quest.objectiveTarget === 'GACHA_DRAW' ? '前往召唤' : quest.objectiveTarget === 'HERO_LEVEL_UP' ? '打开英雄' : quest.objectiveTarget === 'TEAM_SAVE' ? '前往编队' : '前往';
  }

  private dialogText(state: WorldDialogState, quest: WorldQuestVO | null): string {
    const text = quest ? WORLD_QUEST_TEXT[quest.code] : null;
    if (state.mode === 'claim') {
      return text?.done || `「${quest?.name ?? ''}」完成了,辛苦了。`;
    }
    if (state.mode === 'train') {
      return text?.train || text?.offer || quest?.desc || WORLD_NPC_IDLE[state.npc];
    }
    if (state.mode === 'offer') {
      return text?.offer || quest?.desc || WORLD_NPC_IDLE[state.npc];
    }
    if (state.mode === 'grow' || state.mode === 'progress') {
      return text?.progress || text?.offer || quest?.desc || WORLD_NPC_IDLE[state.npc];
    }
    return WORLD_NPC_IDLE[state.npc];
  }

  // ── 世界地图(原型 p3 B 版 + 世界 / 地区分类) ──

  renderMap(layout: UiLayout): void {
    const state = this.host.currentWorldMapPanel();
    if (!state) {
      return;
    }
    const world = this.host.currentWorldState();
    const current = this.host.currentWorldMapCode();
    const W = layout.stageWidth;
    const H = layout.stageHeight;
    const k = Math.max(0.7, Math.min(1.3, H / 860)) * (isPhoneDesign() ? 1.1 : 1);
    const overlay = this.overlayRoot(LobbyWorldOverlayRenderer.MAP, layout, 255, null);
    const tab = WORLD_TABS[state.tab] ?? WORLD_TABS[0];
    // 底图:等比铺满舞台(cover),裁掉溢出
    const clip = this.host.addChildPlainNode(overlay, 'MapClip', 0, 0, W, H);
    clip.addComponent(Mask);
    const imgAspect = 2400 / 1079;
    const mapW = Math.max(W, H * imgAspect);
    const mapH = mapW / imgAspect;
    const map = this.host.addChildPlainNode(clip, 'Map', 0, 0, mapW, mapH);
    this.host.addSprite('Img', tab.image, 0, 0, mapW, mapH, map);
    map.addComponent(Button);
    map.on(Button.EventType.CLICK, () => this.host.selectWorldMapPoint(null), this);
    if (!tab.open) {
      const fog = this.host.addChildPlainNode(clip, 'Fog', 0, 0, W, H).addComponent(Graphics);
      fog.fillColor = rgba(10, 12, 16, 150);
      fog.rect(-W / 2, -H / 2, W, H);
      fog.fill();
      this.label(clip, 'Locked', `${tab.name} · ${tab.level}`, 0, 40 * k, 46 * k, rgba(220, 220, 230), W * 0.6, HorizontalTextAlignment.CENTER, true);
      this.label(clip, 'LockedSub', '尚未开放 · 后续赛季随等级上限提升开放', 0, -20 * k, 26 * k, rgba(190, 190, 200), W * 0.7);
    } else {
      const points = WORLD1_POINTS;
      for (const point of points) {
        this.renderMapPoint(map, mapW, mapH, point, world, current, state, k);
      }
      const selected = points.find((point) => point.code === state.selected) ?? null;
      if (selected) {
        this.renderMapBubble(map, mapW, mapH, selected, world, current, k);
      }
    }
    // 顶部:返回横幅 + 世界页签;右上关闭
    const bannerH = 68 * k;
    const bannerW = bannerH * (642 / 140);
    const banner = this.host.addChildPlainNode(overlay, 'Back', -W / 2 + 20 * k + bannerW / 2, H / 2 - 16 * k - bannerH / 2, bannerW, bannerH);
    if (!this.host.addSprite('Art', 'ui/raid/back_banner/spriteFrame', 0, 0, bannerW, bannerH, banner)) {
      const g = banner.addComponent(Graphics);
      g.fillColor = rgba(110, 20, 18, 240);
      g.rect(-bannerW / 2, -bannerH / 2, bannerW, bannerH);
      g.fill();
    }
    this.label(banner, 'Title', '世界地图', bannerW * 0.06, 1, 32 * k, rgba(250, 232, 190), bannerW * 0.5, HorizontalTextAlignment.CENTER, true);
    banner.addComponent(Button);
    banner.on(Button.EventType.CLICK, () => this.host.closeWorldMapPanel(), this);
    this.host.applyImageButtonFeedback(banner, 1.03, 0.97);
    const tabW = 230 * k;
    const tabH = 62 * k;
    const tabsX0 = -tabW * (WORLD_TABS.length - 1) / 2;
    WORLD_TABS.forEach((item, index) => {
      const on = index === state.tab;
      const node = this.host.addChildPlainNode(overlay, `Tab_${index}`, tabsX0 + index * (tabW + 12 * k), H / 2 - 16 * k - tabH / 2, tabW, tabH);
      this.frame(node.addComponent(Graphics), tabW, tabH, k, on ? rgba(60, 22, 16, 245) : rgba(12, 10, 10, 220));
      this.label(node, 'Name', item.name, 0, 10 * k, 24 * k, on ? GOLD : item.open ? BODY : DIM, tabW - 20 * k, HorizontalTextAlignment.CENTER, true);
      this.label(node, 'Level', item.open ? item.level : `${item.level} · 未开放`, 0, -16 * k, 17 * k, item.open ? rgba(200, 190, 170) : DIM, tabW - 20 * k);
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => this.host.selectWorldMapTab(index), this);
      this.host.applyImageButtonFeedback(node, 1.03, 0.97);
    });
    const close = this.host.addChildPlainNode(overlay, 'Close', W / 2 - 52 * k, H / 2 - 52 * k, 72 * k, 72 * k);
    const cg = close.addComponent(Graphics);
    cg.fillColor = rgba(14, 10, 10, 230);
    cg.circle(0, 0, 32 * k);
    cg.fill();
    cg.strokeColor = rgba(214, 170, 92, 240);
    cg.lineWidth = Math.max(2, 2.5 * k);
    cg.circle(0, 0, 32 * k);
    cg.stroke();
    cg.moveTo(-12 * k, -12 * k);
    cg.lineTo(12 * k, 12 * k);
    cg.moveTo(-12 * k, 12 * k);
    cg.lineTo(12 * k, -12 * k);
    cg.stroke();
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeWorldMapPanel(), this);
    // 底部地区标签
    if (tab.open) {
      const chipW = 170 * k;
      const chipH = 52 * k;
      const chipsX0 = -(chipW + 12 * k) * (WORLD_REGIONS.length - 1) / 2;
      WORLD_REGIONS.forEach((region, index) => {
        const on = state.region === region.key;
        const node = this.host.addChildPlainNode(overlay, `Region_${region.key}`, chipsX0 + index * (chipW + 12 * k), -H / 2 + 26 * k + chipH / 2, chipW, chipH);
        this.frame(node.addComponent(Graphics), chipW, chipH, k, on ? rgba(60, 22, 16, 245) : rgba(12, 10, 10, 210));
        this.label(node, 'Name', region.name, 0, 1, 22 * k, on ? GOLD : BODY, chipW - 16 * k, HorizontalTextAlignment.CENTER, true);
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.selectWorldMapRegion(on ? null : region.key), this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      });
    }
  }

  private pointStatus(point: WorldPoint, world: WorldStateVO | null, current: WorldMapCode): { unlocked: boolean; activated: boolean; reason: string; isCurrent: boolean } {
    if (point.future) {
      return { unlocked: false, activated: false, reason: `Lv.${point.future} 开放`, isCurrent: false };
    }
    const map = world?.maps.find((item) => item.mapCode === point.code);
    return {
      unlocked: !!map?.unlocked,
      activated: !!map?.activated,
      reason: map?.lockReason || (map ? '' : '未开放'),
      isCurrent: current === point.code,
    };
  }

  private renderMapPoint(map: Node, mapW: number, mapH: number, point: WorldPoint, world: WorldStateVO | null, current: WorldMapCode, state: WorldMapPanelState, k: number): void {
    const status = this.pointStatus(point, world, current);
    const x = -mapW / 2 + point.x * mapW;
    const y = mapH / 2 - point.y * mapH;
    const node = this.host.addChildPlainNode(map, `Point_${point.code}`, x, y, 150 * k, 150 * k);
    const dimmed = !!state.region && state.region !== point.region;
    if (dimmed) {
      node.addComponent(UIOpacity).opacity = 90;
    }
    const icon = 92 * k;
    const g = node.addComponent(Graphics);
    if (state.selected === point.code) {
      g.strokeColor = rgba(255, 214, 110, 240);
      g.lineWidth = 4 * k;
      g.ellipse(0, 0, icon * 0.78, icon * 0.46);
      g.stroke();
    }
    const sprite = this.host.addSprite('Icon', worldAsset('waypoint'), 0, 6 * k, icon, icon * 0.63, node);
    if (sprite && !status.activated) {
      sprite.grayscale = true;
    }
    if (status.activated && status.unlocked) {
      g.fillColor = rgba(90, 180, 255, 60);
      g.ellipse(0, 4 * k, icon * 0.5, icon * 0.24);
      g.fill();
    }
    const plateW = 190 * k;
    const plate = this.host.addChildPlainNode(node, 'Plate', 0, -icon * 0.48, plateW, 40 * k);
    this.frame(plate.addComponent(Graphics), plateW, 40 * k, k * 0.8, rgba(14, 10, 10, 230));
    const locked = !status.unlocked;
    this.label(plate, 'Name', point.name, 0, 1, 21 * k, locked ? DIM : GOLD, plateW - 14 * k, HorizontalTextAlignment.CENTER, true);
    const sub = status.isCurrent ? '当前位置' : locked ? status.reason : status.activated ? point.level : `${point.level} · 未激活`;
    if (sub) {
      const subLabel = this.label(node, 'Sub', sub, 0, -icon * 0.48 - 34 * k, 18 * k, status.isCurrent ? rgba(150, 235, 150) : locked ? rgba(210, 205, 196) : rgba(250, 236, 200), plateW + 60 * k, HorizontalTextAlignment.CENTER, true);
      subLabel.enableOutline = true;
      subLabel.outlineColor = rgba(8, 6, 4, 255);
      subLabel.outlineWidth = Math.max(2, 2.5 * k);
    }
    if (status.isCurrent) {
      const pin = this.host.addChildPlainNode(node, 'Pin', 0, icon * 0.62, 40 * k, 50 * k).addComponent(Graphics);
      pin.fillColor = rgba(200, 40, 36, 245);
      pin.circle(0, 8 * k, 14 * k);
      pin.fill();
      pin.moveTo(-10 * k, 0);
      pin.lineTo(10 * k, 0);
      pin.lineTo(0, -18 * k);
      pin.close();
      pin.fill();
    }
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.selectWorldMapPoint(point.code), this);
    this.host.applyImageButtonFeedback(node, 1.05, 0.96);
  }

  private renderMapBubble(map: Node, mapW: number, mapH: number, point: WorldPoint, world: WorldStateVO | null, current: WorldMapCode, k: number): void {
    const status = this.pointStatus(point, world, current);
    const bw = 380 * k;
    const bh = 330 * k;
    const px = -mapW / 2 + point.x * mapW;
    const py = mapH / 2 - point.y * mapH;
    const toRight = point.x < 0.62;
    const node = this.host.addChildPlainNode(map, 'Bubble', px + (toRight ? 1 : -1) * (bw / 2 + 90 * k), Math.max(-mapH / 2 + bh / 2 + 80 * k, Math.min(mapH / 2 - bh / 2 - 90 * k, py)), bw, bh);
    node.addComponent(BlockInputEvents);
    this.frame(node.addComponent(Graphics), bw, bh, k);
    this.label(node, 'Title', point.name, 0, bh / 2 - 38 * k, 32 * k, GOLD, bw - 40 * k, HorizontalTextAlignment.CENTER, true);
    this.label(node, 'Level', point.level ? `推荐等级 ${point.level.replace('Lv.', '')}` : '主城 · 功能与委托中心', 0, bh / 2 - 74 * k, 20 * k, BODY, bw - 40 * k);
    this.divider(node, bw, bh / 2 - 96 * k, k);
    const def = WORLD_MAPS[point.code as WorldMapCode];
    const monsters = def ? Array.from(new Set(def.camps.map((camp) => camp.monsterCode))).slice(0, 4) : [];
    const avatar = 64 * k;
    monsters.forEach((code, index) => {
      const cx = (index - (monsters.length - 1) / 2) * (avatar + 14 * k);
      const holder = this.host.addChildPlainNode(node, `Mon_${index}`, cx, bh / 2 - 140 * k, avatar, avatar);
      const g = holder.addComponent(Graphics);
      g.fillColor = rgba(28, 24, 22, 255);
      g.circle(0, 0, avatar / 2);
      g.fill();
      const clip = this.host.addChildPlainNode(holder, 'Clip', 0, 0, avatar - 6 * k, avatar - 6 * k);
      clip.addComponent(Mask);
      this.host.addSprite('Img', `monster/${code.toLowerCase()}/spriteFrame`, 0, -avatar * 0.02, avatar * 1.05, avatar * 1.05, clip);
      const ring = this.host.addChildPlainNode(holder, 'Ring', 0, 0, avatar, avatar).addComponent(Graphics);
      ring.strokeColor = rgba(196, 154, 86, 240);
      ring.lineWidth = Math.max(1.5, 2 * k);
      ring.circle(0, 0, avatar / 2);
      ring.stroke();
    });
    if (monsters.length === 0) {
      this.label(node, 'NoMon', point.code === 'CITY' || point.code === 'VILLAGE' ? '安全区 · 没有怪物' : '—', 0, bh / 2 - 140 * k, 20 * k, DIM, bw - 40 * k);
    }
    const quest = world?.quests.find((item) => item.map === point.code && (item.state === 'ACCEPTED' || item.state === 'AVAILABLE'));
    if (quest) {
      this.label(node, 'Quest', `剧情任务「${quest.name}」在此`, 0, bh / 2 - 196 * k, 19 * k, rgba(255, 214, 120), bw - 30 * k);
    }
    const canGo = status.unlocked && status.activated && !status.isCurrent;
    const text = status.isCurrent ? '当前所在' : !status.unlocked ? status.reason || '未开放' : status.activated ? '传送' : '未激活 · 需亲自前往';
    this.button(node, 'Go', 0, -bh / 2 + 66 * k, bw - 70 * k, 66 * k, text, canGo ? 'primary' : 'disabled', canGo ? () => this.host.teleportWorldMap(point.code as WorldMapCode) : null);
    this.label(node, 'Note', canGo ? (this.host.worldTeleportNote?.() ?? '免费 · 读条 5 秒') : '', 0, -bh / 2 + 22 * k, 17 * k, DIM, bw - 40 * k);
  }

  // ── 佣兵公会悬赏(原型 p5) ──

  renderBounty(layout: UiLayout): void {
    const state = this.host.currentWorldBountyPanel();
    if (!state) {
      return;
    }
    const world = this.host.currentWorldState();
    const bounties = world?.bounties ?? [];
    const W = layout.stageWidth;
    const H = layout.stageHeight;
    const k = Math.max(0.7, Math.min(1.3, H / 860)) * (isPhoneDesign() ? 1.08 : 1);
    const overlay = this.overlayRoot(LobbyWorldOverlayRenderer.BOUNTY, layout, 250, null);
    const bg = this.host.addChildPlainNode(overlay, 'Wall', 0, -10 * k, W, H).addComponent(Graphics);
    bg.fillColor = rgba(34, 24, 18, 255);
    bg.rect(-W / 2, -H / 2, W, H);
    bg.fill();
    for (let i = 0; i < 9; i += 1) {
      bg.fillColor = i % 2 === 0 ? rgba(44, 31, 22, 255) : rgba(38, 27, 19, 255);
      bg.rect(-W / 2, -H / 2 + (H / 9) * i, W, H / 9 - 2);
      bg.fill();
    }
    // 顶部
    const bannerH = 68 * k;
    const bannerW = bannerH * (642 / 140);
    const banner = this.host.addChildPlainNode(overlay, 'Back', -W / 2 + 20 * k + bannerW / 2, H / 2 - 16 * k - bannerH / 2, bannerW, bannerH);
    this.host.addSprite('Art', 'ui/raid/back_banner/spriteFrame', 0, 0, bannerW, bannerH, banner);
    this.label(banner, 'Title', '佣兵公会', bannerW * 0.06, 1, 32 * k, rgba(250, 232, 190), bannerW * 0.5, HorizontalTextAlignment.CENTER, true);
    banner.addComponent(Button);
    banner.on(Button.EventType.CLICK, () => this.host.closeWorldBountyPanel(), this);
    const doneCount = bounties.filter((item) => item.state === 'CLAIMED').length;
    const now = new Date();
    const left = Math.max(0, Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()) / 1000));
    const hh = String(Math.floor(left / 3600)).padStart(2, '0');
    const mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
    this.label(overlay, 'Head', `今日悬赏 ${doneCount}/${bounties.length} 已完成 · ${hh}:${mm} 后刷新`, 0, H / 2 - 16 * k - bannerH / 2, 24 * k, BODY, W * 0.5);
    const daily = this.button(overlay, 'Daily', W / 2 - 220 * k, H / 2 - 16 * k - bannerH / 2, 190 * k, 54 * k, '日常任务', 'secondary', () => this.host.openLobbyQuestPanel?.());
    void daily;
    const close = this.host.addChildPlainNode(overlay, 'Close', W / 2 - 52 * k, H / 2 - 52 * k, 72 * k, 72 * k);
    const cg = close.addComponent(Graphics);
    cg.fillColor = rgba(14, 10, 10, 230);
    cg.circle(0, 0, 32 * k);
    cg.fill();
    cg.strokeColor = rgba(214, 170, 92, 240);
    cg.lineWidth = Math.max(2, 2.5 * k);
    cg.circle(0, 0, 32 * k);
    cg.stroke();
    cg.moveTo(-12 * k, -12 * k);
    cg.lineTo(12 * k, 12 * k);
    cg.moveTo(-12 * k, 12 * k);
    cg.lineTo(12 * k, -12 * k);
    cg.stroke();
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeWorldBountyPanel(), this);
    if (bounties.length === 0) {
      this.label(overlay, 'Empty', '到主城后,佣兵公会每天会贴出 3 张悬赏。', 0, 0, 28 * k, BODY, W * 0.7);
      return;
    }
    const cardH = H * 0.74;
    const cardW = Math.min(cardH * 0.64, (W - 120 * k) / 3);
    const gap = Math.min(40 * k, (W - cardW * 3) / 4);
    bounties.slice(0, 3).forEach((bounty, index) => {
      const cx = (index - 1) * (cardW + gap);
      this.renderBountyCard(overlay, bounty, cx, -30 * k, cardW, cardH, k, state.busy);
    });
  }

  private renderBountyCard(parent: Node, bounty: WorldBountyVO, x: number, y: number, w: number, h: number, k: number, busy: boolean): void {
    const card = this.host.addChildPlainNode(parent, `Bounty_${bounty.slot}`, x, y, w, h);
    if (!this.host.addSprite('Paper', worldAsset('ui_bounty_paper'), 0, 0, w, h, card)) {
      const g = card.addComponent(Graphics);
      g.fillColor = rgba(214, 196, 160, 255);
      g.rect(-w / 2, -h / 2, w, h);
      g.fill();
    }
    const ink = rgba(70, 40, 24);
    const red = rgba(140, 28, 20);
    this.label(card, 'Title', bounty.name, -16 * k, h / 2 - 64 * k, 32 * k, red, w - 140 * k, HorizontalTextAlignment.CENTER, true);
    // 难度印章
    const stamp = this.host.addChildPlainNode(card, 'Stamp', w / 2 - 60 * k, h / 2 - 64 * k, 60 * k, 60 * k).addComponent(Graphics);
    const stampColor = bounty.difficulty === '难' ? rgba(160, 30, 24, 230) : bounty.difficulty === '中' ? rgba(170, 110, 30, 230) : rgba(50, 110, 50, 230);
    stamp.strokeColor = stampColor;
    stamp.lineWidth = 3 * k;
    stamp.circle(0, 0, 26 * k);
    stamp.stroke();
    stamp.circle(0, 0, 21 * k);
    stamp.stroke();
    this.label(card, 'Diff', bounty.difficulty, w / 2 - 60 * k, h / 2 - 64 * k, 26 * k, stampColor, 50 * k, HorizontalTextAlignment.CENTER, true);
    // 怪物插画(立绘)
    const artH = h * 0.29;
    const art = this.host.addChildPlainNode(card, 'ArtClip', 0, h / 2 - 110 * k - artH / 2, w - 70 * k, artH);
    art.addComponent(Mask);
    const sprite = this.host.addSprite('Art', `monster/${bounty.monsterCode.toLowerCase()}/spriteFrame`, 0, 0, artH * 1.1, artH * 1.1, art);
    if (sprite) {
      sprite.color = rgba(200, 180, 150, 255);
    }
    const lineY = h / 2 - 120 * k - artH;
    const target = `目标:${bounty.desc}  ${Math.min(bounty.progress, bounty.target)}/${bounty.target}`;
    this.label(card, 'Goal', target, 0, lineY - 20 * k, 21 * k, ink, w - 70 * k);
    this.label(card, 'Place', `地点:${WORLD_MAPS[bounty.map as WorldMapCode]?.name ?? bounty.map}`, 0, lineY - 56 * k, 20 * k, ink, w - 70 * k);
    this.label(card, 'RewardTitle', '奖励', -w / 2 + 60 * k, lineY - 92 * k, 20 * k, ink, 80 * k, HorizontalTextAlignment.CENTER, true);
    const rewardBox = this.host.addChildPlainNode(card, 'Rewards', 0, lineY - 140 * k, w - 60 * k, 100 * k);
    // 羊皮纸上用深色墨字(浅色字看不清);数量行与按钮留出间距(2026-10-27 UI 审核:数量被「接取」按钮盖住)
    this.rewardRow(rewardBox, bounty.rewards, -(w - 60 * k) / 2, 0, k * 0.9, w - 60 * k, rgba(70, 40, 24), true);
    const btnY = -h / 2 + 62 * k;
    const btnW = w * 0.58;
    if (bounty.state === 'OPEN') {
      this.button(card, 'Btn', 0, btnY, btnW, 54 * k, busy ? '请稍候…' : '接取', busy ? 'disabled' : 'primary', busy ? null : () => this.host.acceptWorldBounty(bounty.slot));
    } else if (bounty.state === 'DONE') {
      this.button(card, 'Btn', 0, btnY, btnW, 54 * k, busy ? '请稍候…' : '领取奖励', busy ? 'disabled' : 'primary', busy ? null : () => this.host.claimWorldBounty(bounty.slot));
    } else {
      this.button(card, 'Btn', 0, btnY, btnW, 54 * k, bounty.state === 'CLAIMED' ? '已完成' : '进行中', 'disabled', null);
    }
  }
}
