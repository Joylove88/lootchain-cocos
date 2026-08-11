import type { PlayerBattleRecentVO, PlayerBattleSettlementVO, PlayerBattleStartVO } from '../../types/BattleTypes';

export const LOBBY_BATTLE_PRESENTATION_STEP_COUNT = 369;
export const LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS = 250;
export const LOBBY_BATTLE_PRESENTATION_FRAME_INTERVAL_MS = 16;
export const LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT = 6;
export const LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT = 3;
export const LOBBY_BATTLE_COMBAT_START_STEP = LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT + LOBBY_BATTLE_OPENING_COMBAT_DELAY_STEP_COUNT;

/** 大厅战斗面板状态。当前战斗闭环只记录无奖励结算。 */
export interface LobbyBattlePanelState {
  starting: boolean;
  settling: boolean;
  stageCode: string;
  error: string;
  start: PlayerBattleStartVO | null;
  settlement: PlayerBattleSettlementVO | null;
  presentationStep: number;
  presentationElapsedMs: number;
  presentationStartedAtMs: number;
  presentationComplete: boolean;
  // 进战资产加载门:开战响应到达后先加载本场全部单位骨骼/立绘(渲染层显示加载界面),
  // 就绪(或超时)才启动演出计时,杜绝"战斗开打了单位还没出现"。
  assetsLoading: boolean;
  assetsLoadedCount: number;
  assetsTotalCount: number;
  recentLoading: boolean;
  recentError: string;
  recentBattles: PlayerBattleRecentVO[];
  version: number;
}

export function createLobbyBattlePanelState(): LobbyBattlePanelState {
  return {
    starting: false,
    settling: false,
    stageCode: '',
    error: '',
    start: null,
    settlement: null,
    presentationStep: 0,
    presentationElapsedMs: 0,
    presentationStartedAtMs: 0,
    presentationComplete: false,
    assetsLoading: false,
    assetsLoadedCount: 0,
    assetsTotalCount: 0,
    recentLoading: false,
    recentError: '',
    recentBattles: [],
    version: 0,
  };
}
