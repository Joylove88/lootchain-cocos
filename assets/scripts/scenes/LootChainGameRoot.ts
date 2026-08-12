import {
  _decorator,
  BlockInputEvents,
  Button,
  Color,
  Component,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Input,
  Label,
  Node,
  input,
  Size,
  Sprite,
  SpriteFrame,
  VideoClip,
  tween,
  UIOpacity,
  UITransform,
  VideoPlayer,
} from 'cc';
import { AppConfig } from '../app/AppConfig';
import { lootChainApi, LootChainApi } from '../api/LootChainApi';
import type { EquipmentItemVO } from '../api/EquipmentApi';
import { lootChainI18n, type LootChainLanguage } from '../i18n/LootChainI18n';
import type { PlayerLobbyProfileVO } from '../types/PlayerTypes';
import type { PlayerIdleSummaryVO } from '../types/IdleTypes';
import type { UserHeroDetailVO } from '../types/HeroTypes';
import { AdaptiveStageLayoutResolver, type AdaptiveStageLayoutHost } from './AdaptiveStageLayoutResolver';
import { StatusPresenter, type StatusPresenterHost } from './StatusPresenter';
import { UiContentRootController, type UiContentRootHost } from './UiContentRootController';
import { UiPrimitiveFactory, type ButtonVisualState, type UiPrimitiveFactoryHost } from './UiPrimitiveFactory';
import { renderSceneBackButton, type SceneBackButtonHost } from './UiSceneBackButton';
import {
  compactResourceValue as compactUiResourceValue,
  formatInteger as formatUiInteger,
  trimText as trimUiText,
} from './UiTextFormatter';
import { UiSpriteFrameCache, type UiSpriteFrameCacheHost, type UiSpriteFrameOverrides } from './UiSpriteFrameCache';
import { GachaSceneRenderer, type GachaPreviewResultMode, type GachaSceneHost, type GachaSceneState } from './gacha/GachaSceneRenderer';
import { GACHA_PREVIEW_POOLS, type GachaActionKey, type GachaPreviewPool, type GachaRarity } from './gacha/GachaSceneConfig';
import { LoginFlow, type LoginFlowHost } from './login/LoginFlow';
import {
  LoginRenderer,
  type LoginRendererHost,
} from './login/LoginRenderer';
import { ProtagonistCreateFlow, type ProtagonistCreateFlowHost } from './protagonist/ProtagonistCreateFlow';
import { ProtagonistCreateRenderer, type ProtagonistCreateRendererHost } from './protagonist/ProtagonistCreateRenderer';
import {
  LobbyBackgroundController,
  type LobbyBackgroundHost,
} from './lobby/LobbyBackgroundController';
import { LobbyAdventureState } from './lobby/LobbyAdventureState';
import { LobbyAdventurePanelRenderer, type LobbyAdventurePanelHost } from './lobby/LobbyAdventurePanelRenderer';
import { LobbyAvatarRenderer, type LobbyAvatarHost } from './lobby/LobbyAvatarRenderer';
import { LobbyBagLoader, type LobbyBagLoaderHost } from './lobby/LobbyBagLoader';
import { LobbyBagPanelRenderer, type LobbyBagPanelHost } from './lobby/LobbyBagPanelRenderer';
import { LobbyBattleFlow, type LobbyBattleFlowHost } from './lobby/LobbyBattleFlow';
import { LobbyBattlePreviewPanelRenderer, type LobbyBattlePreviewPanelHost } from './lobby/LobbyBattlePreviewPanelRenderer';
import { LobbyCodexState } from './lobby/LobbyCodexState';
import { LobbyCodexPanelRenderer, type LobbyCodexPanelHost } from './lobby/LobbyCodexPanelRenderer';
import { LobbyForgePanelRenderer, type LobbyForgePanelHost } from './lobby/LobbyForgePanelRenderer';
import { LobbyFormationPanelRenderer, type LobbyFormationPanelHost, type LobbyFormationPowerSnapshot } from './lobby/LobbyFormationPanelRenderer';
import { LobbyHeroDetailPanelRenderer, type LobbyHeroDetailPanelHost } from './lobby/LobbyHeroDetailPanelRenderer';
import { LobbyHeroRosterState } from './lobby/LobbyHeroRosterState';
import { LobbyHeroRosterPanelRenderer, type LobbyHeroRosterPanelHost } from './lobby/LobbyHeroRosterPanelRenderer';
import { LobbyHudRenderer, type LobbyHudHost } from './lobby/LobbyHudRenderer';
import type { UiLayout } from './lobby/LobbyHudTypes';
import { LobbyLoadingFlow, type LobbyLoadingFlowHost } from './lobby/LobbyLoadingFlow';
import { LobbyLoadingRenderer, type LobbyLoadingHost } from './lobby/LobbyLoadingRenderer';
import { LobbyNoticeState } from './lobby/LobbyNoticeState';
import { LobbyPanelLoader, type LobbyPanelLoaderHost } from './lobby/LobbyPanelLoader';
import { LobbyNoticePanelRenderer, type LobbyNoticePanelHost } from './lobby/LobbyNoticePanelRenderer';
import { LobbyDailyDungeonPanelRenderer, type LobbyDailyDungeonPanelHost } from './lobby/LobbyDailyDungeonPanelRenderer';
import type { LobbyDailyDungeonPanelState } from '../types/DailyDungeonTypes';
import { isDailyDungeonStageCode } from '../api/BattleApi';
import { LobbyProfileDialogRenderer, type LobbyProfileDialogHost } from './lobby/LobbyProfileDialogRenderer';
import { LobbyProfileLoader, type LobbyProfileLoaderHost } from './lobby/LobbyProfileLoader';
import { LobbySettingsPanelRenderer, type LobbySettingsPanelHost } from './lobby/LobbySettingsPanelRenderer';
import type { LobbyAdventurePanelState, LobbyAdventureStageVO } from '../types/LobbyAdventureTypes';
import type { LobbyBagPanelState } from '../types/BagTypes';
import type { LobbyBattlePanelState } from './lobby/LobbyBattleState';
import type { LobbyCodexPanelState } from '../types/LobbyCodexTypes';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../types/LobbyHeroTypes';
import type { PlayerBattleStartVO } from '../types/BattleTypes';
import type { LobbyNoticePanelState } from '../types/LobbyNoticeTypes';
import type { GachaDrawResultVO, GachaPoolVO } from '../types/GachaTypes';
import type { ProtagonistCreateFormState, ProtagonistForm, ProtagonistGender } from '../types/ProtagonistTypes';
import { LoginVideoBackground } from '../../resources/login-bg/scripts/login/LoginVideoBackground';

const { ccclass, property } = _decorator;

const ANNUAL_MAINLINE_TOTAL_STAGES = 393;
const FIRST_CHAPTER_STAGE_COUNT = 9;
const STAGES_PER_CHAPTER_AFTER_FIRST = 16;

type AsyncAction = () => Promise<void>;
type CursorDocument = { body?: { style?: { cursor: string } } };
type ViewName =
  | 'login'
  | 'loginAccount'
  | 'protagonistCreate'
  | 'loading'
  | 'lobby'
  | 'profile'
  | 'adventure'
  | 'bag'
  | 'battle'
  | 'codex'
  | 'forge'
  | 'formation'
  | 'heroes'
  | 'heroDetail'
  | 'notice'
  | 'dailyDungeon'
  | 'settings'
  | 'gacha'
  | 'gachaInfo'
  | 'gachaRecord'
  | 'gachaExchange'
  | 'gachaPoolContent'
  | 'gachaReveal'
  | 'gachaSummon'
  | 'gachaResult'
  | 'placeholder';
type LobbyPlaceholderDialogState = {
  title: string;
  detail: string;
};
type PendingGachaDraw = {
  ticket: number;
  mode: GachaPreviewResultMode;
  poolCode: string;
  drawCount: 1 | 10;
  requestId: string;
  result: GachaDrawResultVO | null;
  highestRarity: GachaRarity | null;
};

const LOGIN_SCENE_BACKGROUND_NODE_NAMES = [
  'Login_BG_Poster',
  'Login_BG_Video',
] as const;

const LOGIN_SCENE_LEGACY_NODE_NAMES = [
  'Audio_BGM',
  'BG_Main',
  'BG_Main-001',
  'BG_Main-002',
  'Sky_Effects',
  'Vortex_Center_Debug',
  'Sky_Mask',
  'Sky_MaskNew2',
  'Sky_MaskNew',
  'FG_Architecture',
  'Architecture_Edge_Shadow_Soft',
  'Architecture_Edge_Shadow_Tight',
  'Crystal_Effects',
  'Dragon_Layer',
  'Character_Effects',
  'Lightning_Particle',
  'Foreground_Effects',
] as const;

const LOGIN_SCENE_STAGE_NODE_NAMES = [...LOGIN_SCENE_BACKGROUND_NODE_NAMES, ...LOGIN_SCENE_LEGACY_NODE_NAMES] as const;

const LOBBY_BACKGROUND_NODE_NAMES = ['Lobby_BG_Poster', 'Lobby_BG_Video', 'Lobby_BG_Fallback'] as const;
// 场景页复用暂存单位(离开时整组摘下,回来内容签名不变则原样挂回)。
const LOBBY_HERO_ROSTER_REUSE_NODE_NAMES = ['LobbyHeroRosterDim', 'LobbyHeroRosterSceneContent'] as const;
const LOBBY_BAG_REUSE_NODE_NAMES = ['LobbyBagDim', 'LobbyBagSceneContent'] as const;

/**
 * Cocos 场景根组件。
 *
 * 这里只保留根职责：生命周期、视图切换、资源/资料调度，以及给各渲染模块提供 host wrapper。
 * 具体 UI 绘制、登录流程、loading 流程和背景控制都拆到独立模块，避免大厅代码继续堆在根组件里。
 */
@ccclass('LootChainGameRoot')
export class LootChainGameRoot extends Component {
  @property(SpriteFrame)
  logoFrame: SpriteFrame | null = null;

  @property(SpriteFrame)
  mainButtonFrame: SpriteFrame | null = null;

  @property([SpriteFrame])
  rightRailFrames: SpriteFrame[] = [];

  private readonly api: LootChainApi = lootChainApi;
  private readonly layoutResolver = new AdaptiveStageLayoutResolver(this as unknown as AdaptiveStageLayoutHost);
  private readonly statusPresenter = new StatusPresenter(this as unknown as StatusPresenterHost);
  private readonly contentRootController = new UiContentRootController(this as unknown as UiContentRootHost);
  private readonly uiSpriteFrameCache = new UiSpriteFrameCache(this as unknown as UiSpriteFrameCacheHost);
  private readonly uiPrimitiveFactory = new UiPrimitiveFactory(
    this as unknown as UiPrimitiveFactoryHost,
    this.uiSpriteFrameCache,
    () => this.uiSpriteFrameOverrides(),
  );
  private readonly gachaSceneRenderer = new GachaSceneRenderer(this as unknown as GachaSceneHost);
  private readonly loginFlow = new LoginFlow(this.api.auth, {
    apiBaseUrl: AppConfig.apiBaseUrl,
    defaultDevUserId: AppConfig.defaultDevUserId,
  }, this as unknown as LoginFlowHost);
  private readonly loginRenderer = new LoginRenderer(this as unknown as LoginRendererHost);
  private readonly protagonistCreateFlow = new ProtagonistCreateFlow(this.api.protagonist, this as unknown as ProtagonistCreateFlowHost);
  private readonly protagonistCreateRenderer = new ProtagonistCreateRenderer(this as unknown as ProtagonistCreateRendererHost);
  private readonly lobbyBackgroundController = new LobbyBackgroundController(this as unknown as LobbyBackgroundHost);
  private readonly lobbyAdventureState = new LobbyAdventureState();
  private readonly lobbyAdventureLoader = new LobbyPanelLoader(
    this.lobbyAdventureState,
    () => this.api.lobbyAdventure.lobbyAdventure(),
    (adventure) => this.lobbyAdventureState.applyLoaded(adventure),
    this as unknown as LobbyPanelLoaderHost,
    'lobby adventure',
  );
  private readonly lobbyAdventurePanelRenderer = new LobbyAdventurePanelRenderer(this as unknown as LobbyAdventurePanelHost);
  private readonly lobbyAvatarRenderer = new LobbyAvatarRenderer(this as unknown as LobbyAvatarHost);
  private readonly lobbyBagLoader = new LobbyBagLoader(this.api.bag, this.api.hero, this.api.equipment, this as unknown as LobbyBagLoaderHost);
  private readonly lobbyBagPanelRenderer = new LobbyBagPanelRenderer(this as unknown as LobbyBagPanelHost);
  private readonly lobbyBattleFlow = new LobbyBattleFlow(this.api.battle, this as unknown as LobbyBattleFlowHost);
  // 挂机收益(服务端权威):汇总快照 + 领取中标记 + 自动挑战开关(本地会话内)。
  private idleSummary: PlayerIdleSummaryVO | null = null;
  private idleSummaryLoading = false;
  private idleClaiming = false;
  private autoChallengeEnabled = false;
  private readonly lobbyBattlePreviewPanelRenderer = new LobbyBattlePreviewPanelRenderer(this as unknown as LobbyBattlePreviewPanelHost);
  private readonly lobbyHudRenderer = new LobbyHudRenderer(this as unknown as LobbyHudHost);
  private readonly lobbyLoadingFlow = new LobbyLoadingFlow(this as unknown as LobbyLoadingFlowHost);
  private readonly lobbyLoadingRenderer = new LobbyLoadingRenderer(this as unknown as LobbyLoadingHost);
  private readonly lobbyCodexState = new LobbyCodexState();
  private readonly lobbyCodexLoader = new LobbyPanelLoader(
    this.lobbyCodexState,
    () => this.api.lobbyCodex.lobbyCodex(),
    (items) => this.lobbyCodexState.applyLoaded(items),
    this as unknown as LobbyPanelLoaderHost,
    'lobby codex',
  );
  private readonly lobbyCodexPanelRenderer = new LobbyCodexPanelRenderer(this as unknown as LobbyCodexPanelHost);
  private readonly lobbyForgePanelRenderer = new LobbyForgePanelRenderer(this as unknown as LobbyForgePanelHost);
  private readonly lobbyFormationPanelRenderer = new LobbyFormationPanelRenderer(this as unknown as LobbyFormationPanelHost);
  private readonly lobbyHeroDetailPanelRenderer = new LobbyHeroDetailPanelRenderer(this as unknown as LobbyHeroDetailPanelHost);
  private readonly lobbyHeroRosterState = new LobbyHeroRosterState();
  private readonly lobbyHeroRosterLoader = new LobbyPanelLoader(
    this.lobbyHeroRosterState,
    async () => {
      // 职业筛选项失败不阻塞名单主体(与旧 LobbyHeroRosterLoader 同口径)。
      const [heroes, filterOptions] = await Promise.all([
        this.api.lobbyHero.lobbyHeroes(),
        this.api.lobbyHero.lobbyHeroFilterOptions().catch((error) => {
          console.warn('[LootChain] lobby hero class filter options load failed:', error);
          return { heroClasses: [] as string[] };
        }),
      ]);
      return { heroes, heroClasses: filterOptions.heroClasses };
    },
    (data) => this.lobbyHeroRosterState.applyLoaded(data.heroes, data.heroClasses),
    this as unknown as LobbyPanelLoaderHost,
    'lobby hero roster',
  );
  private readonly lobbyHeroRosterPanelRenderer = new LobbyHeroRosterPanelRenderer(this as unknown as LobbyHeroRosterPanelHost);
  private readonly lobbyNoticeState = new LobbyNoticeState();
  private readonly lobbyNoticeLoader = new LobbyPanelLoader(
    this.lobbyNoticeState,
    () => this.api.lobbyNotice.lobbyNotices(),
    (notices) => this.lobbyNoticeState.applyLoaded(notices),
    this as unknown as LobbyPanelLoaderHost,
    'lobby notices',
  );
  private readonly lobbyNoticePanelRenderer = new LobbyNoticePanelRenderer(this as unknown as LobbyNoticePanelHost);
  private readonly lobbyDailyDungeonPanelRenderer = new LobbyDailyDungeonPanelRenderer(this as unknown as LobbyDailyDungeonPanelHost);
  private lobbyDailyDungeonState: LobbyDailyDungeonPanelState = { loading: false, error: '', summary: null, version: 0 };
  private lobbyDailyDungeonTicket = 0;
  // 圣晶输出周榜(P金-1c):面板内弹窗按需拉取。
  private lobbyCrystalRankState: import('../types/DailyDungeonTypes').LobbyCrystalRankState = { loading: false, error: '', summary: null, version: 0 };
  private lobbyCrystalRankTicket = 0;
  private readonly lobbyProfileDialogRenderer = new LobbyProfileDialogRenderer(this as unknown as LobbyProfileDialogHost);
  private readonly lobbyProfileLoader = new LobbyProfileLoader(this.api.profile, AppConfig.defaultDevUserId, this as unknown as LobbyProfileLoaderHost);
  private readonly lobbySettingsPanelRenderer = new LobbySettingsPanelRenderer(this as unknown as LobbySettingsPanelHost);
  private currentView: ViewName = 'login';
  private layoutKey = '';
  private lobbyProfileOpen = false;
  private lobbyAdventurePanelOpen = false;
  private lobbyBagPanelOpen = false;
  private lobbyBattlePreviewPanelOpen = false;
  private lobbyCodexPanelOpen = false;
  private lobbyForgePanelOpen = false;
  private lobbyFormationPanelOpen = false;
  private lobbyHeroDetailHeroId: number | null = null;
  // 英雄详情页签(参考图):属性(默认)/装备/技能/升星。
  private lobbyHeroDetailTab: 'attr' | 'equip' | 'skill' | 'star' = 'attr';
  private lobbyHeroLevelUpBusyId: number | null = null;
  // 洗练弹窗状态:打开标记 + 锁定词条 id 集合(user_hero_attr.id);切换英雄/关闭详情时重置。
  private lobbyHeroRefineDialogOpen = false;
  // 终极技能升级弹窗(P6)。
  private lobbyHeroUltimateDialogOpen = false;
  private lobbyHeroUltimateBusy = false;
  private lobbyHeroRefineBusyId: number | null = null;
  private readonly lobbyHeroRefineLockedIds = new Set<number>();
  // 弹窗期间发生过洗练:关闭弹窗时整刷一次同步底层词条卡/战力(平时只做弹窗级局部刷新)。
  private lobbyHeroRefineDirty = false;
  // 装备弹窗状态(装备一期):打开标记/选中部位/装备列表缓存/请求中标记/弹窗期间是否穿卸过。
  private lobbyHeroEquipDialogOpen = false;
  private lobbyHeroEquipSelectedSlot: string | null = null;
  // 装备候选方块网格选中件(纯前端展示态,切部位/开弹窗/离开详情时重置)。
  private lobbyHeroWearSelectedEquipId: number | null = null;
  private lobbyHeroEquipBusy = false;
  private lobbyHeroEquipDirty = false;
  private lobbyEquipmentItems: EquipmentItemVO[] = [];
  private lobbyEquipmentLoading = false;
  // 合成弹窗(装备 2.0 P2):开关 + 概率石开关。
  private lobbyEquipFuseDialogOpen = false;
  private lobbyEquipFuseUseLuckStone = false;
  // 强化弹窗(装备 2.0 P3):目标装备 + 祝福石/护符开关。
  private lobbyEquipEnhanceTargetId: number | null = null;
  private lobbyEquipEnhanceUseBless = false;
  private lobbyEquipEnhanceUseGuard = false;
  // 锻造工坊(选项卡版):页签 / 强化台装备 / 合成三槽 / 分解多选与筛选 / 合成结果弹窗。
  private lobbyForgeTab: 'enhance' | 'fuse' | 'decompose' | 'gem' = 'enhance';
  // 宝石页选中装备(P5)+ 镶嵌选择弹窗目标孔位。
  private lobbyForgeGemEquipId: number | null = null;
  private lobbyForgeGemPickSlot: number | null = null;
  private lobbyForgeEnhanceSlotId: number | null = null;
  // 强化页(参考图版):部位页签 / 稀有度筛选(下拉) / 排序方向 / 连续强化勾选。
  private lobbyForgeEnhanceSlotTab: string | null = null;
  private lobbyForgeEnhanceRarity: string | null = null;
  private lobbyForgeEnhanceFilterOpen = false;
  private lobbyForgeEnhanceSortAsc = false;
  private lobbyForgeAutoRepeat = false;
  private lobbyForgeFuseSlotIds: number[] = [];
  private lobbyForgeFuseResult: { success: boolean; chance: number; item: EquipmentItemVO } | null = null;
  private lobbyForgeDecomposeResult: { count: number; stonesGained: number; blessGained: number; runeGained: number; gemsGained: string[] } | null = null;
  // 分解页「批量分解设置」弹窗开关。
  private lobbyForgeDecomposeBatchOpen = false;
  private lobbyForgeRerollOpen = false;
  private readonly lobbyForgeDecomposeSelectedIds = new Set<number>();
  private lobbyForgeDecomposeRarity: string | null = null;
  private lobbyForgeDecomposeEnhance: 'all' | 'zero' | 'plus' = 'all';
  // 英雄详情接口数据(升级消耗等只读扩展字段);按 heroId 校验有效性,避免跨英雄串数据。
  private lobbyHeroDetailData: UserHeroDetailVO | null = null;
  private lobbyHeroDetailLoading = false;
  private lobbyHeroRosterPanelOpen = false;
  private lobbyNoticePanelOpen = false;
  private lobbyDailyDungeonPanelOpen = false;
  private lobbySettingsPanelOpen = false;
  private loginLanguageDialogOpen = false;
  private lobbyPlaceholderDialog: LobbyPlaceholderDialogState | null = null;
  private gachaResultMode: GachaPreviewResultMode | null = null;
  private pendingGachaDraw: PendingGachaDraw | null = null;
  private gachaSummonRarity: GachaRarity | null = null;
  private gachaSummonTicket = 0;
  private gachaConfigRefreshElapsed = 0;
  private gachaSceneState: GachaSceneState = {
    loading: false,
    drawing: false,
    error: null,
    pools: GACHA_PREVIEW_POOLS,
    selectedPoolCode: GACHA_PREVIEW_POOLS[0]?.id ?? null,
    pity: [],
    poolDetail: null,
    poolDetailLoading: false,
    poolDetailError: '',
    logs: [],
    logsLoading: false,
    logsError: '',
    lastDrawResult: null,
    activeAction: null,
  };
  private selectedLobbyStageCode: string | null = null;
  private selectedLobbyFormationHeroIds: number[] = [];
  // 阵容持久化:登录后从服务端拉一次已保存阵容做还原;之后本地为准并在每次变更后回写。
  private lobbyFormationServerLoaded = false;
  private lobbyFormationSaveInFlight = false;
  private lobbyFormationSavePending = false;
  // 场景页复用:面板内容签名;签名不变且有暂存节点时原样挂回免重建。
  private lobbyHeroRosterReuseSignature: string | null = null;
  private lobbyBagReuseSignature: string | null = null;
  private reusableScenesRegistered = false;

  start(): void {
    // 登录验收必须从真实点击开始，避免历史 token 让预览直接进入通过态。
    this.api.auth.logout();
    this.currentView = 'login';
    this.preloadUiSprites();
    input.on(Input.EventType.MOUSE_DOWN, this.tryPlayLobbyVideo, this);
    input.on(Input.EventType.TOUCH_START, this.tryPlayLobbyVideo, this);
    this.renderCurrentView();
  }

