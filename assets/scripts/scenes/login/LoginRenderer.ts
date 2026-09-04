import {
  BlockInputEvents,
  Button,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Size,
  Sprite,
  UITransform,
  Vec3,
  VerticalTextAlignment,
} from 'cc';
import { lootChainI18n, type LootChainI18nKey } from '../../i18n/LootChainI18n';
import { clamp, rgba, type UiLayout } from '../lobby/LobbyHudTypes';

type LoginRightRailKey = 'language' | 'service' | 'notice' | 'repair';

interface RailButtonAsset {
  label: string;
  key?: LoginRightRailKey;
  labelKey?: LootChainI18nKey;
  path: string;
}

export const LOGIN_UI_ASSETS = {
  logo: 'ui/login/login_logo/spriteFrame',
  mainButton: 'ui/login/login_button_main/spriteFrame',
  rightRail: [
    { label: '预言', path: 'ui/login/side_btn_prophecy/spriteFrame' },
    { label: '客服', path: 'ui/login/side_btn_service/spriteFrame' },
    { label: '公告', path: 'ui/login/side_btn_notice/spriteFrame' },
    { label: '修复', path: 'ui/login/side_btn_repair/spriteFrame' },
  ] satisfies RailButtonAsset[],
};

export const SHOW_LOGIN_BRAND = true;
export const SHOW_RIGHT_RAIL = true;
export const USE_IMAGE_LOGIN_BUTTON = true;
export const SHOW_DIALOG_THIRD_PARTY_LOGIN = true;

export interface LoginRendererState {
  agreementAccepted: boolean;
  defaultDevUserId: number;
}

export interface LoginRendererHost {
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addLabel(text: string, x: number, y: number, size?: number, color?: Color, contentSize?: Size): Label;
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
  addRect(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke?: Color, lineWidth?: number): Graphics;
  addBeveledPanel(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Graphics;
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean): EditBox;
  addButton(text: string, x: number, y: number, callback: () => void, layout?: UiLayout, width?: number, height?: number): Button;
  addGoldButton(text: string, x: number, y: number, callback: () => void, layout: UiLayout, width: number, height: number): Button;
  addImageButton(
    name: string,
    assetPath: string,
    text: string,
    x: number,
    y: number,
    callback: () => void,
    layout: UiLayout,
    width: number,
    height: number,
    fontSize: number,
  ): Button;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  applyPointerCursor(node: Node): void;
  setLoginInputs(accountInput: EditBox | null, passwordInput: EditBox | null): void;
  openLoginAccountScene(): void;
  openLoginLanguageDialog(): void;
  renderLogin(): void;
  submitLogin(): void;
  submitRegister(): void;
  toggleLoginAgreement(): void;
  setStatus(text: string): void;
  addStatus(text: string, layout?: UiLayout, y?: number): void;
}

/**
 * 登录页/账号登录场景渲染器。
 *
 * 这里只组合 Cocos UI 节点，不直接调用登录接口，也不切换到大厅最终态。
 * 用户点击后通过 host 回调交给 LoginFlow 和 Root 处理。
 */
export class LoginRenderer {
  constructor(private readonly host: LoginRendererHost) {}

  renderLogin(layout: UiLayout): void {
    if (SHOW_LOGIN_BRAND) {
      this.renderLoginBrand(layout);
    }
    if (SHOW_RIGHT_RAIL) {
      this.renderRightRail(layout);
    }
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const buttonWidth = clamp(layout.contentWidth * 0.34, 300 * layout.uiScale, 450 * layout.uiScale);
    const buttonHeight = Math.round(buttonWidth * 0.23);
    // 主登录按钮贴近舞台底部安全区，避免不同预览分辨率下跑出背景舞台。
    const buttonY = layout.safeBottom + Math.max(12 * layout.uiScale, layout.safeHeight * 0.02) + buttonHeight / 2;
    if (USE_IMAGE_LOGIN_BUTTON) {
      this.host.addImageButton(
        'MainAccountLoginButton',
        LOGIN_UI_ASSETS.mainButton,
        '账号登录',
        centerX,
        buttonY,
        () => this.host.openLoginAccountScene(),
        layout,
        buttonWidth,
        buttonHeight,
        Math.max(18 * layout.uiScale, layout.bodyFont + 7 * layout.uiScale),
      );
    } else {
      this.host.addGoldButton('账号登录', centerX, buttonY, () => this.host.openLoginAccountScene(), layout, Math.min(320 * layout.uiScale, layout.contentWidth * 0.3), 48 * layout.uiScale);
    }
    this.host.addStatus('等待圣契召唤。', layout, buttonY + buttonHeight / 2 + 28 * layout.uiScale);
  }

