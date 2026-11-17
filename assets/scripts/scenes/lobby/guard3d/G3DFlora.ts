import { Color, gfx, Mat4, Material, Mesh, MeshRenderer, Node, sys, Texture2D, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { tex } from './G3DKit';
import type { Tint } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import { barkPbr, canvasPbr, contactBlob, endGrainPbr, fbm3, ironPbr, rockPbr, woodPbr } from './G3DFieldTex';
import type { Pbr } from './G3DFieldTex';
import { ctxOf, makeCanvas, mulberry32 } from './G3DTextures';
import type { Ctx, Cv } from './G3DTextures';
import { fieldSoftEdges } from './TownPost3D';
import { addPropBuilder } from './TownProps3D';
import { FIELD_LAYER } from './TownWorld3D';

/**
 * 野外真 3D 场景 · 代码生成的摆件(实验,2026-11-16)。
 *
 * 用户看完第一版说「地形,技能也可以用酷炫的 3D 素材」,又问「这些 3D 模型不是纯代码吗?会不会占用很大的空间」——
 * 这里的树、岩石、草、营地的栅栏 / 木箱 / 旗 / 营帐全是代码拼的网格 + 画布上现画的贴图,不带任何模型或图片文件。
 * 镜头是正交 + 固定俯角、永远不转,所以叶片 / 松枝这些「片」可以专门朝着镜头的方向摆,不会露出纸片的侧面。
 *
 * 第二版(用户 11-16 看完第一版:「继续磨程序模型」「要 3A 级别的效果,参考那个 FPS」):
 * - 材质换成按像素算的整套贴图(G3DFieldTex.ts:高度 → 颜色 / 法线 / 遮蔽粗糙金属),木头、铁、帆布、树皮、岩石各一套;
 * - 岩石 = 方头方脑、带平顶和硬棱的石块堆(劈面 + 按夹角分组的法线 + 凹处压暗 + 苔),不再是圆疙瘩;
 * - 树 = 粗树干(带板根)+ 分枝 + 枝头的一团团小叶簇 / 一撮撮针叶小枝,团与团之间留缝、露出枝干;
 * - 营地 = 一块块木板钉出来的箱子、带铁箍的桶、削尖的原木桩,木纹顺着料走,棱都倒角;
 * - 每样东西脚下垫一块柔边暗斑(接地)。
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

/**
 * 带透明边的贴片材质(叶、松针、草、旗)全场共用,软边 / 硬裁切两种状态现场切:
 * 直接画到屏幕(有多重采样)时用「透明度转覆盖率」的软边;开了后期(离屏渲染,没有多重采样)时改回硬裁切。
 * 摆件每次挂进场景前对一遍(syncEdges),状态变了就把这些材质统一改过来 —— 变体的网格和材质是缓存的,不能靠重建。
 */
const CUTS: Array<{ m: Material; soft: number; hard: number }> = [];
let edgeSoft: boolean | null = null;

function syncEdges(): void {
  const soft = fieldSoftEdges();
  if (edgeSoft === soft) {
    return;
  }
  edgeSoft = soft;
  for (const c of CUTS) {
    c.m.overridePipelineStates({ rasterizerState: { cullMode: gfx.CullMode.NONE }, blendState: { isA2C: soft } });
    c.m.setProperty('alphaThreshold', soft ? c.soft : c.hard);
  }
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
const OAK: LeafPalette = { deep: [46, 62, 30], mid: [[74, 100, 42], [88, 112, 48], [66, 92, 44]], light: [[134, 154, 66], [158, 170, 82], [116, 142, 60]], twig: [70, 54, 38] };
const AUTUMN: LeafPalette = { deep: [104, 48, 22], mid: [[184, 88, 30], [202, 116, 40], [158, 62, 28], [176, 134, 50]], light: [[236, 154, 54], [244, 186, 78], [220, 108, 42], [230, 200, 94]], twig: [66, 46, 34] };
const SHRUB: LeafPalette = { deep: [40, 62, 26], mid: [[70, 104, 40], [84, 116, 44]], light: [[122, 152, 62], [146, 168, 78]], twig: [74, 60, 40] };

/**
 * 叶簇图集(第二版):2 × 2 四簇。每簇是一根小枝分出的几个小团,叶子绕着小团长(团与团之间有缝,轮廓参差,不是一个圆饼);
 * 叶子画得小(贴到树上之后一片叶子在画面上十来个像素,和手绘的树一个尺度),先画暗的垫底、再画中间色、最后是受光的亮叶。
 */
function paintLeafAtlas(S: number, pal: LeafPalette, seed: number, leafK = 1): Cv {
  const cv = makeCanvas(S, S);
  const ctx = ctxOf(cv);
  const rnd = mulberry32(seed);
  const C = S / 2;
  const gauss = (): number => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  for (let cell = 0; cell < 4; cell += 1) {
    const cx = (cell % 2) * C + C / 2;
    const cy = Math.floor(cell / 2) * C + C / 2;
    const R = C * 0.44;
    const subs: Array<[number, number, number]> = [[cx, cy, C * 0.11]];
    const ns = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < ns; i += 1) {
      const a = (i / ns) * TAU + rnd() * 0.7;
      const r = R * (0.42 + rnd() * 0.3);
      subs.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, C * (0.085 + rnd() * 0.05)]);
    }
    ctx.lineCap = 'round';
    for (let i = 1; i < subs.length; i += 1) {
      ctx.strokeStyle = rgb(pal.twig, 0.85 + rnd() * 0.3);
      ctx.lineWidth = C * 0.013 * (0.8 + rnd() * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo((cx + subs[i][0]) / 2 + gauss() * C * 0.04, (cy + subs[i][1]) / 2 + gauss() * C * 0.04, subs[i][0], subs[i][1]);
      ctx.stroke();
    }
    const layers: Array<{ n: number; spread: number; cols: V3[] }> = [
      { n: 170, spread: 1.0, cols: [pal.deep] },
      { n: 210, spread: 0.92, cols: pal.mid },
      { n: 130, spread: 0.8, cols: pal.light },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.n; i += 1) {
        const sub = subs[Math.floor(rnd() * subs.length)];
        let x = sub[0] + gauss() * sub[2] * 1.5 * layer.spread;
        let y = sub[1] + gauss() * sub[2] * 1.5 * layer.spread;
        const dc = Math.hypot(x - cx, y - cy);
        if (dc > R) {
          x = cx + ((x - cx) / dc) * R;
          y = cy + ((y - cy) / dc) * R;
        }
        const len = C * (0.062 + rnd() * 0.03) * leafK;
        const dir = Math.atan2(y - sub[1], x - sub[0]) + (rnd() - 0.5) * 2.0;
        const c0 = layer.cols[Math.floor(rnd() * layer.cols.length)];
        const c: V3 = [c0[0] * (0.88 + rnd() * 0.24), c0[1] * (0.88 + rnd() * 0.24), c0[2] * (0.88 + rnd() * 0.24)];
        leaf(ctx, x, y, dir, len, len * (0.34 + rnd() * 0.1), c);
      }
    }
  }
  return cv;
}

/**
 * 松针小枝图集:横排 4 格,每格一撮(底 = 接在枝上的一头,顶 = 梢)。一根细枝两侧密密地排着往梢上斜的针叶,
 * 细枝上再分出两三对更小的枝;针叶根部暗、梢上亮,几格的疏密和歪斜各不相同。
 */
function paintSprays(W: number, H: number, seed: number): Cv {
  const cv = makeCanvas(W, H);
  const ctx = ctxOf(cv);
  const rnd = mulberry32(seed);
  const cw = W / 4;
  const deep: V3 = [30, 44, 26];
  const mid: V3[] = [[58, 80, 40], [70, 92, 46], [50, 72, 40]];
  const light: V3[] = [[126, 146, 78], [150, 162, 94], [108, 132, 72]];
  ctx.lineCap = 'round';
  for (let cell = 0; cell < 4; cell += 1) {
    const cx = cell * cw + cw / 2;
    const y0 = H * 0.985;
    const y1 = H * 0.035;
    const bend = (rnd() - 0.5) * cw * 0.16;
    const at = (t: number): [number, number] => [cx + Math.sin(t * Math.PI) * bend, y0 + (y1 - y0) * t];
    const twigs: Array<[number, number, number, number, number]> = [];      // x0, y0, x1, y1, 针叶长度的倍数
    const main = 14;
    for (let i = 0; i < main; i += 1) {
      const a = at(i / main);
      const b = at((i + 1) / main);
      twigs.push([a[0], a[1], b[0], b[1], 1 - 0.45 * (i / main)]);
    }
    const pairs = 3 + Math.floor(rnd() * 2);
    for (let k = 0; k < pairs; k += 1) {
      const t = 0.14 + (k / pairs) * 0.62 + rnd() * 0.05;
      const p = at(t);
      for (const side of [-1, 1]) {
        const ang = 0.62 + rnd() * 0.3;
        const len = cw * 0.36 * (1 - t * 0.75) * (0.85 + rnd() * 0.3);
        twigs.push([p[0], p[1], p[0] + side * Math.sin(ang) * len, p[1] - Math.cos(ang) * len, 0.7]);
      }
    }
    const needles = (cols: V3[], step: number, base: number, wid: number, skip: number): void => {
      for (const tw of twigs) {
        const dx = tw[2] - tw[0];
        const dy = tw[3] - tw[1];
        const l = Math.hypot(dx, dy);
        if (l < 1) {
          continue;
        }
        const ux = dx / l;
        const uy = dy / l;
        for (let s = 0; s < l; s += step) {
          if (rnd() < skip) {
            continue;
          }
          for (const side of [-1, 1]) {
            const a = Math.atan2(uy, ux) + side * (0.55 + rnd() * 0.4);
            const nl = base * tw[4] * (0.8 + rnd() * 0.45);
            const px = tw[0] + ux * s;
            const py = tw[1] + uy * s;
            const c = cols[Math.floor(rnd() * cols.length)];
            ctx.strokeStyle = rgb(c, 0.86 + rnd() * 0.3);
            ctx.lineWidth = wid * (0.8 + rnd() * 0.5);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl);
            ctx.stroke();
          }
        }
      }
    };
    needles([deep], cw * 0.018, cw * 0.2, cw * 0.026, 0);
    for (const tw of twigs) {
      ctx.strokeStyle = rgb([62, 46, 32]);
      ctx.lineWidth = cw * 0.02;
      ctx.beginPath();
      ctx.moveTo(tw[0], tw[1]);
      ctx.lineTo(tw[2], tw[3]);
      ctx.stroke();
    }
    needles(mid, cw * 0.02, cw * 0.185, cw * 0.016, 0.1);
    needles(light, cw * 0.034, cw * 0.165, cw * 0.013, 0.3);
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
interface Mats {
  contact: Material; dark: Material; barkPine: Material; barkOak: Material; rock: Material; wood: Material; iron: Material; canvas: Material; banner: Material;
  oak: Material; autumn: Material; shrub: Material; spray: Material; grass: Material; dry: Material; frond: Material;
}
let MATS: Mats | null = null;

/** 带透明边的贴片材质:按透明度裁切,两面都画;画布开了多重采样时边缘用「透明度转覆盖率」抗锯齿。 */
function cutout(cv: Cv, rough: number): Material {
  const a2c = fieldSoftEdges();
  const m = new Material();
  m.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true, USE_VERTEX_COLOR: true, USE_ALPHA_TEST: true },
    states: { rasterizerState: { cullMode: gfx.CullMode.NONE }, blendState: { isA2C: a2c } } });
  m.setProperty('alphaThreshold', a2c ? 0.14 : 0.42);
  CUTS.push({ m, soft: 0.14, hard: 0.42 });
  m.setProperty('mainTexture', alphaTex(cv));
  m.setProperty('roughness', rough);
  m.setProperty('metallic', 0);
  m.setProperty('specularIntensity', 0.25);
  return m;
}

