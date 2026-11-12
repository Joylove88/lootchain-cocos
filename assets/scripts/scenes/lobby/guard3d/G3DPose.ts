import { Node, Quat, Vec3 } from 'cc';

/**
 * 在骨骼动画摆好姿势之后,再叠一层「程序动作」(2026-11-12)。
 *
 * 为什么要有:AI 图转 3D 的平台只给很少几个预设动作 —— 人形没有施法 / 受击反应,四足 / 多足只有行走。
 * 缺的动作不再去找动作库,直接在骨架上用代码摆:施法抬手、受击后仰、怪物扑咬、倒地。
 *
 * 做法:全部用**世界空间**的操作(绕世界轴转、让一段骨头指向某个世界方向、整体平移),
 * 所以不用知道每根骨头的本地轴朝哪(不同平台、不同骨架都不一样)。
 * 动画系统每帧都会把骨头写回动画的姿势,所以这层要每帧在动画之后重新叠(Director.EVENT_AFTER_UPDATE)。
 */

const _q = new Quat();
const _q2 = new Quat();
const _a = new Vec3();
const _b = new Vec3();
const IDENT = new Quat();

export interface Frame {
  /** 角色面朝的方向 / 上 / 右手边(世界方向,单位向量)。 */
  fwd: Vec3;
  up: Vec3;
  right: Vec3;
}

export function frameOf(yawDeg: number): Frame {
  const r = (yawDeg * Math.PI) / 180;
  const fwd = new Vec3(Math.cos(r), 0, -Math.sin(r));       // 模型本来面朝 +x,绕 y 转 yaw
  const up = new Vec3(0, 1, 0);
  return { fwd, up, right: Vec3.cross(new Vec3(), fwd, up).normalize() };
}

/** 三个方向按权重混成一个世界方向。 */
export function dirOf(f: Frame, forward: number, upward: number, rightward: number, out = new Vec3()): Vec3 {
  out.set(f.fwd.x * forward + f.up.x * upward + f.right.x * rightward,
    f.fwd.y * forward + f.up.y * upward + f.right.y * rightward,
    f.fwd.z * forward + f.up.z * upward + f.right.z * rightward);
  return out.normalize();
}

export class Rig {
  readonly joints: Node[] = [];
  private byName = new Map<string, Node>();
  private rest = new Map<Node, { p: Vec3; r: Quat; s: Vec3 }>();
  private chains = new Map<string, Node[]>();

  constructor(readonly root: Node) {
    const walk = (n: Node): void => {
      this.joints.push(n);
      if (!this.byName.has(n.name)) {
        this.byName.set(n.name, n);
      }
      this.rest.set(n, { p: n.position.clone(), r: n.rotation.clone(), s: n.scale.clone() });
      n.children.forEach(walk);
    };
    root.children.forEach(walk);
  }

  /** 按名字找骨头:先整名,再按结尾找(mixamorig:Head / tripo::Head_0 都能用短名)。 */
  j(name: string): Node | null {
    const hit = this.byName.get(name);
    if (hit) {
      return hit;
    }
    for (const [k, n] of this.byName) {
      if (k.endsWith(`:${name}`)) {
        return n;
      }
    }
    return null;
  }

  /** 名字里含某个词的骨头,按「沿某个世界方向从后到前」排好(四足的脊柱 / 头颈用)。 */
  chain(word: string, along: Vec3): Node[] {
    let list = this.chains.get(word);
    if (!list) {
      // 只在第一次用的时候排一次(那时还是站姿);之后骨头怎么动,先后顺序都按这次的
      list = this.joints.filter((n) => n.name.indexOf(word) >= 0)
        .sort((x, y) => Vec3.dot(x.worldPosition, along) - Vec3.dot(y.worldPosition, along));
      this.chains.set(word, list);
    }
    return list;
  }

  /** 回到绑定姿势(设定图里的站姿):没有待机动作的怪物拿它当待机。 */
  toRest(): void {
    for (const [n, t] of this.rest) {
      n.setRTS(t.r, t.p, t.s);
    }
  }

