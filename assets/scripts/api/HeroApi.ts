import { HttpClient } from '../net/HttpClient';
import type {
  HeroCodexItemVO,
  HeroOperationResultVO,
  UserHeroDetailVO,
  UserHeroFragmentVO,
  UserHeroListItemVO,
} from '../types/HeroTypes';

/** 英雄相关接口封装；当前仅开放只读查询和后端白名单内的 level-up。 */
export class HeroApi {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<UserHeroListItemVO[]> {
    return this.http.get<UserHeroListItemVO[]>('/api/player/heroes');
  }

  detail(heroId: number): Promise<UserHeroDetailVO> {
    return this.http.get<UserHeroDetailVO>(`/api/player/heroes/${heroId}`);
  }

  levelUp(heroId: number): Promise<HeroOperationResultVO> {
    return this.http.post<HeroOperationResultVO>(`/api/player/heroes/${encodeURIComponent(String(heroId))}/level-up`);
  }

  /** 觉醒(2026-07-18 开放):10星+同名碎片120+金币50万+觉醒石x1+BOSS印记x10(hero_awaken_config)。 */
  awaken(heroId: number): Promise<HeroOperationResultVO> {
    return this.http.post<HeroOperationResultVO>(`/api/player/heroes/${encodeURIComponent(String(heroId))}/awaken`);
  }

  /** 升星(2026-07-18 开放):同名碎片+金币,配置由服务器 hero_star_config 定;上限 15 星。 */
  starUp(heroId: number): Promise<HeroOperationResultVO> {
    return this.http.post<HeroOperationResultVO>(`/api/player/heroes/${encodeURIComponent(String(heroId))}/star-up`);
  }

  // 洗练(重铸词条):锁定词条保留、其余重随机;消耗=重铸石1/金币500 各×2^锁定数(服务器结算)。
  refine(heroId: number, lockedAttrIds: number[]): Promise<HeroOperationResultVO> {
    return this.http.post<HeroOperationResultVO>('/api/player/heroes/refine', { heroId, lockedAttrIds });
  }

  // 终极技能升级(P6):卷轴+金币+BOSS印记(Lv4+)+深渊结晶(Lv6+);未觉醒上限5,觉醒后10。
  ultimateUp(heroId: number): Promise<HeroOperationResultVO> {
    return this.http.post<HeroOperationResultVO>(`/api/player/heroes/${encodeURIComponent(String(heroId))}/ultimate-up`);
  }

  fragments(): Promise<UserHeroFragmentVO[]> {
    return this.http.get<UserHeroFragmentVO[]>('/api/player/heroes/fragments/list');
  }

  codex(): Promise<HeroCodexItemVO[]> {
    return this.http.get<HeroCodexItemVO[]>('/api/player/heroes/codex');
  }
}
