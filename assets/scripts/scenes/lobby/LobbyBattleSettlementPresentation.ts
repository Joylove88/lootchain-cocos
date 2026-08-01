import type { LobbyBattlePanelState } from './LobbyBattleState';
import type { LobbyBattlePresentationPhase, LobbyBattlePresentationState } from './LobbyBattlePresentationState';

export type BattleSettlementPresentationStepKind =
  | 'start_idempotent'
  | 'session_ready'
  | 'playback_complete'
  | 'settle_idempotent'
  | 'receipt_recorded'
  | 'error_recoverable';

export type BattleSettlementPresentationTone = 'idle' | 'active' | 'done' | 'blocked' | 'warning';

export interface BattleSettlementPresentationStep {
  stepKey: string;
  kind: BattleSettlementPresentationStepKind;
  label: string;
  detail: string;
  active: boolean;
  done: boolean;
  blocked: boolean;
  tone: BattleSettlementPresentationTone;
}

export interface BattleSettlementPresentationView {
  viewKey: string;
  phase: LobbyBattlePresentationPhase;
  title: string;
  subtitle: string;
  steps: BattleSettlementPresentationStep[];
  primaryRecoveryLabel: string;
  recoveryHint: string;
  canRetryStart: boolean;
  canReturnToFormation: boolean;
  canReturnToLobby: boolean;
  receiptStatus: string;
}

export function resolveBattleSettlementPresentationView(
  state: LobbyBattlePanelState,
  presentation: LobbyBattlePresentationState,
): BattleSettlementPresentationView {
  const hasStart = Boolean(state.start);
  const hasReceipt = Boolean(state.settlement);
  const hasError = Boolean(state.error) && !hasReceipt;
  const playbackDone = Boolean(state.presentationComplete || hasReceipt);
  const stageCode = state.settlement?.stageCode || state.start?.stageCode || state.stageCode || '未选择';
  const steps: BattleSettlementPresentationStep[] = [
    resolveStartStep(state, hasStart, hasReceipt, hasError),
    resolveSessionStep(state, hasStart, hasReceipt),
    resolvePlaybackStep(state, hasStart, hasReceipt, playbackDone),
    resolveSubmitStep(state, hasStart, hasReceipt, playbackDone),
    resolveReceiptStep(state, hasReceipt),
  ];

  if (hasError) {
    steps.push(resolveErrorStep(state, hasStart));
  }

  return {
    viewKey: `${presentation.phase}:${stageCode}:${state.start?.battleNo || state.settlement?.battleNo || 'none'}:${state.version}`,
    phase: presentation.phase,
    title: '结算链路',
    subtitle: stageCode,
    steps,
    primaryRecoveryLabel: resolvePrimaryRecoveryLabel(state, presentation, hasStart, hasReceipt, playbackDone),
    recoveryHint: resolveRecoveryHint(state, presentation, hasStart, hasReceipt, playbackDone),
    canRetryStart: hasError && !hasStart && !state.starting,
    canReturnToFormation: !state.starting && !state.settling && !hasReceipt,
    canReturnToLobby: hasReceipt || presentation.returnToLobby,
    receiptStatus: resolveReceiptStatus(state, hasStart, hasReceipt),
  };
}

function resolveStartStep(
  state: LobbyBattlePanelState,
  hasStart: boolean,
  hasReceipt: boolean,
  hasError: boolean,
): BattleSettlementPresentationStep {
  const done = hasStart || hasReceipt;
  const active = state.starting || (!done && !hasError);
  const blocked = state.starting;
  return createStep('start_idempotent', '创建会话', resolveStartDetail(state, done, hasError), active, done, blocked);
}

function resolveSessionStep(
  state: LobbyBattlePanelState,
  hasStart: boolean,
  hasReceipt: boolean,
): BattleSettlementPresentationStep {
  const done = hasStart || hasReceipt;
  const active = hasStart && !hasReceipt && !state.settling;
  return createStep('session_ready', '会话有效', done ? resolveSessionDetail(state) : '等待后端战斗号', active, done, false);
}

function resolvePlaybackStep(
  state: LobbyBattlePanelState,
  hasStart: boolean,
  hasReceipt: boolean,
  playbackDone: boolean,
): BattleSettlementPresentationStep {
  const active = hasStart && !hasReceipt && !playbackDone;
  const blocked = hasStart && !hasReceipt && !playbackDone;
  const detail = playbackDone ? '本地演出已完成' : hasStart ? '演出未完成，结算按钮保持禁用' : '等待会话创建';
  return createStep('playback_complete', '演出完成', detail, active, playbackDone, blocked || state.starting);
}

