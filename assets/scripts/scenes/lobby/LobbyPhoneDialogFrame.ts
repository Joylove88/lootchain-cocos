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
 * 在 node 上画全屏弹框底(node 的中心即弹框中心)。headerH > 0 时在顶部画标题带 + 金线分隔。
 * 2026-10-04 美化(用户「这几个界面需要美化」,几何不变,只加层次):
 * - 标题带:自上而下的暖色渐隐(多条细带叠出渐变)+ 顶沿高光;
 * - 分隔线:中段亮、两端渐隐的金线(bt_frame_v2) + 中心 / 两翼小菱形;
 * - 外框:亮金外线 + 暗金内线,四角加粗折角(哥特框的"包角"),角内小菱形。
 * 菱形挂子节点单独 fill(实测同一 Graphics 先 stroke 后 fill 会吞描边),所以本函数里所有 fill 都排在 stroke 之前。
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
  const left = -width / 2;
  const top = height / 2;
  g.fillColor = rgba(13, 10, 10, 250);
  g.roundRect(left, -height / 2, width, height, radius);
  g.fill();
  const headerBottom = top - 6 - headerH;
  if (headerH > 0) {
    g.fillColor = rgba(30, 21, 15, 240);
    g.roundRect(left + 6, headerBottom, width - 12, headerH, 10);
    g.fill();
    // 暖色渐隐:顶部最亮,向分隔线淡出
    const bands = 9;
    const bandH = (headerH - 8) / bands;
    for (let i = 0; i < bands; i++) {
      g.fillColor = rgba(92, 44, 22, Math.round(120 * (1 - i / bands) ** 1.6));
      g.rect(left + 10, top - 10 - (i + 1) * bandH, width - 20, bandH + 0.5);
      g.fill();
    }
    g.fillColor = rgba(255, 226, 160, 40);
    g.rect(left + 18, top - 11, width - 36, 1.5);
    g.fill();
    // 标题带下方的落影(正文区顶部压暗一条,标题带有"浮起"感)
    for (let i = 0; i < 5; i++) {
      g.fillColor = rgba(0, 0, 0, 70 - i * 14);
      g.rect(left + 8, headerBottom - (i + 1) * 4, width - 16, 4);
      g.fill();
    }
    // 分隔线:两端渐隐
    const lineW = width - 48;
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      const t = Math.abs((i + 0.5) / segs - 0.5) * 2;
      g.fillColor = rgba(226, 180, 100, Math.round(235 * (1 - t * t * 0.82)));
      g.rect(left + 24 + (lineW / segs) * i, headerBottom - 1, lineW / segs + 0.5, 2.4);
      g.fill();
    }
  }
  g.strokeColor = rgba(214, 168, 92, 235);
  g.lineWidth = 2.4;
  g.roundRect(left, -height / 2, width, height, radius);
  g.stroke();
  g.strokeColor = rgba(120, 92, 48, 200);
  g.lineWidth = 1;
  g.roundRect(left + 6, -height / 2 + 6, width - 12, height - 12, radius - 4);
  g.stroke();
  // 四角包角:沿内线加粗的折角
  const arm = 46;
  const inset = 6;
  g.strokeColor = rgba(240, 198, 118, 245);
  g.lineWidth = 3.2;
  ([[-1, 1], [1, 1], [-1, -1], [1, -1]] as Array<[number, number]>).forEach(([sx, sy]) => {
    const cx = sx * (width / 2 - inset);
    const cy = sy * (height / 2 - inset);
    g.moveTo(cx - sx * arm, cy);
    g.lineTo(cx - sx * 6, cy);
    g.lineTo(cx, cy - sy * 6);
    g.lineTo(cx, cy - sy * arm);
    g.stroke();
  });
  const corner = 18;
  const gems: Array<[number, number, number, number]> = [
    [0, height / 2, 11, 6],
    [0, -height / 2, 9, 5],
    [-width / 2 + corner, height / 2 - corner, 6, 6],
    [width / 2 - corner, height / 2 - corner, 6, 6],
    [-width / 2 + corner, -height / 2 + corner, 6, 6],
    [width / 2 - corner, -height / 2 + corner, 6, 6],
  ];
  if (headerH > 0) {
    gems.push([0, headerBottom, 9, 5], [-width * 0.2, headerBottom, 5, 3.5], [width * 0.2, headerBottom, 5, 3.5]);
  }
  gems.forEach(([x, y, rx, ry], index) => {
    const gem = host.addChildPlainNode(node, `PhoneFrameGem_${index}`, x, y, rx * 2, ry * 2);
    const gg = gem.addComponent(Graphics);
    gg.fillColor = index < 2 || index >= 6 ? rgba(236, 196, 118, 250) : rgba(190, 146, 78, 230);
    gg.moveTo(0, ry);
    gg.lineTo(rx, 0);
    gg.lineTo(0, -ry);
    gg.lineTo(-rx, 0);
    gg.close();
    gg.fill();
  });
}
