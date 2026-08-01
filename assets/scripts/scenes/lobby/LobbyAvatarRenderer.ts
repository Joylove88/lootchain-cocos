import {
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
  UITransform,
  Vec3,
} from 'cc';
import { safeText } from '../UiTextFormatter';
import { rgba } from './LobbyHudTypes';

// AI 头像框(哥特方框,中心镂空);内孔约占图宽 53%,框体外沿约 67%。
const LOBBY_AVATAR_FRAME_ASSET = 'ui/lobby/ai/avatar_frame/spriteFrame';

export interface LobbyAvatarHost {
  node: Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
}

/**
 * 大厅头像兜底绘制器。
 *
 * 如果没有真实头像资源，就用 Cocos Graphics 绘制暗金头像框和盔甲剪影，
 * 保证左上 HUD 与资料弹窗都能稳定显示头像区域。
 */
export class LobbyAvatarRenderer {
  constructor(private readonly host: LobbyAvatarHost) {}

  add(parent: Node, x: number, y: number, size: number, displayName: string): void {
    const avatarNode = new Node('LobbyPlayerAvatar');
    avatarNode.layer = this.host.node.layer;
    parent.addChild(avatarNode);
    avatarNode.setPosition(new Vec3(x, y, 0));
    avatarNode.addComponent(UITransform).setContentSize(new Size(size, size));
    const graphics = avatarNode.addComponent(Graphics);
    const radius = size / 2;

    // AI 框子节点在父 Graphics 之后渲染,天然盖在肖像上;缺资源时回退旧矢量框。
    const frame = this.host.addSprite('LobbyAvatarFrameArt', LOBBY_AVATAR_FRAME_ASSET, 0, size * 0.04, size * 1.5, size * 1.5, avatarNode);

    if (!frame) {
      graphics.fillColor = rgba(15, 10, 7, 230);
      graphics.circle(0, 0, radius * 1.08);
      graphics.fill();
      graphics.strokeColor = rgba(95, 67, 31, 190);
      graphics.lineWidth = Math.max(2, size * 0.04);
      graphics.circle(0, 0, radius * 1.03);
      graphics.stroke();
      graphics.strokeColor = rgba(205, 160, 73, 210);
      graphics.lineWidth = Math.max(1, size * 0.015);
      graphics.arc(0, 0, radius * 1.08, Math.PI * 0.74, Math.PI * 1.34, false);
      graphics.stroke();
      graphics.arc(0, 0, radius * 1.08, Math.PI * 1.74, Math.PI * 0.34, false);
      graphics.stroke();
      this.drawAvatarFrameOrnaments(graphics, size);
    }

    graphics.fillColor = rgba(8, 9, 13, 252);
    graphics.circle(0, 0, radius * 0.98);
    graphics.fill();

    graphics.fillColor = rgba(24, 28, 36, 246);
    graphics.circle(0, -radius * 0.02, radius * 0.78);
    graphics.fill();

    this.drawArmoredAvatarPortrait(graphics, size);

    if (!frame) {
      graphics.strokeColor = rgba(37, 25, 15, 255);
      graphics.lineWidth = Math.max(2, size * 0.065);
      graphics.circle(0, 0, radius * 0.96 - graphics.lineWidth / 2);
      graphics.stroke();
      graphics.strokeColor = rgba(232, 186, 82, 240);
      graphics.lineWidth = Math.max(2, size * 0.026);
      graphics.circle(0, 0, radius * 0.82);
      graphics.stroke();

      graphics.strokeColor = rgba(255, 228, 150, 170);
      graphics.lineWidth = Math.max(1, size * 0.011);
      graphics.arc(0, 0, radius * 0.72, Math.PI * 0.08, Math.PI * 0.58, false);
      graphics.stroke();

      const crest = safeText(displayName).slice(0, 1).toUpperCase() || 'L';
      this.host.addChildLabel(avatarNode, 'AvatarCrestLetter', crest, 0, -size * 0.34, Math.max(10, size * 0.13), rgba(238, 208, 142), new Size(size * 0.44, size * 0.18));
    }
  }

