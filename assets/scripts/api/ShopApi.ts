import { HttpClient } from '../net/HttpClient';
import type { ShopCatalogVO, ShopPurchaseResultVO, ShopRechargeResultVO } from '../types/ShopTypes';
import { expectRecord } from './ApiValueGuards';

/** 货币商店(docs/33):目录 / 钻石买金币 / 钻石买体力 / 钻石充值下单。 */
export class ShopApi {
  constructor(private readonly http: HttpClient) {}

  catalog(): Promise<ShopCatalogVO> {
    return this.http.get<unknown>('/api/player/shop/catalog').then(expectRecord<ShopCatalogVO>('商店目录'));
  }

  buyGold(tierCode: string): Promise<ShopPurchaseResultVO> {
    return this.http.post<unknown>('/api/player/shop/gold/buy', { tierCode }).then(expectRecord<ShopPurchaseResultVO>('购买金币'));
  }

  buyStamina(count: number): Promise<ShopPurchaseResultVO> {
    return this.http.post<unknown>('/api/player/shop/stamina/buy', { count }).then(expectRecord<ShopPurchaseResultVO>('购买体力'));
  }

  recharge(tierCode: string): Promise<ShopRechargeResultVO> {
    return this.http.post<unknown>('/api/player/shop/recharge', { tierCode }).then(expectRecord<ShopRechargeResultVO>('钻石充值'));
  }
}
