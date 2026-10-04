import {
  assetManager,
  AudioClip,
  AudioSource,
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Node,
  resources,
  ScrollView,
  Size,
  sp,
  Sprite,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import { LOBBY_UI_FX } from './LobbyBattleAttackFxConfig';
import { mountLobbySpineFx } from './LobbyUiSpineFx';
import type { LobbyHeroAffixVO, LobbyHeroItemVO } from '../../types/LobbyHeroTypes';
import type { EquipmentItemVO } from '../../api/EquipmentApi';
import { equipQualityColor, equipQualityLabel, HERO_EQUIP_SLOTS, renderEquipDetailCard } from './EquipDetailCard';
import { renderLockGlyph } from '../UiLockGlyph';
export { equipQualityColor, equipQualityLabel, HERO_EQUIP_SLOTS } from './EquipDetailCard';
import type { LobbyBagPanelState } from '../../types/BagTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { resolveBattleHeroSkillProfile, resolveEnergyShieldHpRatio, resolveSkillTriggerChance, resolveHeroPassiveUnlockStars, ultimateCap, ultimateUpCost, ultimateDamageScale, ULTIMATE_MAX_LEVEL } from './LobbyBattleHeroSkillConfig';
import { isGuardT0Hero } from './GuardBattleModel';
import { equipIconAssetByCode } from './EquipIconAssets';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { C1812_BUTTON_PRIMARY_ASSET, C1812_BUTTON_RETURN_ASSET, starBandAssetOf, starBandTextRgbOf, starDisplayV3 } from '../C1812CommonUiAssets';
import { clamp, rgba, type UiLayout } from './LobbyHudTypes';
import { patchBattleUnitSpineRuntimeEnums, type BattleUnitSpineRuntimeData } from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';
import { isPhoneDesign } from '../../app/ScreenAdapter';

export const LOBBY_HERO_DETAIL_BACKDROP_ASSET = 'ui/hero/ai/hero_detail_bg/spriteFrame';
export const LOBBY_HERO_DETAIL_PROTAGONIST_ASSET = 'ui/hero-detail/hero_detail_protagonist/spriteFrame';
// 与锻造分解页同款方块雕花框(路径对齐 FORGE_AI_SLOT_FRAME_ASSET;字面量避免与锻造渲染器循环 import)。
const HERO_WEAR_GRID_FRAME_ASSET = 'ui/forge/ai/slot_frame/spriteFrame';
// C1812 英雄详情视觉：星级图标与品阶纹章；切图未就绪时回退到文字徽章。
export const HERO_C1812_STAR_FILLED_ASSET = 'ui/hero/c1812/star_filled/spriteFrame';
export const HERO_C1812_STAR_EMPTY_ASSET = 'ui/hero/c1812/star_empty/spriteFrame';
// hero/ai 新套件(2026-07-18,参考图1):右栏雕花底板/名牌/切换箭头/技能行底/星星/升级双按钮。
// 右栏底板:hero_info_panel(2026-07-18 用户重制版,1029×1528 纯净构图)。
export const HERO_AI_INFO_PANEL_ASSET = 'ui/hero/ai/hero_info_panel/spriteFrame';
export const HERO_AI_NAMEPLATE_ASSET = 'ui/hero/ai/hero_nameplate/spriteFrame';
export const HERO_AI_SWITCH_LEFT_ASSET = 'ui/hero/ai/hero_switch_left/spriteFrame';
export const HERO_AI_SWITCH_RIGHT_ASSET = 'ui/hero/ai/hero_switch_right/spriteFrame';
export const HERO_AI_SKILL_ITEM_ASSET = 'ui/hero/ai/skill_item_bg/spriteFrame';
export const HERO_AI_STAR_FILLED_ASSET = 'ui/hero/ai/star_filled/spriteFrame';
export const HERO_AI_STAR_EMPTY_ASSET = 'ui/hero/ai/star_empty/spriteFrame';
export const HERO_AI_BTN_LEVEL_ASSET = 'ui/hero/ai/btn_star_up/spriteFrame';
export const HERO_AI_BTN_LEVEL_AUTO_ASSET = 'ui/hero/ai/btn_star_up_auto/spriteFrame';
export const HERO_AI_SECTION_STAR_ASSET = 'ui/hero/ai/ic_section_star/spriteFrame';
export const HERO_AI_BTN_ATTR_DETAIL_ASSET = 'ui/hero/ai/btn_attr_detail/spriteFrame';
// bt-hero-beautify(2026-10-04 用户:「这几个界面需要美化」):手机左侧页签改用锻造页同款雕花牌(整图等比缩放)。
// 两张图 meta 都是自动裁边(trim),精灵按裁后内容铺满节点,所以节点尺寸必须按裁后宽高比(bw:bh)给,否则会被拉变形。
// k = 相对页签列宽的显示比例(未选牌没有外凸尖角,略收窄后两种牌视觉等高)。
// bt2-hero-refine:选中牌换任务页的红底金框牌(裁后 666×192,约 3.5:1,同列宽下比锻造红皮牌高 17%),未选仍用锻造暗石牌(3.6:1);
// 两种牌都更"方",同样列宽下页签高度从约 40 提到 52~60,拇指更好点。
const HERO_NAV_TAB_ACTIVE_ART = { asset: 'ui/mission/ai/tab_active/spriteFrame', bw: 666, bh: 192, k: 1 };
const HERO_NAV_TAB_NORMAL_ART = { asset: 'ui/forge/ai/tab_normal/spriteFrame', bw: 1608, bh: 445, k: 0.95 };
/**
 * 英雄详情页用到的 UI 图(不含立绘 / 装备图标)。首次渲染时由本渲染器整组预拉一次(切页签不再逐张晚到);
 * 也可挂进 UiSpriteFrameCache 的 'heroes' 预载组(名册首开时就拉),这样详情页第一次打开也不会先闪程序兜底。
 */
export const HERO_DETAIL_PRELOAD_ASSETS: string[] = [
  'ui/mission/ai/tab_active/spriteFrame',
  'ui/forge/ai/tab_normal/spriteFrame',
  'ui/hero/ai/hero_nameplate/spriteFrame',
  'ui/hero/ai/hero_info_panel/spriteFrame',
  'ui/hero/ai/hero_switch_left/spriteFrame',
  'ui/hero/ai/hero_switch_right/spriteFrame',
  'ui/hero/ai/divider_line_l/spriteFrame',
  'ui/hero/ai/ic_section_star/spriteFrame',
  'ui/hero/ai/btn_attr_detail/spriteFrame',
  'ui/hero/ai/btn_star_up/spriteFrame',
  'ui/hero/ai/btn_star_up_auto/spriteFrame',
  'ui/hero/ai/stat_hp/spriteFrame',
  'ui/hero/ai/stat_atk/spriteFrame',
  'ui/hero/ai/stat_def/spriteFrame',
  'ui/hero/ai/stat_spd/spriteFrame',
  'ui/hero/ai/stat_crit/spriteFrame',
  'ui/hero/ai/stat_tough/spriteFrame',
  'ui/bag/ai/icon_gold/spriteFrame',
  'ui/bag/ai/icon_expbook/spriteFrame',
  'ui/bag/ai/icon_shard_r/spriteFrame',
  'ui/bag/ai/icon_shard_sr/spriteFrame',
  'ui/bag/ai/icon_shard_ssr/spriteFrame',
  'ui/bag/ai/icon_shard_ur/spriteFrame',
];
// 技能图标:项目里没有逐技能图标素材(原先是程序画的暗红圆 + 十字,看起来像空圈),
// 改为按效果类型借用属性圆徽(stat_*),大招用红底金环 + 四芒星徽。
const HERO_SKILL_ICON_BY_EFFECT: Record<string, string> = {
  lifesteal: 'ui/hero/ai/stat_hp/spriteFrame',
  truePierce: 'ui/hero/ai/stat_atk/spriteFrame',
  freeze: 'ui/hero/ai/stat_tough/spriteFrame',
  stun: 'ui/hero/ai/stat_tough/spriteFrame',
  splash: 'ui/hero/ai/stat_crit/spriteFrame',
  reflect: 'ui/hero/ai/stat_def/spriteFrame',
  atkUp: 'ui/hero/ai/stat_atk/spriteFrame',
  hpUp: 'ui/hero/ai/stat_hp/spriteFrame',
  shield: 'ui/hero/ai/stat_def/spriteFrame',
  speed: 'ui/hero/ai/stat_spd/spriteFrame',
};
const HERO_BTN_LEVEL_ASPECT = 431 / 100;
const HERO_BTN_LEVEL_AUTO_ASPECT = 388 / 96;

/** 估算单行文字宽度(中日韩全角按 1 字宽,其余按 0.58),只用于把"图标 + 数字"几段排成一行居中。 */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i += 1) {
    w += text.charCodeAt(i) > 0x2e80 ? fontSize : fontSize * 0.58;
  }
  return w;
}

interface HeroDockCostView {
  title: string;
  costs: { icon: string; text: string; lack: boolean }[];
  hint: string;
  /** 'cap' = 已到上限(按钮置灰不可点);'lack' = 材料不足(按钮压暗,仍可点,由服务器回提示)。 */
  blocked?: 'cap' | 'lack';
}
// 升星消耗镜像(服务器 hero_star_config 为准,仅用于展示):index = 当前星-1,上限 15 星。
const STAR_MAX = 15;
const STAR_UP_FRAGMENT_COSTS = [20, 40, 60, 80, 120, 180, 220, 260, 300, 340, 380, 420, 460, 500];
const STAR_UP_GOLD_COSTS = [10000, 30000, 60000, 100000, 160000, 240000, 330000, 430000, 550000, 680000, 820000, 970000, 1130000, 1300000];
const HERO_AI_STAT_ICON_ASSETS: Record<string, string> = {
  生命: 'ui/hero/ai/stat_hp/spriteFrame',
  攻击: 'ui/hero/ai/stat_atk/spriteFrame',
  防御: 'ui/hero/ai/stat_def/spriteFrame',
  速度: 'ui/hero/ai/stat_spd/spriteFrame',
  暴击: 'ui/hero/ai/stat_crit/spriteFrame',
  韧性: 'ui/hero/ai/stat_tough/spriteFrame',
};
export const HERO_C1812_GRADE_CREST_ASSETS: Record<string, string> = {
  R: 'ui/hero/c1812/grade_crest_r/spriteFrame',
  SR: 'ui/hero/c1812/grade_crest_sr/spriteFrame',
  SSR: 'ui/hero/c1812/grade_crest_ssr/spriteFrame',
  UR: 'ui/hero/c1812/grade_crest_ur/spriteFrame',
};

// 强化流光序列帧(与锻造工坊同源素材):r/sr/ssr/ur = +5/+10/+15/+20,8 帧 12fps;缺帧回退程序光效。
const FX_GLOW_DIR = 'ui/forge/ai/fx_enhance_glow';
const FX_GLOW_FRAME_COUNT = 8;
const FX_GLOW_FPS = 14;
function glowTierKey(enhanceLevel: number): string | null {
  if (enhanceLevel >= 20) {
    return 'ur';
  }
  if (enhanceLevel >= 15) {
    return 'ssr';
  }
  if (enhanceLevel >= 10) {
    return 'sr';
  }
  if (enhanceLevel >= 5) {
    return 'r';
  }
  return null;
}

const HERO_DETAIL_SPINE_RUNTIME_RETRY_DELAYS_MS = [180, 420, 900];

export interface HeroDetailAttribute {
  label: string;
  value: string;
}

export interface HeroDetailSkill {
  name: string;
  tag: string;
  description: string;
  // 技能类别:大招=金红高亮首行;被动=常规;locked=未达解锁星级(灰显)。
  kind?: 'ultimate' | 'passive';
  locked?: boolean;
  /** 图标素材路径(按效果类型借用属性圆徽);缺省回退程序画图标。 */
  icon?: string;
}

type HeroSpineEnumMap = { [key: string]: number | string };

type HeroSpineRuntimeData = {
  width?: number;
  height?: number;
  skins?: Array<{ name?: string } | null>;
  animations?: Array<{ name?: string } | null>;
};

interface HeroSpineDisplayProfile {
  /** Some combat intro animations begin with partial FX/hair meshes; detail view should show the complete hero silhouette first. */
  preferIdleFirst?: boolean;
  loopAnimation?: string;
  loopFallbackHints?: string[];
  skipIntro?: boolean;
  introAnimation?: string;
  introFallbackHints?: string[];
  maxScale?: number;
  targetHeightRatio?: number;
  maxWidthRatio?: number;
  scaleMultiplier?: number;
  xRatio?: number;
  yRatio?: number;
}

const HERO_DETAIL_NUU_VISUAL_HEIGHT_RATIO = 0.6;
const HERO_DETAIL_SPINE_MAX_WIDTH_RATIO = 1.22;
const HERO_DETAIL_SPINE_DEFAULT_MAX_SCALE = 0.62;
const HERO_DETAIL_NUU_MATCHED_HEIGHT_RATIO = 0.78;
const HERO_DETAIL_NUU_MATCHED_MAX_WIDTH_RATIO = 3.2;
const HERO_DETAIL_NUU_MATCHED_MAX_SCALE = 0.78;
const HERO_DETAIL_NUU_MATCHED_SCALE_MULTIPLIER = 1.18;

const HERO_DETAIL_IDLE_ONLY_PROFILE: HeroSpineDisplayProfile = {
  preferIdleFirst: true,
  loopAnimation: 'idle',
  targetHeightRatio: HERO_DETAIL_NUU_MATCHED_HEIGHT_RATIO,
  maxWidthRatio: HERO_DETAIL_NUU_MATCHED_MAX_WIDTH_RATIO,
  maxScale: HERO_DETAIL_NUU_MATCHED_MAX_SCALE,
  scaleMultiplier: HERO_DETAIL_NUU_MATCHED_SCALE_MULTIPLIER,
};

const HERO_DETAIL_SPINE_DISPLAY_PROFILES: Record<string, HeroSpineDisplayProfile> = {
  Belladonna: HERO_DETAIL_IDLE_ONLY_PROFILE,
  Carmilla: HERO_DETAIL_IDLE_ONLY_PROFILE,
  Eulenspigel: HERO_DETAIL_IDLE_ONLY_PROFILE,
  HeylelS01: HERO_DETAIL_IDLE_ONLY_PROFILE,
  Ishmael: HERO_DETAIL_IDLE_ONLY_PROFILE,
  IshmaelA: HERO_DETAIL_IDLE_ONLY_PROFILE,
  LucienA: HERO_DETAIL_IDLE_ONLY_PROFILE,
  Lucrecia: HERO_DETAIL_IDLE_ONLY_PROFILE,
  Nuu: {
    loopAnimation: 'idle',
    introAnimation: 'intro',
    maxScale: 0.52,
    targetHeightRatio: HERO_DETAIL_NUU_VISUAL_HEIGHT_RATIO,
    maxWidthRatio: HERO_DETAIL_SPINE_MAX_WIDTH_RATIO,
    xRatio: -0.035,
    yRatio: 0.012,
  },
  Sphinx: HERO_DETAIL_IDLE_ONLY_PROFILE,
};

/** 觉醒消耗:hero_awaken_config 第 1 阶镜像(sql/05_hero_module.sql;服务器为唯一扣减方,这里只做展示与按钮置灰)。 */
const AWAKEN_COST = { minStar: 10, fragments: 120, gold: 500000, awakenStone: 1, bossMark: 10 } as const;

/** 觉醒材料数额:万以上用"万"缩写,避免 8,233,784 这类长数字挤出卡宽。 */
function formatAwakenAmount(value: number): string {
  const v = Math.max(0, Math.floor(value));
  if (v >= 100000) {
    const wan = v / 10000;
    return `${wan >= 100 ? Math.floor(wan) : Math.floor(wan * 10) / 10}万`;
  }
  return v.toLocaleString('en-US');
}

export interface LobbyHeroDetailPanelHost {
  node: Node;
  currentLobbyHeroDetailHero(): LobbyHeroItemVO | null;
  /** 刚完成的养成动作(升星 / 觉醒 / 升级),渲染层播一次庆祝特效后即清空(docs/29 v3)。 */
  consumeLobbyHeroCelebration?(): 'starUp' | 'awaken' | 'levelUp' | null;
  currentLobbyHeroDetailInfo?(): import('../../types/HeroTypes').UserHeroDetailVO | null;
  currentLobbyProfile(): PlayerLobbyProfileVO;
  currentLobbyBagState(): LobbyBagPanelState;
  levelUpLobbyHero(heroId: number): void;
  autoLevelUpLobbyHero(heroId: number): void;
  starUpLobbyHero(heroId: number): void;
  awakenLobbyHero(heroId: number): void;
  autoStarUpLobbyHero(heroId: number): void;
  isLobbyHeroLevelUpPending(heroId: number): boolean;
  // 洗练(重铸词条,2026-07-10):弹窗开关 + 锁定切换 + 确认;消耗由服务器结算,面板仅展示预估。
  currentLobbyHeroRefineState(): { dialogOpen: boolean; lockedAttrIds: number[] };
  openLobbyHeroRefineDialog(): void;
  closeLobbyHeroRefineDialog(): void;
  toggleLobbyHeroRefineLock(attrId: number): void;
  refineLobbyHero(heroId: number): void;
  isLobbyHeroRefinePending(heroId: number): boolean;
  // 终极技能升级(P6):弹窗开关 + 提交;消耗镜像表见 LobbyBattleHeroSkillConfig。
  currentLobbyHeroUltimateState(): { dialogOpen: boolean; busy: boolean };
  openLobbyHeroUltimateDialog(): void;
  closeLobbyHeroUltimateDialog(): void;
  confirmLobbyHeroUltimateUp(heroId: number): void;
  // 装备(装备一期):弹窗开关 + 部位选择 + 穿/卸;列表由宿主缓存,穿卸后战力服务器重算。
  currentLobbyHeroEquipState(): {
    dialogOpen: boolean;
    selectedSlot: string | null;
    selectedEquipId: number | null;
    items: EquipmentItemVO[];
    loading: boolean;
    busy: boolean;
  };
  selectLobbyHeroWearEquip(equipId: number): void;
  openLobbyHeroEquipDialog(): void;
  openLobbyHeroEquipDialogWithSlot(slot: string): void;
  closeLobbyHeroEquipDialog(): void;
  oneClickEquipLobbyHero(heroId: number): void;
  oneClickUnequipLobbyHero(heroId: number): void;
  switchLobbyHeroDetail(direction: number): void;
  currentLobbyHeroDetailTab(): 'attr' | 'equip' | 'skill' | 'star';
  selectLobbyHeroDetailTab(tab: 'attr' | 'equip' | 'skill' | 'star'): void;
  selectLobbyHeroEquipSlot(slot: string): void;
  equipLobbyHeroEquipment(equipmentId: number): void;
  unequipLobbyHeroEquipment(equipmentId: number): void;
  // 装备合成(2.0 P2):按(部位,稀有度)组自动挑 3 件未穿戴材料。
  currentLobbyEquipFuseState(): { dialogOpen: boolean; useLuckStone: boolean };
  // 装备强化/分解(2.0 P3)。
  currentLobbyEquipEnhanceState(): { targetId: number | null; useBless: boolean; useGuard: boolean };
  openLobbyEquipEnhanceDialog(equipmentId: number): void;
  closeLobbyEquipEnhanceDialog(): void;
  toggleLobbyEquipEnhanceBless(): void;
  toggleLobbyEquipEnhanceGuard(): void;
  enhanceLobbyEquipment(equipmentId: number): void;
  decomposeLobbyEquipGroup(slot: string, quality: string): void;
  openLobbyEquipFuseDialog(): void;
  closeLobbyEquipFuseDialog(): void;
  toggleLobbyEquipFuseLuckStone(): void;
  fuseLobbyEquipGroup(slot: string, quality: string): void;
  closeLobbyHeroDetailPanel(): void;
  backToLobbyHeroRosterPanel(): void;
  createUiNode(name: string): Node;
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
    contentSize?: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  applyImageButtonFeedback(node: Node, hoverScale?: number, pressedScale?: number): void;
}

/**
 * 手机横屏英雄详情分区(面板坐标,原点在面板中心)。2026-10-02 H5 横屏:手机设计高 720,同一套界面相对屏幕放大约 1.5 倍,
 * 桌面版"右栏 + 底部居中名牌 + 右下横排页签"在 720 高里互相压叠,改为:左侧竖排页签 / 中部立绘(名牌压在立绘脚下)/ 右栏占满整高。
 */
interface HeroDetailPhoneFrame {
  tabX: number;
  tabWidth: number;
  artX: number;
  artY: number;
  artWidth: number;
  artHeight: number;
  plateX: number;
  plateY: number;
  plateWidth: number;
  infoX: number;
  infoY: number;
  infoWidth: number;
  infoHeight: number;
  /** 全屏弹窗外框(手机端弹窗统一铺满舞台,四周留边)。 */
  dialogWidth: number;
  dialogHeight: number;
}

/** 英雄详情面板：展示英雄信息、形态、技能与战斗展示属性；当前只开放后端白名单内的 level-up。 */
export class LobbyHeroDetailPanelRenderer {
  // 骨骼数据缓存已收敛到全局 SpineDataStore(2026-08-04),不再各页私有。
  private readonly heroSpineAudioClips = new Map<string, AudioClip>();
  private readonly heroSpineAudioLoadCallbacks = new Map<string, Array<(clip: AudioClip | null) => void>>();
  private readonly missingHeroSpineAudioLogs = new Set<string>();
  private lastHeroSpineFailureReason = '资源解析失败';
  // 洗练弹窗局部刷新上下文:锁定切换/确认只重建弹窗节点,不整面板重渲染(避免背景 spine 动画重播)。
  private detailRenderContext: { panelGroup: Node; panelWidth: number; panelHeight: number; scale: number } | null = null;
  private refineDialogNode: Node | null = null;
  /** 觉醒确认弹窗打开中的英雄(整页重绘后按它补开,不会被补图/刷新关掉)。 */
  private awakenConfirmHeroId: number | null = null;
  private awakenDialogNode: Node | null = null;
  /** 当前是否紧凑布局(无底部页签,觉醒提示标签直接开弹窗)。 */
  private compactLayout = false;
  /** 当前挂着的英雄立绘舞台(含 spine)及其复用键;整页重绘前由 stashArtStage() 摘下暂存,重绘时键一致就原样挂回。 */
  private artStageNode: Node | null = null;
  private artStageKey = '';
  private artStageStash: { node: Node; key: string } | null = null;
  private equipDialogNode: Node | null = null;
  private wearTooltipNode: Node | null = null;
  private heroSkillSelectedIndex = 0;
  private skillSelectBoxes: Node[] = [];
  /** 手机横屏分区;null = 桌面布局(保持原样)。每次 render 重算。 */
  private phoneFrame: HeroDetailPhoneFrame | null = null;

  constructor(private readonly host: LobbyHeroDetailPanelHost) {}

  private isNodeAlive(node: Node | null | undefined): boolean {
    try {
      return !!node && node.isValid === true;
    } catch {
      return false;
    }
  }

  private isHeroSpineAudioSourceNodeValid(audioSource: AudioSource | null | undefined): boolean {
    if (!audioSource) {
      return false;
    }
    try {
      return this.isNodeAlive(audioSource.node);
    } catch {
      return false;
    }
  }

  private detailArtWarmed = false;

  /** 首次渲染把四个页签用到的 UI 图一次请求齐(addSprite 未命中即发起加载),避免切页签时图标 / 页签牌逐张晚到。 */
  private warmDetailArtOnce(): void {
    if (this.detailArtWarmed) {
      return;
    }
    this.detailArtWarmed = true;
    const probe = new Node('HeroDetailArtWarm');
    probe.layer = this.host.node.layer;
    HERO_DETAIL_PRELOAD_ASSETS.forEach((asset) => this.host.addSprite('Warm', asset, 0, 0, 2, 2, probe));
    probe.destroy();
  }

  render(layout: UiLayout): void {
    const hero = this.host.currentLobbyHeroDetailHero();
    if (!hero) {
      this.dropArtStageStash();
      return;
    }
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const phone = isPhoneDesign();
    const compact = !phone && (layout.safeWidth < 1154 * scale || layout.safeHeight < 520 * scale);
    const panelWidth = Math.max(320 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    this.phoneFrame = phone ? this.resolvePhoneFrame(panelWidth, panelHeight, scale) : null;
    this.warmDetailArtOnce();
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const dim = this.host.createUiNode('LobbyHeroDetailDim');
    dim.setPosition(new Vec3(centerX, centerY, 0));
    dim.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 0);
    dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    dimGraphics.fill();
    // 英雄详情是独立逻辑场景，遮罩只阻断底层输入，不再点击关闭。
    dim.addComponent(BlockInputEvents);

    const panelGroup = this.host.createUiNode('LobbyHeroDetailSceneContent');
    panelGroup.setPosition(new Vec3(centerX, centerY, 0));
    panelGroup.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    // 内容区阻断点击，保证详情内部操作不会穿透到遮罩导致关闭。
    panelGroup.addComponent(BlockInputEvents);

    const panel = this.host.addChildBeveledPanelNode(
      panelGroup,
      'LobbyHeroDetailSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(5, 5, 8, 232),
      rgba(0, 0, 0, 0),
      18 * scale,
    );
    this.host.addSprite('LobbyHeroDetailBackdropSprite', LOBBY_HERO_DETAIL_BACKDROP_ASSET, 0, 0, panelWidth, panelHeight, panel);
    this.drawPanelShade(panel, panelWidth, panelHeight, scale);
    this.compactLayout = compact;
    if (this.phoneFrame) {
      this.renderPhone(panel, hero, this.phoneFrame, panelWidth, panelHeight, scale);
    } else if (compact) {
      this.renderCompact(panel, hero, panelWidth, panelHeight, scale);
    } else {
      this.renderDesktop(panel, hero, panelWidth, panelHeight, scale);
    }
    this.renderHeader(panel, hero, panelWidth, panelHeight, scale);
    if (this.host.currentLobbyHeroDetailTab() === 'attr') {
      this.renderFooter(panel, hero, panelWidth, panelHeight, scale);
    }
    // 本次重绘没用上的暂存立绘(换了英雄/尺寸变了)在这里销毁,不留孤儿节点。
    this.dropArtStageStash();
    renderSceneBackButton(this.host, panelGroup, layout, 'LobbyHeroDetailBackButton', () => this.host.backToLobbyHeroRosterPanel(), scale, '英雄', '升级：消耗金币与英雄经验书，即时生效。\n\n右下页签切换 属性 / 装备 / 技能 / 升星。\n\n技能：大招默认解锁，战斗中攒满能量手动释放；被动技能随星级逐条解锁。');
    this.detailRenderContext = { panelGroup, panelWidth, panelHeight, scale };
    this.refineDialogNode = null;
    this.equipDialogNode = null;
    if (this.host.currentLobbyHeroRefineState().dialogOpen) {
      this.renderRefineDialog(panelGroup, hero, panelWidth, panelHeight, scale);
    }
    if (this.host.currentLobbyHeroUltimateState().dialogOpen) {
      this.renderUltimateUpDialog(panelGroup, hero, panelWidth, panelHeight, scale);
    }
    this.awakenDialogNode = null;
    if (this.awakenConfirmHeroId !== null) {
      if (this.awakenConfirmHeroId === hero.id && this.isHeroAwakenable(hero)) {
        this.renderAwakenDialog(panelGroup, hero, panelWidth, panelHeight, scale);
      } else {
        this.awakenConfirmHeroId = null;
      }
    }
    if (this.host.currentLobbyHeroEquipState().dialogOpen) {
      this.renderEquipDialog(panelGroup, hero, panelWidth, panelHeight, scale);
      if (this.host.currentLobbyEquipFuseState().dialogOpen) {
        this.renderEquipFuseDialog(panelGroup, panelWidth, panelHeight, scale);
      }
      if (this.host.currentLobbyEquipEnhanceState().targetId !== null) {
        this.renderEquipEnhanceDialog(panelGroup, panelWidth, panelHeight, scale);
      }
    }
  }

  /** 只重建装备弹窗(选部位/穿卸/列表加载完成时调用),背景 spine 不重播;面板未渲染时返回 false 回退整刷。 */
  updateEquipDialogOnly(): boolean {
    const ctx = this.detailRenderContext;
    const hero = this.host.currentLobbyHeroDetailHero();
    if (!ctx || !hero || !this.isNodeAlive(ctx.panelGroup)) {
      return false;
    }
    if (this.equipDialogNode && this.isNodeAlive(this.equipDialogNode)) {
      this.equipDialogNode.destroy();
    }
    this.equipDialogNode = null;
    if (!this.host.currentLobbyHeroEquipState().dialogOpen) {
      // 装备页签右栏模式(无弹窗):部位选择/穿卸结果画在主面板上,必须整刷,否则界面停在旧快照。
      return false;
    }
    this.renderEquipDialog(ctx.panelGroup, hero, ctx.panelWidth, ctx.panelHeight, ctx.scale);
    if (this.host.currentLobbyEquipFuseState().dialogOpen) {
      this.renderEquipFuseDialog(ctx.panelGroup, ctx.panelWidth, ctx.panelHeight, ctx.scale);
    }
    if (this.host.currentLobbyEquipEnhanceState().targetId !== null) {
      this.renderEquipEnhanceDialog(ctx.panelGroup, ctx.panelWidth, ctx.panelHeight, ctx.scale);
    }
    return true;
  }

  /**
   * 只重建洗练弹窗(锁定切换/开关/洗练完成时调用):面板与背景 spine 不动,动画不重播。
   * 面板尚未渲染/节点已销毁时返回 false,调用方回退整视图重渲染。
   */
  updateRefineDialogOnly(): boolean {
    const ctx = this.detailRenderContext;
    const hero = this.host.currentLobbyHeroDetailHero();
    if (!ctx || !hero || !this.isNodeAlive(ctx.panelGroup)) {
      return false;
    }
    if (this.refineDialogNode && this.isNodeAlive(this.refineDialogNode)) {
      this.refineDialogNode.destroy();
    }
    this.refineDialogNode = null;
    if (this.host.currentLobbyHeroRefineState().dialogOpen) {
      this.renderRefineDialog(ctx.panelGroup, hero, ctx.panelWidth, ctx.panelHeight, ctx.scale);
    }
    return true;
  }

  // 词条图记:圆环内按词条类型画专属小图形(程序绘制,无需素材;品质色着色)。
  private drawAffixGlyph(g: Graphics, code: string, cx: number, iconR: number, q: { r: number; g: number; b: number }, scale: number): void {
    const key = (code || '').toUpperCase();
    const r = iconR * 0.42;
    g.fillColor = rgba(q.r, q.g, q.b, 235);
    g.strokeColor = rgba(q.r, q.g, q.b, 235);
    g.lineWidth = 2 * scale;
    switch (key) {
      case 'HP_BONUS': {
        // 十字
        const arm = r * 0.36;
        g.rect(cx - arm, -r, arm * 2, r * 2);
        g.rect(cx - r, -arm, r * 2, arm * 2);
        g.fill();
        return;
      }
      case 'ATK_BONUS': {
        // 上指剑形三角
        g.moveTo(cx, r * 1.1);
        g.lineTo(cx + r * 0.62, -r * 0.9);
        g.lineTo(cx - r * 0.62, -r * 0.9);
        g.close();
        g.fill();
        return;
      }
      case 'DEF_BONUS': {
        // 盾形
        g.moveTo(cx - r * 0.8, r * 0.7);
        g.lineTo(cx + r * 0.8, r * 0.7);
        g.lineTo(cx + r * 0.62, -r * 0.3);
        g.lineTo(cx, -r);
        g.lineTo(cx - r * 0.62, -r * 0.3);
        g.close();
        g.fill();
        return;
      }
      case 'SPD_BONUS': {
        // 双箭头 »
        for (let i = 0; i < 2; i += 1) {
          const ox = cx - r * 0.55 + i * r * 0.75;
          g.moveTo(ox, r * 0.75);
          g.lineTo(ox + r * 0.55, 0);
          g.lineTo(ox, -r * 0.75);
          g.stroke();
        }
        return;
      }
      case 'CRIT_RATE':
      case 'CRIT_DMG': {
        // 四角星(暴伤更大)
        const sr = key === 'CRIT_DMG' ? r * 1.1 : r * 0.9;
        g.moveTo(cx, sr);
        g.lineTo(cx + sr * 0.28, sr * 0.28);
        g.lineTo(cx + sr, 0);
        g.lineTo(cx + sr * 0.28, -sr * 0.28);
        g.lineTo(cx, -sr);
        g.lineTo(cx - sr * 0.28, -sr * 0.28);
        g.lineTo(cx - sr, 0);
        g.lineTo(cx - sr * 0.28, sr * 0.28);
        g.close();
        g.fill();
        return;
      }
      case 'SKILL_POW': {
        // 法球:实心圆+外环
        g.circle(cx, 0, r * 0.55);
        g.fill();
        g.circle(cx, 0, r * 0.95);
        g.stroke();
        return;
      }
      case 'LIFESTEAL': {
        // 水滴
        g.moveTo(cx, r * 1.05);
        g.lineTo(cx + r * 0.62, -r * 0.15);
        g.arc(cx, -r * 0.32, r * 0.64, 0, Math.PI, true);
        g.close();
        g.fill();
        return;
      }
      case 'BOSS_DMG': {
        // 獠牙倒三角
        g.moveTo(cx - r * 0.9, r * 0.8);
        g.lineTo(cx + r * 0.9, r * 0.8);
        g.lineTo(cx, -r * 1.05);
        g.close();
        g.fill();
        return;
      }
      case 'ABYSS_INC': {
        // 深渊同心环
        g.circle(cx, 0, r * 0.95);
        g.stroke();
        g.circle(cx, 0, r * 0.45);
        g.fill();
        return;
      }
      case 'DROP_RATE': {
        // 战利品方箱
        g.rect(cx - r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        g.fill();
        return;
      }
      default: {
        g.moveTo(cx, r);
        g.lineTo(cx + r * 0.8, 0);
        g.lineTo(cx, -r);
        g.lineTo(cx - r * 0.8, 0);
        g.close();
        g.fill();
      }
    }
  }

  /**
   * 手机全屏弹窗底板(2026-10-02 用户拍板:H5 横屏弹窗一律全屏):雕花底板是一体构图,不能非等比拉伸铺满,
   * 改程序画深色面板 + 金描边 + 内细线;标题两侧饰线仍用等比素材。
   */
  private drawPhoneDialogPanel(dialog: Node, w: number, h: number, scale: number): void {
    const g = dialog.addComponent(Graphics);
    g.fillColor = rgba(14, 11, 10, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 14 * scale);
    g.fill();
    g.strokeColor = rgba(196, 150, 76, 230);
    g.lineWidth = 2.4 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 14 * scale);
    g.stroke();
    g.strokeColor = rgba(150, 112, 58, 110);
    g.lineWidth = 1 * scale;
    g.roundRect(-w / 2 + 7 * scale, -h / 2 + 7 * scale, w - 14 * scale, h - 14 * scale, 10 * scale);
    g.stroke();
  }

  /** 手机全屏弹窗标题:居中金字 + 两侧等比饰线 + 右上金 X(可选)。 */
  private renderPhoneDialogTitle(dialog: Node, name: string, text: string, w: number, titleY: number, scale: number, onClose: (() => void) | null): void {
    const titleSize = 32 * scale;
    const title = this.host.addChildLabel(dialog, name, text, 0, titleY, titleSize, rgba(250, 222, 150), new Size(w * 0.56, 42 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const titleHalf = Math.min(w * 0.28, Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e7f ? 1 : 0.55) * titleSize, 0) / 2);
    const dividerW = Math.min(160 * scale, w / 2 - titleHalf - 90 * scale);
    if (dividerW >= 36 * scale) {
      const dividerX = titleHalf + 20 * scale + dividerW / 2;
      this.host.addSprite(`${name}DividerL`, 'ui/common/ai/title_divider_left/spriteFrame', -dividerX, titleY, dividerW, dividerW * (76 / 390), dialog);
      this.host.addSprite(`${name}DividerR`, 'ui/common/ai/title_divider_right/spriteFrame', dividerX, titleY, dividerW, dividerW * (73 / 392), dialog);
    }
    if (onClose) {
      const closeSize = 52 * scale;
      const close = this.host.addChildPlainNode(dialog, `${name}Close`, w / 2 - 44 * scale, titleY, closeSize, closeSize);
      close.addComponent(Button);
      close.on(Button.EventType.CLICK, onClose, this);
      this.host.applyImageButtonFeedback(close, 1.08, 0.94);
      this.host.addSprite(`${name}CloseArt`, 'ui/common/ai/button_close/spriteFrame', 0, 0, closeSize, closeSize, close);
    }
  }

