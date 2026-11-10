import { CITY_DEMO_DATA } from './LobbyCityDemoData';
import { TOWN_GROUND_ASSET, TOWN_GROUND_TILE } from './LobbyTownConfig';
import type { WorldMapDef, WorldMapProp, WorldSceneDef } from './LobbyWorldMaps';

/**
 * 主城重做演示广场(2026-11-11 用户看了两路画风的一屏效果图:「两个弄下,我看看效果,然后再决定用哪个」):
 * 本机预览地址带 ?cityDemo=moon(风格化写实 · 月夜)或 ?cityDemo=lit(光影主导暗调 · 薄雪)时,主城整张图换成对应画风的一屏中央广场。
 * 只是给用户比较两路实机效果用的:没有任务 NPC / 出口 / 告示板交互,线上地址不生效;用户选定后按选中的那一路重做整城,这个文件和
 * ui/world/citydemo 素材届时删掉。
 *
 * 做法:确认过的效果图本身当底图(贴地件),不再拆成单栋立物摆回平地 —— 可走栅格 / 遮挡条 / 随风摆的树和布由
 * tools/qa/city_demo_build.py 从「干净底图 + 四色分割图」生成(LobbyCityDemoData.ts);下面手填的是灯火 / 烟 / 人的位置,
 * 坐标都是底图像素(1672×941,左上原点),build() 里统一换成世界坐标。
 */
type Style = 'moon' | 'lit';

const DIR = 'ui/world/citydemo';
const A = (name: string): string => `${DIR}/${name}/spriteFrame`;
const CITY4 = (name: string): string => `ui/world/city4/${name}/spriteFrame`;
/** 一屏图铺成 2240 世界单位宽(镜头 1.3 时一屏约 2080 × 1170,四周各留一点可以推镜头)。 */
const MAP_W = 2240;
const WARM: [number, number, number] = [255, 178, 98];

interface DemoCfg {
  actorTint: [number, number, number];
  /** 飘落树叶 + 云影(现成的环境层)。 */
  ambient: boolean;
  /** 传送石台中心。 */
  waypoint: [number, number];
  /** [x, y, 半径, 明暗起伏, alpha, 飞蛾数] */
  glows: number[][];
  /** [x, 火根 y, 宽, 高, 脚线 y, 火星数] */
  flames: number[][];
  /** [x, y, 大小] */
  smokes: number[][];
  smokeTint: [number, number, number];
  mist: { tint: [number, number, number]; alpha: number };
  snow?: number;
  walkers: Array<{ spine: string; height: number; route: number[][]; speed: number; pause: [number, number]; perch?: boolean; timeScale?: number }>;
  /** [贴图, x, 脚线 y, 高, 是否水平翻转] */
  idlers: Array<[string, number, number, number, boolean]>;
}

const SPEAR = 'spine/monster/spear_male/spear_001';
const KNIGHT = 'spine/monster/sword_knight/sword_shield_001';
const DOG = 'spine/monster/medium_dog/medium_base_001';
const RAVEN = 'spine/monster/small_raven/small_base_001';

const CFG: Record<Style, DemoCfg> = {
  // 风格化写实 · 月夜:蓝青月光 + 暖灯 + 秋叶花丛
  moon: {
    actorTint: [206, 216, 246],
    ambient: true,
    waypoint: [1040, 448],
    glows: [
      // 路灯(左下那盏最大,有飞蛾)
      [543, 122, 150, 0.12, 54, 0], [739, 60, 115, 0.12, 46, 0], [1175, 85, 135, 0.12, 50, 0], [1492, 188, 140, 0.12, 52, 0],
      [505, 655, 200, 0.12, 62, 3], [1632, 575, 125, 0.14, 50, 0],
      // 窗
      [128, 172, 95, 0.07, 40, 0], [44, 415, 70, 0.07, 36, 0], [1355, 48, 80, 0.06, 34, 0], [1490, 105, 60, 0.06, 30, 0],
      // 铁匠炉
      [208, 356, 185, 0.34, 74, 0],
    ],
    flames: [[208, 376, 78, 60, 398, 3]],
    smokes: [[1080, 722, 150]],
    smokeTint: [168, 178, 204],
    mist: { tint: [150, 176, 220], alpha: 24 },
    walkers: [
      { spine: SPEAR, height: 215, route: [[1380, 362], [1215, 425], [1010, 348], [800, 322], [640, 335]], speed: 78, pause: [2.5, 5] },
      { spine: DOG, height: 100, route: [[430, 705], [640, 640], [880, 700], [760, 655]], speed: 92, pause: [3, 7] },
    ],
    idlers: [
      [CITY4('city4_npc_flower_girl'), 722, 350, 208, false],
      [CITY4('city4_npc_old_man'), 1238, 528, 208, false],
      [CITY4('city4_npc_bard'), 612, 702, 212, true],
    ],
  },
  // 光影主导暗调 · 薄雪:大半画面沉在暗里,火盆 / 炉火是光源
  lit: {
    actorTint: [198, 188, 184],
    ambient: false,
    waypoint: [1010, 498],
    glows: [
      // 火盆 ×3 / 墙上火把 / 铁匠炉
      [400, 262, 215, 0.3, 60, 0], [1190, 640, 225, 0.3, 62, 0], [1140, 822, 225, 0.3, 62, 0], [1182, 50, 140, 0.3, 50, 0], [1560, 372, 200, 0.34, 66, 0],
      // 门里的灯 / 拱门外集市的灯
      [828, 168, 110, 0.08, 34, 0], [170, 190, 120, 0.12, 36, 0],
    ],
    flames: [[400, 282, 86, 122, 360, 3], [1190, 658, 86, 122, 730, 3], [1140, 840, 86, 122, 912, 3], [1182, 62, 44, 66, 60, 1], [1560, 396, 104, 76, 414, 3]],
    smokes: [[608, 104, 150]],
    smokeTint: [128, 126, 134],
    mist: { tint: [176, 184, 204], alpha: 28 },
    snow: 46,
    walkers: [
      { spine: SPEAR, height: 215, route: [[960, 345], [800, 365], [620, 405], [480, 445]], speed: 78, pause: [2.5, 5] },
      // 教堂台阶上站岗
      { spine: KNIGHT, height: 222, route: [[1262, 170]], speed: 0, pause: [9, 9] },
      { spine: DOG, height: 100, route: [[1080, 705], [980, 620], [870, 700]], speed: 92, pause: [3, 7] },
      // 左下屋顶上的乌鸦
      { spine: RAVEN, height: 62, route: [[372, 772]], speed: 0, pause: [9, 9], perch: true },
    ],
    idlers: [
      [CITY4('city4_npc_wanderer'), 1118, 702, 208, false],
      [CITY4('city4_npc_old_man'), 1262, 702, 208, true],
      [CITY4('city4_npc_innkeeper'), 868, 252, 210, false],
    ],
  },
};

