import fs from 'node:fs';

const renderer = fs.readFileSync('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts', 'utf8');
const hp = fs.readFileSync('assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts', 'utf8');
const flow = fs.readFileSync('assets/scripts/scenes/lobby/LobbyBattleFlow.ts', 'utf8');
const completion = fs.readFileSync('assets/scripts/scenes/lobby/LobbyBattleVisualCompletion.ts', 'utf8');
const presentation = fs.readFileSync('assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts', 'utf8');

const errors = [];

function assertIncludes(text, token, label) {
  if (!text.includes(token)) {
    errors.push(`missing ${label}: ${token}`);
  }
}

function assertNotIncludes(text, token, label) {
  if (text.includes(token)) {
    errors.push(`forbidden ${label}: ${token}`);
  }
}

assertNotIncludes(hp, 'applyBattlePresentationResultDefeatHpState', 'fake result HP clear helper');
assertNotIncludes(hp, 'phase !== \'resultRecording\' && phase !== \'resultRecorded\'', 'result phase HP override');
assertNotIncludes(renderer, 'presentation.phase === \'roundPlaying\' && state.presentationComplete', 'presentationComplete result HP coercion');
assertNotIncludes(renderer, 'rootMotionCue?.kind === \'damage_float\'', 'damage-float snap bypass');
assertNotIncludes(renderer, 'state.presentationComplete && presentation.actionEnabled && !!state.start', 'raw presentationComplete victory overlay gate');
assertNotIncludes(flow, 'const totalDurationMs = LOBBY_BATTLE_PRESENTATION_STEP_COUNT * LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS;', 'fixed-duration battle completion');
assertNotIncludes(presentation, '战斗胜利 / 视觉完成', 'round-playing premature victory copy');
assertNotIncludes(presentation, '战斗胜利表现已完成', 'round-playing premature victory log');

assertIncludes(flow, 'resolveLobbyBattleVisualCompletionDurationMs', 'replay-driven completion duration');
assertIncludes(renderer, 'isBattleVisualResultReady', 'visual result readiness gate');
assertIncludes(renderer, 'renderResultBanner(field, fieldRect.width, fieldRect.height, scale, state, presentation, snapshot, hpState, playbackTimelineTimeMs)', 'result banner HP gate call');
assertIncludes(completion, 'resolveBattleVisualOutcome', 'both-sides (victory/defeat) completion guard');

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('battle visual state machine guard ok');
