import type { Cv } from './G3DTextures';
import { ctxOf, makeCanvas, mulberry32 } from './G3DTextures';
import { makePbr, mixn, Pbr, pfbm, sstep } from './G3DFieldTex';
import { NoiseLut, texHash } from './G3DDungeonTex';
import type { MudOut, WetMap } from './G3DWildTex';

/**
 * 主城 3D 小样(中心广场,月夜)用的贴图,全部代码画。
 *
 * 用户:「主城需要做一下」「可以先出原型图吧」→ 看了两版原型后:「按第一版做吧」。
 * 原型(周报截图/2026-11-17_主城3D小样/原型/01_…)里的广场:湿的方石铺地、中间一圈罗盘纹、落着红叶;
 * 四周是石板瓦顶的半木房子,正前方是大教堂(玫瑰窗、尖窗亮着暖光)。
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface CityPlan {
  x0: number; z0: number; w: number; d: number;
  /** 地上的罗盘纹:圆心和外圈半径(米)。 */
  compass: { x: number; z: number; r: number };
  /** 树在哪(落叶在树下密一些)。 */
  trees: Array<[number, number]>;
  wet: number;
}

/**
 * 整个广场的铺地(一张图管全场):错缝铺的方石(每块 26 × 17 厘米,高低、深浅各不相同,边角磨圆),石缝里是黑泥;
 * 中间的罗盘纹:两圈整石镶边,里面的石块一圈圈绕着圆心铺,正中一个八角星(四个长角、四个短角,每个角一半深一半浅)。
 * 刚下过雨:石面是潮的,低洼处和石缝里积着一层水(镜面)。最后在上面撒落叶。
 */
/**
 * 一张可平铺的石板贴图(原型里那种深灰的大块旧石板,GPT 照原型的地面出的):缩好的像素 + 一块铺多少米。
 * j0 / j1 = 石缝的亮度门槛(比 j0 暗是缝,比 j1 亮是石面),mean = 平均亮度,k = 颜色乘多少(夜里的湿石头要压暗)。
 */
export interface StoneTile { size: number; data: Uint8ClampedArray; m: number; j0: number; j1: number; mean: number; k: number; /** 细节版:颜色和法线另由平铺的石板贴图出,这里只要粗糙度 / 积水那张图(落叶也不画在图上) */ detail?: boolean }

