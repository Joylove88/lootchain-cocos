import { CITY_MOON_DATA } from './LobbyCityMoonData';
import { TOWN_GROUND_ASSET, TOWN_GROUND_TILE, TOWN_LAMP_ASSET } from './LobbyTownConfig';
import type { WorldMapBuilding, WorldMapDef, WorldMapNpc, WorldMapProp, WorldNpcCode, WorldSceneDef } from './LobbyWorldMaps';

/**
 * 主城 · 月夜(2026-11-11 重做;用户看了「月夜 / 暗调薄雪」两路实机演示后选月夜):
 * 风格化写实,蓝青月光 + 暖灯 + 秋叶花丛;整城是一张完整的画(3×3 块外扩拼成,约 2.6 × 2.6 屏),不再把建筑拆成单栋立物摆在平铺地面上
 * —— 前几轮「原型好看、实机别扭」就是拆的时候把围合 / 光影 / 接地丢了。
 *
 * 管线(tools/qa):city_moon_gen.py 出图拼整城 → city_moon_build.py seg 出五色分割图 → build 入库(底图切块 + 遮罩、树 / 布 / 水面抠图、
 * 可走栅格、遮挡条、自动找灯,生成 LobbyCityMoonData.ts)。下面手填的是 NPC / 出口 / 地点 / 巡逻路线,坐标都是整图像素(左上原点),
 * 由 P() 换成世界坐标;改了点位要重跑 tools/qa/export_world_geometry.py --node 更新后端坐标表(前后端同发)。
 *
 * 街区:中 = 罗盘广场(传送石台 / 水井 / 告示板 / 铁匠铺),东 = 集市 + 东门 + 兵营,西 = 佣兵公会 + 金麦酒馆,北 = 圣辉大教堂 + 公园,
 * 西北 = 帝国学院,南 = 运河 + 石桥 + 南门,东南 = 码头,西南 = 马厩院。公园和学院这一版只是景(图上栅栏没开门,走不进去),
 * 要走进去得重出北边两块并给广场上沿的栅栏开门。
 */
const DIR = 'ui/world/citymoon';
const A = (name: string): string => `${DIR}/${name}/spriteFrame`;
/** NPC 立绘沿用旧主城那批(ui/world/city4/city4_npc_*,荒原 / 枯木林的 NPC 也在用)。 */
const CITY4 = (name: string): string => `ui/world/city4/${name}/spriteFrame`;
const D = CITY_MOON_DATA;
const [W, H] = D.px;
/** 一屏图(1672 像素宽)铺成 2240 世界单位,和演示广场同一比例。 */
const UNIT = 2240 / 1672;
const MAP_W = Math.round(W * UNIT);
const MAP_H = Math.round(H * UNIT);
const X = (px: number): number => Math.round((px - W / 2) * UNIT);
const Y = (py: number): number => Math.round((H / 2 - py) * UNIT);
const WARM: [number, number, number] = [255, 178, 98];
const SPEAR = 'spine/monster/spear_male/spear_001';
const KNIGHT = 'spine/monster/sword_knight/sword_shield_001';
const DOG = 'spine/monster/medium_dog/medium_base_001';

