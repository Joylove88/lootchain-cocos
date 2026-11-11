import { Color, Mat4, Material, Mesh, MeshRenderer, Node, Quat, Vec3 } from 'cc';
import { material, tex } from './G3DKit';
import { Tint } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import { paintCloth, paintLeather, paintMetal, paintTalisman } from './G3DSkins';
import { hash2, paintWood } from './G3DTextures';

/**
 * 守卫战全 3D 样板 · 程序生成的角色:骨架(一根骨头一个节点,零件是挂在骨头上的刚体网格)、
 * 术士(布衣、露脸、持杖)和重甲骑士两套造型、挂件的摆动(胡须 / 袖子 / 披风 / 符纸按重力甩)。
 *
 * 造型是按角色定位重新设计的,不照搬任何现有骨骼素材。
 * 角色本地坐标:面朝 +z,头顶 +y,左手边 +x;四肢自然下垂时沿 -y。
 * 只有刚体零件、没有蒙皮:关节处靠布料 / 甲片盖住。真要铺开量产,得换成蒙皮网格 + 显卡蒙皮(这里是样板)。
 */

export type Pose = Record<string, [number, number, number]>;

// 顶点色按 sRGB 给(内置标准材质会自己转到线性)
const rgb = (r: number, g: number, b: number): Tint => [r / 255, g / 255, b / 255];
const mul = (t: Tint, k: number): Tint => [t[0] * k, t[1] * k, t[2] * k];
const mix = (a: Tint, b: Tint, t: number): Tint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const DEN = { cloth: 8, metal: 4.6, leather: 6.5, wood: 3, skin: 1, dark: 1, paper: 1, hair: 9 };
export type MatKey = keyof typeof DEN | 'glow';

let MATS: Record<string, Material> | null = null;

/** 角色用的几种材质(全体角色共用;颜色靠顶点色)。 */
export function actorMaterials(): Record<string, Material> {
  if (MATS) {
    return MATS;
  }
  const cloth = paintCloth(256, 56);
  const metal = paintMetal(256);
  const leather = paintLeather(256);
  const wood = paintWood(256);
  const std = (defs: Record<string, boolean>, rough: number, metallic: number): Material => {
    const m = material('builtin-standard', defs);
    m.setProperty('roughness', rough);
    m.setProperty('metallic', metallic);
    return m;
  };
  const m: Record<string, Material> = {};
  m.cloth = std({ USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true }, 0.92, 0);
  m.cloth.setProperty('mainTexture', tex(cloth.albedo, true));
  m.cloth.setProperty('normalMap', tex(cloth.normal, true));
  m.cloth.setProperty('normalStrength', 0.5);
  m.hair = std({ USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true }, 0.7, 0);
  m.hair.setProperty('mainTexture', tex(cloth.albedo, true));
  m.hair.setProperty('normalMap', tex(cloth.normal, true));
  m.hair.setProperty('normalStrength', 0.8);
  m.metal = std({ USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: true }, 0.95, 1);
  m.metal.setProperty('mainTexture', tex(metal.albedo, true));
  m.metal.setProperty('normalMap', tex(metal.normal, true));
  m.metal.setProperty('pbrMap', tex(metal.orm!, true));
  m.metal.setProperty('occlusion', 1);
  m.leather = std({ USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true }, 0.62, 0);
  m.leather.setProperty('mainTexture', tex(leather.albedo, true));
  m.leather.setProperty('normalMap', tex(leather.normal, true));
  m.wood = std({ USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true }, 0.7, 0);
  m.wood.setProperty('mainTexture', tex(wood.albedo, true));
  m.wood.setProperty('normalMap', tex(wood.normal, true));
  m.skin = std({ USE_VERTEX_COLOR: true }, 0.58, 0);
  m.dark = std({}, 1, 0);
  m.dark.setProperty('mainColor', new Color(7, 7, 9, 255));
  m.paper = std({ USE_ALBEDO_MAP: true }, 0.85, 0);
  m.paper.setProperty('mainTexture', tex(paintTalisman(), false));
  // 法杖顶上的晶石:不受光、自己亮(亮度由样板按施法进度调)
  m.glow = material('builtin-unlit', {});
  m.glow.setProperty('mainColor', new Color(170, 215, 255, 255));
  m.glow.setProperty('colorScale', new Vec3(1.2, 1.2, 1.2));
  MATS = m;
  return m;
}

interface PendDef { len: number; stiff: number; damp: number; gravity: number }
interface BoneDef { name: string; parent: string | null; pos: [number, number, number]; pend?: PendDef; rot?: [number, number, number] }

/** 一套造型:骨头的定义 + 每根骨头上按材质攒的网格。建一次,出多少个角色都共用这些网格。 */
export class ActorTemplate {
  readonly bones: BoneDef[] = [];
  private readonly sculpts = new Map<string, Sculpt>();
  private built: Array<{ bone: string; mat: string; meshes: Mesh[] }> | null = null;
  triangles = 0;

  bone(name: string, parent: string | null, x: number, y: number, z: number, pend?: PendDef, rot?: [number, number, number]): void {
    this.bones.push({ name, parent, pos: [x, y, z], pend, rot });
  }

  /** 往某根骨头上、某种材质里加形体(骨头本地坐标)。 */
  s(bone: string, mat: MatKey): Sculpt {
    const key = `${bone}|${mat}`;
    let sc = this.sculpts.get(key);
    if (!sc) {
      sc = new Sculpt();
      this.sculpts.set(key, sc);
    }
    return sc;
  }

  private finish(): Array<{ bone: string; mat: string; meshes: Mesh[] }> {
    if (!this.built) {
      this.built = [];
      this.sculpts.forEach((sc, key) => {
        const [bone, mat] = key.split('|');
        const meshes = sc.build();
        this.triangles += sc.triangles;
        this.built!.push({ bone, mat, meshes });
      });
    }
    return this.built;
  }

