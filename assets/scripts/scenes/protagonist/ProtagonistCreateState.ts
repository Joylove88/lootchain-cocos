import type { ProtagonistCreateFormState, ProtagonistGender, ProtagonistLocalProfile, ProtagonistServerProfile } from '../../types/ProtagonistTypes';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const STORAGE_PREFIX = 'lootchain.protagonist.preview.v1.';
const DEFAULT_ATTACK_FORM = 'attack';
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 12;

const RESERVED_NAME_WORDS = ['官方', '客服', '管理员', '系统', '运营', 'gm', 'admin', 'lootchain'];

/** docs/60 选择主角:随机起名池(骰子 / 默认名);只是建议,重名时后端会拦,玩家再摇或自己改。 */
const RANDOM_NAMES: Record<ProtagonistGender, readonly string[]> = {
  male: ['凌夜', '苍澜', '墨尘', '寒川', '烬羽', '云逸', '北辰', '玄策', '朔风', '青锋', '沧溟', '暮川', '长歌', '承影', '少游', '临渊'],
  female: ['霜月', '晚晴', '星落', '若雪', '清歌', '绯烟', '洛璃', '云裳', '月汐', '紫苑', '初晴', '疏影', '琉音', '夜岚', '昭华', '听澜'],
};

/** 主角色创建页状态。当前以服务端创建为准，本地存储只保留预览镜像，不能当成正式数据。 */
export class ProtagonistCreateState {
  private readonly memoryProfiles = new Map<number, ProtagonistLocalProfile>();
  private formState: ProtagonistCreateFormState = this.createInitialState(0);
  private revision = 0;

  get version(): number {
    return this.revision;
  }

  beginCreate(userId: number): void {
    // 每次进入创建页都重置表单，避免上一账号的性别/名字残留到新账号。
    this.formState = this.createInitialState(userId);
    this.bump();
  }

  snapshot(): ProtagonistCreateFormState {
    return {
      ...this.formState,
      version: this.revision,
    };
  }

  setGender(gender: ProtagonistGender): void {
    const name = this.formState.nameAuto ? this.randomName(gender, this.formState.protagonistName) : this.formState.protagonistName;
    this.formState = {
      ...this.formState,
      selectedGender: gender,
      protagonistName: name,
      error: '',
    };
    this.bump();
  }

  setName(name: string): void {
    this.formState = {
      ...this.formState,
      protagonistName: name.trim(),
      error: '',
    };
    this.bump();
  }

  /** 输入中:只记草稿(整页重绘后输入框按它回填),不触发重绘,避免打字时重建 EditBox。 */
  setNameDraft(name: string): void {
    this.formState = {
      ...this.formState,
      protagonistName: name,
      nameAuto: false,
    };
  }

  /** 骰子:换一个该性别的随机名(不与当前名相同)。 */
  rollName(): void {
    this.formState = {
      ...this.formState,
      protagonistName: this.randomName(this.formState.selectedGender, this.formState.protagonistName),
      nameAuto: true,
      error: '',
    };
    this.bump();
  }

  setError(error: string): void {
    this.formState = {
      ...this.formState,
      error,
      creating: false,
    };
    this.bump();
  }

  startCreating(): void {
    this.formState = {
      ...this.formState,
      creating: true,
      error: '',
    };
    this.bump();
  }

  hasProfile(userId: number): boolean {
    return !!this.loadProfile(userId);
  }

  rememberServerProfile(profile: ProtagonistServerProfile): void {
    const localProfile: ProtagonistLocalProfile = {
      userId: profile.userId,
      gender: profile.gender,
      protagonistName: profile.protagonistName,
      rarity: 'SSR',
      selectedForm: profile.currentForm,
      createdAt: new Date().toISOString(),
    };
    // 服务端创建成功后仅保存一个本地镜像，方便预览排查；是否已创建仍以后端 state 接口为准。
    this.memoryProfiles.set(profile.userId, localProfile);
    this.storage()?.setItem(this.storageKey(profile.userId), JSON.stringify(localProfile));
    this.formState = {
      ...this.formState,
      protagonistName: profile.protagonistName,
      selectedGender: profile.gender,
      selectedForm: profile.currentForm,
      creating: false,
      error: '',
    };
    this.bump();
  }

  loadProfile(userId: number): ProtagonistLocalProfile | null {
    const memory = this.memoryProfiles.get(userId);
    if (memory) {
      return memory;
    }
    const storage = this.storage();
    const raw = storage?.getItem(this.storageKey(userId));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ProtagonistLocalProfile>;
      if (this.isValidProfile(userId, parsed)) {
        this.memoryProfiles.set(userId, parsed);
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  createLocalProfile(userId: number, rawName: string): ProtagonistLocalProfile | null {
    const name = rawName.trim();
    const error = this.validateName(name);
    if (error) {
      this.setError(error);
      return null;
    }
    const profile: ProtagonistLocalProfile = {
      userId,
      gender: this.formState.selectedGender,
      protagonistName: name,
      rarity: 'SSR',
      selectedForm: DEFAULT_ATTACK_FORM,
      createdAt: new Date().toISOString(),
    };
    // 仅作为离线预览兜底；正式流程不得依赖此方法判断是否已创建。
    this.memoryProfiles.set(userId, profile);
    this.storage()?.setItem(this.storageKey(userId), JSON.stringify(profile));
    this.formState = {
      ...this.formState,
      protagonistName: name,
      creating: false,
      error: '',
    };
    this.bump();
    return profile;
  }

  validateName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN_LENGTH) {
      return '角色名至少需要 2 个字符。';
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      return '角色名最多 12 个字符。';
    }
    if (!/^[\u4e00-\u9fa5A-Za-z0-9_]+$/.test(trimmed)) {
      return '角色名仅支持中文、英文、数字和下划线。';
    }
    // 与后端 PlayerRenameService.normalize 同口径:不能纯数字、不能含官方保留字
    if (/^[0-9]+$/.test(trimmed)) {
      return '角色名不能是纯数字。';
    }
    const lower = trimmed.toLowerCase();
    const reserved = RESERVED_NAME_WORDS.find((word) => lower.indexOf(word) >= 0);
    if (reserved) {
      return `角色名不能包含「${reserved}」。`;
    }
    return '';
  }

  private createInitialState(userId: number): ProtagonistCreateFormState {
    return {
      userId,
      selectedGender: 'male',
      protagonistName: this.randomName('male', ''),
      nameAuto: true,
      selectedForm: DEFAULT_ATTACK_FORM,
      error: '',
      creating: false,
      version: this.revision,
    };
  }

  private randomName(gender: ProtagonistGender, avoid: string): string {
    const pool = RANDOM_NAMES[gender].filter((name) => name !== avoid);
    return pool[Math.floor(Math.random() * pool.length)] ?? RANDOM_NAMES[gender][0];
  }

  private bump(): void {
    this.revision += 1;
  }

  private storageKey(userId: number): string {
    return `${STORAGE_PREFIX}${userId}`;
  }

  private storage(): StorageLike | null {
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') {
      return null;
    }
    return candidate;
  }

  private isValidProfile(userId: number, value: Partial<ProtagonistLocalProfile>): value is ProtagonistLocalProfile {
    return (
      value.userId === userId &&
      (value.gender === 'male' || value.gender === 'female') &&
      typeof value.protagonistName === 'string' &&
      value.protagonistName.length >= NAME_MIN_LENGTH &&
      value.rarity === 'SSR' &&
      value.selectedForm === DEFAULT_ATTACK_FORM &&
      typeof value.createdAt === 'string'
    );
  }
}
