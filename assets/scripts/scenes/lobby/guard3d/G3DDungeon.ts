import { BlockInputEvents, Camera, Canvas, Color, DirectionalLight, director, Director, game, ImageAsset, instantiate, js, KeyCode, Layers, Material, Mesh, MeshRenderer, Node, PointLight, Prefab, Quat, renderer, resources, SpotLight, sys, UITransform, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { sfx } from './G3DAudio';
import { charKeys, G3DChar, hasChar, hasMoves, loadChar } from './G3DChar';
import { floorPbr, FloorPlan, masonryPbr, paintGlow, paintGrime, paintRunes } from './G3DDungeonTex';
import { barkPbr, canvasPbr, endGrainPbr, ironPbr, Pbr, rockPbr, woodPbr } from './G3DFieldTex';
import { FxWorld } from './G3DFx';
import { applyPose, BLADE_LEN, BLADE_ROOT, BladeTrail, buildSword, COMBO, GS_COMBO, GS_RUN, GS_SKILLS, GS_STAND, Move, MoveHit, newPose, placeSword, poseAt, rootAt, SKILLS } from './G3DHeroMoves';
import { addMesh, DynMesh, loadKit, material, tex } from './G3DKit';
import { MeshBatch, Tint } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import { buildEnvCube, FX_CELL, paintCloth, paintShaft } from './G3DSkins';
import { buildSkyCube } from './G3DSky';
import { applyCityFullGround, extendCityFull, FULL_SKIP } from './G3DCityFull';
import { applyCityV4Ground, extendCityV4, V4_UPPER_H, v4GroundTint, v4LawnField, v4OffUpper } from './G3DCityV4';
import { buildCityScene, CITY, CITY_GROUND, CITY_MOON, CITY_MOON_SKY, CITY_PLAN, CITY_TERRACE, CITY_V4, cityFloorY } from './G3DCity';
import { paintMoon, paintSkyline, paintWindow, plasterPbr, rubblePbr, plazaLeaves, plazaPbr, plazaTint, StoneTile, stoneTileMaps, slatePbr, lawnTileMaps, canvasMeanRGB } from './G3DCityTex';
import { buildWildScene, skirtPoint, WILD_GROUND, WILD_MOON, WILD_PLAN } from './G3DWild';
import { mudPbr, paintTreeline, wetAt } from './G3DWildTex';
import { mulberry32 } from './G3DTextures';
import { FieldPost, loadPost, POST_CFG, PostCfg } from './TownPost3D';

/**
 * 地宫小样(实验,2026-11-17;预览地址带 ?g3ddungeon=1 才启用,不带参数完全不加载场景)。
 *
 * 由来:野外自由视角和参考的那个 FPS(github.com/wquguru/fable52-fps-repro)并排一比差距很大 ——
 * 主要差在灯(它暗房间里十来盏彩色灯)、地面(湿地面有倒影)、同一个镜头里混着几种做法、题材(封闭室内硬表面)。
 * 用户选了「做地宫小样」:挑一间封闭的房间,整间按它的做法做,看在我们的引擎里能做到什么程度。只借鉴做法,代码全是自己写的。
 *
 * 这一间里有什么:
 * - 房间:24 × 12 米、高 6 米的石砌大厅,六根柱子、横梁、壁龛、西头的铁栅门、东头的石台、南墙一条侧廊;
 *   天花板上开一个天井,月光从铁栅里斜着照下来(唯一带投影的灯)。全部由代码拼的硬表面,不放任何纸片 / 手绘图。
 * - 材质:砌石墙、整间房的石板地(积水、嵌铜环)、岩石、铁、木头,全部由代码生成(G3DDungeonTex / G3DFieldTex)。
 * - 灯:月光 + 四盏冷色水晶壁灯 + 两个火盆 + 铁门后的红光 + 符文石板的绿光 + 侧廊的火把,加起来十盏;发光的灯芯、火、符文会泛光。
 * - 地面:积水的地方有实时倒影(引擎自带的平面反射,把场景对着地面镜像再画一遍)。
 * - 后期:沿用野外那套(高动态 + 环境光遮蔽 + 泛光 + 调色 + 暗角 + 按深度的雾)。
 * - 角色:AI 图转 3D 的主角和怪(模型不在仓库里,验证时临时拷进 assets/resources/g3d_char);没有模型时房间照样能看。
 *   主角 WASD 走、鼠标右键拖动转镜头、滚轮缩放、J 或鼠标左键出手;怪走近了会围上来,砍几下倒地,过一会儿重生。
 *
 * 只是样板:不接战斗数值、不登录、不改任何现有文件。调试接口 window.__g3dd。
 */

// ───────────────────────── 房间的尺寸 ─────────────────────────
// 可走的范围。地宫和野外是 24 × 12 米;主城的广场 40 × 28 米(开场景前由 setArea 换掉)。
let X0 = -12;
let X1 = 12;
let Z0 = -6;
let Z1 = 6;
function setArea(a: { X0: number; X1: number; Z0: number; Z1: number }): void {
  X0 = a.X0;
  X1 = a.X1;
  Z0 = a.Z0;
  Z1 = a.Z1;
}
const H = 6;                       // 天花板的高度
const ROOF = H + 1.6;              // 屋顶上表面(只为了挡月光:投影只认朝着光的那一面)
const PILLAR_X = [-6, 0, 6];
const PILLAR_Z = [-3.1, 3.1];
const RING = { x: -3, z: 0, r: 2.1 };
const MOON_DIR = new Vec3(0.2, -1, 0.1).normalize();
// 天井开在哪:让月光正好落在铜环上
const OC = { x: RING.x - (MOON_DIR.x / -MOON_DIR.y) * (H + 0.8), z: RING.z - (MOON_DIR.z / -MOON_DIR.y) * (H + 0.8), half: 1.25 };
const GATE = { half: 1.6, h: 3.9, depth: 2.6 };          // 西墙的铁栅门
const HALL = { x: 3, half: 1.15, h: 3.1, depth: 4.2 };   // 南墙的侧廊
const ALCOVES_N = [-9, -3, 3];                            // 北墙的壁龛
const ALCOVES_S = [-9, -3];
const ALCOVE = { half: 1.25, h: 3.3, depth: 0.85 };
const DAIS = { x: 8.4, h: 0.36 };
const BRAZIERS = [{ x: 7.6, z: -3.6 }, { x: 7.6, z: 3.6 }];
const LAMPS = [                                            // 水晶壁灯:贴在墙上的位置和朝向(nz = 墙朝房间里的方向)
  { x: -6, z: Z0, nz: 1 }, { x: 6, z: Z0, nz: 1 }, { x: 0, z: Z1, nz: -1 }, { x: -9, z: Z1, nz: -1 },
];
const UV_WALL = 0.25;              // 砌石墙:一张贴图 4 米
const UV_ROCK = 0.7;
const UV_WOOD = 0.9;
const UV_IRON = 1.6;
const GROUND_LAYER = 1 << 2;       // 地面:倒影相机不看(地面自己在采样倒影图)
const BAYS = 4;

export interface DungeonCfg {
  /** 月光 / 环境光的照度;点光的强度 × fluxK = 光通量。都是对着画面校的。 */
  moon: number;
  ambient: number;
  fluxK: number;
  lamp: number;
  /** 壁灯往下打的那一束(聚光):在地上打出一片亮区。聚光要的数比点光大二三十倍。 */
  lampSpot: number;
  /**
   * 这一束带不带投影(角色和柱子在灯下有影子)。默认不带:引擎里带投影的聚光是分多趟画的,
   * 实测开了之后半透明 / 叠加色的东西(火苗、光晕、光柱、光锥)整个不画。留着开关(地址 &dspot=1)以后再查。
   */
  spotShadow: boolean;
  brazier: number;
  gate: number;
  rune: number;
  torch: number;
  /** 每座烛台一盏很弱的暖色点光(烛火本身只是发光的片,照不亮东西)。 */
  candle: number;
  /** 技能 / 出手时临时亮一下的灯。 */
  hit: number;
  shadow: number;
  /** 地面贴图的宽(高 = 一半)。 */
  floor: number;
  reflect: boolean;
  wet: number;
  /** 石板地整体有多湿:粗糙度乘这个数(1 = 只有水洼反光,越小整片地面越像刚泼过水)。 */
  gloss: number;
  /** 石板地法线的强度(越小石面越平,倒影越清楚)。 */
  floorBump: number;
  /** 壁灯下面那片光锥的亮度。 */
  cone: number;
  /** 画质档:pc / mid / phone(见 TIERS)。 */
  tier: string;
  /** 同时最多几处真灯(一盏壁灯算一处);离主角远的换成贴在地上 / 墙上的假光斑。 */
  realLights: number;
  /** 假光斑的亮度倍数。 */
  fake: number;
  /** 后期的内部分辨率倍数(0 = 用档位自带的)、要不要遮蔽、泛光几级。 */
  postScale: number;
  /** 后期离屏渲染最多多少像素(超出就把放大倍数往下压);核显 / 高分屏上不再超采样。0 = 不限。 */
  pixBudget: number;
  /** 跑起来以后帧率持续偏低就自动降一级(渲染分辨率 → 倒影 → 灯数);截图 / 录屏(逐帧推)时不动。 */
  autoQ: boolean;
  /** 建筑模型投不投月光阴影(核显档关:阴影那一遍要把建筑整栋再画一次,约 370 万面;角色照样投)。 */
  bldShadow: boolean;
  /** 平均帧率低于多少算「偏低」(地址 &autoqfps=,自验时调高它来逼出降级流程)。 */
  autoQFps: number;
  ao: boolean;
  bloomLevels: number;
  /** 墙 / 石头 / 木头贴图的尺寸倍数、最多放几只怪、烛台点不点真灯、点光照射范围的倍数。 */
  texK: number;
  maxMobs: number;
  candleReal: boolean;
  rangeK: number;
  /** 左上角显示一行帧率。 */
  hud: boolean;
  /**
   * 烘焙灯光(手机档):固定的灯照在场景上的漫反射,建场景时逐顶点算好乘进顶点颜色,运行时只靠一份均匀的环境光把它「显」出来。
   * bakeAmb = 那份环境光的照度(只是个载体);bakeGain = 点光的光通量换算到环境光照度要乘多少(引擎里两者的量级差着几百倍,
   * 500 是对着电脑档同机位的画面校出来的);realK = 开着烘焙时真灯的亮度打几折(烘焙里已经算过一遍了);bakeEdge = 大面细分到多细(米)。
   */
  bake: boolean;
  bakeAmb: number;
  bakeGain: number;
  /**
   * 地面的假倒影高光(不画倒影的档位用):每盏灯在湿地面上该出现倒影的地方贴一条朝镜头拉长的叠加色光斑。0 = 不要。
   * 不是真倒影:只有灯,照不出柱子和人;也不管地上哪块干哪块湿。
   * **默认各档都不开**(地址 &dglint=1 才开):做出来看是一颗颗浮在地上的发光椭圆,不像倒影,比不加还假。留着代码只为以后换做法时对照。
   */
  glint: number;
  /** 动作库那套招式整体再快 / 慢几倍(1 = 招式表里写的速度;地址 &dpace=1.2)。 */
  pace: number;
  /** 声音开不开(地址 &dsnd=0 关)、总音量(&dvol=0.5)。全是代码现场合成的,见 G3DAudio。 */
  snd: boolean;
  vol: number;
  /** 哪个场景:hall = 地宫大厅;wild = 野外(枯木林里的废弃营地,地址 ?g3dwild=1);city = 主城中心广场(?g3dcity=1)。 */
  scene: 'hall' | 'wild' | 'city';
  /** 主城里哪些建筑换成「图转 3D」的模型(逗号隔开的键,地址 &bld=smithy);空 = 全用代码拼的。模型临时拷在 resources/g3d_bld/<键>/。 */
  bld: string;
  /** 整城(预渲染第 1 期,&cityfull=1):中心广场外面接上整座城(G3DCityFull)。 */
  cityFull: boolean;
  /** 建筑模型的窗(颜色贴图里暖黄发亮的地方)自己发光的强度;0 = 不发光。地址 &bglow=。 */
  bldGlow: number;
  /** 石板地面(&bld=…,ground):一块贴图铺多少米、颜色乘多少、高光强度(越大倒影越亮,迎着月光也越亮)。地址 &pavem= &pavek= &pavespec=。 */
  paveM: number;
  paveK: number;
  paveSpec: number;
  /** 石板地面用细节版(贴图按原始精度平铺,近看不糊);地址 &pavefine=0 关掉,回到整张地面一张图的做法。 */
  paveFine: boolean;
  /** 主城天空(连云)的亮度倍数;地址 &csky=。第十一轮:原型的天空大约亮一倍。 */
  citySky: number;
  /** 野外:天空那张图整体乘几倍(这套灯光是高动态的,天空要够亮才看得见);雾的浓度;地面薄雾 / 萤火虫的多少。 */
  skyK: number;
  /** 主城:天上那个月亮盘的亮度倍数(它也会被雾吃掉大半,所以给得高)。 */
  moonDisc: number;
  wildFog: number;
  mist: number;
  flies: number;
  /** 烘焙时算不算实心东西(柱子、石棺、火盆、木箱)对灯的遮挡。 */
  bakeShadow: boolean;
  /** 烘焙时环境反射图里那几团灯光加亮几倍(湿地面、铁器靠它出高光;手机档不画倒影,全靠这个)。 */
  bakeEnv: number;
  realK: number;
  bakeEdge: number;
  post: number;
  env: number;
  shaft: number;
  glow: number;
  /** 跟着主角的一盏很弱的补光(镜头这一侧、头顶偏后):没有它,站在两盏灯之间的角色是一团黑。 */
  fill: number;
  /** 月光落在地上之后往四周弹的那点光(一盏放在光斑上方的冷色点光)。 */
  bounce: number;
}
export const DUNGEON: DungeonCfg = {
  moon: 1300000, ambient: 42, fluxK: 100, lamp: 11, lampSpot: 420, spotShadow: false, brazier: 17, gate: 17, rune: 9, torch: 14, candle: 3.2, hit: 9,
  shadow: 4096, floor: 4096, reflect: true, wet: 0.74, gloss: 0.3, floorBump: 0.55, post: 2, env: 1, shaft: 0.16, cone: 0.05, glow: 1, fill: 0.8, bounce: 8,
  tier: 'pc', realLights: 99, fake: 1, postScale: 0, pixBudget: 4200000, autoQ: true, bldShadow: true, autoQFps: 42, ao: true, bloomLevels: 6, texK: 1, maxMobs: 8, candleReal: true, rangeK: 1, hud: false,
  bake: false, bakeAmb: 50000, bakeGain: 1700, realK: 0.6, bakeEdge: 0.8, bakeEnv: 7, glint: 0, bakeShadow: true, pace: 1, snd: true, vol: 0.8, scene: 'hall', bld: '', cityFull: false, bldGlow: 1.4, paveFine: true, citySky: 5.6, paveM: 2.4, paveK: 0.84, paveSpec: 0.3, skyK: 4200, moonDisc: 3.2, wildFog: 0.045, mist: 1, flies: 1,
};
/**
 * 画质档。电脑档 = 全开(21 盏灯都是真的)。
 * 中档:最近 7 处真灯,原尺寸渲染 + 边缘抗锯齿,烛台不点真灯。
 * 手机档:固定的灯烘进顶点颜色,只留最近 2 处真灯(打六折,主要给高光和凹凸);不做倒影和遮蔽,内部分辨率 0.8,投影图 / 贴图减小,最多 5 只怪。
 */
/** 野外场景在默认值上改的几项(月光是直接照下来的,不像地宫只从天井漏一束;泥地比石板糙)。 */
export const WILD_CFG: Partial<DungeonCfg> = { moon: 400000, ambient: 150, brazier: 24, torch: 15, fill: 0.5, hit: 3, gloss: 1.0, floorBump: 1.0, shaft: 0, bake: false };

/** 主城场景在默认值上改的几项(不放怪;月光比野外略暗一点,靠路灯和窗子的暖光点缀)。 */
/** 建筑模型的手调修正:转多少度(模型的正面朝哪是平台定的)、在「缩放到占地宽」的基础上再乘多少、挪多少米。 */
const BLD_FIX: Record<string, { yaw: number; k: number; dx: number; dy: number; dz: number; a?: number; sx?: number; sy?: number; wf?: number; spec?: number; glow?: number; tone?: [number, number, number]; ab?: [number, number, number]; metal?: number }> = {
  smithy: { yaw: 180, k: 1, dx: 0, dy: 0, dz: 0, a: 0.8, ab: [0.6, 0.62, 0.7], metal: 0.2 },          // 第十二轮:原型的铁匠铺是深灰石墙 + 黑木 (53,49,50),我们是米黄 (122,98,78) → 压暗一半、偏冷          // 平台给的模型正面朝后:转 180° 炉口和门才朝广场
  cathedral: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, a: 0.48, wf: 1.14, spec: 0.25, ab: [0.84, 0.88, 0.98] },          // 第十轮:比原型窄 → 正面加宽 14%;石头棱角发白 → 高光压到 0.25          // 模型的长轴是中殿,正面在一头:转 -90°;石头是浅灰的,月光下发白(0.72 还是白),颜色压到 0.48
  house: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.66, 0.68, 0.75], metal: 0.2 },          // 带门的那面在侧边:转 -90°
  // 第二批(挪到广场空地上转四个方向截图定的):平台给的正面多数朝 +x(要转 -90°),转角房朝 -z(转 180°),摊位 / 水井 / 路灯不用转
  house_b: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.66, 0.68, 0.75], metal: 0.2 },
  house_c: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.66, 0.68, 0.75], metal: 0.2 },
  house_d: { yaw: 180, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.66, 0.68, 0.75], metal: 0.2 },
  // ↑ metal 0.2(11-18):铁匠铺和四种民房换成平台减面重拓扑的低模(2~1.5 万面),重烘的金属度贴图平均 16%(原模型 3%),墙面被当成半金属、受灯光偏暗 → 压回去
  stall: { yaw: 0, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.74, 0.74, 0.78] },
  well: { yaw: 0, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.72, 0.74, 0.8] },
  lamp: { yaw: 0, k: 1, dx: 0, dy: 0, dz: 0, sx: 0.6, glow: 0.75, tone: [1, 0.93, 0.82], ab: [0.3, 0.3, 0.32], metal: 0.35 },          // 第十二轮:原型是细黑铁杆,我们是银亮金属 → 颜色压暗、金属感减到 0.35          // 平台给的路灯偏粗壮(原型是细长的铁灯柱):横向收到 0.6;灯罩偏橙 → 发光弱一点、颜色往暖白拉
  statue: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, a: 0.6, ab: [0.86, 0.9, 1.0] },
  // 整城第 1 期新转的十样(11-19,G3DCityFull):平台给的正面同样朝 +x → 转 -90°;码头的栈桥长边在 x 上,不转。贴图比设定图浅 → 先按民房压暗
  academy: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.6, 0.62, 0.68] },
  guild: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.64, 0.66, 0.72] },
  tavern: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.64, 0.66, 0.72] },
  stable: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.62, 0.62, 0.66] },
  barracks: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.6, 0.62, 0.68] },
  gate: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.6, 0.62, 0.68] },
  wall: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.58, 0.6, 0.66] },
  wall_tower: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.58, 0.6, 0.66] },
  bridge: { yaw: -90, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.6, 0.62, 0.68] },
  dock: { yaw: 0, k: 1, dx: 0, dy: 0, dz: 0, ab: [0.62, 0.6, 0.6] },
};
export const CITY_CFG: Partial<DungeonCfg> = { moon: 340000, ambient: 6300, brazier: 24, torch: 34, candle: 11, fill: 0.5, hit: 3, gloss: 1.0, floorBump: 0.72, shaft: 0, bake: false, maxMobs: 0, mist: 0.5, flies: 0 };

export const TIERS: Record<string, Partial<DungeonCfg>> = {
  pc: {},
  mid: { realLights: 7, post: 1, shadow: 2048, candleReal: false },      // 中档还画着真倒影,不用假高光
  // 电脑上的核显(Intel Iris / Arc 1xxV、AMD Radeon Graphics):画质照电脑档,只是不超采样(像素预算 200 万)、逐像素的灯少几盏
  igpu: { realLights: 3, post: 2, pixBudget: 1600000, shadow: 2048, candleReal: false, reflect: false, bldShadow: false },          // 第十五轮:核显上卡的是几何 —— 倒影默认关(整个场景要多画一遍)、灯 3 盏
  phone: { realLights: 2, post: 1, postScale: 0.8, ao: false, bloomLevels: 4, shadow: 1024, reflect: false, floor: 2048, texK: 0.5, maxMobs: 5, candleReal: false, rangeK: 0.9,
    bake: true, fake: 0, fill: 0.5, moon: 4200000 },
};
const TIER_NAME: Record<string, string> = { pc: '电脑档', mid: '中档', phone: '手机档', igpu: '核显档' };

interface Mob {
  c: G3DChar; home: Vec3; x: number; z: number; yaw: number; hp: number; maxHp: number; speed: number; reach: number; radius: number;
  state: 'idle' | 'chase' | 'bite' | 'down' | 'gone'; t: number; cool: number; wander: number; tx: number; tz: number;
}
/** 一盏受「远近切换」管的灯:kind = 配置里哪一项是它的亮度;fx = 属于哪一处灯位;amp / seed = 火光的抖动。 */
interface LightRec { L: PointLight | SpotLight; kind: string; fx: number; amp: number; seed: number }
/** 一处灯位:w = 真灯的权重(1 = 真灯全亮,0 = 只剩假光斑);fake = 假光斑(贴在地上 / 墙上的叠加色圆斑)。 */
interface Fixture { x: number; z: number; w: number; on: boolean; d: number; fake: Array<{ node: Node; mat: Material; k: number }> }
interface Pulse { light: PointLight; age: number; life: number; peak: number }

const _v = new Vec3();
const _q = new Quat();
const _q2v = new Vec3();
const _lead = new Vec3();
const _r0: [number, number] = [0, 0];
const _r1: [number, number] = [0, 0];
const _grip = new Vec3();
const _base = new Vec3();
const _tip = new Vec3();
const _tint = new Vec3();

/** 烘焙用的一盏灯:位置、颜色(线性)、光通量(流明)、照射范围;spot = 聚光的方向和半角的余弦(内 / 外)。 */
interface BakeLight { x: number; y: number; z: number; r: number; g: number; b: number; flux: number; range: number; spot?: { dx: number; dy: number; dz: number; c0: number; c1: number } }
const lin = (v: number): number => Math.pow(v / 255, 2.2);

/**
 * 把一批网格里边长超过 maxEdge 的三角形从长边的中点切开,反复切到都够短为止(顶点的各项属性取两端的平均)。
 * 「一条边切不切」只看它自己的长度,所以共用一条边的两个三角形切法一致,不会出缝。
 * 只为烘焙灯光用:原来一面墙就是两个大三角形,逐顶点的光没法过渡。
 */
