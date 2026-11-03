import { HttpClient } from '../net/HttpClient';
import { isRecord, readArray, readOptionalText, readText } from './ApiValueGuards';

export interface StarterContractCandidate {
  heroCode: string;
  heroName: string;
  rarity: string;
  heroClass: string | null;
  /** 英雄契约里程碑:名下已有(选它照抽卡重复规则转碎片);开局契约之选恒为 false。 */
  owned: boolean;
  fragments: number;
}

export interface StarterContractState {
  /** 已选过(老号 / 已订立契约)= 不再弹。 */
  picked: boolean;
  candidates: StarterContractCandidate[];
}

export interface LevelContractState {
  /** 待订立的里程碑码:V04 / V09 = 剧情任务领奖后 / 30 = Lv.30;'' = 没有待订立。 */
  milestone: string;
  rarity: string;
  /** 来源剧情任务码(按等级解锁时为 '')。 */
  storyQuest: string;
  candidates: StarterContractCandidate[];
}

/** 契约之选(docs/58 §3):新号 3 选 1 R 级初始伙伴;候选由服务端按账号固定给出,发放也在服务端。 */
export class StarterContractApi {
  constructor(private readonly http: HttpClient) {}

  state(): Promise<StarterContractState> {
    return this.http.get<unknown>('/api/player/starter/contract').then(validateState);
  }

  pick(heroCode: string): Promise<StarterContractState> {
    return this.http.post<unknown>('/api/player/starter/contract', { heroCode }).then(validateState);
  }

  /** 英雄契约里程碑(docs/58 §3.1):剧情 V04 / V09 领奖后 R 级、Lv.30 SR 级各 3 选 1 一名英雄。 */
  levelState(): Promise<LevelContractState> {
    return this.http.get<unknown>('/api/player/contract/level').then(validateLevelState);
  }

  levelPick(milestone: string, heroCode: string): Promise<LevelContractState> {
    return this.http.post<unknown>('/api/player/contract/level', { milestone, heroCode }).then(validateLevelState);
  }
}

function readCandidates(data: Record<string, unknown>): StarterContractCandidate[] {
  return readArray(data, 'candidates', 6).map((entry) => {
    const item = isRecord(entry) ? entry : {};
    return {
      heroCode: readText(item, 'heroCode', 64, ''),
      heroName: readText(item, 'heroName', 64, ''),
      rarity: readText(item, 'rarity', 16, 'R'),
      heroClass: readOptionalText(item, 'heroClass', 32),
      owned: item.owned === true,
      fragments: typeof item.fragments === 'number' && Number.isFinite(item.fragments) ? item.fragments : 0,
    };
  }).filter((item) => item.heroCode.length > 0);
}

function validateState(data: unknown): StarterContractState {
  if (!isRecord(data)) {
    throw new Error('契约之选响应格式错误');
  }
  return { picked: data.picked === true, candidates: readCandidates(data) };
}

function validateLevelState(data: unknown): LevelContractState {
  if (!isRecord(data)) {
    throw new Error('英雄契约响应格式错误');
  }
  return {
    milestone: readText(data, 'milestone', 16, ''),
    rarity: readText(data, 'rarity', 8, 'R'),
    storyQuest: readText(data, 'storyQuest', 16, ''),
    candidates: readCandidates(data),
  };
}
