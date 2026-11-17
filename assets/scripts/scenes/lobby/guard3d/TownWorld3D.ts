import { Camera, Color, DirectionalLight, director, EventKeyboard, EventMouse, game, Input, input, KeyCode, Layers, Material, Mesh, MeshRenderer, Node, renderer, RenderTexture, TextureCube, UITransform, utils, Vec3 } from 'cc';
import { material } from './G3DKit';
import { buildEnvCube } from './G3DSkins';
import { buildSkyCube } from './G3DSky';
import type { SkyOpts } from './G3DSky';
import type { PostCfg } from './TownPost3D';
import { GROUND_STATIC_LAYER, groundFlag, groundReady, TownGround3D } from './TownGround3D';
import { FieldPost, postLevel } from './TownPost3D';

/**
 * 野外的真 3D 场景(实验,2026-11-16;?field3d=2,默认关)。
 *
 * 由来:用户看完「3D 角色贴回 2D 地图」那一版后说「地形,技能也可以用酷炫的 3D 素材」。贴回 2D 的做法接不了 3D 地形 ——
 * 这里换成:地面、摆件、角色、技能都在同一个 3D 世界里,有真的前后遮挡、真的投影、技能的光能照到地面和周围的东西;
 * 战斗逻辑和界面一行不动(还是 LobbyTownRenderer 在跑,2D 的血条 / 名字 / 飘字 / 摇杆原样叠在最上面)。
 *
 * 一帧怎么画(按先后):
 * 1. 「地表相机」把 2D 的贴地层(多层地表、河、崖、营地地面、脚下的光圈…)画进一张和屏幕一样大的贴图;
 * 2. 3D 相机画 3D 世界:一块铺满画面的地面(颜色 = 上面那张贴图,所以地表美术原样保留,同时能接影子、能被技能的光照亮)、
 *    角色、摆件、技能特效;
 * 3. 界面相机照旧画剩下的 2D(头顶的血条名字、飘字、界面)。
 *
 * 和 2D 地图怎么对齐:3D 相机是正交的、俯角固定(45°),没有近大远小 —— 和 2D 地图的画法一致。
 * 地图坐标 (x, y) ↔ 3D 世界 (x / U, 0, -y / (U · sin 俯角)),U = 每米多少地图单位。这样地面上任何一点在画面上的位置
 * 和 2D 里一模一样(所以 2D 的血条名字不用动);竖着的东西每米在画面上高 U · cos 俯角。
 *
 * 颜色:场景默认的色调映射(ACES)会把手绘的地表和贴图洗白,开着的时候暂时切成线性输出,灯光按「没被挡住的地面 = 原图的颜色」校过;
 * 关掉时连同环境光 / 阴影 / 主光 / 主相机一起原样还原(做法同 G3DStudio)。
 */

/** 3D 世界里的东西单独一层:只有 3D 相机看。 */
export const FIELD_LAYER = 1 << 11;
/** 2D 贴地层在这一层:只有「地表相机」看(画进贴图),界面相机不再画它。 */
export const GROUND_LAYER = 1 << 12;

export interface WorldCfg {
  /** 2D 地图上多少个单位算 1 米。 */
  unitsPerM: number;
  /** 镜头俯角(度)。 */
  pitch: number;
  /** 主光 / 环境光照度(和场景同一套曝光:38400 ≈ 1 倍)。 */
  sun: number;
  ambient: number;
  sunColor: [number, number, number];
  skyColor: [number, number, number];
  groundColor: [number, number, number];
  /** 主光照过去的方向(世界坐标;镜头在 +z 一侧往 -z 看)。 */
  sunDir: [number, number, number];
  /** 阴影贴图边长(0 = 不要投影)、覆盖范围的一半(米)。 */
  shadow: number;
  shadowHalf: number;
  /** 地面切成几块(技能的点光只重画它照得到的那几块)。 */
  tilesX: number;
  tilesZ: number;
}

export const WORLD_CFG: WorldCfg = {
  unitsPerM: 148, pitch: 45,
  // 灯是对着画面校过的(2026-11-16,量法见 tools/proto3d/field/field_dev.py):没被挡住的地面 = 主光 0.52 + 环境光 0.48 ≈ 原图的 1 倍,
  // 影子里只剩环境光(偏冷);环境光的「地面色」故意比「天空色」亮 —— 竖着的面(角色朝镜头的一面)靠它补光,相当于亮地面的反光
  sun: 92500, ambient: 34560,
  sunColor: [255, 239, 204], skyColor: [129, 139, 161], groundColor: [255, 244, 225],
  // 主光从左侧上方来、略微朝里:影子往右倒(看得见),角色和模型左亮右暗、有体积;朝镜头的一面靠环境光补
  sunDir: [0.7, -0.7, -0.12],
  shadow: 2048, shadowHalf: 11,
  tilesX: 8, tilesZ: 5,
};

/** 自由视角开不开:控制台现场改的(__LC_FIELD_CAM)优先,否则地址参数 ?fcam=1 / localStorage.lcFieldCam。开着时地面一定用新做法。 */
let camFromPage: boolean | null = null;
export function camFlag(): boolean {
  const g = globalThis as any;
  if (g.__LC_FIELD_CAM !== undefined) {
    return !!g.__LC_FIELD_CAM && g.__LC_FIELD_CAM !== '0';
  }
  if (camFromPage === null) {
    try {
      const m = /[?&]fcam=(\d)\b/.exec(location.search);
      camFromPage = m ? m[1] !== '0' : localStorage.getItem('lcFieldCam') === '1';
    } catch (error) {
      camFromPage = false;
    }
  }
  return camFromPage;
}

