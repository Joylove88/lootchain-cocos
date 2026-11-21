import { Camera, director, Director, EffectAsset, geometry, renderer, rendering, resources, Vec3, Vec4 } from 'cc';

/**
 * 单遍多灯(2026-11-20,实时 3D 低端兼容第 1 期 ⑤)。
 *
 * 引擎的内置管线是「一盏灯加画一遍」:每盏点光 / 聚光都要把它照到的东西整个再画一次(主城 4 盏灯 = 每帧多画 135 次、几何翻倍)。
 * 这里改成主画面那一遍里直接把灯算完:
 *  1. 着色器:resources/effects/g3d-standard-ml.effect = 引擎 builtin-standard 原样 + 一段「照 forward-add 同一套公式循环 N 盏灯」。
 *     3D 小样启动时把内置 builtin-standard 这份着色器资源的内容换成它(之后建的材质、读进来的模型都自动用新的;灯数 0 时和原版一样)。
 *  2. 每帧:挑最多 8 盏(不投影的点光 / 聚光 / 球面光;优先视野里的、再按离镜头远近),参数按引擎填灯光参数的同一套算法
 *     (scene-culling.ts SetLightUBO:亮度 × 曝光 × 10000)写进每个材质的 LcLights 块;
 *  3. 给内置管线的「挑灯」补一刀:写进去的灯不再排逐灯加画。超过 8 盏的、投影的聚光照旧走引擎原来的路。
 * 关掉(enabled = false)= 灯数写 0、不再拦,完全回到原来的做法(对照用;地址 &ml=0 一开始就不开)。
 */

// 11-22:8 → 16。超过上限的灯以前退回引擎逐灯加画 —— 那条路要另一套着色器变体,第一次用到时现场编译 5 个(每个都含整份多灯代码),
// 独显卡 1.3 秒、核显卡 2~5 秒(主角走进灯多的地方 / 跃空重劈跳过去就触发)。现在上限放到 16,超出的远处灯直接不画(dropRest)。
const MAX = 16;
const TYPE_SPHERE = 1;
const TYPE_SPOT = 2;
const TYPE_POINT = 3;
const PROGRAM_KEY = 'g3d-standard-ml';

let mlEffect: EffectAsset | null = null;
let effectPatched = false;

/** 读着色器并把内置 builtin-standard 换成单遍多灯版(要在建 3D 材质之前调;builtin-standard 要已经读进来)。 */
export function installMultiLightEffect(done: (ok: boolean) => void): void {
  if (effectPatched) {
    done(true);
    return;
  }
  resources.load('effects/g3d-standard-ml', EffectAsset, (err, asset) => {
    if (err || !asset) {
      console.warn('[g3dml] 读不到 g3d-standard-ml', err?.message);
      done(false);
      return;
    }
    asset.addRef();
    mlEffect = asset;
    const base = EffectAsset.get('builtin-standard') as any;
    if (!base) {
      console.warn('[g3dml] builtin-standard 还没读进来,单遍多灯不开');
      done(false);
      return;
    }
    const mine = asset as any;
    base.techniques = mine.techniques;
    base.shaders = mine.shaders;
    base.combinations = mine.combinations;
    effectPatched = true;
    done(true);
  });
}

export function multiLightReady(): boolean {
  return effectPatched;
}

/** 内置管线挑灯的补丁:带标记的灯不再排逐灯加画。整个页面只装一次。 */
let cullPatched = false;
function patchCullLights(): boolean {
  if (cullPatched) {
    return true;
  }
  try {
    const builder: any = (rendering as any).getCustomPipeline?.('Builtin');
    const fl = builder?._forwardPass?.forwardLighting;
    if (!fl || typeof fl.cullLights !== 'function') {
      return false;
    }
    const orig = fl.cullLights;
    fl.cullLights = function patched(this: any, scene: unknown, frustum: unknown, pos?: unknown): void {
      orig.call(this, scene, frustum, pos);
      const L = this.lights as Array<{ __lcOne?: boolean }>;
      let w = 0;
      for (let i = 0; i < L.length; i += 1) {
        if (!L[i].__lcOne) {
          L[w] = L[i];
          w += 1;
        }
      }
      L.length = w;
    };
    cullPatched = true;
    return true;
  } catch (error) {
    console.warn('[g3dml] 挑灯补丁', error);
    return false;
  }
}