/**
 * 整套贴图(颜色 + 法线 + 遮蔽 / 粗糙 / 金属)的材质:粗糙度、金属度都由贴图说了算,顶点色再乘在颜色上(管明暗层次)。
 * twoSided = 布这种两面都看得见的(背面的法线翻过来受光)。
 */
function full(t: Pbr, scale: V3, normalK = 1, twoSided = false): Material {
  const m = new Material();
  const defines: Record<string, boolean> = { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: true };
  if (twoSided) {
    defines.USE_TWOSIDE = true;
    m.initialize({ effectName: 'builtin-standard', defines, states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
  } else {
    m.initialize({ effectName: 'builtin-standard', defines });
  }
  m.setProperty('mainTexture', tex(t.albedo, true, 8));
  m.setProperty('normalMap', tex(t.normal, true, 8));
  m.setProperty('pbrMap', tex(t.orm, true, 4));
  m.setProperty('occlusion', 1);
  m.setProperty('roughness', 1);
  m.setProperty('metallic', 1);
  m.setProperty('normalStrength', normalK);
  m.setProperty('albedoScale', new Vec3(scale[0], scale[1], scale[2]));
  m.setProperty('specularIntensity', 0.5);
  return m;
}

function mats(): Mats {
  if (MATS) {
    return MATS;
  }
  edgeSoft = fieldSoftEdges();      // 下面新建的贴片材质就是按现在的状态建的
  // 脚下接地的暗斑:不受光,柔边黑斑按透明度压在地面上
  const contact = new Material();
  contact.initialize({ effectName: 'builtin-unlit', technique: 1, defines: { USE_TEXTURE: true } });
  contact.setProperty('mainTexture', tex(contactBlob(128), false, 1));
  contact.setProperty('mainColor', new Color(8, 10, 14, 150));
  // 门洞 / 箱缝里的「黑」
  const dark = new Material();
  dark.initialize({ effectName: 'builtin-unlit' });
  dark.setProperty('mainColor', new Color(7, 6, 6, 255));
  MATS = {
    contact,
    dark,
    barkPine: full(barkPbr(512, true), [1.0, 0.96, 0.92], 1.3),
    barkOak: full(barkPbr(512, false), [1.0, 0.98, 0.94], 1.3),
    rock: full(rockPbr(512), [0.84, 0.85, 0.88], 1.5),
    wood: full(woodPbr(512), [1.28, 1.12, 0.94], 1.2),
    iron: full(ironPbr(256), [1, 1, 1], 1),
    canvas: full(canvasPbr(512), [1.34, 1.28, 1.16], 1, true),
    banner: cutout(paintBanner(256, 512), 0.9),
    oak: cutout(paintLeafAtlas(1024, OAK, 11), 0.72),
    autumn: cutout(paintLeafAtlas(1024, AUTUMN, 12, 1.2), 0.72),
    shrub: cutout(paintLeafAtlas(512, SHRUB, 13, 1.25), 0.78),
    spray: cutout(paintSprays(512, 256, 21), 0.8),
    grass: cutout(paintGrass(256, 31, false), 0.9),
    dry: cutout(paintGrass(256, 32, true), 0.9),
    frond: cutout(paintFrond(128, 512, 41), 0.85),
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
   * 一个三角形,法线 / 颜色逐角给(岩石:同一块面内平滑、硬棱保持硬)。贴图坐标按面法线 fn 的主方向做平面投影
   * (同 MeshBatch.poly:朝上的面投 x-z,朝左右的投 z-y,朝前后的投 x-y),切线跟着投影的 u 方向走。
   * 顶点按「从外面看逆时针」给。
   */
  tri(a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3, fn: Vec3, ta: Tint, tb: Tint, tc: Tint, den: number, ou: number, ov: number): void {
    if (this.count() + 3 > 60000) {
      this.cut();
    }
    const ax = Math.abs(fn.x);
    const ay = Math.abs(fn.y);
    const az = Math.abs(fn.z);
    let ua: 'x' | 'z';
    let va: 'y' | 'z';
    if (ay >= ax && ay >= az) {
      ua = 'x';
      va = 'z';
    } else if (ax >= az) {
      ua = 'z';
      va = 'y';
    } else {
      ua = 'x';
      va = 'y';
    }
    const base = this.count();
    const P = [a, b, c];
    const N = [na, nb, nc];
    const T = [ta, tb, tc];
    for (let i = 0; i < 3; i += 1) {
      const p = P[i];
      const n = N[i];
      let tx = ua === 'x' ? 1 : 0;
      let ty = 0;
      let tz = ua === 'z' ? 1 : 0;
      const d = tx * n.x + ty * n.y + tz * n.z;
      tx -= n.x * d;
      ty -= n.y * d;
      tz -= n.z * d;
      const len = Math.hypot(tx, ty, tz) || 1;
      tx /= len;
      ty /= len;
      tz /= len;
      // 副切线(贴图 v 的方向)相对 cross(法线, 切线) 的朝向
      const cyv = n.z * tx - n.x * tz;
      const czv = n.x * ty - n.y * tx;
      const w = (va === 'y' ? cyv : czv) < 0 ? -1 : 1;
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      this.tangents.push(tx, ty, tz, w);
      this.uvs.push(p[ua] * den + ou, p[va] * den + ov);
      this.colors.push(T[i][0], T[i][1], T[i][2], 1);
    }
    this.indices.push(base, base + 1, base + 2);
    this.triangles += 1;
  }

  /**
   * 一根方料(木板 / 梁 / 框条 / 铁皮):尺寸 sx × sy × sz,木纹顺着自己的 y 方向(贴图坐标按方料自己的坐标算,
   * 不管它在世界里怎么放 —— 放倒的横梁木纹也是顺着长度的);m = 摆到哪、怎么转。
   * 12 条棱都倒角(bevel),倒角面平直着色,掠射光下每条棱亮一线。off = 贴图上的随机偏移(每根料纹理不一样)。
   */
  beam(sx: number, sy: number, sz: number, m: Mat4, tint: Tint, den: number, bevel: number, off: number): void {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const bv = Math.min(bevel, hx * 0.45, hy * 0.45, hz * 0.45);
    const o = Vec3.transformMat4(new Vec3(), new Vec3(0, 0, 0), m);
    const face = (pts: V3[], n: V3): void => {
      const ax = Math.abs(n[0]);
      const ay = Math.abs(n[1]);
      const az = Math.abs(n[2]);
      const uv: Array<[number, number]> = pts.map((q) => (ay >= ax && ay >= az ? [q[0] * den + off, q[2] * den + off] : ax >= az ? [q[2] * den + off, q[1] * den + off * 1.7] : [q[0] * den + off, q[1] * den + off * 1.7]));
      const w = pts.map((q) => Vec3.transformMat4(new Vec3(), new Vec3(q[0], q[1], q[2]), m));
      const out = Vec3.transformMat4(new Vec3(), new Vec3(n[0], n[1], n[2]), m).subtract(o);
      const e1 = Vec3.subtract(new Vec3(), w[1], w[0]);
      const e2 = Vec3.subtract(new Vec3(), w[2], w[0]);
      if (Vec3.dot(Vec3.cross(new Vec3(), e1, e2), out) < 0) {
        w.reverse();
        uv.reverse();
      }
      this.facet(w, uv, tint);
    };
    const px = (a: number, b: number, c: number): V3 => [a * hx, b * (hy - bv), c * (hz - bv)];
    const py = (a: number, b: number, c: number): V3 => [a * (hx - bv), b * hy, c * (hz - bv)];
    const pz = (a: number, b: number, c: number): V3 => [a * (hx - bv), b * (hy - bv), c * hz];
    const S = [-1, 1];
    for (const a of S) {
      face([px(a, -1, -1), px(a, 1, -1), px(a, 1, 1), px(a, -1, 1)], [a, 0, 0]);
      face([py(-1, a, -1), py(1, a, -1), py(1, a, 1), py(-1, a, 1)], [0, a, 0]);
      face([pz(-1, -1, a), pz(1, -1, a), pz(1, 1, a), pz(-1, 1, a)], [0, 0, a]);
    }
    if (bv <= 0.0005) {
      return;
    }
    for (const a of S) {
      for (const b of S) {
        face([px(a, b, -1), px(a, b, 1), py(a, b, 1), py(a, b, -1)], [a, b, 0]);
        face([px(a, -1, b), px(a, 1, b), pz(a, 1, b), pz(a, -1, b)], [a, 0, b]);
        face([py(-1, a, b), py(1, a, b), pz(1, a, b), pz(-1, a, b)], [0, a, b]);
        for (const c of S) {
          face([px(a, b, c), py(a, b, c), pz(a, b, c)], [a, b, c]);
        }
      }
    }
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
/**
 * 松树(第二版):标准尺寸宽 = 1,高 = hr × 0.9。
 * 树干(鳞片状的树皮)+ 一轮轮往外伸、越往下越垂的枝;每根枝上左右交替长着一撮撮带针叶的小枝(每撮一片小贴片),
 * 枝梢再顶一撮。小枝之间有缝,看得见里面暗的枝干 —— 不是一整片。越靠树干越暗、越往梢上越亮,下面几轮比上面暗。
 */
function buildPine(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const bark = new Leafy();
  const leaves = new Leafy();
  const shade = new Leafy();
  const H = hr * 0.9;
  const lean = (rnd() - 0.5) * 0.06;
  const ph = rnd() * TAU;
  const axis = (t: number, out: Vec3): Vec3 => out.set(Math.sin(t * 2.2 + ph) * 0.02 + lean * t, H * t, Math.cos(t * 1.7 + ph) * 0.015);
  const path: Vec3[] = [];
  for (let i = 0; i <= 12; i += 1) {
    path.push(axis(i / 12, new Vec3()));
  }
  path[0].y = -0.03;
  bark.tube(path, (t) => 0.033 * (1 - 0.9 * t) + 0.03 * Math.exp(-t * 20), 8, { den: 2.6, tint: (u, v) => {
    const k = 0.66 + 0.34 * Math.min(1, v * 3);
    return [k, k * 0.96, k * 0.92];
  } });
  addContact(shade, 0, 0, 0.2, 0.17, 1);
  const c = new Vec3();
  const d = new Vec3();
  const r2 = new Vec3();
  const u2 = new Vec3();
  const cc = new Vec3();
  /** 一撮针叶小枝:从 p 出发,朝水平方向 (dx, dz)、往下垂 pitch(弧度,负数 = 往下),长 len。 */
  const spray = (p: Vec3, dx: number, dz: number, pitch: number, len: number, k0: number, k1: number): void => {
    const cp = Math.cos(pitch);
    d.set(dx * cp, Math.sin(pitch), dz * cp);
    const half = len * 0.5;
    cc.set(p.x + d.x * half, p.y + d.y * half, p.z + d.z * half);
    u2.set(d.x * half, d.y * half, d.z * half);
    // 宽度方向:水平面里垂直于伸出去的方向,再随机歪一点
    const roll = (rnd() - 0.5) * 0.7;
    const wx = -dz;
    const wz = dx;
    const wid = len * 0.36;
    r2.set(wx * wid * Math.cos(roll), wid * Math.sin(roll), wz * wid * Math.cos(roll));
    const n = norm(dx * 0.3, 0.92, dz * 0.3 + 0.1);
    const cell = Math.floor(rnd() * 4);
    const hue = 0.96 + rnd() * 0.08;
    const lo: Tint = [k0 * hue, k0, k0 * 0.98];
    const hi: Tint = [k1 * hue, k1, k1 * 0.98];
    leaves.card(cc, r2, u2, [cell * 0.25 + 0.004, 0.004, cell * 0.25 + 0.246, 0.996], [n, n, n, n], [lo, lo, hi, hi]);
  };
  const P = new Vec3();
  /** 一根枝:从树干 t 处朝方位 az 伸出去 L,越往外越垂(droop);shade = 这一轮整体的明暗;tube = 画不画枝干。 */
  const bough = (t: number, az: number, L: number, droop: number, shadeK: number, tube: boolean): void => {
    axis(t, c);
    const ox = Math.cos(az);
    const oz = Math.sin(az);
    const at = (s: number, out: Vec3): Vec3 => out.set(c.x + ox * L * s, Math.max(0.14, c.y - droop * L * s * s + 0.05 * L * Math.sin(s * 3.1)), c.z + oz * L * s);
    if (tube) {
      bark.tube([at(0, new Vec3()), at(0.45, new Vec3()), at(0.95, new Vec3())], (tt) => 0.0075 * (1 - 0.75 * tt), 3, { den: 3, tint: [0.42, 0.36, 0.32] });
    }
    const n = Math.max(3, Math.round(L / 0.058));
    for (let k = 0; k <= n; k += 1) {
      const s = 0.14 + 0.86 * (k / n);
      at(s, P);
      const last = k === n;
      const side = last ? 0 : k % 2 ? 1 : -1;
      const turn = side * (0.6 + rnd() * 0.35) + (rnd() - 0.5) * 0.2;
      const dx = ox * Math.cos(turn) - oz * Math.sin(turn);
      const dz = oz * Math.cos(turn) + ox * Math.sin(turn);
      const len = (0.1 + rnd() * 0.05) * (last ? 1.15 : 1);
      const pitch = -(0.12 + droop * 1.5 * s + rnd() * 0.22);
      // 靠树干的暗、梢上的亮
      const k0 = shadeK * (0.3 + 0.45 * s) * (0.9 + rnd() * 0.2);
      const k1 = shadeK * (0.6 + 0.5 * s) * (0.9 + rnd() * 0.2);
      spray(P, dx, dz, pitch, len, k0, Math.min(1, k1));
    }
  };
  const whorls = 13;
  for (let w = 0; w < whorls; w += 1) {
    const f = w / (whorls - 1);
    const t = 0.2 + 0.74 * Math.pow(f, 0.95);
    const L = (0.45 * Math.pow(1 - f, 1.05) + 0.05) * (0.93 + rnd() * 0.14);
    const nb = f < 0.35 ? 7 : f < 0.7 ? 6 : 5;
    const off = rnd() * TAU;
    const shadeK = 0.66 + 0.34 * f;
    const droop = 0.33 - 0.17 * f;
    for (let i = 0; i < nb; i += 1) {
      bough(t + (rnd() - 0.5) * 0.012, off + (i / nb) * TAU + (rnd() - 0.5) * 0.3, L * (0.84 + rnd() * 0.3), droop + rnd() * 0.08, shadeK, f < 0.62);
    }
    if (w < whorls - 1) {
      // 两轮之间插一圈短枝,把树干挡一挡(又不至于挡死)
      for (let i = 0; i < nb - 2; i += 1) {
        bough(t + 0.42 / whorls, off + ((i + 0.5) / (nb - 2)) * TAU + (rnd() - 0.5) * 0.5, L * (0.42 + rnd() * 0.2), droop * 0.8, shadeK * 0.82, false);
      }
    }
  }
  // 树梢:几撮往上翘的
  axis(0.96, c);
  for (let i = 0; i < 5; i += 1) {
    const az = (i / 5) * TAU + rnd();
    spray(c, Math.cos(az), Math.sin(az), 0.9 + rnd() * 0.4, 0.1 + rnd() * 0.03, 0.8, 1);
  }
  spray(c, 0, 1, 1.45, 0.12, 0.85, 1);
  return partsOf([{ batch: shade, mat: M.contact, cast: false }, { batch: bark, mat: M.barkPine, cast: true }, { batch: leaves, mat: M.spray, cast: true }]);
}

/**
 * 一团叶簇:团心 c、半径 r,里面 n 片小贴片(每片是叶簇图集里的一格)。
 * 贴片朝镜头和「团心往外」之间的方向摆(带一点乱);法线从团心往外再往上偏 —— 整团像一个有体积的球一样受光;
 * 团底暗、团顶亮,树冠(crown 为中心、Rc 为半径)里层和下层再暗一点。tone = 这一团自己的色调(红、绿、明暗的倍数)。
 */
function addPuff(leaves: Leafy, rnd: () => number, c0: Vec3, r: number, n: number, sizeLo: number, sizeHi: number, crown: Vec3, Rc: number, tone: [number, number, number]): void {
  const right = new Vec3();
  const up = new Vec3();
  const face = new Vec3();
  for (let j = 0; j < n; j += 1) {
    const a = rnd() * TAU;
    const y = rnd() * 1.5 - 0.5;
    const h = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y)));
    const dir = v3(Math.cos(a) * h, Math.min(1, y), Math.sin(a) * h);
    const rr = r * (0.35 + 0.65 * rnd());
    const c = v3(c0.x + dir.x * rr, c0.y + dir.y * rr * 0.85, c0.z + dir.z * rr);
    const size = sizeLo + rnd() * (sizeHi - sizeLo);
    face.set(TO_CAM.x * 0.55 + dir.x * 0.6 + (rnd() - 0.5) * 0.5, TO_CAM.y * 0.55 + dir.y * 0.6 + (rnd() - 0.5) * 0.4, TO_CAM.z * 0.55 + dir.z * 0.6 + (rnd() - 0.5) * 0.5).normalize();
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
    const cell = Math.floor(rnd() * 4);
    const u0 = (cell % 2) * 0.5;
    const v0 = Math.floor(cell / 2) * 0.5;
    const out = Math.min(1, Math.hypot(c.x - crown.x, (c.y - crown.y) * 1.2, c.z - crown.z) / Rc);
    const ao = (0.46 + 0.54 * smooth(-0.6, 0.7, dir.y)) * (0.68 + 0.32 * smooth(0.2, 0.95, out)) * (0.8 + 0.2 * smooth(crown.y - 0.3 * Rc * 2, crown.y + 0.25 * Rc * 2, c.y));
    const k = Math.min(1, ao * tone[2] * (0.9 + rnd() * 0.2));
    const tint: Tint = [Math.min(1, k * tone[0] * (0.95 + rnd() * 0.1)), Math.min(1, k * tone[1]), k * (0.9 + rnd() * 0.12)];
    const ns: Vec3[] = [];
    for (const corner of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = c.x + r2.x * corner[0] + u2.x * corner[1];
      const py = c.y + r2.y * corner[0] + u2.y * corner[1];
      const pz = c.z + r2.z * corner[0] + u2.z * corner[1];
      ns.push(norm(((px - c0.x) / r) * 0.7 + ((px - crown.x) / Rc) * 0.3, ((py - c0.y) / r) * 0.7 + 0.55, ((pz - c0.z) / r) * 0.7 + ((pz - crown.z) / Rc) * 0.3));
    }
    leaves.card(c, r2, u2, [u0 + 0.004, v0 + 0.004, u0 + 0.496, v0 + 0.496], ns, [tint, tint, tint, tint]);
  }
}

// ───────────────────────── 阔叶树(橡树 / 秋树 / 枯树)─────────────────────────
/**
 * 阔叶树(第二版):标准尺寸宽 = 1。粗树干(根部鼓出几条板根)在 0.42 高处分出几根大枝,大枝再各分两根小枝;
 * 叶子不是填满一个球,而是长在枝头的一团团叶簇(每团十来片小贴片,团与团之间有缝,看得见枝干和后面的东西)。
 * 每团的法线从团心往外(整团像一个有体积的球一样受光),团底、树冠里层压暗。leafMat = null 是枯树,只有枝杈。
 */
function buildBroadleaf(hr: number, seed: number, leafMat: Material | null, sparse: number, thick = 1): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const bark = new Leafy();
  const leaves = new Leafy();
  const shade = new Leafy();
  const bare = !leafMat;
  const Ht = 0.4 + rnd() * 0.05;
  const Hc = hr * 0.58;
  const ph = rnd() * TAU;
  const sway = (t: number): [number, number] => [Math.sin(t * 2.4 + ph) * 0.035 * t, Math.cos(t * 2.0 + ph) * 0.025 * t];
  const barkTint = (lo: number, hi: number) => (u: number, v: number): Tint => {
    const k = lo + (hi - lo) * v;
    return bare ? [0.9 * k, 0.88 * k, 0.86 * k] : [k, k * 0.97, k * 0.92];
  };
  // 树干:截面半径随高度收细,根部按角度鼓出 5 条板根
  const rootPh = rnd() * TAU;
  bark.surf(14, 10, (u, v, out) => {
    const th = u * TAU;
    const flare = Math.exp(-v * 6.2);
    const lobe = 0.5 + 0.5 * Math.cos(th * 5 + rootPh + Math.sin(th * 2) * 0.6);
    const r = (0.056 * (1 - 0.24 * v) + 0.085 * flare * (0.22 + 0.78 * lobe * lobe)) * thick + 0.005 * Math.sin(th * 7 + v * 17);
    const s = sway(v);
    out.set(s[0] + Math.cos(th) * r, Ht * v - 0.03 * (1 - v), s[1] + Math.sin(th) * r);
  }, { closeU: true, den: 2.6, tint: barkTint(0.58, 0.94) });
  addContact(shade, 0, 0.01, 0.3, 0.25, 1);
  const s1 = sway(1);
  const top = v3(s1[0], Ht - 0.01, s1[1]);
  const puffs: Array<{ c: Vec3; r: number }> = [];
  const dirOf = (az: number, el: number): Vec3 => v3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const limbs = 7;
  const off = rnd() * TAU;
  for (let i = 0; i < limbs; i += 1) {
    const centre = i === 0;
    const az = off + (i / (limbs - 1)) * TAU + (rnd() - 0.5) * 0.4;
    const el = centre ? 1.4 : 0.3 + rnd() * 0.45;
    const len = centre ? 0.4 + rnd() * 0.05 : 0.3 + rnd() * 0.1;
    const d1 = dirOf(az, el);
    const end = v3(top.x + d1.x * len, top.y + d1.y * len, top.z + d1.z * len);
    const mid = v3(top.x + d1.x * len * 0.5 + (rnd() - 0.5) * 0.04, top.y + d1.y * len * 0.5 + 0.035, top.z + d1.z * len * 0.5 + (rnd() - 0.5) * 0.04);
    bark.tube([top, mid, end], (t) => 0.036 * Math.sqrt(thick) * (1 - 0.6 * t), 7, { den: 2.6, tint: barkTint(0.7, 0.95) });
    const kids = bare ? 3 : 2;
    for (let k = 0; k < kids; k += 1) {
      const az2 = az + (k - (kids - 1) / 2) * (0.9 + rnd() * 0.5) + (rnd() - 0.5) * 0.3;
      const el2 = centre ? 0.5 + rnd() * 0.6 : Math.max(0.05, el - 0.3 + rnd() * 0.5);
      const len2 = 0.18 + rnd() * 0.09;
      const d2 = dirOf(az2, el2);
      const end2 = v3(end.x + d2.x * len2, end.y + d2.y * len2, end.z + d2.z * len2);
      if (leafMat) {
        // 朝镜头这边又低的枝头往上抬(见下面叶团那段的说明),枝跟着弯上去
        end2.y = Math.max(end2.y, end2.z + 0.58);
      }
      bark.tube([end, v3((end.x + end2.x) / 2, (end.y + end2.y) / 2 + 0.025, (end.z + end2.z) / 2), end2], (t) => 0.016 * (1 - 0.6 * t), 5, { den: 3, tint: barkTint(0.72, 0.9) });
      puffs.push({ c: end2, r: 0.115 + rnd() * 0.04 });
      if (bare) {
        // 枯树:再分一层细枝
        for (let q = 0; q < 3; q += 1) {
          const d3 = dirOf(az2 + (rnd() - 0.5) * 1.6, 0.2 + rnd() * 0.9);
          const l3 = 0.07 + rnd() * 0.07;
          bark.tube([end2, v3(end2.x + d3.x * l3 * 0.5, end2.y + d3.y * l3 * 0.5 + 0.01, end2.z + d3.z * l3 * 0.5), v3(end2.x + d3.x * l3, end2.y + d3.y * l3, end2.z + d3.z * l3)],
            (t) => 0.006 * (1 - 0.7 * t), 4, { den: 3, tint: [0.62, 0.6, 0.58] });
        }
      }
    }
    puffs.push({ c: v3(end.x, end.y + 0.05, end.z), r: 0.125 + rnd() * 0.04 });
  }
  if (leafMat) {
    // 树冠正中和顶上再补几团(只靠枝头的话中间是空的)
    for (let i = 0; i < 6; i += 1) {
      const a = rnd() * TAU;
      const rr = 0.06 + rnd() * 0.3;
      puffs.push({ c: v3(Math.cos(a) * rr, Hc - 0.08 + rnd() * 0.36 * (1 - rr), Math.sin(a) * rr), r: 0.12 + rnd() * 0.04 });
    }
    // 镜头在 +z 一侧斜着往下看:朝镜头这边又长得低的叶团会正好盖住树干。把这种叶团往上抬,树干才露得出来(手绘的树也是这么画的)
    for (const p of puffs) {
      const need = p.c.z + 0.5 + p.r * 0.6;
      if (p.c.y < need) {
        p.c.y = need;
      }
    }
    const crown = v3(0, Hc, 0);
    for (const p of puffs) {
      // 每团自己的色调(有的偏黄、有的偏暗),整棵树才不是一个颜色
      addPuff(leaves, rnd, p.c, p.r, Math.max(5, Math.round(9 * sparse)), 0.095, 0.125, crown, 0.5, [0.9 + rnd() * 0.2, 0.92 + rnd() * 0.14, 0.92 + rnd() * 0.2]);
    }
  }
  const list: Array<{ batch: Sculpt; mat: Material; cast: boolean }> = [{ batch: shade, mat: M.contact, cast: false }, { batch: bark, mat: M.barkOak, cast: true }];
  if (leafMat) {
    list.push({ batch: leaves, mat: leafMat, cast: true });
  }
  return partsOf(list);
}

// ───────────────────────── 岩石 ─────────────────────────
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V: V3[] = [[-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0], [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T], [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1]];
const ICO_F: V3[] = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
const icoCache = new Map<number, { verts: Vec3[]; faces: V3[] }>();

/** 细分过的二十面体(单位球上的点 + 三角形)。 */
function icosphere(level: number): { verts: Vec3[]; faces: V3[] } {
  const hit = icoCache.get(level);
  if (hit) {
    return hit;
  }
  const verts = ICO_V.map((p) => norm(p[0], p[1], p[2]));
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
  }
  const out = { verts, faces };
  icoCache.set(level, out);
  return out;
}

