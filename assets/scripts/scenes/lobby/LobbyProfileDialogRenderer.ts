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
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';

export interface LobbyProfileDialogHost {
  node: Node;
  currentLobbyProfile(): PlayerLobbyProfileVO;
  closePlayerProfileDialog(): void;
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addBeveledPanelNode(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
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
  addChildBeveledPanelNode(parent: Node, name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color, bevel?: number): Node;
  addLobbyAvatar(parent: Node, x: number, y: number, size: number, displayName: string): void;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  formatInteger(value: number | null | undefined): string;
  isLobbyProfileLoading(): boolean;
  getLobbyProfileError(): string;
  /** 退出登录/切换账号(2026-09-05):吊销 token+清本地会话+回登录页。 */
  logoutToLoginPage(): void;
}

const LOBBY_PROFILE_SERVER_NAME = '本地开发服';
const LOBBY_PROFILE_PLACEHOLDER = '-';

/**
 * 玩家资料全屏场景渲染器。
 *
 * 当前阶段只做只读展示：等级、经验、战力、体力、账号状态、登录方式、钱包摘要和本地占位属性。
 * 不在弹窗中开放编辑、绑定、登出或领取等写操作。
 */
export class LobbyProfileDialogRenderer {
  constructor(private readonly host: LobbyProfileDialogHost) {}

  render(layout: UiLayout): void {
    const profile = this.host.currentLobbyProfile();
    const sceneRoot = this.addSceneRoot(layout);
    sceneRoot.addComponent(BlockInputEvents);

    // 弹窗使用独立缩放，避免竖屏或超窄屏被全局 uiScale 压到不可读。
    const dialogScale = this.profileDialogScale(layout);
    const panelWidth = Math.max(300 * dialogScale, layout.stageWidth);
    const panelHeight = Math.max(280 * dialogScale, layout.stageHeight);
    const panelX = (layout.stageLeft + layout.stageRight) / 2;
    const panelY = (layout.stageTop + layout.stageBottom) / 2;
    const panel = this.host.addBeveledPanelNode(
      'LobbyProfileSceneContent',
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      rgba(8, 7, 10, 232),
      rgba(215, 170, 82, 238),
      20 * dialogScale,
    );
    // 场景内容区阻挡输入事件，避免点击资料内容时穿透到底层。
    panel.addComponent(BlockInputEvents);
    panel.addComponent(Button);

    // C1812 标题横幅托底,统一各面板标题视觉;缺图时仅显示文字标题。
    this.host.addSprite('LobbyProfileTitleBanner', 'ui/common/ai/title_banner/spriteFrame', 0, panelHeight / 2 - 46 * dialogScale, Math.min(300 * dialogScale, panelWidth * 0.5), 56 * dialogScale, panel);
    const titleLabel = this.host.addChildLabel(
      panel,
      'LobbyProfileTitle',
      '玩家资料',
      0,
      panelHeight / 2 - 46 * dialogScale,
      Math.max(16, 30 * dialogScale),
      rgba(245, 210, 122),
      new Size(panelWidth - 160 * dialogScale, 46 * dialogScale),
    );
    titleLabel.overflow = Label.Overflow.SHRINK;

    this.addProfileHeader(panel, profile, panelWidth, panelHeight, dialogScale);
    this.addProfileRows(panel, profile, panelWidth, panelHeight, dialogScale);

    // 退出登录/切换账号(2026-09-05):吊销 token → 清本地会话 → 回登录页(登录页可直接登其他账号)。
    const logoutW = Math.min(280 * dialogScale, panelWidth * 0.4);
    const logoutH = 46 * dialogScale;
    const logoutBtn = this.host.addChildPlainNode(panel, 'LobbyProfileLogoutButton', 0, -panelHeight / 2 + 74 * dialogScale, logoutW, logoutH);
    const lg = logoutBtn.addComponent(Graphics);
    lg.fillColor = rgba(96, 24, 22, 238);
    lg.roundRect(-logoutW / 2, -logoutH / 2, logoutW, logoutH, 8 * dialogScale);
    lg.fill();
    lg.strokeColor = rgba(214, 110, 88, 225);
    lg.lineWidth = Math.max(1, 1.4 * dialogScale);
    lg.roundRect(-logoutW / 2, -logoutH / 2, logoutW, logoutH, 8 * dialogScale);
    lg.stroke();
    const logoutLabel = this.host.addChildLabel(logoutBtn, 'Text', '退出登录 / 切换账号', 0, 0, Math.max(13, 17 * dialogScale), rgba(255, 214, 196), new Size(logoutW - 16 * dialogScale, logoutH));
    logoutLabel.overflow = Label.Overflow.SHRINK;
    logoutBtn.addComponent(Button);
    logoutBtn.on(Button.EventType.CLICK, () => this.host.logoutToLoginPage(), this);
    this.host.applyImageButtonFeedback(logoutBtn, 1.03, 0.96);

    const note = this.host.addChildLabel(
      panel,
      'LobbyProfileReadonlyNote',
      '退出后回到登录页,可直接登录或注册其他账号;头像、昵称编辑暂未开放。',
      0,
      -panelHeight / 2 + 34 * dialogScale,
      Math.max(10, 15 * dialogScale),
      rgba(173, 158, 130),
      new Size(panelWidth - 90 * dialogScale, 28 * dialogScale),
    );
    note.overflow = Label.Overflow.SHRINK;
    renderSceneBackButton(this.host, panel, layout, 'LobbyProfileBackButton', () => this.host.closePlayerProfileDialog(), dialogScale, '资料');
  }

