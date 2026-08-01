import {
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
import { lootChainI18n } from '../../i18n/LootChainI18n';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { LOBBY_SYSTEM_ICONS } from './LobbyHudConfig';
import { lobbyHudEdgeInset, lobbyHudScale, resolveLobbyHudModeSize, resolveLobbyPlayerInfoLayout } from './LobbyHudLayout';
import {
  LOBBY_C1812_RESOURCE_ICON_ASSETS,
  LOBBY_PLAYER_INFO_PANEL_ASSET,
  rgba,
  type LobbyHudHost,
  type LobbyResourceItem,
  type LobbySystemIconKey,
  type UiLayout,
} from './LobbyHudTypes';

/**
 * 大厅顶部 HUD 渲染器。
 *
 * 负责左上角玩家信息、顶部资源条和右上角系统图标。
 * 这里仍然只做只读展示和本地未开放提示，不接入任何玩法或经济写入口。
 */
export class LobbyTopHudRenderer {
  constructor(private readonly host: LobbyHudHost) {}

  render(layout: UiLayout): void {
    this.renderPlayerInfo(layout);
    this.renderResourceBar(layout);
    this.renderSystemIcons(layout);
  }

  private get node(): Node {
    return this.host.node;
  }

  private currentLobbyProfile(): PlayerLobbyProfileVO {
    return this.host.currentLobbyProfile();
  }

  private openPlayerProfileDialog(): void {
    this.host.openPlayerProfileDialog();
  }

  private createUiNode(name: string): Node {
    return this.host.createUiNode(name);
  }

  private addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null {
    return this.host.addSprite(name, assetPath, x, y, width, height, parent);
  }

  private addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize?: Size,
    horizontalAlign: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
  ): Label {
    return this.host.addChildLabel(parent, name, text, x, y, fontSize, color, contentSize, horizontalAlign);
  }

  private addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
    return this.host.addChildPlainNode(parent, name, x, y, width, height);
  }

  private addLobbyAvatar(parent: Node, x: number, y: number, size: number, displayName: string): void {
    this.host.addLobbyAvatar(parent, x, y, size, displayName);
  }

  private applyImageButtonFeedback(node: Node, hoverScale = 1.035, pressedScale = 0.975): void {
    this.host.applyImageButtonFeedback(node, hoverScale, pressedScale);
  }

  private setStatus(text: string): void {
    this.host.setStatus(text);
  }

  private openLobbyPlaceholderDialog(title: string, detail?: string): void {
    this.host.openLobbyPlaceholderDialog(title, detail);
  }

  private openLobbySettingsPanel(): void {
    this.host.openLobbySettingsPanel();
  }

  private showUnopenedFeature(title: string, detail?: string): void {
    // 顶部系统图标当前仍是占位入口，点击时只打开统一未开放弹窗。
    this.openLobbyPlaceholderDialog(title, detail);
  }

  private formatInteger(value: number | null | undefined): string {
    return this.host.formatInteger(value);
  }

  private compactResourceValue(value: unknown): string {
    const parsed = Number(value ?? 0);
    return this.host.compactResourceValue(Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0);
  }

  private renderPlayerInfo(layout: UiLayout): void {
    const profile = this.currentLobbyProfile();
    const playerLayout = resolveLobbyPlayerInfoLayout(layout);
    const panelWidth = playerLayout.width;
    const panelHeight = playerLayout.height;
    const hudScale = playerLayout.scale;
    const panel = this.createUiNode('LobbyPlayerInfoButton');
    panel.setPosition(new Vec3(playerLayout.x, playerLayout.y, 0));
    panel.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    if (!this.addSprite('LobbyPlayerInfoArt', LOBBY_PLAYER_INFO_PANEL_ASSET, 0, 0, panelWidth, panelHeight, panel)) {
      this.drawPlayerInfoFallbackFrame(panel, panelWidth, panelHeight, hudScale);
      this.addLobbyAvatar(panel, -panelWidth / 2 + 80 * hudScale, panelHeight / 2 - 90 * hudScale, 125 * hudScale, profile.displayName);
    }
    panel.addComponent(Button);
    panel.on(Button.EventType.CLICK, () => this.openPlayerProfileDialog(), this);
    this.applyImageButtonFeedback(panel, 1.006, 0.994);

    const panelLeft = -panelWidth / 2;
    const panelTop = panelHeight / 2;
    const textX = panelLeft + 160 * hudScale;
    // 文字区从头像右侧开始，并使用 SHRINK 防止长名字或战力压住头像框。
    const textWidth = Math.max(190 * hudScale, Math.min(panelWidth - 178 * hudScale, 340 * hudScale));
    const levelLabel = this.addChildLabel(
      panel,
      'LobbyPlayerLevel',
      `Lv.${profile.playerLevel}`,
      textX,
      panelTop - 52 * hudScale,
      21 * hudScale,
      rgba(226, 201, 145),
      new Size(118 * hudScale, 30 * hudScale),
      HorizontalTextAlignment.LEFT,
    );
    levelLabel.overflow = Label.Overflow.SHRINK;
    this.applyPlayerTextStyle(levelLabel, hudScale, false);
    const nameLabel = this.addChildLabel(
      panel,
      'LobbyPlayerName',
      profile.displayName,
      textX,
      panelTop - 86 * hudScale,
      27 * hudScale,
      rgba(250, 226, 164),
      new Size(textWidth, 36 * hudScale),
      HorizontalTextAlignment.LEFT,
    );
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.applyPlayerTextStyle(nameLabel, hudScale, true);
    this.addNameSigil(panel, textX + Math.min(154 * hudScale, textWidth + 12 * hudScale), panelTop - 86 * hudScale, hudScale);
    const powerLabel = this.addChildLabel(
      panel,
      'LobbyPlayerPower',
      `战力 ${this.formatInteger(profile.combatPower)}`,
      textX,
      panelTop - 128 * hudScale,
      22 * hudScale,
      rgba(224, 190, 112),
      new Size(textWidth, 32 * hudScale),
      HorizontalTextAlignment.LEFT,
    );
    powerLabel.overflow = Label.Overflow.SHRINK;
    this.applyPlayerTextStyle(powerLabel, hudScale, false);
    this.addPowerUnderline(panel, panelLeft + 366 * hudScale, panelTop - 150 * hudScale, 250 * hudScale, hudScale);
    const expLabel = this.addChildLabel(
      panel,
      'LobbyPlayerExpBadge',
      this.expBadgeText(profile),
      panelLeft + 80 * hudScale,
      panelTop - 160 * hudScale,
      17 * hudScale,
      rgba(245, 210, 122),
      new Size(92 * hudScale, 26 * hudScale),
    );
    expLabel.overflow = Label.Overflow.SHRINK;
    this.applyPlayerTextStyle(expLabel, hudScale, false);
  }

  private renderResourceBar(layout: UiLayout): void {
    const profile = this.currentLobbyProfile();
    const playerLayout = resolveLobbyPlayerInfoLayout(layout);
    const scale = lobbyHudScale(layout);
    const hudInsetX = lobbyHudEdgeInset(layout, 'x', scale);
    const hudInsetY = lobbyHudEdgeInset(layout, 'y', scale);
    const itemHeight = 34 * scale;
    const gap = 14 * scale;
    const modeWidth = resolveLobbyHudModeSize(layout).width;
    let items = this.resourceItems(profile);
    if (modeWidth < 720) {
      items = items.slice(0, 1);
    } else if (modeWidth < 840) {
      items = items.slice(0, 2);
    } else if (modeWidth < 1180) {
      items = items.slice(0, 3);
    }

    let itemWidths = items.map((item) => this.resourceItemWidth(item.key, scale));
    let totalWidth = this.sumWithGaps(itemWidths, gap);
    const systemWidth = this.systemIconsWidth(scale);
    const systemLeft = layout.stageRight - hudInsetX - systemWidth;
    const systemVisible = modeWidth >= 720 && systemLeft >= playerLayout.right + 14 * scale;
    const right = layout.stageRight - hudInsetX - (systemVisible ? systemWidth + 22 * scale : 0);
    const minGapFromPlayer = 18 * scale;
    // 空间不足时从右往左减少资源项，优先保证不和左上玩家信息重叠。
    while (items.length > 0 && right - totalWidth < playerLayout.right + minGapFromPlayer) {
      items = items.slice(0, -1);
      itemWidths = itemWidths.slice(0, -1);
      totalWidth = this.sumWithGaps(itemWidths, gap);
    }
    if (items.length === 0) {
      this.renderCompactStaminaChip(layout, profile, playerLayout, scale);
      return;
    }

    const bar = this.createUiNode('LobbyResourceBar');
    const barX = right - totalWidth / 2;
    const barY = layout.stageTop - hudInsetY - itemHeight / 2;
    bar.setPosition(new Vec3(barX, barY, 0));
    bar.addComponent(UITransform).setContentSize(new Size(totalWidth, itemHeight));

    let cursorX = -totalWidth / 2;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const width = itemWidths[index] ?? 0;
      if (!item || width <= 0) {
        continue;
      }
      this.addResourceItem(bar, item, cursorX + width / 2, width, itemHeight, scale);
      cursorX += width + gap;
    }
  }

  private renderCompactStaminaChip(layout: UiLayout, profile: PlayerLobbyProfileVO, playerLayout: ReturnType<typeof resolveLobbyPlayerInfoLayout>, scale: number): void {
    if (layout.stageHeight < 260) {
      return;
    }
    const item = this.resourceItems(profile)[0];
    if (!item) {
      return;
    }
    const hudInsetX = lobbyHudEdgeInset(layout, 'x', scale);
    const chipWidth = Math.min(132 * scale, layout.stageWidth - hudInsetX * 2);
    const chipHeight = 32 * scale;
    const chipX = Math.min(layout.stageRight - hudInsetX - chipWidth / 2, Math.max(layout.stageLeft + hudInsetX + chipWidth / 2, playerLayout.right - chipWidth / 2));
    const chipY = playerLayout.bottom - 12 * scale - chipHeight / 2;
    if (chipY - chipHeight / 2 < layout.stageBottom + 8 * scale) {
      return;
    }
    const node = this.createUiNode('LobbyCompactStaminaChip');
    node.setPosition(new Vec3(chipX, chipY, 0));
    node.addComponent(UITransform).setContentSize(new Size(chipWidth, chipHeight));
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.showUnopenedFeature(`资源：${item.label}`, this.resourcePlaceholderDetail(item)), this);
    this.applyImageButtonFeedback(node, 1.018, 0.985);
    const graphics = node.addComponent(Graphics);
    this.drawResourceCapsule(graphics, chipWidth, chipHeight, scale);
    this.addResourceGlyph(node, item.key, -chipWidth / 2 + 17 * scale, 0, 21 * scale, item.tint, scale);
    const value = this.addChildLabel(
      node,
      'LobbyCompactStaminaValue',
      item.value,
      -chipWidth / 2 + 38 * scale,
      0, 20 * scale,
      rgba(245, 222, 168),
      new Size(chipWidth - 50 * scale, chipHeight),
      HorizontalTextAlignment.LEFT,
    );
    value.overflow = Label.Overflow.SHRINK;
    this.applyTopTextStyle(value, scale, true);
  }

  private renderSystemIcons(layout: UiLayout): void {
    const scale = lobbyHudScale(layout);
    const hudInsetX = lobbyHudEdgeInset(layout, 'x', scale);
    const hudInsetY = lobbyHudEdgeInset(layout, 'y', scale);
    const iconSize = this.systemIconSize(scale);
    const gap = 14 * scale;
    const totalWidth = this.systemIconsWidth(scale);
    const playerLayout = resolveLobbyPlayerInfoLayout(layout);
    const systemLeft = layout.stageRight - hudInsetX - totalWidth;
    if (resolveLobbyHudModeSize(layout).width < 720 || systemLeft < playerLayout.right + 14 * scale) {
      return;
    }
    const x = layout.stageRight - hudInsetX - totalWidth / 2;
    const y = layout.stageTop - hudInsetY - iconSize / 2;
    const group = this.createUiNode('LobbySystemIcons');
    group.setPosition(new Vec3(x, y, 0));
    group.addComponent(UITransform).setContentSize(new Size(totalWidth, iconSize));

    let cursorX = -totalWidth / 2 + iconSize / 2;
    for (const key of LOBBY_SYSTEM_ICONS) {
      this.addSystemIcon(group, key, cursorX, 0, iconSize, scale, key === 'menu');
      cursorX += iconSize + gap;
    }
  }

  private resourceItems(profile: PlayerLobbyProfileVO): LobbyResourceItem[] {
    return [
      {
        key: 'stamina',
        label: '体力',
        value: `${this.formatInteger(profile.stamina)}/${this.formatInteger(profile.maxStamina)}`,
        tint: rgba(104, 202, 226),
      },
      {
        key: 'coin',
        label: '金币',
        value: this.compactResourceValue(profile.gold),
        tint: rgba(222, 172, 84),
      },
      {
        key: 'ruby',
        label: '钻石',
        value: this.compactResourceValue(profile.diamond),
        tint: rgba(212, 50, 73),
      },
      {
        key: 'crystal',
        label: '水晶',
        value: '未开放',
        tint: rgba(132, 94, 226),
      },
    ];
  }

  private expBadgeText(profile: PlayerLobbyProfileVO): string {
    const progress = profile.levelProgress;
    if (!progress || progress.nextLevel == null) {
      return 'EXP';
    }
    return `EXP ${Math.max(0, Math.min(100, Math.trunc(progress.progressPercent)))}%`;
  }

  private resourceItemWidth(key: LobbyResourceItem['key'], scale: number): number {
    if (key === 'stamina') {
      return 128 * scale;
    }
    if (key === 'coin') {
      return 122 * scale;
    }
    return 112 * scale;
  }

  private sumWithGaps(values: number[], gap: number): number {
    return values.reduce((total, value) => total + value, 0) + Math.max(0, values.length - 1) * gap;
  }

  private applyPlayerTextStyle(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = strong ? rgba(0, 0, 0, 230) : rgba(0, 0, 0, 205);
    label.outlineWidth = Math.max(1, (strong ? 1.8 : 1.25) * scale);
  }

  private drawPlayerInfoFallbackFrame(parent: Node, width: number, height: number, scale: number): void {
    const graphics = parent.addComponent(Graphics);
    const left = -width / 2;
    const right = width / 2;
    const top = height / 2;
    const avatarCenterX = left + 80 * scale;

    graphics.fillColor = rgba(3, 5, 9, 54);
    graphics.moveTo(left + 126 * scale, top - 34 * scale);
    graphics.lineTo(right - 22 * scale, top - 54 * scale);
    graphics.lineTo(right - 54 * scale, top - 156 * scale);
    graphics.lineTo(left + 130 * scale, top - 176 * scale);
    graphics.lineTo(left + 116 * scale, top - 98 * scale);
    graphics.close();
    graphics.fill();

    graphics.fillColor = rgba(16, 18, 22, 48);
    graphics.moveTo(left + 152 * scale, top - 58 * scale);
    graphics.lineTo(right - 92 * scale, top - 70 * scale);
    graphics.lineTo(right - 126 * scale, top - 140 * scale);
    graphics.lineTo(left + 154 * scale, top - 150 * scale);
    graphics.close();
    graphics.fill();

    graphics.strokeColor = rgba(210, 166, 78, 125);
    graphics.lineWidth = 1.1 * scale;
    graphics.moveTo(left + 146 * scale, top - 150 * scale);
    graphics.lineTo(right - 57 * scale, top - 150 * scale);
    graphics.stroke();

    graphics.fillColor = rgba(90, 53, 17, 215);
    graphics.moveTo(avatarCenterX - 30 * scale, top - 159 * scale);
    graphics.lineTo(avatarCenterX + 38 * scale, top - 159 * scale);
    graphics.lineTo(avatarCenterX + 48 * scale, top - 176 * scale);
    graphics.lineTo(avatarCenterX + 34 * scale, top - 202 * scale);
    graphics.lineTo(avatarCenterX - 34 * scale, top - 202 * scale);
    graphics.lineTo(avatarCenterX - 48 * scale, top - 176 * scale);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(229, 177, 74, 210);
    graphics.lineWidth = 1.5 * scale;
    graphics.stroke();
  }

  private addNameSigil(parent: Node, x: number, y: number, scale: number): void {
    const sigil = new Node('LobbyPlayerNameSigil');
    sigil.layer = this.node.layer;
    parent.addChild(sigil);
    sigil.setPosition(new Vec3(x, y, 0));
    sigil.addComponent(UITransform).setContentSize(new Size(24 * scale, 24 * scale));
    const graphics = sigil.addComponent(Graphics);
    graphics.strokeColor = rgba(209, 164, 78, 214);
    graphics.lineWidth = Math.max(1, 1.35 * scale);
    graphics.moveTo(0, 11 * scale);
    graphics.lineTo(0, -8 * scale);
    graphics.moveTo(-8 * scale, 2 * scale);
    graphics.lineTo(8 * scale, 2 * scale);
    graphics.arc(0, -5 * scale, 7 * scale, Math.PI * 0.08, Math.PI * 0.92, false);
    graphics.moveTo(-7 * scale, -5 * scale);
    graphics.lineTo(-10 * scale, -2 * scale);
    graphics.moveTo(7 * scale, -5 * scale);
    graphics.lineTo(10 * scale, -2 * scale);
    graphics.stroke();
  }

  private addPowerUnderline(parent: Node, x: number, y: number, width: number, scale: number): void {
    const line = new Node('LobbyPlayerPowerUnderline');
    line.layer = this.node.layer;
    parent.addChild(line);
    line.setPosition(new Vec3(x, y, 0));
    line.addComponent(UITransform).setContentSize(new Size(width, 14 * scale));
    const graphics = line.addComponent(Graphics);
    graphics.strokeColor = rgba(178, 137, 72, 130);
    graphics.lineWidth = Math.max(1, 1 * scale);
    graphics.moveTo(-width / 2, 0);
    graphics.lineTo(width / 2, 0);
    graphics.stroke();
  }

  private addResourceItem(parent: Node, item: LobbyResourceItem, x: number, width: number, height: number, scale: number): void {
    const node = this.addChildPlainNode(parent, `LobbyResourceItem_${item.key}`, x, 0, width, height);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.showUnopenedFeature(`资源：${item.label}`, this.resourcePlaceholderDetail(item)), this);
    this.applyImageButtonFeedback(node, 1.018, 0.985);
    const graphics = node.addComponent(Graphics);
    this.drawResourceCapsule(graphics, width, height, scale);

    const glyphSize = 22 * scale;
    this.addResourceGlyph(node, item.key, -width / 2 + 16 * scale, 0, glyphSize, item.tint, scale);
    const textX = -width / 2 + 37 * scale;
    const textWidth = Math.max(28 * scale, width - 66 * scale);
    const value = this.addChildLabel(
      node,
      `LobbyResourceValue_${item.key}`,
      item.value,
      textX,
      0,
      21 * scale,
      rgba(245, 222, 168),
      new Size(textWidth, 28 * scale),
      HorizontalTextAlignment.LEFT,
    );
    value.overflow = Label.Overflow.SHRINK;
    this.applyTopTextStyle(value, scale, true);
    this.addDisabledPlus(node, width / 2 - 15 * scale, 0, 16 * scale, scale);
  }

  private drawResourceCapsule(graphics: Graphics, width: number, height: number, scale: number): void {
    // 资源格用斜切胶囊压住背景，当前阶段只作为只读/未开放展示，不表达可购买状态。
    const bevel = 9 * scale;
    graphics.fillColor = rgba(0, 0, 0, 84);
    this.traceResourceCapsule(graphics, width + 6 * scale, height, bevel, -2 * scale);
    graphics.fill();
    graphics.fillColor = rgba(5, 6, 9, 154);
    this.traceResourceCapsule(graphics, width, height - 4 * scale, bevel, 0);
    graphics.fill();
    graphics.fillColor = rgba(24, 18, 10, 72);
    this.traceResourceCapsule(graphics, width - 8 * scale, 12 * scale, bevel * 0.7, height / 2 - 9 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(116, 87, 47, 150);
    graphics.lineWidth = Math.max(1, 1 * scale);
    this.traceResourceCapsule(graphics, width, height - 4 * scale, bevel, 0);
    graphics.stroke();
    graphics.strokeColor = rgba(222, 178, 94, 76);
    graphics.moveTo(-width / 2 + 14 * scale, height / 2 - 4 * scale);
    graphics.lineTo(width / 2 - 18 * scale, height / 2 - 4 * scale);
    graphics.stroke();
  }

  private traceResourceCapsule(graphics: Graphics, width: number, height: number, bevel: number, yOffset: number): void {
    graphics.moveTo(-width / 2 + bevel, height / 2 + yOffset);
    graphics.lineTo(width / 2 - bevel, height / 2 + yOffset);
    graphics.lineTo(width / 2, yOffset);
    graphics.lineTo(width / 2 - bevel, -height / 2 + yOffset);
    graphics.lineTo(-width / 2 + bevel, -height / 2 + yOffset);
    graphics.lineTo(-width / 2, yOffset);
    graphics.close();
  }

  private resourcePlaceholderDetail(item: LobbyResourceItem): string {
    if (item.key === 'stamina') {
      return `当前值：${item.value}。体力来自只读玩家资料；购买、领取和恢复加速入口暂未开放。`;
    }
    return `当前值：${item.value}。该资源当前为大厅视觉占位，待只读资产汇总接口开放后再接入真实数量。`;
  }

  private addResourceGlyph(
    parent: Node,
    key: LobbyResourceItem['key'],
    x: number,
    y: number,
    size: number,
    tint: Color,
    scale: number,
  ): void {
    // 优先使用 C1812 货币切图；资源未就绪时回退到矢量图形，避免资源栏出现空位。
    const iconAsset = LOBBY_C1812_RESOURCE_ICON_ASSETS[key];
    if (iconAsset) {
      const iconHeight = size * 1.18;
      const iconWidth = iconHeight * iconAsset.aspect;
      const sprite = this.addSprite(`LobbyResourceIcon_${key}`, iconAsset.path, x, y, iconWidth, iconHeight, parent);
      if (sprite) {
        return;
      }
    }
    const glyph = new Node(`LobbyResourceGlyph_${key}`);
    glyph.layer = this.node.layer;
    parent.addChild(glyph);
    glyph.setPosition(new Vec3(x, y, 0));
    glyph.addComponent(UITransform).setContentSize(new Size(size, size));
    const graphics = glyph.addComponent(Graphics);
    graphics.fillColor = rgba(tint.r, tint.g, tint.b, 225);
    graphics.strokeColor = rgba(18, 13, 8, 220);
    graphics.lineWidth = Math.max(1, 1 * scale);
    const half = size / 2;

    if (key === 'stamina') {
      graphics.moveTo(-half * 0.05, half * 0.9);
      graphics.lineTo(half * 0.46, half * 0.12);
      graphics.lineTo(half * 0.12, half * 0.12);
      graphics.lineTo(half * 0.38, -half * 0.9);
      graphics.lineTo(-half * 0.5, -half * 0.02);
      graphics.lineTo(-half * 0.12, -half * 0.02);
      graphics.close();
      graphics.fill();
      graphics.stroke();
      graphics.strokeColor = rgba(255, 247, 176, 148);
      graphics.moveTo(half * 0.05, half * 0.46);
      graphics.lineTo(half * 0.24, half * 0.1);
      graphics.lineTo(half * 0.03, half * 0.1);
      graphics.stroke();
      return;
    }

    if (key === 'coin') {
      graphics.circle(0, 0, half * 0.72);
      graphics.fill();
      graphics.stroke();
      graphics.strokeColor = rgba(255, 234, 151, 190);
      graphics.lineWidth = Math.max(1, 0.8 * scale);
      graphics.circle(0, 0, half * 0.43);
      graphics.moveTo(-half * 0.28, half * 0.18);
      graphics.lineTo(half * 0.28, half * 0.18);
      graphics.stroke();
      return;
    }

    if (key === 'ruby' || key === 'crystal') {
      graphics.moveTo(0, half * 0.82);
      graphics.lineTo(half * 0.74, 0);
      graphics.lineTo(0, -half * 0.82);
      graphics.lineTo(-half * 0.74, 0);
      graphics.close();
      graphics.fill();
      graphics.stroke();
      graphics.strokeColor = rgba(255, 218, 255, 180);
      graphics.moveTo(-half * 0.43, 0);
      graphics.lineTo(half * 0.43, 0);
      graphics.moveTo(0, half * 0.82);
      graphics.lineTo(0, -half * 0.82);
      graphics.moveTo(-half * 0.34, half * 0.38);
      graphics.lineTo(half * 0.34, -half * 0.38);
      graphics.stroke();
    }
  }

  private applyTopTextStyle(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 220 : 185);
    label.outlineWidth = Math.max(1, (strong ? 1.2 : 0.9) * scale);
  }

  private systemIconSize(scale: number): number {
    return 32 * scale;
  }

  private systemIconsWidth(scale: number): number {
    const iconSize = this.systemIconSize(scale);
    return iconSize * 4 + 14 * scale * 3;
  }

  private addSystemIcon(parent: Node, key: LobbySystemIconKey, x: number, y: number, size: number, scale: number, hot: boolean): void {
    const node = this.addChildPlainNode(parent, `LobbySystemIcon_${key}`, x, y, size, size);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.showUnopenedFeature(this.systemIconTitle(key), '系统入口暂未开放；当前仅保留本地占位反馈，不读取或写入系统数据。'), this);
    if (key === 'settings') {
      node.off(Button.EventType.CLICK);
      node.on(Button.EventType.CLICK, () => this.openLobbySettingsPanel(), this);
    }
    this.applyImageButtonFeedback(node, 1.08, 0.94);
    const graphics = node.addComponent(Graphics);
    graphics.strokeColor = rgba(206, 171, 112, 230);
    graphics.fillColor = rgba(198, 159, 96, 230);
    graphics.lineWidth = Math.max(2, 2.2 * scale);
    const half = size / 2;

    if (key === 'friends') {
      graphics.circle(-half * 0.22, half * 0.2, half * 0.2);
      graphics.fill();
      graphics.circle(half * 0.22, half * 0.2, half * 0.2);
      graphics.fill();
      graphics.moveTo(-half * 0.48, -half * 0.32);
      graphics.bezierCurveTo(-half * 0.42, -half * 0.02, -half * 0.02, half * 0.02, half * 0.02, -half * 0.32);
      graphics.stroke();
      graphics.moveTo(-half * 0.02, -half * 0.32);
      graphics.bezierCurveTo(half * 0.04, -half * 0.02, half * 0.44, half * 0.02, half * 0.48, -half * 0.32);
      graphics.stroke();
    } else if (key === 'mail') {
      graphics.rect(-half * 0.72, -half * 0.42, half * 1.44, half * 0.9);
      graphics.stroke();
      graphics.moveTo(-half * 0.68, half * 0.44);
      graphics.lineTo(0, -half * 0.08);
      graphics.lineTo(half * 0.68, half * 0.44);
      graphics.stroke();
    } else if (key === 'settings') {
      graphics.circle(0, 0, half * 0.55);
      graphics.stroke();
      graphics.circle(0, 0, half * 0.2);
      graphics.stroke();
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8;
        const start = half * 0.68;
        const end = half * 0.88;
        graphics.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
        graphics.lineTo(Math.cos(angle) * end, Math.sin(angle) * end);
      }
      graphics.stroke();
    } else {
      for (let i = -1; i <= 1; i += 1) {
        graphics.moveTo(-half * 0.55, i * half * 0.35);
        graphics.lineTo(half * 0.55, i * half * 0.35);
      }
      graphics.stroke();
    }

    if (hot) {
      this.addRedDot(node, half * 0.42, half * 0.42, 6 * scale, true);
    }
  }

  private systemIconTitle(key: LobbySystemIconKey): string {
    if (key === 'friends') {
      return lootChainI18n.t('lobby.system.friends');
    }
    if (key === 'mail') {
      return lootChainI18n.t('lobby.system.mail');
    }
    if (key === 'settings') {
      return lootChainI18n.t('lobby.system.settings');
    }
    return lootChainI18n.t('lobby.system.menu');
    if (key === 'friends') {
      return '好友';
    }
    if (key === 'mail') {
      return '邮件';
    }
    if (key === 'settings') {
      return '设置';
    }
    return '更多菜单';
  }

  private addDisabledPlus(parent: Node, x: number, y: number, size: number, scale: number): void {
    const node = this.addChildPlainNode(parent, 'LobbyResourceDisabledPlus', x, y, size, size);
    const graphics = node.addComponent(Graphics);
    // 资源加号当前是禁用艺术标记，用低透明圆章避免被误读成充值/购买入口。
    graphics.fillColor = rgba(7, 6, 7, 82);
    graphics.circle(0, 0, size * 0.56);
    graphics.fill();
    graphics.strokeColor = rgba(177, 135, 84, 110);
    graphics.lineWidth = Math.max(1, 1.4 * scale);
    graphics.circle(0, 0, size * 0.56);
    graphics.stroke();
    graphics.strokeColor = rgba(177, 135, 84, 118);
    graphics.lineWidth = Math.max(1, 1.5 * scale);
    graphics.moveTo(-size * 0.35, 0);
    graphics.lineTo(size * 0.35, 0);
    graphics.moveTo(0, -size * 0.35);
    graphics.lineTo(0, size * 0.35);
    graphics.stroke();
  }

  private addRedDot(parent: Node, x: number, y: number, size: number, visible: boolean): void {
    if (!visible) {
      return;
    }
    const node = this.addChildPlainNode(parent, 'LobbyRedDot', x, y, size * 2, size * 2);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(188, 28, 38, 235);
    graphics.moveTo(0, size);
    graphics.lineTo(size, 0);
    graphics.lineTo(0, -size);
    graphics.lineTo(-size, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(255, 91, 76, 210);
    graphics.lineWidth = Math.max(1, size * 0.18);
    graphics.stroke();
  }
}
