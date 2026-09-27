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
  UIOpacity,
  UITransform,
  Vec3,
  VerticalTextAlignment,
  tween,
} from 'cc';
import type { GuardCrystalEffectVO, GuardCrystalInfoVO } from '../../types/GuardCrystalTypes';
import {
  GUARD_BASE_SPELL_SLOTS,
  GUARD_SPELLS,
  GUARD_SPELL_IDS,
  GUARD_SPELL_UNLOCK_LEVEL,
  guardResolveSpellLoadout,
  type GuardSpellId,
} from './GuardBattleModel';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 守卫水晶养成弹窗(docs/38):左侧水晶立绘坐在发光台座上 + 等级徽章 + 进度条 + 下一级解锁提示;右侧两个页签——
 * 「水晶升级」:五行属性卡(当前 → 下一级 + 增量)+ 升级消耗(金币 + 守卫晶核,持有不足标红)+ 升级按钮;
 * 「法术装备」(docs/38 §9,2026-09-27 用户"需要有个法术装备,最多带几个;后期皮肤可解锁穿戴数量"):
 *   出战格位一排(水晶 Lv5 解锁第 3 格;外观追加格由服务端给;格位始终装满,换法术 = 选格位后替换)+
 *   六个法术卡(已装备 / 未装备 / 未解锁)+ 详情区(悬浮预览、点击选中:名称 / 能量 / 效果 / 替换第 N 格),
 *   详情区高度按文字实测,不会溢出边框。
 * 面板底与商店/守卫战弹层同款素净框(4:3),字号按限时副本面板口径(标题 34、正文 18、卡名 20、数额 28)。
 * 数据与写入全走服务端 GuardCrystalApi;作为覆盖层挂在大厅 / 功能页之上(入口:底部导航「水晶」与战役行动卡上方按钮)。
 */
export type LobbyGuardCrystalTab = 'upgrade' | 'spells';

export interface LobbyGuardCrystalDialogState {
  info: GuardCrystalInfoVO | null;
  loading: boolean;
  busy: boolean;
  notice: string;
  noticeGood: boolean;
  /** 刚升级到的等级(播一次升级光效后清空)。 */
  flashLevel: number | null;
  /** 当前页签、法术装备页选中的法术与要替换的格位(-1 = 自动选最后一格)。 */
  tab: LobbyGuardCrystalTab;
  selectedSpell: GuardSpellId | null;
  targetSlot: number;
}

export interface LobbyGuardCrystalDialogHost {
  currentGuardCrystalState(): LobbyGuardCrystalDialogState | null;
  closeGuardCrystalDialog(): void;
  upgradeGuardCrystal(): void;
  setGuardCrystalLoadout(spells: string[]): void;
  refreshGuardCrystalDialog(): void;
  createUiNode(name: string): Node;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
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
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
  formatInteger(value: number | null | undefined): string;
}

const PANEL_FRAME = { path: 'ui/hero/ai/refine_panel_bg/spriteFrame', aspect: 1086 / 1448 };
const TITLE_DIVIDER_L = { path: 'ui/common/ai/title_divider_left/spriteFrame', aspect: 76 / 390 };
const TITLE_DIVIDER_R = { path: 'ui/common/ai/title_divider_right/spriteFrame', aspect: 73 / 392 };
const CLOSE_BUTTON = { path: 'ui/common/ai/button_close/spriteFrame', aspect: 161 / 155 };
const UPGRADE_BUTTON = { path: 'ui/common/ai/bag_button_crimson/spriteFrame', aspect: 128 / 512 };
const CRYSTAL_ART = { path: 'ui/battle/ai/ghud_crystal_tower/spriteFrame', aspect: 652 / 299 };
const LOCK_ICON = { path: 'ui/common/ai/ic_lock/spriteFrame', aspect: 192 / 135 };
const GOLD_ICON = 'ui/common/ai/ic_gold_medium/spriteFrame';
/** 守卫晶核图标(背包同一张,LobbyBagPanelRenderer.BAG_AI_ITEM_ICON_ASSETS.GUARD_CORE)。 */
const CORE_ICON = 'ui/bag/ai/icon_guard_core/spriteFrame';
const FONT = { title: 34, body: 18, name: 20, amount: 28, small: 16, tiny: 15 };
/** 法术图标(与战斗内法术栏同一套)。 */
const SPELL_ICON: Record<GuardSpellId, string> = {
  quake: 'ui/battle/ai/ghud_btn_skill/spriteFrame',
  frost: 'ui/guard/fx_wind_zone/spriteFrame',
  thunder: 'ui/battle/attack/atk_abyss_rift/spriteFrame',
  goldrush: 'ui/bag/ai/icon_gold/spriteFrame',
  aegis: 'ui/battle/attack/atk_atlas_shieldwave/spriteFrame',
  warhorn: 'ui/battle/ai/buff_atk/spriteFrame',
};
/** 法术详情文案(数值口径与 GuardBattleModel.guardCastSpell 一致)。 */
const SPELL_DETAIL: Record<GuardSpellId, string> = {
  quake: '对全场怪物造成本波普通怪 60% 血量的伤害并击退 1.2 格。能量满时的清场保底。',
  frost: '按住拖到战场:落点周围 1.6 格内的怪物冻结 3 秒(BOSS 只减速)。留住偷金鼠、卡住成片怪群。',
  thunder: '按住拖到战场:落点周围 1.2 格落雷,造成本波普通怪 250% 血量的伤害,精英 / BOSS 双倍。BOSS 读条时砸它最划算。',
  goldrush: '立刻获得 25 + 3×波次 金币(每波限 1 次)。攒够就点,越早用越早滚雪球。',
  aegis: '水晶 4 秒内不掉血,并回复 10% 最大生命。BOSS 读条打不断时的保命牌。',
  warhorn: '全队攻速 +50%,持续 6 秒。配合集火标记与手动战技打爆发。',
};
/** 属性行图标(现有素材)。 */
const STAT_ICON: Record<string, string> = {
  Hp: 'ui/battle/ai/ghud_crystal_tower/spriteFrame',
  Gold: GOLD_ICON,
  Power: 'ui/battle/ai/ghud_btn_skill/spriteFrame',
  Energy: 'ui/battle/ai/ghud_energy_pill/spriteFrame',
  EnergyMax: 'ui/battle/ai/ghud_energy_pill/spriteFrame',
  Slots: 'ui/battle/attack/atk_abyss_rift/spriteFrame',
};

