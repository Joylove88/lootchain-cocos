import { sys } from 'cc';
import type { PlayerTokenVO } from '../types/AuthTypes';

const TOKEN_NAME_KEY = 'lootchain.player.tokenName';
const TOKEN_VALUE_KEY = 'lootchain.player.tokenValue';
const USER_ID_KEY = 'lootchain.player.userId';

/** 本地 token 存储，供 HttpClient 拼接后端返回的动态 token header。 */
export class TokenStore {
  save(token: PlayerTokenVO): void {
    sys.localStorage.setItem(TOKEN_NAME_KEY, token.tokenName);
    sys.localStorage.setItem(TOKEN_VALUE_KEY, token.tokenValue);
  }

  /** 会话恢复用:记录本 token 归属的玩家(启动自动登录需要 userId 走原登录入口流程)。 */
  saveUserId(userId: number): void {
    sys.localStorage.setItem(USER_ID_KEY, String(userId));
  }

  userId(): number | null {
    const raw = sys.localStorage.getItem(USER_ID_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  clear(): void {
    sys.localStorage.removeItem(TOKEN_NAME_KEY);
    sys.localStorage.removeItem(TOKEN_VALUE_KEY);
    sys.localStorage.removeItem(USER_ID_KEY);
  }

  tokenName(): string | null {
    return sys.localStorage.getItem(TOKEN_NAME_KEY);
  }

  tokenValue(): string | null {
    return sys.localStorage.getItem(TOKEN_VALUE_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.tokenName() && !!this.tokenValue();
  }

  authHeader(): { name: string; value: string } | null {
    // 后端返回 tokenName/tokenValue，所以这里返回动态 header 名和值。
    const name = this.tokenName();
    const value = this.tokenValue();
    if (!name || !value) {
      return null;
    }
    return { name, value };
  }
}
