/**
 * 跑图世界地图定义(docs/50 P1):新手村「晨风村」/ 村外林地 / 主城 / 灰岩荒原。
 * 坐标系同主城(LobbyTownConfig):世界单位 = 900 高舞台设计像素,y 向上,地图中心为原点;
 * 建筑 (x, y) = 贴图底边中点(脚线),footprint 从脚线往屏幕上方延伸的不可走矩形,door = 交互点(相对脚线)。
 */
import type { WorldMapCode } from '../../types/WorldTypes';
import { TRAINING_FG, TRAINING_WALK_MASK } from './LobbyTrainingGround';
import { CITY_WATER_BLOCKS, DEADWOOD_WATER_BLOCKS, GRAY_WATER_BLOCKS, VILLAGE_WATER_BLOCKS, WOODS_WATER_BLOCKS } from './LobbyWaterBlocks';
import {
  DEAD_V4_AREAS, DEAD_V4_ASSETS, DEAD_V4_BRIDGE, DEAD_V4_CAMPS, DEAD_V4_CHESTS, DEAD_V4_EXITS, DEAD_V4_FLATS, DEAD_V4_LOW, DEAD_V4_NPCS,
  DEAD_V4_PLACES, DEAD_V4_POIS, DEAD_V4_ROADS, DEAD_V4_SIZE, DEAD_V4_SPAWN, DEAD_V4_STANDS, DEAD_V4_TALL, DEAD_V4_WAYPOINT,
} from './LobbyDeadwoodLayout';
import {
  CITY_V4_AREAS,
  CITY_V4_BOARD,
  CITY_V4_EXITS,
  CITY_V4_FLATS,
  CITY_V4_LAMPS,
  CITY_V4_LOW,
  CITY_V4_NPCS,
  CITY_V4_PLACES,
  CITY_V4_ROADS,
  CITY_V4_SIZE,
  CITY_V4_SPAWN,
  CITY_V4_STANDS,
  CITY_V4_WAYPOINT,
} from './LobbyCityLayout';
import {
  GRAY_V4_AREAS,
  GRAY_V4_ASSETS,
  GRAY_V4_BRIDGE,
  GRAY_V4_CAMPS,
  GRAY_V4_CHESTS,
  GRAY_V4_EXITS,
  GRAY_V4_FLATS,
  GRAY_V4_LOW,
  GRAY_V4_NPCS,
  GRAY_V4_PLACES,
  GRAY_V4_POIS,
  GRAY_V4_ROADS,
  GRAY_V4_SIZE,
  GRAY_V4_SPAWN,
  GRAY_V4_STANDS,
  GRAY_V4_TALL,
  GRAY_V4_WAYPOINT,
} from './LobbyGrayLayout';
import {
  WOODS_V4_AREAS,
  WOODS_V4_ASSETS,
  WOODS_V4_BRIDGE,
  WOODS_V4_CAMPS,
  WOODS_V4_CHESTS,
  WOODS_V4_DECALS,
  WOODS_V4_EXITS,
  WOODS_V4_FLATS,
  WOODS_V4_LOW,
  WOODS_V4_PLACES,
  WOODS_V4_POIS,
  WOODS_V4_ROADS,
  WOODS_V4_SIZE,
  WOODS_V4_SPAWN,
  WOODS_V4_STANDS,
  WOODS_V4_TALL,
  WOODS_V4_WAYPOINT,
} from './LobbyWoodsLayout';
import {
  TOWN_GROUND_ASSET,
  TOWN_GROUND_TILE,
  TOWN_LAMP_ASSET,
  type TownAction,
} from './LobbyTownConfig';

export type WorldNpcCode = 'CHIEF' | 'INSTRUCTOR' | 'PRIEST' | 'SMITH' | 'BOARD'
  // 11-08 主城 v4 NPC 城区:任务(学者 / 会长 / 卫队长)· 商店(杂货商 / 果摊)· 情报(酒馆老板)· 活人
  | 'SCHOLAR' | 'GUILDMASTER' | 'CAPTAIN' | 'MERCHANT' | 'INNKEEPER' | 'BARD' | 'FLOWER_GIRL' | 'OLD_MAN' | 'CHILD' | 'VENDOR'
  | 'GUARD_S' | 'GUARD_E'
  // 11-08 第 2 章:荒原流浪者营地首领
  | 'WANDERER'
  // 11-09 第 3 章:枯木林精灵营地守望者
  | 'WARDEN';

/** NPC 附带的服务(对话框里多一个按钮):商店 / 悬赏 / 酒馆传闻。 */
export type WorldNpcService = 'shop' | 'bounty' | 'rumor';
export const WORLD_NPC_SERVICE: Partial<Record<WorldNpcCode, WorldNpcService>> = {
  MERCHANT: 'shop',
  VENDOR: 'shop',
  GUILDMASTER: 'bounty',
  INNKEEPER: 'rumor',
};

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
  /** 贴地画(压在人物下面、不做遮挡淡出):场地类建筑(训练场)人要走进去。 */
  flat?: boolean;
  /**
   * 可进入的场地(11-03 训练场):outline 外轮廓内只有 floor 地面多边形可走,代替 footprint 整块挡路。
   * holes = 场内障碍脚底。坐标相对建筑原点(x 向右、y 向上),tools/qa/training_walk_def.py 从贴图像素描出来。
   */
  walkMask?: { outline: number[][]; floor: number[][]; holes?: number[][][] };
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
  /** 整体乘色(11-08 林地矮物件压暗一点融进地面,不一颗颗跳出来)。 */
  tint?: [number, number, number];
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
  /** 精英 / 首领脚下的骨骼光环(10-31);没有 = 旧的程序淡黄光圈。 */
  aura?: WorldMapCampAura;
  /** 固定站位(世界坐标);没有 = 按营地中心向日葵散布。 */
  spots?: number[][];
  /**
   * 训练靶(11-03 用户「怪死了没接任务就卡住」):静态贴图、不走动不还手不主动开战,打坏后 respawnMs 就重立,
   * 玩家站在旁边也照样重立(普通怪要等人走远)。
   */
  dummy?: { asset: string; height: number; respawnMs: number };
}

