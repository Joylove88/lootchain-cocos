import type { Cv } from './G3DTextures';
import { ctxOf, makeCanvas } from './G3DTextures';

/**
 * 野外真 3D 场景 · 程序材质(实验,2026-11-16)。
 *
 * 用户看了第一版程序摆件说「要 3A 级别的效果,参考那个 FPS」(github.com/wquguru/fable52-fps-repro)。
 * 那个演示好看的底子是材质:每种材质都用噪声先算一张「高度」,再从高度推出颜色(凹处暗、凸处亮、裂缝黑)、
 * 法线(高度的坡度)、粗糙度和遮蔽(凹处更糙更暗)—— 四张图说的是同一件事,所以光一打就有真实的凹凸和脏旧感。
 * 这里照这个思路给野外用的岩石 / 树皮 / 风化木 / 铁 / 帆布各写一套,全部按像素算(不是在画布上画线),可无缝平铺。
 *
 * 约定(和 G3DTextures.heightToNormal 一致):法线图 R = 沿 u,G = 沿 v(图像向下);
 * 遮蔽 / 粗糙 / 金属合成一张:R = 遮蔽,G = 粗糙度,B = 金属度(对应内置标准材质的 pbrMap)。
 */
export interface Pbr { albedo: Cv; normal: Cv; orm: Cv }
/** 一个像素的材质:高度 0~1、颜色 0~255、粗糙 / 遮蔽 / 金属 0~1。 */
export interface Px { h: number; r: number; g: number; b: number; rough: number; ao: number; metal: number }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const mixn = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 周期值噪声:x、y 以「格」为单位,每 px / py 格重复一次(贴图要平铺就让周期 = 整张图的格数)。 */
export function pnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wx = (i: number): number => ((i % px) + px) % px;
  const wy = (i: number): number => ((i % py) + py) % py;
  const a = hash(wx(ix), wy(iy), seed);
  const b = hash(wx(ix + 1), wy(iy), seed);
  const c = hash(wx(ix), wy(iy + 1), seed);
  const d = hash(wx(ix + 1), wy(iy + 1), seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** 分形噪声(周期):u、v 是 0~1 的贴图坐标,cx / cy = 最粗一层横竖各几格。 */
export function pfbm(u: number, v: number, cx: number, cy: number, oct: number, seed: number): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  let px = cx;
  let py = cy;
  for (let i = 0; i < oct; i += 1) {
    s += a * pnoise(u * px, v * py, px, py, seed + i * 31);
    n += a;
    a *= 0.5;
    px *= 2;
    py *= 2;
  }
  return s / n;
}

/** 不要求平铺的 3D 值噪声(给网格顶点位移用)。 */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number): number => hash(a + c * 57, b + c * 113, seed);
  const x00 = mixn(h(ix, iy, iz), h(ix + 1, iy, iz), ux);
  const x10 = mixn(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), ux);
  const x01 = mixn(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), ux);
  const x11 = mixn(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), ux);
  return mixn(mixn(x00, x10, uy), mixn(x01, x11, uy), uz);
}
export function fbm3(x: number, y: number, z: number, oct: number, seed: number): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  let f = 1;
  for (let i = 0; i < oct; i += 1) {
    s += a * noise3(x * f, y * f, z * f, seed + i * 19);
    n += a;
    a *= 0.5;
    f *= 2.07;
  }
  return s / n;
}

/**
 * 按像素生成一整套材质贴图。sample(u, v, out) 填这个像素的高度 / 颜色 / 粗糙 / 遮蔽 / 金属;
 * 法线由高度的坡度算(strength 越大凹凸越深),上下左右按平铺回绕。
 */
