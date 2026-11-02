import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import type { UiLayout } from './LobbyHudTypes';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassSlice } from '../UiGlassKit';

/** 跑图层给演出用的舞台接口(LobbyTownRenderer 实现)。 */
export interface AwakenStage {
  awakenStageReady(): boolean;
  beginAwakenStage(): boolean;
  playAwakenGetUp(): number;
  mountAwakenSpirit(path: string, durationMs: number): void;
  setAwakenBind(progress: number): void;
  endAwakenStage(): void;
}

export interface AwakenCinematicHost {
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize?: Size, horizontalAlign?: HorizontalTextAlignment): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  /** 演出期间藏 / 还原跑图 HUD(小地图 / 摇杆 / 技能键 / 右上按钮)。 */
  setTownHudVisible(visible: boolean): void;
}

const ZERO_SPIRIT = 'ui/protagonist/b/zero_m/spriteFrame';
const ZERO_PORTRAIT = 'ui/protagonist/b/zero_m_round/spriteFrame';
const SEAL_ICON = 'ui/glass/protag_skill_seal/spriteFrame';

/** 零的台词(docs/59 序章「觉醒」;文字走多语言表 LootChainI18n)。 */
const LINES = [
  '……这具身体也太弱了。',
  '名字?想不起来了。一切从零开始——就叫我零吧。',
  '宿主,从今天起我们是一体的。先去找村长,问问这是哪儿。',
];

type Phase = 'eyes' | 'reveal' | 'wake' | 'bind' | 'talk' | 'done';

/**
 * docs/60「觉醒」演出(原型 周报截图/2026-11-02_主角/proto/awaken_b.png,用户 11-03 确认按顺序做):
 * 新号建完主角进晨风村 → 黑屏,零的金色双眼睁开 → 黑幕褪去,主角躺在法阵旁 → 起身 → 零从右上飞来、金线连上胸口,
 * 顶部「圣契 · 绑定完成 / 宿主 · 境界」→ 零的 3 句对话(点击继续)→ 收场还原操作。右上「跳过 ›」随时结束。
 * 覆盖层挂内容根最上层;大厅整页重绘会清掉,宿主在重绘后调 remount 按当前阶段重建(时间线不重播)。
 */
export class LobbyAwakenCinematic {
  static readonly NODE_NAME = 'LobbyAwakenCinematic';

  private phase: Phase = 'done';
  private lineIndex = 0;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private root: Node | null = null;
  private layout: UiLayout | null = null;
  private onFinish: (() => void) | null = null;
  private name = '';
  private bindAnim: { start: number; dur: number } | null = null;

  constructor(private readonly host: AwakenCinematicHost, private readonly stage: AwakenStage) {}

  get active(): boolean {
    return this.phase !== 'done';
  }

  /** 舞台就绪才开演;返回 false = 还没就绪(调用方下一帧再试)。 */
  start(layout: UiLayout, protagonistName: string, onFinish: () => void): boolean {
    if (this.active || !this.stage.awakenStageReady() || !this.stage.beginAwakenStage()) {
      return false;
    }
    this.name = protagonistName;
    this.onFinish = onFinish;
    this.lineIndex = 0;
    this.host.setTownHudVisible(false);
    this.go('eyes', layout);
    this.later(2200, () => this.go('reveal'));
    this.later(3300, () => {
      this.go('wake');
      const getUp = this.stage.playAwakenGetUp();
      this.later(getUp + 300, () => {
        this.go('bind');
        this.stage.mountAwakenSpirit(ZERO_SPIRIT, 1400);
        this.later(1500, () => { this.bindAnim = { start: Date.now(), dur: 900 }; });
        this.later(2700, () => this.go('talk'));
      });
    });
    return true;
  }

  /** 每帧:推进绑定金线。 */
  step(): void {
    if (!this.bindAnim) {
      return;
    }
    const t = (Date.now() - this.bindAnim.start) / this.bindAnim.dur;
    this.stage.setAwakenBind(t);
    if (t >= 2) {
      this.bindAnim = null;
      this.stage.setAwakenBind(0);
    }
  }

