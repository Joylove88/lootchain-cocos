/**
 * 跑图世界地图定义(docs/50 P1):新手村「晨风村」/ 村外林地 / 主城 / 灰岩荒原。
 * 坐标系同主城(LobbyTownConfig):世界单位 = 900 高舞台设计像素,y 向上,地图中心为原点;
 * 建筑 (x, y) = 贴图底边中点(脚线),footprint 从脚线往屏幕上方延伸的不可走矩形,door = 交互点(相对脚线)。
 */
import type { WorldMapCode } from '../../types/WorldTypes';
import {
  TOWN_BUILDINGS,
  TOWN_GROUND_ASSET,
  TOWN_GROUND_TILE,
  TOWN_LAMPS,
  TOWN_LAMP_ASSET,
  TOWN_MAP,
  TOWN_PROPS,
  TOWN_SPAWN,
  TOWN_WALK_BOUNDS,
  townBuildingAsset,
  townPropAsset,
  type TownAction,
} from './LobbyTownConfig';

export type WorldNpcCode = 'CHIEF' | 'INSTRUCTOR' | 'PRIEST' | 'SMITH' | 'BOARD';

export const WORLD_ASSET_DIR = 'ui/world';
export function worldAsset(name: string): string {
  return `${WORLD_ASSET_DIR}/${name}/spriteFrame`;
}

export interface WorldMapBuilding {
  key: string;
  label: string;
  asset: string;
  /** TownAction = 打开功能页;npc = 和 npc 字段的 NPC 对话;none = 纯装饰建筑(只挡路)。 */
  action: TownAction | 'npc' | 'none';
  npc?: WorldNpcCode;
  x: number;
  y: number;
  width: number;
  footprint: { w: number; d: number };
  door: { x: number; y: number };
}

export interface WorldMapNpc {
  code: WorldNpcCode;
  name: string;
  /** 地图上的站立图(无则不画,只作为对话交互点)。 */
  asset: string | null;
  x: number;
  y: number;
  height: number;
  /** 1 = 图朝右不翻;-1 = 水平翻转。 */
  flip: 1 | -1;
}

export interface WorldMapProp {
  asset: string;
  x: number;
  y: number;
  width: number;
  flat?: boolean;
  tilt?: number;
  /** 旋转角度(度,逆时针);贴地小路 / 溪流段拼弯用。 */
  angle?: number;
  /** 水平翻转。 */
  flipX?: boolean;
  /** 河道 / 瀑布件:挂流水着色器(effects/world-water,按颜色识别水面和白沫)。 */
  water?: boolean;
  /** 立物强制随风摆 / 不摆(默认按素材名判断:树 / 灌木 / 草丛)。 */
  sway?: boolean;
  block?: { w: number; d: number };
}

/** 野外怪群:地图上营地中心 + 游走半径;碰到其中任意一只即开 stageCode 这场战斗。 */
export interface WorldMapCamp {
  stageCode: string;
  label: string;
  monsterCode: string;
  spine: string;
  count: number;
  elite: boolean;
  level: number;
  x: number;
  y: number;
  radius: number;
}

/** 走出地图的出口(走进圈里切到 toMap 的 toSpawn)。 */
export interface WorldMapExit {
  key: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  toMap: WorldMapCode;
  toSpawn: { x: number; y: number };
  /** 剧情:走出这个出口时上报 REACH(如村口)。 */
  reach?: string;
}