export function makePbr(S: number, sample: (u: number, v: number, out: Px) => void, strength: number): Pbr {
  const A = makeCanvas(S, S);
  const N = makeCanvas(S, S);
  const O = makeCanvas(S, S);
  const ac = ctxOf(A);
  const nc = ctxOf(N);
  const oc = ctxOf(O);
  const ai = ac.createImageData(S, S);
  const ni = nc.createImageData(S, S);
  const oi = oc.createImageData(S, S);
  const H = new Float32Array(S * S);
  const px: Px = { h: 0, r: 0, g: 0, b: 0, rough: 1, ao: 1, metal: 0 };
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      px.h = 0.5;
      px.rough = 1;
      px.ao = 1;
      px.metal = 0;
      sample((x + 0.5) / S, (y + 0.5) / S, px);
      const i = y * S + x;
      H[i] = px.h;
      const o = i * 4;
      ai.data[o] = Math.round(clamp01(px.r / 255) * 255);
      ai.data[o + 1] = Math.round(clamp01(px.g / 255) * 255);
      ai.data[o + 2] = Math.round(clamp01(px.b / 255) * 255);
      ai.data[o + 3] = 255;
      oi.data[o] = Math.round(clamp01(px.ao) * 255);
      oi.data[o + 1] = Math.round(clamp01(px.rough) * 255);
      oi.data[o + 2] = Math.round(clamp01(px.metal) * 255);
      oi.data[o + 3] = 255;
    }
  }
  const k = strength * (S / 512);
  for (let y = 0; y < S; y += 1) {
    const y0 = (y + S - 1) % S;
    const y1 = (y + 1) % S;
    for (let x = 0; x < S; x += 1) {
      const x0 = (x + S - 1) % S;
      const x1 = (x + 1) % S;
      const dx = H[y * S + x1] - H[y * S + x0];
      const dy = H[y1 * S + x] - H[y0 * S + x];
      let nx = -dx * k;
      let ny = -dy * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;
      const o = (y * S + x) * 4;
      ni.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      ni.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      ni.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      ni.data[o + 3] = 255;
    }
  }
  ac.putImageData(ai, 0, 0);
  nc.putImageData(ni, 0, 0);
  oc.putImageData(oi, 0, 0);
  return { albedo: A, normal: N, orm: O };
}

/**
 * 岩石:几层起伏叠出块面,一张细裂缝网(把坐标扭一下再取噪声的「零线」),零星的坑;
 * 颜色在两种灰褐之间游走、带暖色的锈斑和浅色的地衣;裂缝和坑里又黑又糙。
 */
export function rockPbr(S: number): Pbr {
  return makePbr(S, (u, v, o) => {
    const big = pfbm(u, v, 3, 3, 5, 11);
    const mid = pfbm(u, v, 9, 9, 4, 23);
    const fine = pfbm(u, v, 40, 40, 3, 37);
    // 裂缝:扭曲过的噪声在 0.5 附近的一条细线
    const wx = pfbm(u, v, 5, 5, 3, 51) - 0.5;
    const wy = pfbm(u, v, 5, 5, 3, 67) - 0.5;
    const c1 = Math.abs(pfbm(u + wx * 0.05, v + wy * 0.05, 4, 4, 2, 81) - 0.5);
    const c2 = Math.abs(pfbm(u - wy * 0.04, v + wx * 0.04, 9, 9, 2, 97) - 0.5);
    const crack = Math.max(1 - sstep(0.002, 0.012, c1), 0.6 * (1 - sstep(0.0015, 0.009, c2)));
    // 层理:斜着的一道道薄层
    const strata = 0.5 + 0.5 * Math.sin((v * 34 + u * 9 + big * 7) * Math.PI);
    const pit = sstep(0.74, 0.8, pfbm(u, v, 64, 64, 2, 113));
    let h = 0.52 * big + 0.26 * mid + 0.1 * fine + 0.07 * strata;
    h = h * (1 - 0.62 * crack) - 0.16 * pit;
    o.h = clamp01(h + 0.1);
    const tone = pfbm(u, v, 2, 2, 3, 131);
    const warm = sstep(0.52, 0.72, pfbm(u, v, 4, 4, 4, 149));
    const lichen = sstep(0.66, 0.74, pfbm(u, v, 22, 22, 3, 167)) * sstep(0.45, 0.6, big);
    const shade = (0.62 + 0.62 * h) * (1 - 0.6 * crack) * (1 - 0.35 * pit) * (0.92 + 0.16 * fine);
    // 一块块深浅不同的岩面(低频噪声切成几档)
    const block = Math.floor(pfbm(u, v, 5, 5, 2, 181) * 5) / 5;
    let r = mixn(104, 146, tone) * (0.86 + 0.28 * block);
    let g = mixn(101, 140, tone) * (0.86 + 0.28 * block);
    let b = mixn(98, 130, tone) * (0.86 + 0.28 * block);
    r = mixn(r, 142, warm * 0.55);
    g = mixn(g, 118, warm * 0.55);
    b = mixn(b, 88, warm * 0.55);
    r = mixn(r * shade, 186, lichen * 0.5);
    g = mixn(g * shade, 186, lichen * 0.5);
    b = mixn(b * shade, 164, lichen * 0.5);
    o.r = r;
    o.g = g;
    o.b = b;
    o.rough = 0.8 + 0.14 * fine + 0.06 * crack - 0.05 * lichen;
    o.ao = clamp01(0.45 + 0.75 * h) * (1 - 0.55 * crack);
    o.metal = 0;
  }, 9);
}

