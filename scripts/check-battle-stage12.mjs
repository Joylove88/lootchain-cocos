import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const backendRoot = 'D:/project/LootChain';
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (packageJson.name !== 'lootchain-cocos') {
  fail(`Refusing to run outside lootchain-cocos, got package name: ${packageJson.name}`);
}

[
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationLayout.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts',
  'assets/scripts/types/BattleTypes.ts',
  'docs/battle/stage12-battle-scene-redesign.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
].forEach(assertExists);

assertIncludes(read('package.json'), '"check:battle-stage12": "node ./scripts/check-battle-stage12.mjs"', 'package script');

const runtimeText = read('assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts');
[
  'BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY',
  'resolveBattleUnitSpinePrimaryAsset',
  'resolveBattleUnitPortraitAssetAsBattleSpine',
  'resolveBattleUnitSpineResource',
  'unit.spineAsset',
  'deriveBattleSpineAssetFromPortrait',
  'sanitizeSpineAsset(unit.spineAsset)',
  'atk',
  'gongji',
  'jineng',
  'skill1',
  'ult',
  'shouji',
  'shengli',
  'resolveBattleUnitSpineVisualProfile',
  'fallbackRawHeight',
  'maxScale',
].forEach((token) => assertIncludes(runtimeText, token, 'Stage 12 spine runtime'));
assertNotIncludes(runtimeText, 'BATTLE_UNIT_SPINE_TARGET_HEIGHT_RATIO = 0.94', 'Stage 12 must not use old near-full slot height');
assertNotIncludes(runtimeText, 'BATTLE_UNIT_SPINE_BOSS_TARGET_HEIGHT_RATIO = 1.08', 'Stage 12 must not enlarge boss spine into half-screen');
assertNotIncludes(runtimeText, 'return sanitizeSpineAsset(unit.spineAsset)\n    ?? deriveBattleSpineAssetFromPortrait(unit.portraitAsset)', 'Stage 12 must not prefer npc_* over act_* portrait battle runtime');

const snapshotText = read('assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts');
[
  'portraitAsset?: string | null',
  'scaleProfile?: string | null',
  'portraitAsset: hero.portraitAsset',
  'spineAsset: enemy.spineAsset',
].forEach((token) => assertIncludes(snapshotText, token, 'Stage 12 presentation snapshot'));

const battleTypesText = read('assets/scripts/types/BattleTypes.ts');
[
  'portraitAsset?: string | null',
  'spineAsset?: string | null',
  'scaleProfile?: string | null',
].forEach((token) => assertIncludes(battleTypesText, token, 'Stage 12 battle API types'));

