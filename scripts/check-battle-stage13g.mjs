import { existsSync, readFileSync } from 'node:fs';

let ok = true;
const audioFile = 'assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts';
const rendererFile = 'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts';

for (const file of [audioFile, rendererFile]) {
  if (!existsSync(file)) {
    console.error(`missing 13G file: ${file}`);
    ok = false;
  }
}

if (ok) {
  const audio = readFileSync(audioFile, 'utf8');
  const renderer = readFileSync(rendererFile, 'utf8');
  for (const token of [
    'export function resolveBattleAudioRuntimePlan',
    'battleBgm',
    'battleStart',
    'heroBasicAttack',
    'rangedAttack',
    'hitLight',
    'heroSkill',
    'healCast',
    'buffApply',
    'visualVictory',
    '纯表现音频',
  ]) {
    if (!audio.includes(token)) {
      console.error(`missing 13G audio token: ${token}`);
      ok = false;
    }
  }
  for (const token of [
    'resolveBattleAudioRuntimePlan(state, presentation, snapshot, currentTimelineEvent, currentActionCue, currentAssistCue)',
    'renderStage11BattleAudioRuntime',
    'playBattleAudioCue',
    'isBattleAudioSourceNodeValid',
  ]) {
    if (!renderer.includes(token)) {
      console.error(`missing 13G renderer integration token: ${token}`);
      ok = false;
    }
  }
  for (const forbidden of ['/api/player/battles/settle', 'rewardGranted', 'staminaCost', 'DIAMOND', 'USDT', 'EX V1']) {
    if (audio.includes(forbidden)) {
      console.error(`forbidden 13G token in audio runtime: ${forbidden}`);
      ok = false;
    }
  }
}

if (!ok) {
  process.exit(1);
}
console.log('battle-stage13g ok');
