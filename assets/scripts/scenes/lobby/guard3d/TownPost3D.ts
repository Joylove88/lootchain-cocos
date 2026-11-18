import { Camera, director, EffectAsset, gfx, Material, renderer, rendering, resources, sys, Vec4 } from 'cc';
import { keptMaterial, loadKit } from './G3DKit';

/**
 * 野外真 3D 场景的后期处理(实验,2026-11-17;跟着 ?field3d=2 走,&fpost=0~3 选档,默认电脑端 2 / 手机 0)。
 *
 * 由来:程序模型磨到第二版之后,离参考的那个程序化射击游戏的观感主要差在后期 —— 环境光遮蔽、泛光、电影感的色调。用户选了「先做后期」。
 *
 * 一帧怎么走(都在 3D 相机这一台上,2D 的地表贴图 / 界面相机不受影响):
 * 1. 场景不直接画到屏幕,先画进一张离屏的高动态贴图(线性颜色、半浮点,亮度可以超过 1);放大档位下这张图比窗口大(超采样);
 * 2. 环境光遮蔽:从深度图算每个像素被周围挡住多少(半分辨率)→ 保边模糊 → 乘到画面上:东西和地面、东西和东西挨着的地方压暗;
 * 3. 泛光:取出亮度超过 1 的部分(只有技能的光 / 火 / 高光这种真发亮的)→ 逐级缩小再放大 → 一圈柔和的光晕;
 * 4. 调色:曝光、对比、饱和、暗部偏冷亮部偏暖、高光「肩部」(特别亮的地方平滑发白,不是一刀切平),转成显示用的颜色;
 * 5. 输出:缩回窗口大小、轻微锐化、暗角、抖动,画到屏幕;之后界面相机照旧把 2D 界面叠上去(界面不吃暗角和调色)。
 *
 * 做法:内置管线支持给相机挂自定义的管线步骤(camera.pipelineSettings._passes,引擎自带的景深就是这么接的),
 * 这里挂一个步骤把上面 2~5 全包了;着色器在 resources/effects/g3d-post.effect。内置的泛光 / 色调映射 / 抗锯齿都不开。
 *
 * 代价和取舍:
 * - 当前图形后端(WebGL1)离屏渲染没有硬件抗锯齿,透明边的「软边」(透明度转覆盖率)也跟着失效。
 *   所以开后期时:带透明边的材质改回硬裁切(fieldSoftEdges() = false),锯齿靠放大渲染再缩小(档位 2 / 3)或边缘抗锯齿(档位 1)补。
 * - 高动态要设备支持半浮点渲染目标,遮蔽要能读深度图;不支持的自动降级(低动态 / 不做遮蔽)。
 * - 开着时把管线的「浮点输出」宏打开(着色器会重编一次),关掉时还原。
 */

export interface PostCfg {
  /** 档位:0 关 / 1 标准(原尺寸 + 边缘抗锯齿)/ 2 高(1.5 倍放大渲染)/ 3 超高(2 倍)。 */
  level: number;
  /** 放大渲染的倍数、是否再过一遍边缘抗锯齿(由档位带出来,也可以单独改)。 */
  scale: number;
  fxaa: boolean;
  /** 高动态(设备不支持时自动当作 false)。 */
  hdr: boolean;
  // 环境光遮蔽:半径(米)、强度、指数、仰角偏置、有效距离(半径的几倍,平方)、压暗力度、压向什么颜色、保边的深度差(米)
  ao: boolean;
  aoRadius: number;
  aoIntensity: number;
  aoPower: number;
  aoBias: number;
  aoReach: number;
  aoStrength: number;
  aoTint: [number, number, number];
  aoSharp: number;
  // 泛光:阈值(线性亮度,1 = 原图里的纯白)、软膝、强度、扩散(越大光晕越宽)、级数、放大时的取样半径、单点亮度上限
  bloom: boolean;
  bloomThreshold: number;
  bloomKnee: number;
  bloomIntensity: number;
  bloomScatter: number;
  bloomLevels: number;
  bloomRadius: number;
  bloomMax: number;
  // 调色:曝光、对比(1 = 不动)、对比的轴心、暗部压黑、饱和度、肩部起点、暗部 / 亮部染色、分色的分界亮度
  exposure: number;
  contrast: number;
  pivot: number;
  toe: number;
  saturation: number;
  shoulder: number;
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  splitAt: number;
  // 输出:暗角(力度 / 起点 / 终点 / 往正圆靠多少)、锐化、抖动、调试(1 只看遮蔽 / 2 只看泛光 / 3 不调色直出 / 4 看深度)
  vignette: number;
  vignetteStart: number;
  vignetteEnd: number;
  vignetteRound: number;
  sharpen: number;
  dither: number;
  debug: number;
  // 雾(按深度在调色那一步加;镜头放开之后看得远才用得上):颜色(线性)、从多远开始(米)、浓度(每米)、最浓到几成
  fog: boolean;
  fogColor: [number, number, number];
  fogStart: number;
  fogDensity: number;
  fogMax: number;
  /** 雾分两种颜色时(太阳很低的灯光方案):背着太阳那一侧的颜色、朝太阳的方向(世界坐标)、往太阳那边偏得多集中(0 = 只用 fogColor 一种)。 */
  fogAway: [number, number, number];
  fogSun: [number, number, number];
  fogLobe: number;
}

