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
  qiling: { male: R('protag_m_qiling'), female: R('protag_f_qiling') } as Record<RealmGender, string>,
};

/** 境界 → 立绘(觉醒原装 / 炼魂旅者轻甲 / 契灵契约者战甲;没有的境界按最近的一档)。 */
function realmArt(code: string, gender: RealmGender): string {
  if (code === 'QILING' || code === 'SHENGYU' || code === 'SHENYI') {
    return ART.qiling[gender];
  }
  return code === 'LIANHUN' ? ART.lianhun[gender] : ART.base[gender];
}
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
/** 境界阶梯(晨曦大陆阶段开到契灵,后面两档随新世界开放)。 */
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
/** 前世记忆碎片第 2 段(契灵突破,docs/60 §14):天枢第一次向夜帝举剑。 */
export const REALM_MEMORY_2 = {
  caption: '北境 · 第一次交手',
  text: '「天枢的剑停在我喉前一寸。他说:兄长,神庭要的是你的命,不是我的。——那是他第一次对我举剑,也是最后一次叫我兄长。」',
};

/**
 * 每一境突破的内容(按要突破到的境界取):试炼名 / 台词 / 奖励 / 成功页。
 * 炼魂 = docs/60 §12 心魔;契灵 = §14 天枢的幻影(重演夜帝与天枢的第一次交手)。
 */
interface RealmBreakContent {
  trialTitle: string;
  trialLine: string;
  boss: string;
  openLine: string;
  killed: string;
  ultReward: { icon: string; text: string };
  lastReward: (state: RealmState) => { icon: string; text: string };
  note: string;
  gains: (state: RealmState) => { icon: string; label: string; value: string; gold: boolean }[];
  memory: { caption: string; text: string };
  memoryIndex: number;
  doneLine: string;
}
const BREAK_CONTENT: Record<string, RealmBreakContent> = {
  LIANHUN: {
    trialTitle: '心魔 · 昔日的自己',
    trialLine: '斩断过去的弱小,才能走出这座村子',
    boss: '昔日的自己',
    openLine: '那是被所有人看不起的你。斩断他,我们才走得出这座村子。',
    killed: '心魔已斩',
    ultReward: { icon: ICON.ult, text: '大招·夜帝残影' },
    lastReward: () => ({ icon: ICON.evo, text: '进化上限' }),
    note: '突破后开放传说进化卡',
    gains: (realm) => [
      { icon: ICON.title, label: '境界称号', value: realm.title, gold: false },
      { icon: ICON.atk, label: '主角攻击 / 生命', value: `+${Math.round(realm.bonus * 100)}%`, gold: true },
      { icon: ICON.ult, label: '新大招', value: '夜帝残影 · 已解锁', gold: false },
      { icon: ICON.evo, label: '进化上限', value: '传说进化卡', gold: false },
    ],
    memory: REALM_MEMORY_1,
    memoryIndex: 1,
    doneLine: '第一道锁开了。宿主,外面的世界比你想的大得多。',
  },
  QILING: {
    trialTitle: '天枢的幻影',
    trialLine: '重演夜帝与天枢的第一次交手',
    boss: '天枢的幻影',
    openLine: '他是你前世唯一的兄弟,也是第一个向你举剑的人。看清他的剑,宿主。',
    killed: '幻影已散',
    ultReward: { icon: ICON.ult, text: '被动·契印' },
    lastReward: (realm) => ({ icon: ICON.evo, text: `光环 +${realm.nextTeamAuraPct || 8}%` }),
    note: '契印:技能命中叠印,满 3 层引爆一次重击',
    gains: (realm) => [
      { icon: ICON.title, label: '境界称号', value: realm.title, gold: false },
      { icon: ICON.atk, label: '主角攻击 / 生命', value: `+${Math.round(realm.bonus * 100)}%`, gold: true },
      { icon: ICON.ult, label: '新被动', value: '契印 · 满 3 层引爆', gold: false },
      { icon: ICON.evo, label: '境界光环', value: `上阵英雄 +${realm.teamAuraPct || 8}%`, gold: false },
    ],
    memory: REALM_MEMORY_2,
    memoryIndex: 2,
    doneLine: '第二道锁开了。晨曦大陆已经装不下你——裂隙那头,还有人在等你。',
  },
};
/** 按境界取突破内容(未知境界退回炼魂那套,不至于空白)。 */
export function realmBreakContent(code: string): RealmBreakContent {
  return BREAK_CONTENT[code] ?? BREAK_CONTENT.LIANHUN;
}

