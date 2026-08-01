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
  'assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts',
  'assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'docs/battle/stage7-skill-and-assist.md',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'scripts/check-preview-freshness.mjs',
];

for (const file of requiredFiles) {
  assertExists(file);
}
assertTypeScriptMeta('assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts.meta');

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage7": "node ./scripts/check-battle-stage7.mjs"', 'package script');

const helperText = read('assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts');
[
  'export type BattleAssistPresentationCueKind',
  'export interface BattleAssistPresentationCue',
  'export function resolveBattleAssistPresentationCues',
  'export function resolveVisibleBattleAssistPresentationCue',
  'skill_cast',
  'heal_float',
  'shield_float',
  'buff_float',
  'debuff_float',
  'sourceRole',
  'targetRole',
  'displayValue',
  'animationName',
  'cueKey',
  'eventSeq',
  'durationMs',
].forEach((token) => assertIncludes(helperText, token, 'Stage 7 assist presentation helper'));

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
].forEach((token) => assertNotIncludes(helperText, token, 'Stage 7 helper must stay local presentation-only'));

const rendererText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'LobbyBattleAssistPresentation',
  'resolveBattleAssistPresentationCues',
  'resolveVisibleBattleAssistPresentationCue',
  'type BattleAssistPresentationCue',
  'const assistCues = resolveBattleAssistPresentationCues(timeline, snapshot);',
  'resolveVisibleBattleAssistPresentationCue(assistCues, currentTimelineEvent, playbackTimelineTimeMs)',
  'renderAssistAuraLayer',
  'LobbyBattleAssistAuraLayer',
  'LobbyBattleAssistSkillCastRing',
  'renderAssistFloatingTextLayer',
  'LobbyBattleAssistFloatingTextLayer',
  'LobbyBattleAssistHealFloatText',
  'LobbyBattleAssistShieldFloatText',
  'LobbyBattleAssistBuffFloatText',
  'LobbyBattleAssistDebuffFloatText',
  'currentAssistCue',
  'assistAnimationName',
  'snapshot.stage2UiAssets.buffShield',
  'snapshot.stage2UiAssets.buffAttackUp',
  'snapshot.stage2UiAssets.buffDefenseDown',
].forEach((token) => assertIncludes(rendererText, token, 'battle renderer Stage 7 skill and assist integration'));

assertPattern(
  rendererText,
  /this\.renderUnitActorsByDepth\([^;]+currentActionCue[^;]+currentAssistCue[^;]*\);/s,
  'battle renderer feeds assist cue into actor renderer',
);
assertPattern(
  rendererText,
  /this\.renderAssistAuraLayer\([^;]+currentAssistCue[^;]*\);/s,
  'battle renderer renders current assist aura',
);
assertPattern(
  rendererText,
  /this\.renderAssistFloatingTextLayer\([^;]+currentAssistCue[^;]*\);/s,
  'battle renderer renders current assist floating text',
);

const stageDoc = read('docs/battle/stage7-skill-and-assist.md');
[
  'Stage 7',
  '技能与辅助',
  '技能动画',
  '治疗',
  '护盾',
  'Buff',
  'Debuff',
  '只用于表现',
  '不提交治疗或护盾到服务端',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  'check:battle-stage7',
].forEach((token) => assertIncludes(stageDoc, token, 'stage7 doc'));

[
  ['README.md', 'Visual Battle Stage 7 Skills And Assist'],
  ['docs/api-contract.md', 'Visual Battle Stage 7 技能与辅助契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 7'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));
