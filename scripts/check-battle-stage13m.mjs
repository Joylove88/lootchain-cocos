import { existsSync, readFileSync } from 'node:fs';

let ok = true;

function read(path) {
  if (!existsSync(path)) {
    console.error(`missing file: ${path}`);
    ok = false;
    return '';
  }
  return readFileSync(path, 'utf8');
}

function expectToken(text, token, label) {
  if (!text.includes(token)) {
    console.error(`missing ${label}: ${token}`);
    ok = false;
  }
}

function expectNoToken(text, token, label) {
  if (text.includes(token)) {
    console.error(`forbidden ${label}: ${token}`);
    ok = false;
  }
}

const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const action = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const assist = read('assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts');
const adaptive = read('assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts');
const aggregate = read('scripts/check-battle-stage13i.mjs');
const freshness = read('scripts/check-preview-freshness.mjs');

expectToken(renderer, 'resolveBattlePlaybackTimelineTimeMs', 'continuous playback timeline mapper');
expectToken(renderer, 'combatStartPresentationMs = LOBBY_BATTLE_COMBAT_START_STEP * LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS', 'combat start uses opening gate in ms');
expectToken(renderer, 'combatPresentationDurationMs', 'compressed combat presentation window');
expectToken(renderer, 'resolveTimelineEventAtTime', 'continuous event lookup');
expectToken(renderer, 'easeBattleOpeningConvergenceProgress(linearProgress)', 'eased opening movement');
expectToken(renderer, 'resolveActorConvergedCombatPosition', 'converged combat home');
expectToken(renderer, 'shouldHoldConvergedLine', 'post-opening actors do not return to original slots');
expectToken(renderer, 'resolveBattleActorFramePosition', 'actions return to deterministic frame position');
expectToken(renderer, 'resolveBattleActorRootMotionPosition', 'actions return to cached converged home by timeline interpolation');
expectToken(renderer, 'resolveBattleTimelineToPresentationRatio', 'compressed combat timeline is converted to visual motion time');
expectToken(renderer, "cue.kind === 'melee_move'", 'melee move interpolates into target contact position');
expectToken(renderer, "cue.kind === 'basic_attack'", 'basic attack holds target contact after melee approach');
expectToken(renderer, 'setBattleActorFramePosition', 'refresh does not restart active tweens');
expectToken(renderer, 'const strikeHoldMs = Math.max(260, cue.durationMs * 0.58);', 'basic attack does not snap backward from melee contact');
expectToken(renderer, 'renderBattleCombatHud', 'formal battle hud');
expectToken(renderer, 'LobbyBattleCombatHud', 'formal hud node');
expectToken(renderer, 'LobbyBattleCombatHudLeftPill', 'video-style light top-left hud');
expectToken(renderer, 'LobbyBattleCombatHudStagePill', 'video-style center stage hud');
expectToken(renderer, 'LobbyBattleCombatHudRightPill', 'video-style top-right speed hud');
expectToken(renderer, "presentation.phase === 'roundPlaying'", 'active combat hides footer controls');
expectNoToken(renderer, 'LobbyBattleOpeningConvergenceLabel', 'debug opening convergence text label');
expectNoToken(renderer, 'LobbyBattleStage12AllySideLabel', 'debug ally side label');
expectNoToken(renderer, 'LobbyBattleStage12EnemySideLabel', 'debug enemy side label');

expectToken(action, 'playbackTimelineTimeMs?: number', 'action resolver continuous time argument');
expectToken(action, 'activeByTime', 'action resolver prefers active time window');
expectToken(action, 'cue.timeMs <= timeMs + 80', 'action resolver uses millisecond window');
expectToken(assist, 'playbackTimelineTimeMs?: number', 'assist resolver continuous time argument');
expectToken(assist, 'activeByTime', 'assist resolver prefers active time window');
expectToken(assist, 'cue.timeMs <= timeMs + 120', 'assist resolver uses millisecond window');

expectToken(adaptive, 'showTimelineRail: false', 'formal battle hides timeline rail');
expectToken(adaptive, 'showBattleLog: false', 'formal battle hides battle log');
expectToken(adaptive, 'showStage8Panel: false', 'formal battle hides settlement debug panel');
expectToken(adaptive, 'showRecoveryBanner: false', 'formal battle hides recovery debug banner');
expectToken(aggregate, 'check-battle-stage13m', 'aggregate includes Stage 13M');
expectToken(freshness, 'resolveBattlePlaybackTimelineTimeMs', 'preview freshness continuous timeline token');
expectToken(freshness, 'LobbyBattleCombatHud', 'preview freshness formal hud token');

for (const token of ['/api/player/battles/settle', 'rewardGranted', 'staminaCost', 'DIAMOND', 'USDT', 'EX V1']) {
  expectNoToken(renderer, token, 'renderer economy/write token');
}

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13m ok');