  /** 绕一根世界轴转(以这根骨头自己为轴心)。 */
  twist(joint: Node | null, axis: Vec3, deg: number): void {
    if (!joint || Math.abs(deg) < 0.01) {
      return;
    }
    Quat.fromAxisAngle(_q, axis, (deg * Math.PI) / 180);
    Quat.multiply(_q2, _q, joint.worldRotation);
    joint.setWorldRotation(_q2);
  }

  /** 让「joint → child」这段骨头指向某个世界方向;weight 0~1。 */
  aim(joint: Node | null, child: Node | null, dir: Vec3, weight: number): void {
    if (!joint || !child || weight <= 0.001) {
      return;
    }
    Vec3.subtract(_a, child.worldPosition, joint.worldPosition);
    if (_a.lengthSqr() < 1e-10) {
      return;
    }
    _a.normalize();
    Quat.rotationTo(_q, _a, _b.set(dir).normalize());
    if (weight < 0.999) {
      Quat.slerp(_q, IDENT, _q, weight);
    }
    Quat.multiply(_q2, _q, joint.worldRotation);
    joint.setWorldRotation(_q2);
  }

  /** 整根骨头(连带它下面的全部)在世界里平移。 */
  shift(joint: Node | null, dx: number, dy: number, dz: number): void {
    if (!joint) {
      return;
    }
    const p = joint.worldPosition;
    joint.setWorldPosition(p.x + dx, p.y + dy, p.z + dz);
  }
}

const ease = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/**
 * 人形 · 施法(叠在待机上):charge 0→1 是蓄力(右手举过头、身体微微后仰、抬头),strike 1→0 是出手(手臂劈向前、身体前压)。
 * 骨头名按 mixamo 的叫法。
 */
export function poseCast(rig: Rig, f: Frame, charge: number, strike: number): void {
  const c = ease(charge);
  const s = ease(strike);
  const raise = c * (1 - s * 0.85);
  // 身体:蓄力后仰,出手前压(绕右手轴转,正 = 后仰)
  rig.twist(rig.j('Spine1'), f.right, 7 * raise - 13 * s);
  rig.twist(rig.j('Neck'), f.right, 9 * raise - 6 * s);
  // 右臂:上臂举起来,小臂再往上;出手时整条手臂指向前方
  rig.aim(rig.j('RightArm'), rig.j('RightForeArm'), dirOf(f, 0.45, 0.82, 0.3), raise * 0.95);
  rig.aim(rig.j('RightForeArm'), rig.j('RightHand'), dirOf(f, 0.25, 0.96, 0.02), raise * 0.95);
  rig.aim(rig.j('RightArm'), rig.j('RightForeArm'), dirOf(f, 0.93, 0.28, 0.2), s);
  rig.aim(rig.j('RightForeArm'), rig.j('RightHand'), dirOf(f, 0.98, 0.12, 0.05), s);
  // 左臂:往外下方撑开一点保持平衡
  rig.aim(rig.j('LeftArm'), rig.j('LeftForeArm'), dirOf(f, 0.25, -0.55, -0.8), Math.max(raise, s) * 0.6);
  rig.aim(rig.j('LeftForeArm'), rig.j('LeftHand'), dirOf(f, 0.5, -0.5, -0.7), Math.max(raise, s) * 0.6);
}

/** 人形 · 受击反应:h 从 1 衰减到 0。身体后仰、头甩后、整个人被推后一小步。 */
export function poseHit(rig: Rig, f: Frame, h: number): void {
  const k = ease(h);
  rig.twist(rig.j('Spine'), f.right, 9 * k);
  rig.twist(rig.j('Spine2'), f.right, 10 * k);
  rig.twist(rig.j('Neck'), f.right, 14 * k);
  rig.twist(rig.j('Spine1'), f.up, 12 * k);          // 身体拧一下
  rig.aim(rig.j('LeftArm'), rig.j('LeftForeArm'), dirOf(f, -0.25, -0.8, -0.55), k * 0.45);
  rig.aim(rig.j('RightArm'), rig.j('RightForeArm'), dirOf(f, -0.25, -0.8, 0.55), k * 0.45);
  rig.shift(rig.j('Hips'), -f.fwd.x * 0.14 * k, -0.03 * k, -f.fwd.z * 0.14 * k);
}

