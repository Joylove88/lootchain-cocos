import { HttpClient } from '../net/HttpClient';
import { isRecord, readArray, readText } from './ApiValueGuards';

export type EvolutionRoute = 'HUNT' | 'GUARD' | 'ARCANE' | 'EXPLORE' | 'WEALTH';

export interface EvolutionCard {
  /** 卡键 = 卡码:稀有度(例 ATK:R),选卡时原样回传。 */
  key: string;
  code: string;
  name: string;
  /** ATTR 属性 / COMBAT 战斗 / EXPLORE 探索。 */
  category: string;
  route: EvolutionRoute;
  /** C 普通 / R 稀有 / L 传说。 */
  rarity: string;
  rarityName: string;
  desc: string;
  /** 选这张之前该路线已有几张。 */
  routeCount: number;
}

export interface EvolutionChoice {
  id: number;
  level: number;
  candidates: EvolutionCard[];
  refreshCount: number;
  /** 下一次刷新的钻石价;0 = 免费。 */
  refreshPrice: number;
  /** 再几次抉择必出稀有。 */
  pityLeft: number;
}

export interface EvolutionQuality {
  code: string;
  name: string;
  desc: string;
  route: EvolutionRoute;
  layer: number;
  active: boolean;
}

export interface EvolutionState {
  level: number;
  realm: string;
  /** 还有几次进化待选(含当前这次)。 */
  pendingCount: number;
  choice: EvolutionChoice | null;
  routes: Record<EvolutionRoute, number>;
  qualities: EvolutionQuality[];
  /** 已生效效果:卡码 → 累计值(比例,0.06 = 6%;唯一卡 = 1)。质变按 qualities.active。 */
  effects: Record<string, number>;
}

const ROUTES: EvolutionRoute[] = ['HUNT', 'GUARD', 'ARCANE', 'EXPLORE', 'WEALTH'];

/** 进化抉择(docs/58 §10):每升 1 级 3 选 1;候选 / 保底 / 刷新价全由服务端给出,选卡、刷新也在服务端。 */
export class EvolutionApi {
  constructor(private readonly http: HttpClient) {}

  state(): Promise<EvolutionState> {
    return this.http.get<unknown>('/api/player/evolution').then(validateState);
  }

  pick(choiceId: number, cardKey: string): Promise<EvolutionState> {
    return this.http.post<unknown>('/api/player/evolution/pick', { choiceId, cardKey }).then(validateState);
  }

  refresh(choiceId: number): Promise<EvolutionState> {
    return this.http.post<unknown>('/api/player/evolution/refresh', { choiceId }).then(validateState);
  }
}

function num(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function route(value: string): EvolutionRoute {
  return (ROUTES as string[]).includes(value) ? (value as EvolutionRoute) : 'HUNT';
}

function validateState(data: unknown): EvolutionState {
  if (!isRecord(data)) {
    throw new Error('进化状态响应格式错误');
  }
  let choice: EvolutionChoice | null = null;
  if (isRecord(data.choice)) {
    const raw = data.choice;
    choice = {
      id: num(raw, 'id'),
      level: num(raw, 'level'),
      candidates: readArray(raw, 'candidates', 3).map((entry) => {
        const item = isRecord(entry) ? entry : {};
        return {
          key: readText(item, 'key', 64, ''),
          code: readText(item, 'code', 32, ''),
          name: readText(item, 'name', 32, ''),
          category: readText(item, 'category', 16, 'ATTR'),
          route: route(readText(item, 'route', 16, 'HUNT')),
          rarity: readText(item, 'rarity', 4, 'C'),
          rarityName: readText(item, 'rarityName', 8, '普通'),
          desc: readText(item, 'desc', 120, ''),
          routeCount: num(item, 'routeCount'),
        };
      }).filter((card) => card.key.length > 0),
      refreshCount: num(raw, 'refreshCount'),
      refreshPrice: num(raw, 'refreshPrice'),
      pityLeft: num(raw, 'pityLeft', 5),
    };
  }
  const routesRaw = isRecord(data.routes) ? data.routes : {};
  const routes = Object.fromEntries(ROUTES.map((r) => [r, num(routesRaw, r)])) as Record<EvolutionRoute, number>;
  const qualities = readArray(data, 'qualities', 20).map((entry) => {
    const item = isRecord(entry) ? entry : {};
    return {
      code: readText(item, 'code', 32, ''),
      name: readText(item, 'name', 16, ''),
      desc: readText(item, 'desc', 120, ''),
      route: route(readText(item, 'route', 16, 'HUNT')),
      layer: num(item, 'layer', 3),
      active: item.active === true,
    };
  });
  const effectsRaw = isRecord(data.effects) ? data.effects : {};
  const effects: Record<string, number> = {};
  for (const [key, value] of Object.entries(effectsRaw)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      effects[key] = value;
    }
  }
  return {
    level: num(data, 'level', 1),
    realm: readText(data, 'realm', 32, ''),
    pendingCount: num(data, 'pendingCount'),
    choice: choice && choice.candidates.length > 0 ? choice : null,
    routes,
    qualities,
    effects,
  };
}
