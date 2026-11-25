import { BlockInputEvents, Button, Graphics, HorizontalTextAlignment, Label, Node, Size } from 'cc';
import { GUIDE_BUBBLE_AVATAR_OVERHANG, mountZeroGuideBubble, type GuideKitHost } from '../GuideKit';
import { rgba } from './LobbyHudTypes';

/**
 * docs/57 §3 V01「醒来」移动教学(强引导,11-25)的遮罩层画法;计步 / 收起时机在 LobbyTownRenderer。
 * - 全屏压暗(洞外拦点击),圆洞开在左下摇杆上 + 香槟细环;压暗比别的强引导淡一档,要看得见自己的角色在走;
 * - 手机:手指按住摇杆往上推再回弹(程序画的手 + 拖动轨迹 + 按下涟漪);
 *   电脑:W A S D 键帽(按着哪个亮哪个,没按时轮流亮)+「或方向键」;
 * - 「零」气泡说明 + 三个步点(走满 3 步收起);右上「跳过引导」。
 * 动画全按时间算(tick 每帧调),不用 tween / UIOpacity(本工程 UIOpacity 对 Graphics 填充不生效)。
 */
export interface MoveGuideHost extends GuideKitHost {
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

export interface MoveGuideLayout {
  width: number;
  height: number;
  stageLeft: number;
  stageRight: number;
  stageTop: number;
  stageBottom: number;
  /** 摇杆圆盘中心(HUD 本地坐标)/ 盘径 / 摇杆头直径 / 摇杆头最大行程。 */
  joyX: number;
  joyY: number;
  baseD: number;
  knobD: number;
  travel: number;
  /** 原型 1 单位 = 多少本地像素(townProtoFrame 的 S(1))。 */
  k: number;
  phone: boolean;
}

/** 走满几步收起。 */
export const MOVE_GUIDE_STEPS = 3;
/** 键帽位掩码:W / A / S / D(方向键并到同一颗)。 */
export const MOVE_KEY_W = 1;
export const MOVE_KEY_A = 2;
export const MOVE_KEY_S = 4;
export const MOVE_KEY_D = 8;

const CAPS: Array<{ key: string; bit: number; col: number; row: number }> = [
  { key: 'W', bit: MOVE_KEY_W, col: 0, row: 1 },
  { key: 'A', bit: MOVE_KEY_A, col: -1, row: 0 },
  { key: 'S', bit: MOVE_KEY_S, col: 0, row: 0 },
  { key: 'D', bit: MOVE_KEY_D, col: 1, row: 0 },
];
/** 没按键时轮流亮的顺序(上 → 右 → 下 → 左)。 */
const CAP_CYCLE = [MOVE_KEY_W, MOVE_KEY_D, MOVE_KEY_S, MOVE_KEY_A];
/** 手机拖动演示一轮的时长(ms)。 */
const DRAG_PERIOD = 2200;

export class MoveGuideOverlay {
  private root: Node | null = null;
  private geo: MoveGuideLayout | null = null;
  private ring: Graphics | null = null;
  private fx: Graphics | null = null;
  private hand: Node | null = null;
  private dots: Graphics | null = null;
  private dotsDrawn = -1;
  private caps: Array<{ bit: number; g: Graphics; label: Label; s: number; on: boolean | null }> = [];
  private bornAt = 0;

  get mounted(): boolean {
    return !!this.root && this.root.isValid;
  }

  destroy(): void {
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.ring = null;
    this.fx = null;
    this.hand = null;
    this.dots = null;
    this.dotsDrawn = -1;
    this.caps = [];
  }

