import { Node, Sprite, UIOpacity, Vec3, sp, tween } from 'cc';
import {
  resolveAttackFxSpritePath,
  resolveAttackSpineFxResource,
  resolveHeroAttackFx,
  resolveHeroAttackSpineFx,
  type BattleAttackFxSpec,
  type BattleAttackSpineFxSpec,
} from './LobbyBattleAttackFxConfig';
import { battleFxPremultiplied, lookupBattleFxBounds, resolveHeroGuardSkillEffect, type BattleSkillEffectSpec, type GuardSkillFxRole } from './LobbyBattleSkillEffectConfig';
import { patchBattleUnitSpineRuntimeEnums, resolveBattleUnitSpineRuntimeData } from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';

export interface TownCombatFxHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
}

/** 一段 Spine 特效:effect / 动画名 / 可选片段(秒)。 */
export interface TownFxClip {
  effect: string;
  animation: string;
  clip?: { start: number; end: number; speed?: number; loopFrom?: number };
}

interface ReadyFx {
  data: sp.SkeletonData;
  animation: string;
  duration: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** 英雄在野外战斗里的整套表现素材(普攻弹道 / 命中 / 斩击贴图 / 技能)。 */
export interface TownHeroFxKit {
  strike: BattleAttackFxSpec;
  spine: BattleAttackSpineFxSpec | null;
  skill: BattleSkillEffectSpec;
}

export function resolveTownHeroFxKit(heroCode: string, heroClass: string | null | undefined, role: 'melee' | 'ranged' | 'support'): TownHeroFxKit {
  const skillRole: GuardSkillFxRole = role === 'support' ? 'support' : role === 'ranged' ? 'ranged' : 'melee';
  return {
    strike: resolveHeroAttackFx(heroCode, heroClass ?? null, role === 'melee'),
    spine: resolveHeroAttackSpineFx(heroCode),
    skill: resolveHeroGuardSkillEffect(heroCode, skillRole),
  };
}

/**
 * 野外跑图战斗特效(docs/51 打击感,2026-10-28 用户:「所有的攻击没有弹道,技能也没有显示出来……战斗缺少打击感」)。
 * 素材与守卫战 / 矿境掠夺同一套:每名英雄专属 Spine 弹道 + 命中、斩击贴图、战技特效;尺寸按实测包围盒(lookupBattleFxBounds)等比适配。
 * 进野外图时 prewarm 全队素材;没就绪的特效本次退回贴图 / 跳过,不阻塞战斗。
 */
export class TownCombatFx {
  private readonly ready = new Map<string, ReadyFx>();
  private readonly pending = new Set<string>();

  constructor(private readonly host: TownCombatFxHost) {}

  prewarmKit(kit: TownHeroFxKit): void {
    if (kit.spine) {
      this.prewarm(kit.spine);
      if (kit.spine.hit) {
        this.prewarm(kit.spine.hit);
      }
    }
    this.prewarm(kit.skill);
  }

  prewarm(spec: { effect: string; animation: string }): void {
    if (this.ready.has(spec.effect) || this.pending.has(spec.effect)) {
      return;
    }
    this.pending.add(spec.effect);
    loadSharedSpineData(resolveAttackSpineFxResource(spec), null, 'TownFx', (data) => {
      this.pending.delete(spec.effect);
      if (!data) {
        return;
      }
      try {
        const runtime = resolveBattleUnitSpineRuntimeData(data);
        const names = (runtime?.animations ?? []).map((item) => (item?.name || '').trim()).filter(Boolean);
        if (!runtime || names.length === 0) {
          return;
        }
        patchBattleUnitSpineRuntimeEnums(data, runtime);
        const wanted = spec.animation.trim().toLowerCase();
        const animation = names.find((name) => name.toLowerCase() === wanted) ?? names[0];
        const bounds = lookupBattleFxBounds(spec.effect, animation);
        if (!bounds) {
          return;
        }
        const anim = (runtime.animations ?? []).find((item) => item?.name === animation) as { duration?: number } | undefined;
        this.ready.set(spec.effect, { data, animation, duration: Math.max(0.12, anim?.duration ?? 0.6), ...bounds });
      } catch (error) {
        console.warn('[TownFx] prewarm failed', spec.effect, error);
      }
    });
  }

  isReady(effect: string): boolean {
    return this.ready.has(effect);
  }

