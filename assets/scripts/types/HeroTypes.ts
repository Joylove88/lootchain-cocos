/** 英雄列表展示模型；当前大厅阶段入口仍为本地占位。 */
export interface UserHeroListItemVO {
  id: number;
  heroCode: string;
  heroName: string;
  rarity: string;
  level: number;
  star: number;
  power: number;
  portraitAsset?: string | null;
  cardBackgroundAsset?: string | null;
  spineAsset?: string | null;
  spineUuid?: string | null;
  tokenNo?: string | null;
}

export interface HeroAttrVO {
  attrCode: string;
  attrName: string;
  attrValue: string | number;
  attrQuality: string;
  attrType: string;
}

export interface UserHeroDetailVO {
  id: number;
  userId: number;
  heroCode: string;
  heroName: string;
  rarity: string;
  level: number;
  exp: number;
  star: number;
  awakenStatus: number;
  ultimateSkillLevel: number;
  tokenNo?: string | null;
  power: number;
  luckValue: number;
  faction: string;
  heroClass: string;
  portraitAsset?: string | null;
  cardBackgroundAsset?: string | null;
  spineAsset?: string | null;
  spineUuid?: string | null;
  skills?: string | null;
  ultimateSkillCode?: string | null;
  story?: string | null;
  attrs: HeroAttrVO[];
  /** 英雄等级上限:min(70, 玩家等级+10)。 */
  heroLevelCap?: number | null;
  /** 升到下一级所需经验;已达上限或配置缺失时为 null。 */
  nextLevelNeedExp?: number | null;
  /** 升到下一级所需英雄经验书数量;已达上限或配置缺失时为 null。 */
  nextLevelExpBookCost?: number | null;
  /** 升到下一级所需金币;已达上限或配置缺失时为 null。 */
  nextLevelGoldCost?: number | null;
}

export interface UserHeroFragmentVO {
  heroCode: string;
  heroName: string;
  rarity: string;
  fragmentCount: number;
}

export interface HeroCodexItemVO {
  heroCode: string;
  heroName: string;
  rarity: string;
  faction: string;
  heroClass: string;
  roleDesc?: string | null;
  portraitAsset?: string | null;
  cardBackgroundAsset?: string | null;
  spineAsset?: string | null;
  spineUuid?: string | null;
  owned: boolean;
  ownedCount: number;
  exLocked: boolean;
}

export interface HeroOperationResultVO {
  heroId: number;
  level: number;
  star: number;
  awakenStatus: number;
  power: number;
  ultimateSkillLevel: number;
}
