/**
 * 英雄皮肤(docs/56,2026-11-01):皮肤 = 换了贴图的同一套战斗骨骼(Meowa 按 GPT 原型换皮,动作 / 技能动作全保留)。
 * 本表只登记客户端资源(skinCode → 骨骼 / 外挂特效换色版 / 立绘 / 头像);名称、属性、价格、拥有 / 穿着以服务端
 * GET /api/player/hero-skins 为准,由游戏根拿到后 setHeroSkinCatalog 灌进来。
 * 生效范围:走 resolveBattleUnitSpineResource 的地方(野外、守卫、掠夺、布阵)+ 野外外挂特效;英雄详情页「皮肤」页签展示立绘。
 */
export interface HeroSkinAssets {
  heroCode: string;
  /** 所属英雄显示名 / 稀有度(商店卡片用)。 */
  heroName: string;
  rarity: string;
  /** 战斗骨骼资源路径(resources 下,不带扩展名)。 */
  spine: string;
  /** 外挂特效换色版(按原 effect 码替换:普攻弹道 / 命中 / 战技不在骨骼里,不换就还是原配色)。 */
  fx?: Record<string, string>;
  /** 立绘(透明底,商店大图 / 英雄详情中间)。 */
  art: string;
  /** 头像(方形)。 */
  bust: string;
}

/** 服务端目录一项(HeroSkinApi)。 */
export interface HeroSkinInfo {
  skinCode: string;
  heroCode: string;
  skinName: string;
  tag: string;
  attackPct: number;
  hpPct: number;
  priceDiamond: number;
  description: string;
  owned: boolean;
  equipped: boolean;
  /** 穿上后这名英雄增加的战力(服务端按玩家该英雄最高战力实例算;没有该英雄 = 0)。 */
  powerBonus: number;
}

export const HERO_SKIN_ASSETS: Record<string, HeroSkinAssets> = {
  // 血月契约:外挂特效是原版紫色转血红(fx_tex_repack --hue 80 --sv 1.35,0.9),目录 bm_ 开头避开开局包前缀
  SKIN_WITCH03_BLOODMOON: {
    heroCode: 'SR_WITCH_03',
    heroName: '契约魔女',
    rarity: 'SR',
    spine: 'spine/hero_skin/act_1028_bloodmoon/act_1028',
    fx: { fx_150079_laierde_fly: 'bm_laierde_fly', fx_150079_laierde_hit: 'bm_laierde_hit', v2_a47_217: 'bm_a47_217' },
    art: 'ui/hero_skin/bloodmoon_art/spriteFrame',
    bust: 'ui/hero_skin/bloodmoon_bust/spriteFrame',
  },
};

/** 默认外观头像(皮肤页「默认」一行)。没登记的英雄用名册卡面。 */
export const HERO_DEFAULT_BUST: Record<string, string> = {
  SR_WITCH_03: 'ui/hero_skin/default_SR_WITCH_03_bust/spriteFrame',
};

/** 皮肤素材目录(商店皮肤页 / 英雄详情皮肤页加载门、穿着皮肤的英雄进图前一起下)。 */
export function heroSkinPackPrefixes(skinCode?: string | null): string[] {
  const list = skinCode ? [HERO_SKIN_ASSETS[skinCode]].filter(Boolean) : Object.values(HERO_SKIN_ASSETS);
  const out = new Set<string>(['ui/hero_skin']);
  list.forEach((a) => {
    out.add(a.spine.slice(0, a.spine.lastIndexOf('/')));
    Object.values(a.fx ?? {}).forEach((code) => out.add(`spine/effect/${code}`));
  });
  return Array.from(out);
}

let catalog: HeroSkinInfo[] = [];

/** 游戏根拿到服务端目录后调用(登录 / 购买 / 穿戴后刷新)。 */
export function setHeroSkinCatalog(list: HeroSkinInfo[]): void {
  catalog = list.filter((skin) => !!HERO_SKIN_ASSETS[skin.skinCode]);
}

export function heroSkinCatalog(): HeroSkinInfo[] {
  return catalog;
}

/** 这名英雄的全部皮肤(客户端有资源的才算)。 */
export function heroSkinsOf(heroCode: string | null | undefined): HeroSkinInfo[] {
  const code = (heroCode || '').trim().toUpperCase();
  return catalog.filter((skin) => skin.heroCode.toUpperCase() === code);
}

/** 这名英雄当前穿着的皮肤资源(没穿 = null)。 */
export function equippedHeroSkin(heroCode: string | null | undefined): (HeroSkinAssets & { skinCode: string }) | null {
  const skin = heroSkinsOf(heroCode).find((entry) => entry.equipped);
  const assets = skin ? HERO_SKIN_ASSETS[skin.skinCode] : null;
  return skin && assets ? { ...assets, skinCode: skin.skinCode } : null;
}
