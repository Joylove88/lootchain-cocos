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
} from 'cc';
import { resetAssetOfflineCache } from '../../app/AssetOfflineCache';
import { lootChainI18n, type LootChainLanguage } from '../../i18n/LootChainI18n';
import type { UiLayout } from '../lobby/LobbyHudTypes';
import type { UiKitHost } from '../UiKit';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassLine, mountGlassSlice } from '../UiGlassKit';

/**
 * 旧版登录页切图(2026-09 红金雕花 logo / 主按钮 / 右栏图标)。11-11 改 B 风格后页面不再使用,
 * 只为 UiSpriteFrameCache 里「场景 Inspector 覆盖图」的兼容判断保留路径。
 */
export const LOGIN_UI_ASSETS = {
  logo: 'ui/login/login_logo/spriteFrame',
  mainButton: 'ui/login/login_button_main/spriteFrame',
  rightRail: [
    { label: '预言', path: 'ui/login/side_btn_prophecy/spriteFrame' },
    { label: '客服', path: 'ui/login/side_btn_service/spriteFrame' },
    { label: '公告', path: 'ui/login/side_btn_notice/spriteFrame' },
    { label: '修复', path: 'ui/login/side_btn_repair/spriteFrame' },
  ],
};

/**
 * 登录页 B 风格素材(11-11,原型 周报截图/2026-11-11_登录页/proto/login_b.png,用户确认):
 * 背景 / 字标与启动加载页同一套;线条图标由 tools/qa/login_icons_gen.py 生成;玻璃件取 UiGlassKit。
 * 启动时 UiSpriteFrameCache.preload 预读,首屏就是完整样式(没到的走重绘补上)。
 */
const LOGIN_B = {
  bg: { path: 'ui/protagonist/b/soul_sea_bg/spriteFrame', w: 1672, h: 941 },
  wordmark: { path: 'ui/boot/boot_wordmark/spriteFrame', w: 1640, h: 280 },
  iconUser: 'ui/login/b/icon_user/spriteFrame',
  iconLock: 'ui/login/b/icon_lock/spriteFrame',
  iconGlobe: 'ui/login/b/icon_globe/spriteFrame',
  iconWrench: 'ui/login/b/icon_wrench/spriteFrame',
};

export const LOGIN_B_ASSET_PATHS: readonly string[] = [
  LOGIN_B.bg.path,
  LOGIN_B.wordmark.path,
  LOGIN_B.iconUser,
  LOGIN_B.iconLock,
  LOGIN_B.iconGlobe,
  LOGIN_B.iconWrench,
  GLASS_SLICES.panel.path,
  GLASS_SLICES.input.path,
  GLASS_SLICES.pillPrimary.path,
  GLASS_SLICES.pillSecondary.path,
  GLASS_SLICES.pillGold.path,
];

/** 原型取色。 */
const C = {
  sub: new Color(156, 164, 175, 255),
  label: new Color(211, 212, 214, 255),
  placeholder: new Color(126, 135, 144, 255),
  hint: new Color(122, 130, 139, 255),
  railFill: new Color(30, 37, 46, 205),
  railStroke: new Color(255, 255, 255, 44),
};

export interface LoginRendererState {
  agreementAccepted: boolean;
  defaultDevUserId: number;
}

export interface LoginRendererHost extends UiKitHost {
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean, options?: { frameless?: boolean; placeholder?: string; placeholderColor?: Color }): EditBox;
  applyPointerCursor(node: Node): void;
  setLoginInputs(accountInput: EditBox | null, passwordInput: EditBox | null): void;
  /** 打开用户协议/隐私政策查看层(2026-09-25)。 */
  openLegalDocument?(key: 'terms' | 'privacy'): void;
  openLoginLanguageDialog(): void;
  closeLoginLanguageDialog(): void;
  selectLoginLanguage(language: LootChainLanguage): void;
  submitLogin(): void;
  submitRegister(): void;
  toggleLoginAgreement(): void;
  setStatus(text: string): void;
  addStatus(text: string, layout?: UiLayout, y?: number, color?: Color): void;
}

