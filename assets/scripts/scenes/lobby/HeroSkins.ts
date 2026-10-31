/**
 * 英雄皮肤(2026-11-01 试穿阶段):皮肤 = 换了贴图的同一套战斗骨骼(Meowa 按 GPT 原型换皮,动作 / 技能动作全保留)。
 * 现在只有「本地试穿」开关(localStorage lootchain.heroSkin = { 英雄码: 皮肤码 }),玩家没有入口;
 * 正式的获得 / 拥有 / 切换(商店、英雄详情、服务端保存)待原型确认后再做。
 * 生效范围:走 resolveBattleUnitSpineResource 的地方(野外、守卫、掠夺、布阵);英雄详情页立绘舞台暂不换。
 */
export interface HeroSkinDef {
  code: string;
  name: string;
  /** 骨骼资源路径(resources 下,不带扩展名)。 */
  spine: string;
  /** 外挂特效换色版(按原 effect 码替换:普攻弹道 / 命中 / 战技不在骨骼里,不换就还是原配色)。 */
  fx?: Record<string, string>;
}

export const HERO_SKINS: Record<string, HeroSkinDef[]> = {
  // 血月契约:外挂特效是原版紫色转血红(fx_tex_repack --hue 80 --sv 1.35,0.9),目录 bm_ 开头避开开局包前缀
  SR_WITCH_03: [{
    code: 'bloodmoon', name: '血月契约', spine: 'spine/hero_skin/act_1028_bloodmoon/act_1028',
    fx: { fx_150079_laierde_fly: 'bm_laierde_fly', fx_150079_laierde_hit: 'bm_laierde_hit', v2_a47_217: 'bm_a47_217' },
  }],
};

const STORAGE_KEY = 'lootchain.heroSkin';

function readEquipped(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch (error) {
    void error;
    return {};
  }
}

/** 这名英雄当前穿着的皮肤(没穿 / 皮肤不存在 = null)。 */
export function equippedHeroSkin(heroCode: string | null | undefined): HeroSkinDef | null {
  const code = (heroCode || '').trim().toUpperCase();
  if (!code) {
    return null;
  }
  const skinCode = readEquipped()[code];
  return (HERO_SKINS[code] ?? []).find((skin) => skin.code === skinCode) ?? null;
}

/** 本地试穿 / 脱下(skinCode = null 脱下)。 */
export function setEquippedHeroSkin(heroCode: string, skinCode: string | null): void {
  try {
    const map = readEquipped();
    const code = heroCode.trim().toUpperCase();
    if (skinCode) {
      map[code] = skinCode;
    } else {
      delete map[code];
    }
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    void error;
  }
}
