import { HttpClient } from '../net/HttpClient';
import type { GuardCrystalInfoVO, GuardCrystalUpgradeResultVO } from '../types/GuardCrystalTypes';
import { expectRecord } from './ApiValueGuards';

/** 守卫水晶养成(docs/38):面板数据 + 花金币升 1 级(requestId 幂等)。 */
export class GuardCrystalApi {
  constructor(private readonly http: HttpClient) {}

  info(): Promise<GuardCrystalInfoVO> {
    return this.http.get<unknown>('/api/player/guard-crystal').then(expectRecord<GuardCrystalInfoVO>('守卫水晶'));
  }

  upgrade(requestId: string): Promise<GuardCrystalUpgradeResultVO> {
    return this.http.post<unknown>('/api/player/guard-crystal/upgrade', { requestId }).then(expectRecord<GuardCrystalUpgradeResultVO>('水晶升级'));
  }
}
