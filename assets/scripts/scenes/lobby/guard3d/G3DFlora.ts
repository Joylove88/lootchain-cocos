import { Color, director, gfx, Material, Mesh, MeshRenderer, Node, sys, Texture2D, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { tex } from './G3DKit';
import type { Tint } from './G3DMesh';
import { Sculpt } from './G3DSculpt';
import { ctxOf, heightToNormal, makeCanvas, mulberry32, paintRock, paintWood, tiles } from './G3DTextures';
import type { Ctx, Cv } from './G3DTextures';
import { addPropBuilder } from './TownProps3D';
import { FIELD_LAYER } from './TownWorld3D';

/**
 * 野外真 3D 场景 · 代码生成的摆件(实验,2026-11-16)。
 *
 * 用户看完第一版说「地形,技能也可以用酷炫的 3D 素材」,又问「这些 3D 模型不是纯代码吗?会不会占用很大的空间」——
 * 这里的树、岩石、草、营地的栅栏 / 木箱 / 旗 / 营帐全是代码拼的网格 + 画布上现画的贴图,不带任何模型或图片文件。
 * 镜头是正交 + 固定俯角、永远不转,所以叶片 / 松枝这些「片」可以专门朝着镜头的方向摆,不会露出纸片的侧面。
 *
 * 每种摆件先按「宽 = 1」的标准尺寸生成几个变体(同一种树不会棵棵一样),用的时候按 2D 贴图的宽度整体缩放;
 * 变体的网格、贴图、材质全场共用。贴图坐标 / 法线 / 顶点色在生成时算好:
 * - 叶片的法线不取片自己的朝向,而是「从树冠中心往外 + 往上」—— 整个树冠像一团有体积的东西一样受光;
 * - 顶点色管明暗层次:树冠里层 / 下层压暗,松枝靠树干的一段压暗,草根压暗。
 * 带透明边的贴图(叶、松针、草)画完之后把颜色往透明区域「洇」几圈再上传,不然边缘取样会混进黑色,叶子一圈黑边。
 */

type V3 = [number, number, number];
const TAU = Math.PI * 2;
/** 从场景指向镜头的方向(俯角 45°):片状的东西朝它摆。 */
const TO_CAM = new Vec3(0, Math.SQRT1_2, Math.SQRT1_2);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

let msaaFlag: boolean | null = null;
function msaa(): boolean {
  if (msaaFlag === null) {
    try {
      const gl = (director.root!.device as any).gl as WebGLRenderingContext;
      msaaFlag = !!gl && gl.getParameter(gl.SAMPLES) > 1;
    } catch (error) {
      msaaFlag = false;
    }
  }
  return msaaFlag;
}

// ───────────────────────── 贴图 ─────────────────────────
/**
 * 带透明边的贴图:从画布取出直通道像素,把不透明处的颜色往透明区域洇 passes 圈(透明度不动),再连同多级渐远一起上传。
 * (画布里全透明的像素颜色是 0,直接上传的话线性取样会把边缘染黑。)多级渐远按透明度加权缩小,远处叶子不会发灰。
 */
function alphaTex(cv: Cv, passes = 6): Texture2D {
  const w = cv.width;
  const h = cv.height;
  const src = ctxOf(cv).getImageData(0, 0, w, h).data;
  let d = new Uint8Array(src.length);
  d.set(src);
  let filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    filled[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  }
  for (let p = 0; p < passes; p += 1) {
    const next = filled.slice();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (filled[i]) {
          continue;
        }
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let k = 0; k < 4; k += 1) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) {
            continue;
          }
          const j = yy * w + xx;
          if (filled[j]) {
            r += d[j * 4];
            g += d[j * 4 + 1];
            b += d[j * 4 + 2];
            n += 1;
          }
        }
        if (n) {
          d[i * 4] = r / n;
          d[i * 4 + 1] = g / n;
          d[i * 4 + 2] = b / n;
          next[i] = 1;
        }
      }
    }
    filled = next;
  }
  // 没洇到的地方(离得远)给整张图的平均色,缩小之后也不会混进黑
  let ar = 0;
  let ag = 0;
  let ab = 0;
  let an = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (d[i * 4 + 3] > 200) {
      ar += d[i * 4];
      ag += d[i * 4 + 1];
      ab += d[i * 4 + 2];
      an += 1;
    }
  }
  if (an) {
    ar /= an;
    ag /= an;
    ab /= an;
    for (let i = 0; i < w * h; i += 1) {
      if (!filled[i]) {
        d[i * 4] = ar;
        d[i * 4 + 1] = ag;
        d[i * 4 + 2] = ab;
      }
    }
  }
  const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
  const t = new Texture2D();
  t.reset({ width: w, height: h, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: levels });
  t.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  t.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  t.setMipFilter(Texture2D.Filter.LINEAR);
  t.setAnisotropy(4);
  t.uploadData(d, 0);
  let cw = w;
  let ch = h;
  for (let level = 1; level < levels; level += 1) {
    const nw = Math.max(1, cw >> 1);
    const nh = Math.max(1, ch >> 1);
    const nd = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y += 1) {
      for (let x = 0; x < nw; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let pr = 0;
        let pg = 0;
        let pb = 0;
        for (let k = 0; k < 4; k += 1) {
          const sx = Math.min(cw - 1, x * 2 + (k & 1));
          const sy = Math.min(ch - 1, y * 2 + (k >> 1));
          const j = (sy * cw + sx) * 4;
          const al = d[j + 3];
          r += d[j] * al;
          g += d[j + 1] * al;
          b += d[j + 2] * al;
          a += al;
          pr += d[j];
          pg += d[j + 1];
          pb += d[j + 2];
        }
        const o = (y * nw + x) * 4;
        if (a > 0) {
          nd[o] = r / a;
          nd[o + 1] = g / a;
          nd[o + 2] = b / a;
        } else {
          nd[o] = pr / 4;
          nd[o + 1] = pg / 4;
          nd[o + 2] = pb / 4;
        }
        // 透明度略微往上提:缩小之后叶片不会越来越稀
        nd[o + 3] = Math.min(255, (a / 4) * 1.12);
      }
    }
    t.uploadData(nd, level);
    d = nd;
    cw = nw;
    ch = nh;
  }
  return t;
}

const rgb = (c: V3, k = 1): string => `rgb(${Math.round(clamp01((c[0] * k) / 255) * 255)},${Math.round(clamp01((c[1] * k) / 255) * 255)},${Math.round(clamp01((c[2] * k) / 255) * 255)})`;
const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** 一片叶子:从叶柄 (0, 0) 沿 +x 长到叶尖;一半亮一半暗(中脉两侧受光不同),中脉压一道暗线。 */
function leaf(ctx: Ctx, x: number, y: number, ang: number, len: number, wid: number, c: V3): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, -wid, 0, wid);
  g.addColorStop(0, rgb(c, 1.16));
  g.addColorStop(0.5, rgb(c, 1.0));
  g.addColorStop(0.52, rgb(c, 0.86));
  g.addColorStop(1, rgb(c, 0.74));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.22, -wid * 0.95, len * 0.68, -wid * 0.72, len, 0);
  ctx.bezierCurveTo(len * 0.68, wid * 0.72, len * 0.22, wid * 0.95, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,8,0.28)';
  ctx.lineWidth = Math.max(0.8, len * 0.035);
  ctx.beginPath();
  ctx.moveTo(len * 0.04, 0);
  ctx.lineTo(len * 0.92, 0);
  ctx.stroke();
  ctx.restore();
}

interface LeafPalette { deep: V3; mid: V3[]; light: V3[]; twig: V3 }
const OAK: LeafPalette = { deep: [44, 58, 30], mid: [[66, 88, 40], [78, 98, 44], [58, 82, 42]], light: [[112, 132, 60], [134, 148, 70], [98, 124, 56]], twig: [70, 54, 38] };
const AUTUMN: LeafPalette = { deep: [84, 40, 20], mid: [[150, 72, 28], [168, 92, 34], [128, 52, 26], [118, 98, 40]], light: [[206, 122, 44], [222, 150, 62], [188, 84, 36]], twig: [66, 46, 34] };
const SHRUB: LeafPalette = { deep: [40, 62, 26], mid: [[70, 104, 40], [84, 116, 44]], light: [[122, 152, 62], [146, 168, 78]], twig: [74, 60, 40] };

/** 叶簇图集:2 × 2 四簇,每簇是一根小枝上密密的一团叶子(里层暗、外层亮),边缘参差。 */
function paintLeafAtlas(S: number, pal: LeafPalette, seed: number, leafK = 1): Cv {
  const cv = makeCanvas(S, S);
  const ctx = ctxOf(cv);
  const rnd = mulberry32(seed);
  const C = S / 2;
  for (let cell = 0; cell < 4; cell += 1) {
    const cx = (cell % 2) * C + C / 2;
    const cy = Math.floor(cell / 2) * C + C / 2;
    const R = C * 0.43;
    // 小枝
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i += 1) {
      const a = rnd() * TAU;
      const l = R * (0.45 + rnd() * 0.4);
      ctx.strokeStyle = rgb(pal.twig, 0.9 + rnd() * 0.3);
      ctx.lineWidth = C * 0.012 * (1 + rnd());
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * l * 0.5, cy + Math.sin(a + 0.3) * l * 0.5, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      ctx.stroke();
    }
    const layers: Array<{ n: number; reach: number; cols: V3[]; k: number }> = [
      { n: 70, reach: 1.0, cols: [pal.deep], k: 1 },
      { n: 80, reach: 0.96, cols: pal.mid, k: 1 },
      { n: 54, reach: 0.86, cols: pal.light, k: 1 },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.n; i += 1) {
        const a = rnd() * TAU;
        const r = R * layer.reach * Math.sqrt(rnd());
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const len = C * (0.085 + rnd() * 0.06) * leafK;
        const dir = a + (rnd() - 0.5) * 2.2;       // 大致朝外,乱一点
        const c0 = layer.cols[Math.floor(rnd() * layer.cols.length)];
        const c: V3 = [c0[0] * (0.9 + rnd() * 0.2), c0[1] * (0.9 + rnd() * 0.2), c0[2] * (0.9 + rnd() * 0.2)];
        leaf(ctx, x, y, dir, len, len * (0.3 + rnd() * 0.1), c);
      }
    }
  }
  return cv;
}

