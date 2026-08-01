import http from 'node:http';
import { existsSync } from 'node:fs';

const PREVIEW_ORIGIN = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456';
const IMPORT_MAP_URL = `${PREVIEW_ORIGIN}/scripting/x/import-map.json`;
const ENGINE_IMPORT_MAP_URL = `${PREVIEW_ORIGIN}/scripting/engine/bin/.cache/dev/preview/import-map.json`;
const LOCAL_PREVIEW_IMPORT_MAP = 'temp/programming/packer-driver/targets/preview/import-map.json';
const FORBIDDEN_CHUNK_TOKENS = {
  'assets/scripts/api/BattleApi.ts': ['REAL_MAINLINE_R394', 'BATTLE_MAINLINE_R394', 'PHASE6_REAL_BATTLE_R394', 'R394_MAIN_25_17', 'MAIN_25_17:'],
  'assets/scripts/types/BattleTypes.ts': ["'REAL_MAINLINE_R394'", 'REAL_MAINLINE_R394'],
  'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts': [
    'LobbyBattleHitBurstSprite',
    'snapshot.stage2UiAssets.hitBurst',
  ],
  'assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts': [
    'actionStarts',
    'resolveReplayIncomingDamageByUnit',
    'resolveBattleReplayUnitMaxHp(unit, incomingDamage)',
  ],
};

