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

const root = read('assets/scripts/scenes/LootChainGameRoot.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');

expectToken(root, 'const selected = this.normalizeLobbyFormationHeroIds(this.selectedLobbyFormationHeroIds);', 'explicit formation selection is normalized separately from default lineup');
expectToken(root, 'return selected.length > 0 ? selected : this.defaultLobbyFormationHeroIds();', 'manual underfilled formation is not default-filled');
expectToken(root, 'this.selectedLobbyFormationHeroIds.length > 0', 'reconcile preserves manual formation intent');
expectToken(root, '阵容已满，请先点击已上阵英雄下阵，再选择新英雄。', 'full formation requires explicit bench action');
expectNoToken(root, 'next[replaceIndex >= 0 ? replaceIndex : next.length - 1] = hero.id;', 'old silent replace first slot behavior');
expectToken(renderer, '点击已上阵英雄可下阵', 'formation UI explains bench interaction');
expectToken(renderer, 'LobbyFormationActorDownHint', 'actor stand has bench affordance');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13o ok');
