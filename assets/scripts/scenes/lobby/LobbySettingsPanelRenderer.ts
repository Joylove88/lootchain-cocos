import {
  BlockInputEvents,
  Button,
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
import { lootChainI18n, type LootChainLanguage } from '../../i18n/LootChainI18n';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';

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
 * 大厅设置页当前只承载本地显示语言切换，不连接账号、经济、背包、英雄养成或抽卡写接口。
 */
export class LobbySettingsPanelRenderer {
  constructor(private readonly host: LobbySettingsPanelHost) {}

  render(layout: UiLayout): void {
    const scale = Math.max(0.72, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelWidth = Math.min(layout.stageWidth - 44 * scale, 620 * scale);
    const panelHeight = Math.min(layout.stageHeight - 86 * scale, 430 * scale);

    const dim = this.createUiNode('LobbySettingsDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 120);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.createUiNode('LobbySettingsSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);

    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbySettingsSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(7, 7, 10, 236),
      rgba(192, 145, 66, 226),
      18 * scale,
    );
    this.drawPanelChrome(panel, panelWidth, panelHeight, scale);
    this.renderHeader(panel, panelWidth, panelHeight, scale);
    this.renderLanguageSection(panel, panelWidth, panelHeight, scale);
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbySettingsBackButton', () => this.host.closeLobbySettingsPanel(), scale, lootChainI18n.t('settings.title'));
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private renderHeader(parent: Node, width: number, height: number, scale: number): void {
    // 中央标题移除:页面标题统一由左上返回组件的横幅承担。

    const subtitle = this.host.addChildLabel(
      parent,
      'LobbySettingsSubtitle',
      lootChainI18n.t('settings.languageDetail'),
      0,
      height / 2 - 91 * scale, 19 * scale,
      rgba(198, 168, 104),
      new Size(width - 118 * scale, 28 * scale),
    );
    subtitle.overflow = Label.Overflow.SHRINK;
    this.applyOutline(subtitle, scale, false);
  }

  private renderLanguageSection(parent: Node, width: number, height: number, scale: number): void {
    const sectionWidth = Math.min(width - 82 * scale, 490 * scale);
    const sectionHeight = 190 * scale;
    const sectionY = -12 * scale;
    const section = this.host.addChildBeveledPanelNode(
      parent,
      'LobbySettingsLanguagePanel',
      0,
      sectionY,
      sectionWidth,
      sectionHeight,
      rgba(14, 12, 13, 210),
      rgba(135, 99, 52, 176),
      14 * scale,
    );

    const label = this.host.addChildLabel(
      section,
      'LobbySettingsLanguageLabel',
      lootChainI18n.t('settings.languageRow'),
      -sectionWidth / 2 + 30 * scale,
      sectionHeight / 2 - 42 * scale,
      22 * scale,
      rgba(245, 218, 151),
      new Size(sectionWidth - 60 * scale, 34 * scale),
      HorizontalTextAlignment.LEFT,
    );
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);

    const current = this.host.addChildLabel(
      section,
      'LobbySettingsCurrentLanguage',
      `${lootChainI18n.t('language.current')}  ${lootChainI18n.languageLabel()}`,
      -sectionWidth / 2 + 30 * scale,
      sectionHeight / 2 - 75 * scale, 18 * scale,
      rgba(184, 163, 118),
      new Size(sectionWidth - 60 * scale, 26 * scale),
      HorizontalTextAlignment.LEFT,
    );
    current.overflow = Label.Overflow.SHRINK;

    const buttonWidth = Math.min(186 * scale, (sectionWidth - 84 * scale) / 2);
    const buttonHeight = 48 * scale;
    const gap = 24 * scale;
    const buttonY = -sectionHeight / 2 + 48 * scale;
    this.addLanguageButton(section, 'zh-CN', -buttonWidth / 2 - gap / 2, buttonY, buttonWidth, buttonHeight, scale);
    this.addLanguageButton(section, 'en-US', buttonWidth / 2 + gap / 2, buttonY, buttonWidth, buttonHeight, scale);
  }

  private addLanguageButton(parent: Node, language: LootChainLanguage, x: number, y: number, width: number, height: number, scale: number): void {
    const active = lootChainI18n.currentLanguage() === language;
    const button = this.host.addChildPlainNode(parent, `LobbySettingsLanguageButton_${language}`, x, y, width, height);
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => this.host.setLobbyLanguage(language), this);
    this.host.applyImageButtonFeedback(button, 1.025, 0.975);

    const graphics = button.addComponent(Graphics);
    const bevel = 10 * scale;
    graphics.fillColor = active ? rgba(89, 65, 30, 238) : rgba(12, 11, 13, 218);
    this.traceBeveled(graphics, width, height, bevel);
    graphics.fill();
    graphics.strokeColor = active ? rgba(245, 203, 101, 236) : rgba(132, 96, 50, 188);
    graphics.lineWidth = Math.max(1, active ? 2 * scale : 1.3 * scale);
    this.traceBeveled(graphics, width, height, bevel);
    graphics.stroke();

    const text = language === 'zh-CN' ? lootChainI18n.t('language.simplifiedChinese') : lootChainI18n.t('language.english');
    const label = this.host.addChildLabel(button, 'LobbySettingsLanguageButtonLabel', text, 0, 0, 20 * scale, active ? rgba(255, 231, 166) : rgba(219, 196, 145), new Size(width - 28 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, active);
  }

  private drawPanelChrome(parent: Node, width: number, height: number, scale: number): void {
    const graphics = parent.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 78);
    graphics.rect(-width / 2, height / 2 - 116 * scale, width, 1.5 * scale);
    graphics.rect(-width / 2, -height / 2 + 72 * scale, width, 1.5 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(220, 174, 82, 86);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.moveTo(-width / 2 + 38 * scale, height / 2 - 116 * scale);
    graphics.lineTo(width / 2 - 38 * scale, height / 2 - 116 * scale);
    graphics.moveTo(-width / 2 + 38 * scale, -height / 2 + 72 * scale);
    graphics.lineTo(width / 2 - 38 * scale, -height / 2 + 72 * scale);
    graphics.stroke();
  }

  private traceBeveled(graphics: Graphics, width: number, height: number, bevel: number): void {
    graphics.moveTo(-width / 2 + bevel, height / 2);
    graphics.lineTo(width / 2 - bevel, height / 2);
    graphics.lineTo(width / 2, height / 2 - bevel);
    graphics.lineTo(width / 2, -height / 2 + bevel);
    graphics.lineTo(width / 2 - bevel, -height / 2);
    graphics.lineTo(-width / 2 + bevel, -height / 2);
    graphics.lineTo(-width / 2, -height / 2 + bevel);
    graphics.lineTo(-width / 2, height / 2 - bevel);
    graphics.close();
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 228 : 190);
    label.outlineWidth = Math.max(1, (strong ? 1.5 : 1) * scale);
  }
}
