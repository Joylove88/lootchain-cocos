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

function replaceOrVerify(text, oldText, newText, marker) {
  if (text.includes(newText)) {
    return text;
  }
  if (!text.includes(oldText)) {
    throw new Error(`preview melee root-motion patch marker not found: ${marker}`);
  }
  return text.replace(oldText, newText);
}

function patchRenderer(text) {
  let next = text;
  if (!next.includes('this.battleActorStickyCombatPositions = new Map();')) {
    next = replaceOrVerify(
      next,
      `this.battleActorFramePositions = new Map();
          this.playedBattleCueKeys = new Set();`,
      `this.battleActorFramePositions = new Map();
          this.battleActorStickyCombatPositions = new Map();
          this.playedBattleCueKeys = new Set();`,
      'sticky contact position cache',
    );
  }
  if (!next.includes('this.battleActorStickyCombatHoldUntilMs = new Map();')) {
    next = next.replace(
      /(this\.battleActorStickyCombatPositions = new Map\(\);\s*)/,
      `$1this.battleActorStickyCombatHoldUntilMs = new Map();
          `,
    );
    if (!next.includes('this.battleActorStickyCombatHoldUntilMs = new Map();')) {
      throw new Error('preview melee root-motion patch marker not found: sticky contact hold cache');
    }
  }
  next = next.replaceAll('BATTLE_ACTOR_FRAME_MAX_DELTA = 120;', 'BATTLE_ACTOR_FRAME_MAX_DELTA = 104;');
  if (!next.includes('this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(targetPosition.x, targetPosition.y, 0));')) {
    next = replaceOrVerify(
      next,
      `var home = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
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
          return this.resolveBattleActorRootMotionPosition(homePosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio);`,
    `var home = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
          var baseHomePosition = new Vec3(home.x, home.y, 0);
          var stickyContactPosition = this.battleActorStickyCombatPositions.get(unit.unitKey);
          var homePosition = stickyContactPosition ? new Vec3(stickyContactPosition.x, stickyContactPosition.y, 0) : baseHomePosition;

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
          var actorPosition = this.resolveBattleActorRootMotionPosition(homePosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio);

          if (motionCue.actorKey === unit.unitKey && motionCue.kind === 'melee_move' && Math.hypot(actorPosition.x - targetPosition.x, actorPosition.y - targetPosition.y) <= 2 * scale) {
            this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(targetPosition.x, targetPosition.y, 0));
          }

          return actorPosition;`,
      'sticky contact frame position',
    );
  }
  if (!next.includes('linkedDuelWindowMs')) {
    next = replaceOrVerify(
      next,
      `var reversedHitDuel = currentActionCue.kind === 'hit_float' && cue.actorKey === currentActionCue.targetKey && cue.targetKey === currentActionCue.actorKey;
            return (sameActionDuel || reversedHitDuel) && Math.abs(cue.timeMs - currentActionCue.timeMs) <= 2300;
          }).sort((a, b) => b.timeMs - a.timeMs || resolveBattleActorRootMotionPriority(b.kind) - resolveBattleActorRootMotionPriority(a.kind));`,
    `var reversedHitDuel = currentActionCue.kind === 'hit_float' && cue.actorKey === currentActionCue.targetKey && cue.targetKey === currentActionCue.actorKey;
            var linkedDuelWindowMs = (cue.durationMs + returnWindowMs) / Math.max(0.08, timelineToPresentationRatio) + 260;
            return (sameActionDuel || reversedHitDuel) && Math.abs(cue.timeMs - currentActionCue.timeMs) <= linkedDuelWindowMs;
          }).sort((a, b) => {
            var aMeleeContact = a.kind === 'melee_move';
            var bMeleeContact = b.kind === 'melee_move';
            if (aMeleeContact !== bMeleeContact) {
              return aMeleeContact ? -1 : 1;
            }
            return b.timeMs - a.timeMs || resolveBattleActorRootMotionPriority(b.kind) - resolveBattleActorRootMotionPriority(a.kind);
          });`,
      'root motion melee priority',
    );
  }
  if (!next.includes('var _approachMs2 = this.resolveBattleActorBasicAttackApproachMs(cue);')) {
    next = replaceOrVerify(
      next,
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
          }`,
    `if (cue.kind === 'basic_attack') {
            var _approachMs2 = this.resolveBattleActorBasicAttackApproachMs(cue);

            if (elapsedMs <= _approachMs2) {
              return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / _approachMs2));
            }

            return targetPosition;
          }`,
      'basic attack no early return',
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
    );
  next = next
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
  if (!next.includes('resolveBattleActorChargeLaneGap(unit, scale) {')) {
    next = next.replace(
      /(\n\s*)resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue\) \{/,
      `