export function plazaPbr(W: number, H: number, plan: CityPlan, tile?: StoneTile): MudOut {
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
  const big = new NoiseLut(256, 4, 5, 611);
  const mid = new NoiseLut(256, 16, 4, 623);
  const fine = new NoiseLut(256, 64, 3, 639);
  const warp = new NoiseLut(256, 8, 2, 617);
  const mpp = plan.w / W;
  const level = mixn(0.26, 0.44, plan.wet);
  const wet: WetMap = { cols: Math.ceil(plan.w / 0.25), rows: Math.ceil(plan.d / 0.25), cell: 0.25, data: new Uint8Array(Math.ceil(plan.w / 0.25) * Math.ceil(plan.d / 0.25)) };
  const SW = 0.23;
  const SD = 0.2;
  const C = plan.compass;
  // 八角星:四个长角(正方向)+ 四个短角(斜方向);返回 0 = 不在星里,1 / 2 = 在星里(一个角的两半,一深一浅)
  const star = (dx: number, dz: number): number => {
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4;
      const L = (i % 2 === 0 ? 0.6 : 0.36) * C.r;
      const wd = (i % 2 === 0 ? 0.105 : 0.075) * C.r;
      const p = dx * Math.cos(a) + dz * Math.sin(a);
      const q = -dx * Math.sin(a) + dz * Math.cos(a);
      if (p > 0 && p / L + Math.abs(q) / wd < 1) {
        return q > 0 ? 1 : 2;
      }
    }
    return 0;
  };
  for (let y = 0; y < H; y += 1) {
    const wz = plan.z0 + ((y + 0.5) / H) * plan.d;
    for (let x = 0; x < W; x += 1) {
      const wx = plan.x0 + ((x + 0.5) / W) * plan.w;
      const nb = big.at(wx / 16, wz / 16);
      const nm = mid.at(wx / 6, wz / 6);
      const nf = fine.at(wx / 2.2, wz / 2.2);
      const ng = fine.at(wx / 0.5 + 0.37, wz / 0.5 + 0.11);
      const dx = wx - C.x;
      const dz = wz - C.z;
      const dc = Math.hypot(dx, dz);
      let edge = 0;            // 到这块石头边的距离(米)
      let id = 0;
      let id2 = 0;
      let inlay = 0;           // 0 普通铺地,1 浅色镶嵌,2 深色镶嵌,3 整石圈
      if (dc < C.r) {
        const st = dc < C.r * 0.66 ? star(dx, dz) : 0;
        const band = Math.abs(dc - C.r * 0.955) < C.r * 0.045 || Math.abs(dc - C.r * 0.68) < C.r * 0.022;
        if (st > 0) {
          inlay = st;
          edge = 0.2;
          id = 0.5;
          id2 = 0.5;
        } else if (band) {
          // 整石圈:沿圆周每 0.9 米一块
          inlay = 3;
          const ang = Math.atan2(dz, dx);
          const seg = (ang * dc) / 0.9;
          edge = Math.min(seg - Math.floor(seg), Math.ceil(seg) - seg) * 0.9;
          id = texHash(Math.floor(seg), 7, 641);
          id2 = texHash(Math.floor(seg), 9, 643);
        } else {
          // 绕着圆心一圈圈铺的小方石
          const ring = Math.floor(dc / SD);
          const fr = dc / SD - ring;
          const ang = Math.atan2(dz, dx) + ring * 0.37;
          const arc = (ang * Math.max(0.3, (ring + 0.5) * SD)) / SW;
          const fa = arc - Math.floor(arc);
          edge = Math.min(Math.min(fr, 1 - fr) * SD, Math.min(fa, 1 - fa) * SW);
          id = texHash(Math.floor(arc), ring, 647);
          id2 = texHash(Math.floor(arc), ring, 653);
        }
      } else {
        // 一排一排铺的石板:每排的进深不一样(0.25 ~ 0.45 米),排里每块的宽窄也不一样(0.3 ~ 0.75 米),排与排随机错开 ——
        // 分界线 = 等距的线各自挪一点,所以不会看出规整的格子
        // 第二轮:整片铺地先被缓缓地「揉」一下(一排排的缝不走直线 —— 直的话一眼就是地砖),石角磨圆
        const RD = 0.25;
        const RW = 0.35;
        const ux = wx + (warp.at(wx / 14 + 0.31, wz / 14 + 0.77) - 0.5) * 0.42;
        const uz = wz + (warp.at(wx / 14 + 0.63, wz / 14 + 0.19) - 0.5) * 0.42;
        const zb = (j: number): number => j * RD + (texHash(j, 5, 655) - 0.5) * RD * 0.55;
        let row = Math.floor(uz / RD);
        if (uz < zb(row)) {
          row -= 1;
        } else if (uz >= zb(row + 1)) {
          row += 1;
        }
        const off = texHash(row, 3, 659) * RW;
        const xb = (i: number): number => i * RW - off + (texHash(i, row, 657) - 0.5) * RW * 0.8;
        let col = Math.floor((ux + off) / RW);
        if (ux < xb(col)) {
          col -= 1;
        } else if (ux >= xb(col + 1)) {
          col += 1;
        }
        const ex = Math.min(ux - xb(col), xb(col + 1) - ux);
        const ez = Math.min(uz - zb(row), zb(row + 1) - uz);
        const CR = 0.06;
        edge = ex < CR && ez < CR ? CR - Math.hypot(CR - ex, CR - ez) : Math.min(ex, ez);
        id = texHash(col, row, 661);
        id2 = texHash(col, row, 673);
      }
      edge += (ng - 0.5) * 0.008;
      const body = sstep(0.004, 0.014, edge);
      const round = 1 - sstep(0.008, 0.07, edge);
      // 石面:整片地有很缓的起伏(积水的地方),每块石头高低差一点、顶面略鼓,少数石头陷下去
      const sunk = id2 > 0.93 ? 0.09 : 0;
      // 石面本身是花的:粗粒的斑、细碎的麻点(一片平色就成了地砖)
      const speck = fine.at(wx / 0.3 + id * 5, wz / 0.3 + id2 * 5);
      // 每块石板朝某个方向歪一点(所以水积在低的那一角),表面有浅坑
      const tilt = (Math.sin(wx * 2.1 + id * 40) * 0.5 + Math.cos(wz * 2.3 + id2 * 40) * 0.5) * 0.03;
      const pit = sstep(0.72, 0.8, fine.at(wx / 0.9 + id * 3, wz / 0.9 + id2 * 3));
      let h = 0.42 + 0.42 * (nb - 0.5) + 0.1 * (nm - 0.5) + 0.06 * (id - 0.5) + tilt - sunk + 0.04 * (nf - 0.5) + 0.02 * (ng - 0.5) + 0.02 * (speck - 0.5) - 0.05 * round * round - 0.035 * pit;
      if (inlay > 0) {
        h += 0.02;
      }
      h = mixn(0.12 + 0.05 * nf, h, body);
      // 颜色:青灰的花岗石,每块深浅不同,少数偏褐;镶嵌的星一半浅一半深;整石圈偏浅
      // 颜色压得深(夜里的湿石头),块与块之间只差一点:差太多、太亮就成了一格格的蓝砖
      // 第二轮:块间色差再收一些,底色从青灰改成不偏色的灰(偏蓝的话月光一照整片发蓝),少数石头偏褐
      const tone = (0.86 + 0.28 * id) * (0.8 + 0.4 * nb) * (0.8 + 0.4 * nf) * (0.84 + 0.32 * speck);
      const warm = sstep(0.55, 0.95, id2) * 0.7;
      let cr = mixn(60, 70, warm) * tone;
      let cg = mixn(58, 60, warm) * tone;
      let cb = mixn(56, 50, warm) * tone;
      if (inlay === 1) {
        cr = 80 * (0.86 + 0.28 * nf);
        cg = 79 * (0.86 + 0.28 * nf);
        cb = 76 * (0.86 + 0.28 * nf);
      } else if (inlay === 2) {
        cr = 28 * (0.86 + 0.28 * nf);
        cg = 30 * (0.86 + 0.28 * nf);
        cb = 36 * (0.86 + 0.28 * nf);
      } else if (inlay === 3) {
        cr = 70 * tone;
        cg = 69 * tone;
        cb = 68 * tone;
      }
      cr = mixn(17, cr, body);
      cg = mixn(16, cg, body);
      cb = mixn(16, cb, body);
      let rough = mixn(0.9, 0.58 + 0.2 * (nf - 0.5) + 0.12 * (id - 0.5), body);
      let ao = clamp01(0.5 + 0.5 * sstep(0.004, 0.06, edge));
      // 潮:整片石面都发暗发亮一点;低处积水
      const damp = clamp01(0.5 + 0.8 * (0.5 - nb) + 0.3 * plan.wet);
      cr *= 1 - 0.28 * damp;
      cg *= 1 - 0.26 * damp;
      cb *= 1 - 0.22 * damp;
      rough = mixn(rough, 0.52 + 0.14 * nf, damp * 0.7 * body);          // 潮的石面只是半滑:再滑的话迎着月光看整片泛白
      const water = sstep(0.0, 0.02, level - h);
      if (water > 0) {
        cr = mixn(cr, cr * 0.5, water);
        cg = mixn(cg, cg * 0.52, water);
        cb = mixn(cb, cb * 0.56, water);
        rough = mixn(rough, 0.13, water);
        ao = mixn(ao, 1, water);
        h = mixn(h, level, water);
        if (!tile && water > 0.8 && body > 0.5) {
          wet.data[Math.min(wet.rows - 1, Math.floor((wz - plan.z0) / wet.cell)) * wet.cols + Math.min(wet.cols - 1, Math.floor((wx - plan.x0) / wet.cell))] = 1;
        }
      }
      if (tile) {
        // 第八步(用户:「地面也需要和原型一样」):石面换成原型那种大块旧石板的贴图,上面这段代码算的小石块只留罗盘纹的位置
        let u = (wx / tile.m) % 1;
        if (u < 0) {
          u += 1;
        }
        let v = (wz / tile.m) % 1;
        if (v < 0) {
          v += 1;
        }
        // 双线性取样(就近取样的话近处是一粒粒的像素点)
        const fu = u * tile.size - 0.5;
        const fv = v * tile.size - 0.5;
        const iu = Math.floor(fu);
        const iv = Math.floor(fv);
        const au = fu - iu;
        const av = fv - iv;
        const x0t = (iu + tile.size) % tile.size;
        const x1t = (iu + 1 + tile.size) % tile.size;
        const y0t = ((iv + tile.size) % tile.size) * tile.size;
        const y1t = ((iv + 1 + tile.size) % tile.size) * tile.size;
        const smp = (ch: number): number => {
          const a0 = tile.data[(y0t + x0t) * 4 + ch];
          const b0 = tile.data[(y0t + x1t) * 4 + ch];
          const c0 = tile.data[(y1t + x0t) * 4 + ch];
          const d0 = tile.data[(y1t + x1t) * 4 + ch];
          return a0 + (b0 - a0) * au + (c0 - a0) * av + (a0 - b0 - c0 + d0) * au * av;
        };
        const sr = smp(0);
        const sg = smp(1);
        const sb = smp(2);
        const tl = (sr + sg + sb) / 765;
        const tb = sstep(tile.j0, tile.j1, tl);
        // 罗盘纹:还是这种石板,只是星的两半一浅一深、两圈石带略浅
        const kc = tile.k * (0.84 + 0.32 * nb) * (inlay === 1 ? 2.0 : inlay === 2 ? 0.5 : inlay === 3 ? 1.5 : 1);
        cr = sr * kc;
        cg = sg * kc;
        cb = sb * kc;
        // 石面的细碎明暗只给一点起伏(给多了,积水的边缘和反光会碎成一粒粒的黑点)
        h = 0.42 + 0.42 * (nb - 0.5) + 0.1 * (nm - 0.5) + 0.22 * (tl - tile.mean) + (inlay > 0 ? 0.012 : 0);
        h = mixn(h - 0.12, h, tb);
        rough = mixn(0.92, 0.7 + 0.1 * (nf - 0.5), tb);
        ao = 0.6 + 0.4 * tb;
        // 湿:一大片一大片的水膜(原型里发亮的湿痕),水膜里低的地方和石缝积着水(镜面,映着灯和窗)
        // 罗盘纹那一圈少积水(不然整个被水膜盖住看不清)
        const film = clamp01(sstep(0.39, 0.63, 0.62 * big.at(wx / 26 + 0.2, wz / 26 + 0.6) + 0.38 * nm) * (0.4 + plan.wet)) * (0.35 + 0.65 * sstep(C.r * 0.9, C.r * 1.5, dc));
        cr *= 1 - 0.3 * film;
        cg *= 1 - 0.28 * film;
        cb *= 1 - 0.24 * film;
        rough = mixn(rough, 0.22 + 0.08 * nf, film * (0.5 + 0.5 * tb));
        // 第十二轮:再加一层零散的小水洼(半米到一米一块,不跟大片水膜走)—— 原型里到处是映着灯的小水洼
        // 第十五轮:原型近处满地都是映着灯的小水洼 → 门槛 0.68 → 0.6,水洼多一倍
        const pd = sstep(0.6, 0.7, mid.at(wx / 13 + 0.33, wz / 13 + 0.71)) * (0.35 + 0.65 * sstep(C.r * 0.9, C.r * 1.4, dc));
        const lv = mixn(0.2, 0.47, film) + 0.3 * pd;
        const wt = sstep(0.0, 0.07, lv - h);
        if (wt > 0) {
          cr = mixn(cr, cr * 0.55, wt);
          cg = mixn(cg, cg * 0.57, wt);
          cb = mixn(cb, cb * 0.6, wt);
          rough = mixn(rough, 0.05, wt);
          ao = mixn(ao, 1, wt);
          h = mixn(h, lv, wt);
          if (wt > 0.8) {
            wet.data[Math.min(wet.rows - 1, Math.floor((wz - plan.z0) / wet.cell)) * wet.cols + Math.min(wet.cols - 1, Math.floor((wx - plan.x0) / wet.cell))] = 1;
          }
        }
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
      oi.data[p + 2] = 0;
      oi.data[p + 3] = 255;
    }
  }
  const k = (0.05 / mpp) * 1.4;
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
  // 落叶:枫叶形的小片,暗红到褐,树下密、别处零星
  const rnd = mulberry32(677);
  const leaf = (px: number, py: number, s: number, rot: number, col: string): void => {
    ac.save();
    ac.translate(px, py);
    ac.rotate(rot);
    ac.fillStyle = col;
    ac.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? s : s * 0.6;
      const lx = Math.cos(a) * r;
      const ly = Math.sin(a) * r * 0.9;
      if (i === 0) {
        ac.moveTo(lx, ly);
      } else {
        ac.lineTo(lx, ly);
      }
    }
    ac.closePath();
    ac.fill();
    ac.restore();
  };
  const cols = ['rgba(92,26,20,0.85)', 'rgba(74,22,18,0.85)', 'rgba(98,44,22,0.82)', 'rgba(66,34,22,0.8)', 'rgba(84,20,22,0.85)', 'rgba(58,30,20,0.8)'];
  const drop = (wx: number, wz: number): void => {
    const px = ((wx - plan.x0) / plan.w) * W;
    const py = ((wz - plan.z0) / plan.d) * H;
    leaf(px, py, (0.08 + rnd() * 0.07) / mpp, rnd() * 6.28, cols[Math.floor(rnd() * cols.length)]);
  };
  const leafGeo = !!(tile && tile.detail);          // 细节版:落叶是贴地的小面片(plazaLeaves),不画在这张图上
  for (let i = 0; i < (leafGeo ? 0 : 1300); i += 1) {
    drop(plan.x0 + rnd() * plan.w, plan.z0 + rnd() * plan.d);
  }
  for (const [tx, tz] of leafGeo ? [] : plan.trees) {
    for (let i = 0; i < 150; i += 1) {
      const a = rnd() * 6.28;
      const r = Math.sqrt(rnd()) * 5.5;
      drop(tx + Math.cos(a) * r, tz + Math.sin(a) * r);
    }
  }
  return { albedo: A, normal: N, orm: O, wet };
}

