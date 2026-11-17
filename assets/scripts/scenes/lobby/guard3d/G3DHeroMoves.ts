import { Material, Node, Quat, Texture2D, Vec3 } from 'cc';
import type { G3DChar, MoveData } from './G3DChar';
import { addMesh, DynMesh, material, tex } from './G3DKit';
import { Sculpt, xform } from './G3DSculpt';
import { ctxOf, makeCanvas } from './G3DTextures';
import { pfbm } from './G3DFieldTex';

/**
 * 主角的连招和技能动作(实验,2026-11-17;地宫小样用)。
 *
 * 用户:「主角需要接入更多的连招动作,技能特效需要做细腻酷炫。」
 * 主角的模型只带 5 个动作片段(待机 / 走 / 跑 / 挥砍 / 倒地),「挥砍」是一整段 6.6 秒的双手过顶劈,只有一招。
 * 生成平台的人形预设一共 11 个,攻击类只有这一个,所以多出来的招式不靠片段,用代码在骨架上摆:
 * - 一招 = 几个关键姿势(右臂、小臂、剑身各指向哪,腰拧多少、身体压多少,胯往哪挪,两只脚各踩在哪),中间平滑过渡;
 * - 全部用「世界方向」来摆(让一段骨头指向某个方向),不用管每根骨头自己的轴朝哪;
 * - 胯一挪,两条腿按「脚还踩在原地」重新解一遍(大腿和小腿两段,膝盖朝前)—— 所以能弓步、下蹲、垫步;
 * - 剑是代码拼的,每帧摆到右手上、指向这一招给的方向;刀光是剑身实际扫过的那一片(记下每帧剑根和剑尖的位置连成带子)。
 * 「过顶劈」那一段片段留着用在跃空重劈上(那一招腿在空中,不用解腿)。
 *
 * 这套是代码摆出来的姿势,比不上动作捕捉:重心和脚步偏硬。骨架是标准的 mixamo 骨架,以后要更自然的招式可以直接换动作库的片段。
 *
 * 同一天接了动作库(用户:「先用 Mixamo」):Mixamo 的「大剑」动作包(51 个动作捕捉片段)转套到主角骨架上
 * (tools/proto3d/char3d/mixamo_retarget.py,片段放在 assets/resources/g3d_moves/hero_m/,和模型一样不进仓库)。
 * 有这批片段时招式用 GS_COMBO / GS_SKILLS(一招 = 某个片段里的一段,按逻辑时间定格播放;位移照片段里胯走过的路挪),
 * 剑换成双手大剑、固定在右手里(方向和握点由转套脚本量出来);没有这批片段时还是上面那套代码摆的招式。
 */

export type V3 = [number, number, number];      // 角色自己的方向:[往前, 往上, 往右手边]

export interface MoveKey {
  /** 这一招进行到几成(0~1)。 */
  t: number;
  /** 右上臂 / 右小臂 / 剑身各指向哪。 */
  arm: V3;
  fore: V3;
  blade: V3;
  /** 腰往左拧多少度(负 = 往右);身体往后仰多少度(负 = 往前压)。 */
  twist?: number;
  lean?: number;
  /** 胯挪多少米。 */
  hips?: V3;
  /** 左上臂 / 左小臂(不给 = 往外下方撑开保持平衡)。 */
  lArm?: V3;
  lFore?: V3;
  /** 两只脚相对站姿各挪多少米。 */
  footR?: V3;
  footL?: V3;
}

export interface MoveHit {
  /** 进行到几成的时候判定;够得着多远(米);前方多宽的扇形(度,360 = 一圈);伤害;是不是重击(顿帧更长、击退更远)。 */
  t: number;
  reach: number;
  arc: number;
  dmg: number;
  heavy?: boolean;
}

export interface Move {
  name: string;
  /** 一共多少秒。 */
  dur: number;
  keys: MoveKey[];
  hits: MoveHit[];
  /** 这一招里人往前挪多少米(在 advAt 这段进度里挪完)。 */
  advance: number;
  advAt: [number, number];
  /** 整个人原地转多少度(旋风斩);在 spinAt 这段进度里转完。 */
  spin?: number;
  spinAt?: [number, number];
  /** 进行到几成之后可以接下一招 / 走开。 */
  cancel: number;
  /** 刀光开着的进度区间。 */
  trail: [number, number];
  /** 刀光的颜色(0~1)。 */
  color: V3;
  /** 动作库的片段(有它就不用 keys 摆姿势):片段名、取片段里的哪一段(秒)、位移放大几倍。 */
  clip?: string;
  from?: number;
  to?: number;
  rootK?: number;
  /** 这一招自己的特效 / 沿路判定开着的进度区间,和「出手」那一下(放剑气、砸地)的进度。 */
  fx?: [number, number];
  fire?: number;
}

const STEEL: V3 = [0.72, 0.88, 1.0];
const VIOLET: V3 = [0.62, 0.55, 1.0];

