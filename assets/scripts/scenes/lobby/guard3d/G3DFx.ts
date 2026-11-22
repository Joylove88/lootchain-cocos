import { Material, Node, Texture2D, Vec3, Vec4 } from 'cc';
import { DynMesh, material, tex } from './G3DKit';
import { FX_CELL, fxUv, paintFxAtlas, paintRune, paintScorch } from './G3DSkins';
import { FX2_CELL, fx2Uv, paintBrushStreak, paintFx2Atlas, paintInkWhirl } from './G3DFxTex';
import { fxMaterial, fxShaderReady } from './G3DFxShader';
import { mulberry32 } from './G3DTextures';

/**
 * 守卫战全 3D 样板 · 技能特效:粒子(永远朝镜头的小片,火星可以沿速度方向拉长)、闪电(沿折线铺的条带,每隔几帧重新抖一次)、
 * 贴地的痕迹(焦痕 / 发红的裂纹 / 冲击环 / 法阵)。每一类一张动态网格,一帧一次绘制。
 * 亮的东西(闪电、火星、法阵)是加色混合 + 高动态亮度,交给后期的泛光去晕开;光照到地面和角色身上那部分由样板另外点灯。
 */

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; s0: number; s1: number;
  r0: number; g0: number; b0: number; r1: number; g1: number; b1: number; a: number;
  cell: number; add: boolean; grav: number; drag: number; rot: number; spin: number; stretch: number; fadeIn: number; t2: boolean;
}
export interface Emit {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number;
  life: number; s0: number; s1?: number;
  c0: [number, number, number]; c1?: [number, number, number]; a?: number;
  cell: number; add?: boolean; grav?: number; drag?: number; rot?: number; spin?: number; stretch?: number; fadeIn?: number;
  /** true = 用第二张高清图集(FX2_CELL 的格子)。 */
  t2?: boolean;
}
interface Bolt { a: Vec3; b: Vec3; age: number; life: number; width: number; color: [number, number, number]; jag: number; seed: number; pts: Vec3[]; branches: Vec3[][]; regen: number }
interface Decal { kind: 'scorch' | 'rune' | 'atlas' | 'fx2' | 'fx2a'; cell: number; x: number; z: number; y: number; r0: number; r1: number; rot: number; spin: number; age: number; life: number; fadeIn: number; hold: number; color: [number, number, number]; a: number }

/** 弧形刀气 / 剑气月牙:圆心 (x,y,z),朝 (fx,fz) 张开 span 弧度,半径 r、宽 w;tilt = 绕前方轴的倾斜(斜劈);v = 每秒移动。 */
interface Arc { x: number; y: number; z: number; fx: number; fz: number; vx: number; vz: number; r0: number; r1: number; w: number; span: number; tilt: number; age: number; life: number; color: [number, number, number]; a: number; fadeIn: number }
/** 旋风带:绕 (x,z) 的一圈竖带,半径 r、从 y 到 y+h,spin = 每秒转多少弧度。 */
interface Band { x: number; y: number; z: number; r0: number; r1: number; h: number; age: number; life: number; rot: number; spin: number; color: [number, number, number]; a: number; follow?: () => [number, number] }
/**
 * 流线(11-22 大招演出):用可平铺的笔触贴图沿一条路径铺带子,u 随时间往前推 —— 丝顺着路径流动。
 * spiral = 绕 (x,z) 的螺旋(从 r0 转到 r1,共 turns 弧度,带子平躺在地上 / 随高度斜起来);drop = 从 (x, y0, z) 竖直劈到地面(正对镜头)。
 * 头部在 grow 秒内从起点走到终点,尾巴随后跟上(len = 同时可见的长度占比)。
 */
interface Streak { kind: 'spiral' | 'drop' | 'line'; x: number; z: number; a0: number; turns: number; r0: number; r1: number; y0: number; y1: number; w0: number; w1: number;
  age: number; life: number; grow: number; len: number; scroll: number; rep: number; color: [number, number, number]; a: number;
  /** line:终点(平躺在地上的一条带子,从 (x,z) 铺到 (x2,z2))。 */
  x2: number; z2: number;
  /** 每帧跟着这个位置走(绕着主角转的气流)。 */
  follow?: () => [number, number] }
/** 墨盘旋涡:贴地的一整片黑墨 + 白色笔触,半径 r0 → r1(grow 秒内铺开),一边转一边在 hold 之后淡掉。 */
interface Whirl { x: number; y: number; z: number; r0: number; r1: number; grow: number; hold: number; age: number; life: number; rot: number; spin: number;
  ink: [number, number, number]; hi: [number, number, number]; a: number }
/** 竖直巨刀光(开天斩):正对镜头的竖片,弯刀痕那一格竖着贴(贴图的长度方向 = 高度),宽度 w0 → w1。 */
interface Blade { x: number; y0: number; z: number; h: number; w0: number; w1: number; age: number; life: number; color: [number, number, number]; a: number; cell: number; flip: boolean }
/** 光柱:从 (x,y0,z) 往上 h 米,宽 w(始终正对镜头的竖片)。 */
interface Pillar { x: number; y0: number; z: number; h: number; w0: number; w1: number; age: number; life: number; color: [number, number, number]; a: number }

/** 柔光类的格子(雾、团光、烟尘、积云):特效着色器里不做溶解(顶点透明度 +2 告诉着色器),溶解会把软边切成一块块带亮边的「水滴」。 */
const SOFT1 = new Set<number>([FX_CELL.glow, FX_CELL.core, FX_CELL.smokeA, FX_CELL.smokeB]);
const SOFT2 = new Set<number>([FX2_CELL.glow, FX2_CELL.fog, FX2_CELL.dust, FX2_CELL.cumulus]);
const softCell = (t2: boolean, cell: number): boolean => (t2 ? SOFT2 : SOFT1).has(cell);

/** 特效网格在半透明队列里的起始先后号(之后挨个 +1,共 8 个);刀光拖尾等要画在特效之上的,用 FX_ORDER_BASE + 10 起。 */
export const FX_ORDER_BASE = 10;

