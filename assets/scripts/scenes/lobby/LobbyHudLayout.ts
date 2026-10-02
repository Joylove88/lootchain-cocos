import type { LobbyPlayerInfoLayout, UiLayout } from './LobbyHudTypes';
import { LOBBY_PLAYER_INFO_PANEL_ASPECT, clamp } from './LobbyHudTypes';

export type LobbyHudEdgeAxis = 'x' | 'y';

export interface LobbyHudModeSize {
  width: number;
  height: number;
}

/**
 * HUD 显隐模式按设计舞台尺寸决定(2026-10-02 仅横屏 + 手机整体放大后):
 * 旧版按浏览器 CSS 像素比较,横屏手机(390 高)全部落进精简档,金币 / 入口 / 底栏都被藏掉;
 * 现在手机走 720 设计高,舞台本身就是完整界面的尺寸,不再另做精简。
 */
export function resolveLobbyHudModeSize(layout: UiLayout): LobbyHudModeSize {
  return {
    width: layout.stageWidth,
    height: layout.stageHeight,
  };
}

/**
 * 大厅 HUD 几何布局工具。
 *
 * 这里只保留纯计算：缩放、贴边留白、左上玩家信息牌尺寸和位置。
 * 这样视觉 renderer 只关心画什么，后续多分辨率公式也能集中审查。
 */
export function lobbyHudScale(layout: UiLayout): number {
  return clamp(layout.uiScale, 0.62, 1);
}

export function lobbyHudEdgeInset(layout: UiLayout, axis: LobbyHudEdgeAxis, scale: number): number {
  const safeInset = axis === 'x' ? layout.safeInsetX : layout.safeInsetY;
  const minInset = (axis === 'x' ? 10 : 8) * scale;
  const maxInset = (axis === 'x' ? 26 : 18) * scale;
  return clamp(safeInset * 0.38, minInset, maxInset);
}

export function resolveLobbyPlayerInfoLayout(layout: UiLayout): LobbyPlayerInfoLayout {
  const baseHudScale = lobbyHudScale(layout);
  const hudInsetX = lobbyHudEdgeInset(layout, 'x', baseHudScale);
  const hudInsetY = lobbyHudEdgeInset(layout, 'y', baseHudScale);
  let width = Math.min(
    clamp(layout.stageWidth * 0.28, 420 * baseHudScale, 540 * baseHudScale),
    layout.safeWidth,
    layout.stageWidth - hudInsetX * 2,
  );
  let height = width / LOBBY_PLAYER_INFO_PANEL_ASPECT;
  const maxHeight = layout.stageHeight - hudInsetY * 2;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * LOBBY_PLAYER_INFO_PANEL_ASPECT;
  }
  const x = layout.stageLeft + hudInsetX + width / 2;
  const y = layout.stageTop - hudInsetY - height / 2;
  return {
    x,
    y,
    width,
    height,
    scale: width / 540,
    left: x - width / 2,
    right: x + width / 2,
    top: y + height / 2,
    bottom: y - height / 2,
  };
}