/** 普攻四连:右往左横斩 → 反手左往右上撩 → 右上往左下斜劈 → 转身一圈横扫。 */
export const COMBO: Move[] = [
  {
    name: '横斩', dur: 0.4, advance: 0.45, advAt: [0.1, 0.5], cancel: 0.6, trail: [0.2, 0.62], color: STEEL,
    hits: [{ t: 0.42, reach: 2.3, arc: 150, dmg: 1 }],
    keys: [
      { t: 0, arm: [-0.1, 0.1, 0.98], fore: [-0.35, 0.35, 0.85], blade: [-0.75, 0.45, 0.45], twist: -38, lean: -4, hips: [-0.04, -0.06, 0.05], footR: [-0.16, 0, 0.1], footL: [0.12, 0, -0.04] },
      { t: 0.22, arm: [0.35, 0.12, 0.9], fore: [0.5, 0.2, 0.82], blade: [0.2, 0.3, 0.92], twist: -30, lean: -6, hips: [0.02, -0.1, 0.03], footR: [-0.16, 0, 0.1], footL: [0.2, 0, -0.04] },
      { t: 0.42, arm: [0.92, 0.02, 0.3], fore: [0.98, -0.02, 0.05], blade: [0.95, 0.0, -0.3], twist: 8, lean: -12, hips: [0.14, -0.14, 0], footR: [-0.16, 0, 0.1], footL: [0.3, 0, -0.04] },
      { t: 0.62, arm: [0.55, -0.05, -0.75], fore: [0.3, -0.08, -0.93], blade: [-0.2, 0.02, -0.98], twist: 42, lean: -8, hips: [0.12, -0.1, -0.03], footR: [-0.16, 0, 0.1], footL: [0.3, 0, -0.04] },
      { t: 1, arm: [0.3, -0.35, -0.75], fore: [0.2, -0.45, -0.8], blade: [-0.25, -0.2, -0.92], twist: 30, lean: -3, hips: [0.06, -0.05, -0.02], footR: [-0.1, 0, 0.08], footL: [0.22, 0, -0.04] },
    ],
  },
  {
    name: '反手上撩', dur: 0.4, advance: 0.35, advAt: [0.1, 0.5], cancel: 0.6, trail: [0.18, 0.64], color: STEEL,
    hits: [{ t: 0.44, reach: 2.3, arc: 150, dmg: 1 }],
    keys: [
      { t: 0, arm: [0.3, -0.35, -0.75], fore: [0.15, -0.5, -0.8], blade: [-0.3, -0.35, -0.9], twist: 34, lean: -6, hips: [0.02, -0.1, -0.04], footR: [0.1, 0, 0.1], footL: [-0.1, 0, -0.06] },
      { t: 0.22, arm: [0.6, -0.3, -0.55], fore: [0.75, -0.3, -0.45], blade: [0.5, -0.4, -0.75], twist: 26, lean: -10, hips: [0.06, -0.14, -0.02], footR: [0.2, 0, 0.1], footL: [-0.1, 0, -0.06] },
      { t: 0.44, arm: [0.95, 0.1, 0.1], fore: [0.95, 0.25, 0.15], blade: [0.85, 0.42, 0.3], twist: -6, lean: -6, hips: [0.14, -0.08, 0.02], footR: [0.3, 0, 0.1], footL: [-0.1, 0, -0.06] },
      { t: 0.64, arm: [0.45, 0.5, 0.75], fore: [0.2, 0.7, 0.68], blade: [-0.25, 0.85, 0.45], twist: -40, lean: 4, hips: [0.1, -0.02, 0.05], footR: [0.3, 0, 0.1], footL: [-0.1, 0, -0.06] },
      { t: 1, arm: [0.2, 0.55, 0.8], fore: [-0.05, 0.75, 0.65], blade: [-0.45, 0.8, 0.35], twist: -34, lean: 5, hips: [0.05, 0, 0.04], footR: [0.24, 0, 0.1], footL: [-0.08, 0, -0.06] },
    ],
  },
  {
    name: '斜劈', dur: 0.46, advance: 0.45, advAt: [0.15, 0.55], cancel: 0.62, trail: [0.26, 0.68], color: STEEL,
    hits: [{ t: 0.5, reach: 2.4, arc: 130, dmg: 2 }],
    keys: [
      { t: 0, arm: [0.2, 0.55, 0.8], fore: [-0.05, 0.8, 0.6], blade: [-0.5, 0.82, 0.3], twist: -36, lean: 8, hips: [-0.02, 0.02, 0.04], footR: [-0.1, 0, 0.1], footL: [0.1, 0, -0.05] },
      { t: 0.26, arm: [0.3, 0.75, 0.55], fore: [0.1, 0.95, 0.3], blade: [-0.35, 0.93, 0.1], twist: -30, lean: 10, hips: [0, 0.03, 0.03], footR: [-0.1, 0, 0.1], footL: [0.22, 0.04, -0.05] },
      { t: 0.5, arm: [0.92, 0.15, 0.2], fore: [0.97, -0.1, 0.0], blade: [0.9, -0.3, -0.25], twist: 14, lean: -18, hips: [0.16, -0.18, 0], footR: [-0.1, 0, 0.1], footL: [0.36, 0, -0.05] },
      { t: 0.68, arm: [0.55, -0.55, -0.55], fore: [0.3, -0.75, -0.55], blade: [0.1, -0.8, -0.6], twist: 34, lean: -22, hips: [0.16, -0.22, -0.02], footR: [-0.1, 0, 0.1], footL: [0.36, 0, -0.05] },
      { t: 1, arm: [0.4, -0.55, -0.6], fore: [0.3, -0.7, -0.6], blade: [0.05, -0.65, -0.75], twist: 26, lean: -12, hips: [0.1, -0.12, -0.02], footR: [-0.06, 0, 0.1], footL: [0.3, 0, -0.05] },
    ],
  },
  {
    name: '回身横扫', dur: 0.62, advance: 0.5, advAt: [0.1, 0.6], spin: 360, spinAt: [0.08, 0.72], cancel: 0.8, trail: [0.14, 0.78], color: VIOLET,
    hits: [{ t: 0.32, reach: 2.7, arc: 360, dmg: 2 }, { t: 0.58, reach: 2.8, arc: 360, dmg: 3, heavy: true }],
    keys: [
      { t: 0, arm: [0.35, -0.3, -0.8], fore: [0.2, -0.3, -0.9], blade: [-0.3, -0.1, -0.95], twist: 30, lean: -10, hips: [0.04, -0.14, 0], footR: [-0.12, 0, 0.14], footL: [0.12, 0, -0.1] },
      { t: 0.2, arm: [0.75, 0.0, 0.55], fore: [0.85, 0.0, 0.5], blade: [0.8, 0.02, 0.6], twist: -18, lean: -10, hips: [0.06, -0.2, 0], footR: [-0.12, 0, 0.16], footL: [0.14, 0, -0.12] },
      { t: 0.72, arm: [0.8, 0.02, 0.5], fore: [0.9, 0.0, 0.4], blade: [0.85, 0.02, 0.5], twist: -14, lean: -10, hips: [0.08, -0.2, 0], footR: [-0.12, 0, 0.16], footL: [0.14, 0, -0.12] },
      { t: 0.86, arm: [0.7, -0.1, -0.6], fore: [0.5, -0.12, -0.82], blade: [0.0, 0.0, -1], twist: 38, lean: -12, hips: [0.1, -0.16, -0.02], footR: [-0.14, 0, 0.14], footL: [0.2, 0, -0.1] },
      { t: 1, arm: [0.4, -0.35, -0.7], fore: [0.25, -0.45, -0.8], blade: [-0.2, -0.25, -0.92], twist: 26, lean: -5, hips: [0.05, -0.06, -0.02], footR: [-0.1, 0, 0.1], footL: [0.16, 0, -0.06] },
    ],
  },
];

