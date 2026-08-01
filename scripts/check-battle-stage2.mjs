import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (packageJson.name !== 'lootchain-cocos') {
  console.error(`[battle-stage2] Refusing to run outside lootchain-cocos, got package name: ${packageJson.name}`);
  process.exit(1);
}

const imageAssets = [
  ['assets/resources/ui/battle/c1812/boss_gauge_frame.png', 'image', { width: 512, height: 54, borderLeft: 24, borderRight: 24 }],
  ['assets/resources/ui/battle/c1812/boss_gauge_bar.png', 'image', { width: 494, height: 36 }],
  ['assets/resources/ui/battle/c1812/skill_target_frame.png', 'image', { width: 63, height: 63 }],
  ['assets/resources/ui/battle/c1812/blood_deco.png', 'image', { width: 264, height: 188 }],
  ['assets/resources/ui/battle/c1812/buff_attack_up.png', 'image', { width: 32, height: 32 }],
  ['assets/resources/ui/battle/c1812/buff_defense_down.png', 'image', { width: 32, height: 32 }],
  ['assets/resources/ui/battle/c1812/buff_shield.png', 'image', { width: 32, height: 32 }],
  ['assets/resources/ui/battle/c1812/buff_stun.png', 'image', { width: 32, height: 32 }]
];

const audioAssets = [
  ['assets/resources/audio/battle/bgm/battle_loop_01.wav', 30, 45],
  ['assets/resources/audio/battle/sfx/attack/hero_basic_01.wav', 1.2, 2.4],
  ['assets/resources/audio/battle/sfx/attack/ranged_01.wav', 0.9, 1.8],
  ['assets/resources/audio/battle/sfx/hit/hit_light_01.wav', 0.5, 1.2],
  ['assets/resources/audio/battle/sfx/skill/hero_skill_01.wav', 2.0, 3.3],
  ['assets/resources/audio/battle/sfx/heal/heal_cast_01.wav', 1.1, 2.1],
  ['assets/resources/audio/battle/sfx/buff/buff_apply_01.wav', 1.1, 2.1],
  ['assets/resources/audio/battle/ui/result_win.wav', 5.5, 7.3],
  ['assets/resources/audio/battle/ui/result_lose.wav', 5.2, 7.1],
  ['assets/resources/audio/battle/ui/battle_start_stinger.wav', 0.45, 1.2]
];

const sourcePaths = [
  'C:/Users/axian/Desktop/C1812-1/素材切图/Boss_Gauge_Frame.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Boss_Gauge_Bar.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Boder_Select_Skill.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/deco_blood.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_AtkUp.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_DefDown.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_Shield.png',
  'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_Stun.png',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/BGM/BGM_Battle.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/001_Ella_Atk_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/102_RagamuffinArcher_Atk_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/169_AnkouBug_atk_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/002_Ella_Skill01_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/024_Miya_fairy01_Skill01_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/047_Sugarplum_Skill01_a_v1.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/002_Win.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/003_Lose.wav',
  'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/TouchStart.wav'
];

const docTokens = [
  'Stage 2 战斗资源导入与技术试听',
  'boss_gauge_frame.png',
  'battle_loop_01.wav',
  'hit_light_01',
  'ffprobe',
  '不新增经济写入口',
  'check:battle-stage2'
];

const allowedBattleC1812Files = new Set([
  'banner_defeat.png',
  'banner_defeat.png.meta',
  'banner_victory.png',
  'banner_victory.png.meta',
  'blood_deco.png',
  'blood_deco.png.meta',
  'boss_gauge_bar.png',
  'boss_gauge_bar.png.meta',
  'boss_gauge_frame.png',
  'boss_gauge_frame.png.meta',
  'buff_attack_up.png',
  'buff_attack_up.png.meta',
  'buff_defense_down.png',
  'buff_defense_down.png.meta',
  'buff_shield.png',
  'buff_shield.png.meta',
  'buff_stun.png',
  'buff_stun.png.meta',
  'hp_bar_fill.png',
  'hp_bar_fill.png.meta',
  'hp_bar_frame.png',
  'hp_bar_frame.png.meta',
  'skill_frame.png',
  'skill_frame.png.meta',
  'skill_frame_active.png',
  'skill_frame_active.png.meta',
  'skill_target_frame.png',
  'skill_target_frame.png.meta'
]);

const allowedBattleAudioFiles = new Set([
  'bgm.meta',
  'bgm/battle_loop_01.wav',
  'bgm/battle_loop_01.wav.meta',
  'sfx.meta',
  'sfx/attack.meta',
  'sfx/attack/hero_basic_01.wav',
  'sfx/attack/hero_basic_01.wav.meta',
  'sfx/attack/ranged_01.wav',
  'sfx/attack/ranged_01.wav.meta',
  'sfx/buff.meta',
  'sfx/buff/buff_apply_01.wav',
  'sfx/buff/buff_apply_01.wav.meta',
  'sfx/heal.meta',
  'sfx/heal/heal_cast_01.wav',
  'sfx/heal/heal_cast_01.wav.meta',
  'sfx/hit.meta',
  'sfx/hit/hit_light_01.wav',
  'sfx/hit/hit_light_01.wav.meta',
  'sfx/skill.meta',
  'sfx/skill/hero_skill_01.wav',
  'sfx/skill/hero_skill_01.wav.meta',
  'ui.meta',
  'ui/battle_start_stinger.wav',
  'ui/battle_start_stinger.wav.meta',
  'ui/result_lose.wav',
  'ui/result_lose.wav.meta',
  'ui/result_win.wav',
  'ui/result_win.wav.meta'
]);