$1resolveBattleActorFrontChargeOffset(unit, enemy, converged, scale, presentation, openingConvergence) {
          var combatActive = !openingConvergence.active && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded');
          if (!combatActive || unit.role === 'back' || unit.power <= 0 || unit.unitKey.includes('empty')) {
            return { x: 0, y: 0, progress: 0 };
          }
          var startMs = this.battleActorChargeStartMs.get(unit.unitKey);
          if (startMs === undefined) {
            startMs = Date.now();
            this.battleActorChargeStartMs.set(unit.unitKey, startMs);
          }
          var progress = clamp((Date.now() - startMs) / BATTLE_ACTOR_FRONT_CHARGE_MS, 0, 1);
          var eased = easeBattleOpeningConvergenceProgress(progress);
          var forward = enemy ? -1 : 1;
          var minGap = this.resolveBattleActorChargeLaneGap(unit, scale);
          var rawTargetX = converged.x + forward * BATTLE_ACTOR_FRONT_CHARGE_DISTANCE * scale;
          var targetX = enemy ? Math.max(rawTargetX, minGap) : Math.min(rawTargetX, -minGap);
          var targetY = this.resolveBattleActorChargeLaneYOffset(unit, scale);
          return { x: eased * (targetX - converged.x), y: eased * targetY, progress: progress };
        }

$1resolveBattleActorChargeLaneGap(unit, scale) {
          var laneIndex = Math.max(0, Math.min(4, unit.slot));
          var rowOffset = laneIndex <= 2 ? laneIndex * 42 : 70 + (laneIndex - 3) * 44;
          var roleOffset = unit.role === 'boss' ? 38 : unit.role === 'back' ? 72 : 0;
          return (BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP + rowOffset + roleOffset) * scale;
        }

$1resolveBattleActorChargeLaneYOffset(unit, scale) {
          var laneIndex = Math.max(0, Math.min(4, unit.slot));
          var offsets = [72, -8, -92, 136, -154];
          var roleOffset = unit.role === 'boss' ? 28 : 0;
          return ((offsets[laneIndex] || 0) + roleOffset) * scale;
        }

$1resolveBattleActorClashIdleOffset(unit, enemy, slot, scale, presentation, openingConvergence, chargeProgress) {
          var combatActive = !openingConvergence.active && presentation.phase === 'roundPlaying' && chargeProgress >= 1 && unit.power > 0 && !unit.unitKey.includes('empty');
          if (!combatActive || unit.role === 'back') {
            return { x: 0, y: 0 };
          }
          var direction = enemy ? -1 : 1;
          var phaseSeed = this.resolveBattleActorClashPhaseOffset(unit);
          var elapsed = Date.now() + phaseSeed;
          var pulse = Math.sin(elapsed / 430);
          var secondary = Math.cos(elapsed / 690);
          var laneFactor = slot.lane <= 2 ? 1 : 0.72;
          return {
            x: direction * BATTLE_ACTOR_CLASH_IDLE_SWAY_X * laneFactor * pulse * scale,
            y: BATTLE_ACTOR_CLASH_IDLE_SWAY_Y * secondary * scale
          };
        }

$1resolveBattleUnitBasicAttackCueName(unit) {
          var rarity = ((unit.rarity || unit.scaleProfile || '') + '').trim().toUpperCase();
          return rarity === 'SR' || rarity === 'R' ? 'skill0' : 'atk';
        }

$1resolveBattleActorClashPhaseOffset(unit) {
          var hash = 0;
          for (var index = 0; index < unit.unitKey.length; index += 1) {
            hash = hash * 31 + unit.unitKey.charCodeAt(index) >>> 0;
          }
          return hash % BATTLE_ACTOR_CLASH_ATTACK_CYCLE_MS;
        }

