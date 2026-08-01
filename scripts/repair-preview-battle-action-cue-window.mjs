import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const ACTION_SPECIFIER = 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts';

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

function patchActionPresentation(text) {
  let next = text;

  if (!next.includes('resolveCueActivationLeadWindowMs')) {
    next = next.replace(
      'cue.timeMs <= timeMs + leadWindowMs && timeMs <= cue.timeMs + resolveTimelineWindowMs(cue)',
      'cue.timeMs <= timeMs + resolveCueActivationLeadWindowMs(cue, leadWindowMs) && timeMs <= cue.timeMs + resolveTimelineWindowMs(cue)',
    );
    next = next.replace(
      'cue.timeMs <= currentEvent.timeMs + leadWindowMs && currentEvent.timeMs <= cue.timeMs + resolveTimelineWindowMs(cue)',
      'cue.timeMs <= currentEvent.timeMs + resolveCueActivationLeadWindowMs(cue, leadWindowMs) && currentEvent.timeMs <= cue.timeMs + resolveTimelineWindowMs(cue)',
    );
    next = next.replace(
      `function resolveBattleActionCueVisibleWindowMs(cue) {
    return cue.durationMs + ACTION_CUE_VISIBLE_PADDING_MS[cue.kind];
  }`,
      `function resolveBattleActionCueVisibleWindowMs(cue) {
    return cue.durationMs + ACTION_CUE_VISIBLE_PADDING_MS[cue.kind];
  }

  function resolveCueActivationLeadWindowMs(cue, leadWindowMs) {
    return cue.kind === 'melee_move' || cue.kind === 'ranged_projectile' ? leadWindowMs : 0;
  }`,
    );
  }

  if (
    !next.includes('resolveCueActivationLeadWindowMs(cue, leadWindowMs)')
    || !next.includes("cue.kind === 'melee_move' || cue.kind === 'ranged_projectile'")
  ) {
    throw new Error('preview action cue window patch failed');
  }

  return next;
}

const importMap = readJson(IMPORT_MAP_PATH);
const actionFile = chunkFileFor(importMap, ACTION_SPECIFIER);
const before = readFileSync(actionFile, 'utf8');
const after = patchActionPresentation(before);
if (after !== before) {
  writeFileSync(actionFile, after, 'utf8');
  console.log('preview battle action cue window repair patched files: 1');
} else {
  console.log('preview battle action cue window repair patched files: 0');
}
