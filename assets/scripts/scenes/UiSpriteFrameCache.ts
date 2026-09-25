import {
  Node,
  resources,
  SpriteFrame,
} from 'cc';
import {
  LOGIN_UI_ASSETS,
  SHOW_LOGIN_BRAND,
  SHOW_RIGHT_RAIL,
  USE_IMAGE_LOGIN_BUTTON,
} from './login/LoginRenderer';
import { LOBBY_C1812_RESOURCE_ICON_ASSETS, LOBBY_PLAYER_INFO_PANEL_ASSET } from './lobby/LobbyHudTypes';
import {
  BATTLE_C1812_BANNER_DEFEAT_ASSET,
  BATTLE_C1812_BANNER_VICTORY_ASSET,
  BATTLE_C1812_HP_BAR_FILL_ASSET,
  BATTLE_C1812_HP_BAR_FRAME_ASSET,
  LOBBY_BATTLE_SCENE_BG_ASSET,
  LOBBY_BATTLE_SCENE_FOREGROUND_ASSET,
  LOBBY_BATTLE_SCENE_GROUND_ASSET,
} from './lobby/LobbyBattlePreviewPanelRenderer';
import {
  BAG_C1812_BUTTON_PRIMARY_ASSET,
  BAG_C1812_DIVIDER_ASSET,
  BAG_C1812_ITEM_SLOT_ASSET,
  BAG_C1812_ITEM_SLOT_HIGHLIGHT_ASSET,
  BAG_C1812_ITEM_TYPE_ICON_ASSETS,
  BAG_C1812_MODAL_FRAME_ASSET,
  BAG_C1812_TITLE_BANNER_ASSET,
} from './lobby/LobbyBagPanelRenderer';
import {
  ADVENTURE_C1812_CHAPTER_ICON_ASSET,
  ADVENTURE_C1812_ICON_LOCK_ASSET,
  ADVENTURE_C1812_STAGE_NODE_ASSET,
  ADVENTURE_C1812_STAGE_NODE_BOSS_ASSET,
  ADVENTURE_C1812_STAGE_NODE_CLEAR_ASSET,
} from './lobby/LobbyAdventurePanelRenderer';
import {
  HERO_C1812_GRADE_CREST_ASSETS,
  HERO_C1812_STAR_EMPTY_ASSET,
  HERO_C1812_STAR_FILLED_ASSET,
  LOBBY_HERO_DETAIL_BACKDROP_ASSET,
  LOBBY_HERO_DETAIL_PROTAGONIST_ASSET,
} from './lobby/LobbyHeroDetailPanelRenderer';
import { LOBBY_HERO_ROSTER_BACKDROP_ASSET, LOBBY_HERO_ROSTER_CARD_ASSETS } from './lobby/LobbyHeroRosterPanelRenderer';
import { FORGE_PRELOAD_ASSETS } from './lobby/LobbyForgePanelRenderer';
import { LOCK_BODY_ASSET, LOCK_HEAD_ASSET } from './UiLockGlyph';
import { EQUIP_ICON_ALL_ASSETS } from './lobby/EquipIconAssets';
import { BAG_ITEM_ICON_PRELOAD_ASSETS } from './lobby/LobbyBagPanelRenderer';
import { GACHA_ACTION_ICON_ASSETS, GACHA_BACKGROUND_ASSET, GACHA_COST_DIAMOND_ICON_ASSET, GACHA_COST_TICKET_ICON_ASSET, GACHA_LOCK_ICON_ASSET, GACHA_MODAL_CLOSE_BUTTON_ASSET, GACHA_POOL_LOGO_ASSETS, GACHA_POOL_TAB_ICON_ASSETS, GACHA_RESULT_DIVIDER_LEFT_ASSET, GACHA_RESULT_DIVIDER_RIGHT_ASSET, GACHA_RESULT_FRAME_ASSETS, GACHA_RESULT_PANEL_ASSET, GACHA_TAB_PLATE_ASSET } from './gacha/GachaSceneConfig';
import { SCENE_BACK_BUTTON_ASSET } from './UiSceneBackButton';
import {
  BATTLE_C1812_BOSS_GAUGE_BAR_ASSET,
  BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET,
  BATTLE_C1812_BUFF_ATTACK_UP_ASSET,
  BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET,
  BATTLE_C1812_BUFF_SHIELD_ASSET,
  BATTLE_C1812_BUFF_STUN_ASSET,
  BATTLE_C1812_HIT_BURST_EFFECT_ASSET,
  BATTLE_C1812_HIT_BURST_ASSET,
  BATTLE_C1812_HIT_RING_ASSET,
  BATTLE_C1812_HIT_SLASH_ASSET,
  BATTLE_C1812_HIT_SPARK_ASSET,
  BATTLE_C1812_SKILL_TARGET_FRAME_ASSET,
  BATTLE_C1812_SKILL_FRAME_ACTIVE_ASSET,
  BATTLE_C1812_SKILL_FRAME_ASSET,
  C1812_BUTTON_DISABLED_ASSET,
  C1812_BUTTON_PRIMARY_ASSET,
  STAR_BAND_ASSETS,
  C1812_TAB_SELECTED_ASSET,
  C1812_TITLE_BANNER_ASSET,
  LOBBY_C1812_NAV_ICON_ASSETS,
} from './C1812CommonUiAssets';