/**
 * 登录页渲染器(11-11 B 风格单页:进来直接是账号表单,不再有「点账号登录」的中间页)。
 *
 * 这里只组合 Cocos UI 节点，不直接调用登录接口，也不切换到大厅最终态。
 * 用户点击后通过 host 回调交给 LoginFlow 和 Root 处理。
 */
export class LoginRenderer {
  constructor(private readonly host: LoginRendererHost) {}

  /**
   * 账号 / 密码草稿:输入时实时记下,页面重建(图片到货、横竖屏变化、切语言)后回填——
   * 否则重建出来的是空输入框,玩家刚输的内容"过一会儿自己消失"(2026-10-05 用户手机录屏)。
   */
  private readonly drafts = { account: '', password: '' };

  /** 状态提示行的位置(按钮与协议之间);登录中 / 报错的提示也显示在这里,不压协议行。 */
  accountStatusY: number | null = null;

  /** 退出登录 / 登录过期回到登录页时清空草稿。 */
  clearDrafts(): void {
    this.drafts.account = '';
    this.drafts.password = '';
  }

  renderLoginPage(layout: UiLayout, state: LoginRendererState): void {
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S, RX } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const host = this.host;
    const root = host.createUiNode('LoginGlassRoot');
    root.setPosition(cx, cy, 0);
    const W = layout.width;
    const H = layout.height;
    // 挂 BlockInputEvents 的节点必须有 UITransform:否则引擎排序点击处理器时读 null.cameraPriority 抛错,整页点不动
    root.addComponent(UITransform).setContentSize(new Size(W, H));
    // 背景:纯色兜底 + 识海图 cover + 压暗(同启动加载页)
    const base = host.addChildPlainNode(root, 'Base', 0, 0, W, H).addComponent(Graphics);
    base.fillColor = new Color(12, 15, 22, 255);
    base.rect(-W, -H, W * 2, H * 2);
    base.fill();
    const cover = Math.max(W / LOGIN_B.bg.w, H / LOGIN_B.bg.h);
    host.addSprite('Bg', LOGIN_B.bg.path, 0, 0, LOGIN_B.bg.w * cover, LOGIN_B.bg.h * cover, root);
    const dim = host.addChildPlainNode(root, 'Dim', 0, 0, W, H).addComponent(Graphics);
    dim.fillColor = new Color(8, 11, 18, 120);
    dim.rect(-W, -H, W * 2, H * 2);
    dim.fill();
    root.addComponent(BlockInputEvents);

    // 字标:启动页同一张图缩 0.68(原型 LOOTCHAIN 字高 34 / 启动页 50),画布中心对到原型 (932.5, 107.5)
    const markScale = 0.68 * k / 2;
    host.addSprite('Wordmark', LOGIN_B.wordmark.path, FX(932.5), FY(107.5), LOGIN_B.wordmark.w * markScale, LOGIN_B.wordmark.h * markScale, root);

    // 右上:语言 / 修复 圆形玻璃钮(原型圆心 (1681, 73) / (1786, 73),直径 66;标签 y 124.5)
    this.mountRailButton(root, 'Rail_language', RX(1681), FY(73), S(66), FY(124.5), S(18), LOGIN_B.iconGlobe, lootChainI18n.t('login.rightRail.language'), () => host.openLoginLanguageDialog());
    this.mountRailButton(root, 'Rail_修复', RX(1786), FY(73), S(66), FY(124.5), S(18), LOGIN_B.iconWrench, '修复', () => {
      host.setStatus('正在清理本地缓存并重新加载…');
      void resetAssetOfflineCache().then(() => window.location.reload());
    });

    // 玻璃卡(原型 x 574~1298 / y 182~761)
    const card = host.addChildPlainNode(root, 'Card', FX(936), FY(471.5), S(724), S(579));
    if (!mountGlassSlice(host, card, 'Glass', GLASS_SLICES.panel, 0, 0, S(724), S(579), k)) {
      const g = card.addComponent(Graphics);
      g.fillColor = new Color(20, 25, 34, 205);
      g.roundRect(-S(362), -S(289.5), S(724), S(579), S(12));
      g.fill();
      g.strokeColor = new Color(255, 255, 255, 34);
      g.lineWidth = Math.max(1, k);
      g.roundRect(-S(362), -S(289.5), S(724), S(579), S(12));
      g.stroke();
    }
    glassLabel(host, root, 'LoginTitle', '账号登录', FX(632), FY(230), S(38), GLASS_COLOR.text, S(400), HorizontalTextAlignment.LEFT, true);
    glassLabel(host, root, 'LoginSubtitle', '登录已有账号,或注册新账号进入游戏', FX(632), FY(272.5), S(22), C.sub, S(600));

