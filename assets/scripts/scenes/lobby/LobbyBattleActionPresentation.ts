import type { BattlePresentationSnapshot, BattlePresentationUnitRole, BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import type { BattlePresentationTimeline, BattlePresentationTimelineEvent } from './LobbyBattlePresentationTimeline';
import { resolveBattleReplay, type BattleReplayAction, type BattleReplayHitEvent } from './LobbyBattleReplayModel';
import { resolveBattleUnitSpineRarityTier } from './LobbyBattleUnitSpineRuntime';

export type BattleActionPresentationCueKind =
  | 'melee_move'
  | 'basic_attack'
  | 'ranged_projectile'
  | 'damage_float'
  | 'hit_float';

export interface BattleActionPresentationCue {
  cueKey: string;
  kind: BattleActionPresentationCueKind;
  eventSeq: number;
  actionSeq?: number;
  timeMs: number;
  durationMs: number;
  round: number;
  actorKey: string;
  actorName: string;
  actorRole: BattlePresentationUnitRole;
  actorSide: 'ally' | 'enemy';
  targetKey: string;
  targetName: string;
  targetRole: BattlePresentationUnitRole;
  targetSide: 'ally' | 'enemy';
  displayValue: string;
  label: string;
  animationName: string;
  audioCue: string;
  advanceRatio: number;
  arcRatio: number;
  isCritical: boolean;
  hitKey?: string;
  evaded?: boolean;
  // 吸血/反弹:>0 时表现层在攻击者(actorKey)身上另飘一条绿色"吸血 +N"/红色"反弹 -N"。
  lifestealHeal?: number;
  reflectDamage?: number;
}

const ACTION_CUE_WINDOWS: Record<BattleActionPresentationCueKind, number> = {
  melee_move: 2480,
  basic_attack: 1120,
  ranged_projectile: 640,
  damage_float: 560,
  hit_float: 560,
};

const ACTION_CUE_VISIBLE_PADDING_MS: Record<BattleActionPresentationCueKind, number> = {
  melee_move: 180,
  basic_attack: 220,
  ranged_projectile: 180,
  damage_float: 120,
  hit_float: 120,
};

export function resolveBattleActionPresentationCues(
  timeline: BattlePresentationTimeline,
  snapshot: BattlePresentationSnapshot,
): BattleActionPresentationCue[] {
  const replay = resolveBattleReplay(snapshot, timeline);
  const replayCues: BattleActionPresentationCue[] = [];
  replay.actions.forEach((action) => {
    if (action.movementKind === 'approach') {
      replayCues.push(createActionCueFromReplayAction('melee_move', action, action.startMs, action.approachMs, 'run', 0.44, 0.08));
      replayCues.push(createActionCueFromReplayAction(
        'basic_attack',
        action,
        Math.max(action.startMs, action.hitMs - action.castMs),
        ACTION_CUE_WINDOWS.basic_attack,
        resolveBattleReplayActionAnimationName(action),
        0.32,
        0.1,
      ));
    } else {
      replayCues.push(createActionCueFromReplayAction(
        'ranged_projectile',
        action,
        action.startMs + 120,
        Math.max(ACTION_CUE_WINDOWS.ranged_projectile, action.hitMs - action.startMs),
        resolveBattleCueAnimationNameForUnit(action.actor, 'skill'),
        0.18,
        0.32,
      ));
    }
    action.hitEvents.forEach((hit) => {
      replayCues.push(createDamageCueFromReplayHit(action, hit));
      replayCues.push(createHitCueFromReplayHit(action, hit));
    });
  });
  if (replayCues.length > 0) {
    return replayCues.sort((a, b) => a.timeMs - b.timeMs || a.eventSeq - b.eventSeq || a.kind.localeCompare(b.kind));
  }

  const units = createActionUnitMap(snapshot);
  const cues: BattleActionPresentationCue[] = [];
  timeline.events.forEach((event) => {
    const actor = resolveActionUnit(units, event.actorKey);
    const target = resolveActionUnit(units, event.targetKey);
    if (!actor || !target || actor.unitKey === target.unitKey) {
      return;
    }
    if (event.type === 'action_start') {
      if (actor.role === 'back') {
        cues.push(createActionCue('ranged_projectile', event, actor, target, {
          timeOffsetMs: 120,
          animationName: resolveBattleCueAnimationNameForUnit(actor, 'skill'),
          advanceRatio: 0.18,
          arcRatio: 0.32,
        }));
        return;
      }
      cues.push(createActionCue('melee_move', event, actor, target, {
        timeOffsetMs: 0,
        animationName: 'run',
        advanceRatio: actor.role === 'boss' ? 0.32 : 0.44,
        arcRatio: 0.08,
      }));
      cues.push(createActionCue('basic_attack', event, actor, target, {
        timeOffsetMs: 1420,
        animationName: resolveBattleCueAnimationNameForUnit(actor, 'attack'),
        advanceRatio: actor.role === 'boss' ? 0.22 : 0.32,
        arcRatio: 0.1,
      }));
      return;
    }
    if (event.type === 'damage_preview') {
      cues.push(createActionCue('damage_float', event, actor, target, {
        timeOffsetMs: 0,
        animationName: resolveBattleCueAnimationNameForUnit(actor, actor.role === 'back' ? 'skill' : 'attack'),
        advanceRatio: 0,
        arcRatio: 0.2,
      }));
      return;
    }
    if (event.type === 'hit_react') {
      cues.push(createActionCue('hit_float', event, actor, target, {
        timeOffsetMs: 0,
        animationName: 'hit',
        advanceRatio: 0,
        arcRatio: 0.12,
      }));
    }
  });
  return cues.sort((a, b) => a.timeMs - b.timeMs || a.eventSeq - b.eventSeq || a.kind.localeCompare(b.kind));
}

function createActionCueFromReplayAction(
  kind: Extract<BattleActionPresentationCueKind, 'melee_move' | 'basic_attack' | 'ranged_projectile'>,
  action: BattleReplayAction,
  timeMs: number,
  durationMs: number,
  animationName: string,
  advanceRatio: number,
  arcRatio: number,
): BattleActionPresentationCue {
  return {
    cueKey: `replay:${action.seq}:${kind}:${action.actor.unitKey}->${action.primaryTarget.unitKey}`,
    kind,
    eventSeq: action.sourceEventSeq,
    actionSeq: action.seq,
    timeMs,
    durationMs,
    round: action.round,
    actorKey: action.actor.unitKey,
    actorName: action.actor.displayName,
    actorRole: action.actor.role,
    actorSide: action.actor.side,
    targetKey: action.primaryTarget.unitKey,
    targetName: action.primaryTarget.displayName,
    targetRole: action.primaryTarget.role,
    targetSide: action.primaryTarget.side,
    displayValue: resolveCueDisplayValue(kind),
    label: kind === 'melee_move' ? `${action.actor.displayName} 接敌` : `${action.actor.displayName} 出手`,
    animationName,
    audioCue: kind === 'ranged_projectile' ? 'rangedAttack' : 'heroBasicAttack',
    advanceRatio,
    arcRatio,
    isCritical: false,
    hitKey: undefined,
    evaded: false,
  };
}

// 大额伤害飘字压缩显示(≥1 万显示为 x.x万),避免六位数数字铺满画面;血量扣减仍用精确数值。
function compressBattleDamageDisplay(displayValue: string): string {
  const match = `${displayValue ?? ''}`.replace(/,/g, '').match(/^(-?)(\d+)$/);
  if (!match) {
    return displayValue;
  }
  const numeric = Number(match[2]);
  if (!Number.isFinite(numeric) || numeric < 10_000) {
    return displayValue;
  }
  const wan = numeric / 10_000;
  const compact = wan >= 10 ? `${Math.round(wan)}` : `${Math.round(wan * 10) / 10}`;
  return `${match[1]}${compact}万`;
}

// 伤害飘字文案:闪避原样;真伤穿透标"穿透";命中克制区分方向——我方克敌标"克制"(增益),敌方克我方标"被克制"(警示);
// 连击首段标"连击xN"(其余段纯数字,避免刷屏)。
function resolveBattleHitDisplayValue(hit: BattleReplayHitEvent, actorSide: 'ally' | 'enemy'): string {
  const base = compressBattleDamageDisplay(hit.displayValue);
  if (hit.evaded) {
    return base;
  }
  if (hit.executed) {
    return `斩杀 ${base}`;
  }
  if (hit.splashHit) {
    return `溅射 ${base}`;
  }
  if (hit.frozeTarget === 'freeze') {
    return `冻结 ${base}`;
  }
  if (hit.frozeTarget === 'stun') {
    return `眩晕 ${base}`;
  }
  if (hit.pierced) {
    return `穿透 ${base}`;
  }
  if (hit.countered) {
    // 我方英雄克制怪物 → "克制";怪物克制我方英雄 → "被克制"(让玩家一眼看出克制伤害来自哪边)。
    return actorSide === 'ally' ? `克制 ${base}` : `被克制 ${base}`;
  }
  if (hit.comboCount > 1 && hit.comboIndex === 0) {
    return `连击x${hit.comboCount} ${base}`;
  }
  return base;
}

function createDamageCueFromReplayHit(action: BattleReplayAction, hit: BattleReplayHitEvent): BattleActionPresentationCue {
  const target = resolveReplayHitTargetUnit(action, hit);
  return {
    cueKey: `replay:${action.seq}:damage:${hit.hitKey}`,
    kind: 'damage_float',
    eventSeq: hit.eventSeq,
    actionSeq: action.seq,
    timeMs: hit.timeMs,
    durationMs: ACTION_CUE_WINDOWS.damage_float,
    round: action.round,
    actorKey: action.actor.unitKey,
    actorName: action.actor.displayName,
    actorRole: action.actor.role,
    actorSide: action.actor.side,
    targetKey: target.unitKey,
    targetName: target.displayName,
    targetRole: target.role,
    targetSide: target.side,
    displayValue: resolveBattleHitDisplayValue(hit, action.actor.side),
    label: `${target.displayName} 受击`,
    animationName: resolveBattleCueAnimationNameForUnit(action.actor, action.actionKind === 'ranged' ? 'skill' : 'attack'),
    audioCue: 'hitLight',
    advanceRatio: 0,
    arcRatio: 0.2,
    isCritical: hit.critical,
    hitKey: hit.hitKey,
    evaded: hit.evaded,
    lifestealHeal: hit.lifestealHeal,
    reflectDamage: hit.reflectDamage,
  };
}

function createHitCueFromReplayHit(action: BattleReplayAction, hit: BattleReplayHitEvent): BattleActionPresentationCue {
  const target = resolveReplayHitTargetUnit(action, hit);
  return {
    cueKey: `replay:${action.seq}:hit:${hit.hitKey}`,
    kind: 'hit_float',
    eventSeq: hit.eventSeq,
    actionSeq: action.seq,
    timeMs: hit.timeMs + 320,
    durationMs: ACTION_CUE_WINDOWS.hit_float,
    round: action.round,
    actorKey: target.unitKey,
    actorName: target.displayName,
    actorRole: target.role,
    actorSide: target.side,
    targetKey: action.actor.unitKey,
    targetName: action.actor.displayName,
    targetRole: action.actor.role,
    targetSide: action.actor.side,
    displayValue: hit.evaded ? '闪避' : hit.killed ? '击破' : '受击',
    label: hit.evaded ? `${target.displayName} 闪避` : hit.killed ? `${target.displayName} 倒下` : `${target.displayName} 硬直`,
    animationName: hit.killed ? 'dead' : 'hit',
    audioCue: 'hitLight',
    advanceRatio: 0,
    arcRatio: 0.12,
    isCritical: hit.critical,
    hitKey: hit.hitKey,
    evaded: hit.evaded,
  };
}

function resolveReplayHitTargetUnit(action: BattleReplayAction, hit: BattleReplayHitEvent): BattlePresentationUnitSnapshot {
  return hit.targetKey === action.primaryTarget.unitKey ? action.primaryTarget : action.primaryTarget;
}

export function resolveVisibleBattleActionPresentationCue(
  cues: BattleActionPresentationCue[],
  currentEvent: BattlePresentationTimelineEvent | null | undefined,
  playbackTimelineTimeMs?: number,
  timelineToPresentationRatio = 1,
): BattleActionPresentationCue | null {
  if (!currentEvent || cues.length === 0) {
    return null;
  }
  const preferred = resolvePreferredCueKinds(currentEvent.type);
  const timeMs = typeof playbackTimelineTimeMs === 'number' && Number.isFinite(playbackTimelineTimeMs)
    ? playbackTimelineTimeMs
    : null;
  const presentationRatio = Math.max(0.08, Math.min(1, timelineToPresentationRatio));
  const resolveTimelineWindowMs = (cue: BattleActionPresentationCue): number => resolveBattleActionCueVisibleWindowMs(cue) / presentationRatio;
  const leadWindowMs = Math.max(80, 80 / presentationRatio);
  if (timeMs !== null) {
    const activeByTime = cues
      .filter((cue) => cue.timeMs <= timeMs + resolveCueActivationLeadWindowMs(cue, leadWindowMs) && timeMs <= cue.timeMs + resolveTimelineWindowMs(cue));
    const activeDamage = activeByTime
      .filter((cue) => cue.kind === 'damage_float' && cue.timeMs <= timeMs)
      .sort((a, b) => {
        return b.timeMs - a.timeMs || a.eventSeq - b.eventSeq;
      });
    if (activeDamage.length > 0) {
      return activeDamage[0];
    }
    const sortedActiveByTime = activeByTime.sort((a, b) => {
      const aStarted = a.timeMs <= timeMs;
      const bStarted = b.timeMs <= timeMs;
      if (aStarted !== bStarted) {
        return aStarted ? -1 : 1;
      }
      const recencyDelta = b.timeMs - a.timeMs;
      const preferredDelta = preferred.indexOf(a.kind) - preferred.indexOf(b.kind);
      const distanceDelta = Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs);
      return recencyDelta || preferredDelta || distanceDelta || a.eventSeq - b.eventSeq;
    });
    if (sortedActiveByTime.length > 0) {
      return sortedActiveByTime[0];
    }
    if (currentEvent.type === 'action_start') {
      return null;
    }
  }
  const sameEvent = cues
    .filter((cue) => cue.eventSeq === currentEvent.seq)
    .sort((a, b) => preferred.indexOf(a.kind) - preferred.indexOf(b.kind) || a.timeMs - b.timeMs);
  if (sameEvent.length > 0) {
    return sameEvent[0];
  }
  const active = cues
    .filter((cue) => cue.timeMs <= currentEvent.timeMs + resolveCueActivationLeadWindowMs(cue, leadWindowMs) && currentEvent.timeMs <= cue.timeMs + resolveTimelineWindowMs(cue))
    .sort((a, b) => Math.abs(a.timeMs - currentEvent.timeMs) - Math.abs(b.timeMs - currentEvent.timeMs));
  return active[0] ?? null;
}