  spawn(parent: Node, name: string, scale = 1): Actor {
    const mats = actorMaterials();
    const root = new Node(name);
    parent.addChild(root);
    root.setScale(scale, scale, scale);
    const joints: Record<string, Node> = {};
    const pends: Pend[] = [];
    for (const b of this.bones) {
      const n = new Node(b.name);
      (b.parent ? joints[b.parent] : root).addChild(n);
      n.setPosition(b.pos[0], b.pos[1], b.pos[2]);
      if (b.rot) {
        n.setRotationFromEuler(b.rot[0], b.rot[1], b.rot[2]);
      }
      joints[b.name] = n;
      if (b.pend) {
        pends.push({ node: n, parent: n.parent!, len: b.pend.len * scale, stiff: b.pend.stiff, damp: b.pend.damp, gravity: b.pend.gravity, tip: new Vec3(), prev: new Vec3(), inited: false });
      }
    }
    for (const part of this.finish()) {
      part.meshes.forEach((mesh, i) => {
        const n = new Node(`${part.bone}_${part.mat}_${i}`);
        joints[part.bone].addChild(n);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setSharedMaterial(mats[part.mat], 0);
        mr.shadowCastingMode = part.mat === 'glow' ? MeshRenderer.ShadowCastingMode.OFF : MeshRenderer.ShadowCastingMode.ON;
        mr.receiveShadow = part.mat === 'glow' ? MeshRenderer.ShadowReceivingMode.OFF : MeshRenderer.ShadowReceivingMode.ON;
      });
    }
    return new Actor(root, joints, pends, scale);
  }
}

interface Pend { node: Node; parent: Node; len: number; stiff: number; damp: number; gravity: number; tip: Vec3; prev: Vec3; inited: boolean }

const _q = new Quat();
const _q2 = new Quat();
const _d = new Vec3();
const _r = new Vec3();
const _v = new Vec3();
const DOWN = new Vec3(0, -1, 0);

export class Actor {
  /** 这一帧想摆成的姿势(欧拉角,度);没写到的关节回到 0。 */
  target: Pose = {};
  /** 实际的姿势:每帧朝 target 靠(换动作时自然过渡,不会跳)。 */
  private readonly cur: Pose = {};
  /** 朝目标靠的速度(越大越脆)。 */
  snap = 14;
  /** 指定了世界朝向的关节(法杖:手只管拿着,朝向单独给)。 */
  readonly aim: Record<string, Quat> = {};
  /** 整个人离地的高度(走路时的起伏 / 倒地时的下沉)。 */
  lift = 0;

  constructor(readonly root: Node, readonly joints: Record<string, Node>, private readonly pends: Pend[], readonly scale: number) {}

  set(joint: string, x: number, y: number, z: number): void {
    this.target[joint] = [x, y, z];
  }

  /** 把这一帧的姿势落到骨头上,再让挂件按重力甩一下。 */
  update(dt: number): void {
    const k = 1 - Math.exp(-dt * this.snap);
    for (const name in this.joints) {
      const t = this.target[name];
      let c = this.cur[name];
      if (!t && !c) {
        continue;
      }
      if (!c) {
        c = [0, 0, 0];
        this.cur[name] = c;
      }
      const tx = t ? t[0] : 0;
      const ty = t ? t[1] : 0;
      const tz = t ? t[2] : 0;
      c[0] += (tx - c[0]) * k;
      c[1] += (ty - c[1]) * k;
      c[2] += (tz - c[2]) * k;
      this.joints[name].setRotationFromEuler(c[0], c[1], c[2]);
    }
    this.target = {};
    for (const name in this.aim) {
      const n = this.joints[name];
      if (n) {
        n.setWorldRotation(this.aim[name]);
      }
    }
    const step = Math.min(dt, 0.034);
    for (const p of this.pends) {
      const anchor = p.node.worldPosition;
      const pr = p.parent.worldRotation;
      Vec3.transformQuat(_r, DOWN, pr);           // 没有重力时它想待的方向(跟着父骨头)
      if (!p.inited) {
        p.tip.set(anchor.x + _r.x * p.len, anchor.y + _r.y * p.len, anchor.z + _r.z * p.len);
        p.prev.set(p.tip);
        p.inited = true;
      }
      _v.set((p.tip.x - p.prev.x) * p.damp, (p.tip.y - p.prev.y) * p.damp, (p.tip.z - p.prev.z) * p.damp);
      p.prev.set(p.tip);
      p.tip.set(p.tip.x + _v.x, p.tip.y + _v.y - 9.8 * p.gravity * step * step, p.tip.z + _v.z);
      const pull = 1 - Math.exp(-p.stiff * step);
      p.tip.x += (anchor.x + _r.x * p.len - p.tip.x) * pull;
      p.tip.y += (anchor.y + _r.y * p.len - p.tip.y) * pull;
      p.tip.z += (anchor.z + _r.z * p.len - p.tip.z) * pull;
      _d.set(p.tip.x - anchor.x, p.tip.y - anchor.y, p.tip.z - anchor.z);
      const l = _d.length();
      if (l > 1e-6) {
        _d.multiplyScalar(1 / l);
      } else {
        _d.set(_r);
      }
      p.tip.set(anchor.x + _d.x * p.len, anchor.y + _d.y * p.len, anchor.z + _d.z * p.len);
      Quat.rotationTo(_q, _r, _d);
      Quat.multiply(_q2, _q, pr);
      p.node.setWorldRotation(_q2);
    }
  }

  /** 瞬移之后调一下:挂件直接落到新位置,不拖一条长尾巴。 */
  settle(): void {
    for (const p of this.pends) {
      p.inited = false;
    }
  }
}

