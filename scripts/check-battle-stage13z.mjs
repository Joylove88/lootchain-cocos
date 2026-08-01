import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative) {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const errors = [];

const requiredFiles = [
  'assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts',
  'assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, relative))) {
    errors.push(`missing required file: ${relative}`);
  }
}

const replay = read('assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts');
for (const token of [
  'export interface BattleReplayUnitState',
  'export interface BattleReplayHitEvent',
  'hpBefore: number',
  'hpAfter: number',
  'export interface BattleReplayAction',
  'export interface BattleReplay',
  'export function resolveBattleReplay',
  'BattlePresentationSnapshot',
  'BattlePresentationTimeline',
  'movementKind',
  'hitEvents',
]) {
  if (!replay.includes(token)) {
    errors.push(`LobbyBattleReplayModel.ts missing token: ${token}`);
  }
}

const action = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
for (const token of [
  "import { resolveBattleReplay",
  'resolveBattleReplay(snapshot, timeline)',
  'createActionCueFromReplayAction',
  'createDamageCueFromReplayHit',
  'createHitCueFromReplayHit',
]) {
  if (!action.includes(token)) {
    errors.push(`LobbyBattleActionPresentation.ts missing token: ${token}`);
  }
}

const hp = read('assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts');
for (const token of [
  "import { resolveBattleReplay",
  'resolveBattleReplay(snapshot, timeline)',
  'hit.hpBefore',
  'hit.hpAfter',
  'appliedHitKeys',
]) {
  if (!hp.includes(token)) {
    errors.push(`LobbyBattlePresentationHp.ts missing token: ${token}`);
  }
}

const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
for (const token of [
  'BATTLE_ENABLE_IDLE_CLASH_COMBAT = false',
  'BATTLE_ENABLE_IDLE_CLASH_COMBAT && combatActive',
  'const targetMeetMotion = false;',
]) {
  if (!renderer.includes(token)) {
    errors.push(`LobbyBattlePreviewPanelRenderer.ts missing token: ${token}`);
  }
}

const packageJson = JSON.parse(read('package.json') || '{}');
if (packageJson.scripts?.['check:battle-stage13z'] !== 'node ./scripts/check-battle-stage13z.mjs') {
  errors.push('package.json missing check:battle-stage13z script');
}

const aggregate = read('scripts/check-battle-stage13i.mjs');
if (!aggregate.includes('check-battle-stage13z')) {
  errors.push('check-battle-stage13i.mjs missing check-battle-stage13z aggregate guard');
}

if (errors.length > 0) {
  console.error(`battle-stage13z guard failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('battle-stage13z guard passed.');
