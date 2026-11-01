import { BlockInputEvents, Button, Color, EditBox, Graphics, HorizontalTextAlignment, Label, Mask, Node, ScrollView, Size, UITransform } from 'cc';
import type { UiKitHost } from '../UiKit';
import { glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassFrame, mountGlassIconButton, mountGlassLine, mountGlassPanel, mountGlassScrollBar, mountGlassSlice } from '../UiGlassKit';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { mountHeroAvatar } from './HeroHeadCrop';
import { DAILY_THEME_OPEN_DAYS } from './ItemSourceRoutes';
import { worldMapOfStage } from './LobbyWorldMaps';
import type { ProfileRenameState } from './LobbyProfileDialogRenderer';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { PlayerBattleRecentVO } from '../../types/BattleTypes';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';

export interface LobbyProfileGlassDialogHost extends UiKitHost {
  createUiNode(name: string): Node;
  addFramedEditBox(initialText: string, x: number, y: number, width: number, layout: UiLayout, password?: boolean, options?: { frameless?: boolean; placeholder?: string; placeholderColor?: Color }): EditBox;
  currentLobbyProfile(): PlayerLobbyProfileVO;
  isLobbyProfileLoading(): boolean;
  getLobbyProfileError(): string;
  currentLobbyBattleState(): { recentBattles: PlayerBattleRecentVO[] };
  currentLobbyHeroRosterState(): { heroes: LobbyHeroItemVO[] };
  currentLobbyFormationHeroIds(): number[];
  /** 矿境 NPC 矿列表(拉过才有),用于把 RAID_n 显示成「废弃矿井 6号矿」。 */
  currentLobbyRaidStages(): Array<{ stageCode: string; zoneName: string; orderNo: number }> | null;
  lobbyStageDisplayLabel(stageCode: string): string;
  formatInteger(value: number | null | undefined): string;
  currentProfileRenameState(): ProfileRenameState;
  openProfileRename(): void;
  closeProfileRename(): void;
  setProfileRenameDraft(text: string): void;
  submitProfileRename(): void;
  closeLobbyProfileGlassDialog(): void;
}

const ICON = (name: string): string => `ui/glass/${name}/spriteFrame`;
const ICON_TINT = new Color(214, 180, 116, 255);
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];
/** 最近战斗最多列几场(服务端也只回最近若干场)。 */
const RECENT_MAX = 8;

/** 战斗记录 → 类型图标 + 中文名(不露关卡代码;冒险章节下架后的旧记录仍按原口径显示)。 */
export function battleRecordView(
  stageCode: string,
  raidStages: Array<{ stageCode: string; zoneName: string; orderNo: number }> | null,
  fallback: (code: string) => string,
): { icon: string; title: string } {
  const code = String(stageCode || '').toUpperCase();
  if (code.startsWith('RAIDPVP_')) {
    return { icon: ICON('battle_pickaxe'), title: /_R\d+$/.test(code) ? '矿境掠夺 · 复仇' : '矿境掠夺 · 真人矿' };
  }
  if (code.startsWith('RAID_')) {
    const stage = raidStages?.find((item) => item.stageCode.toUpperCase() === code);
    const order = stage ? stage.orderNo : Number(code.slice(5)) || 0;
    const name = stage ? `${stage.zoneName} ${(order - 1) % 10 + 1}号矿` : `NPC 矿 ${order}`;
    return { icon: ICON('battle_pickaxe'), title: `矿境掠夺 · ${name}` };
  }
  const daily = /^DAILY_([A-Z]+)_(\d+)$/.exec(code);
  if (daily) {
    const theme = DAILY_THEME_OPEN_DAYS[daily[1] as keyof typeof DAILY_THEME_OPEN_DAYS];
    const level = ROMAN[Number(daily[2]) - 1] ?? daily[2];
    return { icon: ICON('battle_gate'), title: `秘境试炼 · ${theme ? theme.name : '副本'} ${level}` };
  }
  if (code.startsWith('FIELD_')) {
    const camp = worldMapOfStage(code)?.camps.find((item) => item.stageCode.toUpperCase() === code);
    return { icon: ICON('profile_swords'), title: camp ? `野外 · ${camp.label}` : '野外战斗' };
  }
  return { icon: ICON('battle_shield'), title: fallback(stageCode) || '战斗' };
}