  private addSceneRoot(layout: UiLayout): Node {
    const node = this.host.createUiNode('LobbyProfileSceneRoot');
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    node.setPosition(new Vec3(centerX, centerY, 0));
    node.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 0);
    graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    graphics.fill();
    return node;
  }

  private profileDialogScale(layout: UiLayout): number {
    const fitScale = Math.min(layout.safeWidth / 840, layout.safeHeight / 620);
    return Math.min(1, Math.max(0.42, fitScale));
  }

  private isNarrowProfileDialog(panelWidth: number, scale: number): boolean {
    return panelWidth < 560 * scale;
  }

  private addProfileHeader(panel: Node, profile: PlayerLobbyProfileVO, panelWidth: number, panelHeight: number, scale: number): void {
    const narrow = this.isNarrowProfileDialog(panelWidth, scale);
    const avatarSize = (narrow ? 88 : 126) * scale;
    const avatarX = -panelWidth / 2 + (narrow ? 72 : 118) * scale;
    const avatarY = panelHeight / 2 - (narrow ? 116 : 132) * scale;
    const textLeft = avatarX + (narrow ? 62 : 96) * scale;
    const textWidth = Math.max(116 * scale, panelWidth / 2 - 34 * scale - textLeft);
    this.host.addLobbyAvatar(panel, avatarX, avatarY, avatarSize, profile.displayName);
    const name = this.host.addChildLabel(
      panel,
      'LobbyProfileName',
      profile.displayName,
      textLeft,
      avatarY + (narrow ? 22 : 30) * scale,
      Math.max(14, (narrow ? 23 : 28) * scale),
      rgba(250, 226, 164),
      new Size(textWidth, 40 * scale),
      HorizontalTextAlignment.LEFT,
    );
    name.overflow = Label.Overflow.SHRINK;
    const subline = this.host.addChildLabel(
      panel,
      'LobbyProfileSubline',
      `UID ${profile.userId}  |  ${LOBBY_PROFILE_SERVER_NAME}`,
      textLeft,
      avatarY - (narrow ? 9 : 8) * scale,
      Math.max(10, (narrow ? 15 : 17) * scale),
      rgba(209, 199, 176),
      new Size(textWidth, 30 * scale),
      HorizontalTextAlignment.LEFT,
    );
    subline.overflow = Label.Overflow.SHRINK;
    const status = this.host.addChildLabel(
      panel,
      'LobbyProfileStatus',
      this.profileStatusText(profile),
      textLeft,
      avatarY - (narrow ? 38 : 42) * scale,
      Math.max(10, (narrow ? 14 : 16) * scale),
      this.host.getLobbyProfileError() ? rgba(255, 162, 92) : rgba(127, 214, 255),
      new Size(textWidth, 28 * scale),
      HorizontalTextAlignment.LEFT,
    );
    status.overflow = Label.Overflow.SHRINK;
  }