/** 罗盘纹的八角星:四个长角(正方向)+ 四个短角(斜方向);返回 0 = 不在星里,1 / 2 = 在星里(一个角的两半,一深一浅)。 */
function compassStar(r: number, dx: number, dz: number): number {
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4;
    const L = (i % 2 === 0 ? 0.6 : 0.36) * r;
    const wd = (i % 2 === 0 ? 0.105 : 0.075) * r;
    const p = dx * Math.cos(a) + dz * Math.sin(a);
    const q = -dx * Math.sin(a) + dz * Math.cos(a);
    if (p > 0 && p / L + Math.abs(q) / wd < 1) {
      return q > 0 ? 1 : 2;
    }
  }
  return 0;
}

/**
 * 石板地面(细节版)每个顶点的颜色倍数:大片的深浅、水膜压暗、罗盘纹(星的两半一浅一深、两圈石带略浅)。
 * 和 plazaPbr 里石板那一段用同一套噪声,所以压暗的地方正好是粗糙度图里发亮的水膜。
 */
export function plazaTint(plan: CityPlan, k: number): (wx: number, wz: number) => [number, number, number] {
  const big = new NoiseLut(256, 4, 5, 611);
  const mid = new NoiseLut(256, 16, 4, 623);
  const C = plan.compass;
  return (wx: number, wz: number): [number, number, number] => {
    const nb = big.at(wx / 16, wz / 16);
    const nm = mid.at(wx / 6, wz / 6);
    const dx = wx - C.x;
    const dz = wz - C.z;
    const dc = Math.hypot(dx, dz);
    let inlay = 0;
    if (dc < C.r) {
      const st = dc < C.r * 0.66 ? compassStar(C.r, dx, dz) : 0;
      if (st > 0) {
        inlay = st;
      } else if (Math.abs(dc - C.r * 0.955) < C.r * 0.045 || Math.abs(dc - C.r * 0.68) < C.r * 0.022) {
        inlay = 3;
      }
    }
    const kc = k * (0.84 + 0.32 * nb) * (inlay === 1 ? 2.0 : inlay === 2 ? 0.5 : inlay === 3 ? 1.5 : 1);
    const film = clamp01(sstep(0.39, 0.63, 0.62 * big.at(wx / 26 + 0.2, wz / 26 + 0.6) + 0.38 * nm) * (0.4 + plan.wet)) * (0.35 + 0.65 * sstep(C.r * 0.9, C.r * 1.5, dc));
    return [kc * (1 - 0.3 * film), kc * (1 - 0.28 * film), kc * (1 - 0.24 * film)];
  };
}

