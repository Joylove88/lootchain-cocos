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

// 账号登录场景素材化改版(2026-09-09 用户切图,原名已 ascii 化):全部一体构图只能等比显示。
const LOGIN_AI_ASSETS = {
  /** 竖版哥特面板 900×1238(荆棘金框+顶部红宝石徽记)。 */
  panel: 'ui/login/ai/panel_bg/spriteFrame',
  /** 红色岩浆登录钮 910×284(两端荆棘翼饰,空底无字)。 */
  btnLogin: 'ui/login/ai/btn_login/spriteFrame',
  /** 暗黑注册钮 726×205(切角金铜框,空底无字)。 */
  btnRegister: 'ui/login/ai/btn_register/spriteFrame',
  /** 账号输入框 1571×196(左端内嵌人像图标)。 */
  inputAccount: 'ui/login/ai/input_account/spriteFrame',
  /** 密码输入框 1571×196(左端内嵌挂锁图标)。 */
  inputPassword: 'ui/login/ai/input_password/spriteFrame',
  /** 协议勾选选中态 118×117(金勾)。 */
  checkOn: 'ui/login/ai/check_on/spriteFrame',
  /** 分隔线左右段 558×43 / 618×42(星饰端头,成对)。 */
  dividerLeft: 'ui/login/ai/divider_left/spriteFrame',
  dividerRight: 'ui/login/ai/divider_right/spriteFrame',
  /** 菱形第三方登录钮(参考图顺序 G/A/Discord/X,303×304 上下)。 */
  socials: [
    { key: 'G', path: 'ui/login/ai/social_g/spriteFrame' },
    { key: 'A', path: 'ui/login/ai/social_a/spriteFrame' },
    { key: 'D', path: 'ui/login/ai/social_discord/spriteFrame' },
    { key: 'X', path: 'ui/login/ai/social_x/spriteFrame' },
  ],
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
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean, options?: { frameless?: boolean; placeholder?: string }): EditBox;
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
    // 2026-09-09 用户切图素材化改版(参考图):竖版哥特面板 + 素材输入框(内嵌图标)+
    // 岩浆登录钮/暗黑注册钮并排 + 星饰分隔线 + 菱形第三方钮 + 协议勾选。
    // 手绘旧版全部保留为缺图兜底(addSprite 未缓存返回 null 当帧走兜底,加载完整页重渲换素材)。
    const scale = layout.uiScale;
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const scene = this.host.addRect('LoginAccountSceneRoot', centerX, centerY, layout.width, layout.height, rgba(0, 0, 0, 138));
    scene.node.addComponent(BlockInputEvents);

    // 面板等比锚高(900×1238),矮屏下随安全高收缩;超窄屏再按宽度钳一道。
    // 2026-09-09 用户反馈:整个登录框放大一档(高上限 720→800,边距/宽钳同步放宽)。
    const panelAspect = 900 / 1238;
    let formHeight = Math.min(800 * scale, layout.safeHeight - 8 * scale);
    let formWidth = formHeight * panelAspect;
    const maxWidth = Math.max(320 * scale, layout.safeWidth * 0.7);
    if (formWidth > maxWidth) {
      formWidth = maxWidth;
      formHeight = formWidth / panelAspect;
    }
    const panelY = centerY;
    if (!this.host.addSprite('LoginAccountPanelArt', LOGIN_AI_ASSETS.panel, centerX, panelY, formWidth, formHeight)) {
      const form = this.host.addBeveledPanel('LoginAccountScenePanel', centerX, panelY, formWidth, formHeight, rgba(7, 6, 9, 216), rgba(206, 162, 82, 216), 16 * scale);
      form.node.addComponent(BlockInputEvents);
    }

    // 内容整体向内缩进 10px(2026-09-09 用户反馈)。
    const inner = formWidth * 0.8 - 20 * scale;
    // 标题下移 35px + 参考图风格:大号鎏金粗体+深棕描边,副标题两侧星饰线。
    const titleY = panelY + formHeight * 0.29 - 35 * scale;
    const title = this.host.addLabel('账号登录', centerX, titleY, 44 * scale, rgba(245, 210, 122), new Size(formWidth - 90 * scale, 58 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    title.enableOutline = true;
    title.outlineColor = rgba(62, 34, 10, 255);
    title.outlineWidth = Math.max(2, 3 * scale);
    const subtitleY = titleY - 46 * scale;
    const subtitle = this.host.addLabel('登录已有账号,或注册新账号进入 LootChain', centerX, subtitleY, 16 * scale, rgba(208, 186 , 144, 235), new Size(formWidth - 160 * scale, 26 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;
    for (const dir of [-1, 1]) {
      const orn = this.host.addLabel('—◆', centerX + dir * (formWidth / 2 - 78 * scale), subtitleY, 13 * scale, rgba(196, 158, 92, 220), new Size(48 * scale, 20 * scale));
      orn.overflow = Label.Overflow.SHRINK;
      if (dir > 0) {
        orn.string = '◆—';
      }
    }

    // 输入区:素材框(左端烘焙图标)+ frameless EditBox 叠放,右侧格式提示压在框内。
    const frameHeight = inner * (196 / 1571);
    const labelX = centerX - inner / 2 + 60 * scale;
    // 矮屏防撞:账号行既锚面板比例,也不越过副标题下沿。
    const accountLabelY = Math.min(panelY + formHeight * 0.145, subtitleY - 44 * scale);
    const accountInputY = accountLabelY - 18 * scale - frameHeight / 2;
    const accountInput = this.mountAssetInputRow(layout, centerX, labelX, accountLabelY, accountInputY, inner, frameHeight, {
      label: '账号', hint: '4~20位字母/数字/下划线', frameName: 'AccountInputFrameArt', asset: LOGIN_AI_ASSETS.inputAccount, placeholder: '请输入账号', password: false,
    });
    const passwordLabelY = accountInputY - frameHeight / 2 - 24 * scale;
    const passwordInputY = passwordLabelY - 18 * scale - frameHeight / 2;
    const passwordInput = this.mountAssetInputRow(layout, centerX, labelX, passwordLabelY, passwordInputY, inner, frameHeight, {
      label: '密码', hint: '6~32位', frameName: 'PasswordInputFrameArt', asset: LOGIN_AI_ASSETS.inputPassword, placeholder: '请输入密码', password: true,
    });
    this.host.setLoginInputs(accountInput, passwordInput);

    // 按钮行:登录(岩浆大钮)靠左、注册(暗黑钮)靠右,同一行(参考图)。
    const loginW = inner * 0.55;
    const loginH = loginW * (284 / 910);
    const regW = inner * 0.4;
    const regH = regW * (205 / 726);
    const enterButtonY = passwordInputY - frameHeight / 2 - 28 * scale - loginH / 2;
    this.mountPanelButton('AccountLoginSubmit', LOGIN_AI_ASSETS.btnLogin, '登 录', centerX - inner / 2 + loginW / 2, enterButtonY, loginW, loginH, 26 * scale, layout, () => this.host.submitLogin(), 'primary');
    this.mountPanelButton('AccountRegisterSubmit', LOGIN_AI_ASSETS.btnRegister, '注 册', centerX + inner / 2 - regW / 2, enterButtonY, regW, regH, 22 * scale, layout, () => this.host.submitRegister(), 'secondary');

    const dividerY = enterButtonY - loginH / 2 - 38 * scale;
    const socialY = dividerY - 56 * scale;
    // 2026-09-09 用户反馈:协议行整行上移 15px。
    const agreementY = socialY - 43 * scale;
    if (SHOW_DIALOG_THIRD_PARTY_LOGIN) {
      this.renderThirdPartyLogin(dividerY, socialY, layout, centerX, inner);
    }
    this.renderAgreement(agreementY, layout, centerX, state.agreementAccepted);
    this.host.addButton('返回登录', layout.safeLeft + 62 * scale, layout.safeTop - 26 * scale, () => this.host.renderLogin(), layout, 118 * scale, 38 * scale);
    this.host.addStatus('新玩家点「注 册」直接开号进游戏。', layout);
  }

  /** 素材输入行:标签 + 素材框(左端烘焙图标,故 EditBox 右移避开)+ 框内右缘格式提示。 */
  private mountAssetInputRow(
    layout: UiLayout,
    centerX: number,
    labelX: number,
    labelY: number,
    inputY: number,
    inner: number,
    frameHeight: number,
    row: { label: string; hint: string; frameName: string; asset: string; placeholder: string; password: boolean },
  ): EditBox {
    const scale = layout.uiScale;
    const tip = this.host.addLabel(row.label, labelX, labelY, 19 * scale, rgba(224, 202, 156, 240), new Size(140 * scale, 28 * scale));
    tip.horizontalAlign = HorizontalTextAlignment.LEFT;
    const frameOk = !!this.host.addSprite(row.frameName, row.asset, centerX, inputY, inner, frameHeight);
    // 素材左端 ~14% 是烘焙的人像/锁图标区,EditBox 从图标右侧起排;缺图退回手绘金框(占满行宽)。
    const editWidth = frameOk ? inner * 0.66 : inner - 28 * scale;
    const editX = frameOk ? centerX - inner / 2 + inner * 0.15 + editWidth / 2 : centerX;
    const hint = this.host.addLabel(row.hint, centerX + inner / 2 - 140 * scale, inputY, 14 * scale, rgba(150, 134, 104, 210), new Size(240 * scale, 22 * scale));
    hint.horizontalAlign = HorizontalTextAlignment.RIGHT;
    hint.overflow = Label.Overflow.SHRINK;
    // 失焦占位/内容显示由工厂 EditBoxDisplayLabel 统一承担(2026-09-09 根治引擎重摆跑位)。
    return this.host.addFramedEditBox('', editX, inputY, editWidth, layout, row.password, { frameless: frameOk, placeholder: row.placeholder });
  }

  /** 素材按钮(空底图+文字 Label 叠加);缺图兜底手绘(主=红底金框,次=暗底金描边)。 */
  private mountPanelButton(
    name: string,
    asset: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    layout: UiLayout,
    callback: () => void,
    kind: 'primary' | 'secondary',
  ): void {
    const node = this.host.createUiNode(name);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    if (!this.host.addSprite(`${name}Art`, asset, 0, 0, width, height, node)) {
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = kind === 'primary' ? rgba(122, 32, 24, 240) : rgba(12, 10, 12, 235);
      graphics.roundRect(-width / 2, -height / 2, width, height, 6);
      graphics.fill();
      graphics.strokeColor = rgba(214, 168, 82, 230);
      graphics.lineWidth = Math.max(1, 1.4 * layout.uiScale);
      graphics.roundRect(-width / 2, -height / 2, width, height, 6);
      graphics.stroke();
    }
    const label = this.host.addChildLabel(node, 'Label', text, 0, 0, fontSize, kind === 'primary' ? rgba(255, 234, 178) : rgba(232, 206, 150), new Size(width - 24 * layout.uiScale, fontSize + 10));
    label.overflow = Label.Overflow.SHRINK;
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, callback, this);
    this.host.applyImageButtonFeedback(node);
    this.host.applyPointerCursor(node);
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

  private renderThirdPartyLogin(dividerY: number, socialY: number, layout: UiLayout, centerX: number, inner: number): void {
    const scale = layout.uiScale;
    // 分隔行:星饰线素材左右段夹住"其他登录方式"(缺图退手绘细线)。
    const dividerLabel = this.host.addLabel('其他登录方式', centerX, dividerY, 17 * scale, rgba(214, 177, 94), new Size(160 * scale, 26 * scale));
    dividerLabel.overflow = Label.Overflow.SHRINK;
    const segWidth = Math.max(60 * scale, inner / 2 - 92 * scale);
    const segHeightL = segWidth * (43 / 558);
    const segHeightR = segWidth * (42 / 618);
    const segGap = 86 * scale;
    const leftOk = !!this.host.addSprite('LoginDividerLeft', LOGIN_AI_ASSETS.dividerLeft, centerX - segGap - segWidth / 2, dividerY, segWidth, segHeightL);
    const rightOk = !!this.host.addSprite('LoginDividerRight', LOGIN_AI_ASSETS.dividerRight, centerX + segGap + segWidth / 2, dividerY, segWidth, segHeightR);
    if (!leftOk || !rightOk) {
      const line = this.host.addRect('LoginDividerFallback', centerX, dividerY, inner, 2, rgba(0, 0, 0, 0));
      line.strokeColor = rgba(185, 150, 84, 150);
      line.lineWidth = Math.max(1, scale);
      for (const dir of [-1, 1]) {
        line.moveTo(dir * segGap, 0);
        line.lineTo(dir * (segGap + segWidth), 0);
      }
      line.stroke();
    }
    // 菱形第三方钮(参考图顺序 G/A/Discord/X);素材缺图退回旧手绘菱形。
    const size = inner * 0.16;
    const gap = inner * 0.225;
    LOGIN_AI_ASSETS.socials.forEach((social, index) => {
      const x = centerX + (index - (LOGIN_AI_ASSETS.socials.length - 1) / 2) * gap;
      const node = this.host.createUiNode(`SocialLogin_${social.key}`);
      node.setPosition(new Vec3(x, socialY, 0));
      node.addComponent(UITransform).setContentSize(new Size(size, size));
      if (!this.host.addSprite('Art', social.path, 0, 0, size, size, node)) {
        node.destroy();
        this.addDiamondButton(social.key, x, socialY, () => this.host.setStatus('第三方登录暂未开放。'), layout);
        return;
      }
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => this.host.setStatus('第三方登录暂未开放。'), this);
      this.host.applyImageButtonFeedback(node, 1.06, 0.94);
      this.host.applyPointerCursor(node);
    });
  }

  private renderAgreement(y: number, layout: UiLayout, centerX: number, agreementAccepted: boolean): void {
    const scale = layout.uiScale;
    const boxSize = 26 * scale;
    const x = centerX - 176 * scale;
    // 勾选框:选中=用户金勾素材,未选/缺图=手绘切角空框;整框可点切换。
    const box = this.host.createUiNode('LoginAgreementBox');
    box.setPosition(new Vec3(x, y, 0));
    box.addComponent(UITransform).setContentSize(new Size(boxSize + 10 * scale, boxSize + 10 * scale));
    const spriteOk = agreementAccepted ? !!this.host.addSprite('Art', LOGIN_AI_ASSETS.checkOn, 0, 0, boxSize, boxSize, box) : false;
    if (!spriteOk) {
      const graphics = box.addComponent(Graphics);
      graphics.fillColor = rgba(10, 8, 9, 232);
      graphics.roundRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize, 4 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(185, 138, 58, 220);
      graphics.lineWidth = Math.max(1, 1.4 * scale);
      graphics.roundRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize, 4 * scale);
      graphics.stroke();
      if (agreementAccepted) {
        graphics.strokeColor = rgba(245, 210, 122, 245);
        graphics.lineWidth = Math.max(1.4, 2 * scale);
        graphics.moveTo(-boxSize * 0.24, 0);
        graphics.lineTo(-boxSize * 0.05, -boxSize * 0.2);
        graphics.lineTo(boxSize * 0.26, boxSize * 0.2);
        graphics.stroke();
      }
    }
    box.addComponent(Button);
    box.on(Button.EventType.CLICK, () => this.host.toggleLoginAgreement(), this);
    this.host.applyPointerCursor(box);
    const text = this.host.addLabel('我已阅读并同意《用户协议》和《隐私政策》', centerX + 26 * scale, y, 16 * scale, rgba(215, 210, 198), new Size(400 * scale, 26 * scale));
    text.overflow = Label.Overflow.SHRINK;
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
