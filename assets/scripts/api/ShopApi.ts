import { HttpClient } from '../net/HttpClient';
import type { ShopCatalogVO, ShopPurchaseResultVO, ShopRechargeOrderVO, ShopRechargePendingVO, ShopRechargeResultVO } from '../types/ShopTypes';
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

  /** 充值下单;channelCode 为空时服务端取默认通道(docs/34)。 */
  recharge(tierCode: string, channelCode?: string | null): Promise<ShopRechargeResultVO> {
    return this.http.post<unknown>('/api/player/shop/recharge', channelCode ? { tierCode, channelCode } : { tierCode }).then(expectRecord<ShopRechargeResultVO>('钻石充值'));
  }

  /** 查自己的充值订单(支付窗口打开后轮询到账)。 */
  rechargeOrder(orderNo: string): Promise<ShopRechargeOrderVO> {
    return this.http.get<unknown>('/api/player/shop/recharge/order', { orderNo }).then(expectRecord<ShopRechargeOrderVO>('充值订单'));
  }

  /** 未完成的真实充值订单(最新在前)。 */
  rechargePending(): Promise<ShopRechargePendingVO[]> {
    return this.http.get<unknown>('/api/player/shop/recharge/pending').then((value) => (Array.isArray(value) ? (value as ShopRechargePendingVO[]) : []));
  }

  /** 收银台中转地址转绝对地址(预先打开的支付窗口要导航过去)。 */
  absoluteUrl(path: string): string {
    return this.http.absoluteUrl(path);
  }
}
