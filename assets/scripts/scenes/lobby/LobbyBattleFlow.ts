import type { BattleApi } from '../../api/BattleApi';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import type { PlayerBattleSettleDTO, PlayerBattleStartDTO, PlayerBattleStartVO } from '../../types/BattleTypes';
import {
  createLobbyBattlePanelState,
  LOBBY_BATTLE_PRESENTATION_FRAME_INTERVAL_MS,
  LOBBY_BATTLE_PRESENTATION_STEP_COUNT,
  LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS,
  type LobbyBattlePanelState,
} from './LobbyBattleState';
import { resolveLobbyBattlePresentationSnapshot } from './LobbyBattlePresentationSnapshot';
import { resolveLobbyBattlePresentationTimeline } from './LobbyBattlePresentationTimeline';
import { resolveLobbyBattleVisualCompletionDurationMs } from './LobbyBattleVisualCompletion';
import { resolveBattleReplay } from './LobbyBattleReplayModel';

const FALLBACK_BATTLE_PRESENTATION_TOTAL_MS = 45_000;

export interface LobbyBattleFlowHost {
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  currentLobbyFormationHeroIds(): number[];
  refreshLobbyBattlePreviewPanel(): void;
  refreshLobbyBattlePresentationPlayback(): void;
  refreshLobbyOverlay(): void;
  setStatus(message: string): void;
  onBattleSettlementRecorded?(): void;
  // 进战资产加载门:实现方负责加载本场全部单位骨骼/立绘并回报进度;缺省则跳过门直接开演。
  preloadBattleSessionAssets?(start: PlayerBattleStartVO, onProgress: (loaded: number, total: number) => void): Promise<void>;
  // 输出试炼(难度Ⅲ):结算上报击破层数(与战斗内层数血条同口径,含手动大招);非试炼/异常返回 null。
  resolveTrialLayersCleared?(): number | null;
  // 矿境守卫(docs/30):守卫模式激活时由守卫 sim 提供胜负;'PENDING'=守卫局仍在进行(禁止演出计时器自动结算);
  // null=非守卫模式(回退旧回放口径)。
  resolveGuardBattleOutcome?(): 'WIN' | 'LOSE' | 'PENDING' | null;
}

// 加载界面至少展示这么久:资产全命中缓存时避免一帧闪烁,节奏与市面进战转场一致。
const MIN_BATTLE_ASSET_LOADING_SCREEN_MS = 450;

