import {
  Node,
  Size,
  UITransform,
  view,
} from 'cc';
import { clamp, type UiLayout } from './lobby/LobbyHudTypes';
import { currentDesignHeight, viewportCssSize } from '../app/ScreenAdapter';

interface StageBounds {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** Root 只提供场景节点；布局模块不直接关心登录、HUD 或接口。 */
export interface AdaptiveStageLayoutHost {
  node: Node;
}

export const LOGIN_REFERENCE_WIDTH = 1920;
export const LOGIN_REFERENCE_HEIGHT = 1080;
export const LOGIN_STAGE_NODE_NAMES = ['Login_BG_Poster', 'Login_BG_Video'] as const;
export const MIN_VISIBLE_WIDTH = 320;
export const MIN_VISIBLE_HEIGHT = 180;

/**
 * 根据当前可视窗口和舞台节点尺寸计算统一 UI 坐标系。
 *
 * 登录页和大厅 HUD 都依赖这里给出的 safeLeft/safeRight/safeTop/safeBottom，
 * 所以后续做多分辨率适配时优先改这个模块和 check-layout 的镜像公式。
 */
export class AdaptiveStageLayoutResolver {
  constructor(private readonly host: AdaptiveStageLayoutHost) {}

  resolve(): UiLayout {
    const visibleSize = this.visibleSize();
    const runtimeSize = this.runtimeWindowSize();
    const width = Math.max(MIN_VISIBLE_WIDTH, visibleSize.width);
    const height = Math.max(MIN_VISIBLE_HEIGHT, visibleSize.height);
    const viewportWidth = Math.max(MIN_VISIBLE_WIDTH, runtimeSize?.width ?? width);
    const viewportHeight = Math.max(MIN_VISIBLE_HEIGHT, runtimeSize?.height ?? height);
    const stage = this.resolveStageBounds(width, height);
    const stageWidth = stage.width;
    const stageHeight = stage.height;
    // 参考尺寸跟随设计高(电脑 1920×1080 / 手机 1280×720):手机设计高 720 时 uiScale 仍可到 1,界面相对屏幕放大 1.5 倍。
    const referenceHeight = currentDesignHeight();
    const referenceWidth = referenceHeight * (LOGIN_REFERENCE_WIDTH / LOGIN_REFERENCE_HEIGHT);
    const uiScale = Math.min(1, stageWidth / referenceWidth, stageHeight / referenceHeight);
    const stageLeft = stage.centerX - stageWidth / 2;
    const stageRight = stage.centerX + stageWidth / 2;
    const stageTop = stage.centerY + stageHeight / 2;
    const stageBottom = stage.centerY - stageHeight / 2;
    // 安全边距按舞台尺寸缩放，并设置上下限，避免极小屏幕 UI 被挤出舞台。
    const safeInsetX = clamp(stageWidth * 0.035, 12, 68 * Math.max(uiScale, 0.75));
    const safeInsetY = clamp(stageHeight * 0.035, 10, 54 * Math.max(uiScale, 0.75));
    const safeLeft = stageLeft + safeInsetX;
    const safeRight = stageRight - safeInsetX;
    const safeTop = stageTop - safeInsetY;
    const safeBottom = stageBottom + safeInsetY;
    const safeWidth = Math.max(120 * uiScale, safeRight - safeLeft);
    const safeHeight = Math.max(100 * uiScale, safeTop - safeBottom);
    const contentWidth = Math.max(260 * uiScale, safeWidth);
    return {
      width,
      height,
      viewportWidth,
      viewportHeight,
      stageWidth,
      stageHeight,
      stageLeft,
      stageRight,
      stageTop,
      stageBottom,
      safeLeft,
      safeRight,
      safeTop,
      safeBottom,
      safeWidth,
      safeHeight,
      safeInsetX,
      safeInsetY,
      uiScale,
      contentWidth,
      topY: safeTop - 48 * uiScale,
      inputHeight: 46 * uiScale,
      buttonHeight: 48 * uiScale,
      statusWidth: Math.min(contentWidth, 760 * uiScale),
      bodyFont: Math.max(13, 18 * uiScale),
    };
  }

  private resolveStageBounds(visibleWidth: number, visibleHeight: number): StageBounds {
    const stageNode = this.findStageNode();
    const transform = stageNode?.getComponent(UITransform);
    if (stageNode && transform) {
      // 如果背景舞台有缩放，以舞台节点的实际显示范围作为 UI 可用范围。
      const nodeScale = stageNode.scale;
      const contentSize = transform.contentSize;
      const stageWidth = Math.min(visibleWidth, Math.abs(contentSize.width * nodeScale.x));
      const stageHeight = Math.min(visibleHeight, Math.abs(contentSize.height * nodeScale.y));
      return {
        width: Math.max(MIN_VISIBLE_WIDTH, stageWidth),
        height: Math.max(MIN_VISIBLE_HEIGHT, stageHeight),
        centerX: stageNode.position.x,
        centerY: stageNode.position.y,
      };
    }
    return {
      width: visibleWidth,
      height: visibleHeight,
      centerX: 0,
      centerY: 0,
    };
  }

  private findStageNode(): Node | null {
    for (const name of LOGIN_STAGE_NODE_NAMES) {
      const stageNode = this.host.node.getChildByName(name);
      if (stageNode?.activeInHierarchy) {
        return stageNode;
      }
    }
    return null;
  }

  private visibleSize(): Size {
    const size = view.getVisibleSize();
    const width = Math.round(size.width || 0);
    const height = Math.round(size.height || 0);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return new Size(width, height);
    }
    const runtimeSize = this.runtimeWindowSize();
    if (runtimeSize) {
      return runtimeSize;
    }
    // 编辑器或测试环境拿不到窗口尺寸时，回落到参考分辨率。
    return new Size(LOGIN_REFERENCE_WIDTH, LOGIN_REFERENCE_HEIGHT);
  }

  private runtimeWindowSize(): Size | null {
    // 读引擎的视口尺寸(手机竖握被旋转成横屏时已对调宽高);window.innerWidth/innerHeight 旋转时仍是竖向数值,不能用。
    const size = viewportCssSize();
    return size ? new Size(size.width, size.height) : null;
  }
}
