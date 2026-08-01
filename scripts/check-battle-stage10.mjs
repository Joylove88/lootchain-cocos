import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const backendRoot = 'D:/project/LootChain';
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (packageJson.name !== 'lootchain-cocos') {
  fail(`Refusing to run outside lootchain-cocos, got package name: ${packageJson.name}`);
}

const requiredFiles = [
  'docs/battle/stage10-full-chain-acceptance.md',
  'docs/battle/stage1-visual-battle-spec.md',
  'docs/battle/stage2-resource-import.md',
  'docs/battle/stage3-battle-scene-skeleton.md',
  'docs/battle/stage4-spine-formation-layer.md',
  'docs/battle/stage5-deterministic-timeline.md',
  'docs/battle/stage6-actions-and-float-text.md',
  'docs/battle/stage7-skill-and-assist.md',
  'docs/battle/stage8-settlement-and-recovery.md',
  'docs/battle/stage9-adaptive-performance.md',
  'assets/scripts/scenes/LootChainGameRoot.ts',
  'assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts',
  'assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts',
  'assets/scripts/scenes/lobby/LobbyBattleFlow.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  'assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts',
  'docs/current-chat-context.md',
  'docs/api-contract.md',
  'README.md',
  'package.json',
];

for (const file of requiredFiles) {
  assertExists(file);
}
for (let stage = 1; stage <= 9; stage += 1) {
  assertExists(`scripts/check-battle-stage${stage}.mjs`);
}

const packageText = read('package.json');
assertIncludes(packageText, '"check:battle-stage10": "node ./scripts/check-battle-stage10.mjs"', 'package script');

const stage1Spec = read('docs/battle/stage1-visual-battle-spec.md');
[
  '| 10 | 全链路验收 | 冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读 | 产品/测试验收 |',
  '冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读',
].forEach((token) => assertIncludes(stage1Spec, token, 'stage1 frozen route'));

const stage10Doc = read('docs/battle/stage10-full-chain-acceptance.md');
[
  'Stage 10',
  '全链路验收',
  '冒险 -> 编队 -> 战斗 -> 结算 -> 大厅回读',
  '产品验收',
  '策划验收',
  'UI 验收',
  '开发验收',
  '测试验收',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  '不新增后端接口',
  '不新增 SQL',
  '不新增经济写入口',
  '不触发真实战斗写入',
  'check:battle-stage10',
].forEach((token) => assertIncludes(stage10Doc, token, 'stage10 doc'));

[
  ['README.md', 'Visual Battle Stage 10 Full Chain Acceptance'],
  ['docs/api-contract.md', 'Visual Battle Stage 10 全链路验收契约'],
  ['docs/current-chat-context.md', '可视化战斗 Stage 10'],
].forEach(([file, token]) => assertIncludes(read(file), token, `${file} backfill`));
[
  ['README.md', 'Visual Battle Stage 10：全链路验收'],
  ['team-history/CURRENT_PROGRESS.md', 'Visual Battle Stage 10：全链路验收'],
  ['docs/24-战斗可视化与战斗系统.md', 'Stage 10 已在 Cocos 新增 `scripts/check-battle-stage10.mjs`'],
].forEach(([file, token]) => assertIncludes(readBackend(file), token, `backend ${file} backfill`));

const rootText = read('assets/scripts/scenes/LootChainGameRoot.ts');
[
  'openLobbyFormationPanel(stageCode',
  'openLobbyBattlePreviewPanel(stageCode',
  'startLobbyBattleSession()',
  'settleLobbyBattleSession()',
  'returnToLobbyFromBattlePreview()',
  'refreshLobbyReadonlyStateAfterBattle()',
  'invalidateLobbyBattleSessionForFormationChange()',
  'this.lobbyBattleFlow.prepare(stageCode);',
  'loadLobbyAdventure(true)',
  'loadLobbyBag(true)',
  'loadLobbyHeroRoster(true)',
].forEach((token) => assertIncludes(rootText, token, 'LootChainGameRoot full-chain hooks'));

const adventureText = read('assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts');
[
  'LobbyAdventureFormationButton',
  'canOpenBattleEntryStage',
  'resolveStageAction',
  "kind: 'formation' | 'upgrade' | 'disabled'",
  "this.host.openLobbyFormationPanel(stage.stageCode)",
].forEach((token) => assertIncludes(adventureText, token, 'adventure to formation hooks'));

const formationText = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');
[
  'canOpenBattlePreview',
  'openLobbyBattlePreviewPanel(stageCode',
  '阵容只用于 battle start 快照',
  '不保存长期队伍',
  'LobbyFormationBattlePreviewButton',
].forEach((token) => assertIncludes(formationText, token, 'formation to battle hooks'));

const flowText = read('assets/scripts/scenes/lobby/LobbyBattleFlow.ts');
[
  'startBattle(dto)',
  'settleBattle(currentStart.battleNo',
  'recentBattles()',
  'createRequestId',
  '同一关卡的战斗会话已经在创建或已创建时，不再重复 POST battle start',
].forEach((token) => assertIncludes(flowText, token, 'battle start settle hooks'));
[
  'grant',
  'rewardItems',
  'currencyChanges',
  'staminaAfter',
  'mainlineProgress',
].forEach((token) => assertNotIncludes(flowText, token, 'battle flow must not synthesize economy'));

const previewText = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
[
  'startLobbyBattleSession()',
  'settleLobbyBattleSession()',
  'returnToLobbyFromBattlePreview()',
  'resolveLobbyBattlePresentationSnapshot',
  'resolveLobbyBattlePresentationTimeline',
  'resolveBattleSettlementPresentationView',
  'resolveBattleAdaptivePerformanceProfile',
].forEach((token) => assertIncludes(previewText, token, 'battle preview full-chain presentation'));

const presentationText = read('assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts');
[
  '返回大厅后会刷新体力、背包、主线进度和最近战斗记录。',
  '本轮不提交奖励、体力或主线进度结算。',
  '战斗表现完成，本轮不提交结算，可返回大厅。',
  'returnToLobby: true',
].forEach((token) => assertIncludes(presentationText, token, 'battle result return guidance'));

runGuard('check:battle-stage1');
runGuard('check:battle-stage2');
runGuard('check:battle-stage3');
runGuard('check:battle-stage4');
runGuard('check:battle-stage5');
runGuard('check:battle-stage6');
runGuard('check:battle-stage7');
runGuard('check:battle-stage8');
runGuard('check:battle-stage9');
runGuard('check:layout');

console.log('[battle-stage10] Full-chain acceptance docs, hooks, previous guards, and layout checks passed.');

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

function runGuard(scriptName) {
  if (!/^check:(battle-stage[1-9]|layout)$/.test(scriptName)) {
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

function fail(message) {
  console.error(`[battle-stage10] ${message}`);
  process.exit(1);
}
