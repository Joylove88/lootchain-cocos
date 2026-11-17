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
// 前两棵在主角进广场的位置两侧:树干在画面外,枝条从左上、右上探进画面(原型的构图)
const TREES: Array<[number, number, number]> = [[-17.5, -6.5, 12], [-11.5, 9.6, 11.5], [4.5, -12.8, 8.4], [17.2, -12.2, 8.8], [-4.6, 12.4, 8.6], [18.6, 11.9, 8.6], [-19.6, -16.8, 9.5]];
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
  /** 铁匠铺的烟囱口(烟从这里冒)。 */
  smoke: { x: number; y: number; z: number };
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
    solids: [], lamps: [], doorLamps: [], forge: { x: -10, y: 1.0, z: -13.2 }, smoke: { x: -6, y: 11, z: -11 }, npcs: [], plan: CITY_PLAN,
  };
  const R = (a: number, b: number): number => a + (b - a) * rnd();
  const solid = (x: number, z: number, hx: number, hz: number, h: number): void => {
    s.solids.push({ x, z, hx, hz, h });
  };

  /**
   * 一个「本地坐标架」:原点放在 (ox, oz),绕 y 转 yaw 度。本地的 +z 是正面朝外的方向,+x 是沿着正面往右。
   * 房子、摊位、教堂都在自己的本地坐标里搭,再整个摆到广场边上。
   */
  const frame = (ox: number, oz: number, yaw: number, ys = 1, hs = 1) => {
    // ys / hs = 高度 / 水平尺寸整体乘几倍(教堂按「正面比例」搭好之后整体缩小,省得每个数重算)
    const ca = Math.cos((yaw * Math.PI) / 180);
    const sa = Math.sin((yaw * Math.PI) / 180);
    const P = (lx: number, ly: number, lz: number): Vec3 => V(ox + (lx * ca + lz * sa) * hs, ly * ys, oz + (-lx * sa + lz * ca) * hs);
    const box = (b: Sculpt, lx: number, ly: number, lz: number, w: number, h: number, d: number, tint: Tint, den: number, bevel = 0.02, rot: [number, number, number] = [0, 0, 0]): void => {
      b.box(w * hs, h * ys, d * hs, P(lx, ly, lz), V(rot[0], yaw + rot[1], rot[2]), tint, den, rnd, bevel);
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
  const TIMBER: Tint = [0.25, 0.22, 0.2];
  const SLATE: Tint = [0.72, 0.74, 0.82];

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

  const HS: Tint = [0.64, 0.64, 0.68];
  /** 一块斜着的地方(铁匠铺)挡路:碰撞只认正放的方块,所以切成小格,每格登记一个。 */
  const solidRot = (f: Frame, x0: number, x1: number, z0: number, z1: number, h: number): void => {
    const nx = Math.max(1, Math.round((x1 - x0) / 2));
    const nz = Math.max(1, Math.round((z1 - z0) / 2));
    const cw = (x1 - x0) / nx;
    const cd = (z1 - z0) / nz;
    const ca = Math.abs(Math.cos((f.yaw * Math.PI) / 180));
    const sa = Math.abs(Math.sin((f.yaw * Math.PI) / 180));
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const c = f.P(x0 + (i + 0.5) * cw, 0, z0 + (j + 0.5) * cd);
        solid(c.x, c.z, (cw * ca + cd * sa) / 2, (cw * sa + cd * ca) / 2, h);
      }
    }
  };
  /**
   * 屋面上的老虎窗:一小面墙 + 一扇窗 + 自己的小人字顶,两侧和顶都接回主屋面。
   * zd = 窗墙在本地的 z,y0 = 主屋面在 zd 处的高度,m = 主屋面的坡度(每往后 1 米升多少)。
   */
  const dormer = (f: Frame, dx: number, zd: number, y0: number, m: number, PL: Tint, lit: boolean): void => {
    const hw = 0.62;
    const wh = 1.2;
    const rh = 0.62;
    const zs = zd - wh / m;
    f.box(s.plaster, dx, y0 + wh / 2, zd - 0.05, hw * 2, wh, 0.1, PL, 0.3, 0.01);
    windowAt(f, dx, y0 + wh * 0.52, zd, 0.66, 0.76, lit);
    for (const sd of [-1, 1]) {
      const xe = dx + sd * hw;
      f.face(s.plaster, sd > 0 ? [[xe, y0, zd], [xe, y0 + wh, zs], [xe, y0 + wh, zd]] : [[xe, y0, zd], [xe, y0 + wh, zd], [xe, y0 + wh, zs]], 0.3, PL);
    }
    const yr = y0 + wh + rh;
    const ye = y0 + wh - 0.05;
    const zf2 = zd + 0.24;
    const ze = zd - (wh - 0.05) / m;
    const zr = zd - (wh + rh) / m;
    const he = hw + 0.22;
    f.face(s.slate, [[dx - he, ye, zf2], [dx, yr, zf2], [dx, yr, zr], [dx - he, ye, ze]], 0.42, SLATE);
    f.face(s.slate, [[dx, yr, zf2], [dx + he, ye, zf2], [dx + he, ye, ze], [dx, yr, zr]], 0.42, SLATE);
    f.face(s.plaster, [[dx - hw, y0 + wh, zd], [dx + hw, y0 + wh, zd], [dx, yr - 0.08, zd]], 0.3, PL);
    const len = Math.hypot(he, yr - ye) + 0.1;
    const ang = (Math.atan2(yr - ye, he) * 180) / Math.PI;
    for (const sd of [-1, 1]) {
      f.box(s.timber, dx + sd * (he / 2), (ye + yr) / 2, zf2, len, 0.1, 0.08, TIMBER, 0.9, 0.01, [0, 0, -sd * ang]);
    }
  };

  /**
   * 一栋半木结构的房子:底层砌石(或灰泥),上面一两层灰泥墙 + 外露的木构架(往外挑出一点、底下有木托),陡的石板瓦人字顶。
   * gableFront = 山墙朝着广场(屋脊垂直于正面);否则屋檐朝着广场,屋面上开老虎窗。lit = 亮几扇窗。
   * 第三轮(用户:「建筑还是需要打磨一下,还原型不像」):屋顶加陡、加封檐板 / 博风板 / 屋脊、加老虎窗、木构架加密、门加门框和石阶、烟囱加烟囱帽。
   */
  const house = (ox: number, oz: number, yaw: number, w: number, d: number, o: { upper?: number; gableFront?: boolean; lit?: number; door?: number; stoneGround?: boolean; tone?: number; dormers?: number }): Frame => {
    const f = frame(ox, oz, yaw);
    const g = 3.0;
    const u = 2.7;
    const upper = o.upper ?? 1;
    const jet = 0.35;
    const tone = o.tone ?? R(0.82, 1.0);
    const PL: Tint = [tone, tone * 0.98, tone * 0.95];
    const DS = 0.5;
    // 底层
    f.box(o.stoneGround === false ? s.plaster : s.stone, 0, g / 2, -d / 2, w, g, d, o.stoneGround === false ? PL : HS, o.stoneGround === false ? 0.3 : DS, 0.03);
    f.box(s.stone, 0, 0.2, -d / 2 + 0.06, w + 0.2, 0.4, d + 0.12, [0.52, 0.52, 0.56], DS, 0.04);
    const doorX = o.door ?? R(-w * 0.25, w * 0.25);
    f.box(s.timber, doorX, 1.08, 0.02, 1.15, 2.16, 0.1, [0.4, 0.32, 0.25], 0.9, 0.02);
    for (const sd of [-1, 1]) {
      f.box(s.timber, doorX + sd * 0.66, 1.14, 0.05, 0.15, 2.28, 0.16, TIMBER, 0.9, 0.012);
    }
    f.box(s.timber, doorX, 2.34, 0.06, 1.62, 0.2, 0.2, TIMBER, 0.9, 0.012);
    f.box(s.stone, doorX, 0.09, 0.32, 1.7, 0.18, 0.62, [0.56, 0.56, 0.6], DS, 0.03);
    f.box(s.iron, doorX + 0.38, 1.05, 0.09, 0.05, 0.16, 0.04, [0.5, 0.5, 0.52], 1.6, 0);
    for (const yy of [0.55, 1.7]) {
      f.box(s.iron, doorX - 0.2, yy, 0.085, 0.7, 0.06, 0.02, [0.3, 0.3, 0.32], 1.6, 0);
    }
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
      // 挑檐底下的木托
      f.box(s.timber, px, g - 0.17, zf / 2 + 0.03, 0.15, 0.3, zf + 0.06, TIMBER, 0.9, 0.012);
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
          f.box(s.timber, cxb, yc - 0.98, zf + 0.02, 0.11, u / 2 - 0.76, 0.1, TIMBER, 0.9, 0.01);
        } else {
          // 不开窗的开间:一道横木,上下各一根短柱
          f.box(s.timber, cxb, yc - 0.3, zf + 0.02, bw, 0.12, 0.1, TIMBER, 0.9, 0.01);
          f.box(s.timber, cxb, yc - 0.3 - (u / 2 - 0.3) / 2, zf + 0.02, 0.11, u / 2 - 0.3, 0.1, TIMBER, 0.9, 0.01);
          f.box(s.timber, cxb, yc - 0.3 + (u / 2 + 0.3) / 2, zf + 0.02, 0.11, u / 2 + 0.3, 0.1, TIMBER, 0.9, 0.01);
        }
      }
    }
    // 屋顶
    const hw = w / 2 + 0.5;
    const zb = -d - 0.45;
    const zfo = zf + 0.5;
    const RIDGE: Tint = [0.62, 0.64, 0.72];
    let roofAt: (x: number) => number;
    if (o.gableFront) {
      const ridge = top + w * 0.56;
      roofAt = (x: number): number => ridge - (Math.abs(x) / hw) * (ridge - top + 0.15);
      f.face(s.slate, [[-hw, top - 0.15, zb], [-hw, top - 0.15, zfo], [0, ridge, zfo], [0, ridge, zb]], 0.42, SLATE);
      f.face(s.slate, [[hw, top - 0.15, zfo], [hw, top - 0.15, zb], [0, ridge, zb], [0, ridge, zfo]], 0.42, SLATE);
      // 山墙:灰泥的三角 + 中间一根立柱、一道横木、两根斜撑
      const gr = ridge - (0.58 / hw) * (ridge - top + 0.15) - 0.2;
      f.face(s.plaster, [[-w / 2 - 0.08, top, zf], [w / 2 + 0.08, top, zf], [0, gr, zf]], 0.3, PL);
      f.face(s.plaster, [[w / 2 + 0.08, top, -d], [-w / 2 - 0.08, top, -d], [0, gr, -d]], 0.3, PL);
      f.box(s.timber, 0, (top + gr) / 2 - 0.1, zf + 0.02, 0.16, gr - top - 0.3, 0.12, TIMBER, 0.9, 0.01);
      const ty = top + (gr - top) * 0.52;
      f.box(s.timber, 0, ty, zf + 0.02, w * (1 - 0.52) - 0.3, 0.14, 0.1, TIMBER, 0.9, 0.01);
      for (const sd of [-1, 1]) {
        f.box(s.timber, sd * w * 0.14, top + (ty - top) / 2, zf + 0.02, 0.12, ty - top, 0.1, TIMBER, 0.9, 0.01);
        f.box(s.timber, sd * w * 0.3, top + (ty - top) * 0.3, zf + 0.02, 0.12, (ty - top) * 0.6, 0.1, TIMBER, 0.9, 0.01);
      }
      const slope = Math.hypot(hw, ridge - top + 0.15);
      const ang = (Math.atan2(ridge - top + 0.15, hw) * 180) / Math.PI;
      for (const sd of [-1, 1]) {
        for (const zz of [zfo, zb]) {
          f.box(s.timber, sd * (hw / 2), (top - 0.15 + ridge) / 2, zz, slope + 0.2, 0.24, 0.12, [0.3, 0.27, 0.24], 0.9, 0.01, [0, 0, sd * -ang]);
        }
        f.box(s.timber, sd * (hw - 0.05), top - 0.22, (zfo + zb) / 2, 0.12, 0.18, zfo - zb, TIMBER, 0.9, 0.01);
      }
      f.box(s.slate, 0, ridge + 0.03, (zfo + zb) / 2, 0.32, 0.14, zfo - zb + 0.1, RIDGE, 0.42, 0.02);
      if (litLeft > 0 || rnd() < 0.5) {
        windowAt(f, 0, top + (ty - top) * 0.5, zf + 0.04, 0.8, 0.95, rnd() < 0.7);
      }
    } else {
      const zc = (zf - d) / 2;
      const ridge = top + (d + zf) * 0.54;
      roofAt = (): number => ridge;
      f.face(s.slate, [[-hw, top - 0.15, zfo], [hw, top - 0.15, zfo], [hw, ridge, zc], [-hw, ridge, zc]], 0.42, SLATE);
      f.face(s.slate, [[hw, top - 0.15, zb], [-hw, top - 0.15, zb], [-hw, ridge, zc], [hw, ridge, zc]], 0.42, SLATE);
      const run = zfo - zc;
      const rise = ridge - top + 0.15;
      const blen = Math.hypot(run, rise) + 0.2;
      const bang = (Math.atan2(rise, run) * 180) / Math.PI;
      for (const sd of [-1, 1]) {
        const xe = sd * (w / 2 + 0.08);
        const tri: Array<[number, number, number]> = sd > 0 ? [[xe, top, zf], [xe, top, -d], [xe, ridge - 0.25, zc]] : [[xe, top, -d], [xe, top, zf], [xe, ridge - 0.25, zc]];
        f.face(s.plaster, tri, 0.3, PL);
        // 两头山墙的博风板
        f.box(s.timber, sd * hw, top - 0.15 + rise / 2, (zfo + zc) / 2, 0.12, 0.24, blen, [0.3, 0.27, 0.24], 0.9, 0.01, [bang, 0, 0]);
        f.box(s.timber, sd * hw, top - 0.15 + rise / 2, (zb + zc) / 2, 0.12, 0.24, blen, [0.3, 0.27, 0.24], 0.9, 0.01, [-bang, 0, 0]);
      }
      f.box(s.timber, 0, top - 0.2, zfo - 0.06, w + 1.0, 0.18, 0.14, TIMBER, 0.9, 0.01);
      f.box(s.slate, 0, ridge + 0.03, zc, w + 1.1, 0.14, 0.32, RIDGE, 0.42, 0.02);
      // 老虎窗
      const m = rise / run;
      const nd = o.dormers ?? Math.max(1, Math.round(w / 5));
      for (let i = 0; i < nd; i += 1) {
        const zd = zf + 0.06;
        dormer(f, -w / 2 + (w * (i + 0.5)) / nd, zd, top - 0.15 + (zfo - zd) * m, m, PL, rnd() < 0.55);
      }
    }
    // 烟囱:穿出屋面一截,顶上一圈压顶和两只烟囱帽
    const chx = R(-w * 0.3, w * 0.3);
    const cht = roofAt(chx) + 1.3;
    f.box(s.stone, chx, (top + cht) / 2, -d * 0.55, 0.8, cht - top, 0.8, [0.6, 0.6, 0.64], DS, 0.03);
    f.box(s.stone, chx, cht + 0.1, -d * 0.55, 1.0, 0.24, 1.0, [0.52, 0.52, 0.56], DS, 0.03);
    for (const sd of [-1, 1]) {
      const cp = f.P(chx + sd * 0.2, cht + 0.42, -d * 0.55);
      s.stone.cylinder(0.1, 0.13, 0.4, 8, cp, V(0, 0, 0), [0.42, 0.34, 0.3], DS, rnd);
    }
    return f;
  };

  // ── 北边一排:铁匠铺、两栋房子;南边一排;西边两栋,中间留街口 ──
  /** 一只木桶(k = 大小)。 */
  const barrel = (bx: number, bz: number, k: number): void => {
    s.timber.lathe([[0.0, 0], [0.24 * k, 0], [0.3 * k, 0.24 * k], [0.315 * k, 0.45 * k], [0.3 * k, 0.66 * k], [0.24 * k, 0.9 * k], [0.21 * k, 0.87 * k], [0.0, 0.87 * k]], 12, { xf: xform([bx, 0, bz]), tint: [0.5, 0.44, 0.36], den: 0.9, smooth: false });
    for (const yy of [0.2, 0.7]) {
      s.iron.cylinder(0.3 * k, 0.3 * k, 0.045, 14, V(bx, yy * k, bz), V(0, 0, 0), [0.36, 0.36, 0.38], 1.6, rnd, undefined, false);
    }
    solid(bx, bz, 0.3 * k, 0.3 * k, 0.9 * k);
  };
  // 铁匠铺(第三轮):照原型拆成两截,整栋斜过来 30°、正面朝着进广场的方向(第二轮它顺着视线摆,一进广场只看到一面长墙) ——
  // 左边是山墙朝外的主屋(门、招牌),右边矮一截的是石砌的炉房(拱形的炉口、老虎窗、粗烟囱)
  const SMY = -30;
  const G = frame(-11.8, -11.8, SMY);
  {
    const mp = G.P(-3.5, 0, 0);
    house(mp.x, mp.z, SMY, 8, 8, { upper: 1, gableFront: true, lit: 3, door: -1.6, tone: 0.9 });
    solidRot(G, -7.6, 7.4, -8, 0.4, 6);
    // 炉房:石墙,屋檐朝外的陡屋顶
    const wp = G.P(3.9, 0, 0);
    const W = frame(wp.x, wp.z, SMY);
    const WS: Tint = [0.6, 0.6, 0.64];
    W.box(s.stone, 0, 1.85, -3.5, 6.8, 3.7, 7, WS, 0.5, 0.04);
    W.box(s.stone, 0, 0.2, -3.44, 7.0, 0.4, 7.12, [0.5, 0.5, 0.54], 0.5, 0.04);
    const ey = 3.6;
    const ry = 8.0;
    const zf0 = 0.75;
    const zb0 = -7.75;
    const zc0 = -3.5;
    const hw0 = 3.85;
    W.face(s.slate, [[-hw0, ey, zf0], [hw0, ey, zf0], [hw0, ry, zc0], [-hw0, ry, zc0]], 0.42, SLATE);
    W.face(s.slate, [[hw0, ey, zb0], [-hw0, ey, zb0], [-hw0, ry, zc0], [hw0, ry, zc0]], 0.42, SLATE);
    const wlen = Math.hypot(zf0 - zc0, ry - ey) + 0.2;
    const wang = (Math.atan2(ry - ey, zf0 - zc0) * 180) / Math.PI;
    for (const sd of [-1, 1]) {
      const xe = sd * 3.42;
      W.face(s.stone, sd > 0 ? [[xe, 3.7, 0], [xe, 3.7, -7], [xe, ry - 0.3, zc0]] : [[xe, 3.7, -7], [xe, 3.7, 0], [xe, ry - 0.3, zc0]], 0.5, WS);
      W.box(s.timber, sd * hw0, (ey + ry) / 2, (zf0 + zc0) / 2, 0.12, 0.24, wlen, [0.3, 0.27, 0.24], 0.9, 0.01, [wang, 0, 0]);
      W.box(s.timber, sd * hw0, (ey + ry) / 2, (zb0 + zc0) / 2, 0.12, 0.24, wlen, [0.3, 0.27, 0.24], 0.9, 0.01, [-wang, 0, 0]);
    }
    W.box(s.timber, 0, ey - 0.06, zf0 - 0.06, 7.7, 0.18, 0.14, TIMBER, 0.9, 0.01);
    W.box(s.slate, 0, ry + 0.03, zc0, 7.8, 0.14, 0.32, [0.62, 0.64, 0.72], 0.42, 0.02);
    const wm = (ry - ey) / (zf0 - zc0);
    dormer(W, 1.9, 0.06, ey + (zf0 - 0.06) * wm, wm, [0.86, 0.84, 0.8], true);
    windowAt(W, 2.6, 2.0, 0.02, 0.7, 0.9, true);
    // 锻炉:拱形的炉口(黑洞洞的,里面是炭火),上面一道石砌的烟罩
    const FX = -0.4;
    W.box(s.winDark, FX, 1.25, 0.03, 2.6, 2.3, 0.06, [0.03, 0.03, 0.035], 1, 0);
    for (let i = 0; i <= 8; i += 1) {
      const an = (i / 8) * Math.PI;
      W.box(s.stone, FX - Math.cos(an) * 1.5, 1.2 + Math.sin(an) * 1.5, 0.08, 0.5, 0.42, 0.3, [0.7, 0.7, 0.74], 0.5, 0.03, [0, 0, 90 - (an * 180) / Math.PI]);
    }
    for (const sd of [-1, 1]) {
      W.box(s.stone, FX + sd * 1.5, 0.6, 0.08, 0.5, 1.2, 0.3, [0.7, 0.7, 0.74], 0.5, 0.03);
    }
    W.box(s.stone, FX, 0.45, -0.25, 2.3, 0.9, 0.8, [0.46, 0.46, 0.5], 0.5, 0.03);
    s.coal.box(1.7, 0.1, 0.5, W.P(FX, 0.94, -0.2), V(0, SMY, 0), [1, 1, 1], 1, rnd, 0);
    s.forge = { x: W.P(FX, 1.2, 0.5).x, y: 1.2, z: W.P(FX, 1.2, 0.5).z };
    W.box(s.stone, FX, 3.28, 0.12, 4.0, 0.56, 0.32, [0.54, 0.54, 0.58], 0.5, 0.04);
    // 屋后一根粗烟囱(烟从这里冒)
    W.box(s.stone, 2.0, 7.0, -5.2, 1.5, 6.6, 1.4, [0.58, 0.58, 0.62], 0.5, 0.04);
    W.box(s.stone, 2.0, 10.4, -5.2, 1.8, 0.3, 1.7, [0.5, 0.5, 0.54], 0.5, 0.03);
    s.smoke = { x: W.P(2.0, 10.7, -5.2).x, y: 10.7, z: W.P(2.0, 10.7, -5.2).z };
  }
  {
    // 门口的东西,沿着正面从左到右:梯子、门、门灯、招牌、两只桶、工作台、铁砧、淬火桶、(炉口)、一排工具、煤堆
    const f = G;
    // 招牌:墙上伸出一根木梁,底下吊一块木牌(牌面朝着广场),两面都钉着铁砧的剪影
    f.box(s.timber, -3.0, 3.72, 1.0, 0.12, 0.12, 1.5, TIMBER, 0.9, 0.01);
    f.box(s.timber, -3.0, 3.36, 0.62, 0.09, 0.09, 0.8, TIMBER, 0.9, 0.01, [42, 0, 0]);
    for (const sx of [-0.3, 0.3]) {
      f.box(s.iron, -3.0 + sx, 3.5, 1.45, 0.02, 0.34, 0.02, [0.3, 0.3, 0.32], 1.6, 0);
    }
    f.box(s.timber, -3.0, 2.86, 1.45, 0.86, 0.96, 0.07, [0.3, 0.25, 0.21], 0.9, 0.02);
    for (const sz of [-0.045, 0.045]) {
      f.box(s.iron, -3.0, 3.02, 1.45 + sz, 0.56, 0.12, 0.02, [0.62, 0.62, 0.66], 1.6, 0.005);
      f.box(s.iron, -3.0, 2.88, 1.45 + sz, 0.22, 0.2, 0.02, [0.62, 0.62, 0.66], 1.6, 0.005);
      f.box(s.iron, -3.0, 2.74, 1.45 + sz, 0.42, 0.1, 0.02, [0.62, 0.62, 0.66], 1.6, 0.005);
    }
    // 门边挂一盏小灯
    f.box(s.iron, -3.95, 2.75, 0.3, 0.04, 0.04, 0.6, [0.3, 0.3, 0.32], 1.6, 0);
    f.box(s.iron, -3.95, 2.66, 0.56, 0.2, 0.04, 0.2, [0.3, 0.3, 0.32], 1.6, 0);
    f.box(s.glass, -3.95, 2.48, 0.56, 0.16, 0.3, 0.16, [1, 1, 1], 1, 0);
    f.box(s.iron, -3.95, 2.3, 0.56, 0.2, 0.04, 0.2, [0.3, 0.3, 0.32], 1.6, 0);
    s.doorLamps.push({ x: f.P(-3.95, 2.48, 0.9).x, y: 2.48, z: f.P(-3.95, 2.48, 0.9).z });
    // 靠墙的梯子
    for (const sd of [-1, 1]) {
      f.box(s.timber, -7.0 + sd * 0.26, 1.75, 0.75, 0.06, 3.6, 0.06, [0.46, 0.4, 0.33], 0.9, 0, [-11, 0, 0]);
    }
    for (let i = 0; i < 8; i += 1) {
      const t = 0.4 + i * 0.4;
      f.box(s.timber, -7.0, t * 0.98, 1.09 - t * 0.19, 0.5, 0.045, 0.045, [0.46, 0.4, 0.33], 0.9, 0);
    }
    // 工作台:台面上一把锤子、一把钳子、两块铁料
    const BX = -0.5;
    f.box(s.timber, BX, 0.86, 0.75, 1.9, 0.1, 0.8, [0.46, 0.4, 0.34], 0.9, 0.015);
    for (const [lx2, lz2] of [[-0.85, 0.42], [0.85, 0.42], [-0.85, 1.08], [0.85, 1.08]]) {
      f.box(s.timber, BX + lx2, 0.41, lz2, 0.1, 0.82, 0.1, [0.4, 0.35, 0.3], 0.9, 0.01);
    }
    f.box(s.timber, BX, 0.3, 0.75, 1.7, 0.06, 0.6, [0.4, 0.35, 0.3], 0.9, 0.01);
    f.box(s.iron, BX - 0.4, 0.97, 0.7, 0.2, 0.12, 0.12, [0.42, 0.42, 0.45], 1.6, 0.01);
    f.box(s.timber, BX - 0.15, 0.95, 0.7, 0.4, 0.04, 0.04, [0.5, 0.42, 0.34], 0.9, 0, [0, 12, 0]);
    f.box(s.iron, BX + 0.4, 0.93, 0.85, 0.5, 0.03, 0.05, [0.36, 0.36, 0.38], 1.6, 0, [0, -24, 0]);
    f.box(s.iron, BX + 0.5, 0.95, 0.55, 0.3, 0.07, 0.1, [0.5, 0.5, 0.53], 1.6, 0.005, [0, 30, 0]);
    solid(f.P(BX, 0, 0.75).x, f.P(BX, 0, 0.75).z, 1.0, 0.7, 0.9);
    // 铁砧(架在一截树桩上)
    f.box(s.bark, 1.9, 0.3, 1.7, 0.5, 0.6, 0.5, [0.5, 0.45, 0.4], 0.5, 0.05);
    f.box(s.iron, 1.9, 0.72, 1.7, 0.62, 0.2, 0.26, [0.4, 0.4, 0.43], 1.6, 0.02);
    f.box(s.iron, 1.9, 0.86, 1.7, 0.8, 0.1, 0.22, [0.45, 0.45, 0.48], 1.6, 0.02);
    solid(f.P(1.9, 0, 1.7).x, f.P(1.9, 0, 1.7).z, 0.42, 0.42, 0.9);
    // 炉口右边靠墙的一排工具、地上的煤堆
    for (let i = 0; i < 4; i += 1) {
      f.box(s.timber, 5.7 + i * 0.22, 1.0, 0.35, 0.05, 2.0, 0.05, [0.48, 0.42, 0.36], 0.9, 0, [-9, 0, R(-4, 4)]);
    }
    for (let i = 0; i < 14; i += 1) {
      const an = R(0, 6.28);
      const rr = Math.sqrt(rnd()) * 0.6;
      const cp = f.P(6.3 + Math.cos(an) * rr, 0.08 + (0.6 - rr) * 0.45, 1.5 + Math.sin(an) * rr * 0.8);
      s.goods.ball(R(0.1, 0.17), R(0.08, 0.13), R(0.1, 0.17), [cp.x, cp.y, cp.z], 5, { tint: [0.045, 0.045, 0.05] });
    }
    solid(f.P(6.3, 0, 1.5).x, f.P(6.3, 0, 1.5).z, 0.6, 0.6, 0.5);
    // 磨刀的砂轮
    for (const sd of [-1, 1]) {
      f.box(s.timber, -1.9 + sd * 0.14, 0.4, 2.3, 0.06, 0.8, 0.5, [0.42, 0.36, 0.3], 0.9, 0.01);
    }
    s.stone.cylinder(0.36, 0.36, 0.12, 16, f.P(-1.9, 0.86, 2.3), V(0, SMY, 90), [0.62, 0.6, 0.58], 0.5, rnd);
    solid(f.P(-1.9, 0, 2.3).x, f.P(-1.9, 0, 2.3).z, 0.4, 0.4, 1.2);
    barrel(f.P(1.1, 0, 0.6).x, f.P(1.1, 0, 0.6).z, 0.9);
    barrel(f.P(-2.3, 0, 0.7).x, f.P(-2.3, 0, 0.7).z, 1.05);
    barrel(f.P(-6.2, 0, 0.6).x, f.P(-6.2, 0, 0.6).z, 0.8);
  }
  house(3.4, CITY.Z0 - 1.2, 0, 9, 8, { upper: 2, lit: 3, tone: 0.86 });
  house(13.4, CITY.Z0 - 0.9, 0, 10.5, 8, { upper: 1, gableFront: true, lit: 2 });
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

  // ── 大教堂:在广场东头。本地坐标里正面是 +z;按正面比例搭好之后整体等比缩到 0.64 倍 ──
  // 第三轮(用户:「建筑还是需要打磨一下,还原型不像」):原型里它是斜四分之三的角度,看得到右侧一长排尖窗和扶壁。
  // 所以整座转了 20°(正面朝西偏北),南侧面露给广场;侧廊加长到和中殿一样长;砌石的块改小(块太大,整座楼显得像小模型)、石色提亮。
  {
    const S = 0.64;
    const CY = -110;
    const f = frame(26.1, 0, CY, S, S);
    const BY = 1.6;
    const ST: Tint = [0.93, 0.93, 0.97];
    const SD: Tint = [0.74, 0.75, 0.8];
    const SL: Tint = [1, 1, 1];
    const DARK: Tint = [0.03, 0.035, 0.045];
    const D = 0.5;
    const oct = (r: number): Array<[number, number]> => {
      const o: Array<[number, number]> = [];
      for (let k = 0; k < 8; k += 1) {
        o.push([Math.cos(((k + 0.5) / 8) * 6.2832) * r, Math.sin(((k + 0.5) / 8) * 6.2832) * r]);
      }
      return o;
    };
    /** 尖窗外面一圈石框:两根边框、顶上两根斜石拼成尖拱、底下一道窗台。 */
    const hood = (F: Frame, lx: number, ly: number, lz: number, w: number, h: number, th = 0.2): void => {
      const run = w / 2 + th / 2;
      const rise = h * 0.3 + th;
      const len = Math.hypot(run, rise) + th * 0.6;
      const ang = (Math.atan2(rise, run) * 180) / Math.PI;
      for (const sd of [-1, 1]) {
        F.box(s.stone, lx + sd * (w / 2 + th / 2), ly - h * 0.15, lz, th, h * 0.7, 0.3, SL, D, 0.02);
        F.box(s.stone, lx + sd * (run / 2), ly + h * 0.2 + rise / 2, lz, len, th, 0.3, SL, D, 0.02, [0, 0, -sd * ang]);
      }
      F.box(s.stone, lx, ly - h / 2 - 0.12, lz + 0.05, w + th * 2 + 0.3, 0.22, 0.4, SD, D, 0.02);
    };
    /** 一扇尖窗:亮的(暖光的花窗)或者黑的(钟楼的百叶),外面套石框。 */
    const lancet = (F: Frame, lx: number, ly: number, lz: number, w: number, h: number, lit: boolean): void => {
      if (lit) {
        F.pane(s.winLancet, lx, ly, lz, w, h);
      } else {
        F.box(s.winDark, lx, ly - h * 0.15, lz - 0.02, w, h * 0.7, 0.04, DARK, 1, 0);
        F.face(s.winDark, [[lx - w / 2, ly + h * 0.2, lz], [lx + w / 2, ly + h * 0.2, lz], [lx, ly + h * 0.5, lz]], 1, DARK);
        for (let k = 0; k < 4; k += 1) {
          F.box(s.timber, lx, ly - h * 0.42 + k * h * 0.16, lz + 0.04, w, 0.1, 0.12, [0.24, 0.22, 0.2], 0.9, 0, [28, 0, 0]);
        }
      }
      hood(F, lx, ly, lz + 0.08, w, h);
    };
    /** 小山花:两条斜石条在墙前面搭成一个尖角,尖顶上一朵石花。 */
    const gablet = (F: Frame, cx: number, y0: number, hw: number, rise: number, z1: number, bar = 0.28): void => {
      const len = Math.hypot(hw, rise) + bar;
      const ang = (Math.atan2(rise, hw) * 180) / Math.PI;
      for (const sd of [-1, 1]) {
        F.box(s.stone, cx + sd * (hw / 2), y0 + rise / 2 + bar * 0.3, z1 + 0.05, len, bar, 0.34, SL, D, 0.02, [0, 0, -sd * ang]);
      }
      F.box(s.stone, cx, y0 + rise + bar * 1.6, z1 + 0.05, bar * 0.8, bar * 3.2, bar * 0.8, SL, D, 0.02);
      F.box(s.stone, cx, y0 + rise + bar * 2.2, z1 + 0.05, bar * 2.2, bar * 0.6, bar * 0.7, SL, D, 0.02);
    };
    /** 小尖塔:一截方柱 + 一圈压顶 + 一根尖锥。 */
    const pinnacle = (F: Frame, lx: number, ly: number, lz: number, w: number, h: number, spike: number): void => {
      F.box(s.stone, lx, ly + h / 2, lz, w, h, w, ST, D, 0.02);
      F.box(s.stone, lx, ly + h, lz, w + 0.22, 0.18, w + 0.22, SL, D, 0.02);
      const pp = F.P(lx, ly + h + 0.09, lz);
      const r = (w * S) / 2;
      s.stone.prism([[r, r], [-r, r], [-r, -r], [r, -r]], 0, spike * S, 0.03, SD, D, xform([pp.x, pp.y, pp.z], [0, F.yaw, 0]));
    };
    /** 一排盲拱:贴在墙面上的细柱和尖拱(塔身层与层之间的那道花带)。 */
    const arcade = (F: Frame, x0: number, x1: number, y0: number, h: number, lz: number, n: number): void => {
      const bw = (x1 - x0) / n;
      for (let i = 0; i <= n; i += 1) {
        F.box(s.stone, x0 + i * bw, y0 + h * 0.36, lz, 0.14, h * 0.72, 0.16, SL, D, 0.01);
      }
      const run = bw / 2;
      const rise = h * 0.28;
      const len = Math.hypot(run, rise) + 0.06;
      const ang = (Math.atan2(rise, run) * 180) / Math.PI;
      for (let i = 0; i < n; i += 1) {
        for (const sd of [-1, 1]) {
          F.box(s.stone, x0 + (i + 0.5) * bw + sd * (run / 2), y0 + h * 0.72 + rise / 2, lz, len, 0.12, 0.14, SL, D, 0.01, [0, 0, -sd * ang]);
        }
      }
      F.box(s.stone, (x0 + x1) / 2, y0 - 0.08, lz, x1 - x0 + 0.3, 0.16, 0.24, SD, D, 0.01);
    };

    // 台基、台阶、台阶两侧的矮墙和灯
    f.box(s.stone, 0, BY / 2, -14, 36, BY, 31, SD, D, 0.04);
    for (let i = 0; i < 8; i += 1) {
      const dep = 0.6 * (8 - i);
      f.box(s.stone, 0, 0.1 + 0.2 * i, 1 + dep / 2, 11, 0.2, dep, i % 2 ? ST : SD, D, 0.02);
    }
    for (const sd of [-1, 1]) {
      f.box(s.stone, sd * 6.0, 1.05, 3.4, 0.9, 2.1, 5.0, SD, D, 0.04);
      f.box(s.stone, sd * 6.0, 2.2, 5.6, 1.1, 0.2, 1.1, ST, D, 0.03);
      const lp = f.P(sd * 6.0, 2.3, 5.6);
      s.iron.box(0.3, 0.06, 0.3, V(lp.x, lp.y + 0.03, lp.z), V(0, CY, 0), [0.3, 0.3, 0.32], 1.6, rnd, 0.01);
      s.glass.box(0.22, 0.34, 0.22, V(lp.x, lp.y + 0.24, lp.z), V(0, CY, 0), [1, 1, 1], 1, rnd, 0);
      s.iron.prism([[0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]], 0, 0.22, 0, [0.3, 0.3, 0.32], 1.6, xform([lp.x, lp.y + 0.42, lp.z], [0, CY, 0]));
      s.doorLamps.push({ x: lp.x, y: lp.y + 0.26, z: lp.z });
    }

    // 中殿的正面:一面高墙,上面是三角的山墙(两条斜边压着石檐、一排卷叶石块,尖顶一个十字)
    f.box(s.stone, 0, BY + 8.5, -1, 10.4, 17, 2, ST, D, 0.04);
    f.face(s.stone, [[-5.2, BY + 17, 0], [5.2, BY + 17, 0], [0, BY + 23.5, 0]], D, ST);
    f.box(s.stone, 0, BY + 24.5, 0, 0.24, 2.0, 0.24, SL, D, 0.02);
    f.box(s.stone, 0, BY + 24.8, 0, 1.0, 0.22, 0.22, SL, D, 0.02);
    for (const sd of [-1, 1]) {
      f.box(s.stone, sd * 2.6, BY + 20.3, 0.12, 0.5, 8.6, 0.5, SL, D, 0.03, [0, 0, sd * 38.7]);
      for (let k = 1; k < 7; k += 1) {
        const t = k / 7;
        f.box(s.stone, sd * (5.2 * (1 - t) + 0.25), BY + 17 + 6.5 * t + 0.42, 0.12, 0.34, 0.42, 0.34, SD, D, 0.03, [0, 0, sd * 38.7]);
      }
    }
    lancet(f, 0, BY + 19.6, 0.04, 0.85, 2.7, true);
    f.box(s.stone, 0, BY + 17.0, 0.1, 10.6, 0.5, 0.44, SL, D, 0.03);
    f.box(s.stone, 0, BY + 9.9, 0.08, 10.5, 0.3, 0.34, SL, D, 0.03);

    // 大门:包铁的木门、两层尖拱的石框,门上一个高高的山花,山花里一个菱形的暗窗
    f.box(s.winDark, 0, BY + 2.5, 0.03, 3.2, 5.0, 0.06, [0.04, 0.035, 0.03], 1, 0);
    f.box(s.timber, 0, BY + 2.2, 0.06, 2.9, 4.4, 0.1, [0.5, 0.38, 0.28], 0.9, 0.02);
    f.box(s.iron, 0, BY + 2.2, 0.12, 0.06, 4.4, 0.03, [0.3, 0.3, 0.32], 1.6, 0);
    for (let k = 0; k < 3; k += 1) {
      f.box(s.iron, 0, BY + 0.9 + k * 1.3, 0.13, 2.8, 0.08, 0.03, [0.3, 0.3, 0.32], 1.6, 0);
    }
    for (const [rad, th, zz] of [[2.0, 0.5, 0.12], [2.65, 0.42, 0.2]] as Array<[number, number, number]>) {
      for (const sd of [-1, 1]) {
        f.box(s.stone, sd * rad, BY + 2.1, zz, th, 4.2, 0.5, SD, D, 0.03);
        f.box(s.stone, sd * rad, BY + 4.25, zz + 0.04, th + 0.2, 0.3, 0.6, SL, D, 0.02);
        for (let i = 0; i < 6; i += 1) {
          const t = (i + 0.5) / 6;
          const an = t * 1.15;
          const px = sd * (rad - (1 - Math.cos(an)) * rad * 1.05);
          const py = BY + 4.2 + Math.sin(an) * rad * 1.25;
          f.box(s.stone, px, py, zz, th, rad * 0.3, 0.5, SD, D, 0.03, [0, 0, sd * ((an * 180) / Math.PI) * 0.8]);
        }
      }
    }
    gablet(f, 0, BY + 4.6, 3.3, 5.3, 0.42, 0.34);
    f.box(s.winDark, 0, BY + 8.1, 0.05, 0.75, 0.75, 0.05, DARK, 1, 0, [0, 0, 45]);
    f.box(s.stone, 0, BY + 8.1, 0.03, 1.1, 1.1, 0.06, SL, D, 0.01, [0, 0, 45]);

    // 玫瑰窗:里外两圈石块
    f.pane(s.winRose, 0, BY + 13.4, 0.05, 5.0, 5.0);
    for (let i = 0; i < 16; i += 1) {
      const an = (i / 16) * Math.PI * 2;
      f.box(s.stone, Math.cos(an) * 2.7, BY + 13.4 + Math.sin(an) * 2.7, 0.1, 1.15, 0.4, 0.4, SD, D, 0.03, [0, 0, (an * 180) / Math.PI + 90]);
    }
    for (let i = 0; i < 24; i += 1) {
      const an = ((i + 0.5) / 24) * Math.PI * 2;
      f.box(s.stone, Math.cos(an) * 3.12, BY + 13.4 + Math.sin(an) * 3.12, 0.06, 0.86, 0.22, 0.3, SL, D, 0.02, [0, 0, (an * 180) / Math.PI + 90]);
    }
    for (const sd of [-1, 1]) {
      lancet(f, sd * 3.7, BY + 7.9, 0.04, 1.0, 3.4, true);
      // 门两边垂下来的暗红旗幡
      f.box(s.iron, sd * 3.7, BY + 5.6, 0.5, 1.1, 0.05, 0.05, [0.3, 0.3, 0.32], 1.6, 0);
      f.pane(s.cloth, sd * 3.7, BY + 3.85, 0.52, 0.95, 3.4, [0.86, 0.8, 0.8]);
      f.pane(s.cloth, sd * 3.7, BY + 1.95, 0.52, 0.5, 0.5, [0.86, 0.8, 0.8]);
    }

    // 两座塔:比中殿正面往前凸一点;三层成对的尖窗(下面两层亮着,顶层是钟楼的百叶),层间一道盲拱花带和腰线;
    // 顶上一圈压檐石、四角的小尖塔、一座又细又高的八角尖顶
    for (const sd of [-1, 1]) {
      const tx = sd * 7.7;
      f.box(s.stone, tx, BY + 13, -1.9, 5, 26, 5, ST, D, 0.05);
      for (const [yy, hh, lit] of [[5.4, 3.6, true], [13.5, 4.2, true], [21.5, 4.8, false]] as Array<[number, number, boolean]>) {
        for (const dx of [-0.74, 0.74]) {
          lancet(f, tx + dx, BY + yy, 0.64, 0.92, hh, lit);
        }
      }
      arcade(f, tx - 2.0, tx + 2.0, BY + 7.85, 1.4, 0.66, 6);
      arcade(f, tx - 2.0, tx + 2.0, BY + 16.05, 1.4, 0.66, 6);
      gablet(f, tx, BY + 24.15, 1.75, 1.6, 0.72, 0.22);
      for (const yy of [9.4, 17.6]) {
        f.box(s.stone, tx, BY + yy, -1.9, 5.3, 0.4, 5.3, SL, D, 0.04);
      }
      f.box(s.stone, tx, BY + 26.2, -1.9, 5.7, 0.5, 5.7, SL, D, 0.05);
      for (let k = 0; k < 7; k += 1) {
        // 压檐石下面一排小石托(正面和朝外的侧面)
        f.box(s.stone, tx - 2.1 + k * 0.7, BY + 25.8, 0.66, 0.3, 0.5, 0.3, SD, D, 0.02);
        f.box(s.stone, tx + sd * 2.56, BY + 25.8, -4.0 + k * 0.7, 0.3, 0.5, 0.3, SD, D, 0.02);
      }
      // 塔朝外的侧面也开窗(斜着看教堂的时候看得到)
      {
        const sp = f.P(tx + sd * 2.5, 0, -1.9);
        const fs = frame(sp.x, sp.z, CY + sd * 90, S, S);
        lancet(fs, 0, BY + 13.5, 0.14, 0.92, 4.2, true);
        for (const dx of [-0.74, 0.74]) {
          lancet(fs, dx, BY + 21.5, 0.14, 0.92, 4.8, false);
        }
        arcade(fs, -2.0, 2.0, BY + 16.05, 1.4, 0.16, 6);
      }
      const tp = f.P(tx, BY + 26.45, -1.9);
      s.stone.prism(oct(2.45 * S), 0, 0.7, 0.92, SD, D, xform([tp.x, tp.y, tp.z], [0, CY, 0]));
      s.slate.prism(oct(2.25 * S), 0, 8.6, 0.02, [0.8, 0.82, 0.88], 0.42, xform([tp.x, tp.y + 0.7, tp.z], [0, CY, 0]));
      s.iron.box(0.05, 1.0, 0.05, V(tp.x, tp.y + 9.7, tp.z), V(0, 0, 0), [0.4, 0.4, 0.42], 1.6, rnd, 0);
      s.iron.box(0.05, 0.05, 0.42, V(tp.x, tp.y + 9.85, tp.z), V(0, CY, 0), [0.4, 0.4, 0.42], 1.6, rnd, 0);
      for (const [cx2, cz2] of [[-2.45, -2.45], [2.45, -2.45], [2.45, 2.45], [-2.45, 2.45]]) {
        pinnacle(f, tx + cx2, BY + 26.45, -1.9 + cz2, 0.72, 2.2, 3.6);
      }
      // 扶壁:贴在塔的外侧和内侧,分三段往上收,每段顶上一道斜的披水石,最上面一根小尖塔
      for (const bx of [tx + sd * 2.9, tx - sd * 2.9]) {
        f.box(s.stone, bx, BY + 5, 0.9, 1.0, 10, 1.4, SD, D, 0.04);
        f.box(s.stone, bx, BY + 10.1, 1.0, 1.1, 0.3, 1.3, SL, D, 0.03, [24, 0, 0]);
        f.box(s.stone, bx, BY + 13.5, 0.72, 0.84, 7, 1.0, SD, D, 0.04);
        f.box(s.stone, bx, BY + 17.1, 0.8, 0.94, 0.3, 0.95, SL, D, 0.03, [24, 0, 0]);
        f.box(s.stone, bx, BY + 19.6, 0.56, 0.7, 5.2, 0.7, SD, D, 0.04);
        pinnacle(f, bx, BY + 22.2, 0.56, 0.6, 1.5, 2.8);
      }

      // 侧廊:矮一截,和中殿一样长;正面两扇尖窗,单坡的石板瓦顶
      const AL = 26;
      f.box(s.stone, sd * 13.4, BY + 4.6, -1 - AL / 2, 6.4, 9.2, AL, ST, D, 0.04);
      lancet(f, sd * 12.0, BY + 4.9, 0.04, 1.0, 3.8, true);
      lancet(f, sd * 14.95, BY + 4.9, 0.04, 1.0, 3.8, true);
      f.box(s.stone, sd * 13.4, BY + 9.3, 0.06, 6.7, 0.5, 0.34, SL, D, 0.03);
      for (const bx of [sd * 13.47, sd * 16.5]) {
        f.box(s.stone, bx, BY + 4.2, 0.5, 0.8, 8.4, 1.0, SD, D, 0.04);
        f.box(s.stone, bx, BY + 8.5, 0.6, 0.9, 0.3, 0.95, SL, D, 0.03, [24, 0, 0]);
        pinnacle(f, bx, BY + 8.6, 0.3, 0.6, 1.5, 2.6);
      }
      const xo = sd * 16.9;
      const xi = sd * 10.2;
      const za = -1.3 - AL;
      f.face(s.slate, sd > 0 ? [[xo, BY + 9.0, 0.3], [xo, BY + 9.0, za], [xi, BY + 12.4, za], [xi, BY + 12.4, 0.3]] : [[xo, BY + 9.0, za], [xo, BY + 9.0, 0.3], [xi, BY + 12.4, 0.3], [xi, BY + 12.4, za]], 0.42, SLATE);

      // 侧面(原型里看得到的那一长排):侧廊的外墙每个开间一扇尖窗,开间之间是带小尖塔的扶壁;
      // 上面露出中殿的高侧窗;每根扶壁顶上斜搭一根飞扶壁撑到中殿的墙上
      const ap = f.P(sd * 16.6, 0, 0);
      const fa = frame(ap.x, ap.z, CY + sd * 90, S, S);
      const cp = f.P(sd * 6.0, 0, 0);
      const fc = frame(cp.x, cp.z, CY + sd * 90, S, S);
      const BAY = 4.2;
      for (let i = 0; i <= 6; i += 1) {
        const t = 1.5 + i * BAY;            // 离正面多远(往后)
        const lx = sd * t;                  // 侧面那个坐标架里:南侧往后是 +x,北侧往后是 -x
        fa.box(s.stone, lx, BY + 4.3, 0.5, 0.8, 8.6, 1.0, SD, D, 0.04);
        fa.box(s.stone, lx, BY + 8.7, 0.6, 0.9, 0.3, 0.95, SL, D, 0.03, [24, 0, 0]);
        pinnacle(fa, lx, BY + 8.8, 0.35, 0.6, 1.7, 2.8);
        fc.box(s.stone, lx, BY + 14.8, 0.18, 0.6, 5.0, 0.5, SD, D, 0.03);
        pinnacle(fc, lx, BY + 17.3, 0.2, 0.5, 0.9, 2.0);
        f.box(s.stone, sd * 11.5, BY + 13.1, -t, 11.6, 0.42, 0.5, SD, D, 0.03, [0, 0, -sd * 25.5]);
        if (i < 6) {
          const wx = sd * (t + BAY / 2);
          lancet(fa, wx, BY + 4.9, 0.04, 1.1, 4.2, i !== 3);
          lancet(fc, wx, BY + 14.7, 0.04, 1.0, 3.4, true);
        }
      }
      fa.box(s.stone, sd * (1 + AL / 2), BY + 9.3, 0.06, AL + 0.6, 0.5, 0.34, SL, D, 0.03);
      fc.box(s.stone, sd * (1 + AL / 2), BY + 17.25, 0.06, AL + 0.6, 0.44, 0.3, SL, D, 0.03);
    }
    // 后面的中殿:又高又长,人字顶(屋脊比正面的山墙矮一点,从正面看不到);屋脊上一座细尖塔
    f.box(s.stone, 0, BY + 8.6, -16, 12, 17.2, 28, ST, D, 0.05);
    f.face(s.slate, [[-6.6, BY + 17.0, -30.4], [-6.6, BY + 17.0, -1.6], [0, BY + 22.6, -1.6], [0, BY + 22.6, -30.4]], 0.42, SLATE);
    f.face(s.slate, [[6.6, BY + 17.0, -1.6], [6.6, BY + 17.0, -30.4], [0, BY + 22.6, -30.4], [0, BY + 22.6, -1.6]], 0.42, SLATE);
    f.box(s.stone, 0, BY + 23.2, -15, 1.2, 2.6, 1.2, ST, D, 0.03);
    const fp = f.P(0, BY + 24.5, -15);
    s.slate.prism(oct(0.52), 0, 6.5, 0.02, [0.8, 0.82, 0.88], 0.42, xform([fp.x, fp.y, fp.z], [0, CY, 0]));
    // 挡路:主角出不了广场东沿,这几块只管镜头别钻进楼里
    solid(32, -2, 8, 12, 30);
    solid(23, -1.3, 1.8, 4.2, 2);
    solid(23.4, 8.6, 1.4, 2.6, 30);
  }

  // ── 教堂前的栏杆:一排石柱,柱间是铁栏;栏后面是柏树和一尊立像 ──
  for (const sd of [-1, 1]) {
    const z0 = sd < 0 ? 6.3 : 3.7;
    for (let i = 0; i < 5; i += 1) {
      const z = sd * (z0 + i * 2.5);
      s.stone.box(0.7, 1.9, 0.7, V(CITY.X1 + 0.3, 0.95, z), V(0, 0, 0), [0.7, 0.71, 0.76], 0.25, rnd, 0.04);
      s.stone.box(0.9, 0.18, 0.9, V(CITY.X1 + 0.3, 1.98, z), V(0, 0, 0), [0.62, 0.63, 0.68], 0.25, rnd, 0.03);
      if (i < 4) {
        for (const yy of [0.5, 1.5]) {
          s.iron.box(0.04, 0.04, 2.5, V(CITY.X1 + 0.3, yy, z + sd * 1.25), V(0, 0, 0), [0.3, 0.3, 0.33], 1.6, rnd, 0);
        }
        for (let k = 1; k < 9; k += 1) {
          s.iron.box(0.03, 1.5, 0.03, V(CITY.X1 + 0.3, 0.95, z + sd * (k * 0.28)), V(0, 0, 0), [0.3, 0.3, 0.33], 1.6, rnd, 0);
        }
      }
    }
    solid(CITY.X1 + 0.3, sd * (z0 + 5), 0.4, 5.3, 2);
    // 柏树:北边那块空出来的台地上多几棵,南边贴着侧廊的墙角
    for (const [cx2, cz2, hh] of (sd < 0 ? [[22.3, 8.0, 5.6], [24.6, 9.4, 6.4], [26.4, 12.6, 5.2], [23.2, 14.6, 6.0]] : [[21.5, 8.4, 5.4], [21.4, 11.8, 4.8], [23.4, 13.8, 6.2]]) as Array<[number, number, number]>) {
      s.bark.cylinder(0.1, 0.13, 0.9, 6, V(cx2, 0.45, sd * cz2), V(0, 0, 0), [0.4, 0.36, 0.32], 0.5, rnd);
      // 柏树:又瘦又高的一团墨绿(第一版是八棱的锥子,被月光一照像石锥)
      // (光滑的一根又像炮弹,拧着的纹路又像裹着布:表面要一团一团地鼓出来,深浅不一)
      const ph = R(0, 6.28);
      const lump = (u: number, v: number): number => Math.sin(u * 6.2832 * 6 + ph) * Math.sin(v * 26 + ph) * 0.65 + Math.sin(u * 6.2832 * 11 + ph * 2) * Math.sin(v * 47 + 1.3) * 0.35;
      s.leaf.surf(24, 28, (u, v, out) => {
        const prof = Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.97 + 0.03)), 0.55) * (1 - 0.45 * v);
        const r = 0.6 * prof * (1 + 0.26 * lump(u, v));
        out.set(cx2 + Math.cos(u * 6.2832) * r, 0.6 + v * hh, sd * cz2 + Math.sin(u * 6.2832) * r);
      }, { closeU: true, tint: (u: number, v: number) => { const t = 0.8 + 0.7 * lump(u, v); return [0.014 * t, 0.026 * t, 0.016 * t] as Tint; } });
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
    const wx = -1.6;
    const wz = -6.4;
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
  s.npcs.push({ x: 0.2, z: -5.3, yaw: 149 });

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
      s.iron.box(0.035, 0.46, 0.035, V(x + ox * 0.195, 3.71, z + oz * 0.195), V(ox * 6, 0, -oz * 6), [0.2, 0.2, 0.22], 1.6, rnd, 0);
    }
    for (const [ox, oz, w2, d2] of [[0, 1, 0.4, 0.025], [0, -1, 0.4, 0.025], [1, 0, 0.025, 0.4], [-1, 0, 0.025, 0.4]]) {
      s.iron.box(w2, 0.025, d2, V(x + ox * 0.195, 3.74, z + oz * 0.195), V(0, 0, 0), [0.2, 0.2, 0.22], 1.6, rnd, 0);
      s.iron.box(w2 * 0.06 + 0.02, 0.42, d2 * 0.06 + 0.02, V(x + ox * 0.195, 3.71, z + oz * 0.195), V(0, 0, 0), [0.2, 0.2, 0.22], 1.6, rnd, 0);
    }
    s.lamps.push({ x, y: 3.7, z });
    solid(x, z, 0.2, 0.2, 4);
  };
  lamp(-13.6, -7.4);
  lamp(-13.2, 6.0);
  lamp(8.3, -11.6);
  lamp(16.2, -9.4);
  lamp(16.6, 9.4);
  lamp(-0.4, 10.6);

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
          limb(p.clone(), side, len * R(0.42, 0.62), rad * 0.55, depth - 1);
        }
      }
      s.bark.tube(pts, (t) => Math.max(0.006, rad * (1 - 0.86 * t)), depth > 1 ? 6 : 4, { tint, den: 0.6 });
      tips.push(pts[pts.length - 1], pts[pts.length - 2]);
    };
    const n = 7 + Math.floor(R(0, 3));
    for (let i = 0; i < n; i += 1) {
      const t = 0.3 + (0.5 * (i + R(0, 0.6))) / n;
      const a = seed * 1.7 + i * 2.4 + R(-0.4, 0.4);
      limb(at(t), V(Math.cos(a), 0.35 + 0.5 * t, Math.sin(a)).normalize(), h * (0.5 - 0.22 * t) * R(0.8, 1.2), r0 * (1 - 0.7 * t) * 0.74, 3);
    }
    // 红叶:梢头零星几片,每片是一个小菱形(正反两面)
    for (const tp of tips) {
      const k = rnd() < 0.24 ? 1 + Math.floor(R(0, 4)) : 0;
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

  // ── 零碎:墙根的木桶、几只木箱 ──
  barrel(-19.7, -11.6, 1);
  barrel(-19.4, -10.9, 0.85);
  barrel(2.5, -13.5, 1);
  for (const [cx2, cz2, sz, yw] of [[18.2, 12.6, 0.7, 12], [17.4, 12.9, 0.55, -20], [-18.6, 6.2, 0.7, 8]] as Array<[number, number, number, number]>) {
    s.timber.box(sz, sz * 0.8, sz, V(cx2, sz * 0.4, cz2), V(0, yw, 0), [0.5, 0.45, 0.38], 0.9, rnd, 0.012);
    solid(cx2, cz2, sz / 2, sz / 2, sz);
  }
  return s;
}
