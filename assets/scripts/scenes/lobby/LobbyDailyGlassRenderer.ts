import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Size, UITransform, Vec3 } from 'cc';
import type { UiKitHost } from '../UiKit';
import {
  glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassFrame, mountGlassLine, mountGlassPanel,
  mountGlassSlice, mountGlassTopBar,
} from '../UiGlassKit';
import { mountCoverArt } from './HeroHeadCrop';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import type { DailyDungeonRewardVO, DailyDungeonThemeVO, DailyDungeonTierVO, LobbyDailyDungeonPanelState, TrialTierVO } from '../../types/DailyDungeonTypes';
import type { LobbyDailyDungeonPanelHost as BaseHost } from './LobbyDailyDungeonPanelRenderer';

type LobbyDailyDungeonPanelHost = BaseHost & { formatInteger(value: number | null | undefined): string };

const BG = 'ui/common/ref/hall_bg_glass/spriteFrame';
const STAMINA_ICON = 'ui/bag/ai/icon_stamina/spriteFrame';
const CRYSTAL_ICON = 'ui/bag/ai/icon_sacred_crystal/spriteFrame';
const ICON = (name: string): string => `ui/glass/${name}/spriteFrame`;
const WEEKDAY = ['', '一', '二', '三', '四', '五', '六', '日'];
const TIER_TABS = ['Ⅰ 普通', 'Ⅱ 困难', 'Ⅲ 输出试炼'];
/** 主题场景图(同旧页);横幅 / 缩略图都按 cover 裁切。 */
const THEME_SCENE: Array<{ keyword: string; asset: string; drop: string }> = [
  { keyword: 'AWAKEN', asset: 'ui/daily/ai/scene_awaken/spriteFrame', drop: '掉落觉醒材料' },
  { keyword: 'FORGE', asset: 'ui/daily/ai/scene_forge/spriteFrame', drop: '掉落强化材料' },
  { keyword: 'ARCANE', asset: 'ui/daily/ai/scene_arcane/spriteFrame', drop: '掉落宝石与洗练材料' },
  { keyword: 'ABYSS', asset: 'ui/daily/ai/scene_abyss/spriteFrame', drop: '掉落终极技能材料' },
];
const sceneOf = (code: string): { asset: string; drop: string } | null => THEME_SCENE.find((entry) => (code || '').toUpperCase().includes(entry.keyword)) ?? null;

/** 旧渲染器上的实例态 / 弹窗(输出榜、帮助)转给 B 风格页用。 */
export interface LobbyDailyGlassOwner {
  selectedTier(themeCode: string): number;
  setSelectedTier(themeCode: string, tier: number): void;
  rankOpen(): boolean;
  openRank(): void;
  renderRankPopup(panel: Node, width: number, height: number, scale: number): void;
  helpText(state: LobbyDailyDungeonPanelState): string;
  crystalLine(state: LobbyDailyDungeonPanelState): string;
}

