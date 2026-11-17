import { Vec3 } from 'cc';
import type { Tint } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import type { CityPlan } from './G3DCityTex';

/**
 * 主城 3D 小样 · 中心广场(月夜)。全部是代码拼的网格,照着原型摆:
 * 周报截图/2026-11-17_主城3D小样/原型/01_主城中心广场_原型.jpg(用户:「按第一版做吧」)。
 *
 * 主角从西边走进广场,正对东头的大教堂(台阶、玫瑰窗、两座尖塔);左手边(北)是铁匠铺和水井,右手边(南)是红篷的集市摊位;
 * 脚下是罗盘纹;四周一圈半木结构、石板瓦顶的房子;只剩零星红叶的枫树。可走的范围 40 × 28 米(地宫 / 野外小样是 24 × 12)。
 * 用户问「这个主城这么小吗」—— 这一块只是中心广场;西、北、南各留了一个街口,以后的集市街、运河、学院从这些街口往外接。
 */

export const CITY = { X0: -20, X1: 20, Z0: -14, Z1: 14 };
/** 地面那张大贴图管的范围(比可走的范围大一圈:房子的墙脚、教堂的台阶也在它上面)。 */
export const CITY_GROUND = { x0: -32, z0: -24, w: 64, d: 48 };
/**
 * 月光:从西北方向的高处照下来 —— 教堂的正面(朝西)和广场都照得到,影子往东南方向拖。
 * 原型里月亮画在教堂的左上方(东北),照那个方向打光的话教堂正面是全黑的;所以天上看得见的月亮(CITY_MOON_SKY)和打光的方向分开了,
 * 影子和天上的月亮对不上,这是有意的取舍。
 */
export const CITY_MOON = new Vec3(0.42, -0.72, 0.55).normalize();
/** 天上的月亮画在哪个方向(从场地往月亮看):教堂的左上方。 */
export const CITY_MOON_SKY: [number, number, number] = [0.87, 0.34, -0.35];
const TREES: Array<[number, number, number]> = [[-16.6, -9.6, 11.5], [4.5, -12.8, 8.2], [17.2, -12.2, 8.6], [-16.4, 10.4, 11], [-4.6, 12.4, 8.4], [18.6, 11.9, 8.4]];
export const CITY_PLAN: CityPlan = { ...CITY_GROUND, compass: { x: 5, z: 0, r: 4.2 }, trees: TREES.map(([x, z]) => [x, z] as [number, number]), wet: 0.62 };

export interface CityScene {
  stone: Sculpt;      // 砌石:教堂、房子的底层、水井、栏杆的石柱
  plaster: Sculpt;    // 灰泥墙
  timber: Sculpt;     // 木构架、门、摊位的木料
  slate: Sculpt;      // 石板瓦屋顶
  iron: Sculpt;
  bark: Sculpt;       // 枫树
  cloth: Sculpt;      // 暗红的篷布、教堂的旗幡
  goods: Sculpt;      // 摊位上的货、麻袋(只用顶点色)
  leaf: Sculpt;       // 残留的红叶、柏树(只用顶点色)
  winHouse: Sculpt;   // 亮着的方格窗
  winLancet: Sculpt;  // 教堂的尖拱窗
  winRose: Sculpt;    // 玫瑰窗
  winDark: Sculpt;    // 没亮灯的窗
  coal: Sculpt;       // 炉火(发光)
  glass: Sculpt;      // 路灯的玻璃(发光)
  solids: Array<{ x: number; z: number; hx: number; hz: number; h: number }>;
  lamps: Array<{ x: number; y: number; z: number }>;
  doorLamps: Array<{ x: number; y: number; z: number }>;
  forge: { x: number; y: number; z: number };
  /** 镇民站的位置和朝向(度)。 */
  npcs: Array<{ x: number; z: number; yaw: number }>;
  plan: CityPlan;
}

const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);

