import { Color, Material, Mesh, MeshRenderer, Node, PointLight, primitives, sys, utils, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { addFieldExtra } from './TownUnits3D';
import type { FieldExtra } from './TownUnits3D';
import { FIELD_LAYER, LOOKS, TownWorld3D } from './TownWorld3D';

/**
 * 野外真 3D 场景 · 营地的灯(实验,2026-11-17;只在「黄昏」这套灯光方案 ?flook=dusk 下有)。
 *
 * 用户看完后期那一轮说和参考的那个 FPS 差太多。那个 FPS 的画面有一条是「暗场景 + 十来盏带颜色的灯」:东西是被近处的灯一块块照亮的,
 * 有明有暗、有冷有暖;我们白天的野外是一个太阳照全场,再怎么加后期也是平的。黄昏方案把太阳压低压暗,这里给营地补上灯:
 * 旗杆上挂一盏、营帐前立一根火把、木箱上搁一盏、篝火一团火光 —— 每盏一个暖色的点光(只照得到几米),灯芯是发光的(会泛光)。
 * 灯的位置跟着地图数据里已有的营地摆件走,不改地图数据;只点离队长最近的几盏(每盏点光都要把它照得到的东西多画一遍)。
 */

interface Spot {
  /** 地图坐标、灯芯离地多高(米)。 */
  x: number;
  y: number;
  h: number;
  kind: 'hang' | 'torch' | 'box' | 'fire';
  flux: number;
  range: number;
  phase: number;
  node: Node | null;
  light: PointLight | null;
}

/** 同时最多点几盏、离队长多远以内的才点(米)。 */
const MAX_ON = 8;
const REACH = 34;
const WARM = new Color(255, 168, 92, 255);

const _p = new Vec3();

class TownLamps3D implements FieldExtra {
  private self: any = null;
  private root: Node | null = null;
  private spots: Spot[] = [];
  private time = 0;
  private tick = 0;
  private mats: { wood: Material; iron: Material; glow: Material } | null = null;
  private meshes = new Map<string, Mesh>();
  private stats = { spots: 0, on: 0 };

  sync(self: any, world: TownWorld3D, dt: number): void {
    const k = LOOKS[world.lookName]?.lamps ?? 0;
    if (k <= 0) {
      if (this.root) {
        this.stop();
      }
      return;
    }
    if (this.self !== self || !this.root || !this.root.isValid) {
      this.stop();
      this.self = self;
      this.root = new Node('TownLamps3D');
      this.root.layer = FIELD_LAYER;
      world.root.addChild(this.root);
      this.plan(self, world);
    }
    this.time += dt;
    this.tick += 1;
    if (this.tick % 15 === 1) {
      this.pick(self, world);
    }
    const hdr = world.post.isOn();
    const t = this.time;
    for (const s of this.spots) {
      const L = s.light;
      if (!L || !L.enabled) {
        continue;
      }
      // 火光的抖动:两个频率叠起来;篝火抖得厉害,灯罩里的小一些
      const amp = s.kind === 'fire' ? 0.2 : s.kind === 'torch' ? 0.13 : 0.06;
      const f = 1 + amp * (Math.sin(t * 9.1 + s.phase) * 0.6 + Math.sin(t * 23.7 + s.phase * 2.3) * 0.4);
      L.luminousFlux = s.flux * k * (hdr ? 1 : 1.3) * f;
    }
  }

  private mesh(key: string, make: () => Mesh): Mesh {
    let m = this.meshes.get(key);
    if (!m) {
      m = make();
      this.meshes.set(key, m);
    }
    return m;
  }

  private part(parent: Node, mesh: Mesh, mat: Material, x: number, y: number, z: number, cast = true): Node {
    const n = new Node('P');
    n.layer = FIELD_LAYER;
    parent.addChild(n);
    n.setPosition(x, y, z);
    const mr = n.addComponent(MeshRenderer);
    mr.mesh = mesh;
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = cast ? MeshRenderer.ShadowCastingMode.ON : MeshRenderer.ShadowCastingMode.OFF;
    mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
    return n;
  }

  private ensureMats(): NonNullable<TownLamps3D['mats']> {
    if (!this.mats) {
      const make = (r: number, g: number, b: number, rough: number): Material => {
        const m = new Material();
        m.initialize({ effectName: 'builtin-standard' });
        m.setProperty('mainColor', new Color(r, g, b, 255));
        m.setProperty('roughness', rough);
        m.setProperty('metallic', 0);
        return m;
      };
      const glow = make(40, 24, 12, 0.6);
      // 灯芯:自发光给到 5 倍(开了后期会泛光;没开后期就是一块亮的暖色)
      glow.setProperty('emissive', new Color(255, 170, 84, 255));
      glow.setProperty('emissiveScale', new Vec3(5, 5, 5));
      this.mats = { wood: make(92, 70, 50, 0.85), iron: make(46, 44, 46, 0.55), glow };
    }
    return this.mats;
  }

  /** 一盏灯的样子(原点 = 灯芯):挂灯 / 箱上的灯 = 铁框 + 发光的芯;火把 = 一根木杆顶着火盆;篝火只有光(火的图是地图上原来的)。 */
  private fixture(s: Spot): Node {
    const M = this.ensureMats();
    const n = new Node(`Lamp_${s.kind}`);
    n.layer = FIELD_LAYER;
    this.root!.addChild(n);
    const box = (w: number, h: number, l: number): Mesh => this.mesh(`b:${w}:${h}:${l}`, () => utils.MeshUtils.createMesh(primitives.box({ width: w, height: h, length: l })));
    const cyl = (rt: number, rb: number, h: number): Mesh => this.mesh(`c:${rt}:${rb}:${h}`, () => utils.MeshUtils.createMesh(primitives.cylinder(rt, rb, h, { radialSegments: 8 })));
    if (s.kind === 'hang' || s.kind === 'box') {
      this.part(n, box(0.11, 0.15, 0.11), M.glow, 0, 0, 0, false);
      this.part(n, box(0.16, 0.025, 0.16), M.iron, 0, 0.09, 0);
      this.part(n, box(0.16, 0.025, 0.16), M.iron, 0, -0.09, 0);
      this.part(n, cyl(0.0, 0.07, 0.07), M.iron, 0, 0.135, 0);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        this.part(n, box(0.014, 0.17, 0.014), M.iron, dx * 0.066, 0, dz * 0.066, false);
      }
      if (s.kind === 'hang') {
        // 挂钩:从旗杆横出来的一小截铁臂 + 提环
        this.part(n, box(0.3, 0.02, 0.02), M.iron, -0.14, 0.24, 0);
        this.part(n, box(0.012, 0.08, 0.012), M.iron, 0, 0.2, 0, false);
      }
    } else if (s.kind === 'torch') {
      this.part(n, cyl(0.035, 0.045, s.h), M.wood, 0, -s.h / 2 - 0.05, 0);
      this.part(n, cyl(0.13, 0.07, 0.12), M.iron, 0, -0.07, 0);
      this.part(n, cyl(0.03, 0.1, 0.2), M.glow, 0, 0.06, 0, false);
    }
    return n;
  }

  /** 按地图数据里的营地摆件定下灯的位置(只算数据)。 */
  private plan(self: any, world: TownWorld3D): void {
    const U = world.cfg.unitsPerM;
    const dz = world.upUnits();       // 地图纵向上多少单位 = 3D 里纵深 1 米(俯角 45° 时和竖着 1 米一样)
    this.spots = [];
    const add = (x: number, y: number, h: number, kind: Spot['kind'], flux: number, range: number): void => {
      this.spots.push({ x, y, h, kind, flux, range, phase: (x * 0.013 + y * 0.007) % 6.28, node: null, light: null });
    };
    for (const p of (self.def?.props ?? []) as Array<{ asset: string; x: number; y: number; flat?: boolean }>) {
      if (p.flat) {
        continue;
      }
      if (/camp_banner/.test(p.asset)) {
        add(p.x + 0.32 * U, p.y, 2.1, 'hang', 520, 7.5);
      } else if (/camp_tent/.test(p.asset)) {
        add(p.x - 1.7 * U, p.y - 1.3 * dz, 1.5, 'torch', 760, 8.5);
      } else if (/camp_crates/.test(p.asset)) {
        add(p.x + 0.1 * U, p.y - 0.1 * dz, 1.06, 'box', 420, 6.5);
      } else if (/campfire|brazier/.test(p.asset)) {
        add(p.x, p.y, 0.55, 'fire', 1100, 9.5);
      }
    }
    this.stats.spots = this.spots.length;
  }

  /** 离队长最近的几盏点上(建出来),别的熄掉。 */
  private pick(self: any, world: TownWorld3D): void {
    const lx = self.leader?.x ?? 0;
    const ly = self.leader?.y ?? 0;
    const near = this.spots.map((s) => ({ s, d: world.metres(s.x, s.y, lx, ly) })).filter((e) => e.d < REACH).sort((a, b) => a.d - b.d).slice(0, MAX_ON);
    const on = new Set(near.map((e) => e.s));
    for (const s of this.spots) {
      const want = on.has(s);
      if (want && !s.node) {
        s.node = this.fixture(s);
        world.toWorld(s.x, s.y, _p, s.h);
        s.node.setPosition(_p);
        const ln = new Node('Light');
        ln.layer = FIELD_LAYER;
        s.node.addChild(ln);
        ln.setPosition(0, s.kind === 'torch' ? 0.2 : 0, s.kind === 'hang' || s.kind === 'box' ? 0.12 : 0);
        const L = ln.addComponent(PointLight);
        L.color = WARM;
        L.range = s.range;
        L.luminousFlux = 0;
        s.light = L;
      }
      if (s.node && s.node.isValid && s.node.active !== want) {
        s.node.active = want;
      }
      if (s.light) {
        s.light.enabled = want;
      }
    }
    this.stats.on = on.size;
  }

  stop(): void {
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.self = null;
    this.spots = [];
    this.stats.on = 0;
  }

  info(): unknown {
    return { lamps: { ...this.stats } };
  }
}

const lamps = new TownLamps3D();
if (!EDITOR && sys.isBrowser) {
  addFieldExtra(lamps);
  (globalThis as any).__f3dlamps = lamps;
}