  update(deltaTime: number): void {
    const nextKey = this.makeLayoutKey();
    if (this.layoutKey && this.layoutKey !== nextKey) {
      this.renderCurrentView();
    }
    this.updateGachaConfigRefresh(deltaTime);
    this.updateLobbyPosterFade(deltaTime);
  }

  onDestroy(): void {
    input.off(Input.EventType.MOUSE_DOWN, this.tryPlayLobbyVideo, this);
    input.off(Input.EventType.TOUCH_START, this.tryPlayLobbyVideo, this);
    this.loginFlow.cancel();
    this.protagonistCreateFlow.cancel();
    this.lobbyLoadingFlow.cancel();
    this.lobbyAdventureLoader.cancel();
    this.lobbyBagLoader.cancel();
    this.lobbyBattleFlow.cancel();
    this.lobbyCodexLoader.cancel();
    this.lobbyHeroRosterLoader.cancel();
    this.lobbyNoticeLoader.cancel();
    this.lobbyProfileLoader.cancel();
    this.releaseLobbyVideoRuntime();
  }

  private renderCurrentView(): void {
    // 所有视图入口集中在这里，resize 或状态变化时按 currentView 重绘。
    if (this.currentView === 'lobby') {
      if (this.lobbyBackgroundController.isRendered()) {
        this.refreshLobbyViewPreservingBackground();
        return;
      }
      this.renderLobby();
      return;
    }
    if (this.currentView === 'battle') {
      this.renderBattleScene();
      return;
    }
    if (this.currentView === 'gacha') {
      this.renderGachaScene();
      return;
    }
    if (this.currentView === 'gachaReveal') {
      this.renderGachaRevealScene();
      return;
    }
    if (this.currentView === 'gachaSummon') {
      this.renderGachaSummonVideoScene();
      return;
    }
    if (this.currentView === 'gachaResult') {
      this.renderGachaResultScene();
      return;
    }
    if (this.isGachaActionSceneView(this.currentView)) {
      this.renderGachaActionScene();
      return;
    }
    if (this.isLobbyScenePageView(this.currentView)) {
      this.renderLobbyScenePage();
      return;
    }
    if (this.currentView === 'loading') {
      this.renderLoading();
      return;
    }
    if (this.currentView === 'protagonistCreate') {
      this.renderProtagonistCreate();
      return;
    }
    if (this.currentView === 'loginAccount') {
      this.renderLoginAccountScene();
      return;
    }
    this.renderLogin();
  }

  private renderLogin(): void {
    this.currentView = 'login';
    this.invalidateReusableScenes();
    const layout = this.renderBase();
    this.loginRenderer.renderLogin(layout);
    this.renderLoginLanguageDialog(layout);
  }

  private renderLoginAccountScene(): void {
    this.currentView = 'loginAccount';
    this.loginLanguageDialogOpen = false;
    const layout = this.renderBase();
    this.loginRenderer.renderLoginAccountScene(layout, {
      agreementAccepted: this.loginFlow.agreementAccepted,
      defaultDevUserId: this.loginFlow.defaultDevUserId,
    });
  }

  private renderLoginLanguageDialog(layout: UiLayout): void {
    if (!this.loginLanguageDialogOpen) {
      return;
    }
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageBottom + layout.stageTop) / 2;
    const dim = this.addRect('LoginLanguageDialogDim', centerX, centerY, layout.width, layout.height, new Color(0, 0, 0, 184));
    dim.node.addComponent(BlockInputEvents);
    dim.node.addComponent(Button);
    dim.node.on(Button.EventType.CLICK, () => this.closeLoginLanguageDialog());

    const panelWidth = Math.min(layout.stageWidth - 40 * scale, 460 * scale);
    const panelHeight = 320 * scale;
    const panel = this.addBeveledPanelNode(
      'LoginLanguageDialogPanel',
      centerX,
      centerY,
      panelWidth,
      panelHeight,
      new Color(13, 11, 10, 244),
      new Color(204, 158, 80, 230),
      18 * scale,
    );
    panel.addComponent(BlockInputEvents);

    const closeButton = this.addChildBeveledPanelNode(
      panel,
      'LoginLanguageDialogClose',
      panelWidth / 2 - 34 * scale,
      panelHeight / 2 - 32 * scale,
      42 * scale,
      32 * scale,
      new Color(34, 25, 24, 238),
      new Color(204, 158, 80, 210),
      8 * scale,
    );
    closeButton.addComponent(Button);
    closeButton.on(Button.EventType.CLICK, () => this.closeLoginLanguageDialog());
    this.applyImageButtonFeedback(closeButton, 1.04, 0.96);
    this.addChildLabel(closeButton, 'CloseLabel', 'X', 0, 0, 20 * scale, new Color(245, 210, 122), new Size(38 * scale, 24 * scale));

    const title = this.addChildLabel(
      panel,
      'LoginLanguageDialogTitle',
      lootChainI18n.t('language.title'),
      0,
      panelHeight / 2 - 58 * scale,
      28 * scale,
      new Color(245, 210, 122),
      new Size(panelWidth - 96 * scale, 40 * scale),
    );
    title.enableOutline = true;
    title.outlineColor = new Color(0, 0, 0, 220);
    title.outlineWidth = Math.max(1, 1.5 * scale);

    const subtitle = this.addChildLabel(
      panel,
      'LoginLanguageDialogSubtitle',
      lootChainI18n.t('language.subtitle'),
      0,
      panelHeight / 2 - 96 * scale, 19 * scale,
      new Color(196, 178, 138),
      new Size(panelWidth - 80 * scale, 28 * scale),
    );
    subtitle.overflow = Label.Overflow.SHRINK;

    const currentLanguage = lootChainI18n.currentLanguage();
    this.renderLoginLanguageOption(panel, 'zh-CN', -56 * scale, currentLanguage, panelWidth, scale);
    this.renderLoginLanguageOption(panel, 'en-US', -126 * scale, currentLanguage, panelWidth, scale);