export interface UiSpriteFrameCacheHost {
  node: Node;
  renderCurrentView(): void;
}

export interface UiSpriteFrameOverrides {
  logoFrame: SpriteFrame | null;
  mainButtonFrame: SpriteFrame | null;
  rightRailFrames: SpriteFrame[];
}

/**
 * UI 图片帧缓存。
 *
 * Inspector 上手动绑定的 SpriteFrame 优先级最高；未绑定时才走 resources.load。
 * 加载成功后通知 root 重新渲染当前视图，让登录 logo、按钮图和大厅面板自动补上。
 */
/** 页面首开等素材的最长时间:超过就先画页面(缺图走兜底),不让慢网卡死在加载态。 */
const GROUP_GATE_WINDOW_MS = 20000;

/** 按玩法页分组的 UI 图预载(第一次打开对应页面时拉)。 */
export type UiPreloadGroup = 'heroes' | 'gacha' | 'bag' | 'forge' | 'adventure' | 'battle';

export class UiSpriteFrameCache {
  private readonly spriteFrames = new Map<string, SpriteFrame>();
  private readonly loadingSpriteFrames = new Set<string>();
  // 每成功加载一张新 UI 图就自增:场景页复用签名要把它计入,
  // 否则"图加载完触发 renderCurrentView"会命中复用挂回旧的缺图面板(道具图标黑块)。
  private loadGeneration = 0;

  constructor(private readonly host: UiSpriteFrameCacheHost) {}

  /** UI 图加载代数:新图加载完即变,场景页复用据此在补图那一帧强制重建,避免复用到缺图旧树。 */
  getLoadGeneration(): number {
    return this.loadGeneration;
  }

  private isHostNodeAlive(): boolean {
    try {
      return !!this.host.node && this.host.node.isValid === true;
    } catch {
      return false;
    }
  }

