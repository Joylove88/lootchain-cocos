import {
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
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
  GUARD_SPELL_MAX_LEVEL,
  guardResolveSpellLoadout,
  guardSpellDescribe,
  guardSpellNextDiff,
  guardSpellTier,
  type GuardSpellId,
} from './GuardBattleModel';
import { GUARD_SPELL_FX, LOBBY_CRYSTAL_FX } from './LobbyBattleAttackFxConfig';
import { mountLobbySpineFx } from './LobbyUiSpineFx';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { mountKitLoading } from '../UiKit';
import { mountRefButton, mountRefSliced, REF_CLOSE_ASSET, REF_KIT, type RefKitItem } from '../UiRefKit';
import { renderTopCurrencyBar } from '../UiSceneBackButton';
import { isPhoneDesign } from '../../app/ScreenAdapter';

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
  /** 刚升级的法术(docs/39:卡片播一次闪光后清空)。 */
  spellFlash?: { id: GuardSpellId; level: number } | null;
}

export interface LobbyGuardCrystalDialogHost {
  currentGuardCrystalState(): LobbyGuardCrystalDialogState | null;
  closeGuardCrystalDialog(): void;
  upgradeGuardCrystal(): void;
  setGuardCrystalLoadout(spells: string[]): void;
  /** 法术升 1 级(docs/39)。 */
  upgradeGuardSpell(spellId: string): void;
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

const TITLE_DIVIDER_L = { path: 'ui/common/ai/title_divider_left/spriteFrame', aspect: 76 / 390 };
const TITLE_DIVIDER_R = { path: 'ui/common/ai/title_divider_right/spriteFrame', aspect: 73 / 392 };
const CLOSE_BUTTON = { path: 'ui/common/ai/button_close/spriteFrame', aspect: 161 / 155 };
const LOCK_ICON = { path: 'ui/common/ai/ic_lock/spriteFrame', aspect: 192 / 135 };
const GOLD_ICON = 'ui/common/ai/ic_gold_medium/spriteFrame';
/** 守卫晶核图标(背包同一张,LobbyBagPanelRenderer.BAG_AI_ITEM_ICON_ASSETS.GUARD_CORE)。 */
const CORE_ICON = 'ui/bag/ai/icon_guard_core/spriteFrame';
/**
 * 字号层级(2026-10-14 用户「字体看着很乱」统一):title 页题 42 / section 小节与页签 22 / value 数值 22 / body 正文与行名 18 /
 * small 次要 16 / tiny 注释 14 / button 按钮 24;全部乘 scale。颜色只用五种:金(标题 / 数值 / 强调)、米白(正文)、绿(提升)、灰(次要)、红(不足)。
 */
const FONT = { title: 42, section: 22, value: 22, body: 18, name: 20, small: 16, tiny: 14, button: 24 };

// ── 2026-09-30 用户新素材 ui/crystal/ai(原图备份 asset-src/ai-raw/crystal-ui-20260930,中文名已改英文)──
const CUI = (name: string): string => `ui/crystal/ai/${name}/spriteFrame`;
// ── 2026-10-14 v4(用户新参考图,Codex 按参考图重出):整页场景底图 / 水晶 + 黑色哥特台座 / 等级牌 / 页签 / 题头八角星 ──
/** 场景底图(夜间教堂,左侧蓝光舞台),按 cover 铺满舞台。 */
const SCENE_BG = { path: CUI('crystal_scene_bg'), w: 1672, h: 941 };
/** 水晶立绘 v2(蓝水晶 + 黑色尖刺台座);v2 未入库时退回 v1(515×798 熔岩基座版)。 */
const CRYSTAL_ART = { path: CUI('crystal_art_v2'), aspect: 1024 / 585, fallback: { path: CUI('crystal_art'), aspect: 798 / 515 } };
const TITLE_EMBLEM = { path: CUI('title_emblem_v2'), aspect: 512 / 512 };
/** 法术详情演示框通用底图(暗色法阵场景);2026-10-14 用户要求每个法术各一张专属插画 → 优先 SPELL_ART,缺图退回这张。 */
const SPELL_PREVIEW_BG = { path: CUI('spell_preview_bg'), w: 1024, h: 768 };
const SPELL_ART: Record<GuardSpellId, string> = {
  quake: CUI('spell_art_quake'), frost: CUI('spell_art_frost'), thunder: CUI('spell_art_thunder'),
  goldrush: CUI('spell_art_goldrush'), aegis: CUI('spell_art_aegis'), warhorn: CUI('spell_art_warhorn'),
};
/** 等级牌 550×177、页签 选中 440×122 / 未选中 512×122、升级按钮 573×180、法术页升级按钮(带晶体图标)527×154。 */
const LEVEL_PLATE = { path: CUI('level_plate_v2'), aspect: 193 / 1024, fallback: { path: CUI('level_plate'), aspect: 177 / 550 } };
const TAB_ON = { path: CUI('tab_on_v2'), aspect: 195 / 1024, fallback: { path: CUI('tab_on'), aspect: 122 / 440 } };
const TAB_OFF = { path: CUI('tab_off_v2'), aspect: 159 / 1024, fallback: { path: CUI('tab_off'), aspect: 122 / 512 } };
interface ArtSpec { path: string; aspect: number; fallback?: { path: string; aspect: number } }
const BTN_LEVEL_UP = { path: CUI('btn_level_up'), aspect: 180 / 573 };
const BTN_COST_UP = { path: CUI('btn_cost_up'), aspect: 154 / 527 };
/** 九宫格素材:源尺寸 + 边距(源像素)。显示时按目标高度等比缩放、只横向/纵向拉中段,角饰不变形。 */
const INNER_PANEL = { path: CUI('inner_panel_bg'), w: 1948, h: 1259, inset: { l: 110, r: 110, t: 110, b: 110 } };
const STAT_ROW = { path: CUI('stat_row_bg'), w: 1066, h: 84, inset: { l: 60, r: 60, t: 0, b: 0 } };
const SECTION_EMBLEM = { path: CUI('section_emblem'), aspect: 121 / 107 };
// 2026-10-16 用户「水晶界面和其他界面风格不太像」:换成布阵 / 锻造同一套素材(标题牌、关闭钮、页签、细金框、列表行、红金按钮)
const REF_TITLE_PLAQUE = { path: 'ui/formation/ref/title_plaque/spriteFrame', aspect: 564 / 180 };
const REF_TAB_ON: RefKitItem = { path: 'ui/formation/ref/tab_on/spriteFrame', w: 309, h: 64, inset: [20, 20, 20, 20] };
const REF_TAB_OFF: RefKitItem = { path: 'ui/formation/ref/tab_off/spriteFrame', w: 252, h: 64, inset: [20, 20, 20, 20] };
const REF_ROW: RefKitItem = { path: 'ui/forge/ref/row_normal/spriteFrame', w: 538, h: 120, inset: [40, 40, 32, 32] };
const REF_ROW_SELECTED: RefKitItem = { path: 'ui/forge/ref/row_selected/spriteFrame', w: 535, h: 120, inset: [40, 40, 32, 32] };
const REF_ICON_RING = 'ui/common/ref/icon_ring/spriteFrame';
/** 场景底图里地面法阵中心:图宽 18.5%、图高 78%(水晶脚底对准这里)。 */
const SCENE_FLOOR = { x: 0.185, y: 0.78 };
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
/**
 * 手机横屏全屏版(2026-10-02 用户:「横屏模式下弹框都调整成全屏」):面板铺满舞台、程序画框;
 * 内部基准 scale 按可用高度定(电脑版 840 高面板里内容区约 582),左栏立绘区加宽、右栏随屏宽变宽,
 * 法术列表改 3 列 × 2 行(宽而矮的内容区放 2 列 × 3 行会把卡片压扁),法术详情框加高放下两行描述。
 */
const GOLD_TEXT = rgba(236, 202, 122);
const CREAM_TEXT = rgba(240, 230, 206);
const GREEN_TEXT = rgba(140, 236, 150);
const DIM_TEXT = rgba(176, 160, 136);
const RED_TEXT = rgba(255, 122, 100);

export class LobbyGuardCrystalDialogRenderer {
  /** 本次渲染是否手机全屏版(render 开头确定)。 */
  private phone = false;

  /** 场景地面法阵中心的 y(面板坐标),render 时按底图位置算。 */
  private floorY = 0;

  constructor(private readonly host: LobbyGuardCrystalDialogHost) {}

  /**
   * 小字标签盒高:手机端工厂把 <20 号字抬到 20 并 SHRINK,盒子仍按电脑版 20~22 高会把字又压回十三四号,
   * 所以手机端盒高至少 26(电脑端原样 base * scale)。
   */
  private lh(base: number, scale: number): number {
    return this.phone ? Math.max(base * scale, 26) : base * scale;
  }