/** 技能:突进刺、旋风斩、剑气斩(跃空重劈用片段,不在这里)。 */
export const SKILLS: Record<string, Move> = {
  dash: {
    name: '突进刺', dur: 0.52, advance: 4.6, advAt: [0.2, 0.62], cancel: 0.85, trail: [0.2, 0.75], color: VIOLET,
    hits: [],          // 沿路的判定由调用方逐帧做(冲过去的路上碰到谁算谁)
    keys: [
      { t: 0, arm: [-0.45, 0.05, 0.85], fore: [-0.2, 0.15, 0.95], blade: [0.75, 0.1, 0.55], twist: -40, lean: -8, hips: [-0.1, -0.2, 0.04], footR: [-0.3, 0, 0.12], footL: [0.2, 0, -0.06] },
      { t: 0.2, arm: [-0.5, 0.1, 0.8], fore: [0.1, 0.1, 0.98], blade: [0.95, 0.05, 0.25], twist: -44, lean: -14, hips: [-0.12, -0.26, 0.04], footR: [-0.34, 0, 0.12], footL: [0.24, 0, -0.06] },
      { t: 0.45, arm: [0.95, 0.08, 0.15], fore: [1, 0.02, 0.02], blade: [1, 0.0, -0.03], twist: 20, lean: -26, hips: [0.3, -0.24, 0], footR: [-0.4, 0, 0.1], footL: [0.5, 0, -0.06] },
      { t: 0.75, arm: [0.96, 0.05, 0.1], fore: [1, 0.0, 0.0], blade: [1, 0.02, -0.02], twist: 22, lean: -24, hips: [0.3, -0.24, 0], footR: [-0.4, 0, 0.1], footL: [0.5, 0, -0.06] },
      { t: 1, arm: [0.5, -0.35, 0.5], fore: [0.6, -0.5, 0.3], blade: [0.6, -0.65, 0.1], twist: 6, lean: -8, hips: [0.1, -0.08, 0], footR: [-0.14, 0, 0.1], footL: [0.2, 0, -0.06] },
    ],
  },
  whirl: {
    name: '旋风斩', dur: 0.95, advance: 0, advAt: [0, 1], spin: 1080, spinAt: [0.1, 0.86], cancel: 0.9, trail: [0.08, 0.9], color: STEEL,
    hits: [{ t: 0.22, reach: 3.0, arc: 360, dmg: 1 }, { t: 0.42, reach: 3.0, arc: 360, dmg: 1 }, { t: 0.62, reach: 3.0, arc: 360, dmg: 1 }, { t: 0.82, reach: 3.2, arc: 360, dmg: 2, heavy: true }],
    keys: [
      { t: 0, arm: [0.3, -0.3, -0.8], fore: [0.2, -0.35, -0.85], blade: [-0.3, -0.2, -0.9], twist: 30, lean: -8, hips: [0, -0.16, 0], footR: [-0.1, 0, 0.16], footL: [0.1, 0, -0.14] },
      { t: 0.12, arm: [0.55, 0.05, 0.82], fore: [0.6, 0.02, 0.8], blade: [0.5, 0.0, 0.87], twist: -10, lean: -6, hips: [0, -0.22, 0], footR: [-0.1, 0, 0.18], footL: [0.1, 0, -0.16] },
      { t: 0.5, arm: [0.5, 0.18, 0.84], fore: [0.55, 0.2, 0.8], blade: [0.45, 0.25, 0.86], twist: -10, lean: -4, hips: [0, -0.2, 0], footR: [-0.1, 0, 0.18], footL: [0.1, 0, -0.16] },
      { t: 0.86, arm: [0.55, -0.05, 0.82], fore: [0.6, -0.1, 0.78], blade: [0.5, -0.15, 0.85], twist: -10, lean: -8, hips: [0, -0.24, 0], footR: [-0.1, 0, 0.18], footL: [0.1, 0, -0.16] },
      { t: 1, arm: [0.45, -0.4, 0.5], fore: [0.5, -0.55, 0.35], blade: [0.5, -0.7, 0.15], twist: 4, lean: -6, hips: [0, -0.08, 0], footR: [-0.08, 0, 0.12], footL: [0.1, 0, -0.08] },
    ],
  },
  wave: {
    name: '剑气斩', dur: 0.56, advance: 0.2, advAt: [0.2, 0.5], cancel: 0.7, trail: [0.24, 0.6], color: VIOLET,
    hits: [],          // 伤害由放出去的那道剑气自己判定
    keys: [
      { t: 0, arm: [0.1, 0.5, 0.85], fore: [-0.15, 0.85, 0.5], blade: [-0.6, 0.78, 0.15], twist: -42, lean: 10, hips: [-0.06, 0, 0.04], footR: [-0.2, 0, 0.12], footL: [0.12, 0, -0.06] },
      { t: 0.24, arm: [0.2, 0.8, 0.55], fore: [-0.05, 0.98, 0.2], blade: [-0.5, 0.86, 0.0], twist: -46, lean: 14, hips: [-0.08, 0.02, 0.04], footR: [-0.2, 0, 0.12], footL: [0.16, 0.03, -0.06] },
      { t: 0.44, arm: [0.93, 0.2, 0.15], fore: [0.98, -0.05, -0.05], blade: [0.9, -0.3, -0.3], twist: 16, lean: -18, hips: [0.16, -0.16, 0], footR: [-0.2, 0, 0.12], footL: [0.34, 0, -0.06] },
      { t: 0.62, arm: [0.5, -0.5, -0.65], fore: [0.3, -0.7, -0.62], blade: [0.05, -0.75, -0.66], twist: 40, lean: -20, hips: [0.16, -0.2, -0.02], footR: [-0.2, 0, 0.12], footL: [0.34, 0, -0.06] },
      { t: 1, arm: [0.4, -0.5, -0.6], fore: [0.3, -0.65, -0.6], blade: [0.05, -0.6, -0.78], twist: 24, lean: -8, hips: [0.08, -0.08, -0.02], footR: [-0.1, 0, 0.1], footL: [0.24, 0, -0.06] },
    ],
  },
};