export function resolveBattleActionCueVisibleWindowMs(cue: BattleActionPresentationCue): number {
  return cue.durationMs + ACTION_CUE_VISIBLE_PADDING_MS[cue.kind];
}

function resolveCueActivationLeadWindowMs(cue: BattleActionPresentationCue, leadWindowMs: number): number {
  return cue.kind === 'melee_move' || cue.kind === 'ranged_projectile' ? leadWindowMs : 0;
}

function createActionCue(
  kind: BattleActionPresentationCueKind,
  event: BattlePresentationTimelineEvent,
  actor: BattlePresentationUnitSnapshot,
  target: BattlePresentationUnitSnapshot,
  options: {
    timeOffsetMs: number;
    animationName: string;
    advanceRatio: number;
    arcRatio: number;
  },
): BattleActionPresentationCue {
  const durationMs = ACTION_CUE_WINDOWS[kind];
  return {
    cueKey: `${event.seq}:${kind}:${actor.unitKey}->${target.unitKey}`,
    kind,
    eventSeq: event.seq,
    actionSeq: event.seq,
    timeMs: event.timeMs + options.timeOffsetMs,
    durationMs,
    round: event.round,
    actorKey: actor.unitKey,
    actorName: event.actorName || actor.displayName,
    actorRole: actor.role,
    actorSide: actor.side,
    targetKey: target.unitKey,
    targetName: event.targetName || target.displayName,
    targetRole: target.role,
    targetSide: target.side,
    displayValue: event.displayValue || resolveCueDisplayValue(kind),
    label: resolveCueLabel(kind, event, actor, target),
    animationName: options.animationName,
    audioCue: event.audioCue || resolveCueAudioCue(kind),
    advanceRatio: options.advanceRatio,
    arcRatio: options.arcRatio,
    isCritical: event.critical === true,
    hitKey: undefined,
    evaded: false,
  };
}

