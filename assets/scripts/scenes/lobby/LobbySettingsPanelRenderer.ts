import {
  BlockInputEvents,
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
import { gameAudio } from '../../audio/GameAudio';
import { lootChainI18n, type LootChainLanguage } from '../../i18n/LootChainI18n';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { GRAPHICS_FRAME_RATES, getGraphicsFrameRate, getGraphicsMode, setGraphicsFrameRate, setGraphicsMode } from '../../app/GraphicsSettings';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { drawPhoneDialogFrame, resolvePhoneDialogSize } from './LobbyPhoneDialogFrame';
import { mountKitBackdrop, mountKitSection, mountKitToggle } from '../UiKit';

/** 手机全屏版里语言 / 声音两区左右并排时的区块矩形(面板内坐标)与区内字号放大系数。 */
interface SettingsSectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
  s: number;
}

export interface LobbySettingsPanelHost {
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  closeLobbySettingsPanel(): void;
  setLobbyLanguage(language: LootChainLanguage): void;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
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
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

/**
 * 大厅设置页:语言 + 声音与画面。只改本地显示 / 音频 / 画质偏好,不连接账号、经济等写接口。
 * 2026-10-10 全界面美化:手机用全屏实景框(与更多 / 任务同款),电脑用 refine_panel_bg 4:3 素净框;
 * 区块换四角金饰底框,选项换水晶页签同款金 / 暗开关(UiKit)。
 */
export class LobbySettingsPanelRenderer {
  /** 两个区块在面板内的矩形(手机左右并排、电脑上下叠放),s 为区内字号缩放。 */
  private languageRect: SettingsSectionRect = { x: 0, y: 0, w: 0, h: 0, s: 1 };
  private audioRect: SettingsSectionRect = { x: 0, y: 0, w: 0, h: 0, s: 1 };

  constructor(private readonly host: LobbySettingsPanelHost) {}

  render(layout: UiLayout): void {
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const phone = isPhoneDesign();
    let panelWidth: number;
    let panelHeight: number;
    if (phone) {
      ({ width: panelWidth, height: panelHeight } = resolvePhoneDialogSize(layout));
      const gap = 48;
      const sectionW = Math.min(640, (panelWidth - 64 - gap) / 2);
      const sectionH = Math.min(420, panelHeight - 190);
      const sectionY = -24;
      this.languageRect = { x: -sectionW / 2 - gap / 2, y: sectionY, w: sectionW, h: sectionH, s: 1.3 };
      this.audioRect = { x: sectionW / 2 + gap / 2, y: sectionY, w: sectionW, h: sectionH, s: 1.3 };
    } else {
      // refine_panel_bg 是 4:3 一体构图,只能等比;内容两侧留 ≥7.5%(外侧透明 + 边框约占 5.5%)
      panelWidth = Math.min(layout.stageWidth - 44 * scale, 860 * scale, (layout.stageHeight - 40 * scale) / 0.75);
      panelHeight = panelWidth * 0.75;
      const sectionW = panelWidth * 0.8;
      const langH = panelHeight * 0.29;
      const audioH = panelHeight * 0.44;
      const gap = panelHeight * 0.035;
      const top = panelHeight / 2 - panelHeight * 0.115;
      this.languageRect = { x: 0, y: top - langH / 2, w: sectionW, h: langH, s: scale };
      this.audioRect = { x: 0, y: top - langH - gap - audioH / 2, w: sectionW, h: audioH, s: scale };
    }

    const dim = this.createUiNode('LobbySettingsDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    if (phone) {
      const dimGraphics = dim.addComponent(Graphics);
      dimGraphics.fillColor = rgba(0, 0, 0, 150);
      dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
      dimGraphics.fill();
    } else {
      mountKitBackdrop(this.host, dim, layout.width, layout.height);
    }
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbySettingsSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);

    const panel = this.host.addChildPlainNode(panelGroup, 'LobbySettingsSceneFrame', 0, 0, panelWidth, panelHeight);
    if (phone) {
      drawPhoneDialogFrame(this.host, panel, panelWidth, panelHeight, 0);
    } else if (!this.host.addSprite('LobbySettingsPanelArt', 'ui/hero/ai/refine_panel_bg/spriteFrame', 0, 0, panelWidth, panelHeight, panel)) {
      this.host.addChildBeveledPanelNode(panel, 'LobbySettingsPanelFallback', 0, 0, panelWidth, panelHeight, rgba(7, 7, 10, 236), rgba(192, 145, 66, 226), 18 * scale);
    }
    this.renderLanguageSection(panel);
    this.renderAudioSection(panel);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbySettingsBackButton', () => this.host.closeLobbySettingsPanel(), scale, lootChainI18n.t('settings.title'));
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  /** 区块标题(左对齐,加粗描边)+ 副行说明;返回区块节点。 */
  private mountSection(parent: Node, name: string, rect: SettingsSectionRect, title: string, detail: string): Node {
    const scale = rect.s;
    const section = mountKitSection(this.host, parent, name, rect.x, rect.y, rect.w, rect.h, scale);
    const padX = 34 * scale;
    const label = this.host.addChildLabel(section, `${name}Title`, title, -rect.w / 2 + padX, rect.h / 2 - 40 * scale, 24 * scale, rgba(248, 222, 160), new Size(rect.w - padX * 2, 34 * scale), HorizontalTextAlignment.LEFT);
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    const sub = this.host.addChildLabel(section, `${name}Detail`, detail, -rect.w / 2 + padX, rect.h / 2 - 72 * scale, 17 * scale, rgba(184, 163, 118), new Size(rect.w - padX * 2, 26 * scale), HorizontalTextAlignment.LEFT);
    sub.overflow = Label.Overflow.SHRINK;
    return section;
  }

