import {
  Button,
  Color,
  EventKeyboard,
  EventTouch,
  Graphics,
  Input,
  KeyCode,
  Label,
  Node,
  Size,
  UIOpacity,
  UITransform,
  Vec3,
  input,
  sp,
  tween,
} from 'cc';
import { gameAudio } from '../../audio/GameAudio';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import {
  GUARD_RAID_DODGE_CD_MS,
  GUARD_RAID_SKILLS,
  GUARD_RAID_TIME_LIMIT_MS,
  guardRaidAttack,
  guardRaidDodge,
  guardRaidMove,
  guardRaidSkill,
  type GuardBattleState,
  type GuardEvent,
  type GuardMonster,
} from './GuardBattleModel';
import { resolveBattleUnitSpineAnimationNames, resolveBattleUnitSpineResource, type BattleUnitSpineAnimationNames } from './LobbyBattleUnitSpineRuntime';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import type { GuardUnitView, LobbyGuardBattleHost } from './LobbyGuardBattleRenderer';

/**
 * docs/47 P0 掠夺模式·进攻侧(2026-10-25):玩家操控 1 个英雄冲守卫阵。
 * 这里只管"手"和"眼":摇杆 / 按钮 / 键盘 → 模型输入;模型事件 → 动画 / 顿帧 / 震屏 / 飘字 / 血条。
 * 规则全在 GuardBattleModel(guardRaid*),复演照旧走输入记录。
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
  allyFor(heroCode: string): BattlePresentationUnitSnapshot | null;
  loadSpine(node: Node, fallback: Node, resource: string, size: number, mirror: boolean, view: GuardUnitView, ally: BattlePresentationUnitSnapshot): void;
  mountShade(parent: Node, name: string, x: number, y: number, width: number, height: number): Node | null;
  spawnFloater(x: number, y: number, text: string, color: Color, fontSize?: number): void;
  shakeField(amplitude: number): void;
  /** 进攻方斩中守卫时的命中特效(英雄专属)。 */
  hitFx(heroCode: string, x: number, y: number, scale: number): void;
  attackSfx(heroCode: string): void;
  openSettings(): void;
  mountSprite(parent: Node, name: string, path: string, x: number, y: number, w: number, h: number): Node;
}

