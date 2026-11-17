import { Camera, Color, director, EffectAsset, gfx, Material, Mesh, MeshRenderer, Node, RenderTexture, resources, Size, Sprite, Texture2D, UITransform, utils, Vec3, Vec4 } from 'cc';

/**
 * 野外真 3D 场景 · 铺在世界里的地面(实验,2026-11-17;?field3d=2&fground=1,默认还是原来那种)。
 *
 * 由来:后期做完后用户说(原话)「这个效果和我们参考的那个FPS游戏差太多了，是因为提示词原因吗？地面也需要改的」
 * 「视角也可以调成自由的吧」。差距最大的一样就是地面 —— 原来是把 2D 地表对着固定镜头画成一张和屏幕一样大的图、
 * 贴成一块平板:能接影子,但没有凹凸、不反光,而且镜头一动就对不上。
 *
 * 现在的做法(「烘」两张按地图坐标铺开的贴图集,再贴到 3D 世界里真正铺开的地面上):
 * - 近处一张:以队长为中心的一块正方形范围,分辨率和屏上差不多(每个地图单位 1 像素),每帧重画颜色
 *   (脚下的光圈、河水会动);
 * - 远处一张:整张地图,分辨率低,隔几秒重画一遍(镜头压低后看得远,近处那张盖不到的地方用它)。
 * 每张贴图集其实是三张图:
 *   颜色   —— 2D 地表那一层原样画进来(整图地表换成 g3d-ground 的「颜色」那一套:混法相同,去掉了按屏幕位置做的明暗);
 *   高度   —— 同一批东西各配一个「只出高度 / 粗糙度」的替身再画一遍(整图地表按各层材质的明暗和系数,石板 / 桥按图片明暗,河是一块平的光面);
 *   法线   —— 从高度图算出来(画一块铺满的方块)。
 * 3D 地面用引擎的标准材质:颜色图 + 法线图 + 「遮蔽 / 粗糙度」图。太阳和技能的光打上去有起伏、有反光,河面会反光。
 *
 * 2D 那边的东西怎么借:贴地层的节点已经在「地表」那一层(TownWorld3D.layerGround);替身挂在 2D 世界节点下面、单独一层。
 * 2D 会把屏幕外的贴地图片关掉(视野裁剪):这里每帧把它们重新打开(贴图集的范围比屏幕大)。
 * 关掉时:整图地表的材质换回去,替身和相机销毁,被打开的贴地图片交还给 2D 的视野裁剪(它下一次重算时自己会关)。
 */

/** 「只出高度 / 粗糙度」的替身单独一层:只有高度相机看。 */
export const GROUND_H_LAYER = 1 << 15;
/** 算法线用的那块铺满的方块单独一层。 */
const BLIT_LAYER = 1 << 16;
/** 2D 贴地层所在的层(和 TownWorld3D.GROUND_LAYER 同一个值;写在这里是为了不和那个文件互相引用)。 */
const GROUND_LAYER = 1 << 12;
const FIELD_LAYER = 1 << 11;
/**
 * 贴地层里「不会动的」那一部分(整图地表、河 / 桥 / 石板这些贴地图片、地图外沿的压暗)单独一层:
 * 远处那张贴图集只画这一层(它是静态的,画一次用很久 —— 脚下的光圈、技能的预警圈这些会动的东西画进去就成了留在地上的残影);
 * 近处那张两层都画。哪些算静态的由 TownWorld3D.layerGround 按节点名分。
 */
export const GROUND_STATIC_LAYER = 1 << 17;

export interface GroundCfg {
  /** 近处那张贴图的边长(像素;要 2 的整数次方才能有多级渐远)、覆盖的范围(地图单位,正方形)。 */
  nearPx: number;
  nearSpan: number;
  /** 远处那张(整张地图)颜色图的宽(像素;高 = 一半)、它的高度 / 法线图的宽(远处的起伏看不清,用小图)。 */
  farPx: number;
  farReliefPx: number;
  /** 近处那张的中心按多少地图单位取整(挪够一格才重画高度和法线)。 */
  snap: number;
  /** 高度图从最低到最高对应多少米、法线强度(材质上的倍数)、高光强度。 */
  bump: number;
  normalK: number;
  specular: number;
  /** 远处那张隔几秒重画一遍(它只画静态的东西,平时不用重画;留一个慢的兜底)。 */
  farEvery: number;
  /** 贴图集带不带多级渐远、各向异性过滤开到几倍(镜头压低后远处的地面靠它才不发噪、不糊)。 */
  mips: boolean;
  aniso: number;
  /** 地图外面再铺多大一圈地面(米,从地图边往外;0 = 不铺)、它的颜色倍数(0~255,对着地图边缘的颜色调的)。 */
  apron: number;
  apronTint: [number, number, number];
}

