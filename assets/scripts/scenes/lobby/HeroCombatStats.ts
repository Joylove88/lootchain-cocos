import type { EquipmentItemVO } from '../../api/EquipmentApi';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';

/**
 * 英雄战斗属性合计(docs/41 局外属性接入守卫战,2026-10-24 用户拍板 A 方案)。
 * 属性详情「属性来源」与守卫战建场共用这一份口径:面板上写的数,就是守卫战里用的数。
 *
 * - 基础:后端下发的有效属性(base_* × 等级 / 星系数,attrHp 等)。
 * - 装备:已穿戴装备的平属性合计(item.attrHp 等,已含强化)。
 * - 特性(词条):点数 ÷10 = 百分比。生命 / 攻击 / 防御 / 速度加成按「基础 + 装备」的百分比加成;
 *   暴击率、暴击伤害是百分点直加。后端战力本就把词条点数缩到 0.04 倍计入,按平值 +103 显示是口径错误。
 */
export type HeroCombatStatKey = '生命' | '攻击' | '防御' | '速度' | '暴击' | '暴伤';
export interface HeroCombatStatSource {
  base: number;
  equip: number;
  affix: number;
  percent: boolean;
}

/** 英雄基础暴击伤害(%):守卫战暴击倍率 = 暴伤 / 100。 */
export const HERO_BASE_CRIT_DAMAGE_PCT = 150;

/** 百分比加成类词条 → 加成的属性(按基础 + 装备的百分比)。 */
const HERO_AFFIX_PCT_STAT: Record<string, HeroCombatStatKey> = { HP_BONUS: '生命', ATK_BONUS: '攻击', DEF_BONUS: '防御', SPD_BONUS: '速度' };
/** 百分点直加类词条。 */
const HERO_AFFIX_POINT_STAT: Record<string, HeroCombatStatKey> = { CRIT_RATE: '暴击', CRIT_DMG: '暴伤' };

/** 词条点数 → 百分比(全部词条同一口径)。 */
export function heroAffixPct(rawValue: number): number {
  return (Number(rawValue) || 0) / 10;
}

/** 某一词条编码的合计百分比。 */
export function heroAffixSumPct(hero: LobbyHeroItemVO, code: string): number {
  return (hero.affixes ?? [])
    .filter((affix) => (affix.code || '').toUpperCase() === code)
    .reduce((sum, affix) => sum + heroAffixPct(affix.value), 0);
}

export function resolveHeroCombatSources(hero: LobbyHeroItemVO, equipItems: readonly EquipmentItemVO[]): Record<HeroCombatStatKey, HeroCombatStatSource> {
  const star = Math.max(1, hero.star);
  const level = Math.max(1, hero.level);
  const power = Math.max(0, hero.power);
  // 旧库 / 离线数据缺字段时回退早期客户端估算(与 resolveAttributes 同口径),避免面板空白
  const out: Record<HeroCombatStatKey, HeroCombatStatSource> = {
    生命: { base: hero.attrHp ?? Math.round(power * 1.55 + level * 120 + star * 420), equip: 0, affix: 0, percent: false },
    攻击: { base: hero.attrAttack ?? Math.round(power * 0.32 + level * 42 + star * 135), equip: 0, affix: 0, percent: false },
    防御: { base: hero.attrDefense ?? Math.round(power * 0.22 + level * 36 + star * 108), equip: 0, affix: 0, percent: false },
    速度: { base: hero.attrSpeed ?? 112 + star * 3, equip: 0, affix: 0, percent: false },
    暴击: { base: hero.attrCrit ?? 14 + star * 2, equip: 0, affix: 0, percent: true },
    暴伤: { base: HERO_BASE_CRIT_DAMAGE_PCT, equip: 0, affix: 0, percent: true },
  };
  equipItems.forEach((item) => {
    if (item.heroId !== hero.id) {
      return;
    }
    out.生命.equip += item.attrHp ?? 0;
    out.攻击.equip += item.attrAttack ?? 0;
    out.防御.equip += item.attrDefense ?? 0;
    out.速度.equip += item.attrSpeed ?? 0;
    out.暴击.equip += item.attrCrit ?? 0;
  });
  (hero.affixes ?? []).forEach((affix) => {
    const code = (affix.code || '').toUpperCase();
    const pctStat = HERO_AFFIX_PCT_STAT[code];
    if (pctStat) {
      const entry = out[pctStat];
      entry.affix += Math.round((entry.base + entry.equip) * heroAffixPct(affix.value) / 100 * 10) / 10;
      return;
    }
    const pointStat = HERO_AFFIX_POINT_STAT[code];
    if (pointStat) {
      out[pointStat].affix += heroAffixPct(affix.value);
    }
  });
  return out;
}

export function heroCombatTotal(source: HeroCombatStatSource): number {
  return source.base + source.equip + source.affix;
}
