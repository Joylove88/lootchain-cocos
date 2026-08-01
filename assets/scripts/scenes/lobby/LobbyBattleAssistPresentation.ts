import type { BattlePresentationSnapshot, BattlePresentationUnitRole, BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import type { BattlePresentationTimeline, BattlePresentationTimelineEvent } from './LobbyBattlePresentationTimeline';

export type BattleAssistPresentationCueKind =
  | 'skill_cast'
  | 'heal_float'
  | 'shield_float'
  | 'buff_float'
  | 'debuff_float';

export interface BattleAssistPresentationCue {
  cueKey: string;
  kind: BattleAssistPresentationCueKind;
  eventSeq: number;
  timeMs: number;
  durationMs: number;
  round: number;
  sourceKey: string;
  sourceName: string;
  sourceRole: BattlePresentationUnitRole;
  sourceSide: 'ally' | 'enemy';
  targetKey: string;
  targetName: string;
  targetRole: BattlePresentationUnitRole;
  targetSide: 'ally' | 'enemy';
  displayValue: string;
  label: string;
  animationName: string;
  audioCue: string;
  iconType: 'heal' | 'shield' | 'buff' | 'debuff' | 'skill';
}

const ASSIST_CUE_WINDOWS: Record<BattleAssistPresentationCueKind, number> = {
  skill_cast: 620,
  heal_float: 880,
  shield_float: 860,
  buff_float: 900,
  debuff_float: 900,
};

export function resolveBattleAssistPresentationCues(
  timeline: BattlePresentationTimeline,
  snapshot: BattlePresentationSnapshot,
): BattleAssistPresentationCue[] {
  const units = createAssistUnitMap(snapshot);
  const sourceFallback = findAssistSource(snapshot);
  const allyGuard = findLeadAssistAlly(snapshot);
  const allyHurt = findLowestHpAlly(snapshot);
  const cues: BattleAssistPresentationCue[] = [];

  timeline.events.forEach((event) => {
    if (event.type !== 'buff_preview') {
      return;
    }
    const source = resolveAssistUnit(units, event.actorKey) ?? sourceFallback;
    const eventTarget = resolveAssistUnit(units, event.targetKey);
    const buffTarget = eventTarget?.side === 'ally' ? eventTarget : allyGuard;
    const primaryEffectKind: BattleAssistPresentationCueKind = event.displayValue?.includes('DEF') ? 'shield_float' : event.displayValue?.startsWith('+') ? 'buff_float' : 'heal_float';
    const primaryTarget = primaryEffectKind === 'heal_float'
      ? allyHurt ?? buffTarget
      : primaryEffectKind === 'shield_float'
        ? allyGuard
        : buffTarget;
    const primaryDisplayValue = primaryEffectKind === 'heal_float'
      ? `+${formatAssistNumber(source.power, primaryTarget.power, 0.38)}`
      : primaryEffectKind === 'shield_float'
        ? `护盾 +${formatAssistNumber(source.power, primaryTarget.power, 0.26)}`
        : event.displayValue || '+ATK';
    const primaryLabel = primaryEffectKind === 'heal_float'
      ? `${source.displayName} 治疗 ${primaryTarget.displayName}`
      : primaryEffectKind === 'shield_float'
        ? `${primaryTarget.displayName} 获得护盾`
        : `${primaryTarget.displayName} 获得增益`;
    const primaryAnimation = primaryEffectKind === 'heal_float'
      ? 'heal'
      : primaryEffectKind === 'shield_float'
        ? 'shield'
        : resolveBattleAssistAnimationNameForUnit(source);
    const primaryAudio = primaryEffectKind === 'heal_float'
      ? 'healCast'
      : event.audioCue || 'buffApply';
    const primaryIconType = primaryEffectKind === 'heal_float'
      ? 'heal'
      : primaryEffectKind === 'shield_float'
        ? 'shield'
        : 'buff';

    cues.push(createAssistCue('skill_cast', event, source, buffTarget, timeline.durationMs, {
      timeOffsetMs: 0,
      displayValue: '技能',
      label: event.label || `${source.displayName} 释放技能`,
      animationName: resolveBattleAssistAnimationNameForUnit(source),
      audioCue: event.audioCue || 'heroSkill',
      iconType: 'skill',
    }));
    cues.push(createAssistCue(primaryEffectKind, event, source, primaryTarget, timeline.durationMs, {
      timeOffsetMs: 260,
      displayValue: primaryDisplayValue,
      label: primaryLabel,
      animationName: primaryAnimation,
      audioCue: primaryAudio,
      iconType: primaryIconType,
    }));
  });

  return cues.sort((a, b) => a.timeMs - b.timeMs || a.eventSeq - b.eventSeq || a.kind.localeCompare(b.kind));
}

export function resolveVisibleBattleAssistPresentationCue(
  cues: BattleAssistPresentationCue[],
  currentEvent: BattlePresentationTimelineEvent | null | undefined,
  playbackTimelineTimeMs?: number,
): BattleAssistPresentationCue | null {
  if (!currentEvent || cues.length === 0) {
    return null;
  }
  const preferred = resolvePreferredAssistCueKinds(currentEvent.type);
  const timeMs = typeof playbackTimelineTimeMs === 'number' && Number.isFinite(playbackTimelineTimeMs)
    ? playbackTimelineTimeMs
    : null;
  if (timeMs !== null) {
    const activeByTime = cues
      .filter((cue) => cue.timeMs <= timeMs + 120 && timeMs <= cue.timeMs + cue.durationMs + 220)
      .sort((a, b) => {
        const preferredDelta = preferred.indexOf(a.kind) - preferred.indexOf(b.kind);
        const distanceDelta = Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs);
        return distanceDelta || preferredDelta || b.timeMs - a.timeMs || a.eventSeq - b.eventSeq;
      });
    if (activeByTime.length > 0) {
      return activeByTime[0];
    }
  }
  const sameEvent = cues
    .filter((cue) => cue.eventSeq === currentEvent.seq)
    .sort((a, b) => preferred.indexOf(a.kind) - preferred.indexOf(b.kind) || a.timeMs - b.timeMs);
  if (sameEvent.length > 0) {
    return sameEvent[0];
  }
  const active = cues
    .filter((cue) => cue.timeMs <= currentEvent.timeMs + 120 && currentEvent.timeMs <= cue.timeMs + cue.durationMs + 220)
    .sort((a, b) => Math.abs(a.timeMs - currentEvent.timeMs) - Math.abs(b.timeMs - currentEvent.timeMs));
  return active[0] ?? null;
}