/**
 * 精英 / 首领骨骼光环(2026-10-31 用户「精英怪、BOSS 加一些特效」「特效用骨骼特效,静态贴图不好看」):
 * ground = 贴地循环(size = 包围盒长边世界像素;squash = 正视圆形法阵压扁贴地的纵向比例);rise = 身后升腾循环(y = 离脚底高度)。
 */
export interface WorldMapCampAura {
  ground: { effect: string; animation: string; size: number; squash?: number };
  /**
   * tint = 骨骼整体乘色(把现成光效染成别的颜色,例:紫红飘带染血红);
   * twin = 再叠一份镜像、0.72 倍速(共享缓存设不了起播时间,用速度差错开相位,循环里淡出那段也一直有光)。
   */
  rise?: { effect: string; animation: string; size: number; y: number; opacity?: number; tint?: [number, number, number]; twin?: boolean };
}

/** 去火 / 狂暴 / 腐化三套光环(素材 fx_pack_v2:A47-376 燃烧地环、A49-405 火焰光丝、A47-162 符文法阵、A47-217 紫色法阵 + 光柱、A47-453 品红旋涡)。 */
const AURA_LAVA: WorldMapCampAura = {
  ground: { effect: 'v2_a47_376', animation: 'action2', size: 330 },
  rise: { effect: 'v2_a49_405', animation: 'idle', size: 230, y: 70, opacity: 210 },
};
const AURA_RAGE: WorldMapCampAura = {
  ground: { effect: 'v2_a47_162', animation: 'fz', size: 340, squash: 0.34 },
};
const AURA_CORRUPT: WorldMapCampAura = {
  ground: { effect: 'v2_a47_217', animation: 'effect_debuff', size: 600 },
  rise: { effect: 'v2_a47_453', animation: 'action1', size: 520, y: 40, opacity: 190 },
};

/** 营地专属骨骼(10-31 Meowa 换皮的 2 倍高清写实变种):放在原怪目录下的子目录,原目录名查的体型 / 弹道表照常生效。 */
const VARIANT_SPINE = {
  lavaSpider: 'spine/monster/small_spider/elite_lava/small_base_001',
  brownBear: 'spine/monster/medium_bear/elite_brown/medium_base_001',
  corruptBear: 'spine/monster/medium_bear/boss_corrupt/medium_base_001',
};

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
/** 野外按只掉落 / 战果卡图标(docs/52 §7):按奖励码。 */
export const FIELD_DROP_ICON: Record<string, string> = {
  GOLD: 'ui/bag/ai/icon_gold/spriteFrame',
  LOW_ENHANCE_STONE: 'ui/bag/ai/icon_enhance_low/spriteFrame',
  HERO_EXP_BOOK: 'ui/bag/ai/icon_expbook/spriteFrame',
  KILL: 'ui/world/mapui/map_skull/spriteFrame',
};

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

/** 野外多层地表(11-08,LobbyGroundSplat / effects/world-ground):混合遮罩 + 4 层平铺材质(spriteFrame 路径)。 */
export interface GroundSplatDef {
  /** 混合遮罩(R 噪声 / G 草甸 / B 离路距离;tools/qa/woods_ground_install.py 生成)。 */
  mask: string;
  /** 第二张遮罩(R 落叶层 / G 裸土)。 */
  mask2: string;
  floor: string;
  moss: string;
  meadow: string;
  dirt: string;
  leaf: string;
  /** 各层一格多少世界单位:[腐殖层, 苔草, 草甸, 土路, 落叶]。 */
  tiles: [number, number, number, number, number];
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
  /** 11-03:走廊只用来撒树,不再限制行走(除挡块 / 立物外整张图都能走)。 */
  openWalk?: boolean;
  /** 多层地表(给了就用整图混合着色器代替 ground 平铺底纹;路面也由着色器画,不再盖路刷)。 */
  groundSplat?: GroundSplatDef;
  /** 高立物方向投影 + 脚下接地暗斑(11-08 E 方案 b / c)。 */
  groundShadows?: boolean;
  /** 高立物投影不透明度(默认 120,林地深色草地上实测 78 看不出);浅色地面(荒原)压淡,否则投影像一块黑多边形。 */
  castShadowOpacity?: number;
  /** 这些贴图不投方向影(旗杆 / 摊位 / 花箱 / 长椅等细小件:贴图整体压扁斜切出来是一大块黑多边形,11-09 主城实机);仍有脚下接地暗斑。 */
  castShadowSkip?: string[];
  /** 镜头拉远倍数(11-08 林地 1.4:同屏看到的范围按倍数放大,头顶字 / 血条 / 飘字反向放大保持屏上大小)。不给 = 1。 */
  cameraZoom?: number;
}