/** 广场地上的落叶(位置、大小、朝向、颜色):和以前画在地面贴图上的是同一批,树下密、别处零星。 */
export function plazaLeaves(plan: CityPlan): Array<{ x: number; z: number; s: number; rot: number; col: [number, number, number] }> {
  const rnd = mulberry32(677);
  // 第十二轮:原型地上的红叶又多又显眼 → 数量加倍、大一点、红一点
  const cols: Array<[number, number, number]> = [[96, 24, 18], [80, 20, 16], [100, 38, 20], [70, 30, 18], [90, 20, 18], [62, 28, 18]];          // 暗红(太亮的话像一片片发光的贴纸)
  const out: Array<{ x: number; z: number; s: number; rot: number; col: [number, number, number] }> = [];
  const drop = (x: number, z: number): void => {
    const s = 0.1 + rnd() * 0.09;
    const rot = rnd() * 6.28;
    const c = cols[Math.floor(rnd() * cols.length)];
    out.push({ x, z, s, rot, col: [c[0] / 255, c[1] / 255, c[2] / 255] });
  };
  for (let i = 0; i < 2600; i += 1) {
    drop(plan.x0 + rnd() * plan.w, plan.z0 + rnd() * plan.d);
  }
  for (const [tx, tz] of plan.trees) {
    for (let i = 0; i < 260; i += 1) {
      const a = rnd() * 6.28;
      const r = Math.sqrt(rnd()) * 5.5;
      drop(tx + Math.cos(a) * r, tz + Math.sin(a) * r);
    }
  }
  return out;
}

