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
    // 开发登录(预览/联调保留);token 保存由 LoginFlow 在竞态校验后执行。
    return await this.http.post<unknown>('/api/player/auth/dev-login', { userId }).then(expectRecord<PlayerTokenVO>('登录令牌'));
  }

  /** 自建账号注册(2026-09-04 账号体系):成功即登录,返回带 userId 的令牌。 */
  async register(username: string, password: string, nickname?: string): Promise<PlayerTokenVO> {
    return await this.http
      .post<unknown>('/api/player/auth/register', { username, password, nickname: nickname ?? null })
      .then(expectRecord<PlayerTokenVO>('注册令牌'));
  }

  /** 自建账号密码登录。 */
  async login(username: string, password: string): Promise<PlayerTokenVO> {
    return await this.http
      .post<unknown>('/api/player/auth/login', { username, password })
      .then(expectRecord<PlayerTokenVO>('登录令牌'));
  }

  saveToken(token: PlayerTokenVO): void {
    // 只保存已确认属于当前登录请求的 token，避免旧响应覆盖新用户状态。
    this.tokenStore.save(token);
  }

  /** 会话恢复(7 天免重登):记录 token 归属玩家,启动时自动登录用。 */
  saveUserId(userId: number): void {
    this.tokenStore.saveUserId(userId);
  }

  logout(): void {
    this.tokenStore.clear();
  }
}
