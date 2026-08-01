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

const battle = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const formation = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');
const repair = read('scripts/repair-preview-stage13v.mjs');
const packageText = read('package.json');
const context = read('docs/current-chat-context.md');

expectToken(battle, 'resolveActorMeleeContactPosition', 'melee root motion uses target-front meet coordinates');
expectToken(battle, 'resolveActorDefenderMeetOffset', 'target also steps forward for close combat');
expectToken(battle, 'BATTLE_MELEE_DUEL_CONTACT_GAP_RATIO', 'contact point is tight enough for close combat');
expectToken(battle, 'defenderDuelPosition', 'contact point is derived from the target side after defender meet');
expectToken(battle, 'const actionLaneOffset = this.resolveBattleActionLaneOffset(currentActionCue, scale);', 'melee contact separates repeated attackers by lane offset');
expectToken(battle, 'contact.x - source.x', 'actor moves from current anchor to target contact X');
expectToken(battle, 'contact.y - source.y', 'actor moves from current anchor to target contact Y');
expectToken(battle, 'const approachMs = Math.min(BATTLE_ACTOR_MELEE_APPROACH_MS, Math.max(320, cue.durationMs * 0.55));', 'melee move reaches contact before basic attack under compressed timeline');
expectToken(battle, "if (cue.kind === 'basic_attack') {", 'basic attack keeps actor at target contact instead of restarting from home');
expectToken(battle, 'return targetPosition;', 'basic attack fallback holds target contact through the strike window');
expectToken(battle, 'resolveBattleSpineCuePlaybackKey', 'spine playback key includes animation name so run and skill0 can both play');
expectNoToken(battle, 'const visibleLunge = Math.min(Math.abs(towardTarget) * 0.64', 'old slot-width lunge can still look like in-place attacks');

expectToken(formation, 'const standWidth = Math.min(330 * scale, width * 0.46);', 'formation actor stand is enlarged for SR/R act skeletons');
expectToken(formation, 'const standHeight = Math.min(430 * scale, height * 0.82);', 'formation actor height is enlarged for consistent hero preview size');
expectToken(formation, "scaleProfile: 'FORMATION_PREVIEW',", 'formation preview uses a dedicated scale profile');
expectToken(formation, 'const visualWidth = width * 2.36;', 'formation spine node gives act skeletons enough visual canvas');
expectToken(formation, 'const visualHeight = height * 2.28;', 'formation spine visual height gives act skeletons enough room');

expectToken(screenshot, 'const meleeContactRange = 380;', 'visual screenshot enforces sustained melee contact rather than loose approach');
expectToken(screenshot, 'const maxFrameSpeedLimit = 5.6;', 'visual screenshot speed guard accounts for x2 battle playback');
expectToken(screenshot, 'srRBasicAttackClosestDistance', 'screenshot reports closest SR/R contact distance');
expectToken(screenshot, 'options.requireSrRSkill === true', 'SR/R skill cue remains optional because backend action mix is not deterministic');

expectToken(repair, 'patchBattleCathedralBackgroundAssets', 'preview repair script is present');
expectToken(repair, 'resolveActorMeleeContactPosition(currentActionCue, anchors, scale)', 'preview repair patches target-contact helper');
expectToken(repair, "targetHeightRatio: 1.42", 'preview repair patches enlarged SR/R act skeleton profile');
expectToken(repair, "cue.kind === 'melee_move' || cue.kind === 'ranged_projectile'", 'preview repair prevents basic_attack root-motion ownership');
expectToken(repair, 'resolveBattleSpineCuePlaybackKey', 'preview repair patches animation-specific spine cue key');

expectToken(packageText, '"check:battle-stage13u": "node ./scripts/check-battle-stage13u.mjs"', 'package script');
expectToken(packageText, '"repair:preview-stage13v": "node ./scripts/repair-preview-stage13v.mjs"', 'package preview repair script');
expectToken(context, 'Stage 13U', 'current context records target-contact and formation-size patch');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13u ok');