// ───────────────────────── 动作库的招式(Mixamo 大剑包) ─────────────────────────
interface ClipHit { at: number; reach: number; arc: number; dmg: number; heavy?: boolean }

/**
 * 用片段里的一段做一招。时刻都按片段自己的秒数写(对着逐帧分解图量的),这里换成进度。
 * speed = 播放速度(动作捕捉的原速偏慢,收势也长:取中间一段、放快一些,到了 cancel 就能接下一招)。
 */
function clipMove(name: string, clip: string, from: number, to: number, speed: number,
  o: { hits?: ClipHit[]; trail: [number, number]; cancel: number; color?: V3; rootK?: number; fx?: [number, number]; fire?: number }): Move {
  const span = to - from;
  const f = (at: number): number => (at - from) / span;
  return {
    name, clip, from, to, rootK: o.rootK ?? 1, dur: span / speed, keys: [], advance: 0, advAt: [0, 1],
    hits: (o.hits ?? []).map((h) => ({ t: f(h.at), reach: h.reach, arc: h.arc, dmg: h.dmg, heavy: h.heavy })),
    cancel: f(o.cancel), trail: [f(o.trail[0]), f(o.trail[1])], color: o.color ?? STEEL,
    fx: o.fx ? [f(o.fx[0]), f(o.fx[1])] : undefined, fire: o.fire !== undefined ? f(o.fire) : undefined,
  };
}

/** 待机 / 跑(双手持剑的架势)。 */
export const GS_STAND = 'gs_stand';
export const GS_RUN = 'gs_jog2';

/**
 * 普攻四连。节奏:用户看了第一版录屏说「调快一些」—— 起手的蓄势切掉更多、播放放到 1.7 ~ 1.85 倍、劈完就能接下一招
 * (第一版是 1.35 ~ 1.5 倍,四连打完 2.8 秒;现在约 1.9 秒)。整体还可以用地址 &dpace=1.2 之类再乘一个倍数试。
 */
export const GS_COMBO: Move[] = [
  clipMove('劈斩', 'gs_cut1', 0.25, 1.0, 1.75, { hits: [{ at: 0.68, reach: 2.8, arc: 150, dmg: 1 }], trail: [0.5, 0.86], cancel: 0.82 }),
  clipMove('回旋斩', 'gs_cut3', 0.35, 1.3, 1.8, { hits: [{ at: 0.82, reach: 2.9, arc: 360, dmg: 1 }], trail: [0.6, 1.06], cancel: 1.0 }),
  clipMove('连斩', 'gs_cut4', 0.3, 1.45, 1.85, { hits: [{ at: 0.74, reach: 2.9, arc: 170, dmg: 1 }, { at: 1.15, reach: 2.9, arc: 200, dmg: 2 }], trail: [0.55, 1.3], cancel: 1.24 }),
  clipMove('旋身重劈', 'gs_spin', 0.2, 1.6, 1.7, { hits: [{ at: 0.55, reach: 2.9, arc: 360, dmg: 2 }, { at: 1.12, reach: 3.2, arc: 150, dmg: 3, heavy: true }], trail: [0.3, 1.26], cancel: 1.36, color: VIOLET }),
];