/**
 * 树皮:竖着的一道道深沟,沟与沟之间是鼓起来的皮块(横向再被浅裂切成一截一截);
 * plates = true 是松树那种鳞片状的块(更碎、更红),false 是橡树那种长条的深沟。
 */
export function barkPbr(S: number, plates: boolean): Pbr {
  return makePbr(S, (u, v, o) => {
    const warp = pfbm(u, v, 3, 2, 3, 201) - 0.5;
    const cols = plates ? 9 : 13;
    const ridge = pfbm(u + warp * 0.06, v, cols, plates ? 5 : 2, 4, 211);
    // 沟:噪声的「零线」拉成竖条
    const groove = 1 - sstep(0.0, plates ? 0.085 : 0.11, Math.abs(ridge - 0.5));
    const cross = plates ? 1 - sstep(0.0, 0.07, Math.abs(pfbm(u, v + warp * 0.05, 5, 14, 3, 223) - 0.5)) : 0.5 * (1 - sstep(0.0, 0.05, Math.abs(pfbm(u, v, 7, 22, 3, 229) - 0.5)));
    const fine = pfbm(u, v, 48, 24, 3, 239);
    const flake = pfbm(u, v, 18, 9, 3, 251);
    let h = 0.55 + 0.3 * (flake - 0.5) + 0.12 * (fine - 0.5);
    h *= 1 - 0.8 * Math.max(groove, cross * 0.75);
    o.h = clamp01(h + 0.12);
    const tone = pfbm(u, v, 2, 2, 3, 263);
    const moss = sstep(0.62, 0.78, pfbm(u, v, 5, 4, 4, 271)) * (plates ? 0.35 : 0.7);
    const shade = (0.5 + 0.75 * h) * (0.9 + 0.2 * fine);
    let r = plates ? mixn(112, 142, tone) : mixn(104, 128, tone);
    let g = plates ? mixn(88, 110, tone) : mixn(92, 112, tone);
    let b = plates ? mixn(72, 88, tone) : mixn(80, 96, tone);
    r = mixn(r * shade, 96, moss * 0.6);
    g = mixn(g * shade, 116, moss * 0.6);
    b = mixn(b * shade, 62, moss * 0.6);
    o.r = r;
    o.g = g;
    o.b = b;
    o.rough = 0.88 + 0.1 * fine;
    o.ao = clamp01(0.35 + 0.85 * h);
  }, 11);
}

/**
 * 风化的木头(原木 / 木板,纹理顺着竖直方向):密密的木纹 + 几道长裂 + 木节(节周围的木纹绕着走);
 * 颜色偏灰黄,凸起的地方磨得发亮发白。
 */
