import type { WorldMapDef, WorldMapNpc, WorldMapProp, WorldNpcCode, WorldSceneDef } from '../LobbyWorldMaps';
import { TOWN_GROUND_ASSET, TOWN_GROUND_TILE, TOWN_LAMP_ASSET } from '../LobbyTownConfig';
import { PRE25_CITY_DATA } from './Pre25CityData';

/**
 * 预渲染 2.5D 主城(整体 3D 化方案第 0 期,2026-11-18;默认关,地址带 ?pre25=1 或 localStorage.lcPre25 = '1' 才换上)。
 *
 * 画面是 3D 主城广场小样用正交投影、固定俯角离线拍的整图(11-18 用户选视角 D:斜 45°、俯 45°)(tools/proto3d/pre25:capture_map.py 拍、build_map.py 拼图切块),
 * 运行时就是普通 2D:地面颜色块当贴地件铺,人物被建筑 / 树挡住靠逐像素比深度(effects/pre25-actor + Pre25Actors.ts)。
 * 跑图逻辑(可走格、NPC、出口、传送阵、任务追踪、坐标上报)全部沿用 LobbyTownRenderer,这里只给一份 WorldMapDef。
 *
 * 第 1 期(11-19)= 整城:中心广场外接学院 / 公会 / 酒馆 / 集市街 / 兵营 / 运河石桥 / 两座城门 / 城墙(3D 场景 G3DCityFull,地址 &cityfull=1 拍的);
 * NPC 还是旧主城的站立图,按街区摆;出口在两座城门的门洞里。
 */
const D = PRE25_CITY_DATA;
const [IW, IH] = D.px;
const U = D.unit;
const P = (D.pitch * Math.PI) / 180;
/** 镜头水平朝向(度):0 = 正对东边;-45 = 往东北斜着看(11-18 用户选的视角 D)。 */
const YAW = ((((D as any).yaw as number | undefined) ?? 0) * Math.PI) / 180;
/** 水平朝向 H(画面上方对应的地面方向)和画面右方 R,都是 3D 场景里 (X, Z) 平面上的单位向量。 */
const HX = Math.cos(YAW);
const HZ = Math.sin(YAW);
const DIR = 'pre25/city';

/** 开关:只在网页端看地址参数 / 本地存储(原生没有地址,恒关)。 */
export function pre25Enabled(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]pre25=1\b/.test(location.search)) {
      return true;
    }
    return typeof localStorage !== 'undefined' && localStorage.getItem('lcPre25') === '1';
  } catch (error) {
    return false;
  }
}

/** 3D 场景地面上的点 (X, Z)(米)→ 整图像素(左上原点)。 */
export function pre25GroundToPx(X: number, Z: number): [number, number] {
  const dx = X - D.c0[0];
  const dz = Z - D.c0[2];
  const sx = -dx * HZ + dz * HX;
  const sy = (dx * HX + dz * HZ) * Math.sin(P);
  return [(sx - D.plane[0]) * D.ppm, (D.plane[3] - sy) * D.ppm];
}

/** 整图像素 → 2D 世界坐标(整图中心 = 原点,y 往上)。 */
export function pre25PxToWorld(ix: number, iy: number): { x: number; y: number } {
  return { x: Math.round((ix - IW / 2) * U), y: Math.round((IH / 2 - iy) * U) };
}

/** 3D 地面点 → 2D 世界坐标。 */
export function pre25Ground(X: number, Z: number): { x: number; y: number } {
  const [ix, iy] = pre25GroundToPx(X, Z);
  return pre25PxToWorld(ix, iy);
}

/** 2D 世界坐标 → 3D 地面点 (X, Z)(米)。pre25Ground 的反算。 */
export function pre25WorldToGround(x: number, y: number): [number, number] {
  const ix = x / U + IW / 2;
  const iy = IH / 2 - y / U;
  const sx = ix / D.ppm + D.plane[0];
  const sy = D.plane[3] - iy / D.ppm;
  const t = sy / Math.sin(P);
  return [D.c0[0] - sx * HZ + t * HX, D.c0[2] + sx * HX + t * HZ];
}

/**
 * 站在高出地面的可走面上时人物要抬高多少米:主城 v4 的上城(+3 米)、台阶、坡道、桥面。高度图由 build_map.py 从布局
 * (city_plan_v4.py 的高度图,桥面按桥模型量过的高度表放大)写进 PRE25_CITY_DATA.height(地面坐标,0.1 米一档,行程编码)。
 * 可走格 / 人物的逻辑位置都按地面投影算,画的时候按这里的高度往上挪、遮挡也按抬高后的脚底比深度。
 */
