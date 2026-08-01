import {
  LOBBY_BATTLE_COMBAT_START_STEP,
  LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT,
  LOBBY_BATTLE_PRESENTATION_STEP_COUNT,
  type LobbyBattlePanelState,
} from './LobbyBattleState';
import type { PlayerBattleRewardItemVO } from '../../types/BattleTypes';

export type LobbyBattlePresentationPhase =
  | 'creatingSession'
  | 'ready'
  | 'roundPlaying'
  | 'resultRecording'
  | 'resultRecorded'
  | 'error';

export interface LobbyBattlePresentationState {
  phase: LobbyBattlePresentationPhase;
  title: string;
  subtitle: string;
  boundaryText: string;
  timelineText: string;
  logLines: string[];
  settlementReceiptLines?: string[];
  nextStepText?: string;
  actionLabel: string;
  actionNodeName: string;
  actionEnabled: boolean;
  returnToLobby: boolean;
  damageText: string;
  leadEnemyHp: number;
}

/** 将接口状态翻译成战斗表现状态，避免渲染层直接拼接业务阶段；真实结算只展示后端回执。 */
export function resolveLobbyBattlePresentationState(state: LobbyBattlePanelState): LobbyBattlePresentationState {
  if (state.starting) {
    return {
      phase: 'creatingSession',
      title: '主线战斗',
      subtitle: '正在创建后端战斗会话...',
      boundaryText: '已创建 battle session；战斗演出完成后自动提交后端结算。',
      timelineText: '会话创建中',
      logLines: ['编队已锁定为本次预演阵容。', '等待后端返回战斗种子与敌方快照。'],
      actionLabel: '会话创建中',
      actionNodeName: 'LobbyBattleStartPending',
      actionEnabled: false,
      returnToLobby: false,
      damageText: '',
      leadEnemyHp: 0.72,
    };
  }
  if (state.settling) {
    return {
      phase: 'resultRecording',
      title: '主线战斗',
      subtitle: '正在整理本地战斗表现...',
      boundaryText: '当前只展示视觉结果；客户端不提交奖励、体力或进度。',
      timelineText: '视觉结果整理中',
      logLines: ['战斗演出已完成。', '本轮不提交后端结算，不产生资源变化。'],
      actionLabel: '记录中',
      actionNodeName: 'LobbyBattleSettlePending',
      actionEnabled: false,
      returnToLobby: false,
      damageText: 'REC',
      leadEnemyHp: 0.18,
    };
  }
  if (state.settlement) {
    const settlement = state.settlement;
    const realMainline = isAnnualMainlineSettlementMode(settlement.settlementMode);
    const dailyDungeon = settlement.settlementMode === 'DAILY_DUNGEON';
    const rewarded = realMainline || dailyDungeon;
    const rewardLine = rewarded ? formatRewardLine(settlement.rewardItems) : '未产生奖励';
    const staminaLine = rewarded
      ? `体力：${formatStamina(settlement.staminaBefore, settlement.staminaAfter, settlement.staminaCost)}`
      : '体力：未扣除';
    const progressLine = realMainline && settlement.mainlineProgress?.progressed
      ? `进度：解锁 ${settlement.mainlineProgress.unlockedStageCode}`
      : '进度：不推进';
    return {
      phase: 'resultRecorded',
      title: realMainline ? '首通结算完成' : dailyDungeon ? '每日副本完成' : '战斗记录完成',
      subtitle: `关卡 ${settlement.stageCode} / ${settlement.settlementMode} / ${settlement.message}`,
      boundaryText: realMainline
        ? '返回大厅后会刷新体力、背包、主线进度和最近战斗记录。'
        : dailyDungeon
          ? '返回大厅后会刷新剩余次数、体力与背包；开放次数内可再次挑战。'
          : '返回大厅后可在深渊爬塔查看最近记录；本次未产生奖励、体力或进度变更。',
      timelineText: realMainline ? '首通结算完成' : dailyDungeon ? '每日副本结算完成' : '记录完成',
      logLines: [
        `Battle：${settlement.battleNo}`,
        `Settlement：${settlement.settlementNo}`,
        `目标关卡：${settlement.stageCode}`,
        `结果：${settlement.result} / 状态：${settlement.status}`,
        `奖励：${rewardLine}`,
        `${staminaLine}；${progressLine}`,
        '下一步：返回大厅，进入深渊爬塔查看最近挑战记录。',
      ],
      // 结算回执只展示后端结算结果，不承担任何客户端发奖职责。
      settlementReceiptLines: [
        `结算单：${settlement.settlementNo}`,
        `战斗号：${settlement.battleNo}`,
        `奖励：${rewardLine}`,
        staminaLine,
        progressLine,
      ],
      nextStepText: realMainline ? `返回大厅后会看到 ${settlement.mainlineProgress?.unlockedStageCode || '下一关'} 解锁，并回读背包与体力。` : '返回大厅后，深渊爬塔面板会展示本关最近记录。',
      actionLabel: '返回大厅',
      actionNodeName: 'LobbyBattleReturnLobbyButton',
      actionEnabled: true,
      returnToLobby: true,
      damageText: 'RECORDED',
      leadEnemyHp: 0.08,
    };
  }
  if (state.error && !state.start) {
    return {
      phase: 'error',
      title: '战斗暂不可用',
      subtitle: state.error,
      boundaryText: '失败状态不会由客户端写入奖励、体力、进度或资源。',
      timelineText: '创建失败',
      logLines: ['战斗会话未创建。', state.error],
      actionLabel: '重试创建',
      actionNodeName: 'LobbyBattleStartButton',
      actionEnabled: true,
      returnToLobby: false,
      damageText: '',
      leadEnemyHp: 0.72,
    };
  }
  if (state.start) {
    const round = resolveRoundCopy(state.presentationStep);
    const complete = state.presentationComplete;
    return {
      phase: 'roundPlaying',
      title: '主线战斗',
      subtitle: complete ? `关卡 ${state.start.stageCode} / 战斗表现已结束` : `关卡 ${state.start.stageCode} / 战斗进行中`,
      boundaryText: '战斗演出完成后自动提交结算；奖励、体力与主线进度以服务端回执为准。',
      timelineText: complete ? '视觉完成 / 提交结算' : round.timelineText,
      logLines: [
        `服务器种子：${state.start.serverSeed.slice(0, 12)}...`,
        ...round.logLines,
        complete ? '战斗表现已完成；正在提交后端结算。' : '演出进行中，结算将在演出完成后提交。',
      ],
      actionLabel: complete ? '返回大厅' : '演出中',
      actionNodeName: complete ? 'LobbyBattleReturnLobbyButton' : 'LobbyBattlePlaybackPending',
      actionEnabled: complete,
      returnToLobby: false,
      damageText: round.damageText,
      leadEnemyHp: round.leadEnemyHp,
    };
  }
  return {
    phase: 'ready',
    title: '主线战斗',
    subtitle: `目标关卡 ${state.stageCode || '未选择'} / 准备创建战斗会话，胜利后自动提交结算。`,
    boundaryText: '点击开始只创建 battle session；本轮不提交奖励、体力或主线进度结算。',
    timelineText: '等待开始',
    logLines: ['我方编队已就绪。', '点击开始后由后端生成战斗会话。'],
    actionLabel: '开始战斗',
    actionNodeName: 'LobbyBattleStartButton',
    actionEnabled: true,
    returnToLobby: false,
    damageText: '',
    leadEnemyHp: 0.72,
  };
}

