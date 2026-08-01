import type { PlayerBattleSkillConfigVO } from './BattleTypes';

/** 英雄词条(洗练系统属性)只读展示项。 */
export interface LobbyHeroAffixVO {
  /** 词条实例ID(user_hero_attr.id);洗练锁定用,旧回执可能缺省为 0。 */
  id: number;
  code: string;
  name: string;
  value: number;
  quality: string;
  type?: string | null;
}

/** 大厅英雄队列只读展示项；只展示拥有英雄，不承载养成、抽卡或奖励语义。 */
export interface LobbyHeroItemVO {
  id: number;
  heroCode: string;
  heroName: string;
  rarity: string;
  faction?: string | null;
  heroClass?: string | null;
  level: number;
  star: number;
  power: number;
  protagonist: boolean;
  sourceType: string;
  portraitAsset?: string | null;
  cardBackgroundAsset?: string | null;
  spineAsset?: string | null;
  spineUuid?: string | null;
  currentForm?: string | null;
  formLabel?: string | null;
  // 真实有效属性(后端 base_* × 等级系数 × 星系数下发);英雄详情面板直接展示,缺省回退旧客户端估算。
  attrHp?: number | null;
  attrAttack?: number | null;
  attrDefense?: number | null;
  attrSpeed?: number | null;
  attrCrit?: number | null;
  // 战斗特殊属性配置(后端 hero_battle_skill_config 下发);英雄详情"技能预览"读取。缺省回退客户端占位表。
  skillConfig?: PlayerBattleSkillConfigVO;
  // 词条(洗练系统属性,后端 user_hero_attr 下发);英雄详情"词条"区展示。缺省为空数组。
  affixes?: LobbyHeroAffixVO[];
  // 养成状态(后端 user_hero 下发);英雄详情"养成"行展示。
  luckValue?: number | null;
  awakenStatus?: number | null;
  ultimateSkillLevel?: number | null;
}

export interface LobbyHeroFilterOptionsVO {
  heroClasses: string[];
}

/** 英雄队列面板渲染所需的本地状态快照。 */
export interface LobbyHeroRosterPanelState {
  loading: boolean;
  loaded: boolean;
  error: string;
  heroes: LobbyHeroItemVO[];
  heroClassOptions: string[];
}
