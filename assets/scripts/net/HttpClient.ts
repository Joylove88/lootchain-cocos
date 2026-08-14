import { AppConfig } from '../app/AppConfig';
import { lootChainI18n } from '../i18n/LootChainI18n';
import type { ApiResult, QueryParams } from '../types/CommonTypes';
import { TokenStore } from '../store/TokenStore';

export class ApiError extends Error {
  readonly code: number;
  readonly requestUrl?: string;

  constructor(code: number, message: string, requestUrl?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestUrl = requestUrl;
  }
}

/**
 * XHR 封装。
 *
 * Cocos Web 预览里保持最小依赖：统一 baseUrl、token header、业务 code 判断和错误包装。
 */
export class HttpClient {
  private baseUrl: string;
  /** 登录态失效(业务 code=401)时的集中回调:宿主(游戏根)清 token 并回登录页。 */
  onAuthExpired: (() => void) | null = null;

  constructor(
    baseUrl: string,
    private readonly tokenStore: TokenStore,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  get<T>(path: string, query?: QueryParams): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  post<T>(path: string, body?: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>('POST', path, body, query);
  }

  put<T>(path: string, body?: unknown, query?: QueryParams): Promise<T> {
    return this.request<T>('PUT', path, body, query);
  }

  request<T>(method: string, path: string, body?: unknown, query?: QueryParams): Promise<T> {
    const url = this.buildUrl(path, query);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = AppConfig.requestTimeoutMs;
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      xhr.setRequestHeader('Accept-Language', lootChainI18n.currentLanguage());

      const auth = this.tokenStore.authHeader();
      if (auth) {
        // token 名称由后端返回，避免客户端硬编码 Authorization 之类字段名。
        xhr.setRequestHeader(auth.name, auth.value);
      }

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) {
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new ApiError(xhr.status || -1, xhr.responseText || '网络请求失败', url));
          return;
        }
        try {
          const result = JSON.parse(xhr.responseText || '{}') as ApiResult<T>;
          if (result.code !== 0) {
            if (result.code === 401) {
              // 登录态失效(token 过期/被踢):集中回调一次,由宿主清 token 回登录页;仍向调用方抛错。
              this.onAuthExpired?.();
            }
            reject(new ApiError(result.code, result.msg || '业务请求失败', url));
            return;
          }
          resolve(result.data);
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => reject(new ApiError(-1, '网络连接失败', url));
      xhr.ontimeout = () => reject(new ApiError(-2, '请求超时', url));
      xhr.send(body === undefined ? null : JSON.stringify(body));
    });
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    if (!query) {
      return url;
    }
    const pairs = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    return pairs.length > 0 ? `${url}?${pairs.join('&')}` : url;
  }
}