/**
 * 一块石头(2026-11-16 第二版,用户「要 3A 级别的效果」):
 * - 形状:细分的球按几层噪声推拉出大起伏,再被十来个随机的平面「劈」掉外面的部分 —— 劈出来的是平的断面和硬的棱,
 *   没被劈到的地方保留圆润的风化面;底下削平埋进土里。
 * - 法线:同一块面内平滑,夹角大的棱保持硬边(按夹角分组求平均),所以既有干净的断面又不是一粒粒的小平面。
 * - 明暗:凹进去的地方(比周围低)压暗,贴地的一圈压暗;朝上的面按噪声长苔(往绿里染)。
 * - 贴图坐标按面的朝向做平面投影(三个方向各投各的),配岩石那套颜色 / 法线 / 粗糙度贴图。
 */
function addRock(b: Leafy, r: number, at: Vec3, squash: number, level: number, rnd: () => number, moss: number, den = 0.7): void {
  const ico = icosphere(level);
  const seed = Math.floor(rnd() * 9973);
  const cuts: Array<{ n: Vec3; d: number }> = [];
  const nc = 8 + Math.floor(rnd() * 5);
  for (let i = 0; i < nc; i += 1) {
    cuts.push({ n: norm(rnd() - 0.5, (rnd() - 0.3) * 0.9, rnd() - 0.5), d: 0.6 + rnd() * 0.3 });
  }
  // 顶上再劈一两刀接近水平的:岩块有平的顶面(手绘的岩石是一块块方的断块,不是圆疙瘩)
  cuts.push({ n: norm((rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5), d: 0.5 + rnd() * 0.16 });
  cuts.push({ n: norm((rnd() - 0.5) * 0.9, 0.8, (rnd() - 0.5) * 0.9), d: 0.56 + rnd() * 0.2 });
  const blocky = 0.68 + rnd() * 0.22;
  const sx = 0.82 + rnd() * 0.42;
  const sz = 0.82 + rnd() * 0.42;
  const yaw = rnd() * TAU;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const tilt = (rnd() - 0.5) * 0.5;
  const n = ico.verts.length;
  const P: Vec3[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = ico.verts[i];
    let k = 0.96 + 0.34 * (fbm3(v.x * 1.5 + 7, v.y * 1.5, v.z * 1.5, 3, seed) - 0.5) + 0.12 * (fbm3(v.x * 4.2, v.y * 4.2 + 3, v.z * 4.2, 2, seed + 5) - 0.5);
    // 先从圆球往方块上靠(方块 = 把方向投到立方体的面上),岩块才是方头方脑的
    const cube = 0.82 / Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
    const kb = k * (1 - blocky + blocky * cube);
    let x = v.x * kb;
    let y = v.y * kb;
    let z = v.z * kb;
    // 劈:落在平面外侧的点压回平面上
    for (const c of cuts) {
      const proj = x * c.n.x + y * c.n.y + z * c.n.z;
      if (proj > c.d) {
        const over = proj - c.d;
        x -= c.n.x * over;
        y -= c.n.y * over;
        z -= c.n.z * over;
      }
    }
    // 断面上再留一点细碎的起伏(不是镜面一样平)
    k = 1 + 0.035 * (fbm3(v.x * 11, v.y * 11, v.z * 11, 2, seed + 9) - 0.5);
    x *= k * sx;
    y = y * k * squash + x * tilt * 0.3;
    z *= k * sz;
    const rx = x * cy - z * sy;
    z = x * sy + z * cy;
    x = rx;
    y = Math.max(-0.2, y);
    P[i] = v3(at.x + x * r, at.y + (y + 0.18) * r, at.z + z * r);
  }
  // 面法线、面积;每个顶点连着哪些面
  const F = ico.faces;
  const FN: Vec3[] = new Array(F.length);
  const FA: number[] = new Array(F.length);
  const link: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    link.push([]);
  }
  const e1 = new Vec3();
  const e2 = new Vec3();
  for (let f = 0; f < F.length; f += 1) {
    const a = P[F[f][0]];
    const bb = P[F[f][1]];
    const c = P[F[f][2]];
    Vec3.subtract(e1, bb, a);
    Vec3.subtract(e2, c, a);
    const nn = Vec3.cross(new Vec3(), e1, e2);
    const len = nn.length();
    FA[f] = len;
    if (len > 1e-12) {
      nn.multiplyScalar(1 / len);
    } else {
      nn.set(0, 1, 0);
    }
    FN[f] = nn;
    link[F[f][0]].push(f);
    link[F[f][1]].push(f);
    link[F[f][2]].push(f);
  }
  // 二十面体的面绕序朝外;压扁 / 劈过之后个别面可能翻了,统一按「离中心往外」校一遍
  const centre = v3(at.x, at.y + 0.18 * r, at.z);
  const flip: boolean[] = new Array(F.length);
  for (let f = 0; f < F.length; f += 1) {
    const a = P[F[f][0]];
    flip[f] = FN[f].x * (a.x - centre.x) + FN[f].y * (a.y - centre.y) + FN[f].z * (a.z - centre.z) < 0;
    if (flip[f]) {
      FN[f].multiplyScalar(-1);
    }
  }
  // 顶点的整体法线和凹凸:比相邻点的平均位置低 = 凹
  const VN: Vec3[] = new Array(n);
  const cav: number[] = new Array(n);
  const nb: Array<Set<number>> = [];
  for (let i = 0; i < n; i += 1) {
    nb.push(new Set<number>());
  }
  for (const f of F) {
    nb[f[0]].add(f[1]).add(f[2]);
    nb[f[1]].add(f[0]).add(f[2]);
    nb[f[2]].add(f[0]).add(f[1]);
  }
  for (let i = 0; i < n; i += 1) {
    const vn = new Vec3();
    for (const f of link[i]) {
      vn.x += FN[f].x * FA[f];
      vn.y += FN[f].y * FA[f];
      vn.z += FN[f].z * FA[f];
    }
    vn.normalize();
    VN[i] = vn;
    let mx = 0;
    let my = 0;
    let mz = 0;
    nb[i].forEach((j) => {
      mx += P[j].x;
      my += P[j].y;
      mz += P[j].z;
    });
    const cnt = Math.max(1, nb[i].size);
    cav[i] = ((mx / cnt - P[i].x) * vn.x + (my / cnt - P[i].y) * vn.y + (mz / cnt - P[i].z) * vn.z) / r;
  }
  const crease = Math.cos((34 * Math.PI) / 180);
  const ou = rnd() * 9;
  const ov = rnd() * 9;
  const tone = 0.86 + rnd() * 0.16;
  const hue = rnd();
  const cn: Vec3[] = [new Vec3(), new Vec3(), new Vec3()];
  const ct: Tint[] = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
  for (let f = 0; f < F.length; f += 1) {
    const idx = flip[f] ? [F[f][0], F[f][2], F[f][1]] : [F[f][0], F[f][1], F[f][2]];
    for (let k = 0; k < 3; k += 1) {
      const vi = idx[k];
      // 这个角的法线:只和夹角小的相邻面平均(硬棱保持硬)
      const nn = cn[k].set(0, 0, 0);
      for (const g of link[vi]) {
        if (Vec3.dot(FN[g], FN[f]) > crease) {
          nn.x += FN[g].x * FA[g];
          nn.y += FN[g].y * FA[g];
          nn.z += FN[g].z * FA[g];
        }
      }
      if (nn.lengthSqr() < 1e-12) {
        nn.set(FN[f]);
      } else {
        nn.normalize();
      }
      const p = P[vi];
      const ao = 1 - Math.min(0.62, Math.max(0, cav[vi]) * 8);
      // 贴地的一圈压暗;朝上的面晒得发白、侧面和朝下的面暗
      const ground = (0.42 + 0.58 * smooth(at.y, at.y + 0.4 * r, p.y)) * (0.7 + 0.4 * smooth(-0.2, 0.9, VN[vi].y));
      const mk = moss * smooth(0.55, 0.95, VN[vi].y) * smooth(0.42, 0.6, fbm3(p.x * 2.4 / r * 0.4 + hue * 9, p.y * 2.4, p.z * 2.4 / r * 0.4, 3, seed + 21));
      const k2 = tone * ao * ground;
      ct[k] = [lerp(0.9 + hue * 0.08, 0.42, mk) * k2, lerp(0.88, 0.5, mk) * k2, lerp(0.84 - hue * 0.06, 0.24, mk) * k2];
    }
    b.tri(P[idx[0]], P[idx[1]], P[idx[2]], cn[0], cn[1], cn[2], FN[f], ct[0], ct[1], ct[2], den / Math.max(0.25, r), ou, ov);
  }
}

