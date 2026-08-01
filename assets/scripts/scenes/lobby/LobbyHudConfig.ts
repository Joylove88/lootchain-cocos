import {
  LobbyActivityItemConfig,
  LobbyChallengeItemConfig,
  LobbyNavItemConfig,
  LobbySceneHotspotConfig,
  LobbySystemIconKey,
  rgba,
} from './LobbyHudTypes';

// 大厅 HUD 的可调配置集中放在这里，后续调坐标、热区或入口文案优先改本文件。
// 当前大厅入口以只读/受控开放为主；不能在这里新增新的玩法或经济写入逻辑。
export const LOBBY_SYSTEM_ICONS: LobbySystemIconKey[] = ['friends', 'mail', 'settings', 'menu'];

export const LOBBY_ACTIVITY_ITEMS: LobbyActivityItemConfig[] = [
  { icon: 'event', title: '限时副本', subline: '每日轮换', hot: false },
  { icon: 'summon', title: '深渊召唤', subline: '真实召唤', hot: false },
  { icon: 'contract', title: '圣契之路', subline: '预览中', hot: false },
  { icon: 'market', title: '黑市', subline: '占位展示', hot: false },
  { icon: 'gift', title: '首充礼包', subline: '暂未开放', hot: false },
];

// x/y 控制可见牌匾位置；hitX/hitY/hitW/hitH 控制透明建筑点击区域。
export const LOBBY_SCENE_HOTSPOTS: LobbySceneHotspotConfig[] = [
  { label: '召唤祭坛', x: 0.172, y: 0.393, width: 136, hot: false, hitX: 0.167, hitY: 0.405, hitW: 0.09, hitH: 0.15 },
  { label: '公会', x: 0.302, y: 0.566, width: 112, hot: false, hitX: 0.302, hitY: 0.615, hitW: 0.105, hitH: 0.215 },
  { label: '排行榜', x: 0.493, y: 0.606, width: 122, hot: false, hitX: 0.496, hitY: 0.64, hitW: 0.1, hitH: 0.18 },
  { label: '旅者集会', x: 0.552, y: 0.492, width: 136, hot: false, hitX: 0.552, hitY: 0.462, hitW: 0.1, hitH: 0.135 },
  { label: '熔铸工坊', x: 0.388, y: 0.342, width: 136, hot: false, hitX: 0.39, hitY: 0.342, hitW: 0.105, hitH: 0.135 },
  { label: '深渊之门', x: 0.72, y: 0.635, width: 140, hot: false, hitX: 0.72, hitY: 0.592, hitW: 0.105, hitH: 0.235 },
  { label: '战役', x: 0.746, y: 0.372, width: 112, hot: false, hitX: 0.748, hitY: 0.355, hitW: 0.11, hitH: 0.135 },
  { label: '商店', x: 0.564, y: 0.274, width: 110, hot: false, hitX: 0.565, hitY: 0.255, hitW: 0.09, hitH: 0.1 },
];

export const LOBBY_CHALLENGE_ITEMS: LobbyChallengeItemConfig[] = [
  { title: '世界BOSS', subline: '预览中', tint: rgba(100, 100, 100), hot: false },
  { title: '无尽深渊', subline: '锁定', tint: rgba(47, 149, 133), hot: false },
  { title: '跨服竞技', subline: '未开放', tint: rgba(173, 97, 55), hot: false },
  { title: '资源副本', subline: '占位展示', tint: rgba(75, 129, 171), hot: false },
];

export const LOBBY_NAV_ITEMS: LobbyNavItemConfig[] = [
  { key: 'hero', label: '英雄', hot: false },
  { key: 'bag', label: '背包', hot: false },
  { key: 'contract', label: '圣契', hot: false },
  { key: 'codex', label: '图鉴', hot: false },
  { key: 'quest', label: '任务', hot: false },
  { key: 'forge', label: '锻造', hot: false },
  { key: 'shop', label: '商店', hot: false },
];