/** 一根松枝(底边 = 靠树干的一头,顶 = 枝梢):主枝两侧排着往前斜的小枝,小枝上密密的针叶。 */
function paintBough(W: number, H: number, seed: number): Cv {
  const cv = makeCanvas(W, H);
  const ctx = ctxOf(cv);
  const rnd = mulberry32(seed);
  const cx = W / 2;
  const y0 = H * 0.985;
  const y1 = H * 0.03;
  const L = y0 - y1;
  const deep: V3 = [26, 46, 34];
  const mid: V3[] = [[42, 72, 48], [50, 82, 50], [36, 64, 46]];
  const light: V3[] = [[78, 112, 66], [96, 126, 74], [66, 100, 62]];
  const half = (t: number): number => W * 0.47 * Math.pow(1 - t, 0.72) * (0.42 + 0.58 * smooth(0, 0.16, t));
  ctx.lineCap = 'round';
  const needles = (ax: number, ay: number, bx: number, by: number, step: number, len: number, cols: V3[], wid: number, skip: number): void => {
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy);
    if (l < 2) {
      return;
    }
    const ux = dx / l;
    const uy = dy / l;
    for (let s = 0; s < l; s += step) {
      if (rnd() < skip) {
        continue;
      }
      for (const side of [-1, 1]) {
        const a = Math.atan2(uy, ux) + side * (0.62 + rnd() * 0.36);
        const nl = len * (0.75 + rnd() * 0.5) * (0.6 + 0.4 * (1 - s / l));
        const px = ax + ux * s;
        const py = ay + uy * s;
        const c = cols[Math.floor(rnd() * cols.length)];
        ctx.strokeStyle = rgb(c, 0.88 + rnd() * 0.26);
        ctx.lineWidth = wid * (0.8 + rnd() * 0.5);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl);
        ctx.stroke();
      }
    }
  };
  const twigs: Array<[number, number, number, number]> = [[cx, y0, cx, y1]];
  const N = 13;
  for (let k = 0; k < N; k += 1) {
    const t = 0.03 + (k / N) * 0.9;
    const sy = y0 - L * t;
    for (const side of [-1, 1]) {
      const ang = 0.72 + rnd() * 0.22;                      // 和主枝的夹角(往枝梢方向斜)
      const reach = half(t) * (0.9 + rnd() * 0.2);
      const len = reach / Math.sin(ang);
      twigs.push([cx, sy, cx + side * Math.sin(ang) * len, sy - Math.cos(ang) * len]);
    }
  }
  // 先画一遍又粗又暗的针叶当底(不透光),再画中间色,最后零星的亮针
  for (const tw of twigs) {
    needles(tw[0], tw[1], tw[2], tw[3], W * 0.012, W * 0.085, [deep], W * 0.02, 0);
  }
  for (const tw of twigs) {
    ctx.strokeStyle = rgb([58, 44, 32]);
    ctx.lineWidth = W * 0.012;
    ctx.beginPath();
    ctx.moveTo(tw[0], tw[1]);
    ctx.lineTo(tw[2], tw[3]);
    ctx.stroke();
    needles(tw[0], tw[1], tw[2], tw[3], W * 0.014, W * 0.075, mid, W * 0.011, 0.08);
  }
  for (const tw of twigs) {
    needles(tw[0], tw[1], tw[2], tw[3], W * 0.03, W * 0.066, light, W * 0.008, 0.45);
  }
  return cv;
}

/** 一丛草:几十根从根部散开的草叶(根部暗、梢上亮),dry = 枯草的颜色。 */
function paintGrass(S: number, seed: number, dry: boolean): Cv {
  const cv = makeCanvas(S, S);
  const ctx = ctxOf(cv);
  const rnd = mulberry32(seed);
  const base: V3[] = dry ? [[84, 68, 40], [118, 98, 58], [146, 126, 78]] : [[52, 70, 30], [78, 104, 40], [104, 130, 52]];
  const tip: V3[] = dry ? [[176, 156, 100], [198, 180, 122]] : [[150, 168, 76], [172, 180, 92]];
  const bx = S / 2;
  const by = S * 0.985;
  const blades: Array<{ a: number; l: number; z: number }> = [];
  for (let i = 0; i < 64; i += 1) {
    const u = rnd() + rnd() + rnd() - 1.5;
    blades.push({ a: u * 0.78, l: S * (0.5 + rnd() * 0.44), z: rnd() });
  }
  blades.sort((p, q) => p.z - q.z);
  for (const b of blades) {
    const ox = bx + (rnd() - 0.5) * S * 0.2;
    const bend = b.a * (0.5 + rnd() * 0.8);
    const tx = ox + Math.sin(b.a) * b.l + Math.sin(b.a + bend) * b.l * 0.25;
    const ty = by - Math.cos(b.a) * b.l * (0.9 - Math.abs(bend) * 0.12);
    const mx = ox + Math.sin(b.a) * b.l * 0.5 - Math.cos(b.a) * bend * b.l * 0.1;
    const my = by - Math.cos(b.a) * b.l * 0.55;
    const w = S * (0.012 + rnd() * 0.014);
    const c0 = base[Math.floor(rnd() * base.length)];
    const c1 = tip[Math.floor(rnd() * tip.length)];
    const k = 0.72 + b.z * 0.4;
    const g = ctx.createLinearGradient(ox, by, tx, ty);
    g.addColorStop(0, rgb(c0, k * 0.72));
    g.addColorStop(0.55, rgb(mix3(c0, c1, 0.45), k));
    g.addColorStop(1, rgb(c1, k));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox - w, by);
    ctx.quadraticCurveTo(mx - w * 0.7, my, tx, ty);
    ctx.quadraticCurveTo(mx + w * 0.7, my, ox + w, by);
    ctx.closePath();
    ctx.fill();
  }
  return cv;
}

/** 一片蕨叶(底 = 叶柄,顶 = 叶尖):中轴两侧一对对小羽片,越往尖上越短。 */
function paintFrond(W: number, H: number, seed: number): Cv {
  const cv = makeCanvas(W, H);
  const ctx = ctxOf(cv);
  const rnd = mulberry32(seed);
  const cx = W / 2;
  const y0 = H * 0.99;
  const y1 = H * 0.02;
  const L = y0 - y1;
  const cols: V3[] = [[74, 110, 36], [96, 134, 44], [122, 152, 54], [146, 170, 66]];
  ctx.strokeStyle = rgb([84, 104, 40]);
  ctx.lineWidth = W * 0.035;
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(cx, y1);
  ctx.stroke();
  const n = 26;
  for (let i = 0; i < n; i += 1) {
    const t = 0.1 + (i / n) * 0.9;
    const y = y0 - L * t;
    const len = W * 0.47 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62) * 0.94), 0.8) * (0.9 + rnd() * 0.2);
    const wid = Math.max(2, (L / n) * 0.62);
    for (const side of [-1, 1]) {
      const c = cols[Math.floor(rnd() * cols.length)];
      const ang = side > 0 ? -0.42 - rnd() * 0.14 : Math.PI + 0.42 + rnd() * 0.14;
      leaf(ctx, cx, y, ang, len, wid, [c[0] * (0.9 + rnd() * 0.2), c[1] * (0.9 + rnd() * 0.2), c[2] * (0.9 + rnd() * 0.2)]);
    }
  }
  return cv;
}

