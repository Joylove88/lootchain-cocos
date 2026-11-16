import { Color, Director, director, Node, Sprite, sys, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { LobbyTownRenderer } from '../LobbyTownRenderer';
import { G3DChar, hasChar, loadChar } from './G3DChar';
import type { CharTemplate } from './G3DChar';
import { loadKit } from './G3DKit';
import { G3DStudio, STUDIO_LAYER } from './G3DStudio';
import { FIELD_LAYER, TownWorld3D } from './TownWorld3D';
import type { WorldCfg } from './TownWorld3D';

/**
 * 野外即时战斗的 3D 单位层(实验,2026-11-16;默认关)。
 *
 * 由来:用户 11-16 定「守卫战用 2D 挺好,3D 做野外即时战斗」。野外 = 主角带队在地图上跑、遇怪即时开打
 * (LobbyTownRenderer;主城也是它画的,所以主城里队伍也跟着变 3D)。
 *
 * 开:预览地址带 ?field3d=1(或 2),或 localStorage.lcField3d = '1' / '2',或控制台 __f3d.toggle(1 / 2)。关着的时候只多几次函数调用。
 * 开着的时候:有模型的队长 / 队友 / 怪换成带骨骼的 3D 角色,没有模型的照旧是 2D 骨骼。
 *
 * 两种开法(同一套「照着 2D 逻辑的状态演 3D 角色」,只是怎么显示不一样):
 * - 1 = 第一版:3D 角色渲染成贴图贴回 2D 地图(下面说的摄影棚那一套),地图和特效还是 2D;
 * - 2 = 真 3D 场景(TownWorld3D.ts,用户 11-16「地形,技能也可以用酷炫的 3D 素材」之后做的):地面、摆件、角色、技能都在同一个
 *   3D 世界里。角色直接站在 3D 世界里;摆件见 TownProps3D.ts,没有模型的 2D 单位怎么进 3D 见 TownEnts3D.ts,技能特效见 TownFx3D.ts
 *   (这三个都是登记进本文件 extras 的「跟班」:每帧跟在单位同步后面跑,整层撤掉时一起撤)。
 *
 * 只动表现层,战斗逻辑一行不碰:
 * - 3D 角色不直接画到屏幕上,而是实时渲染进一张贴图(G3DStudio,一人一格),再把那一格贴回这个单位原来的 2D 节点里、
 *   顶替 2D 骨骼的位置。所以脚线前后排序(树挡人 / 人挡树)、视野裁剪、树冠透视孔、死后整节点淡出、血条名字全都照旧。
 * - 2D 骨骼不销毁,只是藏起来:野外的出手节奏是按 2D 骨骼动作的时长算的(伤害落在动作的 38% 处、70% 能取消),
 *   所以它继续当「逻辑的节拍器」,3D 这边只照着它的状态演 —— 待机 / 跑、一次性出手(挥砍片段按逻辑进度定格播放,
 *   顿帧时自然停住)、受击、倒地;怪是走 / 停、蓄力后扑咬、受击、被打死倒下。
 * - 朝向不再只有左右:按移动方向 / 目标方向转身(模型是真 3D,镜头是斜俯视)。
 * - 不改渲染器文件:本模块加载时包一层 LobbyTownRenderer.prototype 上的 step(每帧跟在它后面同步一遍)、
 *   playActorAction / playActorClip(记下这一下是普攻还是技能)、spawnAfterimage(冲刺残影换成 3D 的)。
 *   这些名字被别的会话改掉不会报错,只是 3D 悄悄不出现。
 *
 * 模型不在仓库里(见 G3DChar.ts):assets/resources/g3d_char 下没有的角色一律保留 2D。
 * 调试:window.__f3d(toggle / info / dump / set)。自验:tools/proto3d/field/field_shots.py。
 */

interface ModelSpec {
  /** g3d_char 下的文件夹名。 */
  key: string;
  /** 身高(米;怪算到背顶 / 耳尖)。 */
  height: number;
  /** 这个角色连同动作要占多大一块(米见方,脚底在这块的中下部):越大留白越多、清晰度越低。 */
  extent: number;
  /** 人形普攻怎么演:挥砍片段 / 拉弓(程序动作)/ 施法(程序动作)。 */
  attack?: 'slash' | 'shoot' | 'cast';
  /** 行走一律走程序化(平台给的行走预设是坏的)。 */
  procWalk?: boolean;
}

/** 英雄编码 → 模型(2026-11-12 AI 图转 3D 做出来的那几个)。大乔、荀攸、妮克丝没有挥砍动作,用施法的程序动作。 */
const HERO_MODELS: Record<string, ModelSpec> = {
  R_HUAXIONG: { key: 'huaxiong', height: 1.88, extent: 2.9, attack: 'slash' },
  R_DAQIAO: { key: 'daqiao', height: 1.64, extent: 2.7, attack: 'cast' },
  R_GANNING: { key: 'ganning', height: 1.8, extent: 2.8, attack: 'slash' },
  R_XUNYOU: { key: 'xunyou', height: 1.78, extent: 2.8, attack: 'cast' },
  R_TAISHICI: { key: 'taishici', height: 1.86, extent: 2.9, attack: 'shoot' },
  R_DIANWEI: { key: 'dianwei', height: 2.04, extent: 3.1, attack: 'slash' },
  SSR_SUNWUKONG: { key: 'wukong', height: 1.74, extent: 2.8, attack: 'slash' },
  UR_NYX: { key: 'nyx', height: 1.8, extent: 2.8, attack: 'cast' },
};

function heroSpec(hero: { heroCode?: string; protagonist?: boolean } | null | undefined): ModelSpec | null {
  const code = (hero?.heroCode ?? '').toUpperCase();
  if (HERO_MODELS[code]) {
    return HERO_MODELS[code];
  }
  if (hero?.protagonist || code.indexOf('PROTAGONIST') === 0) {
    return code.indexOf('FEMALE') >= 0 ? { key: 'hero_f', height: 1.68, extent: 2.7, attack: 'slash' } : { key: 'hero_m', height: 1.78, extent: 2.8, attack: 'slash' };
  }
  return null;
}

/**
 * 怪物骨骼路径(camp.spine)→ 模型。村外林地的几种都有:幼鼠、蛛、野犬(用荒原狼)、棕鬃熊(精英)、腐木巨熊(首领)。
 * 身高是我定的:比 2D 里的体型小一圈但不照真实尺寸(2D 里的「幼鼠」和人一样高;真按幼鼠的大小在这个镜头下只有二三十像素,看不清也点不中)。
 */
function monsterSpec(camp: { spine?: string; elite?: boolean; stageCode?: string } | null | undefined): ModelSpec | null {
  const path = camp?.spine ?? '';
  if (path.indexOf('/medium_bear/boss_corrupt/') >= 0) {
    return { key: 'rotbear', height: 2.3, extent: 5.4 };
  }
  if (path.indexOf('/medium_bear/') >= 0) {
    return { key: 'bear', height: camp?.elite ? 1.75 : 1.5, extent: camp?.elite ? 4.6 : 4.0, procWalk: true };
  }
  if (path.indexOf('/mini_rat/') >= 0) {
    return { key: 'rat', height: 0.62, extent: 2.5 };
  }
  if (path.indexOf('/small_spider/') >= 0) {
    return { key: 'spider2', height: camp?.elite ? 1.2 : 0.72, extent: camp?.elite ? 3.2 : 2.2 };
  }
  if (path.indexOf('/medium_dog/') >= 0) {
    return { key: 'wolf', height: 1.12, extent: 3.1 };
  }
  return null;
}

interface FieldCfg {
  /** 2D 地图上多少个单位算 1 米(决定 3D 角色在画面上多大;148 时 1.8 米的人约 190 高,和 2D 英雄差不多)。 */
  unitsPerM: number;
  /** 摄影棚贴图:每格多少像素、几列几行(一格一个角色,格子用完的单位保留 2D)。 */
  cell: number;
  cols: number;
  rows: number;
  /** 镜头俯角(度)。 */
  pitch: number;
  key: number;
  ambient: number;
  /** 主光阴影贴图边长(角色在自己身上的落影;0 = 关)。 */
  shadow: number;
  /** 颜色贴图整体压多少。 */
  albedo: number;
}
const CFG: FieldCfg = { unitsPerM: 148, cell: 384, cols: 5, rows: 5, pitch: 45, key: 68000, ambient: 36000, shadow: 2048, albedo: 0.96 };

/** 挥砍片段(6.6 秒)里真正挥那一下:普攻从手已经举起来的地方起播(起手快),技能从抬手起播(蓄势足)。量法见 tools/proto3d/char3d/clip_motion.py。 */
const SLASH_FAST: [number, number] = [1.84, 2.5];
const SLASH_FULL: [number, number] = [1.46, 2.5];
/** 站着不动时身体朝镜头转一点(度):面朝右 / 面朝左。纯侧面看不到脸。 */
const IDLE_YAW_RIGHT = -30;
const IDLE_YAW_LEFT = 210;

interface Unit {
  hero: boolean;
  /** 野外渲染器里的那个角色 / 怪物对象。 */
  owner: any;
  spec: ModelSpec;
  tpl: CharTemplate | null;
  loading: boolean;
  char: G3DChar | null;
  cell: number;
  sprite: Sprite | null;
  /** 被藏起来的 2D 骨骼节点、被调过的 2D 节点原来的值(撤的时候还原)。 */
  spine: Node | null;
  restore: Array<() => void>;
  yaw: number;
  lastX: number;
  lastY: number;
  vx: number;
  vy: number;
  phase: number;
  /** 正在循环播的是什么('idle' / 'run' / 'walk' / 'down')。 */
  loop: string;
  /** 一次性出手:怎么演('' = 没有)、整段多少毫秒、挥砍片段的区间。 */
  act: '' | 'slash' | 'shoot' | 'cast';
  actMs: number;
  actClip: [number, number];
  /** 上次看到的血量(掉了就做受击反应)、受击闪到期时刻、蓄力到期时刻。 */
  hp: number;
  flash: number;
  windup: number;
  /** 怪:死了多久(秒,-1 = 活着)。 */
  dead: number;
  /** 贴图当前按多少不透明度预乘的(0~255)。 */
  alpha: number;
  /** 3D 模型在画面上大概多高(2D 地图单位),血条 / 名字按它摆。 */
  top: number;
  /** 被视野裁掉多久了(秒);久了就把格子让出来。 */
  hidden: number;
  /** 真 3D 场景:死后往地里沉了多少(0~1)。 */
  sink: number;
}

const _foot = new Vec3();

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const ramp = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);
const wrap180 = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;
function turn(cur: number, to: number, maxStep: number): number {
  const d = wrap180(to - cur);
  return Math.abs(d) <= maxStep ? wrap180(to) : wrap180(cur + Math.sign(d) * maxStep);
}
/** 2D 地图上的一个方向(x 右、y 上 = 远离镜头)→ 模型要转多少度(模型本来面朝 +x)。 */
const yawOf = (dx: number, dy: number): number => (Math.atan2(dy, dx) * 180) / Math.PI;

