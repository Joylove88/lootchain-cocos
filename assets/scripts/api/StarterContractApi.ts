import { HttpClient } from '../net/HttpClient';
import { isRecord, readArray, readOptionalText, readText } from './ApiValueGuards';

export interface StarterContractCandidate {
  heroCode: string;
  heroName: string;
  rarity: string;
  heroClass: string | null;
}

export interface StarterContractState {
  /** 已选过(老号 / 已订立契约)= 不再弹。 */
  picked: boolean;
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
}

function validateState(data: unknown): StarterContractState {
  if (!isRecord(data)) {
    throw new Error('契约之选响应格式错误');
  }
  const candidates = readArray(data, 'candidates', 6).map((entry) => {
    const item = isRecord(entry) ? entry : {};
    return {
      heroCode: readText(item, 'heroCode', 64, ''),
      heroName: readText(item, 'heroName', 64, ''),
      rarity: readText(item, 'rarity', 16, 'R'),
      heroClass: readOptionalText(item, 'heroClass', 32),
    };
  }).filter((item) => item.heroCode.length > 0);
  return { picked: data.picked === true, candidates };
}
