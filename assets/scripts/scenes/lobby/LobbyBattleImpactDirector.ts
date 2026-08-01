import type { BattleActionPresentationCue } from './LobbyBattleActionPresentation';

export interface BattleImpactRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface BattleImpactProfile {
  cueKey: string;
  isCritical: boolean;
  hitStopMs: number;
  screenShake: {
    enabled: boolean;
    amplitude: number;
    durationMs: number;
  };
  defenderRecoil: {
    distanceX: number;
    liftY: number;
    durationMs: number;
  };
  slash: {
    width: number;
    height: number;
    lineWidth: number;
    opacity: number;
    primary: BattleImpactRgba;
    secondary: BattleImpactRgba;
  };
  floatingText: {
    fontSize: number;
    width: number;
    height: number;
    riseY: number;
    popScale: number;
    color: BattleImpactRgba;
    // 特殊属性飘字需要放大弹出强调(暴击/克制/连击);闪避等不弹。渲染层据此决定是否播放 pop 动画。
    emphasize: boolean;
  };
}

export function resolveBattleImpactProfile(cue: BattleActionPresentationCue | null | undefined, scale: number): BattleImpactProfile | null {
  if (!cue || cue.kind !== 'damage_float') {
    return null;
  }
  const isCritical = isBattleImpactCritical(cue);
  const safeScale = Math.max(0.2, scale);
  // 特殊属性识别:穿透/克制/连击标签内嵌在飘字文案里,闪避走 cue.evaded。用于给飘字上更显眼的配色与放大。
  const isEvade = cue.evaded === true || cue.displayValue.includes('闪避');
  // 斩杀(装备特级词条,处决击杀)优先级最高:黑金重色+最大放大。
  const isExecute = !isEvade && cue.displayValue.includes('斩杀');
  const isSplash = !isEvade && !isExecute && cue.displayValue.includes('溅射');
  const isFreeze = !isEvade && !isSplash && cue.displayValue.includes('冻结');
  const isStun = !isEvade && !isSplash && !isFreeze && cue.displayValue.includes('眩晕');
  const isPierce = !isEvade && !isSplash && !isFreeze && !isStun && cue.displayValue.includes('穿透');
  // 被克制(敌方克我方)先判,避免被"克制"子串误判;我方克制(增益)走 isCounter。
  const isEnemyCounter = !isEvade && !isSplash && !isFreeze && !isStun && !isPierce && cue.displayValue.includes('被克制');
  const isCounter = !isEnemyCounter && !isEvade && !isSplash && !isFreeze && !isStun && !isPierce && cue.displayValue.includes('克制');
  const isCombo = !isEvade && !isCritical && !isSplash && !isFreeze && !isStun && !isPierce && !isEnemyCounter && !isCounter && cue.displayValue.includes('连击');
  // 优先级:冻结(冰蓝)/眩晕(晕黄)>穿透(真伤·紫)>暴击(烈红)>被克制(警示红)>克制(描金琥珀)>溅射(橙)>连击(青蓝)>普通(暖黄);闪避单独冷灰、不放大。
  const floatColor: BattleImpactRgba = isEvade
    ? { r: 202, g: 208, b: 216, a: 235 }
    : isExecute
    ? { r: 255, g: 60, b: 24, a: 255 }
    : isFreeze
      ? { r: 128, g: 214, b: 255, a: 255 }
      : isStun
        ? { r: 255, g: 224, b: 96, a: 255 }
        : isPierce
          ? { r: 205, g: 128, b: 255, a: 255 }
          : isCritical
            ? { r: 255, g: 71, b: 45, a: 255 }
            : isEnemyCounter
              ? { r: 255, g: 96, b: 96, a: 255 }
              : isCounter
                ? { r: 255, g: 198, b: 74, a: 255 }
                : isSplash
                  ? { r: 255, g: 160, b: 72, a: 255 }
                  : isCombo
                    ? { r: 140, g: 231, b: 255, a: 255 }
                    : { r: 255, g: 219, b: 111, a: 255 };
  const floatFontBase = isExecute ? 36 : isFreeze || isStun ? 31 : isPierce ? 31 : isCritical ? 34 : isEnemyCounter || isCounter ? 30 : isSplash ? 25 : isCombo ? 26 : isEvade ? 20 : 23;
  const floatPop = isExecute ? 1.4 : isFreeze || isStun ? 1.28 : isPierce ? 1.26 : isCritical ? 1.32 : isEnemyCounter || isCounter ? 1.24 : isSplash ? 1.16 : isCombo ? 1.14 : 1.08;
  const floatEmphasize = isExecute || isCritical || isCounter || isEnemyCounter || isCombo || isPierce || isFreeze || isStun || isSplash;
  return {
    cueKey: cue.cueKey,
    isCritical,
    hitStopMs: isCritical ? 172 : 86,
    screenShake: {
      enabled: isCritical,
      amplitude: (isCritical ? 11 : 0) * safeScale,
      durationMs: isCritical ? 156 : 0,
    },
    defenderRecoil: {
      distanceX: (isCritical ? 204 : 156) * safeScale,
      liftY: (isCritical ? 36 : 28) * safeScale,
      durationMs: isCritical ? 210 : 150,
    },
    slash: {
      width: (isCritical ? 176 : 126) * safeScale,
      height: (isCritical ? 102 : 72) * safeScale,
      lineWidth: Math.max(2, (isCritical ? 4.2 : 2.4) * safeScale),
      opacity: isCritical ? 242 : 198,
      primary: isCritical
        ? { r: 255, g: 78, b: 52, a: 228 }
        : { r: 236, g: 63, b: 48, a: 188 },
      secondary: isCritical
        ? { r: 255, g: 222, b: 102, a: 190 }
        : { r: 246, g: 198, b: 92, a: 128 },
    },
    floatingText: {
      fontSize: floatFontBase * safeScale,
      width: (isCritical ? 236 : isCounter ? 212 : 168) * safeScale,
      height: (isCritical ? 50 : isCounter ? 44 : 36) * safeScale,
      riseY: (isCritical ? 52 : isCounter ? 44 : 30) * safeScale,
      popScale: floatPop,
      color: floatColor,
      emphasize: floatEmphasize,
    },
  };
}

export function isBattleImpactCritical(cue: BattleActionPresentationCue): boolean {
  return cue.isCritical
    || /\bcrit\b/i.test(cue.label)
    || cue.label.includes('暴击')
    || cue.displayValue.includes('暴击');
}
