import { ctxOf, Cv, fbm, makeCanvas } from './G3DTextures';

/**
 * 技能特效第二张图集(11-22,用户「技能特效需要更酷炫和精致化,目前看起来太简单了」):
 * 1024 × 1024、4 × 4 格,每格 256 —— 比第一张(512、每格 128)细一倍,专画大块的、贴近镜头也要经得起看的东西:
 * 星芒闪光、冲击波环、烟尘、刀痕、光柱、旋风带、长火星、碎石、柔光、剑气月牙、地面冲击环、能量团。
 * 全部白色 + 透明度,颜色由顶点色给(同一格能染成紫 / 金 / 冰蓝)。
 */
export const FX2_CELL = { flare: 0, ring: 1, dust: 2, slash: 3, beam: 4, swirl: 5, spark: 6, debris: 7, glow: 8, crescent: 9, groundRing: 10, energy: 11, fog: 12, wisp: 13, cumulus: 14, petal: 15 };
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
  // 12 雾团(11-22 用户「光雾、气雾」):大尺度、低反差的柔软云团,边缘高斯式淡出(加色画 = 发光的雾,半透明画 = 白色水汽)
  cells[FX2_CELL.fog] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const r = Math.hypot(x, y);
    const n = fbm(u * 2.6 + 5.3, v * 2.6 + 1.7, 5, 101);
    const n2 = fbm(u * 6.5 + 2.2, v * 6.5 + 8.4, 3, 202);
    const shape = Math.exp(-r * r * 2.4) * (0.45 + 0.75 * n) * (0.8 + 0.35 * n2);
    return sat(shape * 1.15) * sat((1 - r) * 2.2);
  };
  // 13 水汽丝:横向拉长的一缕(贴地往外冲的气流,沿速度方向拉长用)
  cells[FX2_CELL.wisp] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const band = Math.exp(-((y * 2.6) ** 2)) * sat(1 - Math.abs(x)) ** 1.3;
    const n = fbm(u * 2.2 + 4.1, v * 9 + 0.7, 4, 303);
    return sat(band * (0.35 + 0.95 * n));
  };
  // 14 积云(11-22 用户「更像视频」:参考里的白色气雾是一团团有轮廓的积云,顶上亮、底下灰):
  //    几个圆叠出的云朵 + 噪声破边;这一格带明暗(其余格都是纯白,只靠透明度),画的时候不要转(rot = 0),不然亮面会转到下面
  const puffs: Array<[number, number, number]> = [[0, 0.12, 0.52], [-0.42, 0.22, 0.4], [0.42, 0.24, 0.42], [-0.2, -0.22, 0.42], [0.22, -0.26, 0.38], [-0.62, 0.38, 0.27], [0.64, 0.38, 0.27], [0, -0.5, 0.3]];
  const cumDensity = (x: number, y: number): number => {
    let dd = 0;
    for (const [px, py, pr] of puffs) {
      dd = Math.max(dd, 1 - Math.hypot(x - px, y - py) / pr);
    }
    return dd;
  };
  cells[FX2_CELL.cumulus] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const n = fbm(u * 5 + 1.3, v * 5 + 4.4, 4, 909);
    const dd = cumDensity(x, y) + (n - 0.5) * 0.28;
    return sat(sstep(0.0, 0.28, dd) * sat((1 - Math.hypot(x, y)) * 3));
  };
  // 15 花瓣屑(11-22 光效 v4,参考视频「剑气可视化」满天飘的白色碎屑):两头尖、微微弯的一片,边缘柔,外面一圈很淡的光
  cells[FX2_CELL.petal] = (u, v) => {
    const x = (u * 2 - 1) / 0.86;
    const y0 = v * 2 - 1;
    const halo = Math.exp(-(x * x * 0.8 + y0 * y0 * 5)) * 0.1;
    if (Math.abs(x) >= 1) {
      return sat(halo);
    }
    const y = y0 - 0.16 * (1 - x * x);
    const hw = 0.3 * Math.pow(1 - x * x, 0.75);
    const body = 1 - sstep(0.65, 1.0, Math.abs(y) / Math.max(1e-3, hw));
    return sat(body * (0.82 + 0.18 * (1 - Math.abs(x))) + halo);
  };
  const lum: Array<((u: number, v: number) => number) | undefined> = [];
  lum[FX2_CELL.cumulus] = (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const n = fbm(u * 7 + 8.1, v * 7 + 2.2, 3, 707);
    // 越往上越亮;每个小云团自己的上沿再亮一点(用往上挪一点的密度差当法线)
    const up = cumDensity(x, y - 0.08) - cumDensity(x, y + 0.08);
    return sat(0.6 + 0.3 * (1 - v) + up * 1.4 + (n - 0.5) * 0.18);
  };
  for (let cy = 0; cy < FX2_N; cy += 1) {
    for (let cx = 0; cx < FX2_N; cx += 1) {
      const f = cells[cy * FX2_N + cx];
      if (!f) {
        continue;
      }
      const fl = lum[cy * FX2_N + cx];
      for (let y = 0; y < C; y += 1) {
        for (let x = 0; x < C; x += 1) {
          const a = f((x + 0.5) / C, (y + 0.5) / C);
          const p = ((cy * C + y) * S + cx * C + x) * 4;
          const l = fl ? Math.round(255 * fl((x + 0.5) / C, (y + 0.5) / C)) : 255;
          d[p] = l;
          d[p + 1] = l;
          d[p + 2] = l;
          d[p + 3] = Math.round(255 * sat(a));
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * 笔触流线贴图(11-22 大招演出,参考「水墨剑气」:一把干笔刷过去的几十道细丝,粗细不一、中间有断笔):
 * 512 × 256,横向(沿笔触走向)可无缝平铺 —— 网格上把 u 一直往前推,丝就顺着流动;纵向 = 横穿笔触(中间密、两边散)。
 */
export function paintBrushStreak(): Cv {
  const W = 512;
  const H = 256;
  const cv = makeCanvas(W, H);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const N = 46;
  const lines: Array<{ y: number; w: number; a: number; f: number; ph: number; gap: number; gph: number }> = [];
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < N; i += 1) {
    const y = 0.08 + 0.84 * rnd();
    const center = 1 - Math.abs(y - 0.5) * 2;
    lines.push({ y, w: 0.004 + 0.016 * rnd() * (0.4 + center), a: 0.35 + 0.65 * rnd() * (0.3 + 0.7 * center), f: 1 + Math.floor(rnd() * 3), ph: rnd() * 6.28, gap: 1 + Math.floor(rnd() * 4), gph: rnd() });
  }
  for (let y = 0; y < H; y += 1) {
    const v = (y + 0.5) / H;
    const env = Math.exp(-(((v - 0.5) / 0.3) ** 2));
    for (let x = 0; x < W; x += 1) {
      const u = (x + 0.5) / W;
      let a = 0;
      for (const L of lines) {
        const yy = L.y + 0.012 * Math.sin(u * Math.PI * 2 * L.f + L.ph);
        const dy = (v - yy) / L.w;
        if (dy > 4 || dy < -4) {
          continue;
        }
        // 断笔:沿 u 周期性的空白(整数个周期,保证首尾接得上)
        const g = 0.5 + 0.5 * Math.sin((u + L.gph) * Math.PI * 2 * L.gap);
        const brk = Math.min(1, Math.max(0, (g - 0.18) / 0.3));
        a += Math.exp(-dy * dy) * L.a * brk;
      }
      const n = fbm(u * 16, v * 6, 3, 41);
      const n2 = fbm((u - 1) * 16, v * 6, 3, 41);
      const nn = n * (1 - u) + n2 * u;
      a = Math.min(1, a * (0.75 + 0.5 * nn) + env * 0.08);
      const p = (y * W + x) * 4;
      d[p] = 255;
      d[p + 1] = 255;
      d[p + 2] = 255;
      d[p + 3] = Math.round(255 * Math.min(1, a * env * 1.25));
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * 墨盘旋涡(11-22,参考视频里的「360° 半月」):1024 × 512,左半 = 墨(半透明画、顶点色给深色),右半 = 白色笔触。
 * 11-22 用户「旋转的不是很好,太密集了」:原来用正弦条纹铺满整盘,像斑马纹 / 唱片 → 改成十几道随机分布的长笔触:
 * 每道是一段对数螺旋,两头收尖、中间最粗,由几根「刷毛」细线叠成,刷毛各自有断笔(干笔飞白);白色高光只有几道。
 * 旋转由 FxWorld 按「内快外慢」把圆盘拆成一圈圈的环来转,笔触会自然卷进中心。
 */
export function paintInkWhirl(): Cv {
  const N = 512;
  const R = N * 0.5;
  const cv = makeCanvas(N * 2, N);
  const ctx = ctxOf(cv);
  let seed = 4242;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // 一段对数螺旋(角度从 a0 往前转 len 弧度,半径从 rs 按 exp(b·Δθ) 往外长)
  const path = (cx: number, a0: number, rs: number, len: number, b: number): Array<[number, number, number]> => {
    const pts: Array<[number, number, number]> = [];
    const n = 56;
    for (let k = 0; k <= n; k += 1) {
      const t = k / n;
      const ang = a0 + len * t;
      const r = Math.min(R * 0.97, rs * Math.exp(b * len * t));
      pts.push([cx + Math.cos(ang) * r, R + Math.sin(ang) * r, t]);
    }
    return pts;
  };
  // 一笔:几根刷毛,各自偏一点、粗细 / 浓淡不同、有断笔;两头收尖
  const brush = (pts: Array<[number, number, number]>, wMax: number, alpha: number, bristles: number): void => {
    ctx.lineCap = 'butt';
    for (let bi = 0; bi < bristles; bi += 1) {
      const off = (rnd() - 0.5) * wMax * 0.9;
      const wb = wMax * (0.22 + 0.4 * rnd());
      const ab = alpha * (0.4 + 0.6 * rnd());
      const gf = 2 + Math.floor(rnd() * 4);
      const gp = rnd() * 6.28;
      for (let k = 1; k < pts.length; k += 1) {
        const [x0, y0, t0] = pts[k - 1];
        const [x1, y1, t1] = pts[k];
        const tm = (t0 + t1) / 2;
        const taper = Math.pow(Math.sin(Math.PI * tm), 0.75);
        if (bi > 0 && 0.5 + 0.5 * Math.sin(tm * gf * 6.28 + gp) < 0.2) {
          continue;          // 干笔断开的地方
        }
        const dx = x1 - x0;
        const dy = y1 - y0;
        const L = Math.hypot(dx, dy) || 1;
        const o = off * taper;
        const nx = (-dy / L) * o;
        const ny = (dx / L) * o;
        ctx.strokeStyle = `rgba(255,255,255,${(ab * Math.min(1, taper * 1.7)).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.7, wb * taper);
        ctx.beginPath();
        ctx.moveTo(x0 + nx, y0 + ny);
        ctx.lineTo(x1 + nx, y1 + ny);
        ctx.stroke();
      }
    }
  };
  const B = 0.3;          // 螺旋松紧(越小越接近圆)
  // ── 左半:墨 ──
  const wash = ctx.createRadialGradient(R, R, 0, R, R, R);
  wash.addColorStop(0, 'rgba(255,255,255,0.6)');
  wash.addColorStop(0.55, 'rgba(255,255,255,0.4)');
  wash.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, N, N);
  for (let k = 0; k < 16; k += 1) {
    brush(path(R, rnd() * Math.PI * 2, R * (0.05 + 0.3 * rnd()), 1.6 + 1.8 * rnd(), B), R * (0.035 + 0.06 * rnd()), 0.6 + 0.3 * rnd(), 7);
  }
  // ── 右半:白色笔触(少、细、长)+ 中间一个亮眼 ──
  for (let k = 0; k < 10; k += 1) {
    brush(path(N + R, rnd() * Math.PI * 2, R * (0.1 + 0.4 * rnd()), 1.3 + 1.4 * rnd(), B), R * (0.016 + 0.03 * rnd()), 0.65 + 0.3 * rnd(), 5);
  }
  const eye = ctx.createRadialGradient(N + R, R, 0, N + R, R, R * 0.055);
  eye.addColorStop(0, 'rgba(255,255,255,0.5)');
  eye.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = eye;
  ctx.fillRect(N, 0, N, N);
  // 外沿渐隐:两半各拷到自己的小画布上做(destination-in 会把画的范围以外整张清空,不能在大画布上分两次做)
  const out = makeCanvas(N * 2, N);
  const octx = ctxOf(out);
  for (const x0 of [0, N]) {
    const half = makeCanvas(N, N);
    const hc = ctxOf(half);
    hc.drawImage(cv, x0, 0, N, N, 0, 0, N, N);
    hc.globalCompositeOperation = 'destination-in';
    const edge = hc.createRadialGradient(R, R, R * 0.7, R, R, R * 0.99);
    edge.addColorStop(0, 'rgba(255,255,255,1)');
    edge.addColorStop(1, 'rgba(255,255,255,0)');
    hc.fillStyle = edge;
    hc.fillRect(0, 0, N, N);
    octx.drawImage(half, x0, 0);
  }
  return out;
}

/** 周期值噪声(格点按 period 取模,铺满一张图时上下左右接得上)。 */
function pnoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const h = (a: number, b: number): number => {
    const aa = ((a % period) + period) % period;
    const bb = ((b % period) + period) % period;
    let v = Math.imul(aa, 374761393) ^ Math.imul(bb, 668265263) ^ Math.imul(seed + 1, 1274126177);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * ux;
  const b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * ux;
  return a + (b - a) * uy;
}

/**
 * 特效着色器用的噪声(11-22):256 × 256、可无缝平铺;R / G 两路不同种子、不同疏密的分形噪声(光效内部的翻涌、溶解的碎边都靠它)。
 */
export function paintFxNoise(): Cv {
  const N = 256;
  const cv = makeCanvas(N, N);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const fbmP = (u: number, v: number, base: number, seed: number): number => {
    let s = 0;
    let a = 0.5;
    let f = base;
    let n = 0;
    for (let o = 0; o < 4; o += 1) {
      s += a * pnoise(u * f, v * f, f, seed + o * 17);
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return s / n;
  };
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const u = x / N;
      const v = y / N;
      const r = fbmP(u, v, 4, 501);
      const g = fbmP(u, v, 8, 733);
      // 拉开反差(分形噪声都挤在 0.5 附近,溶解的门槛不好用)
      const k = (q: number): number => Math.max(0, Math.min(1, (q - 0.5) * 1.9 + 0.5));
      const p = (y * N + x) * 4;
      d[p] = Math.round(255 * k(r));
      d[p + 1] = Math.round(255 * k(g));
      d[p + 2] = 128;
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