/** 技能:突进(滑铲斩)、连环斩(一路四刀)、跃空重劈、剑气斩。 */
export const GS_SKILLS: Record<string, Move> = {
  // 突进斩:举剑跪滑出去(沿路碰到的都算),滑到头一记贴地横扫
  dash: clipMove('突进斩', 'gs_slide', 0.15, 1.7, 1.9, { hits: [{ at: 1.2, reach: 3.0, arc: 220, dmg: 2, heavy: true }], trail: [0.9, 1.55], cancel: 1.5, color: VIOLET, rootK: 1.3, fx: [0.25, 0.95], fire: 1.25 }),
  // 连环斩:一路往前四刀(劈、撩、扫、回身扫)
  whirl: clipMove('连环斩', 'gs_cut2', 0.4, 2.95, 1.9, {
    hits: [{ at: 0.88, reach: 2.8, arc: 170, dmg: 1 }, { at: 1.45, reach: 2.8, arc: 200, dmg: 1 }, { at: 1.75, reach: 3.0, arc: 220, dmg: 2 }, { at: 2.55, reach: 3.1, arc: 360, dmg: 3, heavy: true }],
    trail: [0.7, 2.75], cancel: 2.7, fx: [0.8, 2.7] }),
  // 跃空重劈:助跑起跳,举剑过顶,落地劈下
  smash: clipMove('跃空重劈', 'gs_leap', 0.35, 1.7, 1.6, { trail: [0.85, 1.3], cancel: 1.5, color: VIOLET, fire: 1.08 }),
  // 剑气斩:蹲身一记横扫,扫出去的那一下放出剑气
  wave: clipMove('剑气斩', 'gs_cut5', 0.15, 1.05, 1.7, { trail: [0.3, 0.62], cancel: 0.76, color: VIOLET, fire: 0.48 }),
};

/** 片段里某一刻(秒)的位移:[往前, 往右](模型原始尺寸下的米,相对片段开头)。 */
export function rootAt(data: MoveData, clip: string, time: number, out: [number, number]): [number, number] {
  const info = data.clips[clip];
  if (!info || !info.root.length) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const x = Math.min(info.root.length - 1, Math.max(0, time * data.fps));
  const i = Math.min(info.root.length - 2, Math.floor(x));
  const k = x - i;
  const a = info.root[Math.max(0, i)];
  const b = info.root[Math.min(info.root.length - 1, i + 1)];
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  return out;
}

// ───────────────────────── 取某一刻的姿势 ─────────────────────────
const lerpV = (a: V3 | undefined, b: V3 | undefined, k: number, out: V3): V3 => {
  const x = a ?? b ?? [0, 0, 0];
  const y = b ?? a ?? [0, 0, 0];
  out[0] = x[0] + (y[0] - x[0]) * k;
  out[1] = x[1] + (y[1] - x[1]) * k;
  out[2] = x[2] + (y[2] - x[2]) * k;
  return out;
};

export interface Pose { arm: V3; fore: V3; blade: V3; twist: number; lean: number; hips: V3; lArm: V3 | null; lFore: V3 | null; footR: V3; footL: V3 }

/** 一招进行到 t(0~1)时的姿势:相邻两个关键姿势之间用「先慢后快再慢」的曲线过,方向量取完再归一。 */
export function poseAt(move: Move, t: number, out: Pose): Pose {
  const keys = move.keys;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) {
    i += 1;
  }
  const a = keys[i];
  const b = keys[i + 1];
  let k = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-4, b.t - a.t)));
  k = k * k * (3 - 2 * k) * 0.55 + k * 0.45;        // 一半平滑、一半匀速:关键姿势上不停顿,挥过去是连着的
  lerpV(a.arm, b.arm, k, out.arm);
  lerpV(a.fore, b.fore, k, out.fore);
  lerpV(a.blade, b.blade, k, out.blade);
  out.twist = (a.twist ?? 0) + ((b.twist ?? 0) - (a.twist ?? 0)) * k;
  out.lean = (a.lean ?? 0) + ((b.lean ?? 0) - (a.lean ?? 0)) * k;
  lerpV(a.hips, b.hips, k, out.hips);
  out.lArm = a.lArm || b.lArm ? lerpV(a.lArm, b.lArm, k, out.lArm ?? [0, 0, 0]) : null;
  out.lFore = a.lFore || b.lFore ? lerpV(a.lFore, b.lFore, k, out.lFore ?? [0, 0, 0]) : null;
  lerpV(a.footR, b.footR, k, out.footR);
  lerpV(a.footL, b.footL, k, out.footL);
  return out;
}

export function newPose(): Pose {
  return { arm: [0, 0, 0], fore: [0, 0, 0], blade: [0, 0, 0], twist: 0, lean: 0, hips: [0, 0, 0], lArm: null, lFore: null, footR: [0, 0, 0], footL: [0, 0, 0] };
}

const _d = new Vec3();
const _k = new Vec3();
const _p = new Vec3();
const _t = new Vec3();
const _fr = new Vec3();
const _fl = new Vec3();
const _x = new Vec3();
const _y = new Vec3();
const _z = new Vec3();

/** 角色自己的方向 → 世界方向(不归一:挪位置也用它)。 */
function toWorld(c: G3DChar, v: V3, out: Vec3): Vec3 {
  const f = c.frame;
  return out.set(f.fwd.x * v[0] + f.up.x * v[1] + f.right.x * v[2], f.fwd.y * v[0] + f.up.y * v[1] + f.right.y * v[2], f.fwd.z * v[0] + f.up.z * v[1] + f.right.z * v[2]);
}

