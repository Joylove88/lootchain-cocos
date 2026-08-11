import { HttpClient } from '../net/HttpClient';
import type { PlayerIdleClaimVO, PlayerIdleSummaryVO } from '../types/IdleTypes';
import { isRecord, readInteger, readNumber, readText } from './ApiValueGuards';

const MAX_FLOOR = 393;
const MAX_SECONDS = 24 * 3600;
const MAX_GOLD = 10_000_000;
const MAX_EXP_BOOK = 64;
const MAX_TEXT = 120;

/** 挂机收益 API。汇总与领取均由服务端权威计费,领取带幂等 requestId。 */
export class IdleApi {
  constructor(private readonly http: HttpClient) {}

  summary(): Promise<PlayerIdleSummaryVO> {
    return this.http.get<unknown>('/api/player/idle/summary').then(validateSummary);
  }

  claim(): Promise<PlayerIdleClaimVO> {
    const requestId = `idle-claim-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    return this.http.post<unknown>('/api/player/idle/claim', { requestId }).then(validateClaim);
  }
}

function validateSummary(data: unknown): PlayerIdleSummaryVO {
  if (!isRecord(data)) {
    throw new Error('挂机汇总响应格式错误：data 不是对象');
  }
  return {
    farmingFloor: readInteger(data.farmingFloor, 1, MAX_FLOOR),
    stageCode: readText(data, 'stageCode', 32),
    goldPerHour: readNumber(data.goldPerHour, 0, MAX_GOLD),
    expBookIntervalSeconds: readInteger(data.expBookIntervalSeconds, 60, MAX_SECONDS),
    accruedSeconds: readInteger(data.accruedSeconds, 0, MAX_SECONDS),
    capSeconds: readInteger(data.capSeconds, 60, MAX_SECONDS),
    pendingGold: readNumber(data.pendingGold, 0, MAX_GOLD),
    pendingExpBook: readInteger(data.pendingExpBook, 0, MAX_EXP_BOOK),
    claimable: data.claimable === true,
  };
}

function validateClaim(data: unknown): PlayerIdleClaimVO {
  if (!isRecord(data)) {
    throw new Error('挂机领取响应格式错误：data 不是对象');
  }
  return {
    claimNo: readText(data, 'claimNo', 64),
    replayed: data.replayed === true,
    accruedSeconds: readInteger(data.accruedSeconds, 0, MAX_SECONDS),
    goldAmount: readNumber(data.goldAmount, 0, MAX_GOLD),
    expBookCount: readInteger(data.expBookCount, 0, MAX_EXP_BOOK),
    farmingFloor: readInteger(data.farmingFloor, 1, MAX_FLOOR),
    message: readText(data, 'message', MAX_TEXT),
  };
}

