import { Mat4, Vec3 } from 'cc';
import { fbm3 } from './G3DFieldTex';
import type { Tint } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import { distToPath } from './G3DWildTex';
import type { WildPlan } from './G3DWildTex';

/**
 * 野外小样的场景:枯木林里一处废弃的营地(雨后的夜里)。全部是代码拼的网格。
 *
 * 可以走的范围和地宫小样一样大(24 × 12 米),四周不是墙,是残墙、木栅、乱石和枯树围出来的;
 * 再往外是一圈起伏的泥地、更多的枯树,最远处是一圈画在弧面上的林子剪影,靠雾接到天上。
 * 枯树没有叶子:主干和枝都是真的管子,镜头怎么转都不会露出「纸片」。
 */

export interface WildScene {
  stone: Sculpt;      // 砌石:残墙、塔角
  rock: Sculpt;       // 整块的石头:乱石、立石、篝火的石圈
  bark: Sculpt;       // 枯树、原木、枯灌木
  endgrain: Sculpt;   // 原木两头的截面(年轮)
  wood: Sculpt;       // 木料:木栅、车、灯杆
  iron: Sculpt;
  canvas: Sculpt;     // 帐篷
  grass: Sculpt;      // 枯草(一根根细片)
  coal: Sculpt;       // 篝火的炭(发光)
  pane: Sculpt;       // 提灯的玻璃(发光)
  /** 挡路的东西(主角、怪、镜头都认)。 */
  solids: Array<{ x: number; z: number; hx: number; hz: number; h: number }>;
  fires: Array<{ x: number; z: number }>;
  lanterns: Array<{ x: number; y: number; z: number }>;
  plan: WildPlan;
}

const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);

/** 地面那张大贴图管的范围(比可走的范围大一圈:围着场地的残墙、枯树也站在它上面)。 */
export const WILD_GROUND = { x0: -17, z0: -11, w: 34, d: 22 };
/** 场地外面那一圈坡地:沿场地四条边转一圈(u,0~1),再整体往外放大(v,0~1:里圈接着中间的地面,外圈放大到 3.4 倍、抬高成缓坡)。 */
export function skirtPoint(u: number, v: number, out: Vec3): void {
  const hw = WILD_GROUND.w / 2;
  const hd = WILD_GROUND.d / 2;
  const per = 2 * (WILD_GROUND.w + WILD_GROUND.d);
  let d = u * per;
  let bx = 0;
  let bz = 0;
  if (d < WILD_GROUND.w) {
    bx = -hw + d;
    bz = -hd;
  } else if ((d -= WILD_GROUND.w) < WILD_GROUND.d) {
    bx = hw;
    bz = -hd + d;
  } else if ((d -= WILD_GROUND.d) < WILD_GROUND.w) {
    bx = hw - d;
    bz = hd;
  } else {
    d -= WILD_GROUND.w;
    bx = -hw;
    bz = hd - d;
  }
  const k = 1 + v * 2.4;
  const bump = Math.sin(u * 37) * 0.35 + Math.sin(u * 91 + 1.3) * 0.2;
  out.set(bx * k, v === 0 ? -0.01 : 3.6 * v ** 1.5 + bump * v * 2.2, bz * k);
}

/** 坡地上某一点有多高(场地里面是 0)。 */
export function skirtY(x: number, z: number): number {
  const hw = WILD_GROUND.w / 2;
  const hd = WILD_GROUND.d / 2;
  const k = Math.max(Math.abs(x) / hw, Math.abs(z) / hd);
  if (k <= 1) {
    return 0;
  }
  const v = Math.min(1, (k - 1) / 2.4);
  const bx = x / k;
  const bz = z / k;
  let d = 0;
  if (Math.abs(bz + hd) < 1e-3) {
    d = bx + hw;
  } else if (Math.abs(bx - hw) < 1e-3) {
    d = WILD_GROUND.w + bz + hd;
  } else if (Math.abs(bz - hd) < 1e-3) {
    d = WILD_GROUND.w + WILD_GROUND.d + hw - bx;
  } else {
    d = 2 * WILD_GROUND.w + WILD_GROUND.d + hd - bz;
  }
  const u = d / (2 * (WILD_GROUND.w + WILD_GROUND.d));
  const bump = Math.sin(u * 37) * 0.35 + Math.sin(u * 91 + 1.3) * 0.2;
  return 3.6 * v ** 1.5 + bump * v * 2.2;
}

/** 月亮在哪个方向照过来(从右后方斜着照:影子拖得长)。 */
export const WILD_MOON = new Vec3(0.42, -0.62, 0.5).normalize();


// ───────────────────────── 石头 ─────────────────────────
interface Ico { v: number[][]; f: number[][] }
const ICOS: Ico[] = [];