// ───────────────────────── 小工具 ─────────────────────────
const TAU = Math.PI * 2;
const angDist = (a: number, b: number): number => {
  let d = (a - b) % TAU;
  if (d > Math.PI) {
    d -= TAU;
  }
  if (d < -Math.PI) {
    d += TAU;
  }
  return Math.abs(d);
};
const FRONT = Math.PI / 2;   // 旋转体里「正前方 (+z)」对应的角度

/** 一条垂下来的布带 / 纸条:从挂点往下 len 长,宽 w,带一点弯。 */
function strip(sc: Sculpt, w: number, len: number, tint: Tint, den: number, curve = 0.03, uv01 = false): void {
  sc.surf(2, 5, (u, v, out) => {
    const t = 1 - v;   // v = 1 是挂点
    out.set((u - 0.5) * w * (1 - 0.15 * t), -len * t, curve * Math.sin(t * 2.4) + (u - 0.5) * (u - 0.5) * 0.06);
  }, { tint, den, twoSided: true, uv01 });
}

// ───────────────────────── 术士(布衣、露脸、持杖)─────────────────────────
const C_OCHRE = rgb(146, 108, 56);
const C_OCHRE_L = rgb(160, 124, 70);
const C_INDIGO = rgb(44, 50, 66);
const C_SASH = rgb(104, 40, 32);
const C_TRIM = rgb(50, 36, 28);
const C_SKIN = rgb(192, 148, 118);
const C_HAIR = rgb(186, 186, 180);
const C_WOODT = rgb(96, 70, 48);
const C_BRONZE = rgb(160, 122, 68);
const C_BOOT = rgb(48, 38, 30);