  renderLoginAccountScene(layout: UiLayout, state: LoginRendererState): void {
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const pagePadding = Math.max(18 * layout.uiScale, Math.min(36 * layout.uiScale, layout.safeWidth * 0.03));
    const panelWidth = Math.max(320 * layout.uiScale, layout.safeWidth - pagePadding * 2);
    const panelHeight = Math.max((SHOW_DIALOG_THIRD_PARTY_LOGIN ? 560 : 430) * layout.uiScale, layout.safeHeight - pagePadding * 2);
    const panelY = centerY;
    const inputWidth = Math.min(430 * layout.uiScale, panelWidth - 130 * layout.uiScale);
    const scene = this.host.addRect('LoginAccountSceneRoot', centerX, centerY, layout.width, layout.height, rgba(0, 0, 0, 118));
    scene.node.addComponent(BlockInputEvents);
    const panelGraphics = this.host.addRect('LoginAccountScenePanel', centerX, panelY, panelWidth, panelHeight, rgba(5, 5, 8, 146), rgba(214, 177, 94, 150), Math.max(1, 1.4 * layout.uiScale));
    // 账号登录页是独立全屏逻辑场景，内容区阻断输入，避免穿透到底层登录入口。
    panelGraphics.node.addComponent(BlockInputEvents);
    this.drawAccountSceneChrome(panelGraphics, panelWidth, panelHeight, layout.uiScale);
    // 页面内部位置集中计算，后续改第三方登录开关时不需要逐个找节点。
    const titleY = panelY + (SHOW_DIALOG_THIRD_PARTY_LOGIN ? 210 : 168) * layout.uiScale;
    const accountLabelY = panelY + (SHOW_DIALOG_THIRD_PARTY_LOGIN ? 138 : 102) * layout.uiScale;
    const accountInputY = panelY + (SHOW_DIALOG_THIRD_PARTY_LOGIN ? 98 : 62) * layout.uiScale;
    const passwordLabelY = panelY + (SHOW_DIALOG_THIRD_PARTY_LOGIN ? 48 : 12) * layout.uiScale;
    const passwordInputY = panelY + (SHOW_DIALOG_THIRD_PARTY_LOGIN ? 8 : -28) * layout.uiScale;
    const enterButtonY = panelY + (SHOW_DIALOG_THIRD_PARTY_LOGIN ? -70 : -96) * layout.uiScale;
    const thirdPartyY = panelY - 162 * layout.uiScale;
    const agreementY = SHOW_DIALOG_THIRD_PARTY_LOGIN ? panelY - 226 * layout.uiScale : panelY - 164 * layout.uiScale;
    this.host.addLabel('账号登录', centerX, titleY, 30 * layout.uiScale, rgba(245, 210, 122), new Size(panelWidth - 80 * layout.uiScale, 46 * layout.uiScale));
    this.host.addLabel('登录已有账号,或注册新账号进入 LootChain', centerX, titleY - 38 * layout.uiScale, 16 * layout.uiScale, rgba(196, 178, 138), new Size(panelWidth - 120 * layout.uiScale, 28 * layout.uiScale));

    this.host.addLabel('账号(4~20位字母/数字/下划线)', centerX, accountLabelY, 17 * layout.uiScale, rgba(215, 210, 198), new Size(inputWidth, 28 * layout.uiScale));
    const accountInput = this.host.addFramedEditBox('', centerX, accountInputY, inputWidth, layout);
    this.host.addLabel('密码(6~32位)', centerX, passwordLabelY, 17 * layout.uiScale, rgba(215, 210, 198), new Size(inputWidth, 28 * layout.uiScale));
    const passwordInput = this.host.addFramedEditBox('', centerX, passwordInputY, inputWidth, layout, true);
    this.host.setLoginInputs(accountInput, passwordInput);

    // 登录/注册双钮(2026-09-04 账号体系):同一组输入,注册成功即登录。
    const buttonW = Math.min(360 * layout.uiScale, inputWidth);
    this.host.addGoldButton('登 录', centerX - buttonW * 0.28, enterButtonY, () => this.host.submitLogin(), layout, buttonW * 0.5, 54 * layout.uiScale);
    this.host.addGoldButton('注 册', centerX + buttonW * 0.28, enterButtonY, () => this.host.submitRegister(), layout, buttonW * 0.5, 54 * layout.uiScale);
    if (SHOW_DIALOG_THIRD_PARTY_LOGIN) {
      this.renderThirdPartyLogin(thirdPartyY, layout, centerX);
    }
    this.renderAgreement(agreementY, layout, centerX, state.agreementAccepted);
    this.host.addButton('返回登录', centerX - panelWidth / 2 + 82 * layout.uiScale, panelY + panelHeight / 2 - 42 * layout.uiScale, () => this.host.renderLogin(), layout, 118 * layout.uiScale, 38 * layout.uiScale);
    this.host.addStatus('新玩家点「注 册」直接开号进游戏;开发预览:账号填数字ID+密码留空=模拟登录。', layout);
  }