/** 细分过的二十面体(单位球):level 1 = 80 个面,2 = 320 个面。 */
function ico(level: number): Ico {
  if (ICOS[level]) {
    return ICOS[level];
  }
  const t = (1 + Math.sqrt(5)) / 2;
  const unit = (p: number[]): number[] => {
    const l = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / l, p[1] / l, p[2] / l];
  };
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(unit);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let l = 0; l < level; l += 1) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let i = cache.get(key);
      if (i === undefined) {
        i = v.length;
        v.push(unit([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
        cache.set(key, i);
      }
      return i;
    };
    const nf: number[][] = [];
    for (const [a, b, c] of f) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  v = v.slice();
  ICOS[level] = { v, f };
  return ICOS[level];
}

/**
 * 一块石头:细分的球先往方块上靠(方头方脑),表面按噪声鼓一鼓、瘪一瘪,再被六七个随机的平面「劈」掉外面的部分 ——
 * 劈出来的是一个个大平面,平面之间是硬棱,其余地方是细碎的小面:像崩裂过的石块,不是圆疙瘩,也不是一眼看得出的多面体。
 * 朝上的面略亮、带一点苔色,朝下和贴地的面压暗。参数和 MeshBatch.rock 一样,可以直接替换。
 */
export function boulder(b: Sculpt, r: number, pos: Vec3, tint: Tint, den: number, rnd: () => number, squash = 0.6): void {
  const m = ico(r > 0.28 ? 2 : 1);
  const seed = Math.floor(rnd() * 900) + 1;
  const sx = 0.85 + rnd() * 0.45;
  const sz = 0.85 + rnd() * 0.45;
  const yaw = rnd() * 6.283;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const planes: number[][] = [];
  const n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i += 1) {
    const nx = rnd() * 2 - 1;
    const ny = (rnd() * 2 - 1) * 0.55;
    const nz = rnd() * 2 - 1;
    const l = Math.hypot(nx, ny, nz) || 1;
    planes.push([nx / l, ny / l, nz / l, 0.6 + rnd() * 0.3]);
  }
  {
    const nx = (rnd() - 0.5) * 0.35;
    const nz = (rnd() - 0.5) * 0.35;
    const l = Math.hypot(nx, 1, nz);
    planes.push([nx / l, 1 / l, nz / l, 0.55 + rnd() * 0.3]);      // 一刀近水平的:平顶
  }
  const pts: Vec3[] = m.v.map(([x, y, z]) => {
    const mx = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    let px = x + ((x / mx) * 0.84 - x) * 0.45;
    let py = y + ((y / mx) * 0.84 - y) * 0.45;
    let pz = z + ((z / mx) * 0.84 - z) * 0.45;
    const k = 0.8 + 0.42 * fbm3(x * 1.5 + seed, y * 1.5, z * 1.5, 3, seed) + 0.1 * fbm3(x * 5 + seed, y * 5, z * 5, 2, seed + 7);
    px *= k;
    py *= k;
    pz *= k;
    for (const [nx, ny, nz, off] of planes) {
      const d = px * nx + py * ny + pz * nz;
      if (d > off) {
        px -= nx * (d - off);
        py -= ny * (d - off);
        pz -= nz * (d - off);
      }
    }
    const X = px * sx;
    const Z = pz * sz;
    return new Vec3(pos.x + (X * cy - Z * sy) * r, pos.y + py * squash * r, pos.z + (X * sy + Z * cy) * r);
  });
  const e1 = new Vec3();
  const e2 = new Vec3();
  const nn = new Vec3();
  for (const [a, bb, c] of m.f) {
    Vec3.subtract(e1, pts[bb], pts[a]);
    Vec3.subtract(e2, pts[c], pts[a]);
    Vec3.cross(nn, e1, e2);
    const area = nn.length();
    if (area < 1e-7) {
      continue;
    }
    nn.multiplyScalar(1 / area);
    const up = nn.y;
    const low = Math.min(1, Math.max(0, (pts[a].y + pts[bb].y + pts[c].y) / 3 / Math.max(0.05, r * squash * 0.5)));
    const k = (0.72 + 0.28 * Math.max(0, up)) * (0.7 + 0.3 * low) * (0.92 + 0.16 * rnd());
    const moss = up > 0.55 ? (up - 0.55) * 0.9 : 0;
    const col: Tint = [tint[0] * k * (1 - 0.3 * moss), tint[1] * k * (1 - 0.12 * moss), tint[2] * k * (1 - 0.34 * moss)];
    // 贴图坐标:按这个面主要朝哪个方向,取另外两个坐标
    const ax = Math.abs(nn.x);
    const ay = Math.abs(nn.y);
    const az = Math.abs(nn.z);
    const uv = (p: Vec3): [number, number] => (ay >= ax && ay >= az ? [p.x * den, p.z * den] : ax >= az ? [p.z * den, p.y * den] : [p.x * den, p.y * den]);
    b.facet([pts[a], pts[bb], pts[c]], [uv(pts[a]), uv(pts[bb]), uv(pts[c])], col);
  }
}

/** 地面的布局(泥地贴图和场景几何都用它)。 */
export const WILD_PLAN: WildPlan = { ...WILD_GROUND, path: [[-17, 3.4], [-9, 2.2], [-2, 3.0], [5, 1.2], [11, -1.6], [17, -2.4]], pathHalf: 1.5, fires: [{ x: -2.6, z: 0.4, r: 1.5 }], wet: 0.62 };

