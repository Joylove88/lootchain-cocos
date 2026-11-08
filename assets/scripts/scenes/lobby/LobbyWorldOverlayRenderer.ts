import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { WorldBountyVO, WorldMapCode, WorldQuestVO, WorldStateVO } from '../../types/WorldTypes';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { WORLD_MAPS, WORLD_NPC_SERVICE, worldAsset, type WorldNpcCode, type WorldNpcService } from './LobbyWorldMaps';
import { WORLD_NPC_CHATTER, WORLD_NPC_IDLE, WORLD_QUEST_TEXT } from './WorldStoryText';
import type { UiKitHost } from '../UiKit';
import { GLASS_COLOR, GLASS_ICON, glassLabel, glassProtoMap, mountGlassButton, mountGlassFrame, mountGlassLine, mountGlassPanel, mountGlassSectionHeader, mountGlassTopBar } from '../UiGlassKit';

/** 佣兵公会背景(11-06 原型 world_bounty_b 去界面扩图)。 */
const GUILD_BG_ASSET = worldAsset('guild_bg_b');

/** NPC 对话(原型 p4)。mode:offer 接任务 / claim 交任务 / grow 养成类去做 / train 训练场开战 / progress 进行中 / idle 闲聊。 */
export interface WorldDialogState {
  npc: WorldNpcCode;
  mode: 'offer' | 'claim' | 'grow' | 'train' | 'progress' | 'idle';
  questCode: string;
  busy: boolean;
  /** 闲聊第几句(WORLD_NPC_CHATTER 轮换);酒馆传闻的正文。 */
  line?: number;
  rumor?: string;
}

