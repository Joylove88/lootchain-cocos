import { builtinResMgr, Camera, Color, DirectionalLight, director, gfx, Material, Node, Rect, renderer, RenderTexture, Size, SpriteFrame, Vec2, Vec3 } from 'cc';
import { buildEnvCube } from './G3DSkins';

/**
 * 「摄影棚」:把带骨骼的 3D 角色实时渲染进一张贴图,每个角色占一格,再把那一格当成一张会动的图贴回 2D 场景里。
 *
 * 为什么这么做(2026-11-16,野外即时战斗接 3D):野外是一个按脚线前后排序的 2D 场景 —— 树会挡人、人会挡树、
 * 有视野裁剪、有树冠透视孔、怪死了整节点淡出。3D 角色如果另起一层直接画到屏幕上,只能整层在 2D 之上或之下,
 * 和树 / 岩石没法逐个排前后。渲染成贴图再贴回原来的 2D 节点,前后遮挡、裁剪、淡出、缩放这些现成机制全都照旧生效。
 *
 * 做法:
 * - 一台正交相机(俯角可调)对着一张看不见的「底片」,底片按格子分好;每个角色放在自己那一格的脚底位置上,
 *   都在同一个景深上,互不遮挡。正交 = 没有近大远小,和 2D 地图的画法一致。
 * - 每格世界尺寸固定(CELL_M 米),角色按「自己要占多大一块」(extent)缩放进去,所以大熊和幼鼠都能用满一格的像素。
 * - 贴图是预乘透明的(边缘像素 = 颜色 × 覆盖率),贴回去的 Sprite 要用预乘混合的材质(premultMaterial())。
 * - 灯:一盏主光(带投影,角色手臂 / 头能在自己身上落影)+ 环境光 + 一张天空的环境反射图;开着的时候暂时接管场景的
 *   环境光 / 阴影 / 主光设置,关掉时原样还原(做法同 GuardScene3D)。
 */

/** 摄影棚里的东西单独一层:只有摄影棚的相机看它。 */
export const STUDIO_LAYER = 1 << 9;
/** 每格在摄影棚里是多少米见方。 */
const CELL_M = 4;
/** 摄影棚放在哪(远离守卫战的 3D 场景和展示模式)。 */
const ORIGIN = new Vec3(0, -900, 0);

export interface StudioCfg {
  /** 每格多少像素、几列几行(贴图 = cols × cell 宽,rows × cell 高)。 */
  cell: number;
  cols: number;
  rows: number;
  /** 相机俯角(度):0 = 平视,90 = 正俯视。 */
  pitch: number;
  /** 主光照度 / 环境光照度(和场景同一套曝光)。 */
  key: number;
  ambient: number;
  /** 主光阴影贴图边长(0 = 不要投影)。 */
  shadow: number;
  /** 脚底在一格里从下往上多高(0~1)。 */
  footV: number;
}

export class G3DStudio {
  readonly root: Node;
  readonly rt: RenderTexture;
  readonly cfg: StudioCfg;
  private cam: Camera;
  private light: DirectionalLight;
  private used: boolean[] = [];
  private frames: Array<SpriteFrame | null> = [];
  private right = new Vec3(1, 0, 0);
  private up = new Vec3(0, 1, 0);
  private opened = false;
  private saved: any = null;
  private premult: Material | null = null;

  constructor(cfg: StudioCfg) {
    this.cfg = cfg;
    const scene = director.getScene()!;
    this.root = new Node('G3DStudio');
    scene.addChild(this.root);
    this.root.setPosition(ORIGIN);
    this.root.active = false;
    const w = cfg.cols * cfg.cell;
    const h = cfg.rows * cfg.cell;
    this.rt = new RenderTexture();
    this.rt.reset({ width: w, height: h });
    this.rt.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
    this.rt.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
    for (let i = 0; i < cfg.cols * cfg.rows; i += 1) {
      this.used.push(false);
      this.frames.push(null);
    }
    const camNode = new Node('G3DStudioCam');
    this.root.addChild(camNode);
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = (cfg.rows * CELL_M) / 2;
    cam.near = 1;
    cam.far = 240;
    cam.visibility = STUDIO_LAYER;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(0, 0, 0, 0);
    cam.priority = -8;                 // 先画进贴图,界面相机后画(同一帧就能用上)
    cam.targetTexture = this.rt;
    this.cam = cam;
    const lightNode = new Node('G3DStudioKey');
    this.root.addChild(lightNode);
    const light = lightNode.addComponent(DirectionalLight);
    light.color = new Color(255, 246, 232, 255);
    light.illuminance = cfg.key;
    this.light = light;
    this.aim();
  }

