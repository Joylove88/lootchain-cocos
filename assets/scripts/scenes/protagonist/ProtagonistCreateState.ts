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

/**
 * docs/60 选择主角:随机起名池(骰子 / 默认名);只是建议,重名时后端会拦。
 * 11-23 策划通玩:默认名「玄策」撞名(原来每个性别只有 16 个,老号一多默认名基本都被占了)→ 精选池扩到 40 个,
 * 精选名都试过了再用首字 × 次字拼;自动起的名字撞名时创建流程会自动换一个重试(ProtagonistCreateFlow)。
 */
const RANDOM_NAMES: Record<ProtagonistGender, readonly string[]> = {
  male: ['凌夜', '苍澜', '墨尘', '寒川', '烬羽', '云逸', '北辰', '玄策', '朔风', '青锋', '沧溟', '暮川', '长歌', '承影', '少游', '临渊',
    '夜阑', '星河', '逐风', '听雪', '惊鸿', '慕白', '照野', '怀瑾', '昭明', '归尘', '破晓', '孤城', '霁川', '远山', '青崖', '墨渊',
    '清晏', '景行', '怀远', '拾舟', '江寒', '秋白', '临川', '望岳'],
  female: ['霜月', '晚晴', '星落', '若雪', '清歌', '绯烟', '洛璃', '云裳', '月汐', '紫苑', '初晴', '疏影', '琉音', '夜岚', '昭华', '听澜',
    '凝霜', '念雪', '青黛', '落樱', '绮罗', '素心', '微澜', '萤火', '晚照', '星遥', '云岫', '雪鸢', '映月', '书瑶', '清欢', '南絮',
    '月笙', '烟萝', '霁月', '沐晴', '知微', '初雪', '扶摇', '语汐'],
};
const NAME_HEADS: Record<ProtagonistGender, readonly string[]> = {
  male: ['凌', '苍', '墨', '寒', '云', '北', '玄', '朔', '青', '沧', '暮', '长', '临', '夜', '星', '霁', '远', '清', '孤', '归', '照', '惊', '逐', '听'],
  female: ['霜', '晚', '星', '若', '清', '绯', '洛', '云', '月', '紫', '初', '疏', '琉', '夜', '昭', '听', '凝', '念', '雪', '青', '落', '绮', '素', '微'],
};
const NAME_TAILS: Record<ProtagonistGender, readonly string[]> = {
  male: ['澜', '尘', '川', '羽', '逸', '辰', '策', '风', '锋', '溟', '歌', '影', '渊', '河', '雪', '鸿', '白', '野', '明', '晓', '城', '舟', '山', '崖', '行', '衡', '岳'],
  female: ['月', '晴', '落', '雪', '歌', '烟', '璃', '裳', '汐', '苑', '影', '音', '岚', '华', '澜', '霜', '语', '溪', '黛', '萝', '瑶', '笙', '宁', '鸢'],
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

  /** 骰子:换一个该性别的随机名(不与当前名相同;avoid = 本次已撞名的,自动重试时传)。 */
  rollName(avoid?: ReadonlySet<string>): void {
    this.formState = {
      ...this.formState,
      protagonistName: this.randomName(this.formState.selectedGender, this.formState.protagonistName, avoid),
      nameAuto: true,
      error: '',
    };
    this.bump();
  }

  /** 当前名字是骰子 / 默认起的(玩家没手动改过)。 */
  isNameAuto(): boolean {
    return this.formState.nameAuto;
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

  private randomName(gender: ProtagonistGender, avoid: string, tried?: ReadonlySet<string>): string {
    const pool = RANDOM_NAMES[gender].filter((name) => name !== avoid && !tried?.has(name));
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    // 精选名都撞过了:首字 × 次字拼一个(两字不同、没试过)
    const heads = NAME_HEADS[gender];
    const tails = NAME_TAILS[gender];
    for (let i = 0; i < 40; i += 1) {
      const name = heads[Math.floor(Math.random() * heads.length)] + tails[Math.floor(Math.random() * tails.length)];
      if (name[0] !== name[1] && name !== avoid && !tried?.has(name)) {
        return name;
      }
    }
    return RANDOM_NAMES[gender][0];
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