/** 树皮(可平铺,纹理顺着竖直方向):一道道深沟 + 沟之间鼓起来的皮块。返回颜色和法线。 */
function paintBark(S: number): { albedo: Cv; normal: Cv } {
  const t = tiles();
  const rnd = mulberry32(5151);
  const A = makeCanvas(S, S);
  const a = ctxOf(A);
  const HT = makeCanvas(S, S);
  const h = ctxOf(HT);
  a.fillStyle = '#7d6a56';
  a.fillRect(0, 0, S, S);
  h.fillStyle = 'rgb(150,150,150)';
  h.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i += 1) {
    const x = (i / 46) * S + (rnd() - 0.5) * 8;
    const wv = 2 + rnd() * 5;
    const amp = 2 + rnd() * 5;
    const ph = rnd() * TAU;
    const per = 1 + Math.floor(rnd() * 2);
    for (const dx of [-S, 0, S]) {
      for (const c of [a, h]) {
        c.strokeStyle = c === a ? `rgba(34,26,20,${0.5 + rnd() * 0.3})` : `rgba(20,20,20,${0.7 + rnd() * 0.25})`;
        c.lineWidth = wv;
        c.beginPath();
        for (let y = 0; y <= S; y += 12) {
          const px = x + dx + Math.sin((y / S) * TAU * per + ph) * amp;
          if (!y) {
            c.moveTo(px, y);
          } else {
            c.lineTo(px, y);
          }
        }
        c.stroke();
      }
    }
  }
  // 皮块上的横裂
  for (let i = 0; i < 180; i += 1) {
    const x = rnd() * S;
    const y = rnd() * S;
    const l = 4 + rnd() * 12;
    a.strokeStyle = 'rgba(40,30,22,0.35)';
    a.lineWidth = 1 + rnd() * 1.5;
    a.beginPath();
    a.moveTo(x, y);
    a.lineTo(x + l, y + (rnd() - 0.5) * 4);
    a.stroke();
    h.strokeStyle = 'rgba(40,40,40,0.5)';
    h.lineWidth = 1.5;
    h.beginPath();
    h.moveTo(x, y);
    h.lineTo(x + l, y + (rnd() - 0.5) * 4);
    h.stroke();
  }
  for (const [c, al] of [[a, 0.55], [h, 0.35]] as Array<[Ctx, number]>) {
    c.save();
    c.globalAlpha = al;
    c.globalCompositeOperation = 'overlay';
    c.fillStyle = c.createPattern(t.mid.cv, 'repeat') as CanvasPattern;
    c.fillRect(0, 0, S, S);
    c.restore();
  }
  // 零星的苔
  for (let i = 0; i < 26; i += 1) {
    a.fillStyle = `rgba(${96 + rnd() * 30},${112 + rnd() * 30},${58 + rnd() * 20},${0.1 + rnd() * 0.14})`;
    a.beginPath();
    a.arc(rnd() * S, rnd() * S, 6 + rnd() * 18, 0, TAU);
    a.fill();
  }
  return { albedo: A, normal: heightToNormal(HT, 3.4 * (S / 256), true) };
}

/** 帆布(营帐):米黄的粗布,有接缝、水渍和脏边。 */
function paintCanvas(S: number): Cv {
  const t = tiles();
  const rnd = mulberry32(8181);
  const cv = makeCanvas(S, S);
  const c = ctxOf(cv);
  c.fillStyle = '#c2ad84';
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i += 1) {
    c.fillStyle = `rgba(${90 + rnd() * 40},${72 + rnd() * 30},${44 + rnd() * 20},${0.06 + rnd() * 0.1})`;
    c.beginPath();
    c.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 60, 14 + rnd() * 40, rnd() * 3, 0, TAU);
    c.fill();
  }
  c.strokeStyle = 'rgba(70,54,34,0.4)';
  c.lineWidth = 2;
  for (const x of [S * 0.25, S * 0.5, S * 0.75]) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, S);
    c.stroke();
  }
  c.save();
  c.globalAlpha = 0.5;
  c.globalCompositeOperation = 'overlay';
  c.fillStyle = c.createPattern(t.fine.cv, 'repeat') as CanvasPattern;
  c.fillRect(0, 0, S, S);
  c.globalAlpha = 0.35;
  c.fillStyle = c.createPattern(t.big.cv, 'repeat') as CanvasPattern;
  c.fillRect(0, 0, S, S);
  c.restore();
  return cv;
}

/** 旗面(上边挂在横杆上,下边撕成几条):暗红的布,竖向的褶子,中间一个白色的八芒纹。 */
function paintBanner(W: number, H: number): Cv {
  const rnd = mulberry32(9191);
  const cv = makeCanvas(W, H);
  const c = ctxOf(cv);
  c.fillStyle = '#7e2420';
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(W, 0);
  c.lineTo(W, H * 0.8);
  // 下边:几条长短不一的布条
  const strips = 5;
  for (let i = strips; i > 0; i -= 1) {
    const x1 = (W * i) / strips;
    const x0 = (W * (i - 1)) / strips;
    const yy = H * (0.84 + rnd() * 0.15);
    c.lineTo(x1 - W * 0.02, yy);
    c.lineTo((x0 + x1) / 2, yy - H * (0.03 + rnd() * 0.05));
    c.lineTo(x0 + W * 0.02, H * (0.84 + rnd() * 0.15));
  }
  c.lineTo(0, H * 0.8);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 9; i += 1) {
    const x = (i / 9) * W + rnd() * 8;
    const g = c.createLinearGradient(x, 0, x + W / 9, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.26)');
    g.addColorStop(0.5, 'rgba(255,190,150,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = g;
    c.fillRect(x, 0, W / 9, H);
  }
  c.fillStyle = 'rgba(30,10,8,0.3)';
  c.fillRect(0, 0, W, H * 0.03);
  c.fillRect(0, 0, W * 0.04, H);
  c.fillRect(W * 0.96, 0, W * 0.04, H);
  // 纹章
  c.translate(W / 2, H * 0.34);
  c.strokeStyle = 'rgba(232,222,204,0.92)';
  c.lineCap = 'round';
  c.lineWidth = W * 0.035;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    const r = W * (i % 2 ? 0.2 : 0.28);
    c.beginPath();
    c.moveTo(Math.cos(a) * W * 0.05, Math.sin(a) * W * 0.05);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    c.stroke();
  }
  c.beginPath();
  c.arc(0, 0, W * 0.3, 0, TAU);
  c.lineWidth = W * 0.02;
  c.stroke();
  return cv;
}

// ───────────────────────── 材质(全场共用,用到才建)─────────────────────────
interface Mats { bark: Material; rock: Material; wood: Material; iron: Material; oak: Material; autumn: Material; shrub: Material; bough: Material; grass: Material; dry: Material; frond: Material; canvas: Material; banner: Material }
let MATS: Mats | null = null;

function standard(defs: Record<string, boolean>, rough: number, cutout: boolean): Material {
  const m = new Material();
  if (cutout) {
    const a2c = msaa();
    m.initialize({ effectName: 'builtin-standard', defines: { ...defs, USE_ALPHA_TEST: true },
      states: { rasterizerState: { cullMode: gfx.CullMode.NONE }, blendState: { isA2C: a2c } } });
    m.setProperty('alphaThreshold', a2c ? 0.14 : 0.42);
  } else {
    m.initialize({ effectName: 'builtin-standard', defines: defs });
  }
  m.setProperty('roughness', rough);
  m.setProperty('metallic', 0);
  return m;
}

function mats(): Mats {
  if (MATS) {
    return MATS;
  }
  const bark = paintBark(256);
  const rock = paintRock(512);
  const wood = paintWood(512);
  const solid = (albedo: Cv, normal: Cv, rough: number, scale: V3): Material => {
    const m = standard({ USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true }, rough, false);
    m.setProperty('mainTexture', tex(albedo, true, 4));
    m.setProperty('normalMap', tex(normal, true, 4));
    m.setProperty('albedoScale', new Vec3(scale[0], scale[1], scale[2]));
    m.setProperty('specularIntensity', 0.35);
    return m;
  };
  const cut = (cv: Cv, rough: number): Material => {
    const m = standard({ USE_ALBEDO_MAP: true, USE_VERTEX_COLOR: true }, rough, true);
    m.setProperty('mainTexture', alphaTex(cv));
    m.setProperty('specularIntensity', 0.25);
    return m;
  };
  const iron = standard({}, 0.55, false);
  iron.setProperty('mainColor', new Color(52, 48, 46, 255));
  iron.setProperty('metallic', 0.85);
  // 帆布两面都看得见(门帘 / 掀起来的边)
  const canvas2 = new Material();
  canvas2.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true, USE_VERTEX_COLOR: true }, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
  canvas2.setProperty('mainTexture', tex(paintCanvas(256), true, 4));
  canvas2.setProperty('roughness', 0.95);
  canvas2.setProperty('metallic', 0);
  canvas2.setProperty('specularIntensity', 0.1);
  MATS = {
    bark: solid(bark.albedo, bark.normal, 0.94, [1, 1, 1]),
    rock: solid(rock.albedo, rock.normal, 0.9, [0.98, 0.96, 0.92]),
    wood: solid(wood.albedo, wood.normal, 0.86, [1.55, 1.3, 0.98]),
    iron,
    oak: cut(paintLeafAtlas(1024, OAK, 11), 0.78),
    autumn: cut(paintLeafAtlas(1024, AUTUMN, 12), 0.78),
    shrub: cut(paintLeafAtlas(512, SHRUB, 13, 1.25), 0.78),
    bough: cut(paintBough(256, 512, 21), 0.82),
    grass: cut(paintGrass(256, 31, false), 0.9),
    dry: cut(paintGrass(256, 32, true), 0.9),
    frond: cut(paintFrond(128, 512, 41), 0.85),
    canvas: canvas2,
    banner: cut(paintBanner(256, 512), 0.9),
  };
  return MATS;
}

// ───────────────────────── 网格:带自定义法线的片 ─────────────────────────
class Leafy extends Sculpt {
  /**
   * 一片朝向任意的平板:c = 中心,r / u = 半宽 / 半高向量,uv = [u0, v0, u1, v1](v0 是图的上边);
   * 法线和颜色逐角给(左下、右下、右上、左上)。
   */
  card(c: Vec3, r: Vec3, u: Vec3, uv: [number, number, number, number], n: Vec3[], tint: Tint[]): void {
    if (this.count() + 4 > 60000) {
      this.cut();
    }
    const base = this.count();
    const P: V3[] = [[c.x - r.x - u.x, c.y - r.y - u.y, c.z - r.z - u.z], [c.x + r.x - u.x, c.y + r.y - u.y, c.z + r.z - u.z], [c.x + r.x + u.x, c.y + r.y + u.y, c.z + r.z + u.z], [c.x - r.x + u.x, c.y - r.y + u.y, c.z - r.z + u.z]];
    const UV: Array<[number, number]> = [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]];
    for (let i = 0; i < 4; i += 1) {
      this.positions.push(P[i][0], P[i][1], P[i][2]);
      this.normals.push(n[i].x, n[i].y, n[i].z);
      this.tangents.push(1, 0, 0, 1);
      this.uvs.push(UV[i][0], UV[i][1]);
      this.colors.push(tint[i][0], tint[i][1], tint[i][2], 1);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.triangles += 2;
  }