const MONSTER_SPINE: Record<string, string> = {
  MINI_RAT: 'spine/monster/mini_rat/mini_001',
  SMALL_SPIDER: 'spine/monster/small_spider/small_base_001',
  MEDIUM_BEAR: 'spine/monster/medium_bear/medium_base_001',
  MEDIUM_DOG: 'spine/monster/medium_dog/medium_base_001',
  SWORD_MALE: 'spine/monster/sword_male/sword_001',
  BOW_MALE: 'spine/monster/bow_male/bow_001',
  GARGOYLE: 'spine/monster/gargoyle/twohand_spear_001',
  // 11-08 灰岩荒原 v4:盗匪 / 狼王 / 碎岩巨像
  WHITE_WOLF_KING: 'spine/monster/white_wolf_king/white_wolf_001',
  DAGGER_FEMALE: 'spine/monster/dagger_female/dagger_001',
  CROSSBOW_MALE: 'spine/monster/crossbow_male/crossbow_001',
  SPEAR_MALE: 'spine/monster/spear_male/spear_001',
  BLUNT_MALE: 'spine/monster/blunt_male/blunt_001',
  ROCK_GOLEM: 'spine/monster/rock_golem/golem_001',
  // 11-08 第 2 章剧情精英:宿主「影」
  CROW_REAPER: 'spine/monster/crow_reaper/twohand_spear_001',
  // 11-09 枯木林(Lv.20-30):现成骨骼里有移动 / 攻击 / 死亡动作的几种
  LARGE_SPIDER: 'spine/monster/large_spider/large_001',
  SMALL_BAT: 'spine/monster/small_bat/small_base_001',
  SMALL_RAVEN: 'spine/monster/small_raven/small_base_001',
  STAFF_PRIEST: 'spine/monster/staff_priest/staff_001',
  MUTANT_MALE: 'spine/monster/mutant_male/knuckle_002_darkness',
  HALIDOM_KEEPER: 'spine/monster/halidom_keeper/halidom_001',
  CURSED_CASTER: 'spine/monster/cursed_caster/staff_001',
};

