import { HttpClient } from '../net/HttpClient';
import type { LobbyAdventureChapterVO, LobbyAdventureStageVO, LobbyAdventureVO } from '../types/LobbyAdventureTypes';

type UnknownRecord = Record<string, unknown>;

const MAX_CHAPTER_COUNT = 25;
const MAX_STAGE_COUNT = 393;
const FIRST_CHAPTER_STAGE_COUNT = 9;
const STAGES_PER_CHAPTER_AFTER_FIRST = 16;
const MAX_TEXT_LENGTH = 120;
const MAX_REWARD_PREVIEW = 6;

/** 大厅冒险只读 API；只读取主线地图展示壳，不调用战斗、结算、奖励或进度写接口。 */
export class LobbyAdventureApi {
  constructor(private readonly http: HttpClient) {}

  lobbyAdventure(): Promise<LobbyAdventureVO> {
    return this.http.get<unknown>('/api/player/lobby/adventure').then(validateLobbyAdventure);
  }
}

function validateLobbyAdventure(data: unknown): LobbyAdventureVO {
  if (!isRecord(data)) {
    throw new Error('大厅冒险响应格式错误：data 不是对象');
  }
  const chapters = readArray(data, 'chapters', MAX_CHAPTER_COUNT).map(normalizeChapter);
  const stageCount = chapters.reduce((total, chapter) => total + chapter.stages.length, 0);
  if (stageCount > MAX_STAGE_COUNT) {
    throw new Error('大厅冒险响应格式错误：关卡数量超过上限');
  }
  return {
    mode: readText(data, 'mode', 32, 'mainline'),
    readonly: data.readonly !== false,
    playerLevel: readInteger(data.playerLevel, 1, 999),
    playerPower: readInteger(data.playerPower, 0, Number.MAX_SAFE_INTEGER),
    currentChapterCode: readText(data, 'currentChapterCode', MAX_TEXT_LENGTH, ''),
    currentChapterName: readText(data, 'currentChapterName', MAX_TEXT_LENGTH, '主线章节'),
    recommendedStageCode: readText(data, 'recommendedStageCode', MAX_TEXT_LENGTH, ''),
    recommendedStageName: readText(data, 'recommendedStageName', MAX_TEXT_LENGTH, '当前关卡'),
    recommendationText: readText(data, 'recommendationText', 180, '继续深渊爬塔。'),
    guardrails: sanitizeTextArray(readArray(data, 'guardrails', 8), 160),
    chapters,
    maxCompletedStageCode: readText(data, 'maxCompletedStageCode', MAX_TEXT_LENGTH, ''),
  };
}

function normalizeChapter(item: unknown): LobbyAdventureChapterVO {
  if (!isRecord(item)) {
    throw new Error('大厅冒险响应格式错误：章节不是对象');
  }
  return {
    chapterCode: readText(item, 'chapterCode', MAX_TEXT_LENGTH, ''),
    chapterName: readText(item, 'chapterName', MAX_TEXT_LENGTH, '未命名章节'),
    subtitle: readText(item, 'subtitle', MAX_TEXT_LENGTH, ''),
    summary: readText(item, 'summary', 180, ''),
    unlocked: item.unlocked !== false,
    stages: readArray(item, 'stages', STAGES_PER_CHAPTER_AFTER_FIRST)
      .map(normalizeStage)
      .filter((stage): stage is LobbyAdventureStageVO => stage !== null),
  };
}

function normalizeStage(item: unknown): LobbyAdventureStageVO | null {
  if (!isRecord(item)) {
    throw new Error('大厅冒险响应格式错误：关卡不是对象');
  }
  const stageCode = normalizeMainStageCode(readText(item, 'stageCode', MAX_TEXT_LENGTH, ''));
  if (!stageCode) {
    // 爬塔面板只展示当前开放的主线关卡；EX 或非法关卡不进入 UI，避免玩家点到后才被 root 拦截。
    return null;
  }
  return {
    stageCode,
    stageName: readText(item, 'stageName', MAX_TEXT_LENGTH, '未命名关卡'),
    orderNo: readInteger(item.orderNo, 0, 999),
    unlocked: item.unlocked === true,
    recommended: item.recommended === true,
    requiredLevel: readInteger(item.requiredLevel, 1, 999),
    recommendedPower: readInteger(item.recommendedPower, 0, Number.MAX_SAFE_INTEGER),
    enemySummary: readText(item, 'enemySummary', 180, '敌情待确认'),
    rewardPreview: sanitizeTextArray(readArray(item, 'rewardPreview', MAX_REWARD_PREVIEW), 64),
    statusLabel: readText(item, 'statusLabel', 32, item.unlocked === true ? '可预览' : '锁定'),
    unlockHint: readText(item, 'unlockHint', 120, item.unlocked === true ? '已达成进入条件' : '暂未满足进入条件'),
    lockReasonCode: readText(item, 'lockReasonCode', 32, item.unlocked === true ? 'NONE' : 'PROGRESS_REQUIRED'),
    levelGap: readInteger(item.levelGap, 0, 999),
    requiredLevelNeedExp: readInteger(item.requiredLevelNeedExp, 0, Number.MAX_SAFE_INTEGER),
    expToRequiredLevel: readInteger(item.expToRequiredLevel, 0, Number.MAX_SAFE_INTEGER),
    nextGuidanceTitle: readText(item, 'nextGuidanceTitle', 80, item.unlocked === true ? '已开放主线' : '关卡暂未解锁'),
    nextGuidanceText: readText(item, 'nextGuidanceText', 180, item.unlocked === true ? '可进入编队确认。' : '当前未满足进入条件。'),
    growthSourceSummary: readText(item, 'growthSourceSummary', 160, '当前阶段经验来源以服务端配置为准。'),
    growthSourceStatus: readText(item, 'growthSourceStatus', 48, item.unlocked === true ? 'NEXT_FIRST_CLEAR_AVAILABLE' : 'LOCKED'),
    growthSourceHint: readText(item, 'growthSourceHint', 180, '当前未开放新的经验获取入口。'),
    repeatableExpAvailable: item.repeatableExpAvailable === true,
  };
}

function sanitizeTextArray(values: unknown[], maxLength: number): string[] {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().slice(0, maxLength))
    .filter((value) => value && !value.toUpperCase().includes('EX_'));
}

function normalizeMainStageCode(stageCode: string): string {
  const value = (stageCode || '').trim().toUpperCase();
  return annualMainlineStageOrder(value) > 0 ? value : '';
}

function annualMainlineStageOrder(stageCode: string): number {
  const match = /^MAIN_(\d{1,2})_(\d{1,2})$/.exec(stageCode);
  if (!match) {
    return 0;
  }
  const chapter = Number(match[1]);
  const stage = Number(match[2]);
  if (chapter === 1) {
    return stage >= 1 && stage <= FIRST_CHAPTER_STAGE_COUNT ? stage : 0;
  }
  if (chapter < 2 || chapter > MAX_CHAPTER_COUNT || stage < 1 || stage > STAGES_PER_CHAPTER_AFTER_FIRST) {
    return 0;
  }
  return FIRST_CHAPTER_STAGE_COUNT + (chapter - 2) * STAGES_PER_CHAPTER_AFTER_FIRST + stage;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArray(record: UnknownRecord, key: string, maxLength: number): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, maxLength);
}

function readText(record: UnknownRecord, key: string, maxLength: number, fallback: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function readInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}