  /**
   * 沿一条路径铺的带子(松枝 / 蕨叶 / 草叶这种会弯的片):pts = 中线上的点,side = 每个点处往一侧的半宽向量;
   * 贴图的 v 沿路径从 1(起点)到 0(终点),u 横跨带子。法线 / 颜色逐点给。
   */
  ribbon(pts: Vec3[], side: Vec3[], n: Vec3[], tint: Tint[], u0 = 0, u1 = 1): void {
    if (this.count() + pts.length * 2 > 60000) {
      this.cut();
    }
    const base = this.count();
    for (let i = 0; i < pts.length; i += 1) {
      const v = 1 - i / (pts.length - 1);
      for (const s of [-1, 1]) {
        this.positions.push(pts[i].x + side[i].x * s, pts[i].y + side[i].y * s, pts[i].z + side[i].z * s);
        this.normals.push(n[i].x, n[i].y, n[i].z);
        this.tangents.push(1, 0, 0, 1);
        this.uvs.push(s < 0 ? u0 : u1, v);
        this.colors.push(tint[i][0], tint[i][1], tint[i][2], 1);
      }
    }
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = base + i * 2;
      this.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      this.triangles += 2;
    }
  }
}

interface Part { mesh: Mesh; mat: Material; cast: boolean }
interface Variant { parts: Part[]; tris: number }
const variants = new Map<string, Variant>();

function partsOf(list: Array<{ batch: Sculpt; mat: Material; cast: boolean }>): Variant {
  const parts: Part[] = [];
  let tris = 0;
  for (const item of list) {
    tris += item.batch.triangles;
    for (const mesh of item.batch.build()) {
      parts.push({ mesh, mat: item.mat, cast: item.cast });
    }
  }
  return { parts, tris };
}

function v3(x: number, y: number, z: number): Vec3 {
  return new Vec3(x, y, z);
}
const norm = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z).normalize();

// ───────────────────────── 松树 ─────────────────────────
/** 标准尺寸:树冠最宽处 ≈ 0.92(宽 = 1),高 = hr × 0.9。树干 + 一轮轮往下垂的松枝(越往上越短)+ 树梢。 */
function buildPine(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const bark = new Leafy();
  const leaves = new Leafy();
  const H = hr * 0.9;
  const lean = (rnd() - 0.5) * 0.05;
  const ph = rnd() * TAU;
  const axis = (t: number, out: Vec3): Vec3 => out.set(Math.sin(t * 2.2 + ph) * 0.022 + lean * t, H * t, Math.cos(t * 1.7 + ph) * 0.016);
  const path: Vec3[] = [];
  for (let i = 0; i <= 10; i += 1) {
    path.push(axis(i / 10, new Vec3()));
  }
  path[0].y = -0.03;
  bark.tube(path, (t) => 0.036 * (1 - 0.86 * t) + 0.034 * Math.exp(-t * 26), 7, { den: 2.2, tint: (u, v) => {
    const k = 0.62 + 0.3 * v;
    return [0.84 * k, 0.78 * k, 0.74 * k];
  } });
  const R = 0.47;
  const whorls = 12;
  const c = new Vec3();
  const bough = (t: number, az: number, len: number, droop: number, shade: number): void => {
    axis(t, c);
    const ox = Math.cos(az);
    const oz = Math.sin(az);
    // 中线:往外伸、往下垂,梢上微微翘起
    const pts: Vec3[] = [];
    const sides: Vec3[] = [];
    const ns: Vec3[] = [];
    const tints: Tint[] = [];
    const seg = 4;
    const wid = len * (0.33 + rnd() * 0.05);
    for (let i = 0; i <= seg; i += 1) {
      const s = i / seg;
      const out = len * s;
      const dy = -droop * len * (s * s * 0.9 - 0.12 * Math.max(0, s - 0.75) * 4 * s) + 0.02 * len * Math.sin(s * 3);
      pts.push(v3(c.x + ox * out, c.y + dy, c.z + oz * out));
      // 带子的宽度方向 = 水平面里垂直于伸出去的方向
      sides.push(v3(-oz * wid, 0, ox * wid));
      ns.push(norm(ox * 0.42, 0.86, oz * 0.42 + 0.12));
      const k = shade * (0.56 + 0.44 * smooth(0.05, 0.75, s)) * (0.94 + rnd() * 0.12);
      tints.push([k, k, k * 0.98]);
    }
    leaves.ribbon(pts, sides, ns, tints);
  };
  for (let w = 0; w < whorls; w += 1) {
    const f = w / (whorls - 1);
    const t = 0.15 + 0.8 * Math.pow(f, 0.92);
    const len = R * Math.pow(1 - f, 0.82) * (0.94 + rnd() * 0.12) + 0.07;
    const n = f < 0.5 ? 7 : f < 0.8 ? 6 : 5;
    const off = rnd() * TAU;
    const shade = 0.78 + 0.22 * f;
    for (let i = 0; i < n; i += 1) {
      bough(t + (rnd() - 0.5) * 0.012, off + (i / n) * TAU + (rnd() - 0.5) * 0.3, len * (0.86 + rnd() * 0.28), 0.5 - 0.22 * f + rnd() * 0.08, shade);
    }
    // 两轮之间再插一圈短的,挡住树干
    if (w < whorls - 1) {
      const t2 = t + 0.4 / whorls;
      for (let i = 0; i < n - 1; i += 1) {
        bough(t2, off + ((i + 0.5) / (n - 1)) * TAU + (rnd() - 0.5) * 0.4, len * (0.5 + rnd() * 0.2), 0.3 + rnd() * 0.1, shade * 0.8);
      }
    }
  }
  // 树梢:几根往上翘的短枝
  for (let i = 0; i < 4; i += 1) {
    const az = (i / 4) * TAU + rnd();
    axis(0.955, c);
    const len = 0.12 + rnd() * 0.03;
    const ox = Math.cos(az);
    const oz = Math.sin(az);
    const pts = [v3(c.x, c.y, c.z), v3(c.x + ox * len * 0.3, c.y + len * 0.5, c.z + oz * len * 0.3), v3(c.x + ox * len * 0.36, c.y + len, c.z + oz * len * 0.36)];
    const sd = v3(-oz * len * 0.34, 0, ox * len * 0.34);
    leaves.ribbon(pts, [sd, sd, sd], [norm(ox, 0.8, oz), norm(ox, 0.8, oz), norm(ox, 0.8, oz)], [[0.9, 0.9, 0.88], [1, 1, 1], [1, 1, 1]]);
  }
  return partsOf([{ batch: bark, mat: M.bark, cast: true }, { batch: leaves, mat: M.bough, cast: true }]);
}

// ───────────────────────── 阔叶树(橡树 / 秋树 / 枯树)─────────────────────────
/**
 * 标准尺寸:树冠直径 ≈ 0.94(宽 = 1),树冠中心高 0.6 × hr。树干在 0.4 高处分出几根大枝伸进树冠,
 * 叶子 = 分布在树冠椭球里的几十簇叶片,每簇三片,朝着镜头的方向摆(带一点乱)。bare = 枯树,只有枝杈。
 */
