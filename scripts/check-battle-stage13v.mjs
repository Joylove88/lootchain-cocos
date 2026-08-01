import { existsSync, readFileSync } from 'node:fs';

let ok = true;

function read(path) {
  if (!existsSync(path)) {
    console.error(`missing file: ${path}`);
    ok = false;
    return '';
  }
  return readFileSync(path, 'utf8');
}

function expectToken(text, token, label) {
  if (!text.includes(token)) {
    console.error(`missing ${label}: ${token}`);
    ok = false;
  }
}

function expectNoToken(text, token, label) {
  if (text.includes(token)) {
    console.error(`forbidden ${label}: ${token}`);
    ok = false;
  }
}

const battle = read('assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts');
const state = read('assets/scripts/scenes/lobby/LobbyBattleState.ts');
const action = read('assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts');
const timeline = read('assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts');
const formation = read('assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts');
const runtime = read('assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts');
const screenshot = read('scripts/screenshot-battle-center-convergence.cjs');
const formationSwitchScreenshot = read('scripts/screenshot-formation-switch.cjs');
const repair = read('scripts/repair-preview-stage13v.mjs');
const repairMeleeContact = read('scripts/repair-preview-melee-contact-root-motion.mjs');
const packageText = read('package.json');
const context = read('docs/current-chat-context.md');

