import type { Cv } from './G3DTextures';
import { ctxOf, makeCanvas } from './G3DTextures';
import { makePbr, mixn, Pbr, pfbm, sstep } from './G3DFieldTex';

/**
 * 地宫小样(实验,2026-11-17)· 代码生成的材质。
 *
 * 用户看完「和参考 FPS 并排对比」选了「做地宫小样」:挑一间封闭的房间,整间按那个 FPS 的做法做 ——
 * 全部材质由代码生成(先算高度,再从高度推出颜色 / 法线 / 粗糙度 / 遮蔽),不用任何图片。
 * 这里是地宫用的几套:砌石墙、整间房的石板地(含积水、嵌在地上的铜环)、发光的符文石板。
 *
 * 约定同 G3DFieldTex:法线图 R = 沿 u,G = 沿 v(图像向下);遮蔽 / 粗糙 / 金属合成一张(R / G / B)。
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * 砌石墙:一块贴图 = 4 米 × 4 米,8 层石块,层高有高有矮(0.38~0.62 米);每层 3~5 块,块宽各不相同,层与层之间错缝。
 * 石块之间是凹下去的灰缝;每块石头深浅、凸出多少都不一样,边角有崩口,表面有坑;竖着的一道道水渍更暗、更滑。
 */
export function masonryPbr(S: number): Pbr {
  const HEIGHTS = [0.62, 0.38, 0.55, 0.45, 0.62, 0.38, 0.5, 0.5];      // 合计 4 米
  const TOP: number[] = [0];
  for (const hh of HEIGHTS) {
    TOP.push(TOP[TOP.length - 1] + hh);
  }
  const ROWS = HEIGHTS.length;
  const COUNT = HEIGHTS.map((_, r) => 3 + Math.floor(hash(r, 5, 13) * 3));
  const OFF = HEIGHTS.map((_, r) => hash(r, 3, 7));
  // 第 r 层第 i 条竖缝在哪(以「块」为单位;i 可以越界,按一圈 COUNT[r] 块回绕)
  const seam = (r: number, i: number): number => {
    const n = COUNT[r];
    return i + (hash(((i % n) + n) % n, r, 29) - 0.5) * 0.36;
  };
  return makePbr(S, (u, v, o) => {
    const ym = v * 4;
    let row = 0;
    while (row < ROWS - 1 && TOP[row + 1] <= ym) {
      row += 1;
    }
    const n = COUNT[row];
    const t = (u + OFF[row]) * n;
    let i0 = Math.floor(t);
    if (t < seam(row, i0)) {
      i0 -= 1;
    } else if (t >= seam(row, i0 + 1)) {
      i0 += 1;
    }
    const lo = seam(row, i0);
    const hi = seam(row, i0 + 1);
    const col = ((i0 % n) + n) % n;
    const id = hash(col, row, 19);
    const id2 = hash(col, row, 43);
    // 到石块边的距离(米);边线用噪声抖一点(崩口)
    const chip = pfbm(u, v, 48, 48, 3, 61);
    const dx = (Math.min(t - lo, hi - t) / n) * 4;
    const dy = Math.min(ym - TOP[row], TOP[row + 1] - ym);
    const d = Math.min(dx, dy) + (chip - 0.5) * 0.009;
    const body = sstep(0.003, 0.012, d);            // 0 = 灰缝,1 = 石面
    const bevel = sstep(0.003, 0.04, d);
    const big = pfbm(u, v, 6, 6, 4, 11);
    const fine = pfbm(u, v, 72, 72, 3, 23);
    const grain = pfbm(u, v, 180, 180, 2, 29);
    const pit = sstep(0.76, 0.81, pfbm(u, v, 280, 280, 2, 37)) * body;
    const dent = sstep(0.62, 0.8, pfbm(u, v, 14, 14, 3, 53)) * body;
    // 凿痕:每块石头一个方向的细密斜纹
    const ang = id2 * Math.PI;
    const tool = 0.5 + 0.5 * Math.sin((u * Math.cos(ang) + v * Math.sin(ang)) * S * 0.36 + big * 9);
    let h = (0.5 + 0.1 * (id - 0.5)) * (0.72 + 0.28 * bevel) + 0.08 * big + 0.035 * fine + 0.014 * grain + 0.012 * tool * body;
    h = h * (0.66 + 0.34 * body) - 0.028 * pit - 0.03 * dent;
    o.h = clamp01(h + 0.18);
    // 颜色:冷灰的石头,每块深浅不同,零星偏暖;灰缝里是深色的土
    const tone = 0.84 + 0.3 * id;
    const warm = sstep(0.6, 0.85, hash(col, row, 71)) * 0.5 + 0.25 * sstep(0.5, 0.7, pfbm(u, v, 5, 5, 3, 83));
    let r = 104 * tone;
    let g = 107 * tone;
    let b = 112 * tone;
    r = mixn(r, 118 * tone, warm * 0.5);
    g = mixn(g, 106 * tone, warm * 0.5);
    b = mixn(b, 92 * tone, warm * 0.5);
    const shade = (0.74 + 0.44 * big) * (0.92 + 0.16 * fine) * (1 - 0.4 * pit) * (0.96 + 0.08 * tool);
    // 水渍:竖着拉长的噪声(横向碎、竖向长),从上往下挂
    const streak = sstep(0.5, 0.72, pfbm(u, v, 40, 3, 3, 97)) * sstep(0.3, 0.6, pfbm(u, v, 3, 2, 2, 101));
    const soot = sstep(0.55, 0.8, pfbm(u, v, 3, 3, 3, 113));
    const k = shade * (1 - 0.42 * streak) * (1 - 0.2 * soot);
    o.r = mixn(40, r * k, body);
    o.g = mixn(38, g * k, body);
    o.b = mixn(36, b * k, body);
    o.rough = Math.min(1, mixn(0.95, 0.8 + 0.12 * fine - 0.38 * streak, body) + 0.4 * pit);
    o.ao = clamp01(0.5 + 0.5 * bevel) * (1 - 0.3 * pit);
    o.metal = 0;
  }, 6);
}