function resolveSubmitStep(
  state: LobbyBattlePanelState,
  hasStart: boolean,
  hasReceipt: boolean,
  playbackDone: boolean,
): BattleSettlementPresentationStep {
  const active = state.settling;
  const blocked = !hasReceipt;
  const detail = state.settling
    ? '提交中，重复点击已拦截'
    : hasReceipt
      ? '已有后端回执，不重复提交'
      : hasStart && playbackDone
        ? '演出完成，等待提交结算'
        : hasStart
          ? '演出完成后仍保持预留'
          : '等待会话创建';
  return createStep('settle_idempotent', '结算预留', detail, active, hasReceipt, blocked);
}

function resolveReceiptStep(
  state: LobbyBattlePanelState,
  hasReceipt: boolean,
): BattleSettlementPresentationStep {
  const detail = hasReceipt
    ? `${state.settlement?.settlementNo || '已记录'} / ${state.settlement?.status || 'RECORDED'}`
    : state.settling
      ? '等待后端回执'
      : '未记录';
  return createStep('receipt_recorded', '回执记录', detail, state.settling, hasReceipt, false);
}

function resolveErrorStep(state: LobbyBattlePanelState, hasStart: boolean): BattleSettlementPresentationStep {
  const detail = hasStart ? '会话仍在本地，可返回编队后重进' : state.error || '可重试创建';
  return createStep('error_recoverable', '异常恢复', detail, true, false, false, 'warning');
}

function createStep(
  kind: BattleSettlementPresentationStepKind,
  label: string,
  detail: string,
  active: boolean,
  done: boolean,
  blocked: boolean,
  forcedTone?: BattleSettlementPresentationTone,
): BattleSettlementPresentationStep {
  return {
    stepKey: `${kind}:${done ? 'done' : active ? 'active' : 'idle'}:${blocked ? 'blocked' : 'open'}`,
    kind,
    label,
    detail,
    active,
    done,
    blocked,
    tone: forcedTone || resolveTone(done, blocked, active),
  };
}

function resolveTone(done: boolean, blocked: boolean, active: boolean): BattleSettlementPresentationTone {
  if (done) {
    return 'done';
  }
  if (blocked) {
    return 'blocked';
  }
  if (active) {
    return 'active';
  }
  return 'idle';
}

function resolveStartDetail(state: LobbyBattlePanelState, done: boolean, hasError: boolean): string {
  if (done) {
    return `战斗号 ${state.start?.battleNo || state.settlement?.battleNo || '已生成'}`;
  }
  if (state.starting) {
    return '创建中，重复开始已拦截';
  }
  if (hasError) {
    return '未生成战斗号，可重试';
  }
  return '等待玩家开始';
}

function resolveSessionDetail(state: LobbyBattlePanelState): string {
  const start = state.start;
  if (!start) {
    return state.settlement?.battleNo || '已完成';
  }
  return `${start.battleNo} / ${start.status}`;
}

function resolvePrimaryRecoveryLabel(
  state: LobbyBattlePanelState,
  presentation: LobbyBattlePresentationState,
  hasStart: boolean,
  hasReceipt: boolean,
  playbackDone: boolean,
): string {
  if (hasReceipt || presentation.returnToLobby) {
    return '返回大厅';
  }
  if (state.error && !hasStart) {
    return '重试创建';
  }
  if (state.settling) {
    return '等待回执';
  }
  if (hasStart && playbackDone) {
    return '返回大厅';
  }
  if (hasStart) {
    return '返回编队';
  }
  if (state.starting) {
    return '会话创建中';
  }
  return '开始战斗';
}

function resolveRecoveryHint(
  state: LobbyBattlePanelState,
  presentation: LobbyBattlePresentationState,
  hasStart: boolean,
  hasReceipt: boolean,
  playbackDone: boolean,
): string {
  if (hasReceipt || presentation.returnToLobby) {
    return '后端回执已记录，返回大厅后统一回读最新角色状态。';
  }
  if (state.error && !hasStart) {
    return '本次未生成战斗号，重试只会重新创建会话。';
  }
  if (state.error && hasStart) {
    return '本地仍保留战斗号，返回编队不会提交结算。';
  }
  if (state.starting) {
    return '正在等待会话创建，重复开始会被拦截。';
  }
  if (state.settling) {
    return '正在等待后端回执，重复提交会被拦截。';
  }
  if (hasStart && playbackDone) {
    return '演出已完成，结算已自动提交，等待后端回执。';
  }
  if (hasStart) {
    return '演出未完成时不能提交结算，返回编队不会写入结果。';
  }
  return '开始战斗只创建会话，最终结果以后端回执为准。';
}

function resolveReceiptStatus(state: LobbyBattlePanelState, hasStart: boolean, hasReceipt: boolean): string {
  if (hasReceipt) {
    return `${state.settlement?.settlementNo || 'REC'} / ${state.settlement?.status || 'RECORDED'}`;
  }
  if (state.settling) {
    return '提交中';
  }
  if (hasStart) {
    return '视觉回放';
  }
  if (state.starting) {
    return '创建中';
  }
  return '未创建';
}
