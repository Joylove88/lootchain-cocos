import { HttpClient } from '../net/HttpClient';
import { TokenStore } from '../store/TokenStore';
import type { PlayerTokenVO } from '../types/AuthTypes';
import { expectRecord } from './ApiValueGuards';

export class PlayerAuthApi {
  constructor(
    private readonly http: HttpClient,
    private readonly tokenStore: TokenStore,
  ) {}

  async devLogin(userId: number): Promise<PlayerTokenVO> {
    // 当前 Cocos 阶段只开放开发登录；token 保存由 LoginFlow 在竞态校验后执行。
    return await this.http.post<unknown>('/api/player/auth/dev-login', { userId }).then(expectRecord<PlayerTokenVO>('登录令牌'));
  }

  saveToken(token: PlayerTokenVO): void {
    // 只保存已确认属于当前登录请求的 token，避免旧响应覆盖新用户状态。
    this.tokenStore.save(token);
  }

  logout(): void {
    this.tokenStore.clear();
  }
}