$1resolveBattleActorClashCombatAnimation(unit, clashBucket) {
          var basicAttack = this.resolveBattleUnitBasicAttackCueName(unit);
          var cycle = [basicAttack, 'skill1', basicAttack, 'skill2'];
          return cycle[(clashBucket % cycle.length + cycle.length) % cycle.length];
        }

$1resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue) {`,
    );
  }
  if (!next.includes('resolveBattleActorClashPhaseOffset(unit) {')) {
    next = next.replace(
      /(\n\s*)resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue\) \{/,
      `
$1resolveBattleUnitBasicAttackCueName(unit) {
          var rarity = ((unit.rarity || unit.scaleProfile || '') + '').trim().toUpperCase();
          return rarity === 'SR' || rarity === 'R' ? 'skill0' : 'atk';
        }

$1resolveBattleActorClashPhaseOffset(unit) {
          var hash = 0;
          for (var index = 0; index < unit.unitKey.length; index += 1) {
            hash = hash * 31 + unit.unitKey.charCodeAt(index) >>> 0;
          }
          return hash % BATTLE_ACTOR_CLASH_ATTACK_CYCLE_MS;
        }

$1resolveBattleActorClashCombatAnimation(unit, clashBucket) {
          var basicAttack = this.resolveBattleUnitBasicAttackCueName(unit);
          var cycle = [basicAttack, 'skill1', basicAttack, 'skill2'];
          return cycle[(clashBucket % cycle.length + cycle.length) % cycle.length];
        }

$1resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue) {`,
    );
  }
  next = next.replace(
    /var targetX = enemy \? Math\.max\(rawTargetX, minGap\) : Math\.min\(rawTargetX, -minGap\);\s*return \{ x: eased \* \(targetX - converged\.x\), y: 0, progress: progress \};/g,
    `var targetX = enemy ? Math.max(rawTargetX, minGap) : Math.min(rawTargetX, -minGap);
          var targetY = this.resolveBattleActorChargeLaneYOffset(unit, scale);
          return { x: eased * (targetX - converged.x), y: eased * targetY, progress: progress };`,
  );
  if (!next.includes('resolveBattleActorChargeLaneYOffset(unit, scale) {')) {
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
  next = next.replace(
    /var seed = "" \+ currentActionCue\.actorKey \+ "\|" \+ currentActionCue\.targetKey \+ "\|" \+ currentActionCue\.eventSeq;([\s\S]*?)return \(hash % 5 - 2\) \* 7 \* scale;/g,
    `var seed = "" + currentActionCue.actorKey + "|" + currentActionCue.targetKey;$1return (hash % 7 - 3) * 34 * scale;`,
  );
  next = next.replace(
    /var seed = currentActionCue\.actorKey \+ "\|" \+ currentActionCue\.targetKey \+ "\|" \+ currentActionCue\.eventSeq;([\s\S]*?)return \(hash % 5 - 2\) \* 7 \* scale;/g,
    `var seed = currentActionCue.actorKey + "|" + currentActionCue.targetKey;$1return (hash % 7 - 3) * 34 * scale;`,
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
    /var seed = `\$\{currentActionCue\.actorKey\}\|\$\{currentActionCue\.targetKey\}\|\$\{currentActionCue\.eventSeq\}`;([\s\S]*?)return \(\(hash % 5\) - 2\) \* 7 \* scale;/g,
    'var seed = `${currentActionCue.actorKey}|${currentActionCue.targetKey}`;$1return ((hash % 7) - 3) * 34 * scale;',
  );
  next = next.replace(
    /var maxDelta = rootMotionCue \? Math\.max\((?:196|86|132|96) \* scale, BATTLE_ACTOR_FRAME_MAX_DELTA \* (?:2\.25|0\.82|1\.18|1\.02) \* scale\) : Math\.max\(76 \* scale, BATTLE_ACTOR_FRAME_MAX_DELTA \* 0\.58 \* scale\);/,
    `var maxDelta = rootMotionCue ? Math.max(96 * scale, BATTLE_ACTOR_FRAME_MAX_DELTA * 1.02 * scale) : Math.max(76 * scale, BATTLE_ACTOR_FRAME_MAX_DELTA * 0.58 * scale);`,
  );
  if (!next.includes('var maxDelta = rootMotionCue ? Math.max(96 * scale, BATTLE_ACTOR_FRAME_MAX_DELTA * 1.02 * scale)')) {
    throw new Error('preview melee root-motion patch marker not found: root motion max delta');
  }
  next = next.replace(
    /var persistentHomePosition = BATTLE_USE_STICKY_CONTACT_POSITIONS && stickyContactPosition \? new Vec3\(stickyContactPosition\.x, stickyContactPosition\.y, 0\) : baseHomePosition;\s*var idleOffset = this\.resolveBattleActorClashIdleOffset\(unit, enemy, slot, scale, presentation, openingConvergence, charge\.progress\);\s*var stickyContactIdleOffset = BATTLE_USE_STICKY_CONTACT_POSITIONS && stickyContactPosition \? this\.resolveBattleActorStickyContactIdleOffset\(unit, enemy, scale\) : \{\s*x: 0,\s*y: 0\s*\};\s*var baseMotionHomePosition = new Vec3\(baseHomePosition\.x \+ idleOffset\.x, baseHomePosition\.y \+ idleOffset\.y, 0\);\s*var homePosition = new Vec3\(persistentHomePosition\.x \+ idleOffset\.x \+ stickyContactIdleOffset\.x, persistentHomePosition\.y \+ idleOffset\.y \+ stickyContactIdleOffset\.y, 0\);/g,
    `var idleOffset = this.resolveBattleActorClashIdleOffset(unit, enemy, slot, scale, presentation, openingConvergence, charge.progress);
          var baseMotionHomePosition = new Vec3(baseHomePosition.x + idleOffset.x, baseHomePosition.y + idleOffset.y, 0);`,
  );
  next = next.replace(
    /var motionCue = this\.resolveBattleActorRootMotionCue\(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue\);\s*if \(!motionCue\) \{\s*return (?:homePosition|baseMotionHomePosition);\s*\}\s*(?:var useStickyMotionHome = BATTLE_USE_STICKY_CONTACT_POSITIONS && !!stickyContactPosition;\s*var homePosition = useStickyMotionHome \? new Vec3\(stickyContactPosition\.x \+ idleOffset\.x, stickyContactPosition\.y \+ idleOffset\.y, 0\) : baseMotionHomePosition;\s*)?var actionOffset = this\.resolveActorActionOffset\(unit, enemy, slot, motionCue, presentation, actionAnchors, scale\);/g,
    `var motionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);

          if (!motionCue) {
            var localActionOffset = this.resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation, actionAnchors, scale);
            var holdUntilMs = this.battleActorStickyCombatHoldUntilMs.get(unit.unitKey) || 0;
            var heldContactPosition = BATTLE_USE_STICKY_CONTACT_POSITIONS && stickyContactPosition && Date.now() <= holdUntilMs ? new Vec3(stickyContactPosition.x + idleOffset.x, stickyContactPosition.y + idleOffset.y, 0) : baseMotionHomePosition;
            return new Vec3(heldContactPosition.x + localActionOffset.x, heldContactPosition.y + localActionOffset.y, 0);
          }

          var useStickyMotionHome = BATTLE_USE_STICKY_CONTACT_POSITIONS && !!stickyContactPosition;
          var homePosition = useStickyMotionHome ? new Vec3(stickyContactPosition.x + idleOffset.x, stickyContactPosition.y + idleOffset.y, 0) : baseMotionHomePosition;
          var actionOffset = this.resolveActorActionOffset(unit, enemy, slot, motionCue, presentation, actionAnchors, scale);`,
  );
  next = next.replace(
    /if \(cue\.kind === 'basic_attack'\) \{\s*return visualElapsedMs <= this\.resolveBattleActorBasicAttackApproachMs\(cue\);\s*\}/g,
    `if (cue.kind === 'basic_attack') {
            return false;
          }`,
  );
  next = next.replace(
    /this\.battleActorStickyCombatPositions\.set\(unit\.unitKey, new Vec3\(targetPosition\.x, targetPosition\.y, 0\)\);\s*\}\s*return actorPosition;/g,
    `this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(targetPosition.x, targetPosition.y, 0));
          }
          if ((currentActionCue == null ? void 0 : currentActionCue.actorKey) === unit.unitKey && currentActionCue.kind === 'damage_float') {
            this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(actorPosition.x, actorPosition.y, 0));
            this.battleActorStickyCombatHoldUntilMs.set(unit.unitKey, Date.now() + 2400);
          }
          return actorPosition;`,
  );
  next = next.replace(
    /currentActionCue\.kind === 'damage_float' && stickyContactPosition/g,
    "currentActionCue.kind === 'damage_float'",
  );
  next = next.replaceAll('Date.now() + 1450', 'Date.now() + 2400');
  next = next.replace(
    /var holdUntilMs = this\.battleActorStickyCombatHoldUntilMs\.get\(unit\.unitKey\) \|\| 0;\s*var heldContactPosition = BATTLE_USE_STICKY_CONTACT_POSITIONS && stickyContactPosition && Date\.now\(\) <= holdUntilMs \? new Vec3\(stickyContactPosition\.x \+ idleOffset\.x, stickyContactPosition\.y \+ idleOffset\.y, 0\) : baseMotionHomePosition;/g,
    `var holdUntilMs = this.battleActorStickyCombatHoldUntilMs.get(unit.unitKey) || 0;
            var holdSeparation = this.resolveBattleStickyHoldSeparationOffset(unit, enemy, scale);
            var heldContactPosition = BATTLE_USE_STICKY_CONTACT_POSITIONS && stickyContactPosition && Date.now() <= holdUntilMs ? new Vec3(stickyContactPosition.x + idleOffset.x + holdSeparation.x, stickyContactPosition.y + idleOffset.y + holdSeparation.y, 0) : baseMotionHomePosition;`,
  );
  next = next
    .replaceAll('var yOffsets = [-36, 36, -36, 60, -60];', 'var yOffsets = [-84, 96, 84, 120, -120];')
    .replaceAll('var yOffsets = [-72, 84, -72, 108, -108];', 'var yOffsets = [-84, 96, 84, 120, -120];')
    .replaceAll('var yOffsets = [-84, 96, -84, 120, -120];', 'var yOffsets = [-84, 96, 84, 120, -120];')
    .replaceAll('var xOffsets = [0, 8, -8, 12, -12];', 'var xOffsets = [0, 0, 0, 0, 0];')
    .replaceAll('var xOffsets = [0, 16, -16, 24, -24];', 'var xOffsets = [0, 0, 0, 0, 0];');
  next = next
    .replaceAll('var yOffsets = [0, 42, -42, 84, -84];', 'var yOffsets = [0, 160, -160, 500, -500];')
    .replaceAll('var yOffsets = [0, 54, -54, 120, -120];', 'var yOffsets = [0, 160, -160, 500, -500];')
    .replaceAll('var yOffsets = [0, 80, -80, 180, -180];', 'var yOffsets = [0, 160, -160, 500, -500];')
    .replaceAll('var yOffsets = [0, 160, -160, 360, -360];', 'var yOffsets = [0, 160, -160, 500, -500];')
    .replaceAll('var xOffsets = [0, -8, 8, -16, 16];', 'var xOffsets = [0, -60, 60, 120, -120];');
  next = next
    .replaceAll('var lineYOffset = [0, 24, -24, 48, -48][lineIndex] || 0;', 'var lineYOffset = [0, 140, -140, 500, -500][lineIndex] || 0;')
    .replaceAll('var lineYOffset = [0, 60, -60, 140, -140][lineIndex] || 0;', 'var lineYOffset = [0, 140, -140, 500, -500][lineIndex] || 0;')
    .replaceAll('var lineYOffset = [0, 140, -140, 320, -320][lineIndex] || 0;', 'var lineYOffset = [0, 140, -140, 500, -500][lineIndex] || 0;')
    .replaceAll('var lineXOffset = [0, -10, 10, -16, 16][lineIndex] || 0;', 'var lineXOffset = [0, -32, 32, -56, 56][lineIndex] || 0;')
    .replaceAll('var lineXOffset = [0, -18, 18, -28, 28][lineIndex] || 0;', 'var lineXOffset = [0, -32, 32, -56, 56][lineIndex] || 0;');
  if (!next.includes('resolveBattleStickyHoldSeparationOffset(unit, enemy, scale) {')) {
    next = next.replace(
      /(\n\s*)resolveBattleDamageTargetSeparationOffset\(unit, enemy, scale\) \{/,
      `
