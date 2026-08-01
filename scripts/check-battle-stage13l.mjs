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

const state = read('assets/scripts/scenes/lobby/LobbyBattleState.ts');
const presentation = read('assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const flow = read('assets/scripts/scenes/lobby/LobbyBattleFlow.ts');

expectToken(state, 'export const LOBBY_BATTLE_PRESENTATION_STEP_COUNT = 369', 'presentation window covers the 90s combat countdown at natural speed');
expectToken(state, 'export const LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS = 250', 'smoother presentation interval');
expectToken(state, 'export const LOBBY_BATTLE_PRESENTATION_FRAME_INTERVAL_MS = 16', 'frame playback interval');
expectToken(state, 'export const LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 6', 'opening convergence run duration');
expectToken(state, 'export const LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 3', 'opening convergence hold before combat');
expectToken(state, 'export const LOBBY_BATTLE_COMBAT_START_STEP = LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT + LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT', 'opening combat start gate');
expectToken(state, 'presentationElapsedMs: number;', 'continuous playback elapsed state');
expectToken(state, 'presentationStartedAtMs: number;', 'continuous playback start time state');

expectToken(flow, 'this.host.refreshLobbyBattlePresentationPlayback()', 'presentation ticks use incremental playback refresh');
expectNoToken(flow, 'this.bump();\n      }, step * LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS);', 'presentation ticks do not rerender full panel');
expectToken(flow, 'LOBBY_BATTLE_PRESENTATION_FRAME_INTERVAL_MS', 'presentation playback uses frame interval');
expectToken(flow, 'Date.now() - startedAtMs', 'presentation elapsed derives from wall clock');
expectToken(flow, 'this.state.presentationElapsedMs = elapsedMs', 'presentation elapsed updates every frame');
expectToken(flow, 'this.bump();\n      this.schedulePresentationTicks(currentTicket);', 'battle start response renders battlefield before incremental playback');
expectNoToken(flow, 'Array.from({ length: LOBBY_BATTLE_PRESENTATION_STEP_COUNT }', 'presentation no longer pre-schedules stepped timers');

expectToken(presentation, 'step < LOBBY_BATTLE_COMBAT_START_STEP', 'opening copy gate releases combat after convergence hold');
expectToken(presentation, '双方向中场推进，汇合后才开始首个行动。', 'opening copy states combat starts after convergence');
expectToken(presentation, "damageText: ''", 'opening copy has no combat damage text');

expectToken(renderer, 'currentActionCue = openingConvergence.active ? null', 'opening convergence blocks action cue selection');
expectToken(renderer, 'const currentAssistCue = openingConvergence.active ? null', 'opening convergence blocks assist cue selection');
expectToken(renderer, 'if (openingConvergence.active) {\n      return;\n    }\n    if (currentActionCue)', 'opening convergence blocks one-shot combat effects');
expectToken(renderer, 'if (!openingConvergence.active && performanceProfile.showFloatingText)', 'opening convergence blocks initial floating text render');
expectToken(renderer, 'resolveBattlePlaybackTimelineTimeMs', 'combat timeline starts after opening convergence hold using elapsed time');
expectToken(renderer, 'resolveTimelineEventAtTime', 'continuous combat event resolver');
expectToken(renderer, 'presentationStep < LOBBY_BATTLE_COMBAT_START_STEP', 'opening convergence active gate uses strict pre-combat-start steps');
expectToken(renderer, 'resolveVisibleCombatTimelineEvents', 'combat event queue used after convergence');
expectToken(renderer, "event.type === 'action_start'", 'first post-opening combat queue can select an action event');

expectToken(renderer, 'this.resolveBattleOpeningConvergenceState(battleState.presentationStep, battleState.presentationElapsedMs, presentation)', 'refresh playback uses continuous opening elapsed');
expectToken(renderer, 'const elapsedMs = clamp(presentationElapsedMs, 0, durationMs)', 'opening progress uses continuous elapsed ms');
expectToken(renderer, 'easeBattleOpeningConvergenceProgress(linearProgress)', 'opening convergence movement is eased');
expectToken(renderer, 'resolveBattleActorFramePosition', 'actor root position is resolved from elapsed timeline time');
expectToken(renderer, 'setBattleActorFramePosition', 'actor root position is frame-driven with epsilon guard');
expectToken(renderer, 'BATTLE_ACTOR_POSITION_EPSILON', 'actor position refresh avoids redundant setPosition churn');
expectNoToken(renderer, 'playBattleOpeningConvergenceOnce', 'opening no longer uses one-shot tween competing with refresh');
expectNoToken(renderer, 'playBattleOpeningActorMotion', 'opening no longer uses root tween competing with refresh');
expectNoToken(renderer, 'opening-center-motion', 'opening no longer relies on one-shot opening tween key');
expectNoToken(renderer, 'targetProgress', 'opening cue does not use stepped target progress');
expectToken(renderer, "this.applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run')", 'opening run animation is set once per actor');
expectToken(renderer, 'resolveBattleSpineCuePlaybackKey(currentActionCue.cueKey, actionAnimationName)', 'combat action animation is cue-idempotent per animation stage');
expectToken(renderer, 'const playbackCueKey = `spine:${this.lastBattleSceneKey}:${cueKey}:${unit.unitKey}:${actionAnimationName}`', 'spine animation cue cache includes scene, cue, unit, and action');
expectNoToken(renderer, "this.applyBattleActorSpineCue(actor, unit, 'move');", 'opening run animation reset on every refresh tick');
expectToken(renderer, 'LobbyBattleActorVisualRoot', 'visual root separates scale pulse from actor movement');
expectToken(renderer, 'tween(visualRoot)', 'scale pulse does not run on movement target');
expectToken(renderer, 'effect:action:projectile', 'action projectile effect cache is independent');
expectToken(renderer, 'effect:action:floating', 'action floating effect cache is independent');
expectToken(renderer, 'effect:assist:aura', 'assist aura effect cache is independent');
expectToken(renderer, 'effect:assist:floating', 'assist floating effect cache is independent');

expectToken(renderer, 'battleActorHomePositions', 'converged combat home cache');
expectToken(renderer, 'resolveBattleActorRootMotionCue', 'actor action movement is selected from the timeline instead of one-shot tween locks');
expectToken(renderer, 'resolveBattleActorRootMotionPosition', 'actor action movement is interpolated from timeline time');
expectToken(renderer, 'resolveBattleTimelineToPresentationRatio', 'root motion converts compressed combat timeline into visual presentation time');
expectToken(renderer, 'timelineToPresentationRatio', 'root motion uses presentation-time ratio');
expectToken(renderer, '* BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR', 'root motion elapsed is not over-accelerated by compressed timeline');
expectToken(renderer, "cue.kind === 'melee_move'", 'melee move uses interpolated root motion');
expectToken(renderer, "cue.kind === 'basic_attack'", 'basic attack holds target contact for strike animation');
expectToken(renderer, 'BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520', 'basic attack keeps melee contact distance instead of snapping backward');
expectNoToken(renderer, 'battleActorMotionLocks', 'old actor motion lock state removed');
expectNoToken(renderer, 'isBattleActorMotionLocked', 'old motion lock gate removed');
expectToken(renderer, 'resolveActorConvergedCombatPosition', 'converged combat home resolver');
expectToken(renderer, 'const converged = this.resolveActorConvergedCombatPosition(slot, enemy, scale)', 'actor combat home derives from converged line');
expectToken(renderer, 'shouldHoldConvergedLine', 'post-opening actors stay near center rather than original columns');
expectToken(renderer, 'if (this.applyBattleActorSpineCue(actor, unit, actionAnimationName))', 'spine cue cache is written only after cue applies');
expectToken(renderer, 'renderBattleCombatHud', 'formal combat hud replaces debug side labels');
expectToken(renderer, "presentation.phase === 'roundPlaying'", 'footer debug controls are hidden during active combat playback');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13l ok');
