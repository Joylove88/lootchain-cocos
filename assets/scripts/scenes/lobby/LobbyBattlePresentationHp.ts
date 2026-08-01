import type { BattlePresentationSnapshot } from './LobbyBattlePresentationSnapshot';
import type { BattlePresentationTimeline, BattlePresentationTimelineEvent } from './LobbyBattlePresentationTimeline';
import { resolveBattleReplay } from './LobbyBattleReplayModel';

export interface BattlePresentationHpUnitState {
  unitKey: string;
  side: 'ally' | 'enemy';
  maxHp: number;
  currentHp: number;
  hpRatio: number;
  dead: boolean;
  deadAtMs: number | null;
  damaged: number;
  healed: number;
  lastDamageHitKey: string | null;
  lastDamageEventSeq: number | null;
  lastDamageAtMs: number | null;
  // 能量护盾:随回放命中更新的当前护盾/上限,渲染层据 currentShield/maxHp 在血条上叠淡色护盾条。
  maxShield: number;
  currentShield: number;
  shieldKind: 'single' | 'team' | null;
  // 硬控:frozenUntilMs=控制结束绝对时间;frozen=按当前播放时间算的"当前是否被控",渲染层据此头顶挂图标。
  frozenUntilMs: number;
  frozen: boolean;
  frozenKind: 'freeze' | 'stun' | null;
}

export interface BattlePresentationHpState {
  units: Map<string, BattlePresentationHpUnitState>;
  enemyTotalHpRatio: number;
  allyTotalHpRatio: number;
  deadUnitKeys: Set<string>;
  appliedEventSeqs: Set<number>;
  appliedHitKeys: Set<string>;
}

export function resolveBattlePresentationHpState(
  snapshot: BattlePresentationSnapshot,
  timeline: BattlePresentationTimeline,
  playbackTimelineTimeMs: number,
): BattlePresentationHpState {
  const replay = resolveBattleReplay(snapshot, timeline);
  const units = new Map<string, BattlePresentationHpUnitState>();
  replay.units.forEach((unitState) => {
    const maxHp = unitState.maxHp;
    units.set(unitState.unitKey, {
      unitKey: unitState.unitKey,
      side: unitState.side,
      maxHp,
      currentHp: maxHp,
      hpRatio: 1,
      dead: false,
      deadAtMs: unitState.deadAtMs,
      damaged: 0,
      healed: 0,
      lastDamageHitKey: null,
      lastDamageEventSeq: null,
      lastDamageAtMs: null,
      maxShield: unitState.maxShield,
      currentShield: unitState.maxShield,
      shieldKind: unitState.shieldKind,
      frozenUntilMs: 0,
      frozen: false,
      frozenKind: null,
    });
  });

  const appliedEventSeqs = new Set<number>();
  const appliedHitKeys = new Set<string>();
  const visibleTimeMs = Number.isFinite(playbackTimelineTimeMs) ? playbackTimelineTimeMs : 0;
  replay.actions
    .flatMap((action) => action.hitEvents)
    .filter((hit) => hit.timeMs <= visibleTimeMs + 1)
    .sort((a, b) => a.timeMs - b.timeMs || a.eventSeq - b.eventSeq)
    .forEach((hit) => {
      const target = units.get(hit.targetKey);
      if (!target || target.dead) {
        return;
      }
      appliedEventSeqs.add(hit.eventSeq);
      appliedHitKeys.add(hit.hitKey);
      // 护盾随命中回放更新(闪避不掉盾),先扣盾再扣血——数据由回放 sim 统一结算,这里只跟随。
      target.currentShield = Math.max(0, Math.min(target.maxShield, hit.shieldAfter));
      // 硬控:命中新施加冻结/眩晕时,记录控制结束时间(供头顶持续图标按播放时间判断)。
      if (hit.frozeTarget && hit.frozeUntilMs > 0) {
        target.frozenUntilMs = hit.frozeUntilMs;
        target.frozenKind = hit.frozeTarget;
      }
      if (hit.evaded) {
        return;
      }
      const damage = Math.max(0, hit.hpBefore - hit.hpAfter);
      target.currentHp = Math.max(0, Math.min(target.maxHp, hit.hpAfter));
      target.damaged += damage;
      target.lastDamageHitKey = hit.hitKey;
      target.lastDamageEventSeq = hit.eventSeq;
      target.lastDamageAtMs = hit.timeMs;
      target.hpRatio = clamp01(target.currentHp / Math.max(1, target.maxHp));
      target.dead = target.currentHp <= 0;
      target.deadAtMs = target.dead
        ? resolveBattlePresentationDeadAtMs(target.deadAtMs, hit.killed ? hit.timeMs : null)
        : null;
      // 吸血/反弹作用在攻击者身上:随命中回放同步攻击者血条(sim 已结算,这里跟随)。
      if (hit.lifestealHeal > 0 || hit.reflectDamage > 0) {
        const actor = units.get(hit.actorKey);
        if (actor && !actor.dead) {
          if (hit.lifestealHeal > 0) {
            actor.currentHp = Math.min(actor.maxHp, actor.currentHp + hit.lifestealHeal);
            actor.healed += hit.lifestealHeal;
          }
          if (hit.reflectDamage > 0) {
            actor.currentHp = Math.max(0, actor.currentHp - hit.reflectDamage);
            actor.damaged += hit.reflectDamage;
          }
          actor.hpRatio = clamp01(actor.currentHp / Math.max(1, actor.maxHp));
          actor.dead = actor.currentHp <= 0;
          actor.deadAtMs = actor.dead ? resolveBattlePresentationDeadAtMs(actor.deadAtMs, hit.timeMs) : actor.deadAtMs;
        }
      }
    });

  const deadUnitKeys = new Set<string>();
  units.forEach((unit) => {
    unit.hpRatio = clamp01(unit.currentHp / Math.max(1, unit.maxHp));
    unit.dead = unit.dead || unit.currentHp <= 0;
    // 当前是否被控:控制结束时间还在播放时间之后,且未阵亡。渲染层据此在头顶挂持续图标。
    unit.frozen = !unit.dead && unit.frozenUntilMs > visibleTimeMs;
    if (unit.dead) {
      deadUnitKeys.add(unit.unitKey);
    }
  });

  return {
    units,
    enemyTotalHpRatio: resolveBattlePresentationSideHpRatio(units, 'enemy'),
    allyTotalHpRatio: resolveBattlePresentationSideHpRatio(units, 'ally'),
    deadUnitKeys,
    appliedEventSeqs,
    appliedHitKeys,
  };
}

