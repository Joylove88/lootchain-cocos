import { Color, Graphics, Label, Node, Size, tween, Vec3, UIOpacity } from 'cc';
import { rgba } from './LobbyHudTypes';

// Stage 13F 飘字层：普攻(黄/白)、暴击(金大)、治疗(绿+)、护盾/增益(蓝/金)、MISS、BLOCK、死亡淡出。
// 由动作事件触发，禁止一次性飘出。

export interface BattleFloatingTextItem {
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'shield' | 'buff' | 'miss' | 'block' | 'dead';
  x: number;
  y: number;
}

export class BattleFloatingTextLayer {
  constructor(private readonly createLabel: (text: string, x: number, y: number, fontSize: number, color: Color, size: Size) => Label) {}

  spawn(parent: Node, item: BattleFloatingTextItem, scale: number): void {
    const config = this.resolveStyle(item.kind, scale);
    const label = this.createLabel(item.text, item.x, item.y, config.fontSize, config.color, new Size(120 * scale, 36 * scale));
    label.node.parent = parent;
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 226);
    label.outlineWidth = Math.max(1, scale);
    const opacity = label.node.getComponent(UIOpacity) ?? label.node.addComponent(UIOpacity);
    opacity.opacity = 255;
    const startY = item.y;
    const endY = item.y + (item.kind === 'dead' ? -20 : 50) * scale;
    tween(label.node)
      .to(0.15, { position: new Vec3(item.x, startY + (item.kind === 'dead' ? -5 : 10) * scale, 0) })
      .to(0.6, { position: new Vec3(item.x, endY, 0) })
      .call(() => {
        if (label.node.isValid) {
          if (item.kind === 'crit') {
            label.node.setScale(0.6, 0.6, 1);
            tween(label.node).to(0.1, { scale: new Vec3(1.2, 1.2, 1) }).start();
          }
        }
      })
      .delay(0.2)
      .to(0.3, { position: new Vec3(item.x, endY + 10 * scale, 0) })
      .start();
    tween(opacity).delay(0.7).to(0.4, { opacity: 0 }).call(() => {
      if (label.node.isValid) label.node.destroy();
    }).start();
  }

  private resolveStyle(kind: BattleFloatingTextItem['kind'], scale: number): { fontSize: number; color: Color } {
    switch (kind) {
      case 'crit': return { fontSize: 28 * scale, color: rgba(255, 215, 0) };
      case 'heal': return { fontSize: 20 * scale, color: rgba(120, 255, 120) };
      case 'shield': return { fontSize: 20 * scale, color: rgba(120, 180, 255) };
      case 'buff': return { fontSize: 20 * scale, color: rgba(255, 220, 120) };
      case 'miss': return { fontSize: 18 * scale, color: rgba(200, 200, 200) };
      case 'block': return { fontSize: 18 * scale, color: rgba(180, 180, 220) };
      case 'dead': return { fontSize: 22 * scale, color: rgba(200, 80, 80) };
      default: return { fontSize: 22 * scale, color: rgba(255, 240, 180) };
    }
  }
}
