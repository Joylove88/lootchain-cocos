import { Camera, Color, DirectionalLight, director, game, Layers, Material, Mesh, MeshRenderer, Node, renderer, RenderTexture, UITransform, utils, Vec3 } from 'cc';
import { material } from './G3DKit';
import { buildEnvCube } from './G3DSkins';

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

const _v = new Vec3();
const _l = new Vec3();
const _r = new Vec3();
const _u = new Vec3();
const _d = new Vec3();

export class TownWorld3D {
  readonly root: Node;
  readonly cam: Camera;
  readonly cfg: WorldCfg;
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

    // 地表相机:和界面相机同一个位置、同一个取景,只看贴地层,画进贴图(优先级最低 = 最先画,同一帧 3D 地面就能用上)
    const gNode = new Node('TownWorld3DGroundCam');
    this.root.addChild(gNode);
    const gcam = gNode.addComponent(Camera);
    gcam.projection = Camera.ProjectionType.ORTHO;
    gcam.visibility = GROUND_LAYER;
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
  open(): void {
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
      mainCam.visibility &= ~(FIELD_LAYER | GROUND_LAYER);
      mainCam.enabled = false;
    }
    if (post) {
      post.toneMappingType = 1;                // 线性输出:手绘地表 / 贴图在 1 倍光下就是原图的颜色
    }
    try {
      const d = this.cfg.sunDir;
      const cube = buildEnvCube([{ dir: [-d[0], -d[1], -d[2]], color: [2.2, 2.0, 1.6], width: 0.26 }], [0.44, 0.58, 0.86], [0.74, 0.78, 0.8], [0.2, 0.19, 0.15], 64);
      sky.envmap = cube;
      (sky as any).envLightingType = 1;        // 半球漫反射 + 环境反射
    } catch (error) {
      console.warn('[f3d] env cube', error);
    }
    this.applyGlobals();
    this.light.enabled = true;
  }

  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
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
    if (!this.rt || this.rt.width !== canvas.width || this.rt.height !== canvas.height) {
      this.resizeTarget(canvas.width, canvas.height);
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
    const fr = Math.round(Vec3.dot(this.focus, _r) / texel) * texel;
    const fu = Math.round(Vec3.dot(this.focus, _u) / texel) * texel;
    const fd = Vec3.dot(this.focus, _d);
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
    ground.walk((n) => {
      if (n.layer !== GROUND_LAYER) {
        n.layer = GROUND_LAYER;
      }
    });
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
      rt: this.rt ? [this.rt.width, this.rt.height] : null, uiCam: this.uiCam?.node.name ?? null };
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
