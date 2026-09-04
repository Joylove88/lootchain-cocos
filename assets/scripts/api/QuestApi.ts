import { HttpClient } from '../net/HttpClient';
import type { PlayerQuestSummaryVO, PlayerQuestVO } from '../types/QuestTypes';
import { expectRecord } from './ApiValueGuards';

/** 任务/成就(P1,2026-09-04)。 */
export class QuestApi {
  constructor(private readonly http: HttpClient) {}

  async summary(): Promise<PlayerQuestSummaryVO> {
    return await this.http.get<unknown>('/api/player/quests').then(expectRecord<PlayerQuestSummaryVO>('任务面板'));
  }

  async claim(questCode: string): Promise<PlayerQuestVO> {
    return await this.http.post<unknown>('/api/player/quests/claim', { questCode }).then(expectRecord<PlayerQuestVO>('任务领取'));
  }
}
