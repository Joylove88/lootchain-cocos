import { Mat4, Quat, Vec3 } from 'cc';
import { MeshBatch, Tint } from './G3DMesh';

/**
 * 守卫战全 3D 样板 · 角色建模用的形体:参数曲面(自动算平滑法线 / 切线 / 均匀的贴图坐标)、旋转体(可压扁、可加褶皱、可弯)、
 * 球、胶囊(四肢)、沿路径扫的管子、平直着色的棱柱(刀刃、晶体、甲片)。
 * 全在「骨头的本地空间」里拼,再由骨架带着动。
 */
export type TintFn = (u: number, v: number, p: Vec3) => Tint;
export interface SurfOpts {
  tint?: Tint | TintFn;
  /** 贴图密度:贴图坐标 = 表面弧长 × den。 */
  den?: number;
  /** 法线翻面(默认朝外的定义见 surf)。 */
  flip?: boolean;
  /** 再加一层反面(布:两面都看得见)。 */
  twoSided?: boolean;
  closeU?: boolean;
  xf?: Mat4;
  ou?: number;
  ov?: number;
  /** 贴图坐标直接用 (u, 1 - v) 铺满整张图(符纸这类「一张图贴一片」的)。 */
  uv01?: boolean;
  /** v 方向单独的贴图密度(不给就和 den 一样):饰边这种「长条纹样」两个方向的比例不同。 */
  denV?: number;
  /** 贴图横竖对调:纹样沿 v 方向走(竖着的饰边)。 */
  swapUV?: boolean;
}
export interface LatheOpts extends SurfOpts {
  /** 截面压扁:x / z 方向各自的倍率。 */
  sx?: number;
  sz?: number;
  /** 半径随角度 / 高度的倍率(褶皱、前后不对称)。 */
  fold?: (ang: number, v: number) => number;
  /** 逐环挪位置(弯、歪)。 */
  bend?: (v: number, p: Vec3) => void;
  /** 只转一段(弧度):披肩、护甲片。 */
  arc?: [number, number];
  rows?: number;
  /** 轮廓点之间走曲线(默认)还是直线。 */
  smooth?: boolean;
}

const _a = new Vec3();
const _b = new Vec3();
const _n = new Vec3();
const _t = new Vec3();
const _c = new Vec3();

export function xform(pos: [number, number, number], rotDeg: [number, number, number] = [0, 0, 0], scale: [number, number, number] | number = 1): Mat4 {
  const q = Quat.fromEuler(new Quat(), rotDeg[0], rotDeg[1], rotDeg[2]);
  const s = typeof scale === 'number' ? new Vec3(scale, scale, scale) : new Vec3(scale[0], scale[1], scale[2]);
  return Mat4.fromRTS(new Mat4(), q, new Vec3(pos[0], pos[1], pos[2]), s);
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** 沿轮廓取一点:v = 0..1(按点的序号均分)。 */
function sampleProfile(profile: Array<[number, number]>, v: number, smooth: boolean, out: [number, number]): void {
  const n = profile.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, v * n));
  const i = Math.floor(f);
  const t = f - i;
  const p1 = profile[i];
  const p2 = profile[i + 1];
  if (!smooth) {
    out[0] = p1[0] + (p2[0] - p1[0]) * t;
    out[1] = p1[1] + (p2[1] - p1[1]) * t;
    return;
  }
  const p0 = profile[Math.max(0, i - 1)];
  const p3 = profile[Math.min(n, i + 2)];
  out[0] = Math.max(0.0015, catmull(p0[0], p1[0], p2[0], p3[0], t));
  out[1] = catmull(p0[1], p1[1], p2[1], p3[1], t);
}

