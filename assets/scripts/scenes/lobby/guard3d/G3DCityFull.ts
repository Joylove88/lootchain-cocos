import { Vec3 } from 'cc';
import { CITY_GROUND, CITY_PLAN, CityScene } from './G3DCity';

/**
 * 整城(预渲染 2.5D 第 1 期,2026-11-19;用户看了整城原型说「按这个做」→「10 样全转」→「开始摆城」)。
 * 只在 3D 小样地址带 &cityfull=1 时生效:在现有的中心广场(40 × 28 米)外面接上整座城 —— 帝国学院(北)、佣兵公会 + 金麦酒馆 + 马厩(西)、
 * 集市街 + 王都兵营 + 东门(东南)、运河 + 石桥 + 南门(南)、码头(东南角)、一圈城墙。布局照 tools/proto3d/pre25/city_plan.py 的平面图
 * (周报截图/2026-11-19_整城布局原型/01_整城平面布局.png),建筑用图转 3D 的模型(g3d_bld/<键>,摆法和朝向修正见 G3DDungeon 的 BLD_FIX)。
 *
 * 坐标同 3D 场景:X 往东、Z 往南(北 = -Z),米。yaw 是「正面朝向」:0 = 朝 +Z(南),90 = 朝 +X(东),180 = 朝北,-90 = 朝西。
 * 每栋都同时登记成挡路块(预渲染拍图时导出,生成可走格用)。
 */

/** 城墙里面的范围。 */
export const CITY_FULL = { X0: -62, X1: 58, Z0: -50, Z1: 50 };
/** 运河(东西向)和石桥。 */
export const CANAL = { z0: 33, z1: 39 };
/** w = 模型占的宽度;deck = 两道桥栏之间能走的宽度(11-19 从深度图量的约 3.4 米,留点余量) */
export const BRIDGE = { x: -7, w: 9, deck: 3.2 };
export const BRIDGE_SINK = 1.95;
/** 两座城门(出口)。 */
export const GATE_E = { x: 58, z: 24 };
export const GATE_S = { x: -7, z: 50 };

/** 中心广场那份布局里,和新街区撞在一起的远景房子(整城模式下不摆)。 */
export const FULL_SKIP = ['house_b_n2', 'house_b_w2', 'house_c_w2', 'house_d_w2', 'house_s2', 'house_c_s2', 'house_fs',
  // 广场四周堵住新街口的几栋:北街口、南街口、集市街口(东南)
  'house_b_n', 'house_c_s', 'house_d_s', 'house_s', 'house_d_se', 'house_b_fs', 'house_d_fs'];

/** 整城模式:地面扩到城墙外一圈。要在建场景之前调(地面贴图和网格按它出)。 */
export function applyCityFullGround(): void {
  const g = { x0: -68, z0: -56, w: 132, d: 112 };
  Object.assign(CITY_GROUND, g);
  Object.assign(CITY_PLAN, g);
}

type Tint = [number, number, number];
const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);

