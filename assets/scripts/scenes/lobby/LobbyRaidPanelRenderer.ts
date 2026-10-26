import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { PlayerBattleRewardItemVO } from '../../types/BattleTypes';
import type { RaidPvpCandidateVO, RaidPvpHomeVO, RaidPvpReportVO, RaidStagesVO, RaidStageVO } from '../../types/RaidTypes';
import { C1812_BUTTON_PRIMARY_ASSET } from '../C1812CommonUiAssets';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { mountKitLoading } from '../UiKit';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { resolveHeroAvatarPath } from './HeroHeadCrop';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 矿境面板(docs/48 NPC 矿 + docs/49 真人矿),按两张原型 1:1 还原(2026-10-26 用户要求):
 * - 真人矿 `周报截图/2026-10-26_真人矿/proto/pvp_v1.png`:左「我的矿」/ 中「可掠夺的矿」5 行 / 右「战报」;
 * - NPC 矿 `周报截图/2026-10-26_矿境面板/proto/panel_v1.png`:左矿区列(带缩略图)/ 中矿洞地图 + 2×5 矿口 / 右信息卡。
 * 两张原型都是 1870×841,所有尺寸按 k = 面板高 / 841 从原型像素换算;左右两列按 k 定宽贴边,中间自适应(电脑 16:9 只压中间)。
 * 素材 `ui/raid/*`(Codex 出图后 tools/qa/raid_install_assets.py 入库),缺图时退程序画。
 */
export interface LobbyRaidPanelState {
  loading: boolean;
  error: string;
  stages: RaidStagesVO | null;
  selectedStageCode: string;
  /** 页签:真人矿(默认)/ NPC 矿。 */
  tab: 'pvp' | 'npc';
  version: number;
}

/** 真人矿页数据(docs/49)。 */
export interface LobbyRaidPvpState {
  loading: boolean;
  error: string;
  home: RaidPvpHomeVO | null;
  buying: boolean;
  version: number;
}

export interface LobbyRaidPanelHost {
  node: Node;
  currentLobbyRaidState(): LobbyRaidPanelState;
  currentLobbyProfile?(): PlayerLobbyProfileVO;
  closeLobbyRaidPanel(): void;
  reloadLobbyRaidStages(): void;
  selectLobbyRaidStage(stageCode: string): void;
  startLobbyRaidBattle(stageCode: string): void;
  currentLobbyRaidPvpState(): LobbyRaidPvpState;
  selectLobbyRaidTab(tab: 'pvp' | 'npc'): void;
  reloadLobbyRaidPvp(refresh: boolean): void;
  buyLobbyRaidShield(): void;
  /** 掠夺真人矿 / 复仇(revengeOf = 被打的战报 id)。 */
  startLobbyRaidPvp(defenderUserId: number, revengeOf?: number | null): void;
  createUiNode(name: string): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
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
    size?: Size,
    align?: HorizontalTextAlignment,
  ): Label;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

const STAMINA_ICON_ASSET = 'ui/bag/ai/icon_stamina/spriteFrame';
const LOCK_ICON_ASSET = 'ui/common/ai/ic_lock/spriteFrame';
const RAID_ART = {
  mineCard: 'ui/raid/pvp_mine_card/spriteFrame',
  mapBg: 'ui/raid/npc_map_bg/spriteFrame',
  nodeOn: 'ui/raid/mine_node_on/spriteFrame',
  nodeOff: 'ui/raid/mine_node_off/spriteFrame',
  zoneThumb: (index: number) => `ui/raid/zone_thumb_${index + 1}/spriteFrame`,
  attack: 'ui/raid/ic_report_attack/spriteFrame',
  defend: 'ui/raid/ic_report_defend/spriteFrame',
};
/** 矿境面板整组素材(UiSpriteFrameCache 预载组 'raid':首开等齐再画)。 */
export const RAID_UI_ASSET_PATHS: readonly string[] = [
  RAID_ART.mineCard,
  RAID_ART.mapBg,
  RAID_ART.nodeOn,
  RAID_ART.nodeOff,
  RAID_ART.attack,
  RAID_ART.defend,
  ...[0, 1, 2, 3, 4, 5].map((index) => RAID_ART.zoneThumb(index)),
];
/** 原型图尺寸(两张都是 1870×841)。 */
const PROTO_H = 841;
const STAGES_PER_ZONE = 10;
const GOLD_LINE = rgba(190, 141, 62, 226);
const GOLD_TEXT = rgba(244, 220, 166, 255);
const BODY_TEXT = rgba(236, 224, 196, 250);
const DIM_TEXT = rgba(150, 140, 120, 235);
const GREEN_TEXT = rgba(140, 230, 150, 250);
const RED_TEXT = rgba(255, 150, 130, 250);
const CARD_FILL = rgba(14, 12, 12, 236);

