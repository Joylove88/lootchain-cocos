import { director, game, sys, view } from 'cc';
import { HTML5 } from 'cc/env';

/**
 * 画面设置(2026-10-05 用户:「设置里加个画面设置,流畅模式 / 极致模式;帧率 30 / 60 / 120 切换」)。
 * - 流畅:降低渲染分辨率(手机高分屏最吃性能的一项)、减少同屏特效与伤害飘字;切到流畅时帧率默认改 30。
 * - 极致:原始分辨率(引擎上限 2 倍屏)、特效全开;切到极致时帧率默认改 60。
 * - 帧率单独可调:30 / 60 / 120(120 需要高刷屏,普通屏实际仍是 60)。
 * 默认:手机 = 流畅 + 30 帧,电脑 = 极致 + 60 帧。存 localStorage,启动时套用。
 */
export type GraphicsMode = 'smooth' | 'ultra';
export const GRAPHICS_FRAME_RATES = [30, 60, 120] as const;

const MODE_KEY = 'lootchain.graphics.mode';
const FPS_KEY = 'lootchain.graphics.fps';
/** 流畅模式的渲染倍率上限(相对 CSS 像素;极致 = 设备原始值,引擎自己封顶 2)。 */
const SMOOTH_PIXEL_RATIO = 1.25;

export interface GraphicsCaps {
  /** 同屏骨骼普攻弹体上限(超额走轻量光弹)。 */
  spineProjectiles: number;
  /** 同屏骨骼命中特效上限(超额走爆闪)。 */
  spineHitFx: number;
  /** 同屏伤害飘字上限:小字 / 大字。 */
  floatersSmall: number;
  floatersBig: number;
}

const CAPS: Record<GraphicsMode, GraphicsCaps> = {
  smooth: { spineProjectiles: 6, spineHitFx: 4, floatersSmall: 14, floatersBig: 24 },
  ultra: { spineProjectiles: 18, spineHitFx: 14, floatersSmall: 52, floatersBig: 72 },
};

let nativePixelRatio = 0;
let cachedMode: GraphicsMode | null = null;

function read(key: string): string | null {
  try {
    return sys.localStorage.getItem(key);
  } catch (error) {
    void error;
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sys.localStorage.setItem(key, value);
  } catch (error) {
    void error;
  }
}

export function getGraphicsMode(): GraphicsMode {
  if (cachedMode) {
    return cachedMode;
  }
  const saved = read(MODE_KEY);
  cachedMode = saved === 'smooth' || saved === 'ultra' ? saved : (sys.isMobile ? 'smooth' : 'ultra');
  return cachedMode;
}

export function getGraphicsFrameRate(): number {
  const saved = Number(read(FPS_KEY));
  if ((GRAPHICS_FRAME_RATES as readonly number[]).indexOf(saved) >= 0) {
    return saved;
  }
  return getGraphicsMode() === 'smooth' ? 30 : 60;
}

export function graphicsCaps(): GraphicsCaps {
  return CAPS[getGraphicsMode()];
}

/** 切换画面档位:帧率跟着换成该档默认值(流畅 30 / 极致 60),之后玩家可再单独调帧率。 */
export function setGraphicsMode(mode: GraphicsMode): void {
  cachedMode = mode;
  write(MODE_KEY, mode);
  write(FPS_KEY, String(mode === 'smooth' ? 30 : 60));
  applyGraphicsSettings();
}

export function setGraphicsFrameRate(fps: number): void {
  if ((GRAPHICS_FRAME_RATES as readonly number[]).indexOf(fps) < 0) {
    return;
  }
  write(FPS_KEY, String(fps));
  applyGraphicsSettings();
}

/** 套用当前设置:帧率 + 渲染分辨率。启动时调一次,设置变更时再调。 */
export function applyGraphicsSettings(): void {
  try {
    game.frameRate = getGraphicsFrameRate();
  } catch (error) {
    void error;
  }
  applyPixelRatio();
}

/**
 * 渲染分辨率:引擎按 window.devicePixelRatio(封顶 2)定画布像素数,没有公开的调节口;
 * 这里给 window 盖一个可控的 devicePixelRatio 再触发一次 resize,引擎就按新倍率重建画布尺寸。只在网页端做。
 */
function applyPixelRatio(): void {
  if (!HTML5 || typeof window === 'undefined') {
    return;
  }
  try {
    if (!nativePixelRatio) {
      nativePixelRatio = window.devicePixelRatio || 1;
    }
    const want = getGraphicsMode() === 'smooth' ? Math.min(nativePixelRatio, SMOOTH_PIXEL_RATIO) : nativePixelRatio;
    if (Math.abs((window.devicePixelRatio || 1) - want) < 0.01) {
      return;
    }
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => want });
    window.dispatchEvent(new Event('resize'));
    // 引擎收到 resize 只改了画布像素数,渲染窗口与视口还按旧倍率(实测画面被放大裁切):
    // 手动让渲染根按新画布尺寸重建,并重算一次适配视口。等引擎先处理完 resize 再做。
    const resync = (): void => {
      try {
        const canvas = game.canvas;
        if (canvas && director.root) {
          director.root.resize(canvas.width, canvas.height);
          const design = view.getDesignResolutionSize();
          view.setDesignResolutionSize(design.width, design.height, view.getResolutionPolicy());
        }
      } catch (error) {
        void error;
      }
    };
    setTimeout(resync, 0);
    setTimeout(resync, 200);
  } catch (error) {
    void error;
  }
}
