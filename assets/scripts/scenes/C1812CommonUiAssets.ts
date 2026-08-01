import type { LobbyNavIconKey } from './lobby/LobbyHudTypes';

// 通用 UI 切图路径:标题横幅、按钮、Tab 等跨面板复用。ui/common/ai 与 ui/battle/ai 为用户 AI 生成的主题套件(P0)。
export const C1812_TITLE_BANNER_ASSET = 'ui/common/ai/title_banner/spriteFrame';
// AI 弹窗统一套件:黑曜石金边主框 + 道具格(全部弹框复用,加载失败由各面板原绘制兜底)。
export const C1812_POPUP_FRAME_PARCHMENT_ASSET = 'ui/common/ai/popup_frame_large/spriteFrame';
export const C1812_POPUP_FRAME_SMALL_ASSET = 'ui/common/ai/popup_frame_small/spriteFrame';
export const C1812_REWARD_SLOT_ORNATE_ASSET = 'ui/common/ai/item_slot/spriteFrame';
export const C1812_ITEM_SLOT_GLOW_ASSET = 'ui/common/ai/item_slot_glow/spriteFrame';
export const C1812_DIVIDER_GOLD_ASSET = 'ui/common/ai/divider_gold/spriteFrame';
export const C1812_BUTTON_CLOSE_ASSET = 'ui/common/ai/button_close/spriteFrame';
// 返回/禁用共用暗色横按钮(button_return_dis);确认/召唤类主按钮统一红金 button_primary。
export const C1812_BUTTON_DISABLED_ASSET = 'ui/common/ai/button_return_dis/spriteFrame';
export const C1812_BUTTON_RETURN_ASSET = C1812_BUTTON_DISABLED_ASSET;
// C1812 named 英雄宽幅战斗横像(1447x390 插画),用于英雄详情/结算横幅。
const C1812_HERO_BATTLE_PORTRAIT_DIR = 'ui/hero/c1812/battle_portrait/';
const C1812_HERO_BATTLE_PORTRAIT_ASSETS: ReadonlySet<string> = new Set([
  'Nuu', 'Ishmael', 'IshmaelA', 'Carmilla', 'Eulenspigel', 'Belladonna', 'LucienA', 'Lucrecia',
  'Sphinx', 'HeylelS01', 'Hopkins', 'Robert', 'Saighead', 'Simone',
]);

export function resolveC1812HeroBattlePortraitPath(asset?: string | null): string | null {
  const value = (asset || '').trim();
  return C1812_HERO_BATTLE_PORTRAIT_ASSETS.has(value) ? `${C1812_HERO_BATTLE_PORTRAIT_DIR}${value}/spriteFrame` : null;
}
export const C1812_BUTTON_PRIMARY_ASSET = 'ui/common/ai/button_primary/spriteFrame';
// button_danger 素材已下线:强调按钮与主按钮同用红金 button_primary。
export const C1812_BUTTON_DANGER_ASSET = C1812_BUTTON_PRIMARY_ASSET;
export const C1812_TAB_SELECTED_ASSET = 'ui/common/ai/tab_selected/spriteFrame';
export const BATTLE_C1812_SKILL_FRAME_ASSET = 'ui/battle/ai/battle_card_frame/spriteFrame';
export const BATTLE_C1812_SKILL_FRAME_ACTIVE_ASSET = 'ui/battle/ai/battle_card_active/spriteFrame';
export const BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET = 'ui/battle/ai/boss_gauge_frame/spriteFrame';
export const BATTLE_C1812_BOSS_GAUGE_BAR_ASSET = 'ui/battle/ai/boss_gauge_fill/spriteFrame';
export const BATTLE_C1812_SKILL_TARGET_FRAME_ASSET = 'ui/battle/c1812/skill_target_frame/spriteFrame';
export const BATTLE_C1812_HIT_BURST_ASSET = 'ui/battle/c1812/blood_deco/spriteFrame';
// 斩击/受击爆闪换用 AI 特效图(512x341,宽高比 1.5:1,渲染时保持比例、不加乘色)。
export const BATTLE_C1812_HIT_SLASH_ASSET = 'ui/battle/ai/fx_slash/spriteFrame';
export const BATTLE_C1812_HIT_BURST_EFFECT_ASSET = 'ui/battle/ai/fx_impact/spriteFrame';
export const BATTLE_C1812_HIT_RING_ASSET = 'ui/battle/c1812/effects/hit_ring/spriteFrame';
export const BATTLE_C1812_HIT_SPARK_ASSET = 'ui/battle/c1812/effects/hit_spark/spriteFrame';
export const BATTLE_C1812_BUFF_ATTACK_UP_ASSET = 'ui/battle/ai/buff_atk/spriteFrame';
export const BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET = 'ui/battle/ai/buff_def/spriteFrame';
export const BATTLE_C1812_BUFF_SHIELD_ASSET = 'ui/battle/ai/buff_shield/spriteFrame';
export const BATTLE_C1812_BUFF_STUN_ASSET = 'ui/battle/ai/buff_stun/spriteFrame';

