import type { Cv } from './G3DTextures';
import { ctxOf, makeCanvas, mulberry32 } from './G3DTextures';
import { mixn, Pbr, sstep } from './G3DFieldTex';
import { NoiseLut, texHash } from './G3DDungeonTex';

/**
 * 野外小样(枯木林里的废弃营地,雨后的夜里)用的贴图,全部代码画。
 *
 * 用户:「他这个室外,野外的也有……野外的也需要做一下。」参考仓库的室外演示(雨夜码头)好看的地方是:
 * 湿地面 + 积水里的倒影 + 少量局部灯光 + 天空和雾。这里把同样的做法搬到我们自己的题材上。
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface WildPlan {
  x0: number; z0: number; w: number; d: number;
  /** 一条旧石板路(折线的几个点)和它的半宽(米)。 */
  path: Array<[number, number]>;
  pathHalf: number;
  /** 篝火的位置(地面烧黑、周围踩实)。 */
  fires: Array<{ x: number; z: number; r: number }>;
  /** 积水多少(0 = 干,1 = 到处是水洼)。 */
  wet: number;
}

export function distToPath(px: number, pz: number, path: Array<[number, number]>): number {
  let best = 1e9;
  for (let i = 0; i < path.length - 1; i += 1) {
    const ax = path[i][0];
    const az = path[i][1];
    const bx = path[i + 1][0];
    const bz = path[i + 1][1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz));
    best = Math.min(best, Math.hypot(px - ax - dx * t, pz - az - dz * t));
  }
  return best;
}

/**
 * 整片空地的地面(一张图管全场,不平铺):泥地起伏,低处积水;一条旧石板路斜穿过去(石板缺了不少,缝里是泥);
 * 高一点的地方长着枯草和苔;篝火周围踩实、烧黑。
 * 积水:表面是平的、又黑又滑(镜面倒影出在这里);水边一圈是湿泥,半滑反光;干一点的泥和草是糙的。
 */
/** 哪儿有积水:一张粗格子(每格 0.25 米),1 = 水。芦苇长在水边、雨后的水滴落在水里,都查它。 */
export interface WetMap { cols: number; rows: number; cell: number; data: Uint8Array }
export interface MudOut extends Pbr { wet: WetMap }

export function wetAt(m: WetMap, plan: { x0: number; z0: number }, x: number, z: number): boolean {
  const gx = Math.floor((x - plan.x0) / m.cell);
  const gz = Math.floor((z - plan.z0) / m.cell);
  return gx >= 0 && gz >= 0 && gx < m.cols && gz < m.rows && m.data[gz * m.cols + gx] > 0;
}