  render(layout: UiLayout): void {
    const state = this.host.currentGuardCrystalState();
    if (!state) {
      return;
    }
    // 2026-10-14 用户参考图 v4:弹窗改成整页——教堂场景底图铺满舞台、左上题头 + 右上货币栏 + 关闭,
    // 左 1/3 水晶舞台,右 2/3 页签 + 内面板;电脑与手机同一套比例(按舞台宽高取位,字号乘 scale)。
    const phone = isPhoneDesign();
    this.phone = phone;
    const W = layout.stageWidth;
    const H = layout.stageHeight;
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;
    const scale = Math.max(0.8, Math.min(1.25, H / 820));
    const overlay = this.host.createUiNode('LobbyGuardCrystalOverlay');
    overlay.setPosition(new Vec3(centerX, centerY, 0));
    overlay.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    overlay.addComponent(BlockInputEvents);
    const dim = overlay.addComponent(Graphics);
    dim.fillColor = rgba(4, 3, 6, 255);
    dim.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dim.fill();
    const panel = this.host.addChildPlainNode(overlay, 'LobbyGuardCrystalPanel', 0, 0, W, H);
    panel.addComponent(BlockInputEvents);
    const L = -W / 2;
    const T = H / 2;

    // 场景底图(参考图:夜间哥特教堂 + 左侧蓝光舞台),cover 铺满;没图时深色兜底
    const cover = Math.max(W / SCENE_BG.w, H / SCENE_BG.h);
    const bgH = SCENE_BG.h * cover;
    // 地面法阵目标落在舞台 76% 高处;底图比舞台高时(手机 20:9)整体上挪,挪动量不超过可裁余量
    const bgY = Math.max(-(bgH - H) / 2, Math.min((bgH - H) / 2, (SCENE_FLOOR.y - 0.5) * bgH - 0.26 * H));
    this.floorY = bgY + (0.5 - SCENE_FLOOR.y) * bgH;
    const bg = this.host.addSprite('LobbyGuardCrystalSceneBg', SCENE_BG.path, 0, bgY, SCENE_BG.w * cover, bgH, panel);
    if (!bg) {
      const g = panel.addComponent(Graphics);
      g.fillColor = rgba(10, 8, 12, 255);
      g.rect(-W / 2, -H / 2, W, H);
      g.fill();
    }

    // 题头:恶魔徽章标题牌 +「守卫水晶」(与布阵 / 锻造同款);缺图退回八角星徽记 + 金字
    const plaqueH = 0.098 * H;
    const plaqueW = plaqueH * REF_TITLE_PLAQUE.aspect;
    const plaqueX = L + 0.006 * W + plaqueW / 2;
    const plaqueY = T - 0.052 * H;
    const plaque = this.host.addSprite('LobbyGuardCrystalTitlePlaque', REF_TITLE_PLAQUE.path, plaqueX, plaqueY, plaqueW, plaqueH, panel);
    if (plaque) {
      const title = this.host.addChildLabel(panel, 'LobbyGuardCrystalTitle', '守卫水晶', plaqueX + plaqueW * 0.05, plaqueY, 32 * scale, rgba(244, 222, 176), new Size(plaqueW * 0.46, 44 * scale));
      title.overflow = Label.Overflow.SHRINK;
      title.isBold = true;
      this.outline(title, scale, rgba(20, 12, 6, 255));
    } else {
      const emblemH = 0.075 * H;
      this.host.addSprite('LobbyGuardCrystalTitleEmblem', TITLE_EMBLEM.path, L + 0.05 * W, plaqueY, emblemH / TITLE_EMBLEM.aspect, emblemH, panel);
      const title = this.host.addChildLabel(panel, 'LobbyGuardCrystalTitle', '守卫水晶', L + 0.088 * W, plaqueY, FONT.title * scale, GOLD_TEXT, new Size(0.24 * W, FONT.title * scale + 8), HorizontalTextAlignment.LEFT);
      title.isBold = true;
      this.outline(title, scale, rgba(40, 24, 8, 255));
    }

    // 右上:货币栏(金币 / 守卫晶核)+ 关闭
    const closeSize = 0.052 * H;
    const closeX = L + 0.972 * W;
    const closeY = T - 0.052 * H;
    const close = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalClose', closeX, closeY, closeSize * 1.25, closeSize * 1.25);
    if (!this.host.addSprite('LobbyGuardCrystalCloseArt', REF_CLOSE_ASSET, 0, 0, closeSize * 1.25, closeSize * 1.25, close)) {
      this.host.addSprite('LobbyGuardCrystalCloseArt', CLOSE_BUTTON.path, 0, 0, closeSize, closeSize * CLOSE_BUTTON.aspect, close);
    }
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeGuardCrystalDialog(), this);
    this.host.applyImageButtonFeedback(close, 1.08, 0.94);
    const info = state.info;
    if (info) {
      // 货币胶囊:与锻造 / 英雄页同款顶栏(bag_currency_bar)
      renderTopCurrencyBar(this.host, panel, W / 2, H / 2, scale, [
        { key: 'gold', icon: GOLD_ICON, value: this.host.formatInteger(Number(info.goldBalance ?? 0)) },
        { key: 'core', icon: CORE_ICON, value: this.host.formatInteger(Number(info.coreBalance ?? 0)) },
      ], (W / 2 - (closeX - closeSize * 0.75)) / scale + 10);
    }

    const bodyTop = T - 0.165 * H;
    const bodyBottom = -T + 0.05 * H;
    if (!info || this.host.isGuardCrystalAssetsLoading()) {
      // 2026-10-11 统一读取态(UiKit.mountKitLoading);不可用仍用一行提示
      if (state.loading || info) {
        mountKitLoading(this.host, panel, 0, 0, scale, '水晶读取中…');
      } else {
        this.host.addChildLabel(panel, 'LobbyGuardCrystalLoading', '守卫水晶暂不可用', 0, 0, FONT.body * scale, CREAM_TEXT, new Size(W * 0.6, 26 * scale));
      }
      this.renderNotice(panel, state, W, H, scale);
      return;
    }
    // 左 1/3 水晶舞台(参考图水晶中心在 19% 宽处),右 62% 内容列(35.5% → 97.5%)
    const leftX = L + 0.19 * W;
    const leftW = 0.3 * W;
    const rightLeft = L + 0.355 * W;
    const rightRight = L + 0.975 * W;
    const rightW = rightRight - rightLeft;
    const rightX = (rightLeft + rightRight) / 2;
    this.renderCrystal(panel, info, state, leftX, leftW, scale, W, H);
    this.renderTabs(panel, state, info, rightLeft, scale, W, H);
    if (state.tab === 'spells') {
      this.renderSpellsPage(panel, state, info, rightX, rightW, bodyTop, bodyBottom, scale);
    } else {
      const footerH = 0.105 * H;
      const footerY = -T + 0.08 * H + footerH / 2;
      const innerBottom = footerY + footerH / 2 + 0.03 * H;
      this.renderStats(panel, info, rightX, rightW, bodyTop, innerBottom, scale);
      this.renderUpgradeFooter(panel, info, state, rightX, rightW, footerY, footerH, scale);
    }
    this.renderNotice(panel, state, W, H, scale);
    if (state.busy) {
      const coverNode = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalBusy', 0, 0, W, H);
      coverNode.addComponent(BlockInputEvents);
    }
  }

  /** 新素材缺时退回旧素材:按高度等比,宽随所用素材的宽高比。返回所用素材的宽高比(没图返回 null)。 */
  private spriteByHeight(parent: Node, name: string, spec: ArtSpec, x: number, y: number, h: number): { sprite: Sprite; aspect: number } | null {
    const primary = this.host.addSprite(name, spec.path, x, y, h / spec.aspect, h, parent);
    if (primary) {
      return { sprite: primary, aspect: spec.aspect };
    }
    if (spec.fallback) {
      const fallback = this.host.addSprite(name, spec.fallback.path, x, y, h / spec.fallback.aspect, h, parent);
      if (fallback) {
        return { sprite: fallback, aspect: spec.fallback.aspect };
      }
    }
    return null;
  }

  /** 右上货币栏(参考图 2):深色胶囊 + 图标 + 数额,右对齐排到关闭按钮左侧。 */
  private renderCurrencyBar(panel: Node, info: GuardCrystalInfoVO, rightEdge: number, y: number, scale: number, W: number, H: number): void {
    const capH = 0.046 * H;
    const capW = Math.max(0.1 * W, 120 * scale);
    const gap = 0.012 * W;
    const items: Array<{ key: string; icon: string; value: number }> = [
      { key: 'Core', icon: CORE_ICON, value: Number(info.coreBalance ?? 0) },
      { key: 'Gold', icon: GOLD_ICON, value: Number(info.goldBalance ?? 0) },
    ];
    let cursor = rightEdge;
    items.forEach((item) => {
      const cx = cursor - capW / 2;
      cursor -= capW + gap;
      const cap = this.host.addChildPlainNode(panel, `LobbyGuardCrystalCurrency${item.key}`, cx, y, capW, capH);
      const g = cap.addComponent(Graphics);
      g.fillColor = rgba(10, 8, 8, 225);
      g.roundRect(-capW / 2, -capH / 2, capW, capH, capH / 2);
      g.fill();
      g.strokeColor = rgba(190, 150, 80, 220);
      g.lineWidth = 1.5;
      g.roundRect(-capW / 2, -capH / 2, capW, capH, capH / 2);
      g.stroke();
      const iconSize = capH * 0.8;
      this.host.addSprite('Icon', item.icon, -capW / 2 + iconSize / 2 + 4 * scale, 0, iconSize, iconSize, cap);
      const text = this.host.addChildLabel(cap, 'Text', this.host.formatInteger(item.value), -capW / 2 + iconSize + 10 * scale, 0, FONT.body * scale, CREAM_TEXT, new Size(capW - iconSize - 16 * scale, capH), HorizontalTextAlignment.LEFT);
      text.overflow = Label.Overflow.SHRINK;
      text.isBold = true;
    });
  }

