import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Node, Size, UITransform } from 'cc';
import type { UiKitHost } from '../UiKit';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassIconButton, mountGlassLine, mountGlassPanel, mountGlassSlice } from '../UiGlassKit';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { gameAudio } from '../../audio/GameAudio';
import { lootChainI18n, type LootChainLanguage } from '../../i18n/LootChainI18n';
import { GRAPHICS_FRAME_RATES, getGraphicsFrameRate, getGraphicsMode, setGraphicsFrameRate, setGraphicsMode } from '../../app/GraphicsSettings';
import type { LegalDocumentKey } from '../../legal/LegalDocuments';

export interface LobbySettingsGlassDialogHost extends UiKitHost {
  createUiNode(name: string): Node;
  setLobbyLanguage(language: LootChainLanguage): void;
  openLegalDocument(key: LegalDocumentKey): void;
  copyLobbySupportEmail(): void;
  /** 改了开关 / 档位后只重挂本弹框。 */
  renderLobbySettingsGlass(): void;
  closeLobbySettingsGlassDialog(): void;
}

export const SUPPORT_EMAIL = 'support@lootchain.game';
const ICON_TINT = new Color(214, 180, 116, 255);

/**
 * 设置弹框(11-02 用户确认原型 周报截图/2026-11-01_B风格补全/proto/settings_b2.png,窗口同公告 / 资料):
 * 终端上弹出,只有 ✕。左列「语言」(简体中文 | English)+「声音」(音乐 / 音效开关);右列「画面」(画质 流畅 | 极致 + 说明、帧率 30 | 60 | 120);
 * 底条:用户协议 / 隐私政策(原协议全文查看层)+ 客服邮箱「复制」。选中态按全局口径 = 暗金底白字。
 */
export class LobbySettingsGlassDialogRenderer {
  static readonly NODE_NAME = 'LobbySettingsGlassDialog';

  constructor(private readonly host: LobbySettingsGlassDialogHost) {}