  // 洗练弹窗(2026-07-24 参考图版):refine_panel_bg 雕花底板 + 品质色词条横条(左圆图记/名称数值/八角品质章/挂锁状态)
  // + 底部消耗/持有行 + 确认洗练(红金)/取消(暗色) + 右上关闭。锁定与消耗逻辑不变,服务器权威结算。
  // 终极技能升级弹窗(P6):当前/上限、伤害倍率变化、材料四行(不足红)、升级/关闭;成功后弹窗保持打开便于连升。
  private renderUltimateUpDialog(parent: Node, hero: LobbyHeroItemVO, panelWidth: number, panelHeight: number, scale: number): void {
    const ult = this.host.currentLobbyHeroUltimateState();
    const dim = this.host.addChildPlainNode(parent, 'LobbyHeroUltimateDim', 0, 0, panelWidth, panelHeight);
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 170);
    dimGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    // 手机:全屏面板,内容收在居中一栏(cw),字号/行高放大;桌面保持 480×440 小窗。
    const frame = this.phoneFrame;
    const w = frame ? frame.dialogWidth : Math.min(480 * scale, panelWidth - 80 * scale);
    const h = frame ? frame.dialogHeight : 440 * scale;
    const cw = frame ? Math.min(w - 120 * scale, 760 * scale) : w;
    const dialog = this.host.addChildPlainNode(dim, 'LobbyHeroUltimateDialog', 0, 0, w, h);
    if (frame) {
      this.drawPhoneDialogPanel(dialog, w, h, scale);
      this.renderPhoneDialogTitle(dialog, 'LobbyHeroUltimateTitle', '终极技能升级', w, h / 2 - 42 * scale, scale, () => this.host.closeLobbyHeroUltimateDialog());
    } else {
      const g = dialog.addComponent(Graphics);
      g.fillColor = rgba(14, 11, 10, 250);
      g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
      g.fill();
      g.strokeColor = rgba(214, 168, 82, 230);
      g.lineWidth = 2 * scale;
      g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
      g.stroke();
      const title = this.host.addChildLabel(dialog, 'LobbyHeroUltimateTitle', '终极技能升级', 0, h / 2 - 34 * scale, 24 * scale, rgba(248, 220, 153), new Size(w - 48 * scale, 30 * scale));
      title.overflow = Label.Overflow.SHRINK;
      this.applyOutline(title, scale, true);
    }

    const current = typeof hero.ultimateSkillLevel === 'number' ? hero.ultimateSkillLevel : 1;
    const awakened = hero.awakenStatus === 1;
    const cap = ultimateCap(awakened);
    const sub = this.host.addChildLabel(dialog, 'LobbyHeroUltimateSub', `${safeText(hero.heroName)} · 当前 Lv.${current} / 上限 Lv.${cap}${awakened ? '' : '（觉醒后 Lv.10）'}`, 0, h / 2 - (frame ? 100 : 68) * scale, (frame ? 20 : 17) * scale, rgba(206, 190, 158), new Size(cw - 52 * scale, (frame ? 28 : 24) * scale));
    sub.overflow = Label.Overflow.SHRINK;

    const maxed = current >= ULTIMATE_MAX_LEVEL;
    const capped = !maxed && current >= cap;
    const cost = maxed || capped ? null : ultimateUpCost(current + 1);

    // 伤害倍率变化行。
    const currentPct = Math.round(260 * ultimateDamageScale(current));
    const scaleText = maxed || capped
      ? `伤害倍率 ${currentPct}%`
      : `伤害倍率 ${currentPct}% → ${Math.round(260 * ultimateDamageScale(current + 1))}%`;
    const scaleRow = this.host.addChildLabel(dialog, 'LobbyHeroUltimateScale', scaleText, 0, h / 2 - (frame ? 146 : 102) * scale, (frame ? 28 : 19) * scale, rgba(250, 214, 120), new Size(cw - 52 * scale, (frame ? 36 : 26) * scale));
    scaleRow.overflow = Label.Overflow.SHRINK;
    this.applyOutline(scaleRow, scale, false);

