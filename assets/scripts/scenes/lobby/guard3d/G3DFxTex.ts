import { ctxOf, Cv, fbm, makeCanvas } from './G3DTextures';

/**
 * 技能特效第二张图集(11-22,用户「技能特效需要更酷炫和精致化,目前看起来太简单了」):
 * 1024 × 1024、4 × 4 格,每格 256 —— 比第一张(512、每格 128)细一倍,专画大块的、贴近镜头也要经得起看的东西:
 * 星芒闪光、冲击波环、烟尘、刀痕、光柱、旋风带、长火星、碎石、柔光、剑气月牙、地面冲击环、能量团。
 * 全部白色 + 透明度,颜色由顶点色给(同一格能染成紫 / 金 / 冰蓝)。
 */
export const FX2_CELL = { flare: 0, ring: 1, dust: 2, slash: 3, beam: 4, swirl: 5, spark: 6, debris: 7, glow: 8, crescent: 9, groundRing: 10, energy: 11 };
export const FX2_N = 4;

/** 第二张图集里某一格的贴图坐标(往里收两个多像素,免得相邻格渗过来)。 */
export function fx2Uv(cell: number): [number, number, number, number] {
  const cx = cell % FX2_N;
  const cy = Math.floor(cell / FX2_N);
  const pad = 2.5 / 1024;
  return [cx / FX2_N + pad, cy / FX2_N + pad, (cx + 1) / FX2_N - pad, (cy + 1) / FX2_N - pad];
}

