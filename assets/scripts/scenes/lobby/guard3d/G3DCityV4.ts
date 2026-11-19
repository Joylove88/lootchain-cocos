import { Vec3 } from 'cc';
import { CITY_GROUND, CITY_PLAN, CITY_V4, CityScene } from './G3DCity';
import { CITY_V4_DATA as D } from './G3DCityV4Data';
import { xform } from './G3DSculpt';

/**
 * 主城 v4(预渲染 2.5D 第 1 期,2026-11-19 用户「Build v4」):3D 小样地址带 &cityv4=1 时生效(同时当整城模式)。
 * 布局全部来自 tools/proto3d/pre25/city_plan_v4.py 导出的 G3DCityV4Data.ts:主轴西南门 → 主桥 → 桥头集市 → 罗盘广场 → 大台阶 → 上城大教堂;
 * 下城(河 / 港湾)— 中城 — 上城(+3 米挡土墙);弯河、三座桥、不规则城墙。中心广场(铁匠铺 / 水井 / 摊位 / 罗盘纹)沿用 G3DCity 现成的。
 * 坐标同 3D 场景:X 往东、Z 往南(北 = -Z),米;yaw = 正面朝向(0 = 朝南 +Z,90 = 朝东 +X,-90 = 朝西,180 = 朝北)。
 */

type Tint = [number, number, number];
type P2 = readonly [number, number] | readonly number[];
const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);

function unRle(r: { w: number; h: number; rle: readonly number[] }): Uint8Array {
  const out = new Uint8Array(r.w * r.h);
  let k = 0;
  for (let i = 0; i < r.rle.length; i += 2) {
    out.fill(r.rle[i], k, k + r.rle[i + 1]);
    k += r.rle[i + 1];
  }
  return out;
}
const [BX0, BZ0, BX1, BZ1] = D.bounds;
let heightGrid: Uint8Array | null = null;
let surfGrid: Uint8Array | null = null;

/** 地面高度(米):地面 0、上城 3、台阶 / 坡道线性(按布局导出的 0.5 米格,双线性)。 */
export function v4Height(x: number, z: number): number {
  const g = D.height;
  heightGrid = heightGrid ?? unRle(g);
  const fx = (x - BX0) * g.res - 0.5;
  const fz = (z - BZ0) * g.res - 0.5;
  const i = Math.max(0, Math.min(g.w - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(g.h - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i));
  const v = Math.max(0, Math.min(1, fz - j));
  const at = (a: number, b: number): number => heightGrid![b * g.w + a] / 10;
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}

/** 地面类别:0 碎石 / 土,1 石板街 / 广场,2 花园草地,3 水。 */
export function v4Surface(x: number, z: number): number {
  const g = D.surface;
  surfGrid = surfGrid ?? unRle(g);
  const i = Math.floor((x - BX0) * g.res);
  const j = Math.floor((z - BZ0) * g.res);
  if (i < 0 || j < 0 || i >= g.w || j >= g.h) {
    return 0;
  }
  return surfGrid[j * g.w + i];
}

export function inPoly(x: number, z: number, poly: readonly P2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i] as [number, number];
    const [xj, zj] = poly[j] as [number, number];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      c = !c;
    }
  }
  return c;
}
export const V4_UPPER_H = D.upperH;
/** 上城顶面(地面网格 skip 用):(x, z) 不在上城多边形里 → true。 */
/**
 * 草坪程度(0 ~ 1):周围 ±0.5 米 9 个点里有几成是草坪 / 花园(城墙外不算)。地面网格按它 = 0.5 切成草坪 / 街两种材质(11-20)。
 */
export function v4LawnField(x: number, z: number): number {
  if (!inPoly(x, z, D.wall)) {
    return 0;
  }
  let n = 0;
  for (const dx of [-0.5, 0, 0.5]) {
    for (const dz of [-0.5, 0, 0.5]) {
      const k = v4Surface(x + dx, z + dz);
      if (k === 0 || k === 2) {
        n += 1;
      }
    }
  }
  return n / 9;
}

export function v4OffUpper(x: number, z: number): boolean {
  return !inPoly(x, z, D.upper);
}

/**
 * 地面上色(乘到石板贴图上,按顶点插值 → 边缘是柔的):街 / 广场原色偏亮,碎石 / 土地偏暖褐、花园偏暗绿。
 * 每个顶点取周围 ±0.75 米 9 个点的平均(11-19:按格子硬切的话边是 0.5 米一级的锯齿)。
 */
const TINT: Record<number, Tint> = { 0: [0.5, 0.64, 0.32], 1: [1.2, 1.07, 0.86], 2: [0.44, 0.62, 0.28], 3: [0.5, 0.64, 0.32] };          // 11-19 参考图:空地是草坪、街是沙土色          // 暖砂岩石板 / 暖土 / 鲜一点的草地
export function v4GroundTint(x: number, z: number): Tint {
  if (!inPoly(x, z, D.wall)) {
    return [0.42, 0.42, 0.44];          // 城墙外:压暗(预渲染的角上会拍到一点)
  }
  const o: Tint = [0, 0, 0];
  for (const dx of [-0.75, 0, 0.75]) {
    for (const dz of [-0.75, 0, 0.75]) {
      const t = TINT[v4Surface(x + dx, z + dz)] ?? TINT[0];
      o[0] += t[0] / 9;
      o[1] += t[1] / 9;
      o[2] += t[2] / 9;
    }
  }
  return o;
}

