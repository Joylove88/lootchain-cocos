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
import { LOBBY_CRYSTAL_FX } from './LobbyBattleAttackFxConfig';
import { mountLobbySpineFx } from './LobbyUiSpineFx';
import { rgba, type UiLayout } from './LobbyHudTypes';

/**
 * 守卫水晶养成弹窗(docs/38):左侧水晶立绘坐在发光台座上 + 等级徽章 + 进度条 + 下一级解锁提示;右侧两个页签——
 * 「水晶升级」:五行属性卡(当前 → 下一级 + 增量)+ 升级消耗(金币 + 守卫晶核,持有不足标红)+ 升级按钮;
 * 「法术装备」(docs/38 §9,2026-09-27 用户"需要有个法术装备,最多带几个;后期皮肤可解锁穿戴数量"):
 *   出战格位一排(水晶 Lv5 解锁第 3 格;外观追加格由服务端给;格位始终装满,换法术 = 选格位后替换)+
 *   六个法术卡(已装备 / 未装备 / 未解锁)+ 详情区(悬浮预览、点击选中:名称 / 能量 / 效果 / 替换第 N 格),
 *   详情区高度按文字实测,不会溢出边框。
 * 2026-09-30 用户新素材 ui/crystal/ai + 参考图重排:左立绘(星云光 + 漩涡法阵)+ 等级牌 + 进度 + 解锁提示 + 题词;
 *   右侧页签 → 内面板(九宫格)→ 底部说明框 + 升级按钮。升级页 6 行属性条;法术页 装备槽(编号菱形)+ 法术列表 2×3 + 详情框。
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
  isGuardCrystalAssetsLoading(): boolean;
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
const LOCK_ICON = { path: 'ui/common/ai/ic_lock/spriteFrame', aspect: 192 / 135 };
const GOLD_ICON = 'ui/common/ai/ic_gold_medium/spriteFrame';
/** 守卫晶核图标(背包同一张,LobbyBagPanelRenderer.BAG_AI_ITEM_ICON_ASSETS.GUARD_CORE)。 */
const CORE_ICON = 'ui/bag/ai/icon_guard_core/spriteFrame';
const FONT = { title: 34, body: 18, name: 20, amount: 28, small: 16, tiny: 15 };