export function woodPbr(S: number): Pbr {
  const knots: Array<[number, number, number]> = [[0.22, 0.31, 0.05], [0.71, 0.66, 0.045], [0.48, 0.9, 0.035]];
  return makePbr(S, (u, v, o) => {
    // 木节:离节越近,横坐标被往外推得越多(木纹绕开)
    let du = 0;
    let knot = 0;
    for (const k of knots) {
      for (const ox of [-1, 0, 1]) {
        for (const oy of [-1, 0, 1]) {
          const dx = u - k[0] - ox;
          const dy = (v - k[1] - oy) * 0.45;
          const d = Math.hypot(dx, dy);
          if (d < k[2] * 4) {
            const f = Math.exp(-(d * d) / (k[2] * k[2] * 2.2));
            du += Math.sign(dx || 1) * f * k[2] * 0.9;
            knot = Math.max(knot, sstep(k[2] * 1.1, k[2] * 0.35, d));
          }
        }
      }
    }
    const uu = u + du;
    const grain = pfbm(uu, v, 56, 2, 3, 301);
    const band = pfbm(uu, v, 14, 1, 3, 311);
    const split = 1 - sstep(0.0, 0.035, Math.abs(pfbm(uu, v, 7, 1, 2, 321) - 0.5));
    const fine = pfbm(u, v, 90, 30, 2, 331);
    let h = 0.5 + 0.34 * (grain - 0.5) + 0.2 * (band - 0.5) + 0.06 * (fine - 0.5);
    h = h * (1 - 0.75 * split) - 0.25 * knot;
    o.h = clamp01(h + 0.08);
    const tone = pfbm(u, v, 3, 2, 3, 341);
    const grey = sstep(0.4, 0.75, pfbm(u, v, 4, 3, 4, 351));
    const shade = (0.6 + 0.62 * h) * (1 - 0.55 * split);
    let r = mixn(150, 176, tone);
    let g = mixn(116, 140, tone);
    let b = mixn(78, 98, tone);
    // 风吹日晒的地方发灰
    r = mixn(r, 136, grey * 0.55);
    g = mixn(g, 128, grey * 0.55);
    b = mixn(b, 116, grey * 0.55);
    r = mixn(r * shade, 58, knot * 0.8);
    g = mixn(g * shade, 40, knot * 0.8);
    b = mixn(b * shade, 26, knot * 0.8);
    o.r = r;
    o.g = g;
    o.b = b;
    o.rough = 0.74 + 0.2 * (1 - h) + 0.06 * fine;
    o.ao = clamp01(0.5 + 0.7 * h) * (1 - 0.4 * split);
  }, 7);
}

/** 原木的截面:一圈圈年轮 + 从心往外的放射裂 + 锯痕。贴在木桩顶 / 木头的断口上(不平铺)。 */
export function endGrainPbr(S: number): Pbr {
  return makePbr(S, (u, v, o) => {
    const dx = u - 0.5 + (pfbm(u, v, 4, 4, 3, 401) - 0.5) * 0.05;
    const dy = v - 0.5 + (pfbm(u, v, 4, 4, 3, 411) - 0.5) * 0.05;
    const d = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    const ring = 0.5 + 0.5 * Math.sin(d * 58 + pfbm(u, v, 6, 6, 3, 421) * 5);
    const radial = 1 - sstep(0.0, 0.06, Math.abs(Math.sin(ang * 3.5 + pfbm(u, v, 3, 3, 2, 431) * 4))) * sstep(0.08, 0.5, d);
    const crack = sstep(0.82, 1, radial) * sstep(0.1, 0.4, d);
    const saw = 0.5 + 0.5 * Math.sin((u * 0.8 + v * 0.6) * 210);
    const fine = pfbm(u, v, 60, 60, 2, 441);
    let h = 0.5 + 0.2 * (ring - 0.5) + 0.05 * (saw - 0.5) + 0.06 * (fine - 0.5);
    h *= 1 - 0.7 * crack;
    o.h = clamp01(h);
    const k = (0.72 + 0.4 * h) * (1 - 0.5 * crack) * mixn(1, 0.78, sstep(0.75, 1, d));
    o.r = mixn(196, 168, ring * 0.6) * k;
    o.g = mixn(160, 128, ring * 0.6) * k;
    o.b = mixn(112, 84, ring * 0.6) * k;
    o.rough = 0.82;
    o.ao = clamp01(0.6 + 0.5 * h);
  }, 5);
}