export function mudPbr(W: number, H: number, plan: WildPlan): MudOut {
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
  const big = new NoiseLut(256, 4, 5, 411);
  const mid = new NoiseLut(256, 16, 4, 423);
  const fine = new NoiseLut(256, 64, 3, 439);
  const mpp = plan.w / W;
  const level = mixn(0.3, 0.42, plan.wet);
  const CELL = 0.78;                      // 石板大概这么大
  const wet: WetMap = { cols: Math.ceil(plan.w / 0.25), rows: Math.ceil(plan.d / 0.25), cell: 0.25, data: new Uint8Array(Math.ceil(plan.w / 0.25) * Math.ceil(plan.d / 0.25)) };
  for (let y = 0; y < H; y += 1) {
    const wz = plan.z0 + ((y + 0.5) / H) * plan.d;
    for (let x = 0; x < W; x += 1) {
      const wx = plan.x0 + ((x + 0.5) / W) * plan.w;
      const nb = big.at(wx / 14, wz / 14);
      const nb2 = big.at(wx / 6.5 + 0.31, wz / 6.5 + 0.77);
      const nm = mid.at(wx / 6, wz / 6);
      const nf = fine.at(wx / 2.4, wz / 2.4);
      const ng = fine.at(wx / 0.55 + 0.37, wz / 0.55 + 0.11);
      // 泥地:大起伏 + 中等的坑洼 + 细碎的颗粒
      let h = 0.4 + 0.42 * (nb - 0.5) + 0.2 * (nb2 - 0.5) + 0.07 * (nm - 0.5) + 0.02 * (nf - 0.5) + 0.008 * (ng - 0.5);
      // 篝火周围踩实垫高一点,不积水
      let scorch = 0;
      let camp = 0;
      for (const f of plan.fires) {
        const d = Math.hypot(wx - f.x, wz - f.z);
        scorch = Math.max(scorch, (1 - sstep(f.r * 0.3, f.r, d)) * (0.6 + 0.4 * nf));
        camp = Math.max(camp, 1 - sstep(f.r * 1.2, f.r * 3.2, d));
      }
      h = mixn(h, 0.5 + 0.04 * (nm - 0.5), camp * 0.8);
      // 旧石板路:离折线近的地方铺着不规则的石板(找最近的两个格点,差值小的地方是缝);有些石板没了
      const dp = distToPath(wx, wz, plan.path) + (nm - 0.5) * 0.9;
      const onPath = 1 - sstep(plan.pathHalf * 0.75, plan.pathHalf, dp);
      let stone = 0;
      let sid = 0;
      let sid2 = 0;
      let crackS = 0;
      if (onPath > 0.01) {
        const gx = wx / CELL;
        const gz = wz / CELL;
        const ix = Math.floor(gx);
        const iz = Math.floor(gz);
        let f1 = 9;
        let f2 = 9;
        let bi = 0;
        let bj = 0;
        let bcx = 0;
        let bcz = 0;
        for (let j = -1; j <= 1; j += 1) {
          for (let i = -1; i <= 1; i += 1) {
            const cx = ix + i + 0.15 + 0.7 * texHash(ix + i, iz + j, 461);
            const cz = iz + j + 0.15 + 0.7 * texHash(ix + i, iz + j, 463);
            const d = Math.hypot(gx - cx, gz - cz);
            if (d < f1) {
              f2 = f1;
              f1 = d;
              bi = ix + i;
              bj = iz + j;
              bcx = cx;
              bcz = cz;
            } else if (d < f2) {
              f2 = d;
            }
          }
        }
        sid = texHash(bi, bj, 467);
        sid2 = texHash(bi, bj, 479);
        const there = sid2 > 0.22 ? 1 : 0;                         // 两成多的石板不见了
        const edge = (f2 - f1) * CELL + (nf - 0.5) * 0.02;         // 到石板边的距离(米)
        // 崩掉的角:石板边上零星缺一块(缺口里是泥)
        const chip = sstep(0.6, 0.68, fine.at(wx / 0.5 + sid * 7, wz / 0.5 + sid2 * 3)) * (1 - sstep(0.04, 0.2, edge));
        stone = sstep(0.025, 0.06, edge) * there * sstep(0.15, 0.6, onPath) * (1 - chip);
        if (stone > 0) {
          // 每块石板:比泥地高出两三厘米,朝某个方向歪一点;边上磨圆了(越靠边越低);少数石板上有一道裂缝;表面有磨出来的浅坑
          const ta = texHash(bi, bj, 491) * 6.283;
          const tilt = ((gx - bcx) * Math.cos(ta) + (gz - bcz) * Math.sin(ta)) * 0.09 * texHash(bi, bj, 499);
          const round = 1 - sstep(0.03, 0.2, edge);
          crackS = sid > 0.66 ? (1 - sstep(0.004, 0.016, Math.abs(mid.at(wx / 2.3 + sid * 9, wz / 2.3 + sid2 * 5) - 0.5))) * sstep(0.08, 0.16, edge) : 0;
          const pit = sstep(0.74, 0.8, fine.at(wx / 0.9 + 0.3, wz / 0.9 + 0.8));
          const top = 0.6 + 0.07 * (sid - 0.5) + tilt + 0.22 * (nb - 0.5) + 0.035 * (nf - 0.5) + 0.014 * (ng - 0.5) - 0.11 * round * round - 0.07 * crackS - 0.025 * pit;
          h = mixn(h, top, stone);
        }
      }
      // 枯草和苔:不在路上、不在火边、地势高一点的地方,一丛一丛
      const gmask = sstep(0.52, 0.66, mid.at(wx / 9 + 0.6, wz / 9 + 0.2) * 0.6 + nb * 0.4) * (1 - stone) * (1 - camp) * sstep(level + 0.01, level + 0.08, h);
      const blade = fine.at(wx / 0.22 + 0.2, wz / 0.22 + 0.7);
      h += gmask * (0.03 + 0.05 * blade);
      // 落叶和小石子:零星的小点
      const litter = sstep(0.71, 0.76, fine.at(wx / 0.8 + 0.9, wz / 0.8 + 0.4)) * (1 - stone) * 0.8;
      const pebble = sstep(0.8, 0.84, fine.at(wx / 0.45 + 0.13, wz / 0.45 + 0.59)) * (1 - gmask);
      h += 0.025 * pebble + 0.006 * litter;
      // 积水
      const depth = level - h;
      const water = sstep(0.0, 0.03, depth);
      const shore = (1 - sstep(0.0, 0.1, -depth)) * (1 - water);          // 水边一圈湿泥
      // 颜色
      const shade = (0.7 + 0.55 * nb) * (0.88 + 0.24 * nf) * (0.94 + 0.12 * ng);
      let cr = 62 * shade;
      let cg = 50 * shade;
      let cb = 40 * shade;
      let rough = 0.78 + 0.16 * (nf - 0.5);
      let ao = clamp01(0.62 + 0.9 * (nm - 0.35));
      // 湿泥更深、更亮
      const damp = clamp01(shore + 0.35 * plan.wet + 0.5 * (0.55 - nb));
      cr *= 1 - 0.38 * damp;
      cg *= 1 - 0.36 * damp;
      cb *= 1 - 0.32 * damp;
      rough = mixn(rough, 0.64 + 0.14 * nf, damp * 0.8);          // 湿泥只是半滑:太滑的话迎着月光看整片地面反白
      if (gmask > 0) {
        const dry = 0.5 + 0.5 * mid.at(wx / 2.1, wz / 2.1);
        const g = gmask * (0.55 + 0.45 * blade);
        cr = mixn(cr, mixn(30, 58, dry) * (0.7 + 0.5 * blade), g);
        cg = mixn(cg, mixn(36, 54, dry) * (0.7 + 0.5 * blade), g);
        cb = mixn(cb, mixn(22, 32, dry) * (0.7 + 0.5 * blade), g);
        rough = mixn(rough, 0.95, g);
        ao *= 1 - 0.3 * g * (1 - blade);
      }
      if (litter > 0) {
        const lv = texHash(Math.floor(wx / 0.12), Math.floor(wz / 0.12), 487);
        cr = mixn(cr, mixn(96, 60, lv), litter);
        cg = mixn(cg, mixn(64, 44, lv), litter);
        cb = mixn(cb, mixn(34, 28, lv), litter);
        rough = mixn(rough, 0.85, litter);
      }
      if (pebble > 0) {
        cr = mixn(cr, 104 * shade, pebble);
        cg = mixn(cg, 102 * shade, pebble);
        cb = mixn(cb, 100 * shade, pebble);
        rough = mixn(rough, 0.6, pebble);
      }
      if (stone > 0) {
        // 石板:深灰,每块深浅不同;表面有磨出来的花斑和细坑,边上发暗;长苔的地方偏暗绿(不是一块鲜绿)
        const tone = (0.7 + 0.5 * sid) * (0.7 + 0.5 * nb) * (0.82 + 0.36 * nf) * (0.9 + 0.2 * ng) * (0.55 + 0.45 * stone);
        const moss = sstep(0.5, 0.72, nm) * 0.6;
        const warm = sstep(0.55, 0.9, sid2) * 0.6;          // 有几块偏黄褐(不是同一批石料)
        const dk = 1 - 0.6 * crackS;
        cr = mixn(cr, mixn(mixn(60, 72, warm), 34, moss) * tone * dk, stone);
        cg = mixn(cg, mixn(mixn(62, 64, warm), 44, moss) * tone * dk, stone);
        cb = mixn(cb, mixn(mixn(68, 52, warm), 30, moss) * tone * dk, stone);
        ao = mixn(ao, 1 - 0.5 * crackS, stone);
        rough = mixn(rough, mixn(0.6, 0.88, moss) + 0.14 * (nf - 0.5), stone);
        ao = mixn(ao, 1, stone);
      }
      cr *= 1 - 0.72 * scorch;
      cg *= 1 - 0.76 * scorch;
      cb *= 1 - 0.78 * scorch;
      rough = mixn(rough, 0.95, scorch * 0.8);
      if (water > 0) {
        // 浑水:看到的是水底的泥,发暗发棕
        cr = mixn(cr, cr * 0.4 + 3, water);
        cg = mixn(cg, cg * 0.42 + 3, water);
        cb = mixn(cb, cb * 0.46 + 3, water);
        rough = mixn(rough, 0.03, water);
        ao = mixn(ao, 1, water);
        h = mixn(h, level, water);
        if (water > 0.8) {
          wet.data[Math.min(wet.rows - 1, Math.floor((wz - plan.z0) / wet.cell)) * wet.cols + Math.min(wet.cols - 1, Math.floor((wx - plan.x0) / wet.cell))] = 1;
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
  // 法线:高度 1 = 约 12 厘米(泥地的起伏比石板地大)
  const k = (0.12 / mpp) * 1.2;
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
  return { albedo: A, normal: N, orm: O, wet };
}

/**
 * 远处的林子:一长条枯树的剪影(透明底,横向首尾相接),贴在围着场地的一圈弧面上。
 * 每棵 = 一根往上收细的主干 + 几层往上岔的枝,枝再分小枝;越往上越淡一点(被雾吃掉)。
 */
export function paintTreeline(W: number, H: number, seed: number, count: number): Cv {
  const cv = makeCanvas(W, H);
  const c = ctxOf(cv);
  const rnd = mulberry32(seed);
  c.clearRect(0, 0, W, H);
  c.lineCap = 'round';
  const branch = (x: number, y: number, ang: number, len: number, width: number, depth: number): void => {
    const steps = 4;
    let px = x;
    let py = y;
    let a = ang;
    for (let i = 0; i < steps; i += 1) {
      a += (rnd() - 0.5) * 0.5 - Math.sin(a) * 0.12;          // 慢慢往上弯
      const nx = px + Math.sin(a) * (len / steps);
      const ny = py - Math.cos(a) * (len / steps);
      c.lineWidth = Math.max(0.7, width * (1 - (i / steps) * 0.5));
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(nx, ny);
      c.stroke();
      if (depth > 0 && i >= 1 && rnd() < 0.75) {
        const side = rnd() < 0.5 ? -1 : 1;
        branch(nx, ny, a + side * (0.5 + rnd() * 0.6), len * (0.45 + rnd() * 0.25), width * 0.55, depth - 1);
      }
      px = nx;
      py = ny;
    }
  };
  for (let i = 0; i < count; i += 1) {
    const x = ((i + rnd() * 0.8) / count) * W;
    const hgt = H * (0.5 + rnd() * 0.42);
    const w = 3 + rnd() * 5;
    const shade = 8 + Math.floor(rnd() * 14);
    c.strokeStyle = `rgba(${shade}, ${shade + 3}, ${shade + 8}, 1)`;
    for (const off of [0, W, -W]) {          // 首尾相接:靠边的树两头各画一遍
      const base = x + off;
      if (base < -W * 0.1 || base > W * 1.1) {
        continue;
      }
      branch(base, H, (rnd() - 0.5) * 0.16, hgt, w, 3);
    }
  }
  // 底下一条实心的灌木带,把树脚连起来
  const g = c.createLinearGradient(0, H * 0.8, 0, H);
  g.addColorStop(0, 'rgba(10, 13, 18, 0)');
  g.addColorStop(0.5, 'rgba(10, 13, 18, 0.9)');
  g.addColorStop(1, 'rgba(8, 10, 14, 1)');
  c.fillStyle = g;
  c.fillRect(0, H * 0.8, W, H * 0.2);
  return cv;
}
