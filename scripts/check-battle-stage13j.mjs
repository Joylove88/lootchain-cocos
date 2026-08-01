import { existsSync, readFileSync } from 'node:fs';

let ok = true;

function expectFile(path) {
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

const state = expectFile('assets/scripts/scenes/lobby/LobbyBattleState.ts');
const root = expectFile('assets/scripts/scenes/LootChainGameRoot.ts');
const renderer = expectFile('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const presentation = expectFile('assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts');
const actionPresentation = expectFile('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const freshness = expectFile('scripts/check-preview-freshness.mjs');

expectToken(state, 'export const LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 6', 'opening convergence run duration');
expectToken(state, 'export const LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 1', 'opening convergence combat delay');
expectToken(state, 'export const LOBBY_BATTLE_COMBAT_START_STEP = LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT + LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT', 'combat start gate');
expectToken(renderer, 'BattleOpeningConvergenceState', 'opening convergence render state');
expectToken(renderer, 'resolveBattleOpeningConvergenceState', 'opening convergence resolver');
expectToken(renderer, 'presentationStep < LOBBY_BATTLE_COMBAT_START_STEP', 'timeline opening gate releases combat after convergence and hold');
expectToken(renderer, "event.type === 'battle_start'", 'opening battle-start event selection');
expectToken(renderer, 'resolveBattlePlaybackTimelineTimeMs', 'delayed combat timeline uses continuous playback time');
expectToken(renderer, 'playbackTimelineTimeMs', 'action cue selection uses continuous timeline time');
expectToken(renderer, 'resolveOpeningConvergenceOffset', 'opening convergence offset');
expectToken(renderer, 'renderBattleOpeningConvergenceCue', 'opening convergence visual cue');
expectToken(renderer, 'isNodeMounted(this.battleSceneRoot)', 'playback refresh requires mounted battle root');
expectToken(renderer, 'return this.isNodeAlive(node) && !!node.parent;', 'mounted check rejects cleared scene nodes');
expectToken(renderer, "openingConvergence.moving ? 'run' : 'idle'", 'opening run animation only while moving');
expectToken(renderer, "this.applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run')", 'opening actors run while converging');
expectToken(renderer, "this.applyBattleActorSpineCueOnce('opening-hold', actor, unit, 'idle')", 'opening actors hold after convergence');
expectToken(renderer, 'openingConvergence.active ? null : resolveVisibleBattleActionPresentationCue', 'action cue suppression during opening');
expectToken(renderer, 'openingConvergence.active ? null : resolveVisibleBattleAssistPresentationCue', 'assist cue suppression during opening');
expectToken(renderer, 'visibleDamagePreviewEvent', 'opening damage preview suppression');
expectToken(renderer, 'visibleBuffPreviewEvent', 'opening buff preview suppression');
expectToken(renderer, '!openingConvergence.active && performanceProfile.showFloatingText', 'opening floating text gate');
expectToken(presentation, '开场汇合', 'opening copy');
expectToken(presentation, '双方向中场推进', 'opening movement copy');
expectToken(presentation, 'if (step < LOBBY_BATTLE_COMBAT_START_STEP)', 'opening presentation gate releases combat after convergence and hold');
expectToken(actionPresentation, "animationName: 'run'", 'melee move uses run cue');
expectToken(actionPresentation, 'playbackTimelineTimeMs?: number', 'action cue resolver accepts continuous time');
expectToken(root, 'private refreshLobbyBattlePresentationPlayback(): void', 'battle playback refresh entry');
expectToken(root, 'if (battleState.start && !battleState.presentationComplete && this.lobbyBattlePreviewPanelRenderer.canRefreshPlayback())', 'battle playback refresh checks mounted scene before partial update');
expectToken(root, 'this.renderBattleScene();', 'battle playback refresh falls back to full render when partial refresh is unavailable');
expectToken(freshness, 'resolveBattleOpeningConvergenceState', 'preview freshness token');
expectToken(freshness, 'renderBattleOpeningConvergenceCue', 'preview freshness token');

for (const token of ['/api/player/battles/settle', 'rewardGranted', 'staminaCost', 'DIAMOND', 'USDT', 'EX V1']) {
  expectNoToken(renderer, token, 'renderer economy/write token');
}

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13j ok');