/** 铁件:暗的锻铁,带锤打的坑;一块块锈(锈的地方不反光、发橙)。 */
export function ironPbr(S: number): Pbr {
  return makePbr(S, (u, v, o) => {
    const dent = pfbm(u, v, 18, 18, 3, 501);
    const fine = pfbm(u, v, 70, 70, 2, 511);
    const rust = sstep(0.5, 0.68, pfbm(u, v, 6, 6, 5, 521));
    const scratch = 1 - sstep(0.0, 0.03, Math.abs(pfbm(u, v, 40, 3, 2, 531) - 0.5));
    const h = 0.5 + 0.28 * (dent - 0.5) + 0.1 * (fine - 0.5) + 0.08 * rust * (fine - 0.3);
    o.h = clamp01(h);
    const k = 0.75 + 0.5 * h;
    o.r = mixn(74 * k, 132 * (0.7 + 0.5 * fine), rust);
    o.g = mixn(76 * k, 78 * (0.7 + 0.5 * fine), rust);
    o.b = mixn(82 * k, 46 * (0.7 + 0.5 * fine), rust);
    o.rough = mixn(0.42 + 0.2 * fine - 0.12 * scratch, 0.92, rust);
    o.metal = mixn(1, 0.15, rust);
    o.ao = clamp01(0.6 + 0.5 * h);
  }, 5);
}

/** 帆布:经纬线织出来的细格子(法线上看得出布纹),上面是大片的水渍、霉点和磨白的折痕。 */
export function canvasPbr(S: number): Pbr {
  return makePbr(S, (u, v, o) => {
    const wu = Math.sin(u * Math.PI * 2 * 96);
    const wv = Math.sin(v * Math.PI * 2 * 96);
    const weave = 0.5 + 0.25 * wu * (0.6 + 0.4 * Math.sin(v * Math.PI * 2 * 48)) + 0.25 * wv * (0.6 + 0.4 * Math.sin(u * Math.PI * 2 * 48));
    const slub = pfbm(u, v, 30, 4, 3, 601);
    const stain = sstep(0.5, 0.75, pfbm(u, v, 3, 3, 5, 611));
    const mold = sstep(0.7, 0.78, pfbm(u, v, 26, 26, 3, 621)) * sstep(0.45, 0.65, pfbm(u, v, 4, 4, 3, 631));
    const tone = pfbm(u, v, 2, 2, 3, 641);
    o.h = clamp01(0.5 + 0.34 * (weave - 0.5) + 0.12 * (slub - 0.5));
    const k = (0.84 + 0.2 * weave) * (0.94 + 0.12 * slub);
    let r = mixn(196, 214, tone) * k;
    let g = mixn(176, 194, tone) * k;
    let b = mixn(138, 156, tone) * k;
    r = mixn(r, r * 0.7, stain * 0.7);
    g = mixn(g, g * 0.66, stain * 0.7);
    b = mixn(b, b * 0.58, stain * 0.7);
    r = mixn(r, 70, mold * 0.6);
    g = mixn(g, 74, mold * 0.6);
    b = mixn(b, 56, mold * 0.6);
    o.r = r;
    o.g = g;
    o.b = b;
    o.rough = 0.93;
    o.ao = clamp01(0.7 + 0.4 * weave);
  }, 3.2);
}

/** 柔边的暗斑(贴在摆件脚下当接地的暗影):中间实、往外淡出。 */
export function contactBlob(S: number): Cv {
  const c = makeCanvas(S, S);
  const x = ctxOf(c);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.8, 'rgba(0,0,0,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return c;
}
