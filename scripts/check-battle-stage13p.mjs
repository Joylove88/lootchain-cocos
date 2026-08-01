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

const runtime = read('assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');

expectToken(runtime, '  R: { targetHeightRatio: 1.42, maxWidthRatio: 3.08', 'R act visual height compensates for source skeleton padding');
expectToken(runtime, '  SR: { targetHeightRatio: 1.42, maxWidthRatio: 3.08', 'SR act visual height compensates for source skeleton padding');
expectToken(runtime, 'scaleMultiplier: 2.72', 'R/SR act skeletons are enlarged to match named heroes');
expectToken(renderer, 'const showActiveRing = active || targetActive || assistTargetActive;', 'actor rings only appear for active/target units');
expectToken(renderer, 'if (showActiveRing) {', 'inactive actors do not draw permanent halos');
expectToken(renderer, 'graphics.strokeColor = targetActive || assistTargetActive ? rgba(248, 196, 84, 176) : rgba(128, 104, 66, 92);', 'active ring is subdued and contextual');
expectNoToken(renderer, 'this.drawStage12CampPlate(parent, -width * 0.27', 'old ally camp halo call');
expectNoToken(renderer, 'this.drawStage12CampPlate(parent, width * 0.27', 'old enemy camp halo call');
expectNoToken(renderer, 'graphics.fillColor = rgba(126, 22, 26, 38);', 'old large red battlefield halo');
expectNoToken(renderer, 'width * (0.12 + 0.08 * progress)', 'old opening convergence halo');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13p ok');
