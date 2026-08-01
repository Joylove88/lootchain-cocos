import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative) {
  const file = path.join(ROOT, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const errors = [];
const renderer = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const actionPresentation = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const replay = read('assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts');
const hp = read('assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts');
const previewRepair = read('scripts/repair-preview-battle-soonfx-root-motion.mjs');
const packageJson = JSON.parse(read('package.json') || '{}');

for (const token of [
  'const BATTLE_ENABLE_FRONT_CLASH_CHARGE = false',
  'const BATTLE_ENABLE_IDLE_CLASH_COMBAT = false',
  'const BATTLE_STICKY_CONTACT_HOLD_MS = 60_000',
  'battleActorMotionStartPositions',
  'const targetMeetMotion = false;',
  'resolveBattleActorMotionStartPosition',
  'previousFramePosition ?? stickyContactPosition ?? fallbackHomePosition',
  'BATTLE_USE_STICKY_CONTACT_POSITIONS && stickyContactPosition',
  'Date.now() + BATTLE_STICKY_CONTACT_HOLD_MS',
  'BATTLE_ACTOR_ROOT_MOTION_LEAD_MS = 1200',
  'BATTLE_ACTOR_ROOT_MOTION_FRAME_MAX_DELTA = 44',
  'resolveBattleActorRootMotionStartLeadMs',
  'resolveBattleActorVisibleMeleeCueLungeOffset',
  'const motionLeadMs = this.resolveBattleActorRootMotionStartLeadMs(cue)',
  'playbackTimelineTimeMs - cue.timeMs + this.resolveBattleActorRootMotionStartLeadMs(cue)',
  'const sameActionSeq = typeof cue.actionSeq ===',
  'return sameActionSeq && (sameActionDuel || reversedHitDuel)',
  'Other units must keep approaching during an unrelated hit frame',
  'return true;',
  'const rawActionLaneOffset = this.resolveBattleActionLaneOffset(currentActionCue, scale)',
  'const actionLaneOffset = rawActionLaneOffset * BATTLE_GROUND_ACTION_LANE_Y_SCALE',
  'const contactSlotXOffset = clamp(rawActionLaneOffset * 0.22, -32 * scale, 32 * scale)',
  'const duelCenterX = (source.x + target.x) / 2 + contactSlotXOffset',
  'return { x: 0, y: 0 };',
  'const meleeMeetOffset = currentActionCue.actorRole !== \'back\'',
  'x: meleeMeetOffset.x + recoilX',
  'const telemetryCue = currentActionCue ?? rootMotionCue',
  'const targetShouldMeetFromHome = currentActionCue?.targetKey === unit.unitKey',
  '&& stickyContactPosition && !targetShouldMeetFromHome',
  'const yOffsets = [0, 126, -126, 186, -186]',
  'BATTLE_USE_STICKY_CONTACT_POSITIONS && this.battleActorStickyCombatPositions.has(unit.unitKey)',
  'return this.clampBattleActorFramePosition(position, scale)',
  'const yOffsets = [0, 0, 0, 0, 0]',
  'const xOffsets = [0, -160, 160, -260, 260]',
  'resolveBattleStableUnitLaneIndex',
  'const homePull = slot.lane <= 2 ? 0.62 : 0.58',
  'const minSideX = Math.max(208 * scale, slot.width * 0.78)',
]) {
  if (!renderer.includes(token)) {
    errors.push(`LobbyBattlePreviewPanelRenderer.ts missing SoonFx motion token: ${token}`);
  }
}

if (renderer.includes('Date.now() + 2400')) {
  errors.push('LobbyBattlePreviewPanelRenderer.ts still uses the old short sticky contact hold');
}

if (/if\s*\(\s*rootMotionCue\s*\)\s*\{[\s\S]{0,220}?battleActorFramePositions\.set\(unitKey,\s*next\);[\s\S]{0,80}?return next;/m.test(renderer)) {
  errors.push('LobbyBattlePreviewPanelRenderer.ts still bypasses frame smoothing for root motion cues');
}

for (const token of [
  'actionSeq?: number',
  'actionSeq: action.seq',
  'actionSeq: event.seq',
]) {
  if (!actionPresentation.includes(token)) {
    errors.push(`LobbyBattleActionPresentation.ts missing action ownership token: ${token}`);
  }
}

for (const token of [
  'interface BattleReplayHitEvent',
  'hpBefore',
  'hpAfter',
  'killed',
  'deadAtMs',
  'isBattleReplayUnitAlive(units, unit.unitKey)',
  'selectBattleReplayTarget',
  'const preferredTargets = actor.role === \'back\'',
  'resolveBattleReplayMeleePreferredTargets',
  'const localFrontTargets = frontTargets.filter',
  'frontTargets.length > 0',
  'Math.abs(unit.slot - actor.slot) <= 1',
  'resolveBattleReplayTargetSlotDistance',
  'const targetPool = focusFront.length > 0 ? focusFront : preferredTargets',
  'if (actor.role !== \'back\')',
  'return targetPool[0] ?? null',
  'targetState.dead',
]) {
  if (!replay.includes(token)) {
    errors.push(`LobbyBattleReplayModel.ts missing real model token: ${token}`);
  }
}

for (const token of [
  'appliedHitKeys',
  'hit.hpBefore',
  'hit.hpAfter',
  'target.dead',
]) {
  if (!hp.includes(token)) {
    errors.push(`LobbyBattlePresentationHp.ts missing hit-driven HP token: ${token}`);
  }
}

if (packageJson.scripts?.['check:battle-soonfx-model'] !== 'node ./scripts/check-battle-soonfx-model.mjs') {
  errors.push('package.json missing check:battle-soonfx-model script');
}

if (packageJson.scripts?.['repair:preview-battle-soonfx-root-motion'] !== 'node ./scripts/repair-preview-battle-soonfx-root-motion.mjs') {
  errors.push('package.json missing repair:preview-battle-soonfx-root-motion script');
}

if (!previewRepair.includes('retired; refresh Cocos Creator Preview')) {
  errors.push('repair-preview-battle-soonfx-root-motion.mjs should be retired instead of patching stale root motion');
}

for (const token of [
  'var targetMeetMotion = cue.targetKey === unit.unitKey && cue.kind === \'melee_move\';',
  'return this.resolveActorDefenderMeetOffset(currentActionCue, anchors, scale) ||',
]) {
  if (previewRepair.includes(token)) {
    errors.push(`repair-preview-battle-soonfx-root-motion.mjs still restores stale motion token: ${token}`);
  }
}

if (errors.length > 0) {
  console.error(`battle-soonfx-model guard failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('battle-soonfx-model guard passed.');