/** 各档位带出来的设置。 */
const LEVELS: Record<number, { scale: number; fxaa: boolean }> = {
  1: { scale: 1, fxaa: true },
  2: { scale: 1.5, fxaa: false },
  3: { scale: 2, fxaa: false },
};

export const POST_CFG: PostCfg = {
  level: 0, scale: 1, fxaa: true, hdr: true,
  // 以下数值是对着画面调的(2026-11-17,村外林地):遮蔽压到「看得出体积、不显脏」;泛光阈值略高于 1,被技能的光照亮的地面不跟着泛;
  // 调色整体很克制 —— 手绘地表和贴图是按「原样显示」画的,对比 / 饱和只加一点点,主要靠肩部把过亮的地方收住
  ao: true, aoRadius: 0.36, aoIntensity: 1.6, aoPower: 1.0, aoBias: 0.1, aoReach: 2.25, aoStrength: 0.7, aoTint: [0.16, 0.19, 0.27], aoSharp: 0.22,
  bloom: true, bloomThreshold: 1.1, bloomKnee: 0.5, bloomIntensity: 0.5, bloomScatter: 0.7, bloomLevels: 6, bloomRadius: 1, bloomMax: 24,
  exposure: 1, contrast: 1.05, pivot: 0.2, toe: 0.03, saturation: 1.06, shoulder: 0.8,
  shadowTint: [0.97, 1.0, 1.04], highlightTint: [1.03, 1.0, 0.97], splitAt: 0.5,
  vignette: 0.16, vignetteStart: 0.55, vignetteEnd: 1.05, vignetteRound: 0,
  sharpen: 0.18, dither: 1, debug: 0,
  fog: false, fogColor: [0.5, 0.58, 0.68], fogStart: 16, fogDensity: 0.024, fogMax: 0.9, fogAway: [0.5, 0.58, 0.68], fogSun: [0, 1, 0], fogLobe: 0,
};

// ───────────────────────── 开关 / 档位 ─────────────────────────
let levelFromPage: number | null = null;

/** 档位:控制台现场改的(__LC_FIELD_POST)优先,否则地址参数 ?fpost=N / localStorage.lcFieldPost,都没有 = 电脑端 2、手机 0。 */
export function postLevel(): number {
  const g = globalThis as any;
  if (g.__LC_FIELD_POST !== undefined) {
    return Math.max(0, Math.min(3, Number(g.__LC_FIELD_POST) || 0));
  }
  if (levelFromPage === null) {
    let v: number | null = null;
    try {
      const m = /[?&]fpost=(\d)\b/.exec(location.search);
      if (m) {
        v = Number(m[1]);
      } else {
        const s = localStorage.getItem('lcFieldPost');
        v = s === null || s === '' ? null : Number(s);
      }
    } catch (error) {
      v = null;
    }
    if (v === null || !Number.isFinite(v)) {
      v = sys.isMobile ? 0 : 2;
    }
    levelFromPage = Math.max(0, Math.min(3, Math.round(v)));
  }
  return levelFromPage;
}