const HG = (D as unknown as { height?: { x0: number; z0: number; res: number; w: number; h: number; rle: number[] } }).height;
let HGRID: Uint8Array | null = null;
export function pre25Lift(x: number, y: number): number {
  if (!HG) {
    return 0;
  }
  if (!HGRID) {
    HGRID = new Uint8Array(HG.w * HG.h);
    let k = 0;
    for (let i = 0; i < HG.rle.length; i += 2) {
      HGRID.fill(HG.rle[i], k, k + HG.rle[i + 1]);
      k += HG.rle[i + 1];
    }
  }
  const [X, Z] = pre25WorldToGround(x, y);
  const fx = (X - HG.x0) * HG.res - 0.5;
  const fz = (Z - HG.z0) * HG.res - 0.5;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= HG.w - 1 || j >= HG.h - 1) {
    return 0;
  }
  const u = fx - i;
  const v = fz - j;
  const g = HGRID;
  const at = (a: number, b: number): number => g[b * HG.w + a] / 10;
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}

/** 运行时(Pre25Actors)要的几个数:整图尺寸、每像素世界单位、深度编码、块。 */
export const PRE25_CITY_RUNTIME = {
  px: [IW, IH] as [number, number],
  unit: U,
  ppm: D.ppm,
  tanP: Math.tan(P),
  sinP: Math.sin(P),
  cosP: Math.cos(P),
  /** 画面上方对应的地面方向 (X, Z)、画面右方对应的地面方向 (X, Z)。 */
  up: [HX, HZ] as [number, number],
  right: [-HZ, HX] as [number, number],
  near: D.near,
  far: D.far,
  dist: D.dist,
  /** 画面平面上的「上」边(米):整图 y = 0 那一行。 */
  planeTop: D.plane[3],
  chunk: D.chunk,
  grid: D.grid as unknown as [number, number],
  occPath: (r: number, c: number): string => `${DIR}/o_${r}_${c}/texture`,
};

const MAP_W = Math.round(IW * U);
const MAP_H = Math.round(IH * U);

// ── 地面颜色块:贴地件,中心对齐 ──
// 整城(第 1 期)只存了城墙以内用得到的块(D.chunks);没有这张表的旧数据就按整个网格铺
const CHUNKS: Array<[number, number]> = ((D as any).chunks as Array<[number, number]> | undefined)
  ?? Array.from({ length: D.grid[0] * D.grid[1] }, (_, i) => [Math.floor(i / D.grid[0]), i % D.grid[0]] as [number, number]);
/**
 * 地面颜色块不交给渲染器当贴地件一次铺完(整城约 160 块,全载显存五六百 MB、进图要全部下完):
 * 由 Pre25Actors 跟着镜头只载看得见的那几块(外加一圈余量),走远了释放;进图先等眼前这几块到齐再显示。
 */
export const PRE25_CHUNKS = CHUNKS.map(([r, c]) => ({
  r, c, path: `${DIR}/c_${r}_${c}/spriteFrame`,
  x: ((c + 0.5) * D.chunk - IW / 2) * U, y: (IH / 2 - (r + 0.5) * D.chunk) * U, size: D.chunk * U,
}));
const PROPS: WorldMapProp[] = [];

// ── NPC:旧主城的站立图,按整城平面摆在各自的街区(3D 场景坐标,米;X 往东、Z 往南;见 tools/proto3d/pre25/city_plan.py)──
const CITY4 = (name: string): string => `ui/world/city4/${name}/spriteFrame`;
// 11-19 整城:斜视角下一栋楼会盖住它身后(画面上方)约「楼高」那么远的街面,NPC 贴着楼背后站就像站在屋檐上。
// 点位按整城深度图挑的:脚下往前一段地面要露着、身子不被挡、周围 1.2 米能走(挑点脚本思路见 pre25-phase0 记忆)。
const NPCS: Array<[WorldNpcCode, string, string, number, number, 1 | -1]> = [
  // 主城 v4(11-19):功能 NPC 都在罗盘广场一圈 40 米内;点位见 tools/proto3d/pre25/city_plan_v4.py 的 NPCS
  ['BARD', '吟游诗人 · 林恩', 'city4_npc_bard', -6.5, 3.2, 1],
  ['FLOWER_GIRL', '卖花姑娘 · 艾米', 'city4_npc_flower_girl', 4, 4, -1],
  ['OLD_MAN', '老镇民 · 霍克', 'city4_npc_old_man', 4, -5.5, 1],
  ['SCHOLAR', '帝国学者 · 艾德里安', 'city4_npc_scholar', -32, -58, 1],
  ['GUILDMASTER', '公会会长 · 维克', 'city4_npc_guildmaster', -34, -4, 1],
  ['INNKEEPER', '酒馆老板 · 巴克', 'city4_npc_innkeeper', -8, 28, 1],
  ['MERCHANT', '杂货商 · 托比', 'city4_npc_merchant', -26, 22, -1],
  ['VENDOR', '果摊大婶 · 玛莎', 'city4_npc_vendor', -18, 29, 1],
  ['CHILD', '小汤姆', 'city4_npc_child', -30, 30, 1],
  ['CAPTAIN', '卫队长 · 罗兰', 'city4_npc_captain', 92, 4, -1],
  ['GUARD_E', '城门卫兵', 'city4_npc_guard', 112.8, 2.3, -1],
  ['GUARD_S', '城门卫兵', 'city4_npc_guard', -62, 76.5, 1],
];
const NPC_LIST: WorldMapNpc[] = NPCS.map(([code, name, art, X, Z, flip]) => ({ code, name, asset: CITY4(art), ...pre25Ground(X, Z), height: 215, flip }));

