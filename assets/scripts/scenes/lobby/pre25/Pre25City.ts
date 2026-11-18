import type { WorldMapDef, WorldMapNpc, WorldMapProp, WorldNpcCode, WorldSceneDef } from '../LobbyWorldMaps';
import { TOWN_GROUND_ASSET, TOWN_GROUND_TILE, TOWN_LAMP_ASSET } from '../LobbyTownConfig';
import { PRE25_CITY_DATA } from './Pre25CityData';

/**
 * 预渲染 2.5D 主城(整体 3D 化方案第 0 期,2026-11-18;默认关,地址带 ?pre25=1 或 localStorage.lcPre25 = '1' 才换上)。
 *
 * 画面是 3D 主城广场小样用正交投影、固定俯角(42°)离线拍的整图(tools/proto3d/pre25:capture_map.py 拍、build_map.py 拼图切块),
 * 运行时就是普通 2D:地面颜色块当贴地件铺,人物被建筑 / 树挡住靠逐像素比深度(effects/pre25-actor + Pre25Actors.ts)。
 * 跑图逻辑(可走格、NPC、出口、传送阵、任务追踪、坐标上报)全部沿用 LobbyTownRenderer,这里只给一份 WorldMapDef。
 *
 * 第 0 期只拍了中心广场(约 46 × 48 米);NPC 先用旧主城的站立图摆在广场空地上,出口摆在广场边上,整城布局等第 1 期出原型。
 */
const D = PRE25_CITY_DATA;
const [IW, IH] = D.px;
const U = D.unit;
const P = (D.pitch * Math.PI) / 180;
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
  const sx = Z - D.c0[2];
  const sy = (X - D.c0[0]) * Math.sin(P);
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

/** 运行时(Pre25Actors)要的几个数:整图尺寸、每像素世界单位、深度编码、块。 */
export const PRE25_CITY_RUNTIME = {
  px: [IW, IH] as [number, number],
  unit: U,
  ppm: D.ppm,
  tanP: Math.tan(P),
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
const PROPS: WorldMapProp[] = [];
for (let r = 0; r < D.grid[1]; r += 1) {
  for (let c = 0; c < D.grid[0]; c += 1) {
    const cx = (c + 0.5) * D.chunk;
    const cy = (r + 0.5) * D.chunk;
    PROPS.push({ asset: `${DIR}/c_${r}_${c}/spriteFrame`, x: (cx - IW / 2) * U, y: (IH / 2 - cy) * U, width: D.chunk * U, flat: true });
  }
}

// ── NPC:旧主城的站立图,先摆在广场空地上(3D 场景坐标,米;X 往东 = 画面上方,Z 往南 = 画面右边)──
const CITY4 = (name: string): string => `ui/world/city4/${name}/spriteFrame`;
const NPCS: Array<[WorldNpcCode, string, string, number, number, 1 | -1]> = [
  ['SCHOLAR', '帝国学者 · 艾德里安', 'city4_npc_scholar', 8.6, -3.6, 1],
  ['GUILDMASTER', '公会会长 · 维克', 'city4_npc_guildmaster', -12.0, -1.0, 1],
  ['CAPTAIN', '卫队长 · 罗兰', 'city4_npc_captain', -12.0, 7.0, -1],
  ['MERCHANT', '杂货商 · 托比', 'city4_npc_merchant', -1.0, 7.0, -1],
  ['INNKEEPER', '酒馆老板 · 巴克', 'city4_npc_innkeeper', 5.0, -5.0, 1],
  ['BARD', '吟游诗人 · 林恩', 'city4_npc_bard', -6.5, 3.2, 1],
  ['OLD_MAN', '老镇民 · 霍克', 'city4_npc_old_man', 4.0, 6.0, -1],
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
  // 1080 高的电脑屏上一个地图像素约 0.9 个屏幕像素(1.3 时放大到 1.28 倍,发糊)
  cameraZoom: 1.8,
  width: MAP_W,
  height: MAP_H,
  walk: { left: -MAP_W / 2 + 12, right: MAP_W / 2 - 12, bottom: -MAP_H / 2 + 12, top: MAP_H / 2 - 12 },
  openWalk: true,
  spawn: SPAWN,
  ground: TOWN_GROUND_ASSET,
  groundTile: TOWN_GROUND_TILE,
  buildings: [],
  npcs: NPC_LIST,
  props: PROPS,
  lamps: [],
  lampAsset: TOWN_LAMP_ASSET,
  // 罗盘是底图里拍好的;传送阵的光效 / 交互照常
  waypoint: { ...WAYPOINT, drawn: false },
  places: [
    { name: '罗盘广场', ...WAYPOINT, icon: 'portal' },
    { name: '圣辉大教堂', ...pre25Ground(10.5, 0), icon: 'place' },
    { name: '铁匠铺', ...pre25Ground(-9, -10), icon: 'npc' },
  ],
  camps: [],
  exits: [
    { key: 'to_woods', label: '前往 · 村外林地', ...pre25Ground(-19.2, 1.0), radius: 140, toMap: 'WOODS', toSpawn: { x: 8250, y: 788 } },
    { key: 'to_gray', label: '前往 · 灰岩荒原', ...pre25Ground(-4.0, 13.6), radius: 140, toMap: 'GRAY', toSpawn: { x: -8560, y: -190 } },
  ],
  scene: SCENE,
  minimapArt: `${DIR}/overview/spriteFrame`,
};

/** 别的地图通往主城的落点(出口圈里面一点)。 */
export const CITY_PRE25_ENTRY = {
  fromWoods: pre25Ground(-17.2, 1.0),
  fromGray: pre25Ground(-4.0, 12.0),
};
