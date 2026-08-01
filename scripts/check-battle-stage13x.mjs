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

const layout = read('assets/scripts/scenes/lobby/LobbyBattlePresentationLayout.ts');
const action = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const formation = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');
const repair = read('scripts/repair-preview-stage13v.mjs');
const packageText = read('package.json');

expectToken(renderer, "LOBBY_BATTLE_SCENE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'dark cathedral battle background');
expectToken(renderer, "LOBBY_BATTLE_SCENE_GROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'dark cathedral ground layer');
expectToken(renderer, "LOBBY_BATTLE_SCENE_FOREGROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'dark cathedral foreground layer');
expectToken(formation, "FORMATION_BATTLE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'formation uses the same dark battle background');
expectToken(formation, "FORMATION_BATTLE_GROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'formation uses the same dark battle ground');
expectToken(renderer, 'addBattleBackgroundSprite', 'battle loads resources background before embedded fallback');
expectToken(renderer, 'BATTLE_MELEE_DUEL_CONTACT_GAP_RATIO', 'melee contact gap is expressed as a duel tuning constant');
expectToken(renderer, 'BATTLE_MELEE_DUEL_DEFENDER_STEP_RATIO', 'defender meet-up step is expressed as a duel tuning constant');
expectToken(renderer, 'resolveActorMeleeDuelFrame', 'melee actions resolve one attacker/defender duel frame around the current target');
expectToken(renderer, 'actorDuelPosition', 'attacker locks to the per-action duel point');
expectToken(renderer, 'defenderDuelPosition', 'defender makes only a small target-front step during melee');
expectToken(renderer, 'hitPoint', 'floating numbers and hit effects anchor to the current action hit point');
expectToken(renderer, 'cleanupBattleTransientEffectLayers', 'floating/effect layers are cleaned instead of accumulating for the whole combat');
expectToken(renderer, 'BATTLE_FLOATING_TEXT_LIFETIME_MS', 'floating numbers have an explicit lifetime');
expectToken(renderer, 'BATTLE_USE_STICKY_CONTACT_POSITIONS = true', 'melee contact position persists after approach instead of restarting from home');
expectToken(renderer, 'isBattleActorCueApproaching', 'approach phase drives run animation before strike');
expectToken(renderer, 'BATTLE_ACTION_CALLOUT_ENABLED = false', 'debug-like action callouts stay disabled in real combat');
expectToken(renderer, 'drawStage13XBattleFallbackLandscape', 'fallback landscape is the Stage 13X dark battle scene, not the old green map');
expectToken(layout, 'BATTLE_STAGE13X_FORMATION_OFFSETS', 'battle positions use the Stage 13X lane spread');
expectToken(layout, 'BATTLE_STAGE13X_ACTOR_HEIGHT_RATIO', 'battle actor height is tuned through Stage 13X ratio');
expectToken(action, 'basic_attack: 1120', 'basic attack window is long enough to hold attack at the target');
expectToken(action, 'damage_float: 560', 'damage float window is short enough to avoid text pile-up');
expectToken(formation, 'const standWidth = Math.min(270 * scale, width * 0.38);', 'formation actor stand is enlarged without overlapping');
expectToken(formation, 'const standHeight = Math.min(350 * scale, height * 0.66);', 'formation actor height is enlarged');
expectToken(screenshot, 'allMeleeBasicAttackContactMedian', 'screenshot checks all melee contact, not only one SR/R sample');
expectToken(screenshot, 'maxPersistentFloatingTextLayers', 'screenshot checks floating text does not accumulate');
expectToken(screenshot, "!['asset', 'embedded'].includes(summary.backgroundSource)", 'screenshot requires image-backed Stage 13Y background');
expectToken(repair, 'battle_scene_cathedral/spriteFrame', 'Preview repair patches stale chunks to the dark cathedral background');
expectToken(repair, 'patchBattleCathedralBackgroundAssets', 'Preview repair patches stale background assets to the dark cathedral');
expectToken(repair, 'patchStage13XMeleeDuelFrame', 'Preview repair keeps the Stage 13X melee duel frame logic in stale chunks');
expectToken(repair, 'BATTLE_MELEE_CONTACT_GAP_RATIO = 0.035;', 'Preview repair uses the target-front melee contact ratio');
expectToken(repair, 'BATTLE_MELEE_DEFENDER_STEP_RATIO = 0.1;', 'Preview repair keeps defender meet-up visible while attackers run to target front');
expectToken(packageText, '"check:battle-stage13x": "node ./scripts/check-battle-stage13x.mjs"', 'package exposes Stage 13X guard');

expectNoToken(renderer, "LOBBY_BATTLE_SCENE_BG_ASSET = 'ui/battle/stage13v/forest_battle_bg/spriteFrame'", 'old green/forest fallback battle background');
expectNoToken(renderer, "LOBBY_BATTLE_SCENE_BG_ASSET = 'ui/battle/stage13x/boundary_battle_bg/spriteFrame'", 'old dark boundary battle background');
expectNoToken(renderer, "LOBBY_BATTLE_SCENE_BG_ASSET: string = 'ui/battle/stage13y/battle_stage_bg/spriteFrame'", 'old bright Stage 13Y battle background');
expectNoToken(formation, "FORMATION_BATTLE_BG_ASSET = 'ui/battle/stage13v/forest_battle_bg/spriteFrame'", 'old formation background');
expectNoToken(renderer, 'rgba(89, 125, 101, 235)', 'old green fallback ground color');
expectNoToken(renderer, 'rgba(36, 73, 76, 255)', 'old teal fallback sky color');
expectNoToken(repair, '(89, 125, 101, 235)', 'old green fallback ground color in Preview repair script');
expectNoToken(repair, '(36, 73, 76, 255)', 'old teal fallback sky color in Preview repair script');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13x ok');