/**
 * 怪物骨架的结构:脊柱(从根到头)、头颈、每条腿。
 * 平台给非人形骨架起的名字不可靠(同一种熊,一只的前腿叫 Spine_2,另一只的骨盆叫 0_Left_Limb_0),
 * 所以不看名字,按站姿下骨头的位置和分叉来认:贴地、偏在身体两侧的末端 = 脚,往上爬到分叉点为止 = 一条腿;
 * 最靠前、位置高的末端 = 头;从根到头的那条路 = 脊柱。
 */
export interface BeastRig {
  root: Node | null;
  spine: Node[];
  head: Node[];
  legs: Array<{ joints: Node[]; front: boolean; left: boolean }>;
  height: number;
}

export function analyzeBeast(rig: Rig, f: Frame): BeastRig {
  const root = rig.j('Root') ?? rig.joints.find((n) => /root|hips|pelvis/i.test(n.name)) ?? null;
  const all: Node[] = [];
  const walk = (n: Node): void => {
    all.push(n);
    n.children.forEach(walk);
  };
  if (root) {
    walk(root);
  }
  const info = all.map((n) => {
    const p = n.worldPosition;
    return { n, y: p.y, fw: Vec3.dot(p, f.fwd), side: Vec3.dot(p, f.right) };
  });
  if (!root || info.length < 4) {
    return { root, spine: [], head: [], legs: [], height: 1 };
  }
  const minY = Math.min(...info.map((i) => i.y));
  const maxY = Math.max(...info.map((i) => i.y));
  const H = Math.max(1e-4, maxY - minY);
  const mid = info.reduce((a, i) => a + i.side, 0) / info.length;
  const maxSide = Math.max(...info.map((i) => Math.abs(i.side - mid)));
  // 从一个末端往上爬,爬到分叉点(或根)为止
  const climb = (leaf: Node): Node[] => {
    const chain = [leaf];
    let cur = leaf;
    while (cur.parent && cur.parent !== root && all.indexOf(cur.parent) >= 0 && cur.parent.children.length === 1) {
      cur = cur.parent;
      chain.unshift(cur);
    }
    return chain;
  };
  const leaves = info.filter((i) => i.n.children.length === 0);
  const feet = leaves.filter((i) => i.y < minY + 0.22 * H && Math.abs(i.side - mid) > maxSide * 0.25);
  const fwMid = feet.length ? (Math.min(...feet.map((i) => i.fw)) + Math.max(...feet.map((i) => i.fw))) / 2 : 0;
  const legs = feet.map((i) => ({ joints: climb(i.n), front: i.fw > fwMid, left: i.side - mid < 0 }));
  const footSet = feet.map((i) => i.n);
  const headLeaf = leaves.filter((i) => footSet.indexOf(i.n) < 0 && i.y > minY + 0.35 * H).sort((a, b) => b.fw - a.fw)[0] ?? null;
  const head = headLeaf ? climb(headLeaf.n) : [];
  const spine: Node[] = [];
  let cur: Node | null = head.length ? head[0].parent : null;
  while (cur && cur !== root && all.indexOf(cur) >= 0) {
    spine.unshift(cur);
    cur = cur.parent;
  }
  return { root, spine, head, legs, height: H };
}

/**
 * 四足 · 扑咬:t 是这一下走到第几秒(全程约 0.8 秒)。先压低蓄势,再往前窜、头甩上去咬,然后收回。
 * 返回这一刻往前窜了多远(米),调用方用来判定「咬到了」。
 */
