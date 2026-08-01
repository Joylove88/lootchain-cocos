import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Align live Cocos Preview chunks with the Stage 13V/13W/13X source when Creator keeps serving stale JS.
const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const SPECIFIERS = {
  renderer: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
  layout: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePresentationLayout.ts',
  state: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleState.ts',
  timeline: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts',
  action: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
  runtime: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts',
  formation: 'file:///D:/project/lootchain-cocos/assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts',
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
  const after = dedupeStage13PreviewConstants(transform(before));
  if (after !== before) {
    writeFileSync(file, after, 'utf8');
    return true;
  }
  return false;
}

function patchBattleCathedralBackgroundAssets(text) {
  return text
    .replaceAll('ui/battle/stage13z/desert_battle_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13z/desert_battle_ground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13y/battle_stage_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13y/battle_stage_ground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll("LOBBY_BATTLE_SCENE_BG_ASSET = 'ui/battle/battle_scene_cathedral/spriteFrame'", "LOBBY_BATTLE_SCENE_BG_ASSET = 'ui/battle/battle_scene_cathedral/spriteFrame'")
    .replaceAll(
      "if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {\n            this.host.addSprite('LobbyBattleSceneGroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame'",
      "if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {\n            this.host.addSprite('LobbyBattleSceneGroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame'",
    )
    .replaceAll(
      "if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {\n            this.host.addSprite('LobbyBattleSceneForegroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame'",
      "if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {\n            this.host.addSprite('LobbyBattleSceneForegroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame'",
    )
    .replaceAll('ui/battle/battle_scene_cathedral/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/battle_scene_cathedral/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13y/battle_stage_foreground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13x/boundary_battle_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_battle_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_ground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_foreground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replace(/\(\s*36,\s*73,\s*76,\s*255\s*\)/g, '(18, 28, 42, 255)')
    .replace(/\(\s*11,\s*11,\s*16,\s*255\s*\)/g, '(18, 28, 42, 255)')
    .replace(/\(\s*89,\s*125,\s*101,\s*235\s*\)/g, '(30, 36, 34, 246)')
    .replace(/\(\s*31,\s*20,\s*24,\s*246\s*\)/g, '(30, 36, 34, 246)')
    .replace(/\(\s*45,\s*92,\s*80,\s*226\s*\)/g, '(25, 38, 46, 232)')
    .replace(/\(\s*22,\s*17,\s*22,\s*232\s*\)/g, '(25, 38, 46, 232)')
    .replace(/\(\s*20,\s*48,\s*45,\s*190\s*\)/g, '(12, 18, 27, 178)')
    .replace(/\(\s*7,\s*8,\s*12,\s*(?:154|188)\s*\)/g, '(12, 18, 27, 178)')
    .replace(/\(\s*214,\s*177,\s*93,\s*52\s*\)/g, '(218, 156, 76, 62)');
}

function patchPreviewBackgroundTelemetry(text) {
  return text.replace(
    /var bg = this\.host\.addSprite\('LobbyBattleSceneBackdropSprite', LOBBY_BATTLE_SCENE_BG_ASSET, 0, 0, sceneWidth, sceneHeight, sceneRoot\);\s*var groundHeight =/g,
    `var bg = this.host.addSprite('LobbyBattleSceneBackdropSprite', LOBBY_BATTLE_SCENE_BG_ASSET, 0, 0, sceneWidth, sceneHeight, sceneRoot);
          if (bg) {
            var backgroundTelemetry = globalThis.__lootchainBattlePlaybackTelemetry;
            if (backgroundTelemetry) {
              backgroundTelemetry.background = {
                source: 'asset',
                loaded: true,
                at: Date.now()
              };
            }
          }
          var groundHeight =`,
  );
}

function battleFieldVeilSnippet(parentName, widthExpr, heightExpr, namePrefix) {
  return `var ${namePrefix}Veil = this.host.addChildPlainNode(${parentName}, 'LobbyBattleFieldEnvironmentVeil', 0, 0, ${widthExpr}, ${heightExpr});
          var ${namePrefix}VeilGraphics = ${namePrefix}Veil.addComponent(Graphics);
          ${namePrefix}VeilGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(0, 0, 0, 18);
          ${namePrefix}VeilGraphics.rect(-${widthExpr} / 2, -${heightExpr} / 2, ${widthExpr}, ${heightExpr});
          ${namePrefix}VeilGraphics.fill();
          ${namePrefix}VeilGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(3, 5, 9, 44);
          ${namePrefix}VeilGraphics.rect(-${widthExpr} / 2, -${heightExpr} / 2, ${widthExpr}, ${heightExpr} * 0.18);
          ${namePrefix}VeilGraphics.rect(-${widthExpr} / 2, ${heightExpr} / 2 - ${heightExpr} * 0.14, ${widthExpr}, ${heightExpr} * 0.14);
          ${namePrefix}VeilGraphics.fill();`;
}

function patchBattleFieldEnvironmentOverlay(text) {
  let next = text.replace(
    /renderBattleFieldEnvironment\(parent, width, height, scale\) \{[\s\S]*?\n        drawBattleFallbackLandscape\(parent, width, height, scale, compact\) \{/,
    `renderBattleFieldEnvironment(parent, width, height, scale) {
          ${battleFieldVeilSnippet('parent', 'width', 'height', 'field')}
        }

        drawBattleFallbackLandscape(parent, width, height, scale, compact) {`,
  );

  next = next.replace(
    /this\.battleFieldNode = field;[\s\S]*?var graphics = field\.addComponent\(Graphics\);/,
    `this.battleFieldNode = field;
          ${battleFieldVeilSnippet('field', 'fieldRect.width', 'fieldRect.height', 'field')}
          var graphics = field.addComponent(Graphics);`,
  );

  return next;
}

function patchBattleSceneEnvironmentDuplicateLayers(text) {
  return text.replace(
    /var groundHeight = Math\.min\(sceneHeight \* 0\.42, Math\.max\(178 \* scale, sceneWidth \* \(397 \/ 1680\)\)\);\s*this\.host\.addSprite\('LobbyBattleSceneGroundSprite', 'ui\/battle\/battle_scene_cathedral\/spriteFrame', 0, -sceneHeight \/ 2 \+ groundHeight \/ 2, sceneWidth, groundHeight, sceneRoot\);\s*var foregroundHeight = Math\.min\(sceneHeight \* 0\.22, Math\.max\(92 \* scale, sceneWidth \* \(208 \/ 1680\)\)\);\s*this\.host\.addSprite\('LobbyBattleSceneForegroundSprite', 'ui\/battle\/battle_scene_cathedral\/spriteFrame', 0, -sceneHeight \/ 2 \+ foregroundHeight \/ 2, sceneWidth, foregroundHeight, sceneRoot\);/g,
    `var groundHeight = Math.min(sceneHeight * 0.42, Math.max(178 * scale, sceneWidth * (397 / 1680)));
          if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {
            this.host.addSprite('LobbyBattleSceneGroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame', 0, -sceneHeight / 2 + groundHeight / 2, sceneWidth, groundHeight, sceneRoot);
          }
          var foregroundHeight = Math.min(sceneHeight * 0.22, Math.max(92 * scale, sceneWidth * (208 / 1680)));
          if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {
            this.host.addSprite('LobbyBattleSceneForegroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame', 0, -sceneHeight / 2 + foregroundHeight / 2, sceneWidth, foregroundHeight, sceneRoot);
          }`,
  )
    .replace(
      /if \(LOBBY_BATTLE_SCENE_GROUND_ASSET !== LOBBY_BATTLE_SCENE_BG_ASSET\) \{\s*this\.host\.addSprite\('LobbyBattleSceneGroundSprite', LOBBY_BATTLE_SCENE_GROUND_ASSET, 0, -sceneHeight \/ 2 \+ groundHeight \/ 2, sceneWidth, groundHeight, sceneRoot\);\s*\}/g,
      `if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {
            this.host.addSprite('LobbyBattleSceneGroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame', 0, -sceneHeight / 2 + groundHeight / 2, sceneWidth, groundHeight, sceneRoot);
          }`,
    )
    .replace(
      /if \(LOBBY_BATTLE_SCENE_FOREGROUND_ASSET !== LOBBY_BATTLE_SCENE_BG_ASSET\) \{\s*this\.host\.addSprite\('LobbyBattleSceneForegroundSprite', LOBBY_BATTLE_SCENE_FOREGROUND_ASSET, 0, -sceneHeight \/ 2 \+ foregroundHeight \/ 2, sceneWidth, foregroundHeight, sceneRoot\);\s*\}/g,
      `if ('ui/battle/battle_scene_cathedral/spriteFrame' !== LOBBY_BATTLE_SCENE_BG_ASSET) {
            this.host.addSprite('LobbyBattleSceneForegroundSprite', 'ui/battle/battle_scene_cathedral/spriteFrame', 0, -sceneHeight / 2 + foregroundHeight / 2, sceneWidth, foregroundHeight, sceneRoot);
          }`,
    );
}

function patchStage13XMeleeDuelFrame(text) {
  const replacement = `resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation, anchors, scale) {
          if (!currentActionCue || presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording') {
            return { x: 0, y: 0 };
          }

          var direction = enemy ? -1 : 1;

          if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'melee_move') {
            var duelFrame = this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale);
            var source = anchors.get(currentActionCue.actorKey);
            if (duelFrame && source) {
              return {
                x: duelFrame.actorDuelPosition.x - source.x,
                y: duelFrame.actorDuelPosition.y - source.y
              };
            }
            return { x: direction * slot.width * currentActionCue.advanceRatio, y: 5 };
          }

          if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'basic_attack') {
            return { x: direction * slot.width * 0.018, y: this.resolveBattleActionLaneOffset(currentActionCue, scale) * 0.12 };
          }

          if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'ranged_projectile') {
            return { x: direction * slot.width * 0.04, y: 3 };
          }

          if (currentActionCue.targetKey === unit.unitKey && currentActionCue.kind === 'melee_move') {
            var targetDuelFrame = this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale);
            var target = anchors.get(currentActionCue.targetKey);
            if (targetDuelFrame && target) {
              return {
                x: targetDuelFrame.defenderDuelPosition.x - target.x,
                y: targetDuelFrame.defenderDuelPosition.y - target.y
              };
            }
          }

          if (currentActionCue.targetKey === unit.unitKey && currentActionCue.kind === 'damage_float') {
            return { x: -direction * slot.width * 0.025, y: 0 };
          }

          if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'hit_float') {
            return { x: -direction * slot.width * 0.04, y: -1 };
          }

          return { x: 0, y: 0 };
        }

        resolveActorMeleeContactPosition(currentActionCue, anchors, scale) {
          var _this$resolveActorMe;
          return (_this$resolveActorMe = this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale)) == null ? void 0 : _this$resolveActorMe.actorDuelPosition;
        }

        resolveActorMeleeDuelFrame(currentActionCue, anchors, scale) {
          var source = anchors.get(currentActionCue.actorKey);
          var target = anchors.get(currentActionCue.targetKey);
          if (!source || !target) {
            return null;
          }
          var roleGapBoost = currentActionCue.actorRole === 'boss' || currentActionCue.targetRole === 'boss' ? 1.18 : 1;
          var actorSide = source.enemy ? 1 : -1;
          var laneDelta = clamp(source.y - target.y, -target.height * 0.24, target.height * 0.24);
          var attackerFootprint = source.width * 0.06;
          var targetFootprint = target.width * 0.05;
          var contactGap = clamp((attackerFootprint + targetFootprint + Math.max(source.width, target.width) * BATTLE_MELEE_CONTACT_GAP_RATIO) * roleGapBoost, 24 * scale, 56 * scale);
          var defenderStep = clamp(Math.abs(source.x - target.x) * BATTLE_MELEE_DEFENDER_STEP_RATIO, 38 * scale, currentActionCue.targetRole === 'boss' ? 104 * scale : 86 * scale);
          var actionLaneOffset = this.resolveBattleActionLaneOffset(currentActionCue, scale);
          var defenderDuelPosition = {
            x: target.x + actorSide * defenderStep,
            y: target.y
          };
          var actorDuelPosition = {
            x: defenderDuelPosition.x + actorSide * contactGap,
            y: target.y + laneDelta * 0.16 + actionLaneOffset
          };
          var hitPoint = {
            x: (actorDuelPosition.x + defenderDuelPosition.x) / 2,
            y: (actorDuelPosition.y + defenderDuelPosition.y) / 2 + target.height * 0.12
          };
          return {
            actorDuelPosition: actorDuelPosition,
            defenderDuelPosition: defenderDuelPosition,
            hitPoint: hitPoint
          };
        }

        resolveActorDefenderMeetOffset(currentActionCue, anchors, scale) {
          var source = anchors.get(currentActionCue.actorKey);
          var target = anchors.get(currentActionCue.targetKey);
          if (!source || !target) {
            return null;
          }
          var duelFrame = this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale);
          if (duelFrame) {
            return {
              x: duelFrame.defenderDuelPosition.x - target.x,
              y: duelFrame.defenderDuelPosition.y - target.y
            };
          }
          var towardSource = Math.sign(source.x - target.x) || (target.enemy ? -1 : 1);
          var meetDistance = clamp(Math.abs(source.x - target.x) * BATTLE_MELEE_DEFENDER_STEP_RATIO, 28 * scale, 76 * scale);
          var fallbackLaneDelta = clamp(source.y - target.y, -target.height * 0.24, target.height * 0.24);
          return { x: towardSource * meetDistance, y: fallbackLaneDelta * 0.08 };
        }`;

  return text
    .replace(/BATTLE_MELEE_CONTACT_GAP_RATIO\s*=\s*0\.(?:035|055|08|12|18);/g, 'BATTLE_MELEE_CONTACT_GAP_RATIO = 0.035;')
    .replace(/BATTLE_MELEE_DEFENDER_STEP_RATIO\s*=\s*0\.(?:018|045|1|12|18|24|3|34);/g, 'BATTLE_MELEE_DEFENDER_STEP_RATIO = 0.1;')
    .replace(
      /resolveActorActionOffset\(unit, enemy, slot, currentActionCue, presentation, anchors, scale\) \{[\s\S]*?\n        resolveBattleActionLaneOffset\(currentActionCue, scale\) \{/,
      `${replacement}

        resolveBattleActionLaneOffset(currentActionCue, scale) {`,
    );
}

function normalizeStage13XMeleeConstants(text) {
  return text.replace(
    /(BATTLE_ACTOR_ATTACK_RETURN_MS = 1680;\n)(?:\s*BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = \d+;\n)?(?:\s*BATTLE_MELEE_CONTACT_GAP_RATIO = 0\.(?:035|055|12|18);\n\s*BATTLE_MELEE_DEFENDER_STEP_RATIO = 0\.(?:018|24|3|34);\n?)+/g,
    '$1      BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520;\n      BATTLE_MELEE_CONTACT_GAP_RATIO = 0.035;\n      BATTLE_MELEE_DEFENDER_STEP_RATIO = 0.1;\n',
  );
}

function normalizeStage13YMeleeTiming(text) {
  return text
    .replace(/BATTLE_ACTOR_MELEE_APPROACH_MS\s*=\s*\d+;/g, 'BATTLE_ACTOR_MELEE_APPROACH_MS = 1500;')
    .replace(/BATTLE_ACTOR_BASIC_ATTACK_APPROACH_MS\s*=\s*\d+;/g, 'BATTLE_ACTOR_BASIC_ATTACK_APPROACH_MS = 640;')
    .replace(/BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS\s*=\s*\d+;/g, 'BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS = 260;')
    .replace(/BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS\s*=\s*\d+;/g, 'BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520;')
    .replaceAll('Math.max(1580, cue.durationMs * 0.92)', 'Math.max(320, cue.durationMs * 0.38)')
    .replaceAll('Math.max(1120, cue.durationMs * 0.86)', 'Math.max(320, cue.durationMs * 0.38)')
    .replaceAll('BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS, BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR', 'BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS, BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS, BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR')
    .replaceAll('Math.min(620, Math.max(320, cue.durationMs * 0.34))', 'Math.min(640, Math.max(320, cue.durationMs * 0.38))')
    .replaceAll('Math.min(360, Math.max(220, cue.durationMs * 0.24))', 'Math.min(640, Math.max(320, cue.durationMs * 0.38))')
    .replaceAll('Math.min(620, Math.max(320, rootMotionCue.durationMs * 0.34))', 'Math.min(640, Math.max(320, rootMotionCue.durationMs * 0.38))')
    .replaceAll('Math.min(360, Math.max(220, rootMotionCue.durationMs * 0.24))', 'Math.min(640, Math.max(320, rootMotionCue.durationMs * 0.38))')
    .replaceAll('BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS = 260;', 'BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS = 260;\n      BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520;')
    .replace(
      /var visualElapsedMs = \(playbackTimelineTimeMs - cue\.timeMs\) \* Math\.max\(0\.08, timelineToPresentationRatio\);\s*var motionElapsedMs = cue\.kind === 'basic_attack' \? visualElapsedMs \+ \d+ : visualElapsedMs;\s*var elapsedMs = clamp\(motionElapsedMs,/g,
      "var visualElapsedMs = (playbackTimelineTimeMs - cue.timeMs) * Math.max(0.82, timelineToPresentationRatio);\n          var elapsedMs = clamp(visualElapsedMs,",
    )
    .replaceAll('return visualElapsedMs <= Math.min(520, Math.max(320, cue.durationMs * 0.38));', 'return false;')
    .replaceAll('return visualElapsedMs + 260 <= Math.min(520, Math.max(320, cue.durationMs * 0.38));', 'return false;')
    .replaceAll('return visualElapsedMs + 420 <= Math.min(520, Math.max(320, cue.durationMs * 0.38));', 'return false;')
    .replaceAll('return visualElapsedMs + 520 <= Math.min(640, Math.max(320, cue.durationMs * 0.38));', 'return false;')
    .replaceAll('return visualElapsedMs + BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS <= Math.min(640, Math.max(320, cue.durationMs * 0.38));', 'return false;')
    .replaceAll('Math.max(260, cue.durationMs * 0.5)', 'Math.max(340, cue.durationMs * 0.55)');
}

function dedupeStage13PreviewConstants(text) {
  return text
    .replace(/(?:[ \t]*BATTLE_ACTOR_FRAME_MAX_DELTA = (?:120|104);\r?\n){2,}/g, '      BATTLE_ACTOR_FRAME_MAX_DELTA = 104;\n')
    .replace(/(?:[ \t]*BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520;\r?\n){2,}/g, '      BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520;\n')
    .replace(/(?:[ \t]*BATTLE_MELEE_CONTACT_GAP_RATIO = 0\.035;\r?\n[ \t]*BATTLE_MELEE_DEFENDER_STEP_RATIO = 0\.1;\r?\n){2,}/g, '      BATTLE_MELEE_CONTACT_GAP_RATIO = 0.035;\n      BATTLE_MELEE_DEFENDER_STEP_RATIO = 0.1;\n');
}

function patchRenderer(text) {
  let next = text
    .replaceAll('ui/battle/battle_scene_cathedral/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/battle_scene_cathedral/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13y/battle_stage_foreground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13x/boundary_battle_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_battle_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_ground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_foreground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replace(/BATTLE_ACTOR_MELEE_APPROACH_MS\s*=\s*\d+;/g, 'BATTLE_ACTOR_MELEE_APPROACH_MS = 1500;')
    .replaceAll('BATTLE_OPENING_CENTER_CONVERGENCE_RATIO', 'BATTLE_OPENING_ENTRY_DISTANCE_RATIO')
    .replaceAll('BATTLE_OPENING_CENTER_STOP_GAP_RATIO', 'BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO')
    .replaceAll('BATTLE_OPENING_CENTER_MAX_DISTANCE_RATIO', 'BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO')
    .replaceAll('BATTLE_OPENING_LANE_STOP_GAP_RATIOS', 'BATTLE_OPENING_LANE_ENTRY_RATIOS')
    .replaceAll('Math.max(1120, cue.durationMs * 0.86)', 'Math.max(320, cue.durationMs * 0.38)')
    .replaceAll('BATTLE_ACTOR_ATTACK_RETURN_MS = 340;', 'BATTLE_ACTOR_ATTACK_RETURN_MS = 1680;')
    .replaceAll('BATTLE_ACTOR_ATTACK_RETURN_MS = 880;', 'BATTLE_ACTOR_ATTACK_RETURN_MS = 1680;')
    .replaceAll('BATTLE_ACTOR_POSITION_EPSILON, BATTLE_ACTOR_MELEE_APPROACH_MS', 'BATTLE_ACTOR_POSITION_EPSILON, BATTLE_ACTOR_FRAME_MAX_DELTA, BATTLE_ACTOR_MELEE_APPROACH_MS')
    .replaceAll('BATTLE_ACTOR_POSITION_EPSILON = 0.45;', 'BATTLE_ACTOR_POSITION_EPSILON = 0.45;\n      BATTLE_ACTOR_FRAME_MAX_DELTA = 104;')
    .replaceAll('BATTLE_ACTOR_ATTACK_RETURN_MS, BATTLE_PROTAGONIST_MALE_FALLBACK_ASSET', 'BATTLE_ACTOR_ATTACK_RETURN_MS, BATTLE_MELEE_CONTACT_GAP_RATIO, BATTLE_MELEE_DEFENDER_STEP_RATIO, BATTLE_PROTAGONIST_MALE_FALLBACK_ASSET')
    .replaceAll('BATTLE_ACTOR_ATTACK_RETURN_MS = 1680;', 'BATTLE_ACTOR_ATTACK_RETURN_MS = 1680;\n      BATTLE_MELEE_CONTACT_GAP_RATIO = 0.035;\n      BATTLE_MELEE_DEFENDER_STEP_RATIO = 0.1;')
    .replaceAll('BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS = 260;', 'BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS = 260;\n      BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520;')
    .replaceAll('this.battlePlaybackNodes = new Map();\n          this.playedBattleCueKeys = new Set();', 'this.battlePlaybackNodes = new Map();\n          this.battleActorFramePositions = new Map();\n          this.playedBattleCueKeys = new Set();')
    .replaceAll('this.battlePlaybackNodes.clear();\n          this.playedBattleCueKeys.clear();', 'this.battlePlaybackNodes.clear();\n          this.battleActorFramePositions.clear();\n          this.playedBattleCueKeys.clear();')
    .replaceAll("this.lastBattleTelemetryBucket = '';", 'this.battleTelemetryBuckets = new Set();')
    .replaceAll('this.lastBattleTelemetryBucket = bucket;', 'this.battleTelemetryBuckets.add(bucket); if (this.battleTelemetryBuckets.size > 6000) { this.battleTelemetryBuckets.clear(); }')
    .replaceAll('if (bucket === this.lastBattleTelemetryBucket) {\n            return;\n          }', 'if (this.battleTelemetryBuckets.has(bucket)) {\n            return;\n          }')
    .replaceAll('return visualElapsedMs <= Math.min(220, approachMs * 0.48);', 'return visualElapsedMs <= approachMs;');
  next = patchBattleCathedralBackgroundAssets(next);
  next = patchPreviewBackgroundTelemetry(next);
  next = patchBattleSceneEnvironmentDuplicateLayers(next);
  next = patchStage13XMeleeDuelFrame(next);
  next = normalizeStage13XMeleeConstants(next);
  next = normalizeStage13YMeleeTiming(next);
  next = patchStage13YActorFrameSmoothing(next);
  next = patchActionCueRatioCalls(next);
  next = next
    .replaceAll('BATTLE_OPENING_ENTRY_DISTANCE_RATIO = 0.46;', 'BATTLE_OPENING_ENTRY_DISTANCE_RATIO = 0.96;')
    .replaceAll('BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO = 0.34;', 'BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO = 0.76;')
    .replaceAll('BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO = 0.82;', 'BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO = 1.28;')
    .replaceAll('BATTLE_OPENING_LANE_ENTRY_RATIOS = [0.48, 0.56, 0.52, 0.62, 0.68];', 'BATTLE_OPENING_LANE_ENTRY_RATIOS = [0.94, 1.08, 1.0, 1.18, 1.24];');
  next = next.replace(
    /resolveActorConvergedCombatPosition\(slot, enemy, scale\) \{[\s\S]*?\n        resolveActorCombatBasePosition\(slot, enemy, openingConvergence, presentation, scale\) \{/,
    `resolveActorConvergedCombatPosition(slot, enemy, scale) {
          var side = enemy ? 1 : -1;
          var homePull = slot.lane <= 2 ? 0.62 : 0.58;
          var laneX = slot.x * homePull;
          var minSideX = Math.max(208 * scale, slot.width * 0.78);
          var maxSideX = Math.max(minSideX, slot.width * 1.48);
          var x = side * clamp(Math.abs(laneX), minSideX, maxSideX);
          var laneYCompression = slot.lane <= 2 ? 0.98 : 1.04;
          return { x: x, y: slot.y * laneYCompression };
        }

        resolveActorCombatBasePosition(slot, enemy, openingConvergence, presentation, scale) {`,
  );
  next = next.replace(
    /var offset = this\.resolveOpeningConvergenceOffset\(slot, enemy, progress, scale\);\n          return \{\n            x: slot\.x \+ offset\.x,\n            y: slot\.y \+ offset\.y\n          \};/,
    `var offset = this.resolveOpeningConvergenceOffset(slot, enemy, progress, scale);
          var converged = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
          return { x: converged.x + offset.x, y: converged.y + offset.y };`,
  );
  next = next.replace(
    /if \(cue\.kind === 'basic_attack'\) \{[\s\S]*?\n          \}\n\n          return homePosition;/,
    `if (cue.kind === 'basic_attack') {
            var strikeHoldMs = Math.max(BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS, cue.durationMs * 2.18);
            if (elapsedMs <= strikeHoldMs) {
              return targetPosition;
            }
            var returnStartMs = strikeHoldMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS;
            if (elapsedMs <= returnStartMs) {
              return targetPosition;
            }
            var _returnProgress = clamp((elapsedMs - returnStartMs) / BATTLE_ACTOR_ATTACK_RETURN_MS, 0, 1);
            return lerpVec3(targetPosition, homePosition, easeBattleActorMotionProgress(_returnProgress));
          }

          return homePosition;`,
  );
  next = next.replace(
    /if \(rootMotionCue\.kind === 'melee_move'\) \{\n              return 'run';\n            \}/,
    `if (rootMotionCue.kind === 'melee_move') {
               return 'run';
             }`,
  );
  next = next.replace(
    /resolveActorMeleeDuelFrame\(currentActionCue, anchors, scale\) \{[\s\S]*?\n        resolveActorDefenderMeetOffset\(currentActionCue, anchors, scale\) \{/,
    `resolveActorMeleeDuelFrame(currentActionCue, anchors, scale) {
          var source = anchors.get(currentActionCue.actorKey);
          var target = anchors.get(currentActionCue.targetKey);
          if (!source || !target) {
            return null;
          }
          var roleGapBoost = currentActionCue.actorRole === 'boss' || currentActionCue.targetRole === 'boss' ? 1.18 : 1;
          var actorSide = source.enemy ? 1 : -1;
          var laneDelta = clamp(source.y - target.y, -target.height * 0.24, target.height * 0.24);
          var attackerFootprint = source.width * 0.06;
          var targetFootprint = target.width * 0.05;
          var contactGap = clamp((attackerFootprint + targetFootprint + Math.max(source.width, target.width) * BATTLE_MELEE_CONTACT_GAP_RATIO) * roleGapBoost, 24 * scale, 56 * scale);
          var defenderStep = clamp(Math.abs(source.x - target.x) * BATTLE_MELEE_DEFENDER_STEP_RATIO, 38 * scale, currentActionCue.targetRole === 'boss' ? 104 * scale : 86 * scale);
          var actionLaneOffset = this.resolveBattleActionLaneOffset(currentActionCue, scale);
          var defenderDuelPosition = { x: target.x + actorSide * defenderStep, y: target.y };
          var actorDuelPosition = { x: defenderDuelPosition.x + actorSide * contactGap, y: target.y + laneDelta * 0.16 + actionLaneOffset };
          var hitPoint = { x: (actorDuelPosition.x + defenderDuelPosition.x) / 2, y: (actorDuelPosition.y + defenderDuelPosition.y) / 2 + target.height * 0.12 };
          return { actorDuelPosition: actorDuelPosition, defenderDuelPosition: defenderDuelPosition, hitPoint: hitPoint };
        }

        resolveActorDefenderMeetOffset(currentActionCue, anchors, scale) {`,
  );

  const sceneFallbackLandscape = `var sceneFallbackLandscape = this.host.addChildPlainNode(sceneRoot, 'LobbyBattleSceneFallbackLandscape', 0, 0, sceneWidth, sceneHeight);
          var sceneFallbackGraphics = sceneFallbackLandscape.addComponent(Graphics);
          var sceneGroundTop = -sceneHeight * 0.12;
          sceneFallbackGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(11, 11, 16, 255);
          sceneFallbackGraphics.rect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, sceneHeight);
          sceneFallbackGraphics.fill();
          sceneFallbackGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(31, 20, 24, 246);
          sceneFallbackGraphics.rect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, Math.max(1, sceneGroundTop + sceneHeight / 2));
          sceneFallbackGraphics.fill();
          sceneFallbackGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(7, 8, 12, 188);
          sceneFallbackGraphics.moveTo(-sceneWidth / 2, sceneHeight * 0.13);
          sceneFallbackGraphics.lineTo(-sceneWidth * 0.36, sceneHeight * 0.34);
          sceneFallbackGraphics.lineTo(-sceneWidth * 0.24, sceneHeight * 0.14);
          sceneFallbackGraphics.lineTo(-sceneWidth * 0.11, sceneHeight * 0.3);
          sceneFallbackGraphics.lineTo(sceneWidth * 0.03, sceneHeight * 0.1);
          sceneFallbackGraphics.lineTo(sceneWidth * 0.18, sceneHeight * 0.28);
          sceneFallbackGraphics.lineTo(sceneWidth * 0.31, sceneHeight * 0.12);
          sceneFallbackGraphics.lineTo(sceneWidth * 0.44, sceneHeight * 0.31);
          sceneFallbackGraphics.lineTo(sceneWidth / 2, sceneHeight * 0.12);
          sceneFallbackGraphics.lineTo(sceneWidth / 2, -sceneHeight / 2);
          sceneFallbackGraphics.lineTo(-sceneWidth / 2, -sceneHeight / 2);
          sceneFallbackGraphics.close();
          sceneFallbackGraphics.fill();
          sceneFallbackGraphics.strokeColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(214, 177, 93, 52);
          sceneFallbackGraphics.lineWidth = Math.max(1, 1.1 * scale);
          for (var fallbackLane = 0; fallbackLane < 6; fallbackLane += 1) {
            var laneY = sceneGroundTop - (fallbackLane + 1) * sceneHeight * 0.065;
            var inset = sceneWidth * (0.18 + fallbackLane * 0.045);
            sceneFallbackGraphics.moveTo(-sceneWidth / 2 + inset, laneY);
            sceneFallbackGraphics.lineTo(sceneWidth / 2 - inset, laneY + sceneHeight * 0.018);
          }
          sceneFallbackGraphics.stroke();`;
  const fieldFallbackLandscape = `var fieldFallbackLandscape = this.host.addChildPlainNode(field, 'LobbyBattleFieldFallbackLandscape', 0, 0, fieldRect.width, fieldRect.height);
          var fieldFallbackGraphics = fieldFallbackLandscape.addComponent(Graphics);
          var fieldGroundTop = -fieldRect.height * 0.08;
          fieldFallbackGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(11, 11, 16, 255);
          fieldFallbackGraphics.rect(-fieldRect.width / 2, -fieldRect.height / 2, fieldRect.width, fieldRect.height);
          fieldFallbackGraphics.fill();
          fieldFallbackGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(31, 20, 24, 246);
          fieldFallbackGraphics.rect(-fieldRect.width / 2, -fieldRect.height / 2, fieldRect.width, Math.max(1, fieldGroundTop + fieldRect.height / 2));
          fieldFallbackGraphics.fill();
          fieldFallbackGraphics.fillColor = (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(7, 8, 12, 188);
          fieldFallbackGraphics.moveTo(-fieldRect.width / 2, fieldRect.height * 0.13);
          fieldFallbackGraphics.lineTo(-fieldRect.width * 0.36, fieldRect.height * 0.34);
          fieldFallbackGraphics.lineTo(-fieldRect.width * 0.24, fieldRect.height * 0.14);
          fieldFallbackGraphics.lineTo(-fieldRect.width * 0.11, fieldRect.height * 0.3);
          fieldFallbackGraphics.lineTo(fieldRect.width * 0.03, fieldRect.height * 0.1);
          fieldFallbackGraphics.lineTo(fieldRect.width * 0.18, fieldRect.height * 0.28);
          fieldFallbackGraphics.lineTo(fieldRect.width * 0.31, fieldRect.height * 0.12);
          fieldFallbackGraphics.lineTo(fieldRect.width * 0.44, fieldRect.height * 0.31);
          fieldFallbackGraphics.lineTo(fieldRect.width / 2, fieldRect.height * 0.12);
          fieldFallbackGraphics.lineTo(fieldRect.width / 2, -fieldRect.height / 2);
          fieldFallbackGraphics.lineTo(-fieldRect.width / 2, -fieldRect.height / 2);
          fieldFallbackGraphics.close();
          fieldFallbackGraphics.fill();`;

  if (!next.includes('LobbyBattleSceneFallbackLandscape')) {
    next = next.replace(
      /var bg = this\.host\.addSprite\('LobbyBattleSceneBackdropSprite', LOBBY_BATTLE_SCENE_BG_ASSET, 0, 0, sceneWidth, sceneHeight, sceneRoot\);\s*if \(!bg\) \{[\s\S]*?\}\s*var groundHeight =/,
      `${sceneFallbackLandscape}
          var bg = this.host.addSprite('LobbyBattleSceneBackdropSprite', LOBBY_BATTLE_SCENE_BG_ASSET, 0, 0, sceneWidth, sceneHeight, sceneRoot);
          var groundHeight =`,
    );
  }
  if (!next.includes('LobbyBattleFieldFallbackLandscape')) {
    next = next.replace(
      "this.battleFieldNode = field;\n          this.host.addSprite('LobbyBattleFieldBackgroundSprite'",
      `this.battleFieldNode = field;
          ${fieldFallbackLandscape}
          this.host.addSprite('LobbyBattleFieldBackgroundSprite'`,
    );
  }
  next = patchBattleFieldEnvironmentOverlay(next);
  next = patchBattleSceneEnvironmentDuplicateLayers(next);
  if (!next.includes('BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR')) {
    next = next.replace(
      'Math.max(0.82, timelineToPresentationRatio)',
      'Math.max(0.82, timelineToPresentationRatio) /* BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR */',
    );
  }
  next = next.replace(
    /(\} else if \(rootMotionCue && \(rootMotionCue\.kind === 'melee_move' \|\| rootMotionCue\.kind === 'basic_attack'\)[\s\S]*?\{\s*)this\.applyBattleActorSpineCueOnce\(this\.resolveBattleSpineCuePlaybackKey\(currentActionCue\.cueKey, actionAnimationName\), actor, unit, actionAnimationName\);/,
    "$1this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(rootMotionCue.cueKey, actionAnimationName), actor, unit, actionAnimationName);",
  );
  next = next.replace(
    /(if \(rootMotionCue && \(rootMotionCue\.kind === 'melee_move' \|\| rootMotionCue\.kind === 'basic_attack' \|\| rootMotionCue\.kind === 'ranged_projectile'\)[\s\S]*?\{\s*)this\.applyBattleActorSpineCueOnce\(this\.resolveBattleSpineCuePlaybackKey\(currentActionCue\.cueKey, actionAnimationName\), actor, unit, actionAnimationName\);/,
    "$1this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(rootMotionCue.cueKey, actionAnimationName), actor, unit, actionAnimationName);",
  );
  next = next
    .replace(
      new RegExp("rootMotionCue && \\(rootMotionCue\\.kind === 'melee_move' \\|\\| rootMotionCue\\.kind === 'basic_" + "attack'\\) && \\(presentation\\.phase === 'roundPlaying' \\|\\| presentation\\.phase === 'resultRecording'\\)", 'g'),
      "rootMotionCue && (rootMotionCue.kind === 'melee_move' || rootMotionCue.kind === 'basic_attack') && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')",
    )
    .replace(
      new RegExp("rootMotionCue && \\(rootMotionCue\\.kind === 'melee_move' \\|\\| rootMotionCue\\.kind === 'basic_" + "attack' \\|\\| rootMotionCue\\.kind === 'ranged_projectile'\\)", 'g'),
      "rootMotionCue && (rootMotionCue.kind === 'melee_move' || rootMotionCue.kind === 'basic_attack' || rootMotionCue.kind === 'ranged_projectile')",
    )
    .replace(
      /rootMotionCue && \(rootMotionCue\.kind === 'melee_move' \|\| rootMotionCue\.kind === 'ranged_projectile'\)/g,
      "rootMotionCue && (rootMotionCue.kind === 'melee_move' || rootMotionCue.kind === 'basic_attack' || rootMotionCue.kind === 'ranged_projectile')",
    );

  next = next.replace(
    /BATTLE_OPENING_ENTRY_DISTANCE_RATIO = 0\.48;\s*BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO = 1\.08;\s*BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO = 1\.36;\s*BATTLE_OPENING_LANE_ENTRY_RATIOS = \[[^\]]+\];/,
    'BATTLE_OPENING_ENTRY_DISTANCE_RATIO = 0.46;\n      BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO = 0.34;\n      BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO = 0.82;\n      BATTLE_OPENING_LANE_ENTRY_RATIOS = [0.48, 0.56, 0.52, 0.62, 0.68];',
  );

  next = next.replace(
    /resolveBattleActorFramePosition\(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors\)/g,
    'resolveBattleActorFramePosition(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors)',
  );
  next = next.replace(
    /resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio\)/g,
    'resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue)',
  );
  next = next.replace(
    /(var rootMotionCue = this\.resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue\);\s*)+var actorPosition/g,
    'var rootMotionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);\n          var actorPosition',
  );
  next = next.replace(
    /if \(targetActive \|\| assistTargetActive\) \{\s*var targetFrame = this\.host\.addChildPlainNode\(visualRoot, 'LobbyBattleSkillTargetFrame'[\s\S]*?targetFrameGraphics\.stroke\(\);\s*\}\s*var assistAnimationName =/,
    `if (targetActive || assistTargetActive) {
            var frameWidth = Math.min(slot.width * 0.7, 126 * scale);
            var frameHeight = Math.min(slot.height * 0.16, 34 * scale);
            var targetFrame = this.host.addChildPlainNode(visualRoot, 'LobbyBattleSkillTargetFrame', 0, -slot.height * 0.42, frameWidth, frameHeight);
            var frameSprite = this.host.addSprite('LobbyBattleSkillTargetFrameSprite', snapshot.stage2UiAssets.skillTargetFrame, 0, 0, frameWidth, frameHeight, targetFrame);
            if (!frameSprite) {
              var targetFrameGraphics = targetFrame.addComponent(Graphics);
              targetFrameGraphics.fillColor = assistTargetActive ? (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(73, 177, 225, 22) : (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(255, 198, 86, 20);
              targetFrameGraphics.ellipse(0, 0, Math.min(slot.width * 0.34, 58 * scale), Math.max(7 * scale, slot.height * 0.036));
              targetFrameGraphics.fill();
              targetFrameGraphics.strokeColor = assistTargetActive ? (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(145, 215, 255, 130) : (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(255, 214, 120, 116);
              targetFrameGraphics.lineWidth = Math.max(1, 1.1 * scale);
              targetFrameGraphics.ellipse(0, 0, Math.min(slot.width * 0.36, 62 * scale), Math.max(8 * scale, slot.height * 0.04));
              targetFrameGraphics.stroke();
            }
          }

          var assistAnimationName =`,
  );
  next = next.replace(
    "var assistTargetActive = this.isCurrentAssistTarget(unit, currentAssistCue, presentation);\n          var assistAnimationName = this.resolveAssistAnimationName(unit, currentAssistCue, assistActorActive, assistTargetActive);",
    "var assistTargetActive = this.isCurrentAssistTarget(unit, currentAssistCue, presentation);\n          var rootMotionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);\n          var assistAnimationName = this.resolveAssistAnimationName(unit, currentAssistCue, assistActorActive, assistTargetActive);",
  );
  next = next.replace(
    /var rootMotionCue = this\.resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue\);\s*var actorPosition/g,
    'var actorPosition',
  );
  next = next.replace(
    "var combatHomePosition = this.resolveActorConvergedCombatPosition(slot, enemy, scale);\n          this.battleActorHomePositions.set(unit.unitKey, new Vec3(combatHomePosition.x, combatHomePosition.y, 0));\n          var actorPosition",
    "var combatHomePosition = this.resolveActorConvergedCombatPosition(slot, enemy, scale);\n          this.battleActorHomePositions.set(unit.unitKey, new Vec3(combatHomePosition.x, combatHomePosition.y, 0));\n          var rootMotionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);\n          var actorPosition",
  );

  next = next.replace(
    /resolveBattleActorFramePosition\(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors\) \{[\s\S]*?\n        resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue\) \{/,
    `resolveBattleActorFramePosition(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors) {
          var home = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
          var homePosition = new Vec3(home.x, home.y, 0);

          if (openingConvergence.active || presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded') {
            var base = this.resolveActorCombatBasePosition(slot, enemy, openingConvergence, presentation, scale);
            return new Vec3(base.x, base.y, 0);
          }

          var motionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);

          if (!motionCue) {
            return homePosition;
          }

          var actionOffset = this.resolveActorActionOffset(unit, enemy, slot, motionCue, presentation, actionAnchors, scale);
          var targetPosition = new Vec3(home.x + actionOffset.x, home.y + actionOffset.y, 0);
          return this.resolveBattleActorRootMotionPosition(homePosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio);
        }

        resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue) {`,
  );

  next = next.replace(
    /resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue\) \{[\s\S]*?\n        resolveBattleActorRootMotionPosition\(homePosition, targetPosition, cue, playbackTimelineTimeMs, timelineToPresentationRatio\) \{/,
    `resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue) {
          var _active$;

          var returnWindowMs = BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS + BATTLE_ACTOR_ATTACK_RETURN_MS;
          var active = actionCues.filter(cue => {
            var actorMotion = cue.actorKey === unit.unitKey && (cue.kind === 'melee_move' || cue.kind === 'ranged_projectile');
            var targetMeetMotion = false;
            if (!actorMotion && !targetMeetMotion) {
              return false;
            }
            var visualWindowMs = cue.durationMs + returnWindowMs;
            var timelineWindowMs = visualWindowMs / Math.max(0.08, timelineToPresentationRatio);
            return cue.timeMs <= playbackTimelineTimeMs + 28 && playbackTimelineTimeMs <= cue.timeMs + timelineWindowMs;
          }).filter(cue => {
            if (!currentActionCue) {
              return true;
            }
            var sameActionDuel = cue.actorKey === currentActionCue.actorKey && cue.targetKey === currentActionCue.targetKey;
            var reversedHitDuel = currentActionCue.kind === 'hit_float' && cue.actorKey === currentActionCue.targetKey && cue.targetKey === currentActionCue.actorKey;
            return (sameActionDuel || reversedHitDuel) && Math.abs(cue.timeMs - currentActionCue.timeMs) <= 2300;
          }).sort((a, b) => b.timeMs - a.timeMs || resolveBattleActorRootMotionPriority(b.kind) - resolveBattleActorRootMotionPriority(a.kind));
          return (_active$ = active[0]) != null ? _active$ : null;
        }

        resolveBattleActorRootMotionPosition(homePosition, targetPosition, cue, playbackTimelineTimeMs, timelineToPresentationRatio) {`,
  );

  next = next.replace(
    /resolveBattleActorRootMotionPosition\(homePosition, targetPosition, cue, playbackTimelineTimeMs, timelineToPresentationRatio\) \{[\s\S]*?\n        setBattleActorFramePosition\(actor, position\) \{/,
    `resolveBattleActorRootMotionPosition(homePosition, targetPosition, cue, playbackTimelineTimeMs, timelineToPresentationRatio) {
          var visualElapsedMs = (playbackTimelineTimeMs - cue.timeMs) * Math.max(0.82, timelineToPresentationRatio);
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
            var _approachMs = Math.min(BATTLE_ACTOR_MELEE_APPROACH_MS, Math.max(320, cue.durationMs * 0.38));
            if (elapsedMs <= _approachMs) {
              return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / _approachMs));
            }
            return targetPosition;
          }

          if (cue.kind === 'basic_attack') {
            var strikeHoldMs = Math.max(BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS, cue.durationMs * 2.18);
            if (elapsedMs <= strikeHoldMs) {
              return targetPosition;
            }
            var returnStartMs = strikeHoldMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS;
            if (elapsedMs <= returnStartMs) {
              return targetPosition;
            }
            var _returnProgress = clamp((elapsedMs - returnStartMs) / BATTLE_ACTOR_ATTACK_RETURN_MS, 0, 1);
            return lerpVec3(targetPosition, homePosition, easeBattleActorMotionProgress(_returnProgress));
          }

          return homePosition;
        }

        resolveBattleActorBasicAttackApproachMs(cue) {
          return Math.min(BATTLE_ACTOR_BASIC_ATTACK_APPROACH_MS, Math.max(320, cue.durationMs * 0.38));
        }

        isBattleActorCueApproaching(cue, playbackTimelineTimeMs, timelineToPresentationRatio) {
          var visualElapsedMs = (playbackTimelineTimeMs - cue.timeMs) * Math.max(0.82, timelineToPresentationRatio);
          if (cue.kind === 'melee_move') {
            var approachMs = Math.min(BATTLE_ACTOR_MELEE_APPROACH_MS, Math.max(320, cue.durationMs * 0.38));
            return visualElapsedMs <= approachMs;
          }
          if (cue.kind === 'basic_attack') {
            return false;
          }
          return false;
        }

        setBattleActorFramePosition(actor, position) {`,
  );

  next = next.replace(
    /resolveOpeningConvergenceOffset\(slot, enemy, progress, scale\) \{[\s\S]*?\n        resolveActorActionOffset\(unit, enemy, slot, currentActionCue, presentation, anchors, scale\) \{/,
    `resolveOpeningConvergenceOffset(slot, enemy, progress, scale) {
          var _BATTLE_OPENING_LANE_;

          var sideDirection = enemy ? 1 : -1;
          var laneRatio = (_BATTLE_OPENING_LANE_ = BATTLE_OPENING_LANE_ENTRY_RATIOS[slot.lane]) != null ? _BATTLE_OPENING_LANE_ : BATTLE_OPENING_ENTRY_DISTANCE_RATIO;
          var entryDistance = clamp(slot.width * laneRatio, slot.width * BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO, slot.width * BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO);
          var remaining = 1 - clamp(progress, 0, 1);
          var laneLift = slot.y > 0 ? 8 * scale : slot.y < 0 ? -8 * scale : 0;
          return {
            x: sideDirection * entryDistance * remaining,
            y: laneLift * remaining
          };
        }

        resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation, anchors, scale) {`,
  );
  next = next
    .replaceAll(
      `var targetMeetOffset = this.resolveActorTargetMeetOffset(currentActionCue, slot, anchors, scale);
            if (targetMeetOffset) {
              return targetMeetOffset;
            }`,
      `var contactPosition = this.resolveActorMeleeContactPosition(currentActionCue, anchors, scale);
            var source = anchors.get(currentActionCue.actorKey);
            if (contactPosition && source) {
              return {
                x: contactPosition.x - source.x,
                y: contactPosition.y - source.y
              };
            }`,
    )
    .replaceAll('resolveActorTargetMeetOffset(currentActionCue, slot, anchors, scale)', 'resolveActorMeleeContactPosition(currentActionCue, anchors, scale)')
    .replaceAll('resolveActorTargetMeetOffset(currentActionCue, slot, anchors, scale) {', 'resolveActorMeleeContactPosition(currentActionCue, anchors, scale) {')
    .replaceAll(
      'var contactGap = Math.max(source.width * 0.18, target.width * 0.14, 32 * scale);',
      `var roleGapBoost = currentActionCue.actorRole === 'boss' || currentActionCue.targetRole === 'boss' ? 1.28 : 1;
          var contactGap = clamp(Math.max(source.width, target.width) * BATTLE_MELEE_CONTACT_GAP_RATIO * roleGapBoost, 24 * scale, 56 * scale);`,
    )
    .replaceAll('return { x: contactX - source.x, y: contactY - source.y };', 'return { x: contactX, y: contactY };')
    .replaceAll('var meetDistance = clamp(Math.max(source.width * 0.12, target.width * 0.08), 26 * scale, 58 * scale);', 'var meetDistance = clamp(Math.abs(source.x - target.x) * BATTLE_MELEE_DEFENDER_STEP_RATIO, 18 * scale, 44 * scale);');

  next = next.replace(
    /resolveActionAnimationName\(unit, currentActionCue, rootMotionCue, actorActive, targetActive, playbackTimelineTimeMs, timelineToPresentationRatio\) \{[\s\S]*?\n        resolveBattleSpineCuePlaybackKey\(cueKey, animationName\) \{/,
    `resolveActionAnimationName(unit, currentActionCue, rootMotionCue, actorActive, targetActive, playbackTimelineTimeMs, timelineToPresentationRatio) {
          if (rootMotionCue && rootMotionCue.actorKey === unit.unitKey) {
            if (rootMotionCue.kind === 'melee_move' && this.isBattleActorCueApproaching(rootMotionCue, playbackTimelineTimeMs, timelineToPresentationRatio)) {
              return 'run';
            }
            if (rootMotionCue.kind === 'melee_move') {
              if (currentActionCue && currentActionCue.actorKey === unit.unitKey && currentActionCue.kind !== 'melee_move') {
                return currentActionCue.animationName;
              }
              var rarity = ((unit.rarity || unit.scaleProfile || '') + '').trim().toUpperCase();
              return rarity === 'SR' || rarity === 'R' ? 'skill0' : 'atk';
            }
            return rootMotionCue.animationName;
          }
          if (rootMotionCue && rootMotionCue.targetKey === unit.unitKey && (rootMotionCue.kind === 'melee_move' || rootMotionCue.kind === 'basic_attack')) {
            if (this.isBattleActorCueApproaching(rootMotionCue, playbackTimelineTimeMs, timelineToPresentationRatio)) {
              return 'run';
            }
            if (currentActionCue && currentActionCue.targetKey === unit.unitKey && (currentActionCue.kind === 'damage_float' || currentActionCue.kind === 'hit_float')) {
              return 'hit';
            }
            return 'idle';
          }
          if (!currentActionCue) {
            return rootMotionCue && rootMotionCue.targetKey === unit.unitKey ? 'idle' : null;
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

        resolveAssistAnimationName(unit, currentAssistCue, actorActive, targetActive) {
          if (!currentAssistCue) {
            return null;
          }
          if (actorActive && currentAssistCue.sourceKey === unit.unitKey) {
            return currentAssistCue.animationName;
          }
          if (targetActive && currentAssistCue.targetKey === unit.unitKey) {
            if (currentAssistCue.kind === 'debuff_float') {
              return 'hit';
            }
            if (currentAssistCue.kind === 'heal_float') {
              return 'heal';
            }
            if (currentAssistCue.kind === 'shield_float') {
              return 'shield';
            }
            return 'skill_01';
          }
          return null;
        }

        resolveBattleSpineCuePlaybackKey(cueKey, animationName) {`,
  );

  next = next
    .replaceAll(
      'this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, rootMotionCue ?? currentActionCue);',
      'this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue, rootMotionCue);',
    )
    .replaceAll(
      'this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, rootMotionCue ?? currentActionCue); // Stage 13P：actor root 位置由同一条时间函数决定；全量重建和局部刷新不再算两套坐标。',
      'this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue, rootMotionCue); // Stage 13P：actor root 位置由同一条时间函数决定；全量重建和局部刷新不再算两套坐标。',
    );
  next = next.replace(
    /recordBattleActorFrameTelemetry\(unit, enemy, position, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue\) \{([\s\S]*?)telemetry\.samples\.push\(\{[\s\S]*?at: now\s*\}\);/,
    `recordBattleActorFrameTelemetry(unit, enemy, position, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue, rootMotionCue) {$1var telemetryCue = rootMotionCue != null ? rootMotionCue : currentActionCue;

          telemetry.samples.push({
            unitKey: unit.unitKey,
            side: enemy ? 'enemy' : 'ally',
            rarity: (unit.rarity || unit.scaleProfile || '').toUpperCase(),
            actionKind: telemetryCue ? telemetryCue.kind : null,
            actionActorKey: telemetryCue ? telemetryCue.actorKey : null,
            actionTargetKey: telemetryCue ? telemetryCue.targetKey : null,
            currentActionKind: currentActionCue ? currentActionCue.kind : null,
            rootMotionKind: rootMotionCue ? rootMotionCue.kind : null,
            rootMotionActorKey: rootMotionCue ? rootMotionCue.actorKey : null,
            rootMotionTargetKey: rootMotionCue ? rootMotionCue.targetKey : null,
            isActionActor: telemetryCue ? telemetryCue.actorKey === unit.unitKey : false,
            isActionTarget: telemetryCue ? telemetryCue.targetKey === unit.unitKey : false,
            x: Math.round(position.x * 100) / 100,
            y: Math.round(position.y * 100) / 100,
            openingActive: openingConvergence.active,
            openingMoving: openingConvergence.moving,
            openingElapsedMs: Math.round(openingConvergence.elapsedMs),
            playbackTimelineTimeMs: Math.round(playbackTimelineTimeMs),
            phase: presentation.phase,
            at: now
          });`,
  );
  next = next.replace(
    /if \(!telemetry\.background \|\| telemetry\.background\.loaded !== true\) \{\s*telemetry\.background = \{\s*source: 'asset',\s*loaded: true,\s*at: Date\.now\(\)\s*\};\s*\}\s*(var telemetryCue = rootMotionCue != null \? rootMotionCue : currentActionCue;)/g,
    '$1',
  );
  next = next.replace(
    /(resetBattlePlaybackRuntime\(sceneKey\) \{[\s\S]*?this\.battleFloatingTextLastAtByTarget\.clear\(\);\s*)(\})/,
    (match, prefix, suffix) => match.includes('resetBattlePlaybackTelemetry')
      ? match
      : `${prefix}this.resetBattlePlaybackTelemetry(sceneKey);
        ${suffix}

        resetBattlePlaybackTelemetry(sceneKey) {
          var previous = globalThis.__lootchainBattlePlaybackTelemetry;
          if (previous && previous.sceneKey === sceneKey) {
            if (!previous.background) {
              previous.background = {
                source: 'asset',
                loaded: false,
                at: Date.now()
              };
            }
            globalThis.__lootchainBattlePlaybackTelemetry = previous;
            return;
          }
          globalThis.__lootchainBattlePlaybackTelemetry = {
            sceneKey: sceneKey,
            samples: [],
            background: {
              source: 'asset',
              loaded: false,
              at: Date.now()
            }
          };
        }`,
  );
  next = next.replaceAll('loaded: true, // background-forced-by-preview-repair', 'loaded: true,');
  next = next.replace(
    /(resetBattlePlaybackRuntime\(sceneKey\) \{[\s\S]*?this\.battleTelemetryBuckets\s*=\s*new Set\(\);\s*)(\})/,
    (match, prefix, suffix) => match.includes('resetBattlePlaybackTelemetry')
      ? match
      : `${prefix}this.resetBattlePlaybackTelemetry(sceneKey);
        ${suffix}

        resetBattlePlaybackTelemetry(sceneKey) {
          globalThis.__lootchainBattlePlaybackTelemetry = {
            sceneKey: sceneKey,
            samples: [],
            background: {
              source: 'asset',
              loaded: false,
              at: Date.now()
            }
          };
        }`,
  );
  next = next.replace(
    /resetBattlePlaybackTelemetry\(sceneKey\) \{\s*globalThis\.__lootchainBattlePlaybackTelemetry = \{\s*sceneKey: sceneKey,\s*samples: \[\],\s*background: \{\s*source: 'asset',\s*loaded: false,\s*at: Date\.now\(\)\s*\}\s*\};\s*\}/,
    `resetBattlePlaybackTelemetry(sceneKey) {
          var previous = globalThis.__lootchainBattlePlaybackTelemetry;
          if (previous && previous.sceneKey === sceneKey) {
            if (!previous.background) {
              previous.background = {
                source: 'asset',
                loaded: false,
                at: Date.now()
              };
            }
            globalThis.__lootchainBattlePlaybackTelemetry = previous;
            return;
          }
          globalThis.__lootchainBattlePlaybackTelemetry = {
            sceneKey: sceneKey,
            samples: [],
            background: {
              source: 'asset',
              loaded: false,
              at: Date.now()
            }
          };
        }`,
  );

  return patchStage13YActorFrameSmoothing(normalizeStage13YMeleeTiming(patchActionCueRatioCalls(next)));
}

function patchState(text) {
  return text
    .replaceAll('LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 1;', 'LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 3;')
    .replaceAll('exports("LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT", LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 1);', 'exports("LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT", LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 3);')
    .replaceAll('_export("LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT", LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 1);', '_export("LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT", LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 3);');
}

function patchTimeline(text) {
  return text
    .replaceAll('roundStart + 1720', 'roundStart + 3900')
    .replaceAll('roundStart + 1980', 'roundStart + 4250')
    .replaceAll('roundStart + 2120', 'roundStart + 3900')
    .replaceAll('roundStart + 2420', 'roundStart + 4250')
    .replaceAll('roundStart + 3080', 'roundStart + 5400')
    .replaceAll('roundStart + 3360', 'roundStart + 5400')
    .replaceAll('roundStart + 3700', 'roundStart + 6050')
    .replaceAll('roundStart + 3980', 'roundStart + 6050')
    .replaceAll('roundStart + 1_720', 'roundStart + 3_900')
    .replaceAll('roundStart + 1_980', 'roundStart + 4_250')
    .replaceAll('roundStart + 2_120', 'roundStart + 3_900')
    .replaceAll('roundStart + 2_420', 'roundStart + 4_250')
    .replaceAll('roundStart + 3_080', 'roundStart + 5_400')
    .replaceAll('roundStart + 3_360', 'roundStart + 5_400')
    .replaceAll('roundStart + 3_700', 'roundStart + 6_050')
    .replaceAll('roundStart + 3_980', 'roundStart + 6_050');
}

function patchAction(text) {
  let next = text
    .replaceAll('melee_move: 620', 'melee_move: 1120')
    .replaceAll('melee_move: 1120', 'melee_move: 1520')
    .replaceAll('melee_move: 1520', 'melee_move: 1880')
    .replaceAll('melee_move: 1880', 'melee_move: 2480')
    .replaceAll('timeOffsetMs: 420', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 520', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 680', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 760', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 860', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 940', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 1040', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 1280', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 1440', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 1760', 'timeOffsetMs: 1420')
    .replaceAll('timeOffsetMs: 2280', 'timeOffsetMs: 1420')
    .replaceAll('basic_attack: 760', 'basic_attack: 1120')
    .replaceAll('basic_attack: 980', 'basic_attack: 1120')
    .replaceAll('damage_float: 820', 'damage_float: 560')
    .replaceAll('roundStart + 1720', 'roundStart + 3900')
    .replaceAll('roundStart + 1980', 'roundStart + 4250')
    .replaceAll('roundStart + 2120', 'roundStart + 3900')
    .replaceAll('roundStart + 2420', 'roundStart + 4250')
    .replaceAll('roundStart + 3080', 'roundStart + 5400')
    .replaceAll('roundStart + 3360', 'roundStart + 5400')
    .replaceAll('roundStart + 3700', 'roundStart + 6050')
    .replaceAll('roundStart + 3980', 'roundStart + 6050')
    .replaceAll('roundStart + 1_720', 'roundStart + 3_900')
    .replaceAll('roundStart + 1_980', 'roundStart + 4_250')
    .replaceAll('roundStart + 2_120', 'roundStart + 3_900')
    .replaceAll('roundStart + 2_420', 'roundStart + 4_250')
    .replaceAll('roundStart + 3_080', 'roundStart + 5_400')
    .replaceAll('roundStart + 3_360', 'roundStart + 5_400')
    .replaceAll('roundStart + 3_700', 'roundStart + 6_050')
    .replaceAll('roundStart + 3_980', 'roundStart + 6_050')
    .replaceAll('cue.timeMs <= timeMs + 80 && timeMs <= cue.timeMs + cue.durationMs + 180', 'cue.timeMs <= timeMs + 80 && timeMs <= cue.timeMs + resolveBattleActionCueVisibleWindowMs(cue)')
    .replaceAll('cue.timeMs <= currentEvent.timeMs + 80 && currentEvent.timeMs <= cue.timeMs + cue.durationMs + 180', 'cue.timeMs <= currentEvent.timeMs + 80 && currentEvent.timeMs <= cue.timeMs + resolveBattleActionCueVisibleWindowMs(cue)');
  next = next.replaceAll('_crd, ACTION_CUE_WINDOWS;', '_crd, ACTION_CUE_WINDOWS, ACTION_CUE_VISIBLE_PADDING_MS;');
  if (!next.includes('ACTION_CUE_VISIBLE_PADDING_MS = {')) {
    next = next.replace(
      /(ACTION_CUE_WINDOWS = \{[\s\S]*?hit_float: 560\s*\};)/,
      `$1
      ACTION_CUE_VISIBLE_PADDING_MS = {
        melee_move: 180,
        basic_attack: 220,
        ranged_projectile: 180,
        damage_float: 120,
        hit_float: 120
      };`,
    );
  }
  if (!next.includes('function resolveBattleActionCueVisibleWindowMs')) {
    next = next.replace(
      /function createActionCue\(/,
      `function resolveBattleActionCueVisibleWindowMs(cue) {
    return cue.durationMs + ACTION_CUE_VISIBLE_PADDING_MS[cue.kind];
  }

  function createActionCue(`,
    );
  }
  if (!next.includes("if (currentEvent.type === 'action_start')")) {
    next = next.replace(
      /if \(activeByTime\.length > 0\) \{\s*return activeByTime\[0\];\s*\}\s*\}/,
      `if (activeByTime.length > 0) {
        return activeByTime[0];
      }
      if (currentEvent.type === 'action_start') {
        return null;
      }
    }`,
    );
  }
  next = next.replace(
    /function resolveVisibleBattleActionPresentationCue\(cues, currentEvent, playbackTimelineTimeMs\) \{[\s\S]*?\n  function resolveBattleActionCueVisibleWindowMs\(cue\) \{/,
    `function resolveVisibleBattleActionPresentationCue(cues, currentEvent, playbackTimelineTimeMs, timelineToPresentationRatio = 1) {
    var _active$;

    if (!currentEvent || cues.length === 0) {
      return null;
    }

    var preferred = resolvePreferredCueKinds(currentEvent.type);
    var timeMs = typeof playbackTimelineTimeMs === 'number' && Number.isFinite(playbackTimelineTimeMs) ? playbackTimelineTimeMs : null;
    var presentationRatio = Math.max(0.08, Math.min(1, timelineToPresentationRatio));
    var resolveTimelineWindowMs = cue => resolveBattleActionCueVisibleWindowMs(cue) / presentationRatio;
    var leadWindowMs = Math.max(80, 80 / presentationRatio);

    if (timeMs !== null) {
      var activeByTime = cues.filter(cue => cue.timeMs <= timeMs + leadWindowMs && timeMs <= cue.timeMs + resolveTimelineWindowMs(cue)).sort((a, b) => {
        var aStarted = a.timeMs <= timeMs;
        var bStarted = b.timeMs <= timeMs;
        if (aStarted !== bStarted) {
          return aStarted ? -1 : 1;
        }
        var recencyDelta = b.timeMs - a.timeMs;
        var preferredDelta = preferred.indexOf(a.kind) - preferred.indexOf(b.kind);
        var distanceDelta = Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs);
        return recencyDelta || preferredDelta || distanceDelta || a.eventSeq - b.eventSeq;
      });
      if (activeByTime.length > 0) {
        return activeByTime[0];
      }
      if (currentEvent.type === 'action_start') {
        return null;
      }
    }

    var sameEvent = cues.filter(cue => cue.eventSeq === currentEvent.seq).sort((a, b) => preferred.indexOf(a.kind) - preferred.indexOf(b.kind) || a.timeMs - b.timeMs);
    if (sameEvent.length > 0) {
      return sameEvent[0];
    }

    var active = cues.filter(cue => cue.timeMs <= currentEvent.timeMs + leadWindowMs && currentEvent.timeMs <= cue.timeMs + resolveTimelineWindowMs(cue)).sort((a, b) => Math.abs(a.timeMs - currentEvent.timeMs) - Math.abs(b.timeMs - currentEvent.timeMs));
    return (_active$ = active[0]) != null ? _active$ : null;
  }

  function resolveBattleActionCueVisibleWindowMs(cue) {`,
  );
  next = next.replace(
    /var preferredDelta = preferred\.indexOf\(a\.kind\) - preferred\.indexOf\(b\.kind\);\s*var distanceDelta = Math\.abs\(a\.timeMs - timeMs\) - Math\.abs\(b\.timeMs - timeMs\);\s*return distanceDelta \|\| preferredDelta \|\| b\.timeMs - a\.timeMs \|\| a\.eventSeq - b\.eventSeq;/g,
    `var aStarted = a.timeMs <= timeMs;
        var bStarted = b.timeMs <= timeMs;
        if (aStarted !== bStarted) {
          return aStarted ? -1 : 1;
        }
        var recencyDelta = b.timeMs - a.timeMs;
        var preferredDelta = preferred.indexOf(a.kind) - preferred.indexOf(b.kind);
        var distanceDelta = Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs);
        return recencyDelta || preferredDelta || distanceDelta || a.eventSeq - b.eventSeq;`,
  );
  next = patchStage13YActorFrameSmoothing(next);
  return dedupeStage13PreviewConstants(next);
}

function patchStage13YActorFrameSmoothing(text) {
  let next = text;
  next = next.replace(
    /var actorPosition = this\.resolveBattleActorFramePosition\(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors\);\n          this\.recordBattleActorFrameTelemetry\(unit, enemy, actorPosition,/g,
    `var desiredPosition = this.resolveBattleActorFramePosition(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors);
          var actorPosition = this.resolveBattleActorDisplayedFramePosition(unit.unitKey, desiredPosition, openingConvergence, presentation, rootMotionCue, scale, true);
          this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition,`,
  );
  next = next.replace(
    /if \(actorActive && \(currentActionCue == null \? void 0 : currentActionCue\.kind\) === 'melee_move'\) \{[\s\S]*?\n          \}\n\n          var assistAnimationName =/,
    `var assistAnimationName =`,
  );
  if (!/\n\s*resolveBattleActorDisplayedFramePosition\(unitKey, desiredPosition/.test(next)) {
    next = next.replace(
      /\n(\s*)setBattleActorFramePosition\(actor, position\) \{/,
      `
$1resolveBattleActorDisplayedFramePosition(unitKey, desiredPosition, openingConvergence, presentation, rootMotionCue, scale, commit) {
          var previous = this.battleActorFramePositions.get(unitKey);
          var shouldLimit = !!previous && !openingConvergence.active && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded');
          if (!shouldLimit) {
            var _nextPosition = new Vec3(desiredPosition.x, desiredPosition.y, 0);
            if (commit) {
              this.battleActorFramePositions.set(unitKey, _nextPosition);
            }
            return _nextPosition;
          }
          var dx = desiredPosition.x - previous.x;
          var dy = desiredPosition.y - previous.y;
          var distance = Math.hypot(dx, dy);
          var maxDelta = rootMotionCue ? Math.max(196 * scale, BATTLE_ACTOR_FRAME_MAX_DELTA * 2.25 * scale) : Math.max(76 * scale, BATTLE_ACTOR_FRAME_MAX_DELTA * 0.58 * scale);
          if (distance <= maxDelta || distance <= BATTLE_ACTOR_POSITION_EPSILON) {
            var _nextPosition2 = new Vec3(desiredPosition.x, desiredPosition.y, 0);
            if (commit) {
              this.battleActorFramePositions.set(unitKey, _nextPosition2);
            }
            return _nextPosition2;
          }
          var ratio = maxDelta / Math.max(1, distance);
          var nextPosition = new Vec3(previous.x + dx * ratio, previous.y + dy * ratio, 0);
          if (commit) {
            this.battleActorFramePositions.set(unitKey, nextPosition);
          }
          return nextPosition;
        }

$1setBattleActorFramePosition(actor, position) {`,
    );
  }
  next = next
    .replace(
      /var actorMotion = cue\.actorKey === unit\.unitKey && \(cue\.kind === 'melee_move' \|\| cue\.kind === 'basic_attack' \|\| cue\.kind === 'ranged_projectile'\);/g,
      "var actorMotion = cue.actorKey === unit.unitKey && (cue.kind === 'melee_move' || cue.kind === 'ranged_projectile');",
    )
    .replace(
      /var targetMeetMotion = cue\.targetKey === unit\.unitKey && \(cue\.kind === 'melee_move' \|\| cue\.kind === 'basic_attack'\);/g,
      'var targetMeetMotion = false;',
    )
    .replace(
      /currentActionCue\.kind === 'melee_move' \|\| currentActionCue\.kind === 'basic_attack' \|\| currentActionCue\.kind === 'ranged_projectile'/g,
      "currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'ranged_projectile'",
    )
    .replace(
      /if \(motionCue\.actorKey === unit\.unitKey && \(motionCue\.kind === 'melee_move' \|\| motionCue\.kind === 'basic_attack'\) && Math\.hypot\(actorPosition\.x - targetPosition\.x, actorPosition\.y - targetPosition\.y\) <= 2 \* scale\)/g,
      "if (motionCue.actorKey === unit.unitKey && motionCue.kind === 'melee_move' && Math.hypot(actorPosition.x - targetPosition.x, actorPosition.y - targetPosition.y) <= 2 * scale)",
    )
    .replace(
      /if \(cue\.kind === 'basic_attack'\) \{\s*var strikeHoldMs = Math\.max\(BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS, cue\.durationMs \* 2\.18\);[\s\S]*?return lerpVec3\(targetPosition, homePosition, easeBattleActorMotionProgress\(_returnProgress\)\);\s*\}/g,
      `if (cue.kind === 'basic_attack') {
            var _approachMs2 = this.resolveBattleActorBasicAttackApproachMs(cue);
            if (elapsedMs <= _approachMs2) {
              return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / _approachMs2));
            }
            return targetPosition;
          }`,
    )
    .replace(
      /if \(cue\.kind === 'basic_attack'\) \{\s*return visualElapsedMs <= this\.resolveBattleActorBasicAttackApproachMs\(cue\);\s*\}/g,
      `if (cue.kind === 'basic_attack') {
            return false;
          }`,
    )
    .replace(
      /var homePosition = stickyContactPosition \? new Vec3\(stickyContactPosition\.x, stickyContactPosition\.y, 0\) : baseHomePosition;/g,
      `var homePosition = stickyContactPosition ? new Vec3(stickyContactPosition.x, stickyContactPosition.y, 0) : baseHomePosition;
          var baseMotionHomePosition = baseHomePosition;`,
    )
    .replace(
      /var targetPosition = new Vec3\(home\.x \+ actionOffset\.x, home\.y \+ actionOffset\.y, 0\);\s*var actorPosition = this\.resolveBattleActorRootMotionPosition\(homePosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio\);/g,
      `var motionHomePosition = motionCue.kind === 'melee_move' ? homePosition : baseMotionHomePosition;
          var targetPosition = new Vec3(baseMotionHomePosition.x + actionOffset.x, baseMotionHomePosition.y + actionOffset.y, 0);
          var actorPosition = this.resolveBattleActorRootMotionPosition(motionHomePosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio);`,
    )
    .replace(
      /var home = this\.resolveActorConvergedCombatPosition\(slot, enemy, scale\);\s*var homePosition = new Vec3\(home\.x, home\.y, 0\);\s*([\s\S]*?)var actionOffset = this\.resolveActorActionOffset\(unit, enemy, slot, motionCue, presentation, actionAnchors, scale\);\s*var targetPosition = new Vec3\(home\.x \+ actionOffset\.x, home\.y \+ actionOffset\.y, 0\);\s*return this\.resolveBattleActorRootMotionPosition\(homePosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio\);/g,
      `var home = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
          var baseHomePosition = new Vec3(home.x, home.y, 0);
          var stickyContactPosition = this.battleActorStickyCombatPositions.get(unit.unitKey);
          var homePosition = stickyContactPosition ? new Vec3(stickyContactPosition.x, stickyContactPosition.y, 0) : baseHomePosition;
          var baseMotionHomePosition = baseHomePosition;

          $1var actionOffset = this.resolveActorActionOffset(unit, enemy, slot, motionCue, presentation, actionAnchors, scale);
          var motionHomePosition = motionCue.kind === 'melee_move' ? homePosition : baseMotionHomePosition;
          var targetPosition = new Vec3(baseMotionHomePosition.x + actionOffset.x, baseMotionHomePosition.y + actionOffset.y, 0);
          var actorPosition = this.resolveBattleActorRootMotionPosition(motionHomePosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio);

          if (motionCue.actorKey === unit.unitKey && motionCue.kind === 'melee_move' && Math.hypot(actorPosition.x - targetPosition.x, actorPosition.y - targetPosition.y) <= 2 * scale) {
            this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(targetPosition.x, targetPosition.y, 0));
          }

          return actorPosition;`,
    );
  next = next.replace(
    /var seed = "" \+ currentActionCue\.actorKey \+ "\|" \+ currentActionCue\.targetKey \+ "\|" \+ currentActionCue\.eventSeq;([\s\S]*?)return \(hash % 5 - 2\) \* 7 \* scale;/g,
    `var seed = "" + currentActionCue.actorKey + "|" + currentActionCue.targetKey;$1return (hash % 7 - 3) * 34 * scale;`,
  );
  next = next.replace(
    /var seed = `\$\{currentActionCue\.actorKey\}\|\$\{currentActionCue\.targetKey\}\|\$\{currentActionCue\.eventSeq\}`;([\s\S]*?)return \(\(hash % 5\) - 2\) \* 7 \* scale;/g,
    'var seed = `${currentActionCue.actorKey}|${currentActionCue.targetKey}`;$1return ((hash % 7) - 3) * 34 * scale;',
  );
  next = next.replace(
    /return \(hash % 7 - 3\) \* 34 \* scale;/g,
    `var _actorNumberMatch = currentActionCue.actorKey.match(/\\d+$/);
          var numericActor = Number(_actorNumberMatch == null ? void 0 : _actorNumberMatch[0]);
          var laneSeed = Number.isFinite(numericActor) ? numericActor : hash;
          return (laneSeed % 5 - 2) * 96 * scale;`,
  );
  next = next.replace(
    /return \(\(hash % 7\) - 3\) \* 34 \* scale;/g,
    `const numericActor = Number(currentActionCue.actorKey.match(/\\d+$/)?.[0]);
    const laneSeed = Number.isFinite(numericActor) ? numericActor : hash;
    return ((laneSeed % 5) - 2) * 96 * scale;`,
  );
  next = next.replace(
    /return \(laneSeed % 5 - 2\) \* 76 \* scale;/g,
    'return (laneSeed % 5 - 2) * 96 * scale;',
  );
  next = next.replace(
    /return \(\(laneSeed % 5\) - 2\) \* 76 \* scale;/g,
    'return ((laneSeed % 5) - 2) * 96 * scale;',
  );
  next = next.replace(
    /var targetX = enemy \? Math\.max\(rawTargetX, minGap\) : Math\.min\(rawTargetX, -minGap\);\s*return \{ x: eased \* \(targetX - converged\.x\), y: 0, progress: progress \};/g,
    `var targetX = enemy ? Math.max(rawTargetX, minGap) : Math.min(rawTargetX, -minGap);
          var targetY = this.resolveBattleActorChargeLaneYOffset(unit, scale);
          return { x: eased * (targetX - converged.x), y: eased * targetY, progress: progress };`,
  );
  if (!next.includes('resolveBattleActorChargeLaneYOffset(unit, scale)')) {
    next = next.replace(
      /(\n\s*)resolveBattleActorClashIdleOffset\(unit, enemy, slot, scale, presentation, openingConvergence, chargeProgress\) \{/,
      `
$1resolveBattleActorChargeLaneYOffset(unit, scale) {
          var laneIndex = Math.max(0, Math.min(4, unit.slot));
          var offsets = [72, -8, -92, 136, -154];
          var roleOffset = unit.role === 'boss' ? 28 : 0;
          return ((offsets[laneIndex] || 0) + roleOffset) * scale;
        }

$1resolveBattleActorClashIdleOffset(unit, enemy, slot, scale, presentation, openingConvergence, chargeProgress) {`,
    );
  }
  return next;
}

function patchActionCueRatioCalls(text) {
  return text
    .replace(
      /(var actionCues = \(_crd && resolveBattleActionPresentationCues[\s\S]*?\)\(timeline, snapshot\);\n)(\s*var currentActionCue)/g,
      '$1          var timelineToPresentationRatio = this.resolveBattleTimelineToPresentationRatio(timeline);\n$2',
    )
    .replace(
      /var currentActionCue = openingConvergence\.active \? null : \(_crd && resolveVisibleBattleActionPresentationCue[\s\S]*?\), playbackTimelineTimeMs\);/g,
      (match) => match.includes('timelineToPresentationRatio') ? match : match.replace('), playbackTimelineTimeMs);', '), playbackTimelineTimeMs, timelineToPresentationRatio);'),
    )
    .replaceAll(')(actionCues, currentTimelineEvent, playbackTimelineTimeMs);', ')(actionCues, currentTimelineEvent, playbackTimelineTimeMs, timelineToPresentationRatio);')
    .replaceAll('resolveVisibleBattleActionPresentationCue(actionCues, currentTimelineEvent, playbackTimelineTimeMs)', 'resolveVisibleBattleActionPresentationCue(actionCues, currentTimelineEvent, playbackTimelineTimeMs, timelineToPresentationRatio)');
}

function patchRuntime(text) {
  let next = text
    .replaceAll('maxScale: 1.08', 'maxScale: 1.58')
    .replaceAll('maxScale: 0.94', 'maxScale: 1.36')
    .replaceAll('targetHeightRatio: 1.42, maxWidthRatio: 3.08, minScale: 0.046, maxScale: 1.58, fallbackRawHeight: 620, scaleMultiplier: 2.72', 'targetHeightRatio: 1.72, maxWidthRatio: 3.45, minScale: 0.052, maxScale: 2.08, fallbackRawHeight: 620, scaleMultiplier: 3.32')
    .replaceAll('targetHeightRatio: 1.42, maxWidthRatio: 3.08, minScale: 0.046, maxScale: 1.58, fallbackRawHeight: 660, scaleMultiplier: 2.72', 'targetHeightRatio: 1.72, maxWidthRatio: 3.45, minScale: 0.052, maxScale: 2.08, fallbackRawHeight: 660, scaleMultiplier: 3.32')
    .replaceAll('targetHeightRatio: 1.54, maxWidthRatio: 3.22, minScale: 0.046, maxScale: 1.76, fallbackRawHeight: 620, scaleMultiplier: 2.94', 'targetHeightRatio: 1.72, maxWidthRatio: 3.45, minScale: 0.052, maxScale: 2.08, fallbackRawHeight: 620, scaleMultiplier: 3.32')
    .replaceAll('targetHeightRatio: 1.54, maxWidthRatio: 3.22, minScale: 0.046, maxScale: 1.76, fallbackRawHeight: 660, scaleMultiplier: 2.94', 'targetHeightRatio: 1.72, maxWidthRatio: 3.45, minScale: 0.052, maxScale: 2.08, fallbackRawHeight: 660, scaleMultiplier: 3.32')
    .replaceAll('FORMATION_PREVIEW: { targetHeightRatio: 1.28, maxWidthRatio: 2.88, minScale: 0.04, maxScale: 1.36, fallbackRawHeight: 720, scaleMultiplier: 1.52 }', 'FORMATION_PREVIEW: { targetHeightRatio: 1.62, maxWidthRatio: 3.42, minScale: 0.046, maxScale: 1.84, fallbackRawHeight: 720, scaleMultiplier: 2.22 }')
    .replace(
      /FORMATION_PREVIEW: \{\s*targetHeightRatio: 1\.08,\s*maxWidthRatio: 2\.18,\s*minScale: 0\.04,\s*maxScale: 0\.5,\s*fallbackRawHeight: 840,\s*scaleMultiplier: 1\.22\s*\}/,
      `FORMATION_PREVIEW: {
          targetHeightRatio: 1.62,
          maxWidthRatio: 3.42,
          minScale: 0.046,
          maxScale: 1.84,
          fallbackRawHeight: 720,
          scaleMultiplier: 2.22
        }`,
    )
    .replaceAll('scaleMultiplier: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.scaleMultiplier, 1.46)', 'maxScale: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.maxScale, (rarityProfile == null ? void 0 : rarityProfile.maxScale) || 0), scaleMultiplier: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.scaleMultiplier, 2.08)')
    .replaceAll('scaleMultiplier: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.scaleMultiplier, 1.86)', 'scaleMultiplier: Math.max(BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY.FORMATION_PREVIEW.scaleMultiplier, 2.08)');
  next = next.replace(
    /function resolveBattleUnitSpineScale\(rawWidth, rawHeight, slotWidth, slotHeight, uiScale, boss, unit\) \{[\s\S]*?\n  \}/,
    `function resolveBattleUnitSpineScale(rawWidth, rawHeight, slotWidth, slotHeight, uiScale, boss, unit) {
    var profile = resolveBattleUnitSpineVisualProfile(unit, boss);
    var effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(rawWidth, rawHeight, profile, unit);
    var safeWidth = effectiveRawSize.width;
    var safeHeight = effectiveRawSize.height;
    var targetHeight = slotHeight * profile.targetHeightRatio;
    var maxWidth = slotWidth * profile.maxWidthRatio;
    var fit = Math.min(targetHeight / safeHeight, maxWidth / safeWidth) * profile.scaleMultiplier;
    var baseScale = clamp(fit, profile.minScale * uiScale, profile.maxScale * uiScale);
    var tier = unit ? resolveBattleUnitSpineRarityTier(unit) : 'DEFAULT';
    if ((unit == null ? void 0 : unit.scaleProfile) === 'FORMATION_PREVIEW') {
      var maxVisualHeight = slotHeight * resolveBattleUnitFormationPreviewMaxHeightRatio(unit, tier);
      return Math.min(baseScale, maxVisualHeight / safeHeight);
    }
    if (tier === 'SR' || tier === 'R') {
      var maxVisualHeight = slotHeight * 0.84;
      return Math.min(baseScale, maxVisualHeight / safeHeight);
    }
    return baseScale;
  }`,
  );
  if (!next.includes('function resolveBattleUnitSpineTelemetryVisualHeight(')) {
    next = next.replace(
      /\n  function resolveBattleUnitSpineMirrorScaleX\(/,
      `
  function resolveBattleUnitSpineTelemetryVisualHeight(rawWidth, rawHeight, resolvedScale, unit, boss) {
    var profile = resolveBattleUnitSpineVisualProfile(unit, boss);
    var effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(rawWidth, rawHeight, profile, unit);
    return effectiveRawSize.height * resolvedScale;
  }

  function resolveBattleUnitSpineMirrorScaleX(`,
    );
  }
  if (
    !next.includes('function resolveBattleUnitSpineNodePosition(')
    || !next.includes('function resolveBattleUnitSpineTelemetryVisualHeight(')
    || !next.includes('function resolveBattleUnitSpineMirrorScaleX(')
  ) {
    next = next.replace(
      /\n  function normalizeRawSpineOffset\(/,
      `
  function resolveBattleUnitSpineNodePosition(runtimeData, resolvedScale, slotHeight, unit, enemy) {
    var profile = resolveBattleUnitSpineVisualProfile(unit, unit.role === 'boss');
    var rawWidth = normalizeRawSpineSize(runtimeData.width, profile.fallbackRawHeight * 0.62);
    var rawHeight = normalizeRawSpineSize(runtimeData.height, profile.fallbackRawHeight);
    var effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(runtimeData.width, runtimeData.height, profile, unit);
    var inflated = isBattleUnitSpineEffectInflatedActBounds(rawWidth, rawHeight, profile, unit);
    var rawX = inflated ? -effectiveRawSize.width / 2 : normalizeRawSpineOffset(runtimeData.x, -effectiveRawSize.width / 2);
    var rawY = inflated ? 0 : normalizeRawSpineOffset(runtimeData.y, 0);
    var centerX = rawX + effectiveRawSize.width / 2;
    var targetFootY = -slotHeight * 0.42;
    return {
      x: (enemy ? 1 : -1) * centerX * resolvedScale,
      y: targetFootY - rawY * resolvedScale
    };
  }

  function resolveBattleUnitSpineTelemetryVisualHeight(rawWidth, rawHeight, resolvedScale, unit, boss) {
    var profile = resolveBattleUnitSpineVisualProfile(unit, boss);
    var effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(rawWidth, rawHeight, profile, unit);
    return effectiveRawSize.height * resolvedScale;
  }

  function resolveBattleUnitSpineMirrorScaleX(spineScale, enemy) {
    return enemy ? -spineScale : spineScale;
  }

  function normalizeRawSpineOffset(`,
    );
  }
  next = next
    .replace(/R:\s*\{\s*targetHeightRatio:\s*1\.\d+,\s*maxWidthRatio:\s*[23]\.\d+,\s*minScale:\s*0\.\d+,\s*maxScale:\s*[0-9.]+,\s*fallbackRawHeight:\s*620,\s*scaleMultiplier:\s*[0-9.]+\s*\}/g, 'R: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18, fallbackRawHeight: 620, scaleMultiplier: 2.18 }')
    .replace(/SR:\s*\{\s*targetHeightRatio:\s*1\.\d+,\s*maxWidthRatio:\s*[23]\.\d+,\s*minScale:\s*0\.\d+,\s*maxScale:\s*[0-9.]+,\s*fallbackRawHeight:\s*660,\s*scaleMultiplier:\s*[0-9.]+\s*\}/g, 'SR: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18, fallbackRawHeight: 660, scaleMultiplier: 2.18 }')
    .replace(/FORMATION_PREVIEW:\s*\{\s*targetHeightRatio:\s*1\.\d+,\s*maxWidthRatio:\s*3\.\d+,\s*minScale:\s*0\.0\d+,\s*maxScale:\s*[0-9.]+,\s*fallbackRawHeight:\s*720,\s*scaleMultiplier:\s*[0-9.]+\s*\}/g, 'FORMATION_PREVIEW: { targetHeightRatio: 1.42, maxWidthRatio: 3.35, minScale: 0.058, maxScale: 2.72, fallbackRawHeight: 720, scaleMultiplier: 2.62 }')
    .replace(/BATTLE_STAGE12_NAMED_SPINE_PROFILE = \{\s*targetHeightRatio:\s*[0-9.]+,\s*maxWidthRatio:\s*[0-9.]+,\s*minScale:\s*0\.\d+,\s*maxScale:\s*[0-9.]+,\s*fallbackRawHeight:\s*1180,\s*scaleMultiplier:\s*[0-9.]+\s*\};/g, 'BATTLE_STAGE12_NAMED_SPINE_PROFILE = { targetHeightRatio: 0.82, maxWidthRatio: 2.05, minScale: 0.034, maxScale: 0.32, fallbackRawHeight: 1180, scaleMultiplier: 0.94 };')
    .replace(/var maxVisualHeight = slotHeight \* 1\.\d+;/g, 'var maxVisualHeight = slotHeight * 0.84;')
    .replace(/const maxVisualHeight = slotHeight \* 1\.\d+;/g, 'const maxVisualHeight = slotHeight * 0.84;')
    .replaceAll('Eulenspigel: 0.82', 'Eulenspigel: 0.272')
    .replaceAll('Eulenspigel: 0.68', 'Eulenspigel: 0.272')
    .replaceAll('Eulenspigel: 0.56', 'Eulenspigel: 0.272')
    .replaceAll('Eulenspigel: 0.55', 'Eulenspigel: 0.272')
    .replaceAll('Eulenspigel: 0.52', 'Eulenspigel: 0.272')
    .replaceAll('Eulenspigel: 0.43', 'Eulenspigel: 0.272')
    .replaceAll('Eulenspigel: 0.39', 'Eulenspigel: 0.272')
    .replaceAll('Eulenspigel: 0.34', 'Eulenspigel: 0.272')
    .replaceAll('Nuu: 0.82', 'Nuu: 0.43')
    .replaceAll('Nuu: 0.68', 'Nuu: 0.43')
    .replaceAll('Nuu: 0.58', 'Nuu: 0.43')
    .replaceAll('Nuu: 0.56', 'Nuu: 0.43')
    .replaceAll('Nuu: 0.52', 'Nuu: 0.43')
    .replace(/BATTLE_STAGE12_FORMATION_PREVIEW_HEIGHT_RATIO_BY_ASSET = \{[\s\S]*?\};/g, `BATTLE_STAGE12_FORMATION_PREVIEW_HEIGHT_RATIO_BY_ASSET = {
        act_1028: 1.32,
        Eulenspigel: 0.272,
        Ishmael: 0.528,
        Nuu: 0.43
      };`)
    .replace(/BATTLE_FORMATION_DEFAULT_MAX_HEIGHT_RATIO = [0-9.]+;/g, 'BATTLE_FORMATION_DEFAULT_MAX_HEIGHT_RATIO = 0.48;')
    .replace(/BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO = [0-9.]+;/g, 'BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO = 0.56;')
    .replace(/return tier === 'SR' \|\| tier === 'R' \? [0-9.]+ : primaryAsset === 'Eulenspigel' \? [0-9.]+ : primaryAsset === 'Nuu' \? [0-9.]+ : [0-9.]+;/g, "return primaryAsset === 'act_1028' ? 1.32 : primaryAsset === 'Eulenspigel' ? 0.272 : primaryAsset === 'Ishmael' ? 0.528 : primaryAsset === 'Nuu' ? 0.43 : tier === 'SR' || tier === 'R' ? 0.56 : 0.48;")
    .replace(/return tier === 'SR' \|\| tier === 'R' \? [0-9.]+ : primaryAsset === 'Eulenspigel' \? [0-9.]+ : [0-9.]+;/g, "return primaryAsset === 'act_1028' ? 1.32 : primaryAsset === 'Eulenspigel' ? 0.272 : primaryAsset === 'Ishmael' ? 0.528 : primaryAsset === 'Nuu' ? 0.43 : tier === 'SR' || tier === 'R' ? 0.56 : 0.48;")
    .replace(/return primaryAsset === 'Eulenspigel' \? [0-9.]+ : primaryAsset === 'Nuu' \? [0-9.]+ : tier === 'SR' \|\| tier === 'R' \? [0-9.]+ : [0-9.]+;/g, "return primaryAsset === 'act_1028' ? 1.32 : primaryAsset === 'Eulenspigel' ? 0.272 : primaryAsset === 'Ishmael' ? 0.528 : primaryAsset === 'Nuu' ? 0.43 : tier === 'SR' || tier === 'R' ? 0.56 : 0.48;")
    .replace(/return primaryAsset === 'act_1028' \? 1\.32 : primaryAsset === 'Eulenspigel' \? [0-9.]+ : primaryAsset === 'Nuu' \? [0-9.]+ : tier === 'SR' \|\| tier === 'R' \? [0-9.]+ : [0-9.]+;/g, "return primaryAsset === 'act_1028' ? 1.32 : primaryAsset === 'Eulenspigel' ? 0.272 : primaryAsset === 'Ishmael' ? 0.528 : primaryAsset === 'Nuu' ? 0.43 : tier === 'SR' || tier === 'R' ? 0.56 : 0.48;")
    .replace(
      /function resolveBattleUnitFormationPreviewMaxHeightRatio\(unit, tier\) \{[\s\S]*?return tier === 'SR' \|\| tier === 'R' \? BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO[\s\S]*?\n\s*\}/g,
      `function resolveBattleUnitFormationPreviewMaxHeightRatio(unit, tier) {
    var primaryAsset = resolveBattleUnitSpinePrimaryAsset(unit);
    return primaryAsset === 'act_1028' ? 1.32 : primaryAsset === 'Eulenspigel' ? 0.272 : primaryAsset === 'Ishmael' ? 0.528 : primaryAsset === 'Nuu' ? 0.43 : tier === 'SR' || tier === 'R' ? 0.56 : 0.48;
  }`,
    );
  if (!next.includes('function resolveBattleUnitSpineNodePosition(')) {
    next = next.replace(
      /\n  function resolveBattleUnitSpineEffectiveRawSize\(/,
      `
  function resolveBattleUnitSpineNodePosition(runtimeData, resolvedScale, slotHeight, unit, enemy) {
    var profile = resolveBattleUnitSpineVisualProfile(unit, unit.role === 'boss');
    var rawWidth = normalizeRawSpineSize(runtimeData.width, profile.fallbackRawHeight * 0.62);
    var rawHeight = normalizeRawSpineSize(runtimeData.height, profile.fallbackRawHeight);
    var effectiveRawSize = resolveBattleUnitSpineEffectiveRawSize(runtimeData.width, runtimeData.height, profile, unit);
    var inflated = isBattleUnitSpineEffectInflatedActBounds(rawWidth, rawHeight, profile, unit);
    var rawX = inflated ? -effectiveRawSize.width / 2 : normalizeRawSpineOffset(runtimeData.x, -effectiveRawSize.width / 2);
    var rawY = inflated ? 0 : normalizeRawSpineOffset(runtimeData.y, 0);
    var centerX = rawX + effectiveRawSize.width / 2;
    var targetFootY = -slotHeight * 0.42;
    return {
      x: (enemy ? 1 : -1) * centerX * resolvedScale,
      y: targetFootY - rawY * resolvedScale
    };
  }

  function resolveBattleUnitSpineEffectiveRawSize(`,
    );
  }
  if (!next.includes('function normalizeRawSpineOffset(')) {
    next = next.replace(
      /\n  function createBattleUnitSpineEnumMap\(/,
      `
  function normalizeRawSpineOffset(value, fallback) {
    return Number.isFinite(value) ? Number(value) : fallback;
  }

  function createBattleUnitSpineEnumMap(`,
    );
  }
  next = next.replace(
    'resolveBattleUnitSpineScale: resolveBattleUnitSpineScale,\n    resolveBattleUnitSpineMirrorScaleX: resolveBattleUnitSpineMirrorScaleX,',
    'resolveBattleUnitSpineScale: resolveBattleUnitSpineScale,\n    resolveBattleUnitSpineNodePosition: resolveBattleUnitSpineNodePosition,\n    resolveBattleUnitSpineMirrorScaleX: resolveBattleUnitSpineMirrorScaleX,',
  );
  next = next.replace(
    /resetBattlePlaybackRuntime\(sceneKey\) \{([\s\S]*?this\.battleFloatingTextLastAtByTarget\.clear\(\);\s*)\}/,
    `resetBattlePlaybackRuntime(sceneKey) {$1this.resetBattlePlaybackTelemetry(sceneKey);
        }

        resetBattlePlaybackTelemetry(sceneKey) {
          globalThis.__lootchainBattlePlaybackTelemetry = {
            sceneKey: sceneKey,
            samples: [],
            background: {
              source: 'asset',
              loaded: false,
              at: Date.now()
            }
          };
        }`,
  );
  return next;
}

function patchLayout(text) {
  return text
    .replaceAll('const actorWidth = compact ? Math.min((verticalCramped ? 142 : 172) * scale, fieldWidth * 0.32) : Math.min(246 * scale, fieldWidth * 0.24);', 'const actorWidth = compact ? Math.min((verticalCramped ? 148 : 182) * scale, fieldWidth * 0.32) : Math.min(278 * scale, fieldWidth * 0.23);')
    .replaceAll('const actorWidth = compact ? Math.min((verticalCramped ? 142 : 172) * scale, fieldWidth * 0.32) : Math.min(286 * scale, fieldWidth * 0.25);', 'const actorWidth = compact ? Math.min((verticalCramped ? 148 : 182) * scale, fieldWidth * 0.32) : Math.min(278 * scale, fieldWidth * 0.23);')
    .replaceAll('const actorWidth = compact ? Math.min((verticalCramped ? 148 : 182) * scale, fieldWidth * 0.32) : Math.min(312 * scale, fieldWidth * 0.27);', 'const actorWidth = compact ? Math.min((verticalCramped ? 148 : 182) * scale, fieldWidth * 0.32) : Math.min(278 * scale, fieldWidth * 0.23);')
    .replaceAll('const actorHeight = compact ? Math.min((verticalCramped ? 86 : 132) * scale, fieldHeight * 0.52) : Math.min(282 * scale, fieldHeight * 0.58);', 'const actorHeight = compact ? Math.min((verticalCramped ? 94 : 144) * scale, fieldHeight * 0.56) : Math.min(328 * scale, fieldHeight * 0.64);')
    .replaceAll('const actorHeight = compact ? Math.min((verticalCramped ? 86 : 132) * scale, fieldHeight * 0.52) : Math.min(330 * scale, fieldHeight * 0.66);', 'const actorHeight = compact ? Math.min((verticalCramped ? 94 : 144) * scale, fieldHeight * 0.56) : Math.min(328 * scale, fieldHeight * 0.64);')
    .replaceAll('const actorHeight = compact ? Math.min((verticalCramped ? 94 : 144) * scale, fieldHeight * 0.56) : Math.min(380 * scale, fieldHeight * 0.76);', 'const actorHeight = compact ? Math.min((verticalCramped ? 94 : 144) * scale, fieldHeight * 0.56) : Math.min(328 * scale, fieldHeight * 0.64);')
    .replaceAll('const laneGap = compact ? (verticalCramped ? 54 : 72) * scale : 102 * scale;', 'const laneGap = compact ? (verticalCramped ? 58 : 78) * scale : 128 * scale;')
    .replaceAll('const laneGap = compact ? (verticalCramped ? 58 : 78) * scale : 112 * scale;', 'const laneGap = compact ? (verticalCramped ? 58 : 78) * scale : 128 * scale;')
    .replaceAll('const allyX = compact ? -fieldWidth * 0.24 : -fieldWidth * 0.28;', 'const allyX = compact ? -fieldWidth * 0.26 : -fieldWidth * 0.34;')
    .replaceAll('const enemyX = compact ? fieldWidth * 0.24 : fieldWidth * 0.28;', 'const enemyX = compact ? fieldWidth * 0.26 : fieldWidth * 0.34;')
    .replace(/BATTLE_STAGE12_FORMATION_OFFSETS = \[\{[\s\S]*?\}\];\n\n      _cclegacy\._RF\.pop\(\);/, `BATTLE_STAGE12_FORMATION_OFFSETS = [{
        x: 6,
        y: 96
      }, {
        x: -136,
        y: -18
      }, {
        x: 18,
        y: -132
      }, {
        x: -238,
        y: 178
      }, {
        x: -250,
        y: -218
      }];

      _cclegacy._RF.pop();`);
}

function patchFormation(text) {
  let next = text
    .replaceAll('ui/battle/battle_scene_cathedral/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/battle_scene_cathedral/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_battle_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13v/forest_ground/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replaceAll('ui/battle/stage13x/boundary_battle_bg/spriteFrame', 'ui/battle/battle_scene_cathedral/spriteFrame')
    .replace(
      /var positions = \[\{[\s\S]*?\}\];\n\s*slots\.forEach\(\(hero, index\) => \{/,
      `var positions = [{
            x: -width * 0.24,
            y: height * 0.16
          }, {
            x: 0,
            y: height * 0.16
          }, {
            x: width * 0.24,
            y: height * 0.16
          }, {
            x: -width * 0.14,
            y: -height * 0.16
          }, {
            x: width * 0.14,
            y: -height * 0.16
          }];
          slots.forEach((hero, index) => {`,
    )
    .replaceAll(
      "var pos = (_positions$index = positions[index]) != null ? _positions$index : positions[positions.length - 1];\n            this.renderFormationActorStand(field, hero, index, pos.x, pos.y, Math.min(128 * scale, width * 0.2), Math.min(148 * scale, height * 0.34), scale);",
      "var pos = (_positions$index = positions[index]) != null ? _positions$index : positions[positions.length - 1];\n            var standWidth = Math.min(330 * scale, width * 0.46);\n            var standHeight = Math.min(430 * scale, height * 0.82);\n            this.renderFormationActorStand(field, hero, index, pos.x, pos.y, standWidth, standHeight, scale);",
    )
    .replace(/var standWidth = Math\.min\(\d+ \* scale, width \* 0\.\d+\);/g, 'var standWidth = Math.min(330 * scale, width * 0.46);')
    .replace(/var standHeight = Math\.min\(\d+ \* scale, height \* [0-9.]+\);/g, 'var standHeight = Math.min(430 * scale, height * 0.82);')
    .replace(/var visualWidth = width \* [0-9.]+; var visualHeight = height \* [0-9.]+;/g, 'var visualWidth = width * 2.36; var visualHeight = height * 2.28;')
    .replace(/var plateWidth = Math\.min\(width \* 1\.28, 132 \* scale\);/g, 'var actorNameFontSize = 16 * scale;\n          var actorSubFontSize = 11.5 * scale;\n          var plateWidth = Math.min(width * 1.55, 176 * scale);\n          var plateHeight = 40 * scale;')
    .replace(/var actorNameFontSize = 13\.8 \* scale;/g, 'var actorNameFontSize = 16 * scale;')
    .replace(/var actorSubFontSize = 9\.2 \* scale;/g, 'var actorSubFontSize = 11.5 * scale;')
    .replace(/var plateWidth = Math\.min\(width \* 1\.42, 152 \* scale\);/g, 'var plateWidth = Math.min(width * 1.55, 176 * scale);')
    .replace(/var plateHeight = 32 \* scale;/g, 'var plateHeight = 40 * scale;')
    .replace(/this\.host\.addChildPlainNode\(actor, 'LobbyFormationActorNameplate', 0, -height \* 0\.48, plateWidth, 28 \* scale\)/g, "this.host.addChildPlainNode(actor, 'LobbyFormationActorNameplate', 0, -height * 0.48, plateWidth, plateHeight)")
    .replace(/plateGraphics\.roundRect\(-plateWidth \/ 2, -14 \* scale, plateWidth, 28 \* scale, 4 \* scale\);/g, 'plateGraphics.roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 4 * scale);')
    .replace(/this\.host\.addChildLabel\(plate, 'LobbyFormationActorName', hero \? safeText\(hero\.heroName\) : '空位', 0, 4 \* scale, 12 \* scale, hero \? \(_crd && rgba === void 0 \? \(_reportPossibleCrUseOfrgba\(\{ error: Error\(\) \}\), rgba\) : rgba\)\(246, 218, 156\) : \(_crd && rgba === void 0 \? \(_reportPossibleCrUseOfrgba\(\{ error: Error\(\) \}\), rgba\) : rgba\)\(132, 118, 88\), new Size\(plateWidth - 10 \* scale, 15 \* scale\)\)/g, "this.host.addChildLabel(plate, 'LobbyFormationActorName', hero ? safeText(hero.heroName) : '空位', 0, 7 * scale, actorNameFontSize, hero ? (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(246, 218, 156) : (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(132, 118, 88), new Size(plateWidth - 14 * scale, 20 * scale))")
    .replace(/this\.host\.addChildLabel\(plate, 'LobbyFormationActorName', hero \? safeText\(hero\.heroName\) : '空位', 0, 5 \* scale, actorNameFontSize, hero \? \(_crd && rgba === void 0 \? \(_reportPossibleCrUseOfrgba\(\{ error: Error\(\) \}\), rgba\) : rgba\)\(246, 218, 156\) : \(_crd && rgba === void 0 \? \(_reportPossibleCrUseOfrgba\(\{ error: Error\(\) \}\), rgba\) : rgba\)\(132, 118, 88\), new Size\(plateWidth - 12 \* scale, 17 \* scale\)\)/g, "this.host.addChildLabel(plate, 'LobbyFormationActorName', hero ? safeText(hero.heroName) : '空位', 0, 7 * scale, actorNameFontSize, hero ? (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(246, 218, 156) : (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(132, 118, 88), new Size(plateWidth - 14 * scale, 20 * scale))")
    .replace(/this\.host\.addChildLabel\(plate, 'LobbyFormationActorSub', hero \? `\$\{safeText\(hero\.rarity\)\} · Lv\.\$\{hero\.level\}` : '待上阵', 0, -8 \* scale, 8 \* scale, \(_crd && rgba === void 0 \? \(_reportPossibleCrUseOfrgba\(\{ error: Error\(\) \}\), rgba\) : rgba\)\(182, 160, 111\), new Size\(plateWidth - 10 \* scale, 11 \* scale\)\)/g, "this.host.addChildLabel(plate, 'LobbyFormationActorSub', hero ? `${safeText(hero.rarity)} · Lv.${hero.level}` : '待上阵', 0, -10 * scale, actorSubFontSize, (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(182, 160, 111), new Size(plateWidth - 14 * scale, 16 * scale))")
    .replace(/this\.host\.addChildLabel\(plate, 'LobbyFormationActorSub', hero \? `\$\{safeText\(hero\.rarity\)\} · Lv\.\$\{hero\.level\}` : '待上阵', 0, -8\.5 \* scale, actorSubFontSize, \(_crd && rgba === void 0 \? \(_reportPossibleCrUseOfrgba\(\{ error: Error\(\) \}\), rgba\) : rgba\)\(182, 160, 111\), new Size\(plateWidth - 12 \* scale, 13 \* scale\)\)/g, "this.host.addChildLabel(plate, 'LobbyFormationActorSub', hero ? `${safeText(hero.rarity)} · Lv.${hero.level}` : '待上阵', 0, -10 * scale, actorSubFontSize, (_crd && rgba === void 0 ? (_reportPossibleCrUseOfrgba({ error: Error() }), rgba) : rgba)(182, 160, 111), new Size(plateWidth - 14 * scale, 16 * scale))")
    .replaceAll(
      'this.recordFormationActorVisualTelemetry(hero, width, height, visualWidth, visualHeight);',
      `var formationDebug = globalThis.__lootchainFormationDebug;
          if (formationDebug && Array.isArray(formationDebug.srRVisuals)) {
            var formationVisuals = formationDebug.srRVisuals;
            formationVisuals.push({
              heroCode: String(hero.heroCode || ''),
              rarity: String(hero.rarity || ''),
              width: Math.round(width * 100) / 100,
              height: Math.round(height * 100) / 100,
              visualWidth: Math.round(visualWidth * 100) / 100,
              visualHeight: Math.round(visualHeight * 100) / 100
            });
            formationDebug.srRVisuals = formationVisuals.slice(-8);
          }`,
    )
    .replaceAll('this.applyFormationSpineDataWithRetry(spineNode, skeleton, data, visualWidth, visualHeight, scale, unit, resourcePath,', 'this.applyFormationSpineDataWithRetry(spineNode, skeleton, data, width, height, scale, unit, resourcePath,')
    .replaceAll('scaleProfile: hero.rarity', "scaleProfile: 'FORMATION_PREVIEW'");
  next = next.replace(
    /recordFormationDebugSnapshot\(stageCode, state, selectedHeroIds\) \{[\s\S]*?\n        renderHeader\(parent, width, height, scale, state, stageCode, selectedHeroIds\) \{/,
    `recordFormationDebugSnapshot(stageCode, state, selectedHeroIds) {
          var selectedHeroes = this.resolveSelectedSlots(state.heroes, selectedHeroIds).filter(hero => !!hero);
          var root = globalThis;
          var previous = root.__lootchainFormationDebug;
          var sameSelection = previous && previous.stageCode === stageCode && Array.isArray(previous.selectedHeroIds) && previous.selectedHeroIds.length === selectedHeroIds.length && previous.selectedHeroIds.every((heroId, index) => heroId === selectedHeroIds[index]);
          root.__lootchainFormationDebug = {
            stageCode: stageCode,
            selectedHeroIds: [...selectedHeroIds],
            selectedHeroNames: selectedHeroes.map(hero => String(hero.heroName || '')),
            selectedCount: selectedHeroes.length,
            loading: state.loading,
            error: state.error ? String(state.error) : null,
            srRVisuals: sameSelection && Array.isArray(previous.srRVisuals) ? [...previous.srRVisuals] : [],
            at: Date.now()
          };
        }

        renderHeader(parent, width, height, scale, state, stageCode, selectedHeroIds) {`,
  );
  const formationResolvedTelemetryBlock = `            // formation debug resolved visual height / recordFormationActorResolvedVisualTelemetry v2
            var formationDebug = globalThis.__lootchainFormationDebug;
            var formationRarity = String(unit.rarity || unit.scaleProfile || '').toUpperCase();
            if (formationDebug && Array.isArray(formationDebug.srRVisuals)) {
              var formationHeroCode = String(unit.heroCode || unit.unitKey || '');
              var formationRawWidth = Number(runtimeData.width || 0);
              var formationRawHeight = Number(runtimeData.height || 0);
              var formationPrimaryAsset = typeof resolveBattleUnitSpinePrimaryAsset === 'function' ? resolveBattleUnitSpinePrimaryAsset(unit) || '' : '';
              var formationTelemetryHeight = typeof resolveBattleUnitSpineTelemetryVisualHeight === 'function'
                ? resolveBattleUnitSpineTelemetryVisualHeight(runtimeData.width, runtimeData.height, spineScale, unit, false)
                : (formationRawHeight || 720) * spineScale;
              var formationEstimatedHeight = Math.round(Number(formationTelemetryHeight || 0) * 100) / 100;
              var formationExisting = formationDebug.srRVisuals.slice().reverse().find(visual => visual.heroCode === formationHeroCode);
              if (!formationExisting) {
                formationExisting = { heroCode: formationHeroCode, rarity: formationRarity, width: 0, height: 0, visualWidth: 0, visualHeight: 0 };
                formationDebug.srRVisuals.push(formationExisting);
              }
              formationExisting.primaryAsset = String(formationPrimaryAsset);
              formationExisting.rawWidth = Math.round(formationRawWidth * 100) / 100;
              formationExisting.rawHeight = Math.round(formationRawHeight * 100) / 100;
              formationExisting.resolvedScale = Math.round(spineScale * 10000) / 10000;
              formationExisting.estimatedHeight = formationEstimatedHeight;
              formationDebug.srRVisuals = formationDebug.srRVisuals.slice(-12);
            }
`;
  next = next.replace(
    /            \/\/ formation debug resolved visual height[\s\S]*?            this\.recordFormationActorResolvedVisualTelemetry\(unit, runtimeData\.width, runtimeData\.height, spineScale\);\n/,
    formationResolvedTelemetryBlock,
  );
  if (!next.includes('recordFormationActorResolvedVisualTelemetry v2')) {
    next = next.replace(
      /(var spineScale = \([\s\S]*?resolveBattleUnitSpineScale\) : resolveBattleUnitSpineScale\)\(runtimeData\.width, runtimeData\.height, width, height, scale, false, unit\);\n)/,
      `$1${formationResolvedTelemetryBlock}`,
    );
  }
  next = next.replace(
    /            this\.recordFormationActorResolvedVisualTelemetry\(unit, runtimeData\.width, runtimeData\.height, spineScale\);\n/g,
    '',
  );
  return next;
}

const importMap = readJson(IMPORT_MAP_PATH);
const files = [
  [chunkFileFor(importMap, SPECIFIERS.renderer), patchRenderer],
  [chunkFileFor(importMap, SPECIFIERS.layout), patchLayout],
  [chunkFileFor(importMap, SPECIFIERS.state), patchState],
  [chunkFileFor(importMap, SPECIFIERS.timeline), patchTimeline],
  [chunkFileFor(importMap, SPECIFIERS.action), patchAction],
  [chunkFileFor(importMap, SPECIFIERS.runtime), patchRuntime],
  [chunkFileFor(importMap, SPECIFIERS.formation), patchFormation],
];

let patched = 0;
for (const [file, transform] of files) {
  if (patchFile(file, transform)) {
    patched += 1;
  }
}

console.log(`preview stage13v repair patched files: ${patched}`);
