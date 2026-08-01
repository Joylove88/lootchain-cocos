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
const root = read('assets/scripts/scenes/LootChainGameRoot.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const presentationState = read('assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts');
const aggregate = read('scripts/check-battle-stage13i.mjs');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');

expectToken(state, 'LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 6', 'opening run movement duration');
expectToken(state, 'LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 3', 'post-convergence combat delay leaves melee_move room before first strike');
expectToken(state, 'LOBBY_BATTLE_COMBAT_START_STEP = LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT + LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT', 'combat starts only after convergence and delay');

expectToken(renderer, 'moving: boolean', 'opening state separates movement from gating');
expectToken(renderer, 'moving: linearProgress < 1', 'opening moving flag ends at center');
expectToken(renderer, "openingConvergence.active ? null : resolveVisibleBattleActionPresentationCue", 'opening blocks action cues');
expectToken(renderer, "openingConvergence.active ? null : resolveVisibleBattleAssistPresentationCue", 'opening blocks assist cues');
expectToken(renderer, "presentationStep < LOBBY_BATTLE_COMBAT_START_STEP", 'visible timeline keeps battle_start during opening');
expectToken(renderer, 'combatElapsedMs = clamp(presentationElapsedMs - combatStartPresentationMs', 'combat timeline time waits for opening gate');
expectToken(renderer, 'if (openingConvergence.active) {\n      return;\n    }', 'opening blocks effect layers');
expectToken(renderer, "openingConvergence.moving ? 'run' : 'idle'", 'opening uses run only while moving');
expectToken(renderer, "this.applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run')", 'opening uses run only while moving');
expectToken(renderer, "this.applyBattleActorSpineCueOnce('opening-hold', actor, unit, 'idle')", 'opening switches to hold after convergence');
expectToken(renderer, "cue === 'idle' || cue === 'stand'", 'idle cue maps to idle animation');
expectToken(renderer, "actionAnimationName === 'run'", 'run animation loops while moving');
expectToken(renderer, 'BATTLE_OPENING_ENTRY_DISTANCE_RATIO = 0.96', 'opening starts from side-entry battle lines');
expectToken(renderer, 'BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO = 0.76', 'opening keeps side spacing before the combat line');
expectToken(renderer, 'BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO = 1.28', 'opening movement cap leaves readable melee approach room');
expectToken(renderer, 'BATTLE_OPENING_LANE_ENTRY_RATIOS', 'opening side entry keeps lanes separated');
expectToken(renderer, 'entryDistance', 'opening entry distance is clamped by lane width');
expectToken(renderer, 'remaining', 'opening offset eases to the converged combat line');
expectToken(renderer, 'resolveBattleActorFramePosition', 'opening and combat movement use one frame position resolver');
expectToken(renderer, 'resolveBattleActorRootMotionCue', 'combat root movement is selected by timeline time');
expectToken(renderer, 'resolveBattleActorRootMotionPosition', 'combat root movement is interpolated by timeline time');
expectToken(renderer, 'setBattleActorFramePosition', 'frame refresh only writes actor position when it changes');
expectToken(renderer, 'return targetPosition;', 'root-motion fallback does not snap back from melee contact');
expectToken(renderer, "cue.kind === 'melee_move'", 'melee move root motion is interpolated');
expectToken(renderer, "cue.kind === 'ranged_projectile'", 'only explicit movement cues use root motion after melee_move');
expectToken(renderer, 'Math.floor(now / 24)', 'telemetry samples actor movement by real frame time');
expectNoToken(renderer, 'playBattleOpeningActorMotion', 'old opening root tween');
expectNoToken(renderer, 'opening-center-motion', 'old opening root tween key');
expectNoToken(renderer, 'remainingMs = Math.max(90, durationMs - elapsedMs)', 'old opening tween resume');
expectNoToken(renderer, 'isBattleActorMotionLocked', 'old motion lock gate');
expectToken(renderer, 'isNodeMounted(this.battleSceneRoot)', 'playback refresh requires mounted battle root');
expectToken(renderer, 'return this.isNodeAlive(node) && !!node.parent;', 'mounted check rejects cleared scene nodes');
expectToken(root, 'if (battleState.start && !battleState.presentationComplete && this.lobbyBattlePreviewPanelRenderer.canRefreshPlayback())', 'presentation tick checks partial refresh availability');
expectToken(root, 'this.renderBattleScene();', 'presentation tick falls back to full render when battle scene was cleared');
expectToken(renderer, 'shouldHoldConvergedLine', 'actors hold converged line after opening');
expectToken(renderer, 'resolveActorConvergedCombatPosition', 'combat home is converged center position');
expectToken(renderer, 'this.battleActorHomePositions.set(unit.unitKey, new Vec3(combatHomePosition.x, combatHomePosition.y, 0))', 'tweens return to converged home');
expectToken(presentationState, '双方向中场推进，汇合后才开始首个行动。', 'opening copy states convergence before combat');
expectNoToken(aggregate, 'check-battle-stage13n', 'aggregate no longer forces old Stage 13N constants');
expectToken(screenshot, 'maxFrameDelta', 'preview telemetry checks frame-to-frame snap');
expectToken(screenshot, 'maxFrameSpeed', 'preview telemetry checks frame-time-normalized movement speed');
expectToken(screenshot, 'actor movement speed too high', 'preview telemetry fails on snap-speed actor movement');
expectNoToken(renderer, 'Math.abs(towardCenter) * 0.58', 'old shallow opening convergence ratio');
expectNoToken(renderer, 'slot.width * 1.72', 'old opening movement cap');

const sampleSlots = [
  { label: 'desktop front ally', x: -340, width: 246, lane: 0, expectedSign: -1 },
  { label: 'desktop back ally', x: -648, width: 246, lane: 1, expectedSign: -1 },
  { label: 'compact ally', x: -154, width: 172, lane: 0, expectedSign: -1 },
  { label: 'desktop front enemy', x: 340, width: 246, lane: 0, expectedSign: 1 },
  { label: 'desktop back enemy', x: 648, width: 246, lane: 1, expectedSign: 1 },
  { label: 'compact enemy', x: 154, width: 172, lane: 0, expectedSign: 1 },
];
for (const slot of sampleSlots) {
  const finalX = resolveOpeningFinalX(slot.x, slot.width, slot.lane);
  if (Math.sign(finalX) !== slot.expectedSign) {
    console.error(`opening center stop crosses center: ${slot.label} finalX=${finalX.toFixed(2)}`);
    ok = false;
  }
  if (Math.abs(finalX) < slot.width * 0.38) {
    console.error(`opening center stop too close to middle: ${slot.label} finalX=${finalX.toFixed(2)} width=${slot.width}`);
    ok = false;
  }
  if (Math.abs(finalX) > Math.abs(slot.x)) {
    console.error(`opening center stop moved away from middle: ${slot.label} finalX=${finalX.toFixed(2)} startX=${slot.x}`);
    ok = false;
  }
}

for (const token of ['/api/player/battles/settle', 'rewardGranted', 'staminaCost', 'DIAMOND', 'USDT', 'EX V1']) {
  expectNoToken(renderer, token, 'renderer economy/write token');
}

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13n ok');

function resolveOpeningFinalX(x, width, lane) {
  const laneStopGapRatios = [1.18, 1.46, 1.28, 1.56, 1.68];
  const towardCenter = -x;
  const distanceToCenter = Math.abs(towardCenter);
  const desiredDistance = distanceToCenter * 0.48;
  const laneGapRatio = laneStopGapRatios[lane] ?? 1.08;
  const centerStopDistance = clamp(width * laneGapRatio, width * 1.08, distanceToCenter);
  const maxDistanceBeforeCenter = Math.max(0, distanceToCenter - centerStopDistance);
  const cappedDistance = Math.min(
    clamp(desiredDistance, width * 0.46, width * 1.36),
    maxDistanceBeforeCenter || distanceToCenter,
  );
  return x + Math.sign(towardCenter || 1) * cappedDistance;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