  mount(host: MoveGuideHost, parent: Node, geo: MoveGuideLayout, steps: number, onSkip: () => void): void {
    this.destroy();
    this.geo = geo;
    this.bornAt = Date.now();
    const k = geo.k;
    const root = host.addChildPlainNode(parent, 'LobbyMoveGuide', 0, 0, geo.width, geo.height);
    this.root = root;
    const hx = geo.joyX;
    const hy = geo.joyY;
    const R = geo.baseD * 0.62;
    // 压暗四块(各自拦点击)+ 方洞四角补成圆洞;洞里按下 = 摇杆触摸板(浮动摇杆在哪按下从哪起)
    const halfW = geo.width / 2;
    const halfH = geo.height / 2;
    const dim = rgba(0, 0, 0, 128);
    const blocks: Array<[string, number, number, number, number]> = [
      ['DimTop', 0, (hy + R + halfH) / 2, geo.width, halfH - (hy + R)],
      ['DimBottom', 0, (hy - R - halfH) / 2, geo.width, hy - R + halfH],
      ['DimLeft', (hx - R - halfW) / 2, hy, hx - R + halfW, R * 2],
      ['DimRight', (hx + R + halfW) / 2, hy, halfW - (hx + R), R * 2],
    ];
    for (const [name, bx, by, bw, bh] of blocks) {
      if (bw <= 0 || bh <= 0) {
        continue;
      }
      const block = host.addChildPlainNode(root, name, bx, by, bw, bh);
      const g = block.addComponent(Graphics);
      g.fillColor = dim;
      g.rect(-bw / 2, -bh / 2, bw, bh);
      g.fill();
      block.addComponent(BlockInputEvents);
    }
    const corners = host.addChildPlainNode(root, 'DimCorners', hx, hy, R * 2, R * 2).addComponent(Graphics);
    corners.fillColor = dim;
    // 每块 = 方洞的一个角减去四分之一圆:角点 → 沿圆弧的折线点(16 段)→ 回角点。
    // 不用 arc():实测这种「角点 + 弧」的凹形用 arc 填不出来;从角点看整块都可见,扇形三角化没问题
    for (let q = 0; q < 4; q += 1) {
      const a0 = (q * Math.PI) / 2;
      const cx = Math.cos(a0 + Math.PI / 4) * R * Math.SQRT2;
      const cy = Math.sin(a0 + Math.PI / 4) * R * Math.SQRT2;
      corners.moveTo(cx, cy);
      for (let i = 0; i <= 16; i += 1) {
        const a = a0 + (i / 16) * (Math.PI / 2);
        corners.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      }
      corners.close();
      corners.fill();
    }
    this.ring = host.addChildPlainNode(root, 'MoveGuideRing', hx, hy, R * 2 + 24 * k, R * 2 + 24 * k).addComponent(Graphics);
    if (geo.phone) {
      // 拖动演示:轨迹 / 虚影摇杆头 / 涟漪每帧重画;手单独一个节点(静态形状,只改位置和缩放)
      this.fx = host.addChildPlainNode(root, 'MoveGuideDragFx', hx, hy, geo.baseD, geo.baseD * 2).addComponent(Graphics);
      const hand = host.addChildPlainNode(root, 'MoveGuideHand', hx, hy, geo.knobD * 2, geo.knobD * 2);
      hand.angle = 18;
      drawPointingHand(hand.addComponent(Graphics), geo.knobD * 0.82);
      this.hand = hand;
    }
    // 「零」气泡:摇杆洞右侧(头像压在左沿外),上下和洞对齐;不出舞台
    const bh = 120 * k;
    const bw = Math.min(560 * k, (geo.stageRight - geo.stageLeft) * 0.46);
    const over = bh * GUIDE_BUBBLE_AVATAR_OVERHANG;
    const bx = Math.min(hx + R + 30 * k + over + bw / 2, geo.stageRight - bw / 2 - 12 * k);
    const by = Math.max(geo.stageBottom + bh / 2 + 16 * k, Math.min(hy, geo.stageTop - bh / 2 - 16 * k));
    // 手动断行:自动折行会把「)」「。」挤到第二行行首(11-25 截图)
    const text = geo.phone
      ? '按住左下角的摇杆,往想去的方向推,\n就能走路。先走几步试试!'
      : '按 W A S D 或方向键就能走路,\n也可以拖左下角的摇杆。先走几步试试!';
    const bubble = mountZeroGuideBubble(host, root, 'MoveGuideBubble', bx, by, bw, bh, text);
    // 步点:气泡右下角三颗,走满一步亮一颗
    this.dots = host.addChildPlainNode(bubble, 'MoveGuideSteps', bw / 2 - 58 * k, -bh / 2 + 21 * k, 90 * k, 24 * k).addComponent(Graphics);
    this.dotsDrawn = -1;
    this.setSteps(steps);
    if (!geo.phone) {
      // W A S D 倒 T 排在气泡左半上方;右侧「或方向键」
      const s = 58 * k;
      const gap = 10 * k;
      const clusterW = s * 3 + gap * 2;
      const cx = bx - bw / 2 + 36 * k + clusterW / 2;
      const cy = by + bh / 2 + 26 * k + s + gap / 2;
      for (const cap of CAPS) {
        const node = host.addChildPlainNode(root, `MoveGuideKey_${cap.key}`, cx + cap.col * (s + gap), cy + (cap.row === 1 ? (s + gap) / 2 : -(s + gap) / 2), s, s + 6 * k);
        const g = node.addComponent(Graphics);
        const label = host.addChildLabel(node, 'Key', cap.key, 0, 3 * k, 28 * k, rgba(242, 242, 242), new Size(s, s), HorizontalTextAlignment.CENTER);
        label.isBold = true;
        this.caps.push({ bit: cap.bit, g, label, s, on: null });
      }
      // 左对齐的 Label 传的 x 是左沿(不是中心)
      const or = host.addChildLabel(root, 'MoveGuideArrows', '或 方向键 ↑ ↓ ← →', cx + clusterW / 2 + 18 * k, cy - (s + gap) / 2 + 3 * k, 22 * k, rgba(214, 218, 228), new Size(240 * k, s), HorizontalTextAlignment.LEFT);
      or.overflow = Label.Overflow.SHRINK;
      or.enableOutline = true;
      or.outlineColor = rgba(0, 0, 0, 200);
      or.outlineWidth = 2;
      this.paintCaps(0, Date.now());
    }
    // 右上「跳过引导」(docs/57 §9:每条强引导都带跳过,跳过 = 本条记完成);压在暗层上面才点得到
    const skipW = 148 * k;
    const skipH = 50 * k;
    const skip = host.addChildPlainNode(root, 'GuideSkip', geo.stageRight - skipW / 2 - 24 * k, geo.stageTop - skipH / 2 - 22 * k, skipW, skipH);
    const sg = skip.addComponent(Graphics);
    sg.fillColor = rgba(16, 19, 26, 225);
    sg.roundRect(-skipW / 2, -skipH / 2, skipW, skipH, skipH / 2);
    sg.fill();
    sg.strokeColor = rgba(255, 255, 255, 60);
    sg.lineWidth = Math.max(1, 1.2 * k);
    sg.roundRect(-skipW / 2, -skipH / 2, skipW, skipH, skipH / 2);
    sg.stroke();
    const skipLabel = host.addChildLabel(skip, 'Text', '跳过引导 ›', 0, 0, Math.max(20, 20 * k), rgba(214, 218, 228), new Size(skipW - 12 * k, skipH), HorizontalTextAlignment.CENTER);
    skipLabel.overflow = Label.Overflow.SHRINK;
    skip.addComponent(Button);
    skip.on(Button.EventType.CLICK, onSkip);
    host.applyImageButtonFeedback(skip, 1.04, 0.96);
    this.tick(Date.now(), steps, 0, false);
  }