/** 地图级挡路区(河面 / 水潭 / 崖口):x 为中心,y 为下沿,向上 d。 */
export interface WorldMapBlock {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface WorldMapDef {
  code: WorldMapCode;
  name: string;
  /** 世界地图上的等级段文案。 */
  levelText: string;
  width: number;
  height: number;
  walk: { left: number; right: number; bottom: number; top: number };
  spawn: { x: number; y: number };
  ground: string;
  groundTile: number;
  buildings: WorldMapBuilding[];
  npcs: WorldMapNpc[];
  props: WorldMapProp[];
  lamps: Array<{ x: number; y: number }>;
  lampAsset: string;
  /** 传送阵位置(脚线);主城的就是广场罗盘中心。 */
  waypoint: { x: number; y: number; drawn: boolean };
  camps: WorldMapCamp[];
  exits: WorldMapExit[];
  /** 野外战斗背景(ui/battle 下的名字)。 */
  battleBg?: string;
  /** 环境动效:飘落树叶 + 云影(LobbyTownAmbient)。 */
  ambient?: boolean;
  /** 地图级挡路区(不依附素材的水面 / 崖口)。 */
  blocks?: WorldMapBlock[];
}

const MONSTER_SPINE: Record<string, string> = {
  MINI_RAT: 'spine/monster/mini_rat/mini_001',
  SMALL_SPIDER: 'spine/monster/small_spider/small_base_001',
  MEDIUM_BEAR: 'spine/monster/medium_bear/medium_base_001',
  MEDIUM_DOG: 'spine/monster/medium_dog/medium_base_001',
  SWORD_MALE: 'spine/monster/sword_male/sword_001',
  BOW_MALE: 'spine/monster/bow_male/bow_001',
  GARGOYLE: 'spine/monster/gargoyle/twohand_spear_001',
};

function camp(stageCode: string, label: string, monsterCode: string, count: number, level: number, x: number, y: number, elite = false): WorldMapCamp {
  return { stageCode, label, monsterCode, spine: MONSTER_SPINE[monsterCode] ?? '', count, elite, level, x, y, radius: elite ? 90 : 170 };
}

/** 晨风村 v2 素材(docs/53 §4.1,2026-10-29;tools/qa/village2_install_assets.py 入库)。 */
const V2 = (name: string): string => worldAsset(`vil2/vil2_${name}`);

/**
 * 夯土路网:沿折线每隔 0.38 个路宽盖一枚柔边土色笔刷(vil2_road_brush,同一张图合批),连成弯曲连续的路;
 * 笔刷保持正圆(渲染层先压 tilt 再转角,压扁后乱转会粗细不均),逐枚转角度 + 微调大小,避免重复纹理。
 */
function roads(lines: number[][][], width: number, brush = V2('road_brush')): WorldMapProp[] {
  const out: WorldMapProp[] = [];
  const step = width * 0.38;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let k = i === 0 ? 0 : 1; k <= n; k += 1) {
        const f = k / n;
        const j = out.length;
        out.push({ asset: brush, x: Math.round(ax + (bx - ax) * f), y: Math.round(ay + (by - ay) * f), width: Math.round(width * (0.92 + ((j * 37) % 17) / 100)), flat: true, angle: (j * 47) % 360 });
      }
    }
  }
  return out;
}

/** 晨风村 v3 素材(2026-10-29 用户:偏卡通 → 按用户鸟瞰图出写实件;tools/qa/village3_assets_gen.py + village3_install_assets.py)。 */
const V3 = (name: string): string => worldAsset(`vil3/vil3_${name}`);

/** 晨风村路网(世界坐标折线):路笔刷 + 草丛避让共用。 */
const VILLAGE_ROADS: number[][][] = [
  [[784, -630], [576, -374], [480, -118], [384, 42], [272, 330], [192, 618]],
  [[-448, 234], [-768, 426], [-1152, 506], [-1408, 570]],
  [[192, 714], [544, 762], [864, 634]],
  [[1184, -566], [1728, -534], [2432, -454], [2528, -118], [2304, 266], [1920, 314]],
  [[1024, -806], [1600, -918], [2208, -1094], [2720, -1206], [3200, -1270]],
  [[416, -822], [-128, -1142], [-736, -1078], [-1248, -822], [-1664, -534], [-2144, -326], [-2560, -198], [-2912, -54]],
  [[-1248, -822], [-1120, -630]],
  [[480, -118], [800, -246], [1056, -406]],
];

/** 点到折线最近距离(草丛 / 花丛撒点避开路面)。 */
function distToRoads(x: number, y: number, lines: number[][][]): number {
  let best = Infinity;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1, dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
  }
  return best;
}