/** 千分位(安卓原生 toLocaleString 不分组)。 */
function fmt(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 星级:≤3 画星,再多用「★N」(原型里都是 1~3 星;真人阵容 5~10 星一行放不下)。 */
function starText(star: number): string {
  return star > 3 ? `★${star}` : '★'.repeat(Math.max(1, star));
}

export class LobbyRaidPanelRenderer {
  constructor(private readonly host: LobbyRaidPanelHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyRaidState();
    const scale = Math.max(0.68, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(300 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.host.createUiNode('LobbyRaidDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.host.createUiNode('LobbyRaidSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    panelGroup.addComponent(BlockInputEvents);
    const panel = this.host.addChildBeveledPanelNode(panelGroup, 'LobbyRaidSceneFrame', 0, 0, panelWidth, panelHeight, rgba(6, 6, 8, 232), GOLD_LINE, 18 * scale);

    const profile = this.host.currentLobbyProfile?.();
    if (profile) {
      renderTopCurrencyBar(this.host, panel, panelWidth / 2, panelHeight / 2, scale, [
        { key: 'stamina', icon: STAMINA_ICON_ASSET, value: `${profile.stamina}/${profile.maxStamina}` },
      ]);
    }
    const k = panelHeight / PROTO_H;
    this.renderTabs(panel, panelWidth, panelHeight, k, state.tab);
    if (state.tab === 'pvp') {
      this.renderPvp(panel, panelWidth, panelHeight, scale, k, this.host.currentLobbyRaidPvpState());
    } else if (state.loading && !state.stages) {
      mountKitLoading(this.host, panel, 0, 10 * scale, scale, '矿境读取中…');
    } else if (state.error && !state.stages) {
      const hint = this.host.addChildLabel(panel, 'LobbyRaidError', `读取失败:${state.error}`, 0, 20 * scale, 18 * scale, RED_TEXT, new Size(panelWidth * 0.7, 26 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      this.renderRetryButton(panel, scale, () => this.host.reloadLobbyRaidStages());
    } else if (state.stages) {
      const selected = this.resolveSelected(state);
      const zoneRight = this.renderZoneList(panel, panelWidth, panelHeight, k, state.stages, selected);
      const infoLeft = this.renderInfoCard(panel, panelWidth, panelHeight, k, selected, profile);
      this.renderMineMap(panel, panelWidth, panelHeight, k, state.stages, selected, zoneRight, infoLeft);
    }
    const phoneHelp = isPhoneDesign()
      ? '真人矿:挑一个玩家的矿,打倒守卫、砸碎水晶就抢走对方矿库的 10%;输了赔自己矿库的 5%。被打赢自动得 8 小时盾,也可以花钻买盾。\n\nNPC 矿:练手与保底收入,每座胜利扣 6 体力,首通有绑定钻石。'
      : '';
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyRaidBackButton', () => this.host.closeLobbyRaidPanel(), scale, '矿境', phoneHelp);
  }

  private resolveSelected(state: LobbyRaidPanelState): RaidStageVO | null {
    const stages = state.stages?.stages ?? [];
    if (stages.length === 0) {
      return null;
    }
    return stages.find((stage) => stage.stageCode === state.selectedStageCode)
      ?? stages.find((stage) => stage.stageCode === state.stages?.nextStageCode)
      ?? stages[0];
  }

  // ── 原型坐标换算:原型左上角为原点,x 向右、y 向下(像素)──

  private px(width: number, k: number, x: number): number {
    return -width / 2 + x * k;
  }

  private py(height: number, k: number, y: number): number {
    return height / 2 - y * k;
  }

  // ── 页签(原型 pvp_v1:返回横幅右侧「真人矿 | NPC 矿」,选中金色带下划线)──

  private renderTabs(parent: Node, width: number, height: number, k: number, active: 'pvp' | 'npc'): void {
    // 手机的返回横幅 + 「?」比原型宽,页签整体右移到横幅之后
    const bannerRight = -width / 2 + width * (isPhoneDesign() ? 0.255 : 0.17);
    const shift = Math.max(0, bannerRight + 30 * k - this.px(width, k, 330));
    const y = this.py(height, k, 42);
    const font = 30 * k;
    const tabs: Array<{ key: 'pvp' | 'npc'; label: string; x: number }> = [
      { key: 'pvp', label: '真人矿', x: 382 },
      { key: 'npc', label: 'NPC 矿', x: 553 },
    ];
    for (const tab of tabs) {
      const x = this.px(width, k, tab.x) + shift;
      const node = this.host.addChildPlainNode(parent, `LobbyRaidTab_${tab.key}`, x, y, 150 * k, 60 * k);
      const label = this.host.addChildLabel(node, 'Label', tab.label, 0, 0, font, tab.key === active ? GOLD_TEXT : DIM_TEXT, new Size(150 * k, font * 1.4));
      label.isBold = tab.key === active;
      if (tab.key === active) {
        const line = node.addComponent(Graphics);
        line.strokeColor = rgba(236, 196, 110, 250);
        line.lineWidth = Math.max(2, 3 * k);
        line.moveTo(-52 * k, -26 * k);
        line.lineTo(52 * k, -26 * k);
        line.stroke();
      }
      node.on(Node.EventType.TOUCH_END, () => this.host.selectLobbyRaidTab(tab.key), this);
      this.host.applyImageButtonFeedback(node, 1.03, 0.97);
    }
  }

  // ════════════════════ 真人矿(原型 pvp_v1)════════════════════

  private renderPvp(parent: Node, width: number, height: number, scale: number, k: number, state: LobbyRaidPvpState): void {
    if (state.loading && !state.home) {
      mountKitLoading(this.host, parent, 0, 10 * scale, scale, '真人矿读取中…');
      return;
    }
    if (state.error && !state.home) {
      const hint = this.host.addChildLabel(parent, 'LobbyRaidPvpError', `读取失败:${state.error}`, 0, 20 * scale, 22 * k, RED_TEXT, new Size(width * 0.7, 30 * k));
      hint.overflow = Label.Overflow.SHRINK;
      this.renderRetryButton(parent, scale, () => this.host.reloadLobbyRaidPvp(false));
      return;
    }
    const home = state.home;
    if (!home) {
      return;
    }
    // 三列(原型):左卡 x 25..428,右卡 x 1425..1850,y 93..810
    const top = this.py(height, k, 93);
    const bottom = this.py(height, k, 810);
    const leftCard = { x: this.px(width, k, 25), w: 403 * k };
    const rightCard = { x: width / 2 - 20 * k - 425 * k, w: 425 * k };
    this.renderPvpMine(parent, k, home, state, leftCard.x, leftCard.w, top, bottom);
    this.renderPvpReports(parent, k, home, rightCard.x, rightCard.w, top, bottom);
    this.renderPvpCandidates(parent, k, home, leftCard.x + leftCard.w + 28 * k, rightCard.x - 23 * k, top, bottom);
  }

  /** 左「我的矿」:矿晶簇插画铺卡上 2/3,下面压 矿库 / 阵容战力 / 盾 / 买盾钮。 */
  private renderPvpMine(parent: Node, k: number, home: RaidPvpHomeVO, state: LobbyRaidPvpState, left: number, cardW: number, top: number, bottom: number): void {
    const cardH = top - bottom;
    const card = this.host.addChildBeveledPanelNode(parent, 'LobbyRaidPvpMine', left + cardW / 2, (top + bottom) / 2, cardW, cardH, CARD_FILL, GOLD_LINE, 12 * k);
    const cy = (y: number): number => cardH / 2 - y * k;
    // 插画(900×1000):宽度贴卡,顶在标题带下,下沿裁在卡内
    const artW = cardW - 6 * k;
    const artH = artW * (1000 / 900);
    const clipH = Math.min(artH, cardH - 70 * k);
    const artHolder = this.host.addChildPlainNode(card, 'ArtClip', 0, cy(60) - clipH / 2, artW, clipH);
    artHolder.addComponent(Mask);
    const art = this.host.addSprite('Art', RAID_ART.mineCard, 0, (clipH - artH) / 2, artW, artH, artHolder);
    if (!art) {
      const icon = resolveBagStyleItemIconAsset('SACRED_CRYSTAL', 'CURRENCY');
      if (icon) {
        this.host.addSprite('Crystal', icon, 0, clipH / 2 - 180 * k, 180 * k, 180 * k, artHolder);
      }
    }
    const title = this.host.addChildLabel(card, 'Title', '我的矿', 0, cy(44), 30 * k, GOLD_TEXT, new Size(cardW * 0.9, 40 * k));
    title.isBold = true;
    const crystal = this.host.addChildLabel(card, 'Crystal', `矿库 ${fmt(home.myCrystal)}`, 0, cy(368), 40 * k, GOLD_TEXT, new Size(cardW * 0.94, 52 * k));
    crystal.isBold = true;
    crystal.overflow = Label.Overflow.SHRINK;
    crystal.enableOutline = true;
    crystal.outlineColor = rgba(10, 6, 4, 255);
    crystal.outlineWidth = Math.max(1, 2 * k);
    const power = this.host.addChildLabel(card, 'Power', `阵容战力 ${fmt(home.lineupPower)}`, 0, cy(444), 22 * k, BODY_TEXT, new Size(cardW * 0.94, 30 * k));
    power.overflow = Label.Overflow.SHRINK;
    const shieldLeft = home.shieldUntil ? this.msUntil(home.shieldUntil) : 0;
    const protectLeft = home.protectUntil ? this.msUntil(home.protectUntil) : 0;
    const guarded = shieldLeft > 0 || protectLeft > 0;
    const shieldText = shieldLeft > 0 ? `保护盾: 剩余 ${this.formatLeft(shieldLeft)}` : protectLeft > 0 ? `新手保护: 剩余 ${this.formatLeft(protectLeft)}` : '无盾: 矿可能被掠夺';
    const shieldIcon = this.host.addSprite('ShieldIcon', RAID_ART.defend, -cardW / 2 + 48 * k, cy(507), 34 * k, 34 * k, card);
    const shield = this.host.addChildLabel(card, 'Shield', shieldText, shieldIcon ? -cardW / 2 + 72 * k : 0, cy(507), 21 * k, guarded ? GREEN_TEXT : rgba(255, 170, 120, 250), new Size(cardW - (shieldIcon ? 84 * k : 24 * k), 28 * k), shieldIcon ? HorizontalTextAlignment.LEFT : HorizontalTextAlignment.CENTER);
    shield.overflow = Label.Overflow.SHRINK;
    const buttonW = 280 * k;
    const buttonH = 56 * k;
    const button = this.host.addChildPlainNode(card, 'LobbyRaidShieldBuy', 0, cy(588), buttonW, buttonH);
    this.paintButton(button, buttonW, buttonH, k, state.buying ? '购买中…' : `买 1 天盾 · ${home.shieldPrice} 钻`, 24 * k);
    if (home.canBuyShield && !state.buying) {
      button.on(Node.EventType.TOUCH_END, () => this.host.buyLobbyRaidShield(), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    } else {
      button.addComponent(UIOpacity).opacity = 120;
    }
    const note = this.host.addChildLabel(card, 'Note', home.canBuyShield ? '被打赢自动得 8 小时盾' : home.shieldNote, 0, cy(640), 17 * k, rgba(190, 178, 150, 220), new Size(cardW * 0.94, 24 * k));
    note.overflow = Label.Overflow.SHRINK;
  }

  /** 中「可掠夺的矿」:标题 + 换一批,5 行候选(行高 106、间距 6)。 */
  private renderPvpCandidates(parent: Node, k: number, home: RaidPvpHomeVO, left: number, right: number, top: number, bottom: number): void {
    const areaW = right - left;
    const titleY = top - 44 * k;
    const title = this.host.addChildLabel(parent, 'LobbyRaidPvpTitle', '可掠夺的矿', left + 12 * k, titleY, 30 * k, GOLD_TEXT, new Size(areaW * 0.5, 40 * k), HorizontalTextAlignment.LEFT);
    title.isBold = true;
    const refreshW = 171 * k;
    const refreshH = 47 * k;
    const refresh = this.host.addChildPlainNode(parent, 'LobbyRaidPvpRefresh', right - refreshW / 2 - 14 * k, titleY, refreshW, refreshH);
    this.paintButton(refresh, refreshW, refreshH, k, '换一批', 24 * k);
    refresh.on(Node.EventType.TOUCH_END, () => this.host.reloadLobbyRaidPvp(true), this);
    this.host.applyImageButtonFeedback(refresh, 1.04, 0.96);
    const rowsTop = top - 91 * k;
    const rowH = 106 * k;
    const pitch = 112 * k;
    if (home.candidates.length === 0) {
      const empty = this.host.addChildLabel(parent, 'LobbyRaidPvpEmpty', '暂时没有可掠夺的矿,点「换一批」或稍后再来', (left + right) / 2, (rowsTop + bottom) / 2, 24 * k, DIM_TEXT, new Size(areaW, 32 * k));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }
    home.candidates.slice(0, 5).forEach((candidate, index) => {
      const y = rowsTop - rowH / 2 - index * pitch;
      if (y - rowH / 2 < bottom) {
        return;
      }
      this.renderPvpCandidateRow(parent, candidate, left, right, y, rowH, k);
    });
  }

  private renderPvpCandidateRow(parent: Node, candidate: RaidPvpCandidateVO, left: number, right: number, cy: number, h: number, k: number): void {
    const w = right - left;
    const row = this.host.addChildPlainNode(parent, `LobbyRaidPvpRow_${candidate.userId}`, (left + right) / 2, cy, w, h);
    const g = row.addComponent(Graphics);
    g.fillColor = rgba(16, 13, 12, 230);
    g.roundRect(-w / 2, -h / 2, w, h, 8 * k);
    g.fill();
    g.strokeColor = rgba(150, 118, 66, 210);
    g.lineWidth = Math.max(1, 1.5 * k);
    g.roundRect(-w / 2, -h / 2, w, h, 8 * k);
    g.stroke();
    const blocked = candidate.attackedRecently;
    const textColor = blocked ? DIM_TEXT : BODY_TEXT;
    // 原型行宽 946:电脑端中间列更窄时整行内容(位置 / 尺寸 / 字号)统一按 kr 缩,手机 kr = k;右半部分(守卫 / 掠夺钮)从右缘量
    const kr = Math.min(k, w / 946);
    const rx = (x: number): number => -w / 2 + x * kr;
    const rr = (x: number): number => w / 2 - x * kr;
    const ry = (y: number): number => h / 2 - y * k;
    // 头像(圆形金环;用对方阵容第一个英雄的头像)
    const avatar = 86 * kr;
    const holder = this.host.addChildPlainNode(row, 'Avatar', rx(61), 0, avatar, avatar);
    const ring = holder.addComponent(Graphics);
    ring.fillColor = rgba(30, 26, 24, 255);
    ring.circle(0, 0, avatar / 2);
    ring.fill();
    const art = resolveHeroAvatarPath(candidate.defenders[0]?.heroCode);
    if (!art || !this.host.addSprite('Art', art, 0, 0, avatar * 0.92, avatar * 0.92, holder)) {
      const initial = this.host.addChildLabel(holder, 'Initial', candidate.nickname.slice(0, 1), 0, 0, avatar * 0.4, textColor, new Size(avatar, avatar * 0.6));
      initial.isBold = true;
    }
    ring.strokeColor = rgba(196, 154, 86, 240);
    ring.lineWidth = Math.max(1.5, 2.5 * kr);
    ring.circle(0, 0, avatar / 2);
    ring.stroke();
    if (blocked) {
      holder.addComponent(UIOpacity).opacity = 120;
    }
    // 昵称 / 等级(左对齐)
    const name = this.host.addChildLabel(row, 'Name', candidate.nickname, rx(136), ry(34), 26 * kr, blocked ? DIM_TEXT : GOLD_TEXT, new Size(140 * kr, 34 * k), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    name.isBold = true;
    const level = this.host.addChildLabel(row, 'Level', `Lv.${candidate.level}`, rx(136), ry(73), 21 * kr, textColor, new Size(140 * kr, 28 * k), HorizontalTextAlignment.LEFT);
    level.overflow = Label.Overflow.SHRINK;
    // 阵容战力 / 矿库 · 可抢(或「24 小时内已打过」红字)
    const power = this.host.addChildLabel(row, 'Power', `阵容战力 ${fmt(candidate.lineupPower)}`, rx(287), ry(34), 22 * kr, textColor, new Size(280 * kr, 30 * k), HorizontalTextAlignment.LEFT);
    power.overflow = Label.Overflow.SHRINK;
    const crystal = this.host.addChildLabel(row, 'Crystal', blocked ? '24 小时内已打过' : `矿库 ${fmt(candidate.crystal)} · 可抢 ${fmt(candidate.stealPreview)}`, rx(287), ry(73), 22 * kr, blocked ? RED_TEXT : textColor, new Size(280 * kr, 30 * k), HorizontalTextAlignment.LEFT);
    crystal.overflow = Label.Overflow.SHRINK;
    // 守卫 ×3:方形金框头像 + 星
    const slot = 65 * kr;
    candidate.defenders.slice(0, 3).forEach((defender, index) => {
      const x = rr(349 - index * 80);
      const box = this.host.addChildPlainNode(row, `Def_${index}`, x, ry(36), slot, slot);
      const bg = box.addComponent(Graphics);
      bg.fillColor = rgba(30, 26, 24, 255);
      bg.roundRect(-slot / 2, -slot / 2, slot, slot, 5 * kr);
      bg.fill();
      const defArt = resolveHeroAvatarPath(defender.heroCode);
      if (!defArt || !this.host.addSprite('Art', defArt, 0, 0, slot * 0.94, slot * 0.94, box)) {
        this.host.addChildLabel(box, 'Txt', (defender.heroName || defender.heroCode).slice(0, 1), 0, 0, slot * 0.4, textColor, new Size(slot, slot * 0.6));
      }
      bg.strokeColor = rgba(196, 154, 86, 230);
      bg.lineWidth = Math.max(1, 1.5 * kr);
      bg.roundRect(-slot / 2, -slot / 2, slot, slot, 5 * kr);
      bg.stroke();
      if (blocked) {
        box.addComponent(UIOpacity).opacity = 120;
      }
      const star = this.host.addChildLabel(row, `DefStar_${index}`, starText(defender.star), x, ry(86), 15 * kr, rgba(255, 220, 110, 250), new Size(slot * 1.3, 20 * k));
      star.overflow = Label.Overflow.SHRINK;
    });
    // 掠夺钮(右端)
    const buttonW = 132 * kr;
    const buttonH = 47 * kr;
    const button = this.host.addChildPlainNode(row, 'Attack', rr(73), 0, buttonW, buttonH);
    this.paintButton(button, buttonW, buttonH, kr, '掠夺', 24 * kr);
    if (blocked) {
      button.addComponent(UIOpacity).opacity = 110;
    } else {
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidPvp(candidate.userId, null), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
  }

  /** 右「战报」:每条 = 剑 / 盾图标 + 两行文字(结果绿 / 红,时间右对齐),被打的带「复仇」钮。 */
  private renderPvpReports(parent: Node, k: number, home: RaidPvpHomeVO, left: number, cardW: number, top: number, bottom: number): void {
    const cardH = top - bottom;
    const card = this.host.addChildBeveledPanelNode(parent, 'LobbyRaidPvpReports', left + cardW / 2, (top + bottom) / 2, cardW, cardH, CARD_FILL, GOLD_LINE, 12 * k);
    const cy = (y: number): number => cardH / 2 - y * k;
    const title = this.host.addChildLabel(card, 'Title', '战报', 0, cy(44), 30 * k, GOLD_TEXT, new Size(cardW * 0.9, 40 * k));
    title.isBold = true;
    this.drawDivider(card, cy(78), cardW, k);
    const pitch = 112 * k;
    const rowsTop = 80;
    const maxRows = Math.max(1, Math.floor((cardH - rowsTop * k - 10 * k) / pitch));
    const reports = home.reports.slice(0, maxRows);
    if (reports.length === 0) {
      const empty = this.host.addChildLabel(card, 'Empty', '还没有战报,去掠夺一座矿吧', 0, cy(160), 20 * k, DIM_TEXT, new Size(cardW * 0.9, 30 * k));
      empty.overflow = Label.Overflow.SHRINK;
      return;
    }
    reports.forEach((report, index) => {
      this.renderPvpReportRow(card, report, cy(rowsTop + 56) - index * pitch, cardW, pitch, k);
    });
  }

  private renderPvpReportRow(card: Node, report: RaidPvpReportVO, cy: number, cardW: number, rowH: number, k: number): void {
    const attack = report.role === 'ATTACK';
    const won = report.result === 'WIN';
    const iconSize = 47 * k;
    const iconX = -cardW / 2 + 33 * k + iconSize / 2;
    if (!this.host.addSprite(`ReportIcon_${report.id}`, attack ? RAID_ART.attack : RAID_ART.defend, iconX, cy, iconSize, iconSize, card)) {
      const tag = this.host.addChildPlainNode(card, `ReportTag_${report.id}`, iconX, cy, iconSize, iconSize);
      const tg = tag.addComponent(Graphics);
      tg.fillColor = attack ? rgba(110, 40, 30, 240) : rgba(30, 50, 90, 240);
      tg.circle(0, 0, iconSize / 2);
      tg.fill();
      this.host.addChildLabel(tag, 'Txt', attack ? '攻' : '守', 0, 0, iconSize * 0.5, rgba(255, 236, 190, 255), new Size(iconSize, iconSize * 0.7));
    }
    const textX = -cardW / 2 + 78 * k;
    const revengeW = 94 * k;
    const textRight = cardW / 2 - 35 * k - (report.canRevenge ? revengeW + 14 * k : 0);
    const textW = textRight - textX;
    const head = this.host.addChildLabel(card, `ReportHead_${report.id}`, attack ? `掠夺 ${report.opponentName}` : `被 ${report.opponentName} 掠夺`, textX, cy + 20 * k, 21 * k, BODY_TEXT, new Size(textW, 28 * k), HorizontalTextAlignment.LEFT);
    head.overflow = Label.Overflow.SHRINK;
    const delta = report.crystalDelta;
    const result = this.host.addChildLabel(card, `ReportBody_${report.id}`, `${won ? '胜' : '败'} ${delta >= 0 ? '+' : ''}${fmt(delta)} 矿晶`, textX, cy - 16 * k, 20 * k, won ? GREEN_TEXT : RED_TEXT, new Size(textW * 0.62, 26 * k), HorizontalTextAlignment.LEFT);
    result.overflow = Label.Overflow.SHRINK;
    const ago = this.host.addChildLabel(card, `ReportAgo_${report.id}`, this.formatAgo(report.createdAt), textRight, cy - 16 * k, 17 * k, DIM_TEXT, new Size(textW * 0.4, 24 * k), HorizontalTextAlignment.RIGHT);
    ago.overflow = Label.Overflow.SHRINK;
    if (report.canRevenge) {
      const button = this.host.addChildPlainNode(card, `ReportRevenge_${report.id}`, cardW / 2 - 35 * k - revengeW / 2, cy, revengeW, 40 * k);
      this.paintButton(button, revengeW, 40 * k, k, '复仇', 20 * k);
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidPvp(report.opponentUserId, report.id), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    const sep = this.host.addChildPlainNode(card, `ReportSep_${report.id}`, 0, cy - rowH / 2, cardW * 0.9, 2);
    const sg = sep.addComponent(Graphics);
    sg.strokeColor = rgba(120, 96, 56, 90);
    sg.lineWidth = 1;
    sg.moveTo(-cardW * 0.45, 0);
    sg.lineTo(cardW * 0.45, 0);
    sg.stroke();
  }

  // ════════════════════ NPC 矿(原型 panel_v1)════════════════════

  /** 左列矿区按钮(x 15..237,首项 y 100,间距 114,高 95):名字左对齐 + 右半缩略图 + 锁;返回列右缘 x。 */
  private renderZoneList(parent: Node, width: number, height: number, k: number, data: RaidStagesVO, selected: RaidStageVO | null): number {
    const zones = this.zonesOf(data);
    const colW = 222 * k;
    const left = this.px(width, k, 15);
    const itemH = 95 * k;
    zones.forEach((zone, index) => {
      const y = this.py(height, k, 100 + 95 / 2 + index * 114);
      const active = !!selected && selected.zoneName === zone.name;
      const unlocked = zone.stages.some((stage) => stage.unlocked);
      const node = this.host.addChildPlainNode(parent, `LobbyRaidZone_${index}`, left + colW / 2, y, colW, itemH);
      const g = node.addComponent(Graphics);
      g.fillColor = active ? rgba(40, 30, 18, 245) : rgba(14, 12, 12, 230);
      g.roundRect(-colW / 2, -itemH / 2, colW, itemH, 6 * k);
      g.fill();
      // 右半缩略图(矩形裁切 + 左缘压暗渐变)
      const thumbW = 148 * k;
      const thumbClip = this.host.addChildPlainNode(node, 'ThumbClip', colW / 2 - thumbW / 2 - 3 * k, 0, thumbW, itemH - 6 * k);
      thumbClip.addComponent(Mask);
      const thumb = this.host.addSprite('Thumb', RAID_ART.zoneThumb(index), 0, 0, thumbW, thumbW, thumbClip);
      if (thumb) {
        thumbClip.addComponent(UIOpacity).opacity = unlocked ? (active ? 255 : 200) : 110;
        const fade = this.host.addChildPlainNode(thumbClip, 'Fade', 0, 0, thumbW, itemH).addComponent(Graphics);
        for (let i = 0; i < 6; i += 1) {
          fade.fillColor = rgba(14, 12, 12, Math.round(230 * (1 - i / 6)));
          fade.rect(-thumbW / 2 + (thumbW * 0.55 / 6) * i, -itemH / 2, thumbW * 0.55 / 6 + 1, itemH);
          fade.fill();
        }
      }
      g.strokeColor = active ? rgba(236, 196, 110, 250) : rgba(120, 96, 56, 180);
      g.lineWidth = Math.max(1, (active ? 2.5 : 1.5) * k);
      g.roundRect(-colW / 2, -itemH / 2, colW, itemH, 6 * k);
      g.stroke();
      const label = this.host.addChildLabel(node, 'Name', zone.name, -colW / 2 + 32 * k, 0, 26 * k, active ? GOLD_TEXT : unlocked ? BODY_TEXT : DIM_TEXT, new Size(colW * 0.62, 34 * k), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
      label.isBold = active;
      label.enableOutline = true;
      label.outlineColor = rgba(10, 6, 4, 255);
      label.outlineWidth = Math.max(1, 2 * k);
      if (!unlocked) {
        const lockSize = 30 * k;
        this.host.addSprite('Lock', LOCK_ICON_ASSET, colW / 2 - 30 * k, 0, lockSize, lockSize, node);
      }
      node.on(Node.EventType.TOUCH_END, () => {
        const target = zone.stages.find((stage) => stage.unlocked && !stage.cleared) ?? zone.stages.find((stage) => stage.unlocked) ?? zone.stages[0];
        if (target) {
          this.host.selectLobbyRaidStage(target.stageCode);
        }
      }, this);
      this.host.applyImageButtonFeedback(node, 1.02, 0.98);
    });
    return left + colW;
  }

  private zonesOf(data: RaidStagesVO): Array<{ name: string; stages: RaidStageVO[] }> {
    const zones: Array<{ name: string; stages: RaidStageVO[] }> = [];
    for (const stage of data.stages) {
      let zone = zones.find((entry) => entry.name === stage.zoneName);
      if (!zone) {
        zone = { name: stage.zoneName, stages: [] };
        zones.push(zone);
      }
      zone.stages.push(stage);
    }
    return zones;
  }

  /** 中间矿洞地图:底图裁在列间区域,2 排 × 5 个圆形矿口(原型 y 280 / 568,直径 122,列距 184)。 */
  private renderMineMap(parent: Node, width: number, height: number, k: number, data: RaidStagesVO, selected: RaidStageVO | null, zoneRight: number, infoLeft: number): void {
    if (!selected) {
      return;
    }
    const zone = this.zonesOf(data).find((entry) => entry.name === selected.zoneName);
    if (!zone) {
      return;
    }
    const areaLeft = zoneRight + 14 * k;
    const areaRight = infoLeft - 8 * k;
    const areaW = areaRight - areaLeft;
    const areaTop = this.py(height, k, 86);
    const areaBottom = this.py(height, k, 800);
    const areaH = areaTop - areaBottom;
    const clip = this.host.addChildPlainNode(parent, 'LobbyRaidMapClip', (areaLeft + areaRight) / 2, (areaTop + areaBottom) / 2, areaW, areaH);
    clip.addComponent(Mask);
    const cover = Math.max(areaW / 1600, areaH / 900);
    this.host.addSprite('MapBg', RAID_ART.mapBg, 0, 0, 1600 * cover, 900 * cover, clip);
    const cols = Math.ceil(STAGES_PER_ZONE / 2);
    const pitch = Math.min(184 * k, (areaW - 2 * 110 * k) / (cols - 1));
    const firstX = areaLeft + (areaW - pitch * (cols - 1)) / 2;
    const rowsY = [this.py(height, k, 280), this.py(height, k, 568)];
    const diameter = 122 * k;
    const centers = zone.stages.map((stage, index) => ({ x: firstX + (index % cols) * pitch, y: rowsY[Math.floor(index / cols)] ?? rowsY[1] }));
    // 没底图时画简单的巷道连线
    const rail = this.host.addChildPlainNode(parent, 'LobbyRaidRails', 0, 0, width, height);
    const rg = rail.addComponent(Graphics);
    rg.strokeColor = rgba(120, 96, 56, 130);
    rg.lineWidth = Math.max(2, 4 * k);
    centers.forEach((center, index) => {
      if (index % cols !== cols - 1 && index + 1 < centers.length) {
        rg.moveTo(center.x + diameter / 2, center.y);
        rg.lineTo(centers[index + 1].x - diameter / 2, center.y);
      }
    });
    rg.stroke();
    zone.stages.forEach((stage, index) => {
      const center = centers[index];
      const current = selected.stageCode === stage.stageCode;
      const size = current ? diameter * 1.12 : diameter;
      const node = this.host.addChildPlainNode(parent, `LobbyRaidMine_${stage.orderNo}`, center.x, center.y, size, size);
      const art = this.host.addSprite('Art', stage.unlocked ? RAID_ART.nodeOn : RAID_ART.nodeOff, 0, 0, size, size, node);
      const g = node.addComponent(Graphics);
      if (!art) {
        g.fillColor = stage.unlocked ? rgba(26, 22, 18, 240) : rgba(12, 11, 11, 230);
        g.circle(0, 0, size / 2);
        g.fill();
        g.fillColor = stage.unlocked ? rgba(60, 44, 26, 255) : rgba(30, 26, 24, 255);
        g.roundRect(-size * 0.21, -size * 0.25, size * 0.42, size * 0.45, size * 0.1);
        g.fill();
      }
      g.strokeColor = current ? rgba(240, 200, 110, 255) : stage.unlocked ? rgba(176, 142, 82, 230) : rgba(70, 64, 56, 200);
      g.lineWidth = Math.max(1.5, (current ? 4 : 2) * k);
      g.circle(0, 0, size / 2 - g.lineWidth / 2);
      g.stroke();
      if (stage.cleared) {
        const badgeR = 20 * k;
        const badge = this.host.addChildPlainNode(node, 'Cleared', -size * 0.34, -size * 0.34, badgeR * 2, badgeR * 2);
        const bg = badge.addComponent(Graphics);
        bg.fillColor = rgba(60, 170, 80, 250);
        bg.circle(0, 0, badgeR);
        bg.fill();
        bg.strokeColor = rgba(20, 60, 28, 255);
        bg.lineWidth = Math.max(1, 1.5 * k);
        bg.circle(0, 0, badgeR);
        bg.stroke();
        const check = this.host.addChildLabel(badge, 'Check', '✓', 0, 0, badgeR * 1.3, rgba(255, 255, 255, 255), new Size(badgeR * 2, badgeR * 1.6));
        check.isBold = true;
      } else if (!stage.unlocked) {
        const lockSize = 30 * k;
        this.host.addSprite('Lock', LOCK_ICON_ASSET, 0, -size * 0.3, lockSize, lockSize, node);
      }
      const name = this.host.addChildLabel(parent, `LobbyRaidMineName_${stage.orderNo}`, `${(stage.orderNo - 1) % STAGES_PER_ZONE + 1} 号矿`, center.x, center.y - 102 * k, 22 * k, current ? GOLD_TEXT : stage.unlocked ? BODY_TEXT : DIM_TEXT, new Size(pitch, 30 * k));
      name.overflow = Label.Overflow.SHRINK;
      name.isBold = current;
      name.enableOutline = true;
      name.outlineColor = rgba(10, 6, 4, 255);
      name.outlineWidth = Math.max(1, 2 * k);
      node.on(Node.EventType.TOUCH_END, () => this.host.selectLobbyRaidStage(stage.stageCode), this);
      this.host.applyImageButtonFeedback(node, 1.05, 0.95);
    });
  }

  /** 右信息卡(x 1410..1854,y 86..795):标题 / 守卫 ×3 / 推荐战力 / 掠夺奖励 / 首通 / 掠夺钮 / 体力说明;返回卡左缘 x。 */
  private renderInfoCard(parent: Node, width: number, height: number, k: number, selected: RaidStageVO | null, profile: PlayerLobbyProfileVO | undefined): number {
    const cardW = 444 * k;
    const left = width / 2 - 16 * k - cardW;
    if (!selected) {
      return left;
    }
    const top = this.py(height, k, 86);
    const bottom = this.py(height, k, 795);
    const cardH = top - bottom;
    const card = this.host.addChildBeveledPanelNode(parent, 'LobbyRaidInfoCard', left + cardW / 2, (top + bottom) / 2, cardW, cardH, CARD_FILL, GOLD_LINE, 12 * k);
    const cy = (y: number): number => cardH / 2 - y * k;
    const cx = (x: number): number => -cardW / 2 + x * k;
    const title = this.host.addChildLabel(card, 'Title', selected.stageName, 0, cy(39), 30 * k, GOLD_TEXT, new Size(cardW * 0.9, 40 * k));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    const defenders = selected.defenders.slice(0, 3);
    const avatar = 117 * k;
    const slotXs = [86, 223, 360];
    defenders.forEach((defender, index) => {
      const x = cx(slotXs[index] ?? 223);
      const holder = this.host.addChildPlainNode(card, `Defender_${index}`, x, cy(148), avatar, avatar);
      const ring = holder.addComponent(Graphics);
      ring.fillColor = rgba(30, 26, 24, 255);
      ring.circle(0, 0, avatar / 2);
      ring.fill();
      const art = resolveHeroAvatarPath(defender.heroCode);
      if (!art || !this.host.addSprite('Art', art, 0, 0, avatar * 0.92, avatar * 0.92, holder)) {
        const initial = this.host.addChildLabel(holder, 'Initial', (defender.heroName || defender.heroCode).slice(0, 1), 0, 0, avatar * 0.4, BODY_TEXT, new Size(avatar, avatar * 0.6));
        initial.isBold = true;
      }
      ring.strokeColor = rgba(196, 154, 86, 240);
      ring.lineWidth = Math.max(1.5, 2.5 * k);
      ring.circle(0, 0, avatar / 2);
      ring.stroke();
      const name = this.host.addChildLabel(card, `DefenderName_${index}`, defender.heroName || defender.heroCode, x, cy(233), 19 * k, BODY_TEXT, new Size(132 * k, 26 * k));
      name.overflow = Label.Overflow.SHRINK;
      const stars = this.host.addChildLabel(card, `DefenderStar_${index}`, starText(defender.star), x, cy(272), 17 * k, rgba(255, 220, 110, 250), new Size(132 * k, 24 * k));
      stars.overflow = Label.Overflow.SHRINK;
    });
    this.drawDivider(card, cy(300), cardW, k);
    const lineupPower = profile?.lineupPower ?? 0;
    const enough = lineupPower >= selected.recommendedPower;
    const power = this.host.addChildLabel(card, 'Power', `推荐战力 ${fmt(selected.recommendedPower)} / 当前 ${fmt(lineupPower)}`, 0, cy(322), 22 * k, enough ? GREEN_TEXT : rgba(255, 170, 120, 250), new Size(cardW * 0.92, 30 * k));
    power.overflow = Label.Overflow.SHRINK;
    this.drawDivider(card, cy(345), cardW, k);
    this.host.addChildLabel(card, 'RewardTitle', '掠夺奖励', cx(30), cy(381), 24 * k, GOLD_TEXT, new Size(cardW * 0.5, 32 * k), HorizontalTextAlignment.LEFT);
    this.renderRewardRow(card, 'Reward', selected.rewardPreview, cy(444), cx(70), 125 * k, 62 * k, k);
    this.drawDivider(card, cy(494), cardW, k);
    if (selected.firstClearRewards.length > 0) {
      this.host.addChildLabel(card, 'FirstTitle', selected.cleared ? '首通(已领)' : '首通', cx(30), cy(526), 24 * k, selected.cleared ? DIM_TEXT : GOLD_TEXT, new Size(cardW * 0.4, 32 * k), HorizontalTextAlignment.LEFT);
      this.renderRewardRow(card, 'First', selected.firstClearRewards, cy(526), cx(160), 125 * k, 50 * k, k);
    }
    const buttonW = 374 * k;
    const buttonH = 72 * k;
    const button = this.host.addChildPlainNode(card, 'LobbyRaidStartButton', 0, cy(607), buttonW, buttonH);
    this.paintButton(button, buttonW, buttonH, k, selected.unlocked ? '掠夺' : '未解锁', 32 * k);
    if (selected.unlocked) {
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidBattle(selected.stageCode), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    } else {
      button.addComponent(UIOpacity).opacity = 120;
    }
    const note = this.host.addChildLabel(card, 'Note', selected.unlocked ? `消耗体力 ${selected.staminaCost}(胜利才扣)` : '先掠夺上一座矿', 0, cy(673), 18 * k, rgba(190, 178, 150, 220), new Size(cardW * 0.9, 26 * k));
    note.overflow = Label.Overflow.SHRINK;
    return left;
  }

  /** 奖励行:图标 + 「×N」,从 firstX 起按 pitch 排。 */
  private renderRewardRow(card: Node, prefix: string, rewards: PlayerBattleRewardItemVO[], y: number, firstX: number, pitch: number, iconSize: number, k: number): void {
    rewards.slice(0, 3).forEach((reward, index) => {
      const x = firstX + index * pitch;
      const asset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      const holder = this.host.addChildPlainNode(card, `${prefix}Icon_${index}`, x, y, iconSize, iconSize);
      if (!asset || !this.host.addSprite('Img', asset, 0, 0, iconSize, iconSize, holder)) {
        const g = holder.addComponent(Graphics);
        g.fillColor = rgba(60, 50, 36, 240);
        g.circle(0, 0, iconSize / 2);
        g.fill();
        this.host.addChildLabel(holder, 'Txt', (reward.resourceName || reward.resourceCode).slice(0, 1), 0, 0, iconSize * 0.45, GOLD_TEXT, new Size(iconSize, iconSize * 0.7));
      }
      const amount = this.host.addChildLabel(card, `${prefix}Amount_${index}`, `×${Math.round(reward.amount)}`, x + iconSize / 2 + 6 * k, y, 22 * k, BODY_TEXT, new Size(pitch - iconSize, 28 * k), HorizontalTextAlignment.LEFT);
      amount.overflow = Label.Overflow.SHRINK;
    });
  }

  // ── 公用 ──

  private drawDivider(card: Node, y: number, cardW: number, k: number): void {
    const line = this.host.addChildPlainNode(card, 'Divider', 0, y, cardW * 0.9, 2);
    const g = line.addComponent(Graphics);
    g.strokeColor = rgba(120, 96, 56, 150);
    g.lineWidth = Math.max(1, 1.2 * k);
    g.moveTo(-cardW * 0.45, 0);
    g.lineTo(cardW * 0.45, 0);
    g.stroke();
  }

  private paintButton(button: Node, w: number, h: number, k: number, text: string, font: number): void {
    if (!this.host.addSprite('Bg', C1812_BUTTON_PRIMARY_ASSET, 0, 0, w, h, button)) {
      const g = button.addComponent(Graphics);
      g.fillColor = rgba(122, 32, 26, 235);
      g.roundRect(-w / 2, -h / 2, w, h, 5 * k);
      g.fill();
    }
    const label = this.host.addChildLabel(button, 'Label', text, 0, 0, font, rgba(255, 240, 205, 255), new Size(w - 10 * k, font * 1.4));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(60, 10, 8, 255);
    label.outlineWidth = Math.max(1, 2 * k);
  }

  private renderRetryButton(parent: Node, scale: number, onClick: () => void): void {
    const w = 180 * scale;
    const h = 46 * scale;
    const button = this.host.addChildPlainNode(parent, 'LobbyRaidRetry', 0, -40 * scale, w, h);
    this.paintButton(button, w, h, scale, '重试', 20 * scale);
    button.on(Node.EventType.TOUCH_END, onClick, this);
    this.host.applyImageButtonFeedback(button, 1.04, 0.96);
  }

  private msUntil(iso: string): number {
    const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T'));
    return Number.isFinite(t) ? t - Date.now() : 0;
  }

  private formatLeft(ms: number): string {
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes >= 60 * 24) {
      return `${Math.floor(minutes / (60 * 24))} 天 ${Math.floor((minutes % (60 * 24)) / 60)} 小时`;
    }
    return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
  }

  private formatAgo(iso: string): string {
    if (!iso) {
      return '';
    }
    const ms = -this.msUntil(iso);
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes < 60) {
      return `${Math.max(1, minutes)} 分钟前`;
    }
    if (minutes < 60 * 24) {
      return `${Math.floor(minutes / 60)} 小时前`;
    }
    return `${Math.floor(minutes / (60 * 24))} 天前`;
  }
}