const battleApiText = read('assets/scripts/api/BattleApi.ts');
[
  "portraitAsset: readOptionalText(item, 'portraitAsset'",
  "spineAsset: readOptionalText(item, 'spineAsset'",
  "spineUuid: readOptionalText(item, 'spineUuid'",
  "scaleProfile: readOptionalText(item, 'scaleProfile'",
].forEach((token) => assertIncludes(battleApiText, token, 'Stage 12 battle API normalization'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'renderStage12BattlefieldChrome',
  'LobbyBattleStage12BattlefieldChrome',
  'LobbyBattleStage12SceneGuide',
  'drawStage12CampPlate',
  'LobbyBattleStage12AllyCampPlate',
  'LobbyBattleStage12EnemyCampPlate',
  'LobbyBattleStage12HeroCardDeck',
  'LobbyBattleStage12EnemyPlaceholder',
  'LobbyBattleStage12ActionCallout',
  'resolveRenderableBattleUnits',
  'isBattleStage12RenderableUnit',
  'this.renderActor(parent, actor.slot, actor.unit',
  'BATTLE_PROTAGONIST_MALE_FALLBACK_ASSET',
  'LobbyBattleStage12ProtagonistFallbackSprite',
  'LobbyBattleStage12VictoryOverlay',
  'LobbyBattleStage12RewardSlot',
  '视觉胜利完成 · 本轮不发放奖励',
  '奖励仅预览，本轮不发放',
  'renderActionTargetSpineEffectLayer',
  'LobbyBattleActionTargetSpineEffectLayer',
  'renderStage12HeroCardDeck',
  'renderStage12VictoryOverlay',
  'isBattleAudioSourceNodeValid',
  'width / 2 - 4 * scale',
  'rgba(202, 188, 145, 0)',
  'resolveBattleUnitSpinePrimaryAsset(unit)',
].forEach((token) => assertIncludes(rendererText, token, 'Stage 12 renderer'));
[
  'LobbyBattleStage3SnapshotBoundaryLabel',
  '只读表现快照',
  'const visible = units.slice(0, slots.length);',
].forEach((token) => assertNotIncludes(rendererText, token, 'Stage 12 must remove developer snapshot label from battlefield'));
[
  'this.renderBattleLog(field',
  'this.renderTimelineEventRail(field',
  'this.renderStage8SettlementFlowPanel(field',
  'this.renderStage8RecoveryBanner(field',
  'this.renderStage9PerformanceBadge(field',
].forEach((token) => assertNotIncludes(rendererText, token, 'Stage 12 main battlefield must hide old debug/status panels'));

const layoutText = read('assets/scripts/scenes/lobby/LobbyBattlePresentationLayout.ts');
[
  'BATTLE_STAGE12_FORMATION_OFFSETS',
  'createStage12FormationSlots',
  'createCompactSlots',
  'clamp(baseX + side * offset.x * scale',
].forEach((token) => assertIncludes(layoutText, token, 'Stage 12 battlefield formation layout'));

const backendVoText = readBackend('lootchain-core/src/main/java/com/lootchain/game/battle/vo/PlayerBattleEnemyVO.java');
[
  'spineAsset',
].forEach((token) => assertIncludes(backendVoText, token, 'Stage 12 enemy VO'));

[
  'sql/65_battle_visual_spine_fields.sql',
  'sql/43_battle_config_readonly_management.sql',
  'lootchain-core/src/main/java/com/lootchain/game/battleconfig/entity/BattleStageConfig.java',
  'lootchain-core/src/main/java/com/lootchain/game/battleconfig/entity/BattleBossConfig.java',
].forEach((file) => assertIncludes(readBackend(file), 'spine_asset', `${file} Stage 12 DB field`));
[
  'settlement_enabled TINYINT NOT NULL DEFAULT 0',
  'grant_enabled TINYINT NOT NULL DEFAULT 0',
  'progress_write_enabled TINYINT NOT NULL DEFAULT 0',
].forEach((token) => assertIncludes(readBackend('sql/65_battle_visual_spine_fields.sql'), token, 'Stage 12 DB guard comments'));

const docText = read('docs/battle/stage12-battle-scene-redesign.md');
[
  'Stage 12',
  '战斗场景重做',
  'portrait_asset',
  'SSR/UR',
  'R/SR',
  '怪物/BOSS 骨骼字段',
  '不触发真实战斗结算',
  '不新增经济写入口',
  'check:battle-stage12',
].forEach((token) => assertIncludes(docText, token, 'Stage 12 doc'));
[
  ['README.md', 'Visual Battle Stage 12 Battle Scene Redesign'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 12'],
  ['docs/api-contract.md', 'Visual Battle Stage 12 战斗场景重做契约'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} Stage 12 backfill`));
[
  ['README.md', 'Visual Battle Stage 12：战斗场景重做'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 12：战斗场景重做'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 12'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} Stage 12 backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattleStage12VictoryOverlay',
  'LobbyBattleStage12HeroCardDeck',
  'LobbyBattleStage12BattlefieldChrome',
  'renderStage12BattlefieldChrome',
  'resolveBattleUnitSpinePrimaryAsset',
  'BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 12 tokens'));

console.log('[battle-stage12] Battle scene redesign, spine mapping, enemy display fields, docs, and preview freshness guards passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function readBackend(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
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

function fail(message) {
  console.error(`[battle-stage12] ${message}`);
  process.exit(1);
}
