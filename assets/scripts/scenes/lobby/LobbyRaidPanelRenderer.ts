import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { PlayerBattleRewardItemVO } from '../../types/BattleTypes';
import type { RaidDefenderPreviewVO, RaidPvpCandidateVO, RaidPvpHomeVO, RaidPvpReportVO, RaidStagesVO, RaidStageVO } from '../../types/RaidTypes';
import { C1812_BUTTON_PRIMARY_ASSET } from '../C1812CommonUiAssets';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { mountKitLoading, type UiKitHost } from '../UiKit';
import {
  glassLabel, glassProtoMap, GLASS_COLOR, mountGlassButton, mountGlassFrame, mountGlassLine, mountGlassPanel,
  mountGlassSectionHeader, mountGlassTagPill, mountGlassTopBar,
} from '../UiGlassKit';
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
  /** 顶栏体力「+」→ 体力补充(宿主是 GameRoot 时有)。 */
  openLobbyShopDialog?(kind: 'skin' | 'gold' | 'stamina' | 'diamond' | 'rune'): void;
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
  // 信息卡奖励 / 详情卡常用图标:进面板就有图
  'ui/bag/ai/icon_gold/spriteFrame',
  'ui/bag/ai/icon_sacred_crystal/spriteFrame',
  'ui/bag/ai/icon_bound_diamond/spriteFrame',
  ...[0, 1, 2, 3, 4, 5].map((index) => RAID_ART.zoneThumb(index)),
  // docs/61 真人矿 B 风格(原型 pvp_b_v4):整屏背景(原型去 UI 扩成 3:2,轻虚化)+ 主角立绘 4 张 + 玻璃件 / 线稿图标(路径写死,不引用 UiGlassKit 常量,免得预载表初始化顺序成环)
  'ui/raid/pvp_bg_v4/spriteFrame',
  'ui/protagonist/b/protag_m_base/spriteFrame',
  'ui/protagonist/b/protag_f_base/spriteFrame',
  'ui/realm/protag_m_lianhun/spriteFrame',
  'ui/realm/protag_f_lianhun/spriteFrame',
  ...['panel', 'frame', 'chip', 'tag_pill', 'pill_primary', 'pill_secondary', 'pill_gold', 'accent_bar', 'divider', 'icon_back', 'icon_close', 'icon_plus',
    'profile_swords', 'battle_shield', 'battle_pickaxe', 'notice_paper'].map((name) => `ui/glass/${name}/spriteFrame`),
];

