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
  'assets/scripts/scenes/UiSpriteFrameCache.ts',
  'assets/scripts/scenes/C1812CommonUiAssets.ts',
  'docs/battle/stage3-battle-scene-skeleton.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage3": "node ./scripts/check-battle-stage3.mjs"', 'package script');

const snapshotText = read('assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts');
[
  'export interface BattlePresentationSnapshot',
  'export interface BattlePresentationUnitSnapshot',
  'export function resolveLobbyBattlePresentationSnapshot',
  'serverSeed + battleNo + unitSnapshot',
  'stage2UiAssets',
  'stage2AudioCues',
  'readonlyEconomy',
  'lineup',
  'enemyPreview',
  'spineAsset',
  'heroClass',
  '不提交奖励',
  'BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET',
  'BATTLE_C1812_SKILL_TARGET_FRAME_ASSET',
  "battleBgm: 'audio/battle/bgm/battle_loop_01'",
  "battleStart: 'audio/battle/ui/battle_start_stinger'",
  "heroBasicAttack: 'audio/battle/sfx/attack/hero_basic_01'",
  "rangedAttack: 'audio/battle/sfx/attack/ranged_01'",
  "hitLight: 'audio/battle/sfx/hit/hit_light_01'",
  "heroSkill: 'audio/battle/sfx/skill/hero_skill_01'",
  "healCast: 'audio/battle/sfx/heal/heal_cast_01'",
  "buffApply: 'audio/battle/sfx/buff/buff_apply_01'",
  "resultWin: 'audio/battle/ui/result_win'",
  "resultLose: 'audio/battle/ui/result_lose'",
].forEach((token) => assertIncludes(snapshotText, token, 'snapshot adapter'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'resolveLobbyBattlePresentationSnapshot',
  'const snapshot = resolveLobbyBattlePresentationSnapshot(battleState, heroState.heroes);',
  'LobbyBattleStage12BattlefieldChrome',
  'renderStage12BattlefieldChrome',
  'renderBossGauge',
  'snapshot.stage2UiAssets.bossGaugeFrame',
  'snapshot.stage2UiAssets.bossGaugeBar',
  'snapshot.stage2UiAssets.skillTargetFrame',
  'if (rect.width < 760 * scale',
  'const baseX = width < 760 * scale ? 0 : width / 2 - totalWidth - 24 * scale;',
  'const trayY = height / 2 - 92 * scale;',
  'renderBattleBuffTray',
  'LobbyBattleBossGauge',
  'LobbyBattleSkillTargetFrame',
  'LobbyBattleImpactSlashLayer',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer'));

assertPattern(
  rendererText,
  /this\.renderBattleField\(panel,\s*presentationLayout,\s*scale,\s*battleState,\s*presentation,\s*(?:[^,\n)]+,\s*)*snapshot(?:,\s*[^)]*)?\);/s,
  'battle renderer passes snapshot into renderBattleField while allowing later-stage arguments',
);
assertPattern(
  rendererText,
  /private renderBattleField\([^)]*snapshot: BattlePresentationSnapshot/s,
  'battle renderer renderBattleField snapshot parameter',
);
assertPattern(
  rendererText,
  /this\.renderUnitActors\([^;]+snapshot[^;]*\);/s,
  'battle renderer passes snapshot into actor rendering',
);

const commonAssetsText = read('assets/scripts/scenes/C1812CommonUiAssets.ts');
[
  "export const BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET = 'ui/battle/c1812/boss_gauge_frame/spriteFrame'",
  "export const BATTLE_C1812_BOSS_GAUGE_BAR_ASSET = 'ui/battle/c1812/boss_gauge_bar/spriteFrame'",
  "export const BATTLE_C1812_SKILL_TARGET_FRAME_ASSET = 'ui/battle/c1812/skill_target_frame/spriteFrame'",
  "export const BATTLE_C1812_HIT_BURST_ASSET = 'ui/battle/c1812/blood_deco/spriteFrame'",
  "export const BATTLE_C1812_BUFF_ATTACK_UP_ASSET = 'ui/battle/c1812/buff_attack_up/spriteFrame'",
  "export const BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET = 'ui/battle/c1812/buff_defense_down/spriteFrame'",
  "export const BATTLE_C1812_BUFF_SHIELD_ASSET = 'ui/battle/c1812/buff_shield/spriteFrame'",
  "export const BATTLE_C1812_BUFF_STUN_ASSET = 'ui/battle/c1812/buff_stun/spriteFrame'",
].forEach((token) => assertIncludes(commonAssetsText, token, 'C1812 common assets'));

