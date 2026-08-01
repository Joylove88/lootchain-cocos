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

const flow = read('assets/scripts/scenes/lobby/LobbyBattleFlow.ts');
const root = read('assets/scripts/scenes/LootChainGameRoot.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const aggregate = read('scripts/check-battle-stage13i.mjs');
const freshness = read('scripts/check-preview-freshness.mjs');

expectToken(flow, 'refreshLobbyBattlePresentationPlayback()', 'incremental playback host hook');
expectNoToken(flow, 'this.bump();\n      }, step * LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS);', 'full panel rerender on playback tick');

expectToken(root, 'refreshLobbyBattlePresentationPlayback()', 'root incremental playback method');
expectToken(root, '!battleState.presentationComplete', 'completed battle requires full scene render');
expectToken(root, 'this.lobbyBattlePreviewPanelRenderer.refreshPlayback(this.resolveLayout())', 'renderer incremental playback call');
expectNoToken(root, "if (this.currentView === 'battle') {\n      this.renderBattleScene();\n      return;\n    }", 'battle refresh full scene rerender branch');

expectToken(renderer, 'refreshPlayback(layout: UiLayout): void', 'renderer refreshPlayback API');
expectToken(renderer, 'private lastBattleSceneKey', 'stable scene key');
expectToken(renderer, 'battlePlaybackNodes', 'persistent playback node cache');
expectToken(renderer, 'playedBattleCueKeys', 'cue idempotency cache');
expectToken(renderer, 'battleActorHomePositions', 'converged actor home cache');
expectToken(renderer, 'LobbyBattleActorVisualRoot', 'actor visual root separates scale pulse from movement tween');
expectToken(renderer, 'requiresFullBattleSceneRender(battleState)', 'renderer blocks incremental refresh on complete states');
expectToken(renderer, 'private requiresFullBattleSceneRender(state: LobbyBattlePanelState): boolean', 'renderer full-render state guard');
expectToken(renderer, 'return state.presentationComplete || state.settling || !!state.settlement', 'presentation completion forces full render');
expectToken(renderer, 'resolveActorCombatBasePosition', 'opening convergence retained combat base');
expectToken(renderer, 'resolveActorConvergedCombatPosition', 'converged combat home resolver');
expectToken(renderer, 'resolveBattleActorFramePosition', 'actor root position uses frame time resolver');
expectToken(renderer, 'resolveBattleActorRootMotionCue', 'actor root motion cue selected by timeline time');
expectToken(renderer, 'resolveBattleActorRootMotionPosition', 'actor root motion interpolated by timeline time');
expectToken(renderer, 'setBattleActorFramePosition', 'opening convergence uses frame-driven position');
expectToken(renderer, 'BATTLE_ACTOR_POSITION_EPSILON', 'position refresh avoids redundant root writes');
expectToken(renderer, 'presentationElapsedMs', 'opening convergence uses continuous elapsed time');
expectToken(renderer, 'resolveActorMeleeContactPosition', 'melee_move resolves a target-front contact point instead of basic_attack owning movement');
expectNoToken(renderer, 'playBattleOpeningConvergenceOnce', 'opening convergence no longer uses competing one-shot tween');
expectNoToken(renderer, 'playBattleOpeningActorMotion', 'opening no longer uses root tween');
expectNoToken(renderer, 'continuous-converge', 'old opening tween cue key removed');
expectNoToken(renderer, 'openingConvergence.durationMs * remainingRatio', 'old stepped tween duration removed');
expectNoToken(renderer, 'battleActorMotionLocks', 'old motion lock cache removed');
expectNoToken(renderer, 'isBattleActorMotionLocked', 'old motion lock gate removed');
expectToken(renderer, 'const converged = this.resolveActorConvergedCombatPosition(slot, enemy, scale)', 'actor combat home derives from converged line plus front-charge offset');
expectToken(renderer, 'resolveBattleActorFrontChargeOffset', 'front melee units charge to the clash line together at combat start');
expectToken(renderer, 'applyBattleActorSpineCueOnce', 'idempotent battle spine cue playback');
expectToken(renderer, 'if (this.applyBattleActorSpineCue(actor, unit, actionAnimationName))', 'spine cue cache only records successful application');
expectToken(renderer, "this.applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run')", 'opening run animation is not reset every tick');
expectToken(renderer, 'presentationStep < LOBBY_BATTLE_COMBAT_START_STEP', 'opening gate releases action after convergence and hold');
expectToken(renderer, 'resolveVisibleCombatTimelineEvents', 'combat event queue prevents skipping directly to damage');
expectToken(renderer, "event.type === 'action_start'", 'combat event queue includes action before impact');
expectToken(renderer, 'effect:action:projectile', 'projectile effects use independent playback key');
expectToken(renderer, 'effect:action:floating', 'floating action effects use independent playback key');
expectToken(renderer, 'effect:assist:aura', 'assist aura uses independent playback key');
expectToken(renderer, 'effect:assist:floating', 'assist floating effects use independent playback key');
expectToken(renderer, 'tween(visualRoot)', 'scale pulse applies to visual root rather than movement target');
expectToken(renderer, 'sceneKey === this.lastBattleSceneKey', 'same-scene incremental update path');
expectToken(renderer, 'let currentActionCue = openingConvergence.active ? null', 'opening convergence blocks action cues before live-unit filtering');
expectToken(renderer, 'const currentAssistCue = openingConvergence.active ? null', 'opening convergence blocks assist cues');
expectToken(renderer, 'if (!openingConvergence.active && performanceProfile.showFloatingText)', 'opening convergence blocks floating combat text');
expectToken(renderer, 'resolveBattlePlaybackTimelineTimeMs', 'combat timeline starts after opening convergence using continuous time');
expectToken(renderer, 'resolveTimelineEventAtTime', 'continuous combat event resolver');
expectToken(renderer, "presentation.phase === 'roundPlaying'", 'round playing holds converged combat base');
expectToken(renderer, 'shouldHoldConvergedLine', 'post-opening actors stay on converged line');

expectToken(aggregate, 'check-battle-stage13k', 'aggregate stage13k guard');
expectToken(freshness, 'refreshPlayback(layout', 'preview freshness playback token');
expectToken(freshness, 'resolveActorCombatBasePosition', 'preview freshness combat base token');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13k ok');