/** 现在有几台相机真的挂着后期(= 场景是离屏画的)。 */
let active = 0;
let msaaFlag: boolean | null = null;

/**
 * 带透明边的贴片能不能用「软边」(透明度转覆盖率):要画布开了多重采样,而且场景是直接画到屏幕上的。
 * 开了后期 = 离屏渲染 = 没有多重采样,软边失效,材质要改回硬裁切。
 */
export function fieldSoftEdges(): boolean {
  if (active > 0) {
    return false;
  }
  if (msaaFlag === null) {
    try {
      const gl = (director.root!.device as any).gl as WebGLRenderingContext | undefined;
      msaaFlag = !!gl && gl.getParameter(gl.SAMPLES) > 1;
    } catch (error) {
      msaaFlag = false;
    }
  }
  return msaaFlag;
}

/**
 * 高动态渲染时,引擎让「开了混合的通道」照旧直接输出显示用的颜色(它的老流程里半透明的东西是在色调映射之后才画的);
 * 可内置管线其实把半透明和不透明画在同一张高动态图上,结果带混合的标准材质会被多转换一次颜色(整体发白发灰)。
 * 这里把材质上「我是混合通道」的标记摘掉,让它和别的东西一样输出线性颜色。不开高动态时两种写法结果一样,所以可以无条件调。
 * 要在材质第一次被拿去画之前调(标记一旦写进宏表就留在里面了,所以顺手清一遍)。
 */
export function linearBlend(mat: Material): void {
  for (const pass of mat.passes) {
    Object.defineProperty(pass, '_isBlend', { get: () => false, configurable: true });
    const defines = (pass as any)._defines;
    if (defines && defines.CC_IS_TRANSPARENCY_PASS !== undefined) {
      delete defines.CC_IS_TRANSPARENCY_PASS;
    }
  }
}

/**
 * 引擎的一个坑(3.8.8 网页端的管线执行器):「画一块满屏方块」的步骤,它的描述对象缓存在按顺序复用的队列对象上,
 * 而且只认第一次配到的那个步骤。一帧里队列的数量 / 顺序一变 —— 技能的点光亮起来多出几条追加光的队列、
 * 现场关掉遮蔽或泛光、换档 —— 队列和步骤就错位:轻则某一步用了别的步骤的着色器(画面花一帧),重则直接抛异常。
 * 引擎自带的后期步骤数固定所以平时撞不上;这里的步骤会随设置增减,野外的点光又是时有时无,必须修。
 * 做法:给那个队列类补一刀 —— 发现缓存的描述不是这次要画的步骤,就把它改指到这次的步骤上(描述对象本身不用重建)。
 * 改的是引擎对象的原型,整个页面生效、装上就不撤(对引擎自带的后期同样是修正,没有副作用)。
 */
let blitPatched = false;
function patchBlitCache(): void {
  if (blitPatched) {
    return;
  }
  try {
    const pool = (director.root!.pipeline as any)._executor?._context?.pools?.deviceQueuePool;
    const sample = pool?._data?.[0];
    const proto = sample ? Object.getPrototypeOf(sample) : null;
    if (!proto || typeof proto.createBlitDesc !== 'function') {
      return;       // 执行器还没建起来(还没画过一帧)或者引擎换了写法:下次再试
    }
    const orig = proto.createBlitDesc;
    proto.createBlitDesc = function patched(this: any, blit: unknown): void {
      const desc = this._blitDesc;
      if (desc && desc.blit !== blit) {
        desc.blit = blit;
      }
      orig.call(this, blit);
    };
    blitPatched = true;
  } catch (error) {
    console.warn('[f3d] blit patch', error);
  }
}

// ───────────────────────── 着色器 ─────────────────────────
let effect: EffectAsset | null = null;
let effectAsked = false;
let effectFailed = false;
const waiters: Array<() => void> = [];