export function poseBite(rig: Rig, f: Frame, b: BeastRig, t: number): number {
  const wind = ease(t / 0.3) * (1 - ease((t - 0.3) / 0.12));          // 蓄势
  const lunge = ease((t - 0.3) / 0.12) * (1 - ease((t - 0.5) / 0.3)); // 窜出去再收回
  const reach = Math.min(0.9, Math.max(0.25, b.height * 0.5));
  const ahead = lunge * reach - wind * reach * 0.26;
  rig.shift(b.root, f.fwd.x * ahead, b.height * (-0.06 * wind + 0.03 * lunge), f.fwd.z * ahead);
  // 前半身:蓄势时压低(鼻子朝下 = 绕右手轴转负角),扑出去时抬起来
  rig.twist(b.spine[b.spine.length - 1] ?? null, f.right, -9 * wind + 7 * lunge);
  rig.twist(b.head[0] ?? null, f.right, -14 * wind + 20 * lunge);
  rig.twist(b.head[b.head.length - 1] ?? null, f.right, -6 * wind + 12 * lunge);
  return Math.max(0, ahead);
}

/** 四足 · 受击:h 从 1 衰减到 0。被打得往后一挫、头甩向一边。 */
export function poseBeastHit(rig: Rig, f: Frame, b: BeastRig, h: number): void {
  const k = ease(h);
  const back = Math.min(0.3, b.height * 0.18);
  rig.shift(b.root, -f.fwd.x * back * k, b.height * 0.02 * k, -f.fwd.z * back * k);
  rig.twist(b.spine[b.spine.length - 1] ?? null, f.right, 8 * k);
  rig.twist(b.head[0] ?? null, f.up, 26 * k);
  rig.twist(b.head[0] ?? null, f.right, 10 * k);
}

/** 没有待机动作的怪物:站在绑定姿势上,只加一点呼吸起伏和头的小摆动。 */
export function poseBeastIdle(rig: Rig, f: Frame, b: BeastRig, time: number, seed = 0): void {
  const breathe = Math.sin(time * 1.9 + seed);
  rig.twist(b.spine[Math.floor(b.spine.length / 2)] ?? null, f.right, 1.2 * breathe);
  rig.twist(b.head[0] ?? null, f.up, 5 * Math.sin(time * 0.6 + seed * 2));
  rig.twist(b.head[0] ?? null, f.right, 2.5 * Math.sin(time * 0.9 + seed));
}

/**
 * 四足 / 多足 · 程序化行走(原地):phase 是步伐的相位(弧度,一圈 = 一个完整步子)。
 * 对角的两条腿同相(左前 + 右后一组,右前 + 左后一组;多足的按前后顺序交替);腿根前后摆,往前迈的时候小腿往后收把脚抬起来;
 * 身体跟着上下起伏、左右微摆。平台给的行走预设坏了(棕鬃熊)或者干脆不想买的时候用它。
 */
export function poseBeastWalk(rig: Rig, f: Frame, b: BeastRig, phase: number): void {
  const sorted = b.legs.slice().sort((x, y) => Vec3.dot(y.joints[0].worldPosition, f.fwd) - Vec3.dot(x.joints[0].worldPosition, f.fwd));
  const perSide = { L: 0, R: 0 };
  for (const leg of sorted) {
    const idx = leg.left ? perSide.L++ : perSide.R++;          // 这一侧从前往后第几条
    const flip = (idx % 2 === 0) === leg.left;                 // 同侧相邻的腿交替,左右两侧错开半步
    const ph = phase + (flip ? 0 : Math.PI);
    const swing = Math.sin(ph);                                // +1 = 脚在最前
    const lift = Math.max(0, Math.cos(ph));                    // 往前迈的那半程把脚抬起来
    rig.twist(leg.joints[0], f.right, 15 * swing);             // 朝下的骨头绕右手轴转正角 = 末端往前
    rig.twist(leg.joints[Math.min(1, leg.joints.length - 1)], f.right, -20 * lift);
    if (leg.joints.length > 2) {
      rig.twist(leg.joints[leg.joints.length - 2], f.right, 10 * lift);   // 脚掌回正一点,免得脚尖戳地
    }
  }
  rig.shift(b.root, 0, b.height * 0.012 * Math.sin(phase * 2), 0);
  rig.twist(b.spine[Math.floor(b.spine.length / 2)] ?? null, f.up, 2.5 * Math.sin(phase));
  rig.twist(b.head[0] ?? null, f.right, 2 * Math.sin(phase * 2 + 0.6));
}