export const GROUND_CFG: GroundCfg = { nearPx: 4096, nearSpan: 3072, farPx: 8192, farReliefPx: 2048, snap: 256, bump: 0.1, normalK: 1, specular: 0.2, farEvery: 12,
  mips: true, aniso: 8, apron: 260, apronTint: [150, 150, 150] };

// ───────────────────────── 开关 ─────────────────────────
let flagFromPage: boolean | null = null;

/** 地面用不用新做法:控制台现场改的(__LC_FIELD_GROUND)优先,否则地址参数 ?fground=1 / localStorage.lcFieldGround。 */
export function groundFlag(): boolean {
  const g = globalThis as any;
  if (g.__LC_FIELD_GROUND !== undefined) {
    return !!g.__LC_FIELD_GROUND && g.__LC_FIELD_GROUND !== '0';
  }
  if (flagFromPage === null) {
    try {
      const m = /[?&]fground=(\d)\b/.exec(location.search);
      flagFromPage = m ? m[1] !== '0' : localStorage.getItem('lcFieldGround') === '1';
    } catch (error) {
      flagFromPage = false;
    }
  }
  return flagFromPage;
}

// ───────────────────────── 着色器 ─────────────────────────
let effect: EffectAsset | null = null;
let effectState = 0;      // 0 没读 / 1 在读 / 2 读完(成功或失败)
const waiters: Array<() => void> = [];

export function loadGround(done: () => void): void {
  if (effectState === 2) {
    done();
    return;
  }
  waiters.push(done);
  if (effectState === 1) {
    return;
  }
  effectState = 1;
  resources.load('effects/g3d-ground', EffectAsset, (error, asset) => {
    if (error || !asset) {
      console.warn('[f3d] load g3d-ground', error?.message);
    } else {
      asset.addRef();
      effect = asset;
    }
    effectState = 2;
    for (const w of waiters.splice(0)) {
      w();
    }
  });
}

export function groundReady(): boolean {
  return !!effect;
}

// ───────────────────────── 多级渐远(绕过引擎,直接调图形接口)─────────────────────────
/**
 * 引擎的「画进贴图」不带多级渐远:贴图集铺在地上、镜头一压低,远处一个屏幕像素要盖贴图上十几个像素,不带多级渐远就是一片闪烁的噪点。
 * 这里绕过引擎补上(只在 WebGL1 上做,别的后端退回不带的):
 * - 建贴图时:把引擎记的「有几级」改掉(引擎就肯给它用带多级渐远的取样方式了),顺手设上各向异性过滤;
 * - 每次画完:引擎把画的目标从这张贴图换到别处的那一刻(包一层 bindFramebuffer),给它重新生成各级。
 * 哪个帧缓冲对应哪张贴图:包一层 framebufferTexture2D 记下来。全部停用后把这两个函数还原。
 */
const mipTex = new Set<object>();
const fbTex = new WeakMap<object, object>();
let glHook: { gl: any; bound: object | null } | null = null;

function glDevice(): { gl: any; cache: any } | null {
  const dev = director.root?.device as any;
  if (!dev || dev.gfxAPI !== gfx.API.WEBGL || !dev.gl || !dev.stateCache || !dev.stateCache.glTexUnits) {
    return null;
  }
  return { gl: dev.gl, cache: dev.stateCache };
}

/** 生成各级。借用引擎当前激活的那个贴图单元,用完把引擎原来绑的那张绑回去(引擎自己记着每个单元绑的是谁,不能让它记错)。 */
function genMips(gl: any, cache: any, tex: object, aniso = 0): void {
  const unit = cache.glTexUnits[cache.texUnit];
  const prev = unit ? unit.glTexture : null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (aniso > 1) {
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) {
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(aniso, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
    }
  }
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, prev || null);
}

