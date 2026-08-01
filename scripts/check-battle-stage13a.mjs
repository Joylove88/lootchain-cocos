import { existsSync, readFileSync } from 'node:fs';

// Stage 13A 守卫：校验关卡地图渲染器模块存在、关键 token 完整、不新增经济写入口。
const requiredFiles = [
  'assets/scripts/scenes/lobby/BattleStageMapRenderer.ts',
  'assets/scripts/scenes/lobby/BattleStageMapRenderer.ts.meta',
];

let ok = true;
for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`missing: ${file}`);
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
}

const mapRendererPath = 'assets/scripts/scenes/lobby/BattleStageMapRenderer.ts';
const mapRenderer = readFileSync(mapRendererPath, 'utf8');

const requiredTokens = [
  'export class BattleStageMapRenderer',
  'drawDottedPath',
  'resolveNodePositions',
  'renderStageNode',
  'BattleStageMapChapterTitle',
  'BattleStageMapNodeArtBoss',
  'selectStage',
  'previewLockedStage',
];

for (const token of requiredTokens) {
  if (!mapRenderer.includes(token)) {
    console.error(`missing token in ${mapRendererPath}: ${token}`);
    ok = false;
  }
}

// 经济红线：关卡地图渲染器不得包含经济写入口或 settle 调用。
const forbiddenTokens = [
  '/api/player/battles/settle',
  'rewardGranted',
  'staminaCost',
  'economyApplied',
  'progressApplied',
  'DIAMOND',
  'USDT',
  'fund-pool',
  'EX V1',
];

for (const token of forbiddenTokens) {
  if (mapRenderer.includes(token)) {
    console.error(`forbidden economy token in ${mapRendererPath}: ${token}`);
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13a ok');