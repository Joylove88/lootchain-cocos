import { HorizontalTextAlignment, Label, UITransform, VerticalTextAlignment, type Node } from 'cc';
import type { UiKitHost } from '../UiKit';
import { GLASS_COLOR, mountGlassButton } from '../UiGlassKit';
import { mountGlassPopupShell } from './GlassPopupShell';

/**
 * 通用二次确认小窗(2026-10-25 docs/45 §17 装备转移确认首用)。
 * 2026-11-11 改 B 毛玻璃(原型 周报截图/2026-11-11_通用小窗/proto/confirm_b.png 1:1):面板 815×433,
 * 标题行 + 居中正文 + 「取消(灰玻璃)/ 确定(香槟金)」两钮。整页重建会清掉它,宿主按 onClose 之前的状态补挂。
 */
export interface ConfirmPopupOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  /** 玩家主动关闭(取消 / ✕ / 点遮罩 / 确定)时回调;整页重建清掉节点不算(宿主据此在重建后补挂)。 */
  onClose?: () => void;
}

export const CONFIRM_POPUP_NAME = 'ConfirmPopup';

export function openConfirmPopup(host: UiKitHost, root: Node, options: ConfirmPopupOptions): void {
  root.getChildByName(CONFIRM_POPUP_NAME)?.destroy();
  let overlay: Node | null = null;
  const close = (): void => {
    options.onClose?.();
    overlay?.destroy();
  };
  const shell = mountGlassPopupShell(host, root, { name: CONFIRM_POPUP_NAME, width: 815, height: 433, title: options.title, onClose: close });
  overlay = shell.overlay;
  const { panel, k, S, X, Y, T } = shell;

  // 正文:三行原型中心 dy 148.5 / 194.5 / 241(行距 46,字号 26),整体中心 dy 195;分隔线与按钮之间可用高约 200
  const body = T(panel, 'Message', options.message, X(407.5), Y(195), 26, GLASS_COLOR.text, S(815 - 170), HorizontalTextAlignment.CENTER);
  body.enableWrapText = true;
  body.overflow = Label.Overflow.SHRINK;
  body.lineHeight = Math.round(S(46));
  body.verticalAlign = VerticalTextAlignment.CENTER;
  body.node.getComponent(UITransform)?.setContentSize(S(815 - 170), S(200));

  // 按钮:取消 647..916 / 确定 955..1225(面板左沿 528),y 519..586
  mountGlassButton(host, panel, 'Cancel', options.cancelText ?? '取消', X(253.5), Y(358.5), S(269), S(67), k, 'secondary', close, 28);
  mountGlassButton(host, panel, 'Confirm', options.confirmText ?? '确定', X(562), Y(358.5), S(270), S(67), k, 'primary', () => {
    close();
    options.onConfirm();
  }, 28);
}