/**
 * 开关:0 = 关;1 = 3D 角色贴回 2D 地图(第一版);2 = 真 3D 场景(TownWorld3D:地面 / 摆件 / 角色 / 技能在同一个 3D 世界里)。
 * 地址参数 / 本地存储里的开关只在第一次问的时候读一遍(这个函数每帧都会被问到);控制台 __f3d.toggle 现场切的优先。
 */
let flagFromPage: number | null = null;
function flagMode(): number {
  const g = globalThis as any;
  if (g.__LC_FIELD3D !== undefined) {
    return g.__LC_FIELD3D === true ? 1 : Number(g.__LC_FIELD3D) || 0;
  }
  if (flagFromPage === null) {
    try {
      const m = /[?&]field3d=(\d)\b/.exec(location.search);
      flagFromPage = m ? Number(m[1]) : Number(localStorage.getItem('lcField3d')) || 0;
    } catch (error) {
      flagFromPage = 0;
    }
    if (flagFromPage !== 1 && flagFromPage !== 2) {
      flagFromPage = 0;
    }
  }
  return flagFromPage;
}

/** 真 3D 场景里跟着单位层一起跑的东西(摆件、技能特效):每帧在单位同步之后调一遍,整层撤掉时调 stop。 */
export interface FieldExtra {
  sync(self: any, world: TownWorld3D, dt: number, frozen: boolean): void;
  late?(world: TownWorld3D): void;
  stop(): void;
  info?(): unknown;
}

