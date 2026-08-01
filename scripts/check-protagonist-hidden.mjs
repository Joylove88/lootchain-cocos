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

const protagonistFlow = read('assets/scripts/scenes/protagonist/ProtagonistCreateFlow.ts');
const root = read('assets/scripts/scenes/LootChainGameRoot.ts');
const lobbyHeroApi = read('assets/scripts/api/LobbyHeroApi.ts');
const battleFlow = read('assets/scripts/scenes/lobby/LobbyBattleFlow.ts');
const battleSnapshot = read('assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts');
const previewFreshness = read('scripts/check-preview-freshness.mjs');
const packageJson = read('package.json');

expectToken(protagonistFlow, 'HIDDEN_PROTAGONIST_CREATE_REQUEST', 'hidden protagonist auto-create request');
expectToken(protagonistFlow, 'ensureHiddenProtagonistReady', 'hidden protagonist login initializer');
expectToken(protagonistFlow, 'this.ensureHiddenProtagonistReady(ticket)', 'login skips manual protagonist selection');
expectNoToken(protagonistFlow, "this.host.showProtagonistCreateView();", 'manual protagonist create view from login flow');
expectNoToken(protagonistFlow, '请先创建你的圣契主角。', 'manual protagonist create prompt');

expectToken(lobbyHeroApi, 'isHiddenProtagonistHero(item)', 'lobby hero API hides protagonist records');
expectToken(lobbyHeroApi, '!isHiddenProtagonistHero(item)', 'lobby hero API filters hidden protagonist');

expectToken(root, '!hero.protagonist', 'root selectable heroes filter protagonist');
expectNoToken(root, '主角当前固定为队长', 'fixed protagonist leader status');
expectNoToken(root, 'const protagonist = heroes.find((hero) => hero.protagonist);', 'formation force-inserts protagonist');
expectNoToken(root, 'Number(b.protagonist) - Number(a.protagonist)', 'root protagonist priority sort');

expectToken(battleFlow, '!hero.protagonist', 'battle start filters protagonist');
expectToken(battleFlow, 'const leader = heroes[0];', 'battle start leader uses first visible hero');
expectNoToken(battleFlow, 'heroes.find((hero) => hero.protagonist)', 'battle start protagonist leader');
expectNoToken(battleFlow, 'Number(b.protagonist) - Number(a.protagonist)', 'battle start protagonist priority sort');

expectToken(battleSnapshot, '!hero.protagonist', 'battle snapshot fallback filters protagonist');
expectNoToken(battleSnapshot, 'Number(b.protagonist) - Number(a.protagonist)', 'battle snapshot protagonist priority sort');

expectToken(previewFreshness, 'HIDDEN_PROTAGONIST_CREATE_REQUEST', 'preview freshness checks hidden protagonist initializer');
expectToken(previewFreshness, '!hero.protagonist', 'preview freshness checks protagonist filtering');
expectToken(packageJson, '"check:protagonist-hidden"', 'package script for protagonist hidden guard');

if (!ok) {
  process.exit(1);
}

console.log('protagonist-hidden ok');