type TFn = (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label;

/**
 * 每日副本 B 风格重设计(11-02 用户确认原型 周报截图/2026-11-01_B风格补全/proto/daily_b3_t1.png / daily_b3_t3.png):
 * 左栏 4 张副本卡(场景缩略图 + 名字 + 开放日 + 今日状态,选中暗金);右栏横幅 + 难度页签(Ⅰ 普通 / Ⅱ 困难 / Ⅲ 输出试炼)。
 * 页签只切下面内容:Ⅰ / Ⅱ = 通关奖励 + 解锁条件;Ⅲ = 输出奖励阶梯(输出分 → 矿晶 + 材料)。底部矿晶说明 + 挑战(体力)。
 * 顶栏:< 每日副本 ? / 守卫战 · 输出榜 · 体力 / ✕。坐标按原型 1870×841(FX / FY 以舞台中心为原点)。
 */
export class LobbyDailyGlassRenderer {
  private selectedTheme: string | null = null;
  private helpOpen = false;

  private readonly host: LobbyDailyDungeonPanelHost;

  constructor(host: BaseHost, private readonly owner: LobbyDailyGlassOwner) {
    this.host = host as LobbyDailyDungeonPanelHost;
  }

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyDailyDungeonState();
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelW = layout.stageWidth;
    const panelH = layout.stageHeight;
    const { k, FX, FY, S } = glassProtoMap(panelW, panelH);
    const kit = this.host as unknown as UiKitHost;
    const T: TFn = (parent, name, text, x, y, size, color, w, align = HorizontalTextAlignment.LEFT, bold = false) => {
      const label = glassLabel(kit, parent, name, text, x, y, S(size), color, w, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };

    const dim = this.host.createUiNode('LobbyDailyDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    dim.addComponent(BlockInputEvents);
    const group = this.host.createUiNode('LobbyDailySceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelW, panelH));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(group, 'Frame', 0, 0, panelW, panelH);
    const coverW = layout.width + Math.abs(centerX) * 2;
    const coverH = layout.height + Math.abs(centerY) * 2;
    const bgW = Math.max(coverW, coverH * (1870 / 841));
    this.host.addSprite('LobbyDailyGlassBg', BG, 0, 0, bgW, bgW / (1870 / 841), panel);

    const profile = this.host.currentLobbyProfile?.();
    const close = (): void => this.host.closeLobbyDailyDungeonPanel();
    mountGlassTopBar(kit, panel, 'LobbyDaily', panelW, panelH, '每日副本',
      profile ? [{ key: 'stamina', icon: STAMINA_ICON, value: `${profile.stamina}/${profile.maxStamina}`, width: 190 }] : [],
      close, close, { chipRight: 1700, onHelp: () => { this.helpOpen = !this.helpOpen; this.host.refreshLobbyDailyDungeonPanel(); } });
    // 顶栏次按钮:输出榜(右)、特殊玩法守卫战(左)
    mountGlassButton(kit, panel, 'LobbyDailyRank', '输出榜', FX(1390), FY(44), S(150), S(44), k, 'secondary', () => this.owner.openRank(), 21);
    if (this.host.openLobbySpecialGuardBattle) {
      mountGlassButton(kit, panel, 'LobbyDailySpecialGuard', '守卫战', FX(1220), FY(44), S(150), S(44), k, 'secondary', () => this.host.openLobbySpecialGuardBattle?.(), 21);
    }

    const summary = state.summary;
    if (!summary) {
      T(panel, 'Loading', state.error ? `读取失败:${state.error}` : '副本读取中…', FX(935), FY(450), 24, state.error ? GLASS_COLOR.red : GLASS_COLOR.sub, S(800), HorizontalTextAlignment.CENTER);
      if (state.error) {
        mountGlassButton(kit, panel, 'Retry', '重试', FX(935), FY(520), S(180), S(52), k, 'secondary', () => this.host.reloadLobbyDailyDungeonSummary(), 22);
      }
      return;
    }
    const themes = summary.themes;
    const theme = themes.find((item) => item.code === this.selectedTheme) ?? themes.find((item) => item.openToday) ?? themes[0];
    if (!theme) {
      return;
    }
    this.selectedTheme = theme.code;
    this.renderList(panel, themes, theme, FX, FY, S, k, T);
    this.renderDetail(panel, state, theme, summary.staminaCost, FX, FY, S, k, T);
    if (this.owner.rankOpen()) {
      this.owner.renderRankPopup(panel, panelW, panelH, Math.max(0.68, Math.min(1, layout.uiScale)));
    }
    if (this.helpOpen) {
      this.renderHelp(panel, this.owner.helpText(state), FX, FY, S, k, T);
    }
  }

  /** 左栏副本卡 47..571,卡高 166 / 步 182(首卡顶 96);缩略图 59..331 × 卡顶 +11..+155;名字左沿 353 @ +42、开放日 @ +86、状态签 354..537 @ +128。 */
  private renderList(panel: Node, themes: DailyDungeonThemeVO[], selected: DailyDungeonThemeVO, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    themes.slice(0, 4).forEach((theme, index) => {
      const top = 96 + index * 182;
      const on = theme.code === selected.code;
      const card = this.host.addChildPlainNode(panel, `Theme_${theme.code}`, FX(309), FY(top + 83), S(524), S(166));
      mountGlassSlice(kit, card, 'Bg', on ? GLASS_SLICES.panelSel : GLASS_SLICES.panel, 0, 0, S(524), S(166), k);
      const left = -S(524) / 2;
      const thumb = this.host.addChildPlainNode(card, 'Thumb', left + S(12 + 136), 0, S(272), S(144));
      thumb.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      const scene = sceneOf(theme.code);
      if (scene) {
        mountCoverArt(thumb, scene.asset, S(272), S(144));
      }
      if (!theme.openToday) {
        this.veil(thumb, S(272), S(144), 150);
      }
      T(card, 'Name', theme.name, left + S(306), S(41), 32, theme.openToday ? GLASS_COLOR.text : GLASS_COLOR.sub, S(210), HorizontalTextAlignment.LEFT, true);
      T(card, 'Days', theme.openDays.map((day) => WEEKDAY[day] ?? '').map((d, i) => (i === 0 ? `周${d}` : d)).join(' / '), left + S(306), -S(3), 22, GLASS_COLOR.sub, S(210));
      const tagText = theme.openToday ? `今日开放 · ${theme.usedToday}/${theme.timesPerDay}` : '今日未开放';
      this.tag(card, tagText, left + S(398), -S(45), S(184), S(38), theme.openToday ? 'green' : 'grey', S, k, T);
      if (!on) {
        card.addComponent(Button);
        card.on(Button.EventType.CLICK, () => { this.selectedTheme = theme.code; this.host.refreshLobbyDailyDungeonPanel(); }, this);
        this.host.applyImageButtonFeedback(card, 1.015, 0.985);
      }
    });
  }

  /** 右栏 592..1830 × 84..810:横幅 610..1812 × 101..298;页签 @ 343;分割线 390;内容区 400..690;底部矿晶说明 @ 744 + 挑战 (1638,733)。 */
  private renderDetail(panel: Node, state: LobbyDailyDungeonPanelState, theme: DailyDungeonThemeVO, staminaCost: number,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'Detail', FX(1211), FY(447), S(1238), S(726), k);
    // 横幅
    const banner = this.host.addChildPlainNode(panel, 'Banner', FX(1211), FY(199.5), S(1202), S(197));
    banner.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const scene = sceneOf(theme.code);
    if (scene) {
      mountCoverArt(banner, scene.asset, S(1202), S(197));
    }
    // 左侧压暗承托标题
    const shade = this.host.addChildPlainNode(banner, 'Shade', 0, 0, S(1202), S(197));
    const sg = shade.addComponent(Graphics);
    const steps = 12;
    for (let i = 0; i < steps; i += 1) {
      sg.fillColor = rgba(10, 12, 18, Math.round(190 * (1 - i / steps)));
      sg.rect(-S(601) + (S(700) * i) / steps, -S(98.5), S(700) / steps + 1, S(197));
      sg.fill();
    }
    if (!theme.openToday) {
      this.veil(banner, S(1202), S(197), 110);
    }
    T(panel, 'BannerTitle', theme.name, FX(647), FY(215), 48, GLASS_COLOR.text, S(600), HorizontalTextAlignment.LEFT, true);
    const days = theme.openDays.map((day) => WEEKDAY[day] ?? '').map((d, i) => (i === 0 ? `周${d}` : d)).join(' / ');
    T(panel, 'BannerSub', `${scene?.drop ?? '掉落养成材料'} · ${days}开放`, FX(647), FY(267), 23, new Color(214, 218, 226, 255), S(700));

    // 难度页签 + 今日次数
    const tierIndex = Math.min(theme.tiers.length, Math.max(1, this.owner.selectedTier(theme.code)));
    const tabs: Array<[number, number]> = [[625, 868], [884, 1127], [1141, 1400]];
    theme.tiers.slice(0, 3).forEach((tier, index) => {
      const [x0, x1] = tabs[index];
      const on = tier.tier === tierIndex;
      const node = this.host.addChildPlainNode(panel, `Tier_${tier.tier}`, FX((x0 + x1) / 2), FY(343), S(x1 - x0), S(52));
      mountGlassSlice(kit, node, 'Bg', on ? GLASS_SLICES.pillGold : GLASS_SLICES.pillSecondary, 0, 0, S(x1 - x0), S(52), k * 0.8);
      T(node, 'Label', TIER_TABS[index] ?? `难度 ${tier.tier}`, 0, 0, 23, on ? GLASS_COLOR.onGold : (tier.unlocked ? GLASS_COLOR.text : GLASS_COLOR.dim), S(x1 - x0 - 24), HorizontalTextAlignment.CENTER, on);
      if (!tier.unlocked) {
        this.host.addSprite('Lock', GLASS_ICON.lock, S(x1 - x0) / 2 - S(26), 0, S(22), S(22), node);
      }
      if (!on) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => { this.owner.setSelectedTier(theme.code, tier.tier); this.host.refreshLobbyDailyDungeonPanel(); }, this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
    mountGlassLine(kit, panel, 'CountSep', FX(1620), FY(343), Math.max(1, S(2)), S(36), new Color(120, 128, 140, 200));
    T(panel, 'Count', `今日次数 ${theme.usedToday}/${theme.timesPerDay}`, FX(1785), FY(343), 22, GLASS_COLOR.sub, S(200), HorizontalTextAlignment.RIGHT);
    mountGlassLine(kit, panel, 'TabLine', FX(1212), FY(390), S(1168), Math.max(1, S(1)), new Color(255, 255, 255, 20));

    const tier = theme.tiers.find((item) => item.tier === tierIndex) ?? theme.tiers[0];
    if (tier && tier.outputTiers.length > 0) {
      this.renderTrial(panel, tier.outputTiers, FX, FY, S, k, T);
    } else if (tier) {
      this.renderRewards(panel, tier, FX, FY, S, k, T);
    }

    // 底部:矿晶说明 + 挑战
    this.host.addSprite('CrystalIcon', CRYSTAL_ICON, FX(650), FY(744), S(34), S(34), panel);
    T(panel, 'CrystalLine', this.owner.crystalLine(state), FX(680), FY(744), 21, GLASS_COLOR.sub, S(760));
    const exhausted = theme.usedToday >= theme.timesPerDay;
    let label = '挑战';
    let enabled = true;
    if (!theme.openToday) {
      label = '今日未开放';
      enabled = false;
    } else if (tier && !tier.unlocked) {
      label = tier.unlockLevel > 0 ? `玩家等级 Lv.${tier.unlockLevel} 解锁` : '未解锁';
      enabled = false;
    } else if (exhausted) {
      label = '今日次数已用完';
      enabled = false;
    }
    mountGlassButton(kit, panel, 'Challenge', label, FX(1638), FY(733), S(316), S(60), k, enabled ? 'primary' : 'disabled',
      () => tier && this.host.startLobbyDailyDungeonBattle(tier.stageCode), enabled ? 28 : 22);
    T(panel, 'StaminaCost', `消耗体力 ${staminaCost}`, FX(1638), FY(782), 20, GLASS_COLOR.sub, S(300), HorizontalTextAlignment.CENTER);
  }

  /** Ⅰ / Ⅱ:「通关奖励」(说明右对齐)+ 奖励格(步 185)+「难度说明」两行(解锁条件 / 计次规则)。 */
  private renderRewards(panel: Node, tier: DailyDungeonTierVO, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    this.section(panel, 'Reward', '通关奖励', FX(631), FY(409), S, T);
    T(panel, 'RewardNote', '胜利即得,每次固定', FX(1795), FY(413), 21, GLASS_COLOR.sub, S(400), HorizontalTextAlignment.RIGHT);
    tier.rewards.slice(0, 5).forEach((reward, index) => this.rewardSlot(panel, `Reward_${index}`, reward, FX(696) + index * S(185), FY(484), S(83), S, k, T));
    mountGlassLine(kit, panel, 'RewardLine', FX(1212), FY(553), S(1168), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    this.section(panel, 'Rule', '难度说明', FX(631), FY(595), S, T);
    const unlockText = tier.unlockLevel > 0 ? `玩家等级 Lv.${tier.unlockLevel} 解锁` : '已开放';
    const rows: Array<[string, string, Color]> = [
      [tier.unlocked ? '✓' : '·', tier.unlocked ? unlockText : `${unlockText}(未达到)`, tier.unlocked ? GLASS_COLOR.text : GLASS_COLOR.red],
      ['·', '胜利才计入当日次数,失败不扣次数', GLASS_COLOR.sub],
    ];
    rows.forEach(([mark, text, color], index) => {
      T(panel, `RuleMark_${index}`, mark, FX(668), FY(648 + index * 52), 24, index === 0 && tier.unlocked ? GLASS_COLOR.champagne : GLASS_COLOR.sub, S(30), HorizontalTextAlignment.CENTER, true);
      T(panel, `RuleText_${index}`, text, FX(702), FY(648 + index * 52), 22, color, S(900));
    });
  }

  /** Ⅲ:「输出奖励」+ 说明;阶梯每档一行(输出 ≥ 分 → 矿晶 × N + 附加材料),档名标在右端。 */
  private renderTrial(panel: Node, tiers: TrialTierVO[], FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    this.section(panel, 'Trial', '输出奖励', FX(631), FY(409), S, T);
    T(panel, 'TrialNote', '限时 90 秒挑战巨型 BOSS,按打出的总输出落档领奖', FX(810), FY(409), 21, GLASS_COLOR.sub, S(900));
    const rows = [...tiers].sort((a, b) => a.minScore - b.minScore).slice(0, 5);
    const rowH = S(50);
    const step = 58;
    rows.forEach((row, index) => {
      const y = FY(456 + index * step);
      const node = this.host.addChildPlainNode(panel, `TrialRow_${index}`, FX(1214), y, S(1164), rowH);
      mountGlassSlice(kit, node, 'Bg', GLASS_SLICES.panel, 0, 0, S(1164), rowH, k);
      const left = -S(1164) / 2;
      const icon = this.host.addSprite('Icon', ICON('profile_swords'), left + S(50), 0, S(28), S(28), node);
      if (icon) {
        icon.color = new Color(214, 180, 116, 255);
      }
      T(node, 'Score', `输出 ≥ ${this.host.formatInteger(row.minScore)}`, left + S(86), 0, 23, GLASS_COLOR.text, S(260));
      T(node, 'Arrow', '→', left + S(370), 0, 24, GLASS_COLOR.sub, S(40), HorizontalTextAlignment.CENTER);
      this.inlineReward(node, 'Crystal', CRYSTAL_ICON, row.crystalAmount, left + S(470), S, k, T);
      if (row.bonusCode && row.bonusAmount) {
        this.inlineReward(node, 'Bonus', resolveBagStyleItemIconAsset(row.bonusCode, 'ITEM') ?? '', row.bonusAmount, left + S(670), S, k, T, row.bonusName ?? '');
      }
      if (row.tierName) {
        T(node, 'TierName', row.tierName, S(1164) / 2 - S(26), 0, 20, GLASS_COLOR.sub, S(180), HorizontalTextAlignment.RIGHT);
      }
    });
  }

  private inlineReward(parent: Node, name: string, icon: string, amount: number, x: number, S: (v: number) => number, k: number, T: TFn, fallback = ''): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassFrame(kit, parent, `${name}Frame`, x, 0, S(42), S(42), k);
    if (!icon || !this.host.addSprite(`${name}Icon`, icon, x, 0, S(34), S(34), parent)) {
      T(parent, `${name}Name`, fallback.slice(0, 2), x, 0, 15, GLASS_COLOR.text, S(42), HorizontalTextAlignment.CENTER);
    }
    T(parent, `${name}Amount`, `×${this.host.formatInteger(amount)}`, x + S(32), 0, 22, GLASS_COLOR.text, S(120));
  }

  private rewardSlot(parent: Node, name: string, reward: DailyDungeonRewardVO, x: number, y: number, size: number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassFrame(kit, parent, `${name}Frame`, x, y, size, size, k);
    const icon = resolveBagStyleItemIconAsset(reward.resourceCode, reward.resourceType);
    if (!icon || !this.host.addSprite(`${name}Icon`, icon, x, y, size * 0.8, size * 0.8, parent)) {
      T(parent, `${name}Name`, (reward.resourceName || '').slice(0, 2), x, y, 17, GLASS_COLOR.text, size, HorizontalTextAlignment.CENTER);
    }
    T(parent, `${name}Amount`, `×${this.host.formatInteger(reward.amount)}`, x + size / 2 + S(12), y, 24, GLASS_COLOR.text, S(110));
  }

  private section(parent: Node, name: string, title: string, x: number, y: number, S: (v: number) => number, T: TFn): void {
    this.host.addSprite(`${name}Bar`, GLASS_ICON.accent, x, y, S(6), S(30), parent);
    T(parent, `${name}Title`, title, x + S(21), y, 26, GLASS_COLOR.text, S(240), HorizontalTextAlignment.LEFT, true);
  }

  /** 状态签:green = 暗绿底绿字(今日开放),grey = 玻璃灰字。x 为签中心。 */
  private tag(parent: Node, text: string, x: number, y: number, w: number, h: number, tone: 'green' | 'grey', S: (v: number) => number, k: number, T: TFn): void {
    const node = this.host.addChildPlainNode(parent, 'Tag', x, y, w, h);
    if (tone === 'green') {
      const g = node.addComponent(Graphics);
      g.fillColor = new Color(29, 48, 41, 240);
      g.roundRect(-w / 2, -h / 2, w, h, h / 2);
      g.fill();
      g.strokeColor = new Color(96, 128, 100, 230);
      g.lineWidth = Math.max(1, S(1.4));
      g.roundRect(-w / 2, -h / 2, w, h, h / 2);
      g.stroke();
    } else {
      mountGlassSlice(this.host as unknown as UiKitHost, node, 'Bg', GLASS_SLICES.pillSecondary, 0, 0, w, h, k * 0.7);
    }
    T(node, 'Text', text, 0, 0, 20, tone === 'green' ? new Color(150, 214, 166, 255) : GLASS_COLOR.sub, w - S(16), HorizontalTextAlignment.CENTER).enableShadow = false;
  }

  private veil(parent: Node, w: number, h: number, alpha: number): void {
    const node = this.host.addChildPlainNode(parent, 'Veil', 0, 0, w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(10, 12, 18, alpha);
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
  }

  private renderHelp(panel: Node, text: string, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    const cover = this.host.addChildPlainNode(panel, 'HelpCover', 0, 0, S(1870 * 2), S(841 * 2));
    cover.addComponent(BlockInputEvents);
    cover.addComponent(Button);
    cover.on(Button.EventType.CLICK, () => { this.helpOpen = false; this.host.refreshLobbyDailyDungeonPanel(); }, this);
    const w = S(640);
    const h = S(300);
    const box = this.host.addChildPlainNode(panel, 'HelpBox', FX(420), FY(250), w, h);
    mountGlassSlice(kit, box, 'Base', GLASS_SLICES.panel, 0, 0, w, h, k);
    mountGlassSlice(kit, box, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, k);
    const label = T(box, 'Text', text, 0, 0, 20, GLASS_COLOR.text, w - S(56));
    label.overflow = Label.Overflow.CLAMP;
    label.enableWrapText = true;
    label.lineHeight = Math.round(label.fontSize * 1.55);
    label.node.getComponent(UITransform)?.setContentSize(w - S(56), h - S(40));
  }
}
