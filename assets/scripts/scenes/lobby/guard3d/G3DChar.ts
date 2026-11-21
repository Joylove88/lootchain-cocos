import { AnimationClip, instantiate, JsonAsset, Mat4, MeshRenderer, Node, Prefab, resources, SkeletalAnimation, SkinnedMeshRenderer, Vec3, Vec4 } from 'cc';
import { analyzeBeast, BeastRig, Frame, frameOf, poseBeastDeath, poseBeastHit, poseBeastIdle, poseBeastWalk, poseBite, poseCast, poseHit, poseShoot, Rig } from './G3DPose';

/**
 * AI 图转 3D 出来的带骨骼角色(三视图设定图 → Tripo 多视图转 3D → 自动绑骨 → 预设动作,见 tools/proto3d/char3d):
 * 读模型、按包围盒缩放落地、播动作、叠程序动作。展示模式(G3DStage)和别的 3D 单位层(野外即时战斗)共用这一份。
 *
 * 模型不在仓库里:平时 assets/resources/g3d_char 是空的,验证时把 <键>/<键>.glb 临时拷进来(截完移出,留着会被打进资源包)。
 * 目录里没有某个键 = 这个角色没有模型,调用方自己决定怎么办(一般是保留 2D 骨骼)。
 *
 * 一个模型读一次(CharTemplate),之后每个实例都从它克隆(同一种怪一群好几只)。
 * 实例的结构:holder(站在脚底的位置上,负责位移 / 转向 / 缩放)→ model(预制体的克隆,挪到「包围盒底面中心 = holder 原点」)。
 */

/**
 * 角色专属打光(11-22,用户「角色需要做的更精致」):只写进角色材质的 lcRim / lcFill(着色器 g3d-standard-ml,见那里的 lcCharacterLight)。
 * rim = 轮廓光 [r, g, b](线性,已乘强度)+ 边缘收窄指数;fill = 跟镜头的柔光 [r, g, b] + 朝正面的偏向。
 * 场景在建角色前按自己的光照改这份(地宫冷月、野外月光、主城白天);单遍多灯没开(&ml=0)时着色器里没有这两项,自动不生效。
 */
export const CHAR_LIGHT = { rim: [0.3, 0.36, 0.55, 6.0] as [number, number, number, number], fill: [0.03, 0.03, 0.028, 0.8] as [number, number, number, number], on: true };
const _rim = new Vec4();
const _fill = new Vec4();

/** 动作片段的先后(展示模式轮播用;也是「哪个算待机 / 行走」的查找顺序)。 */
export const CHAR_ORDER = ['idle', 'walk', 'run', 'slash', 'shoot', 'hurt', 'fall'];

/**
 * 动作库转套过来的招式(tools/proto3d/char3d/mixamo_retarget.py 出的 moves.json):
 * 每个片段多长、位移轨迹(每帧 [往前, 往右],模型原始尺寸下的米)、剑尖最快的时刻;剑在右手里的方向和握点(右手自己的坐标)。
 */
export interface MoveData {
  fps: number;
  sword: { axis: number[]; grip: number[] };
  clips: Record<string, { dur: number; frames: number; loop: boolean; root: number[][]; peak: number; fast: number[] | null; yawEnd: number }>;
}

export interface CharTemplate {
  key: string;
  prefab: Prefab;
  /** 预制体上没带动画组件的时候,从同目录读出来的动作片段。 */
  clips: AnimationClip[] | null;
  /** 另外放的一批动作片段(assets/resources/g3d_moves/<键>/,动作库转套过来的招式)和它们的数据;没有就是空。 */
  extra: AnimationClip[] | null;
  moves: MoveData | null;
  /** 站姿下网格的包围盒(holder 自己的坐标,没缩放、没转向);第一次生成实例时量。 */
  lo: Vec3 | null;
  hi: Vec3 | null;
  tris: number;
  joints: number;
}

