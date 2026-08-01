import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const RENDERER_SPECIFIER = 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts';

function readJson(file) {
  if (!existsSync(file)) {
    throw new Error(`missing ${file}`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function chunkFileFor(importMap, specifier) {
  const chunkPath = String(importMap.imports?.[specifier] ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!chunkPath.startsWith('chunks/')) {
    throw new Error(`preview chunk not found for ${specifier}`);
  }
  return join(PREVIEW_ROOT, chunkPath);
}

const importMap = readJson(IMPORT_MAP_PATH);
const rendererFile = chunkFileFor(importMap, RENDERER_SPECIFIER);
const before = readFileSync(rendererFile, 'utf8');
const after = before.replace(/BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = \d+;/g, 'BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 240;');

if (!after.includes('BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 240;')) {
  throw new Error(`failed to repair battle contact spacing in ${rendererFile}`);
}

if (after !== before) {
  writeFileSync(rendererFile, after, 'utf8');
  console.log('preview battle contact spacing repair patched files: 1');
} else {
  console.log('preview battle contact spacing repair patched files: 0');
}
