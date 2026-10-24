/** 主角色性别只影响外观、称呼和演出，不参与强度差异。 */
export type ProtagonistGender = 'male' | 'female';

/** 主角色三形态；当前阶段只有攻击形态默认开放。 */
export type ProtagonistForm = 'attack' | 'defense' | 'support';

export interface ProtagonistFormOption {
  code: ProtagonistForm;
  label: string;
  detail: string;
  unlocked: boolean;
}

export interface ProtagonistLocalProfile {
  userId: number;
  gender: ProtagonistGender;
  protagonistName: string;
  rarity: 'SSR';
  selectedForm: ProtagonistForm;
  createdAt: string;
}

export interface ProtagonistServerProfile {
  userId: number;
  protagonistNo: string;
  gender: ProtagonistGender;
  protagonistName: string;
  rarity: 'SSR';
  currentForm: ProtagonistForm;
  attackUnlocked: boolean;
  defenseUnlocked: boolean;
  supportUnlocked: boolean;
  userHeroId: number;
  heroCode: string;
  power: number;
}

export interface ProtagonistServerState {
  created: boolean;
  profile: ProtagonistServerProfile | null;
}

export interface ProtagonistCreateFormState {
  userId: number;
  selectedGender: ProtagonistGender;
  protagonistName: string;
  selectedForm: ProtagonistForm;
  error: string;
  creating: boolean;
  version: number;
}

export const PROTAGONIST_FORM_OPTIONS: ProtagonistFormOption[] = [
  {
    code: 'attack',
    label: '攻击形态',
    detail: '默认开放，近战爆发。',
    unlocked: true,
  },
  {
    code: 'defense',
    label: '防御形态',
    detail: '完成冒险剧情后解锁。',
    unlocked: false,
  },
  {
    code: 'support',
    label: '辅助形态',
    detail: '获得冒险圣契道具后解锁。',
    unlocked: false,
  },
];
