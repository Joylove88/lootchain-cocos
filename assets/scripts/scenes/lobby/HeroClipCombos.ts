/**
 * 专属连招切片表(野外 LobbyTownRenderer 与矿境掠夺 GuardRaidController 共用,11-06 用户「抢矿和野外不一样,需要同步」)。
 * 11-03 用户「英雄攻击动作太少,看不出连招」:永夜龙骑骨骼的每段攻击动作 2~3 秒、里面有好几刀,整段压到 0.6 秒快进 = 只看到一闪。
 * 这里把每段里真正出刀的那一截(秒,按 12fps 逐帧看过)切出来、接近原速播,串成 5 段:上挑 → 横扫 → 过顶劈 → 突刺 → 跃起下劈(终结,重击 + 范围)。
 * hitAt = 命中点在这一截里的比例。主角(protag_m / protag_f,炼魂 _lh 换装)与永夜龙骑(IshmaelA)同一副骨骼、共用。
 * 矿境掠夺的模型时序(GuardBattleModel.GUARD_RAID_COMBO)按这张表的切片时长折算,改这里要同步改那边并重建 guard-replay。
 */
export interface HeroClipSegment {
  anim: string;
  start: number;
  end: number;
  speed: number;
  hitAt: number;
  mult: number;
  reach: number;
  heavy: boolean;
  around?: boolean;
}

const PROTAGONIST_CHAIN: HeroClipSegment[] = [
  { anim: 'skill3A', start: 0.4, end: 1.1, speed: 1.3, hitAt: 0.5, mult: 0.9, reach: 175, heavy: false },
  { anim: 'skill1', start: 0.25, end: 0.95, speed: 1.3, hitAt: 0.45, mult: 1.0, reach: 185, heavy: false },
  { anim: 'atk', start: 0.55, end: 1.5, speed: 1.35, hitAt: 0.68, mult: 1.25, reach: 180, heavy: false },
  { anim: 'skill1', start: 1.05, end: 1.95, speed: 1.35, hitAt: 0.4, mult: 1.2, reach: 210, heavy: false },
  { anim: 'skill3B', start: 0.3, end: 1.45, speed: 1.3, hitAt: 0.62, mult: 1.9, reach: 220, heavy: true, around: true },
];

export const HERO_CLIP_COMBOS: Readonly<Record<string, ReadonlyArray<HeroClipSegment>>> = {
  protag_m: PROTAGONIST_CHAIN,
  protag_f: PROTAGONIST_CHAIN,
  protag_m_lh: PROTAGONIST_CHAIN,
  protag_f_lh: PROTAGONIST_CHAIN,
  IshmaelA: PROTAGONIST_CHAIN,
};

/** 骨骼资源名 → 连招切片(资源名可能带目录,取最后一段);没配的返回 null。 */
export function heroClipCombo(spineAsset: string | null | undefined): ReadonlyArray<HeroClipSegment> | null {
  const key = (spineAsset ?? '').split('/').pop() ?? '';
  return HERO_CLIP_COMBOS[key] ?? null;
}

/** 技能键动作上限(ms,野外同口径:重斩 / 突进斩 / 旋风斩;长动作按上限加速播完,掠夺模型锁时取 80%)。 */
export const HERO_SKILL_ACTION_CAP_MS: readonly number[] = [1200, 1250, 1500];