function buildBroadleaf(hr: number, seed: number, leafMat: Material | null, sparse: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const bark = new Leafy();
  const leaves = new Leafy();
  const bare = !leafMat;
  const Hc = hr * 0.6;
  const Rx = 0.47;
  const Ry = Math.min(0.42, hr * 0.3);
  const Ht = Math.max(0.2, Hc - Ry * 0.9);
  const barkTint = (lo: number, hi: number) => (u: number, v: number): Tint => {
    const k = lo + (hi - lo) * v;
    return bare ? [0.82 * k, 0.8 * k, 0.78 * k] : [0.9 * k, 0.84 * k, 0.76 * k];
  };
  const ph = rnd() * TAU;
  const trunk: Vec3[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    trunk.push(v3(Math.sin(t * 2.6 + ph) * 0.03, Ht * t - (i ? 0 : 0.03), Math.cos(t * 2.1 + ph) * 0.02));
  }
  const top = trunk[trunk.length - 1];
  bark.tube(trunk, (t) => 0.062 * (1 - 0.3 * t) + 0.07 * Math.exp(-t * 9), 9, { den: 1.6, tint: barkTint(0.6, 0.9) });
  // 根:几条从树干根部斜着扎进土里的棱
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * TAU + rnd() * 0.8;
    const l = 0.14 + rnd() * 0.08;
    bark.tube([v3(Math.cos(a) * 0.04, 0.12, Math.sin(a) * 0.04), v3(Math.cos(a) * l * 0.6, 0.03, Math.sin(a) * l * 0.6), v3(Math.cos(a) * l, -0.03, Math.sin(a) * l)],
      (t) => 0.04 * (1 - 0.7 * t), 5, { den: 1.6, tint: barkTint(0.55, 0.7) });
  }
  // 大枝
  const limbs = bare ? 7 : 6;
  const ends: Vec3[] = [];
  const limb = (from: Vec3, az: number, reach: number, rise: number, r0: number, depth: number): void => {
    const ox = Math.cos(az);
    const oz = Math.sin(az);
    const end = v3(from.x + ox * reach, from.y + rise, from.z + oz * reach);
    const mid = v3(from.x + ox * reach * 0.42 + (rnd() - 0.5) * 0.05, from.y + rise * 0.62, from.z + oz * reach * 0.42 + (rnd() - 0.5) * 0.05);
    bark.tube([from, mid, end], (t) => r0 * (1 - 0.72 * t), 6, { den: 1.6, tint: barkTint(0.72, 0.95) });
    ends.push(end);
    if (depth > 0) {
      const n = bare ? 3 : 2;
      for (let k = 0; k < n; k += 1) {
        const base = k === 0 ? end : mid;
        limb(base, az + (rnd() - 0.5) * 1.5, reach * (0.5 + rnd() * 0.2), rise * (0.4 + rnd() * 0.4), r0 * 0.45, depth - 1);
      }
    }
  };
  const off = rnd() * TAU;
  for (let i = 0; i < limbs; i += 1) {
    const az = off + (i / limbs) * TAU + (rnd() - 0.5) * 0.5;
    const up = i === 0 ? 1.25 : 0.55 + rnd() * 0.6;
    limb(top, az, Rx * (i === 0 ? 0.18 : 0.42 + rnd() * 0.26), (Hc - Ht) * up + Ry * 0.25, 0.036, bare ? 2 : 1);
  }
  if (leafMat) {
    const center = v3(0, Hc, 0);
    const spots: Vec3[] = [];
    for (const e of ends) {
      spots.push(e.clone());
    }
    const want = Math.round(34 * sparse);
    let guard = 0;
    while (spots.length < want && guard < 800) {
      guard += 1;
      const a = rnd() * TAU;
      const el = Math.asin(rnd() * 1.35 - 0.35);
      const r = 0.5 + 0.48 * Math.pow(rnd(), 0.6);
      const p = v3(Math.cos(a) * Math.cos(el) * Rx * r, Hc + Math.sin(el) * Ry * r, Math.sin(a) * Math.cos(el) * Rx * r);
      if (p.y < Ht * 0.9) {
        continue;
      }
      spots.push(p);
    }
    const right = new Vec3();
    const up = new Vec3();
    const face = new Vec3();
    const tmp = new Vec3();
    for (const p of spots) {
      const out = v3((p.x - center.x) / Rx, (p.y - center.y) / Ry, (p.z - center.z) / Rx);
      const rn = Math.min(1.2, out.length());
      out.normalize();
      const size = (0.17 + rnd() * 0.07) * (0.9 + 0.2 * rn);
      // 里层 / 下层的叶子暗,外层 / 上层亮
      const ao = (0.5 + 0.5 * smooth(0.2, 1.0, rn)) * (0.78 + 0.22 * smooth(-0.6, 0.6, out.y));
      for (let k = 0; k < 3; k += 1) {
        // 朝向:镜头方向和「从树冠往外」各一半,再乱一点
        face.set(TO_CAM.x * 0.6 + out.x * 0.5 + (rnd() - 0.5) * 0.7, TO_CAM.y * 0.6 + out.y * 0.5 + (rnd() - 0.5) * 0.5, TO_CAM.z * 0.6 + out.z * 0.5 + (rnd() - 0.5) * 0.7).normalize();
        Vec3.cross(right, Vec3.UP, face);
        if (right.lengthSqr() < 1e-6) {
          right.set(1, 0, 0);
        }
        right.normalize();
        Vec3.cross(up, face, right).normalize();
        const roll = rnd() * TAU;
        const cs = Math.cos(roll) * size;
        const sn = Math.sin(roll) * size;
        const r2 = v3(right.x * cs + up.x * sn, right.y * cs + up.y * sn, right.z * cs + up.z * sn);
        const u2 = v3(-right.x * sn + up.x * cs, -right.y * sn + up.y * cs, -right.z * sn + up.z * cs);
        const c = v3(p.x + (rnd() - 0.5) * size * 0.9, p.y + (rnd() - 0.5) * size * 0.7, p.z + (rnd() - 0.5) * size * 0.9);
        const cell = Math.floor(rnd() * 4);
        const u0 = (cell % 2) * 0.5;
        const v0 = Math.floor(cell / 2) * 0.5;
        const k2 = ao * (0.9 + rnd() * 0.2);
        const hue: Tint = [k2 * (0.96 + rnd() * 0.08), k2, k2 * (0.94 + rnd() * 0.1)];
        const ns: Vec3[] = [];
        const ts: Tint[] = [];
        for (const corner of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          tmp.set(c.x + r2.x * corner[0] + u2.x * corner[1] - center.x, c.y + r2.y * corner[0] + u2.y * corner[1] - center.y, c.z + r2.z * corner[0] + u2.z * corner[1] - center.z);
          ns.push(norm(tmp.x / Rx, tmp.y / Ry + 0.55, tmp.z / Rx));
          ts.push(hue);
        }
        leaves.card(c, r2, u2, [u0 + 0.004, v0 + 0.004, u0 + 0.496, v0 + 0.496], ns, ts);
      }
    }
  }
  const list: Array<{ batch: Sculpt; mat: Material; cast: boolean }> = [{ batch: bark, mat: M.bark, cast: true }];
  if (leafMat) {
    list.push({ batch: leaves, mat: leafMat, cast: true });
  }
  return partsOf(list);
}

// ───────────────────────── 岩石 ─────────────────────────
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V: V3[] = [[-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0], [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T], [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1]];
const ICO_F: V3[] = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

/** 细分过的二十面体(单位球上的点 + 三角形)。 */
function icosphere(level: number): { verts: Vec3[]; faces: V3[] } {
  let verts = ICO_V.map((p) => norm(p[0], p[1], p[2]));
  let faces = ICO_F.map((f) => [f[0], f[1], f[2]] as V3);
  for (let l = 0; l < level; l += 1) {
    const cache = new Map<string, number>();
    const midOf = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let i = cache.get(key);
      if (i === undefined) {
        i = verts.length;
        verts.push(norm(verts[a].x + verts[b].x, verts[a].y + verts[b].y, verts[a].z + verts[b].z));
        cache.set(key, i);
      }
      return i;
    };
    const next: V3[] = [];
    for (const f of faces) {
      const ab = midOf(f[0], f[1]);
      const bc = midOf(f[1], f[2]);
      const ca = midOf(f[2], f[0]);
      next.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]);
    }
    faces = next;
    verts = verts.slice();
  }
  return { verts, faces };
}

/**
 * 一块石头:细分的球,顶点沿径向按几层噪声推拉(大起伏 + 几个被「削平」的断面),压扁、底埋进土里;
 * 按面平直着色(一块块断面),朝上的面染一点苔色,贴地的一圈压暗。
 */
function addRock(b: Sculpt, r: number, at: Vec3, squash: number, level: number, rnd: () => number, moss: number): void {
  const ico = icosphere(level);
  // 几个随机的「断面」:落在断面外侧的点被削回断面上,岩石才有平的面和硬的棱
  const cuts: Array<{ n: Vec3; d: number }> = [];
  const nc = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < nc; i += 1) {
    cuts.push({ n: norm(rnd() - 0.5, (rnd() - 0.3) * 0.9, rnd() - 0.5), d: 0.62 + rnd() * 0.28 });
  }
  const seedA = rnd() * 50;
  const sx = 0.85 + rnd() * 0.4;
  const sz = 0.85 + rnd() * 0.4;
  const yaw = rnd() * TAU;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const P = ico.verts.map((v) => {
    const n1 = Math.sin(v.x * 2.3 + seedA) * Math.cos(v.y * 2.1 - seedA * 0.7) * Math.sin(v.z * 2.7 + seedA * 1.3);
    const n2 = Math.sin(v.x * 5.1 - seedA) * Math.sin(v.y * 4.7 + seedA) * Math.cos(v.z * 5.6 + seedA * 0.4);
    let k = 1 + n1 * 0.2 + n2 * 0.07;
    for (const c of cuts) {
      const proj = v.x * c.n.x + v.y * c.n.y + v.z * c.n.z;
      if (proj * k > c.d) {
        k = c.d / proj;
      }
    }
    let x = v.x * k * sx;
    let y = v.y * k * squash;
    let z = v.z * k * sz;
    const rx = x * cy - z * sy;
    z = x * sy + z * cy;
    x = rx;
    y = Math.max(-0.22, y);        // 底下削平(埋在土里)
    return v3(at.x + x * r, at.y + (y + 0.2) * r, at.z + z * r);
  });
  const ou = rnd() * 9;
  const ov = rnd() * 9;
  const e1 = new Vec3();
  const e2 = new Vec3();
  const n = new Vec3();
  const centre = v3(at.x, at.y + r * 0.2, at.z);
  const tone = 0.88 + rnd() * 0.14;
  for (const f of ico.faces) {
    const a = P[f[0]];
    const bb = P[f[1]];
    const c = P[f[2]];
    Vec3.subtract(e1, bb, a);
    Vec3.subtract(e2, c, a);
    Vec3.cross(n, e1, e2);
    if (n.lengthSqr() < 1e-12) {
      continue;
    }
    n.normalize();
    if (n.x * ((a.x + bb.x + c.x) / 3 - centre.x) + n.y * ((a.y + bb.y + c.y) / 3 - centre.y) + n.z * ((a.z + bb.z + c.z) / 3 - centre.z) < 0) {
      n.multiplyScalar(-1);
    }
    // 朝上的面长苔;背光的面(朝右下)本来就会被主光压暗,这里只给一点冷暖变化
    const mk = moss * smooth(0.45, 0.95, n.y) * (0.5 + 0.5 * Math.sin(a.x * 7 + a.z * 5 + seedA));
    const tint: Tint = [lerp(0.86, 0.5, mk) * tone, lerp(0.84, 0.6, mk) * tone, lerp(0.8, 0.36, mk) * tone];
    b.poly([a, bb, c], n.clone(), tint, 0.55 / Math.max(0.3, r), ou, ov, at.y - 0.2);
  }
}