/** 灯 → 光晕(整图像素 → 世界);路灯 / 火盆这类已经画在底图里,这里只补一层会起伏的暖光。 */
const WARM: [number, number, number] = [255, 178, 98];
const GLOWS = (D.lights as unknown as Array<[number, number, string, number[]]>)
  .filter(([, , kind]) => kind !== 'fill' && kind !== 'moon')
  .map(([ix, iy, kind]) => ({ ...pre25PxToWorld(ix, iy), r: (kind === 'brazier' ? 150 : 110) * U, color: WARM, alpha: 40, flicker: 0.12 }));

const SCENE: WorldSceneDef = {
  // 不用遮挡条(遮挡靠逐像素比深度),底图块 / 遮罩都空着
  tiles: { base: [], masks: [], cols: 1, tileW: D.chunk, tileH: D.chunk, pad: [0, 0] },
  px: [IW, IH],
  unit: U,
  strips: [],
  walk: { cell: D.walk.cell, cols: D.walk.cols, rows: D.walk.rows as unknown as string[] },
  dot: 'ui/world/citymoon/fx_dot/spriteFrame',
  glows: GLOWS,
  flames: [],
  smokes: [],
  mist: { tint: [150, 176, 220], alpha: 14 },
  walkers: [],
  idlers: [],
};

const SPAWN = pre25Ground(-14, 0);
const WAYPOINT = pre25Ground(-2.5, 1.8);

export const CITY_PRE25: WorldMapDef = {
  code: 'CITY',
  name: '主城',
  levelText: '',
  actorTint: [214, 222, 246],
  ambient: false,
  // 视角 D(地图每米 120 像素、一个地图像素 1.42 世界单位):1080 高的电脑屏上一个地图像素约 1 个屏幕像素,和用户挑的样图一样近
  cameraZoom: 1.7,
  width: MAP_W,
  height: MAP_H,
  walk: { left: -MAP_W / 2 + 12, right: MAP_W / 2 - 12, bottom: -MAP_H / 2 + 12, top: MAP_H / 2 - 12 },
  openWalk: true,
  spawn: SPAWN,
  ground: TOWN_GROUND_ASSET,
  // 底纹只当整图外沿黑角的兜底:按地图块的边长平铺(整城 2.7 万宽,按 360 铺要 4500 个节点)
  groundTile: Math.max(TOWN_GROUND_TILE, D.chunk * PRE25_CITY_RUNTIME.unit),
  buildings: [],
  npcs: NPC_LIST,
  props: PROPS,
  lamps: [],
  lampAsset: TOWN_LAMP_ASSET,
  // 罗盘是底图里拍好的;传送阵的光效 / 交互照常
  waypoint: { ...WAYPOINT, drawn: false },
  places: [
    { name: '罗盘广场', ...WAYPOINT, icon: 'portal' },
    { name: '圣辉大教堂', ...pre25Ground(26, -32), icon: 'place' },
    { name: '帝国学院', ...pre25Ground(-32, -60), icon: 'npc' },
    { name: '佣兵公会', ...pre25Ground(-42, -8), icon: 'npc' },
    { name: '金麦酒馆', ...pre25Ground(-8, 26), icon: 'npc' },
    { name: '桥头集市', ...pre25Ground(-22, 26), icon: 'npc' },
    { name: '王都兵营', ...pre25Ground(96, 6), icon: 'place' },
    { name: '王都花园', ...pre25Ground(-66, -50), icon: 'place' },
    { name: '主桥', ...pre25Ground(-36, 40), icon: 'place' },
    { name: '港口', ...pre25Ground(60, 96), icon: 'place' },
    { name: '东门', ...pre25Ground(114, 6), icon: 'place' },
    { name: '西南门', ...pre25Ground(-64, 78), icon: 'place' },
  ],
  camps: [],
  // 主城 v4:西南门 → 村外林地(主轴起点),东门 → 灰岩荒原;出口圈在门洞里面一点
  exits: [
    { key: 'to_woods', label: '前往 · 村外林地', ...pre25Ground(-65, 79), radius: 140, toMap: 'WOODS', toSpawn: { x: 8250, y: 788 } },
    { key: 'to_gray', label: '前往 · 灰岩荒原', ...pre25Ground(114, 6), radius: 140, toMap: 'GRAY', toSpawn: { x: -8560, y: -190 } },
  ],
  scene: SCENE,
  minimapArt: `${DIR}/overview/spriteFrame`,
};

/** 别的地图通往主城的落点(出口圈里面一点)。 */
export const CITY_PRE25_ENTRY = {
  fromWoods: pre25Ground(-61, 74),
  fromGray: pre25Ground(108, 6),
};