    if (frame) {
      // 手机全屏:倍率行下方补一张大招卡(图标 + 名称 + 完整描述),整屏不再空着。
      const ultSkill = resolveSkills(hero).find((skill) => skill.kind === 'ultimate') ?? null;
      if (ultSkill) {
        const cardW = cw - 64 * scale;
        const cardH = 104 * scale;
        const card = this.host.addChildPlainNode(dialog, 'LobbyHeroUltimateSkillCard', 0, h / 2 - 236 * scale, cardW, cardH);
        const cg = card.addComponent(Graphics);
        cg.fillColor = rgba(52, 18, 15, 225);
        cg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 9 * scale);
        cg.fill();
        cg.strokeColor = rgba(214, 158, 74, 200);
        cg.lineWidth = 1.6 * scale;
        cg.stroke();
        const iconX = -cardW / 2 + 48 * scale;
        const iconSize = 52 * scale;
        const slotG = this.host.addChildPlainNode(card, 'IconSlot', iconX, 0, iconSize + 16 * scale, iconSize + 16 * scale).addComponent(Graphics);
        slotG.fillColor = rgba(7, 7, 8, 215);
        slotG.circle(0, 0, iconSize * 0.62 + 3 * scale);
        slotG.fill();
        slotG.strokeColor = rgba(178, 140, 78, 190);
        slotG.lineWidth = 1.2 * scale;
        slotG.stroke();
        this.drawSkillIcon(card, iconX, 0, iconSize, scale, 0);
        const textX = iconX + iconSize / 2 + 22 * scale;
        const textW = cardW / 2 - textX - 18 * scale;
        const skillName = this.host.addChildLabel(card, 'Name', `${safeText(ultSkill.name)}  /  ${safeText(ultSkill.tag)}`, textX, 26 * scale, 22 * scale, rgba(252, 224, 150), new Size(textW, 30 * scale), HorizontalTextAlignment.LEFT);
        skillName.overflow = Label.Overflow.SHRINK;
        this.applyOutline(skillName, scale, false);
        const skillDesc = this.host.addChildLabel(card, 'Desc', safeText(ultSkill.description), textX, -14 * scale, 20 * scale, rgba(214, 196, 158), new Size(textW, 52 * scale), HorizontalTextAlignment.LEFT);
        skillDesc.lineHeight = 24 * scale;
        skillDesc.overflow = Label.Overflow.SHRINK;
      }
    }
    if (maxed || capped) {
      const hint = this.host.addChildLabel(dialog, 'LobbyHeroUltimateHint', maxed ? '终极技能已达最高等级。' : '已达当前上限，觉醒后可继续提升至 Lv.10。', 0, (frame ? -64 : 0) * scale, (frame ? 22 : 18) * scale, rgba(206, 122, 104), new Size(cw - 60 * scale, (frame ? 30 : 26) * scale));
      hint.overflow = Label.Overflow.SHRINK;
    } else if (cost) {
      // 材料行:名称 需求(持有),不足红;需求 0 不显示。
      const bag = this.host.currentLobbyBagState();
      const held = (code: string): number => Number(bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === code)?.itemCount ?? 0);
      const gold = Number(this.host.currentLobbyProfile().gold) || 0;
      const rows: Array<{ label: string; need: number; have: number; money?: boolean }> = [
        { label: '终极技能卷轴', need: cost.scroll, have: held('ULT_SCROLL') },
        { label: '金币', need: cost.gold, have: gold, money: true },
        { label: 'BOSS印记', need: cost.bossMark, have: held('BOSS_MARK') },
        { label: '深渊结晶', need: cost.abyssCrystal, have: held('ABYSS_CRYSTAL') },
      ].filter((row) => row.need > 0);
      let rowY = h / 2 - (frame ? 330 : 146) * scale;
      const lineH = (frame ? 48 : 34) * scale;
      rows.forEach((row, index) => {
        const enough = row.have >= row.need;
        const rowW = cw - 64 * scale;
        const line = this.host.addChildPlainNode(dialog, `LobbyHeroUltimateCost_${index}`, 0, rowY, rowW, lineH);
        const lg = line.addComponent(Graphics);
        lg.fillColor = rgba(22, 19, 16, 220);
        lg.roundRect(-rowW / 2, -lineH / 2, rowW, lineH, 7 * scale);
        lg.fill();
        lg.strokeColor = enough ? rgba(150, 122, 70, 160) : rgba(198, 96, 80, 190);
        lg.lineWidth = 1.2 * scale;
        lg.stroke();
        const nameLabel = this.host.addChildLabel(line, 'Name', row.label, -rowW / 2 + 14 * scale, 0, 16 * scale, rgba(214, 198, 166), new Size(rowW * 0.5, 22 * scale), HorizontalTextAlignment.LEFT);
        nameLabel.overflow = Label.Overflow.SHRINK;
        const amountText = `${row.need.toLocaleString('en-US')} / ${row.have.toLocaleString('en-US')}`;
        const amountLabel = this.host.addChildLabel(line, 'Amount', amountText, rowW / 2 - 14 * scale, 0, 16 * scale, enough ? rgba(238, 208, 144) : rgba(236, 110, 92), new Size(rowW * 0.5, 22 * scale), HorizontalTextAlignment.RIGHT);
        amountLabel.overflow = Label.Overflow.SHRINK;
        rowY -= (frame ? 58 : 42) * scale;
      });
    }

    const canUp = !maxed && !capped && !!cost && (() => {
      const bag = this.host.currentLobbyBagState();
      const held = (code: string): number => Number(bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === code)?.itemCount ?? 0);
      const gold = Number(this.host.currentLobbyProfile().gold) || 0;
      return held('ULT_SCROLL') >= cost.scroll && gold >= cost.gold && held('BOSS_MARK') >= cost.bossMark && held('ABYSS_CRYSTAL') >= cost.abyssCrystal;
    })();

    const buttonW = (frame ? 230 : 190) * scale;
    const buttonH = buttonW * (211 / 740);
    const buttonY = -h / 2 + (frame ? 64 : 56) * scale;
    const confirm = this.host.addChildPlainNode(dialog, 'LobbyHeroUltimateConfirm', -buttonW / 2 - (frame ? 24 : 16) * scale, buttonY, buttonW, buttonH);
    const confirmEnabled = canUp && !ult.busy;
    if (confirmEnabled) {
      confirm.addComponent(Button);
      confirm.on(Button.EventType.CLICK, () => this.host.confirmLobbyHeroUltimateUp(hero.id), this);
      this.host.applyImageButtonFeedback(confirm, 1.035, 0.965);
    }
    const confirmAsset = confirmEnabled ? 'ui/common/ai/button_primary/spriteFrame' : 'ui/common/ai/button_return_dis/spriteFrame';
    if (!this.host.addSprite('LobbyHeroUltimateConfirmArt', confirmAsset, 0, 0, buttonW, buttonH, confirm)) {
      const cg = confirm.addComponent(Graphics);
      cg.fillColor = confirmEnabled ? rgba(122, 42, 30, 235) : rgba(60, 52, 40, 220);
      cg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      cg.fill();
    }
    const confirmLabel = this.host.addChildLabel(confirm, 'Label', ult.busy ? '处理中…' : '升 级', 0, 1 * scale, 20 * scale, confirmEnabled ? rgba(255, 240, 200) : rgba(190, 176, 150), new Size(buttonW - 46 * scale, buttonH * 0.7));
    confirmLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(confirmLabel, scale, true);

    const cancel = this.host.addChildPlainNode(dialog, 'LobbyHeroUltimateClose', buttonW / 2 + (frame ? 24 : 16) * scale, buttonY, buttonW, buttonH);
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyHeroUltimateDialog(), this);
    this.host.applyImageButtonFeedback(cancel, 1.035, 0.965);
    if (!this.host.addSprite('LobbyHeroUltimateCloseArt', 'ui/common/ai/button_return_dis/spriteFrame', 0, 0, buttonW, buttonH, cancel)) {
      const xg = cancel.addComponent(Graphics);
      xg.fillColor = rgba(28, 24, 22, 230);
      xg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      xg.fill();
    }
    const cancelLabel = this.host.addChildLabel(cancel, 'Label', '关闭', 0, 1 * scale, 20 * scale, rgba(212, 196, 166), new Size(buttonW - 46 * scale, buttonH * 0.7));
    cancelLabel.overflow = Label.Overflow.SHRINK;
  }

  private renderRefineDialog(parent: Node, hero: LobbyHeroItemVO, panelWidth: number, panelHeight: number, scale: number): void {
    const affixes = hero.affixes ?? [];
    const lockedIds = new Set(this.host.currentLobbyHeroRefineState().lockedAttrIds.filter((id) => affixes.some((affix) => affix.id === id)));
    const pending = this.host.isLobbyHeroRefinePending(hero.id);

    const dim = this.host.addChildPlainNode(parent, 'LobbyHeroRefineDim', 0, 0, panelWidth, panelHeight);
    this.refineDialogNode = dim;
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 178);
    dimGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    // 底板按素材原比(1448:1086),行高按词条数在可用区内回收。
    // 手机:全屏程序面板(雕花底板不能非等比拉伸),词条条宽封顶 1000 居中。
    const frame = this.phoneFrame;
    const dialogWidth = frame ? frame.dialogWidth : Math.min(880 * scale, panelWidth - 60 * scale);
    const dialogHeight = frame ? frame.dialogHeight : dialogWidth / (1448 / 1086);
    const dialog = this.host.addChildPlainNode(dim, 'LobbyHeroRefineDialog', 0, 0, dialogWidth, dialogHeight);
    if (frame) {
      this.drawPhoneDialogPanel(dialog, dialogWidth, dialogHeight, scale);
      this.renderPhoneDialogTitle(dialog, 'LobbyHeroRefineTitle', `洗练 · ${safeText(hero.heroName)}`, dialogWidth, dialogHeight / 2 - 40 * scale, scale, () => this.host.closeLobbyHeroRefineDialog());
    } else {
      const panelGraphics = dialog.addComponent(Graphics);
      panelGraphics.fillColor = rgba(12, 10, 9, 248);
      panelGraphics.rect(-dialogWidth * 0.47, -dialogHeight * 0.46, dialogWidth * 0.94, dialogHeight * 0.92);
      panelGraphics.fill();
      if (!this.host.addSprite('LobbyHeroRefineDialogBg', 'ui/hero/ai/refine_panel_bg/spriteFrame', 0, 0, dialogWidth, dialogHeight, dialog)) {
        panelGraphics.strokeColor = rgba(150, 112, 58, 220);
        panelGraphics.lineWidth = 2 * scale;
        panelGraphics.roundRect(-dialogWidth / 2, -dialogHeight / 2, dialogWidth, dialogHeight, 12 * scale);
        panelGraphics.stroke();
      }
      const title = this.host.addChildLabel(dialog, 'LobbyHeroRefineTitle', `洗练 · ${safeText(hero.heroName)}`, 0, dialogHeight / 2 - 72 * scale, 25 * scale, rgba(247, 218, 148), new Size(dialogWidth - 160 * scale, 30 * scale));
      title.overflow = Label.Overflow.SHRINK;
      this.applyOutline(title, scale, true);
      // 右上关闭(全局圆形金X)。
      const closeSize = 46 * scale;
      const close = this.host.addChildPlainNode(dialog, 'LobbyHeroRefineClose', dialogWidth / 2 - 62 * scale, dialogHeight / 2 - 72 * scale, closeSize, closeSize);
      close.addComponent(Button);
      close.on(Button.EventType.CLICK, () => this.host.closeLobbyHeroRefineDialog(), this);
      this.host.applyImageButtonFeedback(close, 1.08, 0.94);
      this.host.addSprite('LobbyHeroRefineCloseArt', 'ui/common/ai/button_close/spriteFrame', 0, 0, closeSize, closeSize, close);
    }
    const hint = this.host.addChildLabel(dialog, 'LobbyHeroRefineHint', '点击词条切换锁定：锁定保留不洗，其余重新随机；锁得越多消耗越高。', 0, dialogHeight / 2 - (frame ? 84 : 104) * scale, 16 * scale, rgba(196, 178, 140), new Size(dialogWidth - 130 * scale, 22 * scale));
    hint.overflow = Label.Overflow.SHRINK;

    // 词条横条区:上界 hint 之下,下界给消耗/按钮区留 170。
    const listTop = dialogHeight / 2 - (frame ? 108 : 130) * scale;
    const listBottom = -dialogHeight / 2 + (frame ? 158 : 192) * scale;
    const rowCount = Math.max(1, affixes.length);
    const rowStride = Math.min(76 * scale, (listTop - listBottom) / rowCount);
    const rowH = rowStride - 9 * scale;
    const cardWidth = frame ? Math.min(dialogWidth - 80 * scale, 1000 * scale) : dialogWidth - 120 * scale;
    affixes.forEach((affix, index) => {
      const cy = listTop - rowStride / 2 - index * rowStride;
      const locked = lockedIds.has(affix.id);
      const card = this.host.addChildPlainNode(dialog, `LobbyHeroRefineAffix_${index}`, 0, cy, cardWidth, rowH);
      const q = affixQualityColor(affix.quality);
      const g = card.addComponent(Graphics);
      // 品质色横条:深底浓品质染(参考图深色染色条,亮底会吃掉品质感)+ 品质描边;锁定金框高亮。
      g.fillColor = locked ? rgba(58, 44, 16, 242) : rgba(Math.round(q.r * 0.3 + 6), Math.round(q.g * 0.3 + 6), Math.round(q.b * 0.3 + 6), 236);
      g.roundRect(-cardWidth / 2, -rowH / 2, cardWidth, rowH, 7 * scale);
      g.fill();
      g.strokeColor = locked ? rgba(242, 196, 96, 240) : rgba(q.r, q.g, q.b, 185);
      g.lineWidth = (locked ? 2.4 : 1.5) * scale;
      g.roundRect(-cardWidth / 2, -rowH / 2, cardWidth, rowH, 7 * scale);
      g.stroke();
      // 左圆图记:暗底 + 品质双环 + 品质色菱形芯。
      const iconR = Math.min(rowH * 0.36, 20 * scale);
      const iconX = -cardWidth / 2 + 14 * scale + iconR;
      g.fillColor = rgba(10, 9, 8, 245);
      g.circle(iconX, 0, iconR);
      g.fill();
      g.strokeColor = rgba(q.r, q.g, q.b, 235);
      g.lineWidth = 1.8 * scale;
      g.circle(iconX, 0, iconR);
      g.stroke();
      g.circle(iconX, 0, iconR * 0.72);
      g.stroke();
      this.drawAffixGlyph(g, affix.code, iconX, iconR, q, scale);
      // 名称+数值:品质色文字。
      const shortLabel = HERO_AFFIX_SHORT_LABELS[affix.code] ?? safeText(affix.name || affix.code);
      const name = this.host.addChildLabel(card, 'LobbyHeroRefineAffixName', `${shortLabel} ${heroAffixValueText(affix.code, affix.value ?? 0)}`, iconX + iconR + 14 * scale, 0, 21 * scale, locked ? rgba(248, 226, 166) : rgba(Math.min(255, q.r + 60), Math.min(255, q.g + 60), Math.min(255, q.b + 60), 255), new Size(cardWidth * 0.5, rowH - 8 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      this.applyOutline(name, scale, false);
      // 八角品质章 + 字母。
      const badgeX = cardWidth / 2 - 190 * scale;
      const badgeR = Math.min(rowH * 0.42, 22 * scale);
      const oct = 8;
      const traceOct = () => {
        for (let corner = 0; corner <= oct; corner += 1) {
          const angle = Math.PI / 8 + (Math.PI * 2 * corner) / oct;
          const px = badgeX + Math.cos(angle) * badgeR;
          const py = Math.sin(angle) * badgeR;
          if (corner === 0) {
            g.moveTo(px, py);
          } else {
            g.lineTo(px, py);
          }
        }
      };
      // 实底徽章:暗底填充 + 品质描边(参考图厚重感)。
      g.fillColor = rgba(9, 8, 7, 240);
      traceOct();
      g.fill();
      g.strokeColor = rgba(q.r, q.g, q.b, 235);
      g.lineWidth = 2 * scale;
      traceOct();
      g.stroke();
      const qualityTag = this.host.addChildLabel(card, 'LobbyHeroRefineAffixQuality', safeText(affix.quality), badgeX, 0, 21 * scale, rgba(q.r, q.g, q.b, 255), new Size(badgeR * 2.4, rowH - 8 * scale));
      qualityTag.overflow = Label.Overflow.SHRINK;
      this.applyOutline(qualityTag, scale, true);
      // 挂锁 + 状态字。
      const lockH = Math.min(rowH * 0.62, 34 * scale);
      const lockX = cardWidth / 2 - 118 * scale;
      // 挂锁直接贴行底(去掉暗圆衬底,与属性条底色一致)。
      // 双件挂锁:锁定=锁梁扣合,未锁定=锁梁上抬微倾;素材缺失回退单张 ic_lock。
      if (!renderLockGlyph(this.host, card, `LobbyHeroRefineAffixLockIcon_${index}`, lockX, 0, lockH, locked)) {
        const lockSprite = this.host.addSprite(`LobbyHeroRefineAffixLockFallback_${index}`, 'ui/common/ai/ic_lock/spriteFrame', lockX, 0, lockH * (135 / 192), lockH, card);
        if (lockSprite && !locked) {
          const lockDim = lockSprite.node.addComponent(UIOpacity);
          lockDim.opacity = 150;
        }
      }
      const lockTag = this.host.addChildLabel(card, 'LobbyHeroRefineAffixLock', locked ? '已锁定' : '未锁定', cardWidth / 2 - 18 * scale, 0, 17 * scale, locked ? rgba(244, 200, 100, 255) : rgba(148, 138, 122, 255), new Size(84 * scale, rowH - 8 * scale), HorizontalTextAlignment.RIGHT);
      lockTag.overflow = Label.Overflow.SHRINK;
      if (affix.id > 0 && !pending) {
        card.addComponent(Button);
        card.on(Button.EventType.CLICK, () => this.host.toggleLobbyHeroRefineLock(affix.id), this);
      }
    });

    // 消耗预估(与服务器公式一致:石1/金500 各×2^锁数)+ 持有量(不足时警示红)。
    const lockCount = lockedIds.size;
    const multiplier = Math.pow(2, lockCount);
    const goldCost = 500 * multiplier;
    // 消耗行图标化:重铸石/金币各带图标;重铸石图标素材未生成时该段自动只显示文字。
    const costY = listBottom - 24 * scale;
    // 手机端 19 号字会被抬到 20,估宽跟着放大,避免字被 SHRINK 压小。
    const cjkW = (frame ? 20 : 17) * scale;
    const asciiW = (frame ? 11 : 9.5) * scale;
    const estWidth = (text: string): number => {
      let total = 0;
      for (const ch of Array.from(text)) {
        total += ch.charCodeAt(0) > 255 ? cjkW : asciiW;
      }
      return total;
    };
    const costSegments: { icon: string | null; text: string }[] = [
      { icon: null, text: '消耗：' },
      { icon: 'ui/bag/ai/icon_reforge_stone/spriteFrame', text: `深渊重铸石 x${formatInteger(multiplier)}` },
      { icon: 'ui/bag/ai/icon_gold/spriteFrame', text: `金币 ${formatInteger(goldCost)}（锁定 ${lockCount} 条）` },
    ];
    const costIconSize = 26 * scale;
    const costIconGap = 5 * scale;
    const costSegGap = 14 * scale;
    const segWidths = costSegments.map((seg) => (seg.icon ? costIconSize + costIconGap : 0) + estWidth(seg.text));
    let costCursor = -(segWidths.reduce((sum, width) => sum + width, 0) + costSegGap * (costSegments.length - 1)) / 2;
    costSegments.forEach((seg, index) => {
      if (seg.icon) {
        this.host.addSprite(`LobbyHeroRefineCostIcon_${index}`, seg.icon, costCursor + costIconSize / 2, costY, costIconSize, costIconSize, dialog);
        costCursor += costIconSize + costIconGap;
      }
      const textWidth = estWidth(seg.text);
      const segLabel = this.host.addChildLabel(dialog, `LobbyHeroRefineCostSeg_${index}`, seg.text, costCursor + textWidth / 2, costY, 19 * scale, rgba(238, 208, 144), new Size(textWidth + 10 * scale, 24 * scale));
      segLabel.overflow = Label.Overflow.SHRINK;
      costCursor += textWidth + costSegGap;
    });
    const profile = this.host.currentLobbyProfile();
    const bag = this.host.currentLobbyBagState();
    const stoneCount = bag.groups
      .flatMap((group) => group.items)
      .find((item) => item.itemCode === 'DEEP_REFORGE_STONE')?.itemCount ?? 0;
    const goldHeld = Number(profile.gold) || 0;
    const stoneText = bag.loading && !bag.loaded ? '读取中' : `x${formatInteger(stoneCount)}`;
    const shortage = (bag.loaded && stoneCount < multiplier) || goldHeld < goldCost;
    const holdings = this.host.addChildLabel(dialog, 'LobbyHeroRefineHoldings', `持有：深渊重铸石 ${stoneText} · 金币 ${formatDecimalValue(profile.gold)}${shortage ? ' · 材料不足' : ''}`, 0, listBottom - 52 * scale, 17 * scale, shortage ? rgba(230, 122, 100) : rgba(188, 172, 136), new Size(dialogWidth - 150 * scale, 22 * scale));
    holdings.overflow = Label.Overflow.SHRINK;

    const buttonY = frame ? -dialogHeight / 2 + 52 * scale : -dialogHeight / 2 + dialogHeight * 0.125;
    const buttonW = 230 * scale;
    const buttonH = buttonW * (211 / 740);
    const confirm = this.host.addChildPlainNode(dialog, 'LobbyHeroRefineConfirm', -buttonW / 2 - 22 * scale, buttonY, buttonW, buttonH);
    const confirmArt = this.host.addSprite('LobbyHeroRefineConfirmArt', pending ? C1812_BUTTON_RETURN_ASSET : C1812_BUTTON_PRIMARY_ASSET, 0, 0, buttonW, buttonH, confirm);
    if (!confirmArt) {
      const cg = confirm.addComponent(Graphics);
      cg.fillColor = pending ? rgba(70, 56, 34, 220) : rgba(122, 42, 30, 235);
      cg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      cg.fill();
      cg.strokeColor = rgba(214, 152, 74, 220);
      cg.lineWidth = 2 * scale;
      cg.stroke();
    }
    const confirmLabel = this.host.addChildLabel(confirm, 'LobbyHeroRefineConfirmLabel', pending ? '洗练中…' : '确认洗练', 0, 1 * scale, 21 * scale, rgba(250, 228, 172), new Size(buttonW - 56 * scale, buttonH - 12 * scale));
    confirmLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(confirmLabel, scale, true);
    if (!pending) {
      confirm.addComponent(Button);
      confirm.on(Button.EventType.CLICK, () => this.host.refineLobbyHero(hero.id), this);
      this.host.applyImageButtonFeedback(confirm);
    }

    const cancel = this.host.addChildPlainNode(dialog, 'LobbyHeroRefineCancel', buttonW / 2 + 22 * scale, buttonY, buttonW, buttonH);
    const cancelArt = this.host.addSprite('LobbyHeroRefineCancelArt', C1812_BUTTON_RETURN_ASSET, 0, 0, buttonW, buttonH, cancel);
    if (!cancelArt) {
      const xg = cancel.addComponent(Graphics);
      xg.fillColor = rgba(28, 24, 22, 230);
      xg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      xg.fill();
      xg.strokeColor = rgba(128, 108, 76, 190);
      xg.lineWidth = 1.5 * scale;
      xg.stroke();
    }
    const cancelLabel = this.host.addChildLabel(cancel, 'LobbyHeroRefineCancelLabel', '取消', 0, 1 * scale, 21 * scale, rgba(212, 196, 166), new Size(buttonW - 56 * scale, buttonH - 12 * scale));
    cancelLabel.overflow = Label.Overflow.SHRINK;
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyHeroRefineDialog(), this);
    this.host.applyImageButtonFeedback(cancel);
  }

  /**
   * 战力变动浮字:在屏幕中上部飘 "战力 +N"(绿)/"-N"(红),1.4s 上浮渐隐后自毁。
   * 供宿主在穿卸/洗练/升级等操作完成后调用;须在该操作最后一次整刷之后调,否则节点会被重建清掉。
   */
  // 持久浮层:挂根 Canvas 下,不参与任何 content root 清理(异步补图整页重绘会 clear 内容根,
  // 刚生成的浮字若挂在内容根会被瞬间销毁);浮字自身 tween 结束自毁。
  private ensureFloatLayer(): Node {
    const hostNode = this.host.node;
    let floatLayer = hostNode.getChildByName('LobbyPowerFloatLayer');
    if (!floatLayer) {
      floatLayer = new Node('LobbyPowerFloatLayer');
      floatLayer.layer = hostNode.layer;
      hostNode.addChild(floatLayer);
      floatLayer.addComponent(UITransform).setContentSize(new Size(10, 10));
    }
    floatLayer.setSiblingIndex(hostNode.children.length - 1);
    return floatLayer;
  }

  // 通用奖励飘字(背包使用等):多条消息错行、依次延迟上浮后淡出。
  spawnRewardFloats(messages: string[]): void {
    const lines = (messages ?? []).map((text) => safeText(text)).filter((text) => text.length > 0).slice(0, 4);
    if (lines.length === 0) {
      return;
    }
    const floatLayer = this.ensureFloatLayer();
    lines.forEach((text, index) => {
      const node = new Node(`LobbyRewardFloat_${Date.now()}_${index}`);
      node.layer = this.host.node.layer;
      floatLayer.addChild(node);
      node.setPosition(new Vec3(0, 70 - index * 44, 0));
      node.addComponent(UITransform).setContentSize(new Size(620, 46));
      const label = node.addComponent(Label);
      label.string = text;
      label.fontSize = 30;
      label.lineHeight = 36;
      label.color = rgba(250, 222, 142, 255);
      label.enableOutline = true;
      label.outlineColor = rgba(0, 0, 0, 235);
      label.outlineWidth = 2.4;
      const opacity = node.addComponent(UIOpacity);
      opacity.opacity = 255;
      tween(node)
        .delay(index * 0.12)
        .by(1.5, { position: new Vec3(0, 104, 0) })
        .start();
      tween(opacity)
        .delay(0.75 + index * 0.12)
        .to(0.85, { opacity: 0 })
        .call(() => {
          if (node.isValid) {
            node.destroy();
          }
        })
        .start();
    });
  }

  spawnPowerDeltaFloat(delta: number): void {
    if (!Number.isFinite(delta) || Math.trunc(delta) === 0) {
      return;
    }
    const value = Math.trunc(delta);
    const floatLayer = this.ensureFloatLayer();
    const node = new Node(`LobbyPowerDeltaFloat_${Date.now()}`);
    node.layer = this.host.node.layer;
    floatLayer.addChild(node);
    node.setPosition(new Vec3(0, 120, 0));
    node.addComponent(UITransform).setContentSize(new Size(420, 60));
    const label = node.addComponent(Label);
    // formatInteger 对负数会钳成 0,这里用 abs+手动符号,保证 "-238" 正确显示。
    label.string = `战力 ${value > 0 ? '+' : '-'}${formatInteger(Math.abs(value))}`;
    label.fontSize = 40;
    label.lineHeight = 48;
    label.color = value > 0 ? rgba(118, 232, 120, 255) : rgba(240, 92, 70, 255);
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 235);
    label.outlineWidth = 3;
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 255;
    tween(node)
      .by(1.4, { position: new Vec3(0, 96, 0) })
      .start();
    tween(opacity)
      .delay(0.55)
      .to(0.85, { opacity: 0 })
      .call(() => {
        if (node.isValid) {
          node.destroy();
        }
      })
      .start();
  }

  private renderHeader(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    // 名牌(hero_nameplate 764×253,左侧红徽记):名字/元数据/星级三行,文字中心右移避开徽记。
    // 手机:名牌压在立绘区底部(不再屏幕居中,否则压进右栏)。
    const frame = this.phoneFrame;
    const plateWidth = frame ? frame.plateWidth : Math.min(520 * scale, Math.max(340 * scale, width * 0.36));
    const plateHeight = plateWidth * (253 / 764);
    const plateX = frame ? frame.plateX : 0;
    const plateY = frame ? frame.plateY : -height / 2 + 118 * scale;
    const plate = this.host.addChildPlainNode(parent, 'LobbyHeroDetailIdentityPlate', plateX, plateY, plateWidth, plateHeight);
    const plateArt = this.host.addSprite('LobbyHeroDetailPlateArt', HERO_AI_NAMEPLATE_ASSET, 0, 0, plateWidth, plateHeight, plate);
    if (!plateArt) {
      const graphics = plate.addComponent(Graphics);
      graphics.fillColor = rgba(5, 5, 8, 142);
      graphics.rect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight);
      graphics.fill();
    }
    const textShift = plateArt ? plateWidth * 0.07 : 0;
    const title = this.host.addChildLabel(plate, 'LobbyHeroDetailName', safeText(hero.heroName), textShift, plateHeight * 0.24, 26 * scale, rgba(252, 225, 156), new Size(plateWidth * 0.72, 34 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    // 名称下金色分割线(divider_line_l 素材,缺图退程序线)。
    const lineY = plateHeight * 0.11;
    if (!this.host.addSprite('LobbyHeroDetailNameLine', 'ui/hero/ai/divider_line_l/spriteFrame', textShift, lineY, plateWidth * 0.58, 4 * scale, plate)) {
      const lg = plate.addComponent(Graphics);
      lg.strokeColor = rgba(190, 152, 84, 200);
      lg.lineWidth = 1.4 * scale;
      lg.moveTo(textShift - plateWidth * 0.29, lineY);
      lg.lineTo(textShift + plateWidth * 0.29, lineY);
      lg.stroke();
    }
    const metaY = -plateHeight * 0.04;
    const rarityText = safeText(hero.rarity || 'R');
    const rarityLabel = this.host.addChildLabel(plate, 'LobbyHeroDetailRarity', rarityText, textShift - plateWidth * 0.22, metaY, 22 * scale, this.rarityColor(hero.rarity), new Size(plateWidth * 0.18, 30 * scale));
    rarityLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(rarityLabel, scale, true);
    const levelLabel = this.host.addChildLabel(plate, 'LobbyHeroDetailLevel', `Lv.${hero.level}`, textShift - plateWidth * 0.05, metaY, 17 * scale, rgba(224, 206, 168), new Size(plateWidth * 0.18, 22 * scale));
    levelLabel.overflow = Label.Overflow.SHRINK;
    const sep = this.host.addChildLabel(plate, 'LobbyHeroDetailMetaSep', '丨', textShift + plateWidth * 0.075, metaY, 16 * scale, rgba(170, 152, 120, 130), new Size(20 * scale, 22 * scale));
    sep.overflow = Label.Overflow.SHRINK;
    const powerLabel = this.host.addChildLabel(plate, 'LobbyHeroDetailPower', `战力 ${formatInteger(hero.power)}`, textShift + plateWidth * 0.21, metaY, 17 * scale, rgba(224, 206, 168), new Size(plateWidth * 0.3, 22 * scale));
    powerLabel.overflow = Label.Overflow.SHRINK;
    if (frame) {
      // bt2-hero-refine:手机字号被抬到 20,固定比例定位会让"Lv / 丨 / 战力"挤在一起(窄屏分隔符贴着"战")。
      // 改按实际字宽排成一组居中、间距均分;放不下时先去掉分隔符,再整体缩字。
      const avail = plateWidth * 0.66;
      const metaFont = 20 * scale;
      let parts: { label: Label; w: number }[] = [
        { label: rarityLabel, w: estimateTextWidth(rarityText, 22 * scale) * 1.18 + 4 * scale },
        { label: levelLabel, w: estimateTextWidth(levelLabel.string, metaFont) + 4 * scale },
        { label: sep, w: 10 * scale },
        { label: powerLabel, w: estimateTextWidth(powerLabel.string, metaFont) + 4 * scale },
      ];
      const sumOf = (list: { w: number }[]): number => list.reduce((sum, part) => sum + part.w, 0);
      if (sumOf(parts) + 3 * 10 * scale > avail) {
        sep.node.active = false;
        parts = parts.filter((part) => part.label !== sep);
      }
      const minGap = (parts.length === 4 ? 10 : 14) * scale;
      const shrink = Math.min(1, (avail - minGap * (parts.length - 1)) / sumOf(parts));
      parts.forEach((part) => { part.w *= shrink; });
      const gap = clamp((avail - sumOf(parts)) / (parts.length - 1), minGap, (parts.length === 4 ? 14 : 22) * scale);
      let cursor = textShift - (sumOf(parts) + gap * (parts.length - 1)) / 2;
      parts.forEach((part) => {
        part.label.horizontalAlign = HorizontalTextAlignment.CENTER;
        part.label.overflow = Label.Overflow.SHRINK;
        part.label.node.getComponent(UITransform)?.setContentSize(new Size(part.w, 28 * scale));
        part.label.node.setPosition(new Vec3(cursor + part.w / 2, metaY, 0));
        cursor += part.w + gap;
      });
    }
    this.renderStarRow(plate, hero, textShift, -plateHeight * 0.28, plateWidth * 0.6, scale);
    // 左右切换英雄:AI 箭头图优先,缺图回退程序圆钮。
    const renderSwitchArrow = (name: string, direction: number) => {
      const arrowSize = 64 * scale;
      const ax = plateX + (plateWidth / 2 + 46 * scale) * (direction >= 0 ? 1 : -1);
      const arrow = this.host.addChildPlainNode(parent, name, ax, plateY, arrowSize, arrowSize);
      // 暗色圆衬底:箭头素材线条较淡,垫底提对比。
      const arrowBack = this.host.addChildPlainNode(arrow, `${name}Back`, 0, 0, arrowSize, arrowSize);
      const abg = arrowBack.addComponent(Graphics);
      abg.fillColor = rgba(10, 8, 8, 178);
      abg.circle(0, 0, arrowSize * 0.46);
      abg.fill();
      abg.strokeColor = rgba(160, 126, 70, 160);
      abg.lineWidth = 1.4 * scale;
      abg.circle(0, 0, arrowSize * 0.46);
      abg.stroke();
      const art = this.host.addSprite(`${name}Art`, direction >= 0 ? HERO_AI_SWITCH_RIGHT_ASSET : HERO_AI_SWITCH_LEFT_ASSET, 0, 0, arrowSize * 0.78, arrowSize * 0.78, arrow);
      if (!art) {
        const g = arrow.addComponent(Graphics);
        g.fillColor = rgba(16, 13, 11, 210);
        g.circle(0, 0, arrowSize / 2);
        g.fill();
        g.strokeColor = rgba(214, 176, 96, 200);
        g.lineWidth = 2 * scale;
        g.circle(0, 0, arrowSize / 2);
        g.stroke();
        g.fillColor = rgba(244, 216, 150, 240);
        const tip = 10 * scale * (direction >= 0 ? 1 : -1);
        g.moveTo(tip, 0);
        g.lineTo(-tip * 0.6, 9 * scale);
        g.lineTo(-tip * 0.6, -9 * scale);
        g.close();
        g.fill();
      }
      arrow.addComponent(Button);
      arrow.on(Button.EventType.CLICK, () => this.host.switchLobbyHeroDetail(direction), this);
      this.host.applyImageButtonFeedback(arrow);
    };
    renderSwitchArrow('LobbyHeroDetailSwitchPrev', -1);
    renderSwitchArrow('LobbyHeroDetailSwitchNext', 1);
  }

  // 四页签(参考图):属性默认;装备页=中央环绕格+右栏可穿列表;技能/升星独占右栏。
  private renderDesktop(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const tab = this.host.currentLobbyHeroDetailTab();
    // 背景两侧压暗:左右各 4 级阶梯渐晕带,中央立绘与右栏更突出。
    const sideShade = this.host.addChildPlainNode(parent, 'LobbyHeroDetailSideShade', 0, 0, width, height);
    const shadeG = sideShade.addComponent(Graphics);
    for (let band = 0; band < 4; band += 1) {
      const bandW = width * 0.055;
      shadeG.fillColor = rgba(0, 0, 0, 104 - band * 24);
      shadeG.rect(-width / 2 + band * bandW, -height / 2, bandW, height);
      shadeG.fill();
      shadeG.rect(width / 2 - (band + 1) * bandW, -height / 2, bandW, height);
      shadeG.fill();
    }
    const artWidth = Math.min(620 * scale, Math.max(430 * scale, width * 0.44));
    const artHeight = height - 138 * scale;
    const artX = 0;
    const artY = -28 * scale;
    this.renderArtStage(parent, hero, artX, artY, artWidth, artHeight, scale);
    if (tab === 'equip') {
      this.renderEquipSlotsAroundArt(parent, hero, artX, artY, artWidth, artHeight, scale);
    }

    const infoX = width / 2 - 294 * scale;
    const infoY = 14 * scale;
    const infoWidth = 548 * scale;
    const infoHeight = height - 176 * scale;
    if (tab === 'attr') {
      this.renderInfoPanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    } else if (tab === 'equip') {
      this.renderWearablePanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    } else if (tab === 'skill') {
      this.renderSkillPanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    } else {
      this.renderStarCurrencyBar(parent, hero, width, height, scale);
      this.renderStarPanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    }
    this.renderDetailNav(parent, tab, width, height, scale);
  }

  private renderCompact(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const margin = 30 * scale;
    const gap = 14 * scale;
    const reservedInfoWidth = Math.min(420 * scale, Math.max(176 * scale, width * 0.56));
    const artWidth = clamp(width - margin * 2 - gap - reservedInfoWidth, 96 * scale, 288 * scale);
    const infoWidth = Math.max(168 * scale, width - margin * 2 - gap - artWidth);
    const artHeight = Math.max(170 * scale, height - 170 * scale);
    const infoHeight = Math.max(236 * scale, height - 156 * scale);
    const artX = -width / 2 + margin + artWidth / 2;
    const infoX = artX + artWidth / 2 + gap + infoWidth / 2;
    const sharedY = -18 * scale;
    this.renderArtStage(parent, hero, artX, sharedY, artWidth, artHeight, scale);
    this.renderEquipSlotsAroundArt(parent, hero, artX, sharedY, artWidth, artHeight, scale * 0.82);
    this.renderInfoPanel(parent, hero, infoX, sharedY, infoWidth, infoHeight, scale);
  }

  /**
   * 手机横屏分区(设计高 720):左侧竖排页签(避开左上标题横幅)、右栏宽约 42% 屏宽从货币栏下方贴到底边、
   * 中间立绘区;名牌压在立绘区底部,立绘脚底落在名牌顶上方,头顶不出舞台。
   */
  private resolvePhoneFrame(width: number, height: number, scale: number): HeroDetailPhoneFrame {
    const edge = 16 * scale;
    // bt-hero-beautify:页签换雕花牌(约 4:1),列宽 104 → 160。
    // bt2-hero-refine:再加宽到 180~208(牌是等比图,宽度决定高度:52~60),与立绘区的间距收到 6 把宽度还给名牌。
    const tabWidth = clamp(width * 0.134, 180 * scale, 208 * scale);
    const tabX = -width / 2 + edge + tabWidth / 2;
    const infoWidth = clamp(width * 0.42, 500 * scale, 640 * scale);
    const infoRight = width / 2 - edge;
    const infoX = infoRight - infoWidth / 2;
    const infoTop = height / 2 - 90 * scale;
    const infoBottom = -height / 2 + edge;
    const artLeft = tabX + tabWidth / 2 + 6 * scale;
    const artRight = infoRight - infoWidth - edge;
    const artWidth = Math.max(240 * scale, artRight - artLeft);
    const artX = (artLeft + artRight) / 2;
    // 名牌两侧各留切换箭头(64)+ 间距。
    const plateWidth = clamp(artWidth - 180 * scale, 280 * scale, 400 * scale);
    const plateHeight = plateWidth * (253 / 764);
    const plateY = -height / 2 + edge + plateHeight / 2;
    // 立绘舞台脚底在 -0.43H(resolveHeroDetailGroundY),反推舞台高:脚底 = 名牌顶 - 8,舞台顶 = 舞台上沿 - 6。
    const groundY = plateY + plateHeight / 2 - 8 * scale;
    const artTop = height / 2 - 6 * scale;
    const artHeight = Math.max(240 * scale, (artTop - groundY) / 0.93);
    const artY = artTop - artHeight / 2;
    return {
      tabX,
      tabWidth,
      artX,
      artY,
      artWidth,
      artHeight,
      plateX: artX,
      plateY,
      plateWidth,
      infoX,
      infoY: (infoTop + infoBottom) / 2,
      infoWidth,
      infoHeight: infoTop - infoBottom,
      dialogWidth: width - edge * 2,
      dialogHeight: height - edge * 2,
    };
  }

  // 手机横屏:与桌面同一套四页签内容,只换分区(右栏占满整高,页签竖排在左)。
  private renderPhone(parent: Node, hero: LobbyHeroItemVO, frame: HeroDetailPhoneFrame, width: number, height: number, scale: number): void {
    const tab = this.host.currentLobbyHeroDetailTab();
    const sideShade = this.host.addChildPlainNode(parent, 'LobbyHeroDetailSideShade', 0, 0, width, height);
    const shadeG = sideShade.addComponent(Graphics);
    for (let band = 0; band < 4; band += 1) {
      const bandW = width * 0.055;
      shadeG.fillColor = rgba(0, 0, 0, 104 - band * 24);
      shadeG.rect(-width / 2 + band * bandW, -height / 2, bandW, height);
      shadeG.fill();
      shadeG.rect(width / 2 - (band + 1) * bandW, -height / 2, bandW, height);
      shadeG.fill();
    }
    this.renderArtStage(parent, hero, frame.artX, frame.artY, frame.artWidth, frame.artHeight, scale);
    if (tab === 'equip') {
      this.renderEquipSlotsAroundArt(parent, hero, frame.artX, frame.artY, frame.artWidth, frame.artHeight, scale);
    }
    const { infoX, infoY, infoWidth, infoHeight } = frame;
    if (tab === 'attr') {
      this.renderInfoPanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    } else if (tab === 'equip') {
      this.renderWearablePanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    } else if (tab === 'skill') {
      this.renderSkillPanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    } else {
      this.renderStarCurrencyBar(parent, hero, width, height, scale);
      this.renderStarPanel(parent, hero, infoX, infoY, infoWidth, infoHeight, scale);
    }
    this.renderDetailNav(parent, tab, width, height, scale);
  }

  // 升星页顶部持有展示:金币 + 本英雄同名碎片(按稀有度取碎片图标)。
  private renderStarCurrencyBar(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const starProfile = this.host.currentLobbyProfile();
    const starBag = this.host.currentLobbyBagState();
    const starFragCode = `HERO_FRAGMENT:${(hero.heroCode || '').toUpperCase()}`;
    const starFragOwned = starBag.groups.flatMap((group) => group.items).find((item) => (item.itemCode || '').toUpperCase() === starFragCode)?.itemCount ?? 0;
    const shardTier = (hero.rarity || '').toLowerCase();
    const shardIcon = `ui/bag/ai/icon_shard_${['r', 'sr', 'ssr', 'ur'].includes(shardTier) ? shardTier : 'n'}/spriteFrame`;
    renderTopCurrencyBar(this.host, parent, width / 2, height / 2, scale, [
      { key: 'gold', icon: 'ui/bag/ai/icon_gold/spriteFrame', value: formatDecimalValue(starProfile.gold) },
      { key: 'shard', icon: shardIcon, value: formatInteger(starFragOwned) },
    ], 130);
  }


  // 装备穿戴栏(2026-09-27 用户:"要像按部位穿戴一样"):六格按身体部位错落排在立绘两侧——
  // 左列 头盔(头)/胸甲(躯干)/鞋子(脚),右列 武器(手)/项链(颈)/戒指(手),每格一条指向身体的引线;
  // 八角厚底板 + 品质描边 + 四角铆钉,空格画部位线稿 + "点击穿戴",已穿显示真图 + 强化 +N 角标 + 名字。
  private renderEquipSlotsAroundArt(parent: Node, hero: LobbyHeroItemVO, artX: number, artY: number, artWidth: number, artHeight: number, scale: number): void {
    const state = this.host.currentLobbyHeroEquipState();
    const equippedBySlot = new Map<string, EquipmentItemVO>();
    state.items.forEach((item) => {
      if (item.heroId === hero.id) {
        equippedBySlot.set(item.slot, item);
      }
    });
    const slotSize = 96 * scale;
    const columnOffset = Math.max(artWidth / 2 - slotSize / 2 - 6 * scale, artWidth * 0.34);
    const leftX = artX - columnOffset;
    const rightX = artX + columnOffset;
    // 三档高度对应 头 / 躯干 / 脚(立绘脚底在 artY - 0.43H)
    // 底行不能压到底部英雄名牌(名牌顶约 -0.33H),脚位收到 -0.22H
    // 手机:立绘区顶贴着左上标题横幅,三行整体收拢一点(名牌在立绘区底下,不会压到脚位)。
    const phone = !!this.phoneFrame;
    const rowYs = phone
      ? [artY + artHeight * 0.26, artY, artY - artHeight * 0.24]
      : [artY + artHeight * 0.3, artY + artHeight * 0.03, artY - artHeight * 0.22];
    const bodyX = (side: 'left' | 'right'): number => artX + (side === 'left' ? -1 : 1) * artWidth * 0.13;
    const slotByCode = new Map(HERO_EQUIP_SLOTS.map((slot) => [slot.code, slot]));
    const columns: Array<{ side: 'left' | 'right'; x: number; codes: string[] }> = [
      { side: 'left', x: leftX, codes: ['HELMET', 'CHEST', 'BOOTS'] },
      { side: 'right', x: rightX, codes: ['WEAPON', 'NECKLACE', 'RING'] },
    ];
    const cut = 14 * scale;
    const traceOctagon = (g: Graphics, size: number, inset: number): void => {
      const h = size / 2 - inset;
      const c = Math.max(4 * scale, cut - inset);
      g.moveTo(-h + c, h);
      g.lineTo(h - c, h);
      g.lineTo(h, h - c);
      g.lineTo(h, -h + c);
      g.lineTo(h - c, -h);
      g.lineTo(-h + c, -h);
      g.lineTo(-h, -h + c);
      g.lineTo(-h, h - c);
      g.close();
    };
    columns.forEach((column) => {
      column.codes.forEach((code, index) => {
        const slot = slotByCode.get(code) ?? { code, label: code };
        const cy = rowYs[index];
        const x = column.x;
        const side = column.side;
        const equipped = equippedBySlot.get(code) ?? null;
        const q = equipped ? equipQualityColor(equipped.quality) : { r: 150, g: 138, b: 116 };
        // 引线:从格子内侧边指向身体,末端一颗小菱形
        const link = this.host.addChildPlainNode(parent, `LobbyHeroDetailArtEquipLink_${code}`, 0, 0, 10, 10);
        const lg = link.addComponent(Graphics);
        const fromX = x + (side === 'left' ? 1 : -1) * slotSize / 2;
        const toX = bodyX(side);
        lg.strokeColor = equipped ? rgba(q.r, q.g, q.b, 150) : rgba(150, 138, 116, 90);
        lg.lineWidth = Math.max(1, 1.4 * scale);
        lg.moveTo(fromX, cy);
        lg.lineTo(toX, cy);
        lg.stroke();
        lg.fillColor = equipped ? rgba(q.r, q.g, q.b, 220) : rgba(150, 138, 116, 140);
        const d = 4 * scale;
        lg.moveTo(toX, cy + d);
        lg.lineTo(toX + d, cy);
        lg.lineTo(toX, cy - d);
        lg.lineTo(toX - d, cy);
        lg.close();
        lg.fill();
        const cell = this.host.addChildPlainNode(parent, `LobbyHeroDetailArtEquip_${code}`, x, cy, slotSize, slotSize);
        const g = cell.addComponent(Graphics);
        if (equipped) {
          // 品质外晕
          g.strokeColor = rgba(q.r, q.g, q.b, 60);
          g.lineWidth = 10 * scale;
          traceOctagon(g, slotSize, -2 * scale);
          g.stroke();
        }
        g.fillColor = rgba(10, 9, 8, 225);
        traceOctagon(g, slotSize, 0);
        g.fill();
        g.fillColor = equipped ? rgba(Math.round(q.r * 0.22 + 14), Math.round(q.g * 0.22 + 14), Math.round(q.b * 0.22 + 14), 240) : rgba(22, 20, 18, 240);
        traceOctagon(g, slotSize, 4 * scale);
        g.fill();
        g.strokeColor = rgba(q.r, q.g, q.b, equipped ? 240 : 140);
        g.lineWidth = (equipped ? 3 : 2) * scale;
        traceOctagon(g, slotSize, 0);
        g.stroke();
        // 四角铆钉
        g.fillColor = equipped ? rgba(255, 224, 150, 230) : rgba(120, 108, 90, 200);
        const stud = slotSize / 2 - cut * 0.55;
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            g.circle(sx * stud, sy * stud, 2.4 * scale);
            g.fill();
          }
        }
        // 部位小签(左上):暗底圆角签收在框线以内,不再压在切角 / 铆钉上。
        const drawSlotTag = (): void => {
          const tagW = (phone ? 48 : 40) * scale;
          const tagH = (phone ? 24 : 20) * scale;
          const tagNode = this.host.addChildPlainNode(cell, 'ArtEquipSlotTagBg', -slotSize / 2 + 7 * scale + tagW / 2, slotSize / 2 - 7 * scale - tagH / 2, tagW, tagH);
          const tg = tagNode.addComponent(Graphics);
          tg.fillColor = rgba(8, 7, 7, 205);
          tg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, 6 * scale);
          tg.fill();
          tg.strokeColor = rgba(150, 124, 80, 130);
          tg.lineWidth = 1 * scale;
          tg.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, 6 * scale);
          tg.stroke();
          const tag = this.host.addChildLabel(tagNode, 'ArtEquipSlotTag', slot.label, 0, 0, 15 * scale, rgba(214, 196, 150), new Size(tagW - 6 * scale, tagH - 2 * scale));
          tag.overflow = Label.Overflow.SHRINK;
        };
        if (equipped) {
          this.attachEnhanceGlow(cell, slotSize, slotSize, scale, equipped.enhanceLevel ?? 0);
          cell.on(Node.EventType.MOUSE_ENTER, () => this.showEquipTooltip(parent, equipped, side === 'left' ? x - slotSize / 2 - 10 * scale : x + slotSize / 2 + 10 * scale, cy, side, scale), this);
          cell.on(Node.EventType.MOUSE_LEAVE, () => this.hideWearTooltip(), this);
          const artIcon = equipIconAssetByCode(equipped.equipCode);
          const artShown = artIcon ? this.host.addSprite('ArtEquipIcon', artIcon, 0, 4 * scale, slotSize * 0.8, slotSize * 0.8, cell) : null;
          if (!artShown) {
            this.drawEquipPartGlyph(cell, code, slotSize * 0.3, 4 * scale, rgba(q.r, q.g, q.b, 230), scale);
          }
          // 名字压底(品质色)
          const nameBand = this.host.addChildPlainNode(cell, 'ArtEquipNameBand', 0, -slotSize / 2 + 12 * scale, slotSize - 8 * scale, 20 * scale);
          const nb = nameBand.addComponent(Graphics);
          nb.fillColor = rgba(0, 0, 0, 170);
          nb.roundRect(-(slotSize - 8 * scale) / 2, -10 * scale, slotSize - 8 * scale, 20 * scale, 5 * scale);
          nb.fill();
          const name = this.host.addChildLabel(cell, 'ArtEquipName', safeText(equipped.equipName), 0, -slotSize / 2 + 12 * scale, 15 * scale, rgba(q.r, q.g, q.b, 255), new Size(slotSize - 12 * scale, 20 * scale));
          name.overflow = Label.Overflow.SHRINK;
          this.applyOutline(name, scale, true);
          // 强化 +N 角标(右上)
          const level = equipped.enhanceLevel ?? 0;
          if (level > 0) {
            const badgeW = 34 * scale;
            const badgeH = 18 * scale;
            const badge = this.host.addChildPlainNode(cell, 'ArtEquipEnhance', slotSize / 2 - badgeW / 2 - 4 * scale, slotSize / 2 - badgeH / 2 - 4 * scale, badgeW, badgeH);
            const bg = badge.addComponent(Graphics);
            bg.fillColor = level >= 15 ? rgba(200, 60, 40, 240) : level >= 10 ? rgba(120, 60, 180, 240) : rgba(40, 90, 160, 240);
            bg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 5 * scale);
            bg.fill();
            const badgeLabel = this.host.addChildLabel(badge, 'Text', `+${level}`, 0, 0, 15 * scale, rgba(255, 240, 210), new Size(badgeW, badgeH));
            this.applyOutline(badgeLabel, scale, false);
          }
          drawSlotTag();
        } else {
          // 空格(bt2-hero-refine):部位名收进左上暗底小签(与已穿格一致),底部只留一行"点击穿戴"——原先两行字在手机 20 号字下叠在一起。
          this.drawEquipPartGlyph(cell, code, slotSize * 0.25, 2 * scale, rgba(150, 138, 116, 210), scale);
          drawSlotTag();
          const hint = this.host.addChildLabel(cell, 'ArtEquipHint', '点击穿戴', 0, -slotSize / 2 + 15 * scale, 15 * scale, rgba(150, 196, 128, 230), new Size(slotSize - 14 * scale, 20 * scale));
          hint.overflow = Label.Overflow.SHRINK;
          this.applyOutline(hint, scale, false);
        }
        cell.addComponent(Button);
        cell.on(Button.EventType.CLICK, () => this.host.selectLobbyHeroEquipSlot(code), this);
        this.host.applyImageButtonFeedback(cell);
      });
    });
    // 一键穿戴 / 一键卸下:立绘顶部并排(底部被英雄名牌占着)。手机立绘顶是标题横幅,改放右栏标题行。
    if (phone) {
      return;
    }
    const btnW = Math.max(120 * scale, slotSize + 28 * scale);
    const btnH = 40 * scale;
    const btnY = Math.min(artY + artHeight / 2 - btnH / 2 - 6 * scale, rowYs[0] + slotSize / 2 + 26 * scale + btnH / 2);
    const pending = state.busy;
    const makeButton = (name: string, text: string, x: number, fill: { r: number; g: number; b: number }, onClick: () => void) => {
      const btn = this.host.addChildPlainNode(parent, name, x, btnY, btnW, btnH);
      const g = btn.addComponent(Graphics);
      g.fillColor = pending ? rgba(58, 52, 42, 215) : rgba(fill.r, fill.g, fill.b, 235);
      g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
      g.fill();
      g.strokeColor = rgba(222, 184, 104, 210);
      g.lineWidth = 2 * scale;
      g.stroke();
      const label = this.host.addChildLabel(btn, `${name}Label`, pending ? '处理中' : text, 0, 0, 19 * scale, rgba(250, 232, 184), new Size(btnW - 14 * scale, btnH - 8 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, true);
      if (!pending) {
        btn.addComponent(Button);
        btn.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(btn);
      }
    };
    makeButton('LobbyHeroDetailOneClickEquip', '一键穿戴', artX - btnW / 2 - 8 * scale, { r: 132, g: 88, b: 26 }, () => this.host.oneClickEquipLobbyHero(hero.id));
    makeButton('LobbyHeroDetailOneClickUnequip', '一键卸下', artX + btnW / 2 + 8 * scale, { r: 46, g: 68, b: 96 }, () => this.host.oneClickUnequipLobbyHero(hero.id));
  }

  /** 六个部位的线稿(空格占位 / 无真图兜底):头盔 / 胸甲 / 鞋子 / 武器 / 项链 / 戒指。r=半径尺度。 */
  private drawEquipPartGlyph(parent: Node, code: string, r: number, y: number, color: Color, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'ArtEquipGlyph', 0, y, r * 2, r * 2);
    const g = node.addComponent(Graphics);
    g.strokeColor = color;
    g.fillColor = new Color(color.r, color.g, color.b, Math.round(color.a * 0.25));
    g.lineWidth = Math.max(1.5, 2.4 * scale);
    switch (code) {
      case 'HELMET':
        g.moveTo(-r, -r * 0.2);
        g.lineTo(-r, r * 0.1);
        g.arc(0, r * 0.1, r, Math.PI, 0, true);
        g.lineTo(r, -r * 0.2);
        g.close();
        g.fill();
        g.stroke();
        g.moveTo(-r * 0.7, -r * 0.2);
        g.lineTo(r * 0.7, -r * 0.2);
        g.stroke();
        g.moveTo(0, r * 1.1);
        g.lineTo(0, r * 0.5);
        g.stroke();
        break;
      case 'CHEST':
        g.moveTo(-r, r * 0.9);
        g.lineTo(-r * 0.45, r * 0.6);
        g.lineTo(-r * 0.6, -r * 0.9);
        g.lineTo(r * 0.6, -r * 0.9);
        g.lineTo(r * 0.45, r * 0.6);
        g.lineTo(r, r * 0.9);
        g.lineTo(r * 0.8, r * 0.2);
        g.lineTo(-r * 0.8, r * 0.2);
        g.close();
        g.fill();
        g.stroke();
        g.moveTo(0, r * 0.6);
        g.lineTo(0, -r * 0.7);
        g.stroke();
        break;
      case 'BOOTS':
        g.moveTo(-r * 0.6, r);
        g.lineTo(r * 0.2, r);
        g.lineTo(r * 0.2, -r * 0.2);
        g.lineTo(r, -r * 0.6);
        g.lineTo(r, -r);
        g.lineTo(-r * 0.7, -r);
        g.close();
        g.fill();
        g.stroke();
        g.moveTo(-r * 0.6, r * 0.3);
        g.lineTo(r * 0.2, r * 0.3);
        g.stroke();
        break;
      case 'WEAPON':
        g.moveTo(0, r * 1.1);
        g.lineTo(r * 0.2, r * 0.8);
        g.lineTo(r * 0.2, -r * 0.2);
        g.lineTo(-r * 0.2, -r * 0.2);
        g.lineTo(-r * 0.2, r * 0.8);
        g.close();
        g.fill();
        g.stroke();
        g.moveTo(-r * 0.7, -r * 0.2);
        g.lineTo(r * 0.7, -r * 0.2);
        g.stroke();
        g.moveTo(0, -r * 0.2);
        g.lineTo(0, -r * 0.9);
        g.stroke();
        g.circle(0, -r, r * 0.16);
        g.fill();
        break;
      case 'NECKLACE':
        g.arc(0, r * 0.4, r * 0.85, Math.PI * 1.15, Math.PI * 1.85, true);
        g.stroke();
        g.moveTo(0, -r * 0.2);
        g.lineTo(r * 0.35, -r * 0.55);
        g.lineTo(0, -r);
        g.lineTo(-r * 0.35, -r * 0.55);
        g.close();
        g.fill();
        g.stroke();
        break;
      default:
        g.circle(0, -r * 0.15, r * 0.7);
        g.stroke();
        g.moveTo(0, r * 0.95);
        g.lineTo(r * 0.3, r * 0.6);
        g.lineTo(0, r * 0.3);
        g.lineTo(-r * 0.3, r * 0.6);
        g.close();
        g.fill();
        g.stroke();
        break;
    }
  }

  /**
   * 整页重绘前调用(2026-09-21 用户反馈"每点一次升级,中间的动画都会重新加载"):把立绘舞台从旧树上摘下来(不销毁),
   * 随后的 render() 里若英雄/尺寸没变就原样挂回——spine 不重建、动画不重播;变了就照常新建。
   */
  stashArtStage(): void {
    this.dropArtStageStash();
    const node = this.artStageNode;
    if (node && this.isNodeAlive(node) && node.parent) {
      node.removeFromParent();
      this.artStageStash = { node, key: this.artStageKey };
    }
    this.artStageNode = null;
  }

  private dropArtStageStash(): void {
    const stash = this.artStageStash;
    this.artStageStash = null;
    if (stash && this.isNodeAlive(stash.node)) {
      stash.node.destroy();
    }
  }

  private renderArtStage(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, scale: number): void {
    const key = `${hero.id}|${hero.heroCode}|${Math.round(width)}x${Math.round(height)}|${scale.toFixed(3)}`;
    const stash = this.artStageStash;
    if (stash && stash.key === key && this.isNodeAlive(stash.node)) {
      this.artStageStash = null;
      parent.addChild(stash.node);
      stash.node.setPosition(x, y, 0);
      this.artStageNode = stash.node;
      this.artStageKey = key;
      this.mountHeroCelebrationFx(parent, x, y, height);
      return;
    }
    this.dropArtStageStash();
    const stage = this.host.addChildPlainNode(parent, 'LobbyHeroDetailArtStage', x, y, width, height);
    this.artStageNode = stage;
    this.artStageKey = key;
    const graphics = stage.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 0);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    this.drawArtStageDepth(stage, width, height, scale);

    const fallbackPortrait = this.renderStaticHeroPortrait(stage, hero, width, height, scale);
    this.renderHeroSpinePreview(stage, hero, fallbackPortrait, width, height, scale);
    this.mountHeroCelebrationFx(parent, x, y, height);
  }

  /** 升星 / 觉醒 / 升级成功后的一次性庆祝特效(docs/29 v3):立绘舞台复用暂存节点时也要播,所以挂在舞台旁的独立节点上。 */
  private mountHeroCelebrationFx(parent: Node, x: number, y: number, height: number): void {
    const celebration = this.host.consumeLobbyHeroCelebration?.() ?? null;
    const celebrateSpec = celebration === 'levelUp' ? LOBBY_UI_FX.heroLevelUp : celebration ? LOBBY_UI_FX.heroStarUp : null;
    if (!celebrateSpec) {
      return;
    }
    const fxHolder = this.host.addChildPlainNode(parent, 'LobbyHeroDetailCelebrateFx', x, y - height * 0.08, 10, 10);
    mountLobbySpineFx(this.host, fxHolder, celebrateSpec, 0, 0, height * celebrateSpec.size, celebrateSpec.loop, celebrateSpec.holdMs);
  }

  private renderStaticHeroPortrait(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): Node {
    const portraitY = hero.protagonist ? this.resolveHeroDetailGroundY(height) + height * 0.45 : this.resolveHeroDetailGroundY(height) + height * 0.3;
    const portrait = this.host.addChildPlainNode(parent, 'LobbyHeroDetailDynamicPortrait', 0, portraitY, width * 0.86, height * 0.92);
    const loaded = hero.protagonist
      ? this.host.addSprite('LobbyHeroDetailDynamicPortraitSprite', LOBBY_HERO_DETAIL_PROTAGONIST_ASSET, 0, 0, width * 0.8, height * 0.9, portrait)
      : null;
    if (!loaded) {
      this.drawFallbackPortrait(portrait, hero, width * 0.56, height * 0.72, scale);
    }
    return portrait;
  }

  private renderHeroSpinePreview(parent: Node, hero: LobbyHeroItemVO, fallbackPortrait: Node, width: number, height: number, scale: number): void {
    const resourcePath = this.resolveHeroSpineResource(hero);
    if (!resourcePath) {
      if (!hero.protagonist) {
        console.warn(`[HeroDetail] hero spine asset missing: hero=${safeText(hero.heroCode)}, portrait=${safeText(hero.portraitAsset || '<empty>')}, spine=${safeText(hero.spineAsset || '<empty>')}`);
      }
      return;
    }
    const spineUuid = this.resolveHeroSpineUuid(hero);
    console.info(`[HeroDetail] hero spine load start: hero=${safeText(hero.heroCode)}, resource=${resourcePath}, uuid=${safeText(spineUuid || '<empty>')}`);
    this.lastHeroSpineFailureReason = '资源解析失败';
    const spineNode = this.host.addChildPlainNode(parent, 'LobbyHeroDetailSpineNode', 0, this.resolveHeroDetailGroundY(height), width, height);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    const audioSource = spineNode.addComponent(AudioSource);
    skeleton.premultipliedAlpha = false;
    skeleton.timeScale = 0.86;

    const showFailureHint = (): void => {
      if (this.isNodeAlive(spineNode)) {
        spineNode.destroy();
      }
      if (this.isNodeAlive(parent) && this.isNodeAlive(fallbackPortrait)) {
        this.renderHeroSpineFailureHint(parent, resourcePath, width, height, scale, this.lastHeroSpineFailureReason || '资源加载失败');
      }
    };

    const applyLoadedData = (data: sp.SkeletonData | null, onFailed: () => void): void => {
      if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
        return;
      }
      if (data) {
        this.applyHeroSpineDataWithRetry(skeleton, data, hero, width, height, scale, resourcePath, audioSource, (applied) => {
          if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
            return;
          }
          if (applied) {
            if (this.isNodeAlive(fallbackPortrait)) {
              fallbackPortrait.destroy();
            }
            return;
          }
          onFailed();
        });
        return;
      }
      onFailed();
    };

    const loadResourcePathFallback = (): void => {
      this.loadHeroSpineData(resourcePath, (data) => {
        applyLoadedData(data, showFailureHint);
      });
    };

    if (spineUuid) {
      this.loadHeroSpineUuidData(spineUuid, (uuidData) => {
        applyLoadedData(uuidData, () => {
          if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
            return;
          }
          console.warn(`[HeroDetail] hero spine uuid failed, fallback resource path: uuid=${spineUuid}, resource=${resourcePath}`);
          loadResourcePathFallback();
        });
      });
      return;
    }
    loadResourcePathFallback();
  }

  private retryHeroSpineUuidData(
    parent: Node,
    spineNode: Node,
    skeleton: sp.Skeleton,
    fallbackPortrait: Node,
    hero: LobbyHeroItemVO,
    width: number,
    height: number,
    scale: number,
    resourcePath: string,
    uuid: string,
    audioSource: AudioSource,
  ): void {
    console.warn(`[HeroDetail] hero spine resource data failed to apply, retry uuid: ${uuid}, resource=${resourcePath}`);
    this.loadHeroSpineUuidData(uuid, (uuidData) => {
      if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
        return;
      }
      if (!uuidData) {
        if (this.isNodeAlive(spineNode)) {
          spineNode.destroy();
        }
        if (this.isNodeAlive(parent) && this.isNodeAlive(fallbackPortrait)) {
          this.renderHeroSpineFailureHint(parent, resourcePath, width, height, scale, this.lastHeroSpineFailureReason);
        }
        return;
      }
      this.applyHeroSpineDataWithRetry(skeleton, uuidData, hero, width, height, scale, resourcePath, audioSource, (applied) => {
        if (!this.isNodeAlive(parent) || !this.isNodeAlive(spineNode)) {
          return;
        }
        if (!applied) {
          if (this.isNodeAlive(spineNode)) {
            spineNode.destroy();
          }
          if (this.isNodeAlive(parent) && this.isNodeAlive(fallbackPortrait)) {
            this.renderHeroSpineFailureHint(parent, resourcePath, width, height, scale, this.lastHeroSpineFailureReason);
          }
          return;
        }
        if (this.isNodeAlive(fallbackPortrait)) {
          fallbackPortrait.destroy();
        }
      });
    });
  }

  private renderHeroSpineFailureHint(parent: Node, resourcePath: string, width: number, height: number, scale: number, reason = '资源解析失败'): void {
    const hint = this.host.addChildLabel(
      parent,
      'LobbyHeroDetailSpineFailureHint',
      `Spine ${reason}：${resourcePath}`,
      0,
      -height / 2 + 164 * scale, 15 * scale,
      rgba(231, 174, 104),
      new Size(width * 0.82, 28 * scale),
    );
    hint.overflow = Label.Overflow.SHRINK;
  }

  private resolveHeroSpineResource(hero: LobbyHeroItemVO): string | null {
    const asset = safeText(hero.spineAsset || '').trim();
    if (!asset || !/^[A-Za-z0-9_-]+$/.test(asset)) {
      return null;
    }
    return `spine/hero/${asset}/${asset}`;
  }

  private resolveHeroSpineUuid(hero: LobbyHeroItemVO): string | null {
    const uuid = safeText(hero.spineUuid || '').trim();
    return /^[0-9a-fA-F-]{36}$/.test(uuid) ? uuid : null;
  }

  private loadHeroSpineData(path: string, onLoaded: (data: sp.SkeletonData | null) => void): void {
    // 2026-08-04 复用重构:改走全局 SpineDataStore,与战斗/编队/大厅共享缓存。
    loadSharedSpineData(path, null, 'HeroDetail', onLoaded);
  }

  private loadHeroSpineUuidData(uuid: string, onLoaded: (data: sp.SkeletonData | null) => void): void {
    loadSharedSpineData(null, uuid, 'HeroDetail', onLoaded);
  }

  private resolveHeroSpinePremultipliedAlpha(data: sp.SkeletonData): boolean {
    const atlasText = safeText((data as unknown as { _atlasText?: string })._atlasText || '');
    return /(?:^|\n)\s*pma\s*:\s*true/i.test(atlasText);
  }

  private resolveHeroSpineVersion(data: sp.SkeletonData): string {
    return safeText((data as unknown as { _skeletonJson?: { skeleton?: { spine?: string } } })._skeletonJson?.skeleton?.spine || '');
  }

  private isSupportedHeroSpineVersion(version: string): boolean {
    return version.startsWith('3.8.') || version.startsWith('4.2.');
  }

  private applyHeroSpineDataWithRetry(
    skeleton: sp.Skeleton,
    data: sp.SkeletonData,
    hero: LobbyHeroItemVO,
    width: number,
    height: number,
    scale: number,
    resourcePath: string,
    audioSource: AudioSource,
    onDone: (applied: boolean) => void,
    attempt = 0,
  ): void {
    if (!this.isNodeAlive(skeleton.node)) {
      return;
    }
    if (this.applyHeroSpineData(skeleton, data, hero, width, height, scale, resourcePath, audioSource)) {
      onDone(true);
      return;
    }
    const retryDelay = HERO_DETAIL_SPINE_RUNTIME_RETRY_DELAYS_MS[attempt];
    if (retryDelay !== undefined && this.isRetryableHeroSpineFailure(this.lastHeroSpineFailureReason)) {
      console.warn(`[HeroDetail] hero spine runtime retry ${attempt + 1}/${HERO_DETAIL_SPINE_RUNTIME_RETRY_DELAYS_MS.length}: ${resourcePath}, reason=${this.lastHeroSpineFailureReason}`);
      setTimeout(() => {
        this.applyHeroSpineDataWithRetry(skeleton, data, hero, width, height, scale, resourcePath, audioSource, onDone, attempt + 1);
      }, retryDelay);
      return;
    }
    onDone(false);
  }

  private isRetryableHeroSpineFailure(reason: string): boolean {
    return reason.includes('运行时解析失败') || reason.includes('资源应用异常');
  }

  private applyHeroSpineData(
    skeleton: sp.Skeleton,
    data: sp.SkeletonData,
    hero: LobbyHeroItemVO,
    width: number,
    height: number,
    scale: number,
    resourcePath: string,
    audioSource: AudioSource,
  ): boolean {
    try {
      const spineVersion = this.resolveHeroSpineVersion(data);
      if (spineVersion && !this.isSupportedHeroSpineVersion(spineVersion)) {
        this.lastHeroSpineFailureReason = `Spine ${spineVersion} 不兼容，请导出 4.2.x 或 3.8.x`;
        console.warn(`[HeroDetail] hero spine unsupported version: ${resourcePath}, version=${spineVersion}`);
        return false;
      }
      const runtimeData = data.getRuntimeData(true) as HeroSpineRuntimeData | null;
      if (!runtimeData) {
        const textureCount = data.textures?.length ?? 0;
        const textureNames = (data.textureNames ?? []).join('|') || '<empty>';
        this.lastHeroSpineFailureReason = `运行时解析失败${spineVersion ? `，Spine ${spineVersion}` : ''}，textures=${textureCount}，atlas=${textureNames}`;
        console.warn(`[HeroDetail] hero spine runtime data missing: ${resourcePath}`);
        return false;
      }
      // 2026-08-04:改用共享 patch——两套实现写同一份 SkeletonData 的 getSkinsEnum/getAnimsEnum,
      // 详情页与战斗页互相覆盖枚举表;统一后幂等。
      patchBattleUnitSpineRuntimeEnums(data, runtimeData as unknown as BattleUnitSpineRuntimeData);
      skeleton.premultipliedAlpha = this.resolveHeroSpinePremultipliedAlpha(data);
      skeleton.skeletonData = data;
      const skinName = this.resolveHeroSpineSkinName(data, runtimeData);
      if (skinName && skinName !== 'default') {
        skeleton.setSkin(skinName);
        skeleton.setSlotsToSetupPose();
      }
      this.bindHeroSpineAudioEvents(skeleton, audioSource, resourcePath);
      const displayProfile = this.resolveHeroSpineDisplayProfile(hero);
      const animationNames = this.resolveHeroSpineAnimationNames(data, runtimeData, displayProfile);
      const spineScale = this.resolveHeroSpineScale(runtimeData.width, runtimeData.height, width, height, scale, displayProfile);
      skeleton.node.setScale(new Vec3(spineScale, spineScale, 1));
      skeleton.node.setPosition(new Vec3(width * (displayProfile.xRatio ?? 0), this.resolveHeroDetailGroundY(height) + height * (displayProfile.yRatio ?? 0), 0));
      const idleAnimation = animationNames.idle;
      const introAnimation = animationNames.intro;
      if (!idleAnimation && !introAnimation) {
        skeleton.setToSetupPose();
        this.logHeroSpineResolved(data, skinName, '<setup-pose>', hero, resourcePath);
        return true;
      }
      if (introAnimation && idleAnimation) {
        const introTrack = skeleton.setAnimation(0, introAnimation, false);
        if (introTrack) {
          skeleton.addAnimation(0, idleAnimation, true, 0);
          this.logHeroSpineResolved(data, skinName, `${introAnimation} -> ${idleAnimation}`, hero, resourcePath);
          return true;
        }
        console.warn(`[HeroDetail] hero spine intro animation failed, fallback to idle: ${resourcePath}/${introAnimation}`);
      }
      const loopAnimation = idleAnimation || introAnimation;
      if (!loopAnimation) {
        skeleton.setToSetupPose();
        this.logHeroSpineResolved(data, skinName, '<setup-pose>', hero, resourcePath);
        return true;
      }
      const track = skeleton.setAnimation(0, loopAnimation, true);
      if (!track) {
        this.lastHeroSpineFailureReason = `动画播放失败：${loopAnimation}`;
        console.warn(`[HeroDetail] hero spine animation play failed: ${resourcePath}/${loopAnimation}`);
        return false;
      }
      this.logHeroSpineResolved(data, skinName, loopAnimation, hero, resourcePath);
      return true;
    } catch (error) {
      this.lastHeroSpineFailureReason = `资源应用异常：${this.formatHeroSpineError(error)}`;
      console.warn(`[HeroDetail] hero spine apply failed: ${resourcePath}`, error);
      return false;
    }
  }

  private formatHeroSpineError(error: unknown): string {
    if (error instanceof Error) {
      const message = safeText(error.message || error.name || 'unknown');
      const stackLine = safeText(error.stack || '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.includes('cocos/spine') || line.includes('LobbyHeroDetailPanelRenderer'));
      return safeText(stackLine ? `${message} @ ${stackLine}` : message).slice(0, 140);
    }
    return safeText(String(error || 'unknown')).slice(0, 96);
  }

  private resolveHeroSpineScale(rawWidth: number | undefined, rawHeight: number | undefined, stageWidth: number, stageHeight: number, scale: number, displayProfile: HeroSpineDisplayProfile): number {
    const safeWidth = Math.max(1, rawWidth || 1);
    const safeHeight = Math.max(1, rawHeight || 1);
    const targetHeight = stageHeight * (displayProfile.targetHeightRatio ?? HERO_DETAIL_NUU_VISUAL_HEIGHT_RATIO);
    const maxWidth = stageWidth * (displayProfile.maxWidthRatio ?? HERO_DETAIL_SPINE_MAX_WIDTH_RATIO);
    const heightFit = targetHeight / safeHeight;
    const widthFit = maxWidth / safeWidth;
    const fit = Math.min(heightFit, widthFit) * (displayProfile.scaleMultiplier ?? 1);
    return clamp(fit, 0.18 * scale, (displayProfile.maxScale ?? HERO_DETAIL_SPINE_DEFAULT_MAX_SCALE) * scale);
  }

  private resolveHeroSpineSkinName(data: sp.SkeletonData, runtimeData: HeroSpineRuntimeData): string | null {
    const names = this.resolveHeroSpineSkinNames(data, runtimeData);
    return this.resolvePreferredSpineName(names, 'default', []) ?? names[0] ?? null;
  }

  private resolveHeroSpineAnimationNames(data: sp.SkeletonData, runtimeData: HeroSpineRuntimeData, displayProfile: HeroSpineDisplayProfile): { idle: string | null; intro: string | null } {
    const names = this.resolveHeroSpineAnimationNameList(data, runtimeData);
    const idle = this.resolvePreferredSpineName(
      names,
      displayProfile.loopAnimation ?? 'idle',
      displayProfile.loopFallbackHints ?? ['stand', 'loop', 'animation', 'daiji', 'wait', 'run', '待机'],
    );
    if (displayProfile.preferIdleFirst || displayProfile.skipIntro) {
      return { idle, intro: null };
    }
    const intro = this.resolvePreferredSpineName(
      names.filter((name) => name !== idle),
      displayProfile.introAnimation ?? 'intro',
      displayProfile.introFallbackHints ?? ['idle_intro', 'appear', 'enter', 'show', 'born', '入场'],
    );
    return { idle, intro };
  }

  private resolveHeroSpineDisplayProfile(hero: LobbyHeroItemVO): HeroSpineDisplayProfile {
    const asset = safeText(hero.spineAsset || hero.portraitAsset || '').trim();
    return HERO_DETAIL_SPINE_DISPLAY_PROFILES[asset] ?? {};
  }

  private resolveHeroSpineSkinNames(data: sp.SkeletonData, runtimeData: HeroSpineRuntimeData): string[] {
    const jsonNames = this.resolveHeroSpineJsonSkinNames(data);
    const runtimeNames = this.resolveHeroSpineRuntimeSkinNames(runtimeData);
    return Array.from(new Set([...jsonNames, ...runtimeNames].filter(Boolean)));
  }

  private resolveHeroSpineAnimationNameList(data: sp.SkeletonData, runtimeData: HeroSpineRuntimeData): string[] {
    const jsonNames = this.resolveHeroSpineJsonAnimationNames(data);
    const runtimeNames = this.resolveHeroSpineRuntimeAnimationNames(runtimeData);
    return Array.from(new Set([...jsonNames, ...runtimeNames].filter(Boolean)));
  }

  private resolveHeroSpineJsonSkinNames(data: sp.SkeletonData): string[] {
    const skins = (data as unknown as { _skeletonJson?: { skins?: unknown } })._skeletonJson?.skins;
    if (Array.isArray(skins)) {
      return skins.map((skin) => safeText((skin as { name?: string } | null)?.name || '')).filter(Boolean);
    }
    if (skins && typeof skins === 'object') {
      return Object.keys(skins);
    }
    return [];
  }

  private resolveHeroSpineJsonAnimationNames(data: sp.SkeletonData): string[] {
    const animations = (data as unknown as { _skeletonJson?: { animations?: unknown } })._skeletonJson?.animations;
    if (animations && typeof animations === 'object' && !Array.isArray(animations)) {
      return Object.keys(animations);
    }
    if (Array.isArray(animations)) {
      return animations.map((animation) => safeText((animation as { name?: string } | null)?.name || '')).filter(Boolean);
    }
    return [];
  }

  private resolveHeroSpineRuntimeSkinNames(runtimeData: HeroSpineRuntimeData): string[] {
    return (runtimeData.skins ?? []).map((skin) => safeText(skin?.name || '')).filter(Boolean);
  }

  private resolveHeroSpineRuntimeAnimationNames(runtimeData: HeroSpineRuntimeData): string[] {
    return (runtimeData.animations ?? []).map((animation) => safeText(animation?.name || '')).filter(Boolean);
  }

  private resolvePreferredSpineName(names: string[], preferred: string, fallbackHints: string[]): string | null {
    if (preferred && names.includes(preferred)) {
      return preferred;
    }
    const preferredLower = preferred.toLowerCase();
    if (preferredLower) {
      const loosePreferred = names.find((name) => name.toLowerCase().includes(preferredLower));
      if (loosePreferred) {
        return loosePreferred;
      }
    }
    for (const hint of fallbackHints) {
      const resolved = names.find((name) => name.toLowerCase().includes(hint.toLowerCase()));
      if (resolved) {
        return resolved;
      }
    }
    return names[0] ?? null;
  }

  private bindHeroSpineAudioEvents(skeleton: sp.Skeleton, audioSource: AudioSource, resourcePath: string): void {
    skeleton.setEventListener((_entry: sp.spine.TrackEntry, eventOrType: sp.spine.Event | number) => {
      if (!this.isNodeAlive(skeleton.node) || !this.isHeroSpineAudioSourceNodeValid(audioSource) || typeof eventOrType === 'number') {
        return;
      }
      this.playHeroSpineAudioEvent(audioSource, resourcePath, eventOrType);
    });
  }

  private playHeroSpineAudioEvent(audioSource: AudioSource, resourcePath: string, event: sp.spine.Event): void {
    if (!this.isHeroSpineAudioSourceNodeValid(audioSource)) {
      return;
    }
    const audioPath = safeText(event.data?.audioPath || event.stringValue || event.data?.name || '').trim();
    if (!audioPath) {
      return;
    }
    const candidates = this.resolveHeroSpineAudioResourceCandidates(resourcePath, audioPath);
    if (candidates.length === 0) {
      return;
    }
    const volume = clamp(Number(event.volume || event.data?.volume || 1), 0, 1);
    this.loadFirstHeroSpineAudioClip(candidates, (clip, resolvedPath) => {
      try {
        if (!this.isHeroSpineAudioSourceNodeValid(audioSource)) {
          return;
        }
        if (!clip) {
          const logKey = `${resourcePath}:${audioPath}`;
          if (!this.missingHeroSpineAudioLogs.has(logKey)) {
            this.missingHeroSpineAudioLogs.add(logKey);
            console.warn(`[HeroDetail] hero spine audio missing: event=${safeText(event.data?.name || audioPath)}, audioPath=${audioPath}, candidates=${candidates.join(', ')}`);
          }
          return;
        }
        audioSource.playOneShot(clip, volume);
        console.info(`[HeroDetail] hero spine audio played: event=${safeText(event.data?.name || audioPath)}, resource=${resolvedPath}, volume=${volume.toFixed(2)}`);
      } catch (error) {
        console.warn(`[HeroDetail] ignored stale spine audio event: ${this.formatHeroSpineError(error)}`);
      }
    });
  }

  private resolveHeroSpineAudioResourceCandidates(resourcePath: string, audioPath: string): string[] {
    const normalizedAudioPath = audioPath.replace(/\\/g, '/').replace(/\.(mp3|wav|ogg|m4a|aac)$/i, '').replace(/^\/+/, '').trim();
    if (!normalizedAudioPath || normalizedAudioPath.includes('..')) {
      return [];
    }
    const directory = resourcePath.split('/').slice(0, -1).join('/');
    const fileName = normalizedAudioPath.split('/').pop() || normalizedAudioPath;
    const candidates = [
      `${directory}/${normalizedAudioPath}`,
      `${directory}/audio/${fileName}`,
      `audio/spine/hero/${fileName}`,
    ];
    return Array.from(new Set(candidates.filter((candidate) => /^[A-Za-z0-9_./-]+$/.test(candidate))));
  }

  private loadFirstHeroSpineAudioClip(candidates: string[], onLoaded: (clip: AudioClip | null, resolvedPath: string) => void): void {
    const [current, ...rest] = candidates;
    if (!current) {
      onLoaded(null, '');
      return;
    }
    this.loadHeroSpineAudioClip(current, (clip) => {
      if (clip) {
        onLoaded(clip, current);
        return;
      }
      this.loadFirstHeroSpineAudioClip(rest, onLoaded);
    });
  }

  private loadHeroSpineAudioClip(path: string, onLoaded: (clip: AudioClip | null) => void): void {
    const cached = this.heroSpineAudioClips.get(path);
    if (cached) {
      onLoaded(cached);
      return;
    }
    const pending = this.heroSpineAudioLoadCallbacks.get(path);
    if (pending) {
      pending.push(onLoaded);
      return;
    }
    this.heroSpineAudioLoadCallbacks.set(path, [onLoaded]);
    resources.load(path, AudioClip, (error: Error | null, clip: AudioClip | null) => {
      const callbacks = this.heroSpineAudioLoadCallbacks.get(path) ?? [];
      this.heroSpineAudioLoadCallbacks['delete'](path);
      if (error || !clip) {
        callbacks.forEach((callback) => callback(null));
        return;
      }
      this.heroSpineAudioClips.set(path, clip);
      callbacks.forEach((callback) => callback(clip));
    });
  }

  private resolveSpineEnumName(enumMap: { [key: string]: number } | null, preferred: string, fallbackHints: string[]): string | null {
    if (!enumMap) {
      return null;
    }
    const names = Object.keys(enumMap).filter((name) => name !== '<None>' && typeof enumMap[name] === 'number');
    if (preferred && names.includes(preferred)) {
      return preferred;
    }
    const preferredLower = preferred.toLowerCase();
    if (preferredLower) {
      const loosePreferred = names.find((name) => name.toLowerCase().includes(preferredLower));
      if (loosePreferred) {
        return loosePreferred;
      }
    }
    for (const hint of fallbackHints) {
      const resolved = names.find((name) => name.toLowerCase().includes(hint.toLowerCase()));
      if (resolved) {
        return resolved;
      }
    }
    return names[0] ?? null;
  }

  private logHeroSpineResolved(data: sp.SkeletonData, skinName: string | null, animationName: string, hero: LobbyHeroItemVO, resourcePath: string): void {
    const runtimeData = data.getRuntimeData(true);
    const width = runtimeData?.width ?? 0;
    const height = runtimeData?.height ?? 0;
    console.info(`[HeroDetail] spine applied: hero=${safeText(hero.heroCode)}, resource=${resourcePath}, skin=${skinName ?? '<setup>'}, animation=${animationName}, size=${Math.round(width)}x${Math.round(height)}`);
  }

  /**
   * 右栏外框。桌面:hero_info_panel 细框图(栏比例接近原图)。手机(bt2-hero-refine):右栏近似方形,把 1029×1528 的一体框图横向拉开近一倍不合规,
   * 改程序画同款细框——暗铜外线 + 内细金线 + 四角小折角。
   */
  private drawInfoPanelFrame(panel: Node, name: string, width: number, height: number, scale: number): void {
    if (!this.phoneFrame) {
      this.host.addSprite(name, HERO_AI_INFO_PANEL_ASSET, 0, 0, width, height, panel);
      return;
    }
    const g = this.host.addChildPlainNode(panel, name, 0, 0, width, height).addComponent(Graphics);
    const hw = width / 2;
    const hh = height / 2;
    g.strokeColor = rgba(74, 60, 44, 240);
    g.lineWidth = 3 * scale;
    g.rect(-hw + 1.5 * scale, -hh + 1.5 * scale, width - 3 * scale, height - 3 * scale);
    g.stroke();
    const inset = 7 * scale;
    g.strokeColor = rgba(150, 118, 66, 110);
    g.lineWidth = 1 * scale;
    g.rect(-hw + inset, -hh + inset, width - inset * 2, height - inset * 2);
    g.stroke();
    g.strokeColor = rgba(206, 166, 96, 215);
    g.lineWidth = 2 * scale;
    const arm = 16 * scale;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx = sx * (hw - inset);
        const cy = sy * (hh - inset);
        g.moveTo(cx - sx * arm, cy);
        g.lineTo(cx, cy);
        g.lineTo(cx, cy - sy * arm);
      }
    }
    g.stroke();
  }

  private renderInfoPanel(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, scale: number): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyHeroDetailInfoPanel', x, y, width, height);
    const graphics = panel.addComponent(Graphics);
    graphics.fillColor = rgba(6, 6, 8, 198);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    this.drawInfoPanelFrame(panel, 'LobbyHeroDetailInfoPanelArt', width, height, scale);

    // 顶部徽章区(左图标/已拥有英雄/只读展示/星级)按参考图移除——名牌区已展示星级。
    // 区块标题:星徽 + 基础属性 + 右侧"属性详情"按钮(参考图2)。
    const phone = !!this.phoneFrame;
    const attrTitleY = height / 2 - (phone ? 29 : 40) * scale;
    this.addSectionTitle(panel, 'LobbyHeroDetailAttrSection', '基础属性', width, attrTitleY, scale);
    const detailBtnW = (phone ? 108 : 96) * scale;
    const detailBtnH = (phone ? 30 : 34) * scale;
    const detailBtn = this.host.addChildPlainNode(panel, 'LobbyHeroDetailAttrDetailBtn', width / 2 - 24 * scale - detailBtnW / 2, attrTitleY, detailBtnW, detailBtnH);
    if (!this.host.addSprite('LobbyHeroDetailAttrDetailBtnArt', HERO_AI_BTN_ATTR_DETAIL_ASSET, 0, 0, detailBtnW, detailBtnH, detailBtn)) {
      const bg = detailBtn.addComponent(Graphics);
      bg.fillColor = rgba(24, 20, 16, 230);
      bg.roundRect(-detailBtnW / 2, -detailBtnH / 2, detailBtnW, detailBtnH, 8 * scale);
      bg.fill();
      bg.strokeColor = rgba(190, 152, 84, 200);
      bg.lineWidth = 1.3 * scale;
      bg.stroke();
    }
    const detailLabel = this.host.addChildLabel(detailBtn, 'Label', '属性详情', 0, 0, 16 * scale, rgba(232, 210, 164), new Size(detailBtnW - 10 * scale, 20 * scale));
    detailLabel.overflow = Label.Overflow.SHRINK;
    detailBtn.addComponent(Button);
    detailBtn.on(Button.EventType.CLICK, () => this.showAttrDetailPopup(panel, hero, scale), this);
    this.host.applyImageButtonFeedback(detailBtn);
    this.renderAttributeGrid(panel, hero, width, height, scale);
    const skillTitleY = this.renderGrowthAndAffixes(panel, hero, width, height, scale);
    if (phone) {
      // 手机 720 高放不下整组技能(5 行),属性页只留大招摘要 + "全部技能"入口,完整列表在技能页签。
      this.renderPhoneSkillSummary(panel, hero, width, scale, skillTitleY);
    } else {
      this.renderSkillList(panel, hero, width, height, scale, skillTitleY, 152 * scale);
    }
    this.renderLevelUpDock(panel, hero, width, height, scale);
  }

  // 养成徽章(幸运/觉醒/大招)+ 词条彩色卡片区。位于属性网格与技能预览之间;
  // 词条卡按实际行数排布,技能预览紧跟其后(消除中段空白),同时为技能区保底高度防溢出。
  // 返回技能预览标题应放置的 Y(供 renderSkillList 接续排布)。
  private renderGrowthAndAffixes(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): number {
    // 养成行下移,和属性网格(底边≈height/2-228)留出呼吸距,不再贴边重叠。
    // 手机:属性网格整体上提(底边≈height/2-160),养成行跟着上提,省出的高度给大招摘要。
    const phone = !!this.phoneFrame;
    const growthY = height / 2 - (phone ? 175 : 196) * scale;
    const sideInset = 24 * scale;
    const chips = resolveGrowthChips(hero);
    const chipGap = 10 * scale;
    const chipH = (phone ? 28 : 26) * scale;
    const chipW = (width - sideInset * 2 - chipGap * (chips.length - 1)) / chips.length;
    chips.forEach((chip, index) => {
      const cx = -width / 2 + sideInset + chipW / 2 + index * (chipW + chipGap);
      // 2026-09-25 用户拍板:属性页的"觉醒"只做提示(与左右标签同尺寸 + 金边 + 红点),点了跳升星页签;操作放升星页。
      const awakenable = chip.label === '觉醒' && this.isHeroAwakenable(hero);
      const node = this.host.addChildPlainNode(parent, `LobbyHeroDetailGrowthChip_${index}`, cx, growthY, chipW, chipH);
      const g = node.addComponent(Graphics);
      g.fillColor = awakenable ? rgba(64, 30, 18, 235) : rgba(18, 15, 12, 200);
      g.roundRect(-chipW / 2, -chipH / 2, chipW, chipH, chipH / 2);
      g.fill();
      g.strokeColor = awakenable ? rgba(244, 196, 96, 235) : rgba(136, 104, 58, 150);
      g.lineWidth = (awakenable ? 2 : 1.5) * scale;
      g.stroke();
      const label = this.host.addChildLabel(node, 'LobbyHeroDetailGrowthChipText', awakenable ? '觉醒  可觉醒' : `${chip.label}  ${chip.value}`, 0, 0, 15 * scale, awakenable ? rgba(250, 226, 160) : rgba(226, 206, 158), new Size(chipW - 16 * scale, chipH - 6 * scale), HorizontalTextAlignment.CENTER);
      label.overflow = Label.Overflow.SHRINK;
      if (awakenable) {
        this.drawRedDot(node, 'LobbyHeroDetailGrowthChipDot', chipW / 2 - 6 * scale, chipH / 2 - 2 * scale, scale);
        node.addComponent(Button);
        this.applyPointerCursor(node);
        node.on(Button.EventType.CLICK, () => {
          if (this.compactLayout) {
            this.openAwakenDialog(hero);
          } else {
            this.host.selectLobbyHeroDetailTab('star');
          }
        }, this);
        this.host.applyImageButtonFeedback(node);
      }
    });
    // 词条标题 + 洗练入口(有词条才显示;弹窗内锁定/确认)。
    // 手机统一节奏(bt-hero-beautify):区块标题上方留 12、下方留 6。
    const affixTitleY = growthY - chipH / 2 - (phone ? 29 : 26) * scale;
    this.addSectionTitle(parent, 'LobbyHeroDetailAffixSection', '特性加成', width, affixTitleY, scale);
    if ((hero.affixes ?? []).length > 0) {
      const refineW = 76 * scale;
      const refineH = 26 * scale;
      const refineBtn = this.host.addChildPlainNode(parent, 'LobbyHeroDetailRefineEntry', width / 2 - sideInset - refineW / 2, affixTitleY, refineW, refineH);
      const g = refineBtn.addComponent(Graphics);
      g.fillColor = rgba(96, 34, 26, 220);
      g.roundRect(-refineW / 2, -refineH / 2, refineW, refineH, 6 * scale);
      g.fill();
      g.strokeColor = rgba(196, 132, 66, 200);
      g.lineWidth = 1.5 * scale;
      g.stroke();
      const label = this.host.addChildLabel(refineBtn, 'LobbyHeroDetailRefineEntryLabel', '洗练', 0, 0, 16 * scale, rgba(244, 214, 150), new Size(refineW - 12 * scale, refineH - 4 * scale));
      label.overflow = Label.Overflow.SHRINK;
      refineBtn.addComponent(Button);
      refineBtn.on(Button.EventType.CLICK, () => this.host.openLobbyHeroRefineDialog(), this);
      this.host.applyImageButtonFeedback(refineBtn);
    }
    const affixTop = affixTitleY - (phone ? 23 : 20) * scale;
    const panelBottomY = -height / 2 + 44 * scale;
    const affixes = (hero.affixes ?? []).slice(0, 6);
    if (affixes.length <= 0) {
      const empty = this.host.addChildLabel(parent, 'LobbyHeroDetailAffixEmpty', '暂无词条（洗练系统开放后可获得/重铸）', -width / 2 + sideInset, affixTop - 12 * scale, 15 * scale, rgba(150, 140, 120), new Size(width - sideInset * 2, 22 * scale), HorizontalTextAlignment.LEFT);
      empty.overflow = Label.Overflow.SHRINK;
      return affixTop - 44 * scale;
    }
    // 行高自适应:优先 30px,可用高度紧张(小面板)时压缩,并给技能预览保底 ~160px。
    // 手机:底部升级坞约 150 高 + 大招摘要约 104,词条行最高 34(20 号字)。
    const rows = Math.ceil(affixes.length / 2);
    const rowGap = 8 * scale;
    const skillReserve = (phone ? 104 : 160) * scale;
    const availableH = Math.max(60 * scale, affixTop - (phone ? -height / 2 + 150 * scale : panelBottomY) - skillReserve);
    const rowH = clamp((availableH - rowGap * (rows - 1)) / rows, 20 * scale, (phone ? 34 : 30) * scale);
    this.renderAffixCards(parent, affixes, width, scale, affixTop, rowH, rowGap);
    const usedH = rows * rowH + (rows - 1) * rowGap;
    return affixTop - usedH - (phone ? 29 : 28) * scale;
  }

  private renderAffixCards(parent: Node, affixes: LobbyHeroAffixVO[], width: number, scale: number, topY: number, rowH: number, rowGap: number): void {
    const cardWidth = (width - 60 * scale) / 2;
    affixes.forEach((affix, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const cx = -cardWidth / 2 - 6 * scale + col * (cardWidth + 12 * scale);
      const cy = topY - rowH / 2 - row * (rowH + rowGap);
      const card = this.host.addChildPlainNode(parent, `LobbyHeroDetailAffixCard_${index}`, cx, cy, cardWidth, rowH);
      const q = affixQualityColor(affix.quality);
      const g = card.addComponent(Graphics);
      g.fillColor = rgba(Math.round(q.r * 0.2 + 8), Math.round(q.g * 0.2 + 8), Math.round(q.b * 0.2 + 8), 214);
      g.roundRect(-cardWidth / 2, -rowH / 2, cardWidth, rowH, Math.min(7 * scale, rowH / 2));
      g.fill();
      g.strokeColor = rgba(q.r, q.g, q.b, 168);
      g.lineWidth = 2 * scale;
      g.stroke();
      // 品质竖条(左侧强调)。
      const bar = card.addComponent(Graphics);
      bar.fillColor = rgba(q.r, q.g, q.b, 235);
      bar.rect(-cardWidth / 2, -rowH / 2, 5 * scale, rowH);
      bar.fill();
      const shortLabel = HERO_AFFIX_SHORT_LABELS[affix.code] ?? safeText(affix.name || affix.code);
      const value = Math.round((affix.value ?? 0) * 10) / 10;
      // 词条名暗色、数值亮白(右对齐贴品质字母前),形成"名-值-品质"三段可扫读结构。
      // 手机字号被抬到 20:数值右缘左移、品质字母贴右边;名称框收窄到数值框左缘之前(窄屏 16:9 卡宽仅约 250,长词条名自动缩字不压数值)。
      const phone = !!this.phoneFrame;
      const valueW = cardWidth * (phone ? 0.3 : 0.34);
      const nameW = phone ? Math.max(40 * scale, cardWidth - 72 * scale - valueW) : cardWidth * 0.54;
      const name = this.host.addChildLabel(card, 'LobbyHeroDetailAffixName', shortLabel, -cardWidth / 2 + 14 * scale, 0, 15 * scale, rgba(198, 184, 150), new Size(nameW, rowH - 6 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      const valueLabel = this.host.addChildLabel(card, 'LobbyHeroDetailAffixValue', heroAffixValueText(affix.code, affix.value ?? 0), cardWidth / 2 - (phone ? 52 : 54) * scale, 0, 16 * scale, rgba(244, 232, 198), new Size(valueW, rowH - 6 * scale), HorizontalTextAlignment.RIGHT);
      valueLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(valueLabel, scale, false);
      const tag = this.host.addChildLabel(card, 'LobbyHeroDetailAffixQuality', safeText(affix.quality), cardWidth / 2 - (phone ? 10 : 22) * scale, 0, 16 * scale, rgba(q.r, q.g, q.b, 255), new Size((phone ? 38 : 34) * scale, rowH - 6 * scale), HorizontalTextAlignment.RIGHT);
      tag.overflow = Label.Overflow.SHRINK;
      this.applyOutline(tag, scale, true);
    });
  }

  private renderHeroBadges(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const sideInset = 24 * scale;
    const gap = 12 * scale;
    const topY = height / 2 - 34 * scale;
    const rarityWidth = Math.min(104 * scale, Math.max(76 * scale, width * 0.2));
    const formWidth = Math.min(188 * scale, Math.max(132 * scale, width - sideInset * 2 - rarityWidth - gap));
    // 品阶优先使用 C1812 纹章切图；切图未就绪时回退到文字徽章。
    const rarityKey = safeText(hero.rarity || 'R').toUpperCase();
    const crestAsset = HERO_C1812_GRADE_CREST_ASSETS[rarityKey];
    const crestHeight = 34 * scale;
    const crest = crestAsset
      ? this.host.addSprite('LobbyHeroDetailRarityCrest', crestAsset, -width / 2 + sideInset + (crestHeight * (95 / 48)) / 2, topY, crestHeight * (95 / 48), crestHeight, parent)
      : null;
    if (!crest) {
      this.addBadge(parent, 'LobbyHeroDetailRarity', rarityKey, -width / 2 + sideInset + rarityWidth / 2, topY, rarityWidth, 30 * scale, this.rarityColor(hero.rarity), scale);
    }
    this.renderStarRow(parent, hero, 0, height / 2 - 70 * scale, width - sideInset * 2, scale);
    const formText = hero.protagonist ? safeText(hero.formLabel || '攻击形态') : '已拥有英雄';
    this.addBadge(parent, 'LobbyHeroDetailForm', formText, width / 2 - sideInset - formWidth / 2, topY, formWidth, 30 * scale, rgba(172, 54, 42), scale);
    const source = this.host.addChildLabel(parent, 'LobbyHeroDetailSource', hero.protagonist ? '主角不进入抽卡池；防御/辅助形态后续由主线道具解锁。' : `${sourceLabel(hero.sourceType)} / 只读展示`, 0, height / 2 - 72 * scale, 17 * scale, rgba(191, 171, 121), new Size(width - 44 * scale, 28 * scale));
    source.node.setPosition(new Vec3(0, height / 2 - 104 * scale, 0));
    source.overflow = Label.Overflow.SHRINK;
  }


  // 装备弹窗:6 部位格(两行三列,品质配色;点击选中部位)+ 选中部位候选列表(穿戴/替换/卸下)。
  // 与洗练弹窗同一套局部刷新模式;穿卸即时生效,战力由服务器重算。
  private renderEquipDialog(parent: Node, hero: LobbyHeroItemVO, panelWidth: number, panelHeight: number, scale: number): void {
    const state = this.host.currentLobbyHeroEquipState();
    const dim = this.host.addChildPlainNode(parent, 'LobbyHeroEquipDim', 0, 0, panelWidth, panelHeight);
    this.equipDialogNode = dim;
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 168);
    dimGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const dialogWidth = Math.min(760 * scale, panelWidth - 60 * scale);
    const dialogHeight = Math.min(680 * scale, panelHeight - 50 * scale);
    const dialog = this.host.addChildBeveledPanelNode(dim, 'LobbyHeroEquipDialog', 0, 0, dialogWidth, dialogHeight, rgba(14, 11, 10, 246), rgba(150, 112, 58, 220), 12 * scale);

    const title = this.host.addChildLabel(dialog, 'LobbyHeroEquipTitle', `装备 · ${safeText(hero.heroName)}`, 0, dialogHeight / 2 - 30 * scale, 24 * scale, rgba(247, 218, 148), new Size(dialogWidth - 40 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);

    const items = state.items;
    const equippedBySlot = new Map<string, EquipmentItemVO>();
    items.forEach((item) => {
      if (item.heroId === hero.id) {
        equippedBySlot.set(item.slot, item);
      }
    });

    // 6 部位格:两行三列。
    const slotW = (dialogWidth - 56 * scale) / 3;
    const slotH = 74 * scale;
    const slotGap = 10 * scale;
    const slotsTop = dialogHeight / 2 - 58 * scale;
    HERO_EQUIP_SLOTS.forEach((slot, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const cx = -dialogWidth / 2 + 22 * scale + slotW / 2 + col * (slotW + slotGap);
      const cy = slotsTop - slotH / 2 - row * (slotH + slotGap);
      const selected = state.selectedSlot === slot.code;
      const equipped = equippedBySlot.get(slot.code) ?? null;
      const q = equipped ? equipQualityColor(equipped.quality) : { r: 96, g: 90, b: 80 };
      const cell = this.host.addChildPlainNode(dialog, `LobbyHeroEquipSlot_${slot.code}`, cx, cy, slotW, slotH);
      const g = cell.addComponent(Graphics);
      g.fillColor = selected ? rgba(58, 44, 16, 235) : rgba(20, 17, 15, 225);
      g.roundRect(-slotW / 2, -slotH / 2, slotW, slotH, 8 * scale);
      g.fill();
      g.strokeColor = selected ? rgba(242, 196, 96, 235) : rgba(q.r, q.g, q.b, equipped ? 200 : 120);
      g.lineWidth = (selected ? 2.5 : 1.5) * scale;
      g.stroke();
      const slotName = this.host.addChildLabel(cell, 'SlotName', slot.label, 0, 17 * scale, 18 * scale, rgba(196, 178, 140), new Size(slotW - 12 * scale, 22 * scale));
      slotName.overflow = Label.Overflow.SHRINK;
      const contentText = equipped ? `${safeText(equipped.equipName)}${(equipped.enhanceLevel ?? 0) > 0 ? ` +${equipped.enhanceLevel}` : ''}` : '未装备';
      const content = this.host.addChildLabel(cell, 'SlotContent', contentText, 0, -13 * scale, 18 * scale, equipped ? rgba(q.r, q.g, q.b, 255) : rgba(126, 118, 104, 255), new Size(slotW - 12 * scale, 22 * scale));
      content.overflow = Label.Overflow.SHRINK;
      if (equipped) {
        this.applyOutline(content, scale, false);
      }
      cell.addComponent(Button);
      cell.on(Button.EventType.CLICK, () => this.host.selectLobbyHeroEquipSlot(slot.code), this);
    });

    // 选中部位候选列表(该部位全部持有装备;穿在本英雄=可卸下,穿在他人=可转移,未穿=可穿戴)。
    const listTop = slotsTop - 2 * (slotH + slotGap) - 22 * scale;
    const listBottom = -dialogHeight / 2 + 66 * scale;
    const selectedSlot = state.selectedSlot;
    const candidates = selectedSlot ? items.filter((item) => item.slot === selectedSlot) : [];
    if (state.loading && items.length <= 0) {
      const loading = this.host.addChildLabel(dialog, 'LobbyHeroEquipLoading', '装备列表读取中…', 0, (listTop + listBottom) / 2, 19 * scale, rgba(170, 158, 132), new Size(dialogWidth - 44 * scale, 22 * scale));
      loading.overflow = Label.Overflow.SHRINK;
    } else if (candidates.length <= 0) {
      const empty = this.host.addChildLabel(dialog, 'LobbyHeroEquipEmpty', selectedSlot ? '该部位暂无可用装备' : '点击上方部位查看可用装备', 0, (listTop + listBottom) / 2, 19 * scale, rgba(150, 140, 120), new Size(dialogWidth - 44 * scale, 22 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    } else {
      this.renderWearEquipGrid(dialog, hero, candidates, state.busy, state.selectedEquipId, dialogWidth - 44 * scale, listTop, listBottom, scale, -dialogWidth / 2 - 10 * scale, dialogHeight / 2 - 70 * scale);
    }

    // 合成入口(左)+ 关闭(右)。
    const fuseW = 176 * scale;
    const fuseH = 48 * scale;
    const fuseBtn = this.host.addChildPlainNode(dialog, 'LobbyHeroEquipFuseEntry', -fuseW / 2 - 12 * scale, -dialogHeight / 2 + 36 * scale, fuseW, fuseH);
    const fg = fuseBtn.addComponent(Graphics);
    fg.fillColor = rgba(96, 58, 22, 235);
    fg.roundRect(-fuseW / 2, -fuseH / 2, fuseW, fuseH, 9 * scale);
    fg.fill();
    fg.strokeColor = rgba(222, 176, 96, 210);
    fg.lineWidth = 2 * scale;
    fg.stroke();
    const fuseLabel = this.host.addChildLabel(fuseBtn, 'LobbyHeroEquipFuseEntryLabel', '合成', 0, 0, 20 * scale, rgba(248, 224, 168), new Size(fuseW - 16 * scale, fuseH - 8 * scale));
    fuseLabel.overflow = Label.Overflow.SHRINK;
    fuseBtn.addComponent(Button);
    fuseBtn.on(Button.EventType.CLICK, () => this.host.openLobbyEquipFuseDialog(), this);
    this.host.applyImageButtonFeedback(fuseBtn);

    const closeW = 176 * scale;
    const closeH = 48 * scale;
    const close = this.host.addChildPlainNode(dialog, 'LobbyHeroEquipClose', closeW / 2 + 12 * scale, -dialogHeight / 2 + 36 * scale, closeW, closeH);
    const xg = close.addComponent(Graphics);
    xg.fillColor = rgba(28, 24, 22, 230);
    xg.roundRect(-closeW / 2, -closeH / 2, closeW, closeH, 9 * scale);
    xg.fill();
    xg.strokeColor = rgba(128, 108, 76, 190);
    xg.lineWidth = 1.5 * scale;
    xg.stroke();
    const closeLabel = this.host.addChildLabel(close, 'LobbyHeroEquipCloseLabel', '关闭', 0, 0, 20 * scale, rgba(214, 198, 168), new Size(closeW - 16 * scale, closeH - 8 * scale));
    closeLabel.overflow = Label.Overflow.SHRINK;
    close.addComponent(Button);
    close.on(Button.EventType.CLICK, () => this.host.closeLobbyHeroEquipDialog(), this);
    this.host.applyImageButtonFeedback(close);
  }


  // 合成弹窗(装备 2.0 P2):按(部位,稀有度)分组行——组名/持有数/成功率/产物档,行右合成按钮(≥3 可点);
  // 顶部概率石开关(+20%,上限 95%);材料自动取该组前 3 件未穿戴。红装不可合成。
  private renderEquipFuseDialog(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const state = this.host.currentLobbyHeroEquipState();
    const fuse = this.host.currentLobbyEquipFuseState();
    const dim = this.host.addChildPlainNode(parent, 'LobbyEquipFuseDim', 0, 0, panelWidth, panelHeight);
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 178);
    dimGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    // 分组:未穿戴装备按(slot,quality)聚合。
    const groups = new Map<string, { slot: string; quality: string; sample: EquipmentItemVO; count: number }>();
    state.items.forEach((item) => {
      if (item.heroId != null) {
        return;
      }
      const quality = (item.quality || '').toUpperCase();
      if (quality === 'RED') {
        return;
      }
      const key = `${item.slot}:${quality}`;
      const entry = groups.get(key) ?? { slot: item.slot, quality, sample: item, count: 0 };
      entry.count += 1;
      groups.set(key, entry);
    });
    const rows = [...Array.from(groups.values())].sort((a, b) =>
      EQUIP_QUALITY_ORDER.indexOf(a.quality) - EQUIP_QUALITY_ORDER.indexOf(b.quality) || a.slot.localeCompare(b.slot));

    const rowH = 58 * scale;
    const rowGap = 10 * scale;
    const visibleRows = Math.min(rows.length, 6);
    const dialogWidth = Math.min(700 * scale, panelWidth - 80 * scale);
    const dialogHeight = 236 * scale + Math.max(1, visibleRows) * (rowH + rowGap);
    const dialog = this.host.addChildBeveledPanelNode(dim, 'LobbyEquipFuseDialog', 0, 0, dialogWidth, dialogHeight, rgba(14, 11, 10, 248), rgba(150, 112, 58, 220), 12 * scale);

    const title = this.host.addChildLabel(dialog, 'LobbyEquipFuseTitle', '装备合成', 0, dialogHeight / 2 - 30 * scale, 24 * scale, rgba(247, 218, 148), new Size(dialogWidth - 40 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const hint = this.host.addChildLabel(dialog, 'LobbyEquipFuseHint', '同部位同稀有度 3 件合成上一稀有度 1 件;失败返还同档 1 件。', 0, dialogHeight / 2 - 60 * scale, 17 * scale, rgba(196, 178, 140), new Size(dialogWidth - 48 * scale, 22 * scale));
    hint.overflow = Label.Overflow.SHRINK;

    // 概率石开关行。
    const bag = this.host.currentLobbyBagState();
    const luckCount = bag.groups.flatMap((group) => group.items).find((item) => item.itemCode === 'FUSION_LUCK_STONE')?.itemCount ?? 0;
    const luckOn = fuse.useLuckStone;
    const luckW = dialogWidth - 48 * scale;
    const luckH = 40 * scale;
    const luckRow = this.host.addChildPlainNode(dialog, 'LobbyEquipFuseLuck', 0, dialogHeight / 2 - 94 * scale, luckW, luckH);
    const lg = luckRow.addComponent(Graphics);
    lg.fillColor = luckOn ? rgba(58, 44, 16, 235) : rgba(22, 20, 18, 225);
    lg.roundRect(-luckW / 2, -luckH / 2, luckW, luckH, 8 * scale);
    lg.fill();
    lg.strokeColor = luckOn ? rgba(242, 196, 96, 235) : rgba(120, 104, 84, 140);
    lg.lineWidth = (luckOn ? 2.4 : 1.5) * scale;
    lg.stroke();
    const luckLabel = this.host.addChildLabel(luckRow, 'LuckLabel', `${luckOn ? '☑' : '☐'} 使用合成概率石（成功率 +20%，上限 95%）· 持有 x${formatInteger(luckCount)}`, 0, 0, 18 * scale, luckOn ? rgba(248, 224, 160) : rgba(196, 182, 150), new Size(luckW - 20 * scale, luckH - 6 * scale));
    luckLabel.overflow = Label.Overflow.SHRINK;
    if (!state.busy) {
      luckRow.addComponent(Button);
      luckRow.on(Button.EventType.CLICK, () => this.host.toggleLobbyEquipFuseLuckStone(), this);
    }

    // 分组行。
    const listTop = dialogHeight / 2 - 128 * scale;
    if (rows.length <= 0) {
      const empty = this.host.addChildLabel(dialog, 'LobbyEquipFuseEmpty', '没有可合成的未穿戴装备。', 0, listTop - 40 * scale, 19 * scale, rgba(150, 140, 120), new Size(dialogWidth - 48 * scale, 24 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    }
    rows.slice(0, visibleRows).forEach((group, index) => {
      const cy = listTop - rowH / 2 - index * (rowH + rowGap);
      const q = equipQualityColor(group.quality);
      const rowW = dialogWidth - 48 * scale;
      const rowNode = this.host.addChildPlainNode(dialog, `LobbyEquipFuseRow_${group.slot}_${group.quality}`, 0, cy, rowW, rowH);
      const rg = rowNode.addComponent(Graphics);
      rg.fillColor = rgba(Math.round(q.r * 0.16 + 10), Math.round(q.g * 0.16 + 10), Math.round(q.b * 0.16 + 10), 222);
      rg.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 8 * scale);
      rg.fill();
      rg.strokeColor = rgba(q.r, q.g, q.b, 160);
      rg.lineWidth = 1.5 * scale;
      rg.stroke();
      const slotLabel = HERO_EQUIP_SLOTS.find((slot) => slot.code === group.slot)?.label ?? group.slot;
      const nextQuality = EQUIP_QUALITY_ORDER[EQUIP_QUALITY_ORDER.indexOf(group.quality) + 1] ?? '';
      const baseChance = EQUIP_FUSE_BASE_CHANCE[group.quality] ?? 0;
      const chance = Math.min(0.95, baseChance + (luckOn ? 0.2 : 0));
      const name = this.host.addChildLabel(rowNode, 'FuseRowName', `${slotLabel} · ${equipQualityLabel(group.quality)} ×${group.count}`, -rowW / 2 + 16 * scale, 12 * scale, 19 * scale, rgba(q.r, q.g, q.b, 255), new Size(rowW * 0.6, 22 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      this.applyOutline(name, scale, false);
      const info = this.host.addChildLabel(rowNode, 'FuseRowInfo', `→ ${equipQualityLabel(nextQuality)} · 成功率 ${Math.round(chance * 100)}% · 金币 ${formatInteger(EQUIP_FUSE_GOLD_COST[group.quality] ?? 0)}`, -rowW / 2 + 16 * scale, -13 * scale, 16 * scale, rgba(196, 182, 148), new Size(rowW * 0.6, 20 * scale), HorizontalTextAlignment.LEFT);
      info.overflow = Label.Overflow.SHRINK;
      // 分解入口:该组分解 1 件(挑强化等级最低件)。
      const decW = 96 * scale;
      const decBtn = this.host.addChildPlainNode(rowNode, 'FuseRowDecompose', rowW / 2 - 14 * scale - 108 * scale - 10 * scale - decW / 2, 0, decW, 40 * scale);
      const dg = decBtn.addComponent(Graphics);
      dg.fillColor = state.busy ? rgba(58, 52, 42, 210) : rgba(44, 62, 86, 232);
      dg.roundRect(-decW / 2, -20 * scale, decW, 40 * scale, 8 * scale);
      dg.fill();
      dg.strokeColor = rgba(150, 170, 200, 190);
      dg.lineWidth = 1.5 * scale;
      dg.stroke();
      const decLabel = this.host.addChildLabel(decBtn, 'FuseRowDecomposeLabel', '分解×1', 0, 0, 17 * scale, rgba(214, 226, 244), new Size(decW - 8 * scale, 32 * scale));
      decLabel.overflow = Label.Overflow.SHRINK;
      if (!state.busy) {
        decBtn.addComponent(Button);
        decBtn.on(Button.EventType.CLICK, () => this.host.decomposeLobbyEquipGroup(group.slot, group.quality), this);
        this.host.applyImageButtonFeedback(decBtn);
      }
      const canFuse = group.count >= 3 && !state.busy && !(luckOn && luckCount <= 0);
      const btnW = 108 * scale;
      const btnH = 40 * scale;
      const btn = this.host.addChildPlainNode(rowNode, 'FuseRowAction', rowW / 2 - 14 * scale - btnW / 2, 0, btnW, btnH);
      const bg = btn.addComponent(Graphics);
      bg.fillColor = canFuse ? rgba(122, 42, 30, 235) : rgba(58, 52, 42, 210);
      bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 8 * scale);
      bg.fill();
      bg.strokeColor = rgba(214, 152, 74, 210);
      bg.lineWidth = 1.5 * scale;
      bg.stroke();
      const btnLabel = this.host.addChildLabel(btn, 'FuseRowActionLabel', state.busy ? '处理中' : group.count >= 3 ? '合成' : '材料不足', 0, 0, 18 * scale, rgba(248, 226, 168), new Size(btnW - 10 * scale, btnH - 8 * scale));
      btnLabel.overflow = Label.Overflow.SHRINK;
      if (canFuse) {
        btn.addComponent(Button);
        btn.on(Button.EventType.CLICK, () => this.host.fuseLobbyEquipGroup(group.slot, group.quality), this);
        this.host.applyImageButtonFeedback(btn);
      }
    });

    // 返回按钮。
    const backW = 176 * scale;
    const backH = 46 * scale;
    const back = this.host.addChildPlainNode(dialog, 'LobbyEquipFuseBack', 0, -dialogHeight / 2 + 34 * scale, backW, backH);
    const backArt = this.host.addSprite('LobbyEquipFuseBackArt', C1812_BUTTON_RETURN_ASSET, 0, 0, backW, backH, back);
    if (!backArt) {
      const xg = back.addComponent(Graphics);
      xg.fillColor = rgba(28, 24, 22, 230);
      xg.roundRect(-backW / 2, -backH / 2, backW, backH, 9 * scale);
      xg.fill();
      xg.strokeColor = rgba(128, 108, 76, 190);
      xg.lineWidth = 1.5 * scale;
      xg.stroke();
    }
    const backLabel = this.host.addChildLabel(back, 'LobbyEquipFuseBackLabel', '返回', 0, 0, 20 * scale, rgba(214, 198, 168), new Size(backW - 16 * scale, backH - 8 * scale));
    backLabel.overflow = Label.Overflow.SHRINK;
    back.addComponent(Button);
    back.on(Button.EventType.CLICK, () => this.host.closeLobbyEquipFuseDialog(), this);
    this.host.applyImageButtonFeedback(back);
  }


  // Web 端悬浮小手:MOUSE_ENTER/LEAVE 切换页面 cursor(非浏览器环境自动跳过)。
  private applyPointerCursor(node: Node): void {
    const doc = (globalThis as { document?: { body?: { style?: { cursor: string } } } }).document;
    if (!doc || !doc.body || !doc.body.style) {
      return;
    }
    node.on(Node.EventType.MOUSE_ENTER, () => {
      doc.body!.style!.cursor = 'pointer';
    });
    node.on(Node.EventType.MOUSE_LEAVE, () => {
      doc.body!.style!.cursor = 'auto';
    });
  }

  // 强化档流光:+5 蓝 / +10 紫;呼吸描边 + 亮光点沿边框环绕流动(+10 双光点),与锻造工坊同款;+15 橙/+20 红留待上限开放。
  private attachEnhanceGlow(target: Node, width: number, height: number, scale: number, enhanceLevel: number): void {
    if (enhanceLevel < 5) {
      return;
    }
    // 序列帧流光已移除(会在资源加载间隙闪旧版特效):穿戴栏只用程序呼吸描边+环游光点。
    const color = enhanceLevel >= 20 ? { r: 240, g: 96, b: 80 }
      : enhanceLevel >= 15 ? { r: 240, g: 178, b: 84 }
        : enhanceLevel >= 10 ? { r: 186, g: 116, b: 240 } : { r: 96, g: 168, b: 244 };
    const glow = this.host.addChildPlainNode(target, 'EquipEnhanceGlow', 0, 0, width, height);
    const g = glow.addComponent(Graphics);
    g.strokeColor = rgba(color.r, color.g, color.b, 235);
    g.lineWidth = 2.6 * scale;
    g.roundRect(-width / 2 - 2 * scale, -height / 2 - 2 * scale, width + 4 * scale, height + 4 * scale, 10 * scale);
    g.stroke();
    const opacity = glow.addComponent(UIOpacity);
    opacity.opacity = 220;
    tween(opacity)
      .repeatForever(
        tween(opacity)
          .to(0.8, { opacity: 110 })
          .to(0.8, { opacity: 220 }),
      )
      .start();
    const cometCount = enhanceLevel >= 10 ? 2 : 1;
    for (let index = 0; index < cometCount; index += 1) {
      this.attachGlowComet(glow, width + 4 * scale, height + 4 * scale, scale, color, index === 1);
    }
  }

  // 环游流光线(龙形):头粗尾细的锥形渐隐光带,沿边框匀速环游,逐帧重绘 Graphics 拟合;
  // offsetHalf=从对角起步(双龙追逐)。18 段折线近似,尾长约占周长 16%,30fps 驱动。
  private attachGlowComet(parent: Node, width: number, height: number, scale: number, color: { r: number; g: number; b: number }, offsetHalf: boolean): void {
    const hw = width / 2;
    const hh = height / 2;
    const perimeter = 2 * (width + height);
    // p∈[0,1) → 边框上的点(左上角起顺时针)。
    const pointAt = (p: number): { x: number; y: number } => {
      let d = (((p % 1) + 1) % 1) * perimeter;
      if (d < width) {
        return { x: -hw + d, y: hh };
      }
      d -= width;
      if (d < height) {
        return { x: hw, y: hh - d };
      }
      d -= height;
      if (d < width) {
        return { x: hw - d, y: -hh };
      }
      d -= width;
      return { x: -hw, y: -hh + d };
    };
    const node = this.host.addChildPlainNode(parent, offsetHalf ? 'GlowStreakB' : 'GlowStreakA', 0, 0, width, height);
    const g = node.addComponent(Graphics);
    const loopSeconds = 2.4;
    const tailFrac = 0.24;
    const segments = 18;
    const fps = 30;
    let head = offsetHalf ? 0.5 : 0;
    tween(node)
      .repeatForever(
        tween(node).delay(1 / fps).call(() => {
          if (!node.isValid) {
            return;
          }
          head = (head + 1 / (fps * loopSeconds)) % 1;
          g.clear();
          // 尾→头绘制,头部段叠在最上;线宽 5.2→0.8 锥形收细,透明度同步衰减。
          for (let seg = segments - 1; seg >= 0; seg -= 1) {
            const t0 = seg / segments;
            const t1 = (seg + 1) / segments;
            const p0 = pointAt(head - t0 * tailFrac);
            const p1 = pointAt(head - t1 * tailFrac);
            g.strokeColor = rgba(color.r, color.g, color.b, Math.round(225 * (1 - t0) + 20));
            g.lineWidth = Math.max(1.2, 9 - 7.6 * t0) * scale;
            g.moveTo(p0.x, p0.y);
            g.lineTo(p1.x, p1.y);
            g.stroke();
          }
          // 白芯头段:短亮线压顶,读作龙头。
          const headPoint = pointAt(head);
          const neckPoint = pointAt(head - tailFrac * 0.12);
          g.strokeColor = rgba(255, 255, 255, 230);
          g.lineWidth = 3.4 * scale;
          g.moveTo(headPoint.x, headPoint.y);
          g.lineTo(neckPoint.x, neckPoint.y);
          g.stroke();
        }),
      )
      .start();
  }

  // 强化弹窗:装备信息(+N/属性×系数)/下一级预览/消耗/成功率/祝福石·护符开关/强化按钮。
  private renderEquipEnhanceDialog(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const state = this.host.currentLobbyHeroEquipState();
    const enhance = this.host.currentLobbyEquipEnhanceState();
    const item = state.items.find((entry) => entry.id === enhance.targetId);
    if (!item) {
      return;
    }
    const dim = this.host.addChildPlainNode(parent, 'LobbyEquipEnhanceDim', 0, 0, panelWidth, panelHeight);
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 185);
    dimGraphics.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    const dialogWidth = Math.min(620 * scale, panelWidth - 90 * scale);
    const dialogHeight = 480 * scale;
    const dialog = this.host.addChildBeveledPanelNode(dim, 'LobbyEquipEnhanceDialog', 0, 0, dialogWidth, dialogHeight, rgba(14, 11, 10, 248), rgba(150, 112, 58, 220), 12 * scale);

    const level = item.enhanceLevel ?? 0;
    const q = equipQualityColor(item.quality);
    const title = this.host.addChildLabel(dialog, 'EnhTitle', `强化 · ${safeText(item.equipName)}${level > 0 ? ` +${level}` : ''}`, 0, dialogHeight / 2 - 32 * scale, 24 * scale, rgba(q.r, q.g, q.b, 255), new Size(dialogWidth - 40 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);

    // 强化规则与锻造工坊/服务器同步:上限 +20,+10 以上耗高阶强化石×(等级-9)。
    const maxed = level >= 20;
    const usesHighStone = level >= 10;
    const factorNow = 1 + 0.1 * level;
    const factorNext = 1 + 0.1 * (level + 1);
    const statText = describeEquipAttrs(item);
    const nowLine = this.host.addChildLabel(dialog, 'EnhNow', `当前:${statText} ×${factorNow.toFixed(1)}`, 0, dialogHeight / 2 - 72 * scale, 18 * scale, rgba(206, 192, 158), new Size(dialogWidth - 48 * scale, 22 * scale));
    nowLine.overflow = Label.Overflow.SHRINK;
    const nextLine = this.host.addChildLabel(dialog, 'EnhNext', maxed ? '已达强化上限 +20' : `强化后:属性 ×${factorNext.toFixed(1)}（+${level + 1}）`, 0, dialogHeight / 2 - 100 * scale, 18 * scale, rgba(150, 216, 150), new Size(dialogWidth - 48 * scale, 22 * scale));
    nextLine.overflow = Label.Overflow.SHRINK;

    const stoneCost = usesHighStone ? level - 9 : level + 1;
    const goldCost = 100 * Math.pow(2, Math.floor(level / 3));
    const baseChance = [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1][Math.min(level, 19)] ?? 0.1;
    const chance = Math.min(1, baseChance + (enhance.useBless ? 0.2 : 0));
    const bag = this.host.currentLobbyBagState();
    const bagCount = (code: string) => bag.groups.flatMap((group) => group.items).find((entry) => entry.itemCode === code)?.itemCount ?? 0;
    const costLine = this.host.addChildLabel(dialog, 'EnhCost', maxed ? '' : `消耗:${usesHighStone ? '高阶强化石' : '强化石'} ×${stoneCost}（持有 ${formatInteger(bagCount(usesHighStone ? 'ENHANCE_STONE_HIGH' : 'ENHANCE_STONE'))}）· 金币 ${formatInteger(goldCost)}`, 0, dialogHeight / 2 - 132 * scale, 18 * scale, rgba(238, 208, 144), new Size(dialogWidth - 48 * scale, 22 * scale));
    costLine.overflow = Label.Overflow.SHRINK;
    const chanceLine = this.host.addChildLabel(dialog, 'EnhChance', maxed ? '' : `成功率 ${Math.round(chance * 100)}%${level >= 5 ? '（失败将降 1 级,可用护符抵消）' : '（失败不降级）'}`, 0, dialogHeight / 2 - 160 * scale, 18 * scale, level >= 5 ? rgba(230, 150, 110) : rgba(196, 182, 148), new Size(dialogWidth - 48 * scale, 22 * scale));
    chanceLine.overflow = Label.Overflow.SHRINK;

    // 祝福石/护符开关行。
    const toggleW = dialogWidth - 48 * scale;
    const toggleH = 38 * scale;
    const makeToggle = (name: string, y: number, on: boolean, text: string, onClick: () => void) => {
      const row = this.host.addChildPlainNode(dialog, name, 0, y, toggleW, toggleH);
      const tg = row.addComponent(Graphics);
      tg.fillColor = on ? rgba(58, 44, 16, 235) : rgba(22, 20, 18, 225);
      tg.roundRect(-toggleW / 2, -toggleH / 2, toggleW, toggleH, 8 * scale);
      tg.fill();
      tg.strokeColor = on ? rgba(242, 196, 96, 235) : rgba(120, 104, 84, 140);
      tg.lineWidth = (on ? 2.2 : 1.4) * scale;
      tg.stroke();
      const label = this.host.addChildLabel(row, `${name}Label`, `${on ? '☑' : '☐'} ${text}`, 0, 0, 17 * scale, on ? rgba(248, 224, 160) : rgba(196, 182, 150), new Size(toggleW - 18 * scale, toggleH - 6 * scale));
      label.overflow = Label.Overflow.SHRINK;
      if (!state.busy && !maxed) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, onClick, this);
      }
    };
    makeToggle('EnhBless', dialogHeight / 2 - 200 * scale, enhance.useBless, `强化祝福石（成功率 +20%）· 持有 x${formatInteger(bagCount('ENHANCE_BLESS_STONE'))}`, () => this.host.toggleLobbyEquipEnhanceBless());
    makeToggle('EnhGuard', dialogHeight / 2 - 244 * scale, enhance.useGuard, `强化护符（失败不降级）· 持有 x${formatInteger(bagCount('ENHANCE_GUARD_RUNE'))}`, () => this.host.toggleLobbyEquipEnhanceGuard());

    // 强化 / 关闭按钮。
    const btnW = 176 * scale;
    const btnH = 50 * scale;
    const btnY = -dialogHeight / 2 + 40 * scale;
    const canEnhance = !state.busy && !maxed;
    const confirm = this.host.addChildPlainNode(dialog, 'EnhConfirm', -btnW / 2 - 12 * scale, btnY, btnW, btnH);
    const cg = confirm.addComponent(Graphics);
    cg.fillColor = canEnhance ? rgba(122, 42, 30, 235) : rgba(58, 52, 42, 210);
    cg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 9 * scale);
    cg.fill();
    cg.strokeColor = rgba(214, 152, 74, 220);
    cg.lineWidth = 2 * scale;
    cg.stroke();
    const confirmLabel = this.host.addChildLabel(confirm, 'EnhConfirmLabel', state.busy ? '强化中…' : maxed ? '已满级' : '强化', 0, 0, 21 * scale, rgba(250, 228, 172), new Size(btnW - 16 * scale, btnH - 10 * scale));
    confirmLabel.overflow = Label.Overflow.SHRINK;
    if (canEnhance) {
      confirm.addComponent(Button);
      confirm.on(Button.EventType.CLICK, () => this.host.enhanceLobbyEquipment(item.id), this);
      this.host.applyImageButtonFeedback(confirm);
    }
    const cancel = this.host.addChildPlainNode(dialog, 'EnhClose', btnW / 2 + 12 * scale, btnY, btnW, btnH);
    const xg = cancel.addComponent(Graphics);
    xg.fillColor = rgba(28, 24, 22, 230);
    xg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 9 * scale);
    xg.fill();
    xg.strokeColor = rgba(128, 108, 76, 190);
    xg.lineWidth = 1.5 * scale;
    xg.stroke();
    const cancelLabel = this.host.addChildLabel(cancel, 'EnhCloseLabel', '关闭', 0, 0, 21 * scale, rgba(212, 196, 166), new Size(btnW - 16 * scale, btnH - 10 * scale));
    cancelLabel.overflow = Label.Overflow.SHRINK;
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, () => this.host.closeLobbyEquipEnhanceDialog(), this);
    this.host.applyImageButtonFeedback(cancel);
  }

  /** 可觉醒:未觉醒且满 10 星(hero_awaken_config 第 1 阶 min_star=10)。 */
  private isHeroAwakenable(hero: LobbyHeroItemVO): boolean {
    return (hero.awakenStatus ?? 0) <= 0 && Math.trunc(hero.star || 1) >= AWAKEN_COST.minStar;
  }

  /** 红点(有可操作的养成):红芯 + 浅金描边。 */
  private drawRedDot(parent: Node, name: string, x: number, y: number, scale: number): void {
    const dot = this.host.addChildPlainNode(parent, name, x, y, 16 * scale, 16 * scale);
    const g = dot.addComponent(Graphics);
    g.fillColor = rgba(230, 52, 40, 255);
    g.circle(0, 0, 6.5 * scale);
    g.fill();
    g.strokeColor = rgba(255, 226, 180, 240);
    g.lineWidth = 1.5 * scale;
    g.stroke();
  }

  /**
   * 升星页的"觉醒"卡(2026-09-25 用户拍板:操作放升星页):星级行之下、升星解锁列表之上。
   * 三态:未满 10★ = 灰色锁定并写明条件;满 10★ 未觉醒 = 金边点亮 + 右侧红金"觉醒"按钮(开确认弹窗);已觉醒 = 绿字"已觉醒"。
   * 返回卡片高度(含下间距),供下方列表顺延。
   */
  private renderStarAwakenCard(panel: Node, hero: LobbyHeroItemVO, width: number, topY: number, scale: number): number {
    const star = Math.trunc(hero.star || 1);
    const awakened = (hero.awakenStatus ?? 0) > 0;
    const ready = !awakened && star >= AWAKEN_COST.minStar;
    const rowW = width - 44 * scale;
    const rowH = (this.phoneFrame ? 60 : 66) * scale;
    const cy = topY - rowH / 2;
    const card = this.host.addChildPlainNode(panel, 'StarAwakenCard', 0, cy, rowW, rowH);
    const g = card.addComponent(Graphics);
    g.fillColor = ready ? rgba(64, 30, 18, 238) : awakened ? rgba(28, 36, 22, 225) : rgba(18, 16, 14, 220);
    g.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 7 * scale);
    g.fill();
    g.strokeColor = ready ? rgba(244, 196, 96, 240) : awakened ? rgba(120, 190, 120, 180) : rgba(96, 84, 64, 140);
    g.lineWidth = (ready ? 2 : 1.3) * scale;
    g.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 7 * scale);
    g.stroke();
    // bt2-hero-refine:与下方「升星解锁」行同一套骨架——左圆槽(未达 = 挂锁,可觉醒 / 已觉醒 = 星徽)+ 右上状态胶囊。
    const phone = !!this.phoneFrame;
    const iconX = -rowW / 2 + 32 * scale;
    const iconSize = (phone ? 28 : 32) * scale;
    const slotR = iconSize * 0.62 + 3 * scale;
    const slotG = this.host.addChildPlainNode(card, 'IconSlot', iconX, 0, slotR * 2, slotR * 2).addComponent(Graphics);
    slotG.fillColor = rgba(7, 7, 8, 215);
    slotG.circle(0, 0, slotR);
    slotG.fill();
    slotG.strokeColor = ready ? rgba(244, 196, 96, 220) : awakened ? rgba(124, 204, 124, 190) : rgba(110, 96, 70, 150);
    slotG.lineWidth = 1.2 * scale;
    slotG.circle(0, 0, slotR);
    slotG.stroke();
    if (ready || awakened || !renderLockGlyph(this.host, card, 'Lock', iconX, 0, iconSize * 0.86, true)) {
      const emblemH = slotR * 1.5;
      this.host.addSprite('Emblem', HERO_AI_SECTION_STAR_ASSET, iconX, 0, emblemH * (232 / 244), emblemH, card);
    }
    const pillW = (phone ? 98 : 84) * scale;
    const pillH = (phone ? 26 : 22) * scale;
    const textLeft = -rowW / 2 + 64 * scale;
    const rightW = ready ? 150 * scale : pillW + 20 * scale;
    const textW = rowW / 2 - rightW - textLeft;
    const nameText = awakened ? '觉醒 · 已觉醒' : ready ? '觉醒 · 可觉醒！' : `觉醒 · 满 ${AWAKEN_COST.minStar}★ 可觉醒`;
    const nameLabel = this.host.addChildLabel(card, 'Name', nameText, textLeft, (this.phoneFrame ? 14 : 15) * scale, 17 * scale, ready ? rgba(250, 226, 160) : awakened ? rgba(220, 236, 200) : rgba(170, 158, 134), new Size(textW, 22 * scale), HorizontalTextAlignment.LEFT);
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(nameLabel, scale, ready);
    const descText = awakened
      ? `大招等级上限 Lv.${ultimateCap(true)} · 属性已增强`
      : this.phoneFrame
        ? `大招上限 Lv.${ultimateCap(false)} → Lv.${ultimateCap(true)} · 属性增强`
        : `大招上限 Lv.${ultimateCap(false)} → Lv.${ultimateCap(true)} · 属性增强 · 消耗碎片与金币等`;
    const descLabel = this.host.addChildLabel(card, 'Desc', descText, textLeft, (this.phoneFrame ? -14 : -12) * scale, 15 * scale, ready ? rgba(226, 206, 166) : awakened ? rgba(196, 210, 180) : rgba(140, 130, 112), new Size(textW, 20 * scale), HorizontalTextAlignment.LEFT);
    descLabel.overflow = Label.Overflow.SHRINK;
    if (ready) {
      const btnW = 136 * scale;
      const btnH = btnW * (100 / 431);
      const btn = this.host.addChildPlainNode(card, 'StarAwakenButton', rowW / 2 - 14 * scale - btnW / 2, 0, btnW, btnH);
      if (!this.host.addSprite('StarAwakenButtonArt', 'ui/hero/ai/btn_star_up/spriteFrame', 0, 0, btnW, btnH, btn)) {
        const bg = btn.addComponent(Graphics);
        bg.fillColor = rgba(128, 36, 26, 245);
        bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
        bg.fill();
        bg.strokeColor = rgba(248, 204, 110, 240);
        bg.lineWidth = 2 * scale;
        bg.stroke();
      }
      const btnLabel = this.host.addChildLabel(btn, 'Label', '觉 醒', 0, 1 * scale, 19 * scale, rgba(255, 238, 190), new Size(btnW - 30 * scale, btnH - 6 * scale));
      btnLabel.isBold = true;
      btnLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(btnLabel, scale, true);
      this.drawRedDot(btn, 'StarAwakenButtonDot', btnW / 2 - 8 * scale, btnH / 2 - 4 * scale, scale);
      btn.addComponent(Button);
      this.applyPointerCursor(btn);
      btn.on(Button.EventType.CLICK, () => this.openAwakenDialog(hero), this);
      this.host.applyImageButtonFeedback(btn, 1.05, 0.95);
    } else {
      const pill = this.host.addChildPlainNode(card, 'StatePill', rowW / 2 - 10 * scale - pillW / 2, (phone ? 13 : 15) * scale, pillW, pillH);
      const pillG = pill.addComponent(Graphics);
      pillG.fillColor = awakened ? rgba(26, 58, 30, 235) : rgba(30, 26, 22, 235);
      pillG.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pillG.fill();
      pillG.strokeColor = awakened ? rgba(124, 204, 124, 210) : rgba(140, 118, 82, 170);
      pillG.lineWidth = 1.2 * scale;
      pillG.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pillG.stroke();
      const stateLabel = this.host.addChildLabel(pill, 'State', awakened ? '已觉醒' : `★${AWAKEN_COST.minStar} 解锁`, 0, 0, 15 * scale, awakened ? rgba(156, 232, 150) : rgba(198, 176, 132), new Size(pillW - 12 * scale, pillH - 2 * scale));
      stateLabel.overflow = Label.Overflow.SHRINK;
    }
    return rowH + 10 * scale;
  }

  private openAwakenDialog(hero: LobbyHeroItemVO): void {
    this.awakenConfirmHeroId = hero.id;
    const ctx = this.detailRenderContext;
    if (ctx && this.isNodeAlive(ctx.panelGroup)) {
      this.renderAwakenDialog(ctx.panelGroup, hero, ctx.panelWidth, ctx.panelHeight, ctx.scale);
    }
  }

  private closeAwakenDialog(): void {
    this.awakenConfirmHeroId = null;
    if (this.awakenDialogNode && this.isNodeAlive(this.awakenDialogNode)) {
      this.awakenDialogNode.destroy();
    }
    this.awakenDialogNode = null;
  }

  /**
   * 觉醒确认弹窗(2026-09-25 美化,现有素材):洗练同款 refine_panel_bg 底板 + 标题饰线 + 右上金 X;
   * 四格材料卡(背包格底图 + 物品图标 + 需求/持有,不足红字)+ 觉醒效果区 + 主/次按钮;材料不足时主按钮置灰。
   * 挂在详情场景根(panelGroup)最后,遮罩盖住整页(名称牌/页签/返回键一起压暗)。服务器为唯一扣减方。
   */
  private renderAwakenDialog(panelGroup: Node, hero: LobbyHeroItemVO, panelWidth: number, panelHeight: number, scale: number): void {
    if (this.awakenDialogNode && this.isNodeAlive(this.awakenDialogNode)) {
      this.awakenDialogNode.destroy();
    }
    const dim = this.host.addChildPlainNode(panelGroup, 'LobbyHeroAwakenDim', 0, 0, panelWidth, panelHeight);
    this.awakenDialogNode = dim;
    const dimGraphics = dim.addComponent(Graphics);
    dimGraphics.fillColor = rgba(0, 0, 0, 178);
    dimGraphics.rect(-panelWidth / 2 - 400, -panelHeight / 2 - 400, panelWidth + 800, panelHeight + 800);
    dimGraphics.fill();
    dim.addComponent(BlockInputEvents);

    // 手机:全屏程序面板(雕花底板不能非等比拉伸),材料卡 / 效果区放大并在整屏内纵向铺开。
    const frame = this.phoneFrame;
    const w = frame ? frame.dialogWidth : Math.min(820 * scale, panelWidth - 60 * scale);
    const h = frame ? frame.dialogHeight : w / (1448 / 1086);
    const dialog = this.host.addChildPlainNode(dim, 'LobbyHeroAwakenDialog', 0, 0, w, h);
    const titleText = `觉醒 · ${safeText(hero.heroName)}`;
    const titleY = frame ? h / 2 - 42 * scale : h / 2 - 76 * scale;
    if (frame) {
      this.drawPhoneDialogPanel(dialog, w, h, scale);
      this.renderPhoneDialogTitle(dialog, 'LobbyHeroAwakenTitle', titleText, w, titleY, scale, () => this.closeAwakenDialog());
    } else {
      const base = dialog.addComponent(Graphics);
      base.fillColor = rgba(12, 10, 9, 248);
      base.rect(-w * 0.47, -h * 0.46, w * 0.94, h * 0.92);
      base.fill();
      if (!this.host.addSprite('LobbyHeroAwakenDialogBg', 'ui/hero/ai/refine_panel_bg/spriteFrame', 0, 0, w, h, dialog)) {
        base.strokeColor = rgba(150, 112, 58, 220);
        base.lineWidth = 2 * scale;
        base.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
        base.stroke();
      }

      // 标题 + 两侧饰线(与词条/开箱弹层同一套)。
      const titleSize = 30 * scale;
      const title = this.host.addChildLabel(dialog, 'LobbyHeroAwakenTitle', titleText, 0, titleY, titleSize, rgba(250, 222, 150), new Size(w * 0.56, 40 * scale));
      title.overflow = Label.Overflow.SHRINK;
      this.applyOutline(title, scale, true);
      const titleHalf = Math.min(w * 0.28, Array.from(titleText).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e7f ? 1 : 0.55) * titleSize, 0) / 2);
      const dividerW = Math.min(130 * scale, w / 2 - titleHalf - 70 * scale);
      if (dividerW >= 36 * scale) {
        const dividerX = titleHalf + 18 * scale + dividerW / 2;
        this.host.addSprite('LobbyHeroAwakenDividerL', 'ui/common/ai/title_divider_left/spriteFrame', -dividerX, titleY, dividerW, dividerW * (76 / 390), dialog);
        this.host.addSprite('LobbyHeroAwakenDividerR', 'ui/common/ai/title_divider_right/spriteFrame', dividerX, titleY, dividerW, dividerW * (73 / 392), dialog);
      }
      const closeSize = 44 * scale;
      const close = this.host.addChildPlainNode(dialog, 'LobbyHeroAwakenClose', w / 2 - 60 * scale, titleY, closeSize, closeSize);
      close.addComponent(Button);
      close.on(Button.EventType.CLICK, () => this.closeAwakenDialog(), this);
      this.host.applyImageButtonFeedback(close, 1.08, 0.94);
      this.host.addSprite('LobbyHeroAwakenCloseArt', 'ui/common/ai/button_close/spriteFrame', 0, 0, closeSize, closeSize, close);
    }

    const sub = this.host.addChildLabel(dialog, 'LobbyHeroAwakenSub', `${Math.trunc(hero.star || 1)} 星已满足觉醒条件 · 消耗以下材料完成觉醒`, 0, titleY - (frame ? 50 : 38) * scale, 18 * scale, rgba(206, 188, 150), new Size(w * 0.72, 24 * scale));
    sub.overflow = Label.Overflow.SHRINK;

    // 材料卡:同名碎片 / 金币 / 觉醒石 / BOSS印记(需求 = hero_awaken_config 第 1 阶镜像)。
    const bag = this.host.currentLobbyBagState();
    const held = (code: string): number => Number(bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === code)?.itemCount ?? 0);
    const tier = (hero.rarity || '').toLowerCase();
    const shardIcon = `ui/bag/ai/icon_shard_${['r', 'sr', 'ssr', 'ur'].includes(tier) ? tier : 'n'}/spriteFrame`;
    const costs: Array<{ key: string; name: string; icon: string; need: number; have: number }> = [
      { key: 'Shard', name: '同名碎片', icon: shardIcon, need: AWAKEN_COST.fragments, have: held(`HERO_FRAGMENT:${(hero.heroCode || '').toUpperCase()}`) },
      { key: 'Gold', name: '金币', icon: 'ui/bag/ai/icon_gold/spriteFrame', need: AWAKEN_COST.gold, have: Number(this.host.currentLobbyProfile().gold) || 0 },
      { key: 'Stone', name: '觉醒石', icon: 'ui/bag/ai/icon_awaken_stone/spriteFrame', need: AWAKEN_COST.awakenStone, have: held('AWAKEN_STONE') },
      { key: 'Mark', name: 'BOSS印记', icon: 'ui/bag/ai/icon_boss_mark/spriteFrame', need: AWAKEN_COST.bossMark, have: held('BOSS_MARK') },
    ];
    const enough = costs.every((cost) => cost.have >= cost.need);
    const rowW = frame ? Math.min(w * 0.74, 900 * scale) : w * 0.74;
    const cardW = rowW / costs.length;
    const slot = Math.min((frame ? 110 : 84) * scale, cardW - 26 * scale);
    const slotY = titleY - (frame ? 152 : 110) * scale;
    costs.forEach((cost, index) => {
      const x = -rowW / 2 + cardW / 2 + index * cardW;
      const ok = cost.have >= cost.need;
      const card = this.host.addChildPlainNode(dialog, `LobbyHeroAwakenCost${cost.key}`, x, slotY, slot, slot);
      if (!this.host.addSprite('Slot', 'ui/common/ai/bag_slot/spriteFrame', 0, 0, slot, slot, card)) {
        const sg = card.addComponent(Graphics);
        sg.fillColor = rgba(24, 20, 17, 240);
        sg.roundRect(-slot / 2, -slot / 2, slot, slot, 8 * scale);
        sg.fill();
      }
      this.host.addSprite('Icon', cost.icon, 0, 0, slot * 0.66, slot * 0.66, card);
      if (!ok) {
        const warn = card.addComponent(Graphics);
        warn.strokeColor = rgba(226, 88, 72, 230);
        warn.lineWidth = 2 * scale;
        warn.roundRect(-slot / 2 + 2 * scale, -slot / 2 + 2 * scale, slot - 4 * scale, slot - 4 * scale, 8 * scale);
        warn.stroke();
      }
      const name = this.host.addChildLabel(dialog, `LobbyHeroAwakenCostName${cost.key}`, cost.name, x, slotY - slot / 2 - (frame ? 20 : 16) * scale, 17 * scale, rgba(222, 204, 166), new Size(cardW - 8 * scale, 22 * scale));
      name.overflow = Label.Overflow.SHRINK;
      const amountText = `${formatAwakenAmount(cost.have)} / ${formatAwakenAmount(cost.need)}`;
      const amount = this.host.addChildLabel(dialog, `LobbyHeroAwakenCostAmount${cost.key}`, amountText, x, slotY - slot / 2 - (frame ? 48 : 40) * scale, (frame ? 22 : 17) * scale, ok ? rgba(240, 212, 140) : rgba(238, 104, 88), new Size(cardW - 8 * scale, 22 * scale));
      amount.overflow = Label.Overflow.SHRINK;
      this.applyOutline(amount, scale, false);
    });

    // 觉醒效果区:暗底圆角框 + 金点条目(只列已生效的效果;觉醒立绘/边框做好再加)。
    const effTop = slotY - slot / 2 - (frame ? 84 : 66) * scale;
    const effW = rowW;
    const effects = [
      `大招等级上限 Lv.${ultimateCap(false)} → Lv.${ultimateCap(true)}`,
      '英雄属性增强',
    ];
    const effH = 38 * scale + effects.length * 26 * scale;
    const effBox = this.host.addChildPlainNode(dialog, 'LobbyHeroAwakenEffects', 0, effTop - effH / 2, effW, effH);
    const eg = effBox.addComponent(Graphics);
    eg.fillColor = rgba(8, 7, 7, 190);
    eg.roundRect(-effW / 2, -effH / 2, effW, effH, 8 * scale);
    eg.fill();
    eg.strokeColor = rgba(150, 116, 62, 150);
    eg.lineWidth = 1.2 * scale;
    eg.stroke();
    const effTitle = this.host.addChildLabel(effBox, 'Title', '觉醒效果', -effW / 2 + 18 * scale, effH / 2 - 18 * scale, 18 * scale, rgba(246, 212, 132), new Size(effW - 36 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    effTitle.overflow = Label.Overflow.SHRINK;
    effects.forEach((text, index) => {
      const y = effH / 2 - 44 * scale - index * 26 * scale;
      const dot = this.host.addChildPlainNode(effBox, `Dot_${index}`, -effW / 2 + 26 * scale, y, 10 * scale, 10 * scale);
      const dg = dot.addComponent(Graphics);
      dg.fillColor = rgba(236, 184, 88, 240);
      dg.moveTo(0, 5 * scale);
      dg.lineTo(5 * scale, 0);
      dg.lineTo(0, -5 * scale);
      dg.lineTo(-5 * scale, 0);
      dg.close();
      dg.fill();
      const line = this.host.addChildLabel(effBox, `Line_${index}`, text, -effW / 2 + 40 * scale, y, 17 * scale, rgba(226, 212, 182), new Size(effW - 60 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
      line.overflow = Label.Overflow.SHRINK;
    });

    // 按钮:主"觉醒"(材料不足置灰并改字)+ 次"取消"。
    const buttonW = (frame ? 230 : 200) * scale;
    const buttonH = buttonW * (211 / 740);
    const buttonY = -h / 2 + (frame ? 60 : 92) * scale;
    const confirm = this.host.addChildPlainNode(dialog, 'LobbyHeroAwakenConfirm', -buttonW / 2 - 22 * scale, buttonY, buttonW, buttonH);
    const confirmArt = enough ? 'ui/common/ai/button_primary/spriteFrame' : 'ui/common/ai/button_return_dis/spriteFrame';
    if (!this.host.addSprite('Art', confirmArt, 0, 0, buttonW, buttonH, confirm)) {
      const cg = confirm.addComponent(Graphics);
      cg.fillColor = enough ? rgba(122, 42, 30, 235) : rgba(60, 52, 40, 220);
      cg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      cg.fill();
    }
    const confirmLabel = this.host.addChildLabel(confirm, 'Label', enough ? '觉 醒' : '材料不足', 0, 1 * scale, 21 * scale, enough ? rgba(255, 240, 200) : rgba(190, 176, 150), new Size(buttonW - 46 * scale, buttonH * 0.7));
    confirmLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(confirmLabel, scale, true);
    if (enough) {
      confirm.addComponent(Button);
      confirm.on(Button.EventType.CLICK, () => {
        this.closeAwakenDialog();
        this.host.awakenLobbyHero(hero.id);
      }, this);
      this.host.applyImageButtonFeedback(confirm, 1.035, 0.965);
    }
    const cancel = this.host.addChildPlainNode(dialog, 'LobbyHeroAwakenCancel', buttonW / 2 + 22 * scale, buttonY, buttonW, buttonH);
    if (!this.host.addSprite('Art', 'ui/common/ai/button_return_dis/spriteFrame', 0, 0, buttonW, buttonH, cancel)) {
      const xg = cancel.addComponent(Graphics);
      xg.fillColor = rgba(28, 24, 22, 230);
      xg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 9 * scale);
      xg.fill();
    }
    const cancelLabel = this.host.addChildLabel(cancel, 'Label', '取 消', 0, 1 * scale, 21 * scale, rgba(212, 196, 166), new Size(buttonW - 46 * scale, buttonH * 0.7));
    cancelLabel.overflow = Label.Overflow.SHRINK;
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, () => this.closeAwakenDialog(), this);
    this.host.applyImageButtonFeedback(cancel, 1.035, 0.965);
  }

  // 区块标题(参考图2):通栏暗色半透明底框 + 左侧星徽 ic_section_star + 金字标题,左对齐。
  private addSectionTitle(parent: Node, name: string, text: string, panelWidth: number, y: number, scale: number): void {
    const barW = panelWidth - 36 * scale;
    const barH = 34 * scale;
    const bar = this.host.addChildPlainNode(parent, `${name}Bar`, 0, y, barW, barH);
    const barG = bar.addComponent(Graphics);
    barG.fillColor = rgba(8, 7, 8, 152);
    barG.roundRect(-barW / 2, -barH / 2, barW, barH, 6 * scale);
    barG.fill();
    barG.strokeColor = rgba(150, 118, 66, 96);
    barG.lineWidth = 1 * scale;
    barG.roundRect(-barW / 2, -barH / 2, barW, barH, 6 * scale);
    barG.stroke();
    const iconSize = 24 * scale;
    const iconX = -panelWidth / 2 + 24 * scale + iconSize / 2;
    const iconShown = this.host.addSprite(`${name}Icon`, HERO_AI_SECTION_STAR_ASSET, iconX, y, iconSize, iconSize, parent);
    const textX = iconShown ? -panelWidth / 2 + 24 * scale + iconSize + 8 * scale : -panelWidth / 2 + 24 * scale;
    const title = this.host.addChildLabel(parent, `${name}Title`, text, textX, y, 18 * scale, rgba(247, 218, 148), new Size(panelWidth * 0.5, 26 * scale), HorizontalTextAlignment.LEFT);
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
  }

  // 属性详情弹窗:全量属性 + 养成信息(幸运/觉醒/大招),点任意处关闭。
  private showAttrDetailPopup(parent: Node, hero: LobbyHeroItemVO, scale: number): void {
    // 手机全屏:浮层改挂到场景内容根(右栏之后才画的名牌/页签/标题横幅/返回键不再盖在弹窗上)。
    const phoneRoot = this.phoneFrame && this.detailRenderContext && this.isNodeAlive(this.detailRenderContext.panelGroup) ? this.detailRenderContext.panelGroup : null;
    const overlay = this.host.addChildPlainNode(phoneRoot ?? parent, 'LobbyHeroAttrDetailOverlay', 0, 0, 4000, 4000);
    overlay.addComponent(BlockInputEvents);
    const og = overlay.addComponent(Graphics);
    og.fillColor = rgba(0, 0, 0, 150);
    og.rect(-2000, -2000, 4000, 4000);
    og.fill();
    const attrs = resolveAttributes(hero);
    const chips = resolveGrowthChips(hero);
    const frame = this.phoneFrame;
    if (frame) {
      this.renderPhoneAttrDetail(overlay, hero, frame, attrs, chips, scale, phoneRoot ? 0 : -frame.infoX, phoneRoot ? 0 : -frame.infoY);
      overlay.addComponent(Button);
      overlay.on(Button.EventType.CLICK, () => {
        if (overlay.isValid) {
          overlay.destroy();
        }
      });
      return;
    }
    const w = 360 * scale;
    const rowH = 30 * scale;
    const h = 96 * scale + (attrs.length + chips.length) * rowH;
    const dialog = this.host.addChildPlainNode(overlay, 'LobbyHeroAttrDetailPanel', 0, 0, w, h);
    const g = dialog.addComponent(Graphics);
    g.fillColor = rgba(12, 10, 9, 248);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = rgba(214, 168, 82, 225);
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();
    const title = this.host.addChildLabel(dialog, 'Title', `${safeText(hero.heroName)} · 属性详情`, 0, h / 2 - 28 * scale, 24 * scale, rgba(240, 210, 140), new Size(w - 40 * scale, 30 * scale));
    title.overflow = Label.Overflow.SHRINK;
    this.applyOutline(title, scale, true);
    const rows: { label: string; value: string }[] = [
      ...attrs.map((attr) => ({ label: attr.label, value: attr.value })),
      ...chips.map((chip) => ({ label: chip.label, value: chip.value })),
    ];
    rows.forEach((row, index) => {
      const ry = h / 2 - 56 * scale - index * rowH;
      const icon = HERO_AI_STAT_ICON_ASSETS[row.label];
      if (icon) {
        this.host.addSprite('AttrDetailIcon', icon, -w / 2 + 24 * scale + 10 * scale, ry, 20 * scale, 20 * scale, dialog);
      }
      const label = this.host.addChildLabel(dialog, `AttrDetailLabel_${index}`, row.label, -w / 2 + 56 * scale, ry, 17 * scale, rgba(196, 178, 140), new Size(w * 0.4, 22 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
      const value = this.host.addChildLabel(dialog, `AttrDetailValue_${index}`, row.value, w / 2 - 24 * scale, ry, 17 * scale, rgba(244, 232, 200), new Size(w * 0.42, 22 * scale), HorizontalTextAlignment.RIGHT);
      value.overflow = Label.Overflow.SHRINK;
    });
    const hint = this.host.addChildLabel(dialog, 'Hint', '点击任意处关闭', 0, -h / 2 + 20 * scale, 15 * scale, rgba(160, 146, 120), new Size(w - 40 * scale, 20 * scale));
    hint.overflow = Label.Overflow.SHRINK;
    overlay.addComponent(Button);
    overlay.on(Button.EventType.CLICK, () => {
      if (overlay.isValid) {
        overlay.destroy();
      }
    });
  }

  // 手机属性详情:全屏面板(浮层挂在场景内容根,居中;取不到内容根时挂右栏并反向偏移回舞台中心),属性 / 养成两栏大字行,点任意处关闭。
  private renderPhoneAttrDetail(overlay: Node, hero: LobbyHeroItemVO, frame: HeroDetailPhoneFrame, attrs: HeroDetailAttribute[], chips: { label: string; value: string }[], scale: number, offsetX: number, offsetY: number): void {
    const w = frame.dialogWidth;
    const h = frame.dialogHeight;
    const dialog = this.host.addChildPlainNode(overlay, 'LobbyHeroAttrDetailPanel', offsetX, offsetY, w, h);
    this.drawPhoneDialogPanel(dialog, w, h, scale);
    this.renderPhoneDialogTitle(dialog, 'Title', `${safeText(hero.heroName)} · 属性详情`, w, h / 2 - 42 * scale, scale, () => {
      if (overlay.isValid) {
        overlay.destroy();
      }
    });
    const colW = Math.min((w - 140 * scale) / 2, 520 * scale);
    const colGap = 40 * scale;
    const rowH = 52 * scale;
    const rowStride = 60 * scale;
    const topY = h / 2 - 116 * scale;
    const columns: Array<{ title: string; rows: { label: string; value: string }[] }> = [
      { title: '战斗属性', rows: attrs.map((attr) => ({ label: attr.label, value: attr.value })) },
      { title: '养成', rows: chips.map((chip) => ({ label: chip.label, value: chip.value })) },
    ];
    columns.forEach((column, colIndex) => {
      const cx = (colIndex === 0 ? -1 : 1) * (colW / 2 + colGap / 2);
      const head = this.host.addChildLabel(dialog, `AttrDetailHead_${colIndex}`, column.title, cx - colW / 2 + 8 * scale, topY, 22 * scale, rgba(238, 206, 138), new Size(colW - 16 * scale, 30 * scale), HorizontalTextAlignment.LEFT);
      head.overflow = Label.Overflow.SHRINK;
      column.rows.forEach((row, index) => {
        const ry = topY - 48 * scale - index * rowStride;
        const line = this.host.addChildPlainNode(dialog, `AttrDetailRow_${colIndex}_${index}`, cx, ry, colW, rowH);
        const lg = line.addComponent(Graphics);
        lg.fillColor = rgba(22, 19, 16, 220);
        lg.roundRect(-colW / 2, -rowH / 2, colW, rowH, 7 * scale);
        lg.fill();
        lg.strokeColor = rgba(150, 122, 70, 120);
        lg.lineWidth = 1.2 * scale;
        lg.stroke();
        const icon = HERO_AI_STAT_ICON_ASSETS[row.label];
        if (icon) {
          this.host.addSprite('AttrDetailIcon', icon, -colW / 2 + 28 * scale, 0, 28 * scale, 28 * scale, line);
        }
        const label = this.host.addChildLabel(line, 'Label', row.label, -colW / 2 + (icon ? 54 : 20) * scale, 0, 22 * scale, rgba(206, 188, 150), new Size(colW * 0.42, 30 * scale), HorizontalTextAlignment.LEFT);
        label.overflow = Label.Overflow.SHRINK;
        const value = this.host.addChildLabel(line, 'Value', row.value, colW / 2 - 18 * scale, 0, 24 * scale, rgba(244, 232, 200), new Size(colW * 0.48, 32 * scale), HorizontalTextAlignment.RIGHT);
        value.overflow = Label.Overflow.SHRINK;
        this.applyOutline(value, scale, false);
      });
    });
    const hint = this.host.addChildLabel(dialog, 'Hint', '点击任意处关闭', 0, -h / 2 + 34 * scale, 18 * scale, rgba(160, 146, 120), new Size(w - 80 * scale, 24 * scale));
    hint.overflow = Label.Overflow.SHRINK;
  }

  private renderAttributeGrid(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    // "战斗展示属性"标题按需求移除,属性网格上移补位。
    // 手机:标题上提 12,网格跟着上提;行距 34 / 格高 30(20 号字不贴边)。
    const phone = !!this.phoneFrame;
    const rowStep = (phone ? 34 : 30) * scale;
    const cellH = (phone ? 30 : 27) * scale;
    const grid = this.host.addChildPlainNode(parent, 'LobbyHeroDetailAttributeGrid', 0, height / 2 - (phone ? 101 : 115) * scale, width - 48 * scale, 86 * scale);
    const attrs = resolveAttributes(hero);
    const cellWidth = (width - 64 * scale) / 2;
    attrs.slice(0, 6).forEach((attr, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const cell = this.host.addChildPlainNode(grid, `LobbyHeroDetailAttribute_${index}`, -cellWidth / 2 - 6 * scale + column * (cellWidth + 12 * scale), rowStep - row * rowStep, cellWidth, cellH);
      const graphics = cell.addComponent(Graphics);
      graphics.fillColor = rgba(12, 10, 10, 172);
      graphics.rect(-cellWidth / 2, -cellH / 2, cellWidth, cellH);
      graphics.fill();
      graphics.strokeColor = rgba(124, 93, 50, 118);
      graphics.stroke();
      // 标签暗金 + 数值亮白右对齐:让数字从底色里跳出来,可扫读。
      // addChildLabel 的 x 语义:LEFT=左边缘,RIGHT=右边缘。
      // 行首属性小图标(stat_*),缺图时文字左移补位。
      const statIcon = HERO_AI_STAT_ICON_ASSETS[attr.label]
        ? this.host.addSprite('LobbyHeroDetailAttributeIcon', HERO_AI_STAT_ICON_ASSETS[attr.label], -cellWidth / 2 + 10 * scale + 11 * scale, 0, 21 * scale, 21 * scale, cell)
        : null;
      const labelX = statIcon ? -cellWidth / 2 + 38 * scale : -cellWidth / 2 + 10 * scale;
      const label = this.host.addChildLabel(cell, 'LobbyHeroDetailAttributeLabel', attr.label, labelX, 0, 17 * scale, rgba(178, 158, 118), new Size(cellWidth * 0.42, 24 * scale), HorizontalTextAlignment.LEFT);
      label.overflow = Label.Overflow.SHRINK;
      const value = this.host.addChildLabel(cell, 'LobbyHeroDetailAttributeValue', attr.value, cellWidth / 2 - 12 * scale, 0, 18 * scale, rgba(244, 232, 200), new Size(cellWidth * 0.5, 24 * scale), HorizontalTextAlignment.RIGHT);
      value.overflow = Label.Overflow.SHRINK;
      this.applyOutline(value, scale, false);
    });
  }

  // 手机属性页的技能摘要:区块标题 + 右侧"全部技能 ›"(跳技能页签)+ 一行大招(名称 / 等级 + 升级钮)。
  private renderPhoneSkillSummary(parent: Node, hero: LobbyHeroItemVO, width: number, scale: number, titleY: number): void {
    this.skillSelectBoxes = [];
    this.addSectionTitle(parent, 'LobbyHeroDetailSkillSection', '技能', width, titleY, scale);
    const allW = 132 * scale;
    const allH = 30 * scale;
    const allBtn = this.host.addChildPlainNode(parent, 'LobbyHeroDetailSkillAllEntry', width / 2 - 24 * scale - allW / 2, titleY, allW, allH);
    const allLabel = this.host.addChildLabel(allBtn, 'Label', '全部技能 ›', allW / 2 - 4 * scale, 0, 18 * scale, rgba(240, 206, 132), new Size(allW - 8 * scale, allH - 4 * scale), HorizontalTextAlignment.RIGHT);
    allLabel.overflow = Label.Overflow.SHRINK;
    allBtn.addComponent(Button);
    allBtn.on(Button.EventType.CLICK, () => this.host.selectLobbyHeroDetailTab('skill'), this);
    this.host.applyImageButtonFeedback(allBtn);
    const skills = resolveSkills(hero);
    const ultimate = skills.find((skill) => skill.kind === 'ultimate') ?? skills[0] ?? null;
    if (!ultimate) {
      return;
    }
    const rowW = width - 44 * scale;
    const rowH = 56 * scale;
    const rowY = titleY - 17 * scale - 6 * scale - rowH / 2;
    const row = this.host.addChildPlainNode(parent, 'LobbyHeroDetailSkillSummaryRow', 0, rowY, rowW, rowH);
    const graphics = row.addComponent(Graphics);
    graphics.fillColor = rgba(88, 22, 18, 205);
    graphics.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 7 * scale);
    graphics.fill();
    graphics.strokeColor = rgba(214, 158, 74, 205);
    graphics.lineWidth = 1.6 * scale;
    graphics.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 7 * scale);
    graphics.stroke();
    const iconX = -rowW / 2 + 32 * scale;
    const iconSize = 34 * scale;
    const slotG = this.host.addChildPlainNode(row, 'SkillRowIconSlot', iconX, 0, iconSize + 12 * scale, iconSize + 12 * scale).addComponent(Graphics);
    slotG.fillColor = rgba(7, 7, 8, 215);
    slotG.circle(0, 0, iconSize * 0.62 + 3 * scale);
    slotG.fill();
    slotG.strokeColor = rgba(178, 140, 78, 190);
    slotG.lineWidth = 1.2 * scale;
    slotG.circle(0, 0, iconSize * 0.62 + 3 * scale);
    slotG.stroke();
    this.drawSkillIcon(row, iconX, 0, iconSize, scale, 0, ultimate);
    const upgradable = !hero.protagonist;
    const upW = 92 * scale;
    const textX = iconX + iconSize / 2 + 18 * scale;
    const textW = rowW / 2 - textX - (upgradable ? upW + 22 * scale : 14 * scale);
    const name = this.host.addChildLabel(row, 'LobbyHeroDetailSkillName', safeText(ultimate.name), textX, 0, 20 * scale, rgba(252, 224, 150), new Size(textW * 0.58, 26 * scale), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, false);
    const tag = this.host.addChildLabel(row, 'LobbyHeroDetailSkillTag', safeText(ultimate.tag), textX + textW, 0, 18 * scale, rgba(214, 190, 140), new Size(textW * 0.4, 24 * scale), HorizontalTextAlignment.RIGHT);
    tag.overflow = Label.Overflow.SHRINK;
    if (upgradable) {
      this.renderUltimateUpButton(row, hero, rowW / 2 - 12 * scale - upW / 2, upW, 38 * scale, 18, scale);
    }
    // 整行点一下跳技能页签看完整描述。
    row.addComponent(Button);
    row.on(Button.EventType.CLICK, () => this.host.selectLobbyHeroDetailTab('skill'), this);
  }

  /**
   * 大招行右侧按钮(bt2-hero-refine):可升 = 红底金边「升 级」;已到当前上限(未觉醒 Lv5/5)= 暗底「已达上限」(仍可点开弹窗看觉醒后上限);
   * 满级 = 暗底「已满级」不可点。之前 Lv5/5 仍画一枚亮红「升级」,和等级标签矛盾。
   */
  private renderUltimateUpButton(row: Node, hero: LobbyHeroItemVO, x: number, upW: number, upH: number, fontSize: number, scale: number): void {
    const current = typeof hero.ultimateSkillLevel === 'number' ? hero.ultimateSkillLevel : 1;
    const maxed = current >= ULTIMATE_MAX_LEVEL;
    const capped = !maxed && current >= ultimateCap(hero.awakenStatus === 1);
    const blocked = maxed || capped;
    const upBtn = this.host.addChildPlainNode(row, 'SkillRowUltimateUp', x, 0, upW, upH);
    const ug = upBtn.addComponent(Graphics);
    ug.fillColor = blocked ? rgba(30, 24, 22, 235) : rgba(122, 42, 30, 235);
    ug.roundRect(-upW / 2, -upH / 2, upW, upH, 8 * scale);
    ug.fill();
    ug.strokeColor = blocked ? rgba(132, 112, 84, 170) : rgba(240, 186, 96, 225);
    ug.lineWidth = (blocked ? 1.2 : 1.5) * scale;
    ug.stroke();
    const upLabel = this.host.addChildLabel(upBtn, 'Label', maxed ? '已满级' : capped ? '已达上限' : '升 级', 0, 0, fontSize * scale, blocked ? rgba(172, 160, 136) : rgba(252, 226, 168), new Size(upW - 10 * scale, 26 * scale));
    upLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(upLabel, scale, false);
    if (maxed) {
      return;
    }
    upBtn.addComponent(Button);
    this.applyPointerCursor(upBtn);
    upBtn.on(Button.EventType.CLICK, () => this.host.openLobbyHeroUltimateDialog(), this);
    this.host.applyImageButtonFeedback(upBtn);
  }

  private renderSkillList(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number, titleYOverride?: number, bottomReserve?: number): void {
    this.skillSelectBoxes = [];
    const titleY = titleYOverride ?? height / 2 - 286 * scale;
    this.addSectionTitle(parent, 'LobbyHeroDetailSkillSection', '技能', width, titleY, scale);
    // bt2-hero-refine-v2 手机:标题条下 6 起排(列表内首行还有 8 的内距),与属性 / 升星页一致;桌面同步收紧到标题条下 12(原 26,标题和首行之间空一截)。
    const phone = !!this.phoneFrame;
    const listTop = titleY - (phone ? 15 : 21) * scale;
    const listBottom = -height / 2 + (bottomReserve ?? 44 * scale);
    const listHeight = Math.max(112 * scale, listTop - listBottom);
    const list = this.host.addChildPlainNode(parent, 'LobbyHeroDetailSkillList', 0, (listTop + listBottom) / 2, width - 48 * scale, listHeight);
    const skills = resolveSkills(hero);
    // 技能组按稀有度 3~5 条:行数自适应,行高随条数收缩,保证全部可见。
    const shownCount = Math.min(skills.length, 5);
    const rowGap = (phone ? 9 : 7) * scale;
    // 大招行独立加高(两行描述不贴边),其余行均分;行位按累计高度排布。
    const ultimateExtra = 22 * scale;
    // 手机:描述字号被抬到 20,行高上限放宽到 84 才放得下两行描述(名称 26 + 描述 + 上下各 8 内距)。
    const baseRowHeight = Math.min((phone ? 84 : 62) * scale, Math.max(38 * scale, (listHeight - 16 * scale - rowGap * (shownCount - 1) - ultimateExtra) / shownCount));
    let rowCursorY = listHeight / 2 - 8 * scale;
    skills.slice(0, shownCount).forEach((skill, index) => {
      const isUltimate = skill.kind === 'ultimate';
      const locked = skill.locked === true;
      const rowHeight = isUltimate ? baseRowHeight + ultimateExtra : baseRowHeight;
      const rowW = width - 44 * scale;
      const row = this.host.addChildPlainNode(list, `LobbyHeroDetailSkillRow_${index}`, 0, rowCursorY - rowHeight / 2, rowW, rowHeight);
      rowCursorY -= rowHeight + rowGap;
      // 行底:纯程序画圆角暗底+细描边(skill_item_bg 框线与动态内容对不齐,弃用行底图)。
      const graphics = row.addComponent(Graphics);
      graphics.fillColor = locked ? rgba(9, 9, 10, 168) : isUltimate ? rgba(88, 22, 18, 205) : rgba(13, 11, 13, 190);
      graphics.roundRect(-rowW / 2, -rowHeight / 2, rowW, rowHeight, 7 * scale);
      graphics.fill();
      graphics.strokeColor = locked ? rgba(96, 84, 60, 120) : isUltimate ? rgba(214, 158, 74, 205) : rgba(146, 108, 54, 150);
      graphics.lineWidth = (isUltimate ? 1.6 : 1.1) * scale;
      graphics.roundRect(-rowW / 2, -rowHeight / 2, rowW, rowHeight, 7 * scale);
      graphics.stroke();
      const skillIconX = -rowW / 2 + 34 * scale;
      const skillIconSize = Math.min(40 * scale, rowHeight - 12 * scale);
      // 圆形图标槽底:锁定/解锁图记都有落点,不再空浮。
      const slotNode = this.host.addChildPlainNode(row, 'SkillRowIconSlot', skillIconX, 0, skillIconSize + 12 * scale, skillIconSize + 12 * scale);
      const slotG = slotNode.addComponent(Graphics);
      slotG.fillColor = rgba(7, 7, 8, 215);
      slotG.circle(0, 0, skillIconSize * 0.62 + 3 * scale);
      slotG.fill();
      slotG.strokeColor = locked ? rgba(110, 96, 70, 150) : rgba(178, 140, 78, 190);
      slotG.lineWidth = 1.2 * scale;
      slotG.circle(0, 0, skillIconSize * 0.62 + 3 * scale);
      slotG.stroke();
      if (locked) {
        // 锁定行:双件挂锁(扣合态)图记;素材缺失回退程序画挂锁。
        if (!renderLockGlyph(this.host, row, 'SkillRowLock', skillIconX, 0, skillIconSize * 0.82, true)) {
          const lock = this.host.addChildPlainNode(row, 'SkillRowLockFallback', skillIconX, 0, skillIconSize, skillIconSize);
          const lg = lock.addComponent(Graphics);
          lg.strokeColor = rgba(158, 138, 100, 210);
          lg.lineWidth = 2 * scale;
          const bodyW = skillIconSize * 0.5;
          lg.roundRect(-bodyW / 2, -skillIconSize * 0.3, bodyW, skillIconSize * 0.38, 2.5 * scale);
          lg.stroke();
          lg.arc(0, skillIconSize * 0.08, bodyW * 0.34, Math.PI, 0, false);
          lg.stroke();
        }
      } else {
        this.drawSkillIcon(row, skillIconX, 0, skillIconSize, scale, index, skill);
      }
      const nameColor = locked ? rgba(150, 140, 120) : isUltimate ? rgba(252, 224, 150) : rgba(242, 214, 146);
      const ultUpgradable = isUltimate && !hero.protagonist;
      // 文字右缘:普通行贴卡片内距(与大招按钮右缘同一条线),大招行让出按钮。
      const skillTextWidth = width - (ultUpgradable ? 240 : 122) * scale;
      const nameY = rowHeight / 2 - (phone ? 21 : 16) * scale;
      // 名称(金)与标签(暗金,右对齐)分开:一眼先读到技能名,标签退为次要信息。
      const name = this.host.addChildLabel(row, 'LobbyHeroDetailSkillName', skill.name, -width / 2 + 86 * scale, nameY, 18 * scale, nameColor, new Size(skillTextWidth * 0.5, 22 * scale), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      this.applyOutline(name, scale, false);
      const tagLabel = this.host.addChildLabel(row, 'LobbyHeroDetailSkillTag', skill.tag, -width / 2 + 86 * scale + skillTextWidth, nameY, 15 * scale, locked ? rgba(150, 140, 118) : isUltimate ? rgba(236, 200, 140) : rgba(190, 166, 116), new Size(skillTextWidth * 0.48, 22 * scale), HorizontalTextAlignment.RIGHT);
      tagLabel.overflow = Label.Overflow.SHRINK;
      const desc = this.host.addChildLabel(row, 'LobbyHeroDetailSkillDesc', skill.description, -width / 2 + 86 * scale, (phone ? -14 : -8) * scale, 15 * scale, locked ? rgba(140, 130, 112) : rgba(190, 173, 133), new Size(skillTextWidth, rowHeight - (phone ? 44 : 26) * scale), HorizontalTextAlignment.LEFT);
      if (ultUpgradable) {
        // 大招升级入口(P6):行右侧按钮,打开材料弹窗。
        const upW = 92 * scale;
        this.renderUltimateUpButton(row, hero, rowW / 2 - 14 * scale - upW / 2, upW, 38 * scale, 17, scale);
      }
      // 15px 字配 16px 行距过密是"挤"感主因,放宽到 19px;描述已压回两行内。
      desc.lineHeight = (phone ? 22 : 19) * scale;
      desc.overflow = Label.Overflow.SHRINK;
      // 技能行可选中:金框高亮,点击互斥切换(不整页重绘)。
      const selBox = this.host.addChildPlainNode(row, 'SkillRowSelect', 0, 0, rowW, rowHeight);
      const sg = selBox.addComponent(Graphics);
      sg.strokeColor = rgba(248, 206, 110, 245);
      sg.lineWidth = 2 * scale;
      sg.roundRect(-rowW / 2 + 1 * scale, -rowHeight / 2 + 1 * scale, rowW - 2 * scale, rowHeight - 2 * scale, 6 * scale);
      sg.stroke();
      selBox.active = this.heroSkillSelectedIndex === index;
      this.skillSelectBoxes.push(selBox);
      row.addComponent(Button);
      this.applyPointerCursor(row);
      row.on(Button.EventType.CLICK, () => {
        this.heroSkillSelectedIndex = index;
        this.skillSelectBoxes.forEach((box, boxIndex) => {
          if (box && box.isValid) {
            box.active = boxIndex === index;
          }
        });
      }, this);
    });
  }

  // 右下页签导航(参考图1):属性/装备/技能/升星,选中红底金框金字。
  private renderDetailNav(parent: Node, active: 'attr' | 'equip' | 'skill' | 'star', width: number, height: number, scale: number): void {
    const hero = this.host.currentLobbyHeroDetailHero();
    const starDot = !!hero && this.isHeroAwakenable(hero);
    const entries: { key: 'attr' | 'equip' | 'skill' | 'star'; label: string }[] = [
      { key: 'attr', label: '属性' },
      { key: 'equip', label: '装备' },
      { key: 'skill', label: '技能' },
      { key: 'star', label: '升星' },
    ];
    // 手机:左侧竖排(右栏底部是升级按钮,不能再叠页签);桌面:右下横排。
    const frame = this.phoneFrame;
    const tabW = frame ? frame.tabWidth : 136 * scale;
    // 手机(bt2-hero-refine):牌面高 = 选中牌等比高(52~60);节点(触摸区)高 = 行距 78,上下相邻不留死区,约 40 CSS px。
    const faceH = frame ? tabW * (HERO_NAV_TAB_ACTIVE_ART.bh / HERO_NAV_TAB_ACTIVE_ART.bw) : 56 * scale;
    const tabH = frame ? Math.max(78 * scale, faceH + 14 * scale) : faceH;
    const gap = (frame ? 0 : 8) * scale;
    const y = -height / 2 + 46 * scale;
    const startX = width / 2 - 30 * scale - tabW / 2 - (entries.length - 1) * (tabW + gap);
    const columnTopY = -14 * scale + ((entries.length - 1) * (tabH + gap)) / 2;
    entries.forEach((entry, index) => {
      const x = frame ? frame.tabX : startX + index * (tabW + gap);
      const tabY = frame ? columnTopY - index * (tabH + gap) : y;
      const selected = entry.key === active;
      const node = this.host.addChildPlainNode(parent, `HeroDetailNav_${entry.key}`, x, tabY, tabW, tabH);
      // 手机:雕花牌整图等比缩放到"内容宽 = 页签宽"(选中红皮金框 / 未选暗石牌);图未到货时退回程序画圆角牌。
      let tabArt: Sprite | null = null;
      if (frame) {
        const art = selected ? HERO_NAV_TAB_ACTIVE_ART : HERO_NAV_TAB_NORMAL_ART;
        const artW = tabW * art.k;
        tabArt = this.host.addSprite('Art', art.asset, 0, 0, artW, artW * (art.bh / art.bw), node);
      }
      if (!tabArt) {
        const g = node.addComponent(Graphics);
        g.fillColor = selected ? rgba(96, 30, 24, 240) : rgba(18, 15, 14, 230);
        g.roundRect(-tabW / 2, -faceH / 2, tabW, faceH, 8 * scale);
        g.fill();
        g.strokeColor = selected ? rgba(244, 200, 104, 245) : rgba(122, 100, 66, 170);
        g.lineWidth = (selected ? 2 : 1.3) * scale;
        g.roundRect(-tabW / 2, -faceH / 2, tabW, faceH, 8 * scale);
        g.stroke();
      }
      const label = this.host.addChildLabel(node, 'Label', entry.label, 0, 0, (frame ? 24 : 21) * scale, selected ? rgba(255, 232, 170) : rgba(198, 182, 148), new Size(tabW - (frame ? 56 : 16) * scale, 32 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, selected);
      if (entry.key === 'star' && starDot) {
        // 可觉醒:升星页签右上红点,任何页签都能注意到。
        this.drawRedDot(node, 'HeroDetailNavStarDot', tabW / 2 - 8 * scale, faceH / 2 - 6 * scale, scale);
      }
      if (!selected) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.selectLobbyHeroDetailTab(entry.key), this);
        this.host.applyImageButtonFeedback(node);
      }
    });
  }

  // 装备页右栏(参考图2):部位签一行 + 可穿戴候选列表(穿戴/卸下/转移/强化)+ 一键穿/卸。
  private renderWearablePanel(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, scale: number): void {
    const state = this.host.currentLobbyHeroEquipState();
    const panel = this.host.addChildPlainNode(parent, 'LobbyHeroDetailWearPanel', x, y, width, height);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = rgba(6, 6, 8, 198);
    pg.rect(-width / 2, -height / 2, width, height);
    pg.fill();
    this.drawInfoPanelFrame(panel, 'LobbyHeroDetailWearPanelArt', width, height, scale);
    const phone = !!this.phoneFrame;
    if (phone) {
      // 手机:与属性 / 技能 / 升星页同款区块标题条(英雄名已在名牌上,不再重复)。
      this.addSectionTitle(panel, 'WearSection', '装备', width, height / 2 - 29 * scale, scale);
    } else {
      const title = this.host.addChildLabel(panel, 'WearTitle', `装备 · ${safeText(hero.heroName)}`, 0, height / 2 - 26 * scale, 20 * scale, rgba(247, 218, 148), new Size(width - 40 * scale, 28 * scale));
      title.overflow = Label.Overflow.SHRINK;
      this.applyOutline(title, scale, true);
    }
    if (phone) {
      // 手机:一键穿戴 / 一键卸下放标题条右侧(立绘顶部是标题横幅),高度收进标题条内。
      const quickW = 112 * scale;
      const quickH = 30 * scale;
      const quickY = height / 2 - 29 * scale;
      const makeQuick = (name: string, text: string, x: number, fill: { r: number; g: number; b: number }, onClick: () => void) => {
        const btn = this.host.addChildPlainNode(panel, name, x, quickY, quickW, quickH);
        const g = btn.addComponent(Graphics);
        g.fillColor = state.busy ? rgba(58, 52, 42, 215) : rgba(fill.r, fill.g, fill.b, 235);
        g.roundRect(-quickW / 2, -quickH / 2, quickW, quickH, quickH / 2);
        g.fill();
        g.strokeColor = rgba(222, 184, 104, 210);
        g.lineWidth = 1.5 * scale;
        g.stroke();
        const label = this.host.addChildLabel(btn, `${name}Label`, state.busy ? '处理中' : text, 0, 0, 19 * scale, rgba(250, 232, 184), new Size(quickW - 14 * scale, quickH - 4 * scale));
        label.overflow = Label.Overflow.SHRINK;
        this.applyOutline(label, scale, true);
        if (!state.busy) {
          btn.addComponent(Button);
          btn.on(Button.EventType.CLICK, onClick, this);
          this.host.applyImageButtonFeedback(btn);
        }
      };
      makeQuick('LobbyHeroDetailOneClickUnequip', '一键卸下', width / 2 - 24 * scale - quickW / 2, { r: 46, g: 68, b: 96 }, () => this.host.oneClickUnequipLobbyHero(hero.id));
      makeQuick('LobbyHeroDetailOneClickEquip', '一键穿戴', width / 2 - 24 * scale - quickW * 1.5 - 8 * scale, { r: 132, g: 88, b: 26 }, () => this.host.oneClickEquipLobbyHero(hero.id));
    }
    const items = state.items;
    const chipGap = 6 * scale;
    const chipW = (width - 44 * scale - 5 * chipGap) / 6;
    const chipH = 40 * scale;
    const chipY = height / 2 - (phone ? 76 : 64) * scale;
    HERO_EQUIP_SLOTS.forEach((slot, index) => {
      const cx = -width / 2 + 22 * scale + chipW / 2 + index * (chipW + chipGap);
      const selected = state.selectedSlot === slot.code;
      const chip = this.host.addChildPlainNode(panel, `WearSlotChip_${slot.code}`, cx, chipY, chipW, chipH);
      const g = chip.addComponent(Graphics);
      g.fillColor = selected ? rgba(58, 44, 16, 235) : rgba(20, 17, 15, 225);
      g.roundRect(-chipW / 2, -chipH / 2, chipW, chipH, 7 * scale);
      g.fill();
      g.strokeColor = selected ? rgba(242, 196, 96, 235) : rgba(110, 94, 72, 150);
      g.lineWidth = (selected ? 2 : 1.2) * scale;
      g.stroke();
      const chipLabel = this.host.addChildLabel(chip, 'Label', slot.label, 0, 0, 17 * scale, selected ? rgba(250, 226, 160) : rgba(196, 182, 148), new Size(chipW - 6 * scale, 22 * scale));
      chipLabel.overflow = Label.Overflow.SHRINK;
      chip.addComponent(Button);
      this.applyPointerCursor(chip);
      chip.on(Button.EventType.CLICK, () => this.host.selectLobbyHeroEquipSlot(slot.code), this);
    });
    const listTop = chipY - chipH / 2 - 14 * scale;
    const listBottom = -height / 2 + 24 * scale;
    const selectedSlot = state.selectedSlot;
    const candidates = selectedSlot ? items.filter((item) => item.slot === selectedSlot) : [];
    if (state.loading && items.length <= 0) {
      const loading = this.host.addChildLabel(panel, 'WearLoading', '装备列表读取中…', 0, (listTop + listBottom) / 2, 18 * scale, rgba(170, 158, 132), new Size(width - 44 * scale, 22 * scale));
      loading.overflow = Label.Overflow.SHRINK;
    } else if (candidates.length <= 0) {
      const empty = this.host.addChildLabel(panel, 'WearEmpty', selectedSlot ? '该部位暂无可用装备' : '点击上方部位或立绘旁装备格查看候选', 0, (listTop + listBottom) / 2, 18 * scale, rgba(150, 140, 120), new Size(width - 44 * scale, 22 * scale));
      empty.overflow = Label.Overflow.SHRINK;
    } else {
      this.renderWearEquipGrid(panel, hero, candidates, state.busy, state.selectedEquipId, width - 40 * scale, listTop, listBottom, scale, -width / 2 - 10 * scale, height / 2 - 70 * scale);
    }
  }

  // 候选装备方块网格(与锻造分解页同款,2026-07-24):点方块选中金框;强化/穿戴/卸下/转移集中在底部操作条;
  // hover 方块仍出装备详情浮层。右栏与装备弹窗共用。
  private renderWearEquipGrid(parent: Node, hero: LobbyHeroItemVO, candidates: EquipmentItemVO[], busy: boolean, selectedEquipId: number | null, gridW: number, areaTop: number, areaBottom: number, scale: number, tooltipAnchorX: number, tooltipClampHalf: number): void {
    const barH = 56 * scale;
    // 手机:候选格放进竖向滚动视窗,全部可滑动查看(桌面仍按容量截断 + "显示前 N 件")。
    const scrollable = !!this.phoneFrame;
    const gridBottom = areaBottom + barH + (scrollable ? 10 : 26) * scale;
    const cell = 92 * scale;
    const gap = 10 * scale;
    const columns = Math.max(1, Math.floor((gridW + gap) / (cell + gap)));
    const rows = Math.max(1, Math.floor((areaTop - gridBottom + gap) / (cell + gap)));
    const capacity = scrollable ? candidates.length : columns * rows;
    const shown = candidates.slice(0, capacity);
    // 默认选中:上次点选 > 本英雄已穿 > 第一件。
    const selected = shown.find((entry) => entry.id === selectedEquipId) ?? shown.find((entry) => entry.heroId === hero.id) ?? shown[0] ?? null;
    const gridLeft = -gridW / 2 + cell / 2 + Math.max(0, gridW - columns * (cell + gap) + gap) / 2;
    let cellParent = parent;
    let cellTop = areaTop;
    if (scrollable) {
      const viewH = areaTop - gridBottom;
      const pad = 4 * scale;
      const contentH = Math.max(viewH, Math.ceil(shown.length / columns) * (cell + gap) - gap + pad * 2);
      const viewport = this.host.addChildPlainNode(parent, 'WearGridScrollView', 0, (areaTop + gridBottom) / 2, gridW + 8 * scale, viewH);
      const mask = viewport.addComponent(Mask);
      mask.type = Mask.Type.GRAPHICS_RECT;
      const scrollView = viewport.addComponent(ScrollView);
      scrollView.horizontal = false;
      scrollView.vertical = true;
      scrollView.inertia = true;
      scrollView.elastic = true;
      scrollView.cancelInnerEvents = true;
      const content = this.host.addChildPlainNode(viewport, 'WearGridScrollContent', 0, (viewH - contentH) / 2, gridW + 8 * scale, contentH);
      scrollView.content = content;
      cellParent = content;
      cellTop = contentH / 2 - pad;
    }
    shown.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cx = gridLeft + col * (cell + gap);
      const cy = cellTop - cell / 2 - row * (cell + gap);
      const node = this.renderWearEquipCell(cellParent, `WearCell_${item.id}`, item, hero, cx, cy, cell, scale, selected != null && selected.id === item.id);
      node.on(Node.EventType.MOUSE_ENTER, () => this.showEquipTooltip(parent, item, tooltipAnchorX, clamp(cy, -tooltipClampHalf, tooltipClampHalf), 'left', scale), this);
      node.on(Node.EventType.MOUSE_LEAVE, () => this.hideWearTooltip(), this);
      node.addComponent(Button);
      this.applyPointerCursor(node);
      node.on(Button.EventType.CLICK, () => this.host.selectLobbyHeroWearEquip(item.id), this);
    });
    if (candidates.length > capacity) {
      const more = this.host.addChildLabel(parent, 'WearGridMore', `共 ${candidates.length} 件,显示前 ${capacity} 件`, 0, areaBottom + barH + 12 * scale, 14 * scale, rgba(150, 140, 120), new Size(gridW, 18 * scale));
      more.overflow = Label.Overflow.SHRINK;
    }
    if (!selected) {
      return;
    }
    const bar = this.host.addChildPlainNode(parent, 'WearActionBar', 0, areaBottom + barH / 2, gridW, barH);
    const q = equipQualityColor(selected.quality);
    const bg = bar.addComponent(Graphics);
    bg.fillColor = rgba(16, 13, 11, 235);
    bg.roundRect(-gridW / 2, -barH / 2, gridW, barH, 9 * scale);
    bg.fill();
    bg.strokeColor = rgba(q.r, q.g, q.b, 175);
    bg.lineWidth = 1.5 * scale;
    bg.stroke();
    const levelLocked = (selected.requiredLevel ?? 1) > Math.max(1, hero.level);
    const onThisHero = selected.heroId === hero.id;
    const onOtherHero = selected.heroId != null && selected.heroId !== hero.id;
    const tierText = (selected.tier ?? 1) > 1 ? `${selected.tier}阶·` : '';
    const enhanceSuffix = (selected.enhanceLevel ?? 0) > 0 ? ` +${selected.enhanceLevel}` : '';
    const btnW = 104 * scale;
    const btnH = 42 * scale;
    const enhW = 74 * scale;
    const textW = gridW - btnW - enhW - 60 * scale;
    const name = this.host.addChildLabel(bar, 'WearBarName', `${tierText}${safeText(selected.equipName)}${enhanceSuffix}${onThisHero ? '（已穿）' : levelLocked ? `（需Lv.${selected.requiredLevel}）` : ''}`, -gridW / 2 + 14 * scale, 12 * scale, 18 * scale, levelLocked ? rgba(206, 122, 104, 255) : rgba(q.r, q.g, q.b, 255), new Size(textW, 22 * scale), HorizontalTextAlignment.LEFT);
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, false);
    const attrs = this.host.addChildLabel(bar, 'WearBarAttrs', describeEquipAttrs(selected), -gridW / 2 + 14 * scale, -12 * scale, 16 * scale, rgba(196, 182, 148), new Size(textW, 20 * scale), HorizontalTextAlignment.LEFT);
    attrs.overflow = Label.Overflow.SHRINK;
    const actionBtn = this.host.addChildPlainNode(bar, 'WearBarAction', gridW / 2 - 12 * scale - btnW / 2, 0, btnW, btnH);
    const ag = actionBtn.addComponent(Graphics);
    ag.fillColor = busy ? rgba(60, 52, 40, 210) : onThisHero ? rgba(70, 40, 30, 230) : rgba(122, 42, 30, 235);
    ag.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 7 * scale);
    ag.fill();
    ag.strokeColor = rgba(214, 152, 74, 210);
    ag.lineWidth = 1.4 * scale;
    ag.stroke();
    const btnText = busy ? '处理中' : onThisHero ? '卸下' : levelLocked ? `需Lv.${selected.requiredLevel}` : onOtherHero ? '转移' : '穿戴';
    const btnLabel = this.host.addChildLabel(actionBtn, 'Label', btnText, 0, 0, 18 * scale, rgba(248, 226, 168), new Size(btnW - 10 * scale, btnH - 6 * scale));
    btnLabel.overflow = Label.Overflow.SHRINK;
    if (!busy && !(levelLocked && !onThisHero)) {
      actionBtn.addComponent(Button);
      actionBtn.on(Button.EventType.CLICK, () => {
        if (onThisHero) {
          this.host.unequipLobbyHeroEquipment(selected.id);
        } else {
          this.host.equipLobbyHeroEquipment(selected.id);
        }
      }, this);
      this.host.applyImageButtonFeedback(actionBtn);
    }
    const enhBtn = this.host.addChildPlainNode(bar, 'WearBarEnhance', gridW / 2 - 12 * scale - btnW - 8 * scale - enhW / 2, 0, enhW, btnH);
    const eg = enhBtn.addComponent(Graphics);
    eg.fillColor = busy ? rgba(60, 52, 40, 210) : rgba(96, 58, 22, 235);
    eg.roundRect(-enhW / 2, -btnH / 2, enhW, btnH, 7 * scale);
    eg.fill();
    eg.strokeColor = rgba(222, 176, 96, 200);
    eg.lineWidth = 1.4 * scale;
    eg.stroke();
    const enhLabel = this.host.addChildLabel(enhBtn, 'Label', '强化', 0, 0, 17 * scale, rgba(248, 224, 168), new Size(enhW - 8 * scale, btnH - 6 * scale));
    enhLabel.overflow = Label.Overflow.SHRINK;
    if (!busy) {
      enhBtn.addComponent(Button);
      enhBtn.on(Button.EventType.CLICK, () => this.host.openLobbyEquipEnhanceDialog(selected.id), this);
      this.host.applyImageButtonFeedback(enhBtn);
    }
  }

  // 方块单元(锻造 renderEquipCell 同构):雕花框/品质描边 + 装备图 + 底部名字条 + 右上+N + 左上 穿/他 标。
  private renderWearEquipCell(parent: Node, name: string, item: EquipmentItemVO, hero: LobbyHeroItemVO, x: number, y: number, cell: number, scale: number, highlighted: boolean): Node {
    const q = equipQualityColor(item.quality);
    const node = this.host.addChildPlainNode(parent, name, x, y, cell, cell);
    const g = node.addComponent(Graphics);
    const frameArt = this.host.addSprite(`${name}FrameArt`, HERO_WEAR_GRID_FRAME_ASSET, 0, 0, cell, cell, node);
    if (!frameArt) {
      g.fillColor = rgba(Math.round(q.r * 0.18 + 8), Math.round(q.g * 0.18 + 8), Math.round(q.b * 0.18 + 8), 238);
      g.roundRect(-cell / 2, -cell / 2, cell, cell, 9 * scale);
      g.fill();
    }
    g.strokeColor = highlighted ? rgba(248, 206, 110, 250) : rgba(q.r, q.g, q.b, frameArt ? 165 : 190);
    g.lineWidth = (highlighted ? 3 : frameArt ? 1.3 : 1.6) * scale;
    g.roundRect(-cell / 2, -cell / 2, cell, cell, 9 * scale);
    g.stroke();
    const iconAsset = equipIconAssetByCode(item.equipCode);
    if (iconAsset) {
      this.host.addSprite(`${name}Icon`, iconAsset, 0, 6 * scale, cell * 0.72, cell * 0.72, node);
    }
    const stripW = cell - 6 * scale;
    const strip = this.host.addChildPlainNode(node, `${name}Strip`, 0, -cell / 2 + 13 * scale, stripW, 20 * scale);
    const sg = strip.addComponent(Graphics);
    sg.fillColor = rgba(6, 5, 5, 205);
    sg.roundRect(-stripW / 2, -10 * scale, stripW, 20 * scale, 5 * scale);
    sg.fill();
    const nm = this.host.addChildLabel(strip, `${name}Name`, safeText(item.equipName), 0, 0, 16 * scale, rgba(q.r, q.g, q.b, 255), new Size(stripW - 6 * scale, 22 * scale));
    nm.overflow = Label.Overflow.SHRINK;
    const level = item.enhanceLevel ?? 0;
    if (level > 0) {
      const badge = this.host.addChildLabel(node, `${name}Level`, `+${level}`, cell / 2 - 6 * scale, cell / 2 - 13 * scale, 17 * scale, rgba(250, 224, 150), new Size(36 * scale, 24 * scale), HorizontalTextAlignment.RIGHT);
      badge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(badge, scale, true);
    }
    const wornOnThis = item.heroId === hero.id;
    const wornOnOther = item.heroId != null && !wornOnThis;
    if (wornOnThis || wornOnOther) {
      const wornW = 24 * scale;
      const worn = this.host.addChildPlainNode(node, `${name}Worn`, -cell / 2 + wornW / 2 + 4 * scale, cell / 2 - 13 * scale, wornW, 18 * scale);
      const wg = worn.addComponent(Graphics);
      wg.fillColor = wornOnThis ? rgba(30, 52, 34, 238) : rgba(28, 40, 58, 238);
      wg.roundRect(-wornW / 2, -9 * scale, wornW, 18 * scale, 4 * scale);
      wg.fill();
      wg.strokeColor = wornOnThis ? rgba(112, 196, 118, 180) : rgba(120, 164, 220, 180);
      wg.lineWidth = 1 * scale;
      wg.stroke();
      const wl = this.host.addChildLabel(worn, `${name}WornLabel`, wornOnThis ? '穿' : '他', 0, 0, 14 * scale, wornOnThis ? rgba(168, 224, 172) : rgba(168, 198, 236), new Size(wornW - 2 * scale, 22 * scale));
      wl.overflow = Label.Overflow.SHRINK;
    }
    return node;
  }

  // 悬浮装备详情(右栏行 hover):名称/品质/部位/属性/需求与穿戴状态,浮层显示在面板左侧。
  // 装备详情大卡(参考 Diablo 式 tooltip,2026-07-19):equip_info 框 + 基础属性(白)+ 特殊词条槽(档位色,P4 洗练后填真数据)
  // + 宝石孔位(稀有度开孔,P5 镶嵌)+ 系列描述 + 穿戴状态。设计见 docs/11。
  private showEquipTooltip(parent: Node, item: EquipmentItemVO, anchorX: number, anchorY: number, side: 'left' | 'right', scale: number): void {
    this.hideWearTooltip();
    if (!this.isNodeAlive(parent)) {
      return;
    }
    // 大卡实现在 EquipDetailCard(召唤结果共用);此处只做锚点换算与生命周期。
    const w = 400 * scale;
    const tipX = side === 'left' ? anchorX - w / 2 : anchorX + w / 2;
    const tipY = clamp(anchorY, -96 * scale, 96 * scale);
    this.wearTooltipNode = renderEquipDetailCard(this.host, parent, item, tipX, tipY, scale);
  }

  private hideWearTooltip(): void {
    if (this.isNodeAlive(this.wearTooltipNode)) {
      this.wearTooltipNode!.destroy();
    }
    this.wearTooltipNode = null;
  }

  // 技能页右栏:技能组全量列表独占面板。
  private renderSkillPanel(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, scale: number): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyHeroDetailSkillPanel', x, y, width, height);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = rgba(6, 6, 8, 198);
    pg.rect(-width / 2, -height / 2, width, height);
    pg.fill();
    this.drawInfoPanelFrame(panel, 'LobbyHeroDetailSkillPanelArt', width, height, scale);
    this.renderSkillList(panel, hero, width, height, scale, height / 2 - 34 * scale);
  }

  // 升星页右栏(bt-hero-beautify 2026-10-04 重排):区块标题 → 星级对照带(当前星 ››› 下一星,左右对称)→ 觉醒卡 →
  // 「升星解锁」被动列表(图标 + 名称 + 触发标签 + 状态胶囊 + 描述)→ 底部消耗带 + 双按钮。
  private renderStarPanel(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, width: number, height: number, scale: number): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyHeroDetailStarPanel', x, y, width, height);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = rgba(6, 6, 8, 198);
    pg.rect(-width / 2, -height / 2, width, height);
    pg.fill();
    this.drawInfoPanelFrame(panel, 'LobbyHeroDetailStarPanelArt', width, height, scale);
    const phone = !!this.phoneFrame;
    const titleY = height / 2 - (phone ? 29 : 40) * scale;
    this.addSectionTitle(panel, 'StarSection', '升星', width, titleY, scale);
    const star = Math.max(1, Math.min(STAR_MAX, Math.trunc(hero.star || 1)));
    const maxed = star >= STAR_MAX;
    const rowW = width - 44 * scale;
    // 星级对照带:左半当前星、右半目标星(底色略亮),中间三连箭头;两侧各自在半区内居中。
    const bandH = (phone ? 58 : 64) * scale;
    const bandY = titleY - 17 * scale - (phone ? 6 : 10) * scale - bandH / 2;
    const band = this.host.addChildPlainNode(panel, 'StarHeaderBand', 0, bandY, rowW, bandH);
    const arrowHalf = 34 * scale;
    const bg = band.addComponent(Graphics);
    bg.fillColor = rgba(16, 12, 11, 218);
    bg.roundRect(-rowW / 2, -bandH / 2, rowW, bandH, 8 * scale);
    bg.fill();
    bg.fillColor = rgba(58, 40, 16, 150);
    bg.roundRect(arrowHalf, -bandH / 2 + 4 * scale, rowW / 2 - arrowHalf - 4 * scale, bandH - 8 * scale, 6 * scale);
    bg.fill();
    bg.strokeColor = rgba(176, 138, 76, 170);
    bg.lineWidth = 1.3 * scale;
    bg.roundRect(-rowW / 2, -bandH / 2, rowW, bandH, 8 * scale);
    bg.stroke();
    const groupMaxW = rowW / 2 - arrowHalf - 24 * scale;
    this.renderStarGroup(band, 'StarCur', star, -(rowW / 2 + arrowHalf) / 2, 0, groupMaxW, scale);
    const chevrons = this.host.addChildPlainNode(band, 'StarArrow', 0, 0, arrowHalf * 2, bandH).addComponent(Graphics);
    chevrons.strokeColor = maxed ? rgba(130, 116, 90, 200) : rgba(248, 206, 112, 245);
    chevrons.lineWidth = 3 * scale;
    for (let i = -1; i <= 1; i += 1) {
      const cx = i * 13 * scale;
      chevrons.moveTo(cx - 4 * scale, 9 * scale);
      chevrons.lineTo(cx + 5 * scale, 0);
      chevrons.lineTo(cx - 4 * scale, -9 * scale);
    }
    chevrons.stroke();
    if (maxed) {
      const maxLabel = this.host.addChildLabel(band, 'StarNext', '已满星', (rowW / 2 + arrowHalf) / 2, 0, 22 * scale, rgba(196, 182, 152), new Size(groupMaxW, 30 * scale));
      maxLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(maxLabel, scale, true);
    } else {
      this.renderStarGroup(band, 'StarNext', star + 1, (rowW / 2 + arrowHalf) / 2, 0, groupMaxW, scale);
    }
    // 觉醒卡(2026-09-25):紧跟星级带。
    const awakenTop = bandY - bandH / 2 - 8 * scale;
    const awakenShift = this.renderStarAwakenCard(panel, hero, width, awakenTop, scale);
    // 升星解锁:逐条展示真实被动技能(与技能页同一数据源 resolveSkills)。
    const unlockStars = resolveHeroPassiveUnlockStars(hero.rarity);
    const passives = resolveSkills(hero).filter((skill) => skill.kind !== 'ultimate');
    const listTitleY = awakenTop - awakenShift - 2 * scale - 17 * scale;
    this.addSectionTitle(panel, 'StarUnlockSection', '升星解锁', width, listTitleY, scale);
    const rowH = (phone ? 54 : 62) * scale;
    const rowStride = rowH + (phone ? 6 : 8) * scale;
    const nameY = (phone ? 13 : 15) * scale;
    const descY = (phone ? -13 : -13) * scale;
    const rowsTop = listTitleY - 17 * scale - 6 * scale;
    unlockStars.forEach((needStar, index) => {
      const ry = rowsTop - rowH / 2 - index * rowStride;
      const unlocked = star >= needStar;
      const skill = passives[index] ?? null;
      const row = this.host.addChildPlainNode(panel, `StarUnlockRow_${index}`, 0, ry, rowW, rowH);
      const rg = row.addComponent(Graphics);
      rg.fillColor = unlocked ? rgba(44, 36, 16, 228) : rgba(18, 16, 14, 220);
      rg.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 7 * scale);
      rg.fill();
      rg.strokeColor = unlocked ? rgba(214, 172, 92, 200) : rgba(96, 84, 64, 140);
      rg.lineWidth = 1.3 * scale;
      rg.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 7 * scale);
      rg.stroke();
      // 左侧圆槽:已解锁 = 技能图标,未解锁 = 挂锁。
      const iconX = -rowW / 2 + 32 * scale;
      const iconSize = (phone ? 28 : 32) * scale;
      const slotR = iconSize * 0.62 + 3 * scale;
      const slotG = this.host.addChildPlainNode(row, 'IconSlot', iconX, 0, slotR * 2, slotR * 2).addComponent(Graphics);
      slotG.fillColor = rgba(7, 7, 8, 215);
      slotG.circle(0, 0, slotR);
      slotG.fill();
      slotG.strokeColor = unlocked ? rgba(178, 140, 78, 190) : rgba(110, 96, 70, 150);
      slotG.lineWidth = 1.2 * scale;
      slotG.circle(0, 0, slotR);
      slotG.stroke();
      if (unlocked || !renderLockGlyph(this.host, row, 'Lock', iconX, 0, iconSize * 0.86, true)) {
        this.drawSkillIcon(row, iconX, 0, iconSize, scale, index + 1, skill);
      }
      // 右上状态胶囊:已解锁(绿)/ ★N 解锁(灰金)。
      const pillW = (phone ? 98 : 84) * scale;
      const pillH = (phone ? 26 : 22) * scale;
      const pillX = rowW / 2 - 10 * scale - pillW / 2;
      const pill = this.host.addChildPlainNode(row, 'StatePill', pillX, nameY, pillW, pillH);
      const pillG = pill.addComponent(Graphics);
      pillG.fillColor = unlocked ? rgba(26, 58, 30, 235) : rgba(30, 26, 22, 235);
      pillG.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pillG.fill();
      pillG.strokeColor = unlocked ? rgba(124, 204, 124, 210) : rgba(140, 118, 82, 170);
      pillG.lineWidth = 1.2 * scale;
      pillG.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pillG.stroke();
      const stateLabel = this.host.addChildLabel(pill, 'State', unlocked ? '已解锁' : `★${needStar} 解锁`, 0, 0, 15 * scale, unlocked ? rgba(156, 232, 150) : rgba(198, 176, 132), new Size(pillW - 12 * scale, pillH - 2 * scale));
      stateLabel.overflow = Label.Overflow.SHRINK;
      const textX = -rowW / 2 + 64 * scale;
      const textRight = pillX - pillW / 2 - 10 * scale;
      const textW = textRight - textX;
      const nameLabel = this.host.addChildLabel(row, 'Name', skill ? skill.name : `被动技能 ${index + 1}`, textX, nameY, 18 * scale, unlocked ? rgba(248, 222, 160) : rgba(176, 164, 138), new Size(textW * 0.5, 24 * scale), HorizontalTextAlignment.LEFT);
      nameLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(nameLabel, scale, false);
      // 标签只留触发口径("被动 · 45% 触发" / "★4 解锁 · 42% 触发" → "45% 触发"),解锁星级已由右侧胶囊表达。
      const tagText = skill && skill.tag ? safeText(skill.tag.split(' · ').pop() ?? '') : '';
      if (tagText && !/解锁|待配置/.test(tagText)) {
        const tagLabel = this.host.addChildLabel(row, 'Tag', tagText, textRight, nameY, 15 * scale, unlocked ? rgba(206, 180, 124) : rgba(150, 140, 118), new Size(textW * 0.46, 22 * scale), HorizontalTextAlignment.RIGHT);
        tagLabel.overflow = Label.Overflow.SHRINK;
      }
      const descLabel = this.host.addChildLabel(row, 'Desc', skill ? skill.description : '升星解锁本被动技能。', textX, descY, 15 * scale, unlocked ? rgba(210, 196, 164) : rgba(140, 130, 112), new Size(rowW / 2 - 12 * scale - textX, (phone ? 26 : 22) * scale), HorizontalTextAlignment.LEFT);
      descLabel.overflow = Label.Overflow.SHRINK;
    });
    // 底部消耗带:同名碎片(背包 HERO_FRAGMENT:<heroCode>)+ 金币,数值为 hero_star_config 镜像;不足只把对应数字标红,不再重复写"材料不足"。
    const view: HeroDockCostView = { title: '已满星', costs: [], hint: '' };
    if (!maxed) {
      const fragNeed = STAR_UP_FRAGMENT_COSTS[star - 1] ?? 0;
      const goldNeed = STAR_UP_GOLD_COSTS[star - 1] ?? 0;
      const bag = this.host.currentLobbyBagState();
      const fragCode = `HERO_FRAGMENT:${(hero.heroCode || '').toUpperCase()}`;
      const fragOwned = bag.groups.flatMap((group) => group.items).find((item) => (item.itemCode || '').toUpperCase() === fragCode)?.itemCount ?? 0;
      const goldOwned = Number(this.host.currentLobbyProfile().gold) || 0;
      const shardTier = (hero.rarity || '').toLowerCase();
      const shardIcon = `ui/bag/ai/icon_shard_${['r', 'sr', 'ssr', 'ur'].includes(shardTier) ? shardTier : 'n'}/spriteFrame`;
      view.title = `升至 ${star + 1}★`;
      view.costs = [
        { icon: shardIcon, text: `${formatInteger(fragOwned)}/${formatInteger(fragNeed)}`, lack: fragOwned < fragNeed },
        { icon: 'ui/bag/ai/icon_gold/spriteFrame', text: formatInteger(goldNeed), lack: goldOwned < goldNeed },
      ];
      // 一键预估:按逐星消耗表推算当前碎片 + 金币可达星级。
      let estStar = star;
      let fragLeft = fragOwned;
      let goldLeft = goldOwned;
      while (estStar < STAR_MAX) {
        const needF = STAR_UP_FRAGMENT_COSTS[estStar - 1] ?? Number.MAX_SAFE_INTEGER;
        const needG = STAR_UP_GOLD_COSTS[estStar - 1] ?? Number.MAX_SAFE_INTEGER;
        if (fragLeft < needF || goldLeft < needG) {
          break;
        }
        fragLeft -= needF;
        goldLeft -= needG;
        estStar += 1;
      }
      if (estStar > star) {
        view.hint = `当前材料可一键升至 ${estStar} 星`;
      } else if (fragOwned < fragNeed) {
        view.hint = `还差 ${formatInteger(fragNeed - fragOwned)} 个同名碎片`;
        view.blocked = 'lack';
      } else {
        view.hint = `还差 ${formatInteger(goldNeed - goldOwned)} 金币`;
        view.blocked = 'lack';
      }
    }
    this.renderCostDock(panel, 'Star', width, height, scale, view);
    const pending = this.host.isLobbyHeroLevelUpPending(hero.id);
    const enabled = !pending && !maxed;
    this.renderDockButtons(panel, width, height, scale, [
      { name: 'StarUpButton', labelName: 'Label', text: pending ? '处理中' : maxed ? '已满星' : '升 星', enabled, dim: view.blocked === 'lack', clickableWhenDisabled: false, onClick: () => this.host.starUpLobbyHero(hero.id) },
      { name: 'StarUpAutoButton', labelName: 'Label', text: pending ? '处理中' : maxed ? '已满星' : '一键升星', enabled, dim: view.blocked === 'lack', clickableWhenDisabled: false, onClick: () => this.host.autoStarUpLobbyHero(hero.id) },
    ]);
  }

  /** 一组星星 + "N星" 数字,整体以 cx 为中心(星级对照带左右两半各用一次);星图缺失时退回文字。 */
  private renderStarGroup(parent: Node, name: string, star: number, cx: number, y: number, maxWidth: number, scale: number): void {
    const display = starDisplayV3(star);
    const band = starBandTextRgbOf(display.color);
    const phone = !!this.phoneFrame;
    const fontSize = (phone ? 20 : 18) * scale;
    const text = `${star}星`;
    const labelW = estimateTextWidth(text, fontSize) + 6 * scale;
    const gap = 4 * scale;
    const labelGap = 8 * scale;
    const starSize = Math.min((phone ? 34 : 36) * scale, (maxWidth - labelW - labelGap - gap * (display.count - 1)) / display.count);
    const starsW = display.count * starSize + (display.count - 1) * gap;
    const left = cx - (starsW + labelGap + labelW) / 2;
    let anyStar = false;
    for (let index = 0; index < display.count; index += 1) {
      if (this.host.addSprite(`${name}Star_${index}`, starBandAssetOf(display.color), left + starSize / 2 + index * (starSize + gap), y, starSize, starSize, parent)) {
        anyStar = true;
      }
    }
    if (!anyStar) {
      const fallback = this.host.addChildLabel(parent, `${name}Text`, `${star} ★`, cx, y, 22 * scale, rgba(band[0], band[1], band[2]), new Size(maxWidth, 30 * scale));
      fallback.overflow = Label.Overflow.SHRINK;
      this.applyOutline(fallback, scale, true);
      return;
    }
    const numLabel = this.host.addChildLabel(parent, `${name}Num`, text, left + starsW + labelGap, y, fontSize, rgba(band[0], band[1], band[2]), new Size(labelW + 8 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
    numLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(numLabel, scale, true);
  }

  private renderFooter(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    // 顶部持有资源:货币栏同款格式——独立胶囊 + 左侧图标 + 数值(金币/英雄经验书),避让右上关闭钮。
    const profile = this.host.currentLobbyProfile();
    const bag = this.host.currentLobbyBagState();
    const bookCount = bag.groups.flatMap((group) => group.items).find((item) => item.itemCode === 'HERO_EXP_BOOK')?.itemCount ?? 0;
    renderTopCurrencyBar(this.host, parent, width / 2, height / 2, scale, [
      { key: 'gold', icon: 'ui/bag/ai/icon_gold/spriteFrame', value: formatDecimalValue(profile.gold) },
      { key: 'books', icon: 'ui/bag/ai/icon_expbook/spriteFrame', value: formatInteger(bookCount) },
    ], 130);
  }

  // 面板底部升级坞(bt-hero-beautify 2026-10-04):消耗带(标题 + 图标数字,不足的数字标红)+ 一行提示 + 升级 / 一键升级双按钮。
  private renderLevelUpDock(panel: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const view = this.resolveLevelUpCostView(hero);
    this.renderCostDock(panel, 'LobbyHeroDetailLevelUp', width, height, scale, view);
    const pending = this.host.isLobbyHeroLevelUpPending(hero.id);
    const enabled = !pending && view.blocked !== 'cap';
    const dim = view.blocked === 'lack';
    this.renderDockButtons(panel, width, height, scale, [
      { name: 'LobbyHeroDetailLevelUpButton', labelName: 'LobbyHeroDetailLevelUpButtonLabel', text: pending ? '升级中' : '升 级', enabled, dim, clickableWhenDisabled: true, onClick: () => this.host.levelUpLobbyHero(hero.id) },
      { name: 'LobbyHeroDetailLevelUpAutoButton', labelName: 'LobbyHeroDetailLevelUpAutoButtonLabel', text: pending ? '处理中' : '一键升级', enabled, dim, clickableWhenDisabled: true, onClick: () => this.host.autoLevelUpLobbyHero(hero.id) },
    ]);
  }

  /**
   * 底部消耗带 + 提示行(属性页升级 / 升星页共用)。带内一行居中:标题 + 若干"图标 数字"(不足标红);
   * 提示行可空(读取中 / 已满星),为空时消耗带下移到提示行的位置,不留空洞。
   */
  private renderCostDock(panel: Node, name: string, width: number, height: number, scale: number, view: HeroDockCostView): void {
    const phone = !!this.phoneFrame;
    const bottom = -height / 2;
    const hasHint = view.hint.length > 0;
    const bandW = width - 44 * scale;
    const bandH = (phone ? 32 : 30) * scale;
    const bandY = bottom + (hasHint ? (phone ? 121 : 127) : (phone ? 104 : 108)) * scale;
    const band = this.host.addChildPlainNode(panel, `${name}CostBand`, 0, bandY, bandW, bandH);
    const g = band.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 8, 190);
    g.roundRect(-bandW / 2, -bandH / 2, bandW, bandH, bandH / 2);
    g.fill();
    g.strokeColor = rgba(150, 118, 66, 130);
    g.lineWidth = 1 * scale;
    g.roundRect(-bandW / 2, -bandH / 2, bandW, bandH, bandH / 2);
    g.stroke();
    const fontSize = (phone ? 20 : 17) * scale;
    const iconSize = (phone ? 26 : 24) * scale;
    const iconGap = 4 * scale;
    const segGap = 20 * scale;
    const titleW = estimateTextWidth(view.title, fontSize);
    const costWs = view.costs.map((cost) => iconSize + iconGap + estimateTextWidth(cost.text, fontSize));
    const total = titleW + costWs.reduce((sum, w) => sum + w + segGap, 0);
    if (view.costs.length <= 0 || total > bandW - 24 * scale) {
      // 只有标题(读取中 / 已达上限 / 已满星)或极端长数字:整行一个居中标签,缩字兜底。
      const text = [view.title, ...view.costs.map((cost) => cost.text)].join('  ·  ');
      const lack = view.costs.some((cost) => cost.lack);
      const label = this.host.addChildLabel(band, `${name}Cost`, text, 0, 0, fontSize, lack ? rgba(240, 124, 100) : rgba(236, 212, 160), new Size(bandW - 24 * scale, bandH - 4 * scale));
      label.overflow = Label.Overflow.SHRINK;
    } else {
      let cursor = -total / 2;
      const title = this.host.addChildLabel(band, `${name}Cost`, view.title, cursor, 0, fontSize, rgba(244, 216, 150), new Size(titleW + 10 * scale, bandH - 4 * scale), HorizontalTextAlignment.LEFT);
      title.overflow = Label.Overflow.SHRINK;
      this.applyOutline(title, scale, false);
      cursor += titleW + segGap;
      view.costs.forEach((cost, index) => {
        const shown = this.host.addSprite(`${name}CostIcon_${index}`, cost.icon, cursor + iconSize / 2, 0, iconSize, iconSize, band);
        const textX = shown ? cursor + iconSize + iconGap : cursor;
        const value = this.host.addChildLabel(band, `${name}CostValue_${index}`, cost.text, textX, 0, fontSize, cost.lack ? rgba(244, 118, 96) : rgba(240, 228, 196), new Size(costWs[index] - iconSize - iconGap + 10 * scale, bandH - 4 * scale), HorizontalTextAlignment.LEFT);
        value.overflow = Label.Overflow.SHRINK;
        this.applyOutline(value, scale, false);
        cursor += costWs[index] + segGap;
      });
    }
    if (hasHint) {
      const hint = this.host.addChildLabel(panel, `${name}Est`, view.hint, 0, bottom + (phone ? 90 : 97) * scale, 15 * scale, rgba(186, 170, 134), new Size(width - 48 * scale, (phone ? 26 : 20) * scale));
      hint.overflow = Label.Overflow.SHRINK;
    }
  }

  /**
   * 底部双按钮(红 = 单次,暗 = 一键):按钮图是一体构图,只等比缩放——两枚同高、各按自身宽高比取宽,分别在左右半栏居中;
   * 离面板底边留 18~22 的呼吸距。clickableWhenDisabled:升级按钮保留 Button 组件(新手引导要找它),仅置灰不可点。
   */
  private renderDockButtons(panel: Node, width: number, height: number, scale: number, buttons: { name: string; labelName: string; text: string; enabled: boolean; clickableWhenDisabled: boolean; dim?: boolean; onClick: () => void }[]): void {
    const phone = !!this.phoneFrame;
    const colGap = 12 * scale;
    const colW = (width - 48 * scale - colGap) / 2;
    const btnH = Math.min((phone ? 54 : 58) * scale, colW / HERO_BTN_LEVEL_ASPECT);
    const btnY = -height / 2 + (phone ? 18 : 23) * scale + btnH / 2;
    buttons.forEach((spec, index) => {
      const aspect = index === 0 ? HERO_BTN_LEVEL_ASPECT : HERO_BTN_LEVEL_AUTO_ASPECT;
      const btnW = btnH * aspect;
      const x = (index === 0 ? -1 : 1) * (colGap / 2 + colW / 2);
      const btn = this.host.addChildPlainNode(panel, spec.name, x, btnY, btnW, btnH);
      const art = this.host.addSprite(`${spec.name}Art`, index === 0 ? HERO_AI_BTN_LEVEL_ASSET : HERO_AI_BTN_LEVEL_AUTO_ASSET, 0, 0, btnW, btnH, btn);
      // bt2-hero-refine:不可用(已到上限 / 处理中)或材料不足时按钮去色压暗,和上方"已达上限 / 还差 N"的文字不再打架。
      const dimmed = !spec.enabled || spec.dim === true;
      if (!art) {
        const bg = btn.addComponent(Graphics);
        bg.fillColor = dimmed ? rgba(42, 36, 32, 225) : index === 0 ? rgba(122, 42, 30, 235) : rgba(26, 21, 18, 235);
        bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 9 * scale);
        bg.fill();
        bg.strokeColor = dimmed ? rgba(120, 108, 88, 150) : rgba(184, 138, 62, 210);
        bg.lineWidth = 1.8 * scale;
        bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 9 * scale);
        bg.stroke();
      } else if (dimmed) {
        art.grayscale = true;
        art.color = rgba(150, 146, 140, 255);
      }
      if (spec.enabled || spec.clickableWhenDisabled) {
        const component = btn.addComponent(Button);
        component.interactable = spec.enabled;
      }
      if (spec.enabled) {
        btn.on(Button.EventType.CLICK, spec.onClick, this);
        this.host.applyImageButtonFeedback(btn, 1.025, 0.97);
      }
      const label = this.host.addChildLabel(btn, spec.labelName, spec.text, 0, 1 * scale, 20 * scale, dimmed ? rgba(166, 158, 142) : rgba(255, 240, 200), new Size(btnW - 56 * scale, btnH - 8 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, true);
    });
  }

  // 组装升级消耗展示:读取中 / 已达上限 / 消耗明细(持有不足的那一项标红)+ 一键可达等级预估。
  private resolveLevelUpCostView(hero: LobbyHeroItemVO): HeroDockCostView {
    const detail = this.host.currentLobbyHeroDetailInfo?.() ?? null;
    if (!detail || detail.id !== hero.id) {
      return { title: '升级消耗读取中…', costs: [], hint: '' };
    }
    const level = detail.level ?? hero.level;
    const cap = detail.heroLevelCap ?? 0;
    if (cap > 0 && level >= cap) {
      // 已到上限时不再显示"一键升级:材料读取中…"(上限态服务器不下发下一级消耗,旧文案会一直停在读取中)。
      return { title: `已达等级上限 Lv.${cap}`, costs: [], hint: '提升玩家等级可解锁更高上限', blocked: 'cap' };
    }
    const books = detail.nextLevelExpBookCost ?? null;
    const gold = detail.nextLevelGoldCost ?? null;
    if (books === null || gold === null) {
      return { title: '升级消耗读取中…', costs: [], hint: '' };
    }
    const bag = this.host.currentLobbyBagState();
    const ownedBooks = bag.groups.flatMap((group) => group.items).find((item) => item.itemCode === 'HERO_EXP_BOOK')?.itemCount ?? 0;
    const ownedGold = Number(this.host.currentLobbyProfile().gold) || 0;
    const lackBooks = bag.loaded && ownedBooks < books;
    const lackGold = ownedGold < gold;
    // 一键升级预估:按下一级消耗保守估算(逐级成本递增,实际以服务器逐级扣减为准)。
    let est = level + Math.min(Math.floor(ownedBooks / Math.max(1, books)), Math.floor(ownedGold / Math.max(1, gold)));
    if (cap > 0) {
      est = Math.min(est, cap);
    }
    let hint = '';
    if (est > level) {
      hint = `当前材料约可一键升至 Lv.${est}`;
    } else if (lackBooks) {
      hint = `还差 ${formatInteger(books - ownedBooks)} 本英雄经验书`;
    } else if (lackGold) {
      hint = `还差 ${formatInteger(gold - ownedGold)} 金币`;
    }
    return {
      title: `升至 Lv.${level + 1}`,
      costs: [
        { icon: 'ui/bag/ai/icon_expbook/spriteFrame', text: `x${formatInteger(books)}`, lack: lackBooks },
        { icon: 'ui/bag/ai/icon_gold/spriteFrame', text: formatInteger(gold), lack: lackGold },
      ],
      hint,
      blocked: est > level ? undefined : lackBooks || lackGold ? 'lack' : undefined,
    };
  }

  private resolveLevelUpHoldingsText(): string {
    const profile = this.host.currentLobbyProfile();
    const bag = this.host.currentLobbyBagState();
    const gold = formatDecimalValue(profile.gold);
    if (bag.loading && !bag.loaded) {
      return `持有：金币 ${gold} / 英雄经验书读取中`;
    }
    if (bag.error && !bag.loaded) {
      return `持有：金币 ${gold} / 英雄经验书暂不可读`;
    }
    const bookCount = bag.groups
      .flatMap((group) => group.items)
      .find((item) => item.itemCode === 'HERO_EXP_BOOK')?.itemCount ?? 0;
    return `持有：金币 ${gold} / 英雄经验书 x${formatInteger(bookCount)}`;
  }

  private renderStarRow(parent: Node, hero: LobbyHeroItemVO, x: number, y: number, maxWidth: number, scale: number): void {
    // 星级五档进阶星行(2026-07-22 v2):5 槽=5 档(绿蓝紫橙红),满档满亮/当前档半亮+进度点/未达灰星;
    // 右侧保留 "N星" 数字。1星不再是"1实2空"的空落感,15星=五色全亮。
    const realStar = Math.max(1, Math.trunc(hero.star || 1));
    // v3(用户定稿):每 5 星一轮,轮内逐颗点亮,升到换色星整排换色(绿→蓝→紫…)。
    const display = starDisplayV3(realStar);
    const starSize = 40 * scale;
    const gap = 9 * scale;
    const totalWidth = display.count * starSize + Math.max(0, display.count - 1) * gap;
    const band = starBandTextRgbOf(display.color);
    const firstX = x - totalWidth / 2 + starSize / 2;
    let anyStar = false;
    for (let index = 0; index < display.count; index += 1) {
      if (this.host.addSprite(`LobbyHeroDetailStar_${index}`, starBandAssetOf(display.color), firstX + index * (starSize + gap), y, starSize, starSize, parent)) {
        anyStar = true;
      }
    }
    // 星图未到货(首开瞬间):只留居中的"N星"文字,不再画金色底条(看起来像出错);图到货后整页重绘换成星星。
    const numLabel = this.host.addChildLabel(parent, 'LobbyHeroDetailStarNum', `${realStar}星`, anyStar ? x + totalWidth / 2 + 22 * scale : x, y, 17 * scale, rgba(band[0], band[1], band[2]), new Size(60 * scale, 22 * scale), anyStar ? HorizontalTextAlignment.LEFT : HorizontalTextAlignment.CENTER);
    numLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(numLabel, scale, true);
  }

  private addBadge(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, fill: Color, scale: number): void {
    const badge = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const graphics = badge.addComponent(Graphics);
    graphics.fillColor = new Color(fill.r, fill.g, fill.b, 182);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.strokeColor = rgba(225, 174, 82, 178);
    graphics.stroke();
    const label = this.host.addChildLabel(badge, `${name}Label`, text, 0, 0, 16 * scale, rgba(252, 223, 148), new Size(width - 10 * scale, height));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, false);
  }

  private drawArtStageDepth(parent: Node, width: number, height: number, scale: number): void {
    const depth = this.host.addChildPlainNode(parent, 'LobbyHeroDetailStageDepth', 0, 0, width, height);
    const graphics = depth.addComponent(Graphics);
    const groundY = this.resolveHeroDetailGroundY(height);
    // 中部黑色半透明大框按需求移除,只保留脚底椭圆阴影。
    graphics.fillColor = rgba(0, 0, 0, 148);
    graphics.ellipse(0, groundY, width * 0.34, height * 0.06);
    graphics.fill();
  }

  private resolveHeroDetailGroundY(height: number): number {
    return -height * 0.43;
  }

  private drawPanelShade(parent: Node, width: number, height: number, scale: number): void {
    const shade = this.host.addChildPlainNode(parent, 'LobbyHeroDetailPanelShade', 0, 0, width, height);
    const graphics = shade.addComponent(Graphics);
    graphics.fillColor = rgba(0, 0, 0, 64);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
  }

  private drawFallbackPortrait(parent: Node, hero: LobbyHeroItemVO, width: number, height: number, scale: number): void {
    const graphics = parent.addComponent(Graphics);
    graphics.fillColor = hero.protagonist ? rgba(48, 12, 14, 210) : rgba(20, 20, 24, 210);
    graphics.circle(0, height * 0.18, width * 0.16);
    graphics.fill();
    graphics.fillColor = hero.protagonist ? rgba(169, 42, 39, 214) : rgba(110, 102, 85, 200);
    graphics.moveTo(0, height * 0.1);
    graphics.lineTo(width * 0.24, -height * 0.28);
    graphics.lineTo(width * 0.08, -height * 0.42);
    graphics.lineTo(-width * 0.08, -height * 0.42);
    graphics.lineTo(-width * 0.24, -height * 0.28);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(230, 178, 82, 160);
    graphics.lineWidth = Math.max(1, 1.2 * scale);
    graphics.moveTo(-width * 0.22, height * 0.02);
    graphics.lineTo(width * 0.24, -height * 0.24);
    graphics.stroke();
  }

  private drawSkillIcon(parent: Node, x: number, y: number, size: number, scale: number, index: number, skill?: HeroDetailSkill | null): void {
    // bt-hero-beautify:图标铺满调用方画的圆槽(半径 size*0.62+3)。大招 = 红底金环 + 四芒星徽;被动 = 按效果类型的属性圆徽。
    const ultimate = skill ? skill.kind === 'ultimate' : index === 0;
    const slotR = size * 0.62 + 3 * scale;
    if (ultimate) {
      const icon = this.host.addChildPlainNode(parent, `LobbyHeroDetailSkillIcon_${index}`, x, y, slotR * 2, slotR * 2);
      const g = icon.addComponent(Graphics);
      g.fillColor = rgba(104, 22, 18, 245);
      g.circle(0, 0, slotR - 1 * scale);
      g.fill();
      g.fillColor = rgba(164, 40, 28, 210);
      g.circle(0, 0, slotR * 0.68);
      g.fill();
      g.strokeColor = rgba(240, 196, 104, 240);
      g.lineWidth = Math.max(1.2, 2 * scale);
      g.circle(0, 0, slotR - 1 * scale);
      g.stroke();
      const emblemH = slotR * 1.5;
      if (this.host.addSprite('Emblem', HERO_AI_SECTION_STAR_ASSET, 0, 0, emblemH * (232 / 244), emblemH, icon)) {
        return;
      }
      const cross = this.host.addChildPlainNode(icon, 'EmblemFallback', 0, 0, slotR, slotR).addComponent(Graphics);
      cross.fillColor = rgba(250, 222, 150, 240);
      cross.moveTo(0, slotR * 0.62);
      cross.lineTo(slotR * 0.2, 0);
      cross.lineTo(0, -slotR * 0.62);
      cross.lineTo(-slotR * 0.2, 0);
      cross.close();
      cross.fill();
      return;
    }
    if (skill?.icon && this.host.addSprite(`LobbyHeroDetailSkillIcon_${index}`, skill.icon, x, y, slotR * 2, slotR * 2, parent)) {
      return;
    }
    const icon = this.host.addChildPlainNode(parent, `LobbyHeroDetailSkillIcon_${index}`, x, y, size, size);
    const graphics = icon.addComponent(Graphics);
    graphics.fillColor = rgba(34, 28, 22, 235);
    graphics.circle(0, 0, size * 0.45);
    graphics.fill();
    graphics.strokeColor = rgba(222, 168, 72, 188);
    graphics.lineWidth = Math.max(1, 1.1 * scale);
    graphics.circle(0, 0, size * 0.43);
    graphics.stroke();
    const gem = this.host.addChildPlainNode(icon, 'Gem', 0, 0, size, size).addComponent(Graphics);
    gem.fillColor = rgba(232, 204, 140, 230);
    gem.moveTo(0, size * 0.24);
    gem.lineTo(size * 0.16, 0);
    gem.lineTo(0, -size * 0.24);
    gem.lineTo(-size * 0.16, 0);
    gem.close();
    gem.fill();
  }

  private rarityColor(rarity: string): Color {
    const key = rarity.toUpperCase();
    if (key === 'UR') {
      return rgba(236, 74, 52);
    }
    if (key === 'EX') {
      return rgba(240, 196, 84);
    }
    if (key === 'SSR') {
      return rgba(197, 74, 38);
    }
    if (key === 'SR') {
      return rgba(104, 78, 176);
    }
    if (key === 'R') {
      return rgba(61, 100, 160);
    }
    return rgba(94, 82, 60);
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 230 : 188);
    label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
  }
}