/** 一堆石头:一两块大的 + 几块小的挤在一起,整体占满「宽 = 1」。big = 只有一整块(大岩)。 */
function buildRocks(hr: number, seed: number, style: 'pile' | 'boulder' | 'small'): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const b = new Leafy();
  if (style === 'boulder') {
    addRock(b, 0.44, v3(0, 0, 0), Math.min(0.95, 0.5 + hr * 0.26), 2, rnd, 0.9);
    addRock(b, 0.2, v3(0.3, 0, 0.16), 0.7, 1, rnd, 0.6);
    addRock(b, 0.14, v3(-0.34, 0, 0.12), 0.7, 1, rnd, 0.4);
  } else if (style === 'pile') {
    addRock(b, 0.3, v3(-0.08, 0, -0.04), Math.min(0.95, 0.5 + hr * 0.3), 2, rnd, 0.8);
    addRock(b, 0.21, v3(0.24, 0, 0.06), 0.72, 1, rnd, 0.6);
    addRock(b, 0.15, v3(-0.32, 0, 0.12), 0.7, 1, rnd, 0.5);
    addRock(b, 0.1, v3(0.06, 0, 0.24), 0.7, 1, rnd, 0.3);
    addRock(b, 0.07, v3(0.38, 0, 0.2), 0.7, 0, rnd, 0.2);
  } else {
    addRock(b, 0.24, v3(-0.1, 0, 0), 0.72, 1, rnd, 0.5);
    addRock(b, 0.17, v3(0.2, 0, 0.08), 0.7, 1, rnd, 0.4);
    addRock(b, 0.1, v3(-0.02, 0, 0.2), 0.7, 0, rnd, 0.2);
    addRock(b, 0.07, v3(0.36, 0, -0.06), 0.7, 0, rnd, 0.2);
  }
  return partsOf([{ batch: b, mat: M.rock, cast: true }]);
}

// ───────────────────────── 草 / 蕨 / 灌木 ─────────────────────────
/** 一丛草:三片交叉的立片(微微往外倒),法线朝上;根部压暗。 */
function buildGrass(hr: number, seed: number, mat: Material): Variant {
  const rnd = mulberry32(seed);
  const b = new Leafy();
  const h = Math.max(0.5, hr * 0.94);
  const up = norm(0, 1, 0.2);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI + rnd() * 0.4;
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    const tilt = (rnd() - 0.5) * 0.22;
    const c = v3(-oz * tilt * h * 0.5, h * 0.5, ox * tilt * h * 0.5);
    const r = v3(ox * 0.5, 0, oz * 0.5);
    const u = v3(-oz * tilt * h * 0.5, h * 0.5, ox * tilt * h * 0.5);
    b.card(c, r, u, [0, 0, 1, 1], [up, up, up, up], [[0.62, 0.62, 0.6], [0.62, 0.62, 0.6], [1, 1, 1], [1, 1, 1]]);
  }
  return partsOf([{ batch: b, mat, cast: false }]);
}

/** 蕨:一圈从中心拱出去的叶片(先往上、再往外垂下)。 */
function buildFern(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const b = new Leafy();
  const n = 11;
  for (let i = 0; i < n; i += 1) {
    const az = (i / n) * TAU + rnd() * 0.5;
    const ox = Math.cos(az);
    const oz = Math.sin(az);
    const len = 0.5 * (0.8 + rnd() * 0.35);
    const lift = 0.5 + rnd() * 0.3;
    const pts: Vec3[] = [];
    const sides: Vec3[] = [];
    const ns: Vec3[] = [];
    const tints: Tint[] = [];
    const wid = len * 0.2;
    for (let k = 0; k <= 4; k += 1) {
      const s = k / 4;
      // 拱形:高度先升后降
      const y = len * lift * Math.sin(s * Math.PI * 0.78) * 0.9 + 0.02;
      pts.push(v3(ox * len * s * 0.95, y, oz * len * s * 0.95));
      sides.push(v3(-oz * wid, 0, ox * wid));
      ns.push(norm(ox * 0.3, 0.9, oz * 0.3 + 0.15));
      const kk = 0.66 + 0.34 * s;
      tints.push([kk, kk, kk]);
    }
    b.ribbon(pts, sides, ns, tints);
  }
  void hr;
  return partsOf([{ batch: b, mat: M.frond, cast: false }]);
}

/** 灌木:贴着地的一团叶簇(半个球),里层暗外层亮。 */
function buildBush(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const b = new Leafy();
  const R = 0.42;
  const Hh = Math.min(0.62, hr * 0.62);
  const right = new Vec3();
  const up = new Vec3();
  const face = new Vec3();
  for (let i = 0; i < 16; i += 1) {
    const a = rnd() * TAU;
    const el = Math.asin(0.1 + rnd() * 0.88);
    const r = 0.45 + 0.5 * rnd();
    const p = v3(Math.cos(a) * Math.cos(el) * R * r, 0.06 + Math.sin(el) * Hh * r, Math.sin(a) * Math.cos(el) * R * r);
    const out = norm(p.x / R, p.y / Hh, p.z / R);
    face.set(TO_CAM.x * 0.6 + out.x * 0.5 + (rnd() - 0.5) * 0.6, TO_CAM.y * 0.6 + out.y * 0.5, TO_CAM.z * 0.6 + out.z * 0.5 + (rnd() - 0.5) * 0.6).normalize();
    Vec3.cross(right, Vec3.UP, face).normalize();
    Vec3.cross(up, face, right).normalize();
    const size = 0.2 + rnd() * 0.08;
    const roll = rnd() * TAU;
    const cs = Math.cos(roll) * size;
    const sn = Math.sin(roll) * size;
    const r2 = v3(right.x * cs + up.x * sn, right.y * cs + up.y * sn, right.z * cs + up.z * sn);
    const u2 = v3(-right.x * sn + up.x * cs, -right.y * sn + up.y * cs, -right.z * sn + up.z * cs);
    const cell = Math.floor(rnd() * 4);
    const u0 = (cell % 2) * 0.5;
    const v0 = Math.floor(cell / 2) * 0.5;
    const k = (0.62 + 0.38 * smooth(0.3, 1, r)) * (0.9 + rnd() * 0.2);
    const nn = norm(out.x, out.y + 0.6, out.z);
    b.card(p, r2, u2, [u0 + 0.006, v0 + 0.006, u0 + 0.494, v0 + 0.494], [nn, nn, nn, nn], [[k, k, k], [k, k, k], [k, k, k], [k, k, k]]);
  }
  return partsOf([{ batch: b, mat: M.shrub, cast: true }]);
}

// ───────────────────────── 营地 ─────────────────────────
/** 削尖的木桩。 */
function stake(b: Sculpt, x: number, z: number, r: number, h: number, rnd: () => number, tint: Tint, lean = 0): void {
  const rot = v3((rnd() - 0.5) * 3 + lean, rnd() * 360, (rnd() - 0.5) * 3);
  b.cylinder(r * 0.94, r, h, 7, v3(x, h / 2, z), rot, tint, 1.4, rnd, 0, false);
  b.cylinder(0.012, r * 0.94, r * 2.4, 7, v3(x, h + r * 1.2 - 0.004, z), rot, [tint[0] * 1.12, tint[1] * 1.1, tint[2] * 1.02], 1.4, rnd, undefined, false);
}

/**
 * 木栅栏(宽 = 1,沿左右方向一字排开):一排削尖的原木 + 前后两道横梁 + 铁钉头,中间一座方形的小岗楼。
 * (2D 的图是斜着画的一段墙;碰撞框是横着的一条,3D 里按碰撞框的方向立。)
 */
