import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = fs.realpathSync(process.cwd());
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (packageJson.name !== 'lootchain-cocos') {
  throw new Error(`[battle-stage2-import] Refusing to run outside lootchain-cocos, got package name: ${packageJson.name}`);
}

const imageAssets = [
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/Boss_Gauge_Frame.png',
    target: 'assets/resources/ui/battle/c1812/boss_gauge_frame.png',
    displayName: 'boss_gauge_frame',
    borderLeft: 24,
    borderRight: 24,
    borderTop: 0,
    borderBottom: 0
  },
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/Boss_Gauge_Bar.png',
    target: 'assets/resources/ui/battle/c1812/boss_gauge_bar.png',
    displayName: 'boss_gauge_bar'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/Boder_Select_Skill.png',
    target: 'assets/resources/ui/battle/c1812/skill_target_frame.png',
    displayName: 'skill_target_frame'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/deco_blood.png',
    target: 'assets/resources/ui/battle/c1812/blood_deco.png',
    displayName: 'blood_deco'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_AtkUp.png',
    target: 'assets/resources/ui/battle/c1812/buff_attack_up.png',
    displayName: 'buff_attack_up'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_DefDown.png',
    target: 'assets/resources/ui/battle/c1812/buff_defense_down.png',
    displayName: 'buff_defense_down'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_Shield.png',
    target: 'assets/resources/ui/battle/c1812/buff_shield.png',
    displayName: 'buff_shield'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812-1/素材切图/Buff_Stun.png',
    target: 'assets/resources/ui/battle/c1812/buff_stun.png',
    displayName: 'buff_stun'
  }
];

const audioAssets = [
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/BGM/BGM_Battle.wav',
    target: 'assets/resources/audio/battle/bgm/battle_loop_01.wav',
    displayName: 'battle_loop_01'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/001_Ella_Atk_a_v1.wav',
    target: 'assets/resources/audio/battle/sfx/attack/hero_basic_01.wav',
    displayName: 'hero_basic_01'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/102_RagamuffinArcher_Atk_a_v1.wav',
    target: 'assets/resources/audio/battle/sfx/attack/ranged_01.wav',
    displayName: 'ranged_01'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/169_AnkouBug_atk_a_v1.wav',
    target: 'assets/resources/audio/battle/sfx/hit/hit_light_01.wav',
    displayName: 'hit_light_01'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/002_Ella_Skill01_a_v1.wav',
    target: 'assets/resources/audio/battle/sfx/skill/hero_skill_01.wav',
    displayName: 'hero_skill_01'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/024_Miya_fairy01_Skill01_a_v1.wav',
    target: 'assets/resources/audio/battle/sfx/heal/heal_cast_01.wav',
    displayName: 'heal_cast_01'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/FX/Source/047_Sugarplum_Skill01_a_v1.wav',
    target: 'assets/resources/audio/battle/sfx/buff/buff_apply_01.wav',
    displayName: 'buff_apply_01'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/002_Win.wav',
    target: 'assets/resources/audio/battle/ui/result_win.wav',
    displayName: 'result_win'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/003_Lose.wav',
    target: 'assets/resources/audio/battle/ui/result_lose.wav',
    displayName: 'result_lose'
  },
  {
    source: 'C:/Users/axian/Desktop/C1812音效/Data/Sound/UI/TouchStart.wav',
    target: 'assets/resources/audio/battle/ui/battle_start_stinger.wav',
    displayName: 'battle_start_stinger'
  }
];

function fail(message) {
  throw new Error(`[battle-stage2-import] ${message}`);
}

function toAbsoluteProjectPath(relativePath) {
  if (path.isAbsolute(relativePath)) {
    fail(`Target path must be project-relative: ${relativePath}`);
  }
  if (!relativePath.startsWith('assets/resources/')) {
    fail(`Target path must stay under assets/resources: ${relativePath}`);
  }
  const absolutePath = path.resolve(root, relativePath);
  const relativeFromRoot = path.relative(root, absolutePath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    fail(`Refusing to write outside project root: ${absolutePath}`);
  }
  return absolutePath;
}