/** 把后期用的着色器读进来(连同引擎自带的边缘抗锯齿那张材质);done 在读完或读失败之后调。 */
export function loadPost(done: () => void): void {
  if (effect || effectFailed) {
    done();
    return;
  }
  waiters.push(done);
  if (effectAsked) {
    return;
  }
  effectAsked = true;
  let left = 2;
  const finish = (): void => {
    left -= 1;
    if (left > 0) {
      return;
    }
    for (const w of waiters.splice(0)) {
      w();
    }
  };
  resources.load('effects/g3d-post', EffectAsset, (error, asset) => {
    if (error || !asset) {
      effectFailed = true;
      console.warn('[f3d] load g3d-post', error?.message);
    } else {
      asset.addRef();
      effect = asset;
    }
    finish();
  });
  loadKit(['g3d-fxaa'], finish);
}

export function postReady(): boolean {
  return !!effect;
}

// ───────────────────────── 管线步骤 ─────────────────────────
const { LoadOp, StoreOp, Format } = gfx;
const BLACK = new gfx.Color(0, 0, 0, 1);
const WHITE = new gfx.Color(1, 1, 1, 1);

class PostBuilder {
  mat: Material | null = null;
  fxaaMat: Material | null = null;
  /** 最近一帧实际走的是什么(给 info 看)。 */
  last: Record<string, unknown> = {};
  private sized = '';
  private point: gfx.Sampler | null = null;
  private linear: gfx.Sampler | null = null;
  private v0 = new Vec4();
  private v1 = new Vec4();
  private v2 = new Vec4();
  private v3 = new Vec4();

  constructor(private cfg: PostCfg) {}

  // 排在内置步骤(0 / 100)前面登记:正向渲染那一步要先知道「后面还有步骤」「深度要留着」
  getConfigOrder(): number {
    return -10;
  }

  // 正向渲染(100)之后;内置的泛光(200)/ 色调映射(300)/ 抗锯齿(400)在这台相机上都不开
  getRenderOrder(): number {
    return 250;
  }

  configCamera(camera: any, ppl: any, cc: any): void {
    cc.lcPost = !!this.mat && cc.enableFullPipeline;
    if (!cc.lcPost) {
      return;
    }
    cc.lcDepth = (this.cfg.ao || this.cfg.fog) && ppl.supportDepthSample;
    cc.lcAo = this.cfg.ao && cc.lcDepth;
    if (cc.lcDepth) {
      cc.enableStoreSceneDepth = true;       // 正向渲染完把深度留下(平时画完就丢):遮蔽和雾都要读
    }
    // 高动态时内置的「色调映射」步骤会自己加一遍(把画面转成显示用的颜色):这里的调色已经做了,让它别加。
    // 离屏贴图的格式在这之前已经按高动态定好了(半浮点),不受影响。
    cc.lcHdr = cc.enableHDR;
    cc.enableHDR = false;
    cc.remainingPasses += 1;
  }

  private key(cc: any): string {
    return `${cc.renderWindowId}:${cc.width}x${cc.height}:${cc.nativeWidth}x${cc.nativeHeight}:${cc.radianceFormat}:${this.cfg.bloomLevels}`;
  }