const sat = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function paintFx2Atlas(): Cv {
  const C = 256;
  const S = C * FX2_N;
  const cv = makeCanvas(S, S);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  // 每格一个函数:输入格内坐标 (u, v) ∈ [0,1](v 向下),返回透明度
  const cells: Array<(u: number, v: number) => number> = [];
  // 0 星芒:很亮的小核 + 一圈柔光 + 6 道细光芒(两道横向的更长,像镜头的光斑)
  cells[FX2_CELL.flare] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const r = Math.hypot(x, y);
    const ang = Math.atan2(y, x);
    const core = Math.exp(-r * r * 90);
    const halo = Math.exp(-r * r * 7) * 0.45;
    let rays = 0;
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + 0.26;
      let da = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      da = Math.min(da, Math.PI * 2 - da);
      const len = k === 0 || k === 3 ? 1.0 : 0.62;
      rays += Math.exp(-((da * r * 60) ** 2)) * sat(1 - r / len) ** 1.6 * 0.7;
    }
    const hstreak = Math.exp(-((y * 46) ** 2)) * sat(1 - Math.abs(x)) ** 2 * 0.5;
    return sat(core + halo + rays + hstreak) * sat((1 - r) * 3);
  };
  // 1 冲击波环:内沿一条锐利的亮线,往外是一层渐散的薄雾,里面空
  cells[FX2_CELL.ring] = (u, v) => {
    const r = Math.hypot(u * 2 - 1, v * 2 - 1);
    const edge = Math.exp(-(((r - 0.8) / 0.025) ** 2));
    const mist = sstep(0.5, 0.8, r) * (1 - sstep(0.8, 0.98, r)) * 0.45;
    const n = 0.75 + 0.5 * fbm(Math.atan2(v - 0.5, u - 0.5) * 3 + 10, r * 6, 3, 55);
    return sat((edge * 0.95 + mist * n) * (1 - sstep(0.94, 1.0, r)));
  };
  // 2 烟尘:几层噪声叠出的团,边缘不规则、往外渐散
  cells[FX2_CELL.dust] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const r = Math.hypot(x, y);
    const n = fbm(u * 5 + 3.1, v * 5 + 7.7, 5, 91);
    const shape = sat(1 - r * (0.9 + 0.45 * (1 - n)));
    return sat(shape ** 1.4 * (0.45 + 0.85 * n)) * sat((1 - r) * 4);
  };
  // 3 刀痕:一道弯的、两头尖的亮弧(打中怪身上那一下)
  cells[FX2_CELL.slash] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    // 圆心在下方远处的大圆弧
    const cx = 0;
    const cy = 1.9;
    const R = 2.2;
    const dd = Math.hypot(x - cx, y - cy) - R;
    const taper = sat(1 - Math.abs(x) / 0.92) ** 0.8;
    const core = Math.exp(-((dd / (0.018 + 0.03 * taper)) ** 2)) * taper;
    const glow = Math.exp(-((dd / (0.07 + 0.08 * taper)) ** 2)) * taper * 0.5;
    return sat(core + glow);
  };
  // 4 光柱:横向中间亮两边快速变暗,纵向底部最亮、往上渐隐,带几道往上走的细丝
  cells[FX2_CELL.beam] = (u, v) => {
    const x = u * 2 - 1;
    const h = 1 - v;                // 0 底 → 1 顶
    const core = Math.exp(-((x * 9) ** 2));
    const soft = Math.exp(-((x * 3) ** 2)) * 0.5;
    const fil = 0.7 + 0.6 * fbm(u * 24, h * 2.5, 3, 17);
    const vert = (1 - h) ** 1.3 * sstep(0.0, 0.06, h);
    return sat((core + soft * fil) * vert);
  };
  // 5 旋风带:横向可无缝平铺的风丝(u 方向周期 1),纵向中间浓、上下淡
  cells[FX2_CELL.swirl] = (u, v) => {
    let s = 0;
    for (let k = 0; k < 7; k += 1) {
      const yk = 0.18 + k * 0.105 + 0.03 * Math.sin(u * Math.PI * 2 * (k % 3 + 1) + k);
      const w = 0.012 + 0.01 * ((k * 37) % 5) / 5;
      const len = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 2 + k * 1.7);
      s += Math.exp(-(((v - yk) / w) ** 2)) * sat(len) ** 2;
    }
    const band = Math.exp(-(((v - 0.5) / 0.3) ** 2));
    return sat(s * 0.8 * band + band * 0.12);
  };
  // 6 长火星:横向细长、中间发白的一道(沿速度方向拉长用)
  cells[FX2_CELL.spark] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const len = sat(1 - Math.abs(x)) ** 1.5;
    return sat(Math.exp(-((y * 30) ** 2)) * len + Math.exp(-((y * 10) ** 2)) * len * 0.25);
  };
  // 7 碎石:一块有棱角的石片(不透明的那一格,用半透明网格画,顶点色给石头颜色)
  cells[FX2_CELL.debris] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const ang = Math.atan2(y, x);
    // 六边形 + 噪声起伏的边
    const k = Math.cos(Math.PI / 6) / Math.cos(((ang % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6);
    const edge = 0.62 * k * (0.85 + 0.3 * fbm(ang * 2 + 4, 1.3, 2, 33));
    const r = Math.hypot(x, y);
    return sstep(edge + 0.03, edge - 0.03, r);
  };
  // 8 柔光:平滑的高斯团
  cells[FX2_CELL.glow] = (u, v) => {
    const r = Math.hypot(u * 2 - 1, v * 2 - 1);
    return sat(Math.exp(-r * r * 4.5) * sat((1 - r) * 5));
  };
  // 9 剑气月牙:u = 沿弧(两头尖),v = 横穿(0 前沿最亮的一条线 → 1 后面拖出去的淡雾,带顺着走的细丝)
  cells[FX2_CELL.crescent] = (u, v) => {
    const along = Math.sin(u * Math.PI);
    const taper = along ** 0.7;
    const edgeW = 0.03 + 0.05 * taper;
    const front = 0.16;
    const core = Math.exp(-(((v - front) / edgeW) ** 2)) * taper;
    const wake = v > front ? Math.exp(-(v - front) * (3.4 / Math.max(0.25, taper))) * taper : Math.exp(-(((v - front) / 0.03) ** 2)) * taper;
    const fil = 0.6 + 0.8 * fbm(u * 18, v * 2.2, 3, 29);
    return sat(core + wake * 0.55 * fil) * sstep(0, 0.04, u) * sstep(1, 0.96, u);
  };
  // 10 地面冲击环:比 1 更粗、更碎(贴地扩散的那圈尘浪)
  cells[FX2_CELL.groundRing] = (u, v) => {
    const r = Math.hypot(u * 2 - 1, v * 2 - 1);
    const ang = Math.atan2(v - 0.5, u - 0.5);
    const n = fbm(ang * 4 + 20, r * 9, 4, 77);
    const band = sstep(0.55, 0.82, r) * (1 - sstep(0.84, 0.97, r));
    const edge = Math.exp(-(((r - 0.84) / 0.03) ** 2));
    return sat((band * (0.35 + 0.9 * n) + edge * 0.8) * (1 - sstep(0.95, 1.0, r)));
  };
  // 11 能量团:有细碎纹理的光团(蓄力 / 法术点缀)
  cells[FX2_CELL.energy] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const r = Math.hypot(x, y);
    const n = fbm(u * 7 + 1.7, v * 7 + 9.1, 4, 63);
    const tendrils = sat(1 - Math.abs(n - 0.5) * 7) * 0.8;
    return sat((Math.exp(-r * r * 6) * 0.7 + tendrils * sat(1 - r) ** 1.5) * sat((1 - r) * 4));
  };
  for (let cy = 0; cy < FX2_N; cy += 1) {
    for (let cx = 0; cx < FX2_N; cx += 1) {
      const f = cells[cy * FX2_N + cx];
      if (!f) {
        continue;
      }
      for (let y = 0; y < C; y += 1) {
        for (let x = 0; x < C; x += 1) {
          const a = f((x + 0.5) / C, (y + 0.5) / C);
          const p = ((cy * C + y) * S + cx * C + x) * 4;
          d[p] = 255;
          d[p + 1] = 255;
          d[p + 2] = 255;
          d[p + 3] = Math.round(255 * sat(a));
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
