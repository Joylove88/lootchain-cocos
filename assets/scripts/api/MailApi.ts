import { HttpClient } from '../net/HttpClient';
import type { PlayerMailVO } from '../types/QuestTypes';
import { expectRecord } from './ApiValueGuards';

/** 玩家邮件(P1 个人直投,2026-09-04)。 */
export class MailApi {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<PlayerMailVO[]> {
    const rows = await this.http.get<unknown>('/api/player/mails');
    return Array.isArray(rows) ? (rows as PlayerMailVO[]) : [];
  }

  async markRead(mailId: number): Promise<void> {
    await this.http.post<unknown>('/api/player/mails/read', { mailId });
  }

  async claim(mailId: number): Promise<PlayerMailVO> {
    return await this.http.post<unknown>('/api/player/mails/claim', { mailId }).then(expectRecord<PlayerMailVO>('邮件领取'));
  }

  async claimAll(): Promise<number> {
    const count = await this.http.post<unknown>('/api/player/mails/claim-all', {});
    return Number(count ?? 0);
  }
}
