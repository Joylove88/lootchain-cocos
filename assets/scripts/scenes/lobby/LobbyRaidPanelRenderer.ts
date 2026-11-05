import { BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import type { PlayerBattleRewardItemVO } from '../../types/BattleTypes';
import type { RaidDefenderPreviewVO, RaidPvpCandidateVO, RaidPvpHomeVO, RaidPvpReportVO, RaidStagesVO, RaidStageVO } from '../../types/RaidTypes';
import type { UiKitHost } from '../UiKit';
import {
  glassLabel, glassProtoMap, GLASS_COLOR, GLASS_SLICES, mountGlassButton, mountGlassFrame, mountGlassLine, mountGlassPanel,
  mountGlassSectionHeader, mountGlassSlice, mountGlassTagPill, mountGlassTopBar,
} from '../UiGlassKit';
import { mountCoverArt, mountHeroAvatar, resolveHeroRosterArtPath } from './HeroHeadCrop';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 矿境面板(docs/48 NPC 矿 + docs/49 真人矿),docs/61(11-05)两页都改 B 毛玻璃:
 * - 真人矿 = 原型 `周报截图/2026-11-05_掠夺主角带队/proto/pvp_b_v4.png`;NPC 矿 = 同目录 `npc_b_v3.png`(都是 1870×841,用户从多版本里选定)。
 * - 两页共用顶栏(‹ 矿境 + 真人矿 / NPC 矿 页签 + 体力 + ✕)与背景(pvp_bg_v4:原型去 UI 扩图);坐标按 glassProtoMap(FX / FY 以舞台中心为原点,S 等比)。
 * - 素材预载组 'raid'(RAID_UI_ASSET_PATHS);矿主卡面用名册横版卡面 ui/hero/roster(异步挂)。
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
const RAID_ART = {
  nodeOn: 'ui/raid/mine_node_on/spriteFrame',
  nodeOff: 'ui/raid/mine_node_off/spriteFrame',
  zoneThumb: (index: number) => `ui/raid/zone_thumb_${index + 1}/spriteFrame`,
};
/** 矿境面板整组素材(UiSpriteFrameCache 预载组 'raid':首开等齐再画)。路径写死,不引用 UiGlassKit 常量(预载表初始化顺序成环)。 */
export const RAID_UI_ASSET_PATHS: readonly string[] = [
  'ui/raid/pvp_bg_v4/spriteFrame',
  RAID_ART.nodeOn,
  RAID_ART.nodeOff,
  ...[0, 1, 2, 3, 4, 5].map((index) => RAID_ART.zoneThumb(index)),
  // 奖励 / 战报常用图标:进面板就有图
  'ui/bag/ai/icon_gold/spriteFrame',
  'ui/bag/ai/icon_sacred_crystal/spriteFrame',
  'ui/bag/ai/icon_bound_diamond/spriteFrame',
  // 真人矿对手卡主角立绘(炼魂起换装版)
  'ui/protagonist/b/protag_m_base/spriteFrame',
  'ui/protagonist/b/protag_f_base/spriteFrame',
  'ui/realm/protag_m_lianhun/spriteFrame',
  'ui/realm/protag_f_lianhun/spriteFrame',
  ...['panel', 'frame', 'frame_sel', 'chip', 'tag_pill', 'tab_gold', 'pill_primary', 'pill_secondary', 'pill_gold', 'accent_bar', 'divider', 'icon_back', 'icon_close', 'icon_plus',
    'lock', 'profile_swords', 'battle_shield', 'battle_pickaxe', 'notice_paper'].map((name) => `ui/glass/${name}/spriteFrame`),
];

/** 真人矿 B 风格(docs/61,原型 周报截图/2026-11-05_掠夺主角带队/proto/pvp_b_v4.png):主角立绘(炼魂起换装版)+ 头部中心(图宽占比,PIL 量头顶行 alpha 中点)。 */
const PROTAG_ART: Record<'male' | 'female', Record<'base' | 'lianhun', { path: string; headX: number }>> = {
  male: { base: { path: 'ui/protagonist/b/protag_m_base/spriteFrame', headX: 0.46 }, lianhun: { path: 'ui/realm/protag_m_lianhun/spriteFrame', headX: 0.478 } },
  female: { base: { path: 'ui/protagonist/b/protag_f_base/spriteFrame', headX: 0.485 }, lianhun: { path: 'ui/realm/protag_f_lianhun/spriteFrame', headX: 0.51 } },
};
const GLASS_ICON_PATH = (name: string): string => `ui/glass/${name}/spriteFrame`;
const CRYSTAL_ICON_ASSET = 'ui/bag/ai/icon_sacred_crystal/spriteFrame';
const PVP_BG_ASSET = 'ui/raid/pvp_bg_v4/spriteFrame';
const STAGES_PER_ZONE = 10;
const STAR_COLOR = new Color(236, 196, 96, 255);
// 无盾警示:原型实测香槟暖金(字芯 ≈ (252,222,162)),不是橙色
const WARN_COLOR = new Color(246, 216, 156, 255);
type GlassT = (parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label;
/** 两页共用的玻璃页上下文:面板节点 + 原型坐标映射 + 文字工厂。 */
interface RaidGlassCtx {
  panel: Node;
  FX: (v: number) => number;
  FY: (v: number) => number;
  S: (v: number) => number;
  k: number;
  T: GlassT;
}


function fmt(value: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 星级:≤3 画星,再多用「★N」(原型里都是 1~3 星;真人阵容 5~10 星一行放不下)。 */
function textWidth(text: string, font: number): number {
  let total = 0;
  for (const ch of text) {
    total += ch.charCodeAt(0) > 255 ? font : font * 0.56;
  }
  return total;
}

/** 原型坐标映射:X / Y = 原型像素 → 面板坐标;S = 等比尺寸;HX / HY = 横 / 竖长度。 */
export class LobbyRaidPanelRenderer {
  constructor(private readonly host: LobbyRaidPanelHost) {}

  render(layout: UiLayout): void {
    const ctx = this.mountGlassChrome(layout);
    if (this.host.currentLobbyRaidState().tab === 'pvp') {
      this.renderPvpGlass(ctx);
    } else {
      this.renderNpcGlass(ctx);
    }
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

  // ════════════════════ 真人矿 B 风格(docs/61,原型 pvp_b_v4)════════════════════
  //
  // 坐标按原型 1870×841(glassProtoMap:FX / FY 以舞台中心为原点,S 等比);顶栏贴左右缘(LX / RX)。
  // 顶栏 y 40:‹ 矿境 + 真人矿(暗金胶囊)/ NPC 矿 + 体力 + ✕;我的矿横条 57..1813 × 80..162;
  // 「可掠夺的矿」标题 + 换一批 @ y 193;对手竖卡 3 张 57..1337 × 223..817(卡宽 415 间距 17.5);右栏战报 1357..1813 × 223..817。

  /** 两页共用:遮罩 + 面板 + 背景 + 顶栏(‹ 矿境 / 页签 / 体力 + / ✕)。 */
  private mountGlassChrome(layout: UiLayout): RaidGlassCtx {
    const raid = this.host.currentLobbyRaidState();
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
    return { panel, FX, FY, S, k, T };
  }

  private renderPvpGlass(ctx: RaidGlassCtx): void {
    const { panel, FX, FY, S, k, T } = ctx;
    const kit = this.host as unknown as UiKitHost;
    const state = this.host.currentLobbyRaidPvpState();
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
    // 原型(逐像素量):无盾 = 香槟色描边三角「!」(1232..1262 × 107..134)+ 常规字重香槟字(左沿 1279、字高 ≈ 24);有盾 = 绿色盾 + 绿字
    if (guarded) {
      const shield = this.host.addSprite('LobbyRaidPvpShieldIcon', GLASS_ICON_PATH('battle_shield'), FX(1247), y, S(30), S(30), panel);
      if (shield) {
        shield.color = GLASS_COLOR.green;
      }
    } else {
      this.mountWarnTriangle(panel, 'LobbyRaidPvpShieldIcon', FX(1247), FY(120.5), S(30), S(27));
    }
    T(panel, 'LobbyRaidPvpShield', shieldText, FX(1279), y, 24, guarded ? GLASS_COLOR.green : WARN_COLOR, S(250));
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
    home.candidates.slice(0, 3).forEach((candidate, index) => {
      const x0 = 57 + index * (cardW + 17.5);
      this.renderPvpCard(panel, candidate, x0, cardW, FX, FY, S, k, T);
    });
  }

  private renderPvpCard(panel: Node, candidate: RaidPvpCandidateVO, x0: number, cardW: number,
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
    // 掠夺:三张卡一律次按钮(11-05 用户:候选是随机平级的,原型第一张香槟主按钮会被误读成「推荐」);24 小时内打过 = 不可点并写原因
    const kind = blocked ? 'disabled' : 'secondary';
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

  /** 警示三角(原型线稿):圆角描边三角 + 竖杠 + 圆点,香槟色。 */
  private mountWarnTriangle(parent: Node, name: string, x: number, y: number, w: number, h: number): void {
    const node = this.host.addChildPlainNode(parent, name, x, y, w, h);
    const g = node.addComponent(Graphics);
    const lw = Math.max(2, h * 0.13);
    g.lineWidth = lw;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    g.strokeColor = WARN_COLOR;
    const hw = w / 2 - lw / 2;
    const hh = h / 2 - lw / 2;
    g.moveTo(0, hh);
    g.lineTo(hw, -hh);
    g.lineTo(-hw, -hh);
    g.close();
    g.stroke();
    g.moveTo(0, hh * 0.32);
    g.lineTo(0, -hh * 0.3);
    g.stroke();
    g.fillColor = WARN_COLOR;
    g.circle(0, -hh * 0.62, lw * 0.62);
    g.fill();
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

  // ════════════════════ NPC 矿 B 风格(docs/61,原型 npc_b_v3)════════════════════
  //
  // 左栏区域 58..402 × 94..796(行 71..391、高 90、行心 165 + 108i);中栏 420..1244(标题 @ 137;矿格 5×2:x0 = 438 + 162.5i、宽 151,
  // 行顶 211 / 477、高 230);右栏矿主竖卡 1260..1814 × 93..796(上半矿主卡面 → 标题 302 → 守卫 374 → 战力 512 → 奖励 570 / 首通 629 → 掠夺 707 → 体力说明 764)。

  private renderNpcGlass(ctx: RaidGlassCtx): void {
    const { panel, FX, FY, S, k, T } = ctx;
    const kit = this.host as unknown as UiKitHost;
    const state = this.host.currentLobbyRaidState();
    if (!state.stages) {
      if (state.error) {
        T(panel, 'LobbyRaidError', `读取失败:${state.error}`, FX(935), FY(430), 24, GLASS_COLOR.red, S(900), HorizontalTextAlignment.CENTER);
        mountGlassButton(kit, panel, 'LobbyRaidRetry', '重试', FX(935), FY(500), S(180), S(52), k, 'secondary', () => this.host.reloadLobbyRaidStages(), 22);
      } else {
        T(panel, 'LobbyRaidLoading', '矿境读取中…', FX(935), FY(450), 24, GLASS_COLOR.sub, S(600), HorizontalTextAlignment.CENTER);
      }
      return;
    }
    const selected = this.resolveSelected(state);
    if (!selected) {
      return;
    }
    const zones = this.zonesOf(state.stages);
    this.renderNpcZones(panel, zones, selected, FX, FY, S, k, T);
    const zone = zones.find((entry) => entry.name === selected.zoneName);
    if (zone) {
      this.renderNpcMineGrid(panel, zone, selected, FX, FY, S, k, T);
    }
    this.renderNpcOwnerCard(panel, selected, FX, FY, S, k, T);
  }

  /** 左栏区域:选中 = 暗金底白字;右半矿区缩略图(左缘渐隐);未解锁灰字 + 锁。 */
  private renderNpcZones(panel: Node, zones: Array<{ name: string; stages: RaidStageVO[] }>, selected: RaidStageVO,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'LobbyRaidZoneColumn', FX(230), FY(445), S(344), S(702), k);
    zones.slice(0, 6).forEach((zone, index) => {
      const cy = 165 + index * 108;
      const on = zone.name === selected.zoneName;
      const unlocked = zone.stages.some((stage) => stage.unlocked);
      const w = S(320);
      const h = S(90);
      const row = this.host.addChildPlainNode(panel, `LobbyRaidZone_${index}`, FX(231), FY(cy), w, h);
      mountGlassSlice(kit, row, 'Bg', on ? GLASS_SLICES.tabGold : GLASS_SLICES.panel, 0, 0, w, h, k);
      // 缩略图占右半(原型 240..390),左缘渐隐进行底
      const thumbW = S(160);
      const clip = this.host.addChildPlainNode(row, 'Thumb', w / 2 - thumbW / 2 - S(4), 0, thumbW, h - S(8));
      clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      const thumb = this.host.addSprite('Art', RAID_ART.zoneThumb(index), 0, 0, thumbW, thumbW, clip);
      if (thumb) {
        thumb.grayscale = !unlocked;
        // 选中行底是左暗右亮的暗金渐变:缩略图压淡让金色透出来,左缘渐隐到实测金色 (164,135,92)(先前用暗棕在名字右侧切出一道硬边)
        clip.addComponent(UIOpacity).opacity = on ? 170 : unlocked ? 150 : 90;
      }
      // 渐隐层挂在行上(不进 clip:clip 的 UIOpacity 会把渐隐也压淡,左缘又露硬边)
      const fade = this.host.addChildPlainNode(row, 'ThumbFade', clip.position.x, 0, thumbW, h - S(8)).addComponent(Graphics);
      const steps = 16;
      const base = on ? rgba(164, 135, 92, 255) : rgba(26, 30, 38, 255);
      for (let i = 0; i < steps; i += 1) {
        fade.fillColor = rgba(base.r, base.g, base.b, Math.round(255 * (1 - i / steps)));
        fade.rect(-thumbW / 2 + (thumbW * 0.7 * i) / steps, -(h - S(8)) / 2, (thumbW * 0.7) / steps, h - S(8));
        fade.fill();
      }
      T(row, 'Name', zone.name, -w / 2 + S(31), 0, 30, on ? GLASS_COLOR.onGold : unlocked ? GLASS_COLOR.text : GLASS_COLOR.sub, S(200), HorizontalTextAlignment.LEFT, on);
      if (!unlocked) {
        const lock = this.host.addSprite('Lock', GLASS_ICON_PATH('lock'), w / 2 - S(33), 0, S(34), S(34), row);
        if (lock) {
          lock.color = new Color(220, 224, 232, 255);
        }
      }
      row.on(Node.EventType.TOUCH_END, () => {
        const target = zone.stages.find((stage) => stage.unlocked && !stage.cleared) ?? zone.stages.find((stage) => stage.unlocked) ?? zone.stages[0];
        if (target) {
          this.host.selectLobbyRaidStage(target.stageCode);
        }
      }, this);
      this.host.applyImageButtonFeedback(row, 1.02, 0.98);
    });
  }

  /** 中栏 5×2 矿格:矿口图 + N号矿 + 状态(已完成 绿勾 / 当前 香槟 / 未解锁 锁);选中格金边。 */
  private renderNpcMineGrid(panel: Node, zone: { name: string; stages: RaidStageVO[] }, selected: RaidStageVO,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'LobbyRaidMineGridPanel', FX(832), FY(445), S(824), S(702), k);
    mountGlassSectionHeader(kit, panel, 'LobbyRaidMineGridHead', `${zone.name} · ${zone.stages.length} 座矿`, FX(448), FY(137), k, 32);
    zone.stages.slice(0, 10).forEach((stage, index) => {
      const x0 = 438 + (index % 5) * 162.5;
      const top = index < 5 ? 211 : 477;
      const cx = x0 + 75.5;
      const on = stage.stageCode === selected.stageCode;
      const tile = this.host.addChildPlainNode(panel, `LobbyRaidMine_${stage.orderNo}`, FX(cx), FY(top + 115), S(151), S(230));
      mountGlassSlice(kit, tile, 'Bg', on ? GLASS_SLICES.frameSel : GLASS_SLICES.frame, 0, 0, S(151), S(230), k);
      const art = this.host.addSprite('Art', stage.unlocked ? RAID_ART.nodeOn : RAID_ART.nodeOff, 0, S(115 - 72), S(126), S(126), tile);
      if (art && !stage.unlocked) {
        art.grayscale = true;
      }
      T(tile, 'Name', `${(stage.orderNo - 1) % STAGES_PER_ZONE + 1}号矿`, 0, S(115 - 154), 28, stage.unlocked ? GLASS_COLOR.text : GLASS_COLOR.sub, S(140), HorizontalTextAlignment.CENTER, true);
      const sy = S(115 - 194);
      if (stage.cleared) {
        this.mountCheckBadge(tile, 'Check', -S(75.5) + S(43), sy, S(24));
        T(tile, 'State', '已完成', -S(75.5) + S(67), sy, 20, GLASS_COLOR.sub, S(80));
      } else if (stage.unlocked) {
        T(tile, 'State', '当前', 0, sy, 22, GLASS_COLOR.champagne, S(120), HorizontalTextAlignment.CENTER);
      } else {
        const lock = this.host.addSprite('Lock', GLASS_ICON_PATH('lock'), -S(75.5) + S(42), sy, S(26), S(26), tile);
        if (lock) {
          lock.color = GLASS_COLOR.sub;
        }
        T(tile, 'State', '未解锁', -S(75.5) + S(64), sy, 20, GLASS_COLOR.sub, S(80));
      }
      tile.on(Node.EventType.TOUCH_END, () => this.host.selectLobbyRaidStage(stage.stageCode), this);
      this.host.applyImageButtonFeedback(tile, 1.03, 0.97);
    });
  }

  /** 右栏矿主竖卡(同真人矿对手卡口径):上半矿主横版卡面(贴顶裁头胸,底部渐隐)+「矿主 · 名字 ★N」签 → 标题 → 3 守卫 → 战力 → 奖励 / 首通 → 掠夺。 */
  private renderNpcOwnerCard(panel: Node, selected: RaidStageVO,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
    const cx = 1537;
    const cardW = 554;
    mountGlassPanel(kit, panel, 'LobbyRaidInfoCard', FX(cx), FY(444.5), S(cardW), S(703), k);
    const owner = selected.owner;
    const artPath = owner ? resolveHeroRosterArtPath(owner.heroCode) : null;
    const artTop = 95;
    const artH = 236;
    if (artPath) {
      const clip = this.host.addChildPlainNode(panel, 'LobbyRaidOwnerArt', FX(cx), FY(artTop + artH / 2), S(cardW - 4), S(artH));
      clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      mountCoverArt(clip, artPath, S(cardW - 4), S(artH), true);
      if (!selected.unlocked) {
        clip.addComponent(UIOpacity).opacity = 150;
      }
      const fade = this.host.addChildPlainNode(clip, 'Fade', 0, 0, S(cardW - 4), S(artH)).addComponent(Graphics);
      const steps = 40;
      const fadeH = S(110);
      const stepH = fadeH / steps;
      for (let i = 0; i < steps; i += 1) {
        fade.fillColor = rgba(22, 26, 32, Math.round(255 * ((i + 0.5) / steps) ** 1.4));
        fade.rect(-S(cardW - 4) / 2, -S(artH) / 2 + fadeH - stepH * (i + 1), S(cardW - 4), stepH);
        fade.fill();
      }
    }
    if (owner) {
      const tagText = `矿主 · ${owner.heroName || owner.heroCode} ★${Math.max(1, owner.star)}`;
      mountGlassTagPill(kit, panel, 'LobbyRaidOwnerTag', tagText, FX(1278), FY(125), S(36), k, S(19), textWidth, GLASS_COLOR.text);
    }
    T(panel, 'LobbyRaidInfoTitle', `${selected.zoneName} · ${(selected.orderNo - 1) % STAGES_PER_ZONE + 1}号矿`, FX(cx), FY(302), 32, GLASS_COLOR.text, S(cardW - 40), HorizontalTextAlignment.CENTER, true);
    selected.defenders.slice(0, 3).forEach((hero, index) => {
      const hx = [1381, 1541, 1700][index];
      this.mountGlassHero(panel, `LobbyRaidInfoDef_${index}`, hero, FX(hx), FY(374), S(78), k);
      T(panel, `LobbyRaidInfoDefName_${index}`, hero.heroName || hero.heroCode, FX(hx), FY(432), 21, GLASS_COLOR.text, S(150), HorizontalTextAlignment.CENTER);
      T(panel, `LobbyRaidInfoDefStar_${index}`, `★${Math.max(1, hero.star)}`, FX(hx), FY(460), 19, STAR_COLOR, S(90), HorizontalTextAlignment.CENTER);
    });
    const line = (name: string, y: number): void => {
      mountGlassLine(kit, panel, name, FX(cx), FY(y), S(502), Math.max(1, S(1.2)), new Color(255, 255, 255, 30));
    };
    line('LobbyRaidInfoDiv1', 484);
    // 推荐战力 / 当前:图标 + 灰字,当前不够推荐时「当前 N」标红
    const profile = this.host.currentLobbyProfile?.();
    const power = profile?.lineupPower ?? 0;
    const enough = power >= selected.recommendedPower;
    const recText = `推荐战力 ${fmt(selected.recommendedPower)}`;
    const curText = `当前 ${fmt(power)}`;
    const groupW = 30 + 12 + textWidth(`${recText} /`, 22) + 6 + textWidth(curText, 22);
    const gx = cx - groupW / 2;
    const swords = this.host.addSprite('LobbyRaidInfoPowerIcon', GLASS_ICON_PATH('profile_swords'), FX(gx + 15), FY(512), S(28), S(28), panel);
    if (swords) {
      swords.color = GLASS_COLOR.sub;
    }
    if (enough) {
      // 够战力:一整行(估算宽度拼两段会在「/」后留大空)
      T(panel, 'LobbyRaidInfoPower', `${recText} / ${curText}`, FX(gx + 42), FY(512), 22, GLASS_COLOR.sub, S(420));
    } else {
      T(panel, 'LobbyRaidInfoPower', `${recText} /`, FX(gx + 42), FY(512), 22, GLASS_COLOR.sub, S(260));
    }
    if (!enough) {
      T(panel, 'LobbyRaidInfoPowerNow', curText, FX(gx + 42 + textWidth(`${recText} /`, 22) + 6), FY(512), 22, GLASS_COLOR.red, S(160));
    }
    line('LobbyRaidInfoDiv2', 540);
    T(panel, 'LobbyRaidInfoRewardTitle', '掠夺奖励', FX(1302), FY(570), 23, GLASS_COLOR.text, S(140));
    this.renderGlassRewards(panel, 'LobbyRaidInfoReward', selected.rewardPreview, [1465, 1633], 570, false, FX, FY, S, T);
    line('LobbyRaidInfoDiv3', 600);
    if (selected.firstClearRewards.length > 0) {
      T(panel, 'LobbyRaidInfoFirstTitle', '首通', FX(1302), FY(629), 23, selected.cleared ? GLASS_COLOR.sub : GLASS_COLOR.text, S(100));
      this.renderGlassRewards(panel, 'LobbyRaidInfoFirst', selected.firstClearRewards, [1465, 1633], 629, selected.cleared, FX, FY, S, T);
      if (selected.cleared) {
        T(panel, 'LobbyRaidInfoFirstClaimed', '已领取', FX(1790), FY(629), 21, GLASS_COLOR.sub, S(110), HorizontalTextAlignment.RIGHT);
      }
      line('LobbyRaidInfoDiv4', 658);
    }
    mountGlassButton(kit, panel, 'LobbyRaidStartButton', selected.unlocked ? '掠夺' : '未解锁', FX(1540), FY(707.5), S(424), S(61), k,
      selected.unlocked ? 'primary' : 'disabled', selected.unlocked ? () => this.host.startLobbyRaidBattle(selected.stageCode) : undefined, 30);
    T(panel, 'LobbyRaidInfoNote', selected.unlocked ? `消耗体力 ${selected.staminaCost}(胜利才扣)` : '先掠夺上一座矿', FX(1540), FY(764), 22, GLASS_COLOR.sub, S(480), HorizontalTextAlignment.CENTER);
  }

  /** 奖励行:图标中心 xs[i](原型 46 见方)+「×N」紧跟右侧;点图标或数量弹详情卡。 */
  private renderGlassRewards(panel: Node, prefix: string, rewards: PlayerBattleRewardItemVO[], xs: number[], y: number, dimmed: boolean,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, T: GlassT): void {
    rewards.slice(0, xs.length).forEach((reward, index) => {
      const x = FX(xs[index]);
      const size = S(46);
      const asset = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
      const sprite = asset ? this.host.addSprite(`${prefix}Icon_${index}`, asset, x, FY(y), size, size, panel) : null;
      if (sprite && dimmed) {
        sprite.grayscale = true;
        sprite.node.addComponent(UIOpacity).opacity = 150;
      } else if (!sprite) {
        T(panel, `${prefix}Txt_${index}`, (reward.resourceName || reward.resourceCode).slice(0, 1), x, FY(y), 22, GLASS_COLOR.champagne, size, HorizontalTextAlignment.CENTER);
      }
      T(panel, `${prefix}Amount_${index}`, `×${fmt(reward.amount)}`, x + size / 2 + S(15), FY(y), 23, dimmed ? GLASS_COLOR.sub : GLASS_COLOR.text, S(110));
      const hitW = size + S(15) + S(90);
      const hit = this.host.addChildPlainNode(panel, `${prefix}Hit_${index}`, x - size / 2 + hitW / 2, FY(y), hitW, Math.max(size, S(56)));
      hit.on(Node.EventType.TOUCH_END, () => this.toggleRewardTip(panel, reward, asset, x, FY(y), size, S, T), this);
    });
  }

  private rewardTipKey = '';

  /** 奖励详情卡(B 玻璃):图标 + 名称 + 类型·数量 + 用途;放在图标上方(放不下就下方)并夹在面板内,底下铺一层透明点击层负责收起。 */
  private toggleRewardTip(panel: Node, reward: PlayerBattleRewardItemVO, asset: string | null, x: number, y: number, size: number,
    S: (v: number) => number, T: GlassT): void {
    const kit = this.host as unknown as UiKitHost;
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
    const cw = S(440);
    const ch = S(180);
    const cx = Math.max(-pw / 2 + cw / 2 + S(10), Math.min(pw / 2 - cw / 2 - S(10), x));
    const above = y + size / 2 + ch / 2 + S(14);
    const cy = above + ch / 2 > ph / 2 - S(10) ? y - size / 2 - ch / 2 - S(14) : above;
    const card = this.host.addChildPlainNode(panel, 'LobbyRaidRewardTip', cx, cy, cw, ch);
    card.addComponent(BlockInputEvents);
    card.on(Node.EventType.TOUCH_END, () => this.closeRewardTip(panel), this);
    // 底色要完全不透:先垫一层实心圆角底再贴玻璃(单层在原生端会透出下面的字)
    const solid = this.host.addChildPlainNode(card, 'Solid', 0, 0, cw, ch).addComponent(Graphics);
    solid.fillColor = rgba(16, 19, 25, 255);
    solid.roundRect(-cw / 2 + S(2), -ch / 2 + S(2), cw - S(4), ch - S(4), S(12));
    solid.fill();
    mountGlassSlice(kit, card, 'Glass', GLASS_SLICES.panel, 0, 0, cw, ch, S(1));
    const iconSize = S(76);
    const iconX = -cw / 2 + S(24) + iconSize / 2;
    const iconY = ch / 2 - S(18) - iconSize / 2;
    if (!asset || !this.host.addSprite('Icon', asset, iconX, iconY, iconSize, iconSize, card)) {
      T(card, 'IconTxt', (reward.resourceName || reward.resourceCode).slice(0, 1), iconX, iconY, 36, GLASS_COLOR.champagne, iconSize, HorizontalTextAlignment.CENTER);
    }
    const textX = iconX + iconSize / 2 + S(16);
    const textW = cw / 2 - S(18) - textX;
    T(card, 'Name', reward.resourceName || reward.resourceCode, textX, iconY + S(16), 26, GLASS_COLOR.text, textW, HorizontalTextAlignment.LEFT, true);
    T(card, 'Meta', `${rewardTypeLabel(reward.resourceType)} · 数量 ×${fmt(reward.amount)}`, textX, iconY - S(20), 20, GLASS_COLOR.sub, textW);
    // LEFT 对齐的 x 是左沿
    const desc = this.host.addChildLabel(card, 'Desc', rewardDescLine(reward.resourceCode), -cw / 2 + S(22), -ch / 2 + S(40), S(19), GLASS_COLOR.sub, new Size(cw - S(44), S(60)), HorizontalTextAlignment.LEFT);
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

  /** 绿色勾章(已完成):绿圆 + 白勾。 */
  private mountCheckBadge(parent: Node, name: string, x: number, y: number, size: number): void {
    const node = this.host.addChildPlainNode(parent, name, x, y, size, size);
    const g = node.addComponent(Graphics);
    const r = size / 2;
    g.fillColor = rgba(70, 168, 92, 255);
    g.circle(0, 0, r);
    g.fill();
    g.strokeColor = rgba(240, 255, 240, 255);
    g.lineWidth = Math.max(1.5, size * 0.12);
    g.lineCap = Graphics.LineCap.ROUND;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.moveTo(-r * 0.42, 0);
    g.lineTo(-r * 0.1, -r * 0.32);
    g.lineTo(r * 0.45, r * 0.3);
    g.stroke();
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
