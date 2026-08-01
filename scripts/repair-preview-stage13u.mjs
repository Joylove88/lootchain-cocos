import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// repair-preview-stage13u: align live Cocos Preview chunks with Stage 13U source when Creator keeps serving stale JS.
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
  return text.replace(
    new RegExp(`${escapedKey}: \\{\\s*targetHeightRatio: [^}]+?scaleMultiplier: [0-9.]+\\s*\\}`, 'm'),
    `${key}: ${profileText}`,
  );
}

function patchRenderer(text) {
  let next = text
    .replaceAll(
      'this.resolveActionAnimationName(unit, currentActionCue, actorActive, targetActive)',
      'this.resolveActionAnimationName(unit, currentActionCue, actorActive, targetActive, playbackTimelineTimeMs, timelineToPresentationRatio)',
    )
    .replaceAll(
      'this.applyBattleActorSpineCueOnce(currentActionCue.cueKey, actor, unit, actionAnimationName);',
      'this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(currentActionCue.cueKey, actionAnimationName), actor, unit, actionAnimationName);',
    )
    .replaceAll(
      'this.applyBattleActorSpineCueOnce(cueKey, actor, unit, actionAnimationName);',
      'this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(cueKey, actionAnimationName), actor, unit, actionAnimationName);',
    )
    .replace(
      /resolveActorActionOffset\(unit, enemy, slot, currentActionCue, presentation, anchors, scale\) \{[\s\S]*?\n        isCurrentActionActor\(unit, currentActionCue, presentation\) \{/,
      `resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation, anchors, scale) {
          if (!currentActionCue || presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording') {
            return {
              x: 0,
              y: 0
            };
          }

          var direction = enemy ? -1 : 1;

          if (currentActionCue.actorKey === unit.unitKey && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack')) {
            var targetContactOffset = this.resolveActorTargetContactOffset(currentActionCue, slot, anchors, scale);

            if (targetContactOffset) {
              return targetContactOffset;
            }

            var effectiveAdvanceRatio = currentActionCue.kind === 'basic_attack' ? Math.max(currentActionCue.advanceRatio, currentActionCue.actorRole === 'boss' ? 0.32 : 0.44) : currentActionCue.advanceRatio;
            return {
              x: direction * slot.width * effectiveAdvanceRatio,
              y: currentActionCue.kind === 'melee_move' ? 5 : 2
            };
          }

          if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'ranged_projectile') {
            return {
              x: direction * slot.width * 0.04,
              y: 3
            };
          }

          if (currentActionCue.targetKey === unit.unitKey && currentActionCue.kind === 'damage_float') {
            return {
              x: -direction * slot.width * 0.025,
              y: 0
            };
          }

          if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'hit_float') {
            return {
              x: -direction * slot.width * 0.04,
              y: -1
            };
          }

          return {
            x: 0,
            y: 0
          };
        }

        resolveActorTargetContactOffset(currentActionCue, slot, anchors, scale) {
          var source = anchors.get(currentActionCue.actorKey);
          var target = anchors.get(currentActionCue.targetKey);

          if (!source || !target) {
            return null;
          }

          var contactGap = Math.max(target.width * (target.role === 'boss' ? 0.22 : 0.12), slot.width * 0.08, 24 * scale);
          var contactX = target.x + (target.enemy ? -1 : 1) * contactGap;
          var actionLaneOffset = this.resolveBattleActionLaneOffset(currentActionCue, scale);
          var sourceLaneDelta = clamp(source.y - target.y, -target.height * 0.28, target.height * 0.28);
          var contactY = target.y + sourceLaneDelta * 0.22 + actionLaneOffset;
          return {
            x: contactX - source.x,
            y: contactY - source.y
          };
        }

        resolveBattleActionLaneOffset(currentActionCue, scale) {
          var seed = currentActionCue.actorKey + '|' + currentActionCue.targetKey + '|' + currentActionCue.eventSeq;
          var hash = 0;

          for (var index = 0; index < seed.length; index += 1) {
            hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
          }

          return (hash % 5 - 2) * 7 * scale;
        }

        isCurrentActionActor(unit, currentActionCue, presentation) {`,
    )
    .replace(
      /resolveBattleActorRootMotionPosition\(homePosition, targetPosition, cue, playbackTimelineTimeMs, timelineToPresentationRatio\) \{[\s\S]*?\n        setBattleActorFramePosition\(actor, position\) \{/,
      `resolveBattleActorRootMotionPosition(homePosition, targetPosition, cue, playbackTimelineTimeMs, timelineToPresentationRatio) {
          var visualElapsedMs = (playbackTimelineTimeMs - cue.timeMs) * Math.max(0.08, timelineToPresentationRatio);
          var elapsedMs = clamp(visualElapsedMs, 0, cue.durationMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS + BATTLE_ACTOR_ATTACK_RETURN_MS);

          if (cue.kind === 'ranged_projectile') {
            var approachMs = Math.min(BATTLE_ACTOR_RANGED_NUDGE_MS, Math.max(90, cue.durationMs * 0.35));

            if (elapsedMs <= approachMs) {
              return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / approachMs));
            }

            var returnProgress = clamp((elapsedMs - approachMs) / Math.max(1, cue.durationMs - approachMs), 0, 1);
            return lerpVec3(targetPosition, homePosition, easeBattleActorMotionProgress(returnProgress));
          }

          if (cue.kind === 'melee_move') {
            var _approachMs = Math.min(190, Math.max(145, cue.durationMs * 0.28));

            if (elapsedMs <= _approachMs) {
              return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / _approachMs));
            }

            return targetPosition;
          }

          if (cue.kind === 'basic_attack') {
            var strikeHoldMs = Math.max(260, cue.durationMs * 0.58);

            if (elapsedMs <= strikeHoldMs) {
              return targetPosition;
            }

            var returnStartMs = cue.durationMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS;

            if (elapsedMs <= returnStartMs) {
              return targetPosition;
            }

            var _returnProgress = clamp((elapsedMs - returnStartMs) / BATTLE_ACTOR_ATTACK_RETURN_MS, 0, 1);
            return lerpVec3(targetPosition, homePosition, easeBattleActorMotionProgress(_returnProgress));
          }

          return homePosition;
        }

        setBattleActorFramePosition(actor, position) {`,
    )
    .replace(
      /resolveActionAnimationName\(unit, currentActionCue, actorActive, targetActive(?:, playbackTimelineTimeMs, timelineToPresentationRatio)?\) \{[\s\S]*?\n        resolveAssistAnimationName\(unit, currentAssistCue, actorActive, targetActive\) \{/,
      `resolveActionAnimationName(unit, currentActionCue, actorActive, targetActive, playbackTimelineTimeMs, timelineToPresentationRatio) {
          if (!currentActionCue) {
            return null;
          }

          if (targetActive && (currentActionCue.kind === 'damage_float' || currentActionCue.kind === 'hit_float')) {
            return 'hit';
          }

          if (actorActive && currentActionCue.actorKey === unit.unitKey) {
            if (currentActionCue.kind === 'melee_move') {
              return 'run';
            }

            return currentActionCue.animationName;
          }

          return null;
        }

        resolveBattleSpineCuePlaybackKey(cueKey, animationName) {
          return cueKey + ':' + (animationName || 'idle');
        }

        resolveAssistAnimationName(unit, currentAssistCue, actorActive, targetActive) {`,
    );

  if (next.includes('visibleLunge') || next.includes('slot.width * 1.05')) {
    throw new Error('failed to remove stale preview melee lunge formula');
  }
  if (!next.includes('resolveActorTargetContactOffset(currentActionCue, slot, anchors, scale)')) {
    throw new Error('failed to insert preview target-contact offset helper');
  }
  if (!next.includes("if (cue.kind === 'basic_attack') {")) {
    throw new Error('failed to insert preview basic attack contact hold');
  }
  if (!next.includes('resolveBattleSpineCuePlaybackKey')) {
    throw new Error('failed to insert preview animation-specific spine cue key');
  }

  return next;
}

function patchRuntime(text) {
  let next = replacePreviewProfile(text, 'R', `{
          targetHeightRatio: 1.18,
          maxWidthRatio: 2.72,
          minScale: 0.042,
          maxScale: 0.68,
          fallbackRawHeight: 720,
          scaleMultiplier: 2.05
        }`);
  next = replacePreviewProfile(next, 'SR', `{
          targetHeightRatio: 1.18,
          maxWidthRatio: 2.72,
          minScale: 0.042,
          maxScale: 0.68,
          fallbackRawHeight: 760,
          scaleMultiplier: 2.05
        }`);
  if (!next.includes('FORMATION_PREVIEW:')) {
    next = next.replace(
      `BOSS: {
          targetHeightRatio: 0.82,
          maxWidthRatio: 1.24,
          minScale: 0.036,
          maxScale: 0.3,
          fallbackRawHeight: 1000,
          scaleMultiplier: 1
        },
        DEFAULT: {`,
      `BOSS: {
          targetHeightRatio: 0.82,
          maxWidthRatio: 1.24,
          minScale: 0.036,
          maxScale: 0.3,
          fallbackRawHeight: 1000,
          scaleMultiplier: 1
        },
        FORMATION_PREVIEW: {
          targetHeightRatio: 1.08,
          maxWidthRatio: 2.18,
          minScale: 0.04,
          maxScale: 0.5,
          fallbackRawHeight: 840,
          scaleMultiplier: 1.22
        },
        DEFAULT: {`,
    );
  }
  next = next.replace(
    `function resolveBattleUnitSpineRarityTier(unit) {
    var raw = (unit.scaleProfile || unit.rarity || '').trim().toUpperCase();`,
    `function resolveBattleUnitSpineRarityTier(unit) {
    var scaleProfile = (unit.scaleProfile || '').trim().toUpperCase();
    var rarity = (unit.rarity || '').trim().toUpperCase();
    var raw = scaleProfile === 'FORMATION_PREVIEW' ? rarity : (unit.scaleProfile || unit.rarity || '').trim().toUpperCase();`,
  );
  next = next.replace(
    `var primaryAsset = unit ? resolveBattleUnitSpinePrimaryAsset(unit) : null;`,
    `var profileKey = ((unit == null ? void 0 : unit.scaleProfile) || (unit == null ? void 0 : unit.rarity) || '').trim().toUpperCase();

    if (profileKey === 'FORMATION_PREVIEW') {
      return BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW;
    }

    var primaryAsset = unit ? resolveBattleUnitSpinePrimaryAsset(unit) : null;`,
  );
  next = next.replace(
    `var profileKey = ((unit == null ? void 0 : unit.scaleProfile) || (unit == null ? void 0 : unit.rarity) || '').trim().toUpperCase();
    return (_BATTLE_STAGE12_SPINE = BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY[profileKey]) != null ? _BATTLE_STAGE12_SPINE : BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.DEFAULT;`,
    `return (_BATTLE_STAGE12_SPINE = BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY[profileKey]) != null ? _BATTLE_STAGE12_SPINE : BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.DEFAULT;`,
  );

  if (!next.includes('targetHeightRatio: 1.18') || !next.includes('FORMATION_PREVIEW')) {
    throw new Error('failed to patch preview SR/R or formation spine profile');
  }
  if (!next.includes("scaleProfile === 'FORMATION_PREVIEW' ? rarity")) {
    throw new Error('failed to patch preview formation animation rarity fallback');
  }

  return next;
}

const importMap = readJson(IMPORT_MAP_PATH);
const rendererFile = chunkFileFor(importMap, SPECIFIERS.renderer);
const runtimeFile = chunkFileFor(importMap, SPECIFIERS.runtime);

let patched = 0;
patched += patchFile(rendererFile, patchRenderer) ? 1 : 0;
patched += patchFile(runtimeFile, patchRuntime) ? 1 : 0;

console.log(`preview stage13u repair patched files: ${patched}`);
