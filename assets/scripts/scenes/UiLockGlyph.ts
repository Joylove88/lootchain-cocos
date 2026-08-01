// 双件挂锁组件(2026-07-24,ui/common/ai/unlock_body 锁身 + unlock_head 锁梁):
// locked = 锁梁扣合沉入锁身;unlocked = 锁梁上抬留缝并微倾(参考图摆位)。
// 所有"锁定/未锁定"状态图记统一走这里:洗练词条行/技能锁定行/召唤锁定池等。
import { Node, Sprite } from 'cc';

export const LOCK_BODY_ASSET = 'ui/common/ai/unlock_body/spriteFrame';
export const LOCK_HEAD_ASSET = 'ui/common/ai/unlock_head/spriteFrame';

export interface LockGlyphHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
}

/** 渲染挂锁;素材未就绪返回 null(调用方自兜底)。height=整锁高度。 */
export function renderLockGlyph(host: LockGlyphHost, parent: Node, name: string, x: number, y: number, height: number, locked: boolean): Node | null {
  const holder = host.addChildPlainNode(parent, name, x, y, height, height);
  const bodyH = height * 0.6;
  const bodyW = bodyH * (313 / 283);
  const headH = height * 0.48;
  const headW = headH * (216 / 198);
  const bodyCenterY = -height / 2 + bodyH / 2;
  const bodyTop = -height / 2 + bodyH;
  // 先画锁梁再画锁身:锁定态锁梁下段沉入锁身之后。
  const headY = locked ? bodyTop + headH * 0.3 : bodyTop + height * 0.07 + headH * 0.5;
  const headX = locked ? 0 : bodyW * 0.05;
  const head = host.addSprite(`${name}Head`, LOCK_HEAD_ASSET, headX, headY, headW, headH, holder);
  if (head && !locked) {
    head.node.angle = -12;
  }
  const body = host.addSprite(`${name}Body`, LOCK_BODY_ASSET, 0, bodyCenterY, bodyW, bodyH, holder);
  if (!body) {
    holder.destroy();
    return null;
  }
  return holder;
}