class TownUnits3D {
  private on = false;
  /** 现在开的是哪一种(见 flagMode)。 */
  private mode = 0;
  /** 真 3D 场景(mode 2 才有)。 */
  world: TownWorld3D | null = null;
  readonly extras: FieldExtra[] = [];
  private ready = false;          // 3D 标准材质的着色器到位了没有
  private kitAsked = false;
  private studio: G3DStudio | null = null;
  private owner: any = null;
  private units = new Map<any, Unit>();
  private skip = new WeakSet<object>();
  private pool = new Map<string, G3DChar[]>();
  /** 渲染器刚才让谁出了哪种手(playActorAction / playActorClip 之前记下,同一帧里取走)。 */
  private fired = new Map<any, string>();
  private time = 0;
  private lastSyncFrame = -10;
  private lastError = '';
  private stats = { spawned: 0, reused: 0, released: 0, actions: 0, bites: 0, hits: 0, deaths: 0, noCell: 0 };
  private noModel = new Map<string, number>();

  /** 这个角色现在是不是 3D 的(给残影等钩子用)。 */
  unitOf(owner: any): Unit | null {
    const u = this.units.get(owner);
    return u && u.char ? u : null;
  }

  note(actor: any, kind: string): void {
    if (this.on) {
      this.fired.set(actor, kind);
    }
  }

  // ───────────────────────── 开 / 关 ─────────────────────────
  private start(self: any, mode: number): void {
    this.on = true;
    this.mode = mode;
    this.owner = self;
    if (mode !== 2 && !this.studio) {
      this.studio = new G3DStudio({ cell: CFG.cell, cols: CFG.cols, rows: CFG.rows, pitch: CFG.pitch, key: CFG.key, ambient: CFG.ambient, shadow: CFG.shadow, footV: 0.36 });
    }
    director.on(Director.EVENT_AFTER_UPDATE, this.late, this);
    if (!this.kitAsked) {
      this.kitAsked = true;
      loadKit(['g3d-standard'], (missing) => {
        this.ready = missing.length === 0;
        if (!this.ready) {
          this.lastError = 'missing g3d-standard';
        }
      });
    }
  }

  /** 整层撤掉:3D 角色回收、2D 骨骼放回来、场景的灯光设置还原。 */
  stop(): void {
    if (!this.on) {
      return;
    }
    this.on = false;
    director.off(Director.EVENT_AFTER_UPDATE, this.late, this);
    for (const u of Array.from(this.units.values())) {
      this.release(u);
    }
    this.units.clear();
    this.skip = new WeakSet<object>();
    this.fired.clear();
    this.pool.forEach((list) => list.forEach((c) => c.destroy()));
    this.pool.clear();
    for (const x of this.extras) {
      try {
        x.stop();
      } catch (error) {
        console.warn('[f3d] extra stop', error);
      }
    }
    this.studio?.close();
    this.world?.close();
    this.owner = null;
    this.mode = 0;
  }

  // ───────────────────────── 每帧:跟在野外渲染器的 step 后面 ─────────────────────────
  sync(self: any, dt: number): void {
    let mode = flagMode();
    if (mode === 2 && self.def?.scene) {
      // 主城是「一整张画当地图 + 遮挡条」的做法,真 3D 场景没适配它(只在野外地图上做了):在主城里当作没开
      mode = 0;
    }
    if (!mode) {
      this.stop();
      return;
    }
    if (!self.isMounted() || !self.layout || !self.leader || !self.entityRoot || !self.entityRoot.isValid) {
      return;      // 野外没挂着(在别的界面 / 战斗里):late() 发现好几帧没同步会把摄影棚 / 3D 场景停掉
    }
    if (!this.on || this.owner !== self || this.mode !== mode) {
      this.stop();
      this.start(self, mode);
    }
    if (!this.ready || (mode !== 2 && !this.studio)) {
      return;
    }
    if (mode === 2 && !this.world) {
      this.world = new TownWorld3D();      // 要等 3D 标准材质的着色器到位了才能建(否则材质是空的)
    }
    const now = Date.now();
    const step = Math.min(0.05, Math.max(0, dt));
    const frozen = now < (self.hitStopUntil ?? 0);       // 顿帧:全场定住
    if (mode === 2) {
      const w = this.world!;
      if (!w.isOpen()) {
        w.open();
      }
      if (!w.sync(self)) {
        return;
      }
    } else if (!this.studio!.isOpen()) {
      this.studio!.open();
    }
    this.lastSyncFrame = director.getTotalFrames();
    this.time += frozen ? 0 : step;
    try {
      const live = new Set<any>();
      const actors: any[] = [self.leader, ...(self.followers ?? [])].filter(Boolean);
      for (const a of actors) {
        live.add(a);
        this.track(a, true);
      }
      for (const m of (self.monsters ?? []) as any[]) {
        live.add(m);
        this.track(m, false);
      }
      for (const [owner, u] of Array.from(this.units)) {
        if (!live.has(owner) || !owner.node || !owner.node.isValid) {
          this.release(u);
          this.units.delete(owner);
        }
      }
      const tint = self.def?.actorTint as [number, number, number] | undefined;
      // 还没换成 3D 的:只给看得见的换,离队长近的先换(格子有限,整张地图的怪都在名单里)
      const waiting: Unit[] = [];
      for (const u of this.units.values()) {
        if (!u.char && u.tpl && u.owner.node.activeInHierarchy) {
          waiting.push(u);
        }
      }
      if (waiting.length) {
        const lx = self.leader.x;
        const ly = self.leader.y;
        const far = (u: Unit): number => (u.hero ? -1 : Math.hypot(u.owner.x - lx, u.owner.y - ly));
        waiting.sort((p, q) => far(p) - far(q));
        for (const u of waiting) {
          if (!this.materialize(u)) {
            break;
          }
        }
      }
      for (const u of this.units.values()) {
        if (!u.char) {
          continue;
        }
        const shown = u.owner.node.activeInHierarchy;
        if (u.char.node.active !== shown) {
          u.char.node.active = shown;
        }
        if (!shown) {
          u.lastX = u.owner.x;
          u.lastY = u.owner.y;
          u.hidden += step;
          if (u.hidden > 0.8) {
            this.release(u);      // 被视野裁掉了:格子和模型让给别的单位,回到视野里再换回来
          }
          continue;
        }
        u.hidden = 0;
        if (mode === 2 && this.lastSyncFrame % 12 === 0) {
          this.groundDecals(u);
        }
        if (frozen) {
          u.char.setSpeed(0);      // 顿帧:定在这一刻,出手进度也不往前走(逻辑那边恢复时会把计时整体后移)
          continue;
        }
        if (u.hero) {
          this.stepActor(u, self, step, now, tint);
        } else {
          this.stepMonster(u, self, step, now, tint);
        }
      }
      if (mode === 2) {
        for (const x of this.extras) {
          x.sync(self, this.world!, frozen ? 0 : step, frozen);
        }
      }
      this.fired.clear();
    } catch (error) {
      const text = String((error as any)?.stack ?? error);
      if (text !== this.lastError) {
        this.lastError = text;
        console.warn('[f3d] sync', error);
      }
    }
  }