export function buildSorcerer(): ActorTemplate {
  const T = new ActorTemplate();
  const pend = (len: number, stiff: number, damp = 0.94, gravity = 1): PendDef => ({ len, stiff, damp, gravity });
  T.bone('hips', null, 0, 0.96, 0);
  T.bone('chest', 'hips', 0, 0.2, 0);
  T.bone('head', 'chest', 0, 0.36, 0.01);
  T.bone('armL', 'chest', 0.19, 0.22, 0);
  T.bone('foreL', 'armL', 0, -0.27, 0);
  T.bone('handL', 'foreL', 0, -0.25, 0);
  T.bone('armR', 'chest', -0.19, 0.22, 0);
  T.bone('foreR', 'armR', 0, -0.27, 0);
  T.bone('handR', 'foreR', 0, -0.25, 0);
  T.bone('staff', 'handR', 0, -0.05, 0.035);
  T.bone('sleeveL', 'foreL', 0, -0.2, -0.02, pend(0.27, 5));
  T.bone('sleeveR', 'foreR', 0, -0.2, -0.02, pend(0.27, 5));
  T.bone('beard', 'head', 0, 0.0, 0.066, pend(0.3, 22, 0.9));
  T.bone('wrapTail', 'head', 0, 0.12, -0.105, pend(0.3, 7));
  T.bone('sashA', 'hips', 0.06, -0.01, 0.168, pend(0.46, 6));
  T.bone('sashB', 'hips', 0.1, -0.01, 0.15, pend(0.36, 6));
  T.bone('gourd', 'hips', -0.205, -0.03, 0.06, pend(0.15, 9, 0.92));
  T.bone('tal1', 'hips', 0.2, -0.03, 0.07, pend(0.19, 5));
  T.bone('tal2', 'hips', 0.215, -0.03, 0.02, pend(0.19, 5));
  T.bone('tal3', 'hips', 0.2, -0.03, -0.035, pend(0.19, 5));
  T.bone('tassel', 'staff', 0, 1.0, 0.035, pend(0.24, 5));
  T.bone('staffTalA', 'staff', 0.075, 1.07, 0, pend(0.2, 5));
  T.bone('staffTalB', 'staff', -0.075, 1.07, 0, pend(0.2, 5));
  T.bone('footL', 'hips', 0.09, -0.9, 0.02);
  T.bone('footR', 'hips', -0.09, -0.9, 0.02);

  const dirt = (base: Tint, lo: number): ((u: number, v: number) => Tint) => (_u, v) => mul(base, lo + (1 - lo) * Math.min(1, v * 1.4));
  // 外褂:前襟两条边和下摆一圈镶深色的边
  const coatTint = (base: Tint, lo: number, hem: boolean): ((u: number, v: number) => Tint) => (u, v) => (u < 0.06 || u > 0.94 || (hem && v < 0.05) ? C_TRIM : mul(base, lo + (1 - lo) * Math.min(1, v * 1.4)));

  // ── 下身:里袍的裙摆(整圈)+ 外褂的下摆(前面敞开)+ 腰带 ──
  T.s('hips', 'cloth').lathe([[0.36, -0.87], [0.345, -0.8], [0.29, -0.55], [0.232, -0.28], [0.185, -0.06], [0.17, 0.03]], 30, {
    sz: 0.8, den: DEN.cloth, tint: dirt(C_INDIGO, 0.55),
    fold: (a, v) => 1 + 0.11 * Math.pow(1 - v, 1.6) * (0.6 * Math.sin(7 * a + 0.6) + 0.4 * Math.sin(12 * a + 2.1)),
  });
  const coatGap = 0.5;
  T.s('hips', 'cloth').lathe([[0.385, -0.72], [0.37, -0.66], [0.32, -0.45], [0.257, -0.22], [0.205, -0.03], [0.19, 0.04]], 30, {
    sz: 0.82, den: DEN.cloth, tint: coatTint(C_OCHRE, 0.6, true), twoSided: true, arc: [FRONT + coatGap, FRONT - coatGap + TAU],
    fold: (a, v) => 1 + 0.09 * Math.pow(1 - v, 1.5) * (0.6 * Math.sin(6 * a + 2.2) + 0.4 * Math.sin(11 * a + 0.4)),
  });
  T.s('hips', 'cloth').lathe([[0.198, -0.04], [0.206, 0.0], [0.198, 0.045]], 24, { sz: 0.83, den: DEN.cloth, tint: C_SASH, smooth: false });
  T.s('hips', 'cloth').ball(0.05, 0.038, 0.032, [0.075, 0.0, 0.17], 10, { den: DEN.cloth, tint: mul(C_SASH, 1.1) });
  T.s('hips', 'metal').ball(0.03, 0.03, 0.012, [-0.02, 0.0, 0.172], 8, { den: DEN.metal, tint: C_BRONZE });
  strip(T.s('sashA', 'cloth'), 0.065, 0.46, C_SASH, DEN.cloth, 0.03);
  strip(T.s('sashB', 'cloth'), 0.06, 0.36, mul(C_SASH, 0.9), DEN.cloth, 0.02);
  // 葫芦、符纸
  T.s('gourd', 'wood').ball(0.058, 0.062, 0.058, [0, -0.13, 0], 12, { den: DEN.wood, tint: rgb(150, 108, 56) });
  T.s('gourd', 'wood').ball(0.038, 0.04, 0.038, [0, -0.055, 0], 10, { den: DEN.wood, tint: rgb(160, 118, 62) });
  T.s('gourd', 'wood').ball(0.012, 0.02, 0.012, [0, -0.012, 0], 6, { den: DEN.wood, tint: C_TRIM });
  for (const name of ['tal1', 'tal2', 'tal3']) {
    strip(T.s(name, 'paper'), 0.05, 0.19, [1, 1, 1], 1, 0.015, true);
  }
  // 靴子
  for (const f of ['footL', 'footR']) {
    T.s(f, 'leather').ball(0.058, 0.055, 0.125, [0, 0, 0.045], 12, { den: DEN.leather, tint: C_BOOT });
  }

  // ── 上身:里袍 + 外褂(前襟敞开)+ 一圈搭在肩头的短披领(盖住肩关节)──
  T.s('chest', 'cloth').lathe([[0.178, -0.21], [0.19, -0.1], [0.205, 0.02], [0.215, 0.12], [0.2, 0.2], [0.13, 0.265], [0.062, 0.3], [0.058, 0.33]], 22, {
    sx: 1.1, sz: 0.74, den: DEN.cloth, tint: C_INDIGO,
  });
  T.s('chest', 'cloth').lathe([[0.196, -0.2], [0.21, -0.09], [0.224, 0.03], [0.232, 0.13], [0.218, 0.21], [0.15, 0.272], [0.085, 0.305]], 26, {
    sx: 1.1, sz: 0.76, den: DEN.cloth, tint: coatTint(C_OCHRE, 0.9, false), twoSided: true, arc: [FRONT + 0.42, FRONT - 0.42 + TAU],
  });
  T.s('chest', 'cloth').lathe([[0.262, 0.15], [0.254, 0.185], [0.207, 0.242], [0.126, 0.286], [0.08, 0.303]], 28, {
    sx: 1.1, sz: 0.84, den: DEN.cloth, tint: (_u, v) => (v < 0.13 ? C_TRIM : mul(C_OCHRE_L, 0.8 + 0.2 * v)), twoSided: true,
    fold: (a, v) => 1 + 0.05 * (1 - v) * Math.sin(8 * a + 1.3),
  });

  // ── 头:脸(额、鼻、眉弓、眼窝、颧骨、下巴)、耳;灰白长发束成发髻,铜冠横插一根簪;长须、长眉 ──
  const H = T.s('head', 'skin');
  H.lathe([[0.05, -0.08], [0.048, -0.01], [0.052, 0.03]], 10, { tint: mul(C_SKIN, 0.86), smooth: false });
  H.ball(0.08, 0.108, 0.094, [0, 0.085, 0.004], 18, { tint: C_SKIN });
  H.ball(0.058, 0.07, 0.062, [0, 0.022, 0.03], 12, { tint: mul(C_SKIN, 0.97) });
  H.ball(0.014, 0.034, 0.026, [0, 0.066, 0.098], 8, { tint: mul(C_SKIN, 1.03) });
  H.ball(0.066, 0.014, 0.026, [0, 0.106, 0.08], 10, { tint: mul(C_SKIN, 0.9) });
  for (const sx of [1, -1]) {
    H.ball(0.012, 0.026, 0.018, [sx * 0.082, 0.078, 0.0], 6, { tint: mul(C_SKIN, 0.9) });
    H.ball(0.024, 0.022, 0.02, [sx * 0.043, 0.058, 0.066], 8, { tint: mul(C_SKIN, 0.98) });
    T.s('head', 'dark').ball(0.016, 0.009, 0.008, [sx * 0.031, 0.09, 0.087], 6);
    T.s('head', 'hair').ball(0.026, 0.006, 0.009, [sx * 0.035, 0.112, 0.09], 6, { den: DEN.hair, tint: C_HAIR, xf: xform([0, 0, 0], [0, 0, sx * -10]) });
    T.s('head', 'hair').capsule(0.009, 0.004, 0.085, 6, { den: DEN.hair, tint: mul(C_HAIR, 0.96), xf: xform([sx * 0.02, 0.05, 0.094], [10, 0, sx * 24]) });
  }
  const HR = T.s('head', 'hair');
  HR.ball(0.086, 0.1, 0.096, [0, 0.1, -0.014], 16, { den: DEN.hair, tint: mul(C_HAIR, 0.82) });
  HR.lathe([[0.066, -0.11], [0.082, -0.03], [0.088, 0.06]], 16, {
    sx: 0.96, den: DEN.hair, tint: (_u, v) => mul(C_HAIR, 0.66 + 0.2 * v), arc: [FRONT + 1.5, FRONT - 1.5 + TAU],
    fold: (a) => 1 + 0.05 * Math.sin(13 * a),
    bend: (_v, p) => {
      p.z -= 0.012;
    },
  });
  HR.ball(0.037, 0.042, 0.037, [0, 0.222, -0.022], 10, { den: DEN.hair, tint: mul(C_HAIR, 0.9) });
  T.s('head', 'metal').lathe([[0.033, 0.196], [0.043, 0.206], [0.033, 0.218]], 10, { den: DEN.metal, tint: C_BRONZE, smooth: false, xf: xform([0, 0, -0.022]) });
  T.s('head', 'metal').box(0.2, 0.009, 0.009, new Vec3(0, 0.222, -0.022), new Vec3(0, 12, 0), C_BRONZE, DEN.metal, () => 0.5, 0.002);
  T.s('head', 'cloth').lathe([[0.083, 0.128], [0.086, 0.139], [0.083, 0.15]], 18, { sz: 1.14, den: DEN.cloth, tint: C_INDIGO, smooth: false, xf: xform([0, 0, -0.004]) });
  T.s('beard', 'hair').lathe([[0.004, -0.31], [0.026, -0.23], [0.044, -0.11], [0.05, -0.03], [0.044, 0.012]], 14, {
    sz: 0.5, den: DEN.hair, tint: (_u, v) => mul(C_HAIR, 1.02 - 0.2 * v),
    fold: (a) => 1 + 0.13 * Math.sin(11 * a),
  });
  strip(T.s('wrapTail', 'cloth'), 0.05, 0.3, C_INDIGO, DEN.cloth, 0.05);

  // ── 手臂:上臂袖筒、往手腕略放宽的袖口(镶边)、垂下来的袖摆、手 ──
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    T.s(`arm${side}`, 'cloth').capsule(0.088, 0.08, 0.27, 12, { den: DEN.cloth, tint: C_OCHRE });
    T.s(`fore${side}`, 'cloth').lathe([[0.108, -0.24], [0.1, -0.17], [0.09, -0.08], [0.082, 0.02]], 16, {
      den: DEN.cloth, tint: (_u, v) => (v < 0.14 ? C_TRIM : mul(C_OCHRE, 0.8 + 0.2 * v)), twoSided: true,
      fold: (a, v) => 1 + 0.06 * (1 - v) * Math.sin(6 * a + 0.8),
    });
    T.s(`fore${side}`, 'cloth').capsule(0.04, 0.034, 0.25, 8, { den: DEN.cloth, tint: C_INDIGO });
    T.s(`sleeve${side}`, 'cloth').lathe([[0.004, -0.27], [0.05, -0.21], [0.078, -0.12], [0.074, -0.04], [0.05, 0.005]], 14, {
      sx: 0.4, den: DEN.cloth, tint: (_u, v) => (v < 0.2 ? C_TRIM : mul(C_OCHRE, 0.7 + 0.3 * v)),
      fold: (a, v) => 1 + 0.08 * (1 - v) * Math.sin(5 * a),
    });
    const hand = T.s(`hand${side}`, 'skin');
    if (side === 'R') {
      hand.ball(0.047, 0.046, 0.047, [0, -0.05, 0.03], 10, { tint: mul(C_SKIN, 0.96) });   // 握着法杖的拳头
    } else {
      hand.ball(0.04, 0.05, 0.021, [0, -0.045, 0], 10, { tint: C_SKIN });
      hand.ball(0.036, 0.042, 0.018, [0, -0.098, 0.004], 8, { tint: mul(C_SKIN, 0.98) });
      hand.ball(0.014, 0.03, 0.014, [sgn * -0.036, -0.04, 0.016], 6, { tint: C_SKIN });
    }
  }

  // ── 法杖:微弯的木杆、九道铜箍、杆顶的铜环里托着一枚晶石,再挂两张符和一缕红缨 ──
  const path: Vec3[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const y = -1.0 + (2.02 * i) / 14;
    path.push(new Vec3(0.012 * Math.sin(3.1 * y + 1), y, 0.01 * Math.sin(2.3 * y)));
  }
  T.s('staff', 'wood').tube(path, (t) => 0.025 - 0.006 * t, 8, { den: DEN.wood, tint: C_WOODT });
  const ST = T.s('staff', 'metal');
  ST.lathe([[0.028, -1.0], [0.029, -0.95], [0.025, -0.92]], 8, { den: DEN.metal, tint: C_BRONZE, smooth: false });
  for (let i = 0; i < 9; i += 1) {
    const y = 0.2 + i * 0.08;
    ST.lathe([[0.022, y - 0.011], [0.034, y], [0.022, y + 0.011]], 8, { den: DEN.metal, tint: mul(C_BRONZE, 0.9 + 0.2 * hash2(i, 3, 5)), smooth: false });
  }
  const ringPath: Vec3[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const a = (i / 18) * TAU - Math.PI / 2;
    ringPath.push(new Vec3(Math.cos(a) * 0.1, 1.15 + Math.sin(a) * 0.1, 0));
  }
  ST.tube(ringPath, 0.014, 6, { den: DEN.metal, tint: C_BRONZE });
  ST.lathe([[0.019, 1.0], [0.03, 1.025], [0.017, 1.055]], 8, { den: DEN.metal, tint: C_BRONZE, smooth: false });
  const hex: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    hex.push([Math.cos((i / 6) * TAU) * 0.04, Math.sin((i / 6) * TAU) * 0.04]);
  }
  const G = T.s('staff', 'glow');
  G.prism(hex, 1.12, 1.18, 1, [1, 1, 1], 1, undefined, false);
  G.prism(hex, 1.18, 1.245, 0, [1, 1, 1], 1, undefined, false);
  G.prism(hex, 0, 0.065, 0, [1, 1, 1], 1, xform([0, 1.12, 0], [180, 0, 0]), false);
  T.s('tassel', 'cloth').capsule(0.012, 0.026, 0.24, 8, { den: DEN.cloth, tint: rgb(140, 38, 30) });
  strip(T.s('staffTalA', 'paper'), 0.055, 0.2, [1, 1, 1], 1, 0.012, true);
  strip(T.s('staffTalB', 'paper'), 0.055, 0.2, [1, 1, 1], 1, 0.012, true);
  return T;
}