function build(style: Style): WorldMapDef {
  const d = CITY_DEMO_DATA[style];
  const cfg = CFG[style];
  const [W, H] = d.px;
  const unit = MAP_W / W;
  const mapH = Math.round(H * unit);
  const X = (px: number): number => Math.round((px - W / 2) * unit);
  const Y = (py: number): number => Math.round((H / 2 - py) * unit);
  const props: WorldMapProp[] = [
    // 底图:四周多补了一圈虚化暗边,比地图大,超宽屏看到的是暗边不是黑条
    { asset: A(`${style}_base`), x: 0, y: 0, width: (W + d.pad[0] * 2) * unit, flat: true },
    // 树 / 大灌木:随风摆,人走到后面开透视孔(现成机制)
    ...d.trees.map(([name, cx, foot, w]) => ({ asset: A(name), x: X(cx), y: Y(foot), width: w * unit, sway: true })),
    // 挂旗 / 布篷:上端固定随风起伏
    ...d.cloths.map(([name, cx, foot, w]) => ({ asset: A(name), x: X(cx), y: Y(foot), width: w * unit, sway: false, cloth: true })),
  ];
  const scene: WorldSceneDef = {
    fg: A(`${style}_fg`),
    px: [W, H],
    unit,
    strips: d.strips,
    walk: { cell: d.cell, cols: d.cols, rows: d.walk },
    dot: A('fx_dot'),
    glows: cfg.glows.map(([x, y, r, flicker, alpha, moths]) => ({ x: X(x), y: Y(y), r: r * unit, color: WARM, alpha, flicker, moths })),
    flames: cfg.flames.map(([x, y, w, h, foot, embers]) => ({ x: X(x), y: Y(y), w: w * unit, h: h * unit, foot: Y(foot), embers })),
    smokes: cfg.smokes.map(([x, y, size]) => ({ x: X(x), y: Y(y), size: size * unit, tint: cfg.smokeTint })),
    mist: cfg.mist,
    snow: cfg.snow,
    walkers: cfg.walkers.map((w) => ({
      spine: w.spine, height: w.height, route: w.route.map(([x, y]) => [X(x), Y(y)]), speed: w.speed, pause: w.pause, timeScale: w.timeScale,
      // 停在屋脊上的鸟:排到最前面(屋顶的遮挡条脚线在图的最下沿)
      ...(w.perch ? { perch: -mapH } : {}),
    })),
    idlers: cfg.idlers.map(([asset, x, y, height, flip]) => ({ asset, x: X(x), y: Y(y), height, flip })),
  };
  return {
    code: 'CITY',
    name: '主城',
    levelText: '',
    actorTint: cfg.actorTint,
    ambient: cfg.ambient,
    cameraZoom: 1.3,
    width: MAP_W,
    height: mapH,
    walk: { left: -MAP_W / 2 + 12, right: MAP_W / 2 - 12, bottom: -mapH / 2 + 12, top: mapH / 2 - 12 },
    openWalk: true,
    spawn: { x: X(d.spawn[0]), y: Y(d.spawn[1]) },
    ground: TOWN_GROUND_ASSET,
    groundTile: TOWN_GROUND_TILE,
    buildings: [],
    npcs: [],
    props,
    lamps: [],
    lampAsset: CITY4('city4_lamp'),
    // 石台是底图里画好的;传送阵的光效 / 交互照常
    waypoint: { x: X(cfg.waypoint[0]), y: Y(cfg.waypoint[1]), drawn: false },
    camps: [],
    exits: [],
    scene,
  };
}

/** 本机预览地址带 ?cityDemo=moon|lit(或 localStorage lcCityDemo)时返回演示广场;其它情况(包括线上)返回 null = 用正式主城。 */
export function cityDemoDef(): WorldMapDef | null {
  try {
    const g = globalThis as unknown as { location?: { hostname?: string; search?: string }; localStorage?: { getItem(key: string): string | null } };
    const host = g.location?.hostname ?? '';
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return null;
    }
    const hit = /[?&]cityDemo=(moon|lit)\b/.exec(g.location?.search ?? '');
    const style = hit ? hit[1] : g.localStorage?.getItem('lcCityDemo') ?? '';
    return style === 'moon' || style === 'lit' ? build(style) : null;
  } catch (error) {
    console.warn('[CityDemo] disabled', error);
    return null;
  }
}
