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
import { mountKitLoading, type UiKitHost } from '../UiKit';
import { GLASS_COLOR, GLASS_ICON, GLASS_SLICES, glassLabel, glassProtoMap, mountGlassButton, mountGlassLine, mountGlassPanel, mountGlassSlice, mountGlassTopBar } from '../UiGlassKit';
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
/** 法术详情演示框通用底图(暗色法阵场景);2026-10-14 用户要求每个法术各一张专属插画 → 优先 SPELL_ART,缺图退回这张。 */
const SPELL_PREVIEW_BG = { path: CUI('spell_preview_bg'), w: 1024, h: 768 };
const SPELL_ART: Record<GuardSpellId, string> = {
  quake: CUI('spell_art_quake'), frost: CUI('spell_art_frost'), thunder: CUI('spell_art_thunder'),
  goldrush: CUI('spell_art_goldrush'), aegis: CUI('spell_art_aegis'), warhorn: CUI('spell_art_warhorn'),
};
interface ArtSpec { path: string; aspect: number; fallback?: { path: string; aspect: number } }
const BTN_COST_UP = { path: CUI('btn_cost_up'), aspect: 154 / 527 };
// 2026-10-16 用户「水晶界面和其他界面风格不太像」:换成布阵 / 锻造同一套素材(标题牌、关闭钮、页签、细金框、列表行、红金按钮)
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
/** 属性行暗金图标(11-06 从原型 crystal_b 抠,tools/qa/glass_kit_gen.py)。 */
const GLASS_CRYSTAL_STAT_ICON: Record<string, string> = {
  Hp: 'ui/glass/crystal_hp/spriteFrame',
  Gold: 'ui/glass/crystal_gold/spriteFrame',
  Power: 'ui/glass/crystal_power/spriteFrame',
  Energy: 'ui/glass/crystal_energy/spriteFrame',
  EnergyMax: 'ui/glass/crystal_energy_max/spriteFrame',
  Slots: 'ui/glass/crystal_slots/spriteFrame',
};
/** 顶栏货币简写(原型写法:4,700,000 → 4.7M,≥10 万 → 123K,其余带千分位)。 */
function compactNumber(value: number): string {
  const v = Math.max(0, Math.floor(value));
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  }
  if (v >= 100_000) {
    return `${Math.floor(v / 1000)}K`;
  }
  // 原生 toLocaleString 无千分位,手动插逗号
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
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
// 11-06 B 毛玻璃色板(GLASS_COLOR 同值):香槟 / 白 / 绿 / 灰 / 红
const GOLD_TEXT = rgba(227, 196, 138);
const CREAM_TEXT = rgba(242, 242, 242);
const GREEN_TEXT = rgba(132, 214, 140);
const DIM_TEXT = rgba(150, 156, 168);
const RED_TEXT = rgba(232, 108, 96);

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
    } else {
      // 11-06 B:原型 crystal_b 的场景比底图暗一档(玻璃面板 / 灰字才压得住);水晶与特效画在这层之上不受影响
      const shade = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalSceneShade', 0, 0, layout.width, layout.height).addComponent(Graphics);
      shade.fillColor = rgba(4, 6, 12, 110);
      shade.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
      shade.fill();
    }

    // 11-06 B 毛玻璃(原型 crystal_b):顶栏「‹ 守卫水晶」+ 金币 / 晶核胶囊 + ✕(全站共用顶栏)
    const info = state.info;
    const close = (): void => this.host.closeGuardCrystalDialog();
    mountGlassTopBar(this.kit, panel, 'LobbyGuardCrystal', W, H, '守卫水晶', info ? [
      { key: 'gold', icon: GOLD_ICON, value: compactNumber(Number(info.goldBalance ?? 0)), width: 150 },
      { key: 'core', icon: CORE_ICON, value: compactNumber(Number(info.coreBalance ?? 0)), width: 165 },
    ] : [], close, close);
    const { FX, FY, S } = glassProtoMap(W, H);

    const bodyTop = FY(160);
    const bodyBottom = FY(786);
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
    // 右侧内容列 = 原型 772 → 1830
    const rightW = S(1058);
    const rightX = FX(1301);
    this.renderCrystal(panel, info, state, leftX, leftW, scale, W, H);
    this.renderTabs(panel, state, info, W, H);
    if (state.tab === 'spells') {
      this.renderSpellsPage(panel, state, info, rightX, rightW, bodyTop, bodyBottom, scale);
    } else {
      this.renderStats(panel, info, W, H);
      this.renderUpgradeFooter(panel, info, state, W, H);
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
    // 等级牌(11-06 B:原型 crystal_b 的暗玻璃牌 310×56 + 白字),放在台座下方(不挡尖脚),水晶直接踩在地面法阵上
    const plateH = 0.066 * H;
    const plateW = plateH * 5.5;
    const plateY = floorY - 0.052 * H;
    const plate = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalLevelBadge', x, plateY, plateW, plateH);
    mountGlassSlice(this.kit, plate, 'Art', GLASS_SLICES.plate, 0, 0, plateW, plateH, plateH / 88);
    const level = glassLabel(this.kit, plate, 'Text', `Lv.${info.level}`, 0, 0, plateH * 0.6, GLASS_COLOR.text, plateW * 0.7, HorizontalTextAlignment.CENTER, true);
    level.fontSize = Math.round(plateH * 0.6);
    // 进度条 + 「n / 30 级」+ 解锁提示 底下垫一层柔和暗底:场景底图这块是亮蓝光地板,直接写字看不清
    const barW = 0.21 * W;
    const barH = Math.max(4, 0.009 * H);
    const barY = plateY - 0.054 * H;
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
    // 原型:淡灰细轨 + 冷蓝进度 + 进度头一颗亮点
    g.fillColor = rgba(52, 58, 70, 230);
    g.roundRect(-barW / 2, -barH / 2, barW, barH, barH / 2);
    g.fill();
    const fillW = Math.max(barH, barW * (info.level / Math.max(1, info.maxLevel)));
    g.fillColor = rgba(92, 160, 240, 255);
    g.roundRect(-barW / 2, -barH / 2, fillW, barH, barH / 2);
    g.fill();
    g.fillColor = rgba(150, 205, 255, 255);
    g.circle(-barW / 2 + fillW - barH * 0.2, 0, barH * 0.95);
    g.fill();
    const textK = H / 841;
    const cap = glassLabel(this.kit, panel, 'LobbyGuardCrystalLevelCap', info.level >= info.maxLevel ? '已升到满级' : `${info.level} / ${info.maxLevel} 级`, x, barY - 0.035 * H, 24 * textK, GLASS_COLOR.sub, barW + 40 * scale, HorizontalTextAlignment.CENTER);
    cap.fontSize = Math.max(16, Math.round(24 * textK));
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
    let cursor = barY - 0.079 * H;
    hints.slice(0, 2).forEach((text, index) => {
      const hint = glassLabel(this.kit, panel, `LobbyGuardCrystalNextUnlock${index}`, text, x, cursor, 21 * textK, GLASS_COLOR.sub, w * 0.86, HorizontalTextAlignment.CENTER);
      hint.fontSize = Math.max(15, Math.round(21 * textK));
      cursor -= this.lh(27 * textK, 1);
    });
  }

  /** UiGlassKit 用的宿主视图(宿主即 UiKitHost 的超集)。 */
  private get kit(): UiKitHost {
    return this.host as unknown as UiKitHost;
  }

  /** B 风格文字(字号 = 原型像素 × k,下限 12)。 */
  private glassText(parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number, k: number, align = HorizontalTextAlignment.LEFT, bold = false): Label {
    const label = glassLabel(this.kit, parent, name, text, x, y, size * k, color, width, align, bold);
    label.fontSize = Math.max(12, Math.round(size * k));
    label.lineHeight = label.fontSize + 4;
    return label;
  }

  /** 右侧页签(原型 crystal_b:选中 = 暗金底白字 768..1090,未选 = 暗玻璃 1103..1448,y 88..143)。 */
  private renderTabs(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, W: number, H: number): void {
    const { k, FX, FY, S } = glassProtoMap(W, H);
    const tabs: Array<{ key: LobbyGuardCrystalDialogState['tab']; text: string; x0: number; x1: number }> = [
      { key: 'upgrade', text: '水晶升级', x0: 768, x1: 1090 },
      { key: 'spells', text: `法术装备 ${this.loadoutOf(info).length}/${this.slotsOf(info)}`, x0: 1103, x1: 1448 },
    ];
    tabs.forEach((tab) => {
      const active = state.tab === tab.key;
      const tabW = S(tab.x1 - tab.x0);
      const node = this.host.addChildPlainNode(panel, `LobbyGuardCrystalTab_${tab.key}`, FX((tab.x0 + tab.x1) / 2), FY(115.5), tabW, S(56));
      mountGlassSlice(this.kit, node, 'Bg', active ? GLASS_SLICES.tabActive : GLASS_SLICES.panel, 0, 0, tabW, S(56), k);
      this.glassText(node, 'Text', tab.text, 0, 0, 26, active ? GLASS_COLOR.onGold : GLASS_COLOR.text, tabW - S(30), k, HorizontalTextAlignment.CENTER, active);
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
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
  }

  /** 分区标题竖条(原型 5×30 香槟色;程序画,首开贴图未缓存也不缺)。 */
  private accentBar(parent: Node, name: string, x: number, y: number, k: number, h = 30): void {
    mountGlassLine(this.kit, parent, name, x, y, Math.max(2, 5 * k), h * k, GLASS_COLOR.champagne);
  }

  /** 「水晶升级」属性面板(原型 772..1830 × 160..660):标题 + 副标 + Lv.a → Lv.b 列头 + 6 行(图标 / 名 / 当前 / → / 下一级 / 增量)。 */
  private renderStats(panel: Node, info: GuardCrystalInfoVO, W: number, H: number): void {
    const { k, FX, FY, S } = glassProtoMap(W, H);
    mountGlassPanel(this.kit, panel, 'LobbyGuardCrystalStatsPanel', FX(1301), FY(410), S(1058), S(500), k);
    const current = info.current;
    const next = info.next;
    this.accentBar(panel, 'LobbyGuardCrystalStatsAccent', FX(794), FY(195), k);
    this.glassText(panel, 'LobbyGuardCrystalStatsTitle', '水晶属性提升', FX(810), FY(195), 28, GLASS_COLOR.text, S(300), k, HorizontalTextAlignment.LEFT, true);
    this.glassText(panel, 'LobbyGuardCrystalStatsSub', '每一次升级,都让水晶在黑暗中更加璀璨', FX(810), FY(233), 21, GLASS_COLOR.sub, S(520), k);
    if (next) {
      this.glassText(panel, 'LobbyGuardCrystalHeadCur', `Lv.${info.level}`, FX(1392), FY(209), 26, GLASS_COLOR.champagne, S(150), k, HorizontalTextAlignment.CENTER, true);
      this.glassText(panel, 'LobbyGuardCrystalHeadArrow', '→', FX(1515), FY(209), 26, GLASS_COLOR.text, S(50), k, HorizontalTextAlignment.CENTER);
      this.glassText(panel, 'LobbyGuardCrystalHeadNext', `Lv.${info.level + 1}`, FX(1634), FY(209), 26, GLASS_COLOR.green, S(150), k, HorizontalTextAlignment.CENTER, true);
    } else {
      this.glassText(panel, 'LobbyGuardCrystalHeadCur', `Lv.${info.level} · 满级`, FX(1512), FY(209), 26, GLASS_COLOR.champagne, S(300), k, HorizontalTextAlignment.CENTER, true);
    }
    // 行区:比面板再暗一档的圆角底 + 细边,行间 1px 分隔
    const box = this.host.addChildPlainNode(panel, 'LobbyGuardCrystalRowsBox', FX(1302), FY(454.5), S(1030), S(385)).addComponent(Graphics);
    box.fillColor = rgba(8, 11, 16, 120);
    box.roundRect(-S(515), -S(192.5), S(1030), S(385), S(10));
    box.fill();
    box.strokeColor = rgba(255, 255, 255, 26);
    box.lineWidth = Math.max(1, S(1.2));
    box.roundRect(-S(515), -S(192.5), S(1030), S(385), S(10));
    box.stroke();
    for (let i = 0; i < 5; i += 1) {
      mountGlassLine(this.kit, panel, `LobbyGuardCrystalRowSep${i}`, FX(1302), FY(327 + i * 64), S(1004), Math.max(1, S(1.2)), rgba(255, 255, 255, 22));
    }

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
    rows.forEach((row, index) => {
      const y = FY(295 + index * 64);
      this.host.addSprite(`LobbyGuardCrystalIcon${row.key}`, GLASS_CRYSTAL_STAT_ICON[row.key], FX(832), y, S(48), S(48), panel);
      this.glassText(panel, `LobbyGuardCrystalRowName${row.key}`, row.name, FX(890), y, 24, GLASS_COLOR.text, S(260), k);
      const curValue = row.read(current);
      this.glassText(panel, `LobbyGuardCrystalRowCur${row.key}`, row.fmt(curValue), FX(1390), y, 24, GLASS_COLOR.text, S(150), k, HorizontalTextAlignment.CENTER);
      if (!next) {
        return;
      }
      const nextValue = row.read(next);
      if (nextValue === curValue) {
        // docs/45 §26:不变行只留当前值,箭头 / 下一级 / 增量三列合成一个灰字,一眼看出本级升了哪几项
        this.glassText(panel, `LobbyGuardCrystalRowSame${row.key}`, '本级不变', FX(1636), y, 23, GLASS_COLOR.sub, S(200), k, HorizontalTextAlignment.CENTER);
        return;
      }
      this.glassText(panel, `LobbyGuardCrystalRowArrow${row.key}`, '→', FX(1515), y, 22, GLASS_COLOR.sub, S(50), k, HorizontalTextAlignment.CENTER);
      this.glassText(panel, `LobbyGuardCrystalRowNext${row.key}`, row.fmt(nextValue), FX(1632), y, 24, GLASS_COLOR.green, S(150), k, HorizontalTextAlignment.CENTER, true);
      this.glassText(panel, `LobbyGuardCrystalRowDelta${row.key}`, `(${row.delta(nextValue - curValue)})`, FX(1752), y, 24, GLASS_COLOR.green, S(120), k, HorizontalTextAlignment.CENTER);
    });
  }

  /** 「水晶升级」底栏(原型 772..1830 × 672..786):升级消耗 | 金币 | 晶核 持有/需要(不足标红)+ 说明;右侧全屏唯一主钮「升级至 Lv.n」。 */
  private renderUpgradeFooter(panel: Node, info: GuardCrystalInfoVO, state: LobbyGuardCrystalDialogState, W: number, H: number): void {
    const { k, FX, FY, S } = glassProtoMap(W, H);
    const gold = Number(info.goldBalance ?? 0);
    const core = Number(info.coreBalance ?? 0);
    const goldCost = info.nextUpgradeGold ?? 0;
    const coreCost = info.nextUpgradeCore ?? 0;
    const maxed = info.level >= info.maxLevel || info.nextUpgradeGold === null;
    const goldOk = gold >= goldCost;
    const coreOk = core >= coreCost;
    mountGlassPanel(this.kit, panel, 'LobbyGuardCrystalPreviewBox', FX(1301), FY(729), S(1058), S(114), k);
    this.accentBar(panel, 'LobbyGuardCrystalCostAccent', FX(796), FY(711), k, 28);
    this.glassText(panel, 'LobbyGuardCrystalCostTitle', maxed ? '已升到满级' : '升级消耗', FX(815), FY(711), 26, GLASS_COLOR.text, S(140), k, HorizontalTextAlignment.LEFT, true);
    if (!maxed) {
      const sep = (name: string, px: number): void => {
        mountGlassLine(this.kit, panel, name, FX(px), FY(711), Math.max(1, S(1.6)), S(26), rgba(120, 128, 140, 170));
      };
      sep('LobbyGuardCrystalCostSep0', 955);
      this.host.addSprite('LobbyGuardCrystalCostIconGold', GOLD_ICON, FX(1008), FY(711), S(36), S(36), panel);
      this.glassText(panel, 'LobbyGuardCrystalCostGold', this.host.formatInteger(goldCost), FX(1040), FY(711), 25, goldOk ? GLASS_COLOR.text : GLASS_COLOR.red, S(70), k);
      sep('LobbyGuardCrystalCostSep1', 1115);
      this.host.addSprite('LobbyGuardCrystalCostIconCore', CORE_ICON, FX(1165), FY(711), S(36), S(36), panel);
      const haveText = this.host.formatInteger(core);
      const have = this.glassText(panel, 'LobbyGuardCrystalCostCore', haveText, FX(1194), FY(711), 25, coreOk ? GLASS_COLOR.text : GLASS_COLOR.red, S(120), k, HorizontalTextAlignment.LEFT, true);
      const haveW = Array.from(haveText).length * have.fontSize * 0.6;
      this.glassText(panel, 'LobbyGuardCrystalCostCoreNeed', `/ ${this.host.formatInteger(coreCost)}`, FX(1194) + haveW + S(8), FY(711), 25, GLASS_COLOR.text, S(110), k, HorizontalTextAlignment.LEFT, true);
    }
    this.glassText(panel, 'LobbyGuardCrystalCostSource', maxed ? '水晶已达当前版本上限' : '守卫晶核:野外精英击败、每日副本胜利获得', FX(815), FY(753), 21, GLASS_COLOR.sub, S(620), k);
    // 全屏唯一主钮;资源不足 = 暗金 primaryDim(点了提示差多少);满级 / 忙 = primaryOff
    const kind = maxed || state.busy ? 'primaryOff' : goldOk && coreOk ? 'primary' : 'primaryDim';
    mountGlassButton(this.kit, panel, 'LobbyGuardCrystalUpgrade', maxed ? '已满级' : `升级至 Lv.${info.level + 1}`, FX(1634.5), FY(732), S(355), S(70), k, kind, () => {
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
    }, 30);
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
      g.fillColor = rgba(16, 20, 28, 240);
      g.circle(0, 0, size * 0.46);
      g.fill();
      g.strokeColor = rgba(201, 168, 106, 240);
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

  /** 本次渲染的装备格(拖拽落点判定用;每次整刷重建)。 */
  private sockets: Array<{ index: number; node: Node; open: boolean; id: GuardSpellId | undefined; hover: Node | null; size: number }> = [];
  private dragGhost: Node | null = null;

  /** 页面:整块内面板;左 53% 装备格 + 列表,右 47% 详情卡。 */
  private renderSpellsPage(panel: Node, state: LobbyGuardCrystalDialogState, info: GuardCrystalInfoVO, x: number, w: number, top: number, bottom: number, scale: number): void {
    // 11-06 B 毛玻璃:布局不变,外框换玻璃面板(k 与升级页同口径)
    const gk = w / 1058;
    mountGlassPanel(this.kit, panel, 'LobbyGuardCrystalSpellsPanel', x, (top + bottom) / 2, w, top - bottom, gk);
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

  /** 小节标题(B 风格):香槟竖条 + 白色粗体;右侧可带一行灰字。 */
  private sectionHead(panel: Node, key: string, text: string, left: number, right: number, y: number, scale: number, note?: string): void {
    mountGlassLine(this.kit, panel, `${key}Accent`, left + 4 * scale, y, Math.max(2, 5 * scale * 0.85), 28 * scale * 0.85, GLASS_COLOR.champagne);
    const textX = left + 18 * scale;
    glassLabel(this.kit, panel, `${key}Title`, text, textX, y, 24 * scale, GLASS_COLOR.text, 220 * scale, HorizontalTextAlignment.LEFT, true);
    if (note) {
      const noteLabel = glassLabel(this.kit, panel, `${key}Note`, note, right - 10 * scale, y, FONT.small * scale, GLASS_COLOR.sub, Math.max(120 * scale, (right - textX) * 0.7), HorizontalTextAlignment.RIGHT);
      noteLabel.overflow = Label.Overflow.SHRINK;
    }
  }

  /** 左列:装备格一排(编号 + 圆章 + 名)+ 六行法术列表(图标 / 名 / 简介 / 状态);列表行与装备格都可拖。 */
  private renderSpellColumn(
    panel: Node,
    state: LobbyGuardCrystalDialogState,
    info: GuardCrystalInfoVO,
    x: number,
    w: number,
    top: number,
    bottom: number,
    scale: number,
  ): void {
    const slots = this.slotsOf(info);
    const loadout = this.loadoutOf(info);
    const unlocked = this.unlockedOf(info);
    const left = x - w / 2;
    const right = x + w / 2;
    const target = state.targetSlot >= 0 && state.targetSlot < slots ? state.targetSlot : slots - 1;

    // 已装备的法术
    // 首个标题带贴面板顶边与左侧金线(放在边框下一层),其余内容跟着它往下排
    const headY = top - 19 * scale;
    this.sectionHead(panel, 'LobbyGuardCrystalLoadout', '已装备的法术', left, right, headY, scale, `${loadout.length}/${slots}`);
    // 2026-10-16 用户「法术装备界面有些挤」:装备格缩小一档,上下与两条标题带拉开
    const socket = Math.min(64 * scale, w / 5);
    const shown = slots + (info.nextSlotLevel ? 1 : 0);
    const spacing = Math.min(132 * scale, w / Math.max(3, shown));
    const socketY = headY - 19 * scale - 26 * scale - socket / 2;
    for (let i = 0; i < shown; i++) {
      const sx = x + (i - (shown - 1) / 2) * spacing;
      const open = i < slots;
      const id = open ? loadout[i] : undefined;
      const isTarget = open && loadout.length >= slots && i === target && slots > 1;
      const node = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSocket_${i}`, sx, socketY, socket, socket);
      const ring = node.addComponent(Graphics);
      // B 风格格位:暗玻璃圆 + 浅灰细边;当前目标格 = 香槟边
      ring.fillColor = rgba(12, 16, 22, open ? 220 : 150);
      ring.circle(0, 0, socket / 2);
      ring.fill();
      ring.strokeColor = isTarget ? rgba(227, 196, 138, 255) : open ? rgba(160, 168, 182, 200) : rgba(90, 96, 108, 160);
      ring.lineWidth = isTarget ? 3 : 1.6;
      ring.circle(0, 0, socket / 2 + (isTarget ? 2 * scale : 0));
      ring.stroke();
      let hover: Node | null = null;
      if (open) {
        // 拖拽悬停高亮环(默认隐藏)
        hover = this.host.addChildPlainNode(node, 'Hover', 0, 0, socket, socket);
        const hg = hover.addComponent(Graphics);
        hg.strokeColor = rgba(236, 210, 150, 255);
        hg.lineWidth = 4;
        hg.circle(0, 0, socket / 2 + 5 * scale);
        hg.stroke();
        hg.fillColor = rgba(227, 196, 138, 40);
        hg.circle(0, 0, socket / 2);
        hg.fill();
        hover.active = false;
      }
      if (id) {
        this.mountSpellIcon(node, 'Icon', id, 0, 0, socket * 1.02, false);
      } else if (!open) {
        this.host.addSprite('Lock', GLASS_ICON.lock, 0, 0, socket * 0.36, socket * 0.36, node);
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
    const listHeadY = socketY - socket / 2 - 56 * scale;
    this.sectionHead(panel, 'LobbyGuardCrystalList', '法术列表', left, right, listHeadY, scale, '拖到上方格位即可装备');
    const gridTop = listHeadY - 19 * scale - 12 * scale;
    // 行距 14、行高上限 56(2026-10-14 用户:列表紧挨在一起太紧凑)
    const gap = 10 * scale;
    const rowsN = GUARD_SPELL_IDS.length;
    // 列表行改单行(图标 / 名 / 状态),简介在右侧详情卡里已有完整描述;行高按可用高度铺满,封顶 52
    const rowH = Math.min(52 * scale, (gridTop - bottom - gap * (rowsN - 1)) / rowsN);
    GUARD_SPELL_IDS.forEach((id, index) => {
      const cy = gridTop - rowH / 2 - index * (rowH + gap);
      const open = unlocked.indexOf(id) >= 0;
      const slotIndex = loadout.indexOf(id);
      const equipped = slotIndex >= 0;
      const selected = state.selectedSpell === id;
      const card = this.host.addChildPlainNode(panel, `LobbyGuardCrystalSpell_${id}`, x, cy, w, rowH);
      // B 风格:选中行 = panelSel 暖金(全站选中态),其余暗玻璃
      mountGlassSlice(this.kit, card, 'Bg', selected ? GLASS_SLICES.panelSel : GLASS_SLICES.panel, 0, 0, w, rowH, Math.min(scale * 0.8, rowH / 56));
      const iconSize = rowH * 0.72;
      const iconX = -w / 2 + 20 * scale + iconSize / 2;
      this.mountSpellIcon(card, 'Icon', id, iconX, 0, iconSize, !open);
      const textX = -w / 2 + 32 * scale + iconSize;
      const pillW = 96 * scale;
      const textW = w - iconSize - pillW - 36 * scale;
      const name = this.host.addChildLabel(card, 'Name', GUARD_SPELLS[id].name, textX, 0, FONT.name * scale, open ? CREAM_TEXT : DIM_TEXT, new Size(textW, this.lh(26, scale)), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      name.isBold = true;
      // 右端统一成同宽胶囊(2026-10-14 第二轮:三种状态样式不一显得乱):已装备 = 金边金字;未装备 = 灰边「Lv.n」;未解锁 = 灰边「Lv.n 解锁」+ 小锁
      const spellLv = this.spellLevelOf(info, id);
      const pillH = 26 * scale;
      const pillX = w / 2 - 20 * scale - pillW / 2;
      const pill = this.host.addChildPlainNode(card, 'StatePill', pillX, 0, pillW, pillH);
      // 状态胶囊 = 全站标签胶囊(浅填充 + 细描边);已装备字用香槟色
      mountGlassSlice(this.kit, pill, 'Bg', GLASS_SLICES.tagPill, 0, 0, pillW, pillH, pillH / 36);
      const pillText = !open ? `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁` : equipped ? '已装备' : `Lv.${spellLv.level}`;
      const lockW = open ? 0 : 16 * scale;
      const pillLabel = this.host.addChildLabel(pill, 'Text', pillText, -lockW / 2, 0, FONT.small * scale, equipped ? GOLD_TEXT : DIM_TEXT, new Size(pillW - 8 * scale - lockW, pillH));
      pillLabel.overflow = Label.Overflow.SHRINK;
      pillLabel.isBold = equipped;
      if (!open) {
        this.host.addSprite('Lock', GLASS_ICON.lock, pillW / 2 - 6 * scale - lockW / 2, 0, lockW, lockW, pill);
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
    // B 风格:详情卡 = 面板内再垫一层暗玻璃(比外面板暗一档)
    const g = card.addComponent(Graphics);
    g.fillColor = rgba(8, 11, 16, 120);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = rgba(255, 255, 255, 30);
    g.lineWidth = Math.max(1, 1.2 * scale);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();
    const pad = 22 * scale;
    const left = -w / 2 + pad;
    const right = w / 2 - pad;
    const innerW = w - pad * 2;

    // ── 自下而上定高 ──
    const btnW = Math.min(innerW * 0.6, 200 * scale);
    const btnH = btnW * BTN_COST_UP.aspect;
    const costH = this.lh(26, scale);
    const diff = open ? guardSpellNextDiff(id, spellLv.level) : null;
    const rowH = this.lh(27, scale);
    const tableRows = open && diff ? Math.min(3, diff.changes.length) + (diff.unlock ? 1 : 0) : 0;
    const tableH = rowH + 4 * scale + tableRows * rowH;
    const descH = this.lh(this.phone ? 66 : 58, scale);
    const titleH = 36 * scale;
    // 插画封顶卡高 36%(以前吃掉全部剩余高度,文字区挤成一团);省出来的高度匀给 5 处段间距
    const baseGap = 10 * scale;
    const fixedH = titleH + descH + tableH + costH + btnH + baseGap * 5;
    const fxH = Math.max(90 * scale, Math.min(h * 0.36, h - pad * 2 - fixedH));
    const gapS = baseGap + Math.max(0, h - pad * 2 - fixedH - fxH) / 5;

    // 标题行:香槟竖条 + 名 + 「能量 n」 + 等级胶囊
    let cursor = h / 2 - 12 * scale;
    const emblemH = 18 * scale;
    mountGlassLine(this.kit, card, 'Accent', left + 3 * scale, cursor - titleH / 2, Math.max(2, 4.5 * scale * 0.85), 26 * scale * 0.85, GLASS_COLOR.champagne);
    const lvW = 66 * scale;
    const lvH = 26 * scale;
    const energyW = 78 * scale;
    const nameX = left + emblemH;
    const name = this.host.addChildLabel(card, 'Name', def.name, nameX, cursor - titleH / 2, 24 * scale, CREAM_TEXT, new Size(innerW - lvW - energyW - emblemH - 24 * scale, titleH), HorizontalTextAlignment.LEFT);
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
      // 满级 = 暗金胶囊;二阶(tier 2)字偏冷白,其余标签胶囊
      mountGlassSlice(this.kit, lvPill, 'Bg', maxed ? GLASS_SLICES.pillGold : GLASS_SLICES.tagPill, 0, 0, lvW, lvH, lvH / 36);
      const lvText = this.host.addChildLabel(lvPill, 'Text', maxed ? 'Lv.5 满' : `Lv.${spellLv.level}`, 0, 0, FONT.tiny * scale, maxed ? GLASS_COLOR.onGold : tier === 2 ? rgba(214, 228, 248) : CREAM_TEXT, new Size(lvW - 6 * scale, lvH));
      lvText.isBold = true;
      lvText.overflow = Label.Overflow.SHRINK;
    } else {
      const lockPill = this.host.addChildLabel(card, 'Level', `Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁`, right, cursor - titleH / 2, FONT.tiny * scale, DIM_TEXT, new Size(rightTextW, lvH), HorizontalTextAlignment.RIGHT);
      lockPill.overflow = Label.Overflow.SHRINK;
    }
    cursor -= titleH + 6 * scale + gapS;

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
    fr.strokeColor = rgba(255, 255, 255, 40);
    fr.lineWidth = 1.5;
    fr.rect(-innerW / 2, -fxH / 2, innerW, fxH);
    fr.stroke();
    const spellFx = GUARD_SPELL_FX[id];
    const fxHolder = this.host.addChildPlainNode(fxBox, 'Fx', 0, 0, 10, 10);
    // 特效按演示框铺开(长边≈框宽,超出部分由 Mask 裁掉)叠在插画上。2026-10-16 用户「法术技能特效没了,只有贴图」:
    // 插画框封顶 36% 后再按短边 × 0.7 缩,特效只剩插画中间一小团,看起来像没播
    const fxMounted = this.mountSpineFx(fxHolder, spellFx, 0, -fxH * 0.04, Math.min(innerW * 0.95, fxH * 1.35), true, 0);
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
    mountGlassLine(this.kit, card, 'TableDivider', 0, cursor + 2 * scale, innerW, Math.max(1, 1.2 * scale), rgba(255, 255, 255, 30));
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
        rg.fillColor = rgba(255, 255, 255, index % 2 === 0 ? 12 : 5);
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
        const unlock = this.host.addChildLabel(card, 'DiffUnlock', `解锁「${diff.unlock}」`, 0, cursor - rowH / 2, FONT.small * scale, GOLD_TEXT, new Size(innerW, rowH));
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
    // B 风格:法术页唯一主钮;门槛未到 / 资源不足 = 暗金 primaryDim(点了提示原因);不可升 = primaryOff
    const disabled = !open || !spellLv.available || maxed || state.busy;
    const short = gold < goldCost || core < coreCost;
    const kind = disabled ? 'primaryOff' : gated || short ? 'primaryDim' : 'primary';
    mountGlassButton(this.kit, card, 'LobbyGuardCrystalUpgrade', labelText, btnX, btnY, btnW, btnH, scale * 0.85, kind, () => {
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
    }, 22 / 0.85);
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
    if (action && !state.busy) {
      // 可装备 = 次按钮(主钮留给升级)
      const run = action;
      mountGlassButton(this.kit, card, 'Action', pillText, right - pillW / 2, btnY, pillW, pillH, scale * 0.85, 'secondaryLit', () => run(), FONT.body / 0.85);
      return;
    }
    // 已装备 / 未解锁 = 标签胶囊(已装备字用香槟色)
    const pill = this.host.addChildPlainNode(card, 'Action', right - pillW / 2, btnY, pillW, pillH);
    mountGlassSlice(this.kit, pill, 'Bg', GLASS_SLICES.tagPill, 0, 0, pillW, pillH, pillH / 36);
    const pillLabel = this.host.addChildLabel(pill, 'Label', pillText, 0, 0, FONT.small * scale, slotIndex >= 0 ? GOLD_TEXT : DIM_TEXT, new Size(pillW - 8 * scale, pillH));
    pillLabel.overflow = Label.Overflow.SHRINK;
    pillLabel.isBold = slotIndex >= 0;
  }

  /** 格位编号:金边菱形 + 数字。 */
  private drawIndexDiamond(parent: Node, text: string, x: number, y: number, size: number, open: boolean, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'Index', x, y, size, size);
    const g = node.addComponent(Graphics);
    const r = size / 2;
    g.fillColor = rgba(16, 20, 28, 245);
    g.moveTo(0, r);
    g.lineTo(r, 0);
    g.lineTo(0, -r);
    g.lineTo(-r, 0);
    g.close();
    g.fill();
    g.strokeColor = open ? rgba(227, 196, 138, 255) : rgba(100, 106, 118, 200);
    g.lineWidth = 2;
    g.moveTo(0, r);
    g.lineTo(r, 0);
    g.lineTo(0, -r);
    g.lineTo(-r, 0);
    g.close();
    g.stroke();
    const label = this.host.addChildLabel(node, 'Text', text, 0, 0, FONT.small * scale, open ? GOLD_TEXT : DIM_TEXT, new Size(size, size));
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

  /** B 风格不描边,只留一层淡投影(与 glassLabel 一致);参数保留给旧调用点。 */
  private outline(label: Label, scale: number, color: Color): void {
    void scale;
    void color;
    label.enableOutline = false;
    label.enableShadow = true;
    label.shadowColor = new Color(0, 0, 0, 120);
    label.shadowOffset.set(0, -1);
    label.shadowBlur = 2;
  }
}
