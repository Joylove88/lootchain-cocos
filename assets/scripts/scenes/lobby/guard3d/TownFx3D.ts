import { Color, Node, PointLight, sys, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { TownCombatFx } from '../LobbyTownCombatFx';
import { LobbyTownRenderer } from '../LobbyTownRenderer';
import { FxWorld } from './G3DFx';
import { DynMesh } from './G3DKit';
import { FX_CELL, fxUv } from './G3DSkins';
import { addFieldExtra, fieldUnitHeight } from './TownUnits3D';
import type { FieldExtra } from './TownUnits3D';
import { FIELD_LAYER, TownWorld3D } from './TownWorld3D';

/**
 * 野外真 3D 场景 · 技能特效(实验,2026-11-16;跟着 ?field3d=2 一起开)。全是代码:粒子、条带、贴地的环和裂纹、点光,不带任何素材文件。
 *
 * 用户:「地形,技能也可以用酷炫的 3D 素材」。原来的 2D 战斗特效是贴在画面上的骨骼动画,进不了 3D 的前后遮挡,
 * 也照不亮地面和角色。这里给「已经是 3D 模型的出手者」(现在是主角)换一套 3D 的:
 * - 普攻:一道月牙形的刀光,沿挥砍的平面扫过去(三段连招方向各不相同,第三段是竖劈);没砍中也有;
 * - 命中:火星 + 白闪 + 脚下一圈冲击环,重击再加尘土;同时亮一盏很短的点光,照到地面、怪和旁边的树上;
 * - 重斩:蓄力的光团 → 一道大竖劈 + 身前的地裂纹和三道往前推的冲击环;
 * - 突进斩:沿突进路线的一道光带 + 拖尾 + 终点的刀光;
 * - 旋风斩:三圈高低错开的环形刀光 + 贴地往外扩的环 + 一圈扬尘;
 * - 另外:跑动时脚下的尘土、翻滚的拖尾、怪倒下时的一团尘、空气里慢慢飘的光尘、传送阵的一盏蓝光。
 * 伤害、范围、出手时机一行没动 —— 只是在渲染器出 2D 特效的那几个点上(resolveLeaderHit / impactMonster / playOwnKz /
 * TownCombatFx 的 play、swing、projectile…)把 2D 的那份拦下来,在同一个位置出 3D 的。出手者还是 2D 骨骼的(队友、怪)照旧出 2D 特效。
 */

type RGB = [number, number, number];
interface Slash { c: Vec3; a: Vec3; b: Vec3; r: number; w: number; t0: number; t1: number; age: number; life: number; sweep: number; color: RGB; follow: any }
interface Flash { light: PointLight; age: number; life: number; flux: number }
interface Shot { from: Vec3; to: Vec3; age: number; life: number; color: RGB; done: (() => void) | null }

const GOLD: RGB = [1.0, 0.84, 0.52];
const PALE: RGB = [0.78, 0.9, 1.0];
const DUST: RGB = [0.52, 0.47, 0.38];
const TAU = Math.PI * 2;
const _p = new Vec3();
const _q = new Vec3();
const rad = (deg: number): number => (deg * Math.PI) / 180;
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** >0 = 渲染器现在要出的 2D 战斗特效不要了(同一个位置已经换成 3D 的)。 */
let quiet = 0;

class TownFx3D implements FieldExtra {
  private self: any = null;
  private world: TownWorld3D | null = null;
  private root: Node | null = null;
  private fx: FxWorld | null = null;
  private arc: DynMesh | null = null;
  private slashes: Slash[] = [];
  private flashes: Flash[] = [];
  private free: PointLight[] = [];
  private shots: Shot[] = [];
  private gate: PointLight | null = null;
  private time = 0;
  private stepAt = 0;
  private moteAt = 0;
  private lastX = 0;
  private lastY = 0;
  private stats = { slashes: 0, hits: 0, skills: 0, shots: 0, deaths: 0 };
  /**
   * flux = 技能点光的总倍数(线性直出下亮了会把地面照成一片白,0.34 是对着画面调的);glow / rune = 发光特效 / 贴地符文的亮度倍数。
   * 带 Hdr 的是开了后期(高动态 + 泛光 + 高光肩部)时用的那一组:特效本身比线性直出时亮一些(超过 1 的部分变成光晕),
   * 但不能给太足 —— 几片发光的东西叠在一起就是一团死白(3.0 试过,旋风斩中心白成一片),2.2 是对着画面调的;
   * 打在地上的光更要收着:地面一被照到超过 1 就整片跟着泛光,糊成一团(0.6 试过,太炸),所以比不开后期时还低一点。
   */
  cfg = { on: true, flux: 0.34, fluxHdr: 0.26, glow: 1.5, glowHdr: 2.2, rune: 1.3, runeHdr: 2.0, motes: true, dust: true };
  /** 现在画面是不是高动态的(开了后期)。 */
  private hdr = false;

  private fluxK(): number {
    return this.hdr ? this.cfg.fluxHdr : this.cfg.flux;
  }

  /** 按现在是不是高动态,把特效材质的亮度倍数设好。 */
  private tone(): void {
    if (!this.fx) {
      return;
    }
    const g = this.hdr ? this.cfg.glowHdr : this.cfg.glow;
    const r = this.hdr ? this.cfg.runeHdr : this.cfg.rune;
    this.fx.setGlowScale(g);
    this.fx.setRuneScale(r);
  }

  /** 现在是不是该出 3D 特效(真 3D 场景开着,且这个渲染器就是当前这个)。 */
  active(self: any): boolean {
    return this.cfg.on && !!this.fx && this.self === self && !!this.world && this.world.isOpen();
  }

  rootOf(): Node | null {
    return this.self?.entityRoot ?? null;
  }

  sync(self: any, world: TownWorld3D, dt: number): void {
    if (!this.cfg.on) {
      if (this.fx) {
        this.stop();
      }
      return;
    }
    if (this.self !== self || this.world !== world || !this.root || !this.root.isValid) {
      this.stop();
      this.self = self;
      this.world = world;
      this.build(self, world);
    }
    const fx = this.fx!;
    this.time += dt;
    const leader = self.leader;
    // 跑动的脚下尘土、翻滚 / 突进的拖尾(只给 3D 的队长出)
    if (leader && dt > 0 && fieldUnitHeight(leader) > 0) {
      const moved = Math.hypot(leader.x - this.lastX, leader.y - this.lastY);
      const dashing = Date.now() < (self.dashUntil ?? 0);
      if (dashing) {
        this.put(leader.x, leader.y, 0.5 + Math.random() * 0.8);
        fx.emit({ x: _p.x, y: _p.y, z: _p.z, life: 0.26, s0: 0.5, s1: 0.1, c0: PALE, a: 0.5, cell: FX_CELL.glow });
        this.put(leader.x, leader.y, 0.1);
        fx.emit({ x: _p.x, y: _p.y, z: _p.z, vy: 0.5, life: 0.5, s0: 0.2, s1: 0.6, c0: DUST, a: 0.3, cell: FX_CELL.smokeA, add: false, rot: Math.random() * 6 });
      } else if (this.cfg.dust && leader.moving && moved > 1 && this.time - this.stepAt > 0.24) {
        this.stepAt = this.time;
        this.put(leader.x - leader.facing * 20, leader.y, 0.06);
        fx.emit({ x: _p.x, y: _p.y, z: _p.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.35, vz: (Math.random() - 0.5) * 0.4, life: 0.55, s0: 0.1, s1: 0.36, c0: DUST, a: 0.2, cell: FX_CELL.smokeB, add: false, rot: Math.random() * 6, drag: 1.5 });
      }
      this.lastX = leader.x;
      this.lastY = leader.y;
    }
    // 空气里慢慢飘的光尘(只在画面范围内补)
    if (this.cfg.motes && dt > 0 && this.time - this.moteAt > 0.16) {
      this.moteAt = this.time;
      const x = world.focus.x + (Math.random() - 0.5) * world.halfW * 2.1;
      const z = world.focus.z + (Math.random() - 0.5) * world.halfH * 2.8;
      fx.emit({ x, y: 0.3 + Math.random() * 2.4, z, vx: 0.12 + Math.random() * 0.1, vy: (Math.random() - 0.4) * 0.08, vz: (Math.random() - 0.5) * 0.08, life: 4 + Math.random() * 3, s0: 0.022, s1: 0.03,
        c0: [1, 0.92, 0.66], a: 0.55, cell: FX_CELL.mote, fadeIn: 0.25 });
    }
    this.stepShots(dt);
    this.stepFlashes(dt);
    this.drawSlashes(dt);
    if (this.gate) {
      this.gate.luminousFlux = 420 * this.fluxK() * (0.82 + 0.18 * Math.sin(this.time * 2.1));
    }
    fx.update(dt, world.cam.node);
  }

  private build(self: any, world: TownWorld3D): void {
    const U = world.cfg.unitsPerM;
    const hx = (self.def?.width ?? 20000) / U / 2 + 20;
    const hz = (self.def?.height ?? 10000) / U / 2 / 0.7 + 20;
    const bounds = { min: [-hx, -4, -hz] as [number, number, number], max: [hx, 40, hz] as [number, number, number] };
    this.root = new Node('TownFx3D');
    this.root.layer = FIELD_LAYER;
    world.root.addChild(this.root);
    this.fx = new FxWorld(this.root, bounds);
    // 这套材质原来是给摄影棚的「高动态 + 泛光」调的(亮度乘 5):线性直出时压到 1.5;野外开了后期时给到 3 左右(见 cfg)
    this.hdr = world.post.isOn();
    this.tone();
    this.arc = new DynMesh(this.root, 'TownFxSlash', this.fx.glowMat, 2600, 15000, false, false, bounds);
    for (let i = 0; i < 3; i += 1) {
      const n = new Node('TownFxLight');
      n.layer = FIELD_LAYER;
      this.root.addChild(n);
      const L = n.addComponent(PointLight);
      L.range = 6;
      L.luminousFlux = 0;
      L.enabled = false;
      this.free.push(L);
    }
    const wp = self.def?.waypoint;
    if (wp && typeof wp.x === 'number') {
      const n = new Node('TownFxGate');
      n.layer = FIELD_LAYER;
      this.root.addChild(n);
      world.toWorld(wp.x, wp.y, _p, 1.1);
      n.setPosition(_p);
      const L = n.addComponent(PointLight);
      L.color = new Color(60, 150, 255, 255);
      L.range = 5;
      L.luminousFlux = 0;
      this.gate = L;
    }
    this.root.walk((n) => {
      n.layer = FIELD_LAYER;
    });
    this.lastX = self.leader?.x ?? 0;
    this.lastY = self.leader?.y ?? 0;
  }

  /** 地图坐标 + 离地高度 → 3D 世界坐标(写进 _p)。 */
  private put(mx: number, my: number, h: number): Vec3 {
    return this.world!.toWorld(mx, my, _p, h);
  }

  // ───────────────────────── 点光(闪一下就灭)─────────────────────────
  private flash(mx: number, my: number, h: number, color: RGB, flux: number, life: number, range = 6): void {
    const L = this.free.pop();
    if (!L) {
      return;
    }
    this.put(mx, my, h);
    L.node.setPosition(_p);
    L.color = new Color(Math.round(color[0] * 255), Math.round(color[1] * 255), Math.round(color[2] * 255), 255);
    L.range = range;
    L.luminousFlux = flux * this.fluxK();
    L.enabled = true;
    this.flashes.push({ light: L, age: 0, life, flux: flux * this.fluxK() });
  }

  private stepFlashes(dt: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const f = this.flashes[i];
      f.age += dt;
      if (f.age >= f.life) {
        f.light.luminousFlux = 0;
        f.light.enabled = false;
        this.free.push(f.light);
        this.flashes.splice(i, 1);
        continue;
      }
      const t = f.age / f.life;
      f.light.luminousFlux = f.flux * (1 - t) * (1 - t);
    }
  }

  // ───────────────────────── 刀光(月牙形的条带)─────────────────────────
  /**
   * 一道刀光:圆心在 (mx, my) 离地 h,挥砍的平面由朝向 yaw(度)和 tilt(度;0 = 水平横扫,90 = 竖劈)定;
   * 从角度 from 扫到 to(度;0 = 正前方,正数往右手边 / 往上);r = 半径,w = 月牙最宽处。follow = 跟着这个单位走。
   */
  slash(mx: number, my: number, h: number, yaw: number, tilt: number, from: number, to: number, r: number, w: number, color: RGB, life = 0.26, sweep = 0.09, delay = 0, follow: any = null): void {
    if (!this.world) {
      return;
    }
    const y = rad(yaw);
    const fwd = new Vec3(Math.cos(y), 0, -Math.sin(y));
    const right = new Vec3(Math.sin(y), 0, Math.cos(y));
    const t = rad(tilt);
    const b = new Vec3(right.x * Math.cos(t), Math.sin(t), right.z * Math.cos(t));
    const c = this.world.toWorld(mx, my, new Vec3(), h);
    if (follow) {
      // 跟着单位走:圆心存成相对单位脚底的偏移
      this.world.toWorld(follow.x, follow.y, _q, 0);
      c.subtract(_q);
    }
    this.slashes.push({ c, a: fwd, b, r, w, t0: rad(from), t1: rad(to), age: -delay, life, sweep, color, follow });
    this.stats.slashes += 1;
  }

  private drawSlashes(dt: number): void {
    const m = this.arc;
    if (!m) {
      return;
    }
    m.begin();
    const uv = fxUv(FX_CELL.core);
    const u = (uv[0] + uv[2]) / 2;
    const v = (uv[1] + uv[3]) / 2;
    const N = 20;
    for (let i = this.slashes.length - 1; i >= 0; i -= 1) {
      const s = this.slashes[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.slashes.splice(i, 1);
        continue;
      }
      if (s.age < 0 || !m.room((N + 1) * 4, N * 24)) {
        continue;
      }
      let cx = s.c.x;
      let cy = s.c.y;
      let cz = s.c.z;
      if (s.follow && this.world) {
        this.world.toWorld(s.follow.x, s.follow.y, _q, 0);
        cx += _q.x;
        cy += _q.y;
        cz += _q.z;
      }
      // 先从起点扫到终点(head 0 → 1),扫完之后整条往刀尖那头收、同时淡掉
      const head = Math.min(1, s.age / s.sweep);
      const fade = s.age <= s.sweep ? 1 : 1 - (s.age - s.sweep) / (s.life - s.sweep);
      const tail = s.age <= s.sweep ? Math.max(0, head - 0.85) : 1 - 0.85 * fade;
      let prevO = -1;
      let prevI = -1;
      let prevC = -1;
      for (let k = 0; k <= N; k += 1) {
        const along = k / N;
        const f = tail + (head - tail) * along;
        const th = s.t0 + (s.t1 - s.t0) * f;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        const dx = s.a.x * cs + s.b.x * sn;
        const dy = s.a.y * cs + s.b.y * sn;
        const dz = s.a.z * cs + s.b.z * sn;
        // 月牙:两头尖、中间宽;越靠近刀尖越亮
        const wid = s.w * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, f))), 0.55) * (0.45 + 0.55 * along);
        const al = fade * Math.pow(along, 1.3) * (1 - 0.5 * smooth(0.92, 1, along));
        const ro = s.r;
        const ri = s.r - wid;
        const rc = s.r - wid * 0.22;
        const o = m.vert(cx + dx * ro, cy + dy * ro, cz + dz * ro, u, v, s.color[0], s.color[1], s.color[2], al);
        const inn = m.vert(cx + dx * ri, cy + dy * ri, cz + dz * ri, u, v, s.color[0] * 0.6, s.color[1] * 0.6, s.color[2] * 0.6, 0);
        // 外沿再叠一条窄的白芯
        const c2 = m.vert(cx + dx * rc, cy + dy * rc, cz + dz * rc, u, v, 1, 1, 1, 0);
        const o2 = m.vert(cx + dx * ro, cy + dy * ro, cz + dz * ro, u, v, 1, 1, 1, al * 0.9);
        if (k > 0) {
          // 两面都画(条带朝哪边都看得见)
          m.tri(prevO, o, inn);
          m.tri(prevO, inn, prevI);
          m.tri(prevO, inn, o);
          m.tri(prevO, prevI, inn);
          m.tri(prevC + 1, o2, c2);
          m.tri(prevC + 1, c2, prevC);
          m.tri(prevC + 1, c2, o2);
          m.tri(prevC + 1, prevC, c2);
        }
        prevO = o;
        prevI = inn;
        prevC = c2;
      }
    }
    m.end();
  }

  // ───────────────────────── 弹道 ─────────────────────────
  shot(sx: number, sy: number, ex: number, ey: number, travelMs: number, color: RGB, done: (() => void) | null): void {
    if (!this.world) {
      done?.();
      return;
    }
    const lift = 1.0;
    this.shots.push({ from: this.world.toWorld(sx, sy - 100, new Vec3(), lift), to: this.world.toWorld(ex, ey - 80, new Vec3(), lift * 0.8), age: 0, life: Math.max(0.06, travelMs / 1000), color, done });
    this.stats.shots += 1;
  }

  private stepShots(dt: number): void {
    const fx = this.fx!;
    for (let i = this.shots.length - 1; i >= 0; i -= 1) {
      const s = this.shots[i];
      s.age += dt;
      const t = Math.min(1, s.age / s.life);
      const x = s.from.x + (s.to.x - s.from.x) * t;
      const y = s.from.y + (s.to.y - s.from.y) * t + Math.sin(t * Math.PI) * 0.25;
      const z = s.from.z + (s.to.z - s.from.z) * t;
      if (dt > 0) {
        fx.emit({ x, y, z, life: 0.07, s0: 0.3, s1: 0.2, c0: [1, 1, 1], a: 0.9, cell: FX_CELL.core });
        fx.emit({ x, y, z, life: 0.22, s0: 0.24, s1: 0.04, c0: s.color, a: 0.7, cell: FX_CELL.glow });
        fx.emit({ x, y, z, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2, life: 0.3, s0: 0.04, c0: s.color, a: 0.9, cell: FX_CELL.ember, grav: 0.3 });
      }
      if (t >= 1) {
        this.shots.splice(i, 1);
        try {
          s.done?.();
        } catch (error) {
          console.warn('[f3d] shot arrive', error);
        }
      }
    }
  }

  // ───────────────────────── 命中 ─────────────────────────
  /** by 打中了 monster:火星朝被打飞的方向溅,白闪,脚下一圈环;重击加尘土和更亮的光。 */
  hit(monster: any, by: any, heavy: boolean, leaderHit: boolean): void {
    const fx = this.fx;
    const w = this.world;
    if (!fx || !w) {
      return;
    }
    const hM = Math.max(0.35, (fieldUnitHeight(monster) || 1.1) * 0.5);
    const yaw = rad(w.yawOf(monster.x - by.x, monster.y - by.y));
    const dx = Math.cos(yaw);
    const dz = -Math.sin(yaw);
    this.put(monster.x, monster.y, hM);
    const x = _p.x - dx * 0.15;
    const y = _p.y;
    const z = _p.z - dz * 0.15;
    const k = heavy ? 1.5 : 1;
    fx.emit({ x, y, z, life: 0.1, s0: 0.5 * k, s1: 0.9 * k, c0: [1, 0.96, 0.84], a: 0.95, cell: FX_CELL.core });
    fx.emit({ x, y, z, life: 0.16, s0: 0.6 * k, s1: 0.3, c0: GOLD, a: 0.8, cell: FX_CELL.star, rot: Math.random() * 6 });
    const n = heavy ? 18 : 10;
    for (let i = 0; i < n; i += 1) {
      const sp = 3 + Math.random() * 6 * k;
      const a = (Math.random() - 0.5) * 2.0;
      const vx = dx * Math.cos(a) - dz * Math.sin(a);
      const vz = dz * Math.cos(a) + dx * Math.sin(a);
      fx.emit({ x, y, z, vx: vx * sp, vy: 1.5 + Math.random() * 4, vz: vz * sp, life: 0.25 + Math.random() * 0.3, s0: 0.05, s1: 0.02, c0: [1, 0.86, 0.5], c1: [1, 0.4, 0.1], a: 1, cell: FX_CELL.ember, grav: 1.4, drag: 1.2, stretch: 2.2 });
    }
    fx.decal('atlas', FX_CELL.ring, _p.x, _p.z, 0.2, 0.9 * k, 0.26, GOLD, 0.7, 0.02, 0.06);
    if (heavy) {
      for (let i = 0; i < 5; i += 1) {
        const a = Math.random() * TAU;
        fx.emit({ x: _p.x + Math.cos(a) * 0.3, y: 0.15, z: _p.z + Math.sin(a) * 0.3, vx: Math.cos(a) * 1.2, vy: 0.6, vz: Math.sin(a) * 1.2, life: 0.7, s0: 0.25, s1: 0.8, c0: DUST, a: 0.3, cell: i % 2 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: Math.random() * 6, drag: 2 });
      }
    }
    if (leaderHit) {
      this.flash(monster.x, monster.y, hM + 0.3, [1, 0.82, 0.5], heavy ? 1500 : 800, heavy ? 0.22 : 0.14);
    }
    this.stats.hits += 1;
  }

  // ───────────────────────── 队长的出手 ─────────────────────────
  /** 队长的一次结算(普攻某一段 / 技能):在这一刻出刀光和技能特效。landed = 有没有砍中。 */
  leaderHit(self: any, hit: any): void {
    const fx = this.fx;
    const w = this.world;
    const leader = self.leader;
    if (!fx || !w || !leader) {
      return;
    }
    const target = self.lockTarget && !self.lockTarget.dead ? self.lockTarget : null;
    const near = target && Math.hypot(target.x - leader.x, target.y - leader.y) < 420 ? target : null;
    const yaw = near ? w.yawOf(near.x - leader.x, near.y - leader.y) : leader.facing > 0 ? 0 : 180;
    const x = leader.x;
    const y = leader.y;
    if (hit.skill === undefined) {
      if (hit.ranged) {
        return;
      }
      const combo = hit.combo ?? 1;
      if (combo === 3) {
        this.slash(x, y, 1.0, yaw, 80, 125, -35, 1.5, 0.62, GOLD, 0.3, 0.1);
        this.put(x, y, 0);
        const yr = rad(yaw);
        fx.decal('atlas', FX_CELL.crack, _p.x + Math.cos(yr) * 1.2, _p.z - Math.sin(yr) * 1.2, 0.5, 1.1, 0.6, [1, 0.7, 0.35], 0.7, 0.03, 0.2);
      } else if (combo === 2) {
        this.slash(x, y, 1.05, yaw, -16, -105, 95, 1.35, 0.5, GOLD, 0.24, 0.08);
      } else {
        this.slash(x, y, 0.95, yaw, 14, 105, -95, 1.35, 0.5, GOLD, 0.24, 0.08);
      }
      return;
    }
    this.stats.skills += 1;
    const yr = rad(yaw);
    const fx0 = Math.cos(yr);
    const fz0 = -Math.sin(yr);
    if (hit.dashLine) {
      // 突进斩:沿路线一道光带,终点两道交叉的刀光
      const d = hit.dashLine;
      const a = w.toWorld(d.x0, d.y0, new Vec3(), 0.9);
      const b = w.toWorld(d.x1, d.y1, new Vec3(), 0.9);
      fx.bolt(a, b, 0.2, 0.24, [0.75, 0.9, 1], 0.015, 0);
      fx.bolt(a, b, 0.07, 0.3, [1, 1, 1], 0.01, 0);
      const dyaw = w.yawOf(d.x1 - d.x0, d.y1 - d.y0);
      this.slash(d.x1, d.y1, 1.0, dyaw, 35, 120, -100, 1.6, 0.6, PALE, 0.3, 0.07);
      this.slash(d.x1, d.y1, 1.0, dyaw, -35, -120, 100, 1.6, 0.6, PALE, 0.3, 0.07, 0.05);
      for (let i = 0; i < 16; i += 1) {
        const t = Math.random();
        fx.emit({ x: a.x + (b.x - a.x) * t, y: 0.3 + Math.random() * 1.2, z: a.z + (b.z - a.z) * t, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.4, s0: 0.05, c0: PALE, a: 1, cell: FX_CELL.ember, grav: 0.6, stretch: 1.5 });
      }
      this.flash(d.x1, d.y1, 1.2, PALE, 2000, 0.26, 7);
      return;
    }
    if (hit.around) {
      // 旋风斩:三圈高低错开的环形刀光,贴地的环往外扩,一圈扬尘
      for (let i = 0; i < 3; i += 1) {
        this.slash(x, y, 0.45 + i * 0.42, yaw + i * 110, 6 - i * 6, 0, i % 2 ? -400 : 400, 1.55 + i * 0.1, 0.5, i === 1 ? [1, 1, 0.9] : GOLD, 0.42, 0.24, i * 0.05, leader);
      }
      this.put(x, y, 0);
      fx.decal('atlas', FX_CELL.shock, _p.x, _p.z, 0.4, 2.3, 0.45, GOLD, 0.8, 0.03, 0.12);
      fx.decal('atlas', FX_CELL.ring, _p.x, _p.z, 0.3, 1.8, 0.6, [1, 0.6, 0.3], 0.6, 0.03, 0.2);
      for (let i = 0; i < 18; i += 1) {
        const a = (i / 18) * TAU + Math.random() * 0.3;
        fx.emit({ x: _p.x + Math.cos(a) * 0.9, y: 0.12, z: _p.z + Math.sin(a) * 0.9, vx: Math.cos(a) * 2.6, vy: 0.5 + Math.random() * 0.5, vz: Math.sin(a) * 2.6, life: 0.8, s0: 0.3, s1: 1.0, c0: DUST, a: 0.28, cell: i % 2 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: Math.random() * 6, drag: 2.2 });
        fx.emit({ x: _p.x + Math.cos(a) * 1.2, y: 0.3 + Math.random(), z: _p.z + Math.sin(a) * 1.2, vx: -Math.sin(a) * 5, vy: 1 + Math.random() * 2, vz: Math.cos(a) * 5, life: 0.4, s0: 0.05, c0: GOLD, a: 1, cell: FX_CELL.ember, grav: 0.8, stretch: 2 });
      }
      this.flash(x, y, 1.3, GOLD, 2400, 0.32, 8);
      return;
    }
    // 重斩:一道大竖劈,身前地面裂开,三道往前推的冲击环,尘土
    this.slash(x, y, 1.05, yaw, 84, 140, -40, 1.95, 0.8, [1, 0.9, 0.62], 0.36, 0.1);
    this.slash(x, y, 1.05, yaw, 70, 130, -30, 1.7, 0.5, [1, 1, 1], 0.3, 0.1, 0.02);
    this.put(x, y, 0);
    const bx = _p.x;
    const bz = _p.z;
    fx.decal('atlas', FX_CELL.crack, bx + fx0 * 1.5, bz + fz0 * 1.5, 0.6, 1.7, 0.9, [1, 0.62, 0.28], 0.9, 0.03, 0.35);
    fx.decal('scorch', 0, bx + fx0 * 1.5, bz + fz0 * 1.5, 0.8, 1.5, 2.4, [0.1, 0.08, 0.06], 0.5, 0.05, 1.2);
    for (let i = 0; i < 3; i += 1) {
      fx.decal('atlas', FX_CELL.shock, bx + fx0 * (1.0 + i * 0.7), bz + fz0 * (1.0 + i * 0.7), 0.2, 1.1 - i * 0.2, 0.36 + i * 0.06, GOLD, 0.7, 0.02 + i * 0.05, 0.1 + i * 0.05);
    }
    for (let i = 0; i < 12; i += 1) {
      const t = 0.6 + Math.random() * 1.6;
      const side = (Math.random() - 0.5) * 0.9;
      fx.emit({ x: bx + fx0 * t - fz0 * side, y: 0.12, z: bz + fz0 * t + fx0 * side, vx: fx0 * (1 + Math.random() * 2), vy: 0.8 + Math.random(), vz: fz0 * (1 + Math.random() * 2), life: 0.8, s0: 0.3, s1: 1.1, c0: DUST, a: 0.3, cell: i % 2 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: Math.random() * 6, drag: 2 });
    }
    for (let i = 0; i < 20; i += 1) {
      const a = (Math.random() - 0.5) * 1.2;
      const sp = 4 + Math.random() * 7;
      fx.emit({ x: bx + fx0 * 1.2, y: 0.4 + Math.random() * 0.6, z: bz + fz0 * 1.2, vx: (fx0 * Math.cos(a) - fz0 * Math.sin(a)) * sp, vy: 2 + Math.random() * 5, vz: (fz0 * Math.cos(a) + fx0 * Math.sin(a)) * sp, life: 0.3 + Math.random() * 0.4, s0: 0.06, s1: 0.02, c0: [1, 0.9, 0.6], c1: [1, 0.45, 0.1], a: 1, cell: FX_CELL.ember, grav: 1.5, drag: 1, stretch: 2.4 });
    }
    this.flash(x + Math.cos(yr) * 150, y, 1.0, [1, 0.8, 0.5], 2800, 0.34, 8);
  }

  /** 技能起手(按下技能的那一刻):蓄力的光团 / 起旋的风。 */
  cast(self: any, index: number): void {
    const fx = this.fx;
    const leader = self.leader;
    if (!fx || !leader) {
      return;
    }
    this.put(leader.x, leader.y, 1.0);
    if (index === 0) {
      fx.emit({ x: _p.x, y: _p.y, z: _p.z, life: 0.4, s0: 0.2, s1: 1.1, c0: GOLD, a: 0.6, cell: FX_CELL.glow, fadeIn: 0.3 });
      for (let i = 0; i < 10; i += 1) {
        const a = Math.random() * TAU;
        fx.emit({ x: _p.x + Math.cos(a) * 1.3, y: 0.2 + Math.random() * 1.6, z: _p.z + Math.sin(a) * 1.3, vx: -Math.cos(a) * 3, vy: 0.3, vz: -Math.sin(a) * 3, life: 0.36, s0: 0.05, c0: GOLD, a: 1, cell: FX_CELL.ember, stretch: 2 });
      }
      this.flash(leader.x, leader.y, 1.2, GOLD, 700, 0.4, 5);
    } else if (index === 2) {
      for (let i = 0; i < 2; i += 1) {
        this.slash(leader.x, leader.y, 0.6 + i * 0.5, i * 180, 4, 0, 330, 1.0 + i * 0.15, 0.24, [1, 0.92, 0.7], 0.44, 0.32, i * 0.08, leader);
      }
    }
  }

  /** 怪倒下:一团尘土 + 几点往上飘的暗光。 */
  death(monster: any): void {
    const fx = this.fx;
    if (!fx) {
      return;
    }
    const h = fieldUnitHeight(monster) || 1;
    this.put(monster.x, monster.y, 0.1);
    for (let i = 0; i < 8; i += 1) {
      const a = Math.random() * TAU;
      fx.emit({ x: _p.x + Math.cos(a) * 0.3 * h, y: 0.1 + Math.random() * 0.3, z: _p.z + Math.sin(a) * 0.3 * h, vx: Math.cos(a) * 0.9, vy: 0.5 + Math.random() * 0.6, vz: Math.sin(a) * 0.9, life: 0.9 + Math.random() * 0.4, s0: 0.3 * h, s1: 0.9 * h, c0: DUST, a: 0.34, cell: i % 2 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: Math.random() * 6, drag: 1.6 });
    }
    for (let i = 0; i < 6; i += 1) {
      fx.emit({ x: _p.x + (Math.random() - 0.5) * 0.6, y: 0.3 + Math.random() * 0.5, z: _p.z + (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 0.8, life: 1.1, s0: 0.05, s1: 0.02, c0: [0.7, 0.6, 1], a: 0.8, cell: FX_CELL.wisp, fadeIn: 0.2 });
    }
    this.stats.deaths += 1;
  }

  stop(): void {
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.fx = null;
    this.arc = null;
    this.gate = null;
    this.slashes.length = 0;
    this.flashes.length = 0;
    this.free.length = 0;
    this.shots.length = 0;
    this.self = null;
    this.world = null;
  }

  set(patch: Partial<TownFx3D['cfg']>): void {
    Object.assign(this.cfg, patch);
    this.tone();
  }

  info(): unknown {
    return { fx: { ...this.stats, live: this.fx ? { ...this.fx.stats } : null, arcs: this.slashes.length, lights: this.flashes.length, cfg: { ...this.cfg } } };
  }
}

