/** 服务端 BigDecimal 序列化为数字或字符串。 */
export type ShopDecimal = number | string;

// 货币商店(docs/33,2026-09-22):钻石买金币 / 钻石买体力 / 钻石充值。与后端 ShopCatalogVO / ShopPurchaseResultVO / ShopRechargeResultVO 对应。

export interface ShopGoldTierVO {
  code: string;
  name: string;
  diamondCost: number;
  goldAmount: number;
  bonusPct: number;
  /** gold_small / gold_medium / gold_large / gold_chest。 */
  iconKey: string;
}

export interface ShopStaminaOfferVO {
  diamondCost: number;
  staminaGain: number;
  /** 每日上限次数(0=未开放)。 */
  dailyLimit: number;
  usedToday: number;
  maxCountPerBuy: number;
}

export interface ShopRechargeTierVO {
  code: string;
  name: string;
  priceCny: ShopDecimal;
  diamondBase: number;
  diamondBonus: number;
  diamondTotal: number;
  /** diamond_few / diamond_some / diamond_many / diamond_chest。 */
  iconKey: string;
}

export interface ShopCatalogVO {
  gold: ShopDecimal;
  diamond: ShopDecimal;
  stamina: number;
  maxStamina: number;
  goldTiers: ShopGoldTierVO[];
  staminaOffer: ShopStaminaOfferVO;
  rechargeTiers: ShopRechargeTierVO[];
  /** true=联调环境模拟支付(下单即到账);false=支付渠道未接入,充值不可用。 */
  mockPay: boolean;
}

export interface ShopPurchaseResultVO {
  gold: ShopDecimal;
  diamond: ShopDecimal;
  stamina: number;
  maxStamina: number;
  diamondSpent: number;
  message: string;
}

export interface ShopRechargeResultVO {
  orderNo: string;
  status: number;
  mockPaid: boolean;
  diamondTotal: number;
  diamond: ShopDecimal;
  message: string;
}
