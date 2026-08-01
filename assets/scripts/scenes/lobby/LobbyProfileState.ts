import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { positiveInteger, safeText } from '../UiTextFormatter';

/**
 * 大厅玩家资料本地状态。
 *
 * 只负责只读资料的兜底、归一化和过期 userId 防护；不负责发请求，也不负责渲染 UI。
 */
export class LobbyProfileState {
  private profile: PlayerLobbyProfileVO | null = null;
  private profileLoading = false;
  private profileError = '';
  private currentUserId: number;

  constructor(defaultUserId: number) {
    this.currentUserId = positiveInteger(defaultUserId, 1);
  }

  get userId(): number {
    return this.currentUserId;
  }

  get loading(): boolean {
    return this.profileLoading;
  }

  get error(): string {
    return this.profileError;
  }

  resetForLogin(userId: number): void {
    // 登录用户变化时立即清空旧资料，避免左上角 HUD 混用上一位玩家数据。
    this.currentUserId = positiveInteger(userId, this.currentUserId);
    this.profile = null;
    this.profileLoading = false;
    this.profileError = '';
  }

  startLoading(): void {
    this.profileLoading = true;
    this.profileError = '';
  }

  applyLoadedProfile(userId: number, profile: PlayerLobbyProfileVO): boolean {
    if (!this.isCurrentUser(userId)) {
      // 异步请求返回时用户已经变化，旧数据不能写入当前大厅。
      return false;
    }
    if (positiveInteger(profile.userId, 0) !== this.currentUserId) {
      // 后端返回的资料身份必须和当前登录态一致，否则只展示本地兜底。
      this.profile = null;
      this.profileError = '资料账号不匹配';
      return true;
    }
    this.profile = this.normalize(profile);
    this.profileError = '';
    return true;
  }

  applyLoadError(userId: number, error: unknown): boolean {
    if (!this.isCurrentUser(userId)) {
      return false;
    }
    this.profile = null;
    this.profileError = error instanceof Error ? error.message : String(error);
    return true;
  }

  finishLoading(userId: number): boolean {
    if (!this.isCurrentUser(userId)) {
      return false;
    }
    this.profileLoading = false;
    return true;
  }

  isCurrentUser(userId: number): boolean {
    return userId === this.currentUserId;
  }

  currentProfile(): PlayerLobbyProfileVO {
    return this.profile ?? this.fallback();
  }

  private fallback(): PlayerLobbyProfileVO {
    // 接口未返回或失败时使用本地只读占位，确保大厅 HUD 仍可渲染。
    return {
      userId: this.currentUserId,
      displayName: 'LootChain',
      protagonistName: null,
      username: `player${this.currentUserId}`,
      nickname: null,
      avatar: null,
      playerLevel: 1,
      exp: 0,
      levelProgress: {
        currentLevel: 1,
        currentExp: 0,
        currentLevelNeedExp: 0,
        nextLevel: null,
        nextLevelNeedExp: null,
        expIntoLevel: 0,
        expToNextLevel: 0,
        progressPercent: 0,
        maxHeroLevel: null,
        nextUnlockDesc: null,
      },
      stamina: 0,
      maxStamina: 120,
      gold: 0,
      diamond: 0,
      combatPower: 0,
      status: null,
      accountStatus: this.profileError ? '资料占位' : '读取中',
      walletBound: false,
      walletAddress: null,
      loginMethod: 'dev-login',
    };
  }

  private normalize(profile: PlayerLobbyProfileVO): PlayerLobbyProfileVO {
    // 后端字段进入 UI 前统一做非负整数和文本裁剪，避免异常数据破坏布局。
    const userId = positiveInteger(profile.userId, this.currentUserId);
    const protagonistName = safeText(profile.protagonistName || '');
    const displayName = safeText(profile.displayName || protagonistName || profile.nickname || profile.username || `Player${userId}`);
    const playerLevel = positiveInteger(profile.playerLevel, 1);
    const exp = positiveInteger(profile.exp, 0);
    return {
      userId,
      displayName,
      protagonistName: protagonistName || null,
      username: profile.username ?? null,
      nickname: profile.nickname ?? null,
      avatar: profile.avatar ?? null,
      playerLevel,
      exp,
      levelProgress: normalizeLevelProgress(profile.levelProgress, playerLevel, exp),
      stamina: positiveInteger(profile.stamina, 0),
      maxStamina: positiveInteger(profile.maxStamina, 120),
      gold: normalizeCurrency(profile.gold),
      diamond: normalizeCurrency(profile.diamond),
      combatPower: positiveInteger(profile.combatPower, 0),
      status: profile.status ?? null,
      accountStatus: safeText(profile.accountStatus || '未知'),
      walletBound: Boolean(profile.walletBound),
      walletAddress: profile.walletAddress ?? null,
      loginMethod: safeText(profile.loginMethod || 'dev-login'),
    };
  }

}

function normalizeCurrency(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeLevelProgress(
  progress: PlayerLobbyProfileVO['levelProgress'],
  playerLevel: number,
  exp: number,
): NonNullable<PlayerLobbyProfileVO['levelProgress']> {
  if (!progress) {
    return {
      currentLevel: playerLevel,
      currentExp: exp,
      currentLevelNeedExp: 0,
      nextLevel: null,
      nextLevelNeedExp: null,
      expIntoLevel: exp,
      expToNextLevel: 0,
      progressPercent: 0,
      maxHeroLevel: null,
      nextUnlockDesc: null,
    };
  }
  return {
    currentLevel: positiveInteger(progress.currentLevel, playerLevel),
    currentExp: positiveInteger(progress.currentExp, exp),
    currentLevelNeedExp: positiveInteger(progress.currentLevelNeedExp, 0),
    nextLevel: progress.nextLevel == null ? null : positiveInteger(progress.nextLevel, 1),
    nextLevelNeedExp: progress.nextLevelNeedExp == null ? null : positiveInteger(progress.nextLevelNeedExp, 0),
    expIntoLevel: positiveInteger(progress.expIntoLevel, 0),
    expToNextLevel: positiveInteger(progress.expToNextLevel, 0),
    progressPercent: Math.max(0, Math.min(100, positiveInteger(progress.progressPercent, 0))),
    maxHeroLevel: progress.maxHeroLevel == null ? null : positiveInteger(progress.maxHeroLevel, 1),
    nextUnlockDesc: progress.nextUnlockDesc ?? null,
  };
}
