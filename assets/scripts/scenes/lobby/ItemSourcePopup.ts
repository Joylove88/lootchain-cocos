import { BlockInputEvents, Button, Color, HorizontalTextAlignment, Label, Node, Size, view } from 'cc';
import { mountRefButton, mountRefOrnateDialog, mountRefSliced, mountRefSlicedByWidth, mountRefSolid, mountRefTitleBand, REF_CLOSE_ASSET, REF_CLOSE_RING_ASSET, REF_DETAIL, REF_ICON_RING_ASSET, REF_ROW, REF_ULT, type RefKitHost } from '../UiRefKit';
import { DAILY_THEME_OPEN_DAYS, dailyThemeOpenToday, resolveItemSourceRoutes, type ItemSourceTarget } from './ItemSourceRoutes';

/**
 * 获取途径小窗(2026-10-25 策划审核 P1-7 / P1-8,docs/45 §6-7):卡点时告诉玩家去哪拿。
 * 视觉沿用已确认的样式:终极技能弹窗的雕花金框 + 红标题带,途径行 = 背包物品详情「获取途径」行(圆徽 + 文字 + 右侧按钮)。
 * 挂在内容根最上层;整页重建会清掉它(等同关闭)。
 */
export interface ItemSourcePopupHost extends RefKitHost {
  navigateItemSource(target: ItemSourceTarget): void;
}

export interface ItemSourcePopupOptions {
  /** 跳转表键:物品编码 / FRAGMENT:<heroCode> / GOLD / LEVEL_CAP。 */
  key: string;
  /** 标题里的物品名。 */
  name: string;
  /** 碎片用:英雄稀有度。 */
  rarity?: string;
  /** 顶部一行"持有 a / 需要 b"(都给才显示)。 */
  owned?: number;
  need?: number;
  /** 顶部一行自定义说明(等级上限等不是"持有 / 需要"的场景)。 */
  note?: string;
  /** 玩家主动关闭(点遮罩 / X / 前往)时回调;整页重建清掉节点不算关闭(宿主据此在重建后恢复小窗)。 */
  onClose?: () => void;
}

const POPUP_NAME = 'ItemSourcePopup';

export function closeItemSourcePopup(root: Node): void {
  root.getChildByName(POPUP_NAME)?.destroy();
}