function refine(batch: MeshBatch, maxEdge: number): void {
  const b = batch as unknown as { positions: number[]; normals: number[]; uvs: number[]; tangents: number[]; colors: number[]; indices: number[]; triangles: number };
  const P = b.positions;
  const N = b.normals;
  const U = b.uvs;
  const T = b.tangents;
  const C = b.colors;
  const max2 = maxEdge * maxEdge;
  const len2 = (i: number, j: number): number => (P[i * 3] - P[j * 3]) ** 2 + (P[i * 3 + 1] - P[j * 3 + 1]) ** 2 + (P[i * 3 + 2] - P[j * 3 + 2]) ** 2;
  for (let pass = 0; pass < 7; pass += 1) {
    const src = b.indices;
    const out: number[] = [];
    const mids = new Map<number, number>();
    let changed = false;
    const mid = (i: number, j: number): number => {
      const key = i < j ? i * 2000003 + j : j * 2000003 + i;
      const got = mids.get(key);
      if (got !== undefined) {
        return got;
      }
      const k = P.length / 3;
      for (let a = 0; a < 3; a += 1) {
        P.push((P[i * 3 + a] + P[j * 3 + a]) / 2);
      }
      let nx = N[i * 3] + N[j * 3];
      let ny = N[i * 3 + 1] + N[j * 3 + 1];
      let nz = N[i * 3 + 2] + N[j * 3 + 2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      N.push(nx, ny, nz);
      U.push((U[i * 2] + U[j * 2]) / 2, (U[i * 2 + 1] + U[j * 2 + 1]) / 2);
      let tx = T[i * 4] + T[j * 4];
      let ty = T[i * 4 + 1] + T[j * 4 + 1];
      let tz = T[i * 4 + 2] + T[j * 4 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      T.push(tx, ty, tz, T[i * 4 + 3]);
      for (let a = 0; a < 4; a += 1) {
        C.push((C[i * 4 + a] + C[j * 4 + a]) / 2);
      }
      mids.set(key, k);
      return k;
    };
    for (let t = 0; t < src.length; t += 3) {
      let a = src[t];
      let bb = src[t + 1];
      let c = src[t + 2];
      let fa = len2(a, bb) > max2;
      let fb = len2(bb, c) > max2;
      let fc = len2(c, a) > max2;
      const n = (fa ? 1 : 0) + (fb ? 1 : 0) + (fc ? 1 : 0);
      if (n === 0) {
        out.push(a, bb, c);
        continue;
      }
      changed = true;
      if (n === 3) {
        const mab = mid(a, bb);
        const mbc = mid(bb, c);
        const mca = mid(c, a);
        out.push(a, mab, mca, mab, bb, mbc, mca, mbc, c, mab, mbc, mca);
        continue;
      }
      // 把顶点轮换到「要切的边从 a-b 开始」:一条边 → 切 a-b;两条边 → 切 a-b 和 b-c
      for (let r = 0; r < 3 && !(n === 1 ? fa : fa && fb); r += 1) {
        const ta = a;
        a = bb;
        bb = c;
        c = ta;
        const tf = fa;
        fa = fb;
        fb = fc;
        fc = tf;
      }
      const mab = mid(a, bb);
      if (n === 1) {
        out.push(a, mab, c, mab, bb, c);
      } else {
        const mbc = mid(bb, c);
        out.push(mab, bb, mbc, a, mab, mbc, a, mbc, c);
      }
    }
    b.indices = out;
    b.triangles = out.length / 3;
    if (!changed) {
      break;
    }
  }
}

class Dungeon {
  world: Node | null = null;
  cam: Camera | null = null;
  moon: DirectionalLight | null = null;
  fx: FxWorld | null = null;
  post: FieldPost | null = null;
  opened = false;
  lastError = '';
  time = 0;
  /** > 0 时每帧固定走这么多秒(截图逐帧推用);frozen = 逻辑停住(只画)。 */
  fixedDt = 0;
  frozen = false;
  stats: Record<string, number> = {};
  // 镜头:绕着主角转(yaw / pitch 度、dist 米);free 给了就不跟主角,直接用这组位置和朝向(截图摆机位)
  view = { yaw: 62, pitch: 14, dist: 6.2, fov: 52 };
  free: { pos: Vec3; look: Vec3 } | null = null;
  private pull = 6.2;
  /** 镜头被挤近时额外抬高 / 往旁边绕开的角度(度)。 */
  private lift = 0;
  private swing = 0;
  private look = new Vec3(-6.5, 1.2, 1.6);
  // 主角
  leader: G3DChar | null = null;
  private lx = -7.2;
  private lz = 1.6;
  private lyaw = 0;
  /**
   * 正在出的这一招:move = 代码摆的招式(跃空重劈用片段,move 是空的);t = 出到第几秒;done = 每次判定做过没有;
   * yaw0 = 出手时面朝哪;adv = 已经往前挪了多少;hit = 这一招里已经打中过的怪(突进沿路每只只算一次)。
   */
  private act: { kind: string; move: Move | null; dur: number; t: number; done: boolean[]; yaw0: number; adv: number; advR: number; hit: Set<Mob>; fired: boolean } | null = null;
  /** 主角有没有动作库转套过来的那批招式(有 = 用片段出招、双手大剑;没有 = 代码摆的招式、单手长剑)。 */
  private gs = false;
  private swordLen = BLADE_LEN;
  private swordRoot = BLADE_ROOT;
  /** 剑尖这一帧往哪边走(世界方向;命中的火星顺着它飞)。 */
  private tipVel = new Vec3(0, 0, 1);
  private tipPrev = new Vec3();
  /** 调试:把主角定在某个片段的某一刻(逐帧看动作用)。 */
  dbgClip: { name: string; t: number } | null = null;
  private comboI = 0;
  private comboUntil = 0;
  private queued: string | null = null;
  /** 四个技能还要等几秒。 */
  cd: Record<string, number> = { dash: 0, whirl: 0, smash: 0, wave: 0 };
  private sword: Node | null = null;
  private swordLit: Material[] = [];
  private trail: BladeTrail | null = null;
  private aura: BladeTrail | null = null;
  private bladeDir = new Vec3(0.4, -0.85, 0.3);
  private bladeLead = new Vec3(0, 0, 1);
  private poseW = 0;
  private poseBuf = newPose();
  private leaderY = 0;
  private hitStop = 0;
  private shake = 0;
  private lastDt = 0;
  private realDt = 0;
  private waves: Array<{ x: number; z: number; dx: number; dz: number; age: number; life: number; hit: Set<Mob> }> = [];
  private waveMesh: DynMesh | null = null;
  private timers: Array<{ at: number; run: () => void }> = [];
  /** 这一招里每次判定的挥剑声放过没有;主角走了多远(攒够一步放一声脚步)。 */
  private swung: boolean[] = [];
  private stride = 0;
  /** 野外场景:提灯的位置。 */
  private wildLanterns: Array<{ x: number; y: number; z: number }> = [];
  private cityLamps: Array<{ x: number; y: number; z: number }> = [];
  private citySmoke = { x: 0, y: 0, z: 0 };
  private cityFireY = 0.98;
  /** 建筑模型的发光贴图:按源贴图缓存(同一个模型摆几栋只抠一次)。 */
  private glowCache = new Map<unknown, ReturnType<typeof tex>>();
  /** 天上的月亮(一块板):每帧跟着镜头挪,和天空图里那团月晕始终对齐。 */
  private moonDisc: Node | null = null;
  private cityBld: Record<string, { pivot: Node; spot: { key: string; id: string; x: number; z: number; yaw: number; w: number; d: number; y?: number; h?: number; front?: boolean; far?: boolean }; size: { x: number; y: number; z: number }; tris: number }> = {};
  /** 野外场景:这个位置是不是积水。 */
  private wildWet: ((x: number, z: number) => boolean) | null = null;
  private get wild(): boolean {
    return DUNGEON.scene === 'wild';
  }
  private get city(): boolean {
    return DUNGEON.scene === 'city';
  }
  /** 露天的场景(野外、主城):有天空,没有屋顶。 */
  private get outdoor(): boolean {
    return DUNGEON.scene !== 'hall';
  }
  /** 主城里站着的镇民。 */
  private npcs: G3DChar[] = [];
  private cityNpcSpots: Array<{ x: number; z: number; yaw: number }> = [];
  private bar: Record<string, HTMLDivElement> = {};
  private moving = false;
  mobs: Mob[] = [];
  private followers: Array<{ c: G3DChar; x: number; z: number; yaw: number; moving: boolean; ox: number; oz: number }> = [];
  private keys = new Set<number>();
  private saved: any = null;
  private probeNode: Node | null = null;
  private groundNodes: Node[] = [];
  private halos: Node[] = [];
  private recs: LightRec[] = [];
  private fixtures: Fixture[] = [];
  private stick = { x: 0, y: 0 };
  private ptrs = new Map<number, { kind: 'stick' | 'cam'; x: number; y: number; ox: number; oy: number; t: number; moved: number; touch: boolean }>();
  private hudEl: HTMLDivElement | null = null;
  /** 主角模型到了(或者确定载不到)没有:别的模型都排在它后面下载 —— 线上一起下的话,主角要等几十秒到几分钟,这段时间按键全都没反应。 */
  private heroSettled = false;
  private afterHero: Array<() => void> = [];
  /** 屏幕上方的载入进度(主角 / 建筑模型),全部到齐后自己消失。 */
  private loadEl: HTMLDivElement | null = null;
  private bldTotal = 0;
  private bldDone = 0;
  private fpsAcc = { t: 0, n: 0, last: 0, worst: 0 };
  fps = 0;
  /** 最近几秒里最慢的一帧折算成的帧数(卡不卡看它)。 */
  fpsLow = 0;
  private lows: number[] = [];
  private gpuName = '';
  private mobCount = 0;
  private bakeLights: BakeLight[] = [];
  private pulses: Pulse[] = [];
  private lights: Record<string, PointLight[]> = { lamp: [], brazier: [], gate: [], rune: [], torch: [], candle: [], hit: [], fill: [], bounce: [] };
  private shaftMat: Material | null = null;
  private floorMat: Material | null = null;
  private coneMat: Material | null = null;
  private glintMesh: DynMesh | null = null;
  /** 假倒影高光的光源:位置、颜色(0~1)、强弱、多宽。 */
  private glints: Array<{ x: number; y: number; z: number; r: number; g: number; b: number; k: number; w: number }> = [];
  private spots: SpotLight[] = [];
  private candles: Vec3[] = [];
  private solids: Array<{ x: number; z: number; hx: number; hz: number; h: number }> = [];
  private blocker: Node | null = null;
  private rnd = mulberry32(417);

  open(done?: () => void): void {
    loadKit(['g3d-standard', 'g3d-fxaa'], (missing) => {
      if (missing.indexOf('g3d-standard') >= 0) {
        this.lastError = `missing ${missing.join(',')}`;
        return;
      }
      loadPost(() => {
        try {
          if (!this.world) {
            this.build();
          }
          this.takeOver();
          this.opened = true;
          director.on(Director.EVENT_BEFORE_UPDATE, this.tick, this);
          director.on(Director.EVENT_AFTER_UPDATE, this.afterUpdate, this);
          this.bindInput();
          if (DUNGEON.snd) {
            sfx.volume = DUNGEON.vol;
            sfx.init(this.city ? 'town' : this.wild ? 'open' : 'hall');
          }
          done?.();
        } catch (error) {
          this.lastError = String((error as any)?.stack ?? error);
          console.warn('[g3dd] open failed', error);
        }
      });
    });
  }

  // ───────────────────────── 建场景 ─────────────────────────
  private build(): void {
    const t0 = performance.now();
    const scene = director.getScene()!;
    const world = new Node('G3DDungeon');
    scene.addChild(world);
    this.world = world;
    const rnd = mulberry32(91);
    if (this.wild) {
      this.buildWild(world, rnd, t0);
      return;
    }
    if (this.city) {
      this.buildCity(world, rnd, t0);
      return;
    }
    if (DUNGEON.bake) {
      this.collectBakeLights();
    }
    // 每种材质一批;按「开间」(沿长边切成四段)分块 —— 点光是「每盏灯把它照得到的网格重画一遍」,切了块一盏灯只重画附近那一段
    const wall = new Sculpt();     // 砌石:墙、柱、梁、天花
    const rock = new Sculpt();     // 整块的石头:石台、石棺、柱础、碎石
    const iron = new Sculpt();
    const wood = new Sculpt();
    const bronze = new Sculpt();
    const dark = new Sculpt();     // 洞口后面看不清的地方(门后、侧廊尽头)的深色石面
    const batches = [wall, rock, iron, wood, bronze, dark];
    const jobs: Array<{ bay: number; run: () => void }> = [];
    const bayOf = (x: number): number => Math.max(0, Math.min(BAYS - 1, Math.floor(((x - X0) / (X1 - X0)) * BAYS)));
    const at = (x: number, run: () => void): void => {
      jobs.push({ bay: bayOf(x), run });
    };
    const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
    const WALL_T: Tint = [0.86, 0.87, 0.9];
    const CEIL_T: Tint = [0.5, 0.5, 0.53];
    /** 一块竖直 / 水平的矩形面(四个角按任意顺序,hint = 朝外的方向);贴近地面的一圈压暗。 */
    const face = (b: MeshBatch, p: Vec3[], hint: Vec3, tint: Tint, den: number, ground?: number): void => b.poly(p, hint, tint, den, 0, 0, ground);
    const NX = V(1, 0, 0);
    const PX = V(-1, 0, 0);
    const NZ = V(0, 0, 1);
    const PZ = V(0, 0, -1);
    const UP = V(0, 1, 0);
    const DOWN = V(0, -1, 0);

    // ── 长边的两面墙:按开间切,壁龛 / 侧廊的洞口留出来 ──
    const longWall = (z: number, inward: Vec3, holes: Array<{ x: number; half: number; h: number }>): void => {
      for (let b = 0; b < BAYS; b += 1) {
        const xa = X0 + ((X1 - X0) * b) / BAYS;
        const xb = X0 + ((X1 - X0) * (b + 1)) / BAYS;
        at((xa + xb) / 2, () => {
          let cur = xa;
          const mine = holes.filter((h) => h.x > xa && h.x < xb).sort((p, q) => p.x - q.x);
          for (const h of mine) {
            face(wall, [V(cur, 0, z), V(h.x - h.half, 0, z), V(h.x - h.half, H, z), V(cur, H, z)], inward, WALL_T, UV_WALL, 0);
            face(wall, [V(h.x - h.half, h.h, z), V(h.x + h.half, h.h, z), V(h.x + h.half, H, z), V(h.x - h.half, H, z)], inward, WALL_T, UV_WALL);
            cur = h.x + h.half;
          }
          face(wall, [V(cur, 0, z), V(xb, 0, z), V(xb, H, z), V(cur, H, z)], inward, WALL_T, UV_WALL, 0);
        });
      }
    };
    const holesN = ALCOVES_N.map((x) => ({ x, half: ALCOVE.half, h: ALCOVE.h }));
    const holesS = [...ALCOVES_S.map((x) => ({ x, half: ALCOVE.half, h: ALCOVE.h })), { x: HALL.x, half: HALL.half, h: HALL.h }];
    longWall(Z0, NZ, holesN);
    longWall(Z1, PZ, holesS);
    /** 墙上凹进去的一格:两侧、顶、底、背面。back = 背面用哪批(深色的看不清,省得做细)。 */
    const recess = (x: number, half: number, h: number, depth: number, z: number, dir: number, back: MeshBatch, tint: Tint): void => {
      const zb = z - dir * depth;      // dir = 墙朝房间里的方向(+1 / -1),凹进去是反方向
      at(x, () => {
        face(wall, [V(x - half, 0, z), V(x - half, 0, zb), V(x - half, h, zb), V(x - half, h, z)], NX, tint, UV_WALL, 0);
        face(wall, [V(x + half, 0, z), V(x + half, 0, zb), V(x + half, h, zb), V(x + half, h, z)], PX, tint, UV_WALL, 0);
        face(wall, [V(x - half, h, z), V(x + half, h, z), V(x + half, h, zb), V(x - half, h, zb)], DOWN, tint, UV_WALL);
        face(back, [V(x - half, 0, zb), V(x + half, 0, zb), V(x + half, h, zb), V(x - half, h, zb)], V(0, 0, dir), tint, UV_WALL, 0);
        face(rock, [V(x - half, 0.002, z), V(x + half, 0.002, z), V(x + half, 0.002, zb), V(x - half, 0.002, zb)], UP, [0.5, 0.5, 0.52], UV_ROCK);
        // 洞口上沿一条挑出来的石楣
        rock.box(half * 2 + 0.5, 0.32, 0.3, V(x, h + 0.16, z + dir * 0.1), V(0, 0, 0), [0.8, 0.8, 0.83], UV_ROCK, rnd, 0.03);
      });
    };
    for (const x of ALCOVES_N) {
      recess(x, ALCOVE.half, ALCOVE.h, ALCOVE.depth, Z0, 1, wall, [0.62, 0.63, 0.66]);
    }
    for (const x of ALCOVES_S) {
      recess(x, ALCOVE.half, ALCOVE.h, ALCOVE.depth, Z1, -1, wall, [0.62, 0.63, 0.66]);
    }
    recess(HALL.x, HALL.half, HALL.h, HALL.depth, Z1, -1, dark, [0.7, 0.7, 0.72]);

    // ── 短边:西墙(中间一道铁栅门)和东墙 ──
    at(X0, () => {
      const g = GATE;
      face(wall, [V(X0, 0, Z0), V(X0, 0, -g.half), V(X0, H, -g.half), V(X0, H, Z0)], NX, WALL_T, UV_WALL, 0);
      face(wall, [V(X0, 0, g.half), V(X0, 0, Z1), V(X0, H, Z1), V(X0, H, g.half)], NX, WALL_T, UV_WALL, 0);
      face(wall, [V(X0, g.h, -g.half), V(X0, g.h, g.half), V(X0, H, g.half), V(X0, H, -g.half)], NX, WALL_T, UV_WALL);
      // 门洞里面:两侧、顶、地面、尽头
      const xb = X0 - g.depth;
      face(wall, [V(X0, 0, -g.half), V(xb, 0, -g.half), V(xb, g.h, -g.half), V(X0, g.h, -g.half)], NZ, [0.6, 0.6, 0.63], UV_WALL, 0);
      face(wall, [V(X0, 0, g.half), V(xb, 0, g.half), V(xb, g.h, g.half), V(X0, g.h, g.half)], PZ, [0.6, 0.6, 0.63], UV_WALL, 0);
      face(wall, [V(X0, g.h, -g.half), V(X0, g.h, g.half), V(xb, g.h, g.half), V(xb, g.h, -g.half)], DOWN, [0.5, 0.5, 0.52], UV_WALL);
      face(dark, [V(xb, 0, -g.half), V(xb, 0, g.half), V(xb, g.h, g.half), V(xb, g.h, -g.half)], NX, [0.6, 0.6, 0.62], UV_WALL, 0);
      face(rock, [V(X0, 0.002, -g.half), V(X0, 0.002, g.half), V(xb, 0.002, g.half), V(xb, 0.002, -g.half)], UP, [0.45, 0.45, 0.47], UV_ROCK);
      // 门框:两根门柱 + 门楣 + 楣上三块托石
      for (const s of [-1, 1]) {
        rock.box(0.5, g.h, 0.5, V(X0 + 0.22, g.h / 2, s * (g.half + 0.25)), V(0, 0, 0), [0.78, 0.78, 0.82], UV_ROCK, rnd, 0.04, 0);
        rock.box(0.62, 0.3, 0.62, V(X0 + 0.24, 0.15, s * (g.half + 0.25)), V(0, 0, 0), [0.7, 0.7, 0.74], UV_ROCK, rnd, 0.04, 0);
      }
      rock.box(0.6, 0.6, g.half * 2 + 1.3, V(X0 + 0.24, g.h + 0.3, 0), V(0, 0, 0), [0.8, 0.8, 0.84], UV_ROCK, rnd, 0.05);
      for (const s of [-1, 0, 1]) {
        rock.box(0.42, 0.34, 0.5, V(X0 + 0.36, g.h + 0.74, s * 1.25), V(0, 0, 0), [0.74, 0.74, 0.78], UV_ROCK, rnd, 0.04);
      }
      // 铁栅:竖条 + 三道横条(横条压在竖条前面),底下一排尖
      const gx = X0 - 0.2;
      for (let i = 0; i <= 11; i += 1) {
        const z = -g.half + 0.12 + (i * (g.half * 2 - 0.24)) / 11;
        iron.cylinder(0.034, 0.034, g.h - 0.1, 8, V(gx, (g.h - 0.1) / 2 + 0.1, z), V(0, 0, 0), [0.55, 0.55, 0.58], UV_IRON, rnd, undefined, false);
        iron.cylinder(0.0, 0.05, 0.16, 6, V(gx, 0.08, z), V(180, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, undefined, false);
      }
      for (const y of [0.55, 1.95, 3.35]) {
        iron.box(0.05, 0.11, g.half * 2, V(gx + 0.045, y, 0), V(0, 0, 0), [0.6, 0.6, 0.62], UV_IRON, rnd, 0.008);
      }
    });
    at(X1, () => {
      face(wall, [V(X1, 0, Z0), V(X1, 0, Z1), V(X1, H, Z1), V(X1, H, Z0)], PX, WALL_T, UV_WALL, 0);
    });

    // ── 天花板(天井那一格空着)、屋顶上表面(挡月光用)、天井的井壁和铁栅 ──
    const ceilQuad = (xa: number, xb: number, za: number, zb: number): void => {
      if (xb - xa < 0.01 || zb - za < 0.01) {
        return;
      }
      at((xa + xb) / 2, () => {
        face(wall, [V(xa, H, za), V(xb, H, za), V(xb, H, zb), V(xa, H, zb)], DOWN, CEIL_T, UV_WALL);
        face(dark, [V(xa, ROOF, za), V(xb, ROOF, za), V(xb, ROOF, zb), V(xa, ROOF, zb)], UP, [0.3, 0.3, 0.3], UV_WALL);
      });
    };
    for (let b = 0; b < BAYS; b += 1) {
      const xa = X0 + ((X1 - X0) * b) / BAYS;
      const xb = X0 + ((X1 - X0) * (b + 1)) / BAYS;
      const ha = OC.x - OC.half;
      const hb = OC.x + OC.half;
      if (hb <= xa || ha >= xb) {
        ceilQuad(xa, xb, Z0, Z1);
      } else {
        ceilQuad(xa, Math.max(xa, ha), Z0, Z1);
        ceilQuad(Math.min(xb, hb), xb, Z0, Z1);
        ceilQuad(Math.max(xa, ha), Math.min(xb, hb), Z0, OC.z - OC.half);
        ceilQuad(Math.max(xa, ha), Math.min(xb, hb), OC.z + OC.half, Z1);
      }
    }
    // 屋顶往外再接一圈(月光是斜的,别从墙头漏进来)
    at(0, () => {
      const m = 8;
      face(dark, [V(X0 - m, ROOF, Z0 - m), V(X1 + m, ROOF, Z0 - m), V(X1 + m, ROOF, Z0), V(X0 - m, ROOF, Z0)], UP, [0.3, 0.3, 0.3], UV_WALL);
      face(dark, [V(X0 - m, ROOF, Z1), V(X1 + m, ROOF, Z1), V(X1 + m, ROOF, Z1 + m), V(X0 - m, ROOF, Z1 + m)], UP, [0.3, 0.3, 0.3], UV_WALL);
      face(dark, [V(X0 - m, ROOF, Z0), V(X0, ROOF, Z0), V(X0, ROOF, Z1), V(X0 - m, ROOF, Z1)], UP, [0.3, 0.3, 0.3], UV_WALL);
      face(dark, [V(X1, ROOF, Z0), V(X1 + m, ROOF, Z0), V(X1 + m, ROOF, Z1), V(X1, ROOF, Z1)], UP, [0.3, 0.3, 0.3], UV_WALL);
    });
    at(OC.x, () => {
      const a = OC.x - OC.half;
      const b = OC.x + OC.half;
      const c = OC.z - OC.half;
      const d = OC.z + OC.half;
      const T: Tint = [0.74, 0.76, 0.82];
      face(wall, [V(a, H, c), V(a, H, d), V(a, ROOF, d), V(a, ROOF, c)], NX, T, UV_WALL);
      face(wall, [V(b, H, c), V(b, H, d), V(b, ROOF, d), V(b, ROOF, c)], PX, T, UV_WALL);
      face(wall, [V(a, H, c), V(b, H, c), V(b, ROOF, c), V(a, ROOF, c)], NZ, T, UV_WALL);
      face(wall, [V(a, H, d), V(b, H, d), V(b, ROOF, d), V(a, ROOF, d)], PZ, T, UV_WALL);
      // 井口一圈石框 + 铁栅(五横五竖)
      for (const s of [-1, 1]) {
        rock.box(OC.half * 2 + 0.7, 0.3, 0.36, V(OC.x, H - 0.13, OC.z + s * (OC.half + 0.17)), V(0, 0, 0), [0.66, 0.67, 0.72], UV_ROCK, rnd, 0.04);
        rock.box(0.36, 0.3, OC.half * 2, V(OC.x + s * (OC.half + 0.17), H - 0.13, OC.z), V(0, 0, 0), [0.66, 0.67, 0.72], UV_ROCK, rnd, 0.04);
      }
      for (let i = 0; i < 5; i += 1) {
        const o = -OC.half + ((i + 0.5) * OC.half * 2) / 5;
        iron.box(0.06, 0.06, OC.half * 2, V(OC.x + o, H + 0.5, OC.z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.006);
        iron.box(OC.half * 2, 0.06, 0.06, V(OC.x, H + 0.56, OC.z + o), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.006);
      }
    });

    // ── 柱子(柱础、柱身分三段、柱头)、墙上的壁柱、横梁和纵梁 ──
    for (const px of PILLAR_X) {
      for (const pz of PILLAR_Z) {
        at(px, () => {
          rock.box(1.3, 0.34, 1.3, V(px, 0.17, pz), V(0, 0, 0), [0.74, 0.74, 0.78], UV_ROCK, rnd, 0.05, 0);
          rock.box(1.08, 0.2, 1.08, V(px, 0.44, pz), V(0, 0, 0), [0.8, 0.8, 0.84], UV_ROCK, rnd, 0.05);
          const drums = [1.55, 1.6, 1.61];
          let y = 0.54;
          drums.forEach((dh, i) => {
            wall.box(0.86 - (i === 1 ? 0.03 : 0), dh - 0.02, 0.86 - (i === 1 ? 0.03 : 0), V(px, y + dh / 2, pz), V(0, 0, 0), [0.92, 0.93, 0.97], UV_WALL, rnd, 0.045);
            y += dh;
          });
          rock.box(1.04, 0.16, 1.04, V(px, y + 0.08, pz), V(0, 0, 0), [0.82, 0.82, 0.86], UV_ROCK, rnd, 0.04);
          rock.box(1.28, 0.3, 1.28, V(px, y + 0.31, pz), V(0, 0, 0), [0.76, 0.76, 0.8], UV_ROCK, rnd, 0.06);
          // 柱身上一道铁箍 + 铁环
          iron.box(0.93, 0.09, 0.93, V(px, 2.2, pz), V(0, 0, 0), [0.6, 0.6, 0.62], UV_IRON, rnd, 0.01);
        });
        this.solids.push({ x: px, z: pz, hx: 0.66, hz: 0.66, h: H });
      }
      for (const [z, s] of [[Z0, 1], [Z1, -1]] as Array<[number, number]>) {
        at(px, () => {
          wall.box(1.0, H - 0.5, 0.42, V(px, (H - 0.5) / 2, z + s * 0.2), V(0, 0, 0), [0.9, 0.91, 0.95], UV_WALL, rnd, 0.04, 0);
          rock.box(1.2, 0.36, 0.56, V(px, 0.18, z + s * 0.26), V(0, 0, 0), [0.72, 0.72, 0.76], UV_ROCK, rnd, 0.05, 0);
        });
      }
      // 横梁:从北墙到南墙,压在柱头上
      at(px, () => {
        wall.box(0.78, 0.56, Z1 - Z0, V(px, H - 0.28, 0), V(0, 0, 0), [0.7, 0.71, 0.75], UV_WALL, rnd, 0.05);
      });
    }
    for (const pz of PILLAR_Z) {
      for (let b = 0; b < BAYS; b += 1) {
        const xa = X0 + ((X1 - X0) * b) / BAYS;
        const xb = X0 + ((X1 - X0) * (b + 1)) / BAYS;
        at((xa + xb) / 2, () => {
          wall.box(xb - xa, 0.44, 0.6, V((xa + xb) / 2, H - 0.22, pz), V(0, 0, 0), [0.66, 0.67, 0.71], UV_WALL, rnd, 0.05);
        });
      }
    }

    // ── 东头的石台:两级台阶,台上一口石棺、两块发光的符文石板(石板另挂材质,见后面)──
    at(DAIS.x + 1, () => {
      rock.box(X1 - DAIS.x + 0.5, 0.18, Z1 - Z0 - 1.6, V((X1 + DAIS.x) / 2 - 0.25, 0.09, 0), V(0, 0, 0), [0.78, 0.78, 0.82], UV_ROCK, rnd, 0.035, 0);
      rock.box(X1 - DAIS.x, 0.18, Z1 - Z0 - 2.6, V((X1 + DAIS.x) / 2 + 0.25, 0.27, 0), V(0, 0, 0), [0.84, 0.84, 0.88], UV_ROCK, rnd, 0.035);
      // 石棺:棺身 + 错开一点的棺盖 + 四角铜包角
      rock.box(2.5, 0.8, 1.15, V(10.3, DAIS.h + 0.4, 0), V(0, 0, 0), [0.7, 0.71, 0.76], UV_ROCK, rnd, 0.05, DAIS.h);
      rock.box(2.7, 0.22, 1.3, V(10.36, DAIS.h + 0.91, 0.12), V(0, 4, 0), [0.8, 0.8, 0.85], UV_ROCK, rnd, 0.06);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          bronze.box(0.2, 0.84, 0.2, V(10.3 + sx * 1.2, DAIS.h + 0.42, sz * 0.53), V(0, 0, 0), [0.62, 0.47, 0.25], 2.4, rnd, 0.015);
        }
      }
      // 符文石板的石座
      for (const sz of [-1, 1]) {
        rock.box(0.7, 0.3, 1.3, V(11.1, DAIS.h + 0.15, sz * 2.9), V(0, 0, 0), [0.66, 0.66, 0.7], UV_ROCK, rnd, 0.04, DAIS.h);
      }
    });
    this.solids.push({ x: 10.3, z: 0, hx: 1.4, hz: 0.75, h: 1.5 });

    // ── 火盆:三条腿的铁架 + 铁碗(碗里的炭和火另做)──
    for (const b of BRAZIERS) {
      at(b.x, () => {
        for (let i = 0; i < 3; i += 1) {
          const a = (i / 3) * Math.PI * 2 + 0.5;
          iron.cylinder(0.028, 0.034, 1.02, 7, V(b.x + Math.cos(a) * 0.2, 0.5, b.z + Math.sin(a) * 0.2), V(Math.sin(a) * 13, 0, -Math.cos(a) * 13), [0.55, 0.55, 0.57], UV_IRON, rnd, 0, false);
        }
        iron.lathe([[0.1, 0.92], [0.3, 0.97], [0.44, 1.1], [0.48, 1.24], [0.44, 1.24], [0.4, 1.12], [0.1, 1.04]], 18, { den: UV_IRON, tint: [0.5, 0.5, 0.52], xf: xform([b.x, 0, b.z]) });
        iron.lathe([[0.2, 0.5], [0.23, 0.52], [0.2, 0.54]], 14, { den: UV_IRON, tint: [0.55, 0.55, 0.57], smooth: false, xf: xform([b.x, 0, b.z]) });
      });
      this.solids.push({ x: b.x, z: b.z, hx: 0.5, hz: 0.5, h: 1.4 });
    }

    // ── 水晶壁灯的铁托架(发光的晶条另做)──
    for (const L of LAMPS) {
      at(L.x, () => {
        const z = L.z + L.nz * 0.46;
        iron.box(1.5, 0.07, 0.16, V(L.x, 3.52, z + L.nz * 0.06), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.01);
        for (const s of [-1, 1]) {
          iron.box(0.07, 0.34, 0.2, V(L.x + s * 0.7, 3.66, z + L.nz * 0.05), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.01);
        }
      });
    }

    // ── 摆件:木箱、木桶、壁龛里的石座和陶瓮、天井下的铁篦子、几堆碎石 ──
    const crate = (x: number, y: number, z: number, s: number, yaw: number): void => {
      at(x, () => {
        const v = 0.7 + rnd() * 0.25;
        wood.box(s, s, s, V(x, y + s / 2, z), V(0, yaw, 0), [v, v * 0.96, v * 0.9], UV_WOOD, rnd, 0.012, y);
        // 四条竖边的铁包角 + 上下两道箍
        const c = Math.cos((yaw * Math.PI) / 180);
        const sn = Math.sin((yaw * Math.PI) / 180);
        for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const ox = (ax * s) / 2;
          const oz = (az * s) / 2;
          iron.box(0.07, s + 0.01, 0.07, V(x + ox * c + oz * sn, y + s / 2, z - ox * sn + oz * c), V(0, yaw, 0), [0.55, 0.55, 0.57], UV_IRON, rnd, 0.008);
        }
        for (const ky of [0.12, 0.88]) {
          iron.box(s + 0.02, 0.05, s + 0.02, V(x, y + s * ky, z), V(0, yaw, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.006);
        }
      });
      if (y < 0.1) {
        this.solids.push({ x, z, hx: s * 0.62, hz: s * 0.62, h: s });
      }
    };
    const barrel = (x: number, z: number, k = 1): void => {
      at(x, () => {
        const v = 0.62 + rnd() * 0.2;
        const tint: Tint = [v, v * 0.9, v * 0.78];
        wood.cylinder(0.37 * k, 0.3 * k, 0.5 * k, 16, V(x, 0.25 * k, z), V(0, rnd() * 360, 0), tint, UV_WOOD, rnd, 0);
        wood.cylinder(0.3 * k, 0.37 * k, 0.5 * k, 16, V(x, 0.75 * k, z), V(0, rnd() * 360, 0), tint, UV_WOOD, rnd);
        for (const [y, r] of [[0.14, 0.335], [0.5, 0.378], [0.86, 0.335]]) {
          iron.cylinder(r * k, r * k, 0.05 * k, 16, V(x, y * k, z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, undefined, false);
        }
      });
      this.solids.push({ x, z, hx: 0.42 * k, hz: 0.42 * k, h: k });
    };
    crate(-10.6, 0, 4.9, 1.0, 8);
    crate(-9.5, 0, 5.1, 0.82, -12);
    crate(-10.5, 1.0, 4.95, 0.74, 24);
    crate(-10.9, 0, 3.6, 0.7, 40);
    barrel(-8.5, 5.2);
    barrel(-11.1, -4.9, 1.1);
    barrel(-10.2, -5.1);
    crate(5.3, 0, -5.05, 0.9, 5);
    crate(4.4, 0, -5.2, 0.66, -20);
    barrel(1.3, 5.25);
    for (const x of ALCOVES_N) {
      at(x, () => {
        rock.box(1.5, 0.5, 0.6, V(x, 0.25, Z0 - 0.42), V(0, 0, 0), [0.7, 0.7, 0.74], UV_ROCK, rnd, 0.04, 0);
        bronze.lathe([[0.12, 0.5], [0.3, 0.62], [0.36, 0.95], [0.24, 1.3], [0.16, 1.42], [0.22, 1.5], [0.2, 1.52]], 20, { den: 2.2, tint: [0.42, 0.33, 0.2], xf: xform([x, 0, Z0 - 0.42]) });
      });
    }
    for (const x of ALCOVES_S) {
      at(x, () => {
        rock.box(2.0, 0.62, 0.66, V(x, 0.31, Z1 + 0.42), V(0, 0, 0), [0.68, 0.68, 0.72], UV_ROCK, rnd, 0.04, 0);
        rock.box(2.14, 0.14, 0.76, V(x, 0.69, Z1 + 0.42), V(0, 0, 0), [0.78, 0.78, 0.82], UV_ROCK, rnd, 0.04);
      });
    }
    at(RING.x, () => {
      // 铜环正中的铁篦子:一圈铁框 + 几根横条,盖在排水口上
      iron.lathe([[0.4, 0.004], [0.42, 0.03], [0.5, 0.03], [0.52, 0.004]], 24, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([RING.x, 0, RING.z]) });
      for (let i = -3; i <= 3; i += 1) {
        const len = 2 * Math.sqrt(0.42 * 0.42 - (i * 0.11) * (i * 0.11));
        iron.box(len, 0.024, 0.04, V(RING.x, 0.02, RING.z + i * 0.11), V(0, 0, 0), [0.45, 0.45, 0.47], UV_IRON, rnd, 0.004);
      }
    });
    for (const [x, z, n] of [[-11.2, -2.6, 6], [2.2, -5.3, 7], [11.2, 4.9, 5], [-4.6, 5.4, 5], [8.9, -5.2, 6]] as Array<[number, number, number]>) {
      at(x, () => {
        for (let i = 0; i < n; i += 1) {
          const v = 0.6 + rnd() * 0.25;
          const r = 0.1 + rnd() * 0.22;
          rock.rock(r, V(x + (rnd() - 0.5) * 1.3, r * 0.45, z + (rnd() - 0.5) * 0.8), [v, v, v * 1.04], UV_ROCK * 1.6, rnd, 0.7);
        }
      });
    }

    // ── 墙裙和腰线:沿两面长墙,让开壁龛、侧廊、壁柱 ──
    const SEG_N: Array<[number, number]> = [[-12, -10.25], [-7.75, -6.6], [-5.4, -4.25], [-1.75, -0.6], [0.6, 1.75], [4.25, 5.4], [6.6, DAIS.x - 0.3]];
    const SEG_S: Array<[number, number]> = [[-12, -10.25], [-7.75, -6.6], [-5.4, -4.25], [-1.75, -0.6], [0.6, HALL.x - HALL.half], [HALL.x + HALL.half, 5.4], [6.6, DAIS.x - 0.3]];
    const BAND: Array<[number, number]> = [[-12, -6.5], [-5.5, -0.5], [0.5, 5.5], [6.5, 12]];
    for (const [segs, z, s] of [[SEG_N, Z0, 1], [SEG_S, Z1, -1]] as Array<[Array<[number, number]>, number, number]>) {
      for (const [xa, xb] of segs) {
        at((xa + xb) / 2, () => {
          rock.box(xb - xa, 0.52, 0.2, V((xa + xb) / 2, 0.26, z + s * 0.1), V(0, 0, 0), [0.62, 0.63, 0.67], UV_ROCK, rnd, 0.035, 0);
        });
      }
      for (const [xa, xb] of BAND) {
        at((xa + xb) / 2, () => {
          rock.box(xb - xa, 0.2, 0.13, V((xa + xb) / 2, 4.42, z + s * 0.065), V(0, 0, 0), [0.66, 0.67, 0.71], UV_ROCK, rnd, 0.03);
        });
      }
    }
    // ── 烛台:柱子朝过道的一侧各立一座(铁架 + 三根蜡烛;火苗和光晕另做,不是真的灯)──
    const candleStand = (x: number, z: number): void => {
      at(x, () => {
        for (let i = 0; i < 3; i += 1) {
          const a = (i / 3) * Math.PI * 2 + 0.4;
          iron.cylinder(0.014, 0.02, 0.34, 6, V(x + Math.cos(a) * 0.13, 0.13, z + Math.sin(a) * 0.13), V(-Math.sin(a) * 40, 0, Math.cos(a) * 40), [0.5, 0.5, 0.52], UV_IRON, rnd, 0, false);
        }
        iron.cylinder(0.018, 0.022, 1.25, 8, V(x, 0.86, z), V(0, 0, 0), [0.52, 0.52, 0.54], UV_IRON, rnd, undefined, false);
        iron.lathe([[0.02, 0.6], [0.05, 0.63], [0.02, 0.66]], 10, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([x, 0, z]) });
        iron.box(0.5, 0.025, 0.035, V(x, 1.44, z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.004);
        for (const o of [-0.23, 0, 0.23]) {
          const top = 1.48 + (o === 0 ? 0.2 : 0.06);
          iron.lathe([[0.02, 1.45], [0.05, 1.47], [0.045, 1.485]], 10, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([x + o, o === 0 ? 0.08 : 0, z]) });
          wax.cylinder(0.02, 0.022, top - 1.48 + (o === 0 ? 0.08 : 0) + 0.1, 8, V(x + o, (top + 1.48 + (o === 0 ? 0.08 : 0)) / 2 + 0.03, z), V(0, 0, 0), [0.86, 0.8, 0.66], 2, rnd);
          this.candles.push(new Vec3(x + o, top + (o === 0 ? 0.08 : 0) + 0.1, z));
        }
      });
      this.solids.push({ x, z, hx: 0.2, hz: 0.2, h: 1.6 });
    };
    const wax = new Sculpt();
    for (const [x, z] of [[-6, -2.15], [-6, 2.15], [0, -2.15], [0, 2.15], [6, -2.15], [6, 2.15]]) {
      candleStand(x + 0.75, z);
    }
    // ── 吊笼:从横梁上垂下一根铁链,挂一只空铁笼 ──
    at(2.9, () => {
      const cx = 2.9;
      const cz = -4.1;
      for (let i = 0; i < 9; i += 1) {
        iron.box(0.03, 0.2, 0.03, V(cx, H - 0.6 - i * 0.2, cz), V(0, i % 2 ? 90 : 0, 6 * (i % 2 ? 1 : -1)), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.004);
      }
      const y0 = 2.45;
      for (const y of [y0, y0 + 0.62, y0 + 1.24]) {
        iron.lathe([[0.4, y - 0.02], [0.43, y], [0.4, y + 0.02]], 18, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([cx, 0, cz]) });
      }
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        iron.cylinder(0.014, 0.014, 1.24, 6, V(cx + Math.cos(a) * 0.41, y0 + 0.62, cz + Math.sin(a) * 0.41), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, undefined, false);
      }
      iron.cylinder(0.02, 0.42, 0.34, 10, V(cx, y0 + 1.41, cz), V(0, 0, 0), [0.48, 0.48, 0.5], UV_IRON, rnd, undefined, false);
      iron.cylinder(0.43, 0.43, 0.025, 14, V(cx, y0 - 0.01, cz), V(0, 0, 0), [0.45, 0.45, 0.47], UV_IRON, rnd);
    });
    // ── 兵器架:北墙边,两根立柱两道横档,斜靠四杆长矛,旁边挂一面圆盾 ──
    at(-7.1, () => {
      const x0 = -7.6;
      const x1 = -6.72;
      const z = Z0 + 0.34;
      for (const x of [x0, x1]) {
        wood.box(0.08, 1.5, 0.08, V(x, 0.75, z), V(0, 0, 0), [0.6, 0.52, 0.42], UV_WOOD, rnd, 0.008, 0);
      }
      for (const y of [0.5, 1.36]) {
        wood.box(x1 - x0 + 0.16, 0.07, 0.06, V((x0 + x1) / 2, y, z + 0.02), V(0, 0, 0), [0.56, 0.48, 0.4], UV_WOOD, rnd, 0.008);
      }
      for (let i = 0; i < 4; i += 1) {
        const x = x0 + 0.12 + i * 0.215;
        wood.cylinder(0.016, 0.018, 2.1, 7, V(x, 1.04, z + 0.11), V(7, 0, (i - 1.5) * 1.5), [0.66, 0.56, 0.44], UV_WOOD, rnd, undefined, false);
        iron.cylinder(0.0, 0.03, 0.3, 6, V(x + (i - 1.5) * 0.028, 2.2, z - 0.02), V(7, 0, (i - 1.5) * 1.5), [0.72, 0.72, 0.76], UV_IRON, rnd, undefined, false);
      }
      bronze.lathe([[0.0, 0.1], [0.12, 0.09], [0.16, 0.04], [0.42, 0.02], [0.45, 0.0]], 24, { den: 2.4, tint: [0.5, 0.39, 0.22], xf: xform([-5.0, 1.75, Z0 + 0.03], [90, 0, 0]) });
    });
    // ── 倒下的一截柱子和碎块:北侧过道边 ──
    at(2.2, () => {
      wall.cylinder(0.43, 0.43, 1.45, 18, V(2.3, 0.43, -4.75), V(0, 28, 90), [0.86, 0.87, 0.9], UV_WALL * 2, rnd, 0);
      wall.cylinder(0.43, 0.4, 0.62, 18, V(0.95, 0.31, -5.1), V(6, -40, 4), [0.8, 0.81, 0.85], UV_WALL * 2, rnd, 0);
      for (let i = 0; i < 6; i += 1) {
        const v = 0.62 + rnd() * 0.2;
        const r = 0.09 + rnd() * 0.16;
        rock.rock(r, V(1.2 + rnd() * 2.2, r * 0.45, -4.2 + rnd() * 0.7), [v, v, v * 1.04], UV_ROCK * 1.6, rnd, 0.7);
      }
    });
    this.solids.push({ x: 2.3, z: -4.75, hx: 0.85, hz: 0.6, h: 0.9 }, { x: 0.95, z: -5.1, hx: 0.5, hz: 0.5, h: 0.7 });
    // ── 天井四角垂下的铁链(末端一只钩)──
    for (const [sx, sz, len] of [[-1, -1, 1.5], [1, -1, 1.1], [1, 1, 1.7], [-1, 1, 0.9]] as Array<[number, number, number]>) {
      at(OC.x, () => {
        const x = OC.x + sx * (OC.half - 0.08);
        const z = OC.z + sz * (OC.half - 0.08);
        const links = Math.round(len / 0.16);
        for (let i = 0; i < links; i += 1) {
          iron.box(0.026, 0.16, 0.026, V(x, H - 0.3 - i * 0.16, z), V(0, i % 2 ? 90 : 0, 5 * (i % 2 ? 1 : -1)), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.004);
        }
        iron.lathe([[0.0, 0], [0.045, 0.03], [0.03, 0.09], [0.012, 0.13]], 8, { den: UV_IRON, tint: [0.5, 0.5, 0.52], xf: xform([x, H - 0.3 - links * 0.16 - 0.1, z]) });
      });
    }
    // ── 旗幡:每根柱子朝过道的一面挂一幅(铁杆 + 旧布,下摆撕破)──
    const cloth = new Sculpt();
    for (const px of PILLAR_X) {
      for (const pz of PILLAR_Z) {
        const s = pz > 0 ? -1 : 1;
        const z = pz + s * 0.47;
        const seed = Math.round(px * 3 + pz * 7 + 40);
        at(px, () => {
          iron.box(0.8, 0.035, 0.035, V(px, 4.62, z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.005);
        });
        const rr = mulberry32(seed);
        const rag = [0, 1, 2, 3, 4, 5, 6].map(() => rr() * 0.3);
        const deep: Tint = seed % 2 ? [0.78, 0.13, 0.1] : [0.66, 0.1, 0.13];
        cloth.surf(6, 10, (u, v, out) => {
          const t = 1 - v;
          const tear = t > 0.99 ? rag[Math.round(u * 6)] : 0;
          out.set(px - 0.31 + u * 0.62, 4.6 - (2.2 - tear) * t, z + s * (0.012 + 0.03 * Math.sin(u * 6 + seed) * t + 0.02 * Math.sin(t * 7 + u * 3)));
        }, { den: 8, twoSided: true, tint: (u, v) => {
          const edge = u < 0.12 || u > 0.88 || v > 0.93;
          const mark = Math.abs(u - 0.5) < 0.1 && v > 0.42 && v < 0.74;          // 中间一道竖纹
          const k = 0.6 + 0.4 * v;
          return edge || mark ? [0.86 * k, 0.64 * k, 0.26 * k] : [deep[0] * k, deep[1] * k, deep[2] * k];
        } });
      }
    }

    // ── 按开间依次建:每个开间建完切一刀 ──
    for (let b = 0; b < BAYS; b += 1) {
      for (const j of jobs) {
        if (j.bay === b) {
          j.run();
        }
      }
      for (const batch of batches) {
        this.bakeBatch(batch);
        batch.split();
      }
    }

    // ── 材质(全部由代码生成)──
    const t1 = performance.now();
    const plan: FloorPlan = { x0: X0, z0: Z0, w: X1 - X0, d: Z1 - Z0, ring: RING, scorch: BRAZIERS.map((b) => ({ x: b.x, z: b.z, r: 1.3 })), wet: DUNGEON.wet };
    const floor = floorPbr(DUNGEON.floor, DUNGEON.floor / 2, plan);
    this.stats.floorMs = Math.round(performance.now() - t1);
    const std = (p: Pbr, repeat: boolean, aniso: number, vertexColor = true): Material => {
      const m = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: vertexColor });
      m.setProperty('mainTexture', tex(p.albedo, repeat, aniso));
      m.setProperty('normalMap', tex(p.normal, repeat, aniso));
      m.setProperty('pbrMap', tex(p.orm, repeat, Math.min(4, aniso)));
      m.setProperty('occlusion', 1);
      m.setProperty('roughness', 1);
      m.setProperty('metallic', 1);
      return m;
    };
    const floorMat = std(floor, false, 16, DUNGEON.bake);
    floorMat.setProperty('normalStrength', DUNGEON.floorBump);
    floorMat.setProperty('roughness', DUNGEON.gloss);
    this.floorMat = floorMat;
    const TK = DUNGEON.texK;
    const wallMat = std(masonryPbr(Math.round(1024 * TK)), true, 8);
    const rockMat = std(rockPbr(Math.round(512 * TK)), true, 8);
    rockMat.setProperty('albedoScale', new Vec3(0.7, 0.72, 0.78));
    rockMat.setProperty('normalStrength', 0.6);
    const ironMat = std(ironPbr(256), true, 4);
    const woodMat = std(woodPbr(Math.round(512 * TK)), true, 8);
    woodMat.setProperty('albedoScale', new Vec3(0.78, 0.74, 0.7));
    const bronzeMat = material('builtin-standard', { USE_VERTEX_COLOR: true });
    bronzeMat.setProperty('roughness', 0.38);
    bronzeMat.setProperty('metallic', 1);
    const darkMat = std(masonryPbr(256), true, 2);
    darkMat.setProperty('albedoScale', new Vec3(0.3, 0.3, 0.32));
    this.stats.texMs = Math.round(performance.now() - t1);

    // ── 网格 ──
    const floorMeshes: Mesh[] = [];
    if (DUNGEON.bake) {
      // 烘焙:地面按小格建(每格四个顶点各带一份算好的光),仍旧切成 6 × 3 块
      const W = X1 - X0;
      const Dp = Z1 - Z0;
      for (let cz = 0; cz < 3; cz += 1) {
        for (let cx = 0; cx < 6; cx += 1) {
          const sc = new Sculpt();
          const xa = X0 + (W * cx) / 6;
          const za = Z0 + (Dp * cz) / 3;
          const nx = Math.ceil(W / 6 / DUNGEON.bakeEdge);
          const nz = Math.ceil(Dp / 3 / DUNGEON.bakeEdge);
          for (let iz = 0; iz < nz; iz += 1) {
            for (let ix = 0; ix < nx; ix += 1) {
              const x0 = xa + (W / 6) * (ix / nx);
              const x1 = xa + (W / 6) * ((ix + 1) / nx);
              const z0 = za + (Dp / 3) * (iz / nz);
              const z1 = za + (Dp / 3) * ((iz + 1) / nz);
              sc.facet([V(x0, 0, z0), V(x0, 0, z1), V(x1, 0, z1), V(x1, 0, z0)],
                [[(x0 - X0) / W, (z0 - Z0) / Dp], [(x0 - X0) / W, (z1 - Z0) / Dp], [(x1 - X0) / W, (z1 - Z0) / Dp], [(x1 - X0) / W, (z0 - Z0) / Dp]], [1, 1, 1]);
            }
          }
          // 地面在电脑档里大半的亮度来自灯的反光(湿地面),烘焙只算了漫反射:整体提亮一些补回来
          this.bakeBatch(sc, false, 1.9);
          floorMeshes.push(...sc.build());
        }
      }
    } else {
      floorMeshes.push(...MeshBatch.groundTiles(X0, Z0, X1 - X0, Z1 - Z0, 6, 3));
    }
    for (const m of floorMeshes) {
      const gn = addMesh(world, 'DgFloor', m, floorMat, false, true);
      gn.layer = GROUND_LAYER;
      this.groundNodes.push(gn);
    }
    let tris = 0;
    for (const [batch, mat, name] of [[wall, wallMat, 'DgWall'], [rock, rockMat, 'DgRock'], [iron, ironMat, 'DgIron'], [wood, woodMat, 'DgWood'], [bronze, bronzeMat, 'DgBronze'], [dark, darkMat, 'DgDark']] as Array<[MeshBatch, Material, string]>) {
      for (const m of batch.build()) {
        addMesh(world, name, m, mat, true, true);
      }
      tris += batch.triangles;
    }
    this.stats.sceneTris = tris;

    // ── 发光的东西:晶条、炭火、符文石板、门楣上的符文牌 ──
    const quad = MeshBatch.quad();
    const glowTex = tex(paintGlow(128, 2.2), false, 1);
    const halo = (x: number, y: number, z: number, size: number, color: Color, k: number): void => {
      const m = material('builtin-unlit', { USE_TEXTURE: true }, 2);
      m.setProperty('mainTexture', glowTex);
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      const n = addMesh(world, 'DgHalo', quad, m, false, false);
      n.setPosition(x, y, z);
      n.setScale(size, size, 1);
      this.halos.push(n);
    };
    const emissive = (color: Color, k: number): Material => {
      const m = material('builtin-unlit', {});
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      return m;
    };
    const rod = new Sculpt();
    for (const L of LAMPS) {
      rod.cylinder(0.045, 0.045, 1.24, 10, V(L.x, 3.66, L.z + L.nz * 0.52), V(0, 0, 90), [1, 1, 1], 1, rnd);
      halo(L.x, 3.66, L.z + L.nz * 0.56, 2.4, new Color(150, 200, 255, 255), 0.5);
    }
    const rodMat = emissive(new Color(190, 226, 255, 255), 7);
    for (const m of rod.build()) {
      addMesh(world, 'DgLampRod', m, rodMat, false, false);
    }
    const coal = new Sculpt();
    for (const b of BRAZIERS) {
      coal.cylinder(0.4, 0.42, 0.06, 14, V(b.x, 1.15, b.z), V(0, 0, 0), [1, 1, 1], 1, rnd);
      halo(b.x, 1.5, b.z, 2.6, new Color(255, 150, 70, 255), 0.55);
    }
    const coalMat = emissive(new Color(255, 96, 28, 255), 3.2);
    for (const m of coal.build()) {
      addMesh(world, 'DgCoal', m, coalMat, false, false);
    }
    const stele = (x: number, z: number, w: number, h: number, yaw: number, seed: number, color: Color, k: number, y0: number, rows: number): void => {
      const r = paintRunes(256, Math.round((256 * h) / w), seed, rows);
      const m = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_EMISSIVE_MAP: true });
      m.setProperty('mainTexture', tex(r.albedo, false, 4));
      m.setProperty('emissiveMap', tex(r.glow, false, 4));
      m.setProperty('emissive', color);
      m.setProperty('emissiveScale', new Vec3(k, k, k));
      m.setProperty('roughness', 0.5);
      m.setProperty('metallic', 0);
      const sc = new Sculpt();
      // 一块薄石板:正面按整张图贴,侧面和背面只取图的一个角(都是石面)
      const hw = w / 2;
      const t = 0.16;
      const P = (lx: number, ly: number, lz: number): Vec3 => {
        const c = Math.cos((yaw * Math.PI) / 180);
        const s = Math.sin((yaw * Math.PI) / 180);
        return new Vec3(x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c);
      };
      sc.facet([P(-hw, 0, t), P(hw, 0, t), P(hw, h, t), P(-hw, h, t)], [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1]);
      const side: Array<[number, number]> = [[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02]];
      sc.facet([P(hw, 0, -t), P(-hw, 0, -t), P(-hw, h, -t), P(hw, h, -t)], side, [1, 1, 1]);
      sc.facet([P(hw, 0, t), P(hw, 0, -t), P(hw, h, -t), P(hw, h, t)], side, [1, 1, 1]);
      sc.facet([P(-hw, 0, -t), P(-hw, 0, t), P(-hw, h, t), P(-hw, h, -t)], side, [1, 1, 1]);
      sc.facet([P(-hw, h, t), P(hw, h, t), P(hw, h, -t), P(-hw, h, -t)], side, [1, 1, 1]);
      if (DUNGEON.bake) {
        // 石板的材质不带顶点颜色:整块按所在位置的光压一下(不然在烘焙用的那份环境光下是一块亮板)
        const c = this.bakeAt(x, y0 + h / 2, z, 0, 0.3, 0);
        m.setProperty('albedoScale', new Vec3(c[0], c[1], c[2]));
      }
      for (const mesh of sc.build()) {
        addMesh(world, 'DgStele', mesh, m, true, true);
      }
    };
    // 石台两侧的符文石板(面朝大厅),绿光
    stele(11.1, -2.9, 1.0, 2.3, -90, 3, new Color(30, 255, 120, 255), 0.85, DAIS.h + 0.3, 5);
    stele(11.1, 2.9, 1.0, 2.3, -90, 8, new Color(30, 255, 120, 255), 0.85, DAIS.h + 0.3, 5);
    halo(10.8, DAIS.h + 1.5, -2.9, 3.0, new Color(60, 255, 140, 255), 0.2);
    halo(10.8, DAIS.h + 1.5, 2.9, 3.0, new Color(60, 255, 140, 255), 0.2);
    // 铁栅门上方的符文牌(面朝大厅),红光
    stele(X0 + 0.62, 0, 2.6, 0.62, 90, 5, new Color(255, 34, 22, 255), 1.3, GATE.h + 0.72, 1);
    halo(X0 - 0.9, 2.0, 0, 4.6, new Color(255, 50, 36, 255), 0.26);

    // ── 月光的光柱:沿光的方向从天井拉到地面的几片叠加色的面(横竖各三片,叠出体积感)──
    const shaft = new Sculpt();
    const sx = (MOON_DIR.x / -MOON_DIR.y) * H;
    const sz = (MOON_DIR.z / -MOON_DIR.y) * H;
    const sheet = (ax: number, az: number, bx: number, bz: number): void => {
      const p = [V(ax, H, az), V(bx, H, bz), V(bx + sx, 0, bz + sz), V(ax + sx, 0, az + sz)];
      const uv: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
      shaft.facet(p, uv, [1, 1, 1]);
      shaft.facet([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]], [1, 1, 1]);
    };
    for (const o of [-0.72, 0, 0.72]) {
      sheet(OC.x - OC.half, OC.z + o, OC.x + OC.half, OC.z + o);
      sheet(OC.x + o, OC.z - OC.half, OC.x + o, OC.z + OC.half);
    }
    const sm = material('builtin-unlit', { USE_TEXTURE: true }, 2);
    sm.setProperty('mainTexture', tex(paintShaft(128, 256), false, 2));
    sm.setProperty('mainColor', new Color(150, 186, 255, 255));
    this.shaftMat = sm;
    for (const m of shaft.build()) {
      addMesh(world, 'DgShaft', m, sm, false, false);
    }

    // ── 旗幡、蜡烛 ──
    const cl = paintCloth(256, 48);
    const clothMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    clothMat.setProperty('mainTexture', tex(cl.albedo, true, 4));
    clothMat.setProperty('normalMap', tex(cl.normal, true, 4));
    clothMat.setProperty('roughness', 0.88);
    clothMat.setProperty('metallic', 0);
    this.bakeBatch(cloth, false);
    for (const m of cloth.build()) {
      addMesh(world, 'DgBanner', m, clothMat, true, true);
    }
    const waxMat = material('builtin-standard', { USE_VERTEX_COLOR: true });
    waxMat.setProperty('roughness', 0.55);
    waxMat.setProperty('metallic', 0);
    this.bakeBatch(wax, false);
    for (const m of wax.build()) {
      addMesh(world, 'DgWax', m, waxMat, true, true);
    }
    for (const c of this.candles) {
      halo(c.x, c.y + 0.06, c.z, 0.85, new Color(255, 176, 96, 255), 0.75);
    }
    // ── 墙上的污渍:墙脚往上一圈、天花板往下一圈(盖在墙面前的半透明暗色,不平铺出重复:每段取贴图的不同位置)──
    const grime = new Sculpt();
    const stain = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number, flip: boolean, off: number): void => {
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = off;
      const u1 = off + len / 4.5;
      const p = [V(ax, y0, az), V(bx, y0, bz), V(bx, y1, bz), V(ax, y1, az)];
      const uv: Array<[number, number]> = flip ? [[u0, 0], [u1, 0], [u1, 1], [u0, 1]] : [[u0, 1], [u1, 1], [u1, 0], [u0, 0]];
      grime.facet(p, uv, [1, 1, 1]);
      grime.facet([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]], [1, 1, 1]);
    };
    const E = 0.014;
    let off = 0;
    for (const [segs, z, s] of [[SEG_N, Z0, 1], [SEG_S, Z1, -1]] as Array<[Array<[number, number]>, number, number]>) {
      for (const [xa, xb] of segs) {
        stain(xa, z + s * (0.2 + E), xb, z + s * (0.2 + E), 0, 0.52, false, off);       // 墙裙正面
        stain(xa, z + s * E, xb, z + s * E, 0.52, 2.3, false, off);
        off += 0.37;
      }
      for (const [xa, xb] of BAND) {
        stain(xa, z + s * E, xb, z + s * E, 4.56, H, true, off);
        off += 0.41;
      }
    }
    stain(X1 - E, Z0, X1 - E, Z1, DAIS.h, 2.4, false, 0.2);
    stain(X1 - E, Z0, X1 - E, Z1, 4.5, H, true, 0.6);
    stain(X0 + E, Z0, X0 + E, -GATE.half - 0.5, 0, 2.3, false, 0.9);
    stain(X0 + E, GATE.half + 0.5, X0 + E, Z1, 0, 2.3, false, 1.3);
    stain(X0 + E, Z0, X0 + E, Z1, 4.9, H, true, 1.7);
    const grimeMat = material('builtin-unlit', { USE_TEXTURE: true }, 3);
    grimeMat.setProperty('mainTexture', tex(paintGrime(256), true, 4));
    grimeMat.setProperty('mainColor', new Color(9, 8, 8, 120));
    for (const m of grime.build()) {
      addMesh(world, 'DgGrime', m, grimeMat, false, false);
    }
    // ── 壁灯下面的光锥:贴着墙往下、往外散开的两片叠加色的面 ──
    const cone = new Sculpt();
    for (const L of LAMPS) {
      const z0 = L.z + L.nz * 0.55;
      const fan = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): void => {
        const p = [V(ax, 3.62, az), V(bx, 3.62, bz), V(cx, 0.05, cz), V(dx, 0.05, dz)];
        const uv: Array<[number, number]> = [[0.2, 0.02], [0.8, 0.02], [1, 1], [0, 1]];
        cone.facet(p, uv, [1, 1, 1]);
        cone.facet([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]], [1, 1, 1]);
      };
      fan(L.x - 0.6, z0, L.x + 0.6, z0, L.x + 2.3, z0 + L.nz * 1.5, L.x - 2.3, z0 + L.nz * 1.5);
      fan(L.x, z0 - L.nz * 0.3, L.x, z0 + L.nz * 0.3, L.x, z0 + L.nz * 3.4, L.x, z0 - L.nz * 0.35);
    }
    const coneMat = material('builtin-unlit', { USE_TEXTURE: true }, 2);
    coneMat.setProperty('mainTexture', tex(paintShaft(128, 256), false, 2));
    coneMat.setProperty('mainColor', new Color(150, 200, 255, 255));
    this.coneMat = coneMat;
    for (const m of cone.build()) {
      addMesh(world, 'DgLampCone', m, coneMat, false, false);
    }

    // ── 地面的假倒影高光:光源表 + 一张每帧重写的网格 ──
    if (DUNGEON.glint > 0) {
      const G = (x: number, y: number, z: number, c: [number, number, number], k: number, w: number): void => {
        this.glints.push({ x, y, z, r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, k, w });
      };
      for (const L of LAMPS) {
        G(L.x, 3.66, L.z + L.nz * 0.52, [170, 215, 255], 1.0, 0.62);
      }
      for (const b of BRAZIERS) {
        G(b.x, 1.4, b.z, [255, 150, 70], 0.9, 0.5);
      }
      for (let i = 1; i < this.candles.length; i += 3) {
        const c = this.candles[i];
        G(c.x, c.y, c.z, [255, 176, 96], 0.55, 0.34);
      }
      G(X0 - 0.4, 2.0, 0, [255, 50, 36], 0.8, 0.9);
      G(11.0, DAIS.h + 1.5, -2.9, [60, 255, 140], 0.5, 0.5);
      G(11.0, DAIS.h + 1.5, 2.9, [60, 255, 140], 0.5, 0.5);
      G(HALL.x + 0.4, 1.8, Z1 + HALL.depth - 0.6, [255, 140, 60], 0.6, 0.4);
      const gm = material('builtin-unlit', { USE_TEXTURE: true, USE_VERTEX_COLOR: true }, 2);
      gm.setProperty('mainTexture', glowTex);
      this.glintMesh = new DynMesh(world, 'DgGlint', gm, 4 * 40, 6 * 40, false, false, { min: [X0 - 2, -1, Z0 - 2], max: [X1 + 2, 2, Z1 + 2] });
    }

    // ── 灯 ──
    const point = (kind: string, x: number, y: number, z: number, color: Color, range: number): PointLight => {
      const n = new Node(`DgLight_${kind}`);
      world.addChild(n);
      n.setPosition(x, y, z);
      const L = n.addComponent(PointLight);
      L.color = color;
      L.range = range * DUNGEON.rangeK;
      L.luminousFlux = 0;
      this.lights[kind].push(L);
      return L;
    };
    // 灯位:每处一组真灯 + 一组假光斑。真灯只亮离主角最近的几处(见 stepLights),别的灯位只画假光斑
    const fixture = (x: number, z: number): number => {
      this.fixtures.push({ x, z, w: 1, on: true, d: 0, fake: [] });
      return this.fixtures.length - 1;
    };
    const rec = (L: PointLight | SpotLight, kind: string, fx: number, amp = 0, seed = 0): void => {
      this.recs.push({ L, kind, fx, amp, seed });
    };
    /** 假光斑:一张软边的圆(叠加色)。wall = 0 贴在地上;±1 贴在墙上(墙朝房间里的方向)。 */
    const fake = (fx: number, x: number, y: number, z: number, size: number, color: Color, k: number, wall = 0): void => {
      const m = material('builtin-unlit', { USE_TEXTURE: true }, 2);
      m.setProperty('mainTexture', glowTex);
      m.setProperty('mainColor', color);
      const n = addMesh(world, 'DgFakeGlow', quad, m, false, false);
      n.setPosition(x, y, z);
      n.setScale(size, size, 1);
      n.setRotationFromEuler(wall === 0 ? -90 : 0, wall < 0 ? 180 : 0, 0);
      n.active = false;
      this.fixtures[fx].fake.push({ node: n, mat: m, k });
    };
    const COOL = new Color(150, 204, 255, 255);
    const WARM = new Color(255, 150, 76, 255);
    for (const L of LAMPS) {
      // 一盏点光照亮灯周围的墙,一盏往下打的聚光照地面
      const fx = fixture(L.x, L.z + L.nz * 1.6);
      rec(point('lamp', L.x, 3.6, L.z + L.nz * 0.78, COOL, 6.5), 'lamp', fx);
      const sn = new Node('DgLampSpot');
      world.addChild(sn);
      sn.setPosition(L.x, 3.6, L.z + L.nz * 0.7);
      sn.lookAt(new Vec3(L.x, 0, L.z + L.nz * 3.3));
      const S = sn.addComponent(SpotLight);
      S.color = COOL;
      S.range = 11 * DUNGEON.rangeK;
      S.spotAngle = 112;
      S.luminousFlux = 0;
      this.spots.push(S);
      rec(S, 'lampSpot', fx);
      fake(fx, L.x, 0.03, L.z + L.nz * 2.4, 6.4, COOL, 0.13);
      fake(fx, L.x, 3.0, L.z + L.nz * 0.03, 3.6, COOL, 0.2, L.nz);
    }
    BRAZIERS.forEach((b, i) => {
      const fx = fixture(b.x, b.z);
      rec(point('brazier', b.x, 1.9, b.z, new Color(255, 146, 72, 255), 7.5), 'brazier', fx, 0.16, i * 3.7);
      fake(fx, b.x, 0.03, b.z, 7, WARM, 0.16);
    });
    const gfx = fixture(X0 + 1, 0);
    rec(point('gate', X0 - 0.9, 2.1, 0, new Color(255, 52, 38, 255), 9), 'gate', gfx);
    fake(gfx, X0 + 1.7, 0.03, 0, 6.5, new Color(255, 50, 36, 255), 0.17);
    const rfx = fixture(9, 0);
    rec(point('rune', 10.2, DAIS.h + 1.5, 0, new Color(60, 255, 140, 255), 7), 'rune', rfx);
    fake(rfx, 7.6, 0.03, 0, 5.5, new Color(60, 255, 140, 255), 0.1);
    fake(rfx, 10.4, DAIS.h + 0.02, 0, 5, new Color(60, 255, 140, 255), 0.1);
    const tfx = fixture(HALL.x, Z1 - 0.6);
    rec(point('torch', HALL.x + 0.4, 1.9, Z1 + HALL.depth - 1.1, new Color(255, 132, 56, 255), 9), 'torch', tfx, 0.22, 9.1);
    fake(tfx, HALL.x, 0.03, Z1 - 0.7, 4.6, WARM, 0.14);
    for (let i = 0; i < 2; i += 1) {
      const L = point('hit', 0, 1.2, 0, new Color(255, 214, 160, 255), 4.5);
      L.node.active = false;
    }
    point('fill', this.lx, 2.6, this.lz, new Color(214, 226, 255, 255), 4.6);
    rec(point('bounce', RING.x, 1.4, RING.z, new Color(150, 190, 255, 255), 7.5), 'bounce', fixture(RING.x, RING.z));
    for (let i = 1; i < this.candles.length; i += 3) {
      const c = this.candles[i];      // 每座烛台三根蜡烛,取中间那根的位置
      const fx = fixture(c.x, c.z);
      if (DUNGEON.candleReal) {
        rec(point('candle', c.x, c.y + 0.12, c.z, new Color(255, 170, 92, 255), 3.8), 'candle', fx, 0.1, i * 1.9);
      }
      fake(fx, c.x, 0.03, c.z, 3.4, WARM, 0.1);
    }
    // 月光:投影的范围以房间正中为心,要罩住整间房 —— 范围外的东西不进投影图,会被月光直接照到
    const moonNode = new Node('DgMoon');
    world.addChild(moonNode);
    moonNode.setPosition(-MOON_DIR.x * 40, -MOON_DIR.y * 40, -MOON_DIR.z * 40);
    moonNode.lookAt(new Vec3(0, 0, 0));
    const moon = moonNode.addComponent(DirectionalLight);
    moon.color = new Color(168, 198, 255, 255);
    moon.illuminance = DUNGEON.moon;
    this.moon = moon;

    this.finishBuild(world, t0);
  }

  /** 相机、特效、剑、角色:两个场景共用的收尾。 */
  private finishBuild(world: Node, t0: number): void {
    const wild = this.outdoor;
    const camNode = new Node('DgCamera');
    world.addChild(camNode);
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fovAxis = Camera.FOVAxis.VERTICAL;
    cam.near = 0.12;
    cam.far = this.city ? 240 : wild ? 160 : 90;
    cam.priority = -1;
    cam.clearFlags = wild ? Camera.ClearFlag.SKYBOX : Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(4, 5, 8, 255);
    cam.visibility = Layers.Enum.DEFAULT | GROUND_LAYER;
    this.cam = cam;
    const pad = wild ? 8 : 0;
    this.fx = new FxWorld(world, { min: [X0 - 4 - pad, -1, Z0 - 5 - pad], max: [X1 + 1 + pad, wild ? 12 : ROOF, Z1 + 5 + pad] });
    const fxBounds = { min: [X0 - 2 - pad, -1, Z0 - 2 - pad] as [number, number, number], max: [X1 + 2 + pad, wild ? 10 : H, Z1 + 2 + pad] as [number, number, number] };
    // &sword1=1:单手长剑(配剑盾包的动作;预渲染拍主角帧用),默认按动作库给双手大剑
    const sw = buildSword(world, hasMoves('hero_m') && param('sword1') !== '1');
    this.swordLen = sw.len;
    this.swordRoot = sw.root;
    this.sword = sw.node;
    this.swordLit = sw.lit;
    sw.node.active = false;
    this.trail = new BladeTrail(world, fxBounds);
    this.aura = new BladeTrail(world, fxBounds, this.trail.mat.getProperty('mainTexture') as any);
    this.aura.life = 0.26;
    this.aura.mat.setProperty('colorScale', new Vec3(1.3, 1.3, 1.3));
    this.waveMesh = new DynMesh(world, 'DgSwordWave', this.trail.mat, 4 * 120, 6 * 120, false, false, fxBounds);
    this.loadChars();
    this.stats.buildMs = Math.round(performance.now() - t0);
  }

  /**
   * 主城场景:中心广场(月夜)。几何在 G3DCity.ts,贴图在 G3DCityTex.ts;这里配材质、灯、远景。
   * 照着原型做(周报截图/2026-11-17_主城3D小样/原型/01_…):湿的方石广场和罗盘纹、正对着的大教堂、左边的铁匠铺和水井、右边的红篷摊位。
   */
  private buildCity(world: Node, rnd: () => number, t0: number): void {
    const t1 = performance.now();
    // 地面要换成石板贴图的话(&bld=…,ground),这里先出一张小的垫着,贴图载到了再出正式的
    const paved = DUNGEON.bld.split(',').indexOf('ground') >= 0;
    const gw = paved ? 512 : DUNGEON.floor;
    const ground = plazaPbr(gw, Math.round((gw * CITY_GROUND.d) / CITY_GROUND.w), CITY_PLAN);
    this.stats.floorMs = Math.round(performance.now() - t1);
    this.wildWet = (x: number, z: number): boolean => wetAt(ground.wet, CITY_PLAN, x, z);
    const bldKeys = DUNGEON.bld.split(',').filter((k) => k);
    const C = buildCityScene(rnd, bldKeys, DUNGEON.cityFull && !CITY_V4.on ? FULL_SKIP : []);
    if (CITY_V4.on) {
      extendCityV4(C, rnd);          // 主城 v4(&cityv4=1):整城按 G3DCityV4Data 重摆
    } else if (DUNGEON.cityFull) {
      extendCityFull(C, rnd);
    }
    this.solids.push(...C.solids);
    BRAZIERS.splice(0, BRAZIERS.length, { x: C.forge.x, z: C.forge.z });          // 火的特效和声音认这张表:城里就是铁匠铺的锻炉
    this.cityNpcSpots = C.npcs;
    this.cityLamps = C.lamps;
    this.citySmoke = C.smoke;
    this.cityFireY = C.forge.y - 0.22;
    // 开场站在西边街口,镜头略偏北:左前方是铁匠铺的炉火,教堂在正前方偏右,右边露出集市的红篷(原型的构图)
    this.lx = -16.5;
    this.lz = 0.9;          // 第十三轮:队友在右边 1.9 米,罗盘纹(z 1.8)和台阶正好夹在两人中间(原型的构图)
    // 镜头比另外两个场景放平、放广:城里要看得到教堂的塔尖和天
    // 第十一轮:台阶和教堂挪近之后,镜头往正东摆一点、抬高一点、拉远一点,教堂整座和台阶都在画面里
    this.view.yaw = 276;
    this.view.pitch = 7;          // 第十三轮:镜头抬高、略往下看(原型能看清地上的罗盘纹);再往下教堂上半截出画
    this.view.dist = 5.0;          // 原型里两个人约占画面高度的 45%,原来 5.6 只有三成;再近教堂就出画
    this.view.fov = 64;
    const std = (p: Pbr, repeat: boolean, aniso: number, vertexColor = true): Material => {
      const m = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: vertexColor });
      m.setProperty('mainTexture', tex(p.albedo, repeat, aniso));
      m.setProperty('normalMap', tex(p.normal, repeat, aniso));
      m.setProperty('pbrMap', tex(p.orm, repeat, Math.min(4, aniso)));
      m.setProperty('occlusion', 1);
      m.setProperty('roughness', 1);
      m.setProperty('metallic', 1);
      return m;
    };
    const plain = (rough: number, metal = 0): Material => {
      const m = material('builtin-standard', { USE_VERTEX_COLOR: true });
      m.setProperty('roughness', rough);
      m.setProperty('metallic', metal);
      return m;
    };
    const floorMat = std(ground, false, 16, false);
    floorMat.setProperty('specularIntensity', 0.12);          // 第二轮试过 0.2:朝月亮那边看,积水和罗盘纹一块块泛白
    floorMat.setProperty('normalStrength', DUNGEON.floorBump);
    floorMat.setProperty('roughness', DUNGEON.gloss);
    this.floorMat = floorMat;
    const TK = DUNGEON.texK;
    const stoneMat = std(masonryPbr(Math.round(1024 * TK)), true, 8);
    stoneMat.setProperty('albedoScale', new Vec3(0.86, 0.85, 0.85));
    const rubbleMat = std(rubblePbr(Math.round(512 * TK)), true, 8);
    rubbleMat.setProperty('albedoScale', new Vec3(0.78, 0.77, 0.77));
    const plasterMat = std(plasterPbr(Math.round(512 * TK)), true, 8);
    plasterMat.setProperty('albedoScale', new Vec3(0.45, 0.43, 0.41));          // 第三轮:墙面压成灰褐(原型的房子是暗的,不是奶油色)
    const timberMat = std(woodPbr(Math.round(512 * TK)), true, 8);
    timberMat.setProperty('albedoScale', new Vec3(0.44, 0.39, 0.35));
    const slateMat = std(slatePbr(Math.round(512 * TK)), true, 8);
    slateMat.setProperty('specularIntensity', 0.2);
    const ironMat = std(ironPbr(256), true, 4);
    const barkP = barkPbr(Math.round(512 * TK), true);
    const barkMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    barkMat.setProperty('mainTexture', tex(barkP.albedo, true, 8));
    barkMat.setProperty('normalMap', tex(barkP.normal, true, 8));
    barkMat.setProperty('roughness', 0.88);
    barkMat.setProperty('metallic', 0);
    barkMat.setProperty('normalStrength', 0.7);
    barkMat.setProperty('albedoScale', new Vec3(0.6, 0.56, 0.54));
    // 暗红的布(篷布、旗幡):帆布的纹理压成暗红
    const clothMat = std(canvasPbr(Math.round(512 * TK)), true, 4);
    clothMat.setProperty('albedoScale', new Vec3(0.3, 0.06, 0.07));
    const goodsMat = plain(0.85);
    const leafMat = plain(1.0);
    leafMat.setProperty('specularIntensity', 0.04);          // 叶子不反光:柏树一反光就成了灰的
    const darkGlass = plain(0.2);
    this.stats.texMs = Math.round(performance.now() - t1);

    // ── 地面:广场一块(带积水倒影)+ 外面一大片暗色的铺地(街道往外延伸,被雾吃掉)──
    for (const m of MeshBatch.groundTiles(CITY_GROUND.x0, CITY_GROUND.z0, CITY_GROUND.w, CITY_GROUND.d, 8, 6)) {
      const gn = addMesh(world, 'DgFloor', m, floorMat, false, true);
      gn.layer = GROUND_LAYER;
      this.groundNodes.push(gn);
    }
    const outerMat = std(rockPbr(256), true, 4, false);
    outerMat.setProperty('albedoScale', CITY_V4.on ? new Vec3(0.05, 0.055, 0.065) : new Vec3(0.16, 0.17, 0.2));          // v4:城外压暗
    if (CITY_V4.on) {
      outerMat.setProperty('metallic', 0);          // 城外地面不反天光(金属度 1 时月夜下一片发白)
    }
    for (const m of MeshBatch.groundTiles(-150, -150, 300, 300, 2, 2, -0.04)) {
      addMesh(world, 'DgOuter', m, outerMat, false, true);
    }
    let tris = 0;
    const parts: Array<[MeshBatch, Material, string, boolean]> = [[C.stone, stoneMat, 'DgStone', true], [C.rubble, rubbleMat, 'DgRubble', true], [C.plaster, plasterMat, 'DgPlaster', true], [C.timber, timberMat, 'DgTimber', true],
      [C.slate, slateMat, 'DgSlate', true], [C.iron, ironMat, 'DgIron', true], [C.bark, barkMat, 'DgBark', true], [C.cloth, clothMat, 'DgCloth', true],
      [C.goods, goodsMat, 'DgGoods', true], [C.leaf, leafMat, 'DgLeaf', true], [C.winDark, darkGlass, 'DgWinDark', false]];
    for (const [batch, mat, name, cast] of parts) {
      for (const m of batch.build()) {
        addMesh(world, name, m, mat, cast, true);
      }
      tris += batch.triangles;
    }
    this.stats.sceneTris = tris;

    // ── 亮着的窗:暖黄的玻璃 + 深色窗棂,自己发光(不受光);亮度压着,只是点缀 ──
    const litWindow = (batch: MeshBatch, cv: HTMLCanvasElement, k: number, name: string): void => {
      const m = material('builtin-unlit', { USE_TEXTURE: true }, 1);
      m.setProperty('mainTexture', tex(cv, false, 4));
      m.setProperty('mainColor', new Color(255, 255, 255, 255));
      m.setProperty('colorScale', new Vec3(k, k, k));
      for (const mesh of batch.build()) {
        addMesh(world, name, mesh, m, false, false);
      }
    };
    litWindow(C.winHouse, paintWindow('house', 160, 200, 3), 1.05, 'DgWinHouse');
    litWindow(C.winLancet, paintWindow('lancet', 96, 336, 5), 1.0, 'DgWinLancet');
    litWindow(C.winRose, paintWindow('rose', 256, 256, 7), 0.95, 'DgWinRose');

    // ── 远处的城:两圈屋顶和塔楼的剪影(整城模式不要:城墙外面就是城外,俯视预渲染时这圈剪影会立在城墙外)──
    for (const [rad, hgt, seed, y0, rep2] of (DUNGEON.cityFull ? [] : [[58, 16, 3, -1, 3], [78, 26, 9, -1, 4]]) as Array<[number, number, number, number, number]>) {
      const line = new Sculpt();
      line.surf(48, 1, (u, v, out) => {
        const a = u * Math.PI * 2;
        out.set(Math.cos(a) * rad * 1.15, y0 + v * hgt, Math.sin(a) * rad * 0.9);
      }, { uv01: true, twoSided: true });
      const lm = material('builtin-unlit', { USE_TEXTURE: true }, 1);
      lm.setProperty('mainTexture', tex(paintSkyline(2048, 256, seed), true, 4));
      lm.setProperty('mainColor', new Color(255, 255, 255, 255));
      lm.setProperty('tilingOffset', new Quat(rep2, 1, 0, 0) as any);
      for (const m of line.build()) {
        addMesh(world, 'DgSkyline', m, lm, false, false);
      }
    }

    // ── 月亮:天上的一块小板(朝着广场),贴一个清楚的圆月;天空图里只留它周围的一圈淡淡的光 ──
    {
      const mm = material('builtin-unlit', { USE_TEXTURE: true }, 1);
      mm.setProperty('mainTexture', tex(paintMoon(256), false, 4));
      mm.setProperty('mainColor', new Color(255, 255, 255, 255));
      mm.setProperty('colorScale', new Vec3(DUNGEON.moonDisc, DUNGEON.moonDisc, DUNGEON.moonDisc));
      const mn = addMesh(world, 'DgMoonDisc', MeshBatch.quad(), mm, false, false);
      const dl = Math.hypot(CITY_MOON_SKY[0], CITY_MOON_SKY[1], CITY_MOON_SKY[2]);
      mn.setPosition((CITY_MOON_SKY[0] / dl) * 200, (CITY_MOON_SKY[1] / dl) * 200, (CITY_MOON_SKY[2] / dl) * 200);
      mn.lookAt(new Vec3(mn.position.x * 2, mn.position.y * 2, mn.position.z * 2));          // 板的正面是 +z:要背对着「看」出去,正面才朝广场
      mn.setScale(7.2, 7.2, 1);          // 第十二轮:原型的月亮约 1.6°,原来 3° 太大
      this.moonDisc = mn;
    }

    // ── 发光的东西:路灯的玻璃、锻炉的炭火,各带一小团光晕 ──
    const quad = MeshBatch.quad();
    const glowTex = tex(paintGlow(128, 2.2), false, 1);
    const halo = (x: number, y: number, z: number, size: number, color: Color, k: number): void => {
      const m = material('builtin-unlit', { USE_TEXTURE: true }, 2);
      m.setProperty('mainTexture', glowTex);
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      const n = addMesh(world, 'DgHalo', quad, m, false, false);
      n.setPosition(x, y, z);
      n.setScale(size, size, 1);
      this.halos.push(n);
    };
    const emissive = (color: Color, k: number): Material => {
      const m = material('builtin-unlit', {});
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      return m;
    };
    const glassMat = emissive(new Color(255, 150, 64, 255), 1.7);          // 灯罩是暖黄的,别亮成一块白
    for (const m of C.glass.build()) {
      addMesh(world, 'DgLampGlass', m, glassMat, false, false);
    }
    const coalMat = emissive(new Color(255, 96, 28, 255), 3.0);
    for (const m of C.coal.build()) {
      addMesh(world, 'DgCoal', m, coalMat, false, false);
    }
    for (const l of C.lamps) {
      halo(l.x, l.y, l.z, 1.6, new Color(255, 170, 96, 255), 0.3);
    }

    // ── 灯:四盏路灯、教堂台阶两侧各一盏、锻炉一盏;命中时闪一下的两盏;跟着主角的一盏很弱的补光 ──
    const point = (kind: string, x: number, y: number, z: number, color: Color, range: number): PointLight => {
      const n = new Node(`DgLight_${kind}`);
      world.addChild(n);
      n.setPosition(x, y, z);
      const L = n.addComponent(PointLight);
      L.color = color;
      L.range = range * DUNGEON.rangeK;
      L.luminousFlux = 0;
      this.lights[kind].push(L);
      return L;
    };
    const fixture = (x: number, z: number): number => {
      this.fixtures.push({ x, z, w: 1, on: true, d: 0, fake: [] });
      return this.fixtures.length - 1;
    };
    C.lamps.forEach((l, i) => {
      // 第十二轮:范围 11 → 9(原型里路灯只照亮灯下一圈,旁边的墙是暗的)
      this.recs.push({ L: point('torch', l.x, l.y - 0.3, l.z, new Color(255, 172, 96, 255), 9), kind: 'torch', fx: fixture(l.x, l.z), amp: 0.05, seed: 3 + i * 2.9 });
    });
    C.doorLamps.forEach((l, i) => {
      this.recs.push({ L: point('candle', l.x - 0.5, l.y, l.z, new Color(255, 178, 104, 255), 7), kind: 'candle', fx: fixture(l.x, l.z), amp: 0.05, seed: 11 + i * 3.1 });
    });
    // 第十二轮:锻炉的光范围 11 → 5.5 —— 原来整面铁匠铺都被它照成米黄(关掉它墙的亮度掉四成);原型里只亮炉口一圈和门前的地
    this.recs.push({ L: point('brazier', C.forge.x, C.forge.y + 0.3, C.forge.z, new Color(255, 132, 60, 255), 5.5), kind: 'brazier', fx: fixture(C.forge.x, C.forge.z), amp: 0.2, seed: 1.7 });
    for (let i = 0; i < 2; i += 1) {
      const L = point('hit', 0, 1.2, 0, new Color(255, 214, 160, 255), 4.5);
      L.node.active = false;
    }
    point('fill', this.lx, 2.6, this.lz, new Color(190, 206, 255, 255), 4.6);
    const moonNode = new Node('DgMoon');
    world.addChild(moonNode);
    moonNode.setPosition(-CITY_MOON.x * 80, -CITY_MOON.y * 80, -CITY_MOON.z * 80);
    moonNode.lookAt(new Vec3(0, 0, 0));
    const moon = moonNode.addComponent(DirectionalLight);
    moon.color = new Color(200, 212, 244, 255);
    moon.illuminance = DUNGEON.moon;
    this.moon = moon;
    const spots = C.bldSpots.filter((b) => bldKeys.indexOf(b.key) >= 0);
    this.bldTotal = spots.length;
    this.bldDone = 0;
    this.whenHero(() => {
      this.loadCityBuildings(world, spots);
      if (paved) {
        this.loadCityGround();
      }
    });
    this.finishBuild(world, t0);
  }

  /**
   * 地面换成原型那种大块旧石板(用户:「地面也需要和原型一样」「做地面湿反光」):石板贴图是 GPT 照原型的地面出的可平铺图,
   * 临时拷在 resources/g3d_bld/ground/;载到之后重出一遍整张地面(石板 + 罗盘纹 + 大片水膜和积水 + 落叶),换到地面材质上。
   * 倒影还是平面反射那一套:水膜和积水的地方够滑,自然映出灯、窗和炉火。
   */
  private loadCityGround(): void {
    resources.load('g3d_bld/ground/ground', ImageAsset, (err, img) => {
      const src = (img as any)?.data;
      if (err || !src || !this.floorMat) {
        console.warn('[g3dd] 石板贴图没找到(要先临时拷进 resources/g3d_bld/ground)');
        return;
      }
      const S = 512;
      const cv = document.createElement('canvas');
      cv.width = S;
      cv.height = S;
      const c = cv.getContext('2d')!;
      c.drawImage(src, 0, 0, S, S);
      const data = c.getImageData(0, 0, S, S).data;
      // 石缝比石面暗:取亮度最暗的 3% / 9% 当门槛
      const lum: number[] = [];
      let sum = 0;
      for (let p = 0; p < data.length; p += 16) {
        const l = (data[p] + data[p + 1] + data[p + 2]) / 765;
        lum.push(l);
        sum += l;
      }
      lum.sort((a, b) => a - b);
      const tile: StoneTile = { size: S, data, m: DUNGEON.paveM, j0: lum[Math.floor(lum.length * 0.03)], j1: lum[Math.floor(lum.length * 0.09)], mean: sum / lum.length, k: DUNGEON.paveK, detail: DUNGEON.paveFine };
      const gw = DUNGEON.floor;
      const g = plazaPbr(gw, Math.round((gw * CITY_GROUND.d) / CITY_GROUND.w), CITY_PLAN, tile);
      if (DUNGEON.paveFine && this.world) {
        // 第九轮:整张地面那张图一个像素 1.5 厘米,贴着地面看石面是糊的。
        // 改成:石板贴图按原始精度平铺(第二套贴图坐标 = 世界坐标 ÷ 每块几米),大片的深浅 / 水膜压暗 / 罗盘纹交给顶点色,
        // 粗糙度和积水还用整张的那张图;落叶改成贴地的小面片。
        const maps = stoneTileMaps(src, DUNGEON.tier === 'phone' ? 1024 : 2048, DUNGEON.paveM, tile.j0, tile.j1, tile.mean);
        const fm = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: true, HAS_SECOND_UV: true, ALBEDO_UV: 'v_uv1', NORMAL_UV: 'v_uv1' } as any);
        fm.setProperty('mainTexture', tex(maps.albedo, true, 16));
        fm.setProperty('normalMap', tex(maps.normal, true, 16));
        fm.setProperty('pbrMap', tex(g.orm, false, 4));
        fm.setProperty('occlusion', 1);
        fm.setProperty('roughness', DUNGEON.gloss);
        fm.setProperty('metallic', 1);
        fm.setProperty('normalStrength', DUNGEON.floorBump);
        fm.setProperty('specularIntensity', DUNGEON.paveSpec);
        // 顶点色不能大于 1(罗盘纹浅的那一半要乘到 1.6 倍):先乘 0.5 存进去,再在材质上乘回来(顶点色按 2.2 次方换算)
        const VK = 0.5;
        const back = 1 / Math.pow(VK, 2.2);
        fm.setProperty('albedoScale', new Vec3(back, back, back));
        const tintFn = plazaTint(CITY_PLAN, DUNGEON.paveK);
        const tint = (x: number, z: number): [number, number, number] => {
          const c = tintFn(x, z);
          if (CITY_V4.on) {
            const k = v4GroundTint(x, z);          // v4:碎石地偏土褐、花园偏暗绿
            return [c[0] * k[0] * VK, c[1] * k[1] * VK, c[2] * k[2] * VK];
          }
          return [c[0] * VK, c[1] * VK, c[2] * VK];
        };
        for (const n of this.groundNodes) {
          n.destroy();
        }
        this.groundNodes = [];
        const world = this.world;
        const add = (mesh: Mesh | null, mat: Material = fm): void => {
          if (mesh) {
            const gn = addMesh(world, 'DgFloor', mesh, mat, false, true);
            gn.layer = GROUND_LAYER;
            this.groundNodes.push(gn);
          }
        };
        // v4 草坪(11-20 跑图:草地底下透出石板缝):草坪另用一张没有缝的草地贴图,和街按 v4LawnField = 0.5 切开(分界是平滑斜线)
        let lawnMat: Material | null = null;
        if (CITY_V4.on) {
          const LS = DUNGEON.tier === 'phone' ? 1024 : 2048;
          const lawn = lawnTileMaps(LS, canvasMeanRGB(maps.albedo, DUNGEON.tier === 'phone' ? 1024 : 2048));
          lawnMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: true, HAS_SECOND_UV: true, ALBEDO_UV: 'v_uv1', NORMAL_UV: 'v_uv1' } as any);
          lawnMat.setProperty('mainTexture', tex(lawn.albedo, true, 16));
          lawnMat.setProperty('normalMap', tex(lawn.normal, true, 16));
          lawnMat.setProperty('pbrMap', tex(g.orm, false, 4));
          lawnMat.setProperty('occlusion', 1);
          lawnMat.setProperty('roughness', 1);
          lawnMat.setProperty('metallic', 1);
          lawnMat.setProperty('normalStrength', 0.6);
          lawnMat.setProperty('specularIntensity', 0.04);
          lawnMat.setProperty('albedoScale', new Vec3(back, back, back));
        }
        // 整片:半米一格,还是切成 8 × 6 块;罗盘纹那一块挖掉,另铺一张 4.5 厘米一格的(纹样的边才是利的)
        const G = CITY_PLAN;
        const C = G.compass;
        const hr = Math.ceil(C.r * 2 + 0.6) / 2;
        const inHole0 = (cx: number, cz: number): boolean => Math.abs(cx - C.x) < hr && Math.abs(cz - C.z) < hr;
        // v4:石板只铺在街 / 广场上,碎石地和花园另用材质(11-19 跑图:整城一种带污渍的石板,街看不出来)
        const inHole = inHole0;
        for (let iz = 0; iz < 6; iz += 1) {
          for (let ix = 0; ix < 8; ix += 1) {
            const gx0 = G.x0 + (G.w * ix) / 8;
            const gz0 = G.z0 + (G.d * iz) / 6;
            const gx1 = G.x0 + (G.w * (ix + 1)) / 8;
            const gz1 = G.z0 + (G.d * (iz + 1)) / 6;
            if (lawnMat) {
              add(MeshBatch.groundGridSplit(gx0, gz0, gx1, gz1, 0.5, G, DUNGEON.paveM, tint, v4LawnField, false, inHole));
              add(MeshBatch.groundGridSplit(gx0, gz0, gx1, gz1, 0.5, G, DUNGEON.paveM * 4, tint, v4LawnField, true, inHole), lawnMat);          // 草地贴图一张铺 4 倍大(9.6 米),不显重复
            } else {
              add(MeshBatch.groundGrid(gx0, gz0, gx1, gz1, 0.5, G, DUNGEON.paveM, tint, inHole));
            }
          }
        }
        for (let iz = 0; iz < 2; iz += 1) {
          for (let ix = 0; ix < 2; ix += 1) {
            add(MeshBatch.groundGrid(C.x - hr + hr * ix, C.z - hr + hr * iz, C.x - hr + hr * (ix + 1), C.z - hr + hr * (iz + 1), 0.045, G, DUNGEON.paveM, tint));
          }
        }
        // 第十轮:台阶能走上去了,台地顶面会被近看 —— 原来是代码画的规整浅色方砖,像地砖;铺上和广场同一套石板(高 0.905,
        // 不进平面倒影:倒影平面在 0 高度,台地上照出来会错位;积水处照天空)
        const T = CITY_TERRACE;
        const onStairs = (cx: number, cz: number): boolean => cx < T.sx1 && cz > T.z0 - 0.65 && cz < T.z1 + 0.65;
        for (const [z0, z1] of (CITY_V4.on ? [] : [[T.zn, -4], [-4, 4], [4, T.zs]])) {
          const tm = MeshBatch.groundGrid(T.x + 0.4, z0, T.x + 10.5, z1, 0.5, G, DUNGEON.paveM, tint, onStairs, T.h + 0.005);
          if (tm) {
            addMesh(world, 'DgTerraceTop', tm, fm, false, true);
          }
        }
        if (CITY_V4.on) {
          // v4 上城顶面:同一套石板(按地面类别柔和上色)铺在 3 米高处,多边形外的格子不出面
          for (let bz = -110; bz < -10; bz += 25) {
            for (let bx = -110; bx < 110; bx += 32) {
              const tm = MeshBatch.groundGridSplit(bx, bz, bx + 32, bz + 25, 0.5, G, DUNGEON.paveM, tint, v4LawnField, false, v4OffUpper, V4_UPPER_H + 0.005);
              if (tm) {
                addMesh(world, 'DgTerraceTop', tm, fm, false, true);
              }
              const tl = lawnMat ? MeshBatch.groundGridSplit(bx, bz, bx + 32, bz + 25, 0.5, G, DUNGEON.paveM * 4, tint, v4LawnField, true, v4OffUpper, V4_UPPER_H + 0.005) : null;
              if (tl && lawnMat) {
                addMesh(world, 'DgTerraceTop', tl, lawnMat, false, true);
              }
            }
          }
        }
        this.floorMat = fm;
        this.applyReflection();
        const leafMat = material('builtin-standard', { USE_VERTEX_COLOR: true });
        leafMat.setProperty('roughness', 1);
        leafMat.setProperty('metallic', 0);
        leafMat.setProperty('specularIntensity', 0.04);
        for (const lm of (CITY_V4.on ? [] : MeshBatch.groundLeaves(plazaLeaves(CITY_PLAN), 16, mulberry32(679)))) {          // v4 是春夏绿,不铺满地红叶
          addMesh(world, 'DgGroundLeaf', lm, leafMat, false, true);
        }
        this.wildWet = (x: number, z: number): boolean => wetAt(g.wet, CITY_PLAN, x, z);
        console.log('[g3dd] 石板地面(细节版)', JSON.stringify({ j0: +tile.j0.toFixed(3), j1: +tile.j1.toFixed(3), mean: +tile.mean.toFixed(3), nodes: this.groundNodes.length }));
        return;
      }
      this.floorMat.setProperty('mainTexture', tex(g.albedo, false, 16));
      this.floorMat.setProperty('normalMap', tex(g.normal, false, 16));
      this.floorMat.setProperty('pbrMap', tex(g.orm, false, 4));
      this.floorMat.setProperty('specularIntensity', DUNGEON.paveSpec);
      this.wildWet = (x: number, z: number): boolean => wetAt(g.wet, CITY_PLAN, x, z);
      console.log('[g3dd] 石板地面', JSON.stringify({ j0: +tile.j0.toFixed(3), j1: +tile.j1.toFixed(3), mean: +tile.mean.toFixed(3) }));
    });
  }

  /**
   * 把「图转 3D」的建筑模型摆进场景:模型的大小、朝向都是平台随意给的,所以量一下包围盒,缩放到占地那么宽、底面落地、中心对到占地中心。
   * 每个模型另有一份手调的修正(BLD_FIX:转多少度、再放大多少、挪多少),调的时候用 __dg.bld('smithy', { yaw: 90 })。
   */
  private loadCityBuildings(world: Node, all: Array<{ key: string; id: string; x: number; z: number; yaw: number; w: number; d: number; y?: number; h?: number; front?: boolean; far?: boolean }>): void {
    // 手机档不摆背景房子(远处第二排 / 街口尽头 / 教堂两侧台地,共十五栋;每栋 5 万面)
    const spots = DUNGEON.tier === 'phone' ? all.filter((s) => !s.far) : all;
    if (spots.length !== all.length) {
      this.bldDone += all.length - spots.length;
      this.updateLoadEl();
    }
    // 模型文件里的预制体路径带着它自己的节点名(g3d_bld/<键>/<键>/<节点名>),所以先问资源表
    const infos = ((resources as any).getDirWithPath('g3d_bld', Prefab) as Array<{ path: string }>) ?? [];
    for (const sp of spots) {
      const info = infos.find((i) => i.path.split('/')[1] === sp.key);
      resources.load(info ? info.path : `g3d_bld/${sp.key}/${sp.key}`, Prefab, (err, prefab) => {
        this.bldDone += 1;
        this.updateLoadEl();
        if (err || !prefab) {
          console.warn('[g3dd] 建筑模型没找到(要先临时拷进 resources/g3d_bld)', sp.key);
          return;
        }
        const pivot = new Node(`DgBld_${sp.id}`);
        world.addChild(pivot);
        const model = instantiate(prefab);
        pivot.addChild(model);
        const mn = new Vec3(1e9, 1e9, 1e9);
        const mx = new Vec3(-1e9, -1e9, -1e9);
        const p = new Vec3();
        let tris = 0;
        for (const mr of model.getComponentsInChildren(MeshRenderer)) {
          mr.shadowCastingMode = sp.far || !DUNGEON.bldShadow ? MeshRenderer.ShadowCastingMode.OFF : MeshRenderer.ShadowCastingMode.ON;          // 远处 / 背景的房子不投影子;核显档建筑都不投
          mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
          const fx = BLD_FIX[sp.key];
          this.glowFromAlbedo(mr, DUNGEON.bldGlow * (fx?.glow ?? 1), fx?.tone);
          // 同一种民房摆了好几栋:每栋按名字定一个深浅 / 冷暖(±8%),绕一圈不那么像复制的
          const al = fx?.a ?? 1;
          const house = sp.key.startsWith('house');
          let hsh = 0;
          for (let i = 0; i < sp.id.length; i += 1) {
            hsh = (hsh * 31 + sp.id.charCodeAt(i)) % 9973;
          }
          const vr = house ? 0.92 + ((hsh % 17) / 16) * 0.16 : 1;
          const warm = house ? (((hsh >> 3) % 9) / 8 - 0.5) * 0.08 : 0;
          let ab = fx?.ab ?? [1, 1, 1];
          if (CITY_V4.on) {
            // v4 偏彩色(11-19 用户:整体太暗、往彩色打磨、参考燕云十六声的色调):民房按名字挑一种墙面色调,整体压一点(屋顶别发白)
            const PAL: Array<[number, number, number]> = [[1.04, 0.94, 0.8], [1.0, 0.86, 0.68], [1.02, 0.86, 0.82], [0.9, 0.96, 0.84], [0.95, 0.94, 0.92], [0.98, 0.9, 0.78]];
            const pc = house ? PAL[hsh % PAL.length] : [1.0, 0.95, 0.88];
            ab = [ab[0] * pc[0] * 0.86, ab[1] * pc[1] * 0.86, ab[2] * pc[2] * 0.86];
          }
          const tint = new Vec3(al * vr * (1 + warm) * ab[0], al * vr * ab[1], al * vr * (1 - warm) * ab[2]);
          for (let i = 0; i < mr.sharedMaterials.length; i += 1) {
            if (al !== 1 || house || fx?.ab || CITY_V4.on) {
              mr.getMaterialInstance(i)?.setProperty('albedoScale', tint);
            }
            if (fx?.metal !== undefined) {
              mr.getMaterialInstance(i)?.setProperty('metallic', fx.metal);
            }
            if (fx?.spec !== undefined) {
              mr.getMaterialInstance(i)?.setProperty('specularIntensity', fx.spec);
            }
          }
          const st = mr.mesh?.struct;
          if (!st || !st.minPosition || !st.maxPosition) {
            continue;
          }
          for (const sub of st.primitives) {
            tris += (sub.indexView ? sub.indexView.count : 0) / 3;
          }
          const wm = mr.node.worldMatrix;
          for (let i = 0; i < 8; i += 1) {
            p.set(i & 1 ? st.maxPosition.x : st.minPosition.x, i & 2 ? st.maxPosition.y : st.minPosition.y, i & 4 ? st.maxPosition.z : st.minPosition.z);
            Vec3.transformMat4(p, p, wm);
            Vec3.min(mn, mn, p);
            Vec3.max(mx, mx, p);
          }
        }
        const size = { x: mx.x - mn.x, y: mx.y - mn.y, z: mx.z - mn.z };
        model.setPosition(-(mn.x + mx.x) / 2, -mn.y, -(mn.z + mx.z) / 2);
        this.cityBld[sp.id] = { pivot, spot: sp, size, tris: Math.round(tris) };
        this.tuneBld(sp.id, {});
        console.log('[g3dd] 建筑模型', sp.id, JSON.stringify({ size, tris: Math.round(tris) }));
      });
    }
  }

  /**
   * 模型的窗是画在颜色贴图上的,自己不发光,暗处发闷。把颜色贴图里「暖黄、够亮」的地方(亮着的窗、炉膛里的炭)抠出来当发光贴图:
   * 窗在暗处自己亮,墙和木头不受影响。k = 发光的强度。
   */
  private glowFromAlbedo(mr: MeshRenderer, k: number, tone?: [number, number, number]): void {
    if (k <= 0) {
      return;
    }
    for (let i = 0; i < mr.sharedMaterials.length; i += 1) {
      try {
        const src = mr.sharedMaterials[i];
        const img = (src?.getProperty('mainTexture') as any)?.image?.data;
        if (!src || !img) {
          continue;
        }
        let glow = this.glowCache.get(img);
        if (!glow) {
        const S = 1024;
        const cv = document.createElement('canvas');
        cv.width = S;
        cv.height = S;
        const c = cv.getContext('2d')!;
        c.drawImage(img, 0, 0, S, S);
        const d = c.getImageData(0, 0, S, S);
        const p = d.data;
        for (let j = 0; j < p.length; j += 4) {
          const r = p[j];
          const g = p[j + 1];
          const b = p[j + 2];
          const warm = r > 150 && r - b > 85 && g > r * 0.42 && g < r * 0.9;
          const m = warm ? Math.min(1, (r - 150) / 60) * Math.min(1, (r - b - 85) / 45) : 0;
          p[j] = r * m;
          p[j + 1] = g * m * 0.9;
          p[j + 2] = b * m * 0.6;
          p[j + 3] = 255;
        }
        c.putImageData(d, 0, 0);
        glow = tex(cv, false, 4);
        this.glowCache.set(img, glow);
        }
        const mi = mr.getMaterialInstance(i)!;
        mi.recompileShaders({ USE_EMISSIVE_MAP: true });
        mi.setProperty('emissiveMap', glow);
        mi.setProperty('emissive', tone ? new Color(Math.round(255 * tone[0]), Math.round(255 * tone[1]), Math.round(255 * tone[2]), 255) : new Color(255, 255, 255, 255));
        mi.setProperty('emissiveScale', new Vec3(k, k, k));
      } catch (error) {
        console.warn('[g3dd] 建筑模型的发光贴图没做成', error);
      }
    }
  }

  /** 调一栋建筑模型的摆法(转多少度、再放大多少、挪多少);不传的项用 BLD_FIX 里登记的。返回现在的值。 */
  tuneBld(key: string, o: { yaw?: number; k?: number; dx?: number; dy?: number; dz?: number; sx?: number; sy?: number; wf?: number }): unknown {
    const b = this.cityBld[key];
    if (!b) {
      return null;
    }
    const fix = Object.assign(BLD_FIX[key] ?? (BLD_FIX[key] = { ...(BLD_FIX[b.spot.key] ?? { yaw: 0, k: 1, dx: 0, dy: 0, dz: 0 }) }), o);
    const turned = Math.abs(Math.round(fix.yaw / 90)) % 2 === 1;
    const k = (b.spot.h ? b.spot.h / b.size.y : b.spot.w / (turned ? b.size.z : b.size.x)) * fix.k;
    // 占位给的是正面那条线的中点:顺着正面的反方向退半个进深
    const back = b.spot.front ? ((turned ? b.size.x : b.size.z) * k) / 2 : 0;
    const ya = (b.spot.yaw * Math.PI) / 180;
    const sx = fix.sx ?? 1;
    // sy = 高矮;wf = 只把正面加宽(模型自己的坐标里:转了 ±90° 的,正面宽对的是 z)
    let sy = fix.sy ?? 1;
    if (fix.sy === undefined && b.spot.key.startsWith('house')) {
      let hsh = 0;
      for (let i = 0; i < key.length; i += 1) {
        hsh = (hsh * 37 + key.charCodeAt(i)) % 7919;
      }
      sy = 0.95 + ((hsh % 11) / 10) * 0.12;
    }
    const wf = fix.wf ?? 1;
    b.pivot.setScale(k * sx * (turned ? 1 : wf), k * sy, k * sx * (turned ? wf : 1));
    b.pivot.setRotationFromEuler(0, b.spot.yaw + fix.yaw, 0);
    b.pivot.setPosition(b.spot.x - Math.sin(ya) * back + fix.dx, (b.spot.y ?? 0) + fix.dy, b.spot.z - Math.cos(ya) * back + fix.dz);
    return { fix, size: b.size, scale: k, tris: b.tris };
  }

  /** 主城每帧的小动静:锻炉冒的烟、从枫树上飘下来的红叶、路灯下打转的飞蛾、贴地的一点薄雾、落在积水里的水滴。 */
  private cityFx(R: (a: number, b: number) => number): void {
    const fx = this.fx!;
    const f = BRAZIERS[0];
    if (f && R(0, 1) < 0.25) {
      const sm = this.citySmoke;
      fx.emit({ x: sm.x + R(-0.2, 0.2), y: sm.y, z: sm.z + R(-0.2, 0.2), vx: R(0.1, 0.4), vy: R(0.6, 1.0), vz: R(-0.1, 0.1), life: R(3.5, 6), s0: 0.5, s1: 2.2,
        c0: [0.2, 0.2, 0.22], a: 0.08, cell: R(0, 1) < 0.5 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: R(0, 6), drag: 0.3, fadeIn: 0.25 });
    }
    if (R(0, 1) < 0.12) {
      const t = CITY_PLAN.trees[Math.floor(R(0, CITY_PLAN.trees.length - 0.001))];
      fx.emit({ x: t[0] + R(-3, 3), y: R(3.5, 7), z: t[1] + R(-3, 3), vx: R(0.2, 0.7), vy: R(-0.5, -0.25), vz: R(-0.3, 0.3), life: R(5, 8), s0: R(0.04, 0.06), s1: 0.04,
        c0: [0.42, 0.1, 0.06], c1: [0.3, 0.1, 0.06], a: 0.95, cell: FX_CELL.mote, add: false, grav: 0.12, drag: 0.6, fadeIn: 0.1 });
    }
    if (R(0, 1) < 0.1 && this.cityLamps.length) {
      const l = this.cityLamps[Math.floor(R(0, this.cityLamps.length - 0.001))];
      fx.emit({ x: l.x + R(-0.5, 0.5), y: l.y + R(-0.4, 0.5), z: l.z + R(-0.5, 0.5), vx: R(-0.6, 0.6), vy: R(-0.3, 0.3), vz: R(-0.6, 0.6), life: R(1, 2.2), s0: 0.014, s1: 0.01,
        c0: [1, 0.86, 0.6], a: 0.5, cell: FX_CELL.mote, drag: 0.4, fadeIn: 0.2 });
    }
    if (R(0, 1) < 0.06 * DUNGEON.mist) {
      fx.emit({ x: R(X0 - 2, X1 + 2), y: R(0.25, 0.6), z: R(Z0 - 2, Z1 + 2), vx: R(0.1, 0.25), vz: R(-0.05, 0.05), life: R(7, 12), s0: R(2.4, 3.6), s1: R(3.6, 5),
        c0: [0.18, 0.23, 0.34], a: 0.035, cell: R(0, 1) < 0.5 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: R(0, 6), drag: 0, fadeIn: 0.3 });
    }
    if (R(0, 1) < 0.12 && this.wildWet) {
      for (let i = 0; i < 6; i += 1) {
        const x = R(X0, X1);
        const z = R(Z0, Z1);
        if (this.wildWet(x, z)) {
          fx.decal('atlas', FX_CELL.ring, x, z, 0.03, R(0.12, 0.2), R(0.4, 0.65), [0.55, 0.6, 0.7], 0.07, 0.05, 0.1, 0, 0.012);
          break;
        }
      }
    }
  }

  /**
   * 野外场景:枯木林里的废弃营地(雨后的夜里)。几何在 G3DWild.ts,贴图在 G3DWildTex.ts;这里配材质、灯、天空。
   * 做法和地宫一样:一张不平铺的大地面贴图(积水的地方是镜面,倒影用平面反射)、程序材质、月光投影 + 几盏局部的灯、后期。
   */
  private buildWild(world: Node, rnd: () => number, t0: number): void {
    // 先画地面(顺带得到「哪儿有积水」),再摆东西:草不长在水里,芦苇长在水边
    const t1 = performance.now();
    const gw = DUNGEON.floor;
    const ground = mudPbr(gw, Math.round((gw * WILD_GROUND.d) / WILD_GROUND.w), WILD_PLAN);
    this.stats.floorMs = Math.round(performance.now() - t1);
    this.wildWet = (x: number, z: number): boolean => wetAt(ground.wet, WILD_PLAN, x, z);
    const W = buildWildScene(rnd, X0, X1, Z0, Z1, this.wildWet);
    this.solids.push(...W.solids);
    BRAZIERS.splice(0, BRAZIERS.length, ...W.fires);          // 火的特效和声音认这张表:野外就是那堆篝火
    this.wildLanterns = W.lanterns;
    const std = (p: Pbr, repeat: boolean, aniso: number, vertexColor = true): Material => {
      const m = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: vertexColor });
      m.setProperty('mainTexture', tex(p.albedo, repeat, aniso));
      m.setProperty('normalMap', tex(p.normal, repeat, aniso));
      m.setProperty('pbrMap', tex(p.orm, repeat, Math.min(4, aniso)));
      m.setProperty('occlusion', 1);
      m.setProperty('roughness', 1);
      m.setProperty('metallic', 1);
      return m;
    };
    const floorMat = std(ground, false, 16, false);
    floorMat.setProperty('specularIntensity', 0.2);          // 泥地的高光压低:迎着月光看,整片地面会泛白得像雪
    floorMat.setProperty('normalStrength', DUNGEON.floorBump);
    floorMat.setProperty('roughness', DUNGEON.gloss);
    this.floorMat = floorMat;
    const TK = DUNGEON.texK;
    const stoneMat = std(masonryPbr(Math.round(1024 * TK)), true, 8);
    stoneMat.setProperty('albedoScale', new Vec3(0.86, 0.88, 0.9));
    const rockP = rockPbr(Math.round(512 * TK));
    const rockMat = std(rockP, true, 8);
    rockMat.setProperty('albedoScale', new Vec3(0.62, 0.64, 0.68));
    rockMat.setProperty('normalStrength', 0.4);          // 岩石贴图里的细裂纹太强的话,近看像刻了一圈圈的字
    // 树皮:不用那张粗糙度图(沟里的粗糙度很低,月光下整棵树一道道反白),粗糙度给一个固定的高值
    const barkP = barkPbr(Math.round(512 * TK), true);
    const barkMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    barkMat.setProperty('mainTexture', tex(barkP.albedo, true, 8));
    barkMat.setProperty('normalMap', tex(barkP.normal, true, 8));
    barkMat.setProperty('roughness', 0.88);
    barkMat.setProperty('metallic', 0);
    barkMat.setProperty('normalStrength', 0.7);
    barkMat.setProperty('albedoScale', new Vec3(0.62, 0.58, 0.55));
    const woodMat = std(woodPbr(Math.round(512 * TK)), true, 8);
    woodMat.setProperty('albedoScale', new Vec3(0.66, 0.62, 0.58));
    const ironMat = std(ironPbr(256), true, 4);
    const endMat = std(endGrainPbr(256), true, 4);
    endMat.setProperty('albedoScale', new Vec3(0.6, 0.56, 0.5));
    endMat.setProperty('normalStrength', 0.45);
    const canvasMat = std(canvasPbr(Math.round(512 * TK)), true, 4);
    canvasMat.setProperty('albedoScale', new Vec3(0.42, 0.4, 0.38));
    const grassMat = material('builtin-standard', { USE_VERTEX_COLOR: true });
    grassMat.setProperty('roughness', 0.92);
    grassMat.setProperty('metallic', 0);
    // 场地外面那一圈泥地:用岩石那张贴图压成深棕色平铺(远、暗、有雾,看不出是同一张)
    const skirtMat = std(rockP, true, 4, false);
    skirtMat.setProperty('albedoScale', new Vec3(0.2, 0.17, 0.14));
    skirtMat.setProperty('normalStrength', 0.9);
    this.stats.texMs = Math.round(performance.now() - t1);

    // ── 地面:中间一块(带积水倒影)+ 外面一圈往上起的坡 ──
    for (const m of MeshBatch.groundTiles(WILD_GROUND.x0, WILD_GROUND.z0, WILD_GROUND.w, WILD_GROUND.d, 8, 5)) {
      const gn = addMesh(world, 'DgFloor', m, floorMat, false, true);
      gn.layer = GROUND_LAYER;
      this.groundNodes.push(gn);
    }
    const skirt = new Sculpt();
    skirt.surf(96, 10, (u, v, out) => skirtPoint(u, v, out), { den: 0.22, closeU: true });
    for (const m of skirt.build()) {
      addMesh(world, 'DgSkirt', m, skirtMat, false, true);
    }
    let tris = 0;
    const parts: Array<[MeshBatch, Material, string, boolean]> = [[W.stone, stoneMat, 'DgStone', true], [W.rock, rockMat, 'DgRock', true], [W.bark, barkMat, 'DgBark', true], [W.endgrain, endMat, 'DgEndGrain', true], [W.wood, woodMat, 'DgWood', true],
      [W.iron, ironMat, 'DgIron', true], [W.canvas, canvasMat, 'DgCanvas', true], [W.grass, grassMat, 'DgGrass', false]];
    for (const [batch, mat, name, cast] of parts) {
      for (const m of batch.build()) {
        addMesh(world, name, m, mat, cast, true);
      }
      tris += batch.triangles;
    }
    this.stats.sceneTris = tris;

    // ── 远处的林子:两圈画着枯树剪影的弧面(一近一远,错开),靠雾接到天上 ──
    for (const [rad, hgt, seed, count, y0] of [[36, 13, 3, 46, 0.6], [50, 19, 9, 60, 1.5]] as Array<[number, number, number, number, number]>) {
      const line = new Sculpt();
      line.surf(48, 1, (u, v, out) => {
        const a = u * Math.PI * 2;
        out.set(Math.cos(a) * rad * 1.15, y0 + v * hgt, Math.sin(a) * rad * 0.85);
      }, { uv01: true, twoSided: true });
      const lm = material('builtin-unlit', { USE_TEXTURE: true }, 1);
      lm.setProperty('mainTexture', tex(paintTreeline(2048, 256, seed, count), true, 4));
      lm.setProperty('mainColor', new Color(255, 255, 255, 255));
      lm.setProperty('tilingOffset', new Quat(rad > 40 ? 3 : 2, 1, 0, 0) as any);
      for (const m of line.build()) {
        addMesh(world, 'DgTreeline', m, lm, false, false);
      }
    }

    // ── 发光的东西:篝火的炭、提灯的玻璃,各带一小团光晕 ──
    const quad = MeshBatch.quad();
    const glowTex = tex(paintGlow(128, 2.2), false, 1);
    const halo = (x: number, y: number, z: number, size: number, color: Color, k: number): void => {
      const m = material('builtin-unlit', { USE_TEXTURE: true }, 2);
      m.setProperty('mainTexture', glowTex);
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      const n = addMesh(world, 'DgHalo', quad, m, false, false);
      n.setPosition(x, y, z);
      n.setScale(size, size, 1);
      this.halos.push(n);
    };
    const emissive = (color: Color, k: number): Material => {
      const m = material('builtin-unlit', {});
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      return m;
    };
    const coalMat = emissive(new Color(255, 96, 28, 255), 3.2);
    for (const m of W.coal.build()) {
      addMesh(world, 'DgCoal', m, coalMat, false, false);
    }
    const paneMat = emissive(new Color(255, 196, 120, 255), 3.4);
    for (const m of W.pane.build()) {
      addMesh(world, 'DgPane', m, paneMat, false, false);
    }
    for (const f of W.fires) {
      halo(f.x, 0.7, f.z, 2.4, new Color(255, 150, 70, 255), 0.4);
    }
    for (const l of W.lanterns) {
      halo(l.x, l.y, l.z, 0.9, new Color(255, 190, 120, 255), 0.3);
    }

    // ── 灯:篝火一盏、提灯各一盏(都带一点忽明忽暗)、命中时闪一下的两盏、跟着主角的一盏很弱的补光 ──
    const point = (kind: string, x: number, y: number, z: number, color: Color, range: number): PointLight => {
      const n = new Node(`DgLight_${kind}`);
      world.addChild(n);
      n.setPosition(x, y, z);
      const L = n.addComponent(PointLight);
      L.color = color;
      L.range = range * DUNGEON.rangeK;
      L.luminousFlux = 0;
      this.lights[kind].push(L);
      return L;
    };
    const fixture = (x: number, z: number): number => {
      this.fixtures.push({ x, z, w: 1, on: true, d: 0, fake: [] });
      return this.fixtures.length - 1;
    };
    W.fires.forEach((f, i) => {
      this.recs.push({ L: point('brazier', f.x, 0.95, f.z, new Color(255, 140, 64, 255), 12), kind: 'brazier', fx: fixture(f.x, f.z), amp: 0.2, seed: i * 3.7 });
    });
    W.lanterns.forEach((l, i) => {
      this.recs.push({ L: point('torch', l.x, l.y - 0.12, l.z, new Color(255, 176, 100, 255), 8), kind: 'torch', fx: fixture(l.x, l.z), amp: 0.08, seed: 5 + i * 2.9 });
    });
    for (let i = 0; i < 2; i += 1) {
      const L = point('hit', 0, 1.2, 0, new Color(255, 214, 160, 255), 4.5);
      L.node.active = false;
    }
    point('fill', this.lx, 2.6, this.lz, new Color(190, 206, 255, 255), 4.6);
    const moonNode = new Node('DgMoon');
    world.addChild(moonNode);
    moonNode.setPosition(-WILD_MOON.x * 60, -WILD_MOON.y * 60, -WILD_MOON.z * 60);
    moonNode.lookAt(new Vec3(0, 0, 0));
    const moon = moonNode.addComponent(DirectionalLight);
    moon.color = new Color(160, 190, 255, 255);
    moon.illuminance = DUNGEON.moon;
    this.moon = moon;
    this.finishBuild(world, t0);
  }

  // ───────────────────────── 角色 ─────────────────────────
  /** 主角到了以后再做(已经到了就马上做)。 */
  private whenHero(fn: () => void): void {
    if (this.heroSettled) {
      fn();
    } else {
      this.afterHero.push(fn);
    }
  }

  private settleHero(): void {
    if (this.heroSettled) {
      return;
    }
    this.heroSettled = true;
    const list = this.afterHero;
    this.afterHero = [];
    list.forEach((fn) => fn());
    this.updateLoadEl();
  }

  /** 屏幕上方一行小字:主角载入中 / 建筑模型 n / m;都到齐了就拿掉。 */
  private updateLoadEl(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const heroWait = !this.heroSettled && hasChar('hero_m');
    const bldWait = this.bldTotal > 0 && this.bldDone < this.bldTotal;
    if (!heroWait && !bldWait) {
      this.loadEl?.remove();
      this.loadEl = null;
      return;
    }
    if (!this.loadEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9998;padding:6px 16px;border-radius:14px;'
        + 'background:rgba(12,16,24,.62);border:1px solid rgba(255,255,255,.18);color:#e8eefc;font:500 15px/20px sans-serif;pointer-events:none;letter-spacing:1px';
      document.body.appendChild(el);
      this.loadEl = el;
    }
    this.loadEl.textContent = heroWait ? '角色载入中,稍等片刻就能操作…' : `建筑模型载入中 ${this.bldDone} / ${this.bldTotal}(可以先走动)`;
  }

  private loadChars(): void {
    const keys = charKeys();
    this.updateLoadEl();
    const spawn = (key: string, x: number, z: number, height: number, yaw: number, done: (c: G3DChar) => void, procWalk = false, fail?: () => void): void => {
      if (keys.indexOf(key) < 0) {
        fail?.();
        return;
      }
      loadChar(key, (tpl) => {
        if (!tpl || !this.world || !this.world.isValid) {
          fail?.();
          return;
        }
        const c = G3DChar.spawn(tpl, this.world, { at: new Vec3(x, 0, z), height, yaw, baked: false, albedo: 0.9, procWalk, inPlace: true });
        c.seed = x * 1.7 + z;
        this.stats.charTris = (this.stats.charTris ?? 0) + c.tris;
        done(c);
      });
    };
    spawn('hero_m', this.lx, this.lz, 1.78, 0, (c) => {
      this.leader = c;
      // 剑盾包(单手剑,11-18 用户嫌大剑佝偻)的片段叫 ss_*:也走「动作库片段 + 剑固定在右手」这条路
      this.gs = !!c.moves && (!!c.anim?.getState(GS_STAND) || !!c.anim?.getState('ss_stand'));
      if (this.gs) {
        c.inPlace = false;          // 这批片段的位移已经抽掉了,剩下的是身体的晃动,要留着
      }
      this.loco('idle', 0);
      this.settleHero();
    }, false, () => this.settleHero());
    this.whenHero(() => this.loadCrew(spawn));
  }

  /** 主角以外的角色:队友、镇民(主城)或怪(地宫 / 野外)。等主角到了再下。 */
  private loadCrew(spawn: (key: string, x: number, z: number, height: number, yaw: number, done: (c: G3DChar) => void, procWalk?: boolean, fail?: () => void) => void): void {
    if (!this.world || !this.world.isValid) {
      return;
    }
    const keys = charKeys();
    // 第十三轮:主城里队友和主角并排、隔开一点(原型里两人分站在罗盘纹两侧);别的场景照旧跟在身后
    const OB = this.city ? 0.3 : 1.0;
    const OZ = this.city ? 1.9 : 0.9;
    spawn('hero_f', this.lx - OB, this.lz + OZ, 1.68, 0, (c) => {
      this.followers.push({ c, x: this.lx - OB, z: this.lz + OZ, yaw: 0, moving: false, ox: -OB, oz: OZ });
      c.play(c.clip('idle'), 0);
    });
    if (this.city) {
      // 镇民:手头有哪个角色模型就用哪个(都是站着不动的);站的地方当成挡路的
      const pool = ['sorcerer', 'nyx', 'hero_f'].filter((k) => keys.indexOf(k) >= 0);
      this.cityNpcSpots.forEach((n, i) => {
        if (!pool.length) {
          return;
        }
        const key = pool[i % pool.length];
        spawn(key, n.x, n.z, key === 'sorcerer' ? 1.8 : 1.68, n.yaw, (c) => {
          this.npcs.push(c);
          c.play(c.clip('idle'), 0);
        });
        this.solids.push({ x: n.x, z: n.z, hx: 0.3, hz: 0.3, h: 1.8 });
      });
      return;
    }
    const mob = (key: string, x: number, z: number, height: number, hp: number, speed: number, reach: number, radius: number, procWalk = false): void => {
      if (this.mobCount >= DUNGEON.maxMobs) {
        return;
      }
      this.mobCount += 1;
      spawn(key, x, z, height, 180, (c) => {
        const m: Mob = { c, home: new Vec3(x, 0, z), x, z, yaw: 180, hp: hp * 3, maxHp: hp * 3, speed, reach, radius, state: 'idle', t: this.rnd() * 3, cool: 0, wander: 1 + this.rnd() * 3, tx: x, tz: z };
        this.mobs.push(m);
        this.rest(m);
      }, procWalk);
    };
    // 先每种放一只,再补同种的第二、三只(档位限了数量时,少的是重复的那几只)
    mob('rat', -0.6, -1.6, 0.46, 2, 2.3, 0.9, 0.35);
    mob('wolf', 3.2, 1.9, 0.98, 4, 2.9, 1.2, 0.5);
    mob('spider2', 3.6, 4.4, 0.74, 3, 2.0, 1.1, 0.5);
    mob('bear', 6.4, -2.2, 1.62, 7, 1.7, 2.3, 1.15, true);      // 熊身子长:占的圈和够得着的距离都按身长给,不然头会顶进主角身子里
    mob('rotbear', 7.6, 0.4, 2.3, 12, 1.4, 2.8, 1.45);
    mob('rat', 0.5, -2.3, 0.42, 2, 2.4, 0.9, 0.35);
    mob('wolf', 4.6, 0.6, 1.06, 4, 2.8, 1.2, 0.5);
    mob('rat', 1.2, -1.2, 0.5, 2, 2.2, 0.9, 0.35);
  }

  /** 怪站着不动:有待机动作就播,没有就站在绑定姿势上(叠呼吸)。 */
  private rest(m: Mob): void {
    const idle = m.c.clip('idle');
    if (idle) {
      if (m.c.cur !== idle) {
        m.c.play(idle, 0.2);
      }
    } else if (!m.c.rest || m.c.pwalk) {
      m.c.toRest(false);
    }
  }

  private walk(m: Mob): void {
    const w = m.c.procWalk ? '' : m.c.clip('walk') || m.c.clip('run');
    if (w) {
      if (m.c.cur !== w) {
        m.c.play(w, 0.2);
      }
    } else if (!m.c.pwalk) {
      m.c.toRest(true);
    }
  }

  // ───────────────────────── 接管画面 ─────────────────────────
  private takeOver(): void {
    const scene = director.getScene()!;
    const canvas = scene.getComponentInChildren(Canvas);
    const uiCam = canvas?.cameraComponent ?? null;
    const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    const mainLight = scene.getChildByName('Main Light')?.getComponent(DirectionalLight) ?? null;
    const amb = scene.globals.ambient;
    const sh = scene.globals.shadows;
    const sky = scene.globals.skybox;
    this.saved = { uiCam, mainCam, mainLight };
    for (const c of [uiCam, mainCam]) {
      if (c) {
        c.enabled = false;
      }
    }
    if (mainLight) {
      mainLight.enabled = false;
    }
    // 界面相机关了,但界面节点还在收点击(登录页的按钮):盖一层挡住
    if (canvas && !this.blocker) {
      const b = new Node('DgBlockInput');
      const ui = b.addComponent(UITransform);
      ui.setContentSize(8000, 8000);
      b.addComponent(BlockInputEvents);
      canvas.node.addChild(b);
      this.blocker = b;
    }
    amb.skyLightingColor = DUNGEON.bake ? new Color(255, 255, 255, 255) : new Color(70, 92, 140, 255);
    amb.groundLightingColor = DUNGEON.bake ? new Color(255, 255, 255, 255) : new Color(46, 36, 30, 255);
    amb.skyIllum = DUNGEON.bake ? DUNGEON.bakeAmb : DUNGEON.ambient;
    if (this.outdoor) {
      // 天空那张图存不下大于 1 的数,而这套灯光是高动态的(月光几十万):天空要看得见,只能把「环境光的照度」整体抬高(skyK),
      // 再把天 / 地两个环境光颜色按同样的倍数压回去 —— 物体受到的环境光不变,天空和积水里的倒影变亮
      const k = DUNGEON.ambient / DUNGEON.skyK;
      // 主城的环境光没那么蓝(原型是不偏色的夜,暖光只来自灯和窗)
      const ac = this.city ? [108, 118, 150] : [92, 116, 170];
      amb.skyLightingColor = new Color(Math.round(ac[0] * k * 2.55) / 2.55, Math.round(ac[1] * k * 2.55) / 2.55, Math.round(ac[2] * k * 2.55) / 2.55, 255);
      amb.groundLightingColor = new Color(40 * k, 38 * k, 40 * k, 255);
      amb.skyIllum = DUNGEON.skyK;
      try {
        // 夜空:很暗的天顶、略亮的地平线、月亮那一侧有一团光、一层被月光照亮边缘的云。同一张图也当环境反射(积水里反出来的就是它)
        const sk = this.city ? DUNGEON.citySky : 1;          // 主城的天整体亮一些(月色更亮,看得见云)
        const c = (r: number, g: number, b: number): [number, number, number] => [r * sk, g * sk, b * sk];
        // 第十二轮:主城的天偏灰不偏蓝(原型),月亮周围的光团小而淡
        const C = this.city;
        sky.envmap = buildSkyCube({ zenith: C ? c(0.014, 0.018, 0.03) : c(0.012, 0.02, 0.045), horizon: C ? c(0.05, 0.06, 0.08) : c(0.05, 0.075, 0.125), horizonAway: C ? c(0.034, 0.04, 0.055) : c(0.03, 0.045, 0.08), ground: c(0.012, 0.014, 0.018),
          sunDir: C ? CITY_MOON_SKY : [-WILD_MOON.x, -WILD_MOON.y, -WILD_MOON.z], sunColor: C ? c(0.04, 0.045, 0.06) : c(0.5, 0.62, 0.9), sunSize: C ? 0.04 : 0.045,
          cloud: C ? c(0.2, 0.215, 0.26) : c(0.12, 0.16, 0.25), cloudShade: C ? c(0.045, 0.05, 0.065) : c(0.018, 0.024, 0.045), cover: this.city ? 0.5 : 0.56, cloudScale: this.city ? 1.3 : 1.6, size: 256, seed: this.city ? 11 : 5 });
        (sky as any).envLightingType = 1;
        sky.enabled = true;
      } catch (error) {
        console.warn('[g3dd] sky cube', error);
      }
    } else try {
      // 环境反射:很暗的房间 + 几团灯的方向(铁、铜、湿石头靠它才有反光)
      const lobes = [
        { dir: [OC.x, 9, OC.z] as [number, number, number], color: [0.9, 1.1, 1.5] as [number, number, number], width: 0.2 },
        ...LAMPS.map((L) => ({ dir: [L.x, 2, L.z] as [number, number, number], color: [0.5, 0.75, 1.0] as [number, number, number], width: 0.18 })),
        ...BRAZIERS.map((b) => ({ dir: [b.x, 0.6, b.z] as [number, number, number], color: [1.2, 0.5, 0.16] as [number, number, number], width: 0.26 })),
        { dir: [X0, 1, 0] as [number, number, number], color: [1.1, 0.14, 0.08] as [number, number, number], width: 0.24 },
        { dir: [X1, 1, 0] as [number, number, number], color: [0.16, 0.9, 0.4] as [number, number, number], width: 0.22 },
      ];
      // 环境反射的亮度 = 这张图 × 环境光的照度:烘焙时环境光被当成载体放大了上千倍,这张图要同比例压回去
      const ek = DUNGEON.bake ? DUNGEON.ambient / DUNGEON.bakeAmb : 1;
      const lk = DUNGEON.bake ? ek * DUNGEON.bakeEnv : 1;
      for (const lobe of lobes) {
        lobe.color = [lobe.color[0] * lk, lobe.color[1] * lk, lobe.color[2] * lk];
      }
      sky.envmap = buildEnvCube(lobes, [0.02 * ek, 0.025 * ek, 0.035 * ek], [0.03 * ek, 0.035 * ek, 0.045 * ek], [0.02 * ek, 0.02 * ek, 0.022 * ek], 64);
      (sky as any).envLightingType = 1;
    } catch (error) {
      console.warn('[g3dd] env cube', error);
    }
    sh.enabled = DUNGEON.shadow > 0;
    if (DUNGEON.shadow > 0) {
      const moon = this.moon!;
      sh.type = renderer.scene.ShadowType.ShadowMap;
      sh.shadowMapSize = DUNGEON.shadow;
      moon.shadowEnabled = true;
      moon.shadowPcf = renderer.scene.PCFType.SOFT_2X;
      moon.shadowBias = 0.0004;
      moon.shadowNormalBias = 0.02;
      moon.shadowFixedArea = true;
      moon.shadowNear = 1;
      moon.shadowFar = DUNGEON.cityFull ? 320 : this.outdoor ? 160 : 90;
      moon.shadowOrthoSize = DUNGEON.cityFull ? 86 : this.city ? 40 : this.wild ? 26 : 17;          // 整城:罩住城墙一圈
    }
    this.applyLights();
    // 后期:沿用野外那套,数值按「暗房间、亮灯」重新给
    const cfg: PostCfg = { ...POST_CFG,
      aoRadius: 0.55, aoIntensity: 1.9, aoStrength: 0.86, aoTint: [0.04, 0.05, 0.08],
      bloomThreshold: 1.0, bloomIntensity: 0.78, bloomScatter: 0.82,
      exposure: 0.96, contrast: 1.17, pivot: 0.18, toe: 0.05, saturation: 1.1, shoulder: 0.72,
      shadowTint: [0.94, 1.0, 1.08], highlightTint: [1.04, 1.0, 0.96],
      vignette: 0.34, vignetteStart: 0.45, vignetteEnd: 1.1,
      fog: true, fogColor: [0.055, 0.085, 0.14], fogAway: [0.055, 0.085, 0.14], fogStart: 2, fogDensity: 0.075, fogMax: 0.66, fogLobe: 0 };
    if (this.city) {
      // 主城:广场大、要看得到教堂的塔尖,雾更淡;远处的屋顶剪影靠它推远
      Object.assign(cfg, { fogColor: [0.045, 0.065, 0.115], fogAway: [0.045, 0.065, 0.115], fogStart: 14, fogDensity: 0.009, fogMax: 0.85, vignette: 0.3, aoRadius: 0.7, bloomIntensity: 0.55, exposure: 1.0, contrast: 1.05, saturation: 0.86, shadowTint: [0.94, 0.99, 1.08], highlightTint: [0.98, 1.0, 1.03] });          // 第十二轮:原型整体偏冷 (56,57,65),我们偏暖 (76,72,74) → 暗部 / 亮部都往冷调、饱和度 0.94 → 0.86          // 第十一轮:原型整体反差小、暗处看得清 → 反差 1.17 → 1.05、曝光 0.95 → 1.05
    } else if (this.wild) {
      // 野外:看得远,雾淡一些、但远处要吃得掉(林子的剪影靠它接到天上)
      Object.assign(cfg, { fogColor: [0.1, 0.15, 0.25], fogAway: [0.1, 0.15, 0.25], fogStart: 4, fogDensity: DUNGEON.wildFog, fogMax: 0.93, vignette: 0.3, aoRadius: 0.7, bloomIntensity: 0.55, exposure: 0.9 });
    }
    if (CITY_V4.on && this.city) {
      // v4 白天的调色:不压黑、对比略低、饱和度适中;暗部偏蓝、亮部偏暖;雾很淡(俯视全城时不罩灰)
      Object.assign(cfg, { exposure: 0.98, saturation: 1.08, contrast: 0.96, toe: 0.02, shadowTint: [0.93, 0.99, 1.08], highlightTint: [1.04, 1.0, 0.94],
        bloomIntensity: 0.3, fogColor: [0.62, 0.7, 0.8], fogAway: [0.62, 0.7, 0.8], fogMax: 0.12, vignette: 0.18 });
    }
    cfg.ao = DUNGEON.ao;
    cfg.bloomLevels = DUNGEON.bloomLevels;
    this.post = new FieldPost(this.cam!, cfg);
    if (DUNGEON.post > 0) {
      this.post.enable(DUNGEON.post);
      if (DUNGEON.postScale > 0) {
        this.post.set({ scale: DUNGEON.postScale });
      }
      this.fitPixBudget();
    }
    this.applyReflection();
    this.buildBar();
    if (DUNGEON.hud && typeof document !== 'undefined' && !this.hudEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;pointer-events:none;color:#d6e6ff;font:12px/1.5 monospace;background:rgba(0,0,0,.45);padding:2px 8px;border-radius:4px;white-space:pre';
      document.body.appendChild(el);
      this.hudEl = el;
    }
    this.syncCam(0);
  }

  applyLights(): void {
    const k = DUNGEON.fluxK;
    const set = (kind: string, v: number): void => {
      for (const L of this.lights[kind]) {
        L.luminousFlux = v * k;
      }
    };
    set('fill', DUNGEON.fill);
    this.stepLights(0);
    for (const S of this.spots) {
      S.shadowEnabled = DUNGEON.spotShadow;
      if (DUNGEON.spotShadow) {
        S.shadowPcf = renderer.scene.PCFType.SOFT_2X;
        S.shadowBias = 0.0005;
        S.shadowNormalBias = 0.02;
      }
    }
    this.coneMat?.setProperty('colorScale', new Vec3(DUNGEON.cone, DUNGEON.cone, DUNGEON.cone));
    this.floorMat?.setProperty('normalStrength', DUNGEON.floorBump);
    if (this.moon) {
      this.moon.illuminance = DUNGEON.moon;
    }
    director.getScene()!.globals.ambient.skyIllum = DUNGEON.bake ? DUNGEON.bakeAmb : this.outdoor ? DUNGEON.skyK : DUNGEON.ambient;
    this.shaftMat?.setProperty('colorScale', new Vec3(DUNGEON.shaft, DUNGEON.shaft, DUNGEON.shaft));
    this.floorMat?.setProperty('roughness', DUNGEON.gloss);
    if (CITY_V4.on && this.city) {
      // 主城 v4 白天(11-19 用户发燕云十六声参考图):暖白的太阳 + 很亮的淡蓝天光(影子透亮、带点蓝)、地面反上来一点草绿
      const amb = director.getScene()!.globals.ambient;
      amb.skyLightingColor = new Color(156, 188, 236, 255);
      amb.groundLightingColor = new Color(110, 118, 90, 255);
      if (this.moon) {
        this.moon.color = new Color(255, 242, 224, 255);
      }
    }
  }

  applyReflection(): void {
    const RP: any = js.getClassByName('cc.ReflectionProbe');
    if (!RP) {
      return;
    }
    if (DUNGEON.reflect && !this.probeNode) {
      const pn = new Node('DgProbe');
      this.world!.addChild(pn);
      pn.setPosition(0, 0, 0);
      const probe: any = pn.addComponent(RP);
      probe.sourceCamera = this.cam;
      probe.probeType = renderer.scene.ProbeType.PLANAR;
      probe.visibility = Layers.Enum.DEFAULT;
      this.probeNode = pn;
    }
    if (this.probeNode) {
      this.probeNode.active = DUNGEON.reflect;
    }
    for (const n of this.groundNodes) {
      (n.getComponent(MeshRenderer) as any).bakeSettings.reflectionProbe = DUNGEON.reflect ? 2 : 0;
    }
  }

  // ───────────────────────── 输入 ─────────────────────────
  /**
   * 输入直接听画布的指针事件和窗口的键盘事件(不走引擎的输入:界面那一层会把点击吞掉)。
   * 键鼠:WASD / 方向键走,右键拖动转镜头,滚轮缩放,J / 左键出手。
   * 触屏:左半屏按住拖动 = 摇杆(走),右半屏拖动 = 转镜头,右半屏点一下 = 出手。
   */
  /** 声音从哪来:按离主角多远算音量、按在镜头的左边还是右边算声像。 */
  private heard(x: number, z: number): { gain: number; pan: number } {
    const d = Math.hypot(x - this.lx, z - this.lz);
    const a = ((this.view.yaw + this.swing) * Math.PI) / 180;
    const side = (x - this.lx) * Math.cos(a) - (z - this.lz) * Math.sin(a);
    return { gain: 1 / (1 + (d / 7) * (d / 7)), pan: Math.max(-0.8, Math.min(0.8, side / 6)) };
  }

  private bindInput(): void {
    // 浏览器要等用户点过 / 按过键才允许出声
    // 键盘一律在 window 的「捕获」阶段收:引擎在画布上也听键盘,而且会 stopPropagation —— 用户点过一下画面、焦点落到画布上以后,
    // 冒泡阶段的监听就再也收不到按键(11-18 线上「WASD 和技能键没反应」就是这个)
    window.addEventListener('keydown', () => sfx.unlock(), true);
    window.addEventListener('pointerdown', () => sfx.unlock(), true);
    const cv = game.canvas;
    if (!cv || typeof window === 'undefined') {
      return;
    }
    const KEY: Record<string, number> = { KeyW: KeyCode.KEY_W, KeyA: KeyCode.KEY_A, KeyS: KeyCode.KEY_S, KeyD: KeyCode.KEY_D,
      ArrowUp: KeyCode.ARROW_UP, ArrowDown: KeyCode.ARROW_DOWN, ArrowLeft: KeyCode.ARROW_LEFT, ArrowRight: KeyCode.ARROW_RIGHT };
    window.addEventListener('keydown', (e) => {
      const SK: Record<string, string> = { KeyJ: 'attack', KeyK: 'dash', KeyL: 'whirl', KeyU: 'smash', KeyI: 'wave' };
      if (SK[e.code]) {
        if (!e.repeat) {
          this.input(SK[e.code]);
        }
        return;
      }
      const k = KEY[e.code];
      if (k !== undefined) {
        this.keys.add(k);
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      const k = KEY[e.code];
      if (k !== undefined) {
        this.keys.delete(k);
      }
    }, true);
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect();
      const touch = e.pointerType !== 'mouse';
      let kind: 'stick' | 'cam' | null = null;
      if (touch) {
        const left = (e.clientX - r.left) / Math.max(1, r.width) < 0.42;
        let hasStick = false;
        this.ptrs.forEach((p) => {
          hasStick = hasStick || p.kind === 'stick';
        });
        kind = left && !hasStick ? 'stick' : 'cam';
      } else if (e.button === 2) {
        kind = 'cam';
      } else if (e.button === 0) {
        this.attack();
      }
      if (kind) {
        this.ptrs.set(e.pointerId, { kind, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, t: performance.now(), moved: 0, touch });
        try {
          cv.setPointerCapture(e.pointerId);
        } catch (error) {
          // 有的浏览器不让抓:不抓也能用,只是手指滑出画布会断
        }
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) {
        return;
      }
      const r = cv.getBoundingClientRect();
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX;
      p.y = e.clientY;
      if (p.kind === 'cam') {
        const k = 1920 / Math.max(320, r.width);
        this.view.yaw -= dx * 0.22 * k;
        this.view.pitch = Math.max(-4, Math.min(70, this.view.pitch + dy * 0.16 * k));
      } else {
        const R = Math.max(36, r.height * 0.12);
        let vx = (p.x - p.ox) / R;
        let vy = (p.y - p.oy) / R;
        const len = Math.hypot(vx, vy);
        if (len > 1) {
          vx /= len;
          vy /= len;
        }
        this.stick.x = vx;
        this.stick.y = -vy;
      }
    });
    const up = (e: PointerEvent): void => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) {
        return;
      }
      this.ptrs.delete(e.pointerId);
      if (p.kind === 'stick') {
        this.stick.x = 0;
        this.stick.y = 0;
      } else if (p.touch && e.type === 'pointerup' && performance.now() - p.t < 240 && p.moved < 14) {
        this.attack();
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      this.view.dist = Math.max(1.6, Math.min(11, this.view.dist * (e.deltaY < 0 ? 0.9 : 1.1)));
      e.preventDefault();
    }, { passive: false });
  }

  /**
   * 地面的假倒影高光:把灯对着地面镜像过去,镜头到「镜像的灯」这条线和地面的交点就是倒影该出现的位置;
   * 在那儿贴一条沿着视线方向拉长的光斑(湿而不平的地面上,倒影就是朝着人拉长的一条)。镜头越低拉得越长。
   */
  private stepGlints(): void {
    const mesh = this.glintMesh;
    if (!mesh) {
      return;
    }
    mesh.begin();
    const cam = this.cam!.node.worldPosition;
    const K = DUNGEON.glint;
    if (K > 0 && cam.y > 0.05) {
      for (const g of this.glints) {
        const t = cam.y / (cam.y + g.y);
        const px = cam.x + (g.x - cam.x) * t;
        const pz = cam.z + (g.z - cam.z) * t;
        if (px < X0 + 0.2 || px > X1 - 0.2 || pz < Z0 + 0.2 || pz > Z1 - 0.2 || (px > DAIS.x - 0.1 && Math.abs(pz) < Z1 - 0.8)) {
          continue;      // 落在墙外 / 石台上:不画
        }
        let dx = px - cam.x;
        let dz = pz - cam.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          continue;
        }
        dx /= d;
        dz /= d;
        // 掠射角越小(镜头低、离得远)倒影越亮、拉得越长
        const graze = d / Math.hypot(d, cam.y);
        // 大小按「离镜头多远」给(倒影在画面上占的角度大致不变:远处的看着不会比近处的小一截)
        const len = Math.max(0.25, d * 0.34 * (0.5 + 0.5 * graze));
        const wid = Math.max(0.07, d * 0.05 * (g.w / 0.5));
        const a = K * g.k * (0.22 + 0.78 * graze * graze * graze) * 2.6;
        // 四个角:沿视线方向(dx, dz)是长边,垂直方向是宽
        const sx = -dz * wid;
        const sz = dx * wid;
        const y = 0.022;
        mesh.quad(px - dx * len - sx, y, pz - dz * len - sz, px - dx * len + sx, y, pz - dz * len + sz,
          px + dx * len + sx, y, pz + dz * len + sz, px + dx * len - sx, y, pz + dz * len - sz, 0, 0, 1, 1, g.r * a, g.g * a, g.b * a, 1);
      }
    }
    mesh.end();
  }

  /** 烘焙用的灯表:位置和亮度照着「灯」那一段里真灯的摆法抄一份(聚光按点光的二十五分之一折算,这是对着画面校出来的)。 */
  private collectBakeLights(): void {
    const out = this.bakeLights;
    const K = DUNGEON.fluxK;
    const add = (x: number, y: number, z: number, c: [number, number, number], flux: number, range: number, spot?: BakeLight['spot']): void => {
      if (flux > 0) {
        out.push({ x, y, z, r: lin(c[0]), g: lin(c[1]), b: lin(c[2]), flux, range, spot });
      }
    };
    for (const L of LAMPS) {
      add(L.x, 3.6, L.z + L.nz * 0.78, [150, 204, 255], DUNGEON.lamp * K, 6.5);
      const dl = Math.hypot(3.6, 2.6);
      add(L.x, 3.6, L.z + L.nz * 0.7, [150, 204, 255], (DUNGEON.lampSpot * K) / 25, 11,
        { dx: 0, dy: -3.6 / dl, dz: (L.nz * 2.6) / dl, c0: Math.cos((28 * Math.PI) / 180), c1: Math.cos((68 * Math.PI) / 180) });
    }
    for (const b of BRAZIERS) {
      add(b.x, 1.9, b.z, [255, 146, 72], DUNGEON.brazier * K, 7.5);
    }
    add(X0 - 0.9, 2.1, 0, [255, 52, 38], DUNGEON.gate * K, 9);
    add(10.2, DAIS.h + 1.5, 0, [60, 255, 140], DUNGEON.rune * K * 2.4, 7.5);
    add(HALL.x + 0.4, 1.9, Z1 + HALL.depth - 1.1, [255, 132, 56], DUNGEON.torch * K, 9);
    add(RING.x, 1.4, RING.z, [150, 190, 255], DUNGEON.bounce * K, 7.5);
    for (const px of PILLAR_X) {
      for (const z of [-2.15, 2.15]) {
        add(px + 0.75, 1.96, z, [255, 170, 92], DUNGEON.candle * K, 3.8);
      }
    }
  }

  /**
   * 某一点、朝某个方向的面上,固定的灯加上原来那份环境光一共有多亮 —— 换算成「乘在颜色上的倍数」(对着 bakeAmb 那份载体环境光)。
   * 不算遮挡(真灯里除了月光也都不投影,一致)。返回的是线性的倍数。
   */
  bakeAt(x: number, y: number, z: number, nx: number, ny: number, nz: number): [number, number, number] {
    // 原来的环境光:天光色和地光色按朝向混
    const k = 0.5 + 0.5 * ny;
    let r = DUNGEON.ambient * (lin(46) + (lin(70) - lin(46)) * k) * 0.42;
    let g = DUNGEON.ambient * (lin(36) + (lin(92) - lin(36)) * k) * 0.4;
    let b = DUNGEON.ambient * (lin(30) + (lin(140) - lin(30)) * k) * 0.34;
    for (const L of this.bakeLights) {
      const dx = L.x - x;
      const dy = L.y - y;
      const dz = L.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const d = Math.sqrt(d2);
      if (d >= L.range) {
        continue;
      }
      const ndl = (dx * nx + dy * ny + dz * nz) / (d || 1);
      const wrap = Math.max(0, (ndl + 0.2) / 1.2);
      if (wrap <= 0) {
        continue;
      }
      const q = (d / L.range) ** 4;
      let e = (L.flux / (4 * Math.PI * (d2 + 0.06))) * wrap * (1 - q) * (1 - q);
      if (DUNGEON.bakeShadow && d > 0.6) {
        // 遮挡:灯取三个点(本身、左右各偏 0.22 米)各连一条线到这一点,数有几条被实心东西挡住 → 影子的边是软的
        const ox = (-dz / (Math.hypot(dx, dz) || 1)) * 0.22;
        const oz = (dx / (Math.hypot(dx, dz) || 1)) * 0.22;
        let open = 0;
        for (let sI = -1; sI <= 1; sI += 1) {
          if (!this.blockedRay(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, L.x + ox * sI, L.y, L.z + oz * sI)) {
            open += 1;
          }
        }
        e *= open / 3;
        if (open === 0) {
          continue;
        }
      }
      if (L.spot) {
        const c = -(dx * L.spot.dx + dy * L.spot.dy + dz * L.spot.dz) / (d || 1);
        const t = Math.min(1, Math.max(0, (c - L.spot.c1) / (L.spot.c0 - L.spot.c1)));
        e *= t * t * (3 - 2 * t);
      }
      r += e * L.r;
      g += e * L.g;
      b += e * L.b;
    }
    const A = DUNGEON.bakeAmb / DUNGEON.bakeGain;
    return [r / A, g / A, b / A];
  }

  /** 从 a 到 b 这条线段有没有被实心东西挡住(柱子、石棺、火盆、木箱、木桶的包围盒;两头各让出一点,自己不挡自己)。 */
  private blockedRay(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (const s of this.solids) {
      let t0 = 0.04;
      let t1 = 0.94;
      const slab = (o: number, d: number, lo: number, hi: number): boolean => {
        if (Math.abs(d) < 1e-7) {
          return o > lo && o < hi;
        }
        let a = (lo - o) / d;
        let b = (hi - o) / d;
        if (a > b) {
          const c = a;
          a = b;
          b = c;
        }
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        return t0 < t1;
      };
      // 柱子的登记盒比柱身大一圈(给镜头碰撞留的边),算遮挡时往里收
      const k = s.h > 3 ? 0.66 : 0.9;
      if (slab(ax, dx, s.x - s.hx * k, s.x + s.hx * k) && slab(az, dz, s.z - s.hz * k, s.z + s.hz * k) && slab(ay, dy, -0.5, s.h)) {
        return true;
      }
    }
    return false;
  }

  /** 把一批网格细分、逐顶点乘上算好的光(顶点颜色是按显示用的颜色存的,所以乘之前先开方回去)。不开烘焙时什么都不做。 */
  private bakeBatch(batch: MeshBatch, subdivide = true, boost = 1): void {
    if (!DUNGEON.bake) {
      return;
    }
    if (subdivide) {
      refine(batch, DUNGEON.bakeEdge);
    }
    const b = batch as unknown as { positions: number[]; normals: number[]; colors: number[] };
    const P = b.positions;
    const N = b.normals;
    const C = b.colors;
    for (let i = 0; i < P.length / 3; i += 1) {
      const c = this.bakeAt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      C[i * 4] *= Math.pow(c[0] * boost, 1 / 2.2);
      C[i * 4 + 1] *= Math.pow(c[1] * boost, 1 / 2.2);
      C[i * 4 + 2] *= Math.pow(c[2] * boost, 1 / 2.2);
    }
  }

  /**
   * 灯按远近切换:有真灯的灯位里,离主角最近的 realLights 处亮真灯,其余只留假光斑;权重渐变,不跳。
   * 所有受管的灯的亮度都在这里算(配置值 × 火光抖动 × 权重)。dt = 0(定格 / 刚改完配置)时直接到位。
   */
  private stepLights(dt: number): void {
    const fxs = this.fixtures;
    if (!fxs.length) {
      return;
    }
    const cfg = DUNGEON as unknown as Record<string, number>;
    let fxp = this.lx;
    let fzp = this.lz;
    if (this.free) {
      fxp = this.free.pos.x;
      fzp = this.free.pos.z;
    }
    const lit = new Set<number>();
    for (const r of this.recs) {
      if (r.fx >= 0 && cfg[r.kind] > 0) {
        lit.add(r.fx);
      }
    }
    const cand: Fixture[] = [];
    fxs.forEach((f, i) => {
      if (lit.has(i)) {
        f.d = Math.hypot(f.x - fxp, f.z - fzp) * (f.on ? 0.85 : 1);     // 已经亮着的打八五折:站在两盏之间不来回跳
        cand.push(f);
      } else {
        f.on = false;
      }
    });
    cand.sort((a, b) => a.d - b.d);
    cand.forEach((f, i) => {
      f.on = i < DUNGEON.realLights;
    });
    for (const f of fxs) {
      const target = f.on ? 1 : 0;
      f.w = dt > 0 ? f.w + (target - f.w) * Math.min(1, dt * 3) : target;
      if (Math.abs(target - f.w) < 0.01) {
        f.w = target;
      }
      for (const g of f.fake) {
        const k = g.k * (1 - f.w) * DUNGEON.fake;
        g.node.active = k > 0.002;
        if (g.node.active) {
          g.mat.setProperty('colorScale', _v.set(k, k, k));
        }
      }
    }
    const t = this.time;
    for (const r of this.recs) {
      const w = r.fx >= 0 ? fxs[r.fx].w : 1;
      const flick = r.amp ? 1 + r.amp * (0.5 * Math.sin(t * 9.7 + r.seed) + 0.3 * Math.sin(t * 23.1 + r.seed * 2.3) + 0.2 * Math.sin(t * 41.7 + r.seed * 5.1)) : 1;
      const flux = cfg[r.kind] * DUNGEON.fluxK * flick * w * (DUNGEON.bake ? DUNGEON.realK : 1);
      const on = flux > 1;
      if (r.L.node.active !== on) {
        r.L.node.active = on;
      }
      if (on) {
        r.L.luminousFlux = flux;
      }
    }
  }

  attack(): boolean {
    return this.input('attack');
  }

  /**
   * 出手:attack = 普攻(连着按是四连),dash / whirl / smash / wave = 四个技能。
   * 正在出别的招时先记下来(只记最后一次),等那一招过了「可以接下一招」的点再出 —— 提前按也不丢。
   */
  input(kind: string): boolean {
    if (!this.leader) {
      return false;
    }
    if (kind !== 'attack' && this.cd[kind] > 0) {
      return false;
    }
    if (this.act) {
      this.queued = kind;
      return true;
    }
    this.startAct(kind);
    return true;
  }

  /** 主角的待机 / 跑:有动作库的那批片段时用双手持剑的架势。 */
  private loco(kind: 'idle' | 'run', fade: number): void {
    const c = this.leader;
    if (!c) {
      return;
    }
    if (this.gs) {
      c.play(kind === 'idle' ? GS_STAND : GS_RUN, fade, true);
      if (kind === 'run') {
        c.setSpeed(0.86);          // 片段是按 4.5 米/秒跑的,这里走 3.6
      }
      return;
    }
    c.play(kind === 'idle' ? c.clip('idle') : c.clip('run') || c.clip('walk'), fade);
  }

  private startAct(kind: string): void {
    const c = this.leader!;
    let move: Move | null = null;
    let dur = 1.05;
    if (kind === 'attack') {
      if (this.time > this.comboUntil) {
        this.comboI = 0;
      }
      const combo = this.gs ? GS_COMBO : COMBO;
      move = combo[this.comboI % combo.length];
      this.comboI += 1;
    } else if (kind === 'smash') {
      this.cd.smash = 7;
      move = this.gs ? GS_SKILLS.smash : null;
    } else {
      move = (this.gs ? GS_SKILLS : SKILLS)[kind];
      this.cd[kind] = kind === 'dash' ? 3 : kind === 'whirl' ? 6 : 4;
    }
    if (move) {
      dur = move.clip ? move.dur / Math.max(0.3, DUNGEON.pace) : move.dur;
    }
    // 出手前转向:推着方向就朝那边,否则朝最近的怪(3.4 米以内有的话)
    const K = this.keys;
    let ix = (K.has(KeyCode.KEY_D) || K.has(KeyCode.ARROW_RIGHT) ? 1 : 0) - (K.has(KeyCode.KEY_A) || K.has(KeyCode.ARROW_LEFT) ? 1 : 0);
    let iy = (K.has(KeyCode.KEY_W) || K.has(KeyCode.ARROW_UP) ? 1 : 0) - (K.has(KeyCode.KEY_S) || K.has(KeyCode.ARROW_DOWN) ? 1 : 0);
    if (Math.hypot(this.stick.x, this.stick.y) > 0.22) {
      ix = this.stick.x;
      iy = this.stick.y;
    }
    let best: Mob | null = null;
    let bd = kind === 'dash' ? 6.5 : 3.4;
    for (const m of this.mobs) {
      const d = Math.hypot(m.x - this.lx, m.z - this.lz) - m.radius;
      if (m.state !== 'down' && m.state !== 'gone' && d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) {
      this.lyaw = (Math.atan2(-(best.z - this.lz), best.x - this.lx) * 180) / Math.PI;
    } else if (ix || iy) {
      const a = (this.view.yaw * Math.PI) / 180;
      const wx = ix * Math.cos(a) - iy * Math.sin(a);
      const wz = -ix * Math.sin(a) - iy * Math.cos(a);
      this.lyaw = (Math.atan2(-wz, wx) * 180) / Math.PI;
    }
    this.act = { kind, move, dur, t: 0, done: [], yaw0: this.lyaw, adv: 0, advR: 0, hit: new Set(), fired: false };
    this.swung = [];
    if (kind === 'dash') {
      sfx.play('dash', { dur: dur * 0.75 });
    }
    this.queued = null;
    this.auto = null;
    this.moving = false;
    if (move && !move.clip) {
      c.play(c.clip('idle'), 0.08);
    }
    c.place(this.lx, this.leaderY + this.floorY(this.lx, this.lz), this.lz, this.lyaw);
  }

  // ───────────────────────── 每帧 ─────────────────────────
  /** 脚下地面的高度:主城教堂前的台地 / 台阶(别处都是 0)。 */
  private floorY(x: number, z: number): number {
    return this.city ? cityFloorY(x, z) : 0;
  }

  /** 后期离屏的放大倍数按像素预算压:画布(高分屏上 = 窗口 × 设备像素比)× 倍数² 不超过 pixBudget。 */
  private fitPixBudget(): void {
    const cv = game.canvas;
    if (!this.post || !cv || DUNGEON.pixBudget <= 0) {
      return;
    }
    const px = Math.max(1, cv.width * cv.height);
    const want = (this.post.info().cfg as { scale: number }).scale;
    const cap = Math.sqrt(DUNGEON.pixBudget / px);
    const k = Math.max(this.minScale(), Math.min(want, cap, this.qScale));
    if (Math.abs(k - want) > 0.01) {
      this.post.set({ scale: +k.toFixed(3) });
      console.log('[g3dd] 渲染倍数按像素预算压到', k.toFixed(2), JSON.stringify({ canvas: [cv.width, cv.height], budget: DUNGEON.pixBudget, gpu: GPU_NAME.slice(0, 80) }));
    }
  }

  private qScale = 9;

  /** 自动降分辨率的下限:离屏至少 90 万像素(大约 1270×710),再低画面就糊了。 */
  private minScale(): number {
    const cv = game.canvas;
    const px = cv ? Math.max(1, cv.width * cv.height) : 2073600;
    return Math.min(1, Math.max(0.35, Math.sqrt(900000 / px)));
  }
  private qSlow = 0;
  private qCool = 0;
  private qSteps: string[] = [];
  private qSince = 0;

  /**
   * 帧率持续偏低(平均 < 42 帧满 3 秒)就降一级,每降一级等 3 秒再看:关倒影 → 灯 2 盏 → 小物件不投影 → 关遮蔽 → 泛光 3 级 → 最后才降分辨率(离屏最低约 90 万像素);
   * 帧率富余(> 56 满 6 秒)且分辨率被降过,就往回升一级。
   * 刚打开的前 8 秒(模型还在下载、着色器在编译)和截图 / 录屏逐帧推的时候不算。
   */
  private autoQuality(): void {
    if (!DUNGEON.autoQ || this.fixedDt > 0 || this.frozen || !this.opened || !this.post) {
      return;
    }
    if (!this.qSince) {
      this.qSince = performance.now();
    }
    if (performance.now() - this.qSince < 8000 || (this.bldTotal > 0 && this.bldDone < this.bldTotal)) {
      return;
    }
    if (this.qCool > 0) {
      this.qCool -= 0.5;
      return;
    }
    const cur = (this.post.info().cfg as { scale: number }).scale;
    // 帧率富余(平均 > 56 满 6 秒)而且分辨率是被降下来的:往回升一级(不超过像素预算),免得一直糊着
    this.qFast = this.fps > 56 ? this.qFast + 0.5 : 0;
    if (this.qFast >= 6 && this.qScale < 9) {
      this.qFast = 0;
      const cv = game.canvas;
      const cap = cv ? Math.sqrt(DUNGEON.pixBudget / Math.max(1, cv.width * cv.height)) : 1;
      const up = Math.min(cap, (this.post.info().cfg as { scale: number }).scale * 1.15);
      if (up > cur + 0.01) {
        this.qScale = up;
        this.post.set({ scale: +up.toFixed(3) });
        this.qSteps.push(`分辨率回升×${up.toFixed(2)}`);
        this.qCool = 3;
      }
      return;
    }
    this.qSlow = this.fps < DUNGEON.autoQFps ? this.qSlow + 0.5 : 0;
    if (this.qSlow < 3) {
      return;
    }
    this.qSlow = 0;
    this.qCool = 3;
    const pc = this.post.info().cfg as { ao: boolean; bloomLevels: number };
    const floor = this.minScale();
    // 第十五轮(11-18 用户笔记本:分辨率降到底还是 21 帧,画面却糊了):核显上卡的是几何(灯 / 阴影把场景多画好几遍),
    // 所以先砍几何(倒影 → 灯 → 小物件不投影)、再关遮蔽 / 泛光,分辨率放到最后
    if (DUNGEON.reflect) {
      this.set({ reflect: false });
      this.qSteps.push('关倒影');
    } else if (DUNGEON.realLights > 2) {
      this.set({ realLights: 2 });
      this.qSteps.push('灯 2 盏');
    } else if (!this.qCastCut) {
      this.qCastCut = true;
      this.cutSmallCasters();
      this.qSteps.push('小物件不投影');
    } else if (pc.ao) {
      this.post.set({ ao: false });
      this.qSteps.push('关遮蔽');
    } else if (pc.bloomLevels > 3) {
      this.post.set({ bloomLevels: 3 });
      this.qSteps.push('泛光 3 级');
    } else if (cur > floor + 0.01) {
      this.qScale = Math.max(floor, cur * 0.85);
      this.post.set({ scale: +this.qScale.toFixed(3) });
      this.qSteps.push(`分辨率×${this.qScale.toFixed(2)}`);
    } else {
      return;
    }
    console.log('[g3dd] 帧率偏低(', this.fps.toFixed(0), '帧),自动降一级:', this.qSteps[this.qSteps.length - 1]);
  }

  private qFast = 0;
  private qCastCut = false;

  // ── 自动测速(地址带 &bench=1;11-18 用户笔记本 Arc 140V:分辨率升回 1737×923 后只剩 12 帧 —— 我在独显上量的「卡在几何」套不到核显,
  //    要在用户机器上逐项关掉看帧数变多少,才知道到底卡在哪)──
  private benchState: 'off' | 'wait' | 'run' | 'done' = param('bench') === '1' ? 'wait' : 'off';
  private benchAt = 0;
  private benchEl: HTMLDivElement | null = null;

  /** 帧率统计那里每半秒调一次:模型都到齐、再等 6 秒,开始测。 */
  private maybeBench(): void {
    if (this.benchState !== 'wait' || !this.opened || (this.bldTotal > 0 && this.bldDone < this.bldTotal)) {
      return;
    }
    if (!this.benchAt) {
      this.benchAt = performance.now() + 6000;
      return;
    }
    if (performance.now() >= this.benchAt) {
      this.benchState = 'run';
      void this.runBench();
    }
  }

  /** 量 ms 毫秒内的平均帧时长和最慢一帧(先空等 settle 毫秒,让上一项的改动生效、着色器编译完)。 */
  private measureFrames(settle: number, ms: number): Promise<{ fps: number; avg: number; worst: number }> {
    return new Promise((resolve) => {
      const t0 = performance.now() + settle;
      let last = 0;
      let n = 0;
      let sum = 0;
      let worst = 0;
      const tick = (now: number): void => {
        if (now >= t0) {
          if (last) {
            const d = now - last;
            sum += d;
            n += 1;
            worst = Math.max(worst, d);
          }
          last = now;
        }
        if (now - t0 < ms || n < 5) {
          requestAnimationFrame(tick);
        } else {
          const avg = sum / Math.max(1, n);
          resolve({ fps: 1000 / avg, avg, worst });
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private async runBench(): Promise<void> {
    const post = this.post;
    if (!post || typeof document === 'undefined') {
      this.benchState = 'done';
      return;
    }
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:12px;top:12px;z-index:10000;pointer-events:none;color:#e8f0ff;font:14px/1.6 monospace;background:rgba(0,0,0,.78);padding:10px 14px;border-radius:6px;white-space:pre';
    document.body.appendChild(el);
    this.benchEl = el;
    const cv = game.canvas;
    const cfg0 = post.info().cfg as { scale: number; ao: boolean; bloom: boolean; bloomLevels: number };
    const scale0 = cfg0.scale;
    const lights0 = DUNGEON.realLights;
    const moon = this.moon;
    const shadow0 = !!moon?.shadowEnabled;
    const blds: Node[] = [];
    this.world?.walk((nd) => {
      if (nd.name.startsWith('DgBld_')) {
        blds.push(nd);
      }
    });
    const chars: Node[] = [this.leader?.node, ...this.followers.map((f) => f.c.node)].filter((n): n is Node => !!n);
    const res = (k: number): string => (cv ? `${Math.round(cv.width * k)}×${Math.round(cv.height * k)}` : '?');
    type Step = { name: string; on: () => void; off: () => void };
    const steps: Step[] = [
      { name: '现状', on: () => undefined, off: () => undefined },
      { name: '关遮蔽(AO)', on: () => post.set({ ao: false }), off: () => post.set({ ao: cfg0.ao }) },
      { name: '关泛光', on: () => post.set({ bloom: false }), off: () => post.set({ bloom: cfg0.bloom }) },
      { name: '关月光阴影', on: () => { if (moon) { moon.shadowEnabled = false; } }, off: () => { if (moon) { moon.shadowEnabled = shadow0; } } },
      { name: '灯 0 盏', on: () => this.set({ realLights: 0 }), off: () => this.set({ realLights: lights0 }) },
      { name: '藏起建筑', on: () => blds.forEach((n) => { n.active = false; }), off: () => blds.forEach((n) => { n.active = true; }) },
      { name: '藏起角色', on: () => chars.forEach((n) => { n.active = false; }), off: () => chars.forEach((n) => { n.active = true; }) },
      { name: `分辨率×0.7(${res(scale0 * 0.7)})`, on: () => post.set({ scale: +(scale0 * 0.7).toFixed(3) }), off: () => post.set({ scale: scale0 }) },
      { name: `分辨率×0.5(${res(scale0 * 0.5)})`, on: () => post.set({ scale: +(scale0 * 0.5).toFixed(3) }), off: () => post.set({ scale: scale0 }) },
      { name: '关全部后期', on: () => this.set({ post: 0 }), off: () => { this.set({ post: 2 }); post.set({ scale: scale0, ao: cfg0.ao, bloom: cfg0.bloom }); } },
      { name: '全关(后期 / 阴影 / 灯)', on: () => { this.set({ post: 0, realLights: 0 }); if (moon) { moon.shadowEnabled = false; } },
        off: () => { this.set({ post: 2, realLights: lights0 }); post.set({ scale: scale0, ao: cfg0.ao, bloom: cfg0.bloom }); if (moon) { moon.shadowEnabled = shadow0; } } },
    ];
    const head = `自动测速(请别动鼠标键盘,约 ${Math.ceil(steps.length * 4.5)} 秒)\n${GPU_NAME.slice(0, 70)}\n画布 ${cv ? `${cv.width}×${cv.height}` : '?'} · 设备像素比 ${typeof window !== 'undefined' ? window.devicePixelRatio : '?'} · 渲染 ${res(scale0)} · ${TIER_NAME[DUNGEON.tier] ?? DUNGEON.tier} · 真灯 ${lights0}\n`;
    const rows: string[] = [];
    const out: Array<{ name: string; fps: number; avg: number; worst: number }> = [];
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      el.textContent = `${head}${rows.join('\n')}\n▶ 正在测 ${i + 1}/${steps.length}:${s.name}`;
      try {
        s.on();
      } catch (error) {
        void error;
      }
      const r = await this.measureFrames(1500, 3000);
      try {
        s.off();
      } catch (error) {
        void error;
      }
      out.push({ name: s.name, fps: +r.fps.toFixed(1), avg: +r.avg.toFixed(1), worst: +r.worst.toFixed(0) });
      rows.push(`${s.name.padEnd(22, ' ')} ${r.fps.toFixed(1).padStart(5)} 帧   每帧 ${r.avg.toFixed(1).padStart(5)} 毫秒   最慢 ${r.worst.toFixed(0)}`);
    }
    el.textContent = `${head}${rows.join('\n')}\n✔ 测完了,请截这张表`;
    console.log('[g3dd] 自动测速', JSON.stringify({ gpu: GPU_NAME, canvas: cv ? [cv.width, cv.height] : null, dpr: window.devicePixelRatio, scale: scale0, out }));
    (window as unknown as { __g3dBench?: unknown }).__g3dBench = out;
    this.benchState = 'done';
  }

  /** 小物件(路灯、摊位、水井、立像、代码拼的零碎、角色以外)不再投月光阴影:阴影那一遍要把投影的东西整个再画一次。 */
  private cutSmallCasters(): void {
    const keep = (name: string): boolean => /^DgBld_(smithy|cathedral|house)/.test(name);
    this.world?.walk((nd) => {
      if (nd.name.startsWith('DgBld_') && !keep(nd.name)) {
        nd.getComponentsInChildren(MeshRenderer).forEach((mr) => {
          mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
        });
      }
    });
  }

  private blocked(x: number, z: number, r: number): boolean {
    if (x < X0 + r || x > X1 - r || z < Z0 + r || z > Z1 - r) {
      // 侧廊和门洞不让进(小样只做了这一间)
      return true;
    }
    if (!this.outdoor && x > DAIS.x - r - 0.2) {
      return true;      // 石台不上
    }
    for (const s of this.solids) {
      if (Math.abs(x - s.x) < s.hx + r && Math.abs(z - s.z) < s.hz + r) {
        return true;
      }
    }
    return false;
  }

  /** 从 (ox, oy, oz) 沿方向 d 走,最远走多远不撞墙 / 柱子 / 天花板(米)。 */
  private reach(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    let t = max;
    const slab = (o: number, d: number, lo: number, hi: number): void => {
      if (d > 1e-5) {
        t = Math.min(t, (hi - o) / d);
      } else if (d < -1e-5) {
        t = Math.min(t, (lo - o) / d);
      }
    };
    const out = this.wild ? 5 : this.city ? 1.5 : -0.35;          // 野外没有墙:镜头可以退到场地外面几米
    slab(ox, dx, X0 - out, X1 + out);
    slab(oy, dy, 0.25, this.outdoor ? 9 : H - 0.75);
    slab(oz, dz, Z0 - out, Z1 + out);
    // 大个子的怪(熊)站到镜头和主角之间时也算挡镜头的:不然镜头会埋进它身子里
    const blockers = this.solids.filter((v) => Math.max(v.hx, v.hz) >= 0.3);      // 烛台这种细杆子不算(挡不住什么,却会把镜头拉到贴脸)
    // 怪按圆柱算(按方盒子算的话,主角贴着熊站时镜头的线会蹭到盒子的角,被拉到贴脸)
    const hd = Math.hypot(dx, dz);
    for (const m of this.mobs) {
      if (m.radius < 0.7 || m.state === 'gone' || m.state === 'down' || hd < 1e-4) {
        continue;
      }
      const R = m.radius * 0.8;
      const px = ox - m.x;
      const pz = oz - m.z;
      if (px * px + pz * pz < (R + 0.25) * (R + 0.25)) {
        continue;      // 起点就在它身子里(主角贴着它):不管它
      }
      const b = (px * dx + pz * dz) / (hd * hd);
      const c = (px * px + pz * pz - R * R) / (hd * hd);
      const disc = b * b - c;
      if (disc <= 0) {
        continue;
      }
      const te = -b - Math.sqrt(disc);
      if (te > 0 && te < t && oy + dy * te < m.c.height + 0.2) {
        t = te;
      }
    }
    for (const s of blockers) {
      if (Math.abs(ox - s.x) < s.hx + 0.2 && Math.abs(oz - s.z) < s.hz + 0.2 && oy < s.h + 0.2) {
        continue;      // 起点就在这块里面(主角贴着它站):拉近也躲不开,不管它
      }
      // 射线和盒子(水平两个方向 + 高度)求交
      let t0 = 0;
      let t1 = t;
      const axis = (o: number, d: number, lo: number, hi: number): boolean => {
        if (Math.abs(d) < 1e-6) {
          return o > lo && o < hi;
        }
        let a = (lo - o) / d;
        let b = (hi - o) / d;
        if (a > b) {
          const c = a;
          a = b;
          b = c;
        }
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (axis(ox, dx, s.x - s.hx - 0.2, s.x + s.hx + 0.2) && axis(oz, dz, s.z - s.hz - 0.2, s.z + s.hz + 0.2) && axis(oy, dy, -1, s.h + 0.2)) {
        t = Math.min(t, t0);
      }
    }
    return Math.max(0, t);
  }

  private syncCam(dt: number): void {
    const cam = this.cam;
    if (!cam) {
      return;
    }
    cam.fov = this.view.fov;
    if (this.free) {
      cam.node.setPosition(this.free.pos);
      cam.node.lookAt(this.free.look);
      return;
    }
    this.look.set(this.lx, 1.25 + this.floorY(this.lx, this.lz), this.lz);
    // 身后有东西(柱子、围上来的熊)把镜头挤到两米半以内时:不往脸上贴,先往左右绕开(柱子是通顶的,抬高没用),再不行抬高了俯视
    const near = Math.min(this.view.dist, 2.6);
    const reachAt = (yawDeg: number, deg: number): number => {
      const y = (yawDeg * Math.PI) / 180;
      const q = (deg * Math.PI) / 180;
      return this.reach(this.look.x, this.look.y, this.look.z, Math.sin(y) * Math.cos(q), Math.sin(q), Math.cos(y) * Math.cos(q), this.view.dist);
    };
    const sg = this.swing < 0 ? -1 : 1;          // 已经往哪边绕了就先试哪边,免得左右来回跳
    const tries: Array<[number, number]> = [[0, 0], [20 * sg, 0], [-20 * sg, 0], [0, 14], [40 * sg, 0], [-40 * sg, 0], [20 * sg, 14], [-20 * sg, 14], [60 * sg, 0], [-60 * sg, 0], [0, 28], [40 * sg, 20], [-40 * sg, 20], [0, 42]];
    let needYaw = 0;
    let needLift = 0;
    let best = -1;
    for (const [sw, add] of tries) {
      const deg = Math.min(72, this.view.pitch + add);
      const r = reachAt(this.view.yaw + sw, deg);
      if (r > best + 0.3 || r >= near) {
        best = r;
        needYaw = sw;
        needLift = deg - this.view.pitch;
      }
      if (r >= near) {
        break;
      }
    }
    const ease = (cur: number, to: number): number => (dt <= 0 ? to : cur + (to - cur) * (1 - Math.exp(-(Math.abs(to) > Math.abs(cur) ? 9 : 2) * dt)));
    this.lift = ease(this.lift, needLift);
    this.swing = ease(this.swing, needYaw);
    const a = ((this.view.yaw + this.swing) * Math.PI) / 180;
    const p = ((this.view.pitch + this.lift) * Math.PI) / 180;
    const dx = Math.sin(a) * Math.cos(p);
    const dy = Math.sin(p);
    const dz = Math.cos(a) * Math.cos(p);
    const can = this.reach(this.look.x, this.look.y, this.look.z, dx, dy, dz, this.view.dist);
    const want = Math.max(Math.min(1.2, this.view.dist), can - 0.15);
    this.pull = want < this.pull || dt <= 0 ? want : Math.min(want, this.pull + (want - this.pull) * (1 - Math.exp(-4 * dt)) + 0.001);
    const d = Math.min(this.view.dist, this.pull);
    // 震屏:几个不同频率的正弦叠起来,幅度很快衰减
    const sk = this.shake;
    const st = this.time * 60;
    cam.node.setPosition(this.look.x + dx * d + sk * Math.sin(st * 1.31), this.look.y + dy * d + sk * 0.8 * Math.sin(st * 1.87 + 1.3), this.look.z + dz * d + sk * Math.sin(st * 1.53 + 2.1));
    cam.node.lookAt(this.look);
  }

  private tick(): void {
    if (!this.opened || !this.world) {
      return;
    }
    let dt = this.frozen ? 0 : this.fixedDt > 0 ? this.fixedDt : Math.min(0.05, game.deltaTime);
    this.realDt = dt;
    // 顿帧:砍中的那一下整个场面几乎停住几十毫秒(手感的来源),镜头的震动照走
    if (this.hitStop > 0 && dt > 0) {
      this.hitStop -= dt;
      dt *= 0.05;
    }
    this.lastDt = dt;
    this.shake *= Math.exp(-this.realDt * 9);
    if (DUNGEON.snd) {
      // 火盆的噼啪:离最近的一个越近越响
      let near = 99;
      for (const b of BRAZIERS) {
        near = Math.min(near, Math.hypot(b.x - this.lx, b.z - this.lz));
      }
      sfx.tick(this.realDt, Math.max(0, 1 - near / 10) ** 1.6);
    }
    for (let i = this.timers.length - 1; i >= 0; i -= 1) {
      if (this.time >= this.timers[i].at) {
        const tm = this.timers.splice(i, 1)[0];
        tm.run();
      }
    }
    for (const k of Object.keys(this.cd)) {
      this.cd[k] = Math.max(0, this.cd[k] - dt);
    }
    this.time += dt;
    const t = this.time;
    const R = (a: number, b: number): number => a + (b - a) * this.rnd();
    const fx = this.fx!;
    if (dt > 0) {
      this.stepLeader(dt);
      this.stepFollowers(dt);
      this.stepMobs(dt);
      // 火:火盆的火苗和火星、侧廊的火把
      const fy = this.city ? this.cityFireY : this.wild ? 0.14 : 1.18;          // 火从哪个高度起:火盆的碗口 / 地上的篝火 / 锻炉的炉膛
      for (const b of BRAZIERS) {
        for (let i = 0; i < 2; i += 1) {
          fx.emit({ x: b.x + R(-0.2, 0.2), y: fy + R(0, 0.08), z: b.z + R(-0.2, 0.2), vx: R(-0.12, 0.12), vy: R(0.9, 1.7), life: R(0.4, 0.7), s0: R(0.26, 0.38), s1: 0.08,
            c0: [1, 0.72, 0.32], c1: [0.9, 0.16, 0.03], a: 0.5, cell: R(0, 1) < 0.5 ? FX_CELL.flameA : FX_CELL.flameB, rot: R(-0.25, 0.25), drag: 0.3, fadeIn: 0.15 });
        }
        if (R(0, 1) < 0.2) {
          fx.emit({ x: b.x + R(-0.15, 0.15), y: fy + 0.17, z: b.z + R(-0.15, 0.15), vx: R(-0.35, 0.35), vy: R(1.2, 2.6), vz: R(-0.35, 0.35), life: R(1.0, 2.0), s0: 0.018, s1: 0.006,
            c0: [1, 0.62, 0.22], c1: [1, 0.2, 0.04], cell: FX_CELL.ember, grav: -0.04, drag: 0.5, stretch: 0.9 });
        }
      }
      if (this.city) {
        this.cityFx(R);
      } else if (!this.wild) {
        fx.emit({ x: HALL.x + 0.4 + R(-0.05, 0.05), y: 1.72, z: Z1 + HALL.depth - 0.5 + R(-0.05, 0.05), vy: R(0.7, 1.3), life: R(0.3, 0.55), s0: R(0.2, 0.3), s1: 0.06,
          c0: [1, 0.7, 0.3], c1: [0.9, 0.16, 0.03], a: 0.55, cell: R(0, 1) < 0.5 ? FX_CELL.flameA : FX_CELL.flameB, rot: R(-0.25, 0.25), drag: 0.3, fadeIn: 0.15 });
      } else {
        // 篝火的烟:一小股往上飘、越飘越淡
        if (R(0, 1) < 0.35) {
          const b = BRAZIERS[0];
          fx.emit({ x: b.x + R(-0.15, 0.15), y: 0.9, z: b.z + R(-0.15, 0.15), vx: R(0.1, 0.4), vy: R(0.7, 1.2), vz: R(-0.1, 0.2), life: R(2.5, 4.5), s0: 0.3, s1: 1.5,
            c0: [0.2, 0.2, 0.22], a: 0.1, cell: R(0, 1) < 0.5 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: R(0, 6), drag: 0.3, fadeIn: 0.25 });
        }
        // 贴地的薄雾:很大、很淡的几团,慢慢横着飘
        if (R(0, 1) < 0.1 * DUNGEON.mist) {
          fx.emit({ x: R(X0 - 4, X1 + 4), y: R(0.25, 0.7), z: R(Z0 - 4, Z1 + 4), vx: R(0.12, 0.3), vz: R(-0.06, 0.06), life: R(7, 12), s0: R(2.4, 3.6), s1: R(3.6, 5),
            c0: [0.2, 0.26, 0.38], a: 0.045, cell: R(0, 1) < 0.5 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: R(0, 6), drag: 0, fadeIn: 0.3 });
        }
        // 被风贴着地面吹过去的落叶:零星几片,翻着跟头横穿场地
        if (R(0, 1) < 0.07) {
          fx.emit({ x: X0 - 5 + R(0, 6), y: R(0.08, 0.5), z: R(Z0 - 3, Z1 + 3), vx: R(1.6, 3.2), vy: R(0.1, 0.5), vz: R(-0.5, 0.5), life: R(2.5, 5), s0: R(0.03, 0.05), s1: 0.03,
            c0: [0.3, 0.2, 0.1], c1: [0.2, 0.14, 0.08], a: 0.9, cell: FX_CELL.mote, add: false, grav: 0.35, drag: 0.15, fadeIn: 0.1 });
        }
        // 雨后树上还在往下滴水:滴在积水里漾开一圈涟漪,偶尔听得见一声
        if (R(0, 1) < 0.16 && this.wildWet) {
          for (let i = 0; i < 6; i += 1) {
            const x = R(X0 - 3, X1 + 3);
            const z = R(Z0 - 3, Z1 + 3);
            if (this.wildWet(x, z)) {
              fx.decal('atlas', FX_CELL.ring, x, z, 0.03, R(0.3, 0.55), R(0.9, 1.4), [0.5, 0.6, 0.8], 0.2, 0.05, 0.1, 0, 0.012);
              if (R(0, 1) < 0.2) {
                const h = this.heard(x, z);
                sfx.play('drip', { gain: h.gain * 0.7, pan: h.pan });
              }
              break;
            }
          }
        }
        // 萤火虫:零星几只,一明一灭地慢慢游
        if (R(0, 1) < 0.035 * DUNGEON.flies) {
          fx.emit({ x: R(X0 - 2, X1 + 2), y: R(0.3, 1.5), z: R(Z0 - 2, Z1 + 2), vx: R(-0.25, 0.25), vy: R(-0.06, 0.12), vz: R(-0.25, 0.25), life: R(3, 6), s0: 0.02, s1: 0.012,
            c0: [0.75, 1, 0.45], c1: [0.4, 0.8, 0.3], a: 0.8, cell: FX_CELL.mote, drag: 0.2, fadeIn: 0.35 });
        }
      }
      // 蜡烛的火苗(很小的一撮,每根隔几帧补一片)
      for (const c of this.candles) {
        if (R(0, 1) < 0.6) {
          fx.emit({ x: c.x + R(-0.004, 0.004), y: c.y + 0.03, z: c.z + R(-0.004, 0.004), vy: R(0.12, 0.22), life: R(0.28, 0.42), s0: R(0.075, 0.095), s1: 0.025,
            c0: [1, 0.8, 0.44], c1: [1, 0.32, 0.06], a: 0.9, cell: R(0, 1) < 0.5 ? FX_CELL.flameA : FX_CELL.flameB, rot: R(-0.15, 0.15), drag: 0.2, fadeIn: 0.2 });
        }
      }
      // 光柱里的浮尘
      if (!this.outdoor && R(0, 1) < 0.6) {
        const k = R(0, 1);
        const sx = (MOON_DIR.x / -MOON_DIR.y) * H * k;
        const sz = (MOON_DIR.z / -MOON_DIR.y) * H * k;
        fx.emit({ x: OC.x + sx + R(-1.1, 1.1), y: H * (1 - k), z: OC.z + sz + R(-1.1, 1.1), vx: R(-0.05, 0.05), vy: R(-0.12, 0.04), vz: R(-0.05, 0.05), life: R(3, 6), s0: R(0.012, 0.022), s1: 0.008,
          c0: [0.75, 0.86, 1], a: 0.5, cell: FX_CELL.mote, drag: 0.1, fadeIn: 0.3 });
      }
      for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
        const p = this.pulses[i];
        p.age += dt;
        const k = Math.max(0, 1 - p.age / p.life);
        p.light.luminousFlux = p.peak * k * k;
        if (p.age >= p.life) {
          p.light.node.active = false;
          this.pulses.splice(i, 1);
        }
      }
    }
    this.stepLights(dt);
    // 帧率:半秒更新一次
    const now = performance.now();
    if (this.fpsAcc.last) {
      this.fpsAcc.t += now - this.fpsAcc.last;
      this.fpsAcc.n += 1;
      this.fpsAcc.worst = Math.max(this.fpsAcc.worst, now - this.fpsAcc.last);
    }
    this.fpsAcc.last = now;
    if (this.fpsAcc.t >= 500) {
      this.fps = (1000 * this.fpsAcc.n) / this.fpsAcc.t;
      // 最低帧:最近 6 个半秒(3 秒)里最慢的那一帧
      this.lows.push(this.fpsAcc.worst);
      if (this.lows.length > 6) {
        this.lows.shift();
      }
      this.fpsLow = 1000 / Math.max(1, Math.max(...this.lows));
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
      this.maybeBench();
      if (this.benchState !== 'run') {
        this.autoQuality();          // 测速时不自动降级,免得干扰每一项的读数
      }
      this.fpsAcc.worst = 0;
      if (this.hudEl && !this.gpuName) {
        try {
          const gl: any = (director.root!.device as any).gl;
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          this.gpuName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? '?').slice(0, 60);
        } catch (error) {
          this.gpuName = '?';
        }
      }
      if (this.hudEl) {
        const cv = game.canvas;
        const k = this.post?.isOn() ? this.post.scale() : 1;
        const on = this.fixtures.filter((f) => f.on).length;
        this.hudEl.textContent = `地宫小样 · ${TIER_NAME[DUNGEON.tier] ?? DUNGEON.tier} · ${this.fps.toFixed(0)} 帧(最低 ${this.fpsLow.toFixed(0)})· ${cv ? `${Math.round(cv.width * k)}×${Math.round(cv.height * k)}` : ''} · 真灯 ${on} 处`
          + ` · 怪 ${this.mobs.length} 只${this.post?.linear() ? '' : ' · 低动态'}\n${this.gpuName}`
          + (sys.isMobile ? '\n左半屏拖动 = 走 · 右半屏拖动 = 转镜头 · 点一下右半屏 = 出手' : '');
      }
    }
    this.syncCam(dt);
    const camNode = this.cam!.node;
    // 补光跟着主角:放在镜头这一侧、头顶偏后
    const fill = this.lights.fill[0];
    if (fill) {
      camNode.getWorldPosition(_v);
      const fd = Math.max(0.5, Math.hypot(_v.x - this.lx, _v.z - this.lz));
      fill.node.setPosition(this.lx + ((_v.x - this.lx) / fd) * 1.4, 2.7, this.lz + ((_v.z - this.lz) / fd) * 1.4);
    }
    // 烘焙时角色不吃那份载体环境光的全亮:按所在位置的光整体染色(腰的高度、不分朝向)
    if (DUNGEON.bake) {
      const tint = (c: G3DChar, x: number, z: number): void => {
        const a = this.bakeAt(x, Math.min(1.1, c.height * 0.6), z, 0, 0.35, 0);
        // 颜色往灰里收一半:整只怪被红光 / 绿光染成纯色不像样(真灯照上去只有受光的一面带色)
        const l = (a[0] + a[1] + a[2]) / 3;
        c.setTint(Math.min(1.6, l + (a[0] - l) * 0.5), Math.min(1.6, l + (a[1] - l) * 0.5), Math.min(1.6, l + (a[2] - l) * 0.5));
      };
      if (this.leader) {
        tint(this.leader, this.lx, this.lz);
      }
      for (const f of this.followers) {
        tint(f.c, f.x, f.z);
      }
      for (const m of this.mobs) {
        if (m.state !== 'gone') {
          tint(m.c, m.x, m.z);
        }
      }
    }
    // 角色脚下的接地影(只有月光有投影,别的灯下靠这一团压住脚)
    if (this.leader) {
      fx.blob(this.lx, this.lz, 0.42, 0.55);
    }
    for (const f of this.followers) {
      fx.blob(f.x, f.z, 0.4, 0.55);
    }
    for (const m of this.mobs) {
      if (m.state !== 'gone') {
        fx.blob(m.x, m.z, m.radius * 1.25, 0.55);
      }
    }
    camNode.getWorldRotation(_q);
    for (const h of this.halos) {
      h.setWorldRotation(_q);
    }
    if (this.moonDisc) {
      const cp = camNode.worldPosition;
      const dl = Math.hypot(CITY_MOON_SKY[0], CITY_MOON_SKY[1], CITY_MOON_SKY[2]) / 200;
      this.moonDisc.setWorldPosition(cp.x + CITY_MOON_SKY[0] / dl, cp.y + CITY_MOON_SKY[1] / dl, cp.z + CITY_MOON_SKY[2] / dl);
    }
    this.stepGlints();
    fx.update(dt, camNode);
  }

  private afterUpdate(): void {
    if (!this.opened) {
      return;
    }
    this.leader?.pose(this.time);
    this.poseLeader();
    for (const f of this.followers) {
      f.c.pose(this.time);
    }
    for (const m of this.mobs) {
      if (m.state !== 'gone') {
        m.c.pose(this.time);
      }
    }
  }

  private stepLeader(dt: number): void {
    const c = this.leader;
    if (!c) {
      return;
    }
    c.step(dt);
    const px0 = this.lx;
    const pz0 = this.lz;
    if (this.dbgClip) {
      c.scrub(this.dbgClip.name, this.dbgClip.t, 0);
      c.place(this.lx, this.leaderY + this.floorY(this.lx, this.lz), this.lz, this.lyaw);
      return;
    }
    const K = this.keys;
    let ix = (K.has(KeyCode.KEY_D) || K.has(KeyCode.ARROW_RIGHT) ? 1 : 0) - (K.has(KeyCode.KEY_A) || K.has(KeyCode.ARROW_LEFT) ? 1 : 0);
    let iy = (K.has(KeyCode.KEY_W) || K.has(KeyCode.ARROW_UP) ? 1 : 0) - (K.has(KeyCode.KEY_S) || K.has(KeyCode.ARROW_DOWN) ? 1 : 0);
    if (Math.hypot(this.stick.x, this.stick.y) > 0.22) {
      ix = this.stick.x;
      iy = this.stick.y;
    }
    if (this.auto) {
      const ddx = this.auto.x - this.lx;
      const ddz = this.auto.z - this.lz;
      if (Math.hypot(ddx, ddz) < 0.15) {
        this.auto = null;
      }
    }
    let wx = 0;
    let wz = 0;
    if (this.auto) {
      wx = this.auto.x - this.lx;
      wz = this.auto.z - this.lz;
    } else if (ix || iy) {
      // 按镜头的朝向走:前 = 镜头看过去的方向
      const a = (this.view.yaw * Math.PI) / 180;
      wx = ix * Math.cos(a) - iy * Math.sin(a);
      wz = -ix * Math.sin(a) - iy * Math.cos(a);
    }
    const len = Math.hypot(wx, wz);
    if (this.act) {
      this.stepAct(dt, len > 0.01);
    }
    if (!this.act && len > 0.01) {
      const speed = 3.6;
      const nx = wx / len;
      const nz = wz / len;
      const tx = this.lx + nx * speed * dt;
      const tz = this.lz + nz * speed * dt;
      if (!this.blocked(tx, tz, 0.3)) {
        this.lx = tx;
        this.lz = tz;
      } else if (!this.blocked(tx, this.lz, 0.3)) {
        this.lx = tx;
      } else if (!this.blocked(this.lx, tz, 0.3)) {
        this.lz = tz;
      } else {
        this.auto = null;
      }
      const want = (Math.atan2(-nz, nx) * 180) / Math.PI;
      const d = ((want - this.lyaw + 540) % 360) - 180;
      this.lyaw += d * Math.min(1, dt * 14);
      if (!this.moving) {
        this.moving = true;
        this.loco('run', 0.15);
      }
    } else if (!this.act && this.moving) {
      this.moving = false;
      this.loco('idle', 0.2);
    }
    // 主角不走进怪的身子里(突进是穿过去的、跳劈在空中,不管)
    if (!(this.act && (this.act.kind === 'dash' || this.act.kind === 'smash'))) {
      for (const m of this.mobs) {
        if (m.state === 'gone' || m.state === 'down') {
          continue;
        }
        const ox = this.lx - m.x;
        const oz = this.lz - m.z;
        const od = Math.hypot(ox, oz);
        const min = m.radius * 0.9 + 0.3;
        if (od < min && od > 1e-4) {
          const nx2 = this.lx + (ox / od) * (min - od);
          const nz2 = this.lz + (oz / od) * (min - od);
          if (!this.blocked(nx2, nz2, 0.3)) {
            this.lx = nx2;
            this.lz = nz2;
          }
        }
      }
    }
    // 脚步声:跑起来每 1.3 米一步(片段里两步正好是这么远)
    if (this.moving && !this.act) {
      this.stride += Math.hypot(this.lx - px0, this.lz - pz0);
      if (this.stride > 1.3) {
        this.stride = 0;
        sfx.play(this.wild ? 'stepMud' : 'step');
      }
    } else {
      this.stride = 0.9;          // 起步后很快就响第一声
    }
    c.place(this.lx, this.leaderY + this.floorY(this.lx, this.lz), this.lz, this.lyaw);
  }

  /** 正在出的这一招往前走一帧:位移、转身、判定、放特效;到了可以接的点就接下一招(或者被走位打断)。 */
  private stepAct(dt: number, wantMove: boolean): void {
    const act = this.act!;
    const c = this.leader!;
    const m = act.move;
    act.t += dt;
    const u = Math.min(1, act.t / act.dur);
    const sm = (a: number, b: number): number => {
      const k = Math.min(1, Math.max(0, (u - a) / Math.max(1e-4, b - a)));
      return k * k * (3 - 2 * k);
    };
    const rad = (act.yaw0 * Math.PI) / 180;
    const fxn = Math.cos(rad);
    const fzn = -Math.sin(rad);
    const fx = this.fx!;
    // 往前挪
    const advance = m ? m.advance : 2.4;
    const advAt: [number, number] = m ? m.advAt : [0.2, 0.66];
    const want = advance * sm(advAt[0], advAt[1]);
    let step = want - act.adv;
    let side = 0;
    if (!(m && m.clip && c.moves)) {
      act.adv = want;
    } else {
      // 动作库的片段:定在逻辑时间对应的那一刻(顿帧、加速都跟着走);位移照片段里胯走过的路
      const ct = m.from! + u * (m.to! - m.from!);
      c.scrub(m.clip, ct, 0.09);
      rootAt(c.moves, m.clip, ct, _r1);
      rootAt(c.moves, m.clip, m.from!, _r0);
      const k = (m.rootK ?? 1) * c.scale;
      const wf = (_r1[0] - _r0[0]) * k;
      const wr = (_r1[1] - _r0[1]) * k;
      step = wf - act.adv;
      side = wr - act.advR;
      act.adv = wf;
      act.advR = wr;
    }
    if (Math.abs(step) > 1e-5 || Math.abs(side) > 1e-5) {
      const tx = this.lx + fxn * step - fzn * side;
      const tz = this.lz + fzn * step + fxn * side;
      if (!this.blocked(tx, tz, 0.3)) {
        this.lx = tx;
        this.lz = tz;
      } else if (!this.blocked(tx, this.lz, 0.3)) {
        this.lx = tx;
      } else if (!this.blocked(this.lx, tz, 0.3)) {
        this.lz = tz;
      }
    }
    // 转身
    if (m?.spin && m.spinAt) {
      this.lyaw = act.yaw0 + m.spin * sm(m.spinAt[0], m.spinAt[1]);
    }
    // 挥剑的声音:赶在判定前 0.09 秒起(声音的最响处正好落在砍中的那一下)
    const lead = 0.09 / act.dur;
    if (m) {
      m.hits.forEach((h, i) => {
        if (!this.swung[i] && u >= h.t - lead) {
          this.swung[i] = true;
          sfx.play('swing', { heavy: this.gs || !!h.heavy, dur: h.heavy ? 0.4 : this.gs ? 0.32 : 0.26 });
        }
      });
    }
    const fireAt = m?.fire ?? (act.kind === 'wave' ? 0.44 : act.kind === 'smash' ? 0.68 : -1);
    if ((act.kind === 'wave' || act.kind === 'smash') && !this.swung[9] && u >= fireAt - lead * 1.4) {
      this.swung[9] = true;
      sfx.play('swing', { heavy: true, dur: 0.42 });
    }
    // 判定
    if (m) {
      m.hits.forEach((h, i) => {
        if (!act.done[i] && u >= h.t) {
          act.done[i] = true;
          this.resolveHit(h, m.color as [number, number, number], act.kind);
        }
      });
    }
    const fxA = m?.fx ? m.fx[0] : act.kind === 'dash' ? 0.2 : 0.1;
    const fxB = m?.fx ? m.fx[1] : act.kind === 'dash' ? 0.66 : 0.88;
    if (act.kind === 'dash') {
      // 突进:冲过去的路上碰到谁算谁(每只一次);身后拖尘土和一串细火星
      if (u > fxA && u < fxB) {
        for (const mob of this.mobs) {
          if (mob.state === 'down' || mob.state === 'gone' || act.hit.has(mob)) {
            continue;
          }
          const dx = mob.x - this.lx;
          const dz = mob.z - this.lz;
          if (Math.hypot(dx, dz) < 1.25 + mob.radius && dx * fxn + dz * fzn > -0.3) {
            act.hit.add(mob);
            this.damage(mob, 3, true, fxn, fzn, [0.62, 0.55, 1.0], fxn, 0, fzn);
          }
        }
        if (dt > 0) {
          for (let i = 0; i < 3; i += 1) {
            fx.emit({ x: this.lx - fxn * fx.rand(0.2, 0.9) + fx.rand(-0.25, 0.25), y: fx.rand(0.3, 1.5), z: this.lz - fzn * fx.rand(0.2, 0.9) + fx.rand(-0.25, 0.25), vx: -fxn * fx.rand(6, 11), vy: fx.rand(-0.2, 0.4), vz: -fzn * fx.rand(6, 11),
              life: fx.rand(0.12, 0.26), s0: 0.016, s1: 0.004, c0: [0.75, 0.7, 1], c1: [0.4, 0.35, 0.9], a: 0.7, cell: FX_CELL.streak, drag: 2, stretch: 3 });
          }
          fx.emit({ x: this.lx - fxn * 0.3, y: 0.15, z: this.lz - fzn * 0.3, vx: fx.rand(-0.5, 0.5), vy: fx.rand(0.2, 0.7), vz: fx.rand(-0.5, 0.5), life: fx.rand(0.5, 0.9), s0: 0.25, s1: 0.7,
            c0: [0.3, 0.31, 0.36], a: 0.14, cell: FX_CELL.smokeA, add: false, rot: fx.rand(0, 6), drag: 1 });
        }
      }
      if (!act.fired && u >= (m?.fire ?? 0.62)) {
        act.fired = true;
        // 收势:剑尖前面一团很短的闪 + 贴地一圈往外扩的环
        fx.emit({ x: this.lx + fxn * 1.2, y: 1.15, z: this.lz + fzn * 1.2, life: 0.1, s0: 0.5, s1: 1.4, c0: [0.8, 0.78, 1], a: 0.5, cell: FX_CELL.core, fadeIn: 0.01 });
        fx.decal('atlas', FX_CELL.ring, this.lx + fxn * 0.6, this.lz + fzn * 0.6, 0.3, 2.2, 0.32, [0.6, 0.56, 1.0], 0.5, 0.02, 0.05, 0, 0.03);
        this.shake = Math.max(this.shake, 0.06);
      }
    } else if (act.kind === 'whirl') {
      if (dt > 0 && u > fxA && u < fxB) {
        // 旋风:身边往上卷的细丝 + 贴地往外带的尘
        for (let i = 0; i < 2; i += 1) {
          const a = fx.rand(0, Math.PI * 2);
          const r = fx.rand(1.0, 2.4);
          fx.emit({ x: this.lx + Math.cos(a) * r, y: fx.rand(0.1, 0.6), z: this.lz + Math.sin(a) * r, vx: -Math.sin(a) * 7, vy: fx.rand(1.5, 3.2), vz: Math.cos(a) * 7,
            life: fx.rand(0.25, 0.45), s0: 0.014, s1: 0.004, c0: [0.8, 0.92, 1], c1: [0.45, 0.65, 1], a: 0.6, cell: FX_CELL.streak, drag: 1.2, stretch: 3 });
        }
        if (fx.rand() < 0.5) {
          const a = fx.rand(0, Math.PI * 2);
          fx.emit({ x: this.lx + Math.cos(a) * 1.6, y: 0.12, z: this.lz + Math.sin(a) * 1.6, vx: Math.cos(a) * 2.2 - Math.sin(a) * 2, vy: fx.rand(0.2, 0.6), vz: Math.sin(a) * 2.2 + Math.cos(a) * 2,
            life: fx.rand(0.5, 0.9), s0: 0.3, s1: 0.9, c0: [0.32, 0.33, 0.38], a: 0.13, cell: fx.rand() < 0.5 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: fx.rand(0, 6), drag: 1.4 });
        }
      }
    } else if (act.kind === 'wave') {
      if (!act.fired && u >= (m?.fire ?? 0.44)) {
        act.fired = true;
        sfx.play('wave');
        this.waves.push({ x: this.lx + fxn * 1.0, z: this.lz + fzn * 1.0, dx: fxn, dz: fzn, age: 0, life: 0.62, hit: new Set() });
        this.shake = Math.max(this.shake, 0.07);
      }
    } else if (act.kind === 'smash' && m) {
      // 跃空重劈(动作库的片段):起跳和落地都在片段里,落地那一下砸地
      if (!act.fired && u >= (m.fire ?? 0.6)) {
        act.fired = true;
        this.slam(this.lx + fxn * 1.3, this.lz + fzn * 1.3, fxn, fzn);
      }
    } else if (act.kind === 'smash') {
      // 跃空重劈:用模型自带的「过顶劈」片段。蓄力下蹲 → 腾空举剑 → 落地劈下 → 收势
      const clip = c.clip('slash');
      const ct = u < 0.18 ? 1.15 + (u / 0.18) * 0.25 : u < 0.6 ? 1.4 + ((u - 0.18) / 0.42) * 0.62 : u < 0.7 ? 2.02 + ((u - 0.6) / 0.1) * 0.4 : 2.42 + ((u - 0.7) / 0.3) * 0.6;
      if (clip) {
        c.scrub(clip, ct, 0.08);
      }
      const air = Math.min(1, Math.max(0, (u - 0.18) / 0.5));
      this.leaderY = u < 0.68 ? 1.7 * Math.sin(Math.PI * air) * (air < 0.5 ? 1 : 1 - (air - 0.5) * 0.3) : 0;
      if (!act.fired && u >= 0.68) {
        act.fired = true;
        this.leaderY = 0;
        this.slam(this.lx + fxn * 1.1, this.lz + fzn * 1.1, fxn, fzn);
      }
    }
    // 收招 / 接下一招 / 被走位打断
    const cancel = m ? m.cancel : 0.86;
    if (u >= cancel && (this.queued || wantMove)) {
      const next = this.queued;
      this.endAct();
      if (next && (next === 'attack' || this.cd[next] <= 0)) {
        this.startAct(next);
      }
      return;
    }
    if (u >= 1) {
      this.endAct();
    }
  }

  private endAct(): void {
    const c = this.leader!;
    const was = this.act;
    this.act = null;
    this.queued = was && this.queued === null ? null : this.queued;
    this.leaderY = 0;
    this.lyaw = ((this.lyaw % 360) + 360) % 360;
    this.comboUntil = this.time + 0.55;
    if (was && (!was.move || was.move.clip)) {
      this.loco('idle', 0.25);
    }
    this.queued = null;
  }

  auto: { x: number; z: number } | null = null;

  private stepFollowers(dt: number): void {
    for (const f of this.followers) {
      f.c.step(dt);
      // 跟在主角侧后方:离得远了才动
      const a = (this.lyaw * Math.PI) / 180;
      const gx = this.lx + (Math.cos(a) * f.ox + Math.sin(a) * f.oz);
      const gz = this.lz + (-Math.sin(a) * f.ox + Math.cos(a) * f.oz);
      const dx = gx - f.x;
      const dz = gz - f.z;
      const d = Math.hypot(dx, dz);
      const go = f.moving ? d > 0.25 : d > 1.1;
      if (go) {
        const sp = Math.min(3.8, 1.5 + d * 2);
        const tx = f.x + (dx / d) * sp * dt;
        const tz = f.z + (dz / d) * sp * dt;
        if (!this.blocked(tx, tz, 0.28)) {
          f.x = tx;
          f.z = tz;
        }
        const want = (Math.atan2(-dz, dx) * 180) / Math.PI;
        f.yaw += ((((want - f.yaw + 540) % 360) - 180)) * Math.min(1, dt * 10);
        if (!f.moving) {
          f.moving = true;
          f.c.play(f.c.clip('run') || f.c.clip('walk'), 0.2);
        }
      } else if (f.moving) {
        f.moving = false;
        f.c.play(f.c.clip('idle'), 0.25);
      }
      f.c.place(f.x, this.floorY(f.x, f.z), f.z, f.yaw);
    }
  }

  private stepMobs(dt: number): void {
    for (const m of this.mobs) {
      const c = m.c;
      m.t += dt;
      if (m.state === 'gone') {
        if (m.t > 9) {
          m.state = 'idle';
          m.hp = m.maxHp;
          m.x = m.home.x;
          m.z = m.home.z;
          c.down = 0;
          c.node.active = true;
          this.rest(m);
        }
        continue;
      }
      c.step(dt);
      if (m.state === 'down') {
        c.down = Math.min(1, c.down + dt * 2.2);
        if (m.t > 5) {
          m.state = 'gone';
          m.t = 0;
          c.node.active = false;
        }
        c.place(m.x, 0, m.z, m.yaw);
        continue;
      }
      const dx = this.lx - m.x;
      const dz = this.lz - m.z;
      const d = Math.hypot(dx, dz);
      m.cool = Math.max(0, m.cool - dt);
      const aware = !!this.leader && d < 6.5 && Math.hypot(m.x - m.home.x, m.z - m.home.z) < 9;
      let gx = 0;
      let gz = 0;
      let moving = false;
      if (aware) {
        if (d > m.reach) {
          gx = dx / d;
          gz = dz / d;
          moving = true;
          m.state = 'chase';
        } else {
          m.state = 'bite';
          if (m.cool <= 0) {
            m.cool = 1.5 + this.rnd() * 0.8;
            c.act = 'bite';
            c.actT = 0;
            sfx.play('bite', { heavy: m.radius >= 0.7, ...this.heard(m.x, m.z) });
          }
        }
        const want = (Math.atan2(-dz, dx) * 180) / Math.PI;
        m.yaw += ((((want - m.yaw + 540) % 360) - 180)) * Math.min(1, dt * 7);
      } else {
        // 没发现人:在自己的地盘上隔一会儿挪两步
        m.state = 'idle';
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = 2.5 + this.rnd() * 4;
          m.tx = m.home.x + (this.rnd() - 0.5) * 2.4;
          m.tz = m.home.z + (this.rnd() - 0.5) * 2.4;
        }
        const wx = m.tx - m.x;
        const wz = m.tz - m.z;
        const wd = Math.hypot(wx, wz);
        if (wd > 0.2) {
          gx = (wx / wd) * 0.45;
          gz = (wz / wd) * 0.45;
          moving = true;
          const want = (Math.atan2(-wz, wx) * 180) / Math.PI;
          m.yaw += ((((want - m.yaw + 540) % 360) - 180)) * Math.min(1, dt * 5);
        }
      }
      if (moving) {
        let tx = m.x + gx * m.speed * dt;
        let tz = m.z + gz * m.speed * dt;
        // 怪和主角之间也别叠在一起(主角跳劈落到怪身上时把怪挤开)
        {
          const ox = tx - this.lx;
          const oz = tz - this.lz;
          const od = Math.hypot(ox, oz);
          const min = m.radius + 0.38;
          if (od < min && od > 1e-4) {
            tx += (ox / od) * (min - od);
            tz += (oz / od) * (min - od);
          }
        }
        // 怪和怪之间别叠在一起
        for (const o of this.mobs) {
          if (o === m || o.state === 'gone' || o.state === 'down') {
            continue;
          }
          const ox = tx - o.x;
          const oz = tz - o.z;
          const od = Math.hypot(ox, oz);
          const min = m.radius + o.radius;
          if (od < min && od > 1e-4) {
            tx += (ox / od) * (min - od) * 0.5;
            tz += (oz / od) * (min - od) * 0.5;
          }
        }
        if (!this.blocked(tx, tz, m.radius * 0.7)) {
          m.x = tx;
          m.z = tz;
        }
        this.walk(m);
      } else {
        this.rest(m);
      }
      c.stand = moving ? Math.max(0, c.stand - dt * 4) : Math.min(1, c.stand + dt * 4);
      c.place(m.x, 0, m.z, m.yaw);
    }
  }

  /** 一次判定:前方扇形(或一圈)里够得着的怪都算打中。 */
  private resolveHit(h: MoveHit, color: [number, number, number], kind: string): void {
    const a = (this.lyaw * Math.PI) / 180;
    const fxn = Math.cos(a);
    const fzn = -Math.sin(a);
    const half = Math.cos(((h.arc / 2) * Math.PI) / 180);
    // 这一下刀往哪边带(火星顺着飞):横斩往左、上撩往右上、斜劈往左下;一圈的用切线
    const sweep: Record<string, [number, number, number]> = { 横斩: [0.2, 0.1, -1], 反手上撩: [0.2, 0.7, 0.8], 斜劈: [0.3, -0.7, -0.6] };
    const mv = this.act?.move;
    const sv = mv && !mv.clip ? sweep[mv.name] : undefined;
    const tipV = mv && mv.clip && h.arc < 360 ? this.tipVel : null;
    let any = false;
    for (const m of this.mobs) {
      if (m.state === 'down' || m.state === 'gone') {
        continue;
      }
      const dx = m.x - this.lx;
      const dz = m.z - this.lz;
      const d = Math.hypot(dx, dz);
      if (d - m.radius > h.reach) {
        continue;
      }
      if (h.arc < 360 && d > 0.5 && (dx * fxn + dz * fzn) / d < half) {
        continue;
      }
      any = true;
      // 刀带过去的方向(世界):有登记的按招式给,没有的(转圈)用绕着主角的切线
      let tx = -dz / (d || 1);
      let ty = 0.15;
      let tz = dx / (d || 1);
      if (sv) {
        // 角色自己的 [前, 上, 右] → 世界:右 = 前 × 上
        tx = fxn * sv[0] + -fzn * sv[2];
        ty = sv[1];
        tz = fzn * sv[0] + fxn * sv[2];
      } else if (tipV) {
        tx = tipV.x;
        ty = tipV.y;
        tz = tipV.z;
      }
      this.damage(m, h.dmg, !!h.heavy, dx / (d || 1), dz / (d || 1), color, tx, ty, tz);
    }
    if (kind === 'whirl') {
      this.fx!.decal('atlas', FX_CELL.ring, this.lx, this.lz, 0.8, h.heavy ? 4.0 : 3.2, h.heavy ? 0.42 : 0.3, color, h.heavy ? 0.3 : 0.16, 0.02, 0.04, 0, 0.03);
    }
    if (any) {
      this.hitStop = Math.max(this.hitStop, h.heavy ? 0.085 : 0.04);
      this.shake = Math.max(this.shake, h.heavy ? 0.14 : 0.05);
      // 闪光放在主角前面两米多(怪的那一侧、偏高):放近了主角自己的正面会被照得发白,连招快的时候几乎一直亮着,看不清人
      this.flash(this.lx + fxn * 2.3, 1.7, this.lz + fzn * 2.3, h.heavy ? 1.6 : 1, 0.2);
    }
  }

  /** 一只怪挨了一下:掉血、受击、往后退一点、特效;血没了就倒。 */
  private damage(m: Mob, dmg: number, heavy: boolean, nx: number, nz: number, color: [number, number, number], tx: number, ty: number, tz: number): void {
    const fx = this.fx!;
    sfx.play('hit', { heavy, ...this.heard(m.x, m.z) });
    m.hp -= dmg;
    m.c.hit = 1;
    m.cool = Math.max(m.cool, heavy ? 0.9 : 0.45);
    const kb = heavy ? 0.7 : 0.22;
    if (!this.blocked(m.x + nx * kb, m.z + nz * kb, m.radius * 0.7)) {
      m.x += nx * kb;
      m.z += nz * kb;
    }
    // 打在怪朝主角的这一面、半身高
    const px = m.x - nx * m.radius * 0.7;
    const pz = m.z - nz * m.radius * 0.7;
    const py = Math.min(1.25, m.c.height * 0.55);
    const tl = Math.hypot(tx, ty, tz) || 1;
    const ux = tx / tl;
    const uy = ty / tl;
    const uz = tz / tl;
    // 一道很快的切痕:顺着刀的方向掠过去的一条亮线
    fx.emit({ x: px - ux * 0.5, y: py - uy * 0.5, z: pz - uz * 0.5, vx: ux * 16, vy: uy * 16, vz: uz * 16, life: 0.075, s0: heavy ? 0.075 : 0.05, s1: 0.012, c0: [1, 1, 1], c1: color, a: 0.95, cell: FX_CELL.streak, stretch: 5, fadeIn: 0.01 });
    // 火星:顺着刀的方向甩出去,带一点散;重击多一些
    const n = heavy ? 26 : 13;
    for (let i = 0; i < n; i += 1) {
      const sp = fx.rand(3, heavy ? 10 : 7);
      fx.emit({ x: px, y: py, z: pz, vx: ux * sp + nx * fx.rand(0, 3) + fx.rand(-2, 2), vy: uy * sp + fx.rand(0.5, 3.5), vz: uz * sp + nz * fx.rand(0, 3) + fx.rand(-2, 2),
        life: fx.rand(0.18, 0.5), s0: fx.rand(0.012, 0.022), s1: 0.004, c0: i % 4 === 0 ? [1, 0.9, 0.7] : [0.92, 0.96, 1], c1: i % 4 === 0 ? [1, 0.45, 0.12] : color, cell: FX_CELL.streak, grav: 1, drag: 1.1, stretch: 2.4 });
    }
    // 接触点一下很短的白闪(小,不糊成一团)
    fx.emit({ x: px, y: py, z: pz, life: 0.07, s0: heavy ? 0.26 : 0.18, s1: heavy ? 0.52 : 0.34, c0: [1, 1, 1], a: 0.4, cell: FX_CELL.star, rot: fx.rand(0, 3), fadeIn: 0.01 });
    if (heavy) {
      for (let i = 0; i < 4; i += 1) {
        fx.emit({ x: px + fx.rand(-0.2, 0.2), y: fx.rand(0.1, 0.5), z: pz + fx.rand(-0.2, 0.2), vx: nx * fx.rand(0.5, 2) + fx.rand(-0.6, 0.6), vy: fx.rand(0.3, 1), vz: nz * fx.rand(0.5, 2) + fx.rand(-0.6, 0.6),
          life: fx.rand(0.5, 1), s0: 0.25, s1: 0.75, c0: [0.3, 0.31, 0.35], a: 0.15, cell: FX_CELL.smokeA, add: false, rot: fx.rand(0, 6), drag: 1.2 });
      }
    }
    if (m.hp <= 0) {
      m.state = 'down';
      m.t = 0;
      const big = m.radius >= 0.7;
      this.timers.push({ at: this.time + (big ? 0.45 : 0.28), run: () => sfx.play('fall', { heavy: big, ...this.heard(m.x, m.z) }) });
      m.c.downSide = this.rnd() < 0.5 ? -1 : 1;
      const fall = m.c.clip('fall');
      if (fall) {
        m.c.play(fall, 0.1, false);
      }
    }
  }

  /** 出手 / 命中时亮一下的灯(很短)。 */
  private flash(x: number, y: number, z: number, k: number, life: number): void {
    const L = this.lights.hit.find((v) => !v.node.active) ?? this.lights.hit[0];
    if (!L) {
      return;
    }
    L.node.setPosition(x, y, z);
    L.node.active = true;
    const peak = DUNGEON.hit * DUNGEON.fluxK * k;
    L.luminousFlux = peak;
    this.pulses = this.pulses.filter((p) => p.light !== L);
    this.pulses.push({ light: L, age: 0, life, peak });
  }

  /** 跃空重劈落地:一圈范围伤害 + 地裂、焦痕、三圈往外扩的冲击环、碎石、扬尘、火星、震屏。 */
  private slam(x: number, z: number, fxn: number, fzn: number): void {
    const fx = this.fx!;
    sfx.play('slam', this.heard(x, z));
    const color: [number, number, number] = [0.66, 0.6, 1.0];
    let any = false;
    for (const m of this.mobs) {
      if (m.state === 'down' || m.state === 'gone') {
        continue;
      }
      const dx = m.x - x;
      const dz = m.z - z;
      const d = Math.hypot(dx, dz);
      if (d - m.radius < 3.0) {
        any = true;
        this.damage(m, 5, true, dx / (d || 1), dz / (d || 1), color, dx / (d || 1), 0.9, dz / (d || 1));
        // 离落点近的再推开一截(落点上不站怪)
        const push = Math.max(0, 1.5 + m.radius - d);
        if (push > 0 && !this.blocked(m.x + (dx / (d || 1)) * push, m.z + (dz / (d || 1)) * push, m.radius * 0.7)) {
          m.x += (dx / (d || 1)) * push;
          m.z += (dz / (d || 1)) * push;
        }
      }
    }
    fx.decal('atlas', FX_CELL.crack, x, z, 2.6, 2.9, 3.2, [0.72, 0.68, 1.0], 0.75, 0.02, 0.5, 0, 0.026);
    fx.decal('scorch', 0, x, z, 2.2, 2.4, 5, [0, 0, 0], 0.5, 0.05, 2.5, 0, 0.024);
    // 两圈细环(不用那张粗的冲击波:放大以后是一整片亮盘,把地面盖没了)
    for (let i = 0; i < 2; i += 1) {
      this.timers.push({ at: this.time + i * 0.08, run: () => fx.decal('atlas', FX_CELL.ring, x, z, 0.5, 3.4 + i * 1.3, 0.3 + i * 0.07, color, 0.42 - i * 0.2, 0.02, 0.04, 0, 0.032 + i * 0.002) });
    }
    // 中心一道往上的短光 + 一圈贴地往外冲的细火星
    fx.emit({ x, y: 0.4, z, life: 0.09, s0: 0.5, s1: 1.0, c0: [0.85, 0.82, 1], a: 0.3, cell: FX_CELL.core, fadeIn: 0.01 });
    for (let i = 0; i < 44; i += 1) {
      const a = (i / 44) * Math.PI * 2 + fx.rand(-0.06, 0.06);
      const sp = fx.rand(5, 11);
      fx.emit({ x: x + Math.cos(a) * 0.4, y: 0.12, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: fx.rand(0.6, 5), vz: Math.sin(a) * sp, life: fx.rand(0.25, 0.6), s0: fx.rand(0.014, 0.026), s1: 0.004,
        c0: [0.92, 0.94, 1], c1: color, cell: FX_CELL.streak, grav: 1, drag: 1.3, stretch: 2.6 });
    }
    // 扬尘:一圈往外滚的烟
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * Math.PI * 2 + fx.rand(-0.1, 0.1);
      fx.emit({ x: x + Math.cos(a) * 0.8, y: 0.2, z: z + Math.sin(a) * 0.8, vx: Math.cos(a) * fx.rand(2.5, 4.5), vy: fx.rand(0.3, 1.1), vz: Math.sin(a) * fx.rand(2.5, 4.5), life: fx.rand(0.8, 1.5), s0: 0.4, s1: 1.4,
        c0: [0.3, 0.31, 0.36], a: 0.2, cell: i % 2 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: fx.rand(0, 6), spin: fx.rand(-0.5, 0.5), drag: 1.6 });
    }
    this.hitStop = Math.max(this.hitStop, any ? 0.12 : 0.05);
    this.shake = Math.max(this.shake, 0.3);
    this.flash(x, 1.0, z, 3.2, 0.4);
    void fxn;
    void fzn;
  }

  /** 剑气:往前飞的两片交叉的月牙;碰到的怪各算一次,飞到头或撞墙就散。 */
  private stepWaves(dt: number): void {
    const mesh = this.waveMesh;
    const fx = this.fx;
    if (!mesh || !fx) {
      return;
    }
    mesh.begin();
    const color: [number, number, number] = [0.66, 0.6, 1.0];
    for (let i = this.waves.length - 1; i >= 0; i -= 1) {
      const w = this.waves[i];
      w.age += dt;
      w.x += w.dx * 15 * dt;
      w.z += w.dz * 15 * dt;
      const out = this.blocked(w.x, w.z, 0.2) && !(w.x > DAIS.x - 0.5 && w.x < X1 - 0.5 && Math.abs(w.z) < Z1 - 0.9);
      for (const m of this.mobs) {
        if (m.state === 'down' || m.state === 'gone' || w.hit.has(m)) {
          continue;
        }
        if (Math.hypot(m.x - w.x, m.z - w.z) < 1.15 + m.radius) {
          w.hit.add(m);
          this.damage(m, 3, true, w.dx, w.dz, color, w.dx, 0.2, w.dz);
          this.hitStop = Math.max(this.hitStop, 0.05);
          this.shake = Math.max(this.shake, 0.08);
        }
      }
      if (w.age >= w.life || out) {
        // 散开:一小撮火星
        for (let k = 0; k < 16; k += 1) {
          fx.emit({ x: w.x, y: fx.rand(0.5, 1.9), z: w.z, vx: w.dx * fx.rand(1, 5) + fx.rand(-2.5, 2.5), vy: fx.rand(-1, 3), vz: w.dz * fx.rand(1, 5) + fx.rand(-2.5, 2.5), life: fx.rand(0.2, 0.45), s0: 0.016, s1: 0.004,
            c0: [0.9, 0.9, 1], c1: color, cell: FX_CELL.streak, grav: 0.6, drag: 1.5, stretch: 2.4 });
        }
        this.waves.splice(i, 1);
        continue;
      }
      const fade = Math.min(1, w.age / 0.05) * Math.min(1, (w.life - w.age) / 0.16);
      // 两片月牙:各自绕前进方向歪 ±38 度;每片是一条中间宽、两头尖的弧带,鼓的一面朝前
      const rx = -w.dz;
      const rz = w.dx;
      for (const tilt of [38, -38]) {
        const tr = (tilt * Math.PI) / 180;
        const sx = rx * Math.sin(tr);
        const sy = Math.cos(tr);
        const sz = rz * Math.sin(tr);
        const R = 1.25;
        const N = 14;
        let prev = -1;
        for (let k = 0; k <= N; k += 1) {
          const ph = (-72 + (144 * k) / N) * (Math.PI / 180);
          const cf = Math.cos(ph) * R - R * 0.5;
          const cs = Math.sin(ph) * R;
          const th = 0.62 * Math.pow(Math.max(0, Math.cos(ph)), 1.3) + 0.03;
          const fxp = w.x + w.dx * cf + sx * cs;
          const fyp = 1.15 + sy * cs;
          const fzp = w.z + w.dz * cf + sz * cs;
          const al = 2.0 * fade * Math.pow(Math.max(0, Math.cos(ph)), 0.5);
          if (!mesh.room(2, 6)) {
            break;
          }
          const i0 = mesh.vert(fxp, fyp, fzp, 0.04, 0, color[0] * al, color[1] * al, color[2] * al, 1);
          mesh.vert(fxp - w.dx * th, fyp, fzp - w.dz * th, 0.04, 1, color[0] * al, color[1] * al, color[2] * al, 1);
          if (prev >= 0) {
            mesh.tri(prev, prev + 1, i0 + 1);
            mesh.tri(prev, i0 + 1, i0);
          }
          prev = i0;
        }
      }
      if (dt > 0) {
        for (let k = 0; k < 2; k += 1) {
          fx.emit({ x: w.x + fx.rand(-0.3, 0.3), y: fx.rand(0.3, 2.0), z: w.z + fx.rand(-0.3, 0.3), vx: -w.dx * fx.rand(1, 4), vy: fx.rand(-0.5, 0.5), vz: -w.dz * fx.rand(1, 4), life: fx.rand(0.15, 0.35), s0: 0.014, s1: 0.004,
            c0: [0.85, 0.85, 1], c1: color, a: 0.7, cell: FX_CELL.streak, drag: 1.5, stretch: 2.6 });
        }
        // 贴地带起一道尘
        if (fx.rand() < 0.6) {
          fx.emit({ x: w.x, y: 0.12, z: w.z, vx: fx.rand(-0.5, 0.5), vy: fx.rand(0.2, 0.6), vz: fx.rand(-0.5, 0.5), life: fx.rand(0.4, 0.8), s0: 0.22, s1: 0.6, c0: [0.3, 0.31, 0.36], a: 0.1, cell: FX_CELL.smokeA, add: false, rot: fx.rand(0, 6), drag: 1 });
        }
      }
      const L = this.lights.hit[1];
      if (L && i === 0) {
        L.node.setPosition(w.x, 1.2, w.z);
        L.node.active = true;
        L.luminousFlux = DUNGEON.hit * DUNGEON.fluxK * 1.2 * fade;
      }
    }
    mesh.end();
  }

  /**
   * 骨骼动画摆完之后:把正在出的招式摆到骨架上、把剑摆到手上、记刀光。
   * 没在出招时剑垂在身侧(指向前下方);跃空重劈用的是片段,剑顺着小臂的方向。
   */
  private poseLeader(): void {
    const c = this.leader;
    const sword = this.sword;
    if (!c || !sword || !this.trail || !this.aura) {
      return;
    }
    const dt = this.lastDt;
    const act = this.act;
    const rig = c.rig;
    const f = c.frame;
    const want = act && act.move && !act.move.clip ? 1 : 0;
    this.poseW += (want - this.poseW) * Math.min(1, dt * (want ? 30 : 12));
    if (Math.abs(want - this.poseW) < 0.01) {
      this.poseW = want;
    }
    const target = _v;
    let on = false;
    let color: [number, number, number] = [0.72, 0.88, 1];
    if (act && act.move && act.move.clip) {
      const u = Math.min(1, act.t / act.dur);
      on = u >= act.move.trail[0] && u <= act.move.trail[1];
      color = act.move.color as [number, number, number];
    } else if (act && act.move) {
      const u = Math.min(1, act.t / act.dur);
      poseAt(act.move, u, this.poseBuf);
      applyPose(c, this.poseBuf, Math.max(0.2, this.poseW), target);
      on = u >= act.move.trail[0] && u <= act.move.trail[1];
      color = act.move.color as [number, number, number];
    } else {
      const fore = rig.j('RightForeArm');
      const hand = rig.j('RightHand');
      if (act && fore && hand) {
        // 片段(过顶劈):剑顺着小臂,略往前带
        Vec3.subtract(target, hand.worldPosition, fore.worldPosition).normalize();
        target.set(target.x + f.fwd.x * 0.25, target.y + 0.1, target.z + f.fwd.z * 0.25).normalize();
        const u = act.t / act.dur;
        on = u > 0.5 && u < 0.76;
        color = [0.66, 0.6, 1.0];
      } else {
        const b = this.moving ? [0.62, -0.62, 0.42] : [0.78, -0.55, 0.3];      // 剑尖离地二三十厘米,不戳进地里
        target.set(f.fwd.x * b[0] + f.right.x * b[2], b[1], f.fwd.z * b[0] + f.right.z * b[2]).normalize();
      }
    }
    // 剑的方向往目标上靠(出招时跟得紧,平时慢一点)
    const k = Math.min(1, dt * (act ? 40 : 10));
    const prev = _q2v.set(this.bladeDir);
    this.bladeDir.set(this.bladeDir.x + (target.x - this.bladeDir.x) * k, this.bladeDir.y + (target.y - this.bladeDir.y) * k, this.bladeDir.z + (target.z - this.bladeDir.z) * k).normalize();
    const mv = _lead.set(this.bladeDir.x - prev.x, this.bladeDir.y - prev.y, this.bladeDir.z - prev.z);
    if (mv.lengthSqr() > 1e-5) {
      this.bladeLead.set(mv).normalize();
    }
    // 握柄在手腕再往前一点(手心)
    const hand = rig.j('RightHand');
    const fore = rig.j('RightForeArm');
    if (!hand || !fore) {
      return;
    }
    const hp = hand.worldPosition;
    Vec3.subtract(_grip, hp, fore.worldPosition).normalize().multiplyScalar(0.085).add(hp);
    if (this.gs && c.moves) {
      // 动作库的招式:剑固定在右手里(方向和握点是转套时量出来的,右手自己的坐标),刃朝小臂伸出去的方向
      const sw = c.moves.sword;
      Vec3.transformQuat(this.bladeDir, _v.set(sw.axis[0], sw.axis[1], sw.axis[2]), hand.worldRotation).normalize();
      Vec3.subtract(this.bladeLead, hp, fore.worldPosition).normalize();
      Vec3.transformQuat(_grip, _v.set(sw.grip[0] * c.scale, sw.grip[1] * c.scale, sw.grip[2] * c.scale), hand.worldRotation).add(hp);
    }
    sword.active = true;
    placeSword(sword, _grip, this.bladeDir, this.bladeLead);
    if (DUNGEON.bake) {
      const a = this.bakeAt(this.lx, 1.0, this.lz, 0, 0.35, 0);
      const l = (a[0] + a[1] + a[2]) / 3;
      _tint.set(Math.min(1.6, l + (a[0] - l) * 0.5), Math.min(1.6, l + (a[1] - l) * 0.5), Math.min(1.6, l + (a[2] - l) * 0.5));
      for (const m of this.swordLit) {
        m.setProperty('albedoScale', _tint);
      }
    }
    _base.set(_grip.x + this.bladeDir.x * this.swordRoot, _grip.y + this.bladeDir.y * this.swordRoot, _grip.z + this.bladeDir.z * this.swordRoot);
    _tip.set(_grip.x + this.bladeDir.x * this.swordLen, _grip.y + this.bladeDir.y * this.swordLen, _grip.z + this.bladeDir.z * this.swordLen);
    if (dt > 0) {
      _lead.set(_tip.x - this.tipPrev.x, _tip.y - this.tipPrev.y, _tip.z - this.tipPrev.z);
      if (_lead.lengthSqr() > 1e-6) {
        this.tipVel.set(_lead).normalize();
      }
      this.tipPrev.set(_tip);
    }
    this.trail.push(_base, _tip, on && dt > 0, color);
    this.trail.update(dt);
    // 突进:身体两侧拖出一条宽的光带(用同一种带子,两个端点取身体左右)
    const dashing = !!act && act.kind === 'dash' && act.t / act.dur > (act.move?.fx ? act.move.fx[0] : 0.2) && act.t / act.dur < (act.move?.fx ? act.move.fx[1] : 0.66);
    _base.set(this.lx - f.right.x * 0.42, 0.55, this.lz - f.right.z * 0.42);
    _tip.set(this.lx + f.right.x * 0.42, 1.45, this.lz + f.right.z * 0.42);
    this.aura.push(_base, _tip, dashing && dt > 0, [0.5, 0.44, 0.95]);
    this.aura.update(dt);
    this.stepWaves(dt);
    this.updateBar();
  }

  /** 右下角的技能按钮(网页上的几个圆钮:能点,也显示冷却)。 */
  private buildBar(): void {
    if (typeof document === 'undefined' || this.bar.attack) {
      return;
    }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9998;display:flex;gap:10px;align-items:flex-end;user-select:none;-webkit-user-select:none;touch-action:none';
    const defs: Array<[string, string, string, number]> = [['dash', '刺', 'K', 54], ['whirl', '旋', 'L', 54], ['smash', '劈', 'U', 54], ['wave', '气', 'I', 54], ['attack', '攻', 'J', 74]];
    for (const [kind, label, key, size] of defs) {
      const b = document.createElement('div');
      b.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:rgba(16,20,28,.55);border:1px solid rgba(255,255,255,.28);color:#e8eefc;`
        + `font:600 ${Math.round(size * 0.36)}px/${size}px sans-serif;text-align:center;position:relative;cursor:pointer;backdrop-filter:blur(3px)`;
      b.textContent = label;
      const hint = document.createElement('span');
      hint.style.cssText = 'position:absolute;right:2px;bottom:-2px;font:11px/14px monospace;color:rgba(232,238,252,.6)';
      hint.textContent = key;
      b.appendChild(hint);
      b.dataset.label = label;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input(kind);
      });
      wrap.appendChild(b);
      this.bar[kind] = b;
    }
    document.body.appendChild(wrap);
  }

  private updateBar(): void {
    for (const k of Object.keys(this.bar)) {
      const b = this.bar[k];
      const cd = k === 'attack' ? 0 : this.cd[k];
      const text = cd > 0.05 ? cd.toFixed(cd < 1 ? 1 : 0) : (b.dataset.label ?? '');
      if (b.firstChild && b.firstChild.nodeValue !== text) {
        b.firstChild.nodeValue = text;
        b.style.opacity = cd > 0.05 ? '0.5' : '1';
      }
    }
  }

  // ───────────────────────── 调试 ─────────────────────────
  info(): Record<string, unknown> {
    const root: any = director.root;
    return { opened: this.opened, error: this.lastError, stats: this.stats, time: +this.time.toFixed(2), leader: this.leader ? [+this.lx.toFixed(2), +this.lz.toFixed(2), Math.round(this.lyaw)] : null,
      mobs: this.mobs.map((m) => `${m.c.name}:${m.state}:${m.hp}`), followers: this.followers.length, act: this.act ? `${this.act.kind}:${this.act.move ? this.act.move.name : '跃空重劈'}:${(this.act.t / this.act.dur).toFixed(2)}` : '', combo: this.comboI, cd: { ...this.cd }, tier: DUNGEON.tier, fps: +this.fps.toFixed(1), fpsLow: +this.fpsLow.toFixed(1), hud: this.hudEl ? this.hudEl.textContent : '', mobile: sys.isMobile,
      real: this.fixtures.filter((f) => f.on).length, fixtures: this.fixtures.length, lightsOn: this.recs.filter((r) => r.L.node.active).length, stick: { ...this.stick }, view: { ...this.view }, free: !!this.free,
      post: this.post?.info(), autoQ: this.qSteps.slice(), gpu: GPU_NAME.slice(0, 90), draws: root?.device?.numDrawCalls, tris: root?.device?.numTris, fx: this.fx?.stats, cfg: { ...DUNGEON },
      canvas: game.canvas ? [game.canvas.width, game.canvas.height] : null };
  }

  set(patch: Partial<DungeonCfg>): Record<string, unknown> {
    Object.assign(DUNGEON, patch);
    this.applyLights();
    if (patch.reflect !== undefined) {
      this.applyReflection();
    }
    if (patch.post !== undefined && this.post) {
      if (DUNGEON.post > 0) {
        this.post.enable(DUNGEON.post);
      } else {
        this.post.disable();
      }
    }
    return { ...DUNGEON };
  }

  /** 把主角放到某处(跟班跟过去)。 */
  tp(x: number, z: number, yaw?: number): void {
    this.lx = x;
    this.lz = z;
    if (yaw !== undefined) {
      this.lyaw = yaw;
    }
    this.leader?.place(x, this.floorY(x, z), z, this.lyaw);
    for (const f of this.followers) {
      const a = (this.lyaw * Math.PI) / 180;
      f.x = x + Math.cos(a) * f.ox + Math.sin(a) * f.oz;
      f.z = z - Math.sin(a) * f.ox + Math.cos(a) * f.oz;
      f.yaw = this.lyaw;
      f.c.place(f.x, this.floorY(f.x, f.z), f.z, f.yaw);
    }
  }

  setView(v: Partial<{ yaw: number; pitch: number; dist: number; fov: number }>): void {
    Object.assign(this.view, v);
    this.free = null;
    this.pull = this.view.dist;
    this.syncCam(0);
  }

  /** 镜头不跟主角,直接摆到某个位置看向某个点(截图用);不给参数 = 回到跟主角。 */
  shot(pos?: [number, number, number], look?: [number, number, number], fov?: number): void {
    this.free = pos && look ? { pos: new Vec3(pos[0], pos[1], pos[2]), look: new Vec3(look[0], look[1], look[2]) } : null;
    if (fov) {
      this.view.fov = fov;
    }
    this.syncCam(0);
  }
}

