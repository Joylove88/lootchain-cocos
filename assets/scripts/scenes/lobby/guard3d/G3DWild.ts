import { Vec3 } from 'cc';
import type { Tint } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import { distToPath } from './G3DWildTex';
import type { WildPlan } from './G3DWildTex';

/**
 * 野外小样的场景:枯木林里一处废弃的营地(雨后的夜里)。全部是代码拼的网格。
 *
 * 可以走的范围和地宫小样一样大(24 × 12 米),四周不是墙,是残墙、木栅、乱石和枯树围出来的;
 * 再往外是一圈起伏的泥地、更多的枯树,最远处是一圈画在弧面上的林子剪影,靠雾接到天上。
 * 枯树没有叶子:主干和枝都是真的管子,镜头怎么转都不会露出「纸片」。
 */

export interface WildScene {
  stone: Sculpt;      // 砌石:残墙、塔角
  rock: Sculpt;       // 整块的石头:乱石、立石、篝火的石圈
  bark: Sculpt;       // 枯树、原木
  wood: Sculpt;       // 木料:木栅、车、灯杆
  iron: Sculpt;
  canvas: Sculpt;     // 帐篷
  grass: Sculpt;      // 枯草(一根根细片)
  coal: Sculpt;       // 篝火的炭(发光)
  pane: Sculpt;       // 提灯的玻璃(发光)
  /** 挡路的东西(主角、怪、镜头都认)。 */
  solids: Array<{ x: number; z: number; hx: number; hz: number; h: number }>;
  fires: Array<{ x: number; z: number }>;
  lanterns: Array<{ x: number; y: number; z: number }>;
  plan: WildPlan;
}

const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);

/** 地面那张大贴图管的范围(比可走的范围大一圈:围着场地的残墙、枯树也站在它上面)。 */
export const WILD_GROUND = { x0: -17, z0: -11, w: 34, d: 22 };
/** 月亮在哪个方向照过来(从右后方斜着照:影子拖得长)。 */
export const WILD_MOON = new Vec3(0.42, -0.62, 0.5).normalize();