  windowResize(ppl: any, pplConfigs: any, cc: any, window: any): void {
    if (!cc.lcPost) {
      return;
    }
    const id = window.renderWindowId;
    const w = cc.width as number;
    const h = cc.height as number;
    const aw = Math.max(1, w >> 1);
    const ah = Math.max(1, h >> 1);
    ppl.addRenderTarget(`LcAo0_${id}`, Format.RGBA8, aw, ah);
    ppl.addRenderTarget(`LcAo1_${id}`, Format.RGBA8, aw, ah);
    const n = this.cfg.bloomLevels;
    for (let i = 0; i < n; i += 1) {
      ppl.addRenderTarget(`LcBloom${i}_${id}`, cc.radianceFormat, Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
    }
    ppl.addRenderTarget(`LcLdr0_${id}`, Format.RGBA8, w, h);
    ppl.addRenderTarget(`LcLdr1_${id}`, Format.RGBA8, w, h);
    this.sized = this.key(cc);
  }

  setup(ppl: any, pplConfigs: any, cc: any, camera: renderer.scene.Camera, context: any, prev: any): any {
    if (!cc.lcPost) {
      return prev;
    }
    patchBlitCache();
    cc.remainingPasses -= 1;
    const QueueHint = rendering.QueueHint;
    const id = cc.renderWindowId as number;
    const w = cc.width as number;
    const h = cc.height as number;
    const nw = cc.nativeWidth as number;
    const nh = cc.nativeHeight as number;
    const scene = context.colorName as string;
    const depth = context.depthStencilName as string;
    const cfg = this.cfg;
    const mat = this.mat!;
    const ldr = cc.radianceFormat === Format.RGBA16F ? 0 : 1;
    if (!this.point) {
      const F = gfx.Filter;
      const A = gfx.Address;
      this.point = ppl.device.getSampler(new gfx.SamplerInfo(F.POINT, F.POINT, F.NONE, A.CLAMP, A.CLAMP, A.CLAMP));
      this.linear = ppl.device.getSampler(new gfx.SamplerInfo(F.LINEAR, F.LINEAR, F.NONE, A.CLAMP, A.CLAMP, A.CLAMP));
    }
    const point = this.point;
    const linear = this.linear;

    if (this.sized !== this.key(cc)) {
      // 渲染目标还没按现在的尺寸登记(刚挂上 / 刚改了档位):这一帧先原样拷到屏幕,同时让管线下一帧重新登记
      (rendering as any).forceResizeAllWindows?.();
      const copy = ppl.addRenderPass(nw, nh, 'cc-tone-mapping');
      copy.addRenderTarget(cc.colorName, LoadOp.CLEAR, StoreOp.STORE, BLACK);
      copy.addTexture(scene, 'inputTexture');
      copy.addQueue(QueueHint.OPAQUE).addFullscreenQuad(cc.copyAndTonemapMaterial, ldr ? 1 : 0);
      this.last = { skipped: 'resize' };
      return copy;
    }

    const { v0, v1, v2, v3 } = this;
    let p: any;
    // 相机是正交还是透视:深度怎么换算成距离、画面上的偏移怎么换算成米,两种不一样
    const persp = camera.projectionType === renderer.scene.CameraProjection.PERSPECTIVE ? 1 : 0;
    const near = camera.nearClip;
    const far = camera.farClip;
    const tanY = Math.tan(camera.fov / 2);
    const tanX = tanY * camera.aspect;

    // ── 环境光遮蔽 ──
    const ao0 = `LcAo0_${id}`;
    const ao1 = `LcAo1_${id}`;
    const aoOn = !!cc.lcAo && !!depth && cfg.aoStrength > 0;
    if (aoOn) {
      const aw = Math.max(1, w >> 1);
      const ah = Math.max(1, h >> 1);
      const halfH = camera.orthoHeight;
      const halfW = halfH * camera.aspect;
      p = ppl.addRenderPass(aw, ah, 'lc-post-ao');
      p.addRenderTarget(ao0, LoadOp.CLEAR, StoreOp.STORE, WHITE);
      p.addTexture(depth, 'lcDepth', point);
      p.setVec4('lcP0', v0.set(1 / w, 1 / h, halfW, halfH));
      p.setVec4('lcP1', v1.set(near, far, cfg.aoRadius, cfg.aoBias));
      p.setVec4('lcP2', v2.set(cfg.aoIntensity, cfg.aoPower, cfg.aoReach, 0));
      p.setVec4('lcP3', v3.set(persp, tanX, tanY, 0));
      p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(mat, 0);
      const sharp = (far - near) / Math.max(0.01, cfg.aoSharp);
      p = ppl.addRenderPass(aw, ah, 'lc-post-ao-blur');
      p.addRenderTarget(ao1, LoadOp.CLEAR, StoreOp.STORE, WHITE);
      p.addTexture(ao0, 'lcTexA', point);
      p.setVec4('lcP0', v0.set(1 / aw, 0, sharp, 0));
      p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(mat, 1);
      p = ppl.addRenderPass(aw, ah, 'lc-post-ao-blur');
      p.addRenderTarget(ao0, LoadOp.CLEAR, StoreOp.STORE, WHITE);
      p.addTexture(ao1, 'lcTexA', point);
      p.setVec4('lcP0', v0.set(0, 1 / ah, sharp, 0));
      p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(mat, 1);
      if (cfg.debug !== 1) {
        p = ppl.addRenderPass(w, h, 'lc-post-ao-apply');
        p.addRenderTarget(scene, LoadOp.LOAD, StoreOp.STORE);
        p.addTexture(ao0, 'lcTexA', linear);
        p.setVec4('lcP0', v0.set(cfg.aoStrength, ldr, 0, 0));
        p.setVec4('lcP1', v1.set(cfg.aoTint[0], cfg.aoTint[1], cfg.aoTint[2], 0));
        p.addQueue(QueueHint.BLEND).addFullscreenQuad(mat, 2);
      }
    }

    // ── 泛光 ──
    const n = Math.max(2, cfg.bloomLevels);
    const bloomOn = cfg.bloom && cfg.bloomIntensity > 0;
    const b0 = `LcBloom0_${id}`;
    if (bloomOn) {
      const bw: number[] = [];
      const bh: number[] = [];
      for (let i = 0; i < n; i += 1) {
        bw.push(Math.max(1, w >> (i + 1)));
        bh.push(Math.max(1, h >> (i + 1)));
      }
      p = ppl.addRenderPass(bw[0], bh[0], 'lc-post-bloom-pre');
      p.addRenderTarget(b0, LoadOp.CLEAR, StoreOp.STORE, BLACK);
      p.addTexture(scene, 'lcTexA', linear);
      p.setVec4('lcP0', v0.set(1 / w, 1 / h, ldr ? Math.min(cfg.bloomThreshold, 0.86) : cfg.bloomThreshold, cfg.bloomKnee));
      p.setVec4('lcP1', v1.set(cfg.bloomMax, ldr, 0, 0));
      p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(mat, 3);
      for (let i = 1; i < n; i += 1) {
        p = ppl.addRenderPass(bw[i], bh[i], 'lc-post-bloom-down');
        p.addRenderTarget(`LcBloom${i}_${id}`, LoadOp.CLEAR, StoreOp.STORE, BLACK);
        p.addTexture(`LcBloom${i - 1}_${id}`, 'lcTexA', linear);
        p.setVec4('lcP0', v0.set(1 / bw[i - 1], 1 / bh[i - 1], 0, 0));
        p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(mat, 4);
      }
      for (let i = n - 2; i >= 0; i -= 1) {
        p = ppl.addRenderPass(bw[i], bh[i], 'lc-post-bloom-up');
        p.addRenderTarget(`LcBloom${i}_${id}`, LoadOp.LOAD, StoreOp.STORE);
        p.addTexture(`LcBloom${i + 1}_${id}`, 'lcTexA', linear);
        p.setVec4('lcP0', v0.set(1 / bw[i + 1], 1 / bh[i + 1], cfg.bloomRadius, cfg.bloomScatter));
        p.addQueue(QueueHint.BLEND).addFullscreenQuad(mat, 5);
      }
    }

    // ── 调色 ──
    const ldr0 = `LcLdr0_${id}`;
    const ldr1 = `LcLdr1_${id}`;
    p = ppl.addRenderPass(w, h, 'lc-post-grade');
    p.addRenderTarget(ldr0, LoadOp.CLEAR, StoreOp.STORE, BLACK);
    p.addTexture(scene, 'lcTexA', point);
    p.addTexture(bloomOn ? b0 : scene, 'lcTexB', linear);
    p.addTexture(aoOn ? ao0 : scene, 'lcTexC', linear);
    const fogOn = cfg.fog && !!depth && cfg.fogMax > 0 && !ldr;
    p.addTexture(depth || scene, 'lcDepth', point);
    p.setVec4('lcP4', v0.set(cfg.fogColor[0], cfg.fogColor[1], cfg.fogColor[2], fogOn ? cfg.fogMax : 0));
    p.setVec4('lcP5', v0.set(near, far, persp, 0));
    p.setVec4('lcP6', v0.set(cfg.fogStart, cfg.fogDensity, tanX, tanY));
    // 朝太阳的方向换到相机坐标系里(只转方向,不带平移)
    const mv = camera.matView;
    const sd = cfg.fogSun;
    p.setVec4('lcP7', v0.set(mv.m00 * sd[0] + mv.m04 * sd[1] + mv.m08 * sd[2], mv.m01 * sd[0] + mv.m05 * sd[1] + mv.m09 * sd[2], mv.m02 * sd[0] + mv.m06 * sd[1] + mv.m10 * sd[2],
      persp ? cfg.fogLobe : 0));
    p.setVec4('lcP8', v0.set(cfg.fogAway[0], cfg.fogAway[1], cfg.fogAway[2], 0));
    p.setVec4('lcP0', v0.set(cfg.exposure, bloomOn ? cfg.bloomIntensity : 0, cfg.contrast, cfg.pivot));
    p.setVec4('lcP1', v1.set(cfg.saturation, cfg.shoulder, ldr, (cfg.debug === 1 || cfg.debug === 4) && !aoOn ? 0 : cfg.debug));
    p.setVec4('lcP2', v2.set(cfg.shadowTint[0], cfg.shadowTint[1], cfg.shadowTint[2], cfg.splitAt));
    p.setVec4('lcP3', v3.set(cfg.highlightTint[0], cfg.highlightTint[1], cfg.highlightTint[2], cfg.toe));
    p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(mat, 6);

    // ── 边缘抗锯齿(引擎自带的那张材质;只在没放大渲染的档位用)──
    let out = ldr0;
    const fxaaOn = cfg.fxaa && !!this.fxaaMat && !cfg.debug;
    if (fxaaOn) {
      p = ppl.addRenderPass(w, h, 'cc-fxaa');
      p.addRenderTarget(ldr1, LoadOp.CLEAR, StoreOp.STORE, BLACK);
      p.addTexture(ldr0, 'sceneColorMap');
      p.setVec4('texSize', v0.set(w, h, 1 / w, 1 / h));
      p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(this.fxaaMat!, 0);
      out = ldr1;
    }

    // ── 输出到屏幕 ──
    const scale = w / nw;
    const plain = cfg.debug > 0;
    p = ppl.addRenderPass(nw, nh, 'lc-post-final');
    p.addRenderTarget(cc.colorName, LoadOp.CLEAR, StoreOp.STORE, BLACK);
    p.addTexture(out, 'lcTexA', linear);
    p.setVec4('lcP0', v0.set(1 / w, 1 / h, scale > 1.01 ? 0.25 * scale : 0, plain ? 0 : cfg.sharpen));
    p.setVec4('lcP1', v1.set(plain ? 0 : cfg.vignette, cfg.vignetteStart, cfg.vignetteEnd, cfg.vignetteRound));
    p.setVec4('lcP2', v2.set(plain ? 0 : cfg.dither, 1 / nw, 1 / nh, 0));
    p.addQueue(QueueHint.OPAQUE).addFullscreenQuad(mat, 7);
    this.last = { size: [w, h], native: [nw, nh], hdr: !ldr, ao: aoOn, bloom: bloomOn ? n : 0, fxaa: fxaaOn, fog: fogOn, persp: !!persp, depth: depth || null };
    return p;
  }
}

// ───────────────────────── 挂到相机上 ─────────────────────────
export class FieldPost {
  readonly cfg: PostCfg;
  private builder: PostBuilder;
  private settings: any = null;
  private on = false;
  private floatWas: boolean | null = null;

