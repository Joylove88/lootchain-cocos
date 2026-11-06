import {
  Color,
  EventKeyboard,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  Input,
  KeyCode,
  Label,
  Node,
  Size,
  Sprite,
  SpriteFrame,
  UIOpacity,
  UITransform,
  Vec3,
  input,
  resources,
  sp,
  tween,
} from 'cc';
import { resolveTownHeroFxKit, TownCombatFx, type TownCombatFxHost, type TownHeroFxKit } from './LobbyTownCombatFx';
import { resolveBattleUnitSpineRuntimeData, resolveBattleUnitSpineSkinName } from './LobbyBattleUnitSpineRuntime';
import { heroClipCombo, HERO_SKILL_ACTION_CAP_MS } from './HeroClipCombos';
import { gameAudio } from '../../audio/GameAudio';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { REALM_ULT_BASE, RealmUltShow, realmUltCfg, realmUltTiming } from './RealmUltShow';
import { resolveHeroSkillSfxKey } from './LobbyBattleAttackFxConfig';
import {
  GUARD_RAID_SKILLS,
  GUARD_RAID_ULT,
  GUARD_RAID_TIME_LIMIT_MS,
  GUARD_RAID_COMBO,
  guardRaidAttack,
  guardRaidDodge,
  guardRaidMove,
  guardRaidSkill,
  guardRaidUlt,
  guardRaidCtl,
  guardRaidSwitch,
  type GuardBattleState,
  type GuardEvent,
  type GuardHeroUnit,
  type GuardMonster,
} from './GuardBattleModel';
import { resolveBattleUnitSpineAnimationNames, resolveBattleUnitSpineResource, type BattleUnitSpineAnimationNames } from './LobbyBattleUnitSpineRuntime';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import type { GuardUnitView, LobbyGuardBattleHost } from './LobbyGuardBattleRenderer';
import { TOWN_HUD_ASSETS, mountRingBase } from './LobbyTownHudProto';
import { GLASS_COLOR, GLASS_SLICES, mountGlassSlice } from '../UiGlassKit';
import { mountHeroAvatar } from './HeroHeadCrop';

/** 掠夺首领(NPC 矿主 / 真人矿对方主角)表现放大倍率(只影响表现,不进模型)。 */
const GUARD_RAID_BOSS_VIEW_SCALE = 1.7;

/**
 * docs/47 P0 掠夺模式·进攻侧(2026-10-25):玩家操控 1 个英雄冲守卫阵。
 * 这里只管"手"和"眼":摇杆 / 按钮 / 键盘 → 模型输入;模型事件 → 动画 / 顿帧 / 震屏 / 飘字 / 血条。
 * 规则全在 GuardBattleModel(guardRaid*),复演照旧走输入记录。
 * docs/61(2026-11-05 原型 battle_b3):HUD 换 B 毛玻璃(与野外 HUD 同一套圆钮 / 摇杆 / 线稿图标);主角带 3 名 AI 同伴;
 * 守矿首领顶部大血条;左上「我方输出」面板(DPS,可收起)。
 */
export interface GuardRaidBridge {
  host: LobbyGuardBattleHost;
  field(): Node | null;
  layout(): { width: number; height: number; uiScale: number };
  unitSize(): number;
  heroDisplaySize(): number;
  xToPx(x: number): number;
  /** 连续车道 0(上排)..1(下排)→ 屏幕 y(走道两侧随 x 汇聚,与怪物同口径)。 */
  laneY(laneF: number, x: number): number;
  cellCenter(cell: number): { x: number; y: number };
  heroViews(): Map<number, GuardUnitView>;
  /** side:双方可能同 heroCode(两边都是男主角 / 同名英雄),ours = 我方(同伴 / 主角),theirs = 守卫,boss = 首领(守卫里最后一个同码)。 */
  allyFor(heroCode: string, side?: 'ours' | 'theirs' | 'boss'): BattlePresentationUnitSnapshot | null;
  loadSpine(node: Node, fallback: Node, resource: string, size: number, mirror: boolean, view: GuardUnitView, ally: BattlePresentationUnitSnapshot): void;
  mountShade(parent: Node, name: string, x: number, y: number, width: number, height: number): Node | null;
  spawnFloater(x: number, y: number, text: string, color: Color, fontSize?: number): void;
  shakeField(amplitude: number): void;
  /** 进攻方斩中守卫的命中特效(英雄专属)。 */
  hitFx(heroCode: string, x: number, y: number, scale: number): void;
  attackSfx(heroCode: string): void;
  openSettings(): void;
  mountSprite(parent: Node, name: string, path: string, x: number, y: number, w: number, h: number): Node;
}

const rgba = (r: number, g: number, b: number, a = 255): Color => new Color(r, g, b, a);
const WHITE = new Color(255, 255, 255, 255);
const FLASH = new Color(255, 130, 110, 255);
/** 按键缓冲:盖住最长一段普攻锁时(第 5 段 752ms),出招中按的普攻 / 技能到取消点自动接上(同野外 bufferedInput;原 260ms 时第 3 / 5 段里按的技能直接丢了)。 */
const INPUT_BUFFER_MS = 800;
/** 原型 battle_b3 画布(1870×841):原型像素 × u(= 屏高 / 841),左侧件贴左缘、右侧件贴右缘、顶栏居中。 */
const PROTO_W = 1870;
const PROTO_H = 841;
/** 血条色(原型取色):我方柔绿 / 敌方柔红。 */
const BAR_GREEN = rgba(110, 206, 120, 250);
const BAR_RED = rgba(212, 82, 74, 250);
const BAR_BOSS = rgba(196, 58, 54, 252);
const CHAMPAGNE = GLASS_COLOR.champagne;
/** 输出面板刷新间隔(墙钟毫秒):数字每 0.5 秒跳一次,不每 tick 重排。 */
const DPS_REFRESH_MS = 500;
/** 主角三技能图标(与野外主角技能同一套白线稿):魂斩 / 契印爆发 / 残影步;非主角进攻方用野外通用图标。 */
const PROTAG_SKILL_ICONS = ['ui/glass/protag_skill_slash/spriteFrame', 'ui/glass/protag_skill_seal/spriteFrame', 'ui/glass/protag_skill_step/spriteFrame'];
const GENERIC_SKILL_ICONS = [TOWN_HUD_ASSETS.icSlash, TOWN_HUD_ASSETS.icDash, TOWN_HUD_ASSETS.icWhirl];

/** 原型坐标映射(以 HUD 根节点中心为原点)。 */
interface ProtoMap {
  u: number;
  L(px: number): number;
  R(px: number): number;
  C(px: number): number;
  Y(py: number): number;
  S(v: number): number;
}

/** 一个进攻方单位的表现(主角 / 同伴共用):视图、动画名、插值区间。 */
interface RaidUnitView {
  monsterId: number;
  heroCode: string;
  view: GuardUnitView;
  ally: BattlePresentationUnitSnapshot | null;
  names: BattleUnitSpineAnimationNames | null;
  loopAnim: string;
  oneShotUntil: number;
  /** 一次性动作的播放倍速(按野外上限加速播完;播完恢复 1)。 */
  oneShotSpeed: number;
  facing: 1 | -1;
  prevX: number;
  prevLane: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hpKey: string;
  barW: number;
  barH: number;
  deadShown: boolean;
}

/** 输出统计一行(我方 / 敌方共用)。 */
export interface GuardRaidStatRow {
  key: string;
  heroCode: string;
  name: string;
  damage: number;
  dps: number;
  protagonist: boolean;
  boss: boolean;
  dead: boolean;
}

export class GuardRaidController {
  private readonly keys = new Set<number>();
  private joy = { active: false, id: -1, dx: 0, dy: 0 };
  private joyBase: Node | null = null;
  private joyKnob: Node | null = null;
  private joyHome = new Vec3();
  private lastSyncedTimeMs = -1;
  private joyRadius = 70;
  private attackPressedAt = 0;
  private dodgePressedAt = 0;
  private skillPressedAt: [number, number, number] = [0, 0, 0];
  private ultPressedAt = 0;
  /** docs/61 §9 切换操控:请求切到的单位 monsterId(按键缓冲同普攻,出招中按的到取消点再切)。 */
  private switchTarget: { id: number; at: number } | null = null;
  /** docs/61 §9 底部切换头像栏(原型 switch_a):主角 + 3 同伴,当前操控金圈 + 小三角。 */
  private squadBar: { root: Node; slots: Array<{ monsterId: number; node: Node; ring: Graphics; hp: Graphics; marker: Node; size: number; key: string }> } | null = null;
  private controlKey = '';
  /** docs/61 §8 主角大招「夜帝残影」按钮(炼魂才有)。 */
  private ultButton: { node: Node; cd: Label; mask: Graphics; size: number; drawn: number } | null = null;
  private raiderUlt = false;
  private realmShowInst: RealmUltShow | null = null;
  private skillButtons: Array<{ node: Node; cd: Label; mask: Graphics; size: number; drawn: number }> = [];
  private dodgeButton: { node: Node; mask: Graphics; size: number; drawn: number } | null = null;
  private inputBound = false;
  private raider: RaidUnitView | null = null;
  private readonly allies = new Map<number, RaidUnitView>();
  private timerLabel: Label | null = null;
  private guardsLabel: Label | null = null;
  private crystalLabel: Label | null = null;
  private hud: Node | null = null;
  private proto: ProtoMap | null = null;
  private bossBar: { root: Node; fill: Graphics; pct: Label; w: number; h: number; drawn: number } | null = null;
  private bossBarChecked = false;
  private dpsPanel: Node | null = null;
  private dpsCollapsed = false;
  private dpsRows = new Map<string, { node: Node; bar: Graphics; dps: Label; total: Label }>();
  private dpsRefreshedAt = 0;
  private dpsLastKey = '';
  /** 顿帧截止(Date.now 毫秒):期间模拟不前进,只有画面。 */
  hitStopUntil = 0;

  constructor(private readonly bridge: GuardRaidBridge) {}

  // ── HUD ──

  mountHud(root: Node): void {
    const { width, height } = this.bridge.layout();
    const hud = this.bridge.host.addChildPlainNode(root, 'GuardRaidHud', 0, 0, width, height);
    this.hud = hud;
    const u = height / PROTO_H;
    this.proto = {
      u,
      L: (px) => -width / 2 + px * u,
      R: (px) => width / 2 - (PROTO_W - px) * u,
      C: (px) => (px - PROTO_W / 2) * u,
      Y: (py) => height / 2 - py * u,
      S: (v) => v * u,
    };
    // 原守卫战 HUD(统计 / 波次横幅 / 金币 / 设置 / 关闭 / 提示)整体隐藏:掠夺自己画(2026-10-26)
    const guardHud = root.getChildByName('GuardHud');
    if (guardHud) {
      guardHud.active = false;
    }
    this.renderTopBar(hud);
    this.renderJoystick(hud, width, height);
    this.renderButtons(hud);
    this.squadBar = null;
    if (!isPhoneDesign()) {
      const P = this.proto;
      const hint = this.bridge.host.addChildLabel(hud, 'GuardRaidKeyHint', `WASD / 方向键 移动 · J 普攻 · K L I 技能${this.raiderUlt ? ' · U 大招' : ''} · Shift 翻滚 · Q 切换操控`, P.C(935), P.Y(826), P.S(15), rgba(176, 184, 198, 150), new Size(width * 0.6, P.S(22)));
      hint.overflow = Label.Overflow.SHRINK;
    }
    this.bindInput();
  }

