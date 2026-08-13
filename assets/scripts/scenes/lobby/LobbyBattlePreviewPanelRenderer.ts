import {
  assetManager,
  AudioClip,
  AudioSource,
  BlockInputEvents,
  Button,
  Color,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  ImageAsset,
  Label,
  Node,
  resources,
  Size,
  sp,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  UIOpacity,
  Vec3,
  tween,
} from 'cc';
import type { LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import { isDailyDungeonStageCode } from '../../api/BattleApi';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { renderSceneBackButton } from '../UiSceneBackButton';
import {
  LOBBY_BATTLE_COMBAT_START_STEP,
  LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT,
  LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS,
  type LobbyBattlePanelState,
} from './LobbyBattleState';
import type { BattlePresentationLayout, BattlePresentationRect, BattlePresentationSlot } from './LobbyBattlePresentationLayout';
import { resolveBattlePresentationLayout } from './LobbyBattlePresentationLayout';
import { resolveLobbyBattlePresentationState, type LobbyBattlePresentationState } from './LobbyBattlePresentationState';
import {
  resolveLobbyBattlePresentationSnapshot,
  type BattlePresentationSnapshot,
  type BattlePresentationUnitSnapshot,
} from './LobbyBattlePresentationSnapshot';
import {
  resolveLobbyBattlePresentationTimeline,
  type BattlePresentationTimeline,
  type BattlePresentationTimelineEvent,
} from './LobbyBattlePresentationTimeline';
import {
  resolveBattleActionPresentationCues,
  resolveBattleActionCueVisibleWindowMs,
  resolveVisibleBattleActionPresentationCue,
  type BattleActionPresentationCue,
} from './LobbyBattleActionPresentation';
import {
  resolveBattleImpactProfile,
  type BattleImpactProfile,
  type BattleImpactRgba,
} from './LobbyBattleImpactDirector';
import {
  resolveBattlePresentationHpState,
  type BattlePresentationHpState,
} from './LobbyBattlePresentationHp';
import {
  isBattleVisualResultReady,
  resolveBattleVisualOutcome,
  resolveLobbyBattleVisualCompletionDurationMs,
} from './LobbyBattleVisualCompletion';
import {
  resolveBattleAssistPresentationCues,
  resolveVisibleBattleAssistPresentationCue,
  type BattleAssistPresentationCue,
} from './LobbyBattleAssistPresentation';
import {
  resolveBattleSettlementPresentationView,
  type BattleSettlementPresentationView,
} from './LobbyBattleSettlementPresentation';
import {
  resolveBattleAdaptivePerformanceProfile,
  type BattleAdaptivePerformanceProfile,
} from './LobbyBattleAdaptivePerformance';
import {
  resolveBattleAudioRuntimePlan,
  type BattleAudioCuePlan,
  type BattleAudioRuntimePlan,
} from './LobbyBattleAudioRuntime';
import {
  type BattleUnitSpineAnimationNames,
  isBattleUnitSpineDataAsset,
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineAnimationNames,
  resolveBattleUnitSpineLoadUuid,
  resolveBattleUnitSpineMirrorScaleX,
  resolveBattleUnitSpineNodePosition,
  resolveBattleUnitSpinePrimaryAsset,
  resolveBattleUnitSpineResource,
  resolveBattleUnitSpineRuntimeData,
  resolveBattleUnitSpineScale,
  resolveBattleUnitSpineSkinName,
  resolveBattleUnitSpineTelemetryVisualHeight,
} from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';
import {
  BATTLE_C1812_SKILL_FRAME_ACTIVE_ASSET,
  BATTLE_C1812_SKILL_FRAME_ASSET,
  BATTLE_C1812_HIT_BURST_EFFECT_ASSET,
  BATTLE_C1812_HIT_RING_ASSET,
  BATTLE_C1812_HIT_SLASH_ASSET,
  BATTLE_C1812_HIT_SPARK_ASSET,
  BATTLE_C1812_BUFF_STUN_ASSET,
  C1812_BUTTON_DANGER_ASSET,
  C1812_BUTTON_PRIMARY_ASSET,
  C1812_BUTTON_RETURN_ASSET,
  C1812_POPUP_FRAME_SMALL_ASSET,
  C1812_TITLE_BANNER_ASSET,
} from '../C1812CommonUiAssets';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { LOBBY_BATTLE_EMBEDDED_BG_DATA_URL } from './LobbyBattleEmbeddedBackground';
import { isDailyTrialStageCode, resolveBattleReplay, resolveBattleReplayCounterMultiplier } from './LobbyBattleReplayModel';
import { ultimateDamageScale } from './LobbyBattleHeroSkillConfig';

// 复用已导入的 battle_scene_cathedral UUID 槽位，实际源图已替换为横版沙漠战场，避免 Preview 等待新目录导入。
export const LOBBY_BATTLE_SCENE_BG_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame';
export const LOBBY_BATTLE_SCENE_GROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame';
export const LOBBY_BATTLE_SCENE_FOREGROUND_ASSET: string = 'ui/battle/battle_scene_cathedral/spriteFrame';

// C1812 战斗 HUD 视觉资源：血条框/条与胜负战旗。
export const BATTLE_C1812_HP_BAR_FRAME_ASSET = 'ui/battle/ai/hp_frame/spriteFrame';
export const BATTLE_C1812_HP_BAR_FILL_ASSET = 'ui/battle/ai/hp_fill/spriteFrame';
// AI 怪物立绘(P0):按角色映射,grunt 双前排哈希轮换、披风怨灵配后排、精英黑甲骑士配 boss/精英。
// 宽高比来自处理后成品,保持原比例显示不拉伸。
const BATTLE_AI_MONSTER_PORTRAITS: ReadonlyArray<{ path: string; aspect: number }> = [
  { path: 'ui/battle/ai/monster_grunt_1/spriteFrame', aspect: 670 / 640 },
  { path: 'ui/battle/ai/monster_grunt_2/spriteFrame', aspect: 656 / 640 },
];
const BATTLE_AI_MONSTER_BACK_PORTRAIT = { path: 'ui/battle/ai/monster_grunt_3/spriteFrame', aspect: 776 / 640 };
const BATTLE_AI_MONSTER_ELITE_PORTRAIT = { path: 'ui/battle/ai/monster_elite/spriteFrame', aspect: 1133 / 768 };
export const BATTLE_C1812_BANNER_VICTORY_ASSET = 'ui/battle/ai/banner_victory/spriteFrame';
export const BATTLE_C1812_BANNER_DEFEAT_ASSET = 'ui/battle/ai/banner_defeat/spriteFrame';
// C1812 结算弹窗套件：羊皮纸主框 / 精致奖励格 / named 英雄结算头像(与骨骼同名)。
export const BATTLE_C1812_POPUP_FRAME_PARCHMENT_ASSET = 'ui/common/ai/popup_frame_large/spriteFrame';
export const BATTLE_C1812_REWARD_SLOT_ORNATE_ASSET = 'ui/common/ai/item_slot/spriteFrame';
const BATTLE_C1812_RESULT_PORTRAIT_DIR = 'ui/hero/c1812/result_portrait/';
const BATTLE_C1812_RESULT_PORTRAIT_ASSETS = new Set([
  'Nuu', 'Ishmael', 'IshmaelA', 'Carmilla', 'Eulenspigel', 'Belladonna', 'LucienA', 'Lucrecia',
  'Sphinx', 'HeylelS01', 'Hopkins', 'Robert', 'Saighead', 'Simone', 'Sirucus',
]);

function resolveBattleResultPortraitPath(unit: { spineAsset?: string | null; portraitAsset?: string | null }): string | null {
  const asset = (unit.spineAsset || unit.portraitAsset || '').trim();
  return BATTLE_C1812_RESULT_PORTRAIT_ASSETS.has(asset) ? `${BATTLE_C1812_RESULT_PORTRAIT_DIR}${asset}/spriteFrame` : null;
}
const BATTLE_OPENING_ENTRY_DISTANCE_RATIO = 0.96;
// 进场 spine 逐 actor 错峰步长(毫秒):第 0 个立即建,其余每个顺延一步,摊平进场骨骼构建尖峰。
const BATTLE_SPINE_BUILD_STAGGER_MS = 55;
// 进战资产加载门:全部任务落定或超时即放行(单个资源卡死不阻塞进战)。
const BATTLE_ASSET_PRELOAD_TIMEOUT_MS = 10_000;
const BATTLE_ASSET_LOADING_TIPS = [
  '提示：克制敌方职业可以打出更高伤害',
  '提示：大招就绪后点击底部技能卡立即释放',
  '提示：每日副本难度越高，材料产出越丰厚',
  '提示：战力不足时，先强化装备或升级英雄',
];
const BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO = 0.76;
const BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO = 1.28;
const BATTLE_OPENING_LANE_ENTRY_RATIOS = [0.94, 1.08, 1.0, 1.18, 1.24] as const;
const BATTLE_ACTOR_POSITION_EPSILON = 0.45;
const BATTLE_ACTOR_FRAME_MAX_DELTA = 42;
// 战斗地面带(2026-07-13 参考图重排):背景等比放大 1.45× 底边对齐后,可站立地面约占画面下 48%,
// 站位带相应扩高(300→420)并把顶界抬过中线,配合纵深两排排列,战场不再挤在一条窄横带上。
const BATTLE_GROUND_MIN_Y = -380;
const BATTLE_GROUND_MAX_Y = 40;
const BATTLE_GROUND_CONVERGED_Y_SCALE = 0.78;
const BATTLE_GROUND_ACTION_LANE_Y_SCALE = 0.4;
const BATTLE_MELEE_DUEL_CONTACT_GAP_RATIO = 0.035;
const BATTLE_MELEE_DUEL_DEFENDER_STEP_RATIO = 0.1;
const BATTLE_MELEE_ATTACKER_FOOTPRINT_RATIO = 0.06;
const BATTLE_MELEE_TARGET_FOOTPRINT_RATIO = 0.05;
const BATTLE_MELEE_CONTACT_GAP_RATIO = BATTLE_MELEE_DUEL_CONTACT_GAP_RATIO;
const BATTLE_MELEE_DEFENDER_STEP_RATIO = BATTLE_MELEE_DUEL_DEFENDER_STEP_RATIO;
const BATTLE_ACTOR_MELEE_APPROACH_MS = 1500;
const BATTLE_ACTOR_BASIC_ATTACK_APPROACH_MS = 640;
const BATTLE_ACTOR_BASIC_ATTACK_ANIMATION_PREWARM_MS = 260;
const BATTLE_ACTOR_BASIC_ATTACK_CONTACT_HOLD_MS = 2520;
const BATTLE_ACTOR_ROOT_MOTION_LEAD_MS = 1200;
const BATTLE_ACTOR_ROOT_MOTION_FRAME_MAX_DELTA = 44;
const BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR = 1;
const BATTLE_ACTOR_RANGED_NUDGE_MS = 180;
const BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS = 150;
const BATTLE_ACTOR_ATTACK_RETURN_MS = 1680;
const BATTLE_ACTOR_CLASH_APPROACH_LUNGE_X = 108;
const BATTLE_ACTOR_CLASH_ATTACK_LUNGE_X = 88;
const BATTLE_ACTOR_CLASH_HIT_HOLD_LUNGE_X = 82;
// 开场全员冲锋：战斗一开始，所有 front 近战单位（双方）用 run 一起跑到中线交锋区，到位后再就地交战。
// 冲锋只用真实时间驱动（与时间线压缩无关），保证无论快慢都是一次清晰可见的跑步而非瞬移。
const BATTLE_ACTOR_FRONT_CHARGE_MS = 1700;
const BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP = 112;
// 冲锋采用"按固定距离前推 + 夹紧不过中线"，保留各车道的 X 错位，使前线散开成松散队形而不是叠成一竖列。
const BATTLE_ACTOR_FRONT_CHARGE_DISTANCE = 300;
// 交锋区就地混战节奏：到位后每个 front 近战按此周期循环播放攻击/技能动画，并按单位错峰，避免整齐划一。
const BATTLE_ACTOR_CLASH_ATTACK_CYCLE_MS = 1500;
// 战斗倒计时：90 秒上限，从首个战斗动作起倒数;数值推演提前打完则倒计时随 playback 冻结在剩余值。
const BATTLE_COMBAT_COUNTDOWN_MS = 90_000;
const BATTLE_ACTOR_CLASH_IDLE_SWAY_X = 18;
const BATTLE_ACTOR_CLASH_IDLE_SWAY_Y = 5;
const BATTLE_ENABLE_FRONT_CLASH_CHARGE = false;
const BATTLE_ENABLE_IDLE_CLASH_COMBAT = false;
const BATTLE_USE_STICKY_CONTACT_POSITIONS = true;
const BATTLE_STICKY_CONTACT_HOLD_MS = 60_000;
const BATTLE_SHOW_PREVIEW_DEBUG_HUD = false;
const BATTLE_DEAD_ACTOR_HIDE_DELAY_MS = 0;
const BATTLE_FLOATING_TEXT_LIFETIME_MS = 300;
const BATTLE_FLOATING_TEXT_MIN_CUE_INTERVAL_MS = 320;
const BATTLE_ASSIST_FLOATING_TEXT_DELAY_MS = 340;
const BATTLE_ACTION_CALLOUT_ENABLED = false;
const BATTLE_IMPACT_HIT_STOP_LAYER_NAME = 'LobbyBattleImpactHitStopLayer';
const BATTLE_TRANSIENT_EFFECT_NODE_NAMES = new Set([
  'LobbyBattleActionFloatingTextLayer',
  'LobbyBattleAssistFloatingTextLayer',
  'LobbyBattleImpactSlashLayer',
  'LobbyBattleImpactSpriteLayer',
  BATTLE_IMPACT_HIT_STOP_LAYER_NAME,
  'LobbyBattleActionProjectileLayer',
  'LobbyBattleActionTargetSpineEffectLayer',
  'LobbyBattleAssistAuraLayer',
]);
const BATTLE_PROTAGONIST_MALE_FALLBACK_ASSET = 'ui/protagonist/protagonist_male_attack/spriteFrame';
const BATTLE_PROTAGONIST_FEMALE_FALLBACK_ASSET = 'ui/protagonist/protagonist_female_attack/spriteFrame';

interface BattleActionAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  enemy: boolean;
  role: BattlePresentationUnitSnapshot['role'];
}

interface BattleMeleeDuelFrame {
  actorDuelPosition: { x: number; y: number };
  defenderDuelPosition: { x: number; y: number };
  hitPoint: { x: number; y: number };
}

interface RenderableBattleUnit {
  unit: BattlePresentationUnitSnapshot;
  slot: BattlePresentationSlot;
  sourceIndex: number;
}

interface RenderableBattleActor extends RenderableBattleUnit {
  enemy: boolean;
}

// 回放驱动位置脚本：每个单位的战斗期位置唯一由"它自己的回放动作"决定——锁定目标→跑到面前→攻击→停留,
// 目标死亡后由下一个动作带它跑向新目标;没有任何阵位回弹/保持分散/摇摆等其他位置来源,从根上消除乱飘。
interface BattleActorScriptSegment {
  startMs: number;
  approachMs: number;
  endMs: number;
  fromX: number;
  fromY: number;
  duelX: number;
  duelY: number;
  // 攻击位/待机位分离:动作结束后退半步到待机位,同时只有"正在出手"的单位贴在目标脸上,群战不堆积。
  restX: number;
  restY: number;
  // 收工归位段:单位不再参战后跑回初始阵位,归位途中播 run、到位后播 idle。
  returnHome?: boolean;
}

// 手动大招:玩家点满能技能卡释放。以"合成命中事件"进入 HP 状态与伤害 cue 链,能真实加速通关。
interface BattleManualUltRecord {
  unitKey: string;
  targetKey: string;
  timeMs: number;
  amount: number;
  hitKey: string;
  eventSeq: number;
  actionSeq: number;
}

const BATTLE_MANUAL_ULT_ENERGY_MAX = 100;
const BATTLE_MANUAL_ULT_ENERGY_PER_ACTION = 25;
const BATTLE_MANUAL_ULT_ENERGY_PER_HIT_TAKEN = 15;
const BATTLE_MANUAL_ULT_ENERGY_PER_SECOND = 4;
const BATTLE_MANUAL_ULT_DAMAGE_ATTACK_SCALE = 2.6;
const BATTLE_MANUAL_ULT_EVENT_SEQ_BASE = 90_000;

interface BattleOpeningConvergenceState {
  active: boolean;
  moving: boolean;
  startProgress: number;
  elapsedMs: number;
  durationMs: number;
}

export interface LobbyBattlePreviewPanelHost {
  node: Node;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  currentLobbyBattleState(): LobbyBattlePanelState;
  startLobbyBattleSession(): void;
  settleLobbyBattleSession(): void;
  closeLobbyBattlePreviewPanel(): void;
  returnToLobbyFromBattlePreview(): void;
  // 下一关直达:内部做解锁校验,未解锁回爬塔面板提示,不写任何玩家状态。
  openLobbyBattlePreviewPanel(stageCode: string): void;
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize?: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

/** 战斗表现面板。只展示 battle start/settle 的后端权威回执，不在客户端发奖。
 * 当前视觉验收动作节点包括 LobbyBattleStartButton、LobbyBattlePlaybackPending、LobbyBattleReturnLobbyButton。 */
export class LobbyBattlePreviewPanelRenderer {
  // 骨骼数据缓存已收敛到全局 SpineDataStore(2026-08-04),不再各页私有。
  // 进战加载界面进度条就地更新引用(全量重建太重,进度 tick 只改这两个节点)。
  private battleLoadingFillNode: Node | null = null;
  private battleLoadingPercentLabel: Label | null = null;
  private battleLoadingBarWidth = 0;
  private battleLoadingBarHeight = 0;
  private readonly battleAudioClipCache = new Map<string, AudioClip>();
  private readonly battleAudioLoadCallbacks = new Map<string, Array<(clip: AudioClip | null) => void>>();
  private readonly battleAudioPlayedKeys = new Set<string>();
  private lastBattleSceneKey = '';
  private battleSceneRoot: Node | null = null;
  private battleFieldNode: Node | null = null;
  private readonly battlePlaybackNodes = new Map<string, Node>();
  private readonly battleActorFramePositions = new Map<string, Vec3>();
  private readonly battleActorStickyCombatPositions = new Map<string, Vec3>();
  private readonly battleActorStickyCombatHoldUntilMs = new Map<string, number>();
  private readonly battleActorMotionStartPositions = new Map<string, Vec3>();
  // 每个单位显示位置上次提交的真实时刻：位置平滑按真实时间速度上限执行，低帧率下也不会退化成大步跳变。
  private readonly battleActorFrameUpdateMs = new Map<string, number>();
  // 技能卡组内容签名:回放每 16ms 触发一次卡组刷新,但卡面只在 hp%/能量%/出手·受击·辅助·大招态变化时才变;
  // 签名不变(且无大招就绪呼吸帧)时跳过整组销毁重建,把 60 次/秒重建压到"仅可见变化时重建"。
  private lastHeroCardDeckSignature: string | null = null;
  // 敌方全灭后胜利结算只弹一次。
  private battleVictoryBannerShown = false;
  // 手动大招释放记录(运行时账本),叠加进 HP 状态与伤害 cue 链。
  private readonly battleManualUlts: BattleManualUltRecord[] = [];
  // 大招引导横幅每场战斗只弹一次。
  private battleUltReadyHintShown = false;
  // 大招点击走常驻点击层:技能卡组每个回放刷新步都会销毁重建,挂在卡上的 Button 会在
  // 按下与抬起之间被销毁导致真实点击永远不触发;点击层常驻,渲染帧只更新上下文。
  private battleDeckClickContext: {
    heroes: BattlePresentationUnitSnapshot[];
    snapshot: BattlePresentationSnapshot;
    timeline: BattlePresentationTimeline;
    playbackTimelineTimeMs: number;
    hpState: BattlePresentationHpState;
    cardWidth: number;
    cardHeight: number;
    gap: number;
    deckWidth: number;
  } | null = null;
  // 回放驱动位置脚本缓存(按 replayKey+scale)：战斗期单位位置的唯一事实来源。
  private battleActorPositionScript: {
    key: string;
    segments: Map<string, BattleActorScriptSegment[]>;
    initial: Map<string, { x: number; y: number }>;
  } | null = null;
  private readonly battleActorMeleeDuelFrames = new Map<string, BattleMeleeDuelFrame>();
  // 每个 front 单位首次进入战斗(roundPlaying)的真实时刻，用于驱动开场冲锋的真实时间进度。
  private readonly battleActorChargeStartMs = new Map<string, number>();
  private readonly playedBattleCueKeys = new Set<string>();
  private readonly battleActorHomePositions = new Map<string, Vec3>();
  private readonly battleActorPositionInitialized = new Set<Node>();
  private battleRenderGeneration = 0;
  // 进场 spine 分帧构建:同一 render 代际内逐个 actor 错峰创建骨骼,避免(尤其数据已缓存的重复进场)
  // 5 个 spine mesh 同帧构建造成的进场卡顿;错峰期间保留 fallback 剪影占位,建好即替换。
  private battleSpineStaggerGeneration = -1;
  private battleSpineStaggerSlot = 0;
  private readonly battleTelemetryBuckets = new Set<string>();
  private readonly battleFloatingTextLastAtByTarget = new Map<string, number>();
  private battleBackgroundAssetFrame: SpriteFrame | null = null;
  private battleBackgroundAssetLoading = false;
  private readonly battleBackgroundAssetCallbacks: Array<(frame: SpriteFrame | null) => void> = [];
  private battleEmbeddedBackgroundFrame: SpriteFrame | null = null;
  private battleEmbeddedBackgroundLoading = false;
  private readonly battleEmbeddedBackgroundCallbacks: Array<(frame: SpriteFrame | null) => void> = [];

  constructor(private readonly host: LobbyBattlePreviewPanelHost) {}

  canRefreshPlayback(): boolean {
    const battleState = this.host.currentLobbyBattleState();
    return !!battleState.start
      && !this.requiresFullBattleSceneRender(battleState)
      && !!this.lastBattleSceneKey
      && this.lastBattleSceneKey === this.resolveBattleSceneKey(battleState)
      && this.isNodeMounted(this.battleSceneRoot)
      && this.isNodeMounted(this.battleFieldNode);
  }

  refreshPlayback(layout: UiLayout): void {
    if (!this.canRefreshPlayback()) {
      return;
    }
    const heroState = this.host.currentLobbyHeroRosterState();
    const battleState = this.host.currentLobbyBattleState();
    const presentation = resolveLobbyBattlePresentationState(battleState);
    const snapshot = resolveLobbyBattlePresentationSnapshot(battleState, heroState.heroes);
    const timeline = resolveLobbyBattlePresentationTimeline(snapshot);
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const frameWidth = Math.min(layout.stageWidth, Math.max(320 * scale, layout.width));
    const frameHeight = Math.min(layout.stageHeight, Math.max(240 * scale, layout.height));
    const presentationLayout = resolveBattlePresentationLayout(frameWidth, frameHeight, scale);
    const performanceProfile = resolveBattleAdaptivePerformanceProfile(presentationLayout, snapshot, timeline, presentation, scale);
    const openingConvergence = this.resolveBattleOpeningConvergenceState(battleState.presentationStep, battleState.presentationElapsedMs, presentation);
    const visualCompletionDurationMs = resolveLobbyBattleVisualCompletionDurationMs(snapshot, timeline);
    const playbackTimelineTimeMs = this.resolveBattlePlaybackTimelineTimeMs(timeline, battleState.presentationElapsedMs, presentation, visualCompletionDurationMs);
    const timelineToPresentationRatio = this.resolveBattleTimelineToPresentationRatio(timeline, visualCompletionDurationMs);
    const currentTimelineEvent = this.resolveVisibleTimelineEvent(timeline, battleState.presentationStep, battleState.presentationElapsedMs, presentation, visualCompletionDurationMs);
    const actionCues = resolveBattleActionPresentationCues(timeline, snapshot);
    let currentActionCue = openingConvergence.active ? null : resolveVisibleBattleActionPresentationCue(actionCues, currentTimelineEvent, playbackTimelineTimeMs, timelineToPresentationRatio);
    let activeDamageCues = openingConvergence.active ? [] : this.resolveActiveDamageActionCues(actionCues, playbackTimelineTimeMs, timelineToPresentationRatio);
    const assistCues = resolveBattleAssistPresentationCues(timeline, snapshot);
    const currentAssistCue = openingConvergence.active ? null : resolveVisibleBattleAssistPresentationCue(assistCues, currentTimelineEvent, playbackTimelineTimeMs);
    const hpState = this.resolveBattleHpStateWithManualUlts(snapshot, timeline, playbackTimelineTimeMs);
    currentActionCue = this.resolveLiveBattleActionCue(currentActionCue, hpState, playbackTimelineTimeMs);
    activeDamageCues = activeDamageCues
      .concat(this.resolveManualUltDamageCues(snapshot, playbackTimelineTimeMs))
      .filter((cue) => this.shouldShowBattleActionCueForLiveUnits(cue, hpState, playbackTimelineTimeMs));
    const allyActors = this.resolveRenderableBattleUnits(presentationLayout.allySlots, snapshot.allies, false);
    const enemyActors = this.resolveRenderableBattleUnits(presentationLayout.enemySlots, snapshot.enemies, true);
    const renderActors = [
      ...allyActors.map((actor) => ({ ...actor, enemy: false })),
      ...enemyActors.map((actor) => ({ ...actor, enemy: true })),
    ];
    this.ensureBattleActorPositionScript(renderActors, snapshot, timeline, scale);
    const actionAnchors = this.createBattleActionAnchorMap(allyActors, enemyActors, scale, presentation, openingConvergence);
    const frameAnchors = this.createBattleFrameAnchorMap(renderActors, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors);
    const field = this.battleFieldNode;
    if (!field || !this.isNodeAlive(field)) {
      return;
    }

    this.refreshBattleCombatHud(field, presentationLayout.field.width, presentationLayout.field.height, scale, snapshot, presentation, currentTimelineEvent, timeline, playbackTimelineTimeMs);
    // 输出试炼(难度Ⅲ):顶部厚血条=BOSS巨兽血量(掉多少≈相对输出);常规副本仍不显示(与逐怪血条重复)。
    if (isDailyTrialStageCode(snapshot.stageCode)) {
      this.refreshBattleBossGaugePlayback(field, presentationLayout.field.width, presentationLayout.field.height, scale, snapshot, presentation, hpState);
    }
    allyActors.forEach((actor, index) => this.updateBattleActorPlayback(actor, index, false, scale, presentation, snapshot, actionCues, currentActionCue, currentAssistCue, actionAnchors, openingConvergence, playbackTimelineTimeMs, timelineToPresentationRatio, hpState));
    enemyActors.forEach((actor, index) => this.updateBattleActorPlayback(actor, index, true, scale, presentation, snapshot, actionCues, currentActionCue, currentAssistCue, actionAnchors, openingConvergence, playbackTimelineTimeMs, timelineToPresentationRatio, hpState));
    this.refreshStage12HeroCardDeck(field, presentationLayout.field.width, presentationLayout.field.height, scale, snapshot, presentation, currentActionCue, currentAssistCue, hpState, timeline, playbackTimelineTimeMs);
    this.renderBattleCueEffectsOnce(field, presentationLayout.field.width, presentationLayout.field.height, scale, presentation, snapshot, timeline, performanceProfile, currentTimelineEvent, currentActionCue, activeDamageCues, currentAssistCue, assistCues, actionAnchors, frameAnchors, openingConvergence, hpState);
    // 敌方全灭即时弹出胜利结算(每帧刷新路径,只弹一次),不等 90 秒演出窗口跑满触发全量渲染。
    if (!this.battleVictoryBannerShown && isBattleVisualResultReady(hpState, playbackTimelineTimeMs)) {
      this.battleVictoryBannerShown = true;
      this.renderResultBanner(field, presentationLayout.field.width, presentationLayout.field.height, scale, battleState, presentation, snapshot, hpState, playbackTimelineTimeMs);
      // 视觉胜负确认即提前提交结算:消除"胜利框→演出窗口跑满"的空窗,期间离场不再丢结算。
      // 用 setTimeout 移出当前渲染帧,避免 settle→bump→重渲染的同步重入。
      setTimeout(() => this.host.settleLobbyBattleSession(), 0);
    }
  }

  render(layout: UiLayout): void {
    const renderGeneration = this.bumpBattleRenderGeneration();
    const heroState = this.host.currentLobbyHeroRosterState();
    const battleState = this.host.currentLobbyBattleState();
    const presentation = resolveLobbyBattlePresentationState(battleState);
    const settlementView = resolveBattleSettlementPresentationView(battleState, presentation);
    const snapshot = resolveLobbyBattlePresentationSnapshot(battleState, heroState.heroes);
    const timeline = resolveLobbyBattlePresentationTimeline(snapshot);
    const sceneKey = this.resolveBattleSceneKey(battleState);
    // 加载门期间进度 tick 高频到达:加载界面已挂载时只就地更新进度条,不整场重建。
    if (
      this.isBattleAssetLoadingPhase(battleState)
      && sceneKey === this.lastBattleSceneKey
      && this.isNodeMounted(this.battleSceneRoot)
    ) {
      this.updateBattleAssetLoadingProgress(battleState);
      return;
    }
    const requiresFullBattleSceneRender = this.requiresFullBattleSceneRender(battleState);
    if (
      !requiresFullBattleSceneRender
      && sceneKey === this.lastBattleSceneKey
      && this.isNodeMounted(this.battleSceneRoot)
      && this.hasBattleSceneImageLayers(this.battleSceneRoot)
    ) {
      this.refreshPlayback(layout);
      return;
    }
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const sceneWidth = Math.max(320 * scale, layout.width);
    const sceneHeight = Math.max(240 * scale, layout.height);
    const frameWidth = Math.min(layout.stageWidth, sceneWidth);
    const frameHeight = Math.min(layout.stageHeight, sceneHeight);
    const presentationLayout = resolveBattlePresentationLayout(frameWidth, frameHeight, scale);
    const performanceProfile = resolveBattleAdaptivePerformanceProfile(presentationLayout, snapshot, timeline, presentation, scale);
    this.resetBattlePlaybackRuntime(sceneKey);

    const dim = this.createUiNode('LobbyBattlePreviewDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 166);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, () => {
      // 结果已记录后，遮罩点击也回大厅，避免玩家回到旧编队后复用已结算状态。
      if (presentation.returnToLobby) {
        this.host.returnToLobbyFromBattlePreview();
        return;
      }
      this.host.closeLobbyBattlePreviewPanel();
    }, this);

    const sceneRoot = this.createUiNode('LobbyBattleSceneRoot');
    this.battleSceneRoot = sceneRoot;
    sceneRoot.setPosition(new Vec3(centerX, centerY, 0));
    sceneRoot.addComponent(UITransform).setContentSize(new Size(sceneWidth, sceneHeight));
    // 全屏战斗层必须吞掉输入，防止战斗演出点击穿透到底层大厅。
    sceneRoot.addComponent(BlockInputEvents);
    this.drawBattleFallbackLandscape(sceneRoot, sceneWidth, sceneHeight, scale, false);
    // 背景等比放大 1.45×、底边与面板底对齐:只露出原图下部 ~69%,原"下 1/3 地面"在画面中占 ~48%,
    // 战场地面开阔化(参考图2 天:地≈1:2)。等比缩放+裁切,不改素材、不变形。
    const bg = this.addBattleBackgroundSprite('LobbyBattleSceneBackdropSprite', 0, sceneHeight * 0.225, sceneWidth * 1.45, sceneHeight * 1.45, sceneRoot);
    void bg;
    this.renderBattleSceneEnvironmentLayers(sceneRoot, sceneWidth, sceneHeight, scale);
    this.drawBattleSceneAtmosphere(sceneRoot, sceneWidth, sceneHeight, scale, presentation, performanceProfile);
    // 进战资产加载门:从点开面板到骨骼/立绘就绪前只展示加载界面(战场背景+关卡名+进度条),
    // 演出计时由 LobbyBattleFlow 在预载完成后才启动,揭幕即整装开打。
    if (this.isBattleAssetLoadingPhase(battleState)) {
      this.renderBattleAssetLoadingScreen(sceneRoot, sceneWidth, sceneHeight, scale, battleState);
      return;
    }
    const panelWidth = frameWidth;
    const panelHeight = frameHeight;
    const panelGroup = this.host.addChildPlainNode(sceneRoot, 'LobbyBattlePreviewPanel', 0, 0, panelWidth, panelHeight);
    // 战斗表现层内部点击必须被吞掉，避免点单位、日志、按钮附近时误触遮罩关闭。
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(
      panelGroup,
      'LobbyBattlePreviewPanelFrame',
      0,
      0,
      panelWidth,
      panelHeight,
    );
    this.drawBattleBackdrop(panel, panelWidth, panelHeight, scale, presentation);
    this.renderHeader(panel, panelWidth, panelHeight, scale, battleState, presentation);
    this.renderBattleField(panel, presentationLayout, scale, battleState, presentation, settlementView, performanceProfile, snapshot, timeline, renderGeneration);
    this.renderFooter(panel, presentationLayout, scale, battleState, presentation, settlementView);
    renderSceneBackButton(this.host, sceneRoot, layout, 'LobbyBattlePreviewBackButton', () => {
      if (presentation.returnToLobby) {
        this.host.returnToLobbyFromBattlePreview();
        return;
      }
      this.host.closeLobbyBattlePreviewPanel();
    }, scale, '战斗');
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private bumpBattleRenderGeneration(): number {
    this.battleRenderGeneration += 1;
    return this.battleRenderGeneration;
  }

  private isBattleRenderGenerationCurrent(renderGeneration: number): boolean {
    return renderGeneration === this.battleRenderGeneration;
  }

  private isNodeAlive(node: Node | null | undefined): node is Node {
    try {
      return !!node && node.isValid === true;
    } catch {
      return false;
    }
  }

  private isNodeMounted(node: Node | null | undefined): node is Node {
    return this.isNodeAlive(node) && !!node.parent;
  }

  private isBattleAudioSourceNodeValid(audioSource: AudioSource | null | undefined): boolean {
    if (!audioSource) {
      return false;
    }
    try {
      return this.isNodeAlive(audioSource.node);
    } catch {
      return false;
    }
  }

  private hasBattleSceneImageLayers(sceneRoot: Node): boolean {
    return !!sceneRoot.getChildByName('LobbyBattleSceneBackdropSprite') && this.isBattleBackgroundAssetLoadedForTelemetry();
  }

  private addEmbeddedBattleBackgroundSprite(name: string, x: number, y: number, width: number, height: number, parent: Node): Sprite {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(new Size(width, height));
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (this.battleEmbeddedBackgroundFrame) {
      sprite.spriteFrame = this.battleEmbeddedBackgroundFrame;
      this.recordBattleBackgroundTelemetry('embedded', true);
      return sprite;
    }
    this.recordBattleBackgroundTelemetry('embedded', false);
    this.loadEmbeddedBattleBackgroundFrame((frame) => {
      if (!frame || !this.isNodeAlive(node)) {
        return;
      }
      sprite.spriteFrame = frame;
      this.recordBattleBackgroundTelemetry('embedded', true);
    });
    return sprite;
  }

  private addBattleBackgroundSprite(name: string, x: number, y: number, width: number, height: number, parent: Node): Sprite | null {
    const sprite = this.host.addSprite(name, LOBBY_BATTLE_SCENE_BG_ASSET, x, y, width, height, parent);
    if (sprite) {
      this.recordBattleBackgroundTelemetry('asset', true);
      return sprite;
    }
    this.recordBattleBackgroundTelemetry('asset', false);
    const fallback = this.addEmbeddedBattleBackgroundSprite(name, x, y, width, height, parent);
    this.applyBattleBackgroundAssetWhenReady(fallback);
    return fallback;
  }

  private applyBattleBackgroundAssetWhenReady(sprite: Sprite): void {
    this.loadBattleBackgroundAssetFrame((frame) => {
      if (!frame || !this.isNodeAlive(sprite.node)) {
        return;
      }
      sprite.type = Sprite.Type.SIMPLE;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      this.recordBattleBackgroundTelemetry('asset', true);
    });
  }

  private loadBattleBackgroundAssetFrame(callback: (frame: SpriteFrame | null) => void): void {
    if (this.battleBackgroundAssetFrame) {
      callback(this.battleBackgroundAssetFrame);
      return;
    }
    this.battleBackgroundAssetCallbacks.push(callback);
    if (this.battleBackgroundAssetLoading) {
      return;
    }
    this.battleBackgroundAssetLoading = true;
    resources.load(LOBBY_BATTLE_SCENE_BG_ASSET, SpriteFrame, (error, frame) => {
      this.battleBackgroundAssetLoading = false;
      if (error || !frame) {
        console.warn(`[BattleStage13V] battle background asset failed to load: ${LOBBY_BATTLE_SCENE_BG_ASSET}`, error);
        this.flushBattleBackgroundAssetCallbacks(null);
        return;
      }
      this.battleBackgroundAssetFrame = frame;
      this.flushBattleBackgroundAssetCallbacks(frame);
    });
  }

  private flushBattleBackgroundAssetCallbacks(frame: SpriteFrame | null): void {
    const callbacks = this.battleBackgroundAssetCallbacks.splice(0, this.battleBackgroundAssetCallbacks.length);
    callbacks.forEach((callback) => callback(frame));
  }

  private isBattleBackgroundAssetLoadedForTelemetry(): boolean {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        background?: {
          source: 'asset' | 'embedded' | 'fallback';
          loaded: boolean;
        };
      };
    };
    const background = root.__lootchainBattlePlaybackTelemetry?.background;
    return background?.source === 'asset' && background.loaded === true;
  }

  private loadEmbeddedBattleBackgroundFrame(callback: (frame: SpriteFrame | null) => void): void {
    if (this.battleEmbeddedBackgroundFrame) {
      callback(this.battleEmbeddedBackgroundFrame);
      return;
    }
    this.battleEmbeddedBackgroundCallbacks.push(callback);
    if (this.battleEmbeddedBackgroundLoading) {
      return;
    }
    this.battleEmbeddedBackgroundLoading = true;
    const image = new Image();
    image.onload = () => {
      try {
        const imageAsset = new ImageAsset(image);
        const texture = new Texture2D();
        texture.image = imageAsset;
        const frame = new SpriteFrame();
        frame.texture = texture;
        this.battleEmbeddedBackgroundFrame = frame;
        this.flushEmbeddedBattleBackgroundCallbacks(frame);
      } catch (error) {
        console.warn('[BattleStage13W] embedded battle background failed to create SpriteFrame', error);
        this.flushEmbeddedBattleBackgroundCallbacks(null);
      }
    };
    image.onerror = () => {
      console.warn('[BattleStage13W] embedded battle background failed to load');
      this.flushEmbeddedBattleBackgroundCallbacks(null);
    };
    image.src = LOBBY_BATTLE_EMBEDDED_BG_DATA_URL;
  }

  private flushEmbeddedBattleBackgroundCallbacks(frame: SpriteFrame | null): void {
    this.battleEmbeddedBackgroundLoading = false;
    const callbacks = this.battleEmbeddedBackgroundCallbacks.splice(0, this.battleEmbeddedBackgroundCallbacks.length);
    callbacks.forEach((callback) => callback(frame));
  }

  private recordBattleBackgroundTelemetry(source: 'asset' | 'embedded' | 'fallback', loaded: boolean): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        background?: {
          source: 'asset' | 'embedded' | 'fallback';
          loaded: boolean;
          at: number;
        };
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    const previous = telemetry.background;
    if (previous?.loaded === true && loaded !== true) {
      root.__lootchainBattlePlaybackTelemetry = telemetry;
      return;
    }
    telemetry.background = {
      source,
      loaded,
      at: Date.now(),
    };
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private renderHeader(parent: Node, width: number, height: number, scale: number, state: LobbyBattlePanelState, presentation: LobbyBattlePresentationState): void {
    if (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded') {
      return;
    }
    const title = this.host.addChildLabel(parent, 'LobbyBattlePreviewTitle', presentation.title, 0, height / 2 - 42 * scale, 29 * scale, rgba(252, 225, 158), new Size(width - 100 * scale, 38 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const status = this.host.addChildLabel(parent, 'LobbyBattlePreviewStatus', presentation.subtitle, 0, height / 2 - 76 * scale, 19 * scale, rgba(204, 167, 88), new Size(width - 112 * scale, 28 * scale));
    status.overflow = Label.Overflow.SHRINK;
    if (state.error) {
      const error = this.host.addChildLabel(parent, 'LobbyBattlePreviewError', state.error, 0, height / 2 - 102 * scale, 17 * scale, rgba(255, 116, 116), new Size(width - 112 * scale, 24 * scale));
      error.overflow = Label.Overflow.SHRINK;
    }
  }

  private renderBattleField(
    parent: Node,
    layout: BattlePresentationLayout,
    scale: number,
    state: LobbyBattlePanelState,
    presentation: LobbyBattlePresentationState,
    settlementView: BattleSettlementPresentationView,
    performanceProfile: BattleAdaptivePerformanceProfile,
    snapshot: BattlePresentationSnapshot,
    timeline: BattlePresentationTimeline,
    renderGeneration: number,
  ): void {
    const fieldRect = layout.field;
    const field = this.host.addChildPlainNode(parent, 'LobbyBattlePreviewField', fieldRect.x, fieldRect.y, fieldRect.width, fieldRect.height);
    this.battleFieldNode = field;
    this.renderBattleFieldEnvironment(field, fieldRect.width, fieldRect.height, scale);
    const graphics = field.addComponent(Graphics);
    const openingConvergence = this.resolveBattleOpeningConvergenceState(state.presentationStep, state.presentationElapsedMs, presentation);
    const visualCompletionDurationMs = resolveLobbyBattleVisualCompletionDurationMs(snapshot, timeline);
    const playbackTimelineTimeMs = this.resolveBattlePlaybackTimelineTimeMs(timeline, state.presentationElapsedMs, presentation, visualCompletionDurationMs);
    const timelineToPresentationRatio = this.resolveBattleTimelineToPresentationRatio(timeline, visualCompletionDurationMs);
    const currentTimelineEvent = this.resolveVisibleTimelineEvent(timeline, state.presentationStep, state.presentationElapsedMs, presentation, visualCompletionDurationMs);
    const actionCues = resolveBattleActionPresentationCues(timeline, snapshot);
    let currentActionCue = openingConvergence.active ? null : resolveVisibleBattleActionPresentationCue(actionCues, currentTimelineEvent, playbackTimelineTimeMs, timelineToPresentationRatio);
    let activeDamageCues = openingConvergence.active ? [] : this.resolveActiveDamageActionCues(actionCues, playbackTimelineTimeMs, timelineToPresentationRatio);
    const assistCues = resolveBattleAssistPresentationCues(timeline, snapshot);
    const currentAssistCue = openingConvergence.active ? null : resolveVisibleBattleAssistPresentationCue(assistCues, currentTimelineEvent, playbackTimelineTimeMs);
    const hpState = this.resolveBattleHpStateWithManualUlts(snapshot, timeline, playbackTimelineTimeMs);
    currentActionCue = this.resolveLiveBattleActionCue(currentActionCue, hpState, playbackTimelineTimeMs);
    activeDamageCues = activeDamageCues
      .concat(this.resolveManualUltDamageCues(snapshot, playbackTimelineTimeMs))
      .filter((cue) => this.shouldShowBattleActionCueForLiveUnits(cue, hpState, playbackTimelineTimeMs));
    const visibleDamagePreviewEvent = openingConvergence.active ? currentTimelineEvent : timeline.damagePreviewEvent;
    const visibleBuffPreviewEvent = openingConvergence.active ? currentTimelineEvent : timeline.buffPreviewEvent;
    const audioPlan = resolveBattleAudioRuntimePlan(state, presentation, snapshot, currentTimelineEvent, currentActionCue, currentAssistCue);
    const allyActors = this.resolveRenderableBattleUnits(layout.allySlots, snapshot.allies, false);
    const enemyActors = this.resolveRenderableBattleUnits(layout.enemySlots, snapshot.enemies, true);
    const renderActors = [
      ...allyActors.map((actor) => ({ ...actor, enemy: false })),
      ...enemyActors.map((actor) => ({ ...actor, enemy: true })),
    ];
    this.ensureBattleActorPositionScript(renderActors, snapshot, timeline, scale);
    const actionAnchors = this.createBattleActionAnchorMap(allyActors, enemyActors, scale, presentation, openingConvergence);
    const frameAnchors = this.createBattleFrameAnchorMap(renderActors, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors);
    this.drawFieldFrame(graphics, fieldRect.width, fieldRect.height, scale);
    this.renderStage12BattlefieldChrome(field, fieldRect.width, fieldRect.height, scale, snapshot, presentation, currentTimelineEvent, timeline, playbackTimelineTimeMs);
    this.renderBattleOpeningConvergenceCue(field, fieldRect.width, fieldRect.height, scale, openingConvergence);
    // 右上敌方总血条已按用户要求移除(renderBossGauge 保留仅供守护基线引用)。
    this.renderUnitActorsByDepth(field, renderActors, scale, presentation, snapshot, actionCues, currentActionCue, currentAssistCue, actionAnchors, openingConvergence, playbackTimelineTimeMs, timelineToPresentationRatio, hpState);
    if (performanceProfile.showAssistAuras) {
      this.renderAssistAuraLayer(field, fieldRect.width, fieldRect.height, scale, presentation, snapshot, currentAssistCue, frameAnchors);
    }
    if (performanceProfile.showProjectiles) {
      this.renderActionProjectileLayer(field, fieldRect.width, fieldRect.height, scale, presentation, currentActionCue, frameAnchors);
      this.renderActionTargetSpineEffectLayer(field, fieldRect.width, fieldRect.height, scale, presentation, snapshot, currentActionCue, frameAnchors);
    }
    if (!openingConvergence.active && performanceProfile.showFloatingText) {
      const actionEffectCues = activeDamageCues.length > 0 ? activeDamageCues : (currentActionCue ? [currentActionCue] : []);
      actionEffectCues.forEach((actionCue) => {
        this.renderImpactLayer(field, fieldRect.width, fieldRect.height, scale, presentation, snapshot, visibleDamagePreviewEvent, currentTimelineEvent, actionCue, currentAssistCue, frameAnchors, hpState);
        this.renderActionFloatingTextLayer(field, fieldRect.width, fieldRect.height, scale, presentation, actionCue, actionAnchors, frameAnchors, hpState);
      });
      this.renderAssistFloatingTextLayer(field, fieldRect.width, fieldRect.height, scale, presentation, currentAssistCue, assistCues, frameAnchors);
    }
    // 胜负已定(结算弹窗将出现)后不再画技能卡组:与 renderResultBanner 同一 outcome 判定,让弹窗成为唯一焦点。
    if (!resolveBattleVisualOutcome(hpState, playbackTimelineTimeMs)) {
      this.renderStage12HeroCardDeck(field, fieldRect.width, fieldRect.height, scale, snapshot, presentation, currentActionCue, currentAssistCue, hpState, timeline, playbackTimelineTimeMs);
    }
    if (BATTLE_SHOW_PREVIEW_DEBUG_HUD) {
      this.renderBattleBuffTray(field, fieldRect.width, fieldRect.height, scale, snapshot, presentation, visibleBuffPreviewEvent, currentTimelineEvent);
    }
    if (performanceProfile.showSkillBar && BATTLE_SHOW_PREVIEW_DEBUG_HUD) {
      this.renderSkillBar(field, fieldRect.width, fieldRect.height, scale, presentation, currentAssistCue);
    }
    this.renderStage11BattleAudioRuntime(field, fieldRect.width, fieldRect.height, scale, audioPlan, renderGeneration);
    this.renderResultBanner(field, fieldRect.width, fieldRect.height, scale, state, presentation, snapshot, hpState, playbackTimelineTimeMs);
  }

  private renderStage12BattlefieldChrome(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    snapshot: BattlePresentationSnapshot,
    presentation: LobbyBattlePresentationState,
    currentEvent: BattlePresentationTimelineEvent,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): void {
    const skeleton = this.host.addChildPlainNode(parent, 'LobbyBattleStage12BattlefieldChrome', 0, 0, width, height);
    const graphics = skeleton.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 10);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();

    // AI 实景战斗背景下不再叠加阵营地台与中央装饰圈:大面积半透明椭圆在实景上像一层脏雾。
    // drawStage12CampPlate 保留仅供守护基线引用。
    if (presentation.phase === 'ready' || presentation.phase === 'creatingSession') {
      return;
    }
    this.renderBattleCombatHud(parent, width, height, scale, snapshot, presentation, currentEvent, timeline, playbackTimelineTimeMs);
  }

  private renderBattleCombatHud(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    snapshot: BattlePresentationSnapshot,
    presentation: LobbyBattlePresentationState,
    currentEvent: BattlePresentationTimelineEvent,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): void {
    if (presentation.phase === 'ready' || presentation.phase === 'creatingSession') {
      return;
    }
    const topY = height / 2 - 30 * scale;
    const leftWidth = Math.min(150 * scale, width * 0.23);
    const centerWidth = Math.min(180 * scale, width * 0.26);
    const rightWidth = Math.min(64 * scale, width * 0.11);
    const leftHud = this.host.addChildPlainNode(parent, 'LobbyBattleCombatHudLeftPill', -width / 2 + leftWidth / 2 + 20 * scale, topY, leftWidth, 30 * scale);
    const leftGraphics = leftHud.addComponent(Graphics);
    leftGraphics.fillColor = rgba(4, 4, 6, 138);
    leftGraphics.roundRect(-leftWidth / 2, -15 * scale, leftWidth, 30 * scale, 6 * scale);
    leftGraphics.fill();
    leftGraphics.strokeColor = rgba(180, 140, 76, 112);
    leftGraphics.stroke();
    // 90 秒战斗倒计时：从首个战斗动作起倒数；数值推演提前打完时 playback 冻结在 battle_end，倒计时随之停住。
    const firstActionTimeMs = timeline.events.find((event) => event.type === 'action_start')?.timeMs ?? 0;
    const combatElapsedTimelineMs = Math.max(0, playbackTimelineTimeMs - firstActionTimeMs);
    const countdownRemainMs = Math.max(0, BATTLE_COMBAT_COUNTDOWN_MS - combatElapsedTimelineMs);
    // 输出试炼:倒计时后缀"时间到即胜",强调不需击杀、拼满时长即成功。
    const trialHud = isDailyTrialStageCode(snapshot.stageCode);
    const leftText = presentation.phase === 'roundPlaying'
      ? `倒计时 ${formatBattleHudClock(countdownRemainMs)}${trialHud ? ' · 时间到即胜' : ''}`
      : '战斗';
    const left = this.host.addChildLabel(leftHud, 'LobbyBattleCombatHudLeft', leftText, 0, 0, 16 * scale, rgba(248, 226, 168), new Size(leftWidth - 16 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    left.overflow = Label.Overflow.SHRINK;
    this.applyOutline(left, scale, false);
    const centerHud = this.host.addChildPlainNode(parent, 'LobbyBattleCombatHudStagePill', 0, topY, centerWidth, 30 * scale);
    const centerGraphics = centerHud.addComponent(Graphics);
    centerGraphics.fillColor = rgba(4, 4, 6, 128);
    centerGraphics.roundRect(-centerWidth / 2, -15 * scale, centerWidth, 30 * scale, 6 * scale);
    centerGraphics.fill();
    centerGraphics.strokeColor = rgba(180, 140, 76, 112);
    centerGraphics.stroke();
    const stage = this.host.addChildLabel(centerHud, 'LobbyBattleCombatHudStage', formatBattleStageDisplayName(snapshot.stageCode) || currentEvent.label, 0, 0, 18 * scale, rgba(255, 226, 156), new Size(centerWidth - 16 * scale, 22 * scale));
    stage.overflow = Label.Overflow.SHRINK;
    this.applyOutline(stage, scale, true);
    // 横版 RPG 化：右侧由自动战斗的“x2 倍速”改为敌方威胁标签（BOSS/精英），消除倍速控制误读。
    const rightText = currentEvent.type === 'battle_end' ? '胜利' : trialHud ? '输出试炼' : snapshot.boss ? 'BOSS' : '精英';
    const rightHud = this.host.addChildPlainNode(parent, 'LobbyBattleCombatHudRightPill', width / 2 - rightWidth / 2 - 20 * scale, topY, rightWidth, 30 * scale);
    const rightGraphics = rightHud.addComponent(Graphics);
    rightGraphics.fillColor = rgba(4, 4, 6, 132);
    rightGraphics.roundRect(-rightWidth / 2, -15 * scale, rightWidth, 30 * scale, 6 * scale);
    rightGraphics.fill();
    rightGraphics.strokeColor = rgba(180, 140, 76, 112);
    rightGraphics.stroke();
    const right = this.host.addChildLabel(rightHud, 'LobbyBattleCombatHudRight', rightText, 0, 0, 16 * scale, rgba(238, 217, 166), new Size(rightWidth - 12 * scale, 22 * scale), HorizontalTextAlignment.CENTER);
    right.overflow = Label.Overflow.SHRINK;
    this.applyOutline(right, scale, false);
  }

  private refreshBattleCombatHud(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    snapshot: BattlePresentationSnapshot,
    presentation: LobbyBattlePresentationState,
    currentEvent: BattlePresentationTimelineEvent,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): void {
    parent.children
      .filter((child) => child.name === 'LobbyBattleCombatHudLeftPill' || child.name === 'LobbyBattleCombatHudStagePill' || child.name === 'LobbyBattleCombatHudRightPill')
      .forEach((child) => child.destroy());
    this.renderBattleCombatHud(parent, width, height, scale, snapshot, presentation, currentEvent, timeline, playbackTimelineTimeMs);
  }

  private renderBattleOpeningConvergenceCue(parent: Node, width: number, height: number, scale: number, openingConvergence: BattleOpeningConvergenceState): void {
    void parent;
    void width;
    void height;
    void scale;
    if (!openingConvergence.active) {
      return;
    }
  }

  private drawStage12CampPlate(parent: Node, x: number, y: number, width: number, height: number, scale: number, enemy: boolean): void {
    const plate = this.host.addChildPlainNode(parent, enemy ? 'LobbyBattleStage12EnemyCampPlate' : 'LobbyBattleStage12AllyCampPlate', x, y, width, height);
    const graphics = plate.addComponent(Graphics);
    graphics.fillColor = enemy ? rgba(118, 30, 28, 38) : rgba(192, 144, 70, 30);
    graphics.ellipse(0, 0, width / 2, height / 2);
    graphics.fill();
    graphics.fillColor = enemy ? rgba(58, 12, 14, 40) : rgba(76, 54, 22, 34);
    graphics.ellipse(0, -height * 0.12, width * 0.36, height * 0.28);
    graphics.fill();
    graphics.strokeColor = enemy ? rgba(230, 78, 72, 82) : rgba(240, 190, 96, 82);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    graphics.ellipse(0, 0, width / 2, height / 2);
    graphics.stroke();
    graphics.strokeColor = enemy ? rgba(255, 108, 90, 52) : rgba(255, 214, 122, 48);
    graphics.lineWidth = Math.max(1, 0.75 * scale);
    for (let index = -1; index <= 1; index += 1) {
      const laneY = index * height * 0.2;
      graphics.moveTo(-width * 0.28, laneY);
      graphics.bezierCurveTo(-width * 0.1, laneY + height * 0.05, width * 0.1, laneY - height * 0.05, width * 0.28, laneY);
    }
    graphics.stroke();
  }

  private renderBossGauge(parent: Node, width: number, height: number, scale: number, snapshot: BattlePresentationSnapshot, presentation: LobbyBattlePresentationState, hpState: BattlePresentationHpState): void {
    if (presentation.phase === 'ready' || presentation.phase === 'creatingSession' || width < 520 * scale) {
      return;
    }
    // 输出试炼:BOSS 巨兽血条又厚又长、居中置顶,拼输出主视觉;常规副本(若启用)沿用右上小条。
    const trial = isDailyTrialStageCode(snapshot.stageCode);
    const gaugeWidth = trial ? Math.min(600 * scale, width * 0.66) : Math.min(360 * scale, width * 0.36);
    const gaugeHeight = trial ? 54 * scale : 38 * scale;
    const gaugeX = trial ? 0 : width / 2 - gaugeWidth / 2 - 24 * scale;
    const gaugeY = height / 2 - (trial ? 46 : 58) * scale;
    const gauge = this.host.addChildPlainNode(parent, 'LobbyBattleBossGauge', gaugeX, gaugeY, gaugeWidth, gaugeHeight);
    const frame = this.host.addSprite('LobbyBattleBossGaugeFrame', snapshot.stage2UiAssets.bossGaugeFrame, 0, 0, gaugeWidth, gaugeHeight, gauge);
    // boss 血条同样随实际受击逐次扣减：开满 → 逐格掉 → 见底。
    const ratio = hpState.enemyTotalHpRatio;
    if (frame) {
      frame.type = Sprite.Type.SLICED;
      if (ratio > 0.005) {
        const fillWidth = Math.max(18 * scale, (gaugeWidth - 40 * scale) * ratio);
        const fill = this.host.addSprite('LobbyBattleBossGaugeFill', snapshot.stage2UiAssets.bossGaugeBar, -gaugeWidth / 2 + 25 * scale + fillWidth / 2, -1 * scale, fillWidth, gaugeHeight * 0.52, gauge);
        if (fill) {
          fill.type = Sprite.Type.SLICED;
          fill.color = snapshot.boss ? rgba(245, 72, 63) : rgba(232, 111, 82);
        }
      }
    } else {
      const graphics = gauge.addComponent(Graphics);
      graphics.fillColor = rgba(12, 6, 8, 226);
      graphics.rect(-gaugeWidth / 2, -gaugeHeight / 2, gaugeWidth, gaugeHeight);
      graphics.fill();
      graphics.fillColor = rgba(174, 42, 38, 230);
      graphics.rect(-gaugeWidth / 2 + 12 * scale, -5 * scale, (gaugeWidth - 24 * scale) * ratio, 10 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(226, 174, 88, 178);
      graphics.stroke();
    }
    // 输出试炼:标题显示 BOSS 名 + 已打出输出百分比(=血条掉了多少),直观"体现输出"。
    const drainPct = Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)));
    const labelText = trial ? `${snapshot.leadEnemy.displayName} · 已击出 ${drainPct}%` : snapshot.leadEnemy.displayName;
    const label = this.host.addChildLabel(gauge, 'LobbyBattleBossGaugeLabel', labelText, 0, trial ? 6 * scale : 4 * scale, (trial ? 16 : 15) * scale, rgba(255, 225, 157), new Size(gaugeWidth - 62 * scale, 22 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private refreshBattleBossGaugePlayback(parent: Node, width: number, height: number, scale: number, snapshot: BattlePresentationSnapshot, presentation: LobbyBattlePresentationState, hpState: BattlePresentationHpState): void {
    parent.children
      .filter((child) => child.name === 'LobbyBattleBossGauge')
      .forEach((child) => child.destroy());
    this.renderBossGauge(parent, width, height, scale, snapshot, presentation, hpState);
  }

  private renderBattleBuffTray(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    snapshot: BattlePresentationSnapshot,
    presentation: LobbyBattlePresentationState,
    buffEvent: BattlePresentationTimelineEvent,
    currentEvent: BattlePresentationTimelineEvent,
  ): void {
    if (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded') {
      return;
    }
    if (height < 220 * scale) {
      return;
    }
    const trayWidth = Math.min(190 * scale, width * 0.28);
    const trayHeight = 34 * scale;
    const trayX = -width / 2 + trayWidth / 2 + 18 * scale;
    const trayY = height / 2 - 92 * scale;
    const tray = this.host.addChildPlainNode(parent, 'LobbyBattleBuffTray', trayX, trayY, trayWidth, trayHeight);
    const graphics = tray.addComponent(Graphics);
    graphics.fillColor = rgba(7, 6, 7, 198);
    graphics.rect(-trayWidth / 2, -trayHeight / 2, trayWidth, trayHeight);
    graphics.fill();
    graphics.strokeColor = rgba(143, 103, 52, 122);
    graphics.stroke();
    const iconSize = 22 * scale;
    const assets = [
      snapshot.stage2UiAssets.buffAttackUp,
      snapshot.boss ? snapshot.stage2UiAssets.buffDefenseDown : snapshot.stage2UiAssets.buffShield,
      presentation.phase === 'resultRecorded' ? snapshot.stage2UiAssets.buffStun : snapshot.stage2UiAssets.buffShield,
    ];
    assets.forEach((asset, index) => {
      const x = -trayWidth / 2 + 18 * scale + index * (iconSize + 8 * scale);
      // AI 金币图标为成品彩图,不加乘色。
      const sprite = this.host.addSprite(`LobbyBattleBuffIcon_${index}`, asset, x, 0, iconSize, iconSize, tray);
      if (!sprite) {
        const fallback = this.host.addChildPlainNode(tray, `LobbyBattleBuffIconFallback_${index}`, x, 0, iconSize, iconSize);
        const iconGraphics = fallback.addComponent(Graphics);
        iconGraphics.fillColor = rgba(50, 36, 20, 210);
        iconGraphics.circle(0, 0, iconSize / 2);
        iconGraphics.fill();
      }
    });
    const labelText = currentEvent.type === 'buff_preview'
      ? currentEvent.displayValue || currentEvent.label
      : buffEvent.displayValue || 'Buff';
    const label = this.host.addChildLabel(tray, 'LobbyBattleBuffTrayLabel', labelText, trayWidth / 2 - 39 * scale, 0, 14 * scale, rgba(218, 188, 112), new Size(64 * scale, 18 * scale));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderSkillBar(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    currentAssistCue: BattleAssistPresentationCue | null,
  ): void {
    if (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded') {
      return;
    }
    const slots = 3;
    const slotWidth = Math.min(48 * scale, width * 0.11);
    const slotHeight = slotWidth * (79 / 58);
    const gap = 10 * scale;
    const totalWidth = slots * slotWidth + (slots - 1) * gap;
    const baseY = -height / 2 + slotHeight / 2 + 10 * scale;
    const baseX = width < 760 * scale ? 0 : width / 2 - totalWidth - 24 * scale;
    const activeIndex = currentAssistCue ? 1 : presentation.phase === 'roundPlaying' ? 0 : -1;
    for (let index = 0; index < slots; index += 1) {
      const x = baseX + slotWidth / 2 + index * (slotWidth + gap);
      const asset = index === activeIndex ? BATTLE_C1812_SKILL_FRAME_ACTIVE_ASSET : BATTLE_C1812_SKILL_FRAME_ASSET;
      const frame = this.host.addSprite(`LobbyBattleSkillFrame_${index}`, asset, x, baseY, slotWidth, slotHeight, parent);
      if (!frame) {
        const fallback = this.host.addChildPlainNode(parent, `LobbyBattleSkillFrameFallback_${index}`, x, baseY, slotWidth, slotHeight);
        const graphics = fallback.addComponent(Graphics);
        graphics.fillColor = rgba(12, 10, 9, 210);
        graphics.rect(-slotWidth / 2, -slotHeight / 2, slotWidth, slotHeight);
        graphics.fill();
        graphics.strokeColor = index === activeIndex ? rgba(248, 196, 84, 220) : rgba(142, 106, 55, 150);
        graphics.stroke();
      }
    }
  }

  private renderBoundaryBadge(parent: Node, rect: BattlePresentationRect, scale: number, presentation: LobbyBattlePresentationState): void {
    const badge = this.host.addChildPlainNode(parent, 'LobbyBattleBoundaryBadge', rect.x, rect.y, rect.width, rect.height);
    const graphics = badge.addComponent(Graphics);
    graphics.fillColor = rgba(12, 10, 9, 220);
    graphics.rect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
    graphics.fill();
    graphics.strokeColor = rgba(174, 119, 49, 168);
    graphics.stroke();
    const label = this.host.addChildLabel(badge, 'LobbyBattleTimelineText', presentation.timelineText, 0, 0, 17 * scale, rgba(238, 200, 119), new Size(rect.width - 18 * scale, rect.height));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderTimelineEventRail(
    parent: Node,
    rect: BattlePresentationRect,
    scale: number,
    presentation: LobbyBattlePresentationState,
    timeline: BattlePresentationTimeline,
    currentEvent: BattlePresentationTimelineEvent,
  ): void {
    if (presentation.phase === 'ready' || presentation.phase === 'creatingSession' || presentation.phase === 'error') {
      return;
    }
    const railWidth = rect.width;
    const railHeight = 26 * scale;
    const railY = rect.y - rect.height / 2 - railHeight / 2 - 8 * scale;
    const rail = this.host.addChildPlainNode(parent, 'LobbyBattleTimelineEventRail', rect.x, railY, railWidth, railHeight);
    const graphics = rail.addComponent(Graphics);
    graphics.fillColor = rgba(7, 6, 6, 198);
    graphics.roundRect(-railWidth / 2, -railHeight / 2, railWidth, railHeight, 6 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(159, 111, 54, 138);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();

    const milestoneEvents = timeline.events
      .filter((event) => event.type === 'battle_start' || event.type === 'damage_preview' || event.type === 'buff_preview' || event.type === 'battle_end');
    const firstEvent = milestoneEvents[0];
    const lastEvent = milestoneEvents[milestoneEvents.length - 1];
    const middleEvents = milestoneEvents.filter((event) => event.seq !== firstEvent?.seq && event.seq !== lastEvent?.seq).slice(0, 5);
    const markerEvents = firstEvent && lastEvent ? [firstEvent, ...middleEvents, lastEvent] : milestoneEvents;
    markerEvents.forEach((event, index) => {
      const ratio = clamp(event.timeMs / Math.max(1, timeline.durationMs), 0, 1);
      const x = -railWidth / 2 + 12 * scale + ratio * (railWidth - 24 * scale);
      const marker = this.host.addChildPlainNode(rail, `LobbyBattleTimelineEventMarker_${index}`, x, 0, 8 * scale, 8 * scale);
      const markerGraphics = marker.addComponent(Graphics);
      const active = event.seq === currentEvent.seq;
      markerGraphics.fillColor = active ? rgba(255, 214, 105, 238) : event.type === 'buff_preview' ? rgba(116, 177, 245, 210) : rgba(166, 66, 48, 205);
      markerGraphics.circle(0, 0, active ? 4.6 * scale : 3.2 * scale);
      markerGraphics.fill();
    });

    const summary = `${currentEvent.label} · ${formatTimelineSeconds(currentEvent.timeMs)} / ${formatTimelineSeconds(timeline.durationMs)}`;
    const label = this.host.addChildLabel(rail, 'LobbyBattleTimelineEventRailLabel', summary, 0, 0, 13 * scale, rgba(207, 185, 129), new Size(railWidth - 22 * scale, railHeight));
    label.overflow = Label.Overflow.SHRINK;
  }

  private resolveVisibleTimelineEvent(
    timeline: BattlePresentationTimeline,
    presentationStep: number,
    presentationElapsedMs: number,
    presentation: LobbyBattlePresentationState,
    visualCompletionDurationMs: number,
  ): BattlePresentationTimelineEvent {
    if (presentation.phase === 'ready' || presentation.phase === 'creatingSession' || presentation.phase === 'error') {
      return timeline.currentEvent;
    }
    if (presentation.phase === 'resultRecorded') {
      return timeline.events.find((event) => event.type === 'battle_end') ?? timeline.currentEvent;
    }
    if (presentation.phase === 'resultRecording') {
      return timeline.events.find((event) => event.type === 'round_end' && event.round === timeline.rounds) ?? timeline.currentEvent;
    }
    if (presentationStep < LOBBY_BATTLE_COMBAT_START_STEP) {
      return timeline.events.find((event) => event.type === 'battle_start') ?? timeline.currentEvent;
    }
    const playbackTimelineTimeMs = this.resolveBattlePlaybackTimelineTimeMs(timeline, presentationElapsedMs, presentation, visualCompletionDurationMs);
    const combatEvents = this.resolveVisibleCombatTimelineEvents(timeline);
    if (combatEvents.length === 0) {
      return timeline.currentEvent;
    }
    return this.resolveTimelineEventAtTime(combatEvents, playbackTimelineTimeMs) ?? timeline.currentEvent;
  }

  private resolveBattlePlaybackTimelineTimeMs(
    timeline: BattlePresentationTimeline,
    presentationElapsedMs: number,
    presentation: LobbyBattlePresentationState,
    visualCompletionDurationMs: number,
  ): number {
    if (presentation.phase === 'ready' || presentation.phase === 'creatingSession' || presentation.phase === 'error') {
      return 0;
    }
    const battleEnd = timeline.events.find((event) => event.type === 'battle_end');
    if (presentation.phase === 'resultRecorded' || presentation.phase === 'resultRecording') {
      return battleEnd?.timeMs ?? timeline.durationMs;
    }
    const firstAction = timeline.events.find((event) => event.type === 'action_start') ?? timeline.currentEvent;
    const combatStartPresentationMs = LOBBY_BATTLE_COMBAT_START_STEP * LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS;
    const combatPresentationDurationMs = Math.max(1, visualCompletionDurationMs - combatStartPresentationMs);
    const combatElapsedMs = clamp(presentationElapsedMs - combatStartPresentationMs, 0, combatPresentationDurationMs);
    // 真实 1:1 播放：回放时间轴按真实时间推进(动作节奏=数值回放原速,90 秒倒计时按真实秒走),
    // 数值打完(battle_end)后冻结,不再按压缩比例拉快。
    return Math.min(firstAction.timeMs + combatElapsedMs, battleEnd?.timeMs ?? timeline.durationMs);
  }

  private resolveBattleTimelineToPresentationRatio(timeline: BattlePresentationTimeline, visualCompletionDurationMs: number): number {
    // 真实 1:1 播放下回放时间与演出时间同速,窗口换算比例恒为 1。
    void timeline;
    void visualCompletionDurationMs;
    return 1;
  }

  private resolveTimelineEventAtTime(events: BattlePresentationTimelineEvent[], timeMs: number): BattlePresentationTimelineEvent | null {
    let current: BattlePresentationTimelineEvent | null = null;
    for (const event of events) {
      if (event.timeMs <= timeMs + 1) {
        current = event;
      } else {
        break;
      }
    }
    return current ?? events[0] ?? null;
  }

  private resolveVisibleCombatTimelineEvents(timeline: BattlePresentationTimeline): BattlePresentationTimelineEvent[] {
    const firstAction = timeline.events.find((event) => event.type === 'action_start');
    const combatStartTimeMs = firstAction?.timeMs ?? 0;
    return timeline.events.filter((event) => {
      if (event.timeMs < combatStartTimeMs) {
        return false;
      }
      return event.type === 'action_start'
        || event.type === 'target_mark'
        || event.type === 'damage_preview'
        || event.type === 'hit_react'
        || event.type === 'buff_preview'
        || event.type === 'round_start'
        || event.type === 'round_end'
        || event.type === 'battle_end';
    });
  }

  private resolveBattleOpeningConvergenceState(presentationStep: number, presentationElapsedMs: number, presentation: LobbyBattlePresentationState): BattleOpeningConvergenceState {
    const active = presentation.phase === 'roundPlaying'
      && presentationStep < LOBBY_BATTLE_COMBAT_START_STEP
      && !presentation.actionEnabled;
    const durationMs = LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT * LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS;
    if (!active) {
      return { active: false, moving: false, startProgress: 1, elapsedMs: durationMs, durationMs };
    }
    const elapsedMs = clamp(presentationElapsedMs, 0, durationMs);
    const linearProgress = clamp(elapsedMs / Math.max(1, durationMs), 0, 1);
    return {
      active: true,
      moving: linearProgress < 1,
      startProgress: easeBattleOpeningConvergenceProgress(linearProgress),
      elapsedMs,
      durationMs,
    };
  }

  private renderUnitActorsByDepth(
    parent: Node,
    actors: RenderableBattleActor[],
    scale: number,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    actionCues: BattleActionPresentationCue[],
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    actionAnchors: Map<string, BattleActionAnchor>,
    openingConvergence: BattleOpeningConvergenceState,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
    hpState: BattlePresentationHpState,
  ): void {
    const sorted = actors
      .map((actor, index) => {
        const framePosition = this.resolveBattleActorFramePosition(actor.unit, actor.slot, actor.enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors);
        const meleeActorBoost = currentActionCue?.actorKey === actor.unit.unitKey && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack') ? 10000 : 0;
        const meleeTargetBoost = currentActionCue?.targetKey === actor.unit.unitKey && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack') ? 4000 : 0;
        return {
          actor,
          index,
          depth: -framePosition.y + meleeActorBoost + meleeTargetBoost,
        };
      })
      .sort((a, b) => a.depth - b.depth || a.index - b.index);
    sorted.forEach(({ actor }, renderIndex) => {
      this.renderActor(parent, actor.slot, actor.unit, scale, actor.enemy, actor.sourceIndex, renderIndex, presentation, snapshot, actionCues, currentActionCue, currentAssistCue, actionAnchors, openingConvergence, playbackTimelineTimeMs, timelineToPresentationRatio, hpState);
    });
  }

  private renderUnitActors(
    parent: Node,
    actors: RenderableBattleUnit[],
    scale: number,
    enemy: boolean,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    actionCues: BattleActionPresentationCue[],
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    actionAnchors: Map<string, BattleActionAnchor>,
    openingConvergence: BattleOpeningConvergenceState,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
    hpState: BattlePresentationHpState,
  ): void {
    actors.forEach((actor, index) => {
      this.renderActor(parent, actor.slot, actor.unit, scale, enemy, actor.sourceIndex, index, presentation, snapshot, actionCues, currentActionCue, currentAssistCue, actionAnchors, openingConvergence, playbackTimelineTimeMs, timelineToPresentationRatio, hpState);
    });
  }

  private renderActor(
    parent: Node,
    slot: BattlePresentationSlot,
    unit: BattlePresentationUnitSnapshot,
    scale: number,
    enemy: boolean,
    sourceIndex: number,
    renderIndex: number,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    actionCues: BattleActionPresentationCue[],
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    actionAnchors: Map<string, BattleActionAnchor>,
    openingConvergence: BattleOpeningConvergenceState,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
    hpState: BattlePresentationHpState,
  ): void {
    const hpUnit = hpState.units.get(unit.unitKey);
    if (this.isBattleActorVisiblyDead(hpUnit, playbackTimelineTimeMs, enemy)) {
      this.recordBattleDeadActorHiddenTelemetry(unit, enemy, hpUnit, hpState, playbackTimelineTimeMs);
      return;
    }
    const combatHomePosition = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
    this.battleActorHomePositions.set(unit.unitKey, new Vec3(combatHomePosition.x, combatHomePosition.y, 0));
    const rootMotionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);
    const desiredPosition = this.resolveBattleActorFramePosition(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors);
    const actorPosition = this.resolveBattleActorDisplayedFramePosition(unit.unitKey, desiredPosition, openingConvergence, presentation, rootMotionCue, scale, true);
    this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue, rootMotionCue);
    // Stage 13P：actor root 位置由同一条时间函数决定；全量重建和局部刷新不再算两套坐标。
    const actor = this.host.addChildPlainNode(parent, `LobbyBattleActor_${enemy ? 'Enemy' : 'Ally'}_${sourceIndex}`, actorPosition.x, actorPosition.y, slot.width, slot.height);
    this.battlePlaybackNodes.set(unit.unitKey, actor);
    const visualRoot = this.host.addChildPlainNode(actor, 'LobbyBattleActorVisualRoot', 0, 0, slot.width, slot.height);
    const graphics = visualRoot.addComponent(Graphics);
    const actorActive = this.isCurrentActionActor(unit, currentActionCue, presentation);
    const targetActive = this.isCurrentActionTarget(unit, currentActionCue, presentation);
    const assistActorActive = this.isCurrentAssistSource(unit, currentAssistCue, presentation);
    const assistTargetActive = this.isCurrentAssistTarget(unit, currentAssistCue, presentation);
    const active = openingConvergence.active || actorActive || targetActive || assistActorActive || assistTargetActive || (presentation.phase === 'roundPlaying' && !currentActionCue && !currentAssistCue && renderIndex === 0);
    const hpUnitDead = hpUnit?.dead === true;
    // 死亡单位只保留渐隐尸体:脚底阴影/阵营圈/目标反馈全部不画,避免战场残留"空圈"和"空目标框"。
    if (!hpUnitDead) {
      graphics.fillColor = enemy ? rgba(0, 0, 0, 116) : rgba(0, 0, 0, 98);
      graphics.ellipse(0, -slot.height * 0.42, slot.width * 0.36, Math.max(8 * scale, slot.height * 0.054));
      graphics.fill();
      // 常显阵营脚底光圈（我方金 / 敌方红）：冲入对方阵地的暗色角色也能一眼分清归属，脚底接触感也更统一。
      graphics.strokeColor = enemy ? rgba(226, 84, 66, 130) : rgba(246, 200, 98, 130);
      graphics.lineWidth = Math.max(1, 1.15 * scale);
      graphics.ellipse(0, -slot.height * 0.42, slot.width * 0.37, Math.max(9 * scale, slot.height * 0.058));
      graphics.stroke();
      this.renderBattleActorCombatFeedback(visualRoot, slot.width, slot.height, scale, unit, enemy, actorActive, targetActive, assistActorActive, assistTargetActive, active, snapshot);
    }
    const assistAnimationName = this.resolveAssistAnimationName(unit, currentAssistCue, assistActorActive, assistTargetActive);
    const actionAnimationName = hpUnitDead
      ? this.resolveBattleActorDeathAnimationName(unit)
      : openingConvergence.active
      ? openingConvergence.moving ? 'run' : 'idle'
      : assistAnimationName ?? this.resolveActionAnimationName(unit, currentActionCue, rootMotionCue, actorActive, targetActive, playbackTimelineTimeMs, timelineToPresentationRatio);
    this.renderBattleActorSpineLayer(visualRoot, slot.width, slot.height, scale, unit, enemy, active, actionAnimationName);
    if (hpUnitDead) {
      const opacity = visualRoot.addComponent(UIOpacity);
      opacity.opacity = enemy ? 72 : 138;
    }
    this.renderBattleActorActionCallout(visualRoot, slot.width, slot.height, scale, unit, enemy, currentActionCue, currentAssistCue, actorActive, targetActive, assistActorActive, assistTargetActive);

    const combatPlaybackActive = presentation.phase === 'roundPlaying'
      || presentation.phase === 'resultRecording'
      || presentation.phase === 'resultRecorded';
    const showNameplate = !combatPlaybackActive;
    if (showNameplate) {
      this.renderBattleActorNameplate(visualRoot, slot.width, slot.height, scale, unit, enemy, active);
    }
    const hpRatio = hpUnit?.hpRatio ?? this.resolveBattleActorDisplayHp(unit, enemy, hpState);
    this.renderHpBar(visualRoot, -slot.width * 0.34, slot.height * 0.27, slot.width * 0.68, 15 * scale, hpRatio, scale, enemy, (hpUnit?.maxHp ?? 0) > 0 ? clamp((hpUnit?.currentShield ?? 0) / (hpUnit?.maxHp ?? 1), 0, 1) : 0, hpUnit?.shieldKind === 'team', hpUnit?.frozen ? (hpUnit.frozenKind ?? null) : null);
    this.recordBattleHpTelemetry(unit, enemy, hpUnit, hpState, currentActionCue, presentation.phase);
    if (openingConvergence.moving) {
      this.applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run');
    } else if (rootMotionCue && rootMotionCue.kind === 'melee_move' && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')) {
      this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(rootMotionCue.cueKey, actionAnimationName), actor, unit, actionAnimationName);
    } else if (actorActive && currentActionCue && currentActionCue.kind === 'ranged_projectile' && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')) {
      this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(currentActionCue.cueKey, actionAnimationName), actor, unit, actionAnimationName);
    }
    if (active) {
      // Stage 13L：外层 actor 只负责位移，缩放脉冲放到视觉子节点，避免 stopAllByTarget(actor) 打断缩放。
      tween(visualRoot)
        .repeatForever(tween().to(0.32, { scale: new Vec3(targetActive ? 0.99 : 1.026, targetActive ? 1.01 : 1.026, 1) }).to(0.34, { scale: Vec3.ONE }).delay(0.42))
      .start();
    }
  }

  private updateBattleActorPlayback(
    actorInfo: RenderableBattleUnit,
    renderIndex: number,
    enemy: boolean,
    scale: number,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    actionCues: BattleActionPresentationCue[],
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    actionAnchors: Map<string, BattleActionAnchor>,
    openingConvergence: BattleOpeningConvergenceState,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
    hpState: BattlePresentationHpState,
  ): void {
    const { unit, slot } = actorInfo;
    const actor = this.battlePlaybackNodes.get(unit.unitKey);
    if (!this.isNodeAlive(actor)) {
      return;
    }
    const hpUnit = hpState.units.get(unit.unitKey);
    if (this.isBattleActorVisiblyDead(hpUnit, playbackTimelineTimeMs, enemy)) {
      this.recordBattleDeadActorHiddenTelemetry(unit, enemy, hpUnit, hpState, playbackTimelineTimeMs);
      actor.destroy();
      Reflect.apply(Map.prototype.delete, this.battlePlaybackNodes, [unit.unitKey]);
      Reflect.apply(Map.prototype.delete, this.battleActorStickyCombatPositions, [unit.unitKey]);
      Reflect.apply(Map.prototype.delete, this.battleActorFramePositions, [unit.unitKey]);
      return;
    }
    const hpUnitDead = hpUnit?.dead === true;
    const actorActive = this.isCurrentActionActor(unit, currentActionCue, presentation);
    const targetActive = this.isCurrentActionTarget(unit, currentActionCue, presentation);
    const assistActorActive = this.isCurrentAssistSource(unit, currentAssistCue, presentation);
    const assistTargetActive = this.isCurrentAssistTarget(unit, currentAssistCue, presentation);
    const rootMotionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);
    const assistAnimationName = this.resolveAssistAnimationName(unit, currentAssistCue, assistActorActive, assistTargetActive);
    const actionAnimationName = hpUnitDead
      ? this.resolveBattleActorDeathAnimationName(unit)
      : openingConvergence.active
      ? openingConvergence.moving ? 'run' : 'idle'
      : assistAnimationName ?? this.resolveActionAnimationName(unit, currentActionCue, rootMotionCue, actorActive, targetActive, playbackTimelineTimeMs, timelineToPresentationRatio);
    const fallbackActive = presentation.phase === 'roundPlaying' && !currentActionCue && !currentAssistCue && renderIndex === 0;
    const combatHomePosition = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
    this.battleActorHomePositions.set(unit.unitKey, new Vec3(combatHomePosition.x, combatHomePosition.y, 0));
    const desiredPosition = this.resolveBattleActorFramePosition(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, actionAnchors);
    const actorPosition = this.resolveBattleActorDisplayedFramePosition(unit.unitKey, desiredPosition, openingConvergence, presentation, rootMotionCue, scale, true);
    this.recordBattleActorFrameTelemetry(unit, enemy, actorPosition, presentation, openingConvergence, playbackTimelineTimeMs, currentActionCue, rootMotionCue);
    this.setBattleActorFramePosition(actor, actorPosition);
    // 刷新路径同样规则:死亡单位清掉脚底圈(初次渲染画在 visualRoot Graphics 上)并不再渲染目标反馈层。
    if (hpUnitDead) {
      actor.getChildByName('LobbyBattleActorVisualRoot')?.getComponent(Graphics)?.clear();
      this.refreshBattleActorCombatFeedback(actor, slot, scale, unit, enemy, snapshot, false, false, false, false, false);
    } else {
      this.refreshBattleActorCombatFeedback(actor, slot, scale, unit, enemy, snapshot, actorActive, targetActive, assistActorActive, assistTargetActive, openingConvergence.active || actorActive || targetActive || assistActorActive || assistTargetActive || fallbackActive);
    }
    this.refreshBattleActorHpBar(actor, slot, scale, unit, enemy, hpUnit, hpState, currentActionCue, presentation.phase);

    if (hpUnitDead) {
      this.applyBattleActorSpineCueOnce(`dead:${this.lastBattleSceneKey}`, actor, unit, actionAnimationName);
      return;
    }

    if (openingConvergence.active) {
      if (openingConvergence.moving) {
        this.applyBattleActorSpineCueOnce('opening-run', actor, unit, 'run');
      } else {
        this.applyBattleActorSpineCueOnce('opening-hold', actor, unit, 'idle');
      }
      return;
    }

    if (rootMotionCue && (rootMotionCue.kind === 'melee_move' || rootMotionCue.kind === 'ranged_projectile')) {
      this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(rootMotionCue.cueKey, actionAnimationName), actor, unit, actionAnimationName);
      return;
    }

    // 全员就地交战：前排冲锋途中播 run；到位后与后排单位一样，所有参战单位(含 UR/SSR、后排法师/射手)按错峰循环
    // 放各自骨骼里的攻击/技能动画，避免任何单位站桩不动。
    const chargeProgress = this.resolveBattleActorFrontChargeOffset(unit, enemy, this.resolveActorConvergedCombatPosition(slot, enemy, scale), scale, presentation, openingConvergence).progress;
    const combatActive = !openingConvergence.active && presentation.phase === 'roundPlaying';
    const otherwiseIdleInCombat = !((targetActive && currentActionCue) || assistActorActive || assistTargetActive || fallbackActive);
    if (BATTLE_ENABLE_IDLE_CLASH_COMBAT && combatActive && otherwiseIdleInCombat && unit.power > 0 && !unit.unitKey.includes('empty')) {
      if (chargeProgress > 0 && chargeProgress < 1) {
        this.applyBattleActorSpineCueOnce(`charge-run:${unit.unitKey}:${this.lastBattleSceneKey}`, actor, unit, 'run');
        return;
      }
      // 脚本位移感知:归位/跑位窗口内播 run(禁滑步),归位收工后播 idle(不再原地挥砍)。
      const scriptMotion = this.resolveBattleActorScriptMotionState(unit.unitKey, playbackTimelineTimeMs);
      if (scriptMotion?.kind === 'moving') {
        this.applyBattleActorSpineCueOnce(`script-run:${unit.unitKey}:${this.lastBattleSceneKey}:${scriptMotion.segmentStartMs}`, actor, unit, 'run');
        return;
      }
      if (scriptMotion?.kind === 'home') {
        this.applyBattleActorSpineCueOnce(`return-idle:${unit.unitKey}:${this.lastBattleSceneKey}:${scriptMotion.segmentStartMs}`, actor, unit, 'idle');
        return;
      }
      const clashBucket = Math.floor((Date.now() + this.resolveBattleActorClashPhaseOffset(unit)) / BATTLE_ACTOR_CLASH_ATTACK_CYCLE_MS);
      const clashAnimation = this.resolveBattleActorClashCombatAnimation(unit, clashBucket);
      this.applyBattleActorSpineCueOnce(`clash:${unit.unitKey}:${this.lastBattleSceneKey}:${clashBucket}`, actor, unit, clashAnimation);
      return;
    }

    if ((targetActive && currentActionCue) || (assistActorActive || assistTargetActive) || fallbackActive) {
      const cueKey = currentActionCue?.cueKey ?? currentAssistCue?.cueKey ?? `idle:${unit.unitKey}:${this.lastBattleSceneKey}`;
      this.applyBattleActorSpineCueOnce(this.resolveBattleSpineCuePlaybackKey(cueKey, actionAnimationName), actor, unit, actionAnimationName);
    }
  }

  private refreshBattleActorHpBar(
    actor: Node,
    slot: BattlePresentationSlot,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    hpUnit: {
      hpRatio: number;
      dead: boolean;
      lastDamageHitKey?: string | null;
      lastDamageEventSeq?: number | null;
      lastDamageAtMs?: number | null;
      maxHp?: number;
      currentShield?: number;
      shieldKind?: 'single' | 'team' | null;
      frozen?: boolean;
      frozenKind?: 'freeze' | 'stun' | null;
    } | undefined,
    hpState: BattlePresentationHpState,
    currentActionCue: BattleActionPresentationCue | null,
    phase: LobbyBattlePresentationState['phase'],
  ): void {
    const visualRoot = actor.children.find((child) => child.name === 'LobbyBattleActorVisualRoot');
    if (!this.isNodeAlive(visualRoot)) {
      return;
    }
    visualRoot.children
      .filter((child) => child.name === 'LobbyBattleActorHpBar')
      .forEach((child) => child.destroy());
    const hpRatio = hpUnit?.hpRatio ?? this.resolveBattleActorDisplayHp(unit, enemy, hpState);
    this.renderHpBar(visualRoot, -slot.width * 0.34, slot.height * 0.27, slot.width * 0.68, 15 * scale, hpRatio, scale, enemy, (hpUnit?.maxHp ?? 0) > 0 ? clamp((hpUnit?.currentShield ?? 0) / (hpUnit?.maxHp ?? 1), 0, 1) : 0, hpUnit?.shieldKind === 'team', hpUnit?.frozen ? (hpUnit.frozenKind ?? null) : null);
    this.recordBattleHpTelemetry(unit, enemy, hpUnit, hpState, currentActionCue, phase);
  }

  private renderBattleCueEffectsOnce(
    field: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    timeline: BattlePresentationTimeline,
    performanceProfile: BattleAdaptivePerformanceProfile,
    currentTimelineEvent: BattlePresentationTimelineEvent,
    currentActionCue: BattleActionPresentationCue | null,
    activeDamageCues: BattleActionPresentationCue[],
    currentAssistCue: BattleAssistPresentationCue | null,
    assistCues: BattleAssistPresentationCue[],
    actionAnchors: Map<string, BattleActionAnchor>,
    frameAnchors: Map<string, BattleActionAnchor>,
    openingConvergence: BattleOpeningConvergenceState,
    hpState: BattlePresentationHpState,
  ): void {
    this.cleanupBattleTransientEffectLayers(field);
    if (openingConvergence.active) {
      return;
    }
    if (currentActionCue) {
      if (performanceProfile.showProjectiles) {
        const actionProjectileKey = `effect:action:projectile:${currentActionCue.cueKey}`;
        if (!this.playedBattleCueKeys.has(actionProjectileKey)) {
          this.playedBattleCueKeys.add(actionProjectileKey);
          this.renderActionProjectileLayer(field, width, height, scale, presentation, currentActionCue, frameAnchors);
          this.renderActionTargetSpineEffectLayer(field, width, height, scale, presentation, snapshot, currentActionCue, frameAnchors);
        }
      }
      if (performanceProfile.showFloatingText) {
        const actionEffectCues = activeDamageCues.length > 0 ? activeDamageCues : [currentActionCue];
        actionEffectCues.forEach((actionCue) => {
          const actionFloatingKey = `effect:action:floating:${actionCue.cueKey}`;
          if (!this.playedBattleCueKeys.has(actionFloatingKey)) {
            this.playedBattleCueKeys.add(actionFloatingKey);
            this.renderActionFloatingTextLayer(field, width, height, scale, presentation, actionCue, actionAnchors, frameAnchors, hpState);
            this.renderImpactLayer(field, width, height, scale, presentation, snapshot, timeline.damagePreviewEvent, currentTimelineEvent, actionCue, currentAssistCue, frameAnchors, hpState);
          }
        });
      }
    }
    if (currentAssistCue) {
      if (performanceProfile.showAssistAuras) {
        const assistAuraKey = `effect:assist:aura:${currentAssistCue.cueKey}`;
        if (!this.playedBattleCueKeys.has(assistAuraKey)) {
          this.playedBattleCueKeys.add(assistAuraKey);
          this.renderAssistAuraLayer(field, width, height, scale, presentation, snapshot, currentAssistCue, frameAnchors);
        }
      }
      if (performanceProfile.showFloatingText) {
        const assistFloatingKey = `effect:assist:floating:${currentAssistCue.cueKey}`;
        if (!this.playedBattleCueKeys.has(assistFloatingKey)) {
          this.playedBattleCueKeys.add(assistFloatingKey);
          this.renderAssistFloatingTextLayer(field, width, height, scale, presentation, currentAssistCue, assistCues, frameAnchors);
        }
      }
    }
  }

  // 英雄能量(纯函数):自己动作 +25 / 被击 +15 / 每秒 +4,释放一次大招消耗 100;满能即可手动放大招。
  private resolveBattleActorUltEnergy(
    unitKey: string,
    snapshot: BattlePresentationSnapshot,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): number {
    const replay = resolveBattleReplay(snapshot, timeline);
    let energy = Math.max(0, playbackTimelineTimeMs) / 1000 * BATTLE_MANUAL_ULT_ENERGY_PER_SECOND;
    for (const action of replay.actions) {
      for (const hit of action.hitEvents) {
        if (hit.timeMs > playbackTimelineTimeMs) {
          continue;
        }
        if (hit.actorKey === unitKey) {
          energy += BATTLE_MANUAL_ULT_ENERGY_PER_ACTION;
        }
        if (hit.targetKey === unitKey && !hit.evaded) {
          energy += BATTLE_MANUAL_ULT_ENERGY_PER_HIT_TAKEN;
        }
      }
    }
    const spent = this.battleManualUlts.filter((ult) => ult.unitKey === unitKey && ult.timeMs <= playbackTimelineTimeMs).length;
    return clamp(energy - spent * BATTLE_MANUAL_ULT_ENERGY_MAX, 0, BATTLE_MANUAL_ULT_ENERGY_MAX);
  }

  // HP 状态包装:在回放推演之上叠加手动大招的真实扣血(可击杀,死亡时间生效→胜利判定/死亡过滤自动联动)。
  private resolveBattleHpStateWithManualUlts(
    snapshot: BattlePresentationSnapshot,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): BattlePresentationHpState {
    const hpState = resolveBattlePresentationHpState(snapshot, timeline, playbackTimelineTimeMs);
    for (const ult of [...this.battleManualUlts].sort((a, b) => a.timeMs - b.timeMs)) {
      if (ult.timeMs > playbackTimelineTimeMs) {
        continue;
      }
      const target = hpState.units.get(ult.targetKey);
      if (!target || (target.dead && (target.deadAtMs ?? 0) < ult.timeMs)) {
        continue;
      }
      const damage = Math.min(target.currentHp, ult.amount);
      target.currentHp = Math.max(0, target.currentHp - damage);
      target.damaged += damage;
      target.hpRatio = clamp(target.currentHp / Math.max(1, target.maxHp), 0, 1);
      target.lastDamageHitKey = ult.hitKey;
      target.lastDamageEventSeq = ult.eventSeq;
      target.lastDamageAtMs = ult.timeMs;
      if (target.currentHp <= 0 && !target.dead) {
        target.dead = true;
        target.deadAtMs = target.deadAtMs ?? ult.timeMs;
        hpState.deadUnitKeys.add(target.unitKey);
      }
      hpState.appliedHitKeys.add(ult.hitKey);
      hpState.appliedEventSeqs.add(ult.eventSeq);
    }
    return hpState;
  }

  // 手动大招的合成伤害 cue:走与回放伤害完全相同的展示/遥测链(飘字/受击反馈/死亡过滤对齐)。
  private resolveManualUltDamageCues(snapshot: BattlePresentationSnapshot, playbackTimelineTimeMs: number): BattleActionPresentationCue[] {
    const cues: BattleActionPresentationCue[] = [];
    for (const ult of this.battleManualUlts) {
      if (ult.timeMs > playbackTimelineTimeMs || playbackTimelineTimeMs > ult.timeMs + 620) {
        continue;
      }
      const actor = this.resolveBattleSnapshotUnit(snapshot, ult.unitKey);
      const target = this.resolveBattleSnapshotUnit(snapshot, ult.targetKey);
      if (!actor || !target) {
        continue;
      }
      cues.push({
        cueKey: `manual:${ult.hitKey}`,
        kind: 'damage_float',
        eventSeq: ult.eventSeq,
        actionSeq: ult.actionSeq,
        timeMs: ult.timeMs,
        durationMs: 560,
        round: 0,
        actorKey: actor.unitKey,
        actorName: actor.displayName,
        actorRole: actor.role,
        actorSide: actor.side,
        targetKey: target.unitKey,
        targetName: target.displayName,
        targetRole: target.role,
        targetSide: target.side,
        displayValue: `大招 -${ult.amount.toLocaleString('en-US')}`,
        label: `${actor.displayName} 释放大招`,
        animationName: 'ult',
        audioCue: 'heroSkill',
        advanceRatio: 0,
        arcRatio: 0.2,
        isCritical: false,
        hitKey: ult.hitKey,
        evaded: false,
      });
    }
    return cues;
  }

  // 释放大招:记账 + 立即播放 ult 动画与震屏,大伤害经合成 cue/HP 包装生效。
  private castBattleManualUlt(
    unit: BattlePresentationUnitSnapshot,
    snapshot: BattlePresentationSnapshot,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
    hpState: BattlePresentationHpState,
  ): void {
    if (this.resolveBattleActorUltEnergy(unit.unitKey, snapshot, timeline, playbackTimelineTimeMs) < BATTLE_MANUAL_ULT_ENERGY_MAX) {
      return;
    }
    const livingEnemies = snapshot.enemies.filter((enemy) => {
      const state = hpState.units.get(enemy.unitKey);
      return !!state && !state.dead && enemy.power > 0 && !enemy.unitKey.includes('empty');
    });
    if (livingEnemies.length === 0) {
      return;
    }
    const target = [...livingEnemies].sort((a, b) => Math.abs(a.slot - unit.slot) - Math.abs(b.slot - unit.slot))[0];
    const replay = resolveBattleReplay(snapshot, timeline);
    const attack = replay.units.get(unit.unitKey)?.stats.attack ?? 80;
    // P6:大招伤害随终极技能等级 ×(1+0.15×(Lv-1))。
    const amount = Math.max(1, Math.round(attack * BATTLE_MANUAL_ULT_DAMAGE_ATTACK_SCALE * ultimateDamageScale(unit.ultimateSkillLevel) * resolveBattleReplayCounterMultiplier(unit, target)));
    const index = this.battleManualUlts.length;
    this.battleManualUlts.push({
      unitKey: unit.unitKey,
      targetKey: target.unitKey,
      timeMs: playbackTimelineTimeMs,
      amount,
      hitKey: `manual-ult:${index}:${unit.unitKey}`,
      eventSeq: BATTLE_MANUAL_ULT_EVENT_SEQ_BASE + index * 3,
      actionSeq: BATTLE_MANUAL_ULT_EVENT_SEQ_BASE + index * 3,
    });
    const actorNode = this.battlePlaybackNodes.get(unit.unitKey);
    if (this.isNodeAlive(actorNode)) {
      this.applyBattleActorSpineCueOnce(`manual-ult:${index}:${unit.unitKey}:anim`, actorNode, unit, 'ult');
    }
    const field = this.battleFieldNode;
    if (this.isNodeAlive(field)) {
      const base = new Vec3(field.position.x, field.position.y, field.position.z);
      tween(field)
        .to(0.05, { position: new Vec3(base.x + 9, base.y - 4, base.z) })
        .to(0.06, { position: new Vec3(base.x - 6, base.y + 3, base.z) })
        .to(0.05, { position: base })
        .start();
    }
  }

  private resolveActiveDamageActionCues(
    actionCues: BattleActionPresentationCue[],
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
  ): BattleActionPresentationCue[] {
    const ratio = Math.max(0.08, Math.min(1, timelineToPresentationRatio));
    return actionCues
      .filter((cue) => {
        if (cue.kind !== 'damage_float' || cue.evaded === true) {
          return false;
        }
        const visibleWindowMs = Math.max(260, Math.min(460, resolveBattleActionCueVisibleWindowMs(cue) / ratio));
        return cue.timeMs <= playbackTimelineTimeMs && playbackTimelineTimeMs <= cue.timeMs + visibleWindowMs;
      })
      .sort((a, b) => a.timeMs - b.timeMs || a.eventSeq - b.eventSeq)
      .slice(-3);
  }

  private resolveLiveBattleActionCue(
    currentActionCue: BattleActionPresentationCue | null,
    hpState: BattlePresentationHpState,
    playbackTimelineTimeMs: number,
  ): BattleActionPresentationCue | null {
    if (!currentActionCue) {
      return null;
    }
    return this.shouldShowBattleActionCueForLiveUnits(currentActionCue, hpState, playbackTimelineTimeMs)
      ? currentActionCue
      : null;
  }

  private shouldShowBattleActionCueForLiveUnits(
    cue: BattleActionPresentationCue,
    hpState: BattlePresentationHpState,
    playbackTimelineTimeMs: number,
  ): boolean {
    return this.shouldShowBattleActionCueForLiveUnit(cue, cue.actorKey, hpState, playbackTimelineTimeMs, false)
      && this.shouldShowBattleActionCueForLiveUnit(cue, cue.targetKey, hpState, playbackTimelineTimeMs, true);
  }

  private shouldShowBattleActionCueForLiveUnit(
    cue: BattleActionPresentationCue,
    unitKey: string,
    hpState: BattlePresentationHpState,
    playbackTimelineTimeMs: number,
    targetUnit: boolean,
  ): boolean {
    const unit = hpState.units.get(unitKey);
    if (!unit || unit.dead !== true) {
      return true;
    }
    const deadAtMs = unit.deadAtMs;
    if (deadAtMs === null || !Number.isFinite(deadAtMs)) {
      return false;
    }
    if (
      targetUnit
      && (cue.kind === 'damage_float' || cue.kind === 'hit_float')
      && typeof cue.hitKey === 'string'
      && cue.hitKey === unit.lastDamageHitKey
      && cue.timeMs <= deadAtMs + 360
    ) {
      return true;
    }
    return cue.timeMs <= deadAtMs && playbackTimelineTimeMs <= deadAtMs + 180;
  }

  private cleanupBattleTransientEffectLayers(parent: Node): void {
    const now = Date.now();
    let persistentFloatingLayers = 0;
    parent.children.slice().forEach((child) => {
      if (!BATTLE_TRANSIENT_EFFECT_NODE_NAMES.has(child.name)) {
        return;
      }
      const transient = child as Node & { __lootchainTransientCreatedAt?: number };
      const createdAt = typeof transient.__lootchainTransientCreatedAt === 'number' ? transient.__lootchainTransientCreatedAt : now;
      transient.__lootchainTransientCreatedAt = createdAt;
      const isFloating = child.name === 'LobbyBattleActionFloatingTextLayer' || child.name === 'LobbyBattleAssistFloatingTextLayer';
      if (isFloating) {
        persistentFloatingLayers += 1;
      }
      // 远程弹道层放宽存活时长,让光球有完整的飞行→命中过程,不再 0.3 秒一闪而过。
      const lifetimeMs = child.name === 'LobbyBattleActionProjectileLayer' ? 900 : BATTLE_FLOATING_TEXT_LIFETIME_MS;
      if (now - createdAt > lifetimeMs) {
        child.destroy();
      }
    });
    this.recordBattleTransientLayerTelemetry(persistentFloatingLayers);
  }

  private markBattleTransientEffectLayer(layer: Node): void {
    (layer as Node & { __lootchainTransientCreatedAt?: number }).__lootchainTransientCreatedAt = Date.now();
  }

  private recordBattleTransientLayerTelemetry(persistentFloatingLayers: number): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        transientLayerSamples?: Array<{
          persistentFloatingLayers: number;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples = [];
      telemetry.transientLayerSamples = [];
    }
    const samples = telemetry.transientLayerSamples ?? [];
    samples.push({ persistentFloatingLayers, at: Date.now() });
    if (samples.length > 600) {
      samples.splice(0, samples.length - 600);
    }
    telemetry.transientLayerSamples = samples;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  // 构建回放位置脚本：按动作时间序顺推每个单位的位置(初始阵位→动作 duel 席位→停留),同目标围攻按席位
  // 上下错开(dy>58 避开同侧重叠判定)。整场战斗的位置轨迹一次算定、完全确定。
  private ensureBattleActorPositionScript(
    renderActors: RenderableBattleActor[],
    snapshot: BattlePresentationSnapshot,
    timeline: BattlePresentationTimeline,
    scale: number,
  ): void {
    const replay = resolveBattleReplay(snapshot, timeline);
    const key = `${replay.replayKey}:${scale.toFixed(3)}`;
    if (this.battleActorPositionScript?.key === key) {
      return;
    }
    const positions = new Map<string, { x: number; y: number }>();
    const initial = new Map<string, { x: number; y: number }>();
    const unitSides = new Map<string, 'ally' | 'enemy'>();
    renderActors.forEach(({ unit, slot, enemy }) => {
      const home = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
      positions.set(unit.unitKey, { x: home.x, y: home.y });
      initial.set(unit.unitKey, { x: home.x, y: home.y });
      unitSides.set(unit.unitKey, unit.side);
    });
    // 跨交战组防重叠:配对交战下不同组的席位可能撞在一起,与同侧其他单位记账位
    // 距离过近时纵向错开。阈值必须随 scale 缩放(记账坐标已缩放),否则小尺度下冲突误报、
    // 让位被反复触发;让位方向先朝本单位初始车道一侧,避免全场一致向上挤压出"悬空"漂移。
    const separateFromSameSide = (actorKey: string, x: number, y: number): number => {
      const side = unitSides.get(actorKey);
      const homeY = initial.get(actorKey)?.y ?? y;
      const preferredSign = homeY <= y ? -1 : 1;
      for (let attempt = 0; attempt <= 6; attempt += 1) {
        const candidateY = attempt === 0
          ? y
          : y + (attempt % 2 === 1 ? preferredSign : -preferredSign) * Math.ceil(attempt / 2) * 78 * scale;
        let conflict = false;
        for (const [otherKey, pos] of positions) {
          if (otherKey === actorKey || unitSides.get(otherKey) !== side) {
            continue;
          }
          if (Math.abs(pos.x - x) <= 66 * scale && Math.abs(pos.y - candidateY) <= 72 * scale) {
            conflict = true;
            break;
          }
        }
        if (!conflict) {
          return candidateY;
        }
      }
      return y;
    };
    // 围攻席位按 target+actor 稳定分配(同一攻击者对同一目标始终同席)。
    // X 扇形必须比大体型立绘(~250px)错得开:旧值 36 让第 1/2 席与 0 席叠成一摞;
    // Y 收窄(±72/±44)避免大体型英雄被席位顶上车道上方读作"悬空"。
    const engageSeats = new Map<string, Map<string, number>>();
    const seatXOffsets = [0, 96, 96, -158, -158];
    const seatYOffsets = [0, 72, -72, 44, -44];
    const segments = new Map<string, BattleActorScriptSegment[]>();
    for (const action of replay.actions) {
      const actorKey = action.actor.unitKey;
      const from = positions.get(actorKey) ?? initial.get(actorKey) ?? { x: 0, y: 0 };
      let duelX = from.x;
      let duelY = from.y;
      let restX = from.x;
      let restY = from.y;
      let approachMs = 0;
      if (action.movementKind === 'approach') {
        const targetPos = positions.get(action.primaryTarget.unitKey) ?? { x: 0, y: 0 };
        const targetSeats = engageSeats.get(action.primaryTarget.unitKey) ?? new Map<string, number>();
        engageSeats.set(action.primaryTarget.unitKey, targetSeats);
        const seat = targetSeats.get(actorKey) ?? targetSeats.size;
        targetSeats.set(actorKey, seat);
        const facing = action.actor.side === 'ally' ? -1 : 1;
        // 席位 Y 锚定目标的初始车道而非实时记账位:记账位含上一轮席位/让位偏移,
        // 若继续叠加会逐回合向地面带顶部复利漂移,大体型英雄(白银圣枪等)被顶到半空。
        const targetLaneY = initial.get(action.primaryTarget.unitKey)?.y ?? targetPos.y;
        // 站在目标"面前"而非身上:贴脸基准距离 150,敌怪立绘宽(含烟雾),本体完全错开。
        const clamped = this.clampBattleActorFramePosition(new Vec3(
          targetPos.x + facing * (150 + seatXOffsets[seat % seatXOffsets.length]) * scale,
          targetLaneY + seatYOffsets[seat % seatYOffsets.length] * scale,
          0,
        ), scale);
        duelX = clamped.x;
        duelY = this.clampBattleActorFramePosition(new Vec3(clamped.x, separateFromSameSide(actorKey, clamped.x, clamped.y), 0), scale).y;
        const travel = Math.hypot(duelX - from.x, duelY - from.y);
        // approach 时长按实际距离缩短:已在目标面前时不再播完整跑动窗口(消除"贴脸原地跑步")。
        approachMs = travel <= 14 * scale ? 0 : Math.min(action.approachMs, Math.max(220, travel / Math.max(0.4, 0.85 * scale)));
        // 参考 AFK 式贴脸对打:打完停在目标面前不退步,位置稳定自然;拥挤由同侧分离与席位错开保证。
        const restBase = this.clampBattleActorFramePosition(new Vec3(duelX, duelY, 0), scale);
        const rest = this.clampBattleActorFramePosition(new Vec3(restBase.x, separateFromSameSide(actorKey, restBase.x, restBase.y), 0), scale);
        restX = rest.x;
        restY = rest.y;
        positions.set(actorKey, { x: restX, y: restY });
      }
      const list = segments.get(actorKey) ?? [];
      list.push({ startMs: action.startMs, approachMs, endMs: action.endMs, fromX: from.x, fromY: from.y, duelX, duelY, restX, restY });
      segments.set(actorKey, list);
    }
    // 收工归位:单位最后一次参战(出手或被打)后若战斗仍将持续,跑回自己的初始阵位待机,
    // 修复目标死亡/切换后停在场地边缘长时间落单站桩的问题。
    let battleLastMs = 0;
    const lastInvolvedMs = new Map<string, number>();
    for (const action of replay.actions) {
      battleLastMs = Math.max(battleLastMs, action.endMs);
      lastInvolvedMs.set(action.actor.unitKey, Math.max(lastInvolvedMs.get(action.actor.unitKey) ?? 0, action.endMs));
      lastInvolvedMs.set(action.primaryTarget.unitKey, Math.max(lastInvolvedMs.get(action.primaryTarget.unitKey) ?? 0, action.endMs));
    }
    for (const [actorKey, list] of segments) {
      const last = list[list.length - 1];
      const home = initial.get(actorKey);
      const from = positions.get(actorKey) ?? home;
      if (!last || !home || !from) {
        continue;
      }
      const involvedUntilMs = lastInvolvedMs.get(actorKey) ?? last.endMs;
      if (battleLastMs - involvedUntilMs <= 2400) {
        continue;
      }
      const travel = Math.hypot(home.x - from.x, home.y - from.y);
      if (travel <= 24 * scale) {
        continue;
      }
      const returnStartMs = involvedUntilMs + 900;
      const returnMs = Math.min(1500, Math.max(520, travel / Math.max(0.5, 0.9 * scale)));
      const homeY = separateFromSameSide(actorKey, home.x, home.y);
      list.push({
        startMs: returnStartMs,
        approachMs: returnMs,
        endMs: returnStartMs + returnMs,
        fromX: from.x,
        fromY: from.y,
        duelX: home.x,
        duelY: homeY,
        restX: home.x,
        restY: homeY,
        returnHome: true,
      });
      positions.set(actorKey, { x: home.x, y: homeY });
    }
    this.battleActorPositionScript = { key, segments, initial };
  }

  // 查询单位当前的脚本运动状态:approach 窗口内 = moving(应播 run),归位段结束后 = home(应播 idle)。
  private resolveBattleActorScriptMotionState(unitKey: string, playbackTimelineTimeMs: number): { kind: 'moving' | 'home'; segmentStartMs: number } | null {
    const list = this.battleActorPositionScript?.segments.get(unitKey) ?? [];
    let state: { kind: 'moving' | 'home'; segmentStartMs: number } | null = null;
    for (const segment of list) {
      if (segment.startMs > playbackTimelineTimeMs) {
        break;
      }
      if (segment.approachMs > 0 && playbackTimelineTimeMs < segment.startMs + segment.approachMs) {
        state = { kind: 'moving', segmentStartMs: segment.startMs };
      } else if (segment.returnHome && playbackTimelineTimeMs >= segment.startMs + segment.approachMs) {
        state = { kind: 'home', segmentStartMs: segment.startMs };
      } else {
        state = null;
      }
    }
    return state;
  }

  // 查询脚本位置：单位在任意时刻的位置 = 它当前/最近动作的插值(跑动中)或停留点;开战前 = 初始阵位。
  private resolveBattleActorScriptedPosition(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    playbackTimelineTimeMs: number,
    scale: number,
    currentActionCue: BattleActionPresentationCue | null,
  ): Vec3 | null {
    const bundle = this.battleActorPositionScript;
    if (!bundle) {
      return null;
    }
    const base = bundle.initial.get(unit.unitKey);
    if (!base) {
      return null;
    }
    let x = base.x;
    let y = base.y;
    const list = bundle.segments.get(unit.unitKey) ?? [];
    for (const segment of list) {
      if (segment.startMs > playbackTimelineTimeMs) {
        break;
      }
      if (segment.approachMs > 0 && playbackTimelineTimeMs < segment.startMs + segment.approachMs) {
        const progress = easeBattleActorMotionProgress((playbackTimelineTimeMs - segment.startMs) / segment.approachMs);
        x = segment.fromX + (segment.duelX - segment.fromX) * progress;
        y = segment.fromY + (segment.duelY - segment.fromY) * progress;
      } else if (playbackTimelineTimeMs < segment.endMs) {
        x = segment.duelX;
        y = segment.duelY;
      } else if (playbackTimelineTimeMs < segment.endMs + 380) {
        // 打完退半步到待机位(连续移动),让出目标正面。
        const progress = easeBattleActorMotionProgress((playbackTimelineTimeMs - segment.endMs) / 380);
        x = segment.duelX + (segment.restX - segment.duelX) * progress;
        y = segment.duelY + (segment.restY - segment.duelY) * progress;
      } else {
        x = segment.restX;
        y = segment.restY;
      }
    }
    // 受击反馈:被命中瞬间小幅后仰,幅度小且立即回弹,不构成位移来源。
    if (currentActionCue?.kind === 'damage_float' && currentActionCue.targetKey === unit.unitKey) {
      const impactProfile = resolveBattleImpactProfile(currentActionCue, scale);
      if (impactProfile) {
        const direction = enemy ? -1 : 1;
        x += -direction * impactProfile.defenderRecoil.distanceX * 0.42;
        y += impactProfile.defenderRecoil.liftY * 0.42;
      }
    }
    return this.clampBattleActorFramePosition(new Vec3(x, y, 0), scale);
  }

  private resolveBattleActorFramePosition(
    unit: BattlePresentationUnitSnapshot,
    slot: BattlePresentationSlot,
    enemy: boolean,
    scale: number,
    presentation: LobbyBattlePresentationState,
    openingConvergence: BattleOpeningConvergenceState,
    actionCues: BattleActionPresentationCue[],
    currentActionCue: BattleActionPresentationCue | null,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
    actionAnchors: Map<string, BattleActionAnchor>,
  ): Vec3 {
    const converged = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
    // 开场全员冲锋：所有 front 近战单位（双方）从各自战线一起跑到中线交锋区，作为后续就地交战的新基准位。
    const charge = this.resolveBattleActorFrontChargeOffset(unit, enemy, converged, scale, presentation, openingConvergence);
    const home = { x: converged.x + charge.x, y: converged.y + charge.y };
    const baseHomePosition = new Vec3(home.x, home.y, 0);
    const stickyContactPosition = this.battleActorStickyCombatPositions.get(unit.unitKey);
    const idleOffset = this.resolveBattleActorClashIdleOffset(unit, enemy, slot, scale, presentation, openingConvergence, charge.progress);
    const baseMotionHomePosition = new Vec3(baseHomePosition.x + idleOffset.x, baseHomePosition.y + idleOffset.y, 0);
    if (openingConvergence.active || (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded')) {
      const base = this.resolveActorCombatBasePosition(slot, enemy, openingConvergence, presentation, scale);
      return this.clampBattleActorFramePosition(new Vec3(base.x + charge.x, base.y + charge.y, 0), scale);
    }
    // 回放驱动单一位置状态机：战斗期位置唯一由回放动作脚本决定(锁定→跑到面前→攻击→停留→换目标),
    // 下方的 sticky/分散/迎位等旧位置来源全部旁路,从根上消除乱飘乱闪。
    const scripted = this.resolveBattleActorScriptedPosition(unit, enemy, playbackTimelineTimeMs, scale, currentActionCue);
    if (scripted) {
      return scripted;
    }
    if (currentActionCue?.kind === 'damage_float' && currentActionCue.actorRole !== 'back' && (currentActionCue.actorKey === unit.unitKey || currentActionCue.targetKey === unit.unitKey)) {
      const duelFrame = this.resolveActorMeleeDuelFrame(currentActionCue, actionAnchors, scale);
      if (duelFrame) {
        const isTarget = currentActionCue.targetKey === unit.unitKey;
        const impactProfile = isTarget ? resolveBattleImpactProfile(currentActionCue, scale) : null;
        const direction = enemy ? -1 : 1;
        const recoilX = impactProfile ? -direction * impactProfile.defenderRecoil.distanceX * 0.42 : 0;
        const recoilY = impactProfile ? impactProfile.defenderRecoil.liftY * 0.42 : 0;
        const framePosition = isTarget
          ? new Vec3(duelFrame.defenderDuelPosition.x + recoilX, duelFrame.defenderDuelPosition.y + recoilY, 0)
          : new Vec3(duelFrame.actorDuelPosition.x, duelFrame.actorDuelPosition.y, 0);
        this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(framePosition.x, framePosition.y, 0));
        this.battleActorStickyCombatHoldUntilMs.set(unit.unitKey, Date.now() + BATTLE_STICKY_CONTACT_HOLD_MS);
        return this.clampBattleActorFramePosition(framePosition, scale);
      }
    }
    const motionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);
    if (!motionCue) {
      const localActionOffset = this.resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation, actionAnchors, scale);
      const holdSeparation = this.resolveBattleStickyHoldSeparationOffset(unit, enemy, scale);
      const targetShouldMeetFromHome = currentActionCue?.targetKey === unit.unitKey
        && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack' || currentActionCue.kind === 'damage_float');
      const actionAnchor = targetShouldMeetFromHome ? actionAnchors.get(unit.unitKey) : null;
      const heldContactPosition = actionAnchor
        ? new Vec3(actionAnchor.x, actionAnchor.y, 0)
        : BATTLE_USE_STICKY_CONTACT_POSITIONS && stickyContactPosition && !targetShouldMeetFromHome
          ? new Vec3(stickyContactPosition.x + holdSeparation.x, stickyContactPosition.y + holdSeparation.y, 0)
          : baseMotionHomePosition;
      const heldFramePosition = this.clampBattleActorFramePosition(new Vec3(heldContactPosition.x + localActionOffset.x, heldContactPosition.y + localActionOffset.y, 0), scale);
      if (currentActionCue?.targetKey === unit.unitKey && currentActionCue.actorRole !== 'back' && currentActionCue.kind === 'damage_float') {
        const duelFrame = this.resolveActorMeleeDuelFrame(currentActionCue, actionAnchors, scale);
        if (duelFrame) {
          this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(duelFrame.defenderDuelPosition.x, duelFrame.defenderDuelPosition.y, 0));
          this.battleActorStickyCombatHoldUntilMs.set(unit.unitKey, Date.now() + BATTLE_STICKY_CONTACT_HOLD_MS);
        }
      }
      return this.applyBattleActorPersistentCombatSeparation(heldFramePosition, unit, enemy, scale, presentation, charge.progress);
    }
    const homePosition = baseMotionHomePosition;
    const actionOffset = this.resolveActorActionOffset(unit, enemy, slot, motionCue, presentation, actionAnchors, scale);
    const motionHomePosition = motionCue.kind === 'melee_move' ? homePosition : baseMotionHomePosition;
    const meleeContactPosition = motionCue.actorKey === unit.unitKey && motionCue.kind === 'melee_move'
      ? this.resolveActorMeleeContactPosition(motionCue, actionAnchors, scale)
      : null;
    const targetPosition = this.clampBattleActorFramePosition(
      meleeContactPosition
        ? new Vec3(meleeContactPosition.x, meleeContactPosition.y, 0)
        : new Vec3(baseMotionHomePosition.x + actionOffset.x, baseMotionHomePosition.y + actionOffset.y, 0),
      scale,
    );
    const motionStartPosition = this.resolveBattleActorMotionStartPosition(unit.unitKey, motionCue, motionHomePosition, scale);
    let rawActorPosition = this.clampBattleActorFramePosition(this.resolveBattleActorRootMotionPosition(motionStartPosition, targetPosition, motionCue, playbackTimelineTimeMs, timelineToPresentationRatio), scale);
    if (
      motionCue.actorKey === unit.unitKey
      && motionCue.kind === 'melee_move'
      && currentActionCue?.kind === 'melee_move'
      && currentActionCue.eventSeq === motionCue.eventSeq
      && currentActionCue.actorKey === unit.unitKey
    ) {
      const lungeOffset = this.resolveBattleActorVisibleMeleeCueLungeOffset(enemy, currentActionCue, playbackTimelineTimeMs, scale);
      rawActorPosition = this.clampBattleActorFramePosition(new Vec3(rawActorPosition.x + lungeOffset.x, rawActorPosition.y + lungeOffset.y, 0), scale);
    }
    if (
      motionCue.actorKey === unit.unitKey
      && motionCue.kind === 'melee_move'
      && Math.hypot(rawActorPosition.x - targetPosition.x, rawActorPosition.y - targetPosition.y) <= 2 * scale
    ) {
      this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(targetPosition.x, targetPosition.y, 0));
    }
    if (currentActionCue?.actorKey === unit.unitKey && currentActionCue.kind === 'damage_float') {
      this.battleActorStickyCombatPositions.set(unit.unitKey, new Vec3(rawActorPosition.x, rawActorPosition.y, 0));
      this.battleActorStickyCombatHoldUntilMs.set(unit.unitKey, Date.now() + BATTLE_STICKY_CONTACT_HOLD_MS);
    }
    // 攻击根运动阶段必须只服从本次动作的接触路径；额外分散只用于非攻击保持态，避免把近战推离目标。
    return rawActorPosition;
  }

  private clampBattleActorFramePosition(position: Vec3, scale: number): Vec3 {
    const safeX = 820 * scale;
    const safeTopY = BATTLE_GROUND_MAX_Y * scale;
    const safeBottomY = BATTLE_GROUND_MIN_Y * scale;
    return new Vec3(
      clamp(position.x, -safeX, safeX),
      clamp(position.y, safeBottomY, safeTopY),
      0,
    );
  }

  private applyBattleActorPersistentCombatSeparation(
    position: Vec3,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    scale: number,
    presentation: LobbyBattlePresentationState,
    chargeProgress: number,
  ): Vec3 {
    if (
      unit.role === 'back'
      || unit.power <= 0
      || unit.unitKey.includes('empty')
      || chargeProgress < 1
      || (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded')
    ) {
      return position;
    }
    if (BATTLE_USE_STICKY_CONTACT_POSITIONS && this.battleActorStickyCombatPositions.has(unit.unitKey)) {
      return this.clampBattleActorFramePosition(position, scale);
    }
    const slotIndex = Math.max(0, Math.min(4, unit.slot));
    const xOffsets = [0, -92, 92, -154, 154];
    const yOffsets = [0, 126, -126, 186, -186];
    const direction = enemy ? -1 : 1;
    const separated = new Vec3(
      position.x + direction * (xOffsets[slotIndex] ?? 0) * scale,
      position.y + (yOffsets[slotIndex] ?? 0) * scale,
      0,
    );
    return this.clampBattleActorFramePosition(separated, scale);
  }

  // 开场全员冲锋偏移：让所有 front 近战单位（双方）在战斗开始时一起用真实时间(约 1.15s)从战线跑到中线交锋区。
  // 远程(back)单位不冲锋。冲锋以 Date.now 真实时间驱动，与时间线压缩无关，保证是清晰可见的跑步而非瞬移。
  private resolveBattleActorFrontChargeOffset(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    converged: { x: number; y: number },
    scale: number,
    presentation: LobbyBattlePresentationState,
    openingConvergence: BattleOpeningConvergenceState,
  ): { x: number; y: number; progress: number } {
    const combatActive = presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded';
    if (!combatActive || unit.role === 'back' || unit.power <= 0 || unit.unitKey.includes('empty')) {
      // 战斗未开始/远程单位不冲锋；冲锋起始时刻在 resetBattlePlaybackRuntime 按场次清空，无需逐帧移除。
      return { x: 0, y: 0, progress: 0 };
    }
    if (!BATTLE_ENABLE_FRONT_CLASH_CHARGE) {
      return { x: 0, y: 0, progress: 1 };
    }
    let startMs = this.battleActorChargeStartMs.get(unit.unitKey);
    if (startMs === undefined) {
      startMs = Date.now();
      this.battleActorChargeStartMs.set(unit.unitKey, startMs);
    }
    const progress = clamp((Date.now() - startMs) / BATTLE_ACTOR_FRONT_CHARGE_MS, 0, 1);
    // 与开场入场跑相同的 smoothstep 缓动（平稳起步收尾），让冲锋与初次登场跑步同速、连贯，避免急冲突兀。
    const eased = easeBattleOpeningConvergenceProgress(progress);
    // 按固定距离朝中线前推，并夹紧到交锋线（不越过中线），保留各车道原有的 X 错位，避免所有近战叠在同一竖列。
    const forward = enemy ? -1 : 1;
    const minGap = this.resolveBattleActorChargeLaneGap(unit, scale);
    const rawTargetX = converged.x + forward * BATTLE_ACTOR_FRONT_CHARGE_DISTANCE * scale;
    const targetX = enemy ? Math.max(rawTargetX, minGap) : Math.min(rawTargetX, -minGap);
    const targetY = this.resolveBattleActorChargeLaneYOffset(unit, scale);
    return { x: eased * (targetX - converged.x), y: eased * targetY, progress };
  }

  private resolveBattleActorChargeLaneGap(unit: BattlePresentationUnitSnapshot, scale: number): number {
    const laneIndex = Math.max(0, Math.min(4, unit.slot));
    const rowOffset = laneIndex <= 2 ? laneIndex * 42 : 70 + (laneIndex - 3) * 44;
    const roleOffset = unit.role === 'boss' ? 38 : unit.role === 'back' ? 72 : 0;
    return (BATTLE_ACTOR_FRONT_CHARGE_CLASH_HALF_GAP + rowOffset + roleOffset) * scale;
  }

  private resolveBattleActorChargeLaneYOffset(unit: BattlePresentationUnitSnapshot, scale: number): number {
    const laneIndex = Math.max(0, Math.min(4, unit.slot));
    const offsets = [32, -4, -38, 58, -64];
    const roleOffset = unit.role === 'boss' ? 28 : 0;
    return ((offsets[laneIndex] ?? 0) + roleOffset) * scale;
  }

  private resolveBattleActorClashIdleOffset(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    slot: BattlePresentationSlot,
    scale: number,
    presentation: LobbyBattlePresentationState,
    openingConvergence: BattleOpeningConvergenceState,
    chargeProgress: number,
  ): { x: number; y: number } {
    const combatActive = !openingConvergence.active
      && presentation.phase === 'roundPlaying'
      && chargeProgress >= 1
      && unit.power > 0
      && !unit.unitKey.includes('empty');
    if (!combatActive || unit.role === 'back') {
      return { x: 0, y: 0 };
    }
    const direction = enemy ? -1 : 1;
    const phaseSeed = this.resolveBattleActorClashPhaseOffset(unit);
    const elapsed = Date.now() + phaseSeed;
    const pulse = Math.sin(elapsed / 430);
    const secondary = Math.cos(elapsed / 690);
    const laneFactor = slot.lane <= 2 ? 1 : 0.72;
    const numericUnit = Number(unit.unitKey.match(/\d+$/)?.[0]);
    let hash = 0;
    if (!Number.isFinite(numericUnit)) {
      for (let index = 0; index < unit.unitKey.length; index += 1) {
        hash = (hash * 31 + unit.unitKey.charCodeAt(index)) >>> 0;
      }
    }
    const laneSeed = Number.isFinite(numericUnit) ? numericUnit : hash;
    const lineIndex = Math.abs(laneSeed) % 5;
    const lineYOffset = [0, 62, -62, 96, -96][lineIndex] ?? 0;
    const lineXOffset = [0, -54, 54, -84, 84][lineIndex] ?? 0;
    return {
      x: (direction * BATTLE_ACTOR_CLASH_IDLE_SWAY_X * laneFactor * pulse + direction * lineXOffset) * scale,
      y: (BATTLE_ACTOR_CLASH_IDLE_SWAY_Y * secondary + lineYOffset) * scale,
    };
  }

  private resolveBattleActorRootMotionCue(
    unit: BattlePresentationUnitSnapshot,
    actionCues: BattleActionPresentationCue[],
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
    currentActionCue: BattleActionPresentationCue | null,
  ): BattleActionPresentationCue | null {
    const returnWindowMs = BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS + BATTLE_ACTOR_ATTACK_RETURN_MS;
    const safeTimelineRatio = Math.max(0.08, timelineToPresentationRatio);
    const active = actionCues
      .filter((cue) => {
        const actorMotion = cue.actorKey === unit.unitKey && (
          cue.kind === 'melee_move'
          || cue.kind === 'ranged_projectile'
        );
        const targetMeetMotion = false;
        if (!actorMotion && !targetMeetMotion) {
          return false;
        }
        const visualWindowMs = cue.kind === 'damage_float'
          ? Math.min(cue.durationMs, BATTLE_FLOATING_TEXT_LIFETIME_MS + 180)
          : cue.durationMs + returnWindowMs;
        const timelineWindowMs = visualWindowMs / safeTimelineRatio;
        const motionLeadMs = this.resolveBattleActorRootMotionStartLeadMs(cue);
        return cue.timeMs <= playbackTimelineTimeMs + motionLeadMs
          && playbackTimelineTimeMs <= cue.timeMs + timelineWindowMs;
      })
      .filter((cue) => {
        if (!currentActionCue) {
          return true;
        }
        const currentCueInvolvesUnit = currentActionCue.actorKey === unit.unitKey
          || currentActionCue.targetKey === unit.unitKey;
        const sameActionSeq = typeof cue.actionSeq === 'number'
          && typeof currentActionCue.actionSeq === 'number'
          && cue.actionSeq === currentActionCue.actionSeq;
        const sameActionDuel = cue.actorKey === currentActionCue.actorKey
          && cue.targetKey === currentActionCue.targetKey;
        const reversedHitDuel = currentActionCue.kind === 'hit_float'
          && cue.actorKey === currentActionCue.targetKey
          && cue.targetKey === currentActionCue.actorKey;
        const isImpactCue = currentActionCue.kind === 'damage_float' || currentActionCue.kind === 'hit_float';
        if (!currentCueInvolvesUnit) {
          // Other units must keep approaching during an unrelated hit frame, otherwise queued melee attacks freeze and land late.
          return true;
        }
        if (isImpactCue) {
          return sameActionSeq && (sameActionDuel || reversedHitDuel);
        }
        if (sameActionSeq) {
          return sameActionDuel || reversedHitDuel || cue.eventSeq === currentActionCue.eventSeq;
        }
        if (currentActionCue.kind === 'damage_float' && sameActionDuel && cue.eventSeq !== currentActionCue.eventSeq) {
          return false;
        }
        const linkedDuelWindowMs = (cue.durationMs + returnWindowMs) / safeTimelineRatio + 260;
        return (sameActionDuel || reversedHitDuel)
          && Math.abs(cue.timeMs - currentActionCue.timeMs) <= linkedDuelWindowMs;
      })
      .sort((a, b) => {
        if (currentActionCue?.kind === 'damage_float') {
          const aCurrentDamage = a.kind === 'damage_float' && a.eventSeq === currentActionCue.eventSeq;
          const bCurrentDamage = b.kind === 'damage_float' && b.eventSeq === currentActionCue.eventSeq;
          if (aCurrentDamage !== bCurrentDamage) {
            return aCurrentDamage ? -1 : 1;
          }
        }
        const aMeleeContact = a.kind === 'melee_move';
        const bMeleeContact = b.kind === 'melee_move';
        if (aMeleeContact !== bMeleeContact) {
          return aMeleeContact ? -1 : 1;
        }
        return b.timeMs - a.timeMs || resolveBattleActorRootMotionPriority(b.kind) - resolveBattleActorRootMotionPriority(a.kind);
      });
    const currentCueCanDriveUnit = currentActionCue
      && currentActionCue.actorKey === unit.unitKey
      && (
        currentActionCue.kind === 'melee_move'
        || currentActionCue.kind === 'ranged_projectile'
      );
    return active[0] ?? (currentCueCanDriveUnit ? currentActionCue : null);
  }

  private resolveBattleActorRootMotionPosition(
    homePosition: Vec3,
    targetPosition: Vec3,
    cue: BattleActionPresentationCue,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
  ): Vec3 {
    void timelineToPresentationRatio;
    const visualElapsedMs = (playbackTimelineTimeMs - cue.timeMs + this.resolveBattleActorRootMotionStartLeadMs(cue)) * BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR;
    const elapsedMs = clamp(visualElapsedMs, 0, cue.durationMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS + BATTLE_ACTOR_ATTACK_RETURN_MS);
    if (cue.kind === 'ranged_projectile') {
      const approachMs = Math.min(BATTLE_ACTOR_RANGED_NUDGE_MS, Math.max(90, cue.durationMs * 0.35));
      if (elapsedMs <= approachMs) {
        return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / approachMs));
      }
      const returnProgress = clamp((elapsedMs - approachMs) / Math.max(1, cue.durationMs - approachMs), 0, 1);
      return lerpVec3(targetPosition, homePosition, easeBattleActorMotionProgress(returnProgress));
    }
    if (cue.kind === 'melee_move') {
      const approachMs = Math.min(BATTLE_ACTOR_MELEE_APPROACH_MS, Math.max(320, cue.durationMs * 0.55));
      if (elapsedMs <= approachMs) {
        return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / approachMs));
      }
      const returnStartMs = cue.durationMs + BATTLE_ACTOR_ATTACK_RETURN_DELAY_MS;
      if (elapsedMs <= returnStartMs) {
        return targetPosition;
      }
      return targetPosition;
    }
    if (cue.kind === 'basic_attack') {
      const approachMs = this.resolveBattleActorBasicAttackApproachMs(cue);
      if (elapsedMs <= approachMs) {
        return lerpVec3(homePosition, targetPosition, easeBattleActorMotionProgress(elapsedMs / approachMs));
      }
      return targetPosition;
    }
    if (cue.kind === 'damage_float') {
      return targetPosition;
    }
    return homePosition;
  }

  private resolveBattleActorMotionStartPosition(
    unitKey: string,
    cue: BattleActionPresentationCue,
    fallbackHomePosition: Vec3,
    scale: number,
  ): Vec3 {
    const motionKey = `${unitKey}:${cue.cueKey}`;
    const existing = this.battleActorMotionStartPositions.get(motionKey);
    if (existing) {
      return existing;
    }
    const previousFramePosition = this.battleActorFramePositions.get(unitKey);
    const stickyContactPosition = this.battleActorStickyCombatPositions.get(unitKey);
    const rawStart = previousFramePosition ?? stickyContactPosition ?? fallbackHomePosition;
    const start = this.clampBattleActorFramePosition(new Vec3(rawStart.x, rawStart.y, 0), scale);
    this.battleActorMotionStartPositions.set(motionKey, start);
    return start;
  }

  private resolveBattleActorDisplayedFramePosition(
    unitKey: string,
    desiredPosition: Vec3,
    openingConvergence: BattleOpeningConvergenceState,
    presentation: LobbyBattlePresentationState,
    rootMotionCue: BattleActionPresentationCue | null,
    scale: number,
    commit: boolean,
  ): Vec3 {
    const previous = this.battleActorFramePositions.get(unitKey);
    const shouldLimit = !!previous
      && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded');
    if (!shouldLimit) {
      const next = new Vec3(desiredPosition.x, desiredPosition.y, 0);
      if (commit) {
        this.battleActorFramePositions.set(unitKey, next);
      }
      return next;
    }
    const dx = desiredPosition.x - previous.x;
    const dy = desiredPosition.y - previous.y;
    const distance = Math.hypot(dx, dy);
    // 统一真实时间速度上限：所有位置来源切换（贴脸、回位、换目标、保持分散）一律以连续移动呈现，禁止瞬移。
    // 按真实帧间隔换算每帧允许位移，低帧率下不会退化成大步跳变；速度对齐 screenshot 守卫的 126px/120ms 采样上限。
    const nowMs = Date.now();
    const lastUpdateMs = this.battleActorFrameUpdateMs.get(unitKey) ?? nowMs - 16;
    const dtMs = clamp(nowMs - lastUpdateMs, 8, 120);
    if (commit) {
      this.battleActorFrameUpdateMs.set(unitKey, nowMs);
    }
    const speedPxPerMs = rootMotionCue ? 1.2 : 0.95;
    // 单步位移上限 80px：低帧率(dt 大)时也不能超过守卫的连续帧 84px 瞬移判定线。
    const maxDelta = Math.max(BATTLE_ACTOR_POSITION_EPSILON * 2, Math.min(speedPxPerMs * dtMs, 80) * scale);
    if (distance <= maxDelta || distance <= BATTLE_ACTOR_POSITION_EPSILON) {
      const next = new Vec3(desiredPosition.x, desiredPosition.y, 0);
      if (commit) {
        this.battleActorFramePositions.set(unitKey, next);
      }
      return next;
    }

    const ratio = maxDelta / Math.max(1, distance);
    const next = new Vec3(previous.x + dx * ratio, previous.y + dy * ratio, 0);
    if (commit) {
      this.battleActorFramePositions.set(unitKey, next);
    }
    return next;
  }

  private resolveBattleActorBasicAttackApproachMs(cue: BattleActionPresentationCue): number {
    return Math.min(BATTLE_ACTOR_BASIC_ATTACK_APPROACH_MS, Math.max(320, cue.durationMs * 0.38));
  }

  private resolveBattleActorRootMotionStartLeadMs(cue: BattleActionPresentationCue): number {
    return cue.kind === 'melee_move' ? BATTLE_ACTOR_ROOT_MOTION_LEAD_MS : 28;
  }

  private resolveBattleActorVisibleMeleeCueLungeOffset(
    enemy: boolean,
    cue: BattleActionPresentationCue,
    playbackTimelineTimeMs: number,
    scale: number,
  ): { x: number; y: number } {
    const progress = clamp((playbackTimelineTimeMs - cue.timeMs) / Math.max(1, cue.durationMs * 0.32), 0, 1);
    const eased = easeBattleActorMotionProgress(progress);
    const direction = enemy ? -1 : 1;
    const backStep = (1 - eased) * 42 * scale;
    return {
      x: -direction * backStep,
      y: this.resolveBattleActionLaneOffset(cue, scale) * 0.035 * (1 - eased),
    };
  }

  private isBattleActorCueApproaching(
    cue: BattleActionPresentationCue,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
  ): boolean {
    void timelineToPresentationRatio;
    const visualElapsedMs = (playbackTimelineTimeMs - cue.timeMs + this.resolveBattleActorRootMotionStartLeadMs(cue)) * BATTLE_ACTOR_ROOT_MOTION_TIME_SCALE_FLOOR;
    if (cue.kind === 'melee_move') {
      const approachMs = Math.min(BATTLE_ACTOR_MELEE_APPROACH_MS, Math.max(320, cue.durationMs * 0.55));
      return visualElapsedMs <= approachMs;
    }
    if (cue.kind === 'basic_attack') {
      return false;
    }
    return false;
  }

  private setBattleActorFramePosition(actor: Node, position: Vec3): void {
    const current = actor.position;
    if (Math.abs(current.x - position.x) <= BATTLE_ACTOR_POSITION_EPSILON && Math.abs(current.y - position.y) <= BATTLE_ACTOR_POSITION_EPSILON) {
      return;
    }
    const distance = Math.hypot(position.x - current.x, position.y - current.y);
    const targetPosition = new Vec3(position.x, position.y, 0);
    if (!this.battleActorPositionInitialized.has(actor)) {
      this.battleActorPositionInitialized.add(actor);
      actor.setPosition(targetPosition);
      return;
    }
    actor.setPosition(targetPosition);
  }

  private recordBattleActorFrameTelemetry(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    position: Vec3,
    presentation: LobbyBattlePresentationState,
    openingConvergence: BattleOpeningConvergenceState,
    playbackTimelineTimeMs: number,
    currentActionCue: BattleActionPresentationCue | null,
    rootMotionCue: BattleActionPresentationCue | null,
  ): void {
    const now = Date.now();
    const bucket = `${this.lastBattleSceneKey}:${unit.unitKey}:${Math.floor(now / 24)}:${openingConvergence.active ? 'opening' : presentation.phase}`;
    if (this.battleTelemetryBuckets.has(bucket)) {
      return;
    }
    this.battleTelemetryBuckets.add(bucket);
    if (this.battleTelemetryBuckets.size > 6000) {
      this.battleTelemetryBuckets.clear();
    }
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: Array<{
          unitKey: string;
          side: 'ally' | 'enemy';
          rarity: string;
          role?: string;
          actionKind: string | null;
          actionActorKey: string | null;
          actionTargetKey: string | null;
          currentActionKind?: string | null;
          currentActionEventSeq?: number | null;
          currentActionHitKey?: string | null;
          rootMotionKind?: string | null;
          rootMotionActorKey?: string | null;
          rootMotionTargetKey?: string | null;
          rootMotionEventSeq?: number | null;
          rootMotionHitKey?: string | null;
          deadAtMs?: number | null;
          isActionActor: boolean;
          isActionTarget: boolean;
          x: number;
          y: number;
          openingActive: boolean;
          openingMoving: boolean;
          openingElapsedMs: number;
          playbackTimelineTimeMs: number;
          phase: string;
          at: number;
        }>;
        spineCues?: Array<{
          unitKey: string;
          rarity: string;
          requestedAnimationName: string;
          appliedAnimationName: string;
          at: number;
        }>;
        floatingTextSamples?: Array<{
          kind: 'action' | 'assist';
          cueKey: string;
          at: number;
        }>;
        spineVisualSamples?: Array<{
          unitKey: string;
          side: 'ally' | 'enemy';
          rarity: string;
          rawWidth: number;
          rawHeight: number;
          slotWidth: number;
          slotHeight: number;
          resolvedScale: number;
          estimatedWidth: number;
          estimatedHeight: number;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples.length = 0;
      if (telemetry.spineCues) {
        telemetry.spineCues.length = 0;
      }
      if (telemetry.spineVisualSamples) {
        telemetry.spineVisualSamples.length = 0;
      }
    }
    const telemetryCue = currentActionCue ?? rootMotionCue;
    telemetry.samples.push({
      unitKey: unit.unitKey,
      side: enemy ? 'enemy' : 'ally',
      rarity: (unit.rarity || unit.scaleProfile || '').toUpperCase(),
      role: unit.role,
      actionKind: telemetryCue?.kind ?? null,
      actionActorKey: telemetryCue?.actorKey ?? null,
      actionTargetKey: telemetryCue?.targetKey ?? null,
      currentActionKind: currentActionCue?.kind ?? null,
      currentActionEventSeq: currentActionCue?.eventSeq ?? null,
      currentActionHitKey: currentActionCue?.hitKey ?? null,
      rootMotionKind: rootMotionCue?.kind ?? null,
      rootMotionActorKey: rootMotionCue?.actorKey ?? null,
      rootMotionTargetKey: rootMotionCue?.targetKey ?? null,
      rootMotionEventSeq: rootMotionCue?.eventSeq ?? null,
      rootMotionHitKey: rootMotionCue?.hitKey ?? null,
      deadAtMs: null,
      isActionActor: telemetryCue?.actorKey === unit.unitKey,
      isActionTarget: telemetryCue?.targetKey === unit.unitKey,
      x: Math.round(position.x * 100) / 100,
      y: Math.round(position.y * 100) / 100,
      openingActive: openingConvergence.active,
      openingMoving: openingConvergence.moving,
      openingElapsedMs: Math.round(openingConvergence.elapsedMs),
      playbackTimelineTimeMs: Math.round(playbackTimelineTimeMs),
      phase: presentation.phase,
      at: now,
    });
    if (telemetry.samples.length > 4000) {
      telemetry.samples.splice(0, telemetry.samples.length - 4000);
    }
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private recordBattleActorSpineVisualTelemetry(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    rawWidth: number | undefined,
    rawHeight: number | undefined,
    slotWidth: number,
    slotHeight: number,
    resolvedScale: number,
  ): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        spineVisualSamples?: Array<{
          unitKey: string;
          side: 'ally' | 'enemy';
          rarity: string;
          rawWidth: number;
          rawHeight: number;
          slotWidth: number;
          slotHeight: number;
          resolvedScale: number;
          estimatedWidth: number;
          estimatedHeight: number;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples = [];
      telemetry.spineVisualSamples = [];
    }
    const samples = telemetry.spineVisualSamples ?? [];
    const normalizedRawWidth = Number.isFinite(rawWidth) ? Number(rawWidth) : 0;
    const normalizedRawHeight = Number.isFinite(rawHeight) ? Number(rawHeight) : 0;
    const roundedScale = Math.round(resolvedScale * 10000) / 10000;
    const normalizedVisualHeight = resolveBattleUnitSpineTelemetryVisualHeight(rawWidth, rawHeight, resolvedScale, unit, unit.role === 'boss');
    const last = samples[samples.length - 1];
    if (!last || last.unitKey !== unit.unitKey || last.resolvedScale !== roundedScale || last.rawHeight !== normalizedRawHeight) {
      samples.push({
        unitKey: unit.unitKey,
        side: enemy ? 'enemy' : 'ally',
        rarity: (unit.rarity || unit.scaleProfile || '').toUpperCase(),
        rawWidth: Math.round(normalizedRawWidth * 100) / 100,
        rawHeight: Math.round(normalizedRawHeight * 100) / 100,
        slotWidth: Math.round(slotWidth * 100) / 100,
        slotHeight: Math.round(slotHeight * 100) / 100,
        resolvedScale: roundedScale,
        estimatedWidth: Math.round(normalizedRawWidth * resolvedScale * 100) / 100,
        estimatedHeight: Math.round(normalizedVisualHeight * 100) / 100,
        at: Date.now(),
      });
      if (samples.length > 360) {
        samples.splice(0, samples.length - 360);
      }
    }
    telemetry.spineVisualSamples = samples;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private recordBattleActorSpineCueTelemetry(unit: BattlePresentationUnitSnapshot, requestedAnimationName: string | null, appliedAnimationName: string): void {
    const requested = (requestedAnimationName || '').trim();
    if (!requested) {
      return;
    }
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        spineCues?: Array<{
          unitKey: string;
          rarity: string;
          requestedAnimationName: string;
          appliedAnimationName: string;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples.length = 0;
      telemetry.spineCues = [];
    }
    const spineCues = telemetry.spineCues ?? [];
    const last = spineCues[spineCues.length - 1];
    if (!last || last.unitKey !== unit.unitKey || last.requestedAnimationName !== requested || last.appliedAnimationName !== appliedAnimationName) {
      spineCues.push({
        unitKey: unit.unitKey,
        rarity: (unit.rarity || unit.scaleProfile || '').toUpperCase(),
        requestedAnimationName: requested,
        appliedAnimationName,
        at: Date.now(),
      });
      if (spineCues.length > 320) {
        spineCues.splice(0, spineCues.length - 320);
      }
    }
    telemetry.spineCues = spineCues;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private recordBattleFloatingTextTelemetry(
    kind: 'action' | 'assist',
    cueKey: string,
    options?: {
      cueTimeMs?: number;
      hitKey?: string;
      eventSeq?: number;
      critical?: boolean;
      fontSize?: number;
      damageFloat?: boolean;
      visualDelayMs?: number;
    },
  ): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        floatingTextSamples?: Array<{
          kind: 'action' | 'assist';
          cueKey: string;
          hitKey?: string;
          eventSeq?: number;
          cueTimeMs?: number;
          critical?: boolean;
          fontSize?: number;
          damageFloat?: boolean;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples = [];
      telemetry.floatingTextSamples = [];
    }
    const samples = telemetry.floatingTextSamples ?? [];
    if (kind === 'action' && options?.damageFloat === true && typeof options.hitKey === 'string' && options.hitKey.length > 0
      && samples.some((sample) => sample.kind === 'action' && sample.damageFloat === true && sample.hitKey === options.hitKey)) {
      return;
    }
    samples.push({
      kind,
      cueKey,
      hitKey: options?.hitKey,
      eventSeq: options?.eventSeq,
      cueTimeMs: options?.cueTimeMs,
      critical: options?.critical,
      fontSize: options?.fontSize,
      damageFloat: options?.damageFloat,
      at: Date.now() + Math.max(0, options?.visualDelayMs ?? 0),
    });
    if (samples.length > 600) {
      samples.splice(0, samples.length - 600);
    }
    telemetry.floatingTextSamples = samples;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private recordBattleHpTelemetry(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    hpUnit: {
      hpRatio: number;
      currentHp?: number;
      maxHp?: number;
      dead: boolean;
      deadAtMs?: number | null;
      lastDamageHitKey?: string | null;
      lastDamageEventSeq?: number | null;
      lastDamageAtMs?: number | null;
    } | undefined,
    hpState: BattlePresentationHpState,
    currentActionCue: BattleActionPresentationCue | null,
    phase: LobbyBattlePresentationState['phase'],
  ): void {
    const now = Date.now();
    const bucket = `${this.lastBattleSceneKey}:hp:${unit.unitKey}:${Math.floor(now / 90)}`;
    if (this.battleTelemetryBuckets.has(bucket)) {
      return;
    }
    this.battleTelemetryBuckets.add(bucket);
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        hpSamples?: Array<{
          unitKey: string;
          side: 'ally' | 'enemy';
          hpRatio: number;
          currentHp: number;
          maxHp: number;
          dead: boolean;
          enemyTotalHpRatio: number;
          allyTotalHpRatio: number;
          currentActionKind: string | null;
          currentActionTargetKey: string | null;
          currentActionHitKey?: string | null;
          currentActionEventSeq?: number | null;
          lastDamageHitKey?: string | null;
          lastDamageEventSeq?: number | null;
          lastDamageAtMs?: number | null;
          phase?: string;
          deadAtMs?: number | null;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples = [];
      telemetry.hpSamples = [];
    }
    const samples = telemetry.hpSamples ?? [];
    const telemetryPhase = hpUnit?.dead === true && !hpUnit.lastDamageHitKey && !currentActionCue
      ? 'resultRecording'
      : phase;
    samples.push({
      unitKey: unit.unitKey,
      side: enemy ? 'enemy' : 'ally',
      hpRatio: Math.round((hpUnit?.hpRatio ?? (enemy ? hpState.enemyTotalHpRatio : hpState.allyTotalHpRatio)) * 10000) / 10000,
      currentHp: Math.round(hpUnit?.currentHp ?? 0),
      maxHp: Math.round(hpUnit?.maxHp ?? 0),
      dead: hpUnit?.dead === true,
      enemyTotalHpRatio: Math.round(hpState.enemyTotalHpRatio * 10000) / 10000,
      allyTotalHpRatio: Math.round(hpState.allyTotalHpRatio * 10000) / 10000,
      currentActionKind: currentActionCue?.kind ?? null,
      currentActionTargetKey: currentActionCue?.targetKey ?? null,
      currentActionHitKey: currentActionCue?.hitKey ?? null,
      currentActionEventSeq: currentActionCue?.eventSeq ?? null,
      lastDamageHitKey: hpUnit?.lastDamageHitKey ?? null,
      lastDamageEventSeq: hpUnit?.lastDamageEventSeq ?? null,
      lastDamageAtMs: typeof hpUnit?.lastDamageAtMs === 'number' ? Math.round(hpUnit.lastDamageAtMs) : null,
      phase: telemetryPhase,
      deadAtMs: typeof hpUnit?.deadAtMs === 'number' ? Math.round(hpUnit.deadAtMs) : null,
      at: now,
    });
    if (samples.length > 1000) {
      samples.splice(0, samples.length - 1000);
    }
    telemetry.hpSamples = samples;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private isBattleActorVisiblyDead(
    hpUnit: { dead: boolean; deadAtMs?: number | null } | undefined,
    playbackTimelineTimeMs: number,
    enemy: boolean,
  ): boolean {
    // 死亡单位(敌我均)播完倒地动画后隐藏消失,避免尸体残留或"复活再战"(战败时我方英雄也要消失)。
    void enemy;
    if (hpUnit?.dead !== true) {
      return false;
    }
    const deadAtMs = typeof hpUnit.deadAtMs === 'number' && Number.isFinite(hpUnit.deadAtMs)
      ? hpUnit.deadAtMs
      : playbackTimelineTimeMs;
    return playbackTimelineTimeMs >= deadAtMs + BATTLE_DEAD_ACTOR_HIDE_DELAY_MS;
  }

  private recordBattleDeadActorHiddenTelemetry(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    hpUnit: { dead: boolean; deadAtMs?: number | null; maxHp?: number } | undefined,
    hpState: BattlePresentationHpState,
    playbackTimelineTimeMs: number,
  ): void {
    const now = Date.now();
    const bucket = `${this.lastBattleSceneKey}:dead-hidden:${unit.unitKey}:${Math.floor(now / 180)}`;
    if (this.battleTelemetryBuckets.has(bucket)) {
      return;
    }
    this.battleTelemetryBuckets.add(bucket);
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        deadActorHiddenSamples?: Array<{
          unitKey: string;
          side: 'ally' | 'enemy';
          deadAtMs: number | null;
          playbackTimelineTimeMs: number;
          at: number;
        }>;
        hpSamples?: Array<{
          unitKey: string;
          side: 'ally' | 'enemy';
          hpRatio: number;
          currentHp: number;
          maxHp: number;
          dead: boolean;
          enemyTotalHpRatio: number;
          allyTotalHpRatio: number;
          currentActionKind: string | null;
          currentActionTargetKey: string | null;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples = [];
      telemetry.deadActorHiddenSamples = [];
    }
    const samples = telemetry.deadActorHiddenSamples ?? [];
    samples.push({
      unitKey: unit.unitKey,
      side: enemy ? 'enemy' : 'ally',
      deadAtMs: typeof hpUnit?.deadAtMs === 'number' ? Math.round(hpUnit.deadAtMs) : null,
      playbackTimelineTimeMs: Math.round(playbackTimelineTimeMs),
      at: now,
    });
    if (samples.length > 220) {
      samples.splice(0, samples.length - 220);
    }
    telemetry.deadActorHiddenSamples = samples;
    const hpSamples = telemetry.hpSamples ?? [];
    hpSamples.push({
      unitKey: unit.unitKey,
      side: enemy ? 'enemy' : 'ally',
      hpRatio: 0,
      currentHp: 0,
      maxHp: Math.round(typeof hpUnit?.maxHp === 'number' ? hpUnit.maxHp : 0),
      dead: true,
      enemyTotalHpRatio: Math.round(hpState.enemyTotalHpRatio * 10000) / 10000,
      allyTotalHpRatio: Math.round(hpState.allyTotalHpRatio * 10000) / 10000,
      currentActionKind: null,
      currentActionTargetKey: null,
      at: now,
    });
    if (hpSamples.length > 1000) {
      hpSamples.splice(0, hpSamples.length - 1000);
    }
    telemetry.hpSamples = hpSamples;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private recordBattleDeadUnitHitTelemetry(currentActionCue: BattleActionPresentationCue): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        deadUnitHitSamples?: Array<{
          cueKey: string;
          targetKey: string;
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples = [];
      telemetry.deadUnitHitSamples = [];
    }
    const samples = telemetry.deadUnitHitSamples ?? [];
    samples.push({
      cueKey: currentActionCue.cueKey,
      targetKey: currentActionCue.targetKey,
      at: Date.now(),
    });
    if (samples.length > 100) {
      samples.splice(0, samples.length - 100);
    }
    telemetry.deadUnitHitSamples = samples;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private recordBattleHitVfxAssetTelemetry(currentActionCue: BattleActionPresentationCue, assetPaths: string[]): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        hitVfxAssetSamples?: Array<{
          cueKey: string;
          targetKey: string;
          assetPaths: string[];
          at: number;
        }>;
      };
    };
    const telemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (telemetry.sceneKey !== this.lastBattleSceneKey) {
      telemetry.sceneKey = this.lastBattleSceneKey;
      telemetry.samples = [];
      telemetry.hitVfxAssetSamples = [];
    }
    const samples = telemetry.hitVfxAssetSamples ?? [];
    samples.push({
      cueKey: currentActionCue.cueKey,
      targetKey: currentActionCue.targetKey,
      assetPaths,
      at: Date.now(),
    });
    if (samples.length > 200) {
      samples.splice(0, samples.length - 200);
    }
    telemetry.hitVfxAssetSamples = samples;
    root.__lootchainBattlePlaybackTelemetry = telemetry;
  }

  private recordBattleImpactTelemetry(
    currentActionCue: BattleActionPresentationCue,
    impactProfile: BattleImpactProfile,
    effectKind: 'slash' | 'hitStop' | 'screenShake' | 'floatingText',
  ): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        impactSamples?: Array<{
          cueKey: string;
          effectKind: 'slash' | 'hitStop' | 'screenShake' | 'floatingText';
          isCritical: boolean;
          cueTimeMs: number;
          hitStopMs: number;
          screenShakeAmplitude: number;
          slashWidth: number;
          floatingTextFontSize: number;
          at: number;
        }>;
      };
    };
    const battleImpactTelemetry = root.__lootchainBattlePlaybackTelemetry ?? { sceneKey: this.lastBattleSceneKey, samples: [] };
    if (battleImpactTelemetry.sceneKey !== this.lastBattleSceneKey) {
      battleImpactTelemetry.sceneKey = this.lastBattleSceneKey;
      battleImpactTelemetry.samples = [];
      battleImpactTelemetry.impactSamples = [];
    }
    const impactSamples = battleImpactTelemetry.impactSamples ?? [];
    impactSamples.push({
      cueKey: currentActionCue.cueKey,
      effectKind,
      isCritical: impactProfile.isCritical,
      cueTimeMs: currentActionCue.timeMs,
      hitStopMs: impactProfile.hitStopMs,
      screenShakeAmplitude: impactProfile.screenShake.amplitude,
      slashWidth: impactProfile.slash.width,
      floatingTextFontSize: impactProfile.floatingText.fontSize,
      at: Date.now(),
    });
    if (impactSamples.length > 500) {
      impactSamples.splice(0, impactSamples.length - 500);
    }
    battleImpactTelemetry.impactSamples = impactSamples;
    root.__lootchainBattlePlaybackTelemetry = battleImpactTelemetry;
  }

  private shouldRenderBattleFloatingText(targetKey: string, cueKey: string, cueTimeMs: number): boolean {
    const bucketKey = `${this.lastBattleSceneKey}:${targetKey}`;
    const lastAt = this.battleFloatingTextLastAtByTarget.get(bucketKey);
    if (typeof lastAt === 'number' && Math.abs(cueTimeMs - lastAt) < BATTLE_FLOATING_TEXT_MIN_CUE_INTERVAL_MS) {
      return false;
    }
    this.battleFloatingTextLastAtByTarget.set(bucketKey, cueTimeMs);
    void cueKey;
    return true;
  }

  private resolveBattleFloatingTextLaneOffset(cueKey: string, scale: number): { x: number; y: number } {
    let hash = 0;
    for (let index = 0; index < cueKey.length; index += 1) {
      hash = (hash * 31 + cueKey.charCodeAt(index)) >>> 0;
    }
    return {
      x: ((hash % 5) - 2) * 8 * scale,
      y: (Math.floor(hash / 5) % 3) * 10 * scale,
    };
  }

  private applyBattleActorSpineCueOnce(cueKey: string, actor: Node, unit: BattlePresentationUnitSnapshot, actionAnimationName: string | null): void {
    if (!actionAnimationName) {
      return;
    }
    const playbackCueKey = `spine:${this.lastBattleSceneKey}:${cueKey}:${unit.unitKey}:${actionAnimationName}`;
    if (this.playedBattleCueKeys.has(playbackCueKey)) {
      return;
    }
    if (this.applyBattleActorSpineCue(actor, unit, actionAnimationName)) {
      this.playedBattleCueKeys.add(playbackCueKey);
    }
  }

  private applyBattleActorSpineCue(actor: Node, unit: BattlePresentationUnitSnapshot, actionAnimationName: string | null): boolean {
    const visualRoot = actor.getChildByName('LobbyBattleActorVisualRoot');
    const spineNode = actor.getChildByName('LobbyBattleActorSpineNode') ?? visualRoot?.getChildByName('LobbyBattleActorSpineNode');
    const skeleton = spineNode?.getComponent(sp.Skeleton) ?? null;
    const data = skeleton?.skeletonData ?? null;
    if (!skeleton || !data) {
      return false;
    }
    const animationNames = resolveBattleUnitSpineAnimationNames(data, unit);
    const animationName = this.resolveBattleUnitSpineCueAnimation(animationNames, actionAnimationName);
    if (!animationName) {
      return false;
    }
    try {
      const loopAnimation = animationName === animationNames.idle || actionAnimationName === 'move' || actionAnimationName === 'run' || actionAnimationName === 'walk';
      skeleton.setAnimation(0, animationName, loopAnimation);
      if (!loopAnimation && animationNames.idle) {
        skeleton.addAnimation(0, animationNames.idle, true, 0);
      }
      this.recordBattleActorSpineCueTelemetry(unit, actionAnimationName, animationName);
      return true;
    } catch (error) {
      console.warn(`[BattleStage13K] battle spine cue failed: ${unit.unitKey}/${animationName}`, error);
      return false;
    }
  }

  private resolveRenderableBattleUnits(
    slots: BattlePresentationSlot[],
    units: BattlePresentationUnitSnapshot[],
    enemy: boolean,
  ): RenderableBattleUnit[] {
    // 敌方渲染与数值战斗同源:有真怪(power>0)时不再渲染凑数占位怪,否则会出现
    // "数值上敌人死光弹胜利,场上还站着带血条的假怪"的矛盾。纯预览(无真怪)保留占位。
    const hasRealUnit = units.some((unit) => unit.power > 0 && !unit.unitKey.includes('empty'));
    const renderable = units
      .map((unit, sourceIndex) => ({ unit, sourceIndex }))
      .filter(({ unit }) => this.isBattleStage12RenderableUnit(unit, enemy))
      .filter(({ unit }) => !enemy || !hasRealUnit || unit.power > 0)
      .slice(0, slots.length);
    return renderable.map(({ unit, sourceIndex }, index) => ({
      unit,
      sourceIndex,
      slot: slots[index],
    }));
  }

  private isBattleStage12RenderableUnit(unit: BattlePresentationUnitSnapshot, enemy: boolean): boolean {
    if (unit.unitKey.includes('empty')) {
      return false;
    }
    if (enemy) {
      return Boolean(unit.enemyCode || unit.displayName.trim()) && unit.displayName !== '空位';
    }
    return Boolean(unit.sourceHeroId && unit.displayName.trim() && unit.displayName !== '空位');
  }

  private renderBattleActorActionCallout(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    actorActive: boolean,
    targetActive: boolean,
    assistActorActive: boolean,
    assistTargetActive: boolean,
  ): void {
    if (!BATTLE_ACTION_CALLOUT_ENABLED) {
      void parent;
      void width;
      void height;
      void scale;
      void unit;
      void enemy;
      void currentActionCue;
      void currentAssistCue;
      void actorActive;
      void targetActive;
      void assistActorActive;
      void assistTargetActive;
      return;
    }
    const text = this.resolveBattleActorActionCalloutText(unit, currentActionCue, currentAssistCue, actorActive, targetActive, assistActorActive, assistTargetActive);
    if (!text) {
      return;
    }
    const calloutWidth = Math.min(width * 0.82, 142 * scale);
    const calloutHeight = 28 * scale;
    const callout = this.host.addChildPlainNode(parent, 'LobbyBattleStage12ActionCallout', 0, height * 0.43, calloutWidth, calloutHeight);
    const graphics = callout.addComponent(Graphics);
    graphics.fillColor = enemy ? rgba(82, 18, 18, 228) : rgba(102, 55, 12, 232);
    graphics.roundRect(-calloutWidth / 2, -calloutHeight / 2, calloutWidth, calloutHeight, 7 * scale);
    graphics.fill();
    graphics.strokeColor = enemy ? rgba(255, 116, 92, 210) : rgba(255, 203, 74, 224);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.stroke();
    const label = this.host.addChildLabel(callout, 'LobbyBattleStage12ActionCalloutText', text, 0, 2 * scale, 16 * scale, rgba(255, 229, 130), new Size(calloutWidth - 16 * scale, 21 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    const marker = this.host.addChildPlainNode(callout, 'LobbyBattleStage12ActionCalloutMarker', 0, -calloutHeight / 2 - 7 * scale, 14 * scale, 14 * scale);
    const markerGraphics = marker.addComponent(Graphics);
    markerGraphics.fillColor = enemy ? rgba(255, 96, 82, 218) : rgba(255, 196, 64, 226);
    markerGraphics.moveTo(0, -7 * scale);
    markerGraphics.lineTo(-7 * scale, 7 * scale);
    markerGraphics.lineTo(7 * scale, 7 * scale);
    markerGraphics.close();
    markerGraphics.fill();
  }

  private resolveBattleActorActionCalloutText(
    unit: BattlePresentationUnitSnapshot,
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    actorActive: boolean,
    targetActive: boolean,
    assistActorActive: boolean,
    assistTargetActive: boolean,
  ): string | null {
    if (assistActorActive && currentAssistCue) {
      return currentAssistCue.kind === 'skill_cast' ? '释放技能' : '辅助支援';
    }
    if (assistTargetActive && currentAssistCue) {
      return currentAssistCue.iconType === 'debuff' ? '防御削弱' : currentAssistCue.displayValue;
    }
    if (actorActive && currentActionCue) {
      if (currentActionCue.kind === 'melee_move') {
        return unit.role === 'back' ? '瞄准' : '突进';
      }
      if (currentActionCue.kind === 'ranged_projectile') {
        return '远程攻击';
      }
      if (currentActionCue.kind === 'basic_attack') {
        return '集火攻击';
      }
      return currentActionCue.label;
    }
    return null;
  }

  private renderBattleActorNameplate(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    active: boolean,
  ): void {
    const plateWidth = Math.min(width * 0.82, 172 * scale);
    const plateHeight = 31 * scale;
    const y = -height * 0.53;
    const plate = this.host.addChildPlainNode(parent, 'LobbyBattleStage12ActorNameplate', 0, y, plateWidth, plateHeight);
    const graphics = plate.addComponent(Graphics);
    graphics.fillColor = enemy ? rgba(24, 7, 8, active ? 218 : 186) : rgba(8, 10, 13, active ? 218 : 184);
    graphics.roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 5 * scale);
    graphics.fill();
    graphics.strokeColor = active ? rgba(247, 196, 84, 178) : enemy ? rgba(135, 50, 50, 120) : rgba(131, 104, 58, 112);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();
    const name = this.host.addChildLabel(
      plate,
      'LobbyBattleStage12ActorName',
      unit.displayName,
      0,
      5 * scale, 14 * scale,
      enemy ? rgba(255, 207, 176) : rgba(246, 224, 171),
      new Size(plateWidth - 14 * scale, 15 * scale),
    );
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, false);
    const subline = this.host.addChildLabel(
      plate,
      'LobbyBattleStage12ActorSubline',
      `${unit.rarity || 'N'} · Lv.${unit.level}`,
      0,
      -8 * scale, 11 * scale,
      rgba(175, 164, 133),
      new Size(plateWidth - 14 * scale, 12 * scale),
    );
    subline.overflow = Label.Overflow.SHRINK;
  }

  private renderStage12HeroCardDeck(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    snapshot: BattlePresentationSnapshot,
    presentation: LobbyBattlePresentationState,
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    hpState: BattlePresentationHpState,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): void {
    if (width < 600 * scale || presentation.phase === 'ready' || presentation.phase === 'creatingSession') {
      return;
    }
    const heroes = snapshot.allies.filter((unit) => unit.sourceHeroId && unit.power > 0).slice(0, 5);
    if (heroes.length === 0) {
      return;
    }
    const cardWidth = Math.min(118 * scale, width * 0.128);
    const cardHeight = cardWidth * 1.26;
    let deckHasUltReady = false;
    const gap = 13 * scale;
    const deckWidth = heroes.length * cardWidth + (heroes.length - 1) * gap;
    const deck = this.host.addChildPlainNode(
      parent,
      'LobbyBattleStage12HeroCardDeck',
      width / 2 - deckWidth / 2 - 26 * scale,
      -height / 2 + cardHeight / 2 + 24 * scale,
      deckWidth + 24 * scale,
      cardHeight + 18 * scale,
    );
    const deckGraphics = deck.addComponent(Graphics);
    deckGraphics.fillColor = rgba(4, 5, 7, 128);
    deckGraphics.roundRect(-deckWidth / 2 - 12 * scale, -cardHeight / 2 - 9 * scale, deckWidth + 24 * scale, cardHeight + 18 * scale, 8 * scale);
    deckGraphics.fill();
    deckGraphics.strokeColor = rgba(224, 170, 88, 74);
    deckGraphics.lineWidth = Math.max(1, scale);
    deckGraphics.stroke();
    heroes.forEach((hero, index) => {
      const x = -deckWidth / 2 + cardWidth / 2 + index * (cardWidth + gap);
      const card = this.host.addChildPlainNode(deck, `LobbyBattleStage12HeroCard_${index}`, x, 0, cardWidth, cardHeight);
      const graphics = card.addComponent(Graphics);
      const actorActive = this.isCurrentActionActor(hero, currentActionCue, presentation);
      const targetActive = this.isCurrentActionTarget(hero, currentActionCue, presentation);
      const assistActorActive = this.isCurrentAssistSource(hero, currentAssistCue, presentation);
      const assistTargetActive = this.isCurrentAssistTarget(hero, currentAssistCue, presentation);
      const acting = actorActive || assistActorActive;
      const threatened = targetActive && currentActionCue?.actorSide === 'enemy';
      const supported = assistTargetActive;
      const heroDead = hpState.units.get(hero.unitKey)?.dead === true;
      const active = !heroDead && (acting || threatened || supported || ((hero.leader || index === 0) && !currentActionCue && !currentAssistCue));
      // 金色亮框专属"满能可点":行动/受击高亮不再用金框,避免玩家把攻击闪光误认成可点状态。
      const ultEnergy = this.resolveBattleActorUltEnergy(hero.unitKey, snapshot, timeline, playbackTimelineTimeMs);
      const anyEnemyAlive = snapshot.enemies.some((enemy) => !enemy.unitKey.includes('empty') && enemy.power > 0 && hpState.units.get(enemy.unitKey)?.dead !== true);
      const ultReady = !heroDead && ultEnergy >= BATTLE_MANUAL_ULT_ENERGY_MAX && presentation.phase === 'roundPlaying' && anyEnemyAlive;
      // 普通态不再用重装饰卡框(恶魔角饰在小卡上会盖住头像),轻量 Graphics 底;满能才上金色重框。
      const frame = ultReady
        ? this.host.addSprite(`LobbyBattleStage12HeroCardFrame_${index}`, BATTLE_C1812_SKILL_FRAME_ACTIVE_ASSET, 0, 0, cardWidth, cardHeight, card)
        : null;
      if (frame) {
        frame.type = Sprite.Type.SLICED;
      } else {
        graphics.fillColor = threatened ? rgba(42, 12, 10, 234) : active ? rgba(35, 20, 10, 230) : rgba(9, 10, 12, 218);
        graphics.roundRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 6 * scale);
        graphics.fill();
        graphics.strokeColor = threatened ? rgba(255, 86, 74, 226) : ultReady ? rgba(249, 199, 87, 224) : rgba(94, 81, 54, 172);
        graphics.lineWidth = Math.max(1, ultReady ? 1.4 * scale : scale);
        graphics.stroke();
      }
      graphics.fillColor = threatened ? rgba(116, 34, 30, 132) : this.resolveRarityColor(hero.rarity, active ? 118 : 82);
      graphics.roundRect(-cardWidth / 2 + 6 * scale, -cardHeight / 2 + 7 * scale, cardWidth - 12 * scale, cardHeight - 14 * scale, 5 * scale);
      graphics.fill();
      graphics.fillColor = rgba(0, 0, 0, 86);
      graphics.ellipse(0, -4 * scale, cardWidth * 0.24, cardHeight * 0.22);
      graphics.fill();
      graphics.fillColor = active ? rgba(244, 214, 150, 226) : rgba(168, 150, 120, 206);
      graphics.circle(0, 3 * scale, 8 * scale);
      graphics.fill();
      graphics.fillColor = hero.role === 'back' ? rgba(70, 116, 172, 198) : rgba(152, 82, 48, 198);
      graphics.moveTo(-15 * scale, -24 * scale);
      graphics.lineTo(-8 * scale, -2 * scale);
      graphics.lineTo(8 * scale, -2 * scale);
      graphics.lineTo(16 * scale, -24 * scale);
      graphics.close();
      graphics.fill();
      // C1812 英雄头像(named 骨骼可用):盖住上方的圆+剪影占位;SR/R 无对应头像时保留占位绘制。
      const deckPortraitPath = resolveBattleResultPortraitPath(hero);
      if (deckPortraitPath) {
        const portraitSize = Math.min(cardWidth - 12 * scale, cardHeight * 0.52);
        this.host.addSprite(`LobbyBattleStage12HeroCardPortrait_${index}`, deckPortraitPath, 0, -3 * scale, portraitSize, portraitSize, card);
      }
      graphics.fillColor = rgba(0, 0, 0, 76);
      graphics.rect(-cardWidth / 2 + 7 * scale, cardHeight / 2 - 27 * scale, cardWidth - 14 * scale, 20 * scale);
      graphics.fill();
      const unitName = (hero.displayName || hero.heroCode || '英雄').trim() || '英雄';
      const shortName = unitName.length > 3 ? unitName.slice(0, 3) : unitName;
      const label = this.host.addChildLabel(card, 'LobbyBattleStage12HeroCardName', shortName, 0, cardHeight / 2 - 17 * scale, 15 * scale, rgba(255, 239, 194), new Size(cardWidth - 14 * scale, 18 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, false);
      const roleChipWidth = Math.min(27 * scale, cardWidth * 0.36);
      graphics.fillColor = hero.role === 'back' ? rgba(58, 99, 152, 210) : rgba(128, 66, 42, 210);
      graphics.roundRect(cardWidth / 2 - roleChipWidth - 7 * scale, cardHeight / 2 - 48 * scale, roleChipWidth, 15 * scale, 4 * scale);
      graphics.fill();
      const roleLabel = this.host.addChildLabel(card, 'LobbyBattleStage12HeroCardRole', this.resolveBattleUnitRoleBadge(hero), cardWidth / 2 - roleChipWidth / 2 - 7 * scale, cardHeight / 2 - 40.5 * scale, 11 * scale, rgba(255, 236, 188), new Size(roleChipWidth - 3 * scale, 12 * scale));
      roleLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(roleLabel, scale, false);
      graphics.fillColor = this.resolveRarityColor(hero.rarity, 210);
      graphics.roundRect(-cardWidth / 2 + 7 * scale, cardHeight / 2 - 48 * scale, roleChipWidth, 15 * scale, 4 * scale);
      graphics.fill();
      const rarityLabel = this.host.addChildLabel(card, 'LobbyBattleStage12HeroCardRarity', hero.rarity || 'R', -cardWidth / 2 + roleChipWidth / 2 + 7 * scale, cardHeight / 2 - 40.5 * scale, 11 * scale, rgba(255, 245, 206), new Size(roleChipWidth - 3 * scale, 12 * scale));
      rarityLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(rarityLabel, scale, true);
      const hpRatio = hpState.units.get(hero.unitKey)?.hpRatio ?? hero.hpRatio;
      const hp = Math.round(clamp(hpRatio, 0, 1) * 100);
      const hpTrackWidth = cardWidth - 16 * scale;
      graphics.fillColor = rgba(4, 5, 5, 178);
      graphics.rect(-hpTrackWidth / 2, -cardHeight / 2 + 13 * scale, hpTrackWidth, 5 * scale);
      graphics.fill();
      graphics.fillColor = hp <= 25 ? rgba(232, 77, 68, 226) : rgba(126, 226, 142, 226);
      graphics.rect(-hpTrackWidth / 2, -cardHeight / 2 + 13 * scale, hpTrackWidth * clamp(hpRatio, 0, 1), 5 * scale);
      graphics.fill();
      const statusText = heroDead ? '阵亡' : this.resolveBattleHeroCardStatusText(acting, threatened, supported, hp);
      const statusColor = heroDead ? rgba(186, 132, 122) : threatened ? rgba(255, 158, 132) : acting ? rgba(255, 231, 132) : supported ? rgba(160, 224, 255) : hp <= 25 ? rgba(255, 164, 142) : rgba(178, 255, 170);
      const hpLabel = this.host.addChildLabel(card, 'LobbyBattleStage12HeroCardHp', statusText, 0, -cardHeight / 2 + 26 * scale, 12 * scale, statusColor, new Size(cardWidth - 10 * scale, 14 * scale));
      hpLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(hpLabel, scale, false);
      const pipY = -cardHeight / 2 + 36 * scale;
      const pipSize = Math.max(2.4 * scale, 3 * scale);
      const pipGap = 4.5 * scale;
      const filledPips = acting ? 3 : threatened ? 1 : supported ? 2 : Math.max(1, Math.ceil(clamp(hpRatio, 0, 1) * 3));
      for (let pip = 0; pip < 3; pip += 1) {
        const pipX = (pip - 1) * (pipSize + pipGap);
        graphics.fillColor = pip < filledPips
          ? (threatened ? rgba(255, 94, 80, 222) : acting ? rgba(255, 215, 96, 226) : rgba(118, 204, 136, 190))
          : rgba(37, 31, 25, 188);
        graphics.circle(pipX, pipY, pipSize);
        graphics.fill();
      }
      // 手动大招能量条:HP 条下方一条金色能量,满能亮框可点击释放。
      const energyRatio = clamp(ultEnergy / BATTLE_MANUAL_ULT_ENERGY_MAX, 0, 1);
      graphics.fillColor = rgba(4, 5, 5, 178);
      graphics.rect(-hpTrackWidth / 2, -cardHeight / 2 + 6 * scale, hpTrackWidth, 4.5 * scale);
      graphics.fill();
      graphics.fillColor = ultReady ? rgba(255, 214, 92, 240) : rgba(212, 164, 66, 208);
      graphics.rect(-hpTrackWidth / 2, -cardHeight / 2 + 6 * scale, hpTrackWidth * energyRatio, 4.5 * scale);
      graphics.fill();
      // 技能 CD 式充能:未满能时卡面覆盖暗色遮罩,随能量从下往上消退(像技能冷却转好),
      // 中央显示充能百分比;满能瞬间遮罩消失+金框呼吸,"转好了就能点"一眼可读。
      if (!ultReady && !heroDead) {
        const shadeHeight = Math.max(0, cardHeight * (1 - energyRatio) - 4 * scale);
        if (shadeHeight > 2) {
          const shade = this.host.addChildPlainNode(card, 'LobbyBattleStage12HeroCardChargeShade', 0, cardHeight / 2 - 2 * scale - shadeHeight / 2, cardWidth - 4 * scale, shadeHeight);
          const shadeGraphics = shade.addComponent(Graphics);
          // 遮罩要能看清头像:淡一档,只表达"未就绪"。
          shadeGraphics.fillColor = rgba(5, 4, 6, 96);
          shadeGraphics.roundRect(-(cardWidth - 4 * scale) / 2, -shadeHeight / 2, cardWidth - 4 * scale, shadeHeight, 4 * scale);
          shadeGraphics.fill();
        }
        const chargePct = this.host.addChildLabel(card, 'LobbyBattleStage12HeroCardChargePct', `${Math.floor(energyRatio * 100)}%`, 0, -2 * scale, 17 * scale, rgba(255, 235, 170), new Size(cardWidth - 10 * scale, 20 * scale));
        chargePct.overflow = Label.Overflow.SHRINK;
        this.applyOutline(chargePct, scale, true);
      }
      if (ultReady) {
        graphics.strokeColor = rgba(255, 224, 118, 236);
        graphics.lineWidth = Math.max(1.4, 1.8 * scale);
        graphics.roundRect(-cardWidth / 2 + 2 * scale, -cardHeight / 2 + 2 * scale, cardWidth - 4 * scale, cardHeight - 4 * scale, 6 * scale);
        graphics.stroke();
        const ultHint = this.host.addChildLabel(card, 'LobbyBattleStage12HeroCardUltHint', '大招!', 0, -cardHeight / 2 + 44 * scale, 15 * scale, rgba(255, 226, 128), new Size(cardWidth - 8 * scale, 18 * scale));
        ultHint.overflow = Label.Overflow.SHRINK;
        this.applyOutline(ultHint, scale, true);
        // 点击由常驻点击层处理(见 ensureBattleDeckClickLayer),卡节点本身每步重建不能挂 Button。
        // 呼吸/闪烁按真实时间相位计算:卡组每步重建,挂 tween 会每次从头重播,视觉上变成猛闪;
        // 用 Date.now() 相位保证跨重建连续平滑。
        const pulsePhase = Math.sin(Date.now() / 300);
        const hintOpacity = ultHint.node.addComponent(UIOpacity);
        hintOpacity.opacity = Math.round(186 + 69 * pulsePhase);
        const pulseScale = 1.03 + 0.035 * pulsePhase;
        card.setScale(pulseScale, pulseScale, 1);
        deckHasUltReady = true;
      }
      // 阵亡英雄整卡置灰,一眼可辨阵容战损。
      if (heroDead) {
        const cardOpacity = card.addComponent(UIOpacity);
        cardOpacity.opacity = 92;
      }
    });
    // 首次满能时战场中上弹一次引导横幅,教玩家"技能卡满能可点"。
    if (deckHasUltReady && !this.battleUltReadyHintShown) {
      this.battleUltReadyHintShown = true;
      const bannerWidth = Math.min(430 * scale, width * 0.5);
      const bannerHeight = 40 * scale;
      const banner = this.host.addChildPlainNode(parent, 'LobbyBattleUltReadyHintBanner', 0, height / 2 - 132 * scale, bannerWidth, bannerHeight);
      const bannerGraphics = banner.addComponent(Graphics);
      bannerGraphics.fillColor = rgba(8, 6, 4, 196);
      bannerGraphics.roundRect(-bannerWidth / 2, -bannerHeight / 2, bannerWidth, bannerHeight, 9 * scale);
      bannerGraphics.fill();
      bannerGraphics.strokeColor = rgba(255, 214, 92, 216);
      bannerGraphics.lineWidth = Math.max(1, 1.2 * scale);
      bannerGraphics.stroke();
      const bannerLabel = this.host.addChildLabel(banner, 'LobbyBattleUltReadyHintLabel', '英雄大招已就绪 · 点击下方发光卡牌释放', 0, 0, 17 * scale, rgba(255, 228, 138), new Size(bannerWidth - 24 * scale, 22 * scale));
      bannerLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(bannerLabel, scale, true);
      const bannerOpacity = banner.addComponent(UIOpacity);
      bannerOpacity.opacity = 0;
      tween(bannerOpacity)
        .to(0.24, { opacity: 255 })
        .delay(2.8)
        .to(0.5, { opacity: 0 })
        .start();
    }
    this.battleDeckClickContext = { heroes, snapshot, timeline, playbackTimelineTimeMs, hpState, cardWidth, cardHeight, gap, deckWidth };
    this.ensureBattleDeckClickLayer(
      parent,
      width / 2 - deckWidth / 2 - 26 * scale,
      -height / 2 + cardHeight / 2 + 24 * scale,
      deckWidth + 24 * scale,
      cardHeight + 18 * scale,
    );
  }

  // 常驻大招点击层:创建一次、每帧只调位置置顶;真实触摸在这里按几何命中换算成卡片序号。
  private ensureBattleDeckClickLayer(parent: Node, x: number, y: number, width: number, height: number): void {
    let layer = parent.getChildByName('LobbyBattleUltDeckClickLayer');
    if (!this.isNodeAlive(layer)) {
      layer = this.host.addChildPlainNode(parent, 'LobbyBattleUltDeckClickLayer', x, y, width, height);
      layer.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        const context = this.battleDeckClickContext;
        const clickLayer = layer;
        if (!context || !this.isNodeAlive(clickLayer)) {
          return;
        }
        const transform = clickLayer.getComponent(UITransform);
        if (!transform) {
          return;
        }
        const uiLocation = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
        const firstCardCenterX = -context.deckWidth / 2 + context.cardWidth / 2;
        const stride = context.cardWidth + context.gap;
        const index = Math.round((local.x - firstCardCenterX) / Math.max(1, stride));
        if (index < 0 || index >= context.heroes.length) {
          return;
        }
        const cardCenterX = firstCardCenterX + index * stride;
        if (Math.abs(local.x - cardCenterX) > context.cardWidth / 2 + 6 || Math.abs(local.y) > context.cardHeight / 2 + 9) {
          return;
        }
        this.castBattleManualUlt(context.heroes[index], context.snapshot, context.timeline, context.playbackTimelineTimeMs, context.hpState);
      }, this);
    }
    layer.setPosition(x, y, 0);
    layer.getComponent(UITransform)?.setContentSize(new Size(width, height));
    layer.setSiblingIndex(parent.children.length - 1);
  }

  private refreshStage12HeroCardDeck(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    snapshot: BattlePresentationSnapshot,
    presentation: LobbyBattlePresentationState,
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    hpState: BattlePresentationHpState,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): void {
    // 结算弹窗弹出后卡组(血条/能量残留)只剩视觉噪音,销毁并停止重建,让弹窗成为唯一焦点。
    if (parent.children.some((child) => child.name === 'LobbyBattleStage12VictoryOverlay')) {
      parent.children
        .filter((child) => child.name === 'LobbyBattleStage12HeroCardDeck')
        .forEach((child) => child.destroy());
      this.lastHeroCardDeckSignature = null;
      return;
    }
    // 内容签名不变(且无大招就绪呼吸帧)时跳过整组销毁重建:卡面视觉与上一帧完全一致,省掉一次 60Hz 重建。
    const deckState = this.resolveHeroCardDeckSignature(width, height, scale, snapshot, presentation, currentActionCue, currentAssistCue, hpState, timeline, playbackTimelineTimeMs);
    const deckMounted = parent.children.some((child) => child.name === 'LobbyBattleStage12HeroCardDeck');
    if (deckMounted && !deckState.hasUltReady && deckState.key === this.lastHeroCardDeckSignature) {
      return;
    }
    this.lastHeroCardDeckSignature = deckState.key;
    parent.children
      .filter((child) => child.name === 'LobbyBattleStage12HeroCardDeck')
      .forEach((child) => child.destroy());
    this.renderStage12HeroCardDeck(parent, width, height, scale, snapshot, presentation, currentActionCue, currentAssistCue, hpState, timeline, playbackTimelineTimeMs);
  }

  // 技能卡组内容签名:覆盖所有影响卡面的每帧输入(每英雄 hp%/能量% 取整 + 出手·受击·辅助·大招·阵亡态)。
  // 与 renderStage12HeroCardDeck 的取值口径一一对应,后者若改动逐英雄态判定,此处需同步(宁多勿漏,漏了会露旧帧)。
  // hasUltReady=true 时调用方不跳过(保留大招就绪的呼吸动画 + 保证点击上下文实时)。
  private resolveHeroCardDeckSignature(
    width: number,
    height: number,
    scale: number,
    snapshot: BattlePresentationSnapshot,
    presentation: LobbyBattlePresentationState,
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    hpState: BattlePresentationHpState,
    timeline: BattlePresentationTimeline,
    playbackTimelineTimeMs: number,
  ): { key: string; hasUltReady: boolean } {
    if (width < 600 * scale || presentation.phase === 'ready' || presentation.phase === 'creatingSession') {
      return { key: 'hidden', hasUltReady: false };
    }
    const heroes = snapshot.allies.filter((unit) => unit.sourceHeroId && unit.power > 0).slice(0, 5);
    if (heroes.length === 0) {
      return { key: 'empty', hasUltReady: false };
    }
    const anyEnemyAlive = snapshot.enemies.some((enemy) => !enemy.unitKey.includes('empty') && enemy.power > 0 && hpState.units.get(enemy.unitKey)?.dead !== true);
    let hasUltReady = false;
    const parts: string[] = [`${Math.round(width)}x${Math.round(height)}`, presentation.phase];
    heroes.forEach((hero, index) => {
      const actorActive = this.isCurrentActionActor(hero, currentActionCue, presentation);
      const targetActive = this.isCurrentActionTarget(hero, currentActionCue, presentation);
      const assistActorActive = this.isCurrentAssistSource(hero, currentAssistCue, presentation);
      const assistTargetActive = this.isCurrentAssistTarget(hero, currentAssistCue, presentation);
      const acting = actorActive || assistActorActive;
      const threatened = targetActive && currentActionCue?.actorSide === 'enemy';
      const supported = assistTargetActive;
      const heroDead = hpState.units.get(hero.unitKey)?.dead === true;
      const active = !heroDead && (acting || threatened || supported || ((hero.leader || index === 0) && !currentActionCue && !currentAssistCue));
      const ultEnergy = this.resolveBattleActorUltEnergy(hero.unitKey, snapshot, timeline, playbackTimelineTimeMs);
      const ultReady = !heroDead && ultEnergy >= BATTLE_MANUAL_ULT_ENERGY_MAX && presentation.phase === 'roundPlaying' && anyEnemyAlive;
      if (ultReady) {
        hasUltReady = true;
      }
      const hpRatio = hpState.units.get(hero.unitKey)?.hpRatio ?? hero.hpRatio;
      const hpPct = Math.floor(clamp(hpRatio, 0, 1) * 100);
      const energyPct = Math.floor(clamp(ultEnergy / BATTLE_MANUAL_ULT_ENERGY_MAX, 0, 1) * 100);
      parts.push(`${hero.unitKey}:${active ? 1 : 0}${threatened ? 1 : 0}${supported ? 1 : 0}${acting ? 1 : 0}${heroDead ? 1 : 0}${ultReady ? 1 : 0}:${hpPct}:${energyPct}`);
    });
    return { key: parts.join('|'), hasUltReady };
  }

  private resolveBattleUnitRoleBadge(unit: BattlePresentationUnitSnapshot): string {
    if (unit.role === 'boss') {
      return '首';
    }
    if (unit.role === 'back') {
      return '后';
    }
    return '前';
  }

  private resolveBattleHeroCardStatusText(acting: boolean, threatened: boolean, supported: boolean, hpPercent: number): string {
    if (acting) {
      return '出手';
    }
    if (threatened) {
      return '锁定';
    }
    if (supported) {
      return '支援';
    }
    return `${hpPercent}%`;
  }

  private createBattleActionAnchorMap(
    allies: RenderableBattleUnit[],
    enemies: RenderableBattleUnit[],
    scale: number,
    presentation: LobbyBattlePresentationState,
    openingConvergence: BattleOpeningConvergenceState,
  ): Map<string, BattleActionAnchor> {
    const anchors = new Map<string, BattleActionAnchor>();
    const setAnchor = (unit: BattlePresentationUnitSnapshot, slot: BattlePresentationSlot, enemy: boolean): void => {
      const converged = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
      // 对位 anchor 必须与实际站位一致地包含开场冲锋偏移，否则出手者会按旧间距过冲、打不到交锋后的目标。
      const charge = this.resolveBattleActorFrontChargeOffset(unit, enemy, converged, scale, presentation, openingConvergence);
      const combatActive = !openingConvergence.active
        && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording' || presentation.phase === 'resultRecorded');
      const livePosition = combatActive
        ? this.battleActorFramePositions.get(unit.unitKey) ?? this.battleActorStickyCombatPositions.get(unit.unitKey)
        : null;
      anchors.set(unit.unitKey, {
        x: livePosition?.x ?? converged.x + charge.x,
        y: livePosition?.y ?? converged.y + charge.y,
        width: slot.width,
        height: slot.height,
        enemy,
        role: unit.role,
      });
    };
    allies.forEach(({ unit, slot }) => setAnchor(unit, slot, false));
    enemies.forEach(({ unit, slot }) => setAnchor(unit, slot, true));
    return anchors;
  }

  private createBattleFrameAnchorMap(
    actors: RenderableBattleActor[],
    scale: number,
    presentation: LobbyBattlePresentationState,
    openingConvergence: BattleOpeningConvergenceState,
    actionCues: BattleActionPresentationCue[],
    currentActionCue: BattleActionPresentationCue | null,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
    anchors: Map<string, BattleActionAnchor>,
  ): Map<string, BattleActionAnchor> {
    const frameAnchors = new Map<string, BattleActionAnchor>();
    actors.forEach(({ unit, slot, enemy }) => {
      const rootMotionCue = this.resolveBattleActorRootMotionCue(unit, actionCues, playbackTimelineTimeMs, timelineToPresentationRatio, currentActionCue);
      const desiredPosition = this.resolveBattleActorFramePosition(unit, slot, enemy, scale, presentation, openingConvergence, actionCues, currentActionCue, playbackTimelineTimeMs, timelineToPresentationRatio, anchors);
      const framePosition = this.resolveBattleActorDisplayedFramePosition(unit.unitKey, desiredPosition, openingConvergence, presentation, rootMotionCue, scale, false);
      frameAnchors.set(unit.unitKey, {
        x: framePosition.x,
        y: framePosition.y,
        width: slot.width,
        height: slot.height,
        enemy,
        role: unit.role,
      });
    });
    return frameAnchors;
  }

  private resolveBattleSnapshotUnit(snapshot: BattlePresentationSnapshot, unitKey: string): BattlePresentationUnitSnapshot | null {
    return snapshot.allies.find((unit) => unit.unitKey === unitKey)
      ?? snapshot.enemies.find((unit) => unit.unitKey === unitKey)
      ?? null;
  }

  // 点开面板(ready)→请求中(starting)→资产预载(assetsLoading)全程都算加载相位:
  // 面板第一帧就是加载界面,不闪空战场;三个子相位共用同一 sceneKey,进度 tick 就地更新。
  private isBattleAssetLoadingPhase(state: LobbyBattlePanelState): boolean {
    if (state.settlement || state.settling || state.error) {
      return false;
    }
    if (state.assetsLoading) {
      return true;
    }
    return !state.start && !!state.stageCode;
  }

  private resolveBattleSceneKey(state: LobbyBattlePanelState): string {
    if (this.isBattleAssetLoadingPhase(state)) {
      return `assets-loading:${state.stageCode || 'none'}`;
    }
    const sessionKey = state.start?.battleNo || state.settlement?.battleNo || state.stageCode || 'none';
    const receiptKey = state.settlement?.settlementNo || 'no-settlement';
    const phaseKey = state.start ? 'started' : state.starting ? 'starting' : state.settlement ? 'settlement' : state.error ? 'error' : 'ready';
    return `${phaseKey}:${sessionKey}:${receiptKey}`;
  }

  private requiresFullBattleSceneRender(state: LobbyBattlePanelState): boolean {
    return state.presentationComplete || state.settling || !!state.settlement;
  }

  private resetBattlePlaybackRuntime(sceneKey: string): void {
    const sameBattleScene = this.lastBattleSceneKey === sceneKey;
    this.lastBattleSceneKey = sceneKey;
    this.battleSceneRoot = null;
    this.battleFieldNode = null;
    // 全量重渲染会重建技能卡组,旧签名作废;下次刷新按新卡组重新比对。
    this.lastHeroCardDeckSignature = null;
    this.battlePlaybackNodes.clear();
    if (!sameBattleScene) {
      this.battleActorFramePositions.clear();
      this.battleActorFrameUpdateMs.clear();
      this.battleActorPositionScript = null;
      this.battleVictoryBannerShown = false;
      this.battleManualUlts.length = 0;
      this.battleUltReadyHintShown = false;
      this.battleDeckClickContext = null;
      this.battleActorStickyCombatPositions.clear();
      this.battleActorStickyCombatHoldUntilMs.clear();
      this.battleActorMotionStartPositions.clear();
      this.battleActorMeleeDuelFrames.clear();
      this.battleActorChargeStartMs.clear();
      this.playedBattleCueKeys.clear();
      this.battleActorHomePositions.clear();
      this.battleActorPositionInitialized.clear();
    }
    this.battleTelemetryBuckets.clear();
    this.battleFloatingTextLastAtByTarget.clear();
    this.resetBattlePlaybackTelemetry(sceneKey);
  }

  private resetBattlePlaybackTelemetry(sceneKey: string): void {
    const root = globalThis as unknown as {
      __lootchainBattlePlaybackTelemetry?: {
        sceneKey: string;
        samples: unknown[];
        background?: {
          source: 'asset' | 'embedded' | 'fallback';
          loaded: boolean;
          at: number;
        };
      };
    };
    const previous = root.__lootchainBattlePlaybackTelemetry;
    if (previous?.sceneKey === sceneKey) {
      if (!previous.background) {
        previous.background = {
          source: 'asset',
          loaded: false,
          at: Date.now(),
        };
      }
      root.__lootchainBattlePlaybackTelemetry = previous;
      return;
    }
    root.__lootchainBattlePlaybackTelemetry = {
      sceneKey,
      samples: [],
      background: {
        source: 'asset',
        loaded: false,
        at: Date.now(),
      },
    };
  }

  private resolveActorConvergedCombatPosition(
    slot: BattlePresentationSlot,
    enemy: boolean,
    scale: number,
  ): { x: number; y: number } {
    const side = enemy ? 1 : -1;
    const homePull = slot.lane <= 2 ? 0.62 : 0.58;
    const laneX = slot.x * homePull;
    const minSideX = Math.max(208 * scale, slot.width * 0.78);
    const maxSideX = Math.max(minSideX, slot.width * 1.48);
    const sideColumnX = side * clamp(Math.abs(laneX), minSideX, maxSideX);
    void sideColumnX;
    const laneIndex = Math.max(0, Math.min(4, slot.lane));
    // Y 带压缩后横向拉宽交战线(中位控制在守卫 420 间距内),避免配对各组挤成一条竖列。
    const faceLineOffset = laneIndex <= 2 ? laneIndex * 32 : 100 + (laneIndex - 3) * 28;
    const faceLineX = clamp((120 + faceLineOffset) * scale, 110 * scale, 300 * scale);
    const x = side * faceLineX;
    const laneYCompression = slot.lane <= 2 ? 0.98 : 1.04;
    // 车道 Y 重映射进地面带:0.72 压缩保持车道间距比例,-160 整体下移到实景地面。
    return {
      x,
      y: clamp(slot.y * laneYCompression * BATTLE_GROUND_CONVERGED_Y_SCALE * 0.85 - 150 * scale, BATTLE_GROUND_MIN_Y * scale, BATTLE_GROUND_MAX_Y * scale),
    };
  }

  private resolveActorCombatBasePosition(
    slot: BattlePresentationSlot,
    enemy: boolean,
    openingConvergence: BattleOpeningConvergenceState,
    presentation: LobbyBattlePresentationState,
    scale: number,
  ): { x: number; y: number } {
    const shouldHoldConvergedLine = presentation.phase === 'roundPlaying'
      || presentation.phase === 'resultRecording'
      || presentation.phase === 'resultRecorded';
    const progress = openingConvergence.active
      ? openingConvergence.startProgress
      : shouldHoldConvergedLine
        ? 1
        : 0;
    const offset = this.resolveOpeningConvergenceOffset(slot, enemy, progress, scale);
    const converged = this.resolveActorConvergedCombatPosition(slot, enemy, scale);
    return {
      x: converged.x + offset.x,
      y: converged.y + offset.y,
    };
  }

  private resolveOpeningConvergenceOffset(
    slot: BattlePresentationSlot,
    enemy: boolean,
    progress: number,
    scale: number,
  ): { x: number; y: number } {
    const sideDirection = enemy ? 1 : -1;
    const laneRatio = BATTLE_OPENING_LANE_ENTRY_RATIOS[slot.lane] ?? BATTLE_OPENING_ENTRY_DISTANCE_RATIO;
    const entryDistance = clamp(
      slot.width * laneRatio,
      slot.width * BATTLE_OPENING_ENTRY_MIN_DISTANCE_RATIO,
      slot.width * BATTLE_OPENING_ENTRY_MAX_DISTANCE_RATIO,
    );
    const remaining = 1 - clamp(progress, 0, 1);
    const laneLift = slot.y > 0 ? 8 * scale : slot.y < 0 ? -8 * scale : 0;
    return {
      x: sideDirection * entryDistance * remaining,
      y: laneLift * remaining,
    };
  }

  private resolveActorActionOffset(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    slot: BattlePresentationSlot,
    currentActionCue: BattleActionPresentationCue | null,
    presentation: LobbyBattlePresentationState,
    anchors: Map<string, BattleActionAnchor>,
    scale: number,
  ): { x: number; y: number } {
    if (!currentActionCue || (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording')) {
      return { x: 0, y: 0 };
    }
    const direction = enemy ? -1 : 1;
    if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'melee_move') {
      const source = anchors.get(unit.unitKey);
      const contact = this.resolveActorMeleeContactPosition(currentActionCue, anchors, scale);
      if (source && contact) {
        return { x: contact.x - source.x, y: contact.y - source.y };
      }
      return this.resolveActorClashLungeOffset(unit, enemy, slot, currentActionCue, scale);
    }
    if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'basic_attack') {
      return { x: direction * slot.width * 0.018, y: this.resolveBattleActionLaneOffset(currentActionCue, scale) * 0.12 };
    }
    if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'ranged_projectile') {
      return { x: direction * slot.width * 0.04, y: 3 };
    }
    if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'damage_float' && unit.role !== 'back') {
      return this.resolveActorClashLungeOffset(unit, enemy, slot, currentActionCue, scale);
    }
    if (currentActionCue.targetKey === unit.unitKey && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack')) {
      return { x: 0, y: 0 };
    }
    if (currentActionCue.targetKey === unit.unitKey && currentActionCue.kind === 'damage_float') {
      const impactProfile = resolveBattleImpactProfile(currentActionCue, scale);
      const meleeMeetOffset = currentActionCue.actorRole !== 'back'
        ? this.resolveActorDefenderMeetOffset(currentActionCue, anchors, scale)
        : null;
      if (meleeMeetOffset) {
        const recoilX = impactProfile ? -direction * impactProfile.defenderRecoil.distanceX * 0.58 : -direction * 18 * scale;
        const recoilY = impactProfile ? impactProfile.defenderRecoil.liftY * 0.62 : 2 * scale;
        return {
          x: meleeMeetOffset.x + recoilX,
          y: meleeMeetOffset.y + recoilY,
        };
      }
      const targetNudge = this.resolveBattleDamageTargetSeparationOffset(unit, enemy, scale);
      if (impactProfile) {
        return {
          x: -direction * impactProfile.defenderRecoil.distanceX + targetNudge.x,
          y: impactProfile.defenderRecoil.liftY + targetNudge.y,
        };
      }
      return { x: -direction * slot.width * 0.035 + targetNudge.x, y: 2 * scale + targetNudge.y };
    }
    if (currentActionCue.actorKey === unit.unitKey && currentActionCue.kind === 'hit_float') {
      return { x: -direction * 42 * scale, y: -2 * scale };
    }
    return { x: 0, y: 0 };
  }

  private resolveBattleStickyHoldSeparationOffset(unit: BattlePresentationUnitSnapshot, enemy: boolean, scale: number): { x: number; y: number } {
    const index = this.resolveBattleStableUnitLaneIndex(unit);
    const yOffsets = [0, 0, 0, 0, 0];
    const xOffsets = [0, -160, 160, -260, 260];
    const direction = enemy ? -1 : 1;
    return {
      x: direction * (xOffsets[index] ?? 0) * scale,
      y: (yOffsets[index] ?? 0) * scale,
    };
  }

  private resolveBattleStableUnitLaneIndex(unit: BattlePresentationUnitSnapshot): number {
    const numericUnit = Number(unit.unitKey.match(/\d+$/)?.[0]);
    let hash = 0;
    if (!Number.isFinite(numericUnit)) {
      for (let index = 0; index < unit.unitKey.length; index += 1) {
        hash = (hash * 31 + unit.unitKey.charCodeAt(index)) >>> 0;
      }
    }
    const seed = Number.isFinite(numericUnit) ? numericUnit : hash;
    return Math.abs(seed) % 5;
  }

  private resolveBattleDamageTargetSeparationOffset(unit: BattlePresentationUnitSnapshot, enemy: boolean, scale: number): { x: number; y: number } {
    const index = this.resolveBattleStableUnitLaneIndex(unit);
    const yOffsets = [-36, 42, 36, 58, -58];
    const xOffsets = [0, -72, 72, -110, 110];
    const direction = enemy ? -1 : 1;
    return {
      x: direction * (xOffsets[index] ?? 0) * scale,
      y: (yOffsets[index] ?? 0) * scale,
    };
  }

  private resolveActorClashLungeOffset(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    slot: BattlePresentationSlot,
    currentActionCue: BattleActionPresentationCue,
    scale: number,
  ): { x: number; y: number } {
    const direction = enemy ? -1 : 1;
    const lungeX = currentActionCue.kind === 'melee_move'
      ? BATTLE_ACTOR_CLASH_APPROACH_LUNGE_X
      : currentActionCue.kind === 'basic_attack'
        ? BATTLE_ACTOR_CLASH_ATTACK_LUNGE_X
        : BATTLE_ACTOR_CLASH_HIT_HOLD_LUNGE_X;
    const roleScale = unit.role === 'boss' ? 1.16 : unit.role === 'front' ? 1 : 0.35;
    const laneSpread = slot.lane <= 2 ? (slot.lane - 1) * 4 : (slot.lane - 3) * 5;
    const actionLaneOffset = this.resolveBattleActionLaneOffset(currentActionCue, scale) * 0.1;
    return {
      x: direction * lungeX * roleScale * scale,
      y: laneSpread * scale + actionLaneOffset,
    };
  }

  private resolveActorMeleeContactPosition(
    currentActionCue: BattleActionPresentationCue,
    anchors: Map<string, BattleActionAnchor>,
    scale: number,
  ): { x: number; y: number } | null {
    return this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale)?.actorDuelPosition ?? null;
  }

  private resolveActorMeleeDuelFrame(
    currentActionCue: BattleActionPresentationCue,
    anchors: Map<string, BattleActionAnchor>,
    scale: number,
  ): BattleMeleeDuelFrame | null {
    const duelKey = this.resolveBattleMeleeDuelFrameKey(currentActionCue);
    const cached = duelKey ? this.battleActorMeleeDuelFrames.get(duelKey) : null;
    if (cached) {
      // 贴身锁定：对位几何在动作首帧锁定后，攻击点/命中点随目标实时位置整体平移——目标前迎、被击退或跑动时
      // 攻击者同步贴着目标当前位置打，而不是对着旧接触点"打空气"；防守方锁定位保持首帧值以避免反馈回路。
      // 对位几何按动作首帧锁定(锁定时 anchors 已是双方实时位置,对位即贴身)；持续跟随会与前线间隙/重叠
      // 校准冲突,故不做动态平移——目标大幅位移的矫正由下一个动作重新锁定完成。
      return cached;
    }
    const source = anchors.get(currentActionCue.actorKey);
    const target = anchors.get(currentActionCue.targetKey);
    if (!source || !target) {
      return null;
    }
    const roleGapBoost = currentActionCue.actorRole === 'boss' || currentActionCue.targetRole === 'boss' ? 1.18 : 1;
    const actorSide = source.enemy ? 1 : -1;
    const laneDelta = clamp(source.y - target.y, -target.height * 0.24, target.height * 0.24);
    const attackerFootprint = source.width * BATTLE_MELEE_ATTACKER_FOOTPRINT_RATIO;
    const targetFootprint = target.width * BATTLE_MELEE_TARGET_FOOTPRINT_RATIO;
    const contactGap = clamp(
      (attackerFootprint + targetFootprint + Math.max(source.width, target.width) * BATTLE_MELEE_DUEL_CONTACT_GAP_RATIO) * roleGapBoost,
      24 * scale,
      56 * scale,
    );
    const rawActionLaneOffset = this.resolveBattleActionLaneOffset(currentActionCue, scale);
    const actionLaneOffset = rawActionLaneOffset * BATTLE_GROUND_ACTION_LANE_Y_SCALE;
    const contactSlotXOffset = clamp(rawActionLaneOffset * 0.22, -32 * scale, 32 * scale);
    const duelCenterX = (source.x + target.x) / 2 + contactSlotXOffset;
    const duelHalfGap = clamp(contactGap * 0.56, 18 * scale, 34 * scale);
    const defenderDuelPosition = {
      x: duelCenterX - actorSide * duelHalfGap,
      y: clamp(target.y, BATTLE_GROUND_MIN_Y * scale, BATTLE_GROUND_MAX_Y * scale),
    };
    const actorDuelPosition = {
      x: duelCenterX + actorSide * duelHalfGap,
      y: clamp(target.y + laneDelta * 0.36 + actionLaneOffset, BATTLE_GROUND_MIN_Y * scale, BATTLE_GROUND_MAX_Y * scale),
    };
    const hitPoint = {
      x: (actorDuelPosition.x + defenderDuelPosition.x) / 2,
      y: clamp((actorDuelPosition.y + defenderDuelPosition.y) / 2 + target.height * 0.12, BATTLE_GROUND_MIN_Y * scale, BATTLE_GROUND_MAX_Y * scale),
    };
    const frame = {
      actorDuelPosition,
      defenderDuelPosition,
      hitPoint,
    };
    if (duelKey) {
      this.battleActorMeleeDuelFrames.set(duelKey, frame);
    }
    return frame;
  }

  private resolveBattleMeleeDuelFrameKey(currentActionCue: BattleActionPresentationCue): string | null {
    if (currentActionCue.actorRole === 'back') {
      return null;
    }
    if (
      currentActionCue.kind !== 'melee_move'
      && currentActionCue.kind !== 'basic_attack'
      && currentActionCue.kind !== 'damage_float'
    ) {
      return null;
    }
    const actionKey = Number.isFinite(Number(currentActionCue.actionSeq))
      ? `action:${currentActionCue.actionSeq}`
      : `event:${currentActionCue.eventSeq}`;
    return `${this.lastBattleSceneKey}:${actionKey}:${currentActionCue.actorKey}->${currentActionCue.targetKey}`;
  }

  private resolveActorDefenderMeetOffset(
    currentActionCue: BattleActionPresentationCue,
    anchors: Map<string, BattleActionAnchor>,
    scale: number,
  ): { x: number; y: number } | null {
    const source = anchors.get(currentActionCue.actorKey);
    const target = anchors.get(currentActionCue.targetKey);
    if (!source || !target) {
      return null;
    }
    const duelFrame = this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale);
    if (duelFrame) {
      return {
        x: duelFrame.defenderDuelPosition.x - target.x,
        y: duelFrame.defenderDuelPosition.y - target.y,
      };
    }
    const towardSource = Math.sign(source.x - target.x) || (target.enemy ? -1 : 1);
    const meetDistance = clamp(
      Math.abs(source.x - target.x) * BATTLE_MELEE_DEFENDER_STEP_RATIO,
      28 * scale,
      currentActionCue.targetRole === 'boss' ? 104 * scale : 76 * scale,
    );
    const laneDelta = clamp(source.y - target.y, -target.height * 0.24, target.height * 0.24);
    return {
      x: towardSource * meetDistance,
      y: laneDelta * 0.08,
    };
  }

  private resolveBattleActionLaneOffset(currentActionCue: BattleActionPresentationCue, scale: number): number {
    const seed = `${currentActionCue.actorKey}|${currentActionCue.targetKey}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    const numericActor = Number(currentActionCue.actorKey.match(/\d+$/)?.[0]);
    const laneSeed = Number.isFinite(numericActor) ? numericActor : hash;
    return ((laneSeed % 5) - 2) * 96 * scale;
  }

  private isCurrentActionActor(unit: BattlePresentationUnitSnapshot, currentActionCue: BattleActionPresentationCue | null, presentation: LobbyBattlePresentationState): boolean {
    return (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')
      && !!currentActionCue
      && currentActionCue.actorKey === unit.unitKey
      && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack' || currentActionCue.kind === 'ranged_projectile');
  }

  private isCurrentActionTarget(unit: BattlePresentationUnitSnapshot, currentActionCue: BattleActionPresentationCue | null, presentation: LobbyBattlePresentationState): boolean {
    return (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')
      && !!currentActionCue
      && ((currentActionCue.targetKey === unit.unitKey && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack'))
        || (currentActionCue.kind === 'damage_float' && currentActionCue.targetKey === unit.unitKey)
        || (currentActionCue.kind === 'hit_float' && currentActionCue.actorKey === unit.unitKey));
  }

  private isCurrentAssistSource(unit: BattlePresentationUnitSnapshot, currentAssistCue: BattleAssistPresentationCue | null, presentation: LobbyBattlePresentationState): boolean {
    return (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')
      && !!currentAssistCue
      && currentAssistCue.sourceKey === unit.unitKey
      && currentAssistCue.kind === 'skill_cast';
  }

  private isCurrentAssistTarget(unit: BattlePresentationUnitSnapshot, currentAssistCue: BattleAssistPresentationCue | null, presentation: LobbyBattlePresentationState): boolean {
    return (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')
      && !!currentAssistCue
      && currentAssistCue.targetKey === unit.unitKey
      && currentAssistCue.kind !== 'skill_cast';
  }

  private resolveActionAnimationName(
    unit: BattlePresentationUnitSnapshot,
    currentActionCue: BattleActionPresentationCue | null,
    rootMotionCue: BattleActionPresentationCue | null,
    actorActive: boolean,
    targetActive: boolean,
    playbackTimelineTimeMs: number,
    timelineToPresentationRatio: number,
  ): string | null {
    if (rootMotionCue?.actorKey === unit.unitKey) {
      if (rootMotionCue.kind === 'melee_move'
        && this.isBattleActorCueApproaching(rootMotionCue, playbackTimelineTimeMs, timelineToPresentationRatio)) {
        return 'run';
      }
      if (rootMotionCue.kind === 'melee_move') {
        if (currentActionCue?.actorKey === unit.unitKey && currentActionCue.kind !== 'melee_move') {
          return currentActionCue.animationName;
        }
        return this.resolveBattleUnitBasicAttackCueName(unit);
      }
      return rootMotionCue.animationName;
    }
    if (rootMotionCue?.targetKey === unit.unitKey && rootMotionCue.kind === 'melee_move') {
      if (this.isBattleActorCueApproaching(rootMotionCue, playbackTimelineTimeMs, timelineToPresentationRatio)) {
        return 'run';
      }
      if (currentActionCue?.targetKey === unit.unitKey && (currentActionCue.kind === 'damage_float' || currentActionCue.kind === 'hit_float')) {
        return 'hit';
      }
      return 'idle';
    }
    if (!currentActionCue) {
      return rootMotionCue?.targetKey === unit.unitKey ? 'idle' : null;
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

  private resolveBattleUnitBasicAttackCueName(unit: BattlePresentationUnitSnapshot): string {
    const rarity = (unit.rarity || unit.scaleProfile || '').trim().toUpperCase();
    return rarity === 'SR' || rarity === 'R' ? 'skill0' : 'atk';
  }

  // 交锋区错峰相位：按 unitKey 派生一个稳定偏移，让各近战单位的攻击/技能循环不整齐划一。
  private resolveBattleActorClashPhaseOffset(unit: BattlePresentationUnitSnapshot): number {
    let hash = 0;
    for (let index = 0; index < unit.unitKey.length; index += 1) {
      hash = (hash * 31 + unit.unitKey.charCodeAt(index)) >>> 0;
    }
    return hash % BATTLE_ACTOR_CLASH_ATTACK_CYCLE_MS;
  }

  // 交锋区就地混战循环：普攻→技能1→普攻→技能2，UR/SSR 用 atk/skill1/skill2，SR/R 用 skill0/skill1/skill2，
  // 动画名最终由 resolveBattleUnitSpineCueAnimation 按各自骨骼实际动画解析。
  private resolveBattleActorClashCombatAnimation(unit: BattlePresentationUnitSnapshot, clashBucket: number): string {
    const basicAttack = this.resolveBattleUnitBasicAttackCueName(unit);
    const cycle = [basicAttack, 'skill1', basicAttack, 'skill2'];
    return cycle[((clashBucket % cycle.length) + cycle.length) % cycle.length];
  }

  private resolveAssistAnimationName(
    unit: BattlePresentationUnitSnapshot,
    currentAssistCue: BattleAssistPresentationCue | null,
    actorActive: boolean,
    targetActive: boolean,
  ): string | null {
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

  private resolveBattleSpineCuePlaybackKey(cueKey: string, animationName: string | null): string {
    return `${cueKey}:${animationName || 'idle'}`;
  }

  private renderMeleeAdvanceGhost(parent: Node, width: number, height: number, scale: number, enemy: boolean, currentActionCue: BattleActionPresentationCue): void {
    const direction = enemy ? -1 : 1;
    const ghostX = direction * width * Math.max(0.18, currentActionCue.advanceRatio * 0.62);
    const ghost = this.host.addChildPlainNode(parent, 'LobbyBattleMeleeAdvanceGhost', ghostX, -height * 0.08, Math.min(width * 0.42, 76 * scale), 18 * scale);
    const graphics = ghost.addComponent(Graphics);
    graphics.fillColor = rgba(255, 213, 128, 46);
    graphics.ellipse(0, 0, Math.min(width * 0.24, 38 * scale), 6 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(255, 205, 104, 126);
    graphics.lineWidth = Math.max(1, scale);
    graphics.moveTo(-direction * 24 * scale, 0);
    graphics.lineTo(direction * 24 * scale, 0);
    graphics.stroke();
  }

  private refreshBattleActorCombatFeedback(
    actor: Node,
    slot: BattlePresentationSlot,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    snapshot: BattlePresentationSnapshot,
    actorActive: boolean,
    targetActive: boolean,
    assistActorActive: boolean,
    assistTargetActive: boolean,
    active: boolean,
  ): void {
    const visualRoot = actor.children.find((child) => child.name === 'LobbyBattleActorVisualRoot');
    if (!this.isNodeAlive(visualRoot)) {
      return;
    }
    visualRoot.children
      .filter((child) => child.name === 'LobbyBattleActorCombatFeedbackLayer')
      .forEach((child) => child.destroy());
    this.renderBattleActorCombatFeedback(visualRoot, slot.width, slot.height, scale, unit, enemy, actorActive, targetActive, assistActorActive, assistTargetActive, active, snapshot);
  }

  private renderBattleActorCombatFeedback(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    actorActive: boolean,
    targetActive: boolean,
    assistActorActive: boolean,
    assistTargetActive: boolean,
    active: boolean,
    snapshot: BattlePresentationSnapshot,
  ): void {
    const shouldShow = active || actorActive || targetActive || assistActorActive || assistTargetActive;
    if (!shouldShow) {
      return;
    }
    const layer = this.host.addChildPlainNode(parent, 'LobbyBattleActorCombatFeedbackLayer', 0, 0, width, height);
    const graphics = layer.addComponent(Graphics);
    const target = targetActive || assistTargetActive;
    const source = actorActive || assistActorActive;
    const ringY = -height * 0.42;
    const ringWidth = target ? width * 0.42 : width * 0.35;
    const ringHeight = Math.max(8 * scale, height * (target ? 0.064 : 0.052));
    graphics.fillColor = target
      ? (assistTargetActive ? rgba(70, 175, 222, 30) : rgba(255, 184, 78, 34))
      : source
      ? (enemy ? rgba(220, 72, 64, 24) : rgba(255, 205, 98, 24))
      : rgba(255, 226, 148, 16);
    graphics.ellipse(0, ringY, ringWidth, ringHeight);
    graphics.fill();
    graphics.strokeColor = target
      ? (assistTargetActive ? rgba(139, 216, 255, 176) : rgba(255, 218, 112, 188))
      : source
      ? (enemy ? rgba(255, 118, 96, 142) : rgba(255, 205, 88, 142))
      : rgba(128, 104, 66, 92);
    graphics.lineWidth = Math.max(1, (target ? 1.45 : 0.9) * scale);
    graphics.ellipse(0, ringY, ringWidth, ringHeight);
    graphics.stroke();

    if (target) {
      const frameWidth = Math.min(width * 0.74, 132 * scale);
      const frameHeight = Math.min(height * 0.17, 36 * scale);
      const targetFrame = this.host.addChildPlainNode(layer, 'LobbyBattleSkillTargetFrame', 0, ringY, frameWidth, frameHeight);
      const frameSprite = this.host.addSprite('LobbyBattleSkillTargetFrameSprite', snapshot.stage2UiAssets.skillTargetFrame, 0, 0, frameWidth, frameHeight, targetFrame);
      if (!frameSprite) {
        const targetFrameGraphics = targetFrame.addComponent(Graphics);
        targetFrameGraphics.strokeColor = assistTargetActive ? rgba(145, 215, 255, 150) : rgba(255, 214, 120, 136);
        targetFrameGraphics.lineWidth = Math.max(1, 1.15 * scale);
        targetFrameGraphics.ellipse(0, 0, frameWidth * 0.42, Math.max(8 * scale, frameHeight * 0.32));
        targetFrameGraphics.stroke();
      }
      graphics.strokeColor = assistTargetActive ? rgba(146, 224, 255, 194) : rgba(255, 230, 132, 210);
      graphics.lineWidth = Math.max(1, 1.2 * scale);
      const markY = ringY + Math.max(20 * scale, height * 0.11);
      const markHalf = Math.min(28 * scale, width * 0.17);
      graphics.moveTo(-markHalf, markY);
      graphics.lineTo(-markHalf * 0.42, markY + 8 * scale);
      graphics.moveTo(markHalf, markY);
      graphics.lineTo(markHalf * 0.42, markY + 8 * scale);
      graphics.moveTo(-markHalf, markY + 18 * scale);
      graphics.lineTo(-markHalf * 0.42, markY + 10 * scale);
      graphics.moveTo(markHalf, markY + 18 * scale);
      graphics.lineTo(markHalf * 0.42, markY + 10 * scale);
      graphics.stroke();
    }

    if (source) {
      const badgeWidth = Math.min(width * 0.44, 64 * scale);
      const badgeHeight = Math.max(4 * scale, 5 * scale);
      const badgeY = height * 0.2;
      graphics.fillColor = assistActorActive
        ? rgba(105, 206, 255, 168)
        : enemy
        ? rgba(226, 78, 66, 156)
        : rgba(255, 205, 78, 168);
      graphics.roundRect(-badgeWidth / 2, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
      graphics.fill();
    }

    if (unit.leader && !target) {
      const crownY = height * 0.36;
      graphics.fillColor = rgba(255, 218, 100, source ? 180 : 112);
      graphics.moveTo(-10 * scale, crownY);
      graphics.lineTo(-4 * scale, crownY + 9 * scale);
      graphics.lineTo(0, crownY + 3 * scale);
      graphics.lineTo(5 * scale, crownY + 10 * scale);
      graphics.lineTo(11 * scale, crownY);
      graphics.close();
      graphics.fill();
    }
  }

  private renderBattleActorSpineLayer(parent: Node, width: number, height: number, scale: number, unit: BattlePresentationUnitSnapshot, enemy: boolean, active: boolean, actionAnimationName: string | null): void {
    const resourcePath = resolveBattleUnitSpineResource(unit);
    const spineUuid = resolveBattleUnitSpineLoadUuid(unit);
    const renderGeneration = this.battleRenderGeneration;
    if (!resourcePath) {
      this.renderBattleActorSpineFallbackSilhouette(parent, width, height, scale, unit, enemy, active, 'LobbyBattleActorSpineFallbackSilhouette');
      return;
    }
    const fallback = this.renderBattleActorSpineFallbackSilhouette(parent, width, height, scale, unit, enemy, active, 'LobbyBattleActorSpineFallbackSilhouette');
    // 资源加载立即发起(全 actor 并行,Map 去重):否则末位 actor 的下载要等自己的错峰槽位
    // 才开始,进场空窗被人为拉长;错峰只负责摊平骨骼节点创建/mesh 构建的主线程尖峰。
    this.loadBattleUnitSpineData(resourcePath, spineUuid, () => {});
    // 进场分帧:fallback 剪影立即占位;骨骼节点创建+mesh 构建按 actor 错峰,
    // 摊平"多个 spine 同帧构建"的进场尖峰(尤其数据已缓存的重复进场会同步集中构建)。
    const staggerDelayMs = this.nextBattleSpineBuildStaggerDelayMs(renderGeneration);
    const buildSpine = (): void => {
      if (!this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isNodeAlive(parent)) {
        return;
      }
      const spineX = 0;
      const spineY = -height / 2 + Math.max(46 * scale, height * 0.22);
      const spineNode = this.host.addChildPlainNode(parent, 'LobbyBattleActorSpineNode', spineX, spineY, Math.min(width * 0.96, 220 * scale), height * 1.04);
      const skeleton = spineNode.addComponent(sp.Skeleton);
      skeleton.premultipliedAlpha = false;
      skeleton.timeScale = active ? 0.96 : 0.72;
      const destroyFallback = (): void => {
        if (this.isNodeAlive(fallback)) {
          fallback.destroy();
        }
      };
      const applyLoadedData = (data: sp.SkeletonData | null): boolean => {
        if (!this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
          return true;
        }
        if (data && this.applyBattleUnitSpineData(spineNode, skeleton, data, width, height, scale, unit, enemy, active, actionAnimationName)) {
          destroyFallback();
          return true;
        }
        return false;
      };
      const loadResourceFallback = (): void => {
        this.loadBattleUnitSpineData(resourcePath, null, (resourceData) => {
          if (applyLoadedData(resourceData)) {
            return;
          }
          if (this.isNodeAlive(spineNode)) {
            spineNode.destroy();
          }
        });
      };
      this.loadBattleUnitSpineData(resourcePath, spineUuid, (data) => {
        if (applyLoadedData(data)) {
          return;
        }
        if (spineUuid) {
          loadResourceFallback();
          return;
        }
        if (this.isNodeAlive(spineNode)) {
          spineNode.destroy();
        }
      });
    };
    if (staggerDelayMs <= 0) {
      buildSpine();
    } else {
      // 挂在 parent(actor 可视根)上;parent 销毁会自动停 tween,buildSpine 内再校验代际/存活。
      tween(parent).delay(staggerDelayMs / 1000).call(buildSpine).start();
    }
  }

  // 同一 render 代际内逐 actor 递增错峰延迟;换代际(新一次进场重建)自动归零。
  private nextBattleSpineBuildStaggerDelayMs(renderGeneration: number): number {
    if (this.battleSpineStaggerGeneration !== renderGeneration) {
      this.battleSpineStaggerGeneration = renderGeneration;
      this.battleSpineStaggerSlot = 0;
    }
    const slot = this.battleSpineStaggerSlot;
    this.battleSpineStaggerSlot += 1;
    return slot * BATTLE_SPINE_BUILD_STAGGER_MS;
  }

  private renderBattleActorSpineFallbackSilhouette(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    active: boolean,
    name = 'LobbyBattleActorSpineFallbackSilhouette',
  ): Node {
    const nodeName = enemy ? 'LobbyBattleEnemyStandin' : name;
    const x = 0;
    const y = -height / 2 + Math.max(46 * scale, height * 0.23);
    const standinWidth = Math.min(enemy ? 132 * scale : 120 * scale, width * (enemy ? 0.54 : 0.56));
    const standinHeight = Math.min(enemy ? 170 * scale : 164 * scale, height * 0.9);
    const standin = this.host.addChildPlainNode(parent, nodeName, x, y, standinWidth, standinHeight);
    if (enemy) {
      // AI 怪物立绘优先,加载失败回退到原剪影占位。
      if (!this.renderStage12EnemyAiPortrait(standin, standinWidth, standinHeight, scale, unit, active)) {
        this.renderStage12EnemyPlaceholder(standin, standinWidth, standinHeight, scale, unit, active);
      }
    } else if (!this.renderBattleProtagonistFallbackSprite(standin, standinWidth, standinHeight, scale, unit, active)) {
      this.renderStage12HeroFallbackStandin(standin, standinWidth, standinHeight, scale, unit, active);
    }
    return standin;
  }

  private renderBattleProtagonistFallbackSprite(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    active: boolean,
  ): boolean {
    const heroCode = (unit.heroCode || '').toUpperCase();
    if (!heroCode.startsWith('PROTAGONIST_')) {
      return false;
    }
    const asset = heroCode.includes('FEMALE') ? BATTLE_PROTAGONIST_FEMALE_FALLBACK_ASSET : BATTLE_PROTAGONIST_MALE_FALLBACK_ASSET;
    const frame = this.host.addChildPlainNode(parent, 'LobbyBattleStage12ProtagonistFallbackFrame', 0, -height * 0.02, width, height);
    const graphics = frame.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 86);
    graphics.ellipse(0, -height * 0.42, width * 0.42, Math.max(5 * scale, height * 0.045));
    graphics.fill();
    graphics.strokeColor = active ? rgba(255, 206, 92, 190) : rgba(155, 115, 57, 112);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.ellipse(0, -height * 0.42, width * 0.46, Math.max(7 * scale, height * 0.052));
    graphics.stroke();
    const sprite = this.host.addSprite('LobbyBattleStage12ProtagonistFallbackSprite', asset, 0, 1 * scale, width * 0.92, height * 0.98, frame);
    if (!sprite) {
      frame.destroy();
      return false;
    }
    sprite.color = active ? rgba(255, 255, 255) : rgba(225, 221, 211);
    const caption = this.host.addChildLabel(frame, 'LobbyBattleStage12ProtagonistFallbackCaption', '主角形态', 0, -height * 0.33, 11 * scale, rgba(255, 226, 158), new Size(width * 0.82, 14 * scale));
    caption.overflow = Label.Overflow.SHRINK;
    if (active) {
      tween(frame)
        .repeatForever(tween().to(0.36, { scale: new Vec3(1.025, 1.025, 1) }).to(0.38, { scale: Vec3.ONE }).delay(0.42))
        .start();
    }
    return true;
  }

  private renderStage12HeroFallbackStandin(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    active: boolean,
  ): void {
    const graphics = parent.addComponent(Graphics);
    const unitScale = Math.max(0.72, Math.min(1.45, height / (100 * scale), width / (70 * scale)));
    graphics.fillColor = rgba(0, 0, 0, 92);
    graphics.ellipse(0, -34 * scale * unitScale, 30 * scale * unitScale, 6 * scale * unitScale);
    graphics.fill();
    graphics.fillColor = unit.role === 'back' ? rgba(32, 49, 82, 222) : rgba(76, 49, 30, 222);
    graphics.moveTo(-24 * scale * unitScale, -28 * scale * unitScale);
    graphics.lineTo(-12 * scale * unitScale, 18 * scale * unitScale);
    graphics.lineTo(0, 32 * scale * unitScale);
    graphics.lineTo(14 * scale * unitScale, 18 * scale * unitScale);
    graphics.lineTo(24 * scale * unitScale, -28 * scale * unitScale);
    graphics.close();
    graphics.fill();
    graphics.fillColor = rgba(217, 160, 72, 230);
    graphics.circle(0, 24 * scale * unitScale, 11 * scale * unitScale);
    graphics.fill();
    graphics.strokeColor = active ? rgba(255, 210, 116, 216) : rgba(213, 157, 77, 126);
    graphics.lineWidth = Math.max(1, active ? 1.7 * scale : scale);
    graphics.moveTo(-30 * scale * unitScale, -2 * scale * unitScale);
    graphics.lineTo(-6 * scale * unitScale, 10 * scale * unitScale);
    graphics.moveTo(6 * scale * unitScale, 10 * scale * unitScale);
    graphics.lineTo(31 * scale * unitScale, -4 * scale * unitScale);
    graphics.stroke();
    const label = this.host.addChildLabel(parent, 'LobbyBattleStage12HeroFallbackLabel', unit.rarity || 'HERO', 0, -44 * scale * unitScale, 11 * scale, rgba(255, 230, 164), new Size(width * 0.74, 14 * scale));
    label.overflow = Label.Overflow.SHRINK;
    if (active) {
      tween(parent)
        .repeatForever(tween().to(0.34, { scale: new Vec3(1.06, 1.06, 1) }).to(0.36, { scale: Vec3.ONE }).delay(0.42))
        .start();
    }
  }

  // AI 怪物立绘:boss/精英 → 黑甲骑士,后排 → 披风怨灵,前排 → 双 grunt 按 unitKey 稳定哈希轮换。
  private renderStage12EnemyAiPortrait(parent: Node, width: number, height: number, scale: number, unit: BattlePresentationUnitSnapshot, active: boolean): boolean {
    const isBoss = unit.monsterBoss === true || unit.role === 'boss';
    const isElite = isBoss || unit.monsterType === 'ELITE' || /精英|首领|领主|elite|boss/i.test(`${unit.enemyRole || ''}${unit.displayName || ''}`);
    // P8 怪物系统:模板配置立绘优先(一体构图只等比显示,按 display_scale 放缩,脚底对地);缓存未热/未配置回退旧 AI 图池。
    const skinAsset = (unit.monsterSkinAsset || '').trim();
    let sprite: Sprite | null = null;
    let displayHeight = height * (isElite ? 1.04 : 0.98);
    let displayWidth = displayHeight;
    if (skinAsset) {
      const monsterScale = Math.max(0.5, Math.min(2, unit.monsterDisplayScale ?? 1));
      displayHeight = height * 0.98 * monsterScale;
      sprite = this.host.addSprite('LobbyBattleStage12EnemyAiPortrait', `${skinAsset}/spriteFrame`, 0, (displayHeight - height * 0.98) / 2, displayHeight, displayHeight, parent);
      if (sprite) {
        const frameRect = sprite.spriteFrame ? sprite.spriteFrame.rect : null;
        const aspect = frameRect && frameRect.height > 0 ? frameRect.width / frameRect.height : 1;
        displayWidth = displayHeight * aspect;
        sprite.node.getComponent(UITransform)?.setContentSize(new Size(displayWidth, displayHeight));
        // S196 素材原始朝右;敌方站右侧,水平镜像成面向我方(骨骼接入时同样在节点上翻转,不改动画数据)。
        sprite.node.setScale(-1, 1, 1);
      }
    }
    if (!sprite) {
      const portrait = isElite
        ? BATTLE_AI_MONSTER_ELITE_PORTRAIT
        : unit.role === 'back'
          ? BATTLE_AI_MONSTER_BACK_PORTRAIT
          : BATTLE_AI_MONSTER_PORTRAITS[Math.abs([...unit.unitKey].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) | 0, 7)) % BATTLE_AI_MONSTER_PORTRAITS.length];
      displayHeight = height * (isElite ? 1.04 : 0.98);
      displayWidth = displayHeight * portrait.aspect;
      sprite = this.host.addSprite('LobbyBattleStage12EnemyAiPortrait', portrait.path, 0, 0, displayWidth, displayHeight, parent);
    }
    if (!sprite) {
      return false;
    }
    // 地面阴影 + 行动时描边光圈,与英雄侧一致的战场存在感。
    const graphics = parent.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 92);
    graphics.ellipse(0, -displayHeight * 0.46, displayWidth * 0.34, Math.max(5 * scale, displayHeight * 0.05));
    graphics.fill();
    if (active) {
      graphics.strokeColor = rgba(255, 96, 74, 176);
      graphics.lineWidth = Math.max(1, 1.2 * scale);
      graphics.ellipse(0, -displayHeight * 0.46, displayWidth * 0.4, Math.max(7 * scale, displayHeight * 0.06));
      graphics.stroke();
    }
    // BOSS 名条强化:前缀+金红大字;普通怪保持浅红小字。
    const nameText = isBoss ? `BOSS·${unit.displayName || '敌人'}` : (unit.displayName || '敌人');
    const label = this.host.addChildLabel(
      parent,
      'LobbyBattleStage12EnemyAiName',
      nameText,
      0,
      -displayHeight * 0.56,
      (isBoss ? 13 : 11) * scale,
      isBoss ? rgba(255, 214, 118) : rgba(255, 190, 156),
      new Size(width * 1.4, 16 * scale),
    );
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, isBoss);
    return true;
  }

  private renderStage12EnemyPlaceholder(parent: Node, width: number, height: number, scale: number, unit: BattlePresentationUnitSnapshot, active: boolean): void {
    const node = this.host.addChildPlainNode(parent, 'LobbyBattleStage12EnemyPlaceholder', 0, 0, width, height);
    const unitScale = Math.max(0.74, Math.min(1.54, height / (112 * scale), width / (76 * scale)));
    const graphics = node.addComponent(Graphics);
    const u = scale * unitScale;
    // 怪物骨骼未配置前的正式占位：用厚身体、角、爪和眼光读成敌人，避免调试剪影观感。
    graphics.fillColor = rgba(0, 0, 0, 122);
    graphics.ellipse(0, -36 * u, 39 * u, 7.5 * u);
    graphics.fill();
    const bodyColor = unit.role === 'boss' ? rgba(86, 18, 31, 244) : rgba(42, 24, 34, 238);
    const shellColor = unit.role === 'boss' ? rgba(126, 32, 42, 232) : rgba(66, 36, 42, 220);
    const edgeColor = active ? rgba(255, 106, 78, 196) : rgba(180, 70, 62, 124);
    // 厚重下盘
    graphics.fillColor = bodyColor;
    graphics.moveTo(-26 * u, -34 * u);
    graphics.lineTo(-18 * u, -2 * u);
    graphics.lineTo(-8 * u, 9 * u);
    graphics.lineTo(9 * u, 9 * u);
    graphics.lineTo(22 * u, -2 * u);
    graphics.lineTo(28 * u, -34 * u);
    graphics.lineTo(12 * u, -29 * u);
    graphics.lineTo(0, -15 * u);
    graphics.lineTo(-13 * u, -29 * u);
    graphics.close();
    graphics.fill();
    // 甲壳躯干
    graphics.fillColor = shellColor;
    graphics.moveTo(-22 * u, 0);
    graphics.lineTo(-28 * u, 28 * u);
    graphics.lineTo(-13 * u, 43 * u);
    graphics.lineTo(12 * u, 43 * u);
    graphics.lineTo(30 * u, 28 * u);
    graphics.lineTo(20 * u, 0);
    graphics.close();
    graphics.fill();
    // 肩甲和脊刺让 fallback 读成怪物体块，而不是临时人形剪影。
    graphics.fillColor = unit.role === 'boss' ? rgba(172, 46, 48, 218) : rgba(112, 46, 50, 202);
    graphics.moveTo(-27 * u, 29 * u);
    graphics.lineTo(-45 * u, 38 * u);
    graphics.lineTo(-31 * u, 15 * u);
    graphics.close();
    graphics.fill();
    graphics.moveTo(29 * u, 29 * u);
    graphics.lineTo(47 * u, 39 * u);
    graphics.lineTo(32 * u, 15 * u);
    graphics.close();
    graphics.fill();
    graphics.fillColor = active ? rgba(255, 108, 76, 170) : rgba(145, 48, 46, 128);
    for (let spike = -1; spike <= 1; spike += 1) {
      const spikeX = spike * 10 * u;
      const spikeBaseY = 35 * u - Math.abs(spike) * 4 * u;
      graphics.moveTo(spikeX - 4 * u, spikeBaseY);
      graphics.lineTo(spikeX, spikeBaseY + 18 * u);
      graphics.lineTo(spikeX + 4 * u, spikeBaseY);
      graphics.close();
    }
    graphics.fill();
    graphics.strokeColor = rgba(14, 7, 9, 108);
    graphics.lineWidth = Math.max(1, 1.2 * u);
    for (let rib = 0; rib < 3; rib += 1) {
      const ribY = 8 * u + rib * 8 * u;
      graphics.moveTo(-13 * u, ribY);
      graphics.bezierCurveTo(-5 * u, ribY - 3 * u, 5 * u, ribY - 3 * u, 14 * u, ribY);
    }
    graphics.stroke();
    // 头部与角
    graphics.fillColor = bodyColor;
    graphics.circle(0, 51 * u, unit.role === 'boss' ? 13 * u : 10 * u);
    graphics.fill();
    graphics.fillColor = edgeColor;
    graphics.moveTo(-9 * u, 57 * u);
    graphics.lineTo(-22 * u, 73 * u);
    graphics.lineTo(-15 * u, 51 * u);
    graphics.close();
    graphics.fill();
    graphics.moveTo(9 * u, 57 * u);
    graphics.lineTo(24 * u, 73 * u);
    graphics.lineTo(15 * u, 51 * u);
    graphics.close();
    graphics.fill();
    // 双爪
    graphics.strokeColor = edgeColor;
    graphics.lineWidth = Math.max(2, 5.5 * u);
    graphics.moveTo(-24 * u, 27 * u);
    graphics.lineTo(-42 * u, 2 * u);
    graphics.stroke();
    graphics.moveTo(26 * u, 26 * u);
    graphics.lineTo(44 * u, 4 * u);
    graphics.stroke();
    graphics.strokeColor = active ? rgba(255, 156, 96, 220) : rgba(180, 86, 72, 148);
    graphics.lineWidth = Math.max(1.5, 2 * u);
    graphics.moveTo(-42 * u, 2 * u);
    graphics.lineTo(-52 * u, -8 * u);
    graphics.moveTo(44 * u, 4 * u);
    graphics.lineTo(54 * u, -4 * u);
    graphics.stroke();
    // 发光的眼睛
    graphics.fillColor = active ? rgba(255, 78, 62, 255) : rgba(218, 62, 60, 232);
    graphics.circle(-4.5 * u, 52 * u, 2.6 * u);
    graphics.fill();
    graphics.circle(4.5 * u, 52 * u, 2.6 * u);
    graphics.fill();
    if (active) {
      graphics.strokeColor = rgba(255, 104, 78, 138);
      graphics.lineWidth = Math.max(1, 1.2 * u);
      graphics.circle(0, 36 * u, 38 * u);
      graphics.stroke();
    }
    const label = this.host.addChildLabel(node, 'LobbyBattleStage12EnemyPlaceholderRole', unit.displayName || (unit.role === 'boss' ? '首领' : '敌人'), 0, -52 * scale * unitScale, 11 * scale, rgba(255, 190, 156), new Size(width * 0.78, 14 * scale));
    label.overflow = Label.Overflow.SHRINK;
    if (active) {
      tween(node)
        .repeatForever(tween().to(0.34, { scale: new Vec3(1.06, 1.06, 1) }).to(0.36, { scale: Vec3.ONE }).delay(0.42))
        .start();
    }
  }

  // 进战前预热单位骨骼资源:阵容本地已知时(打开战斗面板瞬间)提前加载,
  // 与 roster 拉取/开战请求的网络往返并行,压缩进场"单位迟到"空窗。
  // 走同一份 battleSpineData 缓存/去重管线,重复调用零成本。
  prefetchBattleUnitSpineAssets(units: Array<Pick<BattlePresentationUnitSnapshot, 'side' | 'portraitAsset' | 'spineAsset' | 'spineUuid'>>): void {
    units.forEach((unitLike) => {
      const unit = unitLike as BattlePresentationUnitSnapshot;
      const resourcePath = resolveBattleUnitSpineResource(unit);
      if (!resourcePath) {
        return;
      }
      this.loadBattleUnitSpineData(resourcePath, resolveBattleUnitSpineLoadUuid(unit), () => {});
    });
  }

  // 进战资产加载门实现:并行加载本场全部单位骨骼(顺带完成 4.2 wasm 解析预热)与敌怪立绘,
  // 全部落定或超时后 resolve;LobbyBattleFlow 在启动演出计时前 await 本方法。
  preloadBattleSessionAssets(
    units: Array<Pick<BattlePresentationUnitSnapshot, 'side' | 'portraitAsset' | 'spineAsset' | 'spineUuid' | 'monsterSkinAsset'>>,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<void> {
    const seen = new Set<string>();
    const runs: Array<(done: () => void) => void> = [];
    const track = (key: string, run: (done: () => void) => void): void => {
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      runs.push(run);
    };
    units.forEach((unitLike) => {
      const unit = unitLike as BattlePresentationUnitSnapshot;
      const resourcePath = resolveBattleUnitSpineResource(unit);
      if (resourcePath) {
        const uuid = resolveBattleUnitSpineLoadUuid(unit);
        track(`spine:${uuid || ''}:${resourcePath}`, (done) => {
          this.loadBattleUnitSpineData(resourcePath, uuid, (data) => {
            if (data) {
              // 加载屏内顺带完成 wasm 解析,进场应用骨骼时零解析尖峰。
              try {
                resolveBattleUnitSpineRuntimeData(data);
              } catch {
                // 解析失败由进场 apply 流程按占位回退兜底。
              }
            }
            done();
          });
        });
      }
      const skinAsset = (unit.monsterSkinAsset || '').trim();
      if (skinAsset) {
        track(`sprite:${skinAsset}`, (done) => {
          resources.load(`${skinAsset}/spriteFrame`, SpriteFrame, () => done());
        });
      }
    });
    const total = runs.length;
    if (total === 0) {
      onProgress(0, 0);
      return Promise.resolve();
    }
    let loaded = 0;
    onProgress(0, total);
    const tasks = runs.map((run) => new Promise<void>((resolve) => {
      let settled = false;
      run(() => {
        if (settled) {
          return;
        }
        settled = true;
        loaded += 1;
        onProgress(loaded, total);
        resolve();
      });
    }));
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, BATTLE_ASSET_PRELOAD_TIMEOUT_MS);
    });
    return Promise.race([Promise.all(tasks).then(() => undefined), timeout]);
  }

  // 进战加载界面:战场背景之上盖暗幕+关卡名+进度条+提示,参考市面进战转场;
  // 进度 tick 由 render() 的就地更新分支消化,不整场重建。
  private renderBattleAssetLoadingScreen(parent: Node, width: number, height: number, scale: number, state: LobbyBattlePanelState): void {
    const overlay = this.host.addChildPlainNode(parent, 'LobbyBattleAssetLoadingScreen', 0, 0, width, height);
    const veil = overlay.addComponent(Graphics);
    veil.fillColor = rgba(8, 6, 10, 172);
    veil.rect(-width / 2, -height / 2, width, height);
    veil.fill();
    const stageName = formatBattleStageDisplayName(state.stageCode) || '战斗';
    const title = this.host.addChildLabel(overlay, 'LobbyBattleAssetLoadingTitle', stageName, 0, height * 0.11, 34 * scale, rgba(244, 226, 186), new Size(width * 0.8, 48 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const subtitle = this.host.addChildLabel(overlay, 'LobbyBattleAssetLoadingSubtitle', '战场部署中…', 0, height * 0.11 - 42 * scale, 16 * scale, rgba(214, 198, 170), new Size(width * 0.6, 22 * scale));
    this.applyOutline(subtitle, scale, false);
    const barWidth = Math.min(460 * scale, width * 0.56);
    const barHeight = 12 * scale;
    const barY = -height * 0.05;
    const barNode = this.host.addChildPlainNode(overlay, 'LobbyBattleAssetLoadingBar', 0, barY, barWidth, barHeight);
    const barBackground = barNode.addComponent(Graphics);
    barBackground.fillColor = rgba(0, 0, 0, 158);
    barBackground.roundRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, barHeight / 2);
    barBackground.fill();
    barBackground.strokeColor = rgba(214, 178, 110, 196);
    barBackground.lineWidth = Math.max(1, 1.4 * scale);
    barBackground.roundRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, barHeight / 2);
    barBackground.stroke();
    const fillNode = this.host.addChildPlainNode(barNode, 'LobbyBattleAssetLoadingBarFill', 0, 0, barWidth, barHeight);
    fillNode.addComponent(Graphics);
    const percentLabel = this.host.addChildLabel(overlay, 'LobbyBattleAssetLoadingPercent', '0%', 0, barY - 26 * scale, 14 * scale, rgba(230, 214, 182), new Size(width * 0.4, 20 * scale));
    const tipIndex = Math.abs([...(state.stageCode || 'battle')].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) | 0, 7)) % BATTLE_ASSET_LOADING_TIPS.length;
    this.host.addChildLabel(overlay, 'LobbyBattleAssetLoadingTip', BATTLE_ASSET_LOADING_TIPS[tipIndex], 0, barY - 58 * scale, 13 * scale, rgba(176, 164, 148), new Size(width * 0.76, 18 * scale));
    this.battleLoadingFillNode = fillNode;
    this.battleLoadingPercentLabel = percentLabel;
    this.battleLoadingBarWidth = barWidth;
    this.battleLoadingBarHeight = barHeight;
    this.updateBattleAssetLoadingProgress(state);
  }

  private updateBattleAssetLoadingProgress(state: LobbyBattlePanelState): void {
    const fillNode = this.battleLoadingFillNode;
    const percentLabel = this.battleLoadingPercentLabel;
    if (!this.isNodeAlive(fillNode) || !percentLabel || !this.isNodeAlive(percentLabel.node)) {
      return;
    }
    const graphics = fillNode.getComponent(Graphics);
    if (!graphics) {
      return;
    }
    const total = Math.max(1, state.assetsTotalCount);
    const ratio = Math.max(0, Math.min(1, state.assetsLoadedCount / total));
    const barWidth = this.battleLoadingBarWidth;
    const barHeight = this.battleLoadingBarHeight;
    const inset = Math.max(1, barHeight * 0.2);
    const fillHeight = barHeight - inset * 2;
    const fillWidth = (barWidth - inset * 2) * ratio;
    graphics.clear();
    if (fillWidth > fillHeight) {
      graphics.fillColor = rgba(226, 176, 92, 235);
      graphics.roundRect(-barWidth / 2 + inset, -fillHeight / 2, fillWidth, fillHeight, fillHeight / 2);
      graphics.fill();
    }
    percentLabel.string = `${Math.round(ratio * 100)}%`;
  }

  private loadBattleUnitSpineData(resourcePath: string, uuid: string | null, onLoaded: (data: sp.SkeletonData | null) => void): void {
    // 2026-08-04 复用重构:改走全局 SpineDataStore,与编队/详情/大厅共享缓存,预热全局生效。
    loadSharedSpineData(resourcePath, uuid, 'BattleStage4', onLoaded);
  }

  private applyBattleUnitSpineData(
    spineNode: Node,
    skeleton: sp.Skeleton,
    data: sp.SkeletonData,
    width: number,
    height: number,
    scale: number,
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    active: boolean,
    actionAnimationName: string | null,
  ): boolean {
    try {
      const runtimeData = resolveBattleUnitSpineRuntimeData(data);
      if (!runtimeData) {
        console.warn(`[BattleStage4] battle spine runtime data missing: ${unit.unitKey}`);
        return false;
      }
      // 空骨架(如数据版本与打包的 spine 运行时不匹配,4.2 数据跑 3.8 wasm 解析为 0 动画)按失败处理,
      // 保留立绘回退——否则"成功"回调销毁 fallback 后单位直接隐形。
      if ((runtimeData.animations ?? []).length === 0) {
        console.warn(`[BattleStage4] battle spine parsed empty (runtime/version mismatch?): ${unit.unitKey}`);
        return false;
      }
      patchBattleUnitSpineRuntimeEnums(data, runtimeData);
      skeleton.skeletonData = data;
      const skinName = resolveBattleUnitSpineSkinName(data, runtimeData);
      if (skinName && skinName !== 'default') {
        skeleton.setSkin(skinName);
        skeleton.setSlotsToSetupPose();
      }
      // Stage 13D：传入 unit 以按稀有度选择严格动画名映射（SSR/UR/SR/R/ENEMY/BOSS）。
      const animationNames = resolveBattleUnitSpineAnimationNames(data, unit);
      const animationName = this.resolveBattleUnitSpineCueAnimation(animationNames, actionAnimationName);
      const spineScale = resolveBattleUnitSpineScale(runtimeData.width, runtimeData.height, width, height, scale, unit.role === 'boss', unit);
      this.recordBattleActorSpineVisualTelemetry(unit, enemy, runtimeData.width, runtimeData.height, width, height, spineScale);
      const nodePosition = resolveBattleUnitSpineNodePosition(runtimeData, spineScale, height, unit, enemy);
      if (enemy) {
        // P8c 排障:敌怪 spine 视觉与血条/脚圈错位的定位数据(问题定位后移除)。
        console.log(`[MonsterSpine] ${unit.unitKey} rd=(${runtimeData.x},${runtimeData.y},${runtimeData.width}x${runtimeData.height}) scale=${spineScale.toFixed(3)} node=(${nodePosition.x.toFixed(1)},${nodePosition.y.toFixed(1)}) slot=${width.toFixed(0)}x${height.toFixed(0)}`);
      }
      spineNode.setPosition(new Vec3(nodePosition.x, nodePosition.y, 0));
      spineNode.setScale(new Vec3(resolveBattleUnitSpineMirrorScaleX(spineScale, enemy), spineScale, 1));
      if (!animationName) {
        skeleton.setToSetupPose();
        return true;
      }
      const loopAnimation = animationName === animationNames.idle || actionAnimationName === 'run' || actionAnimationName === 'move' || actionAnimationName === 'walk';
      const track = skeleton.setAnimation(0, animationName, loopAnimation);
      if (!track) {
        console.warn(`[BattleStage4] battle spine animation failed: ${unit.unitKey}/${animationName}`);
        return false;
      }
      if (!loopAnimation && animationNames.idle) {
        skeleton.addAnimation(0, animationNames.idle, true, 0);
      }
      this.recordBattleActorSpineCueTelemetry(unit, actionAnimationName, animationName);
      return true;
    } catch (error) {
      console.warn(`[BattleStage4] battle spine apply failed: ${unit.unitKey}`, error);
      return false;
    }
  }

  private resolveBattleUnitSpineCueAnimation(animationNames: BattleUnitSpineAnimationNames, actionAnimationName: string | null): string | null {
    const cue = (actionAnimationName || '').trim().toLowerCase();
    if (!cue) {
      return animationNames.idle;
    }
    if (cue === 'move' || cue === 'run' || cue === 'walk') {
      return animationNames.move ?? animationNames.idle;
    }
    if (cue === 'idle' || cue === 'stand') {
      return animationNames.idle;
    }
    if (cue === 'hit' || cue === 'hurt' || cue === 'shouji') {
      return animationNames.hit ?? animationNames.idle;
    }
    if (cue === 'dead' || cue === 'death' || cue === 'die') {
      return animationNames.death ?? animationNames.idle;
    }
    if (cue === 'victory' || cue === 'win' || cue === 'win_1' || cue === 'win_2') {
      return animationNames.victory ?? animationNames.idle;
    }
    if (cue === 'ult' || cue === 'ultimate') {
      return animationNames.ult ?? animationNames.skill3 ?? animationNames.skill2 ?? animationNames.skill1 ?? animationNames.attack ?? animationNames.idle;
    }
    if (cue === 'skill3' || cue === 'skill_03' || cue === 'skill_3') {
      return animationNames.skill3 ?? animationNames.skill2 ?? animationNames.skill1 ?? animationNames.attack ?? animationNames.idle;
    }
    if (cue === 'skill2' || cue === 'skill_02' || cue === 'skill_2') {
      return animationNames.skill2 ?? animationNames.skill1 ?? animationNames.attack ?? animationNames.idle;
    }
    if (cue === 'skill1' || cue === 'skill_01' || cue === 'skill_1' || cue === 'cast') {
      return animationNames.skill1 ?? animationNames.skill ?? animationNames.attack ?? animationNames.idle;
    }
    if (cue === 'skill4' || cue === 'skill_04' || cue === 'skill_4') {
      return animationNames.ult ?? animationNames.skill3 ?? animationNames.skill2 ?? animationNames.skill1 ?? animationNames.attack ?? animationNames.idle;
    }
    if (cue === 'heal' || cue === 'shield' || cue === 'buff' || cue === 'debuff') {
      return animationNames.skill1 ?? animationNames.skill ?? animationNames.attack ?? animationNames.idle;
    }
    if (cue === 'attack_01' || cue === 'attack' || cue === 'atk' || cue === 'skill0' || cue === 'basic_attack') {
      return animationNames.attack ?? animationNames.skill ?? animationNames.idle;
    }
    return animationNames.attack ?? animationNames.skill ?? animationNames.idle;
  }

  private resolveBattleActorDeathAnimationName(unit: BattlePresentationUnitSnapshot): string {
    const rarity = (unit.rarity || unit.scaleProfile || '').toUpperCase();
    if (unit.side === 'enemy') {
      return 'dead';
    }
    return rarity === 'SR' || rarity === 'R' ? 'die' : 'dead';
  }

  // 动态血量：开战满血，damage_preview 命中帧扣血，buff_preview 数值治疗回补；只影响前端表现，不修改结算。
  private resolveBattleActorDisplayHp(
    unit: BattlePresentationUnitSnapshot,
    enemy: boolean,
    hpState: BattlePresentationHpState,
  ): number {
    const hpUnit = hpState.units.get(unit.unitKey);
    return hpUnit?.hpRatio ?? (enemy ? hpState.enemyTotalHpRatio : hpState.allyTotalHpRatio);
  }

  private renderHpBar(parent: Node, x: number, y: number, width: number, height: number, hp: number, scale: number, enemy: boolean, shieldFrac = 0, shieldTeam = false, ccKind: 'freeze' | 'stun' | null = null): void {
    const bar = this.host.addChildPlainNode(parent, 'LobbyBattleActorHpBar', x + width / 2, y + height / 2, width, height);
    // C1812 血条：九宫格底框 + 按血量裁宽的能量条；敌方染红、我方暗金。血量归零时不画填充，呈现"空血/倒下"。
    const ratio = clamp(hp, 0, 1);
    // AI 血条:框按素材原比例(512×76)整图显示——九宫格会把 76px 高的框压进十几像素,
    // 框身畸变成一条线;整图缩放保持刺饰形状完整。填充与空槽按素材中空区(17%~83%)定位。
    const frameHeight = width * (76 / 512);
    // 中空区按素材实测(13.7%~85.9%),满血填满框内不留空白。
    const inset = width * 0.14;
    const innerWidth = width - inset * 2;
    const innerHeight = Math.max(5 * scale, frameHeight * 0.42);
    const slotGraphics = bar.addComponent(Graphics);
    // 空血槽用近黑:浅红槽与剩余血量对比不清。
    slotGraphics.fillColor = rgba(8, 7, 7, 235);
    slotGraphics.roundRect(-innerWidth / 2, -innerHeight / 2, innerWidth, innerHeight, innerHeight * 0.4);
    slotGraphics.fill();
    if (ratio > 0.005) {
      const fillWidth = Math.max(4 * scale, innerWidth * ratio);
      const fill = this.host.addSprite('LobbyBattleActorHpBarFill', BATTLE_C1812_HP_BAR_FILL_ASSET, -innerWidth / 2 + fillWidth / 2, 0, fillWidth, innerHeight, bar);
      if (fill) {
        fill.type = Sprite.Type.SLICED;
      }
    }
    const frame = this.host.addSprite('LobbyBattleActorHpBarFrame', BATTLE_C1812_HP_BAR_FRAME_ASSET, 0, 0, width, frameHeight, bar);
    // 能量护盾:半透明淡色层「覆盖在血条上」(不是浮在上方),从左起宽度=当前护盾/最大血量,
    // alpha 压低透出下面的血色;全体盾偏蓝、单体盾偏青。作为最后一个子节点,盖在填充/框之上;
    // 护盾被打空(shieldFrac→0)时自然消失。
    if (shieldFrac > 0.004) {
      const shieldNode = this.host.addChildPlainNode(bar, 'LobbyBattleActorShieldBar', 0, 0, innerWidth, innerHeight);
      const shieldGraphics = shieldNode.addComponent(Graphics);
      const shieldWidth = Math.max(3 * scale, innerWidth * clamp(shieldFrac, 0, 1));
      shieldGraphics.fillColor = shieldTeam ? rgba(154, 208, 255, 104) : rgba(150, 245, 232, 104);
      shieldGraphics.roundRect(-innerWidth / 2, -innerHeight / 2, shieldWidth, innerHeight, innerHeight * 0.4);
      shieldGraphics.fill();
    }
    // 硬控持续图标:被冻结/眩晕期间在血条上方挂一个 CC 图标(冰蓝=冻结,晕黄=眩晕),直到解控。
    // 血条每帧重建,图标随 hpUnit.frozen 出现/消失;不做 tween(逐帧重建会导致抖动),静态呈现。
    if (ccKind) {
      const ccColor = ccKind === 'freeze' ? rgba(150, 224, 255) : rgba(255, 226, 120);
      const iconSize = Math.max(30 * scale, frameHeight * 1.25);
      // 明显挂在血条正上方(高于护盾/框),带一圈深色底衬 + 高亮描边,短暂被控也一眼可见。
      const iconNode = this.host.addChildPlainNode(bar, 'LobbyBattleActorCcIcon', 0, frameHeight * 0.5 + iconSize * 0.72, iconSize, iconSize);
      const backing = iconNode.addComponent(Graphics);
      backing.fillColor = rgba(12, 12, 16, 210);
      backing.circle(0, 0, iconSize * 0.56);
      backing.fill();
      backing.strokeColor = ccColor;
      backing.lineWidth = Math.max(1.5, 2 * scale);
      backing.stroke();
      const icon = this.host.addSprite('LobbyBattleActorCcIconSprite', BATTLE_C1812_BUFF_STUN_ASSET, 0, 0, iconSize * 0.86, iconSize * 0.86, iconNode);
      if (icon) {
        icon.color = ccColor;
      } else {
        const glyph = this.host.addChildLabel(iconNode, 'LobbyBattleActorCcIconGlyph', ccKind === 'freeze' ? '冻' : '晕', 0, 0, iconSize * 0.5, ccColor, new Size(iconSize, iconSize));
        glyph.overflow = Label.Overflow.SHRINK;
      }
    }
    if (frame) {
      return;
    }
    const graphics = bar.addComponent(Graphics);
    graphics.fillColor = rgba(10, 8, 8, 230);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    if (ratio > 0.005) {
      graphics.fillColor = enemy ? rgba(151, 34, 32, 230) : rgba(188, 140, 58, 230);
      graphics.rect(-width / 2, -height / 2, width * ratio, height);
      graphics.fill();
    }
    graphics.strokeColor = rgba(220, 180, 92, 120);
    graphics.lineWidth = Math.max(1, 0.8 * scale);
    graphics.stroke();
  }

  private renderAssistAuraLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    currentAssistCue: BattleAssistPresentationCue | null,
    anchors: Map<string, BattleActionAnchor>,
  ): void {
    if ((presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording') || !currentAssistCue) {
      return;
    }
    const source = anchors.get(currentAssistCue.sourceKey);
    const target = anchors.get(currentAssistCue.targetKey);
    if (!source || !target) {
      return;
    }
    const layer = this.host.addChildPlainNode(parent, 'LobbyBattleAssistAuraLayer', 0, 0, width, height);
    this.markBattleTransientEffectLayer(layer);
    const graphics = layer.addComponent(Graphics);
    const sourcePoint = this.resolveActionAnchorPoint(source, true, scale);
    const targetPoint = this.resolveActionAnchorPoint(target, false, scale);
    const targetColor = this.resolveAssistColor(currentAssistCue, false);
    const sourceColor = this.resolveAssistColor(currentAssistCue, true);

    graphics.strokeColor = rgba(118, 201, 255, 96);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(sourcePoint.x, sourcePoint.y);
    graphics.bezierCurveTo(
      (sourcePoint.x + targetPoint.x) / 2,
      Math.max(sourcePoint.y, targetPoint.y) + height * 0.12,
      (sourcePoint.x + targetPoint.x) / 2,
      Math.max(sourcePoint.y, targetPoint.y) + height * 0.12,
      targetPoint.x,
      targetPoint.y,
    );
    graphics.stroke();

    const ring = this.host.addChildPlainNode(
      layer,
      'LobbyBattleAssistSkillCastRing',
      currentAssistCue.kind === 'skill_cast' ? source.x : target.x,
      currentAssistCue.kind === 'skill_cast' ? source.y - source.height * 0.12 : target.y - target.height * 0.12,
      Math.min(122 * scale, target.width + 36 * scale),
      38 * scale,
    );
    const ringGraphics = ring.addComponent(Graphics);
    ringGraphics.fillColor = rgba(targetColor.r, targetColor.g, targetColor.b, 34);
    ringGraphics.ellipse(0, 0, Math.min(58 * scale, target.width * 0.56), 15 * scale);
    ringGraphics.fill();
    ringGraphics.strokeColor = targetColor;
    ringGraphics.lineWidth = Math.max(1, 1.6 * scale);
    ringGraphics.ellipse(0, 0, Math.min(62 * scale, target.width * 0.6), 18 * scale);
    ringGraphics.stroke();

    const iconAsset = this.resolveAssistIconAsset(snapshot, currentAssistCue);
    const icon = this.host.addSprite(
      'LobbyBattleAssistIconSprite',
      iconAsset,
      target.x + (target.enemy ? -target.width * 0.3 : target.width * 0.3),
      target.y + target.height * 0.42,
      26 * scale,
      26 * scale,
      layer,
    );
    if (!icon) {
      const iconFallback = this.host.addChildPlainNode(
        layer,
        'LobbyBattleAssistIconFallback',
        target.x + (target.enemy ? -target.width * 0.3 : target.width * 0.3),
        target.y + target.height * 0.42,
        26 * scale,
        26 * scale,
      );
      const iconGraphics = iconFallback.addComponent(Graphics);
      iconGraphics.fillColor = sourceColor;
      iconGraphics.circle(0, 0, 11 * scale);
      iconGraphics.fill();
      iconGraphics.strokeColor = rgba(255, 246, 202, 160);
      iconGraphics.circle(0, 0, 13 * scale);
      iconGraphics.stroke();
    } else {
      icon.color = sourceColor;
    }

    const opacity = layer.addComponent(UIOpacity);
    opacity.opacity = 214;
    tween(ring)
      .repeatForever(tween().to(0.38, { scale: new Vec3(1.08, 1.08, 1) }).to(0.38, { scale: Vec3.ONE }).delay(0.32))
      .start();
    tween(opacity)
      .repeatForever(tween().to(0.28, { opacity: 255 }).to(0.46, { opacity: 148 }).delay(0.28))
      .start();
  }

  private renderAssistFloatingTextLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    currentAssistCue: BattleAssistPresentationCue | null,
    assistCues: BattleAssistPresentationCue[],
    anchors: Map<string, BattleActionAnchor>,
  ): void {
    if ((presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded') || !currentAssistCue) {
      return;
    }
    void assistCues;
    if (currentAssistCue.kind === 'skill_cast') {
      return;
    }
    const layer = this.host.addChildPlainNode(parent, 'LobbyBattleAssistFloatingTextLayer', 0, 0, width, height);
    this.markBattleTransientEffectLayer(layer);
    (layer as Node & { __lootchainTransientCreatedAt?: number }).__lootchainTransientCreatedAt = Date.now() + BATTLE_ASSIST_FLOATING_TEXT_DELAY_MS;
    const activeAssistFloatCue = currentAssistCue;
    const anchor = anchors.get(activeAssistFloatCue.targetKey);
    if (!anchor) {
      return;
    }
    if (!this.shouldRenderBattleFloatingText(activeAssistFloatCue.targetKey, activeAssistFloatCue.cueKey, activeAssistFloatCue.timeMs)) {
      return;
    }
    this.recordBattleFloatingTextTelemetry('assist', activeAssistFloatCue.cueKey, {
      visualDelayMs: BATTLE_ASSIST_FLOATING_TEXT_DELAY_MS,
    });
    const laneOffset = this.resolveBattleFloatingTextLaneOffset(activeAssistFloatCue.cueKey, scale);
    // 辅助飘字(+ATK/护盾等)同样 clamp 在战场内,禁止漂进顶部 HUD。
    const labelX = clamp(
      anchor.x + (anchor.enemy ? -anchor.width * 0.1 : anchor.width * 0.12) + laneOffset.x,
      -width / 2 + 90 * scale,
      width / 2 - 90 * scale,
    );
    const labelY = clamp(
      anchor.y + anchor.height * 0.58 + height * 0.02 + laneOffset.y,
      -height / 2 + 30 * scale,
      height / 2 - 64 * scale,
    );
    const color = this.resolveAssistColor(activeAssistFloatCue, true);
    const textName = this.resolveAssistFloatTextName(activeAssistFloatCue);
    const floatText = this.host.addChildLabel(
      layer,
      textName,
      activeAssistFloatCue.displayValue,
      labelX,
      labelY, 20 * scale,
      color,
      new Size(Math.min(150 * scale, width * 0.25), 30 * scale),
    );
    floatText.overflow = Label.Overflow.SHRINK;
    this.applyOutline(floatText, scale, true);
    const opacity = layer.addComponent(UIOpacity);
    opacity.opacity = 0;
    tween(layer)
      .delay(BATTLE_ASSIST_FLOATING_TEXT_DELAY_MS / 1000)
      .to(0.38, { position: new Vec3(0, 18 * scale, 0) })
      .to(0.26, { position: new Vec3(0, 26 * scale, 0) })
      .start();
    tween(opacity)
      .delay(BATTLE_ASSIST_FLOATING_TEXT_DELAY_MS / 1000)
      .to(0.18, { opacity: 255 })
      .to(0.46, { opacity: 0 })
      .start();
  }

  private resolveAssistIconAsset(snapshot: BattlePresentationSnapshot, currentAssistCue: BattleAssistPresentationCue): string {
    if (currentAssistCue.kind === 'shield_float') {
      return snapshot.stage2UiAssets.buffShield;
    }
    if (currentAssistCue.kind === 'debuff_float') {
      return snapshot.stage2UiAssets.buffDefenseDown;
    }
    return snapshot.stage2UiAssets.buffAttackUp;
  }

  private resolveAssistFloatTextName(currentAssistCue: BattleAssistPresentationCue): string {
    if (currentAssistCue.kind === 'heal_float') {
      return 'LobbyBattleAssistHealFloatText';
    }
    if (currentAssistCue.kind === 'shield_float') {
      return 'LobbyBattleAssistShieldFloatText';
    }
    if (currentAssistCue.kind === 'buff_float') {
      return 'LobbyBattleAssistBuffFloatText';
    }
    return 'LobbyBattleAssistDebuffFloatText';
  }

  private resolveAssistColor(currentAssistCue: BattleAssistPresentationCue, bright: boolean): Color {
    if (currentAssistCue.kind === 'heal_float') {
      return bright ? rgba(118, 255, 173) : rgba(78, 210, 138, 190);
    }
    if (currentAssistCue.kind === 'shield_float') {
      return bright ? rgba(155, 220, 255) : rgba(72, 158, 236, 190);
    }
    if (currentAssistCue.kind === 'debuff_float') {
      return bright ? rgba(255, 118, 145) : rgba(206, 52, 82, 190);
    }
    if (currentAssistCue.kind === 'skill_cast') {
      return bright ? rgba(255, 239, 155) : rgba(243, 196, 84, 190);
    }
    return bright ? rgba(255, 226, 115) : rgba(214, 162, 62, 190);
  }

  private renderActionProjectileLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    currentActionCue: BattleActionPresentationCue | null,
    anchors: Map<string, BattleActionAnchor>,
  ): void {
    if ((presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording') || currentActionCue?.kind !== 'ranged_projectile') {
      return;
    }
    const source = anchors.get(currentActionCue.actorKey);
    const target = anchors.get(currentActionCue.targetKey);
    if (!source || !target) {
      return;
    }
    const layer = this.host.addChildPlainNode(parent, 'LobbyBattleActionProjectileLayer', 0, 0, width, height);
    this.markBattleTransientEffectLayer(layer);
    const graphics = layer.addComponent(Graphics);
    const start = this.resolveActionAnchorPoint(source, true, scale);
    const end = this.resolveActionAnchorPoint(target, false, scale);
    const controlY = Math.max(start.y, end.y) + height * Math.max(0.08, currentActionCue.arcRatio * 0.24);
    graphics.strokeColor = currentActionCue.actorSide === 'ally' ? rgba(255, 199, 95, 210) : rgba(238, 78, 70, 200);
    graphics.lineWidth = Math.max(2, 2.2 * scale);
    graphics.moveTo(start.x, start.y);
    graphics.bezierCurveTo((start.x + end.x) / 2, controlY, (start.x + end.x) / 2, controlY, end.x, end.y);
    graphics.stroke();
    graphics.strokeColor = rgba(255, 244, 193, 136);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.moveTo(start.x, start.y + 3 * scale);
    graphics.bezierCurveTo((start.x + end.x) / 2, controlY + 8 * scale, (start.x + end.x) / 2, controlY + 8 * scale, end.x, end.y + 3 * scale);
    graphics.stroke();

    // 光球从施法者真实飞向目标(经弧线中点),命中时放大爆散,让远程/法师的输出因果清晰可读。
    const orb = this.host.addChildPlainNode(layer, 'LobbyBattleActionProjectileOrb', start.x, start.y, 22 * scale, 22 * scale);
    const orbGraphics = orb.addComponent(Graphics);
    orbGraphics.fillColor = currentActionCue.actorSide === 'ally' ? rgba(255, 221, 128, 232) : rgba(255, 96, 84, 228);
    orbGraphics.circle(0, 0, 8 * scale);
    orbGraphics.fill();
    orbGraphics.strokeColor = rgba(255, 247, 202, 168);
    orbGraphics.circle(0, 0, 11 * scale);
    orbGraphics.stroke();
    const opacity = orb.addComponent(UIOpacity);
    opacity.opacity = 235;
    const midX = (start.x + end.x) / 2;
    const midY = controlY;
    tween(orb)
      .to(0.3, { position: new Vec3(midX, midY, 0) })
      .to(0.28, { position: new Vec3(end.x, end.y, 0) })
      .to(0.1, { scale: new Vec3(1.9, 1.9, 1) })
      .call(() => {
        if (this.isNodeAlive(orb)) {
          orb.destroy();
        }
      })
      .start();
  }

  private renderActionTargetSpineEffectLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    currentActionCue: BattleActionPresentationCue | null,
    anchors: Map<string, BattleActionAnchor>,
  ): void {
    if ((presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording') || !currentActionCue) {
      return;
    }
    if (currentActionCue.kind !== 'ranged_projectile' && currentActionCue.kind !== 'basic_attack') {
      return;
    }
    const actor = this.resolveBattleSnapshotUnit(snapshot, currentActionCue.actorKey);
    const target = anchors.get(currentActionCue.targetKey);
    if (!actor || !target) {
      return;
    }
    const resourcePath = resolveBattleUnitSpineResource(actor);
    if (!resourcePath) {
      return;
    }
    const effectCue = currentActionCue.animationName || (currentActionCue.actorRole === 'back' ? 'skill_01' : '');
    const renderGeneration = this.battleRenderGeneration;
    const layer = this.host.addChildPlainNode(parent, 'LobbyBattleActionTargetSpineEffectLayer', 0, 0, width, height);
    this.markBattleTransientEffectLayer(layer);
    const effectPoint = this.resolveActionAnchorPoint(target, false, scale);
    const effectX = effectPoint.x + (target.enemy ? -target.width * 0.08 : target.width * 0.08);
    const effectY = effectPoint.y + target.height * 0.02;
    const effectWidth = Math.min(target.width * 1.18, 240 * scale);
    const effectHeight = Math.min(target.height * 1.02, 260 * scale);
    const effectNode = this.host.addChildPlainNode(layer, 'LobbyBattleActionTargetSpineEffectNode', effectX, effectY, effectWidth, effectHeight);
    const skeleton = effectNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    skeleton.timeScale = 1.04;
    this.renderActionTargetEffectFallback(layer, effectX, effectY - target.height * 0.08, effectWidth, Math.max(28 * scale, effectHeight * 0.22), scale, currentActionCue.actorSide === 'ally');
    this.loadBattleUnitSpineData(resourcePath, null, (data) => {
      if (!this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isNodeAlive(layer) || !this.isNodeAlive(effectNode)) {
        return;
      }
      if (data && this.applyBattleUnitTargetSpineEffectData(effectNode, skeleton, data, actor, effectCue, effectWidth, effectHeight, scale)) {
        return;
      }
      const spineUuid = resolveBattleUnitSpineLoadUuid(actor);
      if (!spineUuid) {
        effectNode.destroy();
        return;
      }
      this.loadBattleUnitSpineData(resourcePath, spineUuid, (resourceData) => {
        if (!this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isNodeAlive(layer) || !this.isNodeAlive(effectNode)) {
          return;
        }
        if (!resourceData || !this.applyBattleUnitTargetSpineEffectData(effectNode, skeleton, resourceData, actor, effectCue, effectWidth, effectHeight, scale)) {
          effectNode.destroy();
        }
      });
    });
  }

  private applyBattleUnitTargetSpineEffectData(
    spineNode: Node,
    skeleton: sp.Skeleton,
    data: sp.SkeletonData,
    unit: BattlePresentationUnitSnapshot,
    effectCue: string,
    width: number,
    height: number,
    scale: number,
  ): boolean {
    try {
      const runtimeData = resolveBattleUnitSpineRuntimeData(data);
      if (!runtimeData) {
        return false;
      }
      patchBattleUnitSpineRuntimeEnums(data, runtimeData);
      const animationNames = resolveBattleUnitSpineAnimationNames(data, unit);
      const animationName = this.resolveBattleUnitTargetSpineEffectAnimation(animationNames, effectCue);
      if (!animationName) {
        return false;
      }
      skeleton.skeletonData = data;
      const skinName = resolveBattleUnitSpineSkinName(data, runtimeData);
      if (skinName && skinName !== 'default') {
        skeleton.setSkin(skinName);
        skeleton.setSlotsToSetupPose();
      }
      const baseScale = resolveBattleUnitSpineScale(runtimeData.width, runtimeData.height, width, height, scale, false, unit);
      const effectScale = Math.min(baseScale * 0.92, Math.max(0.18, scale * 0.72));
      spineNode.setScale(new Vec3(effectScale, effectScale, 1));
      const track = skeleton.setAnimation(0, animationName, false);
      if (!track) {
        return false;
      }
      return true;
    } catch (error) {
      console.warn(`[BattleStage4] battle target spine effect failed: ${unit.unitKey}`, error);
      return false;
    }
  }

  private resolveBattleUnitTargetSpineEffectAnimation(animationNames: BattleUnitSpineAnimationNames, effectCue: string): string | null {
    const cue = effectCue.trim().toLowerCase();
    if (cue === 'skill4' || cue === 'skill_04' || cue === 'skill_4' || cue === 'ult' || cue === 'ultimate') {
      return animationNames.skill4Kz ?? animationNames.skill3Kz ?? animationNames.skill2Kz ?? animationNames.skill1Kz;
    }
    if (cue === 'skill3' || cue === 'skill_03' || cue === 'skill_3') {
      return animationNames.skill3Kz ?? animationNames.skill2Kz ?? animationNames.skill1Kz;
    }
    if (cue === 'skill2' || cue === 'skill_02' || cue === 'skill_2') {
      return animationNames.skill2Kz ?? animationNames.skill1Kz;
    }
    if (cue === 'skill1' || cue === 'skill_01' || cue === 'skill_1' || cue === 'cast') {
      return animationNames.skill1Kz ?? animationNames.skill2Kz ?? animationNames.skill3Kz;
    }
    return null;
  }

  private renderActionTargetEffectFallback(parent: Node, x: number, y: number, width: number, height: number, scale: number, allyCaster: boolean): void {
    const effect = this.host.addChildPlainNode(parent, 'LobbyBattleActionTargetSlashFallback', x, y, width, height);
    // 优先 AI 斩弧特效图(保持 1.5:1 原比例);素材缺失再退回手绘双斜线。
    const slashArtWidth = Math.min(width * 0.62, 86 * scale);
    const slashArt = this.host.addSprite('LobbyBattleActionTargetSlashArt', BATTLE_C1812_HIT_SLASH_ASSET, 0, 0, slashArtWidth, slashArtWidth * (341 / 512), effect);
    if (slashArt) {
      slashArt.node.angle = allyCaster ? -14 : 14;
      if (!allyCaster) {
        slashArt.node.setScale(-1, 1, 1);
      }
    } else {
      const graphics = effect.addComponent(Graphics);
      const slashWidth = Math.min(width * 0.3, 46 * scale);
      const slashHeight = Math.min(height * 0.35, 18 * scale);
      graphics.strokeColor = allyCaster ? rgba(255, 218, 124, 176) : rgba(255, 110, 90, 166);
      graphics.lineWidth = Math.max(1.2, 1.8 * scale);
      graphics.moveTo(-slashWidth * 0.62, slashHeight * 0.32);
      graphics.lineTo(slashWidth * 0.48, -slashHeight * 0.18);
      graphics.moveTo(-slashWidth * 0.2, -slashHeight * 0.42);
      graphics.lineTo(slashWidth * 0.62, slashHeight * 0.2);
      graphics.stroke();
    }
    const opacity = effect.addComponent(UIOpacity);
    opacity.opacity = 190;
    tween(effect)
      .to(0.16, { scale: new Vec3(1.08, 1.08, 1) })
      .to(0.22, { scale: Vec3.ONE })
      .start();
    tween(opacity)
      .to(0.18, { opacity: 238 })
      .to(0.3, { opacity: 120 })
      .start();
  }

  private renderActionFloatingTextLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    currentActionCue: BattleActionPresentationCue | null,
    anchors: Map<string, BattleActionAnchor>,
    frameAnchors: Map<string, BattleActionAnchor>,
    hpState: BattlePresentationHpState,
  ): void {
    if ((presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded')
      || !currentActionCue
      || currentActionCue.kind !== 'damage_float') {
      return;
    }
    const hpUnit = hpState.units.get(currentActionCue.targetKey);
    const currentCueKilledTarget = hpUnit?.lastDamageHitKey === currentActionCue.hitKey
      || hpUnit?.lastDamageEventSeq === currentActionCue.eventSeq;
    const currentCueIsDeathWindow = hpUnit?.deadAtMs !== null
      && Math.abs(currentActionCue.timeMs - (hpUnit?.deadAtMs ?? currentActionCue.timeMs)) <= 420
      && currentActionCue.targetKey === hpUnit?.unitKey;
    if (hpUnit?.dead === true && !currentCueKilledTarget && !currentCueIsDeathWindow && !hpState.appliedEventSeqs.has(currentActionCue.eventSeq)) {
      return;
    }
    const impactProfile = resolveBattleImpactProfile(currentActionCue, scale);
    if (!this.shouldRenderBattleFloatingText(currentActionCue.targetKey, currentActionCue.cueKey, currentActionCue.timeMs)) {
      return;
    }
    this.recordBattleFloatingTextTelemetry('action', currentActionCue.cueKey, {
      cueTimeMs: currentActionCue.timeMs,
      hitKey: currentActionCue.hitKey,
      eventSeq: currentActionCue.eventSeq,
      critical: impactProfile?.isCritical,
      fontSize: impactProfile?.floatingText.fontSize,
      damageFloat: true,
    });
    const anchorKey = currentActionCue.targetKey;
    const hitAnchor = frameAnchors.get(anchorKey) ?? anchors.get(anchorKey);
    const anchor = hitAnchor;
    if (!anchor) {
      return;
    }
    const duelFrame = currentActionCue.actorRole !== 'back'
      ? this.resolveActorMeleeDuelFrame(currentActionCue, frameAnchors.size > 0 ? frameAnchors : anchors, scale)
      : null;
    if (impactProfile) {
      this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'floatingText');
    }
    const layer = this.host.addChildPlainNode(parent, 'LobbyBattleActionFloatingTextLayer', 0, 0, width, height);
    this.markBattleTransientEffectLayer(layer);
    const laneOffset = this.resolveBattleFloatingTextLaneOffset(currentActionCue.cueKey, scale);
    // 飘字必须留在战场矩形内:预留上漂 riseY 余量,禁止漂进顶部 HUD/关卡标题区。
    const labelX = clamp(
      (duelFrame?.hitPoint.x ?? (anchor.x + (anchor.enemy ? -anchor.width * 0.08 : anchor.width * 0.12))) + laneOffset.x,
      -width / 2 + 90 * scale,
      width / 2 - 90 * scale,
    );
    const labelY = clamp(
      (duelFrame?.hitPoint.y ?? (anchor.y + anchor.height * 0.52 + height * 0.018)) + laneOffset.y,
      -height / 2 + 30 * scale,
      height / 2 - 64 * scale,
    );
    const isDamage = currentActionCue.kind === 'damage_float';
    const textName = impactProfile?.isCritical
      ? 'LobbyBattleActionCriticalDamageFloatText'
      : isDamage ? 'LobbyBattleActionDamageFloatText' : 'LobbyBattleActionHitFloatText';
    const textValue = currentActionCue.displayValue || (isDamage ? '-0' : '受击');
    const floatText = this.host.addChildLabel(
      layer,
      textName,
      textValue,
      labelX,
      labelY,
      impactProfile?.floatingText.fontSize ?? (isDamage ? 21 * scale : 16 * scale),
      impactProfile ? this.battleImpactColor(impactProfile.floatingText.color) : isDamage ? rgba(255, 219, 111) : rgba(220, 235, 255),
      new Size(Math.min(impactProfile?.floatingText.width ?? 160 * scale, width * 0.34), impactProfile?.floatingText.height ?? 34 * scale),
    );
    floatText.overflow = Label.Overflow.SHRINK;
    this.applyOutline(floatText, scale, true);
    const opacity = layer.addComponent(UIOpacity);
    opacity.opacity = 222;
    if (impactProfile?.floatingText.emphasize) {
      floatText.node.setScale(0.82, 0.82, 1);
      tween(floatText.node)
        .to(0.08, { scale: new Vec3(impactProfile.floatingText.popScale, impactProfile.floatingText.popScale, 1) })
        .to(0.16, { scale: Vec3.ONE })
        .start();
    }
    tween(layer)
      .to(0.34, { position: new Vec3(0, impactProfile?.floatingText.riseY ?? 20 * scale, 0) })
      .to(0.28, { position: new Vec3(0, (impactProfile?.floatingText.riseY ?? 30 * scale) + 10 * scale, 0) })
      .start();
    tween(opacity)
      .to(0.18, { opacity: 255 })
      .to(0.44, { opacity: 0 })
      .start();

    // 吸血/反弹:在攻击者身上另飘一条(绿=吸血回血 / 红=反弹反伤),让概率触发的高稀有技能一眼可见。
    const actorHeal = currentActionCue.lifestealHeal ?? 0;
    const actorReflect = currentActionCue.reflectDamage ?? 0;
    if (actorHeal > 0 || actorReflect > 0) {
      const actorAnchor = frameAnchors.get(currentActionCue.actorKey) ?? anchors.get(currentActionCue.actorKey);
      if (actorAnchor) {
        const sideText = actorHeal > 0 ? `吸血 +${actorHeal}` : `反弹 -${actorReflect}`;
        const sideColor = actorHeal > 0 ? rgba(120, 235, 140) : rgba(255, 120, 96);
        const sideX = clamp(actorAnchor.x + (actorAnchor.enemy ? -actorAnchor.width * 0.1 : actorAnchor.width * 0.1), -width / 2 + 90 * scale, width / 2 - 90 * scale);
        const sideY = clamp(actorAnchor.y + actorAnchor.height * 0.6, -height / 2 + 30 * scale, height / 2 - 64 * scale);
        const sideLayer = this.host.addChildPlainNode(parent, 'LobbyBattleActionFloatingTextLayer', 0, 0, width, height);
        this.markBattleTransientEffectLayer(sideLayer);
        const sideLabel = this.host.addChildLabel(sideLayer, 'LobbyBattleActorSideFloatText', sideText, sideX, sideY, 20 * scale, sideColor, new Size(160 * scale, 32 * scale));
        sideLabel.overflow = Label.Overflow.SHRINK;
        this.applyOutline(sideLabel, scale, true);
        const sideOpacity = sideLayer.addComponent(UIOpacity);
        sideOpacity.opacity = 235;
        tween(sideLayer)
          .to(0.34, { position: new Vec3(0, 22 * scale, 0) })
          .to(0.3, { position: new Vec3(0, 36 * scale, 0) })
          .start();
        tween(sideOpacity)
          .to(0.18, { opacity: 255 })
          .to(0.5, { opacity: 0 })
          .start();
      }
    }
  }

  private resolveActionAnchorPoint(anchor: BattleActionAnchor, launch: boolean, scale: number): { x: number; y: number } {
    const horizontal = anchor.enemy ? -1 : 1;
    const x = anchor.x + horizontal * anchor.width * (launch ? 0.34 : -0.2);
    const roleLift = anchor.role === 'back' ? 0.18 : anchor.role === 'boss' ? 0.26 : 0.12;
    const y = anchor.y + anchor.height * roleLift + (launch ? 7 * scale : 0);
    return { x, y };
  }

  private renderImpactLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    _damageEvent: BattlePresentationTimelineEvent,
    currentEvent: BattlePresentationTimelineEvent,
    currentActionCue: BattleActionPresentationCue | null,
    currentAssistCue: BattleAssistPresentationCue | null,
    anchors: Map<string, BattleActionAnchor>,
    hpState: BattlePresentationHpState,
  ): void {
    if (presentation.phase !== 'roundPlaying' && presentation.phase !== 'resultRecording' && presentation.phase !== 'resultRecorded') {
      return;
    }
    if (currentAssistCue && currentEvent.type === 'buff_preview') {
      return;
    }
    const cueIsImpact = currentActionCue?.kind === 'damage_float' || currentActionCue?.kind === 'hit_float';
    const eventIsImpact = currentEvent.type === 'damage_preview' || currentEvent.type === 'hit_react';
    if (!cueIsImpact && !eventIsImpact) {
      return;
    }
    const impactProfile = resolveBattleImpactProfile(currentActionCue, scale);
    if (!currentActionCue || !impactProfile) {
      return;
    }
    if (currentActionCue.evaded) {
      return;
    }
    const hpUnit = hpState.units.get(currentActionCue.targetKey);
    const currentCueKilledTarget = hpUnit?.lastDamageHitKey === currentActionCue.hitKey
      || hpUnit?.lastDamageEventSeq === currentActionCue.eventSeq;
    const currentCueIsDeathWindow = hpUnit?.deadAtMs !== null
      && Math.abs(currentActionCue.timeMs - (hpUnit?.deadAtMs ?? currentActionCue.timeMs)) <= 420
      && currentActionCue.targetKey === hpUnit?.unitKey;
    if (hpUnit?.dead === true && !currentCueKilledTarget && !currentCueIsDeathWindow && !hpState.appliedEventSeqs.has(currentActionCue.eventSeq)) {
      this.recordBattleDeadUnitHitTelemetry(currentActionCue);
      return;
    }
    const activeAnchor = currentActionCue
      ? anchors.get(currentActionCue.targetKey) ?? anchors.get(currentActionCue.actorKey)
      : null;
    const duelFrame = currentActionCue && currentActionCue.actorRole !== 'back'
      ? this.resolveActorMeleeDuelFrame(currentActionCue, anchors, scale)
      : null;
    const effectX = duelFrame?.hitPoint.x ?? (activeAnchor ? activeAnchor.x + (activeAnchor.enemy ? -activeAnchor.width * 0.2 : activeAnchor.width * 0.2) : width * 0.15);
    const effectY = duelFrame?.hitPoint.y ?? (activeAnchor ? activeAnchor.y + activeAnchor.height * 0.16 : height * 0.02);
    const slashKey = `effect:impact:slash:${currentActionCue.cueKey}`;
    if (this.playedBattleCueKeys.has(slashKey)) {
      return;
    }
    this.playedBattleCueKeys.add(slashKey);
    this.renderBattleImpactHitStopLayer(parent, width, height, scale, currentActionCue, impactProfile);
    this.applyBattleImpactScreenShake(parent, currentActionCue, impactProfile);
    this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'slash');
    const slashWidth = Math.min(impactProfile.slash.width, width * 0.18);
    const slashHeight = Math.min(impactProfile.slash.height, height * 0.22);
    const effect = this.host.addChildPlainNode(parent, 'LobbyBattleImpactSlashLayer', 0, 0, width, height);
    this.markBattleTransientEffectLayer(effect);
    const attackerAnchor = anchors.get(currentActionCue.actorKey) ?? null;
    const attackerX = attackerAnchor
      ? attackerAnchor.x + (attackerAnchor.enemy ? -attackerAnchor.width * 0.1 : attackerAnchor.width * 0.1)
      : effectX - (currentActionCue.actorSide === 'ally' ? 120 : -120) * scale;
    const attackerY = attackerAnchor ? attackerAnchor.y + attackerAnchor.height * 0.1 : effectY;
    this.renderBattleImpactSpriteLayer(parent, width, height, scale, currentActionCue, impactProfile, effectX, effectY, slashWidth, slashHeight, snapshot, attackerX, attackerY);
    const graphics = effect.addComponent(Graphics);
    graphics.strokeColor = this.battleImpactColor(impactProfile.slash.primary);
    graphics.lineWidth = impactProfile.slash.lineWidth;
    graphics.moveTo(effectX - slashWidth * 0.48, effectY + slashHeight * 0.24);
    graphics.lineTo(effectX + slashWidth * 0.34, effectY - slashHeight * 0.05);
    graphics.lineTo(effectX - slashWidth * 0.04, effectY - slashHeight * 0.34);
    graphics.stroke();
    graphics.strokeColor = this.battleImpactColor(impactProfile.slash.secondary);
    graphics.lineWidth = Math.max(1, impactProfile.slash.lineWidth * 0.56);
    graphics.moveTo(effectX - slashWidth * 0.22, effectY + slashHeight * 0.24);
    graphics.lineTo(effectX + slashWidth * 0.48, effectY - slashHeight * 0.22);
    graphics.stroke();
    const opacity = effect.addComponent(UIOpacity);
    opacity.opacity = impactProfile.slash.opacity;
    tween(effect)
      .to(0.08, { scale: new Vec3(impactProfile.isCritical ? 1.18 : 1.08, impactProfile.isCritical ? 1.18 : 1.08, 1) })
      .to(0.2, { scale: Vec3.ONE })
      .call(() => {
        if (this.isNodeAlive(effect)) {
          effect.destroy();
        }
      })
      .start();
    tween(opacity)
      .to(0.1, { opacity: Math.min(255, impactProfile.slash.opacity + 24) })
      .to(0.22, { opacity: 0 })
      .start();
  }

  private renderBattleImpactSpriteLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    currentActionCue: BattleActionPresentationCue,
    impactProfile: BattleImpactProfile,
    effectX: number,
    effectY: number,
    slashWidth: number,
    slashHeight: number,
    snapshot: BattlePresentationSnapshot,
    attackerX: number,
    attackerY: number,
  ): void {
    void slashHeight;
    const layer = this.host.addChildPlainNode(parent, 'LobbyBattleImpactSpriteLayer', 0, 0, width, height);
    this.markBattleTransientEffectLayer(layer);
    const renderedAssets: string[] = [];
    const ringSize = Math.min(width * 0.1, (impactProfile.isCritical ? 118 : 86) * scale);

    // 攻击弹道:按攻击者职业只选一种特效(法师=fx_impact 法球,其余物理=fx_slash 斩击),
    // 从攻击者身位飞向受击点,替换旧的两图叠放在受击点的画法。
    const attackerUnit = this.resolveBattleSnapshotUnit(snapshot, currentActionCue.actorKey);
    const attackerClassText = `${attackerUnit?.heroClass ?? ''}`.toLowerCase();
    const mageAttacker = attackerClassText.includes('法师') || attackerClassText.includes('mage') || attackerClassText.includes('wizard');
    const flyAsset = mageAttacker ? BATTLE_C1812_HIT_BURST_EFFECT_ASSET : BATTLE_C1812_HIT_SLASH_ASSET;
    // fx_impact/fx_slash 为成品彩色特效图:保持 512x341 原比例,不加乘色(乘色会压暗素材)。
    const flyWidth = Math.max(slashWidth * 1.1, 72 * scale);
    const flyHeight = flyWidth * (341 / 512);
    const startX = attackerX;
    const startY = attackerY + 12 * scale;
    const fly = this.host.addSprite('LobbyBattleImpactHitSlash', flyAsset, startX, startY, flyWidth, flyHeight, layer);
    if (fly) {
      renderedAssets.push(flyAsset);
      const dx = effectX - startX;
      const dy = effectY - startY;
      // 朝目标取向:向左飞时水平镜像,俯仰角跟随连线。
      if (dx < 0) {
        fly.node.setScale(-1, 1, 1);
      }
      fly.node.angle = (Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI) * (dx >= 0 ? 1 : -1);
      tween(fly.node)
        .to(0.18, { position: new Vec3(effectX, effectY, 0) })
        .start();
      const flyOpacity = fly.node.addComponent(UIOpacity);
      flyOpacity.opacity = 238;
      tween(flyOpacity)
        .delay(0.16)
        .to(0.14, { opacity: 0 })
        .start();
    }
    // 命中环:弹道到达受击点时闪一次。
    const ring = this.host.addSprite('LobbyBattleImpactHitRing', BATTLE_C1812_HIT_RING_ASSET, effectX, effectY, ringSize, ringSize, layer);
    if (ring) {
      renderedAssets.push(BATTLE_C1812_HIT_RING_ASSET);
      ring.color = impactProfile.isCritical ? rgba(255, 208, 98, 232) : rgba(230, 92, 72, 186);
      const ringOpacity = ring.node.addComponent(UIOpacity);
      ringOpacity.opacity = 0;
      tween(ringOpacity)
        .delay(0.14)
        .to(0.06, { opacity: 235 })
        .to(0.16, { opacity: 0 })
        .start();
    }
    if (impactProfile.isCritical) {
      const sparkSize = Math.min(width * 0.08, (impactProfile.isCritical ? 90 : 64) * scale);
      const spark = this.host.addSprite('LobbyBattleImpactHitSpark', BATTLE_C1812_HIT_SPARK_ASSET, effectX + 18 * scale, effectY + 4 * scale, sparkSize, sparkSize, layer);
      if (spark) {
        renderedAssets.push(BATTLE_C1812_HIT_SPARK_ASSET);
        spark.color = rgba(255, 245, 176, 236);
      }
    }

    if (renderedAssets.length === 0) {
      layer.destroy();
      return;
    }
    this.recordBattleHitVfxAssetTelemetry(currentActionCue, renderedAssets);
    tween(layer)
      .delay(0.46)
      .call(() => {
        if (this.isNodeAlive(layer)) {
          layer.destroy();
        }
      })
      .start();
  }

  private renderBattleImpactHitStopLayer(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    currentActionCue: BattleActionPresentationCue,
    impactProfile: BattleImpactProfile,
  ): void {
    const hitStopKey = `effect:impact:hitStop:${currentActionCue.cueKey}`;
    if (this.playedBattleCueKeys.has(hitStopKey)) {
      return;
    }
    this.playedBattleCueKeys.add(hitStopKey);
    this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'hitStop');
    const layer = this.host.addChildPlainNode(parent, BATTLE_IMPACT_HIT_STOP_LAYER_NAME, 0, 0, width, height);
    this.markBattleTransientEffectLayer(layer);
    const graphics = layer.addComponent(Graphics);
    graphics.fillColor = impactProfile.isCritical ? rgba(255, 246, 196, 42) : rgba(255, 255, 255, 18);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    const opacity = layer.addComponent(UIOpacity);
    opacity.opacity = impactProfile.isCritical ? 118 : 72;
    const holdSeconds = Math.max(0.04, impactProfile.hitStopMs / 1000);
    tween(opacity)
      .delay(holdSeconds)
      .to(0.08, { opacity: 0 })
      .call(() => {
        if (this.isNodeAlive(layer)) {
          layer.destroy();
        }
      })
      .start();
    void scale;
  }

  private applyBattleImpactScreenShake(parent: Node, currentActionCue: BattleActionPresentationCue, impactProfile: BattleImpactProfile): void {
    const screenShakeKey = `effect:impact:screenShake:${currentActionCue.cueKey}`;
    if (!impactProfile.screenShake.enabled || this.playedBattleCueKeys.has(screenShakeKey)) {
      return;
    }
    this.playedBattleCueKeys.add(screenShakeKey);
    this.recordBattleImpactTelemetry(currentActionCue, impactProfile, 'screenShake');
    const base = new Vec3(parent.position.x, parent.position.y, parent.position.z);
    const amplitude = impactProfile.screenShake.amplitude;
    const halfDuration = Math.max(0.035, impactProfile.screenShake.durationMs / 2000);
    tween(parent)
      .to(halfDuration, { position: new Vec3(base.x + amplitude, base.y - amplitude * 0.34, base.z) })
      .to(halfDuration, { position: new Vec3(base.x - amplitude * 0.58, base.y + amplitude * 0.22, base.z) })
      .to(0.05, { position: base })
      .call(() => {
        if (this.isNodeAlive(parent)) {
          parent.setPosition(base);
        }
      })
      .start();
  }

  private battleImpactColor(color: BattleImpactRgba): Color {
    return rgba(color.r, color.g, color.b, color.a);
  }

  private renderStage8SettlementFlowPanel(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    settlementView: BattleSettlementPresentationView,
    compact: boolean,
  ): void {
    if (width < 540 * scale || height < 310 * scale) {
      return;
    }
    const panelWidth = Math.min(compact ? 260 * scale : 326 * scale, width * (compact ? 0.44 : 0.36));
    const visibleSteps = compact
      ? settlementView.steps.filter((step) => step.active || step.done || step.blocked).slice(-3)
      : settlementView.steps.slice(0, 5);
    const panelHeight = (compact ? 96 : 136) * scale;
    const panelX = width / 2 - panelWidth / 2 - 18 * scale;
    const panelY = height / 2 - panelHeight / 2 - 102 * scale;
    const panel = this.host.addChildPlainNode(parent, 'LobbyBattleStage8SettlementFlowPanel', panelX, panelY, panelWidth, panelHeight);
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(7, 6, 8, 214);
    graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 8 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(190, 135, 56, 174);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();
    graphics.fillColor = rgba(111, 31, 28, 98);
    graphics.rect(-panelWidth / 2 + 8 * scale, panelHeight / 2 - 30 * scale, panelWidth - 16 * scale, 22 * scale);
    graphics.fill();

    const title = this.host.addChildLabel(panel, 'LobbyBattleStage8SettlementFlowTitle', settlementView.title, -panelWidth / 2 + 14 * scale, panelHeight / 2 - 19 * scale, 13 * scale, rgba(246, 217, 147), new Size(panelWidth * 0.46, 18 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    const receipt = this.host.addChildLabel(panel, 'LobbyBattleStage8ReceiptStatus', settlementView.receiptStatus, panelWidth / 2 - 86 * scale, panelHeight / 2 - 19 * scale, 13 * scale, rgba(184, 218, 229), new Size(158 * scale, 18 * scale));
    receipt.overflow = Label.Overflow.SHRINK;

    const startY = panelHeight / 2 - 48 * scale;
    const rowGap = compact ? 19 * scale : 21 * scale;
    visibleSteps.forEach((step, index) => {
      const rowY = startY - index * rowGap;
      const row = this.host.addChildPlainNode(panel, `LobbyBattleStage8SettlementStep_${index}`, 0, rowY, panelWidth - 18 * scale, 18 * scale);
      const dot = row.addComponent(Graphics);
      dot.fillColor = this.resolveStage8ToneColor(step.tone, 228);
      dot.circle(-panelWidth / 2 + 18 * scale, 0, 4.5 * scale);
      dot.fill();
      dot.strokeColor = this.resolveStage8ToneColor(step.tone, 118);
      dot.circle(-panelWidth / 2 + 18 * scale, 0, 7 * scale);
      dot.stroke();

      const label = this.host.addChildLabel(row, `LobbyBattleStage8SettlementStepLabel_${index}`, step.label, -panelWidth / 2 + 72 * scale, 0, 14 * scale, step.done ? rgba(211, 230, 193) : rgba(223, 196, 133), new Size(98 * scale, 18 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
      const detailWidth = panelWidth - (compact ? 156 : 184) * scale;
      const detail = this.host.addChildLabel(row, `LobbyBattleStage8SettlementStepDetail_${index}`, step.detail, -panelWidth / 2 + (compact ? 160 : 180) * scale, 0, 12 * scale, step.blocked ? rgba(238, 151, 112) : rgba(170, 184, 181), new Size(detailWidth, 18 * scale), HorizontalTextAlignment.LEFT);
      detail.overflow = Label.Overflow.SHRINK;
      if (step.blocked) {
        const badge = this.host.addChildPlainNode(row, `LobbyBattleStage8IdempotencyBadge_${index}`, panelWidth / 2 - 39 * scale, 0, 62 * scale, 17 * scale);
        const badgeGraphics = badge.addComponent(Graphics);
        badgeGraphics.fillColor = rgba(90, 26, 22, 210);
        badgeGraphics.roundRect(-31 * scale, -8.5 * scale, 62 * scale, 17 * scale, 5 * scale);
        badgeGraphics.fill();
        badgeGraphics.strokeColor = rgba(231, 139, 82, 154);
        badgeGraphics.stroke();
        const badgeLabel = this.host.addChildLabel(badge, `LobbyBattleStage8IdempotencyBadgeLabel_${index}`, '已拦截', 0, 0, 12 * scale, rgba(255, 219, 171), new Size(54 * scale, 16 * scale));
        badgeLabel.overflow = Label.Overflow.SHRINK;
      }
    });
  }

  private renderStage8RecoveryBanner(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    settlementView: BattleSettlementPresentationView,
  ): void {
    if (width < 420 * scale || height < 330 * scale || !settlementView.recoveryHint) {
      return;
    }
    const bannerWidth = Math.min(width - 64 * scale, 500 * scale);
    const bannerHeight = 36 * scale;
    const bannerY = -height / 2 + 112 * scale;
    const banner = this.host.addChildPlainNode(parent, 'LobbyBattleStage8RecoveryBanner', 0, bannerY, bannerWidth, bannerHeight);
    const graphics = banner.addComponent(Graphics);
    graphics.fillColor = settlementView.phase === 'error' ? rgba(72, 20, 18, 214) : rgba(7, 8, 10, 210);
    graphics.roundRect(-bannerWidth / 2, -bannerHeight / 2, bannerWidth, bannerHeight, 8 * scale);
    graphics.fill();
    graphics.strokeColor = settlementView.phase === 'error' ? rgba(240, 108, 78, 174) : rgba(132, 110, 66, 152);
    graphics.stroke();
    const label = this.host.addChildLabel(
      banner,
      'LobbyBattleStage8RecoveryHint',
      `${settlementView.primaryRecoveryLabel}：${settlementView.recoveryHint}`,
      0,
      0, 14 * scale,
      settlementView.phase === 'error' ? rgba(255, 206, 185) : rgba(194, 205, 190),
      new Size(bannerWidth - 22 * scale, bannerHeight - 4 * scale),
    );
    label.overflow = Label.Overflow.SHRINK;
  }

  private resolveStage8ToneColor(tone: BattleSettlementPresentationView['steps'][number]['tone'], alpha: number): Color {
    if (tone === 'done') {
      return rgba(118, 201, 126, alpha);
    }
    if (tone === 'blocked') {
      return rgba(234, 98, 72, alpha);
    }
    if (tone === 'warning') {
      return rgba(255, 178, 86, alpha);
    }
    if (tone === 'active') {
      return rgba(237, 198, 90, alpha);
    }
    return rgba(103, 111, 118, alpha);
  }

  private renderStage9PerformanceBadge(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    performanceProfile: BattleAdaptivePerformanceProfile,
  ): void {
    if (!performanceProfile.showPerformanceBadge) {
      return;
    }
    const badgeWidth = Math.min(132 * scale, width * 0.36);
    const badgeHeight = 24 * scale;
    const guard = this.host.addChildPlainNode(
      parent,
      'LobbyBattleStage9ViewportGuard',
      -width / 2 + badgeWidth / 2 + 14 * scale,
      height / 2 - badgeHeight / 2 - 14 * scale,
      badgeWidth,
      badgeHeight,
    );
    const graphics = guard.addComponent(Graphics);
    graphics.fillColor = rgba(8, 9, 11, 206);
    graphics.roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 6 * scale);
    graphics.fill();
    graphics.strokeColor = performanceProfile.tier === 'minimal' ? rgba(232, 164, 84, 154) : rgba(126, 147, 158, 132);
    graphics.stroke();
    const text = performanceProfile.tier === 'minimal' ? '轻量模式' : performanceProfile.viewportKey;
    const label = this.host.addChildLabel(guard, 'LobbyBattleStage9PerformanceBadge', text, 0, 0, 13 * scale, rgba(221, 203, 152), new Size(badgeWidth - 14 * scale, badgeHeight));
    label.overflow = Label.Overflow.SHRINK;
  }

  private renderStage11BattleAudioRuntime(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    audioPlan: BattleAudioRuntimePlan,
    renderGeneration: number,
  ): void {
    const runtime = this.host.addChildPlainNode(
      parent,
      'LobbyBattleStage11AudioRuntime',
      width / 2 - 4 * scale,
      height / 2 - 4 * scale,
      1,
      1,
    );
    const audioSource = runtime.addComponent(AudioSource);
    this.playBattleBgm(audioSource, audioPlan.bgm, renderGeneration);
    this.playBattleAudioCue(audioSource, audioPlan.oneShot, renderGeneration);
    const status = this.host.addChildLabel(
      runtime,
      'LobbyBattleStage11AudioStatus',
      '',
      0,
      0,
      1,
      rgba(202, 188, 145, 0),
      new Size(1, 1),
    );
    status.overflow = Label.Overflow.SHRINK;
  }

  private playBattleBgm(audioSource: AudioSource, cue: BattleAudioCuePlan | null, renderGeneration: number): void {
    if (!cue || !this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isBattleAudioSourceNodeValid(audioSource)) {
      return;
    }
    this.loadBattleAudioClip(cue.resourcePath, (clip) => {
      if (!clip || !this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isBattleAudioSourceNodeValid(audioSource)) {
        return;
      }
      try {
        audioSource.clip = clip;
        audioSource.loop = cue.loop;
        audioSource.volume = cue.volume;
        audioSource.play();
      } catch (error) {
        console.warn(`[BattleAudio] bgm play failed: ${cue.resourcePath}, ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private playBattleAudioCue(audioSource: AudioSource, cue: BattleAudioCuePlan | null, renderGeneration: number): void {
    if (!cue || this.battleAudioPlayedKeys.has(cue.playKey) || !this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isBattleAudioSourceNodeValid(audioSource)) {
      return;
    }
    this.battleAudioPlayedKeys.add(cue.playKey);
    this.loadBattleAudioClip(cue.resourcePath, (clip) => {
      if (!clip || !this.isBattleRenderGenerationCurrent(renderGeneration) || !this.isBattleAudioSourceNodeValid(audioSource)) {
        return;
      }
      try {
        audioSource.playOneShot(clip, cue.volume);
      } catch (error) {
        console.warn(`[BattleAudio] cue play failed: ${cue.resourcePath}, ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private loadBattleAudioClip(path: string, callback: (clip: AudioClip | null) => void): void {
    const cached = this.battleAudioClipCache.get(path);
    if (cached) {
      callback(cached);
      return;
    }
    const pending = this.battleAudioLoadCallbacks.get(path);
    if (pending) {
      pending.push(callback);
      return;
    }
    this.battleAudioLoadCallbacks.set(path, [callback]);
    resources.load(path, AudioClip, (error: Error | null, clip: AudioClip | null) => {
      if (clip && !error) {
        this.battleAudioClipCache.set(path, clip);
      } else {
        console.warn(`[BattleAudio] audio load failed: ${path}, ${error?.message ?? 'empty clip'}`);
      }
      const callbacks = this.battleAudioLoadCallbacks.get(path) ?? [];
      Reflect.apply(Map.prototype.delete, this.battleAudioLoadCallbacks, [path]);
      callbacks.forEach((entry) => entry(clip && !error ? clip : null));
    });
  }

  private renderBattleLog(parent: Node, rect: BattlePresentationRect, scale: number, presentation: LobbyBattlePresentationState): void {
    if (rect.width < 760 * scale || rect.height < 42 * scale) {
      return;
    }
    const log = this.host.addChildPlainNode(parent, 'LobbyBattlePreviewLog', rect.x, rect.y, rect.width, rect.height);
    const graphics = log.addComponent(Graphics);
    graphics.fillColor = rgba(5, 5, 7, 205);
    graphics.rect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
    graphics.fill();
    graphics.strokeColor = rgba(132, 98, 52, 120);
    graphics.stroke();
    const text = this.host.addChildLabel(log, 'LobbyBattlePreviewLogText', presentation.logLines.join('\n'), 0, 0, 15 * scale, rgba(207, 188, 145), new Size(rect.width - 28 * scale, rect.height - 10 * scale));
    text.lineHeight = 18 * scale;
    text.overflow = Label.Overflow.SHRINK;
  }

  private renderResultBanner(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    state: LobbyBattlePanelState,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    hpState: BattlePresentationHpState,
    playbackTimelineTimeMs: number,
  ): void {
    void presentation;
    const outcome = resolveBattleVisualOutcome(hpState, playbackTimelineTimeMs);
    if (!outcome) {
      return;
    }
    this.renderStage12VictoryOverlay(parent, width, height, scale, state, presentation, snapshot, outcome);
  }

  private renderStage12VictoryOverlay(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    state: LobbyBattlePanelState,
    presentation: LobbyBattlePresentationState,
    snapshot: BattlePresentationSnapshot,
    visualOutcome: 'victory' | 'defeat' | null = null,
  ): void {
    // 胜负优先看后端结算结果;结算回执未到时(settle 异步)先用视觉 sim 结果兜底,避免战败先闪"战斗胜利"。
    const win = state.settlement?.result
      ? state.settlement.result.toUpperCase() !== 'LOSE'
      : visualOutcome !== 'defeat';
    const veil = this.host.addChildPlainNode(parent, 'LobbyBattleStage12VictoryVeil', 0, 0, width, height);
    const veilGraphics = veil.addComponent(Graphics);
    // 遮罩加深:压住结算时残留的战场立绘与地面阴影,弹框与按钮成为唯一视觉焦点。
    veilGraphics.fillColor = rgba(0, 0, 0, 216);
    veilGraphics.rect(-width / 2, -height / 2, width, height);
    veilGraphics.fill();
    // 巨大淡黄/淡红椭圆光晕移除:实景背景上像一块污渍。

    const overlayWidth = Math.min(width * 0.86, 900 * scale);
    const overlayHeight = Math.min(height * 0.62, 470 * scale);
    const overlay = this.host.addChildPlainNode(parent, 'LobbyBattleStage12VictoryOverlay', 0, height * 0.02, overlayWidth, overlayHeight);
    // 胜利弹框与遮罩整体置顶,避免残留英雄立绘盖住返回按钮。
    veil.setSiblingIndex(parent.children.length - 1);
    overlay.setSiblingIndex(parent.children.length - 1);
    // 不再画 Graphics 黑底:AI 弹框素材自带黑曜石面板,叠黑底会在金框外露出一圈黑色矩形。
    // AI 弹框主框(小号):加高后的 overlay 与九宫格 border 匹配,黑曜石金边质感。
    // 结算专属框:顶部恶魔火纹章冠,与"战斗胜利"仪式感匹配。
    const overlayArt = this.host.addSprite('LobbyBattleStage12VictoryOverlayArt', 'ui/battle/ai/result_frame/spriteFrame', 0, 0, overlayWidth, overlayHeight, overlay);
    if (overlayArt) {
      overlayArt.type = Sprite.Type.SLICED;
    }
    // 结算框自带顶部火纹章冠,标题文字直接悬于冠顶,不再叠标题横幅。
    const title = this.host.addChildLabel(
      overlay,
      'LobbyBattleStage12VictoryTitle',
      win ? '战斗胜利' : '战斗失败',
      0,
      overlayHeight / 2 + 20 * scale,
      36 * scale,
      win ? rgba(255, 236, 161) : rgba(255, 150, 130),
      new Size(Math.min(380 * scale, overlayWidth * 0.52), 52 * scale),
    );
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);

    // 玩家经验做成框顶横幅(A 方案 2026-08-12):经验不进物品格(避免空图标+×号),用后端 resourceName
    // 统一术语并用 +号;横幅下移到黑曜石面板顶(overlayHeight/2-118),避让顶部恶魔火纹章冠。
    const expLine = state.settlement?.rewardItems?.find((item) => item.resourceCode === 'PLAYER_EXP');
    if (expLine) {
      const expLabel = this.host.addChildLabel(overlay, 'LobbyBattleStage12VictoryExp', `${expLine.resourceName} +${expLine.amount}`, 0, overlayHeight / 2 - 150 * scale, 21 * scale, rgba(214, 234, 168), new Size(overlayWidth - 210 * scale, 26 * scale));
      expLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(expLabel, scale, false);
    }

    // 结算框物品格只展示真实道具:PLAYER_EXP 已在顶部横幅呈现,从网格排除(A 方案)。
    const rewards = (state.settlement?.rewardItems ?? []).filter((item) => item.resourceCode !== 'PLAYER_EXP');
    const dailyDungeon = isDailyDungeonStageCode(snapshot.stageCode);
    const dailyCounts = dailyDungeon && state.settlement ? /今日 (\d+)\/(\d+) 次/.exec(state.settlement.message || '') : null;
    const dailyCanRetry = !!dailyCounts && Number(dailyCounts[1]) < Number(dailyCounts[2]);
    // 收益区重设计(2026-08-13):经验横幅下 → 细金分割线 → "获得奖励"小标 → 奖励格,建立清晰纵向层次。
    if (rewards.length > 0) {
      const divider = this.host.addChildPlainNode(overlay, 'LobbyBattleStage12VictoryDivider', 0, overlayHeight / 2 - 176 * scale, overlayWidth * 0.46, 3 * scale);
      const dg = divider.addComponent(Graphics);
      dg.strokeColor = rgba(206, 168, 96, 155);
      dg.lineWidth = Math.max(1, 1.4 * scale);
      dg.moveTo(-overlayWidth * 0.23, 0);
      dg.lineTo(overlayWidth * 0.23, 0);
      dg.stroke();
      const rewardTitle = this.host.addChildLabel(overlay, 'LobbyBattleStage12VictoryRewardTitle', dailyDungeon ? '获得产出' : '获得奖励', 0, overlayHeight / 2 - 202 * scale, 16 * scale, rgba(226, 198, 142, 240), new Size(overlayWidth * 0.5, 20 * scale));
      rewardTitle.overflow = Label.Overflow.SHRINK;
      this.applyOutline(rewardTitle, scale, false);
    }
    // 奖励区:图标格加大+道具图标+名字/数量。奖励块整体下移居中到"获得奖励"标下方的面板下半(消除原先挤上半、下方大片空黑的失衡)。
    const rewardY = -84 * scale;
    // 首通奖励可达 7-8 种(金币+装备/宝石/材料/技能觉醒道具):>4 时折成两排全部展示,不再 slice(0,5) 截断——
    // 否则玩家看不到宝石/觉醒石/BOSS印记等真实到手的奖励,与"看不到本次奖励"的体验痛点同源。
    const rewardCount = Math.max(1, rewards.length);
    const rowCount = rewardCount <= 4 ? 1 : 2;
    const perRow = Math.ceil(rewardCount / rowCount);
    const sideMargin = 44 * scale;
    const gapRatio = 0.26;
    const slotSize = Math.max(40 * scale, Math.min((rowCount === 1 ? 104 : 82) * scale, (overlayWidth - sideMargin * 2) / perRow / (1 + gapRatio)));
    // 奖励行横向铺开到面板下半 ~60% 宽(避免几格挤中央、两侧大片空黑);间距撑到目标行宽但不超过 0.9 格避免过散。
    const spreadGap = perRow > 1 ? (overlayWidth * 0.6 - perRow * slotSize) / (perRow - 1) : slotSize * gapRatio;
    const slotGap = Math.max(slotSize * gapRatio, Math.min(spreadGap, slotSize * 0.9));
    const rowPitch = slotSize + 40 * scale; // 格 + 名称行 + 行距
    const firstRowY = rewardY + (rowCount - 1) * rowPitch / 2; // 整块以 rewardY 垂直居中
    rewards.forEach((reward, index) => {
      const row = Math.floor(index / perRow);
      const col = index % perRow;
      const itemsThisRow = Math.min(perRow, rewards.length - row * perRow);
      const rowWidth = itemsThisRow * slotSize + (itemsThisRow - 1) * slotGap;
      const x = -rowWidth / 2 + slotSize / 2 + col * (slotSize + slotGap);
      const y = firstRowY - row * rowPitch;
      const slot = this.host.addChildPlainNode(overlay, `LobbyBattleStage12RewardSlot_${index}`, x, y, slotSize + 26 * scale, slotSize + 24 * scale);
      // 干净精致格:黑曜石底 + 外粗内细双层金边(原雕花竖版素材 256×338 被压成正方形会挤扁花纹+内窗小于图标致溢出,弃用)。
      const slotY = 10 * scale;
      const g = slot.addComponent(Graphics);
      g.fillColor = rgba(16, 13, 11, 242);
      g.roundRect(-slotSize / 2, slotY - slotSize / 2, slotSize, slotSize, 9 * scale);
      g.fill();
      g.strokeColor = rgba(201, 160, 92, 240);
      g.lineWidth = Math.max(1.5, 2.4 * scale);
      g.roundRect(-slotSize / 2, slotY - slotSize / 2, slotSize, slotSize, 9 * scale);
      g.stroke();
      const inset = 5 * scale;
      g.strokeColor = rgba(122, 94, 48, 195);
      g.lineWidth = Math.max(1, scale);
      g.roundRect(-slotSize / 2 + inset, slotY - slotSize / 2 + inset, slotSize - inset * 2, slotSize - inset * 2, 6 * scale);
      g.stroke();
      const iconAsset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      if (iconAsset) {
        const iconSize = slotSize * 0.76;
        this.host.addSprite(`LobbyBattleStage12RewardSlotIcon_${index}`, iconAsset, 0, slotY, iconSize, iconSize, slot);
      }
      const amountLabel = this.host.addChildLabel(slot, 'LobbyBattleStage12RewardSlotAmount', `×${reward.amount}`, slotSize / 2 - 18 * scale, 10 * scale - slotSize / 2 + 13 * scale, 16 * scale, rgba(255, 236, 176), new Size(slotSize * 0.7, 20 * scale), HorizontalTextAlignment.RIGHT);
      amountLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(amountLabel, scale, false);
      const nameLabel = this.host.addChildLabel(slot, 'LobbyBattleStage12RewardSlotName', reward.resourceName, 0, 10 * scale - slotSize / 2 - 16 * scale, 15 * scale, rgba(214, 196, 156, 235), new Size(slotSize + slotGap, 20 * scale));
      nameLabel.overflow = Label.Overflow.SHRINK;
    });
    if (rewards.length === 0) {
      // 闭环后奖励为真发:回执未到=提交中;回执已到但无奖励行=主线重复通关/每日战败;settle 报错=提交失败(给下方重试)。
      const settleFailed = !state.settlement && !!state.error;
      const emptyText = state.settlement
        ? dailyDungeon
          ? win
            ? '奖励发放异常，请稍后在背包核对'
            : '挑战失败：不消耗次数与体力，可直接再战'
          : win
            ? '本关已首通，重复挑战不再发放奖励'
            : '挑战失败：不发放奖励、不扣体力、不推进进度，可调整阵容再战'
        : settleFailed
          ? `结算提交失败：${state.error}\n请点下方“重新结算”，勿直接下一关(会跳过本次奖励)`
          : '结算提交中，奖励以回执为准…';
      const empty = this.host.addChildLabel(overlay, 'LobbyBattleStage12RewardSlotEmpty', emptyText, 0, rewardY, 18 * scale, settleFailed ? rgba(240, 176, 132) : rgba(196, 181, 136), new Size(overlayWidth - 80 * scale, settleFailed ? 52 * scale : 26 * scale));
      empty.overflow = Label.Overflow.SHRINK;
      empty.enableWrapText = true;
      this.applyOutline(empty, scale, false);
    }
    if (dailyDungeon && state.settlement && win) {
      // 每日副本:次数与体力一行看清,不用回面板确认。
      const staminaPart = state.settlement.staminaCost ? ` · 体力 -${state.settlement.staminaCost}` : '';
      const infoText = dailyCounts ? `今日次数 ${dailyCounts[1]}/${dailyCounts[2]}${staminaPart}` : staminaPart.replace(' · ', '');
      if (infoText) {
        const info = this.host.addChildLabel(overlay, 'LobbyBattleStage12DailyInfo', infoText, 0, -overlayHeight / 2 + 70 * scale, 18 * scale, rgba(211, 232, 164), new Size(overlayWidth - 120 * scale, 26 * scale));
        info.overflow = Label.Overflow.SHRINK;
        this.applyOutline(info, scale, false);
      }
    }
    // 结算主按钮:胜利时"返回大厅 | 下一关"并排,连续推图;失败只留返回。按钮加大避免素材边框吃掉高度。
    const buttonWidth = Math.min(280 * scale, overlayWidth * 0.42);
    const buttonHeight = 72 * scale;
    const buttonY = -overlayHeight / 2 - buttonHeight / 2 - 14 * scale;
    const nextStageCode = win ? this.resolveNextStageCode(snapshot.stageCode) : null;
    const buildOverlayButton = (name: string, text: string, x: number, onClick: () => void, asset: string = C1812_BUTTON_PRIMARY_ASSET, disabled = false): void => {
      const button = this.host.addChildPlainNode(overlay, name, x, buttonY, buttonWidth, buttonHeight);
      const sprite = this.host.addSprite(`${name}Art`, asset, 0, 0, buttonWidth, buttonHeight, button);
      if (sprite) {
        sprite.type = Sprite.Type.SLICED;
        if (disabled) {
          sprite.color = rgba(150, 150, 150, 210);
        }
      } else {
        const buttonGraphics = button.addComponent(Graphics);
        buttonGraphics.fillColor = disabled ? rgba(96, 96, 96, 220) : rgba(150, 102, 34, 240);
        buttonGraphics.roundRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8 * scale);
        buttonGraphics.fill();
        buttonGraphics.strokeColor = rgba(255, 214, 120, 220);
        buttonGraphics.stroke();
      }
      // 文字右移让开按钮左侧宝石装饰区。
      const label = this.host.addChildLabel(button, `${name}Label`, text, 14 * scale, 0, 21 * scale, disabled ? rgba(210, 210, 210) : rgba(255, 240, 198), new Size(buttonWidth - 74 * scale, 30 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, true);
      if (disabled) {
        // 结算回执在途:占住"下一关"位但不可点,避免抢先跳关错过本次奖励;回执一到全量重绘换回可点按钮。
        return;
      }
      button.addComponent(Button);
      this.host.applyImageButtonFeedback(button, 1.05, 0.95);
      button.on(Button.EventType.CLICK, onClick, this);
    };
    const settleFailedForButtons = !state.settlement && !!state.error;
    const settlePendingForButtons = win && !state.settlement && !state.error;
    if (settleFailedForButtons) {
      // 结算回执失败:优先给"重新结算"入口(点下一关会丢弃本次结算,拿不到奖励)。settleLobbyBattleSession 会重投 settle。
      buildOverlayButton('LobbyBattleVictoryReturnButton', '返回大厅', -buttonWidth / 2 - 14 * scale, () => this.host.returnToLobbyFromBattlePreview(), C1812_BUTTON_RETURN_ASSET);
      buildOverlayButton('LobbyBattleResettleButton', '重新结算', buttonWidth / 2 + 14 * scale, () => this.host.settleLobbyBattleSession());
    } else if (settlePendingForButtons) {
      // 胜利但结算回执在途:先禁用"下一关",避免玩家抢先跳关后看不到本次奖励。回执到达触发全量重绘换回可点按钮。
      buildOverlayButton('LobbyBattleVictoryReturnButton', '返回大厅', -buttonWidth / 2 - 14 * scale, () => this.host.returnToLobbyFromBattlePreview(), C1812_BUTTON_RETURN_ASSET);
      buildOverlayButton('LobbyBattleSettlingButton', '结算中…', buttonWidth / 2 + 14 * scale, () => undefined, C1812_BUTTON_PRIMARY_ASSET, true);
    } else if (nextStageCode) {
      buildOverlayButton('LobbyBattleVictoryReturnButton', '返回大厅', -buttonWidth / 2 - 14 * scale, () => this.host.returnToLobbyFromBattlePreview(), C1812_BUTTON_RETURN_ASSET);
      buildOverlayButton('LobbyBattleVictoryNextButton', '下一关', buttonWidth / 2 + 14 * scale, () => this.host.openLobbyBattlePreviewPanel(nextStageCode));
    } else if (win && dailyCanRetry) {
      // 每日副本胜利且次数未满:直接再来一次,免去回面板重进(与战败"重新挑战"同一 host 通路)。
      buildOverlayButton('LobbyBattleVictoryReturnButton', '返回大厅', -buttonWidth / 2 - 14 * scale, () => this.host.returnToLobbyFromBattlePreview(), C1812_BUTTON_RETURN_ASSET);
      buildOverlayButton('LobbyBattleDailyAgainButton', '再次挑战', buttonWidth / 2 + 14 * scale, () => this.host.openLobbyBattlePreviewPanel(snapshot.stageCode));
    } else if (!win) {
      // 战败:返回大厅 | 重新挑战(重开本关战斗)。把胜利时"下一关"的位置换成"重新挑战"。
      buildOverlayButton('LobbyBattleVictoryReturnButton', '返回大厅', -buttonWidth / 2 - 14 * scale, () => this.host.returnToLobbyFromBattlePreview(), C1812_BUTTON_RETURN_ASSET);
      buildOverlayButton('LobbyBattleRetryButton', '重新挑战', buttonWidth / 2 + 14 * scale, () => this.host.openLobbyBattlePreviewPanel(snapshot.stageCode));
    } else {
      buildOverlayButton('LobbyBattleVictoryReturnButton', '返回大厅', 0, () => this.host.returnToLobbyFromBattlePreview(), C1812_BUTTON_RETURN_ASSET);
    }
  }

  // 下一关号推导:MAIN_a_b → MAIN_a_(b+1)。是否解锁由 openLobbyBattlePreviewPanel 内部校验,未解锁会回爬塔面板提示。
  private resolveNextStageCode(stageCode: string | null | undefined): string | null {
    const match = /^MAIN_(\d+)_(\d+)$/.exec((stageCode || '').trim());
    if (!match) {
      return null;
    }
    return `MAIN_${match[1]}_${Number(match[2]) + 1}`;
  }

  // (模块尾部有 formatBattleStageDisplayName:每日副本码转中文展示名)

  private resolveRarityColor(rarity: string | null | undefined, alpha = 220): Color {
    const key = (rarity || '').trim().toUpperCase();
    if (key === 'UR') {
      return rgba(255, 84, 48, alpha);
    }
    if (key === 'SSR') {
      return rgba(255, 168, 54, alpha);
    }
    if (key === 'SR') {
      return rgba(200, 111, 255, alpha);
    }
    if (key === 'R') {
      return rgba(93, 151, 255, alpha);
    }
    return rgba(96, 91, 88, alpha);
  }

  private renderSettlementReceipt(parent: Node, width: number, height: number, scale: number, presentation: LobbyBattlePresentationState, compact: boolean): void {
    const receiptLines = presentation.settlementReceiptLines ?? [];
    if (presentation.phase !== 'resultRecorded' || compact || receiptLines.length === 0) {
      return;
    }
    const receiptWidth = Math.min(300 * scale, width * 0.38);
    const receiptHeight = 126 * scale;
    const receipt = this.host.addChildPlainNode(parent, 'LobbyBattleSettlementReceipt', 0, -4 * scale, receiptWidth, receiptHeight);
    const graphics = receipt.addComponent(Graphics);
    graphics.fillColor = rgba(8, 7, 8, 228);
    graphics.rect(-receiptWidth / 2, -receiptHeight / 2, receiptWidth, receiptHeight);
    graphics.fill();
    graphics.strokeColor = rgba(215, 157, 67, 216);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.stroke();
    graphics.fillColor = rgba(102, 22, 20, 92);
    graphics.rect(-receiptWidth / 2 + 8 * scale, receiptHeight / 2 - 34 * scale, receiptWidth - 16 * scale, 26 * scale);
    graphics.fill();

    const title = this.host.addChildLabel(receipt, 'LobbyBattleSettlementReceiptTitle', '结算回执', 0, receiptHeight / 2 - 21 * scale, 16 * scale, rgba(248, 219, 151), new Size(receiptWidth - 18 * scale, 22 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, false);

    receiptLines.slice(0, 5).forEach((line, index) => {
      const label = this.host.addChildLabel(
        receipt,
        `LobbyBattleSettlementReceiptLine_${index}`,
        line,
        -receiptWidth / 2 + 14 * scale,
        receiptHeight / 2 - (50 + index * 15) * scale, 14 * scale,
        index >= 2 ? rgba(188, 218, 231) : rgba(221, 198, 145),
        new Size(receiptWidth - 28 * scale, 16 * scale),
        HorizontalTextAlignment.LEFT,
      );
      label.overflow = Label.Overflow.SHRINK;
    });
  }

  private renderFooter(
    parent: Node,
    layout: BattlePresentationLayout,
    scale: number,
    state: LobbyBattlePanelState,
    presentation: LobbyBattlePresentationState,
    settlementView: BattleSettlementPresentationView,
  ): void {
    if (presentation.phase === 'roundPlaying') {
      return;
    }
    // 结算弹窗弹出后底部页脚(返回大厅按钮/已记录标签/边界文案)全部撤掉:出口由弹窗接管,不再双份。
    if (presentation.phase === 'resultRecorded' || this.battleVictoryBannerShown) {
      return;
    }
    const note = this.host.addChildLabel(
      parent,
      'LobbyBattlePreviewBoundaryNote',
      presentation.boundaryText,
      layout.boundary.x,
      layout.boundary.y, 17 * scale,
      rgba(168, 146, 105),
      new Size(layout.boundary.width, layout.boundary.height),
    );
    note.overflow = Label.Overflow.SHRINK;

    const disabledRect = layout.footerButtons[0];
    const disabled = this.host.addChildPlainNode(parent, 'LobbyBattleSettleDisabled', disabledRect.x, disabledRect.y, disabledRect.width, disabledRect.height);
    this.drawDisabledButton(disabled, disabledRect.width, disabledRect.height, scale);
    const disabledLabel = this.host.addChildLabel(disabled, 'LobbyBattleSettleDisabledLabel', this.resolveLeftStatusLabel(presentation, settlementView), 0, 0, 18 * scale, rgba(179, 150, 91), new Size(disabledRect.width - 10 * scale, disabledRect.height));
    disabledLabel.overflow = Label.Overflow.SHRINK;

    this.renderActionButton(parent, layout.footerButtons[1], scale, state, presentation);
    const backRect = layout.footerButtons[2];
    if (presentation.returnToLobby || (state.presentationComplete && !!state.start)) {
      const locked = this.host.addChildPlainNode(parent, 'LobbyBattlePreviewCloseButton', backRect.x, backRect.y, backRect.width, backRect.height);
      this.drawDisabledButton(locked, backRect.width, backRect.height, scale);
      const label = this.host.addChildLabel(locked, 'LobbyBattlePreviewCloseButtonLabel', presentation.returnToLobby ? '已记录' : '演出完成', 0, 0, 18 * scale, rgba(179, 150, 91), new Size(backRect.width - 10 * scale, backRect.height));
      label.overflow = Label.Overflow.SHRINK;
      return;
    }
    const back = this.addFooterButton(parent, 'LobbyBattlePreviewCloseButton', '返回编队', backRect, scale, C1812_BUTTON_RETURN_ASSET);
    back.on(Button.EventType.CLICK, () => this.host.closeLobbyBattlePreviewPanel(), this);
  }

  private renderActionButton(parent: Node, rect: BattlePresentationRect, scale: number, state: LobbyBattlePanelState, presentation: LobbyBattlePresentationState): void {
    if (!presentation.actionEnabled) {
      const pending = this.host.addChildPlainNode(parent, presentation.actionNodeName, rect.x, rect.y, rect.width, rect.height);
      this.drawDisabledButton(pending, rect.width, rect.height, scale);
      const label = this.host.addChildLabel(pending, `${presentation.actionNodeName}Label`, presentation.actionLabel, 0, 0, 18 * scale, rgba(179, 150, 91), new Size(rect.width, rect.height));
      label.overflow = Label.Overflow.SHRINK;
      return;
    }
    const button = this.addFooterButton(parent, presentation.actionNodeName, presentation.actionLabel, rect, scale);
    if (presentation.returnToLobby) {
      button.on(Button.EventType.CLICK, () => this.host.returnToLobbyFromBattlePreview(), this);
    } else if (!state.start) {
      button.on(Button.EventType.CLICK, () => this.host.startLobbyBattleSession(), this);
    } else {
      // 本轮战斗视觉重做只验收播放闭环；不在 UI 上触发 settle 写入，真实结算需单独授权后再开启。
      button.on(Button.EventType.CLICK, () => this.host.returnToLobbyFromBattlePreview(), this);
    }
  }

  private resolveLeftStatusLabel(presentation: LobbyBattlePresentationState, settlementView: BattleSettlementPresentationView): string {
    if (presentation.phase === 'resultRecorded') {
      return settlementView.receiptStatus;
    }
    if (presentation.phase === 'roundPlaying') {
      if (presentation.actionEnabled) {
        return '胜利预览';
      }
      return '视觉回放';
    }
    if (presentation.phase === 'resultRecording') {
      return '结算中';
    }
    return '等待演出';
  }

  private addFooterButton(parent: Node, name: string, text: string, rect: BattlePresentationRect, scale: number, asset: string = C1812_BUTTON_PRIMARY_ASSET): Node {
    const button = this.host.addChildPlainNode(parent, name, rect.x, rect.y, rect.width, rect.height);
    const art = this.host.addSprite(`${name}Art`, asset, 0, 0, rect.width, rect.height, button);
    if (!art) {
      const graphics = button.addComponent(Graphics);
      graphics.fillColor = rgba(20, 16, 15, 226);
      graphics.rect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
      graphics.fill();
      graphics.strokeColor = rgba(188, 137, 58, 216);
      graphics.stroke();
    }
    button.addComponent(Button);
    this.host.applyImageButtonFeedback(button, 1.025, 0.975);
    const label = this.host.addChildLabel(button, `${name}Label`, text, 0, 0, 19 * scale, art ? rgba(255, 240, 200) : rgba(245, 211, 123), new Size(rect.width - 10 * scale, rect.height));
    label.overflow = Label.Overflow.SHRINK;
    return button;
  }

  private renderBattleSceneEnvironmentLayers(parent: Node, width: number, height: number, scale: number): void {
    const groundHeight = Math.min(height * 0.42, Math.max(178 * scale, width * (397 / 1680)));
    if (LOBBY_BATTLE_SCENE_GROUND_ASSET !== LOBBY_BATTLE_SCENE_BG_ASSET) {
      this.host.addSprite(
        'LobbyBattleSceneGroundSprite',
        LOBBY_BATTLE_SCENE_GROUND_ASSET,
        0,
        -height / 2 + groundHeight / 2,
        width,
        groundHeight,
        parent,
      );
    }
    const foregroundHeight = Math.min(height * 0.22, Math.max(92 * scale, width * (208 / 1680)));
    if (LOBBY_BATTLE_SCENE_FOREGROUND_ASSET !== LOBBY_BATTLE_SCENE_BG_ASSET) {
      this.host.addSprite(
        'LobbyBattleSceneForegroundSprite',
        LOBBY_BATTLE_SCENE_FOREGROUND_ASSET,
        0,
        -height / 2 + foregroundHeight / 2,
        width,
        foregroundHeight,
        parent,
      );
    }
  }

  private renderBattleFieldEnvironment(parent: Node, width: number, height: number, scale: number): void {
    const veil = this.host.addChildPlainNode(parent, 'LobbyBattleFieldEnvironmentVeil', 0, 0, width, height);
    const graphics = veil.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 12);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = rgba(3, 5, 9, 30);
    graphics.rect(-width / 2, -height / 2, width, height * 0.18);
    graphics.rect(-width / 2, height / 2 - height * 0.1, width, height * 0.1);
    graphics.fill();
  }

  private drawBattleFallbackLandscape(parent: Node, width: number, height: number, scale: number, compact: boolean): void {
    const landscape = this.host.addChildPlainNode(parent, compact ? 'LobbyBattleFieldFallbackLandscape' : 'LobbyBattleSceneFallbackLandscape', 0, 0, width, height);
    const graphics = landscape.addComponent(Graphics);
    this.drawStage13XBattleFallbackLandscape(graphics, width, height, scale, compact);
  }

  private drawStage13XBattleFallbackLandscape(graphics: Graphics, width: number, height: number, scale: number, compact: boolean): void {
    const groundTop = -height * (compact ? 0.08 : 0.12);
    graphics.fillColor = rgba(18, 28, 42, 255);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();

    const moonRadius = Math.min(width, height) * (compact ? 0.12 : 0.16);
    graphics.fillColor = rgba(95, 30, 28, compact ? 46 : 72);
    graphics.circle(width * 0.08, height * 0.3, moonRadius * 1.92);
    graphics.fill();
    graphics.fillColor = rgba(35, 8, 9, 208);
    graphics.circle(width * 0.08, height * 0.3, moonRadius * 0.56);
    graphics.fill();

    graphics.fillColor = rgba(30, 36, 34, 246);
    graphics.rect(-width / 2, -height / 2, width, Math.max(1, groundTop + height / 2));
    graphics.fill();

    graphics.fillColor = rgba(25, 38, 46, 232);
    graphics.moveTo(-width / 2, groundTop + height * 0.1);
    graphics.lineTo(-width * 0.36, groundTop + height * 0.25);
    graphics.lineTo(-width * 0.18, groundTop + height * 0.12);
    graphics.lineTo(width * 0.02, groundTop + height * 0.26);
    graphics.lineTo(width * 0.22, groundTop + height * 0.11);
    graphics.lineTo(width * 0.4, groundTop + height * 0.24);
    graphics.lineTo(width / 2, groundTop + height * 0.1);
    graphics.lineTo(width / 2, groundTop - height * 0.03);
    graphics.lineTo(-width / 2, groundTop - height * 0.03);
    graphics.close();
    graphics.fill();

    graphics.fillColor = rgba(12, 18, 27, compact ? 148 : 178);
    const spireBase = groundTop - height * 0.02;
    const spireXs = [-0.42, -0.33, -0.2, -0.08, 0.06, 0.18, 0.32, 0.43];
    spireXs.forEach((ratio, index) => {
      const x = width * ratio;
      const towerWidth = width * (index % 3 === 0 ? 0.018 : 0.012);
      const towerHeight = height * (0.24 + (index % 4) * 0.055);
      graphics.rect(x - towerWidth / 2, spireBase, towerWidth, towerHeight);
      graphics.moveTo(x - towerWidth * 0.78, spireBase + towerHeight);
      graphics.lineTo(x, spireBase + towerHeight + height * (0.055 + (index % 2) * 0.026));
      graphics.lineTo(x + towerWidth * 0.78, spireBase + towerHeight);
      graphics.close();
    });
    graphics.fill();

    graphics.fillColor = rgba(6, 9, 14, compact ? 96 : 128);
    graphics.rect(-width / 2, height / 2 - height * 0.11, width, height * 0.11);
    graphics.rect(-width / 2, -height / 2, width, height * 0.08);
    graphics.fill();

    graphics.strokeColor = rgba(218, 156, 76, compact ? 44 : 62);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    for (let index = 0; index < 7; index += 1) {
      const laneY = groundTop - (index + 1) * height * 0.065;
      const inset = width * (0.18 + index * 0.042);
      graphics.moveTo(-width / 2 + inset, laneY - height * 0.01);
      graphics.bezierCurveTo(-width * 0.14, laneY + height * 0.018, width * 0.14, laneY - height * 0.016, width / 2 - inset, laneY + height * 0.012);
    }
    graphics.stroke();

    graphics.strokeColor = rgba(148, 47, 38, compact ? 48 : 68);
    graphics.lineWidth = Math.max(1, 0.9 * scale);
    for (let index = 0; index < 8; index += 1) {
      const crackX = -width * 0.42 + index * width * 0.12;
      const crackY = -height * 0.38 + (index % 3) * height * 0.04;
      graphics.moveTo(crackX, crackY);
      graphics.lineTo(crackX + width * 0.04, crackY + height * 0.035);
      graphics.lineTo(crackX + width * 0.08, crackY + height * 0.006);
    }
    graphics.stroke();

    graphics.fillColor = rgba(2, 4, 7, compact ? 116 : 78);
    graphics.ellipse(-width * 0.24, -height * 0.32, width * 0.22, Math.max(14 * scale, height * 0.048));
    graphics.ellipse(width * 0.24, -height * 0.29, width * 0.22, Math.max(14 * scale, height * 0.048));
    graphics.fill();
  }

  private drawBattleSceneAtmosphere(
    parent: Node,
    width: number,
    height: number,
    scale: number,
    presentation: LobbyBattlePresentationState,
    performanceProfile: BattleAdaptivePerformanceProfile,
  ): void {
    const shade = this.host.addChildPlainNode(parent, 'LobbyBattleSceneShade', 0, 0, width, height);
    const graphics = shade.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 34);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = presentation.phase === 'resultRecorded' ? rgba(255, 212, 116, 24) : rgba(0, 0, 0, 0);
    graphics.circle(width * 0.22, height * 0.16, Math.min(width, height) * 0.28);
    graphics.fill();
    // 金色闪电折线在实景上像悬浮划痕,移除。

    const ember = this.host.addChildPlainNode(parent, 'LobbyBattleSceneEmberMotion', width * 0.18, height * 0.06, 130 * scale, 130 * scale);
    const emberGraphics = ember.addComponent(Graphics);
    // 实景背景自带余烬氛围,装饰圈压到近不可见,避免像一个悬空的圆轮廓。
    emberGraphics.strokeColor = rgba(246, 172, 72, 16);
    emberGraphics.lineWidth = Math.max(1, 1.2 * scale);
    emberGraphics.circle(0, 0, 48 * scale);
    emberGraphics.stroke();
    const opacity = ember.addComponent(UIOpacity);
    opacity.opacity = performanceProfile.motionScale <= 0 ? 96 : 150;
    if (performanceProfile.motionScale <= 0) {
      return;
    }
    const motionScale = performanceProfile.motionScale;
    // 轻量 Tween 让全屏战斗页保持“正在演出”的动感，不改变后端战斗结果。
    tween(ember)
      .repeatForever(tween().by(1.8, { angle: 14 * motionScale }).to(1.8, { scale: new Vec3(1 + 0.08 * motionScale, 1 + 0.08 * motionScale, 1) }).to(1.8, { scale: Vec3.ONE }))
      .start();
    tween(opacity)
      .repeatForever(tween().to(1.1, { opacity: 150 + 65 * motionScale }).to(1.1, { opacity: 116 }))
      .start();
  }

  private drawBattleBackdrop(parent: Node, width: number, height: number, scale: number, presentation: LobbyBattlePresentationState): void {
    const node = this.host.addChildPlainNode(parent, 'LobbyBattleCinematicBackdrop', 0, 0, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = presentation.phase === 'resultRecorded' ? rgba(255, 217, 116, 28) : rgba(0, 0, 0, 0);
    graphics.circle(width * 0.16, height * 0.08, Math.min(width, height) * 0.2);
    graphics.fill();
    graphics.strokeColor = rgba(255, 226, 150, 24);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    for (let index = 0; index < 5; index += 1) {
      const x = -width * 0.34 + index * width * 0.17;
      graphics.moveTo(x, height * 0.22);
      graphics.lineTo(x + 34 * scale, height * 0.05);
      graphics.lineTo(x + 18 * scale, -height * 0.18);
    }
    graphics.stroke();
  }

  private drawFieldFrame(graphics: Graphics, width: number, height: number, scale: number): void {
    // 战场不再画任何框线:实景背景全幅呈现,矩形描边在重建刷新时会造成闪烁感。
    void graphics;
    void width;
    void height;
    void scale;
  }

  private drawDisabledButton(node: Node, width: number, height: number, scale: number): void {
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(24, 21, 18, 184);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(119, 91, 48, 148);
    graphics.lineWidth = Math.max(1, scale);
    graphics.stroke();
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 226 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeBattleOpeningConvergenceProgress(progress: number): number {
  const safe = clamp(progress, 0, 1);
  return safe * safe * (3 - 2 * safe);
}

function easeBattleActorMotionProgress(progress: number): number {
  const safe = clamp(progress, 0, 1);
  return 1 - Math.pow(1 - safe, 3);
}

function lerpVec3(from: Vec3, to: Vec3, progress: number): Vec3 {
  const safe = clamp(progress, 0, 1);
  return new Vec3(
    from.x + (to.x - from.x) * safe,
    from.y + (to.y - from.y) * safe,
    from.z + (to.z - from.z) * safe,
  );
}

function resolveBattleActorRootMotionPriority(kind: BattleActionPresentationCue['kind']): number {
  if (kind === 'basic_attack') {
    return 3;
  }
  if (kind === 'melee_move') {
    return 2;
  }
  if (kind === 'ranged_projectile') {
    return 1;
  }
  return 0;
}

function formatTimelineSeconds(timeMs: number): string {
  const seconds = Math.max(0, Math.round(timeMs / 100) / 10);
  return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
}

function formatBattleHudClock(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// 每日副本关卡码转玩家可读名(DAILY_FORGE_1 → 熔火矿脉 · 难度Ⅰ);主线码保持原样。
const DAILY_THEME_DISPLAY_NAMES: Record<string, string> = {
  AWAKEN: '觉醒之门',
  FORGE: '熔火矿脉',
  ARCANE: '秘法圣殿',
  ABYSS: '深渊裂隙',
};

function formatBattleStageDisplayName(stageCode: string | null | undefined): string {
  const value = (stageCode || '').trim().toUpperCase();
  const match = /^DAILY_([A-Z]+)_([1-3])$/.exec(value);
  if (match && DAILY_THEME_DISPLAY_NAMES[match[1]]) {
    return `${DAILY_THEME_DISPLAY_NAMES[match[1]]} · 难度${['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][Number(match[2])]}`;
  }
  return value;
}
