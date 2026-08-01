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
const snapshot = read('assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts');
const impact = read('assets/scripts/scenes/lobby/LobbyBattleImpactDirector.ts');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');
const aggregate = read('scripts/check-battle-stage13i.mjs');
const packageJson = JSON.parse(read('package.json') || '{}');

for (const token of [
  'interface BattleReplayDerivedAttributes',
  'resolveBattleReplayDerivedAttributes',
  'resolveBattleReplayStatContext',
  'monsterDurabilityMultiplier',
  'attack:',
  'defense:',
  'evasionRate:',
  'damageReduction:',
  'critRate:',
  'critDamage:',
  'resolveBattleReplayDamageResult',
  'didEvade',
  // 真实数值对抗(2026-07-10):power 主导派生 + 对称节奏夹,取代旧的"我方恒18~46%/敌人恒3~18%"偏袒模型。
  'enemyAttackMul',
  'const minHit = Math.max(1, Math.floor(maxHp * 0.02 * damageScale))',
  'const maxSingleHit = Math.max(1, Math.floor(maxHp * 0.55))',
  'selectBattleReplayTarget',
  'isBattleReplayUnitAlive(units, unit.unitKey)',
  'BATTLE_REPLAY_ACTION_CADENCE_MS',
  'resolveBattleReplayActionCadenceMs',
  'nextActionStartMs = startMs + resolveBattleReplayActionCadenceMs',
]) {
  if (!replay.includes(token)) {
    errors.push(`LobbyBattleReplayModel.ts missing real-combat token: ${token}`);
  }
}

if (/const\s+BATTLE_REPLAY_MAX_ACTIONS\s*=\s*60/.test(replay)) {
  errors.push('LobbyBattleReplayModel.ts still allows the old long fake replay action count without pacing rebalance');
}

// 负向锁:旧的"我方每刀恒占目标血量高百分比、敌人恒低百分比"偏袒模型不得复活(会让战力/属性差失效)。
if (replay.includes("maxHp * (actor.side === 'ally' ? 0.18 : 0.03)")) {
  errors.push('LobbyBattleReplayModel.ts reintroduced the ally-favoring percent-of-maxHp damage floor (breaks real power-based combat)');
}

if (replay.includes('nextActionStartMs = endMs + BATTLE_REPLAY_ACTION_GAP_MS')) {
  errors.push('LobbyBattleReplayModel.ts still serializes combat by waiting for each action endMs before the next action');
}

for (const token of [
  'appliedHitKeys',
  'hit.hitKey',
  'hit.evaded',
  'lastDamageHitKey',
  'target.currentHp = Math.max(0, Math.min(target.maxHp, hit.hpAfter))',
]) {
  if (!hp.includes(token)) {
    errors.push(`LobbyBattlePresentationHp.ts missing hit-level HP token: ${token}`);
  }
}

for (const token of [
  'const BATTLE_USE_STICKY_CONTACT_POSITIONS = true',
  'const BATTLE_ENABLE_IDLE_CLASH_COMBAT = false',
  'const BATTLE_ENABLE_FRONT_CLASH_CHARGE = false',
  'resolveBattleActorMotionStartPosition',
  'BATTLE_STICKY_CONTACT_HOLD_MS',
  'const BATTLE_DEAD_ACTOR_HIDE_DELAY_MS = 0',
  'BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP = 112',
  'BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 300',
  'BATTLE_ACTOR_CLASH_IDLE_SWAY_X',
  'resolveBattleActorClashIdleOffset',
  'BATTLE_ACTOR_CLASH_APPROACH_LUNGE_X',
  'BATTLE_ACTOR_CLASH_ATTACK_LUNGE_X',
  'BATTLE_ACTOR_CLASH_HIT_HOLD_LUNGE_X',
  'resolveActorClashLungeOffset',
  'resolveBattleActorChargeLaneGap',
  'resolveActiveDamageActionCues',
  'const targetMeetMotion = false;',
  'currentCueInvolvesUnit',
  'hitKey: currentActionCue.hitKey',
  'eventSeq: currentActionCue.eventSeq',
  'lastDamageHitKey',
  'options.hitKey.length > 0',
  'deadAtMs:',
]) {
  if (!renderer.includes(token)) {
    errors.push(`LobbyBattlePreviewPanelRenderer.ts missing stage14 no-pile telemetry token: ${token}`);
  }
}

for (const token of [
  'classifyEnemyRole(enemy.role, index, enemy.enemyCode)',
  "value.includes('后排')",
  "value.includes('mage')",
]) {
  if (!snapshot.includes(token)) {
    errors.push(`LobbyBattlePresentationSnapshot.ts missing stage14 enemy role token: ${token}`);
  }
}

for (const token of [
  'distanceX: (isCritical ? 204 : 156) * safeScale',
  'liftY: (isCritical ? 36 : 28) * safeScale',
]) {
  if (!impact.includes(token)) {
    errors.push(`LobbyBattleImpactDirector.ts missing stage14 impact token: ${token}`);
  }
}

for (const token of [
  'maxLiveActorOverlapPairs',
  'perActionMeleeContactMissCount',
  'deadActorVisibleAfterDeadMsMax',
  'deadTargetSelectedActionCount',
  'hpDropCueMismatchCount',
  'hitKey',
  'eventSeq',
  'deadAtMs',
  'maxSimultaneousRootMotionActors',
  'rootMotionOverlapWindowCount',
  'bothSidesRootMotionWindowCount',
  'damageCadenceMedianMs',
  'longestDamageCueGapMs',
  'damageFloatingByHitKey',
  'finalFrontLineGapMedian',
  'postDamageFrontHoldMissCount',
  'isBackRoleBattleSample',
]) {
  if (!screenshot.includes(token)) {
    errors.push(`screenshot-battle-center-convergence.cjs missing stage14 acceptance token: ${token}`);
  }
}

if (packageJson.scripts?.['check:battle-stage14-real-combat'] !== 'node ./scripts/check-battle-stage14-real-combat.mjs') {
  errors.push('package.json missing check:battle-stage14-real-combat script');
}

if (!aggregate.includes('check-battle-stage14-real-combat')) {
  errors.push('check-battle-stage13i.mjs missing stage14 real combat aggregate guard');
}

if (errors.length > 0) {
  console.error(`battle-stage14-real-combat guard failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('battle-stage14-real-combat guard passed.');