/** 贴在脚下的一块柔边暗斑(摆件和地面接上的地方发暗,东西才像「坐」在地上)。 */
function addContact(b: Leafy, x: number, z: number, rx: number, rz: number, a = 1): void {
  const n = norm(0, 1, 0);
  b.card(v3(x, 0.012, z), v3(rx, 0, 0), v3(0, 0, -rz), [0, 0, 1, 1], [n, n, n, n], [[a, a, a], [a, a, a], [a, a, a], [a, a, a]]);
}

/** 石头脚边 / 石缝里长的几丛草(同一张草的贴图,小号)。 */
function addTufts(b: Leafy, rnd: () => number, spots: Array<[number, number, number]>): void {
  const up = norm(0, 1, 0.15);
  for (const s of spots) {
    const h = s[2];
    for (let i = 0; i < 2; i += 1) {
      const a = rnd() * Math.PI;
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      b.card(v3(s[0], h * 0.5, s[1]), v3(ox * h * 0.55, 0, oz * h * 0.55), v3(0, h * 0.5, 0), [0, 0, 1, 1], [up, up, up, up], [[0.6, 0.6, 0.58], [0.6, 0.6, 0.58], [1, 1, 1], [1, 1, 1]]);
    }
  }
}

/** 一堆石头(宽 = 1):大的压着小的,脚边有碎石和几丛草,底下一圈接地的暗影。 */
function buildRocks(hr: number, seed: number, style: 'pile' | 'boulder' | 'small' | 'scatter'): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const b = new Leafy();
  const grass = new Leafy();
  const shade = new Leafy();
  const tall = Math.min(1.0, 0.56 + hr * 0.24);
  const spots: Array<[number, number, number]> = [];
  // 一堆石头 = 一块主石 + 几块靠着它的中石 + 脚边的碎石:块和块之间的缝很深(真投影会把缝压黑),不是一整坨
  const chunk = (r: number, x: number, z: number, level: number, moss: number, sq = 0.76): void => {
    addRock(b, r * (0.92 + rnd() * 0.16), v3(x + (rnd() - 0.5) * 0.03, -r * 0.04 * rnd(), z + (rnd() - 0.5) * 0.03), sq * (0.9 + rnd() * 0.25), level, rnd, moss);
  };
  if (style === 'boulder') {
    chunk(0.33, -0.05, -0.08, 3, 0.95, 1.5);
    chunk(0.24, 0.27, 0.04, 3, 0.8, 1.15);
    chunk(0.2, -0.32, 0.08, 3, 0.7, 1.0);
    chunk(0.15, 0.04, 0.24, 2, 0.5, 0.85);
    chunk(0.11, 0.4, 0.26, 2, 0.3);
    chunk(0.08, -0.2, 0.34, 1, 0.2);
    chunk(0.05, 0.22, 0.4, 1, 0.1);
    chunk(0.045, -0.44, 0.3, 1, 0.1);
    addContact(shade, 0, 0.04, 0.66, 0.54);
    spots.push([-0.46, 0.22, 0.2], [0.48, 0.16, 0.17], [0.1, 0.44, 0.15], [0.3, -0.26, 0.2], [-0.3, 0.44, 0.13], [-0.1, -0.36, 0.18]);
  } else if (style === 'pile') {
    chunk(0.27, -0.13, -0.07, 3, 0.85, 1.4);
    chunk(0.23, 0.2, 0.0, 3, 0.75, 1.15);
    chunk(0.17, -0.34, 0.14, 2, 0.6, 0.95);
    chunk(0.13, 0.02, 0.24, 2, 0.4);
    chunk(0.09, 0.4, 0.2, 1, 0.2);
    chunk(0.06, -0.14, 0.36, 1, 0.1);
    chunk(0.045, 0.24, 0.36, 1, 0.1);
    addContact(shade, -0.02, 0.04, 0.62, 0.5);
    spots.push([-0.46, 0.24, 0.18], [0.44, 0.28, 0.16], [0.14, 0.4, 0.14], [-0.16, -0.32, 0.16], [0.34, -0.2, 0.15]);
  } else if (style === 'scatter') {
    // 一摊碎石:没有主石,十几颗大小不一的小石子散在地上(2D 的图是「撒在地上的一片」,立成一张牌就成了悬在半空的黑点)
    const n = 13 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i += 1) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * 0.46;
      const r = 0.022 + Math.pow(rnd(), 2.2) * 0.075;
      chunk(r, Math.cos(a) * d, Math.sin(a) * d * 0.72, r > 0.06 ? 2 : 1, 0.15, 0.62);
    }
    addContact(shade, 0, 0, 0.5, 0.38, 0.5);
  } else {
    chunk(0.24, -0.1, 0, 3, 0.6, 1.1);
    chunk(0.18, 0.2, 0.06, 2, 0.45, 0.9);
    chunk(0.11, -0.02, 0.22, 2, 0.2);
    chunk(0.07, 0.36, -0.06, 1, 0.2);
    chunk(0.05, -0.34, 0.14, 1, 0.1);
    addContact(shade, 0.02, 0.03, 0.54, 0.42, 0.85);
    spots.push([-0.38, 0.2, 0.16], [0.38, 0.2, 0.14], [0.06, -0.24, 0.13]);
  }
  addTufts(grass, rnd, spots);
  return partsOf([{ batch: shade, mat: M.contact, cast: false }, { batch: b, mat: M.rock, cast: true }, { batch: grass, mat: M.grass, cast: false }]);
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

