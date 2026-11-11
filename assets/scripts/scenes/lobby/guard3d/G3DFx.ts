import { Material, Node, Texture2D, Vec3 } from 'cc';
import { DynMesh, material, tex } from './G3DKit';
import { FX_CELL, fxUv, paintFxAtlas, paintRune, paintScorch } from './G3DSkins';
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
  cell: number; add: boolean; grav: number; drag: number; rot: number; spin: number; stretch: number; fadeIn: number;
}
export interface Emit {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number;
  life: number; s0: number; s1?: number;
  c0: [number, number, number]; c1?: [number, number, number]; a?: number;
  cell: number; add?: boolean; grav?: number; drag?: number; rot?: number; spin?: number; stretch?: number; fadeIn?: number;
}
interface Bolt { a: Vec3; b: Vec3; age: number; life: number; width: number; color: [number, number, number]; jag: number; seed: number; pts: Vec3[]; branches: Vec3[][]; regen: number }
interface Decal { kind: 'scorch' | 'rune' | 'atlas'; cell: number; x: number; z: number; y: number; r0: number; r1: number; rot: number; spin: number; age: number; life: number; fadeIn: number; hold: number; color: [number, number, number]; a: number }

const _f = new Vec3();
const _rt = new Vec3();
const _up = new Vec3();
const _t = new Vec3();
const _s = new Vec3();
const _c = new Vec3();

export class FxWorld {
  private readonly addMesh: DynMesh;
  private readonly alphaMesh: DynMesh;
  private readonly scorchMesh: DynMesh;
  private readonly runeMesh: DynMesh;
  private readonly parts: Particle[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly decals: Decal[] = [];
  private readonly blobs: number[] = [];
  private readonly rnd = mulberry32(977);
  readonly mats: Material[] = [];
  stats = { particles: 0, bolts: 0, decals: 0 };

  constructor(parent: Node) {
    const atlas: Texture2D = tex(paintFxAtlas(), false, 2);
    const mk = (technique: number, texture: Texture2D, scale: number): Material => {
      const m = material('builtin-unlit', { USE_TEXTURE: true, USE_VERTEX_COLOR: true }, technique);
      m.setProperty('mainTexture', texture);
      m.setProperty('colorScale', new Vec3(scale, scale, scale));
      this.mats.push(m);
      return m;
    };
    // 顺序 = 画的先后:贴地的痕迹在最底下,其次烟,最后是发光的
    this.scorchMesh = new DynMesh(parent, 'ShowFxScorch', mk(3, tex(paintScorch(256), false, 2), 1), 64 * 4, 64 * 6);
    this.runeMesh = new DynMesh(parent, 'ShowFxRune', mk(2, tex(paintRune(512), false, 4), 3.2), 16 * 4, 16 * 6);
    this.alphaMesh = new DynMesh(parent, 'ShowFxAlpha', mk(3, atlas, 1), 900 * 4, 900 * 6);
    this.addMesh = new DynMesh(parent, 'ShowFxAdd', mk(2, atlas, 5), 5000 * 4, 5000 * 6);
  }

  rand(a = 0, b = 1): number {
    return a + (b - a) * this.rnd();
  }

  emit(e: Emit): void {
    if (this.parts.length > 5200) {
      return;
    }
    const c1 = e.c1 ?? e.c0;
    this.parts.push({
      x: e.x, y: e.y, z: e.z, vx: e.vx ?? 0, vy: e.vy ?? 0, vz: e.vz ?? 0, age: 0, life: e.life, s0: e.s0, s1: e.s1 ?? e.s0,
      r0: e.c0[0], g0: e.c0[1], b0: e.c0[2], r1: c1[0], g1: c1[1], b1: c1[2], a: e.a ?? 1,
      cell: e.cell, add: e.add !== false, grav: e.grav ?? 0, drag: e.drag ?? 0, rot: e.rot ?? 0, spin: e.spin ?? 0, stretch: e.stretch ?? 0, fadeIn: e.fadeIn ?? 0.08,
    });
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
    add.begin();
    alp.begin();
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
      const al = p.a * Math.min(1, p.age / Math.max(0.001, p.fadeIn * p.life)) * (1 - t * t);
      if (al <= 0.003 || s <= 0.0005) {
        return;
      }
      const r = p.r0 + (p.r1 - p.r0) * t;
      const g = p.g0 + (p.g1 - p.g0) * t;
      const b = p.b0 + (p.b1 - p.b0) * t;
      const uv = fxUv(p.cell);
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
      m.quad(p.x - ax - bx, p.y - ay - by, p.z - az - bz, p.x + ax - bx, p.y + ay - by, p.z + az - bz, p.x + ax + bx, p.y + ay + by, p.z + az + bz, p.x - ax + bx, p.y - ay + by, p.z - az + bz,
        uv[0], uv[1], uv[2], uv[3], r, g, b, al);
    };
    for (const p of smoke) {
      draw(alp, p);
    }
    for (const p of P) {
      if (p.add) {
        draw(add, p);
      }
    }

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
      const a = d.a * Math.min(1, d.age / Math.max(0.001, d.fadeIn)) * Math.max(0, fadeOut);
      const cs = Math.cos(d.rot) * r;
      const sn = Math.sin(d.rot) * r;
      const m = d.kind === 'scorch' ? sc : d.kind === 'rune' ? ru : add;
      const uv = d.kind === 'atlas' ? fxUv(d.cell) : [0, 0, 1, 1];
      // 四个角(从上往下看逆时针):朝上的面
      m.quad(d.x - cs + sn, d.y, d.z + sn + cs, d.x + cs + sn, d.y, d.z - sn + cs, d.x + cs - sn, d.y, d.z - sn - cs, d.x - cs - sn, d.y, d.z + sn - cs,
        uv[0], uv[1], uv[2], uv[3], d.color[0], d.color[1], d.color[2], a);
    }
    add.end();
    alp.end();
    sc.end();
    ru.end();
    this.stats.particles = P.length;
    this.stats.bolts = this.bolts.length;
    this.stats.decals = this.decals.length;
  }
}
