import { Director, director, Mat4, Node, sys, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { addFieldExtra } from './TownUnits3D';
import type { FieldExtra } from './TownUnits3D';
import { TownWorld3D } from './TownWorld3D';

/**
 * 野外真 3D 场景 · 自由视角下头顶的 2D 东西重新对位(实验,2026-11-17;只在 ?fcam=1 下起作用)。
 *
 * 血条、名字、飘字、头顶的标记这些还是 2D 的,由界面相机叠在最上面画。固定镜头时 3D 相机和 2D 地图的画法一致,
 * 它们本来就在对的位置上;自由视角下镜头转了、有了近大远小,它们还按 2D 的位置画就全错位了。
 *
 * 做法:只在「画」的那一下挪 —— 每帧出画面之前(Director.EVENT_BEFORE_DRAW),把 2D 世界里立着的每样东西
 * 按 3D 镜头算出它现在该在画面的哪里,把它(或者它下面属于界面的那几个子节点)挪过去、按远近缩放;
 * 画完(EVENT_AFTER_DRAW)立刻放回原位。战斗逻辑、缓动动画看到的始终是原来的地图坐标,一行不用改。
 *
 * 细节:
 * - 一个东西下面要是有不归界面相机画的子节点(交给 3D 那边画的角色贴图、烘进地面的光圈 / 指引箭头),它自己不能动
 *   (动了那些也跟着跑),只挪它下面纯界面的子节点;
 * - 位置按「脚下那一点在画面上的位置 + 离脚的偏移 × 远近倍数」算(头顶的东西离脚多高,就跟着模型在画面上的高矮走);
 *   大小的缩放收在一个范围里,免得远处的字小得看不见、凑近了大得挡画面;
 * - 飘字是在「目标头顶」那个地图坐标上冒出来的:按离它最近的那个单位的脚来算高度,不然转了镜头它会落到目标身后的地上;
 * - 在镜头背后的,挪到画面外。
 * 摆件(TownProp_N)的 2D 图已经藏了(换成了 3D 的),不用管。
 */

/** 头顶的东西大小缩放的范围(相对固定镜头时)。 */
const SCALE_MIN = 0.5;
const SCALE_MAX = 1.5;
/** 离队长多远以外的不画(米,在 TownWorld3D.range.unit 上再加这么多):远处的名字 / 标记一个个缩不下去,堆在天边是一片字。 */
const FAR_EXTRA = 2;

interface Moved {
  node: Node;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

const _o = new Vec3();
const _a = new Vec3();
const _a2 = new Vec3();
const _w = new Vec3();
const _s = new Vec3();
const _m = new Mat4();

class TownOverlay3D implements FieldExtra {
  private self: any = null;
  private world: TownWorld3D | null = null;
  private hooked = false;
  private moved: Moved[] = [];
  private pool: Moved[] = [];
  private foot = new WeakMap<Node, number>();
  private lastSync = -10;
  private stats = { moved: 0, hidden: 0, floaters: 0 };

  sync(self: any, world: TownWorld3D): void {
    this.self = self;
    this.world = world;
    this.lastSync = director.getTotalFrames();
    if (world.free && !this.hooked) {
      this.hooked = true;
      director.on(Director.EVENT_BEFORE_DRAW, this.before, this);
      director.on(Director.EVENT_AFTER_DRAW, this.after, this);
    } else if (!world.free && this.hooked) {
      this.unhook();
    }
  }

  private unhook(): void {
    if (this.hooked) {
      this.hooked = false;
      director.off(Director.EVENT_BEFORE_DRAW, this.before, this);
      director.off(Director.EVENT_AFTER_DRAW, this.after, this);
    }
    this.after();
    // 停用的那一帧把动过的东西都「弄脏」一遍:它们的位置已经放回去了,但有的渲染数据是按「这一帧动没动过」来决定要不要重算的
    const root: Node | null = this.self?.entityRoot ?? null;
    if (root && root.isValid) {
      for (const e of root.children) {
        if (e.active && !e.name.startsWith('TownProp_')) {
          e.setPosition(e.position.x, e.position.y, e.position.z);
        }
      }
    }
  }

  private keep(node: Node): void {
    const m = this.pool.pop() ?? { node, x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 };
    m.node = node;
    const p = node.position;
    const s = node.scale;
    m.x = p.x;
    m.y = p.y;
    m.z = p.z;
    m.sx = s.x;
    m.sy = s.y;
    m.sz = s.z;
    this.moved.push(m);
  }

  /** 这个节点连同下面的(只看开着的)是不是全归界面相机画。 */
  private allUi(node: Node, layer: number): boolean {
    if (node.layer !== layer) {
      return false;
    }
    const kids = node.children;
    for (let i = 0; i < kids.length; i += 1) {
      const c = kids[i];
      if (c.active && !this.allUi(c, layer)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 把 node 挪到「新锚点 + (它原来离锚点的偏移) × k」,大小乘 ks。anchor / anchor2 = 原来的 / 新的锚点(世界坐标)。
   * 下面混着别的相机画的东西的,自己不动,往下一层找纯界面的子节点挪。
   */
  private shift(node: Node, layer: number, anchor: Vec3, anchor2: Vec3, k: number, ks: number, hide: boolean): void {
    if (this.allUi(node, layer)) {
      this.keep(node);
      if (hide) {
        node.setWorldPosition(1e7, 1e7, 0);
        this.stats.hidden += 1;
        return;
      }
      const w = node.worldPosition;
      _w.set(anchor2.x + (w.x - anchor.x) * k, anchor2.y + (w.y - anchor.y) * k, w.z);
      const s = node.scale;
      node.setScale(s.x * ks, s.y * ks, s.z);
      node.setWorldPosition(_w);
      this.stats.moved += 1;
      return;
    }
    if (node.layer !== layer) {
      return;
    }
    const kids = node.children;
    for (let i = 0; i < kids.length; i += 1) {
      if (kids[i].active) {
        this.shift(kids[i], layer, anchor, anchor2, k, ks, hide);
      }
    }
  }

  /** 飘字:它冒出来的那个地图坐标是「某个单位的头顶」。第一次见到时找出是谁的头顶,记下那个单位脚的纵坐标。 */
  private footOf(node: Node, x: number, y: number): number {
    const known = this.foot.get(node);
    if (known !== undefined) {
      return known;
    }
    const self = this.self;
    let best = y;
    let bestD = 1e9;
    const each = (u: any): void => {
      if (!u || u.dead) {
        return;
      }
      const dy = y - u.y;
      const dx = Math.abs(x - u.x);
      if (dx < 110 && dy > -40 && dy < 460) {
        const d = dx + Math.abs(dy - 150) * 0.3;
        if (d < bestD) {
          bestD = d;
          best = u.y;
        }
      }
    };
    each(self.leader);
    for (const f of (self.followers ?? []) as any[]) {
      each(f);
    }
    for (const m of (self.monsters ?? []) as any[]) {
      each(m);
    }
    this.foot.set(node, best);
    return best;
  }

  private before(): void {
    const world = this.world;
    const self = this.self;
    if (!world || !self || !world.free || !world.isOpen() || director.getTotalFrames() - this.lastSync > 1) {
      return;
    }
    const root: Node | null = self.entityRoot ?? null;
    if (!root || !root.isValid || this.moved.length) {
      return;
    }
    const layer = root.layer;
    const up = world.upUnits();
    const lx = self.leader?.x ?? 0;
    const ly = self.leader?.y ?? 0;
    const far = world.range.unit + FAR_EXTRA;
    Mat4.copy(_m, root.worldMatrix);
    this.stats.moved = 0;
    this.stats.hidden = 0;
    this.stats.floaters = 0;
    const kids = root.children;
    for (let i = 0; i < kids.length; i += 1) {
      const e = kids[i];
      if (!e.active || e.layer !== layer) {
        continue;
      }
      const name = e.name;
      if (name.charCodeAt(0) === 84 && name.startsWith('TownProp_')) {
        continue;
      }
      const x = e.position.x;
      let y = e.position.y;
      let h = 0;
      if (name === 'Floater') {
        const fy = this.footOf(e, x, y);
        h = Math.max(0, (y - fy) / up);
        y = fy;
        this.stats.floaters += 1;
      }
      const s = world.metres(x, y, lx, ly) > far ? 0 : world.project(x, y, h, _o);
      // 原来的锚点 = 这个节点自己的位置(飘字也是:它整个挪到「脚上方 h 米」在画面上的位置)
      Vec3.transformMat4(_a, e.position, _m);
      Vec3.transformMat4(_a2, _o.set(_o.x, _o.y, e.position.z), _m);
      const ks = Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
      this.shift(e, layer, _a, _a2, s, ks, s <= 0);
    }
  }

  private after(): void {
    const list = this.moved;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const m = list[i];
      if (m.node.isValid) {
        m.node.setScale(_s.set(m.sx, m.sy, m.sz));
        m.node.setPosition(m.x, m.y, m.z);
      }
      this.pool.push(m);
    }
    list.length = 0;
  }

  stop(): void {
    this.unhook();
    this.self = null;
    this.world = null;
  }

  info(): unknown {
    return { overlay: { on: this.hooked, ...this.stats } };
  }
}

const overlay = new TownOverlay3D();
if (!EDITOR && sys.isBrowser) {
  addFieldExtra(overlay);
  (globalThis as any).__f3dover = overlay;
}