[
  ['README.md', 'Visual Battle Stage 7：技能与辅助'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 7：技能与辅助'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 7 已在 Cocos 新增 `LobbyBattleAssistPresentation.ts`'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} backfill`));

const previewText = read('scripts/check-preview-freshness.mjs');
[
  'LobbyBattleAssistPresentation.ts',
  'resolveBattleAssistPresentationCues',
  'resolveVisibleBattleAssistPresentationCue',
  'LobbyBattleAssistAuraLayer',
  'LobbyBattleAssistFloatingTextLayer',
  'LobbyBattleAssistSkillCastRing',
].forEach((token) => assertIncludes(previewText, token, 'preview freshness Stage 7 tokens'));
assertIncludes(previewText, "source: 'assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts'", 'preview freshness assist presentation source');

await runAssistCueBehaviorProbe();

console.log('[battle-stage7] Skill cast, single primary assist floating cue, docs, and preview freshness tokens passed.');

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function readBackend(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

async function runAssistCueBehaviorProbe() {
  const module = await importAssistModule();
  const snapshot = createProbeSnapshot();
  const timeline = createProbeTimeline();
  const first = module.resolveBattleAssistPresentationCues(timeline, snapshot);
  const second = module.resolveBattleAssistPresentationCues(timeline, snapshot);
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'assist cues must be deterministic for identical input');
  assertCueKind(first, 'skill_cast');
  assertCueKind(first, 'buff_float');
  const effectCues = first.filter((cue) => cue.kind !== 'skill_cast');
  assertEqual(effectCues.length, 1, 'each buff_preview should create exactly one primary assist floating cue');
  first.forEach((cue) => {
    assertRange(cue.timeMs, 0, timeline.durationMs, `cue time ${cue.cueKey}`);
    assertRange(cue.durationMs, 120, 1400, `cue duration ${cue.cueKey}`);
    if (!cue.sourceKey || !cue.targetKey) {
      fail(`cue missing source or target: ${cue.cueKey}`);
    }
  });
  const buffEvent = timeline.events.find((event) => event.type === 'buff_preview');
  const visibleCue = module.resolveVisibleBattleAssistPresentationCue(first, buffEvent);
  if (!visibleCue || !['skill_cast', 'buff_float', 'shield_float', 'heal_float', 'debuff_float'].includes(visibleCue.kind)) {
    fail(`visible assist cue mismatch: ${visibleCue?.kind ?? '<null>'}`);
  }
}

async function importAssistModule() {
  const source = read('assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts');
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
    fileName: 'LobbyBattleAssistPresentation.ts',
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootchain-stage7-'));
  const outputFile = path.join(tempDir, 'LobbyBattleAssistPresentation.mjs');
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
    fail(`Unable to locate TypeScript runtime for Stage 7 behavior probe. Checked: ${candidates.join(', ')}`);
  }
  return match;
}

function createProbeTimeline() {
  const events = [
    createProbeEvent(0, 0, 'battle_start', 0, 'ally-front', 'enemy-boss'),
    createProbeEvent(1, 1000, 'action_start', 1, 'ally-front', 'enemy-boss', 'attack_01'),
    createProbeEvent(2, 1280, 'damage_preview', 1, 'ally-front', 'enemy-boss', 'attack_01', '-980'),
    createProbeEvent(3, 1760, 'buff_preview', 1, 'ally-back', 'ally-front', 'skill_01', '+ATK'),
    createProbeEvent(4, 3900, 'battle_end', 1, 'ally-front', 'enemy-boss', 'victory'),
  ];
  return {
    timelineKey: 'stage7-probe',
    durationMs: 3900,
    rounds: 1,
    events,
    currentEvent: events[3],
    damagePreviewEvent: events[2],
    buffPreviewEvent: events[3],
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
    createProbeUnit('ally-front', 'ally', '主角', 1, 9_800, 'front', true, 0.41),
    createProbeUnit('ally-back', 'ally', '祭司', 2, 7_200, 'back', false, 0.82),
  ];
  const enemies = [
    createProbeUnit('enemy-boss', 'enemy', '裂隙首领', 1, 10_600, 'boss', false, 0.72),
    createProbeUnit('enemy-guard', 'enemy', '黑甲守卫', 2, 5_800, 'front', false, 0.68),
  ];
  return {
    stageCode: 'MAIN_1_3',
    battleNo: 'BATTLE-PROBE-001',
    serverSeed: 'stage7-probe-seed',
    readonlyEconomy: true,
    guardrails: [],
    allies,
    enemies,
    leadEnemy: enemies[0],
    leadAlly: allies[0],
    boss: true,
    unitSnapshotKey: 'stage7-probe',
    stage2UiAssets: {},
    stage2AudioCues: {},
  };
}

function createProbeUnit(unitKey, side, displayName, slot, power, role, leader, hpRatio) {
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
    hpRatio,
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
    fail(`Assist cues missing kind: ${kind}`);
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
  console.error(`[battle-stage7] ${message}`);
  process.exit(1);
}