  /** 帧尾(动画系统摆完骨头之后):叠程序动作。几帧没同步过 = 野外没在跑,把摄影棚停掉(不白画、灯光设置还给场景)。 */
  private late(): void {
    if (!this.on) {
      return;
    }
    if (director.getTotalFrames() - this.lastSyncFrame > 3) {
      if (this.studio?.isOpen()) {
        this.studio.close();
      }
      if (this.mode === 2) {
        // 真 3D 场景动过 2D 那边的东西(贴图藏了、图层换了):野外不在跑的时候整层撤掉、全部还原,回来再重建
        this.stop();
      }
      return;
    }
    for (const u of this.units.values()) {
      if (u.char && u.char.node.active) {
        u.char.pose(this.time);
      }
    }
    if (this.mode === 2 && this.world) {
      for (const x of this.extras) {
        x.late?.(this.world);
      }
    }
  }

  // ───────────────────────── 建 / 撤一个单位 ─────────────────────────
  private track(owner: any, hero: boolean): void {
    if (this.units.has(owner) || this.skip.has(owner)) {
      return;
    }
    const spec = hero ? heroSpec(owner.hero) : monsterSpec(owner.camp);
    if (!spec || !hasChar(spec.key) || (!hero && owner.camp?.dummy)) {
      this.skip.add(owner);
      const code = hero ? owner.hero?.heroCode ?? '?' : owner.camp?.monsterCode ?? owner.camp?.spine ?? '?';
      this.noModel.set(code, (this.noModel.get(code) ?? 0) + 1);
      return;
    }
    const seed = Math.abs(Math.sin((owner.x ?? 0) * 12.9898 + (owner.y ?? 0) * 78.233 + this.units.size * 3.7)) % 1;
    const u: Unit = { hero, owner, spec, tpl: null, loading: true, char: null, cell: -1, sprite: null, spine: null, restore: [],
      yaw: owner.facing > 0 ? IDLE_YAW_RIGHT : IDLE_YAW_LEFT, lastX: owner.x, lastY: owner.y, vx: 0, vy: 0, phase: seed,
      loop: '', act: '', actMs: 0, actClip: SLASH_FAST, hp: -1, flash: 0, windup: 0, dead: -1, alpha: 255, top: 0, hidden: 0, sink: 0 };
    this.units.set(owner, u);
    loadChar(spec.key, (tpl) => {
      u.loading = false;
      u.tpl = tpl;
      if (!tpl && this.units.get(owner) === u) {
        this.units.delete(owner);
        this.skip.add(owner);
      }
    });
  }

