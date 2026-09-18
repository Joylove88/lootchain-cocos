import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
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
  setStatus(text: string): void;
}

const LOBBY_PROFILE_SERVER_NAME = '本地开发服';
const LOBBY_PROFILE_PLACEHOLDER = '-';
const LOBBY_PROFILE_MOTTO = '—— 无畏前行,书写属于自己的传说 ——';

/** 2026-09-18 用户新素材(ui/profile/ai,原目录 ui/frofiles 中文名,已改英文)。 */
const PROFILE_ASSETS = {
  background: 'ui/profile/ai/background/spriteFrame',
  rowBg: 'ui/profile/ai/row_bg/spriteFrame',
  button: 'ui/profile/ai/button/spriteFrame',
  editName: 'ui/profile/ai/edit_name/spriteFrame',
  navSettings: 'ui/lobby/more/micon_settings/spriteFrame',
};
/** 属性条素材 795×127(两端尖饰、中段平直):按九宫格横向拉伸,再整体等比缩到目标高度,两端不变形。 */
const PROFILE_ROW_BG_W = 795;
const PROFILE_ROW_BG_H = 127;
const PROFILE_ROW_BG_INSET = 150;
/** 退出按钮素材 503×115,整图等比。 */
const PROFILE_BUTTON_RATIO = 115 / 503;
/** 背景图 1672×941,等比铺满(cover)后由遮罩裁边。 */
const PROFILE_BG_W = 1672;
const PROFILE_BG_H = 941;

/** 每行属性对应的图标(新素材;钱包地址复用钱包图)。 */
const PROFILE_ROW_ICON: Record<string, string> = {
  等级: 'level',
  经验: 'exp',
  下一级: 'next_level',
  英雄上限: 'hero_cap',
  战力: 'power',
  体力: 'stamina',
  账号状态: 'account_status',
  登录方式: 'login_method',
  钱包绑定: 'wallet',
  钱包地址: 'wallet',
  主线进度: 'main_progress',
  深渊层数: 'abyss_floor',
  公会: 'guild',
  称号: 'title',
};

interface ProfileRowSpec {
  label: string;
  value: string;
  /** 经验进度(仅"下一级"行):0..1;undefined 不画条。 */
  progress?: number;
  progressText?: string;
  /** 值颜色覆盖(账号状态正常=绿)。 */
  valueColor?: Color;
  /** 右侧复制按钮要复制的完整文本(钱包地址)。 */
  copyText?: string;
}

/**
 * 玩家资料全屏场景渲染器(2026-09-18 按用户参考图重做):
 * 背景画卷铺底、左侧导航(玩家资料/外观设置/游戏设置,后两项待开放)、头像+昵称(编辑图标)+UID+账号状态+格言、
 * 两列带图标的属性条(下一级行带经验条、钱包地址行可复制)、底部红色"退出登录 / 切换账号"。
 * 仍是只读展示:昵称编辑、外观/游戏设置点击只给提示。
 */
export class LobbyProfileDialogRenderer {
  constructor(private readonly host: LobbyProfileDialogHost) {}

  render(layout: UiLayout): void {
    const profile = this.host.currentLobbyProfile();
    const sceneRoot = this.addSceneRoot(layout);
    sceneRoot.addComponent(BlockInputEvents);

    // 弹窗使用独立缩放,避免竖屏或超窄屏被全局 uiScale 压到不可读。
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
      rgba(8, 7, 10, 245),
      rgba(60, 44, 26, 200),
      0,
    );
    // 场景内容区阻挡输入事件,避免点击资料内容时穿透到底层。
    panel.addComponent(BlockInputEvents);
    panel.addComponent(Button);

    this.mountBackground(panel, panelWidth, panelHeight);