// ───────────────────────── 灯光方案 ─────────────────────────
/**
 * 一套「灯光方案」= 主光 / 环境光 + 天空 + 雾 + 调色的一组取值。day = 原来那套白天(对着手绘地表校过的,不改任何东西);
 * dusk = 黄昏(2026-11-17 加的对照方案:用户说和参考的那个 FPS 差太多,差距里有一条是「人家是暗场景 + 很多盏带颜色的灯」,
 * 这里给野外也配一套压暗的、低角度暖色太阳 + 冷色天光 + 营地火光的,摆出来对比,不替换白天)。
 * 开关:控制台现场改的(__LC_FIELD_LOOK)优先,否则地址参数 ?flook=dusk / localStorage.lcFieldLook。
 */
export interface Look {
  /** 盖在 WORLD_CFG 上的灯光取值。 */
  cfg: Partial<WorldCfg>;
  sky: Omit<SkyOpts, 'size' | 'seed' | 'sunDir'>;
  /**
   * 雾(只在自由视角下开):颜色自动取天空地平线的颜色再乘 tint;start / density / max 见 TownPost3D。
   * lobe > 0 = 雾分两种颜色(朝太阳那一侧取 sky.horizon、背着太阳取 sky.horizonAway),数越大暖色越集中在太阳那一小块方向上。
   */
  fog: { tint: [number, number, number]; start: number; density: number; max: number; lobe?: number };
  /** 盖在后期参数上的取值(曝光 / 泛光 / 冷暖)。 */
  post: Partial<PostCfg>;
  /** 营地 / 路灯的火光强不强(0 = 不点灯;见 TownLamps3D)。 */
  lamps: number;
}

export const LOOKS: Record<string, Look> = {
  day: {
    cfg: {},
    sky: { zenith: [0.2, 0.42, 0.84], horizon: [0.66, 0.78, 0.9], ground: [0.36, 0.38, 0.36], sunColor: [1.0, 0.9, 0.7], sunSize: 0.08,
      cloud: [1.0, 0.99, 0.97], cloudShade: [0.56, 0.63, 0.76], cover: 0.5, cloudScale: 1.25 },
    fog: { tint: [0.95, 0.97, 1.0], start: 14, density: 0.05, max: 0.94 },
    post: {},
    lamps: 0,
  },
  dusk: {
    cfg: { sun: 84000, ambient: 21000, sunColor: [255, 176, 112], skyColor: [104, 122, 178], groundColor: [156, 134, 126], sunDir: [0.84, -0.3, -0.44] },
    sky: { zenith: [0.14, 0.2, 0.44], horizon: [1.0, 0.6, 0.33], horizonAway: [0.44, 0.42, 0.6], ground: [0.2, 0.17, 0.18], sunColor: [1.5, 0.8, 0.36], sunSize: 0.11,
      cloud: [1.0, 0.72, 0.54], cloudShade: [0.36, 0.31, 0.44], cover: 0.56, cloudScale: 1.25 },
    fog: { tint: [0.9, 0.9, 0.96], start: 12, density: 0.04, max: 0.92, lobe: 2.4 },
    post: { exposure: 1.08, bloomIntensity: 0.62, bloomThreshold: 1.0, shadowTint: [0.9, 0.96, 1.12], highlightTint: [1.07, 1.0, 0.9], vignette: 0.26, saturation: 1.1 },
    lamps: 1,
  },
};

let lookFromPage: string | null = null;
export function lookFlag(): string {
  const g = globalThis as any;
  if (typeof g.__LC_FIELD_LOOK === 'string') {
    return g.__LC_FIELD_LOOK;
  }
  if (lookFromPage === null) {
    try {
      const m = /[?&]flook=([a-z]+)\b/.exec(location.search);
      lookFromPage = m ? m[1] : localStorage.getItem('lcFieldLook') || 'day';
    } catch (error) {
      lookFromPage = 'day';
    }
  }
  return lookFromPage;
}

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** 自由视角的镜头:绕着队长转的第三人称(度 / 米)。 */
export interface ViewCfg {
  /** 绕竖轴转多少度(0 = 和原来的固定镜头同一个方向,从南往北看)。 */
  yaw: number;
  /** 俯角(度):越小越平视。 */
  pitch: number;
  /** 离队长多远(米)。 */
  dist: number;
  /** 纵向视角(度)。 */
  fov: number;
  minPitch: number;
  maxPitch: number;
  minDist: number;
  maxDist: number;
}

const _v = new Vec3();
const _l = new Vec3();
const _r = new Vec3();
const _u = new Vec3();
const _d = new Vec3();
const _a = new Vec3();
const _b = new Vec3();
const _c = new Vec3();
const skyCubes = new Map<string, TextureCube>();