// ───────────────────────── 重甲骑士 ─────────────────────────
const K_STEEL = rgb(150, 154, 164);
const K_DARK = rgb(96, 99, 108);
const K_BRASS = rgb(128, 98, 54);
const K_CAPE = rgb(92, 30, 30);
const K_UNDER = rgb(30, 28, 30);
const K_SHIELD = rgb(48, 66, 70);

export function buildKnight(): ActorTemplate {
  const T = new ActorTemplate();
  T.bone('hips', null, 0, 1.02, 0);
  T.bone('chest', 'hips', 0, 0.22, 0);
  T.bone('head', 'chest', 0, 0.4, 0);
  T.bone('armL', 'chest', 0.25, 0.26, 0);
  T.bone('foreL', 'armL', 0, -0.3, 0);
  T.bone('handL', 'foreL', 0, -0.27, 0);
  T.bone('armR', 'chest', -0.25, 0.26, 0);
  T.bone('foreR', 'armR', 0, -0.3, 0);
  T.bone('handR', 'foreR', 0, -0.27, 0);
  T.bone('thighL', 'hips', 0.105, -0.06, 0);
  T.bone('shinL', 'thighL', 0, -0.45, 0);
  T.bone('footL', 'shinL', 0, -0.45, 0);
  T.bone('thighR', 'hips', -0.105, -0.06, 0);
  T.bone('shinR', 'thighR', 0, -0.45, 0);
  T.bone('footR', 'shinR', 0, -0.45, 0);
  // 朝镜头的那只手(角色的左手)拿剑,盾在另一侧的前臂上
  T.bone('sword', 'handL', 0, -0.055, 0.03, undefined, [90, 0, 0]);
  T.bone('shield', 'foreR', -0.075, -0.13, 0.03);
  T.bone('cape', 'chest', 0, 0.27, -0.14, { len: 1.0, stiff: 2.2, damp: 0.955, gravity: 1 });

  const ridge = (a: number, w: number): number => Math.exp(-Math.pow(angDist(a, FRONT) / w, 2));
  const wear = (base: Tint, seed: number): ((u: number, v: number) => Tint) => (u, v) => mul(base, 0.86 + 0.28 * hash2(Math.floor(u * 6), Math.floor(v * 4), seed));

  // ── 躯干:胸甲(正中起脊)、护颈、裙甲、腰带;甲片缝里是深色衬衣 ──
  T.s('chest', 'cloth').ball(0.17, 0.2, 0.12, [0, 0.05, 0], 12, { den: DEN.cloth, tint: K_UNDER });
  T.s('chest', 'metal').lathe([[0.2, -0.17], [0.215, -0.08], [0.245, 0.05], [0.25, 0.16], [0.225, 0.25], [0.15, 0.31], [0.12, 0.335]], 26, {
    sx: 1.08, sz: 0.8, den: DEN.metal, tint: wear(K_STEEL, 11),
    fold: (a, v) => 1 + 0.06 * ridge(a, 0.2) * (1 - Math.abs(v - 0.5) * 1.4),
  });
  T.s('chest', 'metal').lathe([[0.105, 0.3], [0.127, 0.335], [0.12, 0.37], [0.1, 0.388]], 16, { den: DEN.metal, tint: K_DARK });
  T.s('hips', 'cloth').ball(0.17, 0.13, 0.13, [0, -0.03, 0], 12, { den: DEN.cloth, tint: K_UNDER });
  T.s('hips', 'metal').lathe([[0.238, -0.17], [0.23, -0.09], [0.208, 0.0], [0.197, 0.05]], 22, {
    sx: 1.05, sz: 0.82, den: DEN.metal, tint: (u, v) => mul(K_DARK, 0.85 + 0.3 * (Math.floor(v * 3.99) % 2) * 0.5 + 0.15 * hash2(Math.floor(u * 8), 2, 7)),
  });
  T.s('hips', 'leather').lathe([[0.202, 0.03], [0.21, 0.055], [0.202, 0.082]], 20, { sx: 1.05, sz: 0.82, den: DEN.leather, tint: rgb(60, 44, 32), smooth: false });
  T.s('hips', 'metal').ball(0.032, 0.026, 0.014, [0, 0.055, 0.176], 8, { den: DEN.metal, tint: K_BRASS });

  // ── 头盔:整盔 + 前凸的面罩 + 一道窥缝 + 顶脊 ──
  T.s('head', 'metal').lathe([[0.108, -0.045], [0.118, 0.0], [0.122, 0.06], [0.118, 0.12], [0.095, 0.18], [0.05, 0.215], [0.012, 0.225]], 22, {
    sx: 0.94, sz: 1.1, den: DEN.metal, tint: wear(K_STEEL, 23),
    fold: (a, v) => 1 + 0.12 * ridge(a, 0.38) * Math.exp(-Math.pow((v - 0.3) / 0.22, 2)),
  });
  T.s('head', 'dark').box(0.17, 0.016, 0.03, new Vec3(0, 0.064, 0.127), new Vec3(0, 0, 0), [1, 1, 1], 1, () => 0.5, 0);
  T.s('head', 'metal').box(0.012, 0.026, 0.2, new Vec3(0, 0.221, -0.012), new Vec3(-7, 0, 0), K_DARK, DEN.metal, () => 0.5, 0.004);
  for (const sx of [1, -1]) {
    T.s('head', 'metal').ball(0.016, 0.03, 0.03, [sx * 0.112, 0.02, 0.0], 6, { den: DEN.metal, tint: K_BRASS });
  }

  // ── 手臂:三层肩甲、臂甲、肘甲、护腕、铁手套 ──
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    T.s(`arm${side}`, 'cloth').capsule(0.06, 0.055, 0.3, 10, { den: DEN.cloth, tint: K_UNDER });
    const A = T.s(`arm${side}`, 'metal');
    A.ball(0.13, 0.088, 0.135, [sgn * 0.03, 0.035, 0], 14, { den: DEN.metal, tint: wear(K_STEEL, 31) });
    A.ball(0.108, 0.062, 0.118, [sgn * 0.05, -0.045, 0], 12, { den: DEN.metal, tint: mul(K_STEEL, 0.9) });
    A.ball(0.092, 0.05, 0.102, [sgn * 0.056, -0.108, 0], 12, { den: DEN.metal, tint: mul(K_STEEL, 0.82) });
    A.lathe([[0.066, -0.27], [0.072, -0.2], [0.069, -0.15]], 12, { den: DEN.metal, tint: K_DARK, smooth: false });
    const F = T.s(`fore${side}`, 'metal');
    F.ball(0.07, 0.07, 0.076, [0, 0, -0.01], 10, { den: DEN.metal, tint: K_STEEL });
    F.lathe([[0.052, -0.26], [0.062, -0.13], [0.066, -0.035]], 12, { den: DEN.metal, tint: wear(K_STEEL, 37) });
    const Hd = T.s(`hand${side}`, 'metal');
    Hd.lathe([[0.058, -0.04], [0.074, 0.0], [0.07, 0.02]], 10, { den: DEN.metal, tint: K_DARK, smooth: false });
    Hd.ball(0.05, 0.056, 0.05, [0, -0.062, 0.02], 10, { den: DEN.metal, tint: mul(K_DARK, 0.9) });
  }

  // ── 腿:腿甲(前面挂一片腿裙甲)、膝甲、胫甲、铁靴 ──
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    const Th = T.s(`thigh${side}`, 'metal');
    Th.capsule(0.097, 0.077, 0.45, 12, { den: DEN.metal, tint: wear(K_DARK, 41) });
    Th.prism([[-0.085, -0.008], [0.085, -0.008], [0.085, 0.008], [-0.085, 0.008]], -0.3, 0, 1.15, K_STEEL, DEN.metal, xform([sgn * 0.02, 0.05, 0.092], [-7, sgn * 14, 0]));
    const Sh = T.s(`shin${side}`, 'metal');
    Sh.ball(0.076, 0.078, 0.088, [0, 0, 0.016], 10, { den: DEN.metal, tint: K_STEEL });
    Sh.lathe([[0.05, -0.43], [0.06, -0.3], [0.071, -0.15], [0.066, -0.035]], 12, {
      sz: 1.1, den: DEN.metal, tint: wear(K_STEEL, 43),
      fold: (a) => 1 + 0.07 * ridge(a, 0.25),
    });
    T.s(`foot${side}`, 'metal').ball(0.056, 0.046, 0.142, [0, -0.034, 0.062], 10, { den: DEN.metal, tint: K_DARK });
  }

  // ── 剑:握柄在手里,剑身沿骨头的 +y ──
  const SW = T.s('sword', 'metal');
  SW.prism([[0.058, 0], [0, 0.016], [-0.058, 0], [0, -0.016]], 0.15, 1.02, 0.6, rgb(214, 218, 226), DEN.metal);
  SW.prism([[0.0348, 0], [0, 0.0096], [-0.0348, 0], [0, -0.0096]], 1.02, 1.2, 0, rgb(214, 218, 226), DEN.metal, undefined, false);
  SW.box(0.27, 0.036, 0.046, new Vec3(0, 0.132, 0), new Vec3(0, 0, 0), K_BRASS, DEN.metal, () => 0.5, 0.008);
  SW.ball(0.032, 0.032, 0.032, [0, -0.14, 0], 8, { den: DEN.metal, tint: K_BRASS });
  T.s('sword', 'leather').lathe([[0.017, -0.115], [0.019, 0.0], [0.017, 0.115]], 8, { den: DEN.leather, tint: rgb(46, 32, 24), smooth: false });

  // ── 盾:鸢形,微微外鼓;先在「宽 x、高 y、面朝 +z」的坐标里做,再转到前臂外侧 ──
  const basis = new Mat4(0, -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1);   // 列:x → (0,-1,0)  y → (0,0,1)  z → (-1,0,0)
  const hw = (v: number): number => 0.27 * Math.pow(Math.sin(Math.min(1, v * 1.35) * Math.PI * 0.5), 0.75) * (1 - 0.12 * Math.pow(Math.max(0, v - 0.72) / 0.28, 2));
  T.s('shield', 'metal').surf(10, 12, (u, v, out) => {
    const x = (u - 0.5) * 2;
    out.set(x * hw(v), -0.52 + v * 0.92, 0.075 * Math.cos(x * Math.PI * 0.5) * (0.5 + 0.5 * Math.sin(v * Math.PI)));
  }, { den: DEN.metal, twoSided: true, xf: basis, tint: (u, v) => (u < 0.06 || u > 0.94 || v > 0.94 ? K_BRASS : mul(K_SHIELD, 0.8 + 0.4 * hash2(Math.floor(u * 5), Math.floor(v * 7), 51))) });
  T.s('shield', 'metal').ball(0.075, 0.075, 0.05, [0, 0.03, 0.085], 10, { den: DEN.metal, tint: K_BRASS, xf: basis });

  // ── 披风:破旧的暗红布,下摆撕成一条一条 ──
  T.s('cape', 'cloth').surf(10, 9, (u, v, out) => {
    const t = 1 - v;
    const x = (u - 0.5) * (0.6 + 0.26 * t);
    const rag = t > 0.99 ? 0.1 * hash2(Math.round(u * 10), 9, 3) : 0;
    out.set(x, -(1.0 - rag) * t, -0.02 - 0.05 * t + 0.045 * Math.sin(u * 5 * Math.PI) * (0.25 + 0.75 * t));
  }, { den: DEN.cloth, twoSided: true, tint: (_u, v) => mul(K_CAPE, 0.5 + 0.5 * v) });
  return T;
}

