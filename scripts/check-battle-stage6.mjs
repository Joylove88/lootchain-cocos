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
  'assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'docs/battle/stage6-actions-and-float-text.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage6": "node ./scripts/check-battle-stage6.mjs"', 'package script');

const helperText = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
[
  'export type BattleActionPresentationCueKind',
  'export interface BattleActionPresentationCue',
  'export function resolveBattleActionPresentationCues',
  'export function resolveVisibleBattleActionPresentationCue',
  'melee_move',
  'basic_attack',
  'ranged_projectile',
  'damage_float',
  'hit_float',
  'actorRole',
  'targetRole',
  'animationName',
  'cueKey',
  'eventSeq',
  'durationMs',
].forEach((token) => assertIncludes(helperText, token, 'Stage 6 action presentation helper'));

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
].forEach((token) => assertNotIncludes(helperText, token, 'Stage 6 helper must stay local presentation-only'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'LobbyBattleActionPresentation',
  'resolveBattleActionPresentationCues',
  'resolveVisibleBattleActionPresentationCue',
  'type BattleActionPresentationCue',
  'const actionCues = resolveBattleActionPresentationCues(timeline, snapshot);',
  'const currentActionCue = resolveVisibleBattleActionPresentationCue(actionCues, currentTimelineEvent);',
  'renderActionProjectileLayer',
  'LobbyBattleActionProjectileLayer',
  'LobbyBattleActionProjectileOrb',
  'renderActionTargetSpineEffectLayer',
  'LobbyBattleActionTargetSpineEffectLayer',
  'resolveBattleUnitTargetSpineEffectAnimation',
  'skill1Kz',
  'skill2Kz',
  'skill3Kz',
  'skill4Kz',
  'renderActionFloatingTextLayer',
  'LobbyBattleActionFloatingTextLayer',
  'LobbyBattleActionDamageFloatText',
  'LobbyBattleActionHitFloatText',
  'LobbyBattleMeleeAdvanceGhost',
  'currentActionCue',
  'actionAnimationName',
  'skeleton.addAnimation(0, animationNames.idle',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer Stage 6 action and float text integration'));

assertPattern(
  rendererText,
  /this\.renderUnitActors\([^;]+currentActionCue[^;]*\);/s,
  'battle renderer feeds action cue into actor renderer',
);
assertPattern(
  rendererText,
  /this\.renderActionProjectileLayer\([^;]+currentActionCue[^;]*\);/s,
  'battle renderer renders current projectile cue',
);
assertPattern(
  rendererText,
  /this\.renderActionFloatingTextLayer\([^;]+currentActionCue[^;]*\);/s,
  'battle renderer renders current floating text cue',
);

const stageDoc = read('docs/battle/stage6-actions-and-float-text.md');
[
  'Stage 6',
  '动作与飘字',
  '近战移动',
  '普攻',
  '远程弹道',
  '伤害飘字',
  '受击飘字',
  '只用于表现',
  '不提交伤害到服务端',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  'check:battle-stage6',
].forEach((token) => assertIncludes(stageDoc, token, 'stage6 doc'));

[
  ['README.md', 'Visual Battle Stage 6 Actions And Float Text'],
  ['docs/api-contract.md', 'Visual Battle Stage 6 动作与飘字契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 6'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));
[
  ['README.md', 'Visual Battle Stage 6：动作与飘字'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 6：动作与飘字'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 6 已在 Cocos 新增 `LobbyBattleActionPresentation.ts`'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattleActionPresentation.ts',
  'resolveBattleActionPresentationCues',
  'resolveVisibleBattleActionPresentationCue',
  'LobbyBattleActionProjectileLayer',
  'LobbyBattleActionTargetSpineEffectLayer',
  'LobbyBattleActionFloatingTextLayer',
  'LobbyBattleMeleeAdvanceGhost',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 6 tokens'));
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts'", 'preview freshness action presentation source');

await runActionCueBehaviorProbe();

console.log('[battle-stage6] Action movement cues, projectile layer, floating text, docs, and preview freshness tokens passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function readBackend(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

async function runActionCueBehaviorProbe() {
  const module = await importActionModule();
  const snapshot = createProbeSnapshot();
  const timeline = createProbeTimeline();
  const first = module.resolveBattleActionPresentationCues(timeline, snapshot);
  const second = module.resolveBattleActionPresentationCues(timeline, snapshot);
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'action cues must be deterministic for identical input');
  assertCueKind(first, 'melee_move');
  assertCueKind(first, 'basic_attack');
  assertCueKind(first, 'ranged_projectile');
  assertCueKind(first, 'damage_float');
  assertCueKind(first, 'hit_float');
  first.forEach((cue) => {
    assertRange(cue.timeMs, 0, timeline.durationMs, `cue time ${cue.cueKey}`);
    assertRange(cue.durationMs, 120, 1200, `cue duration ${cue.cueKey}`);
    if (!cue.actorKey || !cue.targetKey) {
      fail(`cue missing actor or target: ${cue.cueKey}`);
    }
  });
  const meleeEvent = timeline.events.find((event) => event.seq === 1);
  const damageEvent = timeline.events.find((event) => event.type === 'damage_preview');
  const hitEvent = timeline.events.find((event) => event.type === 'hit_react');
  const meleeCue = module.resolveVisibleBattleActionPresentationCue(first, meleeEvent);
  const damageCue = module.resolveVisibleBattleActionPresentationCue(first, damageEvent);
  const hitCue = module.resolveVisibleBattleActionPresentationCue(first, hitEvent);
  assertEqual(meleeCue?.kind, 'melee_move', 'visible melee cue');
  assertEqual(damageCue?.kind, 'damage_float', 'visible damage cue');
  assertEqual(hitCue?.kind, 'hit_float', 'visible hit cue');
}

async function importActionModule() {
  const actionSource = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
  const tsPath = resolveTypeScriptRuntimePath();
  const tsModule = await import(pathToFileURL(tsPath).href);
  const ts = tsModule.default ?? tsModule;
  const output = ts.transpileModule(actionSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues?.Remove,
      removeComments: false,
    },
    fileName: 'LobbyBattleActionPresentation.ts',
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootchain-stage6-'));
  const outputFile = path.join(tempDir, 'LobbyBattleActionPresentation.mjs');
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
    fail(`Unable to locate TypeScript runtime for Stage 6 behavior probe. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

function createProbeTimeline() {
  const events = [
    createProbeEvent(0, 0, 'battle_start', 0, 'ally-front', 'enemy-boss'),
    createProbeEvent(1, 1000, 'action_start', 1, 'ally-front', 'enemy-boss', 'attack_01'),
    createProbeEvent(2, 1280, 'damage_preview', 1, 'ally-front', 'enemy-boss', 'attack_01', '-980'),
    createProbeEvent(3, 1480, 'hit_react', 1, 'enemy-boss', 'ally-front', 'hit'),
    createProbeEvent(4, 2200, 'action_start', 1, 'ally-back', 'enemy-guard', 'skill_01'),
    createProbeEvent(5, 2520, 'damage_preview', 1, 'ally-back', 'enemy-guard', 'skill_01', '-760'),
    createProbeEvent(6, 3900, 'battle_end', 1, 'ally-front', 'enemy-boss', 'victory'),
  ];
  return {
    timelineKey: 'stage6-probe',
    durationMs: 3900,
    rounds: 1,
    events,
    currentEvent: events[1],
    damagePreviewEvent: events[2],
    buffPreviewEvent: events[2],
  };
}

function createProbeEvent(seq, timeMs, type, round, actorKey, targetKey, animationName = 'idle', displayValue) {
  return {
    seq,
    timeMs,
    type,
    round,
    actorKey,
    actorName: actorKey,
    targetKey,
    targetName: targetKey,
    label: `${type}:${actorKey}->${targetKey}`,
    animationName,
    displayValue,
  };
}

function createProbeSnapshot() {
  const allies = [
    createProbeUnit('ally-front', 'ally', '主角', 1, 9_800, 'front', true),
    createProbeUnit('ally-back', 'ally', '祭司', 2, 7_200, 'back', false),
  ];
  const enemies = [
    createProbeUnit('enemy-boss', 'enemy', '裂隙首领', 1, 10_600, 'boss', false),
    createProbeUnit('enemy-guard', 'enemy', '黑甲守卫', 2, 5_800, 'front', false),
  ];
  return {
    stageCode: 'MAIN_1_3',
    battleNo: 'BATTLE-PROBE-001',
    serverSeed: 'stage6-probe-seed',
    readonlyEconomy: true,
    guardrails: [],
    allies,
    enemies,
    leadEnemy: enemies[0],
    leadAlly: allies[0],
    boss: true,
    unitSnapshotKey: 'stage6-probe',
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

function assertCueKind(cues, kind) {
  if (!cues.some((cue) => cue.kind === kind)) {
    fail(`Action cues missing kind: ${kind}`);
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
  console.error(`[battle-stage6] ${message}`);
  process.exit(1);
}
