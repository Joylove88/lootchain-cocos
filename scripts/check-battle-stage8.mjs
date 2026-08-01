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
  'assets/scripts/scenes/lobby/LobbyBattleSettlementPresentation.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'docs/battle/stage8-settlement-and-recovery.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattleSettlementPresentation.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage8": "node ./scripts/check-battle-stage8.mjs"', 'package script');

const helperText = read('assets/scripts/scenes/lobby/LobbyBattleSettlementPresentation.ts');
[
  'export type BattleSettlementPresentationStepKind',
  'export type BattleSettlementPresentationTone',
  'export interface BattleSettlementPresentationStep',
  'export interface BattleSettlementPresentationView',
  'export function resolveBattleSettlementPresentationView',
  'start_idempotent',
  'session_ready',
  'playback_complete',
  'settle_idempotent',
  'receipt_recorded',
  'error_recoverable',
  'primaryRecoveryLabel',
  'recoveryHint',
  'canRetryStart',
  'canReturnToFormation',
  'canReturnToLobby',
  'receiptStatus',
].forEach((token) => assertIncludes(helperText, token, 'Stage 8 settlement presentation helper'));

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
].forEach((token) => assertNotIncludes(helperText, token, 'Stage 8 helper must stay local presentation-only'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'LobbyBattleSettlementPresentation',
  'resolveBattleSettlementPresentationView',
  'type BattleSettlementPresentationView',
  'const settlementView = resolveBattleSettlementPresentationView(battleState, presentation);',
  'renderStage8SettlementFlowPanel',
  'LobbyBattleStage8SettlementFlowPanel',
  'LobbyBattleStage8SettlementStep_',
  'LobbyBattleStage8IdempotencyBadge',
  'renderStage8RecoveryBanner',
  'LobbyBattleStage8RecoveryBanner',
  'LobbyBattleStage8RecoveryHint',
  'LobbyBattleStage8ReceiptStatus',
  'renderStage12BattlefieldChrome',
  'this.renderResultBanner(field, fieldRect.width, fieldRect.height, scale, state, presentation, snapshot, hpState, playbackTimelineTimeMs);',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer Stage 8 settlement and recovery integration'));
[
  'this.renderStage8SettlementFlowPanel(field',
  'this.renderStage8RecoveryBanner(field',
].forEach((token) => assertNotIncludes(rendererText, token, 'Stage 12 battlefield must not show old Stage 8 debug panels in the main render path'));

const stageDoc = read('docs/battle/stage8-settlement-and-recovery.md');
[
  'Stage 8',
  '结算与异常',
  'start/settle 幂等',
  '断线',
  '返回重进',
  '失败兜底',
  '以后端回执结算',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  'check:battle-stage8',
].forEach((token) => assertIncludes(stageDoc, token, 'stage8 doc'));

[
  ['README.md', 'Visual Battle Stage 8 Settlement And Recovery'],
  ['docs/api-contract.md', 'Visual Battle Stage 8 结算与异常契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 8'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));
[
  ['README.md', 'Visual Battle Stage 8：结算与异常'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 8：结算与异常'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 8 已在 Cocos 新增 `LobbyBattleSettlementPresentation.ts`'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattleSettlementPresentation.ts',
  'resolveBattleSettlementPresentationView',
  'LobbyBattleStage8SettlementFlowPanel',
  'LobbyBattleStage8RecoveryBanner',
  'LobbyBattleStage8ReceiptStatus',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 8 tokens'));
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattleSettlementPresentation.ts'", 'preview freshness settlement presentation source');

await runSettlementBehaviorProbe();

console.log('[battle-stage8] Settlement idempotency, recovery cues, docs, and preview freshness tokens passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function readBackend(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

async function runSettlementBehaviorProbe() {
  const module = await importSettlementModule();
  const states = {
    ready: createPanelState({ stageCode: 'MAIN_1_3' }),
    starting: createPanelState({ stageCode: 'MAIN_1_3', starting: true }),
    running: createPanelState({ stageCode: 'MAIN_1_3', start: createStart(), presentationComplete: false }),
    complete: createPanelState({ stageCode: 'MAIN_1_3', start: createStart(), presentationComplete: true }),
    settling: createPanelState({ stageCode: 'MAIN_1_3', start: createStart(), settling: true, presentationComplete: true }),
    recorded: createPanelState({ stageCode: 'MAIN_1_3', start: createStart(), settlement: createSettlement(), presentationComplete: true }),
    error: createPanelState({ stageCode: 'MAIN_1_3', error: 'Redis unavailable' }),
  };
  const presentations = {
    ready: createPresentation('ready'),
    starting: createPresentation('creatingSession'),
    running: createPresentation('roundPlaying'),
    complete: createPresentation('roundPlaying'),
    settling: createPresentation('resultRecording'),
    recorded: createPresentation('resultRecorded'),
    error: createPresentation('error'),
  };

  const first = module.resolveBattleSettlementPresentationView(states.complete, presentations.complete);
  const second = module.resolveBattleSettlementPresentationView(states.complete, presentations.complete);
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'settlement view must be deterministic for identical input');

  const views = Object.keys(states).map((key) => module.resolveBattleSettlementPresentationView(states[key], presentations[key]));
  ['start_idempotent', 'session_ready', 'playback_complete', 'settle_idempotent', 'receipt_recorded', 'error_recoverable']
    .forEach((kind) => assertStepKind(views, kind));

  const starting = module.resolveBattleSettlementPresentationView(states.starting, presentations.starting);
  const startStep = findStep(starting, 'start_idempotent');
  assertEqual(startStep.active, true, 'starting start step active');
  assertEqual(startStep.blocked, true, 'starting duplicate start blocked');

  const complete = module.resolveBattleSettlementPresentationView(states.complete, presentations.complete);
  assertEqual(findStep(complete, 'playback_complete').done, true, 'complete playback step done');
  assertEqual(findStep(complete, 'settle_idempotent').active, false, 'complete settle step inactive during visual acceptance');
  assertEqual(findStep(complete, 'settle_idempotent').label, '结算预留', 'complete settle step visual-only label');
  assertEqual(complete.primaryRecoveryLabel, '返回大厅', 'complete primary action returns lobby');

  const settling = module.resolveBattleSettlementPresentationView(states.settling, presentations.settling);
  assertEqual(findStep(settling, 'settle_idempotent').blocked, true, 'settling duplicate submit blocked');

  const recorded = module.resolveBattleSettlementPresentationView(states.recorded, presentations.recorded);
  assertEqual(findStep(recorded, 'receipt_recorded').done, true, 'recorded receipt step done');
  assertEqual(recorded.canReturnToLobby, true, 'recorded can return lobby');

  const error = module.resolveBattleSettlementPresentationView(states.error, presentations.error);
  assertEqual(error.canRetryStart, true, 'creation error can retry');
  assertEqual(findStep(error, 'error_recoverable').active, true, 'error recovery active');
}

async function importSettlementModule() {
  const source = read('assets/scripts/scenes/lobby/LobbyBattleSettlementPresentation.ts');
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
    fileName: 'LobbyBattleSettlementPresentation.ts',
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootchain-stage8-'));
  const outputFile = path.join(tempDir, 'LobbyBattleSettlementPresentation.mjs');
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
    fail(`Unable to locate TypeScript runtime for Stage 8 behavior probe. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

function createPanelState(overrides = {}) {
  return {
    starting: false,
    settling: false,
    stageCode: '',
    error: '',
    start: null,
    settlement: null,
    presentationStep: 0,
    presentationComplete: false,
    recentLoading: false,
    recentError: '',
    recentBattles: [],
    version: 0,
    ...overrides,
  };
}

function createPresentation(phase) {
  return {
    phase,
    title: '主线战斗',
    subtitle: 'probe',
    boundaryText: 'probe',
    timelineText: 'probe',
    logLines: ['probe'],
    actionLabel: 'probe',
    actionNodeName: 'probe',
    actionEnabled: true,
    returnToLobby: phase === 'resultRecorded',
    damageText: '',
    leadEnemyHp: 0.5,
  };
}

function createStart() {
  return {
    battleNo: 'BATTLE-PROBE-001',
    stageCode: 'MAIN_1_3',
    status: 'RUNNING',
    serverSeed: 'stage8-probe-seed',
    lineup: [],
    enemyPreview: [],
    expireTime: '2026-06-17T00:00:00Z',
    readonlyEconomy: true,
    guardrails: [],
  };
}

function createSettlement() {
  return {
    battleNo: 'BATTLE-PROBE-001',
    settlementNo: 'SETTLE-PROBE-001',
    stageCode: 'MAIN_1_3',
    result: 'WIN',
    status: 'RECORDED',
    settlementMode: 'REAL_MAINLINE_R3',
    message: 'ok',
    rewardGranted: true,
    economyApplied: true,
    progressApplied: true,
    firstClear: true,
    staminaCost: 5,
    staminaBefore: 20,
    staminaAfter: 15,
    rewardPreview: [],
    rewardItems: [],
    currencyChanges: [],
    mainlineProgress: {
      beforeStageCode: 'MAIN_1_3',
      afterStageCode: 'MAIN_1_4',
      unlockedStageCode: 'MAIN_1_4',
      progressed: true,
    },
    readonlyEconomy: false,
  };
}

function findStep(view, kind) {
  const step = view.steps.find((entry) => entry.kind === kind);
  if (!step) {
    fail(`Missing step ${kind} in ${view.viewKey}`);
  }
  return step;
}

function assertStepKind(views, kind) {
  if (!views.some((view) => view.steps.some((step) => step.kind === kind))) {
    fail(`Settlement views missing step kind: ${kind}`);
  }
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
  console.error(`[battle-stage8] ${message}`);
  process.exit(1);
}