/** 整间房石板地的范围(世界坐标,米)和上面的东西摆在哪 —— 贴图和场景共用这一份。 */
export interface FloorPlan {
  x0: number; z0: number; w: number; d: number;
  /** 嵌在地上的铜环(天井正下方):圆心和外圈半径。 */
  ring: { x: number; z: number; r: number };
  /** 火盆的位置(地面熏黑)。 */
  scorch: Array<{ x: number; z: number; r: number }>;
  /** 积水多少(0 = 干,1 = 到处是水洼)。 */
  wet: number;
}

/** 一张可平铺的噪声表(先算好,之后按像素双线性取 —— 整间房的地面有八百多万个像素,逐个现算分形噪声太慢)。 */
class NoiseLut {
  private readonly n: number;
  private readonly data: Float32Array;

  constructor(n: number, cells: number, oct: number, seed: number) {
    this.n = n;
    this.data = new Float32Array(n * n);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        this.data[y * n + x] = pfbm((x + 0.5) / n, (y + 0.5) / n, cells, cells, oct, seed);
      }
    }
  }

  /** x、y 以「一整张表」为单位(1 = 平铺一次)。 */
  at(x: number, y: number): number {
    const n = this.n;
    const fx = (x - Math.floor(x)) * n;
    const fy = (y - Math.floor(y)) * n;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const x1 = (ix + 1) % n;
    const y1 = (iy + 1) % n;
    const d = this.data;
    const a = d[iy * n + ix];
    const b = d[iy * n + x1];
    const c = d[y1 * n + ix];
    const e = d[y1 * n + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty;
  }
}

/**
 * 整间房的石板地(不平铺,一张图管一整间 —— 水洼、磨损、嵌的铜环都只出现一次,不会看出重复)。
 * 石板:一排一排铺(每排进深 0.8~1.3 米),排内每块 0.8~1.9 米宽;每块石板高低、倾斜都差一点,所以水积在低的那几块和缝里。
 * 积水的地方:表面是平的(法线不扰动)、又黑又滑(粗糙度接近 0),镜面倒影就出在这里;没积水的石面是潮的,半滑。
 */