export const dungeon = new Dungeon();

function param(name: string): string | null {
  try {
    const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  } catch (error) {
    return null;
  }
}

/** 显卡型号(WebGL 调试扩展);拿不到返回空串。 */
function gpuRenderer(): string {
  try {
    const cv = document.createElement('canvas');
    const gl = (cv.getContext('webgl2') || cv.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      return '';
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    (gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return name;
  } catch (error) {
    void error;
    return '';
  }
}

/** 是不是电脑上的核显:Intel 的集成显卡(Arc 独显 A3xx~A7xx / B 系列除外)、AMD 的 Radeon Graphics / Vega 核显。 */
function isIntegratedGpu(name: string): boolean {
  if (/NVIDIA|GeForce|Quadro|RTX|Radeon\s*(RX|Pro)|Arc\(TM\)\s*[AB]\d/i.test(name)) {
    return false;
  }
  return /Intel|Iris|UHD Graphics|Radeon\(TM\)\s*(Graphics|\d{3}M)|Radeon Vega|Vega \d/i.test(name);
}

const GPU_NAME = typeof document !== 'undefined' ? gpuRenderer() : '';

function boot(): void {
  // 第十四轮(11-18 用户:笔记本 Arc 140V 核显每个动作都卡):电脑上没指定 &dq= 时,识别到核显就用核显档
  const q = param('dq') || (sys.isMobile ? 'phone' : isIntegratedGpu(GPU_NAME) ? 'igpu' : 'pc');
  if (TIERS[q]) {
    Object.assign(DUNGEON, TIERS[q], { tier: q });
  }
  if (param('g3dwild') === '1') {
    Object.assign(DUNGEON, WILD_CFG, { scene: 'wild' });
  }
  if (param('g3dcity') === '1') {
    Object.assign(DUNGEON, CITY_CFG, { scene: 'city', bld: param('bld') ?? '' });
    if (param('bglow') !== null && !Number.isNaN(Number(param('bglow')))) {
      DUNGEON.bldGlow = Number(param('bglow'));
    }
    if (param('csky') !== null && !Number.isNaN(Number(param('csky')))) {
      DUNGEON.citySky = Number(param('csky'));
    }
    if (param('pavefine') !== null) {
      DUNGEON.paveFine = param('pavefine') !== '0';
    }
    for (const [q, key] of [['pavem', 'paveM'], ['pavek', 'paveK'], ['pavespec', 'paveSpec']] as Array<[string, 'paveM' | 'paveK' | 'paveSpec']>) {
      if (param(q) !== null && !Number.isNaN(Number(param(q)))) {
        DUNGEON[key] = Number(param(q));
      }
    }
    setArea({ ...CITY, X1: CITY.X1 + 6.8 });          // 第十轮:往东放宽到教堂门口(台地前沿的矮墙是挡路块,只有台阶那一段能上去)
    if (param('cityv4') === '1') {
      DUNGEON.cityFull = true;
      applyCityV4Ground();          // 主城 v4(11-19 用户「Build v4」)
      if (param('pavek') === null) {
        DUNGEON.paveK = 0.66;
      }
      // v4 整体提亮(11-19 用户反馈旧版「部分地形模糊看不清」):月光 340k → 560k、环境光 6300 → 13000(可用 &moon= / &ambient= 覆盖)
      // 白天(11-19 参考燕云十六声):太阳 950k、路灯压到 5(白天只剩一点暖点)
      DUNGEON.moon = param('moon') !== null ? Number(param('moon')) : 780000;          // 11-20 第五轮:950k → 780k(配合天光加大,亮处不变、影子透亮)
      DUNGEON.ambient = param('ambient') !== null ? Number(param('ambient')) : 75000;
      DUNGEON.lamp = param('lamp') !== null ? Number(param('lamp')) : 5;
      // 11-20 跑图:影子里黑成一片(教堂背阴面整块看不见)→ 天光 4200 → 30000;地面改哑光干地(粗糙度 1、高光 0.08),
      // 湿石板的天光反射在正交拍摄下按每块的视线算会一格一格明暗不一,燕云的地面本来也是干的沙土 / 草
      DUNGEON.skyK = param('skyk') !== null ? Number(param('skyk')) : 95000;          // 11-20 第五轮:30000 → 95000(大教堂背阴面 / 影子里草地 16,26,13 → 28,46,23)
      DUNGEON.gloss = 1;
      DUNGEON.paveSpec = 0.08;
    } else if (param('cityfull') === '1') {
      DUNGEON.cityFull = true;
      applyCityFullGround();
      if (param('pavek') === null) {
        DUNGEON.paveK = 0.6;          // 整城:地面压暗(原型里是暗的湿石板;0.84 时俯视整城月光下一片发白)
      }
    }
  }
  DUNGEON.hud = param('dfps') === '1' || (sys.isMobile && param('dfps') !== '0');
  if (param('autoq') === '0' || param('bench') === '1') {          // 自动测速时以档位默认画质为准,不让自动降级先动
    DUNGEON.autoQ = false;
  }
  if (param('autoqfps') !== null && !Number.isNaN(Number(param('autoqfps')))) {
    DUNGEON.autoQFps = Number(param('autoqfps'));
  }
  if (param('pix') !== null && !Number.isNaN(Number(param('pix')))) {
    DUNGEON.pixBudget = Number(param('pix'));
  }
  const post = param('dpost');
  if (post !== null && !Number.isNaN(Number(post))) {
    DUNGEON.post = Number(post);
  }
  DUNGEON.snd = param('dsnd') !== '0';
  if (param('dvol')) {
    DUNGEON.vol = Math.max(0, Math.min(1.5, Number(param('dvol')) || 0.8));
  }
  if (param('dpace')) {
    DUNGEON.pace = Number(param('dpace')) || 1;
  }
  if (param('dglint')) {
    DUNGEON.glint = Number(param('dglint')) || 0;
  }
  if (param('dspot') === '1') {
    DUNGEON.spotShadow = true;
  }
  if (param('dreflect') === '0') {
    DUNGEON.reflect = false;
  }
  if (param('dfloor')) {
    DUNGEON.floor = Number(param('dfloor')) || DUNGEON.floor;
  }
  // 等主场景起来再接管(脚本加载时场景还没进)
  const timer = setInterval(() => {
    const scene = director.getScene();
    if (!scene || !director.root || !scene.getComponentInChildren(Canvas)) {
      return;
    }
    clearInterval(timer);
    dungeon.open();
  }, 120);
}

if (!EDITOR && sys.isBrowser) {
  (globalThis as any).__g3dd = { dungeon, cfg: DUNGEON, info: () => dungeon.info(), set: (p: Partial<DungeonCfg>) => dungeon.set(p),
    view: (v: any) => dungeon.setView(v), shot: (p?: any, l?: any, f?: number) => dungeon.shot(p, l, f), tp: (x: number, z: number, yaw?: number) => dungeon.tp(x, z, yaw),
    audio: sfx, attack: () => dungeon.attack(), skill: (k: string) => dungeon.input(k), clip: (name?: string, t = 0) => { dungeon.dbgClip = name ? { name, t } : null; return dungeon.leader?.names; }, go: (x: number, z: number) => { dungeon.auto = { x, z }; },
    post: (p: Partial<PostCfg>) => { dungeon.post?.set(p); return dungeon.post?.info(); },
    bld: (key: string, o: { yaw?: number; k?: number; dx?: number; dy?: number; dz?: number; sx?: number; sy?: number; wf?: number } = {}) => dungeon.tuneBld(key, o),
    freeze: (on: boolean) => { dungeon.frozen = on; }, pause: (on: boolean) => { if (on) { game.pause(); } else { game.resume(); } }, step: (dt: number, n = 1) => { dungeon.fixedDt = dt; for (let i = 0; i < n; i += 1) { game.step(); } dungeon.fixedDt = 0; return dungeon.time; } };
  if (param('g3ddungeon') === '1' || param('g3dwild') === '1' || param('g3dcity') === '1') {
    boot();
  }
}