/** 随风摆的草丛:网格抖动撒点(固定种子),避开路面 / 建筑 / 水面挡块。 */
function grassTufts(def: { walk: WorldMapDef['walk']; buildings: WorldMapBuilding[]; blocks?: WorldMapBlock[] }, roads: number[][][], step: number): WorldMapProp[] {
  const out: WorldMapProp[] = [];
  let seed = 11;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let y = def.walk.bottom + step / 2; y < def.walk.top; y += step) {
    for (let x = def.walk.left + step / 2; x < def.walk.right; x += step) {
      const px = Math.round(x + (rand() - 0.5) * step * 0.9);
      const py = Math.round(y + (rand() - 0.5) * step * 0.9);
      if (rand() < 0.35 || distToRoads(px, py, roads) < 140) {
        continue;
      }
      const inBuilding = def.buildings.some((b) => Math.abs(px - b.x) < b.width * 0.5 && py > b.y - 60 && py < b.y + b.width * 0.55);
      const inBlock = (def.blocks ?? []).some((b) => Math.abs(px - b.x) < b.w / 2 + 40 && py > b.y - 40 && py < b.y + b.d + 40);
      if (inBuilding || inBlock) {
        continue;
      }
      out.push({ asset: V3('grass_tuft'), x: px, y: py, width: Math.round(70 + rand() * 50), flipX: rand() < 0.5 });
    }
  }
  return out;
}

/** 地表贴花(裸土斑 / 苔石堆 / 杂草斑):固定种子撒满可走区,避开建筑和水面挡块,打散大片草地(10-29 用户:地形偏卡通)。 */
function groundDecals(def: { walk: WorldMapDef['walk']; buildings: WorldMapBuilding[]; blocks?: WorldMapBlock[] }, step: number): WorldMapProp[] {
  const out: WorldMapProp[] = [];
  const kinds = ['decal_weeds', 'decal_dirt', 'decal_weeds', 'decal_moss'];
  let seed = 23;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  let n = 0;
  for (let y = def.walk.bottom - 100; y < def.walk.top + 200; y += step * 0.62) {
    for (let x = def.walk.left - 200; x < def.walk.right + 300; x += step) {
      const px = Math.round(x + (rand() - 0.5) * step * 0.8);
      const py = Math.round(y + (rand() - 0.5) * step * 0.5);
      const inBuilding = def.buildings.some((b) => Math.abs(px - b.x) < b.width * 0.42 && py > b.y && py < b.y + b.width * 0.4);
      const inBlock = (def.blocks ?? []).some((b) => Math.abs(px - b.x) < b.w / 2 && py > b.y && py < b.y + b.d);
      if (inBuilding || inBlock || rand() < 0.2) {
        continue;
      }
      const kind = kinds[n % kinds.length];
      n += 1;
      const base = kind === 'decal_moss' ? 300 : kind === 'decal_dirt' ? 420 : 560;
      out.push({ asset: V3(kind), x: px, y: py, width: Math.round(base * (0.75 + rand() * 0.5)), flat: true, flipX: rand() < 0.5 });
    }
  }
  return out;
}

/**
 * 晨风村 v3(2026-10-29 用户:「按我提供的鸟瞰图 1:1 还原 / 当前偏卡通」):
 * 坐标按用户鸟瞰图(2000×967)换算:世界 x = (原型 x - 1000) × 3.2,y = (483 - 原型 y) × 3.2;地图 6400×3100。
 * 北:村长屋(石台 + 台阶);西北:礼拜堂 + 圣契祭坛 + 瀑布崖;西:风车坡 + 溪流;中:河潭 + 木桥 + 跌水瀑布 + 水车磨坊;
 * 东北:训练场;东:铁匠铺 + 悬崖河谷;南:村口广场(传送阵)+ 民居;西南:麦田 + 菜园 + 南崖;东南:村口 → 村外林地。
 * 水面 / 瀑布件挂流水着色器;树 / 灌木 / 草丛随风摆;飘叶 + 云影(ambient)。
 */