  private renderLanguageSection(parent: Node): void {
    const rect = this.languageRect;
    const scale = rect.s;
    const section = this.mountSection(parent, 'LobbySettingsLanguagePanel', rect, lootChainI18n.t('settings.languageRow'), `${lootChainI18n.t('language.current')}  ${lootChainI18n.languageLabel()}`);
    const buttonWidth = Math.min(210 * scale, (rect.w - 96 * scale) / 2);
    const buttonHeight = 56 * scale;
    const gap = 28 * scale;
    // 按钮放在标题区以下剩余空间的中线
    const buttonY = (rect.h / 2 - 92 * scale - rect.h / 2) / 2;
    (['zh-CN', 'en-US'] as LootChainLanguage[]).forEach((language, index) => {
      const active = lootChainI18n.currentLanguage() === language;
      const text = language === 'zh-CN' ? lootChainI18n.t('language.simplifiedChinese') : lootChainI18n.t('language.english');
      mountKitToggle(this.host, section, `LobbySettingsLanguageButton_${language}`, text, (index === 0 ? -1 : 1) * (buttonWidth / 2 + gap / 2), buttonY, buttonWidth, buttonHeight, scale, active,
        () => this.host.setLobbyLanguage(language), 21);
    });
  }

  /** 声音与画面:音乐 / 音效开关 + 画质档位 + 帧率;点击后只重建本区块。 */
  private renderAudioSection(parent: Node): void {
    parent.getChildByName('LobbySettingsAudioPanel')?.destroy();
    const rect = this.audioRect;
    const scale = rect.s;
    const section = this.mountSection(parent, 'LobbySettingsAudioPanel', rect, '声音与画面', '流畅:降低分辨率、减少特效,卡顿时选它;极致:全部拉满');
    const buttonWidth = Math.min(210 * scale, (rect.w - 96 * scale) / 2);
    const buttonHeight = 56 * scale;
    const gap = 28 * scale;
    const rowGap = 16 * scale;
    const areaMid = (rect.h / 2 - 92 * scale - rect.h / 2) / 2;
    const row1 = areaMid + (buttonHeight + rowGap) / 2;
    const row2 = areaMid - (buttonHeight + rowGap) / 2;
    const leftX = -buttonWidth / 2 - gap / 2;
    const rightX = buttonWidth / 2 + gap / 2;
    const refresh = (): void => this.renderAudioSection(parent);
    const bgm = gameAudio.bgmEnabled();
    const sfx = gameAudio.sfxEnabled();
    mountKitToggle(this.host, section, 'LobbySettingsAudioToggle_音乐', `音乐:${bgm ? '开' : '关'}`, leftX, row1, buttonWidth, buttonHeight, scale, bgm, () => { gameAudio.setBgmEnabled(!bgm); refresh(); }, 21);
    mountKitToggle(this.host, section, 'LobbySettingsAudioToggle_音效', `音效:${sfx ? '开' : '关'}`, rightX, row1, buttonWidth, buttonHeight, scale, sfx, () => { gameAudio.setSfxEnabled(!sfx); refresh(); }, 21);
    const smooth = getGraphicsMode() === 'smooth';
    mountKitToggle(this.host, section, 'LobbySettingsAudioToggle_画面', `画面:${smooth ? '流畅' : '极致'}`, leftX, row2, buttonWidth, buttonHeight, scale, !smooth, () => { setGraphicsMode(smooth ? 'ultra' : 'smooth'); refresh(); }, 21);
    const fps = getGraphicsFrameRate();
    const nextFps = GRAPHICS_FRAME_RATES[(GRAPHICS_FRAME_RATES.indexOf(fps as 30 | 60 | 120) + 1) % GRAPHICS_FRAME_RATES.length];
    mountKitToggle(this.host, section, 'LobbySettingsAudioToggle_帧率', `帧率:${fps}`, rightX, row2, buttonWidth, buttonHeight, scale, fps >= 60, () => { setGraphicsFrameRate(nextFps); refresh(); }, 21);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 228 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}