  private drawAvatarFrameOrnaments(graphics: Graphics, size: number): void {
    // 上下左右的小金属装饰用于贴近参考图的暗金头像框语言。
    const scale = size / 104;
    const top = size * 0.56;
    const bottom = -size * 0.56;
    const left = -size * 0.56;
    const right = size * 0.56;
    graphics.fillColor = rgba(108, 77, 34, 190);
    graphics.moveTo(0, top + 7 * scale);
    graphics.lineTo(8 * scale, top - 5 * scale);
    graphics.lineTo(0, top - 15 * scale);
    graphics.lineTo(-8 * scale, top - 5 * scale);
    graphics.close();
    graphics.fill();
    graphics.moveTo(0, bottom - 7 * scale);
    graphics.lineTo(8 * scale, bottom + 5 * scale);
    graphics.lineTo(0, bottom + 15 * scale);
    graphics.lineTo(-8 * scale, bottom + 5 * scale);
    graphics.close();
    graphics.fill();

    graphics.strokeColor = rgba(206, 162, 78, 165);
    graphics.lineWidth = 1.2 * scale;
    graphics.moveTo(left - 6 * scale, 0);
    graphics.lineTo(left + 12 * scale, 0);
    graphics.moveTo(right - 12 * scale, 0);
    graphics.lineTo(right + 6 * scale, 0);
    graphics.stroke();
  }

  private drawArmoredAvatarPortrait(graphics: Graphics, size: number): void {
    // 这里是纯矢量兜底肖像，不依赖外部头像图，后续可替换为真实头像资源。
    const scale = size / 104;
    graphics.fillColor = rgba(7, 8, 12, 250);
    graphics.moveTo(-27 * scale, -26 * scale);
    graphics.lineTo(-16 * scale, -4 * scale);
    graphics.lineTo(0, 6 * scale);
    graphics.lineTo(17 * scale, -4 * scale);
    graphics.lineTo(30 * scale, -28 * scale);
    graphics.lineTo(22 * scale, -39 * scale);
    graphics.lineTo(-22 * scale, -39 * scale);
    graphics.close();
    graphics.fill();

    graphics.fillColor = rgba(83, 86, 96, 245);
    graphics.moveTo(-26 * scale, 12 * scale);
    graphics.lineTo(-14 * scale, 34 * scale);
    graphics.lineTo(0, 41 * scale);
    graphics.lineTo(15 * scale, 34 * scale);
    graphics.lineTo(27 * scale, 12 * scale);
    graphics.lineTo(18 * scale, -11 * scale);
    graphics.lineTo(-18 * scale, -11 * scale);
    graphics.close();
    graphics.fill();

    graphics.fillColor = rgba(19, 20, 25, 245);
    graphics.moveTo(-20 * scale, 10 * scale);
    graphics.lineTo(-9 * scale, 27 * scale);
    graphics.lineTo(0, 31 * scale);
    graphics.lineTo(10 * scale, 27 * scale);
    graphics.lineTo(21 * scale, 10 * scale);
    graphics.lineTo(12 * scale, -18 * scale);
    graphics.lineTo(-12 * scale, -18 * scale);
    graphics.close();
    graphics.fill();

    graphics.fillColor = rgba(168, 145, 116, 238);
    graphics.moveTo(-8 * scale, 8 * scale);
    graphics.lineTo(0, 21 * scale);
    graphics.lineTo(9 * scale, 8 * scale);
    graphics.lineTo(6 * scale, -10 * scale);
    graphics.lineTo(-6 * scale, -10 * scale);
    graphics.close();
    graphics.fill();

    graphics.strokeColor = rgba(219, 173, 74, 210);
    graphics.lineWidth = 1.7 * scale;
    graphics.moveTo(-28 * scale, 12 * scale);
    graphics.lineTo(0, 42 * scale);
    graphics.lineTo(29 * scale, 12 * scale);
    graphics.moveTo(0, 38 * scale);
    graphics.lineTo(0, -18 * scale);
    graphics.stroke();

    graphics.strokeColor = rgba(221, 45, 48, 170);
    graphics.lineWidth = 1.3 * scale;
    graphics.moveTo(-18 * scale, -9 * scale);
    graphics.lineTo(18 * scale, -9 * scale);
    graphics.stroke();
  }

}