// ── 2026-09-30 用户新素材 ui/crystal/ai(原图备份 asset-src/ai-raw/crystal-ui-20260930,中文名已改英文)──
const CUI = (name: string): string => `ui/crystal/ai/${name}/spriteFrame`;
/** 水晶立绘(含熔岩基座),515×798。 */
const CRYSTAL_ART = { path: CUI('crystal_art'), aspect: 798 / 515 };
/** 等级牌 550×177、页签 选中 440×122 / 未选中 512×122、升级按钮 573×180、法术页升级按钮(带晶体图标)527×154。 */
const LEVEL_PLATE = { path: CUI('level_plate'), aspect: 177 / 550 };
const TAB_ON = { path: CUI('tab_on'), aspect: 122 / 440 };
const TAB_OFF = { path: CUI('tab_off'), aspect: 122 / 512 };
const BTN_LEVEL_UP = { path: CUI('btn_level_up'), aspect: 180 / 573 };
const BTN_COST_UP = { path: CUI('btn_cost_up'), aspect: 154 / 527 };
/** 九宫格素材:源尺寸 + 边距(源像素)。显示时按目标高度等比缩放、只横向/纵向拉中段,角饰不变形。 */
const INNER_PANEL = { path: CUI('inner_panel_bg'), w: 1948, h: 1259, inset: { l: 110, r: 110, t: 110, b: 110 } };
const STAT_ROW = { path: CUI('stat_row_bg'), w: 1066, h: 84, inset: { l: 60, r: 60, t: 0, b: 0 } };
const PREVIEW_BOX = { path: CUI('preview_box'), w: 716, h: 156, inset: { l: 150, r: 40, t: 0, b: 0 } };
const SECTION_EMBLEM = { path: CUI('section_emblem'), aspect: 121 / 107 };
/** 法术图标(圆形带框的新素材);狂战号角暂无新图,沿用旧图 + 程序画框。 */
const SPELL_ICON: Record<GuardSpellId, string> = {
  quake: CUI('spell_quake'),
  frost: CUI('spell_frost'),
  thunder: CUI('spell_thunder'),
  goldrush: CUI('spell_goldrush'),
  aegis: CUI('spell_aegis'),
  warhorn: 'ui/battle/ai/buff_atk/spriteFrame',
};
/** 属性行图标(新素材,原始宽高比)。 */
const STAT_ICON: Record<string, { path: string; aspect: number }> = {
  Hp: { path: CUI('stat_hp'), aspect: 88 / 65 },
  Gold: { path: CUI('stat_gold'), aspect: 72 / 76 },
  Power: { path: CUI('stat_power'), aspect: 80 / 81 },
  Energy: { path: CUI('stat_energy'), aspect: 50 / 76 },
  EnergyMax: { path: CUI('stat_energy_max'), aspect: 79 / 80 },
  Slots: { path: CUI('stat_slots'), aspect: 79 / 74 },
};
/** 法术详情文案(数值口径与 GuardBattleModel.guardCastSpell 一致)。 */
const SPELL_DETAIL: Record<GuardSpellId, string> = {
  quake: '对全场怪物造成本波普通怪 60% 血量的伤害并击退 1.2 格。能量满时的清场保底。',
  frost: '按住拖到战场:落点周围 1.6 格内的怪物冻结 3 秒(BOSS 只减速)。留住偷金鼠、卡住成片怪群。',
  thunder: '按住拖到战场:落点周围 1.2 格落雷,造成本波普通怪 250% 血量的伤害,精英 / BOSS 双倍。',
  goldrush: '立刻获得 25 + 3×波次 金币(每波限 1 次)。攒够就点,越早用越早滚雪球。',
  aegis: '水晶 4 秒内不掉血,并回复 10% 最大生命。BOSS 读条打不断时的保命牌。',
  warhorn: '全队攻速 +50%,持续 6 秒。配合集火标记与手动战技打爆发。',
};
const GOLD_TEXT = rgba(255, 226, 150);
const GREEN_TEXT = rgba(150, 240, 160);
const DIM_TEXT = rgba(190, 172, 140);

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

    const titleY = panelH / 2 - 106 * scale;
    const titleSize = FONT.title * scale;
    const titleText = '守卫水晶';
    const title = this.host.addChildLabel(panel, 'LobbyGuardCrystalTitle', titleText, 0, titleY, titleSize, GOLD_TEXT, new Size(panelW * 0.6, titleSize + 10 * scale));
    title.isBold = true;
    this.outline(title, scale, rgba(60, 30, 10, 255));
    const dividerW = 150 * scale;
    const dividerX = (titleText.length * titleSize) / 2 + 22 * scale + dividerW / 2;
    this.host.addSprite('LobbyGuardCrystalDividerL', TITLE_DIVIDER_L.path, -dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_L.aspect, panel);
    this.host.addSprite('LobbyGuardCrystalDividerR', TITLE_DIVIDER_R.path, dividerX, titleY, dividerW, dividerW * TITLE_DIVIDER_R.aspect, panel);
    const subtitleText = state.tab === 'spells'
      ? '出战法术会带进每一局矿境守卫,格位随水晶等级增加,更换后下一局生效'
      : '花金币与守卫晶核升级水晶:守卫战里水晶更坚固、开局更富、法术更强';
    const subtitle = this.host.addChildLabel(panel, 'LobbyGuardCrystalSubtitle', subtitleText, 0, titleY - 38 * scale, FONT.body * scale, rgba(212, 190, 150, 235), new Size(panelW * 0.8, 24 * scale));
    subtitle.overflow = Label.Overflow.SHRINK;

    const bodyTop = titleY - 62 * scale;
    const bodyBottom = -panelH / 2 + 84 * scale;
    const info = state.info;
    if (!info || this.host.isGuardCrystalAssetsLoading()) {
      this.host.addChildLabel(panel, 'LobbyGuardCrystalLoading', state.loading || info ? '读取中…' : '守卫水晶暂不可用', 0, (bodyTop + bodyBottom) / 2, FONT.body * scale, rgba(200, 186, 160), new Size(panelW * 0.6, 26 * scale));
      this.renderNotice(panel, state, panelW, panelH, scale);
      return;
    }
    // 左 33% 水晶展示区,右 60% 页签内容(参考图 2026-09-30:左立绘、右页签 + 内面板 + 底部说明框与按钮)。
    const leftW = panelW * 0.33;
    const leftX = -panelW / 2 + 44 * scale + leftW / 2;
    const rightW = panelW * 0.6;
    const rightX = panelW / 2 - 44 * scale - rightW / 2;
    this.renderCrystal(panel, info, state, leftX, leftW, bodyTop, bodyBottom, scale);
    const contentTop = this.renderTabs(panel, state, info, rightX, rightW, bodyTop, scale);
    const footerH = 86 * scale;
    const footerY = bodyBottom + footerH / 2;
    const innerTop = contentTop;
    const innerBottom = bodyBottom + footerH + 12 * scale;
    if (state.tab === 'spells') {
      this.renderLoadout(panel, state, info, rightX, rightW, innerTop, innerBottom, scale);
      this.renderSpellFooter(panel, info, state, rightX, rightW, footerY, footerH, scale);
    } else {
      this.renderStats(panel, info, rightX, rightW, innerTop, innerBottom, scale);
      this.renderUpgradeFooter(panel, info, state, rightX, rightW, footerY, footerH, scale);
    }
    this.renderNotice(panel, state, panelW, panelH, scale);
    if (state.busy) {
      const cover = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalBusy', 0, 0, panelW, panelH);
      cover.addComponent(BlockInputEvents);
    }
  }

  /** 左侧:星云背景光 + 漩涡法阵 + 新水晶立绘 + 等级牌 + 进度条 + 下一级解锁提示 + 题词。 */
  private renderCrystal(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, top: number, bottom: number, scale: number): void {
    const areaH = top - bottom;
    const artH = Math.min(areaH * 0.66, 380 * scale);
    const artW = artH / CRYSTAL_ART.aspect;
    const artY = top - artH / 2 - 4 * scale;
    // 台座法阵 + 背景光效(新批次 UI 骨骼特效);显式压到立绘之下
    const pedestalHolder = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalPedestal', x, artY - artH * 0.4, 10, 10);
    const pedestalMounted = this.mountSpineFx(pedestalHolder, LOBBY_CRYSTAL_FX.pedestal, 0, 0, artH * LOBBY_CRYSTAL_FX.pedestal.size, true, 0);
    if (!pedestalMounted) {
      const pg = pedestalHolder.addComponent(Graphics);
      pg.fillColor = rgba(60, 140, 220, 42);
      pg.ellipse(0, 0, w * 0.42, artH * 0.14);
      pg.fill();
    }
    const auraHolder = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalGlow', x, artY + artH * 0.1, 10, 10);
    this.mountSpineFx(auraHolder, LOBBY_CRYSTAL_FX.aura, 0, 0, artH * LOBBY_CRYSTAL_FX.aura.size, true, 0);
    auraHolder.setSiblingIndex(1);
    pedestalHolder.setSiblingIndex(2);
    const art = this.host.addSprite('LobbyGuardCrystalArt', CRYSTAL_ART.path, x, artY, artW, artH, panel);
    if (art) {
      tween(art.node).repeatForever(tween().to(1.6, { position: new Vec3(x, artY + 5 * scale, 0) }, { easing: 'sineInOut' }).to(1.6, { position: new Vec3(x, artY, 0) }, { easing: 'sineInOut' })).start();
      if (state.flashLevel !== null) {
        art.node.setScale(0.9, 0.9, 1);
        tween(art.node).to(0.18, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' }).to(0.16, { scale: Vec3.ONE }).start();
        const burstHolder = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalBurstFx', x, artY, 10, 10);
        const burstMounted = this.mountSpineFx(burstHolder, LOBBY_CRYSTAL_FX.upgradeBurst, 0, 0, artH * LOBBY_CRYSTAL_FX.upgradeBurst.size, false, LOBBY_CRYSTAL_FX.upgradeBurst.holdMs);
        const burst = burstMounted ? null : this.host.addSprite('LobbyGuardCrystalBurst', 'ui/battle/c1812/effects/hit_burst/spriteFrame', x, artY, artH * 0.9, artH * 0.9, panel);
        if (burst) {
          burst.color = rgba(160, 220, 255);
          burst.node.setScale(0.4, 0.4, 1);
          const op = burst.node.addComponent(UIOpacity);
          tween(burst.node).to(0.45, { scale: new Vec3(1.6, 1.6, 1) }, { easing: 'quadOut' }).start();
          tween(op).to(0.45, { opacity: 0 }).call(() => { if (burst.node.isValid) { burst.node.destroy(); } }).start();
        }
      }
    }
    // 等级牌(新素材,等比):压在立绘底座下沿
    const plateW = Math.min(w * 0.82, 230 * scale);
    const plateH = plateW * LEVEL_PLATE.aspect;
    const plateY = artY - artH / 2 + plateH * 0.12;
    const plate = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLevelBadge', x, plateY, plateW, plateH);
    this.host.addSprite('Art', LEVEL_PLATE.path, 0, 0, plateW, plateH, plate);
    const level = this.host.addChildLabel(plate, 'Text', `Lv.${info.level}`, 0, 1 * scale, 34 * scale, rgba(225, 238, 255), new Size(plateW * 0.7, 40 * scale));
    level.isBold = true;
    this.outline(level, scale, rgba(10, 20, 40, 255));
    // 进度条
    const barW = Math.min(250 * scale, w - 24 * scale);
    const barH = 12 * scale;
    const barY = plateY - plateH / 2 - 20 * scale;
    const bar = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLevelBar', x, barY, barW, barH);
    const g = bar.addComponent(Graphics);
    g.fillColor = rgba(24, 32, 52, 240);
    g.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    g.fill();
    g.fillColor = rgba(100, 180, 255, 250);
    g.roundRect(-barW / 2, -barH / 2, Math.max(barH, barW * (info.level / Math.max(1, info.maxLevel))), barH, barH / 2);
    g.fill();
    g.strokeColor = rgba(196, 156, 92, 200);
    g.lineWidth = 1.5;
    g.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    g.stroke();
    const cap = this.host.addChildLabel(panel, 'LobbyGuardCrystalLevelCap', info.level >= info.maxLevel ? '已升到满级' : `${info.level} / ${info.maxLevel} 级`, x, barY - 22 * scale, FONT.small * scale, rgba(215, 200, 170), new Size(barW + 40 * scale, 22 * scale));
    cap.overflow = Label.Overflow.SHRINK;
    const hints: string[] = [];
    const nextUnlock = info.next ? GUARD_SPELL_IDS.find((id) => (info.next?.unlockedSpells ?? []).indexOf(id) >= 0 && (info.current.unlockedSpells ?? []).indexOf(id) < 0) : undefined;
    if (nextUnlock) {
      hints.push(`下一级解锁法术「${GUARD_SPELLS[nextUnlock].name}」`);
    }
    if (info.nextSlotLevel && info.nextSlotLevel === info.level + 1) {
      hints.push(`下一级解锁第 ${this.slotsOf(info) + 1} 个法术格`);
    } else if (info.nextSlotLevel) {
      hints.push(`Lv.${info.nextSlotLevel} 解锁第 ${this.slotsOf(info) + 1} 个法术格`);
    }
    let cursor = barY - 48 * scale;
    hints.slice(0, 2).forEach((text, index) => {
      const hint = this.host.addChildLabel(panel, `LobbyGuardCrystalNextUnlock${index}`, text, x, cursor, FONT.body * scale, GREEN_TEXT, new Size(w, 24 * scale));
      hint.overflow = Label.Overflow.SHRINK;
      cursor -= 26 * scale;
    });
    // 题词:「水晶不灭,光明不息。」两侧细金线
    const quoteY = Math.max(bottom + 14 * scale, cursor - 10 * scale);
    const quote = this.host.addChildLabel(panel, 'LobbyGuardCrystalQuote', '「水晶不灭,光明不息。」', x, quoteY, FONT.tiny * scale, rgba(180, 160, 124), new Size(w, 22 * scale));
    quote.overflow = Label.Overflow.SHRINK;
    const lineNode = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalQuoteLine', x, quoteY, w, 2);
    const lg = lineNode.addComponent(Graphics);
    lg.strokeColor = rgba(170, 130, 70, 140);
    lg.lineWidth = 1;
    const half = 92 * scale;
    lg.moveTo(-half - 44 * scale, 0);
    lg.lineTo(-half, 0);
    lg.moveTo(half, 0);
    lg.lineTo(half + 44 * scale, 0);
    lg.stroke();
  }

  /** 右侧页签(新素材 选中 / 未选中,等比)。返回页签下方内容区顶边。 */
  private renderTabs(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, scale: number): number {
    const tabH = 50 * scale;
    const y = top - tabH / 2;
    const gap = 14 * scale;
    const tabs: Array<{ key: LobbyGuardCrystalDialogState['tab']; text: string }> = [
      { key: 'upgrade', text: '水晶升级' },
      { key: 'spells', text: `法术装备 ${this.loadoutOf(info).length}/${this.slotsOf(info)}` },
    ];
    const widths = tabs.map((tab) => tabH / (state.tab === tab.key ? TAB_ON.aspect : TAB_OFF.aspect));
    const totalW = widths[0] + widths[1] + gap;
    let cursor = x - totalW / 2;
    tabs.forEach((tab, index) => {
      const active = state.tab === tab.key;
      const tabW = widths[index];
      const tx = cursor + tabW / 2;
      cursor += tabW + gap;
      const node = this.host.addChildPlainNode(panel, `LobbyGuardCrystalTab_${tab.key}`, tx, y, tabW, tabH);
      this.host.addSprite('Art', active ? TAB_ON.path : TAB_OFF.path, 0, 0, tabW, tabH, node);
      const label = this.host.addChildLabel(node, 'Text', tab.text, 0, 0, 22 * scale, active ? rgba(255, 244, 214) : rgba(214, 198, 166), new Size(tabW - 24 * scale, 28 * scale));
      label.isBold = active;
      label.overflow = Label.Overflow.SHRINK;
      this.outline(label, scale, active ? rgba(80, 48, 10, 255) : rgba(10, 8, 6, 255));
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
    return y - tabH / 2 - 10 * scale;
  }

  /**
   * 九宫格素材按目标高度等比缩放:节点显示尺寸 w×h,内部 Sprite 用源高度 srcH、宽度 w/k 做 SLICED,再整体缩放 k=h/srcH。
   * 角饰与边线保持原比例,只拉中段(用户规则:一体构图素材不许非等比拉伸)。
   */
  private mountSliced(parent: Node, name: string, spec: { path: string; h: number; inset: { l: number; r: number; t: number; b: number } }, x: number, y: number, w: number, h: number): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, w, h);
    const k = h / spec.h;
    const sprite = this.host.addSprite('Art', spec.path, 0, 0, w / k, spec.h, node);
    if (sprite) {
      const frame = sprite.spriteFrame;
      if (frame) {
        frame.insetLeft = spec.inset.l;
        frame.insetRight = spec.inset.r;
        frame.insetTop = spec.inset.t;
        frame.insetBottom = spec.inset.b;
      }
      sprite.type = Sprite.Type.SLICED;
      sprite.node.setScale(k, k, 1);
    }
    return node;
  }

  /** 内面板:新素材 inner_panel_bg,纵横都可能拉,按"较小一边"定缩放系数,四角等比。 */
  private mountInnerPanel(panel: Node, name: string, x: number, top: number, w: number, bottom: number): Node {
    const h = top - bottom;
    const node = this.host.addChildPlainNode(panel, name, x, (top + bottom) / 2, w, h);
    // 角饰按约 26% 原尺寸显示(≈28px):再大会压住面板里的小标题。
    const k = Math.min(0.26, Math.min(w / INNER_PANEL.w, h / INNER_PANEL.h));
    const sprite = this.host.addSprite('Art', INNER_PANEL.path, 0, 0, w / k, h / k, node);
    if (sprite) {
      const frame = sprite.spriteFrame;
      if (frame) {
        frame.insetLeft = INNER_PANEL.inset.l;
        frame.insetRight = INNER_PANEL.inset.r;
        frame.insetTop = INNER_PANEL.inset.t;
        frame.insetBottom = INNER_PANEL.inset.b;
      }
      sprite.type = Sprite.Type.SLICED;
      sprite.node.setScale(k, k, 1);
    }
    return node;
  }

  /** 「水晶升级」内面板:标题行(徽记 + 水晶属性提升 + 副标 + Lv.a → Lv.b)+ 六行属性条。 */
  private renderStats(panel: Node, info: GuardCrystalInfoVO, x: number, w: number, top: number, bottom: number, scale: number): void {
    this.mountInnerPanel(panel, 'LobbyGuardCrystalStatsPanel', x, top, w, bottom);
    const current = info.current;
    const next = info.next;
    const pad = 30 * scale;
    const left = x - w / 2 + pad;
    const right = x + w / 2 - pad;
    // 标题行
    const headY = top - 40 * scale;
    const emblemH = 50 * scale;
    this.host.addSprite('LobbyGuardCrystalEmblem', SECTION_EMBLEM.path, left + emblemH / SECTION_EMBLEM.aspect / 2, headY, emblemH / SECTION_EMBLEM.aspect, emblemH, panel);
    const textX = left + emblemH / SECTION_EMBLEM.aspect + 12 * scale;
    const head = this.host.addChildLabel(panel, 'LobbyGuardCrystalStatsTitle', '水晶属性提升', textX, headY + 10 * scale, 22 * scale, GOLD_TEXT, new Size(220 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
    head.isBold = true;
    const sub = this.host.addChildLabel(panel, 'LobbyGuardCrystalStatsSub', '每一次升级,都让水晶在黑暗中更加璀璨', textX, headY - 14 * scale, FONT.tiny * scale, DIM_TEXT, new Size(w * 0.5, 20 * scale), HorizontalTextAlignment.LEFT);
    sub.overflow = Label.Overflow.SHRINK;
    // 列:名称 | 当前 | → | 下一级 | (增量)
    const colCur = x + w * 0.1;
    const colArrow = x + w * 0.2;
    const colNext = x + w * 0.3;
    const colDelta = right - 34 * scale;
    const lvText = next ? `Lv.${info.level}` : `Lv.${info.level} · 满级`;
    const lvCur = this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadCur', lvText, colCur, headY, FONT.name * scale, GOLD_TEXT, new Size(140 * scale, 26 * scale));
    lvCur.isBold = true;
    if (next) {
      this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadArrow', '→', colArrow, headY, FONT.name * scale, GOLD_TEXT, new Size(40 * scale, 26 * scale));
      const lvNext = this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadNext', `Lv.${info.level + 1}`, colNext, headY, FONT.name * scale, GOLD_TEXT, new Size(120 * scale, 26 * scale));
      lvNext.isBold = true;
    }
    const divY = headY - emblemH / 2 - 8 * scale;
    const div = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalStatsDivider', x, divY, w - pad * 2, 2);
    const dg = div.addComponent(Graphics);
    dg.strokeColor = rgba(190, 140, 70, 120);
    dg.lineWidth = 1;
    dg.moveTo(-(w - pad * 2) / 2, 0);
    dg.lineTo((w - pad * 2) / 2, 0);
    dg.stroke();

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
    const rowsTop = divY - 10 * scale;
    const avail = rowsTop - (bottom + 16 * scale);
    const gap = 6 * scale;
    const rowH = Math.min(46 * scale, (avail - gap * (rows.length - 1)) / rows.length);
    const rowW = w - pad * 2;
    rows.forEach((row, index) => {
      const y = rowsTop - rowH / 2 - index * (rowH + gap);
      this.mountSliced(panel, `LobbyGuardCrystalRow${row.key}`, STAT_ROW, x, y, rowW, rowH);
      const icon = STAT_ICON[row.key];
      const iconH = rowH * 0.66;
      const iconW = Math.min(iconH / icon.aspect, iconH * 1.4);
      this.host.addSprite(`Icon${row.key}`, icon.path, left + 22 * scale, y, iconW, iconW * icon.aspect, panel);
      this.host.addChildLabel(panel, `LobbyGuardCrystalRowName${row.key}`, row.name, left + 48 * scale, y, FONT.body * scale, rgba(236, 224, 196), new Size(150 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
      const curValue = row.read(current);
      const cur = this.host.addChildLabel(panel, `LobbyGuardCrystalRowCur${row.key}`, row.fmt(curValue), colCur, y, FONT.name * scale, GOLD_TEXT, new Size(120 * scale, 26 * scale));
      cur.isBold = true;
      if (next) {
        const nextValue = row.read(next);
        const changed = nextValue !== curValue;
        this.host.addChildLabel(panel, `LobbyGuardCrystalRowArrow${row.key}`, '→', colArrow, y, FONT.body * scale, rgba(170, 150, 110), new Size(40 * scale, 26 * scale));
        const nextLabel = this.host.addChildLabel(panel, `LobbyGuardCrystalRowNext${row.key}`, row.fmt(nextValue), colNext, y, FONT.name * scale, changed ? GREEN_TEXT : rgba(200, 186, 160), new Size(120 * scale, 26 * scale));
        nextLabel.isBold = changed;
        this.host.addChildLabel(panel, `LobbyGuardCrystalRowDelta${row.key}`, changed ? `(${row.delta(nextValue - curValue)})` : '(—)', colDelta, y, FONT.tiny * scale, changed ? rgba(150, 240, 160, 220) : rgba(160, 146, 120), new Size(80 * scale, 22 * scale));
      }
    });
  }

  /** 「水晶升级」底部:说明框(升级消耗:金币 / 守卫晶核 需要+持有,不足标红 + 来源)+ 升级按钮。 */
  private renderUpgradeFooter(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, y: number, h: number, scale: number): void {
    const gold = Number(info.goldBalance ?? 0);
    const core = Number(info.coreBalance ?? 0);
    const goldCost = info.nextUpgradeGold ?? 0;
    const coreCost = info.nextUpgradeCore ?? 0;
    const maxed = info.level >= info.maxLevel || info.nextUpgradeGold === null;
    const goldOk = gold >= goldCost;
    const coreOk = core >= coreCost;
    const btnW = Math.min(w * 0.4, h / BTN_LEVEL_UP.aspect);
    const btnH = btnW * BTN_LEVEL_UP.aspect;
    const gap = 14 * scale;
    const boxW = w - btnW - gap;
    const boxX = x - w / 2 + boxW / 2;
    const box = this.mountSliced(panel, 'LobbyGuardCrystalPreviewBox', PREVIEW_BOX, boxX, y, boxW, h);
    void box;
    const k = h / PREVIEW_BOX.h;
    const textLeft = boxX - boxW / 2 + 118 * k;
    const textW = boxW - 118 * k - 16 * scale;
    const title = this.host.addChildLabel(panel, 'LobbyGuardCrystalPreviewTitle', maxed ? '已升到满级' : '升级消耗', textLeft, y + h * 0.26, FONT.small * scale, GOLD_TEXT, new Size(textW, 22 * scale), HorizontalTextAlignment.LEFT);
    title.isBold = true;
    if (!maxed) {
      const items: Array<{ key: string; icon: string; need: number; have: number; ok: boolean }> = [
        { key: 'Gold', icon: GOLD_ICON, need: goldCost, have: gold, ok: goldOk },
        { key: 'Core', icon: CORE_ICON, need: coreCost, have: core, ok: coreOk },
      ];
      const itemW = textW / 2;
      items.forEach((item, index) => {
        const ix = textLeft + index * itemW;
        const iconSize = 24 * scale;
        this.host.addSprite(`LobbyGuardCrystalCostIcon${item.key}`, item.icon, ix + iconSize / 2, y - 2 * scale, iconSize, iconSize, panel);
        const text = this.host.addChildLabel(panel, `LobbyGuardCrystalCost${item.key}`, `${this.host.formatInteger(item.need)} / ${this.host.formatInteger(item.have)}`, ix + iconSize + 6 * scale, y - 2 * scale, FONT.small * scale, item.ok ? rgba(236, 224, 196) : rgba(255, 130, 110), new Size(itemW - iconSize - 10 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
        text.overflow = Label.Overflow.SHRINK;
        text.isBold = !item.ok;
      });
    }
    const source = this.host.addChildLabel(panel, 'LobbyGuardCrystalCoreSource', maxed ? '水晶已达当前版本上限' : '守卫晶核:主线关卡首次通关、每日副本胜利获得', textLeft, y - h * 0.28, 13 * scale, DIM_TEXT, new Size(textW, 20 * scale), HorizontalTextAlignment.LEFT);
    source.overflow = Label.Overflow.SHRINK;

    const btnX = x + w / 2 - btnW / 2;
    const button = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalUpgrade', btnX, y, btnW, btnH);
    this.host.addSprite('LobbyGuardCrystalUpgradeArt', BTN_LEVEL_UP.path, 0, 0, btnW, btnH, button);
    const label = this.host.addChildLabel(button, 'LobbyGuardCrystalUpgradeLabel', maxed ? '已满级' : `升到 Lv.${info.level + 1}`, 0, 0, 24 * scale, rgba(255, 238, 200), new Size(btnW * 0.66, 32 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    this.outline(label, scale, rgba(60, 12, 8, 255));
    this.bindUpgradeButton(button, info, state, maxed, goldOk, coreOk, gold, core, goldCost, coreCost);
  }

  /** 升级按钮通用行为:满级 / 忙灰显;不足时本地先拦并提示差多少。 */
  private bindUpgradeButton(button: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, maxed: boolean, goldOk: boolean, coreOk: boolean, gold: number, core: number, goldCost: number, coreCost: number): void {
    void info;
    if (maxed || state.busy) {
      button.addComponent(UIOpacity).opacity = 140;
      return;
    }
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

  /** 法术图标:新素材本身是带金框的圆章;狂战号角暂无新图 → 程序画同款圆框 + 旧图标。 */
  private mountSpellIcon(parent: Node, name: string, id: GuardSpellId, x: number, y: number, size: number, dimmed: boolean): Node {
    const holder = this.host.addChildPlainNode(parent, name, x, y, size, size);
    if (id === 'warhorn') {
      const g = holder.addComponent(Graphics);
      g.fillColor = rgba(24, 12, 10, 240);
      g.circle(0, 0, size * 0.46);
      g.fill();
      g.strokeColor = rgba(200, 150, 70, 240);
      g.lineWidth = Math.max(2, size * 0.04);
      g.circle(0, 0, size * 0.46);
      g.stroke();
      this.host.addSprite('Icon', SPELL_ICON[id], 0, 0, size * 0.6, size * 0.6, holder);
    } else {
      this.host.addSprite('Icon', SPELL_ICON[id], 0, 0, size, size, holder);
    }
    if (dimmed) {
      holder.addComponent(UIOpacity).opacity = 110;
    }
    return holder;
  }

  /** 「法术装备」内面板:法术装备槽(编号菱形 + 圆章 + 名)+ 法术列表 2 列 × 3 行。 */
  private renderLoadout(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, bottom: number, scale: number): void {
    this.mountInnerPanel(panel, 'LobbyGuardCrystalSpellsPanel', x, top, w, bottom);
    const slots = this.slotsOf(info);
    const loadout = this.loadoutOf(info);
    const unlocked = this.unlockedOf(info);
    if (!state.selectedSpell) {
      state.selectedSpell = loadout[0] ?? 'quake';
    }
    const target = state.targetSlot >= 0 && state.targetSlot < slots ? state.targetSlot : slots - 1;
    const pad = 30 * scale;
    const left = x - w / 2 + pad;
    const right = x + w / 2 - pad;

    // 法术装备槽
    const headY = top - 36 * scale;
    const head = this.host.addChildLabel(panel, 'LobbyGuardCrystalLoadoutTitle', '法术装备槽', left, headY, 22 * scale, GOLD_TEXT, new Size(200 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
    head.isBold = true;
    const count = this.host.addChildLabel(panel, 'LobbyGuardCrystalLoadoutCount', `已装备 ${loadout.length}/${slots}`, right, headY, FONT.small * scale, DIM_TEXT, new Size(160 * scale, 22 * scale), HorizontalTextAlignment.RIGHT);
    count.overflow = Label.Overflow.SHRINK;
    this.drawDivider(panel, 'LobbyGuardCrystalLoadoutDivider', x, headY - 18 * scale, w - pad * 2);

    const socket = 82 * scale;
    const shown = slots + (info.nextSlotLevel ? 1 : 0);
    const spacing = Math.min(170 * scale, (w - pad * 2) / Math.max(3, shown));
    const socketY = headY - 32 * scale - socket / 2;
    for (let i = 0; i < shown; i++) {
      const sx = x + (i - (shown - 1) / 2) * spacing;
      const open = i < slots;
      const id = open ? loadout[i] : undefined;
      const isTarget = open && loadout.length >= slots && i === target && slots > 1;
      const node = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSocket_${i}`, sx, socketY, socket, socket);
      const ring = node.addComponent(Graphics);
      ring.fillColor = rgba(10, 8, 8, open ? 230 : 160);
      ring.circle(0, 0, socket / 2);
      ring.fill();
      ring.strokeColor = isTarget ? rgba(150, 240, 160, 255) : open ? rgba(170, 128, 64, 200) : rgba(100, 88, 72, 170);
      ring.lineWidth = isTarget ? 3.5 : 2;
      ring.circle(0, 0, socket / 2 + (isTarget ? 3 * scale : 0));
      ring.stroke();
      if (id) {
        this.mountSpellIcon(node, 'Icon', id, 0, 0, socket * 1.02, false);
      } else if (!open) {
        this.host.addSprite('Lock', LOCK_ICON.path, 0, 0, socket * 0.34, socket * 0.34 * LOCK_ICON.aspect, node);
      } else {
        this.host.addChildLabel(node, 'Empty', '空', 0, 0, FONT.small * scale, rgba(150, 130, 100), new Size(socket, 22 * scale));
      }
      this.drawIndexDiamond(node, `${i + 1}`, -socket * 0.46, socket * 0.4, 30 * scale, open, scale);
      const caption = open ? (id ? GUARD_SPELLS[id].name : '空格位') : `水晶 Lv.${info.nextSlotLevel} 解锁`;
      const cap = this.host.addChildLabel(panel, `LobbyGuardCrystalSocketName_${i}`, caption, sx, socketY - socket / 2 - 16 * scale, FONT.body * scale, open ? rgba(240, 228, 200) : rgba(255, 170, 120), new Size(spacing, 24 * scale));
      cap.overflow = Label.Overflow.SHRINK;
      cap.isBold = !!id;
      if (open && id && state.noticeGood && state.notice.indexOf('已保存') >= 0 && i === target) {
        const flashHolder = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSocketFlash_${i}`, sx, socketY, 10, 10);
        this.mountSpineFx(flashHolder, LOBBY_CRYSTAL_FX.equipFlash, 0, 0, socket * 2.2 * LOBBY_CRYSTAL_FX.equipFlash.size, false, LOBBY_CRYSTAL_FX.equipFlash.holdMs);
      }
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

    // 法术列表
    const listHeadY = socketY - socket / 2 - 50 * scale;
    const listHead = this.host.addChildLabel(panel, 'LobbyGuardCrystalListTitle', '法术列表', left, listHeadY, 22 * scale, GOLD_TEXT, new Size(160 * scale, 28 * scale), HorizontalTextAlignment.LEFT);
    listHead.isBold = true;
    const hintText = loadout.length >= slots && slots > 1 ? '点格位选中后,再点法术「替换」' : '点击法术查看详情,选择后装备到上方槽位';
    const hint = this.host.addChildLabel(panel, 'LobbyGuardCrystalLoadoutHint', hintText, right, listHeadY, FONT.tiny * scale, DIM_TEXT, new Size(w * 0.62, 22 * scale), HorizontalTextAlignment.RIGHT);
    hint.overflow = Label.Overflow.SHRINK;
    this.drawDivider(panel, 'LobbyGuardCrystalListDivider', x, listHeadY - 18 * scale, w - pad * 2);

    const cols = 2;
    const cardGap = 10 * scale;
    const gridTop = listHeadY - 28 * scale;
    const cardW = (w - pad * 2 - cardGap) / cols;
    const rowsN = Math.ceil(GUARD_SPELL_IDS.length / cols);
    const cardH = Math.min(58 * scale, (gridTop - (bottom + 14 * scale) - cardGap * (rowsN - 1)) / rowsN);
    GUARD_SPELL_IDS.forEach((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cx = left + cardW / 2 + col * (cardW + cardGap);
      const cy = gridTop - cardH / 2 - row * (cardH + cardGap);
      const open = unlocked.indexOf(id) >= 0;
      const slotIndex = loadout.indexOf(id);
      const selected = state.selectedSpell === id;
      const card = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSpell_${id}`, cx, cy, cardW, cardH);
      const g = card.addComponent(Graphics);
      const equipped = slotIndex >= 0;
      g.fillColor = equipped ? rgba(62, 42, 16, 235) : rgba(16, 12, 10, 225);
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6 * scale);
      g.fill();
      g.strokeColor = selected ? rgba(255, 238, 170, 255) : equipped ? rgba(214, 168, 92, 240) : rgba(120, 96, 62, 150);
      g.lineWidth = selected ? 3 : equipped ? 2 : 1.2;
      g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6 * scale);
      g.stroke();
      const iconSize = cardH * 0.84;
      this.mountSpellIcon(card, 'Icon', id, -cardW / 2 + 10 * scale + iconSize / 2, 0, iconSize, !open);
      const textX = -cardW / 2 + 20 * scale + iconSize;
      const textW = cardW - iconSize - 60 * scale;
      const name = this.host.addChildLabel(card, 'Name', GUARD_SPELLS[id].name, textX, cardH * 0.2, FONT.body * scale, open ? rgba(244, 232, 204) : rgba(170, 156, 136), new Size(textW, 24 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      name.isBold = true;
      const status = !open ? `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁` : equipped ? `已装备(${slotIndex + 1}号位)` : '未装备';
      const statusLabel = this.host.addChildLabel(card, 'Status', status, textX, -cardH * 0.2, FONT.tiny * scale, !open ? rgba(230, 190, 120) : equipped ? GREEN_TEXT : rgba(140, 190, 240), new Size(textW, 20 * scale), HorizontalTextAlignment.LEFT);
      statusLabel.overflow = Label.Overflow.SHRINK;
      if (!open) {
        this.host.addSprite('Lock', LOCK_ICON.path, cardW / 2 - 26 * scale, 0, 22 * scale, 22 * scale * LOCK_ICON.aspect, card);
      }
      card.addComponent(Button);
      card.on(Button.EventType.CLICK, () => {
        const current = this.host.currentGuardCrystalState();
        if (current) {
          current.selectedSpell = id;
          this.host.refreshGuardCrystalDialog();
        }
      }, this);
      this.host.applyImageButtonFeedback(card, 1.02, 0.98);
    });
  }

  private drawDivider(panel: Node, name: string, x: number, y: number, w: number): void {
    const node = this.host.addChildPlainNode(panel, name, x, y, w, 2);
    const g = node.addComponent(Graphics);
    g.strokeColor = rgba(190, 140, 70, 110);
    g.lineWidth = 1;
    g.moveTo(-w / 2, 0);
    g.lineTo(w / 2, 0);
    g.stroke();
  }

  /** 格位编号:金边菱形 + 数字。 */
  private drawIndexDiamond(parent: Node, text: string, x: number, y: number, size: number, open: boolean, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'Index', x, y, size, size);
    const g = node.addComponent(Graphics);
    const r = size / 2;
    g.fillColor = rgba(24, 16, 10, 245);
    g.moveTo(0, r);
    g.lineTo(r, 0);
    g.lineTo(0, -r);
    g.lineTo(-r, 0);
    g.close();
    g.fill();
    g.strokeColor = open ? rgba(214, 170, 96, 255) : rgba(120, 104, 88, 200);
    g.lineWidth = 2;
    g.moveTo(0, r);
    g.lineTo(r, 0);
    g.lineTo(0, -r);
    g.lineTo(-r, 0);
    g.close();
    g.stroke();
    const label = this.host.addChildLabel(node, 'Text', text, 0, 0, FONT.small * scale, open ? GOLD_TEXT : rgba(160, 146, 120), new Size(size, size));
    label.isBold = true;
  }

  /** 「法术装备」底部:选中法术详情框(圆章 + 名 + 状态胶囊 + 能量 + 说明 + 装备/替换)+ 升级按钮(带晶体图标 + 金币花费)。 */
  private renderSpellFooter(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, y: number, h: number, scale: number): void {
    const id = state.selectedSpell ?? 'quake';
    const def = GUARD_SPELLS[id];
    const slots = this.slotsOf(info);
    const loadout = this.loadoutOf(info);
    const open = this.unlockedOf(info).indexOf(id) >= 0;
    const slotIndex = loadout.indexOf(id);
    const btnW = Math.min(w * 0.36, h / BTN_COST_UP.aspect);
    const btnH = btnW * BTN_COST_UP.aspect;
    const gap = 14 * scale;
    const boxW = w - btnW - gap;
    const boxX = x - w / 2 + boxW / 2;
    const box = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalSpellDetail', boxX, y, boxW, h);
    const g = box.addComponent(Graphics);
    g.fillColor = rgba(14, 10, 8, 240);
    g.roundRect(-boxW / 2, -h / 2, boxW, h, 8 * scale);
    g.fill();
    g.strokeColor = rgba(190, 140, 70, 200);
    g.lineWidth = 1.5;
    g.roundRect(-boxW / 2, -h / 2, boxW, h, 8 * scale);
    g.stroke();
    const iconSize = h * 0.74;
    this.mountSpellIcon(box, 'Icon', id, -boxW / 2 + 10 * scale + iconSize / 2, 0, iconSize, !open);
    const textX = -boxW / 2 + 20 * scale + iconSize;
    const textW = boxW - iconSize - 32 * scale;
    const name = this.host.addChildLabel(box, 'Name', def.name, textX, h * 0.3, FONT.name * scale, GOLD_TEXT, new Size(110 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
    name.isBold = true;
    // 状态胶囊 / 操作按钮
    const target = state.targetSlot >= 0 && state.targetSlot < slots ? state.targetSlot : slots - 1;
    let pillText = '';
    let action: (() => void) | null = null;
    if (!open) {
      pillText = `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`;
    } else if (slotIndex >= 0) {
      pillText = `已装备(${slotIndex + 1}号位)`;
    } else if (loadout.length < slots) {
      pillText = '装备';
      action = () => this.host.setGuardCrystalLoadout(loadout.concat([id]));
    } else {
      pillText = `替换第 ${target + 1} 格`;
      action = () => {
        const next = loadout.slice();
        next[target] = id;
        this.host.setGuardCrystalLoadout(next);
      };
    }
    const pillW = 128 * scale;
    const pillH = 26 * scale;
    const pill = this.host.addChildPlainNode(box, 'Action', textX + 116 * scale + pillW / 2, h * 0.3, pillW, pillH);
    const pg = pill.addComponent(Graphics);
    const pillFill = action ? rgba(130, 34, 22, 245) : slotIndex >= 0 ? rgba(24, 60, 32, 235) : rgba(60, 44, 24, 230);
    const pillStroke = action ? rgba(255, 196, 120, 240) : slotIndex >= 0 ? rgba(120, 220, 140, 220) : rgba(200, 160, 90, 200);
    pg.fillColor = pillFill;
    pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
    pg.fill();
    pg.strokeColor = pillStroke;
    pg.lineWidth = 1.5;
    pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
    pg.stroke();
    const pillLabel = this.host.addChildLabel(pill, 'Text', pillText, 0, 0, FONT.tiny * scale, action ? rgba(255, 238, 200) : slotIndex >= 0 ? GREEN_TEXT : rgba(230, 196, 130), new Size(pillW - 10 * scale, pillH));
    pillLabel.overflow = Label.Overflow.SHRINK;
    pillLabel.isBold = true;
    if (action && !state.busy) {
      const run = action;
      pill.addComponent(Button);
      pill.on(Button.EventType.CLICK, () => run(), this);
      this.host.applyImageButtonFeedback(pill, 1.06, 0.95);
    }
    const energy = this.host.addChildLabel(box, 'Meta', `能量 ${def.cost}`, textX, h * 0.05, FONT.small * scale, rgba(160, 210, 255), new Size(textW, 20 * scale), HorizontalTextAlignment.LEFT);
    energy.overflow = Label.Overflow.SHRINK;
    const desc = this.host.addChildLabel(box, 'Desc', SPELL_DETAIL[id], textX, -h * 0.24, 13 * scale, rgba(222, 210, 186), new Size(textW, h * 0.42), HorizontalTextAlignment.LEFT);
    desc.enableWrapText = true;
    desc.lineHeight = 17 * scale;
    desc.verticalAlign = VerticalTextAlignment.CENTER;
    desc.overflow = Label.Overflow.SHRINK;

    // 升级按钮(法术页也能直接升水晶;素材自带晶体图标)
    const gold = Number(info.goldBalance ?? 0);
    const core = Number(info.coreBalance ?? 0);
    const goldCost = info.nextUpgradeGold ?? 0;
    const coreCost = info.nextUpgradeCore ?? 0;
    const maxed = info.level >= info.maxLevel || info.nextUpgradeGold === null;
    const btnX = x + w / 2 - btnW / 2;
    const button = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalUpgrade', btnX, y, btnW, btnH);
    this.host.addSprite('LobbyGuardCrystalUpgradeArt', BTN_COST_UP.path, 0, 0, btnW, btnH, button);
    const label = this.host.addChildLabel(button, 'LobbyGuardCrystalUpgradeLabel', maxed ? '已满级' : `升级 ${this.host.formatInteger(goldCost)}`, btnW * 0.08, 0, 22 * scale, gold >= goldCost ? rgba(255, 238, 200) : rgba(255, 170, 150), new Size(btnW * 0.56, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    this.outline(label, scale, rgba(60, 12, 8, 255));
    this.bindUpgradeButton(button, info, state, maxed, gold >= goldCost, core >= coreCost, gold, core, goldCost, coreCost);
  }

  private mountSpineFx(parent: Node, spec: { effect: string; animation: string }, x: number, y: number, sizePx: number, loop: boolean, holdMs: number): boolean {
    return mountLobbySpineFx(this.host, parent, spec, x, y, sizePx, loop, holdMs) !== null;
  }

  private renderNotice(panel: Node, state: LobbyGuardCrystalDialogState, panelW: number, panelH: number, scale: number): void {
    if (!state.notice) {
      return;
    }
    const label = this.host.addChildLabel(panel, 'LobbyGuardCrystalNotice', state.notice, 0, -panelH / 2 + 58 * scale, FONT.body * scale, state.noticeGood ? GREEN_TEXT : rgba(255, 130, 110), new Size(panelW * 0.6, 26 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, rgba(10, 8, 6, 255));
  }

  private outline(label: Label, scale: number, color: Color): void {
    label.enableOutline = true;
    label.outlineColor = color;
    label.outlineWidth = Math.max(1, 2 * scale);
  }
}
