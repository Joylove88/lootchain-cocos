import { BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, ScrollView, Size, UITransform, Vec2, Vec3 } from 'cc';
import type { UiKitHost } from '../UiKit';
import {
  glassLabel, glassProtoMap, GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassCheckbox, mountGlassFrame,
  mountGlassLine, mountGlassPanel, mountGlassScrollBar, mountGlassSlice, mountGlassTopBar,
} from '../UiGlassKit';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { mountCoverArt, mountHeroAvatar, resolveHeroRosterArtPath } from './HeroHeadCrop';
import type { LobbyCodexItemVO, LobbyCodexMilestoneVO, LobbyCodexPanelState, LobbyCodexRarityFilter } from '../../types/LobbyCodexTypes';
import type { QuestRewardItemVO } from '../../types/QuestTypes';
import type { LobbyCodexPanelHost } from './LobbyCodexPanelRenderer';

/** 页面背景(同任务 / 背包 B 风格整页)。 */
const CODEX_GLASS_BG = 'ui/common/ref/hall_bg_glass/spriteFrame';
const ICON = (name: string): string => `ui/glass/${name}/spriteFrame`;
const FILTERS: Array<{ key: LobbyCodexRarityFilter; text: string; icon: string }> = [
  { key: 'ALL', text: '全部', icon: ICON('codex_all') },
  { key: 'UR', text: 'UR', icon: ICON('codex_ur') },
  { key: 'SSR', text: 'SSR', icon: ICON('codex_ssr') },
  { key: 'SR', text: 'SR', icon: ICON('codex_sr') },
  { key: 'R', text: 'R', icon: ICON('codex_r') },
];
/** 稀有度小签底色(扁平,不发光)。 */
const RARITY_TAG: Record<string, Color> = {
  UR: new Color(168, 58, 52, 235),
  SSR: new Color(176, 112, 40, 235),
  SR: new Color(104, 70, 150, 235),
  R: new Color(58, 82, 116, 235),
};
/** 策划内部定位词不给玩家看(「过渡」= 前期过渡卡)。 */
const HIDDEN_ROLE_DESC = new Set(['过渡']);
const HELP_TEXT = '首次获得一位英雄即完成收录,选中英雄可领取一次性收录奖励(按稀有度)。\n\n收录数达到 5 / 10 / 15 / 22 时,底部进度条上的宝箱可以打开领取里程碑奖励。\n\n未收集的英雄可直接前往召唤获得。';

export interface LobbyCodexGlassHost extends LobbyCodexPanelHost {
  spawnRewardFloats(messages: string[]): void;
  formatInteger(value: number | null | undefined): string;
  /** 只重绘图鉴页(不重拉数据)。 */
  rerenderLobbyCodex(): void;
}

type TFn = (p: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align?: HorizontalTextAlignment, bold?: boolean) => Label;

/**
 * 图鉴 B 风格重设计(11-02 用户「布局不好看,重新设计」→ 确认原型 周报截图/2026-11-01_B风格补全/proto/codex_b3.png):
 * 顶栏(< 图鉴 ? / 一键领取 + 角标 / ✕);左栏稀有度筛选(收集数 + 细进度线,选中暗金)+ 仅看未收集;
 * 中间头像格 5 列(稀有度签 / 未领红点 / 未收集压暗加锁,选中暗金描边);右栏选中英雄详情(半身卡面 + 名字 + 职业阵营 + 定位 + 收录奖励 + 领取);
 * 底条收集进度 + 5 / 10 / 15 / 22 宝箱(可领直接领,其余点开看奖励)。坐标按原型 1870×841 映射(FX / FY 以舞台中心为原点)。
 */
export class LobbyCodexGlassRenderer {
  private helpOpen = false;

  constructor(private readonly host: LobbyCodexGlassHost, private readonly assets: { reward: Record<string, string>; chest: { locked: string; ready: string; opened: string } }) {}

