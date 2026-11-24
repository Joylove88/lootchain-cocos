import { HttpClient } from '../net/HttpClient';
import { isRecord, readArray } from './ApiValueGuards';

/** 标记码格式(与后端 GuideFlagService 一致):字母数字开头,字母数字 _ : . - 组成,最长 64。 */
export const GUIDE_FLAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$/;
/** 一次最多上报几个(后端 MAX_BATCH)。 */
export const GUIDE_FLAG_BATCH = 50;

/**
 * 新手引导标记(docs/57 §9 / §12,后端 user_guide_flag):功能说明卡看过、强引导跳过、终端「新」角标、追踪条提示,
 * 存服务端,换设备 / 清缓存不重放。记录是只增的标记码集合,上报幂等。
 */
export class GuideApi {
  constructor(private readonly http: HttpClient) {}

  /** 该玩家的全部标记码。 */
  flags(): Promise<string[]> {
    return this.http.get<unknown>('/api/player/guide/flags').then(readFlags);
  }

  /** 记一批标记(已有的服务端忽略);返回记完之后的全部标记码。 */
  mark(flags: string[]): Promise<string[]> {
    return this.http.post<unknown>('/api/player/guide/flag', { flags }).then(readFlags);
  }
}

function readFlags(data: unknown): string[] {
  if (!isRecord(data)) {
    return [];
  }
  return readArray(data, 'flags', 1000).filter((item): item is string => typeof item === 'string' && GUIDE_FLAG_PATTERN.test(item));
}