const VILLAGE_BASE = {
  walk: { left: -2900, right: 2560, bottom: -1150, top: 1300 },
  buildings: [
    { key: 'chief', label: '村长屋', asset: V3('chief_house'), action: 'npc', npc: 'CHIEF', x: -48, y: 654, width: 1280, footprint: { w: 704, d: 260 }, door: { x: 230, y: -40 } },
    { key: 'altar', label: '圣契祭坛', asset: V3('altar'), action: 'npc', npc: 'PRIEST', x: -1472, y: 606, width: 768, footprint: { w: 461, d: 150 }, door: { x: 0, y: -60 } },
    { key: 'training', label: '训练场', asset: V3('training'), action: 'npc', npc: 'INSTRUCTOR', x: 1760, y: 366, width: 1888, footprint: { w: 1548, d: 520 }, door: { x: -560, y: -40 } },
    { key: 'smithy', label: '铁匠铺', asset: V3('smithy'), action: 'npc', npc: 'SMITH', x: 2080, y: -370, width: 992, footprint: { w: 694, d: 240 }, door: { x: -60, y: -60 } },
    { key: 'chapel', label: '礼拜堂', asset: V3('chapel'), action: 'none', x: -1880, y: 798, width: 496, footprint: { w: 347, d: 200 }, door: { x: 0, y: -60 } },
    { key: 'windmill', label: '风车', asset: V3('windmill'), action: 'none', x: -2384, y: -226, width: 765, footprint: { w: 344, d: 220 }, door: { x: 0, y: -60 } },
    { key: 'watermill', label: '水车磨坊', asset: V3('watermill'), action: 'none', x: -1088, y: -562, width: 672, footprint: { w: 403, d: 160 }, door: { x: 0, y: -60 } },
    { key: 'shed_a', label: '小棚', asset: V3('shed_a'), action: 'none', x: -1568, y: -162, width: 288, footprint: { w: 202, d: 90 }, door: { x: 0, y: -40 } },
    { key: 'shed_b', label: '民居', asset: V3('shed_b'), action: 'none', x: 800, y: 222, width: 352, footprint: { w: 246, d: 110 }, door: { x: 0, y: -40 } },
    { key: 'market', label: '集市', asset: V3('market_house'), action: 'none', x: 1088, y: -370, width: 672, footprint: { w: 437, d: 170 }, door: { x: 0, y: -60 } },
    { key: 'house_w', label: '民居', asset: V3('house_w'), action: 'none', x: -80, y: -1010, width: 576, footprint: { w: 392, d: 190 }, door: { x: 0, y: -60 } },
    { key: 'house_s', label: '民居', asset: V3('house_s'), action: 'none', x: 1472, y: -1202, width: 608, footprint: { w: 413, d: 180 }, door: { x: 0, y: -60 } },
    { key: 'shed_sw', label: '农舍', asset: V3('shed_sw'), action: 'none', x: -1616, y: -1074, width: 448, footprint: { w: 314, d: 150 }, door: { x: 0, y: -50 } },
    { key: 'gate', label: '村口', asset: V3('gate'), action: 'none', x: 2208, y: -1106, width: 416, footprint: { w: 62, d: 40 }, door: { x: 0, y: -40 } },
  ] as WorldMapBuilding[],
  // 水面 / 瀑布 / 崖口(桥面、台阶留空可走)
  blocks: [
    { x: -2272, y: 170, w: 1312, d: 300 },
    { x: -1144, y: -246, w: 1264, d: 620 },
    { x: -240, y: -246, w: 480, d: 250 },
    { x: -224, y: 290, w: 420, d: 180 },
    { x: -736, y: -700, w: 700, d: 460 },
    { x: -2560, y: 760, w: 760, d: 600 },
  ] as WorldMapBlock[],
};

