import type { EditBox } from 'cc';
import type { ProtagonistApi } from '../../api/ProtagonistApi';
import { ApiError } from '../../net/HttpClient';
import type { ProtagonistCreateFormState, ProtagonistForm, ProtagonistGender } from '../../types/ProtagonistTypes';
import { ProtagonistCreateState } from './ProtagonistCreateState';

const HIDDEN_PROTAGONIST_CREATE_REQUEST = {
  gender: 'male' as ProtagonistGender,
  protagonistName: '圣契档案',
};

export interface ProtagonistCreateFlowHost {
  showProtagonistCreateView(): void;
  startLobbyLoading(tokenName: string): void;
  loadLobbyProfileAfterLogin(userId: number): void;
  setStatus(text: string): void;
}

/** 主角色创建流程控制器。正式创建必须走后端，不能只写本地预览状态。 */
export class ProtagonistCreateFlow {
  private readonly state = new ProtagonistCreateState();
  private nameInput: EditBox | null = null;
  private currentUserId = 0;
  private currentTokenName = '';
  private flowTicket = 0;

  constructor(
    private readonly protagonistApi: ProtagonistApi,
    private readonly host: ProtagonistCreateFlowHost,
  ) {}

  get version(): number {
    return this.state.version;
  }

  setNameInput(input: EditBox | null): void {
    this.nameInput = input;
  }

  currentState(): ProtagonistCreateFormState {
    return this.state.snapshot();
  }

  async handleLoginSuccess(userId: number, tokenName: string): Promise<void> {
    this.currentUserId = userId;
    this.currentTokenName = tokenName;
    this.nameInput = null;
    const ticket = this.nextTicket();
    this.state.beginCreate(userId);
    this.host.setStatus('正在检查主角色状态...');
    try {
      const serverState = await this.protagonistApi.state();
      if (!this.isCurrent(ticket)) {
        return;
      }
      if (serverState.created && serverState.profile) {
        this.state.rememberServerProfile(serverState.profile);
        this.enterLobbyAfterProtagonistReady();
        return;
      }
      await this.ensureHiddenProtagonistReady(ticket);
    } catch (error) {
      if (!this.isCurrent(ticket)) {
        return;
      }
      const message = this.formatApiError(error, '玩家档案初始化失败');
      this.state.setError(message);
      this.host.setStatus(message);
    }
  }

  selectGender(gender: ProtagonistGender): void {
    this.state.setGender(gender);
  }

  previewForm(form: ProtagonistForm): void {
    if (form === 'attack') {
      this.host.setStatus('攻击形态已默认解锁。');
      return;
    }
    this.host.setStatus('该形态需要通过主线剧情道具解锁。');
  }

  async submitCreate(): Promise<void> {
    const current = this.currentState();
    if (current.creating) {
      // 防止玩家快速连点“进入游戏”时重复提交主角色创建请求；后端也会幂等，但前端先挡住多余 POST。
      this.host.setStatus('主角色创建中，请勿重复提交。');
      return;
    }
    const nextName = this.nameInput?.string ?? current.protagonistName;
    this.state.setName(nextName);
    const error = this.state.validateName(nextName);
    if (error) {
      this.state.setError(error);
      this.host.setStatus(error);
      return;
    }

    this.state.startCreating();
    const ticket = this.nextTicket();
    try {
      const profile = await this.protagonistApi.create({
        gender: this.currentState().selectedGender,
        protagonistName: nextName.trim(),
      });
      if (!this.isCurrent(ticket)) {
        return;
      }
      this.state.rememberServerProfile(profile);
      this.host.setStatus(`${profile.protagonistName} 已完成圣契。`);
      this.enterLobbyAfterProtagonistReady();
    } catch (error) {
      if (!this.isCurrent(ticket)) {
        return;
      }
      const message = this.formatApiError(error, '主角色创建失败');
      this.state.setError(message);
      this.host.setStatus(message);
    }
  }

  cancel(): void {
    // 切换场景或销毁时断开输入引用，避免旧 EditBox 回调保留在流程对象里。
    this.flowTicket += 1;
    this.nameInput = null;
  }

  private enterLobbyAfterProtagonistReady(): void {
    this.host.startLobbyLoading(this.currentTokenName);
    this.host.loadLobbyProfileAfterLogin(this.currentUserId);
  }

  private async ensureHiddenProtagonistReady(ticket: number): Promise<void> {
    this.host.setStatus('正在初始化玩家档案...');
    const profile = await this.protagonistApi.create({
      ...HIDDEN_PROTAGONIST_CREATE_REQUEST,
      protagonistName: this.resolveHiddenProtagonistName(this.currentUserId),
    });
    if (!this.isCurrent(ticket)) {
      return;
    }
    this.state.rememberServerProfile(profile);
    this.host.setStatus('玩家档案初始化完成。');
    this.enterLobbyAfterProtagonistReady();
  }

  private resolveHiddenProtagonistName(userId: number): string {
    const suffix = Math.max(1, Math.trunc(userId || 1)).toString();
    return `圣契${suffix}`.slice(0, 12);
  }

  private nextTicket(): number {
    this.flowTicket += 1;
    return this.flowTicket;
  }

  private isCurrent(ticket: number): boolean {
    return ticket === this.flowTicket;
  }

  private formatApiError(error: unknown, prefix: string): string {
    if (error instanceof ApiError) {
      return `${prefix}：${error.message}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `${prefix}：${message}`;
  }
}
