import { ImageAsset, Texture2D, TextureCube } from 'cc';

/**
 * 代码画的天空(立方体贴图):天顶到地平线的渐变 + 太阳的光晕 + 一层云。
 *
 * 野外的自由视角(?fcam=1)镜头能压平,天空就进了画面;原来那张环境反射图(G3DSkins.buildEnvCube,64 像素、只有渐变和光团)
 * 是给反光用的,当天空看就是一片灰。这张按 256 像素画,带云,同时也拿来当环境反射 / 环境光(河面、湿地面反出来的是这片天)。
 *
 * 各级多级渐远按「越来越糊」重新算一遍(渐变放宽、太阳的光团放大、云淡掉):粗糙的表面取到的是糊的那几级,相当于预先模糊过。
 * 云:把视线投到头顶的一个平面上取分形噪声;朝太阳那一侧取第二次,两次的差当成「这块云迎光还是背光」。
 */

type V3 = [number, number, number];

export interface SkyOpts {
  /** 天顶 / 地平线 / 地面以下的颜色(0~1,显示出来的颜色)。 */
  zenith: V3;
  horizon: V3;
  ground: V3;
  /** 背着太阳那一侧地平线的颜色(不给 = 和 horizon 一样)。黄昏时朝太阳是橙的、背过去是发紫的灰蓝。 */
  horizonAway?: V3;
  /** 朝太阳的方向(世界坐标,不用归一化)、太阳光晕的颜色(可以大于 1)、光晕的宽度。 */
  sunDir: V3;
  sunColor: V3;
  sunSize: number;
  /** 云迎光面 / 背光面的颜色、云量(0~1)、云块的大小(越大云越碎)。 */
  cloud: V3;
  cloudShade: V3;
  cover: number;
  cloudScale: number;
  size: number;
  seed: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), ux), lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), ux), uy);
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += noise(x, y, seed + i * 17) * amp;
    total += amp;
    amp *= 0.5;
    // 每一层转一个角度再放大,不然各层的格子线叠在一起看得出方块
    const nx = x * 1.6 - y * 1.2;
    y = x * 1.2 + y * 1.6;
    x = nx;
  }
  return sum / total;
}

/** 六个面按图形接口的立方体约定展开(同 G3DSkins.buildEnvCube):+x、-x、+y、-y、+z、-z。 */
const FACES: Array<(s: number, t: number) => V3> = [
  (s, t) => [1, -t, -s], (s, t) => [-1, -t, s], (s, t) => [s, 1, t], (s, t) => [s, -1, -t], (s, t) => [s, -t, 1], (s, t) => [-s, -t, -1],
];

export function buildSkyCube(o: SkyOpts): TextureCube {
  const sm = Math.hypot(o.sunDir[0], o.sunDir[1], o.sunDir[2]) || 1;
  const sx = o.sunDir[0] / sm;
  const sy = o.sunDir[1] / sm;
  const sz = o.sunDir[2] / sm;
  // 云平面上「朝太阳」的方向
  const s2 = Math.hypot(sx, sz) || 1;
  const lx = (sx / s2) * 0.28;
  const lz = (sz / s2) * 0.28;
  const away = o.horizonAway ?? o.horizon;
  const textures: Texture2D[] = [];
  let level = 0;
  for (let px = o.size; px >= 1; px = px >> 1, level += 1) {
    const blur = level * 0.16;
    const cloudK = Math.max(0, 1 - level * 0.34);       // 越糊的级云越淡(到第 3 级就只剩平均色了)
    const octaves = Math.max(2, 5 - level);
    for (let f = 0; f < 6; f += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(px, px);
      const data = img.data;
      for (let y = 0; y < px; y += 1) {
        for (let x = 0; x < px; x += 1) {
          const d = FACES[f](((x + 0.5) / px) * 2 - 1, ((y + 0.5) / px) * 2 - 1);
          const m = Math.hypot(d[0], d[1], d[2]);
          const dx = d[0] / m;
          const dy = d[1] / m;
          const dz = d[2] / m;
          const up = smooth(-0.1 - blur, 0.06 + blur, dy);
          const k = Math.pow(smooth(0.0, 0.5, dy), 0.6);
          // 地平线的颜色:朝太阳那一侧 / 背着太阳那一侧之间过渡(按水平方向和太阳方位的夹角)
          const hm = Math.hypot(dx, dz) || 1;
          const side = Math.pow(Math.min(1, Math.max(0, ((dx * sx + dz * sz) / (hm * s2)) * 0.5 + 0.5)), 1.6);
          const h0 = lerp(away[0], o.horizon[0], side);
          const h1 = lerp(away[1], o.horizon[1], side);
          const h2 = lerp(away[2], o.horizon[2], side);
          let r = lerp(o.ground[0], lerp(h0, o.zenith[0], k), up);
          let g = lerp(o.ground[1], lerp(h1, o.zenith[1], k), up);
          let b = lerp(o.ground[2], lerp(h2, o.zenith[2], k), up);
          // 太阳:一圈宽的光晕 + 一小团亮芯
          const cs = dx * sx + dy * sy + dz * sz;
          const w = o.sunSize + blur * 0.9;
          const halo = Math.exp((cs - 1) / (w * w)) * ((o.sunSize * o.sunSize) / (w * w));
          const core = level === 0 ? Math.exp((cs - 1) / 0.0009) : 0;
          const wide = Math.exp((cs - 1) / 0.5) * 0.16;
          if (dy > 0.01 && cloudK > 0 && o.cover > 0) {
            const q = o.cloudScale / (dy + 0.22);
            const u = dx * q;
            const v = dz * q;
            const n1 = fbm(u, v, octaves, o.seed);
            const cov = smooth(1 - o.cover - 0.1, 1 - o.cover + 0.2, n1) * smooth(0.01, 0.12, dy) * cloudK;
            if (cov > 0.003) {
              const n2 = fbm(u + lx, v + lz, octaves, o.seed);
              const lit = Math.min(1, Math.max(0, 0.55 + (n1 - n2) * 3.4 + halo * 0.5));
              // 靠近地平线的云发灰发淡(隔着的空气多)
              const haze = smooth(0.02, 0.3, dy) * 0.4 + 0.6;
              r = lerp(r, lerp(o.cloudShade[0], o.cloud[0], lit), cov * haze);
              g = lerp(g, lerp(o.cloudShade[1], o.cloud[1], lit), cov * haze);
              b = lerp(b, lerp(o.cloudShade[2], o.cloud[2], lit), cov * haze);
            }
          }
          const sun = (halo + core * 3 + wide) * up;
          r += o.sunColor[0] * sun;
          g += o.sunColor[1] * sun;
          b += o.sunColor[2] * sun;
          const i = (y * px + x) * 4;
          data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
          data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
          data[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tx = new Texture2D();
      tx.image = new ImageAsset(canvas);
      textures.push(tx);
    }
  }
  const cube = TextureCube.fromTexture2DArray(textures);
  cube.setFilters(TextureCube.Filter.LINEAR, TextureCube.Filter.LINEAR);
  cube.setMipFilter(TextureCube.Filter.LINEAR);
  return cube;
}