  constructor(private cam: Camera, cfg: PostCfg = POST_CFG) {
    this.cfg = cfg;
    this.builder = new PostBuilder(cfg);
  }

  isOn(): boolean {
    return this.on;
  }

  /** 现在画面是不是在线性空间里画、混合的(开着后期,而且走的是高动态那条路)。 */
  linear(): boolean {
    return this.on && !!(director.root!.pipeline as any).getMacroBool('CC_USE_FLOAT_OUTPUT');
  }

  /** 现在的放大倍数(没开 = 1):2D 画进贴图的那几台相机按它放大贴图,免得地表被放大渲染糊一遍。 */
  scale(): number {
    return this.on ? this.cfg.scale : 1;
  }

  /** 按档位开(0 = 不开)。着色器要先读好(loadPost),没读到就不开。 */
  enable(level: number): boolean {
    if (this.on) {
      this.disable();
    }
    const lv = LEVELS[level];
    if (!lv || !effect) {
      return false;
    }
    const cfg = this.cfg;
    cfg.level = level;
    cfg.scale = lv.scale;
    cfg.fxaa = lv.fxaa;
    if (!this.builder.mat) {
      const m = new Material();
      m.initialize({ effectAsset: effect });
      this.builder.mat = m;
    }
    this.builder.fxaaMat = keptMaterial('g3d-fxaa');
    this.on = true;
    active += 1;
    this.attach();
    return true;
  }