export class Sculpt extends MeshBatch {
  /**
   * 参数曲面:f(u, v) 给出本地坐标,u、v 都是 0..1,切成 nu × nv 格。
   * 法线 = cross(∂P/∂v, ∂P/∂u)(旋转体「u 绕轴、v 向上」时正好朝外),按相邻格点差分,所以是平滑着色。
   */
  surf(nu: number, nv: number, f: (u: number, v: number, out: Vec3) => void, o: SurfOpts = {}): void {
    const cols = nu + 1;
    const rows = nv + 1;
    if (this.count() + cols * rows * (o.twoSided ? 2 : 1) > 60000) {
      this.cut();
    }
    const P: Vec3[] = new Array(cols * rows);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const p = new Vec3();
        f(i / nu, j / nv, p);
        if (o.xf) {
          Vec3.transformMat4(p, p, o.xf);
        }
        P[j * cols + i] = p;
      }
    }
    const den = o.den ?? 1;
    const jm = rows >> 1;
    const im = cols >> 1;
    const uL = [0];
    for (let i = 1; i < cols; i += 1) {
      uL.push(uL[i - 1] + Vec3.distance(P[jm * cols + i], P[jm * cols + i - 1]));
    }
    const vL = [0];
    for (let j = 1; j < rows; j += 1) {
      vL.push(vL[j - 1] + Vec3.distance(P[j * cols + im], P[(j - 1) * cols + im]));
    }
    const tintFn = typeof o.tint === 'function' ? o.tint : null;
    const tint0: Tint = !tintFn && o.tint ? (o.tint as Tint) : [1, 1, 1];
    const sign = o.flip ? -1 : 1;
    const ou = o.ou ?? 0;
    const ov = o.ov ?? 0;
    const sides = o.twoSided ? 2 : 1;
    for (let side = 0; side < sides; side += 1) {
      const sg = side === 0 ? sign : -sign;
      const base = this.count();
      for (let j = 0; j < rows; j += 1) {
        for (let i = 0; i < cols; i += 1) {
          const p = P[j * cols + i];
          const i0 = i > 0 ? i - 1 : (o.closeU ? cols - 2 : 0);
          const i1 = i < cols - 1 ? i + 1 : (o.closeU ? 1 : cols - 1);
          const j0 = Math.max(0, j - 1);
          const j1 = Math.min(rows - 1, j + 1);
          Vec3.subtract(_a, P[j * cols + i1], P[j * cols + i0]);
          Vec3.subtract(_b, P[j1 * cols + i], P[j0 * cols + i]);
          Vec3.cross(_n, _b, _a);
          const len = _n.length();
          if (len < 1e-12) {
            _n.set(0, 1, 0);
          } else {
            _n.multiplyScalar(sg / len);
          }
          _t.set(_a);
          _t.subtract(_c.set(_n).multiplyScalar(Vec3.dot(_t, _n)));
          if (_t.lengthSqr() < 1e-14) {
            _t.set(1, 0, 0);
          } else {
            _t.normalize();
          }
          Vec3.cross(_c, _n, _t);
          const w = Vec3.dot(_c, _b) < 0 ? -1 : 1;
          const tint = tintFn ? tintFn(i / nu, j / nv, p) : tint0;
          this.positions.push(p.x, p.y, p.z);
          this.normals.push(_n.x, _n.y, _n.z);
          this.tangents.push(_t.x, _t.y, _t.z, w);
          if (o.uv01) {
            this.uvs.push(i / nu, 1 - j / nv);
          } else if (o.swapUV) {
            this.uvs.push(vL[j] * (o.denV ?? den) + ou, uL[i] * den + ov);
          } else {
            this.uvs.push(uL[i] * den + ou, vL[j] * (o.denV ?? den) + ov);
          }
          this.colors.push(tint[0], tint[1], tint[2], 1);
        }
      }
      for (let j = 0; j < nv; j += 1) {
        for (let i = 0; i < nu; i += 1) {
          const A = base + j * cols + i;
          const B = A + 1;
          const C = A + cols;
          const D = C + 1;
          if (sg > 0) {
            this.indices.push(A, C, B, B, C, D);
          } else {
            this.indices.push(A, B, C, B, D, C);
          }
          this.triangles += 2;
        }
      }
    }
  }

  /** 旋转体:轮廓 [半径, 高度] 从下往上给,绕 y 轴转一圈(或一段)。 */
  lathe(profile: Array<[number, number]>, seg: number, o: LatheOpts = {}): void {
    const smooth = o.smooth !== false;
    const nv = o.rows ?? (profile.length - 1) * (smooth ? 3 : 1);
    const a0 = o.arc ? o.arc[0] : 0;
    const a1 = o.arc ? o.arc[1] : Math.PI * 2;
    const sx = o.sx ?? 1;
    const sz = o.sz ?? 1;
    const ry: [number, number] = [0, 0];
    this.surf(seg, nv, (u, v, out) => {
      sampleProfile(profile, v, smooth, ry);
      const ang = a0 + (a1 - a0) * u;
      const k = o.fold ? o.fold(ang, v) : 1;
      out.set(Math.cos(ang) * ry[0] * k * sx, ry[1], Math.sin(ang) * ry[0] * k * sz);
      if (o.bend) {
        o.bend(v, out);
      }
    }, { ...o, closeU: !o.arc });
  }

  /** 椭球(中心在 c)。 */
  ball(rx: number, ry: number, rz: number, c: [number, number, number], seg: number, o: SurfOpts = {}): void {
    const rows = Math.max(4, Math.round(seg * 0.6));
    this.surf(seg, rows, (u, v, out) => {
      const th = u * Math.PI * 2;
      const ph = (v - 0.5) * (Math.PI - 0.04);
      out.set(Math.cos(ph) * Math.cos(th) * rx + c[0], Math.sin(ph) * ry + c[1], Math.cos(ph) * Math.sin(th) * rz + c[2]);
    }, { ...o, closeU: true });
  }

  /** 胶囊(四肢):轴从原点往下到 (0, -len, 0),上端半径 r0、下端 r1,两头是半球。 */
  capsule(r0: number, r1: number, len: number, seg: number, o: LatheOpts = {}): void {
    const prof: Array<[number, number]> = [];
    for (let k = 0; k <= 4; k += 1) {
      const ang = -Math.PI / 2 + (k / 4) * (Math.PI / 2);
      prof.push([Math.max(0.002, r1 * Math.cos(ang)), -len + r1 * Math.sin(ang)]);
    }
    for (let k = 0; k <= 4; k += 1) {
      const ang = (k / 4) * (Math.PI / 2);
      prof.push([Math.max(0.002, r0 * Math.cos(ang)), r0 * Math.sin(ang)]);
    }
    this.lathe(prof, seg, { ...o, smooth: false });
  }

  /** 沿路径扫一根管子(法杖、角、绳):radius 可以随位置变。 */
  tube(path: Vec3[], radius: number | ((t: number) => number), seg: number, o: SurfOpts = {}): void {
    const n = path.length;
    const T: Vec3[] = [];
    const N: Vec3[] = [];
    const B: Vec3[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = new Vec3();
      Vec3.subtract(t, path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]);
      t.normalize();
      T.push(t);
    }
    // 起始法向:随便找一根不平行的轴,之后逐点把上一个法向投到新的垂面里(不扭)
    const n0 = new Vec3(1, 0, 0);
    if (Math.abs(Vec3.dot(n0, T[0])) > 0.9) {
      n0.set(0, 0, 1);
    }
    n0.subtract(_c.set(T[0]).multiplyScalar(Vec3.dot(n0, T[0]))).normalize();
    N.push(n0);
    for (let i = 1; i < n; i += 1) {
      const nn = N[i - 1].clone();
      nn.subtract(_c.set(T[i]).multiplyScalar(Vec3.dot(nn, T[i]))).normalize();
      N.push(nn);
    }
    for (let i = 0; i < n; i += 1) {
      B.push(Vec3.cross(new Vec3(), T[i], N[i]));
    }
    const rOf = typeof radius === 'function' ? radius : (): number => radius as number;
    this.surf(seg, (n - 1) * 2, (u, v, out) => {
      const f = Math.min(n - 1 - 1e-6, v * (n - 1));
      const i = Math.floor(f);
      const t = f - i;
      const r = rOf(v);
      const ang = u * Math.PI * 2;
      const cs = Math.cos(ang) * r;
      const sn = Math.sin(ang) * r;
      // 截面:N 方向 cos、B 方向 sin;绕向取成法线朝外
      const px = (path[i].x * (1 - t) + path[i + 1].x * t) + (N[i].x * (1 - t) + N[i + 1].x * t) * cs + (B[i].x * (1 - t) + B[i + 1].x * t) * sn;
      const py = (path[i].y * (1 - t) + path[i + 1].y * t) + (N[i].y * (1 - t) + N[i + 1].y * t) * cs + (B[i].y * (1 - t) + B[i + 1].y * t) * sn;
      const pz = (path[i].z * (1 - t) + path[i + 1].z * t) + (N[i].z * (1 - t) + N[i + 1].z * t) * cs + (B[i].z * (1 - t) + B[i + 1].z * t) * sn;
      out.set(px, py, pz);
    }, { ...o, closeU: true, flip: !o.flip });
  }

  /**
   * 棱柱(平直着色):截面多边形(x, z;逆时针看是从 +y 往下看)沿 y 从 y0 拉到 y1,顶上按 top 缩放(0 = 收成尖)。
   * 刀刃、晶体、甲片、盾牌边都用它:棱线清楚,掠射光下有一线高光。
   */
  prism(section: Array<[number, number]>, y0: number, y1: number, top: number, tints: Tint | Tint[], den: number, xf?: Mat4, capBottom = true): void {
    const n = section.length;
    const per = Array.isArray(tints[0]) ? (tints as Tint[]) : null;   // 给了一组颜色就逐面轮着用(晶体的明暗面)
    let tint: Tint = per ? per[0] : (tints as Tint);
    const P = (x: number, y: number, z: number): Vec3 => {
      const p = new Vec3(x, y, z);
      return xf ? Vec3.transformMat4(p, p, xf) : p;
    };
    const center = P(0, (y0 + y1) / 2, 0);
    const lo = section.map((s) => P(s[0], y0, s[1]));
    const hi = section.map((s) => P(s[0] * top, y1, s[1] * top));
    for (let i = 0; i < n; i += 1) {
      const k = (i + 1) % n;
      const mid = new Vec3((lo[i].x + lo[k].x + hi[i].x + hi[k].x) / 4, (lo[i].y + lo[k].y + hi[i].y + hi[k].y) / 4, (lo[i].z + lo[k].z + hi[i].z + hi[k].z) / 4);
      const hint = mid.subtract(center);
      if (per) {
        tint = per[i % per.length];
      }
      if (top < 0.02) {
        this.poly([lo[i], lo[k], hi[i]], this.faceNormal(lo[i], lo[k], hi[i], hint), tint, den, 0, 0);
      } else {
        this.poly([lo[i], lo[k], hi[k], hi[i]], this.faceNormal(lo[i], lo[k], hi[k], hint), tint, den, 0, 0);
      }
    }
    const axis = Vec3.subtract(new Vec3(), P(0, y1, 0), P(0, y0, 0)).normalize();
    if (per) {
      tint = per[0];
    }
    if (top >= 0.02) {
      for (let i = 1; i < n - 1; i += 1) {
        this.poly([hi[0], hi[i], hi[i + 1]], axis, tint, den, 0, 0);
      }
    }
    if (capBottom) {
      const down = axis.clone().multiplyScalar(-1);
      for (let i = 1; i < n - 1; i += 1) {
        this.poly([lo[0], lo[i], lo[i + 1]], down, tint, den, 0, 0);
      }
    }
  }

  /**
   * 一个平直的面,贴图坐标由调用方逐点给(晶体:每个面要按「绕一圈 / 沿长度」展开,不能用平面投影)。
   * 顶点按「从外面看逆时针」给;法线取面的真实法线,切线按贴图 u 增长的方向算。
   */
  facet(pts: Vec3[], uvs: Array<[number, number]>, tint: Tint): void {
    if (this.count() + pts.length > 60000) {
      this.cut();
    }
    const e1 = Vec3.subtract(new Vec3(), pts[1], pts[0]);
    const e2 = Vec3.subtract(new Vec3(), pts[2], pts[0]);
    const n = Vec3.cross(new Vec3(), e1, e2);
    if (n.lengthSqr() < 1e-16) {
      return;
    }
    n.normalize();
    const du1 = uvs[1][0] - uvs[0][0];
    const dv1 = uvs[1][1] - uvs[0][1];
    const du2 = uvs[2][0] - uvs[0][0];
    const dv2 = uvs[2][1] - uvs[0][1];
    const det = du1 * dv2 - du2 * dv1;
    const t = new Vec3();
    const b = new Vec3();
    if (Math.abs(det) < 1e-12) {
      t.set(e1).normalize();
      Vec3.cross(b, n, t);
    } else {
      t.set((e1.x * dv2 - e2.x * dv1) / det, (e1.y * dv2 - e2.y * dv1) / det, (e1.z * dv2 - e2.z * dv1) / det);
      b.set((e2.x * du1 - e1.x * du2) / det, (e2.y * du1 - e1.y * du2) / det, (e2.z * du1 - e1.z * du2) / det);
    }
    t.subtract(_c.set(n).multiplyScalar(Vec3.dot(t, n)));
    if (t.lengthSqr() < 1e-14) {
      t.set(e1);
    }
    t.normalize();
    const w = Vec3.dot(Vec3.cross(_c, n, t), b) < 0 ? -1 : 1;
    const base = this.count();
    for (let i = 0; i < pts.length; i += 1) {
      this.positions.push(pts[i].x, pts[i].y, pts[i].z);
      this.normals.push(n.x, n.y, n.z);
      this.tangents.push(t.x, t.y, t.z, w);
      this.uvs.push(uvs[i][0], uvs[i][1]);
      this.colors.push(tint[0], tint[1], tint[2], 1);
    }
    for (let i = 1; i < pts.length - 1; i += 1) {
      this.indices.push(base, base + i, base + i + 1);
      this.triangles += 1;
    }
  }

  /** 面的真实法线(方向按 hint 取正)。poly 的 hint 既定绕序又当法线用,斜面要给准。 */
  private faceNormal(a: Vec3, b: Vec3, c: Vec3, hint: Vec3): Vec3 {
    const n = Vec3.cross(new Vec3(), Vec3.subtract(_a, b, a), Vec3.subtract(_b, c, a));
    if (n.lengthSqr() < 1e-14) {
      return hint.clone();
    }
    n.normalize();
    if (Vec3.dot(n, hint) < 0) {
      n.multiplyScalar(-1);
    }
    return n;
  }
}
