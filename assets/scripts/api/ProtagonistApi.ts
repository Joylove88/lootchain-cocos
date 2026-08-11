import { HttpClient } from '../net/HttpClient';
import type {
  ProtagonistForm,
  ProtagonistGender,
  ProtagonistServerProfile,
  ProtagonistServerState,
} from '../types/ProtagonistTypes';
import { isRecord, readInteger, readText } from './ApiValueGuards';

export interface ProtagonistCreateRequest {
  gender: ProtagonistGender;
  protagonistName: string;
}

/** 主角色 API：只开放账号初始化创建，不承载抽卡、奖励或经济写入。 */
export class ProtagonistApi {
  constructor(private readonly http: HttpClient) {}

  state(): Promise<ProtagonistServerState> {
    return this.http.get<unknown>('/api/player/protagonist/state').then(validateProtagonistState);
  }

  create(request: ProtagonistCreateRequest): Promise<ProtagonistServerProfile> {
    // 客户端只提交性别和名字；SSR 模板、属性、战力和 user_hero 实例都由后端生成。
    return this.http.post<unknown>('/api/player/protagonist', request).then(validateProtagonistProfile);
  }
}

function validateProtagonistState(data: unknown): ProtagonistServerState {
  if (!isRecord(data)) {
    throw new Error('主角色状态响应格式错误：data 不是对象');
  }
  const created = data.created === true;
  const profile = data.profile === null || data.profile === undefined ? null : validateProtagonistProfile(data.profile);
  if (created && !profile) {
    throw new Error('主角色状态响应格式错误：created=true 但 profile 缺失');
  }
  return { created, profile };
}

function validateProtagonistProfile(data: unknown): ProtagonistServerProfile {
  if (!isRecord(data)) {
    throw new Error('主角色响应格式错误：profile 不是对象');
  }
  const gender = readGender(data.gender);
  const rarity = readText(data, 'rarity', 16, '');
  const currentForm = readForm(data.currentForm);
  const heroCode = readText(data, 'heroCode', 96, '');
  if (rarity !== 'SSR') {
    throw new Error('主角色响应格式错误：主角色必须是 SSR');
  }
  if (heroCode.toUpperCase().startsWith('EX_')) {
    throw new Error('主角色响应格式错误：当前阶段不允许 EX 主角色');
  }
  return {
    userId: readInteger(data.userId, 1, Number.MAX_SAFE_INTEGER),
    protagonistNo: readText(data, 'protagonistNo', 96, ''),
    gender,
    protagonistName: readText(data, 'protagonistName', 12, '圣契主角'),
    rarity: 'SSR',
    currentForm,
    attackUnlocked: data.attackUnlocked === true,
    defenseUnlocked: data.defenseUnlocked === true,
    supportUnlocked: data.supportUnlocked === true,
    userHeroId: readInteger(data.userHeroId, 1, Number.MAX_SAFE_INTEGER),
    heroCode,
    power: readInteger(data.power, 0, Number.MAX_SAFE_INTEGER),
  };
}

function readGender(value: unknown): ProtagonistGender {
  return value === 'female' ? 'female' : 'male';
}

function readForm(value: unknown): ProtagonistForm {
  return value === 'defense' || value === 'support' ? value : 'attack';
}