  /** 把设置对象挂到相机上(改了放大倍数 / 高动态之后也走这里:管线要重新登记渲染目标)。 */
  private attach(): void {
    const cfg = this.cfg;
    const ppl: any = director.root!.pipeline;
    const device = director.root!.device;
    const B = gfx.FormatFeatureBit;
    // WebGL2 里半浮点贴图的线性过滤是标准自带的,引擎却按 WebGL1 的扩展名(OES_texture_half_float_linear)去查、查不到就不给这一位:
    // 正式包走的是 WebGL2,照旧要求这一位的话高动态永远开不起来(天空死黑、背光处发闷;预览走 WebGL1 看不出来)
    const webgl2 = device.gfxAPI === gfx.API.WEBGL2;
    const need = B.RENDER_TARGET | B.SAMPLED_TEXTURE | (webgl2 ? 0 : B.LINEAR_FILTER);
    const canHdr = (device.getFormatFeatures(Format.RGBA16F) & need) === need;
    const wantHdr = cfg.hdr && canHdr;
    if (this.floatWas === null) {
      this.floatWas = !!ppl.getMacroBool('CC_USE_FLOAT_OUTPUT');
    }
    if (!!ppl.getMacroBool('CC_USE_FLOAT_OUTPUT') !== wantHdr) {
      ppl.setMacroBool('CC_USE_FLOAT_OUTPUT', wantHdr);
      director.root!.onGlobalPipelineStateChanged();
    }
    this.settings = {
      msaa: { enabled: false, sampleCount: 4 },
      enableShadingScale: cfg.scale !== 1,
      shadingScale: cfg.scale,
      bloom: { enabled: false, type: 0, material: null, kawaseFilterMaterial: null, mipmapFilterMaterial: null, enableAlphaMask: false, iterations: 3, threshold: 0.8, intensity: 1 },
      toneMapping: { material: null },
      colorGrading: { enabled: false, material: null, contribute: 1, colorGradingMap: null },
      fsr: { enabled: false, material: null, sharpness: 0.8 },
      fxaa: { enabled: false, material: null },
      _passes: [this.builder],
    };
    (this.cam.camera as any).pipelineSettings = this.settings;
    (rendering as any).forceResizeAllWindows?.();
  }

