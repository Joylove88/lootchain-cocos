import { HttpClient } from '../net/HttpClient';
import type { PageResult } from '../types/CommonTypes';
import type {
  GachaDrawDTO,
  GachaDrawLogVO,
  GachaDrawResultVO,
  GachaFreeStatusVO,
  GachaPityVO,
  GachaPoolDetailVO,
  GachaPoolVO,
} from '../types/GachaTypes';
import { expectRecord, expectRecordArray } from './ApiValueGuards';

/** 抽卡接口封装。 */
export class GachaApi {
  constructor(private readonly http: HttpClient) {}

  pools(): Promise<GachaPoolVO[]> {
    return this.http.get<unknown>('/api/player/gacha/pools').then(expectRecordArray<GachaPoolVO>('卡池列表', 32));
  }

  pool(poolCode: string): Promise<GachaPoolVO> {
    return this.http.get<unknown>(`/api/player/gacha/pools/${encodeURIComponent(poolCode)}`).then(expectRecord<GachaPoolVO>('卡池'));
  }

  poolDetail(poolCode: string): Promise<GachaPoolDetailVO> {
    return this.http.get<unknown>(`/api/player/gacha/pools/${encodeURIComponent(poolCode)}/detail`).then(expectRecord<GachaPoolDetailVO>('卡池详情'));
  }

  pity(poolCode: string): Promise<GachaPityVO[]> {
    return this.http.get<unknown>(`/api/player/gacha/pity/${encodeURIComponent(poolCode)}`).then(expectRecordArray<GachaPityVO>('保底状态', 32));
  }

  draw(dto: GachaDrawDTO): Promise<GachaDrawResultVO> {
    return this.http.post<unknown>('/api/player/gacha/draw', dto).then(expectRecord<GachaDrawResultVO>('抽卡结果'));
  }

  /** 每日免费单抽状态(2026-09-05 新手闭环)。 */
  freeStatus(): Promise<GachaFreeStatusVO> {
    return this.http.get<unknown>('/api/player/gacha/free-status').then(expectRecord<GachaFreeStatusVO>('免费召唤状态'));
  }

  logs(pageNo = 1, pageSize = 20, poolCode?: string): Promise<PageResult<GachaDrawLogVO>> {
    return this.http.get<unknown>('/api/player/gacha/logs', { pageNo, pageSize, poolCode }).then(expectRecord<PageResult<GachaDrawLogVO>>('抽卡记录'));
  }
}