  render(layout: UiLayout): void {
    const state = this.host.currentLobbyCodexState();
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const panelW = layout.stageWidth;
    const panelH = layout.stageHeight;
    const { k, FX, FY, S } = glassProtoMap(panelW, panelH);
    const T: TFn = (parent, name, text, x, y, size, color, w, align = HorizontalTextAlignment.LEFT, bold = false) => {
      const label = glassLabel(this.host as unknown as UiKitHost, parent, name, text, x, y, S(size), color, w, align, bold);
      label.fontSize = Math.max(12, Math.round(S(size)));
      label.lineHeight = label.fontSize + 4;
      return label;
    };
    const kit = this.host as unknown as UiKitHost;

    const dim = this.host.createUiNode('LobbyCodexDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    dim.addComponent(BlockInputEvents);
    const group = this.host.createUiNode('LobbyCodexSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelW, panelH));
    group.addComponent(BlockInputEvents);
    const panel = this.host.addChildPlainNode(group, 'Frame', 0, 0, panelW, panelH);
    const coverW = layout.width + Math.abs(centerX) * 2;
    const coverH = layout.height + Math.abs(centerY) * 2;
    const bgW = Math.max(coverW, coverH * (1870 / 841));
    this.host.addSprite('LobbyCodexGlassBg', CODEX_GLASS_BG, 0, 0, bgW, bgW / (1870 / 841), panel);

    const close = (): void => this.host.closeLobbyCodexPanel();
    mountGlassTopBar(kit, panel, 'LobbyCodex', panelW, panelH, '图鉴', [], close, close, { onHelp: () => { this.helpOpen = !this.helpOpen; this.host.rerenderLobbyCodex(); } });
    this.renderClaimAll(panel, state, FX, FY, S, k, T);

    if (state.loading && state.items.length === 0) {
      T(panel, 'Loading', '图鉴读取中…', FX(935), FY(450), 24, GLASS_COLOR.sub, S(400), HorizontalTextAlignment.CENTER);
      return;
    }
    const items = this.visibleItems(state);
    // 选中:点过的英雄;被筛选隐藏时落到当前列表第一位
    const selected = items.find((item) => item.heroCode === state.selectedHeroCode) ?? items[0] ?? null;
    this.renderRail(panel, state, FX, FY, S, k, T);
    this.renderGrid(panel, state, items, selected, FX, FY, S, k, T);
    this.renderProgress(panel, state, FX, FY, S, k, T);
    this.renderDetail(panel, state, selected, FX, FY, S, k, T);
    if (state.error) {
      T(panel, 'Error', '图鉴暂不可用,请稍后重试', FX(786), FY(380), 22, GLASS_COLOR.red, S(600), HorizontalTextAlignment.CENTER);
    }
    // 领取成功:飘出本次奖励(B 风格页不再播旧金框特效)
    const fx = state.claimFx;
    if (fx) {
      const lines = fx.rewards.map((item) => `${item.name} ×${this.host.formatInteger(item.amount)}`);
      this.host.spawnRewardFloats(['领取成功', ...lines]);
      this.host.acknowledgeLobbyCodexClaimFx();
    }
    if (this.helpOpen) {
      this.renderHelp(panel, FX, FY, S, k, T);
    }
  }

  private visibleItems(state: LobbyCodexPanelState): LobbyCodexItemVO[] {
    return state.items.filter((item) => (state.filter === 'ALL' || item.rarity.toUpperCase() === state.filter) && !(state.unownedOnly && item.owned));
  }

  /** 顶栏右侧「一键领取」主按钮 1505..1703 @ 46 + 红色数量角标;没有可领时灰色「暂无可领」。 */
  private renderClaimAll(panel: Node, state: LobbyCodexPanelState, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    if (!state.loaded) {
      return;
    }
    const kit = this.host as unknown as UiKitHost;
    const claimable = state.claimableCount > 0;
    const busy = state.claiming !== null;
    // 「一键领取」与 ✕ 之间的竖分割线(原型 x 1743;顶栏没有货币胶囊时 mountGlassTopBar 不画)
    const divider = this.host.addSprite('LobbyCodexGlassDivider', GLASS_ICON.divider, FX(1743), FY(44), S(36), S(2), panel);
    if (divider) {
      divider.node.angle = 90;
    }
    const btn = mountGlassButton(kit, panel, 'LobbyCodexClaimAll', claimable ? '一键领取' : '暂无可领', FX(1604), FY(46), S(198), S(48), k,
      claimable && !busy ? 'primary' : 'disabled', () => this.host.claimAllLobbyCodexRewards(), 22);
    if (claimable) {
      const text = state.claimableCount > 99 ? '99+' : String(state.claimableCount);
      const h = S(30);
      const w = Math.max(h, S(14) + text.length * S(12));
      const badge = this.host.addChildPlainNode(btn, 'Badge', S(99) - w / 2 + S(6), S(20), w, h);
      const g = badge.addComponent(Graphics);
      g.fillColor = rgba(214, 52, 44, 255);
      g.roundRect(-w / 2, -h / 2, w, h, h / 2);
      g.fill();
      T(badge, 'Text', text, 0, 0, 18, new Color(255, 250, 240, 255), w, HorizontalTextAlignment.CENTER, true).enableShadow = false;
    }
  }

  /** 左栏 53..317 × 90..808:筛选行 64..315,行高 85 / 步 98(首行顶 115);图标 x 104、文字左沿 139、计数右沿 265、细进度线 140..265 @ +22;勾选框 (102,732)。 */
  private renderRail(panel: Node, state: LobbyCodexPanelState, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'Rail', FX(185), FY(449), S(264), S(718), k);
    FILTERS.forEach((filter, index) => {
      const pool = filter.key === 'ALL' ? state.items : state.items.filter((item) => item.rarity.toUpperCase() === filter.key);
      const owned = pool.filter((item) => item.owned).length;
      const on = state.filter === filter.key;
      const cy = 157.5 + index * 98;
      const row = this.host.addChildPlainNode(panel, `Filter_${filter.key}`, FX(189.5), FY(cy), S(251), S(85));
      if (on) {
        mountGlassSlice(kit, row, 'Bg', GLASS_SLICES.tabGold, 0, 0, S(251), S(85), k);
      }
      const left = -S(251) / 2;
      const icon = this.host.addSprite('Icon', filter.icon, left + S(40), 0, S(40), S(40), row);
      if (icon) {
        icon.color = on ? new Color(250, 236, 206, 255) : new Color(196, 202, 214, 255);
      }
      T(row, 'Name', filter.text, left + S(75), S(4), 24, on ? GLASS_COLOR.onGold : GLASS_COLOR.text, S(110), HorizontalTextAlignment.LEFT, on);
      T(row, 'Count', `${owned}/${pool.length}`, left + S(201), S(4), 19, on ? GLASS_COLOR.onGold : GLASS_COLOR.sub, S(80), HorizontalTextAlignment.RIGHT);
      const barW = S(126);
      const ratio = pool.length > 0 ? owned / pool.length : 0;
      mountGlassLine(kit, row, 'Track', left + S(76) + barW / 2, -S(22), barW, Math.max(2, S(5)), new Color(255, 255, 255, on ? 60 : 34));
      if (ratio > 0) {
        mountGlassLine(kit, row, 'Fill', left + S(76) + barW * ratio / 2, -S(22), barW * ratio, Math.max(2, S(5)), on ? new Color(252, 244, 226, 255) : new Color(220, 224, 232, 230));
      }
      if (on) {
        this.host.addSprite('Chevron', GLASS_ICON.chevron, S(251) / 2 - S(24), 0, S(18), S(18), row);
      } else {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.setLobbyCodexFilter(filter.key), this);
        this.host.applyImageButtonFeedback(row, 1.02, 0.97);
      }
    });
    mountGlassLine(kit, panel, 'RailLine', FX(185), FY(685), S(222), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    const check = this.host.addChildPlainNode(panel, 'UnownedOnly', FX(170), FY(732), S(200), S(56));
    mountGlassCheckbox(kit, check, 'Box', -S(100) + S(17), 0, S(32), state.unownedOnly);
    T(check, 'Text', '仅看未收集', -S(100) + S(52), 0, 21, GLASS_COLOR.text, S(150));
    check.addComponent(Button);
    check.on(Button.EventType.CLICK, () => this.host.toggleLobbyCodexUnownedOnly(), this);
  }

  /** 中间 335..1238 × 90..683:格子 156×145、列步 175(首列左沿 356)、行步 195(首行顶 105),名字在格下 +17;滚动条 x 1226。 */
  private renderGrid(panel: Node, state: LobbyCodexPanelState, items: LobbyCodexItemVO[], selected: LobbyCodexItemVO | null,
    FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'Grid', FX(786.5), FY(386.5), S(903), S(593), k);
    if (items.length === 0) {
      T(panel, 'Empty', state.items.length === 0 ? '当前暂无可展示的英雄图鉴' : state.unownedOnly ? '这一档已全部收录' : '该稀有度暂无英雄', FX(786), FY(386), 22, GLASS_COLOR.sub, S(600), HorizontalTextAlignment.CENTER);
      return;
    }
    const columns = 5;
    const tileW = S(156);
    const tileH = S(145);
    const colStep = S(175);
    const rowStep = S(195);
    const viewTop = FY(98);
    const viewBottom = FY(676);
    const viewH = viewTop - viewBottom;
    const viewW = S(1214 - 346);
    const rows = Math.ceil(items.length / columns);
    const contentH = Math.max(viewH, S(7) + rows * rowStep);
    const viewport = this.host.addChildPlainNode(panel, 'GridView', FX((346 + 1214) / 2), (viewTop + viewBottom) / 2, viewW, viewH);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const scroll = viewport.addComponent(ScrollView);
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = true;
    scroll.cancelInnerEvents = true;
    const baseY = (viewH - contentH) / 2;
    const content = this.host.addChildPlainNode(viewport, 'GridContent', 0, baseY, viewW, contentH);
    scroll.content = content;
    let selectedRow = 0;
    items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const on = selected?.heroCode === item.heroCode;
      if (on) {
        selectedRow = row;
      }
      // 格子中心:原型左沿 356 + 列步,顶 105 + 行步;视口左沿 346、顶 98
      const x = -viewW / 2 + S(356 - 346) + col * colStep + tileW / 2;
      const y = contentH / 2 - S(105 - 98) - row * rowStep - tileH / 2;
      const cell = this.host.addChildPlainNode(content, `Hero_${item.heroCode}`, x, y - S(12), tileW + S(10), tileH + S(44));
      if (on) {
        mountGlassSlice(kit, cell, 'Sel', GLASS_SLICES.panelSel, 0, 0, tileW + S(10), tileH + S(44), k);
      }
      const tile = this.host.addChildPlainNode(cell, 'Tile', 0, S(12), tileW, tileH);
      mountGlassFrame(kit, tile, 'Frame', 0, 0, tileW, tileH, k);
      const art = this.host.addChildPlainNode(tile, 'Art', 0, 0, tileW - S(6), tileH - S(6));
      mountHeroAvatar(art, item.heroCode, Math.min(tileW, tileH) - S(6), 'round');
      if (!item.owned) {
        // 未收集:压暗 + 锁
        const shade = this.host.addChildPlainNode(tile, 'Shade', 0, 0, tileW - S(6), tileH - S(6));
        const g = shade.addComponent(Graphics);
        g.fillColor = rgba(10, 12, 18, 168);
        g.roundRect(-(tileW - S(6)) / 2, -(tileH - S(6)) / 2, tileW - S(6), tileH - S(6), S(8));
        g.fill();
        this.host.addSprite('Lock', GLASS_ICON.lock, tileW / 2 - S(22), -tileH / 2 + S(22), S(26), S(26), tile);
      }
      this.rarityTag(tile, item.rarity, -tileW / 2 + S(22), tileH / 2 - S(18), S, T);
      if (item.rewardClaimable) {
        this.dot(tile, tileW / 2 - S(12), tileH / 2 - S(12), S(8));
      }
      T(cell, 'Name', item.heroName, 0, -(tileH + S(44)) / 2 + S(16), 20, item.owned ? GLASS_COLOR.text : GLASS_COLOR.dim, tileW + S(6), HorizontalTextAlignment.CENTER, on);
      if (!on) {
        cell.addComponent(Button);
        cell.on(Button.EventType.CLICK, () => this.host.selectLobbyCodexHero(item.heroCode), this);
        this.host.applyImageButtonFeedback(cell, 1.03, 0.97);
      }
    });
    const maxOffset = contentH - viewH;
    if (maxOffset > 1) {
      // 选中项在视口下方时滚过去(切页签后默认选中第一格不会被这里影响)
      const want = Math.max(0, selectedRow * rowStep - viewH + rowStep);
      scroll.scrollToOffset(new Vec2(0, Math.min(maxOffset, want)), 0);
      const trackH = viewH - S(16);
      const update = mountGlassScrollBar(kit, panel, 'GridScrollBar', FX(1226), (viewTop + viewBottom) / 2, S(5), trackH, Math.max(S(40), trackH * (viewH / contentH)));
      const draw = (): void => update(Math.min(maxOffset, Math.max(0, content.position.y - baseY)) / maxOffset);
      draw();
      viewport.on(ScrollView.EventType.SCROLLING, draw, this);
    }
  }

  /** 底条 335..1238 × 695..808:「收集进度」@ (360,733) + 「15/22」@ (360,772);轨道 520..1180 @ 763,宝箱 @ 733,刻度数字 @ 790。 */
  private renderProgress(panel: Node, state: LobbyCodexPanelState, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'Progress', FX(786.5), FY(751.5), S(903), S(113), k);
    this.host.addSprite('ProgressBar', GLASS_ICON.accent, FX(362), FY(733), S(5), S(24), panel);
    T(panel, 'ProgressTitle', '收集进度', FX(376), FY(733), 21, GLASS_COLOR.sub, S(140));
    T(panel, 'ProgressCount', `${state.ownedCount}/${state.total}`, FX(370), FY(774), 32, GLASS_COLOR.champagne, S(150), HorizontalTextAlignment.LEFT, true);
    const total = Math.max(1, state.milestones.length > 0 ? state.milestones[state.milestones.length - 1].targetCount : state.total);
    const x0 = 520;
    const x1 = 1180;
    const xOf = (n: number): number => FX(x0 + (x1 - x0) * Math.min(1, n / total));
    const trackW = S(x1 - x0);
    mountGlassLine(kit, panel, 'Track', FX((x0 + x1) / 2), FY(763), trackW, Math.max(2, S(5)), new Color(255, 255, 255, 36));
    const fill = Math.min(1, state.ownedCount / total);
    if (fill > 0) {
      mountGlassLine(kit, panel, 'TrackFill', FX(x0) + trackW * fill / 2, FY(763), trackW * fill, Math.max(2, S(5)), GLASS_COLOR.champagne);
    }
    state.milestones.forEach((milestone) => this.renderMilestone(panel, state, milestone, xOf(milestone.targetCount), FX, FY, S, k, T));
  }

  private renderMilestone(panel: Node, state: LobbyCodexPanelState, milestone: LobbyCodexMilestoneVO, x: number, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const node = this.host.addChildPlainNode(panel, `Milestone_${milestone.targetCount}`, x, FY(748), S(70), S(100));
    const art = milestone.claimed ? this.assets.chest.opened : milestone.claimable ? this.assets.chest.ready : this.assets.chest.locked;
    const chest = this.host.addSprite('Chest', art, 0, S(16), S(52), S(52), node);
    if (chest && milestone.claimed) {
      chest.color = new Color(150, 150, 150, 255);
    }
    if (milestone.claimable) {
      this.dot(node, S(22), S(38), S(7));
    }
    // 轨道上的节点圆点
    const pin = this.host.addChildPlainNode(node, 'Pin', 0, -S(15), S(14), S(14));
    const g = pin.addComponent(Graphics);
    g.fillColor = milestone.reached ? GLASS_COLOR.champagne : new Color(90, 96, 108, 255);
    g.circle(0, 0, S(5));
    g.fill();
    T(node, 'Count', String(milestone.targetCount), 0, -S(40), 18, milestone.reached ? GLASS_COLOR.text : GLASS_COLOR.dim, S(60), HorizontalTextAlignment.CENTER);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => {
      if (milestone.claimable && state.claiming === null) {
        this.host.claimLobbyCodexReward({ type: 'MILESTONE', targetCount: milestone.targetCount });
      } else {
        this.host.selectLobbyCodexMilestone(state.selectedMilestone === milestone.targetCount ? null : milestone.targetCount);
      }
    }, this);
    this.host.applyImageButtonFeedback(node, 1.05, 0.96);
    if (state.selectedMilestone === milestone.targetCount) {
      this.renderMilestoneTip(panel, milestone, state.ownedCount, x, FX, FY, S, k, T);
    }
  }

  /** 宝箱奖励小气泡(点宝箱开 / 再点或选别处关):里程碑名 + 奖励图标 + 状态。 */
  private renderMilestoneTip(panel: Node, milestone: LobbyCodexMilestoneVO, owned: number, x: number, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    const rewards = milestone.rewards.slice(0, 4);
    // 每格 = 物品框 56 + 「×数量」最长约 7 字;步距 170,数量不再贴到下一格
    const w = Math.max(S(320), S(40) + rewards.length * S(170) - S(20));
    const h = S(150);
    // 气泡夹在中间格子面板(345..1228)内:最右的 22 宝箱不再伸到右栏上被截断
    const minX = FX(345) + w / 2;
    const maxX = FX(1228) - w / 2;
    const tip = this.host.addChildPlainNode(panel, 'MilestoneTip', Math.min(maxX, Math.max(minX, x)), FY(620), w, h);
    tip.addComponent(BlockInputEvents);
    mountGlassSlice(kit, tip, 'Base', GLASS_SLICES.panel, 0, 0, w, h, k);
    mountGlassSlice(kit, tip, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, k);
    T(tip, 'Title', `收录 ${milestone.targetCount} 位 · ${milestone.rewardName}`, -w / 2 + S(20), h / 2 - S(26), 20, GLASS_COLOR.text, w - S(40), HorizontalTextAlignment.LEFT, true);
    rewards.forEach((reward, index) => this.rewardSlot(tip, reward, -w / 2 + S(20) + S(28) + index * S(170), -S(10), S(56), S, k, T));
    const status = milestone.claimed ? '已领取' : milestone.reached ? '可领取' : `还差 ${Math.max(1, milestone.targetCount - owned)} 位英雄`;
    T(tip, 'Status', status, -w / 2 + S(20), -h / 2 + S(20), 18, milestone.claimed ? GLASS_COLOR.dim : GLASS_COLOR.sub, w - S(40));
  }

  /** 右栏 1257..1825 × 90..808:半身卡面铺上半区(底部渐暗);名字 (1295,494)、签 @ 546、定位 @ 600、分割线 642、「收录奖励」@ 673、奖励格 @ 738、领取 (1697,738)。 */
  private renderDetail(panel: Node, state: LobbyCodexPanelState, hero: LobbyCodexItemVO | null, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassPanel(kit, panel, 'Detail', FX(1541), FY(449), S(568), S(718), k);
    if (!hero) {
      return;
    }
    // 卡面区 1260..1822 × 93..600(遮罩裁切,cover 贴顶),下半段渐暗承托文字
    const artW = S(562);
    const artH = S(507);
    const artBox = this.host.addChildPlainNode(panel, 'Art', FX(1541), FY(346.5), artW, artH);
    artBox.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const artPath = resolveHeroRosterArtPath(hero.heroCode);
    if (artPath) {
      mountCoverArt(artBox, artPath, artW, artH, true);
    } else {
      mountHeroAvatar(artBox, hero.heroCode, Math.min(artW, artH), 'square');
    }
    if (!hero.owned) {
      const veil = this.host.addChildPlainNode(artBox, 'Veil', 0, 0, artW, artH);
      const vg = veil.addComponent(Graphics);
      vg.fillColor = rgba(10, 12, 18, 150);
      vg.rect(-artW / 2, -artH / 2, artW, artH);
      vg.fill();
    }
    const fade = this.host.addChildPlainNode(artBox, 'Fade', 0, 0, artW, artH);
    const fg = fade.addComponent(Graphics);
    const steps = 14;
    const fadeH = artH * 0.48;
    for (let i = 0; i < steps; i += 1) {
      fg.fillColor = rgba(16, 19, 26, Math.round(235 * ((i + 1) / steps) ** 1.6));
      fg.rect(-artW / 2, -artH / 2 + fadeH * (1 - (i + 1) / steps), artW, fadeH / steps + 1);
      fg.fill();
    }

    const name = T(panel, 'Name', hero.heroName, FX(1295), FY(494), 40, GLASS_COLOR.text, S(420), HorizontalTextAlignment.LEFT, true);
    let nameW = 0;
    for (const ch of Array.from(hero.heroName)) {
      nameW += /[　-鿿＀-￯]/.test(ch) ? name.fontSize : name.fontSize * 0.56;
    }
    this.rarityTag(panel, hero.rarity, Math.min(FX(1295) + nameW + S(30), FX(1780)), FY(496), S, T, 1.25);
    let chipX = FX(1295);
    [hero.heroClass, hero.faction].filter((text) => !!text).forEach((text, index) => {
      const w = S(32) + text.length * S(20);
      const chip = this.host.addChildPlainNode(panel, `Chip_${index}`, chipX + w / 2, FY(546), w, S(34));
      mountGlassSlice(kit, chip, 'Bg', GLASS_SLICES.pillSecondary, 0, 0, w, S(34), k * 0.7);
      T(chip, 'Text', text, 0, 0, 19, GLASS_COLOR.text, w - S(12), HorizontalTextAlignment.CENTER);
      chipX += w + S(16);
    });
    const role = (hero.roleDesc ?? '').trim();
    const line = !hero.owned ? '尚未收集 · 获得该英雄后即可领取收录奖励' : role && !HIDDEN_ROLE_DESC.has(role) ? `定位:${role}` : '已收录';
    T(panel, 'Role', line, FX(1295), FY(600), 21, GLASS_COLOR.sub, S(500));
    mountGlassLine(kit, panel, 'DetailLine', FX(1541), FY(642), S(508), Math.max(1, S(1)), new Color(255, 255, 255, 20));
    this.host.addSprite('RewardBar', GLASS_ICON.accent, FX(1294), FY(673), S(6), S(28), panel);
    T(panel, 'RewardTitle', '收录奖励', FX(1310), FY(673), 24, GLASS_COLOR.text, S(200), HorizontalTextAlignment.LEFT, true);
    hero.activateRewards.slice(0, 2).forEach((reward, index) => this.rewardSlot(panel, reward, FX(1321.5) + index * S(156), FY(738), S(64), S, k, T));
    const busy = state.claiming !== null;
    const claimingThis = state.claiming === `HERO:${hero.heroCode}`;
    if (hero.rewardClaimable) {
      mountGlassButton(kit, panel, 'ClaimHero', claimingThis ? '领取中…' : '领取', FX(1697), FY(738), S(193), S(56), k, busy ? 'primaryOff' : 'primary',
        () => this.host.claimLobbyCodexReward({ type: 'HERO', heroCode: hero.heroCode }), 24);
    } else if (hero.rewardClaimed) {
      mountGlassButton(kit, panel, 'ClaimHero', '已领取', FX(1697), FY(738), S(193), S(56), k, 'disabled', undefined, 22);
    } else {
      mountGlassButton(kit, panel, 'GoGacha', '前往召唤', FX(1697), FY(738), S(193), S(56), k, 'secondary', () => this.host.openLobbyGachaSceneFromCodex(), 22);
    }
  }

  /** 奖励格:玻璃物品框 + 图标(未知码退文字)+ 右侧「×数量」。 */
  private rewardSlot(parent: Node, reward: QuestRewardItemVO, x: number, y: number, size: number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    mountGlassFrame(kit, parent, `Reward_${reward.code}`, x, y, size, size, k);
    const icon = this.assets.reward[(reward.code || '').toUpperCase()];
    if (!icon || !this.host.addSprite(`RewardIcon_${reward.code}`, icon, x, y, size * 0.78, size * 0.78, parent)) {
      T(parent, `RewardName_${reward.code}`, reward.name.slice(0, 2), x, y, 17, GLASS_COLOR.text, size, HorizontalTextAlignment.CENTER);
    }
    T(parent, `RewardAmount_${reward.code}`, `×${this.host.formatInteger(reward.amount)}`, x + size / 2 + S(8), y - S(10), 20, GLASS_COLOR.text, S(90));
  }

  /** 稀有度小签(扁平):x / y 为签中心。 */
  private rarityTag(parent: Node, rarity: string, x: number, y: number, S: (v: number) => number, T: TFn, mul = 1): void {
    const key = (rarity || 'R').toUpperCase();
    const w = S((key.length > 2 ? 52 : key.length > 1 ? 42 : 32) * mul);
    const h = S(26 * mul);
    const tag = this.host.addChildPlainNode(parent, 'Rarity', x, y, w, h);
    const g = tag.addComponent(Graphics);
    g.fillColor = RARITY_TAG[key] ?? RARITY_TAG.R;
    g.roundRect(-w / 2, -h / 2, w, h, S(5));
    g.fill();
    g.strokeColor = new Color(255, 255, 255, 50);
    g.lineWidth = Math.max(1, S(1));
    g.roundRect(-w / 2, -h / 2, w, h, S(5));
    g.stroke();
    T(tag, 'Text', key, 0, 0, 17 * mul, new Color(248, 246, 240, 255), w, HorizontalTextAlignment.CENTER, true).enableShadow = false;
  }

  private dot(parent: Node, x: number, y: number, r: number): void {
    const node = this.host.addChildPlainNode(parent, 'Dot', x, y, r * 2, r * 2);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(226, 52, 48);
    g.circle(0, 0, r);
    g.fill();
  }

  /** 「?」说明气泡(点任意处关)。 */
  private renderHelp(panel: Node, FX: (v: number) => number, FY: (v: number) => number, S: (v: number) => number, k: number, T: TFn): void {
    const kit = this.host as unknown as UiKitHost;
    const cover = this.host.addChildPlainNode(panel, 'HelpCover', 0, 0, S(1870 * 2), S(841 * 2));
    cover.addComponent(BlockInputEvents);
    cover.addComponent(Button);
    cover.on(Button.EventType.CLICK, () => { this.helpOpen = false; this.host.rerenderLobbyCodex(); }, this);
    const w = S(620);
    const h = S(300);
    const box = this.host.addChildPlainNode(panel, 'HelpBox', FX(400), FY(250), w, h);
    mountGlassSlice(kit, box, 'Base', GLASS_SLICES.panel, 0, 0, w, h, k);
    mountGlassSlice(kit, box, 'Glass', GLASS_SLICES.panel, 0, 0, w, h, k);
    const text = T(box, 'Text', HELP_TEXT, 0, 0, 20, GLASS_COLOR.text, w - S(56));
    text.overflow = Label.Overflow.CLAMP;
    text.enableWrapText = true;
    text.lineHeight = Math.round(text.fontSize * 1.55);
    text.node.getComponent(UITransform)?.setContentSize(w - S(56), h - S(40));
  }
}
