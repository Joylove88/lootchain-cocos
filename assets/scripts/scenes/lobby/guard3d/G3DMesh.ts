import { Mat4, Mesh, Quat, utils, Vec3 } from 'cc';

/**
 * 守卫战 3D 光影层(技术验证,默认关)· 网格拼装。
 *
 * 道具全是基本体(带倒角的方块、圆柱、乱石)拼的,同一种材质的攒进同一批、一次建成网格 —— 画的时候一批一次绘制。
 * 引擎的 createMesh 只支持 16 位索引,一批攒到 6 万个顶点就切一块。
 * 每个顶点都带切线(第四个分量是副切线的朝向):内置标准材质的法线贴图要用。
 */
export type Tint = [number, number, number];

const _v = new Vec3();
const _n = new Vec3();
const _t = new Vec3();
const _b = new Vec3();
const _c = new Vec3();

export class MeshBatch {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private tangents: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private readonly meshes: Mesh[] = [];
  triangles = 0;

  private count(): number {
    return this.positions.length / 3;
  }

  private cut(): void {
    if (!this.positions.length) {
      return;
    }
    this.meshes.push(utils.MeshUtils.createMesh({ positions: this.positions, normals: this.normals, uvs: this.uvs, tangents: this.tangents, colors: this.colors, indices: this.indices }, undefined, { calculateBounds: true }));
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.tangents = [];
    this.colors = [];
    this.indices = [];
  }

  /** 这一批到此为止,另起一块网格(按区域切块用:点光只重画它照得到的那几块)。 */
  split(): void {
    this.cut();
  }

  build(): Mesh[] {
    this.cut();
    return this.meshes;
  }

  /**
   * 加一个平面多边形(3 或 4 个点,世界坐标)。hint = 朝外的大致方向:绕序反了会自动翻过来,法线就用它(归一化后)。
   * uv 按法线的主方向做平面投影(uv = 世界坐标 × den + 偏移);groundY 给了的话,贴近这个高度的顶点压暗(假的接地遮蔽)。
   */
  poly(pts: Vec3[], hint: Vec3, tint: Tint, den: number, ou: number, ov: number, groundY?: number): void {
    if (this.count() + pts.length > 60000) {
      this.cut();
    }
    Vec3.subtract(_t, pts[1], pts[0]);
    Vec3.subtract(_b, pts[2], pts[0]);
    Vec3.cross(_c, _t, _b);
    const flip = Vec3.dot(_c, hint) < 0;
    Vec3.normalize(_n, hint);
    const ax = Math.abs(_n.x);
    const ay = Math.abs(_n.y);
    const az = Math.abs(_n.z);
    // 平面投影的两个轴:u 方向 = 切线,v 方向 = 副切线
    let ua: 'x' | 'z';
    let va: 'y' | 'z';
    if (ay >= ax && ay >= az) {
      ua = 'x';
      va = 'z';
    } else if (ax >= az) {
      ua = 'z';
      va = 'y';
    } else {
      ua = 'x';
      va = 'y';
    }
    _t.set(ua === 'x' ? 1 : 0, 0, ua === 'z' ? 1 : 0);
    _b.set(0, va === 'y' ? 1 : 0, va === 'z' ? 1 : 0);
    // 切线投到面内并归一化;第四个分量 = 副切线相对 cross(法线, 切线) 的朝向
    _t.subtract(_c.set(_n).multiplyScalar(Vec3.dot(_t, _n))).normalize();
    Vec3.cross(_c, _n, _t);
    const w = Vec3.dot(_c, _b) < 0 ? -1 : 1;
    const base = this.count();
    for (const p of pts) {
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(_n.x, _n.y, _n.z);
      this.tangents.push(_t.x, _t.y, _t.z, w);
      this.uvs.push(p[ua] * den + ou, p[va] * den + ov);
      const k = groundY === undefined ? 1 : 0.6 + 0.4 * Math.min(1, Math.max(0, (p.y - groundY) / 0.4));
      this.colors.push(tint[0] * k, tint[1] * k, tint[2] * k, 1);
    }
    for (let i = 1; i < pts.length - 1; i += 1) {
      if (flip) {
        this.indices.push(base, base + i + 1, base + i);
      } else {
        this.indices.push(base, base + i, base + i + 1);
      }
      this.triangles += 1;
    }
  }

