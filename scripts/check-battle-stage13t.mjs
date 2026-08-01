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
const formation = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');
const battle = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');
const previewRepair = read('scripts/repair-preview-stage13t.mjs');
const packageText = read('package.json');
const aggregate = read('scripts/check-battle-stage13i.mjs');
const context = read('docs/current-chat-context.md');

expectToken(runtime, 'maxWidthRatio: 1.38', 'wide Spine visual profile so broad hair/effect skeletons are not shrunk in formation');
expectToken(runtime, 'SR: { targetHeightRatio: 1.42, maxWidthRatio: 3.08', 'SR act Spine profile is enlarged to match named heroes');
expectToken(runtime, 'R: { targetHeightRatio: 1.42, maxWidthRatio: 3.08', 'R act Spine profile stays visually consistent with SR');
expectToken(runtime, 'BATTLE_STAGE12_SPINE_PROFILE_BY_ASSET', 'named hero Spine visual profile map');
expectToken(runtime, 'Nuu: BATTLE_STAGE12_NUU_SPINE_PROFILE', 'Nuu uses a dedicated visual scale profile');
expectToken(runtime, 'scaleMultiplier: 0.92', 'named hero Spine profile no longer overwhelms SR/R units');
expectToken(runtime, 'scaleMultiplier: 1.02', 'Nuu profile is capped near the common combat size');
expectNoToken(runtime, 'maxWidthRatio: 0.7', 'old narrow battle Spine width cap');
expectNoToken(runtime, 'maxWidthRatio: 0.72', 'old narrow SSR/default Spine width cap');
expectNoToken(runtime, 'maxWidthRatio: 0.78', 'old narrow boss/default Spine width cap');

expectToken(formation, 'resolveBattleUnitSpineLoadUuid', 'formation uses act-aware spine uuid resolver');
expectToken(formation, 'const spineUuid = resolveBattleUnitSpineLoadUuid(unit);', 'formation avoids stale npc uuid for act portrait heroes');

expectToken(battle, 'resolveActorTargetMeetOffset', 'melee movement uses target-front meet point');
expectToken(battle, 'resolveActorDefenderMeetOffset', 'defender steps forward to meet melee attackers');
expectToken(battle, 'const contactGap = Math.max(source.width * 0.18, target.width * 0.14, 32 * scale);', 'melee contact is tight enough to read as close combat');
expectToken(battle, 'const contactX = defenderMeetX + (target.enemy ? -1 : 1) * contactGap;', 'melee contact X is derived from target side after defender meet');
expectToken(battle, 'x: contactX - source.x,', 'melee movement covers the full source-to-contact distance');
expectToken(battle, 'return \'run\';', 'melee approach plays run before attack animation');
expectNoToken(battle, 'const desired = towardTarget - Math.sign(towardTarget || direction) * safeDistance;', 'old melee formula could move away from close targets');
expectNoToken(battle, 'Math.sign(desired || minStep) * capped', 'old melee formula used desired sign instead of target sign');
expectNoToken(battle, 'slot.width * 1.05', 'old slot-width melee cap stopped actors before reaching distant targets');
expectNoToken(battle, 'const visibleLunge = Math.min(Math.abs(towardTarget) * 0.64', 'old lunge formula could still look like in-place attacks');

expectToken(screenshot, 'srRMeleeApproachSampleCount', 'battle screenshot validates SR/R melee approach samples');
expectToken(screenshot, 'srRBasicAttackContactSampleCount', 'battle screenshot validates SR/R melee reaches target contact');
expectToken(screenshot, 'basicAttackActorSamples', 'battle screenshot inspects basic attack actor movement');
expectToken(screenshot, 'SR/R basic attack actor did not visibly approach target', 'battle screenshot fails when melee attacks look in-place');
expectToken(screenshot, 'SR/R basic attack actor did not reach target contact range', 'battle screenshot fails when melee does not reach target');
expectToken(previewRepair, 'primaryAsset === \'Nuu\'', 'preview repair syncs Stage 13T named Spine profile');
expectToken(previewRepair, 'contactGap', 'preview repair syncs Stage 13T melee contact patch');

expectToken(packageText, '"check:battle-stage13t": "node ./scripts/check-battle-stage13t.mjs"', 'package script');
expectToken(aggregate, 'check-battle-stage13t', 'aggregate includes Stage 13T');
expectToken(context, 'Stage 13T', 'current context records formation scale and melee contact patch');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13t ok');
