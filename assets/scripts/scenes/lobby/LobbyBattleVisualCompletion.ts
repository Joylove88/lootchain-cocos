import type { BattlePresentationHpState } from './LobbyBattlePresentationHp';
import type { BattlePresentationSnapshot } from './LobbyBattlePresentationSnapshot';
import type { BattlePresentationTimeline } from './LobbyBattlePresentationTimeline';
import {
  LOBBY_BATTLE_COMBAT_START_STEP,
  LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS,
} from './LobbyBattleState';
import { resolveBattleReplay } from './LobbyBattleReplayModel';

const BATTLE_VISUAL_RESULT_READY_DELAY_MS = 420;
const BATTLE_VISUAL_MIN_TOTAL_DURATION_MS = 18_000;
// 战斗倒计时上限 90 秒：opening(9 步 × 250ms = 2250ms) + 90_000ms。数值推演提前打完则提前进入胜利结算。
const BATTLE_VISUAL_MAX_TOTAL_DURATION_MS = 92_250;

export function resolveLobbyBattleVisualCompletionDurationMs(
  snapshot: BattlePresentationSnapshot,
  timeline: BattlePresentationTimeline,
): number {
  const replay = resolveBattleReplay(snapshot, timeline);
  const units = [...replay.units.values()];
  const firstAction = timeline.events.find((event) => event.type === 'action_start') ?? timeline.currentEvent;
  const combatStartPresentationMs = LOBBY_BATTLE_COMBAT_START_STEP * LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS;
  // 一方全灭即战斗结束:敌全灭=胜、我全灭=败。取先被全灭那一方的最后死亡时间收口演出,
  // 战败也要及时结束(不再拖满 92 秒),避免死亡英雄久留/复活再战。
  const enemyAllDeadMs = sideAllDeadMs(units, 'enemy');
  const allyAllDeadMs = sideAllDeadMs(units, 'ally');
  const decisiveDeaths = [enemyAllDeadMs, allyAllDeadMs].filter((value): value is number => value !== null);
  if (decisiveDeaths.length <= 0) {
    return BATTLE_VISUAL_MAX_TOTAL_DURATION_MS;
  }
  const readyTimelineMs = Math.max(replay.battleEndMs, Math.min(...decisiveDeaths) + BATTLE_VISUAL_RESULT_READY_DELAY_MS);
  const totalMs = combatStartPresentationMs + Math.max(0, readyTimelineMs - firstAction.timeMs);
  return clamp(totalMs, BATTLE_VISUAL_MIN_TOTAL_DURATION_MS, BATTLE_VISUAL_MAX_TOTAL_DURATION_MS);
}

// 某一方是否全部阵亡;是则返回该方最后死亡时间(用于收口时机),否则 null。
function sideAllDeadMs(units: { side: 'ally' | 'enemy'; deadAtMs: number | null }[], side: 'ally' | 'enemy'): number | null {
  const list = units.filter((unit) => unit.side === side);
  if (list.length <= 0) {
    return null;
  }
  const deaths = list
    .map((unit) => unit.deadAtMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (deaths.length < list.length) {
    return null;
  }
  return Math.max(...deaths);
}

// 战斗视觉胜负结果:敌全灭=胜、我全灭=败、尚未分出=null。用于收口演出与结算提交真实结果。
export function resolveBattleVisualOutcome(
  hpState: BattlePresentationHpState,
  playbackTimelineTimeMs: number,
): 'victory' | 'defeat' | null {
  const sideWipedOut = (side: 'ally' | 'enemy'): boolean => {
    const list = [...hpState.units.values()].filter((unit) => unit.side === side);
    if (list.length <= 0) {
      return false;
    }
    return list.every((unit) =>
      unit.dead === true
      && unit.currentHp <= 0
      && unit.hpRatio <= 0.001
      && typeof unit.deadAtMs === 'number'
      && Number.isFinite(unit.deadAtMs)
      && playbackTimelineTimeMs >= (unit.deadAtMs as number) + BATTLE_VISUAL_RESULT_READY_DELAY_MS);
  };
  if (sideWipedOut('enemy')) {
    return 'victory';
  }
  if (sideWipedOut('ally')) {
    return 'defeat';
  }
  return null;
}

export function isBattleVisualResultReady(
  hpState: BattlePresentationHpState,
  playbackTimelineTimeMs: number,
): boolean {
  return resolveBattleVisualOutcome(hpState, playbackTimelineTimeMs) !== null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
