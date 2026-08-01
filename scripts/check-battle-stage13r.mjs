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
const action = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const assist = read('assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts');
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const preview = read('scripts/check-preview-freshness.mjs');
const packageText = read('package.json');
const aggregate = read('scripts/check-battle-stage13i.mjs');

expectToken(runtime, 'resolveBattleUnitSpineEnumAnimationNames(data)', 'binary skel enum animation fallback');
expectToken(runtime, 'const enumNames = resolveBattleUnitSpineEnumAnimationNames(data);', 'runtime animation names include Cocos enum names before patching');
expectToken(runtime, 'if (names.length === 0 && preferred) {', 'canonical animation fallback when binary runtime names are hidden');
expectToken(runtime, 'return preferred;', 'strict canonical cue fallback');

expectToken(action, 'resolveBattleCueAnimationNameForUnit', 'rarity-aware action cue animation resolver');
expectToken(action, "return tier === 'SR' || tier === 'R' ? 'skill0' : 'atk';", 'SR/R basic attack uses skill0');
expectToken(action, "return tier === 'SR' || tier === 'R' ? 'skill1' : 'skill1';", 'SR/R skill cue uses skill1');
expectToken(action, "animationName: resolveBattleCueAnimationNameForUnit(actor, 'skill')", 'back-row/ranged action uses real skill cue');
expectToken(action, "animationName: resolveBattleCueAnimationNameForUnit(actor, 'attack')", 'front action uses real attack cue');

expectToken(assist, 'resolveBattleAssistAnimationNameForUnit', 'rarity-aware assist skill animation resolver');
expectToken(assist, "return 'skill1';", 'assist skill uses skill1');

expectToken(renderer, 'LobbyBattleImpactSlashLayer', 'plain slash impact layer replaces blood_deco sprite');
expectToken(renderer, 'LobbyBattleActionTargetSlashFallback', 'target fallback uses compact slash marker');
expectToken(renderer, 'const slashWidth = Math.min(width * 0.3, 46 * scale);', 'target fallback slash is compact');
expectToken(renderer, 'recordBattleActorSpineCueTelemetry', 'runtime spine cue telemetry for preview verification');
expectToken(renderer, 'appliedAnimationName', 'telemetry records applied animation name');
expectToken(renderer, 'requestedAnimationName', 'telemetry records requested animation name');
expectNoToken(renderer, 'LobbyBattleHitBurstSprite', 'blood_deco hit burst sprite in battle renderer');
expectNoToken(renderer, 'snapshot.stage2UiAssets.hitBurst', 'blood_deco asset usage in battle renderer');
expectNoToken(renderer, 'LobbyBattleActionTargetEffectFallback', 'old large target fallback node');
expectToken(preview, "'LobbyBattleHitBurstSprite'", 'preview freshness forbids stale blood_deco hit burst token');
expectToken(preview, "'snapshot.stage2UiAssets.hitBurst'", 'preview freshness forbids stale blood_deco asset token');

expectToken(packageText, '"check:battle-stage13r": "node ./scripts/check-battle-stage13r.mjs"', 'package script');
expectToken(aggregate, 'check-battle-stage13r', 'aggregate includes Stage 13R');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13r ok');