const VILLAGE: WorldMapDef = {
  code: 'VILLAGE',
  ambient: true,
  name: '晨风村',
  levelText: 'Lv.1-10',
  width: 6400,
  height: 3100,
  walk: VILLAGE_BASE.walk,
  spawn: { x: 784, y: -820 },
  ground: worldAsset('ground_village3'),
  // 10-29 写实草甸底纹(按用户鸟瞰图出),一格 1000 世界单位
  groundTile: 1000,
  buildings: VILLAGE_BASE.buildings,
  blocks: VILLAGE_BASE.blocks,
  npcs: [
    { code: 'CHIEF', name: '村长 · 老霍恩', asset: worldAsset('npc_chief'), x: 300, y: 600, height: 210, flip: -1 },
    { code: 'INSTRUCTOR', name: '教官 · 格雷', asset: worldAsset('npc_instructor'), x: 1130, y: 300, height: 215, flip: 1 },
    { code: 'PRIEST', name: '祭司 · 莉娅', asset: worldAsset('npc_priest'), x: -1290, y: 520, height: 200, flip: -1 },
    { code: 'SMITH', name: '铁匠 · 巴洛', asset: worldAsset('npc_smith'), x: 1900, y: -470, height: 215, flip: -1 },
  ],
  props: [
    // ── 贴地(先画的在下):地表贴花 → 崖 / 水 → 路 → 桥 / 广场 / 菜园 ──
    ...groundDecals(VILLAGE_BASE, 520),
    { asset: V3('nw_falls'), x: -2672, y: 1066, width: 1056, flat: true, water: true },
    { asset: V3('river_w'), x: -2272, y: 330, width: 1312, flat: true, water: true },
    { asset: V3('river_c'), x: -864, y: 122, width: 1824, flat: true, water: true },
    { asset: V3('falls'), x: -736, y: -374, width: 928, flat: true, water: true },
    { asset: V3('east_cliff'), x: 2872, y: 362, width: 656, flat: true, water: true },
    { asset: V3('cliff_s'), x: -1664, y: -1338, width: 1504, flat: true },
    ...roads(VILLAGE_ROADS, 210, V3('road_brush')),
    { asset: V3('bridge'), x: -48, y: 202, width: 896, flat: true },
    { asset: V3('plaza'), x: 784, y: -630, width: 960, flat: true },
    { asset: V3('veg'), x: -1712, y: -1062, width: 704, flat: true },
    // ── 立物 ──
    { asset: V3('wheat'), x: -2544, y: -1142, width: 1312, block: { w: 1100, d: 520 } },
    { asset: V3('hay'), x: -848, y: -1180, width: 384, block: { w: 280, d: 90 } },
    // 外圈林子(出可走范围)+ 村内零散树
    ...[[-3100, 1450], [-2300, 1500], [-1500, 1480], [-800, 1520], [300, 1500], [900, 1480], [1500, 1500], [2200, 1480], [2700, 1420],
      [-3150, 600], [-3150, -300], [-3100, -1000], [2750, -800], [2700, -1350], [1900, -1420], [900, -1450], [-300, -1450], [-1000, -1420], [-2400, -1450]]
      .map(([x, y], i) => ({ asset: V3(i % 3 === 0 ? 'tree_pine' : 'tree_oak'), x, y, width: i % 3 === 0 ? 380 : 520 })),
    ...[[-700, 900], [-560, 1150], [600, 1150], [1050, 1180], [-1100, 1200], [420, 1000], [680, 470], [1500, -150], [2380, -780],
      [-300, -520], [-520, -820], [-2000, -700], [-2650, -620], [220, -1300], [620, -1260], [-2750, 700], [2480, 760], [-1300, 950]]
      .map(([x, y], i) => ({ asset: V3(i % 2 === 0 ? 'tree_oak' : 'tree_pine'), x, y, width: i % 2 === 0 ? 460 : 330, block: { w: 120, d: 50 } })),
    ...[[-900, 700], [-60, 470], [1300, 0], [2300, -250], [-1900, -450], [-2300, 500], [400, -1100], [1150, -1100], [-450, 1050], [1250, 1050]]
      .map(([x, y]) => ({ asset: V3('bush'), x, y, width: 190 })),
    // 10-29 按用户鸟瞰图补树丛(原型树位换算,已剔除路 / 建筑 / 水面 / 麦田)
    ...[[-1408, 1418], [-1152, 1354], [-960, 1450], [-864, 1162], [736, 1194], [2816, 1418], [416, 490], [1472, 170], [2432, -694], [1920, -1206], [1760, -1334], [960, -1334],
      [320, -1270], [-160, -1334], [-3008, -246], [-1024, 746], [128, -246], [1920, -758], [2688, -886], [2880, -694], [-1216, -1206], [-2240, -1270], [-2784, -1270]]
      .flatMap(([x, y], i) => [
        { asset: V3(i % 3 === 1 ? 'tree_pine' : 'tree_oak'), x, y, width: i % 3 === 1 ? 340 : 440 + (i % 4) * 30, block: { w: 110, d: 50 } },
        { asset: V3('bush'), x: x + (i % 2 ? 150 : -160), y: y - 40, width: 150 + (i % 3) * 20 },
      ]),
    ...grassTufts(VILLAGE_BASE, VILLAGE_ROADS, 260),
    // 广场旗
    ...[[400, -470], [1180, -470], [1290, -660]].map(([x, y]) => ({ asset: V2('banner'), x, y, width: 110 })),
  ],
  lamps: [{ x: 560, y: -300 }, { x: 1300, y: -560 }, { x: 340, y: 330 }, { x: -700, y: 440 }, { x: 1900, y: -1010 }, { x: -1250, y: -760 }],
  lampAsset: V2('lamp'),
  // 村口广场中心(原型:广场正中圆形传送阵)
  waypoint: { x: 784, y: -630, drawn: true },
  camps: [camp('FIELD_VILLAGE_T', '训练用幼鼠', 'MINI_RAT', 1, 1, 1100, 100)],
  exits: [{ key: 'to_woods', label: '前往 · 村外林地', x: 2470, y: -1070, radius: 130, toMap: 'WOODS', toSpawn: { x: -1600, y: 0 }, reach: 'VILLAGE_GATE' }],
};