function createActionUnitMap(snapshot: BattlePresentationSnapshot): Map<string, BattlePresentationUnitSnapshot> {
  const map = new Map<string, BattlePresentationUnitSnapshot>();
  [...snapshot.allies, ...snapshot.enemies].forEach((unit) => {
    if (unit.power > 0 && !unit.unitKey.includes('empty')) {
      map.set(unit.unitKey, unit);
    }
  });
  return map;
}

function resolveActionUnit(
  units: Map<string, BattlePresentationUnitSnapshot>,
  unitKey: string | undefined,
): BattlePresentationUnitSnapshot | null {
  if (!unitKey) {
    return null;
  }
  return units.get(unitKey) ?? null;
}

function resolveBattleCueAnimationNameForUnit(unit: BattlePresentationUnitSnapshot, mode: 'attack' | 'skill'): string {
  return mode === 'skill'
    ? resolveBattleSkillAnimationName(unit)
    : resolveBattleBasicAttackAnimationName(unit);
}

function resolveBattleReplayActionAnimationName(action: BattleReplayAction): string {
  if (action.actor.side === 'enemy') {
    return 'attack';
  }
  if (action.actionKind === 'ranged') {
    return resolveBattleCueAnimationNameForUnit(action.actor, 'skill');
  }
  const tier = resolveBattleUnitSpineRarityTier(action.actor);
  if (tier === 'SSR' || tier === 'UR') {
    if (action.seq > 0 && action.seq % 7 === 0) {
      return 'ult';
    }
    if (action.seq > 0 && action.seq % 3 === 1) {
      return 'skill1';
    }
    return 'atk';
  }
  if (tier === 'SR' || tier === 'R') {
    if (action.seq > 0 && action.seq % 5 === 3) {
      return 'skill2';
    }
    if (action.seq > 0 && action.seq % 3 === 1) {
      return 'skill1';
    }
    return 'skill0';
  }
  return resolveBattleCueAnimationNameForUnit(action.actor, 'attack');
}

