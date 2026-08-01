import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function expectToken(source, token, message) {
  if (!source.includes(token)) {
    throw new Error(`${message}: missing token ${token}`);
  }
}

function rejectToken(source, token, message) {
  if (source.includes(token)) {
    throw new Error(`${message}: forbidden token ${token}`);
  }
}

const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const formation = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');
const runtime = read('assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts');
const packageJson = read('package.json');

expectToken(renderer, "LOBBY_BATTLE_SCENE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'battle scene must use the desert horizontal background');
expectToken(renderer, 'LOBBY_BATTLE_EMBEDDED_BG_DATA_URL', 'battle scene keeps embedded background as fallback');
expectToken(renderer, 'addBattleBackgroundSprite', 'battle scene must prefer the resources background before embedded fallback');
expectToken(renderer, 'addEmbeddedBattleBackgroundSprite', 'battle scene must keep a real fallback background sprite');
expectToken(renderer, 'resolveActorMeleeDuelFrame', 'melee actor position must be resolved from the current target duel frame');
expectToken(renderer, 'BATTLE_MELEE_DUEL_CONTACT_GAP_RATIO', 'melee contact gap must be a named tuning constant');
expectToken(renderer, 'BATTLE_FLOATING_TEXT_MIN_CUE_INTERVAL_MS', 'floating text must be rate-limited per action cue');
expectToken(renderer, 'resolveBattleFloatingTextLaneOffset', 'floating text must spread by lane/cue instead of stacking at one point');
expectToken(renderer, 'recordBattleBackgroundTelemetry', 'preview telemetry must prove whether real background rendered');
expectToken(renderer, 'actorDuelPosition', 'melee contact helper must return absolute attacker duel coordinates');
expectToken(renderer, 'defenderDuelPosition', 'melee target must step into the same duel frame');
rejectToken(renderer, 'const contactGap = Math.max(source.width * 0.18, target.width * 0.14, 32 * scale);', 'old contact gap tied to source/target widths leaves melee actors visually off target');
rejectToken(renderer, 'x: contactX - source.x,\n      y: contactY - source.y,', 'melee contact helper must not return an offset that the caller subtracts again');

expectToken(formation, 'const standWidth = Math.min(270 * scale, width * 0.38);', 'formation actor stands must be readable without overlapping');
expectToken(formation, 'const standHeight = Math.min(350 * scale, height * 0.66);', 'formation actor height must be enlarged for readable heroes');
expectToken(formation, 'const visualHeight = height * 2.28;', 'formation spine preview must use larger visual bounds');
expectToken(formation, 'data, width, height, scale, unit, resourcePath', 'formation spine scale uses stand bounds, not oversized visual bounds');
rejectToken(formation, 'data, visualWidth, visualHeight, scale, unit, resourcePath', 'oversized visual bounds make formation heroes inconsistent');

expectToken(runtime, 'resolveBattleUnitFormationPreviewMaxHeightRatio(unit, tier)', 'formation preview max height must be rarity-aware');
expectToken(runtime, 'BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO = 0.53', 'SR/R formation actors use visually aligned preview height cap');
expectToken(runtime, '? BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO', 'SR/R formation actor cap is shared and readable');
expectToken(runtime, 'resolveBattleUnitSpineNodePosition', 'spine runtime bounds offset must be normalized to the stand foot point');
expectToken(renderer, 'resolveBattleUnitSpineNodePosition(runtimeData, spineScale, height, unit, enemy)', 'battle actor spine node must be aligned from runtime bounds');
expectToken(formation, 'resolveBattleUnitSpineNodePosition(runtimeData, spineScale, height, unit, false)', 'formation actor spine node must be aligned from runtime bounds');

expectToken(packageJson, '"check:battle-stage13w"', 'package scripts must expose the Stage 13W guard');

console.log('battle-stage13w ok');
