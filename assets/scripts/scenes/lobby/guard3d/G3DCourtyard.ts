import { Node, Vec3 } from 'cc';
import { MeshBatch, Tint } from './G3DMesh';
import { Contact, mulberry32, TER_Z } from './G3DTextures';

/**
 * 守卫战 3D 场景 · 院子的几何(石平台、断墙、石柱、碎石、火盆座、木栅 / 拒马)。
 * 战斗里的 3D 光影层(GuardScene3D)和全 3D 样板(G3DStage)共用这一份:只拼网格,不管材质和灯。
 */
export const TER_H = 0.5;         // 石平台高
export const TER_BACK = -10.3;    // 石平台后沿
export const UVD = 1 / 2.2;       // 石面贴图每 2.2 米铺一遍
export const BRAZIERS = [{ x: -9.05, z: -8.8 }, { x: -1.95, z: -8.78 }, { x: 7.55, z: -8.8 }];

function quatOf(eulerDeg: Vec3) {
  const node = new Node();
  node.setRotationFromEuler(eulerDeg.x, eulerDeg.y, eulerDeg.z);
  return node.rotation.clone();
}

export interface Courtyard { stone: MeshBatch; wood: MeshBatch; iron: MeshBatch; contacts: Contact[] }

export function buildCourtyard(): Courtyard {
  const rnd = mulberry32(606);
  const stone = new MeshBatch();
  const wood = new MeshBatch();
  const iron = new MeshBatch();
  const contacts: Contact[] = [];
  const st = (dark = 1): Tint => {
    const v = dark * (0.8 + rnd() * 0.3);
    const w = rnd();
    return [v * (1 + (w - 0.5) * 0.05), v, v * (1.02 - (w - 0.5) * 0.06)];
  };
  const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
  const deg = (rad: number): number => (rad * 180) / Math.PI;

  // ── 后面的石平台:芯 + 立面条石 + 台面石板 + 两级台阶 ──
  stone.box(70, TER_H - 0.05, TER_Z - TER_BACK, V(0, (TER_H - 0.05) / 2, (TER_Z + TER_BACK) / 2 - 0.06), V(0, 0, 0), [0.42, 0.42, 0.43], UVD, rnd, 0, 0);
  for (let x = -27; x < 27;) {
    const w = 1.3 + rnd() * 1.4;
    stone.box(w - 0.03, TER_H + 0.04 + rnd() * 0.03, 0.62, V(x + w / 2, TER_H / 2 + 0.01, TER_Z - 0.3 + (rnd() - 0.5) * 0.04), V(0, deg((rnd() - 0.5) * 0.02), 0), st(0.92), UVD, rnd, 0.035, 0);
    x += w;
  }
  for (const [zc, dep] of [[-9.0, 0.95], [-9.9, 0.88]]) {
    for (let x = -27; x < 27;) {
      const w = 1.2 + rnd() * 0.9;
      stone.box(w - 0.035, 0.12, dep - 0.035, V(x + w / 2, TER_H + 0.035 + (rnd() - 0.5) * 0.02, zc), V(deg((rnd() - 0.5) * 0.012), 0, deg((rnd() - 0.5) * 0.012)), st(1.0), UVD, rnd, 0.025);
      x += w;
    }
  }
  for (let k = 0; k < 2; k += 1) {
    for (let x = 1.2; x < 6.1;) {
      const w = Math.min(1.3 + rnd() * 0.7, 6.2 - x);
      const dep = k === 0 ? 1.08 : 0.56;
      stone.box(w - 0.03, 0.172, dep, V(x + w / 2, 0.086 + k * 0.167, TER_Z + dep / 2 - 0.02), V(0, 0, 0), st(1.02), UVD, rnd, 0.03, k === 0 ? 0 : undefined);
      x += w;
    }
  }
  contacts.push({ x: 3.7, z: TER_Z + 1.15, r: 1.0 }, { x: 2.0, z: TER_Z + 1.15, r: 0.9 }, { x: 5.4, z: TER_Z + 1.15, r: 0.9 });
  stone.split();

  // ── 断墙:几段高的残垣(顶出画面)+ 一层矮墙根,正中整段塌了,远景从那里透出来 ──
  const bump = (x: number, c: number, w: number): number => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
  const wallH = (x: number): number => {
    if (Math.abs(x + 1.0) < 2.7) {
      return 0;
    }
    let rows = Math.max(Math.round(7.4 * bump(x, -8.4, 1.5)), Math.round(5.6 * bump(x, 5.7, 0.9)), Math.round(6.6 * bump(x, 12.8, 1.4)), Math.round(7 * bump(x, -15.6, 1.6)));
    if (rows < 1 && ((Math.sin(x * 1.7) + Math.sin(x * 0.53 + 2)) * 0.5 > 0.25)) {
      rows = 1;
    }
    return rows;
  };
  const BH = 0.45;
  const BD = 0.6;
  const wallY = TER_H + 0.095;
  const wallZ = TER_BACK + 0.36;
  for (let row = 0; row < 8; row += 1) {
    for (let x = -26 - rnd() * 0.8; x < 26;) {
      const bw = 0.62 + rnd() * 0.95;
      const top = wallH(x + bw / 2);
      if (row < top && !(row === top - 1 && row > 0 && rnd() < 0.3)) {
        const edge = row === top - 1;
        stone.box(bw - 0.02 - rnd() * 0.03, BH - 0.015, BD - rnd() * 0.1, V(x + bw / 2, wallY + BH / 2 + row * BH, wallZ + (rnd() - 0.5) * 0.09),
          V(deg((rnd() - 0.5) * (edge ? 0.06 : 0.01)), deg((rnd() - 0.5) * (edge ? 0.12 : 0.03)), deg((rnd() - 0.5) * (edge ? 0.09 : 0.012))), st(row === 0 ? 0.88 : 1.0), UVD, rnd, edge ? 0.06 : 0.04, row === 0 ? wallY : undefined);
      }
      x += bw;
    }
  }
  stone.split();
  // ── 石柱:两边各两根大的(顶出画面)、一根断柱,倒下的柱鼓滚在院子里 ──
  const pillar = (x: number, z: number, drums: number, r: number, tilt: boolean): void => {
    stone.box(r * 2.9, 0.42, r * 2.9, V(x, TER_H + 0.31, z), V(0, rnd() * 6, 0), st(0.95), UVD, rnd, 0.04, TER_H + 0.1);
    stone.cylinder(r * 1.2, r * 1.32, 0.22, 18, V(x, TER_H + 0.63, z), V(0, 0, 0), st(1.0), UVD, rnd);
    let y = TER_H + 0.74;
    for (let i = 0; i < drums; i += 1) {
      const hh = 0.95 + rnd() * 0.25;
      const last = i === drums - 1 && tilt;
      stone.cylinder(r * (last ? 0.9 : 1), r, hh, 18, V(x + (rnd() - 0.5) * 0.03 + (last ? 0.05 : 0), y + hh / 2, z + (rnd() - 0.5) * 0.03), V(last ? 4 : 0, rnd() * 360, last ? -5 : 0), st(1.0), UVD, rnd);
      y += hh + 0.012;
    }
  };
  pillar(-10.5, -9.42, 5, 0.5, false);
  pillar(9.9, -9.45, 5, 0.5, false);
  pillar(-14.6, -9.42, 5, 0.5, false);
  pillar(14.3, -9.45, 5, 0.5, false);
  pillar(-4.4, -9.5, 2, 0.4, true);
  stone.cylinder(0.4, 0.4, 1.05, 18, V(8.25, 0.4, -6.75), V(0, 29, 90), st(1.0), UVD, rnd, 0);
  stone.cylinder(0.4, 0.4, 0.9, 18, V(6.35, 0.4, -7.15), V(0, -20, 90), st(0.95), UVD, rnd, 0);
  stone.cylinder(0.4, 0.4, 0.8, 18, V(-9.9, 0.4, -6.9), V(0, 63, 90), st(0.95), UVD, rnd, 0);
  contacts.push({ x: 8.25, z: -6.75, r: 1.05 }, { x: 6.35, z: -7.15, r: 0.95 }, { x: -9.9, z: -6.9, r: 0.95 });
  stone.split();
  // ── 散落的碎块和石头 ──
  for (let i = 0; i < 16; i += 1) {
    const x = -14 + rnd() * 28;
    const z = TER_Z + 0.5 + rnd() * 1.5;
    const w = 0.4 + rnd() * 0.5;
    if (x > 0.8 && x < 6.6) {
      continue;
    }
    stone.box(w, 0.3 + rnd() * 0.14, 0.34 + rnd() * 0.24, V(x, 0.13 + rnd() * 0.06, z), V(deg((rnd() - 0.5) * 0.5), rnd() * 360, deg((rnd() - 0.5) * 0.5)), st(0.95), UVD, rnd, 0.035, 0);
    contacts.push({ x, z, r: w * 0.95 });
  }
  for (let i = 0; i < 60; i += 1) {
    const far = rnd() < 0.6;
    const x = far ? -15 + rnd() * 30 : 4 + rnd() * 11;
    const z = far ? TER_Z + 0.35 + rnd() * 1.9 : (rnd() < 0.5 ? -7.6 + rnd() * 3.4 : 2.6 + rnd() * 2.6);
    const r = 0.06 + rnd() * 0.16;
    if (far && x > 0.8 && x < 6.6) {
      continue;
    }
    stone.rock(r, V(x, r * 0.3, z), st(0.9), UVD * 2, rnd);
    if (r > 0.13) {
      contacts.push({ x, z, r: r * 2.2 });
    }
  }
  for (let i = 0; i < 12; i += 1) {
    const r = 0.07 + rnd() * 0.12;
    stone.rock(r, V(-15 + rnd() * 30, TER_H + 0.1 + r * 0.3, -8.9 - rnd() * 0.9), st(0.9), UVD * 2, rnd);
  }
  // ── 火盆(石墩 + 铁盆)──
  for (const b of BRAZIERS) {
    const y0 = TER_H + 0.09;
    stone.box(0.46, 0.95, 0.46, V(b.x, y0 + 0.475, b.z), V(0, rnd() * 20, 0), st(0.9), UVD, rnd, 0.035, y0);
    stone.box(0.62, 0.12, 0.62, V(b.x, y0 + 1.0, b.z), V(0, rnd() * 20, 0), st(1.0), UVD, rnd, 0.03);
    iron.cylinder(0.46, 0.2, 0.26, 16, V(b.x, y0 + 1.19, b.z), V(0, 0, 0), [1, 1, 1], 1, rnd);
  }
  // ── 木栅 / 拒马 ──
  const wt = (): Tint => {
    const v = 0.7 + rnd() * 0.45;
    return [v, v * 0.97, v * 0.93];
  };
  const stake = (x: number, y: number, z: number, len: number, r: number, rx: number, rz: number): void => {
    // 身子 + 削尖的头:沿自身 y 轴,(rx, rz) 是歪的角度(度)
    const rot = V(rx, rnd() * 360, rz);
    const up = Vec3.transformQuat(new Vec3(), V(0, 1, 0), quatOf(rot));
    wood.cylinder(r * 0.86, r, len, 7, V(x + up.x * len / 2, y + up.y * len / 2, z + up.z * len / 2), rot, wt(), 0.9, rnd, y < 0.3 ? 0 : undefined);
    const tipLen = r * 3.2;
    wood.cylinder(0.001, r * 0.86, tipLen, 7, V(x + up.x * (len + tipLen / 2), y + up.y * (len + tipLen / 2), z + up.z * (len + tipLen / 2)), rot, wt(), 0.9, rnd, undefined, false);
  };
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number, r: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    // 圆柱的轴是自身 y:先绕 z 放倒(轴指向 +x),再绕 y 转到 (x0,z0) → (x1,z1) 的方向
    wood.cylinder(r, r, len, 7, V((x0 + x1) / 2, y, (z0 + z1) / 2), V(0, -deg(Math.atan2(z1 - z0, x1 - x0)), 90), wt(), 0.9, rnd);
  };
  const palisade = (x0: number, z0: number, x1: number, z1: number, hgt: number): void => {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.4);
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      if (rnd() < 0.06) {
        continue;
      }
      stake(x0 + (x1 - x0) * t + (rnd() - 0.5) * 0.05, -0.05, z0 + (z1 - z0) * t + (rnd() - 0.5) * 0.05, hgt * (0.86 + rnd() * 0.24), 0.085 + rnd() * 0.03, (rnd() - 0.5) * 8, (rnd() - 0.5) * 8);
    }
    rail(x0, z0 + 0.13, x1, z1 + 0.13, hgt * 0.4, 0.06);
    rail(x0, z0 + 0.13, x1, z1 + 0.13, hgt * 0.74, 0.055);
    for (let t = 0; t <= 1; t += 0.2) {
      contacts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r: 0.75 });
    }
  };
  palisade(7.0, -6.3, 13.6, -5.5, 1.75);
  palisade(7.6, 5.0, 13.5, 4.75, 1.6);
  const frise = (x: number, z: number, ryDeg: number, len: number): void => {   // 拒马:一根横木上交叉穿着削尖的木桩
    const ry = (ryDeg * Math.PI) / 180;
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    rail(x - (c * len) / 2, z + (sn * len) / 2, x + (c * len) / 2, z - (sn * len) / 2, 0.55, 0.085);
    for (let i = 0; i < 6; i += 1) {
      const t = (i + 0.5) / 6 - 0.5;
      const sgn = i % 2 ? 1 : -1;
      // 木桩朝横木的两侧交替倾斜约 40 度
      stake(x + c * len * t - sn * 0.42 * sgn, 0, z - sn * len * t - c * 0.42 * sgn, 1.32, 0.06, c * 41 * sgn, sn * 41 * sgn);
    }
    contacts.push({ x, z, r: len * 0.62 });
  };
  frise(8.9, -4.15, 20, 2.3);
  frise(6.9, 3.95, -14, 2.1);
  return { stone, wood, iron, contacts };
}