export function extendCityFull(s: CityScene, rnd: () => number): void {
  const spots = s.bldSpots;
  const solid = (x: number, z: number, hx: number, hz: number, h: number): void => {
    s.solids.push({ x, z, hx, hz, h });
  };
  // 中心广场那份布局里的模型建筑(广场四周的房子、铁匠铺、水井、摊位、路灯、立像):原来都在可走区外面没登记挡路块,
  // 整城的人能走到它们旁边 → 按占地补上(转了任意角度的按外接方框算,宁大勿小)
  for (const sp of spots) {
    const ya = (sp.yaw * Math.PI) / 180;
    const fx = Math.sin(ya);
    const fz = Math.cos(ya);
    const d = sp.d || 7;
    const cx = sp.front ? sp.x - fx * d / 2 : sp.x;
    const cz = sp.front ? sp.z - fz * d / 2 : sp.z;
    const hw = sp.w / 2;
    const hd = d / 2;
    const ex = Math.abs(fz) * hw + Math.abs(fx) * hd;
    const ez = Math.abs(fx) * hw + Math.abs(fz) * hd;
    solid(cx, cz, ex * 0.92, ez * 0.92, sp.h ?? 8);
  }
  // 大教堂 + 台地(这一期不上台地)
  solid(34, 2, 21.5, 13.5, 12);
  /** 一栋模型建筑:(x, z) 是正面那条线的中点,w = 正面宽,d = 进深(只用来登记挡路块)。 */
  const bld = (key: string, id: string, x: number, z: number, yaw: number, w: number, d: number, o: { far?: boolean; h?: number } = {}): void => {
    spots.push({ key, id, x, z, yaw, w, d, front: true, far: o.far, h: o.h });
    // 挡路块:正面那条线往后退进深的一半(yaw 只取 0 / 90 / 180 / -90)
    const a = (((yaw % 360) + 360) % 360);
    const back = d / 2;
    if (a === 0) {
      solid(x, z - back, w / 2, d / 2, 8);
    } else if (a === 180) {
      solid(x, z + back, w / 2, d / 2, 8);
    } else if (a === 90) {
      solid(x - back, z, d / 2, w / 2, 8);
    } else {
      solid(x + back, z, d / 2, w / 2, 8);
    }
  };
  /** 以中心定位的模型件(城墙段 / 角楼 / 城门 / 桥 / 码头 / 摊位 / 路灯):w 沿着 yaw 的「正面」方向。 */
  const piece = (key: string, id: string, x: number, z: number, yaw: number, w: number, d: number, o: { h?: number; solid?: boolean; y?: number } = {}): void => {
    spots.push({ key, id, x, z, yaw, w, d, h: o.h, y: o.y });
    if (o.solid !== false) {
      const along = (((yaw % 180) + 180) % 180) === 90;
      solid(x, z, along ? d / 2 : w / 2, along ? w / 2 : d / 2, 6);
    }
  };

  // ── 主要建筑(第 1 期新转的模型)──
  bld('academy', 'academy', -4, -36, 0, 24, 13);
  bld('guild', 'guild', -41, -8, 0, 15, 12);
  bld('tavern', 'tavern', -41, 8, 180, 14, 12);
  bld('stable', 'stable', -37, 26, 180, 20, 7);
  bld('barracks', 'barracks', 41, 28.5, 180, 17, 9);

  // ── 城墙一圈 + 角楼 + 两座城门 ──
  const SEG = 12;
  const { X0, X1, Z0, Z1 } = CITY_FULL;
  let n = 0;
  const wallRun = (x0: number, z0: number, x1: number, z1: number, yaw: number, gapAt?: number, gapHalf = 7): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cnt = Math.max(1, Math.round(len / SEG));
    const step = len / cnt;
    for (let i = 0; i < cnt; i += 1) {
      const t = (i + 0.5) / cnt;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? x : z;
      if (gapAt !== undefined && Math.abs(along - gapAt) < gapHalf) {
        continue;
      }
      piece('wall', `wall_${n++}`, x, z, yaw, step + 0.3, 2.4);
    }
  };
  wallRun(X0 + 4, Z0, X1 - 4, Z0, 0);                  // 北墙(正面朝城里 = 朝南)
  wallRun(X0 + 4, Z1, X1 - 4, Z1, 180, GATE_S.x);       // 南墙(南门处留口)
  wallRun(X0, Z0 + 4, X0, Z1 - 4, 90);                 // 西墙
  wallRun(X1, Z0 + 4, X1, Z1 - 4, -90, GATE_E.z);       // 东墙(东门处留口)
  piece('wall_tower', 'tower_nw', X0, Z0, 0, 7, 7);
  piece('wall_tower', 'tower_ne', X1, Z0, -90, 7, 7);
  piece('wall_tower', 'tower_sw', X0, Z1, 90, 7, 7);
  piece('wall_tower', 'tower_se', X1, Z1, 180, 7, 7);
  piece('gate', 'gate_e', GATE_E.x, GATE_E.z, -90, 13, 6, { solid: false });
  piece('gate', 'gate_s', GATE_S.x, GATE_S.z, 180, 13, 6, { solid: false });
  // 城门两侧的门柱挡路(中间的门洞留给人走出去)
  solid(GATE_E.x, GATE_E.z - 4.8, 3, 1.8, 8);
  solid(GATE_E.x, GATE_E.z + 4.8, 3, 1.8, 8);
  solid(GATE_S.x - 4.8, GATE_S.z, 1.8, 3, 8);
  solid(GATE_S.x + 4.8, GATE_S.z, 1.8, 3, 8);

  // ── 运河:两道石岸 + 暗色反光的水面(水面就贴在地面上一点,俯视看就是两道石岸夹着的水);石桥跨过去 ──
  const bankTint: Tint = [0.78, 0.78, 0.8];
  // 石岸在桥下断开(桥身下沉后桥面低,整条石岸会从桥面上冒出来)
  const bx0 = BRIDGE.x - BRIDGE.w / 2 + 0.3;
  const bx1 = BRIDGE.x + BRIDGE.w / 2 - 0.3;
  for (const bz of [CANAL.z0, CANAL.z1]) {
    for (const [a0, a1] of [[X0 - 4, bx0], [bx1, X1 + 4]]) {
      s.stone.box(a1 - a0, 0.55, 0.7, V((a0 + a1) / 2, 0.27, bz), V(0, 0, 0), bankTint, 0.9, rnd, 0.04);
    }
  }
  const water: Tint = [0.06, 0.09, 0.12];
  s.winDark.facet([V(X0 - 4, 0.04, CANAL.z1 - 0.35), V(X1 + 4, 0.04, CANAL.z1 - 0.35), V(X1 + 4, 0.04, CANAL.z0 + 0.35), V(X0 - 4, 0.04, CANAL.z0 + 0.35)],
    [[0, 1], [1, 1], [1, 0], [0, 0]], water);
  // 运河整段不能走,桥上能走(桥面单独留一条)
  const dk = BRIDGE.deck / 2;
  solid((X0 + BRIDGE.x - dk) / 2, (CANAL.z0 + CANAL.z1) / 2, (BRIDGE.x - dk - X0) / 2, (CANAL.z1 - CANAL.z0) / 2 + 0.4, 1);
  solid((BRIDGE.x + dk + X1) / 2, (CANAL.z0 + CANAL.z1) / 2, (X1 - BRIDGE.x - dk) / 2, (CANAL.z1 - CANAL.z0) / 2 + 0.4, 1);
  // 桥模型两头切口本身离地约 2 米(11-19 从深度图量:桥头 2.0、桥顶 3.0):整座往下沉 BRIDGE_SINK,桥头落到街面,人走上去不用「跳台阶」;
  // 拱洞下半截埋进水面以下,看着就是水位高。预渲染里人物在桥上的抬高量见 Pre25City.pre25Lift。
  piece('bridge', 'bridge', BRIDGE.x, (CANAL.z0 + CANAL.z1) / 2, 90, 11, BRIDGE.w, { solid: false, y: -BRIDGE_SINK });
  piece('dock', 'dock', 46, CANAL.z0 + 2.4, 0, 10, 5, { solid: false });

  // ── 民居:沿新街排(现成的四种民房模型);(x, z) = 正面中点 ──
  const H: Record<string, [number, number]> = { house: [7, 7], house_b: [11, 8], house_c: [5, 7], house_d: [8, 8] };
  const kinds = ['house', 'house_b', 'house_c', 'house_d'];
  let hn = 0;
  const home = (k: string | null, x: number, z: number, yaw: number, far = false): void => {
    const key = k ?? kinds[Math.floor(rnd() * kinds.length)];
    bld(key, `${key}_f${hn++}`, x, z, yaw, H[key][0], H[key][1], { far });
  };
  // 北街(广场北沿 → 学院):两侧
  home('house_c', -10.5, -19, 90);
  home('house', -10.5, -27, 90);
  home('house_d', 4.5, -20, -90);
  home('house_b', 4.5, -29, -90);
  // 学院两侧、北墙下
  for (const x of [-52, -40, -28]) {
    home(null, x, -40, 0, true);
    home(null, x, -27, 0);
  }
  for (const x of [14, 26, 38, 50]) {
    home(null, x, -40, 0, true);
    home(null, x, -27, 180);
  }
  // 西街(广场 → 西墙):公会 / 酒馆之间和西头
  home('house_c', -25, -5.5, 0);
  home('house_d', -55, -5.5, 0);
  home('house_b', -26, 5.5, 180);
  home('house', -55, 5.5, 180);
  home(null, -55, -18, 90, true);
  home(null, -55, 18, 90, true);
  // 南街(广场 → 石桥):两侧
  home('house_c', -13.5, 24, 90);
  home('house_d', -0.5, 25, -90);
  home(null, -22, 30.5, 180);
  // 集市街(大教堂南侧 → 东门):北侧一排面朝街,南侧兵营两边
  home('house_d', 54, 19.5, 0);
  home('house_b', 20, 28.5, 180);
  home('house_c', 28.5, 28.5, 180);
  home('house', 54, 28.5, 180);
  // 运河南岸:一排面朝运河(北)
  for (const x of [-55, -45, -35, -24, 6, 16, 26, 36]) {
    home(null, x, CANAL.z1 + 1.6, 180);
  }
  // 城墙根下的远处一排
  for (const x of [-52, -40, -28, 8, 20, 32]) {
    home(null, x, CITY_FULL.Z1 - 4.5, 180, true);
  }

  // ── 集市街的摊位和全城的路灯 ──
  piece('stall', 'stall_m1', 34, 21.6, 0, 3.6, 2.6, { h: 3.0 });
  piece('stall', 'stall_m2', 40, 21.6, 0, 3.6, 2.6, { h: 3.0 });
  piece('stall', 'stall_m3', 46, 21.6, 0, 3.6, 2.6, { h: 3.0 });
  let ln = 0;
  for (const [x, z] of [[-4, -16], [-4, -24], [-4, -32], [-24, -2], [-34, -2], [-48, -2], [-24, 2], [-48, 2], [-7, 18], [-7, 28], [-2, 30.5], [-12, 30.5],
    [10, 24], [22, 24], [30, 24], [50, 24], [26, 32], [-30, 32], [10, 32]] as Array<[number, number]>) {
    piece('lamp', `lamp_f${ln++}`, x, z, (ln * 90) % 360, 0.7, 0.7, { h: 4.4 });
    s.lamps.push({ x, y: 3.9, z });
  }
}