expectToken(battle, "LOBBY_BATTLE_SCENE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'horizontal battle background');
expectToken(battle, "LOBBY_BATTLE_SCENE_GROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'horizontal ground layer');
expectToken(battle, "LOBBY_BATTLE_SCENE_FOREGROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'horizontal foreground layer');
expectToken(battle, 'addBattleBackgroundSprite', 'resources background is loaded before embedded fallback');
expectToken(battle, 'applyBattleBackgroundAssetWhenReady', 'embedded fallback upgrades to resource background when the SpriteFrame finishes loading');
expectToken(battle, 'resources.load(LOBBY_BATTLE_SCENE_BG_ASSET, SpriteFrame', 'battle background has a direct resource load path for the full-screen scene');
expectToken(battle, 'isBattleBackgroundAssetLoadedForTelemetry', 'battle scene reuse waits until the resource background is actually loaded');
expectToken(battle, 'LOBBY_BATTLE_EMBEDDED_BG_DATA_URL', 'embedded fallback remains available for stale Preview');
expectToken(state, 'LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 3', 'post-convergence delay lets melee_move play before basic attack');
expectToken(battle, 'BATTLE_OPENING_ENTRY_DISTANCE_RATIO = 0.96', 'side-entry opening starts from visible battle lines');
expectToken(battle, 'BATTLE_OPENING_LANE_ENTRY_RATIOS = [0.94, 1.08, 1.0, 1.18, 1.24]', 'per-lane side-entry opening distances');
expectToken(battle, 'const homePull = slot.lane <= 2 ? 0.62 : 0.58;', 'combat homes move closer to center before target-front melee');
expectToken(battle, 'const maxSideX = Math.max(minSideX, slot.width * 1.48);', 'converged side lanes keep x-depth without leaving melee too far from targets');
expectToken(battle, 'const converged = this.resolveActorConvergedCombatPosition(slot, enemy, scale);', 'opening offset resolves from converged combat home');
expectToken(battle, 'BATTLE_ACTOR_MELEE_APPROACH_MS = 1500', 'melee approach uses readable horizontal RPG run timing');
expectToken(battle, 'BATTLE_ACTOR_FRAME_MAX_DELTA = 42', 'actor display position clamps compressed timeline jumps under the no-teleport threshold');
expectToken(battle, 'resolveBattleActorDisplayedFramePosition', 'actor display position is smoothed before telemetry and rendering');
expectToken(battle, 'battleActorStickyCombatPositions', 'melee actors keep their target-front contact position instead of returning home');
expectToken(battle, 'const stickyContactPosition = this.battleActorStickyCombatPositions.get(unit.unitKey);', 'actor root motion starts from the last melee contact point');
expectToken(battle, 'this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(targetPosition.x, targetPosition.y, 0));', 'actor contact position is persisted after reaching the target front');
expectToken(battle, 'this.battleActorStickyCombatPositions.clear();', 'sticky melee contact positions reset between battle playback sessions');
expectToken(battle, 'BATTLE_ACTOR_BASIC_ATTACK_APPROACH_MS = 640', 'basic attack has enough approach time to avoid snap movement');
expectToken(battle, 'BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS = 260', 'basic attack keeps run phase briefly after contact before strike');
expectToken(battle, 'BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520', 'basic attack holds the attacker at target-front contact until damage/hit windows finish');
expectToken(battle, 'BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR = 1', 'root motion reaches contact on the cue timeline before damage frames');
expectToken(battle, 'playbackTimelineTimeMs - cue.timeMs + this.resolveBattleActorRootMotionStartLeadMs(cue)', 'root motion is no longer slowed by compressed presentation ratio and can start before the hit window');
expectToken(battle, 'const approachMs = this.resolveBattleActorBasicAttackApproachMs(cue);', 'basic attack resolves approach duration before contact hold');
expectToken(battle, "if (cue.kind === 'basic_attack') {\n      return false;\n    }", 'basic attack no longer drives run/root-motion; melee_move owns the approach');
expectToken(battle, "currentActionCue?.kind === 'damage_float'", 'damage frame forces attack animation instead of run');
expectToken(action, 'melee_move: 2480', 'melee_move cue is long enough to show run before attack');
expectToken(action, 'timeOffsetMs: 1420', 'basic attack starts after melee run reaches the target-front lane and before damage float');
expectToken(timeline, 'timeMs: roundStart + 3_900', 'damage float waits long enough for SR/R skill0 basic attack to play at target-front contact');
expectToken(timeline, 'timeMs: roundStart + 4_250', 'hit reaction waits until after the basic attack impact');
expectNoToken(timeline, 'timeMs: roundStart + 2_120', 'old damage timing still skipped visible target-front SR/R skill0 contact');
expectNoToken(timeline, 'timeMs: roundStart + 2_420', 'old hit timing still skipped visible target-front SR/R skill0 contact');
expectNoToken(timeline, 'timeMs: roundStart + 1_720', 'old damage timing skipped visible SR/R skill0 attack');
expectNoToken(timeline, 'timeMs: roundStart + 1_980', 'old hit timing skipped visible SR/R skill0 attack');
expectNoToken(action, 'timeOffsetMs: 680', 'old basic attack timing could still cut off visible SR/R run before contact');
expectNoToken(action, 'timeOffsetMs: 420', 'old basic attack timing cut off visible SR/R run before contact');
expectNoToken(action, 'timeOffsetMs: 860', 'old basic attack timing still gave too few SR/R attack frames');
expectNoToken(action, 'timeOffsetMs: 940', 'old basic attack timing could still switch to attack before display reached contact');
expectNoToken(action, 'timeOffsetMs: 1280', 'old basic attack timing started after the damage float and hid SR/R skill0');
expectNoToken(action, 'timeOffsetMs: 2280', 'old basic attack timing happened after damage float');
expectToken(action, 'resolveBattleActionCueVisibleWindowMs', 'action cue visibility uses explicit windows');
expectToken(action, 'timelineToPresentationRatio = 1', 'action cue visibility accepts timeline compression ratio');
expectToken(action, 'resolveTimelineWindowMs', 'action cue visibility expands cue windows into timeline time');
expectToken(action, 'const aStarted = a.timeMs <= timeMs;', 'action cue visibility prefers cues that have started');
expectToken(action, 'const recencyDelta = b.timeMs - a.timeMs;', 'action cue visibility prefers newer overlapping cues');
expectNoToken(action, 'return distanceDelta || preferredDelta || b.timeMs - a.timeMs || a.eventSeq - b.eventSeq;', 'old action cue sort kept melee_move over basic_attack');
expectToken(battle, 'resolveVisibleBattleActionPresentationCue(actionCues, currentTimelineEvent, playbackTimelineTimeMs, timelineToPresentationRatio)', 'battle renderer passes timeline compression ratio into action cue visibility');
expectToken(battle, 'BATTLE_MELEE_DUEL_CONTACT_GAP_RATIO = 0.035', 'melee contact gap uses close target-front tuning');
expectToken(battle, 'BATTLE_MELEE_DUEL_DEFENDER_STEP_RATIO = 0.1', 'defender visibly steps forward so both sides meet before melee attacks');
expectToken(battle, 'BATTLE_MELEE_ATTACKER_FOOTPRINT_RATIO', 'melee contact considers attacker footprint');
expectToken(battle, 'BATTLE_MELEE_TARGET_FOOTPRINT_RATIO', 'melee contact considers target footprint');
expectToken(battle, '24 * scale', 'melee target-front contact is close enough for visible strike range');
expectToken(battle, '56 * scale', 'melee target-front contact max gap stays within close-combat range');
expectToken(battle, '38 * scale', 'melee defender has a visible minimum meet-up step');
expectToken(battle, '104 * scale', 'boss defender meet-up step remains bounded');
expectToken(battle, 'const combatPlaybackActive = presentation.phase ===', 'combat playback hides idle unit nameplates to reduce visual clutter');
expectToken(battle, 'resolveActorMeleeDuelFrame', 'melee contact point is target-front duel frame');
expectToken(battle, 'defenderDuelPosition', 'defender steps into melee duel frame');
expectToken(battle, 'resolveBattleActorBasicAttackApproachMs', 'legacy basic_attack approach helper remains bounded');
expectToken(battle, 'isBattleActorCueApproaching', 'approach phase drives run animation before strike');
expectToken(battle, 'resolveBattleUnitBasicAttackCueName', 'melee actors play their rarity-specific basic attack after reaching target-front contact');
expectToken(battle, "cue.kind === 'damage_float'", 'damage frame can hold the attacker at target-front contact instead of snapping home');
expectToken(battle, 'const targetMeetMotion = false;', 'defender is no longer pulled by stale root motion and only uses hit recoil');
expectToken(battle, 'BATTLE_ACTOR_ATTACK_RETURN_MS = 1680', 'melee return is long enough to prevent snap-back');
expectToken(battle, 'renderBattleFieldEnvironment(field, fieldRect.width, fieldRect.height, scale)', 'battle preview field uses environment layers');
expectToken(battle, 'LobbyBattleFieldEnvironmentVeil', 'battle field uses a light veil instead of repeating the full scene background');
expectToken(battle, 'renderBattleSceneEnvironmentLayers(sceneRoot, sceneWidth, sceneHeight, scale)', 'full battle scene uses environment layers');
expectToken(battle, 'LOBBY_BATTLE_SCENE_GROUND_ASSET !== LOBBY_BATTLE_SCENE_BG_ASSET', 'full scene skips duplicate ground when it reuses the same background asset');
expectToken(battle, 'LOBBY_BATTLE_SCENE_FOREGROUND_ASSET !== LOBBY_BATTLE_SCENE_BG_ASSET', 'full scene skips duplicate foreground when it reuses the same background asset');
expectToken(battle, 'drawBattleFallbackLandscape(sceneRoot, sceneWidth, sceneHeight, scale, false)', 'full battle scene has fallback landscape');
expectNoToken(battle, 'LobbyBattleFieldBackgroundSprite', 'battle field must not repeat the full-screen background inside the field');
expectNoToken(battle, 'BATTLE_OPENING_CENTER_CONVERGENCE_RATIO', 'old center-convergence opening');
expectNoToken(battle, "LOBBY_BATTLE_SCENE_BG_ASSET: string = 'ui/battle/stage13x/boundary_battle_bg/spriteFrame'", 'old boundary battle background');
expectNoToken(battle, 'sameEventCues.slice(0, 2)', 'old assist batch floating text');
expectNoToken(battle, 'const activeAssistFloatCue = sameEventCues[0];', 'old assist same-event float selector');
expectNoToken(battle, 'LobbyBattleAssistFloatCaption_', 'assist captions that clutter combat numbers');
expectNoToken(battle, 'LobbyBattleStage12SceneGuide', 'old report-like stage guide overlay');

expectToken(runtime, 'R: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18', 'R battle profile scales act skeletons to match other heroes');
expectToken(runtime, 'SR: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18', 'SR battle profile scales act skeletons to match other heroes');
expectToken(runtime, 'FORMATION_PREVIEW: { targetHeightRatio: 1.42, maxWidthRatio: 3.35, minScale: 0.058, maxScale: 2.72', 'formation profile normalizes SR/R preview skeletons');
expectToken(runtime, "unit?.scaleProfile === 'FORMATION_PREVIEW'", 'formation preview has its own actor scale cap');
expectToken(runtime, 'BATTLE_STAGE12_FORMATION_PREVIEW_HEIGHT_RATIO_BY_ASSET', 'formation preview has asset-level scale overrides');
expectToken(runtime, 'act_1028: 1.32', 'formation preview compensates SR_WITCH_03 act_1028 visual body');
expectToken(runtime, 'Eulenspigel: 0.272', 'formation preview reduces oversized SSR_RON by the requested 20%');
expectToken(runtime, 'Ishmael: 0.528', 'formation preview enlarges SSR_KANE by the requested 10%');
expectToken(runtime, 'Nuu: 0.43', 'formation preview keeps oversized UR_EVELYN visually aligned');
expectToken(runtime, 'resolveBattleUnitFormationPreviewMaxHeightRatio', 'formation preview resolves per-asset visual height');
expectToken(runtime, 'BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO = 0.84', 'SR/R battle raw skeletons are capped to a readable horizontal RPG size');
expectToken(runtime, 'const maxVisualHeight = slotHeight * BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO;', 'large SR/R battle raw skeletons use the shared readable cap');
expectNoToken(runtime, 'const maxVisualHeight = slotHeight * 1.28;', 'old SR/R battle cap made small SR actors look too small');
expectNoToken(runtime, 'const maxVisualHeight = slotHeight * 1.58;', 'old SR/R battle cap still left SR actors smaller than the UR/SSR group');
expectNoToken(runtime, 'const maxVisualHeight = slotHeight * 1.72;', 'old SR/R battle cap made SR/R actors cover too much of the field');
expectNoToken(runtime, 'const maxVisualHeight = slotHeight * 1.34;', 'old SR/R battle cap made SR/R actors cover too much of the field');
expectToken(runtime, 'BATTLE_FORMATION_DEFAULT_MAX_HEIGHT_RATIO = 0.48', 'formation preview has a shared visual actor height cap');
expectToken(runtime, 'BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO = 0.56', 'SR/R formation preview is visually aligned with named heroes');
expectToken(runtime, 'const assetRatio = primaryAsset ? BATTLE_STAGE12_FORMATION_PREVIEW_HEIGHT_RATIO_BY_ASSET[primaryAsset] : undefined;', 'formation preview applies asset compensation before rarity cap');
expectToken(runtime, 'if (assetRatio !== undefined)', 'formation preview does not ignore SR/R asset-level compensation');
expectToken(runtime, 'resolveBattleUnitSpineEffectiveRawSize', 'SR/R act skeletons normalize inflated runtime bounds');
expectToken(runtime, 'isBattleUnitSpineEffectInflatedActBounds', 'inflated act_* bounds are detected before scale fitting');
expectToken(runtime, 'resolveBattleUnitSpineTelemetryVisualHeight', 'telemetry reports normalized visual height for inflated act skeletons');
expectToken(runtime, 'resolveBattleUnitSpineNodePosition', 'spine runtime bounds offset is normalized to the stand foot point');
expectToken(battle, 'resolveBattleUnitSpineNodePosition(runtimeData, spineScale, height, unit, enemy)', 'battle actor spine node is aligned from runtime bounds');

expectToken(formation, "FORMATION_BATTLE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'formation uses horizontal battle background');
expectToken(formation, "FORMATION_BATTLE_GROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame'", 'formation uses horizontal battle ground');
expectToken(formation, 'const standWidth = Math.min(330 * scale, width * 0.46);', 'formation stand width keeps enlarged actors readable without overlapping');
expectToken(formation, 'const standHeight = Math.min(430 * scale, height * 0.82);', 'formation stand height large enough for normalized actors');
expectToken(formation, 'const visualWidth = width * 2.36;', 'formation spine visual width is enlarged');
expectToken(formation, 'const visualHeight = height * 2.28;', 'formation spine visual height is enlarged');
expectToken(formation, 'const actorNameFontSize = 16 * scale;', 'formation actor name font is enlarged for readability');
expectToken(formation, 'const actorSubFontSize = 11.5 * scale;', 'formation actor metadata font is enlarged for readability');
expectToken(formation, "scaleProfile: 'FORMATION_PREVIEW'", 'formation actors use formation-specific scale profile');
expectToken(formation, 'resolveBattleUnitSpineNodePosition(runtimeData, spineScale, height, unit, false)', 'formation actor spine node is aligned from runtime bounds');
expectToken(formation, 'data, width, height, scale, unit, resourcePath', 'formation spine scale must resolve from actor stand bounds');
expectNoToken(formation, 'data, visualWidth, visualHeight, scale, unit, resourcePath', 'formation spine scale must not use oversized visual bounds');
expectToken(formation, 'recordFormationActorResolvedVisualTelemetry', 'formation records actual resolved SR/R visual height');
expectToken(formation, 'srRVisuals: sameSelection', 'formation preserves resolved SR/R visual telemetry while the same formation remains open');

expectToken(screenshot, 'maxFrameDeltaLimit = 126', 'screenshot detects snap/drift movement while allowing visible melee dash contact');
expectToken(screenshot, '!summary.backgroundTelemetryPresent', 'screenshot fails when background telemetry is absent');
expectToken(screenshot, "!['asset', 'embedded'].includes(summary.backgroundSource)", 'screenshot requires an image-backed background');
expectToken(battle, 'previous?.loaded === true && loaded !== true', 'successful background telemetry must not be overwritten by later failed resource attempts');
expectToken(screenshot, 'homeLineGapMin < 180', 'screenshot rejects face-to-face battle lines that overlap too much');
expectToken(screenshot, 'homeLineGapMin > 420', 'screenshot rejects face-to-face battle lines that drift too far apart');
expectToken(screenshot, 'openingFaceGapMedian > 360', 'screenshot requires opening run to reach face-to-face combat');
expectToken(screenshot, 'postActionIdleVerticalDriftMax > 54', 'screenshot rejects post-action idle lane jumping');
expectToken(screenshot, 'const meleeContactRange = 380', 'screenshot checks sustained clash contact with visual footprint');
expectToken(screenshot, 'srRSpineVisualHeightMin', 'screenshot checks SR/R battle visual height');
expectToken(screenshot, 'srRSpineVisualHeightRatio', 'screenshot checks SR/R height spread');
expectToken(screenshot, 'srSpineVisualHeightMedian', 'screenshot checks SR visual height independently');
expectToken(screenshot, 'rSpineVisualHeightMedian', 'screenshot checks R visual height independently');
expectToken(screenshot, 'srRarityHeightRatio', 'screenshot checks SR/R same-rarity family height alignment');
expectToken(formationSwitchScreenshot, 'formation regular realistic actor heights are not visually aligned', 'formation screenshot rejects visually uneven regular realistic actor sizes');
expectToken(formationSwitchScreenshot, 'formation Eulenspigel actor is still too dominant', 'formation screenshot rejects oversized Eulenspigel visual mass');
expectToken(formationSwitchScreenshot, 'formation Ishmael actor is too small after requested 10% enlargement', 'formation screenshot rejects undersized SSR_KANE visual mass');
expectToken(formationSwitchScreenshot, 'formation stylized actor heights are not visually aligned', 'formation screenshot rejects visually uneven stylized actor sizes');
expectToken(formationSwitchScreenshot, 'formation SR_WITCH_03 / act_1028 visual compensation is too small', 'formation screenshot rejects tiny Contract Witch visual scale');
expectToken(screenshot, 'basicAttackRootMotionSampleCount', 'screenshot records melee_move-established target-front contact before basic_attack');
expectToken(screenshot, 'srRBasicAttackHomeSnapCount', 'screenshot fails if SR/R basic attack snaps back near home before strike');
expectToken(screenshot, 'srRDamageContactHoldSampleCount', 'screenshot fails if damage floats after attacker already left target-front contact');
expectToken(screenshot, 'srRDamageHomeSnapCount', 'screenshot records whether SR/R damage frames stay around the clash line');
expectToken(screenshot, 'estimateSrRActorVisualHeight', 'screenshot normalizes inflated SR/R act visual height');
expectToken(screenshot, 'isInflatedSrRActBounds', 'screenshot detects inflated SR/R act bounds');
expectToken(screenshot, 'resolveForcedMixedBattleFormation', 'screenshot can force a mixed named Spine plus act Spine battle team');
expectToken(screenshot, 'requireMixedScale', 'screenshot can enforce mixed battle actor visual scale');
expectToken(screenshot, 'allySpineVisualHeightMin', 'screenshot checks all ally battle visual heights');
expectToken(screenshot, 'allySpineVisualWidthMax', 'screenshot checks all ally battle visual widths');
expectToken(screenshot, 'maxAllFloatingTextsPerFrame', 'screenshot checks floating text clutter');
expectToken(screenshot, 'srRBasicAttackAdvanceMedian', 'screenshot checks melee approach distance');
expectToken(screenshot, 'srRBasicAttackMedianDistance', 'screenshot checks target-front contact');
expectToken(screenshot, 'allMeleeBasicAttackContactMedian', 'screenshot checks all melee target-front contacts');
expectToken(screenshot, 'allMeleeDamageContactSampleCount', 'screenshot checks all melee damage frames at target-front contact');
expectToken(screenshot, 'maxPersistentFloatingTextLayers', 'screenshot checks floating text layer cleanup');
expectToken(screenshot, 'targetMeetSampleCount', 'screenshot checks target meet motion');

expectToken(repair, 'patchBattleCathedralBackgroundAssets', 'preview repair keeps current battle background');
expectToken(repair, 'patchPreviewBackgroundTelemetry', 'preview repair records resource-backed background only when addSprite succeeds');
expectToken(repair, "backgroundTelemetry.background = {\n                source: 'asset'", 'preview repair upgrades stale chunks from asset/false to asset/true after real Sprite creation');
expectToken(repair, 'battle_scene_cathedral/spriteFrame', 'preview repair patches stale chunks to the loaded horizontal battle background');
expectToken(repair, 'var aStarted = a.timeMs <= timeMs;', 'preview repair patches started-cue priority');
expectToken(repair, 'var recencyDelta = b.timeMs - a.timeMs;', 'preview repair patches newer overlapping cue priority');
expectNoToken(repair, 'return distanceDelta || preferredDelta || b.timeMs - a.timeMs || a.eventSeq - b.eventSeq;', 'preview repair must not restore old action cue sort');
expectToken(repair, "scaleProfile: 'FORMATION_PREVIEW'", 'preview repair forces formation scale profile');
expectToken(repair, 'R: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18', 'preview repair keeps current R act skeleton scale');
expectToken(repair, 'SR: { targetHeightRatio: 1.34, maxWidthRatio: 2.55, minScale: 0.052, maxScale: 2.18', 'preview repair keeps current SR act skeleton scale');
expectToken(repair, 'var maxVisualHeight = slotHeight * 0.84;', 'preview repair caps oversized SR/R combat actors');
expectToken(repair, "return primaryAsset === 'act_1028' ? 1.32 : primaryAsset === 'Eulenspigel' ? 0.272 : primaryAsset === 'Ishmael' ? 0.528 : primaryAsset === 'Nuu' ? 0.43 : tier === 'SR' || tier === 'R' ? 0.56 : 0.48;", 'preview repair keeps formation actors at a visually tuned height');
expectToken(repair, "BATTLE_MELEE_CONTACT_GAP_RATIO = 0.035;", 'preview repair keeps target-front melee contact close');
expectToken(repair, '24 * scale, 56 * scale', 'preview repair keeps close contact clamp');
expectToken(repair, 'BATTLE_MELEE_DEFENDER_STEP_RATIO = 0.1;', 'preview repair keeps visible defender meet-up motion');
expectToken(repair, '38 * scale, currentActionCue.targetRole ===', 'preview repair keeps defender meet-up clamp visible');
expectToken(repair, 'patchBattleFieldEnvironmentOverlay', 'preview repair removes stale repeated battle-field backgrounds');
expectToken(repair, 'LobbyBattleFieldEnvironmentVeil', 'preview repair uses a light field veil for stale chunks');
expectToken(repair, 'patchBattleSceneEnvironmentDuplicateLayers', 'preview repair removes stale repeated full-scene background layers');
expectToken(repair, 'formation debug resolved visual height', 'preview repair backfills SR/R formation visual telemetry for stale chunks');
expectToken(repair, 'Math.max(0.82, timelineToPresentationRatio)', 'preview repair keeps melee root motion from lagging behind compressed timeline playback');
expectToken(repair, "return rarity === 'SR' || rarity === 'R' ? 'skill0' : 'atk';", 'preview repair keeps melee actors on rarity-specific basic attack after contact');
expectToken(repair, "replaceAll('timeOffsetMs: 940', 'timeOffsetMs: 1420')", 'preview repair moves stale basic attack timing after visible melee contact');
expectNoToken(repair, 'targetHeightRatio: 1.58', 'preview repair must not restore oversized SR/R target height');
expectNoToken(repair, 'slotHeight * 1.72', 'preview repair must not restore oversized SR/R battle cap');
expectNoToken(repair, 'slotHeight * 1.34', 'preview repair must not restore previous oversized SR/R battle cap');
expectNoToken(repair, "? 0.86", 'preview repair must not restore old SR/R formation cap');
expectToken(repair, "cue.kind === 'melee_move' || cue.kind === 'ranged_projectile'", 'preview repair keeps only explicit movement cues in root motion');
expectToken(repair, 'var targetMeetMotion = false;', 'preview repair prevents defender/basic_attack stale root motion from pulling units');
expectToken(repairMeleeContact, 'linkedDuelWindowMs', 'melee contact repair keeps melee_move root motion active through the linked duel window');
expectToken(repairMeleeContact, 'this.battleActorStickyCombatPositions = new Map();', 'melee contact repair adds sticky contact position cache to stale chunks');
expectToken(repairMeleeContact, 'this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(targetPosition.x, targetPosition.y, 0));', 'melee contact repair persists target-front contact in stale chunks');
expectToken(repairMeleeContact, 'this.battleActorStickyCombatPositions.clear();', 'melee contact repair resets sticky contact positions between sessions');
expectToken(repairMeleeContact, 'var targetMeetMotion = false;', 'melee contact repair prevents stale basic_attack root-motion ownership');
expectToken(repairMeleeContact, 'Math.max(96 * scale, BATTLE_ACTOR_FRAME_MAX_DELTA * 1.02 * scale)', 'melee contact repair keeps root-motion frame smoothing inside anti-snap threshold');
expectToken(repairMeleeContact, "cue.kind === 'melee_move' || cue.kind === 'ranged_projectile'", 'melee contact repair keeps run movement on melee_move/ranged cues only');
expectToken(packageText, '"check:battle-stage13v": "node ./scripts/check-battle-stage13v.mjs"', 'package check script');
expectToken(packageText, '"repair:preview-stage13v": "node ./scripts/repair-preview-stage13v.mjs"', 'package repair script');
expectToken(packageText, '"repair:preview-melee-contact-root-motion": "node ./scripts/repair-preview-melee-contact-root-motion.mjs"', 'package melee contact repair script');
expectToken(context, 'Stage 13', 'current context records battle stage work');

if (!ok) {
  process.exit(1);
}

console.log('battle-stage13v ok');
