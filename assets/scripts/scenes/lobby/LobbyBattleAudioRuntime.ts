import type { LobbyBattlePanelState } from './LobbyBattleState';
import type { LobbyBattlePresentationState } from './LobbyBattlePresentationState';
import type { BattlePresentationSnapshot, BattlePresentationStage2AudioCues } from './LobbyBattlePresentationSnapshot';
import type { BattlePresentationTimelineEvent } from './LobbyBattlePresentationTimeline';
import type { BattleActionPresentationCue } from './LobbyBattleActionPresentation';
import type { BattleAssistPresentationCue } from './LobbyBattleAssistPresentation';

export type BattleAudioCueKey =
  | 'battleBgm'
  | 'battleStart'
  | 'heroBasicAttack'
  | 'rangedAttack'
  | 'hitLight'
  | 'heroSkill'
  | 'healCast'
  | 'buffApply'
  | 'resultWin'
  | 'resultLose';

export interface BattleAudioCuePlan {
  cueKey: BattleAudioCueKey;
  resourcePath: string;
  volume: number;
  loop: boolean;
  playKey: string;
  label: string;
}

export interface BattleAudioRuntimePlan {
  planKey: string;
  statusText: string;
  boundaryText: string;
  bgm: BattleAudioCuePlan | null;
  oneShot: BattleAudioCuePlan | null;
  activeCueKey: BattleAudioCueKey | null;
}

export const BATTLE_AUDIO_CUE_DEFAULT_VOLUMES: Record<BattleAudioCueKey, number> = {
  battleBgm: 0.2,
  battleStart: 0.72,
  heroBasicAttack: 0.48,
  rangedAttack: 0.45,
  hitLight: 0.42,
  heroSkill: 0.54,
  healCast: 0.5,
  buffApply: 0.46,
  resultWin: 0.62,
  resultLose: 0.58,
};

const AUDIO_BOUNDARY_TEXT = '纯表现音频：不改变 start/settle、奖励、体力、进度或背包。';

export function resolveBattleAudioRuntimePlan(
  state: LobbyBattlePanelState,
  presentation: LobbyBattlePresentationState,
  snapshot: BattlePresentationSnapshot,
  currentEvent: Pick<BattlePresentationTimelineEvent, 'seq' | 'type' | 'audioCue'> | null | undefined,
  currentActionCue: Pick<BattleActionPresentationCue, 'cueKey' | 'audioCue'> | null | undefined,
  currentAssistCue: Pick<BattleAssistPresentationCue, 'cueKey' | 'audioCue'> | null | undefined,
): BattleAudioRuntimePlan {
  const cues = snapshot.stage2AudioCues;
  const scopeKey = `${snapshot.stageCode}:${snapshot.battleNo || state.start?.battleNo || 'pending'}:${presentation.phase}:${state.presentationStep}`;
  const bgm = createCuePlan('battleBgm', cues, `${scopeKey}:bgm`, true);
  const oneShot = resolveOneShotCuePlan(state, presentation, cues, scopeKey, currentEvent, currentActionCue, currentAssistCue);
  const activeCueKey = oneShot?.cueKey ?? null;
  const statusText = formatAudioStatusText(bgm, oneShot, presentation.phase);

  return {
    planKey: `${scopeKey}:${activeCueKey ?? 'ambient'}`,
    statusText,
    boundaryText: AUDIO_BOUNDARY_TEXT,
    bgm,
    oneShot,
    activeCueKey,
  };
}

