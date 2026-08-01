import { existsSync, readFileSync } from 'node:fs';
let ok = true;
const f = 'assets/scripts/scenes/lobby/BattleFormationSceneRenderer.ts';
const m = f + '.meta';
if (!existsSync(f) || !existsSync(m)) { console.error('missing 13C files'); ok = false; }
if (ok) {
  const t = readFileSync(f, 'utf8');
  for (const tk of ['export class BattleFormationSceneRenderer', 'renderBattlefield', 'renderHeroList', 'renderSlot', 'toggleFormationHero', 'HERO_CLASS_TABS', 'BattleFormationChallengeButton']) {
    if (!t.includes(tk)) { console.error('missing 13C token: ' + tk); ok = false; }
  }
  for (const fb of ['/api/player/battles/settle', 'rewardGranted', 'staminaCost', 'DIAMOND', 'USDT', 'EX V1']) {
    if (t.includes(fb)) { console.error('forbidden 13C token: ' + fb); ok = false; }
  }
}
if (!ok) process.exit(1);
console.log('battle-stage13c ok');