function resultView(result: string): { text: string; tone: 'win' | 'lose' | 'other' } {
  const value = String(result || '').toUpperCase();
  return value === 'WIN' ? { text: '胜利', tone: 'win' } : value === 'LOSE' ? { text: '失败', tone: 'lose' } : value === 'ABORT' ? { text: '中途退出', tone: 'other' } : { text: '已结束', tone: 'other' };
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of Array.from(text)) {
    width += /[　-鿿＀-￯]/.test(ch) ? fontSize : fontSize * 0.56;
  }
  return width;
}

/**
 * 玩家资料弹框(11-02 用户确认原型 周报截图/2026-11-01_B风格补全/proto/profile_b2.png,窗口与公告弹框同尺寸):
 * 终端上弹出,只有 ✕。左列 = 资料卡(头像 / 昵称 + 改名 / UID / 账号状态 / 签名)+ 6 行属性;右列 = 最近战斗(类型图标 + 名称 + 时间 + 胜负签)。
 * 改名:B 风格小弹框(同兑换码弹框版式),沿用原改名状态流。
 */
export class LobbyProfileGlassDialogRenderer {
  static readonly NODE_NAME = 'LobbyProfileGlassDialog';
  static readonly RENAME_NODE_NAME = 'LobbyProfileRenameGlass';
  static readonly RENAME_INPUT_NAME = 'LobbyProfileRenameGlassInput';

  constructor(private readonly host: LobbyProfileGlassDialogHost) {}

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

    const root = this.host.createUiNode(LobbyProfileGlassDialogRenderer.NODE_NAME);
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(4, 6, 10, 180);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    root.on(Node.EventType.TOUCH_END, () => this.host.closeLobbyProfileGlassDialog(), this);
    const stage = this.host.addChildPlainNode(root, 'Stage', cx, cy, layout.stageWidth, layout.stageHeight);
    const winW = S(1686 - 184);
    const winH = S(786 - 62);
    const win = this.host.addChildPlainNode(stage, 'Window', FX((184 + 1686) / 2), FY((62 + 786) / 2), winW, winH);
    win.addComponent(BlockInputEvents);
    mountGlassSlice(this.host, win, 'GlassBase', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    mountGlassSlice(this.host, win, 'Glass', GLASS_SLICES.panel, 0, 0, winW, winH, k);
    const panel = this.host.addChildPlainNode(stage, 'Panel', 0, 0, layout.stageWidth, layout.stageHeight);

    // 标题行:香槟竖条 214 + 「玩家资料」左沿 231 @ y 112;✕ (1622,111);分割线 y 158
    this.host.addSprite('TitleBar', GLASS_ICON.accent, FX(214), FY(112), S(6), S(32), panel);
    T(panel, 'Title', '玩家资料', FX(231), FY(112), 32, GLASS_COLOR.text, S(300), HorizontalTextAlignment.LEFT, true);
    mountGlassIconButton(this.host, panel, 'Close', GLASS_ICON.close, FX(1622), FY(111), S(36), S(72), () => this.host.closeLobbyProfileGlassDialog());
    mountGlassLine(this.host, panel, 'TitleLine', FX((208 + 1660) / 2), FY(158), S(1660 - 208), Math.max(1, S(1)), new Color(255, 255, 255, 22));

    const profile = this.host.currentLobbyProfile();
    this.renderCard(panel, profile, FX, FY, S, k, T);
    this.renderStats(panel, profile, FX, FY, S, k, T);
    this.renderRecent(panel, FX, FY, S, k, T);
  }