  /**
   * 启动只预载登录 + 大厅会立刻看到的 UI 图(2026-09-25 用户拍板:只下载游戏里用到的)。
   * 各玩法页面的图按分组在第一次打开该页时再拉(preloadGroup),到货走 90ms 合并整刷,不会逐张重建。
   */
  preload(overrides: UiSpriteFrameOverrides): void {
    if (SHOW_LOGIN_BRAND && !overrides.logoFrame) {
      this.request(LOGIN_UI_ASSETS.logo);
    }
    if (USE_IMAGE_LOGIN_BUTTON && !overrides.mainButtonFrame) {
      this.request(LOGIN_UI_ASSETS.mainButton);
    }
    if (SHOW_RIGHT_RAIL && overrides.rightRailFrames.length < LOGIN_UI_ASSETS.rightRail.length) {
      LOGIN_UI_ASSETS.rightRail.forEach((asset) => this.request(asset.path));
    }
    this.request(LOBBY_PLAYER_INFO_PANEL_ASSET);
    this.request(SCENE_BACK_BUTTON_ASSET);
    Object.values(LOBBY_C1812_RESOURCE_ICON_ASSETS).forEach((asset) => this.request(asset.path));
    Object.values(LOBBY_C1812_NAV_ICON_ASSETS).forEach((asset) => this.request(asset));
    this.request(C1812_TITLE_BANNER_ASSET);
    this.request(C1812_BUTTON_PRIMARY_ASSET);
    this.request(C1812_BUTTON_DISABLED_ASSET);
    this.request(C1812_TAB_SELECTED_ASSET);
    this.request(LOCK_BODY_ASSET);
    this.request(LOCK_HEAD_ASSET);
  }

  private readonly preloadedGroups = new Set<UiPreloadGroup>();