  private drawAccountSceneChrome(graphics: Graphics, width: number, height: number, scale: number): void {
    const topBand = Math.min(92 * scale, height * 0.18);
    const bottomBand = Math.min(88 * scale, height * 0.18);
    graphics.fillColor = rgba(0, 0, 0, 122);
    graphics.rect(-width / 2, height / 2 - topBand, width, topBand);
    graphics.rect(-width / 2, -height / 2, width, bottomBand);
    graphics.fill();
    graphics.strokeColor = rgba(214, 177, 94, 132);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(-width / 2 + 28 * scale, height / 2 - topBand);
    graphics.lineTo(width / 2 - 28 * scale, height / 2 - topBand);
    graphics.moveTo(-width / 2 + 28 * scale, -height / 2 + bottomBand);
    graphics.lineTo(width / 2 - 28 * scale, -height / 2 + bottomBand);
    graphics.stroke();
  }

  private renderLoginBrand(layout: UiLayout): void {
    const logoWidth = clamp(layout.stageWidth * 0.23, 210 * layout.uiScale, 320 * layout.uiScale);
    const logoHeight = Math.round(logoWidth * 0.51);
    const logoX = layout.safeLeft + logoWidth / 2;
    const logoY = layout.safeTop - logoHeight / 2;
    if (!this.host.addSprite('LoginLogo', LOGIN_UI_ASSETS.logo, logoX, logoY, logoWidth, logoHeight)) {
      this.host.addLabel('LOOTCHAIN', logoX, logoY + 22 * layout.uiScale, 46 * layout.uiScale, rgba(245, 210, 122), new Size(logoWidth * 1.35, 62 * layout.uiScale));
      this.host.addLabel('SILENT GODS', logoX, logoY - 30 * layout.uiScale, 17 * layout.uiScale, rgba(214, 177, 94), new Size(logoWidth * 1.2, 28 * layout.uiScale));
    }
  }

  private renderRightRail(layout: UiLayout): void {
    const railWidth = 76 * layout.uiScale;
    const railHeight = 74 * layout.uiScale;
    // 右侧按钮使用 safeRight 定位，和登录 logo 一样跟随舞台安全区自适应。
    const x = layout.safeRight - railWidth / 2;
    const yStart = layout.safeTop - Math.max(8 * layout.uiScale, layout.safeInsetY * 0.4) - railHeight / 2;
    const railGap = 84 * layout.uiScale;
    LOGIN_UI_ASSETS.rightRail.forEach((asset, index) => {
      this.addRailImageButton(asset, x, yStart - index * railGap, layout);
    });
  }

