import { director, game, sys, view } from 'cc';
import { HTML5 } from 'cc/env';

/**
 * 画面设置(2026-10-05 用户:「设置里加个画面设置,流畅模式 / 极致模式;帧率 30 / 60 / 120 切换」)。
 * - 流畅:手机画布短边 720(主流手游"流畅"档;2026-10-06 之前是 DPR 封顶 1.25 ≈ 515 行,整个画面都糊)、减少同屏特效与伤害飘字;切到流畅时帧率默认改 30。
 * - 极致:手机画布短边 1080(1080p 手机即原生;1440p 手机也只到 1080,再高填充率撑不住)、特效全开;切到极致时帧率默认改 60。
 *   注意引擎网页端自带 DPR 封顶 2(pal/screen-adapter/web:Math.min(devicePixelRatio, 2)),现代手机 DPR 2.6~3.5,封顶后画布只有
 *   物理分辨率的 57%~76%,这就是 2026-10-06 用户「开了极致还是不够清晰」的原因——release-web.mjs 出包时把这个封顶改成读
 *   window.__lcMaxDevicePixelRatio(见 LC_MAX_DEVICE_PIXEL_RATIO);Creator 预览里引擎没打补丁,极致仍封顶 2。
 * - 电脑:流畅 = DPR 封顶 1.25,极致 = 原生 DPR(电脑屏 CSS 短边本来就 ≥ 720,不按短边算)。
 * - 帧率单独可调:30 / 60 / 120(120 需要高刷屏,普通屏实际仍是 60)。
 * 默认:手机 = 流畅 + 30 帧,电脑 = 极致 + 60 帧。存 localStorage,启动时套用。
 */
export type GraphicsMode = 'smooth' | 'ultra';
export const GRAPHICS_FRAME_RATES = [30, 60, 120] as const;

const MODE_KEY = 'lootchain.graphics.mode';
const FPS_KEY = 'lootchain.graphics.fps';
/** 电脑流畅模式的渲染倍率上限(相对 CSS 像素;电脑极致 = 设备原始值,引擎自己封顶 2)。 */
const SMOOTH_PIXEL_RATIO = 1.25;
/** 手机画布短边目标(物理像素行数):流畅 720p / 极致 1080p;都不会超过设备原生 DPR。 */
const PHONE_SHORT_SIDE: Record<GraphicsMode, number> = { smooth: 720, ultra: 1080 };
/** 出包后引擎 DPR 封顶改读 window.__lcMaxDevicePixelRatio(release-web.mjs 打补丁);3 已够 1080p 手机原生,1440p 手机也只需 2.6。 */
export const LC_MAX_DEVICE_PIXEL_RATIO = 3;

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
let pixelRatioApplied = false;
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

/** 目标渲染倍率(相对 CSS 像素):手机按画布短边目标反推,电脑按旧策略;都不超过设备原生值、不低于 1。 */
function desiredPixelRatio(mode: GraphicsMode, native: number): number {
  if (!sys.isMobile) {
    return mode === 'smooth' ? Math.min(native, SMOOTH_PIXEL_RATIO) : native;
  }
  const cssShort = Math.max(1, Math.min(window.innerWidth || 0, window.innerHeight || 0) || 1);
  return Math.min(native, Math.max(1, PHONE_SHORT_SIDE[mode] / cssShort));
}

/**
 * 渲染分辨率:引擎按 window.devicePixelRatio(出包前封顶 2,出包后封顶 LC_MAX_DEVICE_PIXEL_RATIO)定画布像素数,没有公开的调节口;
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
    (window as Window & { __lcMaxDevicePixelRatio?: number }).__lcMaxDevicePixelRatio = LC_MAX_DEVICE_PIXEL_RATIO;
    const want = desiredPixelRatio(getGraphicsMode(), nativePixelRatio);
    // 第一次套用必须走一遍 resize + 重建渲染窗口:引擎可能在封顶值写入前已按旧封顶建好窗口(2026-10-07 极致档画面缩在左下)
    const first = !pixelRatioApplied;
    pixelRatioApplied = true;
    if (!first && Math.abs((window.devicePixelRatio || 1) - want) < 0.01) {
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