export function resolveBattleAudioCueResource(
  cues: BattlePresentationStage2AudioCues,
  cueKey: string | null | undefined,
): string | null {
  if (!cueKey || !isBattleAudioCueKey(cueKey)) {
    return null;
  }
  const value = cues[cueKey];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveBattleAudioCueVolume(cueKey: string | null | undefined): number {
  if (!cueKey || !isBattleAudioCueKey(cueKey)) {
    return 0;
  }
  return BATTLE_AUDIO_CUE_DEFAULT_VOLUMES[cueKey];
}

function resolveOneShotCuePlan(
  state: LobbyBattlePanelState,
  presentation: LobbyBattlePresentationState,
  cues: BattlePresentationStage2AudioCues,
  scopeKey: string,
  currentEvent: Pick<BattlePresentationTimelineEvent, 'seq' | 'type' | 'audioCue'> | null | undefined,
  currentActionCue: Pick<BattleActionPresentationCue, 'cueKey' | 'audioCue'> | null | undefined,
  currentAssistCue: Pick<BattleAssistPresentationCue, 'cueKey' | 'audioCue'> | null | undefined,
): BattleAudioCuePlan | null {
  if (presentation.phase === 'creatingSession' || state.starting) {
    return createCuePlan('battleStart', cues, `${scopeKey}:battleStart`, false);
  }
  if (presentation.phase === 'resultRecorded' && state.settlement) {
    const result = String(state.settlement.result || '').toUpperCase();
    return createCuePlan(result === 'LOSE' ? 'resultLose' : 'resultWin', cues, `${state.settlement.settlementNo}:result`, false);
  }
  if (presentation.phase === 'roundPlaying' && state.start && state.presentationComplete && !state.settlement) {
    return createCuePlan('resultWin', cues, `${scopeKey}:visualVictory`, false);
  }
  if (presentation.phase !== 'roundPlaying') {
    return null;
  }
  const assistCue = normalizeCueKey(currentAssistCue?.audioCue);
  if (assistCue) {
    return createCuePlan(assistCue, cues, `${scopeKey}:assist:${currentAssistCue?.cueKey ?? currentEvent?.seq ?? 'current'}`, false);
  }
  const actionCue = normalizeCueKey(currentActionCue?.audioCue);
  if (actionCue) {
    return createCuePlan(actionCue, cues, `${scopeKey}:action:${currentActionCue?.cueKey ?? currentEvent?.seq ?? 'current'}`, false);
  }
  const eventCue = normalizeCueKey(currentEvent?.audioCue);
  if (eventCue) {
    return createCuePlan(eventCue, cues, `${scopeKey}:event:${currentEvent?.seq ?? currentEvent?.type ?? 'current'}`, false);
  }
  return null;
}

function createCuePlan(
  cueKey: BattleAudioCueKey,
  cues: BattlePresentationStage2AudioCues,
  playKey: string,
  loop: boolean,
): BattleAudioCuePlan | null {
  const resourcePath = resolveBattleAudioCueResource(cues, cueKey);
  if (!resourcePath) {
    return null;
  }
  return {
    cueKey,
    resourcePath,
    volume: resolveBattleAudioCueVolume(cueKey),
    loop,
    playKey,
    label: resolveCueLabel(cueKey),
  };
}

function normalizeCueKey(value: string | null | undefined): BattleAudioCueKey | null {
  if (!value || !isBattleAudioCueKey(value)) {
    return null;
  }
  return value;
}

function isBattleAudioCueKey(value: string): value is BattleAudioCueKey {
  return [
    'battleBgm',
    'battleStart',
    'heroBasicAttack',
    'rangedAttack',
    'hitLight',
    'heroSkill',
    'healCast',
    'buffApply',
    'resultWin',
    'resultLose',
  ].includes(value);
}

function formatAudioStatusText(bgm: BattleAudioCuePlan | null, oneShot: BattleAudioCuePlan | null, phase: string): string {
  const bgmText = bgm ? 'BGM 循环' : 'BGM 待资源';
  const cueText = oneShot ? oneShot.label : resolveIdleCueText(phase);
  return `${bgmText} / ${cueText}`;
}

function resolveIdleCueText(phase: string): string {
  if (phase === 'ready') {
    return '等待开始音';
  }
  if (phase === 'resultRecording') {
    return '等待结算音';
  }
  if (phase === 'error') {
    return '错误态静音';
  }
  return '等待事件音';
}

function resolveCueLabel(cueKey: BattleAudioCueKey): string {
  if (cueKey === 'battleBgm') {
    return '战斗 BGM';
  }
  if (cueKey === 'battleStart') {
    return '开战提示';
  }
  if (cueKey === 'heroBasicAttack') {
    return '近战普攻音';
  }
  if (cueKey === 'rangedAttack') {
    return '远程普攻音';
  }
  if (cueKey === 'hitLight') {
    return '受击音';
  }
  if (cueKey === 'heroSkill') {
    return '技能音';
  }
  if (cueKey === 'healCast') {
    return '治疗音';
  }
  if (cueKey === 'buffApply') {
    return '增益音';
  }
  if (cueKey === 'resultLose') {
    return '失败结算音';
  }
  return '胜利结算音';
}