  private renderThirdPartyLogin(y: number, layout: UiLayout, centerX = 0): void {
    this.host.addLabel('其他登录方式', centerX, y + 30 * layout.uiScale, 16 * layout.uiScale, rgba(214, 177, 94), new Size(260 * layout.uiScale, 28 * layout.uiScale));
    const labels = ['G', 'A', 'D', 'X'];
    const gap = 68 * layout.uiScale;
    labels.forEach((label, index) => {
      const x = centerX + (index - (labels.length - 1) / 2) * gap;
      this.addDiamondButton(label, x, y - 8 * layout.uiScale, () => this.host.setStatus('第三方登录暂未开放。'), layout);
    });
  }

  private renderAgreement(y: number, layout: UiLayout, centerX: number, agreementAccepted: boolean): void {
    const boxSize = 24 * layout.uiScale;
    const x = centerX - 152 * layout.uiScale;
    this.host.addButton(agreementAccepted ? '✓' : '', x, y, () => this.host.toggleLoginAgreement(), layout, boxSize, boxSize);
    this.host.addLabel('我已阅读并同意《用户协议》和《隐私政策》', centerX + 54 * layout.uiScale, y, 16 * layout.uiScale, rgba(215, 210, 198), new Size(430 * layout.uiScale, 34 * layout.uiScale));
  }

  private addRailImageButton(asset: RailButtonAsset, x: number, y: number, layout: UiLayout): Button {
    const railWidth = 76 * layout.uiScale;
    const railHeight = 74 * layout.uiScale;
    const iconSize = 46 * layout.uiScale;
    const isLanguageButton = asset.path.includes('side_btn_prophecy');
    const label = isLanguageButton ? lootChainI18n.t('login.rightRail.language') : asset.label;
    const node = this.host.createUiNode(`Rail_${isLanguageButton ? 'language' : asset.label}`);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(railWidth, railHeight));
    const button = node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.setStatus('该入口为登录页占位，当前阶段暂未开放。'));
    if (isLanguageButton) {
      node.off(Button.EventType.CLICK);
      node.on(Button.EventType.CLICK, () => this.host.openLoginLanguageDialog());
    }
    this.host.applyImageButtonFeedback(node);

    if (!this.host.addSprite('Icon', asset.path, 0, 15 * layout.uiScale, iconSize, iconSize, node)) {
      // 图标未加载完成时画一个菱形占位，避免按钮区域空白不可见。
      this.addDiamondButton('', x, y + 14, () => this.host.setStatus('该入口为登录页占位，当前阶段暂未开放。'), layout);
    }
    this.host.addChildLabel(node, 'Label', label, 0, -27 * layout.uiScale, Math.max(13, 18 * layout.uiScale), rgba(229, 196, 122), new Size(72 * layout.uiScale, 28 * layout.uiScale));
    return button;
  }

  private addDiamondButton(text: string, x: number, y: number, callback: () => void, layout: UiLayout): Button {
    const size = 48 * layout.uiScale;
    const node = this.host.createUiNode(`Diamond_${text}`);
    node.setPosition(new Vec3(x, y, 0));
    node.angle = 45;
    node.addComponent(UITransform).setContentSize(new Size(size, size));
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(10, 8, 9, 232);
    graphics.strokeColor = rgba(185, 138, 58, 210);
    graphics.lineWidth = 2;
    graphics.rect(-size / 2, -size / 2, size, size);
    graphics.fill();
    graphics.stroke();
    const button = node.addComponent(Button);
    node.on(Button.EventType.CLICK, callback);
    this.host.applyPointerCursor(node);

    const labelNode = new Node('Label');
    labelNode.layer = node.layer;
    node.addChild(labelNode);
    labelNode.angle = -45;
    labelNode.setPosition(Vec3.ZERO);
    labelNode.addComponent(UITransform).setContentSize(new Size(size, size));
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = Math.max(14, layout.bodyFont + 2);
    label.lineHeight = label.fontSize + 8;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.color = rgba(245, 210, 122);
    return button;
  }
}