  /** 模型读好了、2D 骨骼也就绪了、摄影棚还有空格:换成 3D。返回 false = 格子用完了(后面的也不用试了)。 */
  private materialize(u: Unit): boolean {
    if (this.mode === 2) {
      return this.materializeWorld(u);
    }
    const owner = u.owner;
    const studio = this.studio!;
    const spine: Node | null = owner.spineNode ?? null;
    if (!u.tpl || !owner.skeleton || !spine || !spine.isValid || !owner.node.activeInHierarchy) {
      return true;      // 2D 骨骼还在读:出手时长要靠它,先等
    }
    const cell = studio.alloc();
    if (cell < 0) {
      this.stats.noCell += 1;
      return false;     // 格子用完了:这个单位先保持 2D,有空格再换
    }
    const height = u.spec.height * studio.scaleFor(u.spec.extent);
    studio.footOf(cell, _foot);
    const list = this.pool.get(u.tpl.key);
    let c = list && list.length ? list.pop()! : null;
    if (c && c.node.isValid) {
      c.reset();
      c.node.active = true;
      c.setHeight(height);
      this.stats.reused += 1;
    } else {
      c = G3DChar.spawn(u.tpl, studio.root, { height, yaw: u.yaw, at: _foot, albedo: CFG.albedo, procWalk: u.spec.procWalk, inPlace: true });
      c.node.walk((n) => {
        n.layer = STUDIO_LAYER;
      });
      this.stats.spawned += 1;
    }
    c.seed = u.phase * 9;
    c.downSide = u.phase > 0.5 ? 1 : -1;
    c.place(_foot.x, _foot.y, _foot.z, u.yaw);
    u.char = c;
    u.cell = cell;
    // 贴回 2D:一张图,脚底对准单位节点的原点,放在 2D 骨骼原来的层级上
    const size = u.spec.extent * CFG.unitsPerM;
    const node = new Node('G3DImp');
    node.layer = owner.node.layer;
    const ui = node.addComponent(UITransform);
    ui.setContentSize(size, size);
    ui.setAnchorPoint(0.5, studio.cfg.footV);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.customMaterial = studio.premultMaterial();
    sprite.spriteFrame = studio.frame(cell);
    owner.node.insertChild(node, spine.getSiblingIndex());
    u.sprite = sprite;
    u.alpha = 255;
    spine.active = false;
    u.spine = spine;
    u.top = u.spec.height * Math.cos((studio.cfg.pitch * Math.PI) / 180) * CFG.unitsPerM;
    // 脚下的柔边影子:2D 英雄骨骼自带影子、所以这块被调淡过,现在骨骼藏了,调回实一点
    const contact = owner.node.getChildByName('Contact');
    const contactOp = contact?.getComponent(UIOpacity) ?? null;
    if (contactOp) {
      const before = contactOp.opacity;
      contactOp.opacity = 235;
      u.restore.push(() => contactOp.isValid && (contactOp.opacity = before));
    }
    if (!u.hero) {
      // 怪的血条 / 名字原来按 2D 体型摆的高度,改按 3D 模型的头顶
      for (const [n, dy] of [[owner.hpBar?.node, 14], [owner.nameLabel?.node, 34]] as Array<[Node | undefined, number]>) {
        if (n && n.isValid) {
          const y0 = n.position.y;
          n.setPosition(n.position.x, u.top + dy, 0);
          u.restore.push(() => n.isValid && n.setPosition(n.position.x, y0, 0));
        }
      }
    }
    u.loop = '';
    u.act = '';
    u.hp = -1;
    u.dead = -1;
    u.hidden = 0;
    return true;
  }

  /**
   * 真 3D 场景里换成 3D:角色按真实身高直接站在 3D 世界里(位置每帧跟着单位的地图坐标走),2D 骨骼藏起来,
   * 脚下的 2D 假影子藏起来(换成真投影),光圈这类贴地的东西交给地表相机画(压在 3D 角色下面)。
   */
  private materializeWorld(u: Unit): boolean {
    const owner = u.owner;
    const w = this.world!;
    const spine: Node | null = owner.spineNode ?? null;
    if (!u.tpl || !owner.skeleton || !spine || !spine.isValid || !owner.node.activeInHierarchy) {
      return true;
    }
    w.toWorld(owner.x, owner.y, _foot);
    const list = this.pool.get(u.tpl.key);
    let c = list && list.length ? list.pop()! : null;
    if (c && c.node.isValid) {
      c.reset();
      c.node.active = true;
      c.setHeight(u.spec.height);
      this.stats.reused += 1;
    } else {
      c = G3DChar.spawn(u.tpl, w.root, { height: u.spec.height, yaw: u.yaw, at: _foot, albedo: CFG.albedo, procWalk: u.spec.procWalk, inPlace: true });
      c.node.walk((n) => {
        n.layer = FIELD_LAYER;
      });
      this.stats.spawned += 1;
    }
    c.seed = u.phase * 9;
    c.downSide = u.phase > 0.5 ? 1 : -1;
    c.place(_foot.x, _foot.y, _foot.z, u.yaw);
    u.char = c;
    u.cell = -1;
    u.sprite = null;
    u.alpha = 255;
    u.sink = 0;
    spine.active = false;
    u.spine = spine;
    u.top = u.spec.height * w.upUnits();
    const contact: Node | null = owner.node.getChildByName('Contact');
    if (contact && contact.active) {
      contact.active = false;
      u.restore.push(() => contact.isValid && (contact.active = true));
    }
    this.groundDecals(u);
    if (!u.hero) {
      for (const [n, dy] of [[owner.hpBar?.node, 14], [owner.nameLabel?.node, 34]] as Array<[Node | undefined, number]>) {
        if (n && n.isValid) {
          const y0 = n.position.y;
          n.setPosition(n.position.x, u.top + dy, 0);
          u.restore.push(() => n.isValid && n.setPosition(n.position.x, y0, 0));
        }
      }
    }
    u.loop = '';
    u.act = '';
    u.hp = -1;
    u.dead = -1;
    u.hidden = 0;
    return true;
  }

  /** 单位节点下面贴地的东西(队长光圈 / 精英光圈):交给地表相机画。之后才长出来的隔一会儿补一遍。 */
  private groundDecals(u: Unit): void {
    const w = this.world;
    const node: Node = u.owner.node;
    if (!w || !node || !node.isValid) {
      return;
    }
    for (const child of node.children) {
      if (/Ring$/.test(child.name) && child.layer === node.layer) {
        u.restore.push(w.toGround(child));
      }
    }
  }

  /** 把这个单位换回 2D(3D 角色回池子、格子让出来、2D 骨骼放回来);单位本身还留在名单里,之后还能再换成 3D。 */
  private release(u: Unit): void {
    // 单位节点已经被渲染器销毁的话(换阵容 / 换地图),贴图节点跟着没了,组件上的 node 是空的
    if (u.sprite && u.sprite.isValid && u.sprite.node && u.sprite.node.isValid) {
      u.sprite.node.destroy();
    }
    u.sprite = null;
    if (u.spine && u.spine.isValid) {
      u.spine.active = true;
    }
    u.spine = null;
    for (const fn of u.restore) {
      try {
        fn();
      } catch (error) {
        void error;
      }
    }
    u.restore.length = 0;
    if (u.cell >= 0) {
      this.studio?.free(u.cell);
      u.cell = -1;
    }
    const c = u.char;
    u.char = null;
    if (c && c.node.isValid) {
      c.reset();
      c.node.active = false;
      const list = this.pool.get(c.name) ?? [];
      list.push(c);
      this.pool.set(c.name, list);
      this.stats.released += 1;
    }
  }

