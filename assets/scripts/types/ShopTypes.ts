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
  /** 充值支付模式(docs/34):MOCK 模拟到账 / ONLINE 支付中心真实支付 / NONE 未接入。旧服务端无此字段时按 mockPay 推断。 */
  payMode?: ShopPayMode;
  /** 可选充值通道(ONLINE 才有,第一个为默认)。 */
  rechargeChannels?: ShopRechargeChannelVO[];
}

export type ShopPayMode = 'MOCK' | 'ONLINE' | 'NONE';

export interface ShopRechargeChannelVO {
  channelCode: string;
  /** 玩家端显示名,如"支付宝"。 */
  channelName: string;
  payTypeCode: string;
  /** 档位价(元)范围,空=不限。 */
  minAmount: ShopDecimal | null;
  maxAmount: ShopDecimal | null;
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
  payMode?: ShopPayMode;
  /** 支付中心 CommonPayRsp.type(仅 ONLINE)。 */
  payContentType?: string | null;
  payContent?: string | null;
  /** 收银台中转地址(相对 API 基址,带签名);预先打开的支付窗口导航过去。 */
  cashierUrl?: string | null;
  /** true=复用了同档位同通道的未付款订单(重新打开原支付页,没有新建订单)。 */
  reused?: boolean;
}

/** 未完成(待支付)的真实充值订单:打开钻石页时拉取,继续轮询到账。 */
export interface ShopRechargePendingVO {
  orderNo: string;
  tierCode: string;
  diamondTotal: number;
  createTime: string;
}

/** 充值订单状态(下单后轮询):0 待支付 1 已到账 2 下单失败/关闭 3 金额异常待人工 4 已过期。 */
export interface ShopRechargeOrderVO {
  orderNo: string;
  status: number;
  statusLabel: string;
  paid: boolean;
  diamondTotal: number;
  diamond: ShopDecimal;
}
