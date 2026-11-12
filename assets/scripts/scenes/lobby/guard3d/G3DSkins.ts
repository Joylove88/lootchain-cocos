import { ImageAsset, Texture2D, TextureCube } from 'cc';
import { clamp, ctxOf, Cv, fbm, hash2, heightToNormal, lerp, makeCanvas, mulberry32, smooth, vnoise } from './G3DTextures';

/**
 * 守卫战全 3D 样板 · 角色 / 特效 / 环境反射用的程序贴图。全是代码现画的,没有图片文件。
 * 角色贴图都是可平铺的小图(布纹、金属、皮革):颜色靠顶点色调,贴图只管质感。
 * 特效贴图一律「白色 + 形状放在透明度里」:加色和半透明两种混合都能用,颜色交给顶点色。
 */

/** 逐像素画一张图:f 返回 [r, g, b, a](0..1)。 */
function pixels(w: number, h: number, f: (x: number, y: number, out: number[]) => void): Cv {
  const cv = makeCanvas(w, h);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const out = [0, 0, 0, 1];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      out[3] = 1;
      f(x, y, out);
      const i = (y * w + x) * 4;
      d[i] = Math.round(clamp(out[0], 0, 1) * 255);
      d[i + 1] = Math.round(clamp(out[1], 0, 1) * 255);
      d[i + 2] = Math.round(clamp(out[2], 0, 1) * 255);
      d[i + 3] = Math.round(clamp(out[3], 0, 1) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** 可平铺的值噪声(周期 = per 格)。 */
function tnoise(x: number, y: number, per: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const w = (i: number): number => ((i % per) + per) % per;
  return lerp(lerp(hash2(w(ix), w(iy), seed), hash2(w(ix + 1), w(iy), seed), ux), lerp(hash2(w(ix), w(iy + 1), seed), hash2(w(ix + 1), w(iy + 1), seed), ux), uy);
}
function tfbm(u: number, v: number, cells: number, oct: number, seed: number): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  let p = cells;
  for (let o = 0; o < oct; o += 1) {
    s += a * tnoise(u * p, v * p, p, seed + o * 31);
    n += a;
    a *= 0.5;
    p *= 2;
  }
  return s / n;
}

export interface Skin { albedo: Cv; normal: Cv; orm?: Cv }

/** 粗麻 / 棉布:经纬线一上一下。颜色接近白(靠顶点色调),只带一点线头深浅。 */
export function paintCloth(S = 256, threads = 40): Skin {
  const height = pixels(S, S, (x, y, o) => {
    const u = (x / S) * threads;
    const v = (y / S) * threads;
    const a = Math.abs(Math.sin(Math.PI * u));
    const b = Math.abs(Math.sin(Math.PI * v));
    const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
    const hgt = over ? 0.35 + 0.65 * a * (0.6 + 0.4 * b) : 0.35 + 0.65 * b * (0.6 + 0.4 * a);
    const n = tfbm(x / S, y / S, 24, 3, 77);
    const g = clamp(hgt * 0.8 + (n - 0.5) * 0.25, 0, 1);
    o[0] = g;
    o[1] = g;
    o[2] = g;
  });
  const albedo = pixels(S, S, (x, y, o) => {
    const u = (x / S) * threads;
    const v = (y / S) * threads;
    const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
    const big = tfbm(x / S, y / S, 3, 4, 91);
    const fine = tfbm(x / S, y / S, 40, 2, 93);
    const g = 0.8 + (over ? 0.04 : -0.03) + (big - 0.5) * 0.16 + (fine - 0.5) * 0.1;
    o[0] = g;
    o[1] = g * 0.99;
    o[2] = g * 0.97;
  });
  return { albedo, normal: heightToNormal(height, 2.2, true) };
}

/** 锻铁 / 钢:锤痕 + 划痕 + 零星锈点。粗糙度图里划痕更亮(更糙),锈点不反光。 */
export function paintMetal(S = 256): Skin {
  const rnd = mulberry32(4242);
  // 划痕:先在一张小画布上画线,再逐像素取
  const scr = makeCanvas(S, S);
  const sc = ctxOf(scr);
  sc.fillStyle = '#000';
  sc.fillRect(0, 0, S, S);
  sc.lineCap = 'round';
  for (let i = 0; i < 46; i += 1) {
    const x = rnd() * S;
    const y = rnd() * S;
    const ang = (rnd() - 0.5) * 0.9 + (rnd() < 0.3 ? Math.PI / 2 : 0);
    const len = (0.03 + rnd() * 0.14) * S;
    sc.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.3})`;
    sc.lineWidth = 0.5 + rnd() * 0.6;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        sc.beginPath();
        sc.moveTo(x + ox, y + oy);
        sc.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
        sc.stroke();
      }
    }
  }
  const sd = sc.getImageData(0, 0, S, S).data;
  const rust = (x: number, y: number): number => smooth(0.66, 0.78, tfbm(x / S, y / S, 5, 4, 505)) * smooth(0.35, 0.7, tfbm(x / S, y / S, 22, 2, 506));
  const height = pixels(S, S, (x, y, o) => {
    const dents = tfbm(x / S, y / S, 7, 3, 501);
    const s = sd[(y * S + x) * 4] / 255;
    const g = clamp(0.5 + (dents - 0.5) * 0.55 - s * 0.22 + rust(x, y) * 0.12, 0, 1);
    o[0] = g;
    o[1] = g;
    o[2] = g;
  });
  const albedo = pixels(S, S, (x, y, o) => {
    const big = tfbm(x / S, y / S, 4, 4, 502);
    const s = sd[(y * S + x) * 4] / 255;
    const r = rust(x, y);
    const g = 0.78 + (big - 0.5) * 0.22 + s * 0.14;
    o[0] = lerp(g, 0.42, r);
    o[1] = lerp(g, 0.25, r);
    o[2] = lerp(g * 1.02, 0.15, r);
  });
  const orm = pixels(S, S, (x, y, o) => {
    const big = tfbm(x / S, y / S, 6, 3, 503);
    const s = sd[(y * S + x) * 4] / 255;
    const r = rust(x, y);
    o[0] = 1 - r * 0.25;
    o[1] = clamp(lerp(0.34 + (big - 0.5) * 0.3 + s * 0.3, 0.9, r), 0.05, 1);
    o[2] = 1 - r * 0.85;
  });
  return { albedo, normal: heightToNormal(height, 1.6, true), orm };
}

/** 皮革:细碎的皮纹。 */
export function paintLeather(S = 256): Skin {
  const height = pixels(S, S, (x, y, o) => {
    const cells = tfbm(x / S, y / S, 36, 2, 811);
    const ridged = 1 - Math.abs(cells - 0.5) * 2;
    const g = clamp(0.25 + ridged * 0.6 + (tfbm(x / S, y / S, 6, 3, 812) - 0.5) * 0.2, 0, 1);
    o[0] = g;
    o[1] = g;
    o[2] = g;
  });
  const albedo = pixels(S, S, (x, y, o) => {
    const g = 0.78 + (tfbm(x / S, y / S, 5, 4, 813) - 0.5) * 0.3 + (tfbm(x / S, y / S, 48, 2, 814) - 0.5) * 0.12;
    o[0] = g;
    o[1] = g * 0.97;
    o[2] = g * 0.94;
  });
  return { albedo, normal: heightToNormal(height, 1.8, true) };
}

/** 符纸:旧黄纸上几笔朱砂(抽象笔画,不是真字)。 */
export function paintTalisman(): Cv {
  const W = 64;
  const H = 128;
  const cv = makeCanvas(W, H);
  const c = ctxOf(cv);
  const rnd = mulberry32(88);
  c.fillStyle = '#b89a52';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i += 1) {
    c.fillStyle = `rgba(${60 + rnd() * 40},${40 + rnd() * 30},${10 + rnd() * 20},${0.05 + rnd() * 0.08})`;
    c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 5, 1 + rnd() * 3);
  }
  c.strokeStyle = 'rgba(128,24,14,0.9)';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = 3.2;
  c.beginPath();
  c.moveTo(32, 14);
  c.lineTo(32, 110);
  c.stroke();
  for (let i = 0; i < 7; i += 1) {
    const y = 20 + i * 13 + rnd() * 3;
    const hw = 8 + rnd() * 14;
    c.lineWidth = 2 + rnd() * 1.6;
    c.beginPath();
    c.moveTo(32 - hw, y + (rnd() - 0.5) * 6);
    c.quadraticCurveTo(32, y - 4 + rnd() * 8, 32 + hw, y + (rnd() - 0.5) * 6);
    c.stroke();
  }
  c.lineWidth = 2;
  c.strokeRect(6, 6, W - 12, H - 12);
  return cv;
}

// ───────────────────────── 特效图集(4 × 4 格,每格 128)─────────────────────────
export const FX_CELL = { glow: 0, core: 1, streak: 2, star: 3, smokeA: 4, smokeB: 5, ring: 6, bolt: 7, flameA: 8, flameB: 9, ember: 10, shock: 11, crack: 12, wisp: 13, rain: 14, mote: 15 };
export const FX_N = 4;

/** 图集里某一格的贴图坐标(往里收半个像素多一点,免得相邻格渗过来)。 */
export function fxUv(cell: number): [number, number, number, number] {
  const cx = cell % FX_N;
  const cy = Math.floor(cell / FX_N);
  const pad = 2.5 / 512;
  return [cx / FX_N + pad, cy / FX_N + pad, (cx + 1) / FX_N - pad, (cy + 1) / FX_N - pad];
}

export function paintFxAtlas(): Cv {
  const C = 128;
  const S = C * FX_N;
  const rnd = mulberry32(31337);
  // 裂纹格:几道从中心放射出去的折线,先画到小画布
  const crack = makeCanvas(C, C);
  const cc2 = ctxOf(crack);
  cc2.fillStyle = '#000';
  cc2.fillRect(0, 0, C, C);
  cc2.strokeStyle = '#fff';
  cc2.lineCap = 'round';
  for (let k = 0; k < 9; k += 1) {
    let ang = (k / 9) * Math.PI * 2 + rnd() * 0.5;
    let x = C / 2;
    let y = C / 2;
    let w = 3.2;
    for (let st = 0; st < 9 && w > 0.4; st += 1) {
      const len = 5 + rnd() * 5;
      ang += (rnd() - 0.5) * 0.9;
      const nx = x + Math.cos(ang) * len;
      const ny = y + Math.sin(ang) * len;
      cc2.lineWidth = w;
      cc2.beginPath();
      cc2.moveTo(x, y);
      cc2.lineTo(nx, ny);
      cc2.stroke();
      x = nx;
      y = ny;
      w *= 0.8;
    }
  }
  const cd = cc2.getImageData(0, 0, C, C).data;
  return pixels(S, S, (px, py, o) => {
    const cell = Math.floor(py / C) * FX_N + Math.floor(px / C);
    const lx = (px % C) + 0.5;
    const ly = (py % C) + 0.5;
    const u = lx / C - 0.5;      // -0.5..0.5
    const v = ly / C - 0.5;
    const r = Math.hypot(u, v) * 2;   // 0 中心,1 贴边
    const edge = smooth(1.0, 0.82, Math.max(Math.abs(u), Math.abs(v)) * 2);   // 格子边上一律收到 0
    let a = 0;
    switch (cell) {
      case FX_CELL.glow:
        a = Math.exp(-r * r * 4.5);
        break;
      case FX_CELL.core:
        a = Math.exp(-r * r * 22) + 0.35 * Math.exp(-r * r * 5);
        break;
      case FX_CELL.streak:
        a = Math.exp(-(v * v) * 900) * Math.exp(-(u * u) * 14) + 0.25 * Math.exp(-(v * v) * 120) * Math.exp(-(u * u) * 20);
        break;
      case FX_CELL.star:
        a = Math.exp(-r * r * 30) + 0.8 * Math.exp(-(v * v) * 2600) * Math.exp(-(u * u) * 9) + 0.8 * Math.exp(-(u * u) * 2600) * Math.exp(-(v * v) * 9);
        break;
      case FX_CELL.smokeA:
      case FX_CELL.smokeB: {
        const sd = cell === FX_CELL.smokeA ? 11 : 57;
        const n = fbm(lx * 0.045 + sd, ly * 0.045, 4, sd);
        a = smooth(1.0, 0.25, r + (n - 0.5) * 0.9) * (0.55 + 0.45 * fbm(lx * 0.1, ly * 0.1 + sd, 3, sd + 3));
        break;
      }
      case FX_CELL.ring:
        a = Math.exp(-((r - 0.74) * (r - 0.74)) * 520);
        break;
      case FX_CELL.bolt:   // 闪电条带的横截面:沿 u 不变,v 方向中间一条亮芯 + 两边的辉光
        a = Math.exp(-(v * v) * 700) + 0.4 * Math.exp(-(v * v) * 70) + 0.12 * Math.exp(-(v * v) * 14);
        a *= 0.85 + 0.15 * vnoise(lx * 0.3, 3.3, 9);
        break;
      case FX_CELL.flameA:
      case FX_CELL.flameB: {
        const sd = cell === FX_CELL.flameA ? 3 : 29;
        const t = 0.5 - v;                       // 0 底 → 1 顶
        const wdt = 0.36 * Math.pow(Math.max(0, 1 - t), 0.6) * (0.35 + 0.65 * smooth(0, 0.22, t));
        const wob = (fbm(ly * 0.05 + sd, 1.7, 3, sd) - 0.5) * 0.3 * t;
        const d = Math.abs(u - wob) / Math.max(0.01, wdt);
        a = smooth(1, 0.15, d) * smooth(1.0, 0.75, t) * (0.6 + 0.4 * fbm(lx * 0.07 + sd, ly * 0.09, 3, sd + 7));
        break;
      }
      case FX_CELL.ember:
        a = smooth(0.45, 0.2, r) + 0.3 * Math.exp(-r * r * 6);
        break;
      case FX_CELL.shock:
        a = smooth(0.66, 0.88, r) * smooth(0.98, 0.9, r) * (0.75 + 0.25 * vnoise(Math.atan2(v, u) * 7, r * 9, 5));
        break;
      case FX_CELL.crack:
        a = (cd[(Math.floor(ly) * C + Math.floor(lx)) * 4] / 255) * smooth(1.0, 0.5, r);
        break;
      case FX_CELL.wisp: {
        const n = fbm(lx * 0.035 + 9, ly * 0.07, 4, 71);
        a = smooth(0.42, 0.75, n) * Math.exp(-(u * u) * 14) * smooth(0.5, 0.2, Math.abs(v));
        break;
      }
      case FX_CELL.rain:
        a = Math.exp(-(u * u) * 5200) * smooth(0.5, 0.1, Math.abs(v)) * 0.9;
        break;
      case FX_CELL.mote:
        a = Math.exp(-r * r * 40);
        break;
      default:
        a = 0;
    }
    o[0] = 1;
    o[1] = 1;
    o[2] = 1;
    o[3] = clamp(a, 0, 1) * edge;
  });
}

/** 光柱:一片从上往下的光,带竖向的丝缕;上亮下淡,左右柔边。白色 + 透明度。 */
export function paintShaft(W = 128, H = 256): Cv {
  return pixels(W, H, (x, y, o) => {
    const u = (x + 0.5) / W - 0.5;
    const t = (y + 0.5) / H;                  // 0 顶 → 1 底
    const streak = 0.55 + 0.45 * fbm(x * 0.09, t * 1.3, 3, 21) + 0.25 * (fbm(x * 0.33, t * 0.6, 2, 23) - 0.5);
    const side = Math.exp(-(u * u) * 26);
    const fade = smooth(0, 0.08, t) * (1 - 0.7 * smooth(0.25, 1, t)) * smooth(1, 0.9, t);
    o[0] = 1;
    o[1] = 1;
    o[2] = 1;
    o[3] = clamp(streak, 0, 1.2) * side * fade;
  });
}

/** 薄雾:一团软的云絮(可横向平铺),白色 + 透明度。 */
export function paintHaze(S = 256): Cv {
  return pixels(S, S, (x, y, o) => {
    const v = (y + 0.5) / S - 0.5;
    const n = tfbm(x / S, y / S, 3, 5, 404);
    const m = tfbm(x / S, y / S, 9, 3, 405);
    o[0] = 1;
    o[1] = 1;
    o[2] = 1;
    o[3] = smooth(0.38, 0.72, n + (m - 0.5) * 0.3) * Math.exp(-(v * v) * 11);
  });
}

/** 法阵:几圈同心环 + 刻度 + 八个方位的短纹(抽象几何)。白色 + 透明度。 */
export function paintRune(S = 512): Cv {
  const cv = makeCanvas(S, S);
  const c = ctxOf(cv);
  const R = S / 2;
  c.translate(R, R);
  c.strokeStyle = '#fff';
  c.fillStyle = '#fff';
  const ring = (r: number, w: number, a: number): void => {
    c.globalAlpha = a;
    c.lineWidth = w;
    c.beginPath();
    c.arc(0, 0, r * R, 0, Math.PI * 2);
    c.stroke();
  };
  ring(0.93, 5, 0.95);
  ring(0.86, 1.6, 0.7);
  ring(0.62, 3, 0.85);
  ring(0.57, 1.2, 0.6);
  ring(0.26, 2.4, 0.8);
  c.globalAlpha = 0.8;
  for (let i = 0; i < 64; i += 1) {
    const a = (i / 64) * Math.PI * 2;
    const long = i % 8 === 0;
    c.lineWidth = long ? 3 : 1.4;
    c.beginPath();
    c.moveTo(Math.cos(a) * 0.86 * R, Math.sin(a) * 0.86 * R);
    c.lineTo(Math.cos(a) * (long ? 0.74 : 0.81) * R, Math.sin(a) * (long ? 0.74 : 0.81) * R);
    c.stroke();
  }
  // 八个方位:三道短横(有断有连),像卦象但不照搬
  const rnd = mulberry32(8);
  for (let k = 0; k < 8; k += 1) {
    c.save();
    c.rotate((k / 8) * Math.PI * 2);
    for (let row = 0; row < 3; row += 1) {
      const y = -(0.66 + row * 0.045) * R;
      const broken = rnd() < 0.5;
      c.globalAlpha = 0.9;
      if (broken) {
        c.fillRect(-0.075 * R, y, 0.06 * R, 0.022 * R);
        c.fillRect(0.015 * R, y, 0.06 * R, 0.022 * R);
      } else {
        c.fillRect(-0.075 * R, y, 0.15 * R, 0.022 * R);
      }
    }
    c.restore();
  }
  // 内圈:交错的两个方框 + 中心点
  c.globalAlpha = 0.75;
  c.lineWidth = 2.2;
  for (let k = 0; k < 2; k += 1) {
    c.save();
    c.rotate((k * Math.PI) / 4);
    c.strokeRect(-0.4 * R, -0.4 * R, 0.8 * R, 0.8 * R);
    c.restore();
  }
  c.globalAlpha = 0.9;
  c.beginPath();
  c.arc(0, 0, 0.05 * R, 0, Math.PI * 2);
  c.fill();
  // 把亮度挪到透明度里(白色 + 透明度)
  const img = c.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.putImageData(img, 0, 0);
  return cv;
}

/** 焦痕:中间黑、边缘碎的一块(黑色 + 透明度)。 */
export function paintScorch(S = 256): Cv {
  return pixels(S, S, (x, y, o) => {
    const u = (x + 0.5) / S - 0.5;
    const v = (y + 0.5) / S - 0.5;
    const r = Math.hypot(u, v) * 2;
    const n = fbm(x * 0.03, y * 0.03, 4, 606);
    const ray = fbm(Math.atan2(v, u) * 5 + 3, r * 2, 3, 607);
    o[0] = 0.02;
    o[1] = 0.018;
    o[2] = 0.016;
    o[3] = smooth(1.0, 0.2, r + (n - 0.5) * 0.7 + (ray - 0.5) * 0.35) * 0.88;
  });
}

/** 暗角(黑色 + 透明度):贴在镜头前。 */
export function paintVignette(S = 256): Cv {
  return pixels(S, S, (x, y, o) => {
    const u = (x + 0.5) / S - 0.5;
    const v = (y + 0.5) / S - 0.5;
    const r = Math.hypot(u * 1.0, v * 1.15) * 2;
    o[0] = 0;
    o[1] = 0;
    o[2] = 0;
    o[3] = smooth(0.66, 1.4, r) * 0.66;
  });
}

// ───────────────────────── 环境反射(立方体贴图)─────────────────────────
export interface EnvLobe { dir: [number, number, number]; color: [number, number, number]; width: number }

/**
 * 环境反射图:夜空的渐变 + 几团方向光(月亮、火盆、水晶、敌方火光)+ 暗的地面。金属盔甲和湿石头靠它才有「反光」。
 * 每一级多级渐远都按更宽的光团重新算一遍(相当于预先模糊),粗糙的表面取到的就是糊的。
 * 六个面按图形接口的立方体约定展开:+x、-x、+y、-y、+z、-z。
 */
export function buildEnvCube(lobes: EnvLobe[], sky: [number, number, number], horizon: [number, number, number], ground: [number, number, number], size = 64): TextureCube {
  const faces: Array<(s: number, t: number) => [number, number, number]> = [
    (s, t) => [1, -t, -s], (s, t) => [-1, -t, s], (s, t) => [s, 1, t], (s, t) => [s, -1, -t], (s, t) => [s, -t, 1], (s, t) => [-s, -t, -1],
  ];
  const norm = lobes.map((l) => {
    const m = Math.hypot(l.dir[0], l.dir[1], l.dir[2]);
    return { d: [l.dir[0] / m, l.dir[1] / m, l.dir[2] / m], c: l.color, w: l.width };
  });
  const textures: Texture2D[] = [];
  let level = 0;
  for (let sz = size; sz >= 1; sz = sz >> 1, level += 1) {
    const blur = level * 0.16;   // 每降一级,光团再宽一些、地平线再糊一些
    for (let f = 0; f < 6; f += 1) {
      const cv = pixels(sz, sz, (x, y, o) => {
        const s = ((x + 0.5) / sz) * 2 - 1;
        const t = ((y + 0.5) / sz) * 2 - 1;
        const d = faces[f](s, t);
        const m = Math.hypot(d[0], d[1], d[2]);
        const dx = d[0] / m;
        const dy = d[1] / m;
        const dz = d[2] / m;
        const up = smooth(-0.12 - blur, 0.3 + blur, dy);
        const k = smooth(0.0, 0.75, dy);
        let r = lerp(ground[0], lerp(horizon[0], sky[0], k), up);
        let g = lerp(ground[1], lerp(horizon[1], sky[1], k), up);
        let b = lerp(ground[2], lerp(horizon[2], sky[2], k), up);
        for (const l of norm) {
          const cs = dx * l.d[0] + dy * l.d[1] + dz * l.d[2];
          const w = l.w + blur * 0.9;
          const a = Math.exp((cs - 1) / (w * w)) * (l.w * l.w) / (w * w);   // 变宽的同时总量守恒
          r += l.c[0] * a;
          g += l.c[1] * a;
          b += l.c[2] * a;
        }
        o[0] = r;
        o[1] = g;
        o[2] = b;
      });
      const tx = new Texture2D();
      tx.image = new ImageAsset(cv);
      textures.push(tx);
    }
  }
  const cube = TextureCube.fromTexture2DArray(textures);
  cube.setFilters(TextureCube.Filter.LINEAR, TextureCube.Filter.LINEAR);
  cube.setMipFilter(TextureCube.Filter.LINEAR);
  return cube;
}

// ───────────────────────── 精细化(2026-11-12 用户:「水晶和英雄看起来太糊了」)─────────────────────────
/** 两个方向周期各自给的可平铺噪声(发丝这种一个方向密、一个方向稀的纹理)。 */
function tn2(x: number, y: number, px: number, py: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wx = (i: number): number => ((i % px) + px) % px;
  const wy = (i: number): number => ((i % py) + py) % py;
  return lerp(lerp(hash2(wx(ix), wy(iy), seed), hash2(wx(ix + 1), wy(iy), seed), ux), lerp(hash2(wx(ix), wy(iy + 1), seed), hash2(wx(ix + 1), wy(iy + 1), seed), ux), uy);
}

/**
 * 晶体:贴图的 u 绕晶柱一圈(可平铺),v = 0(图的上边)是晶尖、v = 1 是晶根。
 * - 颜色:根部深蓝、往尖上变浅,带絮状的内含物;
 * - 法线:一道道横向的生长纹 + 细碎的裂隙,高光才会碎成一条一条而不是一整片;
 * - 自发光:芯子里流动的亮脉 + 零星的亮点,越往尖上越亮。
 */
export function paintCrystal(S = 512): { albedo: Cv; normal: Cv; emissive: Cv } {
  // 内部的裂隙:十几道斜着的直线(真的晶体里是一片片平的解理面,不是弯弯曲曲的水波),横向可平铺
  const fr = makeCanvas(S, S);
  const fc = ctxOf(fr);
  const rnd = mulberry32(7719);
  fc.fillStyle = '#000';
  fc.fillRect(0, 0, S, S);
  fc.lineCap = 'round';
  for (let i = 0; i < 26; i += 1) {
    const x = rnd() * S;
    const y = (0.08 + rnd() * 0.84) * S;
    const ang = (rnd() < 0.5 ? 1 : -1) * (0.25 + rnd() * 0.75);
    const len = (0.06 + rnd() * 0.2) * S;
    const a = 0.25 + rnd() * 0.6;
    for (const ox of [-S, 0, S]) {
      fc.strokeStyle = `rgba(255,255,255,${a * 0.3})`;
      fc.lineWidth = 5;
      fc.beginPath();
      fc.moveTo(x + ox - Math.sin(ang) * len, y - Math.cos(ang) * len);
      fc.lineTo(x + ox + Math.sin(ang) * len, y + Math.cos(ang) * len);
      fc.stroke();
      fc.strokeStyle = `rgba(255,255,255,${a})`;
      fc.lineWidth = 1.3;
      fc.stroke();
    }
  }
  const fd = fc.getImageData(0, 0, S, S).data;
  const crack = (x: number, y: number): number => fd[(y * S + x) * 4] / 255;
  const height = pixels(S, S, (x, y, o) => {
    const t = y / S;
    const lines = 0.5 + 0.5 * Math.sin(t * 170 + 3 * tfbm(x / S, t, 3, 2, 772));
    const fine = tfbm(x / S, t, 48, 2, 773);
    const g = clamp(0.5 + (lines - 0.5) * 0.26 + (fine - 0.5) * 0.12 - crack(x, y) * 0.45, 0, 1);
    o[0] = g;
    o[1] = g;
    o[2] = g;
  });
  const albedo = pixels(S, S, (x, y, o) => {
    const tip = 1 - y / S;
    const cloud = tfbm(x / S, (y / S) * 0.35, 3, 3, 774);
    const k = clamp(0.1 + 0.66 * tip + (cloud - 0.5) * 0.1, 0, 1);
    const c = crack(x, y);
    o[0] = lerp(0.03, 0.36, k) + c * 0.3;
    o[1] = lerp(0.12, 0.64, k) + c * 0.34;
    o[2] = lerp(0.25, 0.82, k) + c * 0.34;
  });
  const emissive = pixels(S, S, (x, y, o) => {
    const tip = 1 - y / S;
    const core = 0.06 + 0.4 * smooth(0.0, 0.92, tip);
    const speck = hash2(x >> 1, y >> 1, 778) > 0.9978 ? 0.8 : 0;
    const e = clamp(core * (0.9 + 0.1 * tfbm(x / S, (y / S) * 0.3, 2, 2, 776)) + speck + crack(x, y) * 0.75, 0, 1);
    o[0] = lerp(0.02, 0.55, e * e);
    o[1] = lerp(0.1, 0.96, e);
    o[2] = lerp(0.3, 1.0, Math.sqrt(e));
  });
  return { albedo, normal: heightToNormal(height, 2.2, true), emissive };
}

/** 脸壳覆盖的经纬范围(度):经度 ±FACE.th(0 = 正前),纬度 FACE.p0 ~ FACE.p1。画脸和建脸壳用同一份。 */
export const FACE = { th: 70, p0: -60, p1: 55 };

/**
 * 老者的脸(画在一张图上,贴到头的正面):肤色的明暗、眼窝、杏仁眼(眼白 / 虹膜 / 高光 / 上眼线)、
 * 白而长的寿眉、鼻翼的影子、法令纹、嘴、额纹、鱼尾纹。纯手画的矢量,不拿任何现成图。
 */
export function paintFace(S = 512): Cv {
  const cv = makeCanvas(S, S);
  const c = ctxOf(cv);
  const rnd = mulberry32(1881);
  const X = (th: number): number => ((th + FACE.th) / (2 * FACE.th)) * S;
  const Y = (ph: number): number => (1 - (ph - FACE.p0) / (FACE.p1 - FACE.p0)) * S;
  const kx = S / (2 * FACE.th);
  const ky = S / (FACE.p1 - FACE.p0);
  const blob = (th: number, ph: number, rth: number, rph: number, color: string): void => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/,[^,]*\)$/, ',0)'));
    c.save();
    c.translate(X(th), Y(ph));
    c.scale(rth * kx, rph * ky);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 1, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  // 底色 + 大块明暗:两侧和下颌暗下去,额头、鼻梁、颧骨提亮
  c.fillStyle = 'rgb(166,138,122)';
  c.fillRect(0, 0, S, S);
  blob(0, 28, 34, 22, 'rgba(206,172,146,0.5)');
  blob(0, -2, 12, 30, 'rgba(206,170,146,0.36)');
  for (const s of [1, -1]) {
    blob(s * 66, 0, 26, 70, 'rgba(96,60,44,0.62)');
    blob(s * 30, -6, 13, 9, 'rgba(210,174,148,0.4)');      // 颧骨的亮面
    blob(s * 33, -22, 15, 12, 'rgba(110,68,52,0.42)');     // 颧骨下的凹陷
    blob(s * 30, -9, 13, 9, 'rgba(176,84,62,0.14)');       // 一点血色
    blob(s * 21, 5, 13, 8.5, 'rgba(84,48,38,0.5)');        // 眼窝
    blob(s * 21, -3.5, 10, 4, 'rgba(120,74,58,0.32)');     // 眼袋
    blob(s * 7.5, -9.5, 4.2, 3.4, 'rgba(70,38,30,0.5)');   // 鼻翼的影子
  }
  blob(0, -52, 60, 16, 'rgba(92,58,44,0.6)');
  blob(0, 52, 60, 10, 'rgba(120,84,64,0.4)');
  // 皮肤的细碎斑驳
  for (let i = 0; i < 900; i += 1) {
    const v = rnd();
    c.fillStyle = v < 0.5 ? `rgba(120,76,58,${0.03 + rnd() * 0.05})` : `rgba(240,204,172,${0.03 + rnd() * 0.05})`;
    c.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2.2, 1 + rnd() * 2.2);
  }
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const line = (pts: number[][], width: number, color: string): void => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(X(pts[0][0]), Y(pts[0][1]));
    if (pts.length === 3) {
      c.quadraticCurveTo(X(pts[1][0]), Y(pts[1][1]), X(pts[2][0]), Y(pts[2][1]));
    } else {
      for (let i = 1; i < pts.length; i += 1) {
        c.lineTo(X(pts[i][0]), Y(pts[i][1]));
      }
    }
    c.stroke();
  };
  // 额纹(三道,每道下面跟一线亮边)
  for (const [ph, a] of [[23, 0.3], [28.5, 0.26], [34, 0.2]]) {
    line([[-24, ph - 1.2], [0, ph + 1.4], [24, ph - 1.2]], 1.8, `rgba(96,58,44,${a})`);
    line([[-24, ph - 2.4], [0, ph + 0.2], [24, ph - 2.4]], 1.4, `rgba(236,198,166,${a * 0.6})`);
  }
  line([[-2.2, 13], [-2.8, 18]], 1.6, 'rgba(96,58,44,0.3)');     // 眉间纹
  line([[2.2, 13], [2.8, 18]], 1.6, 'rgba(96,58,44,0.3)');
  for (const s of [1, -1]) {
    // 眼睛:先画眼白,再把虹膜裁在眼眶里
    const eye = (): void => {
      c.beginPath();
      c.moveTo(X(s * 13), Y(3));
      c.quadraticCurveTo(X(s * 21.5), Y(8.4), X(s * 30.5), Y(3.6));
      c.quadraticCurveTo(X(s * 21.5), Y(-0.2), X(s * 13), Y(3));
      c.closePath();
    };
    eye();
    c.fillStyle = 'rgb(214,206,192)';
    c.fill();
    c.save();
    eye();
    c.clip();
    c.fillStyle = 'rgba(60,40,34,0.35)';                            // 上眼睑投在眼白上的影子
    c.fillRect(X(s * 21.5) - 60, Y(8.4), 120, 2.4 * ky);
    c.fillStyle = 'rgb(58,40,28)';
    c.beginPath();
    c.arc(X(s * 21.2), Y(3.9), 3.0 * kx, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgb(12,9,8)';
    c.beginPath();
    c.arc(X(s * 21.2), Y(3.9), 1.35 * kx, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,250,240,0.92)';
    c.beginPath();
    c.arc(X(s * 21.2 - 1.2), Y(5.0), 0.62 * kx, 0, Math.PI * 2);
    c.fill();
    c.restore();
    line([[s * 12.4, 2.8], [s * 21.5, 8.9], [s * 31.6, 3.9]], 3.4, 'rgb(40,24,18)');      // 上眼线
    line([[s * 13.6, 2.6], [s * 21.5, -0.5], [s * 30.2, 3.2]], 1.5, 'rgba(70,42,32,0.7)'); // 下眼睑
    line([[s * 13, 6.6], [s * 21.5, 11.6], [s * 31, 7.2]], 1.6, 'rgba(84,50,38,0.5)');     // 双眼皮褶
    for (const [dph, a] of [[4.5, 0.4], [1.5, 0.45], [-2.2, 0.36]]) {                      // 鱼尾纹
      line([[s * 32.5, 3.6 + dph * 0.25], [s * 39, 3.8 + dph]], 1.3, `rgba(90,54,42,${a})`);
    }
    // 寿眉:一根根白毛,内侧短而上扬,外侧长而下垂
    for (let i = 0; i < 90; i += 1) {
      const t = rnd();
      const th = 8.5 + t * 29;
      const ph = 11.2 + 3.4 * Math.sin(t * Math.PI * 0.9) - t * 2.2 + (rnd() - 0.5) * 2.6;
      const len = 2.4 + rnd() * 2.6 + t * 2.4;
      const ang = (-12 + t * 46 + (rnd() - 0.5) * 30) * (Math.PI / 180);
      const g = 190 + Math.floor(rnd() * 60);
      line([[s * th, ph], [s * (th + Math.cos(ang) * len), ph - Math.sin(ang) * len]], 1 + rnd() * 1.3, `rgba(${g},${g},${g - 8},${0.55 + rnd() * 0.4})`);
    }
    line([[s * 8, -9], [s * 12, -17], [s * 17, -27]], 2.2, 'rgba(92,54,42,0.42)');          // 法令纹
    line([[s * 9.4, -8.6], [s * 13.4, -17], [s * 18.4, -26.6]], 1.6, 'rgba(236,196,164,0.22)');
  }
  // 八字胡:从鼻下往两边嘴角外撇下去的一根根白须
  for (const s of [1, -1]) {
    for (let i = 0; i < 70; i += 1) {
      const t = rnd();
      const th0 = 1.5 + t * 6 + (rnd() - 0.5) * 2;
      const ph0 = -15.5 - t * 2 + (rnd() - 0.5) * 1.6;
      const th1 = th0 + 6 + t * 9 + rnd() * 3;
      const ph1 = ph0 - 9 - t * 12 - rnd() * 5;
      const g = 196 + Math.floor(rnd() * 56);
      line([[s * th0, ph0], [s * (th0 + (th1 - th0) * 0.7), ph0 - 1.5], [s * th1, ph1]], 1.1 + rnd() * 1.5, `rgba(${g},${g},${g - 6},${0.6 + rnd() * 0.36})`);
    }
  }
  // 嘴:一道线 + 下唇的亮面(大半被胡须盖住)
  line([[-8.5, -23.4], [0, -24.6], [8.5, -23.4]], 2.6, 'rgb(92,50,42)');
  blob(0, -27.5, 7.5, 2.6, 'rgba(206,150,128,0.5)');
  blob(0, -31.5, 9, 2.4, 'rgba(96,58,46,0.32)');
  return cv;
}

/** 衣饰的回纹饰边(可横向平铺):深褐底上暗金线的回纹,上下各压一道金边。8 个纹样一行。 */
export function paintTrim(W = 512, H = 64): Cv {
  const cv = makeCanvas(W, H);
  const c = ctxOf(cv);
  const rnd = mulberry32(64);
  c.fillStyle = 'rgb(48,33,25)';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 500; i += 1) {
    c.fillStyle = `rgba(${20 + rnd() * 60},${14 + rnd() * 40},${10 + rnd() * 30},${0.08 + rnd() * 0.12})`;
    c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  const gold = (a: number): string => `rgba(176,136,70,${a})`;
  c.lineCap = 'square';
  c.lineJoin = 'miter';
  const cell = W / 8;
  for (let k = 0; k < 8; k += 1) {
    const x0 = k * cell;
    c.strokeStyle = gold(0.86 + rnd() * 0.12);
    c.lineWidth = 4.2;
    c.beginPath();
    const P = (x: number, y: number, first = false): void => (first ? c.moveTo(x0 + x, y) : c.lineTo(x0 + x, y));
    P(6, 46, true);
    P(6, 18);
    P(58, 18);
    P(58, 46);
    P(20, 46);
    P(20, 30);
    P(44, 30);
    c.stroke();
  }
  c.fillStyle = gold(0.95);
  c.fillRect(0, 3, W, 4);
  c.fillRect(0, H - 7, W, 4);
  c.fillStyle = 'rgba(232,196,120,0.5)';
  c.fillRect(0, 3, W, 1.2);
  c.fillRect(0, H - 7, W, 1.2);
  // 磨旧:随手蹭掉几处金线
  for (let i = 0; i < 70; i += 1) {
    c.fillStyle = `rgba(48,33,25,${0.25 + rnd() * 0.4})`;
    c.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 7, 1 + rnd() * 2.4);
  }
  return cv;
}

/** 发丝:顺着 v 方向的一根根细丝(u 方向很密、v 方向很长),颜色近白,靠顶点色调成灰白。 */
export function paintHair(S = 256): Skin {
  const strand = (x: number, y: number): number => {
    const a = tn2((x / S) * 96, (y / S) * 3, 96, 3, 901);
    const b = tn2((x / S) * 40, (y / S) * 2, 40, 2, 902);
    const c2 = tn2((x / S) * 160, (y / S) * 5, 160, 5, 903);
    return clamp(a * 0.5 + b * 0.3 + c2 * 0.2, 0, 1);
  };
  const height = pixels(S, S, (x, y, o) => {
    const g = strand(x, y);
    o[0] = g;
    o[1] = g;
    o[2] = g;
  });
  const albedo = pixels(S, S, (x, y, o) => {
    const g = 0.52 + 0.48 * Math.pow(strand(x, y), 0.8);
    o[0] = g;
    o[1] = g;
    o[2] = g * 0.99;
  });
  return { albedo, normal: heightToNormal(height, 3.2, true) };
}
