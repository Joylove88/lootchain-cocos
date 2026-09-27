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
import { GUARD_SPELLS, GUARD_SPELL_IDS, GUARD_SPELL_UNLOCK_LEVEL, type GuardSpellId } from './GuardBattleModel';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 守卫水晶养成弹窗(docs/38,2026-09-27 用户:"需要加入水晶养成玩法";同日验收"需要美化排版,法术可悬浮/点击看详情"):
 * 左侧水晶立绘坐在发光台座上 + 等级徽章 + 进度条;右侧五行属性卡(图标 + 当前 → 下一级 + 增量),法术解锁一排大图标
 * (悬浮或点击弹出详情卡:名称 / 能量 / 解锁等级 / 效果),底部升级按钮(金币图标 + 花费)与持有金币胶囊。
 * 面板底与商店/守卫战弹层同款素净框(4:3),字号按限时副本面板口径(标题 34、正文 18、卡名 20、数额 28)。
 * 数据与写入全走服务端 GuardCrystalApi;作为覆盖层挂在大厅 / 功能页之上(入口:底部导航「水晶」与战役行动卡上方按钮)。
 */
export interface LobbyGuardCrystalDialogState {
  info: GuardCrystalInfoVO | null;
  loading: boolean;
  busy: boolean;
  notice: string;
  noticeGood: boolean;
  /** 刚升级到的等级(播一次升级光效后清空)。 */
  flashLevel: number | null;
}

export interface LobbyGuardCrystalDialogHost {
  currentGuardCrystalState(): LobbyGuardCrystalDialogState | null;
  closeGuardCrystalDialog(): void;
  upgradeGuardCrystal(): void;
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
/** 法术详情文案(弹窗内悬浮/点击展示;数值口径与 GuardBattleModel.guardCastSpell 一致)。 */
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
};

export class LobbyGuardCrystalDialogRenderer {
  constructor(private readonly host: LobbyGuardCrystalDialogHost) {}

  /** 点击钉住的法术详情(再点同一个收起;重绘后保留)。 */
  private pinnedSpell: GuardSpellId | null = null;