    this.addChildLabel(
      panel,
      'LoginLanguageDialogTip',
      '点击空白关闭',
      0,
      -panelHeight / 2 + 26 * scale, 16 * scale,
      new Color(132, 119, 94),
      new Size(panelWidth - 70 * scale, 22 * scale),
    );
  }

  private renderLoginLanguageOption(
    panel: Node,
    language: LootChainLanguage,
    y: number,
    currentLanguage: LootChainLanguage,
    panelWidth: number,
    scale: number,
  ): void {
    const selected = language === currentLanguage;
    const optionWidth = panelWidth - 92 * scale;
    const option = this.addChildBeveledPanelNode(
      panel,
      `LoginLanguageOption_${language}`,
      0,
      y,
      optionWidth,
      52 * scale,
      selected ? new Color(61, 44, 19, 242) : new Color(23, 18, 17, 238),
      selected ? new Color(245, 210, 122, 238) : new Color(119, 91, 54, 210),
      10 * scale,
    );
    option.addComponent(Button);
    option.on(Button.EventType.CLICK, () => this.selectLoginLanguage(language));
    this.applyImageButtonFeedback(option, 1.02, 0.98);

    const labelKey = language === 'zh-CN' ? 'language.simplifiedChinese' : 'language.english';
    this.addChildLabel(
      option,
      'LanguageName',
      lootChainI18n.t(labelKey),
      -optionWidth / 2 + 24 * scale,
      0, 20 * scale,
      new Color(238, 218, 166),
      new Size(optionWidth - 76 * scale, 32 * scale),
      HorizontalTextAlignment.LEFT,
    );
    if (selected) {
      this.addChildLabel(
        option,
        'SelectedMark',
        lootChainI18n.t('language.current'),
        optionWidth / 2 - 74 * scale,
        0, 17 * scale,
        new Color(245, 210, 122),
        new Size(116 * scale, 28 * scale),
      );
    }
  }

  private renderLoading(): void {
    this.currentView = 'loading';
    this.invalidateReusableScenes();
    const layout = this.renderBase();
    this.lobbyLoadingRenderer.render(layout, this.lobbyLoadingFlow.state);
  }

  private renderProtagonistCreate(): void {
    this.currentView = 'protagonistCreate';
    const layout = this.renderBase();
    this.protagonistCreateRenderer.render(layout, this.protagonistCreateFlow.currentState());
  }

  private renderLobby(): void {
    this.currentView = 'lobby';
    const layout = this.renderBase();
    // 大厅只保留主界面 HUD；功能入口统一进入独立逻辑场景，不再作为弹框覆盖大厅。
    this.renderLobbyBackground(layout);
    this.renderLobbyHud(layout);
  }

  private renderBattleScene(): void {
    this.currentView = 'battle';
    const layout = this.renderBase();
    // 战斗从大厅弹框升级为全屏逻辑视图，但仍复用现有 no-reward battle flow。
    this.renderLobbyBattlePreviewPanel(layout);
  }

  private renderGachaScene(): void {
    this.currentView = 'gacha';
    const layout = this.renderBase();
    // 抽奖页读取后端卡池展示配置；真实抽卡只通过已有 gacha draw 接口触发。
    this.gachaSceneRenderer.render(layout, this.gachaSceneState);
  }

  private renderGachaRevealScene(): void {
    this.currentView = 'gachaReveal';
    const layout = this.renderBase();
    // 召唤演出同样只消费本地 mock 数据，不生成 drawNo、不扣资源、不发奖。
    this.gachaSceneRenderer.renderRevealScene(layout, this.gachaResultMode ?? 'once');
  }

  private renderGachaSummonVideoScene(): void {
    this.currentView = 'gachaSummon';
    const layout = this.renderBase();
    this.gachaSceneRenderer.renderSummonVideoScene(layout, this.gachaResultMode ?? 'once', this.gachaSummonRarity);
  }

  private renderGachaResultScene(): void {
    this.currentView = 'gachaResult';
    const layout = this.renderBase();
    this.gachaSceneRenderer.renderResultScene(layout, this.gachaResultMode ?? 'once', this.gachaSceneState);
  }

  private renderGachaActionScene(): void {
    const action = this.gachaActionForView(this.currentView);
    if (!action) {
      this.currentView = 'gacha';
      this.renderGachaScene();
      return;
    }
    const layout = this.renderBase();
    this.gachaSceneRenderer.renderActionScene(layout, this.gachaSceneState, action);
  }

  private renderLobbyScenePage(): void {
    const layout = this.renderBase();
    // 大厅功能入口必须切换到独立全屏逻辑场景，不再把内容浮在大厅背景/HUD 上。
    this.renderLobbyFeatureSceneBackdrop(layout);
    if (this.currentView === 'profile') {
      this.renderPlayerProfileDialog(layout);
      return;
    }
    if (this.currentView === 'adventure') {
      this.renderLobbyAdventurePanel(layout);
      return;
    }
    if (this.currentView === 'bag') {
      this.renderLobbyBagPanel(layout);
      return;
    }
    if (this.currentView === 'codex') {
      this.renderLobbyCodexPanel(layout);
      return;
    }
    if (this.currentView === 'forge') {
      this.renderLobbyForgePanel(layout);
      return;
    }
    if (this.currentView === 'formation') {
      this.renderLobbyFormationPanel(layout);
      return;
    }
    if (this.currentView === 'heroes') {
      this.renderLobbyHeroRosterPanel(layout);
      return;
    }
    if (this.currentView === 'heroDetail') {
      this.renderLobbyHeroDetailPanel(layout);
      return;
    }
    if (this.currentView === 'notice') {
      this.renderLobbyNoticePanel(layout);
      return;
    }
    if (this.currentView === 'dailyDungeon') {
      this.renderLobbyDailyDungeonPanel(layout);
      return;
    }
    if (this.currentView === 'settings') {
      this.renderLobbySettingsPanel(layout);
      return;
    }
    if (this.currentView === 'placeholder') {
      this.renderLobbyPlaceholderDialog(layout);
    }
  }

  private renderLobbyHud(layout: UiLayout): void {
    this.lobbyHudRenderer.render(layout);
  }

  private refreshLobbyOverlay(): void {
    if (this.isLobbyScenePageView(this.currentView)) {
      this.renderCurrentView();
      return;
    }
    if (this.currentView !== 'lobby') {
      return;
    }
    // 大厅态只刷新 HUD；功能页已经独立成逻辑场景，会走整页重绘。
    const layout = this.resolveLayout();
    this.applyRootSize(layout);
    this.setPointerCursor(false);
    this.resizeLobbyBackground(layout);
    this.rerenderLobbyOverlay(layout);
  }

  private refreshLobbyViewPreservingBackground(): void {
    if (this.currentView !== 'lobby') {
      return;
    }
    // 资源补帧或窗口尺寸变化时保留现有背景视频，只重排背景尺寸和 HUD 覆盖层。
    const layout = this.resolveLayout();
    this.applyRootSize(layout);
    this.setPointerCursor(false);
    this.resizeLobbyBackground(layout);
    this.rerenderLobbyOverlay(layout);
  }

  private rerenderLobbyOverlay(layout: UiLayout): void {
    this.removeNodeFromContent('LobbyAtmosphereOverlay');
    this.removeNodeFromContent('LobbyPlayerInfoButton');
    this.removeNodeFromContent('LobbyResourceBar');
    this.removeNodeFromContent('LobbySystemIcons');
    this.removeNodeFromContent('LobbyActivityRail');
    this.removeNodeFromContent('LobbySceneHotspots');
    this.removeNodeFromContent('LobbyGoalTracker');
    this.removeNodeFromContent('LobbyCompactGoalTracker');
    this.removeNodeFromContent('LobbyMicroGoalChip');
    this.removeNodeFromContent('LobbyChallengeRail');
    this.removeNodeFromContent('LobbyBottomHud');
    this.removeNodeFromContent('LobbyCompactActionEntrances');
    this.removeNodeFromContent('LobbyCompactSceneEntrances');
    this.removeLobbyAdventurePanel();
    this.removeLobbyBagPanel();
    this.removeLobbyBattlePreviewPanel();
    this.removeLobbyCodexPanel();
    this.removeLobbyForgePanel();
    this.removeLobbyFormationPanel();
    this.removeLobbyHeroDetailPanel();
    this.removeLobbyHeroRosterPanel();
    this.removeLobbyNoticePanel();
    this.removeLobbyDailyDungeonPanel();
    this.removeLobbySettingsPanel();
    this.removePlayerProfileDialog();
    this.removeLobbyPlaceholderDialog();
    this.renderLobbyHud(layout);
    this.layoutKey = this.makeLayoutKey();
  }

  private renderPlayerProfileDialog(layout: UiLayout): void {
    this.lobbyProfileDialogRenderer.render(layout);
  }

  private renderLobbyForgePanel(layout: UiLayout): void {
    this.lobbyForgePanelRenderer.render(layout);
  }

  private renderLobbyAdventurePanel(layout: UiLayout): void {
    this.lobbyAdventurePanelRenderer.render(layout);
  }

  private renderLobbyBagPanel(layout: UiLayout): void {
    this.ensureReusableScenesRegistered();
    const signature = `${this.makeReusableLayoutKey()}|${this.lobbyBagPanelRenderer.currentContentSignature()}`;
    if (this.lobbyBagReuseSignature === signature
      && this.contentRootController.restoreNodes(LOBBY_BAG_REUSE_NODE_NAMES)) {
      return;
    }
    this.contentRootController.dropStashed(LOBBY_BAG_REUSE_NODE_NAMES);
    this.lobbyBagPanelRenderer.render(layout);
    this.lobbyBagReuseSignature = signature;
  }

  private renderLobbyBattlePreviewPanel(layout: UiLayout): void {
    this.lobbyBattlePreviewPanelRenderer.render(layout);
  }

  private renderLobbyCodexPanel(layout: UiLayout): void {
    this.lobbyCodexPanelRenderer.render(layout);
  }

  private renderLobbyFormationPanel(layout: UiLayout): void {
    this.lobbyFormationPanelRenderer.render(layout);
  }

  private renderLobbyHeroDetailPanel(layout: UiLayout): void {
    this.lobbyHeroDetailPanelRenderer.render(layout);
  }

  private renderLobbyHeroRosterPanel(layout: UiLayout): void {
    this.ensureReusableScenesRegistered();
    // 场景页复用:内容签名(仅几何+语言,不含无关的全局面板/加载版本状态) + 面板自身内容签名(筛选+英雄数据)。
    // 注意不能用 this.layoutKey——它把所有面板开合与各 loader.version 都揉进去了,逛一次背包就会变,导致永不命中复用。
    const signature = `${this.makeReusableLayoutKey()}|${this.lobbyHeroRosterPanelRenderer.currentContentSignature()}`;
    if (this.lobbyHeroRosterReuseSignature === signature
      && this.contentRootController.restoreNodes(LOBBY_HERO_ROSTER_REUSE_NODE_NAMES)) {
      return;
    }
    this.contentRootController.dropStashed(LOBBY_HERO_ROSTER_REUSE_NODE_NAMES);
    this.lobbyHeroRosterPanelRenderer.render(layout);
    this.lobbyHeroRosterReuseSignature = signature;
  }

  // 场景页复用专用布局键:只含影响面板排版的几何量与语言,不含全局面板开合/加载版本等无关状态。
  // 另计入 UI 图加载代数:异步图加载完会触发 renderCurrentView,若签名不含它会命中复用挂回缺图旧树(道具图标黑块);
  // 计入后补图那一帧签名必变→强制重建补上图标,图全部就位后代数稳定→复用照常生效。
  private makeReusableLayoutKey(): string {
    const layout = this.resolveLayout();
    const geo = `${Math.round(layout.width)}x${Math.round(layout.height)}`;
    const stage = `${Math.round(layout.stageLeft)},${Math.round(layout.stageBottom)},${Math.round(layout.stageWidth)}x${Math.round(layout.stageHeight)}`;
    const viewport = `${Math.round(layout.viewportWidth)}x${Math.round(layout.viewportHeight)}`;
    return `${geo}:${stage}:${viewport}:${lootChainI18n.currentLanguage()}:asset${this.uiSpriteFrameCache.getLoadGeneration()}`;
  }

  private ensureReusableScenesRegistered(): void {
    if (this.reusableScenesRegistered) {
      return;
    }
    this.reusableScenesRegistered = true;
    // 登记后,这些顶层节点在任何销毁路径(clear/clearExcept/removeNode)都改为摘下暂存而非销毁。
    this.contentRootController.registerReusableNodes(LOBBY_HERO_ROSTER_REUSE_NODE_NAMES);
    this.contentRootController.registerReusableNodes(LOBBY_BAG_REUSE_NODE_NAMES);
  }

  private renderLobbyNoticePanel(layout: UiLayout): void {
    this.lobbyNoticePanelRenderer.render(layout);
  }

  private renderLobbySettingsPanel(layout: UiLayout): void {
    this.lobbySettingsPanelRenderer.render(layout);
  }

  private renderLobbyPlaceholderDialog(layout: UiLayout): void {
    const dialog = this.lobbyPlaceholderDialog;
    if (!dialog) {
      return;
    }
    const scale = Math.max(0.7, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelWidth = Math.max(280 * scale, layout.stageWidth);
    const panelHeight = Math.max(220 * scale, layout.stageHeight);

    // 未开放入口以独立全屏逻辑场景承载，只给本地反馈，不承载任何跳转、领取、购买或经济写入逻辑。
    const scene = this.addRect('LobbyPlaceholderSceneRoot', centerX, centerY, layout.width, layout.height, new Color(0, 0, 0, 178));
    scene.node.addComponent(BlockInputEvents);

    const panel = this.addBeveledPanelNode(
      'LobbyPlaceholderScenePanel',
      centerX,
      centerY,
      panelWidth,
      panelHeight,
      new Color(8, 7, 9, 232),
      new Color(185, 138, 58, 220),
      16 * scale,
    );
    // 场景页本体阻挡输入事件，避免内容区点击穿透到底层大厅。
    panel.addComponent(BlockInputEvents);
    const titleLabel = this.addChildLabel(
      panel,
      'LobbyPlaceholderTitle',
      dialog.title,
      0,
      panelHeight / 2 - 48 * scale,
      26 * scale,
      new Color(247, 222, 165),
      new Size(panelWidth - 58 * scale, 38 * scale),
    );
    titleLabel.overflow = Label.Overflow.SHRINK;
    titleLabel.enableOutline = true;
    titleLabel.outlineColor = new Color(0, 0, 0, 215);
    titleLabel.outlineWidth = Math.max(1, 1.4 * scale);

    const subtitle = this.addChildLabel(
      panel,
      'LobbyPlaceholderSubtitle',
      this.placeholderSubtitle(dialog.title, dialog.detail),
      0,
      panelHeight / 2 - 88 * scale,
      21 * scale,
      new Color(218, 170, 76),
      new Size(panelWidth - 72 * scale, 30 * scale),
    );
    subtitle.overflow = Label.Overflow.SHRINK;

    const detail = this.addChildLabel(
      panel,
      'LobbyPlaceholderDetail',
      dialog.detail,
      0,
      0, 20 * scale,
      new Color(210, 196, 166),
      new Size(panelWidth - 74 * scale, Math.max(58 * scale, panelHeight - 202 * scale)),
    );
    detail.lineHeight = 27 * scale;
    detail.overflow = Label.Overflow.RESIZE_HEIGHT;

    if (panelHeight >= 230 * scale) {
      const boundary = this.addChildLabel(
        panel,
        'LobbyPlaceholderBoundaryNote',
        this.placeholderBoundaryNote(dialog.detail),
        0,
        -panelHeight / 2 + 84 * scale, 17 * scale,
        new Color(168, 146, 104),
        new Size(panelWidth - 80 * scale, 26 * scale),
      );
      boundary.overflow = Label.Overflow.SHRINK;
    }

    renderSceneBackButton(
      this as unknown as SceneBackButtonHost,
      panel,
      layout,
      'LobbyPlaceholderBackButton',
      () => this.closeLobbyPlaceholderDialog(),
      scale,
      dialog.title,
    );
  }

  private placeholderSubtitle(title: string, detail: string): string {
    if (title.startsWith('资源：')) {
      return '只读/占位资源';
    }
    if (detail.includes('聊天系统')) {
      return '本地聊天预览';
    }
    if (detail.includes('系统入口')) {
      return '系统入口占位';
    }
    if (detail.includes('战斗') || detail.includes('结算')) {
      return '玩法未开放';
    }
    return '功能暂未开放';
  }

  private placeholderBoundaryNote(detail: string): string {
    if (detail.includes('只读')) {
      return '当前仅展示资料，不提供任何增减入口。';
    }
    return '当前仅本地展示，不跳转、不发奖、不写入经济数据。';
  }

  private isLobbyScenePageView(view: ViewName): boolean {
    return view === 'profile'
      || view === 'adventure'
      || view === 'bag'
      || view === 'codex'
      || view === 'forge'
      || view === 'formation'
      || view === 'heroes'
      || view === 'heroDetail'
      || view === 'notice'
      || view === 'dailyDungeon'
      || view === 'settings'
      || view === 'placeholder';
  }

  /**
   * 统一重置集(2026-08-12 批5):关闭全部大厅功能页/弹窗标志,openXxx 一律先清再立自己的标志。
   * 刻意不含 lobbyDailyDungeonPanelOpen——它要跨战斗预演存活(结算后据此回到限时副本面板),
   * 只在 openLobbyDailyDungeonPanel 自立、returnToLobbyFromScenePage 显式清除。
   */
  private closeAllLobbyScenePanelFlags(): void {
    this.lobbyAdventurePanelOpen = false;
    this.lobbyBagPanelOpen = false;
    this.lobbyForgePanelOpen = false;
    this.lobbyBattlePreviewPanelOpen = false;
    this.lobbyCodexPanelOpen = false;
    this.lobbyFormationPanelOpen = false;
    this.lobbyHeroDetailHeroId = null;
    this.lobbyHeroRosterPanelOpen = false;
    this.lobbyNoticePanelOpen = false;
    this.lobbyProfileOpen = false;
    this.lobbySettingsPanelOpen = false;
    this.lobbyPlaceholderDialog = null;
  }

  private returnToLobbyFromScenePage(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyDailyDungeonPanelOpen = false;
    this.currentView = 'lobby';
    this.renderCurrentView();
  }

  private renderCurrentLobbyScenePage(): void {
    if (this.isLobbyScenePageView(this.currentView)) {
      this.renderCurrentView();
    }
  }






























  private openPlayerProfileDialog(): void {
    if (this.lobbyProfileOpen && this.currentView === 'profile') {
      return;
    }
    this.closeAllLobbyScenePanelFlags();
    this.lobbyProfileOpen = true;
    this.currentView = 'profile';
    this.renderCurrentView();
  }

  private closePlayerProfileDialog(): void {
    if (!this.lobbyProfileOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removePlayerProfileDialog(): void {
    this.removeNodeFromContent('LobbyProfileDim');
    this.removeNodeFromContent('LobbyProfilePanel');
    this.removeNodeFromContent('LobbyProfileSceneRoot');
    this.removeNodeFromContent('LobbyProfileSceneContent');
  }

  private openLobbyAdventurePanel(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyAdventurePanelOpen = true;
    this.currentView = 'adventure';
    this.renderCurrentView();
    void this.loadLobbyAdventure();
    void this.loadLobbyBattleRecent();
    void this.loadLobbyHeroRoster();
  }

  private closeLobbyAdventurePanel(): void {
    if (!this.lobbyAdventurePanelOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyAdventurePanel(): void {
    this.removeNodeFromContent('LobbyAdventureDim');
    this.removeNodeFromContent('LobbyAdventurePanel');
    this.removeNodeFromContent('LobbyAdventureSceneContent');
  }

  private reloadLobbyAdventure(): void {
    void this.loadLobbyAdventure(true);
    void this.loadLobbyBattleRecent(true);
  }

  private currentLobbyAdventureState(): LobbyAdventurePanelState {
    return this.lobbyAdventureLoader.currentState();
  }

  private openLobbyBagPanel(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyBagPanelOpen = true;
    this.currentView = 'bag';
    this.renderCurrentView();
    void this.loadLobbyBag();
  }

  private closeLobbyBagPanel(): void {
    if (!this.lobbyBagPanelOpen) {
      return;
    }
    this.lobbyBagComposeResult = null;
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyBagPanel(): void {
    this.removeNodeFromContent('LobbyBagDim');
    this.removeNodeFromContent('LobbyBagSceneContent');
    this.removeNodeFromContent('LobbyBagSceneFrame');
  }

  private reloadLobbyBag(): void {
    void this.loadLobbyBag(true);
  }

  private currentLobbyEquipmentItems(): EquipmentItemVO[] {
    return this.lobbyEquipmentItems;
  }

  private currentLobbyBagState(): LobbyBagPanelState {
    return this.lobbyBagLoader.currentState();
  }

  // ===== 锻造工坊(导航栏"锻造",装备养成集中页) =====
  // 强化/合成走英雄详情同源 mutation;分解/合成支持按具体装备 id 批量提交;本页无英雄上下文,穿卸仍走英雄详情。
  private openLobbyForgePanel(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyForgePanelOpen = true;
    // 清掉英雄详情装备弹窗残留状态,锻造页从干净状态进入(默认强化页签)。
    this.lobbyHeroEquipDialogOpen = false;
    this.lobbyHeroEquipSelectedSlot = null;
    this.lobbyHeroWearSelectedEquipId = null;
    this.lobbyHeroUltimateDialogOpen = false;
    this.lobbyEquipFuseDialogOpen = false;
    this.lobbyEquipFuseUseLuckStone = false;
    this.lobbyEquipEnhanceTargetId = null;
    this.lobbyEquipEnhanceUseBless = false;
    this.lobbyEquipEnhanceUseGuard = false;
    this.lobbyForgeTab = 'enhance';
    this.lobbyForgeEnhanceSlotId = null;
    this.lobbyForgeEnhanceSlotTab = null;
    this.lobbyForgeEnhanceRarity = null;
    this.lobbyForgeEnhanceFilterOpen = false;
    this.lobbyForgeEnhanceSortAsc = false;
    this.lobbyForgeAutoRepeat = false;
    this.lobbyForgeFuseSlotIds = [];
    this.lobbyForgeFuseResult = null;
    this.lobbyForgeDecomposeResult = null;
    this.lobbyForgeRerollOpen = false;
    this.lobbyForgeDecomposeSelectedIds.clear();
    this.lobbyForgeDecomposeRarity = null;
    this.lobbyForgeDecomposeEnhance = 'all';
    this.currentView = 'forge';
    this.renderCurrentView();
    void this.loadLobbyEquipmentList();
    void this.loadLobbyForgeBag();
  }

  private currentLobbyForgeState(): {
    tab: 'enhance' | 'fuse' | 'decompose' | 'gem';
    enhanceSlotId: number | null;
    enhanceSlotTab: string | null;
    enhanceRarity: string | null;
    enhanceFilterOpen: boolean;
    enhanceSortAsc: boolean;
    autoRepeat: boolean;
    fuseSlotIds: number[];
    fuseResult: { success: boolean; chance: number; item: EquipmentItemVO } | null;
    decomposeResult: { count: number; stonesGained: number; blessGained: number; runeGained: number; gemsGained: string[] } | null;
    rerollOpen: boolean;
    decomposeSelectedIds: number[];
    decomposeRarity: string | null;
    decomposeEnhance: 'all' | 'zero' | 'plus';
    decomposeBatchOpen: boolean;
    gemEquipId: number | null;
    gemPickSlot: number | null;
  } {
    return {
      tab: this.lobbyForgeTab,
      enhanceSlotId: this.lobbyForgeEnhanceSlotId,
      enhanceSlotTab: this.lobbyForgeEnhanceSlotTab,
      enhanceRarity: this.lobbyForgeEnhanceRarity,
      enhanceFilterOpen: this.lobbyForgeEnhanceFilterOpen,
      enhanceSortAsc: this.lobbyForgeEnhanceSortAsc,
      autoRepeat: this.lobbyForgeAutoRepeat,
      fuseSlotIds: [...this.lobbyForgeFuseSlotIds],
      fuseResult: this.lobbyForgeFuseResult,
      decomposeResult: this.lobbyForgeDecomposeResult,
      rerollOpen: this.lobbyForgeRerollOpen,
      decomposeSelectedIds: [...this.lobbyForgeDecomposeSelectedIds],
      decomposeRarity: this.lobbyForgeDecomposeRarity,
      decomposeEnhance: this.lobbyForgeDecomposeEnhance,
      decomposeBatchOpen: this.lobbyForgeDecomposeBatchOpen,
      gemEquipId: this.lobbyForgeGemEquipId,
      gemPickSlot: this.lobbyForgeGemPickSlot,
    };
  }

  // ---- 强化页(参考图版)交互:部位页签/稀有度筛选/排序/连续强化 ----
  private setLobbyForgeEnhanceSlotTab(slot: string | null): void {
    this.lobbyForgeEnhanceSlotTab = slot;
    this.lobbyForgeEnhanceFilterOpen = false;
    this.renderCurrentView();
  }

  private setLobbyForgeEnhanceRarity(quality: string | null): void {
    this.lobbyForgeEnhanceRarity = quality;
    this.lobbyForgeEnhanceFilterOpen = false;
    this.renderCurrentView();
  }

  private toggleLobbyForgeEnhanceFilterMenu(): void {
    this.lobbyForgeEnhanceFilterOpen = !this.lobbyForgeEnhanceFilterOpen;
    this.renderCurrentView();
  }

  private toggleLobbyForgeEnhanceSort(): void {
    this.lobbyForgeEnhanceSortAsc = !this.lobbyForgeEnhanceSortAsc;
    this.renderCurrentView();
  }

  private toggleLobbyForgeAutoRepeat(): void {
    this.lobbyForgeAutoRepeat = !this.lobbyForgeAutoRepeat;
    this.renderCurrentView();
  }

  // 关闭合成结果弹窗(确定按钮)。
  private openLobbyForgeRerollDialog(): void {
    this.lobbyForgeRerollOpen = true;
    this.renderCurrentView();
  }

  private closeLobbyForgeRerollDialog(): void {
    this.lobbyForgeRerollOpen = false;
    this.renderCurrentView();
  }

  private rerollLobbyForgeEquipment(equipmentId: number): void {
    void this.runLobbyEquipReroll(equipmentId);
  }

  // 词条洗练(2.0 P4):洗练石+金币整件重roll;弹窗保持打开,回读后直接看到新词条。
  private async runLobbyEquipReroll(equipmentId: number): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    // 已穿戴装备洗练会改战力:按穿戴英雄记录前值,回读后飘差值(浮字须在最后整刷之后)。
    const equipHeroId = this.lobbyEquipmentItems.find((item) => item.id === equipmentId)?.heroId ?? null;
    const beforePower = this.lobbyHeroPowerById(equipHeroId);
    let powerDelta = 0;
    this.lobbyHeroEquipBusy = true;
    this.renderCurrentView();
    try {
      const result = await this.api.equipment.reroll(equipmentId);
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyBag(true);
      await this.loadLobbyProfile(this.currentLobbyProfile().userId);
      await this.loadLobbyHeroRoster(true);
      powerDelta = this.lobbyHeroPowerById(equipHeroId) - beforePower;
      const names = (result.item.specialAffixes ?? []).map((affix) => `${affix.special ? '★' : ''}${affix.name}+${affix.value}${affix.percent ? '%' : ''}`).join(' / ');
      this.setStatus(`洗练完成：${result.item.equipName} → ${names || '无词条'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`洗练失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      this.renderCurrentView();
      this.spawnPowerDeltaFloat(powerDelta);
    }
  }

  private clearLobbyForgeDecomposeResult(): void {
    this.lobbyForgeDecomposeResult = null;
    this.renderCurrentView();
  }

  private clearLobbyForgeFuseResult(): void {
    this.lobbyForgeFuseResult = null;
    this.renderCurrentView();
  }

  private selectLobbyForgeTab(tab: 'enhance' | 'fuse' | 'decompose' | 'gem'): void {
    this.lobbyForgeTab = tab;
    if (tab !== 'gem') {
      this.lobbyForgeGemEquipId = null;
    }
    this.lobbyForgeGemPickSlot = null;
    this.renderCurrentView();
  }

  private selectLobbyForgeGemEquip(equipmentId: number | null): void {
    this.lobbyForgeGemEquipId = equipmentId;
    this.lobbyForgeGemPickSlot = null;
    this.renderCurrentView();
  }

  private setLobbyForgeGemPickSlot(slotIndex: number | null): void {
    this.lobbyForgeGemPickSlot = slotIndex;
    this.renderCurrentView();
  }

  private socketLobbyForgeGem(equipmentId: number, slotIndex: number, gemCode: string): void {
    void this.runLobbyForgeGemOp(() => this.api.equipment.gemSocket(equipmentId, slotIndex, gemCode), equipmentId, '镶嵌');
  }

  private unsocketLobbyForgeGem(equipmentId: number, slotIndex: number): void {
    void this.runLobbyForgeGemOp(() => this.api.equipment.gemUnsocket(equipmentId, slotIndex), equipmentId, '拆卸');
  }

  // 宝石镶嵌/拆卸共用流:busy 防抖 → 提交 → 回读装备/背包/花名册(战力变化)→ 浮字。
  private async runLobbyForgeGemOp(op: () => Promise<unknown>, equipmentId: number, verb: string): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const equipHeroId = this.lobbyEquipmentItems.find((item) => item.id === equipmentId)?.heroId ?? null;
    const beforePower = this.lobbyHeroPowerById(equipHeroId);
    let powerDelta = 0;
    this.lobbyHeroEquipBusy = true;
    this.renderCurrentView();
    try {
      await op();
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyBag(true);
      await this.loadLobbyProfile(this.currentLobbyProfile().userId);
      await this.loadLobbyHeroRoster(true);
      powerDelta = this.lobbyHeroPowerById(equipHeroId) - beforePower;
      this.setStatus(`宝石${verb}完成。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`宝石${verb}失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      this.lobbyForgeGemPickSlot = null;
      this.renderCurrentView();
      this.spawnPowerDeltaFloat(powerDelta);
    }
  }

  private selectLobbyForgeEnhanceSlot(equipmentId: number | null): void {
    this.lobbyForgeEnhanceSlotId = equipmentId;
    this.renderCurrentView();
  }

  // 合成三槽:整组替换(点分组行/一键放入/清空都走这里),最多 3 件。
  private setLobbyForgeFuseSlots(equipmentIds: number[]): void {
    this.lobbyForgeFuseSlotIds = equipmentIds.slice(0, 3);
    this.renderCurrentView();
  }

  private fuseLobbyForgeSelected(): void {
    void this.runLobbyForgeFuse();
  }

  private async runLobbyForgeFuse(): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const ids = this.lobbyForgeFuseSlotIds.filter((id) =>
      this.lobbyEquipmentItems.some((item) => item.id === id && item.heroId == null));
    if (ids.length < 3) {
      this.setStatus('铸造台需放入 3 件同部位同稀有度的未穿戴装备。');
      return;
    }
    this.lobbyHeroEquipBusy = true;
    this.renderCurrentView();
    let flash: { ok: boolean; text: string } | null = null;
    try {
      const result = await this.api.equipment.fuse(ids, this.lobbyEquipFuseUseLuckStone);
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyBag(true);
      // 弹结果框(展示新装备/返还件),闪光作为辅助氛围。
      this.lobbyForgeFuseResult = { success: result.success, chance: result.chance, item: result.resultItem };
      if (result.success) {
        this.setStatus(`合成成功！获得「${result.resultItem.equipName}」（成功率 ${Math.round(result.chance * 100)}%）。`);
        flash = { ok: true, text: `合成成功 · ${result.resultItem.equipName}` };
      } else {
        this.setStatus(`合成失败（成功率 ${Math.round(result.chance * 100)}%），返还「${result.resultItem.equipName}」×1。`);
        flash = { ok: false, text: '合成失败 · 材料返还 1 件' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`合成失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      // 材料已消耗(成功得新件/失败返还 1 件均为新 id),清空三槽再重绘。
      this.lobbyForgeFuseSlotIds = [];
      this.renderCurrentView();
      if (flash && this.currentView === 'forge') {
        this.lobbyForgePanelRenderer.spawnForgeFlash(flash.ok, flash.text);
      }
    }
  }

  // 装备所属英雄的当前战力(花名册权威数据);heroId 为空(未穿戴)返回 0,浮字自然不弹。
  private lobbyHeroPowerById(heroId: number | null): number {
    if (heroId == null) {
      return 0;
    }
    return this.lobbyHeroRosterLoader.currentState().heroes.find((hero) => hero.id === heroId)?.power ?? 0;
  }

  // 自动强化:连续强化直到失败/满级/材料不足,期间沿用当前祝福石/护符开关(每次尝试都会消耗)。
  private autoEnhanceLobbyEquipment(equipmentId: number): void {
    void this.runLobbyEquipAutoEnhance(equipmentId);
  }

  private async runLobbyEquipAutoEnhance(equipmentId: number): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const startLevel = this.lobbyEquipmentItems.find((item) => item.id === equipmentId)?.enhanceLevel ?? 0;
    if (startLevel >= 20) {
      this.setStatus('该装备已达强化上限 +20。');
      return;
    }
    const equipHeroId = this.lobbyEquipmentItems.find((item) => item.id === equipmentId)?.heroId ?? null;
    const beforePower = this.lobbyHeroPowerById(equipHeroId);
    this.lobbyHeroEquipBusy = true;
    this.renderCurrentView();
    let flash: { ok: boolean; text: string } | null = null;
    let finalLevel = startLevel;
    let attempts = 0;
    try {
      // 单轮最多 20 次尝试兜底,防止服务器异常回执导致死循环。
      while (attempts < 20) {
        attempts += 1;
        const result = await this.api.equipment.enhance(equipmentId, this.lobbyEquipEnhanceUseBless, this.lobbyEquipEnhanceUseGuard);
        finalLevel = result.levelAfter;
        if (!result.success) {
          flash = { ok: false, text: `自动强化在 +${result.levelBefore} 失败 · 停在 +${result.levelAfter}` };
          break;
        }
        if (result.levelAfter >= 20) {
          flash = { ok: true, text: `自动强化完成 · 已满级 +${result.levelAfter}` };
          break;
        }
      }
      if (!flash) {
        flash = { ok: true, text: `自动强化 · +${startLevel} → +${finalLevel}` };
      }
      this.setStatus(`自动强化结束：+${startLevel} → +${finalLevel}（尝试 ${attempts} 次）。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`自动强化中断（+${startLevel} → +${finalLevel}）：${message}`);
      if (finalLevel !== startLevel) {
        flash = { ok: finalLevel > startLevel, text: `自动强化中断 · +${startLevel} → +${finalLevel}` };
      }
    } finally {
      try {
        this.lobbyEquipmentItems = await this.api.equipment.list();
        await this.loadLobbyBag(true);
        await this.loadLobbyHeroRoster(true);
        this.lobbyHeroEquipDirty = true;
      } catch (error) {
        console.warn('[LootChain] auto enhance refresh failed:', error);
      }
      this.lobbyHeroEquipBusy = false;
      this.renderCurrentView();
      this.spawnPowerDeltaFloat(this.lobbyHeroPowerById(equipHeroId) - beforePower);
      if (flash && this.currentView === 'forge') {
        this.lobbyForgePanelRenderer.spawnForgeFlash(flash.ok, flash.text);
      }
    }
  }

  private toggleLobbyForgeDecomposeSelect(equipmentId: number): void {
    if (this.lobbyForgeDecomposeSelectedIds.has(equipmentId)) {
      this.lobbyForgeDecomposeSelectedIds.delete(equipmentId);
    } else {
      if (this.lobbyForgeDecomposeSelectedIds.size >= 20) {
        this.setStatus('单次最多分解 20 件。');
        return;
      }
      this.lobbyForgeDecomposeSelectedIds.add(equipmentId);
    }
    this.renderCurrentView();
  }

  private setLobbyForgeDecomposeRarity(quality: string | null): void {
    this.lobbyForgeDecomposeRarity = quality;
    this.renderCurrentView();
  }

  private setLobbyForgeDecomposeBatchOpen(open: boolean): void {
    this.lobbyForgeDecomposeBatchOpen = open;
    this.renderCurrentView();
  }

  private setLobbyForgeDecomposeEnhance(filter: 'all' | 'zero' | 'plus'): void {
    this.lobbyForgeDecomposeEnhance = filter;
    this.renderCurrentView();
  }

  // 一键全选:替换为渲染层传入的"当前筛选可见"id 集(上限 20);空数组=清空。
  private setLobbyForgeDecomposeSelection(equipmentIds: number[]): void {
    this.lobbyForgeDecomposeSelectedIds.clear();
    equipmentIds.slice(0, 20).forEach((id) => this.lobbyForgeDecomposeSelectedIds.add(id));
    if (equipmentIds.length > 20) {
      this.setStatus('单次最多分解 20 件,已选中前 20 件。');
    }
    this.renderCurrentView();
  }

  private decomposeLobbyForgeSelected(): void {
    void this.runLobbyForgeDecompose();
  }

  private async runLobbyForgeDecompose(): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const ids = [...this.lobbyForgeDecomposeSelectedIds].filter((id) =>
      this.lobbyEquipmentItems.some((item) => item.id === id && item.heroId == null));
    if (ids.length <= 0) {
      this.setStatus('请先勾选要分解的未穿戴装备。');
      return;
    }
    this.lobbyHeroEquipBusy = true;
    this.renderCurrentView();
    try {
      const result = await this.api.equipment.decompose(ids);
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyBag(true);
      this.setStatus(`分解完成：${result.count} 件 → 强化石 ×${this.formatInteger(result.stonesGained)}。`);
      // 分解结果改弹窗展示(获得明细+已拥有),替代原中央闪光。
      this.lobbyForgeDecomposeResult = {
        count: result.count,
        stonesGained: Number(result.stonesGained) || 0,
        blessGained: Number(result.blessGained) || 0,
        runeGained: Number(result.runeGained) || 0,
        gemsGained: result.gemsGained ?? [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`分解失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      this.lobbyForgeDecomposeSelectedIds.clear();
      this.renderCurrentView();
    }
  }

  // 锻造页材料持有栏依赖背包数据:读取完成后若仍在锻造页则重绘补数字。
  private async loadLobbyForgeBag(): Promise<void> {
    await this.loadLobbyBag();
    if (this.currentView === 'forge') {
      this.renderCurrentView();
    }
  }

  private closeLobbyForgePanel(): void {
    if (!this.lobbyForgePanelOpen) {
      return;
    }
    this.lobbyEquipEnhanceTargetId = null;
    this.lobbyEquipFuseUseLuckStone = false;
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyForgePanel(): void {
    this.removeNodeFromContent('LobbyForgeSceneContent');
  }

  // 召唤跳过动画偏好(localStorage 持久化,跨会话记忆)。
  private gachaSkipAnimation = ((): boolean => {
    try {
      return globalThis.localStorage?.getItem('lootchain.gachaSkipAnimation') === '1';
    } catch (error) {
      return false;
    }
  })();

  private isGachaSkipAnimationEnabled(): boolean {
    return this.gachaSkipAnimation;
  }

  private toggleGachaSkipAnimation(): void {
    this.gachaSkipAnimation = !this.gachaSkipAnimation;
    try {
      globalThis.localStorage?.setItem('lootchain.gachaSkipAnimation', this.gachaSkipAnimation ? '1' : '0');
    } catch (error) {
      // 本地存储不可用时仅本会话生效。
    }
    this.setStatus(this.gachaSkipAnimation ? '已开启跳过召唤动画。' : '已关闭跳过召唤动画。');
    this.renderCurrentView();
  }

  private lobbyBagActionBusy = false;

  private useLobbyBagItem(itemCode: string): void {
    void this.runLobbyBagUse(itemCode);
  }

  // 使用道具:服务器结算效果(金币/钻石/体力/礼包/材料箱),回读背包+资料;弹窗保持打开看新数量。
  private async runLobbyBagUse(itemCode: string): Promise<void> {
    if (this.lobbyBagActionBusy) {
      this.setStatus('背包操作处理中，请勿重复点击。');
      return;
    }
    this.lobbyBagActionBusy = true;
    let rewardMessages: string[] = [];
    try {
      const result = await this.api.bag.use(itemCode, 1);
      rewardMessages = result.effectMessages ?? [];
      await this.loadLobbyBag(true);
      await this.loadLobbyProfile(this.currentLobbyProfile().userId);
      this.setStatus(`使用成功：${rewardMessages.join('、') || itemCode}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`使用失败：${message}`);
    } finally {
      this.lobbyBagActionBusy = false;
      this.renderCurrentView();
      // 获得内容飘字(必须在整刷之后;挂持久浮层不受重绘清理)。
      this.spawnRewardFloats(rewardMessages);
    }
  }

  // 合成弹窗状态:选中源材料 + 组数(渲染器据此画数量选择与前后对比)+ 合成结果弹窗。
  private lobbyBagComposeItemCode: string | null = null;
  private lobbyBagComposeResult: { sourceCode: string; usedCount: number; targetCode: string; gainedCount: number } | null = null;
  private lobbyBagComposeTimes = 1;

  private currentLobbyBagComposeState(): { itemCode: string | null; times: number } {
    return { itemCode: this.lobbyBagComposeItemCode, times: this.lobbyBagComposeTimes };
  }

  private currentLobbyBagComposeResult(): { sourceCode: string; usedCount: number; targetCode: string; gainedCount: number } | null {
    return this.lobbyBagComposeResult;
  }

  private clearLobbyBagComposeResult(): void {
    this.lobbyBagComposeResult = null;
    this.renderCurrentView();
  }

  private openLobbyBagComposeDialog(itemCode: string): void {
    this.lobbyBagComposeItemCode = itemCode;
    this.lobbyBagComposeTimes = 1;
    this.renderCurrentView();
  }

  private closeLobbyBagComposeDialog(): void {
    this.lobbyBagComposeItemCode = null;
    this.renderCurrentView();
  }

  private setLobbyBagComposeTimes(times: number): void {
    this.lobbyBagComposeTimes = Math.max(1, Math.min(500, Math.trunc(times) || 1));
    this.renderCurrentView();
  }

  private composeLobbyBagItem(itemCode: string, times: number): void {
    void this.runLobbyBagCompose(itemCode, times);
  }

  private async runLobbyBagCompose(itemCode: string, times: number): Promise<void> {
    if (this.lobbyBagActionBusy) {
      this.setStatus('背包操作处理中，请勿重复点击。');
      return;
    }
    this.lobbyBagActionBusy = true;
    try {
      const result = await this.api.bag.compose(itemCode, times);
      this.lobbyBagComposeItemCode = null;
      await this.loadLobbyBag(true);
      // 合成结果改弹窗展示(产物/消耗/已拥有),状态栏保留摘要。
      this.lobbyBagComposeResult = result;
      const names: Record<string, string> = { ENHANCE_STONE_HIGH: '高阶强化石', ENHANCE_STONE: '强化石' };
      this.setStatus(`合成完成：消耗 ×${this.formatInteger(result.usedCount)} → ${names[result.targetCode] ?? result.targetCode} ×${this.formatInteger(result.gainedCount)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`合成失败：${message}`);
    } finally {
      this.lobbyBagActionBusy = false;
      this.renderCurrentView();
    }
  }

  private clearLobbyBagSelection(): void {
    this.lobbyBagComposeItemCode = null;
    this.lobbyBagLoader.clearSelection();
  }

  private selectLobbyBagItem(itemCode: string): void {
    if (!this.lobbyBagLoader.selectItem(itemCode)) {
      this.setStatus('该道具不在当前背包列表中。');
      return;
    }
    void this.loadLobbyBagItemSource(itemCode);
  }

  private reloadLobbyBagItemSource(itemCode: string): void {
    void this.loadLobbyBagItemSource(itemCode, true);
  }

  private selectLobbyAdventureStage(stageCode: string): void {
    const resolvedStageCode = this.resolveLobbyStageCode(stageCode);
    if (!resolvedStageCode) {
      this.rejectInvalidLobbyStageSelection();
      return;
    }
    const stage = this.findLobbyAdventureStage(resolvedStageCode);
    if (!stage) {
      this.setStatus('该主线关卡暂不可选，请刷新爬塔面板。');
      return;
    }
    if (!this.canOpenLobbyBattleEntryStage(stage)) {
      this.previewLockedLobbyAdventureStage(resolvedStageCode);
      return;
    }
    // 只保存本地本次关卡选择，让详情、编队和战斗预览保持同一目标；不写入主线进度。
    this.selectedLobbyStageCode = resolvedStageCode;
    this.setStatus(`已选择 ${stage.stageName}，可进入编队确认。`);
    if (this.currentView === 'adventure' && this.lobbyAdventurePanelOpen) {
      this.renderCurrentView();
    }
  }

  private previewLockedLobbyAdventureStage(stageCode: string): void {
    const resolvedStageCode = this.resolveLobbyStageCode(stageCode);
    if (!resolvedStageCode) {
      this.rejectInvalidLobbyStageSelection();
      return;
    }
    const stage = this.findLobbyAdventureStage(resolvedStageCode);
    if (!stage) {
      this.setStatus('该主线关卡暂不可选，请刷新爬塔面板。');
      return;
    }
    if (this.canOpenLobbyBattleEntryStage(stage)) {
      this.selectLobbyAdventureStage(resolvedStageCode);
      return;
    }
    // 锁定或未进入本地白名单的关卡只写入预览选择，编队/战斗入口会再次拦截。
    this.selectedLobbyStageCode = resolvedStageCode;
    const reason = stage.unlocked ? '当前仅预览，不会进入编队。' : '尚未解锁，当前只展示预告，不会进入编队。';
    this.setStatus(`${stage.stageName} ${reason}`);
    if (this.currentView === 'adventure' && this.lobbyAdventurePanelOpen) {
      this.renderCurrentView();
    }
  }

  private openLobbyBattlePreviewPanel(stageCode: string): void {
    const resolvedStageCode = this.resolveLobbyStageCode(stageCode);
    if (!resolvedStageCode) {
      this.rejectInvalidLobbyStageSelection();
      return;
    }
    const stage = this.findLobbyAdventureStage(resolvedStageCode);
    if (!stage) {
      this.setStatus('该主线关卡暂不可选，请刷新爬塔面板。');
      this.openLobbyAdventurePanel();
      return;
    }
    if (!this.canOpenLobbyBattleEntryStage(stage)) {
      this.previewLockedLobbyAdventureStage(resolvedStageCode);
      this.openLobbyAdventurePanel();
      return;
    }
    const reuseExistingBattleState = this.isLobbyBattleFlowBusyForStage(resolvedStageCode);
    const fillDefaultFormationForDirectChallenge = this.currentView !== 'formation';
    this.selectedLobbyStageCode = resolvedStageCode;
    if (!reuseExistingBattleState) {
      this.lobbyBattleFlow.prepare(this.selectedLobbyStageCode);
    }
    this.closeAllLobbyScenePanelFlags();
    this.lobbyBattlePreviewPanelOpen = true;
    this.removePlayerProfileDialog();
    this.removeLobbyAdventurePanel();
    this.removeLobbyBagPanel();
    this.removeLobbyCodexPanel();
    this.removeLobbyForgePanel();
    this.removeLobbyFormationPanel();
    this.removeLobbyHeroDetailPanel();
    this.removeLobbyHeroRosterPanel();
    this.removeLobbyNoticePanel();
    this.removeLobbyPlaceholderDialog();
    this.removeLobbyBattlePreviewPanel();
    this.currentView = 'battle';
    this.renderBattleScene();
    this.prefetchLobbyBattleFormationSpineAssets();
    const startStageCode = resolvedStageCode;
    if (reuseExistingBattleState) {
      return;
    }
    void this.loadLobbyHeroRoster().then(() => {
      if (this.currentView !== 'battle' || !this.lobbyBattlePreviewPanelOpen || this.selectedLobbyStageCode !== startStageCode || this.isLobbyBattleFlowBusyForStage(startStageCode)) {
        return;
      }
      if (fillDefaultFormationForDirectChallenge) {
        this.fillLobbyFormationWithDefaultHeroes();
      }
      this.startLobbyBattleSession();
    });
  }

  private closeLobbyBattlePreviewPanel(): void {
    if (!this.lobbyBattlePreviewPanelOpen) {
      return;
    }
    this.lobbyBattlePreviewPanelOpen = false;
    this.lobbyFormationPanelOpen = true;
    this.currentView = 'formation';
    this.renderCurrentView();
  }

  private removeLobbyBattlePreviewPanel(): void {
    this.removeNodeFromContent('LobbyBattlePreviewDim');
    this.removeNodeFromContent('LobbyBattlePreviewPanel');
    this.removeNodeFromContent('LobbyBattleSceneRoot');
  }

  private refreshLobbyBattlePreviewPanel(): void {
    if (!this.lobbyBattlePreviewPanelOpen) {
      return;
    }
    if (this.currentView === 'battle') {
      const battleState = this.currentLobbyBattleState();
      if (battleState.start && !battleState.presentationComplete && this.lobbyBattlePreviewPanelRenderer.canRefreshPlayback()) {
        this.refreshLobbyBattlePresentationPlayback();
      } else {
        this.renderBattleScene();
      }
      return;
    }
    if (this.currentView !== 'lobby') {
      return;
    }
    this.removeLobbyBattlePreviewPanel();
    this.renderLobbyBattlePreviewPanel(this.resolveLayout());
    this.layoutKey = this.makeLayoutKey();
  }

  private refreshLobbyBattlePresentationPlayback(): void {
    if (!this.lobbyBattlePreviewPanelOpen || this.currentView !== 'battle') {
      return;
    }
    const battleState = this.currentLobbyBattleState();
    if (battleState.start && !battleState.presentationComplete && this.lobbyBattlePreviewPanelRenderer.canRefreshPlayback()) {
      this.lobbyBattlePreviewPanelRenderer.refreshPlayback(this.resolveLayout());
      return;
    }
    this.renderBattleScene();
  }

  private currentLobbyBattleState(): LobbyBattlePanelState {
    return this.lobbyBattleFlow.currentState();
  }

  private isLobbyBattleFlowBusyForStage(stageCode: string): boolean {
    const state = this.lobbyBattleFlow.currentState();
    return state.stageCode === stageCode && (state.starting || !!state.start || state.settling || !!state.settlement);
  }

  private startLobbyBattleSession(): void {
    if (!this.selectedLobbyStageCode) {
      this.rejectInvalidLobbyStageSelection();
      return;
    }
    const stage = this.findLobbyAdventureStage(this.selectedLobbyStageCode);
    if (!this.canOpenLobbyBattleEntryStage(stage)) {
      this.previewLockedLobbyAdventureStage(this.selectedLobbyStageCode);
      this.openLobbyAdventurePanel();
      return;
    }
    this.reconcileLobbyFormationSelection();
    void this.lobbyBattleFlow.start(this.selectedLobbyStageCode);
  }

  private settleLobbyBattleSession(): void {
    this.lobbyBattleFlow.completePresentationEarlyAndSettle();
  }

  private returnToLobbyFromBattlePreview(): void {
    const lastBattleStageCode = this.selectedLobbyStageCode ?? '';
    // 回到大厅时结束战斗表现计时，并回读只读大厅数据，保证闭环后的 HUD 与入口状态是最新快照。
    this.lobbyBattlePreviewPanelOpen = false;
    this.lobbyFormationPanelOpen = false;
    this.lobbyBattleFlow.cancel(true);
    this.currentView = 'lobby';
    this.removeLobbyBattlePreviewPanel();
    this.removeLobbyFormationPanel();
    this.renderLobby();
    this.refreshLobbyReadonlyStateAfterBattle();
    if (this.lobbyDailyDungeonPanelOpen && isDailyDungeonStageCode(lastBattleStageCode)) {
      // 从每日副本战斗归来直接回到副本面板并刷新剩余次数。
      this.openLobbyDailyDungeonPanel();
    }
  }

  private openLobbyCodexPanel(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyCodexPanelOpen = true;
    this.currentView = 'codex';
    this.renderCurrentView();
    void this.loadLobbyCodex();
  }

  // 布阵来源:从英雄界面进入时隐藏底部三按钮(刷新/去升级/战斗预演),只做纯布阵。
  private lobbyFormationOrigin: 'roster' | null = null;

  private isLobbyFormationFooterHidden(): boolean {
    return this.lobbyFormationOrigin === 'roster';
  }

  private openLobbyFormationPanel(stageCode?: string, origin?: string): void {
    this.lobbyFormationOrigin = origin === 'roster' ? 'roster' : null;
    // 英雄面板「布阵」等无关卡上下文的入口:回落当前选中关,再回落服务端推荐/最后解锁关。
    const requestedStageCode = stageCode ?? this.selectedLobbyStageCode ?? this.resolveDefaultLobbyFormationStageCode() ?? undefined;
    const resolvedStageCode = this.resolveLobbyStageCode(requestedStageCode);
    if (!resolvedStageCode) {
      this.rejectInvalidLobbyStageSelection();
      return;
    }
    const stage = this.findLobbyAdventureStage(resolvedStageCode);
    if (!stage) {
      this.setStatus('该主线关卡暂不可选，请刷新爬塔面板。');
      this.openLobbyAdventurePanel();
      return;
    }
    if (!this.canOpenLobbyBattleEntryStage(stage)) {
      this.previewLockedLobbyAdventureStage(resolvedStageCode);
      this.openLobbyAdventurePanel();
      return;
    }
    // 编队入口也重复校验 unlock，防止未来 UI 误把锁定关卡传进来。
    this.selectedLobbyStageCode = resolvedStageCode;
    this.closeAllLobbyScenePanelFlags();
    this.lobbyFormationPanelOpen = true;
    this.currentView = 'formation';
    this.renderCurrentView();
    void this.loadLobbyHeroRoster();
  }

  private closeLobbyFormationPanel(): void {
    if (!this.lobbyFormationPanelOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyFormationPanel(): void {
    this.removeNodeFromContent('LobbyFormationDim');
    this.removeNodeFromContent('LobbyFormationPanel');
    this.removeNodeFromContent('LobbyFormationSceneContent');
  }

  private closeLobbyCodexPanel(): void {
    if (!this.lobbyCodexPanelOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyCodexPanel(): void {
    this.removeNodeFromContent('LobbyCodexDim');
    this.removeNodeFromContent('LobbyCodexPanel');
    this.removeNodeFromContent('LobbyCodexSceneContent');
  }

  private reloadLobbyCodex(): void {
    void this.loadLobbyCodex(true);
  }

  private currentLobbyCodexState(): LobbyCodexPanelState {
    return this.lobbyCodexLoader.currentState();
  }

  private openLobbyHeroRosterPanel(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyHeroRosterPanelOpen = true;
    this.currentView = 'heroes';
    this.renderCurrentView();
    void this.loadLobbyHeroRoster();
  }

  private closeLobbyHeroRosterPanel(): void {
    if (!this.lobbyHeroRosterPanelOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyHeroRosterPanel(): void {
    this.removeNodeFromContent('LobbyHeroRosterDim');
    this.removeNodeFromContent('LobbyHeroRosterPanel');
    this.removeNodeFromContent('LobbyHeroRosterSceneContent');
  }

  private reloadLobbyHeroRoster(): void {
    void this.loadLobbyHeroRoster(true);
  }

  private currentLobbyHeroRosterState(): LobbyHeroRosterPanelState {
    return this.lobbyHeroRosterLoader.currentState();
  }

  private openLobbyHeroDetail(heroId: number): void {
    const hero = this.lobbyHeroRosterLoader.currentState().heroes.find((item) => item.id === heroId);
    if (!hero || hero.rarity.toUpperCase() === 'EX' || hero.heroCode.toUpperCase().startsWith('EX_')) {
      this.setStatus('该英雄当前不可查看详情。');
      return;
    }
    this.lobbyHeroDetailHeroId = hero.id;
    this.lobbyHeroDetailTab = 'attr';
    // 切换英雄时重置洗练/装备弹窗,避免跨英雄残留状态。
    this.lobbyHeroRefineDialogOpen = false;
    this.lobbyHeroRefineLockedIds.clear();
    this.lobbyHeroEquipDialogOpen = false;
    this.lobbyHeroEquipSelectedSlot = null;
    this.lobbyHeroWearSelectedEquipId = null;
    this.lobbyHeroUltimateDialogOpen = false;
    this.lobbyEquipFuseDialogOpen = false;
    this.lobbyEquipEnhanceTargetId = null;
    this.lobbyHeroRosterPanelOpen = true;
    this.currentView = 'heroDetail';
    this.renderCurrentView();
    void this.loadLobbyBag();
    void this.loadLobbyHeroDetail(hero.id);
  }

  // 拉取英雄详情(服务端计算的升级消耗/等级上限);失败只降级为不展示消耗行,不阻塞面板。
  private async loadLobbyHeroDetail(heroId: number): Promise<void> {
    if (this.lobbyHeroDetailLoading) {
      return;
    }
    this.lobbyHeroDetailLoading = true;
    try {
      // 环绕立绘的装备格需要装备列表:缓存为空时随详情一起拉,共用同一次重渲染(避免额外 spine 重播)。
      const [detail] = await Promise.all([
        this.api.hero.detail(heroId),
        this.lobbyEquipmentItems.length > 0 || this.lobbyEquipmentLoading ? Promise.resolve() : this.loadLobbyEquipmentList(),
      ]);
      if (this.lobbyHeroDetailHeroId === heroId) {
        this.lobbyHeroDetailData = detail;
        if (this.currentView === 'heroDetail') {
          this.renderCurrentView();
        }
      }
    } catch (error) {
      console.warn('[LootChain] hero detail load failed:', error);
    } finally {
      this.lobbyHeroDetailLoading = false;
    }
  }

  private currentLobbyHeroDetailInfo(): UserHeroDetailVO | null {
    if (this.lobbyHeroDetailHeroId === null || this.lobbyHeroDetailData?.id !== this.lobbyHeroDetailHeroId) {
      return null;
    }
    return this.lobbyHeroDetailData;
  }

  private closeLobbyHeroDetailPanel(): void {
    if (this.lobbyHeroDetailHeroId === null) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private backToLobbyHeroRosterPanel(): void {
    this.lobbyHeroDetailHeroId = null;
    this.lobbyHeroRosterPanelOpen = true;
    this.currentView = 'heroes';
    this.renderCurrentView();
  }

  private removeLobbyHeroDetailPanel(): void {
    this.removeNodeFromContent('LobbyHeroDetailDim');
    this.removeNodeFromContent('LobbyHeroDetailPanel');
    this.removeNodeFromContent('LobbyHeroDetailSceneContent');
  }

  private currentLobbyHeroDetailHero(): LobbyHeroItemVO | null {
    if (this.lobbyHeroDetailHeroId === null) {
      return null;
    }
    return this.lobbyHeroRosterLoader.currentState().heroes.find((hero) => hero.id === this.lobbyHeroDetailHeroId) ?? null;
  }

  private isLobbyHeroLevelUpPending(heroId: number): boolean {
    return this.lobbyHeroLevelUpBusyId === heroId;
  }

  private levelUpLobbyHero(heroId: number): void {
    if (this.lobbyHeroLevelUpBusyId !== null) {
      this.setStatus('英雄升级请求处理中，请勿重复点击。');
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    if (!hero || hero.id !== heroId || hero.rarity.toUpperCase() === 'EX' || hero.heroCode.toUpperCase().startsWith('EX_')) {
      this.setStatus('该英雄当前不可升级。');
      return;
    }
    this.lobbyHeroLevelUpBusyId = hero.id;
    this.setStatus(`${hero.heroName} 升级请求提交中...`);
    this.renderCurrentView();
    void this.runLobbyHeroLevelUp(hero.id, hero.heroName);
  }

  private async runLobbyHeroLevelUp(heroId: number, heroName: string): Promise<void> {
    let levelUpPowerDelta = 0;
    try {
      const beforePower = this.currentLobbyHeroDetailHero()?.power ?? 0;
      const result = await this.api.hero.levelUp(heroId);
      levelUpPowerDelta = result.power - beforePower;
      const userId = this.currentLobbyProfile().userId;
      await this.loadLobbyProfile(userId);
      await this.loadLobbyHeroRoster(true);
      await this.loadLobbyBag(true);
      await this.loadLobbyAdventure(true);
      // 详情回读必须等待:放飞会在浮字之后再整刷一次,把浮字节点清掉。
      await this.loadLobbyHeroDetail(heroId);
      const powerGain = Math.max(0, result.power - beforePower);
      this.setStatus(`${heroName} 升级成功：Lv.${result.level}，战力 ${this.formatInteger(result.power)}${powerGain > 0 ? `（+${this.formatInteger(powerGain)}）` : ''}，已回读英雄、背包、资源和主线引导。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`英雄升级失败：${message}`);
    } finally {
      this.lobbyHeroLevelUpBusyId = null;
      if (this.currentView === 'heroDetail' || this.currentView === 'heroes') {
        this.renderCurrentView();
      }
      this.spawnPowerDeltaFloat(levelUpPowerDelta);
    }
  }

  // 一键升级:循环调用升级接口直到失败(材料不足/等级上限),最多 50 次;结束后统一回读。
  private autoLevelUpLobbyHero(heroId: number): void {
    if (this.lobbyHeroLevelUpBusyId !== null) {
      this.setStatus('英雄升级请求处理中，请勿重复点击。');
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    if (!hero || hero.id !== heroId || hero.rarity.toUpperCase() === 'EX' || hero.heroCode.toUpperCase().startsWith('EX_')) {
      this.setStatus('该英雄当前不可升级。');
      return;
    }
    this.lobbyHeroLevelUpBusyId = hero.id;
    this.setStatus(`${hero.heroName} 一键升级中...`);
    this.renderCurrentView();
    void this.runLobbyHeroAutoLevelUp(hero.id, hero.heroName);
  }

  private async runLobbyHeroAutoLevelUp(heroId: number, heroName: string): Promise<void> {
    const beforePower = this.currentLobbyHeroDetailHero()?.power ?? 0;
    let lastLevel: number | null = null;
    let lastPower = beforePower;
    let ups = 0;
    let stopReason = '';
    try {
      for (let i = 0; i < 50; i += 1) {
        try {
          const result = await this.api.hero.levelUp(heroId);
          ups += 1;
          lastLevel = result.level;
          lastPower = result.power;
        } catch (error) {
          stopReason = error instanceof Error ? error.message : String(error);
          break;
        }
      }
    } finally {
      const userId = this.currentLobbyProfile().userId;
      await this.loadLobbyProfile(userId);
      await this.loadLobbyHeroRoster(true);
      await this.loadLobbyBag(true);
      await this.loadLobbyAdventure(true);
      // 详情回读必须等待:放飞会在浮字之后再整刷一次,把浮字节点清掉。
      await this.loadLobbyHeroDetail(heroId);
      if (ups > 0) {
        this.setStatus(`${heroName} 一键升级 +${ups} 级${lastLevel !== null ? `，Lv.${lastLevel}` : ''}，战力 ${this.formatInteger(lastPower)}${stopReason ? `（已停止：${stopReason}）` : ''}`);
      } else {
        this.setStatus(`一键升级未执行：${stopReason || '材料不足或已达上限'}`);
      }
      this.lobbyHeroLevelUpBusyId = null;
      if (this.currentView === 'heroDetail' || this.currentView === 'heroes') {
        this.renderCurrentView();
      }
      this.spawnPowerDeltaFloat(lastPower - beforePower);
    }
  }

  // 觉醒(2026-07-18 开放):10星门槛,消耗由服务器 hero_awaken_config 扣减;EX 不参与。
  private awakenLobbyHero(heroId: number): void {
    if (this.lobbyHeroLevelUpBusyId !== null) {
      this.setStatus('英雄养成请求处理中，请勿重复点击。');
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    if (!hero || hero.id !== heroId || hero.rarity.toUpperCase() === 'EX' || hero.heroCode.toUpperCase().startsWith('EX_')) {
      this.setStatus('该英雄当前不可觉醒。');
      return;
    }
    this.lobbyHeroLevelUpBusyId = hero.id;
    this.setStatus(`${hero.heroName} 觉醒请求提交中...`);
    this.renderCurrentView();
    void this.runLobbyHeroAwaken(hero.id, hero.heroName);
  }

  private async runLobbyHeroAwaken(heroId: number, heroName: string): Promise<void> {
    const beforePower = this.currentLobbyHeroDetailHero()?.power ?? 0;
    let lastPower = beforePower;
    let ok = false;
    let failReason = '';
    try {
      const result = await this.api.hero.awaken(heroId);
      lastPower = result.power;
      ok = true;
    } catch (error) {
      failReason = error instanceof Error ? error.message : String(error);
    } finally {
      const userId = this.currentLobbyProfile().userId;
      await this.loadLobbyProfile(userId);
      await this.loadLobbyHeroRoster(true);
      await this.loadLobbyBag(true);
      // 详情回读必须等待:放飞会在浮字之后再整刷一次,把浮字节点清掉。
      await this.loadLobbyHeroDetail(heroId);
      this.setStatus(ok ? `${heroName} 觉醒成功！大招等级上限提升，战力 ${this.formatInteger(lastPower)}。` : `觉醒失败：${failReason}`);
      this.lobbyHeroLevelUpBusyId = null;
      if (this.currentView === 'heroDetail' || this.currentView === 'heroes') {
        this.renderCurrentView();
      }
      this.spawnPowerDeltaFloat(lastPower - beforePower);
    }
  }

  // 升星(2026-07-18 开放):同名碎片+金币,消耗由服务器 hero_star_config 扣减;EX 不参与。
  private starUpLobbyHero(heroId: number): void {
    this.beginLobbyHeroStarUp(heroId, false);
  }

  // 一键升星:循环升到材料不足/满星(上限 14 次)。
  private autoStarUpLobbyHero(heroId: number): void {
    this.beginLobbyHeroStarUp(heroId, true);
  }

  private beginLobbyHeroStarUp(heroId: number, auto: boolean): void {
    if (this.lobbyHeroLevelUpBusyId !== null) {
      this.setStatus('英雄养成请求处理中，请勿重复点击。');
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    if (!hero || hero.id !== heroId || hero.rarity.toUpperCase() === 'EX' || hero.heroCode.toUpperCase().startsWith('EX_')) {
      this.setStatus('该英雄当前不可升星。');
      return;
    }
    this.lobbyHeroLevelUpBusyId = hero.id;
    this.setStatus(`${hero.heroName} ${auto ? '一键升星' : '升星'}请求提交中...`);
    this.renderCurrentView();
    void this.runLobbyHeroStarUp(hero.id, hero.heroName, auto);
  }

  private async runLobbyHeroStarUp(heroId: number, heroName: string, auto: boolean): Promise<void> {
    const beforePower = this.currentLobbyHeroDetailHero()?.power ?? 0;
    let lastStar: number | null = null;
    let lastPower = beforePower;
    let ups = 0;
    let stopReason = '';
    try {
      const maxLoops = auto ? 14 : 1;
      for (let i = 0; i < maxLoops; i += 1) {
        try {
          const result = await this.api.hero.starUp(heroId);
          ups += 1;
          lastStar = (result as { star?: number }).star ?? null;
          lastPower = result.power;
        } catch (error) {
          stopReason = error instanceof Error ? error.message : String(error);
          break;
        }
      }
    } finally {
      const userId = this.currentLobbyProfile().userId;
      await this.loadLobbyProfile(userId);
      await this.loadLobbyHeroRoster(true);
      await this.loadLobbyBag(true);
      // 详情回读必须等待:放飞会在浮字之后再整刷一次,把浮字节点清掉。
      await this.loadLobbyHeroDetail(heroId);
      if (ups > 0) {
        this.setStatus(`${heroName} 升星 +${ups}${lastStar !== null ? `，当前 ${lastStar} 星` : ''}，战力 ${this.formatInteger(lastPower)}${stopReason ? `（已停止：${stopReason}）` : ''}`);
      } else {
        this.setStatus(`升星未执行：${stopReason || '碎片或金币不足'}`);
      }
      this.lobbyHeroLevelUpBusyId = null;
      if (this.currentView === 'heroDetail' || this.currentView === 'heroes') {
        this.renderCurrentView();
      }
      this.spawnPowerDeltaFloat(lastPower - beforePower);
    }
  }

  // ===== 洗练(重铸词条,2026-07-10)=====
  private isLobbyHeroRefinePending(heroId: number): boolean {
    return this.lobbyHeroRefineBusyId === heroId;
  }

  private currentLobbyHeroRefineState(): { dialogOpen: boolean; lockedAttrIds: number[] } {
    return { dialogOpen: this.lobbyHeroRefineDialogOpen, lockedAttrIds: [...this.lobbyHeroRefineLockedIds] };
  }

  // 弹窗开关/锁定切换只做弹窗级局部刷新(背景 spine 不重建、动画不重播);面板未渲染时回退整视图。
  private refreshLobbyHeroRefineDialog(): void {
    if (!this.lobbyHeroDetailPanelRenderer.updateRefineDialogOnly()) {
      this.renderCurrentView();
    }
  }

  private openLobbyHeroRefineDialog(): void {
    this.lobbyHeroEquipDialogOpen = false;
    this.lobbyHeroRefineDialogOpen = true;
    this.lobbyHeroRefineLockedIds.clear();
    this.lobbyHeroRefineDirty = false;
    this.refreshLobbyHeroRefineDialog();
  }

  private closeLobbyHeroRefineDialog(): void {
    this.lobbyHeroRefineDialogOpen = false;
    this.lobbyHeroRefineLockedIds.clear();
    if (this.lobbyHeroRefineDirty) {
      // 弹窗期间发生过洗练:关闭时整刷一次,把底层词条卡/战力同步到最新(此时重建 spine 可接受)。
      this.lobbyHeroRefineDirty = false;
      this.renderCurrentView();
      return;
    }
    this.refreshLobbyHeroRefineDialog();
  }

  private toggleLobbyHeroRefineLock(attrId: number): void {
    if (this.lobbyHeroRefineBusyId !== null) {
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    const affixes = hero?.affixes ?? [];
    if (this.lobbyHeroRefineLockedIds.has(attrId)) {
      this.lobbyHeroRefineLockedIds.delete(attrId);
    } else {
      // 服务端约束:最多锁到剩 1 条可随机;客户端同步限制,超限提示。
      if (this.lobbyHeroRefineLockedIds.size >= Math.max(0, affixes.length - 1)) {
        this.setStatus('需保留至少 1 条词条可洗练。');
        return;
      }
      this.lobbyHeroRefineLockedIds.add(attrId);
    }
    this.refreshLobbyHeroRefineDialog();
  }

  private refineLobbyHero(heroId: number): void {
    if (this.lobbyHeroRefineBusyId !== null) {
      this.setStatus('洗练请求处理中，请勿重复点击。');
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    if (!hero || hero.id !== heroId || (hero.affixes ?? []).length <= 0) {
      this.setStatus('该英雄当前不可洗练。');
      return;
    }
    this.lobbyHeroRefineBusyId = hero.id;
    this.setStatus(`${hero.heroName} 洗练请求提交中...`);
    this.refreshLobbyHeroRefineDialog();
    void this.runLobbyHeroRefine(hero.id, hero.heroName);
  }

  private async runLobbyHeroRefine(heroId: number, heroName: string): Promise<void> {
    let refinePowerDelta = 0;
    try {
      const beforePower = this.currentLobbyHeroDetailHero()?.power ?? 0;
      const lockedIds = [...this.lobbyHeroRefineLockedIds];
      const result = await this.api.hero.refine(heroId, lockedIds);
      refinePowerDelta = result.power - beforePower;
      const userId = this.currentLobbyProfile().userId;
      await this.loadLobbyProfile(userId);
      await this.loadLobbyHeroRoster(true);
      await this.loadLobbyBag(true);
      const powerDelta = result.power - beforePower;
      const deltaText = powerDelta === 0 ? '' : powerDelta > 0 ? `（+${this.formatInteger(powerDelta)}）` : `（${this.formatInteger(powerDelta)}）`;
      this.setStatus(`${heroName} 洗练完成：战力 ${this.formatInteger(result.power)}${deltaText}，锁定 ${lockedIds.length} 条词条已保留。`);
      // 洗练后词条集合已变化,清空锁定但保持弹窗打开,方便连续洗练;关闭弹窗时再整刷底层面板。
      this.lobbyHeroRefineLockedIds.clear();
      this.lobbyHeroRefineDirty = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`洗练失败：${message}`);
    } finally {
      this.lobbyHeroRefineBusyId = null;
      if (this.currentView === 'heroDetail') {
        // 只做弹窗级刷新:新词条/持有量/消耗即时更新,背景 spine 不重播。
        this.refreshLobbyHeroRefineDialog();
      } else if (this.currentView === 'heroes') {
        this.renderCurrentView();
      }
      this.spawnPowerDeltaFloat(refinePowerDelta);
    }
  }

  // ===== 装备(穿戴/卸下,装备一期)=====
  private currentLobbyHeroEquipState(): {
    dialogOpen: boolean;
    selectedSlot: string | null;
    selectedEquipId: number | null;
    items: EquipmentItemVO[];
    loading: boolean;
    busy: boolean;
  } {
    return {
      dialogOpen: this.lobbyHeroEquipDialogOpen,
      selectedSlot: this.lobbyHeroEquipSelectedSlot,
      selectedEquipId: this.lobbyHeroWearSelectedEquipId,
      items: this.lobbyEquipmentItems,
      loading: this.lobbyEquipmentLoading,
      busy: this.lobbyHeroEquipBusy,
    };
  }

  private refreshLobbyHeroEquipDialog(): void {
    if (!this.lobbyHeroDetailPanelRenderer.updateEquipDialogOnly()) {
      this.renderCurrentView();
    }
  }

  private openLobbyHeroEquipDialog(): void {
    this.lobbyHeroRefineDialogOpen = false;
    this.lobbyHeroRefineLockedIds.clear();
    this.lobbyEquipFuseDialogOpen = false;
    this.lobbyHeroEquipDialogOpen = true;
    this.lobbyHeroEquipSelectedSlot = 'WEAPON';
    this.lobbyHeroWearSelectedEquipId = null;
    this.lobbyHeroEquipDirty = false;
    this.refreshLobbyHeroEquipDialog();
    void this.loadLobbyEquipmentList();
  }

  private closeLobbyHeroEquipDialog(): void {
    this.lobbyHeroEquipDialogOpen = false;
    if (this.lobbyHeroEquipDirty) {
      // 弹窗期间穿卸过:关闭时整刷同步底层战力/词条展示(此时重建 spine 可接受)。
      this.lobbyHeroEquipDirty = false;
      this.renderCurrentView();
      return;
    }
    this.refreshLobbyHeroEquipDialog();
  }

  private openLobbyHeroEquipDialogWithSlot(slot: string): void {
    this.lobbyHeroRefineDialogOpen = false;
    this.lobbyHeroRefineLockedIds.clear();
    this.lobbyHeroEquipDialogOpen = true;
    this.lobbyHeroEquipSelectedSlot = slot;
    this.lobbyHeroWearSelectedEquipId = null;
    this.lobbyHeroEquipDirty = false;
    this.refreshLobbyHeroEquipDialog();
    void this.loadLobbyEquipmentList();
  }

  // 一键穿戴:每个空部位自动穿"战力加成最高"的闲置装备(与服务器 equipPowerBonus 同权重估算)。
  private oneClickEquipLobbyHero(heroId: number): void {
    void this.runOneClickEquip(heroId, 'equip');
  }

  private oneClickUnequipLobbyHero(heroId: number): void {
    void this.runOneClickEquip(heroId, 'unequip');
  }

  private async runOneClickEquip(heroId: number, kind: 'equip' | 'unequip'): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    if (!hero || hero.id !== heroId) {
      return;
    }
    this.lobbyHeroEquipBusy = true;
    const beforePower = hero.power;
    let powerDelta = 0;
    try {
      if (this.lobbyEquipmentItems.length <= 0) {
        await this.loadLobbyEquipmentList();
      }
      let applied = 0;
      if (kind === 'unequip') {
        const equipped = this.lobbyEquipmentItems.filter((item) => item.heroId === hero.id);
        for (const item of equipped) {
          await this.api.equipment.unequip(item.id);
          applied += 1;
        }
      } else {
        const slots = ['WEAPON', 'HELMET', 'CHEST', 'BOOTS', 'RING', 'NECKLACE'];
        const equippedSlots = new Set(this.lobbyEquipmentItems.filter((item) => item.heroId === hero.id).map((item) => item.slot));
        for (const slot of slots) {
          if (equippedSlots.has(slot)) {
            continue;
          }
          const best = this.lobbyEquipmentItems
            .filter((item) => item.slot === slot && item.heroId == null)
            .sort((a, b) => equipItemPowerScore(b) - equipItemPowerScore(a))[0];
          if (best) {
            await this.api.equipment.equip(best.id, hero.id);
            applied += 1;
          }
        }
      }
      if (applied > 0) {
        this.lobbyEquipmentItems = await this.api.equipment.list();
        await this.loadLobbyHeroRoster(true);
        const fresh = this.currentLobbyHeroDetailHero();
        powerDelta = (fresh?.power ?? hero.power) - beforePower;
        this.setStatus(`${hero.heroName} 一键${kind === 'equip' ? '穿戴' : '卸下'} ${applied} 件完成，战力 ${this.formatInteger(fresh?.power ?? hero.power)}。`);
      } else {
        this.setStatus(kind === 'equip' ? '没有可穿戴的闲置装备。' : '该英雄没有已穿戴装备。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`一键装备操作失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      if (this.currentView === 'heroDetail') {
        // 装备/战力已变化,底层格子与名牌需要同步:整刷一次(一键操作低频,spine 重播可接受)。
        this.renderCurrentView();
      }
      this.spawnPowerDeltaFloat(powerDelta);
    }
  }

  // ===== 装备强化/分解(2.0 P3)=====
  private currentLobbyEquipEnhanceState(): { targetId: number | null; useBless: boolean; useGuard: boolean } {
    return {
      targetId: this.lobbyEquipEnhanceTargetId,
      useBless: this.lobbyEquipEnhanceUseBless,
      useGuard: this.lobbyEquipEnhanceUseGuard,
    };
  }

  private openLobbyEquipEnhanceDialog(equipmentId: number): void {
    this.lobbyEquipFuseDialogOpen = false;
    this.lobbyEquipEnhanceTargetId = equipmentId;
    this.lobbyEquipEnhanceUseBless = false;
    this.lobbyEquipEnhanceUseGuard = false;
    this.refreshLobbyHeroEquipDialog();
  }

  private closeLobbyEquipEnhanceDialog(): void {
    this.lobbyEquipEnhanceTargetId = null;
    this.refreshLobbyHeroEquipDialog();
  }

  private toggleLobbyEquipEnhanceBless(): void {
    this.lobbyEquipEnhanceUseBless = !this.lobbyEquipEnhanceUseBless;
    this.refreshLobbyHeroEquipDialog();
  }

  private toggleLobbyEquipEnhanceGuard(): void {
    this.lobbyEquipEnhanceUseGuard = !this.lobbyEquipEnhanceUseGuard;
    this.refreshLobbyHeroEquipDialog();
  }

  private enhanceLobbyEquipment(equipmentId: number): void {
    void this.runLobbyEquipEnhance(equipmentId);
  }

  private async runLobbyEquipEnhance(equipmentId: number): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    this.lobbyHeroEquipBusy = true;
    this.refreshLobbyHeroEquipDialog();
    // 战力浮字按"装备所属英雄"结算:锻造页强化已穿装备同样能看到战力变动(成功+/降级-)。
    const equipHeroId = this.lobbyEquipmentItems.find((item) => item.id === equipmentId)?.heroId ?? null;
    const beforePower = this.lobbyHeroPowerById(equipHeroId);
    let powerDelta = 0;
    let flash: { ok: boolean; text: string } | null = null;
    try {
      const result = await this.api.equipment.enhance(equipmentId, this.lobbyEquipEnhanceUseBless, this.lobbyEquipEnhanceUseGuard);
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyBag(true);
      await this.loadLobbyHeroRoster(true);
      this.lobbyHeroEquipDirty = true;
      powerDelta = this.lobbyHeroPowerById(equipHeroId) - beforePower;
      if (result.success) {
        this.setStatus(`强化成功：+${result.levelBefore} → +${result.levelAfter}（成功率 ${Math.round(result.chance * 100)}%）。`);
        flash = { ok: true, text: `强化成功 · +${result.levelAfter}` };
      } else if (result.downgraded) {
        this.setStatus(`强化失败并降级：+${result.levelBefore} → +${result.levelAfter}（成功率 ${Math.round(result.chance * 100)}%）。`);
        flash = { ok: false, text: `强化失败 · 降至 +${result.levelAfter}` };
      } else {
        this.setStatus(`强化失败（等级保留 +${result.levelAfter}，成功率 ${Math.round(result.chance * 100)}%）。`);
        flash = { ok: false, text: `强化失败 · 保留 +${result.levelAfter}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`强化失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      this.refreshLobbyHeroEquipDialog();
      this.spawnPowerDeltaFloat(powerDelta);
      if (flash && this.currentView === 'forge') {
        this.lobbyForgePanelRenderer.spawnForgeFlash(flash.ok, flash.text);
      }
    }
  }

  // 分解:按(部位,稀有度)组分解 1 件(挑该组强化等级最低的未穿戴件)。
  private decomposeLobbyEquipGroup(slot: string, quality: string): void {
    void this.runLobbyEquipDecompose(slot, quality);
  }

  private async runLobbyEquipDecompose(slot: string, quality: string): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const candidates = this.lobbyEquipmentItems
      .filter((item) => item.slot === slot && (item.quality || '').toUpperCase() === quality && item.heroId == null)
      .sort((a, b) => (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0));
    if (candidates.length <= 0) {
      this.setStatus('该组没有可分解的未穿戴装备。');
      return;
    }
    this.lobbyHeroEquipBusy = true;
    this.refreshLobbyHeroEquipDialog();
    try {
      const result = await this.api.equipment.decompose([candidates[0].id]);
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyBag(true);
      this.lobbyHeroEquipDirty = true;
      this.setStatus(`分解完成：获得强化石 ×${this.formatInteger(result.stonesGained)}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`分解失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      this.refreshLobbyHeroEquipDialog();
    }
  }

  // ===== 装备合成(2.0 P2)=====
  private currentLobbyEquipFuseState(): { dialogOpen: boolean; useLuckStone: boolean } {
    return { dialogOpen: this.lobbyEquipFuseDialogOpen, useLuckStone: this.lobbyEquipFuseUseLuckStone };
  }

  private openLobbyEquipFuseDialog(): void {
    this.lobbyEquipEnhanceTargetId = null;
    this.lobbyEquipFuseDialogOpen = true;
    this.lobbyEquipFuseUseLuckStone = false;
    this.refreshLobbyHeroEquipDialog();
    void this.loadLobbyEquipmentList();
  }

  private closeLobbyEquipFuseDialog(): void {
    this.lobbyEquipFuseDialogOpen = false;
    this.refreshLobbyHeroEquipDialog();
  }

  private toggleLobbyEquipFuseLuckStone(): void {
    this.lobbyEquipFuseUseLuckStone = !this.lobbyEquipFuseUseLuckStone;
    this.refreshLobbyHeroEquipDialog();
  }

  // 按(部位,稀有度)组合成:自动挑该组前 3 件未穿戴装备作为材料。
  private fuseLobbyEquipGroup(slot: string, quality: string): void {
    void this.runLobbyEquipFuse(slot, quality);
  }

  private async runLobbyEquipFuse(slot: string, quality: string): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const materials = this.lobbyEquipmentItems
      .filter((item) => item.slot === slot && (item.quality || '').toUpperCase() === quality && item.heroId == null)
      .slice(0, 3);
    if (materials.length < 3) {
      this.setStatus('该组未穿戴装备不足 3 件，无法合成。');
      return;
    }
    this.lobbyHeroEquipBusy = true;
    this.refreshLobbyHeroEquipDialog();
    try {
      const result = await this.api.equipment.fuse(materials.map((item) => item.id), this.lobbyEquipFuseUseLuckStone);
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyBag(true);
      this.lobbyHeroEquipDirty = true;
      if (result.success) {
        this.setStatus(`合成成功！获得「${result.resultItem.equipName}」（成功率 ${Math.round(result.chance * 100)}%）。`);
      } else {
        this.setStatus(`合成失败（成功率 ${Math.round(result.chance * 100)}%），返还「${result.resultItem.equipName}」×1。`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`合成失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      this.refreshLobbyHeroEquipDialog();
    }
  }

  private selectLobbyHeroEquipSlot(slot: string): void {
    this.lobbyHeroEquipSelectedSlot = slot;
    this.lobbyHeroWearSelectedEquipId = null;
    this.refreshLobbyHeroEquipDialog();
  }

  private currentLobbyHeroUltimateState(): { dialogOpen: boolean; busy: boolean } {
    return { dialogOpen: this.lobbyHeroUltimateDialogOpen, busy: this.lobbyHeroUltimateBusy };
  }

  private openLobbyHeroUltimateDialog(): void {
    this.lobbyHeroUltimateDialogOpen = true;
    this.renderCurrentView();
  }

  private closeLobbyHeroUltimateDialog(): void {
    this.lobbyHeroUltimateDialogOpen = false;
    this.renderCurrentView();
  }

  private confirmLobbyHeroUltimateUp(heroId: number): void {
    void this.runLobbyHeroUltimateUp(heroId);
  }

  // 大招升级:busy 防抖 → 提交 → 回读背包/金币/花名册 → 战力浮字;弹窗保持打开便于连续升级。
  private async runLobbyHeroUltimateUp(heroId: number): Promise<void> {
    if (this.lobbyHeroUltimateBusy) {
      this.setStatus('终极技能升级处理中，请勿重复点击。');
      return;
    }
    this.lobbyHeroUltimateBusy = true;
    this.renderCurrentView();
    let powerDelta = 0;
    try {
      const beforePower = this.lobbyHeroPowerById(heroId);
      const result = await this.api.hero.ultimateUp(heroId);
      await this.loadLobbyBag(true);
      await this.loadLobbyProfile(this.currentLobbyProfile().userId);
      await this.loadLobbyHeroRoster(true);
      powerDelta = (result.power ?? this.lobbyHeroPowerById(heroId)) - beforePower;
      this.setStatus(`终极技能升至 Lv.${result.ultimateSkillLevel}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`终极技能升级失败：${message}`);
    } finally {
      this.lobbyHeroUltimateBusy = false;
      this.renderCurrentView();
      this.spawnPowerDeltaFloat(powerDelta);
    }
  }

  private selectLobbyHeroWearEquip(equipId: number): void {
    this.lobbyHeroWearSelectedEquipId = equipId;
    this.refreshLobbyHeroEquipDialog();
  }

  private currentLobbyHeroDetailTab(): 'attr' | 'equip' | 'skill' | 'star' {
    return this.lobbyHeroDetailTab;
  }

  private selectLobbyHeroDetailTab(tab: 'attr' | 'equip' | 'skill' | 'star'): void {
    if (this.lobbyHeroDetailTab === tab) {
      return;
    }
    this.lobbyHeroDetailTab = tab;
    if (tab === 'equip') {
      // 右栏可穿列表依赖装备清单;默认聚焦武器部位。
      if (!this.lobbyHeroEquipSelectedSlot) {
        this.lobbyHeroEquipSelectedSlot = 'WEAPON';
      }
      void this.loadLobbyEquipmentList();
    }
    this.renderCurrentView();
  }

  private async loadLobbyEquipmentList(): Promise<void> {
    if (this.lobbyEquipmentLoading) {
      return;
    }
    this.lobbyEquipmentLoading = true;
    try {
      this.lobbyEquipmentItems = await this.api.equipment.list();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`装备列表读取失败：${message}`);
    } finally {
      this.lobbyEquipmentLoading = false;
      // 英雄详情装备弹窗走弹窗级刷新;锻造页无详情上下文,同一入口会自动回退整页重绘。
      if (this.lobbyHeroEquipDialogOpen || this.currentView === 'forge') {
        this.refreshLobbyHeroEquipDialog();
      }
    }
  }

  private equipLobbyHeroEquipment(equipmentId: number): void {
    void this.runLobbyHeroEquipMutation(equipmentId, 'equip');
  }

  private unequipLobbyHeroEquipment(equipmentId: number): void {
    void this.runLobbyHeroEquipMutation(equipmentId, 'unequip');
  }

  private async runLobbyHeroEquipMutation(equipmentId: number, kind: 'equip' | 'unequip'): Promise<void> {
    if (this.lobbyHeroEquipBusy) {
      this.setStatus('装备操作处理中，请勿重复点击。');
      return;
    }
    const hero = this.currentLobbyHeroDetailHero();
    if (!hero) {
      return;
    }
    this.lobbyHeroEquipBusy = true;
    this.refreshLobbyHeroEquipDialog();
    const beforePower = hero.power;
    let powerDelta = 0;
    try {
      if (kind === 'equip') {
        await this.api.equipment.equip(equipmentId, hero.id);
      } else {
        await this.api.equipment.unequip(equipmentId);
      }
      this.lobbyHeroEquipDirty = true;
      // 回读装备列表(穿戴归属变化)+ 英雄花名册(战力已由服务器重算)。
      this.lobbyEquipmentItems = await this.api.equipment.list();
      await this.loadLobbyHeroRoster(true);
      const fresh = this.currentLobbyHeroDetailHero();
      powerDelta = (fresh?.power ?? beforePower) - beforePower;
      this.setStatus(`${hero.heroName} ${kind === 'equip' ? '穿戴' : '卸下'}装备完成，战力 ${this.formatInteger(fresh?.power ?? hero.power)}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`装备操作失败：${message}`);
    } finally {
      this.lobbyHeroEquipBusy = false;
      this.refreshLobbyHeroEquipDialog();
      this.spawnPowerDeltaFloat(powerDelta);
    }
  }

  private currentLobbySelectedStageCode(): string {
    return this.selectedLobbyStageCode ?? '未选择关卡';
  }

  private currentLobbyFormationHeroIds(): number[] {
    return this.resolveLobbyFormationHeroIds();
  }

  private currentLobbyFormationPowerSnapshot(stageCode?: string): LobbyFormationPowerSnapshot {
    const roster = this.lobbyHeroRosterLoader.currentState();
    const selectedHeroIds = this.resolveLobbyFormationHeroIds();
    const byId = new Map(this.selectableLobbyHeroes().map((hero) => [hero.id, hero]));
    const currentPower = selectedHeroIds
      .map((heroId) => byId.get(heroId)?.power ?? 0)
      .reduce((sum, power) => sum + Math.max(0, Math.trunc(power)), 0);
    const resolvedStageCode = this.resolveLobbyStageCode(stageCode) ?? this.selectedLobbyStageCode ?? '';
    const stage = resolvedStageCode ? this.findLobbyAdventureStage(resolvedStageCode) : null;
    const recommendedPower = Math.max(0, Math.trunc(stage?.recommendedPower ?? 0));
    const powerGap = Math.max(0, recommendedPower - currentPower);
    return {
      currentPower,
      recommendedPower,
      powerGap,
      enough: recommendedPower <= 0 || currentPower >= recommendedPower,
      rosterLoaded: roster.loaded && !roster.loading && !roster.error,
      selectedCount: selectedHeroIds.length,
    };
  }

  private toggleLobbyFormationHero(heroId: number): void {
    const heroes = this.selectableLobbyHeroes();
    const hero = heroes.find((item) => item.id === heroId);
    if (!hero) {
      this.setStatus('该英雄当前不可上阵。');
      return;
    }
    const current = this.resolveLobbyFormationHeroIds();
    if (current.includes(hero.id)) {
      this.selectedLobbyFormationHeroIds = this.normalizeLobbyFormationHeroIds(current.filter((id) => id !== hero.id));
      this.setStatus(`${hero.heroName} 已移出本次阵容。`);
    } else {
      const next = [...current];
      if (next.length >= 5) {
        this.setStatus('阵容已满，请先点击已上阵英雄下阵，再选择新英雄。');
        return;
      } else {
        next.push(hero.id);
      }
      this.selectedLobbyFormationHeroIds = this.normalizeLobbyFormationHeroIds(next);
      this.setStatus(`${hero.heroName} 已加入本次阵容。`);
    }
    this.invalidateLobbyBattleSessionForFormationChange();
    // 每次布阵变更后回写服务端,下次登录还原(不再回落默认前 5 战力)。
    this.persistLobbyFormationToServer();
    if (this.currentView === 'formation' && this.lobbyFormationPanelOpen) {
      this.renderCurrentView();
    }
  }

  // 会话内首次:名单就绪后拉取服务端已保存阵容,还原到本地选择;失败或为空时保持本地/默认回落。
  private async restoreLobbyFormationFromServerOnce(): Promise<void> {
    if (this.lobbyFormationServerLoaded) {
      return;
    }
    this.lobbyFormationServerLoaded = true;
    try {
      const saved = await this.api.lobbyTeam.getTeam();
      const normalized = this.normalizeLobbyFormationHeroIds(saved.heroIds);
      if (normalized.length > 0) {
        this.selectedLobbyFormationHeroIds = normalized;
      }
    } catch {
      // 阵容还原是尽力而为:接口不可用时不阻断大厅进入,沿用本地/默认阵容。
      this.lobbyFormationServerLoaded = false;
    }
  }

  // 布阵页"保存阵容"显式入口(2026-08-05 参考图改版):立即触发服务端持久化并给确认提示。
  // 阵容变更本就自动回写,此按钮提供玩家可感知的确定感。
  saveLobbyFormationNow(): void {
    this.persistLobbyFormationToServer();
    this.setStatus('阵容已保存。');
  }

  // 回写当前阵容到服务端;并发请求合并(最后一次为准),失败静默(下次变更或登录再对齐)。
  private persistLobbyFormationToServer(): void {
    if (this.lobbyFormationSaveInFlight) {
      this.lobbyFormationSavePending = true;
      return;
    }
    this.lobbyFormationSaveInFlight = true;
    const heroIds = this.resolveLobbyFormationHeroIds();
    void this.api.lobbyTeam
      .saveTeam(heroIds)
      .catch(() => undefined)
      .then(() => {
        this.lobbyFormationSaveInFlight = false;
        if (this.lobbyFormationSavePending) {
          this.lobbyFormationSavePending = false;
          this.persistLobbyFormationToServer();
        }
      });
  }

  private invalidateLobbyBattleSessionForFormationChange(): void {
    const stageCode = this.selectedLobbyStageCode;
    if (!stageCode) {
      return;
    }
    // 编队只保存在本地；变更阵容后必须废弃旧 battle start 快照，下一次预演重新按当前 heroIds 创建会话。
    this.lobbyBattleFlow.prepare(stageCode);
  }

  private currentLobbyDailyDungeonState(): LobbyDailyDungeonPanelState {
    return this.lobbyDailyDungeonState;
  }

  private renderLobbyDailyDungeonPanel(layout: UiLayout): void {
    this.lobbyDailyDungeonPanelRenderer.render(layout);
  }

  private removeLobbyDailyDungeonPanel(): void {
    this.removeNodeFromContent('LobbyDailyDim');
    this.removeNodeFromContent('LobbyDailySceneContent');
  }

  private refreshLobbyDailyDungeonPanel(): void {
    // 难度选中态存在渲染器实例里(不进 state),整页重绘即可刷新行高亮与卡底按钮。
    this.renderCurrentLobbyScenePage();
  }

  private currentLobbyCrystalRankState(): import('../types/DailyDungeonTypes').LobbyCrystalRankState {
    return this.lobbyCrystalRankState;
  }

  private loadLobbyCrystalRankSummary(force = false): void {
    void this.doLoadLobbyCrystalRankSummary(force);
  }

  private async doLoadLobbyCrystalRankSummary(force: boolean): Promise<void> {
    if (this.lobbyCrystalRankState.loading) {
      return;
    }
    if (!force && this.lobbyCrystalRankState.summary) {
      return;
    }
    const ticket = ++this.lobbyCrystalRankTicket;
    this.lobbyCrystalRankState = { ...this.lobbyCrystalRankState, loading: true, error: '', version: this.lobbyCrystalRankState.version + 1 };
    this.renderCurrentLobbyScenePage();
    try {
      const summary = await this.api.battle.crystalRankSummary();
      if (ticket !== this.lobbyCrystalRankTicket) {
        return;
      }
      this.lobbyCrystalRankState = { loading: false, error: '', summary, version: this.lobbyCrystalRankState.version + 1 };
    } catch (error) {
      if (ticket !== this.lobbyCrystalRankTicket) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.lobbyCrystalRankState = { ...this.lobbyCrystalRankState, loading: false, error: message, version: this.lobbyCrystalRankState.version + 1 };
    }
    this.renderCurrentLobbyScenePage();
  }

  private openLobbyDailyDungeonPanel(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyDailyDungeonPanelOpen = true;
    this.currentView = 'dailyDungeon';
    this.renderCurrentView();
    void this.loadLobbyDailyDungeonSummary(true);
    // 奖励详情弹框依赖背包配置数据(useDesc/稀有度/已拥有),非强制预热,已加载则直接命中。
    void this.loadLobbyBag();
  }

  private closeLobbyDailyDungeonPanel(): void {
    if (!this.lobbyDailyDungeonPanelOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private reloadLobbyDailyDungeonSummary(): void {
    void this.loadLobbyDailyDungeonSummary(true);
  }

  private async loadLobbyDailyDungeonSummary(force = false): Promise<void> {
    if (this.lobbyDailyDungeonState.loading) {
      return;
    }
    if (!force && this.lobbyDailyDungeonState.summary) {
      return;
    }
    const ticket = ++this.lobbyDailyDungeonTicket;
    this.lobbyDailyDungeonState = { ...this.lobbyDailyDungeonState, loading: true, error: '', version: this.lobbyDailyDungeonState.version + 1 };
    this.renderCurrentLobbyScenePage();
    try {
      const summary = await this.api.battle.dailyDungeonSummary();
      if (ticket !== this.lobbyDailyDungeonTicket) {
        return;
      }
      this.lobbyDailyDungeonState = { loading: false, error: '', summary, version: this.lobbyDailyDungeonState.version + 1 };
    } catch (error) {
      if (ticket !== this.lobbyDailyDungeonTicket) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.lobbyDailyDungeonState = { ...this.lobbyDailyDungeonState, loading: false, error: message, version: this.lobbyDailyDungeonState.version + 1 };
    }
    this.renderCurrentLobbyScenePage();
  }

  private startLobbyDailyDungeonBattle(stageCode: string): void {
    if (!isDailyDungeonStageCode(stageCode)) {
      this.setStatus('每日副本关卡码不合法，请刷新面板。');
      return;
    }
    // 本地只做入口预检,开放日/次数/难度解锁最终由后端 battles/start 裁决。
    this.openLobbyBattlePreviewPanel(stageCode);
  }

  private openLobbyNoticePanel(): void {
    this.closeAllLobbyScenePanelFlags();
    this.lobbyNoticePanelOpen = true;
    this.currentView = 'notice';
    this.renderCurrentView();
    void this.loadLobbyNotices();
  }

  private openLobbyGachaScene(): void {
    this.closeAllLobbyScenePanelFlags();
    this.gachaResultMode = null;
    this.pendingGachaDraw = null;
    this.gachaSummonRarity = null;
    this.gachaSummonTicket += 1;
    this.gachaSceneState = {
      ...this.gachaSceneState,
      drawing: false,
      error: null,
      lastDrawResult: null,
      activeAction: null,
    };
    this.gachaConfigRefreshElapsed = 0;
    this.gachaSceneState = { ...this.gachaSceneState, activeAction: null };
    this.currentView = 'gacha';
    this.renderCurrentView();
    this.setStatus('正在读取召唤卡池配置。');
    void this.loadGachaPools(true);
  }

  private selectGachaPool(poolCode: string): void {
    const pool = this.gachaSceneState.pools.find((item) => item.poolCode === poolCode || item.id === poolCode);
    if (!pool) {
      this.setStatus('该卡池配置不存在，请刷新召唤页。');
      return;
    }
    this.gachaSceneState = {
      ...this.gachaSceneState,
      selectedPoolCode: pool.poolCode ?? pool.id,
      lastDrawResult: null,
      poolDetail: null,
      poolDetailError: '',
      logs: [],
      logsError: '',
      error: null,
      activeAction: null,
    };
    this.renderCurrentView();
    this.setStatus(pool.noticeText ?? `${pool.title} 已选中。`);
    if (!pool.locked && !pool.previewOnly && pool.drawEnabled === true) {
      void this.loadGachaPity(pool.poolCode ?? pool.id);
    }
  }

  private openGachaActionScene(action: GachaActionKey): void {
    const pool = this.gachaSceneState.pools.find((item) => item.poolCode === this.gachaSceneState.selectedPoolCode || item.id === this.gachaSceneState.selectedPoolCode);
    const poolCode = pool?.poolCode ?? pool?.id ?? this.gachaSceneState.selectedPoolCode;
    if (!poolCode) {
      this.setStatus('当前没有可读取的召唤卡池。');
      return;
    }
    this.currentView = 'gacha';
    this.gachaSceneState = { ...this.gachaSceneState, activeAction: action };
    this.renderCurrentView();
    if (action === 'record') {
      void this.loadGachaLogs(true);
      return;
    }
    void this.loadGachaPoolDetail(poolCode, true);
    if (action === 'info' && !pool?.locked && !pool?.previewOnly && pool?.drawEnabled === true) {
      void this.loadGachaPity(poolCode);
    }
  }

  private closeGachaActionScene(): void {
    if (!this.gachaSceneState.activeAction && !this.isGachaActionSceneView(this.currentView)) {
      return;
    }
    this.gachaSceneState = { ...this.gachaSceneState, activeAction: null };
    this.currentView = 'gacha';
    this.renderCurrentView();
  }

  private async loadGachaPools(force = false): Promise<void> {
    if (this.gachaSceneState.loading && !force) {
      return;
    }
    this.gachaSceneState = { ...this.gachaSceneState, loading: true, error: null };
    if (this.currentView === 'gacha') {
      this.renderCurrentView();
    }
    try {
      const pools = (await this.api.gacha.pools())
        .map((pool) => this.toGachaPreviewPool(pool))
        .filter((pool) => this.isVisibleGachaPool(pool));
      const selectedPoolCode = pools.find((pool) => pool.poolCode === this.gachaSceneState.selectedPoolCode || pool.id === this.gachaSceneState.selectedPoolCode)?.poolCode
        ?? pools.find((pool) => !pool.locked && !pool.previewOnly && pool.drawEnabled === true)?.poolCode
        ?? pools[0]?.poolCode
        ?? pools[0]?.id
        ?? null;
      this.gachaSceneState = {
        ...this.gachaSceneState,
        loading: false,
        pools: pools.length > 0 ? pools : GACHA_PREVIEW_POOLS,
        selectedPoolCode,
      };
      if (this.currentView === 'gacha' || this.isGachaActionSceneView(this.currentView)) {
        this.renderCurrentView();
      }
      const selectedPool = this.gachaSceneState.pools.find((pool) => pool.poolCode === selectedPoolCode || pool.id === selectedPoolCode);
      if (selectedPoolCode && selectedPool && !selectedPool.locked && !selectedPool.previewOnly && selectedPool.drawEnabled === true) {
        void this.loadGachaPity(selectedPoolCode);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.gachaSceneState = {
        ...this.gachaSceneState,
        loading: false,
        error: message,
        pools: GACHA_PREVIEW_POOLS,
      };
      if (this.currentView === 'gacha' || this.isGachaActionSceneView(this.currentView)) {
        this.renderCurrentView();
      }
      this.setStatus(`召唤卡池读取失败，已使用本地展示兜底：${message}`);
    }
  }

  private async loadGachaPity(poolCode: string): Promise<void> {
    try {
      const pity = await this.api.gacha.pity(poolCode);
      if (this.gachaSceneState.selectedPoolCode !== poolCode) {
        return;
      }
      this.gachaSceneState = { ...this.gachaSceneState, pity };
      if (this.currentView === 'gacha') {
        this.renderCurrentView();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.gachaSceneState = { ...this.gachaSceneState, pity: [], error: message };
      this.setStatus(`保底信息读取失败：${message}`);
    }
  }

  private async loadGachaPoolDetail(poolCode: string, force = false): Promise<void> {
    if (this.gachaSceneState.poolDetailLoading && !force) {
      return;
    }
    this.gachaSceneState = {
      ...this.gachaSceneState,
      poolDetailLoading: true,
      poolDetailError: '',
    };
    if (this.isGachaActionSceneView(this.currentView)) {
      this.renderCurrentView();
    }
    try {
      const detail = await this.api.gacha.poolDetail(poolCode);
      if (this.gachaSceneState.selectedPoolCode !== poolCode) {
        return;
      }
      this.gachaSceneState = {
        ...this.gachaSceneState,
        poolDetail: detail,
        poolDetailLoading: false,
        poolDetailError: '',
      };
      if (this.currentView === 'gacha' || this.isGachaActionSceneView(this.currentView)) {
        this.renderCurrentView();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.gachaSceneState = {
        ...this.gachaSceneState,
        poolDetailLoading: false,
        poolDetailError: message,
      };
      if (this.currentView === 'gacha' || this.isGachaActionSceneView(this.currentView)) {
        this.renderCurrentView();
      }
      this.setStatus(`卡池详情读取失败：${message}`);
    }
  }

  private async loadGachaLogs(force = false): Promise<void> {
    if (this.gachaSceneState.logsLoading && !force) {
      return;
    }
    const poolCode = this.gachaSceneState.selectedPoolCode ?? undefined;
    this.gachaSceneState = {
      ...this.gachaSceneState,
      logsLoading: true,
      logsError: '',
    };
    if (this.currentView === 'gacha' || this.currentView === 'gachaRecord') {
      this.renderCurrentView();
    }
    try {
      const page = await this.api.gacha.logs(1, 30, poolCode);
      this.gachaSceneState = {
        ...this.gachaSceneState,
        logs: page.records ?? [],
        logsLoading: false,
        logsError: '',
      };
      if (this.currentView === 'gacha' || this.currentView === 'gachaRecord') {
        this.renderCurrentView();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.gachaSceneState = {
        ...this.gachaSceneState,
        logsLoading: false,
        logsError: message,
      };
      if (this.currentView === 'gacha' || this.currentView === 'gachaRecord') {
        this.renderCurrentView();
      }
      this.setStatus(`召唤记录读取失败：${message}`);
    }
  }

  private toGachaPreviewPool(pool: GachaPoolVO): GachaPreviewPool {
    const theme = (pool.themeColor ?? '').toLowerCase();
    const displayType = (pool.displayType ?? pool.poolType ?? '').toUpperCase();
    const rarity: GachaRarity = theme === 'red' || displayType === 'LIMITED'
      ? 'SSR'
      : theme === 'blue' || displayType === 'NORMAL'
        ? 'R'
        : displayType === 'LOCKED'
          ? 'UR'
          : 'SR';
    const title = this.trimText(pool.tabTitle || pool.poolName || pool.poolCode).slice(0, 24);
    return {
      id: pool.poolCode,
      poolCode: pool.poolCode,
      poolType: pool.poolType ?? null,
      displayType: pool.displayType ?? null,
      title,
      subline: this.trimText(pool.tabSubtitle || pool.poolType || '召唤卡池').slice(0, 40),
      rarity,
      active: pool.poolCode === this.gachaSceneState.selectedPoolCode,
      locked: Boolean(pool.locked) || pool.status !== 1,
      drawEnabled: pool.drawEnabled === true && !pool.previewOnly && pool.status === 1,
      previewOnly: Boolean(pool.previewOnly),
      logoAsset: pool.logoAsset ?? null,
      tabLogoAsset: pool.tabLogoAsset ?? null,
      logoText: pool.badgeText ?? (displayType === 'LIMITED' ? 'UP' : displayType === 'HERO' ? 'H' : displayType === 'NORMAL' ? 'N' : '锁'),
      themeColor: pool.themeColor ?? null,
      badgeText: pool.badgeText ?? null,
      centerSpineResource: pool.centerSpineResource ?? null,
      centerSpineUuid: pool.centerSpineUuid ?? null,
      centerSpineSkin: pool.centerSpineSkin ?? null,
      centerIntroAnimation: pool.centerIntroAnimation ?? null,
      centerIdleAnimation: pool.centerIdleAnimation ?? null,
      rateNote: pool.rateNote ?? null,
      recordNote: pool.recordNote ?? null,
      exchangeNote: pool.exchangeNote ?? null,
      guaranteeNote: pool.guaranteeNote ?? null,
      buttonSingleText: pool.buttonSingleText ?? null,
      buttonTenText: pool.buttonTenText ?? null,
      buttonDisabledReason: pool.buttonDisabledReason ?? null,
      noticeText: pool.noticeText ?? null,
      singleCost: pool.singleCost ?? null,
      tenCost: pool.tenCost ?? null,
      costCode: pool.costCode ?? null,
      primaryCostType: pool.primaryCostType ?? null,
      primaryCostCode: pool.primaryCostCode ?? null,
      primarySingleCost: pool.primarySingleCost ?? null,
      primaryTenCost: pool.primaryTenCost ?? null,
      backupCostType: pool.backupCostType ?? null,
      backupCostCode: pool.backupCostCode ?? null,
      backupSingleCost: pool.backupSingleCost ?? null,
      backupTenCost: pool.backupTenCost ?? null,
    };
  }

  private isVisibleGachaPool(pool: GachaPreviewPool): boolean {
    const theme = (pool.themeColor ?? '').toLowerCase();
    const displayType = (pool.displayType ?? '').toUpperCase();
    return displayType !== 'HIDDEN' && theme !== 'hidden';
  }

  private createGachaRequestId(poolCode: string, drawCount: 1 | 10): string {
    const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `cocos-${poolCode}-${drawCount}-${Date.now()}-${random}`;
  }

  private startGachaDraw(mode: GachaPreviewResultMode): void {
    if (this.gachaSceneState.drawing || this.pendingGachaDraw) {
      this.setStatus('召唤请求处理中，请勿重复点击。');
      return;
    }
    const pool = this.gachaSceneState.pools.find((item) => item.poolCode === this.gachaSceneState.selectedPoolCode || item.id === this.gachaSceneState.selectedPoolCode);
    if (!pool || !pool.poolCode) {
      this.setStatus('当前卡池缺少真实 poolCode，无法召唤。');
      return;
    }
    if (pool.locked || pool.previewOnly || pool.drawEnabled !== true) {
      this.setStatus(pool.buttonDisabledReason ?? '该卡池暂未开放真实抽卡。');
      return;
    }
    const drawCount: 1 | 10 = mode === 'ten' ? 10 : 1;
    const ticket = this.gachaSummonTicket + 1;
    this.gachaSummonTicket = ticket;
    const requestId = this.createGachaRequestId(pool.poolCode, drawCount);
    this.pendingGachaDraw = { ticket, mode, poolCode: pool.poolCode, drawCount, requestId, result: null, highestRarity: null };
    this.gachaSummonRarity = null;
    this.gachaResultMode = mode;
    this.gachaSceneState = { ...this.gachaSceneState, drawing: true, lastDrawResult: null, error: null, activeAction: null };
    this.renderCurrentView();
    this.setStatus('召唤请求提交中，正在确认契约结果。');
    this.executeGachaDrawBeforeVideo(ticket);
  }

  private executeGachaDrawBeforeVideo(ticket: number): void {
    const pending = this.pendingGachaDraw;
    if (!pending || pending.ticket !== ticket) {
      return;
    }
    void this.api.gacha.draw({ poolCode: pending.poolCode, drawCount: pending.drawCount, requestId: pending.requestId, paymentMode: 'AUTO' })
      .then((result) => {
        if (!this.pendingGachaDraw || this.pendingGachaDraw.ticket !== ticket) {
          return;
        }
        const pending = this.pendingGachaDraw;
        pending.result = result;
        pending.highestRarity = this.resolveGachaDrawResultHighestRarity(result);
        this.presentPendingGachaDrawVideo(ticket);
      })
      .catch((error) => {
        if (!this.pendingGachaDraw || this.pendingGachaDraw.ticket !== ticket) {
          return;
        }
        const pending = this.pendingGachaDraw;
        const message = error instanceof Error ? error.message : String(error);
        this.presentPendingGachaDrawFailure(ticket, message);
      });
  }

  private presentPendingGachaDrawVideo(ticket: number): void {
    const pending = this.pendingGachaDraw;
    if (!pending || pending.ticket !== ticket || !pending.result) {
      return;
    }
    // 跳过动画:不进视频场景,直接走既有收尾(finish 自带 pending→结果页/回读链)。
    if (this.gachaSkipAnimation) {
      this.currentView = 'gachaSummon';
      this.finishGachaSummonVideoScene();
      return;
    }
    this.gachaSummonRarity = pending.highestRarity;
    this.gachaResultMode = pending.mode;
    this.currentView = 'gachaSummon';
    this.renderCurrentView();
    this.setStatus(pending.highestRarity === 'SSR' || pending.highestRarity === 'UR' ? '高阶契约响应，播放稀有召唤影像。' : '契约响应完成，播放召唤影像。');
  }

  private finishGachaSummonVideoScene(): void {
    if (this.currentView !== 'gachaSummon') {
      return;
    }
    const pending = this.pendingGachaDraw;
    if (!pending || !pending.result) {
      return;
    }
    this.presentPendingGachaDrawResult(pending.ticket);
  }

  private presentPendingGachaDrawResult(ticket: number): void {
    const pending = this.pendingGachaDraw;
    if (!pending || pending.ticket !== ticket || !pending.result) {
      return;
    }
    const result = pending.result;
    this.pendingGachaDraw = null;
    this.gachaSummonRarity = null;
    this.gachaSceneState = { ...this.gachaSceneState, drawing: false, lastDrawResult: result };
    this.gachaResultMode = pending.mode;
    this.currentView = 'gachaResult';
    this.renderCurrentView();
    this.setStatus(`召唤完成：${result.drawNo}`);
    void this.loadGachaPity(pending.poolCode);
    void this.refreshReadonlyAssetsAfterGacha();
  }

  private presentPendingGachaDrawFailure(ticket: number, message: string): void {
    const pending = this.pendingGachaDraw;
    if (!pending || pending.ticket !== ticket) {
      return;
    }
    this.pendingGachaDraw = null;
    this.gachaSummonRarity = null;
    this.gachaSceneState = { ...this.gachaSceneState, drawing: false, error: message };
    this.currentView = 'gacha';
    this.renderCurrentView();
    this.setStatus(`召唤失败：${message}`);
  }

  private resolveGachaDrawResultHighestRarity(result: GachaDrawResultVO): GachaRarity | null {
    return result.items.reduce<GachaRarity | null>((highest, item) => {
      const rarity = this.normalizeGachaRarity(item.rarity);
      if (!rarity) {
        return highest;
      }
      return this.compareGachaRarity(rarity, highest) > 0 ? rarity : highest;
    }, null);
  }

  private compareGachaRarity(left: string | null | undefined, right: string | null | undefined): number {
    const ranks: Record<GachaRarity, number> = { R: 0, SR: 1, SSR: 2, UR: 3 };
    const leftRarity = this.normalizeGachaRarity(left);
    const rightRarity = this.normalizeGachaRarity(right);
    return (leftRarity ? ranks[leftRarity] : -1) - (rightRarity ? ranks[rightRarity] : -1);
  }

  private normalizeGachaRarity(value: string | null | undefined): GachaRarity | null {
    const normalized = (value ?? '').trim().toUpperCase();
    return normalized === 'R' || normalized === 'SR' || normalized === 'SSR' || normalized === 'UR' ? normalized : null;
  }

  private openGachaMockRevealScene(mode: GachaPreviewResultMode): void {
    this.gachaResultMode = mode;
    this.currentView = 'gachaReveal';
    this.renderCurrentView();
    this.setStatus('召唤演出为本地 mock：不生成 drawNo、不扣资源、不发英雄。');
  }

  private closeGachaMockRevealScene(): void {
    if (this.currentView !== 'gachaReveal') {
      return;
    }
    this.gachaResultMode = null;
    this.currentView = 'gacha';
    this.renderCurrentView();
  }

  private openGachaMockResultScene(mode: GachaPreviewResultMode): void {
    this.gachaResultMode = mode;
    this.currentView = 'gachaResult';
    this.renderCurrentView();
    this.setStatus('本地结果预览：不扣资源、不发英雄、不写入抽卡记录或保底。');
  }

  private closeGachaMockResultScene(): void {
    if (this.currentView !== 'gachaResult') {
      return;
    }
    this.gachaResultMode = null;
    this.currentView = 'gacha';
    this.renderCurrentView();
  }

  private closeGachaScene(): void {
    if (this.currentView === 'gachaSummon') {
      this.setStatus('召唤视频正在播放，请稍候。');
      return;
    }
    if (this.gachaSceneState.drawing || this.pendingGachaDraw) {
      this.setStatus('召唤请求处理中，请稍候。');
      return;
    }
    if (this.currentView !== 'gacha' && this.currentView !== 'gachaReveal' && this.currentView !== 'gachaResult' && !this.isGachaActionSceneView(this.currentView)) {
      return;
    }
    this.gachaResultMode = null;
    this.currentView = 'lobby';
    this.renderCurrentView();
  }

  private closeLobbyNoticePanel(): void {
    if (!this.lobbyNoticePanelOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyNoticePanel(): void {
    this.removeNodeFromContent('LobbyNoticeDim');
    this.removeNodeFromContent('LobbyNoticePanel');
    this.removeNodeFromContent('LobbyNoticeSceneContent');
  }

  private reloadLobbyNotices(): void {
    void this.loadLobbyNotices(true);
  }

  private currentLobbyNoticeState(): LobbyNoticePanelState {
    return this.lobbyNoticeLoader.currentState();
  }

  private openLobbySettingsPanel(): void {
    if (this.lobbySettingsPanelOpen && this.currentView === 'settings') {
      return;
    }
    this.closeAllLobbyScenePanelFlags();
    this.lobbySettingsPanelOpen = true;
    this.currentView = 'settings';
    this.renderCurrentView();
  }

  private closeLobbySettingsPanel(): void {
    if (!this.lobbySettingsPanelOpen) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removeLobbySettingsPanel(): void {
    this.removeNodeFromContent('LobbySettingsDim');
    this.removeNodeFromContent('LobbySettingsSceneContent');
  }

  private setLobbyLanguage(language: LootChainLanguage): void {
    lootChainI18n.setLanguage(language);
    this.renderCurrentView();
    this.refreshLocalizedPlayerDataAfterLanguageChange();
    this.setStatus(lootChainI18n.t('language.changed', { language: lootChainI18n.languageLabel(language) }));
  }

  private refreshLocalizedPlayerDataAfterLanguageChange(): void {
    const profile = this.currentLobbyProfile();
    void this.loadLobbyProfile(profile.userId);
    void this.loadLobbyNotices(true);
    void this.loadLobbyAdventure(true);
    void this.loadLobbyHeroRoster(true);
    void this.loadLobbyCodex(true);
    void this.loadLobbyBag(true);
    void this.loadLobbyBattleRecent(true);
    void this.loadGachaPools(true);
    if (this.gachaSceneState.selectedPoolCode) {
      void this.loadGachaPoolDetail(this.gachaSceneState.selectedPoolCode, true);
      void this.loadGachaPity(this.gachaSceneState.selectedPoolCode);
    }
  }

  private openLobbyPlaceholderDialog(title: string, detail?: string): void {
    const safeTitle = this.trimText(title || '大厅入口');
    const safeDetail = this.trimText(detail || '当前阶段仅开放登录、大厅只读展示和玩家资料查看。该入口暂不连接玩法或经济写接口。');
    // 先统一清面板标志,再立占位弹窗(closeAll 会把 placeholder 置空,顺序不能反)。
    this.closeAllLobbyScenePanelFlags();
    this.lobbyPlaceholderDialog = {
      title: safeTitle,
      detail: safeDetail,
    };
    this.setStatus(`${safeTitle} 暂未开放。`);
    this.currentView = 'placeholder';
    this.renderCurrentView();
  }

  private closeLobbyPlaceholderDialog(): void {
    if (!this.lobbyPlaceholderDialog) {
      return;
    }
    this.returnToLobbyFromScenePage();
  }

  private removeLobbyPlaceholderDialog(): void {
    this.removeNodeFromContent('LobbyPlaceholderSceneRoot');
    this.removeNodeFromContent('LobbyPlaceholderScenePanel');
  }

  private async loadLobbyProfile(userId: number): Promise<void> {
    await this.lobbyProfileLoader.load(userId);
  }

  private async loadLobbyNotices(force = false): Promise<void> {
    await this.lobbyNoticeLoader.load(force);
  }

  private async loadLobbyCodex(force = false): Promise<void> {
    await this.lobbyCodexLoader.load(force);
  }

  private async loadLobbyBag(force = false): Promise<void> {
    await this.lobbyBagLoader.load(force);
  }

  private async loadLobbyBagItemSource(itemCode: string, force = false): Promise<void> {
    await this.lobbyBagLoader.loadSource(itemCode, force);
  }

  private async loadLobbyHeroRoster(force = false): Promise<void> {
    await this.lobbyHeroRosterLoader.load(force);
    const selectionBefore = this.selectedLobbyFormationHeroIds.join(',');
    // 名单就绪后,登录本会话首次拉取服务端已保存阵容做还原(在 reconcile 默认填充之前)。
    await this.restoreLobbyFormationFromServerOnce();
    const reconcileChanged = this.reconcileLobbyFormationSelection();
    // 还原或 reconcile 任一改动了阵容都要重绘:大厅挂机演出/编队页需按最新阵容刷新。
    const selectionChanged = reconcileChanged || this.selectedLobbyFormationHeroIds.join(',') !== selectionBefore;
    if (selectionChanged) {
      if (this.currentView === 'formation' || this.currentView === 'heroes' || this.currentView === 'heroDetail') {
        this.renderCurrentView();
      } else if (this.currentView === 'lobby') {
        this.refreshLobbyOverlay();
      }
    }
  }

  private async loadLobbyAdventure(force = false): Promise<void> {
    await this.lobbyAdventureLoader.load(force);
  }

  private async loadLobbyBattleRecent(force = false): Promise<void> {
    await this.lobbyBattleFlow.loadRecentBattles(force);
  }

  // ===== 挂机收益闭环(服务端权威计费) =====

  private currentIdleSummary(): PlayerIdleSummaryVO | null {
    return this.idleSummary;
  }

  private isIdleClaiming(): boolean {
    return this.idleClaiming;
  }

  private async loadIdleSummary(force = false): Promise<void> {
    if (this.idleSummaryLoading) {
      return;
    }
    if (!force && this.idleSummary) {
      return;
    }
    this.idleSummaryLoading = true;
    try {
      this.idleSummary = await this.api.idle.summary();
      if (this.currentView === 'lobby') {
        this.refreshLobbyOverlay();
      }
    } catch (error) {
      console.warn('[LootChain] idle summary load failed:', error);
    } finally {
      this.idleSummaryLoading = false;
    }
  }

  private claimIdleReward(): void {
    if (this.idleClaiming) {
      return;
    }
    const summary = this.idleSummary;
    if (!summary || !summary.claimable) {
      this.setStatus('挂机时长不足，稍后再来领取。');
      return;
    }
    this.idleClaiming = true;
    this.refreshLobbyOverlay();
    void this.api.idle.claim()
      .then(async (result) => {
        const bookText = result.expBookCount > 0 ? `、经验书 x${result.expBookCount}` : '';
        this.setStatus(`挂机收益已领取：金币 +${result.goldAmount.toLocaleString('en-US')}${bookText}`);
        await this.loadIdleSummary(true);
        const profile = this.currentLobbyProfile();
        void this.loadLobbyProfile(profile.userId);
        void this.loadLobbyBag(true);
      })
      .catch((error) => {
        this.setStatus(`挂机收益领取失败：${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        this.idleClaiming = false;
        if (this.currentView === 'lobby') {
          this.refreshLobbyOverlay();
        }
      });
  }

  private isAutoChallengeEnabled(): boolean {
    return this.autoChallengeEnabled;
  }

  private toggleAutoChallenge(): void {
    this.autoChallengeEnabled = !this.autoChallengeEnabled;
    this.setStatus(this.autoChallengeEnabled
      ? '自动挑战已开启：战斗胜利结算后将自动进入下一关。'
      : '自动挑战已关闭。');
    this.refreshLobbyOverlay();
  }

  // 战斗结算落库后的闭环回调:回读进度/资料/背包/挂机,并按开关续战下一关。
  private onBattleSettlementRecorded(): void {
    void this.handleBattleSettlementRecorded();
  }

  private async handleBattleSettlementRecorded(): Promise<void> {
    const settlement = this.lobbyBattleFlow.currentState().settlement;
    await this.loadLobbyAdventure(true);
    const profile = this.currentLobbyProfile();
    void this.loadLobbyProfile(profile.userId);
    void this.loadLobbyBag(true);
    void this.loadLobbyBattleRecent(true);
    void this.loadIdleSummary(true);
    if (!this.autoChallengeEnabled) {
      return;
    }
    if (!settlement || settlement.result !== 'WIN') {
      this.autoChallengeEnabled = false;
      this.setStatus('自动挑战已停止：本场战斗未获胜。');
      return;
    }
    const nextStageCode = settlement.mainlineProgress?.unlockedStageCode ?? '';
    if (!/^MAIN_\d+_\d+$/.test(nextStageCode)) {
      this.autoChallengeEnabled = false;
      this.setStatus('自动挑战已停止：该关卡无新的推进。');
      return;
    }
    // 留出结算回执展示时间再续战。
    await new Promise((resolve) => setTimeout(resolve, 4000));
    if (!this.autoChallengeEnabled || this.currentView !== 'battle') {
      return;
    }
    this.setStatus(`自动挑战：进入 ${nextStageCode}`);
    this.openLobbyBattlePreviewPanel(nextStageCode);
    this.startLobbyBattleSession();
  }

  private refreshLobbyReadonlyStateAfterBattle(): void {
    const profile = this.currentLobbyProfile();
    void this.loadLobbyProfile(profile.userId);
    void this.loadLobbyAdventure(true);
    void this.loadLobbyBag(true);
    void this.loadLobbyHeroRoster(true);
    void this.loadLobbyBattleRecent(true);
  }

  private async refreshReadonlyAssetsAfterGacha(): Promise<void> {
    const userId = this.currentLobbyProfile().userId;
    await this.loadLobbyProfile(userId);
    await this.loadLobbyHeroRoster(true);
    // 结果卡详情要读装备属性/材料持有:抽完顺带回读背包与装备列表。
    await this.loadLobbyBag(true);
    this.lobbyEquipmentItems = await this.api.equipment.list();
    if (this.currentView === 'gacha' || this.currentView === 'gachaResult' || this.isGachaActionSceneView(this.currentView)) {
      this.renderCurrentView();
    }
  }

  private currentLobbyProfile(): PlayerLobbyProfileVO {
    return this.lobbyProfileLoader.currentProfile();
  }

  private isLobbyProfileLoading(): boolean {
    return this.lobbyProfileLoader.loading;
  }

  private getLobbyProfileError(): string {
    return this.lobbyProfileLoader.error;
  }

  private renderBase(): UiLayout {
    this.setLoginSceneStageVisible(this.isLoginSceneView(this.currentView));
    const layout = this.resolveLayout();
    this.applyRootSize(layout);
    this.layoutKey = this.makeLayoutKey();
    this.setPointerCursor(false);
    this.releaseLobbyVideoRuntime();
    this.statusPresenter.reset();
    // 整页重绘会清空 UI 根；局部 overlay 刷新不要走这个路径。
    // 注:已登记为可复用的场景页顶层节点会被 clear() 摘下暂存(不销毁),供下次原样挂回。
    this.contentRootController.clear();
    return layout;
  }

  // 会话级切换(登录/加载)清空复用缓存,避免复用到失效或上个账号的旧节点。
  private invalidateReusableScenes(): void {
    this.contentRootController.dropAllStashed();
    this.lobbyHeroRosterReuseSignature = null;
    this.lobbyBagReuseSignature = null;
  }

  private renderLobbyWorldBase(): UiLayout {
    this.setLoginSceneStageVisible(false);
    const layout = this.resolveLayout();
    this.applyRootSize(layout);
    this.layoutKey = this.makeLayoutKey();
    this.setPointerCursor(false);
    this.statusPresenter.reset();
    // 大厅功能页只替换 HUD/页面层，保留已在播放的大厅 poster/video，避免露出登录背景。
    this.contentRootController.clearExcept(LOBBY_BACKGROUND_NODE_NAMES);
    return layout;
  }

  private renderLobbyBackground(layout: UiLayout): void {
    this.lobbyBackgroundController.render(layout);
  }

  private renderLobbyFeatureSceneBackdrop(layout: UiLayout): void {
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const backdrop = this.addRect('LobbyFeatureSceneBackdrop', centerX, centerY, layout.width, layout.height, new Color(2, 2, 5, 255));
    backdrop.fillColor = new Color(12, 8, 10, 230);
    backdrop.rect(layout.stageLeft - centerX, layout.stageBottom - centerY, layout.stageWidth, layout.stageHeight);
    backdrop.fill();
    backdrop.fillColor = new Color(72, 10, 16, 74);
    backdrop.circle(layout.stageRight - centerX - layout.stageWidth * 0.2, layout.stageTop - centerY - layout.stageHeight * 0.22, Math.min(layout.stageWidth, layout.stageHeight) * 0.42);
    backdrop.fill();
    backdrop.strokeColor = new Color(154, 105, 48, 86);
    backdrop.lineWidth = Math.max(1, 1.4 * layout.uiScale);
    backdrop.moveTo(layout.stageLeft - centerX + 28 * layout.uiScale, layout.stageTop - centerY - 72 * layout.uiScale);
    backdrop.lineTo(layout.stageRight - centerX - 28 * layout.uiScale, layout.stageTop - centerY - 72 * layout.uiScale);
    backdrop.moveTo(layout.stageLeft - centerX + 28 * layout.uiScale, layout.stageBottom - centerY + 70 * layout.uiScale);
    backdrop.lineTo(layout.stageRight - centerX - 28 * layout.uiScale, layout.stageBottom - centerY + 70 * layout.uiScale);
    backdrop.stroke();
  }

  private resizeLobbyBackground(layout: UiLayout): void {
    this.lobbyBackgroundController.resize(layout);
  }

  private tryPlayLobbyVideo(): void {
    this.lobbyBackgroundController.tryPlay();
  }

  private updateLobbyPosterFade(deltaTime: number): void {
    this.lobbyBackgroundController.update(deltaTime);
  }

  private releaseLobbyVideoRuntime(): void {
    this.lobbyBackgroundController.release();
  }

  private updateGachaConfigRefresh(deltaTime: number): void {
    if (this.currentView !== 'gacha') {
      this.gachaConfigRefreshElapsed = 0;
      return;
    }
    if (this.gachaSceneState.loading || this.gachaSceneState.drawing) {
      return;
    }
    this.gachaConfigRefreshElapsed += deltaTime;
    if (this.gachaConfigRefreshElapsed < 15) {
      return;
    }
    this.gachaConfigRefreshElapsed = 0;
    void this.loadGachaPools(true);
  }

  private isLobbyViewActive(): boolean {
    return this.currentView === 'lobby' || this.isLobbyScenePageView(this.currentView);
  }

  private isGachaActionSceneView(view: ViewName): boolean {
    return this.gachaActionForView(view) !== null;
  }

  private gachaActionForView(view: ViewName): GachaActionKey | null {
    if (view === 'gachaInfo') {
      return 'info';
    }
    if (view === 'gachaRecord') {
      return 'record';
    }
    if (view === 'gachaExchange') {
      return 'exchange';
    }
    if (view === 'gachaPoolContent') {
      return 'pool';
    }
    return null;
  }

  private viewForGachaAction(action: GachaActionKey): ViewName {
    if (action === 'info') {
      return 'gachaInfo';
    }
    if (action === 'record') {
      return 'gachaRecord';
    }
    if (action === 'exchange') {
      return 'gachaExchange';
    }
    return 'gachaPoolContent';
  }

  private isLoginSceneView(view: ViewName): boolean {
    return view === 'login' || view === 'loginAccount';
  }

  private setLoginSceneStageVisible(visible: boolean): void {
    // 登录页当前只允许展示 Login_BG_Poster / Login_BG_Video；旧静态舞台层会压住视频，统一关闭。
    for (const nodeName of LOGIN_SCENE_BACKGROUND_NODE_NAMES) {
      const stageNode = this.node.getChildByName(nodeName);
      if (!stageNode) {
        continue;
      }
      stageNode.active = visible;
      if (visible) {
        this.tryPlayLoginSceneVideo(stageNode);
      }
    }
    for (const nodeName of LOGIN_SCENE_LEGACY_NODE_NAMES) {
      const stageNode = this.node.getChildByName(nodeName);
      if (stageNode) {
        stageNode.active = false;
      }
    }
  }

  private tryPlayLoginSceneVideo(node: Node): void {
    for (const background of node.getComponents(LoginVideoBackground)) {
      background.resumeForLoginView();
    }
    for (const video of node.getComponents(VideoPlayer)) {
      try {
        video.mute = true;
        video.volume = 0;
        video.play();
      } catch (error) {
        console.warn('[LootChain] login background video play failed:', error);
      }
    }
    for (const child of node.children) {
      this.tryPlayLoginSceneVideo(child);
    }
  }

  private showLobbyLoadingView(): void {
    this.currentView = 'loading';
    this.renderLoading();
  }

  private refreshLobbyLoadingView(): void {
    if (this.currentView === 'loading') {
      this.renderLoading();
    }
  }

  private setLobbyBackgroundResources(posterFrame: SpriteFrame, videoClip: VideoClip | null): void {
    this.lobbyBackgroundController.setResources(posterFrame, videoClip);
  }

  private enterLobbyView(): void {
    this.currentView = 'lobby';
    this.renderLobby();
    void this.loadIdleSummary();
  }

  private addLobbyAvatar(parent: Node, x: number, y: number, size: number, displayName: string): void {
    this.lobbyAvatarRenderer.add(parent, x, y, size, displayName);
  }


  private addBeveledPanelNode(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel = 10): Node {
    return this.uiPrimitiveFactory.addBeveledPanelNode(name, x, y, width, height, fill, stroke, bevel);
  }

  private addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel = 10): Node {
    return this.uiPrimitiveFactory.addChildBeveledPanelNode(parent, name, x, y, width, height, fill, stroke, bevel);
  }

  private addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
    return this.uiPrimitiveFactory.addChildPlainNode(parent, name, x, y, width, height);
  }

  private drawBeveledPanelOnNode(node: Node, width: number, height: number, fill: Color, stroke: Color, bevel: number): Graphics {
    return this.uiPrimitiveFactory.drawBeveledPanelOnNode(node, width, height, fill, stroke, bevel);
  }

  private setLoginInputs(accountInput: EditBox | null, passwordInput: EditBox | null): void {
    this.loginFlow.setInputs(accountInput, passwordInput);
  }

  private setProtagonistNameInput(input: EditBox | null): void {
    this.protagonistCreateFlow.setNameInput(input);
  }

  private openLoginAccountScene(): void {
    this.renderLoginAccountScene();
  }

  private openLoginLanguageDialog(): void {
    this.currentView = 'login';
    this.loginLanguageDialogOpen = true;
    this.renderLogin();
  }

  private closeLoginLanguageDialog(): void {
    if (!this.loginLanguageDialogOpen) {
      return;
    }
    this.loginLanguageDialogOpen = false;
    this.renderLogin();
  }

  private selectLoginLanguage(language: LootChainLanguage): void {
    const nextLanguage = lootChainI18n.setLanguage(language);
    this.loginLanguageDialogOpen = false;
    this.renderLogin();
    this.setStatus(lootChainI18n.t('language.changed', { language: lootChainI18n.languageLabel(nextLanguage) }));
  }

  private submitLogin(): void {
    this.run(() => this.loginFlow.login());
  }

  private toggleLoginAgreement(): void {
    this.loginFlow.toggleAgreement();
    this.renderLoginAccountScene();
  }

  private showProtagonistCreateView(): void {
    this.renderProtagonistCreate();
  }

  private handleLoginSuccess(userId: number, tokenName: string): void {
    this.protagonistCreateFlow.handleLoginSuccess(userId, tokenName);
  }

  private selectProtagonistGender(gender: ProtagonistGender): void {
    this.protagonistCreateFlow.selectGender(gender);
  }

  private previewProtagonistForm(form: ProtagonistForm): void {
    this.protagonistCreateFlow.previewForm(form);
  }

  private submitProtagonistCreate(): void {
    this.protagonistCreateFlow.submitCreate();
  }

  private setApiBaseUrl(baseUrl: string): void {
    this.api.setApiBaseUrl(baseUrl);
  }

  private resetLobbyProfileForLogin(userId: number): void {
    // 切换登录用户时必须清空上一位玩家资料，防止大厅左上角短暂显示旧数据。
    this.lobbyProfileLoader.resetForLogin(userId);
    this.lobbyAdventureLoader.resetForLogin();
    this.lobbyBagLoader.resetForLogin();
    this.lobbyBattleFlow.resetForLogin();
    this.lobbyCodexLoader.resetForLogin();
    this.lobbyHeroRosterLoader.resetForLogin();
    this.lobbyNoticeLoader.resetForLogin();
    this.selectedLobbyStageCode = null;
    this.selectedLobbyFormationHeroIds = [];
    this.closeAllLobbyScenePanelFlags();
    this.gachaResultMode = null;
    this.pendingGachaDraw = null;
    this.gachaSummonRarity = null;
    this.gachaSummonTicket += 1;
    this.gachaSceneState = {
      ...this.gachaSceneState,
      drawing: false,
      error: null,
      lastDrawResult: null,
      activeAction: null,
    };
  }

  private loadLobbyProfileAfterLogin(userId: number): void {
    void this.loadLobbyProfile(userId);
    void this.loadLobbyNotices();
    void this.loadLobbyAdventure();
    void this.loadLobbyBattleRecent();
    void this.loadLobbyHeroRoster();
  }

  private startLobbyLoading(tokenName: string): void {
    this.lobbyLoadingFlow.start(tokenName);
  }

  private currentProtagonistCreateState(): ProtagonistCreateFormState {
    return this.protagonistCreateFlow.currentState();
  }

  private retryLobbyLoading(): void {
    this.lobbyLoadingFlow.retry(this.loginFlow.lastTokenName);
  }

  private addStatus(text: string, layout?: UiLayout, y?: number): void {
    this.statusPresenter.add(text, layout, y);
  }

  private setStatus(text: string): void {
    if (this.currentView === 'gacha' || this.currentView === 'gachaReveal' || this.currentView === 'gachaSummon' || this.currentView === 'gachaResult' || this.isGachaActionSceneView(this.currentView)) {
      const layout = this.resolveLayout();
      const gachaStatusY = layout.stageBottom + 210 * layout.uiScale;
      this.statusPresenter.set(text, layout, gachaStatusY);
      return;
    }
    this.statusPresenter.set(text);
  }

  private addLabel(text: string, x: number, y: number, size = 20, color = new Color(230, 230, 230), contentSize?: Size): Label {
    return this.uiPrimitiveFactory.addLabel(text, x, y, size, color, contentSize);
  }

  private addEditBox(initialText: string, x: number, y: number, width: number, layout?: UiLayout, password = false): EditBox {
    return this.uiPrimitiveFactory.addEditBox(initialText, x, y, width, layout, password);
  }

  private applyPasswordMask(editBox: EditBox, textLabel: Label): void {
    this.uiPrimitiveFactory.applyPasswordMask(editBox, textLabel);
  }

  private addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password = false): EditBox {
    return this.uiPrimitiveFactory.addFramedEditBox(initialText, x, y, width, layout, password);
  }

  private addButton(text: string, x: number, y: number, callback: () => void, layout?: UiLayout, width?: number, height?: number): Button {
    return this.uiPrimitiveFactory.addButton(text, x, y, callback, layout, width, height);
  }

  private addGoldButton(text: string, x: number, y: number, callback: () => void, layout: UiLayout, width: number, height: number): Button {
    return this.uiPrimitiveFactory.addGoldButton(text, x, y, callback, layout, width, height);
  }

  private addImageButton(
    name: string,
    assetPath: string,
    text: string,
    x: number,
    y: number,
    callback: () => void,
    layout: UiLayout,
    width: number,
    height: number,
    fontSize: number,
  ): Button {
    return this.uiPrimitiveFactory.addImageButton(name, assetPath, text, x, y, callback, layout, width, height, fontSize);
  }

  private addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null {
    return this.uiPrimitiveFactory.addSprite(name, assetPath, x, y, width, height, parent);
  }

  private addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    size: number,
    color: Color,
    contentSize: Size,
    horizontalAlign: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
  ): Label {
    return this.uiPrimitiveFactory.addChildLabel(parent, name, text, x, y, size, color, contentSize, horizontalAlign);
  }

  private resolveAlignedLabelX(x: number, width: number, horizontalAlign: HorizontalTextAlignment): number {
    return this.uiPrimitiveFactory.resolveAlignedLabelX(x, width, horizontalAlign);
  }

  private addAccountGlyph(parent: Node, x: number, y: number, scale: number): void {
    this.uiPrimitiveFactory.addAccountGlyph(parent, x, y, scale);
  }

  private addRect(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke?: Color, lineWidth = 1): Graphics {
    return this.uiPrimitiveFactory.addRect(name, x, y, width, height, fill, stroke, lineWidth);
  }

  private addBeveledPanel(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel = 10): Graphics {
    return this.uiPrimitiveFactory.addBeveledPanel(name, x, y, width, height, fill, stroke, bevel);
  }

  private addProgressBar(x: number, y: number, width: number, height: number, progress: number): void {
    this.uiPrimitiveFactory.addProgressBar(x, y, width, height, progress);
  }

  private applyButtonVisual(node: Node, width: number, height: number): void {
    this.uiPrimitiveFactory.applyButtonVisual(node, width, height);
  }

  private applyImageButtonFeedback(node: Node, hoverScale = 1.035, pressedScale = 0.975): void {
    this.uiPrimitiveFactory.applyImageButtonFeedback(node, hoverScale, pressedScale);
  }

  private applyPointerCursor(node: Node): void {
    this.uiPrimitiveFactory.applyPointerCursor(node);
  }

  private setPointerCursor(enabled: boolean): void {
    const maybeDocument = (globalThis as { document?: CursorDocument }).document;
    const style = maybeDocument?.body?.style;
    if (style) {
      style.cursor = enabled ? 'pointer' : '';
    }
  }

  private preloadUiSprites(): void {
    this.uiSpriteFrameCache.preload(this.uiSpriteFrameOverrides());
  }

  private uiSpriteFrameOverrides(): UiSpriteFrameOverrides {
    return {
      logoFrame: this.logoFrame,
      mainButtonFrame: this.mainButtonFrame,
      rightRailFrames: this.rightRailFrames,
    };
  }

  private drawButtonFrame(graphics: Graphics, width: number, height: number, state: ButtonVisualState): void {
    this.uiPrimitiveFactory.drawButtonFrame(graphics, width, height, state);
  }

  // 装备详情卡"已穿戴:英雄名"反查(EquipCardHost 可选接口,花名册未载入时回退通用文案)。
  private resolveHeroName(heroId: number): string | null {
    const hero = this.lobbyHeroRosterLoader.currentState().heroes.find((item) => item.id === heroId);
    return hero ? hero.heroName : null;
  }

  // 战力变动浮字:委托渲染器实现(UI 原语不允许出现在 GameRoot,见 check-layout)。
  private spawnPowerDeltaFloat(delta: number): void {
    this.lobbyHeroDetailPanelRenderer.spawnPowerDeltaFloat(delta);
  }

  // 奖励飘字(背包使用等):委托渲染器(UI 原语不进 GameRoot)。
  private spawnRewardFloats(messages: string[]): void {
    this.lobbyHeroDetailPanelRenderer.spawnRewardFloats(messages);
  }

  // 详情左右切换英雄(参考图1):在花名册可查看列表(含主角,过滤 EX)里循环切换。
  private switchLobbyHeroDetail(direction: number): void {
    const heroes = this.lobbyHeroRosterLoader.currentState().heroes
      .filter((hero) => hero.id > 0 && hero.rarity.toUpperCase() !== 'EX' && !hero.heroCode.toUpperCase().startsWith('EX_'));
    if (heroes.length <= 1 || this.lobbyHeroDetailHeroId === null) {
      return;
    }
    const index = heroes.findIndex((hero) => hero.id === this.lobbyHeroDetailHeroId);
    const next = heroes[(index + (direction >= 0 ? 1 : -1) + heroes.length) % heroes.length];
    if (next && next.id !== this.lobbyHeroDetailHeroId) {
      this.openLobbyHeroDetail(next.id);
    }
  }

  private createUiNode(name: string): Node {
    return this.contentRootController.createNode(name);
  }

  private removeNodeFromContent(name: string): void {
    this.contentRootController.removeNode(name);
  }

  private ensureContentRoot(): Node {
    return this.contentRootController.ensure();
  }

  private run(action: AsyncAction): void {
    this.setStatus('请求中...');
    action().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message);
    });
  }

  private formatInteger(value: number | null | undefined): string {
    return formatUiInteger(value);
  }

  private compactResourceValue(value: number | null | undefined): string {
    return compactUiResourceValue(value);
  }

  private trimText(text: string): string {
    return trimUiText(text);
  }

  private resolveLayout(): UiLayout {
    return this.layoutResolver.resolve();
  }

  private applyRootSize(layout: UiLayout): void {
    this.contentRootController.applyRootSize(layout);
  }

  private makeLayoutKey(): string {
    const layout = this.resolveLayout();
    const stageKey = `${Math.round(layout.stageLeft)},${Math.round(layout.stageBottom)},${Math.round(layout.stageWidth)}x${Math.round(layout.stageHeight)}`;
    // Cocos Preview 在固定设计分辨率下可能只改变浏览器物理视口，必须纳入 key 才会重排 HUD。
    const viewportKey = `${Math.round(layout.viewportWidth)}x${Math.round(layout.viewportHeight)}`;
    const languageKey = lootChainI18n.currentLanguage();
    const gachaOpen = this.currentView === 'gacha' || this.currentView === 'gachaReveal' || this.currentView === 'gachaSummon' || this.currentView === 'gachaResult' || this.isGachaActionSceneView(this.currentView);
    return `${this.currentView}:${languageKey}:${layout.width}x${layout.height}:${viewportKey}:${stageKey}:${this.loginLanguageDialogOpen ? 'login-language-open' : 'login-language-closed'}:${this.loginFlow.agreementAccepted ? 'agree' : 'deny'}:${this.protagonistCreateFlow.version}:${this.lobbyProfileOpen ? 'profile-open' : 'profile-closed'}:${this.lobbyAdventurePanelOpen ? 'adventure-open' : 'adventure-closed'}:${this.lobbyAdventureLoader.version}:${this.lobbyBagPanelOpen ? 'bag-open' : 'bag-closed'}:${this.lobbyBagLoader.version}:${this.selectedLobbyStageCode}:${this.lobbyBattlePreviewPanelOpen ? 'battle-open' : 'battle-closed'}:${this.lobbyBattleFlow.currentState().version}:${this.lobbyCodexPanelOpen ? 'codex-open' : 'codex-closed'}:${this.lobbyCodexLoader.version}:${this.lobbyFormationPanelOpen ? 'formation-open' : 'formation-closed'}:${this.selectedLobbyFormationHeroIds.join(',')}:${this.lobbyHeroRosterPanelOpen ? 'heroes-open' : 'heroes-closed'}:${this.lobbyHeroDetailHeroId ?? 'detail-closed'}:${this.lobbyHeroLevelUpBusyId ?? 'hero-level-idle'}:${this.lobbyHeroRosterLoader.version}:${this.lobbyNoticePanelOpen ? 'notice-open' : 'notice-closed'}:${this.lobbyNoticeLoader.version}:${this.lobbySettingsPanelOpen ? 'settings-open' : 'settings-closed'}:${gachaOpen ? 'gacha-open' : 'gacha-closed'}:${this.gachaSceneState.activeAction ?? 'gacha-action-closed'}:${this.gachaSceneState.selectedPoolCode ?? 'gacha-pool-none'}:${this.gachaSceneState.poolDetailLoading ? 'gacha-detail-loading' : 'gacha-detail-idle'}:${this.gachaSceneState.logsLoading ? 'gacha-logs-loading' : 'gacha-logs-idle'}:${this.gachaSceneState.poolDetail?.items.length ?? 0}:${this.gachaSceneState.logs.length}:${this.gachaResultMode ?? 'gacha-result-closed'}:${this.lobbyPlaceholderDialog ? 'placeholder-open' : 'placeholder-closed'}:${this.lobbyDailyDungeonPanelOpen ? 'daily-open' : 'daily-closed'}:${this.lobbyDailyDungeonState.version}`;
  }

  private resolveLobbyStageCode(stageCode?: string | null): string | null {
    const value = (stageCode ?? '').trim().toUpperCase();
    return /^MAIN_\d+_\d+$/.test(value) || isDailyDungeonStageCode(value) ? value : null;
  }

  private resolveDefaultLobbyFormationStageCode(): string | null {
    const adventure = this.lobbyAdventureLoader.currentState().adventure;
    if (!adventure) {
      return null;
    }
    const stages = adventure.chapters.flatMap((chapter) => chapter.stages);
    const recommendedCode = this.resolveLobbyStageCode(adventure.recommendedStageCode);
    const stage = (recommendedCode ? stages.find((item) => item.stageCode === recommendedCode) : null)
      ?? stages.find((item) => item.recommended && item.unlocked)
      ?? [...stages].reverse().find((item) => item.unlocked)
      ?? null;
    return stage ? stage.stageCode : null;
  }

  private findLobbyAdventureStage(stageCode: string): LobbyAdventureStageVO | null {
    if (isDailyDungeonStageCode(stageCode)) {
      return this.syntheticDailyDungeonStage(stageCode);
    }
    const adventure = this.lobbyAdventureLoader.currentState().adventure;
    if (!adventure) {
      return null;
    }
    return adventure.chapters
      .flatMap((chapter) => chapter.stages)
      .find((stage) => stage.stageCode === stageCode) ?? null;
  }

  private canOpenLobbyBattleEntryStage(stage: LobbyAdventureStageVO | null): boolean {
    return !!stage && stage.unlocked && (isAnnualMainlineStage(stage.stageCode) || isDailyDungeonStageCode(stage.stageCode));
  }

  // 每日副本没有爬塔配置节点,为战斗入口合成只读 stage;开放日/次数/解锁的权威校验在后端 battles/start。
  private syntheticDailyDungeonStage(stageCode: string): LobbyAdventureStageVO {
    let stageName = stageCode;
    const summary = this.lobbyDailyDungeonState.summary;
    if (summary) {
      for (const theme of summary.themes) {
        const tier = theme.tiers.find((item) => item.stageCode === stageCode);
        if (tier) {
          stageName = `${theme.name} · 难度${['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][tier.tier] ?? tier.tier}`;
          break;
        }
      }
    }
    return {
      stageCode,
      stageName,
      orderNo: 0,
      unlocked: true,
      recommended: false,
      requiredLevel: 0,
      recommendedPower: 0,
      enemySummary: '每日材料副本敌阵',
      rewardPreview: [],
      statusLabel: '每日副本',
      unlockHint: '',
      lockReasonCode: 'NONE',
      levelGap: 0,
      requiredLevelNeedExp: 0,
      expToRequiredLevel: 0,
      nextGuidanceTitle: '',
      nextGuidanceText: '',
      growthSourceSummary: '',
      growthSourceStatus: '',
      growthSourceHint: '',
      repeatableExpAvailable: false,
    };
  }

  private selectableLobbyHeroes(): LobbyHeroItemVO[] {
    return this.lobbyHeroRosterLoader.currentState().heroes
      .filter((hero) => hero.id > 0 && !hero.protagonist && hero.rarity.toUpperCase() !== 'EX' && !hero.heroCode.toUpperCase().startsWith('EX_'));
  }

  private resolveLobbyFormationHeroIds(): number[] {
    const selected = this.normalizeLobbyFormationHeroIds(this.selectedLobbyFormationHeroIds);
    return selected.length > 0 ? selected : this.defaultLobbyFormationHeroIds();
  }

  private defaultLobbyFormationHeroIds(): number[] {
    return [...this.selectableLobbyHeroes()]
      .sort((a, b) => b.power - a.power)
      .slice(0, 5)
      .map((hero) => hero.id);
  }

  private normalizeLobbyFormationHeroIds(heroIds: number[]): number[] {
    const heroes = this.selectableLobbyHeroes();
    const byId = new Map(heroes.map((hero) => [hero.id, hero]));
    const normalized: number[] = [];
    for (const heroId of heroIds) {
      if (normalized.length >= 5) {
        break;
      }
      if (byId.has(heroId) && !normalized.includes(heroId)) {
        normalized.push(heroId);
      }
    }
    return normalized.slice(0, 5);
  }

  private reconcileLobbyFormationSelection(): boolean {
    const before = this.selectedLobbyFormationHeroIds.join(',');
    this.selectedLobbyFormationHeroIds = this.selectedLobbyFormationHeroIds.length > 0
      ? this.normalizeLobbyFormationHeroIds(this.selectedLobbyFormationHeroIds)
      : this.resolveDefaultFilledLobbyFormationHeroIds(this.selectedLobbyFormationHeroIds);
    return before !== this.selectedLobbyFormationHeroIds.join(',');
  }

  // 本场我方单位(主角+当前/默认阵容)的骨骼预取描述,供面板打开预热与进战加载门共用。
  private resolveLobbyBattleAllySpinePrefetchUnits(): Array<{ side: 'ally'; portraitAsset: string | null; spineAsset: string | null; spineUuid: string | null; monsterSkinAsset: null }> {
    const rosterHeroes = this.lobbyHeroRosterLoader.currentState().heroes;
    if (rosterHeroes.length === 0) {
      return [];
    }
    const heroById = new Map(rosterHeroes.map((hero) => [hero.id, hero]));
    const formationIds = this.resolveLobbyFormationHeroIds();
    const pickedIds = formationIds.length > 0 ? formationIds : this.defaultLobbyFormationHeroIds();
    const targets = [
      ...rosterHeroes.filter((hero) => hero.protagonist),
      ...pickedIds.map((heroId) => heroById.get(heroId)).filter((hero): hero is LobbyHeroItemVO => !!hero),
    ];
    return targets.map((hero) => ({
      side: 'ally' as const,
      portraitAsset: hero.portraitAsset ?? null,
      spineAsset: hero.spineAsset ?? null,
      spineUuid: hero.spineUuid ?? null,
      monsterSkinAsset: null,
    }));
  }

  // 点击挑战瞬间预热本场我方单位骨骼资源:与 roster 拉取、开战请求两次网络往返并行。
  private prefetchLobbyBattleFormationSpineAssets(): void {
    const units = this.resolveLobbyBattleAllySpinePrefetchUnits();
    if (units.length > 0) {
      this.lobbyBattlePreviewPanelRenderer.prefetchBattleUnitSpineAssets(units);
    }
  }

  // LobbyBattleFlow 进战资产加载门:开战响应到达后加载本场全部单位骨骼+敌怪立绘,
  // 渲染层同时显示加载界面;完成后战斗流才启动演出计时。
  preloadBattleSessionAssets(start: PlayerBattleStartVO, onProgress: (loaded: number, total: number) => void): Promise<void> {
    const units = [
      ...this.resolveLobbyBattleAllySpinePrefetchUnits(),
      ...start.enemyPreview.map((enemy) => ({
        side: 'enemy' as const,
        portraitAsset: null,
        spineAsset: enemy.spineAsset ?? null,
        spineUuid: null,
        monsterSkinAsset: enemy.skinAsset ?? null,
      })),
    ];
    return this.lobbyBattlePreviewPanelRenderer.preloadBattleSessionAssets(units, onProgress);
  }

  private fillLobbyFormationWithDefaultHeroes(): void {
    this.selectedLobbyFormationHeroIds = this.selectedLobbyFormationHeroIds.length > 0
      ? this.normalizeLobbyFormationHeroIds(this.selectedLobbyFormationHeroIds)
      : this.resolveDefaultFilledLobbyFormationHeroIds(this.selectedLobbyFormationHeroIds);
  }

  private resolveDefaultFilledLobbyFormationHeroIds(heroIds: number[]): number[] {
    const normalized = heroIds.length > 0 ? this.normalizeLobbyFormationHeroIds(heroIds) : [];
    const defaultIds = this.defaultLobbyFormationHeroIds();
    const targetCount = Math.min(5, defaultIds.length);
    if (targetCount <= 0) {
      return normalized;
    }
    if (normalized.length >= targetCount) {
      return normalized.slice(0, targetCount);
    }
    const merged = [...normalized];
    for (const heroId of defaultIds) {
      if (merged.length >= targetCount) {
        break;
      }
      if (!merged.includes(heroId)) {
        merged.push(heroId);
      }
    }
    return this.normalizeLobbyFormationHeroIds(merged).slice(0, targetCount);
  }

  private rejectInvalidLobbyStageSelection(): void {
    // 关卡丢失或非法时必须回到冒险选择，避免未来多关卡阶段误打默认 MAIN_1_1。
    this.selectedLobbyStageCode = null;
    this.setStatus('关卡选择已失效，请重新选择主线关卡。');
    if (this.currentView === 'lobby') {
      this.openLobbyAdventurePanel();
    }
  }
}

function isAnnualMainlineStage(stageCode: string): boolean {
  const match = /^MAIN_(\d{1,2})_(\d{1,2})$/.exec(stageCode);
  if (!match) {
    return false;
  }
  const chapter = Number(match[1]);
  const stage = Number(match[2]);
  let order = 0;
  if (chapter === 1) {
    order = stage >= 1 && stage <= FIRST_CHAPTER_STAGE_COUNT ? stage : 0;
  } else if (chapter >= 2 && chapter <= 25 && stage >= 1 && stage <= STAGES_PER_CHAPTER_AFTER_FIRST) {
    order = FIRST_CHAPTER_STAGE_COUNT + (chapter - 2) * STAGES_PER_CHAPTER_AFTER_FIRST + stage;
  }
  return order >= 1 && order <= ANNUAL_MAINLINE_TOTAL_STAGES;
}

// 装备战力估分(与服务器 HeroPowerCalculator.equipPowerBonus 同权重),一键穿戴挑选每部位最优闲置装备用。
function equipItemPowerScore(item: EquipmentItemVO): number {
  return item.attrHp + item.attrAttack * 2 + item.attrDefense * 1.5 + item.attrSpeed * 1.2 + item.attrCrit;
}
