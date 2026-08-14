import type { EditBox } from 'cc';
import type { PlayerAuthApi } from '../../api/PlayerAuthApi';
import { ApiError } from '../../net/HttpClient';

export interface LoginFlowConfig {
  apiBaseUrl: string;
  defaultDevUserId: number;
}

export interface LoginFlowHost {
  setApiBaseUrl(baseUrl: string): void;
  setStatus(text: string): void;
  startLobbyLoading(tokenName: string): void;
  resetLobbyProfileForLogin(userId: number): void;
  loadLobbyProfileAfterLogin(userId: number): void;
  handleLoginSuccess(userId: number, tokenName: string): void;
}

/**
 * 登录流程控制器。
 *
 * 当前阶段只允许 dev-login：负责读输入、解析用户 id、调用认证 API，
 * 成功后通知 root 进入资源加载和只读资料加载。这里不持有完整聚合 API，避免误碰玩法/经济模块。
 */
export class LoginFlow {
  private accountInput: EditBox | null = null;
  private passwordInput: EditBox | null = null;
  private acceptedAgreement = true;
  private tokenName = '';
  private loginTicket = 0;

  constructor(
    private readonly authApi: PlayerAuthApi,
    private readonly config: LoginFlowConfig,
    private readonly host: LoginFlowHost,
  ) {}

  get agreementAccepted(): boolean {
    return this.acceptedAgreement;
  }

  get defaultDevUserId(): number {
    return this.config.defaultDevUserId;
  }

  get lastTokenName(): string {
    return this.tokenName;
  }

  setInputs(accountInput: EditBox | null, passwordInput: EditBox | null): void {
    this.accountInput = accountInput;
    this.passwordInput = passwordInput;
  }

  toggleAgreement(): void {
    this.acceptedAgreement = !this.acceptedAgreement;
  }

  async login(): Promise<void> {
    if (!this.acceptedAgreement) {
      this.host.setStatus('Please accept the user agreement and privacy policy first.');
      return;
    }

    const account = this.accountInput?.string.trim() || String(this.config.defaultDevUserId);
    const userId = this.resolveDevUserId(account);
    const ticket = this.nextLoginTicket();
    this.host.setApiBaseUrl(this.config.apiBaseUrl);
    this.host.setStatus('Login request: ' + this.config.apiBaseUrl);
    try {
      const token = await this.authApi.devLogin(userId);
      if (!this.isCurrentLogin(ticket)) {
        return;
      }
      this.authApi.saveToken(token);
      // 会话恢复(7 天免重登):记录 userId,下次启动用 token+userId 自动进大厅。
      this.authApi.saveUserId?.(userId);
      this.tokenName = token.tokenName;
      // 登录成功后先重置本地资料态，再交给主角创建/大厅入口流程，避免大厅短暂显示上一个用户。
      this.host.resetLobbyProfileForLogin(userId);
      this.host.handleLoginSuccess(userId, this.tokenName);
    } catch (error) {
      if (!this.isCurrentLogin(ticket)) {
        return;
      }
      this.host.setStatus(this.formatApiError(error, this.config.apiBaseUrl));
    }
  }

  cancel(): void {
    // 销毁或切换上下文时让未完成的登录响应失效，避免回调继续驱动大厅。
    this.loginTicket += 1;
    this.accountInput = null;
    this.passwordInput = null;
  }

  private nextLoginTicket(): number {
    this.loginTicket += 1;
    return this.loginTicket;
  }

  private isCurrentLogin(ticket: number): boolean {
    return ticket === this.loginTicket;
  }

  private resolveDevUserId(account: string): number {
    // 预览阶段账号输入框直接支持数字 userId，非数字则回退到默认开发用户。
    const parsed = Number(account);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return this.config.defaultDevUserId;
  }

  private formatApiError(error: unknown, fallbackBaseUrl: string): string {
    // 保留请求地址和错误码，方便在 Cocos 预览里直接定位服务是否启动。
    if (error instanceof ApiError) {
      const requestUrl = error.requestUrl || fallbackBaseUrl + '/api/player/auth/dev-login';
      return 'Login failed: ' + error.message + '\ncode=' + error.code + '\nurl=' + requestUrl + '\nCheck whether lootchain-game is running at http://localhost:8081.';
    }
    const message = error instanceof Error ? error.message : String(error);
    return 'Login failed: ' + message + '\nurl=' + fallbackBaseUrl + '/api/player/auth/dev-login';
  }
}