/** 要在建场景之前调:地面扩到整城、打开 v4 开关、登记树(带树根高度)。 */
export function applyCityV4Ground(): void {
  const m = 12;
  const g = { x0: BX0 - m, z0: BZ0 - m, w: BX1 - BX0 + 2 * m, d: BZ1 - BZ0 + 2 * m };
  Object.assign(CITY_GROUND, g);
  Object.assign(CITY_PLAN, g);
  CITY_V4.on = true;
  CITY_PLAN.wet = 0;          // 11-20:燕云口径的干地(0.3 时满地暗色湿斑像霉点)
  //          // 整城 26 万平米:原来 0.72 的积水在俯视全城时成了满地白斑
  let n = 0;
  const all = [...D.avenue, ...D.trees] as Array<readonly number[]>;
  CITY_V4.trees = all.map(([x, z]) => [x, z, 7.6 + ((n++ * 37) % 10) * 0.28, v4Height(x, z)] as [number, number, number, number]);
  CITY_PLAN.trees = [...CITY_PLAN.trees, ...all.map(([x, z]) => [x, z] as [number, number])];
}

/** 折线上离 (x, z) 最近的点和那里的切线。 */
function nearest(pts: readonly P2[], x: number, z: number): { x: number; z: number; tx: number; tz: number; d: number } {
  let best = { x: 0, z: 0, tx: 1, tz: 0, d: 1e9 };
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [ax, az] = pts[i] as [number, number];
    const [bx, bz] = pts[i + 1] as [number, number];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) {
      const l = Math.sqrt(l2);
      best = { x: px, z: pz, tx: dx / l, tz: dz / l, d };
    }
  }
  return best;
}
const deg = (r: number): number => (r * 180) / Math.PI;