export function buildWildScene(rnd: () => number, X0: number, X1: number, Z0: number, Z1: number, isWater: (x: number, z: number) => boolean): WildScene {
  const s: WildScene = {
    stone: new Sculpt(), rock: new Sculpt(), bark: new Sculpt(), endgrain: new Sculpt(), wood: new Sculpt(), iron: new Sculpt(), canvas: new Sculpt(), grass: new Sculpt(), coal: new Sculpt(), pane: new Sculpt(),
    solids: [], fires: [{ x: -2.6, z: 0.4 }], lanterns: [],
    plan: WILD_PLAN,
  };
  const R = (a: number, b: number): number => a + (b - a) * rnd();
  const solid = (x: number, z: number, hx: number, hz: number, h: number): void => {
    s.solids.push({ x, z, hx, hz, h });
  };

  // ── 残墙:一段墙 = 几块高矮不一的砌体(顶上是塌下来的豁口),墙脚堆着碎石 ──
  const wallRun = (x0: number, x1: number, z: number, heights: number[], thick: number, alongX = true): void => {
    const n = heights.length;
    for (let i = 0; i < n; i += 1) {
      const a = x0 + ((x1 - x0) * i) / n;
      const b = x0 + ((x1 - x0) * (i + 1)) / n;
      const h = heights[i];
      if (h <= 0.05) {
        continue;
      }
      const c = (a + b) / 2;
      const len = Math.abs(b - a) + 0.02;
      const tone = R(0.78, 0.98);
      const tint: Tint = [tone, tone, tone * 1.02];
      if (alongX) {
        s.stone.box(len, h, thick, V(c, h / 2, z), V(0, 0, 0), tint, 0.25, rnd, 0.03, 0);
        solid(c, z, len / 2, thick / 2, h);
      } else {
        s.stone.box(thick, h, len, V(z, h / 2, c), V(0, 0, 0), tint, 0.25, rnd, 0.03, 0);
        solid(z, c, thick / 2, len / 2, h);
      }
      // 墙脚放宽一圈;墙面上有几块石头凸出来一点;墙头压着一两块松动的石头
      const foot: Tint = [tone * 0.82, tone * 0.84, tone * 0.86];
      if (alongX) {
        s.stone.box(len + 0.06, 0.34, thick + 0.2, V(c, 0.17, z), V(0, 0, 0), foot, 0.25, rnd, 0.04, 0);
      } else {
        s.stone.box(thick + 0.2, 0.34, len + 0.06, V(z, 0.17, c), V(0, 0, 0), foot, 0.25, rnd, 0.04, 0);
      }
      for (let k = 0; k < Math.round(len * h * 0.7); k += 1) {
        const along = R(-len / 2 + 0.3, len / 2 - 0.3);
        const yy = R(0.6, Math.max(0.7, h - 0.3));
        const side = rnd() < 0.5 ? -1 : 1;
        const bw = R(0.3, 0.6);
        const bh = R(0.2, 0.32);
        const t2 = tone * R(0.86, 1.08);
        if (alongX) {
          s.stone.box(bw, bh, 0.1, V(c + along, yy, z + side * (thick / 2 + 0.02)), V(0, 0, 0), [t2, t2, t2 * 1.02], 0.25, rnd, 0.025);
        } else {
          s.stone.box(0.1, bh, bw, V(z + side * (thick / 2 + 0.02), yy, c + along), V(0, 0, 0), [t2, t2, t2 * 1.02], 0.25, rnd, 0.025);
        }
      }
      if (h > 1 && rnd() < 0.8) {
        const along = R(-len / 4, len / 4);
        const t2 = tone * R(0.8, 1.0);
        if (alongX) {
          s.stone.box(R(0.45, 0.8), 0.24, thick * 0.9, V(c + along, h + 0.1, z), V(R(-3, 3), R(-12, 12), R(-6, 6)), [t2, t2, t2 * 1.03], 0.25, rnd, 0.04);
        } else {
          s.stone.box(thick * 0.9, 0.24, R(0.45, 0.8), V(z, h + 0.1, c + along), V(R(-6, 6), R(-12, 12), R(-3, 3)), [t2, t2, t2 * 1.03], 0.25, rnd, 0.04);
        }
      }
      // 顶上掉下来的几块石头
      for (let k = 0; k < 2; k += 1) {
        const px = alongX ? c + R(-len / 2, len / 2) : z + R(0.5, 1.3) * (rnd() < 0.5 ? -1 : 1);
        const pz = alongX ? z + R(0.5, 1.3) * (rnd() < 0.5 ? -1 : 1) : c + R(-len / 2, len / 2);
        const r = R(0.12, 0.26);
        boulder(s.rock, r, V(px, r * 0.3, pz), [0.62, 0.63, 0.66], 0.7, rnd, 0.7);
      }
    }
  };
  // 北边:两段残墙,中间是一座塌了一半的拱门
  wallRun(-11.6, -5.4, Z0 - 0.5, [2.9, 3.3, 2.4, 2.8, 1.5, 0.9], 0.7);
  wallRun(-2.6, -1.5, Z0 - 0.5, [3.6], 0.9);            // 拱门的两个门墩
  wallRun(0.5, 1.6, Z0 - 0.5, [3.2], 0.9);
  s.stone.box(1.5, 0.55, 0.85, V(-1.55, 3.85, Z0 - 0.5), V(0, 0, 14), [0.84, 0.84, 0.88], 0.25, rnd, 0.03);     // 残存的半截拱
  s.stone.box(1.0, 0.5, 0.8, V(-0.6, 4.25, Z0 - 0.5), V(0, 0, 32), [0.8, 0.8, 0.84], 0.25, rnd, 0.03);
  solid(-0.5, Z0 - 0.2, 1.1, 0.25, 0.4);                 // 门洞里堆着塌下来的石头,过不去
  for (let i = 0; i < 7; i += 1) {
    const r = R(0.2, 0.42);
    boulder(s.rock, r, V(R(-1.4, 0.4), r * 0.4, Z0 - 0.5 + R(-0.5, 0.5)), [0.6, 0.61, 0.64], 0.7, rnd, 0.75);
  }
  wallRun(3.4, 8.2, Z0 - 0.5, [1.1, 1.9, 2.6, 1.4], 0.7);
  // 东北角:一座塌了的角楼,剩两面墙
  wallRun(9.2, 12.6, Z0 - 0.6, [3.4, 4.6, 5.2], 0.8);
  wallRun(Z0 - 0.4, -2.6, X1 + 0.5, [5.0, 4.2, 2.6, 1.3], 0.8, false);
  // 东边剩下的一段矮墙
  wallRun(0.6, 3.6, X1 + 0.5, [0.8, 1.4, 1.0], 0.7, false);

  // ── 乱石:南边和西边靠它围着 ──
  const boulders = (x: number, z: number, n: number, big: number): void => {
    for (let i = 0; i < n; i += 1) {
      const r = i === 0 ? big : R(big * 0.3, big * 0.7);
      const px = x + (i === 0 ? 0 : R(-big * 1.4, big * 1.4));
      const pz = z + (i === 0 ? 0 : R(-big * 1.1, big * 1.1));
      const tone = R(0.5, 0.7);
      boulder(s.rock, r, V(px, r * 0.32, pz), [tone, tone * 1.01, tone * 1.05], 0.7, rnd, i === 0 ? 0.85 : 0.7);
      if (r > 0.45) {
        solid(px, pz, r * 0.8, r * 0.8, r * 1.2);
      }
    }
  };
  boulders(-12.6, -3.2, 4, 1.1);
  boulders(-12.9, 4.6, 5, 1.3);
  boulders(-4.5, Z1 + 0.9, 4, 0.9);
  boulders(6.2, Z1 + 0.8, 5, 1.2);
  boulders(12.7, 4.9, 4, 1.0);
  boulders(5.2, -4.6, 3, 0.55);
  boulders(-5.6, 4.7, 3, 0.5);
  // 一块立着的界石
  s.rock.prism([[0.34, 0.1], [0.12, 0.3], [-0.3, 0.2], [-0.36, -0.12], [-0.05, -0.3], [0.3, -0.16]], 0, 2.5, 0.55, [[0.6, 0.62, 0.66], [0.5, 0.52, 0.56]], 0.6, xform([8.9, 0, -4.2], [3, 24, -4]));
  solid(8.9, -4.2, 0.36, 0.3, 2.5);

  // ── 木栅:一排削尖的原木桩(南边两段、西边一段),有几根歪了、倒了 ──
  const stakes = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 0.34);
    for (let i = 0; i <= n; i += 1) {
      if (rnd() < 0.1) {
        continue;
      }
      const k = i / n;
      const x = x0 + (x1 - x0) * k + R(-0.04, 0.04);
      const z = z0 + (z1 - z0) * k + R(-0.04, 0.04);
      const h = R(1.9, 2.5);
      const r = R(0.11, 0.15);
      const lean = rnd() < 0.15 ? R(8, 22) : R(-3, 3);
      const tone = R(0.55, 0.8);
      s.wood.cylinder(r * 0.9, r, h, 7, V(x, h / 2 - 0.05, z), V(lean, R(0, 360), R(-3, 3)), [tone, tone * 0.96, tone * 0.9], 0.9, rnd, 0);
      s.wood.cylinder(0.01, r * 0.9, 0.3, 7, V(x, h + 0.08, z), V(lean, 0, 0), [tone * 0.9, tone * 0.85, tone * 0.8], 0.9, rnd, undefined, false);
    }
    s.wood.cylinder(0.06, 0.06, len, 6, V((x0 + x1) / 2, 1.3, (z0 + z1) / 2 + 0.14), V(0, (Math.atan2(-(z1 - z0), x1 - x0) * 180) / Math.PI, 90), [0.5, 0.47, 0.44], 0.9, rnd);
    solid((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.15, Math.abs(z1 - z0) / 2 + 0.15, 2.2);
  };
  stakes(-11.4, Z1 + 0.5, -6.2, Z1 + 0.5);
  stakes(-2.6, Z1 + 0.55, 4.2, Z1 + 0.5);
  stakes(8.4, Z1 + 0.5, 11.4, Z1 + 0.5);
  stakes(X0 - 0.5, -1.6, X0 - 0.5, 2.9);

  // ── 枯树:主干是一根弯弯曲曲、往上收细的管子,根部鼓出来;枝往外上方岔,枝上再岔小枝 ──
  const tree = (x: number, z: number, h: number, r0: number, seed: number, isSolid: boolean, y0 = 0): void => {
    const rr = (a: number, b: number): number => a + (b - a) * rnd();
    const lean = [rr(-0.14, 0.14), rr(-0.14, 0.14)];
    const wob = [rr(0, 6.28), rr(0, 6.28)];
    const at = (t: number): Vec3 => V(x + lean[0] * h * t + Math.sin(wob[0] + t * 4) * 0.12 * h * 0.1 * t, y0 + h * t, z + lean[1] * h * t + Math.cos(wob[1] + t * 3.3) * 0.12 * h * 0.1 * t);
    const trunk: Vec3[] = [];
    for (let i = 0; i <= 9; i += 1) {
      trunk.push(at(i / 9));
    }
    trunk[0].y = y0 - 0.15;
    const tone = rr(0.5, 0.72);
    const tint: Tint = [tone, tone * 0.97, tone * 0.93];
    s.bark.tube(trunk, (t) => r0 * (1 - 0.82 * t) * (1 + 0.8 * Math.max(0, 1 - t * 9) ** 2), 9, { tint, den: 0.5 });
    // 几条露出地面的根
    for (let i = 0; i < 4; i += 1) {
      const a = rr(0, 6.28);
      const len = r0 * rr(2.2, 3.6);
      s.bark.tube([V(x + Math.cos(a) * r0 * 0.5, y0 + 0.28, z + Math.sin(a) * r0 * 0.5), V(x + Math.cos(a) * len * 0.5, y0 + 0.1, z + Math.sin(a) * len * 0.5), V(x + Math.cos(a) * len, y0 - 0.06, z + Math.sin(a) * len)],
        (t) => r0 * 0.34 * (1 - 0.75 * t), 6, { tint, den: 0.5 });
    }
    const limb = (base: Vec3, dir: Vec3, len: number, rad: number, depth: number): void => {
      const pts: Vec3[] = [base.clone()];
      const d = dir.clone();
      const p = base.clone();
      const steps = 4;
      for (let i = 0; i < steps; i += 1) {
        d.x += rr(-0.22, 0.22);
        d.z += rr(-0.22, 0.22);
        d.y += rr(0.02, 0.2);                 // 枝梢慢慢往上翘
        d.normalize();
        p.add3f(d.x * (len / steps), d.y * (len / steps), d.z * (len / steps));
        pts.push(p.clone());
        if (depth > 0 && i >= 1 && rnd() < 0.8) {
          const side = V(d.z + rr(-0.5, 0.5), rr(0.1, 0.7), -d.x + rr(-0.5, 0.5)).normalize();
          if (rnd() < 0.5) {
            side.x = -side.x;
            side.z = -side.z;
          }
          limb(p.clone(), side, len * rr(0.4, 0.62), rad * 0.5, depth - 1);
        }
      }
      s.bark.tube(pts, (t) => Math.max(0.006, rad * (1 - 0.86 * t)), depth > 0 ? 6 : 4, { tint, den: 0.6 });
    };
    const n = 5 + Math.floor(rr(0, 4));
    for (let i = 0; i < n; i += 1) {
      const t = 0.36 + (0.6 * (i + rr(0, 0.6))) / n;
      const a = seed * 1.7 + i * 2.4 + rr(-0.4, 0.4);
      const up = 0.25 + 0.6 * t;
      limb(at(t), V(Math.cos(a), up, Math.sin(a)).normalize(), h * (0.42 - 0.2 * t) * rr(0.8, 1.25), r0 * (1 - 0.8 * t) * 0.62, 2);
    }
    if (isSolid) {
      solid(x, z, r0 * 1.2, r0 * 1.2, h);
    }
  };
  // 场地里三棵、围着场地一圈、再往外一圈大的
  tree(-9.4, -3.9, 6.4, 0.34, 1, true);
  tree(9.7, 3.6, 7.2, 0.38, 2, true);
  tree(1.4, 4.9, 5.6, 0.28, 3, true);
  const ring: Array<[number, number]> = [[-14.2, -7.6], [-8.6, -8.4], [-3.4, -8.9], [2.6, -8.3], [7.2, -8.8], [14.4, -7.9], [15.2, -1.4], [14.8, 6.2], [9.8, 8.4], [3.2, 8.9], [-2.4, 8.2], [-8.8, 8.6], [-14.6, 7.2], [-15.6, 0.8]];
  ring.forEach(([x, z], i) => tree(x + R(-0.6, 0.6), z + R(-0.5, 0.5), R(6.5, 9.5), R(0.32, 0.5), 10 + i, false));
  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * Math.PI * 2 + R(-0.12, 0.12);
    const rad = R(20, 27);
    const tx = Math.cos(a) * rad * 1.15;
    const tz = Math.sin(a) * rad * 0.8;
    tree(tx, tz, R(8, 12), R(0.4, 0.6), 40 + i, false, skirtY(tx, tz) - 0.1);
  }
  // 原木:略弯、一头粗一头细,两头是带年轮的截面,身上留着一两截断枝
  const log = (x: number, y: number, z: number, len: number, r: number, yaw: number, tone: number): void => {
    const ca = Math.cos((yaw * Math.PI) / 180);
    const sa = -Math.sin((yaw * Math.PI) / 180);
    const bend = R(-0.05, 0.05) * len;
    const ph = R(0, 6.28);
    const pts: Vec3[] = [];
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      const off = (t - 0.5) * len;
      const b = Math.sin(t * Math.PI) * bend;
      pts.push(V(x + ca * off - sa * b, y + Math.sin(t * Math.PI) * 0.02, z + sa * off + ca * b));
    }
    const rad = (t: number): number => r * (1 - 0.14 * t) * (1 + 0.05 * Math.sin(t * 11 + ph));
    const tint: Tint = [tone, tone * 0.96, tone * 0.91];
    s.bark.tube(pts, rad, 11, { tint, den: 0.5 });
    for (const e of [0, 1]) {
      const rr = rad(e) * 0.99;
      s.endgrain.cylinder(rr, rr, 0.02, 14, pts[e ? 6 : 0], V(0, yaw, 90), [0.8, 0.74, 0.66], 0.5 / rr, rnd);
    }
    for (let i = 0; i < 2; i += 1) {
      const t = R(0.2, 0.8);
      const p = pts[Math.round(t * 6)];
      const a = R(0, 6.28);
      const up = R(0.3, 0.9);
      s.bark.tube([p.clone(), V(p.x - sa * Math.cos(a) * 0.3 * r * 2, p.y + up * r * 2.2, p.z + ca * Math.cos(a) * 0.3 * r * 2)], (tt) => r * 0.26 * (1 - 0.3 * tt), 6, { tint, den: 0.6 });
    }
  };
  // 倒在地上的一根枯木(挡在木栅的缺口上)
  log(6.6, 0.3, Z1 + 0.45, 4.2, 0.32, 6, 0.6);
  solid(6.6, Z1 + 0.4, 2.1, 0.35, 0.6);

  // ── 篝火:一圈石头、几根架起来的柴、底下一层炭;旁边两根当凳子的原木 ──
  for (const f of s.fires) {
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + R(-0.1, 0.1);
      const r = R(0.13, 0.2);
      boulder(s.rock, r, V(f.x + Math.cos(a) * 0.62, r * 0.4, f.z + Math.sin(a) * 0.62), [0.42, 0.42, 0.44], 0.8, rnd, 0.8);
    }
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      s.bark.cylinder(0.05, 0.065, 0.95, 6, V(f.x + Math.cos(a) * 0.2, 0.3, f.z + Math.sin(a) * 0.2), V(58 * Math.cos(a + 1.57), 0, 58 * Math.sin(a + 1.57)), [0.3, 0.26, 0.24], 0.9, rnd);
    }
    s.coal.cylinder(0.4, 0.44, 0.07, 12, V(f.x, 0.05, f.z), V(0, 0, 0), [1, 1, 1], 1, rnd);
    solid(f.x, f.z, 0.55, 0.55, 0.5);
    log(f.x - 0.2, 0.2, f.z + 1.75, 1.8, 0.21, 12, 0.6);
    solid(f.x - 0.2, f.z + 1.75, 0.85, 0.24, 0.42);
    log(f.x - 1.75, 0.18, f.z - 0.3, 1.5, 0.19, 96, 0.56);
    solid(f.x - 1.75, f.z - 0.3, 0.24, 0.7, 0.4);
    // 三脚架吊着一口铁锅
    const apex = V(f.x, 1.75, f.z);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      s.wood.tube([V(f.x + Math.cos(a) * 0.82, 0, f.z + Math.sin(a) * 0.82), V(f.x - Math.cos(a) * 0.05, 1.86, f.z - Math.sin(a) * 0.05)], 0.028, 6, { tint: [0.5, 0.45, 0.4], den: 0.9 });
    }
    s.iron.cylinder(0.006, 0.006, 0.72, 4, V(apex.x, 1.38, apex.z), V(0, 0, 0), [0.4, 0.4, 0.42], 1.6, rnd);
    s.iron.lathe([[0.0, 0], [0.13, 0.015], [0.2, 0.09], [0.215, 0.19], [0.19, 0.27], [0.2, 0.29], [0.17, 0.285]], 14, { xf: xform([f.x, 0.74, f.z]), tint: [0.32, 0.32, 0.34], den: 1.6 });
  }

  // ── 营地的零碎:木箱、木桶、麻袋、铺盖卷、靠在墙上的长矛 ──
  const crate = (x: number, z: number, sz: number, yaw: number, y0 = 0): void => {
    const h = sz * 0.8;
    const ca = Math.cos((yaw * Math.PI) / 180);
    const sa = -Math.sin((yaw * Math.PI) / 180);
    const tone = R(0.5, 0.68);
    s.wood.box(sz, h, sz, V(x, y0 + h / 2, z), V(0, yaw, 0), [tone, tone * 0.93, tone * 0.85], 0.9, rnd, 0.01, y0);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = (ox * sz) / 2;
      const pz = (oz * sz) / 2;
      s.wood.box(0.07, h + 0.02, 0.07, V(x + ca * px - sa * pz, y0 + h / 2, z + sa * px + ca * pz), V(0, yaw, 0), [tone * 0.72, tone * 0.66, tone * 0.6], 0.9, rnd, 0.008);
    }
    for (const oz of [-1, 1]) {
      const pz = (oz * sz) / 2;
      s.wood.box(sz + 0.04, 0.06, 0.035, V(x - sa * pz, y0 + h - 0.05, z + ca * pz), V(0, yaw, 0), [tone * 0.72, tone * 0.66, tone * 0.6], 0.9, rnd, 0.006);
      s.wood.box(sz + 0.04, 0.06, 0.035, V(x - sa * pz, y0 + 0.05, z + ca * pz), V(0, yaw, 0), [tone * 0.72, tone * 0.66, tone * 0.6], 0.9, rnd, 0.006);
    }
    if (y0 === 0) {
      solid(x, z, sz / 2 + 0.05, sz / 2 + 0.05, h);
    }
  };
  const barrel = (x: number, z: number, k = 1): void => {
    const tone = R(0.48, 0.62);
    s.wood.lathe([[0.0, 0], [0.24 * k, 0], [0.3 * k, 0.24 * k], [0.315 * k, 0.45 * k], [0.3 * k, 0.66 * k], [0.24 * k, 0.9 * k], [0.21 * k, 0.87 * k], [0.0, 0.87 * k]], 14,
      { xf: xform([x, 0, z], [0, R(0, 360), 0]), tint: [tone, tone * 0.92, tone * 0.82], den: 0.9, smooth: false });
    for (const [yy, rr] of [[0.2, 0.298], [0.7, 0.298]]) {
      s.iron.cylinder(rr * k, rr * k, 0.045 * k, 16, V(x, yy * k, z), V(0, 0, 0), [0.4, 0.4, 0.42], 1.6, rnd, undefined, false);
    }
    solid(x, z, 0.3 * k, 0.3 * k, 0.9 * k);
  };
  const sack = (x: number, z: number, k: number): void => {
    const tone = R(0.42, 0.56);
    s.canvas.ball(0.27 * k, 0.19 * k, 0.22 * k, [x, 0.17 * k, z], 9, { tint: [tone, tone * 0.95, tone * 0.85], den: 2.4 });
  };
  crate(3.9, -5.1, 0.7, 14);
  crate(4.75, -5.2, 0.6, -8);
  crate(4.3, -5.15, 0.5, 30, 0.56);
  barrel(1.0, -5.3);
  barrel(0.45, -4.9, 0.85);
  barrel(-9.9, 5.0);
  sack(3.4, -4.4, 1);
  sack(3.05, -4.75, 0.85);
  sack(-8.0, -4.9, 1);
  sack(-7.65, -5.2, 0.8);
  crate(-10.6, 4.4, 0.62, 20);
  // 铺盖卷(帐篷里各一个)
  s.canvas.cylinder(0.12, 0.12, 0.85, 9, V(2.5, 0.13, -4.3), V(0, 62, 90), [0.5, 0.42, 0.36], 0.8, rnd);
  s.canvas.cylinder(0.11, 0.11, 0.75, 9, V(-6.8, 0.12, -4.5), V(0, 118, 90), [0.4, 0.42, 0.46], 0.8, rnd);
  // 靠在残墙上的三杆长矛
  for (let i = 0; i < 3; i += 1) {
    const x = -8.2 + i * 0.28;
    s.wood.cylinder(0.018, 0.02, 2.3, 6, V(x, 1.1, Z0 + 0.12 + i * 0.03), V(-14 - i * 2, 0, R(-3, 3)), [0.5, 0.45, 0.4], 0.9, rnd, 0);
    s.iron.cylinder(0.002, 0.03, 0.26, 6, V(x, 2.33, Z0 - 0.17 - i * 0.045), V(-14 - i * 2, 0, 0), [0.6, 0.6, 0.63], 1.6, rnd, undefined, false);
  }

  // ── 枯灌木:一丛往外散开的细枝,枝上再岔一截(围在场地边上,把木栅、乱石之间的空当填上)──
  const bush = (x: number, z: number, k: number, y0 = 0): void => {
    const n = 9 + Math.floor(R(0, 7));
    const tone = R(0.36, 0.5);
    const tint: Tint = [tone, tone * 0.93, tone * 0.86];
    for (let i = 0; i < n; i += 1) {
      const a = R(0, 6.28);
      const out = R(0.2, 0.6) * k;
      const h = R(0.45, 1.15) * k;
      const p0 = V(x + Math.cos(a) * 0.05, y0 - 0.02, z + Math.sin(a) * 0.05);
      const p1 = V(x + Math.cos(a) * out * 0.5, y0 + h * 0.55, z + Math.sin(a) * out * 0.5);
      const a2 = a + R(-0.6, 0.6);
      const p2 = V(x + Math.cos(a2) * out, y0 + h, z + Math.sin(a2) * out);
      s.bark.tube([p0, p1, p2], (t) => 0.016 * k * (1 - 0.75 * t), 4, { tint, den: 0.6 });
      const a3 = a + (rnd() < 0.5 ? 1 : -1) * R(0.7, 1.4);
      s.bark.tube([p1.clone(), V(p1.x + Math.cos(a3) * 0.28 * k, p1.y + R(0.15, 0.4) * k, p1.z + Math.sin(a3) * 0.28 * k)], (t) => 0.008 * k * (1 - 0.6 * t), 3, { tint, den: 0.6 });
    }
  };
  for (let i = 0; i < 54; i += 1) {
    const x = R(WILD_GROUND.x0 + 0.6, WILD_GROUND.x0 + WILD_GROUND.w - 0.6);
    const z = R(WILD_GROUND.z0 + 0.6, WILD_GROUND.z0 + WILD_GROUND.d - 0.6);
    const inside = x > X0 + 0.6 && x < X1 - 0.6 && z > Z0 + 0.6 && z < Z1 - 0.6;
    if (inside || isWater(x, z)) {
      continue;
    }
    bush(x, z, R(0.8, 1.5));
  }
  bush(-10.8, -4.9, 1.0);
  bush(10.6, 5.0, 1.1);
  bush(-3.6, 5.3, 0.9);

  // ── 场地外的坡地:散着石头和枯灌木(原来是一整片光秃秃的暗色)──
  for (let i = 0; i < 110; i += 1) {
    const a = R(0, Math.PI * 2);
    const k = R(1.04, 2.3);
    const x = Math.cos(a) * WILD_GROUND.w * 0.5 * k * R(0.8, 1.15);
    const z = Math.sin(a) * WILD_GROUND.d * 0.5 * k * R(0.8, 1.15);
    const y = skirtY(x, z);
    if (y <= 0.001) {
      continue;
    }
    if (i % 3 === 0) {
      const r = R(0.25, 0.95);
      const tone = R(0.42, 0.6);
      boulder(s.rock, r, V(x, y + r * 0.2, z), [tone, tone * 1.01, tone * 1.05], 0.7, rnd, 0.75);
    } else {
      bush(x, z, R(1.0, 1.9), y);
    }
  }

  // ── 地上的零碎:小石子、掉下来的枯枝(泥地上原来太干净)──
  for (let i = 0; i < 90; i += 1) {
    const x = R(WILD_GROUND.x0 + 1, WILD_GROUND.x0 + WILD_GROUND.w - 1);
    const z = R(WILD_GROUND.z0 + 1, WILD_GROUND.z0 + WILD_GROUND.d - 1);
    if (isWater(x, z) || Math.hypot(x - s.fires[0].x, z - s.fires[0].z) < 1.6) {
      continue;
    }
    const r = R(0.05, 0.14);
    const tone = R(0.45, 0.66);
    boulder(s.rock, r, V(x, r * 0.25, z), [tone, tone * 1.01, tone * 1.04], 0.9, rnd, 0.7);
  }
  for (let i = 0; i < 26; i += 1) {
    const x = R(WILD_GROUND.x0 + 1.5, WILD_GROUND.x0 + WILD_GROUND.w - 1.5);
    const z = R(WILD_GROUND.z0 + 1.5, WILD_GROUND.z0 + WILD_GROUND.d - 1.5);
    if (isWater(x, z) || distToPath(x, z, s.plan.path) < s.plan.pathHalf * 0.7 || Math.hypot(x - s.fires[0].x, z - s.fires[0].z) < 2.2) {
      continue;
    }
    const a = R(0, 6.28);
    const len = R(0.7, 2.0);
    const r = R(0.022, 0.045);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const tone = R(0.4, 0.56);
    const tint: Tint = [tone, tone * 0.94, tone * 0.88];
    const mx = x + dx * len * 0.5 - dz * R(-0.12, 0.12);
    const mz = z + dz * len * 0.5 + dx * R(-0.12, 0.12);
    s.bark.tube([V(x, r, z), V(mx, r * 1.4, mz), V(x + dx * len, r * 0.8, z + dz * len)], (t) => r * (1 - 0.6 * t), 5, { tint, den: 0.6 });
    const fa = a + (rnd() < 0.5 ? 0.6 : -0.6);
    s.bark.tube([V(mx, r * 1.4, mz), V(mx + Math.cos(fa) * len * 0.35, r * 2.2, mz + Math.sin(fa) * len * 0.35)], (t) => r * 0.6 * (1 - 0.6 * t), 4, { tint, den: 0.6 });
  }

  // ── 墙上的枯藤:从墙脚往上爬的细藤,一路左右晃,分出几条短须 ──
  const vine = (x: number, z: number, top: number, alongX: boolean): void => {
    const pts: Vec3[] = [];
    let off = 0;
    const n = 7;
    for (let i = 0; i <= n; i += 1) {
      off += R(-0.16, 0.16);
      const y = (top * i) / n;
      pts.push(alongX ? V(x + off, y, z) : V(x, y, z + off));
    }
    const tint: Tint = [0.3, 0.27, 0.24];
    s.bark.tube(pts, (t) => 0.018 * (1 - 0.7 * t), 4, { tint, den: 0.6 });
    for (let i = 2; i < n; i += 2) {
      const p = pts[i];
      const side = rnd() < 0.5 ? -1 : 1;
      const l = R(0.25, 0.6);
      const q = alongX ? V(p.x + side * l, p.y + R(0.1, 0.35), p.z) : V(p.x, p.y + R(0.1, 0.35), p.z + side * l);
      s.bark.tube([p.clone(), q], (t) => 0.009 * (1 - 0.6 * t), 3, { tint, den: 0.6 });
    }
  };
  for (const vx of [-11.0, -9.8, -8.6, -7.2, 5.6, 6.6, 10.2, 11.4]) {
    vine(vx, Z0 - 0.5 + 0.38, R(1.0, 2.4), true);
  }
  vine(-2.05, Z0 - 0.5 + 0.48, 2.8, true);
  vine(1.05, Z0 - 0.5 + 0.48, 2.4, true);
  for (const vz of [-5.4, -4.4, -3.4]) {
    vine(X1 + 0.5 - 0.43, vz, R(1.6, 3.4), false);
  }

  // ── 帐篷:一根脊杆撑起来的旧帆布,两头敞着,布面往下垂 ──
  const tent = (x: number, z: number, yaw: number, len: number, w: number, h: number): void => {
    const m = xform([x, 0, z], [0, yaw, 0]);
    for (const side of [-1, 1]) {
      s.canvas.surf(8, 6, (u, v, out) => {
        const along = (u - 0.5) * len;
        const down = v;                       // 0 = 脊,1 = 落地
        const sag = Math.sin(v * Math.PI) * 0.2 * (0.5 + Math.sin(u * Math.PI)) + Math.sin(u * 9 + side) * 0.03 * v;
        out.set(along, h * (1 - down) - sag + 0.02, side * (w / 2) * down);
      }, { xf: m, tint: (u: number, v: number) => { const t = 0.4 + 0.2 * v + 0.08 * Math.sin(u * 23 + v * 7); return [t, t * 0.96, t * 0.9] as Tint; }, den: 2.4, twoSided: true, flip: side < 0 });
    }
    s.wood.cylinder(0.04, 0.04, len + 0.3, 6, V(x, h + 0.02, z), V(0, yaw, 90), [0.55, 0.5, 0.45], 0.9, rnd);
    for (const e of [-1, 1]) {
      const ex = x + Math.cos((yaw * Math.PI) / 180) * e * (len / 2);
      const ez = z - Math.sin((yaw * Math.PI) / 180) * e * (len / 2);
      s.wood.cylinder(0.045, 0.05, h + 0.1, 6, V(ex, (h + 0.1) / 2, ez), V(0, 0, 0), [0.55, 0.5, 0.45], 0.9, rnd, 0);
    }
    // 两头各一根拉绳斜拉到地钉上;一头是封死的山墙,另一头是两片半掩的门帘
    const ca = Math.cos((yaw * Math.PI) / 180);
    const sa = -Math.sin((yaw * Math.PI) / 180);
    const W2 = (lx: number, ly: number, lz: number): Vec3 => V(x + ca * lx - sa * lz, ly, z + sa * lx + ca * lz);
    const cloth = (pts: Vec3[], tone: number): void => {
      const t: Tint = [tone, tone * 0.96, tone * 0.9];
      s.canvas.facet(pts, [[0, 0], [1.5, 0], [0.75, 2]], t);
      s.canvas.facet([pts[2], pts[1], pts[0]], [[0.75, 2], [1.5, 0], [0, 0]], t);
    };
    for (const e of [-1, 1]) {
      const ex = e * (len / 2);
      s.wood.tube([W2(ex, h + 0.04, 0), W2(ex + e * 1.2, 0.06, 0)], 0.007, 4, { tint: [0.62, 0.56, 0.46], den: 2 });
      s.wood.cylinder(0.018, 0.012, 0.3, 5, W2(ex + e * 1.25, 0.1, 0), V(0, yaw, e * 28), [0.5, 0.45, 0.4], 0.9, rnd);
      for (const sd of [-1, 1]) {
        s.wood.cylinder(0.016, 0.01, 0.24, 5, W2(ex * 0.8, 0.06, sd * (w / 2 + 0.06)), V(sd * 24, 0, 0), [0.5, 0.45, 0.4], 0.9, rnd);
      }
    }
    cloth([W2(-len / 2 - 0.01, 0, -w / 2), W2(-len / 2 - 0.01, 0, w / 2), W2(-len / 2 - 0.01, h, 0)], 0.36);
    cloth([W2(len / 2 + 0.01, 0, -w / 2), W2(len / 2 + 0.06, 0, -w * 0.12), W2(len / 2 + 0.01, h, 0)], 0.46);
    cloth([W2(len / 2 + 0.01, 0, w / 2), W2(len / 2 + 0.1, 0, w * 0.2), W2(len / 2 + 0.01, h, 0)], 0.44);
    solid(x, z, len / 2, w / 2, h);
  };
  tent(2.4, -4.2, 62, 2.6, 2.2, 1.55);
  tent(-6.8, -4.4, 118, 2.2, 2.0, 1.4);

  // ── 一辆坏掉的板车:车板斜着支在地上,一只轮子掉在旁边 ──
  {
    const cx = -8.6;
    const cz = 4.3;
    s.wood.box(2.3, 0.1, 1.2, V(cx, 0.62, cz), V(0, 20, -9), [0.62, 0.56, 0.5], 0.9, rnd, 0.01);
    for (const side of [-1, 1]) {
      s.wood.box(2.3, 0.34, 0.06, V(cx + side * 0.2, 0.82, cz + side * 0.57), V(0, 20, -9), [0.56, 0.5, 0.44], 0.9, rnd, 0.01);
    }
    // 车轮:一圈木轮辋、八根辐条、中间的轮毂(一只还装在车上,一只掉在旁边的地上)
    const wheel = (pos: [number, number, number], rot: [number, number, number]): void => {
      const m: Mat4 = xform(pos, rot);
      const P = (lx: number, ly: number, lz: number): Vec3 => Vec3.transformMat4(new Vec3(), V(lx, ly, lz), m);
      const rim: Vec3[] = [];
      for (let i = 0; i <= 20; i += 1) {
        const a = (i / 20) * Math.PI * 2;
        rim.push(P(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52));
      }
      s.wood.tube(rim, 0.05, 6, { tint: [0.48, 0.43, 0.38], den: 0.9 });
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        s.wood.tube([P(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08), P(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5)], 0.024, 5, { tint: [0.52, 0.47, 0.41], den: 0.9 });
      }
      s.wood.tube([P(0, -0.09, 0), P(0, 0.09, 0)], 0.1, 10, { tint: [0.44, 0.4, 0.36], den: 0.9 });
      s.iron.tube([P(0, -0.11, 0), P(0, 0.11, 0)], 0.045, 8, { tint: [0.5, 0.5, 0.52], den: 1.6 });
    };
    wheel([cx + 0.5, 0.56, cz - 0.82], [90, 20, 0]);
    wheel([cx + 1.7, 0.07, cz + 1.3], [4, 0, 6]);
    s.wood.cylinder(0.04, 0.045, 2.0, 6, V(cx - 1.9, 0.3, cz - 0.4), V(0, 24, 74), [0.56, 0.5, 0.44], 0.9, rnd);
    solid(cx, cz, 1.25, 0.8, 0.9);
  }

  // ── 提灯:一根木杆、一条横臂,挂着一只铁皮灯(四面玻璃发光)──
  const lantern = (x: number, z: number, yaw: number): void => {
    const ca = Math.cos((yaw * Math.PI) / 180);
    const sa = -Math.sin((yaw * Math.PI) / 180);
    s.wood.cylinder(0.06, 0.08, 2.9, 7, V(x, 1.4, z), V(R(-2, 2), 0, R(-2, 2)), [0.56, 0.5, 0.44], 0.9, rnd, 0);
    s.wood.cylinder(0.035, 0.04, 0.8, 6, V(x + ca * 0.36, 2.68, z + sa * 0.36), V(0, yaw, 90), [0.56, 0.5, 0.44], 0.9, rnd);
    const lx = x + ca * 0.68;
    const lz = z + sa * 0.68;
    s.iron.cylinder(0.006, 0.006, 0.28, 4, V(lx, 2.53, lz), V(0, 0, 0), [0.5, 0.5, 0.52], 1.6, rnd);
    s.iron.box(0.2, 0.03, 0.2, V(lx, 2.4, lz), V(0, yaw, 0), [0.45, 0.45, 0.47], 1.6, rnd, 0.005);
    s.iron.box(0.2, 0.03, 0.2, V(lx, 2.12, lz), V(0, yaw, 0), [0.45, 0.45, 0.47], 1.6, rnd, 0.005);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      s.iron.box(0.016, 0.26, 0.016, V(lx + ox * 0.09, 2.26, lz + oz * 0.09), V(0, 0, 0), [0.45, 0.45, 0.47], 1.6, rnd, 0);
    }
    s.pane.box(0.15, 0.22, 0.15, V(lx, 2.26, lz), V(0, yaw, 0), [1, 1, 1], 1, rnd, 0);
    s.lanterns.push({ x: lx, y: 2.26, z: lz });
    solid(x, z, 0.12, 0.12, 2.9);
  };
  lantern(-6.2, -2.4, 30);
  lantern(6.6, 2.9, 200);
  lantern(-0.6, 4.7, -70);

  // ── 枯草:一丛一丛的细片(每根两节,往外倒),长在不积水、不在路上的地方 ──
  const blade = (x: number, z: number, h: number, a: number, bend: number, tone: number): void => {
    const w = 0.007 + h * 0.011;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * w;
    const pz = dx * w;
    const m1 = V(x + dx * bend * 0.35, h * 0.55, z + dz * bend * 0.35);
    const tip = V(x + dx * bend, h, z + dz * bend);
    const c0: Tint = [0.34 * tone, 0.31 * tone, 0.19 * tone];
    const c1: Tint = [0.74 * tone, 0.67 * tone, 0.42 * tone];
    const quadA = [V(x - px, 0, z - pz), V(x + px, 0, z + pz), V(m1.x + px * 0.7, m1.y, m1.z + pz * 0.7), V(m1.x - px * 0.7, m1.y, m1.z - pz * 0.7)];
    s.grass.facet(quadA, [[0, 0], [1, 0], [1, 0.5], [0, 0.5]], c0);
    s.grass.facet([quadA[3], quadA[2], quadA[1], quadA[0]], [[0, 0.5], [1, 0.5], [1, 0], [0, 0]], c0);
    const tri = [V(m1.x - px * 0.7, m1.y, m1.z - pz * 0.7), V(m1.x + px * 0.7, m1.y, m1.z + pz * 0.7), tip];
    s.grass.facet(tri, [[0, 0.5], [1, 0.5], [0.5, 1]], c1);
    s.grass.facet([tri[2], tri[1], tri[0]], [[0.5, 1], [1, 0.5], [0, 0.5]], c1);
  };
  const tuft = (x: number, z: number, k: number): void => {
    const n = 9 + Math.floor(R(0, 9));
    for (let i = 0; i < n; i += 1) {
      const a = R(0, 6.28);
      const rr = R(0, 0.16) * k;
      blade(x + Math.cos(a) * rr, z + Math.sin(a) * rr, R(0.22, 0.62) * k, a + R(-0.6, 0.6), R(0.05, 0.3) * k, R(0.7, 1.1));
    }
  };
  for (let i = 0; i < 900; i += 1) {
    const x = R(WILD_GROUND.x0 + 0.5, WILD_GROUND.x0 + WILD_GROUND.w - 0.5);
    const z = R(WILD_GROUND.z0 + 0.5, WILD_GROUND.z0 + WILD_GROUND.d - 0.5);
    const inside = x > X0 && x < X1 && z > Z0 && z < Z1;
    // 场地中间稀、边上密;篝火边不长
    const edge = Math.min(x - X0, X1 - x, z - Z0, Z1 - z);
    if (inside && rnd() > 0.28 + 0.5 * Math.max(0, 1 - edge / 3)) {
      continue;
    }
    if (Math.hypot(x - s.fires[0].x, z - s.fires[0].z) < 2.4 || distToPath(x, z, s.plan.path) < s.plan.pathHalf + 0.2 || isWater(x, z)) {
      continue;
    }
    tuft(x, z, inside ? R(0.7, 1.0) : R(0.9, 1.5));
  }
  // 芦苇:长在水边(这一格是水、旁边不是),比草高,一小撮一小撮
  let reeds = 0;
  for (let i = 0; i < 2600 && reeds < 90; i += 1) {
    const x = R(WILD_GROUND.x0 + 0.5, WILD_GROUND.x0 + WILD_GROUND.w - 0.5);
    const z = R(WILD_GROUND.z0 + 0.5, WILD_GROUND.z0 + WILD_GROUND.d - 0.5);
    if (!isWater(x, z) || (isWater(x + 0.3, z) && isWater(x - 0.3, z) && isWater(x, z + 0.3) && isWater(x, z - 0.3))) {
      continue;
    }
    if (distToPath(x, z, s.plan.path) < s.plan.pathHalf || Math.hypot(x - s.fires[0].x, z - s.fires[0].z) < 2.6) {
      continue;
    }
    reeds += 1;
    const n = 5 + Math.floor(R(0, 6));
    for (let k = 0; k < n; k += 1) {
      const a = R(0, 6.28);
      blade(x + Math.cos(a) * R(0, 0.12), z + Math.sin(a) * R(0, 0.12), R(0.55, 1.15), a, R(0.03, 0.22), R(0.62, 0.9));
    }
  }
  return s;
}
