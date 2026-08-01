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
  'assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'docs/battle/stage5-deterministic-timeline.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage5": "node ./scripts/check-battle-stage5.mjs"', 'package script');

const timelineText = read('assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts');
[
  'export type BattlePresentationEventType',
  'export interface BattlePresentationTimelineEvent',
  'export interface BattlePresentationTimeline',
  'export function resolveLobbyBattlePresentationTimeline',
  'createTimelineSeed',
  'nextDeterministicTimelineFloat',
  'snapshot.unitSnapshotKey',
  'battle_start',
  'unit_spawn',
  'round_start',
  'action_start',
  'idle',
  'target_mark',
  'damage_preview',
  'hit_react',
  'buff_preview',
  'round_end',
  'battle_end',
  '45_000',
  '60_000',
  'events.sort',
  'seq',
  'timeMs',
  'displayValue',
  'timelineKey',
].forEach((token) => assertIncludes(timelineText, token, 'Stage 5 deterministic timeline helper'));

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
].forEach((token) => assertNotIncludes(timelineText, token, 'Stage 5 helper must stay local presentation-only'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'resolveLobbyBattlePresentationTimeline',
  'type BattlePresentationTimeline',
  'type BattlePresentationTimelineEvent',
  'const timeline = resolveLobbyBattlePresentationTimeline(snapshot);',
  'renderTimelineEventRail',
  'LobbyBattleTimelineEventRail',
  'LobbyBattleTimelineEventMarker_',
  'timeline.currentEvent',
  'timeline.damagePreviewEvent',
  'timeline.buffPreviewEvent',
  'timeline.timelineKey',
  'middleEvents',
  'firstEvent && lastEvent',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer Stage 5 timeline integration'));

assertPattern(
  rendererText,
  /this\.renderBattleField\(panel,\s*presentationLayout,\s*scale,\s*battleState,\s*presentation,\s*(?:[^,\n)]+,\s*)*snapshot,\s*timeline(?:,\s*[^)]*)?\);/s,
  'battle renderer passes deterministic snapshot and timeline into renderBattleField while allowing later-stage arguments',
);

assertPattern(
  rendererText,
  /renderImpactLayer\([^;]+timeline\.damagePreviewEvent[^;]+\)/s,
  'battle renderer feeds deterministic damage preview into impact layer',
);
assertPattern(
  rendererText,
  /renderBattleBuffTray\([^;]+timeline\.buffPreviewEvent[^;]+\)/s,
  'battle renderer feeds deterministic buff preview into buff tray',
);

const stageDoc = read('docs/battle/stage5-deterministic-timeline.md');
[
  'Stage 5',
  '确定性本地表现时间线',
  'serverSeed + battleNo + unitSnapshot',
  'battle_start',
  'damage_preview',
  'buff_preview',
  '只用于表现',
  '不作为结算权威',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  'check:battle-stage5',
].forEach((token) => assertIncludes(stageDoc, token, 'stage5 doc'));

[
  ['README.md', 'Visual Battle Stage 5 Deterministic Timeline'],
  ['docs/api-contract.md', 'Visual Battle Stage 5 确定性表现时间线契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 5'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));