/** 灌木(第二版):贴着地的一丛 —— 几根细枝撑着五六团小叶簇,矮而宽;脚下一圈接地的暗影。 */
function buildBush(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const leaves = new Leafy();
  const twigs = new Leafy();
  const shade = new Leafy();
  const Hh = Math.min(0.56, hr * 0.52);
  const crown = v3(0, Hh * 0.5, 0);
  const n = 6 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i += 1) {
    const centre = i === 0;
    const a = (i / (n - 1)) * TAU + rnd() * 0.6;
    const rr = centre ? 0 : 0.2 + rnd() * 0.1;
    const c = v3(Math.cos(a) * rr, Hh * (centre ? 0.72 : 0.38 + rnd() * 0.2), Math.sin(a) * rr);
    // 朝镜头这边的抬高一点,别糊成一片
    c.y = Math.max(c.y, c.z * 0.5 + 0.16);
    twigs.tube([v3(0, 0, 0), v3(c.x * 0.5, c.y * 0.6, c.z * 0.5), c], (t) => 0.014 * (1 - 0.6 * t), 4, { den: 4, tint: [0.5, 0.44, 0.36] });
    addPuff(leaves, rnd, c, 0.15 + rnd() * 0.04, 8, 0.085, 0.11, crown, 0.42, [0.92 + rnd() * 0.16, 0.94 + rnd() * 0.1, 0.9 + rnd() * 0.2]);
  }
  addContact(shade, 0, 0.02, 0.44, 0.36, 1);
  return partsOf([{ batch: shade, mat: M.contact, cast: false }, { batch: twigs, mat: M.barkOak, cast: false }, { batch: leaves, mat: M.shrub, cast: true }]);
}