    const accountInput = this.mountInputRow(layout, root, cx, cy, {
      label: '账号', labelY: 321, inputY: 370, icon: LOGIN_B.iconUser, placeholder: '请输入账号', hint: '4-20 位字母、数字或下划线', editRight: 1000, password: false,
    });
    const passwordInput = this.mountInputRow(layout, root, cx, cy, {
      label: '密码', labelY: 432, inputY: 481, icon: LOGIN_B.iconLock, placeholder: '请输入密码', hint: '6-32 位', editRight: 1160, password: true,
    });
    host.setLoginInputs(accountInput, passwordInput);

    // 按钮行(原型 登录 x 627~924 / 注册 x 948~1244,y 543~602):唯一主钮香槟、注册全站统一次钮
    mountGlassButton(host, root, 'AccountLoginSubmit', '登录', FX(775.5), FY(572.5), S(297), S(59), k, 'primary', () => host.submitLogin(), 27);
    mountGlassButton(host, root, 'AccountRegisterSubmit', '注册', FX(1096), FY(572.5), S(296), S(59), k, 'secondary', () => host.submitRegister(), 27);

    // 新玩家提示(登录中 / 报错也走这一行)
    this.accountStatusY = cy + FY(637);
    host.addStatus('新玩家点「注册」直接开号进游戏', layout, this.accountStatusY, C.sub);