  /** 顶栏(原型 battle_b3):左「< 矿境掠夺」/ 中状态胶囊「剩余 | 守卫 | 水晶」/ 右暂停 + 设置圆钮。 */
  private renderTopBar(hud: Node): void {
    const host = this.bridge.host;
    const P = this.proto!;
    // 返回:打开战斗设置(设置里可退出,与暂停钮同一入口)
    const back = host.addChildPlainNode(hud, 'GuardRaidBack', P.L(150), P.Y(42), P.S(240), P.S(60));
    const arrow = host.addChildPlainNode(back, 'Arrow', -P.S(88), 0, P.S(30), P.S(40)).addComponent(Graphics);
    arrow.strokeColor = GLASS_COLOR.text;
    arrow.lineWidth = Math.max(2, P.S(3.2));
    arrow.moveTo(P.S(6), P.S(15));
    arrow.lineTo(-P.S(8), 0);
    arrow.lineTo(P.S(6), -P.S(15));
    arrow.stroke();
    const title = host.addChildLabel(back, 'Title', '矿境掠夺', -P.S(58), 0, P.S(32), GLASS_COLOR.text, new Size(P.S(190), P.S(44)), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    back.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
      this.bridge.openSettings();
    }, this);
    host.applyImageButtonFeedback(back, 1.03, 0.97);
    // 状态胶囊
    const capW = P.S(680);
    const capH = P.S(58);
    const cap = host.addChildPlainNode(hud, 'GuardRaidTopBar', P.C(956), P.Y(57), capW, capH);
    if (!mountGlassSlice(host, cap, 'Glass', GLASS_SLICES.hudCapsule, 0, 0, capW, capH, P.u)) {
      const g = cap.addComponent(Graphics);
      g.fillColor = rgba(18, 22, 30, 205);
      g.roundRect(-capW / 2, -capH / 2, capW, capH, capH / 2);
      g.fill();
    }
    const div = host.addChildPlainNode(cap, 'Dividers', 0, 0, capW, capH).addComponent(Graphics);
    div.strokeColor = rgba(200, 208, 220, 90);
    div.lineWidth = Math.max(1, P.S(1.5));
    for (const x of [P.S(-106), P.S(99)]) {
      div.moveTo(x, -capH * 0.28);
      div.lineTo(x, capH * 0.28);
    }
    div.stroke();
    const mkText = (name: string, x: number): Label => {
      const label = host.addChildLabel(cap, name, '', x, 0, P.S(30), GLASS_COLOR.text, new Size(P.S(196), capH));
      label.overflow = Label.Overflow.SHRINK;
      return label;
    };
    this.timerLabel = mkText('GuardRaidTimer', P.S(-221));
    this.guardsLabel = mkText('GuardRaidGuards', P.S(-4));
    this.crystalLabel = mkText('GuardRaidCrystal', P.S(224));
    // 暂停 / 设置(都打开战斗设置,设置里本来就是"已暂停")
    const mkRound = (name: string, px: number): Node => {
      const d = P.S(64);
      const node = host.addChildPlainNode(hud, name, P.R(px), P.Y(55), d, d);
      mountRingBase(host, node, d * 1.12);
      node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        event.propagationStopped = true;
        this.bridge.openSettings();
      }, this);
      host.applyImageButtonFeedback(node, 1.06, 0.94);
      return node;
    };
    const pause = mkRound('GuardRaidPause', 1698);
    const pg = host.addChildPlainNode(pause, 'Glyph', 0, 0, P.S(40), P.S(40)).addComponent(Graphics);
    pg.fillColor = GLASS_COLOR.text;
    pg.roundRect(-P.S(9), -P.S(12), P.S(6), P.S(24), P.S(2));
    pg.roundRect(P.S(3), -P.S(12), P.S(6), P.S(24), P.S(2));
    pg.fill();
    const gear = mkRound('GuardRaidSettings', 1792);
    const gg = host.addChildPlainNode(gear, 'Glyph', 0, 0, P.S(40), P.S(40)).addComponent(Graphics);
    gg.fillColor = GLASS_COLOR.text;
    const teeth = 8;
    const ro = P.S(15);
    const ri = P.S(11);
    for (let i = 0; i < teeth * 2; i += 1) {
      const a = (Math.PI * i) / teeth;
      const r = i % 2 === 0 ? ro : ri;
      const half = Math.PI / (teeth * 2.4);
      const x1 = Math.cos(a - half) * r;
      const y1 = Math.sin(a - half) * r;
      const x2 = Math.cos(a + half) * r;
      const y2 = Math.sin(a + half) * r;
      if (i === 0) {
        gg.moveTo(x1, y1);
      } else {
        gg.lineTo(x1, y1);
      }
      gg.lineTo(x2, y2);
    }
    gg.close();
    gg.fill();
    gg.fillColor = rgba(34, 38, 43, 255);
    gg.circle(0, 0, P.S(5));
    gg.fill();
  }

  /** 摇杆(与野外 HUD 同一套:淡磨砂圆盘 + 细环 + 四箭头;浮动摇杆,左半屏任意处按下)。 */
  private renderJoystick(hud: Node, width: number, height: number): void {
    const host = this.bridge.host;
    const P = this.proto!;
    const baseD = P.S(210);
    const radius = baseD * 0.29;
    this.joyRadius = radius;
    const homeX = P.L(160);
    const homeY = P.Y(692);
    this.joyHome = new Vec3(homeX, homeY, 0);
    const padW = width * 0.45;
    const padH = height * 0.7;
    const pad = host.addChildPlainNode(hud, 'GuardRaidJoyPad', -width / 2 + padW / 2, -height / 2 + padH / 2, padW, padH);
    const base = host.addChildPlainNode(hud, 'GuardRaidJoyBase', homeX, homeY, baseD, baseD);
    const baseArt = host.addSprite('Art', TOWN_HUD_ASSETS.hudJoyBase, 0, 0, baseD, baseD, base);
    if (!baseArt) {
      const bg = base.addComponent(Graphics);
      bg.fillColor = rgba(18, 22, 28, 120);
      bg.circle(0, 0, baseD * 0.47);
      bg.fill();
      bg.strokeColor = rgba(176, 186, 200, 170);
      bg.lineWidth = Math.max(1.2, baseD * 0.01);
      bg.circle(0, 0, baseD * 0.47);
      bg.stroke();
    }
    const knobD = baseD * 0.4;
    const knob = host.addChildPlainNode(base, 'Knob', 0, 0, knobD, knobD);
    if (!host.addSprite('Art', TOWN_HUD_ASSETS.hudJoyKnob, 0, 0, knobD, knobD, knob)) {
      const kg = knob.addComponent(Graphics);
      kg.fillColor = rgba(92, 104, 118, 215);
      kg.circle(0, 0, knobD / 2);
      kg.fill();
    }
    this.joyBase = base;
    this.joyKnob = knob;
    const toLocal = (event: EventTouch): Vec3 => {
      const ui = event.getUILocation();
      return hud.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    };
    const apply = (local: Vec3): void => {
      if (!this.joyBase || !this.joyBase.isValid) {
        return;
      }
      let dx = local.x - this.joyBase.position.x;
      let dy = local.y - this.joyBase.position.y;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      this.joyKnob?.setPosition(dx, dy, 0);
      const mag = Math.hypot(dx, dy);
      this.joy.dx = mag < radius * 0.15 ? 0 : dx / radius;
      this.joy.dy = mag < radius * 0.15 ? 0 : dy / radius;
    };
    const release = (): void => {
      this.joy = { active: false, id: -1, dx: 0, dy: 0 };
      this.joyKnob?.setPosition(0, 0, 0);
      this.joyBase?.setPosition(this.joyHome);
    };
    pad.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      if (this.joy.active) {
        return;
      }
      const local = toLocal(event);
      this.joy = { active: true, id: event.getID() ?? 0, dx: 0, dy: 0 };
      this.joyBase?.setPosition(local.x, local.y, 0);
      this.joyKnob?.setPosition(0, 0, 0);
    }, this);
    pad.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      if (this.joy.active && (event.getID() ?? 0) === this.joy.id) {
        apply(toLocal(event));
      }
    }, this);
    pad.on(Node.EventType.TOUCH_END, release, this);
    pad.on(Node.EventType.TOUCH_CANCEL, release, this);
  }

  /** 右下战斗簇(与野外 HUD 同坐标:普攻大圆 + 三技能弧排 + 翻滚);电脑端挂按键角标。 */
  private renderButtons(hud: Node): void {
    const host = this.bridge.host;
    const P = this.proto!;
    const showKeys = !isPhoneDesign();
    const mk = (name: string, px: number, py: number, d: number, hot: boolean, icon: string, iconK: number, key: string, onPress: () => void): { node: Node; size: number } => {
      const size = P.S(d);
      const node = host.addChildPlainNode(hud, name, P.R(px), P.Y(py), size, size);
      mountRingBase(host, node, size * 1.12, hot);
      this.mountIcon(node, 'Icon', icon, size * iconK);
      if (showKeys && key) {
        const r = size * 0.15;
        const bw = key.length > 1 ? r * (1.2 + key.length * 0.62) : r * 2;
        const badge = host.addChildPlainNode(node, 'KeyHint', size * 0.36 - (bw / 2 - r) * 0.5, size * 0.36, bw, r * 2);
        const bg = badge.addComponent(Graphics);
        bg.fillColor = rgba(20, 24, 30, 235);
        bg.roundRect(-bw / 2, -r, bw, r * 2, r);
        bg.fill();
        bg.strokeColor = rgba(184, 192, 202, 220);
        bg.lineWidth = 1.5;
        bg.roundRect(-bw / 2, -r, bw, r * 2, r);
        bg.stroke();
        const k = host.addChildLabel(badge, 'Key', key, 0, 0, key.length > 1 ? r * 0.9 : r * 1.15, GLASS_COLOR.text, new Size(bw - r * 0.5, r * 1.6));
        k.isBold = true;
        k.overflow = Label.Overflow.SHRINK;
      }
      // 按下即生效(不等抬起):动作游戏的按钮不能有抬起延迟
      node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
        event.propagationStopped = true;
        onPress();
      }, this);
      host.applyImageButtonFeedback(node, 1.06, 0.94);
      return { node, size };
    };
    const A = TOWN_HUD_ASSETS;
    mk('GuardRaidAttack', 1668, 690, 165, true, A.icSword, 0.6, 'J', () => { this.attackPressedAt = Date.now(); });
    const dodge = mk('GuardRaidDodge', 1522, 712, 84, false, A.icDodge, 0.6, 'Shift', () => { this.dodgePressedAt = Date.now(); });
    this.dodgeButton = { node: dodge.node, mask: this.mountCdMask(dodge.node, dodge.size), size: dodge.size, drawn: -1 };
    this.skillButtons = [];
    // HUD 重建后按当前操控重刷技能图标 / 大招钮(refreshControlHud 按 controlKey 去重)
    this.controlKey = '';
    const slots: Array<[number, number]> = [[1560, 598], [1666, 520], [1773, 590]];
    GUARD_RAID_SKILLS.forEach((_spec, index) => {
      const [px, py] = slots[index];
      const icon = (this.protagonistRaider() ? PROTAG_SKILL_ICONS : GENERIC_SKILL_ICONS)[index] ?? A.icSlash;
      const button = mk(`GuardRaidSkill_${index}`, px, py, 92, false, icon, 0.62, ['K', 'L', 'I'][index] ?? '', () => { this.skillPressedAt[index] = Date.now(); });
      const mask = this.mountCdMask(button.node, button.size);
      const cd = host.addChildLabel(button.node, 'Cd', '', 0, 0, button.size * 0.36, rgba(244, 244, 248), new Size(button.size, button.size * 0.5));
      cd.isBold = true;
      cd.enableOutline = true;
      cd.outlineColor = rgba(10, 12, 16, 255);
      cd.outlineWidth = 2;
      this.skillButtons.push({ node: button.node, cd, mask, size: button.size, drawn: -1 });
    });
    // docs/61 §8 炼魂大招「夜帝残影」:位置同野外(技能簇左上,原型 field_b / realm_ult_yedi_a)
    this.ultButton = null;
    if (this.raiderUlt) {
      const button = mk('GuardRaidRealmUlt', 1560, 470, 104, true, REALM_ULT_BASE.icon, 0.72, 'U', () => { this.ultPressedAt = Date.now(); });
      const mask = this.mountCdMask(button.node, button.size);
      const cd = host.addChildLabel(button.node, 'Cd', '', 0, 0, button.size * 0.34, rgba(244, 244, 248), new Size(button.size, button.size * 0.5));
      cd.isBold = true;
      cd.enableOutline = true;
      cd.outlineColor = rgba(10, 12, 16, 255);
      cd.outlineWidth = 2;
      this.ultButton = { node: button.node, cd, mask, size: button.size, drawn: -1 };
      this.realmShow.prewarm();
    }
  }

  /**
   * 线稿图标:按原图比例装进 box×box(不拉伸);没进缓存就异步加载后再套(宿主 addSprite 未缓存时直接返回 null,
   * 首局开战时图标会整颗缺失,11-05 正式包实测)。
   */
  private mountIcon(parent: Node, name: string, path: string, box: number): void {
    const node = this.bridge.host.addChildPlainNode(parent, name, 0, 0, box, box);
    const apply = (frame: SpriteFrame | null): void => {
      if (!frame || !node.isValid) {
        return;
      }
      const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      const o = frame.originalSize;
      const k = Math.min(box / Math.max(1, o.width), box / Math.max(1, o.height));
      node.getComponent(UITransform)?.setContentSize(o.width * k, o.height * k);
    };
    const cached = resources.get(path, SpriteFrame);
    if (cached) {
      apply(cached);
      return;
    }
    resources.load(path, SpriteFrame, (error: Error | null, frame: SpriteFrame | null) => apply(error ? null : frame));
  }

  private mountCdMask(parent: Node, size: number): Graphics {
    return this.bridge.host.addChildPlainNode(parent, 'CdMask', 0, 0, size, size).addComponent(Graphics);
  }

  /** 进攻方是主角(docs/61):技能钮换主角三技能图标、名字显示主角。 */
  private protagonistRaider(): boolean {
    return this.raiderSnapshot()?.unitKey.startsWith('raider-') ?? false;
  }

  private raiderSnapshot(): BattlePresentationUnitSnapshot | null {
    return this.raiderCode ? this.bridge.allyFor(this.raiderCode, 'ours') : null;
  }

  private raiderCode = '';

  /** 渲染器建场后告知进攻方英雄码(HUD 早于首个 tick 建好,技能图标要按主角 / 英雄区分)与能否放大招(回执 raider.ult)。 */
  setRaiderCode(heroCode: string, ult = false): void {
    this.raiderCode = heroCode;
    this.raiderUlt = ult;
  }

  // ── 输入 ──

  private bindInput(): void {
    if (this.inputBound) {
      return;
    }
    this.inputBound = true;
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  dispose(): void {
    if (this.inputBound) {
      input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
      input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
      this.inputBound = false;
    }
    this.keys.clear();
    this.raider = null;
    this.allies.clear();
    this.skillButtons = [];
    this.dodgeButton = null;
    this.ultButton = null;
    this.squadBar = null;
    this.bossBar = null;
    this.dpsPanel = null;
    this.dpsRows.clear();
  }

  private onKeyDown(event: EventKeyboard): void {
    this.keys.add(event.keyCode);
    const now = Date.now();
    switch (event.keyCode) {
      // 2026-10-26 用户:「攻击、技能键绑定 J K L,翻滚键绑定 Shift」→ J 普攻 / K 技能一 / L 技能二 / I 技能三 / Shift 翻滚;空格、数字键 1 2 3 备用
      case KeyCode.KEY_J: case KeyCode.SPACE: this.attackPressedAt = now; break;
      case KeyCode.SHIFT_LEFT: case KeyCode.SHIFT_RIGHT: this.dodgePressedAt = now; break;
      case KeyCode.KEY_K: case KeyCode.DIGIT_1: this.skillPressedAt[0] = now; break;
      case KeyCode.KEY_L: case KeyCode.DIGIT_2: this.skillPressedAt[1] = now; break;
      case KeyCode.KEY_I: case KeyCode.DIGIT_3: this.skillPressedAt[2] = now; break;
      case KeyCode.KEY_U: case KeyCode.DIGIT_4: if (this.raiderUlt) { this.ultPressedAt = now; } break;
      case KeyCode.KEY_Q: this.cycleSwitch(this.lastSim); break;
      default: break;
    }
  }

  private onKeyUp(event: EventKeyboard): void {
    this.keys.delete(event.keyCode);
  }

  private moveDir(): number {
    let x = 0;
    let y = 0;
    if (this.joy.active) {
      x = this.joy.dx;
      y = this.joy.dy;
    } else {
      if (this.keys.has(KeyCode.KEY_A) || this.keys.has(KeyCode.ARROW_LEFT)) x -= 1;
      if (this.keys.has(KeyCode.KEY_D) || this.keys.has(KeyCode.ARROW_RIGHT)) x += 1;
      if (this.keys.has(KeyCode.KEY_W) || this.keys.has(KeyCode.ARROW_UP)) y += 1;
      if (this.keys.has(KeyCode.KEY_S) || this.keys.has(KeyCode.ARROW_DOWN)) y -= 1;
    }
    if (Math.hypot(x, y) < 0.2) {
      return 0;
    }
    // 8 向量化:按角度分 8 扇区(1 上,顺时针)
    const angle = Math.atan2(x, y);
    const sector = Math.round(angle / (Math.PI / 4));
    return ((sector + 8) % 8) + 1;
  }

  /** 每个模拟 tick 前:记下插值起点,把当前输入喂给模型(方向只在变化时记录;按键有 260ms 缓冲)。 */
  beforeTick(sim: GuardBattleState): void {
    if (sim.phase !== 'wave' || !sim.raider) {
      return;
    }
    for (const unit of this.unitViews()) {
      const monster = sim.monsters.find((entry) => entry.monsterId === unit.monsterId);
      if (monster) {
        unit.prevX = monster.x;
        unit.prevLane = monster.laneF ?? 0.5;
      }
    }
    this.lastSim = sim;
    const now = Date.now();
    const sw = this.switchTarget;
    if (sw && now - sw.at <= INPUT_BUFFER_MS) {
      if (guardRaidSwitch(sim, sw.id) || guardRaidCtl(sim)?.monsterId === sw.id) {
        this.switchTarget = null;
      }
    } else {
      this.switchTarget = null;
    }
    guardRaidMove(sim, this.moveDir());
    if (this.dodgePressedAt && now - this.dodgePressedAt <= INPUT_BUFFER_MS) {
      if (guardRaidDodge(sim)) {
        this.dodgePressedAt = 0;
      }
    } else {
      this.dodgePressedAt = 0;
    }
    if (this.ultPressedAt && now - this.ultPressedAt <= INPUT_BUFFER_MS) {
      if (guardRaidUlt(sim)) {
        this.ultPressedAt = 0;
      }
    } else {
      this.ultPressedAt = 0;
    }
    for (let i = 0; i < 3; i += 1) {
      const at = this.skillPressedAt[i];
      if (at && now - at <= INPUT_BUFFER_MS) {
        if (guardRaidSkill(sim, i)) {
          this.skillPressedAt[i] = 0;
        }
      } else {
        this.skillPressedAt[i] = 0;
      }
    }
    if (this.attackPressedAt && now - this.attackPressedAt <= INPUT_BUFFER_MS) {
      if (guardRaidAttack(sim)) {
        this.attackPressedAt = 0;
      }
    } else {
      this.attackPressedAt = 0;
    }
  }

  // ── 事件 → 表现 ──

  afterTick(sim: GuardBattleState, events: readonly GuardEvent[]): void {
    for (const event of events) {
      // docs/61 §9:出招 / 受击按事件里的单位找视图(操控同伴时出招的是同伴)
      const raider = event.type === 'defeat' ? this.raider : this.viewOf(event.monsterId) ?? this.raider;
      switch (event.type) {
        case 'raidSwing':
          if (raider) {
            this.bridge.attackSfx(raider.heroCode);
            this.playSwing(raider, Math.max(1, event.level ?? 1), sim);
          }
          break;
        case 'raidSwitch':
          this.onSwitched(sim, event.level === 1);
          break;
        case 'raidSkill': {
          const index = event.level ?? 0;
          if (raider) {
            // 同野外 skillAnimKind:重斩 = skill3(没有 ult 的骨骼 skill2)、突进斩 = 有专属连招时 skill2 否则 skill1、旋风斩 = ult;按野外上限加速播完
            const names = raider.names;
            const kind: 'skill1' | 'skill2' | 'skill3' | 'ult' = index === 0 ? (names?.ult ? 'skill3' : 'skill2')
              : index === 1 ? (heroClipCombo(raider.ally?.spineAsset) && names?.skill2 ? 'skill2' : 'skill1')
                : 'ult';
            this.playAction(raider, kind, HERO_SKILL_ACTION_CAP_MS[index] ?? 1200, sim);
            // 技能特效对齐野外(resolveLeaderHit):在第一下命中的时刻播(模型命中点同源)
            const firstHit = GUARD_RAID_SKILLS[index]?.hits[0] ?? 300;
            setTimeout(() => this.playSkillFx(index, sim, raider), firstHit);
          }
          gameAudio.sfx('wave_start', 0.5);
          break;
        }
        case 'raidUlt':
          this.playRealmUlt(sim);
          break;
        case 'raidDodge':
          if (raider) {
            this.playOneShot(raider, raider.names?.move ?? raider.names?.idle, 360, sim);
            const opacity = raider.view.node.getComponent(UIOpacity) ?? raider.view.node.addComponent(UIOpacity);
            opacity.opacity = 150;
            setTimeout(() => { if (raider.view.node.isValid) { opacity.opacity = 255; } }, 320);
          }
          break;
        case 'raidHit': {
          const view = this.guardView(sim, event.cell);
          const heavy = !!event.crit;
          const facing = raider?.facing ?? -1;
          const ult = event.skillName === 'ult';
          if (view && view.node.isValid && ult) {
            // 大招命中:紫粉暗能量爆点(同野外 resolveRealmUltHit / impactMonster 的 hitOverride)+ 大号飘字
            const field = this.bridge.field();
            const hit = realmUltCfg().hit;
            const k = this.fxScale();
            view.hitFlashUntil = Date.now() + 160;
            if (field && field.isValid) {
              this.fx.play(field, hit, view.node.position.x - (facing < 0 ? 1 : -1) * 10 * k, view.node.position.y + this.bridge.unitSize() * 0.25, 150 * hit.size * k, { flipX: facing < 0 });
            }
            this.bridge.spawnFloater(view.node.position.x, view.node.position.y + this.bridge.unitSize() * 0.6, `-${event.amount ?? 0}`, rgba(226, 170, 255), 28);
            const push = (facing < 0 ? -1 : 1) * 22;
            const base = view.node.position.clone();
            tween(view.node).to(0.06, { position: new Vec3(base.x + push, base.y, 0) }).to(0.12, { position: base }).start();
          } else if (view && view.node.isValid) {
            view.hitFlashUntil = Date.now() + (heavy ? 140 : 90);
            this.bridge.hitFx(raider?.heroCode ?? '', view.node.position.x - (facing < 0 ? -1 : 1) * this.bridge.unitSize() * 0.1, view.node.position.y + this.bridge.unitSize() * 0.25, heavy ? 1.15 : 0.85);
            this.bridge.spawnFloater(view.node.position.x, view.node.position.y + this.bridge.unitSize() * 0.55, `-${event.amount ?? 0}`, heavy ? rgba(255, 196, 80) : rgba(255, 236, 200), heavy ? 24 : 18);
            // 受击顶退:往远离进攻方的方向顶一下再弹回
            const push = (facing < 0 ? -1 : 1) * (heavy ? 14 : 7);
            const base = view.node.position.clone();
            tween(view.node).to(0.05, { position: new Vec3(base.x + push, base.y, 0) }).to(0.09, { position: base }).start();
          }
          this.hitStopUntil = Math.max(this.hitStopUntil, Date.now() + (ult ? 140 : heavy ? 110 : 55));
          this.bridge.shakeField(ult ? 20 : heavy ? 12 : 5);
          gameAudio.sfx(heavy ? 'chest_land' : 'merge', heavy ? 0.9 : 0.5);
          break;
        }
        case 'raidAllyAttack': {
          // 同伴出手:动作 + 目标受击(轻反馈,不顿帧不震屏,主角的手感不被同伴稀释)
          // 主角交 AI 时(docs/61 §9)出手事件的单位是主角
          const unit = this.viewOf(event.monsterId);
          if (unit) {
            // 同野外同伴:整段攻击动作按 750ms 上限播完(原 420ms 就切回待机,动作只露起手)
            this.playAction(unit, 'attack', 750, sim);
          }
          const view = event.cell !== undefined && event.cell >= 0 ? this.guardView(sim, event.cell) : undefined;
          if (view && view.node.isValid) {
            view.hitFlashUntil = Date.now() + 80;
            this.bridge.hitFx(event.heroCode ?? '', view.node.position.x, view.node.position.y + this.bridge.unitSize() * 0.25, 0.7);
            this.bridge.spawnFloater(view.node.position.x + this.bridge.unitSize() * 0.12, view.node.position.y + this.bridge.unitSize() * 0.48, `-${event.amount ?? 0}`, rgba(214, 222, 236), 15);
          }
          break;
        }
        case 'heroDead':
          this.bridge.shakeField(8);
          gameAudio.sfx('forge_success', 0.7);
          break;
        case 'raidHurt': {
          const unit = this.viewOf(event.monsterId);
          const ctlId = guardRaidCtl(sim)?.monsterId;
          if (unit && unit.view.node.isValid) {
            unit.view.hitFlashUntil = Date.now() + 110;
            const own = unit.monsterId === ctlId;
            this.bridge.spawnFloater(unit.view.node.position.x, unit.view.node.position.y + this.bridge.unitSize() * 0.6, `-${event.amount ?? 0}`, own ? rgba(255, 110, 100) : rgba(236, 140, 130), own ? 20 : 15);
            // 出招中(普攻切片 / 技能)只闪红不播受击:原来每挨一下都切 hit 动作,把正在出的刀 / 技能打断(11-06 用户「攻击技能都不放」)
            if (own && Date.now() >= unit.oneShotUntil) {
              this.playOneShot(unit, unit.names?.hit, 160, sim);
            }
          }
          if (unit && unit.monsterId === ctlId) {
            this.bridge.shakeField(4);
          }
          break;
        }
        case 'raidAllyDead': {
          const unit = this.viewOf(event.monsterId);
          if (unit) {
            this.showUnitDeath(unit);
          }
          break;
        }
        case 'crystalHit':
          if (event.monsterId === guardRaidCtl(sim)?.monsterId) {
            this.hitStopUntil = Math.max(this.hitStopUntil, Date.now() + 70);
            this.bridge.shakeField(9);
          }
          break;
        case 'defeat':
          if (raider) {
            this.playOneShot(raider, raider.names?.death, 2000, sim);
          }
          break;
        default:
          break;
      }
    }
  }

  /** monsterId → 我方单位视图(主角 / 同伴)。 */
  private viewOf(monsterId: number | undefined): RaidUnitView | undefined {
    if (monsterId === undefined) {
      return undefined;
    }
    return this.raider && this.raider.monsterId === monsterId ? this.raider : this.allies.get(monsterId);
  }

  /** 请求切换操控到 monsterId(头像 / Q 键);实际切换在下一 tick 前喂给模型(冷却 / 出招中由模型拒绝,缓冲 800ms)。 */
  requestSwitch(monsterId: number): void {
    this.switchTarget = { id: monsterId, at: Date.now() };
  }

  /** Q 键:按 主角 → 同伴 1 → 2 → 3 轮换到下一个活着的。 */
  private cycleSwitch(sim: GuardBattleState | null): void {
    if (!sim || !sim.raider || sim.raidAllies.length === 0) {
      return;
    }
    const order = [sim.raider.monsterId, ...sim.raidAllies.map((ally) => ally.monsterId)];
    const cur = guardRaidCtl(sim)?.monsterId ?? sim.raider.monsterId;
    const start = Math.max(0, order.indexOf(cur));
    for (let i = 1; i < order.length; i += 1) {
      const id = order[(start + i) % order.length];
      if (sim.monsters.some((monster) => monster.monsterId === id && !monster.dead)) {
        this.requestSwitch(id);
        return;
      }
    }
  }

  private lastSim: GuardBattleState | null = null;

  /** 切换后:按键缓冲作废、技能图标换成该英雄那套、大招钮置灰 / 恢复、头像栏刷新;自动切回给个提示。 */
  private onSwitched(sim: GuardBattleState, auto: boolean): void {
    this.attackPressedAt = 0;
    this.dodgePressedAt = 0;
    this.skillPressedAt = [0, 0, 0];
    this.ultPressedAt = 0;
    this.refreshControlHud(sim);
    const unit = this.viewOf(guardRaidCtl(sim)?.monsterId);
    if (unit && unit.view.node.isValid) {
      this.bridge.spawnFloater(unit.view.node.position.x, unit.view.node.position.y + this.bridge.unitSize() * 0.8, auto ? '同伴倒下 · 切回主角' : '操控', CHAMPAGNE, auto ? 20 : 16);
    }
    gameAudio.sfx('merge', 0.4);
  }

  /** 按当前操控刷新:技能图标(主角三技能 / 同伴通用三技能)、大招钮可用态、头上「这是你」标记。 */
  private refreshControlHud(sim: GuardBattleState): void {
    const ctl = guardRaidCtl(sim);
    if (!ctl) {
      return;
    }
    const key = `${ctl.monsterId}`;
    if (key === this.controlKey) {
      return;
    }
    this.controlKey = key;
    const lead = ctl === sim.raider;
    const icons = lead && this.protagonistRaider() ? PROTAG_SKILL_ICONS : GENERIC_SKILL_ICONS;
    this.skillButtons.forEach((button, index) => {
      if (!button.node.isValid) {
        return;
      }
      const old = button.node.getChildByName('Icon');
      if (old) {
        old.destroy();
      }
      this.mountIcon(button.node, 'Icon', icons[index] ?? TOWN_HUD_ASSETS.icSlash, button.size * 0.62);
      button.node.getChildByName('Icon')?.setSiblingIndex(Math.max(0, (button.node.getChildByName('CdMask')?.getSiblingIndex() ?? 1) - 1));
      button.drawn = -1;
    });
    const ult = this.ultButton;
    if (ult && ult.node.isValid) {
      const op = ult.node.getComponent(UIOpacity) ?? ult.node.addComponent(UIOpacity);
      op.opacity = lead ? 255 : 90;
    }
    for (const unit of this.unitViews()) {
      const marker = unit.view.node.getChildByName('RaidMeMarker');
      if (marker) {
        marker.active = unit.monsterId === ctl.monsterId;
      }
    }
  }

  /**
   * 底部切换头像栏(原型 switch_a,用户 11-06 选 A;1870×841:中心 x 935、y 760,直径 84、当前操控 96、间距 22):
   * 圆形头像 + 毛玻璃底环 + 头像下细血条;当前操控 = 香槟金圈 + 头顶小倒三角,其余略暗;倒下灰掉不可点。按下即切(冷却 / 出招中由模型拒绝)。
   */
  private mountSquadBar(sim: GuardBattleState): void {
    const hud = this.hud;
    const P = this.proto;
    const raider = sim.raider;
    if (!hud || !hud.isValid || !P || !raider || sim.raidAllies.length === 0 || sim.raidClear) {
      return;
    }
    const host = this.bridge.host;
    const ids = [raider.monsterId, ...sim.raidAllies.map((ally) => ally.monsterId)];
    const codes = [raider.heroCode, ...sim.raidAllies.map((ally) => ally.heroCode)];
    // 原型 y 760;电脑端底部还有一行按键提示(y 826),整体上移到 742 免得血条压字
    const root = host.addChildPlainNode(hud, 'GuardRaidSquadBar', P.C(935), P.Y(isPhoneDesign() ? 760 : 742), P.S(106 * ids.length), P.S(130));
    const slots: Array<{ monsterId: number; node: Node; ring: Graphics; hp: Graphics; marker: Node; size: number; key: string }> = [];
    ids.forEach((monsterId, i) => {
      const size = P.S(84);
      const node = host.addChildPlainNode(root, `Slot_${i}`, P.S((i - (ids.length - 1) / 2) * 106), 0, size * 1.16, size * 1.16);
      const base = node.addComponent(Graphics);
      base.fillColor = rgba(20, 24, 33, 200);
      base.circle(0, 0, size * 0.52);
      base.fill();
      const avatar = host.addChildPlainNode(node, 'Avatar', 0, 0, size * 0.9, size * 0.9);
      mountHeroAvatar(avatar, codes[i], size * 0.9, 'circle');
      const ring = host.addChildPlainNode(node, 'Ring', 0, 0, size * 1.16, size * 1.16).addComponent(Graphics);
      const hp = host.addChildPlainNode(node, 'Hp', 0, -size * 0.66, size * 0.86, P.S(6)).addComponent(Graphics);
      const marker = host.addChildPlainNode(node, 'Marker', 0, size * 0.7, P.S(18), P.S(12));
      const tri = marker.addComponent(Graphics);
      tri.fillColor = CHAMPAGNE;
      tri.moveTo(-P.S(8), P.S(5));
      tri.lineTo(P.S(8), P.S(5));
      tri.lineTo(0, -P.S(5));
      tri.close();
      tri.fill();
      node.addComponent(UIOpacity);
      node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
        event.propagationStopped = true;
        this.requestSwitch(monsterId);
      }, this);
      slots.push({ monsterId, node, ring, hp, marker, size, key: '' });
    });
    this.squadBar = { root, slots };
  }

  private syncSquadBar(sim: GuardBattleState): void {
    if (!this.squadBar || !this.squadBar.root.isValid) {
      this.squadBar = null;
      this.mountSquadBar(sim);
      if (!this.squadBar) {
        return;
      }
    }
    const ctlId = guardRaidCtl(sim)?.monsterId;
    const cooling = sim.timeMs < sim.raidSwitchReadyMs;
    const P = this.proto!;
    for (const slot of this.squadBar.slots) {
      const monster = sim.monsters.find((entry) => entry.monsterId === slot.monsterId);
      const ratio = monster ? Math.max(0, monster.hp) / Math.max(1, monster.maxHp) : 0;
      const dead = !monster || monster.dead;
      const on = slot.monsterId === ctlId;
      const key = `${on ? 1 : 0}${dead ? 1 : 0}${cooling ? 1 : 0}${Math.round(ratio * 40)}`;
      if (key === slot.key) {
        continue;
      }
      slot.key = key;
      const r = slot.size * 0.52;
      slot.ring.clear();
      slot.ring.lineWidth = on ? Math.max(2, P.S(2.6)) : Math.max(1, P.S(1.2));
      slot.ring.strokeColor = on ? CHAMPAGNE : rgba(255, 255, 255, 40);
      slot.ring.circle(0, 0, on ? r + P.S(2) : r);
      slot.ring.stroke();
      slot.node.setScale(on ? 96 / 84 : 1, on ? 96 / 84 : 1, 1);
      slot.marker.active = on;
      const op = slot.node.getComponent(UIOpacity);
      if (op) {
        op.opacity = dead ? 80 : on ? 255 : cooling ? 150 : 215;
      }
      const w = slot.size * 0.86;
      const h = P.S(6);
      slot.hp.clear();
      slot.hp.fillColor = rgba(0, 0, 0, 150);
      slot.hp.roundRect(-w / 2, -h / 2, w, h, h / 2);
      slot.hp.fill();
      if (ratio > 0) {
        slot.hp.fillColor = ratio < 0.4 ? BAR_RED : BAR_GREEN;
        slot.hp.roundRect(-w / 2, -h / 2, Math.max(h, w * ratio), h, h / 2);
        slot.hp.fill();
      }
    }
  }

  private guardView(sim: GuardBattleState, cell: number | undefined): GuardUnitView | undefined {
    const hero = sim.heroes.find((entry) => entry.cell === cell);
    return hero ? this.bridge.heroViews().get(hero.unitId) : undefined;
  }

  // ── 进攻方视图(主角 + 同伴) ──

  private unitViews(): RaidUnitView[] {
    const list: RaidUnitView[] = [];
    if (this.raider) {
      list.push(this.raider);
    }
    this.allies.forEach((unit) => list.push(unit));
    return list;
  }

  /** 进攻方 + 同伴视图(渲染器登记进怪物视图表,守卫的弹道 / 特效才能瞄到它们)。 */
  playerViews(): Array<{ monsterId: number; view: GuardUnitView }> {
    return this.unitViews().filter((unit) => unit.view.node.isValid).map((unit) => ({ monsterId: unit.monsterId, view: unit.view }));
  }

  /** 兼容旧调用:只返回主角。 */
  raiderView(): { monsterId: number; view: GuardUnitView } | null {
    const raider = this.raider;
    return raider && raider.view.node.isValid ? { monsterId: raider.monsterId, view: raider.view } : null;
  }

  private ensureUnitView(unit: GuardMonster, heroCode: string, own: boolean): RaidUnitView | null {
    const existing = own ? this.raider : this.allies.get(unit.monsterId);
    if (existing && existing.view.node.isValid) {
      return existing;
    }
    const field = this.bridge.field();
    if (!field) {
      return null;
    }
    const ally = this.bridge.allyFor(heroCode, 'ours');
    // 原型:同伴比主角小一圈
    const size = this.bridge.heroDisplaySize() * (own ? 1 : 0.86);
    const unitSize = this.bridge.unitSize();
    const px = this.bridge.xToPx(unit.x);
    const py = this.bridge.laneY(unit.laneF ?? 0.5, unit.x);
    const node = this.bridge.host.addChildPlainNode(field, own ? 'GuardRaider' : `GuardRaidAlly_${unit.monsterId}`, px, py, size, size);
    this.mountShadow(node, 'Shadow', -unitSize * 0.45, unitSize * (own ? 0.7 : 0.6), Math.max(6, unitSize * 0.15));
    const fallback = this.bridge.host.addChildPlainNode(node, 'Fallback', 0, 0, size * 0.5, size * 0.7);
    const g = fallback.addComponent(Graphics);
    g.fillColor = own ? rgba(90, 60, 110, 220) : rgba(60, 80, 110, 200);
    g.roundRect(-size * 0.25, -size * 0.35, size * 0.5, size * 0.7, 10);
    g.fill();
    const view: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '', deathAnim: '', hitFlashUntil: 0 };
    const resource = ally ? resolveBattleUnitSpineResource(ally) : null;
    if (ally && resource) {
      // 英雄骨骼原始朝右;进攻方默认朝水晶(左)→ 镜像
      this.bridge.loadSpine(node, fallback, resource, size, true, view, ally);
    }
    const H = this.bridge.layout().height;
    // 头顶血条(原型:主角更长更粗一眼认出自己;同伴细一档)
    const barW = own ? H * 0.104 : H * 0.068;
    const barH = own ? Math.max(7, H * 0.0105) : Math.max(5, H * 0.0072);
    const barY = unitSize * (own ? 0.66 : 0.58);
    const hp = this.bridge.host.addChildPlainNode(node, 'RaidHp', 0, barY, barW, barH);
    hp.addComponent(Graphics);
    {
      // 当前操控单位头顶香槟色小倒三角(原型:标出「这是你」;docs/61 §9 切换操控后跟着换人,syncUnit 按当前操控显隐)
      const tri = this.bridge.host.addChildPlainNode(node, 'RaidMeMarker', 0, barY + H * 0.03, H * 0.03, H * 0.024).addComponent(Graphics);
      tri.node.active = own;
      const tw = H * 0.013;
      const th = H * 0.012;
      tri.fillColor = CHAMPAGNE;
      tri.moveTo(-tw, th / 2);
      tri.lineTo(tw, th / 2);
      tri.lineTo(0, -th / 2);
      tri.close();
      tri.fill();
    }
    const record: RaidUnitView = {
      monsterId: unit.monsterId,
      heroCode,
      view,
      ally,
      names: null,
      loopAnim: '',
      oneShotUntil: 0,
      oneShotSpeed: 1,
      facing: unit.facing ?? -1,
      prevX: unit.x,
      prevLane: unit.laneF ?? 0.5,
      fromX: px,
      fromY: py,
      toX: px,
      toY: py,
      hpKey: '',
      barW,
      barH,
      deadShown: false,
    };
    if (own) {
      this.raider = record;
      // 技能特效素材(同野外 TownCombatFx 一套)进战就预热,放技能时直接有图
      const kit = this.raiderKit();
      if (kit) {
        this.fx.prewarmKit(kit);
      }
    } else {
      this.allies.set(unit.monsterId, record);
    }
    return record;
  }

  private resolveNames(unit: RaidUnitView): void {
    const view = unit.view;
    if (unit.names || !view.spineReady || !view.skeleton || !view.skeleton.isValid || !unit.ally) {
      return;
    }
    const data = view.skeleton.skeletonData as sp.SkeletonData | null;
    if (!data) {
      return;
    }
    unit.names = resolveBattleUnitSpineAnimationNames(data, unit.ally);
    unit.loopAnim = view.idleAnim;
  }

  // ── 技能特效(11-06 用户「技能特效对齐野外」,口径同 LobbyTownRenderer.resolveLeaderHit)──

  private combatFx: TownCombatFx | null = null;
  private raiderFxKit: TownHeroFxKit | null = null;

  private get fx(): TownCombatFx {
    if (!this.combatFx) {
      this.combatFx = new TownCombatFx(this.bridge.host as unknown as TownCombatFxHost);
    }
    return this.combatFx;
  }

  private raiderKit(): TownHeroFxKit | null {
    const raider = this.raider;
    if (!raider) {
      return null;
    }
    if (!this.raiderFxKit) {
      this.raiderFxKit = resolveTownHeroFxKit(raider.heroCode, raider.ally?.heroClass ?? null, 'melee');
    }
    return this.raiderFxKit;
  }

  private readonly unitFxKits = new Map<string, TownHeroFxKit>();

  /** 出招单位的特效包:主角同原先;同伴按自己的职业(切换操控后同伴放技能,口径同野外同伴)。 */
  private kitOf(unit: RaidUnitView, sim: GuardBattleState): TownHeroFxKit | null {
    if (unit === this.raider) {
      return this.raiderKit();
    }
    let kit = this.unitFxKits.get(unit.heroCode);
    if (!kit) {
      const role = sim.raidAllies.find((ally) => ally.monsterId === unit.monsterId)?.role ?? 'melee';
      kit = resolveTownHeroFxKit(unit.heroCode, unit.ally?.heroClass ?? null, role === 'melee' ? 'melee' : role === 'support' ? 'support' : 'ranged');
      this.unitFxKits.set(unit.heroCode, kit);
      this.fx.prewarmKit(kit);
    }
    return kit;
  }

  /** 野外特效尺寸按野外角色高 230 配;掠夺按单位显示尺寸等比换算。 */
  private fxScale(): number {
    return this.bridge.unitSize() / 230;
  }

  /**
   * 技能命中特效,优先级同野外:① 英雄骨骼自带落点动画 skillN_kz(画在目标脚下)② 旋风斩且骨骼没有自带大招动作 → 专属大招包(hu_*,按核心亮区)
   * ③ 通用战技特效(锚在目标 / 前方,自身型绕身)。目标 = 主角朝向前方最近的存活守卫(够不着就落在身前)。
   */
  private playSkillFx(index: number, sim: GuardBattleState, unit: RaidUnitView | null = this.raider): void {
    const raider = unit;
    const field = this.bridge.field();
    const kit = raider ? this.kitOf(raider, sim) : null;
    if (!raider || !field || !field.isValid || !kit || raider.deadShown || !raider.view.node.isValid || sim.phase !== 'wave') {
      return;
    }
    const k = this.fxScale();
    const me = raider.view.node.position;
    const facing = raider.facing;
    const spec = GUARD_RAID_SKILLS[index];
    const reachPx = Math.abs(this.bridge.xToPx(1 + (spec?.reach ?? 1.5)) - this.bridge.xToPx(1)) + this.bridge.unitSize() * 0.6;
    let near: { x: number; y: number } | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const hero of sim.heroes) {
      if (hero.dead || hero.hp === undefined) {
        continue;
      }
      const view = this.bridge.heroViews().get(hero.unitId);
      if (!view || !view.node.isValid) {
        continue;
      }
      const p = view.node.position;
      const dx = p.x - me.x;
      const ahead = spec?.around || (facing < 0 ? dx <= this.bridge.unitSize() * 0.3 : dx >= -this.bridge.unitSize() * 0.3);
      const d = Math.hypot(dx, (p.y - me.y) * 1.5);
      if (ahead && d <= reachPx && d < best) {
        best = d;
        near = { x: p.x, y: p.y };
      }
    }
    const bodyLift = this.bridge.unitSize() * 0.35;
    const kz = this.skillKzAnim(raider, index);
    let shown = !!kz && this.playOwnKz(raider, kz, near ? near.x : me.x + facing * 170 * k, near ? near.y : me.y, near ? (near.x >= me.x ? 1 : -1) : facing);
    if (!shown && index === 2 && !this.hasOwnUlt(raider)) {
      const tiers: Record<string, number> = { R: 2.3, SR: 2.6, SSR: 3.0, UR: 3.4 };
      const tier = tiers[(raider.ally?.rarity || 'R').toUpperCase()] ?? 2.3;
      const ux = near ? near.x : me.x + facing * 200 * k;
      const uy = (near ? near.y + bodyLift : me.y + 100 * k) + kit.ult.offsetY * k;
      shown = !!this.fx.play(field, kit.ult, ux, uy, 170 * tier * k, { flipX: facing < 0, core: true });
    }
    if (!shown) {
      const self = kit.skill.anchor === 'self' || !!spec?.around;
      const fxX = self || !near ? me.x + (self ? 0 : facing * 150 * k) : near.x;
      const fxY = self || !near ? me.y + 90 * k : near.y + bodyLift;
      this.fx.play(field, kit.skill, fxX, fxY + kit.skill.offsetY * k, 420 * kit.skill.scale * k, { flipX: facing < 0 });
    }
    this.bridge.shakeField(10);
  }

  /** 同野外 skillKzAnim:重斩 = skill3Kz(没 ult 的骨骼 skill2Kz)、突进斩 = skill1Kz、旋风斩 = skill4Kz / skill3Kz。 */
  private skillKzAnim(unit: RaidUnitView, index: number): string | null {
    const names = unit.names;
    if (!names) {
      return null;
    }
    if (index === 0) {
      return names.ult ? names.skill3Kz : names.skill2Kz;
    }
    if (index === 1) {
      return names.skill1Kz;
    }
    return names.ult ? names.skill4Kz : names.skill3Kz;
  }

  /** 同野外 hasOwnUlt:R / SR 骨骼自带大招动作(skill3 含光效)。 */
  private hasOwnUlt(unit: RaidUnitView): boolean {
    const rarity = (unit.ally?.rarity || '').toUpperCase();
    return (rarity === 'R' || rarity === 'SR') && !!unit.names?.skill3;
  }

  /** 同野外 playOwnKz:在 (x, y) 另起一个同骨骼实例只播落点动画,和英雄同尺寸、朝 facing,播完淡出销毁。 */
  private playOwnKz(unit: RaidUnitView, anim: string, x: number, y: number, facing: 1 | -1): boolean {
    const src = unit.view.skeleton;
    const data = src?.skeletonData as sp.SkeletonData | null | undefined;
    const field = this.bridge.field();
    const spine = unit.view.node.getChildByName('GuardUnitSpine');
    if (!src || !src.isValid || !data || !field || !field.isValid || !spine) {
      return false;
    }
    let duration = 0;
    try {
      duration = src.findAnimation(anim)?.duration ?? 0;
    } catch (error) {
      void error;
    }
    if (duration <= 0) {
      return false;
    }
    const holder = this.bridge.host.addChildPlainNode(field, 'RaidFxKz', x, y, 10, 10);
    holder.setSiblingIndex(field.children.length - 1);
    const node = this.bridge.host.addChildPlainNode(holder, 'Spine', spine.position.x, spine.position.y, 10, 10);
    node.setScale(Math.abs(spine.scale.x) * facing, spine.scale.y, 1);
    const skeleton = node.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = src.premultipliedAlpha;
    const speed = 1.2;
    try {
      skeleton.skeletonData = data;
      const runtime = resolveBattleUnitSpineRuntimeData(data);
      const skin = runtime ? resolveBattleUnitSpineSkinName(data, runtime) : null;
      if (skin) {
        skeleton.setSkin(skin);
      }
      skeleton.setAnimation(0, anim, false);
      skeleton.timeScale = speed;
    } catch (error) {
      void error;
      holder.destroy();
      return false;
    }
    const life = duration / speed;
    const opacity = holder.addComponent(UIOpacity);
    tween(opacity).delay(Math.max(0, life - 0.15)).to(0.15, { opacity: 0 }).call(() => holder.isValid && holder.destroy()).start();
    return true;
  }

  private get realmShow(): RealmUltShow {
    if (!this.realmShowInst) {
      this.realmShowInst = new RealmUltShow(this.bridge.host as unknown as TownCombatFxHost, () => this.fx);
    }
    return this.realmShowInst;
  }

  /**
   * docs/61 §8 主角大招「夜帝残影」演出(与野外同一份 RealmUltShow):主角定住蓄势 → 同步横扫切片;压暗 / 脚下法阵 / 身后夜帝虚影 + 翅膀 / 刀光。
   * 伤害与时序在模型 GUARD_RAID_ULT(出刀点 820ms 与这里切片 60% 同源);野外像素尺寸按 k = 单位尺寸 / 230 换算。
   */
  private playRealmUlt(sim: GuardBattleState): void {
    const raider = this.raider;
    const field = this.bridge.field();
    if (!raider || !field || !field.isValid || raider.deadShown || !raider.view.node.isValid) {
      return;
    }
    const show = this.realmShow;
    show.prewarm();
    const cfg = realmUltCfg();
    const c = cfg.clip;
    const played = this.playClip(raider, c.anim, c.start, c.end, c.speed, sim);
    const { lead, dur, total } = realmUltTiming(played, cfg);
    if (played > 0) {
      // 蓄势期定格(syncUnit 一次性动作期间用 oneShotSpeed),到点按切片倍速挥下
      raider.oneShotSpeed = 0;
      raider.oneShotUntil = Date.now() + total;
      setTimeout(() => { raider.oneShotSpeed = c.speed; }, lead);
    }
    const k = this.fxScale();
    const me = raider.view.node.position;
    const facing = raider.facing;
    const feetY = me.y - this.bridge.unitSize() * 0.4;
    gameAudio.sfx(resolveHeroSkillSfxKey(raider.heroCode), 1);
    // 压暗:战场层最底(背景在战场层外,单位 / 水晶 / 特效都在压暗之上)
    show.spawnDim(field, 0, 0, total, 0);
    show.spawnCircle(field, me.x, feetY, total, k);
    show.spawnGhost(raider.view.node, raider.view.node.getChildByName('GuardUnitSpine'), raider.view.skeleton?.premultipliedAlpha ?? false, facing, lead, dur, k);
    this.bridge.shakeField(8);
    setTimeout(() => {
      if (field.isValid && raider.view.node.isValid && !raider.deadShown) {
        const pos = raider.view.node.position;
        show.spawnSlash(field, pos.x, pos.y - this.bridge.unitSize() * 0.4, facing, k);
      }
    }, lead + dur * cfg.slashLead);
  }

  /**
   * 普攻第 step 段(同野外 leaderClipAttack / leaderAttack):有专属连招的骨骼播对应那一截出刀切片,
   * 其余英雄按段落换 attack / skill1 / skill2 整段动作;时长与模型 GUARD_RAID_COMBO 的锁时同源。
   */
  private playSwing(unit: RaidUnitView, step: number, sim: GuardBattleState): void {
    const chain = heroClipCombo(unit.ally?.spineAsset);
    const seg = chain ? chain[(step - 1) % chain.length] : null;
    if (seg && this.playClip(unit, seg.anim, seg.start, seg.end, seg.speed, sim) > 0) {
      return;
    }
    const spec = GUARD_RAID_COMBO[(step - 1) % GUARD_RAID_COMBO.length];
    const kind = spec?.heavy ? 'skill2' : step % 2 === 0 ? 'skill1' : 'attack';
    this.playAction(unit, kind, Math.round((spec?.lockMs ?? 400) / 0.7), sim);
  }

  /** 切片播放(同野外 playActorClip):只播 anim 的 [start, end] 秒、按 speed 倍速,播完自动接循环;返回时长 ms(0 = 没播)。 */
  private playClip(unit: RaidUnitView, anim: string, start: number, end: number, speed: number, sim: GuardBattleState): number {
    const skeleton = unit.view.skeleton;
    if (!skeleton || !skeleton.isValid || unit.deadShown || !skeleton.findAnimation(anim)) {
      return 0;
    }
    const loop = this.wantedLoop(unit, sim);
    try {
      const entry = skeleton.setAnimation(0, anim, false);
      if (entry) {
        entry.animationStart = start;
        entry.animationEnd = end;
        entry.animationLast = -1;
      }
      if (loop) {
        skeleton.addAnimation(0, loop, true, 0);
      }
      skeleton.timeScale = speed;
    } catch (error) {
      void error;
      return 0;
    }
    const dur = ((end - start) * 1000) / speed;
    unit.oneShotUntil = Date.now() + dur;
    unit.oneShotSpeed = speed;
    unit.loopAnim = loop;
    return dur;
  }

  /** 整段动作(同野外 playActorAction):超过 capMs 的动作加速播完,播完自动接循环;返回时长 ms。 */
  private playAction(unit: RaidUnitView, kind: 'attack' | 'skill1' | 'skill2' | 'skill3' | 'ult', capMs: number, sim: GuardBattleState): number {
    const skeleton = unit.view.skeleton;
    const names = unit.names;
    if (!skeleton || !skeleton.isValid || !names || unit.deadShown) {
      return 0;
    }
    const anim = (kind === 'ult' ? names.ult || names.skill3 : names[kind]) || names.attack || names.idle;
    if (!anim) {
      return 0;
    }
    let lengthMs = 600;
    try {
      lengthMs = Math.max(150, (skeleton.findAnimation(anim)?.duration ?? 0.6) * 1000);
    } catch (error) {
      void error;
    }
    const speed = capMs > 0 && lengthMs > capMs ? lengthMs / capMs : 1;
    const loop = this.wantedLoop(unit, sim);
    try {
      skeleton.setAnimation(0, anim, false);
      if (loop) {
        skeleton.addAnimation(0, loop, true, 0);
      }
      skeleton.timeScale = speed;
    } catch (error) {
      void error;
      return 0;
    }
    const dur = lengthMs / speed;
    unit.oneShotUntil = Date.now() + dur;
    unit.oneShotSpeed = speed;
    unit.loopAnim = loop;
    return dur;
  }

  private playOneShot(unit: RaidUnitView, anim: string | null | undefined, holdMs: number, sim: GuardBattleState): void {
    const view = unit.view;
    if (!anim || !view.skeleton || !view.skeleton.isValid || unit.deadShown) {
      return;
    }
    try {
      view.skeleton.setAnimation(0, anim, false);
      const loop = this.wantedLoop(unit, sim);
      if (loop) {
        view.skeleton.addAnimation(0, loop, true, 0);
      }
      unit.oneShotUntil = Date.now() + holdMs;
      unit.oneShotSpeed = 1;
      unit.loopAnim = loop;
    } catch (error) {
      void error;
    }
  }

  private wantedLoop(unit: RaidUnitView, sim: GuardBattleState): string {
    const ctl = guardRaidCtl(sim);
    const moving = unit.monsterId === ctl?.monsterId
      ? (ctl?.moveDir ?? 0) > 0
      : unit === this.raider
        ? !!sim.raidLeadAi?.moving
        : !!sim.raidAllies.find((ally) => ally.monsterId === unit.monsterId)?.moving;
    return (moving ? (unit.names?.move ?? unit.names?.idle) : unit.names?.idle) ?? unit.view.idleAnim ?? '';
  }

  private showUnitDeath(unit: RaidUnitView): void {
    if (unit.deadShown) {
      return;
    }
    unit.deadShown = true;
    const view = unit.view;
    const bar = view.node.getChildByName('RaidHp');
    if (bar) {
      bar.active = false;
    }
    let played = false;
    if (view.skeleton && view.skeleton.isValid && unit.names?.death) {
      try {
        view.skeleton.color = WHITE;
        view.skeleton.setAnimation(0, unit.names.death, false);
        played = true;
      } catch (error) {
        void error;
      }
    }
    const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
    tween(opacity).delay(played ? 1.2 : 0.2).to(0.6, { opacity: 70 }).start();
  }

  /** 每 tick 后:位置目标、朝向、循环动画、血条、守卫血条 / 倒下、首领条、按钮冷却、计时、输出面板。 */
  sync(sim: GuardBattleState): void {
    const raiderMonster = sim.raider ? sim.monsters.find((monster) => monster.monsterId === sim.raider!.monsterId) ?? null : null;
    if (!raiderMonster || !sim.raider) {
      return;
    }
    if (!this.raiderCode) {
      this.raiderCode = sim.raider.heroCode;
    }
    const newTick = sim.timeMs !== this.lastSyncedTimeMs;
    this.lastSyncedTimeMs = sim.timeMs;
    this.syncUnit(sim, raiderMonster, sim.raider.heroCode, true, newTick);
    for (const ally of sim.raidAllies) {
      const monster = sim.monsters.find((entry) => entry.monsterId === ally.monsterId);
      if (monster) {
        this.syncUnit(sim, monster, ally.heroCode, false, newTick);
      }
    }
    this.syncHeroes(sim);
    this.syncButtons(sim);
    this.syncBossBar(sim);
    this.syncDpsPanel(sim);
    if (this.timerLabel && this.timerLabel.isValid) {
      const left = Math.max(0, GUARD_RAID_TIME_LIMIT_MS - sim.timeMs);
      this.timerLabel.string = `剩余 ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    }
    if (this.guardsLabel && this.guardsLabel.isValid) {
      const guards = sim.heroes.filter((hero) => !hero.raidBoss);
      const alive = guards.filter((hero) => !hero.dead).length;
      const bossAlive = sim.heroes.some((hero) => hero.raidBoss && !hero.dead);
      // 野外清怪(docs/50):「剩余敌人 a/n」,没有水晶
      this.guardsLabel.string = sim.raidClear ? `剩余敌人 ${alive}/${guards.length}` : `守卫 ${alive}/${guards.length}${bossAlive ? ' · 首领' : ''}`;
    }
    if (this.crystalLabel && this.crystalLabel.isValid) {
      this.crystalLabel.string = sim.raidClear ? '野外' : `水晶 ${Math.round((sim.crystalHp / Math.max(1, sim.crystalMaxHp)) * 100)}%`;
    }
  }

  private syncUnit(sim: GuardBattleState, monster: GuardMonster, heroCode: string, own: boolean, newTick: boolean): void {
    const unit = this.ensureUnitView(monster, heroCode, own);
    if (!unit || !unit.view.node.isValid) {
      return;
    }
    const view = unit.view;
    this.resolveNames(unit);
    // 位置目标(帧间插值在 frame() 里);只在真的跑了 tick 的帧换插值区间(2026-10-25「移动有点飘」)
    if (newTick) {
      unit.fromX = this.bridge.xToPx(unit.prevX);
      unit.fromY = this.bridge.laneY(unit.prevLane, unit.prevX);
      unit.toX = this.bridge.xToPx(monster.x);
      unit.toY = this.bridge.laneY(monster.laneF ?? 0.5, monster.x);
      unit.prevX = monster.x;
      unit.prevLane = monster.laneF ?? 0.5;
    }
    if (monster.dead) {
      if (!own) {
        this.showUnitDeath(unit);
      }
      return;
    }
    // 朝向:骨骼镜像加载(scale.x<0 = 朝左)
    const facing = monster.facing ?? -1;
    if (facing !== unit.facing) {
      unit.facing = facing;
      const spine = view.node.getChildByName('GuardUnitSpine');
      if (spine) {
        const sx = Math.abs(spine.scale.x);
        spine.setScale(facing < 0 ? -sx : sx, spine.scale.y, 1);
      }
    }
    if (view.skeleton && view.skeleton.isValid && unit.names && Date.now() >= unit.oneShotUntil) {
      const loop = this.wantedLoop(unit, sim);
      if (loop && loop !== unit.loopAnim) {
        unit.loopAnim = loop;
        try {
          view.skeleton.setAnimation(0, loop, true);
        } catch (error) {
          void error;
        }
      }
    }
    if (view.skeleton && view.skeleton.isValid) {
      view.skeleton.color = view.hitFlashUntil > Date.now() ? FLASH : WHITE;
      // 跑步动画按地面速度加速,不然像在冰上滑
      // 一次性动作期间保持它自己的倍速(切片 / 加速播完);跑步动画原速(同野外;原 × 1.3 腿迈得太快,11-06 用户「跑步太快」)
      view.skeleton.timeScale = Date.now() < unit.oneShotUntil ? unit.oneShotSpeed : 1;
    }
    const hpKey = `${Math.ceil(monster.hp)}/${monster.maxHp}`;
    if (hpKey !== unit.hpKey) {
      unit.hpKey = hpKey;
      this.drawBar(view.node.getChildByName('RaidHp'), unit.barW, unit.barH, monster.hp / Math.max(1, monster.maxHp), BAR_GREEN);
    }
  }

  /** 渲染帧:上一 tick → 本 tick 位置插值(alpha 由渲染器按累积器算)。 */
  frame(alpha: number): void {
    this.realmShowInst?.step();
    const a = Math.max(0, Math.min(1, alpha));
    for (const unit of this.unitViews()) {
      const view = unit.view;
      if (!view.node.isValid) {
        continue;
      }
      const jiggle = view.hitFlashUntil > Date.now() ? ((view.hitFlashUntil - Date.now()) / 110) * 6 * (unit.facing < 0 ? 1 : -1) : 0;
      view.node.setPosition(unit.fromX + (unit.toX - unit.fromX) * a + jiggle, unit.fromY + (unit.toY - unit.fromY) * a, 0);
    }
  }

  /** 脚下柔影:Graphics 椭圆(安卓原生上运行时生成的 blob 纹理会画成金色光环,2026-10-26 实测)。 */
  private mountShadow(parent: Node, name: string, y: number, w: number, h: number): void {
    const node = this.bridge.host.addChildPlainNode(parent, name, 0, y, w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(6, 4, 4, 110);
    g.ellipse(0, 0, w / 2, h / 2);
    g.fill();
    node.setSiblingIndex(0);
  }

  private drawBar(node: Node | null, w: number, h: number, ratio: number, fill: Color): void {
    const g = node?.getComponent(Graphics);
    if (!g) {
      return;
    }
    g.clear();
    g.fillColor = rgba(10, 12, 18, 210);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    const r = Math.max(0, Math.min(1, ratio));
    if (r > 0) {
      g.fillColor = fill;
      g.roundRect(-w / 2 + 1, -h / 2 + 1, Math.max(h - 2, (w - 2) * r), h - 2, (h - 2) / 2);
      g.fill();
    }
    g.strokeColor = rgba(200, 206, 216, 110);
    g.lineWidth = 1;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.stroke();
  }

  /** 守卫:细红血条 + 白色小名字;首领放大 1.7 倍(用户 11-05:矿主要一眼认出)、脚下暗红光圈、头顶不画条(顶部大血条);倒下压暗。 */
  private syncHeroes(sim: GuardBattleState): void {
    const unitSize = this.bridge.unitSize();
    const H = this.bridge.layout().height;
    const barW = H * 0.068;
    const barH = Math.max(5, H * 0.0072);
    for (const hero of sim.heroes) {
      const view = this.bridge.heroViews().get(hero.unitId);
      if (!view || !view.node.isValid || hero.hp === undefined) {
        continue;
      }
      const tagged = view as GuardUnitView & { raidHpKey?: string; raidDead?: boolean; raidReady?: boolean };
      let bar = view.node.getChildByName('GuardRaidHeroHp');
      if (!tagged.raidReady) {
        tagged.raidReady = true;
        bar = this.bridge.host.addChildPlainNode(view.node, 'GuardRaidHeroHp', 0, unitSize * 0.5, barW, barH);
        bar.addComponent(Graphics);
        tagged.raidHpKey = '';
        // 守卫头顶只有名字 + 细血条,没有星级 / 攻击数字 / 职业色圈;脚下柔和影子
        for (const name of ['GuardHeroStar', 'GuardHeroAtk', 'GuardHeroRing']) {
          const child = view.node.getChildByName(name);
          if (child) {
            child.active = false;
          }
        }
        const nameNode = view.node.getChildByName('GuardHeroName');
        nameNode?.setPosition(0, unitSize * 0.6, 0);
        const nameLabel = nameNode?.getComponent(Label);
        if (nameLabel) {
          nameLabel.fontSize = H * 0.02;
          nameLabel.color = GLASS_COLOR.text;
          nameLabel.enableOutline = true;
          nameLabel.outlineColor = rgba(0, 0, 0, 200);
          nameLabel.outlineWidth = 2;
        }
        const size = this.bridge.heroDisplaySize();
        if (hero.raidBoss) {
          // 首领:放大、头顶名字与条交给顶部大血条;脚下暗红光圈
          view.node.setScale(GUARD_RAID_BOSS_VIEW_SCALE, GUARD_RAID_BOSS_VIEW_SCALE, 1);
          bar.active = false;
          if (nameNode) {
            nameNode.active = false;
          }
          const ring = this.bridge.host.addChildPlainNode(view.node, 'GuardRaidBossRing', 0, -size * 0.42, size * 0.9, size * 0.24).addComponent(Graphics);
          ring.strokeColor = rgba(210, 56, 46, 230);
          ring.lineWidth = Math.max(2, H * 0.004);
          ring.ellipse(0, 0, size * 0.4, size * 0.1);
          ring.stroke();
          ring.fillColor = rgba(150, 26, 22, 96);
          ring.ellipse(0, 0, size * 0.4, size * 0.1);
          ring.fill();
          ring.node.setSiblingIndex(0);
        }
        this.mountShadow(view.node, 'GuardRaidHeroShadow', -size * 0.42, size * 0.7, Math.max(6, size * 0.14));
      }
      // 守卫战的技能冷却条 / 旧血条每 tick 由渲染器补建:掠夺里一律藏掉
      for (const key of ['hpBg', 'hpFill', 'cdBg', 'cdFill'] as const) {
        const barNode = view[key];
        if (barNode && barNode.isValid && barNode.active) {
          barNode.active = false;
        }
      }
      if (!hero.raidBoss) {
        const key = `${Math.ceil(hero.hp)}/${hero.maxHp ?? 1}${hero.dead ? 'd' : ''}`;
        if (tagged.raidHpKey !== key && bar) {
          tagged.raidHpKey = key;
          this.drawBar(bar, barW, barH, hero.hp / Math.max(1, hero.maxHp ?? 1), hero.dead ? rgba(90, 90, 90, 200) : BAR_RED);
        }
      }
      if (view.skeleton && view.skeleton.isValid && !hero.dead) {
        view.skeleton.color = view.hitFlashUntil > Date.now() ? FLASH : WHITE;
      }
      if (hero.dead) {
        // 渲染器的 syncHeroes 每 tick 把透明度重置回 255,倒下的守卫在这里持续压暗
        const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
        if (tagged.raidDead) {
          opacity.opacity = 80;
        }
      }
      if (hero.dead && !tagged.raidDead) {
        tagged.raidDead = true;
        if (bar) {
          bar.active = false;
        }
        view.node.getChildByName('GuardRaidBossRing')?.destroy();
        let played = false;
        if (view.skeleton && view.skeleton.isValid) {
          const ally = this.bridge.allyFor(hero.heroCode, hero.raidBoss ? 'boss' : 'theirs');
          const data = view.skeleton.skeletonData as sp.SkeletonData | null;
          const death = ally && data ? resolveBattleUnitSpineAnimationNames(data, ally).death : null;
          if (death) {
            try {
              view.skeleton.color = WHITE;
              view.skeleton.setAnimation(0, death, false);
              played = true;
            } catch (error) {
              void error;
            }
          }
        }
        if (!played) {
          tween(view.node).by(0.4, { position: new Vec3(0, -10, 0) }).start();
        }
      }
    }
  }

  private syncButtons(sim: GuardBattleState): void {
    const raider = guardRaidCtl(sim);
    if (!raider) {
      return;
    }
    this.refreshControlHud(sim);
    this.syncSquadBar(sim);
    this.skillButtons.forEach((button, index) => {
      if (!button.node.isValid) {
        return;
      }
      const left = Math.max(0, raider.skillReadyMs[index] - sim.timeMs);
      const text = left > 0 ? `${Math.ceil(left / 1000)}` : '';
      if (button.cd.string !== text) {
        button.cd.string = text;
      }
      button.drawn = this.drawCdMask(button.mask, button.size, left / Math.max(1, GUARD_RAID_SKILLS[index]?.cdMs ?? 1), button.drawn);
    });
    const ult = this.ultButton;
    if (ult && ult.node.isValid) {
      const left = Math.max(0, (sim.raider?.ultReadyMs ?? 0) - sim.timeMs);
      const text = left > 0 ? `${Math.ceil(left / 1000)}` : '';
      if (ult.cd.string !== text) {
        ult.cd.string = text;
      }
      ult.drawn = this.drawCdMask(ult.mask, ult.size, left / GUARD_RAID_ULT.cdMs, ult.drawn);
    }
    const dodge = this.dodgeButton;
    if (dodge && dodge.node.isValid) {
      const left = Math.max(0, raider.dodgeReadyMs - sim.timeMs);
      dodge.drawn = this.drawCdMask(dodge.mask, dodge.size, left / 1300, dodge.drawn);
    }
  }

  /** 冷却扇形:从 12 点方向顺时针退去(arc 第六参 true = 逆时针短弧,见 Graphics.arc 方向坑)。 */
  private drawCdMask(g: Graphics, size: number, frac: number, drawn: number): number {
    const f = Math.max(0, Math.min(1, frac));
    const key = Math.round(f * 60);
    if (key === drawn || !g.isValid) {
      return drawn;
    }
    g.clear();
    if (f > 0) {
      g.fillColor = rgba(0, 0, 0, 150);
      g.moveTo(0, 0);
      g.arc(0, 0, size * 0.4, Math.PI / 2 - Math.PI * 2 * f, Math.PI / 2, true);
      g.close();
      g.fill();
    }
    return key;
  }

  // ── 首领血条(原型:顶部胶囊下方居中,约 38% 屏宽) ──

  private syncBossBar(sim: GuardBattleState): void {
    if (!this.bossBarChecked) {
      this.bossBarChecked = true;
      const boss = sim.heroes.find((hero) => hero.raidBoss);
      if (boss && this.hud && this.hud.isValid) {
        this.mountBossBar(this.hud, boss);
      }
    }
    const bar = this.bossBar;
    if (!bar || !bar.root.isValid) {
      return;
    }
    const boss = sim.heroes.find((hero) => hero.raidBoss);
    if (!boss) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, (boss.hp ?? 0) / Math.max(1, boss.maxHp ?? 1)));
    const key = Math.round(ratio * 400);
    if (key === bar.drawn) {
      return;
    }
    bar.drawn = key;
    const { w, h } = bar;
    const g = bar.fill;
    g.clear();
    g.fillColor = rgba(10, 12, 18, 215);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    if (ratio > 0) {
      g.fillColor = BAR_BOSS;
      g.roundRect(-w / 2 + 2, -h / 2 + 2, Math.max(h - 4, (w - 4) * ratio), h - 4, (h - 4) / 2);
      g.fill();
      // 上沿一道浅色高光(原型:血条有一点体积感)
      g.fillColor = rgba(255, 170, 160, 60);
      g.roundRect(-w / 2 + 3, 0, Math.max(h - 6, (w - 6) * ratio), h / 2 - 3, (h - 6) / 4);
      g.fill();
    }
    g.strokeColor = rgba(210, 214, 224, 120);
    g.lineWidth = 1.2;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.stroke();
    bar.pct.string = boss.dead ? '已击倒' : `${Math.ceil(ratio * 100)}%`;
  }

  private mountBossBar(hud: Node, boss: GuardHeroUnit): void {
    const host = this.bridge.host;
    const P = this.proto!;
    const snapshot = this.bridge.allyFor(boss.heroCode, 'boss');
    const name = snapshot?.displayName ?? '首领';
    const tag = snapshot?.subline && snapshot.subline !== '矿主' && snapshot.subline !== '首领' ? snapshot.subline : '';
    // 原型里整组左沿(图标左缘)在 x≈608,输出面板右沿 470;电脑 16:9 屏窄,中间锚定的首领条会压到输出面板 → 整组右移让开
    const groupLeft = P.C(956) - P.S(348);
    const minLeft = P.L(470) + P.S(24);
    const root = host.addChildPlainNode(hud, 'GuardRaidBossBar', P.C(956) + Math.max(0, minLeft - groupLeft), P.Y(158), P.S(700), P.S(96));
    // 图标:细环圆盘 + 白线头盔
    const icon = host.addChildPlainNode(root, 'Icon', P.S(-315), P.S(-17), P.S(66), P.S(66));
    mountRingBase(host, icon, P.S(66) * 1.12);
    this.mountIcon(icon, 'Helmet', 'ui/glass/profile_helmet/spriteFrame', P.S(34));
    const title = host.addChildLabel(root, 'Name', `矿主 · ${name}`, P.S(-88), P.S(28), P.S(36), GLASS_COLOR.text, new Size(P.S(330), P.S(46)));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    if (tag) {
      const tagW = P.S(152);
      const tagH = P.S(34);
      const pill = host.addChildPlainNode(root, 'Tag', P.S(112), P.S(28), tagW, tagH);
      if (!mountGlassSlice(host, pill, 'Bg', GLASS_SLICES.tagPill, 0, 0, tagW, tagH, P.u)) {
        const pg = pill.addComponent(Graphics);
        pg.fillColor = rgba(60, 66, 78, 200);
        pg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, tagH / 2);
        pg.fill();
      }
      const tl = host.addChildLabel(pill, 'Label', tag, 0, 0, P.S(20), GLASS_COLOR.sub, new Size(tagW - P.S(16), tagH));
      tl.overflow = Label.Overflow.SHRINK;
    }
    const w = P.S(612);
    const h = P.S(24);
    const fillNode = host.addChildPlainNode(root, 'Bar', P.S(34), P.S(-23), w, h);
    const fill = fillNode.addComponent(Graphics);
    const pct = host.addChildLabel(root, 'Pct', '100%', P.S(34), P.S(-23), P.S(20), GLASS_COLOR.text, new Size(P.S(140), h));
    pct.enableOutline = true;
    pct.outlineColor = rgba(0, 0, 0, 200);
    pct.outlineWidth = 2;
    this.bossBar = { root, fill, pct, w, h, drawn: -1 };
  }

  // ── 我方输出面板(原型 battle_b3 左上:x 44~470、y 80~243;可收起) ──

  /** 本局双方输出统计(我方按单位,敌方按守卫);结算覆盖层也用这份。 */
  stats(sim: GuardBattleState): { ours: GuardRaidStatRow[]; theirs: GuardRaidStatRow[]; seconds: number } {
    const seconds = Math.max(1, sim.timeMs / 1000);
    const ours: GuardRaidStatRow[] = [];
    if (sim.raider) {
      const monster = sim.monsters.find((entry) => entry.monsterId === sim.raider!.monsterId);
      const damage = sim.raidDealt[sim.raider.heroCode] ?? 0;
      ours.push({
        key: `m${sim.raider.monsterId}`,
        heroCode: sim.raider.heroCode,
        name: this.bridge.allyFor(sim.raider.heroCode, 'ours')?.displayName ?? '主角',
        damage,
        dps: damage / seconds,
        protagonist: this.protagonistRaider(),
        boss: false,
        dead: !!monster?.dead,
      });
    }
    for (const ally of sim.raidAllies) {
      const monster = sim.monsters.find((entry) => entry.monsterId === ally.monsterId);
      const damage = sim.raidDealt[ally.heroCode] ?? 0;
      ours.push({
        key: `m${ally.monsterId}`,
        heroCode: ally.heroCode,
        name: this.bridge.allyFor(ally.heroCode, 'ours')?.displayName ?? ally.heroCode,
        damage,
        dps: damage / seconds,
        protagonist: false,
        boss: false,
        dead: !!monster?.dead,
      });
    }
    const theirs: GuardRaidStatRow[] = sim.heroes.map((hero) => {
      const damage = sim.raidTaken[hero.unitId] ?? 0;
      return {
        key: `h${hero.unitId}`,
        heroCode: hero.heroCode,
        name: this.bridge.allyFor(hero.heroCode, hero.raidBoss ? 'boss' : 'theirs')?.displayName ?? hero.heroCode,
        damage,
        dps: damage / seconds,
        protagonist: false,
        boss: !!hero.raidBoss,
        dead: !!hero.dead,
      };
    });
    const order = (a: GuardRaidStatRow, b: GuardRaidStatRow): number => b.damage - a.damage || a.key.localeCompare(b.key);
    ours.sort(order);
    theirs.sort((a, b) => (b.boss ? 1 : 0) - (a.boss ? 1 : 0) || order(a, b));
    return { ours, theirs, seconds };
  }

  private syncDpsPanel(sim: GuardBattleState): void {
    if (!this.hud || !this.hud.isValid || sim.raidClear) {
      return;
    }
    const now = Date.now();
    if (this.dpsPanel && this.dpsPanel.isValid && now - this.dpsRefreshedAt < DPS_REFRESH_MS) {
      return;
    }
    this.dpsRefreshedAt = now;
    const { ours } = this.stats(sim);
    const membershipKey = `${this.dpsCollapsed ? 'c' : 'o'}:${ours.map((row) => row.key).sort().join(',')}`;
    if (!this.dpsPanel || !this.dpsPanel.isValid || membershipKey !== this.dpsLastKey) {
      this.dpsLastKey = membershipKey;
      this.buildDpsPanel(ours);
    }
    if (this.dpsCollapsed) {
      return;
    }
    const P = this.proto!;
    const maxDamage = Math.max(1, ...ours.map((row) => row.damage));
    ours.forEach((row, rank) => {
      const ui = this.dpsRows.get(row.key);
      if (!ui || !ui.node.isValid) {
        return;
      }
      ui.node.setPosition(0, P.S(-51 - rank * 31), 0);
      ui.dps.string = formatInt(Math.round(row.dps));
      ui.total.string = formatWan(row.damage);
      const g = ui.bar;
      const bw = P.S(128);
      const bh = Math.max(4, P.S(7));
      g.clear();
      g.fillColor = rgba(255, 255, 255, 28);
      g.roundRect(0, -bh / 2, bw, bh, bh / 2);
      g.fill();
      const fw = Math.max(row.damage > 0 ? bh : 0, (bw * row.damage) / maxDamage);
      if (fw > 0) {
        g.fillColor = row.protagonist ? CHAMPAGNE : rgba(150, 168, 194, 235);
        g.roundRect(0, -bh / 2, fw, bh, bh / 2);
        g.fill();
      }
      const opacity = ui.node.getComponent(UIOpacity) ?? ui.node.addComponent(UIOpacity);
      opacity.opacity = row.dead ? 120 : 255;
    });
  }

  private buildDpsPanel(rows: GuardRaidStatRow[]): void {
    const host = this.bridge.host;
    const P = this.proto!;
    this.dpsPanel?.destroy();
    this.dpsRows.clear();
    const w = P.S(426);
    const rowsH = this.dpsCollapsed ? 0 : P.S(16 + rows.length * 31);
    const headH = P.S(40);
    const h = headH + rowsH;
    const left = P.L(44);
    const top = P.Y(80);
    // 面板节点以左上角为锚(方便收起时只缩高度):内部坐标 x 从左沿 0 起、y 从上沿 0 往下
    const panel = host.addChildPlainNode(this.hud!, 'GuardRaidDps', left + w / 2, top - h / 2, w, h);
    this.dpsPanel = panel;
    if (!mountGlassSlice(host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, P.u * 0.8)) {
      const g = panel.addComponent(Graphics);
      g.fillColor = rgba(20, 24, 33, 200);
      g.roundRect(-w / 2, -h / 2, w, h, P.S(12));
      g.fill();
    }
    const content = host.addChildPlainNode(panel, 'Content', -w / 2, h / 2, 10, 10);
    const head = host.addChildLabel(content, 'Title', '我方输出', P.S(16), -P.S(20), P.S(19), GLASS_COLOR.text, new Size(P.S(160), P.S(28)), HorizontalTextAlignment.LEFT);
    head.isBold = true;
    host.addChildLabel(content, 'Unit', 'DPS', P.S(352), -P.S(20), P.S(17), GLASS_COLOR.sub, new Size(P.S(60), P.S(26)), HorizontalTextAlignment.RIGHT);
    const chevron = host.addChildPlainNode(content, 'Toggle', P.S(398), -P.S(20), P.S(40), P.S(36));
    const cg = host.addChildPlainNode(chevron, 'Glyph', 0, 0, P.S(20), P.S(14)).addComponent(Graphics);
    cg.strokeColor = GLASS_COLOR.sub;
    cg.lineWidth = Math.max(1.5, P.S(2));
    const dir = this.dpsCollapsed ? -1 : 1;
    cg.moveTo(-P.S(6), -P.S(3) * dir);
    cg.lineTo(0, P.S(3) * dir);
    cg.lineTo(P.S(6), -P.S(3) * dir);
    cg.stroke();
    // 整个标题行都可点(手机上小箭头难点)
    const headHit = host.addChildPlainNode(content, 'HeadHit', w / 2, -headH / 2, w, headH);
    headHit.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
      this.dpsCollapsed = !this.dpsCollapsed;
      this.dpsLastKey = '';
      this.dpsRefreshedAt = 0;
    }, this);
    if (this.dpsCollapsed) {
      return;
    }
    for (const row of rows) {
      const node = host.addChildPlainNode(content, `Row_${row.key}`, 0, 0, 10, 10);
      const avatar = host.addChildPlainNode(node, 'Avatar', P.S(29), 0, P.S(26), P.S(26));
      mountHeroAvatar(avatar, row.heroCode, P.S(26), 'circle');
      const ring = host.addChildPlainNode(avatar, 'Ring', 0, 0, P.S(28), P.S(28)).addComponent(Graphics);
      ring.strokeColor = row.protagonist ? CHAMPAGNE : rgba(200, 206, 216, 150);
      ring.lineWidth = Math.max(1, P.S(1.4));
      ring.circle(0, 0, P.S(13.5));
      ring.stroke();
      const name = host.addChildLabel(node, 'Name', shortName(row.name), P.S(58), 0, P.S(16), GLASS_COLOR.text, new Size(P.S(84), P.S(24)), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      const bar = host.addChildPlainNode(node, 'Bar', P.S(144), 0, 10, 10).addComponent(Graphics);
      const dps = host.addChildLabel(node, 'Dps', '0', P.S(336), 0, P.S(16), GLASS_COLOR.text, new Size(P.S(56), P.S(24)), HorizontalTextAlignment.RIGHT);
      dps.overflow = Label.Overflow.SHRINK;
      const total = host.addChildLabel(node, 'Total', '0', P.S(412), 0, P.S(15), GLASS_COLOR.sub, new Size(P.S(68), P.S(24)), HorizontalTextAlignment.RIGHT);
      total.overflow = Label.Overflow.SHRINK;
      this.dpsRows.set(row.key, { node, bar, dps, total });
    }
  }

  // ── 结算(原型 result_b:标题 + 用时 + 奖励 + 我方 / 敌方输出对比 + 再来一次 / 返回矿境) ──

  mountResult(overlay: Node, sim: GuardBattleState, victory: boolean, width: number, height: number): void {
    const host = this.bridge.host;
    const { u, S, C, Y } = resultMap(width, height);
    if (this.hud && this.hud.isValid) {
      this.hud.active = false;
    }
    const root = host.addChildPlainNode(overlay, 'GuardRaidResult', 0, 0, S(PROTO_W), height);
    // 标题 + 胜负签
    const titleText = victory ? '掠夺成功' : '掠夺失败';
    const titleSize = S(72);
    const title = host.addChildLabel(root, 'Title', titleText, C(872), Y(75), titleSize, GLASS_COLOR.text, new Size(S(360), S(92)));
    title.isBold = true;
    const tagW = S(100);
    const tagH = S(46);
    const tag = host.addChildPlainNode(root, 'ResultTag', C(1106), Y(75), tagW, tagH);
    const tg = tag.addComponent(Graphics);
    tg.fillColor = victory ? rgba(40, 92, 58, 220) : rgba(104, 40, 38, 220);
    tg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, S(10));
    tg.fill();
    tg.strokeColor = victory ? rgba(120, 210, 140, 200) : rgba(230, 120, 110, 200);
    tg.lineWidth = Math.max(1, S(1.6));
    tg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, S(10));
    tg.stroke();
    host.addChildLabel(tag, 'Label', victory ? 'WIN' : 'LOSE', 0, 0, S(28), victory ? GLASS_COLOR.green : GLASS_COLOR.red, new Size(tagW, tagH)).isBold = true;
    const secs = Math.round(sim.timeMs / 1000);
    const crystalText = sim.crystalHp <= 0 ? '水晶已击碎' : `水晶剩余 ${Math.round((sim.crystalHp / Math.max(1, sim.crystalMaxHp)) * 100)}%`;
    host.addChildLabel(root, 'Sub', `用时 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · ${crystalText}`, C(935), Y(135), S(26), GLASS_COLOR.sub, new Size(S(700), S(36)));
    const reward = host.addChildLabel(root, 'Reward', '正在提交结算…', C(935), Y(187), S(28), GLASS_COLOR.text, new Size(S(1100), S(42)));
    reward.overflow = Label.Overflow.SHRINK;
    // 双方输出对比:同一比例尺
    const { ours, theirs, seconds } = this.stats(sim);
    const maxDamage = Math.max(1, ...ours.map((row) => row.damage), ...theirs.map((row) => row.damage));
    const mvp = ours.length > 0 && ours[0].damage > 0 ? ours[0].key : '';
    const sum = (rows: GuardRaidStatRow[]): number => rows.reduce((total, row) => total + row.damage, 0);
    const panel = (name: string, cx: number, header: string, rows: GuardRaidStatRow[], fill: Color): void => {
      const pw = S(735);
      const ph = S(440);
      const node = host.addChildPlainNode(root, name, C(cx), Y(448), pw, ph);
      if (!mountGlassSlice(host, node, 'Glass', GLASS_SLICES.panel, 0, 0, pw, ph, u)) {
        const pg = node.addComponent(Graphics);
        pg.fillColor = rgba(20, 24, 33, 215);
        pg.roundRect(-pw / 2, -ph / 2, pw, ph, S(12));
        pg.fill();
      }
      const left = -pw / 2;
      const top = ph / 2;
      const head = host.addChildLabel(node, 'Header', header, left + S(40), top - S(35), S(30), GLASS_COLOR.text, new Size(pw - S(80), S(40)), HorizontalTextAlignment.LEFT);
      head.overflow = Label.Overflow.SHRINK;
      const line = host.addChildPlainNode(node, 'Line', 0, top - S(66), pw - S(40), 2).addComponent(Graphics);
      line.fillColor = rgba(255, 255, 255, 30);
      line.rect(-(pw - S(40)) / 2, -0.5, pw - S(40), 1);
      line.fill();
      rows.slice(0, 4).forEach((row, index) => {
        const ry = top - S(117 + index * 90);
        const avatar = host.addChildPlainNode(node, `Avatar_${index}`, left + S(72), ry, S(76), S(76));
        mountHeroAvatar(avatar, row.heroCode, S(74), 'circle');
        const ring = host.addChildPlainNode(avatar, 'Ring', 0, 0, S(80), S(80)).addComponent(Graphics);
        ring.strokeColor = row.protagonist ? CHAMPAGNE : row.boss ? rgba(196, 70, 62, 230) : rgba(200, 206, 216, 150);
        ring.lineWidth = Math.max(1.2, S(2));
        ring.circle(0, 0, S(38));
        ring.stroke();
        let nameText = row.protagonist ? `${row.name}(主角)` : row.boss ? `矿主 · ${row.name}` : row.name;
        if (nameText.length > 10) {
          nameText = `${nameText.slice(0, 10)}…`;
        }
        const name = host.addChildLabel(node, `Name_${index}`, nameText, left + S(137), ry + S(19), S(26), GLASS_COLOR.text, new Size(S(300), S(34)), HorizontalTextAlignment.LEFT);
        name.overflow = Label.Overflow.SHRINK;
        const badges: string[] = [];
        if (rows === ours && row.key === mvp) {
          badges.push('MVP');
        }
        if (row.dead) {
          badges.push(row.boss || rows === theirs ? '击倒' : '阵亡');
        }
        badges.forEach((text, bi) => {
          const bw = S(text.length > 2 ? 64 : 58);
          const bh = S(28);
          const bx = left + S(137) + Math.min(S(300), nameText.length * S(26) * 0.98) + S(18) + bw / 2 + bi * (bw + S(8));
          const badge = host.addChildPlainNode(node, `Badge_${index}_${bi}`, bx, ry + S(19), bw, bh);
          const bg = badge.addComponent(Graphics);
          const mvpBadge = text === 'MVP';
          bg.fillColor = mvpBadge ? rgba(176, 142, 82, 235) : rgba(70, 76, 88, 220);
          bg.roundRect(-bw / 2, -bh / 2, bw, bh, S(6));
          bg.fill();
          host.addChildLabel(badge, 'Label', text, 0, 0, S(17), mvpBadge ? GLASS_COLOR.onChampagne : GLASS_COLOR.sub, new Size(bw, bh)).isBold = mvpBadge;
        });
        const bw = S(426);
        const bh = S(12);
        const bar = host.addChildPlainNode(node, `Bar_${index}`, left + S(137), ry - S(17), 10, 10).addComponent(Graphics);
        bar.fillColor = rgba(255, 255, 255, 26);
        bar.roundRect(0, -bh / 2, bw, bh, bh / 2);
        bar.fill();
        const fw = Math.max(row.damage > 0 ? bh : 0, (bw * row.damage) / maxDamage);
        if (fw > 0) {
          bar.fillColor = row.protagonist ? CHAMPAGNE : fill;
          bar.roundRect(0, -bh / 2, fw, bh, bh / 2);
          bar.fill();
        }
        host.addChildLabel(node, `Total_${index}`, formatWan(row.damage), left + S(700), ry + S(19), S(26), GLASS_COLOR.text, new Size(S(140), S(34)), HorizontalTextAlignment.RIGHT);
        host.addChildLabel(node, `Dps_${index}`, `DPS ${formatInt(Math.round(row.dps))}`, left + S(700), ry - S(17), S(19), GLASS_COLOR.sub, new Size(S(160), S(28)), HorizontalTextAlignment.RIGHT);
      });
    };
    const oursTotal = sum(ours);
    const theirsTotal = sum(theirs);
    panel('Ours', 552, `我方 · 总伤害 ${formatWan(oursTotal)} · DPS ${formatInt(Math.round(oursTotal / seconds))}`, ours, rgba(150, 168, 194, 235));
    panel('Theirs', 1318, `敌方 · 总伤害 ${formatWan(theirsTotal)} · DPS ${formatInt(Math.round(theirsTotal / seconds))}`, theirs, rgba(196, 82, 74, 235));
    host.addChildLabel(root, 'Note', '伤害 = 本局对敌方单位与水晶造成的全部伤害;DPS = 总伤害 / 用时', C(935), Y(695), S(20), GLASS_COLOR.dim, new Size(S(1200), S(30)));
  }

  /** 结算回执到达:奖励行 + 按钮(NPC 矿「再来一次 / 返回矿境」,真人矿只「返回矿境」)。 */
  refreshResult(
    overlay: Node,
    battleState: { settling: boolean; error: string; settlement: { message?: string | null; rewardGranted?: boolean; rewardItems?: Array<{ resourceCode: string; resourceName?: string | null; amount: number }> | null } | null },
    retryable: boolean,
    leave: (retry: boolean) => void,
  ): void {
    const root = overlay.getChildByName('GuardRaidResult');
    if (!root) {
      return;
    }
    const reward = root.getChildByName('Reward')?.getComponent(Label);
    if (battleState.settling) {
      if (reward) {
        reward.string = '正在提交结算…';
      }
      return;
    }
    if (battleState.error && reward) {
      reward.string = `结算失败:${battleState.error}`;
    }
    const settlement = battleState.settlement;
    if ((!settlement && !battleState.error) || root.getChildByName('Back')) {
      return;
    }
    if (settlement && reward) {
      const items = (settlement.rewardItems ?? []).filter((item) => item.amount > 0).slice(0, 4);
      // 服务端失败的默认文案是冒险口径(「未达冒险首通胜利条件…」),掠夺页换成掠夺口径;真人矿赔付文案是专属的,照原样
      const generic = !settlement.message || settlement.message.startsWith('战斗结果已记录');
      reward.string = items.length > 0
        ? items.map((item) => `${item.resourceName ?? item.resourceCode} +${formatInt(item.amount)}`).join('   ')
        : generic ? (settlement.rewardGranted ? '奖励已发放' : '未能攻破水晶:不扣体力,养成后再来') : settlement.message!;
    }
    const host = this.bridge.host;
    const { width, height } = this.bridge.layout();
    const { u, S, C, Y } = resultMap(width, height);
    const mkPill = (name: string, text: string, cx: number, primary: boolean, onClick: () => void): void => {
      const w = S(360);
      const h = S(72);
      const node = host.addChildPlainNode(root, name, C(cx), Y(768), w, h);
      if (!mountGlassSlice(host, node, 'Pill', primary ? GLASS_SLICES.pillPrimary : GLASS_SLICES.pillSecondary, 0, 0, w, h, u)) {
        const g = node.addComponent(Graphics);
        g.fillColor = primary ? CHAMPAGNE : rgba(43, 54, 65, 230);
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();
      }
      const label = host.addChildLabel(node, 'Label', text, 0, 0, S(30), primary ? GLASS_COLOR.onChampagne : GLASS_COLOR.text, new Size(w * 0.8, h * 0.8));
      label.isBold = primary;
      node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        event.propagationStopped = true;
        onClick();
      }, this);
      host.applyImageButtonFeedback(node, 1.03, 0.97);
    };
    if (retryable) {
      mkPill('Retry', '再来一次', 730, false, () => leave(true));
      mkPill('Back', '返回矿境', 1137, true, () => leave(false));
    } else {
      mkPill('Back', '返回矿境', 935, true, () => leave(false));
    }
  }
}

/** 结算页原型映射:按「装得下」取 u = min(高 / 841, 宽 / 1870)(电脑 16:9 两块对比面板不出屏),内容上下居中。 */
function resultMap(width: number, height: number): { u: number; S(v: number): number; C(px: number): number; Y(py: number): number } {
  const u = Math.min(height / PROTO_H, width / PROTO_W);
  const top = height / 2 - (height - PROTO_H * u) / 2;
  return { u, S: (v) => v * u, C: (px) => (px - PROTO_W / 2) * u, Y: (py) => top - py * u };
}

/** 输出面板里的短名:「圣铠壁垒·阿特拉斯」只留「阿特拉斯」(称号前缀太长会被压成小字)。 */
function shortName(name: string): string {
  const parts = name.split(/[·・]/);
  return (parts[parts.length - 1] || name).trim();
}

/** 千分位整数(原生端 toLocaleString 没有千分位,手写)。 */
export function formatInt(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(Math.round(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 伤害总量:≥ 1 万显示「18.0万」,以下千分位整数。 */
export function formatWan(value: number): string {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : formatInt(value);
}