// ───────────────────────── 营地 ─────────────────────────
/** 六边形截面(半径 r):削尖的桩头、螺栓头用。 */
function hexSection(r: number, turn = 0): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const a = turn + (i / 6) * TAU;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** 一根削尖的原木桩:去了皮的风化木头,木纹顺着长;桩头是用斧子砍出来的几个斜面(平直着色,受光面一块亮一块暗)。 */
function stake(wood: Leafy, x: number, z: number, r: number, h: number, rnd: () => number, k: number): void {
  const rot = v3((rnd() - 0.5) * 4, rnd() * 360, (rnd() - 0.5) * 4);
  const tint: Tint = [k, k * 0.97, k * 0.93];
  wood.cylinder(r * 0.92, r, h, 9, v3(x, h / 2, z), rot, tint, 1.6, rnd, 0, false);
  const tip = xform([x, h - 0.004, z], [rot.x, rot.y, rot.z]);
  const cut: Tint[] = [];
  for (let i = 0; i < 6; i += 1) {
    const c = k * (0.96 + rnd() * 0.22);
    cut.push([Math.min(1, c * 1.06), Math.min(1, c), c * 0.9]);
  }
  wood.prism(hexSection(r * 0.92, rnd()), 0, r * (1.5 + rnd() * 0.7), 0.16, cut, 1.6, tip, false);
}

/** 螺栓 / 铆钉头。 */
function bolt(iron: Leafy, x: number, y: number, z: number, r: number, face: 'z' | 'x' | 'y' = 'z'): void {
  const rot: [number, number, number] = face === 'z' ? [90, 0, 0] : face === 'x' ? [0, 0, 90] : [0, 0, 0];
  iron.prism(hexSection(r), -r * 0.5, r * 0.5, 0.8, [1, 1, 1], 6, xform([x, y, z], rot));
}

/**
 * 木栅栏(按真实尺寸建,沿左右方向一字排开,长 lengthM 米):一排粗细高矮都不一样的削尖原木(各自歪一点、前后错一点),
 * 朝镜头的一面钉两道横梁(梁上每根桩一颗螺栓),墙脚一条接地的暗影;中间一座方形岗楼(四根角柱、木板墙、
 * 顶上一圈横梁和四坡的木架)。
 * (2D 的图是斜着画的一段墙;碰撞框是横着的一条,3D 里按碰撞框的方向立。)
 */
function buildPalisade(hr: number, seed: number, lengthM: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const iron = new Leafy();
  const shade = new Leafy();
  const L = lengthM;
  const n = Math.round(L / 0.36);
  const towerAt = 0.12 * L;
  const tw = 1.2;
  for (let i = 0; i < n; i += 1) {
    const x = -L / 2 + (i + 0.5) * (L / n);
    if (Math.abs(x - towerAt) < tw / 2 + 0.04) {
      continue;
    }
    stake(wood, x + (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.12, 0.155 + rnd() * 0.04, 2.15 + rnd() * 0.6, rnd, 0.66 + rnd() * 0.34);
  }
  for (const y of [0.78, 1.72]) {
    for (const [x0, x1] of [[-L / 2 - 0.05, towerAt - tw / 2], [towerAt + tw / 2, L / 2 + 0.05]] as Array<[number, number]>) {
      // 横梁:木纹顺着梁的长度(梁按「竖着的木板」建好再放倒)
      wood.beam(0.17, x1 - x0, 0.1, xform([(x0 + x1) / 2, y + (rnd() - 0.5) * 0.02, 0.25], [0, 0, 90 + (rnd() - 0.5) * 1.2]), [0.7, 0.66, 0.6], 1.6, 0.014, rnd() * 5);
    }
    for (let i = 0; i < n; i += 1) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      if (Math.abs(x - towerAt) < tw / 2 + 0.04) {
        continue;
      }
      bolt(iron, x, y + (rnd() - 0.5) * 0.03, 0.31, 0.026);
    }
  }
  addContact(shade, 0, 0.12, L / 2 + 0.3, 0.55, 1);
  // 岗楼
  const th = 3.7;
  const hw = tw / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const k = 0.78 + rnd() * 0.16;
      wood.cylinder(0.085, 0.1, th, 8, v3(towerAt + sx * (hw - 0.09), th / 2, sz * (hw - 0.09)), v3(0, rnd() * 360, 0), [k, k * 0.97, k * 0.93], 1.6, rnd, 0, true);
    }
  }
  // 三面木板墙(背面被挡着看不见,不做):一块块竖板,板与板之间留缝
  const boards = 5;
  for (let i = 0; i < boards; i += 1) {
    const o = -hw + 0.2 + i * ((tw - 0.4) / (boards - 1));
    const bw = (tw - 0.4) / (boards - 1) - 0.014;
    const kf = 0.76 + rnd() * 0.22;
    wood.beam(bw, 2.3 + rnd() * 0.06, 0.035, xform([towerAt + o, 1.16, hw - 0.1], [0, 0, (rnd() - 0.5) * 1.2]), [kf, kf * 0.97, kf * 0.92], 1.6, 0.008, rnd() * 5);
    for (const sx of [-1, 1]) {
      const ks = 0.7 + rnd() * 0.2;
      wood.beam(0.035, 2.3 + rnd() * 0.06, bw, xform([towerAt + sx * (hw - 0.1), 1.16, o], [(rnd() - 0.5) * 1.2, 0, 0]), [ks, ks * 0.97, ks * 0.92], 1.6, 0.008, rnd() * 5);
    }
  }
  // 腰上、檐口各一圈横梁
  for (const y of [1.0, 2.38, th - 0.1]) {
    const thick = y > 3 ? 0.13 : 0.09;
    wood.beam(thick, tw + 0.16, thick, xform([towerAt, y, hw - 0.06], [0, 0, 90]), [0.62, 0.58, 0.52], 1.6, 0.012, rnd() * 5);
    wood.beam(thick, tw + 0.16, thick, xform([towerAt, y, -hw + 0.06], [0, 0, 90]), [0.58, 0.54, 0.48], 1.6, 0.012, rnd() * 5);
    for (const sx of [-1, 1]) {
      wood.beam(thick, tw + 0.16, thick, xform([towerAt + sx * (hw - 0.06), y, 0], [90, 0, 0]), [0.6, 0.56, 0.5], 1.6, 0.012, rnd() * 5);
    }
    for (const sx of [-1, 1]) {
      bolt(iron, towerAt + sx * (hw - 0.09), y, hw + 0.01, 0.026);
    }
  }
  // 四坡的木架:四根椽子从四角收到尖顶,顶上一截短柱
  const apex = th + 0.72;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const from = v3(towerAt + sx * hw, th, sz * hw);
      const to = v3(towerAt, apex, 0);
      wood.tube([from, to], 0.04, 6, { den: 1.6, tint: [0.64, 0.6, 0.54] });
    }
  }
  wood.cylinder(0.03, 0.045, 0.3, 6, v3(towerAt, apex + 0.08, 0), v3(0, 0, 0), [0.6, 0.56, 0.5], 1.6, rnd, undefined, true);
  void hr;
  return partsOf([{ batch: shade, mat: M.contact, cast: false }, { batch: wood, mat: M.wood, cast: true }, { batch: iron, mat: M.iron, cast: false }]);
}

