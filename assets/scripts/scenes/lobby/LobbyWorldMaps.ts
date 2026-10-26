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

const VILLAGE: WorldMapDef = {
  code: 'VILLAGE',
  name: '晨风村',
  levelText: 'Lv.1-10',
  width: 2600,
  height: 1800,
  walk: { left: -1150, right: 1150, bottom: -780, top: 640 },
  spawn: { x: -120, y: -60 },
  ground: worldAsset('ground_village'),
  groundTile: 360,
  buildings: [
    { key: 'chief', label: '村长屋', asset: worldAsset('vil_chief_house'), action: 'npc', npc: 'CHIEF', x: -700, y: 330, width: 520, footprint: { w: 400, d: 150 }, door: { x: 60, y: -70 } },
    { key: 'training', label: '训练场', asset: worldAsset('vil_training'), action: 'npc', npc: 'INSTRUCTOR', x: 640, y: 330, width: 560, footprint: { w: 420, d: 140 }, door: { x: -150, y: -70 } },
    { key: 'altar', label: '圣契祭坛', asset: worldAsset('vil_altar'), action: 'npc', npc: 'PRIEST', x: 900, y: -260, width: 380, footprint: { w: 280, d: 110 }, door: { x: -90, y: -60 } },
    { key: 'smithy', label: '铁匠铺', asset: worldAsset('vil_smithy'), action: 'npc', npc: 'SMITH', x: -820, y: -330, width: 470, footprint: { w: 360, d: 140 }, door: { x: 90, y: -60 } },
    { key: 'well', label: '水井', asset: worldAsset('vil_well'), action: 'none', x: -180, y: 220, width: 200, footprint: { w: 150, d: 60 }, door: { x: 0, y: -40 } },
    { key: 'gate', label: '村口', asset: worldAsset('vil_gate'), action: 'none', x: 260, y: -700, width: 300, footprint: { w: 60, d: 40 }, door: { x: 0, y: -40 } },
  ],
  npcs: [
    { code: 'CHIEF', name: '村长 · 老霍恩', asset: worldAsset('npc_chief'), x: -560, y: 250, height: 210, flip: 1 },
    { code: 'INSTRUCTOR', name: '教官 · 格雷', asset: worldAsset('npc_instructor'), x: 470, y: 250, height: 215, flip: 1 },
    { code: 'PRIEST', name: '祭司 · 莉娅', asset: worldAsset('npc_priest'), x: 780, y: -330, height: 200, flip: 1 },
    { code: 'SMITH', name: '铁匠 · 巴洛', asset: worldAsset('npc_smith'), x: -700, y: -400, height: 215, flip: 1 },
  ],
  props: [
    { asset: worldAsset('vil_tree'), x: -1080, y: 520, width: 300, block: { w: 120, d: 60 } },
    { asset: worldAsset('vil_tree'), x: 1080, y: 560, width: 280, block: { w: 120, d: 60 } },
    { asset: worldAsset('vil_tree'), x: -1060, y: -640, width: 300, block: { w: 120, d: 60 } },
    { asset: worldAsset('vil_tree'), x: 1060, y: -600, width: 280, block: { w: 120, d: 60 } },
    { asset: worldAsset('vil_tree'), x: -300, y: 560, width: 260, block: { w: 110, d: 50 } },
    { asset: worldAsset('vil_fence'), x: -260, y: -520, width: 300, block: { w: 260, d: 30 } },
    { asset: worldAsset('vil_fence'), x: 760, y: -620, width: 300, block: { w: 260, d: 30 } },
  ],
  lamps: [{ x: -360, y: -180 }, { x: 380, y: -120 }],
  lampAsset: TOWN_LAMP_ASSET,
  waypoint: { x: 260, y: -420, drawn: true },
  camps: [camp('FIELD_VILLAGE_T', '训练用幼鼠', 'MINI_RAT', 1, 1, 640, 120)],
  exits: [{ key: 'to_woods', label: '前往 · 村外林地', x: 260, y: -760, radius: 110, toMap: 'WOODS', toSpawn: { x: -1600, y: 0 }, reach: 'VILLAGE_GATE' }],
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
  groundTile: 360,
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
  exits: [{ key: 'to_village', label: '返回 · 晨风村', x: -1880, y: 0, radius: 110, toMap: 'VILLAGE', toSpawn: { x: 260, y: -600 } }],
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

const GRAY: WorldMapDef = {
  code: 'GRAY',
  name: '灰岩荒原',
  levelText: 'Lv.10-20',
  width: 4800,
  height: 2800,
  walk: { left: -2250, right: 2250, bottom: -1250, top: 1100 },
  spawn: { x: -1900, y: -100 },
  ground: worldAsset('ground_wasteland'),
  groundTile: 360,
  buildings: [],
  npcs: [],
  props: [
    ...[[-1600, 800], [-400, 950], [900, 900], [2000, 800], [-1800, -950], [-300, -1000], [1500, -1000], [200, 200]]
      .map(([x, y]) => ({ asset: worldAsset('fld_rocks'), x, y, width: 340, block: { w: 240, d: 70 } })),
    ...[[-1100, 600], [700, -700], [1700, 300]].map(([x, y]) => ({ asset: worldAsset('fld_ruin_wall'), x, y, width: 420, block: { w: 320, d: 60 } })),
    ...[[-1300, -500], [0, 700], [2100, -400]].map(([x, y]) => ({ asset: worldAsset('fld_dead_tree'), x, y, width: 320, block: { w: 80, d: 40 } })),
    { asset: worldAsset('fld_bandit_camp'), x: 1250, y: 820, width: 620, block: { w: 480, d: 110 } },
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
