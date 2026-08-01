import { existsSync, readFileSync } from 'node:fs';

let ok = true;
const runtimeFile = 'assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts';
const rendererFile = 'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts';

for (const file of [runtimeFile, rendererFile]) {
  if (!existsSync(file)) {
    console.error(`missing 13D file: ${file}`);
    ok = false;
  }
}

if (ok) {
  const runtime = readFileSync(runtimeFile, 'utf8');
  const renderer = readFileSync(rendererFile, 'utf8');
  for (const token of [
    'Stage 13D 严格稀有度动画名映射契约',
    'resolveSsrUrSpineAnimationNames',
    'resolveSrRSpineAnimationNames',
    'skill1_kz',
    'skill2_kz',
    'win_1',
    'win_2',
    'resolveBattleUnitSpineScale',
  ]) {
    if (!runtime.includes(token)) {
      console.error(`missing 13D runtime token: ${token}`);
      ok = false;
    }
  }
  for (const token of [
    'resolveBattleUnitSpineAnimationNames(data, unit)',
    'resolveBattleUnitSpineCueAnimation',
    'resolveBattleUnitSpineLoadUuid(unit)',
    'loadResourceFallback',
    'destroyFallback',
  ]) {
    if (!renderer.includes(token)) {
      console.error(`missing 13D renderer integration token: ${token}`);
      ok = false;
    }
  }
  for (const forbidden of ['/api/player/battles/settle', 'rewardGranted', 'staminaCost', 'DIAMOND', 'USDT', 'EX V1']) {
    if (runtime.includes(forbidden)) {
      console.error(`forbidden 13D token in runtime: ${forbidden}`);
      ok = false;
    }
  }
}

if (!ok) {
  process.exit(1);
}
console.log('battle-stage13d ok');