export function buildCityScene(rnd: () => number): CityScene {
  const mk = (): Sculpt => new Sculpt();
  const s: CityScene = {
    stone: mk(), plaster: mk(), timber: mk(), slate: mk(), iron: mk(), bark: mk(), cloth: mk(), goods: mk(), leaf: mk(),
    winHouse: mk(), winLancet: mk(), winRose: mk(), winDark: mk(), coal: mk(), glass: mk(),
    solids: [], lamps: [], doorLamps: [], forge: { x: -10, y: 1.0, z: -13.2 }, npcs: [], plan: CITY_PLAN,
  };
  const R = (a: number, b: number): number => a + (b - a) * rnd();
  const solid = (x: number, z: number, hx: number, hz: number, h: number): void => {
    s.solids.push({ x, z, hx, hz, h });
  };

  /**
   * 一个「本地坐标架」:原点放在 (ox, oz),绕 y 转 yaw 度。本地的 +z 是正面朝外的方向,+x 是沿着正面往右。
   * 房子、摊位、教堂都在自己的本地坐标里搭,再整个摆到广场边上。
   */
  const frame = (ox: number, oz: number, yaw: number, ys = 1) => {
    // ys = 高度整体乘几倍(教堂按「正面比例」搭好之后整体压矮,省得每个数重算)
    const ca = Math.cos((yaw * Math.PI) / 180);
    const sa = Math.sin((yaw * Math.PI) / 180);
    const P = (lx: number, ly: number, lz: number): Vec3 => V(ox + lx * ca + lz * sa, ly * ys, oz - lx * sa + lz * ca);
    const box = (b: Sculpt, lx: number, ly: number, lz: number, w: number, h: number, d: number, tint: Tint, den: number, bevel = 0.02, rot: [number, number, number] = [0, 0, 0]): void => {
      b.box(w, h * ys, d, P(lx, ly, lz), V(rot[0], yaw + rot[1], rot[2]), tint, den, rnd, bevel);
    };
    /** 朝正面(本地 +z)的一块平板:窗、旗。贴图铺满。 */
    const pane = (b: Sculpt, lx: number, ly: number, lz: number, w: number, h: number, tint: Tint = [1, 1, 1]): void => {
      b.facet([P(lx - w / 2, ly - h / 2, lz), P(lx + w / 2, ly - h / 2, lz), P(lx + w / 2, ly + h / 2, lz), P(lx - w / 2, ly + h / 2, lz)], [[0, 1], [1, 1], [1, 0], [0, 0]], tint);
    };
    const face = (b: Sculpt, pts: Array<[number, number, number]>, den: number, tint: Tint): void => {
      // 贴图坐标:横向 = 沿着第一条边(檐口)走的距离,纵向 = 离开这条边的斜长(往屋脊方向是负的:瓦片一排排往下压)
      const p0 = pts[0];
      const alongX = Math.abs(pts[1][0] - p0[0]) > Math.abs(pts[1][2] - p0[2]);
      b.facet(pts.map(([x, y, z]) => P(x, y, z)), pts.map(([x, y, z]) => {
        const along = alongX ? x - p0[0] : z - p0[2];
        const down = Math.hypot(y - p0[1], alongX ? z - p0[2] : x - p0[0]);
        return [along * den, -down * den] as [number, number];
      }), tint);
    };
    return { P, box, pane, face, yaw };
  };
  type Frame = ReturnType<typeof frame>;

  const STONE: Tint = [0.84, 0.85, 0.9];
  const TIMBER: Tint = [0.34, 0.3, 0.27];
  const SLATE: Tint = [0.9, 0.92, 1];

  /** 一扇窗:亮的(暖黄的方格玻璃)或者黑的,外面一圈木窗框。 */
  const windowAt = (f: Frame, lx: number, ly: number, lz: number, w: number, h: number, lit: boolean): void => {
    if (lit) {
      f.pane(s.winHouse, lx, ly, lz + 0.02, w, h);
    } else {
      f.pane(s.winDark, lx, ly, lz + 0.02, w, h, [0.05, 0.06, 0.08]);
    }
    f.box(s.timber, lx, ly + h / 2 + 0.04, lz + 0.03, w + 0.2, 0.09, 0.1, TIMBER, 0.9, 0.01);
    f.box(s.timber, lx, ly - h / 2 - 0.05, lz + 0.05, w + 0.26, 0.1, 0.16, TIMBER, 0.9, 0.01);
    for (const sd of [-1, 1]) {
      f.box(s.timber, lx + sd * (w / 2 + 0.05), ly, lz + 0.03, 0.09, h + 0.1, 0.1, TIMBER, 0.9, 0.01);
    }
  };

  /**
   * 一栋半木结构的房子:底层砌石(或灰泥),上面一两层灰泥墙 + 外露的木构架(往外挑出一点),石板瓦的人字顶,一根烟囱。
   * gableFront = 山墙朝着广场(屋脊垂直于正面);lit = 亮几扇窗。
   */
  const house = (ox: number, oz: number, yaw: number, w: number, d: number, o: { upper?: number; gableFront?: boolean; lit?: number; door?: number; stoneGround?: boolean; tone?: number }): Frame => {
    const f = frame(ox, oz, yaw);
    const g = 3.0;
    const u = 2.7;
    const upper = o.upper ?? 1;
    const jet = 0.35;
    const tone = o.tone ?? R(0.82, 1.0);
    const PL: Tint = [tone, tone * 0.98, tone * 0.94];
    // 底层
    f.box(o.stoneGround === false ? s.plaster : s.stone, 0, g / 2, -d / 2, w, g, d, o.stoneGround === false ? PL : STONE, 0.25, 0.03);
    f.box(s.stone, 0, 0.2, -d / 2 + 0.06, w + 0.2, 0.4, d + 0.12, [0.7, 0.71, 0.75], 0.25, 0.04);
    const doorX = o.door ?? R(-w * 0.25, w * 0.25);
    f.box(s.timber, doorX, 1.08, 0.02, 1.15, 2.16, 0.1, [0.42, 0.34, 0.27], 0.9, 0.02);
    f.box(s.stone, doorX, 2.32, 0.05, 1.6, 0.26, 0.2, [0.74, 0.75, 0.8], 0.25, 0.03);
    f.box(s.iron, doorX + 0.38, 1.05, 0.09, 0.05, 0.16, 0.04, [0.5, 0.5, 0.52], 1.6, 0);
    let litLeft = o.lit ?? 2;
    for (const wx of [-w * 0.34, w * 0.34]) {
      if (Math.abs(wx - doorX) > 1.4) {
        windowAt(f, wx, 1.7, 0.02, 1.0, 1.2, litLeft > 0 && rnd() < 0.6);
        litLeft -= 1;
      }
    }
    // 上层:灰泥墙往外挑出一点,正面是木构架
    const top = g + upper * u;
    const zf = jet;
    f.box(s.plaster, 0, g + (upper * u) / 2, (zf - d) / 2, w + 0.16, upper * u, d + zf, PL, 0.3, 0.02);
    for (let k = 0; k <= upper; k += 1) {
      f.box(s.timber, 0, g + k * u + (k === upper ? -0.1 : 0.1), zf + 0.02, w + 0.3, 0.22, 0.14, TIMBER, 0.9, 0.015);
    }
    const bays = Math.max(3, Math.round(w / 1.5));
    for (let i = 0; i <= bays; i += 1) {
      const px = -w / 2 + (w * i) / bays;
      f.box(s.timber, px, g + (upper * u) / 2, zf + 0.02, 0.17, upper * u, 0.13, TIMBER, 0.9, 0.015);
    }
    for (let k = 0; k < upper; k += 1) {
      const yc = g + k * u + u / 2;
      for (let i = 0; i < bays; i += 1) {
        const cxb = -w / 2 + (w * (i + 0.5)) / bays;
        const bw = w / bays;
        if (i === 0 || i === bays - 1) {
          // 两头的开间:一根斜撑
          f.box(s.timber, cxb, yc, zf + 0.02, 0.13, Math.hypot(bw, u) * 0.92, 0.1, TIMBER, 0.9, 0.01, [0, 0, (i === 0 ? -1 : 1) * (Math.atan2(bw, u) * 180) / Math.PI]);
        } else if ((i + k) % 2 === 1) {
          windowAt(f, cxb, yc + 0.1, zf + 0.02, Math.min(1.0, bw - 0.4), 1.25, litLeft > 0 && rnd() < 0.7);
          litLeft -= 1;
        } else {
          f.box(s.timber, cxb, yc - 0.45, zf + 0.02, bw, 0.12, 0.1, TIMBER, 0.9, 0.01);
        }
      }
    }
    // 屋顶
    const hw = w / 2 + 0.5;
    const zb = -d - 0.45;
    const zfo = zf + 0.5;
    if (o.gableFront) {
      const ridge = top + w * 0.46;
      f.face(s.slate, [[-hw, top - 0.15, zb], [-hw, top - 0.15, zfo], [0, ridge, zfo], [0, ridge, zb]], 0.42, SLATE);
      f.face(s.slate, [[hw, top - 0.15, zfo], [hw, top - 0.15, zb], [0, ridge, zb], [0, ridge, zfo]], 0.42, SLATE);
      // 山墙:灰泥的三角 + 中间一根立柱、两根斜撑
      f.face(s.plaster, [[-w / 2 - 0.08, top, zf], [w / 2 + 0.08, top, zf], [0, ridge - 0.25, zf]], 0.3, PL);
      f.face(s.plaster, [[w / 2 + 0.08, top, -d], [-w / 2 - 0.08, top, -d], [0, ridge - 0.25, -d]], 0.3, PL);
      f.box(s.timber, 0, (top + ridge) / 2 - 0.2, zf + 0.02, 0.16, ridge - top - 0.4, 0.12, TIMBER, 0.9, 0.01);
      const slope = Math.hypot(w / 2, ridge - top);
      const ang = (Math.atan2(ridge - top, w / 2) * 180) / Math.PI;
      for (const sd of [-1, 1]) {
        f.box(s.timber, sd * (w / 4), (top + ridge) / 2, zfo, slope + 0.3, 0.2, 0.12, [0.3, 0.27, 0.24], 0.9, 0.01, [0, 0, sd * -ang]);
      }
      if (litLeft > 0 || rnd() < 0.5) {
        windowAt(f, 0, top + (ridge - top) * 0.36, zf + 0.02, 0.8, 0.95, rnd() < 0.7);
      }
    } else {
      const zc = (zf - d) / 2;
      const ridge = top + (d + zf) * 0.44;
      f.face(s.slate, [[-hw, top - 0.15, zfo], [hw, top - 0.15, zfo], [hw, ridge, zc], [-hw, ridge, zc]], 0.42, SLATE);
      f.face(s.slate, [[hw, top - 0.15, zb], [-hw, top - 0.15, zb], [-hw, ridge, zc], [hw, ridge, zc]], 0.42, SLATE);
      for (const sd of [-1, 1]) {
        const xe = sd * (w / 2 + 0.08);
        const tri: Array<[number, number, number]> = sd > 0 ? [[xe, top, zf], [xe, top, -d], [xe, ridge - 0.25, zc]] : [[xe, top, -d], [xe, top, zf], [xe, ridge - 0.25, zc]];
        f.face(s.plaster, tri, 0.3, PL);
      }
      f.box(s.timber, 0, top - 0.02, zfo - 0.06, w + 1.0, 0.16, 0.14, TIMBER, 0.9, 0.01);
    }
    // 烟囱
    const chx = R(-w * 0.3, w * 0.3);
    f.box(s.stone, chx, top + 2.2, -d * 0.55, 0.8, 4.4, 0.8, [0.7, 0.7, 0.74], 0.25, 0.03);
    f.box(s.stone, chx, top + 4.5, -d * 0.55, 1.0, 0.24, 1.0, [0.62, 0.62, 0.66], 0.25, 0.03);
    return f;
  };

  // ── 北边一排:铁匠铺、两栋房子;南边一排;西边两栋,中间留街口 ──
  const smithy = house(-13, CITY.Z0 - 0.4, 0, 12, 8, { upper: 1, gableFront: true, lit: 3, door: -3.6, tone: 0.9 });
  {
    // 锻炉:底层右边一个拱形的炉口(黑洞洞的,里面是炭火),上面一截石砌的烟罩;门口一只铁砧、一桶水、一架工具
    const f = smithy;
    f.box(s.winDark, 3.0, 1.25, 0.03, 2.6, 2.3, 0.06, [0.03, 0.03, 0.035], 1, 0);
    for (let i = 0; i <= 8; i += 1) {
      const a = (i / 8) * Math.PI;
      f.box(s.stone, 3.0 - Math.cos(a) * 1.5, 1.2 + Math.sin(a) * 1.5, 0.08, 0.5, 0.42, 0.3, [0.66, 0.66, 0.7], 0.25, 0.03, [0, 0, 90 - (a * 180) / Math.PI]);
    }
    for (const sd of [-1, 1]) {
      f.box(s.stone, 3.0 + sd * 1.5, 0.6, 0.08, 0.5, 1.2, 0.3, [0.66, 0.66, 0.7], 0.25, 0.03);
    }
    f.box(s.stone, 3.0, 0.45, -0.25, 2.3, 0.9, 0.8, [0.5, 0.5, 0.53], 0.25, 0.03);
    s.coal.box(1.7, 0.1, 0.5, f.P(3.0, 0.94, -0.2), V(0, 0, 0), [1, 1, 1], 1, rnd, 0);
    s.forge = { x: f.P(3.0, 1.2, 0.5).x, y: 1.2, z: f.P(3.0, 1.2, 0.5).z };
    // 挂在墙外的招牌:一根铁臂挑着一块木牌
    f.box(s.iron, -0.9, 3.6, 0.75, 0.05, 0.05, 1.4, [0.4, 0.4, 0.42], 1.6, 0);
    f.box(s.timber, -0.9, 3.0, 1.2, 0.08, 0.95, 0.8, [0.36, 0.3, 0.25], 0.9, 0.02);
    f.box(s.iron, -0.86, 3.02, 1.2, 0.03, 0.34, 0.5, [0.62, 0.62, 0.66], 1.6, 0.01);
    // 铁砧(架在一截树桩上)、水桶、靠墙的车轮和工具
    f.box(s.bark, 1.0, 0.3, 1.5, 0.5, 0.6, 0.5, [0.5, 0.45, 0.4], 0.5, 0.05);
    f.box(s.iron, 1.0, 0.72, 1.5, 0.62, 0.2, 0.26, [0.4, 0.4, 0.43], 1.6, 0.02);
    f.box(s.iron, 1.0, 0.86, 1.5, 0.8, 0.1, 0.22, [0.45, 0.45, 0.48], 1.6, 0.02);
    solid(f.P(1.0, 0, 1.5).x, f.P(1.0, 0, 1.5).z, 0.4, 0.3, 0.9);
    for (let i = 0; i < 4; i += 1) {
      f.box(s.timber, 5.0 + i * 0.22, 1.0, 0.35, 0.05, 2.0, 0.05, [0.48, 0.42, 0.36], 0.9, 0, [-9, 0, R(-4, 4)]);
    }
  }
  house(1.2, CITY.Z0 - 1.2, 0, 9, 8, { upper: 2, lit: 3, tone: 0.86 });
  house(12.6, CITY.Z0 - 0.9, 0, 10.5, 8, { upper: 1, gableFront: true, lit: 2 });
  house(-13.4, CITY.Z1 + 0.6, 180, 11, 8, { upper: 1, lit: 3 });
  house(-2.2, CITY.Z1 + 1.1, 180, 9, 8, { upper: 2, gableFront: true, lit: 2, tone: 0.92 });
  house(10.5, CITY.Z1 + 3.2, 180, 14, 8, { upper: 1, lit: 3, tone: 0.84 });
  house(CITY.X0 - 0.5, -9.2, 90, 9.5, 8, { upper: 1, lit: 2 });
  house(CITY.X0 - 0.5, 9.2, 90, 9.5, 8, { upper: 2, gableFront: true, lit: 2 });
  // 第二排(只露出屋顶和上层)、西边街口尽头的一栋
  house(-7, CITY.Z0 - 12, 0, 15, 8, { upper: 2, lit: 2, tone: 0.8 });
  house(9, CITY.Z0 - 12.5, 0, 13, 8, { upper: 2, gableFront: true, lit: 2, tone: 0.8 });
  house(-8, CITY.Z1 + 12.5, 180, 15, 8, { upper: 2, lit: 2, tone: 0.8 });
  house(9, CITY.Z1 + 14, 180, 13, 8, { upper: 2, lit: 1, tone: 0.8 });
  house(CITY.X0 - 11, 0, 90, 12, 8, { upper: 2, gableFront: true, lit: 3, tone: 0.82 });
  // 房子的正面一线挡路(街口留着)
  solid(-1, CITY.Z0 - 0.6, 19.5, 0.6, 6);
  solid(-6, CITY.Z1 + 0.9, 13, 0.6, 6);
  solid(CITY.X0 - 0.5, -9.2, 0.6, 5, 6);
  solid(CITY.X0 - 0.5, 9.2, 0.6, 5, 6);

  // ── 大教堂:在广场东头,正面朝西。本地坐标里正面是 +z,整个垫高在一层台基上 ──
  {
    const YS = 0.66;
    const f = frame(27, 0, -90, YS);
    const BY = 1.6;
    const ST: Tint = [0.78, 0.8, 0.86];
    const SD: Tint = [0.62, 0.64, 0.7];
    f.box(s.stone, 0, BY / 2, -8, 34, BY, 18, SD, 0.25, 0.04);
    // 台阶:八级,越往下越往外伸
    for (let i = 0; i < 8; i += 1) {
      const dep = 0.6 * (8 - i);
      f.box(s.stone, 0, 0.1 + 0.2 * i, 1 + dep / 2, 11, 0.2, dep, i % 2 ? ST : SD, 0.25, 0.02);
    }
    for (const sd of [-1, 1]) {
      f.box(s.stone, sd * 6.0, 1.05, 3.4, 0.9, 2.1, 5.0, SD, 0.25, 0.04);
      f.box(s.stone, sd * 6.0, 2.2, 5.6, 1.1, 0.2, 1.1, ST, 0.25, 0.03);
      const lp = f.P(sd * 6.0, 2.3, 5.6);
      s.iron.box(0.3, 0.06, 0.3, V(lp.x, lp.y + 0.03, lp.z), V(0, 0, 0), [0.3, 0.3, 0.32], 1.6, rnd, 0.01);
      s.glass.box(0.22, 0.34, 0.22, V(lp.x, lp.y + 0.24, lp.z), V(0, 0, 0), [1, 1, 1], 1, rnd, 0);
      s.iron.prism([[0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]], 0, 0.22, 0, [0.3, 0.3, 0.32], 1.6, xform([lp.x, lp.y + 0.42, lp.z]));
      s.doorLamps.push({ x: lp.x, y: lp.y + 0.26, z: lp.z });
    }
    // 中殿的正面:一面高墙,上面是三角的山墙;正中是尖拱大门和玫瑰窗
    f.box(s.stone, 0, BY + 8.5, -1, 10.4, 17, 2, ST, 0.25, 0.04);
    f.face(s.stone, [[-5.2, BY + 17, 0], [5.2, BY + 17, 0], [0, BY + 23.5, 0]], 0.25, ST);
    f.box(s.stone, 0, BY + 24.4, -0.1, 0.22, 1.8, 0.22, SD, 0.25, 0.02);
    f.box(s.stone, 0, BY + 24.7, -0.1, 0.9, 0.2, 0.2, SD, 0.25, 0.02);
    for (const sd of [-1, 1]) {
      // 山墙的两条斜边压着一道石檐
      f.box(s.stone, sd * 2.6, BY + 20.3, 0.1, 0.5, 6.8 / YS, 0.5, SD, 0.25, 0.04, [0, 0, sd * 50.5]);
    }
    f.box(s.winDark, 0, BY + 2.5, 0.03, 3.2, 5.0, 0.06, [0.04, 0.035, 0.03], 1, 0);
    f.box(s.timber, 0, BY + 2.2, 0.06, 2.9, 4.4, 0.1, [0.4, 0.3, 0.22], 0.9, 0.02);
    f.box(s.iron, 0, BY + 2.2, 0.12, 0.06, 4.4, 0.03, [0.3, 0.3, 0.32], 1.6, 0);
    for (let k = 0; k < 3; k += 1) {
      f.box(s.iron, 0, BY + 0.9 + k * 1.3, 0.13, 2.8, 0.08, 0.03, [0.3, 0.3, 0.32], 1.6, 0);
    }
    // 大门的尖拱:两边各一串石块往中间收到尖顶,外面再套一圈
    for (const [rad, th] of [[2.0, 0.5], [2.6, 0.4]] as Array<[number, number]>) {
      for (const sd of [-1, 1]) {
        f.box(s.stone, sd * rad, BY + 2.1, 0.12, th, 4.2, 0.5, SD, 0.25, 0.03);
        for (let i = 0; i < 6; i += 1) {
          const t = (i + 0.5) / 6;
          const a = t * 1.15;
          const px = sd * (rad - (1 - Math.cos(a)) * rad * 1.05);
          const py = BY + 4.2 + Math.sin(a) * rad * 1.25;
          f.box(s.stone, px, py, 0.12, th, rad * 0.3, 0.5, SD, 0.25, 0.03, [0, 0, sd * (a * 180) / Math.PI * 0.8]);
        }
      }
    }
    f.pane(s.winRose, 0, BY + 12.2, 0.04, 5.0, 5.0 / YS);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      f.box(s.stone, Math.cos(a) * 2.7, BY + 12.2 + (Math.sin(a) * 2.7) / YS, 0.1, 1.15, 0.4 / YS, 0.4, SD, 0.25, 0.03, [0, 0, (a * 180) / Math.PI + 90]);
    }
    for (const sd of [-1, 1]) {
      f.pane(s.winLancet, sd * 3.9, BY + 5.4, 0.04, 1.1, 4.0);
      // 门两边垂下来的暗红旗幡
      f.box(s.iron, sd * 3.0, BY + 6.3, 0.5, 1.1, 0.05, 0.05, [0.3, 0.3, 0.32], 1.6, 0);
      f.pane(s.cloth, sd * 3.0, BY + 4.4, 0.52, 0.95, 3.7, [0.86, 0.8, 0.8]);
      f.pane(s.cloth, sd * 3.0, BY + 2.4, 0.52, 0.5, 0.5, [0.86, 0.8, 0.8]);
    }
    // 两座塔:比中殿正面往前凸一点;各三层尖窗;顶上一圈压檐石、四角的小尖塔、一座石板瓦的尖顶
    for (const sd of [-1, 1]) {
      const tx = sd * 7.7;
      f.box(s.stone, tx, BY + 13, -1.9, 5, 26, 5, ST, 0.25, 0.05);
      for (const [yy, hh, lit] of [[6.5, 3.6, true], [14, 3.6, true], [21.5, 3.4, false]] as Array<[number, number, boolean]>) {
        if (lit) {
          f.pane(s.winLancet, tx, BY + yy, 0.64, 1.15, hh);
        } else {
          f.box(s.winDark, tx, BY + yy, 0.62, 1.2, hh, 0.06, [0.03, 0.035, 0.05], 1, 0);
        }
        f.box(s.stone, tx, BY + yy - hh / 2 - 0.15, 0.7, 1.9, 0.26, 0.4, SD, 0.25, 0.03);
      }
      for (const yy of [9.4, 17.6]) {
        f.box(s.stone, tx, BY + yy, -1.9, 5.3, 0.4, 5.3, SD, 0.25, 0.04);
      }
      f.box(s.stone, tx, BY + 26.2, -1.9, 5.7, 0.5, 5.7, SD, 0.25, 0.05);
      const tp = f.P(tx, BY + 26.4, -1.9);
      s.slate.prism([[2.5, 2.5], [-2.5, 2.5], [-2.5, -2.5], [2.5, -2.5]], 0, 7.2, 0.02, [0.84, 0.88, 1], 0.42, xform([tp.x, tp.y, tp.z]));
      for (const [cx2, cz2] of [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]]) {
        f.box(s.stone, tx + cx2, BY + 27.6, -1.9 + cz2, 0.7, 2.6, 0.7, ST, 0.25, 0.03);
        const pp = f.P(tx + cx2, BY + 28.9, -1.9 + cz2);
        s.stone.prism([[0.42, 0.42], [-0.42, 0.42], [-0.42, -0.42], [0.42, -0.42]], 0, 2.2, 0.02, SD, 0.25, xform([pp.x, pp.y, pp.z]));
      }
      // 扶壁:贴在塔的外侧和内侧,下粗上细两段
      for (const bx of [tx + sd * 2.9, tx - sd * 2.9]) {
        f.box(s.stone, bx, BY + 5, 0.9, 1.0, 10, 1.4, SD, 0.25, 0.04);
        f.box(s.stone, bx, BY + 13, 0.75, 0.8, 6, 1.0, SD, 0.25, 0.04);
        const pp = f.P(bx, BY + 16, 0.75);
        s.stone.prism([[0.45, 0.55], [-0.45, 0.55], [-0.45, -0.55], [0.45, -0.55]], 0, 2.0, 0.02, SD, 0.25, xform([pp.x, pp.y, pp.z], [0, -90, 0]));
      }
      // 两侧的偏殿:矮一截,各两扇尖窗,单坡的石板瓦顶
      f.box(s.stone, sd * 13.4, BY + 4.6, -6, 6.4, 9.2, 12, ST, 0.25, 0.04);
      f.pane(s.winLancet, sd * 12.2, BY + 4.6, 0.04, 1.0, 3.6);
      f.pane(s.winLancet, sd * 14.6, BY + 4.6, 0.04, 1.0, 3.6);
      const xo = sd * 16.9;
      const xi = sd * 10.2;
      f.face(s.slate, sd > 0 ? [[xo, BY + 9.0, 0.3], [xo, BY + 9.0, -12.3], [xi, BY + 12.4, -12.3], [xi, BY + 12.4, 0.3]] : [[xo, BY + 9.0, -12.3], [xo, BY + 9.0, 0.3], [xi, BY + 12.4, 0.3], [xi, BY + 12.4, -12.3]], 0.42, SLATE);
    }
    // 后面的中殿:又高又长,人字顶
    f.box(s.stone, 0, BY + 9.5, -16, 12, 19, 28, ST, 0.25, 0.05);
    f.face(s.slate, [[-6.6, BY + 18.8, -30.4], [-6.6, BY + 18.8, -1.6], [0, BY + 25.4, -1.6], [0, BY + 25.4, -30.4]], 0.42, SLATE);
    f.face(s.slate, [[6.6, BY + 18.8, -1.6], [6.6, BY + 18.8, -30.4], [0, BY + 25.4, -30.4], [0, BY + 25.4, -1.6]], 0.42, SLATE);
    solid(27, 0, 7, 17, 30);
    solid(22.6, 0, 2.6, 6.5, 2);
  }

  // ── 教堂前的栏杆:一排石柱,柱间是铁栏;栏后面是柏树和一尊立像 ──
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const z = sd * (7.2 + i * 2.5);
      s.stone.box(0.7, 1.9, 0.7, V(CITY.X1 + 0.3, 0.95, z), V(0, 0, 0), [0.7, 0.71, 0.76], 0.25, rnd, 0.04);
      s.stone.box(0.9, 0.18, 0.9, V(CITY.X1 + 0.3, 1.98, z), V(0, 0, 0), [0.62, 0.63, 0.68], 0.25, rnd, 0.03);
      if (i < 3) {
        for (const yy of [0.5, 1.5]) {
          s.iron.box(0.04, 0.04, 2.5, V(CITY.X1 + 0.3, yy, z + sd * 1.25), V(0, 0, 0), [0.3, 0.3, 0.33], 1.6, rnd, 0);
        }
        for (let k = 1; k < 9; k += 1) {
          s.iron.box(0.03, 1.5, 0.03, V(CITY.X1 + 0.3, 0.95, z + sd * (k * 0.28)), V(0, 0, 0), [0.3, 0.3, 0.33], 1.6, rnd, 0);
        }
      }
    }
    solid(CITY.X1 + 0.3, sd * 11, 0.4, 4.2, 2);
    for (const [cx2, cz2, hh] of [[22.2, 7.8, 5.6], [22.4, 9.9, 4.8], [23.6, 13.4, 6.2]] as Array<[number, number, number]>) {
      s.bark.cylinder(0.1, 0.13, 0.9, 6, V(cx2, 0.45, sd * cz2), V(0, 0, 0), [0.4, 0.36, 0.32], 0.5, rnd);
      const oct: Array<[number, number]> = [];
      for (let k = 0; k < 8; k += 1) {
        oct.push([Math.cos((k / 8) * 6.283) * 0.8, Math.sin((k / 8) * 6.283) * 0.8]);
      }
      s.leaf.prism(oct, 0, hh * 0.35, 1.15, [0.06, 0.09, 0.07], 1, xform([cx2, 0.6, sd * cz2]), true);
      s.leaf.prism(oct.map(([a, b]) => [a * 1.15, b * 1.15] as [number, number]), 0, hh * 0.65, 0.04, [0.06, 0.09, 0.07], 1, xform([cx2, 0.6 + hh * 0.35, sd * cz2]), false);
    }
  }
  // 立像:石座上一个披着斗篷的人形(很概括:身子、头、一条抬起的手臂)
  s.stone.box(1.5, 1.8, 1.5, V(23.4, 0.9, -10.6), V(0, 0, 0), [0.66, 0.67, 0.72], 0.25, rnd, 0.05);
  s.stone.box(1.8, 0.24, 1.8, V(23.4, 1.92, -10.6), V(0, 0, 0), [0.6, 0.61, 0.66], 0.25, rnd, 0.04);
  s.stone.lathe([[0.5, 0], [0.46, 0.5], [0.34, 1.3], [0.3, 1.9], [0.22, 2.1], [0.0, 2.15]], 10, { xf: xform([23.4, 2.04, -10.6]), tint: [0.7, 0.71, 0.76], den: 0.25 });
  s.stone.ball(0.2, 0.24, 0.2, [23.4, 4.4, -10.6], 8, { tint: [0.72, 0.73, 0.78], den: 0.25 });
  s.stone.box(0.14, 0.9, 0.14, V(23.05, 3.6, -10.45), V(0, 0, 30), [0.7, 0.71, 0.76], 0.25, rnd, 0.03);

  // ── 水井:一圈石井栏、两根立柱撑着一个小顶棚、一根辘轳、一只桶 ──
  {
    const wx = -3.2;
    const wz = -8.2;
    s.stone.lathe([[1.0, 0], [1.02, 0.85], [0.92, 0.95], [0.7, 0.95], [0.68, 0.2], [0.0, 0.2]], 14, { xf: xform([wx, 0, wz]), tint: [0.72, 0.73, 0.78], den: 0.25, smooth: false });
    s.winDark.cylinder(0.68, 0.68, 0.02, 14, V(wx, 0.5, wz), V(0, 0, 0), [0.02, 0.025, 0.03], 1, rnd);
    for (const sd of [-1, 1]) {
      s.timber.box(0.16, 2.9, 0.16, V(wx + sd * 1.0, 1.45, wz), V(0, 0, 0), [0.42, 0.37, 0.32], 0.9, rnd, 0.015);
    }
    s.timber.cylinder(0.07, 0.07, 2.0, 8, V(wx, 1.9, wz), V(0, 0, 90), [0.4, 0.35, 0.3], 0.9, rnd);
    s.iron.cylinder(0.01, 0.01, 0.9, 4, V(wx, 1.45, wz), V(0, 0, 0), [0.4, 0.4, 0.42], 1.6, rnd);
    s.timber.cylinder(0.16, 0.13, 0.3, 9, V(wx, 1.0, wz), V(0, 0, 0), [0.46, 0.4, 0.34], 0.9, rnd);
    const f = frame(wx, wz, 0);
    f.face(s.slate, [[-1.5, 2.8, 1.1], [1.5, 2.8, 1.1], [1.5, 3.6, 0], [-1.5, 3.6, 0]], 0.42, SLATE);
    f.face(s.slate, [[1.5, 2.8, -1.1], [-1.5, 2.8, -1.1], [-1.5, 3.6, 0], [1.5, 3.6, 0]], 0.42, SLATE);
    f.box(s.timber, 0, 2.86, 0, 2.6, 0.12, 0.14, TIMBER, 0.9, 0.01);
    solid(wx, wz, 1.1, 1.1, 3);
  }

  // ── 集市摊位(南边):四根木柱、一张案台、后面一排架子,上面斜搭一块暗红的篷布;案上摆着筐和货,旁边堆着麻袋和木桶 ──
  const stall = (ox: number, oz: number, yaw: number, w: number): void => {
    const f = frame(ox, oz, yaw);
    for (const [px, pz, ph] of [[-w / 2, 1.0, 2.2], [w / 2, 1.0, 2.2], [-w / 2, -1.0, 2.9], [w / 2, -1.0, 2.9]] as Array<[number, number, number]>) {
      f.box(s.timber, px, ph / 2, pz, 0.12, ph, 0.12, [0.42, 0.37, 0.32], 0.9, 0.012);
    }
    f.box(s.timber, 0, 0.45, 0.55, w - 0.1, 0.9, 0.9, [0.46, 0.4, 0.34], 0.9, 0.02);
    f.box(s.timber, 0, 0.94, 0.55, w + 0.1, 0.08, 1.05, [0.5, 0.44, 0.37], 0.9, 0.015);
    f.box(s.timber, 0, 1.3, -0.85, w - 0.2, 0.06, 0.4, [0.44, 0.38, 0.33], 0.9, 0.01);
    // 篷布:前低后高,中间往下垂一点;前沿垂下一条布边
    s.cloth.surf(8, 5, (u2, v2, out) => {
      const lx = (u2 - 0.5) * (w + 0.7);
      const lz = 1.45 - v2 * 2.8;
      const ly = 2.25 + v2 * 0.72 - Math.sin(v2 * Math.PI) * 0.12 - Math.sin(u2 * Math.PI) * 0.07;
      out.set(f.P(lx, ly, lz));
    }, { tint: (u2: number, v2: number) => { const t = 0.8 + 0.2 * Math.sin(u2 * 31 + v2 * 5); return [t, t * 0.94, t * 0.94] as Tint; }, den: 1.2, twoSided: true });
    f.pane(s.cloth, 0, 2.08, 1.46, w + 0.7, 0.32, [0.7, 0.64, 0.64]);
    // 货:三只筐(里面一堆小圆果子)、一摞布
    for (let i = 0; i < 3; i += 1) {
      const bx = -w / 2 + 0.6 + i * ((w - 1.2) / 2);
      const bp = f.P(bx, 0.98, 0.55);
      s.goods.lathe([[0.0, 0], [0.2, 0], [0.27, 0.18], [0.25, 0.2], [0.0, 0.14]], 10, { xf: xform([bp.x, bp.y, bp.z]), tint: [0.4, 0.3, 0.2] });
      const col: Tint = i === 0 ? [0.5, 0.12, 0.08] : i === 1 ? [0.6, 0.45, 0.14] : [0.3, 0.36, 0.14];
      for (let k = 0; k < 9; k += 1) {
        const a = R(0, 6.28);
        const rr = R(0, 0.16);
        s.goods.ball(0.055, 0.05, 0.055, [bp.x + Math.cos(a) * rr, bp.y + 0.2 + R(0, 0.06), bp.z + Math.sin(a) * rr], 5, { tint: [col[0] * R(0.8, 1.1), col[1] * R(0.8, 1.1), col[2]] });
      }
    }
    for (let i = 0; i < 3; i += 1) {
      const sp = f.P(-w / 2 - 0.5 + R(-0.2, 0.2), 0.2 + (i === 2 ? 0.36 : 0), 0.9 + (i % 2) * 0.5);
      s.goods.ball(0.3, 0.2, 0.24, [sp.x, sp.y, sp.z], 8, { tint: [0.44, 0.4, 0.32] });
    }
    const bp2 = f.P(w / 2 + 0.55, 0, 0.8);
    s.timber.lathe([[0.0, 0], [0.24, 0], [0.3, 0.24], [0.315, 0.45], [0.3, 0.66], [0.24, 0.9], [0.21, 0.87], [0.0, 0.87]], 12, { xf: xform([bp2.x, 0, bp2.z]), tint: [0.5, 0.44, 0.36], den: 0.9, smooth: false });
    for (const yy of [0.2, 0.7]) {
      s.iron.cylinder(0.3, 0.3, 0.045, 14, V(bp2.x, yy, bp2.z), V(0, 0, 0), [0.36, 0.36, 0.38], 1.6, rnd, undefined, false);
    }
    const c = f.P(0, 0, 0.3);
    solid(c.x, c.z, w / 2 + 0.5, 1.3, 2.4);
    s.npcs.push({ x: f.P(-w * 0.2, 0, 2.2).x, z: f.P(-w * 0.2, 0, 2.2).z, yaw: 0 });
  };
  stall(2.6, CITY.Z1 - 1.8, 180, 3.6);
  stall(8.2, CITY.Z1 - 1.5, 180, 3.8);
  stall(13.8, CITY.Z1 - 1.3, 180, 3.4);
  // 镇民:两个站在摊位前(面朝摊位),一个在井边(面朝井)。角色模型面朝 +x 时 yaw = 0
  s.npcs.forEach((n) => { n.yaw = -90; });
  s.npcs.push({ x: -1.4, z: -7.2, yaw: 151 });

  // ── 路灯:铸铁的灯柱,顶上一只四面玻璃的灯 ──
  const lamp = (x: number, z: number): void => {
    s.iron.cylinder(0.16, 0.2, 0.3, 10, V(x, 0.15, z), V(0, 0, 0), [0.26, 0.26, 0.28], 1.6, rnd, 0);
    s.iron.cylinder(0.09, 0.12, 0.5, 8, V(x, 0.55, z), V(0, 0, 0), [0.26, 0.26, 0.28], 1.6, rnd);
    s.iron.cylinder(0.045, 0.06, 2.6, 8, V(x, 2.1, z), V(0, 0, 0), [0.26, 0.26, 0.28], 1.6, rnd);
    s.iron.cylinder(0.14, 0.05, 0.12, 8, V(x, 3.44, z), V(0, 0, 0), [0.26, 0.26, 0.28], 1.6, rnd);
    s.glass.prism([[0.17, 0.17], [-0.17, 0.17], [-0.17, -0.17], [0.17, -0.17]], 0, 0.42, 1.25, [1, 1, 1], 1, xform([x, 3.5, z]));
    s.iron.prism([[0.26, 0.26], [-0.26, 0.26], [-0.26, -0.26], [0.26, -0.26]], 0, 0.24, 0.1, [0.26, 0.26, 0.28], 1.6, xform([x, 3.92, z]));
    s.iron.cylinder(0.02, 0.03, 0.14, 5, V(x, 4.22, z), V(0, 0, 0), [0.26, 0.26, 0.28], 1.6, rnd);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      s.iron.box(0.02, 0.44, 0.02, V(x + ox * 0.19, 3.71, z + oz * 0.19), V(ox * 6, 0, -oz * 6), [0.26, 0.26, 0.28], 1.6, rnd, 0);
    }
    s.lamps.push({ x, y: 3.7, z });
    solid(x, z, 0.2, 0.2, 4);
  };
  lamp(-9.2, -11.2);
  lamp(-9.4, 10.2);
  lamp(11.2, 8.6);
  lamp(11.4, -10.6);

  // ── 枫树:叶子快掉光了,只在梢头剩几片红叶 ──
  const maple = (x: number, z: number, h: number, r0: number, seed: number): void => {
    const lean = [R(-0.1, 0.1), R(-0.1, 0.1)];
    const wob = [R(0, 6.28), R(0, 6.28)];
    const at = (t: number): Vec3 => V(x + lean[0] * h * t + Math.sin(wob[0] + t * 4) * 0.012 * h * t, h * t, z + lean[1] * h * t + Math.cos(wob[1] + t * 3.3) * 0.012 * h * t);
    const trunk: Vec3[] = [];
    for (let i = 0; i <= 9; i += 1) {
      trunk.push(at((i / 9) * 0.82));
    }
    trunk[0].y = -0.1;
    const tone = R(0.5, 0.66);
    const tint: Tint = [tone, tone * 0.96, tone * 0.92];
    s.bark.tube(trunk, (t) => r0 * (1 - 0.7 * t) * (1 + 0.6 * Math.max(0, 1 - t * 9) ** 2), 9, { tint, den: 0.5 });
    const tips: Vec3[] = [];
    const limb = (base: Vec3, dir: Vec3, len: number, rad: number, depth: number): void => {
      const pts: Vec3[] = [base.clone()];
      const d = dir.clone();
      const p = base.clone();
      for (let i = 0; i < 4; i += 1) {
        d.x += R(-0.25, 0.25);
        d.z += R(-0.25, 0.25);
        d.y += R(0.0, 0.16);
        d.normalize();
        p.add3f(d.x * (len / 4), d.y * (len / 4), d.z * (len / 4));
        pts.push(p.clone());
        if (depth > 0 && i >= 1 && rnd() < 0.85) {
          const side = V(d.z + R(-0.5, 0.5), R(0.05, 0.6), -d.x + R(-0.5, 0.5)).normalize();
          if (rnd() < 0.5) {
            side.x = -side.x;
            side.z = -side.z;
          }
          limb(p.clone(), side, len * R(0.42, 0.62), rad * 0.5, depth - 1);
        }
      }
      s.bark.tube(pts, (t) => Math.max(0.006, rad * (1 - 0.86 * t)), depth > 0 ? 6 : 4, { tint, den: 0.6 });
      tips.push(pts[pts.length - 1], pts[pts.length - 2]);
    };
    const n = 6 + Math.floor(R(0, 3));
    for (let i = 0; i < n; i += 1) {
      const t = 0.3 + (0.5 * (i + R(0, 0.6))) / n;
      const a = seed * 1.7 + i * 2.4 + R(-0.4, 0.4);
      limb(at(t), V(Math.cos(a), 0.35 + 0.5 * t, Math.sin(a)).normalize(), h * (0.5 - 0.22 * t) * R(0.8, 1.2), r0 * (1 - 0.7 * t) * 0.6, 2);
    }
    // 红叶:梢头零星几片,每片是一个小菱形(正反两面)
    for (const tp of tips) {
      const k = rnd() < 0.6 ? 1 + Math.floor(R(0, 5)) : 0;
      for (let i = 0; i < k; i += 1) {
        const c = V(tp.x + R(-0.25, 0.25), tp.y + R(-0.25, 0.1), tp.z + R(-0.25, 0.25));
        const a = R(0, 6.28);
        const tl = R(-0.5, 0.5);
        const sz = R(0.1, 0.17);
        const ux = Math.cos(a) * sz;
        const uz = Math.sin(a) * sz;
        const q = [V(c.x - ux, c.y - tl * sz, c.z - uz), V(c.x - uz * 0.6, c.y - sz * 0.5, c.z + ux * 0.6), V(c.x + ux, c.y + tl * sz, c.z + uz), V(c.x + uz * 0.6, c.y + sz * 0.5, c.z - ux * 0.6)];
        const col: Tint = [R(0.4, 0.62), R(0.07, 0.16), R(0.04, 0.08)];
        s.leaf.facet(q, [[0, 0], [1, 0], [1, 1], [0, 1]], col);
        s.leaf.facet([q[3], q[2], q[1], q[0]], [[0, 1], [1, 1], [1, 0], [0, 0]], col);
      }
    }
    // 树脚一圈石头围的树池
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * 6.283;
      s.stone.box(0.5, 0.22, 0.3, V(x + Math.cos(a) * 0.95, 0.11, z + Math.sin(a) * 0.95), V(0, -(a * 180) / Math.PI + 90, 0), [0.6, 0.61, 0.66], 0.25, rnd, 0.03);
    }
    solid(x, z, r0 * 1.3, r0 * 1.3, h);
  };
  TREES.forEach(([x, z, h], i) => maple(x, z, h, 0.3 + (h - 7) * 0.045, i + 1));

  // ── 零碎:铁匠铺门口的木桶、南边的一辆板车(简化:车板 + 两只实心轮)、几只木箱 ──
  for (const [bx, bz, k] of [[-17.6, -12.6, 1], [-16.9, -12.9, 0.85], [-5.4, -13.0, 1]] as Array<[number, number, number]>) {
    s.timber.lathe([[0.0, 0], [0.24 * k, 0], [0.3 * k, 0.24 * k], [0.315 * k, 0.45 * k], [0.3 * k, 0.66 * k], [0.24 * k, 0.9 * k], [0.21 * k, 0.87 * k], [0.0, 0.87 * k]], 12, { xf: xform([bx, 0, bz]), tint: [0.5, 0.44, 0.36], den: 0.9, smooth: false });
    for (const yy of [0.2, 0.7]) {
      s.iron.cylinder(0.3 * k, 0.3 * k, 0.045, 14, V(bx, yy * k, bz), V(0, 0, 0), [0.36, 0.36, 0.38], 1.6, rnd, undefined, false);
    }
    solid(bx, bz, 0.3, 0.3, 0.9);
  }
  for (const [cx2, cz2, sz, yw] of [[18.2, 12.6, 0.7, 12], [17.4, 12.9, 0.55, -20], [-18.6, 6.2, 0.7, 8]] as Array<[number, number, number, number]>) {
    s.timber.box(sz, sz * 0.8, sz, V(cx2, sz * 0.4, cz2), V(0, yw, 0), [0.5, 0.45, 0.38], 0.9, rnd, 0.012);
    solid(cx2, cz2, sz / 2, sz / 2, sz);
  }
  return s;
}