[
  ['README.md', 'Visual Battle Stage 5：确定性本地表现时间线'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 5：确定性本地表现时间线'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 5 已在 Cocos 新增 `LobbyBattlePresentationTimeline.ts`'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattlePresentationTimeline.ts',
  'resolveLobbyBattlePresentationTimeline',
  'LobbyBattleTimelineEventRail',
  'timeline.currentEvent',
  'timeline.damagePreviewEvent',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 5 tokens'));
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts'", 'preview freshness timeline source');

await runTimelineBehaviorProbe();

console.log('[battle-stage5] Deterministic presentation timeline, renderer integration, docs, and preview freshness tokens passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function readBackend(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

async function runTimelineBehaviorProbe() {
  const module = await importTimelineModule();
  const snapshot = createProbeSnapshot();
  const first = module.resolveLobbyBattlePresentationTimeline(snapshot);
  const second = module.resolveLobbyBattlePresentationTimeline(snapshot);
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'timeline must be deterministic for identical snapshot input');
  assertRange(first.durationMs, 45_000, 60_000, 'timeline duration');
  assertIncludes(first.timelineKey, String(first.durationMs), 'timeline key includes duration');
  assertEqual(first.events[0]?.type, 'battle_start', 'timeline first event');
  assertEqual(first.events[first.events.length - 1]?.type, 'battle_end', 'timeline final event');
  assertEventType(first.events, 'damage_preview');
  assertEventType(first.events, 'buff_preview');
  first.events.forEach((event, index) => {
    assertRange(event.timeMs, 0, first.durationMs, `event time range seq=${event.seq}`);
    if (index > 0) {
      const previous = first.events[index - 1];
      if (previous.timeMs > event.timeMs || (previous.timeMs === event.timeMs && previous.seq > event.seq)) {
        fail(`Timeline events are not sorted at seq=${event.seq}`);
      }
    }
  });
  const emptyInput = module.resolveLobbyBattlePresentationTimeline({ ...snapshot, allies: [], enemies: [], unitSnapshotKey: `${snapshot.unitSnapshotKey}:empty` });
  assertEqual(emptyInput.events[0]?.type, 'battle_start', 'empty input fallback first event');
  assertEventType(emptyInput.events, 'battle_end');
}

async function importTimelineModule() {
  const timelineSource = read('assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts');
  const tsPath = resolveTypeScriptRuntimePath();
  const tsModule = await import(pathToFileURL(tsPath).href);
  const ts = tsModule.default ?? tsModule;
  const output = ts.transpileModule(timelineSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues?.Remove,
      removeComments: false,
    },
    fileName: 'LobbyBattlePresentationTimeline.ts',
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootchain-stage5-'));
  const outputFile = path.join(tempDir, 'LobbyBattlePresentationTimeline.mjs');
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
    fail(`Unable to locate TypeScript runtime for Stage 5 behavior probe. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

function createProbeSnapshot() {
  const allies = [
    createProbeUnit('ally-1', 'ally', '主角', 1, 9_800, 'front', true),
    createProbeUnit('ally-2', 'ally', '祭司', 2, 7_200, 'back', false),
  ];
  const enemies = [
    createProbeUnit('enemy-1', 'enemy', '裂隙首领', 1, 10_600, 'boss', false),
    createProbeUnit('enemy-2', 'enemy', '黑甲守卫', 2, 5_800, 'front', false),
  ];
  return {
    stageCode: 'MAIN_1_3',
    battleNo: 'BATTLE-PROBE-001',
    serverSeed: 'stage5-probe-seed',
    readonlyEconomy: true,
    guardrails: [],
    allies,
    enemies,
    leadEnemy: enemies[0],
    leadAlly: allies[0],
    boss: true,
    unitSnapshotKey: 'stage5-probe-seed:BATTLE-PROBE-001:ally-1:9800|ally-2:7200|enemy-1:10600|enemy-2:5800',
    stage2UiAssets: {},
    stage2AudioCues: {},
  };
}

function createProbeUnit(unitKey, side, displayName, slot, power, role, leader) {
  return {
    unitKey,
    side,
    slot,
    displayName,
    subline: `Lv.2 / ${power}`,
    rarity: side === 'ally' ? 'R' : 'N',
    level: 2,
    power,
    role,
    leader,
    hpRatio: 0.72,
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

function assertEqual(actual, expected, context) {
  if (actual !== expected) {
    fail(`Unexpected ${context}: expected ${expected}, got ${actual}`);
  }
}

function assertRange(value, min, max, context) {
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(`Out-of-range ${context}: ${value}, expected ${min}..${max}`);
  }
}

function assertEventType(events, type) {
  if (!events.some((event) => event.type === type)) {
    fail(`Timeline missing event type: ${type}`);
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
  console.error(`[battle-stage5] ${message}`);
  process.exit(1);
}