type AnyLight = renderer.scene.Light & { __lcOne?: boolean; position: Vec3; range: number; luminanceHDR: number; luminanceLDR: number; size?: number;
  spotAngle?: number; direction?: Vec3; angleAttenuationStrength?: number; shadowEnabled?: boolean; baked?: boolean };

const _sph = geometry.Sphere.create(0, 0, 0, 1);

export class MultiLight {
  enabled = true;
  /** 最多几盏走单遍(≤ 8;对照 / 排查用)。 */
  max = MAX;
  /** 超出上限的灯:true = 直接不画(不再退回逐灯加画,免得现场编译着色器卡顿);&mlrest=1 退回旧做法。 */
  dropRest = true;
  /** 最近一帧写进去几盏、还剩几盏走引擎(给 info 看)。 */
  stat = { single: 0, rest: 0, passes: 0 };
  private flagged: AnyLight[] = [];
  private pos: Vec4[] = [];
  private col: Vec4[] = [];
  private sra: Vec4[] = [];
  private dir: Vec4[] = [];
  private cnt = new Vec4();
  private lastCount = -1;
  private handles = new WeakMap<object, number[]>();
  private passSeen = new Set<object>();
  private cand: Array<{ l: AnyLight; vis: boolean; d: number }> = [];
  private on = false;

  constructor(private cam: Camera) {
    for (let i = 0; i < MAX; i += 1) {
      this.pos.push(new Vec4());
      this.col.push(new Vec4());
      this.sra.push(new Vec4());
      this.dir.push(new Vec4());
    }
  }

  start(): boolean {
    if (!effectPatched || !patchCullLights()) {
      return false;
    }
    if (!this.on) {
      this.on = true;
      director.on(Director.EVENT_BEFORE_DRAW, this.update, this);
    }
    return true;
  }

  stop(): void {
    if (this.on) {
      this.on = false;
      director.off(Director.EVENT_BEFORE_DRAW, this.update, this);
    }
    this.unflag();
    this.upload(0);
  }

  private unflag(): void {
    for (const l of this.flagged) {
      l.__lcOne = false;
    }
    this.flagged.length = 0;
  }

  private update(): void {
    const cam = this.cam?.isValid ? this.cam.camera : null;
    const rs = cam?.scene;
    this.unflag();
    // 画面不是高动态输出时(后期关了 / 设备不支持半浮点),引擎逐灯加画是各自转成显示用颜色再叠到 8 位画面上,单遍版对不上:退回原来的做法
    const ppl: any = director.root!.pipeline;
    if (!this.enabled || !cam || !rs || !ppl.getMacroBool('CC_USE_FLOAT_OUTPUT')) {
      this.stat.single = 0;
      this.upload(0);
      return;
    }
    // 候选:引擎会逐灯加画的那些(不烘焙;聚光不投影)
    const cand = this.cand;
    cand.length = 0;
    const cp = cam.node.worldPosition;
    const add = (l: AnyLight): void => {
      if (l.baked || !l.node || !l.node.activeInHierarchy) {
        return;
      }
      // 和内置管线挑灯同一个判断(intersect.sphereFrustum)
      geometry.Sphere.set(_sph, l.position.x, l.position.y, l.position.z, l.range);
      const vis = !!geometry.intersect.sphereFrustum(_sph, cam.frustum);
      cand.push({ l, vis, d: Vec3.squaredDistance(cp, l.position) });
    };
    for (const l of rs.spotLights as unknown as AnyLight[]) {
      if (!l.shadowEnabled) {
        add(l);
      }
    }
    for (const l of rs.sphereLights as unknown as AnyLight[]) {
      add(l);
    }
    for (const l of rs.pointLights as unknown as AnyLight[]) {
      add(l);
    }
    // 视野里看不到的灯本来就照不到画面上的东西:只挑看得到的,近的优先
    let vis = 0;
    for (const c of cand) {
      if (c.vis) {
        cand[vis] = c;
        vis += 1;
      }
    }
    cand.length = vis;
    cand.sort((a, b) => a.d - b.d);
    const n = Math.min(Math.max(0, Math.min(MAX, this.max)), cand.length);
    const ps = director.root!.pipeline.pipelineSceneData as any;
    const hdr = !!ps.isHDR;
    const exposure = cam.exposure;
    for (let i = 0; i < n; i += 1) {
      const l = cand[i].l;
      l.__lcOne = true;
      this.flagged.push(l);
      fillLight(l, hdr, exposure, this.pos[i], this.col[i], this.sra[i], this.dir[i]);
    }
    if (this.dropRest) {
      for (let i = n; i < cand.length; i += 1) {
        const l = cand[i].l;
        l.__lcOne = true;
        this.flagged.push(l);
      }
    }
    this.stat.single = n;
    this.stat.rest = cand.length - n;
    this.upload(n);
  }

