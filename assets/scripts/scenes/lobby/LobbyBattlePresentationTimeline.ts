import type { BattlePresentationSnapshot, BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';

export type BattlePresentationEventType =
  | 'battle_start'
  | 'unit_spawn'
  | 'round_start'
  | 'action_start'
  | 'idle'
  | 'target_mark'
  | 'damage_preview'
  | 'hit_react'
  | 'buff_preview'
  | 'round_end'
  | 'battle_end';

export interface BattlePresentationTimelineEvent {
  seq: number;
  timeMs: number;
  type: BattlePresentationEventType;
  round: number;
  actorKey?: string;
  actorName?: string;
  targetKey?: string;
  targetName?: string;
  label: string;
  displayValue?: string;
  animationName?: string;
  audioCue?: string;
  critical?: boolean;
}

export interface BattlePresentationTimeline {
  timelineKey: string;
  durationMs: number;
  rounds: number;
  events: BattlePresentationTimelineEvent[];
  currentEvent: BattlePresentationTimelineEvent;
  damagePreviewEvent: BattlePresentationTimelineEvent;
  buffPreviewEvent: BattlePresentationTimelineEvent;
}

const MIN_TIMELINE_DURATION_MS = 45_000;
const MAX_TIMELINE_DURATION_MS = 60_000;
const TIMELINE_ROUNDS = 3;

export function resolveLobbyBattlePresentationTimeline(snapshot: BattlePresentationSnapshot): BattlePresentationTimeline {
  const seed = createTimelineSeed(snapshot.unitSnapshotKey);
  const random = nextDeterministicTimelineFloat(seed);
  const events: BattlePresentationTimelineEvent[] = [];
  let seq = 0;
  const durationMs = MIN_TIMELINE_DURATION_MS + Math.floor(random() * (MAX_TIMELINE_DURATION_MS - MIN_TIMELINE_DURATION_MS + 1));
  const allies = normalizeTimelineUnits(snapshot.allies, 'ally');
  const enemies = normalizeTimelineUnits(snapshot.enemies, 'enemy');
  const leadAlly = allies[0];
  const leadEnemy = enemies[0];
  const addEvent = (event: Omit<BattlePresentationTimelineEvent, 'seq'>): BattlePresentationTimelineEvent => {
    const next = { ...event, seq };
    seq += 1;
    events.push(next);
    return next;
  };

  addEvent({
    timeMs: 0,
    type: 'battle_start',
    round: 0,
    actorKey: leadAlly.unitKey,
    actorName: leadAlly.displayName,
    targetKey: leadEnemy.unitKey,
    targetName: leadEnemy.displayName,
    label: `${snapshot.stageCode} 开战`,
    animationName: 'idle',
  });

  [...allies, ...enemies].forEach((unit, index) => {
    addEvent({
      timeMs: 280 + index * 90,
      type: 'unit_spawn',
      round: 0,
      actorKey: unit.unitKey,
      actorName: unit.displayName,
      label: `${unit.displayName} 入场`,
      animationName: 'idle',
    });
  });

  const usableDuration = Math.max(1, durationMs - 5_800);
  const roundSlice = Math.floor(usableDuration / TIMELINE_ROUNDS);
  let firstDamageEvent: BattlePresentationTimelineEvent | null = null;
  let firstBuffEvent: BattlePresentationTimelineEvent | null = null;

  for (let round = 1; round <= TIMELINE_ROUNDS; round += 1) {
    const roundStart = 1_500 + (round - 1) * roundSlice;
    const actor = pickRoundAllyActor(allies, round, random);
    const target = pickUnit(enemies, round + 1, random);
    const enemyCounter = pickUnit(enemies, round + 2, random);
    const guardTarget = pickUnit(allies, round + 3, random);
    const actorValue = resolvePreviewNumber(actor.attack ?? 0, actor.power, target.power, round, random);
    const counterValue = resolvePreviewNumber(enemyCounter.attack ?? 0, enemyCounter.power, guardTarget.power, round, random, 0.46);
    const actorCritical = round === 1 || random() > 0.76;
    const counterCritical = round === 2 && random() > 0.68;

    addEvent({
      timeMs: roundStart,
      type: 'round_start',
      round,
      actorKey: actor.unitKey,
      actorName: actor.displayName,
      label: round === 1 ? '双方接战' : `阵线推进 ${round}`,
      animationName: 'idle',
    });
    addEvent({
      timeMs: roundStart + 620,
      type: 'action_start',
      round,
      actorKey: actor.unitKey,
      actorName: actor.displayName,
      targetKey: target.unitKey,
      targetName: target.displayName,
      label: `${actor.displayName} 出手`,
      animationName: actor.role === 'back' ? 'skill_01' : 'attack_01',
      audioCue: actor.role === 'back' ? 'heroSkill' : 'heroBasicAttack',
    });
    addEvent({
      timeMs: roundStart + 1_220,
      type: 'target_mark',
      round,
      actorKey: actor.unitKey,
      actorName: actor.displayName,
      targetKey: target.unitKey,
      targetName: target.displayName,
      label: `锁定 ${target.displayName}`,
    });
    const damageEvent = addEvent({
      timeMs: roundStart + 3_900,
      type: 'damage_preview',
      round,
      actorKey: actor.unitKey,
      actorName: actor.displayName,
      targetKey: target.unitKey,
      targetName: target.displayName,
      label: `${target.displayName} 受击`,
      displayValue: `-${formatTimelineNumber(actorValue)}`,
      animationName: 'attack_01',
      audioCue: 'hitLight',
      critical: actorCritical,
    });
    firstDamageEvent ??= damageEvent;
    addEvent({
      timeMs: roundStart + 4_250,
      type: 'hit_react',
      round,
      actorKey: target.unitKey,
      actorName: target.displayName,
      targetKey: actor.unitKey,
      targetName: actor.displayName,
      label: `${target.displayName} 硬直`,
      animationName: 'hit',
    });
    if (round === 2 || (round === 1 && actor.role === 'back')) {
      const buffActor = allies.find((unit) => unit.role === 'back') ?? actor;
      const buffEvent = addEvent({
        timeMs: roundStart + 2_520,
        type: 'buff_preview',
        round,
        actorKey: buffActor.unitKey,
        actorName: buffActor.displayName,
        targetKey: leadAlly.unitKey,
        targetName: leadAlly.displayName,
        label: `${buffActor.displayName} 支援队伍`,
        displayValue: '+ATK',
        animationName: 'skill_01',
        audioCue: 'buffApply',
      });
      firstBuffEvent ??= buffEvent;
    }
    addEvent({
      timeMs: roundStart + 5_400,
      type: 'action_start',
      round,
      actorKey: enemyCounter.unitKey,
      actorName: enemyCounter.displayName,
      targetKey: guardTarget.unitKey,
      targetName: guardTarget.displayName,
      label: `${enemyCounter.displayName} 反击`,
      animationName: enemyCounter.role === 'back' ? 'skill_01' : 'attack_01',
      audioCue: enemyCounter.role === 'back' ? 'heroSkill' : 'heroBasicAttack',
    });
    addEvent({
      timeMs: roundStart + 6_050,
      type: 'damage_preview',
      round,
      actorKey: enemyCounter.unitKey,
      actorName: enemyCounter.displayName,
      targetKey: guardTarget.unitKey,
      targetName: guardTarget.displayName,
      label: `${guardTarget.displayName} 格挡`,
      displayValue: `-${formatTimelineNumber(counterValue)}`,
      animationName: 'hit',
      audioCue: 'hitLight',
      critical: counterCritical,
    });
    addEvent({
      timeMs: roundStart + roundSlice - 420,
      type: 'round_end',
      round,
      actorKey: actor.unitKey,
      actorName: actor.displayName,
      targetKey: target.unitKey,
      targetName: target.displayName,
      label: `阵线推进 ${round} 完成`,
      animationName: 'idle',
    });
  }

  const fallbackBuff = firstBuffEvent ?? addEvent({
    timeMs: Math.max(3_000, Math.floor(durationMs * 0.48)),
    type: 'buff_preview',
    round: 2,
    actorKey: leadAlly.unitKey,
    actorName: leadAlly.displayName,
    targetKey: leadAlly.unitKey,
    targetName: leadAlly.displayName,
    label: `${leadAlly.displayName} 稳住阵线`,
    displayValue: '+DEF',
    animationName: 'skill_01',
    audioCue: 'buffApply',
  });

  addEvent({
    timeMs: durationMs,
    type: 'battle_end',
    round: TIMELINE_ROUNDS,
    actorKey: leadAlly.unitKey,
    actorName: leadAlly.displayName,
    targetKey: leadEnemy.unitKey,
    targetName: leadEnemy.displayName,
    label: '本地演出结束',
    animationName: 'victory',
  });

  events.sort((a, b) => a.timeMs - b.timeMs || a.seq - b.seq);
  const currentEvent = events.find((event) => event.type === 'action_start' && event.round === 1) ?? events[0];
  const damagePreviewEvent = firstDamageEvent ?? events.find((event) => event.type === 'damage_preview') ?? currentEvent;
  const buffPreviewEvent = fallbackBuff;
  const timelineKey = createTimelineKey(seed, durationMs, events.length);

  return {
    timelineKey,
    durationMs,
    rounds: TIMELINE_ROUNDS,
    events,
    currentEvent,
    damagePreviewEvent,
    buffPreviewEvent,
  };
}

export function createTimelineSeed(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function nextDeterministicTimelineFloat(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function normalizeTimelineUnits(units: BattlePresentationUnitSnapshot[], side: 'ally' | 'enemy'): BattlePresentationUnitSnapshot[] {
  const usable = units.filter((unit) => unit.side === side && unit.power > 0 && !unit.unitKey.includes('empty'));
  if (usable.length > 0) {
    return usable;
  }
  const fallback = units.filter((unit) => unit.side === side).slice(0, 1);
  if (fallback.length > 0) {
    return fallback;
  }
  return [createFallbackTimelineUnit(side)];
}

function createFallbackTimelineUnit(side: 'ally' | 'enemy'): BattlePresentationUnitSnapshot {
  return {
    unitKey: `${side}-timeline-fallback`,
    side,
    slot: 0,
    displayName: side === 'ally' ? '我方单位' : '敌方单位',
    subline: 'Lv.1 / 预演',
    rarity: 'N',
    level: 1,
    power: 1,
    role: 'front',
    leader: side === 'ally',
    hpRatio: 0.72,
  };
}

function pickUnit(units: BattlePresentationUnitSnapshot[], offset: number, random: () => number): BattlePresentationUnitSnapshot {
  const index = Math.abs(Math.floor(random() * units.length) + offset) % units.length;
  return units[index];
}

function pickRoundAllyActor(units: BattlePresentationUnitSnapshot[], round: number, random: () => number): BattlePresentationUnitSnapshot {
  if (round === 1) {
    const frontSrRActHero = units.find(isFrontSrRActBattleHero);
    if (frontSrRActHero) {
      return frontSrRActHero;
    }
    const frontHero = units.find((unit) => unit.role === 'front');
    if (frontHero) {
      return frontHero;
    }
    return pickUnit(units, round, random);
  }
  // 横版 RPG 化：让不同回合由不同的近战(front)英雄跑位接战，而不是整场只有同一个英雄冲锋、其余站桩。
  // 关键：先按原逻辑消费同一随机序列（fallback），保持目标/反击/暴击等下游确定性与几何完全不变——
  // 因此换出手者后仍以同一个可达目标为锚，近战仍能跑到目标面前贴脸命中，只是换成不同英雄出手。
  const fallback = pickUnit(units, round, random);
  const frontMelee = units.filter((unit) => unit.role === 'front');
  const round1Actor = units.find(isFrontSrRActBattleHero) ?? frontMelee[0];
  const rotation = frontMelee.filter((unit) => unit.unitKey !== round1Actor?.unitKey);
  return rotation.length > 0 ? rotation[(round - 2) % rotation.length] : fallback;
}

function isFrontSrRActBattleHero(unit: BattlePresentationUnitSnapshot): boolean {
  const rarity = (unit.rarity || '').trim().toUpperCase();
  const portraitAsset = (unit.portraitAsset || '').trim();
  return unit.side === 'ally'
    && unit.role === 'front'
    && (rarity === 'SR' || rarity === 'R')
    && portraitAsset.startsWith('act_');
}

// 伤害飘字改攻击力驱动(2026-07-09 数值重设计):有效攻击已含等级/星系数,故不再叠加等级项。
// 英雄(有攻击)按攻击力算 → 1 级几十、终盘几千~几万,可读且不膨胀;敌方/占位无攻击时按 power 兜底压小。
function resolvePreviewNumber(
  actorAttack: number,
  actorPower: number,
  targetPower: number,
  round: number,
  random: () => number,
  multiplier = 1,
): number {
  const base = actorAttack > 0
    ? actorAttack * (0.92 + round * 0.06)
    : Math.max(6, actorPower * 0.02 + round * 4);
  const targetGuard = Math.max(0.72, Math.min(1.18, 1 - targetPower / Math.max(1, actorPower + targetPower) * 0.28));
  const variance = 0.82 + random() * 0.36;
  return Math.max(1, Math.round(base * targetGuard * variance * multiplier));
}

function formatTimelineNumber(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString('en-US');
}

function createTimelineKey(seed: number, durationMs: number, eventCount: number): string {
  return `${seed.toString(16).padStart(8, '0')}-${durationMs}-${eventCount}`;
}