function hookGl(): boolean {
  if (glHook) {
    return true;
  }
  const d = glDevice();
  if (!d) {
    return false;
  }
  const gl = d.gl;
  const hook = { gl, bound: null as object | null };
  const bind = gl.bindFramebuffer;
  const attach = gl.framebufferTexture2D;
  gl.bindFramebuffer = function lcBind(target: number, fb: object | null): void {
    bind.call(gl, target, fb);
    const was = hook.bound;
    hook.bound = fb;
    if (was && was !== fb) {
      const tex = fbTex.get(was);
      if (tex && mipTex.has(tex)) {
        genMips(gl, d.cache, tex);
      }
    }
  };
  gl.framebufferTexture2D = function lcAttach(target: number, attachment: number, texTarget: number, tex: object | null, level: number): void {
    attach.call(gl, target, attachment, texTarget, tex, level);
    if (attachment === gl.COLOR_ATTACHMENT0 && hook.bound && tex) {
      fbTex.set(hook.bound, tex);
    }
  };
  glHook = hook;
  return true;
}

function unhookGl(): void {
  const hook = glHook;
  glHook = null;
  mipTex.clear();
  if (hook) {
    delete hook.gl.bindFramebuffer;         // 实例上那层包装删掉,原型上的原函数就露出来了
    delete hook.gl.framebufferTexture2D;
  }
}

/** 给一张「画进去的贴图」开多级渐远(要先 hookGl、再建贴图,这样才记得到它的帧缓冲)。不满足条件就原样返回 false。 */
function enableMips(rt: RenderTexture, aniso: number): boolean {
  const d = glDevice();
  const gpu = (rt.getGFXTexture() as any)?.gpuTexture;
  if (!d || !glHook || !gpu || !gpu.glTexture || !gpu.isPowerOf2) {
    return false;
  }
  gpu.mipLevel = Math.floor(Math.log2(Math.max(gpu.width, gpu.height))) + 1;
  genMips(d.gl, d.cache, gpu.glTexture, aniso);      // 先生成一遍:取样方式带了多级渐远而各级没齐的贴图,取出来是黑的
  mipTex.add(gpu.glTexture);
  rt.setMipFilter(RenderTexture.Filter.LINEAR);
  return true;
}

/** 贴地图片按素材名分几类:起伏倍数 / 基准 / 粗糙度 / 遮蔽(见 g3d-ground 的 sprite-h)。 */
function surfOf(asset: string): [number, number, number, number] {
  if (/river|falls|water|pond|lake/.test(asset)) {
    return [0, -0.06, 0.07, 1];        // 水:平的、比岸低一点、很光
  }
  if (/plaza|floor|paving|slab/.test(asset)) {
    return [1.5, 0.02, 0.6, 1];        // 石板地:缝深、比泥地光
  }
  if (/bridge/.test(asset)) {
    return [1.0, 0.08, 0.7, 1];        // 木桥
  }
  if (/cliff/.test(asset)) {
    return [1.6, 0, 0.78, 1];          // 崖壁
  }
  return [0.9, 0, 0.82, 1];
}

interface Atlas {
  key: string;
  w: number;
  h: number;
  /** 高度 / 法线图的大小(近处那张和颜色图一样大,远处那张小)。 */
  rw: number;
  rh: number;
  /** 地图上的范围:中心、宽、高(地图单位)。 */
  cx: number;
  cy: number;
  sw: number;
  sh: number;
  albedo: RenderTexture;
  height: RenderTexture;
  normal: RenderTexture;
  camA: Camera;
  camH: Camera;
  camN: Camera;
  matN: Material;
  mat: Material;
  mesh: Node;
  /** 高度 / 法线是按哪个范围画的;还要连着画几帧。 */
  drawn: string;
  hot: number;
}

interface Clone {
  src: Node;
  dst: Node;
}

const _v = new Vec3();
const _w = new Vec3();

export class TownGround3D {
  readonly cfg: GroundCfg;
  private self: any = null;
  private rig: Node | null = null;
  private near: Atlas | null = null;
  private far: Atlas | null = null;
  private cloneRoot: Node | null = null;
  private clones: Clone[] = [];
  private cloneKey = '';
  private splat: { sprite: Sprite; was: Material | null; albedo: Material; h: Material } | null = null;
  private surfMats = new Map<string, Material>();
  private tick = 0;
  private warm = 0;
  private farAt = 0;
  private time = 0;
  private stats = { clones: 0, forced: 0, nearDraws: 0, farDraws: 0, mips: 0 };
  private apron: { node: Node; mat: Material } | null = null;
  private apronKey = '';

  constructor(cfg: GroundCfg = GROUND_CFG) {
    this.cfg = cfg;
  }

  isOn(): boolean {
    return !!this.rig;
  }

  /** 近处那块地面的 3D 节点(调参 / 截图时看)。 */
  meshes(): Node[] {
    return [this.near?.mesh, this.far?.mesh].filter(Boolean) as Node[];
  }