  disable(): void {
    if (!this.on) {
      return;
    }
    this.on = false;
    this.builder.last = {};
    active = Math.max(0, active - 1);
    if (this.cam.isValid && this.cam.camera) {
      (this.cam.camera as any).pipelineSettings = null;
    }
    this.settings = null;
    const ppl: any = director.root!.pipeline;
    if (this.floatWas !== null && !!ppl.getMacroBool('CC_USE_FLOAT_OUTPUT') !== this.floatWas) {
      ppl.setMacroBool('CC_USE_FLOAT_OUTPUT', this.floatWas);
      director.root!.onGlobalPipelineStateChanged();
    }
    this.floatWas = null;
    (rendering as any).forceResizeAllWindows?.();
  }

  /** 改参数。放大倍数 / 高动态 / 泛光级数变了要重新挂一遍;别的下一帧直接生效。 */
  set(patch: Partial<PostCfg>): void {
    const cfg = this.cfg;
    const before = `${cfg.scale}|${cfg.hdr}|${cfg.bloomLevels}|${cfg.ao}`;
    Object.assign(cfg, patch);
    if (this.on && before !== `${cfg.scale}|${cfg.hdr}|${cfg.bloomLevels}|${cfg.ao}`) {
      this.attach();
    }
  }

  info(): Record<string, unknown> {
    return { on: this.on, ready: !!effect, failed: effectFailed, cfg: { ...this.cfg }, last: this.builder.last,
      float: !!(director.root!.pipeline as any).getMacroBool('CC_USE_FLOAT_OUTPUT') };
  }
}