export function applyBattlePresentationHpTimelineEvent(
  units: Map<string, BattlePresentationHpUnitState>,
  event: BattlePresentationTimelineEvent,
): boolean {
  if (event.type === 'damage_preview') {
    const target = event.targetKey ? units.get(event.targetKey) : null;
    if (!target || target.dead) {
      return false;
    }
    const amount = parseBattleDisplayNumber(event.displayValue);
    if (amount <= 0) {
      return false;
    }
    target.currentHp = Math.max(0, target.currentHp - amount);
    target.damaged += amount;
    target.hpRatio = clamp01(target.currentHp / Math.max(1, target.maxHp));
    target.dead = target.currentHp <= 0;
    return true;
  }

  if (event.type === 'buff_preview') {
    const target = event.targetKey ? units.get(event.targetKey) : null;
    if (!target || target.dead || target.side !== 'ally') {
      return false;
    }
    const amount = parseBattleDisplayNumber(event.displayValue);
    if (amount <= 0 || !`${event.displayValue ?? ''}`.includes('+')) {
      return false;
    }
    target.currentHp = Math.min(target.maxHp, target.currentHp + amount);
    target.healed += amount;
    target.hpRatio = clamp01(target.currentHp / Math.max(1, target.maxHp));
    return true;
  }

  return false;
}

export function parseBattleDisplayNumber(value: string | null | undefined): number {
  const match = `${value ?? ''}`.replace(/,/g, '').match(/[-+]?\d+/);
  if (!match) {
    return 0;
  }
  const numeric = Number.parseInt(match[0], 10);
  return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
}

function resolveBattlePresentationSideHpRatio(units: Map<string, BattlePresentationHpUnitState>, side: 'ally' | 'enemy'): number {
  const sideUnits = [...units.values()].filter((unit) => unit.side === side);
  if (sideUnits.length === 0) {
    return 0;
  }
  const total = sideUnits.reduce((sum, unit) => sum + unit.hpRatio, 0);
  return clamp01(total / sideUnits.length);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function resolveBattlePresentationDeadAtMs(previous: number | null, next: number | null): number | null {
  if (previous !== null && Number.isFinite(previous)) {
    return previous;
  }
  return next !== null && Number.isFinite(next) ? next : null;
}