  // ───────────────────────── 队长 / 队友 ─────────────────────────
  private playLoop(u: Unit, c: G3DChar, word: string, fade: number): void {
    u.loop = word;
    const name = c.clip(word) || c.clip('idle');
    if (name && c.play(name, fade, true) && word === 'idle') {
      const st = c.anim!.getState(name);
      st.setTime(u.phase * st.duration);      // 待机从各自的相位起播,几个人不会齐刷刷同步
    }
  }

  private stepActor(u: Unit, self: any, dt: number, now: number, tint: [number, number, number] | undefined): void {
    const a = u.owner;
    const c = u.char!;
    const leader = a === self.leader;
    if (dt > 1e-4) {
      const k = Math.min(1, dt * 12);
      u.vx += ((a.x - u.lastX) / dt - u.vx) * k;
      u.vy += ((a.y - u.lastY) / dt - u.vy) * k;
    }
    u.lastX = a.x;
    u.lastY = a.y;
    const speed = Math.hypot(u.vx, u.vy);
    const downed = leader ? !!self.leaderDead : !!a.down;
    // 这一帧渲染器让他出手了没有
    const fired = this.fired.get(a);
    if (fired && !downed && a.oneShotEnd > now) {
      const style = u.spec.attack ?? 'cast';
      const skill = fired !== 'attack';
      u.act = style === 'slash' && c.clip('slash') ? 'slash' : style === 'shoot' ? 'shoot' : 'cast';
      u.actClip = skill ? SLASH_FULL : SLASH_FAST;
      u.actMs = Math.max(120, a.oneShotEnd - now);
      this.stats.actions += 1;
    }
    // 朝向:出手时朝着目标;跑的时候朝着跑的方向;站着朝镜头转一点
    let want = a.facing > 0 ? IDLE_YAW_RIGHT : IDLE_YAW_LEFT;
    const target = leader ? self.lockTarget : a.target;
    if (u.act && target && !target.dead && target.node?.isValid) {
      want = this.yawTo(target.x - a.x, target.y - a.y);
    } else if (speed > 60 && !u.act) {
      want = this.yawTo(u.vx, u.vy);
    } else if (u.act) {
      want = a.facing > 0 ? -12 : 192;
    }
    u.yaw = turn(u.yaw, want, dt * 900);
    this.put(u, c);

    let cast = 0;
    let strike = 0;
    let draw = 0;
    let loose = 0;
    if (downed) {
      if (u.loop !== 'down') {
        u.loop = 'down';
        u.act = '';
        const fall = c.clip('fall');
        if (fall) {
          c.play(fall, 0.1, false);
          c.setSpeed(1.5);
        }
      }
    } else {
      if (u.act) {
        // 这一下演到哪了:看逻辑那边的计时(顿帧会把它往后挪,这里自然跟着停)
        const n = a.oneShotEnd > 0 ? clamp(1 - (a.oneShotEnd - now) / u.actMs, 0, 1) : 1;
        if (n >= 1) {
          u.act = '';
          u.loop = '';
        } else if (u.act === 'slash') {
          c.scrub(c.clip('slash'), u.actClip[0] + n * (u.actClip[1] - u.actClip[0]));
        } else {
          const out = 1 - ramp(n, 0.72, 1);
          if (u.act === 'cast') {
            cast = ramp(n, 0, 0.26) * out;
            strike = ramp(n, 0.28, 0.42) * out;
          } else {
            draw = ramp(n, 0, 0.24) * out;
            loose = ramp(n, 0.3, 0.4) * (1 - ramp(n, 0.78, 1));
          }
        }
      }
      if (!u.act || u.act !== 'slash') {
        const wantLoop = a.moving && !u.act ? 'run' : 'idle';
        if (u.loop !== wantLoop) {
          this.playLoop(u, c, wantLoop, u.loop === 'down' ? 0.3 : 0.14);
        }
        if (u.loop === 'run') {
          c.setSpeed(dt > 0 ? clamp(speed / 330, 0.7, 1.6) : 0);
        } else {
          c.setSpeed(dt > 0 ? 1 : 0);
        }
      }
    }
    const k2 = dt > 0 ? Math.min(1, dt * 26) : 0;
    c.cast += (cast - c.cast) * k2;
    c.strike += (strike - c.strike) * k2;
    c.draw += (draw - c.draw) * k2;
    c.loose += (loose - c.loose) * k2;
    // 冲刺 / 翻滚:整个人往前压
    const dashing = leader && now < (self.dashUntil ?? 0);
    c.lean += ((dashing ? 1 : 0) - c.lean) * (dt > 0 ? Math.min(1, dt * 18) : 0);
    // 掉血 → 受击反应
    const hp = leader ? self.leaderHp ?? 0 : a.hp ?? 0;
    if (u.hp >= 0 && hp < u.hp - 0.5 && !downed) {
      c.hit = 1;
      this.stats.hits += 1;
    }
    u.hp = hp;
    const g = !leader && downed ? 0.6 : 1;      // 倒下的队友压灰(2D 那边也是)
    c.setTint(((tint?.[0] ?? 255) / 255) * g, ((tint?.[1] ?? 255) / 255) * g, ((tint?.[2] ?? 255) / 255) * g);
    this.fade(u);
    c.step(dt);
  }

