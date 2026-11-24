import type { WorldMapDef, WorldMapNpc, WorldMapProp, WorldNpcCode, WorldSceneDef } from '../LobbyWorldMaps';
import { TOWN_GROUND_ASSET, TOWN_GROUND_TILE, TOWN_LAMP_ASSET } from '../LobbyTownConfig';
import { PRE25_CITY_DATA } from './Pre25CityData';
import { PRE25_PAINT } from './Pre25PaintData';

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
/**
 * 手绘版(11-23 用户看完原型选「A · v4 布局」):3D 渲染块只当底稿,逐块按守卫战背景的画法重画成白天手绘
 * (tools/qa/city_v4_paint.py,成品精度 = 渲染的一半,一块 1024 = 渲染 2048 像素)。有手绘块就用它们,
 * 人物换回游戏里的 2D 队伍(不再换成预渲染主角),遮挡改成「挡在人前面的那部分画面再盖一遍」(Pre25Actors.occOverlay)。
 * 几何(可走格、高度、NPC、出口)和 3D 版完全一样,只是整城在游戏里缩成一半(见 CITY_SCALE)。
 */
export const PRE25_PAINTED = PRE25_PAINT.tiles.length > 0;
/**
 * 手绘版整城缩成一半(世界单位):v4 是按真人尺寸摆的城(人 1.8 米),游戏里的 2D 队伍只有它一半高 ——
 * 11-23 实机第一版按原尺寸放,一座桥就占满整屏、房子是人的十倍高,手绘图还被放大到一个像素 2.4 个屏幕像素(糊)。
 * 缩一半后房子约是人的 4 倍高(和旧主城差不多),一屏看到的城是原来 4 倍,画面每像素约 1.2 个屏幕像素。
 */
const CITY_SCALE = PRE25_PAINTED ? 0.5 : 1;
const U = D.unit * CITY_SCALE;
const P = (D.pitch * Math.PI) / 180;
/** 镜头水平朝向(度):0 = 正对东边;-45 = 往东北斜着看(11-18 用户选的视角 D)。 */
const YAW = ((((D as any).yaw as number | undefined) ?? 0) * Math.PI) / 180;
/** 水平朝向 H(画面上方对应的地面方向)和画面右方 R,都是 3D 场景里 (X, Z) 平面上的单位向量。 */
const HX = Math.cos(YAW);
const HZ = Math.sin(YAW);
const DIR = 'pre25/city';

/**
 * 开关:手绘版有图块时它就是默认主城(地址带 ?citymoon=1 或 localStorage.lcCityMoon = '1' 退回 11-12 的月夜主城,对比用;
 * 原生 / node 工具链没有地址,就是手绘版);没有手绘块时是 11-19 的 3D 渲染实验,只在网页端带 ?pre25=1 / lcPre25 才换上。
 */
