import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const backendRoot = 'D:/project/LootChain';
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (packageJson.name !== 'lootchain-cocos') {
  fail(`Refusing to run outside lootchain-cocos, got package name: ${packageJson.name}`);
}

const requiredFiles = [
  'assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'docs/battle/stage9-adaptive-performance.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage9": "node ./scripts/check-battle-stage9.mjs"', 'package script');

const helperText = read('assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts');
[
  'export type BattleAdaptivePerformanceTier',
  'export interface BattleAdaptivePerformanceProfile',
  'export function resolveBattleAdaptivePerformanceProfile',
  'export function assertBattleAdaptivePerformanceBounds',
  'viewportKey',
  'safeWidth',
  'safeHeight',
  'tier',
  'motionScale',
  'frameBudgetMs',
  'nodeBudget',
  'showTimelineRail',
  'showBattleLog',
  'showStage8Panel',
  'showRecoveryBanner',
  'showAssistAuras',
  'showProjectiles',
  'showFloatingText',
  'showSkillBar',
  'showPerformanceBadge',
  'maxVisibleUnits',
  'maxFloatingTexts',
  'overlapGuardrails',
  '390x340',
  '1280x720',
  '1920x1080',
].forEach((token) => assertIncludes(helperText, token, 'Stage 9 adaptive performance helper'));

[
  'HttpClient',
  'fetch',
  'POST',
  '/api/player',
  'reward',
  'stamina',
  'currency',
  'bag',
  'progress',
  'settlePayload',
  'settlementSubmit',
].forEach((token) => assertNotIncludes(helperText, token, 'Stage 9 helper must stay local presentation-only'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'LobbyBattleAdaptivePerformance',
  'resolveBattleAdaptivePerformanceProfile',
  'type BattleAdaptivePerformanceProfile',
  'const performanceProfile = resolveBattleAdaptivePerformanceProfile(presentationLayout, snapshot, timeline, presentation, scale);',
  'renderStage9PerformanceBadge',
  'LobbyBattleStage9PerformanceBadge',
  'LobbyBattleStage9ViewportGuard',
  'performanceProfile.showAssistAuras',
  'performanceProfile.showProjectiles',
  'performanceProfile.showFloatingText',
  'performanceProfile.showSkillBar',
  'performanceProfile.motionScale',
  'renderStage12BattlefieldChrome',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer Stage 9 adaptive performance integration'));

assertPattern(
  rendererText,
  /this\.drawBattleSceneAtmosphere\([^;]+performanceProfile[^;]*\);/s,
  'battle renderer applies Stage 9 motion scale to atmosphere',
);
[
  'this.renderTimelineEventRail(field',
  'this.renderBattleLog(field',
  'this.renderStage8SettlementFlowPanel(field',
  'this.renderStage9PerformanceBadge(field',
].forEach((token) => assertNotIncludes(rendererText, token, 'Stage 12 battlefield hides old Stage 9 debug/status panels'));

const stageDoc = read('docs/battle/stage9-adaptive-performance.md');
[
  'Stage 9',
  '适配与性能',
  '390x340',
  '1280x720',
  '1920x1080',
  '低性能降级',
  '不遮挡',
  '不越界',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  'check:battle-stage9',
].forEach((token) => assertIncludes(stageDoc, token, 'stage9 doc'));

[
  ['README.md', 'Visual Battle Stage 9 Adaptive Performance'],
  ['docs/api-contract.md', 'Visual Battle Stage 9 适配与性能契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 9'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));
[
  ['README.md', 'Visual Battle Stage 9：适配与性能'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 9：适配与性能'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 9 已在 Cocos 新增 `LobbyBattleAdaptivePerformance.ts`'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattleAdaptivePerformance.ts',
  'resolveBattleAdaptivePerformanceProfile',
  'performanceProfile.showAssistAuras',
  'performanceProfile.showProjectiles',
  'performanceProfile.showFloatingText',
  'performanceProfile.showSkillBar',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 9 tokens'));
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts'", 'preview freshness adaptive performance source');

await runAdaptivePerformanceProbe();

console.log('[battle-stage9] Adaptive viewport profile, low-performance degradation, docs, and preview freshness tokens passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function readBackend(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

async function runAdaptivePerformanceProbe() {
  const module = await importAdaptivePerformanceModule();
  const snapshot = createSnapshot();
  const timeline = createTimeline();
  const presentation = createPresentation();

  const tiny = module.resolveBattleAdaptivePerformanceProfile(createLayout(390, 340, true, true), snapshot, timeline, presentation, 0.62);
  assertEqual(tiny.viewportKey, '390x340', 'tiny viewport key');
  assertEqual(tiny.tier, 'minimal', 'tiny tier');
  assertEqual(tiny.showTimelineRail, false, 'tiny hides timeline');
  assertEqual(tiny.showBattleLog, false, 'tiny hides battle log');
  assertEqual(tiny.showStage8Panel, false, 'tiny hides Stage 8 panel');
  assertEqual(tiny.showRecoveryBanner, false, 'tiny hides recovery banner');
  assertEqual(tiny.showAssistAuras, false, 'tiny hides assist auras');
  assertEqual(tiny.showProjectiles, false, 'tiny hides projectiles');
  assertEqual(tiny.showFloatingText, false, 'tiny hides floating text');
  assertEqual(tiny.showSkillBar, false, 'tiny hides skill bar');
  assertEqual(tiny.motionScale, 0, 'tiny disables motion');
  assertTrue(tiny.nodeBudget <= 80, 'tiny node budget capped');
  assertEqual(tiny.overlapGuardrails.length, 0, 'tiny has no overlap guardrails');

  const balanced = module.resolveBattleAdaptivePerformanceProfile(createLayout(1280, 720, false, false), snapshot, timeline, presentation, 0.9);
  assertEqual(balanced.viewportKey, '1280x720', 'balanced viewport key');
  assertEqual(balanced.tier, 'balanced', 'balanced tier');
  assertEqual(balanced.showTimelineRail, true, 'balanced shows timeline');
  assertEqual(balanced.showBattleLog, true, 'balanced shows battle log');
  assertEqual(balanced.showProjectiles, true, 'balanced shows projectiles');
  assertEqual(balanced.showFloatingText, true, 'balanced shows floating text');
  assertTrue(balanced.nodeBudget > tiny.nodeBudget, 'balanced node budget larger than tiny');

  const cinematic = module.resolveBattleAdaptivePerformanceProfile(createLayout(1920, 1080, false, false), snapshot, timeline, presentation, 1);
  assertEqual(cinematic.viewportKey, '1920x1080', 'cinematic viewport key');
  assertEqual(cinematic.tier, 'cinematic', 'cinematic tier');
  assertEqual(cinematic.showStage8Panel, true, 'cinematic shows Stage 8 panel');
  assertEqual(cinematic.showBattleLog, true, 'cinematic shows battle log');
  assertEqual(cinematic.showRecoveryBanner, true, 'cinematic shows recovery banner');
  assertEqual(cinematic.motionScale, 1, 'cinematic full motion');
  assertTrue(cinematic.nodeBudget > balanced.nodeBudget, 'cinematic node budget larger than balanced');

  const repeated = module.resolveBattleAdaptivePerformanceProfile(createLayout(1920, 1080, false, false), snapshot, timeline, presentation, 1);
  assertEqual(JSON.stringify(cinematic), JSON.stringify(repeated), 'adaptive profile must be deterministic');

  const guardrails = module.assertBattleAdaptivePerformanceBounds(cinematic);
  assertEqual(guardrails.length, 0, 'cinematic bounds pass');
}

async function importAdaptivePerformanceModule() {
  const source = read('assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts');
  const tsPath = resolveTypeScriptRuntimePath();
  const tsModule = await import(pathToFileURL(tsPath).href);
  const ts = tsModule.default ?? tsModule;
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues?.Remove,
      removeComments: false,
    },
    fileName: 'LobbyBattleAdaptivePerformance.ts',
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootchain-stage9-'));
  const outputFile = path.join(tempDir, 'LobbyBattleAdaptivePerformance.mjs');
  fs.writeFileSync(outputFile, output.outputText, 'utf8');
  return import(pathToFileURL(outputFile).href);
}

function resolveTypeScriptRuntimePath() {
  const candidates = [
    process.env.COCOS_TYPESCRIPT_RUNTIME,
    'D:/office app/cocos/editors/Creator/3.8.8/resources/resources/3d/engine/node_modules/typescript/lib/typescript.js',
    path.join(root, 'node_modules/typescript/lib/typescript.js'),
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    fail(`Unable to locate TypeScript runtime for Stage 9 behavior probe. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

function createLayout(width, height, compact, stackedFooter) {
  return {
    compact,
    stackedFooter,
    panelSize: { width, height },
    field: {
      x: 0,
      y: 0,
      width: width - 78,
      height: Math.max(32, height - 202),
    },
    allySlots: [],
    enemySlots: [],
    timeline: { x: 0, y: 0, width: Math.max(0, width - 140), height: 28 },
    log: { x: 0, y: 0, width: Math.max(0, width - 140), height: compact ? 28 : 78 },
    boundary: { x: 0, y: 0, width: Math.max(0, width - 110), height: 24 },
    footerButtons: [],
  };
}

function createSnapshot() {
  const allies = Array.from({ length: 5 }, (_, index) => ({
    unitKey: `ally-${index}`,
    side: 'ally',
    slot: index,
    displayName: `hero-${index}`,
    subline: 'probe',
    rarity: 'SR',
    level: 50,
    power: 12_000 + index,
    role: index === 0 ? 'front' : 'back',
    leader: index === 0,
    hpRatio: 0.8,
  }));
  const enemies = Array.from({ length: 5 }, (_, index) => ({
    unitKey: `enemy-${index}`,
    side: 'enemy',
    slot: index,
    displayName: `enemy-${index}`,
    subline: 'probe',
    rarity: index === 0 ? 'BOSS' : 'N',
    level: 50,
    power: 11_000 + index,
    role: index === 0 ? 'boss' : 'front',
    leader: false,
    hpRatio: 0.7,
  }));
  return {
    stageCode: 'MAIN_1_3',
    battleNo: 'BATTLE-STAGE9-PROBE',
    serverSeed: 'stage9-probe-seed',
    readonlyEconomy: true,
    guardrails: [],
    allies,
    enemies,
    leadEnemy: enemies[0],
    leadAlly: allies[0],
    boss: true,
    unitSnapshotKey: 'stage9-probe',
    stage2UiAssets: {},
    stage2AudioCues: {},
  };
}

function createTimeline() {
  const events = Array.from({ length: 27 }, (_, index) => ({
    seq: index,
    timeMs: index * 500,
    type: index % 5 === 0 ? 'damage_preview' : 'action_start',
    round: Math.max(1, Math.ceil((index + 1) / 9)),
    label: `event-${index}`,
  }));
  return {
    timelineKey: 'stage9-timeline',
    durationMs: 45_000,
    rounds: 3,
    events,
    currentEvent: events[0],
    damagePreviewEvent: events[5],
    buffPreviewEvent: events[10],
  };
}

function createPresentation() {
  return {
    phase: 'roundPlaying',
    title: 'probe',
    subtitle: 'probe',
    boundaryText: 'probe',
    timelineText: 'probe',
    logLines: ['probe'],
    actionLabel: 'probe',
    actionNodeName: 'probe',
    actionEnabled: true,
    returnToLobby: false,
    damageText: '',
    leadEnemyHp: 0.5,
  };
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

function assertEqual(actual, expected, context) {
  if (actual !== expected) {
    fail(`Unexpected ${context}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, context) {
  if (!value) {
    fail(`Expected true: ${context}`);
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
  console.error(`[battle-stage9] ${message}`);
  process.exit(1);
}