  // ───────────────────────── 怪 ─────────────────────────
  private stepMonster(u: Unit, self: any, dt: number, now: number, tint: [number, number, number] | undefined): void {
    const m = u.owner;
    const c = u.char!;
    if (dt > 1e-4) {
      const k = Math.min(1, dt * 10);
      u.vx += ((m.x - u.lastX) / dt - u.vx) * k;
      u.vy += ((m.y - u.lastY) / dt - u.vy) * k;
    }
    u.lastX = m.x;
    u.lastY = m.y;
    this.fade(u);
    if (m.dead) {
      if (u.dead < 0) {
        u.dead = 0;
        this.stats.deaths += 1;
      }
      u.dead += dt;
      // 行走定格,往一侧倒下(节点由渲染器淡出、之后整群重刷)
      c.setSpeed(0);
      c.stand += (1 - c.stand) * Math.min(1, dt * 10);
      c.down = Math.min(1, u.dead / 0.38);
      c.setTint(1, 1, 1);
      this.put(u, c);
      c.step(dt);
      return;
    }
    if (u.dead >= 0) {
      // 重刷出来复用了同一个对象:站起来
      u.dead = -1;
      c.down = 0;
    }
    const speed = Math.hypot(u.vx, u.vy);
    const flashing = m.flashUntil > now;
    const staggered = (m.staggeredUntil ?? 0) > now;
    // 朝向:盯上人了就朝着那个人;否则朝走的方向;站着按 2D 的左右朝向、朝镜头转一点
    let want = m.facing > 0 ? IDLE_YAW_RIGHT : IDLE_YAW_LEFT;
    const victim = m.victim;
    if (victim && victim.node?.isValid) {
      want = this.yawTo(victim.x - m.x, victim.y - m.y);
    } else if (speed > 40 && !flashing) {
      want = this.yawTo(u.vx, u.vy);
    }
    u.yaw = turn(u.yaw, want, dt * 480);
    this.put(u, c);
    // 走 / 停
    const walking = !!m.moving && !staggered;
    if (u.loop !== 'walk') {
      u.loop = 'walk';
      const name = c.procWalk ? '' : c.clip('walk');
      if (!name || !c.play(name, 0, true)) {
        c.toRest(true);
        c.walkPhase = u.phase * Math.PI * 2;
      } else {
        const st = c.anim!.getState(name);
        st.setTime(u.phase * st.duration);
      }
    }
    c.stand += ((walking ? 0 : 1) - c.stand) * Math.min(1, dt * 8);
    const mps = speed / CFG.unitsPerM;
    const rate = staggered ? 0.1 : 1;
    if (c.pwalk) {
      c.walkRate = clamp(mps / Math.max(0.2, u.spec.height * 0.6), 0.7, 2.8);
    } else {
      c.setSpeed(dt > 0 ? rate * clamp(mps / Math.max(0.2, u.spec.height * 0.9), 0.5, 2.4) : 0);
    }
    // 蓄力 → 扑咬(蓄力 0.35 秒后出手;扑咬的程序动作正好是先压低 0.3 秒再窜出去)
    if (m.windupUntil > now && m.windupUntil - u.windup > 200) {
      c.act = 'bite';
      c.actT = 0;
      this.stats.bites += 1;
    }
    if (m.windupUntil > 0) {
      u.windup = m.windupUntil;
    }
    if (m.flashUntil > u.flash) {
      u.flash = m.flashUntil;
      c.hit = Math.max(c.hit, 0.85);
      this.stats.hits += 1;
    }
    const t0 = (tint?.[0] ?? 255) / 255;
    const t1 = (tint?.[1] ?? 255) / 255;
    const t2 = (tint?.[2] ?? 255) / 255;
    if (flashing) {
      // 受击闪一下(2D 那边是闪白);真 3D 场景是线性直出,提太多会整只怪死白
      c.setTint(this.mode === 2 ? 1.4 : 1.75, this.mode === 2 ? 1.3 : 1.6, this.mode === 2 ? 1.22 : 1.5);
    } else {
      c.setTint(t0, t1, t2);
    }
    c.step(dt * rate);
  }

  /** 2D 地图上的方向 → 模型转多少度(真 3D 场景里纵深被俯角拉长过,要按 3D 世界里的方向算)。 */
  private yawTo(dx: number, dy: number): number {
    return this.mode === 2 && this.world ? this.world.yawOf(dx, dy) : yawOf(dx, dy);
  }

  /** 摆位置和朝向:贴回 2D 的那一版角色固定在摄影棚的格子里;真 3D 场景里跟着单位的地图坐标走(死后往地里沉)。 */
  private put(u: Unit, c: G3DChar): void {
    if (this.mode === 2 && this.world) {
      this.world.toWorld(u.owner.x, u.owner.y, _foot, -u.sink * (u.spec.height * 0.55 + 0.25));
      c.place(_foot.x, _foot.y, _foot.z, u.yaw);
    } else {
      c.place(c.at.x, c.at.y, c.at.z, u.yaw);
    }
  }

  /** 单位节点淡出时(怪死后):贴回 2D 的那一版贴图是预乘透明的,颜色也要跟着乘;真 3D 场景里改成往地里沉。 */
  private fade(u: Unit): void {
    const op = u.owner.node.getComponent(UIOpacity)?.opacity ?? 255;
    if (this.mode === 2) {
      u.sink = 1 - op / 255;
      return;
    }
    if (op !== u.alpha && u.sprite && u.sprite.isValid) {
      u.alpha = op;
      u.sprite.color = new Color(op, op, op, 255);
    }
  }

  /** 冲刺残影(渲染器要给这个角色出 2D 骨骼残影的时候):换成这一刻的 3D 贴图,原地留一下、发蓝、淡掉。返回 true = 已经处理了。 */
  afterimage(self: any, actor: any, alpha: number): boolean {
    const u = this.unitOf(actor);
    const root: Node | null = self.entityRoot ?? null;
    if (u && this.mode === 2) {
      return true;      // 真 3D 场景:2D 骨骼的残影不出(骨骼是藏着的),翻滚的拖尾由技能特效那边出
    }
    if (!u || !u.sprite || !root || !root.isValid || !this.studio) {
      return false;
    }
    const src = u.sprite.node.getComponent(UITransform)!;
    const node = new Node('TownDodgeGhost3D');
    node.layer = actor.node.layer;
    const ui = node.addComponent(UITransform);
    ui.setContentSize(src.contentSize);
    ui.setAnchorPoint(src.anchorPoint);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.customMaterial = this.studio.premultMaterial();
    sprite.spriteFrame = u.sprite.spriteFrame;
    const a = Math.round(255 * alpha);
    sprite.color = new Color(Math.round(a * 0.55), Math.round(a * 0.78), a, 255);
    root.insertChild(node, Math.max(0, actor.node.getSiblingIndex()));
    node.setPosition(actor.x, actor.y, 0);
    const fadeOut = { v: 1 };
    tween(fadeOut).to(0.28, { v: 0 }, { easing: 'quadIn', onUpdate: () => {
      if (sprite.isValid) {
        const k = Math.round(a * fadeOut.v);
        sprite.color = new Color(Math.round(k * 0.55), Math.round(k * 0.78), k, 255);
      }
    } }).call(() => node.isValid && node.destroy()).start();
    return true;
  }