  /** 每帧:圆环呼吸、拖动演示 / 键帽、步点。keys = 正按着的方向(位掩码);joyActive = 玩家正按着摇杆(手指演示让开)。 */
  tick(now: number, steps: number, keys: number, joyActive: boolean): void {
    const geo = this.geo;
    if (!geo || !this.mounted) {
      return;
    }
    const k = geo.k;
    const ring = this.ring;
    if (ring && ring.isValid) {
      const R = geo.baseD * 0.62;
      const breathe = 0.5 + 0.5 * Math.sin((now - this.bornAt) / 1000 * Math.PI * 1.4);
      ring.clear();
      ring.strokeColor = rgba(227, 196, 138, Math.round(40 + 40 * breathe));
      ring.lineWidth = 9 * k;
      ring.circle(0, 0, R + 4 * k);
      ring.stroke();
      ring.strokeColor = rgba(227, 196, 138, Math.round(170 + 80 * breathe));
      ring.lineWidth = Math.max(1.5, 2.4 * k);
      ring.circle(0, 0, R);
      ring.stroke();
    }
    if (geo.phone) {
      this.tickDrag(now, joyActive);
    } else {
      this.paintCaps(keys, now);
    }
    this.setSteps(steps);
  }

  private setSteps(steps: number): void {
    const g = this.dots;
    const geo = this.geo;
    if (!g || !g.isValid || !geo || this.dotsDrawn === steps) {
      return;
    }
    this.dotsDrawn = steps;
    const k = geo.k;
    g.clear();
    for (let i = 0; i < MOVE_GUIDE_STEPS; i += 1) {
      const x = (i - (MOVE_GUIDE_STEPS - 1) / 2) * 26 * k;
      if (i < steps) {
        g.fillColor = rgba(227, 196, 138, 255);
        g.circle(x, 0, 7.5 * k);
        g.fill();
      } else {
        g.strokeColor = rgba(163, 168, 179, 220);
        g.lineWidth = Math.max(1.2, 1.8 * k);
        g.circle(x, 0, 6.5 * k);
        g.stroke();
      }
    }
  }

