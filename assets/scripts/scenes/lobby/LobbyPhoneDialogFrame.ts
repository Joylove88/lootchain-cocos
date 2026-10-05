import { Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UITransform } from 'cc';
import { rgba, type UiLayout } from './LobbyHudTypes';

/** 全屏弹框的实景背景(与背包页同一张血色大教堂,1920×1080;等比铺满后由遮罩裁掉上下)。 */
const PHONE_DIALOG_BACKDROP_ASSET = 'ui/battle/ai/battle_bg_cathedral/spriteFrame';
const PHONE_DIALOG_BACKDROP_ASPECT = 1920 / 1080;
/** 左上角标题牌(与英雄 / 背包等功能页同款,596×201 一体构图,只能等比)。 */
const PHONE_DIALOG_TITLE_BANNER_ASSET = 'ui/common/ai/title_banner_new/spriteFrame';

export interface PhoneDialogFrameHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite?(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | Node | null;
  addChildLabel?(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, contentSize: Size, horizontalAlign?: HorizontalTextAlignment): Label;
}

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
  host: PhoneDialogFrameHost,
  node: Node,
  width: number,
  height: number,
  headerH = 0,
): void {
  // 2026-10-05 用户「旋转宝箱 / 水晶 / 任务界面都没有背景 UI」:垫一张实景背景(等比铺满 + 遮罩裁切),
  // 外框与压暗画在它上面的子节点里;背景图还没读到时退回原来的纯色底。
  let frameNode = node;
  let hasBackdrop = false;
  if (host.addSprite) {
    const clip = host.addChildPlainNode(node, 'PhoneFrameBackdrop', 0, 0, width - 10, height - 10);
    const coverW = Math.max(width, height * PHONE_DIALOG_BACKDROP_ASPECT);
    const art = host.addSprite('Art', PHONE_DIALOG_BACKDROP_ASSET, 0, 0, coverW, coverW / PHONE_DIALOG_BACKDROP_ASPECT, clip);
    if (art) {
      clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      hasBackdrop = true;
      frameNode = host.addChildPlainNode(node, 'PhoneFrameArt', 0, 0, width, height);
    } else {
      clip.destroy();
    }
  }
  const g = frameNode.getComponent(Graphics) ?? frameNode.addComponent(Graphics);
  const radius = 14;
  const left = -width / 2;
  const top = height / 2;
  g.fillColor = hasBackdrop ? rgba(6, 4, 7, 186) : rgba(13, 10, 10, 250);
  g.roundRect(left, -height / 2, width, height, radius);
  g.fill();
  const headerBottom = top - 6 - headerH;
  if (headerH > 0) {
    // 2026-10-05 用户「上面部分还是不太好看」:去掉方盒子式的标题带(实底 + 落影 + 三颗菱形),
    // 改成自上而下的柔和压暗(保证标题 / 货币可读)+ 一条两端渐隐的金线,中间一颗小菱形。
    const fadeH = headerH + 26;
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      g.fillColor = rgba(8, 5, 6, Math.round(170 * (1 - t) ** 1.4));
      g.rect(left + 6, top - 6 - (i + 1) * (fadeH / bands), width - 12, fadeH / bands + 0.5);
      g.fill();
    }
    // 顶沿一丝暖色高光
    g.fillColor = rgba(255, 214, 140, 34);
    g.rect(left + 60, top - 9, width - 120, 1.5);
    g.fill();
    // 分隔线:占 86% 宽,两端渐隐
    const lineW = width * 0.86;
    const segs = 32;
    for (let i = 0; i < segs; i++) {
      const t = Math.abs((i + 0.5) / segs - 0.5) * 2;
      g.fillColor = rgba(226, 182, 104, Math.round(220 * (1 - t) ** 1.3));
      g.rect(-lineW / 2 + (lineW / segs) * i, headerBottom - 1, lineW / segs + 0.5, 2);
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
    if (headerH > 0 && sx < 0 && sy > 0) {
      // 左上角是标题牌的位置,不画包角(免得压在徽记上)
      return;
    }
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
    ...(headerH > 0 ? [] : [[-width / 2 + corner, height / 2 - corner, 6, 6] as [number, number, number, number]]),
    [width / 2 - corner, height / 2 - corner, 6, 6],
    [-width / 2 + corner, -height / 2 + corner, 6, 6],
    [width / 2 - corner, -height / 2 + corner, 6, 6],
  ];
  if (headerH > 0) {
    gems.push([0, headerBottom, 8, 4.5]);
  }
  gems.forEach(([x, y, rx, ry], index) => {
    const gem = host.addChildPlainNode(frameNode, `PhoneFrameGem_${index}`, x, y, rx * 2, ry * 2);
    const gg = gem.addComponent(Graphics);
    gg.fillColor = index < 2 || index >= 5 ? rgba(236, 196, 118, 250) : rgba(190, 146, 78, 230);
    gg.moveTo(0, ry);
    gg.lineTo(rx, 0);
    gg.lineTo(0, -ry);
    gg.lineTo(-rx, 0);
    gg.close();
    gg.fill();
  });
}

/**
 * 全屏弹框左上角标题牌(与英雄 / 背包页的左上标题同款,2026-10-05 用户:弹框标题统一成这个样式)。
 * 牌心在弹框顶边下方 centerDrop 处;返回标题牌右缘 x(弹框坐标),调用方可在其右侧接着排页签 / 货币。
 */
export function addPhoneDialogTitle(host: PhoneDialogFrameHost, panel: Node, width: number, height: number, title: string, centerDrop = 42, scale = 1.05): number {
  const bannerW = Math.max(250 * scale, title.length * 52 * scale + 72 * scale);
  const bannerH = bannerW * (201 / 596);
  const x = -width / 2 + 8 + bannerW / 2;
  const y = height / 2 - centerDrop;
  const banner = host.addSprite?.('PhoneDialogTitleBanner', PHONE_DIALOG_TITLE_BANNER_ASSET, x, y, bannerW, bannerH, panel) ?? null;
  if (host.addChildLabel) {
    const label = host.addChildLabel(panel, 'PhoneDialogTitle', title, banner ? x + bannerW * 0.09 : x, y + bannerH * 0.02, 26 * scale, rgba(250, 222, 158), new Size(bannerW * 0.56, 40 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 220);
    label.outlineWidth = 2;
    label.node.getComponent(UITransform)?.setContentSize(bannerW * 0.56, 40 * scale);
  }
  return x - bannerW / 2 + bannerW * 0.95;
}