  /** 大厅整页重绘后重挂(按当前阶段重建画面,不重播时间线)。 */
  remount(layout: UiLayout): void {
    if (this.active) {
      this.host.setTownHudVisible(false);
      this.render(layout, false);
    }
  }

  skip(): void {
    this.finish();
  }

  private go(phase: Phase, layout?: UiLayout): void {
    this.phase = phase;
    this.render(layout ?? this.layout, true);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(() => {
      if (this.active) {
        fn();
      }
    }, ms));
  }

  private finish(): void {
    if (!this.active) {
      return;
    }
    this.phase = 'done';
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
    this.bindAnim = null;
    this.stage.setAwakenBind(0);
    this.stage.endAwakenStage();
    this.host.setTownHudVisible(true);
    const root = this.root;
    this.root = null;
    if (root && root.isValid) {
      const op = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
      tween(op).to(0.35, { opacity: 0 }).call(() => root.isValid && root.destroy()).start();
    }
    const done = this.onFinish;
    this.onFinish = null;
    done?.();
  }

  private render(layout: UiLayout | null, animate: boolean): void {
    if (!layout) {
      return;
    }
    this.layout = layout;
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const root = this.host.createUiNode(LobbyAwakenCinematic.NODE_NAME);
    root.setPosition(new Vec3(cx, cy, 0));
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    this.root = root;
    const W = layout.width;
    const H = layout.height;

    // 电影黑边(上下各 6%,原型 awaken_b)
    const bars = root.addComponent(Graphics);
    const barH = Math.max(S(50), H * 0.06);
    bars.fillColor = new Color(0, 0, 0, 255);
    bars.rect(-W / 2, H / 2 - barH, W, barH);
    bars.rect(-W / 2, -H / 2, W, barH);
    bars.fill();

    // 跳过(右上,黑边里)
    mountGlassButton(this.host, root, 'Skip', '跳过 ›', W / 2 - S(110), H / 2 - barH / 2, S(150), S(44), k, 'secondary', () => this.skip(), 20);

    if (this.phase === 'eyes' || this.phase === 'reveal') {
      this.renderBlack(root, W, H, S, animate);
    }
    if (this.phase === 'bind' || this.phase === 'talk') {
      this.renderBanner(root, k, FX, FY, S, animate && this.phase === 'bind');
    }
    if (this.phase === 'talk') {
      this.renderDialogue(root, k, FX, FY, S);
    }
  }

  /** 黑屏 + 零的金色双眼(睁开:纵向从 0 张开);reveal 阶段整块淡出。 */
  private renderBlack(root: Node, W: number, H: number, S: (v: number) => number, animate: boolean): void {
    const black = this.host.addChildPlainNode(root, 'Black', 0, 0, W, H);
    const g = black.addComponent(Graphics);
    g.fillColor = new Color(0, 0, 0, 255);
    g.rect(-W / 2, -H / 2, W, H);
    g.fill();
    const op = black.addComponent(UIOpacity);
    const eyes = this.host.addChildPlainNode(black, 'Eyes', 0, S(20), S(260), S(60));
    const eg = eyes.addComponent(Graphics);
    for (const side of [-1, 1]) {
      const x = side * S(70);
      // 外晕(几圈递减透明度)+ 金色杏仁眼 + 亮芯
      for (let i = 4; i >= 1; i -= 1) {
        eg.fillColor = new Color(240, 190, 90, 18 * (5 - i));
        eg.ellipse(x, 0, S(26 + i * 9), S(7 + i * 5));
        eg.fill();
      }
      eg.fillColor = new Color(255, 214, 120, 255);
      eg.ellipse(x, 0, S(24), S(7));
      eg.fill();
      eg.fillColor = new Color(255, 248, 225, 255);
      eg.ellipse(x, 0, S(8), S(4));
      eg.fill();
    }
    if (this.phase === 'eyes') {
      if (animate) {
        eyes.setScale(1, 0.02, 1);
        tween(eyes).delay(0.5).to(0.7, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
      }
    } else {
      // reveal:眼睛先合上,黑幕再褪
      tween(eyes).to(0.25, { scale: new Vec3(1, 0.02, 1) }).start();
      tween(op).delay(0.2).to(0.9, { opacity: 0 }).start();
    }
  }

  /** 顶部系统提示「圣契 · 绑定完成」(原型 620×96,y 70)。 */
  private renderBanner(root: Node, k: number, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, animate: boolean): void {
    const node = this.host.addChildPlainNode(root, 'Banner', FX(935), FY(118), S(620), S(96));
    mountGlassSlice(this.host, node, 'Glass', GLASS_SLICES.panel, 0, 0, S(620), S(96), k);
    const icon = this.host.addSprite('Seal', SEAL_ICON, -S(310) + S(52), 0, S(44), S(44), node);
    if (icon) {
      icon.color = GLASS_COLOR.champagne;
    }
    glassLabel(this.host, node, 'Title', '圣契 · 绑定完成', -S(310) + S(96), S(14), S(26), GLASS_COLOR.text, S(480), HorizontalTextAlignment.LEFT, true);
    glassLabel(this.host, node, 'Sub', `宿主:${this.name}    境界:觉醒 · 初期`, -S(310) + S(96), -S(20), S(19), GLASS_COLOR.sub, S(480));
    // 底边细进度线(满格 = 绑定完成)
    const line = this.host.addChildPlainNode(node, 'Line', 0, -S(46), S(600), Math.max(1, S(2)));
    const lg = line.addComponent(Graphics);
    lg.fillColor = GLASS_COLOR.champagne;
    lg.rect(-S(300), -Math.max(1, S(2)) / 2, S(600), Math.max(1, S(2)));
    lg.fill();
    if (animate) {
      line.setScale(0, 1, 1);
      tween(line).to(0.9, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
      const op = node.addComponent(UIOpacity);
      op.opacity = 0;
      node.setPosition(node.position.x, node.position.y + S(30), 0);
      tween(op).to(0.4, { opacity: 255 }).start();
      tween(node).to(0.4, { position: new Vec3(FX(935), FY(118), 0) }, { easing: 'quadOut' }).start();
    }
  }

  /** 底部对话卡(原型 1160×170,y 700):零的圆头像 + 「零」+ 台词 + 「点击继续 ▾」;点整张卡(或屏幕)下一句。 */
  private renderDialogue(root: Node, k: number, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number): void {
    const w = S(1160);
    const h = S(170);
    const card = this.host.addChildPlainNode(root, 'Dialogue', FX(935), FY(690), w, h);
    mountGlassSlice(this.host, card, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, k);
    this.host.addSprite('Portrait', ZERO_PORTRAIT, -w / 2 + S(90), 0, S(118), S(118), card);
    const ring = this.host.addChildPlainNode(card, 'Ring', -w / 2 + S(90), 0, S(124), S(124));
    const rg = ring.addComponent(Graphics);
    rg.lineWidth = Math.max(1, S(1.5));
    rg.strokeColor = new Color(255, 255, 255, 60);
    rg.circle(0, 0, S(60));
    rg.stroke();
    glassLabel(this.host, card, 'Speaker', '零', -w / 2 + S(178), S(44), S(22), GLASS_COLOR.champagne, S(200), HorizontalTextAlignment.LEFT, true);
    const text = glassLabel(this.host, card, 'Line', LINES[this.lineIndex], -w / 2 + S(178), -S(4), S(28), GLASS_COLOR.text, w - S(230));
    text.overflow = Label.Overflow.SHRINK;
    glassLabel(this.host, card, 'Next', this.lineIndex < LINES.length - 1 ? '点击继续 ▾' : '点击开始 ▾', w / 2 - S(24), -h / 2 + S(26), S(18), GLASS_COLOR.dim, S(200), HorizontalTextAlignment.RIGHT);
    // 整屏都能点(BlockInputEvents 已挡住下层);点一下翻一句,最后一句后收场
    root.on(Node.EventType.TOUCH_END, () => this.nextLine(), this);
  }

  private nextLine(): void {
    if (this.phase !== 'talk') {
      return;
    }
    if (this.lineIndex >= LINES.length - 1) {
      this.finish();
      return;
    }
    this.lineIndex += 1;
    this.render(this.layout, false);
  }
}