    const narrow = this.isNarrowProfileDialog(panelWidth, dialogScale);
    if (!narrow) {
      this.addSideNav(panel, panelWidth, panelHeight, dialogScale);
    }
    this.addProfileHeader(panel, profile, panelWidth, panelHeight, dialogScale);
    this.addProfileRows(panel, profile, panelWidth, panelHeight, dialogScale);
    this.addLogoutButton(panel, panelWidth, panelHeight, dialogScale);

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
    return panelWidth < 760 * scale;
  }

  /** 背景画卷:等比 cover 铺满面板,矩形遮罩裁掉溢出;上面压一层暗色让文字可读。 */
  private mountBackground(panel: Node, panelWidth: number, panelHeight: number): void {
    const holder = this.host.addChildPlainNode(panel, 'LobbyProfileBg', 0, 0, panelWidth, panelHeight);
    holder.addComponent(Mask);
    const cover = Math.max(panelWidth / PROFILE_BG_W, panelHeight / PROFILE_BG_H);
    const art = this.host.addSprite('LobbyProfileBgArt', PROFILE_ASSETS.background, 0, 0, PROFILE_BG_W * cover, PROFILE_BG_H * cover, holder);
    if (art) {
      const shade = this.host.addChildPlainNode(holder, 'LobbyProfileBgShade', 0, 0, panelWidth, panelHeight);
      const g = shade.addComponent(Graphics);
      g.fillColor = rgba(4, 3, 5, 96);
      g.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
      g.fill();
    }
  }

  /** 左侧导航:玩家资料(激活,红底金边)/外观设置/游戏设置(待开放,点击提示)。 */
  private addSideNav(panel: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const entries: Array<{ key: string; label: string; icon: string; active: boolean }> = [
      { key: 'profile', label: '玩家资料', icon: 'ui/profile/ai/title/spriteFrame', active: true },
      { key: 'appearance', label: '外观设置', icon: 'ui/profile/ai/hero_cap/spriteFrame', active: false },
      { key: 'game', label: '游戏设置', icon: PROFILE_ASSETS.navSettings, active: false },
    ];
    const navW = 206 * scale;
    const navH = 64 * scale;
    const navX = -panelWidth / 2 + 12 * scale + navW / 2;
    const firstY = panelHeight / 2 - 188 * scale;
    entries.forEach((entry, index) => {
      const y = firstY - index * 90 * scale;
      const node = this.host.addChildPlainNode(panel, `LobbyProfileNav_${entry.key}`, navX, y, navW, navH);
      const g = node.addComponent(Graphics);
      if (entry.active) {
        // 红牌底 + 右缘金线,呼应参考图的选中态
        g.fillColor = rgba(118, 20, 18, 225);
        g.roundRect(-navW / 2, -navH / 2, navW, navH, 6 * scale);
        g.fill();
        g.strokeColor = rgba(222, 176, 96, 235);
        g.lineWidth = Math.max(1, 1.6 * scale);
        g.roundRect(-navW / 2, -navH / 2, navW, navH, 6 * scale);
        g.stroke();
        g.fillColor = rgba(240, 196, 110, 250);
        g.rect(navW / 2 - 5 * scale, -navH / 2 + 8 * scale, 3 * scale, navH - 16 * scale);
        g.fill();
      } else {
        g.fillColor = rgba(16, 12, 14, 150);
        g.roundRect(-navW / 2, -navH / 2, navW, navH, 6 * scale);
        g.fill();
        g.strokeColor = rgba(96, 74, 44, 150);
        g.lineWidth = Math.max(1, 1.2 * scale);
        g.roundRect(-navW / 2, -navH / 2, navW, navH, 6 * scale);
        g.stroke();
      }
      const iconSize = 36 * scale;
      this.host.addSprite(`LobbyProfileNavIcon_${entry.key}`, entry.icon, -navW / 2 + 32 * scale, 0, iconSize, iconSize, node);
      const label = this.host.addChildLabel(
        node,
        'Text',
        entry.label,
        -navW / 2 + 62 * scale,
        0,
        Math.max(12, 21 * scale),
        entry.active ? rgba(255, 236, 196) : rgba(176, 160, 132),
        new Size(navW - 70 * scale, navH),
        HorizontalTextAlignment.LEFT,
      );
      label.overflow = Label.Overflow.SHRINK;
      if (entry.active) {
        label.enableOutline = true;
        label.outlineColor = rgba(40, 8, 6, 220);
        label.outlineWidth = Math.max(1, 1.2 * scale);
      } else {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.setStatus(`${entry.label}即将开放。`), this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
  }

  private headerAvatarY(panelHeight: number, scale: number, narrow: boolean): number {
    return panelHeight / 2 - (narrow ? 118 : 178) * scale;
  }

  private addProfileHeader(panel: Node, profile: PlayerLobbyProfileVO, panelWidth: number, panelHeight: number, scale: number): void {
    const narrow = this.isNarrowProfileDialog(panelWidth, scale);
    const avatarSize = (narrow ? 88 : 140) * scale;
    const avatarX = -panelWidth / 2 + (narrow ? 72 : 352) * scale;
    const avatarY = this.headerAvatarY(panelHeight, scale, narrow);
    const textLeft = avatarX + (narrow ? 62 : 120) * scale;
    const textWidth = Math.max(140 * scale, panelWidth / 2 + 120 * scale - textLeft);
    this.host.addLobbyAvatar(panel, avatarX, avatarY, avatarSize, profile.displayName);

    const nameSize = Math.max(14, (narrow ? 24 : 34) * scale);
    const nameText = profile.displayName;
    const name = this.host.addChildLabel(
      panel,
      'LobbyProfileName',
      nameText,
      textLeft,
      avatarY + (narrow ? 24 : 58) * scale,
      nameSize,
      rgba(252, 236, 200),
      new Size(textWidth, 44 * scale),
      HorizontalTextAlignment.LEFT,
    );
    name.overflow = Label.Overflow.SHRINK;
    name.enableOutline = true;
    name.outlineColor = rgba(0, 0, 0, 200);
    name.outlineWidth = Math.max(1, 1.4 * scale);
    // 昵称编辑图标紧跟昵称(按字数估宽;编辑尚未开放,点击提示)
    const estimatedNameWidth = Math.min(textWidth - 40 * scale, Math.max(1, nameText.length) * nameSize * 0.98);
    const editSize = (narrow ? 22 : 30) * scale;
    const edit = this.host.addChildPlainNode(panel, 'LobbyProfileEditName', textLeft + estimatedNameWidth + 12 * scale + editSize / 2, avatarY + (narrow ? 24 : 58) * scale, editSize * 1.4, editSize * 1.4);
    const editArt = this.host.addSprite('Art', PROFILE_ASSETS.editName, 0, 0, editSize, editSize, edit);
    if (!editArt) {
      const eg = edit.addComponent(Graphics);
      eg.strokeColor = rgba(222, 186, 110, 230);
      eg.lineWidth = Math.max(1, 1.6 * scale);
      eg.roundRect(-editSize / 2, -editSize / 2, editSize, editSize, 4 * scale);
      eg.stroke();
    }
    edit.addComponent(Button);
    edit.on(Button.EventType.CLICK, () => this.host.setStatus('昵称修改即将开放。'), this);
    this.host.applyImageButtonFeedback(edit, 1.08, 0.94);

    const subline = this.host.addChildLabel(
      panel,
      'LobbyProfileSubline',
      `UID ${profile.userId}   |   ${LOBBY_PROFILE_SERVER_NAME}`,
      textLeft,
      avatarY + (narrow ? -2 : 16) * scale,
      Math.max(10, (narrow ? 15 : 19) * scale),
      rgba(214, 204, 182),
      new Size(textWidth, 30 * scale),
      HorizontalTextAlignment.LEFT,
    );
    subline.overflow = Label.Overflow.SHRINK;
    const statusError = !!this.host.getLobbyProfileError();
    const status = this.host.addChildLabel(
      panel,
      'LobbyProfileStatus',
      this.profileStatusText(profile),
      textLeft,
      avatarY - (narrow ? 26 : 20) * scale,
      Math.max(10, (narrow ? 15 : 18) * scale),
      statusError ? rgba(255, 162, 92) : rgba(120, 224, 150),
      new Size(textWidth, 28 * scale),
      HorizontalTextAlignment.LEFT,
    );
    status.overflow = Label.Overflow.SHRINK;
    if (!narrow) {
      const motto = this.host.addChildLabel(
        panel,
        'LobbyProfileMotto',
        LOBBY_PROFILE_MOTTO,
        textLeft,
        avatarY - 54 * scale,
        Math.max(10, 16 * scale),
        rgba(176, 164, 144),
        new Size(textWidth, 26 * scale),
        HorizontalTextAlignment.LEFT,
      );
      motto.overflow = Label.Overflow.SHRINK;
    }
  }

  private buildRows(profile: PlayerLobbyProfileVO): ProfileRowSpec[][] {
    const progress = profile.levelProgress;
    const ratio = progress?.nextLevelNeedExp ? Math.max(0, Math.min(1, (progress.currentExp ?? 0) / progress.nextLevelNeedExp)) : undefined;
    const statusOk = /正常|normal|active/i.test(profile.accountStatus ?? '');
    const walletAddress = safeText(profile.walletAddress || '');
    return [
      [
        { label: '等级', value: `Lv.${profile.playerLevel}` },
        { label: '经验', value: this.profileExpSummary(profile) },
      ],
      [
        { label: '下一级', value: this.profileNextLevelText(profile), progress: ratio, progressText: ratio === undefined ? undefined : this.profileExpSummary(profile).replace('/', ' / ') },
        { label: '英雄上限', value: this.profileHeroLevelCapText(profile) },
      ],
      [
        { label: '战力', value: this.host.formatInteger(profile.combatPower) },
        { label: '体力', value: `${this.host.formatInteger(profile.stamina)}/${this.host.formatInteger(profile.maxStamina)}` },
      ],
      [
        { label: '账号状态', value: profile.accountStatus, valueColor: statusOk ? rgba(120, 224, 150) : undefined },
        { label: '登录方式', value: profile.loginMethod },
      ],
      [
        { label: '钱包绑定', value: profile.walletBound ? '已绑定' : '未绑定' },
        { label: '钱包地址', value: this.maskWalletAddress(profile.walletAddress), copyText: walletAddress || undefined },
      ],
      [
        { label: '主线进度', value: '未开放' },
        { label: '深渊层数', value: '未开放' },
      ],
      [
        { label: '公会', value: '未加入' },
        { label: '称号', value: '圣契旅者' },
      ],
    ];
  }

  private addProfileRows(panel: Node, profile: PlayerLobbyProfileVO, panelWidth: number, panelHeight: number, scale: number): void {
    const rows = this.buildRows(profile);
    const narrow = this.isNarrowProfileDialog(panelWidth, scale);
    const avatarY = this.headerAvatarY(panelHeight, scale, narrow);

    if (narrow) {
      // 窄屏单列:无导航、无格言,属性条依次排到退出按钮上方。
      const flatRows: ProfileRowSpec[] = [];
      for (const row of rows) {
        flatRows.push(row[0], row[1]);
      }
      const rowTop = avatarY - 92 * scale;
      const rowPitch = 44 * scale;
      const rowWidth = panelWidth - 48 * scale;
      const bottomLimit = -panelHeight / 2 + 96 * scale;
      const visibleRows = Math.max(2, Math.min(flatRows.length, Math.floor((rowTop - bottomLimit) / rowPitch) + 1));
      for (let index = 0; index < visibleRows; index += 1) {
        this.addProfileRow(panel, flatRows[index], 0, rowTop - rowPitch * index, rowWidth, 38 * scale, scale);
      }
      return;
    }

    // 宽屏双列:左列从导航右侧起,右列到面板右缘留边;行距 67(参考图)。
    const navRight = -panelWidth / 2 + 236 * scale;
    const gap = 28 * scale;
    const rightMargin = 40 * scale;
    const columnWidth = Math.min(800 * scale, (panelWidth / 2 - rightMargin - navRight - gap) / 2);
    const leftX = navRight + columnWidth / 2;
    const rightX = leftX + columnWidth + gap;
    const rowTop = avatarY - 158 * scale;
    const rowPitch = 67 * scale;
    const rowHeight = 60 * scale;
    const bottomLimit = -panelHeight / 2 + 150 * scale;
    const visibleRows = Math.max(4, Math.min(rows.length, Math.floor((rowTop - bottomLimit) / rowPitch) + 1));
    for (let index = 0; index < visibleRows; index += 1) {
      const row = rows[index];
      const rowY = rowTop - rowPitch * index;
      this.addProfileRow(panel, row[0], leftX, rowY, columnWidth, rowHeight, scale);
      this.addProfileRow(panel, row[1], rightX, rowY, columnWidth, rowHeight, scale);
    }
  }

  private addProfileRow(parent: Node, spec: ProfileRowSpec, x: number, y: number, width: number, height: number, scale: number): void {
    const row = this.host.addChildPlainNode(parent, `LobbyProfileRow_${spec.label}`, x, y, width, height);
    // 属性条素材:按目标高度求缩放 k,以原生高度 + 放大后的宽做九宫格(两端 inset 保原样),整体缩 k → 端饰等比、中段横向拉伸。
    const k = height / PROFILE_ROW_BG_H;
    const bgHolder = this.host.addChildPlainNode(row, 'Bg', 0, 0, width, height);
    bgHolder.setScale(k, k, 1);
    const bg = this.host.addSprite('BgArt', PROFILE_ASSETS.rowBg, 0, 0, Math.max(PROFILE_ROW_BG_W, width / k), PROFILE_ROW_BG_H, bgHolder);
    if (bg) {
      const frame = bg.spriteFrame;
      if (frame) {
        frame.insetLeft = PROFILE_ROW_BG_INSET;
        frame.insetRight = PROFILE_ROW_BG_INSET;
        frame.insetTop = 0;
        frame.insetBottom = 0;
      }
      bg.type = Sprite.Type.SLICED;
      bg.markForUpdateRenderData();
    } else {
      const g = bgHolder.addComponent(Graphics);
      g.fillColor = rgba(18, 15, 16, 190);
      g.roundRect(-width / k / 2, -PROFILE_ROW_BG_H / 2, width / k, PROFILE_ROW_BG_H, 12);
      g.fill();
      g.strokeColor = rgba(120, 92, 48, 200);
      g.lineWidth = 3;
      g.roundRect(-width / k / 2, -PROFILE_ROW_BG_H / 2, width / k, PROFILE_ROW_BG_H, 12);
      g.stroke();
    }
    // 图标
    const iconKey = PROFILE_ROW_ICON[spec.label];
    const iconSize = height * 0.66;
    if (iconKey) {
      this.host.addSprite('Icon', `ui/profile/ai/${iconKey}/spriteFrame`, -width / 2 + 46 * scale, 0, iconSize, iconSize, row);
    }
    const labelX = -width / 2 + 86 * scale;
    const valueX = -width / 2 + Math.min(330 * scale, width * 0.42);
    const fontSize = Math.max(10, 18 * scale);
    const labelNode = this.host.addChildLabel(row, 'RowLabel', spec.label, labelX, 0, fontSize, rgba(236, 220, 186), new Size(valueX - labelX - 8 * scale, height), HorizontalTextAlignment.LEFT);
    labelNode.overflow = Label.Overflow.SHRINK;
    const hasProgress = spec.progress !== undefined;
    const valueWidth = width / 2 - valueX - (spec.copyText ? 70 : 40) * scale;
    const valueNode = this.host.addChildLabel(
      row,
      'RowValue',
      spec.value || LOBBY_PROFILE_PLACEHOLDER,
      valueX,
      hasProgress ? height * 0.2 : 0,
      hasProgress ? Math.max(9, 15 * scale) : fontSize,
      spec.valueColor ?? rgba(244, 236, 218),
      new Size(valueWidth, hasProgress ? height * 0.5 : height),
      HorizontalTextAlignment.LEFT,
    );
    valueNode.overflow = Label.Overflow.SHRINK;
    if (hasProgress) {
      // 经验条:金色填充 + 右侧"当前 / 所需"
      const barW = Math.min(240 * scale, valueWidth * 0.55);
      const barH = 8 * scale;
      const barY = -height * 0.2;
      const bar = this.host.addChildPlainNode(row, 'ExpBar', valueX + barW / 2, barY, barW, barH);
      const g = bar.addComponent(Graphics);
      g.fillColor = rgba(38, 30, 24, 230);
      g.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
      g.fill();
      g.strokeColor = rgba(120, 92, 48, 220);
      g.lineWidth = 1;
      g.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
      g.stroke();
      const fillW = Math.max(barH, barW * (spec.progress ?? 0));
      g.fillColor = rgba(222, 176, 76, 250);
      g.roundRect(-barW / 2, -barH / 2, fillW, barH, barH / 2);
      g.fill();
      if (spec.progressText) {
        const pt = this.host.addChildLabel(row, 'ExpText', spec.progressText, valueX + barW + 10 * scale, barY, Math.max(9, 14 * scale), rgba(232, 222, 196), new Size(valueWidth - barW - 12 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
        pt.overflow = Label.Overflow.SHRINK;
      }
    }
    if (spec.copyText) {
      // 复制钱包地址:双叠方块图标,点击写剪贴板并提示
      const copySize = 24 * scale;
      const copy = this.host.addChildPlainNode(row, 'CopyButton', width / 2 - 46 * scale, 0, copySize * 1.6, copySize * 1.6);
      const cg = copy.addComponent(Graphics);
      cg.strokeColor = rgba(226, 196, 130, 235);
      cg.lineWidth = Math.max(1, 1.6 * scale);
      cg.roundRect(-copySize / 2 + 4 * scale, -copySize / 2, copySize - 6 * scale, copySize - 6 * scale, 3 * scale);
      cg.stroke();
      cg.fillColor = rgba(24, 18, 14, 240);
      cg.roundRect(-copySize / 2, -copySize / 2 + 6 * scale, copySize - 6 * scale, copySize - 6 * scale, 3 * scale);
      cg.fill();
      cg.roundRect(-copySize / 2, -copySize / 2 + 6 * scale, copySize - 6 * scale, copySize - 6 * scale, 3 * scale);
      cg.stroke();
      copy.addComponent(Button);
      const text = spec.copyText;
      copy.on(Button.EventType.CLICK, () => this.copyToClipboard(text), this);
      this.host.applyImageButtonFeedback(copy, 1.1, 0.92);
    }
  }

  private addLogoutButton(panel: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const logoutW = Math.min(310 * scale, panelWidth * 0.5);
    const logoutH = logoutW * PROFILE_BUTTON_RATIO;
    const logoutBtn = this.host.addChildPlainNode(panel, 'LobbyProfileLogoutButton', 0, -panelHeight / 2 + 92 * scale, logoutW, logoutH);
    const art = this.host.addSprite('Art', PROFILE_ASSETS.button, 0, 0, logoutW, logoutH, logoutBtn);
    if (!art) {
      const lg = logoutBtn.addComponent(Graphics);
      lg.fillColor = rgba(96, 24, 22, 238);
      lg.roundRect(-logoutW / 2, -logoutH / 2, logoutW, logoutH, 8 * scale);
      lg.fill();
      lg.strokeColor = rgba(214, 110, 88, 225);
      lg.lineWidth = Math.max(1, 1.4 * scale);
      lg.roundRect(-logoutW / 2, -logoutH / 2, logoutW, logoutH, 8 * scale);
      lg.stroke();
    }
    const logoutLabel = this.host.addChildLabel(logoutBtn, 'Text', '退出登录 / 切换账号', 0, 1 * scale, Math.max(13, 21 * scale), rgba(255, 232, 210), new Size(logoutW * 0.78, logoutH));
    logoutLabel.overflow = Label.Overflow.SHRINK;
    logoutLabel.enableOutline = true;
    logoutLabel.outlineColor = rgba(50, 6, 6, 230);
    logoutLabel.outlineWidth = Math.max(1, 1.4 * scale);
    logoutBtn.addComponent(Button);
    logoutBtn.on(Button.EventType.CLICK, () => this.host.logoutToLoginPage(), this);
    this.host.applyImageButtonFeedback(logoutBtn, 1.03, 0.96);

    const note = this.host.addChildLabel(
      panel,
      'LobbyProfileReadonlyNote',
      '退出后回到登录界面,可直接登录或注册其他账号。头像、昵称等信息将不丢失。',
      0,
      -panelHeight / 2 + 42 * scale,
      Math.max(10, 15 * scale),
      rgba(180, 166, 140),
      new Size(panelWidth - 90 * scale, 28 * scale),
    );
    note.overflow = Label.Overflow.SHRINK;
  }

  private copyToClipboard(text: string): void {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator;
    const writer = nav?.clipboard?.writeText;
    if (!writer) {
      this.host.setStatus(`钱包地址:${text}`);
      return;
    }
    writer.call(nav!.clipboard, text)
      .then(() => this.host.setStatus('钱包地址已复制。'))
      .catch(() => this.host.setStatus(`钱包地址:${text}`));
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
      return '资料接口暂不可用,已使用本地占位';
    }
    return `账号状态:${profile.accountStatus}`;
  }

  private maskWalletAddress(address?: string | null): string {
    // 钱包地址只做脱敏展示,当前阶段不提供绑定或修改入口。
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