// ───────────────────────── 动作 ─────────────────────────
const S = Math.sin;

/**
 * 术士的姿势。cast = 施法进度:0 待机 → 1 举杖蓄力到顶;strike = 落雷那一下(0..1,刚劈下去是 1,随后回落)。
 * 返回法杖想要的世界朝向(前倾 / 侧倾的角度,度)。
 */
export function poseSorcerer(a: Actor, t: number, cast: number, strike: number): { pitch: number; roll: number } {
  const br = S(t * 1.5);
  const c = cast * cast * (3 - 2 * cast);
  const k = strike;
  a.set('hips', -1.5 * c + 5 * k, 0, 0.6 * S(t * 0.7));
  a.set('chest', 1.2 * br - 9 * c + 13 * k, -8 * c + 6 * k, 0);
  a.set('head', -1.5 * br - 14 * c + 10 * k, 6 * S(t * 0.4) * (1 - c), 0);
  // 持杖的手(朝镜头这边):待机时杖拄在身侧,蓄力时高举过头,劈下时往前一送
  a.set('armR', -34 - 96 * c + 46 * k, 0, -10 - 16 * c);
  a.set('foreR', -62 + 20 * c - 22 * k, 0, 0);
  // 另一只手:待机垂着,蓄力时在胸前掐诀,劈下时掌心前推
  a.set('armL', -6 - 50 * c - 30 * k, 0, 6 + 10 * c);
  a.set('foreL', -14 - 82 * c + 46 * k, 0, 0);
  a.set('handL', 0, 0, -20 * c);
  return { pitch: 3 + 5 * br * 0.3 - 16 * c + 40 * k, roll: -4 - 6 * c };
}

