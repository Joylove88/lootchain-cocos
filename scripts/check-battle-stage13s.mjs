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
const timeline = read('assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts');
const actionPresentation = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const stage12Guard = read('scripts/check-battle-stage12.mjs');
const preview = read('scripts/check-preview-freshness.mjs');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');
const packageText = read('package.json');
const aggregate = read('scripts/check-battle-stage13i.mjs');
const readme = read('README.md');
const context = read('docs/current-chat-context.md');

expectToken(runtime, 'function resolveBattleUnitPortraitAssetAsBattleSpine', 'act portrait battle spine resolver');
expectToken(runtime, 'const portraitBattleSpineAsset = resolveBattleUnitPortraitAssetAsBattleSpine(unit.portraitAsset);', 'portrait act asset resolved before spineAsset');
expectToken(runtime, 'return portraitBattleSpineAsset', 'portrait act asset is first priority');
expectToken(runtime, '?? sanitizeSpineAsset(unit.spineAsset)', 'configured spineAsset remains fallback');
expectToken(runtime, "return value !== null && value.startsWith('act_') ? value : null;", 'only act_* portrait assets can override battle spine resource');
expectToken(runtime, 'export function resolveBattleUnitSpineLoadUuid', 'act portrait battle spine disables stale uuid resolver');
expectToken(runtime, 'primaryAsset === portraitBattleSpineAsset ? null : resolveBattleUnitSpineUuid(unit)', 'act portrait battle spine skips npc spineUuid');
expectNoToken(runtime, 'return sanitizeSpineAsset(unit.spineAsset)\n    ?? deriveBattleSpineAssetFromPortrait(unit.portraitAsset)', 'old npc-first SR/R battle spine resolution');

expectNoToken(stage12Guard, 'Stage 12 must prefer spineAsset over portraitAsset for battle runtime', 'obsolete Stage 12 spineAsset-first guard copy');
expectToken(preview, 'resolveBattleUnitPortraitAssetAsBattleSpine', 'preview freshness act portrait resolver token');
expectToken(preview, 'portrait_asset=act_*', 'preview freshness act portrait contract token');
expectToken(screenshot, 'resolveForcedSrRBattleFormation', 'battle screenshot forces SR/R formation');
expectToken(screenshot, 'hero.portraitAsset', 'battle screenshot selects SR/R act portrait heroes');
expectToken(screenshot, 'forcedSrRFormation', 'battle screenshot records forced SR/R formation');
expectToken(screenshot, 'route.continue', 'battle screenshot rewrites only its preview battle start request');
expectToken(screenshot, 'summary.srRSkillCueCount < 1', 'battle screenshot requires SR/R skill cue coverage');
expectToken(renderer, 'resolveBattleUnitSpineLoadUuid', 'battle renderer uses act-aware spine uuid resolver');
expectToken(renderer, 'const spineUuid = resolveBattleUnitSpineLoadUuid(unit);', 'battle actor load uses act-aware spine uuid resolver');
expectToken(renderer, 'const spineUuid = resolveBattleUnitSpineLoadUuid(actor);', 'battle target effect load uses act-aware spine uuid resolver');
expectToken(timeline, 'const actor = pickRoundAllyActor(allies, round, random);', 'battle timeline uses SR/R front act-aware actor picker');
expectToken(timeline, 'function isFrontSrRActBattleHero', 'battle timeline can identify front SR/R act hero');
expectToken(timeline, "portraitAsset.startsWith('act_')", 'battle timeline only prioritizes act portrait heroes for SR/R opening attack');
expectToken(timeline, 'timeMs: roundStart + 1_720', 'battle timeline leaves visible pre-hit attack window');
expectToken(actionPresentation, 'basic_attack: 760', 'battle action cue keeps SR/R basic attack visible long enough');
expectToken(actionPresentation, 'timeOffsetMs: 520', 'battle action cue delays basic attack after melee run-in');
expectToken(screenshot, "heroClass.includes('射')", 'battle screenshot treats Chinese marksman class as back row');
expectToken(screenshot, "heroClass.includes('远程')", 'battle screenshot treats ranged class as back row');
expectToken(screenshot, "requested === 'skill_01'", 'battle screenshot accepts SR/R legacy skill_01 cue as skill coverage');
expectToken(screenshot, 'safeLootChainPreviewExitFullscreen', 'battle screenshot guards Cocos Preview fullscreen rejection');
expectToken(screenshot, "Document not active", 'battle screenshot filters inactive document fullscreen rejection');

expectToken(packageText, '"check:battle-stage13s": "node ./scripts/check-battle-stage13s.mjs"', 'package script');
expectToken(aggregate, 'check-battle-stage13s', 'aggregate includes Stage 13S');
expectToken(readme, 'portrait_asset=act_*', 'README documents act portrait battle spine priority');
expectToken(context, 'portrait_asset=act_*', 'current context documents act portrait battle spine priority');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13s ok');