const REQUIRED_CHUNKS = [
  {
    source: 'assets/scripts/scenes/AdaptiveStageLayoutResolver.ts',
    tokens: ['viewportWidth', 'viewportHeight', 'runtimeWindowSize'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyHudRenderer.ts',
    tokens: ['renderMicroLobbyHud', 'isMicroViewport', 'createSizedUiNode', 'Math.max(widthUnit, heightUnit), 1, 4', 'LobbyMicroActionBar', 'LobbyGoalTracker', 'LobbyCompactGoalTracker', 'LobbyMicroGoalChip', 'currentLobbyBattleState', 'openLobbyBagPanel', 'SHOW_LOBBY_WORLD_CHAT = false', 'SHOW_LOBBY_RIGHT_CHALLENGE_RAIL = false', 'openLobbyBattleMapFromDungeonEntry', '已进入关卡地图；战斗胜利后自动提交结算', "label: '挑战'", '自动提交结算并发放奖励', '召唤祭坛按后端卡池状态开放真实召唤；当前仅开放 draw，兑换和补发关闭。', 'entries.filter((_, index) => index !== 4)'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyHudConfig.ts',
    tokens: ['LOBBY_ACTIVITY_ITEMS', '深渊召唤', '真实召唤'],
  },
  {
    source: 'assets/scripts/scenes/LootChainGameRoot.ts',
    tokens: ['selectLobbyAdventureStage', 'previewLockedLobbyAdventureStage', 'findLobbyAdventureStage', 'ANNUAL_MAINLINE_TOTAL_STAGES = 393', 'isAnnualMainlineStage(stage.stageCode)', 'canOpenLobbyBattleEntryStage(stage', 'this.previewLockedLobbyAdventureStage(this.selectedLobbyStageCode)', 'this.selectedLobbyStageCode = resolvedStageCode', 'fillLobbyFormationWithDefaultHeroes', 'fillDefaultFormationForDirectChallenge', 'resolveDefaultFilledLobbyFormationHeroIds', 'resolveDefaultFilledLobbyFormationHeroIds(this.selectedLobbyFormationHeroIds)', 'LobbyFeatureSceneBackdrop', 'renderLobbyFeatureSceneBackdrop', 'LobbyPlaceholderSceneRoot', 'LobbyPlaceholderScenePanel', 'LobbyPlaceholderBackButton', 'renderSceneBackButton', 'panel.addComponent(BlockInputEvents)', 'renderLobbyScenePage', 'LOGIN_SCENE_BACKGROUND_NODE_NAMES', 'LOGIN_SCENE_LEGACY_NODE_NAMES', 'stageNode.active = false', 'setLoginSceneStageVisible', 'tryPlayLoginSceneVideo', 'resumeForLoginView', 'isLobbyScenePageView', 'returnToLobbyFromScenePage', 'renderGachaResultScene', 'renderGachaSummonVideoScene', 'PendingGachaDraw', 'pendingGachaDraw', "this.currentView = 'gachaSummon'", 'executeGachaDrawBeforeVideo', "paymentMode: 'AUTO'", 'presentPendingGachaDrawVideo', 'finishGachaSummonVideoScene', 'presentPendingGachaDrawFailure(ticket: number, message: string)', 'presentPendingGachaDrawResult', 'resolveGachaDrawResultHighestRarity', 'gachaSummonRarity', 'this.pendingGachaDraw = { ticket, mode, poolCode: pool.poolCode, drawCount, requestId, result: null, highestRarity: null };', 'primaryCostType: pool.primaryCostType ?? null,', 'backupCostCode: pool.backupCostCode ?? null,', 'renderGachaActionScene', 'openGachaActionScene(action', 'closeGachaActionScene', 'loadGachaPoolDetail(poolCode', 'loadGachaLogs(force', 'refreshReadonlyAssetsAfterGacha', 'isVisibleGachaPool(pool: GachaPreviewPool)', "displayType !== 'HIDDEN'", "theme !== 'hidden'", 'drawEnabled: pool.drawEnabled === true && !pool.previewOnly && pool.status === 1,', 'pool.drawEnabled === true)?.poolCode', 'pool.drawEnabled !== true', 'if (this.gachaSceneState.drawing || this.pendingGachaDraw)', "this.setStatus('召唤请求处理中，请稍候。');", 'drawing: false,', 'lastDrawResult: null,', 'await this.loadLobbyHeroRoster(true);', 'openGachaMockResultScene', 'closeGachaMockResultScene', 'activeAction: action', 'activeAction: null', 'updateGachaConfigRefresh(deltaTime', "this.currentView = 'adventure'", "this.currentView = 'bag'", "this.currentView = 'formation'", "this.currentView = 'heroes'", "this.currentView = 'heroDetail'", "this.currentView = 'notice'", "this.currentView = 'settings'", "this.currentView = 'placeholder'", "this.currentView = 'battle'", "this.currentView = 'gachaResult'", "this.currentView = 'loginAccount'", 'const gachaStatusY = layout.stageBottom + 210 * layout.uiScale;', 'this.statusPresenter.set(text, layout, gachaStatusY);', 'renderBattleScene', 'this.renderBattleScene();', 'this.lobbyBattlePreviewPanelRenderer.canRefreshPlayback())', 'private refreshLobbyBattlePresentationPlayback(): void', 'openLobbyHeroDetail', 'LobbyHeroDetailSceneContent', 'renderLobbyBagPanel', 'LobbyBagSceneContent', 'renderLobbySettingsPanel', 'openLobbySettingsPanel', 'setLobbyLanguage(language', 'openLoginLanguageDialog', 'renderLoginLanguageDialog', 'selectLoginLanguage(language', 'refreshLocalizedPlayerDataAfterLanguageChange', 'const languageKey = lootChainI18n.currentLanguage();', '!hero.protagonist'],
  },
  {
    source: 'assets/scripts/i18n/LootChainI18n.ts',
    tokens: ['export type LootChainLanguage', 'LANGUAGE_STORAGE_KEY', 'toggleLanguage(): LootChainLanguage', 'text(value: string): string', '召唤祭坛按后端卡池状态开放真实召唤；当前仅开放 draw，兑换和补发关闭。', 'export const lootChainI18n = new LootChainI18n();'],
  },
  {
    source: 'assets/scripts/net/HttpClient.ts',
    tokens: ['Accept-Language', 'lootChainI18n.currentLanguage()'],
  },
  {
    source: 'assets/scripts/api/BattleApi.ts',
    tokens: ['ANNUAL_MAINLINE_TOTAL_STAGES = 393', 'FIRST_CHAPTER_STAGE_COUNT = 9', 'STAGES_PER_CHAPTER_AFTER_FIRST = 16', 'REAL_MAINLINE_MODE_PREFIX', 'annualMainlineStageOrder(stageCode', 'MAIN_25_16', 'REAL_MAINLINE_R', '年度主线 MAIN_1_1 至 MAIN_25_16', "portraitAsset: readOptionalText(item, 'portraitAsset'", "spineAsset: readOptionalText(item, 'spineAsset'", "spineUuid: readOptionalText(item, 'spineUuid'", "scaleProfile: readOptionalText(item, 'scaleProfile'"],
  },
  {
    source: 'assets/scripts/types/BattleTypes.ts',
    tokens: ['settlementMode: string;'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattlePresentationState.ts',
    tokens: ['isAnnualMainlineSettlementMode', 'REAL_MAINLINE_R', 'order >= 1 && order <= 393', '首通结算完成', '返回大厅后会刷新体力、背包、主线进度和最近战斗记录。', '奖励、体力与主线进度以服务端回执为准。', '视觉完成 / 提交结算'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleFlow.ts',
    tokens: ['!hero.protagonist', 'const leader = heroes[0];', '当前没有可上阵英雄，请先获取英雄或刷新英雄队列。'],
  },
  {
    source: 'assets/scripts/scenes/UiSceneBackButton.ts',
    tokens: ['SCENE_BACK_BUTTON_ASSET', 'ui/common/scene_back_button/spriteFrame', 'layout.stageRight - 58 * buttonScale', 'layout.stageTop - 42 * buttonScale', 'SceneBackButtonArt', 'SceneBackTitle', 'renderBackTitle(host, parent, layout, buttonScale, titleText)', 'host.applyImageButtonFeedback(button, 1.04, 0.96)'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts',
    // 鍐掗櫓闈㈡澘鏃㈣鏄剧ず閿佸畾鍏冲崱锛屼篃瑕佷綔涓哄満鏅〉鎷︽埅搴曞眰鐐瑰嚮銆?
    tokens: ['selectLobbyAdventureStage(stage.stageCode)', 'previewLockedLobbyAdventureStage(stage.stageCode)', 'ANNUAL_MAINLINE_TOTAL_STAGES = 393', 'isAnnualMainlineStage(stage.stageCode)', 'canOpenBattleEntryStage(stage', 'isReadonlyRecommendedStage(recommended)', 'stages.find((stage) => this.canOpenBattleEntryStage(stage))', 'LobbyAdventureSceneContent', 'LobbyAdventureSceneFrame', 'layout.stageWidth', 'LobbyAdventureStageLockBadge', 'LobbyAdventureRecentBattleSummaryCard', 'stageNextGuidanceText', 'stageRewardTitle(stage', 'stageActionLabel(stage', 'FIRST_CLEAR_USED_UP', 'NEXT_STAGE_READONLY', 'PHASE_LOCKED', '奖励预览（首通结算后发放）', 'visibleStageWindow', 'visibleChapterWindow', 'stages.find((stage) => stage.stageCode === adventure.recommendedStageCode)', '暂无重复经验入口', 'dim.addComponent(BlockInputEvents)', 'panelGroup.addComponent(BlockInputEvents)', 'LobbyAdventureBackButton', 'renderSceneBackButton(this.host, panelGroup, layout'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts',
    // 鎴樻枟棰勮宸插崌绾т负鍏ㄥ睆鎴樻枟閫昏緫瑙嗗浘锛屽悓鏃跺繀椤讳繚鐣欏彧璇荤粨绠楀洖鎵у拰鍐呭鍖虹偣鍑绘嫤鎴€?
    tokens: ['LobbyBattleSceneRoot', 'LobbyBattleSceneBackdropSprite', 'BATTLE_MELEE_CONTACT_GAP_RATIO', 'resolveActorMeleeContactPosition', 'defenderDuelPosition', 'actorDuelPosition', 'rootMotionCue.kind === \'melee_move\'', 'BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 300', 'BATTLE_ACTOR_CLASH_IDLE_SWAY_X', 'resolveBattleActorClashIdleOffset', 'battleActorStickyCombatHoldUntilMs', 'baseMotionHomePosition.x + actionOffset.x', 'BATTLE_ACTOR_CLASH_ATTACK_LUNGE_X', 'LobbyBattlePreviewBackButton', 'renderSceneBackButton(this.host, sceneRoot, layout', 'LobbyBattleSceneEmberMotion', 'LobbyBattleSettlementReceipt', 'LobbyBattleSettlementReceiptLine_', 'panelGroup.addComponent(BlockInputEvents)', 'resolveLobbyBattlePresentationSnapshot', 'renderStage12BattlefieldChrome', 'LobbyBattleStage12BattlefieldChrome', 'drawStage12CampPlate', 'LobbyBattleStage12AllyCampPlate', 'LobbyBattleStage12EnemyCampPlate', 'renderBattleCombatHud', 'LobbyBattleCombatHud', 'LobbyBattleCombatHudLeftPill', 'LobbyBattleCombatHudStagePill', 'LobbyBattleCombatHudRightPill', 'renderBossGauge', 'renderBattleBuffTray', 'snapshot.stage2UiAssets.bossGaugeFrame', 'snapshot.stage2UiAssets.skillTargetFrame', 'LobbyBattleSkillTargetFrame', 'LobbyBattleImpactSlashLayer', 'LobbyBattleActionTargetSlashFallback', 'recordBattleActorSpineCueTelemetry', 'requestedAnimationName', 'appliedAnimationName', 'LobbyBattleActorSpineNode', 'LobbyBattleActorVisualRoot', 'renderBattleActorSpineLayer', 'resolveBattleUnitSpineResource(unit)', 'resolveBattleUnitSpinePrimaryAsset', 'resolveRenderableBattleUnits', 'isBattleStage12RenderableUnit', 'LobbyBattleStage12ActionCallout', 'LobbyBattleStage12ProtagonistFallbackSprite', 'resolveBattleUnitSpineMirrorScaleX(spineScale, enemy)', 'LobbyBattleActorSpineFallbackSilhouette', 'LobbyBattleEnemyStandin', 'LobbyBattleStage12HeroCardDeck', 'LobbyBattleStage12VictoryOverlay', 'LobbyBattleStage12EnemyPlaceholder', 'isBattleAudioSourceNodeValid', 'width / 2 - 4 * scale', 'rgba(202, 188, 145, 0)', 'resolveLobbyBattlePresentationTimeline', 'timeline.currentEvent', 'timeline.damagePreviewEvent', 'timeline.buffPreviewEvent', 'LOBBY_BATTLE_COMBAT_START_STEP', 'resolveBattleOpeningConvergenceState', 'renderBattleOpeningConvergenceCue', 'resolveOpeningConvergenceOffset', 'BATTLE_OPENING_ENTRY_DISTANCE_RATIO', 'BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO', 'BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO', 'BATTLE_OPENING_LANE_ENTRY_RATIOS', 'entryDistance', 'remaining', 'resolveBattleActorFramePosition', 'resolveBattleActorRootMotionCue', 'resolveBattleActorRootMotionPosition', 'resolveBattleActorDisplayedFramePosition', 'BATTLE_ACTOR_FRAME_MAX_DELTA', 'BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS', ['BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR', '(playbackTimelineTimeMs - cue.timeMs) * BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR'], 'resolveBattleTimelineToPresentationRatio', 'timelineToPresentationRatio', 'resolveLobbyBattleVisualCompletionDurationMs', 'isBattleVisualResultReady', 'const targetMeetMotion = false;', 'renderResultBanner(field, fieldRect.width, fieldRect.height, scale, state, presentation, snapshot, hpState, playbackTimelineTimeMs)', ["cue.kind === 'melee_move'\n          || cue.kind === 'ranged_projectile'", "cue.kind === 'melee_move' || cue.kind === 'ranged_projectile'"], 'setBattleActorFramePosition', 'BATTLE_ACTOR_POSITION_EPSILON', 'Math.floor(now / 24)', 'refreshPlayback(layout', 'resolveBattlePlaybackTimelineTimeMs', 'resolveTimelineEventAtTime', 'easeBattleOpeningConvergenceProgress', 'easeBattleActorMotionProgress', 'playbackTimelineTimeMs', 'resolveActorCombatBasePosition', 'resolveActorConvergedCombatPosition', 'resolveVisibleCombatTimelineEvents', 'battleActorHomePositions', 'return this.isNodeAlive(node) && !!node.parent;', 'isNodeMounted(this.battleSceneRoot)', 'presentationElapsedMs', 'applyBattleActorSpineCueOnce', "openingConvergence.moving ? 'run' : 'idle'", "this.applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run')", "this.applyBattleActorSpineCueOnce('opening-hold', actor, unit, 'idle')", "cue === 'idle' || cue === 'stand'", 'opening-run', 'opening-hold', 'effect:action:projectile', 'effect:action:floating', 'effect:assist:aura', 'effect:assist:floating', 'visibleDamagePreviewEvent', 'visibleBuffPreviewEvent', 'resolveBattleActionPresentationCues', 'resolveVisibleBattleActionPresentationCue', 'LobbyBattleActionProjectileLayer', 'LobbyBattleActionProjectileOrb', 'renderActionTargetSpineEffectLayer', 'LobbyBattleActionTargetSpineEffectLayer', 'resolveBattleUnitTargetSpineEffectAnimation', 'skill1Kz', 'skill2Kz', 'skill3Kz', 'skill4Kz', 'LobbyBattleActionFloatingTextLayer', 'LobbyBattleMeleeAdvanceGhost', 'resolveBattleAssistPresentationCues', 'resolveVisibleBattleAssistPresentationCue', 'LobbyBattleAssistAuraLayer', 'LobbyBattleAssistFloatingTextLayer', 'LobbyBattleAssistSkillCastRing', 'resolveBattleSettlementPresentationView', 'LobbyBattleStage8SettlementFlowPanel', 'LobbyBattleStage8RecoveryBanner', 'LobbyBattleStage8ReceiptStatus', 'resolveBattleAdaptivePerformanceProfile', 'performanceProfile.showAssistAuras', 'performanceProfile.showProjectiles', 'performanceProfile.showFloatingText', 'performanceProfile.showSkillBar', 'resolveBattleAudioRuntimePlan', 'LobbyBattleStage11AudioRuntime', 'LobbyBattleStage11AudioStatus', 'playBattleAudioCue'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleAudioRuntime.ts',
    tokens: ['export function resolveBattleAudioRuntimePlan', 'BattleAudioRuntimePlan', 'BATTLE_AUDIO_CUE_DEFAULT_VOLUMES', 'battleBgm', 'battleStart', 'heroBasicAttack', 'rangedAttack', 'hitLight', 'heroSkill', 'healCast', 'buffApply', 'resultWin', 'resultLose', 'visualVictory', '纯表现音频'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattlePresentationSnapshot.ts',
    tokens: ['export interface BattlePresentationSnapshot', 'export function resolveLobbyBattlePresentationSnapshot', 'serverSeed + battleNo + unitSnapshot', 'stage2UiAssets', 'stage2AudioCues', 'BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET', "battleBgm: 'audio/battle/bgm/battle_loop_01'", "resultLose: 'audio/battle/ui/result_lose'", '!hero.protagonist'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattlePresentationTimeline.ts',
    tokens: ['export function resolveLobbyBattlePresentationTimeline', 'createTimelineSeed', 'nextDeterministicTimelineFloat', 'snapshot.unitSnapshotKey', 'battle_start', 'damage_preview', 'buff_preview', '45_000', '60_000', 'events.sort', 'timelineKey', 'roundStart + 3900', 'roundStart + 4250'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts',
    tokens: ['export function resolveBattleActionPresentationCues', 'export function resolveVisibleBattleActionPresentationCue', 'resolveBattleActionCueVisibleWindowMs', 'playbackTimelineTimeMs', 'activeByTime', 'melee_move', "animationName: 'run'", 'basic_attack', 'ranged_projectile', 'damage_float', 'hit_float', 'actorRole', 'targetRole'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts',
    tokens: ['BATTLE_REPLAY_MAX_ACTIONS', 'resolveBattleReplayCombatActions', 'resolveBattleReplayCombatOrder', 'resolveBattleReplayActionSide', 'selectBattleReplayTarget', 'createSyntheticBattleReplayHit', 'battleEndMs', 'durationMs: battleEndMs', 'resolveBattleReplayMeleePreferredTargets', 'Math.abs(unit.slot - actor.slot) <= 1', 'maxHp * 0.42', "actor.side === 'ally' ? 0.42 : 0.18", "actor.side === 'ally' ? 0.18 : 0.03", ["const preferredTargets = actor.role === 'back'", "var preferredTargets = actor.role === 'back'"]],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleAssistPresentation.ts',
    tokens: ['export function resolveBattleAssistPresentationCues', 'export function resolveVisibleBattleAssistPresentationCue', 'playbackTimelineTimeMs', 'activeByTime', 'skill_cast', 'heal_float', 'shield_float', 'buff_float', 'debuff_float', 'sourceRole', 'targetRole'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleSettlementPresentation.ts',
    tokens: ['export function resolveBattleSettlementPresentationView', 'start_idempotent', 'settle_idempotent', 'error_recoverable', 'primaryRecoveryLabel', 'recoveryHint'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleAdaptivePerformance.ts',
    tokens: ['export function resolveBattleAdaptivePerformanceProfile', 'BattleAdaptivePerformanceProfile', '390x340', '1280x720', '1920x1080', 'showTimelineRail: false', 'showBattleLog: false', 'showStage8Panel: false', 'showRecoveryBanner: false', 'motionScale'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBattleUnitSpineRuntime.ts',
    tokens: ['export interface BattleUnitSpineRuntimeData', 'BATTLE_STAGE12_SPINE_PROFILE_BY_RARITY', 'resolveBattleUnitSpinePrimaryAsset', 'resolveBattleUnitPortraitAssetAsBattleSpine', 'resolveBattleUnitSpineLoadUuid', 'portrait_asset=act_*', 'deriveBattleSpineAssetFromPortrait', 'sanitizeSpineAsset(unit.spineAsset)', 'resolveBattleUnitSpineResource', 'resolveBattleUnitSpineAnimationNames', 'resolveBattleUnitSpineScale', ['BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO = 0.84', 'var maxVisualHeight = slotHeight * 0.84', 'const maxVisualHeight = slotHeight * 0.84'], ['maxVisualHeight = slotHeight * BATTLE_SR_R_COMBAT_MAX_HEIGHT_RATIO', 'maxVisualHeight = slotHeight * 0.84'], 'resolveBattleUnitFormationPreviewMaxHeightRatio(unit, tier)', ['BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO = 0.53', "? 0.56"], ['? BATTLE_SR_R_FORMATION_MAX_HEIGHT_RATIO', "? 0.56"], ["BATTLE_FORMATION_DEFAULT_MAX_HEIGHT_RATIO", "Eulenspigel: 0.272", "Ishmael: 0.528", "Nuu: 0.43"], 'resolveBattleUnitSpineNodePosition', 'resolveBattleUnitSpineMirrorScaleX', 'spine/hero/${asset}/${asset}'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyHeroRosterLoader.ts',
    // 缂栭槦鍜屾垬鏂楅瑙堝揩閫熻繛鐐规椂澶嶇敤鍚屼竴涓嫳闆勫垪琛ㄨ姹傦紝閬垮厤绌洪樀瀹规垨閲嶅璇汇€?
    tokens: ['inFlightLoad', 'this.inFlightLoad', 'loadPromise', 'this.heroApi.lobbyHeroFilterOptions()', 'this.rosterState.applyLoaded(heroes, filterOptions.heroClasses)'],
  },
  {
    source: 'assets/scripts/api/LobbyHeroApi.ts',
    tokens: ["R_ACOLY_02: { portraitAsset: 'act_1012', spineAsset: 'npc_1012'", "SR_PRIEST_01: { portraitAsset: 'act_21006', spineAsset: 'npc_21006'", "cardBackgroundAsset: 'ui/hero-roster/card_background/npc_21006'", 'isHiddenProtagonistHero(item)', '!isHiddenProtagonistHero(item)'],
  },
  {
    source: 'assets/scripts/api/LobbyCodexApi.ts',
    tokens: ["R_ACOLY_02: { portraitAsset: 'act_1012', spineAsset: 'npc_1012'", "SR_PRIEST_01: { portraitAsset: 'act_21006', spineAsset: 'npc_21006'", "cardBackgroundAsset: 'ui/hero-roster/card_background/npc_21006'"],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyNoticePanelRenderer.ts',
    tokens: ['LobbyNoticeSceneContent', 'LobbyNoticeSceneFrame', 'layout.stageWidth', 'dim.addComponent(BlockInputEvents)', 'panelGroup.addComponent(BlockInputEvents)', 'LobbyNoticeBackButton', 'renderSceneBackButton(this.host, panelGroup, layout'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyFormationPanelRenderer.ts',
    tokens: ['LobbyFormationSceneContent', 'LobbyFormationSceneFrame', 'layout.stageWidth', 'dim.addComponent(BlockInputEvents)', 'panelGroup.addComponent(BlockInputEvents)', 'canOpenBattlePreview', 'buttonComponent.interactable = enabled', 'LobbyFormationBattlefieldScene', 'LobbyFormationHeroPicker', 'LobbyFormationActorStand_', 'standWidth = Math.min(270 * scale, width * 0.38)', 'standHeight = Math.min(350 * scale, height * 0.66)', 'visualHeight = height * 2.28', 'data, width, height, scale, unit, resourcePath', 'LobbyFormationActorSpinePreview', 'LobbyFormationActorFallbackSilhouette', 'LobbyFormationHeroPickerRow_', 'renderFormationBattlefield', 'renderFormationHeroPicker', 'renderFormationHeroSpinePreview', 'recordFormationDebugSnapshot', '__lootchainFormationDebug', 'srRVisuals', 'sameSelection', ['recordFormationActorResolvedVisualTelemetry', 'formation debug resolved visual height'], 'estimatedHeight', 'loadFormationSpineData', 'applyFormationSpineDataWithRetry', 'applyFormationSpineData', 'FORMATION_SPINE_RUNTIME_RETRY_DELAYS_MS', 'spine runtime retry', 'toFormationBattleUnit(hero)', 'resolveBattleUnitSpineResource(unit)', 'LobbyFormationBackButton', 'renderSceneBackButton(this.host, panelGroup, layout'],
  },
  {
    source: 'assets/scripts/scenes/login/LoginRenderer.ts',
    tokens: ['renderLoginAccountScene', 'openLoginAccountScene', 'LoginAccountSceneRoot', 'LoginAccountScenePanel', 'scene.node.addComponent(BlockInputEvents)', 'panelGraphics.node.addComponent(BlockInputEvents)', 'drawAccountSceneChrome', 'openLoginLanguageDialog', 'login.rightRail.language', 'side_btn_prophecy'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyTopHudRenderer.ts',
    tokens: ['openLobbySettingsPanel', "key === 'settings'", 'lootChainI18n'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbySettingsPanelRenderer.ts',
    tokens: ['LobbySettingsSceneContent', 'LobbySettingsSceneFrame', 'LobbySettingsBackButton', 'LobbySettingsLanguageButton_', 'setLobbyLanguage(language', 'renderSceneBackButton'],
  },
  {
    source: 'assets/resources/login-bg/scripts/login/LoginVideoBackground.ts',
    tokens: ['resumeForLoginView', 'schedulePosterHideFallback', 'hidePosterForVideo', 'this.posterOpacity.opacity = 0', 'this.tryPlayVideo()'],
  },
  {
    source: 'assets/scripts/scenes/protagonist/ProtagonistCreateFlow.ts',
    tokens: ['HIDDEN_PROTAGONIST_CREATE_REQUEST', 'ensureHiddenProtagonistReady', 'this.ensureHiddenProtagonistReady(ticket)'],
  },
  {
    source: 'assets/scripts/scenes/protagonist/ProtagonistCreateRenderer.ts',
    tokens: ['drawFullSceneFrame', 'scene.addComponent(BlockInputEvents)', 'ProtagonistCreatePanel'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyCodexPanelRenderer.ts',
    tokens: ['LobbyCodexSceneContent', 'LobbyCodexSceneFrame', 'layout.stageWidth', 'dim.addComponent(BlockInputEvents)', 'panelGroup.addComponent(BlockInputEvents)', 'LobbyCodexBackButton', 'renderSceneBackButton(this.host, panelGroup, layout'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBagLoader.ts',
    tokens: ['this.bagApi.myBag()', 'this.heroApi.fragments()', 'mergeBagGroupsWithFragments(bag.groups ?? [], fragments)', "itemType: 'HERO_FRAGMENT'", 'heroFragmentSourceDesc(fragmentItem)', 'this.bagApi.source(safeCode)', 'this.host.refreshLobbyOverlay()'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyBagPanelRenderer.ts',
    tokens: ['LobbyBagSceneContent', 'LobbyBagSceneFrame', 'layout.stageWidth', 'dim.addComponent(BlockInputEvents)', 'panelGroup.addComponent(BlockInputEvents)', 'LobbyBagBackButton', 'renderSceneBackButton(this.host, panelGroup, layout', 'LobbyBagBoundaryNote', '金币 · 未开放', 'reloadLobbyBagItemSource'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyProfileDialogRenderer.ts',
    tokens: ['LobbyProfileSceneRoot', 'LobbyProfileSceneContent', 'sceneRoot.addComponent(BlockInputEvents)', 'panel.addComponent(BlockInputEvents)', 'LobbyProfileBackButton', 'renderSceneBackButton(this.host, panel, layout'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyHeroRosterPanelRenderer.ts',
    tokens: ['LobbyHeroRosterSceneContent', 'LobbyHeroRosterSceneFrame', 'layout.stageWidth', 'dim.addComponent(BlockInputEvents)', 'panelGroup.addComponent(BlockInputEvents)', 'openLobbyHeroDetail(hero.id)', 'LobbyHeroRosterBackButton', 'renderSceneBackButton(this.host, panelGroup, layout', 'LOBBY_HERO_ROSTER_CARD_FRAME_ASSET', 'ui/hero-roster/hero_card_frame/spriteFrame', 'LOBBY_HERO_ROSTER_CARD_ASSETS', 'LOBBY_HERO_ROSTER_CARD_BACKGROUND_NUU_ASSET', 'ui/hero-roster/card_background/Nuu_Illust', 'LobbyHeroRosterFilterRail', 'HERO_FILTER_ALL', 'HERO_CLASS_FILTER_ORDER', 'HERO_CLASS_KEY_ALIASES', "Warrior: '战士'", "Support: '辅助'", "Assassin: '刺客'", "Mage: '法师'", "Marksman: '射手'", "Tank: '坦克'", 'selectHeroClassFilter', 'resolveHeroFilterTabs', 'state.heroClassOptions', 'new Map<string, string>()', 'heroClassOptions.forEach', 'filterHeroesBySelectedClass', 'resolveHeroClass', 'addHeroClassTab', 'isHeroClassTabActive', 'normalizeHeroClassKey', 'const selectedKey = this.normalizeHeroClassKey(this.selectedHeroClass);', 'return heroes.filter((hero) => this.normalizeHeroClassKey(this.resolveHeroClass(hero)) === selectedKey);', 'LobbyHeroRosterScrollView', 'LobbyHeroRosterScrollContent', 'scrollView.content = content;', 'const scrollEffectTopPadding = HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING * scale;', 'const viewportHeight = bodyHeight + scrollEffectTopPadding;', 'const viewportCenterY = bodyCenterY + scrollEffectTopPadding / 2;', 'const contentHeight = Math.max(viewportHeight', 'const startX = -bodyWidth / 2 + cardInsetX + cardWidth / 2', 'const startY = contentHeight / 2 - scrollEffectTopPadding - cardInsetY - cardHeight / 2', 'HERO_ROSTER_CARD_ASPECT_WIDTH = 937', 'HERO_ROSTER_CARD_ASPECT_HEIGHT = 1676', 'HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE = 1.2', 'HERO_ROSTER_CARD_MAX_COLUMNS = 5', 'const HERO_ROSTER_CARD_DESKTOP_TARGET_HEIGHT = 468;', 'const HERO_ROSTER_CARD_DESKTOP_MAX_HEIGHT = 492;', 'const HERO_ROSTER_CARD_COMPACT_TARGET_HEIGHT = 310;', 'const HERO_ROSTER_CARD_COMPACT_MAX_HEIGHT = 340;', 'HERO_ROSTER_RARITY_DISPLAY_ORDER', 'UR: 0', 'SSR: 1', 'SR: 2', 'R: 3', 'sortHeroesForRosterDisplay', 'resolveRarityDisplayRank', 'const displayHeroes = this.filterHeroesBySelectedClass(this.sortHeroesForRosterDisplay(state.heroes));', 'const maxCardsInRow = Math.max(1, Math.min(displayHeroes.length, HERO_ROSTER_CARD_MAX_COLUMNS))', 'const maxCardWidthForRow = Math.max(96 * scale', '* HERO_ROSTER_CARD_DISPLAY_WIDTH_SCALE', 'HERO_ROSTER_CARD_LEVEL_X_RATIO = -0.38', 'HERO_ROSTER_CARD_LEVEL_Y_RATIO = 0.38', 'HERO_ROSTER_CARD_LEVEL_TEXT_WIDTH_RATIO = 0.29', 'HERO_ROSTER_CARD_EFFECT_TOP_MASK_PADDING = 62', 'HERO_ROSTER_CARD_BADGE_X_RATIO = 0.37', 'HERO_ROSTER_CARD_BADGE_Y_RATIO = 0.38', 'HERO_ROSTER_CARD_BADGE_SIZE_RATIO = 0.17', 'HERO_ROSTER_CARD_BACKGROUND_WIDTH_RATIO = 1', 'HERO_ROSTER_CARD_BACKGROUND_HEIGHT_RATIO = 0.5', 'HERO_ROSTER_CARD_BACKGROUND_Y_RATIO = 0.02', 'HERO_ROSTER_CARD_RARITY_Y_RATIO = 0.324', 'HERO_ROSTER_CARD_NAME_Y_RATIO = 0.18', 'HERO_ROSTER_CARD_STARS_Y_RATIO = 0.13', 'Math.min(16 * scale, height * 0.048)', 'new Size(width - 54 * scale, height * 0.06)', 'LobbyHeroRosterStars', 'LobbyHeroRosterHeroName', 'resolveHeroClassBadgeText', 'safeText(hero.heroName)', 'formatHeroCardLevel(hero.level)', 'safeLevel >= 100 ? `Lv${safeLevel}` : `Lv.${safeLevel}`', 'topBarLeftReserve', 'LobbyHeroRosterLevelText', 'width * HERO_ROSTER_CARD_LEVEL_X_RATIO', 'height * HERO_ROSTER_CARD_LEVEL_Y_RATIO', 'drawCircleBadge', 'const badgeSize = clamp(width * HERO_ROSTER_CARD_BADGE_SIZE_RATIO', 'const badgeX = width * HERO_ROSTER_CARD_BADGE_X_RATIO', 'const badgeY = height * HERO_ROSTER_CARD_BADGE_Y_RATIO', 'USE_HERO_ROSTER_EXTERNAL_PORTRAITS = false', 'renderHeroCardBackground', 'LobbyHeroRosterCardBackgroundSprite', 'resolveHeroCardBackgroundAssetPath', 'hero.cardBackgroundAsset', 'LobbyHeroRosterHeroRelief', 'graphics.lineTo(width * 0.18, -height * 0.26)', 'HERO_ROSTER_BORDER_EFFECT_RESOURCE', 'HERO_ROSTER_BORDER_ANIMATION_BY_RARITY', "R: 'K3'", "SR: 'K4'", "SSR: 'K5'", "UR: 'K7'", 'HERO_ROSTER_UR_SEQUENCE_BORDER_PATH_PREFIX', 'HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_COUNT = 12', 'HERO_ROSTER_UR_SEQUENCE_BORDER_ALPHA = 255', 'HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_WIDTH_RATIO = 1.25', 'HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_HEIGHT_RATIO = 1.25', 'HERO_ROSTER_UR_SEQUENCE_BORDER_OUTER_Y_RATIO = -0.01', 'HERO_ROSTER_UR_SEQUENCE_BORDER_FRAME_PATHS', 'HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING = 33', 'HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING = 61', 'HERO_ROSTER_GOODS_BORDER_Y_RATIO = -0.03', 'HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX = 2.8', 'ui/hero-roster/UR-card-border', 'renderUrCardSequenceBorder', "this.renderRarityGoodsBorderSpine(card, 'UR', width, height);", 'LobbyHeroRosterUrSequenceBorderSprite', 'loadUrSequenceBorderFrames', 'startSequenceBorderAnimation', 'resources.load(path, SpriteFrame', 'spine/ui/hero-roster/goods_1_border/goods_1', 'renderHeroCardBorderEffect', 'renderRarityGoodsBorderSpine', 'LobbyHeroRosterRarityGoodsBorderSpine_${rarity}', 'loadBorderEffectData', 'resolveRarityBorderAnimationName', 'name.toLowerCase() === targetLower', 'clamp((width + HERO_ROSTER_GOODS_BORDER_WIDTH_PADDING) / 120, 1.12, HERO_ROSTER_GOODS_BORDER_WIDTH_SCALE_MAX)', 'clamp((height + HERO_ROSTER_GOODS_BORDER_HEIGHT_PADDING) / 120', 'LobbyHeroRosterAbyssDust', 'LobbyHeroRosterFormationButton', 'resolveHeroRosterPortraitAsset'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyHeroRosterPanelRenderer.ts',
    tokens: ['const hasCardArtwork = this.renderHeroCardBackground(card, hero, width, height, scale);', 'if (!hasCardArtwork) {', 'LobbyHeroRosterCardBackgroundMask', 'mask.type = Mask.Type.GRAPHICS_RECT', 'HERO_ROSTER_CARD_BACKGROUND_MASK_WIDTH_RATIO = 0.92', 'HERO_ROSTER_CARD_BACKGROUND_MASK_HEIGHT_RATIO = 0.74', 'HERO_ROSTER_CARD_BACKGROUND_NUU_VISIBLE_HEIGHT_RATIO = 0.5', 'HERO_ROSTER_CARD_BACKGROUND_MATCHED_VISIBLE_HEIGHT_RATIO = 0.58', 'HERO_ROSTER_CARD_BACKGROUND_NPC_PREFIX', 'HERO_ROSTER_CARD_BACKGROUND_NPC_VISIBLE_HEIGHT_RATIO = 0.58', 'HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_HEIGHT_RATIO = 0.74', 'HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_WIDTH_RATIO = 0.96', 'HERO_ROSTER_CARD_BACKGROUND_VISIBLE_HEIGHT_RATIOS', 'HERO_ROSTER_CARD_BACKGROUND_FOCUS_X_RATIOS', 'isNpcHeroCardBackgroundAssetPath', 'isNpcCardBackground ? 1', 'Math.min(maskWidth * HERO_ROSTER_CARD_BACKGROUND_NPC_MAX_DISPLAY_WIDTH_RATIO, aspectWidth)', 'resolveHeroCardBackgroundFrameSize', 'resolveHeroCardBackgroundDisplaySize', 'resolveHeroCardBackgroundOffsetX', 'resolveHeroCardBackgroundOffsetY', 'targetVisibleHeight / visibleAlphaRatio', 'targetVisibleHeightRatio', 'Texture2D', 'private readonly cardBackgroundFrames', 'loadHeroCardBackgroundFrame', 'loadHeroCardBackgroundTexture', 'resources.load(assetPath, Texture2D', 'resources.load(`${assetPath}/texture`, Texture2D', 'frame.texture = texture;', 'frame.texture = subTexture;', 'missingCardBackgroundLogs'],
  },
  {
    source: 'assets/scripts/scenes/lobby/LobbyHeroDetailPanelRenderer.ts',
    tokens: ['LobbyHeroDetailSceneContent', 'LobbyHeroDetailSceneFrame', 'layout.stageWidth', 'layout.safeWidth < 1154 * scale', 'const artX = 0;', 'LobbyHeroDetailIdentityPlate', 'plateY = -height / 2 + 118 * scale', 'LobbyHeroDetailDynamicPortrait', 'LobbyHeroDetailSpineNode', 'LobbyHeroDetailStageDepth', 'resolveHeroSpineResource(hero)', 'spine/hero/${asset}/${asset}', 'resources.load(path, sp.SkeletonData', 'const cacheKey = path', 'loadHeroSpineUuidData', 'const cacheKey = `uuid:${uuid}`', 'loadResourcePathFallback', 'hero spine uuid failed, fallback resource path', 'hero spine resource path load failed or returned non-SkeletonData', 'hero spine asset missing', 'hero spine load start', 'isHeroSpineDataAsset', 'hero spine uuid load failed or returned non-SkeletonData', 'hero spine resource data failed to apply, retry uuid', 'retryHeroSpineUuidData', 'renderHeroSpineFailureHint', 'AudioSource', 'AudioClip', 'bindHeroSpineAudioEvents', 'playHeroSpineAudioEvent', 'isHeroSpineAudioSourceNodeValid', 'event.data?.audioPath', 'resources.load(path, AudioClip', 'hero spine audio missing', 'applyHeroSpineDataWithRetry', 'HERO_DETAIL_SPINE_RUNTIME_RETRY_DELAYS_MS', 'hero spine runtime retry', 'isRetryableHeroSpineFailure', 'formatHeroSpineError', 'getRuntimeData(true)', 'textures=${textureCount}', 'atlas=${textureNames}', '资源应用异常：${this.formatHeroSpineError(error)}', 'resolveHeroSpineAnimationNames', 'const idleAnimation = animationNames.idle', 'const introAnimation = animationNames.intro', 'skeleton.setAnimation(0, introAnimation, false)', 'skeleton.addAnimation(0, idleAnimation, true, 0)', 'patchHeroSpineRuntimeEnums', 'getSkinsEnum =', 'getAnimsEnum =', 'createHeroSpineEnumMap', 'HERO_DETAIL_IDLE_ONLY_PROFILE', 'HERO_DETAIL_NUU_VISUAL_HEIGHT_RATIO = 0.6', 'HERO_DETAIL_SPINE_MAX_WIDTH_RATIO = 1.22', 'HERO_DETAIL_SPINE_DEFAULT_MAX_SCALE = 0.62', 'HERO_DETAIL_NUU_MATCHED_HEIGHT_RATIO = 0.78', 'HERO_DETAIL_NUU_MATCHED_MAX_WIDTH_RATIO = 3.2', 'HERO_DETAIL_NUU_MATCHED_MAX_SCALE = 0.78', 'HERO_DETAIL_NUU_MATCHED_SCALE_MULTIPLIER = 1.18', 'HERO_DETAIL_SPINE_DISPLAY_PROFILES', 'IshmaelA: HERO_DETAIL_IDLE_ONLY_PROFILE', 'Sphinx: HERO_DETAIL_IDLE_ONLY_PROFILE', "loopAnimation: 'idle'", "introAnimation: 'intro'", 'targetHeightRatio: HERO_DETAIL_NUU_MATCHED_HEIGHT_RATIO', 'maxWidthRatio: HERO_DETAIL_NUU_MATCHED_MAX_WIDTH_RATIO', 'maxScale: HERO_DETAIL_NUU_MATCHED_MAX_SCALE', 'scaleMultiplier: HERO_DETAIL_NUU_MATCHED_SCALE_MULTIPLIER', 'displayProfile.loopAnimation', 'displayProfile.introAnimation', 'maxScale: 0.52', 'targetHeightRatio: HERO_DETAIL_NUU_VISUAL_HEIGHT_RATIO', 'maxWidthRatio: HERO_DETAIL_SPINE_MAX_WIDTH_RATIO', 'yRatio: 0.012', 'resolveHeroSpineDisplayProfile', 'resolveHeroSpineJsonSkinNames', 'resolveHeroSpineJsonAnimationNames', 'resolveHeroSpineRuntimeSkinNames', 'resolveHeroSpineRuntimeAnimationNames', 'resolveHeroSpineAnimationNameList', 'resolvePreferredSpineName', "skinName && skinName !== 'default'", 'resolveHeroDetailGroundY(height)', 'graphics.ellipse(0, groundY', 'resolveHeroSpineScale', 'const heightFit = targetHeight / safeHeight', 'const widthFit = maxWidth / safeWidth', 'displayProfile.scaleMultiplier ?? 1', 'LobbyHeroDetailAttributeGrid', 'LobbyHeroDetailSkillList', 'LOBBY_HERO_DETAIL_PROTAGONIST_ASSET', 'dim.addComponent(BlockInputEvents)', 'LobbyHeroDetailBackButton', 'renderSceneBackButton(this.host, panelGroup, layout'],
  },
  {
    source: 'assets/scripts/scenes/gacha/GachaSceneConfig.ts',
    tokens: ['GACHA_BACKGROUND_ASSET', 'ui/gacha/gacha_bg_abyss_ring/spriteFrame', 'GACHA_MODAL_CLOSE_BUTTON_ASSET', 'ui/common/ai/button_close/spriteFrame', 'GACHA_C1812_SUMMON_FLOOR_ASSET', 'ui/gacha/c1812/summon_floor/spriteFrame', 'GACHA_C1812_SUMMON_MAGIC_CIRCLE_ASSET', 'ui/gacha/c1812/summon_magic_circle/spriteFrame', 'GACHA_C1812_SUMMON_REWARD_SLOT_ASSET', 'ui/gacha/c1812/summon_reward_slot/spriteFrame', 'GACHA_C1812_SUMMON_CASE_FRAME_ASSET', 'ui/gacha/c1812/summon_case_frame/spriteFrame', 'GACHA_C1812_CURRENCY_GOLD_ASSET', 'ui/gacha/c1812/currency_gold/spriteFrame', 'GACHA_POOL_LOGO_ASSETS', 'ui/gacha/logo_limited/spriteFrame', 'GACHA_ABYSS_SPINE_RESOURCE', 'GACHA_REVEAL_STEPS', 'GACHA_SUMMON_VIDEO_NORMAL_RESOURCE', 'video/gacha/call1', 'GACHA_SUMMON_VIDEO_RARE_RESOURCE', 'video/gacha/call2', 'GACHA_SUMMON_AUDIO_RESOURCE', 'audio/gacha/call', 'GACHA_SUMMON_VIDEO_ASPECT_WIDTH', 'GACHA_SUMMON_VIDEO_ASPECT_HEIGHT', 'GACHA_SUMMON_VIDEO_FALLBACK_SECONDS', 'poolType?: string | null;', 'displayType?: string | null;'],
  },
  {
    source: 'assets/scripts/scenes/gacha/GachaSceneRenderer.ts',
    tokens: [
      'renderSceneBackButton(this.host, parent, layout',
      'GachaBackButton',
      'renderActionModal(parent',
      'GachaActionModalOverlay_',
      'GachaActionScenePanel_',
      'GachaActionModalCloseArt',
      'GACHA_MODAL_CLOSE_BUTTON_ASSET',
      'GachaPoolLogoImage',
      'GachaPoolTabLogoBackdrop',
      'tabLogoAsset || pool.logoAsset',
      'normalizeSpriteFramePath',
      'selectedPool.drawEnabled === true',
      'selectedPool.drawEnabled !== true',
      'resolveActionPanelFrame(layout, scale, action, rows.length)',
      'bodyOuterHeight',
      'const activeRateRarities = new Set(detail.rates.filter((rate) => rate.status === 1)',
      'formatPercentValue(rate.rate)',
      'activeRateRarities.has(safeText(pity.rarity))',
      'function formatPercentValue',
      'GachaActionRowsViewport_',
      'GachaActionRowsContent_',
      'GachaActionRowsScrollHint',
      '拖动查看完整列表',
      '概率保底',
      '奖池内容',
      'openGachaActionScene(key)',
      'currentLobbyProfile()',
      'GachaAbyssSpineStage',
      'renderC1812SummonStageDecor(stage, stageWidth, stageHeight, scale, spineGroundY, selectedPool)',
      'GachaC1812SummonFloor',
      'GachaC1812SummonMagicCircle',
      'GachaC1812RevealCaseFrame',
      'GachaC1812ResultRewardSlot',
      'GACHA_C1812_SUMMON_FLOOR_ASSET',
      'GACHA_C1812_SUMMON_MAGIC_CIRCLE_ASSET',
      'GACHA_C1812_SUMMON_CASE_FRAME_ASSET',
      'GACHA_C1812_SUMMON_REWARD_SLOT_ASSET',
      "safeText(selectedPool.title) || '召唤'",
      'GachaAbyssSpineNode',
      'GACHA_SPINE_GROUND_Y_RATIO = -0.55',
      'GACHA_HERO_POOL_SPINE_GROUND_Y_EXTRA_RATIO = -0.075',
      'GACHA_BOX_SUMMON_SPINE_SCALE_MULTIPLIER = 1.18',
      'GACHA_BOX_SUMMON_SPINE_GROUND_Y_EXTRA_RATIO = -0.045',
      'resolveGachaSpineGroundY(stageHeight, selectedPool)',
      'isBoxSummonGachaPool(selectedPool)',
      'isHeroGachaPool(selectedPool)',
      'GACHA_BOX_SUMMON_SPINE_GROUND_Y_EXTRA_RATIO',
      "displayType === 'LIMITED'",
      "poolCode.includes('LIMITED')",
      "poolCode === 'NORMAL_HERO'",
      "displayType === 'HERO'",
      'graphics.ellipse(0, spineGroundY - 22 * scale',
      "addChildPlainNode(stage, 'GachaAbyssSpineNode', 0, spineGroundY",
      'resolveAbyssSpineScale(layout, scale, resource)',
      "resource.includes('/box_summon/')",
      'return 0.43 * scale * stageFactor * poolMultiplier',
      'GACHA_ABYSS_SPINE_RESOURCE',
      'resources.load',
      'GACHA_ABYSS_SPINE_UUID',
      'assetManager.loadAny',
      'finishAbyssSpineLoad',
      'GACHA_ABYSS_FALLBACK_SPINE_RESOURCE',
      'GACHA_ABYSS_FALLBACK_SPINE_UUID',
      'ensureAbyssFallbackSpineData',
      'finishAbyssFallbackSpineLoad',
      '已临时显示可用预览 Spine',
      '需要重新导出 huangfengjiaozong',
      'data.getRuntimeData(true)',
      'skeleton.setToSetupPose',
      '<setup-pose>',
      'resolveAbyssSpineSkinName',
      'resolveAbyssSpineAnimationName',
      'skeleton.setSlotsToSetupPose',
      'skeleton.setAnimation(0, idleAnimation, true)',
      'huangfengjiaozong',
      'renderRevealScene(layout',
      'renderSummonVideoScene(layout',
      'GachaSummonVideoSceneRoot',
      'renderSummonVideoContent(root, layout, scale, mode, rarity)',
      'GachaSummonVideoPlayer',
      'private resolveSummonVideoResource(rarity: GachaRarity | null): string',
      "return rarity === 'SSR' || rarity === 'UR' ? GACHA_SUMMON_VIDEO_RARE_RESOURCE : GACHA_SUMMON_VIDEO_NORMAL_RESOURCE;",
        'GACHA_SUMMON_VIDEO_NORMAL_RESOURCE',
        'GACHA_SUMMON_VIDEO_RARE_RESOURCE',
        'GACHA_SUMMON_AUDIO_RESOURCE',
        'GACHA_SUMMON_VIDEO_ASPECT_WIDTH',
        'GACHA_SUMMON_VIDEO_ASPECT_HEIGHT',
        'GACHA_SUMMON_VIDEO_FALLBACK_SECONDS',
        'const videoCoverSize = this.resolveSummonVideoCoverSize(layout);',
        'layout.height * videoAspect',
        'layout.width / videoAspect',
        'private resolveSummonVideoCoverSize(layout: UiLayout): Size',
        'const videoAspect = GACHA_SUMMON_VIDEO_ASPECT_WIDTH / GACHA_SUMMON_VIDEO_ASPECT_HEIGHT;',
        'VideoClip',
        'VideoPlayer',
      'AudioClip',
      'AudioSource',
        'resources.load(videoResource, VideoClip',
        'VideoPlayer.ResourceType.LOCAL',
        'videoPlayer.keepAspectRatio = true;',
        'videoPlayer.clip = clip',
      'videoPlayer.play()',
      'VideoPlayer.EventType.COMPLETED',
      'VideoPlayer.EventType.ERROR',
      'resources.load(GACHA_SUMMON_AUDIO_RESOURCE, AudioClip',
      'const audioSource = audioNode.addComponent(AudioSource);',
      'audioSource.play();',
      'this.host.finishGachaSummonVideoScene();',
      'GachaRevealSceneRoot',
      'GachaRevealSceneContent',
      'GachaRevealBackButton',
      'GachaRevealCardBack',
      'GachaRevealContinueButton',
      'GachaRevealNoWriteStrip',
      'startGachaDraw(mode)',
      'closeGachaMockRevealScene()',
      'renderResultScene(layout',
      'GachaResultSceneRoot',
      'GachaResultBackButton',
      'GachaResultScenePanel',
      'GachaResultSceneNoWriteNote',
      'GachaResultSceneConfirmButton',
      "this.renderTopBar(root, layout, scale, 'GachaResultBackButton', () => this.host.closeGachaMockResultScene(), '召唤结果');",
      'openGachaMockResultScene(mode)',
      'closeGachaMockResultScene()',
    ],
  },
];

main().catch((error) => {
  console.error(`[preview freshness] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  const importMapText = await getPreviewImportMapText();
  const importMap = JSON.parse(importMapText);
  const engineImportMapText = await getText(ENGINE_IMPORT_MAP_URL);
  const imports = importMap.imports ?? {};
  const failures = [];
  const missingImportChunks = await findMissingImportMapChunks(importMap);
  const missingScopedDependencyMappings = await findMissingScopedDependencyMappings(importMap);

  if (missingImportChunks.length > 0) {
    failures.push(`project import-map references missing chunks:\n${missingImportChunks.map((chunk) => `  - ${chunk}`).join('\n')}`);
  }
  if (missingScopedDependencyMappings.length > 0) {
    failures.push(`project import-map scopes are missing generated dependency mappings:\n${missingScopedDependencyMappings.map((entry) => `  - ${entry}`).join('\n')}`);
  }

  if (!engineImportMapText.includes('spine-version-3.8.js') || !engineImportMapText.includes('spine-instantiate-3.8.js')) {
    failures.push('Cocos Preview engine runtime is not Spine 3.8, but the current project Spine baseline is 3.8.x');
  }
  if (engineImportMapText.includes('spine-version-4.2.js') || engineImportMapText.includes('spine-instantiate-4.2.js')) {
    failures.push('Cocos Preview engine import-map points to Spine 4.2, which risks the existing 3.8 hero/UI Spine assets');
  }

  for (const requirement of REQUIRED_CHUNKS) {
    const specifier = Object.keys(imports).find((key) => normalize(key).endsWith(requirement.source));
    if (!specifier) {
      failures.push(`${requirement.source}: import-map entry not found`);
      continue;
    }
    const chunkPath = imports[specifier];
    const chunkUrl = new URL(`scripting/x/${String(chunkPath).replace(/^\.\//, '')}`, `${PREVIEW_ORIGIN}/`).href;
    let chunk;
    try {
      chunk = await getText(chunkUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${requirement.source}: chunk ${chunkPath} is not available from Preview (${detail})`);
      continue;
    }
    const inspectionText = await appendSourceMapContent(chunkUrl, chunk);
    const missing = requirement.tokens.filter((token) => !hasRequiredToken(inspectionText, token));
    if (missing.length > 0) {
      failures.push(`${requirement.source}: stale chunk ${chunkPath}, missing ${missing.map(formatRequiredToken).join(', ')}`);
    }
    const forbidden = FORBIDDEN_CHUNK_TOKENS[requirement.source] ?? [];
    const presentForbidden = forbidden.filter((token) => chunk.includes(token));
    if (presentForbidden.length > 0) {
      failures.push(`${requirement.source}: forbidden R16 token in chunk ${chunkPath}: ${presentForbidden.join(', ')}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Cocos Preview is not serving the required scripts/runtime.\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }

  console.log('preview freshness ok');
}

async function getPreviewImportMapText() {
  try {
    return await getText(IMPORT_MAP_URL);
  } catch (error) {
    const missingPreviewTarget = !existsSync(LOCAL_PREVIEW_IMPORT_MAP);
    const hint = missingPreviewTarget
      ? ` Local Preview target is missing: ${LOCAL_PREVIEW_IMPORT_MAP}. Bring Cocos Creator to the foreground or refresh/reopen Preview so it regenerates the browser preview target.`
      : '';
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}.${hint}`);
  }
}

function normalize(value) {
  return decodeURIComponent(String(value)).replace(/\\/g, '/');
}

function hasRequiredToken(text, token) {
  if (Array.isArray(token)) {
    return token.some((option) => text.includes(option));
  }
  return text.includes(token);
}

function formatRequiredToken(token) {
  return Array.isArray(token) ? token.join(' OR ') : token;
}

async function findMissingImportMapChunks(importMap) {
  const imports = importMap.imports ?? {};
  const scopes = importMap.scopes ?? {};
  const chunkReferences = [];
  for (const [specifier, chunkPath] of Object.entries(imports)) {
    chunkReferences.push({ label: `${specifier} -> ${chunkPath}`, chunkPath });
  }
  for (const [scopePath, scopeImports] of Object.entries(scopes)) {
    for (const [specifier, chunkPath] of Object.entries(scopeImports ?? {})) {
      chunkReferences.push({ label: `${scopePath} :: ${specifier} -> ${chunkPath}`, chunkPath });
    }
  }

  const missing = [];
  const seen = new Set();
  for (const { label, chunkPath } of chunkReferences) {
    const normalizedChunk = String(chunkPath ?? '');
    if (!normalizedChunk.startsWith('./chunks/')) {
      continue;
    }
    const seenKey = `${label}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);
    const chunkUrl = new URL(`scripting/x/${normalizedChunk.replace(/^\.\//, '')}`, `${PREVIEW_ORIGIN}/`).href;
    if (!(await headOk(chunkUrl))) {
      missing.push(label);
    }
  }
  return missing;
}

async function findMissingScopedDependencyMappings(importMap) {
  const imports = importMap.imports ?? {};
  const scopes = importMap.scopes ?? {};
  const failures = [];
  for (const [specifier, chunkPath] of Object.entries(imports)) {
    const normalizedChunk = String(chunkPath ?? '');
    if (!normalizedChunk.startsWith('./chunks/')) {
      continue;
    }

    const scope = scopes[normalizedChunk] ?? scopes[normalizeChunkPath(normalizedChunk)] ?? {};
    const chunkUrl = new URL(`scripting/x/${normalizedChunk.replace(/^\.\//, '')}`, `${PREVIEW_ORIGIN}/`).href;
    let chunk = '';
    try {
      chunk = await getText(chunkUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${specifier}: cannot inspect ${normalizedChunk} (${detail})`);
      continue;
    }

    const generatedDeps = extractSystemRegisterDependencies(chunk)
      .filter((dependency) => dependency.startsWith('__unresolved_'));
    const missingDeps = generatedDeps.filter((dependency) => !Object.prototype.hasOwnProperty.call(scope, dependency));
    if (missingDeps.length > 0) {
      failures.push(`${specifier} (${normalizedChunk}) missing ${missingDeps.join(', ')}`);
    }
  }
  return failures;
}

function normalizeChunkPath(chunkPath) {
  const normalized = String(chunkPath ?? '').replace(/\\/g, '/');
  return normalized.startsWith('./') ? normalized : `./${normalized.replace(/^\/+/, '')}`;
}

function extractSystemRegisterDependencies(chunk) {
  const match = String(chunk).match(/System\.register\(\s*\[([\s\S]*?)\]\s*,/);
  if (!match) {
    return [];
  }
  const dependencies = [];
  const quotedStringPattern = /"([^"]+)"|'([^']+)'/g;
  let token = quotedStringPattern.exec(match[1]);
  while (token) {
    dependencies.push(token[1] ?? token[2] ?? '');
    token = quotedStringPattern.exec(match[1]);
  }
  return dependencies.filter(Boolean);
}

async function appendSourceMapContent(chunkUrl, chunk) {
  try {
    const sourceMapText = await getText(`${chunkUrl}.map`);
    const sourceMap = JSON.parse(sourceMapText);
    const sourceContent = Array.isArray(sourceMap.sourcesContent) ? sourceMap.sourcesContent.join('\n') : '';
    return `${chunk}\n${sourceContent}`;
  } catch {
    return chunk;
  }
}

function getText(url) {
  return new Promise((resolve, reject) => {
    // 鍙鍙栨湰鏈?Preview 鐨勯潤鎬佷骇鐗╋紝涓嶈Е鍙?Cocos 璧勬簮鍐欏叆銆?
    const request = http.get(url, { timeout: 5000 }, (response) => {
      const chunks = [];
      response.setEncoding('utf8');
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`${url} returned HTTP ${response.statusCode}`));
          return;
        }
        resolve(chunks.join(''));
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`${url} timed out`));
    });
    request.on('error', (error) => {
      const detail = error instanceof Error ? `${error.code ? `${error.code}: ` : ''}${error.message}` : String(error);
      reject(new Error(`${url} failed: ${detail}`));
    });
  });
}

function headOk(url) {
  return new Promise((resolve) => {
    const request = http.request(url, { method: 'HEAD', timeout: 5000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => {
      resolve(false);
    });
    request.end();
  });
}