export class TownWorld3D {
  readonly root: Node;
  readonly cam: Camera;
  readonly cfg: WorldCfg;
  /** 后期处理(环境光遮蔽 / 泛光 / 调色),挂在 3D 相机上;档位见 TownPost3D.postLevel()。 */
  readonly post: FieldPost;
  /** 铺在世界里的地面(新做法,见 TownGround3D;开关 ?fground=1)。没开时用下面那块「对着镜头贴的平板」。 */
  readonly ground3d = new TownGround3D();
  /** 这一次打开用的是不是新做法的地面。 */
  private worldGround = false;
  /**
   * 自由视角(?fcam=1):相机换成透视的第三人称,绕着队长转 —— 鼠标右键拖动转 / 压低,滚轮缩放,Z / C 键转、X 键回正
   * (Q / E 不能用:E 是游戏里的交互键);不开时是原来那台对着 2D 画面的正交相机。view = 想要的镜头,eye = 这一帧平滑后的。
   */
  free = false;
  readonly view: ViewCfg = { yaw: 0, pitch: 40, dist: 14, fov: 38, minPitch: 4, maxPitch: 80, minDist: 3.5, maxDist: 40 };
  private eye = { yaw: 0, pitch: 40, dist: 14 };
  private look = new Vec3();
  private lookReady = false;
  private drag = { on: false, x: 0, y: 0 };
  private turn = 0;
  private freeSaved: any = null;
  /**
   * 自由视角下的可视范围(米,以队长为中心):大件(树 / 石堆 / 营帐)、小件(草 / 蕨 / 碎石)、怪。
   * 2D 那边的视野裁剪是按「屏幕那么大一块」来的,镜头压低后看得远,范围按这几个数放大(见 TownUnits3D 的 wide);
   * 雾在这个距离上已经很浓,东西是从雾里淡出来的,不是凭空冒出来。
   */
  readonly range = { big: 46, small: 21, unit: 28 };
  /** 现在用的是哪套灯光方案;打开时被它改掉的原值(关掉时放回去)。 */
  lookName = 'day';
  private lookSaved: { cfg: Record<string, unknown>; post: Record<string, unknown> } | null = null;
  /** 这一帧界面相机的取景(把 3D 世界里的点换算回 2D 世界坐标用,见 project)。 */
  private ui2d = { x: 0, y: 0, halfH: 1, aspect: 1, tf: null as UITransform | null };
  private vpFrame = -1;
  /** 这一帧镜头正中对着的地面点(3D 世界坐标)、画面的一半有多宽多高(米)。 */
  readonly focus = new Vec3();
  halfW = 1;
  halfH = 1;
  /** 这一帧镜头正中对着的地图坐标(2D 地图单位)。 */
  mapX = 0;
  mapY = 0;
  private groundCam: Camera;
  private rt: RenderTexture | null = null;
  private ground: Node;
  private groundMat: Material;
  private light: DirectionalLight;
  private opened = false;
  private saved: any = null;
  private uiCam: Camera | null = null;
  private sinP = Math.SQRT1_2;
  private cosP = Math.SQRT1_2;
  private layered: Node | null = null;
  private layerTick = 0;
  private layerCount = -1;
  private hidden: Array<{ node: Node; was: boolean }> = [];
  private groundLayerWas = 0;

  constructor(cfg: WorldCfg = WORLD_CFG) {
    this.cfg = cfg;
    const scene = director.getScene()!;
    this.root = new Node('TownWorld3D');
    this.root.layer = FIELD_LAYER;
    scene.addChild(this.root);
    this.root.active = false;

    const camNode = new Node('TownWorld3DCam');
    this.root.addChild(camNode);
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.near = 1;
    cam.far = 260;
    // 还要带上「默认层」:内置管线只给看得见默认层的相机走完整流程(阴影贴图、追加的点光);只看自定义层的相机走的是简化流程,没有影子
    cam.visibility = FIELD_LAYER | Layers.Enum.DEFAULT;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(0, 0, 0, 255);
    cam.priority = 20;                 // 主相机(0)之后、界面相机(1 << 30)之前
    this.cam = cam;
    this.post = new FieldPost(cam);

    // 地表相机:和界面相机同一个位置、同一个取景,只看贴地层,画进贴图(优先级最低 = 最先画,同一帧 3D 地面就能用上)
    const gNode = new Node('TownWorld3DGroundCam');
    this.root.addChild(gNode);
    const gcam = gNode.addComponent(Camera);
    gcam.projection = Camera.ProjectionType.ORTHO;
    gcam.visibility = GROUND_LAYER | GROUND_STATIC_LAYER;
    gcam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    gcam.clearColor = new Color(0, 0, 0, 255);
    gcam.priority = -20;
    this.groundCam = gcam;

    // 地面:铺满画面的一块平板(切成小块),颜色取地表贴图;粗糙、不反光,法线朝上
    this.groundMat = material('builtin-standard', { USE_ALBEDO_MAP: true });
    this.groundMat.setProperty('roughness', 1);
    this.groundMat.setProperty('metallic', 0);
    this.groundMat.setProperty('specularIntensity', 0);
    this.ground = new Node('TownWorld3DGround');
    this.ground.layer = FIELD_LAYER;
    this.root.addChild(this.ground);
    this.buildGround();

    const lightNode = new Node('TownWorld3DSun');
    lightNode.layer = FIELD_LAYER;
    this.root.addChild(lightNode);
    this.light = lightNode.addComponent(DirectionalLight);
    this.applyCfg();
  }