export interface CharOpts {
  /** 缩放到多高(包围盒的高度:人算到头顶,狼算到耳尖)。 */
  height: number;
  /** 绕 y 转多少度。模型本来面朝 +x。 */
  yaw: number;
  /** 脚底中心放在哪。 */
  at: Vec3;
  /** 用不用预烘焙的骨骼动画(省性能,但动作之间不能过渡,也叠不了程序动作)。 */
  baked?: boolean;
  /** 颜色贴图整体压多少(AI 出的颜色贴图里白的接近纯白,灯下会曝)。 */
  albedo?: number;
  /** 这只怪的行走一律走程序化(平台给的行走预设是坏的)。 */
  procWalk?: boolean;
  /** 去掉动作片段自带的位移(跑步 / 行走时原地踏步,位移由游戏逻辑管)。展示模式不开,和原来一样。 */
  inPlace?: boolean;
}

const templates = new Map<string, CharTemplate>();
const waiting = new Map<string, Array<(tpl: CharTemplate | null) => void>>();
let paths: Map<string, string> | null = null;

const _v = new Vec3();
const _m = new Mat4();

/** assets/resources/g3d_char 下现在有哪些角色(文件夹名 → 预制体路径)。目录是临时拷进来的,所以每次都重新问一遍资源表。 */
function scanPaths(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const infos = ((resources as any).getDirWithPath('g3d_char', Prefab) as Array<{ path: string }>) ?? [];
    for (const info of infos) {
      const key = info.path.split('/')[1] ?? '';
      if (key && !map.has(key)) {
        map.set(key, info.path);
      }
    }
  } catch (error) {
    void error;
  }
  return map;
}

export function charKeys(): string[] {
  paths = scanPaths();
  return Array.from(paths.keys());
}

export function hasChar(key: string): boolean {
  if (!paths || !paths.size) {
    paths = scanPaths();
  }
  return paths.has(key);
}

/** 这个角色有没有另外放的那批招式(assets/resources/g3d_moves/<键>/ 下有动作片段)。 */
export function hasMoves(key: string): boolean {
  try {
    return (((resources as any).getDirWithPath(`g3d_moves/${key}`, AnimationClip) as unknown[]) ?? []).length > 0;
  } catch (error) {
    void error;
    return false;
  }
}

/** 读一个角色的模型(读过的直接给)。没有这个角色 / 读失败回 null。 */
export function loadChar(key: string, done: (tpl: CharTemplate | null) => void): void {
  const hit = templates.get(key);
  if (hit) {
    done(hit);
    return;
  }
  if (!hasChar(key)) {
    done(null);
    return;
  }
  const queue = waiting.get(key);
  if (queue) {
    queue.push(done);
    return;
  }
  waiting.set(key, [done]);
  const finish = (tpl: CharTemplate | null): void => {
    const list = waiting.get(key) ?? [];
    waiting.delete(key);
    if (tpl) {
      templates.set(key, tpl);
    }
    list.forEach((cb) => cb(tpl));
  };
  const path = paths!.get(key)!;
  resources.load(path, Prefab, (err, prefab) => {
    if (err || !prefab) {
      console.warn('[g3d] load char', key, err?.message);
      finish(null);
      return;
    }
    prefab.addRef();
    const tpl: CharTemplate = { key, prefab, clips: null, extra: null, moves: null, lo: null, hi: null, tris: 0, joints: 0 };
    const probe = prefab.data as Node;
    const own = probe.getComponent(SkeletalAnimation) ?? probe.getComponentInChildren(SkeletalAnimation);
    if (own && own.clips.some((clip) => !!clip)) {
      loadMoves(tpl, () => finish(tpl));
      return;
    }
    // 预制体上没带动画组件:把同目录导入出来的动作片段读出来,生成实例的时候挂上去
    resources.loadDir(path.slice(0, path.lastIndexOf('/')), AnimationClip, (e2, clips) => {
      if (!e2 && clips && clips.length) {
        clips.forEach((clip) => clip.addRef());
        tpl.clips = clips;
      }
      loadMoves(tpl, () => finish(tpl));
    });
  });
}