export class LobbyGuardCrystalDialogRenderer {
  constructor(private readonly host: LobbyGuardCrystalDialogHost) {}

  render(layout: UiLayout): void {
    const state = this.host.currentGuardCrystalState();
    if (!state) {
      return;
    }
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const overlay = this.host.createUiNode('LobbyGuardCrystalOverlay');
    overlay.setPosition(new Vec3(centerX, centerY, 0));
    overlay.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    overlay.addComponent(BlockInputEvents);
    const dim = overlay.addComponent(Graphics);
    dim.fillColor = rgba(0, 0, 0, 176);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => this.host.closeGuardCrystalDialog(), this);

    let panelW = Math.min(1120 * scale, layout.stageWidth - 32 * scale);
    let panelH = panelW * PANEL_FRAME.aspect;
    if (panelH > layout.stageHeight * 0.94) {
      panelH = layout.stageHeight * 0.94;
      panelW = panelH / PANEL_FRAME.aspect;
    }
    const panel = this.host.addChildPlainNode(overlay, 'LobbyGuardCrystalPanel', 0, 0, panelW, panelH);
    panel.addComponent(BlockInputEvents);
    this.host.addSprite('LobbyGuardCrystalFrame', PANEL_FRAME.path, 0, 0, panelW, panelH, panel);