  /** 某玩法页第一次打开时拉它的整组 UI 图(只拉一次;已在内存的 request 内部会跳过)。 */
  preloadGroup(group: UiPreloadGroup): void {
    if (this.preloadedGroups.has(group)) {
      return;
    }
    this.preloadedGroups.add(group);
    this.groupWaits.set(group, { pending: new Set<string>(), total: 0, startedAt: Date.now() });
    // 闸门最长等 GROUP_GATE_WINDOW_MS:到点无论还有几张没到都放行(缺图走兜底),并补一次整刷让页面换出来。
    setTimeout(() => this.scheduleRenderRefresh(), GROUP_GATE_WINDOW_MS + 50);
    const track = (path: string): void => this.trackGroupPath(group, path);
    switch (group) {
      case 'heroes':
        // 详情页大图只拉不拦:名册首开先等卡面相关的图,详情页用到时多半已到。
        this.request(LOBBY_HERO_DETAIL_BACKDROP_ASSET);
        this.request(LOBBY_HERO_DETAIL_PROTAGONIST_ASSET);
        track(LOBBY_HERO_ROSTER_BACKDROP_ASSET);
        LOBBY_HERO_ROSTER_CARD_ASSETS.forEach((asset) => track(asset));
        track(HERO_C1812_STAR_FILLED_ASSET);
        track(HERO_C1812_STAR_EMPTY_ASSET);
        Object.values(HERO_C1812_GRADE_CREST_ASSETS).forEach((asset) => track(asset));
        STAR_BAND_ASSETS.forEach((asset) => track(asset));
        break;
      case 'gacha':
        track(GACHA_BACKGROUND_ASSET);
        track(GACHA_MODAL_CLOSE_BUTTON_ASSET);
        GACHA_POOL_LOGO_ASSETS.forEach((asset) => track(asset));
        track(GACHA_RESULT_PANEL_ASSET);
        Object.values(GACHA_RESULT_FRAME_ASSETS).forEach((asset) => track(asset));
        track(GACHA_RESULT_DIVIDER_LEFT_ASSET);
        track(GACHA_RESULT_DIVIDER_RIGHT_ASSET);
        track(GACHA_TAB_PLATE_ASSET);
        Object.values(GACHA_POOL_TAB_ICON_ASSETS).forEach((asset) => track(asset));
        Object.values(GACHA_ACTION_ICON_ASSETS).forEach((asset) => track(asset));
        track(GACHA_COST_TICKET_ICON_ASSET);
        track(GACHA_COST_DIAMOND_ICON_ASSET);
        track(GACHA_LOCK_ICON_ASSET);
        STAR_BAND_ASSETS.forEach((asset) => track(asset));
        break;
      case 'bag':
        track(BAG_C1812_ITEM_SLOT_ASSET);
        track(BAG_C1812_ITEM_SLOT_HIGHLIGHT_ASSET);
        track(BAG_C1812_BUTTON_PRIMARY_ASSET);
        track(BAG_C1812_DIVIDER_ASSET);
        track(BAG_C1812_TITLE_BANNER_ASSET);
        track(BAG_C1812_MODAL_FRAME_ASSET);
        Object.values(BAG_C1812_ITEM_TYPE_ICON_ASSETS).forEach((asset) => track(asset));
        BAG_ITEM_ICON_PRELOAD_ASSETS.forEach((asset) => track(asset));
        EQUIP_ICON_ALL_ASSETS.forEach((asset) => track(asset));
        break;
      case 'forge':
        // 2026-07-22:锻造页近百张图原先逐张到货触发整刷;现在第一次开锻造时整组一起拉,到货合并整刷。
        FORGE_PRELOAD_ASSETS.forEach((asset) => track(asset));
        EQUIP_ICON_ALL_ASSETS.forEach((asset) => track(asset));
        BAG_ITEM_ICON_PRELOAD_ASSETS.forEach((asset) => track(asset));
        break;
      case 'adventure':
        track(ADVENTURE_C1812_STAGE_NODE_ASSET);
        track(ADVENTURE_C1812_STAGE_NODE_BOSS_ASSET);
        track(ADVENTURE_C1812_STAGE_NODE_CLEAR_ASSET);
        track(ADVENTURE_C1812_CHAPTER_ICON_ASSET);
        track(ADVENTURE_C1812_ICON_LOCK_ASSET);
        break;
      case 'battle':
        track(LOBBY_BATTLE_SCENE_BG_ASSET);
        track(LOBBY_BATTLE_SCENE_GROUND_ASSET);
        track(LOBBY_BATTLE_SCENE_FOREGROUND_ASSET);
        track(BATTLE_C1812_HP_BAR_FRAME_ASSET);
        track(BATTLE_C1812_HP_BAR_FILL_ASSET);
        track(BATTLE_C1812_BANNER_VICTORY_ASSET);
        track(BATTLE_C1812_BANNER_DEFEAT_ASSET);
        track(BATTLE_C1812_SKILL_FRAME_ASSET);
        track(BATTLE_C1812_SKILL_FRAME_ACTIVE_ASSET);
        track(BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET);
        track(BATTLE_C1812_BOSS_GAUGE_BAR_ASSET);
        track(BATTLE_C1812_SKILL_TARGET_FRAME_ASSET);
        track(BATTLE_C1812_HIT_BURST_ASSET);
        track(BATTLE_C1812_HIT_SLASH_ASSET);
        track(BATTLE_C1812_HIT_BURST_EFFECT_ASSET);
        track(BATTLE_C1812_HIT_RING_ASSET);
        track(BATTLE_C1812_HIT_SPARK_ASSET);
        track(BATTLE_C1812_BUFF_ATTACK_UP_ASSET);
        track(BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET);
        track(BATTLE_C1812_BUFF_SHIELD_ASSET);
        track(BATTLE_C1812_BUFF_STUN_ASSET);
        break;
      default:
        break;
    }
  }


  /** 各页面分组的首开等待状态:pending=还没到的图;超过窗口期不再拦页面。 */
  private readonly groupWaits = new Map<UiPreloadGroup, { pending: Set<string>; total: number; startedAt: number }>();

  private trackGroupPath(group: UiPreloadGroup, path: string): void {
    const wait = this.groupWaits.get(group);
    const ready = this.spriteFrames.has(path) || !!resources.get(path, SpriteFrame) || this.failedSpriteFrames.has(path);
    if (wait && !ready && !wait.pending.has(path) && Date.now() - wait.startedAt < GROUP_GATE_WINDOW_MS) {
      wait.pending.add(path);
      wait.total += 1;
    }
    this.request(path);
  }

