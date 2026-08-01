import { HttpClient } from '../net/HttpClient';
import type { ItemSourceVO, PlayerBagGroupedVO } from '../types/BagTypes';

/** 使用道具结果(与后端 ItemUseResultVO 对齐)。 */
export interface ItemUseResultVO {
  itemCode: string;
  usedCount: number;
  effectMessages: string[];
}

/** 背包材料合成结果。 */
export interface BagComposeResultVO {
  sourceCode: string;
  usedCount: number;
  targetCode: string;
  gainedCount: number;
}

/** 背包只读接口封装；当前只允许读取列表和来源，不接入 use/sell。 */
export class BagApi {
  constructor(private readonly http: HttpClient) {}

  myBag(): Promise<PlayerBagGroupedVO> {
    return this.http.get<PlayerBagGroupedVO>('/api/player/bag');
  }

  source(itemCode: string): Promise<ItemSourceVO> {
    return this.http.get<ItemSourceVO>(`/api/player/bag/items/${encodeURIComponent(itemCode)}/source`);
  }

  // 使用道具(2026-07-24 开放):服务器按 use_effect_type/json 结算效果。
  use(itemCode: string, count = 1): Promise<ItemUseResultVO> {
    return this.http.post<ItemUseResultVO>('/api/player/bag/use', { itemCode, count });
  }

  // 背包材料合成:强化石x10→高阶x1 / 旧低阶石1:1并入强化石;times=合成组数(空=全量,服务器上限500)。
  compose(itemCode: string, times?: number): Promise<BagComposeResultVO> {
    return this.http.post<BagComposeResultVO>('/api/player/bag/compose', { itemCode, times: times ?? null });
  }
}
