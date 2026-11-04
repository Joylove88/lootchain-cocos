import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { RealmState } from '../../api/RealmApi';
import type { UiLayout } from './LobbyHudTypes';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassIconButton, mountGlassLine, mountGlassSectionHeader, mountGlassSlice } from '../UiGlassKit';

export interface RealmRendererHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor?(node: Node): void;
}

export type RealmGender = 'male' | 'female';

const B = (name: string): string => `ui/protagonist/b/${name}/spriteFrame`;
const R = (name: string): string => `ui/realm/${name}/spriteFrame`;
const ART = {
  bg: B('soul_sea_bg'),
  zero: B('zero_m'),
  zeroRound: B('zero_m_round'),
  base: { male: B('protag_m_base'), female: B('protag_f_base') } as Record<RealmGender, string>,
  lianhun: { male: R('protag_m_lianhun'), female: R('protag_f_lianhun') } as Record<RealmGender, string>,
};
const ICON = {
  condLevel: R('icon_cond_level'),
  condStory: R('icon_cond_story'),
  mirror: R('icon_trial_mirror'),
  outfit: R('icon_rw_outfit'),
  stats: R('icon_rw_stats'),
  ult: R('icon_rw_ult'),
  memory: R('icon_rw_memory'),
  evo: R('icon_rw_evo'),
  title: R('icon_cond_level'),
  atk: R('icon_done_stats'),
};
/** 境界阶梯(P1a 只开到炼魂,后面三档锁着)。 */
const LADDER = [
  { code: 'AWAKEN', name: '觉醒' },
  { code: 'LIANHUN', name: '炼魂' },
  { code: 'QILING', name: '契灵' },
  { code: 'SHENGYU', name: '圣域' },
  { code: 'SHENYI', name: '神裔' },
];
/** 前世记忆碎片第 1 段(docs/60 §7:神庭的史书与零的记忆两种讲法,这段是零的记忆)。 */
export const REALM_MEMORY_1 = {
  caption: '神庭 · 第九声钟',
  text: '「那一夜神庭的钟敲了九下。天枢握着我的手说:兄长,打完这一仗,我们回北境喝酒。」',
};

export interface RealmBreakState {
  realm: RealmState;
  gender: RealmGender;
  busy: boolean;
  error: string;
}

export interface RealmTrialHudState {
  /** 剩余毫秒。 */
  remainMs: number;
  /** 心魔剩余血量 0~1。 */
  hpRatio: number;
  /** 开场台词还显示着。 */
  showLine: boolean;
  /** 失败面板:null = 进行中。 */
  failed: 'down' | 'timeout' | null;
  /** 胜利后等服务端确认。 */
  settling: boolean;
  error: string;
}

/**
 * docs/60 §12 主角境界突破的三屏(原型 周报截图/2026-11-04_境界突破/proto,用户 11-04 逐张确认):
 * - realm_break_lianhun_b:突破窗口(左角色台 + 半透明下一境外观;右阶梯 / 条件 / 试炼 / 奖励 / 开始按钮);
 * - realm_trial_xinmo_b:试炼顶栏(突破试炼 / 心魔 · 昔日的自己 / 倒计时)+ 放弃 + 零的台词;心魔血条用跑图层的精英条;
 * - realm_break_done_b:突破成功页(新境界外观 + 突破所得 + 前世记忆 + 继续)。
 * 坐标全部取原型 1870×841 实测像素。
 */
export class LobbyRealmRenderer {
  static readonly BREAK_NODE = 'LobbyRealmBreak';
  static readonly TRIAL_NODE = 'LobbyRealmTrialHud';
  static readonly DONE_NODE = 'LobbyRealmDone';

  constructor(
    private readonly host: RealmRendererHost,
    private readonly handlers: {
      closeBreak(): void;
      startTrial(): void;
      quitTrial(): void;
      retryTrial(): void;
      continueDone(): void;
    },
  ) {}

