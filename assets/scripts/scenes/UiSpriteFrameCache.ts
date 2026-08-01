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

  preload(overrides: UiSpriteFrameOverrides): void {
    // 只预加载当前阶段会用到的 UI 图，避免误拉未开放玩法资源。
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
    this.request(LOBBY_BATTLE_SCENE_BG_ASSET);
    this.request(LOBBY_BATTLE_SCENE_GROUND_ASSET);
    this.request(LOBBY_BATTLE_SCENE_FOREGROUND_ASSET);
    this.request(LOBBY_HERO_DETAIL_BACKDROP_ASSET);
    this.request(LOBBY_HERO_DETAIL_PROTAGONIST_ASSET);
    this.request(LOBBY_HERO_ROSTER_BACKDROP_ASSET);
    LOBBY_HERO_ROSTER_CARD_ASSETS.forEach((asset) => this.request(asset));
    this.request(GACHA_BACKGROUND_ASSET);
    this.request(GACHA_MODAL_CLOSE_BUTTON_ASSET);
    GACHA_POOL_LOGO_ASSETS.forEach((asset) => this.request(asset));
    this.request(SCENE_BACK_BUTTON_ASSET);
    // C1812 通用/背包/冒险/战斗 UI 切图：保持只读展示，不预拉未开放玩法资源。
    Object.values(LOBBY_C1812_RESOURCE_ICON_ASSETS).forEach((asset) => this.request(asset.path));
    this.request(BAG_C1812_ITEM_SLOT_ASSET);
    this.request(BAG_C1812_ITEM_SLOT_HIGHLIGHT_ASSET);
    this.request(BAG_C1812_BUTTON_PRIMARY_ASSET);
    this.request(BAG_C1812_DIVIDER_ASSET);
    this.request(BAG_C1812_TITLE_BANNER_ASSET);
    this.request(BAG_C1812_MODAL_FRAME_ASSET);
    Object.values(BAG_C1812_ITEM_TYPE_ICON_ASSETS).forEach((asset) => this.request(asset));
    this.request(HERO_C1812_STAR_FILLED_ASSET);
    this.request(HERO_C1812_STAR_EMPTY_ASSET);
    Object.values(HERO_C1812_GRADE_CREST_ASSETS).forEach((asset) => this.request(asset));
    this.request(ADVENTURE_C1812_STAGE_NODE_ASSET);
    this.request(ADVENTURE_C1812_STAGE_NODE_BOSS_ASSET);
    this.request(ADVENTURE_C1812_STAGE_NODE_CLEAR_ASSET);
    this.request(ADVENTURE_C1812_CHAPTER_ICON_ASSET);
    this.request(ADVENTURE_C1812_ICON_LOCK_ASSET);
    this.request(BATTLE_C1812_HP_BAR_FRAME_ASSET);
    this.request(BATTLE_C1812_HP_BAR_FILL_ASSET);
    this.request(BATTLE_C1812_BANNER_VICTORY_ASSET);
    this.request(BATTLE_C1812_BANNER_DEFEAT_ASSET);
    this.request(C1812_TITLE_BANNER_ASSET);
    this.request(C1812_BUTTON_PRIMARY_ASSET);
    this.request(C1812_BUTTON_DISABLED_ASSET);
    STAR_BAND_ASSETS.forEach((asset) => this.request(asset));
    this.request(GACHA_RESULT_PANEL_ASSET);
    Object.values(GACHA_RESULT_FRAME_ASSETS).forEach((asset) => this.request(asset));
    this.request(GACHA_RESULT_DIVIDER_LEFT_ASSET);
    this.request(GACHA_RESULT_DIVIDER_RIGHT_ASSET);
    this.request(GACHA_TAB_PLATE_ASSET);
    Object.values(GACHA_POOL_TAB_ICON_ASSETS).forEach((asset) => this.request(asset));
    Object.values(GACHA_ACTION_ICON_ASSETS).forEach((asset) => this.request(asset));
    this.request(GACHA_COST_TICKET_ICON_ASSET);
    this.request(GACHA_COST_DIAMOND_ICON_ASSET);
    this.request(GACHA_LOCK_ICON_ASSET);
    this.request(LOCK_BODY_ASSET);
    this.request(LOCK_HEAD_ASSET);
    this.request(C1812_TAB_SELECTED_ASSET);
    this.request(BATTLE_C1812_SKILL_FRAME_ASSET);
    this.request(BATTLE_C1812_SKILL_FRAME_ACTIVE_ASSET);
    this.request(BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET);
    this.request(BATTLE_C1812_BOSS_GAUGE_BAR_ASSET);
    this.request(BATTLE_C1812_SKILL_TARGET_FRAME_ASSET);
    this.request(BATTLE_C1812_HIT_BURST_ASSET);
    this.request(BATTLE_C1812_HIT_SLASH_ASSET);
    this.request(BATTLE_C1812_HIT_BURST_EFFECT_ASSET);
    this.request(BATTLE_C1812_HIT_RING_ASSET);
    this.request(BATTLE_C1812_HIT_SPARK_ASSET);
    this.request(BATTLE_C1812_BUFF_ATTACK_UP_ASSET);
    this.request(BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET);
    this.request(BATTLE_C1812_BUFF_SHIELD_ASSET);
    this.request(BATTLE_C1812_BUFF_STUN_ASSET);
    Object.values(LOBBY_C1812_NAV_ICON_ASSETS).forEach((asset) => this.request(asset));
    // 2026-07-22 锻造/装备/道具图标全量预载:锻造页近百张图原先进面板才现拉,
    // 每张到货触发一次整刷 = 首进重渲风暴;登录时拉完,进面板一次成型。
    FORGE_PRELOAD_ASSETS.forEach((asset) => this.request(asset));
    EQUIP_ICON_ALL_ASSETS.forEach((asset) => this.request(asset));
    BAG_ITEM_ICON_PRELOAD_ASSETS.forEach((asset) => this.request(asset));
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

  request(path: string): void {
    if (this.spriteFrames.has(path) || this.loadingSpriteFrames.has(path)) {
      return;
    }
    // loadingSpriteFrames 用来去重，防止同一帧内重复发起资源加载。
    this.loadingSpriteFrames.add(path);
    resources.load(path, SpriteFrame, (error, frame) => {
      this.loadingSpriteFrames.delete(path);
      if (error) {
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
    return this.spriteFrames.get(path);
  }
}