function fail(message) {
  console.error(`[battle-stage2] ${message}`);
  process.exitCode = 1;
}

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function assertExists(filePath) {
  const target = path.isAbsolute(filePath) ? filePath : absolute(filePath);
  if (!fs.existsSync(target)) {
    fail(`Missing required path: ${target}`);
    return false;
  }
  return true;
}

function parsePngSize(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    fail(`Not a PNG: ${filePath}`);
    return { width: 0, height: 0 };
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON ${filePath}: ${error.message}`);
    return {};
  }
}

function probeDuration(filePath) {
  const result = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`ffprobe failed for ${filePath}: ${result.stderr || result.stdout}`);
    return 0;
  }
  return Number.parseFloat(result.stdout.trim());
}

function collectFiles(relativeDirectory) {
  const directoryPath = absolute(relativeDirectory);
  if (!fs.existsSync(directoryPath)) {
    fail(`Missing required directory: ${directoryPath}`);
    return [];
  }
  const files = [];
  const visit = (currentDirectory) => {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else {
        files.push(path.relative(directoryPath, entryPath).split(path.sep).join('/'));
      }
    }
  };
  visit(directoryPath);
  return files.sort();
}

function assertAllowedFiles(relativeDirectory, allowedFiles) {
  const actualFiles = collectFiles(relativeDirectory);
  for (const fileName of actualFiles) {
    if (!allowedFiles.has(fileName)) {
      fail(`${relativeDirectory} contains non-manifest file: ${fileName}`);
    }
  }
}

for (const sourcePath of sourcePaths) {
  assertExists(sourcePath);
}

assertExists('scripts/import-battle-stage2-assets.mjs');
assertExists('docs/battle/stage2-resource-import.md');

const docText = fs.readFileSync(absolute('docs/battle/stage2-resource-import.md'), 'utf8');
for (const token of docTokens) {
  if (!docText.includes(token)) {
    fail(`Stage 2 doc missing token: ${token}`);
  }
}

for (const [relativePath, importer, expected] of imageAssets) {
  const filePath = absolute(relativePath);
  const hasImage = assertExists(relativePath);
  const hasMeta = assertExists(`${relativePath}.meta`);
  if (!hasImage || !hasMeta) {
    continue;
  }
  const { width, height } = parsePngSize(filePath);
  if (width !== expected.width || height !== expected.height) {
    fail(`${relativePath} size expected ${expected.width}x${expected.height}, got ${width}x${height}`);
  }
  const meta = readJson(`${filePath}.meta`);
  if (meta.importer !== importer || meta.userData?.type !== 'sprite-frame') {
    fail(`${relativePath}.meta must be image sprite-frame metadata`);
  }
  const spriteFrame = meta.subMetas?.f9941?.userData;
  if (!spriteFrame) {
    fail(`${relativePath}.meta missing sprite-frame subMeta`);
  } else {
    if (spriteFrame.width !== expected.width || spriteFrame.height !== expected.height) {
      fail(`${relativePath}.meta sprite size mismatch`);
    }
    if (expected.borderLeft !== undefined && spriteFrame.borderLeft !== expected.borderLeft) {
      fail(`${relativePath}.meta borderLeft expected ${expected.borderLeft}, got ${spriteFrame.borderLeft}`);
    }
    if (expected.borderRight !== undefined && spriteFrame.borderRight !== expected.borderRight) {
      fail(`${relativePath}.meta borderRight expected ${expected.borderRight}, got ${spriteFrame.borderRight}`);
    }
  }
}

for (const [relativePath, minDuration, maxDuration] of audioAssets) {
  const filePath = absolute(relativePath);
  const hasAudio = assertExists(relativePath);
  const hasMeta = assertExists(`${relativePath}.meta`);
  if (!hasAudio || !hasMeta) {
    continue;
  }
  const meta = readJson(`${filePath}.meta`);
  if (meta.importer !== 'audio-clip' || meta.userData?.downloadMode !== 0) {
    fail(`${relativePath}.meta must be audio-clip metadata`);
  }
  const duration = probeDuration(filePath);
  if (!Number.isFinite(duration) || duration < minDuration || duration > maxDuration) {
    fail(`${relativePath} duration expected ${minDuration}-${maxDuration}s, got ${duration}s`);
  }
}

assertAllowedFiles('assets/resources/ui/battle/c1812', allowedBattleC1812Files);
assertAllowedFiles('assets/resources/audio/battle', allowedBattleAudioFiles);
assertExists('assets/resources/audio/battle.meta');

if (!process.exitCode) {
  console.log('[battle-stage2] Imported battle assets, metadata, docs, and audio probes passed.');
}