  /** 手机:手指按下(涟漪)→ 推到上沿 → 停一下 → 松开回弹 → 歇一会,循环。 */
  private tickDrag(now: number, joyActive: boolean): void {
    const geo = this.geo!;
    const fx = this.fx;
    const hand = this.hand;
    if (!fx || !fx.isValid || !hand || !hand.isValid) {
      return;
    }
    fx.clear();
    if (joyActive) {
      // 玩家自己按着摇杆了:演示让开
      hand.setScale(0, 0, 1);
      return;
    }
    const k = geo.k;
    const p = ((now - this.bornAt) % DRAG_PERIOD) / DRAG_PERIOD;
    const ease = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
    let lift = 0;
    let press = 0;
    if (p < 0.12) {
      press = p / 0.12;
    } else if (p < 0.5) {
      press = 1;
      lift = ease((p - 0.12) / 0.38);
    } else if (p < 0.68) {
      press = 1;
      lift = 1;
    } else if (p < 0.8) {
      const t = (p - 0.68) / 0.12;
      press = 1 - t;
      lift = 1 - ease(t);
    }
    const oy = lift * geo.travel;
    // 拖动轨迹(中心 → 摇杆头)
    if (oy > 4 * k) {
      fx.strokeColor = rgba(227, 196, 138, 120);
      fx.lineWidth = 7 * k;
      fx.moveTo(0, 0);
      fx.lineTo(0, oy);
      fx.stroke();
    }
    // 虚影摇杆头
    const kr = geo.knobD / 2;
    fx.fillColor = rgba(240, 236, 228, Math.round(60 + 50 * press));
    fx.circle(0, oy, kr);
    fx.fill();
    fx.strokeColor = rgba(255, 250, 240, 200);
    fx.lineWidth = Math.max(1.5, 2 * k);
    fx.circle(0, oy, kr);
    fx.stroke();
    // 按下那一下的涟漪(0.06 ~ 0.36 一轮外扩淡出)
    if (p >= 0.06 && p < 0.36) {
      const t = (p - 0.06) / 0.3;
      fx.strokeColor = rgba(227, 196, 138, Math.round(220 * (1 - t)));
      fx.lineWidth = Math.max(1.5, 3 * k * (1 - t * 0.5));
      fx.circle(0, 0, kr * (1 + t * 0.9));
      fx.stroke();
    }
    // 手:指尖压在摇杆头中心偏下一点,按下时缩一点
    const s = 1 - 0.08 * press;
    hand.setPosition(geo.joyX + 2 * k, geo.joyY + oy - kr * 0.15, 0);
    hand.setScale(s, s, 1);
  }