/**
 * 石板贴图按原始精度出一套可平铺的颜色图和法线图(细节版地面用:每 m 米铺一次,比整张地面那张图细三四倍)。
 * 高度 = 石面的明暗(先糊一下:直接用的话是一粒粒的噪点)+ 石缝往下陷;j0 / j1 = 石缝的亮度门槛,mean = 平均亮度。
 */
export function stoneTileMaps(src: CanvasImageSource, S: number, m: number, j0: number, j1: number, mean: number): { albedo: Cv; normal: Cv } {
  const A = makeCanvas(S, S);
  const ac = ctxOf(A);
  ac.drawImage(src, 0, 0, S, S);
  const d = ac.getImageData(0, 0, S, S).data;
  const L = new Float32Array(S * S);
  for (let i = 0; i < S * S; i += 1) {
    L[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
  }
  // 方框模糊(首尾相接:贴图是平铺的)
  const blur = (inp: Float32Array, r: number): Float32Array => {
    const tmp = new Float32Array(S * S);
    const out = new Float32Array(S * S);
    const n = 2 * r + 1;
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        let s = 0;
        for (let k = -r; k <= r; k += 1) {
          s += inp[y * S + ((x + k + S) % S)];
        }
        tmp[y * S + x] = s / n;
      }
    }
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        let s = 0;
        for (let k = -r; k <= r; k += 1) {
          s += tmp[((y + k + S) % S) * S + x];
        }
        out[y * S + x] = s / n;
      }
    }
    return out;
  };
  const soft = blur(L, Math.round(3 * S / 1024));
  const edge = blur(L, Math.max(1, Math.round(S / 1024)));
  // 第十轮(用户看了第九轮:石面本身没有颗粒、偏平):石面起伏加深一点(0.3 → 0.42)、石缝更深(0.085 → 0.11);
  // 再叠一层很细的石粒(两层平铺的小噪声,1 ~ 2 厘米一粒):颜色只差 ±6%,法线上是细密的麻面 —— 别成粗颗粒
  const gA = new NoiseLut(256, 128, 2, 731);
  const gB = new NoiseLut(256, 256, 1, 733);
  const grain = new Float32Array(S * S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      grain[y * S + x] = 0.6 * gA.at(x / S, y / S) + 0.4 * gB.at(x / S, y / S) - 0.5;
    }
  }
  const Hh = new Float32Array(S * S);
  for (let i = 0; i < S * S; i += 1) {
    const h = 0.42 * (soft[i] - mean) + 0.012 * grain[i];
    Hh[i] = mixn(h - 0.11, h, sstep(j0, j1, edge[i]));
  }
  {
    const ai = ac.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i += 1) {
      const k = 1 + 0.12 * grain[i];
      ai.data[i * 4] = Math.min(255, ai.data[i * 4] * k);
      ai.data[i * 4 + 1] = Math.min(255, ai.data[i * 4 + 1] * k);
      ai.data[i * 4 + 2] = Math.min(255, ai.data[i * 4 + 2] * k);
    }
    ac.putImageData(ai, 0, 0);
  }
  const N = makeCanvas(S, S);
  const nc = ctxOf(N);
  const ni = nc.createImageData(S, S);
  const k = (0.05 / (m / S)) * 1.4;
  for (let y = 0; y < S; y += 1) {
    const ya = ((y - 1 + S) % S) * S;
    const yb = ((y + 1) % S) * S;
    for (let x = 0; x < S; x += 1) {
      let nx = -(Hh[y * S + ((x + 1) % S)] - Hh[y * S + ((x - 1 + S) % S)]) * 0.5 * k;
      let ny = -(Hh[yb + x] - Hh[ya + x]) * 0.5 * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;
      const p = (y * S + x) * 4;
      ni.data[p] = Math.round((nx * 0.5 + 0.5) * 255);
      ni.data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      ni.data[p + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      ni.data[p + 3] = 255;
    }
  }
  nc.putImageData(ni, 0, 0);
  return { albedo: A, normal: N };
}