  render(layout: UiLayout): void {
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, FX, FY, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const T = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const label = glassLabel(this.host, parent, name, text, x, y, S(size), color, width, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };
    const refresh = (): void => this.host.renderLobbySettingsGlass();

    const root = this.host.createUiNode(LobbySettingsGlassDialogRenderer.NODE_NAME);
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(4, 6, 10, 180);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    root.on(Node.EventType.TOUCH_END, () => this.host.closeLobbySettingsGlassDialog(), this);
    const stage = this.host.addChildPlainNode(root, 'Stage', cx, cy, layout.stageWidth, layout.stageHeight);
    const winW = S(1686 - 184);
    const winH = S(786 - 62);
    const win = this.host.addChildPlainNode(stage, 'Window', FX((184 + 1686) / 2), FY((62 + 786) / 2), winW, winH);
    win.addComponent(BlockInputEvents);
    mountGlassSlice(this.host, win, 'GlassBase', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    mountGlassSlice(this.host, win, 'Glass', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    const panel = this.host.addChildPlainNode(stage, 'Panel', 0, 0, layout.stageWidth, layout.stageHeight);

    this.host.addSprite('TitleBar', GLASS_ICON.accent, FX(214), FY(112), S(6), S(32), panel);
    T(panel, 'Title', lootChainI18n.t('settings.title') || '设置', FX(231), FY(112), 32, GLASS_COLOR.text, S(300), HorizontalTextAlignment.LEFT, true);
    mountGlassIconButton(this.host, panel, 'Close', GLASS_ICON.close, FX(1622), FY(111), S(36), S(72), () => this.host.closeLobbySettingsGlassDialog());
    mountGlassLine(this.host, panel, 'TitleLine', FX((208 + 1660) / 2), FY(158), S(1660 - 208), Math.max(1, S(1)), new Color(255, 255, 255, 22));

    const section = (name: string, title: string, x0: number, x1: number, y0: number, y1: number, headerY: number): void => {
      mountGlassPanel(this.host, panel, name, FX((x0 + x1) / 2), FY((y0 + y1) / 2), S(x1 - x0), S(y1 - y0), k);
      this.host.addSprite(`${name}Bar`, GLASS_ICON.accent, FX(x0 + 25), FY(headerY), S(6), S(32), panel);
      T(panel, `${name}Title`, title, FX(x0 + 42), FY(headerY), 26, GLASS_COLOR.text, S(300), HorizontalTextAlignment.LEFT, true);
      mountGlassLine(this.host, panel, `${name}Line`, FX((x0 + x1) / 2), FY(headerY + 34), S(x1 - x0 - 50), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    };

    // 左列 ①「语言」208..920 × 173..365:行 y 300,「游戏语言」左沿 238;分段 590..895
    section('Language', '语言', 208, 920, 173, 365, 211);
    T(panel, 'LanguageLabel', '游戏语言', FX(238), FY(300), 24, GLASS_COLOR.text, S(300));
    const current = lootChainI18n.currentLanguage();
    this.segmented(panel, 'Language', 590, 895, 300, [
      { key: 'zh-CN', text: lootChainI18n.t('language.simplifiedChinese') || '简体中文' },
      { key: 'en-US', text: lootChainI18n.t('language.english') || 'English' },
    ], current, (key) => this.host.setLobbyLanguage(key as LootChainLanguage), FX, FY, S, k, T);

    // 左列 ②「声音」208..920 × 381..662:音乐 y 510 / 音效 y 608,图标 x 250、文字左沿 290,开关贴右 895
    section('Sound', '声音', 208, 920, 381, 662, 419);
    const bgm = gameAudio.bgmEnabled();
    const sfx = gameAudio.sfxEnabled();
    const rows: Array<{ key: string; icon: string; text: string; on: boolean; toggle: () => void; y: number }> = [
      { key: 'Music', icon: 'ui/glass/settings_music/spriteFrame', text: '音乐', on: bgm, toggle: () => gameAudio.setBgmEnabled(!bgm), y: 510 },
      { key: 'Sfx', icon: 'ui/glass/settings_sound/spriteFrame', text: '音效', on: sfx, toggle: () => gameAudio.setSfxEnabled(!sfx), y: 608 },
    ];
    rows.forEach((row) => {
      const icon = this.host.addSprite(`${row.key}Icon`, row.icon, FX(250), FY(row.y), S(38), S(38), panel);
      if (icon) {
        icon.color = ICON_TINT;
      }
      T(panel, `${row.key}Label`, row.text, FX(290), FY(row.y), 24, GLASS_COLOR.text, S(200));
      this.toggle(panel, `${row.key}Toggle`, FX(851), FY(row.y), S(88), S(46), row.on, () => { row.toggle(); refresh(); }, k);
    });
    mountGlassLine(this.host, panel, 'SoundRowLine', FX((233 + 895) / 2), FY(559), S(895 - 233), Math.max(1, S(1)), new Color(255, 255, 255, 20));

    // 右列「画面」944..1660 × 173..662:画质 y 305(分段 1290..1630)+ 说明 y 362;帧率 y 490(分段 1210..1630)
    section('Graphics', '画面', 944, 1660, 173, 662, 211);
    T(panel, 'QualityLabel', '画质', FX(974), FY(305), 24, GLASS_COLOR.text, S(200));
    const mode = getGraphicsMode();
    this.segmented(panel, 'Quality', 1290, 1630, 305, [{ key: 'smooth', text: '流畅' }, { key: 'ultra', text: '极致' }], mode,
      (key) => { setGraphicsMode(key as 'smooth' | 'ultra'); refresh(); }, FX, FY, S, k, T);
    const hint = T(panel, 'QualityHint', '流畅:降低分辨率、减少特效,卡顿时选它;极致:全部拉满', FX(974), FY(372), 19, GLASS_COLOR.sub, S(656));
    hint.overflow = Label.Overflow.CLAMP;
    hint.enableWrapText = true;
    hint.lineHeight = Math.round(hint.fontSize * 1.5);
    hint.node.getComponent(UITransform)?.setContentSize(S(656), hint.lineHeight * 2 + S(4));
    mountGlassLine(this.host, panel, 'GraphicsRowLine', FX((974 + 1630) / 2), FY(430), S(1630 - 974), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    T(panel, 'FpsLabel', '帧率', FX(974), FY(490), 24, GLASS_COLOR.text, S(200));
    this.segmented(panel, 'Fps', 1210, 1630, 490, GRAPHICS_FRAME_RATES.map((fps) => ({ key: String(fps), text: String(fps) })), String(getGraphicsFrameRate()),
      (key) => { setGraphicsFrameRate(Number(key)); refresh(); }, FX, FY, S, k, T);

    // 底条 208..1660 × 682..762:用户协议 / 隐私政策(左)+ 客服邮箱 + 复制(右)
    mountGlassPanel(this.host, panel, 'Footer', FX((208 + 1660) / 2), FY(722), S(1660 - 208), S(80), k);
    this.link(panel, 'TermsLink', '用户协议', FX(240), FY(722), S, T, () => this.host.openLegalDocument('terms'));
    mountGlassLine(this.host, panel, 'FooterSep', FX(372), FY(722), Math.max(1, S(2)), S(26), new Color(120, 128, 140, 200));
    this.link(panel, 'PrivacyLink', '隐私政策', FX(404), FY(722), S, T, () => this.host.openLegalDocument('privacy'));
    T(panel, 'SupportEmail', `客服邮箱:${SUPPORT_EMAIL}`, FX(1520), FY(722), 21, GLASS_COLOR.sub, S(600), HorizontalTextAlignment.RIGHT);
    mountGlassButton(this.host, panel, 'CopyEmail', '复制', FX(1584), FY(722), S(96), S(44), k, 'secondary', () => this.host.copyLobbySupportEmail(), 20);
  }

  /** 分段选择:玻璃底框 + 选中段暗金底白字(全局选中口径);点未选段回调。 */
  private segmented(panel: Node, name: string, x0: number, x1: number, y: number, options: Array<{ key: string; text: string }>, selected: string,
    onPick: (key: string) => void, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number,
    T: (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label): void {
    const h = S(62);
    const box = this.host.addChildPlainNode(panel, `${name}Seg`, FX((x0 + x1) / 2), FY(y), S(x1 - x0), h);
    mountGlassSlice(this.host, box, 'Bg', GLASS_SLICES.panel, 0, 0, S(x1 - x0), h, k);
    const segW = S(x1 - x0) / options.length;
    options.forEach((option, index) => {
      const on = option.key === selected;
      const x = -S(x1 - x0) / 2 + segW * (index + 0.5);
      const node = this.host.addChildPlainNode(box, `${name}_${option.key}`, x, 0, segW, h);
      if (on) {
        mountGlassSlice(this.host, node, 'Sel', GLASS_SLICES.tabGold, 0, 0, segW - S(4), h - S(4), k);
      }
      T(node, 'Label', option.text, 0, 0, 23, on ? GLASS_COLOR.onGold : GLASS_COLOR.text, segW - S(12), HorizontalTextAlignment.CENTER, on);
      if (!on) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => onPick(option.key), this);
        this.host.applyImageButtonFeedback(node, 1.02, 0.97);
      }
    });
  }

  /** 开关:开 = 暗金胶囊 + 右侧亮钮;关 = 玻璃胶囊 + 左侧灰钮。 */
  private toggle(panel: Node, name: string, x: number, y: number, w: number, h: number, on: boolean, onClick: () => void, k: number): void {
    const node = this.host.addChildPlainNode(panel, name, x, y, w, h);
    mountGlassSlice(this.host, node, 'Track', on ? GLASS_SLICES.pillGold : GLASS_SLICES.pillSecondary, 0, 0, w, h, k * 0.8);
    const r = h / 2 - Math.max(3, h * 0.12);
    const knob = this.host.addChildPlainNode(node, 'Knob', on ? w / 2 - h / 2 : -w / 2 + h / 2, 0, r * 2, r * 2);
    const g = knob.addComponent(Graphics);
    g.fillColor = new Color(0, 0, 0, 70);
    g.circle(0, -Math.max(1, r * 0.08), r);
    g.fill();
    g.fillColor = on ? new Color(246, 242, 232, 255) : new Color(168, 174, 186, 255);
    g.circle(0, 0, r * 0.94);
    g.fill();
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(node, 1.04, 0.96);
  }

  /** 文字链接:浅灰字 + 小箭头;x 为文字左沿。 */
  private link(panel: Node, name: string, text: string, x: number, y: number, S: (v: number) => number,
    T: (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label, onClick: () => void): void {
    const w = S(118);
    const node = this.host.addChildPlainNode(panel, name, x + w / 2, y, w, S(52));
    T(node, 'Text', text, -w / 2, 0, 22, new Color(214, 218, 226, 255), S(96));
    this.host.addSprite('Chevron', GLASS_ICON.chevron, w / 2 - S(12), 0, S(16), S(16), node);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(node, 1.03, 0.97);
  }
}