const rgba = (r: number, g: number, b: number, a = 255): Color => new Color(r, g, b, a);
const WHITE = new Color(255, 255, 255, 255);
const FLASH = new Color(255, 130, 110, 255);
const KEY_DIR: Array<[number, number]> = [[0, 0], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const INPUT_BUFFER_MS = 260;

export class GuardRaidController {
  private readonly keys = new Set<number>();
  private joy = { active: false, id: -1, dx: 0, dy: 0 };
  private joyBase: Node | null = null;
  private joyKnob: Node | null = null;
  private joyHome = new Vec3();
  // 插值区间:上一 tick 前的位置 → 本 tick 位置(只在真的跑了 tick 的帧更新)
  private prevX = 0;
  private prevLaneF = 0.5;
  private lastSyncedTimeMs = -1;
  private raiderId = -1;
  private joyRadius = 70;
  private attackPressedAt = 0;
  private dodgePressedAt = 0;
  private skillPressedAt: [number, number, number] = [0, 0, 0];
  private skillButtons: Array<{ node: Node; cd: Label; dim: UIOpacity }> = [];
  private dodgeButton: { node: Node; dim: UIOpacity } | null = null;
  private inputBound = false;
  private view: GuardUnitView | null = null;
  private ally: BattlePresentationUnitSnapshot | null = null;
  private names: BattleUnitSpineAnimationNames | null = null;
  private loopAnim = '';
  private oneShotUntil = 0;
  private facing: 1 | -1 = -1;
  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private hpDrawnKey = '';
  private timerLabel: Label | null = null;
  private guardsLabel: Label | null = null;
  private crystalLabel: Label | null = null;
  private hintLabel: Label | null = null;
  /** 顿帧截止(Date.now 毫秒):期间模拟不前进,只有画面。 */
  hitStopUntil = 0;

  constructor(private readonly bridge: GuardRaidBridge) {}

  // ── HUD ──

  mountHud(root: Node): void {
    const { width, height } = this.bridge.layout();
    const phone = isPhoneDesign();
    const hud = this.bridge.host.addChildPlainNode(root, 'GuardRaidHud', 0, 0, width, height);
    // 原守卫战 HUD(统计 / 波次横幅 / 金币 / 设置 / 关闭 / 提示)整体隐藏:掠夺按原型 v1 自己画(2026-10-26)
    const guardHud = root.getChildByName('GuardHud');
    if (guardHud) {
      guardHud.active = false;
    }
    this.renderTopBar(hud, width, height);
    this.renderJoystick(hud, width, height);
    this.renderButtons(hud, width, height);
    if (!phone) {
      this.hintLabel = this.bridge.host.addChildLabel(hud, 'GuardRaidKeyHint', 'WASD / 方向键 移动 · J 普攻 · K L I 技能 · Shift 翻滚', 0, -height / 2 + height * 0.018, height * 0.016, rgba(190, 178, 150, 150), new Size(width * 0.6, height * 0.024));
    }
    this.bindInput();
  }

  /** 顶部窄条(原型 v1):深色底 + 细金边,三段「剩余 m:ss | 守卫 a/n | 水晶 p%」;右上暂停 / 设置两个圆钮。 */
  private renderTopBar(hud: Node, width: number, height: number): void {
    const host = this.bridge.host;
    const barW = height * 0.749;
    const barH = height * 0.065;
    const barY = height / 2 - height * 0.068;
    const bar = host.addChildPlainNode(hud, 'GuardRaidTopBar', 0, barY, barW, barH);
    const g = bar.addComponent(Graphics);
    g.fillColor = rgba(14, 11, 10, 215);
    g.roundRect(-barW / 2, -barH / 2, barW, barH, barH * 0.18);
    g.fill();
    g.strokeColor = rgba(196, 154, 86, 220);
    g.lineWidth = Math.max(1.2, height * 0.0016);
    g.roundRect(-barW / 2, -barH / 2, barW, barH, barH * 0.18);
    g.stroke();
    g.strokeColor = rgba(196, 154, 86, 120);
    for (const sx of [-barW / 6, barW / 6]) {
      g.moveTo(sx, -barH * 0.26);
      g.lineTo(sx, barH * 0.26);
    }
    g.stroke();
    const font = height * 0.029;
    const mkText = (name: string, x: number): Label => {
      const label = host.addChildLabel(bar, name, '', x, 0, font, rgba(255, 226, 160, 252), new Size(barW / 3 - 10, barH));
      label.overflow = Label.Overflow.SHRINK;
      label.enableOutline = true;
      label.outlineColor = rgba(12, 8, 6, 255);
      label.outlineWidth = 2;
      return label;
    };
    this.timerLabel = mkText('GuardRaidTimer', -barW / 3);
    this.guardsLabel = mkText('GuardRaidGuards', 0);
    this.crystalLabel = mkText('GuardRaidCrystal', barW / 3);
    // 暂停 / 设置(都打开战斗设置,设置里本来就是"已暂停")
    const r = height * 0.038;
    const mkRound = (name: string, x: number): Node => {
      const node = host.addChildPlainNode(hud, name, x, barY, r * 2, r * 2);
      const cg = node.addComponent(Graphics);
      cg.fillColor = rgba(14, 11, 10, 215);
      cg.circle(0, 0, r);
      cg.fill();
      cg.strokeColor = rgba(196, 154, 86, 220);
      cg.lineWidth = Math.max(1.2, height * 0.0016);
      cg.circle(0, 0, r);
      cg.stroke();
      node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        event.propagationStopped = true;
        this.bridge.openSettings();
      }, this);
      host.applyImageButtonFeedback(node, 1.06, 0.94);
      return node;
    };
    const pause = mkRound('GuardRaidPause', width / 2 - height * 0.184);
    const pg = host.addChildPlainNode(pause, 'Glyph', 0, 0, r * 2, r * 2).addComponent(Graphics);
    pg.fillColor = rgba(230, 196, 120, 240);
    pg.rect(-r * 0.3, -r * 0.34, r * 0.2, r * 0.68);
    pg.rect(r * 0.1, -r * 0.34, r * 0.2, r * 0.68);
    pg.fill();
    const gear = mkRound('GuardRaidSettings', width / 2 - height * 0.071);
    this.bridge.mountSprite(gear, 'Icon', 'ui/battle/ai/ghud_btn_settings/spriteFrame', 0, 0, r * 2, r * 2);
  }

  private renderJoystick(hud: Node, width: number, height: number): void {
    const radius = height * 0.118;
    this.joyRadius = radius;
    const homeX = -width / 2 + height * 0.226;
    const homeY = -height / 2 + height * 0.19;
    this.joyHome = new Vec3(homeX, homeY, 0);
    const padW = width * 0.45;
    const padH = height * 0.7;
    const pad = this.bridge.host.addChildPlainNode(hud, 'GuardRaidJoyPad', -width / 2 + padW / 2, -height / 2 + padH / 2, padW, padH);
    const base = this.bridge.host.addChildPlainNode(hud, 'GuardRaidJoyBase', homeX, homeY, radius * 2, radius * 2);
    const bg = base.addComponent(Graphics);
    bg.fillColor = rgba(8, 8, 12, 120);
    bg.circle(0, 0, radius);
    bg.fill();
    bg.strokeColor = rgba(196, 154, 86, 150);
    bg.lineWidth = Math.max(1.5, height * 0.002);
    bg.circle(0, 0, radius);
    bg.stroke();
    // 四向小箭头(原型 v1)
    bg.fillColor = rgba(200, 190, 170, 150);
    const a = height * 0.016;
    const d = radius * 0.78;
    const tri = (cx: number, cy: number, dx: number, dy: number): void => {
      bg.moveTo(cx + dx * a, cy + dy * a);
      bg.lineTo(cx - dy * a * 0.9 - dx * a * 0.6, cy + dx * a * 0.9 - dy * a * 0.6);
      bg.lineTo(cx + dy * a * 0.9 - dx * a * 0.6, cy - dx * a * 0.9 - dy * a * 0.6);
      bg.close();
    };
    tri(0, d, 0, 1);
    tri(0, -d, 0, -1);
    tri(d, 0, 1, 0);
    tri(-d, 0, -1, 0);
    bg.fill();
    const knob = this.bridge.host.addChildPlainNode(base, 'Knob', 0, 0, radius, radius);
    const kg = knob.addComponent(Graphics);
    kg.fillColor = rgba(226, 206, 160, 200);
    kg.circle(0, 0, height * 0.045);
    kg.fill();
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

  /** 动作钮(原型 v1,全部按屏高定尺寸、按屏高定离右缘距离,任何宽高比下按钮簇形状不变)。 */
  private renderButtons(hud: Node, width: number, height: number): void {
    const host = this.bridge.host;
    const right = width / 2;
    const bottom = -height / 2;
    const showKeys = !isPhoneDesign();
    const mk = (name: string, x: number, y: number, size: number, label: string, font: number, fill: Color, onPress: () => void, keyHint = ''): { node: Node; dim: UIOpacity } => {
      const node = host.addChildPlainNode(hud, name, x, y, size, size);
      const g = node.addComponent(Graphics);
      g.fillColor = fill;
      g.circle(0, 0, size / 2);
      g.fill();
      g.strokeColor = rgba(214, 170, 92, 240);
      g.lineWidth = Math.max(2, height * 0.0028);
      g.circle(0, 0, size / 2);
      g.stroke();
      const text = host.addChildLabel(node, 'Label', label, 0, 0, font, rgba(255, 236, 190), new Size(size * 0.92, font * 1.4));
      text.isBold = true;
      text.enableOutline = true;
      text.outlineColor = rgba(20, 10, 4, 255);
      text.outlineWidth = 2;
      if (showKeys && keyHint) {
        // 电脑端:按钮右上角挂按键角标(手机不显示)
        const r = Math.max(height * 0.016, size * 0.15);
        // 单字母画圆,多字母(Shift)画胶囊,字不溢出
        const bw = keyHint.length > 1 ? r * (1.2 + keyHint.length * 0.62) : r * 2;
        const badge = host.addChildPlainNode(node, 'KeyHint', size * 0.36 - (bw / 2 - r) * 0.5, size * 0.36, bw, r * 2);
        const bg = badge.addComponent(Graphics);
        bg.fillColor = rgba(14, 12, 10, 235);
        bg.roundRect(-bw / 2, -r, bw, r * 2, r);
        bg.fill();
        bg.strokeColor = rgba(214, 170, 92, 240);
        bg.lineWidth = Math.max(1, height * 0.0018);
        bg.roundRect(-bw / 2, -r, bw, r * 2, r);
        bg.stroke();
        const k = host.addChildLabel(badge, 'Key', keyHint, 0, 0, keyHint.length > 1 ? r * 0.9 : r * 1.15, rgba(255, 236, 190), new Size(bw - r * 0.5, r * 1.6));
        k.isBold = true;
        k.overflow = Label.Overflow.SHRINK;
      }
      const dim = node.addComponent(UIOpacity);
      // 按下即生效(不等抬起):动作游戏的按钮不能有抬起延迟
      node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
        event.propagationStopped = true;
        onPress();
      }, this);
      host.applyImageButtonFeedback(node, 1.06, 0.94);
      return { node, dim };
    };
    mk('GuardRaidAttack', right - height * 0.196, bottom + height * 0.197, height * 0.226, '普攻', height * 0.052, rgba(108, 22, 20, 235), () => { this.attackPressedAt = Date.now(); }, 'J');
    this.dodgeButton = mk('GuardRaidDodge', right - height * 0.446, bottom + height * 0.185, height * 0.142, '翻滚', height * 0.03, rgba(24, 38, 70, 235), () => { this.dodgePressedAt = Date.now(); }, 'Shift');
    this.skillButtons = [];
    const slots: Array<[number, number]> = [[0.404, 0.364], [0.256, 0.429], [0.095, 0.388]];
    GUARD_RAID_SKILLS.forEach((spec, index) => {
      const [fromRight, fromBottom] = slots[index];
      const size = height * 0.13;
      const button = mk(`GuardRaidSkill_${index}`, right - height * fromRight, bottom + height * fromBottom, size, spec.name, height * 0.029, rgba(58, 34, 90, 235), () => { this.skillPressedAt[index] = Date.now(); }, ['K', 'L', 'I'][index] ?? '');
      button.node.getChildByName('Label')?.setPosition(0, size * 0.1, 0);
      const cd = host.addChildLabel(button.node, 'Cd', '', 0, -size * 0.22, height * 0.02, rgba(255, 220, 140), new Size(size * 0.9, height * 0.026));
      cd.enableOutline = true;
      cd.outlineColor = rgba(20, 10, 4, 255);
      cd.outlineWidth = 2;
      this.skillButtons.push({ node: button.node, cd, dim: button.dim });
    });
    void Button;
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
    this.view = null;
    this.skillButtons = [];
    this.dodgeButton = null;
  }

  private onKeyDown(event: EventKeyboard): void {
    this.keys.add(event.keyCode);
    const now = Date.now();
    switch (event.keyCode) {
      // 2026-10-26 用户:「攻击、技能键绑定 J K L,翻滚键绑定 Shift」→ J 普攻 / K 技能一 / L 技能二 / I 技能三(J K L 只够两个技能)/ Shift 翻滚;空格、数字键 1 2 3 保留作备用
      case KeyCode.KEY_J: case KeyCode.SPACE: this.attackPressedAt = now; break;
      case KeyCode.SHIFT_LEFT: case KeyCode.SHIFT_RIGHT: this.dodgePressedAt = now; break;
      case KeyCode.KEY_K: case KeyCode.DIGIT_1: this.skillPressedAt[0] = now; break;
      case KeyCode.KEY_L: case KeyCode.DIGIT_2: this.skillPressedAt[1] = now; break;
      case KeyCode.KEY_I: case KeyCode.DIGIT_3: this.skillPressedAt[2] = now; break;
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
    const angle = Math.atan2(x, y); // 0 = 上, +π/2 = 右
    const sector = Math.round(angle / (Math.PI / 4));
    return ((sector + 8) % 8) + 1;
  }

  /** 每个模拟 tick 前:把当前输入喂给模型(方向只在变化时记录;按键有 260ms 缓冲,连段衔接不吃操作)。 */
  beforeTick(sim: GuardBattleState): void {
    if (sim.phase !== 'wave' || !sim.raider) {
      return;
    }
    const unit = this.raiderUnit(sim);
    if (unit) {
      this.prevX = unit.x;
      this.prevLaneF = unit.laneF ?? 0.5;
    }
    guardRaidMove(sim, this.moveDir());
    const now = Date.now();
    if (this.dodgePressedAt && now - this.dodgePressedAt <= INPUT_BUFFER_MS) {
      if (guardRaidDodge(sim)) {
        this.dodgePressedAt = 0;
      }
    } else {
      this.dodgePressedAt = 0;
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
    const unit = this.raiderUnit(sim);
    for (const event of events) {
      switch (event.type) {
        case 'raidSwing':
          if (sim.raider) {
            this.bridge.attackSfx(sim.raider.heroCode);
          }
          this.playOneShot(event.level === 3 ? (this.names?.skill1 ?? this.names?.attack) : this.names?.attack, event.level === 3 ? 460 : 280, sim);
          break;
        case 'raidSkill': {
          const index = event.level ?? 0;
          const anim = index === 0 ? (this.names?.skill2 ?? this.names?.skill1 ?? this.names?.attack)
            : index === 1 ? (this.names?.move ?? this.names?.attack)
              : (this.names?.ult ?? this.names?.skill3 ?? this.names?.skill1 ?? this.names?.attack);
          this.playOneShot(anim, GUARD_RAID_SKILLS[index]?.lockMs ?? 500, sim);
          gameAudio.sfx('wave_start', 0.5);
          break;
        }
        case 'raidDodge':
          this.playOneShot(this.names?.move ?? this.names?.idle, 360, sim);
          if (this.view) {
            const opacity = this.view.node.getComponent(UIOpacity) ?? this.view.node.addComponent(UIOpacity);
            opacity.opacity = 150;
            setTimeout(() => { if (this.view && this.view.node.isValid) { opacity.opacity = 255; } }, 320);
          }
          break;
        case 'raidHit': {
          const hero = sim.heroes.find((entry) => entry.cell === event.cell);
          const view = hero ? this.bridge.heroViews().get(hero.unitId) : undefined;
          const heavy = !!event.crit;
          if (view && view.node.isValid) {
            view.hitFlashUntil = Date.now() + (heavy ? 140 : 90);
            this.bridge.hitFx(sim.raider?.heroCode ?? '', view.node.position.x - (this.facing < 0 ? -1 : 1) * this.bridge.unitSize() * 0.1, view.node.position.y + this.bridge.unitSize() * 0.25, heavy ? 1.15 : 0.85);
            this.bridge.spawnFloater(view.node.position.x, view.node.position.y + this.bridge.unitSize() * 0.55, `-${event.amount ?? 0}`, heavy ? rgba(255, 196, 80) : rgba(255, 236, 200), heavy ? 24 : 18);
            // 受击顶退:往远离进攻方的方向顶一下再弹回
            const push = (this.facing < 0 ? -1 : 1) * (heavy ? 14 : 7);
            const base = view.node.position.clone();
            tween(view.node).to(0.05, { position: new Vec3(base.x + push, base.y, 0) }).to(0.09, { position: base }).start();
          }
          this.hitStopUntil = Math.max(this.hitStopUntil, Date.now() + (heavy ? 110 : 55));
          this.bridge.shakeField(heavy ? 12 : 5);
          gameAudio.sfx(heavy ? 'chest_land' : 'merge', heavy ? 0.9 : 0.5);
          break;
        }
        case 'heroDead':
          this.bridge.shakeField(8);
          gameAudio.sfx('forge_success', 0.7);
          break;
        case 'raidHurt':
          if (this.view && unit) {
            this.view.hitFlashUntil = Date.now() + 110;
            this.bridge.spawnFloater(this.view.node.position.x, this.view.node.position.y + this.bridge.unitSize() * 0.6, `-${event.amount ?? 0}`, rgba(255, 110, 100), 20);
            this.playOneShot(this.names?.hit, 160, sim);
          }
          this.bridge.shakeField(4);
          break;
        case 'crystalHit':
          if (event.monsterId === sim.raider?.monsterId) {
            this.hitStopUntil = Math.max(this.hitStopUntil, Date.now() + 70);
            this.bridge.shakeField(9);
          }
          break;
        case 'defeat':
          if (unit && unit.player) {
            this.playOneShot(this.names?.death, 2000, sim);
          }
          break;
        default:
          break;
      }
    }
  }

  // ── 进攻方视图 ──

  /** 进攻方视图(渲染器把它登记进怪物视图表,守卫的弹道 / 特效才能瞄到它)。 */
  raiderView(): { monsterId: number; view: GuardUnitView } | null {
    return this.view && this.view.node.isValid && this.raiderId >= 0 ? { monsterId: this.raiderId, view: this.view } : null;
  }

  private raiderUnit(sim: GuardBattleState): GuardMonster | null {
    const id = sim.raider?.monsterId;
    return id === undefined ? null : sim.monsters.find((monster) => monster.monsterId === id) ?? null;
  }

  private ensureView(sim: GuardBattleState, unit: GuardMonster): GuardUnitView | null {
    if (this.view && this.view.node.isValid) {
      return this.view;
    }
    const field = this.bridge.field();
    if (!field) {
      return null;
    }
    const ally = this.bridge.allyFor(sim.raider?.heroCode ?? '');
    this.ally = ally;
    const size = this.bridge.heroDisplaySize();
    const unitSize = this.bridge.unitSize();
    const px = this.bridge.xToPx(unit.x);
    const py = this.bridge.laneY(unit.laneF ?? 0.5, unit.x);
    const node = this.bridge.host.addChildPlainNode(field, 'GuardRaider', px, py, size, size);
    this.mountShadow(node, 'GuardRaiderShadow', -unitSize * 0.45, unitSize * 0.7, Math.max(6, unitSize * 0.15));
    const fallback = this.bridge.host.addChildPlainNode(node, 'GuardRaiderFallback', 0, 0, size * 0.5, size * 0.7);
    const g = fallback.addComponent(Graphics);
    g.fillColor = rgba(90, 60, 110, 220);
    g.roundRect(-size * 0.25, -size * 0.35, size * 0.5, size * 0.7, 10);
    g.fill();
    const view: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '', deathAnim: '', hitFlashUntil: 0 };
    const resource = ally ? resolveBattleUnitSpineResource(ally) : null;
    if (ally && resource) {
      // 英雄骨骼原始朝右;进攻方默认朝水晶(左)→ 镜像
      this.bridge.loadSpine(node, fallback, resource, size, true, view, ally);
    }
    this.view = view;
    this.prevX = unit.x;
    this.prevLaneF = unit.laneF ?? 0.5;
    this.fromX = this.toX = px;
    this.fromY = this.toY = py;
    this.facing = unit.facing ?? -1;
    // 头顶血条
    const hp = this.bridge.host.addChildPlainNode(node, 'GuardRaiderHp', 0, unitSize * 0.62, this.barW(), this.barH());
    hp.addComponent(Graphics);
    return view;
  }

  private resolveNames(): void {
    const view = this.view;
    if (this.names || !view || !view.spineReady || !view.skeleton || !view.skeleton.isValid || !this.ally) {
      return;
    }
    const data = view.skeleton.skeletonData as sp.SkeletonData | null;
    if (!data) {
      return;
    }
    this.names = resolveBattleUnitSpineAnimationNames(data, this.ally);
    this.loopAnim = view.idleAnim;
  }

  private playOneShot(anim: string | null | undefined, holdMs: number, sim: GuardBattleState): void {
    const view = this.view;
    if (!anim || !view || !view.skeleton || !view.skeleton.isValid) {
      return;
    }
    try {
      view.skeleton.setAnimation(0, anim, false);
      const loop = this.wantedLoop(sim);
      if (loop) {
        view.skeleton.addAnimation(0, loop, true, 0);
      }
      this.oneShotUntil = Date.now() + holdMs;
      this.loopAnim = loop;
    } catch (error) {
      void error;
    }
  }

  private wantedLoop(sim: GuardBattleState): string {
    const moving = (sim.raider?.moveDir ?? 0) > 0;
    return (moving ? (this.names?.move ?? this.names?.idle) : this.names?.idle) ?? this.view?.idleAnim ?? '';
  }

  /** 每 tick 后:位置目标、朝向、循环动画、血条、守卫血条 / 倒下、按钮冷却、计时。 */
  sync(sim: GuardBattleState): void {
    const unit = this.raiderUnit(sim);
    if (!unit) {
      return;
    }
    const view = this.ensureView(sim, unit);
    if (!view || !view.node.isValid) {
      return;
    }
    this.resolveNames();
    this.raiderId = unit.monsterId;
    // 位置目标(帧间插值在 frame() 里)。只在真的跑了 tick 的帧才换插值区间:原先每帧都把 from 推到 to,
    // 没跑 tick 的帧直接跳到段尾、跑了 tick 的帧又从段尾慢慢插 → 一跳一慢(2026-10-25 用户「移动有点飘」)。
    if (sim.timeMs !== this.lastSyncedTimeMs) {
      this.lastSyncedTimeMs = sim.timeMs;
      this.fromX = this.bridge.xToPx(this.prevX);
      this.fromY = this.bridge.laneY(this.prevLaneF, this.prevX);
      this.toX = this.bridge.xToPx(unit.x);
      this.toY = this.bridge.laneY(unit.laneF ?? 0.5, unit.x);
    }
    // 朝向:骨骼镜像加载(scale.x<0 = 朝左)
    const facing = unit.facing ?? -1;
    if (facing !== this.facing) {
      this.facing = facing;
      const spine = view.node.getChildByName('GuardUnitSpine');
      if (spine) {
        const sx = Math.abs(spine.scale.x);
        spine.setScale(facing < 0 ? -sx : sx, spine.scale.y, 1);
      }
    }
    // 循环动画(一次性动作播完后接)
    if (view.skeleton && view.skeleton.isValid && this.names && Date.now() >= this.oneShotUntil && !unit.dead) {
      const loop = this.wantedLoop(sim);
      if (loop && loop !== this.loopAnim) {
        this.loopAnim = loop;
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
      view.skeleton.timeScale = Date.now() < this.oneShotUntil ? 1 : this.loopAnim && this.loopAnim === this.names?.move ? 1.3 : 1;
    }
    // 自己的血条
    const hpKey = `${Math.ceil(unit.hp)}/${unit.maxHp}`;
    if (hpKey !== this.hpDrawnKey) {
      this.hpDrawnKey = hpKey;
      this.drawBar(view.node.getChildByName('GuardRaiderHp'), this.barW(), this.barH(), unit.hp / Math.max(1, unit.maxHp), rgba(90, 220, 120, 250));
    }
    this.syncHeroes(sim);
    this.syncButtons(sim);
    if (this.timerLabel && this.timerLabel.isValid) {
      const left = Math.max(0, GUARD_RAID_TIME_LIMIT_MS - sim.timeMs);
      this.timerLabel.string = `剩余 ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    }
    if (this.guardsLabel && this.guardsLabel.isValid) {
      const alive = sim.heroes.filter((hero) => !hero.dead).length;
      this.guardsLabel.string = `守卫 ${alive}/${sim.heroes.length}`;
    }
    if (this.crystalLabel && this.crystalLabel.isValid) {
      this.crystalLabel.string = `水晶 ${Math.round((sim.crystalHp / Math.max(1, sim.crystalMaxHp)) * 100)}%`;
    }
  }

  /** 渲染帧:上一 tick → 本 tick 位置插值(alpha 由渲染器按累积器算)。 */
  frame(alpha: number): void {
    const view = this.view;
    if (!view || !view.node.isValid) {
      return;
    }
    const a = Math.max(0, Math.min(1, alpha));
    const jiggle = view.hitFlashUntil > Date.now() ? ((view.hitFlashUntil - Date.now()) / 110) * 6 * (this.facing < 0 ? 1 : -1) : 0;
    view.node.setPosition(this.fromX + (this.toX - this.fromX) * a + jiggle, this.fromY + (this.toY - this.fromY) * a, 0);
  }

  /** 脚下柔影:Graphics 椭圆。不用渲染器的运行时生成纹理 blob 软影——安卓原生上那张纹理画出来是一圈金色光环(2026-10-26 模拟器实测)。 */
  private mountShadow(parent: Node, name: string, y: number, w: number, h: number): void {
    const node = this.bridge.host.addChildPlainNode(parent, name, 0, y, w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(6, 4, 4, 110);
    g.ellipse(0, 0, w / 2, h / 2);
    g.fill();
    node.setSiblingIndex(0);
  }

  /** 血条尺寸按屏高定(原型 v1:约 100×9 @ 841 高)。 */
  private barW(): number {
    return this.bridge.layout().height * 0.115;
  }

  private barH(): number {
    return Math.max(6, this.bridge.layout().height * 0.011);
  }

  private drawBar(node: Node | null, w: number, h: number, ratio: number, fill: Color): void {
    const g = node?.getComponent(Graphics);
    if (!g) {
      return;
    }
    g.clear();
    g.fillColor = rgba(8, 10, 16, 220);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    const r = Math.max(0, Math.min(1, ratio));
    if (r > 0) {
      g.fillColor = fill;
      g.roundRect(-w / 2 + 1, -h / 2 + 1, Math.max(h - 2, (w - 2) * r), h - 2, (h - 2) / 2);
      g.fill();
    }
    g.strokeColor = rgba(200, 160, 90, 220);
    g.lineWidth = 1.2;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.stroke();
  }

  /** 守卫:血条 + 受击闪色 + 倒下(死亡动画 / 变暗,不再出手)。 */
  private syncHeroes(sim: GuardBattleState): void {
    const unitSize = this.bridge.unitSize();
    for (const hero of sim.heroes) {
      const view = this.bridge.heroViews().get(hero.unitId);
      if (!view || !view.node.isValid || hero.hp === undefined) {
        continue;
      }
      let bar = view.node.getChildByName('GuardRaidHeroHp');
      if (!bar) {
        bar = this.bridge.host.addChildPlainNode(view.node, 'GuardRaidHeroHp', 0, unitSize * 0.5, this.barW(), this.barH());
        bar.addComponent(Graphics);
        (view as GuardUnitView & { raidHpKey?: string }).raidHpKey = '';
        // 原型 v1:守卫头顶只有名字 + 绿血条,没有星级 / 攻击数字 / 职业色圈;脚下柔和影子
        for (const name of ['GuardHeroStar', 'GuardHeroAtk', 'GuardHeroRing']) {
          const child = view.node.getChildByName(name);
          if (child) {
            child.active = false;
          }
        }
        const nameNode = view.node.getChildByName('GuardHeroName');
        nameNode?.setPosition(0, unitSize * 0.66, 0);
        const nameLabel = nameNode?.getComponent(Label);
        if (nameLabel) {
          nameLabel.fontSize = this.bridge.layout().height * 0.02;
        }
        const size = this.bridge.heroDisplaySize();
        this.mountShadow(view.node, 'GuardRaidHeroShadow', -size * 0.42, size * 0.7, Math.max(6, size * 0.14));
      }
      // 守卫战的技能冷却条 / 旧血条每 tick 由渲染器补建:掠夺里一律藏掉(原型 v1 只有名字 + 绿血条)
      for (const key of ['hpBg', 'hpFill', 'cdBg', 'cdFill'] as const) {
        const barNode = view[key];
        if (barNode && barNode.isValid && barNode.active) {
          barNode.active = false;
        }
      }
      const key = `${Math.ceil(hero.hp)}/${hero.maxHp ?? 1}${hero.dead ? 'd' : ''}`;
      const tagged = view as GuardUnitView & { raidHpKey?: string; raidDead?: boolean };
      if (tagged.raidHpKey !== key) {
        tagged.raidHpKey = key;
        this.drawBar(bar, this.barW(), this.barH(), hero.hp / Math.max(1, hero.maxHp ?? 1), hero.dead ? rgba(90, 90, 90, 200) : rgba(90, 220, 120, 250));
      }
      if (view.skeleton && view.skeleton.isValid && !hero.dead) {
        view.skeleton.color = view.hitFlashUntil > Date.now() ? FLASH : WHITE;
      }
      if (hero.dead) {
        // 渲染器的 syncHeroes 每 tick 把透明度重置回 255,倒下的守卫在这里持续压暗、隐藏攻击数字
        const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
        if (tagged.raidDead) {
          opacity.opacity = 80;
        }
        const atk = view.node.getChildByName('GuardHeroAtk');
        if (atk) {
          atk.active = false;
        }
      }
      if (hero.dead && !tagged.raidDead) {
        tagged.raidDead = true;
        bar.active = false;
        view.node.getChildByName('GuardHeroRing')?.destroy();
        const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
        let played = false;
        if (view.skeleton && view.skeleton.isValid) {
          const ally = this.bridge.allyFor(hero.heroCode);
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
    const raider = sim.raider;
    if (!raider) {
      return;
    }
    this.skillButtons.forEach((button, index) => {
      if (!button.node.isValid) {
        return;
      }
      const left = raider.skillReadyMs[index] - sim.timeMs;
      const ready = left <= 0;
      button.dim.opacity = ready ? 255 : 130;
      button.cd.string = ready ? '' : `${Math.ceil(left / 1000)}秒`;
    });
    if (this.dodgeButton && this.dodgeButton.node.isValid) {
      const left = raider.dodgeReadyMs - sim.timeMs;
      this.dodgeButton.dim.opacity = left <= 0 ? 255 : 140;
      void GUARD_RAID_DODGE_CD_MS;
    }
  }
}