// ── 手填点位(整图像素;对着 mosaic_preview.jpg 量的,× 2 = 整图像素)──
/** 传送石台中心。 */
const WAYPOINT = [2374, 1200];
/** 告示板(图里画好的那块):交互点在板子前面。 */
const BOARD = { x: 2652, footY: 1285, h: 150 };
/** 出口:走进圈里换图。南门 → 村外林地,东门 → 灰岩荒原;back = 从那张图回来时的落点(门内)。 */
const EXIT_SOUTH = { x: 2190, y: 2400, back: [2185, 2120] };
const EXIT_EAST = { x: 4230, y: 1210, back: [4030, 1320] };
/** NPC:[代号, 名字, 贴图, x, 脚线 y, 朝向(1 = 朝右)] */
const NPCS: Array<[WorldNpcCode, string, string, number, number, 1 | -1]> = [
  // 罗盘广场
  ['BARD', '吟游诗人 · 林恩', 'city4_npc_bard', 1930, 1450, 1],
  ['FLOWER_GIRL', '卖花姑娘 · 艾米', 'city4_npc_flower_girl', 2080, 1090, -1],
  // 站在告示板左前方看告示(离板子远一点:头顶名字不和「公告板」名牌叠在一起)
  ['OLD_MAN', '老镇民 · 霍克', 'city4_npc_old_man', 2585, 1388, 1],
  // 集市 / 兵营 / 东门
  ['VENDOR', '果摊大婶 · 玛莎', 'city4_npc_vendor', 3300, 1340, 1],
  ['MERCHANT', '杂货商 · 托比', 'city4_npc_merchant', 3690, 1270, -1],
  ['CAPTAIN', '卫队长 · 罗兰', 'city4_npc_captain', 3850, 1300, -1],
  ['GUARD_E', '城门卫兵', 'city4_npc_guard', 4000, 1335, -1],
  // 公会 / 酒馆
  ['GUILDMASTER', '公会会长 · 维克', 'city4_npc_guildmaster', 870, 1215, 1],
  // 站在酒馆门前空地上(别贴着大枫树:头顶名字会被树冠盖住)
  ['INNKEEPER', '酒馆老板 · 巴克', 'city4_npc_innkeeper', 440, 1245, 1],
  // 学院 / 公园这一版走不进去(栅栏没开门,只是景):学者站在教堂台阶下,小汤姆在集市灯柱旁
  ['SCHOLAR', '帝国学者 · 艾德里安', 'city4_npc_scholar', 2520, 1075, 1],
  ['CHILD', '小汤姆', 'city4_npc_child', 3480, 1330, 1],
  // 南门
  ['GUARD_S', '城门卫兵', 'city4_npc_guard', 2040, 1975, 1],
];
/** 地图页「地点」:[名字, x, y, 图标] */
const PLACES: Array<[string, number, number, string]> = [
  ['罗盘广场', WAYPOINT[0], WAYPOINT[1], 'portal'],
  ['圣辉大教堂', 2820, 860, 'place'],
  ['佣兵公会', 890, 1040, 'npc'],
  ['集市街', 3400, 1200, 'npc'],
  ['金麦酒馆', 340, 1040, 'npc'],
  ['王都兵营', 3840, 1080, 'place'],
  ['码头', 3400, 2120, 'place'],
  ['南门', 2190, 2300, 'place'],
  ['东门', 4180, 1200, 'place'],
];
/** 明火:[x, 火根 y, 宽, 高, 脚线 y, 火星数](铁匠炉)。 */
const FLAMES: number[][] = [[1546, 1129, 78, 60, 1151, 3]];
/** 烟囱烟:[x, y, 大小](广场南面那排屋顶 / 公会 / 南岸民居 / 码头仓库 / 东北民居)。 */
const SMOKES: number[][] = [[2418, 1498, 150], [1280, 600, 140], [2480, 1700, 140], [3100, 1600, 140], [3800, 210, 130]];
/** 走动的人 / 动物:路线点是整图像素(会吸到最近的可走格;两点之间走直线,别跨建筑)。 */
const WALKERS: Array<{ spine: string; height: number; route: number[][]; speed: number; pause: [number, number] }> = [
  // 广场北侧巡逻:教堂台阶下 ↔ 水井
  { spine: SPEAR, height: 215, route: [[2718, 1115], [2553, 1178], [2348, 1101], [2138, 1075], [1978, 1088]], speed: 78, pause: [2.5, 5] },
  // 集市巡逻:集市口 ↔ 兵营前
  { spine: KNIGHT, height: 222, route: [[3200, 1440], [3500, 1420], [3780, 1380]], speed: 72, pause: [3, 6] },
  // 运河边巡逻:石桥北头沿码头往东
  { spine: SPEAR, height: 215, route: [[2330, 1990], [2600, 2010], [2900, 2030]], speed: 78, pause: [3, 6] },
  // 广场上的狗
  { spine: DOG, height: 100, route: [[1768, 1458], [1978, 1393], [2218, 1453], [2098, 1408]], speed: 92, pause: [3, 7] },
  // 公会院子里的狗
  { spine: DOG, height: 100, route: [[520, 1330], [860, 1370], [1180, 1420]], speed: 92, pause: [4, 8] },
];