const WOODS: WorldMapDef = {
  code: 'WOODS',
  ambient: true,
  name: '村外林地',
  levelText: 'Lv.1-10',
  width: 4000,
  height: 2400,
  walk: { left: -1850, right: 1850, bottom: -1050, top: 950 },
  spawn: { x: -1600, y: 0 },
  ground: worldAsset('ground_forest'),
  // 10-29 平滑手绘林地(docs/53 §4.3):暗土 + 柔苔大色块,一格 1000 世界单位
  groundTile: 1000,
  buildings: [],
  npcs: [],
  props: [
    ...[[-1500, 700], [-900, 820], [-200, 760], [500, 840], [1200, 760], [1700, 640], [-1700, -800], [-1000, -880], [-300, -760], [400, -900], [1100, -820], [1750, -700], [0, 150]]
      .map(([x, y]) => ({ asset: worldAsset('fld_forest_trees'), x, y, width: 360, block: { w: 200, d: 80 } })),
    { asset: worldAsset('fld_forest_stump'), x: -1100, y: -250, width: 300, block: { w: 220, d: 50 } },
    { asset: worldAsset('fld_forest_stump'), x: 900, y: 100, width: 300, block: { w: 220, d: 50 } },
  ],
  lamps: [],
  lampAsset: TOWN_LAMP_ASSET,
  waypoint: { x: -1450, y: -330, drawn: true },
  camps: [
    camp('FIELD_WOODS_1', '幼鼠窝', 'MINI_RAT', 3, 2, -600, 330),
    camp('FIELD_WOODS_2', '林间蛛巢', 'SMALL_SPIDER', 3, 5, 500, -350),
    camp('FIELD_WOODS_E', '棕鬃熊', 'MEDIUM_BEAR', 1, 8, 1400, 330, true),
  ],
  exits: [{ key: 'to_village', label: '返回 · 晨风村', x: -1880, y: 0, radius: 110, toMap: 'VILLAGE', toSpawn: { x: 2300, y: -1000 } }],
  battleBg: 'battle_scene_field_forest',
};