function camp(stageCode: string, label: string, monsterCode: string, count: number, level: number, x: number, y: number, elite = false,
  variant?: { spine?: string; aura?: WorldMapCampAura }): WorldMapCamp {
  // 一群 6~10 只:散布半径随只数放大
  // 10-30 用户「怪物太靠近都融一起了」:单只体型约 200,8 只一群散到半径 ~600
  const radius = stageCode.endsWith('_B') ? 120 : elite ? 90 : count <= 3 ? 170 : 140 + count * 58;
  return { stageCode, label, monsterCode, spine: variant?.spine ?? MONSTER_SPINE[monsterCode] ?? '', count, elite, level, x, y, radius, aura: variant?.aura };
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
/** 训练场建筑原点(贴图底边中点;遮挡件 / 可走区都相对它)。 */
const TRAINING_ORIGIN = { x: 1760, y: 366 };

const VILLAGE_BASE = {
  // 11-03 用户「地图可见范围内都应该能走」:放到离地图边 50(原来四周各留 250~640 一圈看得见走不了)
  walk: { left: -3150, right: 3150, bottom: -1500, top: 1500 },
  buildings: [
    { key: 'chief', label: '村长屋', asset: V3('chief_house'), action: 'npc', npc: 'CHIEF', x: -48, y: 654, width: 1280, footprint: { w: 704, d: 260 }, door: { x: 230, y: -40 } },
    { key: 'altar', label: '圣契祭坛', asset: V3('altar'), action: 'npc', npc: 'PRIEST', x: -1472, y: 606, width: 768, footprint: { w: 461, d: 150 }, door: { x: 0, y: -60 } },
    // 11-03 用户「地图显示在靶场附近但跑不上去」:场地贴地画 + 场内可走(入口在左下台阶),教官站场里
    { key: 'training', label: '训练场', asset: V3('training'), action: 'npc', npc: 'INSTRUCTOR', x: TRAINING_ORIGIN.x, y: TRAINING_ORIGIN.y, width: 1888, footprint: { w: 1548, d: 520 }, door: { x: -450, y: 200 },
      flat: true,
      walkMask: TRAINING_WALK_MASK },
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
  // 水面 / 瀑布 / 崖壁(11-03 改按贴图像素生成:岸边草地可走、桥面留空;tools/qa/world_water_blocks.py)
  blocks: VILLAGE_WATER_BLOCKS as WorldMapBlock[],
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
    // 11-03 用户「看不到村长」:原 (300, 600) 站在村长屋前大橡树后面被树冠整个挡住,挪到台阶下小路左侧
    { code: 'CHIEF', name: '村长 · 老霍恩', asset: worldAsset('npc_chief'), x: 90, y: 500, height: 210, flip: 1 },
    // 11-07 用户「训练场这里没有人物」:原 (2245, 816) 在场地右后角,门口对话时人在屏幕外 / 被任务卡挡住 → 挪到门内侧
    { code: 'INSTRUCTOR', name: '教官 · 格雷', asset: worldAsset('npc_instructor'), x: 1480, y: 640, height: 215, flip: -1 },
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
      .map(([x, y], i) => ({ asset: V3(i % 3 === 0 ? 'tree_pine' : 'tree_oak'), x, y, width: i % 3 === 0 ? 380 : 520, block: { w: 130, d: 55 } })),
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
    // 训练场遮挡件(前排栅栏竖条 / 小棚 / 石柱):和贴地的场地图逐像素重合,按脚线排序,人走到后面被挡住
    ...TRAINING_FG.map(([name, rx, ry, width]) => ({ asset: worldAsset(`vil3/${name}`), x: TRAINING_ORIGIN.x + rx, y: TRAINING_ORIGIN.y + ry, width, sway: false })),
  ],
  lamps: [{ x: 560, y: -300 }, { x: 1300, y: -560 }, { x: 340, y: 330 }, { x: -700, y: 440 }, { x: 1900, y: -1010 }, { x: -1250, y: -760 }],
  lampAsset: V2('lamp'),
  // 村口广场中心(原型:广场正中圆形传送阵)
  waypoint: { x: 784, y: -630, drawn: true },
  // 兴趣点(docs/54 §2.1;坐标 = 10-30 实测吸附后固定,与服务端 FieldGeometry 一致,docs/55 §3)
  pois: [
    { code: 'V_HIDDEN_1', kind: 'HIDDEN', name: '风车背后', x: -2150, y: 40 },
    { code: 'V_HIDDEN_2', kind: 'HIDDEN', name: '桥下的布包', x: 260, y: 150 },
    { code: 'V_HIDDEN_3', kind: 'HIDDEN', name: '麦田里的稻草人', x: -1960, y: -760 },
    { code: 'V_STELE_1', kind: 'STELE', name: '晨曦之碑', x: -1983, y: 1278 },
    { code: 'V_HERB_1', kind: 'HERB', name: '草药丛', x: -1279, y: -801 },
    { code: 'V_HERB_2', kind: 'HERB', name: '草药丛', x: -760, y: 470 },
  ],
  // 训练靶(服务端仍按 MINI_RAT 数值登记 3 只;11-03 由一只幼鼠改成场里 3 个可无限重立的稻草靶)
  camps: [{
    ...camp('FIELD_VILLAGE_T', '稻草靶', 'MINI_RAT', 3, 1, 1764, 771),
    // 原图里木桩靶的位置(靶子已从场地图抹掉,改成可打的单独贴图)
    spots: [[1543, 798], [1764, 767], [1986, 749]],
    dummy: { asset: V3('dummy'), height: 170, respawnMs: 3000 },
  }],
  exits: [{ key: 'to_woods', label: '前往 · 村外林地', x: 2470, y: -1070, radius: 130, toMap: 'WOODS', toSpawn: { x: -7470, y: -3375 }, reach: 'VILLAGE_GATE' }],
};


/** 林地 v4 物件行([素材序号, x, y, 宽, 翻转, 挡块宽?, 挡块深?])→ 地图立物 / 贴地件。 */
function woodsRows(rows: number[][], flat: boolean, tint?: [number, number, number]): WorldMapProp[] {
  return rows.map(([a, x, y, width, flip, bw, bd]) => {
    const prop: WorldMapProp = { asset: worldAsset(WOODS_V4_ASSETS[a]), x, y, width };
    if (tint) {
      prop.tint = tint;
    }
    if (flat) {
      prop.flat = true;
    }
    if (flip) {
      prop.flipX = true;
    }
    if (bw) {
      prop.block = { w: bw, d: bd };
    }
    return prop;
  });
}

/** 林地精英 / 首领的专属骨骼与光环(v4 布局表只给坐标)。 */
const WOODS_CAMP_VARIANT: Record<string, { spine?: string; aura?: WorldMapCampAura }> = {
  FIELD_WOODS_E2: { spine: VARIANT_SPINE.lavaSpider, aura: AURA_LAVA },
  FIELD_WOODS_E: { spine: VARIANT_SPINE.brownBear, aura: AURA_RAGE },
  FIELD_WOODS_B: { spine: VARIANT_SPINE.corruptBear, aura: AURA_CORRUPT },
};

const WOODS_HALF_W = WOODS_V4_SIZE.width / 2 - 50;
const WOODS_HALF_H = WOODS_V4_SIZE.height / 2 - 50;

/**
 * 村外林地 v4(2026-11-08 用户:镜头太近 / 地图更大 / 怪更密 / 人在树后看不到 / 装饰不要重叠、分区合理摆放):
 * v3 原型骨架整体放大 1.5 倍(20340×9788),八分区(路面 / 路肩 / 林缘 / 空地怪群 / 水边 / 岩区 / 遗迹 / 深林)按表撒物件,
 * 树冠不盖身后的路和怪群活动圈;普通怪群 20 → 30 群、每群 8~12 只(服务端每群仍按 6 只登记结算,每日 576 只封顶不变)。
 * 布局数据在 LobbyWoodsLayout.ts(tools/qa/woods_v4_gen.py apply 生成)。
 */
const WOODS: WorldMapDef = {
  code: 'WOODS',
  actorTint: [236, 242, 226],
  ambient: true,
  cameraZoom: 1.4,
  name: '村外林地',
  levelText: 'Lv.1-10',
  width: WOODS_V4_SIZE.width,
  height: WOODS_V4_SIZE.height,
  walk: { left: -WOODS_HALF_W, right: WOODS_HALF_W, bottom: -WOODS_HALF_H, top: WOODS_HALF_H },
  corridors: {
    half: 460,
    lines: WOODS_V4_ROADS,
    areas: WOODS_V4_AREAS.map(([x, y, rx, ry]) => ({ x, y, rx, ry })),
  },
  // 11-03 用户「地图可见范围内的都应该能走」:走廊只用来撒树;行走改成除水面 / 崖石(world_water_blocks.py 按像素生成)和立物挡块外都能走
  openWalk: true,
  blocks: WOODS_WATER_BLOCKS as WorldMapBlock[],
  spawn: { ...WOODS_V4_SPAWN },
  // 10-29 写实林地底纹(苔草 + 腐殖土),一格 1000 世界单位;11-08 起只在多层地表装好前兜底
  ground: worldAsset('ground_woods3'),
  groundTile: 1000,
  // 11-08 E 方案:腐殖层 / 苔草 / 草甸 / 落叶 / 裸土 / 土路六层高度混合(土路不规则边 + 暗边 + 车辙由着色器按离路距离画)
  groundSplat: {
    mask: worldAsset('woods4/ground_splat'),
    mask2: worldAsset('woods4/ground_splat2'),
    floor: worldAsset('woods4/tex_forest_floor'),
    moss: worldAsset('ground_woods3'),
    meadow: worldAsset('woods4/tex_meadow'),
    dirt: worldAsset('woods4/tex_dirt_path'),
    leaf: worldAsset('woods4/tex_leaf_litter'),
    // 11-08 第二版放大平铺(原 520 / 1000 / 300 / 420):材质细节在屏上读得出来,不缩成噪点;腐殖层 900 时满地大落叶太褐,收到 720
    tiles: [720, 1400, 560, 640, 380],
  },
  groundShadows: true,
  buildings: [],
  npcs: [],
  props: [
    // ── 贴地(先画的在下):地表贴花 → 崖 / 水 / 营地 / 遗迹地面 → 桥(路由多层地表着色器画)──
    ...woodsRows(WOODS_V4_DECALS, true),
    ...WOODS_V4_FLATS.map((f) => ({ ...f, asset: worldAsset(f.asset) })),
    { ...WOODS_V4_BRIDGE, asset: worldAsset(WOODS_V4_BRIDGE.asset) },
    // ── 立物:地标 / 营地件 → 高物件(树 / 岩)→ 矮物件(蕨 / 草 / 碎石)──
    ...WOODS_V4_STANDS.map((s) => ({ ...s, asset: worldAsset(s.asset) })),
    ...woodsRows(WOODS_V4_TALL, false),
    // 矮物件(蕨 / 草 / 碎石)压暗一点、略偏暖,当地面质感的一部分,视觉重心留给树和人(11-08 第二版)
    ...woodsRows(WOODS_V4_LOW, false, [214, 214, 204]),
  ],
  lamps: [],
  lampAsset: V2('lamp'),
  waypoint: { ...WOODS_V4_WAYPOINT, drawn: true },
  // 地图页「地点」(10-30 原型 proto_map_b)
  places: WOODS_V4_PLACES.map((p) => ({ ...p })),
  // 兴趣点(docs/54 §2.2)
  pois: WOODS_V4_POIS.map((p) => ({ ...p })),
  // 野外宝箱(docs/52 §3.1,走近点「开启」;铁箱 / 首领宝箱要先打赢旁边的精英 / 首领)
  chests: WOODS_V4_CHESTS.map((c) => ({ ...c })),
  camps: WOODS_V4_CAMPS.map(([code, label, monster, count, level, x, y, elite]) =>
    camp(code, label, monster, count, level, x, y, !!elite, WOODS_CAMP_VARIANT[code])),
  // 11-04 用户「晨风村 → 林地 → 主城要一路跑过去」:林地西南出口回晨风村、东头(东林空地)出口通主城
  exits: WOODS_V4_EXITS.map((e) => ({ ...e, toMap: e.toMap as WorldMapCode, toSpawn: { ...e.toSpawn } })),
  battleBg: 'battle_scene_field_forest',
};

const CITY_HALF_W = CITY_V4_SIZE.width / 2 - 50;
const CITY_HALF_H = CITY_V4_SIZE.height / 2 - 50;

/**
 * 主城 v4(2026-11-08 用户选写实原型 city_r1「晴天暖石城」+「主城就放任务 NPC / 活人 NPC / 地区商店 NPC,功能都在终端了」):
 * 14000×7000、镜头 1.4;罗盘广场(传送阵 + 公告板)/ 大教堂 / 佣兵公会 / 帝国学院 / 集市街 / 金麦酒馆 / 兵营 / 运河 / 城墙;
 * 原 9 栋功能建筑全部拆掉(召唤 / 英雄 / 锻造 / 水晶 / 试炼塔 / 掠夺 / 图鉴只走终端)。布局由 tools/qa/city_v4_gen.py 生成(LobbyCityLayout.ts)。
 */
const CITY: WorldMapDef = {
  code: 'CITY',
  name: '主城',
  levelText: '',
  actorTint: [248, 242, 232],
  ambient: true,
  cameraZoom: 1.4,
  width: CITY_V4_SIZE.width,
  height: CITY_V4_SIZE.height,
  walk: { left: -CITY_HALF_W, right: CITY_HALF_W, bottom: -CITY_HALF_H, top: CITY_HALF_H },
  corridors: { half: 300, lines: CITY_V4_ROADS, areas: CITY_V4_AREAS.map(([x, y, rx, ry]) => ({ x, y, rx, ry })) },
  openWalk: true,
  // 运河挡块(world_water_blocks.py 按贴图像素生成,石桥按桥面留空)
  blocks: CITY_WATER_BLOCKS as WorldMapBlock[],
  spawn: { ...CITY_V4_SPAWN },
  ground: TOWN_GROUND_ASSET,
  groundTile: TOWN_GROUND_TILE,
  // 多层地表:老卵石 / 长苔卵石 / 草坪 / 广场石板 / 主街条石(tools/qa/city_ground_install.py 生成遮罩)
  groundSplat: {
    mask: worldAsset('city4/ground_splat'),
    mask2: worldAsset('city4/ground_splat2'),
    floor: worldAsset('city4/tex_cobble'),
    moss: worldAsset('city4/tex_cobble_moss'),
    meadow: worldAsset('city4/tex_grass'),
    dirt: worldAsset('city4/tex_street'),
    leaf: worldAsset('city4/tex_flagstone'),
    // 11-09 精致风地面:细卵石约 22 一块、街面扇形大块约 45 一块(苔痕层是同纹理变体,尺寸一致才不成迷彩)
    tiles: [560, 560, 600, 520, 600],
  },
  groundShadows: true,
  // 高建筑的斜投影在街上压出整片暗块(实机 11-08)→ 主城再淡一些
  castShadowOpacity: 64,
  castShadowSkip: ['city4_banner', 'city4_stall_a', 'city4_stall_b', 'city4_flower_bed', 'city4_bench', 'city4_lamp', 'city4_notice_board', 'city4_statue', 'city4_well', 'city4_barrels'],
  buildings: [
    // 剧情任务公告板(docs/50 §4.1):罗盘广场东侧
    { ...CITY_V4_BOARD, asset: worldAsset(CITY_V4_BOARD.asset), action: 'npc', npc: 'BOARD' },
  ],
  npcs: CITY_V4_NPCS.map((n) => ({ code: n.code as WorldNpcCode, name: n.name, asset: worldAsset(n.asset), x: n.x, y: n.y, height: n.height, flip: (n.flip < 0 ? -1 : 1) as 1 | -1 })),
  props: [
    // 贴地:罗盘广场 / 运河 / 小船 / 石桥
    ...CITY_V4_FLATS.map((f) => ({ ...f, asset: worldAsset(f.asset), flat: true })),
    // 立物:城墙 / 门楼 / 地标 / 民居 / 摊位 / 雕像 / 树 → 花箱 / 木桶 / 长椅 / 灌木
    ...CITY_V4_STANDS.map((s) => ({ ...s, asset: worldAsset(s.asset) })),
    ...CITY_V4_LOW.map((s) => ({ ...s, asset: worldAsset(s.asset) })),
  ],
  lamps: CITY_V4_LAMPS.map((l) => ({ ...l })),
  lampAsset: worldAsset('city4/city4_lamp'),
  // 广场罗盘就是主城传送阵(贴地件自带罗盘,不另画底座)
  waypoint: { ...CITY_V4_WAYPOINT, drawn: false },
  places: CITY_V4_PLACES.map((p) => ({ ...p })),
  camps: [],
  // 南门回林地,东门去灰岩荒原;首次来要走到广场罗盘激活传送阵
  exits: CITY_V4_EXITS.map((e) => ({ ...e, toMap: e.toMap as WorldMapCode, toSpawn: { ...e.toSpawn } })),
};

/** 灰岩荒原 v4 布局表的物件行 → 道具(同 woodsRows,素材表换成 GRAY_V4_ASSETS)。 */
function grayRows(rows: number[][], tint?: [number, number, number]): WorldMapProp[] {
  return rows.map(([a, x, y, width, flip, bw, bd]) => {
    const prop: WorldMapProp = { asset: worldAsset(GRAY_V4_ASSETS[a]), x, y, width };
    if (tint) {
      prop.tint = tint;
    }
    if (flip) {
      prop.flipX = true;
    }
    if (bw) {
      prop.block = { w: bw, d: bd };
    }
    return prop;
  });
}

/** 荒原精英 / 首领光环(布局表只给坐标):狼王狂暴法阵、石像鬼腐化、碎岩巨像熔火。 */
const GRAY_CAMP_VARIANT: Record<string, { spine?: string; aura?: WorldMapCampAura }> = {
  FIELD_GRAY_E2: { aura: AURA_RAGE },
  FIELD_GRAY_E: { aura: AURA_CORRUPT },
  FIELD_GRAY_B: { aura: AURA_LAVA },
  FIELD_GRAY_S: { aura: AURA_CORRUPT },
};

const GRAY_HALF_W = GRAY_V4_SIZE.width / 2 - 50;
const GRAY_HALF_H = GRAY_V4_SIZE.height / 2 - 50;

/**
 * 灰岩荒原 v4(2026-11-08 用户:「其他图没有地面 / 装饰 / 鸟瞰图,需要补全」+ 选写实原型 gray_r1):
 * 18000×9000、镜头 1.4;西营地 → 盆地 → 干河谷石桥 → 哨岗 / 营寨 → 遗迹 → 矿坑 → 碎岩巨像;
 * 24 普通群(Lv.10~19)+ 狼王 / 石像鬼精英 + 碎岩巨像首领;布局由 tools/qa/gray_v4_gen.py 生成(LobbyGrayLayout.ts)。
 */
const GRAY: WorldMapDef = {
  code: 'GRAY',
  name: '灰岩荒原',
  levelText: 'Lv.10-20',
  actorTint: [240, 236, 228],
  ambient: false,
  cameraZoom: 1.4,
  width: GRAY_V4_SIZE.width,
  height: GRAY_V4_SIZE.height,
  walk: { left: -GRAY_HALF_W, right: GRAY_HALF_W, bottom: -GRAY_HALF_H, top: GRAY_HALF_H },
  corridors: { half: 460, lines: GRAY_V4_ROADS, areas: GRAY_V4_AREAS.map(([x, y, rx, ry]) => ({ x, y, rx, ry })) },
  openWalk: true,
  // 河谷 / 矿坑坑心挡块(world_water_blocks.py 按贴图像素生成)
  blocks: GRAY_WATER_BLOCKS as WorldMapBlock[],
  spawn: { ...GRAY_V4_SPAWN },
  ground: worldAsset('ground_wasteland'),
  groundTile: 900,
  // 多层地表:龟裂土 / 碎石地 / 枯草 / 碎岩屑 / 裸土 / 土路(tools/qa/gray_ground_install.py 生成遮罩)
  groundSplat: {
    mask: worldAsset('gray4/ground_splat'),
    mask2: worldAsset('gray4/ground_splat2'),
    floor: worldAsset('gray4/tex_earth'),
    moss: worldAsset('gray4/tex_gravel'),
    meadow: worldAsset('gray4/tex_drygrass'),
    dirt: worldAsset('gray4/tex_track'),
    leaf: worldAsset('gray4/tex_scree'),
    tiles: [720, 1300, 560, 640, 520],
  },
  groundShadows: true,
  castShadowOpacity: 78,
  buildings: [],
  npcs: GRAY_V4_NPCS.map((n) => ({ code: n.code as WorldNpcCode, name: n.name, asset: worldAsset(n.asset), x: n.x, y: n.y, height: n.height, flip: (n.flip < 0 ? -1 : 1) as 1 | -1 })),
  props: [
    // 贴地:峡谷段 / 矿坑 / 遗迹地面 → 石桥
    ...GRAY_V4_FLATS.map((f) => ({ ...f, asset: worldAsset(f.asset), flat: true })),
    { ...GRAY_V4_BRIDGE, asset: worldAsset(GRAY_V4_BRIDGE.asset), flat: true },
    // 立物:地标(营地 / 哨岗 / 营寨 / 遗迹 / 巨像 / 矿坑 / 崖台)→ 石柱 / 岩块 / 枯树 → 枯草 / 灌丛 / 碎石
    ...GRAY_V4_STANDS.map((s) => ({ ...s, asset: worldAsset(s.asset) })),
    ...grayRows(GRAY_V4_TALL),
    ...grayRows(GRAY_V4_LOW, [222, 218, 210]),
  ],
  lamps: [],
  lampAsset: TOWN_LAMP_ASSET,
  waypoint: { ...GRAY_V4_WAYPOINT, drawn: true },
  places: GRAY_V4_PLACES.map((p) => ({ ...p })),
  pois: GRAY_V4_POIS.map((p) => ({ ...p })),
  chests: GRAY_V4_CHESTS.map((c) => ({ ...c })),
  camps: GRAY_V4_CAMPS.map(([code, label, monster, count, level, x, y, elite]) =>
    camp(code, label, monster, count, level, x, y, !!elite, GRAY_CAMP_VARIANT[code])),
  exits: [
    ...GRAY_V4_EXITS.map((e) => ({ ...e, toMap: e.toMap as WorldMapCode, toSpawn: { ...e.toSpawn } })),
    // 11-09 东口 → 枯木林(Lv.20;落在枯木林西口精灵营地外)
    { key: 'to_deadwood', label: '前往 · 枯木林', x: GRAY_V4_SIZE.width / 2 - 140, y: -270, radius: 130, toMap: 'DEADWOOD' as WorldMapCode, toSpawn: { x: -8560, y: 157 } },
  ],
  battleBg: 'battle_scene_field_wasteland',
};

/** 枯木林 v4 布局表的物件行 → 道具(同 grayRows,素材表换成 DEAD_V4_ASSETS)。 */
function deadRows(rows: number[][], tint?: [number, number, number]): WorldMapProp[] {
  return rows.map(([a, x, y, width, flip, bw, bd]) => {
    const prop: WorldMapProp = { asset: worldAsset(DEAD_V4_ASSETS[a]), x, y, width };
    if (tint) {
      prop.tint = tint;
    }
    if (flip) {
      prop.flipX = true;
    }
    if (bw) {
      prop.block = { w: bw, d: bd };
    }
    return prop;
  });
}

/** 枯木林精英 / 首领光环:沼泽蛛母腐化、守墓人狂暴法阵、林间女巫腐化(紫色法阵 + 品红旋涡)。 */
const DEAD_CAMP_VARIANT: Record<string, { spine?: string; aura?: WorldMapCampAura }> = {
  FIELD_DEADWOOD_E2: { aura: AURA_CORRUPT },
  FIELD_DEADWOOD_E: { aura: AURA_RAGE },
  FIELD_DEADWOOD_B: { aura: AURA_CORRUPT },
};

const DEAD_HALF_W = DEAD_V4_SIZE.width / 2 - 50;
const DEAD_HALF_H = DEAD_V4_SIZE.height / 2 - 50;

/**
 * 枯木林 v4(2026-11-09 用户选写实原型 dead_r1,Lv.20-30;管线同灰岩荒原 v4):18000×9000、镜头 1.4;
 * 西精灵营地(接灰岩荒原东口)→ 古树林 → 黑泥沼泽 → 黑溪树根桥 → 鸦岩 → 旧墓园 → 伐木村 → 低语石阵 → 女巫谷;
 * 24 普通群(Lv.20~29)+ 沼泽蛛母 / 守墓人精英 + 林间女巫首领;布局由 tools/qa/dead_v4_gen.py 生成(LobbyDeadwoodLayout.ts)。
 */
const DEADWOOD: WorldMapDef = {
  code: 'DEADWOOD',
  name: '枯木林',
  levelText: 'Lv.20-30',
  actorTint: [236, 232, 224],
  ambient: false,
  cameraZoom: 1.4,
  width: DEAD_V4_SIZE.width,
  height: DEAD_V4_SIZE.height,
  walk: { left: -DEAD_HALF_W, right: DEAD_HALF_W, bottom: -DEAD_HALF_H, top: DEAD_HALF_H },
  corridors: { half: 460, lines: DEAD_V4_ROADS, areas: DEAD_V4_AREAS.map(([x, y, rx, ry]) => ({ x, y, rx, ry })) },
  openWalk: true,
  // 黑溪水面 / 沼泽水心挡块(world_water_blocks.py 按贴图像素生成)
  blocks: DEADWOOD_WATER_BLOCKS as WorldMapBlock[],
  spawn: { ...DEAD_V4_SPAWN },
  ground: worldAsset('dead4/tex_mud'),
  groundTile: 900,
  // 多层地表:黑泥 / 苔藓 / 枯草 / 土路 / 落叶(tools/qa/dead_ground_install.py 生成遮罩)
  groundSplat: {
    mask: worldAsset('dead4/ground_splat'),
    mask2: worldAsset('dead4/ground_splat2'),
    floor: worldAsset('dead4/tex_mud'),
    moss: worldAsset('dead4/tex_moss'),
    meadow: worldAsset('dead4/tex_deadgrass'),
    dirt: worldAsset('dead4/tex_track'),
    leaf: worldAsset('dead4/tex_leaves'),
    tiles: [720, 1300, 560, 640, 520],
  },
  groundShadows: true,
  castShadowOpacity: 70,
  buildings: [],
  npcs: DEAD_V4_NPCS.map((n: { code: string; name: string; asset: string; x: number; y: number; height: number; flip: number }) => ({ code: n.code as WorldNpcCode, name: n.name, asset: worldAsset(n.asset), x: n.x, y: n.y, height: n.height, flip: (n.flip < 0 ? -1 : 1) as 1 | -1 })),
  props: [
    // 贴地:黑溪段 / 沼泽 → 树根桥
    ...DEAD_V4_FLATS.map((f) => ({ ...f, asset: worldAsset(f.asset), flat: true })),
    { ...DEAD_V4_BRIDGE, asset: worldAsset(DEAD_V4_BRIDGE.asset), flat: true },
    // 立物:地标(营地 / 古树 / 鸦岩 / 礼拜堂 / 木屋 / 石阵 / 世界树 / 林缘)→ 枯树 / 苔石 / 倒木 → 枯草 / 枯灌丛 / 落枝 / 蘑菇
    ...DEAD_V4_STANDS.map((s) => ({ ...s, asset: worldAsset(s.asset) })),
    ...deadRows(DEAD_V4_TALL),
    ...deadRows(DEAD_V4_LOW, [214, 210, 200]),
  ],
  lamps: [],
  lampAsset: TOWN_LAMP_ASSET,
  waypoint: { ...DEAD_V4_WAYPOINT, drawn: true },
  places: DEAD_V4_PLACES.map((p) => ({ ...p })),
  pois: DEAD_V4_POIS.map((p) => ({ ...p })),
  chests: DEAD_V4_CHESTS.map((c) => ({ ...c })),
  camps: DEAD_V4_CAMPS.map(([code, label, monster, count, level, x, y, elite]) =>
    camp(code, label, monster, count, level, x, y, !!elite, DEAD_CAMP_VARIANT[code])),
  exits: DEAD_V4_EXITS.map((e) => ({ ...e, toMap: e.toMap as WorldMapCode, toSpawn: { ...e.toSpawn } })),
  battleBg: 'battle_scene_field_wasteland',
};

export const WORLD_MAPS: Record<WorldMapCode, WorldMapDef> = { VILLAGE, WOODS, CITY, GRAY, DEADWOOD };
// 自验 / 坐标导出脚本读地图定义用(tools/qa/export_world_geometry.py,docs/55)
(globalThis as unknown as { __lootchainWorldMaps?: unknown }).__lootchainWorldMaps = WORLD_MAPS;

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
  const splat = def.groundSplat;
  return Array.from(new Set([def.ground, def.lampAsset,
    // 多层地表遮罩 + 材质(11-08)
    ...(splat ? [splat.mask, splat.mask2, splat.floor, splat.moss, splat.meadow, splat.dirt, splat.leaf] : []), ...def.buildings.map((b) => b.asset), ...def.props.map((p) => p.asset),
    ...def.npcs.map((n) => n.asset).filter((asset): asset is string => !!asset),
    // 训练靶贴图(camp.dummy)
    ...def.camps.map((c) => c.dummy?.asset).filter((asset): asset is string => !!asset),
    // 地图页鸟瞰底图(tools/qa/map_overview_capture.py 截出的两张)
    ...(code === 'VILLAGE' || code === 'WOODS' || code === 'GRAY' || code === 'CITY' || code === 'DEADWOOD' ? [worldAsset(`overview/ov_${code.toLowerCase()}`)] : []),
    // 野外宝箱贴图(渲染层 CHEST_ART:关着 / 开盖空箱)
    ...(def.chests?.length ? Object.values(CHEST_ART) : []),
    // 兴趣点素材(docs/54)+ 场上头顶圆徽用的图标(进图前要在内存里,场上节点不会因贴图晚到而重绘)
    ...(def.pois?.length ? [...Object.values(POI_ASSET), ...Object.values(POI_MAP_ICON)] : []),
    // 角色脚下柔边接触阴影(LobbyTownRenderer CONTACT_SHADOW)
    worldAsset('fx/contact_shadow'),
    // 野外按只掉落的飞行图标 / 「本轮战果」卡图标(docs/52 §7)
    ...(def.camps.length ? Object.values(FIELD_DROP_ICON) : []),
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
    // 精英 / 首领光环骨骼特效:进图前一起下到本地,否则首次见到时光环晚出
    if (camp.aura) {
      set.add(`spine/effect/${camp.aura.ground.effect}`);
      if (camp.aura.rise) {
        set.add(`spine/effect/${camp.aura.rise.effect}`);
      }
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
  // 佣兵公会背景(11-06 B 毛玻璃,替换羊皮纸悬赏令)
  worldAsset('guild_bg_b'),
  // 世界地图气泡 / 悬赏令上的怪物立绘
  ...Object.keys(MONSTER_SPINE).map((code) => `monster/${code.toLowerCase()}/spriteFrame`),
]));
