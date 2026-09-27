import { HttpClient } from '../net/HttpClient';
import type { GuardCrystalInfoVO, GuardCrystalUpgradeResultVO } from '../types/GuardCrystalTypes';
import { expectRecord } from './ApiValueGuards';

/** 守卫水晶养成(docs/38):面板数据 + 花金币与守卫晶核升 1 级(requestId 幂等)+ 设置出战法术。 */
export class GuardCrystalApi {
  constructor(private readonly http: HttpClient) {}

  info(): Promise<GuardCrystalInfoVO> {
    return this.http.get<unknown>('/api/player/guard-crystal').then(expectRecord<GuardCrystalInfoVO>('守卫水晶'));
  }

  upgrade(requestId: string): Promise<GuardCrystalUpgradeResultVO> {
    return this.http.post<unknown>('/api/player/guard-crystal/upgrade', { requestId }).then(expectRecord<GuardCrystalUpgradeResultVO>('水晶升级'));
  }

  /** 设置出战法术(按格位顺序;服务端校验已解锁与格数)。 */
  setLoadout(spells: string[]): Promise<GuardCrystalInfoVO> {
    return this.http.post<unknown>('/api/player/guard-crystal/loadout', { spells }).then(expectRecord<GuardCrystalInfoVO>('法术装备'));
  }
}