/**
 * 光晕精简:生成器按暖色高亮找到 408 个亮块(灯芯 / 亮窗),全开时同屏 100 多个叠加大圆、叠加面积约 5 屏(11-11 实测是帧耗时最大的一项)。
 * 只留够大的(灯和大窗)、互相至少隔 150 像素(一排窗只留最亮的一个),半径收到 0.8 倍 → 全城 117 个,同屏最多 30 个、约 1.4 屏。
 * 画里本来就画了灯光,这层只负责「明暗起伏 + 人走近被照亮」。
 */
const GLOWS = ((): number[][] => {
  const kept: number[][] = [];
  for (const g of D.glows.filter((item) => item[2] >= 110).sort((a, b) => b[2] - a[2])) {
    if (kept.every((k) => (k[0] - g[0]) ** 2 + (k[1] - g[1]) ** 2 > 150 * 150)) {
      kept.push(g);
    }
  }
  return kept;
})();

/** 可走栅格解成位图(和 LobbyTownScene.sceneWalkable 同一份数据)。 */
const WALK_BITS = ((): Uint8Array => {
  const bits = new Uint8Array(D.cols * D.walk.length);
  D.walk.forEach((hex, r) => {
    for (let c = 0; c < D.cols; c += 1) {
      bits[r * D.cols + c] = (parseInt(hex.charAt(c >> 2) || '0', 16) >> (3 - (c & 3))) & 1;
    }
  });
  return bits;
})();

/** 手填的点(整图像素)吸到最近的可走格中心:点位是对着图估的,差一点不至于让 NPC 站进墙里、出口踩不到。 */
function snap(px: number, py: number): [number, number] {
  const c0 = Math.floor(px / D.cell);
  const r0 = Math.floor(py / D.cell);
  for (let rad = 0; rad <= 16; rad += 1) {
    for (let dr = -rad; dr <= rad; dr += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) {
          continue;
        }
        const r = r0 + dr;
        const c = c0 + dc;
        if (r >= 0 && r < D.walk.length && c >= 0 && c < D.cols && WALK_BITS[r * D.cols + c] === 1) {
          return [c * D.cell + D.cell / 2, r * D.cell + D.cell / 2];
        }
      }
    }
  }
  return [px, py];
}
const SX = (px: number, py: number): { x: number; y: number } => {
  const [x, y] = snap(px, py);
  return { x: X(x), y: Y(y) };
};

const NPC_LIST: WorldMapNpc[] = NPCS.map(([code, name, art, x, y, flip]) => ({ code, name, asset: CITY4(art), ...SX(x, y), height: 215, flip }));

const PROPS: WorldMapProp[] = [
  // 底图块:四周多补了一圈虚化暗边,比地图大,超宽屏看到的是暗边不是黑条
  ...D.base.map(([name, cx, cy, w]) => ({ asset: A(name), x: X(cx), y: Y(cy), width: w * UNIT, flat: true })),
  // 水面:流水着色器(波纹 + 闪光)
  ...D.waters.map(([name, cx, cy, w]) => ({ asset: A(name), x: X(cx), y: Y(cy), width: w * UNIT, flat: true, water: true })),
  // 树 / 大灌木:随风摆,人走到后面开透视孔
  ...D.trees.map(([name, cx, foot, w]) => ({ asset: A(name), x: X(cx), y: Y(foot), width: w * UNIT, sway: true })),
  // 挂旗 / 布篷:上端固定随风起伏
  ...D.cloths.map(([name, cx, foot, w]) => ({ asset: A(name), x: X(cx), y: Y(foot), width: w * UNIT, sway: false, cloth: true })),
];