  /** 资料卡 208..840 × 173..385:头像 (326,279) 172 方圆形;昵称左沿 440 @ 224、改名钮跟在名字后;UID @ 264;状态签 @ 300;签名 @ 342。 */
  private renderCard(panel: Node, profile: PlayerLobbyProfileVO, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number,
    T: (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label): void {
    mountGlassPanel(this.host, panel, 'Card', FX((208 + 840) / 2), FY((173 + 385) / 2), S(840 - 208), S(385 - 173), k);
    // 头像:同终端名片(主角 → 队长 → 第一位英雄),圆形遮罩 + 淡白细环
    const heroes = this.host.currentLobbyHeroRosterState().heroes;
    const leaderId = this.host.currentLobbyFormationHeroIds()[0];
    const hero = heroes.find((item) => item.protagonist) ?? heroes.find((item) => item.id === leaderId) ?? heroes.find((item) => item.id > 0);
    const avatar = this.host.addChildPlainNode(panel, 'Avatar', FX(326), FY(279), S(172), S(172));
    mountHeroAvatar(avatar, hero?.heroCode, S(166), 'circle');
    const ring = avatar.addComponent(Graphics);
    ring.strokeColor = new Color(255, 255, 255, 70);
    ring.lineWidth = Math.max(1, S(2));
    ring.circle(0, 0, S(84));
    ring.stroke();

    const name = profile.displayName || '-';
    const nameLabel = T(panel, 'Name', name, FX(440), FY(224), 34, GLASS_COLOR.text, S(330), HorizontalTextAlignment.LEFT, true);
    const nameW = Math.min(S(330), estimateTextWidth(name, nameLabel.fontSize));
    const edit = this.host.addChildPlainNode(panel, 'EditName', FX(440) + nameW + S(16) + S(23), FY(224), S(46), S(46));
    mountGlassFrame(this.host, edit, 'Bg', 0, 0, S(46), S(46), k);
    const pencil = this.host.addSprite('Icon', ICON('profile_pencil'), 0, 0, S(24), S(24), edit);
    if (pencil) {
      pencil.color = new Color(214, 218, 226, 255);
    }
    edit.addComponent(Button);
    edit.on(Button.EventType.CLICK, () => this.host.openProfileRename(), this);
    this.host.applyImageButtonFeedback(edit, 1.06, 0.95);
    T(panel, 'Uid', `UID ${profile.userId}`, FX(440), FY(264), 21, GLASS_COLOR.sub, S(300));

    const error = this.host.getLobbyProfileError();
    const statusText = this.host.isLobbyProfileLoading() ? '资料读取中…' : error ? '资料读取失败,请稍后重试' : `账号状态:${profile.accountStatus}`;
    const tagFont = Math.max(12, Math.round(S(19)));
    const tagW = estimateTextWidth(statusText, tagFont) + S(48);
    const tag = this.host.addChildPlainNode(panel, 'StatusTag', FX(440) + tagW / 2, FY(300), tagW, S(34));
    const tg = tag.addComponent(Graphics);
    tg.fillColor = error ? new Color(56, 36, 30, 235) : new Color(29, 48, 41, 240);
    tg.roundRect(-tagW / 2, -S(17), tagW, S(34), S(17));
    tg.fill();
    tg.strokeColor = error ? new Color(150, 96, 80, 220) : new Color(96, 128, 100, 230);
    tg.lineWidth = Math.max(1, S(1.4));
    tg.roundRect(-tagW / 2, -S(17), tagW, S(34), S(17));
    tg.stroke();
    tg.fillColor = error ? GLASS_COLOR.red : new Color(110, 214, 130, 255);
    tg.circle(-tagW / 2 + S(17), 0, S(5));
    tg.fill();
    T(tag, 'Text', statusText, -tagW / 2 + S(30), 0, 19, error ? new Color(240, 160, 140, 255) : new Color(150, 214, 166, 255), tagW - S(36));
    const motto = T(panel, 'Motto', '无畏前行,书写属于自己的传说', FX(440), FY(342), 20, GLASS_COLOR.sub, S(390));
    motto.isItalic = true;
  }

  /** 属性 208..840 × 397..772:图标 x 250、标签左沿 293、数值右沿 807;下一级行带经验条 (293..807 @ 516) + 灰字 @ 540。 */
  private renderStats(panel: Node, profile: PlayerLobbyProfileVO, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number,
    T: (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label): void {
    mountGlassPanel(this.host, panel, 'Stats', FX((208 + 840) / 2), FY((397 + 772) / 2), S(840 - 208), S(772 - 397), k);
    const fmt = (value: number | null | undefined): string => this.host.formatInteger(value);
    const progress = profile.levelProgress;
    const nextText = !progress || progress.nextLevel == null ? '已达当前上限' : `Lv.${progress.nextLevel} 还差 ${fmt(progress.expToNextLevel)} EXP`;
    const ratio = progress?.nextLevelNeedExp ? Math.max(0, Math.min(1, (progress.currentExp ?? 0) / progress.nextLevelNeedExp)) : null;
    const rows: Array<{ key: string; icon: string; label: string; value: string; y: number }> = [
      { key: 'level', icon: 'profile_helmet', label: '等级', value: `Lv.${profile.playerLevel}`, y: 432 },
      { key: 'next', icon: 'profile_star', label: '下一级', value: nextText, y: 484 },
      { key: 'cap', icon: 'profile_helmet', label: '英雄上限', value: progress?.maxHeroLevel == null ? '-' : `Lv.${progress.maxHeroLevel}`, y: 592 },
      { key: 'stamina', icon: 'profile_bolt', label: '体力', value: `${fmt(profile.stamina)}/${fmt(profile.maxStamina)}`, y: 644 },
      { key: 'lineup', icon: 'profile_swords', label: '阵容战力', value: fmt(profile.lineupPower ?? profile.combatPower), y: 696 },
      { key: 'total', icon: 'profile_bars', label: '英雄总战力', value: fmt(profile.combatPower), y: 748 },
    ];
    rows.forEach((row, index) => {
      const icon = this.host.addSprite(`StatIcon_${row.key}`, ICON(row.icon), FX(250), FY(row.y), S(40), S(40), panel);
      if (icon) {
        icon.color = ICON_TINT;
      }
      T(panel, `StatLabel_${row.key}`, row.label, FX(293), FY(row.y), 22, GLASS_COLOR.sub, S(200));
      T(panel, `StatValue_${row.key}`, row.value, FX(807), FY(row.y), 23, GLASS_COLOR.text, S(380), HorizontalTextAlignment.RIGHT);
      const dividerY = row.key === 'next' ? 562 : row.y + 26;
      if (index < rows.length - 1) {
        mountGlassLine(this.host, panel, `StatLine_${row.key}`, FX((232 + 817) / 2), FY(dividerY), S(817 - 232), Math.max(1, S(1)), new Color(255, 255, 255, 20));
      }
    });
    // 经验条:灰槽 + 香槟填充
    const barW = S(807 - 293);
    const barH = Math.max(3, S(8));
    const barX = (FX(293) + FX(807)) / 2;
    mountGlassLine(this.host, panel, 'ExpTrack', barX, FY(516), barW, barH, new Color(255, 255, 255, 30));
    if (ratio !== null && ratio > 0) {
      mountGlassLine(this.host, panel, 'ExpFill', FX(293) + barW * ratio / 2, FY(516), barW * ratio, barH, GLASS_COLOR.champagne);
    }
    if (progress?.nextLevelNeedExp) {
      T(panel, 'ExpText', `${fmt(progress.currentExp)} / ${fmt(progress.nextLevelNeedExp)}`, FX(293), FY(540), 19, GLASS_COLOR.sub, S(300));
    }
  }

  /** 最近战斗 862..1660 × 173..772:标题 @ 207;列表 878..1640 × 232..766,行高 80 / 步 89;图标格 (行左 +49) 64 方;名称左沿 行左 +111;胜负签 94×38 贴右 12。 */
  private renderRecent(panel: Node, FX: (px: number) => number, FY: (py: number) => number, S: (v: number) => number, k: number,
    T: (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label): void {
    mountGlassPanel(this.host, panel, 'Recent', FX((862 + 1660) / 2), FY((173 + 772) / 2), S(1660 - 862), S(772 - 173), k);
    const battles = this.host.currentLobbyBattleState().recentBattles.slice(0, RECENT_MAX);
    this.host.addSprite('RecentBar', GLASS_ICON.accent, FX(887), FY(207), S(6), S(32), panel);
    T(panel, 'RecentTitle', '最近战斗', FX(904), FY(207), 26, GLASS_COLOR.text, S(260), HorizontalTextAlignment.LEFT, true);
    if (battles.length > 0) {
      T(panel, 'RecentCount', `最近 ${battles.length} 场`, FX(1630), FY(207), 20, GLASS_COLOR.sub, S(200), HorizontalTextAlignment.RIGHT);
    }
    if (battles.length === 0) {
      T(panel, 'RecentEmpty', '暂无战斗记录', FX(1261), FY(480), 22, GLASS_COLOR.sub, S(400), HorizontalTextAlignment.CENTER);
      return;
    }
    const rowW = S(1640 - 878);
    const rowH = S(80);
    const step = S(89);
    const viewTop = FY(232);
    const viewBottom = FY(766);
    const viewH = viewTop - viewBottom;
    const viewW = rowW + S(6);
    const contentH = Math.max(viewH, rowH + step * (battles.length - 1));
    const viewport = this.host.addChildPlainNode(panel, 'RecentList', FX((878 + 1640) / 2), (viewTop + viewBottom) / 2, viewW, viewH);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const scroll = viewport.addComponent(ScrollView);
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    const baseY = (viewH - contentH) / 2;
    const content = this.host.addChildPlainNode(viewport, 'RecentContent', 0, baseY, viewW, contentH);
    scroll.content = content;
    const raidStages = this.host.currentLobbyRaidStages();
    battles.forEach((battle, index) => {
      const view = battleRecordView(battle.stageCode, raidStages, (code) => this.host.lobbyStageDisplayLabel(code));
      const result = resultView(battle.result);
      const row = this.host.addChildPlainNode(content, `Battle_${index}`, 0, contentH / 2 - rowH / 2 - index * step, rowW, rowH);
      mountGlassSlice(this.host, row, 'Bg', GLASS_SLICES.panel, 0, 0, rowW, rowH, k);
      const left = -rowW / 2;
      mountGlassFrame(this.host, row, 'IconTile', left + S(49), 0, S(64), S(64), k);
      const icon = this.host.addSprite('Icon', view.icon, left + S(49), 0, S(40), S(40), row);
      if (icon) {
        icon.color = ICON_TINT;
      }
      T(row, 'Title', view.title, left + S(111), S(15), 23, GLASS_COLOR.text, rowW - S(111) - S(130), HorizontalTextAlignment.LEFT, true);
      T(row, 'Time', (battle.recordedTime ?? '').replace('T', ' ').slice(5, 16), left + S(111), -S(17), 19, GLASS_COLOR.sub, S(300));
      this.resultTag(row, result.text, result.tone, rowW / 2 - S(12) - S(47), 0, S(94), S(38), S);
    });
    const maxOffset = contentH - viewH;
    if (maxOffset > 1) {
      const trackH = viewH - S(8);
      const update = mountGlassScrollBar(this.host, panel, 'RecentScrollBar', FX(1648), (viewTop + viewBottom) / 2, S(5), trackH, Math.max(S(40), trackH * (viewH / contentH)));
      const draw = (): void => update(Math.min(maxOffset, Math.max(0, content.position.y - baseY)) / maxOffset);
      draw();
      viewport.on(ScrollView.EventType.SCROLLING, draw, this);
    }
  }

  /** 胜负签:胜 = 暗绿底绿字、负 = 暗红底红字、其他 = 灰(同 mountGlassBonusTag 画法)。 */
  private resultTag(parent: Node, text: string, tone: 'win' | 'lose' | 'other', x: number, y: number, w: number, h: number, S: (v: number) => number): void {
    const palette = tone === 'win'
      ? { bg: new Color(29, 48, 41, 240), line: new Color(96, 128, 100, 230), text: new Color(150, 214, 166, 255) }
      : tone === 'lose'
        ? { bg: new Color(58, 30, 30, 240), line: new Color(150, 86, 80, 230), text: new Color(236, 136, 122, 255) }
        : { bg: new Color(40, 44, 52, 240), line: new Color(110, 118, 130, 220), text: GLASS_COLOR.sub };
    const node = this.host.addChildPlainNode(parent, 'Result', x, y, w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = palette.bg;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    g.strokeColor = palette.line;
    g.lineWidth = Math.max(1, h * 0.04);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.stroke();
    const label = glassLabel(this.host, node, 'Text', text, 0, 0, Math.max(12, Math.round(S(20))), palette.text, w - h * 0.4, HorizontalTextAlignment.CENTER, true);
    label.enableShadow = false;
  }

  /**
   * 改名小弹框(版式同兑换码弹框 gift_b:791×393 居中;标题 + ✕、当前昵称、输入框、规则、价格行、底部取消 / 确认)。
   * 输入框 EditBox 挂内容根(工厂),节点改名 RENAME_INPUT_NAME 便于单独移除。
   */
  renderRename(layout: UiLayout): void {
    const state = this.host.currentProfileRenameState();
    if (!state.open) {
      return;
    }
    const profile = this.host.currentLobbyProfile();
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    const { k, S } = glassProtoMap(layout.stageWidth, layout.stageHeight);
    const D = (px: number): number => (px - 936.5) * k;
    const E = (py: number): number => (417.5 - py) * k;
    const T = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, align = HorizontalTextAlignment.LEFT, bold = false): Label => {
      const label = glassLabel(this.host, parent, name, text, x, y, S(size), color, width, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };
    const root = this.host.createUiNode(LobbyProfileGlassDialogRenderer.RENAME_NODE_NAME);
    root.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    root.addComponent(BlockInputEvents);
    const dim = root.addComponent(Graphics);
    dim.fillColor = rgba(4, 6, 10, 150);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    root.on(Node.EventType.TOUCH_END, () => this.host.closeProfileRename(), this);
    const panelW = S(791);
    const panelH = S(393);
    const panel = this.host.addChildPlainNode(root, 'Panel', cx, cy, panelW, panelH);
    panel.addComponent(BlockInputEvents);
    mountGlassSlice(this.host, panel, 'GlassBase', GLASS_SLICES.panel, 0, 0, panelW, panelH, k);
    mountGlassSlice(this.host, panel, 'Glass', GLASS_SLICES.panel, 0, 0, panelW, panelH, k);
    const titleIcon = this.host.addSprite('Icon', ICON('profile_pencil'), D(604), E(276), S(32), S(32), panel);
    if (titleIcon) {
      titleIcon.color = ICON_TINT;
    }
    T(panel, 'Title', '修改昵称', D(644), E(276), 32, GLASS_COLOR.text, S(300), HorizontalTextAlignment.LEFT, true);
    mountGlassIconButton(this.host, panel, 'Close', GLASS_ICON.close, D(1274), E(269), S(34), S(72), () => this.host.closeProfileRename());
    T(panel, 'Current', `当前昵称:${state.info?.currentName ?? profile.displayName}`, D(584), E(332), 21, GLASS_COLOR.sub, S(704));
    const inputY = 400;
    mountGlassSlice(this.host, panel, 'InputBg', GLASS_SLICES.input, 0, E(inputY), S(703), S(70), k);
    T(panel, 'Rules', '2-12 个字符,支持中文、英文、数字和下划线,不能与他人重名', D(584), E(458), 18, GLASS_COLOR.dim, S(704));

    // 价格行 / 出错提示(左下,按钮左侧)
    const diamond = Math.max(0, Math.floor(Number(profile.diamond ?? 0)));
    let costText = '正在读取改名价格…';
    let costColor = GLASS_COLOR.sub;
    let affordable = true;
    if (state.info) {
      if (state.info.freeAvailable) {
        costText = '本次改名免费(首次)';
        costColor = GLASS_COLOR.green;
      } else {
        affordable = diamond >= state.info.diamondCost;
        costText = `消耗 ${this.host.formatInteger(state.info.diamondCost)} 钻石(持有 ${this.host.formatInteger(diamond)})`;
        costColor = affordable ? GLASS_COLOR.champagne : GLASS_COLOR.red;
      }
    }
    const errorText = state.error || (!affordable ? '钻石不足,可在商店充值后再改名' : '');
    T(panel, 'Cost', errorText || costText, D(584), E(547), 19, errorText ? GLASS_COLOR.red : costColor, S(290));
    const canSubmit = !state.busy && !state.infoLoading && !!state.info && affordable;
    mountGlassButton(this.host, panel, 'Cancel', '取消', D(983.5), E(547), S(193), S(62), k, state.busy ? 'disabled' : 'secondary', () => this.host.closeProfileRename());
    mountGlassButton(this.host, panel, 'Confirm', state.busy ? '提交中…' : '确认修改', D(1193.5), E(547), S(193), S(62), k, canSubmit ? 'primary' : 'primaryOff', () => this.host.submitProfileRename());

    const input = this.host.addFramedEditBox(state.draft, cx + D(936.5), cy + E(inputY), S(703) - S(28), layout, false, {
      frameless: true,
      placeholder: '输入新昵称',
      placeholderColor: new Color(136, 142, 154, 230),
    });
    input.node.name = LobbyProfileGlassDialogRenderer.RENAME_INPUT_NAME;
    const inputFont = Math.max(14, Math.round(S(24)));
    for (const label of [input.textLabel, input.node.getChildByName('EditBoxDisplayLabel')?.getComponent(Label)]) {
      if (label) {
        label.fontSize = inputFont;
        label.lineHeight = inputFont + 6;
      }
    }
    input.maxLength = 24;
    input.enabled = !state.busy;
    input.node.on(EditBox.EventType.TEXT_CHANGED, (box: EditBox) => this.host.setProfileRenameDraft(box.string), this);
    input.node.on(EditBox.EventType.EDITING_RETURN, () => this.host.submitProfileRename(), this);
  }
}