export interface RealmBreakState {
  realm: RealmState;
  gender: RealmGender;
  busy: boolean;
  error: string;
}

export interface RealmTrialHudState {
  /** 要突破到的境界(LIANHUN / QILING):决定试炼名 / 敌人名 / 台词。 */
  target: string;
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
    this.pill(root, 'Status', !realm.nextRealmCode ? '已至顶点' : realm.canBreak ? '可突破' : '未满足', FX(445), FY(61), S(118), S(38), k, S, 'outline');
    mountGlassIconButton(this.host, root, 'Close', GLASS_ICON.close, FX(1648), FY(61), S(34), S(72), () => this.handlers.closeBreak());
    mountGlassLine(this.host, root, 'TopDivider', FX(935), FY(95), S(1474), Math.max(1, S(1.2)), new Color(255, 255, 255, 34));

    // 左:角色台(当前外观 + 身后半透明下一境外观;已到顶只站当前外观)
    const top = !realm.nextRealmCode;
    this.stage(root, S, FX, FY, realmArt(realm.realmCode, state.gender), top ? null : realmArt(realm.nextRealmCode, state.gender), 470, 655, 455, 600, 812, 268);
    glassLabel(this.host, root, 'GhostCaption', top ? `—— ${realm.realmName}境 ——` : `—— ${realm.nextRealmName}境外观 ——`, FX(627), FY(773), S(20), GLASS_COLOR.sub, S(300), HorizontalTextAlignment.CENTER);

    // 右:面板(原型 x 1002~1688 / y 112~786)
    const panel = this.host.addChildPlainNode(root, 'Panel', FX(1345), FY(449), S(686), S(674));
    mountGlassSlice(this.host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, S(686), S(674), k);
    this.renderLadder(root, realm, FX, FY, S, k);
    mountGlassLine(this.host, root, 'LadderDivider', FX(1348), FY(190), S(634), Math.max(1, S(1)), new Color(255, 255, 255, 28));

    if (top) {
      this.renderTopRealm(root, realm, FX, FY, S, k);
      return;
    }
    const content = realmBreakContent(realm.nextRealmCode);

    // 突破条件(炼魂 2 条需全部满足;契灵起 3 条任选其一,行距收紧)
    mountGlassSectionHeader(this.host, root, 'Cond', '突破条件', FX(1033), FY(212), k, 26);
    glassLabel(this.host, root, 'CondHint', realm.conditionMode === 'ANY' ? '满足任意一条' : '需全部满足', FX(1665), FY(212), S(19), GLASS_COLOR.sub, S(200), HorizontalTextAlignment.RIGHT);
    const conds = realm.conditions.slice(0, 3);
    const rowsY = conds.length >= 3 ? [246, 279, 312] : [255, 294];
    const lineGap = conds.length >= 3 ? 17 : 21;
    conds.forEach((cond, i) => {
      const y = rowsY[i];
      const icon = cond.key === 'STORY' || cond.key === 'EXPLORE' ? ICON.condStory : cond.key === 'POWER' ? ICON.atk : ICON.condLevel;
      this.host.addSprite(`CondIcon${i}`, icon, FX(1056), FY(y), S(28), S(28), root);
      glassLabel(this.host, root, `CondLabel${i}`, cond.label, FX(1098), FY(y), S(21), GLASS_COLOR.text, S(270));
      glassLabel(this.host, root, `CondCur${i}`, cond.current, FX(1383), FY(y), S(20), GLASS_COLOR.sub, S(170));
      glassLabel(this.host, root, `CondState${i}`, cond.done ? '✓ 已达成' : '未达成', FX(1652), FY(y), S(21), cond.done ? GLASS_COLOR.green : GLASS_COLOR.dim, S(140), HorizontalTextAlignment.RIGHT);
      mountGlassLine(this.host, root, `CondLine${i}`, FX(1348), FY(y + lineGap), S(626), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    });

    // 突破试炼
    mountGlassSectionHeader(this.host, root, 'Trial', '突破试炼', FX(1033), FY(346), k, 26);
    const card = this.host.addChildPlainNode(root, 'TrialCard', FX(1350), FY(418), S(634), S(98));
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.row, 0, 0, S(634), S(98), k);
    this.host.addSprite('TrialIcon', ICON.mirror, FX(1098), FY(418), S(76), S(76), root);
    glassLabel(this.host, root, 'TrialTitle', content.trialTitle, FX(1165), FY(388), S(26), GLASS_COLOR.text, S(460), HorizontalTextAlignment.LEFT, true);
    glassLabel(this.host, root, 'TrialLine', content.trialLine, FX(1165), FY(419), S(19), GLASS_COLOR.sub, S(460));
    glassLabel(this.host, root, 'TrialLine2', '失败无惩罚,可立即重试', FX(1165), FY(446), S(18), GLASS_COLOR.sub, S(460));