function ensureDirectoryMeta(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  const metaPath = `${directoryPath}.meta`;
  if (fs.existsSync(metaPath)) {
    return;
  }
  const meta = {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData: {}
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

function ensureTargetDirectory(relativeFilePath) {
  const targetPath = toAbsoluteProjectPath(relativeFilePath);
  const directoryPath = path.dirname(targetPath);
  const relativeDirectory = path.relative(root, directoryPath);
  const parts = relativeDirectory.split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    ensureDirectoryMeta(current);
  }
  return targetPath;
}

function parsePngSize(filePath) {
  const bytes = fs.readFileSync(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature) {
    fail(`Not a PNG file: ${filePath}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function buildImageMeta(asset, width, height) {
  const uuid = crypto.randomUUID();
  const textureUuid = `${uuid}@6c48a`;
  const spriteUuid = `${uuid}@f9941`;
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid,
    files: ['.json', '.png'],
    subMetas: {
      '6c48a': {
        importer: 'texture',
        uuid: textureUuid,
        displayName: asset.displayName,
        id: '6c48a',
        name: 'texture',
        userData: {
          wrapModeS: 'clamp-to-edge',
          wrapModeT: 'clamp-to-edge',
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'none',
          anisotropy: 0,
          isUuid: true,
          imageUuidOrDatabaseUri: uuid,
          visible: false
        },
        ver: '1.0.22',
        imported: true,
        files: ['.json'],
        subMetas: {}
      },
      f9941: {
        importer: 'sprite-frame',
        uuid: spriteUuid,
        displayName: asset.displayName,
        id: 'f9941',
        name: 'spriteFrame',
        userData: {
          trimThreshold: 1,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          trimX: 0,
          trimY: 0,
          width,
          height,
          rawWidth: width,
          rawHeight: height,
          borderTop: asset.borderTop ?? 0,
          borderBottom: asset.borderBottom ?? 0,
          borderLeft: asset.borderLeft ?? 0,
          borderRight: asset.borderRight ?? 0,
          packable: true,
          pixelsToUnit: 100,
          pivotX: 0.5,
          pivotY: 0.5,
          meshType: 0,
          isUuid: true,
          imageUuidOrDatabaseUri: textureUuid,
          atlasUuid: '',
          trimType: 'custom',
          vertices: {
            rawPosition: [-width / 2, -height / 2, 0, width / 2, -height / 2, 0, -width / 2, height / 2, 0, width / 2, height / 2, 0],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, height, width, height, 0, 0, width, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-width / 2, -height / 2, 0],
            maxPos: [width / 2, height / 2, 0]
          }
        },
        ver: '1.0.12',
        imported: true,
        files: ['.json'],
        subMetas: {}
      }
    },
    userData: {
      type: 'sprite-frame',
      fixAlphaTransparencyArtifacts: true,
      hasAlpha: true,
      redirect: textureUuid
    }
  };
}

function buildAudioMeta(asset) {
  return {
    ver: '1.0.0',
    importer: 'audio-clip',
    imported: true,
    uuid: crypto.randomUUID(),
    files: ['.json', path.extname(asset.target)],
    subMetas: {},
    userData: {
      downloadMode: 0
    }
  };
}

function importImage(asset) {
  if (!fs.existsSync(asset.source)) {
    fail(`Missing source image: ${asset.source}`);
  }
  const targetPath = ensureTargetDirectory(asset.target);
  fs.copyFileSync(asset.source, targetPath);
  const metaPath = `${targetPath}.meta`;
  if (!fs.existsSync(metaPath)) {
    const { width, height } = parsePngSize(targetPath);
    fs.writeFileSync(metaPath, `${JSON.stringify(buildImageMeta(asset, width, height), null, 2)}\n`, 'utf8');
  }
  console.log(`[battle-stage2-import] image ${asset.target}`);
}

function importAudio(asset) {
  if (!fs.existsSync(asset.source)) {
    fail(`Missing source audio: ${asset.source}`);
  }
  const targetPath = ensureTargetDirectory(asset.target);
  fs.copyFileSync(asset.source, targetPath);
  const metaPath = `${targetPath}.meta`;
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, `${JSON.stringify(buildAudioMeta(asset), null, 2)}\n`, 'utf8');
  }
  console.log(`[battle-stage2-import] audio ${asset.target}`);
}

for (const asset of imageAssets) {
  importImage(asset);
}

for (const asset of audioAssets) {
  importAudio(asset);
}

console.log('[battle-stage2-import] imported Stage 2 battle assets.');