export function buildWildScene(rnd: () => number, X0: number, X1: number, Z0: number, Z1: number): WildScene {
  const s: WildScene = {
    stone: new Sculpt(), rock: new Sculpt(), bark: new Sculpt(), wood: new Sculpt(), iron: new Sculpt(), canvas: new Sculpt(), grass: new Sculpt(), coal: new Sculpt(), pane: new Sculpt(),
    solids: [], fires: [{ x: -2.6, z: 0.4 }], lanterns: [],
    plan: { ...WILD_GROUND, path: [[-17, 3.4], [-9, 2.2], [-2, 3.0], [5, 1.2], [11, -1.6], [17, -2.4]], pathHalf: 1.5, fires: [{ x: -2.6, z: 0.4, r: 1.5 }], wet: 0.62 },
  };
  const R = (a: number, b: number): number => a + (b - a) * rnd();
  const solid = (x: number, z: number, hx: number, hz: number, h: number): void => {
    s.solids.push({ x, z, hx, hz, h });
  };

  // ── 残墙:一段墙 = 几块高矮不一的砌体(顶上是塌下来的豁口),墙脚堆着碎石 ──
  const wallRun = (x0: number, x1: number, z: number, heights: number[], thick: number, alongX = true): void => {
    const n = heights.length;
    for (let i = 0; i < n; i += 1) {
      const a = x0 + ((x1 - x0) * i) / n;
      const b = x0 + ((x1 - x0) * (i + 1)) / n;
      const h = heights[i];
      if (h <= 0.05) {
        continue;
      }
      const c = (a + b) / 2;
      const len = Math.abs(b - a) + 0.02;
      const tone = R(0.78, 0.98);
      const tint: Tint = [tone, tone, tone * 1.02];
      if (alongX) {
        s.stone.box(len, h, thick, V(c, h / 2, z), V(0, 0, 0), tint, 0.25, rnd, 0.03, 0);
        solid(c, z, len / 2, thick / 2, h);
      } else {
        s.stone.box(thick, h, len, V(z, h / 2, c), V(0, 0, 0), tint, 0.25, rnd, 0.03, 0);
        solid(z, c, thick / 2, len / 2, h);
      }
      // 顶上掉下来的几块石头
      for (let k = 0; k < 2; k += 1) {
        const px = alongX ? c + R(-len / 2, len / 2) : z + R(0.5, 1.3) * (rnd() < 0.5 ? -1 : 1);
        const pz = alongX ? z + R(0.5, 1.3) * (rnd() < 0.5 ? -1 : 1) : c + R(-len / 2, len / 2);
        const r = R(0.12, 0.26);
        s.rock.rock(r, V(px, r * 0.5, pz), [0.62, 0.63, 0.66], 0.7, rnd, 0.7);
      }
    }
  };
  // 北边:两段残墙,中间是一座塌了一半的拱门
  wallRun(-11.6, -5.4, Z0 - 0.5, [2.9, 3.3, 2.4, 2.8, 1.5, 0.9], 0.7);
  wallRun(-2.6, -1.5, Z0 - 0.5, [3.6], 0.9);            // 拱门的两个门墩
  wallRun(0.5, 1.6, Z0 - 0.5, [3.2], 0.9);
  s.stone.box(1.5, 0.55, 0.85, V(-1.55, 3.85, Z0 - 0.5), V(0, 0, 14), [0.84, 0.84, 0.88], 0.25, rnd, 0.03);     // 残存的半截拱
  s.stone.box(1.0, 0.5, 0.8, V(-0.6, 4.25, Z0 - 0.5), V(0, 0, 32), [0.8, 0.8, 0.84], 0.25, rnd, 0.03);
  solid(-0.5, Z0 - 0.2, 1.1, 0.25, 0.4);                 // 门洞里堆着塌下来的石头,过不去
  for (let i = 0; i < 7; i += 1) {
    const r = R(0.2, 0.42);
    s.rock.rock(r, V(R(-1.4, 0.4), r * 0.6, Z0 - 0.5 + R(-0.5, 0.5)), [0.6, 0.61, 0.64], 0.7, rnd, 0.75);
  }
  wallRun(3.4, 8.2, Z0 - 0.5, [1.1, 1.9, 2.6, 1.4], 0.7);
  // 东北角:一座塌了的角楼,剩两面墙
  wallRun(9.2, 12.6, Z0 - 0.6, [3.4, 4.6, 5.2], 0.8);
  wallRun(Z0 - 0.4, -2.6, X1 + 0.5, [5.0, 4.2, 2.6, 1.3], 0.8, false);
  // 东边剩下的一段矮墙
  wallRun(0.6, 3.6, X1 + 0.5, [0.8, 1.4, 1.0], 0.7, false);

  // ── 乱石:南边和西边靠它围着 ──
  const boulders = (x: number, z: number, n: number, big: number): void => {
    for (let i = 0; i < n; i += 1) {
      const r = i === 0 ? big : R(big * 0.3, big * 0.7);
      const px = x + (i === 0 ? 0 : R(-big * 1.4, big * 1.4));
      const pz = z + (i === 0 ? 0 : R(-big * 1.1, big * 1.1));
      const tone = R(0.5, 0.7);
      s.rock.rock(r, V(px, r * 0.55, pz), [tone, tone * 1.01, tone * 1.05], 0.7, rnd, 0.8);
      if (r > 0.45) {
        solid(px, pz, r * 0.8, r * 0.8, r * 1.2);
      }
    }
  };
  boulders(-12.6, -3.2, 4, 1.1);
  boulders(-12.9, 4.6, 5, 1.3);
  boulders(-4.5, Z1 + 0.9, 4, 0.9);
  boulders(6.2, Z1 + 0.8, 5, 1.2);
  boulders(12.7, 4.9, 4, 1.0);
  boulders(5.2, -4.6, 3, 0.55);
  boulders(-5.6, 4.7, 3, 0.5);
  // 一块立着的界石
  s.rock.prism([[0.34, 0.1], [0.12, 0.3], [-0.3, 0.2], [-0.36, -0.12], [-0.05, -0.3], [0.3, -0.16]], 0, 2.5, 0.55, [[0.6, 0.62, 0.66], [0.5, 0.52, 0.56]], 0.6, xform([8.9, 0, -4.2], [3, 24, -4]));
  solid(8.9, -4.2, 0.36, 0.3, 2.5);

  // ── 木栅:一排削尖的原木桩(南边两段、西边一段),有几根歪了、倒了 ──
  const stakes = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 0.34);
    for (let i = 0; i <= n; i += 1) {
      if (rnd() < 0.1) {
        continue;
      }
      const k = i / n;
      const x = x0 + (x1 - x0) * k + R(-0.04, 0.04);
      const z = z0 + (z1 - z0) * k + R(-0.04, 0.04);
      const h = R(1.9, 2.5);
      const r = R(0.11, 0.15);
      const lean = rnd() < 0.15 ? R(8, 22) : R(-3, 3);
      const tone = R(0.55, 0.8);
      s.wood.cylinder(r * 0.9, r, h, 7, V(x, h / 2 - 0.05, z), V(lean, R(0, 360), R(-3, 3)), [tone, tone * 0.96, tone * 0.9], 0.9, rnd, 0);
      s.wood.cylinder(0.01, r * 0.9, 0.3, 7, V(x, h + 0.08, z), V(lean, 0, 0), [tone * 0.9, tone * 0.85, tone * 0.8], 0.9, rnd, undefined, false);
    }
    s.wood.cylinder(0.06, 0.06, len, 6, V((x0 + x1) / 2, 1.3, (z0 + z1) / 2 + 0.14), V(0, (Math.atan2(-(z1 - z0), x1 - x0) * 180) / Math.PI, 90), [0.5, 0.47, 0.44], 0.9, rnd);
    solid((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.15, Math.abs(z1 - z0) / 2 + 0.15, 2.2);
  };
  stakes(-11.4, Z1 + 0.5, -6.2, Z1 + 0.5);
  stakes(-2.6, Z1 + 0.55, 4.2, Z1 + 0.5);
  stakes(8.4, Z1 + 0.5, 11.4, Z1 + 0.5);
  stakes(X0 - 0.5, -1.6, X0 - 0.5, 2.9);

  // ── 枯树:主干是一根弯弯曲曲、往上收细的管子,根部鼓出来;枝往外上方岔,枝上再岔小枝 ──
  const tree = (x: number, z: number, h: number, r0: number, seed: number, isSolid: boolean): void => {
    const rr = (a: number, b: number): number => a + (b - a) * rnd();
    const lean = [rr(-0.14, 0.14), rr(-0.14, 0.14)];
    const wob = [rr(0, 6.28), rr(0, 6.28)];
    const at = (t: number): Vec3 => V(x + lean[0] * h * t + Math.sin(wob[0] + t * 4) * 0.12 * h * 0.1 * t, h * t, z + lean[1] * h * t + Math.cos(wob[1] + t * 3.3) * 0.12 * h * 0.1 * t);
    const trunk: Vec3[] = [];
    for (let i = 0; i <= 9; i += 1) {
      trunk.push(at(i / 9));
    }
    trunk[0].y = -0.15;
    const tone = rr(0.5, 0.72);
    const tint: Tint = [tone, tone * 0.97, tone * 0.93];
    s.bark.tube(trunk, (t) => r0 * (1 - 0.82 * t) * (1 + 0.8 * Math.max(0, 1 - t * 9) ** 2), 9, { tint, den: 0.5 });
    // 几条露出地面的根
    for (let i = 0; i < 4; i += 1) {
      const a = rr(0, 6.28);
      const len = r0 * rr(2.2, 3.6);
      s.bark.tube([V(x + Math.cos(a) * r0 * 0.5, 0.28, z + Math.sin(a) * r0 * 0.5), V(x + Math.cos(a) * len * 0.5, 0.1, z + Math.sin(a) * len * 0.5), V(x + Math.cos(a) * len, -0.06, z + Math.sin(a) * len)],
        (t) => r0 * 0.34 * (1 - 0.75 * t), 6, { tint, den: 0.5 });
    }
    const limb = (base: Vec3, dir: Vec3, len: number, rad: number, depth: number): void => {
      const pts: Vec3[] = [base.clone()];
      const d = dir.clone();
      const p = base.clone();
      const steps = 4;
      for (let i = 0; i < steps; i += 1) {
        d.x += rr(-0.22, 0.22);
        d.z += rr(-0.22, 0.22);
        d.y += rr(0.02, 0.2);                 // 枝梢慢慢往上翘
        d.normalize();
        p.add3f(d.x * (len / steps), d.y * (len / steps), d.z * (len / steps));
        pts.push(p.clone());
        if (depth > 0 && i >= 1 && rnd() < 0.8) {
          const side = V(d.z + rr(-0.5, 0.5), rr(0.1, 0.7), -d.x + rr(-0.5, 0.5)).normalize();
          if (rnd() < 0.5) {
            side.x = -side.x;
            side.z = -side.z;
          }
          limb(p.clone(), side, len * rr(0.4, 0.62), rad * 0.5, depth - 1);
        }
      }
      s.bark.tube(pts, (t) => Math.max(0.006, rad * (1 - 0.86 * t)), depth > 0 ? 6 : 4, { tint, den: 0.6 });
    };
    const n = 5 + Math.floor(rr(0, 4));
    for (let i = 0; i < n; i += 1) {
      const t = 0.36 + (0.6 * (i + rr(0, 0.6))) / n;
      const a = seed * 1.7 + i * 2.4 + rr(-0.4, 0.4);
      const up = 0.25 + 0.6 * t;
      limb(at(t), V(Math.cos(a), up, Math.sin(a)).normalize(), h * (0.42 - 0.2 * t) * rr(0.8, 1.25), r0 * (1 - 0.8 * t) * 0.62, 2);
    }
    if (isSolid) {
      solid(x, z, r0 * 1.2, r0 * 1.2, h);
    }
  };
  // 场地里三棵、围着场地一圈、再往外一圈大的
  tree(-9.4, -3.9, 6.4, 0.34, 1, true);
  tree(9.7, 3.6, 7.2, 0.38, 2, true);
  tree(1.4, 4.9, 5.6, 0.28, 3, true);
  const ring: Array<[number, number]> = [[-14.2, -7.6], [-8.6, -8.4], [-3.4, -8.9], [2.6, -8.3], [7.2, -8.8], [14.4, -7.9], [15.2, -1.4], [14.8, 6.2], [9.8, 8.4], [3.2, 8.9], [-2.4, 8.2], [-8.8, 8.6], [-14.6, 7.2], [-15.6, 0.8]];
  ring.forEach(([x, z], i) => tree(x + R(-0.6, 0.6), z + R(-0.5, 0.5), R(6.5, 9.5), R(0.32, 0.5), 10 + i, false));
  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * Math.PI * 2 + R(-0.12, 0.12);
    const rad = R(20, 27);
    tree(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 0.8, R(8, 12), R(0.4, 0.6), 40 + i, false);
  }
  // 倒在地上的一根枯木(挡在木栅的缺口上)
  s.bark.tube([V(4.6, 0.3, Z1 + 0.2), V(6.0, 0.36, Z1 + 0.5), V(7.4, 0.3, Z1 + 0.3), V(8.6, 0.22, Z1 + 0.7)], (t) => 0.3 * (1 - 0.45 * t), 9, { tint: [0.6, 0.57, 0.54], den: 0.5 });
  solid(6.6, Z1 + 0.4, 2.1, 0.35, 0.6);

  // ── 篝火:一圈石头、几根架起来的柴、底下一层炭;旁边两根当凳子的原木 ──
  for (const f of s.fires) {
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + R(-0.1, 0.1);
      const r = R(0.13, 0.2);
      s.rock.rock(r, V(f.x + Math.cos(a) * 0.62, r * 0.55, f.z + Math.sin(a) * 0.62), [0.42, 0.42, 0.44], 0.8, rnd, 0.8);
    }
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      s.bark.cylinder(0.05, 0.065, 0.95, 6, V(f.x + Math.cos(a) * 0.2, 0.3, f.z + Math.sin(a) * 0.2), V(58 * Math.cos(a + 1.57), 0, 58 * Math.sin(a + 1.57)), [0.3, 0.26, 0.24], 0.9, rnd);
    }
    s.coal.cylinder(0.4, 0.44, 0.07, 12, V(f.x, 0.05, f.z), V(0, 0, 0), [1, 1, 1], 1, rnd);
    solid(f.x, f.z, 0.55, 0.55, 0.5);
    s.bark.cylinder(0.2, 0.22, 1.7, 9, V(f.x - 0.2, 0.2, f.z + 1.75), V(0, 12, 90), [0.6, 0.57, 0.53], 0.5, rnd);
    solid(f.x - 0.2, f.z + 1.75, 0.85, 0.24, 0.42);
    s.bark.cylinder(0.18, 0.2, 1.4, 9, V(f.x - 1.75, 0.18, f.z - 0.3), V(0, 96, 90), [0.56, 0.54, 0.5], 0.5, rnd);
    solid(f.x - 1.75, f.z - 0.3, 0.24, 0.7, 0.4);
  }

  // ── 帐篷:一根脊杆撑起来的旧帆布,两头敞着,布面往下垂 ──
  const tent = (x: number, z: number, yaw: number, len: number, w: number, h: number): void => {
    const m = xform([x, 0, z], [0, yaw, 0]);
    for (const side of [-1, 1]) {
      s.canvas.surf(8, 6, (u, v, out) => {
        const along = (u - 0.5) * len;
        const down = v;                       // 0 = 脊,1 = 落地
        const sag = Math.sin(v * Math.PI) * 0.2 * (0.5 + Math.sin(u * Math.PI)) + Math.sin(u * 9 + side) * 0.03 * v;
        out.set(along, h * (1 - down) - sag + 0.02, side * (w / 2) * down);
      }, { xf: m, tint: (u: number, v: number) => { const t = 0.4 + 0.2 * v + 0.08 * Math.sin(u * 23 + v * 7); return [t, t * 0.96, t * 0.9] as Tint; }, den: 0.6, twoSided: true, flip: side < 0 });
    }
    s.wood.cylinder(0.04, 0.04, len + 0.3, 6, V(x, h + 0.02, z), V(0, yaw, 90), [0.55, 0.5, 0.45], 0.9, rnd);
    for (const e of [-1, 1]) {
      const ex = x + Math.cos((yaw * Math.PI) / 180) * e * (len / 2);
      const ez = z - Math.sin((yaw * Math.PI) / 180) * e * (len / 2);
      s.wood.cylinder(0.045, 0.05, h + 0.1, 6, V(ex, (h + 0.1) / 2, ez), V(0, 0, 0), [0.55, 0.5, 0.45], 0.9, rnd, 0);
    }
    solid(x, z, len / 2, w / 2, h);
  };
  tent(2.4, -4.2, 62, 2.6, 2.2, 1.55);
  tent(-6.8, -4.4, 118, 2.2, 2.0, 1.4);

  // ── 一辆坏掉的板车:车板斜着支在地上,一只轮子掉在旁边 ──
  {
    const cx = -8.6;
    const cz = 4.3;
    s.wood.box(2.3, 0.1, 1.2, V(cx, 0.62, cz), V(0, 20, -9), [0.62, 0.56, 0.5], 0.9, rnd, 0.01);
    for (const side of [-1, 1]) {
      s.wood.box(2.3, 0.34, 0.06, V(cx + side * 0.2, 0.82, cz + side * 0.57), V(0, 20, -9), [0.56, 0.5, 0.44], 0.9, rnd, 0.01);
    }
    s.wood.cylinder(0.56, 0.56, 0.09, 14, V(cx + 0.5, 0.56, cz - 0.82), V(90, 20, 0), [0.5, 0.45, 0.4], 0.9, rnd);
    s.iron.cylinder(0.1, 0.1, 0.16, 8, V(cx + 0.5, 0.56, cz - 0.84), V(90, 20, 0), [0.6, 0.6, 0.62], 1.6, rnd);
    s.wood.cylinder(0.56, 0.56, 0.09, 14, V(cx + 1.7, 0.08, cz + 1.3), V(4, 0, 6), [0.5, 0.45, 0.4], 0.9, rnd);
    s.wood.cylinder(0.04, 0.045, 2.0, 6, V(cx - 1.9, 0.3, cz - 0.4), V(0, 24, 74), [0.56, 0.5, 0.44], 0.9, rnd);
    solid(cx, cz, 1.25, 0.8, 0.9);
  }

  // ── 提灯:一根木杆、一条横臂,挂着一只铁皮灯(四面玻璃发光)──
  const lantern = (x: number, z: number, yaw: number): void => {
    const ca = Math.cos((yaw * Math.PI) / 180);
    const sa = -Math.sin((yaw * Math.PI) / 180);
    s.wood.cylinder(0.06, 0.08, 2.9, 7, V(x, 1.4, z), V(R(-2, 2), 0, R(-2, 2)), [0.56, 0.5, 0.44], 0.9, rnd, 0);
    s.wood.cylinder(0.035, 0.04, 0.8, 6, V(x + ca * 0.36, 2.68, z + sa * 0.36), V(0, yaw, 90), [0.56, 0.5, 0.44], 0.9, rnd);
    const lx = x + ca * 0.68;
    const lz = z + sa * 0.68;
    s.iron.cylinder(0.006, 0.006, 0.28, 4, V(lx, 2.53, lz), V(0, 0, 0), [0.5, 0.5, 0.52], 1.6, rnd);
    s.iron.box(0.2, 0.03, 0.2, V(lx, 2.4, lz), V(0, yaw, 0), [0.45, 0.45, 0.47], 1.6, rnd, 0.005);
    s.iron.box(0.2, 0.03, 0.2, V(lx, 2.12, lz), V(0, yaw, 0), [0.45, 0.45, 0.47], 1.6, rnd, 0.005);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      s.iron.box(0.016, 0.26, 0.016, V(lx + ox * 0.09, 2.26, lz + oz * 0.09), V(0, 0, 0), [0.45, 0.45, 0.47], 1.6, rnd, 0);
    }
    s.pane.box(0.15, 0.22, 0.15, V(lx, 2.26, lz), V(0, yaw, 0), [1, 1, 1], 1, rnd, 0);
    s.lanterns.push({ x: lx, y: 2.26, z: lz });
    solid(x, z, 0.12, 0.12, 2.9);
  };
  lantern(-6.2, -2.4, 30);
  lantern(6.6, 2.9, 200);
  lantern(-0.6, 4.7, -70);

  // ── 枯草:一丛一丛的细片(每根两节,往外倒),长在不积水、不在路上的地方 ──
  const blade = (x: number, z: number, h: number, a: number, bend: number, tone: number): void => {
    const w = 0.012 + h * 0.016;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * w;
    const pz = dx * w;
    const m1 = V(x + dx * bend * 0.35, h * 0.55, z + dz * bend * 0.35);
    const tip = V(x + dx * bend, h, z + dz * bend);
    const c0: Tint = [0.2 * tone, 0.2 * tone, 0.12 * tone];
    const c1: Tint = [0.62 * tone, 0.56 * tone, 0.34 * tone];
    const quadA = [V(x - px, 0, z - pz), V(x + px, 0, z + pz), V(m1.x + px * 0.7, m1.y, m1.z + pz * 0.7), V(m1.x - px * 0.7, m1.y, m1.z - pz * 0.7)];
    s.grass.facet(quadA, [[0, 0], [1, 0], [1, 0.5], [0, 0.5]], c0);
    s.grass.facet([quadA[3], quadA[2], quadA[1], quadA[0]], [[0, 0.5], [1, 0.5], [1, 0], [0, 0]], c0);
    const tri = [V(m1.x - px * 0.7, m1.y, m1.z - pz * 0.7), V(m1.x + px * 0.7, m1.y, m1.z + pz * 0.7), tip];
    s.grass.facet(tri, [[0, 0.5], [1, 0.5], [0.5, 1]], c1);
    s.grass.facet([tri[2], tri[1], tri[0]], [[0.5, 1], [1, 0.5], [0, 0.5]], c1);
  };
  const tuft = (x: number, z: number, k: number): void => {
    const n = 5 + Math.floor(R(0, 6));
    for (let i = 0; i < n; i += 1) {
      const a = R(0, 6.28);
      const rr = R(0, 0.14) * k;
      blade(x + Math.cos(a) * rr, z + Math.sin(a) * rr, R(0.22, 0.62) * k, a + R(-0.6, 0.6), R(0.05, 0.3) * k, R(0.7, 1.1));
    }
  };
  for (let i = 0; i < 620; i += 1) {
    const x = R(WILD_GROUND.x0 + 0.5, WILD_GROUND.x0 + WILD_GROUND.w - 0.5);
    const z = R(WILD_GROUND.z0 + 0.5, WILD_GROUND.z0 + WILD_GROUND.d - 0.5);
    const inside = x > X0 && x < X1 && z > Z0 && z < Z1;
    // 场地中间稀、边上密;篝火边不长
    const edge = Math.min(x - X0, X1 - x, z - Z0, Z1 - z);
    if (inside && rnd() > 0.28 + 0.5 * Math.max(0, 1 - edge / 3)) {
      continue;
    }
    if (Math.hypot(x - s.fires[0].x, z - s.fires[0].z) < 2.4 || distToPath(x, z, s.plan.path) < s.plan.pathHalf + 0.2) {
      continue;
    }
    tuft(x, z, inside ? R(0.7, 1.0) : R(0.9, 1.5));
  }
  return s;
}
