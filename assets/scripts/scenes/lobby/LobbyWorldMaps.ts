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
function roads(lines: number[][][], width: number): WorldMapProp[] {
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
        out.push({ asset: V2('road_brush'), x: Math.round(ax + (bx - ax) * f), y: Math.round(ay + (by - ay) * f), width: Math.round(width * (0.92 + ((j * 37) % 17) / 100)), flat: true, angle: (j * 47) % 360 });
      }
    }
  }
  return out;
}

/**
 * 晨风村 v2(docs/53 §4.1,原型 周报截图/2026-10-29_新手村设计/village_overview + village_ingame,用户 10-29 确认):
 * 清晨山谷农庄,6400×3400。坐标按原型俯视图换算:世界 x = (原型 x - 935) × 3.4,y = (420 - 原型 y) × 3.8。
 * 北:村长屋;西北:礼拜堂 + 圣契祭坛;东:训练场;西:风车坡;中:小溪 + 木桥;东:铁匠铺;南:村口广场(传送阵);西南:麦田;东南:村口 → 村外林地。
 */
const VILLAGE: WorldMapDef = {
  code: 'VILLAGE',
  name: '晨风村',
  levelText: 'Lv.1-10',
  width: 6400,
  height: 3400,
  walk: { left: -3000, right: 3000, bottom: -1520, top: 1420 },
  spawn: { x: 480, y: -840 },
  ground: worldAsset('ground_village'),
  // 10-29 平滑手绘草地(docs/53 §4.3):大色块,一格 1000 世界单位
  groundTile: 1000,
  buildings: [
    { key: 'chief', label: '村长屋', asset: V2('chief_house'), action: 'npc', npc: 'CHIEF', x: -220, y: 1080, width: 640, footprint: { w: 470, d: 170 }, door: { x: 40, y: -90 } },
    { key: 'altar', label: '圣契祭坛', asset: V2('altar'), action: 'npc', npc: 'PRIEST', x: -1420, y: 640, width: 420, footprint: { w: 300, d: 120 }, door: { x: 0, y: -80 } },
    { key: 'training', label: '训练场', asset: V2('training'), action: 'npc', npc: 'INSTRUCTOR', x: 1560, y: 700, width: 760, footprint: { w: 560, d: 160 }, door: { x: -200, y: -90 } },
    { key: 'smithy', label: '铁匠铺', asset: V2('smithy'), action: 'npc', npc: 'SMITH', x: 1800, y: -120, width: 600, footprint: { w: 430, d: 160 }, door: { x: -120, y: -90 } },
    { key: 'chapel', label: '礼拜堂', asset: V2('chapel'), action: 'none', x: -1900, y: 960, width: 560, footprint: { w: 380, d: 160 }, door: { x: 0, y: -80 } },
    { key: 'windmill', label: '风车', asset: V2('windmill'), action: 'none', x: -2300, y: 60, width: 560, footprint: { w: 260, d: 140 }, door: { x: 0, y: -70 } },
    { key: 'watermill', label: '水车磨坊', asset: V2('watermill'), action: 'none', x: -1120, y: -380, width: 500, footprint: { w: 340, d: 140 }, door: { x: 0, y: -70 } },
    { key: 'house_a', label: '民居', asset: V2('house_a'), action: 'none', x: -260, y: -880, width: 480, footprint: { w: 340, d: 140 }, door: { x: 0, y: -70 } },
    { key: 'house_b', label: '民居', asset: V2('house_b'), action: 'none', x: 1180, y: -1080, width: 500, footprint: { w: 350, d: 150 }, door: { x: 0, y: -70 } },
    { key: 'house_c', label: '民居', asset: V2('house_a'), action: 'none', x: 840, y: -160, width: 460, footprint: { w: 320, d: 140 }, door: { x: 0, y: -70 } },
    { key: 'house_d', label: '民居', asset: V2('house_b'), action: 'none', x: -1660, y: -940, width: 480, footprint: { w: 340, d: 150 }, door: { x: 0, y: -70 } },
    { key: 'house_e', label: '民居', asset: V2('house_a'), action: 'none', x: 600, y: 420, width: 440, footprint: { w: 310, d: 140 }, door: { x: 0, y: -70 } },
    { key: 'market', label: '集市', asset: V2('market_stall'), action: 'none', x: 100, y: -320, width: 380, footprint: { w: 260, d: 110 }, door: { x: 0, y: -60 } },
    { key: 'well', label: '水井', asset: V2('well'), action: 'none', x: 140, y: -1060, width: 230, footprint: { w: 160, d: 70 }, door: { x: 0, y: -40 } },
    { key: 'board', label: '告示板', asset: V2('notice_board'), action: 'none', x: 1000, y: -560, width: 230, footprint: { w: 160, d: 50 }, door: { x: 0, y: -40 } },
    { key: 'gate', label: '村口', asset: V2('gate'), action: 'none', x: 2620, y: -960, width: 420, footprint: { w: 80, d: 50 }, door: { x: 0, y: -40 } },
  ],
  npcs: [
    { code: 'CHIEF', name: '村长 · 老霍恩', asset: worldAsset('npc_chief'), x: -60, y: 940, height: 210, flip: 1 },
    { code: 'INSTRUCTOR', name: '教官 · 格雷', asset: worldAsset('npc_instructor'), x: 1300, y: 560, height: 215, flip: 1 },
    { code: 'PRIEST', name: '祭司 · 莉娅', asset: worldAsset('npc_priest'), x: -1300, y: 500, height: 200, flip: -1 },
    { code: 'SMITH', name: '铁匠 · 巴洛', asset: worldAsset('npc_smith'), x: 1620, y: -260, height: 215, flip: -1 },
  ],
  props: [
    // ── 贴地:广场 / 小路 / 菜地 / 溪流(地砖层,不挡路;素材本身已是斜视角,不再压 tilt)──
    // 夯土路网(原型 village_overview):广场为中心,北上过桥到村长屋 / 祭坛,东去铁匠铺与村口,西去磨坊与风车坡
    ...roads([
      [[560, -720], [420, -320], [230, 40], [180, 250], [-40, 600], [-120, 900]],
      [[560, -720], [1100, -660], [1640, -540], [2150, -760], [2620, -950], [3000, -960]],
      [[560, -720], [20, -640], [-600, -540], [-1120, -580], [-1700, -320], [-2250, -140]],
      [[180, 250], [-480, 420], [-1050, 520], [-1420, 520], [-1800, 760]],
      [[-120, 900], [480, 860], [1000, 700], [1360, 540]],
      [[1640, -540], [1700, -260]],
      [[1360, 540], [1900, 380], [2350, 200], [2480, -220], [2380, -600], [2150, -760]],
      [[-600, -540], [-300, -800]],
      [[-1120, -580], [-1620, -860]],
      [[1100, -660], [1180, -1000]],
    ], 170),
    { asset: V2('plaza'), x: 560, y: -720, width: 1100, flat: true },
    { asset: V2('wheat'), x: -2560, y: -980, width: 1000, block: { w: 860, d: 300 } },
    { asset: V2('wheat'), x: -2500, y: -360, width: 760, flipX: true, block: { w: 640, d: 220 } },
    { asset: V2('veg'), x: -700, y: -1180, width: 700, flat: true },
    { asset: V2('stream'), x: -2350, y: 300, width: 1100, flat: true },
    { asset: V2('stream'), x: -1300, y: 220, width: 1100, flat: true, flipX: true },
    { asset: V2('stream'), x: -300, y: 170, width: 1100, flat: true },
    { asset: V2('stream'), x: 760, y: 140, width: 1100, flat: true, flipX: true },
    { asset: V2('stream'), x: 1820, y: 180, width: 1100, flat: true },
    { asset: V2('stream'), x: 2800, y: 230, width: 1000, flat: true, flipX: true },
    { asset: V2('pond'), x: -1650, y: 120, width: 520, flat: true },
    // ── 立物 ──
    { asset: V2('bridge'), x: 180, y: 150, width: 460 },
    { asset: V2('bridge'), x: 2350, y: 190, width: 420, flipX: true },
    ...[[-2950, 1350], [-2700, 1250], [-2950, 700], [-2900, -200], [-2950, -1400], [-2100, 1350], [-1300, 1350], [-600, 1400], [400, 1400], [1000, 1350],
      [2100, 1380], [2800, 1300], [2950, 600], [2950, -300], [2400, -1450], [1700, -1450], [600, -1480], [-300, -1480], [-1200, -1450], [-2000, -1450]]
      .map(([x, y], i) => ({ asset: V2(i % 3 === 0 ? 'tree_pine' : 'tree_oak'), x, y, width: i % 3 === 0 ? 300 : 420, block: { w: 140, d: 60 } })),
    ...[[-800, 300], [2500, 700], [-2600, 900], [300, 700]]
      .map(([x, y]) => ({ asset: V2('tree_oak'), x, y, width: 380, block: { w: 130, d: 60 } })),
    ...[[-400, 380], [1350, 260], [-1000, -800], [860, -900], [2200, -500], [-2200, -650], [-700, 1250], [1900, 1100]]
      .map(([x, y]) => ({ asset: V2('bush'), x, y, width: 170 })),
    // 外圈第二层(出可走范围,把地图边缘围成林子)
    ...[[-3200, 1500], [-2500, 1560], [-1700, 1540], [-900, 1580], [-150, 1560], [700, 1580], [1500, 1560], [2300, 1560], [3100, 1500],
      [-3250, 900], [-3250, 300], [-3250, -400], [-3250, -1000], [3250, 1000], [3250, 300], [3250, -500], [3250, -1300],
      [-2800, -1650], [-1600, -1680], [-700, -1700], [200, -1700], [1100, -1680], [2000, -1660], [2900, -1600]]
      .map(([x, y], i) => ({ asset: V2(i % 2 === 0 ? 'tree_oak' : 'tree_pine'), x, y, width: i % 2 === 0 ? 460 : 340 })),
    ...[[-2400, 1150], [-1000, 1150], [600, 1180], [2600, 1000], [-2800, 160], [2800, -700], [-2300, -1300], [1500, -1300], [200, -1350], [-1300, -1250]]
      .map(([x, y], i) => ({ asset: V2(i % 2 ? 'bush' : 'rocks'), x, y, width: i % 2 ? 160 : 180, block: { w: 110, d: 40 } })),
    { asset: V2('hay'), x: -940, y: -1320, width: 240, block: { w: 160, d: 50 } },
    { asset: V2('hay'), x: -2000, y: -1180, width: 220, block: { w: 150, d: 50 } },
    { asset: V2('barrels'), x: 1460, y: -360, width: 190, block: { w: 120, d: 40 } },
    { asset: V2('barrels'), x: -480, y: -1000, width: 170, block: { w: 110, d: 40 } },
    { asset: V2('rocks'), x: -2700, y: 520, width: 240, block: { w: 160, d: 50 } },
    { asset: V2('rocks'), x: 2700, y: 40, width: 220, block: { w: 150, d: 50 } },
    { asset: V2('banner'), x: 160, y: -560, width: 120 },
    { asset: V2('banner'), x: 960, y: -560, width: 120 },
    { asset: V2('banner'), x: 1300, y: 900, width: 110 },
    ...[[-1600, 1180], [-1200, 860]].map(([x, y]) => ({ asset: V2('banner'), x, y, width: 110 })),
    ...[[-3000, -1000], [-2150, -760], [1950, 960], [1180, 960]].map(([x, y]) => ({ asset: V2('fence'), x, y, width: 320, block: { w: 280, d: 30 } })),
  ],
  lamps: [{ x: 120, y: -560 }, { x: 1000, y: -900 }, { x: -260, y: 600 }, { x: 1300, y: -200 }, { x: -1100, y: -620 }, { x: 2300, y: -760 }],
  lampAsset: V2('lamp'),
  // 村口广场中心(原型:广场正中圆形传送阵)
  waypoint: { x: 560, y: -720, drawn: true },
  camps: [camp('FIELD_VILLAGE_T', '训练用幼鼠', 'MINI_RAT', 1, 1, 1560, 460)],
  exits: [{ key: 'to_woods', label: '前往 · 村外林地', x: 2900, y: -960, radius: 130, toMap: 'WOODS', toSpawn: { x: -1600, y: 0 }, reach: 'VILLAGE_GATE' }],
};

const WOODS: WorldMapDef = {
  code: 'WOODS',
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
  exits: [{ key: 'to_village', label: '返回 · 晨风村', x: -1880, y: 0, radius: 110, toMap: 'VILLAGE', toSpawn: { x: 2500, y: -900 } }],
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