  /** 把灯数和参数写进场景里每个用单遍多灯着色器的材质(同一个材质只写一次)。灯数 0 且上一帧也是 0 时跳过。 */
  private upload(n: number): void {
    if (n === 0 && this.lastCount === 0) {
      return;
    }
    this.lastCount = n;
    this.cnt.set(n, 0, 0, 0);
    const cam = this.cam?.isValid ? this.cam.camera : null;
    const rs = cam?.scene;
    if (!rs) {
      return;
    }
    const seen = this.passSeen;
    seen.clear();
    for (const m of rs.models) {
      if (!m.enabled) {
        continue;
      }
      for (const sm of m.subModels) {
        const p: any = sm.passes[0];
        if (!p || seen.has(p)) {
          continue;
        }
        seen.add(p);
        let h = this.handles.get(p);
        if (!h) {
          if (typeof p.program !== 'string' || p.program.indexOf(PROGRAM_KEY) < 0) {
            this.handles.set(p, []);
            continue;
          }
          h = [p.getHandle('lcLightPos'), p.getHandle('lcLightColor'), p.getHandle('lcLightSRA'), p.getHandle('lcLightDir'), p.getHandle('lcLightCount')];
          if (h.some((x) => !x)) {
            h = [];
          }
          this.handles.set(p, h);
        }
        if (!h.length) {
          continue;
        }
        p.setUniform(h[4], this.cnt);
        if (n > 0) {
          p.setUniformArray(h[0], this.pos);
          p.setUniformArray(h[1], this.col);
          p.setUniformArray(h[2], this.sra);
          p.setUniformArray(h[3], this.dir);
        }
      }
    }
    this.stat.passes = seen.size;
  }
}

/** 同引擎 SetLightUBO(scene-culling.ts / define.ts)。 */
function fillLight(l: AnyLight, hdr: boolean, exposure: number, pos: Vec4, col: Vec4, sra: Vec4, dir: Vec4): void {
  const t = l.type as number;
  pos.set(l.position.x, l.position.y, l.position.z, t);
  const c = l.color;
  let r = c.x;
  let g = c.y;
  let b = c.z;
  if (l.useColorTemperature) {
    const k = l.colorTemperatureRGB;
    r *= k.x;
    g *= k.y;
    b *= k.z;
  }
  col.set(r, g, b, hdr ? l.luminanceHDR * exposure * 10000 : l.luminanceLDR);
  if (t === TYPE_SPOT) {
    sra.set(l.size ?? 0, l.range, l.spotAngle ?? 0, 0);
    const d = l.direction!;
    dir.set(d.x, d.y, d.z, l.angleAttenuationStrength ?? 0);
  } else if (t === TYPE_SPHERE) {
    sra.set(l.size ?? 0, l.range, 0, 0);
    dir.set(0, 0, 0, 0);
  } else {
    // TYPE_POINT
    sra.set(0, l.range, 0, 0);
    dir.set(0, 0, 0, 0);
  }
}

void TYPE_POINT;