function createAssistCue(
  kind: BattleAssistPresentationCueKind,
  event: BattlePresentationTimelineEvent,
  source: BattlePresentationUnitSnapshot,
  target: BattlePresentationUnitSnapshot,
  maxTimeMs: number,
  options: {
    timeOffsetMs: number;
    displayValue: string;
    label: string;
    animationName: string;
    audioCue: string;
    iconType: BattleAssistPresentationCue['iconType'];
  },
): BattleAssistPresentationCue {
  return {
    cueKey: `${event.seq}:${kind}:${source.unitKey}->${target.unitKey}`,
    kind,
    eventSeq: event.seq,
    timeMs: clamp(event.timeMs + options.timeOffsetMs, 0, maxTimeMs),
    durationMs: ASSIST_CUE_WINDOWS[kind],
    round: event.round,
    sourceKey: source.unitKey,
    sourceName: event.actorName || source.displayName,
    sourceRole: source.role,
    sourceSide: source.side,
    targetKey: target.unitKey,
    targetName: target.displayName,
    targetRole: target.role,
    targetSide: target.side,
    displayValue: options.displayValue,
    label: options.label,
    animationName: options.animationName,
    audioCue: options.audioCue,
    iconType: options.iconType,
  };
}

function createAssistUnitMap(snapshot: BattlePresentationSnapshot): Map<string, BattlePresentationUnitSnapshot> {
  const map = new Map<string, BattlePresentationUnitSnapshot>();
  [...snapshot.allies, ...snapshot.enemies].forEach((unit) => {
    if (unit.power > 0 && !unit.unitKey.includes('empty')) {
      map.set(unit.unitKey, unit);
    }
  });
  return map;
}

function resolveAssistUnit(
  units: Map<string, BattlePresentationUnitSnapshot>,
  unitKey: string | undefined,
): BattlePresentationUnitSnapshot | null {
  if (!unitKey) {
    return null;
  }
  return units.get(unitKey) ?? null;
}

function resolveBattleAssistAnimationNameForUnit(unit: BattlePresentationUnitSnapshot): string {
  if (unit.side === 'enemy') {
    return 'attack';
  }
  return 'skill1';
}

function findAssistSource(snapshot: BattlePresentationSnapshot): BattlePresentationUnitSnapshot {
  return snapshot.allies.find((unit) => isUsableAssistUnit(unit) && unit.role === 'back')
    ?? snapshot.allies.find((unit) => isUsableAssistUnit(unit) && unit.heroClass?.toLowerCase().includes('support'))
    ?? findLeadAssistAlly(snapshot);
}

function findLeadAssistAlly(snapshot: BattlePresentationSnapshot): BattlePresentationUnitSnapshot {
  return snapshot.allies.find((unit) => isUsableAssistUnit(unit) && unit.leader)
    ?? snapshot.allies.find(isUsableAssistUnit)
    ?? snapshot.leadAlly;
}

function findLowestHpAlly(snapshot: BattlePresentationSnapshot): BattlePresentationUnitSnapshot {
  return snapshot.allies
    .filter(isUsableAssistUnit)
    .sort((a, b) => a.hpRatio - b.hpRatio || b.power - a.power)[0]
    ?? findLeadAssistAlly(snapshot);
}

function isUsableAssistUnit(unit: BattlePresentationUnitSnapshot): boolean {
  return unit.power > 0 && !unit.unitKey.includes('empty');
}

function resolvePreferredAssistCueKinds(eventType: BattlePresentationTimelineEvent['type']): BattleAssistPresentationCueKind[] {
  if (eventType === 'buff_preview') {
    return ['skill_cast', 'heal_float', 'shield_float', 'buff_float', 'debuff_float'];
  }
  return ['skill_cast', 'buff_float', 'shield_float', 'heal_float', 'debuff_float'];
}

function formatAssistNumber(sourcePower: number, targetPower: number, multiplier: number): string {
  const base = Math.max(80, sourcePower * 0.055 + targetPower * 0.018);
  return Math.max(1, Math.round(base * multiplier)).toLocaleString('en-US');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
