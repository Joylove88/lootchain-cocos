import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'docs/battle/stage1-visual-battle-spec.md',
  'docs/battle/stage1-asset-audio-inventory.md',
  'assets/resources/ui/battle/battle_scene_cathedral.png',
  'assets/resources/ui/battle/c1812/hp_bar_frame.png',
  'assets/resources/ui/battle/c1812/hp_bar_fill.png',
  'assets/resources/ui/battle/c1812/skill_frame.png',
  'assets/resources/ui/battle/c1812/skill_frame_active.png',
  'assets/resources/ui/common/c1812/title_banner.png',
  'assets/resources/ui/common/c1812/button_primary.png',
  'assets/resources/ui/common/c1812/modal_frame.png'
];

const externalRequiredPaths = [
  'C:/Users/axian/Desktop/C1812-1',
  'C:/Users/axian/Desktop/C1812音效',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Boss_Gauge_Frame.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Boss_Gauge_Bar.png',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/001_Ella_Atk_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/002_Ella_Skill01_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/002_Win.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/003_Lose.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/BGM/BGM_Battle.wav'
];

const specTokens = [
  'Cocos 可视化自动战斗 V1',
  'POST /api/player/battles/start',
  'POST /api/player/battles/{battleNo}/settle',
  '不新增经济写入口',
  'MAIN_1_1',
  'MAIN_25_16',
  'serverSeed + battleNo + unitSnapshot',
  'idle',
  'attack_01',
  'skill_01',
  'damage',
  'settlement_result',
  '390x340',
  '1280x720',
  '1920x1080',
  '只记录不接入',
  'C1812音效',
  '产品验收',
  '策划验收',
  'DB 设计验收',
  '测试验收'
];

const inventoryTokens = [
  'battle_scene_cathedral.png',
  'hp_bar_frame.png',
  'skill_frame.png',
  'Boss_Gauge_Frame.png',
  'Buff_*.png',
  'BGM_Battle.wav',
  '001_Ella_Atk_a_v1.wav',
  '002_Win.wav',
  '只记录不接入',
  'C1812-1',
  'C1812音效'
];

function fail(message) {
  console.error(`[battle-stage1] ${message}`);
  process.exitCode = 1;
}

function assertExists(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(root, filePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required path: ${absolutePath}`);
  }
}

function readRequired(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required file: ${absolutePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

for (const filePath of requiredFiles) {
  assertExists(filePath);
}

for (const filePath of externalRequiredPaths) {
  assertExists(filePath);
}

const specText = readRequired('docs/battle/stage1-visual-battle-spec.md');
const inventoryText = readRequired('docs/battle/stage1-asset-audio-inventory.md');

for (const token of specTokens) {
  if (!specText.includes(token)) {
    fail(`Spec missing token: ${token}`);
  }
}

for (const token of inventoryTokens) {
  if (!inventoryText.includes(token)) {
    fail(`Inventory missing token: ${token}`);
  }
}

const forbiddenSpecTokens = [
  '新增奖励写入口',
  '新增体力写入口',
  '新增进度写入口',
  '新增货币写入口',
  '新增背包写入口',
  '客户端按本地伤害发奖'
];

for (const token of forbiddenSpecTokens) {
  if (specText.includes(token)) {
    fail(`Spec contains forbidden token: ${token}`);
  }
}

if (!process.exitCode) {
  console.log('[battle-stage1] Spec, inventory, candidate paths, and boundary tokens passed.');
}

