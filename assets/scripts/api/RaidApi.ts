import { HttpClient } from '../net/HttpClient';
import type { RaidStagesVO, RaidStageVO } from '../types/RaidTypes';
import { isRecord, readArray, readInteger, readText } from './ApiValueGuards';
import { normalizeRewardItem } from './BattleApi';

const MAX_TEXT = 64;

/** 矿境掠夺只读 API(docs/48):矿列表;开战 / 结算复用 BattleApi(stageCode=RAID_n)。 */
export class RaidApi {
  constructor(private readonly http: HttpClient) {}

  stages(): Promise<RaidStagesVO> {
    return this.http.get<unknown>('/api/player/raid/stages').then(validateStages);
  }
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