    // 突破奖励
    mountGlassSectionHeader(this.host, root, 'Reward', '突破奖励', FX(1033), FY(494), k, 26);
    const bonus = Math.round((realm.nextBonus || 0.15) * 100);
    const rewards = [
      { icon: ICON.outfit, text: '外观换阶' },
      { icon: ICON.stats, text: `攻击生命 +${bonus}%` },
      content.ultReward,
      { icon: ICON.memory, text: '前世记忆' },
      content.lastReward(realm),
    ];
    [1092, 1226, 1358, 1490, 1618].forEach((x, i) => {
      const tile = this.host.addChildPlainNode(root, `RewardTile${i}`, FX(x), FY(555), S(94), S(94));
      mountGlassSlice(this.host, tile, 'Glass', GLASS_SLICES.frame, 0, 0, S(94), S(94), k);
      this.host.addSprite('Icon', rewards[i].icon, 0, 0, S(58), S(58), tile);
      glassLabel(this.host, root, `RewardText${i}`, rewards[i].text, FX(x), FY(608), S(16), GLASS_COLOR.sub, S(124), HorizontalTextAlignment.CENTER);
    });
    mountGlassLine(this.host, root, 'BottomDivider', FX(1348), FY(643), S(626), Math.max(1, S(1)), new Color(255, 255, 255, 28));
    const note = state.error || content.note;
    glassLabel(this.host, root, 'Note', note, FX(1345), FY(668), S(19), state.error ? GLASS_COLOR.red : GLASS_COLOR.sub, S(620), HorizontalTextAlignment.CENTER);
    const ready = realm.canBreak && !state.busy;
    const start = mountGlassButton(this.host, root, 'Start', state.busy ? '准备中…' : realm.canBreak ? '开始突破试炼' : '条件未满足', FX(1348), FY(734), S(647), S(64), k,
      ready ? 'primary' : 'primaryOff', () => this.handlers.startTrial(), 30);
    this.host.applyPointerCursor?.(start);
  }

  /**
   * 已到开放的最高境界(晨曦大陆阶段 = 契灵):右栏换成「当前境界加成」+「下一境界随新世界开放」+ 前世记忆,按钮置灰。
   */
  private renderTopRealm(root: Node, realm: RealmState, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number): void {
    mountGlassSectionHeader(this.host, root, 'Cur', '当前境界', FX(1033), FY(212), k, 26);
    glassLabel(this.host, root, 'CurHint', realm.title, FX(1665), FY(212), S(19), GLASS_COLOR.champagne, S(260), HorizontalTextAlignment.RIGHT);
    const rows = [
      { icon: ICON.atk, label: '主角攻击 / 生命', value: `+${Math.round(realm.bonus * 100)}%` },
      { icon: ICON.stats, label: '境界光环 · 上阵英雄', value: `+${realm.teamAuraPct}%` },
      { icon: ICON.ult, label: realm.realmCode === 'QILING' ? '被动 · 契印' : '大招 · 夜帝残影', value: '已解锁' },
    ];
    [246, 279, 312].forEach((y, i) => {
      this.host.addSprite(`CurIcon${i}`, rows[i].icon, FX(1056), FY(y), S(28), S(28), root);
      glassLabel(this.host, root, `CurLabel${i}`, rows[i].label, FX(1098), FY(y), S(21), GLASS_COLOR.text, S(320));
      glassLabel(this.host, root, `CurValue${i}`, rows[i].value, FX(1652), FY(y), S(21), i === 0 ? GLASS_COLOR.champagne : GLASS_COLOR.text, S(200), HorizontalTextAlignment.RIGHT);
      mountGlassLine(this.host, root, `CurLine${i}`, FX(1348), FY(y + 17), S(626), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    });
    mountGlassSectionHeader(this.host, root, 'Next', '下一境界', FX(1033), FY(346), k, 26);
    const card = this.host.addChildPlainNode(root, 'NextCard', FX(1350), FY(430), S(634), S(122));
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.row, 0, 0, S(634), S(122), k);
    this.pill(root, 'NextPill', '圣域', FX(1100), FY(430), S(104), S(40), k, S, 'lock');
    glassLabel(this.host, root, 'NextTitle', '晨曦大陆的顶点', FX(1175), FY(400), S(26), GLASS_COLOR.text, S(450), HorizontalTextAlignment.LEFT, true);
    glassLabel(this.host, root, 'NextLine', '下一境界「圣域」随暗潮群岛开放', FX(1175), FY(436), S(20), GLASS_COLOR.sub, S(450));
    glassLabel(this.host, root, 'NextLine2', '继续探索、养成英雄,为渡海做准备', FX(1175), FY(466), S(18), GLASS_COLOR.sub, S(450));
    const memory = realm.realmCode === 'QILING' ? REALM_MEMORY_2 : REALM_MEMORY_1;
    mountGlassSectionHeader(this.host, root, 'Memory', '前世记忆', FX(1033), FY(526), k, 26);
    glassLabel(this.host, root, 'MemoryCaption', memory.caption, FX(1665), FY(526), S(18), GLASS_COLOR.sub, S(260), HorizontalTextAlignment.RIGHT);
    // LEFT 对齐时 x 是左沿
    const quote = this.host.addChildLabel(root, 'MemoryText', memory.text, FX(1040), FY(590), S(20), GLASS_COLOR.text, new Size(S(615), S(84)), HorizontalTextAlignment.LEFT);
    quote.overflow = Label.Overflow.SHRINK;
    quote.enableWrapText = true;
    quote.lineHeight = S(30);
    mountGlassLine(this.host, root, 'BottomDivider', FX(1348), FY(643), S(626), Math.max(1, S(1)), new Color(255, 255, 255, 28));
    mountGlassButton(this.host, root, 'Start', '已到晨曦大陆的顶点', FX(1348), FY(734), S(647), S(64), k, 'primaryOff', () => undefined, 30);
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
    const content = realmBreakContent(state.target);
    // 顶栏(原型 x 552~1318 / y 21~71)
    const bar = this.host.addChildPlainNode(root, 'TopBar', FX(935), FY(46), S(766), S(50));
    mountGlassSlice(this.host, bar, 'Glass', GLASS_SLICES.hudCapsule, 0, 0, S(766), S(50), k);
    this.pill(root, 'Tag', '突破试炼', FX(663), FY(46), S(128), S(32), k, S, 'outline');
    mountGlassLine(this.host, root, 'Sep1', FX(775), FY(46), Math.max(1, S(1)), S(24), new Color(255, 255, 255, 50));
    mountGlassLine(this.host, root, 'Sep2', FX(1160), FY(46), Math.max(1, S(1)), S(24), new Color(255, 255, 255, 50));
    glassLabel(this.host, root, 'Title', content.trialTitle, FX(967), FY(46), S(28), GLASS_COLOR.text, S(360), HorizontalTextAlignment.CENTER, true);
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
    glassLabel(this.host, root, 'BossName', content.boss, FX(619), FY(97), S(20), GLASS_COLOR.text, S(300));
    const bw = S(580);
    const bh = Math.max(4, S(16));
    const boss = this.host.addChildPlainNode(root, 'BossBar', FX(902), FY(124), bw, bh);
    (boss as unknown as { __gold?: boolean }).__gold = state.target === 'QILING';
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
      this.zeroDialogue(root, S, k, FX(890), FY(732), S(873), S(118), FX(522), content.openLine, GLASS_COLOR.text);
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
      // 心魔血红;天枢的幻影淡金
      fill.fillColor = (bar as unknown as { __gold?: boolean }).__gold ? new Color(214, 176, 92, 255) : new Color(178, 52, 50, 255);
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
      glassLabel(this.host, card, 'Title', realmBreakContent(state.target).killed, 0, S(40), S(36), GLASS_COLOR.text, S(560), HorizontalTextAlignment.CENTER, true);
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
    const content = realmBreakContent(realm.realmCode);
    const idx = LADDER.findIndex((item) => item.code === realm.realmCode);
    this.pill(root, 'From', idx > 0 ? LADDER[idx - 1].name : '觉醒', FX(524), FY(67), S(108), S(34), k, S, 'dim');
    glassLabel(this.host, root, 'Arrow', '→', FX(608), FY(66), S(26), GLASS_COLOR.text, S(40), HorizontalTextAlignment.CENTER);
    this.pill(root, 'To', realm.realmName || '炼魂', FX(692), FY(67), S(108), S(34), k, S, 'gold');
    glassLabel(this.host, root, 'Realm', `${realm.realmName || '炼魂'}境`, FX(608), FY(118), S(46), GLASS_COLOR.text, S(400), HorizontalTextAlignment.CENTER, true);
    this.stage(root, S, FX, FY, realmArt(realm.realmCode, gender), null, 0, 630, 420, 540, 752, 240);

    // 右:突破所得 + 前世记忆(原型 x 984~1694 / y 97~785)
    const panel = this.host.addChildPlainNode(root, 'Panel', FX(1339), FY(441), S(710), S(688));
    mountGlassSlice(this.host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, S(710), S(688), k);
    mountGlassSectionHeader(this.host, root, 'Gain', '突破所得', FX(1015), FY(133), k, 26);
    const rows = content.gains(realm);
    [182, 232, 281, 331].forEach((y, i) => {
      this.host.addSprite(`GainIcon${i}`, rows[i].icon, FX(1050), FY(y), S(36), S(36), root);
      glassLabel(this.host, root, `GainLabel${i}`, rows[i].label, FX(1105), FY(y), S(21), GLASS_COLOR.text, S(240));
      glassLabel(this.host, root, `GainValue${i}`, rows[i].value, FX(1657), FY(y), S(21), rows[i].gold ? GLASS_COLOR.champagne : GLASS_COLOR.text, S(380), HorizontalTextAlignment.RIGHT);
      mountGlassLine(this.host, root, `GainLine${i}`, FX(1339), FY(y + 25), S(650), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    });
    mountGlassSectionHeader(this.host, root, 'Memory', `前世记忆 · 其${content.memoryIndex === 2 ? '二' : '一'}`, FX(1015), FY(398), k, 26);
    const card = this.host.addChildPlainNode(root, 'MemoryCard', FX(1343), FY(520), S(658), S(180));
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.row, 0, 0, S(658), S(180), k);
    glassLabel(this.host, root, 'MemoryCaption', content.memory.caption, FX(1053), FY(461), S(17), GLASS_COLOR.sub, S(300));
    // LEFT 对齐时 x 是左沿(UiPrimitiveFactory 已按对齐平移框)
    const quote = this.host.addChildLabel(root, 'MemoryText', content.memory.text, FX(1053), FY(518), S(23), GLASS_COLOR.text, new Size(S(590), S(80)), HorizontalTextAlignment.LEFT);
    quote.overflow = Label.Overflow.SHRINK;
    quote.enableWrapText = true;
    quote.lineHeight = S(38);
    glassLabel(this.host, root, 'MemoryCount', `记忆碎片 ${content.memoryIndex} / ?`, FX(1640), FY(577), S(16), GLASS_COLOR.sub, S(200), HorizontalTextAlignment.RIGHT);
    if (leaving) {
      glassLabel(this.host, root, 'Next', '离开晨风村,前往主城', FX(1345), FY(652), S(20), GLASS_COLOR.sub, S(620), HorizontalTextAlignment.CENTER);
    }
    const go = mountGlassButton(this.host, root, 'Continue', '继续', FX(1342), FY(721), S(652), S(64), k, 'primary', () => this.handlers.continueDone(), 30);
    this.host.applyPointerCursor?.(go);
    this.zeroDialogue(root, S, k, FX(578), FY(760), S(747), S(95), FX(180), content.doneLine, GLASS_COLOR.text);
  }
}