/**
 * 一只板条箱(边长 s):里面一个暗的芯,外面每个面钉四块木板(板缝里露出暗芯),四边压框条,朝镜头的一面和顶面各一道斜撑;
 * 八个角包铁皮,铁皮上有铆钉。木板各自深浅不一、歪一点点。
 */
function crate(wood: Leafy, iron: Leafy, s: number, at: Vec3, yaw: number, rnd: () => number): void {
  const m = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mat4 => {
    const local = xform([x, y, z], [rx, ry, rz]);
    return Mat4.multiply(new Mat4(), xform([at.x, at.y + s / 2, at.z], [0, yaw, 0]), local);
  };
  const h = s / 2;
  wood.beam(s - 0.03, s - 0.03, s - 0.03, m(0, 0, 0), [0.16, 0.13, 0.1], 2, 0, 0);
  const pw = (s - 0.02) / 4;
  const t = s * 0.045;
  for (let i = 0; i < 4; i += 1) {
    const o = -h + pw / 2 + 0.01 + i * pw;
    for (const face of ['f', 'b', 'l', 'r', 't'] as const) {
      const k = 0.74 + rnd() * 0.24;
      const tint: Tint = [k, k * 0.96, k * 0.9];
      const jig = (rnd() - 0.5) * 0.8;
      if (face === 'f' || face === 'b') {
        wood.beam(pw - 0.008, s - 0.012, t, m(o, 0, (face === 'f' ? 1 : -1) * (h - t / 2 + 0.004), 0, 0, jig), tint, 2.4, 0.004, rnd() * 5);
      } else if (face === 'l' || face === 'r') {
        wood.beam(t, s - 0.012, pw - 0.008, m((face === 'r' ? 1 : -1) * (h - t / 2 + 0.004), 0, o, jig, 0, 0), tint, 2.4, 0.004, rnd() * 5);
      } else {
        wood.beam(pw - 0.008, s - 0.012, t, m(o, h - t / 2 + 0.004, 0, 90, 0, 0), tint, 2.4, 0.004, rnd() * 5);
      }
    }
  }
  // 框条:每个面四边各一根(比木板厚一点、颜色深一点)
  const fw = s * 0.12;
  const ft = t * 1.5;
  const frame: Tint = [0.62, 0.57, 0.5];
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      wood.beam(fw, s + 0.004, ft, m(sx * (h - fw / 2), 0, sz * (h + ft / 2 - 0.004)), frame, 2.4, 0.006, rnd() * 5);
      wood.beam(ft, s + 0.004, fw, m(sz * (h + ft / 2 - 0.004), 0, sx * (h - fw / 2)), frame, 2.4, 0.006, rnd() * 5);
    }
    for (const sy of [-1, 1]) {
      wood.beam(fw, s - fw * 2, ft, m(0, sy * (h - fw / 2), sz * (h + ft / 2 - 0.004), 0, 0, 90), frame, 2.4, 0.006, rnd() * 5);
      wood.beam(ft, s - fw * 2, fw, m(sz * (h + ft / 2 - 0.004), sy * (h - fw / 2), 0, 90, 0, 0), frame, 2.4, 0.006, rnd() * 5);
    }
  }
  for (const sx of [-1, 1]) {
    wood.beam(fw, s + 0.004, ft, m(sx * (h - fw / 2), h + ft / 2 - 0.004, 0, 90, 0, 0), frame, 2.4, 0.006, rnd() * 5);
    wood.beam(fw, s - fw * 2, ft, m(0, h + ft / 2 - 0.004, sx * (h - fw / 2), 90, 90, 0), frame, 2.4, 0.006, rnd() * 5);
  }
  // 斜撑
  const diag = Math.hypot(s - fw * 2, s - fw * 2) * 0.98;
  wood.beam(fw * 0.8, diag, ft * 0.9, m(0, 0, h + ft / 2, 0, 0, 45), frame, 2.4, 0.006, rnd() * 5);
  wood.beam(fw * 0.8, diag, ft * 0.9, m(0, h + ft / 2, 0, 90, 45, 0), frame, 2.4, 0.006, rnd() * 5);
  // 包角铁皮 + 铆钉
  const cw = fw * 1.1;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        iron.beam(cw, cw, cw, m(sx * (h + ft - cw / 2 + 0.003), sy * (h + ft * 0.5 - cw / 2 + 0.003), sz * (h + ft - cw / 2 + 0.003)), [1, 1, 1], 4, 0.004, rnd() * 5);
      }
    }
  }
}

/** 木桶:鼓肚子的桶身(一条条桶板之间有浅沟)、三道铁箍(箍上有铆钉)、凹进去的桶盖。 */
function barrel(wood: Leafy, iron: Leafy, r: number, h: number, at: Vec3, rnd: () => number): void {
  const staves = 14;
  const prof: Array<[number, number]> = [[r * 0.8, 0], [r * 0.93, h * 0.18], [r, h * 0.5], [r * 0.93, h * 0.82], [r * 0.8, h]];
  const tints: Tint[] = [];
  for (let i = 0; i < staves; i += 1) {
    const k = 0.7 + rnd() * 0.26;
    tints.push([k, k * 0.95, k * 0.88]);
  }
  wood.lathe(prof, staves * 3, { den: 2.6, tint: (u) => tints[Math.min(staves - 1, Math.floor(u * staves))],
    fold: (ang) => 1 - 0.022 * Math.pow(Math.abs(Math.cos((ang * staves) / 2)), 24), bend: (v, p) => {
      p.x += at.x;
      p.y += at.y;
      p.z += at.z;
    } });
  // 桶盖:比桶口低一点的一块圆板 + 桶口的一圈沿
  wood.cylinder(r * 0.76, r * 0.76, 0.012, 16, v3(at.x, at.y + h - 0.035, at.z), v3(0, rnd() * 360, 0), [0.7, 0.66, 0.58], 2.6, rnd, undefined, true);
  for (const [y, k] of [[h * 0.1, 0.875], [h * 0.36, 0.985], [h * 0.64, 0.985], [h * 0.9, 0.875]] as Array<[number, number]>) {
    const rr = r * k + 0.006;
    iron.cylinder(rr, rr, h * 0.055, 20, v3(at.x, at.y + y, at.z), v3(0, 0, 0), [1, 1, 1], 4, rnd, undefined, false);
    const a = 0.6 + rnd() * 0.5;
    bolt(iron, at.x + Math.cos(a) * (rr + 0.004), at.y + y, at.z + Math.sin(a) * (rr + 0.004), 0.012, 'z');
  }
}

/** 木箱堆(宽 = 1):一大一小两只板条箱 + 一只木桶,脚下一片接地的暗影。 */
function buildCrates(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const iron = new Leafy();
  const shade = new Leafy();
  crate(wood, iron, 0.46, v3(-0.2, 0, -0.08), 14, rnd);
  crate(wood, iron, 0.3, v3(0.04, 0, 0.24), -20, rnd);
  barrel(wood, iron, 0.165, 0.44, v3(0.31, 0, -0.06), rnd);
  addContact(shade, 0.02, 0.06, 0.62, 0.5, 1);
  void hr;
  return partsOf([{ batch: shade, mat: M.contact, cast: false }, { batch: wood, mat: M.wood, cast: true }, { batch: iron, mat: M.iron, cast: true }]);
}

/**
 * 旗(宽 = 1,很高):一根略弯的长杆(顶上一个铁矛头,杆上缠着几道绳),横杆上挂一面撕了边的红旗。
 * 杆和旗面分开:旗面是一张有褶的布(挂着的一头平、越往下越鼓),单独随风摆。
 */
