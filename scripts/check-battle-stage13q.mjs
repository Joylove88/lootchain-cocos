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

const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const formation = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');
const screenshotFormationSwitch = read('scripts/screenshot-formation-switch.cjs');
const aggregate = read('scripts/check-battle-stage13i.mjs');
const packageJson = read('package.json');

expectToken(renderer, "presentation.phase === 'roundPlaying'", 'full active battle footer suppression');
expectNoToken(renderer, "presentation.phase === 'roundPlaying' && !presentation.actionEnabled", 'old partial footer suppression');
expectToken(formation, 'recordFormationDebugSnapshot', 'formation runtime debug snapshot hook');
expectToken(formation, '__lootchainFormationDebug', 'formation runtime debug state for browser acceptance');
expectToken(formation, 'selectedHeroIds: [...selectedHeroIds]', 'formation debug records selected ids');
expectToken(formation, 'selectedCount: selectedHeroes.length', 'formation debug records selected count');
expectToken(screenshotFormationSwitch, "page.on('request'", 'formation switch captures browser requests');
expectToken(screenshotFormationSwitch, "url.includes('/api/player/')", 'formation switch only records player API requests');
expectToken(screenshotFormationSwitch, "request.method === 'POST' && request.url.includes('/settle')", 'formation switch blocks any player settle POST');
expectToken(screenshotFormationSwitch, "request.url.includes('/api/player/battles/start')", 'formation switch detects battle start requests');
expectToken(screenshotFormationSwitch, 'battleStartRequests.length > 0', 'formation switch fails if a battle start request occurs');
expectToken(screenshotFormationSwitch, 'settleRequests.length > 0', 'formation switch fails if a settle request occurs');
expectToken(screenshotFormationSwitch, 'lostAfterBenchIds.length > 0', 'formation switch preserves benched-state heroes');
expectToken(screenshotFormationSwitch, 'addedIds.length !== 1', 'formation switch requires exactly one newly added hero');
expectToken(screenshotFormationSwitch, 'originalIds.has(heroId)', 'formation switch requires adding a different hero');
expectToken(screenshotFormationSwitch, 'process.exit(1)', 'formation switch has hard failure path');
expectToken(packageJson, '"screenshot:formation-switch"', 'formation switch browser acceptance script');
expectToken(aggregate, 'check-battle-stage13q', 'aggregate includes Stage 13Q');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13q ok');