export function pre25Enabled(): boolean {
  try {
    if (PRE25_PAINTED) {
      if (typeof location !== 'undefined' && /[?&]citymoon=1\b/.test(location.search)) {
        return false;
      }
      return !(typeof localStorage !== 'undefined' && localStorage.getItem('lcCityMoon') === '1');
    }
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
const PAINT_DIR = 'pre25/city_paint';
const PAINT_SPAN = PRE25_PAINT.tile / PRE25_PAINT.scale;
export const PRE25_PAINT_TILES = PRE25_PAINT.tiles.map(([r, c]) => ({
  r, c, path: `${PAINT_DIR}/p_${r}_${c}/texture`,
  x: ((c + 0.5) * PAINT_SPAN - IW / 2) * U, y: (IH / 2 - (r + 0.5) * PAINT_SPAN) * U, size: PAINT_SPAN * U,
  /** 这块盖住的 2 × 2 个遮挡块里左上那块的行列。 */
  occR: Math.round((r * PAINT_SPAN) / D.chunk), occC: Math.round((c * PAINT_SPAN) / D.chunk),
}));
export const PRE25_PAINT_SPAN = PAINT_SPAN;
/** 水流遮罩(pre25/city_paint/flow,整图补成 grid 列 × 行块后的 1/8)和它的格数:图块 (r, c) 在遮罩里占 (c / 列, r / 行, 1 / 列, 1 / 行)。 */
export const PRE25_PAINT_FLOW = { path: `${PAINT_DIR}/flow/texture`, cols: PRE25_PAINT.grid[0], rows: PRE25_PAINT.grid[1], tile: PRE25_PAINT.tile };
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
  // 11-24 手绘版整城缩一半后,原位置(-62, 76.5)正挡在南门门洞进城的路线上、身前就是门楼墙 → 挪到门洞东侧的石板地上
  // (旁边那盏路灯在 v3 布局整理里去掉了:城门 10 米内不留散立的路灯)
  ['GUARD_S', '城门卫兵', 'city4_npc_guard', -59.4, 77.1, 1],
];
const NPC_LIST: WorldMapNpc[] = NPCS.map(([code, name, art, X, Z, flip]) => ({ code, name, asset: CITY4(art), ...pre25Ground(X, Z), height: 215, flip }));

/** 灯 → 光晕(整图像素 → 世界);路灯 / 火盆这类已经画在底图里,这里只补一层会起伏的暖光。 */
const WARM: [number, number, number] = [255, 178, 98];
const GLOWS = (D.lights as unknown as Array<[number, number, string, number[]]>)
  .filter(([, , kind]) => kind !== 'fill' && kind !== 'moon')
  .map(([ix, iy, kind]) => ({ ...pre25PxToWorld(ix, iy), r: (kind === 'brazier' ? 150 : 110) * U, color: WARM, alpha: 40, flicker: 0.12 }));

/** 可走栅格的格子(行 r0..r1、列 c0..c1,含两端)→ 世界坐标矩形 [x0, y0, x1, y1](和 sceneWalkable 同一套换算,跟着 CITY_SCALE 走)。 */
function walkCellRect(r0: number, c0: number, r1: number, c1: number): [number, number, number, number] {
  const cell = D.walk.cell;
  const wx = (c: number): number => (c * cell - IW / 2) * U;
  const wy = (r: number): number => (IH / 2 - r * cell) * U;
  return [wx(c0) + 0.01, wy(r0) - 0.01, wx(c1 + 1) - 0.01, wy(r1 + 1) + 0.01];
}

/**
 * 11-24 用户「人物到这个位置不能往下了,我怎么前往村外林地」:自动生成的栅格把南门门楼背后(画面上和屋顶重叠)那一排判成挡,
 * 从广场直着往下走进门洞走不通,只剩绕西边墙根的路(寻路能找到、推摇杆找不到)→ 打通门洞宽的一条(约 4 米),出口圈挪到通道中间。
 * 用 tools/qa/city_walk_audit.py 看效果(它也读这张表)。
 */
const WALK_PATCHES: Array<[number, number, number, number, number]> = [
  [...walkCellRect(1419, 1128, 1440, 1162), 1],
  // 11-24 整图体检:草坪 / 石板地上的「空气墙」——3D 场景里有碰撞、但底稿和手绘图上都是空地(city_walk_audit 孤立小障碍逐个过目),改成可走
  [...walkCellRect(811, 667, 820, 687), 1],     // (-5069, -202)
  [...walkCellRect(639, 655, 649, 672), 1],     // (-5223, 1747)
  [...walkCellRect(756, 909, 765, 928), 1],     // (-2326, 423)
  [...walkCellRect(1053, 384, 1072, 392), 1],   // (-8352, -3008)
  [...walkCellRect(659, 948, 671, 963), 1],     // (-1906, 1508)
  [...walkCellRect(540, 747, 550, 763), 1],     // (-4183, 2871)
  [...walkCellRect(760, 615, 766, 623), 1],     // (-5728, 395)
  [...walkCellRect(590, 604, 602, 621), 1],     // (-5802, 2292)
  [...walkCellRect(680, 1022, 702, 1036), 1],   // (-1071, 1213)
  [...walkCellRect(1206, 1102, 1215, 1110), 1], // (-196, -4689)
  // 第二批(约 250 格的圆:3D 里多是被删掉的灌木 / 野花 / 一棵手绘图里没画出来的树)
  [...walkCellRect(348, 1064, 363, 1085), 1],   // (-554, 5024)
  [...walkCellRect(412, 906, 426, 926), 1],     // (-2354, 4303)
  [...walkCellRect(457, 826, 471, 847), 1],     // (-3257, 3791)
  [...walkCellRect(491, 884, 505, 905), 1],     // (-2599, 3405)
  [...walkCellRect(513, 772, 528, 793), 1],     // (-3871, 3150)
  [...walkCellRect(660, 1531, 676, 1552), 1],   // (4751, 1474) 3D 里的树,手绘图没画
  [...walkCellRect(680, 629, 694, 650), 1],     // (-5495, 1258)
  [...walkCellRect(687, 937, 702, 958), 1],     // (-1997, 1173)
  [...walkCellRect(743, 814, 757, 835), 1],     // (-3394, 542)
  [...walkCellRect(756, 682, 770, 702), 1],     // (-4899, 395)
  [...walkCellRect(827, 332, 841, 353), 1],     // (-8869, -412)
  [...walkCellRect(830, 640, 844, 661), 1],     // (-5370, -446)
  [...walkCellRect(850, 527, 864, 547), 1],     // (-6660, -673)
  [...walkCellRect(856, 780, 870, 799), 1],     // (-3791, -741)
  [...walkCellRect(858, 199, 872, 218), 1],     // (-10392, -764)
  [...walkCellRect(871, 447, 885, 468), 1],     // (-7563, -912) 一片野花
  [...walkCellRect(946, 488, 961, 510), 1],     // (-7091, -1769)
  [...walkCellRect(1082, 389, 1097, 410), 1],   // (-8222, -3314)
];

/**
 * 11-24 整图体检:上城挡土墙上画着的两段台阶(广场旁、公会旁)在自动生成的栅格里是断的(最上几级 + 台阶顶被判成挡),
 * 从下城去上城只能绕到最东头的坡道(公会→学院实走 49 秒、绕 4.7 倍)。按 3D 高度图找出台阶范围、手描「看得见的台阶」
 * 多边形(避开前面房子的屋顶 / 烟囱和两侧栏墙)打通,台阶顶接到上城。栅格坐标 [行, 起列, 止列, 1](tools/qa/city_walk_audit.py 也读)。
 */
const WALK_RUNS: Array<[number, number, number, number]> = [
  [757, 1010, 1011, 1], [758, 1009, 1012, 1], [759, 1007, 1012, 1], [760, 1006, 1013, 1], [761, 1007, 1013, 1], [762, 1007, 1015, 1],
  [763, 1005, 1016, 1], [764, 1004, 1017, 1], [765, 1003, 1019, 1], [766, 1001, 1020, 1], [767, 1000, 1022, 1], [768, 998, 1023, 1],
  [769, 997, 1011, 1], [769, 1014, 1024, 1], [770, 995, 1009, 1], [770, 1015, 1026, 1], [771, 994, 1008, 1], [771, 1017, 1027, 1],
  [772, 993, 1006, 1], [772, 1018, 1028, 1], [773, 991, 1005, 1], [773, 1019, 1030, 1], [774, 990, 1004, 1], [774, 1021, 1031, 1],
  [775, 988, 1002, 1], [775, 1022, 1032, 1], [776, 987, 1001, 1], [776, 1024, 1034, 1], [777, 986, 999, 1], [777, 1025, 1035, 1],
  [778, 984, 998, 1], [778, 1027, 1037, 1], [779, 983, 997, 1], [779, 1028, 1038, 1], [780, 981, 995, 1], [780, 1029, 1039, 1],
  [781, 980, 994, 1], [781, 1031, 1041, 1], [782, 978, 992, 1], [782, 1032, 1042, 1], [783, 977, 991, 1], [783, 1034, 1043, 1],
  [784, 976, 989, 1], [784, 1035, 1045, 1], [785, 974, 988, 1], [785, 1036, 1046, 1], [786, 973, 987, 1], [786, 1038, 1047, 1],
  [787, 971, 985, 1], [787, 1039, 1049, 1], [788, 970, 984, 1], [788, 1041, 1042, 1], [788, 1045, 1050, 1], [789, 969, 982, 1],
  [789, 1046, 1052, 1], [790, 967, 981, 1], [790, 1048, 1053, 1], [791, 966, 980, 1], [791, 1049, 1054, 1], [792, 964, 978, 1],
  [792, 1051, 1055, 1], [793, 963, 977, 1], [793, 1052, 1054, 1], [794, 962, 975, 1], [794, 1053, 1053, 1], [795, 960, 974, 1],
  [796, 959, 973, 1], [797, 957, 971, 1], [798, 956, 970, 1], [799, 954, 968, 1], [800, 953, 967, 1], [801, 952, 965, 1],
  [802, 952, 964, 1], [803, 952, 963, 1], [804, 954, 961, 1], [805, 957, 960, 1], [884, 806, 806, 1], [885, 806, 808, 1],
  [886, 806, 809, 1], [886, 812, 816, 1], [887, 806, 817, 1], [888, 806, 818, 1], [889, 806, 819, 1], [890, 806, 820, 1],
  [891, 806, 821, 1], [892, 806, 822, 1], [893, 806, 823, 1], [894, 806, 823, 1], [895, 806, 822, 1], [896, 806, 823, 1],
  [897, 806, 825, 1], [898, 806, 826, 1], [899, 806, 828, 1], [900, 806, 829, 1], [901, 806, 830, 1], [902, 806, 806, 1],
  [902, 809, 832, 1], [903, 811, 833, 1], [904, 812, 834, 1], [905, 814, 835, 1], [906, 815, 836, 1], [907, 817, 837, 1],
  [908, 818, 838, 1], [909, 819, 839, 1], [910, 821, 840, 1], [911, 822, 841, 1], [912, 824, 842, 1], [913, 825, 843, 1],
  [914, 826, 844, 1], [915, 828, 845, 1], [916, 829, 829, 1], [916, 834, 846, 1], [917, 835, 846, 1], [918, 836, 845, 1],
  [919, 838, 845, 1], [920, 839, 845, 1], [921, 841, 844, 1], [922, 842, 843, 1],
];

const SCENE: WorldSceneDef = {
  // 不用遮挡条(遮挡靠逐像素比深度),底图块 / 遮罩都空着
  tiles: { base: [], masks: [], cols: 1, tileW: D.chunk, tileH: D.chunk, pad: [0, 0] },
  px: [IW, IH],
  unit: U,
  strips: [],
  walk: { cell: D.walk.cell, cols: D.walk.cols, rows: D.walk.rows as unknown as string[] },
  walkPatches: PRE25_PAINTED ? WALK_PATCHES : undefined,
  walkRuns: PRE25_PAINTED ? WALK_RUNS : undefined,
  dot: 'ui/world/citymoon/fx_dot/spriteFrame',
  // 手绘版是白天:不要灯晕、不要夜里的冷雾
  glows: PRE25_PAINTED ? [] : GLOWS,
  flames: [],
  smokes: [],
  mist: PRE25_PAINTED ? undefined : { tint: [150, 176, 220], alpha: 14 },
  walkers: [],
  idlers: [],
};

const SPAWN = pre25Ground(-14, 0);
const WAYPOINT = pre25Ground(-2.5, 1.8);

export const CITY_PRE25: WorldMapDef = {
  code: 'CITY',
  name: '主城',
  levelText: '',
  // 3D 版是月夜冷调;手绘版白天不给人物染色
  actorTint: PRE25_PAINTED ? undefined : [214, 222, 246],
  // 手绘版:飘叶 + 镜头附近的云影 + 浮尘 + 近景树冠(LobbyTownAmbient 的加强层,月夜主城同款),画面不是一张静止的画
  ambient: PRE25_PAINTED,
  ambientDepth: PRE25_PAINTED,
  // 视角 D(地图每米 120 像素、一个地图像素 1.42 世界单位):1080 高的电脑屏上一个地图像素约 1 个屏幕像素,和用户挑的样图一样近。
  // 手绘版换回 2D 队伍,镜头和野外一样(1.4):人物和野外一样大,一屏看到的城也多一些
  cameraZoom: PRE25_PAINTED ? 1.4 : 1.7,
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
    // 11-24:原点位(-66, -50)在池塘正中,点地图寻路只能停在岸边 → 挪到池塘南岸的草地上
    { name: '王都花园', ...(PRE25_PAINTED ? pre25Ground(-71, -45) : pre25Ground(-66, -50)), icon: 'place' },
    { name: '主桥', ...pre25Ground(-36, 40), icon: 'place' },
    { name: '港口', ...pre25Ground(60, 96), icon: 'place' },
    { name: '东门', ...pre25Ground(114, 6), icon: 'place' },
    { name: '西南门', ...pre25Ground(-64, 78), icon: 'place' },
  ],
  camps: [],
  // 主城 v4:西南门 → 村外林地(主轴起点),东门 → 灰岩荒原;出口圈在门洞里面一点
  exits: [
    // 11-24 手绘版:圈心挪到南门打通的通道中间(原 -65, 79 在门楼屋顶那块、只能绕墙根进去),判定放大到盖住整条通道(约 400 宽),
    // 从广场任意位置往下推摇杆都会出城;林地回来的落点(fromWoods)离圈心约 360,不会一落地又被弹出去
    { key: 'to_woods', label: '前往 · 村外林地', ...(PRE25_PAINTED ? pre25Ground(-63.166, 79.191) : pre25Ground(-65, 79)), radius: 140,
      triggerRadius: PRE25_PAINTED ? 210 : undefined, toMap: 'WOODS', toSpawn: { x: 8250, y: 788 } },
    { key: 'to_gray', label: '前往 · 灰岩荒原', ...pre25Ground(114, 6), radius: 140, toMap: 'GRAY', toSpawn: { x: -8560, y: -190 } },
  ],
  scene: SCENE,
  minimapArt: PRE25_PAINTED ? `${PAINT_DIR}/overview/spriteFrame` : `${DIR}/overview/spriteFrame`,
};

/** 别的地图通往主城的落点(出口圈里面一点)。 */
export const CITY_PRE25_ENTRY = {
  fromWoods: pre25Ground(-61, 74),
  fromGray: pre25Ground(108, 6),
};