/** 一条腿:大腿根在哪就在哪,让脚踩到 target(世界坐标);膝盖朝角色的前方弯。 */
function legIK(c: G3DChar, side: 'Left' | 'Right', target: Vec3): void {
  const rig = c.rig;
  const up = rig.j(`${side}UpLeg`);
  const knee = rig.j(`${side}Leg`);
  const foot = rig.j(`${side}Foot`);
  if (!up || !knee || !foot) {
    return;
  }
  const H = up.worldPosition;
  const l1 = Vec3.distance(H, knee.worldPosition);
  const l2 = Vec3.distance(knee.worldPosition, foot.worldPosition);
  Vec3.subtract(_d, target, H);
  const raw = _d.length();
  const dist = Math.min(l1 + l2 - 0.002, Math.max(Math.abs(l1 - l2) + 0.002, raw));
  _d.multiplyScalar(1 / (raw || 1));
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  // 膝盖弯的方向:角色的前方里和「胯到脚」这条线垂直的那一份
  const f = c.frame.fwd;
  const dot = f.x * _d.x + f.y * _d.y + f.z * _d.z;
  _p.set(f.x - _d.x * dot, f.y - _d.y * dot, f.z - _d.z * dot).normalize();
  _k.set(_d.x * cosA + _p.x * sinA, _d.y * cosA + _p.y * sinA, _d.z * cosA + _p.z * sinA);
  rig.aim(up, knee, _k, 1);
  Vec3.subtract(_t, target, knee.worldPosition);
  if (raw > l1 + l2) {
    _t.set(_d);          // 够不着:腿伸直指过去
  }
  rig.aim(knee, foot, _t, 1);
}

/**
 * 把一个姿势摆到骨架上(要在动画系统摆完之后调;w = 这一招占几成,进出各渐变一下)。
 * 返回剑身该指的世界方向(写进 bladeOut)。
 */
export function applyPose(c: G3DChar, p: Pose, w: number, bladeOut: Vec3): void {
  const rig = c.rig;
  const f = c.frame;
  // 先记下两只脚现在踩在哪(待机姿势下的位置),等胯挪完再把脚按回去
  const fr = rig.j('RightFoot');
  const fl = rig.j('LeftFoot');
  if (fr) {
    _fr.set(fr.worldPosition).add(toWorld(c, [p.footR[0] * w, p.footR[1] * w, p.footR[2] * w], _t));
  }
  if (fl) {
    _fl.set(fl.worldPosition).add(toWorld(c, [p.footL[0] * w, p.footL[1] * w, p.footL[2] * w], _t));
  }
  const tw = p.twist * w;
  const ln = p.lean * w;
  rig.twist(rig.j('Spine'), f.up, tw * 0.3);
  rig.twist(rig.j('Spine1'), f.up, tw * 0.35);
  rig.twist(rig.j('Spine2'), f.up, tw * 0.35);
  rig.twist(rig.j('Neck'), f.up, -tw * 0.5);          // 头往回带一半:眼睛还看着前面
  rig.twist(rig.j('Spine'), f.right, ln * 0.4);
  rig.twist(rig.j('Spine1'), f.right, ln * 0.35);
  rig.twist(rig.j('Spine2'), f.right, ln * 0.25);
  rig.twist(rig.j('Neck'), f.right, -ln * 0.5);
  toWorld(c, p.hips, _t);
  rig.shift(rig.j('Hips'), _t.x * w, _t.y * w, _t.z * w);
  if (fr) {
    legIK(c, 'Right', _fr);
  }
  if (fl) {
    legIK(c, 'Left', _fl);
  }
  rig.aim(rig.j('RightArm'), rig.j('RightForeArm'), toWorld(c, p.arm, _t), w);
  rig.aim(rig.j('RightForeArm'), rig.j('RightHand'), toWorld(c, p.fore, _t), w);
  if (p.lArm && p.lFore) {
    rig.aim(rig.j('LeftArm'), rig.j('LeftForeArm'), toWorld(c, p.lArm, _t), w);
    rig.aim(rig.j('LeftForeArm'), rig.j('LeftHand'), toWorld(c, p.lFore, _t), w);
  } else {
    // 左臂:往外后下方撑开,跟着腰拧的方向前后摆一点
    const sw = Math.max(-1, Math.min(1, p.twist / 45));
    rig.aim(rig.j('LeftArm'), rig.j('LeftForeArm'), toWorld(c, [-0.2 - 0.45 * sw, -0.55, -0.8], _t), w * 0.8);
    rig.aim(rig.j('LeftForeArm'), rig.j('LeftHand'), toWorld(c, [0.25 - 0.5 * sw, -0.6, -0.72], _t), w * 0.8);
  }
  toWorld(c, p.blade, bladeOut).normalize();
}

// ───────────────────────── 剑 ─────────────────────────
export const BLADE_LEN = 1.02;        // 从手到剑尖(米)
export const BLADE_ROOT = 0.16;       // 从手到剑身开始的地方

/**
 * 一把剑(代码拼的):菱形截面的剑身、护手、缠皮的握柄、配重球。节点原点在右手握的地方,剑身沿自己的 +y。
 * great = 双手大剑(动作库的招式用):剑身更长更宽,握柄往下加长到左手也握得住。返回 len / root = 从手到剑尖 / 到剑身开始处。
 */