/** 这个角色另外放的那批招式(g3d_moves/<键>/ 下的动作片段 + moves_data.json)。目录也是临时拷进来的,没有就直接过。 */
function loadMoves(tpl: CharTemplate, done: () => void): void {
  const dir = `g3d_moves/${tpl.key}`;
  if (!hasMoves(tpl.key)) {
    done();
    return;
  }
  resources.loadDir(dir, AnimationClip, (err, clips) => {
    if (!err && clips && clips.length) {
      clips.forEach((clip) => clip.addRef());
      tpl.extra = clips;
    }
    resources.load(`${dir}/moves_data`, JsonAsset, (e2, asset) => {
      if (!e2 && asset && asset.json) {
        tpl.moves = asset.json as unknown as MoveData;
      }
      done();
    });
  });
}

export class G3DChar {
  /** holder:位移 / 转向 / 缩放都动它。 */
  readonly node: Node;
  /** 预制体的克隆(骨架和网格都在它下面)。 */
  readonly model: Node;
  readonly name: string;
  at: Vec3;
  height: number;
  yaw: number;
  /** 水平方向上占多宽(缩放后),给镜头算距离用。 */
  span: number;
  /** 模型原始高度 → 现在高度的倍数。 */
  scale: number;
  /** 程序动作(G3DPose):骨架、朝向、是人形还是怪物;rest = 不播动画、站在绑定姿势上(怪物没有待机动作时的待机)。 */
  rig: Rig;
  frame: Frame;
  kind: 'biped' | 'beast';
  rest = false;
  /** 受击反应的强度(1 → 0 衰减);act / actT = 正在做的一次性程序动作(bite 扑咬)和它走到第几秒。 */
  hit = 0;
  act = '';
  actT = 0;
  /** 人形的程序动作:cast / strike = 施法的蓄力和出手(0~1);draw / loose = 拉弓和放箭(0~1)。 */
  cast = 0;
  strike = 0;
  draw = 0;
  loose = 0;
  /** 走着停下来的程度(0 = 照动画 / 照程序化行走走,1 = 站定):走的姿势按它往站姿上收。 */
  stand = 0;
  /** 人形往前倾多少(0~1;冲刺 / 翻滚时整个人压低往前扑)。 */
  lean = 0;
  /** 去掉动作片段自带的位移(见 CharOpts.inPlace)。 */
  inPlace = false;
  /** 怪物倒地(0 → 1);downSide = 往哪一侧倒。 */
  down = 0;
  downSide = 1;
  /** 怪物骨架的结构(按形状认出来的脊柱 / 头 / 腿);pwalk = 正在用程序化行走,walkPhase 是步伐相位。 */
  beast: BeastRig | null;
  pwalk = false;
  walkPhase = 0;
  procWalk: boolean;
  /** 程序化行走每秒几步、呼吸摆动的种子。 */
  walkRate = 1.35;
  seed = 0;
  anim: SkeletalAnimation | null = null;
  /** 动作库转套过来的招式的数据(没有这批招式就是空)。 */
  moves: MoveData | null = null;
  names: string[] = [];
  cur = '';
  tris: number;
  joints: number;
  private mats: Array<{ mr: MeshRenderer; index: number }> = [];
  private albedo: number;
  private tint = new Vec3(1, 1, 1);
  private tinted = false;

  /**
   * 生成一个实例放进 parent。模型量过包围盒之后,之后的实例直接用量好的数。
   */
  static spawn(tpl: CharTemplate, parent: Node, opts: CharOpts): G3DChar {
    const holder = new Node(`G3DChar_${tpl.key}`);
    const model = instantiate(tpl.prefab);
    // 用不用预烘焙必须在节点进场景之前设:引擎里动画状态一旦按「预烘焙」初始化过,之后再切成实时骨骼也不会去驱动骨头
    // (skeletal-animation-state.ts 的 _doNotCreateEval 只在第一次初始化时定)—— 表现是时间在走、人站着不动。
    let anim = model.getComponent(SkeletalAnimation) ?? model.getComponentInChildren(SkeletalAnimation);
    if (anim) {
      anim.useBakedAnimation = !!opts.baked;
    }
    if ((!anim || !anim.clips.some((clip) => !!clip)) && tpl.clips) {
      anim = anim ?? model.addComponent(SkeletalAnimation);
      anim.useBakedAnimation = !!opts.baked;   // 同样要赶在挂动作片段(建状态)之前
      anim.clips = tpl.clips;
    }
    if (anim && tpl.extra) {
      for (const clip of tpl.extra) {
        if (!anim.getState(clip.name)) {
          anim.addClip(clip, clip.name);
        }
      }
    }
    holder.addChild(model);
    parent.addChild(holder);
    return new G3DChar(tpl, holder, model, anim, opts);
  }