function resolveBattleBasicAttackAnimationName(unit: BattlePresentationUnitSnapshot): string {
  if (unit.side === 'enemy') {
    return 'attack';
  }
  const tier = resolveBattleUnitSpineRarityTier(unit);
  return tier === 'SR' || tier === 'R' ? 'skill0' : 'atk';
}

function resolveBattleSkillAnimationName(unit: BattlePresentationUnitSnapshot): string {
  if (unit.side === 'enemy') {
    return 'attack';
  }
  const tier = resolveBattleUnitSpineRarityTier(unit);
  return tier === 'SR' || tier === 'R' ? 'skill1' : 'skill1';
}

function resolvePreferredCueKinds(eventType: BattlePresentationTimelineEvent['type']): BattleActionPresentationCueKind[] {
  if (eventType === 'action_start') {
    return ['melee_move', 'ranged_projectile', 'basic_attack', 'damage_float', 'hit_float'];
  }
  if (eventType === 'damage_preview') {
    return ['damage_float', 'basic_attack', 'ranged_projectile', 'melee_move', 'hit_float'];
  }
  if (eventType === 'hit_react') {
    return ['hit_float', 'damage_float', 'basic_attack', 'ranged_projectile', 'melee_move'];
  }
  return ['melee_move', 'basic_attack', 'ranged_projectile', 'damage_float', 'hit_float'];
}

