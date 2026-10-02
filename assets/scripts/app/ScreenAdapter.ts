import { ResolutionPolicy, screen, sys, view } from 'cc';

/**
 * H5/PC 全屏适配——仅横屏(2026-10-02 用户拍板:竖版效果不行、素材不好做,H5 只支持横屏)。
 *
 * - 手机竖握:LootChainGameRoot.start 里 view.setOrientation(LANDSCAPE) 让引擎把 #GameDiv 旋转 90° 显示横屏,
 *   旋转时 window.innerWidth/innerHeight 仍是竖向数值,一律通过 viewportCssSize() 读(它按引擎同一规则对调),其他代码不要直接读。
 * - 设计高:电脑 / 平板 1080;手机(视口短边 < 560 CSS 像素)720——同一套界面在手机上整体放大约 1.5 倍
 *   (2026-10-02 用户拍板「手机整体放大」:1080 设计高缩到 390 像素高的手机屏,18 号字只剩约 6.5 像素,看不清)。
 *   通用 UI 缩放 uiScale 以当前设计高为基准(AdaptiveStageLayoutResolver),所以电脑端完全不变。
 * - 宽 = 设计高 × 宽高比,夹在 [设计高 × 4/3, 设计高 × 2.593](4:3 ~ 约 2.59:1)。
 *   比 4:3 更窄(桌面竖窗、iPad 桌面 UA 竖握不旋转)上下留黑边;比 2.59:1 更宽左右留黑边。
 * - 每帧调用(读尺寸极廉价),尺寸未变直接返回。
 */
export const DESKTOP_DESIGN_HEIGHT = 1080;
export const PHONE_DESIGN_HEIGHT = 720;
const PHONE_SHORT_SIDE_CSS = 560;
const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 2800 / 1080;

/**
 * 视口 CSS 像素尺寸(横屏口径)。
 * 读浏览器窗口 innerWidth/innerHeight;手机竖握时引擎会把画布转成横屏(规则 = isMobile 且 宽 <= 高,与引擎 screen-adapter 一致),此时对调宽高。
 * 不能直接读引擎 screen.windowSize:Creator 预览页的游戏框按设计分辨率比例排版,设计分辨率又按它算,会互相放大(2026-10-02 PC 预览画面被裁切)。
 */
export function viewportCssSize(): { width: number; height: number } | null {
  const runtime = globalThis as { innerWidth?: number; innerHeight?: number };
  let width = runtime.innerWidth || 0;
  let height = runtime.innerHeight || 0;
  if (!(width > 0 && height > 0)) {
    const dpr = screen.devicePixelRatio || 1;
    const windowSize = screen.windowSize;
    width = windowSize ? windowSize.width / dpr : 0;
    height = windowSize ? windowSize.height / dpr : 0;
    if (!(width > 0 && height > 0)) {
      return null;
    }
    return { width: Math.round(width), height: Math.round(height) };
  }
  if (sys.isMobile && width <= height) {
    const swap = width;
    width = height;
    height = swap;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/** 当前设计高(手机 720 / 其余 1080):通用 UI 缩放以它为基准,手机端界面因此整体放大。 */
export function currentDesignHeight(): number {
  const height = view.getDesignResolutionSize().height;
  return height > 0 ? height : DESKTOP_DESIGN_HEIGHT;
}

export function syncDesignResolutionToViewport(): void {
  const size = viewportCssSize();
  if (!size) {
    return;
  }
  const designHeight = Math.min(size.width, size.height) < PHONE_SHORT_SIDE_CSS ? PHONE_DESIGN_HEIGHT : DESKTOP_DESIGN_HEIGHT;
  const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, size.width / size.height));
  const designWidth = Math.round(designHeight * aspect);
  const current = view.getDesignResolutionSize();
  if (Math.abs(current.width - designWidth) <= 1 && Math.abs(current.height - designHeight) <= 1) {
    return;
  }
  view.setDesignResolutionSize(designWidth, designHeight, ResolutionPolicy.SHOW_ALL);
}

/**
 * 输入框编辑中冻结重排:手机弹出软键盘会改窗口尺寸(竖握被旋转时甚至会让画布短暂转回),
 * 若此时同步设计分辨率并重建界面,正在编辑的输入框会被销毁、键盘收起、已输入的字丢失。
 * UiPrimitiveFactory.addEditBox 在 EDITING_DID_BEGAN / DID_ENDED 时登记;失焦后再等 400ms 让键盘收完才恢复。
 */
const focusedInputs = new Set<{ isValid: boolean }>();
let inputReleasedAtMs = 0;
const INPUT_RELEASE_GRACE_MS = 400;

export function markTextInputFocus(owner: { isValid: boolean }, focused: boolean): void {
  if (focused) {
    focusedInputs.add(owner);
  } else if (focusedInputs.delete(owner)) {
    inputReleasedAtMs = Date.now();
  }
}

export function isTextInputActive(): boolean {
  for (const owner of Array.from(focusedInputs)) {
    if (!owner.isValid) {
      focusedInputs.delete(owner);
      inputReleasedAtMs = Date.now();
    }
  }
  return focusedInputs.size > 0 || Date.now() - inputReleasedAtMs < INPUT_RELEASE_GRACE_MS;
}
