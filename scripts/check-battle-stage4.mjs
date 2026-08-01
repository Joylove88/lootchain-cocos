import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (packageJson.name !== 'lootchain-cocos') {
  fail(`Refusing to run outside lootchain-cocos, got package name: ${packageJson.name}`);
}

const requiredFiles = [
  'assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts',
  'docs/battle/stage4-spine-formation-layer.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage4": "node ./scripts/check-battle-stage4.mjs"', 'package script');

const runtimeText = read('assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts');
[
  'export interface BattleUnitSpineRuntimeData',
  'export function resolveBattleUnitSpineResource',
  'export function resolveBattleUnitSpineUuid',
  'export function resolveBattleUnitSpineLoadUuid',
  'export function resolveBattleUnitSpineAnimationNames',
  'export function resolveBattleUnitSpineScale',
  'export function resolveBattleUnitSpineMirrorScaleX',
  'idle',
  'move',
  'attack_01',
  'skill_01',
  'hit',
  'death',
  'victory',
  'spine/hero/${asset}/${asset}',
].forEach((token) => assertIncludes(runtimeText, token, 'Stage 4 spine runtime helper'));
assertIncludes(runtimeText, 'return null;', 'Stage 4 animation fallback must not pick arbitrary animation');

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'assetManager',
  'resources',
  'sp',
  'LobbyBattleUnitSpineRuntime',
  'battleSpineData',
  'battleSpineLoadCallbacks',
  'renderBattleActorSpineLayer',
  'loadBattleUnitSpineData',
  'applyBattleUnitSpineData',
  'LobbyBattleActorSpineNode',
  'LobbyBattleActorSpineFallbackSilhouette',
  'LobbyBattleEnemyStandin',
  'resolveBattleUnitSpineResource(unit)',
  'resolveBattleUnitSpineLoadUuid(unit)',
  'resolveBattleUnitSpineAnimationNames(data, unit)',
  'resolveBattleUnitSpineScale(',
  'resolveBattleUnitSpineMirrorScaleX(spineScale, enemy)',
  'resolveBattleUnitSpineCueAnimation',
  'const animationName = this.resolveBattleUnitSpineCueAnimation(animationNames, actionAnimationName);',
  'const loopAnimation = animationName === animationNames.idle || actionAnimationName ===',
  'skeleton.setAnimation(0, animationName, loopAnimation)',
  'skeleton.addAnimation(0, animationNames.idle',
  'spineNode.setScale(new Vec3(resolveBattleUnitSpineMirrorScaleX(spineScale, enemy), spineScale, 1))',
  'this.loadBattleUnitSpineData(resourcePath, null',
  '不在 UI 上触发 settle 写入',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer Stage 4 spine layer'));
[
  'animationNames.idle ?? animationNames.hit',
  'animationNames.idle ?? animationNames.attack',
  'skeleton.setAnimation(1, animationNames.hit',
  'by(0.24, { position:',
  'fallback resource path:',
].forEach((token) => assertNotIncludes(rendererText, token, 'battle renderer must keep resource-fallback safe while later stages add action playback'));

assertPattern(
  rendererText,
  /this\.renderBattleActorSpineLayer\([^;]+unit[^;]+enemy[^;]*\);/s,
  'battle renderer calls spine layer from actor renderer',
);
assertPattern(
  rendererText,
  /if \(!resourcePath\) \{[\s\S]*LobbyBattleActorSpineFallbackSilhouette/s,
  'battle renderer keeps no-spine fallback silhouette',
);

const stageDoc = read('docs/battle/stage4-spine-formation-layer.md');
[
  'Stage 4',
  'Spine 单位站位层',
  '基础待机',
  '受击兜底',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  'check:battle-stage4',
].forEach((token) => assertIncludes(stageDoc, token, 'stage4 doc'));

[
  ['README.md', 'Visual Battle Stage 4 Spine Formation Layer'],
  ['docs/api-contract.md', 'Visual Battle Stage 4 Spine 站位层契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 4'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattleActorSpineNode',
  'renderBattleActorSpineLayer',
  'LobbyBattleUnitSpineRuntime.ts',
  'resolveBattleUnitSpineResource',
  'resolveBattleUnitSpineMirrorScaleX',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 4 tokens'));
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts'", 'preview freshness battle renderer source');
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts'", 'preview freshness spine runtime source');

const forbiddenRuntimeTokens = [
  'reward',
  'stamina',
  'currency',
  'bag',
  'progress',
  'settlePayload',
];
for (const token of forbiddenRuntimeTokens) {
  if (runtimeText.includes(token)) {
    fail(`Stage 4 runtime helper must stay presentation-only, found token: ${token}`);
  }
}

console.log('[battle-stage4] Spine formation layer, fallback silhouettes, docs, and preview freshness tokens passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function assertExists(file) {
  if (!fs.existsSync(absolute(file))) {
    fail(`Missing required file: ${file}`);
  }
}

function assertIncludes(text, token, context) {
  if (!text.includes(token)) {
    fail(`Missing token in ${context}: ${token}`);
  }
}

function assertNotIncludes(text, token, context) {
  if (text.includes(token)) {
    fail(`Forbidden token in ${context}: ${token}`);
  }
}

function assertPattern(text, pattern, context) {
  if (!pattern.test(text)) {
    fail(`Missing pattern in ${context}: ${pattern}`);
  }
}

function assertTypeScriptMeta(file) {
  const meta = readJson(file);
  if (meta.importer !== 'typescript' || !meta.uuid) {
    fail(`Invalid TypeScript meta: ${file}`);
  }
}

function readJson(file) {
  try {
    return JSON.parse(read(file));
  } catch (error) {
    fail(`Invalid JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fail(message) {
  console.error(`[battle-stage4] ${message}`);
  process.exit(1);
}
