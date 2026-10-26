import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { PlayerBattleRewardItemVO } from '../../types/BattleTypes';
import type { RaidPvpCandidateVO, RaidPvpHomeVO, RaidPvpReportVO, RaidStagesVO, RaidStageVO } from '../../types/RaidTypes';
import { C1812_BUTTON_PRIMARY_ASSET } from '../C1812CommonUiAssets';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { mountKitLoading } from '../UiKit';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { mountHeroAvatar } from './HeroHeadCrop';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 矿境面板(docs/48 NPC 矿 + docs/49 真人矿),按两张原型 1:1 还原(2026-10-26 第二版,用户「UI 不行,和原型图的不一样」):
 * - 真人矿 `周报截图/2026-10-26_真人矿/proto/pvp_v1.png`;NPC 矿 `周报截图/2026-10-26_矿境面板/proto/panel_v1.png`(都是 1870×841)。
 * - 坐标全部从原型像素读(`周报截图/2026-10-26_真人矿/grid_*.png` 网格图):位置按 kx = 面板宽/1870、ky = 面板高/841 映射,
 *   尺寸 / 字号按 ks = min(kx, ky) 等比——手机(面板 ≈ 1.96:1,比原型 2.22:1 窄)横向正好 1:1,竖向多出的空间均匀分到行距里。
 * - 素材 `ui/raid/*`(Codex 出图,`tools/qa/raid_install_assets.py` 入库),预载组 'raid';缺图时退程序画。
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
  backdrop: 'ui/raid/raid_backdrop/spriteFrame',
  mineCard: 'ui/raid/pvp_mine_card/spriteFrame',
  mapBg: 'ui/raid/npc_map_bg/spriteFrame',
  nodeOn: 'ui/raid/mine_node_on/spriteFrame',
  nodeOff: 'ui/raid/mine_node_off/spriteFrame',
  zoneThumb: (index: number) => `ui/raid/zone_thumb_${index + 1}/spriteFrame`,
  attack: 'ui/raid/ic_report_attack/spriteFrame',
  defend: 'ui/raid/ic_report_defend/spriteFrame',
  backBanner: 'ui/raid/back_banner/spriteFrame',
  btnPrimary: 'ui/raid/btn_primary/spriteFrame',
  btnSecondary: 'ui/raid/btn_secondary/spriteFrame',
  btnSmall: 'ui/raid/btn_small/spriteFrame',
  btnDisabled: 'ui/raid/btn_disabled/spriteFrame',
};
/** 按钮层级(2026-10-26 用户「按钮全是一样的,应该根据主次做不同的按钮」):主操作 / 次级 / 小按钮 / 不可点。 */
type RaidButtonStyle = 'primary' | 'secondary' | 'small' | 'disabled';
/** 分级按钮素材统一 120 高(tools/qa/raid_install_assets.py)。 */
const RAID_BUTTON_SRC_H = 120;
/** 矿境面板整组素材(UiSpriteFrameCache 预载组 'raid':首开等齐再画)。 */
export const RAID_UI_ASSET_PATHS: readonly string[] = [
  RAID_ART.backdrop,
  RAID_ART.mineCard,
  RAID_ART.mapBg,
  RAID_ART.nodeOn,
  RAID_ART.nodeOff,
  RAID_ART.attack,
  RAID_ART.defend,
  RAID_ART.backBanner,
  RAID_ART.btnPrimary,
  RAID_ART.btnSecondary,
  RAID_ART.btnSmall,
  RAID_ART.btnDisabled,
  ...[0, 1, 2, 3, 4, 5].map((index) => RAID_ART.zoneThumb(index)),
];
const PROTO_W = 1870;
const PROTO_H = 841;
const STAGES_PER_ZONE = 10;
const GOLD_LINE = rgba(176, 134, 70, 235);
const GOLD_DIM = rgba(150, 118, 66, 225);
const GOLD_TEXT = rgba(240, 216, 160, 255);
const BODY_TEXT = rgba(232, 222, 200, 250);
const DIM_TEXT = rgba(160, 150, 130, 235);
const GREEN_TEXT = rgba(120, 220, 140, 250);
const RED_TEXT = rgba(240, 90, 80, 250);
const CARD_FILL = rgba(12, 10, 10, 196);
const LOCK_GREY = rgba(118, 116, 112, 235);

