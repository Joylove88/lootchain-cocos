import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const backendRoot = 'D:/project/LootChain';
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (packageJson.name !== 'lootchain-cocos') {
  fail(`Refusing to run outside lootchain-cocos, got package name: ${packageJson.name}`);
}

const requiredFiles = [
  'assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts',
  'docs/battle/stage11-audio-runtime.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
  'scripts/check-battle-stage10.mjs',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage11": "node ./scripts/check-battle-stage11.mjs"', 'package script');

const helperText = read('assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts');
[
  'export type BattleAudioCueKey',
  'export interface BattleAudioCuePlan',
  'export interface BattleAudioRuntimePlan',
  'export const BATTLE_AUDIO_CUE_DEFAULT_VOLUMES',
  'export function resolveBattleAudioRuntimePlan',
  'export function resolveBattleAudioCueResource',
  'export function resolveBattleAudioCueVolume',
  'battleBgm',
  'battleStart',
  'heroBasicAttack',
  'rangedAttack',
  'hitLight',
  'heroSkill',
  'healCast',
  'buffApply',
  'resultWin',
  'resultLose',
  '纯表现音频',
].forEach((token) => assertIncludes(helperText, token, 'Stage 11 audio runtime helper'));

[
  'HttpClient',
  'fetch',
  'POST',
  '/api/player',
  'settlePayload',
  'clientChecksum',
  'grantEnabled',
  'economyApplied =',
  'progressApplied =',
].forEach((token) => assertNotIncludes(helperText, token, 'Stage 11 helper must stay local presentation-only'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'AudioClip',
  'AudioSource',
  'LobbyBattleAudioRuntime',
  'resolveBattleAudioRuntimePlan',
  'type BattleAudioCuePlan',
  'renderStage11BattleAudioRuntime',
  'LobbyBattleStage11AudioRuntime',
  'LobbyBattleStage11AudioStatus',
  'playBattleAudioCue',
  'playBattleBgm',
  'loadBattleAudioClip',
  'resources.load(path, AudioClip',
  'audioSource.playOneShot',
  'audioSource.play();',
  'battleAudioPlayedKeys',
  'battleAudioClipCache',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer Stage 11 audio integration'));

assertPattern(
  rendererText,
  /this\.renderStage11BattleAudioRuntime\([^;]+audioPlan[^;]*\);/s,
  'battle renderer renders Stage 11 audio runtime node',
);

const stageDoc = read('docs/battle/stage11-audio-runtime.md');
[
  'Stage 11',
  '战斗音频运行时',
  'BGM',
  'SFX',
  'battleStart',
  'heroBasicAttack',
  'hitLight',
  'resultWin',
  'resultLose',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  '不改变 start/settle 契约',
  'check:battle-stage11',
].forEach((token) => assertIncludes(stageDoc, token, 'stage11 doc'));

[
  ['README.md', 'Visual Battle Stage 11 Audio Runtime'],
  ['docs/api-contract.md', 'Visual Battle Stage 11 战斗音频运行时契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 11'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));
[
  ['README.md', 'Visual Battle Stage 11：战斗音频运行时'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 11：战斗音频运行时'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 11 已在 Cocos 新增 `LobbyBattleAudioRuntime.ts`'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattleAudioRuntime.ts',
  'resolveBattleAudioRuntimePlan',
  'LobbyBattleStage11AudioRuntime',
  'LobbyBattleStage11AudioStatus',
  'playBattleAudioCue',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 11 tokens'));
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts'", 'preview freshness audio runtime source');

await runAudioRuntimeProbe();
runGuard('check:battle-stage10');

console.log('[battle-stage11] Battle audio runtime cue mapping, renderer integration, docs, and prior full-chain guard passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function readBackend(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

async function runAudioRuntimeProbe() {
  const module = await importAudioModule();
  const cues = createAudioCues();
  const snapshot = { stageCode: 'MAIN_1_3', battleNo: 'BATTLE-STAGE11-PROBE', stage2AudioCues: cues };
  const readyPlan = module.resolveBattleAudioRuntimePlan(createPanelState(), createPresentation('ready'), snapshot, null, null, null);
  assertEqual(readyPlan.bgm?.resourcePath, cues.battleBgm, 'ready bgm path');
  assertEqual(readyPlan.oneShot, null, 'ready has no one-shot');
  assertEqual(readyPlan.statusText.includes('BGM'), true, 'ready status mentions BGM');

  const starting = module.resolveBattleAudioRuntimePlan(
    createPanelState({ starting: true }),
    createPresentation('creatingSession'),
    snapshot,
    null,
    null,
    null,
  );
  assertEqual(starting.oneShot?.cueKey, 'battleStart', 'starting plays start stinger');
  assertEqual(starting.oneShot?.resourcePath, cues.battleStart, 'starting stinger path');

  const actionEvent = { seq: 7, type: 'action_start', audioCue: 'heroSkill' };
  const actionPlan = module.resolveBattleAudioRuntimePlan(
    createPanelState({ start: createStart(), presentationStep: 1 }),
    createPresentation('roundPlaying'),
    snapshot,
    actionEvent,
    { cueKey: 'action-7', audioCue: 'rangedAttack' },
    null,
  );
  assertEqual(actionPlan.oneShot?.cueKey, 'rangedAttack', 'action cue has priority over event cue');
  assertEqual(actionPlan.oneShot?.resourcePath, cues.rangedAttack, 'action cue path');

  const assistPlan = module.resolveBattleAudioRuntimePlan(
    createPanelState({ start: createStart(), presentationStep: 2 }),
    createPresentation('roundPlaying'),
    snapshot,
    actionEvent,
    { cueKey: 'action-7', audioCue: 'rangedAttack' },
    { cueKey: 'assist-7', audioCue: 'healCast' },
  );
  assertEqual(assistPlan.oneShot?.cueKey, 'healCast', 'assist cue has top priority');
  assertEqual(assistPlan.oneShot?.resourcePath, cues.healCast, 'assist cue path');

  const hitPlan = module.resolveBattleAudioRuntimePlan(
    createPanelState({ start: createStart(), presentationStep: 3 }),
    createPresentation('roundPlaying'),
    snapshot,
    { seq: 8, type: 'damage_preview', audioCue: 'hitLight' },
    null,
    null,
  );
  assertEqual(hitPlan.oneShot?.cueKey, 'hitLight', 'event cue fallback');
  assertEqual(hitPlan.oneShot?.resourcePath, cues.hitLight, 'hit cue path');

  const winPlan = module.resolveBattleAudioRuntimePlan(
    createPanelState({ start: createStart(), settlement: createSettlement('WIN') }),
    createPresentation('resultRecorded'),
    snapshot,
    null,
    null,
    null,
  );
  assertEqual(winPlan.oneShot?.cueKey, 'resultWin', 'win result cue');
  assertEqual(winPlan.oneShot?.resourcePath, cues.resultWin, 'win result path');

  const losePlan = module.resolveBattleAudioRuntimePlan(
    createPanelState({ start: createStart(), settlement: createSettlement('LOSE') }),
    createPresentation('resultRecorded'),
    snapshot,
    null,
    null,
    null,
  );
  assertEqual(losePlan.oneShot?.cueKey, 'resultLose', 'lose result cue');
  assertEqual(losePlan.oneShot?.resourcePath, cues.resultLose, 'lose result path');

  const visualVictoryPlan = module.resolveBattleAudioRuntimePlan(
    createPanelState({ start: createStart(), presentationStep: 4, presentationComplete: true }),
    createPresentation('roundPlaying'),
    snapshot,
    null,
    null,
    null,
  );
  assertEqual(visualVictoryPlan.oneShot?.cueKey, 'resultWin', 'visual victory result cue');
  assertEqual(visualVictoryPlan.oneShot?.resourcePath, cues.resultWin, 'visual victory result path');
  assertEqual(visualVictoryPlan.oneShot?.playKey.includes('visualVictory'), true, 'visual victory cue has visual-only play key');

  const repeated = module.resolveBattleAudioRuntimePlan(
    createPanelState({ start: createStart(), presentationStep: 2 }),
    createPresentation('roundPlaying'),
    snapshot,
    actionEvent,
    { cueKey: 'action-7', audioCue: 'rangedAttack' },
    { cueKey: 'assist-7', audioCue: 'healCast' },
  );
  assertEqual(JSON.stringify(assistPlan), JSON.stringify(repeated), 'audio plan deterministic');
  assertEqual(module.resolveBattleAudioCueResource(cues, 'missingCue'), null, 'unknown cue ignored');
  assertEqual(module.resolveBattleAudioCueVolume('battleBgm') < module.resolveBattleAudioCueVolume('battleStart'), true, 'bgm lower than stinger');
}

async function importAudioModule() {
  const source = read('assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts');
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
    fileName: 'LobbyBattleAudioRuntime.ts',
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootchain-stage11-'));
  const outputFile = path.join(tempDir, 'LobbyBattleAudioRuntime.mjs');
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
    fail(`Unable to locate TypeScript runtime for Stage 11 behavior probe. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

function createAudioCues() {
  return {
    battleBgm: 'audio/battle/bgm/battle_loop_01',
    battleStart: 'audio/battle/ui/battle_start_stinger',
    heroBasicAttack: 'audio/battle/sfx/attack/hero_basic_01',
    rangedAttack: 'audio/battle/sfx/attack/ranged_01',
    hitLight: 'audio/battle/sfx/hit/hit_light_01',
    heroSkill: 'audio/battle/sfx/skill/hero_skill_01',
    healCast: 'audio/battle/sfx/heal/heal_cast_01',
    buffApply: 'audio/battle/sfx/buff/buff_apply_01',
    resultWin: 'audio/battle/ui/result_win',
    resultLose: 'audio/battle/ui/result_lose',
  };
}

function createPanelState(overrides = {}) {
  return {
    starting: false,
    settling: false,
    stageCode: 'MAIN_1_3',
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
    title: 'probe',
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
    battleNo: 'BATTLE-STAGE11-PROBE',
    stageCode: 'MAIN_1_3',
    status: 'RUNNING',
    serverSeed: 'stage11-probe-seed',
    lineup: [],
    enemyPreview: [],
    expireTime: '2026-06-17T00:00:00Z',
    readonlyEconomy: true,
    guardrails: [],
  };
}

function createSettlement(result) {
  return {
    battleNo: 'BATTLE-STAGE11-PROBE',
    settlementNo: `SETTLE-STAGE11-${result}`,
    stageCode: 'MAIN_1_3',
    result,
    status: 'RECORDED',
    settlementMode: result === 'WIN' ? 'REAL_MAINLINE_R3' : 'NO_REWARD',
    message: 'probe',
    rewardGranted: result === 'WIN',
    economyApplied: result === 'WIN',
    progressApplied: result === 'WIN',
    firstClear: result === 'WIN',
    staminaCost: 0,
    staminaBefore: null,
    staminaAfter: null,
    rewardPreview: [],
    rewardItems: [],
    currencyChanges: [],
    mainlineProgress: null,
    readonlyEconomy: result !== 'WIN',
  };
}

function runGuard(scriptName) {
  if (!/^check:(battle-stage10|layout)$/.test(scriptName)) {
    fail(`Refusing to run unexpected guard script: ${scriptName}`);
  }
  const command = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', `npm.cmd run ${scriptName}`]]
    : ['npm', ['run', scriptName]];
  const result = spawnSync(command[0], command[1], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    const reason = result.error ? ` error=${result.error.message}` : '';
    const signal = result.signal ? ` signal=${result.signal}` : '';
    fail(`${scriptName} failed with exit code ${result.status}${signal}${reason}`);
  }
}

function assertExists(file) {
  if (!fs.existsSync(absolute(file))) {
    fail(`Missing required file: ${file}`);
  }
}

function assertTypeScriptMeta(file) {
  const meta = readJson(file);
  if (meta.importer !== 'typescript' || !meta.uuid) {
    fail(`Invalid TypeScript meta: ${file}`);
  }
}

function readJson(file) {
  return JSON.parse(read(file));
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

function fail(message) {
  console.error(`[battle-stage11] ${message}`);
  process.exit(1);
}