/** 真人矿 B 风格(docs/61,原型 周报截图/2026-11-05_掠夺主角带队/proto/pvp_b_v4.png):主角立绘(炼魂起换装版)+ 头部中心(图宽占比,PIL 量头顶行 alpha 中点)。 */
const PROTAG_ART: Record<'male' | 'female', Record<'base' | 'lianhun', { path: string; headX: number }>> = {
  male: { base: { path: 'ui/protagonist/b/protag_m_base/spriteFrame', headX: 0.46 }, lianhun: { path: 'ui/realm/protag_m_lianhun/spriteFrame', headX: 0.478 } },
  female: { base: { path: 'ui/protagonist/b/protag_f_base/spriteFrame', headX: 0.485 }, lianhun: { path: 'ui/realm/protag_f_lianhun/spriteFrame', headX: 0.51 } },
};
const GLASS_ICON_PATH = (name: string): string => `ui/glass/${name}/spriteFrame`;
const CRYSTAL_ICON_ASSET = 'ui/bag/ai/icon_sacred_crystal/spriteFrame';
const PVP_BG_ASSET = 'ui/raid/pvp_bg_v4/spriteFrame';
const STAR_COLOR = new Color(236, 196, 96, 255);
const WARN_COLOR = new Color(244, 168, 104, 255);
type GlassT = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label;
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
    if (state.tab === 'pvp') {
      // docs/61:真人矿 B 风格整页(NPC 矿第 3 屏原型确认前仍走旧版)
      this.renderPvpGlass(layout);
      return;
    }
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
    if (state.loading && !state.stages) {
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

  // ════════════════════ 真人矿 B 风格(docs/61,原型 pvp_b_v4)════════════════════
  //
  // 坐标按原型 1870×841(glassProtoMap:FX / FY 以舞台中心为原点,S 等比);顶栏贴左右缘(LX / RX)。
  // 顶栏 y 40:‹ 矿境 + 真人矿(暗金胶囊)/ NPC 矿 + 体力 + ✕;我的矿横条 57..1813 × 80..162;
  // 「可掠夺的矿」标题 + 换一批 @ y 193;对手竖卡 3 张 57..1337 × 223..817(卡宽 415 间距 17.5);右栏战报 1357..1813 × 223..817。

  private renderPvpGlass(layout: UiLayout): void {
    const raid = this.host.currentLobbyRaidState();
    const state = this.host.currentLobbyRaidPvpState();
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelW = layout.stageWidth;
    const panelH = layout.stageHeight;
    const { k, LX, FX, FY, S } = glassProtoMap(panelW, panelH);
    const kit = this.host as unknown as UiKitHost;
    const T: GlassT = (parent, name, text, x, y, size, color, w, align = HorizontalTextAlignment.LEFT, bold = false) => {
      const label = glassLabel(kit, parent, name, text, x, y, S(size), color, w, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };

    const dim = this.host.createUiNode('LobbyRaidDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    dim.addComponent(BlockInputEvents);
    const group = this.host.createUiNode('LobbyRaidSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelW, panelH));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(group, 'LobbyRaidSceneFrame', 0, 0, panelW, panelH);
    // 背景 = 原型背景本身(pvp_b_v4 去掉全部 UI、扩成 3:2 1536×1024、轻虚化;亮度已按原型露出处校过,不再叠压暗层),铺满整屏含挖孔区
    const coverW = layout.width + Math.abs(centerX) * 2;
    const coverH = layout.height + Math.abs(centerY) * 2;
    const bgScale = Math.max(coverW / 1536, coverH / 1024);
    this.host.addSprite('LobbyRaidGlassBg', PVP_BG_ASSET, 0, 0, 1536 * bgScale, 1024 * bgScale, panel);

    const profile = this.host.currentLobbyProfile?.();
    const close = (): void => this.host.closeLobbyRaidPanel();
    mountGlassTopBar(kit, panel, 'LobbyRaid', panelW, panelH, '矿境',
      profile ? [{ key: 'stamina', icon: STAMINA_ICON_ASSET, value: `${profile.stamina}/${profile.maxStamina}`, width: 216,
        onPlus: this.host.openLobbyShopDialog ? () => this.host.openLobbyShopDialog?.('stamina') : undefined }] : [],
      close, close, { chipRight: 1700, y: 40 });
    // 页签:选中 = 暗金胶囊 + 白字(全局选中口径);未选 = 灰字
    const tabs: Array<{ key: 'pvp' | 'npc'; label: string; x: number }> = [{ key: 'pvp', label: '真人矿', x: 400 }, { key: 'npc', label: 'NPC 矿', x: 588 }];
    for (const tab of tabs) {
      const on = tab.key === raid.tab;
      if (on) {
        mountGlassButton(kit, panel, `LobbyRaidTab_${tab.key}`, tab.label, LX(tab.x), FY(40), S(170), S(50), k, 'selected', undefined, 26);
        continue;
      }
      const node = this.host.addChildPlainNode(panel, `LobbyRaidTab_${tab.key}`, LX(tab.x), FY(40), S(170), S(56));
      T(node, 'Label', tab.label, 0, 0, 26, GLASS_COLOR.sub, S(160), HorizontalTextAlignment.CENTER);
      node.on(Node.EventType.TOUCH_END, () => this.host.selectLobbyRaidTab(tab.key), this);
      this.host.applyImageButtonFeedback(node, 1.04, 0.96);
    }

    if (state.loading && !state.home) {
      T(panel, 'LobbyRaidPvpLoading', '真人矿读取中…', FX(935), FY(450), 24, GLASS_COLOR.sub, S(600), HorizontalTextAlignment.CENTER);
      return;
    }
    if (!state.home) {
      if (state.error) {
        T(panel, 'LobbyRaidPvpError', `读取失败:${state.error}`, FX(935), FY(430), 24, GLASS_COLOR.red, S(900), HorizontalTextAlignment.CENTER);
        mountGlassButton(kit, panel, 'LobbyRaidRetry', '重试', FX(935), FY(500), S(180), S(52), k, 'secondary', () => this.host.reloadLobbyRaidPvp(false), 22);
      }
      return;
    }
    const home = state.home;
    this.renderPvpMineStrip(panel, home, state, FX, FY, S, k, T);
    this.renderPvpCards(panel, home, FX, FY, S, k, T);
    this.renderPvpReportColumn(panel, home, FX, FY, S, k, T);
  }

  /** 我的矿横条(原型 57..1813 × 80..162,行心 121):镐 + 我的矿 | 矿晶 矿库 N | 阵容战力 N + 4 头像 | 盾状态 + 买盾。 */
  private renderPvpMineStrip(panel: Node, home: RaidPvpHomeVO, state: LobbyRaidPvpState,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    const y = FY(121);
    mountGlassPanel(kit, panel, 'LobbyRaidPvpMine', FX(935), y, S(1756), S(82), k);
    this.host.addSprite('LobbyRaidPvpMineIcon', GLASS_ICON_PATH('battle_pickaxe'), FX(103), y, S(36), S(36), panel);
    T(panel, 'LobbyRaidPvpMineTitle', '我的矿', FX(136), y, 28, GLASS_COLOR.text, S(140), HorizontalTextAlignment.LEFT, true);
    const sep = (name: string, x: number): void => {
      mountGlassLine(kit, panel, name, FX(x), y, Math.max(1, S(1.5)), S(40), new Color(255, 255, 255, 40));
    };
    sep('LobbyRaidPvpMineSep1', 292);
    this.host.addSprite('LobbyRaidPvpCrystalIcon', CRYSTAL_ICON_ASSET, FX(342), y, S(46), S(46), panel);
    T(panel, 'LobbyRaidPvpCrystalCap', '矿库', FX(376), y, 22, GLASS_COLOR.sub, S(60));
    T(panel, 'LobbyRaidPvpCrystal', fmt(home.myCrystal), FX(434), y, 36, GLASS_COLOR.text, S(130), HorizontalTextAlignment.LEFT, true);
    sep('LobbyRaidPvpMineSep2', 584);
    T(panel, 'LobbyRaidPvpPowerCap', '阵容战力', FX(618), y, 22, GLASS_COLOR.sub, S(100));
    T(panel, 'LobbyRaidPvpPower', fmt(home.lineupPower), FX(718), y, 26, GLASS_COLOR.text, S(120), HorizontalTextAlignment.LEFT, true);
    // 我的防守阵:主角在前 + 编队 3 人
    home.myTeam.slice(0, 4).forEach((hero, index) => {
      this.mountGlassHero(panel, `LobbyRaidPvpMyHero_${index}`, hero, FX(884 + index * 76), y, S(62), k);
    });
    const shieldLeft = home.shieldUntil ? this.msUntil(home.shieldUntil) : 0;
    const protectLeft = home.protectUntil ? this.msUntil(home.protectUntil) : 0;
    const guarded = shieldLeft > 0 || protectLeft > 0;
    const shieldText = shieldLeft > 0 ? `保护盾 · 剩余 ${this.formatLeft(shieldLeft)}` : protectLeft > 0 ? `新手保护 · 剩余 ${this.formatLeft(protectLeft)}` : '无盾:矿可能被掠夺';
    const shield = this.host.addSprite('LobbyRaidPvpShieldIcon', GLASS_ICON_PATH('battle_shield'), FX(1206), y, S(32), S(32), panel);
    if (shield) {
      shield.color = guarded ? GLASS_COLOR.green : WARN_COLOR;
    }
    T(panel, 'LobbyRaidPvpShield', shieldText, FX(1234), y, 22, guarded ? GLASS_COLOR.green : WARN_COLOR, S(290));
    const canBuy = home.canBuyShield && !state.buying;
    const buyText = state.buying ? '购买中…' : canBuy ? `买 1 天盾 · ${home.shieldPrice} 钻` : (home.shieldNote || '暂不可买');
    mountGlassButton(kit, panel, 'LobbyRaidShieldBuy', buyText, FX(1665), y, S(266), S(50), k, canBuy ? 'secondary' : 'disabled',
      canBuy ? () => this.host.buyLobbyRaidShield() : undefined, 22);
  }

  /** 对手竖卡(原型 v4):卡 57..1337 × 223..817,宽 415 间距 17.5;上半主角立绘(底部渐隐)+ 名字 + Lv·境界 + 3 英雄 + 星 + 战力 + 可抢 + 掠夺。 */
  private renderPvpCards(panel: Node, home: RaidPvpHomeVO,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassSectionHeader(kit, panel, 'LobbyRaidPvpListHead', '可掠夺的矿', FX(60), FY(193), k, 26);
    mountGlassButton(kit, panel, 'LobbyRaidPvpRefresh', '换一批', FX(1259), FY(193), S(156), S(44), k, 'secondary', () => this.host.reloadLobbyRaidPvp(true), 21);
    if (home.candidates.length === 0) {
      mountGlassPanel(kit, panel, 'LobbyRaidPvpEmpty', FX(697), FY(520), S(1280), S(594), k);
      T(panel, 'LobbyRaidPvpEmptyTitle', '附近暂时没有可掠夺的矿', FX(697), FY(470), 30, GLASS_COLOR.text, S(900), HorizontalTextAlignment.CENTER, true);
      T(panel, 'LobbyRaidPvpEmptyDesc', '有保护盾、新手保护期内、或 24 小时内打过的矿不会出现', FX(697), FY(520), 22, GLASS_COLOR.sub, S(900), HorizontalTextAlignment.CENTER);
      mountGlassButton(kit, panel, 'LobbyRaidPvpEmptyRefresh', '换一批', FX(697), FY(600), S(260), S(56), k, 'primary', () => this.host.reloadLobbyRaidPvp(true), 24);
      return;
    }
    const cardW = 415;
    let firstOpen = true;
    home.candidates.slice(0, 3).forEach((candidate, index) => {
      const x0 = 57 + index * (cardW + 17.5);
      const primary = firstOpen && !candidate.attackedRecently;
      if (primary) {
        firstOpen = false;
      }
      this.renderPvpCard(panel, candidate, x0, cardW, primary, FX, FY, S, k, T);
    });
  }

  private renderPvpCard(panel: Node, candidate: RaidPvpCandidateVO, x0: number, cardW: number, primary: boolean,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    const id = candidate.userId;
    const top = 223;
    const cx = x0 + cardW / 2;
    const blocked = candidate.attackedRecently;
    const card = mountGlassPanel(kit, panel, `LobbyRaidPvpCard_${id}`, FX(cx), FY(top + 297), S(cardW), S(594), k);
    // 上半主角立绘(原型:头肩特写、肩甲撑满卡宽):遮罩裁到卡内 (卡顶 +2 .. +287,延伸到名字后面),只露人物上 27%,
    // 头顶留 14px,头部中心对准卡中线;底部 120px 渐隐进卡面(名字压在渐隐上)
    const artH = 285;
    const clip = this.host.addChildPlainNode(panel, `LobbyRaidPvpArt_${id}`, FX(cx), FY(top + 2 + artH / 2), S(cardW - 4), S(artH));
    clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const gender = (candidate.protagonist?.heroCode ?? '').toUpperCase().includes('FEMALE') ? 'female' : 'male';
    const art = PROTAG_ART[gender][candidate.lianhun ? 'lianhun' : 'base'];
    const imgH = S(artH / 0.27);
    const imgW = imgH * (810 / 1080);
    const sprite = this.host.addSprite('Art', art.path, -(art.headX - 0.5) * imgW, S(artH / 2) - S(14) - imgH / 2, imgW, imgH, clip);
    if (sprite && blocked) {
      sprite.grayscale = true;
    }
    const fade = this.host.addChildPlainNode(clip, 'Fade', 0, 0, S(cardW - 4), S(artH)).addComponent(Graphics);
    // 渐隐到卡面实测底色 (22,26,32)(先前 (17,20,27) 在立绘下沿留一道暗线);条带首尾相接不重叠(重叠处 alpha 叠加会出横纹),40 级够细
    const steps = 40;
    const fadeH = S(120);
    const stepH = fadeH / steps;
    const fadeW = S(cardW - 4);
    for (let i = 0; i < steps; i += 1) {
      fade.fillColor = rgba(22, 26, 32, Math.round(255 * ((i + 0.5) / steps) ** 1.4));
      fade.rect(-fadeW / 2, -S(artH) / 2 + fadeH - stepH * (i + 1), fadeW, stepH);
      fade.fill();
    }
    if (candidate.protagonist) {
      mountGlassTagPill(kit, panel, `LobbyRaidPvpLeadTag_${id}`, '主角', FX(x0 + 16), FY(top + 31), S(32), k, S(18), textWidth, GLASS_COLOR.text);
    }
    const nameColor = blocked ? GLASS_COLOR.sub : GLASS_COLOR.text;
    T(panel, `LobbyRaidPvpName_${id}`, candidate.nickname, FX(cx), FY(top + 262), 30, nameColor, S(cardW - 40), HorizontalTextAlignment.CENTER, true);
    const lv = candidate.realmTitle ? `Lv.${candidate.level} · ${candidate.realmTitle}` : `Lv.${candidate.level}`;
    T(panel, `LobbyRaidPvpLv_${id}`, lv, FX(cx), FY(top + 300), 20, GLASS_COLOR.sub, S(cardW - 40), HorizontalTextAlignment.CENTER);
    candidate.defenders.slice(0, 3).forEach((hero, index) => {
      const hx = cx + (index - 1) * 103;
      this.mountGlassHero(panel, `LobbyRaidPvpDef_${id}_${index}`, hero, FX(hx), FY(top + 361), S(74), k, blocked);
      T(panel, `LobbyRaidPvpDefStar_${id}_${index}`, `★${Math.max(1, hero.star)}`, FX(hx), FY(top + 410), 19, STAR_COLOR, S(90), HorizontalTextAlignment.CENTER);
    });
    // 阵容战力 / 可抢:图标 + 灰字说明 + 白字数值,整组居中
    const powerText = fmt(candidate.lineupPower);
    const powerW = 30 + 10 + textWidth('阵容战力', 21) + 12 + textWidth(powerText, 22);
    const px = cx - powerW / 2;
    const swords = this.host.addSprite(`LobbyRaidPvpPowerIcon_${id}`, GLASS_ICON_PATH('profile_swords'), FX(px + 15), FY(top + 447), S(26), S(26), panel);
    if (swords) {
      swords.color = GLASS_COLOR.sub;
    }
    T(panel, `LobbyRaidPvpPowerCap_${id}`, '阵容战力', FX(px + 40), FY(top + 447), 21, GLASS_COLOR.sub, S(100));
    T(panel, `LobbyRaidPvpPower_${id}`, powerText, FX(px + 40 + textWidth('阵容战力', 21) + 12), FY(top + 447), 22, nameColor, S(130));
    const stealText = fmt(candidate.stealPreview);
    const stealW = 32 + 10 + textWidth('可抢', 22) + 10 + textWidth(stealText, 30) * 0.92 + 10 + textWidth('矿晶', 22);
    const sx = cx - stealW / 2;
    this.host.addSprite(`LobbyRaidPvpStealIcon_${id}`, CRYSTAL_ICON_ASSET, FX(sx + 16), FY(top + 487), S(34), S(34), panel);
    T(panel, `LobbyRaidPvpStealCap_${id}`, '可抢', FX(sx + 42), FY(top + 488), 22, GLASS_COLOR.sub, S(60));
    const numX = sx + 42 + textWidth('可抢', 22) + 10;
    T(panel, `LobbyRaidPvpSteal_${id}`, stealText, FX(numX), FY(top + 486), 30, blocked ? GLASS_COLOR.sub : GLASS_COLOR.text, S(150), HorizontalTextAlignment.LEFT, true);
    T(panel, `LobbyRaidPvpStealUnit_${id}`, '矿晶', FX(numX + textWidth(stealText, 30) * 0.92 + 10), FY(top + 488), 22, GLASS_COLOR.sub, S(60));
    // 掠夺:第一张能打的卡用主按钮(香槟),其余次按钮;24 小时内打过 = 不可点并写原因
    const kind = blocked ? 'disabled' : primary ? 'primary' : 'secondary';
    mountGlassButton(kit, panel, `LobbyRaidPvpAttack_${id}`, blocked ? '24 小时内已打过' : '掠夺', FX(cx), FY(top + 549), S(cardW - 50), S(54), k, kind,
      blocked ? undefined : () => this.host.startLobbyRaidPvp(candidate.userId, null), blocked ? 21 : 26);
    void card;
  }

  /** 右栏战报(原型 1357..1813 × 223..817):标题 + 分割线 + 最多 4 行(行心 360 起步 118);被打赢的带「复仇」。 */
  private renderPvpReportColumn(panel: Node, home: RaidPvpHomeVO,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'LobbyRaidPvpReports', FX(1585), FY(520), S(456), S(594), k);
    this.host.addSprite('LobbyRaidPvpReportsIcon', GLASS_ICON_PATH('notice_paper'), FX(1400), FY(262), S(36), S(36), panel);
    T(panel, 'LobbyRaidPvpReportsTitle', '战报', FX(1432), FY(262), 28, GLASS_COLOR.text, S(200), HorizontalTextAlignment.LEFT, true);
    mountGlassLine(kit, panel, 'LobbyRaidPvpReportsDiv', FX(1585), FY(300), S(416), Math.max(1, S(1.5)), new Color(255, 255, 255, 34));
    if (home.reports.length === 0) {
      T(panel, 'LobbyRaidPvpReportsEmpty', '还没有战报,去掠夺一座矿吧', FX(1585), FY(380), 21, GLASS_COLOR.sub, S(400), HorizontalTextAlignment.CENTER);
      return;
    }
    home.reports.slice(0, 4).forEach((report, index) => {
      const cy = 362 + index * 118;
      this.renderPvpReportLine(panel, report, cy, FX, FY, S, k, T);
      if (index < Math.min(4, home.reports.length) - 1) {
        mountGlassLine(kit, panel, `LobbyRaidPvpReportSep_${report.id}`, FX(1585), FY(cy + 59), S(416), Math.max(1, S(1)), new Color(255, 255, 255, 22));
      }
    });
  }

  private renderPvpReportLine(panel: Node, report: RaidPvpReportVO, cy: number,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    const attack = report.role === 'ATTACK';
    const won = report.result === 'WIN';
    const id = report.id;
    const icon = this.host.addSprite(`LobbyRaidPvpReportIcon_${id}`, GLASS_ICON_PATH(attack ? 'profile_swords' : 'battle_shield'), FX(1402), FY(cy), S(46), S(46), panel);
    if (icon) {
      icon.color = new Color(214, 218, 226, 255);
    }
    const right = report.canRevenge ? 1680 : 1790;
    T(panel, `LobbyRaidPvpReportHead_${id}`, attack ? `掠夺 ${report.opponentName}` : `被 ${report.opponentName} 掠夺`, FX(1442), FY(cy - 19), 22, GLASS_COLOR.text, S(right - 1442));
    const delta = report.crystalDelta;
    const result = `${won ? '胜' : '败'} ${delta >= 0 ? '+' : ''}${fmt(delta)} 矿晶`;
    T(panel, `LobbyRaidPvpReportBody_${id}`, result, FX(1442), FY(cy + 20), 21, won ? GLASS_COLOR.green : GLASS_COLOR.red, S(170));
    T(panel, `LobbyRaidPvpReportAgo_${id}`, `· ${this.formatAgo(report.createdAt)}`, FX(1442 + textWidth(result, 21) + 10), FY(cy + 20), 20, GLASS_COLOR.sub, S(right - 1452 - textWidth(result, 21)));
    if (report.canRevenge) {
      mountGlassButton(kit, panel, `LobbyRaidPvpRevenge_${id}`, '复仇', FX(1745), FY(cy), S(96), S(42), k, 'secondary',
        () => this.host.startLobbyRaidPvp(report.opponentUserId, report.id), 20);
    }
  }

  /** 玻璃框英雄头像(物品格口径:一层框 + 圆角头像);dimmed = 不可打的对手整组压暗。 */
  private mountGlassHero(parent: Node, name: string, hero: RaidDefenderPreviewVO, x: number, y: number, size: number, k: number, dimmed = false): void {
    const kit = this.host as unknown as UiKitHost;
    const frame = mountGlassFrame(kit, parent, name, x, y, size, size, k);
    const inner = size * 0.9;
    if (!mountHeroAvatar(frame, hero.heroCode, inner, 'round')) {
      glassLabel(kit, frame, 'Initial', (hero.heroName || hero.heroCode || '?').slice(0, 1), 0, 0, size * 0.4, GLASS_COLOR.text, size, HorizontalTextAlignment.CENTER, true);
    }
    if (dimmed) {
      frame.addComponent(UIOpacity).opacity = 140;
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
      // 已领不再挤进标题(会被图标盖住):标题固定「首通」,数量后面挂灰色「已领取」,图标置灰
      this.label(parent, 'LobbyRaidInfoFirstTitle', '首通', m.X(1455), m.Y(612), m.S(27), selected.cleared ? DIM_TEXT : rgba(226, 204, 160, 255), m.HX(110), HorizontalTextAlignment.LEFT);
      this.renderRewardRow(parent, 'LobbyRaidInfoFirst', selected.firstClearRewards, m, 612, [1580], 50, selected.cleared);
      if (selected.cleared) {
        this.label(parent, 'LobbyRaidInfoFirstClaimed', '已领取', m.X(1828), m.Y(612), m.S(23), DIM_TEXT, m.HX(110), HorizontalTextAlignment.RIGHT);
      }
    }
    const button = this.host.addChildPlainNode(parent, 'LobbyRaidStartButton', m.X(1645), m.Y(690), m.S(392), m.S(72));
    this.paintButton(button, m.S(392), m.S(72), m.ks, selected.unlocked ? '掠夺' : '未解锁', m.S(40), selected.unlocked ? 'primary' : 'disabled');
    if (selected.unlocked) {
      button.on(Node.EventType.TOUCH_END, () => this.host.startLobbyRaidBattle(selected.stageCode), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    this.label(parent, 'LobbyRaidInfoNote', selected.unlocked ? `消耗体力 ${selected.staminaCost}(胜利才扣)` : '先掠夺上一座矿', m.X(1645), m.Y(757), m.S(23), BODY_TEXT, m.HX(400));
  }

  /** 奖励行:图标中心在 xs[i],「×N」紧跟图标右侧;点图标或数量弹详情卡(用户:不然不知道是啥)。 */
  private renderRewardRow(parent: Node, prefix: string, rewards: PlayerBattleRewardItemVO[], m: ProtoMap, y: number, xs: number[], icon: number, dimmed = false): void {
    rewards.slice(0, xs.length).forEach((reward, index) => {
      const x = m.X(xs[index]);
      const size = m.S(icon);
      const asset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      const sprite = asset ? this.host.addSprite(`${prefix}Icon_${index}`, asset, x, m.Y(y), size, size, parent) : null;
      if (sprite) {
        if (dimmed) {
          sprite.grayscale = true;
          sprite.node.addComponent(UIOpacity).opacity = 150;
        }
      } else {
        this.label(parent, `${prefix}Txt_${index}`, (reward.resourceName || reward.resourceCode).slice(0, 1), x, m.Y(y), size * 0.5, GOLD_TEXT, size);
      }
      this.label(parent, `${prefix}Amount_${index}`, `×${Math.round(reward.amount)}`, x + size / 2 + m.S(12), m.Y(y), m.S(27), dimmed ? DIM_TEXT : BODY_TEXT, m.HX(110), HorizontalTextAlignment.LEFT);
      // 点击区:图标 + 数量整块(手指好点),再点一次或点别处收起
      const hitW = size + m.S(12) + m.S(80);
      const hit = this.host.addChildPlainNode(parent, `${prefix}Hit_${index}`, x - size / 2 + hitW / 2, m.Y(y), hitW, Math.max(size, m.S(56)));
      hit.on(Node.EventType.TOUCH_END, () => this.toggleRewardTip(parent, reward, asset, x, m.Y(y), size, m), this);
    });
  }

  private rewardTipKey = '';

  /** 奖励详情卡:图标 + 名称 + 类型·数量 + 用途;放在图标上方(放不下就下方)并夹在面板内,底下铺一层透明点击层负责收起。 */
  private toggleRewardTip(panel: Node, reward: PlayerBattleRewardItemVO, asset: string | null, x: number, y: number, size: number, m: ProtoMap): void {
    const key = `${reward.resourceCode}@${Math.round(x)},${Math.round(y)}`;
    const open = this.rewardTipKey === key && !!panel.getChildByName('LobbyRaidRewardTip');
    this.closeRewardTip(panel);
    if (open) {
      return;
    }
    this.rewardTipKey = key;
    const pt = panel.getComponent(UITransform);
    const pw = pt?.width ?? 1600;
    const ph = pt?.height ?? 800;
    const catcher = this.host.addChildPlainNode(panel, 'LobbyRaidRewardTipCatcher', 0, 0, pw * 2, ph * 2);
    catcher.addComponent(BlockInputEvents);
    catcher.on(Node.EventType.TOUCH_END, () => this.closeRewardTip(panel), this);
    const cw = m.S(420);
    const ch = m.S(180);
    const cx = Math.max(-pw / 2 + cw / 2 + m.S(10), Math.min(pw / 2 - cw / 2 - m.S(10), x));
    const above = y + size / 2 + ch / 2 + m.S(14);
    const cy = above + ch / 2 > ph / 2 - m.S(10) ? y - size / 2 - ch / 2 - m.S(14) : above;
    const card = this.host.addChildPlainNode(panel, 'LobbyRaidRewardTip', cx, cy, cw, ch);
    card.addComponent(BlockInputEvents);
    card.on(Node.EventType.TOUCH_END, () => this.closeRewardTip(panel), this);
    // 底色要完全不透:先垫一层实心底再画框(单层在原生端会透出下面的字)
    const solid = this.host.addChildPlainNode(card, 'Solid', 0, 0, cw, ch).addComponent(Graphics);
    solid.fillColor = rgba(12, 10, 9, 255);
    solid.rect(-cw / 2 + m.S(3), -ch / 2 + m.S(3), cw - m.S(6), ch - m.S(6));
    solid.fill();
    this.ornateFrame(this.host.addChildPlainNode(card, 'Frame', 0, 0, cw, ch).addComponent(Graphics), cw, ch, m.S(10), rgba(14, 12, 11, 255), rgba(214, 170, 96, 245), rgba(110, 84, 46, 220), Math.max(1.5, m.S(2)));
    const iconSize = m.S(76);
    const iconX = -cw / 2 + m.S(24) + iconSize / 2;
    const iconY = ch / 2 - m.S(18) - iconSize / 2;
    if (!asset || !this.host.addSprite('Icon', asset, iconX, iconY, iconSize, iconSize, card)) {
      this.label(card, 'IconTxt', (reward.resourceName || reward.resourceCode).slice(0, 1), iconX, iconY, iconSize * 0.5, GOLD_TEXT, iconSize);
    }
    const textX = iconX + iconSize / 2 + m.S(16);
    const textW = cw / 2 - m.S(18) - textX;
    const name = this.label(card, 'Name', reward.resourceName || reward.resourceCode, textX, iconY + m.S(16), m.S(28), rgba(255, 232, 176, 255), textW, HorizontalTextAlignment.LEFT, true);
    name.enableOutline = true;
    name.outlineColor = rgba(20, 10, 6, 255);
    name.outlineWidth = Math.max(1, m.S(2));
    this.label(card, 'Meta', `${rewardTypeLabel(reward.resourceType)} · 数量 ×${Math.round(reward.amount)}`, textX, iconY - m.S(20), m.S(21), rgba(214, 200, 166, 245), textW, HorizontalTextAlignment.LEFT);
    // LEFT 对齐的 x 是左沿
    const desc = this.host.addChildLabel(card, 'Desc', rewardDescLine(reward.resourceCode), -cw / 2 + m.S(22), -ch / 2 + m.S(40), m.S(20), rgba(196, 186, 164, 240), new Size(cw - m.S(44), m.S(60)), HorizontalTextAlignment.LEFT);
    desc.overflow = Label.Overflow.SHRINK;
    desc.enableWrapText = true;
  }

  private closeRewardTip(panel: Node): void {
    for (const child of panel.children.slice()) {
      if (child.name === 'LobbyRaidRewardTip' || child.name === 'LobbyRaidRewardTipCatcher') {
        child.destroy();
      }
    }
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

function rewardTypeLabel(type: string | undefined): string {
  const t = (type || '').toUpperCase();
  if (t === 'CURRENCY') {
    return '货币';
  }
  if (t === 'EQUIP') {
    return '装备';
  }
  if (t === 'HERO_FRAGMENT') {
    return '英雄碎片';
  }
  return '材料 / 道具';
}

/** 奖励用途说明(只写已上线的用途;熔炉已下架,矿晶不写兑换)。 */
function rewardDescLine(code: string | undefined): string {
  const c = (code || '').toUpperCase();
  if (c === 'GOLD') {
    return '通用货币,用于英雄升级、锻造与商店购买。';
  }
  if (c === 'SACRED_CRYSTAL') {
    return '矿境的核心资源,存进你的矿库。真人矿掠夺抢的就是矿库里的矿晶,记得开盾保护。';
  }
  if (c === 'BOUND_DIAMOND') {
    return '用于普通召唤(契约券不足时扣绑钻),不能代替钻石。';
  }
  if (c === 'DIAMOND') {
    return '高级货币,用于高级召唤、商店与购买保护盾。';
  }
  if (c === 'STAMINA') {
    return '进入冒险与矿境时消耗,随时间自动恢复。';
  }
  return '战斗产出道具,详情可在背包查看。';
}
