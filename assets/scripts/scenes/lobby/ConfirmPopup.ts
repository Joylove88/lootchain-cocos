import { BlockInputEvents, Button, Color, Label, Size, view, type Node } from 'cc';
import { mountRefButton, mountRefOrnateDialog, mountRefSolid, mountRefTitleBand, REF_CLOSE_ASSET, REF_CLOSE_RING_ASSET, type RefKitHost } from '../UiRefKit';

/**
 * 通用二次确认小窗(2026-10-25 docs/45 §17 装备转移确认首用):样式同获取途径小窗(雕花金框 + 红标题带),
 * 正文一段 + 「取消 / 确定」两钮。挂在内容根最上层;整页重建会清掉它(等同取消)。
 */
export interface ConfirmPopupOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
}

const POPUP_NAME = 'ConfirmPopup';

export function openConfirmPopup(host: RefKitHost, root: Node, options: ConfirmPopupOptions): void {
  root.getChildByName(POPUP_NAME)?.destroy();
  const vis = view.getVisibleSize();
  // 设计稿 1600 × 900;手机横屏按短边放大到不小于 1(字号下限 20)
  const u = Math.max(1, Math.min(vis.width / 1600, vis.height / 900) * 1.15);
  const S = (v: number): number => v * u;
  const overlay = host.addChildPlainNode(root, POPUP_NAME, 0, 0, vis.width * 2, vis.height * 2);
  overlay.setSiblingIndex(root.children.length - 1);
  overlay.addComponent(BlockInputEvents);
  mountRefSolid(host, overlay, 'Dim', 0, 0, vis.width * 2, vis.height * 2, new Color(0, 0, 0, 150));
  const close = (): void => { overlay.destroy(); };
  overlay.addComponent(Button);
  overlay.on(Button.EventType.CLICK, close);

  // 雕花金框按素材金线矩形(1507 × 790)等比缩放,标题带才不会压到框外沿
  const w = S(820);
  const h = S(820 * 790 / 1507);
  const dialog = mountRefOrnateDialog(host, overlay, 'Dialog', 0, 0, w, h, u);
  dialog.node.addComponent(BlockInputEvents);
  const top = h / 2;
  mountRefTitleBand(host, dialog.node, 'TitleBand', 0, top - S(46), S(520), S(84), u);
  const title = host.addChildLabel(dialog.node, 'Title', options.title, 0, top - S(50), S(32), new Color(255, 232, 170), new Size(S(460), S(44)));
  title.overflow = Label.Overflow.SHRINK;
  title.isBold = true;
  const x = host.addChildPlainNode(dialog.node, 'Close', w / 2 - S(40), top - S(40), S(56), S(56));
  host.addSprite('Ring', REF_CLOSE_RING_ASSET, 0, 0, S(56), S(56), x);
  host.addSprite('X', REF_CLOSE_ASSET, 0, 0, S(30), S(30), x);
  x.addComponent(Button);
  x.on(Button.EventType.CLICK, close);
  host.applyImageButtonFeedback(x);

  const body = host.addChildLabel(dialog.node, 'Message', options.message, 0, S(6), S(24), new Color(240, 228, 200), new Size(w - S(150), S(150)));
  body.overflow = Label.Overflow.SHRINK;
  body.enableWrapText = true;
  body.lineHeight = S(34);
  const btnY = -h / 2 + S(72);
  mountRefButton(host, dialog.node, 'Cancel', options.cancelText ?? '取消', -S(130), btnY, S(200), S(64), u, 'secondary', close, { fontSize: S(26) });
  mountRefButton(host, dialog.node, 'Confirm', options.confirmText ?? '确定', S(130), btnY, S(200), S(64), u, 'primary', () => {
    close();
    options.onConfirm();
  }, { fontSize: S(26) });
}