  /** 地面网格:x、z 都是 -0.5~0.5(多出 1% 压住画面边缘的缝),贴图坐标 = 画面上的位置(u 从左到右,v 从近到远)。 */
  private buildGround(): void {
    const nx = this.cfg.tilesX;
    const nz = this.cfg.tilesZ;
    const over = 0.01;
    const span = 1 + over * 2;
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const x0 = -0.5 - over + (span * ix) / nx;
        const x1 = -0.5 - over + (span * (ix + 1)) / nx;
        const z0 = -0.5 - over + (span * iz) / nz;
        const z1 = -0.5 - over + (span * (iz + 1)) / nz;
        // z 越小越远(画面上方):v = 0.5 - z
        const mesh: Mesh = utils.MeshUtils.createMesh({
          positions: [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1],
          normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
          uvs: [x0 + 0.5, 0.5 - z0, x1 + 0.5, 0.5 - z0, x1 + 0.5, 0.5 - z1, x0 + 0.5, 0.5 - z1],
          indices: [0, 2, 1, 0, 3, 2],
        }, undefined, { calculateBounds: true });
        const n = new Node(`G_${ix}_${iz}`);
        n.layer = FIELD_LAYER;
        this.ground.addChild(n);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setSharedMaterial(this.groundMat, 0);
        mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
        mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
      }
    }
  }

  /** 按配置摆相机俯角、主光方向和强度(开着的时候连同场景的环境光 / 阴影一起更新)。 */
  applyCfg(patch?: Partial<WorldCfg>): void {
    if (patch) {
      Object.assign(this.cfg, patch);
    }
    const cfg = this.cfg;
    const p = (cfg.pitch * Math.PI) / 180;
    this.sinP = Math.sin(p);
    this.cosP = Math.cos(p);
    this.cam.node.setRotationFromEuler(-cfg.pitch, 0, 0);
    this.light.color = new Color(cfg.sunColor[0], cfg.sunColor[1], cfg.sunColor[2], 255);
    this.light.illuminance = cfg.sun;
    if (this.opened) {
      this.applyGlobals();
    }
  }

  private applyGlobals(): void {
    const scene = director.getScene()!;
    const cfg = this.cfg;
    const amb = scene.globals.ambient;
    amb.skyLightingColor = new Color(cfg.skyColor[0], cfg.skyColor[1], cfg.skyColor[2], 255);
    amb.groundLightingColor = new Color(cfg.groundColor[0], cfg.groundColor[1], cfg.groundColor[2], 255);
    amb.skyIllum = cfg.ambient;
    const sh = scene.globals.shadows;
    const light = this.light;
    if (cfg.shadow > 0) {
      sh.enabled = true;
      sh.type = renderer.scene.ShadowType.ShadowMap;
      sh.shadowMapSize = cfg.shadow;
      light.shadowEnabled = true;
      light.shadowPcf = renderer.scene.PCFType.SOFT_2X;
      light.shadowBias = 0.0003;
      light.shadowNormalBias = 0.012;
      light.shadowFixedArea = true;          // 固定一块正交范围,跟着镜头走
      // 只要 1 级:引擎默认 4 级,内置管线会把所有投影的东西照着 4 级各画一遍、每级只占阴影贴图的四分之一(固定范围用不上分级)
      light.csmLevel = renderer.scene.CSMLevel.LEVEL_1;
      light.shadowNear = 1;
      light.shadowFar = 160;
      light.shadowOrthoSize = cfg.shadowHalf;
    } else {
      light.shadowEnabled = false;
      sh.enabled = false;
    }
  }

  // ───────────────────────── 开 / 关 ─────────────────────────
  /** self = 野外渲染器(看这张地图适不适合自由视角)。 */
  open(self?: any): void {
    if (this.opened) {
      return;
    }
    this.opened = true;
    this.root.active = true;
    const scene = director.getScene()!;
    const amb = scene.globals.ambient;
    const sh = scene.globals.shadows;
    const sky = scene.globals.skybox;
    const post = (scene.globals as any).postSettings;
    const mainLight = scene.getChildByName('Main Light')?.getComponent(DirectionalLight) ?? null;
    const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    this.saved = { mainLight, mainLightOn: mainLight?.enabled ?? false, mainCam, mainCamOn: mainCam?.enabled ?? false, mainCamVis: mainCam?.visibility ?? 0,
      skyIllum: amb.skyIllum, sky: amb.skyLightingColor.clone(), ground: amb.groundLightingColor.clone(),
      shOn: sh.enabled, shType: sh.type, shSize: sh.shadowMapSize, envmap: sky.envmap, envType: (sky as any).envLightingType,
      tone: post ? post.toneMappingType : undefined };
    if (mainLight) {
      mainLight.enabled = false;
    }
    if (mainCam) {
      // 主相机平时只是清屏画一遍天空盒:开着 3D 时清屏由 3D 相机负责,它不用画了
      mainCam.visibility &= ~(FIELD_LAYER | GROUND_LAYER | GROUND_STATIC_LAYER);
      mainCam.enabled = false;
    }
    if (post) {
      post.toneMappingType = 1;                // 线性输出:手绘地表 / 贴图在 1 倍光下就是原图的颜色
    }
    // 地面用哪种做法:新做法 = 按地图坐标烘成贴图集、铺在 3D 世界里(原来那块对着镜头贴的平板和它的相机停用)。自由视角一定要新做法
    // 有手绘房子的地图(晨风村)不给自由视角:房子是一张对着固定镜头画的图,没有别的面,镜头一转它只能跟着转 —— 整栋房子在原地打转
    const painted = ((self?.def?.buildings as unknown[] | undefined)?.length ?? 0) > 0;
    this.free = camFlag() && groundReady() && !painted;
    this.worldGround = (groundFlag() || this.free) && groundReady();
    const look = this.applyLook();
    try {
      const d = this.cfg.sunDir;
      if (this.free || this.lookName !== 'day') {
        // 看得见天的(自由视角)/ 换了灯光方案的:用带云的那张天空,同时当环境反射
        sky.envmap = this.skyCube(this.lookName, look, this.free ? 256 : 128);
      } else {
        sky.envmap = buildEnvCube([{ dir: [-d[0], -d[1], -d[2]], color: [2.2, 2.0, 1.6], width: 0.26 }], [0.44, 0.58, 0.86], [0.74, 0.78, 0.8], [0.2, 0.19, 0.15], 64);
      }
      (sky as any).envLightingType = 1;        // 半球漫反射 + 环境反射
    } catch (error) {
      console.warn('[f3d] env cube', error);
    }
    this.applyGlobals();
    this.light.enabled = true;
    const level = postLevel();
    if (level > 0) {
      this.post.enable(level);
    }
    this.ground.active = !this.worldGround;
    this.groundCam.enabled = !this.worldGround;
    if (this.free) {
      this.enterFree();
    }
  }

  /** 套上一套灯光方案:改主光 / 环境光、雾和调色(改之前的值记下来,close 时放回去)。返回用的是哪一套。 */
  private applyLook(): Look {
    const name = lookFlag();
    const look = LOOKS[name] ?? LOOKS.day;
    this.lookName = LOOKS[name] ? name : 'day';
    const copy = (v: unknown): unknown => (Array.isArray(v) ? v.slice() : v);
    const cfg = this.cfg as unknown as Record<string, unknown>;
    const pc = this.post.cfg as unknown as Record<string, unknown>;
    // 雾的颜色 = 天空地平线的颜色(天空盒画出来是「贴图颜色转线性 × 环境光倍数」),远处的东西淡进天边
    const amb = (look.cfg.ambient ?? this.cfg.ambient) / 38400;
    const h = look.sky.horizon;
    const tint = look.fog.tint;
    const fogColor = [toLinear(h[0]) * amb * tint[0], toLinear(h[1]) * amb * tint[1], toLinear(h[2]) * amb * tint[2]];
    const ha = look.sky.horizonAway ?? h;
    const fogAway = [toLinear(ha[0]) * amb * tint[0], toLinear(ha[1]) * amb * tint[1], toLinear(ha[2]) * amb * tint[2]];
    const sd = (look.cfg.sunDir ?? this.cfg.sunDir) as [number, number, number];
    const sm = Math.hypot(sd[0], sd[1], sd[2]) || 1;
    const postPatch: Record<string, unknown> = { ...look.post, fogColor, fogStart: look.fog.start, fogDensity: look.fog.density, fogMax: look.fog.max,
      fogAway, fogSun: [-sd[0] / sm, -sd[1] / sm, -sd[2] / sm], fogLobe: look.fog.lobe ?? 0 };
    const saved = { cfg: {} as Record<string, unknown>, post: {} as Record<string, unknown> };
    for (const k of Object.keys(look.cfg)) {
      saved.cfg[k] = copy(cfg[k]);
      cfg[k] = copy((look.cfg as Record<string, unknown>)[k]);
    }
    for (const k of Object.keys(postPatch)) {
      saved.post[k] = copy(pc[k]);
      pc[k] = copy(postPatch[k]);
    }
    this.lookSaved = saved;
    this.applyCfg();
    return look;
  }

  private restoreLook(): void {
    const s = this.lookSaved;
    this.lookSaved = null;
    if (!s) {
      return;
    }
    Object.assign(this.cfg, s.cfg);
    Object.assign(this.post.cfg, s.post);
    this.applyCfg();
  }

  /** 这套灯光方案的天空(立方体贴图;画一次要一百来毫秒,同一套同一个大小只画一次,全程留着)。 */
  private skyCube(name: string, look: Look, size: number): TextureCube {
    const d = this.cfg.sunDir;
    const key = `${name}:${size}:${d.join(',')}`;
    let cube = skyCubes.get(key);
    if (!cube) {
      cube = buildSkyCube({ ...look.sky, sunDir: [-d[0], -d[1], -d[2]], size, seed: 7 });
      cube.addRef();
      skyCubes.set(key, cube);
    }
    return cube;
  }

  /** 进自由视角:相机换成透视、清屏换成天空、投影的范围放大、打开雾,装上鼠标 / 键盘的转镜头操作。 */
  private enterFree(): void {
    const scene = director.getScene()!;
    const sky = scene.globals.skybox;
    const cam = this.cam;
    this.freeSaved = { skyOn: sky.enabled, shadow: this.cfg.shadow, shadowHalf: this.cfg.shadowHalf, near: cam.near, far: cam.far, fog: this.post.cfg.fog };
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fov = this.view.fov;
    cam.near = 0.3;
    cam.far = 420;
    cam.clearFlags = Camera.ClearFlag.SKYBOX;
    sky.enabled = true;
    // 看得远了:投影的范围跟着放大(阴影贴图也加大,每个像素对应的地面大小和原来差不多)。
    // 范围是一块方的(半边 18 米),中心不在队长脚下,而是往镜头看过去的方向挪 6 米(见 aimSun):镜头背后那一片不用画影子。
    // 实测(林间):前后左右各 24 米时,画影子那一遍要画 220 万个三角形(镜头看不到的树也在画),是画面本身的 4 倍
    this.cfg.shadow = 4096;
    this.cfg.shadowHalf = 18;
    this.applyGlobals();
    this.post.cfg.fog = true;
    this.lookReady = false;
    this.eye.yaw = this.view.yaw;
    this.eye.pitch = this.view.pitch;
    this.eye.dist = this.view.dist;
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    game.canvas?.addEventListener('contextmenu', this.noMenu);
  }

  private exitFree(): void {
    const s = this.freeSaved;
    this.freeSaved = null;
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    game.canvas?.removeEventListener('contextmenu', this.noMenu);
    this.drag.on = false;
    this.turn = 0;
    const cam = this.cam;
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.node.setRotationFromEuler(-this.cfg.pitch, 0, 0);
    if (s) {
      cam.near = s.near;
      cam.far = s.far;
      this.cfg.shadow = s.shadow;
      this.cfg.shadowHalf = s.shadowHalf;
      this.post.cfg.fog = s.fog;
      const scene = director.getScene();
      if (scene) {
        scene.globals.skybox.enabled = s.skyOn;
      }
    }
  }

  private onMouseDown(e: EventMouse): void {
    if (e.getButton() === EventMouse.BUTTON_RIGHT) {
      this.drag.on = true;
      this.drag.x = e.getLocationX();
      this.drag.y = e.getLocationY();
    }
  }

  private onMouseMove(e: EventMouse): void {
    if (!this.drag.on) {
      return;
    }
    const x = e.getLocationX();
    const y = e.getLocationY();
    // 往右拖 = 镜头绕到右边去(画面往左转);往上拖 = 镜头压低
    this.view.yaw -= (x - this.drag.x) * 0.3;
    this.view.pitch -= (y - this.drag.y) * 0.2;
    this.drag.x = x;
    this.drag.y = y;
  }

  private onMouseUp(e: EventMouse): void {
    if (e.getButton() === EventMouse.BUTTON_RIGHT) {
      this.drag.on = false;
    }
  }

  private onMouseWheel(e: EventMouse): void {
    this.view.dist *= e.getScrollY() > 0 ? 0.9 : 1.1;
  }

  private onKeyDown(e: EventKeyboard): void {
    if (e.keyCode === KeyCode.KEY_Z) {
      this.turn = 1;
    } else if (e.keyCode === KeyCode.KEY_C) {
      this.turn = -1;
    } else if (e.keyCode === KeyCode.KEY_X) {
      // 回正:转回固定镜头的那个方向(从南往北看)、默认的俯角和距离。转了好几圈的先折回最近的那一圈,不然要倒着转回去
      this.view.yaw -= Math.round(this.view.yaw / 360) * 360;
      this.eye.yaw -= Math.round(this.eye.yaw / 360) * 360;
      this.view.yaw = 0;
      this.view.pitch = 40;
      this.view.dist = 14;
    }
  }

  private onKeyUp(e: EventKeyboard): void {
    if (e.keyCode === KeyCode.KEY_Z || e.keyCode === KeyCode.KEY_C) {
      this.turn = 0;
    }
  }

  /** 右键拖动是转镜头:别让浏览器弹右键菜单。 */
  private noMenu = (e: Event): void => {
    e.preventDefault();
  };

  /** 现场改镜头(调试 / 自验用)。snap = 不平滑,直接到位。 */
  setView(patch: Partial<ViewCfg>, snap = false): ViewCfg {
    Object.assign(this.view, patch);
    if (snap) {
      this.eye.yaw = this.view.yaw;
      this.eye.pitch = this.view.pitch;
      this.eye.dist = this.view.dist;
      this.lookReady = false;
    }
    return this.view;
  }

  /** 这一帧镜头绕竖轴转了多少度(固定镜头 = 0):朝着镜头的纸片、摇杆方向都按它转。 */
  camYaw(): number {
    return this.free ? this.eye.yaw : 0;
  }

  /** 自由视角:相机绕着队长摆。 */
  private syncFree(self: any, aspect: number): void {
    const v = this.view;
    const dt = Math.min(0.05, Math.max(0, game.deltaTime));
    v.yaw += this.turn * 90 * dt;
    v.pitch = Math.max(v.minPitch, Math.min(v.maxPitch, v.pitch));
    v.dist = Math.max(v.minDist, Math.min(v.maxDist, v.dist));
    const e = this.eye;
    const k = 1 - Math.exp(-14 * dt);
    e.yaw += (v.yaw - e.yaw) * k;
    e.pitch += (v.pitch - e.pitch) * k;
    e.dist += (v.dist - e.dist) * k;
    const lead = self.leader;
    // 看向队长胸口;镜头压平了就抬到头顶上面一点(不然人在画面正中、上半屏全是远处,下半屏全是脚边的地)
    this.toWorld(lead?.x ?? 0, lead?.y ?? 0, _v, 1.0 + 0.9 * Math.max(0, 1 - e.pitch / 24));
    if (!this.lookReady) {
      this.look.set(_v);
      this.lookReady = true;
    } else {
      Vec3.lerp(this.look, this.look, _v, 1 - Math.exp(-16 * dt));
    }
    const yaw = (e.yaw * Math.PI) / 180;
    const pitch = (e.pitch * Math.PI) / 180;
    const cp = Math.cos(pitch);
    const cam = this.cam;
    cam.fov = v.fov;
    cam.node.setPosition(this.look.x + Math.sin(yaw) * cp * e.dist, this.look.y + Math.sin(pitch) * e.dist, this.look.z + Math.cos(yaw) * cp * e.dist);
    cam.node.lookAt(this.look);
    this.focus.set(this.look.x, 0, this.look.z);
    this.mapX = lead?.x ?? 0;
    this.mapY = lead?.y ?? 0;
    this.halfH = e.dist * Math.tan((v.fov * Math.PI) / 360);
    this.halfW = this.halfH * aspect;
  }

  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    if (this.free) {
      this.exitFree();
      this.free = false;
    }
    this.post.disable();
    this.restoreLook();
    this.ground3d.stop();
    this.worldGround = false;
    this.ground.active = true;
    this.groundCam.enabled = true;
    this.root.active = false;
    this.unlayer();
    const s = this.saved;
    this.saved = null;
    const scene = director.getScene();
    if (!s || !scene) {
      return;
    }
    const amb = scene.globals.ambient;
    const sh = scene.globals.shadows;
    const sky = scene.globals.skybox;
    const post = (scene.globals as any).postSettings;
    amb.skyLightingColor = s.sky;
    amb.groundLightingColor = s.ground;
    amb.skyIllum = s.skyIllum;
    sh.type = s.shType;
    sh.shadowMapSize = s.shSize;
    sh.enabled = s.shOn;
    sky.envmap = s.envmap;
    (sky as any).envLightingType = s.envType;
    if (post && s.tone !== undefined) {
      post.toneMappingType = s.tone;
    }
    if (s.mainLight && s.mainLight.isValid) {
      s.mainLight.enabled = s.mainLightOn;
    }
    if (s.mainCam && s.mainCam.isValid) {
      s.mainCam.visibility = s.mainCamVis;
      s.mainCam.enabled = s.mainCamOn;
    }
  }

  isOpen(): boolean {
    return this.opened;
  }

  // ───────────────────────── 坐标 ─────────────────────────
  /** 地图坐标 → 3D 世界坐标(h = 离地多高,米)。 */
  toWorld(mx: number, my: number, out: Vec3, h = 0): Vec3 {
    const U = this.cfg.unitsPerM;
    return out.set(mx / U, h, -my / (U * this.sinP));
  }

  /** 2D 地图上的一个方向(x 右、y 上 = 远离镜头)→ 模型绕竖轴转多少度(模型本来面朝 +x)。 */
  yawOf(dx: number, dy: number): number {
    return (Math.atan2(dy / this.sinP, dx) * 180) / Math.PI;
  }

  /** 竖着 1 米在 2D 地图上是多高(地图单位):血条 / 名字按它摆。 */
  upUnits(): number {
    return this.cfg.unitsPerM * this.cosP;
  }

  /** 两点在 3D 世界里隔多少米(地图坐标;地图的纵向在 3D 里是拉长过的)。 */
  metres(ax: number, ay: number, bx: number, by: number): number {
    const U = this.cfg.unitsPerM;
    return Math.hypot((ax - bx) / U, (ay - by) / (U * this.sinP));
  }

  /**
   * 自由视角用:地图上的一点(离地 h 米)现在落在画面的哪里 —— 换算成「2D 世界节点里的坐标」
   * (界面相机画 2D 世界时,摆在这个坐标上的东西正好落在画面的那个位置)。
   * 返回这一点处「竖着 1 米在画面上有多长」相对固定镜头时的倍数(头顶的血条名字按它缩放);点在镜头后面返回 0。
   */
  project(mx: number, my: number, h: number, out: Vec3): number {
    const tf = this.ui2d.tf;
    if (!tf || !tf.isValid) {
      return 0;
    }
    const cam = this.cam.camera;
    const frame = director.getTotalFrames();
    if (this.vpFrame !== frame) {
      this.vpFrame = frame;
      cam.update(true);
    }
    const m = cam.matViewProj;
    const ui = this.ui2d;
    const to2d = (p: Vec3, o: Vec3): boolean => {
      const w = m.m03 * p.x + m.m07 * p.y + m.m11 * p.z + m.m15;
      if (w <= 0.05) {
        return false;
      }
      const nx = (m.m00 * p.x + m.m04 * p.y + m.m08 * p.z + m.m12) / w;
      const ny = (m.m01 * p.x + m.m05 * p.y + m.m09 * p.z + m.m13) / w;
      _c.set(ui.x + nx * ui.halfH * ui.aspect, ui.y + ny * ui.halfH, 0);
      tf.convertToNodeSpaceAR(_c, o);
      return true;
    };
    this.toWorld(mx, my, _a, h);
    if (!to2d(_a, out)) {
      return 0;
    }
    _a.y += 1;
    if (!to2d(_a, _b)) {
      return 0;
    }
    return Math.hypot(_b.x - out.x, _b.y - out.y) / this.upUnits();
  }

  // ───────────────────────── 每帧:跟上 2D 的镜头 ─────────────────────────
  private findUiCam(world2d: Node): Camera | null {
    if (this.uiCam && this.uiCam.isValid && this.uiCam.node.activeInHierarchy) {
      return this.uiCam;
    }
    let best: Camera | null = null;
    director.getScene()!.walk((n) => {
      const c = n.getComponent(Camera);
      if (c && c.enabled && n.activeInHierarchy && !c.targetTexture && c.projection === Camera.ProjectionType.ORTHO && (c.visibility & world2d.layer) !== 0 && (!best || c.priority > best.priority)) {
        best = c;
      }
    });
    this.uiCam = best;
    return best;
  }

  /** 这一帧对上的那台界面相机(别的「把 2D 画进贴图」的相机照它取景)。 */
  uiCamera(): Camera | null {
    return this.uiCam && this.uiCam.isValid ? this.uiCam : null;
  }

  /**
   * 每帧(野外渲染器的 step 之后):3D 相机对上 2D 的镜头,地面 / 主光跟着挪;2D 贴地层交给地表相机。
   * self = 野外渲染器(只读它的世界节点)。返回 false = 现在对不上(界面相机没找到),这一帧别画。
   */
  sync(self: any): boolean {
    const world2d: Node | null = self.world ?? null;
    const ui = world2d && world2d.isValid ? this.findUiCam(world2d) : null;
    const tf = world2d?.getComponent(UITransform) ?? null;
    if (!world2d || !ui || !tf) {
      return false;
    }
    const cfg = this.cfg;
    const U = cfg.unitsPerM;
    const k = world2d.worldScale.x;
    const canvas = game.canvas!;
    const aspect = canvas.width / Math.max(1, canvas.height);
    this.ui2d.x = ui.node.worldPosition.x;
    this.ui2d.y = ui.node.worldPosition.y;
    this.ui2d.halfH = ui.orthoHeight;
    this.ui2d.aspect = aspect;
    this.ui2d.tf = tf;
    if (this.free) {
      this.syncFree(self, aspect);
      this.ground3d.sync(self, this, ui, tf, k, game.deltaTime);
      this.aimSun();
      this.layerGround(self);
      return true;
    }
    // 画面正中对着地图上的哪一点
    tf.convertToNodeSpaceAR(ui.node.worldPosition, _v);
    this.mapX = _v.x;
    this.mapY = _v.y;
    this.toWorld(_v.x, _v.y, this.focus);
    this.halfH = ui.orthoHeight / (k * U);
    this.halfW = this.halfH * aspect;
    const cam = this.cam;
    cam.orthoHeight = this.halfH;
    const D = 110;
    cam.node.setPosition(this.focus.x, this.sinP * D, this.focus.z + this.cosP * D);
    // 地面:铺满画面(画面竖向 1 米 = 地面纵深 1 / sin 俯角 米)
    this.ground.setPosition(this.focus.x, 0, this.focus.z);
    this.ground.setScale(this.halfW * 2, 1, (this.halfH * 2) / this.sinP);
    // 地表相机 = 界面相机的取景;贴图和画布一样大
    const g = this.groundCam;
    g.node.setWorldPosition(ui.node.worldPosition);
    g.node.setWorldRotation(ui.node.worldRotation);
    g.orthoHeight = ui.orthoHeight;
    g.near = ui.near;
    g.far = ui.far;
    if (this.worldGround) {
      this.ground3d.sync(self, this, ui, tf, k, game.deltaTime);
    } else {
      // 开了后期的放大档位时 3D 画面比窗口大:地表贴图跟着放大(2D 地表按更高的分辨率画进来),不然地表会被「先放大再缩小」糊一遍
      const s = this.post.scale();
      const rw = Math.round(canvas.width * s);
      const rh = Math.round(canvas.height * s);
      if (!this.rt || this.rt.width !== rw || this.rt.height !== rh) {
        this.resizeTarget(rw, rh);
      }
    }
    this.aimSun();
    this.layerGround(self);
    return true;
  }

  private resizeTarget(w: number, h: number): void {
    const old = this.rt;
    const rt = new RenderTexture();
    rt.reset({ width: Math.max(4, w), height: Math.max(4, h) });
    rt.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
    rt.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
    this.rt = rt;
    this.groundCam.targetTexture = rt;
    this.groundMat.setProperty('mainTexture', rt);
    old?.destroy();
  }

  /** 主光跟着镜头走;位置按阴影贴图的像素取整,镜头移动时影子的边不会抖。 */
  private aimSun(): void {
    const cfg = this.cfg;
    _d.set(cfg.sunDir[0], cfg.sunDir[1], cfg.sunDir[2]).normalize();
    // 光的右 / 上方向
    Vec3.cross(_r, _d, Vec3.UP).normalize();
    Vec3.cross(_u, _r, _d).normalize();
    const texel = cfg.shadow > 0 ? (cfg.shadowHalf * 2) / cfg.shadow : 0.01;
    // 投影范围的中心:固定镜头 = 画面正中;自由视角 = 队长往镜头看过去的方向 6 米
    const f = _c.set(this.focus);
    if (this.free) {
      const a = (this.eye.yaw * Math.PI) / 180;
      f.x -= Math.sin(a) * 6;
      f.z -= Math.cos(a) * 6;
    }
    const fr = Math.round(Vec3.dot(f, _r) / texel) * texel;
    const fu = Math.round(Vec3.dot(f, _u) / texel) * texel;
    const fd = Vec3.dot(f, _d);
    _l.set(_r.x * fr + _u.x * fu + _d.x * (fd - 70), _r.y * fr + _u.y * fu + _d.y * (fd - 70), _r.z * fr + _u.z * fu + _d.z * (fd - 70));
    this.light.node.setPosition(_l);
    _v.set(_l.x + _d.x, _l.y + _d.y, _l.z + _d.z);
    this.light.node.lookAt(_v, _u);
  }

  // ───────────────────────── 2D 贴地层 → 地表相机 ─────────────────────────
  /** 贴地层的节点换到「地表」那一层(新长出来的节点隔一会儿补一遍);2D 画上去的假投影整层藏起来(换成真投影)。 */
  private layerGround(self: any): void {
    const ground: Node | null = self.groundRoot ?? null;
    if (!ground || !ground.isValid) {
      return;
    }
    if (this.layered !== ground) {
      this.unlayer();
      this.layered = ground;
      this.groundLayerWas = ground.layer;
      this.layerCount = -1;
    }
    this.layerTick += 1;
    const count = ground.children.length;
    if (count === this.layerCount && this.layerTick % 20 !== 0) {
      return;
    }
    this.layerCount = count;
    // 不会动的(整图地表 / 兜底的平铺底纹 / 贴地图片 / 地图外沿的压暗)单独一层,别的(光圈、预警圈…)一层:远处那张地面贴图只画前一种
    for (const child of ground.children) {
      const layer = /^(Splat|Tile_|TownProp_|Vignette)/.test(child.name) ? GROUND_STATIC_LAYER : GROUND_LAYER;
      child.walk((n) => {
        if (n.layer !== layer) {
          n.layer = layer;
        }
      });
    }
    if (ground.layer !== GROUND_LAYER) {
      ground.layer = GROUND_LAYER;
    }
    const backdrop: Node | null = self.backdropNode ?? null;
    if (backdrop && backdrop.isValid) {
      backdrop.walk((n) => {
        n.layer = GROUND_LAYER;
      });
    }
    const shadows = ground.getChildByName('Shadows');
    if (shadows && shadows.active) {
      this.hidden.push({ node: shadows, was: true });
      shadows.active = false;
    }
  }

  /** 把一个 2D 节点(连同下面的)交给地表相机画(脚下的光圈这类要压在 3D 角色下面的东西)。返回还原用的函数。 */
  toGround(node: Node): () => void {
    const was: Array<[Node, number]> = [];
    node.walk((n) => {
      was.push([n, n.layer]);
      n.layer = GROUND_LAYER;
    });
    return () => {
      for (const [n, layer] of was) {
        if (n.isValid) {
          n.layer = layer;
        }
      }
    };
  }

  private unlayer(): void {
    const ground = this.layered;
    this.layered = null;
    if (ground && ground.isValid) {
      const layer = this.groundLayerWas;
      ground.walk((n) => {
        n.layer = layer;
      });
    }
    for (const h of this.hidden) {
      if (h.node.isValid) {
        h.node.active = h.was;
      }
    }
    this.hidden.length = 0;
  }

  info(): Record<string, unknown> {
    return { open: this.opened, cfg: { ...this.cfg }, focus: [+this.focus.x.toFixed(2), +this.focus.z.toFixed(2)], half: [+this.halfW.toFixed(2), +this.halfH.toFixed(2)],
      rt: this.rt ? [this.rt.width, this.rt.height] : null, uiCam: this.uiCam?.node.name ?? null, post: this.post.info(),
      ground: this.worldGround ? this.ground3d.info() : null, free: this.free, view: this.free ? { ...this.view } : null, look: this.lookName };
  }

  destroy(): void {
    this.close();
    if (this.root.isValid) {
      this.root.destroy();
    }
    this.rt?.destroy();
    this.rt = null;
  }
}