/** 石板瓦屋顶(可平铺):一排排长方的薄石片,上一排压着下一排(每片下沿厚、上沿薄),排与排错半片;青灰,片片深浅不同。 */
export function slatePbr(S: number): Pbr {
  return makePbr(S, (u, v, o) => {
    const rows = 10;
    const colsN = 7;
    const fv = v * rows;
    const row = Math.floor(fv);
    const tv = fv - row;                      // 0 = 这一排的上沿,1 = 下沿
    const fu = u * colsN + (row % 2) * 0.5;
    const col = Math.floor(fu);
    const tu = fu - col;
    const id = texHash(col % colsN, row, 701);
    const id2 = texHash(col % colsN, row, 709);
    const n = pfbm(u, v, 24, 24, 3, 713);
    const gap = 1 - sstep(0.02, 0.06, Math.min(tu, 1 - tu));
    const lip = sstep(0.86, 0.98, tv);        // 下沿一条棱
    o.h = 0.25 + 0.5 * tv + 0.08 * (id - 0.5) + 0.05 * (n - 0.5) - 0.3 * gap - 0.25 * (1 - sstep(0.0, 0.05, tv));
    const tone = (0.72 + 0.5 * id) * (0.86 + 0.28 * n) * (1 - 0.35 * gap) * (0.8 + 0.2 * tv);
    const moss = sstep(0.8, 0.95, id2) * 0.5;
    o.r = mixn(58, 52, moss) * tone;
    o.g = mixn(64, 70, moss) * tone;
    o.b = mixn(78, 56, moss) * tone;
    o.rough = 0.76 + 0.16 * n + 0.08 * moss;          // 石板瓦是哑的:再滑一点,迎着月光的那面屋顶整片反白
    o.ao = 1 - 0.5 * gap - 0.25 * lip * 0;
  }, 2.2);
}

/**
 * 乱石墙(可平铺):大小不一的毛石一块块垒起来,石缝里是深色的灰浆;石头偏扁、表面鼓出来,深灰里带一点褐。
 * 第四轮(用户:「继续磨建筑」):原型里铁匠铺和房子的底层都是这种深色的乱石墙,不是整齐的浅色方石。
 */