  /** 按俯角摆相机和主光。 */
  private aim(): void {
    const cfg = this.cfg;
    const p = (cfg.pitch * Math.PI) / 180;
    this.cam.node.setRotationFromEuler(-cfg.pitch, 0, 0);
    // 相机朝前 = (0, -sin p, -cos p),朝上 = (0, cos p, -sin p);底片中心在摄影棚原点,相机退后 120 米
    this.up.set(0, Math.cos(p), -Math.sin(p));
    this.cam.node.setPosition(0, Math.sin(p) * 120, Math.cos(p) * 120);
    // 主光:从镜头这一侧的左上方打过来(角色朝镜头的一面是亮的),比镜头再高一些
    const dir = new Vec3(0.5, -0.74, -0.46).normalize();
    this.light.node.setPosition(-dir.x * 90, -dir.y * 90, -dir.z * 90);
    this.light.node.lookAt(new Vec3(ORIGIN.x, ORIGIN.y, ORIGIN.z));
  }

  /** 开机:接管场景的环境光 / 环境反射 / 阴影 / 主光(关机时还原)。 */
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
    const mainLight = scene.getChildByName('Main Light')?.getComponent(DirectionalLight) ?? null;
    const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    this.saved = { mainLight, mainLightOn: mainLight?.enabled ?? false, mainCam, mainCamVis: mainCam?.visibility ?? 0,
      skyIllum: amb.skyIllum, sky: amb.skyLightingColor.clone(), ground: amb.groundLightingColor.clone(),
      shOn: sh.enabled, shType: sh.type, shSize: sh.shadowMapSize, envmap: sky.envmap, envType: (sky as any).envLightingType };
    if (mainLight) {
      mainLight.enabled = false;
    }
    if (mainCam) {
      mainCam.visibility &= ~STUDIO_LAYER;      // 主场景那台相机别把摄影棚里的角色也画一遍
    }
    amb.skyLightingColor = new Color(196, 208, 226, 255);
    amb.groundLightingColor = new Color(108, 98, 84, 255);
    amb.skyIllum = this.cfg.ambient;
    try {
      // 白天的天空:头顶偏蓝、地平线发白、地面是暖的土色,再加一团太阳(金属 / 皮革的反光靠它)
      const cube = buildEnvCube([{ dir: [-0.5, 0.74, 0.46], color: [2.6, 2.4, 2.0], width: 0.26 }], [0.5, 0.62, 0.86], [0.78, 0.8, 0.82], [0.24, 0.21, 0.17], 64);
      sky.envmap = cube;
      (sky as any).envLightingType = 1;        // 半球漫反射 + 环境反射
    } catch (error) {
      console.warn('[g3dstudio] env cube', error);
    }
    this.applyShadow();
    this.light.enabled = true;
  }

  private applyShadow(): void {
    const sh = director.getScene()!.globals.shadows;
    const light = this.light;
    if (this.cfg.shadow > 0) {
      sh.enabled = true;
      sh.type = renderer.scene.ShadowType.ShadowMap;
      sh.shadowMapSize = this.cfg.shadow;
      light.shadowEnabled = true;
      light.shadowPcf = renderer.scene.PCFType.SOFT;
      light.shadowBias = 0.0004;
      light.shadowNormalBias = 0.02;
      light.shadowFixedArea = true;          // 就这么大一块底片:固定一块正交范围
      light.csmLevel = renderer.scene.CSMLevel.LEVEL_1;          // 固定范围用不上分级;默认 4 级会把投影的东西白画 3 遍(结果一样)
      light.shadowNear = 1;
      light.shadowFar = 200;
      light.shadowOrthoSize = Math.max(this.cfg.cols, this.cfg.rows) * CELL_M * 0.62;
    } else {
      light.shadowEnabled = false;
      sh.enabled = false;
    }
  }

  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.root.active = false;
    const s = this.saved;
    this.saved = null;
    const scene = director.getScene();
    if (!s || !scene) {
      return;
    }
    const amb = scene.globals.ambient;
    const sh = scene.globals.shadows;
    const sky = scene.globals.skybox;
    amb.skyLightingColor = s.sky;
    amb.groundLightingColor = s.ground;
    amb.skyIllum = s.skyIllum;
    sh.type = s.shType;
    sh.shadowMapSize = s.shSize;
    sh.enabled = s.shOn;
    sky.envmap = s.envmap;
    (sky as any).envLightingType = s.envType;
    if (s.mainLight && s.mainLight.isValid) {
      s.mainLight.enabled = s.mainLightOn;
    }
    if (s.mainCam && s.mainCam.isValid) {
      s.mainCam.visibility = s.mainCamVis;
    }
  }

  isOpen(): boolean {
    return this.opened;
  }

  /** 现场调参(俯角 / 灯 / 投影)。 */
  apply(patch: Partial<StudioCfg>): void {
    Object.assign(this.cfg, patch);
    this.light.illuminance = this.cfg.key;
    this.aim();
    if (this.opened) {
      director.getScene()!.globals.ambient.skyIllum = this.cfg.ambient;
      this.applyShadow();
    }
  }

  /** 要一格(没有空的回 -1)。 */
  alloc(): number {
    const i = this.used.indexOf(false);
    if (i >= 0) {
      this.used[i] = true;
    }
    return i;
  }

  free(index: number): void {
    if (index >= 0 && index < this.used.length) {
      this.used[index] = false;
    }
  }

  freeCells(): number {
    return this.used.filter((u) => !u).length;
  }

  /** 第 index 格的脚底位置(root 下的本地坐标,角色要挂在 root 下面)。格子从贴图左下角起,一行一行往上排。 */
  footOf(index: number, out: Vec3): Vec3 {
    const cfg = this.cfg;
    const col = index % cfg.cols;
    const row = Math.floor(index / cfg.cols);
    const u = (col + 0.5 - cfg.cols / 2) * CELL_M;
    const v = (row + cfg.footV - cfg.rows / 2) * CELL_M;
    out.set(this.right.x * u + this.up.x * v, this.right.y * u + this.up.y * v, this.right.z * u + this.up.z * v);
    return out;
  }

  /** 一个占 extent 米见方的角色,放进一格要缩放多少倍。 */
  scaleFor(extent: number): number {
    return CELL_M / Math.max(0.1, extent);
  }

  /**
   * 第 index 格对应的那张「图」(给 Sprite 用)。
   * 引擎画进贴图时已经把上下翻好了(2026-11-16 实测:整张贴图直接贴出来是正的,第 0 行在最下面),
   * 所以这里的区域按图片坐标(左上角起)算:第 row 行(从下往上数)= 距顶 (rows - 1 - row) 格,不用再设上下翻转。
   */
  frame(index: number): SpriteFrame {
    let sf = this.frames[index];
    if (!sf) {
      const cfg = this.cfg;
      const col = index % cfg.cols;
      const row = Math.floor(index / cfg.cols);
      sf = new SpriteFrame();
      // 原始尺寸要和区域一样大:只改 rect 的话「原始尺寸」还是整张贴图,不裁边的精灵会把这一格画成整框的 1/5 大
      sf.reset({ texture: this.rt, rect: new Rect(col * cfg.cell, (cfg.rows - 1 - row) * cfg.cell, cfg.cell, cfg.cell),
        originalSize: new Size(cfg.cell, cfg.cell), offset: new Vec2(0, 0), isRotate: false });
      sf.packable = false;
      this.frames[index] = sf;
    }
    return sf;
  }

  /**
   * 贴回 2D 用的材质:预乘透明混合(贴图边缘是「颜色 × 覆盖率」,按普通透明混合会有一圈黑边)。
   * 从引擎内置的精灵材质拷一份再改混合方式,并带上「取样自渲染贴图」的宏 —— 引擎自己给渲染贴图的精灵也是这么配的
   * (sprite.ts _updateBuiltinMaterial),上下方向由着色器按图形接口处理,这边不用管。
   * (2026-11-16 第一版用 Material.initialize({ effectName: 'builtin-sprite' }):着色器名不对,材质是空的、0 个通道,图不画也不报错。)
   */
  premultMaterial(): Material {
    if (!this.premult) {
      const base = builtinResMgr.get('ui-sprite-material') as Material;
      const m = new Material();
      m.copy(base, {
        defines: { SAMPLE_FROM_RT: true },
        states: { blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.ONE, blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          blendSrcAlpha: gfx.BlendFactor.ONE, blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA }] } },
      });
      this.premult = m;
    }
    return this.premult;
  }

  destroy(): void {
    this.close();
    if (this.root.isValid) {
      this.root.destroy();
    }
    this.rt.destroy();
  }
}