export function buildSword(parent: Node, great = false): { node: Node; edge: Material; lit: Material[]; len: number; root: number } {
  const node = new Node('DgSword');
  parent.addChild(node);
  const blade = new Sculpt();
  const dark = new Sculpt();
  const grip = new Sculpt();
  const edge = new Sculpt();
  const W = great ? 0.05 : 0.036;
  const TH = great ? 0.0095 : 0.0075;
  const ROOT = great ? 0.19 : BLADE_ROOT;
  const LEN = great ? 1.42 : BLADE_LEN;
  const m1 = great ? 0.92 : 0.62;            // 剑身分三段的两个分界
  const m2 = great ? 1.28 : 0.9;
  const lo = great ? -0.34 : -0.11;          // 握柄的下端
  const gy = great ? 0.145 : 0.115;          // 护手的位置
  const gw = great ? 0.2 : 0.15;             // 护手半宽
  // 剑身:三段,越往尖越窄;最后一段收成尖
  const seg = (y0: number, y1: number, w0: number, w1: number): void => {
    blade.prism([[w0, 0], [0, TH], [-w0, 0], [0, -TH]], y0, y1, w1 / w0, [[0.86, 0.9, 0.96], [0.62, 0.66, 0.74], [0.86, 0.9, 0.96], [0.62, 0.66, 0.74]], 3, undefined, false);
  };
  seg(ROOT, m1, W, W * 0.86);
  seg(m1, m2, W * 0.86, W * 0.62);
  blade.prism([[W * 0.62, 0], [0, TH], [-W * 0.62, 0], [0, -TH]], m2, LEN, 0, [[0.9, 0.94, 1], [0.66, 0.7, 0.78]], 3, undefined, false);
  // 血槽:剑身正中一道略凹的暗条(两面各一条薄片)
  for (const sgn of [1, -1]) {
    dark.prism([[W * 0.25, 0], [0, 0.0012], [-W * 0.25, 0], [0, -0.0012]], ROOT + 0.03, m1 + 0.1, 0.5, [0.2, 0.22, 0.27], 3, xform([0, 0, sgn * (TH * 0.72)]), false);
  }
  // 护手:一根横档,两头略上翘 + 中间一块菱形的格
  dark.prism([[gw, 0], [gw - 0.02, 0.014], [-gw + 0.02, 0.014], [-gw, 0], [-gw + 0.02, -0.014], [gw - 0.02, -0.014]], gy, gy + 0.035, 0.92, [0.32, 0.3, 0.3], 3);
  dark.prism([[0.04, 0], [0, 0.02], [-0.04, 0], [0, -0.02]], gy - 0.015, gy + 0.075, 0.6, [0.4, 0.36, 0.3], 3);
  grip.lathe([[0.016, lo], [0.019, lo + 0.07], [0.018, gy - 0.075], [0.016, gy]], 10, { den: great ? 16 : 9, tint: [0.2, 0.15, 0.12], smooth: true });
  dark.lathe([[0.0, lo - 0.05], [0.022, lo - 0.04], [0.027, lo - 0.02], [0.02, lo], [0.016, lo + 0.002]], 12, { den: 3, tint: [0.36, 0.33, 0.3] });
  // 刃口:贴着两条刃的两条细亮线(发一点冷光,暗处也看得出剑在哪)
  for (const sgn of [1, -1]) {
    edge.prism([[0.0035, 0], [0, 0.0016], [-0.0035, 0], [0, -0.0016]], ROOT + 0.01, m2, 0.62, [1, 1, 1], 1, xform([sgn * (W - 0.002), 0, 0], [0, 0, sgn * -(great ? 0.55 : 0.8)]), false);
  }
  const steel = material('builtin-standard', { USE_VERTEX_COLOR: true });
  steel.setProperty('roughness', great ? 0.5 : 0.24);
  if (great) {
    steel.setProperty('albedoScale', new Vec3(0.46, 0.48, 0.52));          // 大剑的面宽:又亮又光的话,在月光下整片反白、带一圈光晕
  }
  steel.setProperty('metallic', 1);
  const iron = material('builtin-standard', { USE_VERTEX_COLOR: true });
  iron.setProperty('roughness', 0.5);
  iron.setProperty('metallic', 0.9);
  const leather = material('builtin-standard', { USE_VERTEX_COLOR: true });
  leather.setProperty('roughness', 0.85);
  leather.setProperty('metallic', 0);
  const edgeMat = material('builtin-unlit', {});
  edgeMat.setProperty('colorScale', great ? new Vec3(0.9, 1.15, 1.6) : new Vec3(1.5, 1.9, 2.6));
  for (const [b, m, name] of [[blade, steel, 'blade'], [dark, iron, 'guard'], [grip, leather, 'grip'], [edge, edgeMat, 'edge']] as Array<[Sculpt, Material, string]>) {
    for (const mesh of b.build()) {
      addMesh(node, name, mesh, m, name !== 'edge', name !== 'edge');
    }
  }
  return { node, edge: edgeMat, lit: [steel, iron, leather], len: LEN, root: ROOT };
}

const _q = new Quat();

/** 把剑摆到手上:剑身沿 dir,剑刃朝 lead(这一下挥过去的方向;没有就用上一次的)。 */
export function placeSword(sword: Node, hand: Vec3, dir: Vec3, lead: Vec3): void {
  _y.set(dir).normalize();
  // 刃朝着挥的方向:lead 里和剑身垂直的那一份
  const dot = Vec3.dot(lead, _y);
  _x.set(lead.x - _y.x * dot, lead.y - _y.y * dot, lead.z - _y.z * dot);
  if (_x.lengthSqr() < 1e-6) {
    _x.set(Math.abs(_y.y) > 0.9 ? 1 : 0, Math.abs(_y.y) > 0.9 ? 0 : 1, 0);
    const d2 = Vec3.dot(_x, _y);
    _x.set(_x.x - _y.x * d2, _x.y - _y.y * d2, _x.z - _y.z * d2);
  }
  _x.normalize();
  Vec3.cross(_z, _x, _y);
  Quat.fromAxes(_q, _x, _y, _z);
  sword.setWorldPosition(hand);
  sword.setWorldRotation(_q);
}

// ───────────────────────── 刀光 ─────────────────────────
/**
 * 刀光用的贴图:横向 = 沿着带子的长(新的一头 → 旧的一头),纵向 = 从剑根到剑尖。
 * 靠剑尖那一侧有一条细而亮的线,往剑根方向是一层越来越淡的薄雾,里面带几道顺着走的细丝(不是一整片平涂的光)。
 */