  /**
   * 带倒角的方块:6 个面 + 12 条棱上的斜面 + 8 个角上的小三角。倒角那一圈斜面在掠射光下会亮一线,石块才不像纸盒。
   * 尺寸 w × h × d,中心在 pos,rot = 欧拉角(度);bevel = 倒角宽(0 = 不倒角)。
   */
  box(w: number, h: number, d: number, pos: Vec3, rot: Vec3, tint: Tint, den: number, rnd: () => number, bevel: number, groundY?: number): void {
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const bv = Math.min(bevel, hx * 0.45, hy * 0.45, hz * 0.45);
    const q = Quat.fromEuler(new Quat(), rot.x, rot.y, rot.z);
    const m = Mat4.fromRTS(new Mat4(), q, pos, Vec3.ONE);
    const ou = rnd() * 7;
    const ov = rnd() * 7;
    const P = (x: number, y: number, z: number): Vec3 => Vec3.transformMat4(new Vec3(), _v.set(x, y, z), m);
    const N = (x: number, y: number, z: number): Vec3 => Vec3.transformQuat(new Vec3(), _v.set(x, y, z), q);
    const S = [-1, 1];
    // 每个角有三个点:分别落在过这个角的三个面上(各自往里缩一个倒角宽)
    const px = (sx: number, sy: number, sz: number): Vec3 => P(sx * hx, sy * (hy - bv), sz * (hz - bv));
    const py = (sx: number, sy: number, sz: number): Vec3 => P(sx * (hx - bv), sy * hy, sz * (hz - bv));
    const pz = (sx: number, sy: number, sz: number): Vec3 => P(sx * (hx - bv), sy * (hy - bv), sz * hz);
    for (const s of S) {
      this.poly([px(s, -1, -1), px(s, 1, -1), px(s, 1, 1), px(s, -1, 1)], N(s, 0, 0), tint, den, ou, ov, groundY);
      this.poly([py(-1, s, -1), py(1, s, -1), py(1, s, 1), py(-1, s, 1)], N(0, s, 0), tint, den, ou, ov, groundY);
      this.poly([pz(-1, -1, s), pz(1, -1, s), pz(1, 1, s), pz(-1, 1, s)], N(0, 0, s), tint, den, ou, ov, groundY);
    }
    if (bv <= 0.0005) {
      return;
    }
    for (const a of S) {
      for (const b of S) {
        this.poly([px(a, b, -1), px(a, b, 1), py(a, b, 1), py(a, b, -1)], N(a, b, 0), tint, den, ou, ov, groundY);   // x-y 棱
        this.poly([px(a, -1, b), px(a, 1, b), pz(a, 1, b), pz(a, -1, b)], N(a, 0, b), tint, den, ou, ov, groundY);   // x-z 棱
        this.poly([py(-1, a, b), py(1, a, b), pz(1, a, b), pz(-1, a, b)], N(0, a, b), tint, den, ou, ov, groundY);   // y-z 棱
        for (const c of S) {
          this.poly([px(a, b, c), py(a, b, c), pz(a, b, c)], N(a, b, c), tint, den, ou, ov, groundY);                 // 角
        }
      }
    }
  }

  /** 圆柱 / 圆台(轴沿自身 y):侧面法线平滑,两头封口。 */
  cylinder(rTop: number, rBot: number, h: number, seg: number, pos: Vec3, rot: Vec3, tint: Tint, den: number, rnd: () => number, groundY?: number, caps = true): void {
    if (this.count() + seg * 4 + 2 * (seg + 1) > 60000) {
      this.cut();
    }
    const q = Quat.fromEuler(new Quat(), rot.x, rot.y, rot.z);
    const m = Mat4.fromRTS(new Mat4(), q, pos, Vec3.ONE);
    const ou = rnd() * 5;
    const ov = rnd() * 5;
    const rMax = Math.max(rTop, rBot);
    const slope = (rBot - rTop) / h;
    const base = this.count();
    for (let i = 0; i <= seg; i += 1) {
      const ang = (i / seg) * Math.PI * 2;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      for (let k = 0; k < 2; k += 1) {
        const r = k ? rTop : rBot;
        Vec3.transformMat4(_v, _c.set(cs * r, k ? h / 2 : -h / 2, sn * r), m);
        Vec3.transformQuat(_n, _c.set(cs, slope, sn).normalize(), q);
        Vec3.transformQuat(_t, _c.set(-sn, 0, cs), q);
        // uv:u 沿圆周、v 沿轴向上 → 副切线 = +轴;cross(法线, 切线) 指向 -轴,所以第四个分量是 -1
        this.positions.push(_v.x, _v.y, _v.z);
        this.normals.push(_n.x, _n.y, _n.z);
        this.tangents.push(_t.x, _t.y, _t.z, -1);
        this.uvs.push((i / seg) * Math.PI * 2 * rMax * den + ou, (k ? h : 0) * den + ov);
        const kk = groundY === undefined ? 1 : 0.6 + 0.4 * Math.min(1, Math.max(0, (_v.y - groundY) / 0.4));
        this.colors.push(tint[0] * kk, tint[1] * kk, tint[2] * kk, 1);
      }
    }
    for (let i = 0; i < seg; i += 1) {
      const a = base + i * 2;
      this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      this.triangles += 2;
    }
    if (!caps) {
      return;
    }
    for (const top of [true, false]) {
      const r = top ? rTop : rBot;
      if (r < 0.002) {
        continue;
      }
      const ring: Vec3[] = [];
      for (let i = 0; i < seg; i += 1) {
        const ang = (i / seg) * Math.PI * 2;
        ring.push(Vec3.transformMat4(new Vec3(), _c.set(Math.cos(ang) * r, top ? h / 2 : -h / 2, Math.sin(ang) * r), m));
      }
      const hint = Vec3.transformQuat(new Vec3(), _c.set(0, top ? 1 : -1, 0), q);
      // 扇形切成三角
      for (let i = 1; i < seg - 1; i += 1) {
        this.poly([ring[0], ring[i], ring[i + 1]], hint, tint, den, ou, ov, groundY);
      }
    }
  }

