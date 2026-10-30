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

/** 野外宝箱(docs/52 §3.1):code 对应服务端 FieldChestRules;今日已开的由世界状态 openedChests 下发。 */
export interface WorldMapChest {
  code: string;
  label: string;
  kind: 'WOOD' | 'IRON' | 'SECRET' | 'BOSS';
  x: number;
  y: number;
}

/**
 * 野外兴趣点(docs/54):code 对应服务端 FieldPoiRules。HIDDEN 隐藏点「?」走近自动触发(一次性)、STELE 遗迹石碑(一次性,可重读)、
 * HERB / ORE 采集点(每日);已发现 / 今日已采由世界状态 explore.found / gatheredToday 下发。
 */
export type WorldMapPoiKind = 'HIDDEN' | 'STELE' | 'HERB' | 'ORE';
export interface WorldMapPoi {
  code: string;
  kind: WorldMapPoiKind;
  name: string;
  x: number;
  y: number;
}

/** 兴趣点场上素材(tools/qa/poi_assets_gen.py)与地图图标。 */
export const POI_ASSET = {
  stele: 'ui/world/poi/poi_stele/spriteFrame',
  herb: 'ui/world/poi/poi_herb/spriteFrame',
  herbCut: 'ui/world/poi/poi_herb_cut/spriteFrame',
  ore: 'ui/world/poi/poi_ore/spriteFrame',
  oreCut: 'ui/world/poi/poi_ore_cut/spriteFrame',
  hidden: 'ui/world/poi/poi_hidden/spriteFrame',
} as const;
/** 野外宝箱写实版(10-30 用户:宝箱偏卡通):关着 / 开过(开盖空箱)。 */
export const CHEST_ART = {
  closed: 'ui/world/poi/poi_chest/spriteFrame',
  open: 'ui/world/poi/poi_chest_open/spriteFrame',
} as const;
export const POI_MAP_ICON: Record<WorldMapPoiKind, string> = {
  HIDDEN: 'ui/world/mapui/map_hidden/spriteFrame',
  STELE: 'ui/world/mapui/map_stele/spriteFrame',
  HERB: 'ui/world/mapui/map_herb/spriteFrame',
  ORE: 'ui/world/mapui/map_ore/spriteFrame',
};

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
  /** 可开的野外宝箱(docs/52 §3.1)。 */
  chests?: WorldMapChest[];
  /** 隐藏点 / 石碑 / 采集点(docs/54)。 */
  pois?: WorldMapPoi[];
  /** 角色环境色(10-30 英雄贴地融合):英雄 / 怪物骨骼整体乘这个色,跟地图光照走(晨风村暖晨光、林地树荫);不给 = 原色。 */
  actorTint?: [number, number, number];
  /** 地图页「地点」列表(icon:portal / camp / den / ruins / cave / npc / place);不给就按有功能的建筑生成。 */
  places?: Array<{ name: string; x: number; y: number; icon: string }>;
  /** 走廊式可走区(docs/52 §2.1):给了就只能走在路(折线 ± half)和空地(椭圆)里;walk 仍是外框。 */
  corridors?: { lines: number[][][]; half: number; areas: Array<{ x: number; y: number; rx: number; ry: number }> };
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
  // 一群 6~10 只:散布半径随只数放大
  // 10-30 用户「怪物太靠近都融一起了」:单只体型约 200,8 只一群散到半径 ~600
  const radius = stageCode.endsWith('_B') ? 120 : elite ? 90 : count <= 3 ? 170 : 140 + count * 58;
  return { stageCode, label, monsterCode, spine: MONSTER_SPINE[monsterCode] ?? '', count, elite, level, x, y, radius };
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