/** 千分位(安卓原生 toLocaleString 不分组)。 */
function fmt(value: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 星级:≤3 画星,再多用「★N」(原型里都是 1~3 星;真人阵容 5~10 星一行放不下)。 */
function starText(star: number): string {
  return star > 3 ? `★${star}` : '★'.repeat(Math.max(1, star));
}

/** 文字宽度估算(中文 1 字宽,其余约 0.56 字宽)。 */
function textWidth(text: string, font: number): number {
  let total = 0;
  for (const ch of text) {
    total += ch.charCodeAt(0) > 255 ? font : font * 0.56;
  }
  return total;
}

/** 原型坐标映射:X / Y = 原型像素 → 面板坐标;S = 等比尺寸;HX / HY = 横 / 竖长度。 */
interface ProtoMap {
  X(px: number): number;
  Y(py: number): number;
  S(v: number): number;
  HX(px: number): number;
  HY(py: number): number;
  ks: number;
}

function protoMap(width: number, height: number): ProtoMap {
  const kx = width / PROTO_W;
  const ky = height / PROTO_H;
  const ks = Math.min(ky, kx * 1.1);
  return {
    X: (px) => -width / 2 + px * kx,
    Y: (py) => height / 2 - py * ky,
    S: (v) => v * ks,
    HX: (px) => px * kx,
    HY: (py) => py * ky,
    ks,
  };
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
    const panel = this.host.addChildBeveledPanelNode(panelGroup, 'LobbyRaidSceneFrame', 0, 0, panelWidth, panelHeight, rgba(6, 6, 8, 240), GOLD_LINE, 18 * scale);
    const m = protoMap(panelWidth, panelHeight);

    // 原型最底层:全屏矿洞(两侧木支架 + 油灯),面板四周透出来
    const backClip = this.host.addChildPlainNode(panel, 'LobbyRaidBackdropClip', 0, 0, panelWidth - 4, panelHeight - 4);
    backClip.addComponent(Mask);
    const backCover = Math.max(panelWidth / 1600, panelHeight / 720);
    this.host.addSprite('Backdrop', RAID_ART.backdrop, 0, 0, 1600 * backCover, 720 * backCover, backClip);

    const profile = this.host.currentLobbyProfile?.();
    if (profile) {
      renderTopCurrencyBar(this.host, panel, panelWidth / 2, panelHeight / 2, scale, [
        { key: 'stamina', icon: STAMINA_ICON_ASSET, value: `${profile.stamina}/${profile.maxStamina}` },
      ]);
    }
    this.renderBackBanner(panel, m);
    this.renderTabs(panel, panelWidth, m, state.tab);
    if (state.tab === 'pvp') {
      this.renderPvp(panel, panelWidth, scale, m, this.host.currentLobbyRaidPvpState());
    } else if (state.loading && !state.stages) {
      mountKitLoading(this.host, panel, 0, 10 * scale, scale, '矿境读取中…');
    } else if (state.error && !state.stages) {
      this.label(panel, 'LobbyRaidError', `读取失败:${state.error}`, 0, 20 * scale, 18 * scale, RED_TEXT, panelWidth * 0.7);
      this.renderRetryButton(panel, scale, () => this.host.reloadLobbyRaidStages());
    } else if (state.stages) {
      const selected = this.resolveSelected(state);
      this.renderNpcColumn(panel, m, state.stages, selected);
      this.renderMineMap(panel, m, state.stages, selected);
      this.renderInfoCard(panel, m, selected, profile);
    }
    const phoneHelp = isPhoneDesign()
      ? '真人矿:挑一个玩家的矿,打倒守卫、砸碎水晶就抢走对方矿库的 10%;输了赔自己矿库的 5%。被打赢自动得 8 小时盾,也可以花钻买盾。\n\nNPC 矿:练手与保底收入,每座胜利扣 6 体力,首通有绑定钻石。'
      : '';
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyRaidBackButton', () => this.host.closeLobbyRaidPanel(), scale, '', '');
    void phoneHelp;
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

  /** 原型左上「< 矿境」返回横幅(原型 x 15..355,y 4..76):点了关面板。 */
  private backBannerRight = 0;

  private renderBackBanner(parent: Node, m: ProtoMap): void {
    const h = m.S(72);
    const w = h * (642 / 140);
    const x = m.X(15) + w / 2;
    const y = m.Y(40);
    this.backBannerRight = x + w / 2;
    const node = this.host.addChildPlainNode(parent, 'LobbyRaidBackBanner', x, y, w, h);
    if (!this.host.addSprite('Art', RAID_ART.backBanner, 0, 0, w, h, node)) {
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(110, 20, 18, 240);
      g.rect(-w / 2, -h / 2, w, h);
      g.fill();
      this.label(node, 'Chevron', '<', -w / 2 + w * 0.15, 0, m.S(40), rgba(250, 236, 200, 255), w * 0.12, HorizontalTextAlignment.CENTER, true);
    }
    const title = this.label(node, 'Title', '矿境', w * 0.06, m.S(1), m.S(36), rgba(250, 232, 190, 255), w * 0.5, HorizontalTextAlignment.CENTER, true);
    title.enableOutline = true;
    title.outlineColor = rgba(40, 6, 4, 255);
    title.outlineWidth = Math.max(1, m.S(2));
    node.on(Node.EventType.TOUCH_END, () => this.host.closeLobbyRaidPanel(), this);
    this.host.applyImageButtonFeedback(node, 1.03, 0.97);
  }

  // ── 页签(原型 pvp_v1:返回横幅右侧「真人矿 | NPC 矿」,选中金色 + 下方金线)──

  private renderTabs(parent: Node, width: number, m: ProtoMap, active: 'pvp' | 'npc'): void {
    // 横幅在页签之前画好,页签紧跟横幅右侧(原型间距 ≈ 40)
    const bannerRight = this.backBannerRight || m.X(355);
    const shift = Math.max(0, bannerRight + m.S(40) - m.X(318));
    void width;
    const tabs: Array<{ key: 'pvp' | 'npc'; label: string; x: number }> = [
      { key: 'pvp', label: '真人矿', x: 383 },
      { key: 'npc', label: 'NPC 矿', x: 555 },
    ];
    for (const tab of tabs) {
      const on = tab.key === active;
      const node = this.host.addChildPlainNode(parent, `LobbyRaidTab_${tab.key}`, m.X(tab.x) + shift, m.Y(42), m.S(150), m.S(64));
      const label = this.host.addChildLabel(node, 'Label', tab.label, 0, m.S(2), m.S(32), on ? GOLD_TEXT : DIM_TEXT, new Size(m.S(150), m.S(44)));
      label.isBold = on;
      if (on) {
        // 原型:中间亮、两端渐隐的金线 + 下方一层淡辉光
        const line = node.addComponent(Graphics);
        const half = m.S(88);
        const seg = 16;
        for (let i = 0; i < seg; i += 1) {
          const t = Math.abs((i + 0.5) / seg - 0.5) * 2;
          const a = Math.round(250 * (1 - t * t));
          const x0 = -half + (2 * half * i) / seg;
          line.fillColor = rgba(240, 196, 104, a);
          line.rect(x0, -m.S(31), (2 * half) / seg + 0.5, Math.max(2, m.S(3)));
          line.fill();
          line.fillColor = rgba(240, 180, 90, Math.round(a * 0.22));
          line.rect(x0, -m.S(36), (2 * half) / seg + 0.5, m.S(5));
          line.fill();
        }
      }
      node.on(Node.EventType.TOUCH_END, () => this.host.selectLobbyRaidTab(tab.key), this);
      this.host.applyImageButtonFeedback(node, 1.03, 0.97);
    }
  }

  /** 原型矩形(左上 x0,y0 → 右下 x1,y1)→ 面板坐标中心与宽高。 */
  private rect(m: ProtoMap, x0: number, y0: number, x1: number, y1: number): { cx: number; cy: number; w: number; h: number } {
    return { cx: (m.X(x0) + m.X(x1)) / 2, cy: (m.Y(y0) + m.Y(y1)) / 2, w: m.HX(x1 - x0), h: m.HY(y1 - y0) };
  }

  private card(parent: Node, name: string, m: ProtoMap, x0: number, y0: number, x1: number, y1: number, fill = CARD_FILL): Node {
    const r = this.rect(m, x0, y0, x1, y1);
    return this.host.addChildBeveledPanelNode(parent, name, r.cx, r.cy, r.w, r.h, fill, GOLD_LINE, m.S(12));
  }

  /** 原型行框:四角斜切、外圈金线、内缩一圈暗金线。 */
  private ornateFrame(g: Graphics, w: number, h: number, cut: number, fill: Color, line: Color, inner: Color, lw: number): void {
    const path = (inset: number): void => {
      const x0 = -w / 2 + inset;
      const x1 = w / 2 - inset;
      const y0 = -h / 2 + inset;
      const y1 = h / 2 - inset;
      const c = Math.max(0, cut - inset * 0.6);
      g.moveTo(x0 + c, y1);
      g.lineTo(x1 - c, y1);
      g.lineTo(x1, y1 - c);
      g.lineTo(x1, y0 + c);
      g.lineTo(x1 - c, y0);
      g.lineTo(x0 + c, y0);
      g.lineTo(x0, y0 + c);
      g.lineTo(x0, y1 - c);
      g.close();
    };
    path(0);
    g.fillColor = fill;
    g.fill();
    path(0);
    g.strokeColor = line;
    g.lineWidth = lw;
    g.stroke();
    path(lw * 2.6);
    g.strokeColor = inner;
    g.lineWidth = Math.max(1, lw * 0.6);
    g.stroke();
  }

  /** 原型分隔线(可带中心菱形)。 */
  private divider(parent: Node, name: string, m: ProtoMap, x0: number, x1: number, y: number, diamond = false): void {
    const node = this.host.addChildPlainNode(parent, name, 0, 0, 2, 2);
    const g = node.addComponent(Graphics);
    g.strokeColor = GOLD_DIM;
    g.lineWidth = Math.max(1.5, m.S(2));
    g.moveTo(m.X(x0), m.Y(y));
    g.lineTo(m.X(x1), m.Y(y));
    g.stroke();
    if (diamond) {
      const cx = (m.X(x0) + m.X(x1)) / 2;
      const cy = m.Y(y);
      const r = m.S(6);
      g.fillColor = rgba(200, 158, 88, 240);
      g.moveTo(cx, cy + r);
      g.lineTo(cx + r * 1.6, cy);
      g.lineTo(cx, cy - r);
      g.lineTo(cx - r * 1.6, cy);
      g.close();
      g.fill();
    }
  }

  private label(parent: Node, name: string, text: string, x: number, y: number, font: number, color: Color, width: number, align = HorizontalTextAlignment.CENTER, bold = false): Label {
    const label = this.host.addChildLabel(parent, name, text, x, y, font, color, new Size(width, font * 1.4), align);
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = bold;
    return label;
  }

  // ════════════════════ 真人矿(原型 pvp_v1)════════════════════

  private renderPvp(parent: Node, width: number, scale: number, m: ProtoMap, state: LobbyRaidPvpState): void {
    if (state.loading && !state.home) {
      mountKitLoading(this.host, parent, 0, 10 * scale, scale, '真人矿读取中…');
      return;
    }
    if (state.error && !state.home) {
      this.label(parent, 'LobbyRaidPvpError', `读取失败:${state.error}`, 0, 20 * scale, m.S(24), RED_TEXT, width * 0.7);
      this.renderRetryButton(parent, scale, () => this.host.reloadLobbyRaidPvp(false));
      return;
    }
    const home = state.home;
    if (!home) {
      return;
    }
    this.renderPvpMine(parent, m, home, state);
    this.renderPvpCandidates(parent, m, home);
    this.renderPvpReports(parent, m, home);
  }

  /** 左「我的矿」(原型 x 25..428,y 97..820):标题 / 分隔线 / 整卡矿晶插画 / 矿库 / 菱形分隔线 / 阵容战力 / 盾 / 买盾钮。 */
  private renderPvpMine(parent: Node, m: ProtoMap, home: RaidPvpHomeVO, state: LobbyRaidPvpState): void {
    this.card(parent, 'LobbyRaidPvpMine', m, 25, 97, 428, 820);
    // 插画铺满标题下方的整块卡面(原型 y 171..818)
    const art = this.rect(m, 28, 171, 425, 818);
    const clip = this.host.addChildPlainNode(parent, 'LobbyRaidPvpMineArt', art.cx, art.cy, art.w, art.h);
    clip.addComponent(Mask);
    // 插画(600×1068)只裁掉顶上 10% 的洞顶:矿晶(插画 15%~50%)整颗露在卡面上半;sh ≥ 1.12h 盖满下沿
    const sh = Math.max(art.h * 1.12, (art.w * 1068) / 600);
    const sw = (sh * 600) / 1068;
    this.host.addSprite('Art', RAID_ART.mineCard, 0, art.h / 2 + sh * 0.1 - sh / 2, sw, sh, clip);
    this.label(parent, 'LobbyRaidPvpMineTitle', '我的矿', m.X(227), m.Y(137), m.S(34), GOLD_TEXT, m.HX(300), HorizontalTextAlignment.CENTER, true);
    this.divider(parent, 'LobbyRaidPvpMineDiv1', m, 60, 395, 170);
    // 「矿库 17,922」:小字「矿库」+ 大号数字,整体居中
    const fontA = m.S(32);
    const fontB = m.S(48);
    const numText = fmt(home.myCrystal);
    const wA = textWidth('矿库', fontA);
    const wB = textWidth(numText, fontB);
    const gap = m.S(16);
    const left = m.X(227) - (wA + gap + wB) / 2;
    const a = this.label(parent, 'LobbyRaidPvpCrystalCap', '矿库', left, m.Y(463), fontA, GOLD_TEXT, wA + m.S(4), HorizontalTextAlignment.LEFT);
    const b = this.label(parent, 'LobbyRaidPvpCrystal', numText, left + wA + gap, m.Y(461), fontB, GOLD_TEXT, wB + m.S(8), HorizontalTextAlignment.LEFT, true);
    for (const lbl of [a, b]) {
      lbl.enableOutline = true;
      lbl.outlineColor = rgba(10, 6, 4, 255);
      lbl.outlineWidth = Math.max(1, m.S(2));
    }
    this.divider(parent, 'LobbyRaidPvpMineDiv2', m, 62, 395, 497, true);
    this.label(parent, 'LobbyRaidPvpPower', `阵容战力  ${fmt(home.lineupPower)}`, m.X(227), m.Y(537), m.S(26), BODY_TEXT, m.HX(360));
    const shieldLeft = home.shieldUntil ? this.msUntil(home.shieldUntil) : 0;
    const protectLeft = home.protectUntil ? this.msUntil(home.protectUntil) : 0;
    const guarded = shieldLeft > 0 || protectLeft > 0;
    const shieldText = shieldLeft > 0 ? `保护盾: 剩余 ${this.formatLeft(shieldLeft)}` : protectLeft > 0 ? `新手保护: 剩余 ${this.formatLeft(protectLeft)}` : '无盾: 矿可能被掠夺';
    this.host.addSprite('LobbyRaidPvpShieldIcon', RAID_ART.defend, m.X(82), m.Y(598), m.S(46), m.S(46), parent);
    this.label(parent, 'LobbyRaidPvpShield', shieldText, m.X(118), m.Y(600), m.S(26), guarded ? GREEN_TEXT : rgba(255, 170, 120, 250), m.HX(300), HorizontalTextAlignment.LEFT);
    const button = this.host.addChildPlainNode(parent, 'LobbyRaidShieldBuy', m.X(227), m.Y(682), m.S(276), m.S(64));
    const canBuy = home.canBuyShield && !state.buying;
    this.paintButton(button, m.S(276), m.S(64), m.ks, state.buying ? '购买中…' : `买 1 天盾 · ${home.shieldPrice} 钻`, m.S(26), canBuy ? 'secondary' : 'disabled');
    if (canBuy) {
      button.on(Node.EventType.TOUCH_END, () => this.host.buyLobbyRaidShield(), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    } else {
      if (!state.buying) {
        this.label(parent, 'LobbyRaidShieldNote', home.shieldNote, m.X(227), m.Y(735), m.S(20), DIM_TEXT, m.HX(360));
      }
    }
  }

  /** 中「可掠夺的矿」(原型框 x 441..1413,y 99..820):标题 + 换一批,5 行(行 x 457..1400,行顶 175 / 300 / 427 / 553 / 679,行高 117)。 */
  private renderPvpCandidates(parent: Node, m: ProtoMap, home: RaidPvpHomeVO): void {
    this.card(parent, 'LobbyRaidPvpList', m, 441, 99, 1413, 820);
    this.label(parent, 'LobbyRaidPvpTitle', '可掠夺的矿', m.X(485), m.Y(137), m.S(32), GOLD_TEXT, m.HX(300), HorizontalTextAlignment.LEFT, true);
    const refresh = this.host.addChildPlainNode(parent, 'LobbyRaidPvpRefresh', m.X(1300), m.Y(137), m.S(190), m.S(56));
    this.paintButton(refresh, m.S(190), m.S(56), m.ks, '换一批', m.S(26), 'secondary');
    refresh.on(Node.EventType.TOUCH_END, () => this.host.reloadLobbyRaidPvp(true), this);
    this.host.applyImageButtonFeedback(refresh, 1.04, 0.96);
    if (home.candidates.length === 0) {
      this.label(parent, 'LobbyRaidPvpEmpty', '暂时没有可掠夺的矿,点「换一批」或稍后再来', m.X(927), m.Y(450), m.S(24), DIM_TEXT, m.HX(860));
      return;
    }
    const tops = [175, 300, 427, 553, 679];
    home.candidates.slice(0, 5).forEach((candidate, index) => this.renderPvpCandidateRow(parent, candidate, m, tops[index]));
  }

  private renderPvpCandidateRow(parent: Node, candidate: RaidPvpCandidateVO, m: ProtoMap, top: number): void {
    const L = 457;
    const R = 1400;
    const mid = top + 58;
    const id = candidate.userId;
    const r = this.rect(m, L, top, R, top + 117);
    const row = this.host.addChildPlainNode(parent, `LobbyRaidPvpRow_${id}`, r.cx, r.cy, r.w, r.h);
    this.ornateFrame(row.addComponent(Graphics), r.w, r.h, m.S(10), rgba(22, 18, 15, 235), rgba(168, 128, 66, 235), rgba(90, 70, 40, 200), Math.max(1.2, m.S(1.8)));
    const blocked = candidate.attackedRecently;
    const text = blocked ? DIM_TEXT : BODY_TEXT;
    // 圆头像(金环):对方阵容第一个英雄
    this.mountRingAvatar(parent, `LobbyRaidPvpAvatar_${id}`, candidate.defenders[0]?.heroCode, candidate.nickname, m.X(L + 58), m.Y(mid), m.S(96), m, blocked);
    this.label(parent, `LobbyRaidPvpName_${id}`, candidate.nickname, m.X(L + 136), m.Y(mid - 19), m.S(28), blocked ? DIM_TEXT : GOLD_TEXT, m.HX(150), HorizontalTextAlignment.LEFT);
    this.label(parent, `LobbyRaidPvpLv_${id}`, `Lv.${candidate.level}`, m.X(L + 136), m.Y(mid + 23), m.S(22), DIM_TEXT, m.HX(150), HorizontalTextAlignment.LEFT);
    this.label(parent, `LobbyRaidPvpPower_${id}`, `阵容战力  ${fmt(candidate.lineupPower)}`, m.X(L + 291), m.Y(mid - 19), m.S(24), text, m.HX(285), HorizontalTextAlignment.LEFT);
    this.label(parent, `LobbyRaidPvpCrystal_${id}`, blocked ? '24 小时内已打过' : `矿库 ${fmt(candidate.crystal)}  ·  可抢 ${fmt(candidate.stealPreview)}`, m.X(L + 291), m.Y(mid + 23), m.S(22), blocked ? RED_TEXT : text, m.HX(285), HorizontalTextAlignment.LEFT);
    // 守卫 ×3(方框金边头像 + 星)
    candidate.defenders.slice(0, 3).forEach((defender, index) => {
      const x = m.X(L + 596 + index * 80);
      const size = m.S(66);
      const box = this.host.addChildPlainNode(parent, `LobbyRaidPvpDef_${id}_${index}`, x, m.Y(mid - 11), size, size);
      const bg = box.addComponent(Graphics);
      bg.fillColor = rgba(30, 26, 24, 255);
      bg.rect(-size / 2, -size / 2, size, size);
      bg.fill();
      if (!mountHeroAvatar(box, defender.heroCode, size - m.S(4), 'square')) {
        this.label(box, 'Txt', (defender.heroName || defender.heroCode).slice(0, 1), 0, 0, size * 0.4, text, size);
      }
      const frame = this.host.addChildPlainNode(box, 'Frame', 0, 0, size, size).addComponent(Graphics);
      frame.strokeColor = rgba(180, 140, 76, 235);
      frame.lineWidth = Math.max(1, m.S(1.6));
      frame.rect(-size / 2, -size / 2, size, size);
      frame.stroke();
      if (blocked) {
        box.addComponent(UIOpacity).opacity = 120;
      }
      this.label(parent, `LobbyRaidPvpDefStar_${id}_${index}`, starText(defender.star), x, m.Y(mid + 38), m.S(20), rgba(250, 210, 90, 250), m.HX(76));
    });
    const button = this.host.addChildPlainNode(parent, `LobbyRaidPvpAttack_${id}`, m.X(L + 874), m.Y(mid), m.S(120), m.S(48));
    this.paintButton(button, m.S(120), m.S(48), m.ks, '掠夺', m.S(26), blocked ? 'disabled' : 'secondary');
    if (!blocked) {
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidPvp(candidate.userId, null), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
  }

  /** 右「战报」(原型 x 1425..1846,y 98..820):标题 / 分隔线 / 行距 108 的战报行,被打的带「复仇」。 */
  private renderPvpReports(parent: Node, m: ProtoMap, home: RaidPvpHomeVO): void {
    this.card(parent, 'LobbyRaidPvpReports', m, 1425, 98, 1846, 820);
    this.label(parent, 'LobbyRaidPvpReportsTitle', '战报', m.X(1636), m.Y(132), m.S(36), GOLD_TEXT, m.HX(300), HorizontalTextAlignment.CENTER, true);
    this.divider(parent, 'LobbyRaidPvpReportsDiv', m, 1450, 1822, 169);
    if (home.reports.length === 0) {
      this.label(parent, 'LobbyRaidPvpReportsEmpty', '还没有战报,去掠夺一座矿吧', m.X(1636), m.Y(240), m.S(22), DIM_TEXT, m.HX(360));
      return;
    }
    const reports = home.reports.slice(0, 6);
    reports.forEach((report, index) => this.renderPvpReportRow(parent, report, m, 225 + index * 108, true));
  }

  private renderPvpReportRow(parent: Node, report: RaidPvpReportVO, m: ProtoMap, cy: number, separator: boolean): void {
    const attack = report.role === 'ATTACK';
    const won = report.result === 'WIN';
    const id = report.id;
    if (!this.host.addSprite(`LobbyRaidPvpReportIcon_${id}`, attack ? RAID_ART.attack : RAID_ART.defend, m.X(1466), m.Y(cy), m.S(44), m.S(44), parent)) {
      this.label(parent, `LobbyRaidPvpReportTag_${id}`, attack ? '攻' : '守', m.X(1466), m.Y(cy), m.S(24), GOLD_TEXT, m.S(44));
    }
    const head = attack ? `掠夺  ${report.opponentName}` : `被  ${report.opponentName}  掠夺`;
    const timeRight = report.canRevenge ? 1722 : 1822;
    this.label(parent, `LobbyRaidPvpReportHead_${id}`, head, m.X(1496), m.Y(cy - 19), m.S(24), BODY_TEXT, m.HX(timeRight - 1496), HorizontalTextAlignment.LEFT);
    const delta = report.crystalDelta;
    this.label(parent, `LobbyRaidPvpReportBody_${id}`, `${won ? '胜' : '败'}  ${delta >= 0 ? '+' : ''}${fmt(delta)} 矿晶`, m.X(1496), m.Y(cy + 22), m.S(24), won ? GREEN_TEXT : RED_TEXT, m.HX(200), HorizontalTextAlignment.LEFT);
    this.label(parent, `LobbyRaidPvpReportAgo_${id}`, this.formatAgo(report.createdAt), m.X(timeRight), m.Y(cy + 22), m.S(21), DIM_TEXT, m.HX(120), HorizontalTextAlignment.RIGHT);
    if (report.canRevenge) {
      const button = this.host.addChildPlainNode(parent, `LobbyRaidPvpRevenge_${id}`, m.X(1788), m.Y(cy), m.S(96), m.S(50));
      this.paintButton(button, m.S(96), m.S(50), m.ks, '复仇', m.S(24), 'small');
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidPvp(report.opponentUserId, report.id), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    if (separator) {
      this.divider(parent, `LobbyRaidPvpReportSep_${id}`, m, 1450, 1822, cy + 54);
    }
  }

  // ════════════════════ NPC 矿(原型 panel_v1)════════════════════

  /** 左列(原型 x 0..387):暗底 + 竖金线;矿区按钮 x 22..367、高 92、行顶 98 + 114i,名字 / 右半缩略图 / 锁 / 四角金饰。 */
  private renderNpcColumn(parent: Node, m: ProtoMap, data: RaidStagesVO, selected: RaidStageVO | null): void {
    const colR = this.rect(m, 0, 62, 387, 841);
    const col = this.host.addChildPlainNode(parent, 'LobbyRaidZoneColumn', colR.cx, colR.cy, colR.w, colR.h);
    const cg = col.addComponent(Graphics);
    cg.fillColor = rgba(8, 7, 7, 170);
    cg.rect(-colR.w / 2, -colR.h / 2, colR.w, colR.h);
    cg.fill();
    cg.strokeColor = GOLD_DIM;
    cg.lineWidth = Math.max(1, m.S(1.5));
    cg.moveTo(colR.w / 2, colR.h / 2);
    cg.lineTo(colR.w / 2, -colR.h / 2);
    cg.stroke();
    this.zonesOf(data).forEach((zone, index) => {
      const top = 98 + index * 114;
      const r = this.rect(m, 22, top, 367, top + 92);
      const active = !!selected && selected.zoneName === zone.name;
      const unlocked = zone.stages.some((stage) => stage.unlocked);
      const node = this.host.addChildPlainNode(parent, `LobbyRaidZone_${index}`, r.cx, r.cy, r.w, r.h);
      const g = node.addComponent(Graphics);
      g.fillColor = unlocked ? rgba(26, 23, 22, 245) : rgba(22, 22, 22, 240);
      g.rect(-r.w / 2, -r.h / 2, r.w, r.h);
      g.fill();
      // 右半缩略图(原型 x ≈ 200..365)+ 左缘渐隐
      const thumbW = m.HX(170);
      const thumbClip = this.host.addChildPlainNode(node, 'ThumbClip', r.w / 2 - thumbW / 2 - m.S(3), 0, thumbW, r.h - m.S(6));
      thumbClip.addComponent(Mask);
      const thumb = this.host.addSprite('Thumb', RAID_ART.zoneThumb(index), 0, 0, thumbW, thumbW, thumbClip);
      if (thumb) {
        thumb.grayscale = !unlocked;
        thumbClip.addComponent(UIOpacity).opacity = active ? 255 : unlocked ? 200 : 150;
        const fade = this.host.addChildPlainNode(thumbClip, 'Fade', 0, 0, thumbW, r.h).addComponent(Graphics);
        for (let i = 0; i < 8; i += 1) {
          fade.fillColor = rgba(24, 22, 22, Math.round(245 * (1 - i / 8)));
          fade.rect(-thumbW / 2 + (thumbW * 0.6 / 8) * i, -r.h / 2, thumbW * 0.6 / 8 + 1, r.h);
          fade.fill();
        }
      }
      // 原型:整圈斜切角双线框;选中亮金加粗,未解锁整行灰
      const border = this.host.addChildPlainNode(node, 'Border', 0, 0, r.w, r.h).addComponent(Graphics);
      this.ornateFrame(border, r.w, r.h, m.S(9), rgba(0, 0, 0, 0),
        active ? rgba(246, 206, 120, 255) : unlocked ? rgba(176, 140, 80, 235) : rgba(120, 118, 112, 235),
        active ? rgba(150, 110, 50, 230) : unlocked ? rgba(96, 76, 46, 210) : rgba(70, 70, 68, 210),
        Math.max(1.5, m.S(active ? 3 : 2)));
      const name = this.host.addChildLabel(node, 'Name', zone.name, -r.w / 2 + m.HX(33), 0, m.S(34), active ? rgba(250, 236, 200, 255) : unlocked ? BODY_TEXT : LOCK_GREY, new Size(m.HX(200), m.S(46)), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      name.isBold = active;
      name.enableOutline = true;
      name.outlineColor = rgba(10, 6, 4, 255);
      name.outlineWidth = Math.max(1, m.S(2));
      if (!unlocked) {
        const lock = this.host.addSprite('Lock', LOCK_ICON_ASSET, m.X(328) - r.cx, 0, m.S(38), m.S(38), node);
        if (lock) {
          lock.grayscale = true;
          lock.color = rgba(190, 190, 190, 255);
        }
      }
      node.on(Node.EventType.TOUCH_END, () => {
        const target = zone.stages.find((stage) => stage.unlocked && !stage.cleared) ?? zone.stages.find((stage) => stage.unlocked) ?? zone.stages[0];
        if (target) {
          this.host.selectLobbyRaidStage(target.stageCode);
        }
      }, this);
      this.host.applyImageButtonFeedback(node, 1.02, 0.98);
    });
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

  /** 中间矿洞地图(原型 x 387..1405,y 62..841):矿口中心 x 534 / 715 / 900 / 1090 / 1275、y 288 / 563,直径 128(选中 145 + 光环)。 */
  private renderMineMap(parent: Node, m: ProtoMap, data: RaidStagesVO, selected: RaidStageVO | null): void {
    if (!selected) {
      return;
    }
    const zone = this.zonesOf(data).find((entry) => entry.name === selected.zoneName);
    if (!zone) {
      return;
    }
    const area = this.rect(m, 388, 62, 1405, 838);
    const clip = this.host.addChildPlainNode(parent, 'LobbyRaidMapClip', area.cx, area.cy, area.w, area.h);
    clip.addComponent(Mask);
    const cover = Math.max(area.w / 1200, area.h / 675);
    this.host.addSprite('MapBg', RAID_ART.mapBg, 0, 0, 1200 * cover, 675 * cover, clip);
    const xs = [534, 715, 900, 1090, 1275];
    const ys = [288, 563];
    zone.stages.forEach((stage, index) => {
      const cx = m.X(xs[index % 5]);
      const cy = m.Y(ys[Math.floor(index / 5)] ?? ys[1]);
      const current = selected.stageCode === stage.stageCode;
      const size = m.S(current ? 145 : 128);
      const node = this.host.addChildPlainNode(parent, `LobbyRaidMine_${stage.orderNo}`, cx, cy, size, size);
      if (current) {
        const glow = this.host.addChildPlainNode(node, 'Glow', 0, 0, size * 1.3, size * 1.3).addComponent(Graphics);
        for (let i = 0; i < 5; i += 1) {
          glow.strokeColor = rgba(255, 210, 120, 60 - i * 11);
          glow.lineWidth = m.S(4);
          glow.circle(0, 0, size / 2 + m.S(2 + i * 4));
          glow.stroke();
        }
      }
      const art = this.host.addSprite('Art', stage.unlocked ? RAID_ART.nodeOn : RAID_ART.nodeOff, 0, 0, size, size, node);
      if (!art) {
        const g = node.addComponent(Graphics);
        g.fillColor = stage.unlocked ? rgba(36, 28, 20, 240) : rgba(16, 15, 15, 230);
        g.circle(0, 0, size / 2);
        g.fill();
      }
      if (current) {
        const ring = this.host.addChildPlainNode(node, 'Ring', 0, 0, size, size).addComponent(Graphics);
        ring.strokeColor = rgba(255, 226, 150, 255);
        ring.lineWidth = Math.max(2, m.S(4));
        ring.circle(0, 0, size / 2 - m.S(2));
        ring.stroke();
      }
      const badgeY = -m.S(47);
      const badgeR = m.S(23);
      if (stage.cleared) {
        const badge = this.host.addChildPlainNode(node, 'Cleared', 0, badgeY, badgeR * 2, badgeR * 2);
        const bg = badge.addComponent(Graphics);
        bg.fillColor = rgba(30, 70, 40, 255);
        bg.circle(0, 0, badgeR);
        bg.fill();
        bg.fillColor = rgba(80, 190, 100, 255);
        bg.circle(0, 0, badgeR * 0.82);
        bg.fill();
        bg.strokeColor = rgba(240, 255, 240, 255);
        bg.lineWidth = Math.max(2, m.S(4));
        bg.moveTo(-badgeR * 0.42, 0);
        bg.lineTo(-badgeR * 0.1, -badgeR * 0.32);
        bg.lineTo(badgeR * 0.45, badgeR * 0.3);
        bg.stroke();
      } else if (!stage.unlocked) {
        const holder = this.host.addChildPlainNode(node, 'LockBg', 0, badgeY, badgeR * 2, badgeR * 2);
        const lg = holder.addComponent(Graphics);
        lg.fillColor = rgba(14, 14, 16, 235);
        lg.circle(0, 0, badgeR);
        lg.fill();
        lg.strokeColor = rgba(120, 118, 112, 220);
        lg.lineWidth = Math.max(1, m.S(1.5));
        lg.circle(0, 0, badgeR);
        lg.stroke();
        // 原型:暗圆底 + 银白锁
        const lock = this.host.addSprite('Lock', LOCK_ICON_ASSET, 0, 0, badgeR * 1.2, badgeR * 1.2, holder);
        if (lock) {
          lock.grayscale = true;
          lock.color = rgba(235, 235, 235, 255);
        }
      }
      const name = this.host.addChildLabel(parent, `LobbyRaidMineName_${stage.orderNo}`, `${(stage.orderNo - 1) % STAGES_PER_ZONE + 1}号矿`, cx, cy - m.S(92), m.S(26), stage.unlocked || current ? rgba(246, 238, 220, 255) : rgba(210, 204, 192, 240), new Size(m.S(170), m.S(36)));
      name.overflow = Label.Overflow.SHRINK;
      name.isBold = true;
      name.enableOutline = true;
      name.outlineColor = rgba(8, 6, 4, 255);
      name.outlineWidth = Math.max(1, m.S(2));
      node.on(Node.EventType.TOUCH_END, () => this.host.selectLobbyRaidStage(stage.stageCode), this);
      this.host.applyImageButtonFeedback(node, 1.05, 0.95);
    });
  }

  /** 右信息卡(原型 x 1412..1856,y 87..800)。 */
  private renderInfoCard(parent: Node, m: ProtoMap, selected: RaidStageVO | null, profile: PlayerLobbyProfileVO | undefined): void {
    if (!selected) {
      return;
    }
    this.card(parent, 'LobbyRaidInfoCard', m, 1412, 87, 1856, 800);
    const cx = 1634;
    this.label(parent, 'LobbyRaidInfoTitle', selected.stageName.replace(' 号矿', '号矿'), m.X(cx), m.Y(125), m.S(32), GOLD_TEXT, m.HX(400), HorizontalTextAlignment.CENTER, true);
    this.divider(parent, 'LobbyRaidInfoDiv1', m, 1440, 1828, 158);
    const xs = [1505, 1645, 1785];
    selected.defenders.slice(0, 3).forEach((defender, index) => {
      const x = xs[index] ?? 1645;
      this.mountRingAvatar(parent, `LobbyRaidInfoDef_${index}`, defender.heroCode, defender.heroName, m.X(x), m.Y(235), m.S(122), m, false);
      this.label(parent, `LobbyRaidInfoDefName_${index}`, defender.heroName || defender.heroCode, m.X(x), m.Y(322), m.S(23), rgba(236, 228, 210, 255), m.HX(136));
      this.label(parent, `LobbyRaidInfoDefStar_${index}`, starText(defender.star), m.X(x), m.Y(352), m.S(24), rgba(250, 210, 90, 250), m.HX(136));
    });
    this.divider(parent, 'LobbyRaidInfoDiv2', m, 1440, 1828, 377);
    const lineupPower = profile?.lineupPower ?? 0;
    const enough = lineupPower >= selected.recommendedPower;
    this.label(parent, 'LobbyRaidInfoPower', `推荐战力 ${selected.recommendedPower} / 当前 ${lineupPower}`, m.X(cx), m.Y(408), m.S(25), enough ? GREEN_TEXT : rgba(255, 170, 120, 250), m.HX(400));
    this.divider(parent, 'LobbyRaidInfoDiv3', m, 1440, 1828, 437);
    this.label(parent, 'LobbyRaidInfoRewardTitle', '掠夺奖励', m.X(1455), m.Y(470), m.S(27), rgba(226, 204, 160, 255), m.HX(200), HorizontalTextAlignment.LEFT);
    this.renderRewardRow(parent, 'LobbyRaidInfoReward', selected.rewardPreview, m, 530, [1500, 1680], 62);
    this.divider(parent, 'LobbyRaidInfoDiv4', m, 1440, 1828, 575);
    if (selected.firstClearRewards.length > 0) {
      this.label(parent, 'LobbyRaidInfoFirstTitle', selected.cleared ? '首通(已领)' : '首通', m.X(1455), m.Y(612), m.S(27), selected.cleared ? DIM_TEXT : rgba(226, 204, 160, 255), m.HX(150), HorizontalTextAlignment.LEFT);
      this.renderRewardRow(parent, 'LobbyRaidInfoFirst', selected.firstClearRewards, m, 612, [1580], 50);
    }
    const button = this.host.addChildPlainNode(parent, 'LobbyRaidStartButton', m.X(1645), m.Y(690), m.S(392), m.S(72));
    this.paintButton(button, m.S(392), m.S(72), m.ks, selected.unlocked ? '掠夺' : '未解锁', m.S(40), selected.unlocked ? 'primary' : 'disabled');
    if (selected.unlocked) {
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidBattle(selected.stageCode), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    this.label(parent, 'LobbyRaidInfoNote', selected.unlocked ? `消耗体力 ${selected.staminaCost}(胜利才扣)` : '先掠夺上一座矿', m.X(1645), m.Y(757), m.S(23), BODY_TEXT, m.HX(400));
  }

  /** 奖励行:图标中心在 xs[i],「×N」紧跟图标右侧。 */
  private renderRewardRow(parent: Node, prefix: string, rewards: PlayerBattleRewardItemVO[], m: ProtoMap, y: number, xs: number[], icon: number): void {
    rewards.slice(0, xs.length).forEach((reward, index) => {
      const x = m.X(xs[index]);
      const size = m.S(icon);
      const asset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      if (!asset || !this.host.addSprite(`${prefix}Icon_${index}`, asset, x, m.Y(y), size, size, parent)) {
        this.label(parent, `${prefix}Txt_${index}`, (reward.resourceName || reward.resourceCode).slice(0, 1), x, m.Y(y), size * 0.5, GOLD_TEXT, size);
      }
      this.label(parent, `${prefix}Amount_${index}`, `×${Math.round(reward.amount)}`, x + size / 2 + m.S(12), m.Y(y), m.S(27), BODY_TEXT, m.HX(110), HorizontalTextAlignment.LEFT);
    });
  }

  // ── 公用 ──

  /** 圆形金环头像(原型:暗底圆 + 头像 + 金环)。 */
  private mountRingAvatar(parent: Node, name: string, heroCode: string | undefined, fallbackText: string, x: number, y: number, size: number, m: ProtoMap, dimmed: boolean): void {
    const holder = this.host.addChildPlainNode(parent, name, x, y, size, size);
    const bg = holder.addComponent(Graphics);
    bg.fillColor = rgba(28, 24, 22, 255);
    bg.circle(0, 0, size / 2);
    bg.fill();
    if (!mountHeroAvatar(holder, heroCode, size - m.S(6), 'circle')) {
      this.label(holder, 'Initial', (fallbackText || '?').slice(0, 1), 0, 0, size * 0.4, BODY_TEXT, size, HorizontalTextAlignment.CENTER, true);
    }
    const ring = this.host.addChildPlainNode(holder, 'Ring', 0, 0, size, size).addComponent(Graphics);
    ring.strokeColor = rgba(196, 154, 86, 245);
    ring.lineWidth = Math.max(1.5, m.S(3));
    ring.circle(0, 0, size / 2 - m.S(1.5));
    ring.stroke();
    if (dimmed) {
      holder.addComponent(UIOpacity).opacity = 120;
    }
  }

  private paintButton(button: Node, w: number, h: number, k: number, text: string, font: number, style: RaidButtonStyle): void {
    const asset = style === 'primary' ? RAID_ART.btnPrimary : style === 'small' ? RAID_ART.btnSmall : style === 'disabled' ? RAID_ART.btnDisabled : RAID_ART.btnSecondary;
    // 两端带雕花:九宫格拉伸(边距写在素材 meta 里),按钮宽高比和素材不同也不变形
    // 九宫格边距按素材像素画(不随节点缩放):先按素材 120 高排版再整体缩到按钮高,雕花 / 金边随按钮等比
    const tiered = this.host.addSprite('Bg', asset, 0, 0, w, h, button);
    const bg = tiered ?? this.host.addSprite('Bg', C1812_BUTTON_PRIMARY_ASSET, 0, 0, w, h, button);
    if (tiered) {
      const f = RAID_BUTTON_SRC_H / h;
      tiered.type = Sprite.Type.SLICED;
      tiered.sizeMode = Sprite.SizeMode.CUSTOM;
      tiered.node.getComponent(UITransform)?.setContentSize(w * f, RAID_BUTTON_SRC_H);
      tiered.node.setScale(1 / f, 1 / f, 1);
    } else if (!bg) {
      const g = button.addComponent(Graphics);
      g.fillColor = style === 'disabled' ? rgba(60, 60, 60, 235) : rgba(122, 32, 26, 235);
      g.roundRect(-w / 2, -h / 2, w, h, 5 * k);
      g.fill();
    }
    const textColor = style === 'disabled' ? rgba(176, 172, 164, 255) : style === 'primary' ? rgba(255, 238, 196, 255) : rgba(255, 242, 214, 255);
    const label = this.host.addChildLabel(button, 'Label', text, 0, style === 'primary' ? k * 1 : 0, font, textColor, new Size(w * (style === 'primary' ? 0.7 : 0.78), font * 1.4));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = style === 'disabled' ? rgba(20, 20, 20, 255) : rgba(60, 10, 8, 255);
    label.outlineWidth = Math.max(1, 2 * k);
  }

  private renderRetryButton(parent: Node, scale: number, onClick: () => void): void {
    const w = 180 * scale;
    const h = 46 * scale;
    const button = this.host.addChildPlainNode(parent, 'LobbyRaidRetry', 0, -40 * scale, w, h);
    this.paintButton(button, w, h, scale, '重试', 20 * scale, 'secondary');
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