/**
 * 骑士的姿势。walk = 走路的相位(弧度),stride = 步幅(0 站着 → 1 正常走);attack = 挥砍进度(0 没在砍;0..0.6 举剑,0.6..0.75 劈下,之后收);
 * hit = 受击(1 刚挨打 → 0);dead = 倒地进度(0..1)。
 */
export function poseKnight(a: Actor, t: number, walk: number, stride: number, attack: number, hit: number, dead: number): void {
  const sw = S(walk) * stride;
  const sw2 = S(walk + Math.PI) * stride;
  const bob = Math.abs(S(walk)) * stride;
  const up = attack > 0 ? Math.min(1, attack / 0.6) : 0;
  const upS = up * up * (3 - 2 * up);
  const chop = attack > 0.6 ? Math.min(1, (attack - 0.6) / 0.15) : 0;
  const back = attack > 0.75 ? Math.min(1, (attack - 0.75) / 0.25) : 0;
  const raise = upS * (1 - chop) + 0 * chop;
  const swing = chop * (1 - back);
  const d = dead * dead * (3 - 2 * dead);
  a.lift = (-0.035 * (1 - bob) * stride - 0.62 * d) * a.scale;
  a.set('hips', 5 * stride - 10 * hit + 8 * swing - 62 * d, 5 * sw, 0);
  a.set('chest', 3 * stride + 1.2 * S(t * 1.3) - 14 * hit - 12 * raise + 24 * swing - 22 * d, -6 * sw - 14 * raise + 18 * swing, 0);
  a.set('head', -3 * stride - 12 * hit + 8 * raise - 6 * swing - 18 * d, 4 * sw, 0);
  // 腿:大腿前后摆,摆到前面那条腿先屈膝再伸直
  a.set('thighL', -26 * sw - 6 * stride + 30 * d, 0, 2);
  a.set('shinL', (28 + 26 * S(walk + 1.2)) * stride * Math.max(0, 0.4 + S(walk + 0.6)) + 8 * hit + 50 * d, 0, 0);
  a.set('footL', 6 * sw, 0, 0);
  a.set('thighR', -26 * sw2 - 6 * stride + 18 * d, 0, -2);
  a.set('shinR', (28 + 26 * S(walk + Math.PI + 1.2)) * stride * Math.max(0, 0.4 + S(walk + Math.PI + 0.6)) + 8 * hit + 66 * d, 0, 0);
  a.set('footR', 6 * sw2, 0, 0);
  // 持剑的手(朝镜头这边):走路时剑斜指前下方,举剑过头,劈到身前
  a.set('armL', -18 + 10 * sw2 - 132 * raise - 46 * swing + 26 * hit + 30 * d, 0, 10 + 14 * raise);
  a.set('foreL', -38 - 30 * raise + 14 * swing - 20 * hit, 0, 0);
  a.set('sword', 90 - 22 * raise + 34 * swing, 0, 0);
  // 持盾的手:盾护在身前
  a.set('armR', -34 - 6 * sw + 22 * hit - 10 * swing + 20 * d, 0, -8);
  a.set('foreR', -72 + 10 * swing - 26 * hit + 40 * d, 30, 0);
}