function buildPalisade(hr: number, seed: number, lengthM: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const iron = new Leafy();
  // 这一种按真实尺寸(米)建,不随宽度缩放 —— 木桩的粗细不能跟着墙的长短变
  const L = lengthM;
  const n = Math.round(L / 0.3);
  const towerAt = 0.12 * L;
  const towerW = 1.15;
  for (let i = 0; i < n; i += 1) {
    const x = -L / 2 + (i + 0.5) * (L / n);
    if (Math.abs(x - towerAt) < towerW / 2) {
      continue;
    }
    const k = 0.72 + rnd() * 0.24;
    stake(wood, x + (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.05, 0.13 + rnd() * 0.03, 2.25 + rnd() * 0.45, rnd, [k, k * 0.96, k * 0.9]);
  }
  for (const [y, z] of [[0.75, 0.17], [1.7, 0.17]] as Array<[number, number]>) {
    wood.box(L, 0.16, 0.1, v3(0, y, z), v3(0, 0, 0), [0.62, 0.58, 0.52], 1.2, rnd, 0.015);
    for (let i = 0; i < n; i += 2) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      iron.cylinder(0.022, 0.03, 0.03, 6, v3(x, y, z + 0.06), v3(90, 0, 0), [1, 1, 1], 1, rnd, undefined, true);
    }
  }
  // 岗楼:四根粗柱 + 木板墙 + 顶上一圈横梁和四坡的木架
  const tw = towerW;
  const th = 3.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      wood.box(0.2, th, 0.2, v3(towerAt + sx * (tw / 2 - 0.1), th / 2, sz * (tw / 2 - 0.1)), v3(0, 0, 0), [0.7, 0.66, 0.6], 1.2, rnd, 0.02, 0);
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const k = 0.74 + rnd() * 0.2;
    const x = towerAt - tw / 2 + 0.22 + i * ((tw - 0.44) / 4);
    wood.box(0.2, 2.3, 0.06, v3(x, 1.15, tw / 2 - 0.08), v3(0, 0, 0), [k, k * 0.96, k * 0.9], 1.2, rnd, 0.01, 0);
    wood.box(0.06, 2.3, 0.2, v3(towerAt + tw / 2 - 0.08, 1.15, -tw / 2 + 0.22 + i * ((tw - 0.44) / 4)), v3(0, 0, 0), [k * 0.9, k * 0.86, k * 0.8], 1.2, rnd, 0.01, 0);
    wood.box(0.06, 2.3, 0.2, v3(towerAt - tw / 2 + 0.08, 1.15, -tw / 2 + 0.22 + i * ((tw - 0.44) / 4)), v3(0, 0, 0), [k * 0.9, k * 0.86, k * 0.8], 1.2, rnd, 0.01, 0);
  }
  for (const y of [2.4, th - 0.08]) {
    wood.box(tw + 0.12, 0.14, 0.14, v3(towerAt, y, tw / 2 - 0.1), v3(0, 0, 0), [0.6, 0.56, 0.5], 1.2, rnd, 0.015);
    wood.box(tw + 0.12, 0.14, 0.14, v3(towerAt, y, -tw / 2 + 0.1), v3(0, 0, 0), [0.6, 0.56, 0.5], 1.2, rnd, 0.015);
    wood.box(0.14, 0.14, tw + 0.12, v3(towerAt + tw / 2 - 0.1, y, 0), v3(0, 0, 0), [0.6, 0.56, 0.5], 1.2, rnd, 0.015);
    wood.box(0.14, 0.14, tw + 0.12, v3(towerAt - tw / 2 + 0.1, y, 0), v3(0, 0, 0), [0.6, 0.56, 0.5], 1.2, rnd, 0.015);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // 四坡木架:从四个角斜着收到顶
      const ang = Math.atan2(tw / 2 - 0.1, 0.7) * (180 / Math.PI);
      wood.box(0.09, 1.05, 0.09, v3(towerAt + sx * (tw / 4 - 0.05), th + 0.32, sz * (tw / 4 - 0.05)), v3(-sz * ang * 0.72, 0, sx * ang * 0.72), [0.66, 0.62, 0.56], 1.2, rnd, 0.01);
    }
  }
  void hr;
  return partsOf([{ batch: wood, mat: M.wood, cast: true }, { batch: iron, mat: M.iron, cast: false }]);
}

/** 一只木箱:六面木板 + 四边的框条 + 一道斜撑 + 八个铁包角。 */
function crate(wood: Sculpt, iron: Sculpt, s: number, at: Vec3, yaw: number, rnd: () => number): void {
  const k = 0.78 + rnd() * 0.16;
  wood.box(s, s, s, v3(at.x, at.y + s / 2, at.z), v3(0, yaw, 0), [k, k * 0.95, k * 0.86], 1.5 / s, rnd, 0.012, at.y);
  const cy = Math.cos((yaw * Math.PI) / 180);
  const sy = Math.sin((yaw * Math.PI) / 180);
  const P = (x: number, y: number, z: number): Vec3 => v3(at.x + x * cy + z * sy, at.y + y, at.z - x * sy + z * cy);
  const fr = s * 0.11;
  const frame: Tint = [k * 0.82, k * 0.76, k * 0.68];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      // 竖框条(四条竖棱)、上下的横框条(前后左右)
      wood.box(fr, s + 0.01, fr, P(a * (s / 2 - fr / 2 + 0.008), s / 2, b * (s / 2 - fr / 2 + 0.008)), v3(0, yaw, 0), frame, 1.5 / s, rnd, 0.006);
      wood.box(s + 0.012, fr, fr, P(0, s / 2 + a * (s / 2 - fr / 2 + 0.006), b * (s / 2 - fr / 2 + 0.008)), v3(0, yaw, 0), frame, 1.5 / s, rnd, 0.006);
      wood.box(fr, fr, s + 0.012, P(b * (s / 2 - fr / 2 + 0.008), s / 2 + a * (s / 2 - fr / 2 + 0.006), 0), v3(0, yaw, 0), frame, 1.5 / s, rnd, 0.006);
      for (const c of [-1, 1]) {
        iron.box(fr * 1.25, fr * 1.25, fr * 1.25, P(a * (s / 2 - fr * 0.45), s / 2 + c * (s / 2 - fr * 0.45), b * (s / 2 - fr * 0.45)), v3(0, yaw, 0), [1, 1, 1], 1, rnd, 0.004);
      }
    }
  }
  // 朝镜头的一面和顶面各一道斜撑
  wood.box(s * 1.2, fr * 0.9, fr * 0.5, P(0, s / 2, s / 2 + 0.004), v3(0, yaw, 42), frame, 1.5 / s, rnd, 0.004);
  wood.box(s * 1.2, fr * 0.5, fr * 0.9, P(0, s + 0.004, 0), v3(0, yaw + 42, 0), frame, 1.5 / s, rnd, 0.004);
}

/** 木箱堆(宽 = 1):一大一小两只箱子 + 一只木桶。 */
function buildCrates(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const iron = new Leafy();
  crate(wood, iron, 0.46, v3(-0.2, 0, -0.06), 12, rnd);
  crate(wood, iron, 0.3, v3(0.06, 0, 0.22), -18, rnd);
  // 木桶:鼓肚子的旋转体 + 三道铁箍
  const bx = 0.3;
  const bz = -0.04;
  const prof: Array<[number, number]> = [[0.13, 0], [0.155, 0.1], [0.165, 0.21], [0.155, 0.32], [0.13, 0.42]];
  wood.lathe(prof, 14, { den: 3, tint: (u) => {
    const k = 0.7 + 0.2 * (Math.floor(u * 12) % 2);
    return [k, k * 0.92, k * 0.8];
  }, xf: undefined, bend: (v, p) => {
    p.x += bx;
    p.z += bz;
  } });
  wood.cylinder(0.125, 0.125, 0.012, 14, v3(bx, 0.414, bz), v3(0, 0, 0), [0.6, 0.55, 0.48], 3, rnd, undefined, true);
  for (const y of [0.07, 0.21, 0.35]) {
    const rr = y === 0.21 ? 0.168 : 0.148;
    iron.cylinder(rr, rr, 0.03, 14, v3(bx, y, bz), v3(0, 0, 0), [1, 1, 1], 1, rnd, undefined, false);
  }
  void hr;
  return partsOf([{ batch: wood, mat: M.wood, cast: true }, { batch: iron, mat: M.iron, cast: false }]);
}

/** 旗(宽 = 1,很高):一根长杆 + 顶上的横杆,挂一面撕了边的红旗。杆和旗面分开,旗面单独随风摆。 */
function buildBanner(hr: number, seed: number): { pole: Variant; cloth: Variant; hang: Vec3 } {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const iron = new Leafy();
  const cloth = new Leafy();
  const H = hr * 0.93;
  wood.cylinder(0.03, 0.045, H, 7, v3(0, H / 2, 0), v3(0, 0, 1.5), [0.56, 0.5, 0.44], 1.5, rnd, 0, true);
  iron.cylinder(0.001, 0.04, 0.22, 6, v3(0, H + 0.1, 0), v3(0, 0, 1.5), [1, 1, 1], 1, rnd, undefined, false);
  const barY = H * 0.93;
  wood.cylinder(0.022, 0.022, 0.82, 6, v3(0.02, barY, 0), v3(0, 0, 90), [0.5, 0.45, 0.4], 1.5, rnd, undefined, true);
  // 旗面:宽 0.72,长 = 杆高的 0.36;分 6 段,越往下越往前鼓一点(挂着的布不是一块平板)
  const cw = 0.36;
  const cl = H * 0.36;
  const pts: Vec3[] = [];
  const sides: Vec3[] = [];
  const ns: Vec3[] = [];
  const tints: Tint[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const s = i / 6;
    pts.push(v3(0, -cl * s, 0.04 + Math.sin(s * 2.4) * 0.07));
    sides.push(v3(cw, 0, 0));
    ns.push(norm(0, 0.35, 1));
    tints.push([1, 1, 1]);
  }
  // 带子的贴图 v 是「起点 1 → 终点 0」,旗面的图上边是挂着的那头:把点序倒过来铺
  cloth.ribbon(pts.slice().reverse(), sides, ns, tints);
  return { pole: partsOf([{ batch: wood, mat: M.wood, cast: true }, { batch: iron, mat: M.iron, cast: false }]), cloth: partsOf([{ batch: cloth, mat: M.banner, cast: true }]), hang: v3(0.02, barY - 0.03, 0) };
}