export function floorPbr(W: number, H: number, plan: FloorPlan): Pbr {
  const A = makeCanvas(W, H);
  const N = makeCanvas(W, H);
  const O = makeCanvas(W, H);
  const ac = ctxOf(A);
  const nc = ctxOf(N);
  const oc = ctxOf(O);
  const ai = ac.createImageData(W, H);
  const ni = nc.createImageData(W, H);
  const oi = oc.createImageData(W, H);
  const Hh = new Float32Array(W * H);
  const big = new NoiseLut(256, 4, 5, 211);
  const mid = new NoiseLut(256, 16, 4, 223);
  const fine = new NoiseLut(256, 64, 3, 239);
  // 排的分界(沿 z)和每排里石板的分界(沿 x)
  const rows: number[] = [plan.z0];
  let ri = 0;
  while (rows[rows.length - 1] < plan.z0 + plan.d) {
    rows.push(rows[rows.length - 1] + 0.8 + 0.5 * hash(ri, 1, 301));
    ri += 1;
  }
  const cols: number[][] = [];
  for (let r = 0; r < rows.length - 1; r += 1) {
    const list = [plan.x0 - 1.2 * hash(r, 2, 307)];
    let ci = 0;
    while (list[list.length - 1] < plan.x0 + plan.w) {
      list.push(list[list.length - 1] + 0.8 + 1.1 * hash(r, ci + 3, 311));
      ci += 1;
    }
    cols.push(list);
  }
  const mpp = plan.w / W;                 // 每个像素几米
  const level = mixn(0.3, 0.375, plan.wet); // 水面高度(对着石板高度的分布定的:0.62 时大约四分之一的地面在水下)
  for (let y = 0; y < H; y += 1) {
    const wz = plan.z0 + ((y + 0.5) / H) * plan.d;
    let r = 0;
    while (r < rows.length - 2 && rows[r + 1] <= wz) {
      r += 1;
    }
    const list = cols[r];
    const dzEdge = Math.min(wz - rows[r], rows[r + 1] - wz);
    let c = 0;
    for (let x = 0; x < W; x += 1) {
      const wx = plan.x0 + ((x + 0.5) / W) * plan.w;
      while (c < list.length - 2 && list[c + 1] <= wx) {
        c += 1;
      }
      const dxEdge = Math.min(wx - list[c], list[c + 1] - wx);
      const nb = big.at(wx / 12, wz / 12);
      const nm = mid.at(wx / 6, wz / 6);
      const nf = fine.at(wx / 2.2, wz / 2.2);
      const ng = fine.at(wx / 0.6 + 0.37, wz / 0.6 + 0.11);
      // 到石板边的距离(米),边线抖一点;缝宽 1.6 厘米左右
      const d = Math.min(dxEdge, dzEdge) + (nf - 0.5) * 0.012;
      const body = sstep(0.004, 0.016, d);
      const bevel = sstep(0.004, 0.05, d);
      const id = hash(c, r, 331);
      const id2 = hash(c, r, 337);
      const id3 = hash(c, r, 347);
      // 每块石板:整体高低 + 朝某个方向斜一点
      const cxm = (list[c] + list[c + 1]) / 2;
      const czm = (rows[r] + rows[r + 1]) / 2;
      const tilt = ((wx - cxm) * Math.cos(id2 * 6.283) + (wz - czm) * Math.sin(id2 * 6.283)) * 0.02 * id3;
      // 细裂:少数石板上一条弯的缝
      const crackLine = Math.abs(mid.at(wx / 3.1 + id * 9, wz / 3.1 + id2 * 5) - 0.5);
      const crack = id3 > 0.72 ? (1 - sstep(0.002, 0.008, crackLine)) * body : 0;
      const pit = sstep(0.7, 0.78, fine.at(wx / 1.1 + 0.5, wz / 1.1)) * body;
      let h = 0.36 + 0.05 * (id - 0.5) + tilt + 0.3 * (nb - 0.5) + 0.07 * (nm - 0.5) + 0.03 * (nf - 0.5) + 0.012 * (ng - 0.5);
      h = h * (0.6 + 0.4 * bevel) - 0.05 * crack - 0.03 * pit;
      h = mixn(0.2, h, body);
      // 铜环:天井正下方嵌在地上的两圈铜条 + 八个方位的短条,略低于石面
      const rx = wx - plan.ring.x;
      const rz = wz - plan.ring.z;
      const rr = Math.hypot(rx, rz);
      const R = plan.ring.r;
      const ringBand = (1 - sstep(0.045, 0.06, Math.abs(rr - R))) + (1 - sstep(0.022, 0.032, Math.abs(rr - R * 0.72)));
      const angR = Math.atan2(rz, rx);
      const spoke = Math.abs(((angR / (Math.PI / 4)) % 1 + 1) % 1 - 0.5);       // 每 45 度一条
      const tick = (1 - sstep(0.016 / Math.max(0.3, rr), 0.024 / Math.max(0.3, rr), 0.5 - spoke)) * sstep(R * 0.74, R * 0.76, rr) * (1 - sstep(R * 0.93, R * 0.95, rr));
      const inlay = clamp01(ringBand + tick);
      if (inlay > 0) {
        h = mixn(h, 0.3 + 0.02 * nf, inlay);
      }
      // 积水:低过水面的地方
      const depth = level - h;
      const water = sstep(0.0, 0.022, depth);
      const damp = clamp01(0.35 + 0.9 * (nb - 0.35) + 0.4 * plan.wet);
      // 离墙近的地方积灰长苔:更暗更糙
      const wall = Math.min(wx - plan.x0, plan.x0 + plan.w - wx, wz - plan.z0, plan.z0 + plan.d - wz);
      const grime = (1 - sstep(0.1, 0.9, wall)) * (0.5 + 0.5 * nm);
      let scorch = 0;
      for (const s of plan.scorch) {
        scorch = Math.max(scorch, (1 - sstep(s.r * 0.35, s.r, Math.hypot(wx - s.x, wz - s.z))) * (0.6 + 0.4 * nf));
      }
      // 颜色
      const tone = 0.88 + 0.24 * id;
      const warm = sstep(0.6, 0.85, id2) * 0.5;
      let cr = mixn(84, 98, warm) * tone;
      let cg = mixn(86, 90, warm) * tone;
      let cb = mixn(92, 78, warm) * tone;
      const shade = (0.72 + 0.5 * nb) * (0.9 + 0.2 * nf) * (0.95 + 0.1 * ng) * (1 - 0.55 * crack) * (1 - 0.4 * pit);
      cr *= shade;
      cg *= shade;
      cb *= shade;
      cr = mixn(34, cr, body);
      cg = mixn(32, cg, body);
      cb = mixn(30, cb, body);
      cr = mixn(cr, cr * 0.55 + 6, grime * 0.7);
      cg = mixn(cg, cg * 0.6 + 12, grime * 0.7);
      cb = mixn(cb, cb * 0.5 + 4, grime * 0.7);
      cr *= 1 - 0.7 * scorch;
      cg *= 1 - 0.74 * scorch;
      cb *= 1 - 0.76 * scorch;
      let rough = mixn(0.92, mixn(0.84, 0.5, damp) + 0.12 * (nf - 0.5), body) + 0.2 * grime + 0.2 * scorch;
      let metal = 0;
      let ao = clamp01(0.4 + 0.6 * bevel) * (1 - 0.45 * crack);
      if (inlay > 0) {
        const worn = 0.75 + 0.5 * (nf - 0.5) + 0.3 * (ng - 0.5);
        cr = mixn(cr, 176 * worn, inlay);
        cg = mixn(cg, 128 * worn, inlay);
        cb = mixn(cb, 62 * worn, inlay);
        rough = mixn(rough, 0.3 + 0.25 * nf, inlay);
        metal = inlay;
        ao = mixn(ao, 1, inlay);
      }
      // 湿的石头颜色更深;水洼里看到的是水底的暗色
      const dk = 1 - 0.3 * damp * body;
      cr *= dk;
      cg *= dk;
      cb *= dk;
      if (water > 0) {
        cr = mixn(cr, cr * 0.42, water);
        cg = mixn(cg, cg * 0.45, water);
        cb = mixn(cb, cb * 0.5, water);
        rough = mixn(rough, 0.035, water);
        metal = mixn(metal, 0, water * 0.6);
        ao = mixn(ao, 1, water);
        h = mixn(h, level, water);      // 水面是平的
      }
      const i = y * W + x;
      Hh[i] = h;
      const p = i * 4;
      ai.data[p] = Math.round(clamp01(cr / 255) * 255);
      ai.data[p + 1] = Math.round(clamp01(cg / 255) * 255);
      ai.data[p + 2] = Math.round(clamp01(cb / 255) * 255);
      ai.data[p + 3] = 255;
      oi.data[p] = Math.round(clamp01(ao) * 255);
      oi.data[p + 1] = Math.round(clamp01(rough) * 255);
      oi.data[p + 2] = Math.round(clamp01(metal) * 255);
      oi.data[p + 3] = 255;
    }
  }
  // 法线:高度的坡度。高度 1 = 约 6 厘米;按每像素几米换算成真实的坡度再略夸张一点
  const k = (0.06 / mpp) * 1.5;
  for (let y = 0; y < H; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(H - 1, y + 1);
    for (let x = 0; x < W; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(W - 1, x + 1);
      let nx = -(Hh[y * W + x1] - Hh[y * W + x0]) * 0.5 * k;
      let ny = -(Hh[y1 * W + x] - Hh[y0 * W + x]) * 0.5 * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;
      const p = (y * W + x) * 4;
      ni.data[p] = Math.round((nx * 0.5 + 0.5) * 255);
      ni.data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      ni.data[p + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      ni.data[p + 3] = 255;
    }
  }
  ac.putImageData(ai, 0, 0);
  nc.putImageData(ni, 0, 0);
  oc.putImageData(oi, 0, 0);
  return { albedo: A, normal: N, orm: O };
}

/**
 * 发光的符文石板:深色石面上刻着几行符文(直线和折角拼的抽象符号),刻槽里发光。
 * 返回两张:石面的颜色、刻槽的发光(黑底,亮的地方就是符文)。
 */
export function paintRunes(W: number, H: number, seed: number, rowsN: number): { albedo: Cv; glow: Cv } {
  const albedo = makeCanvas(W, H);
  const glow = makeCanvas(W, H);
  const a = ctxOf(albedo);
  const g = ctxOf(glow);
  a.fillStyle = '#23262b';
  a.fillRect(0, 0, W, H);
  // 石面的斑驳
  const img = a.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const n = pfbm(x / W, y / H, 12, 12, 4, seed + 5);
      const p = (y * W + x) * 4;
      const k = 0.7 + 0.6 * n;
      img.data[p] = Math.round(img.data[p] * k);
      img.data[p + 1] = Math.round(img.data[p + 1] * k);
      img.data[p + 2] = Math.round(img.data[p + 2] * k);
    }
  }
  a.putImageData(img, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  let s = seed * 7919 + 13;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
  const cell = H / (rowsN + 1.2);
  const perRow = Math.floor((W - cell * 0.8) / (cell * 0.78));
  const draw = (ctx: CanvasRenderingContext2D, style: string, width: number, blur: number): void => {
    s = seed * 7919 + 13;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'square';
    ctx.shadowColor = style;
    ctx.shadowBlur = blur;
    for (let row = 0; row < rowsN; row += 1) {
      for (let i = 0; i < perRow; i += 1) {
        const ox = cell * 0.5 + i * cell * 0.78;
        const oy = cell * 0.7 + row * cell;
        const w = cell * 0.5;
        const h = cell * 0.68;
        // 一个符号:一根主竖 + 两三笔斜的 / 横的,落在 3 × 4 的格点上
        const P = (ix: number, iy: number): [number, number] => [ox + (ix / 2) * w, oy + (iy / 3) * h];
        ctx.beginPath();
        const stem = Math.floor(rnd() * 3);
        const [sx0, sy0] = P(stem, 0);
        const [sx1, sy1] = P(stem, 3);
        ctx.moveTo(sx0, sy0);
        ctx.lineTo(sx1, sy1);
        const strokes = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < strokes; k += 1) {
          const [ax, ay] = P(Math.floor(rnd() * 3), Math.floor(rnd() * 4));
          const [bx, by] = P(Math.floor(rnd() * 3), Math.floor(rnd() * 4));
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
        if (rnd() < 0.3) {
          const [dx, dy] = P(Math.floor(rnd() * 3), Math.floor(rnd() * 4));
          ctx.fillStyle = style;
          ctx.fillRect(dx - width, dy - width, width * 2, width * 2);
        }
      }
    }
  };
  draw(a, '#0b0c0e', Math.max(2, cell * 0.075), 0);
  draw(g, '#ffffff', Math.max(1.5, cell * 0.05), cell * 0.12);
  return { albedo, glow };
}

/** 一团软的圆光(中心亮、边上淡出到 0):灯芯外面那圈光晕、火苗的芯子用。白色 + 透明度。 */
export function paintGlow(S: number, power = 2): Cv {
  const cv = makeCanvas(S, S);
  const c = ctxOf(cv);
  const img = c.createImageData(S, S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const d = Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5) * 2;
      const p = (y * S + x) * 4;
      img.data[p] = 255;
      img.data[p + 1] = 255;
      img.data[p + 2] = 255;
      img.data[p + 3] = Math.round(255 * Math.pow(clamp01(1 - d), power));
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}