const CITY: WorldMapDef = {
  code: 'CITY',
  name: '主城',
  levelText: '',
  width: TOWN_MAP.width,
  height: TOWN_MAP.height,
  walk: { ...TOWN_WALK_BOUNDS },
  spawn: { ...TOWN_SPAWN },
  ground: TOWN_GROUND_ASSET,
  groundTile: TOWN_GROUND_TILE,
  buildings: [
    ...TOWN_BUILDINGS.map((cfg) => ({ ...cfg, asset: townBuildingAsset(cfg.key), action: cfg.action as WorldMapBuilding['action'] })),
    // 剧情任务公告板(docs/50 §4.1):罗盘传送阵东侧
    { key: 'board', label: '公告板', asset: worldAsset('city_board'), action: 'npc', npc: 'BOARD', x: 470, y: -300, width: 220, footprint: { w: 140, d: 40 }, door: { x: -60, y: -40 } },
  ],
  npcs: [{ code: 'BOARD', name: '公告板', asset: null, x: 470, y: -340, height: 0, flip: 1 }],
  props: TOWN_PROPS.map((prop) => ({ ...prop, asset: townPropAsset(prop.key) })),
  lamps: [...TOWN_LAMPS],
  lampAsset: TOWN_LAMP_ASSET,
  // 广场黄铜罗盘就是主城传送阵(不另画底座,只加符文光)
  waypoint: { x: 0, y: -330, drawn: false },
  camps: [],
  exits: [],
};

/**
 * 灰岩荒原贴地装饰(docs/51,10-27 用户:「地形只有个平面地板图,参考原型更真实」):
 * 固定种子撒点——裂纹 / 碎石贴地,枯草 / 小石 / 岩堆 / 枯灌 / 骨堆立在地上(不挡路),大岩群沿上下边缘围一圈;
 * 避开营地、传送阵、出生点,一局一局位置不变。
 */
function grayDecals(): WorldMapProp[] {
  let seed = 20261027;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const walk = { left: -2250, right: 2250, bottom: -1250, top: 1100 };
  const keepOut: Array<[number, number, number]> = [[-1800, -420, 300], [-1900, -100, 220], [-800, 300, 300], [300, -380, 300], [1150, 450, 300], [1850, -350, 260]];
  const free = (x: number, y: number): boolean => keepOut.every(([cx, cy, r]) => Math.hypot(x - cx, (y - cy) * 1.3) > r);
  const out: WorldMapProp[] = [];
  const scatter = (key: string, count: number, width: number, opts: { flat?: boolean; jitter?: number } = {}): void => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 20; tries += 1) {
      const x = walk.left + 80 + rand() * (walk.right - walk.left - 160);
      const y = walk.bottom + 80 + rand() * (walk.top - walk.bottom - 160);
      if (!free(x, y)) {
        continue;
      }
      const w = width * (1 - (opts.jitter ?? 0.25) + rand() * (opts.jitter ?? 0.25) * 2);
      out.push({ asset: worldAsset(key), x: Math.round(x), y: Math.round(y), width: Math.round(w), ...(opts.flat ? { flat: true, tilt: 0.55 } : {}) });
      placed += 1;
    }
  };
  scatter('fld_g_crack', 16, 420, { flat: true });
  scatter('fld_g_gravel', 16, 300, { flat: true });
  scatter('fld_g_grass_l', 18, 130);
  scatter('fld_g_grass_s', 24, 86);
  scatter('fld_g_stones', 16, 120);
  scatter('fld_g_rocks_s', 12, 170);
  scatter('fld_g_boulders_m', 8, 280);
  scatter('fld_g_shrub', 8, 160);
  scatter('fld_g_bones', 3, 150);
  // 上下边缘一圈大岩群(挡路,地图边界看起来是山石而不是空地)
  for (let x = walk.left - 100; x <= walk.right + 100; x += 620) {
    out.push({ asset: worldAsset('fld_g_boulders_l'), x: Math.round(x + (rand() - 0.5) * 160), y: walk.top + 120, width: 520, block: { w: 380, d: 80 } });
    out.push({ asset: worldAsset('fld_g_boulders_l'), x: Math.round(x + 300 + (rand() - 0.5) * 160), y: walk.bottom - 60, width: 520, block: { w: 380, d: 80 } });
  }
  return out;
}

