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
  tween,
} from 'cc';
import type { GuardCrystalEffectVO, GuardCrystalInfoVO } from '../../types/GuardCrystalTypes';
import { GUARD_SPELLS, GUARD_SPELL_IDS, GUARD_SPELL_UNLOCK_LEVEL, type GuardSpellId } from './GuardBattleModel';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 守卫水晶养成弹窗(docs/38,2026-09-27 用户:"需要加入水晶养成玩法"):
 * 左侧水晶立绘 + 等级;右侧 本级 → 下一级 效果对比、法术解锁进度;底部升级按钮(金币花费 + 持有)。
 * 面板底与商店/守卫战弹层同款素净框(4:3),字号按限时副本面板口径(标题 34、正文 18、卡名 20、数额 28)。
 * 数据与写入全走服务端 GuardCrystalApi;作为覆盖层挂在大厅 / 功能页之上(入口:战役地图行动卡上方"守卫水晶")。
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
const FONT = { title: 34, body: 18, name: 20, amount: 28, small: 16 };
/** 法术图标(与战斗内法术栏同一套)。 */
const SPELL_ICON: Record<GuardSpellId, string> = {
  quake: 'ui/battle/ai/ghud_btn_skill/spriteFrame',
  frost: 'ui/guard/fx_wind_zone/spriteFrame',
  thunder: 'ui/battle/attack/atk_abyss_rift/spriteFrame',
  goldrush: 'ui/bag/ai/icon_gold/spriteFrame',
  aegis: 'ui/battle/attack/atk_atlas_shieldwave/spriteFrame',
  warhorn: 'ui/battle/ai/buff_atk/spriteFrame',
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

    let panelW = Math.min(1080 * scale, layout.stageWidth - 32 * scale);
    let panelH = panelW * PANEL_FRAME.aspect;
    if (panelH > layout.stageHeight * 0.92) {
      panelH = layout.stageHeight * 0.92;
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
    const subtitle = this.host.addChildLabel(panel, 'LobbyGuardCrystalSubtitle', '花金币升级守卫水晶:矿境守卫战斗里水晶更坚固、开局更富、法术更强', 0, titleY - 38 * scale, FONT.body * scale, rgba(212, 190, 150, 235), new Size(panelW * 0.8, 24 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;

    const bodyTop = titleY - 70 * scale;
    const bodyBottom = -panelH / 2 + 96 * scale;
    const info = state.info;
    if (!info) {
      this.host.addChildLabel(panel, 'LobbyGuardCrystalLoading', state.loading ? '读取中…' : '守卫水晶暂不可用', 0, (bodyTop + bodyBottom) / 2, FONT.body * scale, rgba(200, 186, 160), new Size(panelW * 0.6, 26 * scale));
      this.renderNotice(panel, state, panelW, panelH, scale);
      return;
    }
    const leftX = -panelW * 0.25;
    const rightX = panelW * 0.14;
    const rightW = panelW * 0.46;
    this.renderCrystal(panel, info, state, leftX, bodyTop, bodyBottom, scale);
    const statsBottom = this.renderStats(panel, info, rightX, rightW, bodyTop, scale);
    this.renderSpells(panel, info, rightX, rightW, statsBottom - 18 * scale, scale);
    this.renderUpgrade(panel, info, state, rightX, bodyBottom, scale);
    this.renderNotice(panel, state, panelW, panelH, scale);
    if (state.busy) {
      const cover = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalBusy', 0, 0, panelW, panelH);
      cover.addComponent(BlockInputEvents);
    }
  }

  /** 左侧:水晶立绘 + 底光 + 等级。 */
  private renderCrystal(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, top: number, bottom: number, scale: number): void {
    const artH = Math.min((top - bottom) * 0.74, 360 * scale);
    const artW = artH / CRYSTAL_ART.aspect;
    const artY = top - artH / 2 - 6 * scale;
    const glow = this.host.addSprite('LobbyGuardCrystalGlow', 'ui/guard/cast_flash/spriteFrame', x, artY - artH * 0.1, artH * 1.1, artH * 1.1, panel);
    if (glow) {
      glow.color = rgba(120, 200, 255);
      const glowOp = glow.node.addComponent(UIOpacity);
      glowOp.opacity = 110;
      tween(glow.node).repeatForever(tween().by(14, { angle: -360 })).start();
    }
    const art = this.host.addSprite('LobbyGuardCrystalArt', CRYSTAL_ART.path, x, artY, artW, artH, panel);
    if (art && state.flashLevel !== null) {
      art.node.setScale(0.9, 0.9, 1);
      tween(art.node).to(0.18, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' }).to(0.16, { scale: Vec3.ONE }).start();
    }
    const levelY = artY - artH / 2 - 22 * scale;
    const level = this.host.addChildLabel(panel, 'LobbyGuardCrystalLevel', `Lv.${info.level}`, x, levelY, FONT.amount * scale, rgba(160, 220, 255), new Size(260 * scale, 36 * scale));
    level.isBold = true;
    this.outline(level, scale, rgba(10, 20, 40, 255));
    const cap = this.host.addChildLabel(panel, 'LobbyGuardCrystalLevelCap', info.level >= info.maxLevel ? '已满级' : `满级 Lv.${info.maxLevel}`, x, levelY - 30 * scale, FONT.small * scale, rgba(200, 186, 160), new Size(260 * scale, 22 * scale));
    cap.overflow = Label.Overflow.SHRINK;
    // 等级进度条
    const barW = 220 * scale;
    const bar = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLevelBar', x, levelY - 54 * scale, barW, 10 * scale);
    const g = bar.addComponent(Graphics);
    g.fillColor = rgba(10, 12, 20, 220);
    g.roundRect(-barW / 2, -5 * scale, barW, 10 * scale, 5 * scale);
    g.fill();
    g.fillColor = rgba(110, 190, 255, 245);
    g.roundRect(-barW / 2, -5 * scale, Math.max(8 * scale, barW * (info.level / Math.max(1, info.maxLevel))), 10 * scale, 5 * scale);
    g.fill();
    if (state.flashLevel !== null) {
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

  /** 右侧效果对比:属性 | 当前 | → 下一级(满级只显示当前)。返回最后一行底边 y。 */
  private renderStats(panel: Node, info: GuardCrystalInfoVO, x: number, w: number, top: number, scale: number): number {
    const current = info.current;
    const next = info.next;
    const rows: Array<{ key: string; name: string; value: (effect: GuardCrystalEffectVO) => string }> = [
      { key: 'Hp', name: '水晶生命', value: (e) => `+${e.crystalHpPct}%` },
      { key: 'Gold', name: '开局金币', value: (e) => `+${e.startGold}` },
      { key: 'Power', name: '法术强度', value: (e) => `+${e.spellPowerPct}%` },
      { key: 'Energy', name: '开局能量', value: (e) => `+${e.startEnergy}` },
      { key: 'EnergyMax', name: '能量上限', value: (e) => `${150 + e.energyMaxBonus}` },
    ];
    const rowH = 40 * scale;
    const header = top - 8 * scale;
    const colName = x - w / 2 + 14 * scale;
    const colCur = x + w * 0.1;
    const colNext = x + w * 0.36;
    this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadCur', '当前', colCur, header, FONT.small * scale, rgba(190, 170, 130), new Size(120 * scale, 22 * scale));
    this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadNext', next ? `Lv.${info.level + 1}` : '', colNext, header, FONT.small * scale, rgba(150, 230, 160), new Size(120 * scale, 22 * scale));
    rows.forEach((row, index) => {
      const y = header - 32 * scale - index * rowH;
      const band = this.host.addChildPlainNode(panel, `LobbyGuardCrystalRow${row.key}`, x, y, w, rowH - 6 * scale);
      const bg = band.addComponent(Graphics);
      bg.fillColor = rgba(20, 14, 10, index % 2 === 0 ? 170 : 120);
      bg.roundRect(-w / 2, -(rowH - 6 * scale) / 2, w, rowH - 6 * scale, 6 * scale);
      bg.fill();
      this.host.addChildLabel(panel, `LobbyGuardCrystalRowName${row.key}`, row.name, colName, y, FONT.body * scale, rgba(236, 224, 196), new Size(140 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
      const curText = row.value(current);
      this.host.addChildLabel(panel, `LobbyGuardCrystalRowCur${row.key}`, curText, colCur, y, FONT.body * scale, rgba(255, 226, 150), new Size(120 * scale, 26 * scale));
      if (next) {
        const nextText = row.value(next);
        const changed = nextText !== curText;
        this.host.addChildLabel(panel, `LobbyGuardCrystalRowArrow${row.key}`, '→', (colCur + colNext) / 2, y, FONT.body * scale, rgba(170, 150, 110), new Size(40 * scale, 26 * scale));
        this.host.addChildLabel(panel, `LobbyGuardCrystalRowNext${row.key}`, nextText, colNext, y, FONT.body * scale, changed ? rgba(150, 240, 160) : rgba(200, 186, 160), new Size(120 * scale, 26 * scale));
      }
    });
    return header - 32 * scale - (rows.length - 1) * rowH - rowH / 2;
  }

  /** 法术解锁进度:6 个法术图标,已解锁亮,未解锁暗 + 锁 + "Lv.N"。 */
  private renderSpells(panel: Node, info: GuardCrystalInfoVO, x: number, w: number, top: number, scale: number): void {
    const title = this.host.addChildLabel(panel, 'LobbyGuardCrystalSpellsTitle', '法术解锁', x - w / 2 + 14 * scale, top - 12 * scale, FONT.body * scale, rgba(255, 214, 140), new Size(160 * scale, 24 * scale), HorizontalTextAlignment.LEFT);
    title.isBold = true;
    const unlocked = new Set(info.current.unlockedSpells ?? []);
    const icon = 52 * scale;
    const gap = (w - icon * GUARD_SPELL_IDS.length) / (GUARD_SPELL_IDS.length - 1);
    const y = top - 58 * scale;
    GUARD_SPELL_IDS.forEach((id, index) => {
      const cx = x - w / 2 + icon / 2 + index * (icon + gap);
      const slot = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSpell_${id}`, cx, y, icon, icon);
      const g = slot.addComponent(Graphics);
      const open = unlocked.has(id);
      g.fillColor = rgba(14, 10, 8, 225);
      g.circle(0, 0, icon / 2);
      g.fill();
      g.strokeColor = open ? rgba(214, 168, 92, 235) : rgba(110, 96, 80, 200);
      g.lineWidth = 2;
      g.circle(0, 0, icon / 2);
      g.stroke();
      const art = this.host.addSprite('Icon', SPELL_ICON[id], 0, 0, id === 'quake' ? icon : icon * 0.72, id === 'quake' ? icon : icon * 0.72, slot);
      if (art && !open) {
        art.node.addComponent(UIOpacity).opacity = 90;
        this.host.addSprite('Lock', LOCK_ICON.path, 0, 0, icon * 0.34, icon * 0.34 * LOCK_ICON.aspect, slot);
      }
      const label = this.host.addChildLabel(panel, `LobbyGuardCrystalSpellName_${id}`, open ? GUARD_SPELLS[id].name : `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]}`, cx, y - icon / 2 - 12 * scale, 15 * scale, open ? rgba(236, 224, 196) : rgba(255, 170, 120), new Size(icon + gap, 20 * scale));
      label.overflow = Label.Overflow.SHRINK;
    });
  }

  /** 底部升级按钮:花费 + 持有金币(不足标红);满级灰显。 */
  private renderUpgrade(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, bottom: number, scale: number): void {
    const balance = Number(info.goldBalance ?? 0);
    const cost = info.nextUpgradeGold ?? 0;
    const maxed = info.level >= info.maxLevel || info.nextUpgradeGold === null;
    const enough = balance >= cost;
    const btnW = 320 * scale;
    const btnH = btnW * UPGRADE_BUTTON.aspect;
    const btnY = bottom + btnH / 2 + 10 * scale;
    const button = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalUpgrade', x, btnY, btnW, btnH);
    this.host.addSprite('LobbyGuardCrystalUpgradeArt', UPGRADE_BUTTON.path, 0, 0, btnW, btnH, button);
    const text = maxed ? '已满级' : `升级  ${this.host.formatInteger(cost)} 金币`;
    const label = this.host.addChildLabel(button, 'LobbyGuardCrystalUpgradeLabel', text, 0, 0, FONT.name * scale, rgba(255, 238, 200), new Size(btnW * 0.86, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, rgba(60, 12, 8, 255));
    if (maxed || state.busy) {
      button.addComponent(UIOpacity).opacity = 140;
    } else {
      button.addComponent(Button);
      button.on(Button.EventType.CLICK, () => this.host.upgradeGuardCrystal(), this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    const hold = this.host.addChildLabel(panel, 'LobbyGuardCrystalBalance', `持有 ${this.host.formatInteger(balance)} 金币`, x, btnY + btnH / 2 + 16 * scale, FONT.small * scale, !maxed && !enough ? rgba(255, 120, 100) : rgba(210, 196, 170), new Size(360 * scale, 22 * scale));
    hold.overflow = Label.Overflow.SHRINK;
  }

  private renderNotice(panel: Node, state: LobbyGuardCrystalDialogState, panelW: number, panelH: number, scale: number): void {
    if (!state.notice) {
      return;
    }
    const label = this.host.addChildLabel(panel, 'LobbyGuardCrystalNotice', state.notice, -panelW * 0.25, -panelH / 2 + 118 * scale, FONT.body * scale, state.noticeGood ? rgba(150, 240, 160) : rgba(255, 130, 110), new Size(panelW * 0.4, 26 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, rgba(10, 8, 6, 255));
  }

  private outline(label: Label, scale: number, color: Color): void {
    label.enableOutline = true;
    label.outlineColor = color;
    label.outlineWidth = Math.max(1, 2 * scale);
  }
}