// 底部导航图标换用 lobby/ai 新套件(128 方图);圣契位用召唤图标。
export const LOBBY_C1812_NAV_ICON_ASSETS: Record<LobbyNavIconKey, string> = {
  hero: 'ui/lobby/ai/nav_hero/spriteFrame',
  bag: 'ui/lobby/ai/nav_bag/spriteFrame',
  contract: 'ui/lobby/ai/nav_summon/spriteFrame',
  codex: 'ui/lobby/ai/nav_codex/spriteFrame',
  quest: 'ui/lobby/ai/nav_quest/spriteFrame',
  forge: 'ui/lobby/ai/nav_forge/spriteFrame',
  shop: 'ui/lobby/ai/nav_shop/spriteFrame',
};
// 右下深渊爬塔大入口图标。
export const LOBBY_AI_NAV_ADVENTURE_ASSET = 'ui/lobby/ai/nav_adventure/spriteFrame';

// 星级色带(2026-07-21 设计定稿):15 星分五档换色,3 星一档 —— 1-3绿 / 4-6蓝 / 7-9紫 / 10-12橙 / 13-15红。
// 显示规则:星行画 3 槽,亮星数=档内进度((star-1)%3+1),颜色=档色;超过 3 星时旁边保留 "N星" 数字。
export type StarBandColor = 'green' | 'blue' | 'purple' | 'orange' | 'red';
const STAR_BAND_ORDER: readonly StarBandColor[] = ['green', 'blue', 'purple', 'orange', 'red'];
export const STAR_BAND_SIZE = 3;
export function starBandColor(star: number): StarBandColor {
  const safe = Math.max(1, Math.min(15, Math.trunc(star || 1)));
  return STAR_BAND_ORDER[Math.min(STAR_BAND_ORDER.length - 1, Math.floor((safe - 1) / STAR_BAND_SIZE))];
}
export function starBandProgress(star: number): number {
  const safe = Math.max(1, Math.min(15, Math.trunc(star || 1)));
  return ((safe - 1) % STAR_BAND_SIZE) + 1;
}
export function starBandAsset(star: number): string {
  return `ui/common/ai/star_${starBandColor(star)}/spriteFrame`;
}
export const STAR_BAND_ASSETS: readonly string[] = STAR_BAND_ORDER.map((color) => `ui/common/ai/star_${color}/spriteFrame`);
// 星级五档进阶星行(2026-07-22 v2,替代"3槽色带"):固定 5 槽,第 i 槽=第 i 档(绿蓝紫橙红,每档3星)。
// 满档=满亮档色星;当前档=半亮档色星+档内进度点(1-3);未达档=灰空星。15 星=五色全亮。
export interface StarBandSlot {
  color: StarBandColor;
  state: 'full' | 'active' | 'empty';
  progress: number;
}
export function starBandSlots(star: number): StarBandSlot[] {
  const safe = Math.max(1, Math.min(15, Math.trunc(star || 1)));
  const fullBands = Math.floor(safe / STAR_BAND_SIZE);
  const activeProgress = safe % STAR_BAND_SIZE;
  return STAR_BAND_ORDER.map((color, index) => {
    if (index < fullBands) {
      return { color, state: 'full' as const, progress: STAR_BAND_SIZE };
    }
    if (index === fullBands && activeProgress > 0) {
      return { color, state: 'active' as const, progress: activeProgress };
    }
    return { color, state: 'empty' as const, progress: 0 };
  });
}
// 星级显示 v3(2026-07-22 用户定稿,替代 v2 五档槽):每 5 星一轮,轮内逐颗点亮(1星=1颗…5星=5颗),
// 升到换色星(6/11…)整排换色:第 1 轮绿、第 2 轮蓝、第 3 轮紫(15 星封顶;若上限扩至 25 继续橙/红)。
export function starDisplayV3(star: number): { color: StarBandColor; count: number } {
  const safe = Math.max(1, Math.trunc(star || 1));
  const round = Math.min(STAR_BAND_ORDER.length - 1, Math.floor((safe - 1) / 5));
  return { color: STAR_BAND_ORDER[round], count: ((safe - 1) % 5) + 1 };
}

export function starBandAssetOf(color: StarBandColor): string {
  return `ui/common/ai/star_${color}/spriteFrame`;
}
export function starBandTextRgbOf(color: StarBandColor): readonly [number, number, number] {
  if (color === 'green') {
    return [150, 232, 120];
  }
  if (color === 'blue') {
    return [126, 184, 255];
  }
  if (color === 'purple') {
    return [210, 146, 255];
  }
  if (color === 'orange') {
    return [255, 190, 92];
  }
  return [255, 108, 84];
}

// 档色文字调(r,g,b):花名册文字星/升星页目标星/详情数字标注用。
export function starBandTextRgb(star: number): readonly [number, number, number] {
  const color = starBandColor(star);
  if (color === 'green') {
    return [150, 232, 120];
  }
  if (color === 'blue') {
    return [126, 184, 255];
  }
  if (color === 'purple') {
    return [210, 146, 255];
  }
  if (color === 'orange') {
    return [255, 190, 92];
  }
  return [255, 108, 84];
}