  /** 页面动态补进组里的图(如名册里玩家已有英雄的卡面):窗口期内一起等,过了窗口只拉不拦。 */
  addGroupAssets(group: UiPreloadGroup, paths: readonly string[]): void {
    this.preloadGroup(group);
    paths.forEach((path) => this.trackGroupPath(group, path));
  }

  /** 页面首开时该组还在下载:返回进度;已齐/超时/没开过返回 null(直接画页面)。 */
  groupProgress(group: UiPreloadGroup): { done: number; total: number } | null {
    const wait = this.groupWaits.get(group);
    if (!wait || wait.pending.size === 0 || Date.now() - wait.startedAt >= GROUP_GATE_WINDOW_MS) {
      return null;
    }
    return { done: wait.total - wait.pending.size, total: wait.total };
  }

  private settleGroupPath(path: string): void {
    this.groupWaits.forEach((wait) => {
      if (wait.pending.delete(path) && wait.pending.size === 0) {
        this.scheduleRenderRefresh();
      }
    });
  }

  private renderRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  // 补图整刷合并:同一批异步到货的图 90ms 内只触发一次 renderCurrentView,
  // 否则首进面板时几十张图逐张到货 = 整树重建几十次(锻造开屏卡顿主因之一)。
  private scheduleRenderRefresh(): void {
    if (this.renderRefreshTimer !== null) {
      return;
    }
    this.renderRefreshTimer = setTimeout(() => {
      this.renderRefreshTimer = null;
      if (this.isHostNodeAlive()) {
        this.host.renderCurrentView();
      }
    }, 90);
  }

  /** 加载失败过的路径(缺图),不再重复请求。 */
  private readonly failedSpriteFrames = new Set<string>();

  request(path: string): void {
    if (this.spriteFrames.has(path) || this.loadingSpriteFrames.has(path) || this.failedSpriteFrames.has(path)) {
      return;
    }
    // loadingSpriteFrames 用来去重，防止同一帧内重复发起资源加载。
    this.loadingSpriteFrames.add(path);
    resources.load(path, SpriteFrame, (error, frame) => {
      this.loadingSpriteFrames.delete(path);
      this.settleGroupPath(path);
      if (error) {
        // 缺图只告警一次:图鉴宝箱等可选素材未落位时,每次重绘都重试会刷屏。
        this.failedSpriteFrames.add(path);
        console.warn(`[LootChain] UI sprite load failed: ${path}`, error);
        return;
      }
      if (!error && frame) {
        this.spriteFrames.set(path, frame);
        this.loadGeneration += 1;
        this.scheduleRenderRefresh();
      }
    });
  }

  resolve(path: string, overrides: UiSpriteFrameOverrides): SpriteFrame | undefined {
    // 场景 Inspector 绑定的资源用于快速替换美术，不需要改代码路径。
    if (path === LOGIN_UI_ASSETS.logo && overrides.logoFrame) {
      return overrides.logoFrame;
    }
    if (path === LOGIN_UI_ASSETS.mainButton && overrides.mainButtonFrame) {
      return overrides.mainButtonFrame;
    }
    const railIndex = LOGIN_UI_ASSETS.rightRail.findIndex((asset) => asset.path === path);
    if (railIndex >= 0 && overrides.rightRailFrames[railIndex]) {
      return overrides.rightRailFrames[railIndex];
    }
    const cached = this.spriteFrames.get(path);
    if (cached) {
      return cached;
    }
    // 启动加载屏 loadDir 已入 bundle 缓存的资源同步取用(2026-09-10):首帧即有图,
    // 不再"先兜底再到货整刷"——也顺带消掉素材逐张到货引发的重渲风暴。
    const bundled = resources.get(path, SpriteFrame);
    if (bundled) {
      this.spriteFrames.set(path, bundled);
      return bundled;
    }
    return undefined;
  }
}