const SCENE: WorldSceneDef = {
  tiles: { base: D.base.map(([name]) => A(name)), masks: D.tiles.masks.map(A), cols: D.tiles.cols, tileW: D.tiles.tileW, tileH: D.tiles.tileH, pad: [D.pad[0], D.pad[1]] },
  px: [W, H],
  unit: UNIT,
  strips: D.strips,
  walk: { cell: D.cell, cols: D.cols, rows: D.walk },
  dot: A('fx_dot'),
  // 灯 / 窗:生成器按暖色高亮自动找的(精简后,见 GLOWS);大灯(半径大的)配飞蛾
  glows: GLOWS.map(([x, y, r], i) => ({ x: X(x), y: Y(y), r: r * 0.8 * UNIT, color: WARM, alpha: r >= 150 ? 62 : 48, flicker: 0.12, moths: r >= 165 && i % 3 === 0 ? 2 : 0 })),
  flames: FLAMES.map(([x, y, w, h, foot, embers]) => ({ x: X(x), y: Y(y), w: w * UNIT, h: h * UNIT, foot: Y(foot), embers })),
  smokes: SMOKES.map(([x, y, size]) => ({ x: X(x), y: Y(y), size: size * UNIT, tint: [168, 178, 204] as [number, number, number] })),
  mist: { tint: [150, 176, 220], alpha: 22 },
  walkers: WALKERS.map((w) => ({
    spine: w.spine, height: w.height, speed: w.speed, pause: w.pause,
    route: w.route.map(([x, y]) => { const p = SX(x, y); return [p.x, p.y]; }),
  })),
  idlers: [],
};

const BOARD_BUILDING: WorldMapBuilding = {
  key: 'board',
  label: '公告板',
  // 板子是底图里画好的:这里只要名牌和交互点,贴一张透明占位图
  asset: A('blank'),
  action: 'npc',
  npc: 'BOARD',
  x: X(BOARD.x),
  y: Y(BOARD.footY),
  width: BOARD.h * UNIT,
  footprint: { w: 0, d: 0 },
  // 交互点:板子前面最近的可走格
  door: { x: SX(BOARD.x, BOARD.footY + 40).x - X(BOARD.x), y: SX(BOARD.x, BOARD.footY + 40).y - Y(BOARD.footY) },
};

/** 别的地图通往主城的落点(LobbyWorldMaps 里覆盖林地 / 荒原出口的 toSpawn)。 */
export const CITY_MOON_ENTRY = {
  fromWoods: SX(EXIT_SOUTH.back[0], EXIT_SOUTH.back[1]),
  fromGray: SX(EXIT_EAST.back[0], EXIT_EAST.back[1]),
};

export const CITY_MOON: WorldMapDef = {
  code: 'CITY',
  name: '主城',
  levelText: '',
  actorTint: [206, 216, 246],
  ambient: true,
  cameraZoom: 1.3,
  width: MAP_W,
  height: MAP_H,
  walk: { left: -MAP_W / 2 + 12, right: MAP_W / 2 - 12, bottom: -MAP_H / 2 + 12, top: MAP_H / 2 - 12 },
  openWalk: true,
  spawn: { x: X(D.spawn[0]), y: Y(D.spawn[1]) },
  ground: TOWN_GROUND_ASSET,
  groundTile: TOWN_GROUND_TILE,
  buildings: [BOARD_BUILDING],
  npcs: NPC_LIST,
  props: PROPS,
  lamps: [],
  // 路灯都画在底图里了(lamps 为空);这个字段只是占位
  lampAsset: TOWN_LAMP_ASSET,
  // 石台是底图里画好的;传送阵的光效 / 交互照常
  waypoint: { ...SX(WAYPOINT[0], WAYPOINT[1]), drawn: false },
  places: PLACES.map(([name, x, y, icon]) => ({ name, x: X(x), y: Y(y), icon })),
  camps: [],
  exits: [
    { key: 'to_woods', label: '前往 · 村外林地', ...SX(EXIT_SOUTH.x, EXIT_SOUTH.y), radius: 140, toMap: 'WOODS', toSpawn: { x: 8250, y: 788 } },
    { key: 'to_gray', label: '前往 · 灰岩荒原', ...SX(EXIT_EAST.x, EXIT_EAST.y), radius: 140, toMap: 'GRAY', toSpawn: { x: -8560, y: -190 } },
  ],
  scene: SCENE,
  minimapArt: A('overview'),
};