    mountGlassLine(host, root, 'LoginDivider', FX(936), FY(673.5), S(618), Math.max(1, S(1)), new Color(255, 255, 255, 30));
    this.renderAgreement(root, FX, FY, S, state.agreementAccepted);
  }

  /** 输入行:灰字标签 + 深色圆角输入框(glass input)+ 左线条图标 + 无框 EditBox + 框内右侧格式提示。 */
  private mountInputRow(
    layout: UiLayout,
    root: Node,
    cx: number,
    cy: number,
    row: { label: string; labelY: number; inputY: number; icon: string; placeholder: string; hint: string; editRight: number; password: boolean },
  ): EditBox {
    const host = this.host;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const draftKey = row.password ? 'password' : 'account';
    glassLabel(host, root, `Label_${draftKey}`, row.label, FX(632), FY(row.labelY), S(21), C.label, S(120));
    const frame = host.addChildPlainNode(root, `InputFrame_${draftKey}`, FX(936), FY(row.inputY), S(618), S(58));
    if (!mountGlassSlice(host, frame, 'Glass', GLASS_SLICES.input, 0, 0, S(618), S(58), k)) {
      const g = frame.addComponent(Graphics);
      g.fillColor = new Color(11, 13, 20, 225);
      g.roundRect(-S(309), -S(29), S(618), S(58), S(14));
      g.fill();
      g.strokeColor = new Color(255, 255, 255, 40);
      g.lineWidth = Math.max(1, k);
      g.roundRect(-S(309), -S(29), S(618), S(58), S(14));
      g.stroke();
    }
    host.addSprite('Icon', row.icon, FX(667.5) - FX(936), 0, S(28), S(28), frame);
    glassLabel(host, root, `Hint_${draftKey}`, row.hint, FX(1227), FY(row.inputY - 0.5), S(18), C.hint, S(300), HorizontalTextAlignment.RIGHT);
    // EditBox:自绘显示层左沿 = 中心 - (宽 - 28)/2,对到原型占位字起点 x 707;右沿让出框内提示
    const editW = S(row.editRight - 707) + 14;
    const editX = cx + FX(707) + (editW - 28) / 2;
    const box = host.addFramedEditBox(this.drafts[draftKey], editX, cy + FY(row.inputY), editW, layout, row.password, {
      frameless: true, placeholder: row.placeholder, placeholderColor: C.placeholder,
    });
    const keep = (): void => {
      if (box.isValid) {
        this.drafts[draftKey] = box.string;
      }
    };
    box.node.on(EditBox.EventType.TEXT_CHANGED, keep, this);
    box.node.on(EditBox.EventType.EDITING_DID_ENDED, keep, this);
    return box;
  }

  /** 右上角圆形玻璃钮:暗玻璃圆 + 淡白描边 + 白线条图标,下方灰字。 */
  private mountRailButton(root: Node, name: string, x: number, y: number, d: number, labelY: number, fontSize: number, icon: string, text: string, onClick: () => void): void {
    const host = this.host;
    const node = host.addChildPlainNode(root, name, x, y, d, d);
    const g = node.addComponent(Graphics);
    g.fillColor = C.railFill;
    g.circle(0, 0, d / 2);
    g.fill();
    g.strokeColor = C.railStroke;
    g.lineWidth = Math.max(1, d / 50);
    g.circle(0, 0, d / 2);
    g.stroke();
    host.addSprite('Icon', icon, 0, 0, d * 0.5, d * 0.5, node);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, onClick);
    host.applyImageButtonFeedback(node, 1.06, 0.94);
    host.applyPointerCursor(node);
    glassLabel(host, root, `${name}Label`, text, x, labelY, fontSize, GLASS_COLOR.sub, d * 1.6, HorizontalTextAlignment.CENTER);
  }

  /** 协议行(原型 y 711):香槟描边勾选框 + 灰字 + 香槟协议名(可点开全文),整行居中。 */
  private renderAgreement(root: Node, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, accepted: boolean): void {
    const host = this.host;
    const fontSize = S(22);
    const parts: Array<{ text: string; doc?: 'terms' | 'privacy' }> = [
      { text: '我已阅读并同意' },
      { text: '《用户协议》', doc: 'terms' },
      { text: ' 和 ' },
      { text: '《隐私政策》', doc: 'privacy' },
    ];
    const unit = (ch: string): number => (/[ -~]/.test(ch) ? 0.5 : 1);
    const widths = parts.map((part) => Array.from(part.text).reduce((sum, ch) => sum + unit(ch), 0) * fontSize);
    const box = S(28);
    const gap = S(20);
    const total = box + gap + widths.reduce((sum, w) => sum + w, 0);
    const y = FY(711);
    let x = FX(936) - total / 2;
    // 勾选框:暗底 + 香槟细边,选中多一个香槟勾;整框(放大热区)可点
    const check = host.addChildPlainNode(root, 'LoginAgreementBox', x + box / 2, y, box + S(16), box + S(16));
    const g = check.addComponent(Graphics);
    const r = box * 0.2;
    g.fillColor = new Color(18, 22, 29, 220);
    g.roundRect(-box / 2, -box / 2, box, box, r);
    g.fill();
    g.strokeColor = accepted ? GLASS_COLOR.champagne : new Color(150, 160, 172, 220);
    g.lineWidth = Math.max(1.2, box * 0.07);
    g.roundRect(-box / 2, -box / 2, box, box, r);
    g.stroke();
    if (accepted) {
      g.strokeColor = GLASS_COLOR.champagne;
      g.lineWidth = Math.max(1.6, box * 0.1);
      g.moveTo(-box * 0.26, 0);
      g.lineTo(-box * 0.06, -box * 0.2);
      g.lineTo(box * 0.28, box * 0.2);
      g.stroke();
    }
    check.addComponent(Button);
    check.on(Button.EventType.CLICK, () => host.toggleLoginAgreement(), this);
    host.applyPointerCursor(check);
    x += box + gap;
    parts.forEach((part, index) => {
      const width = widths[index];
      const label = glassLabel(host, root, part.doc === 'terms' ? 'LoginAgreementTermsLink' : part.doc === 'privacy' ? 'LoginAgreementPrivacyLink' : `LoginAgreementText_${index}`,
        part.text, x, y, fontSize, part.doc ? GLASS_COLOR.champagne : C.sub, width + S(6));
      if (part.doc) {
        const doc = part.doc;
        label.node.addComponent(Button);
        label.node.on(Button.EventType.CLICK, () => host.openLegalDocument?.(doc), this);
        host.applyPointerCursor(label.node);
      }
      x += width;
    });
  }

  /** 语言选择弹框(B 风格):压暗遮罩 + 玻璃窗 + 标题 / 说明 + 两个选项胶囊(当前语言暗金选中白字)+ ✕。点空白关闭。 */
  renderLanguageDialog(layout: UiLayout): void {
    const host = this.host;
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const overlay = host.createUiNode('LoginLanguageDialog');
    overlay.setPosition(cx, cy, 0);
    const W = layout.width;
    const H = layout.height;
    overlay.addComponent(UITransform).setContentSize(new Size(W, H));
    const dim = host.addChildPlainNode(overlay, 'Dim', 0, 0, W * 2, H * 2);
    const dg = dim.addComponent(Graphics);
    dg.fillColor = new Color(4, 6, 10, 200);
    dg.rect(-W, -H, W * 2, H * 2);
    dg.fill();
    dim.addComponent(BlockInputEvents);
    dim.addComponent(Button);
    dim.on(Button.EventType.CLICK, () => host.closeLoginLanguageDialog());

    const pw = S(560);
    const ph = S(340);
    const panel = host.addChildPlainNode(overlay, 'Panel', 0, 0, pw, ph);
    panel.addComponent(BlockInputEvents);
    // 实底玻璃卡:先垫一层近不透明深底,底下登录卡的字不透出来(同输出周榜弹窗口径)
    const solid = panel.addComponent(Graphics);
    solid.fillColor = new Color(16, 20, 28, 240);
    solid.roundRect(-pw / 2, -ph / 2, pw, ph, S(12));
    solid.fill();
    mountGlassSlice(host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, pw, ph, k);
    glassLabel(host, panel, 'Title', lootChainI18n.t('language.title'), -pw / 2 + S(44), ph / 2 - S(54), S(32), GLASS_COLOR.text, S(360), HorizontalTextAlignment.LEFT, true);
    glassLabel(host, panel, 'Subtitle', lootChainI18n.t('language.subtitle'), -pw / 2 + S(44), ph / 2 - S(96), S(20), C.sub, pw - S(88));
    // ✕(画两笔,不依赖贴图)
    const close = host.addChildPlainNode(panel, 'Close', pw / 2 - S(44), ph / 2 - S(50), S(60), S(60));
    const cg = close.addComponent(Graphics);
    cg.strokeColor = new Color(220, 224, 230, 230);
    cg.lineWidth = Math.max(1.5, S(2.4));
    const a = S(11);
    cg.moveTo(-a, -a);
    cg.lineTo(a, a);
    cg.moveTo(-a, a);
    cg.lineTo(a, -a);
    cg.stroke();
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => host.closeLoginLanguageDialog());
    host.applyImageButtonFeedback(close, 1.08, 0.94);
    host.applyPointerCursor(close);

    const current = lootChainI18n.currentLanguage();
    const options: Array<{ lang: LootChainLanguage; key: 'language.simplifiedChinese' | 'language.english' }> = [
      { lang: 'zh-CN', key: 'language.simplifiedChinese' },
      { lang: 'en-US', key: 'language.english' },
    ];
    const ow = (pw - S(88) - S(20)) / 2;
    options.forEach((opt, index) => {
      const x = -pw / 2 + S(44) + ow / 2 + index * (ow + S(20));
      mountGlassButton(host, panel, `LoginLanguageOption_${opt.lang}`, lootChainI18n.t(opt.key), x, -S(40), ow, S(64), k,
        opt.lang === current ? 'selected' : 'secondary', () => host.selectLoginLanguage(opt.lang), 24);
    });
    const tip = glassLabel(host, panel, 'Tip', '点击空白关闭', 0, -ph / 2 + S(36), S(18), GLASS_COLOR.dim, pw - S(88), HorizontalTextAlignment.CENTER);
    tip.overflow = Label.Overflow.SHRINK;
  }
}