  private constructor(tpl: CharTemplate, holder: Node, model: Node, anim: SkeletalAnimation | null, opts: CharOpts) {
    this.node = holder;
    this.model = model;
    this.name = tpl.key;
    this.albedo = opts.albedo ?? 1;
    const renderers = model.getComponentsInChildren(MeshRenderer);
    for (const mr of renderers) {
      mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
      mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
      for (let i = 0; i < mr.sharedMaterials.length; i += 1) {
        this.mats.push({ mr, index: i });
      }
    }
    this.applyCharLight();
    if (!tpl.lo || !tpl.hi) {
      // 量包围盒(站姿下的网格最小 / 最大点,换到 holder 自己的坐标里)
      holder.updateWorldTransform();
      Mat4.invert(_m, holder.worldMatrix);
      const lo = new Vec3(1e9, 1e9, 1e9);
      const hi = new Vec3(-1e9, -1e9, -1e9);
      let tris = 0;
      let joints = 0;
      for (const mr of renderers) {
        const st = mr.mesh?.struct;
        if (!st) {
          continue;
        }
        for (const p of st.primitives) {
          tris += p.indexView ? p.indexView.count / 3 : 0;
        }
        const skinned = mr as SkinnedMeshRenderer;
        joints = Math.max(joints, skinned.skeleton?.joints.length ?? 0);
        if (!st.minPosition || !st.maxPosition) {
          continue;
        }
        // 蒙皮网格的顶点是相对骨架根算的(挂网格的那个节点自己的位移不算数),静态网格才按自己的节点算
        const base = skinned.skinningRoot ?? mr.node;
        base.updateWorldTransform();
        for (let i = 0; i < 8; i += 1) {
          _v.set(i & 1 ? st.maxPosition.x : st.minPosition.x, i & 2 ? st.maxPosition.y : st.minPosition.y, i & 4 ? st.maxPosition.z : st.minPosition.z);
          Vec3.transformMat4(_v, _v, base.worldMatrix);
          Vec3.transformMat4(_v, _v, _m);
          Vec3.min(lo, lo, _v);
          Vec3.max(hi, hi, _v);
        }
      }
      tpl.lo = lo;
      tpl.hi = hi;
      tpl.tris = tris;
      tpl.joints = joints;
    }
    const lo = tpl.lo;
    const hi = tpl.hi;
    this.tris = tpl.tris;
    this.joints = tpl.joints;
    this.scale = opts.height / Math.max(0.01, hi.y - lo.y);
    this.height = opts.height;
    this.yaw = opts.yaw;
    this.at = opts.at.clone();
    this.span = Math.max(hi.x - lo.x, hi.z - lo.z) * this.scale;
    this.procWalk = !!opts.procWalk;
    this.inPlace = !!opts.inPlace;
    model.setPosition(-(lo.x + hi.x) / 2, -lo.y, -(lo.z + hi.z) / 2);
    holder.setScale(this.scale, this.scale, this.scale);
    holder.setRotationFromEuler(0, this.yaw, 0);
    holder.setPosition(this.at);
    holder.updateWorldTransform();
    this.rig = new Rig(model);          // 这时候还没播过动画,骨头都在绑定姿势上
    this.frame = frameOf(this.yaw);
    this.kind = this.rig.j('Hips') && this.rig.j('Spine1') ? 'biped' : 'beast';
    this.beast = this.kind === 'beast' ? analyzeBeast(this.rig, this.frame) : null;
    this.applyAlbedo();
    this.moves = tpl.extra && tpl.extra.length ? tpl.moves : null;
    if (anim) {
      const rank = (name: string): number => {
        const i = CHAR_ORDER.findIndex((k) => name.toLowerCase().indexOf(k) >= 0);
        return i < 0 ? CHAR_ORDER.length : i;
      };
      this.anim = anim;
      this.names = anim.clips.filter((clip) => !!clip).map((clip) => clip!.name).sort((a, b) => rank(a) - rank(b));
    }
  }

