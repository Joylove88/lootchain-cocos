import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative) {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const errors = [];

const replay = read('assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts');
const hp = read('assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const completion = read('assets/scripts/scenes/lobby/LobbyBattleVisualCompletion.ts');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');
const packageJson = JSON.parse(read('package.json') || '{}');
const aggregate = read('scripts/check-battle-stage13i.mjs');

const requiredReplayTokens = [
  'BATTLE_REPLAY_ACTION_CADENCE_MS',
  'resolveBattleReplayActionCadenceMs',
  'BATTLE_REPLAY_MELEE_APPROACH_MS',
  'interface BattleReplayDerivedAttributes',
  'resolveBattleReplayDerivedAttributes',
  'resolveBattleReplayDamageResult',
  'monsterDurabilityMultiplier',
  'damageReduction',
  'targetState.maxHp',
  'targetState.currentHp',
  'livingEnemiesAfterThisHit',
  'targetState.dead = hpAfter <= 0',
  'finishingTargets',
  'createBattleReplaySeed(actor.unitKey)',
  'maxHp * 0.42',
];

for (const token of requiredReplayTokens) {
  if (!replay.includes(token)) {
    errors.push(`LobbyBattleReplayModel.ts missing sequential/HP-budget replay token: ${token}`);
  }
}

if (/actor\.power \* sideFactor/.test(replay)) {
  errors.push('LobbyBattleReplayModel.ts still uses raw actor power as the primary damage driver');
}

if (/const\s+BATTLE_REPLAY_ACTION_SPACING_MS/.test(replay)) {
  errors.push('LobbyBattleReplayModel.ts still uses the old overlapping action spacing constant');
}

for (const token of [
  'deadAtMs',
  'hit.killed ? hit.timeMs : null',
  'resolveBattlePresentationDeadAtMs',
  'target.currentHp = Math.max(0, Math.min(target.maxHp, hit.hpAfter))',
  'target.dead = target.currentHp <= 0',
]) {
  if (!hp.includes(token)) {
    errors.push(`LobbyBattlePresentationHp.ts missing death timing token: ${token}`);
  }
}

for (const token of [
  'resolveLobbyBattleVisualCompletionDurationMs',
  'isBattleVisualResultReady',
  'resolveBattleVisualOutcome',
]) {
  if (!completion.includes(token)) {
    errors.push(`LobbyBattleVisualCompletion.ts missing visual completion token: ${token}`);
  }
}

for (const token of [
  'applyBattlePresentationResultDefeatHpState',
  "phase !== 'resultRecording' && phase !== 'resultRecorded'",
]) {
  if (hp.includes(token)) {
    errors.push(`LobbyBattlePresentationHp.ts still has fake result HP token: ${token}`);
  }
}

for (const token of [
  'resolveCueActivationLeadWindowMs',
  "cue.kind === 'melee_move' || cue.kind === 'ranged_projectile'",
]) {
  if (!read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts').includes(token)) {
    errors.push(`LobbyBattleActionPresentation.ts missing no-early-attack cue activation token: ${token}`);
  }
}

for (const token of [
  'const BATTLE_USE_STICKY_CONTACT_POSITIONS = true',
  'resolveBattleActorChargeLaneGap',
  'const BATTLE_DEAD_ACTOR_HIDE_DELAY_MS',
  'isBattleVisualResultReady',
  'renderResultBanner(field, fieldRect.width, fieldRect.height, scale, state, presentation, snapshot, hpState, playbackTimelineTimeMs)',
  'const sameBattleScene = this.lastBattleSceneKey === sceneKey',
  'if (!sameBattleScene)',
  'isBattleActorVisiblyDead',
  'recordBattleDeadActorHiddenTelemetry',
  'recordBattleDeadActorHiddenTelemetry(unit, enemy, hpUnit, hpState',
  'telemetry.hpSamples = hpSamples',
]) {
  if (!renderer.includes(token)) {
    errors.push(`LobbyBattlePreviewPanelRenderer.ts missing no-snap/death-hide token: ${token}`);
  }
}

if (!/currentActionCue\.targetKey === unit\.unitKey && \(currentActionCue\.kind === 'melee_move' \|\| currentActionCue\.kind === 'basic_attack'\)[\s\S]*?return \{ x: 0, y: 0 \};/.test(renderer)) {
  errors.push('LobbyBattlePreviewPanelRenderer.ts still moves defenders during melee/basic contact instead of only recoiling on hit');
}

for (const token of [
  'resolveBattleHpPresentationPhase',
  "return 'resultRecording'",
  "rootMotionCue?.kind === 'damage_float'",
]) {
  if (renderer.includes(token)) {
    errors.push(`LobbyBattlePreviewPanelRenderer.ts still has stale no-snap/result token: ${token}`);
  }
}

for (const token of [
  'namedSpineCueCount',
  'namedAtkCueCount',
  'namedSkillCueCount',
  'damageOneShotSampleCount',
  'enemyLastHpRatioMax',
  'deadActorHiddenSampleCount',
  'maxFrameDeltaLimit = 126',
]) {
  if (!screenshot.includes(token)) {
    errors.push(`screenshot-battle-center-convergence.cjs missing strict visual acceptance token: ${token}`);
  }
}

if (packageJson.scripts?.['check:battle-stage13z3'] !== 'node ./scripts/check-battle-stage13z3.mjs') {
  errors.push('package.json missing check:battle-stage13z3 script');
}

if (packageJson.scripts?.['repair:preview-battle-action-cue-window'] !== 'node ./scripts/repair-preview-battle-action-cue-window.mjs') {
  errors.push('package.json missing repair:preview-battle-action-cue-window script');
}

if (packageJson.scripts?.['repair:preview-battle-result-hp'] !== 'node ./scripts/repair-preview-battle-result-hp.mjs') {
  errors.push('package.json missing repair:preview-battle-result-hp script');
}

if (!aggregate.includes('check-battle-stage13z3')) {
  errors.push('check-battle-stage13i.mjs missing check-battle-stage13z3 aggregate guard');
}

if (errors.length > 0) {
  console.error(`battle-stage13z3 guard failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('battle-stage13z3 guard passed.');