/** 点到折线最近距离(草丛 / 花丛撒点避开路面;走廊式地图的可走判定)。 */
export function distToLines(x: number, y: number, lines: number[][][]): number {
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
      if (rand() < 0.35 || distToLines(px, py, roads) < 140) {
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
function groundDecals(def: { walk: WorldMapDef['walk']; buildings: WorldMapBuilding[]; blocks?: WorldMapBlock[] }, step: number,
  kinds: Array<[string, number]> = [['decal_weeds', 560], ['decal_dirt', 420], ['decal_weeds', 560], ['decal_moss', 300]], asset = V3): WorldMapProp[] {
  const out: WorldMapProp[] = [];
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
      const [kind, base] = kinds[n % kinds.length];
      n += 1;
      out.push({ asset: asset(kind), x: px, y: py, width: Math.round(base * (0.75 + rand() * 0.5)), flat: true, flipX: rand() < 0.5 });
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
  actorTint: [255, 244, 228],
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
  // 兴趣点(docs/54 §2.1)
  pois: [
    { code: 'V_HIDDEN_1', kind: 'HIDDEN', name: '风车背后', x: -2150, y: 40 },
    { code: 'V_HIDDEN_2', kind: 'HIDDEN', name: '桥下的布包', x: 260, y: 150 },
    { code: 'V_HIDDEN_3', kind: 'HIDDEN', name: '麦田里的稻草人', x: -1960, y: -760 },
    { code: 'V_STELE_1', kind: 'STELE', name: '晨曦之碑', x: -1700, y: 1080 },
    { code: 'V_HERB_1', kind: 'HERB', name: '草药丛', x: -1420, y: -900 },
    { code: 'V_HERB_2', kind: 'HERB', name: '草药丛', x: -760, y: 470 },
  ],
  camps: [camp('FIELD_VILLAGE_T', '训练用幼鼠', 'MINI_RAT', 1, 1, 1100, 100)],
  exits: [{ key: 'to_woods', label: '前往 · 村外林地', x: 2470, y: -1070, radius: 130, toMap: 'WOODS', toSpawn: { x: -4980, y: -2250 }, reach: 'VILLAGE_GATE' }],
};

/** 村外林地 v3 素材(2026-10-29 按林地原型出写实件;tools/qa/woods_assets_gen.py + woods_install_assets.py)。 */
const W3 = (name: string): string => worldAsset(`woods3/w3_${name}`);

/** 林地路网(世界坐标,tools/qa/woods_def_gen.py 由原型换算;woods_def_apply.py 装进来):路刷 + 走廊可走区共用。 */
const WOODS_ROADS: number[][][] = [
  [[-5055, -2138], [-4305, -1575], [-3630, -1162], [-3030, -825], [-2280, -525], [-1605, -338], [-1192, -75], [-330, 112], [420, 300], [1170, 525], [1845, 675], [2595, 675], [3195, 638]],
  [[1845, 675], [1320, 1050], [870, 1350], [270, 1612], [-330, 1838], [-855, 2025], [-1005, 2438]],
  [[3195, 638], [3870, 1012], [4320, 1350], [4845, 1650], [5370, 1912]],
  [[-3180, -900], [-3630, -338], [-4230, 38], [-4905, 562], [-5730, 900]],
  [[-330, 112], [-30, -488], [195, -1162], [570, -1538], [1470, -1725], [2520, -1688], [3570, -1312], [4470, -1538], [4920, -1612]],
  [[4470, -1538], [4920, -1162], [5295, -638]],
  [[195, -1162], [-368, -1612], [-780, -1988], [-968, -2662]],
  [[3195, 638], [4170, 562], [5445, 525]],
];

/** 林地树林:沿走廊两侧固定种子撒(离路越远越稀,树冠不盖路),[x, y, 素材, 宽];每 3 棵配一丛蕨。 */
const WOODS_TREES: Array<[number, number, string, number]> = [
  [-4413, -3312, 'tree_pine', 380], [-1868, -3221, 'tree_pine', 420], [-1539, -3363, 'tree_pine', 460], [-507, -3222, 'tree_oak', 660], [1797, -3335, 'tree_oak', 540], [2689, -3348, 'tree_autumn', 640],
  [3255, -3360, 'tree_pine', 460], [-3677, -2991, 'tree_pine', 500], [-3435, -2953, 'tree_oak', 540], [-443, -3080, 'tree_oak', 580], [-229, -2959, 'tree_pine', 460], [1070, -3002, 'tree_pine', 500],
  [1988, -3117, 'tree_pine', 380], [2636, -3082, 'tree_oak', 580], [3027, -3009, 'tree_oak', 620], [5877, -3016, 'tree_pine', 500], [6130, -2975, 'tree_autumn', 600], [-6977, -2767, 'tree_pine', 420],
  [-3791, -2693, 'tree_oak', 620], [-1517, -2811, 'tree_oak', 660], [-457, -2807, 'tree_pine', 380], [-158, -2674, 'tree_pine', 420], [732, -2794, 'tree_pine', 460], [1109, -2753, 'tree_oak', 660],
  [1662, -2826, 'tree_oak', 540], [2723, -2717, 'tree_pine', 420], [3349, -2803, 'tree_pine', 460], [4090, -2688, 'tree_autumn', 560], [4266, -2733, 'tree_oak', 540], [4684, -2814, 'tree_oak', 580],
  [6857, -2697, 'tree_pine', 460], [-4345, -2458, 'tree_pine', 500], [-4049, -2520, 'tree_pine', 380], [-3429, -2406, 'tree_oak', 580], [-280, -2421, 'tree_oak', 620], [704, -2413, 'tree_pine', 500],
  [3299, -2505, 'tree_pine', 380], [3732, -2553, 'tree_pine', 420], [3970, -2557, 'tree_autumn', 640], [4387, -2487, 'tree_oak', 660], [4976, -2402, 'tree_pine', 380], [6144, -2484, 'tree_pine', 420],
  [6542, -2542, 'tree_pine', 460], [6869, -2483, 'tree_oak', 660], [-3802, -2223, 'tree_oak', 540], [-3096, -2173, 'tree_pine', 420], [5352, -2310, 'tree_pine', 460], [5470, -2228, 'tree_pine', 500],
  [6120, -2279, 'tree_oak', 540], [-3394, -1952, 'tree_autumn', 600], [5322, -1990, 'tree_pine', 460], [5540, -1904, 'tree_pine', 500], [5801, -1888, 'tree_pine', 380], [-6877, -1697, 'tree_oak', 580],
  [-6004, -1644, 'tree_oak', 620], [-3046, -1677, 'tree_pine', 500], [-2635, -1712, 'tree_pine', 380], [-2527, -1716, 'tree_pine', 420], [5306, -1712, 'tree_oak', 620], [5481, -1692, 'tree_oak', 660],
  [-5988, -1476, 'tree_autumn', 560], [-4670, -1385, 'tree_pine', 420], [-2469, -1395, 'tree_pine', 460], [5644, -1465, 'tree_oak', 660], [5873, -1425, 'tree_oak', 540], [6173, -1464, 'tree_pine', 420],
  [-4696, -1110, 'tree_pine', 460], [-4349, -1101, 'tree_pine', 500], [-1487, -1107, 'tree_oak', 540], [820, -1161, 'tree_oak', 580], [3902, -1084, 'tree_pine', 460], [4353, -1125, 'tree_autumn', 640],
  [5836, -1229, 'tree_pine', 380], [6279, -1126, 'tree_oak', 580], [6620, -1134, 'tree_oak', 620], [6791, -1143, 'tree_pine', 500], [-5295, -945, 'tree_pine', 380], [-4997, -875, 'tree_pine', 420],
  [-4586, -888, 'tree_oak', 620], [-4232, -829, 'tree_oak', 660], [-4118, -900, 'tree_pine', 380], [488, -793, 'tree_pine', 420], [3038, -789, 'tree_autumn', 600], [3242, -788, 'tree_oak', 660],
  [3569, -865, 'tree_oak', 540], [3894, -844, 'tree_pine', 420], [4293, -942, 'tree_pine', 460], [4610, -820, 'tree_pine', 500], [5994, -837, 'tree_oak', 540], [6501, -824, 'tree_oak', 580],
  [-6620, -636, 'tree_pine', 460], [-5044, -679, 'tree_pine', 500], [-4652, -571, 'tree_pine', 380], [554, -519, 'tree_autumn', 560], [2412, -550, 'tree_oak', 620], [3019, -548, 'tree_pine', 500],
  [3287, -619, 'tree_pine', 380], [3609, -630, 'tree_pine', 420], [3916, -688, 'tree_oak', 620], [4249, -531, 'tree_oak', 660], [4524, -657, 'tree_pine', 380], [5968, -619, 'tree_pine', 420],
  [6550, -626, 'tree_pine', 460], [-6198, -397, 'tree_oak', 660], [-5684, -311, 'tree_autumn', 640], [-5216, -299, 'tree_pine', 420], [-5003, -416, 'tree_pine', 460], [805, -406, 'tree_pine', 500],
  [4280, -291, 'tree_oak', 540], [4550, -348, 'tree_oak', 580], [4933, -346, 'tree_pine', 460], [5312, -318, 'tree_pine', 500], [5687, -268, 'tree_pine', 380], [5891, -298, 'tree_oak', 580],
  [6571, -268, 'tree_oak', 620], [-6617, 0, 'tree_autumn', 600], [-5930, -91, 'tree_pine', 380], [-5675, 8, 'tree_pine', 420], [-2341, -109, 'tree_oak', 620], [-2164, -134, 'tree_oak', 660],
  [1755, -145, 'tree_pine', 380], [2137, -81, 'tree_pine', 420], [5888, -89, 'tree_pine', 460], [6764, -8, 'tree_oak', 660], [-6586, 133, 'tree_oak', 540], [-6275, 135, 'tree_pine', 420],
  [-2450, 241, 'tree_autumn', 560], [-2145, 202, 'tree_pine', 500], [5836, 286, 'tree_oak', 540], [6181, 165, 'tree_oak', 580], [6627, 216, 'tree_pine', 460], [-6687, 504, 'tree_pine', 500],
  [-6291, 434, 'tree_pine', 380], [-3932, 493, 'tree_oak', 580], [-3757, 557, 'tree_oak', 620], [-3366, 518, 'tree_pine', 500], [-3075, 519, 'tree_pine', 380], [-871, 513, 'tree_autumn', 640],
  [-569, 525, 'tree_oak', 620], [-250, 543, 'tree_oak', 660], [113, 541, 'tree_pine', 380], [6306, 445, 'tree_pine', 420], [-6892, 735, 'tree_pine', 460], [-6161, 708, 'tree_oak', 660],
  [-4305, 786, 'tree_oak', 540], [-3975, 678, 'tree_pine', 420], [-3802, 705, 'tree_pine', 460], [-3434, 669, 'tree_pine', 500], [-1363, 769, 'tree_autumn', 600], [-1183, 822, 'tree_oak', 580],
  [-786, 698, 'tree_pine', 460], [-521, 717, 'tree_pine', 500], [-138, 680, 'tree_pine', 380], [5819, 795, 'tree_oak', 580], [6197, 803, 'tree_oak', 620], [6478, 660, 'tree_pine', 500],
  [-6880, 956, 'tree_pine', 380], [-6685, 956, 'tree_pine', 420], [-6211, 1078, 'tree_oak', 620], [-5216, 1096, 'tree_autumn', 560], [-5028, 1059, 'tree_pine', 380], [-4747, 969, 'tree_pine', 420],
  [-4271, 1083, 'tree_pine', 460], [-3633, 960, 'tree_oak', 660], [-1731, 1104, 'tree_oak', 540], [-1452, 990, 'tree_pine', 420], [-1198, 973, 'tree_pine', 460], [-575, 1034, 'tree_pine', 500],
  [-248, 1029, 'tree_oak', 540], [2147, 1089, 'tree_oak', 580], [2430, 1065, 'tree_autumn', 640], [2681, 1023, 'tree_pine', 500], [5500, 948, 'tree_pine', 380], [5889, 931, 'tree_oak', 580],
  [6124, 933, 'tree_oak', 620], [6587, 1058, 'tree_pine', 500], [-6859, 1341, 'tree_pine', 380], [-6550, 1253, 'tree_pine', 420], [-6184, 1256, 'tree_oak', 620], [-5843, 1364, 'tree_oak', 660],
  [-5528, 1350, 'tree_pine', 380], [-5362, 1325, 'tree_autumn', 600], [-5012, 1224, 'tree_pine', 460], [-4672, 1231, 'tree_oak', 660], [-4261, 1229, 'tree_oak', 540], [1998, 1306, 'tree_pine', 420],
  [2926, 1269, 'tree_pine', 460], [3408, 1261, 'tree_pine', 500], [-6970, 1486, 'tree_oak', 540], [-6550, 1516, 'tree_oak', 580], [-6191, 1585, 'tree_pine', 460], [-6045, 1486, 'tree_pine', 500],
  [-5692, 1625, 'tree_autumn', 560], [-5279, 1556, 'tree_oak', 580], [-4447, 1502, 'tree_oak', 620], [-4075, 1630, 'tree_pine', 500], [-3733, 1635, 'tree_pine', 380], [-1762, 1534, 'tree_pine', 420],
  [-1486, 1521, 'tree_oak', 620], [2150, 1497, 'tree_oak', 660], [2367, 1566, 'tree_pine', 380], [3123, 1532, 'tree_pine', 420], [3232, 1498, 'tree_pine', 460], [3558, 1486, 'tree_autumn', 640],
  [3956, 1544, 'tree_oak', 540], [6594, 1614, 'tree_pine', 420], [-5857, 1835, 'tree_pine', 460], [-5665, 1834, 'tree_pine', 500], [-4952, 1815, 'tree_oak', 540], [-4692, 1816, 'tree_oak', 580],
  [-2451, 1844, 'tree_pine', 460], [-1748, 1795, 'tree_pine', 500], [-1471, 1749, 'tree_pine', 380], [1848, 1798, 'tree_oak', 580], [2457, 1891, 'tree_autumn', 600], [2688, 1864, 'tree_pine', 500],
  [2971, 1803, 'tree_pine', 380], [3377, 1839, 'tree_pine', 420], [3637, 1755, 'tree_oak', 620], [4035, 1870, 'tree_oak', 660], [4241, 1776, 'tree_pine', 380], [-6984, 2077, 'tree_pine', 420],
  [-6200, 2035, 'tree_pine', 460], [-5685, 2071, 'tree_oak', 660], [-5275, 2167, 'tree_oak', 540], [-5033, 2023, 'tree_autumn', 560], [-4233, 2095, 'tree_pine', 460], [-2038, 2037, 'tree_pine', 500],
  [-1519, 2122, 'tree_oak', 540], [-81, 2150, 'tree_oak', 580], [1483, 2155, 'tree_pine', 460], [1685, 2067, 'tree_pine', 500], [2437, 2057, 'tree_pine', 380], [2804, 2039, 'tree_oak', 580],
  [3330, 2175, 'tree_oak', 620], [3974, 2144, 'tree_pine', 500], [-2811, 2419, 'tree_autumn', 640], [-1829, 2422, 'tree_pine', 420], [-1531, 2298, 'tree_oak', 620], [-408, 2458, 'tree_oak', 660],
  [-202, 2405, 'tree_pine', 380], [1082, 2443, 'tree_pine', 420], [2001, 2319, 'tree_pine', 460], [3318, 2336, 'tree_oak', 660], [4214, 2355, 'tree_oak', 540], [4612, 2443, 'tree_pine', 420],
  [6649, 2425, 'tree_pine', 460], [-6518, 2698, 'tree_autumn', 600], [-5661, 2715, 'tree_oak', 540], [-5364, 2604, 'tree_oak', 580], [-2064, 2717, 'tree_pine', 460], [-1374, 2700, 'tree_pine', 500],
  [-511, 2640, 'tree_pine', 380], [-104, 2573, 'tree_oak', 580], [1415, 2601, 'tree_oak', 620], [2095, 2629, 'tree_pine', 500], [4008, 2586, 'tree_pine', 380], [6518, 2568, 'tree_pine', 420],
  [-6001, 2998, 'tree_autumn', 560], [-5227, 2982, 'tree_oak', 660], [-2352, 2889, 'tree_pine', 380], [-1735, 2910, 'tree_pine', 420], [-1528, 2821, 'tree_pine', 460], [-1230, 2912, 'tree_oak', 660],
  [-868, 2921, 'tree_oak', 540], [-477, 2929, 'tree_pine', 420], [115, 2874, 'tree_pine', 460], [383, 2943, 'tree_pine', 500], [697, 2975, 'tree_oak', 540], [2684, 2937, 'tree_autumn', 640],
  [3356, 2868, 'tree_pine', 460], [4048, 2833, 'tree_pine', 500], [4398, 2862, 'tree_pine', 380], [5673, 2991, 'tree_oak', 580], [-3081, 3142, 'tree_oak', 620], [-1565, 3125, 'tree_pine', 500],
  [-1042, 3260, 'tree_pine', 380], [-866, 3245, 'tree_pine', 420], [-135, 3230, 'tree_oak', 620], [175, 3202, 'tree_oak', 660], [762, 3152, 'tree_autumn', 600], [3916, 3106, 'tree_pine', 420],
  [4510, 3224, 'tree_pine', 460], [5253, 3244, 'tree_oak', 660], [5517, 3236, 'tree_oak', 540],
];

/**
 * 村外林地 v3(docs/52 / 53,2026-10-29 用户确认按原型规模做):原型 woods_overview(1808×870)换算 x = (px - 904) × 7.5、y = (435 - py) × 7.5,
 * 地图 13560×6525;走廊结构(路 + 林间空地),两侧密林。西南入口营地(传送阵)→ 幼鼠窝 → 木桥 → 北:瀑布 / 林间蛛巢;
 * 东:猎人营地 → 东北熊穴(区域首领腐木巨熊);南:古树遗迹。11 群小怪(6~10 只)+ 2 精英 + 首领,怪群按距离生成 / 回收。
 * 本段由 tools/qa/woods_def_apply.py 生成,改布局改 woods_def_gen.py 再重跑。
 */
const WOODS: WorldMapDef = {
  code: 'WOODS',
  actorTint: [236, 242, 226],
  ambient: true,
  name: '村外林地',
  levelText: 'Lv.1-10',
  width: 13560,
  height: 6525,
  walk: { left: -6750, right: 6750, bottom: -3240, top: 3240 },
  corridors: {
    half: 460,
    lines: [
      [[-5055, -2138], [-4305, -1575], [-3630, -1162], [-3030, -825], [-2280, -525], [-1605, -338], [-1192, -75], [-330, 112], [420, 300], [1170, 525], [1845, 675], [2595, 675], [3195, 638]],
      [[1845, 675], [1320, 1050], [870, 1350], [270, 1612], [-330, 1838], [-855, 2025], [-1005, 2438]],
      [[3195, 638], [3870, 1012], [4320, 1350], [4845, 1650], [5370, 1912]],
      [[-3180, -900], [-3630, -338], [-4230, 38], [-4905, 562], [-5730, 900]],
      [[-330, 112], [-30, -488], [195, -1162], [570, -1538], [1470, -1725], [2520, -1688], [3570, -1312], [4470, -1538], [4920, -1612]],
      [[4470, -1538], [4920, -1162], [5295, -638]],
      [[195, -1162], [-368, -1612], [-780, -1988], [-968, -2662]],
      [[3195, 638], [4170, 562], [5445, 525]],
    ],
    areas: [
      { x: -5542, y: -2438, rx: 1519, ry: 961 },
      { x: -3255, y: -112, rx: 961, ry: 556 },
      { x: 795, y: 1538, rx: 1215, ry: 608 },
      { x: 3345, y: 488, rx: 1316, ry: 608 },
      { x: 2145, y: -1538, rx: 1924, ry: 961 },
      { x: 5220, y: 1875, rx: 1114, ry: 556 },
      { x: -855, y: 1988, rx: 556, ry: 405 },
      { x: -5730, y: 900, rx: 506, ry: 354 },
      { x: -968, y: -2662, rx: 506, ry: 354 },
      { x: 5445, y: 525, rx: 506, ry: 354 },
    ],
  },
  spawn: { x: -4980, y: -2250 },
  ground: worldAsset('ground_woods3'),
  // 10-29 写实林地底纹(苔草 + 腐殖土),一格 1000 世界单位
  groundTile: 1000,
  buildings: [],
  npcs: [],
  props: [
    // ── 贴地(先画的在下):地表贴花 → 崖 / 水 → 营地 / 遗迹地面 → 路 → 桥 ──
    ...groundDecals({ walk: { left: -6750, right: 6750, bottom: -3240, top: 3240 }, buildings: [] }, 760,
      [['decal_leaves', 560], ['decal_moss', 340], ['decal_roots', 460], ['decal_leaves', 560]], W3),

    { asset: W3('cliff_falls'), x: -3405, y: 2348, width: 3800, flat: true, water: true },
    { asset: W3('cliff_ne'), x: 6150, y: 1012, width: 1300, flat: true, water: true },
    { asset: W3('camp_plaza'), x: -5542, y: -2588, width: 2500, flat: true },
    { asset: W3('ruins_floor'), x: 1695, y: -1950, width: 2700, flat: true },
    { asset: W3('river_a'), x: -2880, y: 1125, width: 1900, flat: true, water: true },
    { asset: W3('river_c'), x: -2205, y: 675, width: 1700, flat: true, water: true, flipX: true },
    { asset: W3('river_a'), x: -1492, y: 262, width: 1700, flat: true, water: true },
    { asset: W3('river_b'), x: -855, y: -412, width: 1500, flat: true, water: true },
    { asset: W3('river_b'), x: -818, y: -1012, width: 1500, flat: true, water: true, flipX: true },
    { asset: W3('river_c'), x: -1268, y: -1538, width: 1700, flat: true, water: true },
    { asset: W3('river_a'), x: -1830, y: -2100, width: 1700, flat: true, water: true, flipX: true },
    { asset: W3('river_c'), x: -2280, y: -2662, width: 1700, flat: true, water: true },
    { asset: W3('river_a'), x: -2542, y: -3188, width: 1800, flat: true, water: true, flipX: true },
    ...roads(WOODS_ROADS, 220, V3('road_brush')),
    { asset: W3('bridge'), x: -855, y: -15, width: 1050, flat: true },
    // ── 立物 ──

    { asset: W3('camp_tent'), x: -6368, y: -1912, width: 560, block: { w: 380, d: 120 } },
    { asset: W3('camp_tent'), x: -6555, y: -2888, width: 520, flipX: true, block: { w: 360, d: 110 } },
    { asset: W3('camp_palisade'), x: -5280, y: -1538, width: 1000, block: { w: 900, d: 80 } },
    { asset: W3('camp_palisade'), x: -5655, y: -3225, width: 1100, flipX: true, block: { w: 1000, d: 80 } },
    { asset: W3('camp_banner'), x: -6180, y: -1612, width: 210 },
    { asset: W3('camp_banner'), x: -4642, y: -2438, width: 210 },
    { asset: W3('camp_banner'), x: -4192, y: -2738, width: 210, flipX: true },
    { asset: W3('camp_crates'), x: -4530, y: -2662, width: 300, block: { w: 220, d: 60 } },
    { asset: W3('rat_log'), x: -4080, y: -338, width: 760, block: { w: 560, d: 120 } },
    { asset: W3('spider_den'), x: 645, y: 1575, width: 1600, block: { w: 1200, d: 260 } },
    { asset: W3('hunter_tent'), x: 3195, y: 262, width: 640, block: { w: 440, d: 120 } },
    { asset: W3('hunter_rack'), x: 4020, y: 300, width: 540, block: { w: 380, d: 60 } },
    { asset: W3('campfire'), x: 3682, y: 75, width: 280 },
    { asset: W3('ancient_tree'), x: 2558, y: -1875, width: 1600, block: { w: 520, d: 160 } },
    { asset: W3('ruin_arch'), x: 1170, y: -938, width: 980, block: { w: 700, d: 90 } },
    { asset: W3('ruin_wall'), x: 3682, y: -2362, width: 950, block: { w: 700, d: 110 } },
    { asset: W3('ruin_wall'), x: 420, y: -2288, width: 820, flipX: true, block: { w: 600, d: 100 } },
    { asset: W3('ruin_pillar'), x: 4282, y: -1725, width: 320, block: { w: 140, d: 50 } },
    { asset: W3('ruin_pillar'), x: 945, y: -1312, width: 300, block: { w: 140, d: 50 } },
    { asset: W3('crystal_pillar'), x: 495, y: -1988, width: 280, block: { w: 140, d: 50 } },
    { asset: W3('crystal_pillar'), x: 3382, y: -1538, width: 280, block: { w: 140, d: 50 } },
    { asset: W3('bear_den'), x: 5445, y: 2062, width: 1800, block: { w: 1300, d: 300 } },
    { asset: W3('bones'), x: 4470, y: 1875, width: 560 },
    { asset: W3('rock_big'), x: -1980, y: -2138, width: 640, block: { w: 440, d: 120 } },
    { asset: W3('rock_big'), x: 420, y: 2362, width: 700, flipX: true, block: { w: 480, d: 120 } },
    { asset: W3('rock_small'), x: -6068, y: 300, width: 380, block: { w: 260, d: 70 } },
    { asset: W3('rock_small'), x: 2070, y: 1762, width: 360, flipX: true, block: { w: 240, d: 70 } },
    { asset: W3('stump'), x: 6232, y: 1575, width: 280, block: { w: 160, d: 50 } },
    { asset: W3('stump'), x: -2280, y: -938, width: 260, block: { w: 150, d: 50 } },
    { asset: W3('tree_autumn'), x: -5768, y: -675, width: 620, block: { w: 140, d: 60 } },
    { asset: W3('tree_autumn'), x: -330, y: -1238, width: 600, block: { w: 140, d: 60 } },
    { asset: W3('tree_autumn'), x: 2595, y: 1238, width: 560, block: { w: 140, d: 60 } },
    ...WOODS_TREES.flatMap(([x, y, asset, width], i) => {
      const tree: WorldMapProp = { asset: W3(asset), x, y, width, block: { w: 110, d: 50 } };
      return i % 3 === 0 ? [tree, { asset: W3(i % 7 === 0 ? 'mushrooms' : 'fern'), x: x + (i % 2 ? 170 : -170), y: y - 50, width: i % 7 === 0 ? 120 : 200 }] : [tree];
    }),
  ],
  lamps: [],
  lampAsset: V2('lamp'),
  waypoint: { x: -5430, y: -2400, drawn: true },
  // 地图页「地点」(10-30 原型 proto_map_b)
  places: [
    { name: '入口营地', x: -4980, y: -2250, icon: 'portal' },
    { name: '幼鼠窝', x: -3555, y: -262, icon: 'den' },
    { name: '林间蛛巢', x: 720, y: 1425, icon: 'cave' },
    { name: '猎人营地', x: 3195, y: 488, icon: 'camp' },
    { name: '古树遗迹', x: 1845, y: -1612, icon: 'ruins' },
    { name: '熊穴', x: 5070, y: 1800, icon: 'cave' },
  ],
  // 兴趣点(docs/54 §2.2)
  pois: [
    { code: 'W_HIDDEN_1', kind: 'HIDDEN', name: '瀑布后的岩缝', x: -3000, y: 1900 },
    { code: 'W_HIDDEN_2', kind: 'HIDDEN', name: '倒木下的箭袋', x: 1100, y: 1300 },
    { code: 'W_HIDDEN_3', kind: 'HIDDEN', name: '崖边的营火', x: 5800, y: 1300 },
    { code: 'W_STELE_1', kind: 'STELE', name: '古树之碑', x: 2200, y: -1500 },
    { code: 'W_HERB_1', kind: 'HERB', name: '草药丛', x: 3500, y: 300 },
    { code: 'W_HERB_2', kind: 'HERB', name: '草药丛', x: -400, y: -700 },
    { code: 'W_ORE_1', kind: 'ORE', name: '矿脉', x: 300, y: -2800 },
    { code: 'W_ORE_2', kind: 'ORE', name: '矿脉', x: 3800, y: -2700 },
  ],
  // 野外宝箱(docs/52 §3.1,走近点「开启」;铁箱 / 首领宝箱要先打赢旁边的精英 / 首领)
  chests: [
    { code: 'WOODS_W1', label: '林间木箱', kind: 'WOOD', x: -5730, y: 922 },
    { code: 'WOODS_W2', label: '林间木箱', kind: 'WOOD', x: -3518, y: -1275 },
    { code: 'WOODS_W3', label: '林间木箱', kind: 'WOOD', x: 4882, y: -1688 },
    { code: 'WOODS_I1', label: '蛛后铁箱', kind: 'IRON', x: -855, y: 2048 },
    { code: 'WOODS_I2', label: '熊踪铁箱', kind: 'IRON', x: 5520, y: 548 },
    { code: 'WOODS_S1', label: '秘藏宝箱', kind: 'SECRET', x: -968, y: -2700 },
    { code: 'WOODS_B1', label: '首领宝箱', kind: 'BOSS', x: 4995, y: 1725 },
  ],
  camps: [

    camp('FIELD_WOODS_4', '营地外鼠群', 'MINI_RAT', 6, 3, -4192, -1350),
    camp('FIELD_WOODS_1', '幼鼠窝', 'MINI_RAT', 8, 2, -3255, -112),
    camp('FIELD_WOODS_3', '林道鼠群', 'MINI_RAT', 6, 2, -2880, -750),
    camp('FIELD_WOODS_5', '桥头野犬', 'MEDIUM_DOG', 6, 4, -1792, -412),
    camp('FIELD_WOODS_6', '瀑布蛛群', 'SMALL_SPIDER', 6, 4, -780, 1912),
    camp('FIELD_WOODS_2', '林间蛛巢', 'SMALL_SPIDER', 10, 5, 982, 1388),
    camp('FIELD_WOODS_E2', '林间蛛后', 'SMALL_SPIDER', 1, 7, 458, 1725, true),
    camp('FIELD_WOODS_7', '林道野犬', 'MEDIUM_DOG', 6, 6, 1395, 562),
    camp('FIELD_WOODS_8', '猎人营地野犬', 'MEDIUM_DOG', 8, 6, 2895, 338),
    camp('FIELD_WOODS_E', '棕鬃熊', 'MEDIUM_BEAR', 1, 8, 4095, 562, true),
    camp('FIELD_WOODS_9', '遗迹蛛群', 'SMALL_SPIDER', 8, 7, 1545, -1688),
    camp('FIELD_WOODS_11', '遗迹东鼠群', 'MINI_RAT', 8, 9, 4470, -1500),
    camp('FIELD_WOODS_10', '熊穴前野犬', 'MEDIUM_DOG', 7, 8, 4320, 1312),
    camp('FIELD_WOODS_B', '腐木巨熊', 'MEDIUM_BEAR', 1, 10, 5295, 1988, true),
    camp('FIELD_WOODS_12', '西林鼠群', 'MINI_RAT', 6, 2, -4605, 300),
    camp('FIELD_WOODS_13', '溪畔蛛群', 'SMALL_SPIDER', 7, 4, 8, -638),
    camp('FIELD_WOODS_14', '中路野犬', 'MEDIUM_DOG', 7, 6, 2145, 675),
    camp('FIELD_WOODS_15', '遗迹西蛛群', 'SMALL_SPIDER', 8, 7, 645, -1538),
    camp('FIELD_WOODS_16', '古树野犬', 'MEDIUM_DOG', 7, 8, 2595, -1650),
    camp('FIELD_WOODS_17', '遗迹东蛛群', 'SMALL_SPIDER', 8, 8, 3645, -1328),
    camp('FIELD_WOODS_18', '东林野犬', 'MEDIUM_DOG', 7, 9, 4920, 525),
    camp('FIELD_WOODS_19', '南岔鼠群', 'MINI_RAT', 7, 5, -555, -1688),
    camp('FIELD_WOODS_20', '东南鼠群', 'MINI_RAT', 8, 9, 5145, -900),
  ],
  exits: [{ key: 'to_village', label: '返回 · 晨风村', x: -6420, y: -2440, radius: 130, toMap: 'VILLAGE', toSpawn: { x: 2300, y: -1000 } }],
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
/**
 * 某张跑图地图自己用到的素材(地面 / 建筑 / 立物 / NPC / 路灯)。10-29:晨风村 + 林地写实素材各 40MB+,
 * 不再进大厅时整组预载,改由 GameRoot 进图 / 换图前按图加载(preloadWorldMap)。
 */
export function worldMapAssetPaths(code: WorldMapCode): string[] {
  const def = WORLD_MAPS[code];
  if (!def) {
    return [];
  }
  return Array.from(new Set([def.ground, def.lampAsset, ...def.buildings.map((b) => b.asset), ...def.props.map((p) => p.asset),
    ...def.npcs.map((n) => n.asset).filter((asset): asset is string => !!asset),
    // 地图页鸟瞰底图(tools/qa/map_overview_capture.py 截出的两张)
    ...(code === 'VILLAGE' || code === 'WOODS' ? [worldAsset(`overview/ov_${code.toLowerCase()}`)] : []),
    // 野外宝箱贴图(渲染层 CHEST_ART:关着 / 开盖空箱)
    ...(def.chests?.length ? Object.values(CHEST_ART) : []),
    // 兴趣点素材(docs/54)+ 场上头顶圆徽用的图标(进图前要在内存里,场上节点不会因贴图晚到而重绘)
    ...(def.pois?.length ? [...Object.values(POI_ASSET), ...Object.values(POI_MAP_ICON)] : []),
    // 角色脚下柔边接触阴影(LobbyTownRenderer CONTACT_SHADOW)
    worldAsset('fx/contact_shadow'),
    ...(def.chests?.length ? [worldAsset('mapui/map_chest')] : [])]));
}

/** 进图前要整块下到本地的资源前缀(网页分层下载):地图素材 + 这张图怪物的骨骼 / 头像。 */
export function worldMapPackPrefixes(code: WorldMapCode): string[] {
  const def = WORLD_MAPS[code];
  if (!def) {
    return [];
  }
  const set = new Set<string>(worldMapAssetPaths(code).map((path) => path.replace(/\/spriteFrame$/, '')));
  for (const camp of def.camps) {
    if (camp.spine) {
      set.add(camp.spine.slice(0, camp.spine.lastIndexOf('/')));
    }
    set.add(`monster/${camp.monsterCode.toLowerCase()}`);
  }
  return Array.from(set);
}

/** 大厅首开预载的公共世界素材(各地图专属素材按图加载,见 worldMapAssetPaths)。 */
export const WORLD_ASSET_PATHS: readonly string[] = Array.from(new Set([
  worldAsset('city_board'),
  worldAsset('waypoint'),
  // 白色云雾(10-30,小地图 / 地图页迷雾)
  ...[0, 1, 2].map((i) => worldAsset(`fx/fog_cloud_${i}`)),
  // 地图页图标(10-30,LobbyAreaMapRenderer)
  ...['quest', 'pin', 'portal', 'paw', 'tent', 'tree', 'skull', 'chest'].map((name) => worldAsset(`mapui/map_${name}`)),
  worldAsset('map_world1'),
  worldAsset('map_world2'),
  worldAsset('portrait_chief'),
  worldAsset('ui_bounty_paper'),
  // 世界地图气泡 / 悬赏令上的怪物立绘
  ...Object.keys(MONSTER_SPINE).map((code) => `monster/${code.toLowerCase()}/spriteFrame`),
]));