export function openItemSourcePopup(host: ItemSourcePopupHost, root: Node, options: ItemSourcePopupOptions): void {
  closeItemSourcePopup(root);
  const routes = resolveItemSourceRoutes(options.key, options.rarity ?? '').slice(0, 4);
  const vis = view.getVisibleSize();
  // 设计稿 1600 × 900;手机横屏可视区更矮,按短边放大到不小于 1(字号下限 20)
  const u = Math.max(1, Math.min(vis.width / 1600, vis.height / 900) * 1.15);
  const S = (v: number): number => v * u;
  const overlay = host.addChildPlainNode(root, POPUP_NAME, 0, 0, vis.width * 2, vis.height * 2);
  overlay.setSiblingIndex(root.children.length - 1);
  overlay.addComponent(BlockInputEvents);
  mountRefSolid(host, overlay, 'Dim', 0, 0, vis.width * 2, vis.height * 2, new Color(0, 0, 0, 150));
  const userClose = (): void => {
    options.onClose?.();
    overlay.destroy();
  };
  overlay.addComponent(Button);
  overlay.on(Button.EventType.CLICK, userClose);

  const rowH = 92;
  const headerH = 122;
  const infoH = options.note || (options.owned !== undefined && options.need !== undefined) ? 56 : 0;
  const listH = Math.max(1, routes.length) * rowH + 24;
  // 雕花金框按素材金线矩形(1507 × 790)等比缩放:弹窗宽高比必须跟它一致,否则框盖不满,标题带会压到框外沿
  const designH = headerH + infoH + listH + 40;
  const w = S(Math.max(820, designH * 1507 / 790));
  const h = S(Math.max(designH, 820 * 790 / 1507));
  const dialog = mountRefOrnateDialog(host, overlay, 'Dialog', 0, 0, w, h, u);
  dialog.node.addComponent(BlockInputEvents);
  const top = h / 2;
  mountRefTitleBand(host, dialog.node, 'TitleBand', 0, top - S(46), S(520), S(84), u);
  const title = host.addChildLabel(dialog.node, 'Title', `获取途径 · ${options.name}`, 0, top - S(50), S(32), new Color(255, 232, 170), new Size(S(460), S(44)));
  title.overflow = Label.Overflow.SHRINK;
  title.isBold = true;
  const close = host.addChildPlainNode(dialog.node, 'Close', w / 2 - S(40), top - S(40), S(56), S(56));
  host.addSprite('Ring', REF_CLOSE_RING_ASSET, 0, 0, S(56), S(56), close);
  host.addSprite('X', REF_CLOSE_ASSET, 0, 0, S(30), S(30), close);
  close.addComponent(Button);
  close.on(Button.EventType.CLICK, userClose);
  host.applyImageButtonFeedback(close);

  let cursor = top - S(headerH);
  if (infoH > 0) {
    const lack = options.owned !== undefined && options.need !== undefined && options.owned < options.need;
    const text = options.note ?? `持有 ${formatCount(options.owned ?? 0)} / 需要 ${formatCount(options.need ?? 0)}`;
    const info = host.addChildLabel(dialog.node, 'Info', text, 0, cursor - S(infoH / 2), S(24), lack ? new Color(255, 140, 120) : new Color(236, 222, 190), new Size(w - S(120), S(34)));
    info.overflow = Label.Overflow.SHRINK;
    cursor -= S(infoH);
  }
  if (routes.length === 0) {
    const empty = host.addChildLabel(dialog.node, 'Empty', '暂无可前往的获取途径', 0, cursor - S(rowH / 2), S(24), new Color(190, 176, 150), new Size(w - S(120), S(34)));
    empty.overflow = Label.Overflow.SHRINK;
    return;
  }
  const rowW = w - S(110);
  routes.forEach((route, index) => {
    const cy = cursor - S(12) - S(rowH / 2) - index * S(rowH);
    const row = host.addChildPlainNode(dialog.node, `Row_${index}`, 0, cy, rowW, S(rowH - 12));
    if (!mountRefSlicedByWidth(host, row, 'Bg', REF_ULT.costRow, 0, 0, rowW, S(rowH - 12))) {
      mountRefSliced(host, row, 'Bg', REF_ROW, 0, 0, rowW, S(rowH - 12));
    }
    const medal = S(64);
    const medalX = -rowW / 2 + S(52);
    if (!host.addSprite('Medal', REF_DETAIL.sourceIcon(route.kind), medalX, 0, medal, medal, row)) {
      host.addSprite('Ring', REF_ICON_RING_ASSET, medalX, 0, medal * 0.9, medal * 0.9, row);
    }
    const textX = medalX + medal / 2 + S(16);
    const textW = rowW - S(52) - medal / 2 - S(16) - S(190);
    const name = host.addChildLabel(row, 'Title', route.title, textX, S(14), S(24), new Color(250, 236, 206), new Size(textW, S(30)), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    name.isBold = true;
    const daily = route.target.type === 'daily' ? route.target.theme : null;
    const closedToday = daily ? !dailyThemeOpenToday(daily) : false;
    const desc = closedToday && daily ? `${route.desc} · ${DAILY_THEME_OPEN_DAYS[daily].label}` : route.desc;
    const descLabel = host.addChildLabel(row, 'Desc', desc, textX, -S(16), S(20), new Color(196, 182, 152), new Size(textW, S(26)), HorizontalTextAlignment.LEFT);
    descLabel.overflow = Label.Overflow.SHRINK;
    const target = route.target;
    mountRefButton(host, row, 'Go', closedToday ? '未开放' : '前往', rowW / 2 - S(96), 0, S(150), S(56), u, closedToday ? 'disabled' : 'secondary', closedToday ? undefined : () => {
      userClose();
      host.navigateItemSource(target);
    }, { fontSize: S(24) });
  });
}

function formatCount(value: number): string {
  const n = Math.max(0, Math.round(value));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