$1resolveBattleStickyHoldSeparationOffset(unit, enemy, scale) {
          var _numericUnitMatch4 = unit.unitKey.match(/\\d+$/);
          var numericUnit = Number(_numericUnitMatch4 == null ? void 0 : _numericUnitMatch4[0]);
          var hash = 0;
          if (!Number.isFinite(numericUnit)) {
            for (var index = 0; index < unit.unitKey.length; index += 1) {
              hash = hash * 31 + unit.unitKey.charCodeAt(index) >>> 0;
            }
          }
          var seed = Number.isFinite(numericUnit) ? numericUnit : hash;
          var lineIndex = Math.abs(seed) % 5;
          var yOffsets = [0, 160, -160, 500, -500];
          var xOffsets = [0, -60, 60, 120, -120];
          var direction = enemy ? -1 : 1;
          return {
            x: direction * (xOffsets[lineIndex] || 0) * scale,
            y: (yOffsets[lineIndex] || 0) * scale
          };
        }

$1resolveBattleDamageTargetSeparationOffset(unit, enemy, scale) {`,
    );
  }
  next = next.replace(
    /var laneFactor = slot\.lane <= 2 \? 1 : 0\.72;\s*return \{\s*x: direction \* BATTLE_ACTOR_CLASH_IDLE_SWAY_X \* laneFactor \* pulse \* scale,\s*y: BATTLE_ACTOR_CLASH_IDLE_SWAY_Y \* secondary \* scale\s*\};/g,
    `var laneFactor = slot.lane <= 2 ? 1 : 0.72;
          var _numericUnitMatch2 = unit.unitKey.match(/\\d+$/);
          var numericUnit = Number(_numericUnitMatch2 == null ? void 0 : _numericUnitMatch2[0]);
          var hash = 0;
          if (!Number.isFinite(numericUnit)) {
            for (var index = 0; index < unit.unitKey.length; index += 1) {
              hash = hash * 31 + unit.unitKey.charCodeAt(index) >>> 0;
            }
          }
          var laneSeed = Number.isFinite(numericUnit) ? numericUnit : hash;
          var lineIndex = Math.abs(laneSeed) % 5;
          var lineYOffset = [0, 140, -140, 500, -500][lineIndex] || 0;
          var lineXOffset = [0, -32, 32, -56, 56][lineIndex] || 0;
          return {
            x: (direction * BATTLE_ACTOR_CLASH_IDLE_SWAY_X * laneFactor * pulse + direction * lineXOffset) * scale,
            y: (BATTLE_ACTOR_CLASH_IDLE_SWAY_Y * secondary + lineYOffset) * scale
          };`,
  );
  next = next.replace(
    /if \(\(currentActionCue == null \? void 0 : currentActionCue\.actorKey\) === unit\.unitKey && currentActionCue\.kind === 'damage_float'\) \{\s*this\.battleActorStickyCombatHoldUntilMs\.set\(unit\.unitKey, Date\.now\(\) \+ (?:1450|2400)\);/g,
    `if ((currentActionCue == null ? void 0 : currentActionCue.actorKey) === unit.unitKey && currentActionCue.kind === 'damage_float') {
            this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(actorPosition.x, actorPosition.y, 0));
            this.battleActorStickyCombatHoldUntilMs.set(unit.unitKey, Date.now() + 2400);`,
  );
  next = next.replace(
    /if \(currentActionCue\.targetKey === unit\.unitKey && currentActionCue\.kind === 'damage_float'\) \{\s*var impactProfile = ([\s\S]*?)\(currentActionCue, scale\);\s*if \(impactProfile\) \{\s*return \{\s*x: -direction \* impactProfile\.defenderRecoil\.distanceX,\s*y: impactProfile\.defenderRecoil\.liftY\s*\};\s*\}\s*return \{\s*x: -direction \* slot\.width \* 0\.035,\s*y: 2 \* scale\s*\};\s*\}/g,
    `if (currentActionCue.targetKey === unit.unitKey && currentActionCue.kind === 'damage_float') {
            var impactProfile = $1(currentActionCue, scale);
            var targetNudge = this.resolveBattleDamageTargetSeparationOffset(unit, enemy, scale);
            if (impactProfile) {
              return {
                x: -direction * impactProfile.defenderRecoil.distanceX + targetNudge.x,
                y: impactProfile.defenderRecoil.liftY + targetNudge.y
              };
            }
            return {
              x: -direction * slot.width * 0.035 + targetNudge.x,
              y: 2 * scale + targetNudge.y
            };
          }`,
  );
  if (!next.includes('resolveBattleDamageTargetSeparationOffset(unit, enemy, scale) {')) {
    next = next.replace(
      /(\n\s*)resolveActorClashLungeOffset\(unit, enemy, slot, currentActionCue, scale\) \{/,
      `
$1resolveBattleStickyHoldSeparationOffset(unit, enemy, scale) {
          var _numericUnitMatch4 = unit.unitKey.match(/\\d+$/);
          var numericUnit = Number(_numericUnitMatch4 == null ? void 0 : _numericUnitMatch4[0]);
          var hash = 0;
          if (!Number.isFinite(numericUnit)) {
            for (var index = 0; index < unit.unitKey.length; index += 1) {
              hash = hash * 31 + unit.unitKey.charCodeAt(index) >>> 0;
            }
          }
          var seed = Number.isFinite(numericUnit) ? numericUnit : hash;
          var lineIndex = Math.abs(seed) % 5;
          var yOffsets = [0, 160, -160, 500, -500];
          var xOffsets = [0, -60, 60, 120, -120];
          var direction = enemy ? -1 : 1;
          return {
            x: direction * (xOffsets[lineIndex] || 0) * scale,
            y: (yOffsets[lineIndex] || 0) * scale
          };
        }

$1resolveBattleDamageTargetSeparationOffset(unit, enemy, scale) {
          var _numericUnitMatch3 = unit.unitKey.match(/\\d+$/);
          var numericUnit = Number(_numericUnitMatch3 == null ? void 0 : _numericUnitMatch3[0]);
          var hash = 0;
          if (!Number.isFinite(numericUnit)) {
            for (var index = 0; index < unit.unitKey.length; index += 1) {
              hash = hash * 31 + unit.unitKey.charCodeAt(index) >>> 0;
            }
          }
          var seed = Number.isFinite(numericUnit) ? numericUnit : hash;
          var lineIndex = Math.abs(seed) % 5;
          var yOffsets = [-72, 84, -72, 108, -108];
          var xOffsets = [0, 16, -16, 24, -24];
          var direction = enemy ? -1 : 1;
          return {
            x: direction * (xOffsets[lineIndex] || 0) * scale,
            y: (yOffsets[lineIndex] || 0) * scale
          };
        }

$1resolveActorClashLungeOffset(unit, enemy, slot, currentActionCue, scale) {`,
    );
  }
  if (!next.includes('this.battleActorStickyCombatPositions.clear();')) {
    next = replaceOrVerify(
      next,
      `this.battleActorFramePositions.clear();
          this.playedBattleCueKeys.clear();`,
    `this.battleActorFramePositions.clear();
          this.battleActorStickyCombatPositions.clear();
          this.playedBattleCueKeys.clear();`,
      'sticky contact reset',
    );
  }
  if (!next.includes('this.battleActorStickyCombatHoldUntilMs.clear();')) {
    next = next.replace(
      /(this\.battleActorStickyCombatPositions\.clear\(\);\s*)/,
      `$1this.battleActorStickyCombatHoldUntilMs.clear();
          `,
    );
    if (!next.includes('this.battleActorStickyCombatHoldUntilMs.clear();')) {
      throw new Error('preview melee root-motion patch marker not found: sticky contact hold reset');
    }
  }
  return next;
}

const importMap = readJson(IMPORT_MAP_PATH);
const rendererFile = chunkFileFor(importMap, RENDERER_SPECIFIER);
const before = readFileSync(rendererFile, 'utf8');
const after = patchRenderer(before);
if (after !== before) {
  writeFileSync(rendererFile, after, 'utf8');
  console.log('preview melee contact root-motion repair patched files: 1');
} else {
  console.log('preview melee contact root-motion repair patched files: 0');
}
