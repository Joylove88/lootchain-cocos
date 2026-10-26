import { HttpClient } from '../net/HttpClient';
import type { RaidPvpHomeVO, RaidStagesVO, RaidStageVO } from '../types/RaidTypes';
import { isRecord, readArray, readInteger, readOptionalText, readText } from './ApiValueGuards';
import { normalizeRewardItem } from './BattleApi';

const MAX_TEXT = 64;

/** 矿境掠夺只读 API(docs/48):矿列表;开战 / 结算复用 BattleApi(stageCode=RAID_n)。 */
export class RaidApi {
  constructor(private readonly http: HttpClient) {}

  stages(): Promise<RaidStagesVO> {
    return this.http.get<unknown>('/api/player/raid/stages').then(validateStages);
  }

  /** 真人矿页;refresh = 换一批候选。 */
  pvpHome(refresh = false): Promise<RaidPvpHomeVO> {
    return this.http.get<unknown>(refresh ? '/api/player/raid/pvp/home?refresh=1' : '/api/player/raid/pvp/home').then(validatePvpHome);
  }

  buyShield(): Promise<RaidPvpHomeVO> {
    return this.http.post<unknown>('/api/player/raid/pvp/shield/buy').then(validatePvpHome);
  }
}

function validatePvpHome(data: unknown): RaidPvpHomeVO {
  if (!isRecord(data)) {
    throw new Error('真人矿响应格式错误:data 不是对象');
  }
  return {
    myCrystal: readInteger(data.myCrystal, 0, Number.MAX_SAFE_INTEGER),
    lineupPower: readInteger(data.lineupPower, 0, Number.MAX_SAFE_INTEGER),
    shieldUntil: readOptionalText(data, 'shieldUntil', 40),
    protectUntil: readOptionalText(data, 'protectUntil', 40),
    shieldPrice: readInteger(data.shieldPrice, 0, Number.MAX_SAFE_INTEGER),
    canBuyShield: data.canBuyShield === true,
    shieldNote: readText(data, 'shieldNote', 80, ''),
    stealPct: readInteger(data.stealPct, 0, 100),
    penaltyPct: readInteger(data.penaltyPct, 0, 100),
    staminaCost: readInteger(data.staminaCost, 0, 999),
    candidates: readArray(data, 'candidates', 10).map((entry) => {
      const record = isRecord(entry) ? entry : {};
      return {
        userId: readInteger(record.userId, 0, Number.MAX_SAFE_INTEGER),
        nickname: readText(record, 'nickname', MAX_TEXT, '玩家'),
        level: readInteger(record.level, 1, 999),
        lineupPower: readInteger(record.lineupPower, 0, Number.MAX_SAFE_INTEGER),
        crystal: readInteger(record.crystal, 0, Number.MAX_SAFE_INTEGER),
        stealPreview: readInteger(record.stealPreview, 0, Number.MAX_SAFE_INTEGER),
        attackedRecently: record.attackedRecently === true,
        defenders: readArray(record, 'defenders', 6).map(normalizeDefenderPreview),
      };
    }),
    reports: readArray(data, 'reports', 30).map((entry) => {
      const record = isRecord(entry) ? entry : {};
      const role = readText(record, 'role', 8, 'ATTACK');
      return {
        id: readInteger(record.id, 0, Number.MAX_SAFE_INTEGER),
        battleNo: readText(record, 'battleNo', MAX_TEXT, ''),
        role: role === 'DEFEND' ? 'DEFEND' as const : 'ATTACK' as const,
        opponentUserId: readInteger(record.opponentUserId, 0, Number.MAX_SAFE_INTEGER),
        opponentName: readText(record, 'opponentName', MAX_TEXT, '玩家'),
        opponentLevel: readInteger(record.opponentLevel, 0, 999),
        result: readText(record, 'result', 8, 'LOSE'),
        crystalDelta: Math.trunc(Number(record.crystalDelta) || 0),
        createdAt: readText(record, 'createdAt', 40, ''),
        canRevenge: record.canRevenge === true,
      };
    }),
  };
}

function normalizeDefenderPreview(entry: unknown) {
  const record = isRecord(entry) ? entry : {};
  return {
    heroCode: readText(record, 'heroCode', MAX_TEXT, ''),
    heroName: readText(record, 'heroName', MAX_TEXT, ''),
    rarity: readText(record, 'rarity', 8, 'R'),
    star: readInteger(record.star, 1, 99),
    level: readInteger(record.level, 1, 999),
  };
}

function validateStages(data: unknown): RaidStagesVO {
  if (!isRecord(data)) {
    throw new Error('矿境响应格式错误:data 不是对象');
  }
  return {
    clearedMax: readInteger(data.clearedMax, 0, 999),
    nextStageCode: readText(data, 'nextStageCode', MAX_TEXT, ''),
    totalWins: readInteger(data.totalWins, 0, Number.MAX_SAFE_INTEGER),
    totalRaids: readInteger(data.totalRaids, 0, Number.MAX_SAFE_INTEGER),
    stages: readArray(data, 'stages', 200).map(normalizeStage),
  };
}

function normalizeStage(item: unknown): RaidStageVO {
  if (!isRecord(item)) {
    throw new Error('矿境响应格式错误:关卡不是对象');
  }
  return {
    stageCode: readText(item, 'stageCode', MAX_TEXT, ''),
    orderNo: readInteger(item.orderNo, 0, 999),
    zoneName: readText(item, 'zoneName', MAX_TEXT, ''),
    stageName: readText(item, 'stageName', MAX_TEXT, ''),
    recommendedPower: readInteger(item.recommendedPower, 0, Number.MAX_SAFE_INTEGER),
    staminaCost: readInteger(item.staminaCost, 0, 999),
    unlocked: item.unlocked === true,
    cleared: item.cleared === true,
    defenders: readArray(item, 'defenders', 6).map((entry) => {
      const record = isRecord(entry) ? entry : {};
      return {
        heroCode: readText(record, 'heroCode', MAX_TEXT, ''),
        heroName: readText(record, 'heroName', MAX_TEXT, ''),
        rarity: readText(record, 'rarity', 8, 'R'),
        star: readInteger(record.star, 1, 99),
        level: readInteger(record.level, 1, 999),
      };
    }),
    rewardPreview: readArray(item, 'rewardPreview', 8).map(normalizeRewardItem),
    firstClearRewards: readArray(item, 'firstClearRewards', 8).map(normalizeRewardItem),
  };
}