const GRAY: WorldMapDef = {
  code: 'GRAY',
  name: '灰岩荒原',
  levelText: 'Lv.10-20',
  width: 4800,
  height: 2800,
  walk: { left: -2250, right: 2250, bottom: -1250, top: 1100 },
  spawn: { x: -1900, y: -100 },
  ground: worldAsset('ground_wasteland'),
  // 10-27 换写实龟裂地面(1024 无缝):一格 900 世界单位,裂纹块大小接近原型
  groundTile: 900,
  buildings: [],
  npcs: [],
  props: [
    ...[[-1600, 800], [-400, 950], [900, 900], [2000, 800], [-1800, -950], [-300, -1000], [1500, -1000], [200, 200]]
      .map(([x, y]) => ({ asset: worldAsset('fld_rocks'), x, y, width: 340, block: { w: 240, d: 70 } })),
    ...[[-1100, 600], [700, -700], [1700, 300]].map(([x, y]) => ({ asset: worldAsset('fld_ruin_wall'), x, y, width: 420, block: { w: 320, d: 60 } })),
    ...[[-1300, -500], [0, 700], [2100, -400]].map(([x, y]) => ({ asset: worldAsset('fld_dead_tree'), x, y, width: 320, block: { w: 80, d: 40 } })),
    { asset: worldAsset('fld_bandit_camp'), x: 1250, y: 820, width: 620, block: { w: 480, d: 110 } },
    ...grayDecals(),
  ],
  lamps: [],
  lampAsset: TOWN_LAMP_ASSET,
  waypoint: { x: -1800, y: -420, drawn: true },
  camps: [
    camp('FIELD_GRAY_1', '荒野猎犬群', 'MEDIUM_DOG', 3, 11, -800, 300),
    camp('FIELD_GRAY_2', '盗匪哨岗', 'SWORD_MALE', 3, 13, 300, -380),
    camp('FIELD_GRAY_3', '盗匪营地', 'BOW_MALE', 3, 15, 1150, 450),
    camp('FIELD_GRAY_E', '石像鬼', 'GARGOYLE', 1, 17, 1850, -350, true),
  ],
  exits: [],
  battleBg: 'battle_scene_field_wasteland',
};

export const WORLD_MAPS: Record<WorldMapCode, WorldMapDef> = { VILLAGE, WOODS, CITY, GRAY };

export function worldMapDef(code: WorldMapCode | null | undefined): WorldMapDef {
  return (code && WORLD_MAPS[code]) || CITY;
}

/** 野外关卡码 → 所在地图(战斗背景 / 战后回到哪张图)。 */
export function worldMapOfStage(stageCode: string): WorldMapDef | null {
  for (const def of Object.values(WORLD_MAPS)) {
    if (def.camps.some((item) => item.stageCode === stageCode)) {
      return def;
    }
  }
  return null;
}

/** 预载组 'world':野外 / 新手村全部贴图(主城的在 'town' 组)。 */
export const WORLD_ASSET_PATHS: readonly string[] = Array.from(new Set([
  ...[VILLAGE, WOODS, GRAY].flatMap((def) => [def.ground, ...def.buildings.map((b) => b.asset), ...def.props.map((p) => p.asset),
    ...def.npcs.map((n) => n.asset).filter((asset): asset is string => !!asset)]),
  worldAsset('city_board'),
  worldAsset('waypoint'),
  worldAsset('map_world1'),
  worldAsset('map_world2'),
  worldAsset('portrait_chief'),
  worldAsset('ui_bounty_paper'),
  // 世界地图气泡 / 悬赏令上的怪物立绘
  ...Object.keys(MONSTER_SPINE).map((code) => `monster/${code.toLowerCase()}/spriteFrame`),
]));