  /** 乱石:二十面体的顶点各自往里外挪一点,按面平直着色。 */
  rock(r: number, pos: Vec3, tint: Tint, den: number, rnd: () => number, squash = 0.6): void {
    const tphi = (1 + Math.sqrt(5)) / 2;
    const raw = [[-1, tphi, 0], [1, tphi, 0], [-1, -tphi, 0], [1, -tphi, 0], [0, -1, tphi], [0, 1, tphi], [0, -1, -tphi], [0, 1, -tphi], [tphi, 0, -1], [tphi, 0, 1], [-tphi, 0, -1], [-tphi, 0, 1]];
    const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const q = Quat.fromEuler(new Quat(), rnd() * 360, rnd() * 360, rnd() * 360);
    const sx = 0.8 + rnd() * 0.6;
    const sz = 0.8 + rnd() * 0.6;
    const vs = raw.map((p) => {
      const k = (r / 1.902) * (0.8 + rnd() * 0.4);
      const v = Vec3.transformQuat(new Vec3(), _c.set(p[0] * k, p[1] * k, p[2] * k), q);
      v.x *= sx;
      v.y *= squash;
      v.z *= sz;
      return v.add(pos);
    });
    const ou = rnd() * 7;
    const ov = rnd() * 7;
    for (const f of faces) {
      const a = vs[f[0]];
      const b = vs[f[1]];
      const c = vs[f[2]];
      const hint = new Vec3((a.x + b.x + c.x) / 3 - pos.x, (a.y + b.y + c.y) / 3 - pos.y, (a.z + b.z + c.z) / 3 - pos.z);
      this.poly([a, b, c], hint, tint, den, ou, ov, 0);
    }
  }

  /**
   * 地面:一张 w × d 的平板切成 nx × nz 块,每块单独成一张网格。
   * 点光是「每盏灯把它照得到的网格再画一遍」,地面切了块,一盏技能光只重画脚下那几块而不是整张地面。
   * uv 铺满整张地面贴图:u 沿 +x,v 沿 +z(贴图的上边 = 远处)。
   */
  static groundTiles(x0: number, z0: number, w: number, d: number, nx: number, nz: number, y = 0): Mesh[] {
    const out: Mesh[] = [];
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const xa = x0 + (w * ix) / nx;
        const xb = x0 + (w * (ix + 1)) / nx;
        const za = z0 + (d * iz) / nz;
        const zb = z0 + (d * (iz + 1)) / nz;
        const positions = [xa, y, za, xb, y, za, xb, y, zb, xa, y, zb];
        const uvs = [ix / nx, iz / nz, (ix + 1) / nx, iz / nz, (ix + 1) / nx, (iz + 1) / nz, ix / nx, (iz + 1) / nz];
        // 切线 = +x(u 方向);副切线 = +z(v 方向)= -cross(法线, 切线),所以第四个分量是 -1
        out.push(utils.MeshUtils.createMesh({
          positions,
          normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
          uvs,
          tangents: [1, 0, 0, -1, 1, 0, 0, -1, 1, 0, 0, -1, 1, 0, 0, -1],
          indices: [0, 2, 1, 0, 3, 2],
        }, undefined, { calculateBounds: true }));
      }
    }
    return out;
  }

  /** 一张朝 +z 的竖直平板(宽 1 高 1,原点在正中),uv 铺满:远景、光斑、火苗用。 */
  static quad(): Mesh {
    return utils.MeshUtils.createMesh({
      positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 1, 1, 1, 1, 0, 0, 0],
      indices: [0, 1, 2, 0, 2, 3],
    }, undefined, { calculateBounds: true });
  }
}
