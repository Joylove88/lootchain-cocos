import { BlockInputEvents, Color, EditBox, Graphics, HorizontalTextAlignment, Label, Node, Size, UITransform } from 'cc';
import type { UiKitHost } from '../UiKit';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassIconButton, mountGlassLine, mountGlassSlice } from '../UiGlassKit';
import { rgba, type UiLayout } from './LobbyHudTypes';

export interface LobbyGiftDialogState {
  draft: string;
  error: string;
}

export interface LobbyGiftDialogHost extends UiKitHost {
  createUiNode(name: string): Node;
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean, options?: { frameless?: boolean; placeholder?: string; placeholderColor?: Color }): EditBox;
  currentLobbyGiftDialog(): LobbyGiftDialogState | null;
  isLobbyGiftRedeeming(): boolean;
  setLobbyGiftDraft(text: string): void;
  redeemLobbyGiftCode(code: string): void;
  pasteLobbyGiftCode(): void;
  closeLobbyGiftDialog(): void;
}

/** 原型弹框中心(1870×841 坐标);弹框内一律以它为原点。 */
const CX = 936.5;
const CY = 417.5;

/**
 * 兑换码弹框(11-01 用户确认原型 周报截图/2026-11-01_B风格补全/proto/gift_b.png):终端「兑换码」直接在终端上弹出,
 * 取代旧「更多」整页。玻璃卡片 541..1332 × 221..614;标题行礼盒图标 + 「兑换码」+ ✕;灰色说明;输入框(右端竖线 + 「粘贴」);
 * 底部右对齐「取消」「兑换」;左下空位放出错提示。
 * 输入框 EditBox 走内容根绝对坐标(工厂挂根节点),节点改名 INPUT_NAME 便于关闭时单独移除。
 */
export class LobbyGiftDialogRenderer {
  static readonly NODE_NAME = 'LobbyGiftDialog';
  static readonly INPUT_NAME = 'LobbyGiftDialogInput';

  constructor(private readonly host: LobbyGiftDialogHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyGiftDialog();
    if (!state) {
      return;
    }
    const busy = this.host.isLobbyGiftRedeeming();
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const D = (px: number): number => (px - CX) * k;
    const E = (py: number): number => (CY - py) * k;
    const T = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const label = glassLabel(this.host, parent, name, text, x, y, S(size), color, width, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };

    // 整屏压暗(终端留在后面),点空白处同「取消」
    const root = this.host.createUiNode(LobbyGiftDialogRenderer.NODE_NAME);
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(4, 6, 10, 180);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    root.on(Node.EventType.TOUCH_END, () => this.host.closeLobbyGiftDialog(), this);

    const panelW = S(791);
    const panelH = S(393);
    const panel = this.host.addChildPlainNode(root, 'Panel', cx, cy, panelW, panelH);
    panel.addComponent(BlockInputEvents);
    // 玻璃面板叠两层:单层半透明,压在终端格子上会透出图标
    mountGlassSlice(this.host, panel, 'GlassBase', GLASS_SLICES.panel, 0, 0, panelW, panelH, k);
    mountGlassSlice(this.host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, panelW, panelH, k);

    // 标题行:礼盒 (604,276) 40 / 「兑换码」左沿 644 / ✕ (1274,269)
    this.host.addSprite('Icon', GLASS_ICON.gift, D(604), E(276), S(40), S(40), panel);
    T(panel, 'Title', '兑换码', D(644), E(276), 32, GLASS_COLOR.text, S(300), HorizontalTextAlignment.LEFT, true);
    mountGlassIconButton(this.host, panel, 'Close', GLASS_ICON.close, D(1274), E(269), S(34), S(72), () => this.host.closeLobbyGiftDialog());
    T(panel, 'Hint', '输入礼包码领取奖励,每个礼包码每个账号只能使用一次', D(584), E(359), 21, GLASS_COLOR.sub, S(704));

    // 输入框 585..1288 × 402..479;竖线 x 1160;「粘贴」(1227,441) 87×40
    const inputY = 440.5;
    mountGlassSlice(this.host, panel, 'InputBg', GLASS_SLICES.input, 0, E(inputY), S(703), S(77), k);
    mountGlassLine(this.host, panel, 'InputSep', D(1160), E(inputY), Math.max(1, S(2)), S(36), new Color(98, 106, 120, 200));
    mountGlassButton(this.host, panel, 'Paste', '粘贴', D(1227), E(inputY), S(87), S(40), k, busy ? 'disabled' : 'secondary', () => this.host.pasteLobbyGiftCode(), 21);

    // 出错提示(左下空位,按钮左侧)
    if (state.error) {
      T(panel, 'Error', state.error, D(584), E(547), 19, GLASS_COLOR.red, S(290));
    }
    // 底部按钮:取消 887..1080 / 兑换 1097..1290,y 547,高 62
    mountGlassButton(this.host, panel, 'Cancel', '取消', D(983.5), E(547), S(193), S(62), k, busy ? 'disabled' : 'secondary', () => this.host.closeLobbyGiftDialog());
    let input: EditBox | null = null;
    mountGlassButton(this.host, panel, 'Redeem', busy ? '兑换中…' : '兑换', D(1193.5), E(547), S(193), S(62), k, busy ? 'primaryOff' : 'primary', () => {
      this.host.redeemLobbyGiftCode(input?.string ?? state.draft);
    });

    // EditBox 最后建(挂内容根、在弹框之上);文字起点 = 左沿 + 14 = 原型占位字 x 611
    input = this.host.addFramedEditBox(state.draft, cx + D(873.5), cy + E(inputY), S(553), layout, false, {
      frameless: true,
      placeholder: '输入礼包码',
      placeholderColor: new Color(136, 142, 154, 230),
    });
    input.node.name = LobbyGiftDialogRenderer.INPUT_NAME;
    // 工厂默认字号(正文 + 1)比原型小一圈:按原型 24 放大;输入中的原生 <input> 聚焦时按 textLabel 字号同步
    const inputFont = Math.max(14, Math.round(S(24)));
    for (const label of [input.textLabel, input.node.getChildByName('EditBoxDisplayLabel')?.getComponent(Label)]) {
      if (label) {
        label.fontSize = inputFont;
        label.lineHeight = inputFont + 6;
      }
    }
    input.maxLength = 64;
    input.enabled = !busy;
    input.node.on(EditBox.EventType.TEXT_CHANGED, (box: EditBox) => this.host.setLobbyGiftDraft(box.string), this);
    input.node.on(EditBox.EventType.EDITING_RETURN, (box: EditBox) => this.host.redeemLobbyGiftCode(box.string), this);
  }
}
