/**
 * 守卫战 3D 光影层(技术验证,默认关)· 程序贴图。
 *
 * 所有贴图都是进战场时在画布上现画的(噪声 + 矢量),没有任何图片文件 —— 画法照搬网页小样
 * tools/proto3d/guard_battle/index.html,去掉了英雄格(战场上的格子仍由 2D 层画)。
 * 只在网页端可用:原生端没有画布,真要上线得把这几张图离线烘成文件。
 * 贴图边长都取 2 的幂:项目的图形后端是 WebGL1,非 2 的幂贴图不能带多级渐远、也不能平铺。
 */

export const TER_Z = -8.4;                 // 后面石平台的前沿(世界坐标,米)
export const GX0 = -16;
export const GZ0 = -8.5;
export const GW = 32;
export const GD = 16;                      // 地面贴图覆盖 32 × 16 米(贴图 2:1)

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(ix, iy, seed), hash2(ix + 1, iy, seed), ux), lerp(hash2(ix, iy + 1, seed), hash2(ix + 1, iy + 1, seed), ux), uy);
}
export function fbm(x: number, y: number, oct: number, seed: number): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i += 1) {
    s += a * vnoise(x * f, y * f, seed + i * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export type Cv = HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D;
export interface Tile { cv: Cv; cells: number }

export function makeCanvas(w: number, h: number): Cv {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function ctxOf(c: Cv): Ctx {
  return c.getContext('2d') as Ctx;
}
/** 模糊一张画布(有 filter 用 filter,没有就缩小再放大)。 */
export function blurred(src: Cv, r: number): Cv {
  const w = src.width;
  const h = src.height;
  const out = makeCanvas(w, h);
  const o = ctxOf(out);
  if (r < 0.35) {
    o.drawImage(src, 0, 0);
    return out;
  }
  if (typeof o.filter === 'string') {
    o.filter = `blur(${r.toFixed(2)}px)`;
    o.drawImage(src, 0, 0);
    o.filter = 'none';
    return out;
  }
  const k = Math.max(2, Math.round(r * 1.6));
  const s = makeCanvas(Math.max(1, Math.round(w / k)), Math.max(1, Math.round(h / k)));
  const sc = ctxOf(s);
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(src, 0, 0, s.width, s.height);
  o.imageSmoothingQuality = 'high';
  o.drawImage(s, 0, 0, w, h);
  return out;
}
/** 可无缝平铺的噪声瓦片(灰度,以 128 为中性,叠加混合用)。cells = 最粗一层的格数。 */
export function noiseTile(size: number, cells: number, oct: number, seed: number, contrast: number): Tile {
  const cv = makeCanvas(size, size);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const per = (ix: number, iy: number, p: number, s: number): number => hash2(((ix % p) + p) % p, ((iy % p) + p) % p, s);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 0;
      let a = 0.5;
      let n = 0;
      let p = cells;
      for (let o = 0; o < oct; o += 1) {
        const fx = (x / size) * p;
        const fy = (y / size) * p;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const ux = tx * tx * (3 - 2 * tx);
        const uy = ty * ty * (3 - 2 * ty);
        const s = seed + o * 31;
        v += a * lerp(lerp(per(ix, iy, p, s), per(ix + 1, iy, p, s), ux), lerp(per(ix, iy + 1, p, s), per(ix + 1, iy + 1, p, s), ux), uy);
        n += a;
        a *= 0.5;
        p *= 2;
      }
      const g = Math.round(clamp((v / n - 0.5) * contrast + 0.5, 0, 1) * 255);
      const i = (y * size + x) * 4;
      d[i] = g;
      d[i + 1] = g;
      d[i + 2] = g;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { cv, cells };
}
/** 把噪声瓦片按任意缩放 / 旋转铺满画布并以指定混合方式叠上去(多层不同比例和角度叠起来就看不出重复)。 */
export function overlayPattern(ctx: Ctx, tile: Cv, W: number, H: number, scale: number, alpha: number, mode: GlobalCompositeOperation, rot: number, ox: number, oy: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = mode;
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(ox, oy);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat') as CanvasPattern;
  const R = Math.hypot(W, H) / scale;
  ctx.fillRect(-ox - R, -oy - R, 2 * R, 2 * R);
  ctx.restore();
}

let NT: { big: Tile; mid: Tile; fine: Tile; grain: Tile } | null = null;
export function tiles(): { big: Tile; mid: Tile; fine: Tile; grain: Tile } {
  if (!NT) {
    NT = { big: noiseTile(256, 3, 5, 101, 2.3), mid: noiseTile(256, 12, 4, 202, 2.4), fine: noiseTile(256, 48, 3, 303, 2.2), grain: noiseTile(256, 128, 1, 404, 1.5) };
  }
  return NT;
}

/** 高度图 → 法线图(逐像素索贝尔)。法线按贴图自己的 (u, v) 方向存:R = 沿 u,G = 沿 v(图像向下),配网格里同方向的切线 / 副切线用。 */
export function heightToNormal(height: Cv, strength: number, wrap: boolean): Cv {
  const w = height.width;
  const h = height.height;
  const src = ctxOf(height).getImageData(0, 0, w, h).data;
  const hs = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    hs[i] = src[i * 4] / 255;
  }
  const out = makeCanvas(w, h);
  const octx = ctxOf(out);
  const img = octx.createImageData(w, h);
  const d = img.data;
  const k = strength * 0.25;
  for (let y = 0; y < h; y += 1) {
    const y0 = wrap ? (y + h - 1) % h : Math.max(0, y - 1);
    const y1 = wrap ? (y + 1) % h : Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = wrap ? (x + w - 1) % w : Math.max(0, x - 1);
      const x1 = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      const a = hs[y0 * w + x0];
      const b = hs[y0 * w + x];
      const c = hs[y0 * w + x1];
      const e = hs[y * w + x0];
      const f = hs[y * w + x1];
      const g = hs[y1 * w + x0];
      const hh = hs[y1 * w + x];
      const i2 = hs[y1 * w + x1];
      const dx = (c + 2 * f + i2) - (a + 2 * e + g);
      const dy = (g + 2 * hh + i2) - (a + 2 * b + c);
      let nx = -dx * k;
      let ny = -dy * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;
      const o = (y * w + x) * 4;
      d[o] = Math.round((nx * 0.5 + 0.5) * 255);
      d[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ───────────────────────── 地面 ─────────────────────────
const ROAD_Z = (x: number): number => 0.15 + 0.55 * Math.sin(x * 0.33 + 0.8) * smooth(3, 9, x);
const roadHalf = (x: number): number => 2.5 + 0.9 * smooth(6, 14, x);
/** 这一点铺着石板的可能性:左边 2/3 是石板院子,往右渐渐碎成土路,中间零星缺几块。 */
function stoneP(x: number, z: number): number {
  const n = fbm(x * 0.21 + 3.1, z * 0.21 - 1.7, 3, 11);
  const n2 = fbm(x * 0.9 + 1.3, z * 0.9 + 5.1, 2, 12);
  let p = smooth(8.8, 4.4, x + (n - 0.5) * 6.5 + (n2 - 0.5) * 1.6);
  const hole = fbm(x * 0.5 - 4.0, z * 0.5 + 8.0, 3, 13);
  p *= 1 - 0.9 * smooth(0.6, 0.68, hole) * smooth(-3.5, 0.5, x);
  return clamp(p, 0, 1);
}
/** 这一点长草的可能性:土路两侧、平台脚下、缺砖的坑里。 */
export function grassP(x: number, z: number): number {
  const n = fbm(x * 0.33 - 7.3, z * 0.33 + 2.2, 3, 23);
  const dz = Math.abs(z - ROAD_Z(x));
  let g = smooth(roadHalf(x) - 0.4, roadHalf(x) + 1.2, dz + (n - 0.5) * 2.4) * smooth(3.6, 7.2, x + (n - 0.5) * 3);
  g = Math.max(g, smooth(-6.9, -8.0, z - (n - 0.5) * 1.8) * smooth(0.4, 0.6, n) * 0.95);
  g = Math.max(g, (1 - smooth(0.2, 0.6, stoneP(x, z))) * smooth(0.42, 0.58, n) * smooth(7.5, 3.0, x));
  return clamp(g, 0, 1);
}

interface Stone { pts: number[][]; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number; tone: number; cool: boolean; sunk: boolean; crack: boolean; chip: number; r1: number; r2: number; r3: number; r4: number }
let STONES: Stone[] | null = null;
/** 每块石板(世界坐标):行缝带起伏、竖缝略歪、大小不一、偶尔一劈两半,免得像砌砖墙。 */
function stones(): Stone[] {
  if (STONES) {
    return STONES;
  }
  const rnd = mulberry32(4242);
  const list: Stone[] = [];
  const rows: number[][] = [];
  let z = GZ0 - 0.7;
  while (z < GZ0 + GD + 0.7) {
    const dz = 0.82 + rnd() * 0.72;
    rows.push([z, z + dz]);
    z += dz;
  }
  const wob = (zl: number, x: number, k: number): number => zl + (fbm(x * 0.3 + k * 3.7, k * 1.9 + 0.5, 2, 61) - 0.5) * 0.36;
  rows.forEach((r, ri) => {
    let x = GX0 - rnd() * 2.2;
    let lT = (rnd() - 0.5) * 0.12;
    let lB = (rnd() - 0.5) * 0.12;
    while (x < GX0 + GW + 0.8) {
      const w = 0.72 + Math.pow(rnd(), 1.7) * 1.95;
      const nT = (rnd() - 0.5) * 0.14;
      const nB = (rnd() - 0.5) * 0.14;
      const x0 = x;
      const a = lT;
      const b = lB;
      const zAt = (xx: number, f: number): number => lerp(wob(r[0], xx, ri), wob(r[1], xx, ri + 1), f);
      const piece = (fa: number, fb: number): void => {
        const pts = [[x0 + lerp(a, b, fa), 0], [x0 + w + lerp(nT, nB, fa), 0], [x0 + w + lerp(nT, nB, fb), 0], [x0 + lerp(a, b, fb), 0]];
        pts[0][1] = zAt(pts[0][0], fa);
        pts[1][1] = zAt(pts[1][0], fa);
        pts[2][1] = zAt(pts[2][0], fb);
        pts[3][1] = zAt(pts[3][0], fb);
        const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
        const cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
        const keep = rnd();
        const st: Stone = { pts, cx, cz, x0: Math.min(pts[0][0], pts[3][0]), x1: Math.max(pts[1][0], pts[2][0]), z0: Math.min(pts[0][1], pts[1][1]), z1: Math.max(pts[2][1], pts[3][1]),
          tone: rnd() * 2 - 1, cool: rnd() < 0.3, sunk: rnd() < 0.06, crack: rnd() < 0.14, chip: rnd() < 0.2 ? Math.floor(rnd() * 4) : -1, r1: rnd(), r2: rnd(), r3: rnd(), r4: rnd() };
        if (stoneP(cx, cz) > 0.1 + keep * 0.8) {
          list.push(st);
        }
      };
      if (r[1] - r[0] > 1.15 && rnd() < 0.2) {
        const fm = 0.42 + rnd() * 0.16;
        piece(0, fm);
        piece(fm, 1);
      } else {
        piece(0, 1);
      }
      lT = nT;
      lB = nB;
      x += w;
    }
  });
  STONES = list;
  return list;
}
function inPoly(p: number[][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) {
    if ((p[i][1] > z) !== (p[j][1] > z) && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) {
      inside = !inside;
    }
  }
  return inside;
}
export function onStone(x: number, z: number): boolean {
  for (const s of stones()) {
    if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && inPoly(s.pts, x, z)) {
      return true;
    }
  }
  return false;
}
/** 水洼(世界坐标):实时光在水面上的反光最能看出「真的在受光」。 */
const PUDDLES = [
  { x: 8.9, z: 0.95, r: 0.7, s: 1 }, { x: 11.8, z: -0.8, r: 0.85, s: 2 }, { x: 6.3, z: -0.75, r: 0.5, s: 3 },
  { x: 2.3, z: 1.4, r: 0.55, s: 5 }, { x: -1.9, z: -5.6, r: 0.6, s: 6 }, { x: 3.9, z: -6.3, r: 0.7, s: 7 }, { x: -3.0, z: 1.2, r: 0.42, s: 8 }, { x: 0.6, z: -1.6, r: 0.5, s: 9 },
];

/** 雨后积水的「低洼程度」(世界坐标):超过 puddleLevel(wet) 的地方有水。画地面贴图和溅涟漪共用。 */
export function wetValue(wx: number, wz: number): number {
  let v = fbm(wx * 0.21 + 7.3, wz * 0.21 + 2.1, 4, 911) * 0.72 + fbm(wx * 0.55 + 1.9, wz * 0.55 + 6.4, 3, 912) * 0.28;
  v += 0.12 * (fbm(wx * 1.5, wz * 1.5, 2, 373) - 0.5);   // 水边碎一点
  v -= 0.16 * grassP(wx, wz);                             // 草皮上少积水
  return v;
}
export function puddleLevel(wet: number): number {
  return 0.6 - 0.13 * wet;
}

export interface Contact { x: number; z: number; r: number }
export interface PbrCanvases { albedo: Cv; normal: Cv; orm: Cv }

/** 地面:泥土底 → 车辙 → 草皮 → 石板 → 青苔 → 铜嵌环 → 整体旧化 → 水洼。W = 贴图宽(高 = W / 2)。contacts = 道具落地的位置(画一圈接地暗影)。 */
export function paintGround(W: number, contacts: Contact[], wet = 0): PbrCanvases {
  const t = tiles();
  const H = W / 2;
  const s = W / GW;
  const rnd = mulberry32(20261111);
  const X = (x: number): number => (x - GX0) * s;
  const Z = (z: number): number => (z - GZ0) * s;
  const A = makeCanvas(W, H);
  const a = ctxOf(A);
  const HT = makeCanvas(W, H);
  const h = ctxOf(HT);
  const OR = makeCanvas(W, H);
  const o = ctxOf(OR);   // R = 遮蔽  G = 粗糙度  B = 金属度
  const SCR = makeCanvas(W, H);
  const sc = ctxOf(SCR);
  // 噪声瓦片缩得太小会变成逐像素的白噪声(法线图上满地闪点):每格至少留 2 像素多
  const ov = (ctx: Ctx, tile: Tile, meters: number, alpha: number, mode: GlobalCompositeOperation, rot: number): void =>
    overlayPattern(ctx, tile.cv, W, H, (Math.max(meters, (tile.cells * 2.3) / s) * s) / tile.cv.width, alpha, mode, rot, rnd() * 256, rnd() * 256);
  /** 用一张遮罩(只看透明度)把某个颜色盖到目标画布上。 */
  const stamp = (ctx: Ctx, mask: Cv, color: string, alpha: number): void => {
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, W, H);
    sc.fillStyle = color;
    sc.fillRect(0, 0, W, H);
    sc.globalCompositeOperation = 'destination-in';
    sc.drawImage(mask, 0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(SCR, 0, 0);
    ctx.restore();
  };
  const poly = (ctx: Ctx, pts: number[][]): void => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
    ctx.closePath();
  };
  const blob = (ctx: Ctx, cx: number, cz: number, r: number, seed: number): void => {
    const rr = mulberry32(seed * 977 + 5);
    const n = 11;
    const pts: number[][] = [];
    for (let i = 0; i < n; i += 1) {
      const ang = (i / n) * 6.2832;
      const k = r * (0.68 + rr() * 0.5);
      pts.push([X(cx + Math.cos(ang) * k * 1.25), Z(cz + Math.sin(ang) * k * 0.85)]);
    }
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      if (!i) {
        ctx.moveTo(mx, my);
      } else {
        ctx.quadraticCurveTo(p[0], p[1], mx, my);
      }
    }
    ctx.quadraticCurveTo(pts[0][0], pts[0][1], (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    ctx.closePath();
  };

  // 1) 泥土底
  a.fillStyle = '#5a4e43';
  a.fillRect(0, 0, W, H);
  ov(a, t.big, 7.3, 0.5, 'soft-light', 0.3);
  ov(a, t.mid, 2.1, 0.3, 'overlay', -0.6);
  ov(a, t.fine, 0.45, 0.3, 'overlay', 1.0);
  h.fillStyle = 'rgb(98,98,98)';
  h.fillRect(0, 0, W, H);
  ov(h, t.big, 5.1, 0.5, 'overlay', 0.9);
  ov(h, t.mid, 1.3, 0.6, 'overlay', 0.2);
  ov(h, t.fine, 0.3, 0.55, 'overlay', -0.4);
  o.fillStyle = 'rgb(255,236,0)';
  o.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i += 1) {   // 小石子
    const x = GX0 + rnd() * GW;
    const z = GZ0 + rnd() * GD;
    const r = (0.012 + rnd() * 0.03) * s;
    const l = 80 + rnd() * 70;
    a.fillStyle = `rgba(${l | 0},${(l * 0.97) | 0},${(l * 0.93) | 0},0.8)`;
    a.beginPath();
    a.ellipse(X(x), Z(z), r, r * (0.6 + rnd() * 0.4), rnd() * 3.14, 0, 6.2832);
    a.fill();
    h.fillStyle = 'rgba(200,200,200,0.9)';
    h.beginPath();
    h.ellipse(X(x), Z(z), r, r * 0.8, 0, 0, 6.2832);
    h.fill();
  }
  // 2) 车辙(踩实、发潮的泥)
  const rut = makeCanvas(W, H);
  const rc = ctxOf(rut);
  rc.lineCap = 'round';
  rc.lineJoin = 'round';
  for (const off of [-0.72, 0.68]) {
    rc.beginPath();
    for (let x = 3.2; x <= GX0 + GW + 0.5; x += 0.25) {
      const z = ROAD_Z(x) + off + (fbm(x * 0.8, off, 2, 31) - 0.5) * 0.4;
      if (x === 3.2) {
        rc.moveTo(X(x), Z(z));
      } else {
        rc.lineTo(X(x), Z(z));
      }
    }
    rc.lineWidth = 0.4 * s;
    rc.strokeStyle = '#fff';
    rc.stroke();
  }
  const rutB = blurred(rut, 0.1 * s);
  stamp(a, rutB, '#2a231d', 0.42);
  stamp(h, rutB, 'rgb(58,58,58)', 0.6);
  stamp(o, rutB, 'rgb(255,118,0)', 0.75);
  // 3) 草皮
  const GM = makeCanvas(512, 256);
  const gm = ctxOf(GM);
  const gd = gm.createImageData(GM.width, GM.height);
  for (let j = 0; j < GM.height; j += 1) {
    for (let i = 0; i < GM.width; i += 1) {
      const v = smooth(0.36, 0.56, grassP(GX0 + ((i + 0.5) / GM.width) * GW, GZ0 + ((j + 0.5) / GM.height) * GD));
      const k = (j * GM.width + i) * 4;
      gd.data[k] = 255;
      gd.data[k + 1] = 255;
      gd.data[k + 2] = 255;
      gd.data[k + 3] = Math.round(v * 255);
    }
  }
  gm.putImageData(gd, 0, 0);
  const Gc = makeCanvas(W, H);
  const g = ctxOf(Gc);
  g.fillStyle = '#3a4331';
  g.fillRect(0, 0, W, H);
  ov(g, t.big, 3.3, 0.6, 'soft-light', 1.2);
  ov(g, t.fine, 0.5, 0.4, 'overlay', 0.1);
  g.lineCap = 'round';
  for (let i = 0, made = 0; i < 120000 && made < 30000; i += 1) {
    const x = GX0 + rnd() * GW;
    const z = GZ0 + rnd() * GD;
    if (grassP(x, z) < 0.3) {
      continue;
    }
    made += 1;
    const len = (0.05 + rnd() * 0.1) * s;
    const ang = -1.57 + (rnd() - 0.5) * 1.7;
    g.strokeStyle = `hsl(${(64 + rnd() * 42) | 0},${(11 + rnd() * 20) | 0}%,${(15 + rnd() * 19) | 0}%)`;
    g.lineWidth = Math.max(1, (0.008 + rnd() * 0.013) * s);
    g.beginPath();
    g.moveTo(X(x), Z(z));
    g.lineTo(X(x) + Math.cos(ang) * len, Z(z) + Math.sin(ang) * len);
    g.stroke();
  }
  g.globalCompositeOperation = 'destination-in';
  g.imageSmoothingQuality = 'high';
  g.drawImage(GM, 0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  a.drawImage(Gc, 0, 0);
  stamp(h, GM, 'rgb(128,128,128)', 0.85);
  stamp(o, GM, 'rgb(255,232,0)', 1);
  ov(h, t.fine, 0.22, 0.3, 'overlay', 0.7);
  // 4) 石板:先垫一层压实的缝土,再一块块铺
  const list = stones();
  for (const st of list) {
    a.fillStyle = '#3d372f';
    poly(a, st.pts);
    a.fill();
    h.fillStyle = 'rgb(80,80,80)';
    poly(h, st.pts);
    h.fill();
    o.fillStyle = 'rgb(170,238,0)';
    poly(o, st.pts);
    o.fill();
  }
  const SH = makeCanvas(W, H);
  const sh = ctxOf(SH);   // 石板自己的高度层(单独画,模糊出倒角后再盖到总高度上)
  const SO = makeCanvas(W, H);
  const so = ctxOf(SO);
  const mossEdges: Stone[] = [];
  for (const st of list) {
    const gap = 0.017;
    let pts = st.pts.map((p) => {
      const dx = st.cx - p[0];
      const dz = st.cz - p[1];
      const l = Math.hypot(dx, dz) || 1;
      const k = (gap * 1.42 + rnd() * 0.012) / l;
      return [p[0] + dx * k, p[1] + dz * k];
    });
    if (st.chip >= 0) {   // 缺角
      const c = pts[st.chip];
      const pn = pts[(st.chip + 1) % 4];
      const pp = pts[(st.chip + 3) % 4];
      const k1 = 0.08 + st.r1 * 0.2;
      const k2 = 0.08 + st.r2 * 0.2;
      const A1 = [c[0] + (pp[0] - c[0]) * k1, c[1] + (pp[1] - c[1]) * k1];
      const A2 = [c[0] + (pn[0] - c[0]) * k2, c[1] + (pn[1] - c[1]) * k2];
      pts = pts.slice(0, st.chip).concat([A1, A2], pts.slice(st.chip + 1));
    }
    const L = 49 + st.tone * 7 - (st.sunk ? 6 : 0);
    const bx = X(st.x0);
    const bz = Z(st.z0);
    const bw = (st.x1 - st.x0) * s;
    const bd = (st.z1 - st.z0) * s;
    a.fillStyle = st.cool ? `hsl(${(212 + st.r3 * 14) | 0},${(4 + st.r4 * 4) | 0}%,${(L - 3) | 0}%)` : `hsl(${(32 + st.r3 * 18) | 0},${(4 + st.r4 * 5) | 0}%,${L | 0}%)`;
    poly(a, pts);
    a.fill();
    a.save();
    poly(a, pts);
    a.clip();
    const gr = a.createLinearGradient(bx, bz, bx + bw, bz + bd);
    gr.addColorStop(0, `rgba(255,255,255,${0.02 + st.r1 * 0.05})`);
    gr.addColorStop(1, `rgba(0,0,0,${0.02 + st.r2 * 0.06})`);
    a.fillStyle = gr;
    a.fillRect(bx, bz, bw, bd);
    a.lineJoin = 'round';
    a.lineWidth = 0.1 * s;
    a.strokeStyle = 'rgba(255,255,255,0.06)';   // 边缘磨白
    poly(a, pts);
    a.stroke();
    a.lineWidth = 0.026 * s;
    a.strokeStyle = 'rgba(0,0,0,0.13)';         // 贴缝一圈暗
    poly(a, pts);
    a.stroke();
    if (st.crack) {
      const x0 = lerp(st.x0, st.x1, 0.15 + st.r1 * 0.7);
      const x1 = lerp(st.x0, st.x1, 0.15 + st.r2 * 0.7);
      a.beginPath();
      a.moveTo(X(x0), Z(st.z0));
      for (let k = 1; k <= 5; k += 1) {
        a.lineTo(X(lerp(x0, x1, k / 5) + (rnd() - 0.5) * 0.14), Z(lerp(st.z0, st.z1, k / 5)));
      }
      a.lineWidth = Math.max(1, 0.012 * s);
      a.strokeStyle = 'rgba(14,14,16,0.5)';
      a.stroke();
    }
    a.restore();
    const hv = Math.round(178 + st.tone * 9 - (st.sunk ? 30 : 0));
    sh.fillStyle = `rgb(${hv},${hv},${hv})`;
    poly(sh, pts);
    sh.fill();
    const gh = sh.createLinearGradient(bx, bz, bx + bw, bz + bd);
    gh.addColorStop(0, `rgba(255,255,255,${st.r3 * 0.1})`);
    gh.addColorStop(1, `rgba(0,0,0,${st.r4 * 0.1})`);
    sh.save();
    poly(sh, pts);
    sh.clip();
    sh.fillStyle = gh;
    sh.fillRect(bx, bz, bw, bd);
    sh.restore();
    const rv = Math.round(st.sunk ? 108 : 134 + st.r2 * 50);
    so.fillStyle = `rgb(255,${rv},0)`;
    poly(so, pts);
    so.fill();
    if (fbm(st.cx * 0.3 + 2, st.cz * 0.3 + 9, 3, 41) > 0.5 && st.r1 < 0.45) {
      mossEdges.push(st);
    }
  }
  const shMask = makeCanvas(W, H);
  ctxOf(shMask).drawImage(SH, 0, 0);
  ov(sh, t.mid, 1.7, 0.2, 'overlay', 0.5);
  ov(sh, t.fine, 0.36, 0.2, 'overlay', -0.9);
  sh.globalCompositeOperation = 'destination-in';
  sh.drawImage(shMask, 0, 0);
  sh.globalCompositeOperation = 'source-over';
  h.drawImage(blurred(SH, 0.011 * s), 0, 0);
  o.drawImage(SO, 0, 0);
  // 中间走道被踩得发亮的一带
  const wear = makeCanvas(W, H);
  const wc = ctxOf(wear);
  wc.lineCap = 'round';
  wc.beginPath();
  for (let x = -14; x <= 6.5; x += 0.3) {
    const z = 0.25 + (fbm(x * 0.4, 3.3, 2, 51) - 0.5) * 1.1;
    if (x === -14) {
      wc.moveTo(X(x), Z(z));
    } else {
      wc.lineTo(X(x), Z(z));
    }
  }
  wc.lineWidth = 2.3 * s;
  wc.strokeStyle = '#fff';
  wc.stroke();
  const wearB = blurred(wear, 0.5 * s);
  const wb = ctxOf(wearB);
  wb.globalCompositeOperation = 'destination-in';
  wb.drawImage(shMask, 0, 0);
  stamp(o, wearB, 'rgb(255,84,0)', 0.55);
  stamp(a, wearB, '#c9c8c4', 0.06);
  // 5) 缝里的青苔
  const MS = makeCanvas(W, H);
  const ms = ctxOf(MS);
  ms.lineCap = 'round';
  for (const st of mossEdges) {
    const i0 = Math.floor(st.r3 * 4);
    const e0 = st.pts[i0];
    const e1 = st.pts[(i0 + 1) % 4];
    ms.beginPath();
    for (let k = 0; k <= 8; k += 1) {
      const tt = k / 8;
      const px = lerp(e0[0], e1[0], tt) + (rnd() - 0.5) * 0.07;
      const pz = lerp(e0[1], e1[1], tt) + (rnd() - 0.5) * 0.07;
      if (!k) {
        ms.moveTo(X(px), Z(pz));
      } else {
        ms.lineTo(X(px), Z(pz));
      }
    }
    ms.lineWidth = (0.05 + rnd() * 0.08) * s;
    ms.strokeStyle = `hsl(${(74 + rnd() * 28) | 0},${(16 + rnd() * 14) | 0}%,${(19 + rnd() * 9) | 0}%)`;
    ms.stroke();
  }
  const MSB = blurred(MS, 0.018 * s);
  a.save();
  a.globalAlpha = 0.8;
  a.drawImage(MSB, 0, 0);
  a.restore();
  stamp(h, MSB, 'rgb(150,150,150)', 0.6);
  stamp(o, MSB, 'rgb(235,244,0)', 0.9);
  // 6) 地面的铜嵌环(院子正中一圈,断在土路那边)
  const ringC = [0.5, 0.5];
  const ringR = 5.5;
  const ringW = 0.075;
  const metal = (ctx: Ctx, col: string, wid: number): void => {
    ctx.lineCap = 'butt';
    ctx.lineWidth = wid * s;
    ctx.strokeStyle = col;
    for (let k = 0; k < 180; k += 1) {
      const a0 = (k / 180) * 6.2832;
      const a1 = ((k + 1.02) / 180) * 6.2832;
      const mx = ringC[0] + Math.cos((a0 + a1) / 2) * ringR;
      const mz = ringC[1] + Math.sin((a0 + a1) / 2) * ringR;
      if (mz < GZ0 + 0.3 || mz > GZ0 + GD - 0.2 || !onStone(mx, mz)) {
        continue;
      }
      ctx.beginPath();
      ctx.arc(X(ringC[0]), Z(ringC[1]), ringR * s, a0, a1);
      ctx.stroke();
    }
  };
  metal(a, '#2a2520', ringW + 0.03);
  metal(a, '#9c8158', ringW);
  metal(h, 'rgb(100,100,100)', ringW + 0.03);
  metal(h, 'rgb(168,168,168)', ringW - 0.01);
  metal(o, 'rgb(180,220,0)', ringW + 0.03);
  metal(o, 'rgb(255,96,255)', ringW);
  // 7) 整体的旧化:大块色斑、细颗粒、污渍、平台脚下和道具脚下的暗影
  ov(a, t.big, 9.7, 0.24, 'soft-light', 0.7);
  ov(a, t.mid, 2.3, 0.16, 'overlay', 2.1);
  ov(a, t.fine, 0.27, 0.2, 'overlay', 1.3);
  for (let i = 0; i < 30; i += 1) {
    const x = X(GX0 + rnd() * GW);
    const z = Z(GZ0 + rnd() * GD);
    const r = (0.5 + rnd() * 1.5) * s;
    const gr2 = a.createRadialGradient(x, z, 0, x, z, r);
    gr2.addColorStop(0, `rgba(20,18,16,${0.06 + rnd() * 0.08})`);
    gr2.addColorStop(1, 'rgba(20,18,16,0)');
    a.fillStyle = gr2;
    a.fillRect(x - r, z - r, 2 * r, 2 * r);
  }
  const foot = a.createLinearGradient(0, Z(TER_Z - 0.1), 0, Z(TER_Z + 1.1));
  foot.addColorStop(0, 'rgba(10,9,8,0.45)');
  foot.addColorStop(1, 'rgba(10,9,8,0)');
  a.fillStyle = foot;
  a.fillRect(0, 0, W, Z(TER_Z + 1.1));
  o.save();
  o.globalCompositeOperation = 'multiply';
  const footO = o.createLinearGradient(0, Z(TER_Z - 0.1), 0, Z(TER_Z + 0.9));
  footO.addColorStop(0, 'rgb(120,255,255)');
  footO.addColorStop(1, 'rgb(255,255,255)');
  o.fillStyle = footO;
  o.fillRect(0, 0, W, Z(TER_Z + 0.9));
  for (const c of contacts) {
    const x = X(c.x);
    const z = Z(c.z);
    const r = c.r * s;
    const g1 = a.createRadialGradient(x, z, r * 0.35, x, z, r);
    const g2 = o.createRadialGradient(x, z, r * 0.3, x, z, r);
    g1.addColorStop(0, 'rgba(8,7,6,0.45)');
    g1.addColorStop(1, 'rgba(8,7,6,0)');
    a.fillStyle = g1;
    a.fillRect(x - r, z - r, 2 * r, 2 * r);
    g2.addColorStop(0, 'rgb(105,255,255)');
    g2.addColorStop(1, 'rgb(255,255,255)');
    o.fillStyle = g2;
    o.fillRect(x - r, z - r, 2 * r, 2 * r);
  }
  o.restore();
  ov(h, t.big, 6.1, 0.16, 'overlay', 1.6);
  ov(h, t.fine, 0.21, 0.13, 'overlay', 0.3);
  ov(o, t.mid, 1.7, 0.34, 'overlay', 0.9);
  ov(o, t.big, 5.3, 0.28, 'overlay', -0.2);
  // 8) 水洼:最后画,水面是平的
  const PD = makeCanvas(W, H);
  const pd = ctxOf(PD);
  pd.fillStyle = '#fff';
  for (const p of PUDDLES) {
    blob(pd, p.x, p.z, p.r, p.s);
    pd.fill();
  }
  const PDB = blurred(PD, 0.04 * s);
  const PDW = blurred(PD, 0.18 * s);
  stamp(a, PDW, '#1b1713', 0.22);
  stamp(a, PDB, '#141a22', 0.42);
  stamp(h, PDB, 'rgb(88,88,88)', 1);
  stamp(o, PDW, 'rgb(255,110,0)', 0.5);
  stamp(o, PDB, 'rgb(255,28,0)', 1);
  // 9) 雨后(wet > 0,全 3D 样板用):低洼处连成片的积水 + 整体受潮。
  //    积水是一层浅水膜:底下的石头还看得见(颜色只压深一点点)、表面极光滑、带四成金属度 ——
  //    金属度是有意的夸张:俯视角下水面真实的反射率只有 6% 左右,倒影几乎看不见,抬一点火光和人影才映得出来
  //    (倒影本身由引擎的平面反射提供);不给到全金属,是因为那样水面不吃光、看着像一个个黑洞。
  if (wet > 0) {
    const mw = W / 4;
    const mh = H / 4;
    const WM = makeCanvas(mw, mh);
    const wctx = ctxOf(WM);
    const img = wctx.createImageData(mw, mh);
    const thr = puddleLevel(wet);
    for (let y = 0; y < mh; y += 1) {
      for (let x = 0; x < mw; x += 1) {
        const wx = GX0 + ((x + 0.5) / mw) * GW;
        const wz = GZ0 + ((y + 0.5) / mh) * GD;
        const v = wetValue(wx, wz);
        const i = (y * mw + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(smooth(thr, thr + 0.05, v) * 255);
      }
    }
    wctx.putImageData(img, 0, 0);
    const WMF = makeCanvas(W, H);
    const wf = ctxOf(WMF);
    wf.imageSmoothingQuality = 'high';
    wf.drawImage(WM, 0, 0, W, H);
    const WMS = blurred(WMF, 0.06 * s);   // 水面
    const WMW = blurred(WMF, 0.3 * s);    // 水洼周围更湿的一圈
    a.save();
    a.globalCompositeOperation = 'multiply';
    a.fillStyle = 'rgb(150,154,162)';      // 整体受潮:颜色变深
    a.fillRect(0, 0, W, H);
    a.restore();
    o.save();
    o.globalCompositeOperation = 'multiply';
    o.fillStyle = 'rgb(255,150,255)';      // 粗糙度打六折
    o.fillRect(0, 0, W, H);
    o.restore();
    stamp(a, WMW, '#15171b', 0.16);
    stamp(o, WMW, 'rgb(255,70,0)', 0.6);
    stamp(a, WMS, '#3a4350', 0.2);
    stamp(h, WMS, 'rgb(84,84,84)', 1);
    stamp(o, WMS, 'rgb(255,10,105)', 1);
  }
  // 高度 0~1 = 0~8.5 厘米;每个像素 GW / W 米
  return { albedo: A, normal: heightToNormal(HT, (0.085 * W) / (2 * GW), false), orm: OR };
}

/** 道具用的石面(可平铺):石头本身没有「边」,边由带倒角的几何体来交代。 */
export function paintRock(S: number): { albedo: Cv; normal: Cv } {
  const t = tiles();
  const rnd = mulberry32(777);
  const A = makeCanvas(S, S);
  const a = ctxOf(A);
  const HT = makeCanvas(S, S);
  const h = ctxOf(HT);
  const tl = (ctx: Ctx, tile: Tile, rep: number, alpha: number, mode: GlobalCompositeOperation): void => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = mode;
    const k = S / (tile.cv.width * rep);
    ctx.scale(k, k);
    ctx.fillStyle = ctx.createPattern(tile.cv, 'repeat') as CanvasPattern;
    ctx.fillRect(0, 0, S / k, S / k);
    ctx.restore();
  };
  const wrap = (fn: (x: number, y: number) => void, x: number, y: number, r: number): void => {
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        if (x + dx < -r || x + dx > S + r || y + dy < -r || y + dy > S + r) {
          continue;
        }
        fn(x + dx, y + dy);
      }
    }
  };
  const fineRep = S >= 1024 ? 4 : 2;
  a.fillStyle = '#8b8a89';
  a.fillRect(0, 0, S, S);
  tl(a, t.big, 1, 0.5, 'soft-light');
  tl(a, t.mid, 2, 0.32, 'overlay');
  tl(a, t.fine, fineRep, 0.4, 'overlay');
  for (let i = 0; i < 34; i += 1) {   // 地衣
    const cx = rnd() * S;
    const cy = rnd() * S;
    const n = 5 + Math.floor(rnd() * 10);
    const col = rnd() < 0.5 ? 'rgba(150,156,132,0.2)' : 'rgba(170,164,128,0.18)';
    for (let k = 0; k < n; k += 1) {
      const x = cx + (rnd() - 0.5) * 70;
      const y = cy + (rnd() - 0.5) * 70;
      const r = 3 + rnd() * 13;
      wrap((px, py) => {
        a.fillStyle = col;
        a.beginPath();
        a.arc(px, py, r, 0, 6.2832);
        a.fill();
      }, x, y, r);
    }
  }
  h.fillStyle = 'rgb(128,128,128)';
  h.fillRect(0, 0, S, S);
  tl(h, t.big, 1, 0.6, 'overlay');
  tl(h, t.mid, 2, 0.6, 'overlay');
  tl(h, t.fine, fineRep, 0.5, 'overlay');
  for (let i = 0; i < 500; i += 1) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 1 + rnd() * 2.6;
    a.fillStyle = 'rgba(28,28,32,0.45)';
    a.beginPath();
    a.arc(x, y, r, 0, 6.2832);
    a.fill();
    h.fillStyle = 'rgba(40,40,40,0.8)';
    h.beginPath();
    h.arc(x, y, r * 1.2, 0, 6.2832);
    h.fill();
  }
  h.lineCap = 'round';
  for (let i = 0; i < 260; i += 1) {
    const x = rnd() * S;
    const y = rnd() * S;
    const ang = 0.7 + (rnd() - 0.5) * 0.9;
    const len = 10 + rnd() * 24;
    h.strokeStyle = 'rgba(60,60,60,0.3)';
    h.lineWidth = 1.5 + rnd() * 2;
    h.beginPath();
    h.moveTo(x, y);
    h.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    h.stroke();
  }
  return { albedo: A, normal: heightToNormal(HT, 3.2 * (S / 1024), true) };
}

/** 木头(可平铺):纹理顺着竖直方向。 */
export function paintWood(S: number): { albedo: Cv; normal: Cv } {
  const t = tiles();
  const rnd = mulberry32(3131);
  const A = makeCanvas(S, S);
  const a = ctxOf(A);
  const HT = makeCanvas(S, S);
  const h = ctxOf(HT);
  a.fillStyle = '#6a5847';
  a.fillRect(0, 0, S, S);
  h.fillStyle = 'rgb(128,128,128)';
  h.fillRect(0, 0, S, S);
  for (let i = 0; i < 300; i += 1) {
    const x = rnd() * S;
    const wv = 1 + rnd() * 3;
    const l = 30 + rnd() * 70;
    const amp = 1 + rnd() * 3;
    const ph = rnd() * 6.28;
    const per = 1 + Math.floor(rnd() * 3);
    a.strokeStyle = `rgba(${l | 0},${(l * 0.84) | 0},${(l * 0.68) | 0},${0.16 + rnd() * 0.3})`;
    a.lineWidth = wv;
    const hv = rnd() < 0.5 ? 40 : 210;
    h.strokeStyle = `rgba(${hv},${hv},${hv},${0.12 + rnd() * 0.22})`;
    h.lineWidth = wv;
    for (const c of [a, h]) {
      c.beginPath();
      for (let y = 0; y <= S; y += 16) {
        const px = x + Math.sin((y / S) * 6.2832 * per + ph) * amp;
        if (!y) {
          c.moveTo(px, y);
        } else {
          c.lineTo(px, y);
        }
      }
      c.stroke();
    }
  }
  a.save();
  a.globalAlpha = 0.6;
  a.globalCompositeOperation = 'overlay';
  a.fillStyle = a.createPattern(t.big.cv, 'repeat') as CanvasPattern;
  a.fillRect(0, 0, S, S);
  a.restore();
  return { albedo: A, normal: heightToNormal(HT, 2.2 * (S / 512), true) };
}

/** 径向渐变的柔边圆(光斑、火苗用)。 */
export function softDisc(S: number): Cv {
  const c = makeCanvas(S, S);
  const x = ctxOf(c);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return c;
}

/** 远景(贴在镜头上的一张图):夜空渐变 + 画面外月亮透过薄雾的一片光 + 三层带尖峰的山影(越远越淡)+ 残塔 + 高架桥,层间垫雾。 */
export function paintBackdrop(): Cv {
  const t = tiles();
  const W = 2048;
  const H = 512;
  const c = makeCanvas(W, H);
  const x = ctxOf(c);
  const rnd = mulberry32(99);
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#161f36');
  sky.addColorStop(0.22, '#2a3859');
  sky.addColorStop(0.42, '#51628a');
  sky.addColorStop(0.62, '#7a89ab');
  sky.addColorStop(1, '#8a97b4');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);
  const mg = x.createRadialGradient(W * 0.22, -H * 0.3, 0, W * 0.22, -H * 0.3, H * 1.9);
  mg.addColorStop(0, 'rgba(206,220,255,0.62)');
  mg.addColorStop(0.4, 'rgba(160,182,232,0.22)');
  mg.addColorStop(1, 'rgba(140,160,215,0)');
  x.fillStyle = mg;
  x.fillRect(0, 0, W, H);
  const cl = makeCanvas(W, H);
  const cx = ctxOf(cl);   // 云:把噪声横向拉长
  cx.save();
  cx.scale(7, 1.5);
  cx.fillStyle = cx.createPattern(t.big.cv, 'repeat') as CanvasPattern;
  cx.fillRect(0, 0, W, H);
  cx.restore();
  x.save();
  x.globalAlpha = 0.55;
  x.globalCompositeOperation = 'soft-light';
  x.drawImage(cl, 0, 0);
  x.restore();
  const ridge = (base: number, amp: number, freq: number, seed: number, col: string, mistTo: string, towers: number, bridge?: number[]): void => {
    const yAt = (i: number): number => {   // 脊状噪声:一座座带尖的山,不是波浪
      const u = (i / W) * freq + seed * 0.37;
      let v = 0;
      let a = 0.55;
      let f = 1;
      let n = 0;
      for (let o = 0; o < 5; o += 1) {
        const r = 1 - Math.abs(vnoise(u * f, o * 3.1 + 0.5, seed + o * 13) * 2 - 1);
        v += a * r * r;
        n += a;
        a *= 0.5;
        f *= 2.1;
      }
      return H * (base - (v / n - 0.34) * amp * 2.3);
    };
    const gcol = x.createLinearGradient(0, H * (base - amp), 0, H * (base + 0.2));
    gcol.addColorStop(0, col);
    gcol.addColorStop(1, mistTo);
    x.fillStyle = gcol;
    x.beginPath();
    x.moveTo(0, H);
    for (let i = 0; i <= W; i += 4) {
      x.lineTo(i, yAt(i));
    }
    x.lineTo(W, H);
    x.closePath();
    x.fill();
    for (let k = 0; k < towers; k += 1) {   // 残塔
      const px = rnd() * W;
      const wv = 7 + rnd() * 11;
      const hv = 16 + rnd() * 46;
      const by = yAt(px) + 5;
      x.fillRect(px - wv / 2, by - hv, wv, hv + 20);
      if (rnd() < 0.6) {
        x.beginPath();
        x.moveTo(px - wv / 2 - 1.5, by - hv);
        x.lineTo(px, by - hv - wv * (1.1 + rnd()));
        x.lineTo(px + wv / 2 + 1.5, by - hv);
        x.fill();
      }
    }
    if (bridge) {   // 高架桥:桥面 + 桥墩,桥墩之间挖出拱
      const [bx0, bx1, by] = bridge;
      const span = 36;
      x.fillRect(bx0 - 4, by, bx1 - bx0 + 8, 5);
      for (let px = bx0; px < bx1 - 1; px += span) {
        x.beginPath();
        x.rect(px, by + 5, span, 22);
        x.ellipse(px + span / 2, by + 27, span / 2 - 4, 19, 0, Math.PI, 6.2832);
        x.fill('evenodd');
        x.fillRect(px - 3, by + 5, 6, 90);
      }
      x.fillRect(bx1 - 3, by + 5, 6, 90);
    }
  };
  const mist = (y0: number, y1: number, rgb: string, al: number): void => {
    const g = x.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${al})`);
    x.fillStyle = g;
    x.fillRect(0, y0, W, y1 - y0);
  };
  ridge(0.24, 0.13, 3.2, 31, '#5b6c92', '#8493b3', 0);
  mist(H * 0.22, H * 0.34, '138,153,186', 0.5);
  ridge(0.33, 0.11, 4.6, 47, '#3f4f76', '#7d8cae', 6, [W * 0.47, W * 0.47 + 36 * 10, H * 0.275]);
  mist(H * 0.32, H * 0.44, '126,142,177', 0.55);
  ridge(0.43, 0.1, 6.4, 59, '#232e4b', '#6f7fa3', 9);
  mist(H * 0.46, H * 0.8, '116,132,168', 0.95);
  x.fillStyle = 'rgb(116,132,168)';
  x.fillRect(0, H * 0.8, W, H * 0.2);
  return c;
}
