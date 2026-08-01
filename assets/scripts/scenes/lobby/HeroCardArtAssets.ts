// 英雄卡立绘映射(hero_template.card_background_asset 镜像,2026-07-22):
// 召唤结果等拿不到花名册 VO 的场景按 heroCode 直查立绘;新英雄配表后需同步本表。
// aspect = 素材实测宽高比;tight = npc 系紧裁人物图(等比 contain,不需要可见高补偿);
// visibleRatio/focusXRatio 与花名册卡背景显示参数同源(Illust 方图带大留白,按可见高放大+水平焦点偏移)。

export interface HeroCardArtProfile {
  asset: string;
  aspect: number;
  tight: boolean;
  visibleRatio: number;
  focusXRatio: number;
}

const CARD_ART_DIR = 'ui/hero-roster/card_background';

function npcArt(file: string, aspect: number): HeroCardArtProfile {
  // 路径必须带 /spriteFrame 子资源后缀:UiSpriteFrameCache.request 按原样 resources.load,裸图路径会一直加载失败。
  return { asset: `${CARD_ART_DIR}/${file}/spriteFrame`, aspect, tight: true, visibleRatio: 1, focusXRatio: 0 };
}

function illustArt(file: string, aspect: number, visibleRatio: number, focusXRatio: number): HeroCardArtProfile {
  return { asset: `${CARD_ART_DIR}/${file}/spriteFrame`, aspect, tight: false, visibleRatio, focusXRatio };
}

const HERO_CARD_ART_PROFILES: Record<string, HeroCardArtProfile> = {
  R_PATROL_01: npcArt('npc_1001', 0.9163),
  R_ACOLY_02: npcArt('npc_1012', 0.9366),
  R_SCOUT_03: npcArt('npc_1004', 0.7522),
  R_CULT_05: npcArt('npc_1008', 0.66),
  R_RANGER_06: npcArt('npc_1016', 0.5523),
  R_GUARD_07: npcArt('npc_1003', 0.8016),
  SR_PRIEST_01: npcArt('npc_21006', 0.6312),
  SR_PALADIN_02: npcArt('npc_1002', 0.621),
  SR_WITCH_03: npcArt('npc_1028', 0.6459),
  SR_BLADE_04: npcArt('npc_1038', 0.5412),
  SR_SNIPER_05: npcArt('npc_1037', 0.803),
  SR_ABYSS_06: npcArt('npc_1036', 0.4875),
  SSR_KANE: illustArt('Ishmael_center', 1.25, 0.958, 0.068),
  SSR_LIVIA: illustArt('Carmilla_center', 1.25, 0.93, -0.022),
  SSR_MICHAEL: illustArt('HeylelS01_Illust', 1, 0.604, -0.024),
  SSR_RON: illustArt('Eulenspigel_Illust', 1, 0.603, -0.058),
  UR_ARTHAS: illustArt('IshmaelA_Illust', 1, 0.739, 0.06),
  UR_ATLAS: illustArt('Lucrecia_Illust', 1, 0.567, 0.174),
  UR_AURELIA: illustArt('Belladonna_Illust', 1, 0.635, -0.075),
  UR_EVELYN: illustArt('Nuu_Illust', 1.2, 1, 0),
  UR_NYX: illustArt('Sphinx_Illust', 1, 0.729, 0.102),
  UR_SERAPHINA: illustArt('LucienA_Illust', 1, 0.768, -0.011),
};

/** heroCode → 立绘显示档案;未配立绘(hero_template 为 NULL)返回 null,调用方回退剪影。 */
export function heroCardArtProfileByCode(heroCode: string | null | undefined): HeroCardArtProfile | null {
  if (!heroCode) {
    return null;
  }
  return HERO_CARD_ART_PROFILES[heroCode.trim().toUpperCase()] ?? null;
}