const fx3d = new TownFx3D();

function install(): void {
  const wrap = (proto: any, name: string, make: (orig: (...args: any[]) => any) => (this: any, ...args: any[]) => any): void => {
    const orig = proto[name];
    if (typeof orig !== 'function' || orig.__f3dfx) {
      return;
    }
    const wrapped = make(orig);
    (wrapped as any).__f3dfx = true;
    proto[name] = wrapped;
  };
  const town = LobbyTownRenderer.prototype as any;
  const is3d = (self: any, actor: any): boolean => fx3d.active(self) && fieldUnitHeight(actor) > 0;
  // 队长的一次结算:里面要出的 2D 特效全拦下,换成 3D 的
  wrap(town, 'resolveLeaderHit', (orig) => function (this: any, ...args: any[]): any {
    if (!is3d(this, this.leader)) {
      return orig.apply(this, args);
    }
    quiet += 1;
    try {
      return orig.apply(this, args);
    } finally {
      quiet -= 1;
      try {
        fx3d.leaderHit(this, args[0]);
      } catch (error) {
        console.warn('[f3d] leaderHit', error);
      }
    }
  });
  // 命中反馈:出手的人是 3D 的 → 命中特效出 3D 的
  wrap(town, 'impactMonster', (orig) => function (this: any, ...args: any[]): any {
    const by = args[1];
    if (!is3d(this, by) || args[0]?.dead) {
      return orig.apply(this, args);
    }
    quiet += 1;
    try {
      return orig.apply(this, args);
    } finally {
      quiet -= 1;
      try {
        fx3d.hit(args[0], by, !!args[2], !!args[3]);
      } catch (error) {
        console.warn('[f3d] hit', error);
      }
    }
  });
  // 骨骼自带的落点特效(另起一个 2D 骨骼播):3D 的出手者不要,算作「已经出过特效」
  wrap(town, 'playOwnKz', (orig) => function (this: any, ...args: any[]): any {
    return is3d(this, args[0]) ? true : orig.apply(this, args);
  });
  wrap(town, 'leaderSkill', (orig) => function (this: any, ...args: any[]): any {
    const index = Number(args[0]) || 0;
    const before = this.skillReadyAt?.[index];
    const result = orig.apply(this, args);
    if (is3d(this, this.leader) && this.skillReadyAt?.[index] !== before) {
      try {
        fx3d.cast(this, index);
      } catch (error) {
        console.warn('[f3d] cast', error);
      }
    }
    return result;
  });
  wrap(town, 'killMonster', (orig) => function (this: any, ...args: any[]): any {
    const result = orig.apply(this, args);
    if (is3d(this, args[0])) {
      try {
        fx3d.death(args[0]);
      } catch (error) {
        console.warn('[f3d] death', error);
      }
    }
    return result;
  });
  // 2D 战斗特效的出口:被拦下的时候不建 2D 节点
  const cfx = TownCombatFx.prototype as any;
  wrap(cfx, 'play', (orig) => function (this: any, ...args: any[]): any {
    return quiet > 0 && args[0] === fx3d.rootOf() ? null : orig.apply(this, args);
  });
  wrap(cfx, 'strikeSprite', (orig) => function (this: any, ...args: any[]): any {
    return quiet > 0 && args[0] === fx3d.rootOf() ? undefined : orig.apply(this, args);
  });
  wrap(cfx, 'swing', (orig) => function (this: any, ...args: any[]): any {
    if (quiet > 0 && args[0] === fx3d.rootOf()) {
      return undefined;      // 挥空的刀光由 leaderHit 统一出(砍没砍中都有一道)
    }
    return orig.apply(this, args);
  });
  wrap(cfx, 'projectile', (orig) => function (this: any, ...args: any[]): any {
    if (quiet > 0 && args[0] === fx3d.rootOf()) {
      fx3d.shot(args[2], args[3], args[4], args[5], Number(args[6]) || 200, PALE, typeof args[8] === 'function' ? args[8] : null);
      return undefined;
    }
    return orig.apply(this, args);
  });
}

if (!EDITOR && sys.isBrowser) {
  install();
  addFieldExtra(fx3d);
  (globalThis as any).__f3dfx = fx3d;
}