// 词条编码 → 全称(2026-07-22:简称"技强/Boss伤/深渊"玩家看不懂,统一改可读全称)。未知编码回退后端 name。
const HERO_AFFIX_SHORT_LABELS: Record<string, string> = {
  HP_BONUS: '生命加成',
  ATK_BONUS: '攻击加成',
  DEF_BONUS: '防御加成',
  SPD_BONUS: '速度加成',
  CRIT_RATE: '暴击率',
  CRIT_DMG: '暴击伤害',
  SKILL_POW: '技能伤害提升',
  LIFESTEAL: '攻击吸血',
  BOSS_DMG: '对Boss伤害',
  ABYSS_INC: '深渊挂机收益',
  DROP_RATE: '战利品掉落率',
};

// 特性值显示口径(2026-07-22,docs/06):后端词条值为统一"点数"(8~200);
// 比率类词条按 点数÷10 显示为百分比(暴击率133点→+13.3%,战斗接入时同口径),平值类直接 +点数。
const HERO_AFFIX_PERCENT_CODES = new Set(['CRIT_RATE', 'CRIT_DMG', 'SKILL_POW', 'LIFESTEAL', 'BOSS_DMG', 'ABYSS_INC', 'DROP_RATE']);
function heroAffixValueText(code: string, rawValue: number): string {
  const safe = Math.round((Number(rawValue) || 0) * 10) / 10;
  if (HERO_AFFIX_PERCENT_CODES.has((code || '').toUpperCase())) {
    const pct = Math.round(safe) / 10;
    return `+${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
  }
  return `+${safe}`;
}

// 装备品质顺序与显示名(装备 2.0);导出供锻造工坊页复用,与服务器 PlayerEquipmentServiceImpl 常量对齐。
export const EQUIP_QUALITY_ORDER: string[] = ['WHITE', 'GREEN', 'BLUE', 'PURPLE', 'GOLD', 'RED'];
export const EQUIP_FUSE_BASE_CHANCE: Record<string, number> = { WHITE: 0.85, GREEN: 0.7, BLUE: 0.5, PURPLE: 0.3, GOLD: 0.15 };
export const EQUIP_FUSE_GOLD_COST: Record<string, number> = { WHITE: 200, GREEN: 500, BLUE: 1000, PURPLE: 2000, GOLD: 5000 };

// 品质工具/部位表已抽至 EquipDetailCard(与召唤结果详情共用),经上方 re-export 保持既有导入路径不变。

// 装备属性摘要:非零属性 + 特级词条简述,一行紧凑展示。
export function describeEquipAttrs(item: EquipmentItemVO): string {
  const parts: string[] = [];
  if (item.attrHp > 0) {
    parts.push(`生命+${formatInteger(item.attrHp)}`);
  }
  if (item.attrAttack > 0) {
    parts.push(`攻击+${formatInteger(item.attrAttack)}`);
  }
  if (item.attrDefense > 0) {
    parts.push(`防御+${formatInteger(item.attrDefense)}`);
  }
  if (item.attrSpeed > 0) {
    parts.push(`速度+${formatInteger(item.attrSpeed)}`);
  }
  if (item.attrCrit > 0) {
    parts.push(`暴击+${formatInteger(item.attrCrit)}`);
  }
  const effects = safeText(item.specialEffectsJson ?? '');
  if (effects.includes('combo')) {
    parts.push('连击');
  }
  if (effects.includes('execute')) {
    parts.push('斩杀');
  }
  return parts.length > 0 ? parts.join(' · ') : '无属性';
}

// 词条品质配色(D 灰 / C 绿 / B 蓝 / A 紫 / S 金 / SS 橙 / SSS 红)。
function affixQualityColor(quality: string): { r: number; g: number; b: number } {
  switch (safeText(quality).toUpperCase()) {
    case 'SSS':
      return { r: 232, g: 92, b: 82 };
    case 'SS':
      return { r: 236, g: 150, b: 70 };
    case 'S':
      return { r: 232, g: 190, b: 92 };
    case 'A':
      return { r: 172, g: 122, b: 216 };
    case 'B':
      return { r: 92, g: 152, b: 220 };
    case 'C':
      return { r: 110, g: 190, b: 122 };
    default:
      return { r: 158, g: 152, b: 140 };
  }
}

// 养成徽章:幸运 / 觉醒阶段 / 大招等级。缺省用占位,保证可读。
function resolveGrowthChips(hero: LobbyHeroItemVO): { label: string; value: string }[] {
  const luck = typeof hero.luckValue === 'number' ? hero.luckValue : 0;
  const awaken = typeof hero.awakenStatus === 'number' ? hero.awakenStatus : 0;
  const ult = typeof hero.ultimateSkillLevel === 'number' ? hero.ultimateSkillLevel : 1;
  return [
    { label: '幸运', value: `${luck}` },
    { label: '觉醒', value: awaken > 0 ? `${awaken} 阶` : '未觉醒' },
    { label: '大招', value: `Lv${ult}` },
  ];
}

export function resolveAttributes(hero: LobbyHeroItemVO): HeroDetailAttribute[] {
  const star = Math.max(1, hero.star);
  const level = Math.max(1, hero.level);
  const power = Math.max(0, hero.power);
  // 优先展示后端下发的真实有效属性(base_* × 等级/星系数,与战力/战斗同口径);
  // 旧库/离线数据缺字段时回退到早期客户端估算,避免面板空白。
  const hp = hero.attrHp ?? Math.round(power * 1.55 + level * 120 + star * 420);
  const attack = hero.attrAttack ?? Math.round(power * 0.32 + level * 42 + star * 135);
  const defense = hero.attrDefense ?? Math.round(power * 0.22 + level * 36 + star * 108);
  const speed = hero.attrSpeed ?? 112 + star * 3;
  const crit = hero.attrCrit ?? 14 + star * 2;
  return [
    { label: '生命', value: formatInteger(hp) },
    { label: '攻击', value: formatInteger(attack) },
    { label: '防御', value: formatInteger(defense) },
    { label: '速度', value: `${speed}` },
    { label: '暴击', value: `${crit}%` },
    { label: '韧性', value: `${10 + star * 2}%` },
  ];
}

// 各英雄终极技能名(2026-07-18):按名号与职业定位设计;缺省(未来新英雄)回退"终极技能"。
// v2(2026-09-07 专属技能体系):随专属特效换代微调 7 个名字,与特效主题强绑定更好记
// (冰原巨浪/月神/阿努比斯/朔夜魔女/狂裂长矛/鬼剑士/T0 强化名)。
// v3(2026-09-12 用户反馈「技能名要和技能动画匹配」):按预览页实拍特效画面重命名 15 个——
// 龙骑金色横斩→裂空龙斩、米迦勒金雷矛→雷霆裁决、妮克丝血影漩涡→血影绞杀、凯恩换圣枪光爆→圣枪穿刺 等。
const HERO_ULTIMATE_SKILL_NAMES: Record<string, string> = {
  // UR
  UR_ARTHAS: '永夜·裂空龙斩',
  UR_ATLAS: '圣铠·天启旋盾',
  UR_AURELIA: '苍翎·翠翎风暴',
  UR_EVELYN: '深渊·冰狱湮灭',
  UR_NYX: '影刃·血影绞杀',
  UR_SERAPHINA: '晨星·月华圣辉',
  // SSR
  SSR_KANE: '白银·圣枪穿刺',
  SSR_LIVIA: '夜烬·焚世之焰',
  SSR_MICHAEL: '圣光·雷霆裁决',
  SSR_RON: '灰烬·杀星一闪',
  // SR
  SR_ABYSS_06: '深渊·冥狱之环',
  SR_BLADE_04: '断刃·旋刃风暴',
  SR_PALADIN_02: '圣盾·圣纹壁垒',
  SR_PRIEST_01: '银色·圣愈祷言',
  SR_SNIPER_05: '峡谷·狂裂爆矢',
  SR_WITCH_03: '契约·朔夜降临',
  // R
  R_ACOLY_02: '祈福·微光庇护',
  R_CULT_05: '低语·暗蚀诅咒',
  R_GUARD_07: '城门·盾锋回斩',
  R_PATROL_01: '王国·誓约结界',
  R_RANGER_06: '荒原·猎鹰降临',
  R_SCOUT_03: '灰谷·血镰绝影',
};

// 导出:战斗大招施放的全屏名字横幅也用同一命名(单一数据源)。
export function resolveUltimateSkillName(heroCode: string | null | undefined): string {
  const code = (heroCode || '').trim().toUpperCase();
  return HERO_ULTIMATE_SKILL_NAMES[code] ?? '终极技能';
}

// 技能组(docs/25 技能系统):1 终极技能(大招,默认解锁 Lv1)+ N 被动(升星逐条解锁)。
// 技能组总数由稀有度决定:R/SR = 3(1+2),SSR/UR = 5(1+4);被动顺序 = 技能配置 [护盾?, ...effects]。
export function resolveSkills(hero: LobbyHeroItemVO): HeroDetailSkill[] {
  if (hero.protagonist) {
    return [
      { name: '圣契裁决', tag: '大招 · 默认', description: '能量集满后手动释放的核心技能,默认解锁。', kind: 'ultimate' },
      { name: '圣契斩击', tag: '普攻', description: '攻击形态默认开放，对单体目标造成暗金斩击伤害。', icon: HERO_SKILL_ICON_BY_EFFECT.atkUp },
      { name: '誓约战意', tag: '被动', description: '主角在队首时提升本次预演的压制感与生存展示。', icon: HERO_SKILL_ICON_BY_EFFECT.splash },
      { name: '守御/祷言形态', tag: '锁定', description: '防御形态与辅助形态后续通过主线剧情道具解锁。', locked: true },
    ];
  }
  const kit: HeroDetailSkill[] = [];
  // 1) 终极技能(大招):拥有即默认解锁 Lv1,战斗可手动释放;觉醒提升等级上限。
  const ultLevel = typeof hero.ultimateSkillLevel === 'number' ? hero.ultimateSkillLevel : 1;
  const ultName = resolveUltimateSkillName(hero.heroCode);
  // 文案口径(2026-08-05 优化):标题只留技能名(标签已有"大招");倍率写实际百分点
  // 增量(基础 260% 的每级 15% = +39 个百分点,直接展示 +39%)。
  // 上限并入等级标签(Lv5/5),觉醒细节由升级弹窗承载——卡片描述压回两行内不挤。
  const ultAwakened = hero.awakenStatus === 1;
  const ultPct = Math.round(260 * ultimateDamageScale(ultLevel));
  const ultStepPct = Math.round(260 * ultimateDamageScale(2)) - Math.round(260 * ultimateDamageScale(1));
  // T0 标识(2026-09-07 专属技能体系):每稀有度一名"档位天花板",描述里点明毕业定位。
  const t0Suffix = isGuardT0Hero(hero.heroCode) ? ' ◆本稀有度天花板·毕业之选' : '';
  kit.push({
    name: ultName,
    tag: `大招 · Lv${ultLevel}/${ultimateCap(ultAwakened)}`,
    description: `能量集满后手动释放,造成 ${ultPct}% 攻击伤害,每升 1 级 +${ultStepPct}%。${t0Suffix}`,
    kind: 'ultimate',
  });
  // 2) 被动技能:按稀有度定条数(R/SR 2 条 / SSR/UR 4 条),按升星阶梯逐条解锁。
  const unlockStars = resolveHeroPassiveUnlockStars(hero.rarity);
  const passives = resolveHeroSpecialSkills(hero); // 有序:护盾?, ...概率效果
  const currentStar = Math.max(1, hero.star);
  unlockStars.forEach((needStar, index) => {
    const unlocked = currentStar >= needStar;
    const def = passives[index];
    if (!unlocked) {
      if (def) {
        // 锁定态同样展示真实技能与数值,玩家能看到升星目标的具体收益。
        kit.push({ ...def, tag: `★${needStar} 解锁 · ${def.tag}`, kind: 'passive', locked: true });
      } else {
        kit.push({ name: `被动技能 ${index + 1}`, tag: `★${needStar} 解锁`, description: `升到 ${needStar} 星解锁本被动技能。`, kind: 'passive', locked: true });
      }
    } else if (def) {
      kit.push({ ...def, tag: `被动 · ${def.tag}`, kind: 'passive' });
    } else {
      // 已达星级但该英雄此被动位尚未配表:占位,不误导为已解锁效果。
      kit.push({ name: `被动技能 ${index + 1}`, tag: '被动 · 待配置', description: '本被动技能位已解锁,具体效果待策划配表(特殊属性 / BUFF / 属性加成)。', kind: 'passive' });
    }
  });
  return kit;
}

// 从英雄战斗技能配置派生详情页技能条目;触发概率按该英雄稀有度实算(与战斗一致)。
// 优先用**后端下发**的 `hero.skillConfig`(hero_battle_skill_config);缺省(旧服务端)回退客户端占位表。
// 连击/斩杀不在此(走装备/宝石)。护盾强度%与触发概率的公式仍在客户端表现层(按稀有度)。
function resolveHeroSpecialSkills(hero: LobbyHeroItemVO): HeroDetailSkill[] {
  const delivered = hero.skillConfig;
  const fallback = delivered ? null : resolveBattleHeroSkillProfile(hero.heroCode);
  const shieldScope: 'single' | 'team' | null = delivered
    ? delivered.energyShieldScope
    : (fallback?.energyShield?.scope ?? null);
  const effects: Array<{ type: string; baseChance: number; magnitude: number }> = delivered
    ? delivered.effects
    : (fallback?.effects ?? []);
  const skills: HeroDetailSkill[] = [];
  if (shieldScope) {
    const scope = shieldScope === 'team' ? '全体' : '单体';
    const pct = Math.round(resolveEnergyShieldHpRatio(shieldScope, hero.rarity) * 100);
    skills.push({ name: '能量护盾', tag: scope, description: `开场为${scope}我方叠一层护盾（约最大生命 ${pct}%），受击先扣盾再扣血。`, icon: HERO_SKILL_ICON_BY_EFFECT.shield });
  }
  effects.forEach((effect) => {
    const chance = Math.round(resolveSkillTriggerChance(effect.baseChance, hero.rarity) * 100);
    const entry = describeHeroSkillEffect(effect, chance);
    if (entry) {
      skills.push({ ...entry, icon: HERO_SKILL_ICON_BY_EFFECT[effect.type] });
    }
  });
  return skills;
}

function describeHeroSkillEffect(effect: { type: string; magnitude: number }, chancePercent: number): HeroDetailSkill | null {
  const tag = `${chancePercent}% 触发`;
  const pct = Math.round(effect.magnitude * 100);
  switch (effect.type) {
    case 'lifesteal':
      return { name: '吸血', tag, description: `命中概率回复自身生命，回血量为该次伤害的 ${pct}%。` };
    case 'truePierce':
      return { name: '真伤穿透', tag, description: '命中概率无视目标防御，造成真实伤害。' };
    case 'freeze':
      return { name: '冰封冻结', tag, description: `命中概率冻结目标 ${effect.magnitude} 秒，期间无法行动。` };
    case 'stun':
      return { name: '眩晕', tag, description: `命中概率眩晕目标 ${effect.magnitude} 秒，期间无法行动。` };
    case 'splash':
      return { name: '溅射', tag, description: `命中概率对相邻敌人追加 ${pct}% 伤害。` };
    case 'reflect':
      return { name: '荆棘反弹', tag, description: `受击概率反弹 ${pct}% 伤害给攻击者。` };
    case 'atkUp':
      return { name: '力量强化', tag: '常驻', description: `攻击力提升 ${pct}%，解锁后战斗中永久生效。` };
    case 'hpUp':
      return { name: '生命强化', tag: '常驻', description: `最大生命提升 ${pct}%，解锁后战斗中永久生效。` };
    default:
      return null;
  }
}

function starText(star: number): string {
  const count = Math.max(1, Math.min(6, Math.trunc(star || 1)));
  return `${'★'.repeat(count)}${'☆'.repeat(Math.max(0, 6 - count))}`;
}

function sourceLabel(sourceType: string): string {
  if (sourceType === 'PROTAGONIST') {
    return '主角';
  }
  if (sourceType === 'ADMIN_GRANT') {
    return '后台补发';
  }
  if (sourceType === 'REWARD_GRANT') {
    return '奖励获得';
  }
  if (sourceType === 'GACHA') {
    return '已拥有英雄';
  }
  return '英雄';
}

function formatInteger(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return safe.toLocaleString('en-US');
}

function formatDecimalValue(value: number | string | null | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return Math.trunc(Math.max(0, numeric)).toLocaleString('en-US');
}