  // ───────────────────────── 建 ─────────────────────────
  private makeRt(w: number, h: number): RenderTexture {
    const rt = new RenderTexture();
    rt.reset({ width: w, height: h });
    rt.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
    rt.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
    if (this.cfg.mips && enableMips(rt, this.cfg.aniso)) {
      this.stats.mips += 1;
    }
    return rt;
  }

  private makeCam(name: string, layer: number, priority: number, clear: Color, rt: RenderTexture): Camera {
    const n = new Node(name);
    this.rig!.addChild(n);
    const cam = n.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.visibility = layer;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = clear;
    cam.priority = priority;
    cam.targetTexture = rt;
    return cam;
  }

  /** 一块 nx × nz 格的地面(x、z 都是 -0.5~0.5,贴图坐标 = 在这块范围里的位置);切成小块是为了技能的点光只重画照得到的那几块。 */
  private makeMesh(name: string, nx: number, nz: number, mat: Material): Node {
    const root = new Node(name);
    root.layer = FIELD_LAYER;
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const x0 = -0.5 + ix / nx;
        const x1 = -0.5 + (ix + 1) / nx;
        const z0 = -0.5 + iz / nz;
        const z1 = -0.5 + (iz + 1) / nz;
        const mesh: Mesh = utils.MeshUtils.createMesh({
          positions: [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1],
          normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
          // 切线朝 +x(贴图往右)、副切线朝 -z(贴图往上 = 地图往北)
          tangents: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
          uvs: [x0 + 0.5, 0.5 - z0, x1 + 0.5, 0.5 - z0, x1 + 0.5, 0.5 - z1, x0 + 0.5, 0.5 - z1],
          indices: [0, 2, 1, 0, 3, 2],
        }, undefined, { calculateBounds: true });
        const n = new Node(`T_${ix}_${iz}`);
        n.layer = FIELD_LAYER;
        root.addChild(n);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setSharedMaterial(mat, 0);
        mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
        mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
      }
    }
    return root;
  }

  private makeAtlas(key: string, w: number, h: number, rw: number, rh: number, layers: number, world: any, index: number, nx: number, nz: number): Atlas {
    const albedo = this.makeRt(w, h);
    const height = this.makeRt(rw, rh);
    const normal = this.makeRt(rw, rh);
    // 没画到的地方(地图外面):透明 —— 3D 地面的材质按透明度裁掉这一块,露出垫在下面的那圈「地图外的地面」
    // (不裁的话近处那张贴图集伸到地图外的部分就是一块平涂的暗色)。颜色给成泥地色,边界上取样混进来的那一点不至于发黑
    const camA = this.makeCam(`G3DGround_${key}_A`, layers, -30 + index, new Color(66, 60, 42, 0), albedo);
    // 没画到的地方:遮蔽 1、粗糙度 0.85、高度居中
    const camH = this.makeCam(`G3DGround_${key}_H`, GROUND_H_LAYER, -28 + index, new Color(255, 217, 128, 255), height);
    const camN = this.makeCam(`G3DGround_${key}_N`, BLIT_LAYER, -26 + index, new Color(128, 128, 255, 255), normal);
    // 算法线:相机只看自己面前那一块铺满的方块(几套相机错开摆,互相看不见对方的方块)
    camN.orthoHeight = 1;
    camN.near = 0.1;
    camN.far = 10;
    camN.node.setPosition(600 + index * 200, -600, 0);
    const quad = new Node(`G3DGround_${key}_Blit`);
    quad.layer = BLIT_LAYER;
    camN.node.addChild(quad);
    quad.setPosition(0, 0, -2);
    const qr = quad.addComponent(MeshRenderer);
    qr.mesh = utils.MeshUtils.createMesh({
      positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 2, 2, 1, 3],
    }, undefined, { calculateBounds: true });
    const matN = new Material();
    matN.initialize({ effectAsset: effect!, technique: 3 });
    matN.setProperty('mainTexture', height);
    qr.setSharedMaterial(matN, 0);
    qr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    qr.receiveShadow = MeshRenderer.ShadowReceivingMode.OFF;

    const mat = new Material();
    mat.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_ALPHA_TEST: true } });
    mat.setProperty('alphaThreshold', 0.5);
    mat.setProperty('mainTexture', albedo);
    mat.setProperty('normalMap', normal);
    mat.setProperty('pbrMap', height);
    mat.setProperty('occlusion', 1);
    mat.setProperty('roughness', 1);
    mat.setProperty('metallic', 0);          // 那张图的 B 通道放的是高度,不是金属度:乘 0
    mat.setProperty('normalStrength', this.cfg.normalK);
    mat.setProperty('specularIntensity', this.cfg.specular);
    const mesh = this.makeMesh(`G3DGround_${key}`, nx, nz, mat);
    world.root.addChild(mesh);
    return { key, w, h, rw, rh, cx: 0, cy: 0, sw: 1, sh: 1, albedo, height, normal, camA, camH, camN, matN, mat, mesh, drawn: '', hot: 0 };
  }

  /**
   * 地图外面的一圈地面:地图是一块长方形,自由视角下站在边上往外看就是「世界到头了」。
   * 铺一块很大的地面垫在下面(比地图的地面低 2 厘米),贴整图地表最底下那层林下泥地的图,按和地图里一样的密度平铺;
   * 颜色压暗一些(地图外沿本来就有一圈压暗)。上面再种一圈树(见 TownOutskirts3D)。
   */
  private ensureApron(self: any, world: any): void {
    const cfg = this.cfg;
    const src = this.splat?.was ?? null;
    const tex = (src?.getProperty('floorTex') as Texture2D | null) ?? null;
    const tiles = (src?.getProperty('tiles') as Vec4 | null) ?? null;
    const key = `${cfg.apron}:${tex ? 1 : 0}`;
    if (key === this.apronKey) {
      return;
    }
    this.apronKey = key;
    if (this.apron) {
      this.apron.node.isValid && this.apron.node.destroy();
      this.apron.mat.destroy();
      this.apron = null;
    }
    if (cfg.apron <= 0 || !tex || !tiles) {
      return;
    }
    const def = self.def;
    const U = world.cfg.unitsPerM;
    const sinP = Math.sin((world.cfg.pitch * Math.PI) / 180);
    const hx = def.width / 2 / U + cfg.apron;
    const hz = def.height / 2 / (U * sinP) + cfg.apron;
    // 平铺的密度和地图里一样:整图地表上这层图横向重复 tiles.x 次、纵向 tiles.y 次
    const perX = def.width / tiles.x / U;
    const perZ = def.height / tiles.y / (U * sinP);
    const mat = new Material();
    mat.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
    mat.setProperty('mainTexture', tex);
    mat.setProperty('mainColor', new Color(cfg.apronTint[0], cfg.apronTint[1], cfg.apronTint[2], 255));
    mat.setProperty('roughness', 0.95);
    mat.setProperty('metallic', 0);
    mat.setProperty('specularIntensity', 0.1);
    // 这张图在 2D 那边是靠着色器里取小数平铺的,自己的取样方式不一定是「重复」:这里单独给一个重复的
    const sampler = director.root!.device.getSampler(new gfx.SamplerInfo(gfx.Filter.LINEAR, gfx.Filter.LINEAR, gfx.Filter.LINEAR, gfx.Address.WRAP, gfx.Address.WRAP, gfx.Address.WRAP));
    for (const pass of mat.passes) {
      const binding = pass.getBinding('mainTexture');
      if (binding >= 0) {
        pass.bindSampler(binding, sampler);
      }
    }
    const node = new Node('G3DGroundApron');
    node.layer = FIELD_LAYER;
    world.root.addChild(node);
    world.toWorld(0, 0, _v, -0.02);
    node.setPosition(_v);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = utils.MeshUtils.createMesh({
      positions: [-hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      uvs: [-hx / perX, hz / perZ, hx / perX, hz / perZ, hx / perX, -hz / perZ, -hx / perX, -hz / perZ],
      indices: [0, 2, 1, 0, 3, 2],
    }, undefined, { calculateBounds: true });
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
    this.apron = { node, mat };
  }

  private ensure(self: any, world: any): void {
    if (this.rig && this.rig.isValid && this.self === self) {
      return;
    }
    this.stop();
    this.self = self;
    this.rig = new Node('TownGround3D');
    this.rig.layer = FIELD_LAYER;
    world.root.addChild(this.rig);
    const cfg = this.cfg;
    const def = self.def;
    if (cfg.mips) {
      hookGl();        // 要赶在建贴图之前(建的时候才记得到每张贴图的帧缓冲)
    }
    const maxPx = (director.root!.device as any).capabilities?.maxTextureSize ?? 4096;
    this.near = this.makeAtlas('near', cfg.nearPx, cfg.nearPx, cfg.nearPx, cfg.nearPx, GROUND_LAYER | GROUND_STATIC_LAYER, world, 0, 6, 6);
    // 远处那张:宽高固定 2 : 1(2 的整数次方),盖住整张地图 —— 地图比 2 : 1 更扁就上下多盖一点,更方就左右多盖一点
    const fw = Math.min(cfg.farPx, maxPx);
    const rw = Math.min(cfg.farReliefPx, fw);
    this.far = this.makeAtlas('far', fw, fw / 2, rw, rw / 2, GROUND_STATIC_LAYER, world, 1, 16, 10);
    this.far.cx = 0;
    this.far.cy = 0;
    this.far.sw = Math.max(def.width, def.height * 2);
    this.far.sh = this.far.sw / 2;
    this.warm = 90;
    this.farAt = 0;
    this.time = 0;
  }

  // ───────────────────────── 2D 那边:换材质、建替身 ─────────────────────────
  private splatMaterial(src: Material, technique: number): Material {
    const m = new Material();
    m.initialize({ effectAsset: effect!, technique });
    for (const name of ['mask2Tex', 'floorTex', 'mossTex', 'meadowTex', 'dirtTex', 'leafTex', 'tiles', 'tiles2', 'tiles3']) {
      const v = src.getProperty(name);
      if (v !== null && v !== undefined) {
        m.setProperty(name, v as any);
      }
    }
    // 2D 那边的调色参数:S 曲线和亮度照搬,暗角(按屏幕位置的)不要
    const grade = src.getProperty('grade') as Vec4 | null;
    m.setProperty('grade', grade ? new Vec4(grade.x, 0, grade.z, grade.w) : new Vec4(0.10, 0, 1.06, 0));
    return m;
  }

  private surfMaterial(asset: string): Material {
    const s = surfOf(asset);
    const key = s.join(',');
    let m = this.surfMats.get(key);
    if (!m) {
      m = new Material();
      m.initialize({ effectAsset: effect!, technique: 2 });
      m.setProperty('surf', new Vec4(s[0], s[1], s[2], s[3]));
      this.surfMats.set(key, m);
    }
    return m;
  }

  private cloneSprite(src: Sprite, parent: Node, mat: Material): Node {
    const from = src.node;
    const n = new Node(from.name);
    n.layer = GROUND_H_LAYER;
    parent.addChild(n);
    const ui = from.getComponent(UITransform)!;
    const tf = n.addComponent(UITransform);
    tf.setContentSize(new Size(ui.width, ui.height));
    tf.setAnchorPoint(ui.anchorX, ui.anchorY);
    n.setPosition(from.position);
    n.setScale(from.scale);
    n.setRotation(from.rotation);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = src.type;
    sp.trim = src.trim;
    sp.spriteFrame = src.spriteFrame;
    sp.customMaterial = mat;
    tf.setContentSize(new Size(ui.width, ui.height));
    return n;
  }

  /** 贴地层里带图片的东西各建一个「只出高度」的替身;图片是陆续到的,所以隔一会儿对一遍,数量变了就重建。 */
  private ensureClones(self: any): void {
    const ground: Node | null = self.groundRoot ?? null;
    const world2d: Node | null = self.world ?? null;
    if (!ground || !ground.isValid || !world2d || !world2d.isValid) {
      return;
    }
    const splatNode = ground.getChildByName('Splat');
    const splatSprite = splatNode?.getComponent(Sprite) ?? null;
    const ready: Array<{ holder: Node; sprite: Sprite; asset: string }> = [];
    const props: any[] = self.def?.props ?? [];
    for (const child of ground.children) {
      if (!/^TownProp_/.test(child.name)) {
        continue;
      }
      const sprite = child.getChildByName('Art')?.getComponent(Sprite) ?? null;
      if (sprite && sprite.spriteFrame) {
        const index = Number(child.name.slice(child.name.lastIndexOf('_') + 1));
        ready.push({ holder: child, sprite, asset: String(props[index]?.asset ?? sprite.spriteFrame.name ?? '') });
      }
    }
    const key = `${splatSprite && splatSprite.spriteFrame ? 1 : 0}:${ready.length}`;
    if (key === this.cloneKey && this.cloneRoot && this.cloneRoot.isValid) {
      return;
    }
    this.cloneKey = key;
    if (this.cloneRoot && this.cloneRoot.isValid) {
      this.cloneRoot.destroy();
    }
    this.clones = [];
    const root = new Node('G3DGroundH');
    root.layer = GROUND_H_LAYER;
    root.addComponent(UITransform).setContentSize(new Size(self.def.width, self.def.height));
    world2d.addChild(root);
    this.cloneRoot = root;
    if (splatSprite && splatSprite.spriteFrame) {
      if (!this.splat || this.splat.sprite !== splatSprite) {
        this.restoreSplat();
        const was = splatSprite.customMaterial;
        if (was) {
          this.splat = { sprite: splatSprite, was, albedo: this.splatMaterial(was, 0), h: this.splatMaterial(was, 1) };
          splatSprite.customMaterial = this.splat.albedo;
        }
      }
      if (this.splat) {
        this.clones.push({ src: splatNode!, dst: this.cloneSprite(splatSprite, root, this.splat.h) });
      }
    }
    for (const item of ready) {
      const holder = new Node(item.holder.name);
      holder.layer = GROUND_H_LAYER;
      holder.addComponent(UITransform).setContentSize(new Size(10, 10));
      root.addChild(holder);
      holder.setPosition(item.holder.position);
      holder.setScale(item.holder.scale);
      this.cloneSprite(item.sprite, holder, this.surfMaterial(item.asset));
      this.clones.push({ src: item.holder, dst: holder });
    }
    this.stats.clones = this.clones.length;
    if (this.near) {
      this.near.drawn = '';
    }
    this.farAt = 0;
  }

  private restoreSplat(): void {
    const s = this.splat;
    this.splat = null;
    if (s) {
      if (s.sprite.isValid) {
        s.sprite.customMaterial = s.was;
      }
      s.albedo.destroy();
      s.h.destroy();
    }
  }

  // ───────────────────────── 每帧 ─────────────────────────
  private aim(cam: Camera, a: Atlas, tf: UITransform, ui: Camera, k: number): void {
    _v.set(a.cx, a.cy, 0);
    tf.convertToWorldSpaceAR(_v, _w);
    cam.node.setWorldPosition(_w.x, _w.y, ui.node.worldPosition.z);
    cam.node.setWorldRotation(ui.node.worldRotation);
    cam.orthoHeight = (a.sh * k) / 2;
    cam.near = ui.near;
    cam.far = ui.far;
  }

  private place(a: Atlas, world: any, lift: number): void {
    const U = world.cfg.unitsPerM;
    const sinP = Math.sin((world.cfg.pitch * Math.PI) / 180);
    world.toWorld(a.cx, a.cy, _v, lift);
    a.mesh.setPosition(_v);
    a.mesh.setScale(a.sw / U, 1, a.sh / (U * sinP));
    // 法线:相邻两个像素之间隔多少米 → 高度差换成坡度。地图的纵向在 3D 里被拉长了(÷ sin 俯角),同样的高度差坡更缓
    const stepX = a.sw / a.rw / U;
    const stepZ = a.sh / a.rh / (U * sinP);
    a.matN.setProperty('slope', new Vec4(1 / a.rw, 1 / a.rh, this.cfg.bump / stepX, this.cfg.bump / stepZ));
  }

  /**
   * 每帧(野外渲染器的 step 之后、TownWorld3D.sync 里调):近处那张跟着队长挪,远处那张定时重画。
   * ui = 界面相机(2D 世界是它画的,这里的相机照它的朝向摆);tf / k = 2D 世界节点的变换和缩放。
   */
  sync(self: any, world: any, ui: Camera, tf: UITransform, k: number, dt: number): void {
    if (!effect) {
      return;
    }
    this.ensure(self, world);
    const near = this.near!;
    const far = this.far!;
    this.tick += 1;
    this.time += dt;
    if (this.tick % 15 === 1 || !this.cloneRoot || !this.cloneRoot.isValid) {
      this.ensureClones(self);
      this.ensureApron(self, world);
    }
    // 2D 的视野裁剪会把屏幕外的贴地图片关掉:贴图集的范围比屏幕大,重新打开
    const ground: Node | null = self.groundRoot ?? null;
    let forced = 0;
    for (const item of (self.cullItems ?? []) as Array<{ node: Node }>) {
      const n = item.node;
      if (n && n.isValid && n.parent === ground && !n.active) {
        n.active = true;
        forced += 1;
      }
    }
    this.stats.forced = forced;
    for (const c of this.clones) {
      if (c.src.isValid && c.dst.isValid && c.dst.active !== c.src.active) {
        c.dst.active = c.src.active;
      }
    }
    const cfg = this.cfg;
    const lead = self.leader;
    const snap = Math.max(1, cfg.snap);
    near.cx = Math.round((lead?.x ?? 0) / snap) * snap;
    near.cy = Math.round((lead?.y ?? 0) / snap) * snap;
    near.sw = cfg.nearSpan;
    near.sh = cfg.nearSpan;
    this.aim(near.camA, near, tf, ui, k);
    this.aim(near.camH, near, tf, ui, k);
    this.place(near, world, 0.004);
    const key = `${near.cx}:${near.cy}:${this.cloneKey}`;
    if (key !== near.drawn) {
      near.drawn = key;
      near.hot = 2;
    }
    const warm = this.warm > 0;
    if (warm) {
      this.warm -= 1;
    }
    const nearHot = warm || near.hot > 0;
    if (near.hot > 0) {
      near.hot -= 1;
    }
    near.camH.enabled = nearHot;
    near.camN.enabled = nearHot;
    if (nearHot) {
      this.stats.nearDraws += 1;
    }
    // 远处:整张地图。只画静态的东西,画一次用很久:刚进图那一阵(图片陆续到)隔 20 帧画一遍,之后只在贴地图片的数量变了 / 隔很久才重画
    this.aim(far.camA, far, tf, ui, k);
    this.aim(far.camH, far, tf, ui, k);
    this.place(far, world, 0);
    if (this.time >= this.farAt || (warm && this.warm % 20 === 0)) {
      this.farAt = this.time + (cfg.farEvery > 0 ? cfg.farEvery : 1e9);
      far.hot = 2;
    }
    const farHot = far.hot > 0;
    if (far.hot > 0) {
      far.hot -= 1;
    }
    far.camA.enabled = farHot;
    far.camH.enabled = farHot;
    far.camN.enabled = farHot;
    if (farHot) {
      this.stats.farDraws += 1;
    }
  }

  /** 现场调参(贴图大小 / 范围变了要整个重建)。 */
  set(patch: Partial<GroundCfg>): void {
    const cfg = this.cfg;
    const sig = (): string => `${cfg.nearPx}|${cfg.nearSpan}|${cfg.farPx}|${cfg.farReliefPx}|${cfg.mips}|${cfg.aniso}|${cfg.apron}|${cfg.apronTint.join(',')}`;
    const before = sig();
    Object.assign(cfg, patch);
    if (before !== sig()) {
      this.stop();      // 下一帧按新的大小重建
      return;
    }
    for (const a of [this.near, this.far]) {
      if (a) {
        a.mat.setProperty('normalStrength', cfg.normalK);
        a.mat.setProperty('specularIntensity', cfg.specular);
        a.drawn = '';
      }
    }
    this.farAt = 0;
  }

  stop(): void {
    this.restoreSplat();
    if (this.cloneRoot && this.cloneRoot.isValid) {
      this.cloneRoot.destroy();
    }
    this.cloneRoot = null;
    this.clones = [];
    this.cloneKey = '';
    for (const a of [this.near, this.far]) {
      if (!a) {
        continue;
      }
      if (a.mesh.isValid) {
        a.mesh.destroy();
      }
      a.albedo.destroy();
      a.height.destroy();
      a.normal.destroy();
      a.mat.destroy();
      a.matN.destroy();
    }
    this.near = null;
    this.far = null;
    if (this.apron) {
      this.apron.node.isValid && this.apron.node.destroy();
      this.apron.mat.destroy();
      this.apron = null;
    }
    this.apronKey = '';
    this.stats.mips = 0;
    unhookGl();
    if (this.rig && this.rig.isValid) {
      this.rig.destroy();
    }
    this.rig = null;
    this.surfMats.forEach((m) => m.destroy());
    this.surfMats.clear();
    // 让 2D 的视野裁剪下一帧重算一遍:被这里重新打开的屏幕外的贴地图片交还给它去关
    if (this.self && typeof this.self.cullKey === 'string') {
      this.self.cullKey = '';
    }
    this.self = null;
  }

  info(): Record<string, unknown> {
    const a = this.near;
    return { on: !!this.rig, ready: !!effect, cfg: { ...this.cfg }, ...this.stats,
      near: a ? { at: [a.cx, a.cy], span: a.sw, px: [a.w, a.h] } : null,
      far: this.far ? { px: [this.far.w, this.far.h], relief: [this.far.rw, this.far.rh], span: [this.far.sw, this.far.sh] } : null, splat: !!this.splat, apron: !!this.apron };
  }
}
