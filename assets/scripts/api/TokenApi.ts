import { HttpClient } from '../net/HttpClient';
import type {
  TokenExchangeSummaryVO,
  TokenWalletVO,
  TokenWithdrawOrderVO,
} from '../types/DailyDungeonTypes';
import {
  isRecord,
  readArray,
  readInteger,
  readNumber,
  readOptionalText,
  readText,
  type UnknownRecord,
} from './ApiValueGuards';

const MAX_TEXT = 128;
const MAX_ORDERS = 10;

/** 圣晶兑代币 API(P金-2 链下):钱包绑定 + 兑换申请 + 摘要。链上发放在 P金-3。 */
export class TokenApi {
  constructor(private readonly http: HttpClient) {}

  /** 我的钱包(未绑定后端返回 null)。 */
  wallet(): Promise<TokenWalletVO | null> {
    return this.http.get<unknown>('/api/player/token/wallet').then(normalizeWalletOrNull);
  }

  /** 绑定/更新提币钱包。 */
  bindWallet(chainType: string, walletAddress: string): Promise<TokenWalletVO> {
    const body = { chainType, walletAddress };
    return this.http.post<unknown>('/api/player/token/wallet/bind', body).then((data) => {
      const wallet = normalizeWalletOrNull(data);
      if (!wallet) {
        throw new Error('钱包绑定响应格式错误');
      }
      return wallet;
    });
  }

  /** 兑换摘要(规则/余额/门槛/日额度/近期单)。 */
  exchangeSummary(): Promise<TokenExchangeSummaryVO> {
    return this.http.get<unknown>('/api/player/token/exchange/summary').then(validateExchangeSummary);
  }

  /** 提交圣晶兑代币申请(crystal 圣晶本金,≥minCrystal 且为 100 的整数倍)。 */
  submitExchange(crystalAmount: number): Promise<TokenWithdrawOrderVO> {
    const body = { crystalAmount: Math.max(0, Math.floor(crystalAmount)) };
    return this.http.post<unknown>('/api/player/token/exchange', body).then(validateOrder);
  }
}

function normalizeWalletOrNull(data: unknown): TokenWalletVO | null {
  if (!isRecord(data)) {
    return null;
  }
  const address = readText(data, 'walletAddress', MAX_TEXT);
  if (!address) {
    return null;
  }
  return {
    id: readNullableId(data.id),
    chainType: readText(data, 'chainType', 32),
    walletAddress: address,
    bindStatus: readInteger(data.bindStatus, 0, 9),
  };
}

function readNullableId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}

function validateOrder(data: unknown): TokenWithdrawOrderVO {
  if (!isRecord(data)) {
    throw new Error('兑换单响应格式错误');
  }
  return normalizeOrder(data);
}

function normalizeOrder(record: UnknownRecord): TokenWithdrawOrderVO {
  return {
    orderNo: readText(record, 'orderNo', MAX_TEXT),
    crystalAmount: readInteger(record.crystalAmount, 0, 1_000_000_000),
    feeAmount: readInteger(record.feeAmount, 0, 1_000_000_000),
    tokenAmount: readNumber(record.tokenAmount, 0, 1_000_000_000),
    chainType: readText(record, 'chainType', 32),
    walletAddress: readText(record, 'walletAddress', MAX_TEXT),
    status: readInteger(record.status, 0, 9),
    statusLabel: readText(record, 'statusLabel', 64),
    chainTxHash: readOptionalText(record, 'chainTxHash', MAX_TEXT),
    createTime: readText(record, 'createTime', 64),
  };
}

function validateExchangeSummary(data: unknown): TokenExchangeSummaryVO {
  if (!isRecord(data)) {
    throw new Error('圣晶兑代币摘要响应格式错误:data 不是对象');
  }
  const orders = readArray(data, 'recentOrders', MAX_ORDERS)
    .filter(isRecord)
    .map((item) => normalizeOrder(item as UnknownRecord));
  return {
    tokenSymbol: readText(data, 'tokenSymbol', 16, 'LOOT'),
    crystalPerToken: readInteger(data.crystalPerToken, 1, 1_000_000),
    feeRate: readNumber(data.feeRate, 0, 1),
    minCrystal: readInteger(data.minCrystal, 0, 1_000_000_000),
    sacredCrystal: readNumber(data.sacredCrystal, 0, 1_000_000_000_000),
    eligible: data.eligible === true,
    ineligibleReason: readOptionalText(data, 'ineligibleReason', 256),
    walletBound: data.walletBound === true,
    todayExchangedToken: readNumber(data.todayExchangedToken, 0, 1_000_000_000),
    dailyTokenCap: readNumber(data.dailyTokenCap, 0, 1_000_000_000),
    autoPassToken: readNumber(data.autoPassToken, 0, 1_000_000_000),
    recentOrders: orders,
  };
}
