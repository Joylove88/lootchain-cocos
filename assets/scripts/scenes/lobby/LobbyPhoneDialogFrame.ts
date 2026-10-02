import { Graphics, Node } from 'cc';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 手机横屏全屏弹框(2026-10-02 用户:「横屏模式下弹框都调整成全屏」)的公共外框。
 * 只在 isPhoneDesign() 分支里用;电脑 / 平板仍走各弹框原来的居中素材框。
 * - 尺寸:铺满舞台,左右各留安全边距的 40%(内容区再缩进 PHONE_DIALOG_CONTENT_PAD,合计约等于 HUD 安全边距),上下各留 8。
 * - 外框:原弹框底 refine_panel_bg / 任务恶魔框都是一体构图(4:3、3:2),不能非等比拉成约 2.16:1,
 *   所以手机全屏框改程序绘制:黑曜石底 + 双层细金线 + 四角 / 顶底中心小菱形(与原框的细金线 + 顶饰风格一致)。
 */
export const PHONE_DIALOG_CONTENT_PAD = 32;

export interface PhoneDialogRect {
  width: number;
  height: number;
}

export function resolvePhoneDialogSize(layout: UiLayout): PhoneDialogRect {
  return phoneDialogSizeForStage(layout.stageWidth, layout.stageHeight, layout.safeInsetX);
}

/** 只拿得到舞台宽高的弹层(挂在全屏功能页里的子弹框)用;safeInsetX 缺省按 AdaptiveStageLayoutResolver 同一公式估。 */
export function phoneDialogSizeForStage(stageWidth: number, stageHeight: number, safeInsetX?: number): PhoneDialogRect {
  const insetX = safeInsetX ?? Math.max(12, Math.min(stageWidth * 0.035, 68));
  const marginX = Math.max(12, insetX * 0.4);
  const marginY = 8;
  return {
    width: Math.max(320, stageWidth - marginX * 2),
    height: Math.max(240, stageHeight - marginY * 2),
  };
}

/**
 * 在 node 上画全屏弹框底(node 的中心即弹框中心)。headerH > 0 时在顶部画一条略亮的标题带 + 金线分隔。
 * 菱形挂子节点单独 fill(实测同一 Graphics 先 stroke 后 fill 会吞描边)。
 */
export function drawPhoneDialogFrame(
  host: { addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node },
  node: Node,
  width: number,
  height: number,
  headerH = 0,
): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  const radius = 14;
  g.fillColor = rgba(13, 10, 10, 250);
  g.roundRect(-width / 2, -height / 2, width, height, radius);
  g.fill();
  if (headerH > 0) {
    g.fillColor = rgba(36, 25, 16, 235);
    g.roundRect(-width / 2 + 6, height / 2 - 6 - headerH, width - 12, headerH, 10);
    g.fill();
    g.fillColor = rgba(214, 168, 92, 170);
    g.rect(-width / 2 + 24, height / 2 - 6 - headerH, width - 48, 2);
    g.fill();
  }
  g.strokeColor = rgba(214, 168, 92, 235);
  g.lineWidth = 2.4;
  g.roundRect(-width / 2, -height / 2, width, height, radius);
  g.stroke();
  g.strokeColor = rgba(120, 92, 48, 200);
  g.lineWidth = 1;
  g.roundRect(-width / 2 + 6, -height / 2 + 6, width - 12, height - 12, radius - 4);
  g.stroke();
  const corner = 18;
  const gems: Array<[number, number, number, number]> = [
    [0, height / 2, 11, 6],
    [0, -height / 2, 9, 5],
    [-width / 2 + corner, height / 2 - corner, 6, 6],
    [width / 2 - corner, height / 2 - corner, 6, 6],
    [-width / 2 + corner, -height / 2 + corner, 6, 6],
    [width / 2 - corner, -height / 2 + corner, 6, 6],
  ];
  gems.forEach(([x, y, rx, ry], index) => {
    const gem = host.addChildPlainNode(node, `PhoneFrameGem_${index}`, x, y, rx * 2, ry * 2);
    const gg = gem.addComponent(Graphics);
    gg.fillColor = index < 2 ? rgba(230, 188, 110, 245) : rgba(190, 146, 78, 230);
    gg.moveTo(0, ry);
    gg.lineTo(rx, 0);
    gg.lineTo(0, -ry);
    gg.lineTo(-rx, 0);
    gg.close();
    gg.fill();
  });
}