  render(layout: UiLayout): void {
    const state = this.host.currentGuardCrystalState();
    if (!state) {
      this.pinnedSpell = null;
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
    const subtitle = this.host.addChildLabel(panel, 'LobbyGuardCrystalSubtitle', '花金币升级守卫水晶,矿境守卫战斗里水晶更坚固、开局更富、法术更强', 0, titleY - 38 * scale, FONT.body * scale, rgba(212, 190, 150, 235), new Size(panelW * 0.8, 24 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;

    const bodyTop = titleY - 66 * scale;
    const bodyBottom = -panelH / 2 + 88 * scale;
    const info = state.info;
    if (!info) {
      this.host.addChildLabel(panel, 'LobbyGuardCrystalLoading', state.loading ? '读取中…' : '守卫水晶暂不可用', 0, (bodyTop + bodyBottom) / 2, FONT.body * scale, rgba(200, 186, 160), new Size(panelW * 0.6, 26 * scale));
      this.renderNotice(panel, state, panelW, panelH, scale);
      return;
    }
    // 左 36% 水晶展示区,右 58% 属性 + 法术;中间一道竖分隔线。
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
    const statsBottom = this.renderStats(panel, info, rightX, rightW, bodyTop, scale);
    this.renderSpells(panel, info, rightX, rightW, statsBottom - 12 * scale, scale);
    this.renderUpgrade(panel, info, state, rightX, rightW, bodyBottom, scale);
    this.renderNotice(panel, state, panelW, panelH, scale);
    if (state.busy) {
      const cover = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalBusy', 0, 0, panelW, panelH);
      cover.addComponent(BlockInputEvents);
    }
  }

  /** 左侧:发光台座 + 水晶立绘 + 等级徽章 + 进度条 + 满级提示。 */
  private renderCrystal(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, top: number, bottom: number, scale: number): void {
    const areaH = top - bottom;
    const artH = Math.min(areaH * 0.62, 330 * scale);
    const artW = artH / CRYSTAL_ART.aspect;
    const artY = top - artH / 2 - 16 * scale;
    // 台座:两层同心椭圆 + 旋转光芒
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
    // 等级徽章:深蓝圆角牌 + 金边
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
    // 进度条 + 文案
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
    // 下一级解锁提示
    const nextUnlock = info.next ? GUARD_SPELL_IDS.find((id) => (info.next?.unlockedSpells ?? []).indexOf(id) >= 0 && (info.current.unlockedSpells ?? []).indexOf(id) < 0) : undefined;
    if (nextUnlock) {
      const hint = this.host.addChildLabel(panel, 'LobbyGuardCrystalNextUnlock', `下一级解锁法术「${GUARD_SPELLS[nextUnlock].name}」`, x, barY - 44 * scale, FONT.tiny * scale, rgba(150, 240, 160), new Size(w, 22 * scale));
      hint.overflow = Label.Overflow.SHRINK;
    }
  }

  /** 右侧属性卡:图标 | 名称 | 当前 → 下一级(+增量)。返回最后一行底边 y。 */
  private renderStats(panel: Node, info: GuardCrystalInfoVO, x: number, w: number, top: number, scale: number): number {
    const current = info.current;
    const next = info.next;
    const rows: Array<{ key: string; name: string; read: (effect: GuardCrystalEffectVO) => number; fmt: (value: number) => string; delta: (value: number) => string }> = [
      { key: 'Hp', name: '水晶生命', read: (e) => e.crystalHpPct, fmt: (v) => `+${v}%`, delta: (v) => `+${v}%` },
      { key: 'Gold', name: '开局金币', read: (e) => e.startGold, fmt: (v) => `+${v}`, delta: (v) => `+${v}` },
      { key: 'Power', name: '法术强度', read: (e) => e.spellPowerPct, fmt: (v) => `+${v}%`, delta: (v) => `+${v}%` },
      { key: 'Energy', name: '开局能量', read: (e) => e.startEnergy, fmt: (v) => `+${v}`, delta: (v) => `+${v}` },
      { key: 'EnergyMax', name: '能量上限', read: (e) => 150 + e.energyMaxBonus, fmt: (v) => `${v}`, delta: (v) => `+${v}` },
    ];
    const rowH = 42 * scale;
    const gap = 6 * scale;
    const headerY = top - 10 * scale;
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
      const icon = this.host.addSprite(`Icon${row.key}`, STAT_ICON[row.key], colIcon, y, row.key === 'Hp' ? iconSize * 0.5 : iconSize, row.key === 'Hp' ? iconSize : row.key.startsWith('Energy') ? iconSize * 0.42 : iconSize, panel);
      void icon;
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

  /** 法术解锁:6 个大图标(已解锁亮 / 未解锁暗 + 锁 + "Lv.N");悬浮或点击弹出详情卡。 */
  private renderSpells(panel: Node, info: GuardCrystalInfoVO, x: number, w: number, top: number, scale: number): void {
    const title = this.host.addChildLabel(panel, 'LobbyGuardCrystalSpellsTitle', '法术解锁', x - w / 2 + 4 * scale, top - 12 * scale, FONT.body * scale, rgba(255, 214, 140), new Size(160 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    title.isBold = true;
    const hint = this.host.addChildLabel(panel, 'LobbyGuardCrystalSpellsHint', '悬浮或点击查看效果', x + w / 2 - 4 * scale, top - 12 * scale, FONT.tiny * scale, rgba(170, 156, 128), new Size(200 * scale, 22 * scale), HorizontalTextAlignment.RIGHT);
    hint.overflow = Label.Overflow.SHRINK;
    const unlocked = new Set(info.current.unlockedSpells ?? []);
    const icon = 66 * scale;
    const gap = (w - icon * GUARD_SPELL_IDS.length) / (GUARD_SPELL_IDS.length - 1);
    const y = top - 36 * scale - icon / 2 - 10 * scale;
    GUARD_SPELL_IDS.forEach((id, index) => {
      const cx = x - w / 2 + icon / 2 + index * (icon + gap);
      const open = unlocked.has(id);
      const slot = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSpell_${id}`, cx, y, icon, icon);
      const g = slot.addComponent(Graphics);
      g.fillColor = rgba(14, 10, 8, 230);
      g.circle(0, 0, icon / 2);
      g.fill();
      g.strokeColor = open ? rgba(214, 168, 92, 240) : rgba(110, 96, 80, 200);
      g.lineWidth = open ? 2.5 : 2;
      g.circle(0, 0, icon / 2);
      g.stroke();
      if (open) {
        const halo = this.host.addSprite('Halo', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, 0, icon * 1.5, icon * 1.5, slot);
        if (halo) {
          halo.color = rgba(255, 214, 110);
          const op = halo.node.addComponent(UIOpacity);
          op.opacity = 70;
          halo.node.setSiblingIndex(0);
          tween(op).repeatForever(tween().to(0.9, { opacity: 30 }).to(0.9, { opacity: 80 })).start();
        }
      }
      const artSize = id === 'quake' ? icon : icon * 0.72;
      const art = this.host.addSprite('Icon', SPELL_ICON[id], 0, 0, artSize, artSize, slot);
      if (art && !open) {
        art.node.addComponent(UIOpacity).opacity = 80;
        this.host.addSprite('Lock', LOCK_ICON.path, 0, -2 * scale, icon * 0.32, icon * 0.32 * LOCK_ICON.aspect, slot);
      }
      const label = this.host.addChildLabel(panel, `LobbyGuardCrystalSpellName_${id}`, open ? GUARD_SPELLS[id].name : `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`, cx, y - icon / 2 - 13 * scale, FONT.tiny * scale, open ? rgba(236, 224, 196) : rgba(255, 170, 120), new Size(icon + gap, 20 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.host.applyImageButtonFeedback(slot, 1.08, 0.96);
      this.bindSpellTooltip(panel, slot, id, open, cx, y, icon, scale);
    });
    if (this.pinnedSpell) {
      const pinnedIndex = GUARD_SPELL_IDS.indexOf(this.pinnedSpell);
      if (pinnedIndex >= 0) {
        this.showSpellTooltip(panel, this.pinnedSpell, unlocked.has(this.pinnedSpell), x - w / 2 + icon / 2 + pinnedIndex * (icon + gap), y, icon, scale, true);
      }
    }
  }

  /** 悬浮显示 / 离开隐藏;点击钉住(再点同一个取消)。 */
  private bindSpellTooltip(panel: Node, slot: Node, id: GuardSpellId, open: boolean, cx: number, cy: number, icon: number, scale: number): void {
    slot.on(Node.EventType.MOUSE_ENTER, () => {
      if (this.pinnedSpell !== id) {
        this.showSpellTooltip(panel, id, open, cx, cy, icon, scale, false);
      }
    }, this);
    slot.on(Node.EventType.MOUSE_LEAVE, () => {
      if (this.pinnedSpell !== id) {
        panel.getChildByName('LobbyGuardCrystalSpellTip')?.destroy();
        if (this.pinnedSpell) {
          const pinnedIndex = GUARD_SPELL_IDS.indexOf(this.pinnedSpell);
          const slotNode = panel.getChildByName(`LobbyGuardCrystalSpell_${this.pinnedSpell}`);
          if (pinnedIndex >= 0 && slotNode) {
            this.showSpellTooltip(panel, this.pinnedSpell, !!slotNode.getChildByName('Halo'), slotNode.position.x, slotNode.position.y, icon, scale, true);
          }
        }
      }
    }, this);
    slot.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      if (this.pinnedSpell === id) {
        this.pinnedSpell = null;
        panel.getChildByName('LobbyGuardCrystalSpellTip')?.destroy();
        return;
      }
      this.pinnedSpell = id;
      this.showSpellTooltip(panel, id, open, cx, cy, icon, scale, true);
    }, this);
  }

  /** 详情卡:图标 + 名称 + 能量 / 解锁等级 + 效果说明;挂在图标上方,靠边时向内收。 */
  private showSpellTooltip(panel: Node, id: GuardSpellId, open: boolean, cx: number, cy: number, icon: number, scale: number, pinned: boolean): void {
    panel.getChildByName('LobbyGuardCrystalSpellTip')?.destroy();
    const def = GUARD_SPELLS[id];
    const panelW = panel.getComponent(UITransform)?.width ?? 1000;
    const tipW = 330 * scale;
    const tipH = 150 * scale;
    const tipX = Math.max(-panelW / 2 + tipW / 2 + 30 * scale, Math.min(panelW / 2 - tipW / 2 - 30 * scale, cx));
    const tipY = cy + icon / 2 + tipH / 2 + 14 * scale;
    const tip = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalSpellTip', tipX, tipY, tipW, tipH);
    tip.addComponent(BlockInputEvents);
    const g = tip.addComponent(Graphics);
    g.fillColor = rgba(12, 9, 8, 245);
    g.roundRect(-tipW / 2, -tipH / 2, tipW, tipH, 10 * scale);
    g.fill();
    g.strokeColor = pinned ? rgba(255, 214, 110, 240) : rgba(190, 140, 70, 200);
    g.lineWidth = pinned ? 2 : 1.5;
    g.roundRect(-tipW / 2, -tipH / 2, tipW, tipH, 10 * scale);
    g.stroke();
    // 指向图标的小三角
    const tail = cx - tipX;
    g.fillColor = rgba(12, 9, 8, 245);
    g.moveTo(tail - 8 * scale, -tipH / 2);
    g.lineTo(tail + 8 * scale, -tipH / 2);
    g.lineTo(tail, -tipH / 2 - 9 * scale);
    g.close();
    g.fill();
    const iconSize = 44 * scale;
    this.host.addSprite('Icon', SPELL_ICON[id], -tipW / 2 + 16 * scale + iconSize / 2, tipH / 2 - 16 * scale - iconSize / 2, id === 'quake' ? iconSize : iconSize * 0.76, id === 'quake' ? iconSize : iconSize * 0.76, tip);
    const name = this.host.addChildLabel(tip, 'Name', def.name, -tipW / 2 + 24 * scale + iconSize, tipH / 2 - 26 * scale, FONT.name * scale, rgba(255, 226, 150), new Size(tipW - iconSize - 40 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
    name.isBold = true;
    const meta = open ? `能量 ${def.cost}` : `能量 ${def.cost} · 守卫水晶 Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`;
    const metaLabel = this.host.addChildLabel(tip, 'Meta', meta, -tipW / 2 + 24 * scale + iconSize, tipH / 2 - 50 * scale, FONT.tiny * scale, open ? rgba(160, 210, 255) : rgba(255, 170, 120), new Size(tipW - iconSize - 40 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    metaLabel.overflow = Label.Overflow.SHRINK;
    const desc = this.host.addChildLabel(tip, 'Desc', SPELL_DETAIL[id], -tipW / 2 + 16 * scale, -tipH / 2 + 12 * scale, FONT.tiny * scale, rgba(226, 214, 190), new Size(tipW - 32 * scale, tipH - iconSize - 36 * scale), HorizontalTextAlignment.LEFT);
    desc.overflow = Label.Overflow.SHRINK;
    desc.verticalAlign = VerticalTextAlignment.TOP;
    desc.enableWrapText = true;
    tip.setScale(0.9, 0.9, 1);
    tween(tip).to(0.12, { scale: Vec3.ONE }, { easing: 'quadOut' }).start();
  }

  /** 底部:升级按钮(金币图标 + 花费)+ 持有金币胶囊;满级灰显。 */
  private renderUpgrade(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, bottom: number, scale: number): void {
    const balance = Number(info.goldBalance ?? 0);
    const cost = info.nextUpgradeGold ?? 0;
    const maxed = info.level >= info.maxLevel || info.nextUpgradeGold === null;
    const enough = balance >= cost;
    const btnW = 300 * scale;
    const btnH = btnW * UPGRADE_BUTTON.aspect;
    const btnY = bottom + btnH / 2 + 4 * scale;
    const btnX = x + w / 2 - btnW / 2;
    const button = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalUpgrade', btnX, btnY, btnW, btnH);
    this.host.addSprite('LobbyGuardCrystalUpgradeArt', UPGRADE_BUTTON.path, 0, 0, btnW, btnH, button);
    if (maxed) {
      const label = this.host.addChildLabel(button, 'LobbyGuardCrystalUpgradeLabel', '已满级', 0, 0, FONT.name * scale, rgba(255, 238, 200), new Size(btnW * 0.86, 30 * scale));
      this.outline(label, scale, rgba(60, 12, 8, 255));
    } else {
      const coin = 26 * scale;
      this.host.addSprite('LobbyGuardCrystalUpgradeCoin', GOLD_ICON, -btnW * 0.22, 0, coin, coin, button);
      const label = this.host.addChildLabel(button, 'LobbyGuardCrystalUpgradeLabel', `升级  ${this.host.formatInteger(cost)}`, btnW * 0.06, 0, FONT.name * scale, enough ? rgba(255, 238, 200) : rgba(255, 170, 150), new Size(btnW * 0.6, 30 * scale));
      label.overflow = Label.Overflow.SHRINK;
      label.isBold = true;
      this.outline(label, scale, rgba(60, 12, 8, 255));
    }
    if (maxed || state.busy) {
      button.addComponent(UIOpacity).opacity = 140;
    } else {
      button.addComponent(Button);
      button.on(Button.EventType.CLICK, () => this.host.upgradeGuardCrystal(), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    // 持有金币胶囊(按钮左侧)
    const pillW = Math.min(230 * scale, w - btnW - 16 * scale);
    const pillH = 40 * scale;
    const pillX = x - w / 2 + pillW / 2;
    const pill = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalBalance', pillX, btnY, pillW, pillH);
    const g = pill.addComponent(Graphics);
    g.fillColor = rgba(14, 10, 8, 225);
    g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
    g.fill();
    g.strokeColor = !maxed && !enough ? rgba(255, 120, 100, 220) : rgba(190, 140, 70, 180);
    g.lineWidth = 1.5;
    g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
    g.stroke();
    this.host.addSprite('Coin', GOLD_ICON, -pillW / 2 + 22 * scale, 0, 24 * scale, 24 * scale, pill);
    const hold = this.host.addChildLabel(pill, 'Text', `持有 ${this.host.formatInteger(balance)}`, 12 * scale, 0, FONT.small * scale, !maxed && !enough ? rgba(255, 130, 110) : rgba(236, 224, 196), new Size(pillW - 50 * scale, 22 * scale));
    hold.overflow = Label.Overflow.SHRINK;
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
