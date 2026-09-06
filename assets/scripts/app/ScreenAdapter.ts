import { ResolutionPolicy, view } from 'cc';

/**
 * H5/PC 全屏适配(2026-09-06):设计分辨率跟随视口方向与比例动态设置,画布始终填满屏幕。
 *
 * 旧问题:设计分辨率固定 1920×1080 + SHOW_ALL,竖屏手机按宽缩放后画面只剩中间一条,上下大黑边。
 * 方案:横屏锚定高 1080(宽=1080×aspect),竖屏锚定宽 750(高=750/aspect),SHOW_ALL 下比例一致无黑边;
 * UI 全部是代码布局(AdaptiveStageLayoutResolver 读 visibleSize),桌面/紧凑/微型分档自动接管。
 * 竖屏逻辑宽 750(<900)恰好落在紧凑档,与手机 UI 形态一致。
 * 极端比例 clamp,超出部分接受少量黑边。每帧调用(读 innerWidth 极廉价),尺寸未变直接返回。
 */
const LANDSCAPE_DESIGN_HEIGHT = 1080;
const PORTRAIT_DESIGN_WIDTH = 750;
const MAX_DESIGN_WIDTH = 2800;
const MAX_DESIGN_HEIGHT = 2200;

export function syncDesignResolutionToViewport(): void {
  const runtime = globalThis as { innerWidth?: number; innerHeight?: number };
  const width = Math.round(runtime.innerWidth || 0);
  const height = Math.round(runtime.innerHeight || 0);
  if (!(width > 0 && height > 0)) {
    return;
  }
  const aspect = width / height;
  let designWidth: number;
  let designHeight: number;
  if (aspect >= 1) {
    designHeight = LANDSCAPE_DESIGN_HEIGHT;
    designWidth = Math.min(MAX_DESIGN_WIDTH, Math.round(LANDSCAPE_DESIGN_HEIGHT * aspect));
  } else {
    designWidth = PORTRAIT_DESIGN_WIDTH;
    designHeight = Math.min(MAX_DESIGN_HEIGHT, Math.round(PORTRAIT_DESIGN_WIDTH / aspect));
  }
  const current = view.getDesignResolutionSize();
  if (Math.abs(current.width - designWidth) <= 1 && Math.abs(current.height - designHeight) <= 1) {
    return;
  }
  view.setDesignResolutionSize(designWidth, designHeight, ResolutionPolicy.SHOW_ALL);
}