function isAnnualMainlineSettlementMode(mode: string): boolean {
  const match = /^REAL_MAINLINE_R(\d{1,3})$/.exec(mode);
  if (!match) {
    return false;
  }
  const order = Number(match[1]);
  return Number.isInteger(order) && order >= 1 && order <= 393;
}

function formatRewardLine(items: PlayerBattleRewardItemVO[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '已发放';
  }
  return items
    .slice(0, 3)
    .map((item) => {
      const name = typeof item.resourceName === 'string' && item.resourceName.trim() ? item.resourceName.trim() : item.resourceCode;
      return `${name} x${formatAmount(item.amount)}`;
    })
    .join(' / ');
}

function formatStamina(before: number | null, after: number | null, cost: number): string {
  if (before === null || after === null) {
    return `-${cost}`;
  }
  return `${before} -> ${after} (-${cost})`;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function resolveRoundCopy(step: number): { timelineText: string; logLines: string[]; damageText: string; leadEnemyHp: number } {
  if (step <= 0) {
    return {
      timelineText: '入场 / 队伍列阵',
      logLines: ['我方队伍进入战斗站位。', '敌方裂隙小队正在集结。'],
      damageText: '',
      leadEnemyHp: 0.72,
    };
  }
  if (step < LOBBY_BATTLE_COMBAT_START_STEP) {
    return {
      timelineText: '开场汇合 / 接敌前进',
      logLines: [
        step < LOBBY_BATTLE_OPENING_CONVERGENCE_STEP_COUNT ? '左侧英雄与右侧怪物先播放 run 跑动。' : '双方已在中场汇合，等待首个行动窗口。',
        '双方向中场推进，汇合后才开始首个行动。',
      ],
      damageText: '',
      leadEnemyHp: 0.72,
    };
  }
  if (step <= 7) {
    return {
      timelineText: '前线接敌 / 近战推进',
      logLines: ['前排英雄向敌方阵线推进。', '敌方前排进入受击距离。'],
      damageText: '-1284',
      leadEnemyHp: 0.64,
    };
  }
  if (step <= 12) {
    return {
      timelineText: '连续交锋 / 命中受击',
      logLines: ['普攻动作后出现单次伤害漂浮。', '目标播放受击反馈，伤害不提前批量显示。'],
      damageText: '-1284',
      leadEnemyHp: 0.5,
    };
  }
  if (step <= 20) {
    return {
      timelineText: '敌方反扑 / 阵线受压',
      logLines: ['敌方前排向左突进反击。', '我方角色播放受击反馈。'],
      damageText: '-392',
      leadEnemyHp: 0.42,
    };
  }
  if (step <= 28) {
    return {
      timelineText: '支援释放 / 队伍增益',
      logLines: ['后排英雄释放支援技能。', '治疗、护盾和增益数字按技能时机漂浮。'],
      damageText: '+ATK',
      leadEnemyHp: 0.38,
    };
  }
  if (step < LOBBY_BATTLE_PRESENTATION_STEP_COUNT) {
    return {
      timelineText: '爆发压制 / 终结推进',
      logLines: ['高稀有度英雄释放爆发动作。', '敌方阵线被压制，等待最后一击。'],
      damageText: '-2406',
      leadEnemyHp: 0.18,
    };
  }
  return {
    timelineText: '演出完成 / 等待记录',
      logLines: ['敌方前排被击退。', '战斗表现完成，正在提交后端结算。'],
    damageText: 'FINISH',
    leadEnemyHp: 0.08,
  };
}