    const closeSize = 44 * scale;
    const close = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalClose', panelW / 2 - 64 * scale, panelH / 2 - 62 * scale, closeSize, closeSize * CLOSE_BUTTON.aspect);
    this.host.addSprite('LobbyGuardCrystalCloseArt', CLOSE_BUTTON.path, 0, 0, closeSize, closeSize * CLOSE_BUTTON.aspect, close);
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeGuardCrystalDialog(), this);
    this.host.applyImageButtonFeedback(close, 1.08, 0.94);

    const titleY = panelH / 2 - 112 * scale;
    const titleSize = FONT.title * scale;
    const titleText = '守卫水晶';
    const title = this.host.addChildLabel(panel, 'LobbyGuardCrystalTitle', titleText, 0, titleY, titleSize, rgba(255, 226, 150), new Size(panelW * 0.6, titleSize + 10 * scale));
    title.isBold = true;
    this.outline(title, scale, rgba(60, 30, 10, 255));
    const dividerW = 150 * scale;
    const dividerX = (titleText.length * titleSize) / 2 + 22 * scale + dividerW / 2;
    this.host.addSprite('LobbyGuardCrystalDividerL', TITLE_DIVIDER_L.path, -dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_L.aspect, panel);
    this.host.addSprite('LobbyGuardCrystalDividerR', TITLE_DIVIDER_R.path, dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_R.aspect, panel);
    const subtitleText = state.tab === 'spells'
      ? '出战法术会带进每一局矿境守卫;格位随水晶等级增加,更换后下一局生效'
      : '花金币与守卫晶核升级水晶:守卫战里水晶更坚固、开局更富、法术更强';
    const subtitle = this.host.addChildLabel(panel, 'LobbyGuardCrystalSubtitle', subtitleText, 0, titleY - 38 * scale, FONT.body * scale, rgba(212, 190, 150, 235), new Size(panelW * 0.8, 24 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;

    const bodyTop = titleY - 66 * scale;
    const bodyBottom = -panelH / 2 + 88 * scale;
    const info = state.info;
    if (!info) {
      this.host.addChildLabel(panel, 'LobbyGuardCrystalLoading', state.loading ? '读取中…' : '守卫水晶暂不可用', 0, (bodyTop + bodyBottom) / 2, FONT.body * scale, rgba(200, 186, 160), new Size(panelW * 0.6, 26 * scale));
      this.renderNotice(panel, state, panelW, panelH, scale);
      return;
    }
    // 左 34% 水晶展示区,右 56% 页签内容;中间一道竖分隔线。
    const leftW = panelW * 0.34;
    const leftX = -panelW / 2 + 40 * scale + leftW / 2;
    const rightX = panelW * 0.13;
    const rightW = panelW * 0.56;
    const divider = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalVDivider', -panelW / 2 + 40 * scale + leftW + 14 * scale, (bodyTop + bodyBottom) / 2, 2, bodyTop - bodyBottom - 20 * scale);
    const dg = divider.addComponent(Graphics);
    dg.strokeColor = rgba(150, 110, 60, 90);
    dg.lineWidth = 1.5;
    dg.moveTo(0, (bodyTop - bodyBottom) / 2 - 10 * scale);
    dg.lineTo(0, -(bodyTop - bodyBottom) / 2 + 10 * scale);
    dg.stroke();
    this.renderCrystal(panel, info, state, leftX, leftW, bodyTop, bodyBottom, scale);
    const contentTop = this.renderTabs(panel, state, info, rightX, rightW, bodyTop, scale);
    if (state.tab === 'spells') {
      this.renderLoadout(panel, state, info, rightX, rightW, contentTop, bodyBottom, scale);
    } else {
      this.renderStats(panel, info, rightX, rightW, contentTop, scale);
      this.renderUpgrade(panel, info, state, rightX, rightW, bodyBottom, scale);
    }
    this.renderNotice(panel, state, panelW, panelH, scale);
    if (state.busy) {
      const cover = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalBusy', 0, 0, panelW, panelH);
      cover.addComponent(BlockInputEvents);
    }
  }

  /** 左侧:发光台座 + 水晶立绘 + 等级徽章 + 进度条 + 下一级解锁提示(法术或法术格)。 */
  private renderCrystal(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, top: number, bottom: number, scale: number): void {
    const areaH = top - bottom;
    const artH = Math.min(areaH * 0.62, 330 * scale);
    const artW = artH / CRYSTAL_ART.aspect;
    const artY = top - artH / 2 - 16 * scale;
    const pedestal = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalPedestal', x, artY - artH * 0.42, w, artH * 0.4);
    const pg = pedestal.addComponent(Graphics);
    pg.fillColor = rgba(60, 140, 220, 42);
    pg.ellipse(0, 0, w * 0.42, artH * 0.16);
    pg.fill();
    pg.strokeColor = rgba(120, 200, 255, 140);
    pg.lineWidth = 2;
    pg.ellipse(0, 0, w * 0.42, artH * 0.16);
    pg.stroke();
    pg.strokeColor = rgba(120, 200, 255, 70);
    pg.lineWidth = 1;
    pg.ellipse(0, 0, w * 0.3, artH * 0.11);
    pg.stroke();
    const glow = this.host.addSprite('LobbyGuardCrystalGlow', 'ui/guard/cast_flash/spriteFrame', x, artY - artH * 0.08, artH * 1.15, artH * 1.15, panel);
    if (glow) {
      glow.color = rgba(120, 200, 255);
      glow.node.addComponent(UIOpacity).opacity = 120;
      tween(glow.node).repeatForever(tween().by(14, { angle: -360 })).start();
    }
    const art = this.host.addSprite('LobbyGuardCrystalArt', CRYSTAL_ART.path, x, artY, artW, artH, panel);
    if (art) {
      tween(art.node).repeatForever(tween().to(1.6, { position: new Vec3(x, artY + 6 * scale, 0) }, { easing: 'sineInOut' }).to(1.6, { position: new Vec3(x, artY, 0) }, { easing: 'sineInOut' })).start();
      if (state.flashLevel !== null) {
        art.node.setScale(0.9, 0.9, 1);
        tween(art.node).to(0.18, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' }).to(0.16, { scale: Vec3.ONE }).start();
        const burst = this.host.addSprite('LobbyGuardCrystalBurst', 'ui/battle/c1812/effects/hit_burst/spriteFrame', x, artY, artH * 0.9, artH * 0.9, panel);
        if (burst) {
          burst.color = rgba(160, 220, 255);
          burst.node.setScale(0.4, 0.4, 1);
          const op = burst.node.addComponent(UIOpacity);
          tween(burst.node).to(0.45, { scale: new Vec3(1.6, 1.6, 1) }, { easing: 'quadOut' }).start();
          tween(op).to(0.45, { opacity: 0 }).call(() => { if (burst.node.isValid) { burst.node.destroy(); } }).start();
        }
      }
    }
    const badgeW = 150 * scale;
    const badgeH = 46 * scale;
    const badgeY = artY - artH / 2 - 34 * scale;
    const badge = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLevelBadge', x, badgeY, badgeW, badgeH);
    const bg = badge.addComponent(Graphics);
    bg.fillColor = rgba(12, 26, 46, 235);
    bg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);
    bg.fill();
    bg.strokeColor = rgba(214, 168, 92, 230);
    bg.lineWidth = 2;
    bg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);
    bg.stroke();
    const level = this.host.addChildLabel(badge, 'Text', `Lv.${info.level}`, 0, 1, FONT.amount * scale, rgba(160, 220, 255), new Size(badgeW, 36 * scale));
    level.isBold = true;
    this.outline(level, scale, rgba(10, 20, 40, 255));
    const barW = Math.min(240 * scale, w - 20 * scale);
    const barY = badgeY - badgeH / 2 - 22 * scale;
    const bar = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLevelBar', x, barY, barW, 12 * scale);
    const g = bar.addComponent(Graphics);
    g.fillColor = rgba(10, 12, 20, 220);
    g.roundRect(-barW / 2, -6 * scale, barW, 12 * scale, 6 * scale);
    g.fill();
    g.fillColor = rgba(110, 190, 255, 245);
    g.roundRect(-barW / 2, -6 * scale, Math.max(10 * scale, barW * (info.level / Math.max(1, info.maxLevel))), 12 * scale, 6 * scale);
    g.fill();
    g.strokeColor = rgba(150, 200, 255, 160);
    g.lineWidth = 1;
    g.roundRect(-barW / 2, -6 * scale, barW, 12 * scale, 6 * scale);
    g.stroke();
    const cap = this.host.addChildLabel(panel, 'LobbyGuardCrystalLevelCap', info.level >= info.maxLevel ? '已升到满级' : `${info.level} / ${info.maxLevel} 级`, x, barY - 20 * scale, FONT.tiny * scale, rgba(200, 186, 160), new Size(barW + 40 * scale, 22 * scale));
    cap.overflow = Label.Overflow.SHRINK;
    const hints: string[] = [];
    const nextUnlock = info.next ? GUARD_SPELL_IDS.find((id) => (info.next?.unlockedSpells ?? []).indexOf(id) >= 0 && (info.current.unlockedSpells ?? []).indexOf(id) < 0) : undefined;
    if (nextUnlock) {
      hints.push(`下一级解锁法术「${GUARD_SPELLS[nextUnlock].name}」`);
    }
    if (info.nextSlotLevel && info.nextSlotLevel === info.level + 1) {
      hints.push('下一级解锁第 ' + (this.slotsOf(info) + 1) + ' 个法术格');
    } else if (info.nextSlotLevel) {
      hints.push(`Lv.${info.nextSlotLevel} 解锁第 ${this.slotsOf(info) + 1} 个法术格`);
    }
    hints.slice(0, 2).forEach((text, index) => {
      const hint = this.host.addChildLabel(panel, `LobbyGuardCrystalNextUnlock${index}`, text, x, barY - 44 * scale - index * 22 * scale, FONT.tiny * scale, rgba(150, 240, 160), new Size(w, 22 * scale));
      hint.overflow = Label.Overflow.SHRINK;
    });
  }

  /** 右侧页签:水晶升级 / 法术装备(带 已装备/格数 小标)。返回页签下方内容区顶边。 */
  private renderTabs(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, scale: number): number {
    const tabW = 168 * scale;
    const tabH = 42 * scale;
    const y = top - tabH / 2 - 2 * scale;
    const tabs: Array<{ key: LobbyGuardCrystalDialogState['tab']; text: string }> = [
      { key: 'upgrade', text: '水晶升级' },
      { key: 'spells', text: `法术装备 ${this.loadoutOf(info).length}/${this.slotsOf(info)}` },
    ];
    tabs.forEach((tab, index) => {
      const active = state.tab === tab.key;
      const tx = x - w / 2 + tabW / 2 + index * (tabW + 12 * scale);
      const node = this.host.addChildPlainNode(panel, `LobbyGuardCrystalTab_${tab.key}`, tx, y, tabW, tabH);
      const g = node.addComponent(Graphics);
      g.fillColor = active ? rgba(92, 58, 20, 240) : rgba(20, 14, 10, 200);
      g.roundRect(-tabW / 2, -tabH / 2, tabW, tabH, 10 * scale);
      g.fill();
      g.strokeColor = active ? rgba(255, 214, 110, 250) : rgba(150, 110, 60, 150);
      g.lineWidth = active ? 2.5 : 1.5;
      g.roundRect(-tabW / 2, -tabH / 2, tabW, tabH, 10 * scale);
      g.stroke();
      const label = this.host.addChildLabel(node, 'Text', tab.text, 0, 0, FONT.body * scale, active ? rgba(255, 230, 160) : rgba(200, 184, 150), new Size(tabW - 16 * scale, 26 * scale));
      label.isBold = active;
      label.overflow = Label.Overflow.SHRINK;
      if (!active) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => {
          const current = this.host.currentGuardCrystalState();
          if (current) {
            current.tab = tab.key;
            current.notice = '';
            this.host.refreshGuardCrystalDialog();
          }
        }, this);
        this.host.applyImageButtonFeedback(node, 1.04, 0.96);
      }
    });
    const lineY = y - tabH / 2 - 6 * scale;
    const line = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalTabLine', x, lineY, w, 2);
    const lg = line.addComponent(Graphics);
    lg.strokeColor = rgba(190, 140, 70, 120);
    lg.lineWidth = 1.5;
    lg.moveTo(-w / 2, 0);
    lg.lineTo(w / 2, 0);
    lg.stroke();
    return lineY - 8 * scale;
  }

  /** 属性卡:图标 | 名称 | 当前 → 下一级(+增量)。返回最后一行底边 y。 */
  private renderStats(panel: Node, info: GuardCrystalInfoVO, x: number, w: number, top: number, scale: number): number {
    const current = info.current;
    const next = info.next;
    const levelRow = (info.levels ?? []).find((row) => row.level === info.level);
    const extraSlots = Math.max(0, this.slotsOf(info) - Number(levelRow?.effect.spellSlots ?? this.slotsOf(info)));
    const rows: Array<{ key: string; name: string; read: (effect: GuardCrystalEffectVO) => number; fmt: (value: number) => string; delta: (value: number) => string }> = [
      { key: 'Hp', name: '水晶生命', read: (e) => e.crystalHpPct, fmt: (v) => `+${v}%`, delta: (v) => `+${v}%` },
      { key: 'Gold', name: '开局金币', read: (e) => e.startGold, fmt: (v) => `+${v}`, delta: (v) => `+${v}` },
      { key: 'Power', name: '法术强度', read: (e) => e.spellPowerPct, fmt: (v) => `+${v}%`, delta: (v) => `+${v}%` },
      { key: 'Energy', name: '开局能量', read: (e) => e.startEnergy, fmt: (v) => `+${v}`, delta: (v) => `+${v}` },
      { key: 'EnergyMax', name: '能量上限', read: (e) => 150 + e.energyMaxBonus, fmt: (v) => `${v}`, delta: (v) => `+${v}` },
      { key: 'Slots', name: '法术格数', read: (e) => (e === current ? this.slotsOf(info) : Number(e.spellSlots ?? GUARD_BASE_SPELL_SLOTS) + extraSlots), fmt: (v) => `${v} 格`, delta: (v) => `+${v}` },
    ];
    const rowH = 40 * scale;
    const gap = 6 * scale;
    const headerY = top - 12 * scale;
    const colIcon = x - w / 2 + 24 * scale;
    const colName = x - w / 2 + 52 * scale;
    const colCur = x + w * 0.12;
    const colArrow = x + w * 0.24;
    const colNext = x + w * 0.35;
    const colDelta = x + w * 0.47;
    this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadCur', '当前', colCur, headerY, FONT.tiny * scale, rgba(190, 170, 130), new Size(120 * scale, 22 * scale));
    if (next) {
      const head = this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadNext', `Lv.${info.level + 1}`, colNext, headerY, FONT.tiny * scale, rgba(150, 240, 160), new Size(120 * scale, 22 * scale));
      head.isBold = true;
    }
    rows.forEach((row, index) => {
      const y = headerY - 16 * scale - rowH / 2 - index * (rowH + gap);
      const band = this.host.addChildPlainNode(panel, `LobbyGuardCrystalRow${row.key}`, x, y, w, rowH);
      const bg = band.addComponent(Graphics);
      bg.fillColor = rgba(20, 14, 10, 175);
      bg.roundRect(-w / 2, -rowH / 2, w, rowH, 8 * scale);
      bg.fill();
      bg.strokeColor = rgba(190, 140, 70, 110);
      bg.lineWidth = 1;
      bg.roundRect(-w / 2, -rowH / 2, w, rowH, 8 * scale);
      bg.stroke();
      const iconSize = 26 * scale;
      this.host.addSprite(`Icon${row.key}`, STAT_ICON[row.key], colIcon, y, row.key === 'Hp' ? iconSize * 0.5 : iconSize, row.key === 'Hp' ? iconSize : row.key.startsWith('Energy') ? iconSize * 0.42 : iconSize, panel);
      this.host.addChildLabel(panel, `LobbyGuardCrystalRowName${row.key}`, row.name, colName, y, FONT.body * scale, rgba(236, 224, 196), new Size(150 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
      const curValue = row.read(current);
      const cur = this.host.addChildLabel(panel, `LobbyGuardCrystalRowCur${row.key}`, row.fmt(curValue), colCur, y, FONT.name * scale, rgba(255, 226, 150), new Size(120 * scale, 26 * scale));
      cur.isBold = true;
      if (next) {
        const nextValue = row.read(next);
        const changed = nextValue !== curValue;
        this.host.addChildLabel(panel, `LobbyGuardCrystalRowArrow${row.key}`, '→', colArrow, y, FONT.body * scale, rgba(170, 150, 110), new Size(40 * scale, 26 * scale));
        const nextLabel = this.host.addChildLabel(panel, `LobbyGuardCrystalRowNext${row.key}`, row.fmt(nextValue), colNext, y, FONT.name * scale, changed ? rgba(150, 240, 160) : rgba(200, 186, 160), new Size(120 * scale, 26 * scale));
        nextLabel.isBold = changed;
        if (changed) {
          this.host.addChildLabel(panel, `LobbyGuardCrystalRowDelta${row.key}`, `(${row.delta(nextValue - curValue)})`, colDelta, y, FONT.tiny * scale, rgba(150, 240, 160, 220), new Size(70 * scale, 22 * scale));
        }
      }
    });
    return headerY - 16 * scale - rows.length * (rowH + gap) + gap;
  }

  /** 升级区:消耗卡两张(金币 / 守卫晶核:需要 + 持有,不足标红)+ 来源说明 + 升级按钮;满级灰显。 */
  private renderUpgrade(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, bottom: number, scale: number): void {
    const gold = Number(info.goldBalance ?? 0);
    const core = Number(info.coreBalance ?? 0);
    const goldCost = info.nextUpgradeGold ?? 0;
    const coreCost = info.nextUpgradeCore ?? 0;
    const maxed = info.level >= info.maxLevel || info.nextUpgradeGold === null;
    const goldOk = gold >= goldCost;
    const coreOk = core >= coreCost;
    const btnW = 236 * scale;
    const btnH = btnW * UPGRADE_BUTTON.aspect;
    const rowY = bottom + Math.max(btnH, 60 * scale) / 2 + 4 * scale;
    const btnX = x + w / 2 - btnW / 2;
    const button = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalUpgrade', btnX, rowY, btnW, btnH);
    this.host.addSprite('LobbyGuardCrystalUpgradeArt', UPGRADE_BUTTON.path, 0, 0, btnW, btnH, button);
    const label = this.host.addChildLabel(button, 'LobbyGuardCrystalUpgradeLabel', maxed ? '已满级' : `升到 Lv.${info.level + 1}`, 0, 0, FONT.name * scale, rgba(255, 238, 200), new Size(btnW * 0.8, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    this.outline(label, scale, rgba(60, 12, 8, 255));
    if (maxed || state.busy) {
      button.addComponent(UIOpacity).opacity = 140;
    } else {
      button.addComponent(Button);
      button.on(Button.EventType.CLICK, () => {
        const current = this.host.currentGuardCrystalState();
        if (!coreOk || !goldOk) {
          if (current) {
            current.notice = !coreOk ? `守卫晶核不足:还差 ${this.host.formatInteger(coreCost - core)} 个` : `金币不足:还差 ${this.host.formatInteger(goldCost - gold)}`;
            current.noticeGood = false;
            this.host.refreshGuardCrystalDialog();
          }
          return;
        }
        this.host.upgradeGuardCrystal();
      }, this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    // 两张消耗卡(按钮左侧平分)
    const cardGap = 12 * scale;
    const cardW = (w - btnW - cardGap * 2) / 2;
    const cardH = 58 * scale;
    const costs: Array<{ key: string; icon: string; name: string; need: number; have: number; ok: boolean }> = [
      { key: 'Gold', icon: GOLD_ICON, name: '金币', need: goldCost, have: gold, ok: goldOk },
      { key: 'Core', icon: CORE_ICON, name: '守卫晶核', need: coreCost, have: core, ok: coreOk },
    ];
    costs.forEach((cost, index) => {
      const cx = x - w / 2 + cardW / 2 + index * (cardW + cardGap);
      const card = this.host.addChildPlainNode(panel, `LobbyGuardCrystalCost${cost.key}`, cx, rowY, cardW, cardH);
      const g = card.addComponent(Graphics);
      g.fillColor = rgba(14, 10, 8, 225);
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10 * scale);
      g.fill();
      g.strokeColor = !maxed && !cost.ok ? rgba(255, 120, 100, 220) : rgba(190, 140, 70, 180);
      g.lineWidth = 1.5;
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10 * scale);
      g.stroke();
      const iconSize = 34 * scale;
      this.host.addSprite('Icon', cost.icon, -cardW / 2 + 12 * scale + iconSize / 2, 0, iconSize, iconSize, card);
      const textX = -cardW / 2 + 20 * scale + iconSize;
      const textW = cardW - iconSize - 28 * scale;
      const needText = maxed ? cost.name : `${cost.name} ${this.host.formatInteger(cost.need)}`;
      const need = this.host.addChildLabel(card, 'Need', needText, textX, 11 * scale, FONT.small * scale, rgba(255, 226, 150), new Size(textW, 22 * scale), HorizontalTextAlignment.LEFT);
      need.overflow = Label.Overflow.SHRINK;
      need.isBold = true;
      const have = this.host.addChildLabel(card, 'Have', `持有 ${this.host.formatInteger(cost.have)}`, textX, -12 * scale, FONT.tiny * scale, !maxed && !cost.ok ? rgba(255, 130, 110) : rgba(200, 186, 160), new Size(textW, 20 * scale), HorizontalTextAlignment.LEFT);
      have.overflow = Label.Overflow.SHRINK;
    });
    const source = this.host.addChildLabel(panel, 'LobbyGuardCrystalCoreSource', '守卫晶核:主线关卡首次通关、每日副本胜利获得', x - w / 2 + 4 * scale, rowY + cardH / 2 + 16 * scale, FONT.tiny * scale, rgba(170, 156, 128), new Size(w - btnW - cardGap, 20 * scale), HorizontalTextAlignment.LEFT);
    source.overflow = Label.Overflow.SHRINK;
  }

  // ── 法术装备页 ──

  private slotsOf(info: GuardCrystalInfoVO): number {
    return Math.max(1, Math.round(Number(info.spellSlots ?? info.current.spellSlots ?? GUARD_BASE_SPELL_SLOTS)) || GUARD_BASE_SPELL_SLOTS);
  }

  private unlockedOf(info: GuardCrystalInfoVO): GuardSpellId[] {
    const raw = info.current.unlockedSpells ?? [];
    return GUARD_SPELL_IDS.filter((id) => raw.indexOf(id) >= 0);
  }

  private loadoutOf(info: GuardCrystalInfoVO): GuardSpellId[] {
    return guardResolveSpellLoadout(info.current.spellLoadout ?? null, this.unlockedOf(info), this.slotsOf(info));
  }

  /** 格位一排 + 六张法术卡 + 详情区。 */
  private renderLoadout(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, bottom: number, scale: number): void {
    const slots = this.slotsOf(info);
    const loadout = this.loadoutOf(info);
    const unlocked = this.unlockedOf(info);
    if (!state.selectedSpell) {
      state.selectedSpell = loadout[0] ?? 'quake';
    }
    const target = state.targetSlot >= 0 && state.targetSlot < slots ? state.targetSlot : slots - 1;

    // 标题行
    const headY = top - 14 * scale;
    const head = this.host.addChildLabel(panel, 'LobbyGuardCrystalLoadoutTitle', `出战法术 ${loadout.length}/${slots}`, x - w / 2 + 4 * scale, headY, FONT.body * scale, rgba(255, 214, 140), new Size(220 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    head.isBold = true;
    const hintText = loadout.length >= slots && slots > 1 ? '格位已满:先点一个格位,再给它换法术' : '点法术卡查看详情,再点「装备」';
    const hint = this.host.addChildLabel(panel, 'LobbyGuardCrystalLoadoutHint', hintText, x + w / 2 - 4 * scale, headY, FONT.tiny * scale, rgba(170, 156, 128), new Size(w * 0.6, 22 * scale), HorizontalTextAlignment.RIGHT);
    hint.overflow = Label.Overflow.SHRINK;

    // 格位:已开的 + 下一个水晶可解锁的(锁);外观追加格没开放前不展示。
    const socket = 70 * scale;
    const socketGap = 26 * scale;
    const socketY = headY - 22 * scale - socket / 2;
    const shown = slots + (info.nextSlotLevel ? 1 : 0);
    for (let i = 0; i < shown; i++) {
      const sx = x - w / 2 + socket / 2 + 6 * scale + i * (socket + socketGap);
      const open = i < slots;
      const id = open ? loadout[i] : undefined;
      const node = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSocket_${i}`, sx, socketY, socket, socket);
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(14, 10, 8, open ? 235 : 160);
      g.circle(0, 0, socket / 2);
      g.fill();
      const isTarget = open && loadout.length >= slots && i === target && slots > 1;
      g.strokeColor = isTarget ? rgba(150, 240, 160, 250) : open ? rgba(214, 168, 92, 240) : rgba(110, 96, 80, 180);
      g.lineWidth = isTarget ? 3.5 : 2.5;
      g.circle(0, 0, socket / 2);
      g.stroke();
      if (id) {
        const art = id === 'quake' ? socket : socket * 0.72;
        this.host.addSprite('Icon', SPELL_ICON[id], 0, 0, art, art, node);
      } else if (!open) {
        this.host.addSprite('Lock', LOCK_ICON.path, 0, 0, socket * 0.34, socket * 0.34 * LOCK_ICON.aspect, node);
      } else {
        this.host.addChildLabel(node, 'Empty', '空', 0, 0, FONT.small * scale, rgba(150, 130, 100), new Size(socket, 22 * scale));
      }
      const indexBadge = this.host.addChildLabel(node, 'Index', `${i + 1}`, -socket * 0.36, socket * 0.36, FONT.tiny * scale, rgba(255, 226, 150), new Size(24 * scale, 20 * scale));
      this.outline(indexBadge, scale, rgba(20, 12, 6, 255));
      const caption = open ? (id ? GUARD_SPELLS[id].name : '空格位') : `水晶 Lv.${info.nextSlotLevel} 解锁`;
      const cap = this.host.addChildLabel(panel, `LobbyGuardCrystalSocketName_${i}`, caption, sx, socketY - socket / 2 - 12 * scale, FONT.tiny * scale, open ? rgba(236, 224, 196) : rgba(255, 170, 120), new Size(socket + socketGap, 20 * scale));
      cap.overflow = Label.Overflow.SHRINK;
      if (open) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => {
          const current = this.host.currentGuardCrystalState();
          if (current) {
            current.targetSlot = i;
            if (id) {
              current.selectedSpell = id;
            }
            this.host.refreshGuardCrystalDialog();
          }
        }, this);
        this.host.applyImageButtonFeedback(node, 1.06, 0.96);
      }
    }

    // 法术卡 3×2
    const gridTop = socketY - socket / 2 - 28 * scale;
    const cols = 3;
    const cardGap = 10 * scale;
    const cardW = (w - cardGap * (cols - 1)) / cols;
    const cardH = 64 * scale;
    GUARD_SPELL_IDS.forEach((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cx = x - w / 2 + cardW / 2 + col * (cardW + cardGap);
      const cy = gridTop - cardH / 2 - row * (cardH + cardGap);
      const open = unlocked.indexOf(id) >= 0;
      const slotIndex = loadout.indexOf(id);
      const selected = state.selectedSpell === id;
      const card = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSpell_${id}`, cx, cy, cardW, cardH);
      const g = card.addComponent(Graphics);
      g.fillColor = slotIndex >= 0 ? rgba(58, 38, 14, 235) : rgba(20, 14, 10, 205);
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10 * scale);
      g.fill();
      g.strokeColor = selected ? rgba(255, 236, 160, 255) : slotIndex >= 0 ? rgba(214, 168, 92, 230) : rgba(150, 110, 60, 140);
      g.lineWidth = selected ? 3 : 1.5;
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10 * scale);
      g.stroke();
      const iconSize = 46 * scale;
      const art = this.host.addSprite('Icon', SPELL_ICON[id], -cardW / 2 + 10 * scale + iconSize / 2, 0, id === 'quake' ? iconSize : iconSize * 0.78, id === 'quake' ? iconSize : iconSize * 0.78, card);
      if (!open) {
        if (art) {
          art.node.addComponent(UIOpacity).opacity = 90;
        }
        this.host.addSprite('Lock', LOCK_ICON.path, -cardW / 2 + 10 * scale + iconSize / 2, 0, iconSize * 0.4, iconSize * 0.4 * LOCK_ICON.aspect, card);
      }
      const textX = -cardW / 2 + 18 * scale + iconSize;
      const textW = cardW - iconSize - 26 * scale;
      const name = this.host.addChildLabel(card, 'Name', GUARD_SPELLS[id].name, textX, 11 * scale, FONT.body * scale, open ? rgba(240, 226, 196) : rgba(170, 156, 136), new Size(textW, 24 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      name.isBold = slotIndex >= 0;
      const status = !open ? `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁` : slotIndex >= 0 ? `已装备 · 第 ${slotIndex + 1} 格` : `能量 ${GUARD_SPELLS[id].cost} · 未装备`;
      const statusLabel = this.host.addChildLabel(card, 'Status', status, textX, -13 * scale, FONT.tiny * scale, !open ? rgba(255, 170, 120) : slotIndex >= 0 ? rgba(150, 240, 160) : rgba(170, 200, 230), new Size(textW, 20 * scale), HorizontalTextAlignment.LEFT);
      statusLabel.overflow = Label.Overflow.SHRINK;
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, () => {
        const current = this.host.currentGuardCrystalState();
        if (current) {
          current.selectedSpell = id;
          this.host.refreshGuardCrystalDialog();
        }
      }, this);
      card.on(Node.EventType.MOUSE_ENTER, () => {
        const current = this.host.currentGuardCrystalState();
        if (current && current.selectedSpell !== id) {
          this.renderSpellDetail(panel, info, current, id, x, w, detailTop, bottom, scale, true);
        }
      }, this);
      card.on(Node.EventType.MOUSE_LEAVE, () => {
        const current = this.host.currentGuardCrystalState();
        if (current && current.selectedSpell && current.selectedSpell !== id) {
          this.renderSpellDetail(panel, info, current, current.selectedSpell, x, w, detailTop, bottom, scale, false);
        }
      }, this);
      this.host.applyImageButtonFeedback(card, 1.03, 0.97);
    });
    const detailTop = gridTop - 2 * (cardH + cardGap) - 4 * scale;
    this.renderSpellDetail(panel, info, state, state.selectedSpell, x, w, detailTop, bottom, scale, false);
  }

  /**
   * 详情区:图标 + 名称 + 能量 / 状态,右侧操作按钮(装备 / 卸下 / 替换第 N 格 / 未解锁);下面整行效果说明。
   * 说明文字按实测高度排版(RESIZE_HEIGHT),框随内容长高,最多占到面板底边,再多才缩字。
   */
  private renderSpellDetail(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, id: GuardSpellId, x: number, w: number, top: number, bottom: number, scale: number, preview: boolean): void {
    panel.getChildByName('LobbyGuardCrystalSpellDetail')?.destroy();
    const def = GUARD_SPELLS[id];
    const slots = this.slotsOf(info);
    const loadout = this.loadoutOf(info);
    const open = this.unlockedOf(info).indexOf(id) >= 0;
    const slotIndex = loadout.indexOf(id);
    const pad = 14 * scale;
    const iconSize = 48 * scale;
    const headH = iconSize;
    const descW = w - pad * 2;
    const lineH = 22 * scale;
    const maxH = Math.max(90 * scale, top - bottom);

    const detail = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalSpellDetail', x, top, w, 10);
    const g = detail.addComponent(Graphics);
    const desc = this.host.addChildLabel(detail, 'Desc', SPELL_DETAIL[id], 0, 0, FONT.tiny * scale, rgba(226, 214, 190), new Size(descW, lineH), HorizontalTextAlignment.LEFT);
    desc.enableWrapText = true;
    desc.lineHeight = lineH;
    desc.verticalAlign = VerticalTextAlignment.TOP;
    desc.overflow = Label.Overflow.RESIZE_HEIGHT;
    let descH = this.measureLabelHeight(desc, descW);
    let boxH = pad + headH + 10 * scale + descH + pad;
    if (boxH > maxH) {
      // 放不下才缩字:固定框 + SHRINK 兜底,保证不出框。
      descH = maxH - (pad + headH + 10 * scale + pad);
      boxH = maxH;
      desc.overflow = Label.Overflow.SHRINK;
      desc.getComponent(UITransform)?.setContentSize(new Size(descW, Math.max(lineH, descH)));
    }
    detail.setPosition(new Vec3(x, top - boxH / 2, 0));
    detail.getComponent(UITransform)?.setContentSize(new Size(w, boxH));
    g.fillColor = rgba(12, 9, 8, 240);
    g.roundRect(-w / 2, -boxH / 2, w, boxH, 10 * scale);
    g.fill();
    g.strokeColor = preview ? rgba(190, 140, 70, 200) : rgba(255, 214, 110, 230);
    g.lineWidth = preview ? 1.5 : 2;
    g.roundRect(-w / 2, -boxH / 2, w, boxH, 10 * scale);
    g.stroke();
    const headY = boxH / 2 - pad - headH / 2;
    this.host.addSprite('Icon', SPELL_ICON[id], -w / 2 + pad + iconSize / 2, headY, id === 'quake' ? iconSize : iconSize * 0.78, id === 'quake' ? iconSize : iconSize * 0.78, detail);
    const nameW = w * 0.42;
    const name = this.host.addChildLabel(detail, 'Name', def.name, -w / 2 + pad + iconSize + 12 * scale, headY + 11 * scale, FONT.name * scale, rgba(255, 226, 150), new Size(nameW, 26 * scale), HorizontalTextAlignment.LEFT);
    name.isBold = true;
    name.overflow = Label.Overflow.SHRINK;
    const meta = open
      ? `能量 ${def.cost} · ${slotIndex >= 0 ? `已装备在第 ${slotIndex + 1} 格` : '未装备'}`
      : `能量 ${def.cost} · 守卫水晶 Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`;
    const metaLabel = this.host.addChildLabel(detail, 'Meta', meta, -w / 2 + pad + iconSize + 12 * scale, headY - 12 * scale, FONT.tiny * scale, open ? rgba(160, 210, 255) : rgba(255, 170, 120), new Size(nameW, 20 * scale), HorizontalTextAlignment.LEFT);
    metaLabel.overflow = Label.Overflow.SHRINK;
    desc.node.setPosition(new Vec3(0, headY - headH / 2 - 10 * scale - descH / 2, 0));

    // 操作按钮
    const btnW = 150 * scale;
    const btnH = 40 * scale;
    const btnX = w / 2 - pad - btnW / 2;
    const target = state.targetSlot >= 0 && state.targetSlot < slots ? state.targetSlot : slots - 1;
    let text = '';
    let action: (() => void) | null = null;
    if (!open) {
      text = `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`;
    } else if (slotIndex >= 0) {
      text = `已装备 · 第 ${slotIndex + 1} 格`;
    } else if (loadout.length < slots) {
      text = '装备';
      action = () => this.host.setGuardCrystalLoadout(loadout.concat([id]));
    } else {
      text = `替换第 ${target + 1} 格`;
      action = () => {
        const next = loadout.slice();
        next[target] = id;
        this.host.setGuardCrystalLoadout(next);
      };
    }
    const btn = this.host.addChildPlainNode(detail, 'Action', btnX, headY, btnW, btnH);
    const bg = btn.addComponent(Graphics);
    bg.fillColor = action ? rgba(120, 30, 20, 245) : slotIndex >= 0 ? rgba(26, 52, 30, 230) : rgba(40, 34, 30, 220);
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
    bg.fill();
    bg.strokeColor = action ? rgba(255, 196, 120, 230) : rgba(120, 104, 88, 180);
    bg.lineWidth = 2;
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
    bg.stroke();
    const btnLabel = this.host.addChildLabel(btn, 'Text', text, 0, 0, FONT.body * scale, action ? rgba(255, 238, 200) : slotIndex >= 0 ? rgba(150, 240, 160) : rgba(170, 156, 136), new Size(btnW - 16 * scale, 26 * scale));
    btnLabel.overflow = Label.Overflow.SHRINK;
    btnLabel.isBold = !!action;
    if (action && !state.busy && !preview) {
      const run = action;
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, () => run(), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    } else if (preview) {
      (btn.getComponent(UIOpacity) ?? btn.addComponent(UIOpacity)).opacity = 150;
    }
  }

  private measureLabelHeight(label: Label, width: number): number {
    try {
      label.updateRenderData(true);
    } catch {
      // 忽略:下面按估算兜底。
    }
    const measured = label.node.getComponent(UITransform)?.height ?? 0;
    if (measured > label.lineHeight * 0.5) {
      return measured;
    }
    const perLine = Math.max(1, Math.floor(width / Math.max(1, label.fontSize)));
    const lines = Math.max(1, Math.ceil(label.string.length / perLine));
    return lines * label.lineHeight;
  }

  private renderNotice(panel: Node, state: LobbyGuardCrystalDialogState, panelW: number, panelH: number, scale: number): void {
    if (!state.notice) {
      return;
    }
    const label = this.host.addChildLabel(panel, 'LobbyGuardCrystalNotice', state.notice, -panelW * 0.25, -panelH / 2 + 100 * scale, FONT.body * scale, state.noticeGood ? rgba(150, 240, 160) : rgba(255, 130, 110), new Size(panelW * 0.36, 26 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, rgba(10, 8, 6, 255));
  }

  private outline(label: Label, scale: number, color: Color): void {
    label.enableOutline = true;
    label.outlineColor = color;
    label.outlineWidth = Math.max(1, 2 * scale);
  }
}