  /** 电脑:按着的键亮香槟色;什么都没按时按 上 → 右 → 下 → 左 轮流亮。只在状态变了时重画。 */
  private paintCaps(keys: number, now: number): void {
    const geo = this.geo;
    if (!geo || this.caps.length === 0) {
      return;
    }
    const k = geo.k;
    const lit = keys !== 0 ? keys : CAP_CYCLE[Math.floor((now - this.bornAt) / 520) % CAP_CYCLE.length];
    for (const cap of this.caps) {
      const on = (lit & cap.bit) !== 0;
      if (cap.on === on || !cap.g.isValid) {
        continue;
      }
      cap.on = on;
      const g = cap.g;
      const s = cap.s;
      const r = 10 * k;
      g.clear();
      // 键帽厚度:底座(深色)不动,键面平时高出 6、按下时只高出 3 = 被压下去
      const faceY = on ? -s / 2 : -s / 2 + 3 * k;
      g.fillColor = rgba(8, 10, 14, 230);
      g.roundRect(-s / 2, -s / 2 - 3 * k, s, s, r);
      g.fill();
      g.fillColor = on ? rgba(227, 196, 138, 255) : rgba(22, 26, 36, 240);
      g.roundRect(-s / 2, faceY, s, s, r);
      g.fill();
      g.strokeColor = on ? rgba(255, 238, 200, 255) : rgba(255, 255, 255, 80);
      g.lineWidth = Math.max(1.2, 1.6 * k);
      g.roundRect(-s / 2, faceY, s, s, r);
      g.stroke();
      cap.label.color = on ? rgba(24, 22, 18) : rgba(242, 242, 242);
      cap.label.node.setPosition(0, (on ? 0 : 3) * k, 0);
    }
  }
}

/**
 * 指着的手(指尖在原点,食指朝上、握拳在右下;u = 尺寸单位):
 * 先把各块外扩一圈画深色当描边,再盖白色填充 —— 块与块重叠处不出内线;最后补指节线 / 指甲 / 袖口。
 */
function drawPointingHand(g: Graphics, u: number): void {
  // [左下 x, 左下 y, 宽, 高, 圆角]
  const cuff: [number, number, number, number, number] = [-0.14 * u, -1.98 * u, 0.74 * u, 0.4 * u, 0.08 * u];
  const shapes: Array<[number, number, number, number, number]> = [
    [-0.37 * u, -1.32 * u, 0.36 * u, 0.5 * u, 0.17 * u],
    [-0.2 * u, -1.66 * u, 0.82 * u, 0.92 * u, 0.25 * u],
    [-0.135 * u, -1.0 * u, 0.27 * u, 1.0 * u, 0.135 * u],
  ];
  const o = Math.max(1.5, 0.055 * u);
  g.fillColor = rgba(18, 21, 30, 255);
  for (const [x, y, w, h, r] of [cuff, ...shapes]) {
    g.roundRect(x - o, y - o, w + o * 2, h + o * 2, r + o);
    g.fill();
  }
  // 袖口:深色玻璃 + 香槟细边
  g.fillColor = rgba(44, 50, 66, 255);
  g.roundRect(cuff[0], cuff[1], cuff[2], cuff[3], cuff[4]);
  g.fill();
  g.strokeColor = rgba(227, 196, 138, 255);
  g.lineWidth = Math.max(1, 0.04 * u);
  g.moveTo(cuff[0] + 0.04 * u, cuff[1] + cuff[3] - 0.07 * u);
  g.lineTo(cuff[0] + cuff[2] - 0.04 * u, cuff[1] + cuff[3] - 0.07 * u);
  g.stroke();
  g.fillColor = rgba(250, 247, 242, 255);
  for (const [x, y, w, h, r] of shapes) {
    g.roundRect(x, y, w, h, r);
    g.fill();
  }
  // 握着的三指:两条指节线
  g.strokeColor = rgba(176, 166, 156, 255);
  g.lineWidth = Math.max(1, 0.035 * u);
  for (const x of [0.29, 0.45]) {
    g.moveTo(x * u, -0.78 * u);
    g.lineTo(x * u, -1.04 * u);
  }
  g.stroke();
  // 拇指和拳的分界
  g.moveTo(-0.2 * u + 0.02 * u, -0.9 * u);
  g.lineTo(-0.02 * u, -1.14 * u);
  g.stroke();
  // 指甲
  g.fillColor = rgba(232, 224, 216, 255);
  g.roundRect(-0.075 * u, -0.24 * u, 0.15 * u, 0.16 * u, 0.06 * u);
  g.fill();
}
