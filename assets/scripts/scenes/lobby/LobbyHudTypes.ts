import {
  Color,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
} from 'cc';
import type { LobbyBattlePanelState } from './LobbyBattleState';
import type { LobbyAdventurePanelState } from '../../types/LobbyAdventureTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';

/** 全局 UI 布局结果，所有登录/大厅/加载页面都按这个坐标系定位。 */
export interface UiLayout {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  stageLeft: number;
  stageRight: number;
  stageTop: number;
  stageBottom: number;
  safeLeft: number;
  safeRight: number;
  safeTop: number;
  safeBottom: number;
  safeWidth: number;
  safeHeight: number;
  safeInsetX: number;
  safeInsetY: number;
  contentWidth: number;
  topY: number;
  inputHeight: number;
  buttonHeight: number;
  statusWidth: number;
  bodyFont: number;
  uiScale: number;
}

export interface LobbyPlayerInfoLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LobbyResourceItem {
  key: 'stamina' | 'coin' | 'ruby' | 'crystal';
  label: string;
  value: string;
  tint: Color;
}

export type LobbySystemIconKey = 'friends' | 'mail' | 'settings' | 'menu';
export type LobbyActivityIconKey = 'event' | 'summon' | 'contract' | 'market' | 'gift';
export type LobbyNavIconKey = 'hero' | 'bag' | 'contract' | 'codex' | 'quest' | 'forge' | 'shop';

export interface LobbyActivityItemConfig {
  icon: LobbyActivityIconKey;
  title: string;
  subline: string;
  hot: boolean;
}

export interface LobbySceneHotspotConfig {
  label: string;
  /** 可见牌匾位置，按舞台宽高百分比计算。 */
  x: number;
  y: number;
  width: number;
  hot: boolean;
  /** 透明点击热区位置和尺寸，按舞台宽高百分比计算。 */
  hitX: number;
  hitY: number;
  hitW: number;
  hitH: number;
}

export interface LobbyChallengeItemConfig {
  title: string;
  subline: string;
  tint: Color;
  hot: boolean;
}

export interface LobbyNavItemConfig {
  key: LobbyNavIconKey;
  label: string;
  hot: boolean;
}

export interface LobbyHudHost {
  node: Node;
  currentLobbyProfile(): PlayerLobbyProfileVO;
  currentLobbyAdventureState(): LobbyAdventurePanelState;
  /** 大厅目标追踪只读取最近战斗记录，用于提示下一步；不能从这里触发奖励或进度写入。 */
  currentLobbyBattleState(): LobbyBattlePanelState;
  /** 当前选中的主线关卡仅作为 UI 提示来源，非法或锁定关卡必须回到爬塔面板校验。 */
  currentLobbySelectedStageCode(): string;
  openPlayerProfileDialog(): void;
  /** 公告/活动入口走只读详情面板；该面板只读取服务端公告，不承载玩法动作。 */
  openLobbyNoticePanel(): void;
  /** 限时副本入口进入每日材料副本面板;挑战复用战斗接口,开放日/次数校验以后端为准。 */
  openLobbyDailyDungeonPanel(): void;
  /** 图鉴入口走只读预览面板；该面板只读取大厅门面数据，不进入英雄养成。 */
  openLobbyCodexPanel(): void;
  /** 英雄入口走只读英雄队列；该面板只读取已拥有英雄，不提供任何养成写操作。 */
  openLobbyHeroRosterPanel(): void;
  /** 背包入口走只读道具列表；该面板只读取背包和来源，不提供使用/出售写操作。 */
  openLobbyBagPanel(): void;
  /** 锻造入口进入装备养成工坊(合成/强化/分解);全部写入走服务器装备接口。 */
  openLobbyForgePanel(): void;
  /** 冒险/副本入口走主线关卡地图；战斗必须再经弹框/编队确认，当前不保存编队、不产生结算。 */
  openLobbyAdventurePanel(): void;
  /** 召唤入口进入独立抽奖预览页；当前只展示卡池视觉和规则入口，不触发抽卡写入。 */
  openLobbyGachaScene(): void;
  /** 设置入口只切换本地显示语言，不连接经济、账号或系统写接口。 */
  openLobbySettingsPanel(): void;
  /** 所有未开放大厅入口统一交给根节点弹窗处理，保持占位行为一致。 */
  openLobbyPlaceholderDialog(title: string, detail?: string): void;
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
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
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addLobbyAvatar(parent: Node, x: number, y: number, size: number, displayName: string): void;
  /** 挂机演出读取英雄与上阵阵容(只读);挑战 BOSS 复用既有战斗预览流程(内部含解锁校验)。 */
  currentLobbyHeroRosterState(): import('../../types/LobbyHeroTypes').LobbyHeroRosterPanelState;
  currentLobbyFormationHeroIds(): number[];
  openLobbyBattlePreviewPanel(stageCode: string): void;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor(node: Node): void;
  setStatus(text: string): void;
  formatInteger(value: number | null | undefined): string;
  compactResourceValue(value: number | null | undefined): string;
}

// 左上玩家信息面板使用固定逻辑宽高比，避免美术资源自动裁切导致文字坐标漂移。
// 2026-09-03 用户新素材 lhud_avatar_panel(610×376,空框):头像/文字/EXP 全部由代码叠加。
export const LOBBY_PLAYER_INFO_PANEL_ASPECT = 610 / 376;
export const LOBBY_PLAYER_INFO_PANEL_ASSET = 'ui/lobby/ai/lhud_avatar_panel/spriteFrame';

// C1812 顶部资源栏货币图标；加载失败时回退到原 Graphics 矢量图形。
export const LOBBY_C1812_CURRENCY_STAMINA_ASSET = 'ui/lobby/c1812/currency_stamina/spriteFrame';
export const LOBBY_C1812_CURRENCY_GOLD_ASSET = 'ui/lobby/c1812/currency_gold/spriteFrame';
export const LOBBY_C1812_CURRENCY_DIAMOND_ASSET = 'ui/lobby/c1812/currency_diamond/spriteFrame';
// 未开放资源位使用锁图标，避免被误读为可购买入口。
export const COMMON_C1812_ICON_LOCK_ASSET = 'ui/common/c1812/icon_lock/spriteFrame';

// 货币图标换用 bag/ai 物品图标(160 方图,aspect 1);未开放资源位保留锁图标。
export const LOBBY_C1812_RESOURCE_ICON_ASSETS: Record<LobbyResourceItem['key'], { path: string; aspect: number }> = {
  stamina: { path: 'ui/bag/ai/icon_stamina/spriteFrame', aspect: 1 },
  coin: { path: 'ui/bag/ai/icon_gold/spriteFrame', aspect: 1 },
  ruby: { path: 'ui/bag/ai/icon_diamond/spriteFrame', aspect: 1 },
  // 矿晶(P金-1c 转正):暂用宝石图标,正式矿晶图标待出(遗留项)。
  crystal: { path: 'ui/common/ai/ic_diamond_gem/spriteFrame', aspect: 1 },
};

export function rgba(red: number, green: number, blue: number, alpha = 255): Color {
  return new Color(red, green, blue, alpha);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