export function extendCityV4(s: CityScene, rnd: () => number): void {
  const spots = s.bldSpots;
  const R = (a: number, b: number): number => a + (b - a) * rnd();
  // ── 中心广场那份布局:四周的民房去掉(v4 的房子按新布局摆),大教堂挪到主轴尽头的上城 ──
  for (let i = spots.length - 1; i >= 0; i -= 1) {
    if (/^house/.test(spots[i].key)) {
      spots.splice(i, 1);
    }
  }
  const spot = (key: string, id: string, x: number, z: number, yaw: number, w: number, d: number, o: { h?: number; y?: number; far?: boolean } = {}): void => {
    spots.push({ key, id, x, z, yaw, w, d, y: o.y ?? v4Height(x, z), h: o.h, far: o.far });
  };
  const STONE: Tint = [0.62, 0.62, 0.66];
  const STONE_D: Tint = [0.46, 0.46, 0.5];
  const TOP: Tint = [0.78, 0.78, 0.82];
  const H = D.upperH;

  // ── 重要建筑 ──
  // KEYS: [名字, NPC, x, z, 宽, 进深, 平面图里的画法角度];3D 的朝向按「正面朝着哪条街 / 广场」定
  const KEY_MODEL: Record<string, [string, number]> = {
    圣辉大教堂: ['cathedral', -45], 帝国学院: ['academy', 0], 佣兵公会: ['guild', 0], 金麦酒馆: ['tavern', -90],
    马厩: ['stable', -90], 王都兵营: ['barracks', 0], 贵族宅邸: ['guild', 0], 港口仓库: ['barracks', 0],
  };
  let kn = 0;
  for (const k of D.keys as unknown as Array<[string, string, number, number, number, number, number]>) {
    const [name, , x, z, w, dd] = k;
    const [model, yaw] = KEY_MODEL[name];
    if (model === 'cathedral') {
      const c = spots.find((sp) => sp.id === 'cathedral');
      if (c) {
        Object.assign(c, { x, z, yaw, y: H });
        continue;
      }
    }
    spot(model, `${model}_v4_${kn++}`, x, z, yaw, w * (model === 'guild' && name === '贵族宅邸' ? 0.9 : 1), dd);
  }

  // ── 民居:朝最近的那条街 ──
  let hn = 0;
  for (const h of D.houses as unknown as Array<{ x: number; z: number; w: number; d: number; model: string }>) {
    let best = { x: h.x, z: h.z + 1, d: 1e9 } as { x: number; z: number; d: number };
    for (const r of D.roads) {
      const n = nearest(r.pts, h.x, h.z);
      if (n.d - r.w / 2 < best.d) {
        best = { x: n.x, z: n.z, d: n.d - r.w / 2 };
      }
    }
    const yaw = deg(Math.atan2(best.x - h.x, best.z - h.z));
    const W: Record<string, number> = { house: 7, house_b: 10.5, house_c: 5.5, house_d: 8 };
    spot(h.model, `${h.model}_v4_${hn++}`, h.x, h.z, yaw, Math.min(h.w, W[h.model] ?? h.w), h.d);
  }

  // ── 上城挡土墙 + 墙顶栏墙(台阶 / 坡道顶上留口)──
  const openings = [...D.stairs.map((st) => [st[2][0], st[2][1], st[3]]), [D.ramp[2][0], D.ramp[2][1], D.ramp[3]]] as Array<[number, number, number]>;
  const up = D.upper as unknown as Array<[number, number]>;
  for (let i = 0; i < up.length; i += 1) {
    const [ax, az] = up[i];
    const [bx, bz] = up[(i + 1) % up.length];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2));
    const ang = deg(Math.atan2(bz - az, bx - ax));
    for (let k = 0; k < n; k += 1) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const seg = len / n + 0.06;
      // 只有外沿(下面是地面)才砌挡土墙:城墙那一侧(外面是城外)也砌,看着是城墙内的高台
      s.rubble.box(seg, H + 0.02, 1.0, V(x, H / 2, z), V(0, -ang, 0), [0.4, 0.4, 0.43], 0.4, rnd, 0.03);
      s.stone.box(seg, 0.12, 1.15, V(x, H + 0.06, z), V(0, -ang, 0), TOP, 0.5, rnd, 0.02);
      const open = openings.some(([ox, oz, ow]) => Math.hypot(x - ox, z - oz) < ow / 2 + 0.8);
      if (!open && v4Height(x, z) > H - 0.5) {
        s.stone.box(seg, 0.85, 0.45, V(x, H + 0.12 + 0.42, z), V(0, -ang, 0), STONE, 0.5, rnd, 0.02);
        s.stone.box(seg + 0.02, 0.1, 0.6, V(x, H + 0.12 + 0.9, z), V(0, -ang, 0), TOP, 0.5, rnd, 0.02);
      }
    }
  }

  // ── 台阶(15 厘米一级,下面是实的)+ 两边的阶梯栏墙;大台阶两头带灯的石柱 ──
  for (const st of D.stairs as unknown as Array<[string, [number, number], [number, number], number]>) {
    const [name, b0, b1, w] = st;
    const dx = b1[0] - b0[0];
    const dz = b1[1] - b0[1];
    const L = Math.hypot(dx, dz);
    const ux = dx / L;
    const uz = dz / L;
    const ang = deg(Math.atan2(ux, uz));          // 台阶的进深方向
    const N = Math.round(H / 0.15);
    for (let i = 0; i < N; i += 1) {
      const t0 = i / N;
      const run = L * (1 - t0);
      const cx = b0[0] + ux * (L * t0 + run / 2);
      const cz = b0[1] + uz * (L * t0 + run / 2);
      const tint: Tint = i % 2 ? [0.6, 0.6, 0.64] : [0.55, 0.55, 0.6];
      s.stone.box(w, 0.15, run, V(cx, 0.15 * i + 0.075, cz), V(0, ang, 0), tint, 0.5, rnd, 0.02);
      s.stone.box(w, 0.03, 0.06, V(b0[0] + ux * L * t0, 0.15 * (i + 1) - 0.015, b0[1] + uz * L * t0), V(0, ang, 0), TOP, 0.5, rnd, 0.005);
    }
    for (const side of [-1, 1]) {
      const ox = -uz * side * (w / 2 + 0.3);
      const oz = ux * side * (w / 2 + 0.3);
      for (let i = 0; i < N; i += 2) {
        const t0 = i / N;
        const t1 = Math.min(1, (i + 2) / N);
        const top = 0.15 * (i + 2) + 0.85;
        const cx = b0[0] + ux * L * (t0 + t1) / 2 + ox;
        const cz = b0[1] + uz * L * (t0 + t1) / 2 + oz;
        s.rubble.box(0.6, top, L * (t1 - t0) + 0.02, V(cx, top / 2, cz), V(0, ang, 0), [0.4, 0.4, 0.43], 0.4, rnd, 0.03);
        s.stone.box(0.72, 0.1, L * (t1 - t0) + 0.04, V(cx, top + 0.05, cz), V(0, ang, 0), TOP, 0.5, rnd, 0.02);
      }
      if (name === '大台阶') {
        for (const t of [0, 1]) {
          const px = b0[0] + ux * L * t + ox * 1.15;
          const pz = b0[1] + uz * L * t + oz * 1.15;
          const y0 = t * H;
          s.stone.box(0.9, 1.7, 0.9, V(px, y0 + 0.85, pz), V(0, ang, 0), STONE, 0.5, rnd, 0.04);
          s.glass.box(0.3, 0.42, 0.3, V(px, y0 + 1.95, pz), V(0, 0, 0), [1, 1, 1], 1, rnd, 0);
          s.iron.box(0.4, 0.06, 0.4, V(px, y0 + 2.2, pz), V(0, 0, 0), [0.3, 0.3, 0.32], 1.6, rnd, 0.01);
          s.doorLamps.push({ x: px, y: y0 + 1.95, z: pz });
        }
      }
    }
  }

  // ── 盘山坡道:一段斜坡道(下面实的)+ 两边矮栏墙 ──
  {
    const [, b0, b1, w] = D.ramp as unknown as [string, [number, number], [number, number], number];
    const dx = b1[0] - b0[0];
    const dz = b1[1] - b0[1];
    const L = Math.hypot(dx, dz);
    const ux = dx / L;
    const uz = dz / L;
    const ang = deg(Math.atan2(ux, uz));
    const N = 16;
    for (let i = 0; i < N; i += 1) {
      const t = (i + 0.5) / N;
      const h = t * H;
      const hb = (i / N) * H;          // 实心部分只到这一截的低端,上面盖斜的石板面(不和斜面打架)
      const cx = b0[0] + ux * L * t;
      const cz = b0[1] + uz * L * t;
      if (hb > 0.01) {
        s.rubble.box(w + 1.2, hb, L / N + 0.04, V(cx, hb / 2, cz), V(0, ang, 0), [0.4, 0.4, 0.43], 0.4, rnd, 0.02);
      }
      // 斜坡面
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const px = -uz * (w / 2 + 0.6);
      const pz = ux * (w / 2 + 0.6);
      const a0 = [b0[0] + ux * L * t0, b0[1] + uz * L * t0];
      const a1 = [b0[0] + ux * L * t1, b0[1] + uz * L * t1];
      s.stone.facet([V(a0[0] - px, t0 * H + 0.01, a0[1] - pz), V(a0[0] + px, t0 * H + 0.01, a0[1] + pz), V(a1[0] + px, t1 * H + 0.01, a1[1] + pz), V(a1[0] - px, t1 * H + 0.01, a1[1] - pz)],
        [[0, 0], [1, 0], [1, 1], [0, 1]], [0.58, 0.58, 0.62]);
      for (const side of [-1, 1]) {
        s.stone.box(0.45, 0.7, L / N + 0.02, V(cx - uz * side * (w / 2 + 0.35), h + 0.35, cz + ux * side * (w / 2 + 0.35)), V(0, ang, 0), STONE, 0.5, rnd, 0.02);
      }
    }
    // 斜坡面:一整块斜的石板面(铺地材质在 G3DDungeon 里按 v4Height 抬,这里只给侧面)
  }

  // ── 河:水面 + 两岸石砌河堤(桥下断开);港湾 ──
  const water: Tint = [0.08, 0.15, 0.19];          // 11-20:压暗接近游戏里叠的动态水面(原来底图的水亮蓝,露在岸边成一条浅边)
  // 旧:          // 参考图:清的蓝灰,映着天          // 偏蓝绿、清一点(原来近乎黑)
  const RW = D.riverW;
  const rv = D.river as unknown as Array<[number, number]>;
  const bridges = D.bridges as unknown as Array<[number, number, number]>;
  const nearBridge = (x: number, z: number, pad: number): boolean => bridges.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < RW / 2 + pad);
  for (let i = 0; i + 1 < rv.length; i += 1) {
    const [ax, az] = rv[i];
    const [bx, bz] = rv[i + 1];
    const l = Math.hypot(bx - ax, bz - az) || 1e-6;
    const nx = -(bz - az) / l;
    const nz = (bx - ax) / l;
    const pa = i > 0 ? rv[i - 1] : rv[i];
    const pb = i + 2 < rv.length ? rv[i + 2] : rv[i + 1];
    const la = Math.hypot(bx - pa[0], bz - pa[1]) || 1;
    const lb = Math.hypot(pb[0] - ax, pb[1] - az) || 1;
    const na = [-(bz - pa[1]) / la, (bx - pa[0]) / la];
    const nb = [-(pb[1] - az) / lb, (pb[0] - ax) / lb];
    const hw = RW / 2;
    s.winDark.facet([V(ax - na[0] * hw, 0.04, az - na[1] * hw), V(ax + na[0] * hw, 0.04, az + na[1] * hw), V(bx + nb[0] * hw, 0.04, bz + nb[1] * hw), V(bx - nb[0] * hw, 0.04, bz - nb[1] * hw)],
      [[0, 0], [1, 0], [1, 1], [0, 1]], water);
    for (const side of [-1, 1]) {
      const cx = (ax + bx) / 2 + nx * side * (hw + 0.3);
      const cz = (az + bz) / 2 + nz * side * (hw + 0.3);
      if (nearBridge(cx, cz, 3.5)) {
        continue;
      }
      s.stone.box(l + 0.3, 0.6, 0.7, V(cx, 0.3, cz), V(0, -deg(Math.atan2(bz - az, bx - ax)), 0), [0.66, 0.66, 0.7], 0.9, rnd, 0.04);
    }
  }
  {
    const [hx, hz, rx, rz] = D.harbor as unknown as [number, number, number, number];
    const n = 28;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      s.winDark.facet([V(hx, 0.04, hz), V(hx + Math.cos(a1) * rx, 0.04, hz + Math.sin(a1) * rz), V(hx + Math.cos(a0) * rx, 0.04, hz + Math.sin(a0) * rz)], [[0.5, 0.5], [1, 0], [0, 0]], water);
      const am = (a0 + a1) / 2;
      const ex = hx + Math.cos(am) * (rx + 0.3);
      const ez = hz + Math.sin(am) * (rz + 0.3);
      if (nearest(rv, ex, ez).d > RW / 2 + 1) {
        const tl = Math.hypot(Math.cos(a1) * rx - Math.cos(a0) * rx, Math.sin(a1) * rz - Math.sin(a0) * rz);
        s.stone.box(tl + 0.3, 0.6, 0.7, V(ex, 0.3, ez), V(0, -deg(Math.atan2(Math.cos(am) * rz, -Math.sin(am) * rx)), 0), [0.66, 0.66, 0.7], 0.9, rnd, 0.04);
      }
    }
    spot('dock', 'dock_v4', hx - rx * 0.55, hz + rz * 0.5, 180, 10, 5, { y: 0 });
  }
  // 王都花园的池塘
  {
    const [px, pz, rx, rz] = D.pond as unknown as [number, number, number, number];
    const y = v4Height(px, pz) + 0.05;
    const n = 24;
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      s.winDark.facet([V(px, y, pz), V(px + Math.cos(a1) * rx, y, pz + Math.sin(a1) * rz), V(px + Math.cos(a0) * rx, y, pz + Math.sin(a0) * rz)], [[0.5, 0.5], [1, 0], [0, 0]], [0.08, 0.15, 0.18]);
      const am = (a0 + a1) / 2;
      s.stone.box(1.0, 0.3, 0.5, V(px + Math.cos(am) * (rx + 0.25), y + 0.1, pz + Math.sin(am) * (rz + 0.25)), V(0, -deg(am) + 90, 0), STONE, 0.5, rnd, 0.03);
    }
  }

  // ── 三座桥(桥模型两头切口离地约 2 米 × 缩放,整座下沉让桥头落到街面)──
  bridges.forEach(([x, z, w], i) => {
    const n = nearest(rv, x, z);
    const len = RW + (i === 0 ? 7 : 5);
    const yaw = 90 - deg(Math.atan2(n.tz, n.tx));
    spot('bridge', `bridge_v4_${i}`, n.x, n.z, yaw, len, w, { y: -1.95 * (len / 11) });
  });

  // ── 城墙一圈 + 角楼 + 两座城门(河穿墙的地方留水门)──
  const wall = D.wall as unknown as Array<[number, number]>;
  const cx0 = wall.reduce((a, p) => a + p[0], 0) / wall.length;
  const cz0 = wall.reduce((a, p) => a + p[1], 0) / wall.length;
  const gates = [D.gates.south, D.gates.east] as unknown as Array<[number, number]>;
  let wn = 0;
  for (let i = 0; i < wall.length; i += 1) {
    const [ax, az] = wall[i];
    const [bx, bz] = wall[(i + 1) % wall.length];
    const len = Math.hypot(bx - ax, bz - az);
    const cnt = Math.max(1, Math.round((len - 6) / 12));
    const step = (len - 6) / cnt;
    for (let k = 0; k < cnt; k += 1) {
      const t = (3 + step * (k + 0.5)) / len;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (gates.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 8.5) || nearest(rv, x, z).d < RW / 2 + 3) {
        continue;
      }
      const yaw = deg(Math.atan2(cx0 - x, cz0 - z));
      // 墙段的正面朝城里:取边的法线里朝城心的那个
      const ex = (bx - ax) / len;
      const ez = (bz - az) / len;
      let nx = -ez;
      let nz = ex;
      if (nx * (cx0 - x) + nz * (cz0 - z) < 0) {
        nx = -nx;
        nz = -nz;
      }
      spot('wall', `wall_v4_${wn++}`, x, z, deg(Math.atan2(nx, nz)) || yaw * 0, step + 0.3, 2.4, { y: 0 });
    }
    spot('wall_tower', `tower_v4_${i}`, ax, az, deg(Math.atan2(cx0 - ax, cz0 - az)), 7, 7, { y: 0 });
  }
  gates.forEach(([gx, gz], i) => {
    spot('gate', `gate_v4_${i}`, gx, gz, deg(Math.atan2(cx0 - gx, cz0 - gz)), 13, 6, { y: 0 });
  });

  // ── 桥头集市的摊位、广场主景(立像)、马场围栏 ──
  const mk = (D.plazas as unknown as Array<[string, [string, ...unknown[]]]>).find((p) => p[0] === '桥头集市');
  if (mk) {
    const pts = mk[1][1] as Array<[number, number]>;
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const mz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    [[-5, -3, 20], [1, -5, 35], [5, 1, 60], [-3, 4, 10]].forEach(([ox, oz, yw], i) => {
      spot('stall', `stall_v4_${i}`, mx + ox, mz + oz, yw, 3.6, 2.6, { h: 3.0 });
    });
  }
  for (const name of ['城门广场', '大教堂广场']) {
    const p = (D.plazas as unknown as Array<[string, [string, number, number, number]]>).find((q) => q[0] === name);
    if (p && p[1][0] === 'circle') {
      spot('statue', `statue_v4_${name}`, p[1][1], p[1][2], name === '城门广场' ? 45 : -135, 2, 2, { h: 4.4 });
    }
  }
  {
    const pd = D.paddock as unknown as Array<[number, number]>;
    for (let i = 0; i < pd.length; i += 1) {
      const [ax, az] = pd[i];
      const [bx, bz] = pd[(i + 1) % pd.length];
      const len = Math.hypot(bx - ax, bz - az);
      const ang = deg(Math.atan2(bz - az, bx - ax));
      for (let k = 0; k <= Math.round(len / 2.4); k += 1) {
        const t = k / Math.round(len / 2.4);
        s.timber.box(0.14, 1.1, 0.14, V(ax + (bx - ax) * t, 0.55, az + (bz - az) * t), V(0, 0, 0), [0.42, 0.37, 0.32], 0.9, rnd, 0.01);
      }
      for (const y of [0.5, 0.95]) {
        s.timber.box(len, 0.08, 0.06, V((ax + bx) / 2, y, (az + bz) / 2), V(0, -ang, 0), [0.46, 0.4, 0.34], 0.9, rnd, 0.005);
      }
    }
  }

  // ── 路灯:点位由 city_plan_v4.py 排(沿街每 18 米左右交替、离树至少 2.2 米)──
  let ln = 0;
  for (const [x, z] of ((D as unknown as { lamps?: Array<[number, number]> }).lamps ?? [])) {
    const y = v4Height(x, z);
    spot('lamp', `lamp_v4_${ln++}`, x, z, (ln * 90) % 360, 0.7, 0.7, { h: 4.4, y });
    s.lamps.push({ x, y: y + 3.9, z });
  }

  // ── 街景摆件(11-19 跑图:大片空地什么都没有;点位由 city_plan_v4.py 按街 / 房子 / 水避让着排)──
  const props = ((D as unknown as { props?: Array<[string, number, number, number]> }).props) ?? [];
  const TIMBER: Tint = [0.46, 0.4, 0.34];
  const GREENS_F: Tint[] = [[0.14, 0.25, 0.09], [0.18, 0.3, 0.1], [0.22, 0.33, 0.12]];
  const flowers = (cx: number, cy: number, cz: number, rx: number, rz: number, n: number): void => {
    const cols: Tint[] = [[0.5, 0.08, 0.06], [0.55, 0.2, 0.05], [0.42, 0.12, 0.3], [0.62, 0.6, 0.55], [0.15, 0.24, 0.1], [0.12, 0.2, 0.09]];
    for (let i = 0; i < n; i += 1) {
      const a = R(0, 6.28);
      const r = Math.sqrt(R(0, 1));
      const x = cx + Math.cos(a) * rx * r;
      const z = cz + Math.sin(a) * rz * r;
      const y = cy + R(0, 0.12);
      const sz = R(0.06, 0.12);
      const col = i % 3 === 0 ? cols[Math.floor(R(0, 4))] : cols[4 + (i % 2)];
      const q = [V(x - sz, y, z), V(x, y + sz * 0.5, z - sz), V(x + sz, y, z), V(x, y + sz * 0.5, z + sz)];
      s.leaf.facet(q, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
      s.leaf.facet([q[3], q[2], q[1], q[0]], [[0, 1], [1, 1], [1, 0], [0, 0]], col);
    }
  };
  // 叶子团(11-20 跑图:光滑圆球灌木像塑料):暗色内芯 + 表面撒一层小叶片,叶色深浅几种绿,朝上的亮一点
  const leafyBall = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number): void => {
    s.leaf.ball(rx * 0.9, ry * 0.9, rz * 0.9, [cx, cy, cz], 8, { tint: [0.06, 0.11, 0.05] });
    for (let i = 0; i < n; i += 1) {
      const u = R(-0.35, 1);
      const a = R(0, 6.28);
      const ny = u;
      const nr = Math.sqrt(Math.max(0, 1 - u * u));
      const nx = Math.cos(a) * nr;
      const nz = Math.sin(a) * nr;
      const px = cx + nx * rx * R(0.92, 1.05);
      const py = cy + ny * ry * R(0.92, 1.05);
      const pz = cz + nz * rz * R(0.92, 1.05);
      const sz = R(0.06, 0.1);
      const b = R(0.6, 0.9) + 0.25 * Math.max(0, ny);
      const g0 = rnd() < 0.5 ? [0.15, 0.27, 0.1] : rnd() < 0.7 ? [0.22, 0.35, 0.13] : [0.32, 0.42, 0.17];
      const col: Tint = [g0[0] * b, g0[1] * b, g0[2] * b];
      // 叶面大致贴着球面:取两条切向
      const t1 = V(-nz, 0, nx);
      if (t1.length() < 1e-3) {
        t1.set(1, 0, 0);
      }
      t1.normalize();
      const t2 = V(ny * nx, -(nx * nx + nz * nz), ny * nz);
      if (t2.length() < 1e-3) {
        t2.set(0, 0, 1);
      }
      t2.normalize();
      const sp = R(0, 6.28);
      const e1 = V(t1.x * Math.cos(sp) + t2.x * Math.sin(sp), t1.y * Math.cos(sp) + t2.y * Math.sin(sp), t1.z * Math.cos(sp) + t2.z * Math.sin(sp));
      const e2 = V(-t1.x * Math.sin(sp) + t2.x * Math.cos(sp), -t1.y * Math.sin(sp) + t2.y * Math.cos(sp), -t1.z * Math.sin(sp) + t2.z * Math.cos(sp));
      const q = [V(px - e1.x * sz, py - e1.y * sz, pz - e1.z * sz), V(px - e2.x * sz * 0.55, py - e2.y * sz * 0.55, pz - e2.z * sz * 0.55),
        V(px + e1.x * sz, py + e1.y * sz, pz + e1.z * sz), V(px + e2.x * sz * 0.55, py + e2.y * sz * 0.55, pz + e2.z * sz * 0.55)];
      s.leaf.facet(q, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
      s.leaf.facet([q[3], q[2], q[1], q[0]], [[0, 1], [1, 1], [1, 0], [0, 0]], col);
    }
  };
  for (const [kind, x, z, yaw] of props) {
    const y = v4Height(x, z);
    const ya = (yaw * Math.PI) / 180;
    const L = (lx: number, ly: number, lz: number): Vec3 => V(x + lx * Math.cos(ya) + lz * Math.sin(ya), y + ly, z - lx * Math.sin(ya) + lz * Math.cos(ya));
    const rot = V(0, yaw, 0);
    if (kind === 'bench') {
      s.timber.box(1.8, 0.07, 0.42, L(0, 0.46, 0), rot, TIMBER, 0.9, rnd, 0.01);
      s.timber.box(1.8, 0.36, 0.06, L(0, 0.72, -0.2), rot, TIMBER, 0.9, rnd, 0.01);
      for (const sd of [-0.72, 0.72]) {
        s.iron.box(0.08, 0.44, 0.42, L(sd, 0.22, 0), rot, [0.24, 0.24, 0.26], 1.6, rnd, 0.005);
      }
    } else if (kind === 'barrels' || kind === 'crates') {
      const spots: Array<[number, number]> = [[-0.45, 0.1], [0.35, -0.2], [0.1, 0.55]];
      spots.forEach(([lx, lz], i) => {
        if (kind === 'barrels') {
          const c = L(lx, 0.42, lz);
          s.timber.cylinder(0.3, 0.27, 0.84, 10, c, V(0, 0, 0), [0.42, 0.35, 0.28], 0.9, rnd);
          s.iron.cylinder(0.31, 0.31, 0.05, 10, V(c.x, y + 0.65, c.z), V(0, 0, 0), [0.22, 0.22, 0.24], 1.6, rnd);
          s.iron.cylinder(0.31, 0.31, 0.05, 10, V(c.x, y + 0.2, c.z), V(0, 0, 0), [0.22, 0.22, 0.24], 1.6, rnd);
        } else {
          const sz = i === 2 ? 0.55 : 0.7;
          s.timber.box(sz, sz, sz, L(lx, sz / 2, lz), V(0, yaw + i * 17, 0), [0.5, 0.43, 0.34], 0.9, rnd, 0.015);
          if (i === 0) {
            s.timber.box(0.5, 0.5, 0.5, L(lx, 0.7 + 0.25, lz), V(0, yaw + 30, 0), [0.48, 0.41, 0.33], 0.9, rnd, 0.015);
          }
        }
      });
    } else if (kind === 'cart') {
      s.timber.box(1.7, 0.12, 1.05, L(0, 0.7, 0), rot, TIMBER, 0.9, rnd, 0.01);
      for (const sd of [-0.55, 0.55]) {
        s.timber.box(1.7, 0.32, 0.06, L(0, 0.9, sd), rot, TIMBER, 0.9, rnd, 0.01);
        s.timber.cylinder(0.42, 0.42, 0.08, 12, L(0.2, 0.42, sd + Math.sign(sd) * 0.1), V(90, yaw, 0), [0.34, 0.29, 0.24], 0.9, rnd);
      }
      for (const sd of [-0.4, 0.4]) {
        s.timber.box(1.3, 0.06, 0.06, L(1.45, 0.62, sd), V(0, yaw, -10), TIMBER, 0.9, rnd, 0.005);
      }
      s.goods.box(0.9, 0.35, 0.7, L(-0.1, 0.94, 0), V(0, yaw + 8, 0), [0.52, 0.44, 0.26], 0.9, rnd, 0.05);
    } else if (kind === 'planter') {
      s.stone.box(1.4, 0.5, 0.55, L(0, 0.25, 0), rot, [0.56, 0.56, 0.6], 0.5, rnd, 0.03);
      s.goods.box(1.26, 0.06, 0.42, L(0, 0.49, 0), rot, [0.16, 0.12, 0.09], 0.9, rnd, 0);
      const c = L(0, 0.52, 0);
      flowers(c.x, c.y, c.z, 0.6, 0.6, 26);
    } else if (kind === 'flowerbed') {
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * 6.283;
        s.stone.box(0.62, 0.24, 0.26, V(x + Math.cos(a) * 1.05, y + 0.12, z + Math.sin(a) * 1.05), V(0, -(a * 180) / Math.PI + 90, 0), [0.6, 0.6, 0.64], 0.5, rnd, 0.03);
      }
      s.goods.cylinder(1.0, 1.0, 0.05, 14, V(x, y + 0.2, z), V(0, 0, 0), [0.14, 0.11, 0.08], 0.9, rnd);
      flowers(x, y + 0.24, z, 0.9, 0.9, 60);
    } else if (kind === 'hedge') {
      // 灌木丛:两三团压扁的圆球(11-19 跑图:方块绿篱像积木)
      for (let k = 0; k < 3; k += 1) {
        const c = L(-0.5 + k * 0.5 + R(-0.1, 0.1), 0.42 + R(0, 0.1), R(-0.15, 0.15));
        const g = R(0.8, 1.15);
        leafyBall(c.x, c.y, c.z, 0.5 * g, 0.42 * g, 0.42 * g, 150);
      }
      flowers(x, y + 0.75, z, 0.6, 0.3, 5);
    } else if (kind === 'shrub') {
      for (let k = 0; k < 2; k += 1) {
        const g = R(0.75, 1.1);
        const c = L(k * 0.45 - 0.2, 0.36 * g, R(-0.15, 0.15));
        leafyBall(c.x, c.y, c.z, 0.48 * g, 0.4 * g, 0.44 * g, 140);
      }
      if (rnd() < 0.4) {
        flowers(x, y + 0.6, z, 0.4, 0.3, 6);
      }
    } else if (kind === 'bush') {
      // 草坪点景(11-20 第四轮):大一点的灌木,中间一团高、两边两团矮
      for (let k = 0; k < 3; k += 1) {
        const g = k === 1 ? R(1.15, 1.4) : R(0.8, 1.05);
        const c = L((k - 1) * 0.62 + R(-0.12, 0.12), 0.4 * g, R(-0.2, 0.2));
        leafyBall(c.x, c.y, c.z, 0.55 * g, 0.48 * g, 0.5 * g, Math.round(170 * g));
      }
    } else if (kind === 'wildflowers') {
      // 草里的一片野花:每片一个主色(白 / 黄 / 淡紫 / 淡蓝)夹一点别的,花头小、贴着草尖,底下几片叶子
      const MAIN: Tint[] = [[0.86, 0.85, 0.8], [0.84, 0.7, 0.2], [0.6, 0.48, 0.74], [0.5, 0.6, 0.8], [0.82, 0.5, 0.56]];
      const main = MAIN[Math.floor(R(0, MAIN.length))];
      const n = 110 + Math.floor(R(0, 50));          // 要从游戏镜头看得出是一片花(太稀只是几个亮点)
      for (let i = 0; i < n; i += 1) {
        const a = R(0, 6.28);
        const rr = Math.sqrt(R(0, 1)) * R(0.7, 1.0);
        const fx = x + Math.cos(a) * rr;
        const fz = z + Math.sin(a) * rr * 0.8;
        const fy = y + R(0.07, 0.17);
        const leafy = i % 3 === 0;
        const sz = leafy ? R(0.06, 0.09) : R(0.04, 0.065);
        const b = R(0.85, 1.05);
        const col: Tint = leafy ? GREENS_F[Math.floor(R(0, GREENS_F.length))] : rnd() < 0.82 ? [main[0] * b, main[1] * b, main[2] * b] : MAIN[Math.floor(R(0, MAIN.length))];
        const ly = leafy ? fy - 0.05 : fy;
        const q = [V(fx - sz, ly, fz), V(fx, ly + sz * 0.3, fz - sz), V(fx + sz, ly, fz), V(fx, ly + sz * 0.3, fz + sz)];
        s.leaf.facet(q, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
        s.leaf.facet([q[3], q[2], q[1], q[0]], [[0, 1], [1, 1], [1, 0], [0, 0]], col);
      }
    } else if (kind === 'rocks') {
      // 草里半埋的两三块石头(灰里带一点青苔绿)
      const m = 2 + Math.floor(R(0, 2));
      for (let k = 0; k < m; k += 1) {
        const g = k === 0 ? R(0.45, 0.7) : R(0.2, 0.36);
        const c = L(k === 0 ? 0 : R(-0.7, 0.7), -g * 0.25, k === 0 ? 0 : R(-0.6, 0.6));
        const tone = R(0.46, 0.58);
        s.stone.ball(g * R(1.0, 1.35), g * R(0.6, 0.8), g * R(0.85, 1.1), [c.x, c.y, c.z], 7, { tint: [tone * 0.95, tone, tone * 0.9] });
      }
    } else if (kind === 'hay') {
      // 圆草捆横躺(11-20 跑图:竖着的黄圆柱像奶酪块),颜色压暗偏灰
      s.goods.cylinder(0.62, 0.62, 1.1, 16, V(x, y + 0.6, z), V(90, yaw, 0), [0.27, 0.23, 0.14], 0.95, rnd);
      s.goods.cylinder(0.5, 0.5, 0.95, 14, L(0.9, 0.5, 0.4), V(90, yaw + 70, 0), [0.25, 0.21, 0.13], 0.95, rnd);
    } else if (kind === 'fountain') {
      s.stone.lathe([[2.2, 0], [2.25, 0.5], [2.05, 0.62], [1.9, 0.62], [1.9, 0.18], [0, 0.18]], 28, { xf: xform([x, y, z]), tint: [0.62, 0.62, 0.66], den: 0.5, smooth: false });
      s.winDark.cylinder(1.88, 1.88, 0.02, 28, V(x, y + 0.48, z), V(0, 0, 0), [0.06, 0.09, 0.12], 1, rnd);
      s.stone.lathe([[0.35, 0], [0.3, 1.2], [0.85, 1.35], [0.9, 1.5], [0.2, 1.55], [0.18, 2.1], [0.32, 2.2], [0, 2.3]], 16, { xf: xform([x, y, z]), tint: [0.66, 0.66, 0.7], den: 0.5 });
    }
  }

  // ── 草丛(11-19 参考图:满地的草;11-20 用户「看起来像是一堆刺」)──
  // 原来每簇 3 片 5~9 厘米宽、直立的三角形 + 亮黄绿尖 = 一根根刺。改成:每 0.45 米一簇、每簇 7~10 片细草叶(1.6~2.8 厘米宽),
  // 从簇心往外弯(两段:下段偏直、上段往外倒),颜色贴着草坪(根部暗、尖上只亮一点),高矮不一 → 俯视是一团团软的草,不是竖着的刺
  const GREENS: Tint[] = [[0.15, 0.26, 0.09], [0.18, 0.3, 0.1], [0.22, 0.34, 0.12], [0.27, 0.37, 0.14]];
  // 疏密:约 3 米一格的平滑噪声(密的地方草簇大、叠两簇,稀的地方露草坪)—— 均匀撒点看起来像圆点花布
  const hs = (i: number, j: number): number => {
    const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const dens = (x: number, z: number): number => {
    const fx = x / 3.2;
    const fz = z / 3.2;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a0 = hs(i, j) + (hs(i + 1, j) - hs(i, j)) * su;
    const a1 = hs(i, j + 1) + (hs(i + 1, j + 1) - hs(i, j + 1)) * su;
    const n1 = a0 + (a1 - a0) * sv;
    const gx2 = x / 1.1;
    const gz2 = z / 1.1;
    const i2 = Math.floor(gx2);
    const j2 = Math.floor(gz2);
    const n2 = hs(i2 + 50, j2 + 50) * (1 - (gx2 - i2)) + hs(i2 + 51, j2 + 50) * (gx2 - i2);
    return Math.max(0, Math.min(1, n1 * 0.8 + n2 * 0.2));
  };
  // 第三版(11-20):少量高草簇俯视像刺 / 小扇子 → 改成大量又短又细的草叶铺满(像一层绒毛),密的地方长一点、多一点
  for (let gz = BZ0; gz < BZ1; gz += 0.28) {
    for (let gx = BX0; gx < BX1; gx += 0.28) {
      const x = gx + R(-0.13, 0.13);
      const z = gz + R(-0.13, 0.13);
      const dn = dens(x, z);
      if (rnd() > 0.45 + 0.7 * dn) {
        continue;
      }
      const k = v4Surface(x, z);
      if ((k !== 0 && k !== 2) || !inPoly(x, z, D.wall)) {
        continue;
      }
      const [ppx, ppz, prx, prz] = D.pond as unknown as [number, number, number, number];
      if (((x - ppx) / (prx + 0.7)) ** 2 + ((z - ppz) / (prz + 0.7)) ** 2 <= 1) {
        continue;          // 池塘里不长草
      }
      // 草地边上(靠近街)稀一点,别把路边吃成一条绿边
      if (k === 0 && (v4Surface(x + 0.6, z) === 1 || v4Surface(x - 0.6, z) === 1 || v4Surface(x, z + 0.6) === 1 || v4Surface(x, z - 0.6) === 1) && rnd() < 0.5) {
        continue;
      }
      const y = v4Height(x, z);
      const c0 = GREENS[Math.floor(R(0, GREENS.length))];
      const tall = R(0.75, 1.1) * (0.7 + 0.7 * dn) * (k === 2 ? 1.15 : 1);
      const nb = 5 + Math.floor(R(0, 3 + 3 * dn));
      const a0 = R(0, 6.28);
      for (let b = 0; b < nb; b += 1) {
        const a = a0 + (b / nb) * 6.28 + R(-0.5, 0.5);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const h = R(0.05, 0.12) * tall;
        const w = R(0.009, 0.015);
        const lean = h * R(0.3, 0.75);
        const r0 = R(0, 0.06);
        const bx = x + ca * r0;
        const bz = z + sa * r0;
        const p0 = V(bx - sa * w, y, bz + ca * w);
        const p1 = V(bx + sa * w, y, bz - ca * w);
        const tip = V(bx + ca * lean, y + h, bz + sa * lean);
        const v = R(0.78, 1.08);
        const col: Tint = [c0[0] * v, c0[1] * v, c0[2] * v];
        s.leaf.facet([p0, p1, tip], [[0, 0], [1, 0], [0.5, 1]], col);
        s.leaf.facet([tip, p1, p0], [[0.5, 1], [1, 0], [0, 0]], col);
      }
      if (rnd() < 0.006) {
        const fc: Tint = ([[0.85, 0.85, 0.8], [0.85, 0.75, 0.2], [0.55, 0.4, 0.75]] as Tint[])[Math.floor(R(0, 3))];
        const fy = y + R(0.07, 0.14);
        s.leaf.facet([V(x - 0.04, fy, z), V(x, fy, z - 0.04), V(x + 0.04, fy, z), V(x, fy, z + 0.04)], [[0, 0], [1, 0], [1, 1], [0, 1]], fc);
      }
    }
  }
}