  private stageRoot(layout: UiLayout, name: string, block: boolean): { root: Node; k: number; FX: (px: number) => number; FY: (py: number) => number; S: (v: number) => number } {
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const root = this.host.createUiNode(name);
    root.setPosition(new Vec3(cx, cy, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    if (block) {
      root.addComponent(BlockInputEvents);
    }
    return { root, k, FX, FY, S };
  }

  /** 识海背景:cover 铺满 + 压暗(石台在图左下,和原型角色台对上)。 */
  private soulSea(root: Node, layout: UiLayout, dim: number): void {
    const W = layout.width;
    const H = layout.height;
    const scale = Math.max(W / 1672, H / 941);
    this.host.addSprite('Bg', ART.bg, 0, 0, 1672 * scale, 941 * scale, root);
    const g = this.host.addChildPlainNode(root, 'Dim', 0, 0, W, H).addComponent(Graphics);
    g.fillColor = new Color(6, 9, 15, dim);
    g.rect(-W / 2, -H / 2, W, H);
    g.fill();
  }

  private zeroDialogue(root: Node, S: (v: number) => number, k: number, cx: number, cy: number, w: number, h: number, portraitX: number, text: string, textColor: Color): void {
    const dialog = this.host.addChildPlainNode(root, 'Dialogue', cx, cy, w, h);
    mountGlassSlice(this.host, dialog, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, k);
    const left = portraitX - cx + S(96);
    glassLabel(this.host, dialog, 'Speaker', '零', left, S(22), S(24), GLASS_COLOR.champagne, S(120), HorizontalTextAlignment.LEFT, true);
    const line = glassLabel(this.host, dialog, 'Line', text, left, -S(16), S(24), textColor, w - (left + w / 2) - S(30));
    line.overflow = Label.Overflow.SHRINK;
    const portrait = this.host.addChildPlainNode(root, 'ZeroPortrait', portraitX, cy - S(2), S(140), S(140));
    const pg = portrait.addComponent(Graphics);
    pg.fillColor = new Color(14, 19, 30, 255);
    pg.circle(0, 0, S(66));
    pg.fill();
    this.host.addSprite('Face', ART.zeroRound, 0, 0, S(128), S(128), portrait);
    const ring = this.host.addChildPlainNode(portrait, 'Ring', 0, 0, S(140), S(140)).addComponent(Graphics);
    ring.strokeColor = new Color(196, 204, 220, 150);
    ring.lineWidth = Math.max(1.5, S(2));
    ring.circle(0, 0, S(66));
    ring.stroke();
  }

  /** 状态胶囊:gold = 暗金底白字;outline = 香槟描边白字;dim = 暗底灰字(可带锁)。 */
  private pill(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, k: number, S: (v: number) => number, kind: 'gold' | 'outline' | 'dim' | 'lock'): void {
    const node = this.host.addChildPlainNode(parent, name, x, y, w, h);
    if (kind === 'gold') {
      mountGlassSlice(this.host, node, 'Bg', GLASS_SLICES.pillGold, 0, 0, w, h, k);
    } else {
      mountGlassSlice(this.host, node, 'Bg', GLASS_SLICES.tagPill, 0, 0, w, h, k);
      if (kind === 'outline') {
        const g = this.host.addChildPlainNode(node, 'Rim', 0, 0, w, h).addComponent(Graphics);
        g.strokeColor = new Color(227, 196, 138, 230);
        g.lineWidth = Math.max(1.5, S(2));
        g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, h / 2 - 1);
        g.stroke();
      }
    }
    const color = kind === 'gold' ? GLASS_COLOR.onGold : kind === 'outline' ? GLASS_COLOR.text : GLASS_COLOR.dim;
    if (kind === 'lock') {
      this.host.addSprite('Lock', GLASS_ICON.lock, -S(26), 0, S(16), S(18), node);
      glassLabel(this.host, node, 'Text', text, S(10), 0, S(20), color, w - S(40), HorizontalTextAlignment.CENTER);
    } else {
      glassLabel(this.host, node, 'Text', text, 0, 0, S(kind === 'gold' ? 22 : 21), color, w - S(16), HorizontalTextAlignment.CENTER, kind === 'gold');
    }
  }

  /** 角色台:当前外观 + 半透明下一境外观(+ 零)。 */
  private stage(root: Node, S: (v: number) => number, FX: (px: number) => number, FY: (py: number) => number, art: string, ghost: string | null, ghostX: number,
    figX: number, figY: number, figH: number, zeroX: number, zeroY: number): void {
    if (ghost) {
      const node = this.host.addChildPlainNode(root, 'Ghost', FX(ghostX), FY(figY - 30), S(figH * 0.95 * 0.75), S(figH * 0.95));
      this.host.addSprite('Art', ghost, 0, 0, S(figH * 0.95 * 0.75), S(figH * 0.95), node);
      node.addComponent(UIOpacity).opacity = 52;
    }
    this.host.addSprite('Figure', art, FX(figX), FY(figY), S(figH * 0.75), S(figH), root);
    this.host.addSprite('Zero', ART.zero, FX(zeroX), FY(zeroY), S(118), S(118), root);
  }

  // ── 原型 1:突破窗口 ──

  renderBreak(layout: UiLayout, state: RealmBreakState): void {
    const { root, k, FX, FY, S } = this.stageRoot(layout, LobbyRealmRenderer.BREAK_NODE, true);
    this.soulSea(root, layout, 150);
    // 窗口(原型 x 160~1710 / y 26~812)
    const win = this.host.addChildPlainNode(root, 'Window', FX(935), FY(419), S(1550), S(786));
    mountGlassSlice(this.host, win, 'Glass', GLASS_SLICES.panel, 0, 0, S(1550), S(786), k);
    glassLabel(this.host, root, 'Title', '境界突破', FX(207), FY(61), S(38), GLASS_COLOR.text, S(200), HorizontalTextAlignment.LEFT, true);
    const realm = state.realm;
    this.pill(root, 'Status', realm.canBreak ? '可突破' : '未满足', FX(445), FY(61), S(118), S(38), k, S, 'outline');
    mountGlassIconButton(this.host, root, 'Close', GLASS_ICON.close, FX(1648), FY(61), S(34), S(72), () => this.handlers.closeBreak());
    mountGlassLine(this.host, root, 'TopDivider', FX(935), FY(95), S(1474), Math.max(1, S(1.2)), new Color(255, 255, 255, 34));

    // 左:角色台(当前外观 + 身后半透明炼魂外观)
    this.stage(root, S, FX, FY, ART.base[state.gender], ART.lianhun[state.gender], 470, 655, 455, 600, 812, 268);
    glassLabel(this.host, root, 'GhostCaption', `—— ${realm.nextRealmName || '炼魂'}境外观 ——`, FX(627), FY(773), S(20), GLASS_COLOR.sub, S(300), HorizontalTextAlignment.CENTER);

    // 右:面板(原型 x 1002~1688 / y 112~786)
    const panel = this.host.addChildPlainNode(root, 'Panel', FX(1345), FY(449), S(686), S(674));
    mountGlassSlice(this.host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, S(686), S(674), k);
    this.renderLadder(root, realm, FX, FY, S, k);
    mountGlassLine(this.host, root, 'LadderDivider', FX(1348), FY(190), S(634), Math.max(1, S(1)), new Color(255, 255, 255, 28));

    // 突破条件
    mountGlassSectionHeader(this.host, root, 'Cond', '突破条件', FX(1033), FY(212), k, 26);
    glassLabel(this.host, root, 'CondHint', '需全部满足', FX(1665), FY(212), S(19), GLASS_COLOR.sub, S(200), HorizontalTextAlignment.RIGHT);
    const rowsY = [255, 294];
    realm.conditions.slice(0, 2).forEach((cond, i) => {
      const y = rowsY[i];
      this.host.addSprite(`CondIcon${i}`, cond.key === 'STORY' ? ICON.condStory : ICON.condLevel, FX(1056), FY(y), S(30), S(30), root);
      glassLabel(this.host, root, `CondLabel${i}`, cond.label, FX(1098), FY(y), S(21), GLASS_COLOR.text, S(260));
      glassLabel(this.host, root, `CondCur${i}`, cond.current, FX(1373), FY(y), S(20), GLASS_COLOR.sub, S(170));
      glassLabel(this.host, root, `CondState${i}`, cond.done ? '✓ 已达成' : '未达成', FX(1652), FY(y), S(21), cond.done ? GLASS_COLOR.green : GLASS_COLOR.dim, S(140), HorizontalTextAlignment.RIGHT);
      mountGlassLine(this.host, root, `CondLine${i}`, FX(1348), FY(y + 21), S(626), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    });

    // 突破试炼
    mountGlassSectionHeader(this.host, root, 'Trial', '突破试炼', FX(1033), FY(346), k, 26);
    const card = this.host.addChildPlainNode(root, 'TrialCard', FX(1350), FY(418), S(634), S(98));
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.row, 0, 0, S(634), S(98), k);
    this.host.addSprite('TrialIcon', ICON.mirror, FX(1098), FY(418), S(76), S(76), root);
    glassLabel(this.host, root, 'TrialTitle', '心魔 · 昔日的自己', FX(1165), FY(388), S(26), GLASS_COLOR.text, S(460), HorizontalTextAlignment.LEFT, true);
    glassLabel(this.host, root, 'TrialLine', '斩断过去的弱小,才能走出这座村子', FX(1165), FY(419), S(19), GLASS_COLOR.sub, S(460));
    glassLabel(this.host, root, 'TrialLine2', '失败无惩罚,可立即重试', FX(1165), FY(446), S(18), GLASS_COLOR.sub, S(460));

    // 突破奖励
    mountGlassSectionHeader(this.host, root, 'Reward', '突破奖励', FX(1033), FY(494), k, 26);
    const bonus = Math.round((realm.nextBonus || 0.15) * 100);
    const rewards = [
      { icon: ICON.outfit, text: '外观换阶' },
      { icon: ICON.stats, text: `攻击生命 +${bonus}%` },
      { icon: ICON.ult, text: '大招·夜帝残影' },
      { icon: ICON.memory, text: '前世记忆' },
      { icon: ICON.evo, text: '进化上限' },
    ];
    [1092, 1226, 1358, 1490, 1618].forEach((x, i) => {
      const tile = this.host.addChildPlainNode(root, `RewardTile${i}`, FX(x), FY(555), S(94), S(94));
      mountGlassSlice(this.host, tile, 'Glass', GLASS_SLICES.frame, 0, 0, S(94), S(94), k);
      this.host.addSprite('Icon', rewards[i].icon, 0, 0, S(58), S(58), tile);
      glassLabel(this.host, root, `RewardText${i}`, rewards[i].text, FX(x), FY(608), S(16), GLASS_COLOR.sub, S(124), HorizontalTextAlignment.CENTER);
    });
    mountGlassLine(this.host, root, 'BottomDivider', FX(1348), FY(643), S(626), Math.max(1, S(1)), new Color(255, 255, 255, 28));
    const note = state.error || '突破后开放传说进化卡';
    glassLabel(this.host, root, 'Note', note, FX(1345), FY(668), S(19), state.error ? GLASS_COLOR.red : GLASS_COLOR.sub, S(620), HorizontalTextAlignment.CENTER);
    const ready = realm.canBreak && !state.busy;
    const start = mountGlassButton(this.host, root, 'Start', state.busy ? '准备中…' : realm.canBreak ? '开始突破试炼' : '条件未满足', FX(1348), FY(734), S(647), S(64), k,
      ready ? 'primary' : 'primaryOff', () => this.handlers.startTrial(), 30);
    this.host.applyPointerCursor?.(start);
  }

  private renderLadder(root: Node, realm: RealmState, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number): void {
    const xs = [1093, 1230, 1360, 1490, 1624];
    const ws = [104, 90, 96, 96, 96];
    const currentIndex = Math.max(0, LADDER.findIndex((item) => item.code === realm.realmCode));
    const nextIndex = realm.nextRealmCode ? LADDER.findIndex((item) => item.code === realm.nextRealmCode) : -1;
    for (let i = 0; i < LADDER.length - 1; i += 1) {
      const x0 = xs[i] + ws[i] / 2 + 8;
      const x1 = xs[i + 1] - ws[i + 1] / 2 - 8;
      mountGlassLine(this.host, root, `LadderLink${i}`, FX((x0 + x1) / 2), FY(145), S(x1 - x0), Math.max(1, S(1.4)), new Color(255, 255, 255, 60));
    }
    LADDER.forEach((item, i) => {
      const kind = i === currentIndex ? 'gold' : i === nextIndex ? 'outline' : i < currentIndex ? 'outline' : 'lock';
      this.pill(root, `Ladder${i}`, item.name, FX(xs[i]), FY(145), S(ws[i]), S(40), k, S, kind);
    });
    glassLabel(this.host, root, 'LadderStage', realm.stage, FX(xs[currentIndex]), FY(177), S(16), GLASS_COLOR.sub, S(100), HorizontalTextAlignment.CENTER);
  }

  // ── 原型 2:试炼顶栏 ──

  renderTrialHud(layout: UiLayout, state: RealmTrialHudState): void {
    const { root, k, FX, FY, S } = this.stageRoot(layout, LobbyRealmRenderer.TRIAL_NODE, false);
    // 顶栏(原型 x 552~1318 / y 21~71)
    const bar = this.host.addChildPlainNode(root, 'TopBar', FX(935), FY(46), S(766), S(50));
    mountGlassSlice(this.host, bar, 'Glass', GLASS_SLICES.hudCapsule, 0, 0, S(766), S(50), k);
    this.pill(root, 'Tag', '突破试炼', FX(663), FY(46), S(128), S(32), k, S, 'outline');
    mountGlassLine(this.host, root, 'Sep1', FX(775), FY(46), Math.max(1, S(1)), S(24), new Color(255, 255, 255, 50));
    mountGlassLine(this.host, root, 'Sep2', FX(1160), FY(46), Math.max(1, S(1)), S(24), new Color(255, 255, 255, 50));
    glassLabel(this.host, root, 'Title', '心魔 · 昔日的自己', FX(967), FY(46), S(28), GLASS_COLOR.text, S(360), HorizontalTextAlignment.CENTER, true);
    const sec = Math.max(0, Math.ceil(state.remainMs / 1000));
    const timer = glassLabel(this.host, root, 'Timer', `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
      FX(1240), FY(46), S(26), sec <= 20 ? GLASS_COLOR.red : GLASS_COLOR.text, S(120), HorizontalTextAlignment.CENTER, true);
    timer.node.name = 'Timer';
    // 放弃(原型 x 40~230 / y 20~72)
    const quit = this.host.addChildPlainNode(root, 'Quit', FX(135), FY(46), S(190), S(52));
    mountGlassSlice(this.host, quit, 'Pill', GLASS_SLICES.pillSecondary, 0, 0, S(190), S(52), k);
    this.host.addSprite('Icon', GLASS_ICON.back, -S(58), 0, S(22), S(22), quit);
    glassLabel(this.host, quit, 'Text', '放弃试炼', S(12), 0, S(22), GLASS_COLOR.text, S(120), HorizontalTextAlignment.CENTER);
    quit.addComponent(Button);
    quit.on(Button.EventType.CLICK, () => this.handlers.quitTrial());
    this.host.applyImageButtonFeedback(quit, 1.03, 0.97);
    this.host.applyPointerCursor?.(quit);
    // 心魔血条(原型:名字 x 619 / y 97;条 x 612~1192 / y 124 高 16;百分比 x 1208)
    glassLabel(this.host, root, 'BossName', '昔日的自己', FX(619), FY(97), S(20), GLASS_COLOR.text, S(300));
    const bw = S(580);
    const bh = Math.max(4, S(16));
    const boss = this.host.addChildPlainNode(root, 'BossBar', FX(902), FY(124), bw, bh);
    const track = boss.addComponent(Graphics);
    track.fillColor = new Color(26, 20, 24, 225);
    track.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    track.fill();
    track.strokeColor = new Color(255, 255, 255, 46);
    track.lineWidth = 1;
    track.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    track.stroke();
    this.host.addChildPlainNode(boss, 'Fill', 0, 0, bw, bh).addComponent(Graphics);
    glassLabel(this.host, root, 'BossPct', '100%', FX(1208), FY(124), S(19), GLASS_COLOR.sub, S(90));
    this.drawBossBar(root, state.hpRatio);
    glassLabel(this.host, root, 'NoPenalty', '失败无惩罚,可立即重试', FX(68), FY(490), S(19), GLASS_COLOR.sub, S(300));
    if (state.showLine && !state.failed) {
      // 零的开场台词(原型框 x 455~1328 / y 668~797;圆头像中心 (522, 727))
      this.zeroDialogue(root, S, k, FX(890), FY(732), S(873), S(118), FX(522), '那是被所有人看不起的你。斩断他,我们才走得出这座村子。', GLASS_COLOR.text);
    }
    if (state.failed || state.settling || state.error) {
      this.renderTrialResult(root, state, FX, FY, S, k);
    }
  }

  private drawBossBar(root: Node, ratio: number): void {
    const bar = root.getChildByName('BossBar');
    const fill = bar?.getChildByName('Fill')?.getComponent(Graphics);
    const size = bar?.getComponent(UITransform)?.contentSize;
    if (!fill || !size) {
      return;
    }
    const r = Math.max(0, Math.min(1, ratio));
    const key = Math.round(r * 400);
    if ((fill as unknown as { __key?: number }).__key === key) {
      return;
    }
    (fill as unknown as { __key?: number }).__key = key;
    fill.clear();
    if (r > 0) {
      const w = size.width;
      const h = size.height;
      fill.fillColor = new Color(178, 52, 50, 255);
      fill.roundRect(-w / 2 + 1, -h / 2 + 1, Math.max(h - 2, (w - 2) * r), h - 2, (h - 2) / 2);
      fill.fill();
    }
    const pct = root.getChildByName('BossPct')?.getComponent(Label);
    if (pct) {
      pct.string = `${Math.ceil(r * 100)}%`;
    }
  }

  /** 只更新倒计时 / 心魔血条(每帧调用,避免整层重建)。 */
  updateTrial(remainMs: number, hpRatio: number, root: Node | null): void {
    if (root) {
      this.drawBossBar(root, hpRatio);
    }
    const label = root?.getChildByName('Timer')?.getComponent(Label);
    if (!label) {
      return;
    }
    const sec = Math.max(0, Math.ceil(remainMs / 1000));
    const text = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    if (label.string !== text) {
      label.string = text;
      label.color = sec <= 20 ? GLASS_COLOR.red : GLASS_COLOR.text;
    }
  }

  private renderTrialResult(root: Node, state: RealmTrialHudState, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number): void {
    const shade = this.host.addChildPlainNode(root, 'ResultShade', 0, 0, S(1870) * 2, S(841) * 2);
    shade.addComponent(BlockInputEvents);
    const sg = shade.addComponent(Graphics);
    sg.fillColor = new Color(4, 6, 10, 150);
    sg.rect(-S(1870), -S(841), S(1870) * 2, S(841) * 2);
    sg.fill();
    const card = this.host.addChildPlainNode(root, 'ResultCard', FX(935), FY(420), S(640), S(280));
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.panel, 0, 0, S(640), S(280), k);
    if (state.settling && !state.error) {
      glassLabel(this.host, card, 'Title', '心魔已斩', 0, S(40), S(36), GLASS_COLOR.text, S(560), HorizontalTextAlignment.CENTER, true);
      glassLabel(this.host, card, 'Sub', '境界正在突破…', 0, -S(20), S(22), GLASS_COLOR.sub, S(560), HorizontalTextAlignment.CENTER);
      return;
    }
    const title = state.error ? '突破没有成功' : state.failed === 'timeout' ? '时间到了' : '你倒下了';
    glassLabel(this.host, card, 'Title', title, 0, S(78), S(36), GLASS_COLOR.text, S(560), HorizontalTextAlignment.CENTER, true);
    glassLabel(this.host, card, 'Sub', state.error || '失败无惩罚,可立即重试', 0, S(26), S(21), state.error ? GLASS_COLOR.red : GLASS_COLOR.sub, S(560), HorizontalTextAlignment.CENTER);
    const retry = mountGlassButton(this.host, card, 'Retry', '再来一次', S(130), -S(70), S(240), S(60), k, 'primary', () => this.handlers.retryTrial(), 26);
    this.host.applyPointerCursor?.(retry);
    const quit = mountGlassButton(this.host, card, 'Leave', '退出试炼', -S(130), -S(70), S(240), S(60), k, 'secondary', () => this.handlers.quitTrial(), 26);
    this.host.applyPointerCursor?.(quit);
  }

  // ── 原型 3:突破成功 ──

  renderDone(layout: UiLayout, realm: RealmState, gender: RealmGender, leaving: boolean): void {
    const { root, k, FX, FY, S } = this.stageRoot(layout, LobbyRealmRenderer.DONE_NODE, true);
    this.soulSea(root, layout, 120);
    glassLabel(this.host, root, 'Kicker', '境界突破', FX(608), FY(27), S(22), GLASS_COLOR.sub, S(240), HorizontalTextAlignment.CENTER);
    mountGlassLine(this.host, root, 'KickerL', FX(400), FY(67), S(110), Math.max(1, S(1)), new Color(255, 255, 255, 50));
    mountGlassLine(this.host, root, 'KickerR', FX(816), FY(67), S(110), Math.max(1, S(1)), new Color(255, 255, 255, 50));
    this.pill(root, 'From', '觉醒', FX(524), FY(67), S(108), S(34), k, S, 'dim');
    glassLabel(this.host, root, 'Arrow', '→', FX(608), FY(66), S(26), GLASS_COLOR.text, S(40), HorizontalTextAlignment.CENTER);
    this.pill(root, 'To', realm.realmName || '炼魂', FX(692), FY(67), S(108), S(34), k, S, 'gold');
    glassLabel(this.host, root, 'Realm', `${realm.realmName || '炼魂'}境`, FX(608), FY(118), S(46), GLASS_COLOR.text, S(400), HorizontalTextAlignment.CENTER, true);
    this.stage(root, S, FX, FY, ART.lianhun[gender], null, 0, 630, 420, 540, 752, 240);

    // 右:突破所得 + 前世记忆(原型 x 984~1694 / y 97~785)
    const panel = this.host.addChildPlainNode(root, 'Panel', FX(1339), FY(441), S(710), S(688));
    mountGlassSlice(this.host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, S(710), S(688), k);
    mountGlassSectionHeader(this.host, root, 'Gain', '突破所得', FX(1015), FY(133), k, 26);
    const bonus = `+${Math.round(realm.bonus * 100)}%`;
    const rows = [
      { icon: ICON.title, label: '境界称号', value: realm.title, gold: false },
      { icon: ICON.atk, label: '主角攻击 / 生命', value: bonus, gold: true },
      { icon: ICON.ult, label: '新大招', value: '夜帝残影 · 已解锁', gold: false },
      { icon: ICON.evo, label: '进化上限', value: '传说进化卡', gold: false },
    ];
    [182, 232, 281, 331].forEach((y, i) => {
      this.host.addSprite(`GainIcon${i}`, rows[i].icon, FX(1050), FY(y), S(36), S(36), root);
      glassLabel(this.host, root, `GainLabel${i}`, rows[i].label, FX(1105), FY(y), S(21), GLASS_COLOR.text, S(240));
      glassLabel(this.host, root, `GainValue${i}`, rows[i].value, FX(1657), FY(y), S(21), rows[i].gold ? GLASS_COLOR.champagne : GLASS_COLOR.text, S(380), HorizontalTextAlignment.RIGHT);
      mountGlassLine(this.host, root, `GainLine${i}`, FX(1339), FY(y + 25), S(650), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    });
    mountGlassSectionHeader(this.host, root, 'Memory', '前世记忆 · 其一', FX(1015), FY(398), k, 26);
    const card = this.host.addChildPlainNode(root, 'MemoryCard', FX(1343), FY(520), S(658), S(180));
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.row, 0, 0, S(658), S(180), k);
    glassLabel(this.host, root, 'MemoryCaption', REALM_MEMORY_1.caption, FX(1053), FY(461), S(17), GLASS_COLOR.sub, S(300));
    // LEFT 对齐时 x 是左沿(UiPrimitiveFactory 已按对齐平移框)
    const quote = this.host.addChildLabel(root, 'MemoryText', REALM_MEMORY_1.text, FX(1053), FY(518), S(23), GLASS_COLOR.text, new Size(S(590), S(80)), HorizontalTextAlignment.LEFT);
    quote.overflow = Label.Overflow.SHRINK;
    quote.enableWrapText = true;
    quote.lineHeight = S(38);
    glassLabel(this.host, root, 'MemoryCount', '记忆碎片 1 / ?', FX(1640), FY(577), S(16), GLASS_COLOR.sub, S(200), HorizontalTextAlignment.RIGHT);
    if (leaving) {
      glassLabel(this.host, root, 'Next', '离开晨风村,前往主城', FX(1345), FY(652), S(20), GLASS_COLOR.sub, S(620), HorizontalTextAlignment.CENTER);
    }
    const go = mountGlassButton(this.host, root, 'Continue', '继续', FX(1342), FY(721), S(652), S(64), k, 'primary', () => this.handlers.continueDone(), 30);
    this.host.applyPointerCursor?.(go);
    this.zeroDialogue(root, S, k, FX(578), FY(760), S(747), S(95), FX(180), '第一道锁开了。宿主,外面的世界比你想的大得多。', GLASS_COLOR.text);
  }
}