  private addProfileRows(panel: Node, profile: PlayerLobbyProfileVO, panelWidth: number, panelHeight: number, scale: number): void {
    const rows: [string, string, string, string][] = [
      ['等级', `Lv.${profile.playerLevel}`, '经验', this.profileExpSummary(profile)],
      ['下一级', this.profileNextLevelText(profile), '英雄上限', this.profileHeroLevelCapText(profile)],
      ['战力', this.host.formatInteger(profile.combatPower), '体力', `${this.host.formatInteger(profile.stamina)}/${this.host.formatInteger(profile.maxStamina)}`],
      ['账号状态', profile.accountStatus, '登录方式', profile.loginMethod],
      ['钱包绑定', profile.walletBound ? '已绑定' : '未绑定', '钱包地址', this.maskWalletAddress(profile.walletAddress)],
      ['主线进度', '未开放', '深渊层数', '未开放'],
      ['公会', '未加入', '称号', '圣契旅者'],
    ];

    if (this.isNarrowProfileDialog(panelWidth, scale)) {
      // 窄屏改为单列，优先保证头像、文字和每一行资料互不挤压。
      const flatRows: [string, string][] = [];
      for (const row of rows) {
        flatRows.push([row[0], row[1]], [row[2], row[3]]);
      }
      const rowTop = panelHeight / 2 - 188 * scale;
      const rowGap = 39 * scale;
      const rowWidth = panelWidth - 62 * scale;
      const bottomLimit = -panelHeight / 2 + 74 * scale;
      const visibleRows = Math.max(2, Math.min(flatRows.length, Math.floor((rowTop - bottomLimit) / rowGap) + 1));
      for (let index = 0; index < visibleRows; index += 1) {
        const row = flatRows[index];
        this.addProfileRow(panel, row[0], row[1], 0, rowTop - rowGap * index, rowWidth, scale);
      }
      return;
    }

    const avatarY = panelHeight / 2 - 132 * scale;
    const rowTop = avatarY - 104 * scale;
    const columnWidth = (panelWidth - 104 * scale) / 2;
    const leftX = -panelWidth / 4 + 16 * scale;
    const rightX = panelWidth / 4 - 16 * scale;
    const rowGap = 46 * scale;
    const bottomLimit = -panelHeight / 2 + 80 * scale;
    const visibleRows = Math.max(4, Math.min(rows.length, Math.floor((rowTop - bottomLimit) / rowGap) + 1));
    // 宽屏使用双列信息面板，继续展示只读资料和本地占位属性。
    for (let index = 0; index < visibleRows; index += 1) {
      const row = rows[index];
      const rowY = rowTop - rowGap * index;
      this.addProfileRow(panel, row[0], row[1], leftX, rowY, columnWidth, scale);
      this.addProfileRow(panel, row[2], row[3], rightX, rowY, columnWidth, scale);
    }
  }

  private addProfileRow(parent: Node, label: string, value: string, x: number, y: number, width: number, scale: number): void {
    const height = 34 * scale;
    const row = this.host.addChildBeveledPanelNode(parent, `LobbyProfileRow_${label}`, x, y, width, height, rgba(18, 15, 16, 184), rgba(91, 70, 39, 190), 8 * scale);
    const labelNode = this.host.addChildLabel(
      row,
      'RowLabel',
      label,
      -width / 2 + 18 * scale,
      0,
      Math.max(9, 15 * scale),
      rgba(178, 159, 119),
      new Size(width * 0.35, height),
      HorizontalTextAlignment.LEFT,
    );
    labelNode.overflow = Label.Overflow.SHRINK;
    const valueNode = this.host.addChildLabel(
      row,
      'RowValue',
      value || LOBBY_PROFILE_PLACEHOLDER,
      width * 0.05,
      0,
      Math.max(10, 16 * scale),
      rgba(236, 216, 169),
      new Size(width * 0.56, height),
      HorizontalTextAlignment.LEFT,
    );
    valueNode.overflow = Label.Overflow.SHRINK;
  }

  private profileExpSummary(profile: PlayerLobbyProfileVO): string {
    const progress = profile.levelProgress;
    if (!progress?.nextLevelNeedExp) {
      return this.host.formatInteger(profile.exp);
    }
    return `${this.host.formatInteger(progress.currentExp)}/${this.host.formatInteger(progress.nextLevelNeedExp)}`;
  }

  private profileNextLevelText(profile: PlayerLobbyProfileVO): string {
    const progress = profile.levelProgress;
    if (!progress || progress.nextLevel == null) {
      return '已达当前上限';
    }
    return `Lv.${progress.nextLevel} 还差 ${this.host.formatInteger(progress.expToNextLevel)} EXP`;
  }

  private profileHeroLevelCapText(profile: PlayerLobbyProfileVO): string {
    const maxHeroLevel = profile.levelProgress?.maxHeroLevel;
    return maxHeroLevel == null ? LOBBY_PROFILE_PLACEHOLDER : `Lv.${maxHeroLevel}`;
  }

  private profileStatusText(profile: PlayerLobbyProfileVO): string {
    if (this.host.isLobbyProfileLoading()) {
      return '资料读取中...';
    }
    if (this.host.getLobbyProfileError()) {
      return '资料接口暂不可用，已使用本地占位';
    }
    return `账号状态：${profile.accountStatus}`;
  }

  private maskWalletAddress(address?: string | null): string {
    // 钱包地址只做脱敏展示，当前阶段不提供绑定或修改入口。
    const clean = safeText(address || '');
    if (!clean) {
      return LOBBY_PROFILE_PLACEHOLDER;
    }
    if (clean.length <= 12) {
      return clean;
    }
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
  }

}