function resolveCueDisplayValue(kind: BattleActionPresentationCueKind): string {
  if (kind === 'hit_float') {
    return '受击';
  }
  if (kind === 'ranged_projectile') {
    return '弹道';
  }
  if (kind === 'melee_move') {
    return '接敌';
  }
  if (kind === 'basic_attack') {
    return '普攻';
  }
  return '-';
}

function resolveCueLabel(
  kind: BattleActionPresentationCueKind,
  event: BattlePresentationTimelineEvent,
  actor: BattlePresentationUnitSnapshot,
  target: BattlePresentationUnitSnapshot,
): string {
  if (kind === 'damage_float') {
    return event.label || `${target.displayName} 伤害飘字`;
  }
  if (kind === 'hit_float') {
    return `${actor.displayName} 受击飘字`;
  }
  if (kind === 'ranged_projectile') {
    return event.label || '远程弹道';
  }
  if (kind === 'melee_move') {
    return event.label || '近战移动';
  }
  return event.label || '普攻';
}

function resolveCueAudioCue(kind: BattleActionPresentationCueKind): string {
  if (kind === 'damage_float' || kind === 'hit_float') {
    return 'hitLight';
  }
  if (kind === 'ranged_projectile') {
    return 'rangedAttack';
  }
  return 'heroBasicAttack';
}