  /** 左侧水晶舞台(参考图):背景光 + 法阵 + 立绘 + 等级牌 + 进度条 + 「n / 30 级」+ 下一级解锁提示(两侧花边)。 */
  private renderCrystal(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, scale: number, W: number, H: number): void {
    const T = H / 2;
    // 用户 2026-10-16「左侧水晶没有贴在地面上」:立绘底边(台座尖脚)落到场景地面法阵中心,去掉上下浮动
    const floorY = Math.max(T - 0.78 * H, Math.min(T - 0.72 * H, this.floorY));
    const artH = 0.53 * H;
    const artY = floorY + artH / 2 - 0.015 * H;
    // 接触阴影:台座尖脚下一圈柔和暗椭圆,让立绘「踩」在地面上
    const contact = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalContactShadow', x, floorY + 0.004 * H, w, 0.06 * H).addComponent(Graphics);
    [1, 0.75, 0.5].forEach((k) => {
      contact.fillColor = rgba(0, 0, 4, 70);
      contact.ellipse(0, 0, w * 0.36 * k, 0.026 * H * k);
      contact.fill();
    });
    const pedestalHolder = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalPedestal', x, floorY, 10, 10);
    const pedestalMounted = this.mountSpineFx(pedestalHolder, LOBBY_CRYSTAL_FX.pedestal, 0, 0, artH * LOBBY_CRYSTAL_FX.pedestal.size, true, 0);
    if (!pedestalMounted) {
      const pg = pedestalHolder.addComponent(Graphics);
      pg.fillColor = rgba(60, 140, 220, 42);
      pg.ellipse(0, 0, w * 0.42, artH * 0.14);
      pg.fill();
    }
    const auraHolder = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalGlow', x, artY + artH * 0.1, 10, 10);
    this.mountSpineFx(auraHolder, LOBBY_CRYSTAL_FX.aura, 0, 0, artH * LOBBY_CRYSTAL_FX.aura.size, true, 0);
    const art = this.spriteByHeight(panel, 'LobbyGuardCrystalArt', CRYSTAL_ART, x, artY, artH)?.sprite ?? null;
    if (art) {
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
    // 等级牌:压在台座下沿(参考图 Lv.5 牌在 70% 高处)
    const plateH = 0.062 * H;
    // 等级牌放在台座下方(不再挡住尖脚),水晶直接踩在地面法阵上
    const plateY = floorY - 0.052 * H;
    const plate = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLevelBadge', x, plateY, plateH / LEVEL_PLATE.aspect, plateH);
    const plateArt = this.spriteByHeight(plate, 'Art', LEVEL_PLATE, 0, 0, plateH);
    const plateW = plateH / (plateArt?.aspect ?? LEVEL_PLATE.aspect);
    const level = this.host.addChildLabel(plate, 'Text', `Lv.${info.level}`, 0, 1 * scale, FONT.title * 0.9 * scale, CREAM_TEXT, new Size(plateW * 0.7, FONT.title * scale));
    level.isBold = true;
    this.outline(level, scale, rgba(10, 20, 40, 255));
    // 进度条 + 「n / 30 级」+ 解锁提示 底下垫一层柔和暗底:场景底图这块是亮蓝光地板,直接写字看不清
    const barW = 0.21 * W;
    const barH = 0.012 * H;
    const barY = plateY - 0.056 * H;
    const shadeW = w * 0.98;
    const shadeTop = barY + 0.03 * H;
    const shadeBottom = T - 0.985 * H;
    const shade = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLowerShade', x, (shadeTop + shadeBottom) / 2, shadeW, shadeTop - shadeBottom);
    const sg = shade.addComponent(Graphics);
    for (let i = 4; i >= 1; i--) {
      // 四层叠加的圆角矩形,外圈透明度递减,近似羽化
      const k = i / 4;
      sg.fillColor = rgba(4, 4, 8, Math.round(70 * (1 - k) + 40));
      sg.roundRect(-shadeW * k / 2, -(shadeTop - shadeBottom) * k / 2, shadeW * k, (shadeTop - shadeBottom) * k, 0.04 * H);
      sg.fill();
    }
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
    const cap = this.host.addChildLabel(panel, 'LobbyGuardCrystalLevelCap', info.level >= info.maxLevel ? '已升到满级' : `${info.level} / ${info.maxLevel} 级`, x, barY - 0.03 * H, FONT.body * scale, CREAM_TEXT, new Size(barW + 40 * scale, this.lh(24, scale)));
    cap.overflow = Label.Overflow.SHRINK;
    this.outline(cap, scale, rgba(6, 6, 10, 255));
    // 下一级解锁提示(最多两行),两侧花边(参考图)
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
    let cursor = barY - 0.07 * H;
    hints.slice(0, 2).forEach((text, index) => {
      const hint = this.host.addChildLabel(panel, `LobbyGuardCrystalNextUnlock${index}`, text, x, cursor, FONT.body * scale, GOLD_TEXT, new Size(w * 0.8, this.lh(24, scale)));
      hint.overflow = Label.Overflow.SHRINK;
      this.outline(hint, scale, rgba(6, 6, 10, 255));
      if (index === 0) {
        const half = Math.min(0.11 * W, text.length * FONT.body * scale * 0.52);
        const ornW = 0.034 * W;
        this.host.addSprite('LobbyGuardCrystalHintOrnL', TITLE_DIVIDER_L.path, x - half - ornW / 2, cursor, ornW, ornW * TITLE_DIVIDER_L.aspect, panel);
        this.host.addSprite('LobbyGuardCrystalHintOrnR', TITLE_DIVIDER_R.path, x + half + ornW / 2, cursor, ornW, ornW * TITLE_DIVIDER_R.aspect, panel);
      }
      cursor -= this.lh(26, scale);
    });
  }

  /** 右侧页签(参考图:选中 = 亮金边深底,未选中 = 暗边),与内面板左边对齐。 */
  private renderTabs(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, left: number, scale: number, W: number, H: number): void {
    const tabH = 0.064 * H;
    const y = H / 2 - 0.112 * H;
    const gap = 0.012 * W;
    const tabs: Array<{ key: LobbyGuardCrystalDialogState['tab']; text: string }> = [
      { key: 'upgrade', text: '水晶升级' },
      { key: 'spells', text: `法术装备 ${this.loadoutOf(info).length}/${this.slotsOf(info)}` },
    ];
    let cursor = left + 0.01 * W;
    tabs.forEach((tab) => {
      const active = state.tab === tab.key;
      const spec = active ? TAB_ON : TAB_OFF;
      // 两个页签同宽(0.17W),高度按各自素材比例(选中款边框粗、略高,正好像凸起)
      const tabW = 0.17 * W;
      const node = this.host.addChildPlainNode(panel, `LobbyGuardCrystalTab_${tab.key}`, 0, y, tabW, tabH);
      if (!mountRefSliced(this.host, node, 'Art', active ? REF_TAB_ON : REF_TAB_OFF, 0, 0, tabW, tabH * 0.86, 2)) {
        const primary = this.host.addSprite('Art', spec.path, 0, 0, tabW, tabW * spec.aspect, node);
        if (!primary && spec.fallback) {
          this.host.addSprite('Art', spec.fallback.path, 0, 0, tabW, tabW * spec.fallback.aspect, node);
        }
      }
      const tx = cursor + tabW / 2;
      node.setPosition(tx, y, 0);
      cursor += tabW + gap;
      const label = this.host.addChildLabel(node, 'Text', tab.text, 0, 0, FONT.section * scale, active ? rgba(255, 240, 206) : rgba(196, 188, 172), new Size(tabW - 24 * scale, 30 * scale));
      label.isBold = true;
      label.overflow = Label.Overflow.SHRINK;
      this.outline(label, scale, rgba(10, 8, 6, 255));
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
    // 2026-10-16:套件细金框(与锻造 / 布阵面板一致),内里垫实底压住场景
    const back = this.host.addChildPlainNode(node, 'Back', 0, 0, w - 8, h - 8).addComponent(Graphics);
    back.fillColor = rgba(10, 9, 12, 218);
    back.roundRect(-(w - 8) / 2, -(h - 8) / 2, w - 8, h - 8, 8);
    back.fill();
    if (mountRefSliced(this.host, node, 'Frame', REF_KIT.cardFrame, 0, 0, w, h)) {
      return node;
    }
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
    // 标题行:标题带(深红渐变 + 金线)+ 大号亮金粗体标题 + 副标,和下面的属性行拉开层级
    const bandH = 70 * scale;
    const headY = top - 14 * scale - bandH / 2;
    this.drawHeaderBand(panel, 'LobbyGuardCrystalStatsBand', x, headY, w - pad, bandH, scale);
    const emblemH = 52 * scale;
    this.host.addSprite('LobbyGuardCrystalEmblem', SECTION_EMBLEM.path, left + emblemH / SECTION_EMBLEM.aspect / 2, headY, emblemH / SECTION_EMBLEM.aspect, emblemH, panel);
    const textX = left + emblemH / SECTION_EMBLEM.aspect + 12 * scale;
    const head = this.host.addChildLabel(panel, 'LobbyGuardCrystalStatsTitle', '水晶属性提升', textX, headY + 11 * scale, 27 * scale, rgba(255, 222, 140), new Size(260 * scale, 34 * scale), HorizontalTextAlignment.LEFT);
    head.isBold = true;
    this.outline(head, scale, rgba(40, 14, 6, 255));
    const sub = this.host.addChildLabel(panel, 'LobbyGuardCrystalStatsSub', '每一次升级,都让水晶在黑暗中更加璀璨', textX, headY - 17 * scale, FONT.tiny * scale, rgba(206, 184, 150), new Size(w * 0.5, this.lh(20, scale)), HorizontalTextAlignment.LEFT);
    sub.overflow = Label.Overflow.SHRINK;
    // 列:名称 | 当前 | → | 下一级 | (增量)
    const colCur = x + w * 0.1;
    const colArrow = x + w * 0.2;
    const colNext = x + w * 0.3;
    // 手机端增量字被抬到 20 号,列再往里收,别压到属性条右端花边
    const colDelta = right - (this.phone ? 64 : 56) * scale;
    const lvText = next ? `Lv.${info.level}` : `Lv.${info.level} · 满级`;
    const lvCur = this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadCur', lvText, colCur, headY, 25 * scale, rgba(255, 222, 140), new Size(150 * scale, 32 * scale));
    lvCur.isBold = true;
    this.outline(lvCur, scale, rgba(40, 14, 6, 255));
    if (next) {
      this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadArrow', '→', colArrow, headY, 25 * scale, rgba(255, 222, 140), new Size(40 * scale, 32 * scale));
      const lvNext = this.host.addChildLabel(panel, 'LobbyGuardCrystalHeadNext', `Lv.${info.level + 1}`, colNext, headY, 25 * scale, rgba(160, 240, 160), new Size(130 * scale, 32 * scale));
      lvNext.isBold = true;
      this.outline(lvNext, scale, rgba(10, 30, 10, 255));
    }
    const divY = headY - bandH / 2 - 6 * scale;

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
    // 参考图六行属性条撑满面板(行高约面板高 1/8),不再封顶在 46
    const gap = 10 * scale;
    const rowH = Math.min(64 * scale, (avail - gap * (rows.length - 1)) / rows.length);
    const rowW = w - pad * 2;
    rows.forEach((row, index) => {
      const y = rowsTop - rowH / 2 - index * (rowH + gap);
      // 2026-10-16 用户「开局能量图标左边超出边框」「每行内容左右缩进」:行底换细金边暗行;
      // 图标按宽高比装进 rowH×0.66 的方框(宽图标按宽缩),整行内容左右各缩进 22
      if (!mountRefSliced(this.host, panel, `LobbyGuardCrystalRow${row.key}`, REF_ROW, x, y, rowW, rowH)) {
        this.mountSliced(panel, `LobbyGuardCrystalRow${row.key}`, STAT_ROW, x, y, rowW, rowH);
      }
      const icon = STAT_ICON[row.key];
      const iconBox = rowH * 0.66;
      const iconW = icon.aspect >= 1 ? iconBox / icon.aspect : iconBox;
      const iconH = icon.aspect >= 1 ? iconBox : iconBox * icon.aspect;
      const rowInset = 22 * scale;
      this.host.addSprite(`Icon${row.key}`, icon.path, left + rowInset + iconBox / 2, y, iconW, iconH, panel);
      const rowName = this.host.addChildLabel(panel, `LobbyGuardCrystalRowName${row.key}`, row.name, left + rowInset + iconBox + 12 * scale, y, FONT.body * scale, CREAM_TEXT, new Size(150 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
      rowName.isBold = true;
      const curValue = row.read(current);
      const cur = this.host.addChildLabel(panel, `LobbyGuardCrystalRowCur${row.key}`, row.fmt(curValue), colCur, y, FONT.value * scale, CREAM_TEXT, new Size(120 * scale, 26 * scale));
      cur.isBold = true;
      if (next) {
        const nextValue = row.read(next);
        const changed = nextValue !== curValue;
        this.host.addChildLabel(panel, `LobbyGuardCrystalRowArrow${row.key}`, '→', colArrow, y, FONT.body * scale, DIM_TEXT, new Size(40 * scale, 26 * scale));
        const nextLabel = this.host.addChildLabel(panel, `LobbyGuardCrystalRowNext${row.key}`, row.fmt(nextValue), colNext, y, FONT.value * scale, changed ? GREEN_TEXT : DIM_TEXT, new Size(120 * scale, 26 * scale));
        nextLabel.isBold = changed;
        this.host.addChildLabel(panel, `LobbyGuardCrystalRowDelta${row.key}`, changed ? `(${row.delta(nextValue - curValue)})` : '(—)', colDelta, y, FONT.small * scale, changed ? GREEN_TEXT : DIM_TEXT, new Size(80 * scale, this.lh(22, scale)));
      }
    });
  }

  /** 「水晶升级」底部(参考图):深底金边说明框「升级消耗 [金币] 7,500 [晶核] 25 / 15」+ 红色大按钮「升级至 Lv.6」。 */
  private renderUpgradeFooter(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, x: number, w: number, y: number, h: number, scale: number): void {
    const gold = Number(info.goldBalance ?? 0);
    const core = Number(info.coreBalance ?? 0);
    const goldCost = info.nextUpgradeGold ?? 0;
    const coreCost = info.nextUpgradeCore ?? 0;
    const maxed = info.level >= info.maxLevel || info.nextUpgradeGold === null;
    const goldOk = gold >= goldCost;
    const coreOk = core >= coreCost;
    const btnW = Math.min(w * 0.42, h / BTN_LEVEL_UP.aspect);
    const btnH = btnW * BTN_LEVEL_UP.aspect;
    const gap = 0.018 * w;
    const boxW = w - btnW - gap;
    const boxX = x - w / 2 + boxW / 2;
    const box = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalPreviewBox', boxX, y, boxW, h);
    const g = box.addComponent(Graphics);
    g.fillColor = rgba(10, 9, 12, 218);
    g.roundRect(-boxW / 2, -h / 2, boxW, h, 6 * scale);
    g.fill();
    if (!mountRefSliced(this.host, box, 'Frame', REF_KIT.cardFrame, 0, 0, boxW, h)) {
      g.strokeColor = rgba(190, 146, 76, 210);
      g.lineWidth = 1.5;
      g.roundRect(-boxW / 2, -h / 2, boxW, h, 6 * scale);
      g.stroke();
    }
    const pad = 28 * scale;
    const title = this.host.addChildLabel(box, 'Title', maxed ? '已升到满级' : '升级消耗', -boxW / 2 + pad, h * 0.14, FONT.body * scale, GOLD_TEXT, new Size(110 * scale, this.lh(26, scale)), HorizontalTextAlignment.LEFT);
    title.isBold = true;
    if (!maxed) {
      const items: Array<{ key: string; icon: string; text: string; ok: boolean }> = [
        { key: 'Gold', icon: GOLD_ICON, text: this.host.formatInteger(goldCost), ok: goldOk },
        { key: 'Core', icon: CORE_ICON, text: `${this.host.formatInteger(core)} / ${this.host.formatInteger(coreCost)}`, ok: coreOk },
      ];
      const iconSize = 30 * scale;
      let cursor = -boxW / 2 + pad + 110 * scale;
      items.forEach((item) => {
        this.host.addSprite(`CostIcon${item.key}`, item.icon, cursor + iconSize / 2, h * 0.14, iconSize, iconSize, box);
        const textW = (item.key === 'Gold' ? 110 : 130) * scale;
        const text = this.host.addChildLabel(box, `Cost${item.key}`, item.text, cursor + iconSize + 6 * scale, h * 0.14, FONT.value * scale, item.ok ? CREAM_TEXT : RED_TEXT, new Size(textW, this.lh(28, scale)), HorizontalTextAlignment.LEFT);
        text.overflow = Label.Overflow.SHRINK;
        text.isBold = true;
        cursor += iconSize + textW + 14 * scale;
      });
    }
    const source = this.host.addChildLabel(box, 'Source', maxed ? '水晶已达当前版本上限' : '守卫晶核:主线关卡首次通关、每日副本胜利获得', -boxW / 2 + pad, -h * 0.26, FONT.tiny * scale, DIM_TEXT, new Size(boxW - pad * 2, this.lh(20, scale)), HorizontalTextAlignment.LEFT);
    source.overflow = Label.Overflow.SHRINK;

    const btnX = x + w / 2 - btnW / 2;
    // 红金主钮(套件,与终极技能 / 锻造同款);缺图退回原按钮图
    const refBtnH = Math.min(h, btnW / 3.6);
    const button = mountRefButton(this.host, panel, 'LobbyGuardCrystalUpgrade', maxed ? '已满级' : `升级至 Lv.${info.level + 1}`, btnX, y, btnW, refBtnH, scale, 'primary', undefined, { fontSize: FONT.button * scale });
    if (!button.getChildByName('Art')) {
      this.host.addSprite('LobbyGuardCrystalUpgradeArt', BTN_LEVEL_UP.path, 0, 0, btnW, btnH, button);
    }
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

  // ── 法术装备页(2026-10-14 用户参考图重排:左「已装备的法术」+「法术列表」竖排,右「法术详情」卡;拖拽装备;详情里循环播战斗特效)──

  /** 一行列表里的法术一句话简介(详情里再按等级给完整描述)。 */
  private static readonly SPELL_BRIEF: Record<GuardSpellId, string> = {
    quake: '对全体敌人造成伤害',
    frost: '减速并附带冰冻',
    thunder: '召唤天雷打击敌人',
    goldrush: '获取大量金币',
    aegis: '生成护盾保护水晶',
    warhorn: '提升我方单位攻速',
  };

  /** 本次渲染的装备格(拖拽落点判定用;每次整刷重建)。 */
  private sockets: Array<{ index: number; node: Node; open: boolean; id: GuardSpellId | undefined; hover: Node | null; size: number }> = [];
  private dragGhost: Node | null = null;

  /** 页面:整块内面板;左 53% 装备格 + 列表,右 47% 详情卡。 */
  private renderSpellsPage(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, bottom: number, scale: number): void {
    this.mountInnerPanel(panel, 'LobbyGuardCrystalSpellsPanel', x, top, w, bottom);
    this.sockets = [];
    this.dragGhost = null;
    const loadout = this.loadoutOf(info);
    if (!state.selectedSpell) {
      state.selectedSpell = loadout[0] ?? 'quake';
    }
    const pad = 26 * scale;
    const colGap = 18 * scale;
    const innerW = w - pad * 2;
    const leftColW = (innerW - colGap) * 0.53;
    const rightColW = innerW - colGap - leftColW;
    const leftColX = x - w / 2 + pad + leftColW / 2;
    const rightColX = x + w / 2 - pad - rightColW / 2;
    const colTop = top - 22 * scale;
    const colBottom = bottom + 20 * scale;
    this.renderSpellColumn(panel, state, info, leftColX, leftColW, colTop, colBottom, scale);
    this.renderSpellDetail(panel, state, info, rightColX, rightColW, colTop, colBottom, scale);
  }

  /**
   * 标题带(2026-10-16 用户「标题要和下面列表做出层级区分,现在看着不像标题」):
   * 整条暗红实底 + 左侧提亮渐变 + 底边金线 + 金线两端菱形点;标题字放大加粗压在上面。
   */
  private drawHeaderBand(parent: Node, name: string, x: number, y: number, w: number, h: number, scale: number): void {
    const band = this.host.addChildPlainNode(parent, name, x, y, w, h);
    const g = band.addComponent(Graphics);
    // 整条实心暗红打底(用户:「红色没有填充满」),左侧再叠一层提亮,形成左亮右暗但填满的标题带
    g.fillColor = rgba(62, 16, 12, 232);
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    const steps = 24;
    for (let i = 0; i < steps; i += 1) {
      const t = i / steps;
      const alpha = Math.round(110 * (1 - t) * (1 - t));
      if (alpha <= 0) {
        continue;
      }
      g.fillColor = rgba(150, 38, 26, alpha);
      g.rect(-w / 2 + (w * i) / steps, -h / 2, w / steps, h);
      g.fill();
    }
    g.strokeColor = rgba(214, 170, 92, 230);
    g.lineWidth = Math.max(1.5, 1.6 * scale);
    g.moveTo(-w / 2, -h / 2);
    g.lineTo(w / 2, -h / 2);
    g.stroke();
    g.strokeColor = rgba(214, 170, 92, 90);
    g.lineWidth = 1;
    g.moveTo(-w / 2, h / 2);
    g.lineTo(w / 2, h / 2);
    g.stroke();
    this.fillDiamond(band, -w / 2, -h / 2, 5 * scale, 5 * scale, rgba(236, 196, 112));
    this.fillDiamond(band, w / 2, -h / 2, 5 * scale, 5 * scale, rgba(236, 196, 112));
  }

  /** 小节标题:徽记 + 金字;右侧可带一行灰字。 */
  private sectionHead(panel: Node, key: string, text: string, left: number, right: number, y: number, scale: number, note?: string): void {
    this.drawHeaderBand(panel, `${key}Band`, (left + right) / 2, y, right - left, 38 * scale, scale);
    const emblemH = 30 * scale;
    this.host.addSprite(`${key}Emblem`, SECTION_EMBLEM.path, left + 6 * scale + emblemH / SECTION_EMBLEM.aspect / 2, y, emblemH / SECTION_EMBLEM.aspect, emblemH, panel);
    const textX = left + 6 * scale + emblemH / SECTION_EMBLEM.aspect + 8 * scale;
    const head = this.host.addChildLabel(panel, `${key}Title`, text, textX, y, 24 * scale, rgba(255, 222, 140), new Size(220 * scale, 30 * scale), HorizontalTextAlignment.LEFT);
    head.isBold = true;
    this.outline(head, scale, rgba(40, 14, 6, 255));
    if (note) {
      const noteLabel = this.host.addChildLabel(panel, `${key}Note`, note, right - 10 * scale, y, FONT.small * scale, rgba(206, 184, 150), new Size(Math.max(120 * scale, (right - textX) * 0.7), this.lh(22, scale)), HorizontalTextAlignment.RIGHT);
      noteLabel.overflow = Label.Overflow.SHRINK;
    }
  }

  /** 左列:装备格一排(编号 + 圆章 + 名)+ 六行法术列表(图标 / 名 / 简介 / 状态);列表行与装备格都可拖。 */
  private renderSpellColumn(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, bottom: number, scale: number): void {
    const slots = this.slotsOf(info);
    const loadout = this.loadoutOf(info);
    const unlocked = this.unlockedOf(info);
    const left = x - w / 2;
    const right = x + w / 2;
    const target = state.targetSlot >= 0 && state.targetSlot < slots ? state.targetSlot : slots - 1;

    // 已装备的法术
    const headY = top - 19 * scale;
    this.sectionHead(panel, 'LobbyGuardCrystalLoadout', '已装备的法术', left, right, headY, scale, `${loadout.length}/${slots}`);
    const socket = Math.min(74 * scale, w / 4.6);
    const shown = slots + (info.nextSlotLevel ? 1 : 0);
    const spacing = Math.min(132 * scale, w / Math.max(3, shown));
    const socketY = headY - 34 * scale - socket / 2;
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
      ring.strokeColor = isTarget ? rgba(150, 240, 160, 255) : open ? rgba(190, 146, 72, 220) : rgba(100, 88, 72, 170);
      ring.lineWidth = isTarget ? 3 : 2;
      ring.circle(0, 0, socket / 2 + (isTarget ? 2 * scale : 0));
      ring.stroke();
      let hover: Node | null = null;
      if (open) {
        // 拖拽悬停高亮环(默认隐藏)
        hover = this.host.addChildPlainNode(node, 'Hover', 0, 0, socket, socket);
        const hg = hover.addComponent(Graphics);
        hg.strokeColor = rgba(170, 250, 180, 255);
        hg.lineWidth = 4;
        hg.circle(0, 0, socket / 2 + 5 * scale);
        hg.stroke();
        hg.fillColor = rgba(120, 240, 140, 40);
        hg.circle(0, 0, socket / 2);
        hg.fill();
        hover.active = false;
      }
      // 金环(套件,与终极技能弹窗同款)套在格位外圈
      this.host.addSprite('Ring', REF_ICON_RING, 0, 0, socket * 1.22, socket * 1.22, node);
      if (id) {
        this.mountSpellIcon(node, 'Icon', id, 0, 0, socket * 1.02, false);
      } else if (!open) {
        this.host.addSprite('Lock', LOCK_ICON.path, 0, 0, socket * 0.34, socket * 0.34 * LOCK_ICON.aspect, node);
      } else {
        this.host.addChildLabel(node, 'Empty', '拖入', 0, 0, FONT.small * scale, DIM_TEXT, new Size(socket, 22 * scale));
      }
      this.drawIndexDiamond(node, `${i + 1}`, 0, socket * 0.5, 26 * scale, open, scale);
      const caption = open ? (id ? GUARD_SPELLS[id].name : '空格位') : `Lv.${info.nextSlotLevel} 解锁`;
      const cap = this.host.addChildLabel(panel, `LobbyGuardCrystalSocketName_${i}`, caption, sx, socketY - socket / 2 - 14 * scale, FONT.small * scale, open ? CREAM_TEXT : DIM_TEXT, new Size(spacing, this.lh(22, scale)));
      cap.overflow = Label.Overflow.SHRINK;
      cap.isBold = !!id;
      if (open && id && state.noticeGood && state.notice.indexOf('已保存') >= 0 && i === target) {
        const flashHolder = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSocketFlash_${i}`, sx, socketY, 10, 10);
        this.mountSpineFx(flashHolder, LOBBY_CRYSTAL_FX.equipFlash, 0, 0, socket * 2.2 * LOBBY_CRYSTAL_FX.equipFlash.size, false, LOBBY_CRYSTAL_FX.equipFlash.holdMs);
      }
      this.sockets.push({ index: i, node, open, id, hover, size: socket });
      if (open) {
        // 点格位 = 选中格位(作为「装备」按钮的目标)并选中其中法术;拖格位里的法术到另一格 = 互换
        this.bindSpellDrag(panel, node, id ?? null, i, socket * 1.02, scale, () => {
          const current = this.host.currentGuardCrystalState();
          if (current) {
            current.targetSlot = i;
            if (id) {
              current.selectedSpell = id;
            }
            this.host.refreshGuardCrystalDialog();
          }
        });
      }
    }

    // 法术列表
    const listHeadY = socketY - socket / 2 - 42 * scale;
    this.sectionHead(panel, 'LobbyGuardCrystalList', '法术列表', left, right, listHeadY, scale, '拖到上方格位即可装备');
    const gridTop = listHeadY - 28 * scale;
    // 行距 14、行高上限 56(2026-10-14 用户:列表紧挨在一起太紧凑)
    const gap = 14 * scale;
    const rowsN = GUARD_SPELL_IDS.length;
    const rowH = Math.min(56 * scale, (gridTop - bottom - gap * (rowsN - 1)) / rowsN);
    GUARD_SPELL_IDS.forEach((id, index) => {
      const cy = gridTop - rowH / 2 - index * (rowH + gap);
      const open = unlocked.indexOf(id) >= 0;
      const slotIndex = loadout.indexOf(id);
      const equipped = slotIndex >= 0;
      const selected = state.selectedSpell === id;
      const card = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSpell_${id}`, x, cy, w, rowH);
      if (!mountRefSliced(this.host, card, 'Bg', selected ? REF_ROW_SELECTED : REF_ROW, 0, 0, w, rowH)) {
        const g = card.addComponent(Graphics);
        g.fillColor = selected ? rgba(44, 32, 16, 240) : equipped ? rgba(30, 22, 12, 235) : rgba(14, 11, 9, 225);
        g.roundRect(-w / 2, -rowH / 2, w, rowH, 6 * scale);
        g.fill();
        g.strokeColor = selected ? rgba(255, 232, 160, 255) : equipped ? rgba(200, 156, 84, 220) : rgba(110, 90, 60, 150);
        g.lineWidth = selected ? 2.5 : 1.2;
        g.roundRect(-w / 2, -rowH / 2, w, rowH, 6 * scale);
        g.stroke();
      }
      const iconSize = rowH * 0.72;
      const iconX = -w / 2 + 20 * scale + iconSize / 2;
      this.mountSpellIcon(card, 'Icon', id, iconX, 0, iconSize, !open);
      const textX = -w / 2 + 32 * scale + iconSize;
      const pillW = 96 * scale;
      const textW = w - iconSize - pillW - 36 * scale;
      const name = this.host.addChildLabel(card, 'Name', GUARD_SPELLS[id].name, textX, rowH * 0.22, FONT.name * scale, open ? CREAM_TEXT : DIM_TEXT, new Size(textW, this.lh(24, scale)), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      name.isBold = true;
      const brief = this.host.addChildLabel(card, 'Brief', LobbyGuardCrystalDialogRenderer.SPELL_BRIEF[id], textX, -rowH * 0.22, FONT.small * scale, DIM_TEXT, new Size(textW, this.lh(20, scale)), HorizontalTextAlignment.LEFT);
      brief.overflow = Label.Overflow.SHRINK;
      // 右端统一成同宽胶囊(2026-10-14 第二轮:三种状态样式不一显得乱):已装备 = 金边金字;未装备 = 灰边「Lv.n」;未解锁 = 灰边「Lv.n 解锁」+ 小锁
      const spellLv = this.spellLevelOf(info, id);
      const pillH = 26 * scale;
      const pillX = w / 2 - 20 * scale - pillW / 2;
      const pill = this.host.addChildPlainNode(card, 'StatePill', pillX, 0, pillW, pillH);
      const pg = pill.addComponent(Graphics);
      pg.fillColor = equipped ? rgba(44, 30, 12, 245) : rgba(18, 14, 12, 230);
      pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 5 * scale);
      pg.fill();
      pg.strokeColor = equipped ? rgba(220, 176, 96, 240) : rgba(110, 96, 72, 200);
      pg.lineWidth = 1.5;
      pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 5 * scale);
      pg.stroke();
      const pillText = !open ? `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁` : equipped ? '已装备' : `Lv.${spellLv.level}`;
      const lockW = open ? 0 : 16 * scale;
      const pillLabel = this.host.addChildLabel(pill, 'Text', pillText, -lockW / 2, 0, FONT.small * scale, equipped ? GOLD_TEXT : DIM_TEXT, new Size(pillW - 8 * scale - lockW, pillH));
      pillLabel.overflow = Label.Overflow.SHRINK;
      pillLabel.isBold = equipped;
      if (!open) {
        this.host.addSprite('Lock', LOCK_ICON.path, pillW / 2 - 6 * scale - lockW / 2, 0, lockW, lockW * LOCK_ICON.aspect, pill);
      }
      if (open && this.spellUpgradable(info, spellLv)) {
        const dot = this.host.addChildPlainNode(card, 'RedDot', w / 2 - 6 * scale, rowH / 2 - 6 * scale, 12 * scale, 12 * scale);
        const dg = dot.addComponent(Graphics);
        dg.fillColor = rgba(230, 50, 40, 255);
        dg.circle(0, 0, 5 * scale);
        dg.fill();
      }
      if (open && state.spellFlash && state.spellFlash.id === id) {
        this.mountSpineFx(card, LOBBY_CRYSTAL_FX.equipFlash, 0, 0, rowH * 2.4 * LOBBY_CRYSTAL_FX.equipFlash.size, false, LOBBY_CRYSTAL_FX.equipFlash.holdMs);
      }
      // 点一下 = 看详情;拖到上方格位 = 装备 / 替换(未解锁只能看)
      this.bindSpellDrag(panel, card, open ? id : null, -1, socket, scale, () => {
        const current = this.host.currentGuardCrystalState();
        if (current) {
          current.selectedSpell = id;
          this.host.refreshGuardCrystalDialog();
        }
      });
    });
  }

  /**
   * 拖拽装备(2026-10-14 用户:「法术装备需要调整成拖拽装备」):按住法术行 / 装备格里的法术拖出一个圆章幽灵,
   * 松手落在开放格位上 = 装到那一格(格里原有的被替换;从格位拖来则两格互换);位移 <10px 视为点击。
   * fromSlot = -1 表示从列表拖;id = null 表示不可拖(未解锁 / 空格位),只响应点击。
   */
  private bindSpellDrag(panel: Node, node: Node, id: GuardSpellId | null, fromSlot: number, ghostSize: number, scale: number, onTap: () => void): void {
    const panelTransform = panel.getComponent(UITransform);
    let movedPx = 0;
    let dragging = false;
    const toPanel = (event: { getUILocation?: () => { x: number; y: number } }): Vec3 | null => {
      if (!panelTransform || typeof event.getUILocation !== 'function') {
        return null;
      }
      const ui = event.getUILocation();
      return panelTransform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    };
    const hoveredSocket = (pos: Vec3) => {
      for (const socket of this.sockets) {
        if (!socket.open || socket.index === fromSlot) {
          continue;
        }
        const dx = pos.x - socket.node.position.x;
        const dy = pos.y - socket.node.position.y;
        if (Math.hypot(dx, dy) <= socket.size * 0.8) {
          return socket;
        }
      }
      return null;
    };
    const clearHover = () => {
      for (const socket of this.sockets) {
        if (socket.hover && socket.hover.isValid) {
          socket.hover.active = false;
        }
      }
    };
    const endDrag = (event: { getUILocation?: () => { x: number; y: number } } | null) => {
      node.setScale(1, 1, 1);
      const ghost = this.dragGhost;
      this.dragGhost = null;
      clearHover();
      if (!dragging) {
        if (movedPx < 10) {
          onTap();
        }
        return;
      }
      dragging = false;
      const pos = ghost && ghost.isValid ? ghost.position.clone() : (event ? toPanel(event) : null);
      if (ghost && ghost.isValid) {
        ghost.destroy();
      }
      if (!pos || !id) {
        return;
      }
      const socket = hoveredSocket(pos);
      const current = this.host.currentGuardCrystalState();
      const info = current?.info;
      if (!socket || !current || !info || current.busy) {
        return;
      }
      const loadout = this.loadoutOf(info);
      if (loadout[socket.index] === id) {
        return;
      }
      const next = loadout.slice();
      const already = next.indexOf(id);
      if (already >= 0) {
        // 已在别的格里(从列表拖已装备的,或从格位拖):两格互换
        next[already] = next[socket.index];
      }
      next[socket.index] = id;
      current.targetSlot = socket.index;
      current.selectedSpell = id;
      this.host.setGuardCrystalLoadout(next.filter((entry): entry is GuardSpellId => !!entry));
    };
    node.on(Node.EventType.TOUCH_START, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      movedPx = 0;
      dragging = false;
      node.setScale(0.97, 0.97, 1);
    }, this);
    node.on(Node.EventType.TOUCH_MOVE, (event: { getUIDelta?: () => { x: number; y: number }; getUILocation?: () => { x: number; y: number } }) => {
      if (!node.isValid) {
        return;
      }
      const delta = event.getUIDelta ? event.getUIDelta() : { x: 0, y: 0 };
      movedPx += Math.abs(delta.x) + Math.abs(delta.y);
      if (!id) {
        return;
      }
      if (!dragging && movedPx >= 10) {
        const current = this.host.currentGuardCrystalState();
        if (!current || current.busy) {
          return;
        }
        dragging = true;
        node.setScale(1, 1, 1);
        const start = toPanel(event);
        const ghost = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalDragGhost', start ? start.x : 0, start ? start.y : 0, ghostSize, ghostSize);
        this.mountSpellIcon(ghost, 'Icon', id, 0, 0, ghostSize * 1.15, false);
        ghost.addComponent(UIOpacity).opacity = 235;
        ghost.setSiblingIndex(panel.children.length - 1);
        this.dragGhost = ghost;
      }
      const ghost = this.dragGhost;
      if (!dragging || !ghost || !ghost.isValid) {
        return;
      }
      const pos = toPanel(event);
      if (pos) {
        ghost.setPosition(pos.x, pos.y, 0);
      } else {
        ghost.setPosition(ghost.position.x + delta.x, ghost.position.y + delta.y, 0);
      }
      const over = hoveredSocket(ghost.position);
      for (const socket of this.sockets) {
        if (socket.hover && socket.hover.isValid) {
          socket.hover.active = socket === over;
        }
      }
    }, this);
    node.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean; getUILocation?: () => { x: number; y: number } }) => {
      if (event) {
        event.propagationStopped = true;
      }
      endDrag(event);
    }, this);
    node.on(Node.EventType.TOUCH_CANCEL, (event: { getUILocation?: () => { x: number; y: number } }) => endDrag(event), this);
    void scale;
  }

  /**
   * 右列「法术详情」卡(参考图;2026-10-14 第二轮「法术页还是乱」重排):自下而上先排定按钮 / 花费 / 对照表 / 描述的高度,
   * 剩下的高度全部给特效演示框(参考图里插画占卡片近一半,不再留空白);演示框铺通用法阵底图(spell_preview_bg),
   * 法术的战斗骨骼特效循环播在上面;能量并入标题行,不再孤零零挂在框角。
   */
  private renderSpellDetail(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, bottom: number, scale: number): void {
    const id = state.selectedSpell ?? 'quake';
    const def = GUARD_SPELLS[id];
    const slots = this.slotsOf(info);
    const loadout = this.loadoutOf(info);
    const open = this.unlockedOf(info).indexOf(id) >= 0;
    const slotIndex = loadout.indexOf(id);
    const spellLv = this.spellLevelOf(info, id);
    const h = top - bottom;
    const card = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalSpellDetail', x, (top + bottom) / 2, w, h);
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(12, 9, 8, 215);
    g.roundRect(-w / 2, -h / 2, w, h, 8 * scale);
    g.fill();
    if (!mountRefSliced(this.host, card, 'Frame', REF_KIT.cardFrame, 0, 0, w, h)) {
      g.strokeColor = rgba(190, 146, 76, 210);
      g.lineWidth = 1.5;
      g.roundRect(-w / 2, -h / 2, w, h, 8 * scale);
      g.stroke();
    }
    const pad = 16 * scale;
    const left = -w / 2 + pad;
    const right = w / 2 - pad;
    const innerW = w - pad * 2;

    // ── 自下而上定高 ──
    const btnW = Math.min(innerW * 0.6, 200 * scale);
    const btnH = btnW * BTN_COST_UP.aspect;
    const costH = this.lh(26, scale);
    const diff = open ? guardSpellNextDiff(id, spellLv.level) : null;
    const rowH = this.lh(24, scale);
    const tableRows = open && diff ? Math.min(3, diff.changes.length) + (diff.unlock ? 1 : 0) : 0;
    const tableH = rowH + 4 * scale + tableRows * rowH;
    const descH = this.lh(this.phone ? 66 : 58, scale);
    const titleH = 36 * scale;
    const gapS = 8 * scale;
    const fixedH = titleH + gapS + descH + gapS + tableH + gapS + costH + gapS + btnH;
    const fxH = Math.max(90 * scale, h - pad * 2 - fixedH - gapS);

    // 标题行:徽记 + 名 + 「能量 n」 + 等级牌
    let cursor = h / 2 - pad;
    this.drawHeaderBand(card, 'TitleBand', 0, cursor - titleH / 2, innerW + 8 * scale, titleH + 8 * scale, scale);
    const emblemH = 28 * scale;
    this.host.addSprite('Emblem', SECTION_EMBLEM.path, left + emblemH / SECTION_EMBLEM.aspect / 2, cursor - titleH / 2, emblemH / SECTION_EMBLEM.aspect, emblemH, card);
    const lvW = 66 * scale;
    const lvH = 24 * scale;
    const energyW = 78 * scale;
    const nameX = left + emblemH / SECTION_EMBLEM.aspect + 8 * scale;
    const name = this.host.addChildLabel(card, 'Name', def.name, nameX, cursor - titleH / 2, 24 * scale, rgba(255, 222, 140), new Size(innerW - lvW - energyW - emblemH - 24 * scale, titleH), HorizontalTextAlignment.LEFT);
    name.isBold = true;
    this.outline(name, scale, rgba(40, 14, 6, 255));
    name.overflow = Label.Overflow.SHRINK;
    // 未解锁时右侧是「Lv.n 解锁」长文字,能量再往左让一截
    const rightTextW = open ? lvW : lvW + 34 * scale;
    const energy = this.host.addChildLabel(card, 'Energy', `能量 ${def.cost}`, right - rightTextW - 12 * scale, cursor - titleH / 2, FONT.small * scale, DIM_TEXT, new Size(energyW, this.lh(22, scale)), HorizontalTextAlignment.RIGHT);
    energy.overflow = Label.Overflow.SHRINK;
    if (open) {
      const maxed = spellLv.level >= GUARD_SPELL_MAX_LEVEL;
      const tier = guardSpellTier(spellLv.level);
      const lvPill = this.host.addChildPlainNode(card, 'Level', right - lvW / 2, cursor - titleH / 2, lvW, lvH);
      const lg = lvPill.addComponent(Graphics);
      lg.fillColor = maxed ? rgba(120, 78, 12, 245) : rgba(20, 16, 12, 235);
      lg.roundRect(-lvW / 2, -lvH / 2, lvW, lvH, lvH / 2);
      lg.fill();
      lg.strokeColor = maxed ? rgba(255, 214, 110, 255) : tier === 2 ? rgba(214, 228, 248, 230) : rgba(190, 150, 90, 220);
      lg.lineWidth = 1.5;
      lg.roundRect(-lvW / 2, -lvH / 2, lvW, lvH, lvH / 2);
      lg.stroke();
      const lvText = this.host.addChildLabel(lvPill, 'Text', maxed ? 'Lv.5 满' : `Lv.${spellLv.level}`, 0, 0, FONT.tiny * scale, maxed ? rgba(255, 230, 140) : CREAM_TEXT, new Size(lvW - 6 * scale, lvH));
      lvText.isBold = true;
      lvText.overflow = Label.Overflow.SHRINK;
    } else {
      const lockPill = this.host.addChildLabel(card, 'Level', `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`, right, cursor - titleH / 2, FONT.tiny * scale, DIM_TEXT, new Size(rightTextW, lvH), HorizontalTextAlignment.RIGHT);
      lockPill.overflow = Label.Overflow.SHRINK;
    }
    cursor -= titleH + gapS;

    // 特效演示框:通用法阵底图(缺图时深底 + 椭圆冷光)+ 战斗骨骼特效循环;四周金线细框
    const fxBox = this.host.addChildPlainNode(card, 'FxBox', 0, cursor - fxH / 2, innerW, fxH);
    // 底图 cover 铺满会超出框,用 Mask 按框矩形裁掉(手画遮边会画到卡片外面,2026-10-14 截图)
    fxBox.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    // 专属插画(1024×768,与通用底图同尺寸)优先,缺图退回通用法阵底图
    const fxBg = this.host.addSprite('Bg', SPELL_ART[id], 0, 0, innerW, fxH, fxBox) ?? this.host.addSprite('Bg', SPELL_PREVIEW_BG.path, 0, 0, innerW, fxH, fxBox);
    if (!fxBg) {
      const fg = fxBox.addComponent(Graphics);
      fg.fillColor = rgba(6, 8, 14, 250);
      fg.roundRect(-innerW / 2, -fxH / 2, innerW, fxH, 6 * scale);
      fg.fill();
      fg.fillColor = rgba(60, 110, 200, 34);
      fg.ellipse(0, -fxH * 0.12, innerW * 0.34, fxH * 0.26);
      fg.fill();
    } else {
      // 底图按 cover 等比铺满,超出框的部分由 Mask 裁掉
      const coverK = Math.max(innerW / SPELL_PREVIEW_BG.w, fxH / SPELL_PREVIEW_BG.h);
      fxBg.node.getComponent(UITransform)?.setContentSize(SPELL_PREVIEW_BG.w * coverK, SPELL_PREVIEW_BG.h * coverK);
    }
    const frame = this.host.addChildPlainNode(fxBox, 'Frame', 0, 0, innerW, fxH);
    const fr = frame.addComponent(Graphics);
    fr.strokeColor = rgba(170, 130, 70, 200);
    fr.lineWidth = 1.5;
    fr.rect(-innerW / 2, -fxH / 2, innerW, fxH);
    fr.stroke();
    const spellFx = GUARD_SPELL_FX[id];
    const fxHolder = this.host.addChildPlainNode(fxBox, 'Fx', 0, 0, 10, 10);
    // 有插画时特效缩小到 0.7 叠在插画上,别把画盖死
    const fxMounted = this.mountSpineFx(fxHolder, spellFx, 0, -fxH * 0.06, Math.min(innerW, fxH) * (fxBg ? 0.7 : 0.95), true, 0);
    if (!fxMounted) {
      this.mountSpellIcon(fxBox, 'Icon', id, 0, 0, Math.min(innerW, fxH) * 0.6, !open);
    }
    frame.setSiblingIndex(fxBox.children.length - 1);
    cursor -= fxH + gapS;

    // 当前等级描述
    const desc = this.host.addChildLabel(card, 'Desc', guardSpellDescribe(id, spellLv.level), left, cursor - descH / 2, FONT.small * scale, CREAM_TEXT, new Size(innerW, descH), HorizontalTextAlignment.LEFT);
    desc.enableWrapText = true;
    desc.lineHeight = Math.max(desc.fontSize + 3, 19 * scale);
    desc.verticalAlign = VerticalTextAlignment.TOP;
    desc.overflow = Label.Overflow.SHRINK;
    cursor -= descH + gapS;

    // 下一级对照表(标题行 + 逐项);满级 / 未解锁各一行
    this.drawDivider(card, 'TableDivider', 0, cursor + 2 * scale, innerW);
    if (open && diff) {
      const header = this.host.addChildLabel(card, 'DiffHead', `Lv.${spellLv.level}   →   Lv.${spellLv.level + 1}`, 0, cursor - rowH / 2, FONT.body * scale, GOLD_TEXT, new Size(innerW, rowH));
      header.isBold = true;
      cursor -= rowH + 4 * scale;
      const entries = diff.changes.slice(0, 3).map((change) => {
        const arrow = change.lastIndexOf('→');
        const head = arrow >= 0 ? change.slice(0, arrow) : change;
        const next = arrow >= 0 ? change.slice(arrow + 1) : '';
        const space = head.indexOf(' ');
        return { label: space >= 0 ? head.slice(0, space) : head, cur: space >= 0 ? head.slice(space + 1).trim() : '', next: next.trim() };
      });
      entries.forEach((entry, index) => {
        const y = cursor - rowH / 2;
        const rg = this.host.addChildPlainNode(card, `DiffRow${index}`, 0, y, innerW, rowH - 3 * scale).addComponent(Graphics);
        rg.fillColor = rgba(255, 214, 140, index % 2 === 0 ? 16 : 7);
        rg.roundRect(-innerW / 2, -(rowH - 3 * scale) / 2, innerW, rowH - 3 * scale, 3 * scale);
        rg.fill();
        const label = this.host.addChildLabel(card, `DiffLabel${index}`, entry.label, left + 6 * scale, y, FONT.small * scale, CREAM_TEXT, new Size(innerW * 0.3, rowH), HorizontalTextAlignment.LEFT);
        label.overflow = Label.Overflow.SHRINK;
        const cur = this.host.addChildLabel(card, `DiffCur${index}`, entry.cur, left + innerW * 0.5, y, FONT.small * scale, CREAM_TEXT, new Size(innerW * 0.26, rowH));
        cur.overflow = Label.Overflow.SHRINK;
        this.host.addChildLabel(card, `DiffArrow${index}`, '→', left + innerW * 0.68, y, FONT.small * scale, DIM_TEXT, new Size(innerW * 0.1, rowH));
        const nextLabel = this.host.addChildLabel(card, `DiffNext${index}`, entry.next, right - innerW * 0.13, y, FONT.small * scale, GREEN_TEXT, new Size(innerW * 0.26, rowH));
        nextLabel.overflow = Label.Overflow.SHRINK;
        nextLabel.isBold = true;
        cursor -= rowH;
      });
      if (diff.unlock) {
        const unlock = this.host.addChildLabel(card, 'DiffUnlock', `解锁「${diff.unlock}」`, 0, cursor - rowH / 2, FONT.small * scale, rgba(255, 214, 110), new Size(innerW, rowH));
        unlock.overflow = Label.Overflow.SHRINK;
        unlock.isBold = true;
        cursor -= rowH;
      }
    } else {
      const line = this.host.addChildLabel(card, 'DiffHead', open ? '已达最高等级' : `守卫水晶升到 Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`, 0, cursor - rowH / 2, FONT.body * scale, GOLD_TEXT, new Size(innerW, rowH));
      line.isBold = true;
      cursor -= rowH;
    }

    // 底部:花费行 + 升级按钮 + 装备状态 / 装备按钮(贴卡底)
    const gold = Number(info.goldBalance ?? 0);
    const core = Number(info.coreBalance ?? 0);
    const maxed = spellLv.level >= GUARD_SPELL_MAX_LEVEL || spellLv.nextGold === null;
    const goldCost = spellLv.nextGold ?? 0;
    const coreCost = spellLv.nextCore ?? 0;
    const gateLevel = spellLv.needCrystalLevel ?? 0;
    const gated = !maxed && gateLevel > info.level;
    const btnY = -h / 2 + pad + btnH / 2;
    if (open && !maxed && spellLv.available) {
      const costY = btnY + btnH / 2 + gapS + costH / 2;
      const iconSize = 22 * scale;
      const items: Array<{ key: string; icon: string; need: number; ok: boolean }> = [
        { key: 'Gold', icon: GOLD_ICON, need: goldCost, ok: gold >= goldCost },
        { key: 'Core', icon: CORE_ICON, need: coreCost, ok: core >= coreCost },
      ];
      const itemW = innerW / 2;
      items.forEach((item, index) => {
        const ix = left + index * itemW + 4 * scale;
        this.host.addSprite(`CostIcon${item.key}`, item.icon, ix + iconSize / 2, costY, iconSize, iconSize, card);
        const text = this.host.addChildLabel(card, `Cost${item.key}`, this.host.formatInteger(item.need), ix + iconSize + 6 * scale, costY, FONT.body * scale, item.ok ? CREAM_TEXT : RED_TEXT, new Size(itemW - iconSize - 12 * scale, costH), HorizontalTextAlignment.LEFT);
        text.overflow = Label.Overflow.SHRINK;
        text.isBold = true;
      });
    }
    const btnX = left + btnW / 2;
    const labelText = !open ? '未解锁' : !spellLv.available ? '暂未开放' : maxed ? '已满级' : gated ? `需水晶 Lv.${gateLevel}` : `升级 Lv.${spellLv.level + 1}`;
    // 红金主钮(套件);缺图退回原按钮图
    const button = mountRefButton(this.host, card, 'LobbyGuardCrystalUpgrade', labelText, btnX, btnY, btnW, btnH, scale, 'primary', undefined, { fontSize: 20 * scale });
    if (!button.getChildByName('Art')) {
      this.host.addSprite('LobbyGuardCrystalUpgradeArt', BTN_COST_UP.path, 0, 0, btnW, btnH, button);
    }
    const disabled = !open || !spellLv.available || maxed || state.busy;
    if (disabled || gated) {
      button.addComponent(UIOpacity).opacity = 140;
    }
    if (!disabled) {
      button.addComponent(Button);
      button.on(Button.EventType.CLICK, () => {
        const current = this.host.currentGuardCrystalState();
        if (!current) {
          return;
        }
        if (gated) {
          current.notice = `${def.name}升到 Lv.${spellLv.level + 1} 需要守卫水晶 Lv.${gateLevel}(在「水晶升级」页签升级水晶)`;
          current.noticeGood = false;
          this.host.refreshGuardCrystalDialog();
          return;
        }
        if (core < coreCost || gold < goldCost) {
          current.notice = core < coreCost ? `守卫晶核不足:还差 ${this.host.formatInteger(coreCost - core)} 个` : `金币不足:还差 ${this.host.formatInteger(goldCost - gold)}`;
          current.noticeGood = false;
          this.host.refreshGuardCrystalDialog();
          return;
        }
        this.host.upgradeGuardSpell(id);
      }, this);
      this.host.applyImageButtonFeedback(button, 1.04, 0.96);
    }
    // 装备状态 / 装备按钮(拖拽之外的兜底:点一下装到当前选中格)
    const target = state.targetSlot >= 0 && state.targetSlot < slots ? state.targetSlot : slots - 1;
    let pillText = '';
    let action: (() => void) | null = null;
    if (!open) {
      pillText = '未解锁';
    } else if (slotIndex >= 0) {
      pillText = `已装备 · 第${slotIndex + 1}格`;
    } else if (loadout.length < slots) {
      pillText = '装备';
      action = () => this.host.setGuardCrystalLoadout(loadout.concat([id]));
    } else {
      pillText = `装备到第${target + 1}格`;
      action = () => {
        const next = loadout.slice();
        next[target] = id;
        this.host.setGuardCrystalLoadout(next);
      };
    }
    const pillW = innerW - btnW - 8 * scale;
    const pillH = btnH * 0.72;
    const pill = this.host.addChildPlainNode(card, 'Action', right - pillW / 2, btnY, pillW, pillH);
    // 可装备 = 暗金副钮(套件);已装备 / 未解锁 = 细金边暗行(与列表行同款)
    const pillArt = action ? mountRefSliced(this.host, pill, 'Art', REF_KIT.btnSecondary, 0, 0, pillW, pillH) : mountRefSliced(this.host, pill, 'Art', slotIndex >= 0 ? REF_ROW_SELECTED : REF_ROW, 0, 0, pillW, pillH);
    const pg = pill.addComponent(Graphics);
    if (pillArt) {
      pg.enabled = false;
    }
    pg.fillColor = action ? rgba(130, 34, 22, 245) : slotIndex >= 0 ? rgba(30, 22, 12, 240) : rgba(40, 32, 24, 230);
    pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 6 * scale);
    pg.fill();
    pg.strokeColor = action ? rgba(255, 196, 120, 240) : slotIndex >= 0 ? rgba(214, 170, 96, 230) : rgba(140, 120, 90, 200);
    pg.lineWidth = 1.5;
    pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 6 * scale);
    pg.stroke();
    const pillLabel = this.host.addChildLabel(pill, 'Text', pillText, 0, 0, FONT.small * scale, action ? rgba(255, 238, 200) : slotIndex >= 0 ? GOLD_TEXT : DIM_TEXT, new Size(pillW - 8 * scale, pillH));
    pillLabel.overflow = Label.Overflow.SHRINK;
    pillLabel.isBold = true;
    if (action && !state.busy) {
      const run = action;
      pill.addComponent(Button);
      pill.on(Button.EventType.CLICK, () => run(), this);
      this.host.applyImageButtonFeedback(pill, 1.06, 0.95);
    }
  }

  /** 分隔线(参考图款):金线从中间向两端渐隐 + 中心小菱形。 */
  private drawDivider(panel: Node, name: string, x: number, y: number, w: number): void {
    const node = this.host.addChildPlainNode(panel, name, x, y, w, 8);
    const g = node.addComponent(Graphics);
    // 实测坑:同一 Graphics 先 stroke 后 fill 会吞掉描边;<2px 高的细矩形会被三角化合并成 2 点画不出来。
    // 所以线只用分段 stroke(渐隐),菱形挂到子节点单独 fill。
    g.lineWidth = Math.max(2, w / 480);
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * (w / 2);
      const a1 = ((i + 1) / steps) * (w / 2);
      g.strokeColor = rgba(220, 172, 92, Math.round(255 * (1 - (i / steps) * 0.85)));
      g.moveTo(a0, 0);
      g.lineTo(a1, 0);
      g.moveTo(-a0, 0);
      g.lineTo(-a1, 0);
      g.stroke();
    }
    this.fillDiamond(node, 0, 0, 7, 4, rgba(230, 188, 110, 240));
  }

  private fillDiamond(parent: Node, x: number, y: number, rx: number, ry: number, color: Color): void {
    const node = this.host.addChildPlainNode(parent, 'Diamond', x, y, rx * 2, ry * 2);
    const g = node.addComponent(Graphics);
    g.fillColor = color;
    g.moveTo(0, ry);
    g.lineTo(rx, 0);
    g.lineTo(0, -ry);
    g.lineTo(-rx, 0);
    g.close();
    g.fill();
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

  /** 服务端下发的法术等级行(docs/39);旧服务端没有 spells 字段时按 Lv1、不可升级("暂未开放")。 */
  private spellLevelOf(info: GuardCrystalInfoVO, id: GuardSpellId): { level: number; nextGold: number | null; nextCore: number | null; needCrystalLevel: number | null; available: boolean } {
    const row = (info.spells ?? []).find((entry) => entry.spellId === id);
    if (!row) {
      return { level: 1, nextGold: null, nextCore: null, needCrystalLevel: null, available: false };
    }
    const level = Math.max(1, Math.min(GUARD_SPELL_MAX_LEVEL, Math.round(Number(row.level)) || 1));
    return { level, nextGold: row.nextGold ?? null, nextCore: row.nextCore ?? null, needCrystalLevel: row.needCrystalLevel ?? null, available: true };
  }

  /** 红点:未满级、水晶门槛已到、金币与晶核都够。 */
  private spellUpgradable(info: GuardCrystalInfoVO, lv: { level: number; nextGold: number | null; nextCore: number | null; needCrystalLevel: number | null; available: boolean }): boolean {
    if (!lv.available || lv.level >= GUARD_SPELL_MAX_LEVEL || lv.nextGold === null) {
      return false;
    }
    if ((lv.needCrystalLevel ?? 0) > info.level) {
      return false;
    }
    return Number(info.goldBalance ?? 0) >= lv.nextGold && Number(info.coreBalance ?? 0) >= (lv.nextCore ?? 0);
  }

  private mountSpineFx(parent: Node, spec: { effect: string; animation: string }, x: number, y: number, sizePx: number, loop: boolean, holdMs: number): boolean {
    return mountLobbySpineFx(this.host, parent, spec, x, y, sizePx, loop, holdMs) !== null;
  }

  private renderNotice(panel: Node, state: LobbyGuardCrystalDialogState, panelW: number, panelH: number, scale: number): void {
    if (!state.notice) {
      return;
    }
    const label = this.host.addChildLabel(panel, 'LobbyGuardCrystalNotice', state.notice, 0, -panelH / 2 + 0.03 * panelH, FONT.body * scale, state.noticeGood ? GREEN_TEXT : RED_TEXT, new Size(panelW * 0.6, 26 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.outline(label, scale, rgba(10, 8, 6, 255));
  }

  private outline(label: Label, scale: number, color: Color): void {
    label.enableOutline = true;
    label.outlineColor = color;
    label.outlineWidth = Math.max(1, 2 * scale);
  }
}
