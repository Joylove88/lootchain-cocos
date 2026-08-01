import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative) {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const errors = [];

const replay = read('assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts');
const action = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const hp = read('assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const packageJson = JSON.parse(read('package.json') || '{}');
const aggregate = read('scripts/check-battle-stage13i.mjs');

for (const token of [
  'BATTLE_REPLAY_MAX_ACTIONS',
  'resolveBattleReplayCombatActions',
  'resolveBattleReplayCombatOrder',
  'resolveBattleReplayActionSide',
  'hasLivingSide(units, \'ally\')',
  'hasLivingSide(units, \'enemy\')',
  'selectBattleReplayTarget',
  'createSyntheticBattleReplayHit',
  'battleEndMs',
  'victory: hasLivingSide(units, \'ally\') && !hasLivingSide(units, \'enemy\')',
  'durationMs: battleEndMs',
]) {
  if (!replay.includes(token)) {
    errors.push(`LobbyBattleReplayModel.ts missing full-loop replay token: ${token}`);
  }
}

if (/const\s+actionStarts\s*=\s*sortedEvents\.filter/.test(replay)) {
  errors.push('LobbyBattleReplayModel.ts still derives replay actions directly from timeline action_start events');
}

if (/actionStarts\.forEach/.test(replay)) {
  errors.push('LobbyBattleReplayModel.ts still limits combat to existing action_start events');
}

if (!renderer.includes('BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 300') || !renderer.includes('resolveBattleActorChargeLaneGap')) {
  errors.push('LobbyBattlePreviewPanelRenderer.ts must use the sustained-clash charge distance plus lane gap sampling');
}

for (const token of [
  'BATTLE_ACTOR_CLASH_APPROACH_LUNGE_X = 108',
  'BATTLE_ACTOR_CLASH_ATTACK_LUNGE_X = 88',
  'BATTLE_ACTOR_CLASH_HIT_HOLD_LUNGE_X = 82',
  'resolveActorClashLungeOffset',
]) {
  if (!renderer.includes(token)) {
    errors.push(`LobbyBattlePreviewPanelRenderer.ts missing sustained-clash lunge token: ${token}`);
  }
}

for (const token of [
  'action.hitEvents.forEach',
  'createDamageCueFromReplayHit',
  'createHitCueFromReplayHit',
]) {
  if (!action.includes(token)) {
    errors.push(`LobbyBattleActionPresentation.ts missing replay hit cue token: ${token}`);
  }
}

for (const token of [
  'hit.hpBefore',
  'hit.hpAfter',
  'hit.timeMs <= visibleTimeMs + 1',
  'enemyTotalHpRatio',
]) {
  if (!hp.includes(token)) {
    errors.push(`LobbyBattlePresentationHp.ts missing HP replay token: ${token}`);
  }
}

if (packageJson.scripts?.['check:battle-stage13z2'] !== 'node ./scripts/check-battle-stage13z2.mjs') {
  errors.push('package.json missing check:battle-stage13z2 script');
}

if (packageJson.scripts?.['repair:preview-battle-contact-spacing'] !== 'node ./scripts/repair-preview-battle-contact-spacing.mjs') {
  errors.push('package.json missing repair:preview-battle-contact-spacing script');
}

if (!aggregate.includes('check-battle-stage13z2')) {
  errors.push('check-battle-stage13i.mjs missing check-battle-stage13z2 aggregate guard');
}

if (errors.length > 0) {
  console.error(`battle-stage13z2 guard failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('battle-stage13z2 guard passed.');
