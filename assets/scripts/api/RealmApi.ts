import { HttpClient } from '../net/HttpClient';
import { isRecord, readArray, readText } from './ApiValueGuards';

export interface RealmCondition {
  key: string;
  label: string;
  current: string;
  done: boolean;
}

export interface RealmState {
  /** AWAKEN 觉醒 / LIANHUN 炼魂 …;'' = 读取失败。 */
  realmCode: string;
  realmName: string;
  /** 小阶:初期 / 中期 / 后期 / 圆满。 */
  stage: string;
  /** 称号,例「炼魂 · 初期」。 */
  title: string;
  /** 下一境界('' = 已到开放的最高境界)。 */
  nextRealmCode: string;
  nextRealmName: string;
  conditions: RealmCondition[];
  /** 突破条件全部满足,可以开始试炼。 */
  canBreak: boolean;
  /** 当前 / 下一境界的主角攻击 / 生命加成(0.15 = 15%)。 */
  bonus: number;
  nextBonus: number;
  legendOpen: boolean;
  /** TRIAL 打试炼突破 / LEGACY 老号直接补发 / '' 觉醒。 */
  source: string;
  /** 境界光环 %(主角带队:守卫战上阵英雄攻击 / 生命加成;旧服务端 0)。 */
  teamAuraPct: number;
}

/** 主角境界突破(docs/60 §12):状态与突破条件由服务端给出;试炼打赢后上报用时,服务端校验后升境。 */
export class RealmApi {
  constructor(private readonly http: HttpClient) {}

  state(): Promise<RealmState> {
    return this.http.get<unknown>('/api/player/realm').then(validateState);
  }

  winTrial(durationMs: number): Promise<RealmState> {
    return this.http.post<unknown>('/api/player/realm/trial', { durationMs: Math.round(durationMs) }).then(validateState);
  }
}

function num(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function validateState(data: unknown): RealmState {
  if (!isRecord(data)) {
    throw new Error('境界状态响应格式错误');
  }
  return {
    realmCode: readText(data, 'realmCode', 16, ''),
    realmName: readText(data, 'realmName', 16, ''),
    stage: readText(data, 'stage', 8, ''),
    title: readText(data, 'title', 32, ''),
    nextRealmCode: readText(data, 'nextRealmCode', 16, ''),
    nextRealmName: readText(data, 'nextRealmName', 16, ''),
    conditions: readArray(data, 'conditions', 6).map((entry) => {
      const item = isRecord(entry) ? entry : {};
      return {
        key: readText(item, 'key', 16, ''),
        label: readText(item, 'label', 48, ''),
        current: readText(item, 'current', 32, ''),
        done: item.done === true,
      };
    }),
    canBreak: data.canBreak === true,
    bonus: num(data, 'bonus'),
    nextBonus: num(data, 'nextBonus'),
    legendOpen: data.legendOpen === true,
    source: readText(data, 'source', 16, ''),
    teamAuraPct: Math.max(0, Math.min(50, Math.round(num(data, 'teamAuraPct')))),
  };
}