  // ───────────────────────── 调试 ─────────────────────────
  info(): Record<string, unknown> {
    const list = Array.from(this.units.values());
    const pool: Record<string, number> = {};
    this.pool.forEach((v, k) => {
      pool[k] = v.length;
    });
    return { on: this.on, mode: this.mode, flag: flagMode(), ready: this.ready, studioOpen: !!this.studio?.isOpen(), world: this.world ? this.world.info() : null,
      extras: this.extras.map((x) => (x.info ? x.info() : null)), cfg: { ...CFG }, units: list.length,
      heroes3d: list.filter((u) => u.hero && u.char).length, monsters3d: list.filter((u) => !u.hero && u.char).length, drawn: list.filter((u) => u.char && u.char.node.active).length,
      tris: list.reduce((s, u) => s + (u.char && u.char.node.active ? u.char.tris : 0), 0), freeCells: this.studio?.freeCells() ?? 0, pool,
      stats: { ...this.stats }, noModel: Array.from(this.noModel.entries()), lastError: this.lastError };
  }

  dump(): Array<Record<string, unknown>> {
    return Array.from(this.units.values()).map((u) => ({ hero: u.hero, code: u.hero ? u.owner.hero?.heroCode : u.owner.camp?.monsterCode, key: u.spec.key, ready: !!u.char, cell: u.cell,
      shown: !!u.char?.node.active, x: Math.round(u.owner.x), y: Math.round(u.owner.y), yaw: Math.round(u.yaw), loop: u.loop, act: u.act, clip: u.char?.cur ?? '', rest: !!u.char?.rest,
      stand: u.char ? +u.char.stand.toFixed(2) : 0, dead: +u.dead.toFixed(2), spineHidden: !!u.spine && !u.spine.active }));
  }

  /** 现场调参。大小(unitsPerM)改了要重建贴图节点,所以直接整层重来。 */
  set(patch: Partial<FieldCfg>): Record<string, unknown> {
    Object.assign(CFG, patch);
    if (patch.cell !== undefined || patch.cols !== undefined || patch.rows !== undefined || patch.unitsPerM !== undefined || patch.albedo !== undefined) {
      this.stop();
      this.studio?.destroy();
      this.studio = null;
    } else {
      this.studio?.apply({ pitch: CFG.pitch, key: CFG.key, ambient: CFG.ambient, shadow: CFG.shadow });
    }
    return this.info();
  }

  /** 现场开关:true / 1 = 贴回 2D 的那一版,2 = 真 3D 场景,false / 0 = 关。 */
  toggle(on: boolean | number): Record<string, unknown> {
    (globalThis as any).__LC_FIELD3D = on;
    if (!on) {
      this.stop();
    }
    return this.info();
  }

  /** 真 3D 场景的灯光 / 镜头参数现场调。 */
  setWorld(patch: Partial<WorldCfg>): Record<string, unknown> {
    this.world?.applyCfg(patch);
    return this.info();
  }
}

/** 这个角色 / 怪现在是不是 3D 模型(真 3D 场景里);是的话返回它的身高(米),不是返回 0。 */
export function fieldUnitHeight(owner: any): number {
  const u = owner ? units.unitOf(owner) : null;
  return u && units.world && units.world.isOpen() ? u.spec.height : 0;
}

/** 给摆件 / 技能特效这些模块登记用(它们在各自的文件里,模块加载时把自己挂进来)。 */
export function addFieldExtra(extra: FieldExtra): void {
  units.extras.push(extra);
}

const units = new TownUnits3D();

function install(): void {
  const proto = LobbyTownRenderer.prototype as any;
  const wrap = (name: string, make: (orig: (...args: any[]) => any) => (this: any, ...args: any[]) => any): void => {
    const orig = proto[name];
    if (typeof orig !== 'function' || orig.__f3d) {
      return;
    }
    const wrapped = make(orig);
    (wrapped as any).__f3d = true;
    proto[name] = wrapped;
  };
  // 每帧:原来的 step 跑完,再照着它的结果同步 3D
  wrap('step', (orig) => function (this: any, ...args: any[]): any {
    const result = orig.apply(this, args);
    try {
      units.sync(this, Number(args[0]) || 0);
    } catch (error) {
      console.warn('[f3d] step', error);
    }
    return result;
  });
  // 出手:记下这一下是普攻还是技能(时长等原函数算完,从角色身上读)
  wrap('playActorAction', (orig) => function (this: any, ...args: any[]): any {
    const dur = orig.apply(this, args);
    if (dur > 0) {
      units.note(args[0], String(args[1]));
    }
    return dur;
  });
  wrap('playActorClip', (orig) => function (this: any, ...args: any[]): any {
    const dur = orig.apply(this, args);
    if (dur > 0) {
      units.note(args[0], 'attack');
    }
    return dur;
  });
  // 冲刺残影:3D 的角色出 3D 的残影
  wrap('spawnAfterimage', (orig) => function (this: any, ...args: any[]): any {
    try {
      if (units.afterimage(this, args[0], Number(args[1]) || 0.5)) {
        return undefined;
      }
    } catch (error) {
      console.warn('[f3d] afterimage', error);
    }
    return orig.apply(this, args);
  });
  (globalThis as any).__f3d = { toggle: (on: boolean | number) => units.toggle(on), info: () => units.info(), dump: () => units.dump(), set: (p: Partial<FieldCfg>) => units.set(p),
    world: (p?: Partial<WorldCfg>) => (p ? units.setWorld(p) : units.world?.info() ?? null), raw: () => units };
}

if (!EDITOR && sys.isBrowser) {
  install();
}