  /** 名字里含这个词的动作片段。 */
  clip(word: string): string {
    const w = word.toLowerCase();
    return this.names.find((k) => k.toLowerCase().indexOf(w) >= 0) ?? '';
  }

  /** 播一个动作片段(名字要是完整的片段名)。loop 不给就按名字猜:待机 / 走 / 跑是循环的。 */
  play(name: string, fade = 0.25, loop?: boolean): boolean {
    const anim = this.anim;
    const st = anim?.getState(name);
    if (!anim || !st) {
      return false;
    }
    const looping = loop ?? /idle|walk|run/.test(name.toLowerCase());
    st.wrapMode = looping ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
    st.speed = 1;
    anim.crossFade(name, this.rest ? 0 : fade);
    this.rest = false;
    this.pwalk = false;
    this.cur = name;
    return true;
  }

  /**
   * 把一个片段定在某个时刻(秒):片段自己不走时间,每帧由调用方给时刻。
   * 一次出手的进度由战斗逻辑的计时说了算(含顿帧、加速)的时候用它,动作和逻辑永远对得上。
   * 第一次调(或换了片段)会先过渡到这个片段。
   */
  scrub(name: string, time: number, fade = 0.06): boolean {
    if (this.cur !== name || this.rest) {
      if (!this.play(name, fade, false)) {
        return false;
      }
    }
    const st = this.anim?.getState(name);
    if (!st) {
      return false;
    }
    st.speed = 0;
    st.setTime(Math.max(0, Math.min(st.duration - 0.001, time)));
    return true;
  }

  /** 不播动画,站在绑定姿势上(怪物没有待机动作时的待机);walk = 在站姿上叠程序化行走。 */
  toRest(walk = false): void {
    this.anim?.stop();
    this.rest = true;
    this.pwalk = walk;
    this.cur = '';
  }

  /** 当前动作片段的播放速度(冰冻 = 0、眩晕放慢)。 */
  setSpeed(k: number): void {
    const st = this.cur ? this.anim?.getState(this.cur) : null;
    if (st) {
      st.speed = k;
    }
  }

  /** 挪位置 / 转向(转向之后程序动作用的朝向跟着换)。 */
  place(x: number, y: number, z: number, yaw: number): void {
    this.at.set(x, y, z);
    this.node.setPosition(x, y, z);
    if (yaw !== this.yaw) {
      this.yaw = yaw;
      this.node.setRotationFromEuler(0, yaw, 0);
      this.frame = frameOf(yaw);
    }
  }

  /** 改高度(同一个模型拿去当不同体型的怪用;程序动作里按身高算的幅度跟着缩)。 */
  setHeight(height: number): void {
    if (Math.abs(height - this.height) < 1e-4) {
      return;
    }
    const k = height / this.height;
    this.height = height;
    this.scale *= k;
    this.span *= k;
    this.node.setScale(this.scale, this.scale, this.scale);
    if (this.beast) {
      this.beast.height *= k;
    }
  }

  /** 把 CHAR_LIGHT 写进这个角色的材质(建角色时调一次;现场调参后再调一次生效)。 */
  applyCharLight(): void {
    const k = CHAR_LIGHT.on ? 1 : 0;
    _rim.set(CHAR_LIGHT.rim[0] * k, CHAR_LIGHT.rim[1] * k, CHAR_LIGHT.rim[2] * k, k ? CHAR_LIGHT.rim[3] : 0);
    _fill.set(CHAR_LIGHT.fill[0] * k, CHAR_LIGHT.fill[1] * k, CHAR_LIGHT.fill[2] * k, CHAR_LIGHT.fill[3]);
    for (const m of this.mats) {
      const mi = m.mr.getMaterialInstance(m.index);          // 每个角色自己一份(蒙皮网格本来就不合批)
      if (!mi) {
        continue;
      }
      this.tinted = true;
      for (const pass of mi.passes) {
        const hr = pass.getHandle('lcRim');
        if (hr) {
          pass.setUniform(hr, _rim);
          pass.setUniform(pass.getHandle('lcFill'), _fill);
        }
      }
    }
  }