  /**
   * 在 (x, y) 播一段特效,最长边缩到 sizePx;返回节点(没就绪返回 null)。
   * loop = 循环(弹道);否则播完自动销毁(有 clip 只播片段,片段末 0.12s 淡出)。
   */
  play(parent: Node, fx: TownFxClip, x: number, y: number, sizePx: number, opts: { loop?: boolean; flipX?: boolean; angle?: number; speed?: number } = {}): Node | null {
    const ready = this.ready.get(fx.effect);
    if (!ready || !parent.isValid) {
      if (!ready) {
        this.prewarm(fx);
      }
      return null;
    }
    const fit = sizePx / Math.max(1, Math.max(ready.w, ready.h));
    const holder = this.host.addChildPlainNode(parent, 'TownFx', x, y, 10, 10);
    holder.setSiblingIndex(parent.children.length - 1);
    if (opts.angle) {
      holder.angle = opts.angle;
    }
    const node = this.host.addChildPlainNode(holder, 'Fx', -ready.cx * fit * (opts.flipX ? -1 : 1), -ready.cy * fit, 10, 10);
    node.setScale(fit * (opts.flipX ? -1 : 1), fit, 1);
    const skeleton = node.addComponent(sp.Skeleton);
    try {
      skeleton.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.SHARED_CACHE);
    } catch (error) {
      void error;
    }
    skeleton.premultipliedAlpha = battleFxPremultiplied(fx.effect);
    skeleton.skeletonData = ready.data;
    let lifeSec = ready.duration;
    try {
      const clip = fx.clip;
      const speed = Math.max(0.25, (clip?.speed ?? 1) * (opts.speed ?? 1));
      const entry = skeleton.setAnimation(0, ready.animation, !!opts.loop || !!clip?.loopFrom);
      if (clip && clip.end > clip.start) {
        // 原生 updateAnimation 不推进(安卓坑),直接设轨道时间到片段起点
        if (entry) {
          entry.trackTime = Math.max(0, clip.start);
        }
        lifeSec = (clip.end - clip.start) / speed;
      } else {
        lifeSec = ready.duration / speed;
      }
      skeleton.timeScale = speed;
    } catch (error) {
      void error;
    }
    if (!opts.loop) {
      const opacity = holder.addComponent(UIOpacity);
      const fade = Math.min(0.12, lifeSec * 0.25);
      tween(opacity).delay(Math.max(0, lifeSec - fade)).to(fade, { opacity: 0 }).call(() => holder.isValid && holder.destroy()).start();
    }
    return holder;
  }

  /** 斩击 / 撞击贴图:落在目标身上 0.14s 弹开 + 0.24s 淡出(同守卫战 spawnStrikeFx)。 */
  strikeSprite(parent: Node, spec: BattleAttackFxSpec, x: number, y: number, widthPx: number, angle: number): void {
    if (!parent.isValid) {
      return;
    }
    const h = widthPx * spec.aspect;
    const node = this.host.addChildPlainNode(parent, 'TownStrike', x, y, widthPx, h);
    node.setSiblingIndex(parent.children.length - 1);
    node.angle = angle;
    if (!this.host.addSprite('Img', resolveAttackFxSpritePath(spec), 0, 0, widthPx, h, node)) {
      node.destroy();
      return;
    }
    const opacity = node.addComponent(UIOpacity);
    node.setScale(0.55, 0.55, 1);
    tween(node).to(0.14, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' }).start();
    tween(opacity).delay(0.1).to(0.24, { opacity: 0 }).call(() => node.isValid && node.destroy()).start();
  }

  /**
   * 弹道:从 (sx, sy) 飞到 (ex, ey),travelMs 到达后回调 onArrive(命中特效 / 伤害在回调里做)。
   * 有 Spine 弹道就飞骨骼特效,没有(或没就绪)飞贴图;贴图朝右绘制,按飞行方向旋转。
   */
  projectile(parent: Node, kit: TownHeroFxKit, sx: number, sy: number, ex: number, ey: number, travelMs: number, lengthPx: number, onArrive: () => void): void {
    const angle = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
    let node: Node | null = null;
    if (kit.spine && this.ready.has(kit.spine.effect)) {
      node = this.play(parent, kit.spine, sx, sy, lengthPx * Math.max(0.8, kit.spine.size / 1.3), { loop: true, angle });
    }
    if (!node && parent.isValid) {
      const spec = kit.strike;
      const len = lengthPx * (spec.kind === 'bolt' ? 1 : 0.6);
      node = this.host.addChildPlainNode(parent, 'TownBolt', sx, sy, len, len * spec.aspect);
      node.setSiblingIndex(parent.children.length - 1);
      node.angle = angle;
      if (!this.host.addSprite('Img', resolveAttackFxSpritePath(spec), 0, 0, len, len * spec.aspect, node)) {
        node.destroy();
        node = null;
      }
    }
    if (!node) {
      setTimeout(onArrive, travelMs);
      return;
    }
    const flying = node;
    tween(flying).to(travelMs / 1000, { position: new Vec3(ex, ey, 0) }).call(() => {
      if (flying.isValid) {
        flying.destroy();
      }
      onArrive();
    }).start();
  }
}