/** 营帐(宽 = 1):两根立柱撑一根脊梁,帆布从脊梁搭到两侧的矮墙上,正面开着门;四角拉绳。 */
function buildTent(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const canvas = new Leafy();
  const W = 0.44;        // 半宽(左右)
  const D = 0.36;        // 半深(前后)
  const wall = 0.22;     // 侧墙高
  const ridge = Math.min(0.78, hr * 0.56);
  const cloth = (u: number, v: number, p: Vec3): Tint => {
    const k = 0.78 + 0.22 * v - 0.06 * Math.abs(Math.sin(p.z * 9));
    return [k, k * 0.98, k * 0.94];
  };
  // 屋面:左右各一片,从脊梁到墙头,中间往下塌一点(布的垂度),沿前后方向有浅褶
  for (const s of [-1, 1]) {
    canvas.surf(6, 8, (u, v, out) => {
      const z = lerp(-D, D, u);
      const t = v;
      const sag = Math.sin(t * Math.PI) * 0.035 + Math.sin(u * Math.PI * 5) * 0.008 * Math.sin(t * Math.PI);
      out.set(s * lerp(W * 1.04, 0, t), lerp(wall, ridge, t) - sag, z);
    }, { den: 2.2, tint: cloth, flip: s < 0 });
    // 侧墙:从墙头垂到地
    canvas.surf(6, 2, (u, v, out) => {
      out.set(s * (W * 1.04 - 0.012 * Math.sin(u * Math.PI * 6)), lerp(0, wall, v), lerp(-D, D, u));
    }, { den: 2.2, tint: (u, v) => [0.7 + 0.14 * v, 0.68 + 0.14 * v, 0.62 + 0.14 * v], flip: s < 0 });
  }
  // 后山墙(整片)和前山墙(两扇门帘,中间敞着)
  const gable = (z: number, open: boolean): void => {
    for (const s of [-1, 1]) {
      const inner = open ? 0.13 : 0;
      canvas.surf(4, 4, (u, v, out) => {
        const x = s * lerp(inner + (open ? 0.05 * (1 - v) : 0), W * 1.04, u);
        const top = lerp(ridge, wall, Math.abs(x) / (W * 1.04));
        out.set(x, lerp(0, top, v), z + (open ? 0.03 * Math.sin(u * 3) : 0));
      }, { den: 2.2, tint: (u, v) => [0.74 + 0.14 * v, 0.72 + 0.14 * v, 0.66 + 0.14 * v], flip: (s > 0) === (z > 0) });
    }
  };
  gable(-D, false);
  gable(D, true);
  // 门里是黑的
  canvas.poly([v3(-0.16, 0, D - 0.03), v3(0.16, 0, D - 0.03), v3(0.05, ridge * 0.86, D - 0.03), v3(-0.05, ridge * 0.86, D - 0.03)], v3(0, 0, 1), [0.07, 0.06, 0.06], 1, 0, 0);
  // 立柱、脊梁
  for (const z of [-D, D]) {
    wood.cylinder(0.022, 0.026, ridge + 0.12, 6, v3(0, (ridge + 0.12) / 2, z), v3(0, 0, 0), [0.6, 0.55, 0.48], 2, rnd, 0, true);
  }
  wood.cylinder(0.02, 0.02, D * 2 + 0.1, 6, v3(0, ridge + 0.02, 0), v3(90, 0, 0), [0.56, 0.5, 0.44], 2, rnd, undefined, true);
  // 拉绳和地钉
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const from = v3(sx * W * 1.04, wall, sz * D);
      const to = v3(sx * (W + 0.2), 0.02, sz * (D + 0.16));
      wood.tube([from, v3((from.x + to.x) / 2, (from.y + to.y) / 2 - 0.012, (from.z + to.z) / 2), to], 0.006, 4, { den: 4, tint: [0.62, 0.56, 0.44] });
      wood.cylinder(0.012, 0.016, 0.12, 5, v3(to.x, 0.05, to.z), v3(sz * 18, 0, -sx * 18), [0.5, 0.44, 0.38], 2, rnd, undefined, true);
    }
  }
  return partsOf([{ batch: canvas, mat: M.canvas, cast: true }, { batch: wood, mat: M.wood, cast: true }]);
}

// ───────────────────────── 挂进场景 ─────────────────────────
function mount(parent: Node, v: Variant, out: MeshRenderer[]): void {
  for (const p of v.parts) {
    const n = new Node('P');
    n.layer = FIELD_LAYER;
    parent.addChild(n);
    const mr = n.addComponent(MeshRenderer);
    mr.mesh = p.mesh;
    mr.setSharedMaterial(p.mat, 0);
    mr.shadowCastingMode = p.cast ? MeshRenderer.ShadowCastingMode.ON : MeshRenderer.ShadowCastingMode.OFF;
    mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
    out.push(mr);
  }
}

function variant(key: string, make: () => Variant): Variant {
  let v = variants.get(key);
  if (!v) {
    v = make();
    variants.set(key, v);
  }
  return v;
}

interface Kind {
  test: RegExp;
  /** 同一种摆件做几个变体。 */
  count: number;
  /** 随风摆的幅度(度;0 = 不摆;整棵从根上摇)。 */
  sway: number;
  /** 能不能随便转个角度当成另一棵(叶片专门朝镜头摆的树只能转 0 / 180 度)。 */
  spin?: boolean;
  make(hr: number, seed: number, w: number): Variant;
  /** 按真实尺寸建的(不随 2D 贴图的宽度缩放)。 */
  real?: boolean;
  /** 整体再放大 / 缩小一点(生成的标准尺寸和 2D 贴图里实际占的大小对不上的时候微调)。 */
  scale?: number;
}

const KINDS: Kind[] = [
  { test: /w3_tree_pine/, count: 4, sway: 0.55, spin: true, make: (hr, seed) => buildPine(hr, seed) },
  { test: /w3_tree_oak/, count: 3, sway: 0.5, make: (hr, seed) => buildBroadleaf(hr, seed, mats().oak, 1) },
  { test: /w3_tree_autumn/, count: 3, sway: 0.5, make: (hr, seed) => buildBroadleaf(hr, seed, mats().autumn, 0.9) },
  { test: /fld_dead_tree/, count: 2, sway: 0, spin: true, make: (hr, seed) => buildBroadleaf(hr, seed, null, 1) },
  { test: /fld_g_boulders_l|w3_rock_big/, count: 3, sway: 0, spin: true, make: (hr, seed) => buildRocks(hr, seed, 'boulder') },
  { test: /fld_rocks|fld_g_boulders_m|w3_rock_small/, count: 3, sway: 0, spin: true, make: (hr, seed) => buildRocks(hr, seed, 'pile') },
  { test: /fld_g_rocks_s/, count: 3, sway: 0, spin: true, make: (hr, seed) => buildRocks(hr, seed, 'small') },
  { test: /vil3_grass_tuft|fld_g_grass_l/, count: 3, sway: 2.6, spin: true, make: (hr, seed) => buildGrass(hr, seed, mats().grass) },
  { test: /fld_g_grass_s/, count: 3, sway: 2.6, spin: true, make: (hr, seed) => buildGrass(hr, seed, mats().dry) },
  { test: /w3_fern/, count: 3, sway: 1.8, spin: true, make: (hr, seed) => buildFern(hr, seed) },
  { test: /vil3_bush/, count: 3, sway: 1.0, make: (hr, seed) => buildBush(hr, seed) },
  { test: /w3_camp_palisade/, count: 1, sway: 0, real: true, make: (hr, seed, w) => buildPalisade(hr, seed, w * 0.86) },
  { test: /w3_camp_crates/, count: 1, sway: 0, make: (hr, seed) => buildCrates(hr, seed) },
  { test: /w3_camp_tent/, count: 1, sway: 0, make: (hr, seed) => buildTent(hr, seed) },
];

function install(): void {
  for (let k = 0; k < KINDS.length; k += 1) {
    const kind = KINDS[k];
    addPropBuilder({
      match: (asset) => kind.test.test(asset),
      build: (parent, asset, w, h, seed, flip) => {
        const hr = Math.round((h / w) * 20) / 20;
        const vi = Math.floor(seed * kind.count) % kind.count;
        const key = kind.real ? `${k}:${vi}:${w.toFixed(1)}` : `${k}:${vi}:${hr}`;
        const v = variant(key, () => kind.make(hr, 1000 + k * 97 + vi * 13, w));
        const node = new Node(`Flora_${k}`);
        parent.addChild(node);
        const body = new Node('Body');
        node.addChild(body);
        const s = (kind.real ? 1 : w) * (kind.scale ?? 1);
        // 同一个变体转个角度、镜像一下,又是一棵不一样的
        body.setScale(flip ? -s : s, s, s);
        if (!kind.real && kind.count > 1) {
          const turn = Math.floor(seed * 997) % 360;
          body.setRotationFromEuler(0, kind.spin ? turn : turn < 180 ? 0 : 180, 0);
        }
        const renderers: MeshRenderer[] = [];
        mount(body, v, renderers);
        return { node, renderers, sway: kind.sway > 0 ? [node] : [], swayAmp: kind.sway };
      },
    });
  }
  // 旗:杆不动,旗面单独摆
  addPropBuilder({
    match: (asset) => /w3_camp_banner/.test(asset),
    build: (parent, asset, w, h, seed, flip) => {
      const hr = Math.round((h / w) * 20) / 20;
      const key = `banner:${hr}`;
      let b = (variants.get(key) as any) as { pole: Variant; cloth: Variant; hang: Vec3 } | undefined;
      if (!b) {
        b = buildBanner(hr, 4242);
        variants.set(key, b as any);
      }
      const node = new Node('Flora_banner');
      parent.addChild(node);
      node.setScale(flip ? -w : w, w, w);
      const renderers: MeshRenderer[] = [];
      mount(node, b.pole, renderers);
      const cloth = new Node('Cloth');
      node.addChild(cloth);
      cloth.setPosition(b.hang);
      mount(cloth, b.cloth, renderers);
      return { node, renderers, sway: [cloth], swayAmp: 5 };
    },
  });
}

if (!EDITOR && sys.isBrowser) {
  install();
}