const spriteCacheText = read('assets/scripts/scenes/UiSpriteFrameCache.ts');
[
  'BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET',
  'BATTLE_C1812_BOSS_GAUGE_BAR_ASSET',
  'BATTLE_C1812_SKILL_TARGET_FRAME_ASSET',
  'BATTLE_C1812_HIT_BURST_ASSET',
  'BATTLE_C1812_BUFF_ATTACK_UP_ASSET',
  'BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET',
  'BATTLE_C1812_BUFF_SHIELD_ASSET',
  'BATTLE_C1812_BUFF_STUN_ASSET',
].forEach((token) => assertIncludes(spriteCacheText, token, 'sprite cache preload'));

const stageDoc = read('docs/battle/stage3-battle-scene-skeleton.md');
[
  'Stage 3',
  '表现快照',
  '静态战斗场景骨架',
  '不新增后端接口',
  '不新增经济写入口',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  'check:battle-stage3',
].forEach((token) => assertIncludes(stageDoc, token, 'stage3 doc'));

const docs = [
  ['README.md', 'Visual Battle Stage 3 Scene Skeleton'],
  ['docs/api-contract.md', 'Visual Battle Stage 3 场景骨架契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 3'],
];
docs.forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));

[
  'assets/resources/ui/battle/c1812/boss_gauge_frame.png',
  'assets/resources/ui/battle/c1812/boss_gauge_frame.png.meta',
  'assets/resources/ui/battle/c1812/boss_gauge_bar.png',
  'assets/resources/ui/battle/c1812/boss_gauge_bar.png.meta',
  'assets/resources/ui/battle/c1812/skill_target_frame.png',
  'assets/resources/ui/battle/c1812/skill_target_frame.png.meta',
  'assets/resources/ui/battle/c1812/blood_deco.png',
  'assets/resources/ui/battle/c1812/blood_deco.png.meta',
  'assets/resources/audio/battle/bgm/battle_loop_01.wav',
  'assets/resources/audio/battle/bgm/battle_loop_01.wav.meta',
  'assets/resources/audio/battle/ui/battle_start_stinger.wav',
  'assets/resources/audio/battle/ui/battle_start_stinger.wav.meta',
].forEach(assertExists);

[
  'assets/resources/ui/battle/c1812/boss_gauge_frame.png.meta',
  'assets/resources/ui/battle/c1812/boss_gauge_bar.png.meta',
  'assets/resources/ui/battle/c1812/skill_target_frame.png.meta',
  'assets/resources/ui/battle/c1812/blood_deco.png.meta',
].forEach(assertImageMeta);

[
  'assets/resources/audio/battle/bgm/battle_loop_01.wav.meta',
  'assets/resources/audio/battle/sfx/attack/hero_basic_01.wav.meta',
  'assets/resources/audio/battle/sfx/attack/ranged_01.wav.meta',
  'assets/resources/audio/battle/sfx/hit/hit_light_01.wav.meta',
  'assets/resources/audio/battle/sfx/skill/hero_skill_01.wav.meta',
  'assets/resources/audio/battle/sfx/heal/heal_cast_01.wav.meta',
  'assets/resources/audio/battle/sfx/buff/buff_apply_01.wav.meta',
  'assets/resources/audio/battle/ui/result_win.wav.meta',
  'assets/resources/audio/battle/ui/result_lose.wav.meta',
  'assets/resources/audio/battle/ui/battle_start_stinger.wav.meta',
].forEach(assertAudioMeta);

console.log('[battle-stage3] Snapshot adapter, static battle scene skeleton, Stage 2 resource wiring, and docs passed.');

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

function assertImageMeta(file) {
  const meta = readJson(file);
  if (meta.importer !== 'image' || !meta.subMetas || !meta.subMetas['6c48a']) {
    fail(`Invalid image meta: ${file}`);
  }
}

function assertAudioMeta(file) {
  const meta = readJson(file);
  if (meta.importer !== 'audio-clip' || !meta.uuid) {
    fail(`Invalid audio meta: ${file}`);
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
  console.error(`[battle-stage3] ${message}`);
  process.exit(1);
}
