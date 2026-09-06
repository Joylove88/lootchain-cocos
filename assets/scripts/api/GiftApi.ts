import { HttpClient } from '../net/HttpClient';
import type { QuestRewardItemVO } from '../types/QuestTypes';
import { expectRecordArray } from './ApiValueGuards';

/** 兑换码接口("更多"面板,2026-09-06)。 */
export class GiftApi {
  constructor(private readonly http: HttpClient) {}

  /** 兑换礼包码;成功返回奖励清单(展示用),失败抛业务错误文案。 */
  redeem(code: string): Promise<QuestRewardItemVO[]> {
    return this.http.post<unknown>('/api/player/gift-code/redeem', { code }).then(expectRecordArray<QuestRewardItemVO>('兑换奖励', 16));
  }
}