export function rubblePbr(S: number): Pbr {
  const NX = 6;
  const NY = 9;
  return makePbr(S, (u, v, o) => {
    const cu = u * NX;
    const cv = v * NY;
    const i0 = Math.floor(cu);
    const j0 = Math.floor(cv);
    let f1 = 9;
    let f2 = 9;
    let ia = 0;
    let ja = 0;
    for (let dj = -1; dj <= 1; dj += 1) {
      for (let di = -1; di <= 1; di += 1) {
        const a = (((i0 + di) % NX) + NX) % NX;
        const b = (((j0 + dj) % NY) + NY) % NY;
        const px = i0 + di + 0.15 + 0.7 * texHash(a, b, 811);
        const py = j0 + dj + 0.2 + 0.6 * texHash(a, b, 823);
        const d = Math.hypot(cu - px, (cv - py) * 1.2);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          ia = a;
          ja = b;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    const id = texHash(ia, ja, 829);
    const id2 = texHash(ia, ja, 839);
    const edge = f2 - f1;
    const body = sstep(0.04, 0.15, edge);
    const n = pfbm(u, v, 20, 20, 3, 841);
    const fine = pfbm(u, v, 64, 64, 2, 853);
    o.h = body * (0.5 + 0.24 * (id - 0.5) + 0.2 * (1 - Math.min(1, f1 * 1.3)) + 0.1 * (n - 0.5) + 0.05 * (fine - 0.5)) + (1 - body) * 0.1;
    const tone = (0.68 + 0.56 * id) * (0.82 + 0.36 * n) * (0.9 + 0.2 * fine);
    const warm = sstep(0.55, 0.95, id2);
    o.r = mixn(24, mixn(86, 100, warm) * tone, body);
    o.g = mixn(23, mixn(86, 88, warm) * tone, body);
    o.b = mixn(22, mixn(90, 76, warm) * tone, body);
    o.rough = 0.86 + 0.1 * n;
    o.ao = 0.45 + 0.55 * sstep(0.02, 0.2, edge);
  }, 2.4);
}

/** 灰泥墙(可平铺):抹得不太平的旧灰泥,米灰色,带水渍和脱皮的暗斑。 */
export function plasterPbr(S: number): Pbr {
  return makePbr(S, (u, v, o) => {
    const big = pfbm(u, v, 3, 3, 4, 721);
    const mid = pfbm(u, v, 12, 12, 3, 727);
    const fine = pfbm(u, v, 48, 48, 2, 733);
    const streak = pfbm(u, v * 0.2, 14, 3, 3, 739);          // 竖着流下来的水渍
    const patch = sstep(0.66, 0.72, pfbm(u, v, 5, 5, 3, 743));      // 脱皮
    o.h = 0.5 + 0.2 * (big - 0.5) + 0.12 * (mid - 0.5) + 0.05 * (fine - 0.5) - 0.12 * patch;
    const tone = (0.78 + 0.34 * big) * (0.92 + 0.16 * fine) * (1 - 0.28 * sstep(0.5, 0.8, streak)) * (1 - 0.3 * patch);
    o.r = 168 * tone;
    o.g = 158 * tone;
    o.b = 140 * tone;
    o.rough = 0.88;
    o.ao = 1 - 0.25 * patch;
  }, 1.0);
}

/**
 * 亮着灯的窗(带透明边):kind = 'house' 方格窗;'lancet' 尖拱长窗(教堂);'rose' 玫瑰窗(圆的,花瓣状的石棂)。
 * 玻璃是暖黄的,上亮下暗、每格略有不同;窗棂是深色的。透明的地方露出后面的墙。
 */
export function paintWindow(kind: 'house' | 'lancet' | 'rose', W: number, H: number, seed: number): Cv {
  const cv = makeCanvas(W, H);
  const c = ctxOf(cv);
  const rnd = mulberry32(seed);
  c.clearRect(0, 0, W, H);
  const glass = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgb(255,214,140)');
    g.addColorStop(0.55, 'rgb(236,160,78)');
    g.addColorStop(1, 'rgb(150,84,36)');
    return g;
  };
  if (kind === 'house') {
    // 第三轮:菱格的铅条窗(原型里房子的窗都是这种),中间一根竖棂、上面一道横档,把窗分成四扇
    c.fillStyle = 'rgb(26,20,16)';
    c.fillRect(0, 0, W, H);
    const gx = W * 0.07;
    const gy = H * 0.06;
    const gw = W * 0.86;
    const gh = H * 0.88;
    c.fillStyle = glass(0, 0, 0, H);
    c.fillRect(gx, gy, gw, gh);
    c.save();
    c.beginPath();
    c.rect(gx, gy, gw, gh);
    c.clip();
    // 每块小玻璃深浅不同
    for (let i = 0; i < 26; i += 1) {
      c.fillStyle = `rgba(40,20,8,${(0.08 + rnd() * 0.22).toFixed(2)})`;
      c.fillRect(gx + rnd() * gw, gy + rnd() * gh, gw * 0.2, gh * 0.14);
    }
    c.strokeStyle = 'rgba(36,26,18,0.92)';
    c.lineWidth = Math.max(1.5, W * 0.016);
    const step = W / 5.2;
    for (let k = -H; k < W + H; k += step) {
      c.beginPath();
      c.moveTo(k, 0);
      c.lineTo(k + H, H);
      c.moveTo(k, H);
      c.lineTo(k + H, 0);
      c.stroke();
    }
    c.restore();
    c.fillStyle = 'rgb(30,22,16)';
    c.fillRect(W / 2 - W * 0.035, gy, W * 0.07, gh);
    c.fillRect(gx, gy + gh * 0.34 - H * 0.022, gw, H * 0.044);
  } else if (kind === 'lancet') {
    // 第三轮:加花格 —— 一根竖棂把窗分成两扇小尖窗,尖顶里一个圆
    const arch = (inset: number): void => {
      c.beginPath();
      c.moveTo(inset, H - inset);
      c.lineTo(inset, H * 0.3);
      c.quadraticCurveTo(inset, H * 0.08, W / 2, inset);
      c.quadraticCurveTo(W - inset, H * 0.08, W - inset, H * 0.3);
      c.lineTo(W - inset, H - inset);
      c.closePath();
    };
    arch(1);
    c.fillStyle = 'rgb(34,30,30)';
    c.fill();
    arch(W * 0.12);
    c.fillStyle = glass(0, 0, 0, H);
    c.fill();
    c.save();
    arch(W * 0.12);
    c.clip();
    c.strokeStyle = 'rgb(36,30,28)';
    c.lineCap = 'round';
    c.lineWidth = Math.max(2, W * 0.075);
    c.beginPath();
    c.moveTo(W / 2, H * 0.36);
    c.lineTo(W / 2, H);
    c.stroke();
    for (const [x0, x1] of [[W * 0.12, W / 2], [W / 2, W * 0.88]]) {
      const xm = (x0 + x1) / 2;
      c.beginPath();
      c.moveTo(x0, H * 0.4);
      c.quadraticCurveTo(x0, H * 0.3, xm, H * 0.265);
      c.quadraticCurveTo(x1, H * 0.3, x1, H * 0.4);
      c.stroke();
    }
    c.beginPath();
    c.arc(W / 2, H * 0.185, W * 0.17, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = Math.max(1.5, W * 0.045);
    for (const k of [0.56, 0.72, 0.88]) {
      c.beginPath();
      c.moveTo(W * 0.12, H * k);
      c.lineTo(W * 0.88, H * k);
      c.stroke();
    }
    c.restore();
  } else {
    const R = W * 0.49;
    c.beginPath();
    c.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    c.fillStyle = 'rgb(40,36,36)';
    c.fill();
    const g = c.createRadialGradient(W / 2, H / 2, R * 0.05, W / 2, H / 2, R);
    g.addColorStop(0, 'rgb(255,220,150)');
    g.addColorStop(0.6, 'rgb(232,156,80)');
    g.addColorStop(1, 'rgb(150,80,40)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(W / 2, H / 2, R * 0.9, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgb(44,38,36)';
    c.lineCap = 'round';
    // 石棂:十二片花瓣(外圈一圈小圆 + 往圆心收的辐条)+ 中间一个小圆
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      c.lineWidth = R * 0.05;
      c.beginPath();
      c.moveTo(W / 2 + Math.cos(a) * R * 0.2, H / 2 + Math.sin(a) * R * 0.2);
      c.lineTo(W / 2 + Math.cos(a) * R * 0.9, H / 2 + Math.sin(a) * R * 0.9);
      c.stroke();
      const b = a + Math.PI / 12;
      c.lineWidth = R * 0.04;
      c.beginPath();
      c.arc(W / 2 + Math.cos(b) * R * 0.7, H / 2 + Math.sin(b) * R * 0.7, R * 0.17, 0, Math.PI * 2);
      c.stroke();
    }
    c.lineWidth = R * 0.06;
    for (const k of [0.2, 0.48, 0.9]) {
      c.beginPath();
      c.arc(W / 2, H / 2, R * k, 0, Math.PI * 2);
      c.stroke();
    }
  }
  return cv;
}

/** 月亮:一个边缘略软的圆盘,上面有几块暗斑。贴在天上的一块小板上(画进天空图里的话只是一团糊)。 */
export function paintMoon(S: number): Cv {
  const cv = makeCanvas(S, S);
  const c = ctxOf(cv);
  const img = c.createImageData(S, S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const u = (x + 0.5) / S - 0.5;
      const v = (y + 0.5) / S - 0.5;
      const r = Math.hypot(u, v) / 0.46;
      const a = 1 - sstep(0.94, 1.0, r);
      const n = pfbm(u + 0.5, v + 0.5, 3, 3, 4, 761);
      const n2 = pfbm(u + 0.5, v + 0.5, 9, 9, 3, 769);
      const mare = sstep(0.5, 0.62, n) * 0.3 + sstep(0.56, 0.66, n2) * 0.12;
      const limb = 1 - 0.25 * r * r;
      const k = (1 - mare) * limb;
      const p = (y * S + x) * 4;
      img.data[p] = Math.round(232 * k);
      img.data[p + 1] = Math.round(238 * k);
      img.data[p + 2] = Math.round(255 * k);
      img.data[p + 3] = Math.round(255 * clamp01(a));
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/**
 * 远处的城:一长条屋顶、尖塔、城墙圆塔的剪影(透明底,横向首尾相接),零星几扇亮着的窗。贴在围着广场的一圈弧面上。
 */
export function paintSkyline(W: number, H: number, seed: number): Cv {
  const cv = makeCanvas(W, H);
  const c = ctxOf(cv);
  const rnd = mulberry32(seed);
  c.clearRect(0, 0, W, H);
  let x = 0;
  const lights: Array<[number, number]> = [];
  while (x < W) {
    const kind = rnd();
    const w = 40 + rnd() * 70;
    const base = H;
    const shade = 16 + Math.floor(rnd() * 12);
    c.fillStyle = `rgb(${shade},${shade + 4},${shade + 12})`;
    if (kind < 0.62) {
      // 一栋房子:墙 + 人字顶 + 烟囱
      const wall = H * (0.2 + rnd() * 0.16);
      const roof = wall + w * (0.3 + rnd() * 0.25);
      c.beginPath();
      c.moveTo(x, base);
      c.lineTo(x, base - wall);
      c.lineTo(x + w / 2, base - roof);
      c.lineTo(x + w, base - wall);
      c.lineTo(x + w, base);
      c.closePath();
      c.fill();
      c.fillRect(x + w * (0.15 + rnd() * 0.5), base - roof * 0.92, 7, roof * 0.3);
      if (rnd() < 0.55) {
        lights.push([x + w * (0.25 + rnd() * 0.5), base - wall * (0.45 + rnd() * 0.35)]);
      }
    } else if (kind < 0.82) {
      // 尖塔
      const body = H * (0.4 + rnd() * 0.25);
      const tw = 16 + rnd() * 14;
      c.fillRect(x + w / 2 - tw / 2, base - body, tw, body);
      c.beginPath();
      c.moveTo(x + w / 2 - tw / 2 - 2, base - body);
      c.lineTo(x + w / 2, base - body - H * (0.2 + rnd() * 0.16));
      c.lineTo(x + w / 2 + tw / 2 + 2, base - body);
      c.closePath();
      c.fill();
      if (rnd() < 0.5) {
        lights.push([x + w / 2, base - body * 0.7]);
      }
    } else {
      // 城墙的圆塔:顶上一圈垛口
      const body = H * (0.34 + rnd() * 0.14);
      const tw = 30 + rnd() * 16;
      c.fillRect(x + w / 2 - tw / 2, base - body, tw, body);
      for (let i = 0; i < 4; i += 1) {
        c.fillRect(x + w / 2 - tw / 2 - 2 + (i * (tw + 4)) / 4, base - body - 7, (tw + 4) / 8, 8);
      }
      c.fillRect(x, base - H * 0.2, w, H * 0.2);
    }
    x += w * (0.75 + rnd() * 0.2);
  }
  for (const [lx, ly] of lights) {
    c.fillStyle = 'rgba(226,150,70,0.9)';
    c.fillRect(lx - 2, ly - 3, 4, 6);
  }
  const g = c.createLinearGradient(0, H * 0.82, 0, H);
  g.addColorStop(0, 'rgba(18,22,32,0)');
  g.addColorStop(1, 'rgba(18,22,32,1)');
  c.fillStyle = g;
  c.fillRect(0, H * 0.82, W, H * 0.18);
  return cv;
}