/** 战斗流程控制器。客户端只调用 battle start/settle，奖励、体力和进度全部以后端结算为准。 */
export class LobbyBattleFlow {
  private readonly state = createLobbyBattlePanelState();
  private ticket = 0;
  private recentTicket = 0;
  private readonly presentationTimers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private readonly battleApi: BattleApi,
    private readonly host: LobbyBattleFlowHost,
  ) {}

  currentState(): LobbyBattlePanelState {
    return this.state;
  }

  resetForLogin(): void {
    this.clearPresentationTimers();
    this.ticket += 1;
    this.state.starting = false;
    this.state.settling = false;
    this.state.stageCode = '';
    this.state.error = '';
    this.state.start = null;
    this.state.settlement = null;
    this.state.presentationStep = 0;
    this.state.presentationElapsedMs = 0;
    this.state.presentationStartedAtMs = 0;
    this.state.presentationComplete = false;
    this.state.assetsLoading = false;
    this.state.assetsLoadedCount = 0;
    this.state.assetsTotalCount = 0;
    this.state.recentLoading = false;
    this.state.recentError = '';
    this.state.recentBattles = [];
    this.recentTicket += 1;
    this.bump();
  }

  cancel(clearState = false): void {
    this.clearPresentationTimers();
    this.ticket += 1;
    if (clearState) {
      // 玩家从结算结果回到大厅时要清掉本地战斗快照，避免下一次进入同一关卡被旧 busy 状态拦住。
      this.state.starting = false;
      this.state.settling = false;
      this.state.stageCode = '';
      this.state.error = '';
      this.state.start = null;
      this.state.settlement = null;
      this.state.presentationStep = 0;
      this.state.presentationElapsedMs = 0;
      this.state.presentationStartedAtMs = 0;
      this.state.presentationComplete = false;
      this.state.assetsLoading = false;
      this.state.assetsLoadedCount = 0;
      this.state.assetsTotalCount = 0;
      this.bump();
    }
  }

  prepare(stageCode: string): void {
    // 打开战斗面板前先清理上一场的会话/结算快照，避免 UI 闪现旧结果。
    const selectedStageCode = normalizeStageCode(stageCode);
    this.clearPresentationTimers();
    this.ticket += 1;
    this.state.starting = false;
    this.state.settling = false;
    this.state.stageCode = selectedStageCode ?? '';
    this.state.error = '';
    this.state.start = null;
    this.state.settlement = null;
    this.state.presentationStep = 0;
    this.state.presentationElapsedMs = 0;
    this.state.presentationStartedAtMs = 0;
    this.state.presentationComplete = false;
    this.state.assetsLoading = false;
    this.state.assetsLoadedCount = 0;
    this.state.assetsTotalCount = 0;
    if (!selectedStageCode) {
      this.state.error = '关卡选择已失效，请重新选择主线关卡。';
      this.host.setStatus(this.state.error);
    }
    this.bump();
  }

  async start(stageCode: string): Promise<void> {
    const selectedStageCode = normalizeStageCode(stageCode);
    if (!selectedStageCode) {
      this.clearPresentationTimers();
      this.state.starting = false;
      this.state.settling = false;
      this.state.stageCode = '';
      this.state.error = '关卡选择已失效，请重新选择主线关卡。';
      this.state.start = null;
      this.state.settlement = null;
      this.state.presentationStep = 0;
      this.state.presentationElapsedMs = 0;
      this.state.presentationStartedAtMs = 0;
      this.state.presentationComplete = false;
      this.host.setStatus(this.state.error);
      this.bump();
      return;
    }
    if (this.state.stageCode === selectedStageCode && (this.state.starting || this.state.start || this.state.settling || this.state.settlement)) {
      // 同一关卡的战斗会话已经在创建或已创建时，不再重复 POST battle start。
      return;
    }
    const currentTicket = ++this.ticket;
    this.state.starting = true;
    this.state.settling = false;
    this.state.stageCode = selectedStageCode;
    this.state.error = '';
    this.state.start = null;
    this.state.settlement = null;
    this.state.presentationStep = 0;
    this.state.presentationElapsedMs = 0;
    this.state.presentationStartedAtMs = 0;
    this.state.presentationComplete = false;
    this.clearPresentationTimers();
    this.bump();
    try {
      const dto = this.buildStartDTO(this.state.stageCode);
      const start = await this.battleApi.startBattle(dto);
      if (!this.isCurrent(currentTicket)) {
        return;
      }
      this.state.start = start;
      this.state.stageCode = start.stageCode;
      this.state.starting = false;
      this.state.presentationStep = 0;
      this.state.presentationElapsedMs = 0;
      this.state.presentationStartedAtMs = 0;
      this.state.presentationComplete = false;
      // 资产加载门:先把本场全部单位骨骼/立绘装进缓存(渲染层显示加载界面),
      // 就绪后才启动演出计时;加载失败/超时由实现方兜底 resolve,不阻塞进战。
      if (this.host.preloadBattleSessionAssets) {
        const loadingStartedAtMs = Date.now();
        this.state.assetsLoading = true;
        this.state.assetsLoadedCount = 0;
        this.state.assetsTotalCount = 0;
        this.bump();
        try {
          await this.host.preloadBattleSessionAssets(start, (loaded, total) => {
            if (!this.isCurrent(currentTicket)) {
              return;
            }
            this.state.assetsLoadedCount = loaded;
            this.state.assetsTotalCount = total;
            this.bump();
          });
        } catch {
          // 预载异常不阻塞进战,单位按原有占位/回退渲染。
        }
        const remainingMs = MIN_BATTLE_ASSET_LOADING_SCREEN_MS - (Date.now() - loadingStartedAtMs);
        if (remainingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingMs));
        }
        if (!this.isCurrent(currentTicket)) {
          return;
        }
        this.state.assetsLoading = false;
      }
      this.state.presentationStartedAtMs = Date.now();
      this.host.setStatus(`战斗会话已创建：${start.stageCode}`);
      this.bump();
      this.schedulePresentationTicks(currentTicket);
    } catch (error) {
      if (!this.isCurrent(currentTicket)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.state.error = message.includes('战斗力不足') ? `${message}；请返回编队调整阵容，或先升级英雄。` : message;
      this.state.starting = false;
      this.host.setStatus(`战斗会话创建失败：${this.state.error}`);
    } finally {
      if (this.isCurrent(currentTicket)) {
        this.bump();
      }
    }
  }

  // 视觉胜负确认(敌方全灭弹结算框)即提前收口演出并提交结算,消除"胜利框到自动结算"的空窗:
  // 空窗期离场会清计时器导致 settle 永不提交,玩家看到胜利却拿不到奖励、主线不推进。
  completePresentationEarlyAndSettle(): void {
    if (!this.state.start || this.state.settlement || this.state.settling) {
      return;
    }
    if (!this.state.presentationComplete) {
      this.clearPresentationTimers();
      this.state.presentationComplete = true;
      this.state.presentationElapsedMs = this.resolvePresentationTotalDurationMs();
      this.host.setStatus('战斗胜负已定，正在提交后端结算…');
      this.bump();
    }
    void this.settle();
  }

  async settle(): Promise<void> {
    const currentStart = this.state.start;
    if (!currentStart || this.state.settling || this.state.settlement || !this.state.presentationComplete) {
      return;
    }
    const currentTicket = ++this.ticket;
    this.clearPresentationTimers();
    this.state.settling = true;
    this.state.error = '';
    this.bump();
    try {
      const dto: PlayerBattleSettleDTO = {
        requestId: createRequestId('battle-settle'),
        // 真实胜负:客户端确定性 sim 敌全灭=WIN、我方全灭=LOSE(后端权威裁决奖励,LOSE 不发奖不推进)。
        // 输出试炼(难度Ⅲ)sim 永远 WIN,层数即输出分。
        result: this.resolveBattleOutcome(),
        durationSeconds: 45,
        roundCount: 3,
        clientChecksum: currentStart.serverSeed.slice(0, 32),
        trialLayers: this.host.resolveTrialLayersCleared?.() ?? null,
      };
      const settlement = await this.battleApi.settleBattle(currentStart.battleNo, dto);
      if (!this.isCurrent(currentTicket)) {
        return;
      }
      if (settlement.stageCode !== currentStart.stageCode) {
        throw new Error(`战斗结算关卡不一致：会话 ${currentStart.stageCode}，结算 ${settlement.stageCode}`);
      }
      this.state.settlement = settlement;
      this.state.settling = false;
      this.host.setStatus(settlement.message || (settlement.rewardGranted ? '主线首通结算完成。' : '战斗记录完成，未产生奖励。'));
      this.host.onBattleSettlementRecorded?.();
    } catch (error) {
      if (!this.isCurrent(currentTicket)) {
        return;
      }
      this.state.error = error instanceof Error ? error.message : String(error);
      this.state.settling = false;
      this.host.setStatus(`战斗记录失败：${this.state.error}`);
    } finally {
      if (this.isCurrent(currentTicket)) {
        this.bump();
      }
    }
  }

  async loadRecentBattles(force = false): Promise<void> {
    if (this.state.recentLoading) {
      return;
    }
    if (!force && this.state.recentBattles.length > 0 && !this.state.recentError) {
      return;
    }
    const currentTicket = ++this.recentTicket;
    this.state.recentLoading = true;
    this.state.recentError = '';
    this.bumpOverlay();
    try {
      const records = await this.battleApi.recentBattles();
      if (this.recentTicket !== currentTicket) {
        return;
      }
      // 最近战斗记录只展示后端已结算结果；接口校验已限制为 NO_REWARD 或 R1 白名单。
      this.state.recentBattles = records;
      this.state.recentLoading = false;
      this.state.recentError = '';
    } catch (error) {
      if (this.recentTicket !== currentTicket) {
        return;
      }
      this.state.recentLoading = false;
      this.state.recentError = error instanceof Error ? error.message : String(error);
      console.warn('[LootChain] recent battle records load failed:', error);
    } finally {
      if (this.recentTicket === currentTicket) {
        this.bumpOverlay();
      }
    }
  }

  private buildStartDTO(stageCode: string): PlayerBattleStartDTO {
    const heroes = this.resolveLineupHeroes(this.host.currentLobbyFormationHeroIds());
    if (heroes.length === 0) {
      throw new Error('当前没有可上阵英雄，请先获取英雄或刷新英雄队列。');
    }
    const leader = heroes[0];
    return {
      requestId: createRequestId('battle-start'),
      stageCode,
      heroIds: heroes.map((hero) => hero.id),
      leaderHeroId: leader.id,
      clientVersion: 'cocos-lobby-stage-4o',
    };
  }

  private resolveLineupHeroes(selectedHeroIds: number[]): LobbyHeroItemVO[] {
    const selectable = [...this.host.currentLobbyHeroRosterState().heroes]
      .filter((hero) => hero.id > 0 && !hero.protagonist && hero.rarity.toUpperCase() !== 'EX' && !hero.heroCode.toUpperCase().startsWith('EX_'));
    const byId = new Map(selectable.map((hero) => [hero.id, hero]));
    if (selectedHeroIds.length > 0) {
      // 战斗请求只提交玩家当前确认的本地阵容 ID；属性、奖励、消耗仍由后端掌控。
      const selected = selectedHeroIds.map((heroId) => byId.get(heroId)).filter((hero): hero is LobbyHeroItemVO => !!hero).slice(0, 4);
      if (selected.length > 0) {
        return selected;
      }
      throw new Error('本次确认阵容已失效，请刷新英雄队列后重新编队。');
    }
    return selectable
      .sort((a, b) => b.power - a.power)
      .slice(0, 4);
  }

  private bump(): void {
    this.state.version += 1;
    this.host.refreshLobbyBattlePreviewPanel();
  }

  private bumpOverlay(): void {
    this.state.version += 1;
    this.host.refreshLobbyOverlay();
  }

  private isCurrent(currentTicket: number): boolean {
    return this.ticket === currentTicket;
  }

  private schedulePresentationTicks(currentTicket: number): void {
    // 本地表现时间轴只驱动画面节奏，不决定胜负、奖励、体力或主线进度。
    const totalDurationMs = this.resolvePresentationTotalDurationMs();
    const maxPresentationStep = Math.max(
      LOBBY_BATTLE_PRESENTATION_STEP_COUNT,
      Math.ceil(totalDurationMs / LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS),
    );
    const tick = () => {
      if (!this.isCurrent(currentTicket) || !this.state.start || this.state.settlement || this.state.settling) {
        return;
      }
      const startedAtMs = this.state.presentationStartedAtMs || Date.now();
      this.state.presentationStartedAtMs = startedAtMs;
      const elapsedMs = Math.min(totalDurationMs, Math.max(0, Date.now() - startedAtMs));
      this.state.presentationElapsedMs = elapsedMs;
      this.state.presentationStep = Math.min(
        maxPresentationStep,
        Math.floor(elapsedMs / LOBBY_BATTLE_PRESENTATION_STEP_INTERVAL_MS),
      );
      this.state.presentationComplete = elapsedMs >= totalDurationMs;
      if (this.state.presentationComplete) {
        // 矿境守卫:实时局没有固定演出时长,sim 未分出胜负前不许计时器自动结算(守卫渲染层终局时主动 settle)。
        if (this.host.resolveGuardBattleOutcome?.() === 'PENDING') {
          this.state.presentationComplete = false;
          const waitTimer = setTimeout(tick, 500);
          this.presentationTimers.push(waitTimer);
          return;
        }
        this.host.setStatus('战斗演出完成，正在提交后端结算…');
        this.bump();
        void this.settle();
        return;
      }
      this.host.refreshLobbyBattlePresentationPlayback();
      const timer = setTimeout(tick, LOBBY_BATTLE_PRESENTATION_FRAME_INTERVAL_MS);
      this.presentationTimers.push(timer);
    };
    const timer = setTimeout(tick, LOBBY_BATTLE_PRESENTATION_FRAME_INTERVAL_MS);
    this.presentationTimers.push(timer);
  }

  private resolvePresentationTotalDurationMs(): number {
    if (!this.state.start) {
      return FALLBACK_BATTLE_PRESENTATION_TOTAL_MS;
    }
    try {
      const snapshot = resolveLobbyBattlePresentationSnapshot(this.state, this.host.currentLobbyHeroRosterState().heroes);
      const timeline = resolveLobbyBattlePresentationTimeline(snapshot);
      return resolveLobbyBattleVisualCompletionDurationMs(snapshot, timeline);
    } catch (error) {
      console.warn('[LootChain] battle visual completion duration fallback:', error);
      return FALLBACK_BATTLE_PRESENTATION_TOTAL_MS;
    }
  }

  // 客户端确定性 sim 的胜负结果:敌全灭且我方尚存=WIN,否则(我方全灭)=LOSE。异常兜底 WIN 保持旧行为。
  private resolveBattleOutcome(): PlayerBattleSettleDTO['result'] {
    if (!this.state.start) {
      return 'WIN';
    }
    const guardOutcome = this.host.resolveGuardBattleOutcome?.() ?? null;
    if (guardOutcome === 'WIN' || guardOutcome === 'LOSE') {
      return guardOutcome;
    }
    try {
      const snapshot = resolveLobbyBattlePresentationSnapshot(this.state, this.host.currentLobbyHeroRosterState().heroes);
      const timeline = resolveLobbyBattlePresentationTimeline(snapshot);
      return resolveBattleReplay(snapshot, timeline).victory ? 'WIN' : 'LOSE';
    } catch (error) {
      console.warn('[LootChain] battle outcome fallback to WIN:', error);
      return 'WIN';
    }
  }

  private clearPresentationTimers(): void {
    while (this.presentationTimers.length > 0) {
      const timer = this.presentationTimers.pop();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

function normalizeStageCode(stageCode: string): string | null {
  const value = (stageCode || '').trim().toUpperCase();
  // 每日材料副本(P7b)与主线共用同一条战斗流;DAILY 码由后端做开放日/次数/解锁校验。
  return /^MAIN_\d+_\d+$/.test(value) || /^DAILY_[A-Z]+_[1-3]$/.test(value) ? value : null;
}

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
