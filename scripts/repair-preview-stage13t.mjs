import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const SPECIFIERS = {
  renderer: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  runtime: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts',
};

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`missing ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function chunkFileFor(importMap, specifier) {
  const chunkPath = String(importMap.imports?.[specifier] ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!chunkPath.startsWith('chunks/')) {
    throw new Error(`preview chunk not found for ${specifier}`);
  }
  return join(PREVIEW_ROOT, chunkPath);
}

function patchFile(file, transform) {
  const before = readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    writeFileSync(file, after, 'utf8');
    return true;
  }
  return false;
}

function replacePreviewProfile(text, key, profileText) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${escapedKey}: \\{\\s*targetHeightRatio: [^}]+?scaleMultiplier: [0-9.]+\\s*\\}`, 'm'), `${key}: ${profileText}`);
}

const importMap = readJson(IMPORT_MAP_PATH);
const rendererFile = chunkFileFor(importMap, SPECIFIERS.renderer);
const runtimeFile = chunkFileFor(importMap, SPECIFIERS.runtime);
let patched = 0;

patched += patchFile(rendererFile, (text) => {
  let next = text
    .replaceAll(
      'this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs);',
      'this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue);',
    )
    .replaceAll(
      'var actionOffset = this.resolveActorActionOffset(unit, enemy, slot, motionCue, presentation, actionAnchors);',
      'var actionOffset = this.resolveActorActionOffset(unit, enemy, slot, motionCue, presentation, actionAnchors, scale);',
    )
    .replace(
      'recordBattleActorFrameTelemetry(unit, enemy, position, presentation, openingConvergence, playbackTimelineTimeMs) {',
      'recordBattleActorFrameTelemetry(unit, enemy, position, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue) {',
    )
    .replace(
      "            side: enemy ? 'enemy' : 'ally',\n            x: Math.round(position.x * 100) / 100,",
      "            side: enemy ? 'enemy' : 'ally',\n            rarity: (unit.rarity || unit.scaleProfile || '').toUpperCase(),\n            actionKind: currentActionCue == null ? void 0 : currentActionCue.kind,\n            actionActorKey: currentActionCue == null ? void 0 : currentActionCue.actorKey,\n            actionTargetKey: currentActionCue == null ? void 0 : currentActionCue.targetKey,\n            isActionActor: (currentActionCue == null ? void 0 : currentActionCue.actorKey) === unit.unitKey,\n            x: Math.round(position.x * 100) / 100,",
    )
    .replace(
      'resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation, anchors) {',
      'resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation, anchors, scale) {',
    )
    .replace(
      `              var towardTarget = target.x - source.x;
              var safeDistance = Math.max(slot.width * 0.82, target.width * 0.72, 92);
              var desired = towardTarget - Math.sign(towardTarget || direction) * safeDistance;
              var minStep = direction * slot.width * Math.max(0.42, effectiveAdvanceRatio);
              var capped = clamp(Math.abs(desired), Math.abs(minStep), Math.max(slot.width * 1.05, Math.abs(towardTarget) * 0.72));
              return {
                x: Math.sign(desired || minStep) * capped,
                y: currentActionCue.kind === 'melee_move' ? 8 : 4
              };`,
      `              var towardTarget = target.x - source.x;
              var contactGap = Math.max(slot.width * 0.16, target.width * 0.14, 34 * scale);
              var desiredAdvance = Math.max(0, Math.abs(towardTarget) - contactGap);
              var visibleLunge = Math.min(Math.abs(towardTarget) * 0.64, slot.width * Math.max(0.28, effectiveAdvanceRatio));
              var maxAdvance = Math.max(slot.width * 0.32, desiredAdvance);
              var advanceDistance = clamp(Math.max(desiredAdvance, visibleLunge, slot.width * 0.14), slot.width * 0.12, maxAdvance);
              return {
                x: Math.sign(towardTarget || direction) * advanceDistance,
                y: currentActionCue.kind === 'melee_move' ? 8 : 4
              };`,
    )
    .replace(
      'var maxAdvance = Math.max(visibleLunge, Math.min(Math.max(slot.width * 0.36, Math.abs(towardTarget) * 0.88), slot.width * 1.05));',
      'var maxAdvance = Math.max(slot.width * 0.32, desiredAdvance);',
    );
  if (next.includes('var safeDistance = Math.max(slot.width * 0.82') || next.includes('slot.width * 1.05')) {
    throw new Error('failed to patch stale melee offset formula in preview renderer chunk');
  }
  return next;
}) ? 1 : 0;

patched += patchFile(runtimeFile, (text) => {
  let next = text
    .replaceAll('maxWidthRatio: 0.7,', 'maxWidthRatio: 1.38,')
    .replaceAll('maxWidthRatio: 0.72,', 'maxWidthRatio: 1.38,')
    .replaceAll('maxWidthRatio: 0.78,', 'maxWidthRatio: 1.24,')
    .replace(
      `function resolveBattleUnitSpineVisualProfile(unit, boss) {
    var _BATTLE_STAGE12_SPINE;

    if (boss) {
      return BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.BOSS;
    }

    var profileKey = ((unit == null ? void 0 : unit.scaleProfile) || (unit == null ? void 0 : unit.rarity) || '').trim().toUpperCase();
    return (_BATTLE_STAGE12_SPINE = BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY[profileKey]) != null ? _BATTLE_STAGE12_SPINE : BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.DEFAULT;
  }`,
      `function resolveBattleUnitSpineVisualProfile(unit, boss) {
    var _BATTLE_STAGE12_SPINE;

    if (boss) {
      return BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.BOSS;
    }

    var primaryAsset = unit ? resolveBattleUnitSpinePrimaryAsset(unit) : null;

    if (primaryAsset === 'Nuu') {
      return {
        targetHeightRatio: 0.78,
        maxWidthRatio: 2.2,
        minScale: 0.032,
        maxScale: 0.24,
        fallbackRawHeight: 1280,
        scaleMultiplier: 1.02
      };
    }

    if (['Belladonna', 'Carmilla', 'Eulenspigel', 'Ishmael', 'IshmaelA', 'LucienA', 'Lucrecia', 'Sphinx'].includes(primaryAsset)) {
      return {
        targetHeightRatio: 0.74,
        maxWidthRatio: 2.05,
        minScale: 0.034,
        maxScale: 0.24,
        fallbackRawHeight: 1180,
        scaleMultiplier: 0.92
      };
    }

    var profileKey = ((unit == null ? void 0 : unit.scaleProfile) || (unit == null ? void 0 : unit.rarity) || '').trim().toUpperCase();
    return (_BATTLE_STAGE12_SPINE = BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY[profileKey]) != null ? _BATTLE_STAGE12_SPINE : BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.DEFAULT;
  }`,
    );
  next = replacePreviewProfile(next, 'R', `{
          targetHeightRatio: 0.96,
          maxWidthRatio: 2,
          minScale: 0.038,
          maxScale: 0.42,
          fallbackRawHeight: 720,
          scaleMultiplier: 1.32
        }`);
  next = replacePreviewProfile(next, 'SR', `{
          targetHeightRatio: 0.96,
          maxWidthRatio: 2,
          minScale: 0.038,
          maxScale: 0.42,
          fallbackRawHeight: 760,
          scaleMultiplier: 1.32
        }`);
  if (next.includes('maxWidthRatio: 0.7') || next.includes('maxWidthRatio: 0.72') || next.includes('maxWidthRatio: 0.78')) {
    throw new Error('failed to patch stale Spine width caps in preview runtime chunk');
  }
  return next;
}) ? 1 : 0;

console.log(`preview stage13t repair patched files: ${patched}`);