function buildBanner(hr: number, seed: number): { pole: Variant; cloth: Variant; hang: Vec3 } {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const iron = new Leafy();
  const cloth = new Leafy();
  const shade = new Leafy();
  const H = hr * 0.93;
  const path: Vec3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    path.push(v3(Math.sin(t * 2.6) * 0.02, H * t - (i ? 0 : 0.05), 0));
  }
  wood.tube(path, (t) => 0.036 - 0.012 * t, 8, { den: 1.4, tint: (u, v) => {
    const k = 0.6 + 0.3 * Math.min(1, v * 4);
    return [k, k * 0.95, k * 0.88];
  } });
  const top = path[path.length - 1];
  iron.prism(hexSection(0.028), 0, 0.06, 0.9, [1, 1, 1], 4, xform([top.x, top.y, top.z]));
  iron.prism([[0.035, 0], [0, 0.012], [-0.035, 0], [0, -0.012]], 0, 0.3, 0.04, [1, 1, 1], 4, xform([top.x, top.y + 0.05, top.z]));
  const barY = H * 0.925;
  wood.cylinder(0.02, 0.02, 0.86, 7, v3(0.015, barY, 0.03), v3(0, 0, 90), [0.56, 0.5, 0.44], 1.4, rnd, undefined, true);
  // 缠在杆上的绳
  for (const y of [barY, barY - 0.05, H * 0.5, H * 0.52, H * 0.18]) {
    wood.cylinder(0.04, 0.04, 0.03, 8, v3(Math.sin((y / H) * 2.6) * 0.02, y, 0), v3(0, 0, 0), [0.78, 0.7, 0.52], 3, rnd, undefined, false);
  }
  addContact(shade, 0, 0.01, 0.2, 0.16, 1);
  // 旗面:宽 0.72,长 = 杆高的 0.38;横向几道竖褶,越往下褶越深
  const cw = 0.36;
  const cl = H * 0.38;
  cloth.surf(10, 14, (u, v, out) => {
    const x = (u - 0.5) * 2 * cw;
    const down = 1 - v;
    const fold = Math.sin(u * Math.PI * 5 + 0.6) * 0.03 * (0.25 + 0.75 * down) + Math.sin(u * Math.PI * 2.3) * 0.02 * down;
    out.set(x * (1 - 0.06 * down), -cl * down, 0.06 + fold + 0.05 * down * down);
  }, { uv01: true, flip: true, tint: (u, v) => {
    const k = 0.78 + 0.22 * Math.sin(u * Math.PI * 5 + 2.2) * (1 - v) + 0.1 * v;
    const c = Math.min(1, Math.max(0.5, k));
    return [c, c, c];
  } });
  return { pole: partsOf([{ batch: shade, mat: M.contact, cast: false }, { batch: wood, mat: M.wood, cast: true }, { batch: iron, mat: M.iron, cast: true }]),
    cloth: partsOf([{ batch: cloth, mat: M.banner, cast: true }]), hang: v3(0.015, barY - 0.02, 0.03) };
}

/**
 * 营帐(宽 = 1,斜着摆):两根立柱撑一根脊梁,帆布从脊梁搭到两侧的矮墙上再垂到地(布有垂度、有一道道褶),
 * 朝镜头的山墙是两扇掀开的门帘,里面是暗的;四角拉绳钉在地上。帆布是织出来的粗布(看得出布纹),下摆脏。
 * 帆布全部两面都画:自由视角下会绕到它背后 / 侧面去看(只画一面的话,有一侧的矮墙和后山墙从外面看是空的)。
 */
function buildTent(hr: number, seed: number): Variant {
  const rnd = mulberry32(seed);
  const M = mats();
  const wood = new Leafy();
  const canvas = new Leafy();
  const dark = new Leafy();
  const shade = new Leafy();
  const W = 0.31;        // 半宽(垂直于脊梁)
  const D = 0.3;         // 半长(沿脊梁)
  const wall = 0.17;     // 侧墙高
  const ridge = Math.min(0.62, hr * 0.46);
  const yaw = -32;
  const T = xform([0, 0, -0.02], [0, yaw, 0]);
  const dirt = (y: number): number => 0.72 + 0.28 * smooth(0, 0.14, y);
  // 屋面:左右各一片,从脊梁到墙头;中间往下塌(布的垂度),沿前后方向一道道浅褶
  for (const s of [-1, 1]) {
    canvas.surf(12, 10, (u, v, out) => {
      const z = lerp(-D, D, u);
      const sag = Math.sin(v * Math.PI) * 0.03 * (0.6 + 0.4 * Math.sin(u * Math.PI)) + Math.sin(u * Math.PI * 7 + s) * 0.006 * Math.sin(v * Math.PI);
      out.set(s * lerp(W * 1.03, 0.004, v), lerp(wall, ridge, v) - sag, z);
    }, { den: 3.2, xf: T, flip: s < 0, twoSided: true, tint: (u, v, p) => {
      const k = (0.8 + 0.2 * v - 0.07 * Math.abs(Math.sin(u * Math.PI * 7 + s))) * (0.92 + 0.08 * Math.sin(u * 23 + v * 9));
      void p;
      return [k, k * 0.985, k * 0.95];
    } });
    // 侧墙:从墙头垂到地,下摆往外撇一点、发脏
    canvas.surf(12, 3, (u, v, out) => {
      out.set(s * (W * 1.03 + 0.03 * (1 - v) - 0.01 * Math.sin(u * Math.PI * 9)), wall * v, lerp(-D, D, u));
    }, { den: 3.2, xf: T, flip: s < 0, twoSided: true, tint: (u, v) => {
      const k = dirt(wall * v) * (0.86 + 0.08 * Math.sin(u * Math.PI * 9));
      return [k, k * 0.97, k * 0.9];
    } });
  }
  // 后山墙:整片
  for (const s of [-1, 1]) {
    canvas.surf(5, 6, (u, v, out) => {
      const x = s * lerp(0, W * 1.03, u);
      const topY = lerp(ridge, wall, u);
      out.set(x, topY * v, -D - 0.01 * Math.sin(v * Math.PI));
    }, { den: 3.2, xf: T, flip: s < 0, twoSided: true, tint: (u, v) => {
      const k = dirt(v * 0.4) * 0.82;
      return [k, k * 0.97, k * 0.9];
    } });
  }
  // 前山墙:两扇门帘往两边掀开(上边还连着,越往下开得越大),里面黑
  for (const s of [-1, 1]) {
    canvas.surf(5, 7, (u, v, out) => {
      const open = 0.13 * (1 - v) * (1 - v) + 0.012;
      const x = s * lerp(open, W * 1.03, u);
      const topY = lerp(ridge, wall, Math.abs(x) / (W * 1.03));
      out.set(x, topY * v, D + 0.035 * (1 - u) * (1 - v) + 0.008 * Math.sin(u * 9));
    }, { den: 3.2, xf: T, flip: s > 0, twoSided: true, tint: (u, v) => {
      const k = dirt(v * 0.4) * (0.84 + 0.12 * u);
      return [k, k * 0.97, k * 0.9];
    } });
  }
  const P = (x: number, y: number, z: number): Vec3 => Vec3.transformMat4(new Vec3(), v3(x, y, z), T);
  dark.poly([P(-0.17, 0.004, D - 0.02), P(0.17, 0.004, D - 0.02), P(0.03, ridge * 0.9, D - 0.02), P(-0.03, ridge * 0.9, D - 0.02)], Vec3.transformMat4(new Vec3(), v3(0, 0, 1), xform([0, 0, 0], [0, yaw, 0])), [1, 1, 1], 1, 0, 0);
  // 立柱(前后各一根,高出脊梁一截)、脊梁
  for (const z of [-D - 0.01, D + 0.01]) {
    const base = P(0, 0, z);
    wood.cylinder(0.018, 0.024, ridge + 0.16, 7, v3(base.x, (ridge + 0.16) / 2, base.z), v3(0, rnd() * 360, 0), [0.62, 0.57, 0.5], 2.4, rnd, 0, true);
  }
  wood.tube([P(0, ridge + 0.012, -D - 0.06), P(0, ridge + 0.004, 0), P(0, ridge + 0.012, D + 0.06)], 0.017, 6, { den: 2.4, tint: [0.58, 0.53, 0.46] });
  // 拉绳和地钉
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 0, 1]) {
      const from = P(sx * W * 1.03, wall, sz * D);
      const to = P(sx * (W + 0.2), 0.015, sz * (D + 0.1));
      wood.tube([from, v3((from.x + to.x) / 2, (from.y + to.y) / 2 - 0.012, (from.z + to.z) / 2), to], 0.0055, 4, { den: 6, tint: [0.84, 0.76, 0.56] });
      wood.cylinder(0.01, 0.015, 0.13, 5, v3(to.x, 0.05, to.z), v3(sz * 16, 0, -sx * 20), [0.52, 0.46, 0.4], 2.4, rnd, undefined, true);
    }
  }
  addContact(shade, 0, 0, 0.56, 0.5, 1);
  return partsOf([{ batch: shade, mat: M.contact, cast: false }, { batch: dark, mat: M.dark, cast: false }, { batch: canvas, mat: M.canvas, cast: true }, { batch: wood, mat: M.wood, cast: true }]);
}

// ───────────────────────── 挂进场景 ─────────────────────────
function mount(parent: Node, v: Variant, out: MeshRenderer[]): void {
  syncEdges();
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
  { test: /w3_tree_oak/, count: 3, sway: 0.5, make: (hr, seed) => buildBroadleaf(hr, seed, mats().oak, 1, 1.5) },
  { test: /w3_tree_autumn/, count: 3, sway: 0.5, make: (hr, seed) => buildBroadleaf(hr, seed, mats().autumn, 0.85) },
  { test: /fld_dead_tree/, count: 2, sway: 0, spin: true, make: (hr, seed) => buildBroadleaf(hr, seed, null, 1, 1.35) },
  { test: /fld_g_boulders_l|w3_rock_big/, count: 3, sway: 0, spin: true, make: (hr, seed) => buildRocks(hr, seed, 'boulder') },
  { test: /fld_rocks|fld_g_boulders_m|w3_rock_small/, count: 3, sway: 0, spin: true, make: (hr, seed) => buildRocks(hr, seed, 'pile') },
  { test: /fld_g_rocks_s/, count: 3, sway: 0, spin: true, make: (hr, seed) => buildRocks(hr, seed, 'small') },
  { test: /fld_g_gravel|fld_g_stones/, count: 4, sway: 0, spin: true, make: (hr, seed) => buildRocks(hr, seed, 'scatter') },
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