const _f = new Vec3();
const _rt = new Vec3();
const _up = new Vec3();
const _t = new Vec3();
const _s = new Vec3();
const _c = new Vec3();

export class FxWorld {
  private readonly addMesh: DynMesh;
  private readonly alphaMesh: DynMesh;
  private readonly add2Mesh: DynMesh;
  private readonly alpha2Mesh: DynMesh;
  private readonly arcs: Arc[] = [];
  private readonly bands: Band[] = [];
  private readonly pillars: Pillar[] = [];
  private readonly streaks: Streak[] = [];
  private readonly flowMesh: DynMesh;
  private readonly whirls: Whirl[] = [];
  private readonly blades: Blade[] = [];
  private readonly inkMesh: DynMesh;
  /**
   * 预热(11-22 线上实测:第一次放旋风斩卡到 0 帧):空的动态网格不画,材质的着色器要等第一次真有东西时才编译,
   * 弱显卡上一编就是零点几秒 → 建好后头几帧往每张网格里塞一片看不见的小面片(透明度 0),让编译发生在载入阶段。
   */
  private warm = 4;
  /** 加色 / 半透明网格用的是特效专用着色器(顶点色:加色 = 颜色 × 亮度 + 寿命;见 G3DFxShader)。 */
  private readonly fxOn: boolean;
  /** 第二张(高清)图集。 */
  readonly atlas2: Texture2D;
  private readonly scorchMesh: DynMesh;
  private readonly runeMesh: DynMesh;
  private readonly parts: Particle[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly decals: Decal[] = [];
  private readonly blobs: number[] = [];
  private readonly rnd = mulberry32(977);
  readonly mats: Material[] = [];
  /** 特效图集(别的模块要自己画条带时共用这一张)。 */
  readonly atlas: Texture2D;
  /**
   * 发光(旧图集、加色)的材质 / 地面符文的材质 —— 别的模块要借用时按名字取,别按 mats 的下标
   * (11-22 加了第二张图集后下标整体后移,野外 3D 的刀光借 mats[3] 借成了半透明那张)。
   */
  readonly glowMat: Material;
  readonly runeMat: Material;
  stats = { particles: 0, bolts: 0, decals: 0 };

  /** bounds = 特效会出现的范围(给动态网格当包围盒;不给 = 守卫战战场那么大)。 */
  constructor(parent: Node, bounds?: { min: [number, number, number]; max: [number, number, number] }) {
    const atlas: Texture2D = tex(paintFxAtlas(), false, 2);
    this.atlas = atlas;
    this.fxOn = fxShaderReady();
    // 11-22 特效专用着色器:渐变上色 + 噪声流动 + 边缘溶解(读不到着色器就退回下面的通用材质)
    const mkFx = (technique: number, texture: Texture2D, scale: number, distort: number, noise: number): Material => {
      const kind = technique === 2 ? 'add' : 'alpha';
      const m = this.fxOn ? fxMaterial(kind, texture, kind === 'add' ? [0.72, distort, 0.4, scale] : [0.28, distort * 0.5, 0, 1],
        kind === 'add' ? [noise, noise, 0.35, -0.55] : [noise * 0.7, noise * 0.7, 0.12, 0.08]) : null;
      if (m) {
        this.mats.push(m);
        return m;
      }
      return mk(technique, texture, scale);
    };
    const mk = (technique: number, texture: Texture2D, scale: number): Material => {
      const m = material('builtin-unlit', { USE_TEXTURE: true, USE_VERTEX_COLOR: true }, technique);
      m.setProperty('mainTexture', texture);
      m.setProperty('colorScale', new Vec3(scale, scale, scale));
      this.mats.push(m);
      return m;
    };
    // 顺序 = 画的先后:贴地的痕迹在最底下,其次烟,最后是发光的
    this.scorchMesh = new DynMesh(parent, 'ShowFxScorch', mk(3, tex(paintScorch(256), false, 2), 1), 64 * 4, 64 * 6, false, false, bounds);
    this.runeMat = mk(2, tex(paintRune(512), false, 4), 3.2);
    this.runeMesh = new DynMesh(parent, 'ShowFxRune', this.runeMat, 16 * 4, 16 * 6, false, false, bounds);
    this.alphaMesh = new DynMesh(parent, 'ShowFxAlpha', mkFx(3, atlas, 1, 0.003, 0.5), 900 * 4, 900 * 6, false, false, bounds);
    this.atlas2 = tex(paintFx2Atlas(), false, 4);
    this.alpha2Mesh = new DynMesh(parent, 'ShowFxAlpha2', mkFx(3, this.atlas2, 1, 0.004, 0.4), 700 * 4, 700 * 6, false, false, bounds);
    this.glowMat = mkFx(2, atlas, 5, 0.003, 0.6);
    this.addMesh = new DynMesh(parent, 'ShowFxAdd', this.glowMat, 5000 * 4, 5000 * 6, false, false, bounds);
    this.add2Mesh = new DynMesh(parent, 'ShowFxAdd2', mkFx(2, this.atlas2, 5, 0.005, 0.45), 2400 * 4, 2400 * 6, false, false, bounds);
    this.flowMesh = new DynMesh(parent, 'ShowFxFlow', mkFx(2, tex(paintBrushStreak(), true, 4), 4, 0.035, 0.5), 3200, 4800, false, false, bounds);
    this.inkMesh = new DynMesh(parent, 'ShowFxInk', mk(3, tex(paintInkWhirl(), false, 8), 1), 2600, 13000, false, false, bounds);
    // 11-22 先后固定成创建顺序(痕迹 → 烟 → 发光 → 墨盘)。原来全是同一个通用材质,排序落到「着色器编号相同」→ 按创建顺序画;
    // 换了特效专用着色器以后按编号排,墨盘(通用材质)被提前画,让后画的云雾 / 地面光盖成一片灰蓝。
    [this.scorchMesh, this.runeMesh, this.alphaMesh, this.alpha2Mesh, this.addMesh, this.add2Mesh, this.flowMesh, this.inkMesh].forEach((m, i) => {
      m.order = FX_ORDER_BASE + i;
    });
  }

  rand(a = 0, b = 1): number {
    return a + (b - a) * this.rnd();
  }

  /** 整体调发光(旧图集)的亮度:通用材质改 colorScale,特效着色器改 fxParams.w(两者同一个刻度)。 */
  setGlowScale(k: number): void {
    const m = this.glowMat;
    if (m.effectName === 'builtin-unlit' || !this.fxOn) {
      m.setProperty('colorScale', new Vec3(k, k, k));
      return;
    }
    const v = m.getProperty('fxParams') as Vec4 | null;
    m.setProperty('fxParams', new Vec4(v ? v.x : 0.72, v ? v.y : 0.003, v ? v.z : 0.4, k));
  }

  /** 地面符文的亮度(一直是通用材质)。 */
  setRuneScale(k: number): void {
    this.runeMat.setProperty('colorScale', new Vec3(k, k, k));
  }

  emit(e: Emit): void {
    if (this.parts.length > 5200) {
      return;
    }
    const c1 = e.c1 ?? e.c0;
    this.parts.push({
      x: e.x, y: e.y, z: e.z, vx: e.vx ?? 0, vy: e.vy ?? 0, vz: e.vz ?? 0, age: 0, life: e.life, s0: e.s0, s1: e.s1 ?? e.s0,
      r0: e.c0[0], g0: e.c0[1], b0: e.c0[2], r1: c1[0], g1: c1[1], b1: c1[2], a: e.a ?? 1,
      cell: e.cell, add: e.add !== false, grav: e.grav ?? 0, drag: e.drag ?? 0, rot: e.rot ?? 0, spin: e.spin ?? 0, stretch: e.stretch ?? 0, fadeIn: e.fadeIn ?? 0.08, t2: !!e.t2,
    });
  }

  /** 弧形刀气 / 剑气月牙(见 Arc)。r0 → r1 = 半径随时间长大;速度 (vx, vz) 米 / 秒。 */
  arc(o: { x: number; y: number; z: number; fx: number; fz: number; r0: number; r1?: number; w: number; span: number; tilt?: number; vx?: number; vz?: number; life: number; color: [number, number, number]; a?: number; fadeIn?: number }): void {
    const l = Math.hypot(o.fx, o.fz) || 1;
    this.arcs.push({ x: o.x, y: o.y, z: o.z, fx: o.fx / l, fz: o.fz / l, vx: o.vx ?? 0, vz: o.vz ?? 0, r0: o.r0, r1: o.r1 ?? o.r0, w: o.w, span: o.span, tilt: o.tilt ?? 0,
      age: 0, life: o.life, color: o.color, a: o.a ?? 1, fadeIn: o.fadeIn ?? 0.06 });
  }

  /** 旋风带(见 Band)。follow 给了就每帧跟着它的位置走(绕着主角转)。 */
  band(o: { x: number; y: number; z: number; r0: number; r1?: number; h: number; life: number; spin: number; color: [number, number, number]; a?: number; follow?: () => [number, number] }): void {
    this.bands.push({ x: o.x, y: o.y, z: o.z, r0: o.r0, r1: o.r1 ?? o.r0, h: o.h, age: 0, life: o.life, rot: this.rnd() * 6.28, spin: o.spin, color: o.color, a: o.a ?? 1, follow: o.follow });
  }

  /** 墨盘旋涡(见 Whirl)。spin = 每秒转多少弧度(负 = 顺时针,俯视)。 */
  whirl(o: { x: number; y?: number; z: number; r0: number; r1: number; grow: number; hold: number; life: number; spin: number; ink: [number, number, number]; hi: [number, number, number]; a?: number }): void {
    this.whirls.push({ x: o.x, y: o.y ?? 0.045, z: o.z, r0: o.r0, r1: o.r1, grow: o.grow, hold: o.hold, age: 0, life: o.life, rot: this.rnd() * 6.28, spin: o.spin, ink: o.ink, hi: o.hi, a: o.a ?? 1 });
  }

  /** 流线(见 Streak)。 */
  streak(o: { kind: 'spiral' | 'drop' | 'line'; x: number; z: number; a0?: number; turns?: number; r0?: number; r1?: number; y0?: number; y1?: number; w0: number; w1?: number;
    life: number; grow?: number; len?: number; scroll?: number; rep?: number; color: [number, number, number]; a?: number; x2?: number; z2?: number; follow?: () => [number, number] }): { x2: number; z2: number } {
    return this.pushStreak({ kind: o.kind, x: o.x, z: o.z, a0: o.a0 ?? 0, turns: o.turns ?? 0, r0: o.r0 ?? 0, r1: o.r1 ?? 0, y0: o.y0 ?? 0, y1: o.y1 ?? 0, w0: o.w0, w1: o.w1 ?? o.w0,
      age: 0, life: o.life, grow: o.grow ?? o.life * 0.4, len: o.len ?? 0.7, scroll: o.scroll ?? 2.5, rep: o.rep ?? 3, color: o.color, a: o.a ?? 1, x2: o.x2 ?? o.x, z2: o.z2 ?? o.z, follow: o.follow });
  }

  /** 加进列表并把对象交回去(调用方可以每帧改 line 的终点,让痕迹跟着飞行物铺)。 */
  private pushStreak(st: Streak): Streak {
    this.streaks.push(st);
    return st;
  }

  /** 竖直巨刀光(见 Blade)。cell 默认弯刀痕;flip = 弯的方向左右翻。 */
  blade(o: { x: number; y0?: number; z: number; h: number; w0: number; w1?: number; life: number; color: [number, number, number]; a?: number; cell?: number; flip?: boolean }): void {
    this.blades.push({ x: o.x, y0: o.y0 ?? 0, z: o.z, h: o.h, w0: o.w0, w1: o.w1 ?? o.w0, age: 0, life: o.life, color: o.color, a: o.a ?? 1, cell: o.cell ?? FX2_CELL.slash, flip: !!o.flip });
  }

  /** 光柱(见 Pillar)。宽度从 w0 变到 w1。 */
  pillar(o: { x: number; y0?: number; z: number; h: number; w0: number; w1?: number; life: number; color: [number, number, number]; a?: number }): void {
    this.pillars.push({ x: o.x, y0: o.y0 ?? 0, z: o.z, h: o.h, w0: o.w0, w1: o.w1 ?? o.w0, age: 0, life: o.life, color: o.color, a: o.a ?? 1 });
  }

  /** 一道闪电:从 a 到 b,jag = 抖动幅度(占长度的比例),life 秒内每 0.04 秒重新抖一次。 */
  bolt(a: Vec3, b: Vec3, width: number, life: number, color: [number, number, number], jag = 0.16, branches = 3): void {
    const bo: Bolt = { a: a.clone(), b: b.clone(), age: 0, life, width, color, jag, seed: Math.floor(this.rnd() * 1e6), pts: [], branches: [], regen: 0 };
    this.shapeBolt(bo, branches);
    this.bolts.push(bo);
  }

  private shapeBolt(bo: Bolt, branches: number): void {
    const rnd = mulberry32(bo.seed + Math.floor(bo.age / 0.04) * 131);
    const jagged = (a: Vec3, b: Vec3, depth: number, jag: number): Vec3[] => {
      let pts = [a.clone(), b.clone()];
      let amp = Vec3.distance(a, b) * jag;
      for (let d = 0; d < depth; d += 1) {
        const next: Vec3[] = [pts[0]];
        for (let i = 0; i < pts.length - 1; i += 1) {
          const m = new Vec3((pts[i].x + pts[i + 1].x) / 2 + (rnd() - 0.5) * amp, (pts[i].y + pts[i + 1].y) / 2 + (rnd() - 0.5) * amp * 0.6, (pts[i].z + pts[i + 1].z) / 2 + (rnd() - 0.5) * amp);
          next.push(m, pts[i + 1]);
        }
        pts = next;
        amp *= 0.52;
      }
      return pts;
    };
    bo.pts = jagged(bo.a, bo.b, 5, bo.jag);
    bo.branches = [];
    const len = Vec3.distance(bo.a, bo.b);
    for (let k = 0; k < branches; k += 1) {
      const i = 4 + Math.floor(rnd() * (bo.pts.length - 10));
      const from = bo.pts[Math.max(0, Math.min(bo.pts.length - 1, i))];
      const l = len * (0.12 + rnd() * 0.2);
      const to = new Vec3(from.x + (rnd() - 0.5) * l * 1.6, from.y - l * (0.3 + rnd() * 0.7), from.z + (rnd() - 0.5) * l * 1.2);
      bo.branches.push(jagged(from, to, 3, 0.22));
    }
  }

  /** 贴地的一块:kind = scorch(焦痕)/ rune(法阵)/ atlas(图集里的某一格,加色)。半径从 r0 长到 r1。 */
  decal(kind: Decal['kind'], cell: number, x: number, z: number, r0: number, r1: number, life: number, color: [number, number, number], a = 1, fadeIn = 0.05, hold = 0.3, spin = 0, y = 0.03): void {
    this.decals.push({ kind, cell, x, z, y, r0, r1, rot: this.rnd() * 6.28, spin, age: 0, life, fadeIn, hold, color, a });
  }

  /** 脚下的一团接地暗影(每帧报一次,画完就清)。 */
  blob(x: number, z: number, r: number, a: number, y = 0.035): void {
    this.blobs.push(x, y, z, r, a);
  }

  clear(): void {
    this.parts.length = 0;
    this.bolts.length = 0;
    this.decals.length = 0;
    this.arcs.length = 0;
    this.bands.length = 0;
    this.pillars.length = 0;
    this.streaks.length = 0;
    this.whirls.length = 0;
    this.blades.length = 0;
  }

  update(dt: number, cam: Node): void {
    // 镜头的右 / 上 / 前(世界方向):粒子片朝镜头摆
    const cr = cam.worldRotation;
    Vec3.transformQuat(_rt, Vec3.RIGHT, cr);
    Vec3.transformQuat(_up, Vec3.UP, cr);
    Vec3.transformQuat(_f, Vec3.FORWARD, cr);
    const cp = cam.worldPosition;
    const add = this.addMesh;
    const alp = this.alphaMesh;
    const add2 = this.add2Mesh;
    const alp2 = this.alpha2Mesh;
    add.begin();
    alp.begin();
    add2.begin();
    alp2.begin();
    if (this.warm > 0) {
      for (const m of [add, alp, add2, alp2]) {
        m.quad(cp.x, cp.y - 50, cp.z, cp.x + 0.01, cp.y - 50, cp.z, cp.x + 0.01, cp.y - 49.99, cp.z, cp.x, cp.y - 49.99, cp.z, 0, 0, 0.01, 0.01, 0, 0, 0, 0);
      }
    }
    const guv = fxUv(FX_CELL.glow);
    for (let i = 0; i < this.blobs.length; i += 5) {
      const bx = this.blobs[i];
      const by = this.blobs[i + 1];
      const bz = this.blobs[i + 2];
      const br = this.blobs[i + 3];
      alp.quad(bx - br, by, bz + br * 0.8, bx + br, by, bz + br * 0.8, bx + br, by, bz - br * 0.8, bx - br, by, bz - br * 0.8, guv[0], guv[1], guv[2], guv[3], 0, 0, 0, this.blobs[i + 4]);
    }
    this.blobs.length = 0;

    // ── 粒子 ──
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i -= 1) {
      const p = P[i];
      p.age += dt;
      if (p.age >= p.life) {
        P[i] = P[P.length - 1];
        P.pop();
        continue;
      }
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr;
      p.vy = p.vy * dr - 9.8 * p.grav * dt;
      p.vz *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02 && p.grav > 0) {   // 落地弹一下
        p.y = 0.02;
        p.vy = -p.vy * 0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.rot += p.spin * dt;
    }
    // 半透明的(烟)要从远到近画
    const smoke: Particle[] = [];
    for (const p of P) {
      if (!p.add) {
        smoke.push(p);
      }
    }
    smoke.sort((a, b) => ((b.x - cp.x) * _f.x + (b.y - cp.y) * _f.y + (b.z - cp.z) * _f.z) - ((a.x - cp.x) * _f.x + (a.y - cp.y) * _f.y + (a.z - cp.z) * _f.z));
    const draw = (m: DynMesh, p: Particle): void => {
      const t = p.age / p.life;
      const s = p.s0 + (p.s1 - p.s0) * t;
      const life = Math.min(1, p.age / Math.max(0.001, p.fadeIn * p.life)) * (1 - t * t);
      const split = this.fxOn && p.add;          // 特效着色器的加色:亮度乘进颜色,透明度只放寿命
      const cm = split ? p.a : 1;
      const al = split ? life : p.a * life;
      if (al <= 0.003 || s <= 0.0005) {
        return;
      }
      const r = (p.r0 + (p.r1 - p.r0) * t) * cm;
      const g = (p.g0 + (p.g1 - p.g0) * t) * cm;
      const b = (p.b0 + (p.b1 - p.b0) * t) * cm;
      const uv = p.t2 ? fx2Uv(p.cell) : fxUv(p.cell);
      let ax: number; let ay: number; let az: number; let bx: number; let by: number; let bz: number;
      if (p.stretch > 0) {
        // 沿速度方向拉长(投到垂直于视线的平面上)
        const vf = p.vx * _f.x + p.vy * _f.y + p.vz * _f.z;
        _t.set(p.vx - _f.x * vf, p.vy - _f.y * vf, p.vz - _f.z * vf);
        const sp = _t.length();
        if (sp < 1e-4) {
          _t.set(_up);
        } else {
          _t.multiplyScalar(1 / sp);
        }
        Vec3.cross(_s, _f, _t);
        const L = s * (1 + p.stretch * Math.min(3, sp * 0.12));
        ax = _t.x * L; ay = _t.y * L; az = _t.z * L;
        bx = _s.x * s; by = _s.y * s; bz = _s.z * s;
      } else {
        const cs = Math.cos(p.rot) * s;
        const sn = Math.sin(p.rot) * s;
        ax = _rt.x * cs + _up.x * sn; ay = _rt.y * cs + _up.y * sn; az = _rt.z * cs + _up.z * sn;
        bx = -_rt.x * sn + _up.x * cs; by = -_rt.y * sn + _up.y * cs; bz = -_rt.z * sn + _up.z * cs;
      }
      // 贴地的云 / 雾 / 尘(半透明的大面片)长大后下半截会插进地面,被地面切出直边,看着像一块块灰色碎玻璃 → 按当前大小往上抬
      let py = p.y;
      if (p.t2 && !p.add && (p.cell === FX2_CELL.cumulus || p.cell === FX2_CELL.fog || p.cell === FX2_CELL.dust)) {
        py = Math.max(py, s * 0.65);
      }
      m.quad(p.x - ax - bx, py - ay - by, p.z - az - bz, p.x + ax - bx, py + ay - by, p.z + az - bz, p.x + ax + bx, py + ay + by, p.z + az + bz, p.x - ax + bx, py - ay + by, p.z - az + bz,
        uv[0], uv[1], uv[2], uv[3], r, g, b, this.fxOn && softCell(p.t2, p.cell) ? al + 2 : al);
    };
    for (const p of smoke) {
      draw(p.t2 ? alp2 : alp, p);
    }
    for (const p of P) {
      if (p.add) {
        draw(p.t2 ? add2 : add, p);
      }
    }
    this.drawArcs(dt, add2);
    this.drawBands(dt, add2);
    this.drawPillars(dt, add2);
    this.drawBlades(dt, add2);
    this.drawStreaks(dt);
    this.drawWhirls(dt);

    // ── 闪电 ──
    const buv = fxUv(FX_CELL.bolt);
    const bum = (buv[0] + buv[2]) / 2;
    const ribbon = (pts: Vec3[], width: number, r: number, g: number, b: number, a: number): void => {
      let px = 0; let py = 0; let pz = 0; let sx = 0; let sy = 0; let sz = 0;
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const q = pts[Math.min(pts.length - 1, i + 1)];
        const o = pts[Math.max(0, i - 1)];
        _t.set(q.x - o.x, q.y - o.y, q.z - o.z);
        _c.set(cp.x - p.x, cp.y - p.y, cp.z - p.z);
        Vec3.cross(_s, _t, _c);
        const l = _s.length();
        if (l < 1e-6) {
          _s.set(_rt);
        } else {
          _s.multiplyScalar(1 / l);
        }
        const w = width * (i === 0 || i === pts.length - 1 ? 0.6 : 1);
        const nx = _s.x * w; const ny = _s.y * w; const nz = _s.z * w;
        if (i > 0) {
          add.quad(px - sx, py - sy, pz - sz, p.x - nx, p.y - ny, p.z - nz, p.x + nx, p.y + ny, p.z + nz, px + sx, py + sy, pz + sz, bum, buv[1], bum, buv[3], r, g, b, a);
        }
        px = p.x; py = p.y; pz = p.z; sx = nx; sy = ny; sz = nz;
      }
    };
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bo = this.bolts[i];
      const before = Math.floor(bo.age / 0.04);
      bo.age += dt;
      if (bo.age >= bo.life) {
        this.bolts.splice(i, 1);
        continue;
      }
      if (Math.floor(bo.age / 0.04) !== before) {
        this.shapeBolt(bo, bo.branches.length);
      }
      const t = bo.age / bo.life;
      const flick = 0.65 + 0.35 * Math.sin(bo.age * 190 + bo.seed);
      const a = (1 - t * t) * flick;
      ribbon(bo.pts, bo.width, bo.color[0], bo.color[1], bo.color[2], a);
      for (const br of bo.branches) {
        ribbon(br, bo.width * 0.45, bo.color[0], bo.color[1], bo.color[2], a * 0.7);
      }
    }

    // ── 贴地的痕迹 ──
    const sc = this.scorchMesh;
    const ru = this.runeMesh;
    sc.begin();
    ru.begin();
    if (this.warm > 0) {
      for (const m of [sc, ru]) {
        m.quad(cp.x, cp.y - 50, cp.z, cp.x + 0.01, cp.y - 50, cp.z, cp.x + 0.01, cp.y - 49.99, cp.z, cp.x, cp.y - 49.99, cp.z, 0, 0, 0.01, 0.01, 0, 0, 0, 0);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i -= 1) {
      const d = this.decals[i];
      d.age += dt;
      if (d.age >= d.life) {
        this.decals.splice(i, 1);
        continue;
      }
      d.rot += d.spin * dt;
      const t = d.age / d.life;
      const grow = 1 - Math.pow(1 - Math.min(1, t * 2.2), 3);
      const r = d.r0 + (d.r1 - d.r0) * grow;
      const fadeOut = d.age <= d.hold ? 1 : 1 - (d.age - d.hold) / Math.max(0.001, d.life - d.hold);
      const dl = Math.min(1, d.age / Math.max(0.001, d.fadeIn)) * Math.max(0, fadeOut);
      const dsplit = this.fxOn && (d.kind === 'atlas' || d.kind === 'fx2');
      const a = dsplit ? dl : d.a * dl;
      const dc = dsplit ? d.a : 1;
      const cs = Math.cos(d.rot) * r;
      const sn = Math.sin(d.rot) * r;
      const m = d.kind === 'scorch' ? sc : d.kind === 'rune' ? ru : d.kind === 'fx2' ? add2 : d.kind === 'fx2a' ? alp2 : add;
      const uv = d.kind === 'atlas' ? fxUv(d.cell) : d.kind === 'fx2' || d.kind === 'fx2a' ? fx2Uv(d.cell) : [0, 0, 1, 1];
      // 四个角(从上往下看逆时针):朝上的面
      const dsoft = this.fxOn && d.kind !== 'scorch' && d.kind !== 'rune' && softCell(d.kind !== 'atlas', d.cell);
      m.quad(d.x - cs + sn, d.y, d.z + sn + cs, d.x + cs + sn, d.y, d.z - sn + cs, d.x + cs - sn, d.y, d.z - sn - cs, d.x - cs - sn, d.y, d.z + sn - cs,
        uv[0], uv[1], uv[2], uv[3], d.color[0] * dc, d.color[1] * dc, d.color[2] * dc, dsoft ? a + 2 : a);
    }
    add.end();
    alp.end();
    add2.end();
    alp2.end();
    sc.end();
    ru.end();
    this.stats.particles = P.length;
    this.stats.bolts = this.bolts.length;
    this.stats.decals = this.decals.length;
  }

  private drawArcs(dt: number, m: DynMesh): void {
    const uv = fx2Uv(FX2_CELL.crescent);
    const SEG = 22;
    for (let i = this.arcs.length - 1; i >= 0; i -= 1) {
      const a = this.arcs[i];
      a.age += dt;
      if (a.age >= a.life) {
        this.arcs.splice(i, 1);
        continue;
      }
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      const t = a.age / a.life;
      const alife = Math.min(1, a.age / Math.max(0.001, a.fadeIn)) * (1 - t * t);
      const al = this.fxOn ? alife : a.a * alife;
      const ac = this.fxOn ? a.a : 1;
      const r = a.r0 + (a.r1 - a.r0) * (1 - (1 - t) * (1 - t));
      const rx = -a.fz;           // 右 = 前 × 上(俯视顺时针 90°)
      const rz = a.fx;
      const ct = Math.cos(a.tilt);
      const st = Math.sin(a.tilt);
      if (!m.room((SEG + 1) * 2, SEG * 6)) {
        continue;
      }
      let prev = -1;
      for (let k = 0; k <= SEG; k += 1) {
        const u = k / SEG;
        const th = (u - 0.5) * a.span;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        // 弧所在的平面:前方 + 「右方绕前方轴转 tilt」
        const dx = a.fx * c + rx * sn * ct;
        const dy = sn * st;
        const dz = a.fz * c + rz * sn * ct;
        const ro = r + a.w * 0.25;
        const ri = Math.max(0.05, r - a.w);
        const uu = uv[0] + (uv[2] - uv[0]) * u;
        const i0 = m.vert(a.x + dx * ro, a.y + dy * ro, a.z + dz * ro, uu, uv[1], a.color[0] * ac, a.color[1] * ac, a.color[2] * ac, al);
        m.vert(a.x + dx * ri, a.y + dy * ri, a.z + dz * ri, uu, uv[3], a.color[0] * ac, a.color[1] * ac, a.color[2] * ac, al);
        if (prev >= 0) {
          m.tri(prev, i0, i0 + 1);
          m.tri(prev, i0 + 1, prev + 1);
        }
        prev = i0;
      }
    }
  }

  private drawBands(dt: number, m: DynMesh): void {
    const uv = fx2Uv(FX2_CELL.swirl);
    const SEG = 30;
    const REP = 3;          // 贴图绕一圈重复几次(风丝横向可无缝平铺)
    const per = SEG / REP;
    for (let i = this.bands.length - 1; i >= 0; i -= 1) {
      const b = this.bands[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.bands.splice(i, 1);
        continue;
      }
      if (b.follow) {
        const p = b.follow();
        b.x = p[0];
        b.z = p[1];
      }
      b.rot += b.spin * dt;
      const t = b.age / b.life;
      const blife = Math.min(1, t * 6) * (1 - t * t);
      const al = this.fxOn ? blife : b.a * blife;
      const bc = this.fxOn ? b.a : 1;
      const r = b.r0 + (b.r1 - b.r0) * t;
      if (!m.room((SEG + REP + 2) * 4, SEG * 12)) {
        continue;
      }
      // 两层:内层略小、转得慢一点,叠出厚度
      for (let layer = 0; layer < 2; layer += 1) {
        const rr = r * (layer ? 0.82 : 1);
        const rot = b.rot * (layer ? 0.8 : 1) + layer * 1.3;
        const la = this.fxOn ? al : al * (layer ? 0.6 : 1);
        const c0 = b.color[0] * bc * (this.fxOn && layer ? 0.6 : 1);
        const c1 = b.color[1] * bc * (this.fxOn && layer ? 0.6 : 1);
        const c2 = b.color[2] * bc * (this.fxOn && layer ? 0.6 : 1);
        // 每段贴图单独连成一串(段与段之间重复一对顶点,u 从 1 跳回 0,不会出现整段贴图倒着拉的接缝)
        for (let seg = 0; seg < REP; seg += 1) {
          let prev = -1;
          for (let kk = 0; kk <= per; kk += 1) {
            const k = seg * per + kk;
            const ang = (k / SEG) * Math.PI * 2 + rot;
            const x = b.x + Math.cos(ang) * rr;
            const z = b.z + Math.sin(ang) * rr;
            const uu = uv[0] + (uv[2] - uv[0]) * (kk / per);
            const i0 = m.vert(x, b.y, z, uu, uv[3], c0, c1, c2, la);
            m.vert(x, b.y + b.h, z, uu, uv[1], c0, c1, c2, la);
            if (prev >= 0) {
              m.tri(prev, i0, i0 + 1);
              m.tri(prev, i0 + 1, prev + 1);
            }
            prev = i0;
          }
        }
      }
    }
  }

  private drawPillars(dt: number, m: DynMesh): void {
    const uv = fx2Uv(FX2_CELL.beam);
    // 正对镜头的竖片:宽度方向 = 镜头右方去掉竖直分量
    let hx = _rt.x;
    let hz = _rt.z;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;
    for (let i = this.pillars.length - 1; i >= 0; i -= 1) {
      const p = this.pillars[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.pillars.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      const plife = Math.min(1, t * 12) * (1 - t) * (1 - t);
      const al = this.fxOn ? plife : p.a * plife;
      const pc = this.fxOn ? p.a : 1;
      const w = p.w0 + (p.w1 - p.w0) * t;
      const h = p.h * (0.6 + 0.4 * Math.min(1, t * 5));
      m.quad(p.x - hx * w, p.y0, p.z - hz * w, p.x + hx * w, p.y0, p.z + hz * w, p.x + hx * w, p.y0 + h, p.z + hz * w, p.x - hx * w, p.y0 + h, p.z - hz * w,
        uv[0], uv[1], uv[2], uv[3], p.color[0] * pc, p.color[1] * pc, p.color[2] * pc, al);
    }
  }

  private drawStreaks(dt: number): void {
    const m = this.flowMesh;
    m.begin();
    if (this.warm > 0) {
      this.warm -= 1;
      const cp = _c;
      m.quad(cp.x, -50, cp.z, cp.x + 0.01, -50, cp.z, cp.x + 0.01, -49.99, cp.z, cp.x, -49.99, cp.z, 0, 0, 0.01, 0.01, 0, 0, 0, 0);
    }
    const SEG = 28;
    let hx = _rt.x;
    let hz = _rt.z;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;
    for (let i = this.streaks.length - 1; i >= 0; i -= 1) {
      const st = this.streaks[i];
      st.age += dt;
      if (st.age >= st.life) {
        this.streaks.splice(i, 1);
        continue;
      }
      if (st.follow) {
        const p = st.follow();
        st.x = p[0];
        st.z = p[1];
      }
      const head = Math.min(1, st.age / Math.max(0.001, st.grow));
      // 尾巴:头走到底之前保持 len 的长度,之后在剩下的时间里收到头上
      const after = Math.max(0, st.age - st.grow) / Math.max(0.001, st.life - st.grow);
      const tail = Math.max(0, head - st.len) + (1 - Math.max(0, head - st.len)) * after * after;
      if (head - tail < 0.01 || !m.room((SEG + 1) * 2, SEG * 6)) {
        continue;
      }
      const fade = Math.min(1, st.age / 0.05) * (1 - after);
      const c = st.color;
      let prev = -1;
      for (let k = 0; k <= SEG; k += 1) {
        const s = tail + (head - tail) * (k / SEG);
        const w = st.w0 + (st.w1 - st.w0) * s;
        // 带子两头渐隐(头部一小截更亮)
        const local = (s - tail) / Math.max(0.001, head - tail);
        const slife = fade * Math.min(1, local * 5) * Math.min(1, (1 - local) * 8 + 0.15);
        const al = this.fxOn ? slife : st.a * slife;
        const sc = this.fxOn ? st.a : 1;
        const u = s * st.rep - st.age * st.scroll;
        let px: number; let py: number; let pz: number; let ox: number; let oy: number; let oz: number;
        if (st.kind === 'spiral') {
          const ang = st.a0 + st.turns * s;
          const r = st.r0 + (st.r1 - st.r0) * s;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          px = st.x + ca * r;
          pz = st.z + sa * r;
          py = st.y0 + (st.y1 - st.y0) * s;
          // 宽度方向:沿半径(平躺);越高越往上翘,远看像卷起来的浪
          const lift = Math.min(1, Math.abs(st.y1 - st.y0) * 0.6);
          ox = ca * w * (1 - lift * 0.6);
          oz = sa * w * (1 - lift * 0.6);
          oy = w * lift * 0.8;
        } else if (st.kind === 'line') {
          // 平躺在地上的一条带子:宽度方向 = 走向的水平法线
          const ddx = st.x2 - st.x;
          const ddz = st.z2 - st.z;
          const dl = Math.hypot(ddx, ddz) || 1;
          px = st.x + ddx * s;
          pz = st.z + ddz * s;
          py = st.y0;
          ox = (-ddz / dl) * w;
          oz = (ddx / dl) * w;
          oy = 0;
        } else {
          px = st.x;
          pz = st.z;
          py = st.y0 * (1 - s);
          ox = hx * w;
          oz = hz * w;
          oy = 0;
        }
        const i0 = m.vert(px - ox, py - oy, pz - oz, u, 1, c[0] * sc, c[1] * sc, c[2] * sc, al);
        m.vert(px + ox, py + oy, pz + oz, u, 0, c[0] * sc, c[1] * sc, c[2] * sc, al);
        if (prev >= 0) {
          m.tri(prev, i0, i0 + 1);
          m.tri(prev, i0 + 1, prev + 1);
        }
        prev = i0;
      }
    }
    m.end();
  }

  private drawWhirls(dt: number): void {
    const m = this.inkMesh;
    m.begin();
    if (this.warm > 0) {
      m.quad(0, -50, 0, 0.01, -50, 0, 0.01, -49.99, 0, 0, -49.99, 0, 0, 0, 0.01, 0.01, 0, 0, 0, 0);
    }
    // 圆盘拆成一圈圈的环,每圈转速不同(内快外慢,像真的漩涡):贴图上的笔触会被越卷越紧
    const RINGS = [0, 0.08, 0.18, 0.3, 0.43, 0.56, 0.69, 0.81, 0.91, 1.0];
    const SEG = 40;
    for (let i = this.whirls.length - 1; i >= 0; i -= 1) {
      const w = this.whirls[i];
      w.age += dt;
      if (w.age >= w.life) {
        this.whirls.splice(i, 1);
        continue;
      }
      const g = Math.min(1, w.age / Math.max(0.001, w.grow));
      const R = w.r0 + (w.r1 - w.r0) * (1 - Math.pow(1 - g, 3));
      const fade = w.age <= w.hold ? 1 : Math.max(0, 1 - (w.age - w.hold) / Math.max(0.001, w.life - w.hold));
      const al = w.a * Math.min(1, w.age / 0.04) * fade;
      const layer = (u0: number, u1: number, c: [number, number, number], a: number, y: number, speedK: number, phase: number): void => {
        if (!m.room(RINGS.length * (SEG + 1), (RINGS.length - 1) * SEG * 6)) {
          return;
        }
        let first = -1;
        for (const rf of RINGS) {
          const omega = speedK * (0.6 + 0.75 * Math.pow(1 - rf, 1.5));          // 内圈约快一倍(差太多一秒就扭成同心圈)
          const rot = w.rot + w.spin * omega * w.age + phase;
          // 外沿一圈透明度渐隐(贴图本身也淡出,这里再压一点,边缘不留硬圈)
          const ea = a * (rf > 0.9 ? Math.max(0, (1 - rf) / 0.1) * 0.8 + 0.2 : 1);
          for (let j = 0; j <= SEG; j += 1) {
            const th = (j / SEG) * Math.PI * 2;
            const k = m.vert(w.x + Math.cos(th + rot) * rf * R, y, w.z + Math.sin(th + rot) * rf * R,
              u0 + (u1 - u0) * (0.5 + 0.5 * rf * Math.cos(th)), 0.5 + 0.5 * rf * Math.sin(th), c[0], c[1], c[2], ea);
            if (first < 0) {
              first = k;
            }
          }
        }
        for (let ri = 0; ri < RINGS.length - 1; ri += 1) {
          for (let j = 0; j < SEG; j += 1) {
            const a0 = first + ri * (SEG + 1) + j;
            const b0 = a0 + SEG + 1;
            m.tri(a0, b0 + 1, b0);          // 从上往下看是逆时针(正面朝上)
            m.tri(a0, a0 + 1, b0 + 1);
          }
        }
      };
      layer(0.002, 0.498, w.ink, al * 0.85, w.y, 1, 0);
      layer(0.502, 0.998, w.hi, al * 0.9, w.y + 0.004, 1, 0);
      layer(0.502, 0.998, w.hi, al * 0.4, w.y + 0.008, 1.3, 2.1);
    }
    m.end();
  }


  private drawBlades(dt: number, m: DynMesh): void {
    let hx = _rt.x;
    let hz = _rt.z;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;
    for (let i = this.blades.length - 1; i >= 0; i -= 1) {
      const b = this.blades[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.blades.splice(i, 1);
        continue;
      }
      const t = b.age / b.life;
      const kl = Math.min(1, t * 14) * (1 - t) * (1 - t * 0.5);
      const al = this.fxOn ? kl : b.a * kl;
      const kc = this.fxOn ? b.a : 1;
      const w = b.w0 + (b.w1 - b.w0) * Math.min(1, t * 2.5);
      // 从上往下「劈」出来:前 30% 的时间里下沿从高处落到地面
      const reveal = Math.min(1, t / 0.3);
      const top = b.y0 + b.h;
      const bottom = top - b.h * (1 - Math.pow(1 - reveal, 2.2));
      if (!m.room(4, 6)) {
        continue;
      }
      const uv = fx2Uv(b.cell);
      // 贴图长度方向(u)对应高度,厚度方向(v)对应宽度;露出的部分只取贴图对应的那一截
      const uTop = uv[2];
      const uBot = uv[2] - (uv[2] - uv[0]) * ((top - bottom) / b.h);
      const vL = b.flip ? uv[3] : uv[1];
      const vR = b.flip ? uv[1] : uv[3];
      const c: [number, number, number] = [b.color[0] * kc, b.color[1] * kc, b.color[2] * kc];
      const i0 = m.vert(b.x - hx * w, bottom, b.z - hz * w, uBot, vL, c[0], c[1], c[2], al);
      m.vert(b.x + hx * w, bottom, b.z + hz * w, uBot, vR, c[0], c[1], c[2], al);
      m.vert(b.x + hx * w, top, b.z + hz * w, uTop, vR, c[0], c[1], c[2], al);
      m.vert(b.x - hx * w, top, b.z - hz * w, uTop, vL, c[0], c[1], c[2], al);
      m.tri(i0, i0 + 1, i0 + 2);
      m.tri(i0, i0 + 2, i0 + 3);
    }
  }
}