export function paintTrail(W = 256, H = 64): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const c = ctxOf(cv);
  const img = c.createImageData(W, H);
  for (let y = 0; y < H; y += 1) {
    const v = 1 - (y + 0.5) / H;            // 0 剑根 → 1 剑尖
    for (let x = 0; x < W; x += 1) {
      const u = (x + 0.5) / W;              // 0 新 → 1 旧
      const core = Math.exp(-(((v - 0.9) / 0.035) ** 2));                         // 剑尖内侧的一条亮线
      const body = Math.max(0, Math.min(1, (v - 0.12) / 0.75)) ** 1.6 * (v < 0.97 ? 1 : Math.max(0, (1 - v) / 0.03));
      const streak = 0.55 + 0.9 * Math.max(0, pfbm(u * 0.6, v, 3, 28, 3, 71) - 0.42);
      const a = (core * 0.95 + body * 0.42 * streak) * (1 - u) ** 1.25;
      const p = (y * W + x) * 4;
      img.data[p] = 255;
      img.data[p + 1] = 255;
      img.data[p + 2] = 255;
      img.data[p + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

interface Sample { bx: number; by: number; bz: number; tx: number; ty: number; tz: number; age: number; head: boolean; r: number; g: number; b: number }

/**
 * 刀光:剑身扫过的那一片。每帧记下剑根和剑尖的位置(挥得快的时候两帧之间再补几个点,不然是折线),
 * 连成一条带子;越旧的一头越透明,过了 life 秒消失。带子断开(收招、换招)时从头另起一段。
 */
export class BladeTrail {
  readonly mesh: DynMesh;
  readonly mat: Material;
  life = 0.2;
  private samples: Sample[] = [];
  private last: { b: Vec3; t: Vec3 } | null = null;

  constructor(parent: Node, bounds: { min: [number, number, number]; max: [number, number, number] }, texture?: Texture2D) {
    this.mat = material('builtin-unlit', { USE_TEXTURE: true, USE_VERTEX_COLOR: true }, 2);
    this.mat.setProperty('mainTexture', texture ?? tex(paintTrail(), false, 2));
    this.mat.setProperty('colorScale', new Vec3(2.4, 2.4, 2.4));
    this.mesh = new DynMesh(parent, 'DgBladeTrail', this.mat, 4 * 260, 6 * 260, false, false, bounds);
  }

  /** 这一帧剑在哪(on = 刀光开着;关着的时候只是让已有的慢慢淡掉)。 */
  push(base: Vec3, tip: Vec3, on: boolean, color: V3): void {
    if (!on) {
      this.last = null;
      return;
    }
    const prev = this.last;
    const add = (bx: number, by: number, bz: number, tx: number, ty: number, tz: number, head: boolean): void => {
      this.samples.push({ bx, by, bz, tx, ty, tz, age: 0, head, r: color[0], g: color[1], b: color[2] });
    };
    if (prev) {
      // 两帧之间按剑尖走了多远补点(每 6 厘米一个),位置直线过渡、剑的长度保持不变
      const d = Vec3.distance(prev.t, tip);
      const n = Math.min(10, Math.max(1, Math.ceil(d / 0.06)));
      const len = Vec3.distance(base, tip);
      for (let i = 1; i <= n; i += 1) {
        const k = i / n;
        const bx = prev.b.x + (base.x - prev.b.x) * k;
        const by = prev.b.y + (base.y - prev.b.y) * k;
        const bz = prev.b.z + (base.z - prev.b.z) * k;
        _t.set(prev.t.x + (tip.x - prev.t.x) * k - bx, prev.t.y + (tip.y - prev.t.y) * k - by, prev.t.z + (tip.z - prev.t.z) * k - bz).normalize().multiplyScalar(len);
        add(bx, by, bz, bx + _t.x, by + _t.y, bz + _t.z, false);
      }
      prev.b.set(base);
      prev.t.set(tip);
    } else {
      add(base.x, base.y, base.z, tip.x, tip.y, tip.z, true);       // 新一段的头:不和前一段连
      this.last = { b: base.clone(), t: tip.clone() };
    }
    if (this.samples.length > 250) {
      this.samples.splice(0, this.samples.length - 250);
      this.samples[0].head = true;
    }
  }

  update(dt: number): void {
    const s = this.samples;
    for (const p of s) {
      p.age += dt;
    }
    while (s.length && s[0].age > this.life) {
      s.shift();
      if (s.length) {
        s[0].head = true;
      }
    }
    const m = this.mesh;
    m.begin();
    for (let i = 1; i < s.length; i += 1) {
      const a = s[i - 1];
      const b = s[i];
      if (b.head || !m.room(4, 6)) {
        continue;
      }
      const ua = Math.min(1, a.age / this.life);
      const ub = Math.min(1, b.age / this.life);
      const i0 = m.vert(a.bx, a.by, a.bz, ua, 1, a.r, a.g, a.b, 1);
      m.vert(a.tx, a.ty, a.tz, ua, 0, a.r, a.g, a.b, 1);
      m.vert(b.tx, b.ty, b.tz, ub, 0, b.r, b.g, b.b, 1);
      m.vert(b.bx, b.by, b.bz, ub, 1, b.r, b.g, b.b, 1);
      m.tri(i0, i0 + 1, i0 + 2);
      m.tri(i0, i0 + 2, i0 + 3);
    }
    m.end();
  }

  clear(): void {
    this.samples.length = 0;
    this.last = null;
  }
}