/** 世界地图(原型 p3 B 版):tab = 世界页签;selected = 选中的传送阵;region = 地区筛选。 */
export interface WorldMapPanelState {
  tab: number;
  selected: string | null;
  region: string | null;
  /** 10-30 地图页:area = 当前图鸟瞰(点小地图打开)/ world = 世界地图。 */
  view?: 'area' | 'world';
  /** 鸟瞰图上点出来的目的地(世界坐标)。 */
  dest?: { x: number; y: number; label: string } | null;
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
  /** NPC 服务按钮(商店 / 悬赏 / 再听一个传闻)。 */
  worldDialogService?(service: WorldNpcService): void;
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
  SCHOLAR: '帝国学者 · 艾德里安',
  GUILDMASTER: '公会会长 · 维克',
  CAPTAIN: '卫队长 · 罗兰',
  MERCHANT: '杂货商 · 托比',
  INNKEEPER: '酒馆老板 · 巴克',
  BARD: '吟游诗人 · 林恩',
  FLOWER_GIRL: '卖花姑娘 · 艾米',
  OLD_MAN: '老镇民 · 霍克',
  CHILD: '小汤姆',
  VENDOR: '果摊大婶 · 玛莎',
  GUARD_S: '城门卫兵',
  GUARD_E: '城门卫兵',
  WANDERER: '流浪者首领 · 葛兰',
};
const CITY_NPC = (name: string): string => worldAsset(`city4/city4_${name}`);
const NPC_PORTRAITS: Partial<Record<WorldNpcCode, string>> = {
  CHIEF: worldAsset('portrait_chief'),
  INSTRUCTOR: worldAsset('npc_instructor'),
  PRIEST: worldAsset('npc_priest'),
  SMITH: worldAsset('npc_smith'),
  BOARD: CITY_NPC('notice_board'),
  SCHOLAR: CITY_NPC('npc_scholar'),
  GUILDMASTER: CITY_NPC('npc_guildmaster'),
  CAPTAIN: CITY_NPC('npc_captain'),
  MERCHANT: CITY_NPC('npc_merchant'),
  INNKEEPER: CITY_NPC('npc_innkeeper'),
  BARD: CITY_NPC('npc_bard'),
  FLOWER_GIRL: CITY_NPC('npc_flower_girl'),
  OLD_MAN: CITY_NPC('npc_old_man'),
  CHILD: CITY_NPC('npc_child'),
  VENDOR: CITY_NPC('npc_vendor'),
  GUARD_S: CITY_NPC('npc_guard'),
  GUARD_E: CITY_NPC('npc_guard'),
  WANDERER: CITY_NPC('npc_wanderer'),
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

export interface WorldPoint {
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
export const WORLD1_POINTS: readonly WorldPoint[] = [
  { code: 'VILLAGE', name: '晨风村', level: 'Lv.1-10', x: 0.19, y: 0.74, region: 'NOVICE' },
  { code: 'WOODS', name: '村外林地', level: 'Lv.1-10', x: 0.29, y: 0.62, region: 'NOVICE' },
  { code: 'CITY', name: '主城', level: '', x: 0.37, y: 0.36, region: 'CENTRAL' },
  { code: 'GRAY', name: '灰岩荒原', level: 'Lv.10-20', x: 0.56, y: 0.58, region: 'CENTRAL' },
  { code: 'DEADWOOD', name: '枯木林', level: 'Lv.20-30', x: 0.76, y: 0.38, region: 'CENTRAL' },
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

  // ── NPC 对话(11-07 B 风格,原型 周报截图/2026-11-07_剧情对话B/proto/story_dialog_b2.png,1870×841 坐标) ──

  renderDialog(layout: UiLayout): void {
    const state = this.host.currentWorldDialog();
    if (!state) {
      return;
    }
    const world = this.host.currentWorldState();
    const quest = world?.quests.find((item) => item.code === state.questCode) ?? null;
    const W = layout.stageWidth;
    const H = layout.stageHeight;
    const { k, LX, RX, FY, S } = glassProtoMap(W, H);
    const kit = this.host as unknown as UiKitHost;
    const overlay = this.overlayRoot(LobbyWorldOverlayRenderer.DIALOG, layout, 90, null);
    // 立绘:左侧站立,下半身压在台词条下(原型头顶 y≈140、中心 x≈300)
    const portrait = NPC_PORTRAITS[state.npc];
    const ph = S(720);
    if (portrait) {
      const sprite = this.host.addSprite('Portrait', portrait, LX(300), -H / 2 + ph / 2 + S(10), ph * 0.62, ph, overlay);
      if (sprite) {
        const frame = sprite.spriteFrame;
        const ow = frame?.originalSize.width ?? 1;
        const oh = frame?.originalSize.height ?? 1;
        sprite.node.getComponent(UITransform)?.setContentSize(ph * (ow / Math.max(1, oh)), ph);
      }
    }
    // 底部台词条:整宽冷炭灰玻璃(原型 y 660~841),上沿渐隐 + 淡白细线;向下多铺一截盖住挖孔 / 安全区
    const stripH = S(181);
    const fullW = layout.width;
    const stripY = -H / 2 + stripH / 2;
    const strip = this.host.addChildPlainNode(overlay, 'DialogBox', 0, stripY, fullW, stripH);
    strip.addComponent(BlockInputEvents);
    const sg = strip.addComponent(Graphics);
    sg.fillColor = new Color(22, 26, 33, 236);
    sg.rect(-fullW / 2, -stripH / 2 - S(80), fullW, stripH + S(80));
    sg.fill();
    for (let i = 0; i < 6; i += 1) {
      sg.fillColor = new Color(22, 26, 33, Math.round(200 - i * 32));
      sg.rect(-fullW / 2, stripH / 2 + S(3) * i, fullW, S(3));
      sg.fill();
    }
    mountGlassLine(kit, strip, 'TopLine', 0, stripH / 2, fullW, Math.max(1, S(1.2)), new Color(255, 255, 255, 30));
    // 名字胶囊(原型 x 75~347、y 630~686):竖条 + 香槟名字,压在台词条上沿
    const plateW = S(272);
    const plateH = S(56);
    const plate = this.host.addChildPlainNode(overlay, 'NamePlate', LX(211), FY(658), plateW, plateH);
    const pg = plate.addComponent(Graphics);
    pg.fillColor = new Color(29, 33, 40, 245);
    pg.roundRect(-plateW / 2, -plateH / 2, plateW, plateH, plateH / 2);
    pg.fill();
    pg.strokeColor = new Color(255, 255, 255, 40);
    pg.lineWidth = Math.max(1, S(1.4));
    pg.roundRect(-plateW / 2, -plateH / 2, plateW, plateH, plateH / 2);
    pg.stroke();
    this.host.addSprite('Bar', GLASS_ICON.accent, S(112 - 211), 0, S(6), S(30), plate);
    this.glassText(plate, 'Name', NPC_NAMES[state.npc], S(136 - 211), 0, 30, GLASS_COLOR.champagne, S(200), k, HorizontalTextAlignment.LEFT, true);
    // 台词(原型 x 323 起,两行 y 722 / 767,字 28)
    const textW = Math.min(S(1420), W / 2 - LX(323) - S(60));
    const textLabel = this.host.addChildLabel(strip, 'Text', this.dialogText(state, quest), LX(323), FY(744) - stripY, Math.max(14, Math.round(28 * k)), GLASS_COLOR.text, new Size(textW, S(110)), HorizontalTextAlignment.LEFT);
    textLabel.overflow = Label.Overflow.SHRINK;
    textLabel.enableWrapText = true;
    textLabel.lineHeight = Math.round(45 * k);
    // 纯对话 / 进行中:点台词条关闭
    if (state.mode === 'idle' || state.mode === 'progress' || !quest) {
      const service = state.mode === 'idle' ? WORLD_NPC_SERVICE[state.npc] : undefined;
      if (service && this.host.worldDialogService) {
        // 11-08 主城 NPC 服务:台词条右侧主按钮(商店 / 悬赏 / 再听一个)+ 离开
        const label = service === 'shop' ? '看看货' : service === 'bounty' ? '查看悬赏' : '再听一个';
        mountGlassButton(kit, strip, 'Service', label, RX(1520), FY(744) - stripY, S(230), S(60), k, 'primary', () => this.host.worldDialogService!(service), 24);
        mountGlassButton(kit, strip, 'Leave', '离开', RX(1770), FY(744) - stripY, S(200), S(60), k, 'secondary', () => this.host.closeWorldDialog(), 24);
        return;
      }
      strip.addComponent(Button);
      strip.on(Button.EventType.CLICK, () => this.host.closeWorldDialog(), this);
      this.glassText(strip, 'Hint', '点击继续 ›', RX(1822), FY(790) - stripY, 20, GLASS_COLOR.dim, S(200), k, HorizontalTextAlignment.RIGHT);
      return;
    }
    // 右侧任务卡(原型 x 1187~1843、y 88~632)
    const cardW = S(656);
    const cardH = S(544);
    const card = mountGlassPanel(kit, overlay, 'QuestCard', RX(1515), FY(360), cardW, cardH, k);
    card.addComponent(BlockInputEvents);
    const CX = (px: number): number => (px - 1515) * k;
    const CY = (py: number): number => (360 - py) * k;
    const title = state.mode === 'claim' ? `任务完成 · ${quest.name}` : `剧情任务 · ${quest.name}`;
    this.host.addSprite('TitleBar', GLASS_ICON.accent, CX(1229), CY(128), S(6), S(34), card);
    this.glassText(card, 'Title', title, CX(1257), CY(128), 34, GLASS_COLOR.text, S(540), k, HorizontalTextAlignment.LEFT, true);
    const lineColor = new Color(255, 255, 255, 30);
    mountGlassLine(kit, card, 'Div0', CX(1515), CY(166), S(580), Math.max(1, S(1.2)), lineColor);
    this.glassText(card, 'GoalTitle', '目标', CX(1226), CY(199), 22, GLASS_COLOR.sub, S(120), k);
    const done = state.mode === 'claim';
    const check = this.host.addChildPlainNode(card, 'Check', CX(1241), CY(240), S(32), S(32)).addComponent(Graphics);
    check.strokeColor = done ? GLASS_COLOR.green : new Color(226, 228, 234, 200);
    check.lineWidth = Math.max(1.2, S(2));
    check.roundRect(-S(14), -S(14), S(28), S(28), S(6));
    check.stroke();
    if (done) {
      check.lineWidth = Math.max(2, S(3));
      check.moveTo(-S(8), 0);
      check.lineTo(-S(2), -S(7));
      check.lineTo(S(9), S(8));
      check.stroke();
    }
    const counted = quest.objective === 'KILL' || quest.objective === 'COLLECT' || quest.objective === 'GROW';
    this.glassText(card, 'Goal', quest.desc, CX(1276), CY(240), 22, GLASS_COLOR.text, S(counted ? 440 : 520), k);
    if (counted) {
      const cur = Math.min(quest.progress, quest.target);
      this.glassText(card, 'GoalProgress', `${cur}/${quest.target}`, CX(1806), CY(240), 24, cur >= quest.target ? GLASS_COLOR.green : GLASS_COLOR.champagne, S(90), k, HorizontalTextAlignment.RIGHT, true);
    }
    mountGlassLine(kit, card, 'Div1', CX(1515), CY(276), S(580), Math.max(1, S(1.2)), lineColor);
    this.glassText(card, 'PlaceTitle', '地点', CX(1226), CY(308), 22, GLASS_COLOR.sub, S(100), k);
    this.glassText(card, 'Place', WORLD_MAPS[quest.map as WorldMapCode]?.name ?? quest.map, CX(1348), CY(308), 22, GLASS_COLOR.text, S(440), k);
    mountGlassLine(kit, card, 'Div2', CX(1515), CY(338), S(580), Math.max(1, S(1.2)), lineColor);
    this.glassText(card, 'RewardTitle', '奖励', CX(1226), CY(368), 22, GLASS_COLOR.sub, S(100), k);
    // 奖励格(原型 76×76,中心 x 1317 起每格 174,y 429;名字 × 数量 y 485)
    quest.rewards.slice(0, 3).forEach((reward, index) => {
      const rx = CX(1317 + index * 174);
      const cell = mountGlassFrame(kit, card, `Reward_${index}`, rx, CY(429), S(78), S(76), k);
      const asset = reward.resourceType === 'PLAYER_EXP' ? null : resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      if (!asset || !this.host.addSprite('Icon', asset, 0, 0, S(58), S(58), cell)) {
        const isExp = reward.resourceType === 'PLAYER_EXP';
        this.glassText(cell, 'Txt', isExp ? 'EXP' : (reward.resourceName || '?').slice(0, 2), 0, 0, 24, GLASS_COLOR.text, S(70), k, HorizontalTextAlignment.CENTER, isExp);
      }
      this.glassText(card, `RewardAmt_${index}`, `${reward.resourceName} ×${reward.amount}`, rx, CY(485), 20, GLASS_COLOR.text, S(168), k, HorizontalTextAlignment.CENTER);
    });
    // 按钮(原型 y 562 高 64;主 1226~1503 / 次 1535~1812)
    const primaryText = state.busy ? '请稍候…' : state.mode === 'claim' ? '领取奖励' : state.mode === 'grow' ? this.growActionText(quest) : state.mode === 'train' ? '开始训练' : '接受';
    mountGlassButton(kit, card, 'Primary', primaryText, CX(1364.5), CY(562), S(277), S(64), k, state.busy ? 'primaryOff' : 'primary', state.busy ? undefined : () => this.host.worldDialogPrimary(), 26);
    mountGlassButton(kit, card, 'Later', '稍后', CX(1673.5), CY(562), S(277), S(64), k, 'secondary', () => this.host.closeWorldDialog(), 26);
  }

  // 世界地图气泡仍用的红金按钮 / 分隔线
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
    if (state.rumor) {
      return state.rumor;
    }
    const chatter = WORLD_NPC_CHATTER[state.npc];
    return chatter?.length ? chatter[(state.line ?? 0) % chatter.length] : WORLD_NPC_IDLE[state.npc];
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

  // ── 佣兵公会悬赏(11-06 B 毛玻璃,原型 周报截图/2026-11-01_B风格补全/proto/world_bounty_b.png,1870×841) ──
  //
  // 顶栏 y 44:‹ 佣兵公会 / 中间今日进度 / 日常任务(次按钮 1525..1703)+ 竖线 1746 + ✕;
  // 三张玻璃卡 197..668 / 703..1173 / 1207..1677 × 118..778(宽 471 高 660,间距 35);卡内:标题 + 难度胶囊 y 158、怪物插画 175..440、
  // 目标 456 / 地点 490、分隔线 519、「奖励」分区 545、奖励格 88×84 @ 612(3 个间距 130 / 2 个 154)、数量 670、按钮 224..640 × 700..760。
  // 用户 11-06 拍板「接取」三张卡平级 → 一律次按钮(同真人矿对手卡),不给主按钮。

  renderBounty(layout: UiLayout): void {
    const state = this.host.currentWorldBountyPanel();
    if (!state) {
      return;
    }
    const world = this.host.currentWorldState();
    const bounties = world?.bounties ?? [];
    const W = layout.stageWidth;
    const H = layout.stageHeight;
    const { k, RX, FX, FY, S } = glassProtoMap(W, H);
    const kit = this.host as unknown as UiKitHost;
    const overlay = this.overlayRoot(LobbyWorldOverlayRenderer.BOUNTY, layout, 255, null);
    // 背景 = 原型去掉界面的公会大厅(guild_bg_b,3:2,亮度按原型露出处校过),铺满整屏含挖孔区
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const bgScale = Math.max((layout.width + Math.abs(cx) * 2) / 1536, (layout.height + Math.abs(cy) * 2) / 1024);
    this.host.addSprite('GuildBg', GUILD_BG_ASSET, 0, 0, 1536 * bgScale, 1024 * bgScale, overlay);
    const close = (): void => this.host.closeWorldBountyPanel();
    mountGlassTopBar(kit, overlay, 'LobbyWorldBounty', W, H, '佣兵公会', [], close, close, { y: 44 });
    const doneCount = bounties.filter((item) => item.state === 'CLAIMED').length;
    const now = new Date();
    const left = Math.max(0, Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()) / 1000));
    const hh = String(Math.floor(left / 3600)).padStart(2, '0');
    const mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
    this.glassText(overlay, 'Head', `今日悬赏 ${doneCount}/${bounties.length} 已完成 · ${hh}:${mm} 后刷新`, FX(935), FY(47), 24, GLASS_COLOR.sub, S(760), k, HorizontalTextAlignment.CENTER);
    if (this.host.openLobbyQuestPanel) {
      mountGlassButton(kit, overlay, 'Daily', '日常任务', RX(1614), FY(46), S(178), S(50), k, 'secondary', () => this.host.openLobbyQuestPanel?.(), 24);
      // 竖分隔线(原型 1746;贴图版在手机上太淡,改实线同标题分隔色)
      mountGlassLine(kit, overlay, 'DailyDivider', RX(1746), FY(44), Math.max(1, S(2)), S(38), new Color(120, 128, 140, 200));
    }
    if (bounties.length === 0) {
      this.glassText(overlay, 'Empty', '到主城后,佣兵公会每天会贴出 3 张悬赏。', FX(935), FY(430), 28, GLASS_COLOR.sub, S(1200), k, HorizontalTextAlignment.CENTER);
      return;
    }
    const centers = [432.5, 938, 1442];
    bounties.slice(0, 3).forEach((bounty, index) => {
      this.renderBountyCard(overlay, bounty, FX(centers[index]), FY(448), k, state.busy);
    });
  }

  /** 卡内坐标:原型卡宽 471 / 高 660,以卡中心为原点(L = 卡内原型 x 相对卡左缘,Y = 原型 y)。 */
  private renderBountyCard(parent: Node, bounty: WorldBountyVO, x: number, y: number, k: number, busy: boolean): void {
    const kit = this.host as unknown as UiKitHost;
    const S = (v: number): number => v * k;
    const L = (px: number): number => (px - 235.5) * k;
    const Y = (py: number): number => (448 - py) * k;
    const w = S(471);
    const h = S(660);
    const card = mountGlassPanel(kit, parent, `Bounty_${bounty.slot}`, x, y, w, h, k);
    // 标题 + 难度胶囊(易绿 / 中琥珀 / 难红:描边 + 淡底 + 同色字)
    this.glassText(card, 'Title', bounty.name, L(28), Y(158), 32, GLASS_COLOR.text, S(320), k, HorizontalTextAlignment.LEFT, true);
    const tone = bounty.difficulty === '难' ? new Color(226, 96, 86, 255) : bounty.difficulty === '中' ? new Color(226, 178, 96, 255) : new Color(118, 200, 130, 255);
    const pill = this.host.addChildPlainNode(card, 'Diff', L(414), Y(158), S(64), S(40));
    const pg = pill.addComponent(Graphics);
    pg.fillColor = new Color(tone.r, tone.g, tone.b, 34);
    pg.roundRect(-S(32), -S(20), S(64), S(40), S(20));
    pg.fill();
    pg.strokeColor = new Color(tone.r, tone.g, tone.b, 220);
    pg.lineWidth = Math.max(1.2, S(1.8));
    pg.roundRect(-S(32), -S(20), S(64), S(40), S(20));
    pg.stroke();
    this.glassText(pill, 'Text', bounty.difficulty, 0, 0, 24, tone, S(56), k, HorizontalTextAlignment.CENTER, true);
    // 怪物插画:按比例装进 420×265 的画框,底部渐隐进卡片
    const artBox = this.host.addChildPlainNode(card, 'ArtClip', 0, Y(307), S(430), S(265));
    artBox.addComponent(Mask);
    const art = this.host.addSprite('Art', `monster/${bounty.monsterCode.toLowerCase()}/spriteFrame`, 0, 0, S(265), S(265), artBox);
    const frame = art?.spriteFrame;
    if (art && frame) {
      const o = frame.originalSize;
      // 按画框高度铺满(原型插画顶满上下),横向最多超出 12% 由画框裁掉
      const fit = Math.min(S(265) / Math.max(1, o.height), (S(420) / Math.max(1, o.width)) * 1.12);
      art.node.getComponent(UITransform)?.setContentSize(o.width * fit, o.height * fit);
    }
    const fade = this.host.addChildPlainNode(card, 'ArtFade', 0, Y(420), S(440), S(44)).addComponent(Graphics);
    for (let i = 0; i < 8; i += 1) {
      fade.fillColor = new Color(23, 27, 36, Math.round(26 + i * 26));
      fade.rect(-S(220), S(22) - S(5.5) * (i + 1), S(440), S(5.5));
      fade.fill();
    }
    const goal = `目标: ${bounty.desc}  ${Math.min(bounty.progress, bounty.target)}/${bounty.target}`;
    this.glassText(card, 'Goal', goal, L(30), Y(456), 22, new Color(226, 228, 234, 255), S(415), k);
    this.glassText(card, 'Place', `地点: ${WORLD_MAPS[bounty.map as WorldMapCode]?.name ?? bounty.map}`, L(30), Y(490), 22, new Color(226, 228, 234, 255), S(415), k);
    mountGlassLine(kit, card, 'Divider', 0, Y(519), S(415), Math.max(1, S(1.2)), new Color(255, 255, 255, 34));
    mountGlassSectionHeader(kit, card, 'Reward', '奖励', L(33), Y(545), k, 24);
    const rewards = bounty.rewards.slice(0, 3);
    const gap = rewards.length === 2 ? 154 : 130;
    rewards.forEach((reward, index) => {
      const rx = S((index - (rewards.length - 1) / 2) * gap);
      const cell = mountGlassFrame(kit, card, `Reward_${index}`, rx, Y(612), S(88), S(84), k);
      const asset = reward.resourceType === 'PLAYER_EXP' ? null : resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      if (!asset || !this.host.addSprite('Icon', asset, 0, 0, S(66), S(66), cell)) {
        const isExp = reward.resourceType === 'PLAYER_EXP';
        this.glassText(cell, 'Txt', isExp ? 'EXP' : (reward.resourceName || '?').slice(0, 2), 0, 0, 26, isExp ? new Color(132, 214, 140, 255) : GLASS_COLOR.text, S(80), k, HorizontalTextAlignment.CENTER, isExp);
      }
      this.glassText(card, `RewardAmt_${index}`, `×${reward.amount}`, rx, Y(670), 22, GLASS_COLOR.sub, S(124), k, HorizontalTextAlignment.CENTER);
    });
    const btnY = Y(730);
    const btnW = S(416);
    const btnH = S(58);
    if (bounty.state === 'OPEN') {
      mountGlassButton(kit, card, 'Btn', busy ? '请稍候…' : '接取', 0, btnY, btnW, btnH, k, busy ? 'disabled' : 'secondary', busy ? undefined : () => this.host.acceptWorldBounty(bounty.slot), 26);
    } else if (bounty.state === 'DONE') {
      mountGlassButton(kit, card, 'Btn', busy ? '请稍候…' : '领取奖励', 0, btnY, btnW, btnH, k, busy ? 'disabled' : 'secondaryLit', busy ? undefined : () => this.host.claimWorldBounty(bounty.slot), 26);
    } else {
      mountGlassButton(kit, card, 'Btn', bounty.state === 'CLAIMED' ? '已完成' : '进行中', 0, btnY, btnW, btnH, k, 'disabled', undefined, 26);
    }
  }

  /** B 风格文字(字号按原型像素 × k,下限 12)。 */
  private glassText(parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, k: number, align = HorizontalTextAlignment.LEFT, bold = false): Label {
    const label = glassLabel(this.host as unknown as UiKitHost, parent, name, text, x, y, size * k, color, width, align, bold);
    label.fontSize = Math.max(12, Math.round(size * k));
    label.lineHeight = label.fontSize + 4;
    return label;
  }
}