  /** 整体染色(受击闪一下 / 冰冻发蓝):乘在颜色贴图上,不发光。 */
  setTint(r: number, g: number, b: number): void {
    if (Math.abs(this.tint.x - r) + Math.abs(this.tint.y - g) + Math.abs(this.tint.z - b) < 0.004) {
      return;
    }
    this.tint.set(r, g, b);
    this.applyAlbedo();
  }

  private applyAlbedo(): void {
    const a = this.albedo;
    if (a === 1 && this.tint.x === 1 && this.tint.y === 1 && this.tint.z === 1 && !this.tinted) {
      return;      // 没压暗也没染过色:不建材质实例,共用模型自带的那份
    }
    this.tinted = true;
    _v.set(a * this.tint.x, a * this.tint.y, a * this.tint.z);
    for (const m of this.mats) {
      m.mr.getMaterialInstance(m.index)?.setProperty('albedoScale', _v);
    }
  }

  /** 每帧:衰减受击、推进程序化行走和一次性动作的时间。dt 是这个角色自己的时间(冰冻时传 0)。 */
  step(dt: number): void {
    this.hit = Math.max(0, this.hit - dt * 3.0);
    if (this.pwalk) {
      this.walkPhase += dt * Math.PI * 2 * this.walkRate;
    }
    if (this.act) {
      this.actT += dt;
      if (this.actT > 0.85) {
        this.act = '';
      }
    }
  }

  /**
   * 程序动作:在动画系统摆完姿势之后再叠一层(见 G3DPose)。每帧都要重新叠 —— 动画系统下一帧会把骨头写回去。
   * 要在 Director.EVENT_AFTER_UPDATE 里调。
   */
  pose(time: number): void {
    const rig = this.rig;
    if (!this.node.active) {
      return;
    }
    if (this.rest) {
      rig.toRest();
    } else {
      if (this.inPlace) {
        rig.pin(this.kind === 'biped' ? rig.j('Hips') : this.beast?.root ?? null);      // 片段自带的「往前走」不要
      }
      if (this.stand > 0.001) {
        rig.blendRest(this.stand);      // 走着停下来:从迈步的姿势收回站姿
      }
    }
    if (this.kind === 'biped') {
      if (this.lean > 0.001) {
        rig.twist(rig.j('Hips'), this.frame.right, -26 * this.lean);      // 绕右手轴转负角 = 前倾
      }
      if (this.cast > 0.001 || this.strike > 0.001) {
        poseCast(rig, this.frame, this.cast, this.strike);
      }
      if (this.draw > 0.001 || this.loose > 0.001) {
        poseShoot(rig, this.frame, this.draw, this.loose);
      }
      if (this.hit > 0.001) {
        poseHit(rig, this.frame, this.hit);
      }
      return;
    }
    const b = this.beast;
    if (!b) {
      return;
    }
    const standing = this.rest && !this.pwalk ? 1 : this.stand;
    if (this.rest && this.pwalk && standing < 0.99) {
      poseBeastWalk(rig, this.frame, b, this.walkPhase, 1 - standing);
    }
    if (standing > 0.01) {
      poseBeastIdle(rig, this.frame, b, time, this.seed, standing);
    }
    if (this.act === 'bite') {
      poseBite(rig, this.frame, b, this.actT);
    }
    if (this.hit > 0.001) {
      poseBeastHit(rig, this.frame, b, this.hit);
    }
    if (this.down > 0.001) {
      poseBeastDeath(rig, this.frame, b, this.down, this.node.worldPosition.y, this.downSide);
    }
  }

  /** 回到刚生成时的样子(放回池子里再拿出来用之前调)。 */
  reset(): void {
    this.anim?.stop();
    this.rig.toRest();
    this.rest = false;
    this.pwalk = false;
    this.walkPhase = 0;
    this.hit = 0;
    this.act = '';
    this.actT = 0;
    this.cast = 0;
    this.strike = 0;
    this.draw = 0;
    this.loose = 0;
    this.down = 0;
    this.stand = 0;
    this.lean = 0;
    this.cur = '';
    this.setTint(1, 1, 1);
  }

  destroy(): void {
    if (this.node.isValid) {
      this.node.destroy();
    }
  }
}
