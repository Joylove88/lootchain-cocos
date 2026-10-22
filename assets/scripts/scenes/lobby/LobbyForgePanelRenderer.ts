import {
  gfx,
  BlockInputEvents,
  Button,
  Color,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Node,
  RichText,
  ScrollView,
  Size,
  Sprite,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import type { EquipmentItemVO } from '../../api/EquipmentApi';
import type { LobbyBagPanelState } from '../../types/BagTypes';
import type { PlayerLobbyProfileVO } from '../../types/PlayerTypes';
import { safeText } from '../UiTextFormatter';
import { renderSceneBackButton, renderTopCurrencyBar } from '../UiSceneBackButton';
import { rgba, type UiLayout } from './LobbyHudTypes';
import { mountKitButton, mountKitSection } from '../UiKit';
import { drawRefCheckbox, drawRefPanelFallback, mountRefScrollBar, mountRefDialogBackdrop, mountRefLineFrame, REF_BAG_DLG, REF_CLOSE_RING_ASSET, REF_DETAIL_INNER_BG, mountRefButton, mountRefPlate, mountRefPlateButton, mountRefSliced, mountRefTitledPanel, REF_ICON_RING_ASSET, REF_INFO_BANNER, REF_KIT, REF_PLATE_DARK, REF_ROW, REF_ROW_SELECTED, REF_ULT, mountRefSolid, type RefKitItem } from '../UiRefKit';
import {
  describeEquipAttrs,
  equipQualityColor,
  equipQualityLabel,
  EQUIP_FUSE_BASE_CHANCE,
  EQUIP_FUSE_GOLD_COST,
  EQUIP_QUALITY_ORDER,
  HERO_EQUIP_SLOTS,
  LOBBY_HERO_DETAIL_BACKDROP_ASSET,
} from './LobbyHeroDetailPanelRenderer';
import { equipIconAssetByCode, equipIconAssetByQualitySlot, equipShowcaseAssetByCode, equipShowcaseAssetByQualitySlot } from './EquipIconAssets';
import { mountEquipIconBacking } from './EquipRarityShine';
import { parseGemCode, gemOpenSlots, gemUnsocketGold, gemIconAsset, gemTypeForSlot, GEM_TIER_QUALITY, GEM_TYPE_DISPLAY } from './EquipDetailCard';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { fitButtonLabel } from '../UiPrimitiveFactory';
import { FORGE_RESULT_FX, type ForgeFxKind } from './LobbyBattleAttackFxConfig';
import { mountLobbySpineFx, prewarmLobbySpineFx } from './LobbyUiSpineFx';

// AI 素材钩子(生成后按路径导入,meta 改 sprite-frame 即自动换装;缺图时走 Graphics 兜底)。
// 2026-10-15 按 GPT 原型(参考用户给的强化界面参考图)重做:熔炉背景 / 展示环 / 导航徽章 / 材料框 / 列表行 / 等级金牌(ui/forge/ref),
// 面板框与按钮用 ui/common/ref 套件(UiRefKit)。原图在 素材原始备份/ult-forge-ui-20261015。
const FORGE_REF_DIR = 'ui/forge/ref/';
export const FORGE_AI_BG_ASSET = `${FORGE_REF_DIR}forge_bg/spriteFrame`;
const FORGE_REF_EMBLEM_RING_ASSET = `${FORGE_REF_DIR}emblem_ring/spriteFrame`;
const FORGE_REF_NAV_ON_ASSET = `${FORGE_REF_DIR}nav_on/spriteFrame`;
const FORGE_REF_NAV_OFF_ASSET = `${FORGE_REF_DIR}nav_off/spriteFrame`;
const FORGE_REF_HAMMERS_ASSET = `${FORGE_REF_DIR}icon_hammers/spriteFrame`;
const FORGE_REF_LEVEL_PLAQUE_ASSET = `${FORGE_REF_DIR}level_plaque/spriteFrame`;
const FORGE_REF_NAMEPLATE_ASSET = 'ui/formation/ref/nameplate/spriteFrame';
const FORGE_REF_NAV_RAIL: RefKitItem = { path: `${FORGE_REF_DIR}nav_rail/spriteFrame`, w: 160, h: 1136, inset: [40, 40, 140, 140] };
const FORGE_REF_SLOT_FRAME: RefKitItem = { path: `${FORGE_REF_DIR}slot_frame/spriteFrame`, w: 192, h: 192, inset: [44, 44, 44, 44] };
const FORGE_REF_ROW_SELECTED: RefKitItem = { path: `${FORGE_REF_DIR}row_selected/spriteFrame`, w: 535, h: 120, inset: [40, 40, 32, 32] };
const FORGE_REF_ROW_NORMAL: RefKitItem = { path: `${FORGE_REF_DIR}row_normal/spriteFrame`, w: 538, h: 120, inset: [40, 40, 32, 32] };
// 2026-10-19 合成 / 分解 / 宝石页按 GPT 全新原型重做,逐件出的素材(原图备份 素材原始备份/ui-redesign-v3-20261019)
const FORGE_REF_FUSE_PORTAL = { path: `${FORGE_REF_DIR}fuse_portal/spriteFrame`, w: 900, h: 863, ringCyF: 0.08, ringDF: 0.5 };
const FORGE_REF_FUSE_SLOT_ASSET = `${FORGE_REF_DIR}fuse_slot/spriteFrame`;
const FORGE_REF_DEC_CRUCIBLE = { path: `${FORGE_REF_DIR}dec_crucible/spriteFrame`, w: 640, h: 540 };
const FORGE_REF_GEM_PEDESTAL = { path: `${FORGE_REF_DIR}gem_pedestal/spriteFrame`, w: 900, h: 372 };
const FORGE_REF_GEM_MEDALLION_EMPTY_ASSET = `${FORGE_REF_DIR}gem_medallion_empty/spriteFrame`;
const FORGE_REF_GEM_MEDALLION_FULL_ASSET = `${FORGE_REF_DIR}gem_medallion_full/spriteFrame`;
/** 稀有度粗彩边格框(2026-10-19 原型分解页逐件出:暗芯不透明 + 同色外发光,显示时放大 8% 让发光露在格外)。 */
const FORGE_REF_CELL_FRAMES: Record<string, string> = {
  WHITE: `${FORGE_REF_DIR}cell_white/spriteFrame`,
  GREEN: `${FORGE_REF_DIR}cell_green/spriteFrame`,
  BLUE: `${FORGE_REF_DIR}cell_blue/spriteFrame`,
  PURPLE: `${FORGE_REF_DIR}cell_purple/spriteFrame`,
  GOLD: `${FORGE_REF_DIR}cell_orange/spriteFrame`,
  RED: `${FORGE_REF_DIR}cell_red/spriteFrame`,
};
// 2026-10-20 合成页按 10-19 原型 1:1:原型去 UI 后的整屏背景(祭坛 / 金环在图里;ring = 金环圆心 / 半径,原型坐标)、名牌、概率石行、绿宝石
// 2026-10-22 去 AI 感:三页背景按 B「烟与影」重出(*_smoke),旧图留作回退;新合成背景的金环实测 (605,310) r160(内缘),比旧环大且靠上
const FORGE_FUSE_BG = { path: `${FORGE_REF_DIR}fuse_bg_smoke/spriteFrame`, w: 1870, h: 841, ring: { cx: 605, cy: 310, r: 160 } };
const FORGE_FUSE_NAME_PLATE = { path: `${FORGE_REF_DIR}fuse_name_plate/spriteFrame`, w: 900, h: 185 };
const FORGE_FUSE_LUCK_ROW: RefKitItem = { path: `${FORGE_REF_DIR}fuse_luck_row/spriteFrame`, w: 1200, h: 132, inset: [36, 36, 0, 0] };
const FORGE_FUSE_BEAMS = ['beam_a', 'beam_b', 'beam_c'].map((n) => `${FORGE_REF_DIR}fuse_${n}/spriteFrame`);
const FORGE_FUSE_SPARK = `${FORGE_REF_DIR}fuse_spark/spriteFrame`;
const FORGE_FUSE_ARROW = `${FORGE_REF_DIR}fuse_arrow/spriteFrame`;
const FORGE_FUSE_SOFT_SHADE = `${FORGE_REF_DIR}fuse_soft_shade/spriteFrame`;
const FORGE_FUSE_VIGNETTE = `${FORGE_REF_DIR}fuse_vignette/spriteFrame`;
const FORGE_FUSE_LUCK_GEM = `${FORGE_REF_DIR}fuse_luck_gem/spriteFrame`;
// 2026-10-20 分解页按 10-19 原型 1:1:去 UI 整屏背景、右栏熔炉插画(456×388 原型框)、筛选签(中性白边供染色 / 选中金边)、勾、提示章、标签底
const FORGE_DEC_BG = { path: `${FORGE_REF_DIR}dec_bg_smoke/spriteFrame`, w: 1870, h: 841 };
const FORGE_DEC_FURNACE = `${FORGE_REF_DIR}dec_furnace_smoke/spriteFrame`;
const FORGE_DEC_CHIP: RefKitItem = { path: `${FORGE_REF_DIR}dec_chip/spriteFrame`, w: 451, h: 100, inset: [30, 30, 0, 0] };
const FORGE_DEC_CHIP_ON: RefKitItem = { path: `${FORGE_REF_DIR}dec_chip_on/spriteFrame`, w: 441, h: 100, inset: [30, 30, 0, 0] };
const FORGE_DEC_CHECK = `${FORGE_REF_DIR}dec_check/spriteFrame`;
const FORGE_DEC_WARN = `${FORGE_REF_DIR}dec_warn/spriteFrame`;
const FORGE_DEC_TAG = `${FORGE_REF_DIR}dec_tag/spriteFrame`;
// 2026-10-21 宝石页按 10-19 原型 1:1:去 UI 整屏背景、右栏舞台(含底座,732×396 原型框)、V 孔锁章、行内暗空槽、序号圆章、名牌底
const REF_TITLE_STAR_ASSET = 'ui/common/ref/ult_title_star/spriteFrame';
const FORGE_GEM_BG = { path: `${FORGE_REF_DIR}gem_bg_smoke/spriteFrame`, w: 1870, h: 841 };
const FORGE_GEM_STAGE = `${FORGE_REF_DIR}gem_stage_smoke/spriteFrame`;
const FORGE_GEM_LOCK = `${FORGE_REF_DIR}gem_lock/spriteFrame`;
const FORGE_GEM_SOCKET_DIM = `${FORGE_REF_DIR}gem_socket_dim/spriteFrame`;
const FORGE_GEM_NUM_BADGE = `${FORGE_REF_DIR}gem_num_badge/spriteFrame`;
const FORGE_GEM_NAME_PLATE = `${FORGE_REF_DIR}gem_name_plate/spriteFrame`;
// 2026-10-21 强化页按原型 A 版 1:1:去 UI 背景(铁砧台 + 战锤 + 锁链)、部位页签图标、属性图标、筛选 / 排序小图标
// 2026-10-22 去 AI 感试验:安静版背景(降饱和 / 压高光 / 两侧面板区轻模糊),原图留作 enh_bg 可回退
// 2026-10-22 用户选 B「烟与影」:安静工坊(冷窗光 + 一点余烬),铁砧台面在原型 y≈450;enh_bg / enh_bg_calm 留作回退
const FORGE_ENH_BG = { path: `${FORGE_REF_DIR}enh_bg_smoke/spriteFrame`, w: 1870, h: 841 };
const FORGE_ENH_SLOT_ICONS: Record<string, string> = {
  WEAPON: `${FORGE_REF_DIR}enh_slot_weapon/spriteFrame`,
  HELMET: `${FORGE_REF_DIR}enh_slot_helmet/spriteFrame`,
  CHEST: `${FORGE_REF_DIR}enh_slot_chest/spriteFrame`,
  BOOTS: `${FORGE_REF_DIR}enh_slot_boots/spriteFrame`,
  RING: `${FORGE_REF_DIR}enh_slot_ring/spriteFrame`,
  NECKLACE: `${FORGE_REF_DIR}enh_slot_neck/spriteFrame`,
};
const FORGE_ENH_ATTR_ICONS: Record<string, string> = {
  攻击力: `${FORGE_REF_DIR}enh_attr_atk/spriteFrame`,
  生命值: `${FORGE_REF_DIR}enh_attr_hp/spriteFrame`,
  防御力: `${FORGE_REF_DIR}enh_attr_def/spriteFrame`,
  速度: `${FORGE_REF_DIR}enh_attr_spd/spriteFrame`,
  暴击: `${FORGE_REF_DIR}enh_attr_crit/spriteFrame`,
  强化属性: `${FORGE_REF_DIR}enh_attr_mult/spriteFrame`,
};
const FORGE_ENH_FUNNEL = `${FORGE_REF_DIR}enh_ic_funnel/spriteFrame`;
const FORGE_ENH_SORT = `${FORGE_REF_DIR}enh_ic_sort/spriteFrame`;
const FORGE_ENH_UP = `${FORGE_REF_DIR}enh_ic_up/spriteFrame`;
const FORGE_ENH_HAMMER = `${FORGE_REF_DIR}enh_ic_hammer/spriteFrame`;
const FORGE_ENH_STAR_ON = `${FORGE_REF_DIR}enh_star_on/spriteFrame`;
const FORGE_ENH_STAR_OFF = `${FORGE_REF_DIR}enh_star_off/spriteFrame`;
/** 2026-10-19 新素材并入锻造首开预载组(与 FORGE_PRELOAD_ASSETS 一起到货合并整刷,首开不再空着)。 */
export const FORGE_PRELOAD_ASSETS_V3: readonly string[] = [
  FORGE_REF_FUSE_PORTAL.path, FORGE_REF_FUSE_SLOT_ASSET, FORGE_REF_DEC_CRUCIBLE.path, FORGE_REF_GEM_PEDESTAL.path,
  FORGE_REF_GEM_MEDALLION_EMPTY_ASSET, FORGE_REF_GEM_MEDALLION_FULL_ASSET, ...Object.values(FORGE_REF_CELL_FRAMES),
  FORGE_FUSE_BG.path, FORGE_FUSE_NAME_PLATE.path, FORGE_FUSE_LUCK_ROW.path, FORGE_FUSE_LUCK_GEM, ...FORGE_FUSE_BEAMS, FORGE_FUSE_SPARK, FORGE_FUSE_ARROW, FORGE_FUSE_SOFT_SHADE, FORGE_FUSE_VIGNETTE,
  FORGE_DEC_BG.path, FORGE_DEC_FURNACE, FORGE_DEC_CHIP.path, FORGE_DEC_CHIP_ON.path, FORGE_DEC_CHECK, FORGE_DEC_WARN, FORGE_DEC_TAG,
  FORGE_GEM_BG.path, FORGE_GEM_STAGE, FORGE_GEM_LOCK, FORGE_GEM_SOCKET_DIM, FORGE_GEM_NUM_BADGE, FORGE_GEM_NAME_PLATE,
  ...['HP', 'ATK', 'DEF'].flatMap((t) => [1, 2, 3, 4, 5].map((n) => gemIconAsset(t, n))),
  FORGE_ENH_BG.path, ...Object.values(FORGE_ENH_SLOT_ICONS), ...Object.values(FORGE_ENH_ATTR_ICONS), FORGE_ENH_FUNNEL, FORGE_ENH_SORT, FORGE_ENH_UP, FORGE_ENH_STAR_ON, FORGE_ENH_STAR_OFF, FORGE_ENH_HAMMER,
];
export const FORGE_AI_ANVIL_ASSET = 'ui/forge/ai/forge_anvil/spriteFrame';
export const FORGE_AI_FUSE_ALTAR_ASSET = 'ui/forge/ai/fuse_altar/spriteFrame';
export const FORGE_AI_SLOT_FRAME_ASSET = 'ui/forge/ai/slot_frame/spriteFrame';
export const FORGE_AI_TAB_ACTIVE_ASSET = 'ui/forge/ai/tab_active/spriteFrame';
export const FORGE_AI_TAB_NORMAL_ASSET = 'ui/forge/ai/tab_normal/spriteFrame';
export const FORGE_AI_BUTTON_ASSET = 'ui/forge/ai/btn_forge/spriteFrame';
// 部位小图标(装备行/槽位用):素材一直没生成,当前全部走 Graphics 线稿(drawSlotGlyph)。
// 生成后放到 ui/forge/ai/icon_<部位> 并在这里登记即换装;不要登记不存在的路径(会预载失败、控制台刷黄字,2026-10-05)。
export const FORGE_AI_SLOT_ICON_ASSETS: Record<string, string> = {};
// 强化页参考图新增素材钩子(待生成;缺图 Graphics 兜底)。
export const FORGE_AI_ENHANCE_RING_ASSET = 'ui/forge/ai/enhance_ring/spriteFrame';
export const FORGE_AI_GUARD_ICON_ASSET = 'ui/forge/ai/icon_guard_rune/spriteFrame';
// 雕花面板底(九宫格,meta 已配边距)与右下导航徽章。
const FORGE_AI_NAV_PREFIX = 'ui/forge/ai/nav_forge_';
// 白色渐变衬底(生成图,上暗下亮圆角):运行时按品质色染色,垫在装备图后(参考图卡面质感)。
// 现成素材复用:货币胶囊/道具图标(bag 套件)。
const BAG_CURRENCY_BAR_ASSET = 'ui/common/ai/bag_currency_bar/spriteFrame';
const BAG_ICON_GOLD_ASSET = 'ui/bag/ai/icon_gold/spriteFrame';
const BAG_ICON_DIAMOND_ASSET = 'ui/bag/ai/icon_diamond/spriteFrame';
const BAG_ICON_ENHANCE_STONE_ASSET = 'ui/bag/ai/icon_enhance_low/spriteFrame';
const BAG_ICON_ENHANCE_STONE_HIGH_ASSET = 'ui/bag/ai/icon_enhance_high/spriteFrame';
const FORGE_AI_BLESS_ICON_ASSET = 'ui/forge/ai/icon_bless_stone/spriteFrame';
const FORGE_LUCK_STONE_ICON_ASSET = 'ui/bag/ai/icon_luck_stone/spriteFrame';
const FOOTER_DIVIDER_LEFT_ASSET = 'ui/common/ai/footer_divider_left/spriteFrame';
const FOOTER_DIVIDER_RIGHT_ASSET = 'ui/common/ai/footer_divider_right/spriteFrame';
const FOOTER_DIVIDER_ASPECT = 71 / 224;

/** 锻造页预载清单(登录时拉,进面板即整树一次成型;强化流光序列帧按需仍现拉)。 */
export const FORGE_PRELOAD_ASSETS: readonly string[] = [
  FORGE_AI_BG_ASSET,
  FORGE_REF_EMBLEM_RING_ASSET,
  FORGE_REF_NAV_ON_ASSET,
  FORGE_REF_NAV_OFF_ASSET,
  FORGE_REF_HAMMERS_ASSET,
  FORGE_REF_LEVEL_PLAQUE_ASSET,
  FORGE_REF_NAMEPLATE_ASSET,
  FORGE_REF_NAV_RAIL.path,
  FORGE_REF_SLOT_FRAME.path,
  FORGE_REF_ROW_SELECTED.path,
  FORGE_REF_ROW_NORMAL.path,
  REF_KIT.cardFrame.path,
  REF_KIT.btnPrimary.path,
  REF_KIT.btnSecondary.path,
  FORGE_AI_ANVIL_ASSET,
  FORGE_AI_FUSE_ALTAR_ASSET,
  FORGE_AI_SLOT_FRAME_ASSET,
  FORGE_AI_TAB_ACTIVE_ASSET,
  FORGE_AI_TAB_NORMAL_ASSET,
  FORGE_AI_BUTTON_ASSET,
  FORGE_AI_ENHANCE_RING_ASSET,
  FORGE_AI_GUARD_ICON_ASSET,
  FORGE_AI_BLESS_ICON_ASSET,
  `${FORGE_AI_NAV_PREFIX}enhance/spriteFrame`,
  `${FORGE_AI_NAV_PREFIX}fuse/spriteFrame`,
  `${FORGE_AI_NAV_PREFIX}decompose/spriteFrame`,
];
const STAR_FILLED_ASSET = 'ui/hero/c1812/star_filled/spriteFrame';
const STAR_EMPTY_ASSET = 'ui/hero/c1812/star_empty/spriteFrame';

// AI 图原始宽高比(2026-07-13 实测导入尺寸;一体构图素材只能等比显示,不许拉伸)。
const FORGE_BG_RATIO = 1672 / 941;
const FORGE_ANVIL_RATIO = 1920 / 1088;
const FORGE_ALTAR_RATIO = 1600 / 560;
const FORGE_TAB_RATIO = 1.875;
const FORGE_BUTTON_RATIO = 1983 / 793;
// 手机右缘竖排导航栏宽(徽章 72 + 名签;设计高 720 下 4 项竖排约 400 高)。
const FORGE_PHONE_RAIL_W = 96;
// 手机滚动网格(分解/宝石)实建封顶:每格 Graphics+图标+名签,上百格开屏会卡。
const FORGE_PHONE_GRID_CAP = 120;

// 强化规则(与服务器 PlayerEquipmentServiceImpl 对齐):上限 +20;+1~+10 耗强化石×(等级+1),
// +11~+20 耗高阶强化石×(等级-9);成功率 +11 起每级 -2%(下限 10%)。改数值必须两端同步。
const ENHANCE_MAX_LEVEL = 20;
const ENHANCE_HIGH_FROM_LEVEL = 10;
const ENHANCE_CHANCES = [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1];

// 分解产出预估(与服务器 DECOMPOSE_BASE_STONES + 投入 50% 返还同公式;权威结果以服务器回执为准)。
const DECOMPOSE_BASE_STONES: Record<string, number> = { WHITE: 1, GREEN: 2, BLUE: 4, PURPLE: 8, GOLD: 16, RED: 32 };
// 分解附加产出估算区间(镜像服务端祝福石/护符概率;概览栏展示范围用。金币奖励已移除防通胀)。
const DECOMPOSE_BLESS_RANGE: Record<string, [number, number]> = { PURPLE: [0, 1], GOLD: [0, 2], RED: [2, 3] };
const DECOMPOSE_RUNE_RANGE: Record<string, [number, number]> = { GOLD: [0, 1], RED: [0, 2] };


type ForgeTab = 'enhance' | 'fuse' | 'decompose' | 'gem';

/** 锻造工坊宿主:装备缓存/强化/合成/分解状态与操作全部由 GameRoot 提供(服务器权威)。 */
export interface LobbyForgePanelHost {
  /** 空装备时「去召唤」直达召唤页(2026-10-10)。 */
  openLobbyGachaScene?(): void;
  currentLobbyProfile(): PlayerLobbyProfileVO;
  currentLobbyBagState(): LobbyBagPanelState;
  currentLobbyHeroEquipState(): {
    dialogOpen: boolean;
    selectedSlot: string | null;
    items: EquipmentItemVO[];
    loading: boolean;
    busy: boolean;
  };
  currentLobbyEquipFuseState(): { dialogOpen: boolean; useLuckStone: boolean };
  currentLobbyEquipEnhanceState(): { targetId: number | null; useBless: boolean; useGuard: boolean };
  currentLobbyForgeState(): {
    tab: ForgeTab;
    enhanceSlotId: number | null;
    enhanceSlotTab: string | null;
    enhanceRarity: string | null;
    enhanceFilterOpen: boolean;
    enhanceSortAsc: boolean;
    autoRepeat: boolean;
    fuseSlotIds: number[];
    fuseResult: { success: boolean; chance: number; item: EquipmentItemVO } | null;
    decomposeResult: { count: number; stonesGained: number; blessGained: number; runeGained: number; gemsGained: string[] } | null;
    rerollOpen: boolean;
    decomposeSelectedIds: number[];
    decomposeRarity: string | null;
    decomposeEnhance: 'all' | 'zero' | 'plus';
    decomposeBatchOpen: boolean;
    gemEquipId: number | null;
    gemPickSlot: number | null;
  };
  /** 关闭合成结果弹窗。 */
  clearLobbyForgeFuseResult(): void;
  clearLobbyForgeDecomposeResult(): void;
  openLobbyForgeRerollDialog(): void;
  /** 强化材料不足时的提示(2026-09-22 用户反馈"金币不够点强化没任何提示");goldLacking=true 时根节点顺手打开金币商店。 */
  reportForgeMaterialShortfall(message: string, goldLacking: boolean): void;
  closeLobbyForgeRerollDialog(): void;
  rerollLobbyForgeEquipment(equipmentId: number): void;
  selectLobbyForgeTab(tab: ForgeTab): void;
  selectLobbyForgeEnhanceSlot(equipmentId: number | null): void;
  // 强化页(参考图版):部位页签 / 稀有度筛选下拉 / 排序方向 / 连续强化勾选。
  setLobbyForgeEnhanceSlotTab(slot: string | null): void;
  setLobbyForgeEnhanceRarity(quality: string | null): void;
  toggleLobbyForgeEnhanceFilterMenu(): void;
  toggleLobbyForgeEnhanceSort(): void;
  toggleLobbyForgeAutoRepeat(): void;
  setLobbyForgeFuseSlots(equipmentIds: number[]): void;
  fuseLobbyForgeSelected(): void;
  toggleLobbyForgeDecomposeSelect(equipmentId: number): void;
  setLobbyForgeDecomposeRarity(quality: string | null): void;
  setLobbyForgeDecomposeEnhance(filter: 'all' | 'zero' | 'plus'): void;
  setLobbyForgeDecomposeBatchOpen(open: boolean): void;
  selectLobbyForgeGemEquip(equipmentId: number | null): void;
  setLobbyForgeGemPickSlot(slotIndex: number | null): void;
  socketLobbyForgeGem(equipmentId: number, slotIndex: number, gemCode: string): void;
  unsocketLobbyForgeGem(equipmentId: number, slotIndex: number): void;
  setLobbyForgeDecomposeSelection(equipmentIds: number[]): void;
  decomposeLobbyForgeSelected(): void;
  toggleLobbyEquipFuseLuckStone(): void;
  toggleLobbyEquipEnhanceBless(): void;
  toggleLobbyEquipEnhanceGuard(): void;
  enhanceLobbyEquipment(equipmentId: number): void;
  /** 自动强化:连续强化到失败/满级/材料不足(沿用当前祝福石/护符开关)。 */
  autoEnhanceLobbyEquipment(equipmentId: number): void;
  closeLobbyForgePanel(): void;
  createUiNode(name: string): Node;
  /** 持久浮层(挂根 Canvas,不随整页刷新清理)上建节点:锻造结果特效用。 */
  createPersistentFxNode(name: string): Node;
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
 * 锻造工坊(导航栏"锻造"):强化/合成/分解三选项卡,默认强化。
 * 强化=左列选装备放入铸造台;合成=三槽一键放入;分解=背包式网格多选(稀有度/强化筛选,单次 ≤20 件)。
 * 全部写入走服务器装备接口,页面无 spine,状态变化整页重绘。
 */
export class LobbyForgePanelRenderer {
  // 强化页左列滚动位置:整页重绘后恢复,避免每次选装备列表跳回顶部。
  private enhanceListScrollY: number | null = null;
  // 手机版式状态(每次 render 刷新):phone=设计高 720;overlayRoot=整页面板(弹层挂这里居中);
  // bodyOffsetX=页签内容容器相对面板的横向偏移(右缘导航栏让位);phoneScrollY=各手机滚动区的滚动位置。
  private phone = false;
  private overlayRoot: Node | null = null;
  private bodyOffsetX = 0;
  /** 合成页整屏背景的缩放(原型像素 → 屏幕)与是否已显示;左侧祭坛区按它定位,和背景对齐。 */
  private fuseBgK = 0;
  /** 强化页当前展示的装备(洗练弹窗用)。 */
  private enhanceTargetId: number | null = null;
  private fuseBgShown = false;
  /** 本次渲染的锻造结果特效挂点 / 战力飘字挂点(面板坐标 = 内容根坐标):各页签按自己的主体区域写入。 */
  private fxAnchor = { x: 0, y: 30 };
  private powerAnchor: { x: number; y: number } | null = null;
  // 整页面板尺寸(手机全屏弹窗按它铺满;页签内容拿到的是扣掉导航栏后的 body 宽)。
  private stageW = 0;
  private stageH = 0;
  private readonly phoneScrollY = new Map<string, number>();
  // 手机全屏弹层(宝石选择/批量分解):页签渲染时登记,整页渲染末尾挂到最上层 group 上。
  private phoneOverlays: Array<(root: Node) => void> = [];

  constructor(private readonly host: LobbyForgePanelHost) {}

  /** 战力飘字挂点(锻造页主体区域上方);当前页签没写入时返回 null,调用方走默认位置。 */
  forgePowerAnchor(): { x: number; y: number } | null {
    return this.powerAnchor;
  }

  /** 打开锻造页时预热结果特效数据(首次强化不等加载)。 */
  prewarmForgeFx(): void {
    prewarmLobbySpineFx(Object.values(FORGE_RESULT_FX));
  }

  render(layout: UiLayout): void {
    const scale = Math.max(0.62, Math.min(1, layout.uiScale));
    const panelWidth = Math.max(320 * scale, layout.stageWidth);
    const panelHeight = Math.max(260 * scale, layout.stageHeight);
    const centerX = (layout.stageLeft + layout.stageRight) / 2;
    const centerY = (layout.stageTop + layout.stageBottom) / 2;

    const group = this.host.createUiNode('LobbyForgeSceneContent');
    group.setPosition(new Vec3(centerX, centerY, 0));
    group.addComponent(UITransform).setContentSize(new Size(panelWidth, panelHeight));
    group.addComponent(BlockInputEvents);

    const panel = this.host.addChildBeveledPanelNode(
      group,
      'LobbyForgeSceneFrame',
      0,
      0,
      panelWidth,
      panelHeight,
      rgba(5, 5, 8, 232),
      rgba(0, 0, 0, 0),
      18 * scale,
    );
    // 背景优先锻造专属 AI 图(等比 cover 裁切,不拉伸),未生成前回退英雄详情底图。
    const coverW = Math.max(panelWidth, layout.width + Math.abs(centerX) * 2);
    const coverH = Math.max(panelHeight, layout.height + Math.abs(centerY) * 2);
    const bgW = Math.max(coverW, coverH * FORGE_BG_RATIO);
    const bgH = bgW / FORGE_BG_RATIO;
    const bg = this.host.addSprite('LobbyForgeBackdropSprite', FORGE_AI_BG_ASSET, 0, 0, bgW, bgH, panel)
      ?? this.host.addSprite('LobbyForgeBackdropFallback', LOBBY_HERO_DETAIL_BACKDROP_ASSET, 0, 0, panelWidth, panelHeight, panel);
    if (bg) {
      // 轻压暗保留暖色炉火氛围(对齐参考图):整体薄罩 + 顶部/两侧暗角,中下部熔炉透光。
      const shadeNode = this.host.addChildPlainNode(panel, 'LobbyForgeBackdropShade', 0, 0, panelWidth, panelHeight);
      const shade = shadeNode.addComponent(Graphics);
      const sideW = (coverW - panelWidth) / 2 + panelWidth / 5;
      shade.fillColor = rgba(4, 3, 5, 136);
      shade.rect(-coverW / 2, -coverH / 2, coverW, coverH);
      shade.fill();
      shade.fillColor = rgba(0, 0, 0, 40);
      shade.rect(-coverW / 2, panelHeight / 4, coverW, coverH / 2 - panelHeight / 4);
      shade.fill();
      shade.rect(-coverW / 2, -coverH / 2, sideW, coverH);
      shade.fill();
      shade.rect(coverW / 2 - sideW, -coverH / 2, sideW, coverH);
      shade.fill();
    }

    const forge = this.host.currentLobbyForgeState();
    const state = this.host.currentLobbyHeroEquipState();
    // 合成页:原型去 UI 后的整屏背景(祭坛 + 金环)盖在通用熔炉背景上,不压暗(用户认可原型的亮度);左侧控件按同一 k 对齐
    this.fuseBgK = 0;
    this.fuseBgShown = false;
    if (forge.tab === 'enhance') {
      // 2026-10-21 强化页按原型 A 版 1:1:去 UI 背景(铁砧台 + 战锤),同一 k 映射;铁砧台在背景里,装备 / 名牌等按原型坐标叠上
      const ek = Math.max(coverW / FORGE_ENH_BG.w, coverH / FORGE_ENH_BG.h);
      if (this.host.addSprite('LobbyForgeEnhBg', FORGE_ENH_BG.path, 0, 0, FORGE_ENH_BG.w * ek, FORGE_ENH_BG.h * ek, panel)) {
        this.fuseBgK = ek;
        mountRefSolid(this.host, panel, 'LobbyForgeEnhVeil', 0, 0, coverW, coverH, rgba(0, 0, 0, 40));
      }
    }
    if (forge.tab === 'gem') {
      // 2026-10-21 宝石页按原型 1:1:原型去 UI 背景(哥特熔炉大厅),同一 k 映射,薄罩
      const gk = Math.max(coverW / FORGE_GEM_BG.w, coverH / FORGE_GEM_BG.h);
      if (this.host.addSprite('LobbyForgeGemBg', FORGE_GEM_BG.path, 0, 0, FORGE_GEM_BG.w * gk, FORGE_GEM_BG.h * gk, panel)) {
        this.fuseBgK = gk;
        mountRefSolid(this.host, panel, 'LobbyForgeGemVeil', 0, 0, coverW, coverH, rgba(0, 0, 0, 40));
      }
    }
    if (forge.tab === 'decompose') {
      // 2026-10-20 分解页按原型 1:1:原型去 UI 背景(熔炉大厅 + 熔岩地面),与合成页同一 k 映射;面板压在上面,背景只薄罩
      const dk = Math.max(coverW / FORGE_DEC_BG.w, coverH / FORGE_DEC_BG.h);
      if (this.host.addSprite('LobbyForgeDecBg', FORGE_DEC_BG.path, 0, 0, FORGE_DEC_BG.w * dk, FORGE_DEC_BG.h * dk, panel)) {
        this.fuseBgK = dk;
        mountRefSolid(this.host, panel, 'LobbyForgeDecVeil', 0, 0, coverW, coverH, rgba(0, 0, 0, 40));
      }
    }
    if (forge.tab === 'fuse') {
      const fk = Math.max(coverW / FORGE_FUSE_BG.w, coverH / FORGE_FUSE_BG.h);
      this.fuseBgK = fk;
      this.fuseBgShown = !!this.host.addSprite('LobbyForgeFuseBg', FORGE_FUSE_BG.path, 0, 0, FORGE_FUSE_BG.w * fk, FORGE_FUSE_BG.h * fk, panel);
      if (this.fuseBgShown) {
        // 2026-10-20 用户「背景调暗些,不然主次不分」:整体薄罩 + 以法阵圆心为中心的暗角(中心透明,四周 / 右栏后最暗)
        mountRefSolid(this.host, panel, 'LobbyForgeFuseVeil', 0, 0, coverW, coverH, rgba(0, 0, 0, 40));
        const vig = FORGE_FUSE_BG.ring;
        const vigSize = 2920 * fk;
        const vigSprite = this.host.addSprite('LobbyForgeFuseVignette', FORGE_FUSE_VIGNETTE, (vig.cx - 935) * fk, (420.5 - vig.cy) * fk, vigSize, vigSize, panel);
        if (vigSprite) {
          vigSprite.color = rgba(0, 0, 0, 110);
        }
      }
    }
    // 手机横屏(设计高 720,2026-10-02 用户反馈「锻造界面也乱了」):右下圆形导航改为右缘竖排导航栏,
    // 页签内容整体挪进导航栏左侧的 body 容器(宽度扣掉导航栏),内容区上下都铺满;电脑端版面不变。
    const phone = isPhoneDesign();
    this.phone = phone;
    this.overlayRoot = panel;
    this.stageW = panelWidth;
    this.stageH = panelHeight;
    this.phoneOverlays = [];
    const railReserve = phone ? FORGE_PHONE_RAIL_W * scale + 10 * scale : 0;
    const tabWidth = panelWidth - railReserve;
    this.bodyOffsetX = -railReserve / 2;
    this.fxAnchor = { x: this.bodyOffsetX, y: 30 };
    this.powerAnchor = null;
    const body = phone ? this.host.addChildPlainNode(panel, 'LobbyForgeBody', this.bodyOffsetX, 0, tabWidth, panelHeight) : panel;
    // 强化页(参考图版):顶部为货币胶囊栏(金币/钻石/强化石),材料展示在中央石台;合成/分解/宝石页为五枚材料胶囊。
    if (forge.tab === 'enhance') {
      this.renderCurrencyBar(panel, panelWidth, panelHeight, scale);
    } else {
      this.renderHoldingsBar(panel, panelWidth, panelHeight, scale);
    }
    // 顶部页签取消,改右下角圆形功能导航(参考图);合成/分解内容区在底部给导航条让位。
    // 手机:持有栏并入标题行、导航在右缘,内容区顶到标题行下沿、底到安全边距。
    const contentTop = panelHeight / 2 - (phone ? 94 : 104) * scale;
    const contentBottom = phone ? -panelHeight / 2 + 16 * scale : forge.tab === 'enhance' ? -panelHeight / 2 + 26 * scale : -panelHeight / 2 + 180 * scale;
    if (state.loading && state.items.length <= 0) {
      const loading = this.host.addChildLabel(panel, 'LobbyForgeLoading', '装备读取中…', 0, 0, 22 * scale, rgba(218, 210, 190), new Size(panelWidth - 80 * scale, 36 * scale));
      loading.overflow = Label.Overflow.SHRINK;
    } else if (state.items.length <= 0) {
      this.renderEmptyCard(panel, scale);
    } else if (forge.tab === 'enhance') {
      this.renderEnhanceTab(body, state, forge, tabWidth, panelHeight, contentTop, contentBottom, scale);
    } else if (forge.tab === 'fuse') {
      this.renderFuseTab(body, state, forge, tabWidth, contentTop, contentBottom, scale);
    } else if (forge.tab === 'gem') {
      this.renderGemTab(body, state, forge, tabWidth, contentTop, contentBottom, scale);
    } else {
      this.renderDecomposeTab(body, state, forge, tabWidth, contentTop, contentBottom, scale);
    }
    if (phone) {
      this.renderForgeNavRail(panel, forge.tab, state.items, panelWidth, contentTop, contentBottom, scale);
    } else {
      this.renderForgeNav(panel, forge.tab, state.items, panelWidth, panelHeight, scale);
    }

    renderSceneBackButton(this.host, group, layout, 'LobbyForgeBackButton', () => this.host.closeLobbyForgePanel(), scale, forge.tab === 'enhance' ? '强化' : forge.tab === 'fuse' ? '合成' : forge.tab === 'gem' ? '宝石' : '分解', '强化：消耗强化石与金币提升装备等级，+10 起改用高阶强化石，上限 +20；+5 起失败会降 1 级，守护符可保级，祝福石 +20% 成功率。\n\n合成：3 件同部位同稀有度装备合成 1 件更高稀有度装备。\n\n分解：拆解多余装备返还强化石（含部分强化投入），炽红装备附带宝石。\n\n宝石：按装备稀有度开孔（绿1~红5），第 i 孔镶 i 阶宝石；低阶宝石 3 合 1 升阶（背包 → 合成）。');
    // 手机全屏弹层压在标题/关闭钮/导航栏之上(group 与 panel 同心,坐标通用)。
    this.phoneOverlays.forEach((draw) => draw(group));
    this.phoneOverlays = [];

    if (forge.fuseResult) {
      this.renderFuseResultDialog(group, forge.fuseResult, panelWidth, panelHeight, scale);
    }
    if (forge.decomposeResult) {
      this.renderDecomposeResultDialog(group, forge.decomposeResult, panelWidth, panelHeight, scale);
    }
    if (forge.rerollOpen) {
      const rerollTarget = state.items.find((item) => item.id === (forge.enhanceSlotId ?? this.enhanceTargetId)) ?? null;
      if (rerollTarget) {
        this.renderRerollDialog(group, rerollTarget, state.busy, panelWidth, panelHeight, scale);
      }
    }
  }

  /**
   * 锻造弹窗统一外壳(2026-10-21:旧版整块 Graphics 弹窗在原生上不出图 → 背包二级弹窗同款贴图外壳)。
   * 压暗 210 + 实底 + 实景底(暗罩 215)+ 细金框 + 红标题带(四芒星 + 标题)+ 金环关闭钮;返回弹窗节点、标题带下沿 y 与 FS 换算。
   */
  private mountForgeDialogShell(parent: Node, name: string, panelWidth: number, wPx: number, hPx: number, titleText: string, scale: number, onClose: () => void): { dialog: Node; bandBottom: number; FS: (v: number) => number; w: number; h: number } {
    const k = this.fuseBgK > 0 ? this.fuseBgK : Math.min(this.stageW / 1870, this.stageH / 841);
    const FS = (v: number): number => v * k;
    const dimW = Math.max(panelWidth, this.stageW) * 2;
    const dimH = Math.max(this.stageH, 1) * 2;
    const overlay = this.host.addChildPlainNode(parent, `${name}Overlay`, 0, 0, dimW, dimH);
    mountRefSolid(this.host, overlay, 'Fill', 0, 0, dimW, dimH, rgba(0, 0, 0, 210));
    overlay.addComponent(BlockInputEvents);
    const w = FS(wPx);
    const h = FS(hPx);
    const dialog = this.host.addChildPlainNode(overlay, name, 0, 0, w, h);
    dialog.addComponent(BlockInputEvents);
    mountRefSolid(this.host, dialog, 'Back', 0, 0, w, h, rgba(10, 8, 9, 244));
    mountRefDialogBackdrop(this.host, dialog, REF_DETAIL_INNER_BG, 0, 0, w, h, 215, true);
    mountRefLineFrame(this.host, dialog, 'Frame', w, h);
    const HB = REF_BAG_DLG.headerBand;
    const hk = w / HB.w;
    const bandH = (HB.bodyY1 - HB.bodyY0) * hk;
    const bandCy = h / 2 - FS(20) - bandH / 2;
    this.host.addSprite('Band', HB.path, 0, bandCy + ((HB.bodyY0 + HB.bodyY1) / 2 - HB.h / 2) * hk, HB.w * hk, HB.h * hk, dialog);
    const titleSize = FS(30);
    const titleW = titleText.length * titleSize * 1.05;
    this.host.addSprite('Star', REF_TITLE_STAR_ASSET, -titleW / 2 - FS(30), bandCy, FS(52), FS(52), dialog);
    const title = this.host.addChildLabel(dialog, 'Title', titleText, FS(6), bandCy, titleSize, rgba(255, 228, 156), new Size(titleW + FS(24), FS(44)));
    title.lineHeight = title.fontSize;
    title.isBold = true;
    this.applyOutline(title, scale, true);
    const closeSize = FS(56);
    const close = this.host.addChildPlainNode(dialog, 'Close', w / 2 - FS(36) - closeSize / 2, bandCy, closeSize + FS(10), closeSize + FS(10));
    this.host.addSprite('Art', REF_CLOSE_RING_ASSET, 0, 0, closeSize, closeSize, close);
    close.addComponent(Button);
    this.host.applyImageButtonFeedback(close, 1.08, 0.92);
    close.on(Button.EventType.CLICK, onClose, this);
    return { dialog, bandBottom: bandCy - bandH / 2, FS, w, h };
  }

  // 词条洗练弹窗(P4):当前词条(档位色/特级★)+ 消耗(洗练石+金币,不足红字)+ 洗练/关闭;洗练后弹窗保持打开看新词条。
  private renderRerollDialog(parent: Node, item: EquipmentItemVO, busy: boolean, panelWidth: number, panelHeight: number, scale: number): void {
    void panelHeight;
    const affixes = item.specialAffixes ?? [];
    const shell = this.mountForgeDialogShell(parent, 'ForgeRerollDialog', panelWidth, 1000, 640, '词条洗练', scale, () => this.host.closeLobbyForgeRerollDialog());
    const { dialog, FS, w, h } = shell;
    const PAD = FS(44);
    const q = equipQualityColor(item.quality);
    // 洗练结果特效对准弹窗中部(新词条列表);飘字在装备名下方
    this.fxAnchor = { x: 0, y: 0 };
    const nameY = shell.bandBottom - FS(38);
    this.powerAnchor = { x: 0, y: nameY - FS(40) };
    const lift = (c: number): number => Math.round(c + (255 - c) * 0.25);
    this.addRichLine(dialog, 'ForgeRerollName', `<color=#B8AE9C>${equipQualityLabel(item.quality)}  ·  </color><color=#${[q.r, q.g, q.b].map((c) => lift(c).toString(16).padStart(2, '0')).join('')}>${safeText(item.equipName)}${(item.enhanceLevel ?? 0) > 0 ? ` +${item.enhanceLevel}` : ''}</color>`, 0, nameY, FS(26), w - PAD * 2);

    // 当前词条:档位色 = 数值区间(绿<蓝<紫<橙<炽红),特级词条 ★
    const tierColorMap: Record<string, { r: number; g: number; b: number }> = {
      GREEN: { r: 126, g: 214, b: 126 },
      BLUE: { r: 108, g: 168, b: 236 },
      PURPLE: { r: 186, g: 126, b: 236 },
      ORANGE: { r: 240, g: 168, b: 86 },
      CRIMSON: { r: 238, g: 92, b: 70 },
    };
    const rowW = w - PAD * 2;
    const rowH = FS(56);
    const rowGap = FS(10);
    let cursor = nameY - FS(40) - rowH / 2;
    if (affixes.length === 0) {
      const empty = this.host.addChildLabel(dialog, 'ForgeRerollEmpty', '词条生成中,重新打开面板刷新。', 0, cursor, FS(22), rgba(200, 192, 176), new Size(rowW, FS(32)));
      empty.lineHeight = empty.fontSize;
      cursor -= rowH + rowGap;
    }
    affixes.slice(0, 5).forEach((affix, index) => {
      const tc = tierColorMap[(affix.tier || '').toUpperCase()] ?? tierColorMap.GREEN;
      const row = this.host.addChildPlainNode(dialog, `ForgeRerollAffix_${index}`, 0, cursor, rowW, rowH);
      if (!mountRefSliced(this.host, row, 'Art', affix.special ? REF_ROW_SELECTED : REF_ROW, 0, 0, rowW, rowH)) {
        drawRefPanelFallback(row, rowW, rowH, scale);
      }
      // 左侧档位色竖条
      mountRefSolid(this.host, row, 'Tier', -rowW / 2 + FS(14), 0, FS(6), rowH - FS(18), rgba(tc.r, tc.g, tc.b, 235));
      const label = this.host.addChildLabel(row, 'Label', `${affix.special ? '★ ' : ''}${affix.name}`, -rowW / 2 + FS(34), 0, FS(24), rgba(lift(tc.r), lift(tc.g), lift(tc.b), 255), new Size(rowW * 0.6, FS(32)), HorizontalTextAlignment.LEFT);
      label.lineHeight = label.fontSize;
      label.isBold = true;
      this.applyOutline(label, scale, true);
      const value = this.host.addChildLabel(row, 'Value', `+${affix.value}${affix.percent ? '%' : ''}`, rowW / 2 - FS(24), 0, FS(26), rgba(lift(tc.r), lift(tc.g), lift(tc.b), 255), new Size(FS(180), FS(34)), HorizontalTextAlignment.RIGHT);
      value.lineHeight = value.fontSize;
      value.isBold = true;
      this.applyOutline(value, scale, true);
      cursor -= rowH + rowGap;
    });

    // 底部:消耗行(洗练石 / 金币图标 + 持有 / 需要,不足红字)+ 说明 + 两钮
    const goldCost = ({ PURPLE: 500, GOLD: 2000, RED: 5000 } as Record<string, number>)[(item.quality || '').toUpperCase()] ?? 500;
    const bag = this.host.currentLobbyBagState();
    const stoneHeld = Number(bag.groups.flatMap((group) => group.items).find((entry) => (entry.itemCode || '').toUpperCase() === 'EQUIP_REROLL_STONE')?.itemCount ?? 0);
    const goldHeld = Number(this.host.currentLobbyProfile().gold) || 0;
    const lack = stoneHeld < 1 || goldHeld < goldCost;
    const btnH = FS(78);
    const btnY = -h / 2 + PAD + btnH / 2;
    const hintY = btnY + btnH / 2 + FS(26);
    const costY = hintY + FS(40);
    const icon = FS(36);
    const costParts: Array<{ icon: string; text: string; ok: boolean }> = [
      { icon: 'ui/bag/ai/icon_reroll_stone/spriteFrame', text: `洗练石 ×1(持有 ${formatInteger(stoneHeld)})`, ok: stoneHeld >= 1 },
      { icon: BAG_ICON_GOLD_ASSET, text: `金币 ×${formatInteger(goldCost)}`, ok: goldHeld >= goldCost },
    ];
    costParts.forEach((part, index) => {
      const cx = (index === 0 ? -1 : 1) * FS(170);
      this.host.addSprite(`ForgeRerollCostIcon_${index}`, part.icon, cx - FS(110), costY, icon, icon, dialog);
      const t = this.host.addChildLabel(dialog, `ForgeRerollCost_${index}`, part.text, cx - FS(84), costY, FS(23), part.ok ? rgba(244, 232, 204) : rgba(240, 118, 104), new Size(FS(240), FS(32)), HorizontalTextAlignment.LEFT);
      t.lineHeight = t.fontSize;
      this.applyOutline(t, scale, false);
    });
    const hint = this.host.addChildLabel(dialog, 'ForgeRerollHint', '整件重随全部词条;特级词条(连击 / 斩杀线等)橙装 10% / 红装 20% 概率', 0, hintY, FS(19), rgba(168, 160, 146), new Size(w - PAD * 2, FS(28)));
    hint.lineHeight = hint.fontSize;
    hint.overflow = Label.Overflow.SHRINK;
    const btn = (bName: string, text: string, x: number, bw: number, item2: RefKitItem, enabled: boolean, onClick: () => void): void => {
      const holder = this.host.addChildPlainNode(dialog, bName, x, btnY, FS(bw), btnH);
      mountRefPlate(this.host, holder, 'Art', item2, 0, 0, FS(bw), btnH);
      const label = this.host.addChildLabel(holder, 'Label', text, 0, FS(1), FS(30), enabled ? rgba(255, 240, 210) : rgba(206, 194, 176), new Size(FS(bw) * 0.6, btnH * 0.7));
      label.isBold = true;
      label.overflow = Label.Overflow.SHRINK;
      fitButtonLabel(label, btnH, 0.4);
      this.applyOutline(label, scale, true);
      if (enabled) {
        holder.addComponent(Button);
        holder.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(holder, 1.03, 0.97);
      } else {
        holder.addComponent(UIOpacity).opacity = 170;
      }
    };
    btn('ForgeRerollGo', busy ? '洗练中…' : lack ? '材料不足' : '洗 练', -FS(170), 300, REF_ULT.btnPrimary, !busy && !lack, () => this.host.rerollLobbyForgeEquipment(item.id));
    btn('ForgeRerollClose', '关 闭', FS(170), 280, REF_ULT.btnSecondary, !busy, () => this.host.closeLobbyForgeRerollDialog());
  }

  // 手机全屏弹窗尺寸(2026-10-02 用户拍板):铺满整页面板,左右留 24、上下留 18 安全边距。
  private phoneDialogSize(scale: number): { w: number; h: number } {
    return { w: this.stageW - 48 * scale, h: this.stageH - 36 * scale };
  }

  // 结果弹窗确定钮:召唤界面同款 button_primary(原比 740:211,宽 250),缺图回退暗红程序钮。
  private renderResultConfirmButton(dialog: Node, name: string, y: number, scale: number, onClick: () => void, k = 1): void {
    const width = 250 * scale * k;
    const height = width * (211 / 740);
    const button = this.host.addChildPlainNode(dialog, name, 0, y, width, height);
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(button, 1.035, 0.965);
    const art = this.host.addSprite(`${name}Art`, 'ui/common/ai/button_primary/spriteFrame', 0, 0, width, height, button);
    if (!art) {
      const graphics = button.addComponent(Graphics);
      graphics.fillColor = rgba(78, 14, 17, 232);
      graphics.roundRect(-width / 2, -height / 2, width, height, 9 * scale);
      graphics.fill();
      graphics.strokeColor = rgba(226, 71, 52, 230);
      graphics.lineWidth = 1.8 * scale;
      graphics.stroke();
    }
    const label = this.host.addChildLabel(button, `${name}Label`, '确 定', 0, 1 * scale, 20 * scale * k, rgba(255, 240, 200), new Size(width - 60 * scale * k, height * 0.7));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
  }

  // 分解/合成结果弹窗通用框(2026-07-22):召唤结果同款 summon_result 整框(等比,标题写入顶部牌位),
  // 缺图回退雕花板;内容按框高比例排布,按钮不压说明行。
  // 手机(2026-10-02 用户拍板弹窗全屏):整框等比放大到铺满整页高度(一体构图只许等比),k = 相对电脑版的放大倍率,
  // 框内字号/格子/按钮同乘 k,按比例排布的位置自然跟随。
  private buildForgeResultFrame(parent: Node, name: string, title: string, titleColor: Color, panelWidth: number, panelHeight: number, scale: number): { dialog: Node; w: number; h: number; k: number } {
    const dim = this.host.addChildPlainNode(parent, `${name}Dim`, 0, 0, panelWidth, panelHeight);
    const dg = dim.addComponent(Graphics);
    dg.fillColor = rgba(0, 0, 0, 190);
    dg.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
    dg.fill();
    dim.addComponent(BlockInputEvents);
    const ratio = 1672 / 941;
    const baseW = Math.min(820 * scale, panelWidth - 90 * scale);
    const full = this.phone ? this.phoneDialogSize(scale) : null;
    const w = full ? Math.max(baseW, Math.min(full.w, full.h * ratio)) : baseW;
    const h = w / ratio;
    const k = w / baseW;
    const dialog = this.host.addChildPlainNode(dim, name, 0, 0, w, h);
    const g = dialog.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 9, 246);
    g.rect(-w * 0.47, -h * 0.44, w * 0.94, h * 0.88);
    g.fill();
    // 直接引素材路径,避免 lobby → gacha 配置模块依赖。
    const art = this.host.addSprite(`${name}Art`, 'ui/gacha/ai/summon_result/spriteFrame', 0, 0, w, h, dialog);
    if (!art) {
      g.strokeColor = rgba(214, 168, 82, 230);
      g.lineWidth = 2 * scale;
      g.roundRect(-w / 2, -h / 2, w, h, 12 * scale);
      g.stroke();
    }
    const titleLabel = this.host.addChildLabel(dialog, `${name}Title`, title, 0, h / 2 - h * 0.089, Math.max(20 * scale, h * 0.055), titleColor, new Size(w * 0.24, h * 0.08));
    titleLabel.overflow = Label.Overflow.SHRINK;
    this.applyOutline(titleLabel, scale, true);
    return { dialog, w, h, k };
  }

  // 分解结果弹窗:本次获得强化石明细 + 已拥有数量 + 用途说明;确定关闭。
  private renderDecomposeResultDialog(parent: Node, result: { count: number; stonesGained: number; blessGained?: number; runeGained?: number; gemsGained?: string[] }, panelWidth: number, panelHeight: number, scale: number): void {
    const frame = this.buildForgeResultFrame(parent, 'ForgeDecResult', '分解成功！', rgba(250, 216, 120), panelWidth, panelHeight, scale);
    const dialog = frame.dialog;
    const w = frame.w;
    const h = frame.h;
    const k = frame.k;
    const subtitle = this.host.addChildLabel(dialog, 'ForgeDecResultSub', `分解 ${result.count} 件装备`, 0, h * 0.3, 19 * scale * k, rgba(218, 210, 191), new Size(w * 0.6, 26 * scale * k));
    subtitle.overflow = Label.Overflow.SHRINK;

    // 获得物展示格:强化石 + 附加产出(金币/祝福石/护符)并排小格,格内底部名签 + 右下 ×N 角标。
    const gains: Array<{ key: string; icon: string; label: string; count: number; tint: { r: number; g: number; b: number } }> = [
      { key: 'stone', icon: 'ui/bag/ai/icon_enhance_low/spriteFrame', label: '强化石', count: result.stonesGained, tint: { r: 122, g: 176, b: 236 } },
    ];
    if ((result.blessGained ?? 0) > 0) {
      gains.push({ key: 'bless', icon: 'ui/forge/ai/icon_bless_stone/spriteFrame', label: '祝福石', count: result.blessGained ?? 0, tint: { r: 232, g: 110, b: 110 } });
    }
    if ((result.runeGained ?? 0) > 0) {
      gains.push({ key: 'rune', icon: 'ui/forge/ai/icon_guard_rune/spriteFrame', label: '护符', count: result.runeGained ?? 0, tint: { r: 214, g: 176, b: 100 } });
    }
    // P5:炽红装备分解附带宝石(按编码归组)。
    const gemCounts = new Map<string, number>();
    (result.gemsGained ?? []).forEach((code) => gemCounts.set(code, (gemCounts.get(code) ?? 0) + 1));
    gemCounts.forEach((count, code) => {
      const info = parseGemCode(code);
      if (!info) {
        return;
      }
      const tint = equipQualityColor(GEM_TIER_QUALITY[info.tier - 1] ?? 'GREEN');
      gains.push({ key: `gem_${code}`, icon: gemIconAsset(info.type, info.tier), label: info.label, count, tint });
    });
    const cellSize = Math.min((gains.length > 1 ? 86 : 96) * scale * k, h * 0.22);
    const cellGap = 16 * scale * k;
    const rowWidth = gains.length * cellSize + (gains.length - 1) * cellGap;
    gains.forEach((gain, index) => {
      const cx = -rowWidth / 2 + cellSize / 2 + index * (cellSize + cellGap);
      const cell = this.host.addChildPlainNode(dialog, `ForgeDecResultCell_${gain.key}`, cx, h * 0.075, cellSize, cellSize);
      const cg = cell.addComponent(Graphics);
      cg.fillColor = rgba(30, 26, 22, 245);
      cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
      cg.fill();
      cg.strokeColor = rgba(gain.tint.r, gain.tint.g, gain.tint.b, 235);
      cg.lineWidth = 2.2 * scale;
      cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
      cg.stroke();
      this.host.addSprite(`ForgeDecResultIcon_${gain.key}`, gain.icon, 0, 8 * scale * k, cellSize * 0.62, cellSize * 0.62, cell);
      const stripH = 18 * scale * k;
      const strip = this.host.addChildPlainNode(cell, 'ForgeDecResultCellStrip', 0, -cellSize / 2 + stripH / 2 + 3 * scale, cellSize - 6 * scale, stripH);
      const stripBg = strip.addComponent(Graphics);
      stripBg.fillColor = rgba(6, 5, 5, 205);
      stripBg.roundRect(-(cellSize - 6 * scale) / 2, -stripH / 2, cellSize - 6 * scale, stripH, 4 * scale);
      stripBg.fill();
      const stripName = this.host.addChildLabel(strip, 'ForgeDecResultCellName', gain.label, 0, 0, 13 * scale * k, rgba(gain.tint.r, gain.tint.g, gain.tint.b, 255), new Size(cellSize - 10 * scale, stripH));
      stripName.overflow = Label.Overflow.SHRINK;
      const countBadge = this.host.addChildLabel(cell, 'ForgeDecResultCellCount', `×${formatInteger(gain.count)}`, cellSize / 2 - 6 * scale, cellSize / 2 - 12 * scale * k, 17 * scale * k, rgba(255, 236, 180), new Size(cellSize, 22 * scale * k), HorizontalTextAlignment.RIGHT);
      countBadge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(countBadge, scale, true);
    });

    const bag = this.host.currentLobbyBagState();
    const stoneOwned = bag.groups.flatMap((group) => group.items).find((item) => (item.itemCode || '').toUpperCase() === 'ENHANCE_STONE')?.itemCount ?? 0;
    const name = this.host.addChildLabel(dialog, 'ForgeDecResultName', `强化石 ×${result.stonesGained}`, 0, -h * 0.125, 20 * scale * k, rgba(150, 198, 255), new Size(w * 0.6, 30 * scale * k));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    const owned = this.host.addChildLabel(dialog, 'ForgeDecResultOwned', `已拥有：强化石 ×${stoneOwned}（含本次）`, 0, -h * 0.19, 17 * scale * k, rgba(250, 214, 128), new Size(w * 0.62, 24 * scale * k));
    owned.overflow = Label.Overflow.SHRINK;
    const note = this.host.addChildLabel(dialog, 'ForgeDecResultNote', '强化石用于装备强化（+1 至 +10），高阶强化另需高阶强化石。', 0, -h * 0.245, 15 * scale * k, rgba(207, 197, 179), new Size(w * 0.66, 22 * scale * k));
    note.overflow = Label.Overflow.SHRINK;
    this.renderResultConfirmButton(dialog, 'ForgeDecResultOk', -h / 2 + h * 0.16, scale, () => this.host.clearLobbyForgeDecomposeResult(), k);
  }

  // 合成结果弹窗:成功展示新装备(图标/名称/属性),失败说明返还;确定关闭。
  private renderFuseResultDialog(parent: Node, result: { success: boolean; chance: number; item: EquipmentItemVO }, panelWidth: number, panelHeight: number, scale: number): void {
    const frame = this.buildForgeResultFrame(parent, 'ForgeFuseResult', result.success ? '合成成功！' : '合成失败', result.success ? rgba(250, 216, 120) : rgba(198, 188, 172), panelWidth, panelHeight, scale);
    const dialog = frame.dialog;
    const w = frame.w;
    const h = frame.h;
    const k = frame.k;
    const q = equipQualityColor(result.item.quality);
    const subtitle = this.host.addChildLabel(dialog, 'ForgeFuseResultSub', result.success ? `成功率 ${Math.round(result.chance * 100)}% · 获得新装备` : `成功率 ${Math.round(result.chance * 100)}% · 材料消耗,返还同档 1 件`, 0, h * 0.3, 19 * scale * k, rgba(218, 210, 191), new Size(w * 0.7, 26 * scale * k));
    subtitle.overflow = Label.Overflow.SHRINK;

    // 新装备展示:大图标格 + 名称 + 属性。
    const cellSize = Math.min(100 * scale * k, h * 0.25);
    const cell = this.host.addChildPlainNode(dialog, 'ForgeFuseResultCell', 0, h * 0.075, cellSize, cellSize);
    // 合成结果特效对准弹窗里的新装备图标(弹窗与面板同心、不随手机导航栏偏移;2026-10-16 用户「合成特效位置变了」)
    this.fxAnchor = { x: 0, y: h * 0.075 };
    this.powerAnchor = null;
    const cg = cell.addComponent(Graphics);
    cg.fillColor = rgba(Math.round(q.r * 0.22 + 8), Math.round(q.g * 0.22 + 8), Math.round(q.b * 0.22 + 8), 245);
    cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
    cg.fill();
    cg.strokeColor = rgba(q.r, q.g, q.b, 240);
    cg.lineWidth = 2.4 * scale;
    cg.roundRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize, 12 * scale);
    cg.stroke();
    this.addEquipIcon(cell, 'ForgeFuseResultIcon', result.item.equipCode, result.item.slot, cellSize * 0.88, scale);
    // 结果弹窗装备格的流光同样按真实强化等级(合成产物为 +0,不再假借 +5 光效)。
    const name = this.host.addChildLabel(dialog, 'ForgeFuseResultName', `${equipQualityLabel(result.item.quality)} · ${safeText(result.item.equipName)}`, 0, -h * 0.125, 20 * scale * k, rgba(q.r, q.g, q.b, 255), new Size(w * 0.66, 30 * scale * k));
    name.overflow = Label.Overflow.SHRINK;
    this.applyOutline(name, scale, true);
    const attrs = this.host.addChildLabel(dialog, 'ForgeFuseResultAttrs', describeEquipAttrs(result.item), 0, -h * 0.2, 17 * scale * k, rgba(225, 216, 195), new Size(w * 0.7, 26 * scale * k));
    attrs.overflow = Label.Overflow.SHRINK;

    this.renderResultConfirmButton(dialog, 'ForgeFuseResultOk', -h / 2 + h * 0.16, scale, () => this.host.clearLobbyForgeFuseResult(), k);
  }

  // 顶部材料胶囊(合成 / 分解 / 宝石页,2026-10-17 界面统一:原来是一行灰字):金币 + 4 种锻造道具,与强化页同款胶囊并入标题行。
  // 五枚放不下时整体等比缩小(左让标题横幅 + 问号钮,右让关闭钮),纵向与强化页胶囊对齐。
  private renderHoldingsBar(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const bag = this.host.currentLobbyBagState();
    const pending = bag.loading && !bag.loaded;
    const count = (code: string): string => (pending ? '…' : formatInteger(this.bagCount(code)));
    const entries = [
      { key: 'gold', icon: BAG_ICON_GOLD_ASSET, value: formatInteger(Number(this.host.currentLobbyProfile().gold) || 0) },
      { key: 'stone', icon: BAG_ICON_ENHANCE_STONE_ASSET, value: count('ENHANCE_STONE') },
      { key: 'luck', icon: FORGE_FUSE_LUCK_GEM, value: count('FUSION_LUCK_STONE') },
      { key: 'bless', icon: FORGE_AI_BLESS_ICON_ASSET, value: count('ENHANCE_BLESS_STONE') },
      { key: 'rune', icon: FORGE_AI_GUARD_ICON_ASSET, value: count('ENHANCE_GUARD_RUNE') },
    ];
    const rightInset = 118 * scale;
    const need = (entries.length * 158 + (entries.length - 1) * 18) * scale;
    const avail = panelWidth - 340 * scale - rightInset - 12 * scale;
    const s = scale * Math.max(0.6, Math.min(1, avail / need));
    renderTopCurrencyBar(this.host, parent, panelWidth / 2, panelHeight / 2 - 40 * scale + 40 * s, s, entries, rightInset / s);
  }

  private bagCount(itemCode: string): number {
    const bag = this.host.currentLobbyBagState();
    return bag.groups.flatMap((group) => group.items).find((item) => item.itemCode === itemCode)?.itemCount ?? 0;
  }

  // 顶部货币胶囊栏(强化页,参考图右上):金币 / 钻石 / 强化石,复用 bag 货币条与图标。
  /** 空装备提示卡(2026-10-10 全界面美化:原来是熔炉场景正中一行灰字)。 */
  private renderEmptyCard(panel: Node, scale: number): void {
    const cardW = 520 * scale;
    const cardH = 236 * scale;
    const card = mountKitSection(this.host, panel, 'LobbyForgeEmpty', 0, -10 * scale, cardW, cardH, scale, 0.2);
    this.host.addSprite('LobbyForgeEmptyIcon', `${FORGE_AI_NAV_PREFIX}enhance/spriteFrame`, 0, cardH / 2 - 52 * scale, 74 * scale, 74 * scale, card);
    const title = this.host.addChildLabel(card, 'LobbyForgeEmptyTitle', '暂无装备', 0, cardH / 2 - 108 * scale, 26 * scale, rgba(248, 222, 160), new Size(cardW - 60 * scale, 34 * scale));
    title.overflow = Label.Overflow.SHRINK;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 220);
    title.outlineWidth = Math.max(1, 1.5 * scale);
    const sub = this.host.addChildLabel(card, 'LobbyForgeEmptyText', '主线首通与装备召唤均可获取装备', 0, cardH / 2 - 140 * scale, 18 * scale, rgba(215, 204, 181), new Size(cardW - 60 * scale, 26 * scale));
    sub.overflow = Label.Overflow.SHRINK;
    if (this.host.openLobbyGachaScene) {
      mountKitButton(this.host, card, 'LobbyForgeEmptyGacha', '去召唤', 0, -cardH / 2 + 40 * scale, 200 * scale, 54 * scale, scale, 'primary', () => this.host.openLobbyGachaScene?.());
    }
  }

  private renderCurrencyBar(parent: Node, panelWidth: number, panelHeight: number, scale: number): void {
    const profile = this.host.currentLobbyProfile();
    renderTopCurrencyBar(this.host, parent, panelWidth / 2, panelHeight / 2, scale, [
      { key: 'gold', icon: BAG_ICON_GOLD_ASSET, value: formatInteger(Number(profile.gold) || 0) },
      { key: 'diamond', icon: BAG_ICON_DIAMOND_ASSET, value: formatInteger(Number(profile.diamond) || 0) },
      { key: 'stone', icon: BAG_ICON_ENHANCE_STONE_ASSET, value: formatInteger(this.bagCount('ENHANCE_STONE')) },
    ], 118);
  }

  // 右下功能导航(参考图):强化/合成/分解 圆形徽章 + 祝福占位;合成有可用组时亮红点。
  // 手机右缘竖排导航栏:同款徽章缩到 72,自上而下排在内容区内(垂直居中),背后垫一条暗底竖条压背景。
  private renderForgeNavRail(parent: Node, active: ForgeTab, items: EquipmentItemVO[], panelWidth: number, contentTop: number, contentBottom: number, scale: number): void {
    const railW = FORGE_PHONE_RAIL_W * scale;
    const railX = panelWidth / 2 - 6 * scale - railW / 2;
    const size = 72 * scale;
    const itemH = size + 30 * scale;
    const gap = Math.min(18 * scale, Math.max(4 * scale, (contentTop - contentBottom - 4 * itemH) / 5));
    const totalH = 4 * itemH + 3 * gap;
    const railH = Math.min(contentTop - contentBottom, totalH + 24 * scale);
    const railCy = (contentTop + contentBottom) / 2;
    const strip = this.host.addChildPlainNode(parent, 'ForgeNavRailBg', railX, railCy, railW, railH);
    if (!mountRefSliced(this.host, strip, 'Art', FORGE_REF_NAV_RAIL, 0, 0, railW, railH)) {
      const sg = strip.addComponent(Graphics);
      sg.fillColor = rgba(10, 8, 7, 200);
      sg.roundRect(-railW / 2, -railH / 2, railW, railH, 12 * scale);
      sg.fill();
      sg.strokeColor = rgba(150, 118, 66, 140);
      sg.lineWidth = 1.2 * scale;
      sg.roundRect(-railW / 2, -railH / 2, railW, railH, 12 * scale);
      sg.stroke();
    }
    // 徽章图上移 10、名签挂在 -size/2-4 处,上下相抵后节点中心≈整项中心(微调 2)。
    const firstY = railCy + totalH / 2 - itemH / 2 + 2 * scale;
    this.renderForgeNav(parent, active, items, panelWidth, 0, scale, { size, positions: (index) => ({ x: railX, y: firstY - index * (itemH + gap) }) });
  }

  private renderForgeNav(parent: Node, active: ForgeTab, items: EquipmentItemVO[], panelWidth: number, panelHeight: number, scale: number, placement?: { size: number; positions: (index: number) => { x: number; y: number } }): void {
    const fuseReady = this.collectFuseGroups(items).some((group) => group.items.length >= 3);
    const entries: { key: ForgeTab | 'bless'; label: string; dot: boolean }[] = [
      { key: 'enhance', label: '强化', dot: false },
      { key: 'fuse', label: '合成', dot: fuseReady },
      { key: 'decompose', label: '分解', dot: false },
      { key: 'gem', label: '宝石', dot: false },
      // 祝福:功能未开放,暂不进导航(素材就绪且玩法上线后再加回 { key: 'bless', label: '祝福' })。
    ];
    const size = placement?.size ?? 116 * scale;
    const gap = 6 * scale;
    const baseY = -panelHeight / 2 + 80 * scale;
    const startX = panelWidth / 2 - 40 * scale - size / 2 - (entries.length - 1) * (size + gap);
    entries.forEach((entry, index) => {
      const pos = placement ? placement.positions(index) : { x: startX + index * (size + gap), y: baseY };
      const x = pos.x;
      const y = pos.y;
      const selected = entry.key === active;
      const disabled = entry.key === 'bless';
      const node = this.host.addChildPlainNode(parent, `ForgeNav_${entry.key}`, x, y, size, size + 26 * scale);
      // 徽章 AI 图优先(nav_forge_*,祝福未生成走兜底);选中金环 + 红点仍程序绘制。
      const badgeArt = this.host.addSprite(`ForgeNavArt_${entry.key}`, selected ? FORGE_REF_NAV_ON_ASSET : FORGE_REF_NAV_OFF_ASSET, 0, 10 * scale, size * 1.1, size * 1.1, node)
        ?? this.host.addSprite(`ForgeNavArt_${entry.key}`, `${FORGE_AI_NAV_PREFIX}${entry.key}/spriteFrame`, 0, 10 * scale, size * 1.1, size * 1.1, node);
      if (badgeArt && disabled) {
        const dimmer = badgeArt.node.addComponent(UIOpacity);
        dimmer.opacity = 108;
      }
      const g = node.addComponent(Graphics);
      if (badgeArt) {
        if (!selected && !disabled) {
          const dim = badgeArt.node.addComponent(UIOpacity);
          dim.opacity = 245;
        }
        if (entry.dot) {
          g.fillColor = rgba(226, 60, 48, 250);
          g.circle(size * 0.55 - 8 * scale, 10 * scale + size * 0.55 - 10 * scale, 6 * scale);
          g.fill();
        }
      } else {
      g.fillColor = selected ? rgba(74, 26, 20, 245) : rgba(16, 14, 13, 228);
      g.circle(0, 10 * scale, size / 2);
      g.fill();
      g.strokeColor = selected ? rgba(248, 202, 106, 250) : rgba(disabled ? 112 : 138, disabled ? 92 : 112, disabled ? 58 : 70, selected ? 250 : disabled ? 150 : 190);
      g.lineWidth = (selected ? 2.6 : 1.5) * scale;
      g.circle(0, 10 * scale, size / 2);
      g.stroke();
      // 徽章内简笔图记:强化=锤 / 合成=三圆 / 分解=碎块 / 祝福=星。
      g.strokeColor = selected ? rgba(250, 226, 160, 250) : rgba(disabled ? 148 : 196, disabled ? 122 : 178, disabled ? 76 : 138, disabled ? 165 : 235);
      g.lineWidth = 2 * scale;
      const r = size * 0.2;
      if (entry.key === 'enhance') {
        g.moveTo(-r, 10 * scale - r * 0.6);
        g.lineTo(r, 10 * scale + r * 0.9);
        g.moveTo(r * 0.1, 10 * scale + r);
        g.lineTo(r * 1.1, 10 * scale);
      } else if (entry.key === 'fuse') {
        g.circle(-r * 0.8, 10 * scale - r * 0.4, r * 0.5);
        g.circle(r * 0.8, 10 * scale - r * 0.4, r * 0.5);
        g.circle(0, 10 * scale + r * 0.7, r * 0.5);
      } else if (entry.key === 'decompose') {
        g.moveTo(-r, 10 * scale + r);
        g.lineTo(r, 10 * scale - r);
        g.moveTo(-r, 10 * scale - r * 0.2);
        g.lineTo(-r * 0.2, 10 * scale - r);
        g.moveTo(r * 0.2, 10 * scale + r);
        g.lineTo(r, 10 * scale + r * 0.2);
      } else if (entry.key === 'gem') {
        g.moveTo(0, 10 * scale + r);
        g.lineTo(r * 0.85, 10 * scale + r * 0.15);
        g.lineTo(r * 0.5, 10 * scale - r);
        g.lineTo(-r * 0.5, 10 * scale - r);
        g.lineTo(-r * 0.85, 10 * scale + r * 0.15);
        g.close();
        g.moveTo(-r * 0.85, 10 * scale + r * 0.15);
        g.lineTo(r * 0.85, 10 * scale + r * 0.15);
      } else {
        g.moveTo(0, 10 * scale + r);
        g.lineTo(r * 0.35, 10 * scale + r * 0.3);
        g.lineTo(r, 10 * scale + r * 0.2);
        g.lineTo(r * 0.45, 10 * scale - r * 0.25);
        g.lineTo(r * 0.6, 10 * scale - r);
        g.lineTo(0, 10 * scale - r * 0.55);
        g.lineTo(-r * 0.6, 10 * scale - r);
        g.lineTo(-r * 0.45, 10 * scale - r * 0.25);
        g.lineTo(-r, 10 * scale + r * 0.2);
        g.lineTo(-r * 0.35, 10 * scale + r * 0.3);
        g.close();
      }
      g.stroke();
      if (entry.dot) {
        g.fillColor = rgba(226, 60, 48, 250);
        g.circle(size / 2 - 8 * scale, 10 * scale + size / 2 - 10 * scale, 5 * scale);
        g.fill();
      }
      }
      const label = this.host.addChildLabel(node, `ForgeNavLabel_${entry.key}`, entry.label, 0, -size / 2 - 4 * scale, 20 * scale, selected ? rgba(250, 226, 160) : rgba(disabled ? 130 : 196, disabled ? 120 : 182, disabled ? 104 : 148, 255), new Size(size + 20 * scale, 26 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, selected);
      if (!selected && !disabled) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.selectLobbyForgeTab(entry.key as ForgeTab), this);
        this.host.applyImageButtonFeedback(node);
      }
    });
  }

  // 星级行:强化等级映射星数(每 2 级 1 星,+10 满 5 星);复用英雄星星素材,缺图画菱形。
  private renderStarRow(parent: Node, name: string, enhanceLevel: number, x: number, y: number, starSize: number, scale: number): void {
    const filled = Math.min(5, Math.floor(enhanceLevel / 2));
    for (let index = 0; index < 5; index += 1) {
      const sx = x + index * (starSize + 3 * scale);
      const asset = index < filled ? STAR_FILLED_ASSET : STAR_EMPTY_ASSET;
      if (!this.host.addSprite(`${name}_${index}`, asset, sx, y, starSize, starSize, parent)) {
        const node = this.host.addChildPlainNode(parent, `${name}_${index}`, sx, y, starSize, starSize);
        const g = node.addComponent(Graphics);
        g.fillColor = index < filled ? rgba(244, 202, 92, 240) : rgba(70, 62, 50, 200);
        g.moveTo(0, starSize / 2);
        g.lineTo(starSize / 2, 0);
        g.lineTo(0, -starSize / 2);
        g.lineTo(-starSize / 2, 0);
        g.close();
        g.fill();
      }
    }
  }

  // ===== 强化页签(参考图 1:1):左装备列表面板 + 中央环形展示/对比面板/材料石台 + 右保护/预览面板 =====
  private renderEnhanceTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: {
      enhanceSlotId: number | null;
      enhanceSlotTab: string | null;
      enhanceRarity: string | null;
      enhanceFilterOpen: boolean;
      enhanceSortAsc: boolean;
      autoRepeat: boolean;
    },
    panelWidth: number,
    panelHeight: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    void panelWidth;
    void panelHeight;
    void contentTop;
    void contentBottom;
    const enhance = this.host.currentLobbyEquipEnhanceState();
    const stoneHeld = this.bagCount('ENHANCE_STONE');
    const highStoneHeld = this.bagCount('ENHANCE_STONE_HIGH');
    const blessHeld = this.bagCount('ENHANCE_BLESS_STONE');
    const guardHeld = this.bagCount('ENHANCE_GUARD_RUNE');
    const goldHeld = Number(this.host.currentLobbyProfile().gold) || 0;
    const goldCostOf = (lv: number) => 100 * Math.pow(2, Math.floor(lv / 3));
    const stoneNeedOf = (lv: number) => (lv >= ENHANCE_HIGH_FROM_LEVEL ? lv - 9 : lv + 1);
    const stoneHeldOf = (lv: number) => (lv >= ENHANCE_HIGH_FROM_LEVEL ? highStoneHeld : stoneHeld);
    const canEnhanceNow = (item: EquipmentItemVO) => {
      const lv = item.enhanceLevel ?? 0;
      return lv < ENHANCE_MAX_LEVEL && stoneHeldOf(lv) >= stoneNeedOf(lv) && goldHeld >= goldCostOf(lv);
    };

    // ── 2026-10-21 按原型 A 版 1:1:整屏原型坐标 1870×841(与合成 / 分解 / 宝石同一 k / 中心);铁砧台在背景里 ──
    // 左栏 75..550、中间舞台(锁定背景,不随导航栏挪)、右栏 1200..1725;手机导航栏挤右缘:左栏左移 ≤ 40,右栏左缘可外扩到 1185 后再收窄
    const k = this.fuseBgK > 0 ? this.fuseBgK : Math.min(this.stageW / 1870, this.stageH / 841);
    const FX = (px: number): number => (px - 935) * k - this.bodyOffsetX;
    const FY = (py: number): number => (420.5 - py) * k;
    const FS = (v: number): number => v * k;
    const railLeftPx = this.phone ? (this.stageW / 2 - 6 * scale - FORGE_PHONE_RAIL_W * scale) / k + 935 : 1870;
    const rightR = Math.min(1725, railLeftPx - 14);
    const short = Math.max(0, 1725 - rightR);
    const dxL = Math.min(40, short);
    const rightL = Math.max(1185, rightR - 525);
    const sxR = (rightR - rightL) / 525;
    const LX = (px: number): number => FX(px - dxL);
    const RX = (px: number): number => FX(rightL + (px - 1200) * sxR);
    const RS = (v: number): number => FS(v * sxR);
    const lift = (c: number, t = 0.3): number => Math.round(c + (255 - c) * t);
    const hex = (c: { r: number; g: number; b: number }, t = 0.3): string => `#${[c.r, c.g, c.b].map((v) => lift(v, t).toString(16).padStart(2, '0')).join('')}`;
    const shadow = (name: string, cx: number, cy: number, w: number, h: number): void => {
      const sh = this.host.addSprite(name, FORGE_FUSE_SOFT_SHADE, cx, cy - FS(8), w + FS(90), h + FS(90), parent);
      if (sh) {
        sh.color = rgba(0, 0, 0, 210);
      }
    };
    // 原型里行底 / 消耗框是近黑 + 细金边,REF_ROW 偏灰 → 内缩一圈压暗(放在行艺之后、文字之前)
    const darkRow = (host: Node, w: number, h: number, alpha = 110): void => {
      mountRefSolid(this.host, host, 'Dark', 0, 0, w - FS(10), h - FS(10), rgba(0, 0, 0, alpha));
    };
    const label = (host: Node, name: string, text: string, x: number, y: number, size: number, color: Color, w: number, align: HorizontalTextAlignment = HorizontalTextAlignment.CENTER, bold = false): Label => {
      const l = this.host.addChildLabel(host, name, text, x, y, size, color, new Size(w, size + FS(10)), align);
      // 本页字号全部按原型像素换算(FS),不走手机 20 设计像素下限:下限会把原型 17~21 的字抬到 23,保护行 / 预览行 / 属性行就比原型大一圈
      l.fontSize = Math.max(FS(13), Math.round(size));
      l.lineHeight = l.fontSize;
      l.overflow = Label.Overflow.SHRINK;
      l.isBold = bold;
      this.applyOutline(l, scale, bold);
      return l;
    };

    let items = state.items
      .filter((item) => !forge.enhanceSlotTab || item.slot === forge.enhanceSlotTab)
      .filter((item) => !forge.enhanceRarity || (item.quality || '').toUpperCase() === forge.enhanceRarity)
      .sort((a, b) => {
        const qualityDiff = EQUIP_QUALITY_ORDER.indexOf((b.quality || '').toUpperCase()) - EQUIP_QUALITY_ORDER.indexOf((a.quality || '').toUpperCase());
        if (qualityDiff !== 0) {
          return qualityDiff;
        }
        const enhanceDiff = (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0);
        return enhanceDiff !== 0 ? enhanceDiff : a.slot.localeCompare(b.slot);
      });
    if (forge.enhanceSortAsc) {
      items = items.reverse();
    }

    // ── 左:选择装备(75..550 × 95..815)──
    const listL = 75;
    const listR = 550;
    const listCx = LX((listL + listR) / 2);
    const listCy = FY((95 + 815) / 2);
    const listW = FS(listR - listL);
    const listH = FS(815 - 95);
    shadow('ForgeEnhListShadow', listCx, listCy, listW, listH);
    const listPanel = mountRefTitledPanel(this.host, parent, 'ForgeEnhListPanel', listCx, listCy, listW, listH, scale, '', { fill: rgba(10, 8, 7, 240) }).node;
    const PX = (px: number): number => LX(px) - listCx;
    const PY = (py: number): number => FY(py) - listCy;
    // 标题带(原型 99..140 暗红底,字离带左 30、上下居中)+ 带下金线;页签行下再一条金线(一级分类与列表分隔)
    mountRefSolid(this.host, listPanel, 'HeaderBand', PX((listL + listR) / 2), PY(119.5), listW - FS(14), FS(41), rgba(76, 12, 10, 235));
    const goldLine = (name: string, py: number): void => {
      mountRefSolid(this.host, listPanel, name, PX((listL + listR) / 2), PY(py), listW - FS(22), Math.max(1, FS(1.5)), rgba(214, 170, 92, 150));
    };
    goldLine('HeaderLine', 141);
    goldLine('TabLine', 210);
    label(listPanel, 'ForgeEnhListHeader', `选择装备（${items.length}）`, PX(105), PY(120), FS(24), rgba(244, 228, 186), FS(300), HorizontalTextAlignment.LEFT, true);
    // 部位页签:全部(92..170)+ 6 部位(图标 + 字),选中 = 金边签
    const tabY = PY(175);
    const tabH = FS(60);
    const allSelected = forge.enhanceSlotTab === null;
    const tabDefs: Array<{ code: string | null; label: string; cx: number; w: number }> = [{ code: null, label: '全部', cx: 131, w: 78 }];
    HERO_EQUIP_SLOTS.forEach((slot, index) => tabDefs.push({ code: slot.code, label: slot.label, cx: 207 + index * 60.5, w: 56 }));
    tabDefs.forEach((def) => {
      const selected = def.code === null ? allSelected : forge.enhanceSlotTab === def.code;
      const tab = this.host.addChildPlainNode(listPanel, `ForgeEnhSlotTab_${def.code ?? 'ALL'}`, PX(def.cx), tabY, FS(def.w), tabH);
      if (selected) {
        mountRefPlate(this.host, tab, 'Plate', FORGE_DEC_CHIP_ON, 0, 0, FS(def.w), tabH);
      } else {
        mountRefSolid(this.host, tab, 'Plate', 0, 0, FS(def.w - 4), tabH - FS(8), rgba(24, 20, 17, 220));
      }
      if (def.code === null) {
        label(tab, 'Label', def.label, 0, 0, FS(22), selected ? rgba(255, 240, 200) : rgba(214, 204, 184), FS(def.w - 8), HorizontalTextAlignment.CENTER, selected);
      } else {
        const icon = FORGE_ENH_SLOT_ICONS[def.code];
        const iconSprite = icon ? this.host.addSprite('Icon', icon, 0, FS(8), FS(32), FS(32), tab) : null;
        if (!iconSprite) {
          const holder = this.host.addChildPlainNode(tab, 'GlyphHolder', 0, FS(9), FS(26), FS(26));
          this.drawSlotGlyph(holder, def.code, FS(24), scale);
        }
        if (!selected) {
          (iconSprite?.node ?? tab).addComponent(UIOpacity).opacity = 225;
        }
        // 页签小字:原型约 13px,手机正文下限 20 会把字撑满页签 → 直接定 16(和原型同比例,仍清楚)
        const tabLabel = label(tab, 'Label', def.label, 0, -FS(18), FS(16), selected ? rgba(255, 236, 190) : rgba(214, 204, 186), FS(def.w), HorizontalTextAlignment.CENTER);
        tabLabel.fontSize = Math.round(FS(16));
        tabLabel.lineHeight = tabLabel.fontSize;
      }
      if (!selected) {
        tab.addComponent(Button);
        tab.on(Button.EventType.CLICK, () => this.host.setLobbyForgeEnhanceSlotTab(def.code), this);
        this.host.applyImageButtonFeedback(tab);
      }
    });
    // 行式列表(x 88..540,行高 80 步 89,视口 213..750 正好 6 行)
    const rowW = FS(452);
    const rowH = FS(86);
    const rowStep = FS(94);
    const ENHANCE_LIST_RENDER_CAP = 60;
    const shownItems = items.slice(0, ENHANCE_LIST_RENDER_CAP);
    const hiddenCount = items.length - shownItems.length;
    const hintH = hiddenCount > 0 ? FS(36) : 0;
    const listContentH = Math.max(0, shownItems.length * rowStep - (rowStep - rowH)) + hintH + FS(6);
    const scroll = this.addPhoneScroll(listPanel, 'ForgeEnhList', PX(314), PY(213), PY(750), rowW, listContentH, scale);
    if (items.length <= 0) {
      label(scroll.content, 'ForgeEnhListEmpty', '该筛选下暂无装备', 0, scroll.topY - FS(60), FS(20), rgba(190, 184, 171), rowW - FS(20));
    }
    shownItems.forEach((item, index) => {
      const cy = scroll.topY - FS(3) - rowH / 2 - index * rowStep;
      const selected = item.id === (forge.enhanceSlotId ?? shownItems[0]?.id);
      const q = equipQualityColor(item.quality);
      const lv = item.enhanceLevel ?? 0;
      const row = this.host.addChildPlainNode(scroll.content, `ForgeEnhanceRow_${item.id}`, 0, cy, rowW, rowH);
      mountRefSliced(this.host, row, 'Bg', selected ? FORGE_REF_ROW_SELECTED : FORGE_REF_ROW_NORMAL, 0, 0, rowW, rowH);
      const RXr = (px: number): number => FS(px - 88) - rowW / 2;
      // 图标 70 < 行高 86:行底素材内缘有 ~6px 暗带,78 时会盖住图标最外圈的细稀有度描边(用户:橙装边框丢失);留 8 落在平区
      const iconSize = FS(70);
      const iconArt = equipIconAssetByCode(item.equipCode);
      if (iconArt) {
        mountEquipIconBacking(this.host, row, 'IconBacking', iconSize, item.equipCode, { x: RXr(137) });
      }
      if (!iconArt || !this.host.addSprite('Icon', iconArt, RXr(137), 0, iconSize, iconSize, row)) {
        this.addEquipIcon(row, 'Icon', item.equipCode, item.slot, iconSize, scale);
      }
      if (item.heroId != null) {
        // 原型:图标左上绿底「已穿」
        const tagW = FS(40);
        const tagH = FS(22);
        mountRefSolid(this.host, row, 'WornBg', RXr(137) - iconSize / 2 + tagW / 2, iconSize / 2 - tagH / 2, tagW, tagH, rgba(30, 96, 52, 240));
        label(row, 'Worn', '已穿', RXr(137) - iconSize / 2 + tagW / 2, iconSize / 2 - tagH / 2, FS(15), rgba(236, 250, 236), tagW, HorizontalTextAlignment.CENTER, true);
      }
      // 原型行内(行心为 0):名字 +18 / 等级 -7 / 星 -28 三行均匀;字离图标 25、离行顶 16
      // 三行(行心为 0,行高 86):名字 +21(字 21)/ 等级 -4(字 19)/ 星 -27(16);名字底 +10.5 ↔ 等级顶 +5.5、等级底 -13.5 ↔ 星顶 -19、星底 -35 ↔ 行底 -43
      const textX = RXr(205);
      label(row, 'Name', safeText(item.equipName), textX, FS(21), FS(21), rgba(lift(q.r), lift(q.g), lift(q.b), 255), FS(290), HorizontalTextAlignment.LEFT, true);
      label(row, 'LevelTag', '强化等级', textX, -FS(4), FS(19), rgba(200, 190, 170), FS(90), HorizontalTextAlignment.LEFT);
      label(row, 'LevelVal', `+${lv}`, textX + FS(19 * 4 + 24), -FS(4), FS(19), rgba(255, 244, 220), FS(70), HorizontalTextAlignment.LEFT, true);
      this.renderEnhanceStars(row, 'Star', lv, textX + FS(9), -FS(27), FS(18), FS(22));
      if (canEnhanceNow(item)) {
        const dot = this.host.addChildPlainNode(row, 'Dot', RXr(520), FS(25), FS(14), FS(14)).addComponent(Graphics);
        dot.fillColor = rgba(86, 214, 206, 250);
        dot.circle(0, 0, FS(6));
        dot.fill();
      }
      if (!selected) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.selectLobbyForgeEnhanceSlot(item.id), this);
        this.host.applyImageButtonFeedback(row, 1.015, 0.985);
      }
    });
    if (hiddenCount > 0) {
      label(scroll.content, 'ForgeEnhListMoreHint', `已显示 ${shownItems.length}/${items.length} 件 · 用部位页签或稀有度筛选查看其余`, 0, scroll.topY - shownItems.length * rowStep - hintH / 2, FS(16), rgba(212, 201, 179), rowW - FS(24));
    }
    // 筛选(95..345)+ 品质排序(362..530),y 780
    const filterY = PY(780);
    const filterW = FS(250);
    const filterBtn = this.host.addChildPlainNode(listPanel, 'ForgeEnhFilterBtn', PX(220), filterY, filterW, FS(44));
    mountRefSliced(this.host, filterBtn, 'Bg', FORGE_REF_ROW_NORMAL, 0, 0, filterW, FS(44));
    this.host.addSprite('Funnel', FORGE_ENH_FUNNEL, -filterW / 2 + FS(38), 0, FS(24), FS(24), filterBtn);
    label(filterBtn, 'ForgeEnhFilterLabel', forge.enhanceRarity ? `筛选:${equipQualityLabel(forge.enhanceRarity)}` : '筛选', -filterW / 2 + FS(60), 0, FS(21), rgba(236, 226, 204), FS(150), HorizontalTextAlignment.LEFT);
    label(filterBtn, 'Caret', '▼', filterW / 2 - FS(28), 0, FS(16), rgba(214, 198, 162), FS(24));
    if (!state.busy) {
      filterBtn.addComponent(Button);
      filterBtn.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeEnhanceFilterMenu(), this);
      this.host.applyImageButtonFeedback(filterBtn);
    }
    const sortW = FS(168);
    const sortBtn = this.host.addChildPlainNode(listPanel, 'ForgeEnhSortBtn', PX(446), filterY, sortW, FS(44));
    mountRefSliced(this.host, sortBtn, 'Bg', FORGE_REF_ROW_NORMAL, 0, 0, sortW, FS(44));
    label(sortBtn, 'Label', forge.enhanceSortAsc ? '品质升序' : '品质优先', -FS(14), 0, FS(19), rgba(214, 204, 184), FS(110));
    this.host.addSprite('SortIcon', FORGE_ENH_SORT, sortW / 2 - FS(26), 0, FS(22), FS(22), sortBtn);
    if (!state.busy) {
      sortBtn.addComponent(Button);
      sortBtn.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeEnhanceSort(), this);
      this.host.applyImageButtonFeedback(sortBtn);
    }

    const target = state.items.find((item) => item.id === forge.enhanceSlotId) ?? items[0] ?? null;
    // 洗练弹窗跟着强化页当前展示的装备走(没手动选时是列表第一件;2026-10-21 用户「洗练没反应」= 弹窗只认手动选中的 id)
    this.enhanceTargetId = target?.id ?? null;
    const level = target?.enhanceLevel ?? 0;
    const maxed = level >= ENHANCE_MAX_LEVEL;
    const attrDefs: { label: string; value: number }[] = target
      ? [
        { label: '攻击力', value: target.attrAttack },
        { label: '生命值', value: target.attrHp },
        { label: '防御力', value: target.attrDefense },
        { label: '速度', value: target.attrSpeed },
        { label: '暴击', value: target.attrCrit },
      ].filter((entry) => entry.value > 0)
      : [];

    // ── 右栏(1200..1725):强化等级 95..395 / 强化保护 410..612 / 强化等级预览 628..815 ──
    const rightCx = RX(1462.5);
    const rightW = RS(525);
    const rightPanel = (name: string, title: string, y0: number, y1: number): { node: Node; QY: (py: number) => number; QX: (px: number) => number; bodyTop: number } => {
      const cy = FY((y0 + y1) / 2);
      shadow(`${name}Shadow`, rightCx, cy, rightW, FS(y1 - y0));
      const panel = mountRefTitledPanel(this.host, parent, name, rightCx, cy, rightW, FS(y1 - y0), scale, title, { bandH: FS(46), fontSize: FS(26), fill: rgba(10, 8, 7, 242), legacyRed: true });
      return { node: panel.node, QY: (py: number) => FY(py) - cy, QX: (px: number) => RX(px) - rightCx, bodyTop: panel.bodyTop };
    };
    const statRowW = RS(490);
    // 强化等级
    {
      const { node, QY, QX, bodyTop } = rightPanel('ForgeEnhLevelPanel', '强化等级', 95, 395);
      if (!target) {
        label(node, 'ForgeEnhLevelEmpty', '← 从左侧选择要强化的装备', 0, QY(240), FS(22), rgba(225, 215, 191), rightW - FS(40));
      } else {
        // 大字:顶离面板实际标题带底 12(我们的带比原型厚,不能用原型固定 y;富文本在原生上偏高再补 3)
        const bigSize = FS(34);
        this.addRichLine(node, 'ForgeEnhLevelBig', maxed
          ? `<color=#FCE08C>+${level}</color><color=#C8BCA6>  已满级</color>`
          : `<color=#FCE08C>+${level}</color><color=#C8BCA6>   →   </color><color=#8CE68C>+${level + 1}</color>`, QX(1462), bodyTop - FS(12) - bigSize / 2 - FS(3), bigSize, rightW - FS(40));
        const factorNow = 1 + 0.1 * level;
        const factorNext = 1 + 0.1 * (level + 1);
        const rows = attrDefs.slice(0, 2).map((entry) => ({ label: entry.label, cur: formatInteger(Math.round(entry.value * factorNow)), next: formatInteger(Math.round(entry.value * factorNext)) }));
        rows.push({ label: '强化属性', cur: `×${factorNow.toFixed(1)}`, next: `×${factorNext.toFixed(1)}` });
        rows.forEach((row, index) => {
          // 原型:行 201..240 / 246..287 / 292..335(高 40 步 45.5),这里行高取 44 留足上下白;图标 1245、名 1287、当前值右缘 1505、箭头 1545、下一级右缘 1612、上箭头框 1677
          const y = QY(228 + index * 46);
          const rowHh = FS(44);
          const plate = this.host.addChildPlainNode(node, `ForgeEnhLevelRow_${index}`, QX(1460), y, statRowW, rowHh);
          mountRefSliced(this.host, plate, 'Bg', REF_ROW, 0, 0, statRowW, rowHh);
          darkRow(plate, statRowW, rowHh);
          const ox = (px: number): number => QX(px) - QX(1460);
          const icon = FORGE_ENH_ATTR_ICONS[row.label];
          if (icon) {
            this.host.addSprite('Icon', icon, ox(1245), 0, FS(28), FS(28), plate);
          }
          label(plate, 'Name', row.label, ox(1287), 0, FS(19), rgba(236, 226, 206), RS(150), HorizontalTextAlignment.LEFT);
          // 手机右栏被导航栏压窄(sxR<1)时文字不随横坐标缩,当前值 / 箭头 / 下一级三段按「文字宽」排:箭头心 = 当前值右缘 + 24,下一级左缘 = 箭头心 + 22
          const curRight = ox(1500);
          const curLabel = label(plate, 'Cur', row.cur, curRight, 0, FS(21), rgba(250, 246, 236), RS(110), HorizontalTextAlignment.RIGHT, true);
          void curLabel;
          if (!maxed) {
            label(plate, 'Arrow', '→', curRight + FS(26), FS(2), FS(22), rgba(210, 200, 180), FS(30));
            label(plate, 'Next', row.next, curRight + FS(44), 0, FS(21), rgba(140, 230, 140), FS(90), HorizontalTextAlignment.LEFT, true);
            mountRefSolid(this.host, plate, 'UpBox', ox(1677), 0, FS(34), FS(34), rgba(8, 6, 6, 235));
            if (!this.host.addSprite('Up', FORGE_ENH_UP, ox(1677), 0, FS(25), FS(25), plate)) {
              label(plate, 'Up', '▲', ox(1677), FS(1), FS(18), rgba(96, 214, 96), RS(28), HorizontalTextAlignment.CENTER, true);
            }
          }
        });
        const chanceNow = Math.min(1, (ENHANCE_CHANCES[Math.min(level, ENHANCE_MAX_LEVEL - 1)] ?? 0.1) + (enhance.useBless ? 0.2 : 0));
        const failText = level < 5 ? '<color=#8CE68C>失败不降级</color>' : enhance.useGuard ? '<color=#8CE68C>失败不降级(守护符)</color>' : '<color=#F07060>失败强化等级 -1</color>';
        this.addRichLine(node, 'ForgeEnhLevelStatus', maxed
          ? '<color=#ECCE96>已达到强化上限 +20</color>'
          : `<color=#F07060>成功率 </color><color=#FFFFFF><size=${Math.round(FS(25))}>${Math.round(chanceNow * 100)}%</size></color><color=#C8BCA6>   ·   </color>${failText}`, QX(1462), QY(367) - FS(4), FS(20), rightW - FS(40));
      }
    }
    // 强化保护
    {
      const { node, QY, QX } = rightPanel('ForgeEnhProtectPanel', '强化保护', 410, 612);
      const protectRow = (name: string, py: number, icon: string, held: number, title: string, desc: string, on: boolean, onClick: () => void): void => {
        const rowNode = this.host.addChildPlainNode(node, name, QX(1460), QY(py), statRowW, FS(74));
        mountRefSliced(this.host, rowNode, 'Bg', on ? REF_ROW_SELECTED : REF_ROW, 0, 0, statRowW, FS(74));
        darkRow(rowNode, statRowW, FS(74), on ? 60 : 110);
        const ox = (px: number): number => QX(px) - QX(1460);
        const box = FS(64);
        mountRefSliced(this.host, rowNode, 'IconFrame', FORGE_REF_SLOT_FRAME, ox(1264), 0, box, box);
        this.host.addSprite('Icon', icon, ox(1264), FS(2), box * 0.78, box * 0.78, rowNode);
        label(rowNode, 'Held', `x${formatInteger(held)}`, ox(1264) + FS(4), -box / 2 + FS(9), FS(15), rgba(244, 232, 200), box, HorizontalTextAlignment.CENTER, true);
        label(rowNode, 'Title', title, ox(1318), FS(13), FS(20), rgba(248, 238, 214), RS(280), HorizontalTextAlignment.LEFT, true);
        label(rowNode, 'Desc', desc, ox(1318), -FS(14), FS(17), rgba(196, 188, 170), RS(280), HorizontalTextAlignment.LEFT);
        drawRefCheckbox(this.host, rowNode, 'Box', ox(1667), 0, FS(36), on, scale);
        if (!state.busy) {
          rowNode.addComponent(Button);
          rowNode.on(Button.EventType.CLICK, onClick, this);
          this.host.applyImageButtonFeedback(rowNode, 1.01, 0.99);
        }
      };
      protectRow('ForgeEnhBlessRow', 495, FORGE_AI_BLESS_ICON_ASSET, blessHeld, '祝福石保护', '成功率 +20%', enhance.useBless, () => this.host.toggleLobbyEquipEnhanceBless());
      protectRow('ForgeEnhGuardRow', 573, FORGE_AI_GUARD_ICON_ASSET, guardHeld, '守护符保护', '失败不降级', enhance.useGuard, () => this.host.toggleLobbyEquipEnhanceGuard());
    }
    // 强化等级预览:下一级 + 下一个 5 的倍数 + 20(去重,最多 3 行)
    {
      const { node, QY, QX } = rightPanel('ForgeEnhPreviewPanel', '强化等级预览', 628, 815);
      if (!target) {
        label(node, 'ForgeEnhPreviewEmpty', '选择装备后显示', 0, QY(735), FS(20), rgba(190, 184, 171), rightW - FS(40));
      } else {
        // 下一级 + 下一级之后的 5 的倍数 + 20(如 +9 → 10 / 15 / 20)
        const nextFive = (Math.floor((level + 1) / 5) + 1) * 5;
        const marks = Array.from(new Set([level + 1, nextFive, 20])).filter((lv) => lv > level && lv <= ENHANCE_MAX_LEVEL).sort((a, b) => a - b).slice(0, 3);
        if (marks.length === 0) {
          label(node, 'ForgeEnhPreviewMax', '已达到强化上限', 0, QY(735), FS(20), rgba(236, 206, 150), rightW - FS(40));
        }
        const primary = attrDefs[0] ?? null;
        const secondary = attrDefs[1] ?? null;
        marks.forEach((lv, index) => {
          const y = QY(694 + index * 42.5);
          const plate = this.host.addChildPlainNode(node, `ForgeEnhPreviewRow_${lv}`, QX(1460), y, statRowW, FS(38));
          mountRefSliced(this.host, plate, 'Bg', index === 0 ? REF_ROW_SELECTED : REF_ROW, 0, 0, statRowW, FS(38));
          darkRow(plate, statRowW, FS(38), index === 0 ? 60 : 110);
          const ox = (px: number): number => QX(px) - QX(1460);
          label(plate, 'Lv', `+${lv}`, ox(1270), 0, FS(22), rgba(252, 222, 140), RS(70), HorizontalTextAlignment.CENTER, true);
          const factor = 1 + 0.1 * lv;
          const parts = [primary, secondary].filter(Boolean).map((entry) => `${entry!.label} +${formatInteger(Math.round(entry!.value * factor))}`);
          label(plate, 'Text', parts.join('  ·  '), ox(1330), 0, FS(17), rgba(236, 228, 210), RS(350), HorizontalTextAlignment.LEFT);
        });
      }
    }

    // ── 中:舞台(锁定背景铁砧台,不随导航栏挪)──
    const cx = FX(865);
    if (!target) {
      label(parent, 'ForgeEnhCenterHint', '← 从左侧选择要强化的装备', cx, FY(420), FS(24), rgba(225, 215, 191), FS(420));
      return;
    }
    const tq = equipQualityColor(target.quality);
    const usesHighStone = level >= ENHANCE_HIGH_FROM_LEVEL;
    const stoneCost = stoneNeedOf(level);
    const goldCost = goldCostOf(level);
    // 装备立在铁砧台上:心 (865,330),高 330
    // 装备后垫一层暖色柔光(背景压暗后装备要亮起来,主次分明)
    const showcase = equipShowcaseAssetByCode(target.equipCode);
    // 装备立在铁砧台面上(台面受光边 y≈450,靴底压在 455)
    if (!showcase || !this.host.addSprite('ForgeEnhShowcase', showcase, cx, FY(292), FS(330), FS(330), parent)) {
      this.addEquipIcon(parent, 'ForgeEnhShowcase', target.equipCode, target.slot, FS(220), scale, FY(300));
    }
    this.fxAnchor = { x: cx + this.bodyOffsetX, y: FY(340) };
    this.powerAnchor = { x: cx + this.bodyOffsetX, y: FY(160) };
    // 信息区暗底(原型:名牌 ~ 消耗说明这一段压在暗色上,文字从熔岩里跳出来)
    const stageShade = this.host.addSprite('ForgeEnhStageShade', FORGE_FUSE_SOFT_SHADE, cx, FY(625), FS(600), FS(330), parent);
    if (stageShade) {
      stageShade.color = rgba(0, 0, 0, 165);
    }
    // 名牌 (870,507) + 「+N」金牌 (865,555) + 星条 (865,601)
    // 名牌:原型牌体 755..990 × 490..525(35 高)、字 22;素材含两端花饰,按 330×58 显示时暗芯约 36 高,字上下各留 7
    const plate = this.host.addChildPlainNode(parent, 'ForgeEnhNameBanner', FX(870), FY(507), FS(330), FS(58));
    this.host.addSprite('Art', FORGE_FUSE_NAME_PLATE.path, 0, 0, FS(330), FS(58), plate);
    label(plate, 'ForgeEnhName', safeText(target.equipName), 0, -FS(2), FS(22), rgba(lift(tq.r), lift(tq.g), lift(tq.b), 255), FS(220), HorizontalTextAlignment.CENTER, true);
    // 「+N」牌:原型牌体 140×45 + 两翼到 250 宽,字 38 → 素材按 230×70 显示(用户:牌要长一些)
    const lvPlaque = this.host.addChildPlainNode(parent, 'ForgeEnhLevelPlaque', cx, FY(556), FS(230), FS(70));
    this.host.addSprite('Art', FORGE_REF_LEVEL_PLAQUE_ASSET, 0, 0, FS(230), FS(70), lvPlaque);
    label(lvPlaque, 'Label', `+${level}`, 0, -FS(1), FS(40), rgba(252, 226, 150), FS(150), HorizontalTextAlignment.CENTER, true);
    // 星条:原型 710..1035 × 582..620,暗底 + 细金边(不是行底素材);星 25 步 27 从 747 起,「/20」在 1005
    const starBarW = FS(325);
    const starBarH = FS(38);
    const starBar = this.host.addChildPlainNode(parent, 'ForgeEnhStarBar', FX(872), FY(601), starBarW, starBarH);
    mountRefSolid(this.host, starBar, 'Bg', 0, 0, starBarW, starBarH, rgba(6, 5, 6, 175));
    const starLine = this.host.addChildPlainNode(starBar, 'Line', 0, 0, starBarW, starBarH).addComponent(Graphics);
    starLine.strokeColor = rgba(196, 156, 92, 150);
    starLine.lineWidth = Math.max(1, FS(1.4));
    starLine.roundRect(-starBarW / 2, -starBarH / 2, starBarW, starBarH, FS(6));
    starLine.stroke();
    this.renderEnhanceStars(starBar, 'Star', level, FX(747) - FX(872), 0, FS(25), FS(27));
    label(starBar, 'Cap', `${level}/20`, FX(1005) - FX(872), 0, FS(21), rgba(236, 226, 204), FS(64), HorizontalTextAlignment.CENTER, true);
    // 强化消耗 (865,640) + 消耗框 (670..1065 × 652..728)
    label(parent, 'ForgeEnhCostTitle', '强化消耗', cx, FY(640), FS(21), rgba(214, 202, 180), FS(200));
    // 消耗框 650..722;下面说明行留出与强化按钮顶饰的间距
    const costBox = this.host.addChildPlainNode(parent, 'ForgeEnhCostBox', FX(867), FY(686), FS(395), FS(72));
    mountRefSliced(this.host, costBox, 'Bg', REF_ROW, 0, 0, FS(395), FS(72));
    darkRow(costBox, FS(395), FS(72));
    const cxo = (px: number): number => FX(px) - FX(867);
    const costItem = (key: string, iconX: number, icon: string, need: number, held: number, name: string, showHeld: boolean): void => {
      const lacking = held < need;
      mountRefSliced(this.host, costBox, `${key}Frame`, FORGE_REF_SLOT_FRAME, cxo(iconX), 0, FS(62), FS(62));
      this.host.addSprite(`${key}Icon`, icon, cxo(iconX), 0, FS(48), FS(48), costBox);
      label(costBox, `${key}Count`, showHeld ? `${formatInteger(need)} / ${formatInteger(held)}` : formatInteger(need), cxo(iconX + 45), FS(12), FS(22), lacking ? rgba(240, 100, 80) : rgba(252, 248, 236), FS(130), HorizontalTextAlignment.LEFT, true);
      label(costBox, `${key}Name`, name, cxo(iconX + 45), -FS(16), FS(16), rgba(200, 192, 174), FS(130), HorizontalTextAlignment.LEFT);
    };
    costItem('Stone', 720, usesHighStone ? BAG_ICON_ENHANCE_STONE_HIGH_ASSET : BAG_ICON_ENHANCE_STONE_ASSET, stoneCost, stoneHeldOf(level), usesHighStone ? '高阶强化石' : '强化石', true);
    costItem('Gold', 935, BAG_ICON_GOLD_ASSET, goldCost, goldHeld, '金币', false);
    if (!usesHighStone) {
      // 原型:说明行心 740,离消耗框底(720)20
      label(parent, 'ForgeEnhCostNote', '+10 起改用高阶强化石', cx, FY(742), FS(17), rgba(196, 186, 166), FS(300));
    }

    // 按钮行 y 785:洗练词条(575..725)/ 强化(750..985,带锤)/ 连续强化勾选 + (i)
    const materialsOk = stoneHeldOf(level) >= stoneCost && goldHeld >= goldCost && (!enhance.useBless || blessHeld >= 1) && (!enhance.useGuard || guardHeld >= 1);
    const canEnhance = !state.busy && !maxed && materialsOk;
    const strikeThen = (action: () => void) => this.playEnhanceStrike(cx + this.bodyOffsetX, FY(380), scale, action);
    const shortfall: string[] = [];
    if (goldHeld < goldCost) {
      shortfall.push(`金币 ${formatInteger(goldHeld)}/${formatInteger(goldCost)}(还差 ${formatInteger(goldCost - goldHeld)})`);
    }
    if (stoneHeldOf(level) < stoneCost) {
      shortfall.push(`强化石 ${formatInteger(stoneHeldOf(level))}/${formatInteger(stoneCost)}`);
    }
    if (enhance.useBless && blessHeld < 1) {
      shortfall.push('祝福石不足');
    }
    if (enhance.useGuard && guardHeld < 1) {
      shortfall.push('守护符不足');
    }
    const shortfallText = `强化材料不足:${shortfall.join(' · ')}`;
    const onShortfall = !state.busy && !maxed && !materialsOk ? () => this.host.reportForgeMaterialShortfall(shortfallText, goldHeld < goldCost) : undefined;
    // 按钮行心 791:强化钮顶饰与说明行留出间距(原型 760..820)
    // 原型:按钮行心 788;强化 230×53(+翼)→ 显示 240×70;洗练词条 160×45 → 180×56(用户:要高要长)
    const btnY = FY(789);
    const mainW = FS(240);
    const mainH = FS(70);
    const main = this.host.addChildPlainNode(parent, 'ForgeEnhConfirm', FX(867), btnY, mainW, mainH);
    mountRefPlate(this.host, main, 'Art', REF_ULT.btnPrimary, 0, 0, mainW, mainH);
    const mainText = state.busy ? '强化中…' : maxed ? '已满级' : materialsOk ? '强化' : '材料不足';
    if (materialsOk && !maxed && !state.busy) {
      if (!this.host.addSprite('Hammer', FORGE_ENH_HAMMER, -FS(44), 0, FS(38), FS(38), main)) {
        this.host.addSprite('Hammer', FORGE_REF_HAMMERS_ASSET, -FS(44), 0, FS(34), FS(34), main);
      }
    }
    const mainLabel = label(main, 'Label', mainText, materialsOk && !maxed && !state.busy ? FS(20) : 0, FS(1), FS(28), canEnhance ? rgba(255, 240, 210) : rgba(220, 206, 186), mainW * 0.55, HorizontalTextAlignment.CENTER, true);
    fitButtonLabel(mainLabel, mainH, 0.4);
    if (canEnhance) {
      main.addComponent(Button);
      main.on(Button.EventType.CLICK, () => strikeThen(() => (forge.autoRepeat ? this.host.autoEnhanceLobbyEquipment(target.id) : this.host.enhanceLobbyEquipment(target.id))), this);
      this.host.applyImageButtonFeedback(main, 1.03, 0.97);
    } else if (onShortfall) {
      main.addComponent(Button);
      main.on(Button.EventType.CLICK, onShortfall, this);
    }
    if (!canEnhance) {
      main.addComponent(UIOpacity).opacity = 200;
    }
    const rerollable = ['PURPLE', 'GOLD', 'RED'].includes((target.quality || '').toUpperCase());
    const reroll = this.host.addChildPlainNode(parent, 'ForgeEnhReroll', FX(645), btnY, FS(180), FS(56));
    mountRefPlate(this.host, reroll, 'Art', REF_ULT.btnSecondary, 0, 0, FS(180), FS(56));
    const rerollLabel = label(reroll, 'Label', rerollable ? '洗练词条' : '紫装起可洗', 0, FS(1), FS(19), rerollable ? rgba(250, 236, 206) : rgba(176, 166, 150), FS(110), HorizontalTextAlignment.CENTER, true);
    fitButtonLabel(rerollLabel, FS(56), 0.36);
    if (rerollable && !state.busy) {
      reroll.addComponent(Button);
      reroll.on(Button.EventType.CLICK, () => this.host.openLobbyForgeRerollDialog(), this);
      this.host.applyImageButtonFeedback(reroll, 1.03, 0.97);
    } else {
      reroll.addComponent(UIOpacity).opacity = 180;
    }
    const repeat = this.host.addChildPlainNode(parent, 'ForgeEnhRepeat', FX(1065), btnY, FS(150), FS(52));
    drawRefCheckbox(this.host, repeat, 'Box', -FS(55), 0, FS(32), forge.autoRepeat, scale);
    label(repeat, 'ForgeEnhRepeatLabel', '连续强化', -FS(32), 0, FS(21), forge.autoRepeat ? rgba(255, 230, 160) : rgba(236, 226, 206), FS(110), HorizontalTextAlignment.LEFT, true);
    if (!state.busy) {
      repeat.addComponent(Button);
      repeat.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeAutoRepeat(), this);
    }
    const info = this.host.addChildPlainNode(parent, 'ForgeEnhRepeatInfo', FX(1158), btnY, FS(46), FS(46));
    this.host.addSprite('Ring', REF_ICON_RING_ASSET, 0, 0, FS(44), FS(44), info);
    label(info, 'I', 'i', 0, 0, FS(24), rgba(240, 222, 176), FS(36), HorizontalTextAlignment.CENTER, true);

    // 筛选下拉菜单(最后渲染,盖在列表上;从筛选钮往上展开)
    if (forge.enhanceFilterOpen) {
      const options: { key: string | null; label: string }[] = [
        { key: null, label: '全部稀有度' },
        ...EQUIP_QUALITY_ORDER.map((quality) => ({ key: quality as string | null, label: equipQualityLabel(quality) })),
      ];
      const menuW = filterW;
      const menuRowH = FS(40);
      const menuH = options.length * menuRowH + FS(14);
      const menu = this.host.addChildPlainNode(listPanel, 'ForgeEnhFilterMenu', PX(220), filterY + FS(22) + menuH / 2 + FS(6), menuW, menuH);
      menu.addComponent(BlockInputEvents);
      mountRefSolid(this.host, menu, 'Back', 0, 0, menuW, menuH, rgba(14, 12, 11, 248));
      mountRefSliced(this.host, menu, 'Frame', FORGE_REF_ROW_NORMAL, 0, 0, menuW, menuH);
      options.forEach((option, index) => {
        const y = menuH / 2 - FS(7) - menuRowH / 2 - index * menuRowH;
        const active = forge.enhanceRarity === option.key;
        const optColor = option.key ? equipQualityColor(option.key) : { r: 214, g: 198, b: 162 };
        const opt = this.host.addChildPlainNode(menu, `ForgeEnhFilterOpt_${option.key ?? 'ALL'}`, 0, y, menuW - FS(14), menuRowH - FS(4));
        if (active) {
          mountRefSolid(this.host, opt, 'Hl', 0, 0, menuW - FS(14), menuRowH - FS(4), rgba(66, 46, 16, 230));
        }
        label(opt, 'Label', option.label, 0, 0, FS(20), rgba(optColor.r, optColor.g, optColor.b, 255), menuW - FS(24));
        opt.addComponent(Button);
        opt.on(Button.EventType.CLICK, () => this.host.setLobbyForgeEnhanceRarity(option.key), this);
        this.host.applyImageButtonFeedback(opt, 1.02, 0.98);
      });
    }
    void hex;
  }

  /** 强化星条:10 颗星对应 +20(每 2 级一颗)。 */
  private renderEnhanceStars(parent: Node, name: string, enhanceLevel: number, x: number, y: number, starSize: number, step: number): void {
    const filled = Math.min(10, Math.floor(enhanceLevel / 2));
    for (let index = 0; index < 10; index += 1) {
      const on = index < filled;
      // 小尺寸(列表行)新金星发闷 → 用旧亮黄星;大星条用新金星
      const small = starSize < 20;
      const sprite = this.host.addSprite(`${name}_${index}`, small ? (on ? STAR_FILLED_ASSET : STAR_EMPTY_ASSET) : (on ? FORGE_ENH_STAR_ON : FORGE_ENH_STAR_OFF), x + index * step, y, starSize, starSize, parent)
        ?? this.host.addSprite(`${name}_${index}`, on ? STAR_FILLED_ASSET : STAR_EMPTY_ASSET, x + index * step, y, starSize, starSize, parent);
      if (!sprite) {
        mountRefSolid(this.host, parent, `${name}_${index}`, x + index * step, y, starSize * 0.6, starSize * 0.6, index < filled ? rgba(244, 202, 92, 240) : rgba(70, 62, 50, 200));
      }
    }
  }

  // 锤击前摇:铸造台上光点蓄力 + 火花四溅(0.45s),结束后才发起强化请求;期间全屏挡输入防连点。
  private playEnhanceStrike(x: number, y: number, scale: number, onDone: () => void): void {
    const node = this.host.createUiNode(`LobbyForgeStrike_${Date.now()}`);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(300 * scale, 300 * scale));
    const blocker = this.host.addChildPlainNode(node, 'ForgeStrikeBlocker', 0, 0, 4000, 4000);
    blocker.addComponent(BlockInputEvents);
    // 蓄力光点。
    const glow = this.host.addChildPlainNode(node, 'ForgeStrikeGlow', 0, 0, 160 * scale, 160 * scale);
    const gg = glow.addComponent(Graphics);
    gg.fillColor = rgba(255, 214, 110, 150);
    gg.circle(0, 0, 52 * scale);
    gg.fill();
    gg.fillColor = rgba(255, 246, 214, 200);
    gg.circle(0, 0, 22 * scale);
    gg.fill();
    const glowOpacity = glow.addComponent(UIOpacity);
    glowOpacity.opacity = 0;
    tween(glowOpacity)
      .to(0.16, { opacity: 255 })
      .to(0.24, { opacity: 60 })
      .start();
    glow.setScale(new Vec3(0.5, 0.5, 1));
    tween(glow)
      .to(0.16, { scale: new Vec3(1.15, 1.15, 1) })
      .to(0.24, { scale: new Vec3(0.9, 0.9, 1) })
      .start();
    // 8 颗火花:锤击瞬间(0.16s 后)向外飞散。
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 + Math.PI / 16;
      const spark = this.host.addChildPlainNode(node, `ForgeStrikeSpark_${index}`, 0, 0, 16 * scale, 16 * scale);
      const sg = spark.addComponent(Graphics);
      sg.fillColor = rgba(255, 200, 96, 235);
      sg.moveTo(0, 6 * scale);
      sg.lineTo(4 * scale, 0);
      sg.lineTo(0, -6 * scale);
      sg.lineTo(-4 * scale, 0);
      sg.close();
      sg.fill();
      const sparkOpacity = spark.addComponent(UIOpacity);
      sparkOpacity.opacity = 0;
      const dx = Math.cos(angle) * (90 + (index % 3) * 26) * scale;
      const dy = Math.sin(angle) * (70 + (index % 2) * 30) * scale - 20 * scale;
      tween(sparkOpacity)
        .delay(0.16)
        .to(0.03, { opacity: 255 })
        .to(0.26, { opacity: 0 })
        .start();
      tween(spark)
        .delay(0.16)
        .to(0.29, { position: new Vec3(dx, dy, 0) })
        .start();
    }
    tween(node)
      .delay(0.45)
      .call(() => {
        onDone();
      })
      // 2026-10-16:锻造页单次操作不再先整页重绘,锤击节点(含全屏防连点遮罩)不会被顺带清掉,播完自己销毁
      .delay(0.35)
      .call(() => {
        if (node.isValid) {
          node.destroy();
        }
      })
      .start();
  }

  // ===== 合成页签:三装备槽 + 一键放入 + 合成;下方分组行点击载入 =====
  private renderFuseTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: { fuseSlotIds: number[] },
    panelWidth: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    const fuse = this.host.currentLobbyEquipFuseState();
    const luckOn = fuse.useLuckStone;
    const luckCount = this.bagCount('FUSION_LUCK_STONE');
    const slotIds = forge.fuseSlotIds.filter((id) => state.items.some((item) => item.id === id && item.heroId == null));
    const slotItems = slotIds.map((id) => state.items.find((item) => item.id === id)!).filter(Boolean);
    const groups = this.collectFuseGroups(state.items);
    const ready = slotItems.length >= 3;
    const quality = slotItems.length > 0 ? (slotItems[0].quality || '').toUpperCase() : '';
    const nextQuality = quality ? EQUIP_QUALITY_ORDER[EQUIP_QUALITY_ORDER.indexOf(quality) + 1] ?? '' : '';
    const chance = ready ? Math.min(0.95, (EQUIP_FUSE_BASE_CHANCE[quality] ?? 0) + (luckOn ? 0.2 : 0)) : 0;

    // 右栏沿用内容区映射:u = 内容区宽 / 1700(原型 1870 里右 170 是导航栏,本页 panelWidth 已扣掉),原点取内容区中心
    const u = panelWidth / 1700;
    const PX = (px: number): number => (px - 850) * u;
    const PS = (v: number): number => v * u;
    const rightW = PS(615);
    const rightCx = PX(1392);

    // ── 左侧祭坛区(2026-10-20 按 10-19 原型 1:1):整屏原型坐标 1870×841,与合成背景(原型去 UI 重绘)同一缩放 k、同一中心(面板中心),
    //    槽位 / 产物 / 名牌 / 概率石 / 按钮都落在背景里的祭坛、金环上;背景未到货时退回旧传送门图
    const k = this.fuseBgK > 0 ? this.fuseBgK : Math.min(this.stageW / 1870, this.stageH / 841);
    const FX = (px: number): number => (px - 935) * k - this.bodyOffsetX;
    const FY = (py: number): number => (420.5 - py) * k;
    const FS = (v: number): number => v * k;
    const ring = FORGE_FUSE_BG.ring;
    const ringCx = FX(ring.cx);
    const ringCy = FY(ring.cy);
    const slotSize = FS(112);
    this.fxAnchor = { x: ringCx + this.bodyOffsetX, y: ringCy };
    this.powerAnchor = { x: ringCx + this.bodyOffsetX, y: FY(470) };

    // 三槽:左 / 顶 / 右(原型 (277,364) / (591,123) / (912,364),边 112);能量线先画(压在槽之下)
    // 新背景的环更大更靠上:两侧槽放到祭坛基座两旁(y 470),顶槽放环尖上方(y 95),都避开环
    // 顶槽骑在环顶(环顶 y150,槽心 135 → 槽底 191 压住环顶 40,"材料流入环"),槽顶 79 不碰货币栏(底 ~70);两侧槽在祭坛基座两旁
    const slotPos = [
      { x: FX(300), y: FY(470) },
      { x: FX(605), y: FY(135) },
      { x: FX(910), y: FY(470) },
    ];
    // 连线(2026-10-20 用户「做成和原型一样,动态特效」):波浪电光,起点 = 槽框内缘,终点 = 金环外缘(原型坐标)
    const beamEnds: Array<[number, number, number, number]> = [
      [335, 364, 462, 372],
      [591, 214, 591, 262],
      [848, 364, 720, 372],
    ];
    // 2026-10-22 去 AI 感:电光全部关掉(新环几何下顶槽紧贴环尖,线段只剩几像素;满屏特效也是 AI 味来源)
    void beamEnds;
    if (!this.fuseBgShown) {
      // 背景未到货:旧传送门图兜底,环心对准同一点
      const portalW = FS(ring.r * 2) / FORGE_REF_FUSE_PORTAL.ringDF;
      const portalH = portalW * (FORGE_REF_FUSE_PORTAL.h / FORGE_REF_FUSE_PORTAL.w);
      this.host.addSprite('ForgeFuseAltarArt', FORGE_REF_FUSE_PORTAL.path, ringCx, ringCy - portalH * FORGE_REF_FUSE_PORTAL.ringCyF, portalW, portalH, parent);
    }
    // 环心:产物预览(下一稀有度同部位);没放满时淡显问号,中心对准金环圆心
    // 产物:透明展示图(ui/forge/showcase,和图标同名);缺图退方形图标
    const previewSize = FS(ring.r * 2 * 0.78);
    const previewAsset = ready ? equipShowcaseAssetByQualitySlot(nextQuality, slotItems[0].slot) ?? equipIconAssetByQualitySlot(nextQuality, slotItems[0].slot) : null;
    // 环心压暗(亮紫漩涡抢眼,产物显暗)+ 产物背后淡紫柔光
    const ringShade = this.host.addSprite('ForgeFuseRingShade', FORGE_FUSE_SOFT_SHADE, ringCx, ringCy, FS(ring.r * 2.1), FS(ring.r * 2.1), parent);
    if (ringShade) {
      ringShade.color = rgba(0, 0, 0, 90);
    }
    if (previewAsset) {
      const art = this.host.addSprite('ForgeFusePreview', previewAsset, ringCx, ringCy, previewSize, previewSize, parent);
      if (art) {
        // 加亮:同图作子节点叠一层加色混合(随呼吸缩放一起动);Sprite 颜色只能压暗不能提亮,只能靠混合模式
        const boost = this.host.addSprite('Boost', previewAsset, 0, 0, previewSize, previewSize, art.node);
        if (boost) {
          boost.color = rgba(255, 240, 255, 150);
          const blend = boost as unknown as { _srcBlendFactor: number; _dstBlendFactor: number; _updateBlendFunc: () => void };
          blend._srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
          blend._dstBlendFactor = gfx.BlendFactor.ONE;
          blend._updateBlendFunc();
        }
      }
      if (art) {
        tween(art.node).repeatForever(tween(art.node).to(1.1, { scale: new Vec3(1.06, 1.06, 1) }).to(1.1, { scale: new Vec3(1, 1, 1) })).start();
      }
    } else if (!ready) {
      const q = this.host.addChildLabel(parent, 'ForgeFusePreviewHint', '?', ringCx, ringCy, FS(120), rgba(232, 206, 255, 165), new Size(previewSize, previewSize));
      q.isBold = true;
      q.lineHeight = q.fontSize;
      q.verticalAlign = Label.VerticalAlign.CENTER;
      this.applyOutline(q, scale, false);
    }
    slotPos.forEach((pos, index) => {
      const item = slotItems[index] ?? null;
      const q = item ? equipQualityColor(item.quality) : null;
      const slot = this.host.addChildPlainNode(parent, `ForgeFuseSlot_${index}`, pos.x, pos.y, slotSize, slotSize);
      if (item && q) {
        // 原型:放入后是稀有度发光框图标(新图标自带框,满格贴)+ 右上「+N」+ 下方暗底名签(稀有度色字)
        const iconArt = equipIconAssetByCode(item.equipCode);
        if (iconArt) {
          mountEquipIconBacking(this.host, slot, `ForgeFuseSlotIconBacking_${index}`, slotSize, item.equipCode);
        }
        if (!iconArt || !this.host.addSprite(`ForgeFuseSlotIcon_${index}`, iconArt, 0, 0, slotSize, slotSize, slot)) {
          const frame = FORGE_REF_CELL_FRAMES[(item.quality || '').toUpperCase()];
          if (!frame || !this.host.addSprite(`ForgeFuseSlotArt_${index}`, frame, 0, 0, slotSize * 1.08, slotSize * 1.08, slot)) {
            this.host.addSprite(`ForgeFuseSlotArt_${index}`, FORGE_REF_FUSE_SLOT_ASSET, 0, 0, slotSize, slotSize, slot);
          }
          this.addEquipIcon(slot, `ForgeFuseSlotIcon_${index}`, item.equipCode, item.slot, slotSize * 0.8, scale);
        }
        const lv = this.host.addChildLabel(slot, 'Lv', `+${item.enhanceLevel ?? 0}`, slotSize / 2 - FS(8), slotSize / 2 - FS(14), FS(20), rgba(255, 246, 228), new Size(FS(56), FS(24)), HorizontalTextAlignment.RIGHT);
        lv.lineHeight = lv.fontSize;
        lv.isBold = true;
        this.applyOutline(lv, scale, true);
        const nameW = FS(128);
        const nameH = FS(30);
        // 顶槽不挂名签(上方是货币栏、下方是环尖,两头都没位置;三件同名,两侧槽已标);两侧槽名签在槽下
        if (index !== 1) {
          const chip = this.host.addChildPlainNode(parent, `ForgeFuseSlotChip_${index}`, pos.x, pos.y - FS(74), nameW, nameH);
          const cg = chip.addComponent(Graphics);
          cg.fillColor = rgba(6, 5, 8, 225);
          cg.roundRect(-nameW / 2, -nameH / 2, nameW, nameH, FS(6));
          cg.fill();
          const nm = this.host.addChildLabel(chip, 'Name', safeText(item.equipName), 0, 0, FS(22), rgba(q.r, q.g, q.b, 255), new Size(nameW - FS(8), nameH));
          nm.overflow = Label.Overflow.SHRINK;
          nm.lineHeight = nm.fontSize;
          nm.isBold = true;
          this.applyOutline(nm, scale, false);
        }
        if (!state.busy) {
          slot.addComponent(Button);
          slot.on(Button.EventType.CLICK, () => this.host.setLobbyForgeFuseSlots(slotIds.filter((id) => id !== item.id)), this);
          this.host.applyImageButtonFeedback(slot);
        }
      } else {
        // 空槽素材四周有透明留边:按可见框 = 原型 109 放大 1.4
        this.host.addSprite(`ForgeFuseSlotArt_${index}`, FORGE_REF_FUSE_SLOT_ASSET, 0, 0, slotSize * 1.4, slotSize * 1.4, slot);
        const plus = this.host.addChildLabel(slot, 'Plus', '+', 0, 0, slotSize * 0.5, rgba(150, 190, 255, 180), new Size(slotSize, slotSize));
        plus.lineHeight = plus.fontSize;
        plus.verticalAlign = Label.VerticalAlign.CENTER;
      }
    });

    // ── 名牌 + 两行大字信息(心 y 562 / 597);文字下垫柔边暗底(原型有,不垫的话压在火光台阶上看不清) ──
    const nq = nextQuality ? equipQualityColor(nextQuality) : { r: 236, g: 222, b: 196 };
    // 文字暗底:建在文字之前(压在下面),尺寸等文字排好后按实测宽度回填(左右留 40、上下留 14)
    const textShade = this.host.addSprite('ForgeFuseInfoShade', FORGE_FUSE_SOFT_SHADE, FX(597), FY(ready ? 580 : 578), FS(ready ? 600 : 700), FS(ready ? 100 : 64), parent);
    if (textShade) {
      textShade.color = rgba(4, 3, 5, 225);
    }
    // 原型名牌:含端饰宽 ≈ 300、高 ≈ 56,心 (597, 507);名牌 / 配方 / 提示都以 x 597 居中
    const plateW = FS(300);
    const plateH = FS(62);
    const plate = this.host.addChildPlainNode(parent, 'ForgeFuseResultPlate', FX(597), FY(507), plateW, plateH);
    if (!this.host.addSprite('Art', FORGE_FUSE_NAME_PLATE.path, 0, 0, plateW, plateH, plate)) {
      mountRefPlate(this.host, plate, 'Art', REF_PLATE_DARK, 0, 0, FS(330), FS(50));
    }
    // 产物名:玩家现有装备里同稀有度同部位的一件(名字由后端给,前端没有名字表);没有就退回「紫装 · 武器」
    const previewName = ready ? state.items.find((item) => (item.quality || '').toUpperCase() === nextQuality && item.slot === slotItems[0].slot)?.equipName ?? null : null;
    const plateText = ready ? safeText(previewName || `${equipQualityLabel(nextQuality)} · ${slotLabelOf(slotItems[0].slot)}`) : slotItems.length > 0 ? `已放入 ${slotItems.length}/3 件` : '放入材料后预览产物';
    const plateTextSize = ready ? FS(30) : FS(24);
    const plateLabel = this.host.addChildLabel(plate, 'Txt', plateText, 0, -plateH * (3.5 / 185) - plateTextSize * 0.08, plateTextSize, ready ? rgba(nq.r, nq.g, nq.b, 255) : rgba(246, 226, 180), new Size(FS(220), FS(40)));
    plateLabel.overflow = Label.Overflow.SHRINK;
    plateLabel.isBold = true;
    plateLabel.lineHeight = plateLabel.fontSize;
    this.applyOutline(plateLabel, scale, true);
    const white = rgba(244, 236, 220);
    if (ready) {
      const q = equipQualityColor(quality);
      const hex = (c: { r: number; g: number; b: number }): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
      const W = '#f4ecdc';
      const Y = '#ffdc5a';
      // 箭头用贴图(系统字体的 → 太细);三段先建好再按实测宽度整行居中(x 597)
      const arrowW = FS(34);
      const gapW = FS(10);
      const left = this.addRichLine(parent, 'ForgeFuseInfoL', `<color=${W}>${slotLabelOf(slotItems[0].slot)} · </color><color=${hex(q)}>${equipQualityLabel(quality)}</color><color=${W}> ×3</color>`, FX(597), FY(579), FS(29), FS(300), 0);
      const recipeArrow = this.host.addSprite('ForgeFuseInfoArrow', FORGE_FUSE_ARROW, FX(597), FY(579), arrowW, arrowW * (72 / 88), parent);
      if (recipeArrow) {
        recipeArrow.color = rgba(244, 236, 220);
      }
      const right = this.addRichLine(parent, 'ForgeFuseInfoR', `<color=${hex(nq)}>${equipQualityLabel(nextQuality)}</color><color=${W}> ×1</color>`, FX(597), FY(579), FS(29), FS(300), 0);
      const lw = left.getComponent(UITransform)?.width ?? FS(180);
      const rw = right.getComponent(UITransform)?.width ?? FS(110);
      const total = lw + gapW + arrowW + gapW + rw;
      const x0 = FX(597) - total / 2;
      left.setPosition(x0, FY(579), 0);
      recipeArrow?.node.setPosition(x0 + lw + gapW + arrowW / 2, FY(579), 0);
      right.setPosition(x0 + lw + gapW + arrowW + gapW, FY(579), 0);
      const line2 = this.addRichLine(parent, 'ForgeFuseInfo2', `<color=${W}>成功率 </color><color=${Y}>${Math.round(chance * 100)}%</color><color=${W}>  ·  金币 </color><color=${Y}>${formatInteger(EQUIP_FUSE_GOLD_COST[quality] ?? 0)}</color>`, FX(597), FY(615), FS(29), FS(600));
      const w2 = line2.getComponent(UITransform)?.width ?? FS(300);
      // 暗底:柔边羽化约占上下各 12%,可见芯 544..650;两行文字 564..630(行心 579 / 615),上下各留 20;顶端羽化压在名牌下面
      textShade?.node.setPosition(FX(597), FY(597), 0);
      textShade?.node.getComponent(UITransform)?.setContentSize(new Size(Math.max(total, w2) + FS(80) * 2, FS(140)));
    } else {
      const tip = this.host.addChildLabel(parent, 'ForgeFuseInfo', '从右侧列表点一组,或用「一键放入」自动装填 3 件', FX(597), FY(578), FS(24), rgba(236, 224, 200), new Size(FS(560), FS(32)));
      tip.overflow = Label.Overflow.SHRINK;
      tip.lineHeight = tip.fontSize;
      this.applyOutline(tip, scale, false);
    }

    // ── 概率石行(原型 345..835 × 675..725):勾选框 (370) 边 32 / 绿宝石 (417) 径 44 / 文字 448 起 / ×N 绿字 770 起 ──
    //    (2026-10-20 用户:移除成功率与概率石之间的规则说明条)
    // 框内统一缩进 PAD(原型像素 16):概率石行 / 右栏行 / 名牌都按它留边
    const PAD = 16;
    const luckW = FS(490);
    const luckH = FS(50);
    const luckCx = FX(590);
    const luckY = FY(692);
    const luckShadow = this.host.addSprite('ForgeFuseLuckShadow', FORGE_FUSE_SOFT_SHADE, luckCx, luckY - FS(4), luckW + FS(70), luckH + FS(36), parent);
    if (luckShadow) {
      luckShadow.color = rgba(0, 0, 0, 200);
    }
    const luckRow = this.host.addChildPlainNode(parent, 'ForgeFuseLuck', luckCx, luckY, luckW, luckH);
    if (!mountRefPlate(this.host, luckRow, 'Art', FORGE_FUSE_LUCK_ROW, 0, 0, luckW, luckH)) {
      mountRefPlate(this.host, luckRow, 'Art', REF_PLATE_DARK, 0, 0, luckW, luckH);
    }
    const lx = (px: number): number => FX(px) - luckCx;
    const rowLeft = 590 - 245;
    drawRefCheckbox(this.host, luckRow, 'ForgeFuseLuckBox', lx(rowLeft + PAD + 16), 0, FS(32), luckOn, scale);
    if (!this.host.addSprite('ForgeFuseLuckIcon', FORGE_FUSE_LUCK_GEM, lx(rowLeft + PAD + 32 + 10 + 20), 0, FS(40), FS(40), luckRow)) {
      this.host.addSprite('ForgeFuseLuckIcon', FORGE_LUCK_STONE_ICON_ASSET, lx(rowLeft + PAD + 32 + 10 + 20), 0, FS(36), FS(36), luckRow);
    }
    const luckLabel = this.host.addChildLabel(luckRow, 'ForgeFuseLuckLabel', '合成概率石 +20%(上限 95%)', lx(rowLeft + PAD + 32 + 10 + 40 + 10), 0, FS(24), rgba(250, 246, 236), new Size(FS(300), FS(34)), HorizontalTextAlignment.LEFT);
    luckLabel.isBold = true;
    luckLabel.enableWrapText = false;
    luckLabel.overflow = Label.Overflow.SHRINK;
    luckLabel.lineHeight = luckLabel.fontSize;
    this.applyOutline(luckLabel, scale, false);
    const luckNum = this.host.addChildLabel(luckRow, 'ForgeFuseLuckCount', `×${formatInteger(luckCount)}`, lx(590 + 245 - PAD), 0, FS(24), luckCount > 0 ? rgba(120, 230, 140) : rgba(240, 120, 100), new Size(FS(80), FS(34)), HorizontalTextAlignment.RIGHT);
    luckNum.lineHeight = luckNum.fontSize;
    luckNum.isBold = true;
    this.applyOutline(luckNum, scale, false);
    if (!state.busy) {
      luckRow.addComponent(Button);
      luckRow.on(Button.EventType.CLICK, () => this.host.toggleLobbyEquipFuseLuckStone(), this);
    }

    // ── 双钮(原型:一键放入 心 (417,765) 宽 255 / 合成 心 (713,767) 宽 292;带翼饰,同终极技能钮)──
    const autoGroups = groups.filter((group) => group.items.length >= 3);
    const canAuto = !state.busy && autoGroups.length > 0;
    const canFuse = ready && !state.busy && !(luckOn && luckCount <= 0);
    const wingButton = (name: string, text: string, px: number, py: number, w: number, h: number, item: RefKitItem, enabled: boolean, onClick: () => void): void => {
      const btnShadow = this.host.addSprite(`${name}Shadow`, FORGE_FUSE_SOFT_SHADE, FX(px), FY(py) - FS(6), FS(w) + FS(40), FS(h) + FS(30), parent);
      if (btnShadow) {
        btnShadow.color = rgba(0, 0, 0, 190);
      }
      const holder = this.host.addChildPlainNode(parent, name, FX(px), FY(py), FS(w), FS(h));
      mountRefPlate(this.host, holder, 'Art', item, 0, 0, FS(w), FS(h));
      const label = this.host.addChildLabel(holder, 'Label', text, 0, FS(1), FS(30), enabled ? rgba(255, 240, 210) : rgba(206, 194, 176), new Size(FS(w) * 0.6, FS(h) * 0.7));
      label.isBold = true;
      fitButtonLabel(label, FS(h), 0.4);
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, true);
      if (enabled) {
        holder.addComponent(Button);
        holder.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(holder, 1.03, 0.97);
      } else {
        holder.addComponent(UIOpacity).opacity = 205;
      }
    };
    wingButton('ForgeFuseAuto', '一键放入', 417, 762, 262, 76, REF_ULT.btnSecondary, canAuto,
      () => this.host.setLobbyForgeFuseSlots(autoGroups[0].items.slice(0, 3).map((item) => item.id)));
    wingButton('ForgeFuseConfirm', state.busy ? '合成中…' : '合 成', 713, 762, 296, 82, REF_ULT.btnPrimary, canFuse, () => this.host.fuseLobbyForgeSelected());

    // ── 右栏:「可合成装备」面板(金边行,够 3 件的组亮金行 + 铜钮,不够的压暗) ──
    // 2026-10-20 按原型整屏坐标(与左侧同一 k):面板 1080..1705 × 88..788,标题靠左;10 行刚好放满(行 54 + 间 8.7)
    // 右缘 = min(原型 1705, 导航栏左缘 - 14);不够时左缘最多外扩 60(原型右槽在 970,留得下)。导航栏贴安全区右缘,刘海机上比原型靠左
    const railLeftPx = (this.stageW / 2 - 6 * scale - FORGE_PHONE_RAIL_W * scale) / k + 935;
    const sideR = Math.min(1705, railLeftPx - 14);
    const sideL = 1080 - Math.min(60, Math.max(0, 1705 - sideR));
    const sideW = FS(sideR - sideL);
    const sideH = FS(788 - 88);
    const sideCx = FX((sideL + sideR) / 2);
    // 层次:面板外一圈柔边投影 + 底色加深(原来 218 半透,背景透上来像融在一起)
    const sideShadow = this.host.addSprite('ForgeFuseGroupsShadow', FORGE_FUSE_SOFT_SHADE, sideCx, FY((88 + 788) / 2) - FS(8), sideW + FS(90), sideH + FS(90), parent);
    if (sideShadow) {
      sideShadow.color = rgba(0, 0, 0, 215);
    }
    const side = mountRefTitledPanel(this.host, parent, 'ForgeFuseGroupsFrame', sideCx, FY((88 + 788) / 2), sideW, sideH, scale, '可合成装备', { bandH: FS(56), fontSize: FS(30), center: false, fill: rgba(10, 8, 7, 242), legacyRed: true });
    const rowL = sideL + 15;
    const rowR = sideR - 15;
    const rowW = FS(rowR - rowL);
    // 2026-10-20 用户:行边框要高于图标(图标不缩)——图标 56、行高 66(上下各留 5),9 行刚好放满列表区
    const rowH = FS(66);
    const rowGap = FS(626 / 9 - 66);
    const listTop = FY(154) - FY((88 + 788) / 2);
    const listBottom = FY(780) - FY((88 + 788) / 2);
    void rightW;
    void rightCx;
    if (groups.length <= 0) {
      const empty = this.host.addChildLabel(side.node, 'ForgeFuseGroupsEmpty', '没有可合成的未穿戴装备组', 0, (listTop + listBottom) / 2, 19 * scale, rgba(190, 184, 171), new Size(rowW, 30 * scale));
      empty.lineHeight = empty.fontSize;
    }
    const scroll = this.addPhoneScroll(side.node, 'ForgeFuseGroups', FX((rowL + rowR) / 2) - sideCx, listTop, listBottom, rowW, groups.length * (rowH + rowGap) + rowGap, scale);
    const loadedKey = slotItems.length > 0 ? `${slotItems[0].slot}:${quality}` : '';
    groups.forEach((group, index) => {
      const cy = scroll.topY - rowGap / 2 - rowH / 2 - index * (rowH + rowGap);
      const q = equipQualityColor(group.quality);
      const enough = group.items.length >= 3;
      const loaded = `${group.slot}:${group.quality}` === loadedKey;
      const row = this.host.addChildPlainNode(scroll.content, `ForgeFuseGroup_${group.slot}_${group.quality}`, 0, cy, rowW, rowH);
      if (!mountRefSliced(this.host, row, 'Art', loaded ? REF_ROW_SELECTED : REF_ROW, 0, 0, rowW, rowH)) {
        const rg = row.addComponent(Graphics);
        rg.fillColor = rgba(14, 12, 11, 230);
        rg.roundRect(-rowW / 2, -rowH / 2, rowW, rowH, 7 * scale);
        rg.fill();
      }
      if (!enough) {
        row.addComponent(UIOpacity).opacity = 200;
      }
      // 2026-10-20 用户「右侧栏图标再大一些」:50 → 60
      // 图标 56(不缩),行高 66 上下各留 5;离行左缘只留 8(原来空位偏大)
      this.renderEquipIconBox(row, 'ForgeFuseGroupIcon', group.items[0], FS(8 + 28) - rowW / 2, 0, FS(56), scale, true);
      const btnW = FS(200);
      const name = this.host.addChildLabel(row, 'ForgeFuseGroupName', `${slotLabelOf(group.slot)} · ${equipQualityLabel(group.quality)} ×${group.items.length}`, FS(8 + 56 + 16) - rowW / 2, 0, FS(26), rgba(q.r, q.g, q.b, 255), new Size(FS(240), FS(34)), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      name.lineHeight = name.fontSize;
      this.applyOutline(name, scale, false);
      if (enough) {
        // 按钮字照原型:粗体金字
        const load = mountRefPlateButton(this.host, row, 'Load', loaded ? '已放入' : '点击放入 →', rowW / 2 - FS(PAD) - btnW / 2, 0, btnW, FS(46), scale, 'dark', !state.busy && !loaded,
          () => this.host.setLobbyForgeFuseSlots(group.items.slice(0, 3).map((item) => item.id)), { fontSize: FS(24) });
        const loadLabel = load.getChildByName('Label')?.getComponent(Label);
        if (loadLabel) {
          loadLabel.color = rgba(255, 220, 130);
          loadLabel.isBold = true;
          if (!loaded) {
            loadLabel.string = '点击放入';
            loadLabel.node.setPosition(-FS(16), 0, 0);
            // 粗箭头用贴图(系统字体的 → 太细;➔ 安卓字体未必有);缺图退回 →
            const arrowSp = this.host.addSprite('Arrow', FORGE_FUSE_ARROW, FS(50), 0, FS(22), FS(18), load);
            if (arrowSp) {
              arrowSp.color = rgba(255, 220, 130);
            } else {
              const arrow = this.host.addChildLabel(load, 'Arrow', '→', FS(50), FS(1), FS(26), rgba(255, 220, 130), new Size(FS(30), FS(34)));
              arrow.isBold = true;
              arrow.lineHeight = arrow.fontSize;
              this.applyOutline(arrow, scale, true);
            }
          }
        }
      } else {
        const lack = mountRefPlateButton(this.host, row, 'Lack', '不足 3 件', rowW / 2 - FS(PAD) - btnW / 2, 0, btnW, FS(46), scale, 'dark', false, undefined, { fontSize: FS(22) });
        const lackLabel = lack.getChildByName('Label')?.getComponent(Label);
        if (lackLabel) {
          lackLabel.color = rgba(196, 192, 184);
        }
        // 原型「不足 3 件」是灰底:暗钮上叠一层半透明灰
        const lackTint = lack.getChildByName('Art');
        if (lackTint) {
          lackTint.getComponentsInChildren(Sprite).forEach((sp) => { sp.color = rgba(150, 150, 150, 255); });
        }
      }
      if (enough && !state.busy && !loaded) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => this.host.setLobbyForgeFuseSlots(group.items.slice(0, 3).map((item) => item.id)), this);
      }
    });
  }

  // 可合成分组:未穿戴、非红装,按稀有度低→高(先清白装)、数量多→少排序;组内强化低件优先当材料。
  private collectFuseGroups(items: EquipmentItemVO[]): { slot: string; quality: string; items: EquipmentItemVO[] }[] {
    const groups = new Map<string, { slot: string; quality: string; items: EquipmentItemVO[] }>();
    items.forEach((item) => {
      const quality = (item.quality || '').toUpperCase();
      if (item.heroId != null || quality === 'RED') {
        return;
      }
      const key = `${item.slot}:${quality}`;
      const entry = groups.get(key) ?? { slot: item.slot, quality, items: [] };
      entry.items.push(item);
      groups.set(key, entry);
    });
    const list = [...Array.from(groups.values())];
    list.forEach((group) => group.items.sort((a, b) => (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0)));
    return list.sort((a, b) =>
      EQUIP_QUALITY_ORDER.indexOf(a.quality) - EQUIP_QUALITY_ORDER.indexOf(b.quality)
      || b.items.length - a.items.length
      || a.slot.localeCompare(b.slot));
  }

  // ===== 宝石页签(P5):左装备网格(开孔装备,穿标) + 右孔位面板(第 i 孔=i 阶专槽,镶嵌/拆卸) =====
  private renderGemTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: { gemEquipId: number | null; gemPickSlot: number | null },
    panelWidth: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    // ── 2026-10-21 按 10-19 原型 1:1:整屏原型坐标 1870×841(与合成 / 分解同一 k / 中心);左栏 50..900、右栏 950..1690,上下 92..815 ──
    // 手机导航栏占右缘:右栏右缘 = min(1690, 导航栏左缘 - 14);差额先让左栏左移(最多 30),余下从右栏宽里扣(舞台 / 行内元素按右栏宽等比)
    const k = this.fuseBgK > 0 ? this.fuseBgK : Math.min(this.stageW / 1870, this.stageH / 841);
    const FX = (px: number): number => (px - 935) * k - this.bodyOffsetX;
    const FY = (py: number): number => (420.5 - py) * k;
    const FS = (v: number): number => v * k;
    const railLeftPx = this.phone ? (this.stageW / 2 - 6 * scale - FORGE_PHONE_RAIL_W * scale) / k + 935 : 1870;
    const rightR = Math.min(1690, railLeftPx - 14);
    const short = Math.max(0, 1690 - rightR);
    const leftL = 50 - Math.min(30, short);
    const rightW = 740 - (short - Math.min(30, short));
    const rightL = rightR - rightW;
    const leftR = rightL - 50;
    const sxR = rightW / 740;
    const panelTop = 92;
    const panelBottom = 815;
    const panelH = FS(panelBottom - panelTop);
    const panelCy = FY((panelTop + panelBottom) / 2);
    const leftCx = FX((leftL + leftR) / 2);
    const rightCx = FX((rightL + rightR) / 2);
    const LY = (py: number): number => FY(py) - panelCy;
    const RX = (px: number): number => FX(rightL + (px - 950) * sxR) - rightCx;
    const RS = (v: number): number => FS(v * sxR);
    const shade = (name: string, cx: number, w: number): void => {
      const sh = this.host.addSprite(name, FORGE_FUSE_SOFT_SHADE, cx, panelCy - FS(8), w + FS(90), panelH + FS(90), parent);
      if (sh) {
        sh.color = rgba(0, 0, 0, 215);
      }
    };
    shade('ForgeGemGridShadow', leftCx, FS(leftR - leftL));
    shade('ForgeGemSideShadow', rightCx, FS(rightW));
    // 只列出有孔的装备(绿装起);穿戴优先 → 品质降序 → 强化降序。
    const pool = state.items
      .filter((item) => gemOpenSlots(item.quality) > 0)
      .sort((a, b) =>
        (b.heroId != null ? 1 : 0) - (a.heroId != null ? 1 : 0)
        || EQUIP_QUALITY_ORDER.indexOf((b.quality || '').toUpperCase()) - EQUIP_QUALITY_ORDER.indexOf((a.quality || '').toUpperCase())
        || (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0)
        || a.slot.localeCompare(b.slot));
    const selected = pool.find((item) => item.id === forge.gemEquipId) ?? pool[0] ?? null;

    // ── 左:「可镶嵌装备」面板 + 8 列新图标网格(四边内缩 PAD,右侧留滚动条);格名白字、穿戴绿「穿」角标、选中金框 ──
    const leftW = FS(leftR - leftL);
    const leftPanel = mountRefTitledPanel(this.host, parent, 'ForgeGemGridFrame', leftCx, panelCy, leftW, panelH, scale, '可镶嵌装备', { bandH: FS(46), fontSize: FS(26), fill: rgba(10, 8, 7, 240), legacyRed: true });
    const PAD = 26;
    const columns = 8;
    const gapPx = 10;
    const cellPx = ((leftR - leftL) - PAD * 2 - 14 - gapPx * (columns - 1)) / columns;
    const cell = FS(cellPx);
    const step = FS(cellPx + gapPx);
    const gridW = FS(cellPx * columns + gapPx * (columns - 1));
    const gridCx = FX(leftL + PAD + (cellPx * columns + gapPx * (columns - 1)) / 2) - leftCx;
    const gridTop = leftPanel.bodyTop - FS(14);
    // 视口按整行收(原型:一屏正好 N 整行,不露半截格子贴框),余量留在底边
    const fitRows = Math.max(1, Math.floor((gridTop - (-panelH / 2 + FS(PAD)) - FS(8) + FS(gapPx)) / step));
    const gridBottom = gridTop - FS(8) - fitRows * cell - (fitRows - 1) * FS(gapPx);
    if (pool.length <= 0) {
      const empty = this.host.addChildLabel(leftPanel.node, 'ForgeGemEmpty', '暂无可镶嵌装备(绿装起开孔)', gridCx, (gridTop + gridBottom) / 2, FS(22), rgba(190, 184, 171), new Size(gridW, FS(32)));
      empty.lineHeight = empty.fontSize;
    }
    const shownCount = Math.min(pool.length, FORGE_PHONE_GRID_CAP);
    const gridRows = Math.ceil(shownCount / columns);
    const gridPad = FS(4);
    const gridContentH = gridPad * 2 + Math.max(0, gridRows - 1) * step + (gridRows > 0 ? cell : 0);
    const gridScroll = this.addPhoneScroll(leftPanel.node, 'ForgeGemGrid', gridCx, gridTop, gridBottom, gridW + FS(10), gridContentH, scale);
    pool.slice(0, shownCount).forEach((item, index) => {
      const x = -gridW / 2 + cell / 2 + (index % columns) * step;
      const y = gridScroll.topY - gridPad - cell / 2 - Math.floor(index / columns) * step;
      const node = this.renderDecomposeCell(gridScroll.content, `ForgeGemCell_${item.id}`, item, x, y, cell, scale, selected != null && selected.id === item.id, FS, { mark: 'frame', worn: item.heroId != null, whiteName: true });
      if (!state.busy) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.selectLobbyForgeGemEquip(item.id), this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
    // 2026-10-21 用户:宝石页列表最下方的「共 N 件,显示前 N 件」统计去掉

    // ── 右:「宝石镶嵌」面板:舞台插画铺 138..534(底座在图里)、名牌 (1310,161)、靴子立在底座、四枚勋章(序号在勋章上方)+ V 锁章、五行孔位 ──
    const sidePanel = mountRefTitledPanel(this.host, parent, 'ForgeGemSidePanel', rightCx, panelCy, FS(rightW), panelH, scale, '宝石镶嵌', { bandH: FS(46), fontSize: FS(26), fill: rgba(10, 8, 7, 242), legacyRed: true });
    const side = sidePanel.node;
    this.fxAnchor = { x: rightCx + this.bodyOffsetX, y: FY(330) };
    this.powerAnchor = { x: rightCx + this.bodyOffsetX, y: FY(200) };
    const stage = this.host.addSprite('ForgeGemStage', FORGE_GEM_STAGE, RX(1324), LY(336), RS(732), FS(396), side);
    if (stage) {
      stage.node.setSiblingIndex(2);
      // 2026-10-22 用户:舞台背景调暗,主次分明(靴子 / 勋章在上层保持原亮度)
      stage.color = rgba(235, 232, 232, 255);
    } else {
      this.host.addSprite('ForgeGemPedestal', FORGE_REF_GEM_PEDESTAL.path, RX(1310), LY(470), RS(520), RS(520) * (FORGE_REF_GEM_PEDESTAL.h / FORGE_REF_GEM_PEDESTAL.w), side);
    }
    if (!selected) {
      const hint = this.host.addChildLabel(side, 'ForgeGemSideHint', '点击左侧装备查看孔位', 0, LY(330), FS(22), rgba(206, 197, 181), new Size(FS(rightW) - FS(40), FS(30)));
      hint.lineHeight = hint.fontSize;
      return;
    }
    // 名牌:暗底两端淡出 + 名字淡金 / +N 淡金 / (已穿) 绿(颜色取自原型)
    // 名牌离标题带下沿留 10(原型 band 底 ~132,牌 145..195)
    this.host.addSprite('ForgeGemNamePlate', FORGE_GEM_NAME_PLATE, RX(1310), LY(170), RS(420), FS(50), side);
    const enhance = (selected.enhanceLevel ?? 0) > 0 ? `<color=#FCF6BA> +${selected.enhanceLevel}</color>` : '';
    const worn = selected.heroId != null ? '<color=#60F08C>  (已穿)</color>' : '';
    this.addRichLine(side, 'ForgeGemSideName', `<color=#FCF6BA>${safeText(selected.equipName)}</color>${enhance}${worn}`, RX(1310), LY(170) - FS(3), FS(27), RS(400));

    const open = gemOpenSlots(selected.quality);
    const gems = selected.gems ?? [];
    const numerals = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
    // 靴子(展示图)立在底座台面上:心 (1300,345),高 330
    const showcaseAsset = equipShowcaseAssetByCode(selected.equipCode);
    if (!showcaseAsset || !this.host.addSprite('ForgeGemShowcase', showcaseAsset, RX(1300), LY(345), FS(330), FS(330), side)) {
      this.addEquipIcon(side, 'ForgeGemBigIcon', selected.equipCode, selected.slot, FS(200), scale, LY(360));
    }
    // 勋章:I (1093,255) / II (1063,390) / III (1527,255) / IV (1570,385) 径 150,序号在勋章上方 50;V 锁章 (1523,485) 径 74,序号圆章在上方 (1523,445)
    const medalPos: Array<[number, number]> = [[1093, 255], [1063, 390], [1527, 255], [1570, 385], [1523, 485]];
    for (let i = 0; i < 5; i += 1) {
      const opened = i < open;
      const info = opened ? parseGemCode(gems[i]) : null;
      const [mpx, mpy] = medalPos[i];
      const locked = !opened;
      const size = FS(i === 4 || locked ? 78 : 150);
      const medalNode = this.host.addChildPlainNode(side, `ForgeGemMedal_${i}`, RX(mpx), LY(i === 4 && opened ? 470 : mpy), size, size);
      if (locked) {
        if (!this.host.addSprite('Lock', FORGE_GEM_LOCK, 0, 0, size, size, medalNode)) {
          this.host.addSprite('Ring', FORGE_REF_GEM_MEDALLION_EMPTY_ASSET, 0, 0, size, size, medalNode);
        }
      } else {
        if (info) {
          // 原型:勋章芯暗底 + 大宝石填满芯(约 0.62 径),不加彩色光圈
          mountRefSolid(this.host, medalNode, 'GemBack', 0, 0, size * 0.5, size * 0.5, rgba(14, 10, 10, 235));
          this.host.addSprite('Gem', gemIconAsset(info.type, info.tier), 0, 0, size * 0.58, size * 0.58, medalNode);
        }
        this.host.addSprite('Ring', info ? FORGE_REF_GEM_MEDALLION_FULL_ASSET : FORGE_REF_GEM_MEDALLION_EMPTY_ASSET, 0, 0, size, size, medalNode);
      }
      // 序号:I~IV 勋章上方纯字(淡金 + 黑描边);锁章上方圆章 + 序号
      // 原型:I~IV 序号心在勋章心上方 50(压在顶尖上),锁章序号圆章心在上方 40
      const numY = medalNode.position.y + FS(locked ? 40 : 50);
      if (locked) {
        this.host.addSprite(`ForgeGemMedalNumBadge_${i}`, FORGE_GEM_NUM_BADGE, RX(mpx), numY, FS(40), FS(40), side);
      }
      const num = this.host.addChildLabel(side, `ForgeGemMedalNum_${i}`, numerals[i], RX(mpx), numY, FS(locked ? 24 : 34), rgba(250, 236, 168), new Size(FS(60), FS(42)));
      num.isBold = true;
      num.lineHeight = num.fontSize;
      this.applyOutline(num, scale, true);
      if (opened && !info && !state.busy) {
        medalNode.addComponent(Button);
        medalNode.on(Button.EventType.CLICK, () => this.host.setLobbyForgeGemPickSlot(i), this);
        this.host.applyImageButtonFeedback(medalNode, 1.06, 0.94);
      }
    }

    // 五行孔位(x 965..1675,行心 560 / 611 / 662 / 713 / 764,高 46):序号圆章 → 宝石 / 暗空槽 / 锁 → 文字 → 按钮
    const rowW = RS(710);
    const rowH = FS(46);
    const rowCx = RX(1320);
    for (let i = 0; i < 5; i += 1) {
      const rowCy = LY(560 + i * 51);
      const opened = i < open;
      const info = opened ? parseGemCode(gems[i]) : null;
      const row = this.host.addChildPlainNode(side, `ForgeGemSlotRow_${i}`, rowCx, rowCy, rowW, rowH);
      if (!mountRefSliced(this.host, row, 'Art', info ? REF_ROW_SELECTED : REF_ROW, 0, 0, rowW, rowH)) {
        drawRefPanelFallback(row, rowW, rowH, scale);
      }
      const lx = (px: number): number => RX(px) - rowCx;
      const badge = FS(42);
      if (!this.host.addSprite('NumBadge', FORGE_GEM_NUM_BADGE, lx(998), 0, badge, badge, row)) {
        mountRefSolid(this.host, row, 'NumBadge', lx(998), 0, badge, badge, rgba(10, 8, 8, 235));
      }
      const numLabel = this.host.addChildLabel(row, 'NumTxt', numerals[i], lx(998), 0, FS(25), rgba(250, 244, 180), new Size(badge, badge));
      numLabel.isBold = true;
      numLabel.lineHeight = numLabel.fontSize;
      this.applyOutline(numLabel, scale, false);
      const iconSize = FS(40);
      const textX = lx(1093);
      const textY = -FS(4);
      if (!opened) {
        this.host.addSprite('LockIcon', FORGE_GEM_LOCK, lx(1058), 0, iconSize, iconSize, row);
        this.addRichLine(row, 'LockedText', `<color=#F0766A>未开孔  ·  ${equipQualityLabel(GEM_TIER_QUALITY[i])}及以上装备开放</color>`, textX, textY, FS(20), RS(520), 0);
        continue;
      }
      if (info) {
        this.host.addSprite('GemArt', gemIconAsset(info.type, info.tier), lx(1058), 0, iconSize * 1.15, iconSize * 1.15, row);
        const gemLabel = info.label;
        const attr = info.attrText.replace(/\+/g, ' +');
        this.addRichLine(row, 'GemName', `<color=#FAF0A5>${gemLabel}</color><color=#C8C0B0>  ·  </color><color=#FAEC64>${attr}</color>`, textX, textY, FS(20), RS(340), 0);
        // 拆卸(红铜钮 1455..1575)+ 金币 + 费用白字
        // 原型:红铜实心钮(铜钮底染红)
        const unsocket = mountRefPlateButton(this.host, row, 'UnsocketBtn', '拆卸', lx(1515), 0, RS(120), FS(34), scale, 'bronze', !state.busy,
          () => this.host.unsocketLobbyForgeGem(selected.id, i), { fontSize: FS(20) });
        unsocket.getChildByName('Art')?.walk((child) => {
          const sp = child.getComponent(Sprite);
          if (sp) {
            sp.color = rgba(255, 140, 112, 255);
          }
        });
        this.host.addSprite('CostIcon', BAG_ICON_GOLD_ASSET, lx(1600), 0, FS(24), FS(24), row);
        const cost = this.host.addChildLabel(row, 'CostTxt', formatInteger(gemUnsocketGold(info.tier)), lx(1617), 0, FS(19), rgba(252, 250, 245), new Size(RS(56), FS(26)), HorizontalTextAlignment.LEFT);
        cost.overflow = Label.Overflow.SHRINK;
        cost.lineHeight = cost.fontSize;
        continue;
      }
      if (!this.host.addSprite('EmptyGem', FORGE_GEM_SOCKET_DIM, lx(1058), 0, iconSize, iconSize, row)) {
        mountRefSolid(this.host, row, 'EmptyGem', lx(1058), 0, iconSize * 0.7, iconSize * 0.7, rgba(18, 16, 16, 235));
      }
      // 部位限定类型(2026-10-21):提示可镶的那一种(类型主色)
      const slotType = gemTypeForSlot(selected.slot);
      const typeHint = slotType ? `<color=#A8A8A8>可镶 </color><color=${GEM_TYPE_DISPLAY[slotType].hex}>${GEM_TYPE_DISPLAY[slotType].name}</color><color=#A8A8A8>(${GEM_TYPE_DISPLAY[slotType].attr})</color>` : '<color=#A8A8A8>任意阶宝石可镶</color>';
      this.addRichLine(row, 'EmptyHint', `<color=#A8A8A8>未镶嵌  ·  </color>${typeHint}`, textX, textY, FS(20), RS(400), 0);
      mountRefPlateButton(this.host, row, 'SocketPickBtn', '镶 嵌', lx(1597), 0, RS(120), FS(34), scale, 'bronze', !state.busy,
        () => this.host.setLobbyForgeGemPickSlot(i), { fontSize: FS(20) });
    }
    if (forge.gemPickSlot != null && forge.gemPickSlot < open) {
      // 弹层挂整页面板(手机 body 容器有横向偏移,挂 body 会偏离屏幕中心)。
      const pickSlot = forge.gemPickSlot;
      if (this.phone) {
        this.phoneOverlays.push((root) => this.renderGemPickDialog(root, selected, pickSlot, state.busy, this.stageW, scale));
      } else {
        this.renderGemPickDialog(this.overlayRoot ?? parent, selected, pickSlot, state.busy, panelWidth, scale);
      }
    }
  }

  /** 小锁(程序绘制:锁身圆角方 + 上半圆锁梁;arc 逆时针走上半弧)。r = 锁身半宽。 */
  private drawLockGlyph(parent: Node, x: number, y: number, r: number, scale: number): void {
    const lock = this.host.addChildPlainNode(parent, 'LockGlyph', x, y, r * 2.4, r * 2.4).addComponent(Graphics);
    lock.strokeColor = rgba(200, 184, 150, 255);
    lock.lineWidth = Math.max(1.5, 2 * scale);
    lock.arc(0, r * 0.1, r * 0.65, 0, Math.PI, true);
    lock.stroke();
    lock.fillColor = rgba(200, 184, 150, 255);
    lock.roundRect(-r, -r * 1.05, r * 2, r * 1.2, 2 * scale);
    lock.fill();
  }

  // 宝石选择弹窗:列出背包全部宝石(阶升序),点击即镶到目标孔;五阶受"每件限 1 颗"约束置灰。
  private renderGemPickDialog(parent: Node, selected: EquipmentItemVO, slotIndex: number, busy: boolean, panelWidth: number, scale: number): void {
    // 2026-10-21 按背包二级弹窗同款(用户确认过的样式)重做:压暗 210、实景底、细金框、红标题带 + 四芒星 + 金环关闭钮
    const k = this.fuseBgK > 0 ? this.fuseBgK : Math.min(this.stageW / 1870, this.stageH / 841);
    const FS = (v: number): number => v * k;
    const dimW = Math.max(panelWidth, this.stageW) * 2;
    const dimH = this.stageH * 2;
    const overlay = this.host.addChildPlainNode(parent, 'ForgeGemPickOverlay', 0, 0, dimW, dimH);
    mountRefSolid(this.host, overlay, 'Fill', 0, 0, dimW, dimH, rgba(0, 0, 0, 210));
    overlay.addComponent(BlockInputEvents);
    const bag = this.host.currentLobbyBagState();
    const owned = bag.groups
      .flatMap((group) => group.items)
      .filter((item) => (item.itemCode || '').toUpperCase().startsWith('GEM_'))
      .map((item) => ({ info: parseGemCode(item.itemCode), count: Number(item.itemCount) || 0 }))
      .filter((entry) => entry.info != null && entry.count > 0)
      // 部位限定类型(2026-10-21):只列这个部位能镶的那一种
      .filter((entry) => { const allowed = gemTypeForSlot(selected.slot); return !allowed || entry.info!.type === allowed; })
      .sort((a, b) => a.info!.tier - b.info!.tier || a.info!.type.localeCompare(b.info!.type));
    const hasT5 = (selected.gems ?? []).some((code, index) => index !== slotIndex && (parseGemCode(code)?.tier ?? 0) === 5);
    const shown = owned.slice(0, 60);
    const slotType = gemTypeForSlot(selected.slot);
    const slotTypeView = slotType ? GEM_TYPE_DISPLAY[slotType] : null;
    // 弹窗 1100×620(原型像素),四边内缩 PAD 36
    const w = FS(1100);
    const h = FS(620);
    const PAD = FS(36);
    const dialog = this.host.addChildPlainNode(overlay, 'ForgeGemPickDialog', 0, 0, w, h);
    dialog.addComponent(BlockInputEvents);
    mountRefSolid(this.host, dialog, 'Back', 0, 0, w, h, rgba(10, 8, 9, 244));
    mountRefDialogBackdrop(this.host, dialog, REF_DETAIL_INNER_BG, 0, 0, w, h, 215, true);
    mountRefLineFrame(this.host, dialog, 'Frame', w, h);
    const HB = REF_BAG_DLG.headerBand;
    const hk = w / HB.w;
    const bandH = (HB.bodyY1 - HB.bodyY0) * hk;
    const bandCy = h / 2 - FS(20) - bandH / 2;
    this.host.addSprite('Band', HB.path, 0, bandCy + ((HB.bodyY0 + HB.bodyY1) / 2 - HB.h / 2) * hk, HB.w * hk, HB.h * hk, dialog);
    const titleText = `选择宝石 · 第 ${slotIndex + 1} 孔`;
    const titleSize = FS(30);
    const titleW = titleText.length * titleSize * 0.95;
    this.host.addSprite('Star', REF_TITLE_STAR_ASSET, -titleW / 2 - FS(30), bandCy, FS(52), FS(52), dialog);
    const title = this.host.addChildLabel(dialog, 'Title', titleText, FS(6), bandCy, titleSize, rgba(255, 228, 156), new Size(titleW + FS(24), FS(44)));
    title.lineHeight = title.fontSize;
    title.isBold = true;
    this.applyOutline(title, scale, true);
    const closeSize = FS(56);
    const close = this.host.addChildPlainNode(dialog, 'Close', w / 2 - PAD - closeSize / 2, bandCy, closeSize + FS(10), closeSize + FS(10));
    this.host.addSprite('Art', REF_CLOSE_RING_ASSET, 0, 0, closeSize, closeSize, close);
    close.addComponent(Button);
    this.host.applyImageButtonFeedback(close, 1.08, 0.92);
    close.on(Button.EventType.CLICK, () => this.host.setLobbyForgeGemPickSlot(null), this);
    // 说明行:本部位只可镶嵌哪一种(类型主色)
    const slotNames: Record<string, string> = { WEAPON: '武器', HELMET: '头盔', CHEST: '胸甲', BOOTS: '鞋子', RING: '戒指', NECKLACE: '项链' };
    // 说明行离标题带底饰(中间小菱形)留空
    const ruleY = bandCy - bandH / 2 - FS(46);
    if (slotTypeView) {
      this.addRichLine(dialog, 'SlotRule', `<color=#C8BCA6>${slotNames[(selected.slot || '').toUpperCase()] ?? '该部位'}只可镶嵌 </color><color=${slotTypeView.hex}>${slotTypeView.name}</color><color=#C8BCA6>(${slotTypeView.attr})</color>`, 0, ruleY, FS(22), w - PAD * 2);
    }
    const bodyTop = (slotTypeView ? ruleY - FS(30) : bandCy - bandH / 2 - FS(22));
    const bodyBottom = -h / 2 + PAD;
    if (owned.length === 0) {
      // 空态:暗空槽图 + 两行说明(居中)
      const cy = (bodyTop + bodyBottom) / 2;
      this.host.addSprite('EmptyGem', FORGE_GEM_SOCKET_DIM, 0, cy + FS(56), FS(96), FS(96), dialog);
      const t1 = this.host.addChildLabel(dialog, 'EmptyTitle', slotTypeView ? `背包暂无${slotTypeView.name}` : '背包暂无宝石', 0, cy - FS(20), FS(26), rgba(240, 214, 146), new Size(w - PAD * 2, FS(36)));
      t1.lineHeight = t1.fontSize;
      t1.isBold = true;
      this.applyOutline(t1, scale, true);
      const t2 = this.host.addChildLabel(dialog, 'EmptyHint', '爬塔 BOSS 首通、分解炽红装备可获得宝石', 0, cy - FS(62), FS(21), rgba(168, 168, 168), new Size(w - PAD * 2, FS(30)));
      t2.lineHeight = t2.fontSize;
      return;
    }
    // 宝石卡:三列,卡高 92,间 14;超出滚动
    const cols = 3;
    const gap = FS(14);
    const listW = w - PAD * 2 - FS(14);
    const cardW = (listW - gap * (cols - 1)) / cols;
    const cardH = FS(92);
    const rows = Math.ceil(shown.length / cols);
    const scroll = this.addPhoneScroll(dialog, 'ForgeGemPick', -FS(7), bodyTop, bodyBottom, listW, rows * cardH + Math.max(0, rows - 1) * gap, scale);
    shown.forEach((entry, index) => {
      const info = entry.info!;
      const blocked = info.tier === 5 && hasT5;
      const enabled = !busy && !blocked;
      const tq = equipQualityColor(GEM_TIER_QUALITY[info.tier - 1]);
      const x = -listW / 2 + cardW / 2 + (index % cols) * (cardW + gap);
      const y = scroll.topY - cardH / 2 - Math.floor(index / cols) * (cardH + gap);
      const card = this.host.addChildPlainNode(scroll.content, `ForgeGemPickRow_${info.code}`, x, y, cardW, cardH);
      if (!mountRefSliced(this.host, card, 'Art', REF_ROW, 0, 0, cardW, cardH)) {
        drawRefPanelFallback(card, cardW, cardH, scale);
      }
      const art = FS(66);
      const artX = -cardW / 2 + FS(16) + art / 2;
      const glow = this.host.addChildPlainNode(card, 'Glow', artX, 0, art, art).addComponent(Graphics);
      glow.fillColor = rgba(tq.r, tq.g, tq.b, enabled ? 70 : 30);
      glow.circle(0, 0, art * 0.42);
      glow.fill();
      this.host.addSprite('GemArt', gemIconAsset(info.type, info.tier), artX, 0, art, art, card);
      const textX = artX + art / 2 + FS(14);
      const textW = cardW - (textX + cardW / 2) - FS(70);
      const nm = this.host.addChildLabel(card, 'Name', info.label, textX, FS(15), FS(22), enabled ? rgba(250, 240, 165) : rgba(170, 164, 152), new Size(textW, FS(30)), HorizontalTextAlignment.LEFT);
      nm.overflow = Label.Overflow.SHRINK;
      nm.lineHeight = nm.fontSize;
      nm.isBold = true;
      this.applyOutline(nm, scale, true);
      const attr = this.host.addChildLabel(card, 'Attr', blocked ? '每件装备限 1 颗五阶' : info.attrText.replace(/\+/g, ' +'), textX, -FS(17), FS(19), blocked ? rgba(240, 118, 104) : rgba(250, 236, 100), new Size(textW, FS(28)), HorizontalTextAlignment.LEFT);
      attr.overflow = Label.Overflow.SHRINK;
      attr.lineHeight = attr.fontSize;
      const cnt = this.host.addChildLabel(card, 'Count', `×${formatInteger(entry.count)}`, cardW / 2 - FS(18), 0, FS(24), rgba(252, 250, 245), new Size(FS(80), FS(32)), HorizontalTextAlignment.RIGHT);
      cnt.overflow = Label.Overflow.SHRINK;
      cnt.lineHeight = cnt.fontSize;
      cnt.isBold = true;
      this.applyOutline(cnt, scale, true);
      if (enabled) {
        card.addComponent(Button);
        card.on(Button.EventType.CLICK, () => this.host.socketLobbyForgeGem(selected.id, slotIndex, info.code), this);
        this.host.applyImageButtonFeedback(card, 1.02, 0.98);
      } else {
        card.addComponent(UIOpacity).opacity = 150;
      }
    });
    if (owned.length > shown.length) {
      const more = this.host.addChildLabel(dialog, 'ForgeGemPickMore', `共 ${owned.length} 种,显示前 ${shown.length} 种`, 0, bodyBottom - FS(14), FS(17), rgba(190, 184, 171), new Size(w - PAD * 2, FS(24)));
      more.lineHeight = more.fontSize;
    }
  }

  // 弹窗"取消"钮(宝石选择/批量分解共用):暗底细金边程序钮。
  private renderDialogCancelButton(dialog: Node, name: string, y: number, width: number, height: number, fontSize: number, labelH: number, scale: number, onClick: () => void): void {
    const cancel = this.host.addChildPlainNode(dialog, name, 0, y, width, height);
    const xg = cancel.addComponent(Graphics);
    xg.fillColor = rgba(28, 24, 22, 230);
    xg.roundRect(-width / 2, -height / 2, width, height, 9 * scale);
    xg.fill();
    xg.strokeColor = rgba(128, 108, 76, 190);
    xg.lineWidth = 1.5 * scale;
    xg.stroke();
    const cancelLabel = this.host.addChildLabel(cancel, 'Label', '取消', 0, 0, fontSize, rgba(230, 220, 201), new Size(width - 12 * scale, Math.max(labelH, fontSize + 8 * scale)));
    cancelLabel.overflow = Label.Overflow.SHRINK;
    cancel.addComponent(Button);
    cancel.on(Button.EventType.CLICK, onClick, this);
    this.host.applyImageButtonFeedback(cancel);
  }

  // ===== 分解页签(2026-07-24 参考图改版):双行筛选 + 左网格 + 右「分解概览」栏 + 批量分解设置 =====
  private renderDecomposeTab(
    parent: Node,
    state: { items: EquipmentItemVO[]; busy: boolean },
    forge: { decomposeSelectedIds: number[]; decomposeRarity: string | null; decomposeEnhance: 'all' | 'zero' | 'plus'; decomposeBatchOpen: boolean },
    panelWidth: number,
    contentTop: number,
    contentBottom: number,
    scale: number,
  ): void {
    const selected = new Set(forge.decomposeSelectedIds);
    const unworn = state.items.filter((item) => item.heroId == null);
    const pool = unworn
      .filter((item) => !forge.decomposeRarity || (item.quality || '').toUpperCase() === forge.decomposeRarity)
      .filter((item) => {
        const level = item.enhanceLevel ?? 0;
        return forge.decomposeEnhance === 'all' || (forge.decomposeEnhance === 'zero' ? level === 0 : level > 0);
      })
      .sort((a, b) =>
        EQUIP_QUALITY_ORDER.indexOf((a.quality || '').toUpperCase()) - EQUIP_QUALITY_ORDER.indexOf((b.quality || '').toUpperCase())
        || (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0)
        || a.slot.localeCompare(b.slot));

    // ── 2026-10-20 按 10-19 原型 1:1:整屏原型坐标 1870×841(与合成页同一 k / 中心),左栏 75..1245、右栏 1260..1720,上下 95..815 ──
    // 手机导航栏占右缘:右栏右缘 = min(1720, 导航栏左缘 - 14);差额先让左栏左移(最多 35,原型左边留得出),再按 6:4 分摊给左右栏宽
    const k = this.fuseBgK > 0 ? this.fuseBgK : Math.min(this.stageW / 1870, this.stageH / 841);
    const FX = (px: number): number => (px - 935) * k - this.bodyOffsetX;
    const FY = (py: number): number => (420.5 - py) * k;
    const FS = (v: number): number => v * k;
    const railLeftPx = this.phone ? (this.stageW / 2 - 6 * scale - FORGE_PHONE_RAIL_W * scale) / k + 935 : 1870;
    const rightR = Math.min(1720, railLeftPx - 14);
    const short = Math.max(0, 1720 - rightR);
    const leftL = 75 - Math.min(35, short);
    const rem = short - Math.min(35, short);
    const rightW = 460 - rem * 0.4;
    const rightL = rightR - rightW;
    const leftR = rightL - 15;
    const sxL = (leftR - leftL) / 1170;
    const sxR = rightW / 460;
    // 左栏内原型横坐标 → 面板局部;右栏同理
    const panelTop = 95;
    const panelBottom = 815;
    const panelH = FS(panelBottom - panelTop);
    const panelCy = FY((panelTop + panelBottom) / 2);
    const leftCx = FX((leftL + leftR) / 2);
    const LX = (px: number): number => FX(leftL + (px - 75) * sxL) - leftCx;
    const LY = (py: number): number => FY(py) - panelCy;
    const LS = (v: number): number => FS(v * sxL);
    const rightCx = FX((rightL + rightR) / 2);
    const RX = (px: number): number => FX(rightL + (px - 1260) * sxR) - rightCx;
    const RS = (v: number): number => FS(v * sxR);
    const shade = (name: string, cx: number, cy: number, w: number, h: number, alpha: number): void => {
      const sh = this.host.addSprite(name, FORGE_FUSE_SOFT_SHADE, cx, cy, w, h, parent);
      if (sh) {
        sh.color = rgba(0, 0, 0, alpha);
      }
    };
    // 层次:两块面板外一圈柔边投影 + 实底(背景透不上来)
    shade('ForgeDecGridShadow', leftCx, panelCy - FS(8), FS((leftR - leftL) + 90), panelH + FS(90), 215);
    shade('ForgeDecSideShadow', rightCx, panelCy - FS(8), FS(rightW + 90), panelH + FS(90), 215);
    const leftPanel = mountRefTitledPanel(this.host, parent, 'ForgeDecGridFrame', leftCx, panelCy, FS(leftR - leftL), panelH, scale, '', { fill: rgba(10, 8, 7, 238) }).node;

    // 筛选两行:标签「稀有度:」「强化状态:」(x 100,字 24)+ 签(稀有度签 112×42 步 126;强化签 128 / 138 / 138)
    const chip = (name: string, px: number, py: number, w: number, text: string, on: boolean, tint: { r: number; g: number; b: number } | null, onClick: () => void): void => {
      // px = 屏幕原型横坐标(签左缘),不按左栏宽等比
      const cw = FS(w);
      const ch = FS(44);
      const holder = this.host.addChildPlainNode(leftPanel, name, FX(px + w / 2) - leftCx, LY(py), cw, ch);
      const plate = mountRefPlate(this.host, holder, 'Plate', on ? FORGE_DEC_CHIP_ON : FORGE_DEC_CHIP, 0, 0, cw, ch);
      const plateSprite = plate?.getChildByName('PlateArt')?.getComponent(Sprite) ?? null;
      if (plateSprite && !on) {
        plateSprite.color = tint ? rgba(tint.r, tint.g, tint.b, 255) : rgba(176, 164, 146, 255);
      }
      if (!plate) {
        const g = holder.addComponent(Graphics);
        g.fillColor = on ? rgba(60, 40, 16, 248) : rgba(20, 17, 15, 235);
        g.roundRect(-cw / 2, -ch / 2, cw, ch, 6 * scale);
        g.fill();
        g.strokeColor = on ? rgba(248, 206, 110, 245) : rgba(tint?.r ?? 170, tint?.g ?? 150, tint?.b ?? 120, 220);
        g.lineWidth = (on ? 2.2 : 1.4) * scale;
        g.roundRect(-cw / 2, -ch / 2, cw, ch, 6 * scale);
        g.stroke();
      }
      const lift = (c: number): number => Math.round(c + (255 - c) * 0.25);
      const color = on ? rgba(255, 246, 226) : tint ? rgba(lift(tint.r), lift(tint.g), lift(tint.b), 255) : rgba(236, 228, 212);
      const label = this.host.addChildLabel(holder, 'Label', text, 0, -FS(1), FS(20), color, new Size(cw - FS(16), ch * 0.7));
      label.overflow = Label.Overflow.SHRINK;
      fitButtonLabel(label, ch, 0.44);
      label.isBold = on;
      this.applyOutline(label, scale, false);
      if (!on) {
        holder.addComponent(Button);
        holder.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(holder);
      }
    };
    const filterTag = (name: string, text: string, py: number): void => {
      const tag = this.host.addChildLabel(leftPanel, name, text, FX(leftL + 34) - leftCx, LY(py), FS(22), rgba(242, 214, 150), new Size(FS(108), FS(34)), HorizontalTextAlignment.LEFT);
      tag.lineHeight = tag.fontSize;
      tag.overflow = Label.Overflow.SHRINK;
      this.applyOutline(tag, scale, false);
    };
    // 2026-10-21 用户「分解背包框上下左右内容全部贴着边框」:四边统一内缩 PAD(原型像素,从框外缘量,扣掉金框线与角饰后约留 24)
    // 以下 QX / QY 用屏幕原型坐标(左栏实际 leftL..leftR),不再按 1170 等比,保证四边留白一致
    const PAD = 34;
    const QX = (px: number): number => FX(px) - leftCx;
    const QY = LY;
    const innerL = leftL + PAD;
    const innerR = leftR - PAD;
    const chipH = 44;
    const row1Y = panelTop + PAD + chipH / 2;
    const row2Y = row1Y + chipH + 10;
    filterTag('ForgeDecFilterTag', '稀有度:', row1Y);
    filterTag('ForgeDecEnhTag', '强化状态:', row2Y);
    const chipX0 = innerL + 112;
    chip('ForgeDecFilterAll', chipX0, row1Y, 108, '全部', forge.decomposeRarity === null, null, () => this.host.setLobbyForgeDecomposeRarity(null));
    EQUIP_QUALITY_ORDER.forEach((quality, index) => {
      chip(`ForgeDecFilter_${quality}`, chipX0 + (index + 1) * 120, row1Y, 108, equipQualityLabel(quality), forge.decomposeRarity === quality, equipQualityColor(quality), () => this.host.setLobbyForgeDecomposeRarity(quality));
    });
    chip('ForgeDecEnhAll', chipX0, row2Y, 108, '全部', forge.decomposeEnhance === 'all', null, () => this.host.setLobbyForgeDecomposeEnhance('all'));
    chip('ForgeDecEnhZero', chipX0 + 120, row2Y, 128, '未强化', forge.decomposeEnhance === 'zero', null, () => this.host.setLobbyForgeDecomposeEnhance('zero'));
    chip('ForgeDecEnhPlus', chipX0 + 260, row2Y, 128, '已强化', forge.decomposeEnhance === 'plus', null, () => this.host.setLobbyForgeDecomposeEnhance('plus'));
    // 筛选与网格之间一道金线(两端淡出,左右同 PAD)
    const sepY = row2Y + chipH / 2 + 14;
    const sepW = FS(innerR - innerL);
    const sep = this.host.addChildPlainNode(leftPanel, 'ForgeDecSep', QX((innerL + innerR) / 2), QY(sepY), sepW, 2).addComponent(Graphics);
    for (let i = 0; i < 24; i += 1) {
      const t = i / 23;
      const a = Math.round(150 * Math.min(1, Math.min(t, 1 - t) * 5));
      sep.strokeColor = rgba(214, 170, 92, a);
      sep.lineWidth = Math.max(1, 1.2 * scale);
      sep.moveTo(-sepW / 2 + (sepW * i) / 24, 0);
      sep.lineTo(-sepW / 2 + (sepW * (i + 1)) / 24, 0);
      sep.stroke();
    }

    // 底部两钮(右对齐,底边留 PAD)
    const btnH = 50;
    const btnY = panelBottom - PAD - btnH / 2;
    // 网格:9 列,格间 14;格边长取「宽能放 9 列(右侧留 16 给滚动条)」与「高能放 4 整行」中较小的,视口在分隔线与底钮之间居中
    const columns = 9;
    const gapPx = 14;
    const gridAreaTop = sepY + 12;
    const gridAreaBottom = btnY - btnH / 2 - 14;
    const cellPx = Math.min((innerR - 16 - innerL - gapPx * (columns - 1)) / columns, (gridAreaBottom - gridAreaTop - gapPx * 3) / 4);
    const cell = FS(cellPx);
    const stepX = FS(cellPx + gapPx);
    const stepY = stepX;
    const gridWpx = cellPx * columns + gapPx * (columns - 1);
    const gridHpx = cellPx * 4 + gapPx * 3;
    const gridTopPx = gridAreaTop + (gridAreaBottom - gridAreaTop - gridHpx) / 2;
    const gridTopY = QY(gridTopPx - 4);
    const gridBottomY = QY(gridTopPx + gridHpx + 4);
    const gridCx = QX(innerL + gridWpx / 2);
    const gridW = FS(gridWpx);
    if (pool.length <= 0) {
      const empty = this.host.addChildLabel(leftPanel, 'ForgeDecEmpty', '当前筛选下没有可分解的未穿戴装备', gridCx, (gridTopY + gridBottomY) / 2, FS(22), rgba(190, 184, 171), new Size(gridW, FS(32)));
      empty.lineHeight = empty.fontSize;
    }
    const shownCount = Math.min(pool.length, FORGE_PHONE_GRID_CAP);
    const gridRows = Math.ceil(shownCount / columns);
    const gridPad = FS(4);
    const moreH = pool.length > shownCount ? FS(30) : 0;
    const gridContentH = gridPad * 2 + Math.max(0, gridRows - 1) * stepY + (gridRows > 0 ? cell : 0) + moreH;
    const gridScroll = this.addPhoneScroll(leftPanel, 'ForgeDecGrid', gridCx, gridTopY, gridBottomY, gridW + FS(10), gridContentH, scale);
    pool.slice(0, shownCount).forEach((item, index) => {
      const x = -gridW / 2 + cell / 2 + (index % columns) * stepX;
      const y = gridScroll.topY - gridPad - cell / 2 - Math.floor(index / columns) * stepY;
      const node = this.renderDecomposeCell(gridScroll.content, `ForgeDecCell_${item.id}`, item, x, y, cell, scale, selected.has(item.id), FS);
      if (!state.busy) {
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, () => this.host.toggleLobbyForgeDecomposeSelect(item.id), this);
        this.host.applyImageButtonFeedback(node, 1.03, 0.97);
      }
    });
    if (pool.length > shownCount) {
      const more = this.host.addChildLabel(gridScroll.content, 'ForgeDecMore', `共 ${pool.length} 件,显示前 ${shownCount} 件(可用筛选缩小范围)`, 0, gridScroll.topY - gridContentH + gridPad + moreH / 2, FS(18), rgba(190, 184, 171), new Size(gridW, FS(26)));
      more.lineHeight = more.fontSize;
    }

    // 选中统计与附加产出估算区间。
    const chosen = pool.filter((item) => selected.has(item.id));
    const estimate = chosen.reduce((sum, item) => {
      const level = item.enhanceLevel ?? 0;
      const invested = (level * (level + 1)) / 2;
      return sum + (DECOMPOSE_BASE_STONES[(item.quality || '').toUpperCase()] ?? 1) + Math.floor(invested / 2);
    }, 0);
    const sumRange = (table: Record<string, [number, number]>): [number, number] => chosen.reduce<[number, number]>((acc, item) => {
      const range = table[(item.quality || '').toUpperCase()];
      return range ? [acc[0] + range[0], acc[1] + range[1]] : acc;
    }, [0, 0]);
    const blessRange = sumRange(DECOMPOSE_BLESS_RANGE);
    const runeRange = sumRange(DECOMPOSE_RUNE_RANGE);

    // 底条:只留右侧一键全选 / 清空(2026-10-21 用户:左下统计不需要,右栏已有);字上下留空
    const visibleIds = pool.slice(0, shownCount).map((item) => item.id);
    const plateButton = (host: Node, name: string, text: string, cx: number, cy: number, w: number, h: number, item: RefKitItem, enabled: boolean, fontSize: number, onClick: () => void): void => {
      const holder = this.host.addChildPlainNode(host, name, cx, cy, w, h);
      if (!mountRefPlate(this.host, holder, 'Art', item, 0, 0, w, h)) {
        drawRefPanelFallback(holder, w, h, scale);
      }
      const label = this.host.addChildLabel(holder, 'Label', text, 0, FS(1), fontSize, enabled ? rgba(255, 240, 210) : rgba(176, 166, 150), new Size(w * (item === REF_PLATE_DARK ? 0.84 : 0.66), h * 0.7));
      label.isBold = true;
      label.overflow = Label.Overflow.SHRINK;
      fitButtonLabel(label, h, item === REF_PLATE_DARK ? 0.44 : 0.4);
      this.applyOutline(label, scale, true);
      if (enabled) {
        holder.addComponent(Button);
        holder.on(Button.EventType.CLICK, onClick, this);
        this.host.applyImageButtonFeedback(holder, 1.03, 0.97);
      } else {
        holder.addComponent(UIOpacity).opacity = 190;
      }
    };
    plateButton(leftPanel, 'ForgeDecClear', '清空', QX(innerR - 90), QY(btnY), FS(180), FS(btnH), REF_PLATE_DARK, !state.busy && chosen.length > 0, FS(23), () => this.host.setLobbyForgeDecomposeSelection([]));
    plateButton(leftPanel, 'ForgeDecSelectAll', '一键全选', QX(innerR - 180 - 16 - 95), QY(btnY), FS(190), FS(btnH), REF_PLATE_DARK, !state.busy && visibleIds.length > 0, FS(23), () => this.host.setLobbyForgeDecomposeSelection(visibleIds));

    // ── 右栏「分解概览」:红标题带(105..160)+ 熔炉插画铺满 162..545 + 已选 / 预计获得 + 可能获得材料 + 提示 + 两钮 ──
    const sidePanel = mountRefTitledPanel(this.host, parent, 'ForgeDecSidePanel', rightCx, panelCy, FS(rightW), panelH, scale, '分解概览', { bandH: FS(56), fontSize: FS(32), fill: rgba(10, 8, 7, 242), legacyRed: true });
    const side = sidePanel.node;
    this.fxAnchor = { x: rightCx + this.bodyOffsetX, y: FY(330) };
    this.powerAnchor = { x: rightCx + this.bodyOffsetX, y: FY(200) };
    const furnace = this.host.addSprite('ForgeDecFurnace', FORGE_DEC_FURNACE, RX(1490), LY(353), RS(450), FS(386), side);
    if (furnace) {
      furnace.node.setSiblingIndex(2);
      // 2026-10-22 用户:熔炉背景调暗,上面的「已选 / 预计获得」更清楚
      furnace.color = rgba(235, 232, 232, 255);
    } else {
      this.host.addSprite('ForgeDecCrucible', FORGE_REF_DEC_CRUCIBLE.path, RX(1560), LY(330), RS(280), RS(280) * (FORGE_REF_DEC_CRUCIBLE.h / FORGE_REF_DEC_CRUCIBLE.w), side);
    }
    // 小标签(左金竖条 + 向右淡出的暗底):已选装备 (1278..1420, 183..222)、预计获得 (1283..1398, 412..442)
    // 字色取自原型:已选装备亮金 (252,240,150)、预计获得暖金 (240,216,135)
    const sideTag = (name: string, text: string, px: number, py: number, w: number, h: number, size: number, color: Color): void => {
      const tagW = RS(w);
      const tagH = FS(h);
      const tagX = RX(px) + tagW / 2;
      if (!this.host.addSprite(`${name}Bg`, FORGE_DEC_TAG, tagX, LY(py), tagW, tagH, side)) {
        mountRefSolid(this.host, side, `${name}Bg`, tagX, LY(py), tagW, tagH, rgba(0, 0, 0, 150));
      }
      const label = this.host.addChildLabel(side, name, text, RX(px) + RS(16), LY(py) - FS(1), FS(size), color, new Size(tagW, tagH), HorizontalTextAlignment.LEFT);
      label.lineHeight = label.fontSize;
      label.isBold = true;
      this.applyOutline(label, scale, true);
    };
    sideTag('ForgeDecChosenTag', '已选装备', 1278, 203, 160, 40, 25, rgba(255, 236, 150));
    // 大号已选:「3」52 金 + 「/20 件」34 白(左对齐 x 1322,y 252)
    this.addRichLine(side, 'ForgeDecChosenNum', `<color=#FFC24A><size=${Math.round(FS(54))}>${chosen.length}</size></color><color=#F4ECDC><size=${Math.round(FS(34))}> /20 件</size></color>`, RX(1322), LY(252), FS(34), RS(300), 0);
    sideTag('ForgeDecGainTag', '预计获得', 1283, 427, 140, 34, 22, rgba(244, 218, 138));
    // 预计获得行:图标框 1333..1405 × 452..526 + 暗行 1405..1675(强化石 30 / 数字 44)
    const gainY = LY(489);
    mountRefSolid(this.host, side, 'ForgeDecGainRowBg', RX(1540), gainY, RS(270), FS(70), rgba(6, 5, 5, 205));
    const gainLine = this.host.addChildPlainNode(side, 'ForgeDecGainRowLine', RX(1540), gainY, RS(270), FS(70)).addComponent(Graphics);
    gainLine.strokeColor = rgba(150, 118, 70, 150);
    gainLine.lineWidth = Math.max(1, 1.2 * scale);
    gainLine.rect(-RS(135), -FS(35), RS(270), FS(70));
    gainLine.stroke();
    const iconBox = this.host.addChildPlainNode(side, 'ForgeDecGainIconBox', RX(1369), gainY, FS(74), FS(74));
    mountRefSolid(this.host, iconBox, 'Bg', 0, 0, FS(74), FS(74), rgba(16, 13, 12, 245));
    const ib = this.host.addChildPlainNode(iconBox, 'Line', 0, 0, FS(74), FS(74)).addComponent(Graphics);
    ib.strokeColor = rgba(196, 156, 92, 220);
    ib.lineWidth = Math.max(1, 1.6 * scale);
    ib.roundRect(-FS(37), -FS(37), FS(74), FS(74), FS(6));
    ib.stroke();
    this.host.addSprite('ForgeDecGainIcon', BAG_ICON_ENHANCE_STONE_ASSET, 0, 0, FS(66), FS(66), iconBox);
    const stoneName = this.host.addChildLabel(side, 'ForgeDecGainName', '强化石', RX(1430), gainY, FS(30), rgba(244, 234, 214), new Size(RS(130), FS(40)), HorizontalTextAlignment.LEFT);
    stoneName.lineHeight = stoneName.fontSize;
    stoneName.isBold = true;
    this.applyOutline(stoneName, scale, true);
    const stoneNum = this.host.addChildLabel(side, 'ForgeDecGainNum', `${formatInteger(estimate)}`, RX(1580), gainY, FS(44), rgba(255, 226, 150), new Size(RS(150), FS(52)));
    stoneNum.isBold = true;
    stoneNum.lineHeight = stoneNum.fontSize;
    stoneNum.overflow = Label.Overflow.SHRINK;
    this.applyOutline(stoneNum, scale, true);
    // 可能获得材料(y 562,两侧细金线 + 菱形)
    this.addPanelTitle(side, 'ForgeDecBonusTag', '可能获得材料', RX(1490), LY(562), RS(420), scale);
    const bonusDefs: Array<{ key: string; icon: string; label: string; range: [number, number] }> = [
      { key: 'bless', icon: FORGE_AI_BLESS_ICON_ASSET, label: '祝福石', range: blessRange },
      { key: 'rune', icon: FORGE_AI_GUARD_ICON_ASSET, label: '守护符', range: runeRange },
    ];
    bonusDefs.forEach((def, index) => {
      const px = index === 0 ? 1290 : 1493;
      const cw = RS(195);
      const chh = FS(80);
      const card = this.host.addChildPlainNode(side, `ForgeDecBonus_${def.key}`, RX(px) + cw / 2, LY(625), cw, chh);
      if (!mountRefSliced(this.host, card, 'Art', REF_ROW, 0, 0, cw, chh)) {
        drawRefPanelFallback(card, cw, chh, scale);
      }
      const icon = FS(58);
      this.host.addSprite(`ForgeDecBonusIcon_${def.key}`, def.icon, -cw / 2 + RS(16) + icon / 2, 0, icon, icon, card);
      const textX = -cw / 2 + RS(16) + icon + RS(14);
      const nameLabel = this.host.addChildLabel(card, `ForgeDecBonusName_${def.key}`, def.label, textX, FS(16), FS(20), rgba(240, 214, 146), new Size(cw - icon - RS(40), FS(26)), HorizontalTextAlignment.LEFT);
      nameLabel.lineHeight = nameLabel.fontSize;
      nameLabel.overflow = Label.Overflow.SHRINK;
      const rangeText = def.range[1] <= 0 ? 'x0' : `x${def.range[0]}~${def.range[1]}`;
      const rangeLabel = this.host.addChildLabel(card, `ForgeDecBonusRange_${def.key}`, rangeText, textX, -FS(15), FS(28), rgba(250, 244, 230), new Size(cw - icon - RS(40), FS(34)), HorizontalTextAlignment.LEFT);
      rangeLabel.isBold = true;
      rangeLabel.lineHeight = rangeLabel.fontSize;
      rangeLabel.overflow = Label.Overflow.SHRINK;
      this.applyOutline(rangeLabel, scale, true);
    });
    // 提示(y 686):金色感叹章 + 橙金字
    const warnIcon = FS(26);
    const warnText = '高品质装备分解可获得更多材料';
    const warnSize = FS(19);
    const warnW = warnIcon + FS(8) + warnText.length * warnSize;
    const warnX0 = RX(1490) - warnW / 2;
    if (!this.host.addSprite('ForgeDecWarnIcon', FORGE_DEC_WARN, warnX0 + warnIcon / 2, LY(686), warnIcon, warnIcon, side)) {
      const wl = this.host.addChildLabel(side, 'ForgeDecWarnIcon', '!', warnX0 + warnIcon / 2, LY(686), FS(20), rgba(255, 196, 90), new Size(warnIcon, warnIcon));
      wl.isBold = true;
    }
    const warn = this.host.addChildLabel(side, 'ForgeDecSideWarn', warnText, warnX0 + warnIcon + FS(8), LY(686), warnSize, rgba(244, 196, 120), new Size(warnText.length * warnSize + FS(10), FS(28)), HorizontalTextAlignment.LEFT);
    warn.lineHeight = warn.fontSize;
    warn.overflow = Label.Overflow.SHRINK;
    this.applyOutline(warn, scale, false);
    // 两钮:分解(红翼 1278..1495 × 720..793)/ 批量分解设置(暗金 1515..1700 × 728..788)
    plateButton(side, 'ForgeDecConfirm', state.busy ? '分解中…' : '分 解', RX(1386), LY(756), RS(222), FS(78), REF_ULT.btnPrimary, !state.busy && chosen.length > 0, FS(32), () => this.host.decomposeLobbyForgeSelected());
    plateButton(side, 'ForgeDecBatchButton', '批量设置', RX(1607), LY(758), RS(190), FS(60), REF_PLATE_DARK, !state.busy, FS(21), () => this.host.setLobbyForgeDecomposeBatchOpen(true));

    // 批量分解设置弹窗:按规则快速勾选(≤20 件)。
    if (forge.decomposeBatchOpen) {
      if (this.phone) {
        this.phoneOverlays.push((root) => this.renderDecomposeBatchDialog(root, unworn, this.stageW, scale));
      } else {
        this.renderDecomposeBatchDialog(this.overlayRoot ?? parent, unworn, panelWidth, scale);
      }
    }
  }

  // 批量分解设置:常用规则一键选满(白绿装/蓝装及以下/未强化),交给现有选中集(上限 20)。
  private renderDecomposeBatchDialog(parent: Node, unworn: EquipmentItemVO[], panelWidth: number, scale: number): void {
    // 2026-10-21 用户「批量设置点了没 UI」:旧版整块 Graphics 弹窗在原生上不出图 → 换背包二级弹窗同款(贴图实底 + 细金框 + 红标题带 + 金环关闭)
    const k = this.fuseBgK > 0 ? this.fuseBgK : Math.min(this.stageW / 1870, this.stageH / 841);
    const FS = (v: number): number => v * k;
    const dimW = Math.max(panelWidth, this.stageW) * 2;
    const dimH = this.stageH * 2;
    const overlay = this.host.addChildPlainNode(parent, 'ForgeDecBatchOverlay', 0, 0, dimW, dimH);
    mountRefSolid(this.host, overlay, 'Fill', 0, 0, dimW, dimH, rgba(0, 0, 0, 210));
    overlay.addComponent(BlockInputEvents);
    const w = FS(900);
    const h = FS(560);
    const PAD = FS(40);
    const dialog = this.host.addChildPlainNode(overlay, 'ForgeDecBatchDialog', 0, 0, w, h);
    dialog.addComponent(BlockInputEvents);
    mountRefSolid(this.host, dialog, 'Back', 0, 0, w, h, rgba(10, 8, 9, 244));
    mountRefDialogBackdrop(this.host, dialog, REF_DETAIL_INNER_BG, 0, 0, w, h, 215, true);
    mountRefLineFrame(this.host, dialog, 'Frame', w, h);
    const HB = REF_BAG_DLG.headerBand;
    const hk = w / HB.w;
    const bandH = (HB.bodyY1 - HB.bodyY0) * hk;
    const bandCy = h / 2 - FS(20) - bandH / 2;
    this.host.addSprite('Band', HB.path, 0, bandCy + ((HB.bodyY0 + HB.bodyY1) / 2 - HB.h / 2) * hk, HB.w * hk, HB.h * hk, dialog);
    const titleText = '批量设置';
    const titleSize = FS(32);
    const titleW = titleText.length * titleSize * 1.1;
    this.host.addSprite('Star', REF_TITLE_STAR_ASSET, -titleW / 2 - FS(30), bandCy, FS(52), FS(52), dialog);
    const title = this.host.addChildLabel(dialog, 'Title', titleText.split('').join(String.fromCharCode(0x2009)), FS(6), bandCy, titleSize, rgba(255, 228, 156), new Size(titleW + FS(24), FS(44)));
    title.lineHeight = title.fontSize;
    title.isBold = true;
    this.applyOutline(title, scale, true);
    const closeSize = FS(56);
    const close = this.host.addChildPlainNode(dialog, 'Close', w / 2 - PAD - closeSize / 2, bandCy, closeSize + FS(10), closeSize + FS(10));
    this.host.addSprite('Art', REF_CLOSE_RING_ASSET, 0, 0, closeSize, closeSize, close);
    close.addComponent(Button);
    this.host.applyImageButtonFeedback(close, 1.08, 0.92);
    close.on(Button.EventType.CLICK, () => this.host.setLobbyForgeDecomposeBatchOpen(false), this);
    const hintY = bandCy - bandH / 2 - FS(36);
    const hint = this.host.addChildLabel(dialog, 'Hint', '按规则一键勾选未穿戴装备(单次上限 20 件)', 0, hintY, FS(21), rgba(200, 192, 176), new Size(w - PAD * 2, FS(30)));
    hint.lineHeight = hint.fontSize;
    const rules: Array<{ key: string; label: string; filter: (item: EquipmentItemVO) => boolean }> = [
      { key: 'lowq', label: '全选 白装 / 绿装', filter: (item) => ['WHITE', 'GREEN'].includes((item.quality || '').toUpperCase()) },
      { key: 'blue', label: '全选 蓝装及以下', filter: (item) => ['WHITE', 'GREEN', 'BLUE'].includes((item.quality || '').toUpperCase()) },
      { key: 'zero', label: '全选 未强化装备', filter: (item) => (item.enhanceLevel ?? 0) === 0 },
    ];
    // 规则行:宽 = 弹窗内宽,高 84,间 18;整组在说明行与底边之间居中
    const rowW = w - PAD * 2;
    const rowH = FS(84);
    const gap = FS(18);
    const groupH = rules.length * rowH + (rules.length - 1) * gap;
    const groupTop = (hintY - FS(24) + (-h / 2 + PAD)) / 2 + groupH / 2;
    rules.forEach((rule, index) => {
      const ids = unworn.filter(rule.filter).map((item) => item.id).slice(0, 20);
      const enabled = ids.length > 0;
      const rowY = groupTop - rowH / 2 - index * (rowH + gap);
      const row = this.host.addChildPlainNode(dialog, `ForgeDecBatchRule_${rule.key}`, 0, rowY, rowW, rowH);
      if (!mountRefSliced(this.host, row, 'Art', enabled ? REF_ROW_SELECTED : REF_ROW, 0, 0, rowW, rowH)) {
        drawRefPanelFallback(row, rowW, rowH, scale);
      }
      const label = this.host.addChildLabel(row, 'Label', rule.label, -rowW / 2 + FS(36), 0, FS(26), enabled ? rgba(250, 238, 200) : rgba(160, 152, 140), new Size(rowW * 0.6, FS(36)), HorizontalTextAlignment.LEFT);
      label.lineHeight = label.fontSize;
      label.isBold = true;
      this.applyOutline(label, scale, true);
      const count = this.host.addChildLabel(row, 'Count', `${ids.length} 件`, rowW / 2 - FS(36), 0, FS(26), enabled ? rgba(255, 210, 90) : rgba(150, 142, 130), new Size(FS(160), FS(36)), HorizontalTextAlignment.RIGHT);
      count.lineHeight = count.fontSize;
      count.isBold = true;
      this.applyOutline(count, scale, true);
      if (enabled) {
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, () => {
          this.host.setLobbyForgeDecomposeSelection(ids);
          this.host.setLobbyForgeDecomposeBatchOpen(false);
        }, this);
        this.host.applyImageButtonFeedback(row, 1.02, 0.98);
      } else {
        row.addComponent(UIOpacity).opacity = 150;
      }
    });
  }

  // 装备方格网格定位:首屏放得下就直接挂父节点;放不下改纵向滚动区全部列出(封顶 FORGE_PHONE_GRID_CAP,
  // 电脑 / 手机一致,2026-10-17 起电脑端也滚动),"显示前 N 件"提示挂在滚动内容末尾。
  private phoneGrid(
    parent: Node,
    key: string,
    total: number,
    columns: number,
    capacity: number,
    cx: number,
    width: number,
    top: number,
    bottom: number,
    cell: number,
    gap: number,
    scale: number,
  ): { parent: Node; count: number; position: (index: number) => { x: number; y: number }; moreParent: Node; moreX: number; moreY: number } {
    if (total <= capacity) {
      const left = cx - width / 2 + cell / 2;
      return {
        parent,
        count: Math.min(total, capacity),
        position: (index) => ({ x: left + (index % columns) * (cell + gap), y: top - cell / 2 - Math.floor(index / columns) * (cell + gap) }),
        moreParent: parent,
        moreX: cx,
        moreY: bottom - 2 * scale,
      };
    }
    const count = Math.min(total, FORGE_PHONE_GRID_CAP);
    const rows = Math.ceil(count / columns);
    const pad = 4 * scale;
    // 视口高按整行收(原型:一屏正好 N 整行 + 滚动条,不露半截格子)
    const fitRows = Math.max(1, Math.floor((top - bottom - pad + gap) / (cell + gap)));
    bottom = top - fitRows * cell - (fitRows - 1) * gap - pad;
    const hintH = total > count ? 30 * scale : 0;
    const contentH = pad * 2 + rows * cell + Math.max(0, rows - 1) * gap + hintH;
    const scroll = this.addPhoneScroll(parent, key, cx, top + pad, bottom, width + pad * 2, contentH, scale);
    const left = -width / 2 + cell / 2;
    return {
      parent: scroll.content,
      count,
      position: (index) => ({ x: left + (index % columns) * (cell + gap), y: scroll.topY - pad - cell / 2 - Math.floor(index / columns) * (cell + gap) }),
      moreParent: scroll.content,
      moreX: 0,
      moreY: -Math.max(contentH, top + pad - bottom) / 2 + pad + hintH / 2,
    };
  }

  // 手机纵向滚动区(Mask + ScrollView,触屏拖动/鼠标滚轮通用):cx/top/bottom 为父节点坐标;
  // 返回内容节点与其局部"内容顶"y,子项按 topY 往下排。整页重绘按 key 恢复滚动位置(夹到合法区间);
  // 内容超出视口时右缘画细滚动条,提示还能往下翻。
  private addPhoneScroll(parent: Node, key: string, cx: number, top: number, bottom: number, width: number, contentH: number, scale: number): { content: Node; topY: number } {
    const viewportH = Math.max(1, top - bottom);
    const fullH = Math.max(viewportH, contentH);
    const viewport = this.host.addChildPlainNode(parent, `${key}Scroll`, cx, (top + bottom) / 2, width, viewportH);
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    scrollView.cancelInnerEvents = true;
    const baseY = (viewportH - fullH) / 2;
    const maxOffset = fullH - viewportH;
    const content = this.host.addChildPlainNode(viewport, `${key}ScrollContent`, 0, baseY, width, fullH);
    scrollView.content = content;
    const saved = this.phoneScrollY.get(key);
    if (saved !== undefined) {
      content.setPosition(0, Math.min(baseY + maxOffset, Math.max(baseY, saved)));
    }
    let drawBar: (() => void) | null = null;
    if (maxOffset > 1) {
      const trackH = viewportH - 8 * scale;
      const thumbH = Math.max(36 * scale, trackH * (viewportH / fullH));
      const update = mountRefScrollBar(this.host, parent, `${key}ScrollBar`, cx + width / 2 + 7 * scale, (top + bottom) / 2, 5 * scale, trackH, thumbH);
      drawBar = () => update(Math.min(maxOffset, Math.max(0, content.position.y - baseY)) / maxOffset);
      drawBar();
    }
    viewport.on(ScrollView.EventType.SCROLLING, () => {
      this.phoneScrollY.set(key, content.position.y);
      drawBar?.();
    }, this);
    return { content, topY: fullH / 2 };
  }

  // 主操作按钮(强化/合成/分解共用):AI 图优先(2.5:1 等比,高度由宽度推出),缺图红底金描边兜底。
  private renderPrimaryButton(parent: Node, name: string, text: string, x: number, y: number, width: number, scale: number, enabled: boolean, onClick: () => void, onDisabledClick?: () => void, iconPath?: string, kind: 'primary' | 'secondary' = 'primary'): void {
    // 2026-10-15 原型套件按钮(红金主钮 / 暗金副钮);灰态 = 副钮底半透明
    const height = width / 3.9;
    const refKind = !enabled ? (kind === 'primary' ? 'primaryDisabled' : 'disabled') : kind;
    const refButton = mountRefButton(this.host, parent, name, text, x, y, width, height, scale, refKind, enabled ? onClick : onDisabledClick, { fontSize: 23 * scale, iconPath: enabled ? iconPath : undefined });
    if (refButton.getChildByName('ArtArt') || refButton.getChildByName('Art')) {
      return;
    }
    refButton.destroy();
    const btn = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const art = enabled ? this.host.addSprite(`${name}Art`, FORGE_AI_BUTTON_ASSET, 0, 0, width, height, btn) : null;
    if (!art) {
      const g = btn.addComponent(Graphics);
      g.fillColor = enabled ? rgba(122, 42, 30, 240) : rgba(42, 22, 18, 232);
      g.roundRect(-width / 2, -height / 2, width, height, 9 * scale);
      g.fill();
      g.strokeColor = enabled ? rgba(240, 186, 96, 235) : rgba(164, 126, 68, 185);
      g.lineWidth = 2 * scale;
      g.roundRect(-width / 2, -height / 2, width, height, 9 * scale);
      g.stroke();
    }
    // 手机按钮窄(洗练钮约 135):AI 图两端锤饰约占 22%,字框收到中间 58%,不再压到锤饰上。
    const labelW = this.phone && art ? width * 0.58 : width - 18 * scale;
    const label = this.host.addChildLabel(btn, `${name}Label`, text, 0, 0, 23 * scale, enabled ? rgba(250, 228, 172) : rgba(230, 215, 191), new Size(labelW, height - 10 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    if (enabled) {
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, onClick, this);
      this.host.applyImageButtonFeedback(btn);
    } else if (onDisabledClick) {
      // 灰态按钮也接点击:只用来解释为什么不能点(2026-09-22)。
      btn.addComponent(Button);
      btn.on(Button.EventType.CLICK, onDisabledClick, this);
    }
  }

  // 装备图标:真图(v2 不透明暗底方图,直出无衬底)优先 → 部位图标 → 线稿。box 为容器边长,offsetY 为垂直偏移。
  private addEquipIcon(parent: Node, name: string, equipCode: string | null | undefined, slot: string, box: number, scale: number, offsetY = 0): void {
    const equipAsset = equipIconAssetByCode(equipCode);
    if (equipAsset) {
      const iconW = box * 0.96;
      mountEquipIconBacking(this.host, parent, `${name}Backing`, iconW, equipCode, { y: offsetY });
      if (this.host.addSprite(name, equipAsset, 0, offsetY, iconW, iconW, parent)) {
        return;
      }
    }
    const slotAsset = FORGE_AI_SLOT_ICON_ASSETS[slot];
    if (slotAsset && this.host.addSprite(name, slotAsset, 0, offsetY, box * 0.7, box * 0.7, parent)) {
      return;
    }
    const holder = this.host.addChildPlainNode(parent, `${name}Glyph`, 0, offsetY, box * 0.7, box * 0.7);
    this.drawSlotGlyph(holder, slot, box * 0.6, scale);
  }

  // 面板底(参考图1):深色半透明实底 + 细单线金框。返回容器节点。
  private addOrnatePanel(parent: Node, name: string, x: number, y: number, width: number, height: number, scale: number): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    // 2026-10-15:原型套件细金框(角饰不变形);内里再垫一层实底压住炉火背景
    if (mountRefSliced(this.host, node, 'Frame', REF_KIT.cardFrame, 0, 0, width, height)) {
      const back = this.host.addChildPlainNode(node, 'Back', 0, 0, width - 10 * scale, height - 10 * scale).addComponent(Graphics);
      back.fillColor = rgba(10, 8, 8, 200);
      back.roundRect(-(width - 10 * scale) / 2, -(height - 10 * scale) / 2, width - 10 * scale, height - 10 * scale, 6 * scale);
      back.fill();
      node.getChildByName('Back')?.setSiblingIndex(0);
      return node;
    }
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(12, 10, 9, 212);
    g.roundRect(-width / 2, -height / 2, width, height, 6 * scale);
    g.fill();
    g.strokeColor = rgba(196, 158, 88, 190);
    g.lineWidth = 1.4 * scale;
    g.roundRect(-width / 2, -height / 2, width, height, 6 * scale);
    g.stroke();
    return node;
  }

  // 面板标题(参考图1):居中金字 + 两侧饰线(footer_divider 素材,缺图退回手绘线+菱形点)。
  private addPanelTitle(parent: Node, name: string, text: string, cx: number, y: number, width: number, scale: number): void {
    const label = this.host.addChildLabel(parent, name, text, cx, y, 22 * scale, rgba(238, 206, 138), new Size(width * 0.6, 30 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.applyOutline(label, scale, true);
    const inner = (text.length * 22 * scale) / 2 + 20 * scale;
    const outer = width / 2 - 18 * scale;
    if (outer <= inner + 12 * scale) {
      return;
    }
    const artWidth = Math.min(90 * scale, outer - inner);
    if (artWidth >= 40 * scale) {
      const leftArt = this.host.addSprite(`${name}DividerL`, FOOTER_DIVIDER_LEFT_ASSET, cx - inner - artWidth / 2, y, artWidth, artWidth * FOOTER_DIVIDER_ASPECT, parent);
      const rightArt = this.host.addSprite(`${name}DividerR`, FOOTER_DIVIDER_RIGHT_ASSET, cx + inner + artWidth / 2, y, artWidth, artWidth * FOOTER_DIVIDER_ASPECT, parent);
      if (leftArt && rightArt) {
        return;
      }
      leftArt?.node.destroy();
      rightArt?.node.destroy();
    }
    const deco = this.host.addChildPlainNode(parent, `${name}Deco`, cx, y, width, 12 * scale);
    const g = deco.addComponent(Graphics);
    g.strokeColor = rgba(168, 132, 74, 170);
    g.lineWidth = 1.2 * scale;
    g.moveTo(-outer, 0);
    g.lineTo(-inner, 0);
    g.moveTo(inner, 0);
    g.lineTo(outer, 0);
    g.stroke();
    g.fillColor = rgba(214, 172, 96, 225);
    for (const dx of [-inner, inner]) {
      g.moveTo(dx - 5 * scale, 0);
      g.lineTo(dx, 4 * scale);
      g.lineTo(dx + 5 * scale, 0);
      g.lineTo(dx, -4 * scale);
      g.close();
    }
    g.fill();
  }

  // 混色同行文本:按字宽估算(CJK≈字号,ASCII≈0.55字号)顺排后整体居中。
  /**
   * 合成连线:波浪电光贴图沿两点拉伸(3 张 0.09s 轮换出电流闪烁)+ 光点从材料槽流向法阵循环;
   * 贴图未到货时退回三层发光直线。动画挂在节点自身的 tween 上,节点随页面重建销毁即停。
   */
  private mountFuseBeam(parent: Node, name: string, x1: number, y1: number, x2: number, y2: number, thick: number, phase: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const holder = this.host.addChildPlainNode(parent, name, (x1 + x2) / 2, (y1 + y2) / 2, len, thick);
    holder.angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const frames = FORGE_FUSE_BEAMS.map((path, i) => this.host.addSprite(`Frame_${i}`, path, 0, 0, len * 1.12, thick, holder)).filter((sp): sp is Sprite => !!sp);
    if (frames.length === 0) {
      const g = holder.addComponent(Graphics);
      for (const [w, a] of [[12, 50], [6, 120], [2.2, 230]] as Array<[number, number]>) {
        g.strokeColor = rgba(110, 170, 255, a);
        g.lineWidth = w;
        g.moveTo(-len / 2, 0);
        g.lineTo(len / 2, 0);
        g.stroke();
      }
      return;
    }
    const ops = frames.map((sp, i) => {
      const op = sp.node.addComponent(UIOpacity);
      op.opacity = i === 0 ? 255 : 0;
      return op;
    });
    let current = 0;
    if (ops.length > 1) {
      tween(holder).delay(phase).repeatForever(tween(holder).delay(0.09).call(() => {
        if (!holder.isValid) {
          return;
        }
        ops[current].opacity = 0;
        current = (current + 1) % ops.length;
        ops[current].opacity = 255;
      })).start();
    }
    const spark = this.host.addSprite('Spark', FORGE_FUSE_SPARK, -len / 2, 0, thick * 1.1, thick * 1.1, holder);
    if (spark) {
      const from = new Vec3(-len / 2, 0, 0);
      const to = new Vec3(len / 2, 0, 0);
      spark.node.setScale(0.6, 0.6, 1);
      tween(spark.node)
        .delay(phase)
        .repeatForever(tween(spark.node)
          .set({ position: from, scale: new Vec3(0.6, 0.6, 1) })
          .to(0.5, { position: to, scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineIn' })
          .delay(0.2))
        .start();
    }
  }

  /** 一行彩色富文本(整行居中,字粗体 + 黑描边);拼接多个 Label 估宽不准,改用 RichText。 */
  private addRichLine(parent: Node, name: string, html: string, x: number, y: number, size: number, maxW: number, anchorX = 0.5): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, maxW, size * 1.4);
    // anchorX:0.5 整行居中;1 = 右缘对齐到 x;0 = 左缘对齐到 x(RichText 按内容定宽,锚点决定对齐)
    node.getComponent(UITransform)?.setAnchorPoint(anchorX, 0.5);
    const rich = node.addComponent(RichText);
    rich.fontSize = size;
    rich.lineHeight = size * 1.25;
    rich.maxWidth = 0;
    rich.horizontalAlign = HorizontalTextAlignment.CENTER;
    rich.string = `<b><outline color=#000000 width=2>${html}</outline></b>`;
    return node;
  }

  private layoutInlineSegments(parent: Node, name: string, segments: { text: string; color: ReturnType<typeof rgba>; size: number }[], cx: number, y: number, scale: number): void {
    const est = (text: string, size: number) => {
      let w = 0;
      for (const ch of text) {
        w += ch.charCodeAt(0) > 255 ? size : size * 0.55;
      }
      return w;
    };
    const total = segments.reduce((sum, seg) => sum + est(seg.text, seg.size), 0);
    let x = cx - total / 2;
    segments.forEach((seg, index) => {
      const w = est(seg.text, seg.size);
      const label = this.host.addChildLabel(parent, `${name}_${index}`, seg.text, x + w / 2, y, seg.size, seg.color, new Size(w + 10 * scale, seg.size + 12 * scale));
      label.overflow = Label.Overflow.SHRINK;
      this.applyOutline(label, scale, seg.size >= 24 * scale);
      x += w;
    });
  }

  // 背包式方块单元:品质底/描边 + 部位图标 + 底部名字条 + 右上 +N + 左上"穿"标;强化/分解网格共用。
  private renderDecomposeCell(parent: Node, name: string, item: EquipmentItemVO, x: number, y: number, cell: number, scale: number, picked: boolean, FS: (v: number) => number, opts: { mark?: 'check' | 'frame'; worn?: boolean; whiteName?: boolean } = {}): Node {
    const iconAsset = equipIconAssetByCode(item.equipCode);
    if (!iconAsset) {
      return this.renderEquipCell(parent, name, item, x, y, cell, scale, picked);
    }
    const node = this.host.addChildPlainNode(parent, name, x, y, cell, cell);
    mountEquipIconBacking(this.host, node, `${name}IconBacking`, cell, item.equipCode);
    if (picked) {
      const glow = this.host.addChildPlainNode(node, 'Glow', 0, 0, cell, cell).addComponent(Graphics);
      for (const [pad, alpha, width] of [[5, 60, 8], [2.5, 120, 4]] as Array<[number, number, number]>) {
        glow.strokeColor = rgba(255, 196, 90, alpha);
        glow.lineWidth = FS(width);
        glow.roundRect(-cell / 2 - FS(pad), -cell / 2 - FS(pad), cell + FS(pad) * 2, cell + FS(pad) * 2, FS(10));
        glow.stroke();
      }
    }
    this.host.addSprite(`${name}Icon`, iconAsset, 0, 0, cell, cell, node);
    const q = equipQualityColor(item.quality);
    const stripH = FS(26);
    mountRefSolid(this.host, node, `${name}Strip`, 0, -cell / 2 + FS(6) + stripH / 2, cell - FS(10), stripH, rgba(0, 0, 0, 150));
    const lift = (c: number): number => Math.round(c + (255 - c) * 0.55);
    const nm = this.host.addChildLabel(node, `${name}Name`, safeText(item.equipName), 0, -cell / 2 + FS(6) + stripH / 2, FS(19), opts.whiteName ? rgba(232, 230, 220) : rgba(lift(q.r), lift(q.g), lift(q.b), 255), new Size(cell - FS(12), stripH));
    nm.enableWrapText = false;
    nm.overflow = Label.Overflow.SHRINK;
    nm.lineHeight = nm.fontSize;
    this.applyOutline(nm, scale, true);
    const level = item.enhanceLevel ?? 0;
    if (level > 0) {
      const badge = this.host.addChildLabel(node, `${name}Level`, `+${level}`, cell / 2 - FS(8), cell / 2 - FS(18), FS(24), rgba(255, 244, 220), new Size(FS(50), FS(30)), HorizontalTextAlignment.RIGHT);
      badge.isBold = true;
      badge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(badge, scale, true);
    }
    if (picked) {
      const frame = this.host.addChildPlainNode(node, 'PickFrame', 0, 0, cell, cell).addComponent(Graphics);
      frame.strokeColor = rgba(255, 214, 120, 255);
      frame.lineWidth = FS(3.5);
      frame.roundRect(-cell / 2, -cell / 2, cell, cell, FS(8));
      frame.stroke();
      if (opts.mark === 'frame') {
        // 只要金框(宝石页选中)
      } else if (!this.host.addSprite(`${name}Check`, FORGE_DEC_CHECK, 0, FS(6), cell * 0.5, cell * 0.5, node)) {
        const ck = this.host.addChildLabel(node, `${name}Check`, '✓', 0, FS(6), FS(44), rgba(255, 214, 120), new Size(cell * 0.5, cell * 0.5));
        this.applyOutline(ck, scale, true);
      }
    }
    if (opts.worn) {
      // 原型:左上绿底「穿」角标
      const tagW = FS(26);
      mountRefSolid(this.host, node, `${name}WornBg`, -cell / 2 + FS(4) + tagW / 2, cell / 2 - FS(4) - tagW / 2, tagW, tagW, rgba(30, 96, 52, 240));
      const wl = this.host.addChildLabel(node, `${name}Worn`, '穿', -cell / 2 + FS(4) + tagW / 2, cell / 2 - FS(4) - tagW / 2, FS(18), rgba(236, 250, 236), new Size(tagW, tagW));
      wl.isBold = true;
      wl.lineHeight = wl.fontSize;
      this.applyOutline(wl, scale, false);
    }
    return node;
  }

  private renderEquipCell(parent: Node, name: string, item: EquipmentItemVO, x: number, y: number, cell: number, scale: number, highlighted: boolean): Node {
    const q = equipQualityColor(item.quality);
    const node = this.host.addChildPlainNode(parent, name, x, y, cell, cell);
    const g = node.addComponent(Graphics);
    // 方形雕花框(slot_frame,与强化界面同款);缺图回退品质底色方块。品质/选中描边叠在框上。
    // 稀有度彩边框优先(原型);缺图退暗铁框 + 品质细描边
    const rarityFrameAsset = FORGE_REF_CELL_FRAMES[(item.quality || '').toUpperCase()];
    const rarityArt = rarityFrameAsset ? this.host.addSprite(`${name}FrameArt`, rarityFrameAsset, 0, 0, cell * 1.08, cell * 1.08, node) : null;
    const frameArt = rarityArt ?? this.host.addSprite(`${name}FrameArt`, FORGE_AI_SLOT_FRAME_ASSET, 0, 0, cell, cell, node);
    if (!frameArt) {
      g.fillColor = rgba(Math.round(q.r * 0.18 + 8), Math.round(q.g * 0.18 + 8), Math.round(q.b * 0.18 + 8), 238);
      g.roundRect(-cell / 2, -cell / 2, cell, cell, 9 * scale);
      g.fill();
    }
    if (highlighted) {
      // 选中:外圈柔金光(原型)
      g.strokeColor = rgba(255, 196, 90, 90);
      g.lineWidth = 7 * scale;
      g.roundRect(-cell / 2 - 3 * scale, -cell / 2 - 3 * scale, cell + 6 * scale, cell + 6 * scale, 11 * scale);
      g.stroke();
    }
    if (highlighted || !rarityArt) {
      g.strokeColor = highlighted ? rgba(255, 218, 120, 255) : rgba(q.r, q.g, q.b, frameArt ? 220 : 235);
      g.lineWidth = (highlighted ? 3 : frameArt ? 1.3 : 1.6) * scale;
      g.roundRect(-cell / 2, -cell / 2, cell, cell, 9 * scale);
      g.stroke();
    }
    this.addEquipIcon(node, `${name}Icon`, item.equipCode, item.slot, cell * (rarityArt ? 0.8 : 0.84), scale, 6 * scale);
    const stripW = cell - 6 * scale;
    const strip = this.host.addChildPlainNode(node, `${name}Strip`, 0, -cell / 2 + 13 * scale, stripW, 20 * scale);
    const sg = strip.addComponent(Graphics);
    sg.fillColor = rgba(6, 5, 5, 205);
    sg.roundRect(-stripW / 2, -10 * scale, stripW, 20 * scale, 5 * scale);
    sg.fill();
    // 名字:品质色往白提 35% + 描边(2026-10-17 用户「字体看着也有些暗」;原型格名亮而清楚)
    const lift = (c: number): number => Math.round(c + (255 - c) * 0.35);
    const nm = this.host.addChildLabel(strip, `${name}Name`, safeText(item.equipName), 0, 0, 17 * scale, rgba(lift(q.r), lift(q.g), lift(q.b), 255), new Size(stripW - 4 * scale, 22 * scale));
    nm.enableWrapText = false;
    nm.overflow = Label.Overflow.SHRINK;
    nm.lineHeight = nm.fontSize;
    this.applyOutline(nm, scale, false);
    const level = item.enhanceLevel ?? 0;
    if (level > 0) {
      const badge = this.host.addChildLabel(node, `${name}Level`, `+${level}`, cell / 2 - 6 * scale, cell / 2 - 13 * scale, 18 * scale, rgba(250, 224, 150), new Size(36 * scale, 24 * scale), HorizontalTextAlignment.RIGHT);
      badge.overflow = Label.Overflow.SHRINK;
      this.applyOutline(badge, scale, true);
    }
    if (item.heroId != null) {
      const wornW = 24 * scale;
      const worn = this.host.addChildPlainNode(node, `${name}Worn`, -cell / 2 + wornW / 2 + 4 * scale, cell / 2 - 13 * scale, wornW, 18 * scale);
      const wg = worn.addComponent(Graphics);
      wg.fillColor = rgba(30, 52, 34, 238);
      wg.roundRect(-wornW / 2, -9 * scale, wornW, 18 * scale, 4 * scale);
      wg.fill();
      wg.strokeColor = rgba(112, 196, 118, 180);
      wg.lineWidth = 1 * scale;
      wg.stroke();
      const wl = this.host.addChildLabel(worn, `${name}WornLabel`, '穿', 0, 0, 15 * scale, rgba(201, 236, 204), new Size(wornW - 2 * scale, 22 * scale));
      wl.overflow = Label.Overflow.SHRINK;
    }
    return node;
  }

  // 装备图标框:品质底色方框 + 部位 AI 图标(缺图画线稿轮廓),给纯文字行补"物件感"。
  private renderEquipIconBox(parent: Node, name: string, item: EquipmentItemVO, x: number, y: number, size: number, scale: number, showcase = false): void {
    const q = equipQualityColor(item.quality);
    const box = this.host.addChildPlainNode(parent, name, x, y, size, size);
    // 原型列表:新图标自带稀有度发光框,满格贴,不再套色调底
    const framedIcon = showcase ? equipIconAssetByCode(item.equipCode) : null;
    if (framedIcon) {
      mountEquipIconBacking(this.host, box, `${name}Backing`, size, item.equipCode);
    }
    if (framedIcon && this.host.addSprite(`${name}Art`, framedIcon, 0, 0, size, size, box)) {
      return;
    }
    const g = box.addComponent(Graphics);
    if (showcase) {
      // 原型列表:稀有度色调底 + 亮色透明展示图(原方形图标自带暗底,显得发暗)
      g.fillColor = rgba(Math.round(q.r * 0.34 + 10), Math.round(q.g * 0.34 + 10), Math.round(q.b * 0.34 + 10), 245);
      g.roundRect(-size / 2, -size / 2, size, size, 7 * scale);
      g.fill();
      g.strokeColor = rgba(q.r, q.g, q.b, 235);
      g.lineWidth = 1.8 * scale;
      g.roundRect(-size / 2, -size / 2, size, size, 7 * scale);
      g.stroke();
      const art = equipShowcaseAssetByCode(item.equipCode);
      if (art && this.host.addSprite(`${name}Art`, art, 0, 0, size * 0.92, size * 0.92, box)) {
        return;
      }
      this.addEquipIcon(box, `${name}Art`, item.equipCode, item.slot, size * 0.84, scale);
      return;
    }
    g.fillColor = rgba(Math.round(q.r * 0.24 + 8), Math.round(q.g * 0.24 + 8), Math.round(q.b * 0.24 + 8), 242);
    g.roundRect(-size / 2, -size / 2, size, size, 7 * scale);
    g.fill();
    g.strokeColor = rgba(q.r, q.g, q.b, 225);
    g.lineWidth = 1.6 * scale;
    g.roundRect(-size / 2, -size / 2, size, size, 7 * scale);
    g.stroke();
    this.addEquipIcon(box, `${name}Art`, item.equipCode, item.slot, size * 0.84, scale);
  }

  // 兜底线稿:六部位简笔轮廓(与大厅导航图标同思路,AI 图标未生成前的过渡)。
  private drawSlotGlyph(parent: Node, slotCode: string, size: number, scale: number): void {
    const node = this.host.addChildPlainNode(parent, 'SlotGlyph', 0, 0, size, size);
    const g = node.addComponent(Graphics);
    const half = size / 2;
    g.strokeColor = rgba(228, 206, 160, 228);
    g.lineWidth = Math.max(1.4, 1.8 * scale);
    switch (slotCode) {
      case 'WEAPON':
        g.moveTo(-half * 0.55, -half * 0.62);
        g.lineTo(half * 0.5, half * 0.5);
        g.moveTo(-half * 0.05, half * 0.35);
        g.lineTo(half * 0.3, 0);
        g.moveTo(-half * 0.62, half * 0.36);
        g.lineTo(-half * 0.36, half * 0.62);
        g.stroke();
        return;
      case 'HELMET':
        g.arc(0, -half * 0.05, half * 0.58, Math.PI, 0, true);
        g.stroke();
        g.moveTo(-half * 0.58, -half * 0.05);
        g.lineTo(-half * 0.58, half * 0.42);
        g.moveTo(half * 0.58, -half * 0.05);
        g.lineTo(half * 0.58, half * 0.42);
        g.moveTo(0, -half * 0.05);
        g.lineTo(0, half * 0.5);
        g.stroke();
        return;
      case 'CHEST':
        g.moveTo(-half * 0.55, half * 0.5);
        g.lineTo(-half * 0.55, -half * 0.3);
        g.lineTo(-half * 0.25, -half * 0.55);
        g.lineTo(half * 0.25, -half * 0.55);
        g.lineTo(half * 0.55, -half * 0.3);
        g.lineTo(half * 0.55, half * 0.5);
        g.close();
        g.stroke();
        g.moveTo(0, -half * 0.55);
        g.lineTo(0, half * 0.5);
        g.stroke();
        return;
      case 'BOOTS':
        g.moveTo(-half * 0.3, -half * 0.6);
        g.lineTo(-half * 0.3, half * 0.2);
        g.lineTo(half * 0.55, half * 0.2);
        g.lineTo(half * 0.55, half * 0.55);
        g.lineTo(-half * 0.55, half * 0.55);
        g.lineTo(-half * 0.55, -half * 0.6);
        g.close();
        g.stroke();
        return;
      case 'RING':
        g.circle(0, half * 0.1, half * 0.42);
        g.stroke();
        g.moveTo(0, -half * 0.62);
        g.lineTo(half * 0.24, -half * 0.36);
        g.lineTo(0, -half * 0.1);
        g.lineTo(-half * 0.24, -half * 0.36);
        g.close();
        g.stroke();
        return;
      default:
        // NECKLACE:链弧 + 菱形坠。
        g.arc(0, -half * 0.1, half * 0.5, Math.PI * 1.15, Math.PI * -0.15, true);
        g.stroke();
        g.moveTo(0, -half * 0.05);
        g.lineTo(half * 0.22, half * 0.25);
        g.lineTo(0, half * 0.58);
        g.lineTo(-half * 0.22, half * 0.25);
        g.close();
        g.stroke();
    }
  }

  /**
   * 结果闪光:成功=金色光爆(中心光斑+8 道光芒),失败=灰色淡闪;文字随光缩放淡出后自毁。
   * 由 GameRoot 在整页重绘之后调用,叠加在最新画面之上。
   */
  /**
   * 锻造结果特效(2026-10-16 换素材库骨骼特效,见 FORGE_RESULT_FX):挂持久浮层(整页刷新不清),
   * 特效居中在展示环处,结果文字牌放在特效下方;特效没有包围盒 / 加载失败时退回原先的程序光芒。
   */
  spawnForgeFlash(success: boolean, text: string, kind: ForgeFxKind = success ? 'success' : 'fail', opts: { plate?: boolean; sizeMult?: number } = {}): void {
    const node = this.host.createPersistentFxNode(`LobbyForgeFlash_${Date.now()}`);
    node.setPosition(new Vec3(this.fxAnchor.x, this.fxAnchor.y, 0));
    node.addComponent(UITransform).setContentSize(new Size(640, 640));
    const spec = FORGE_RESULT_FX[kind];
    const fx = mountLobbySpineFx(this.host, node, spec, 0, spec.offsetY ?? 0, 420 * spec.size * (opts.sizeMult ?? 1), false, spec.holdMs, 'ForgeResultFx');
    if (!fx) {
      this.drawForgeFlashFallback(node, success);
    }
    // 结果弹窗自带标题与装备名(合成)时不再叠文字牌,免得盖住弹窗内容
    if (opts.plate === false) {
      setTimeout(() => {
        if (node.isValid) {
          node.destroy();
        }
      }, spec.holdMs + 150);
      return;
    }
    const plate = this.host.addChildPlainNode(node, 'ForgeFlashPlate', 0, -150, 440, 60);
    const pg = plate.addComponent(Graphics);
    pg.fillColor = rgba(12, 9, 7, 196);
    pg.roundRect(-220, -30, 440, 60, 14);
    pg.fill();
    // 文字牌描边:成功金 / 失败灰 / 降级暗红(与普通失败拉开档次)
    pg.strokeColor = success ? rgba(214, 170, 92, 220) : kind === 'downgrade' ? rgba(176, 58, 46, 230) : rgba(150, 146, 150, 200);
    pg.lineWidth = 2;
    pg.roundRect(-220, -30, 440, 60, 14);
    pg.stroke();
    const label = this.host.addChildLabel(plate, 'ForgeFlashText', text, 0, 0, 32, success ? rgba(255, 226, 150) : kind === 'downgrade' ? rgba(255, 150, 132) : rgba(220, 214, 206), new Size(420, 50));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 235);
    label.outlineWidth = 2.4;
    const opacity = plate.addComponent(UIOpacity);
    opacity.opacity = 0;
    plate.setScale(new Vec3(0.7, 0.7, 1));
    tween(plate).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    tween(opacity)
      .to(0.12, { opacity: 255 })
      .delay(Math.max(0.6, spec.holdMs / 1000 - 0.5))
      .to(0.35, { opacity: 0 })
      .start();
    const lifeMs = Math.max(spec.holdMs, 1100) + 150;
    setTimeout(() => {
      if (node.isValid) {
        node.destroy();
      }
    }, lifeMs);
  }

  /**
   * 连续强化逐锤反馈(2026-10-19 用户「连续强化没有音效和特效」):每一锤在展示环上炸一圈火花 + 「+N」浮字
   * (成功金 / 失败灰),程序绘制、不整页重绘;整轮结束再由 spawnForgeFlash 按净变化总结。
   */
  spawnEnhanceStepFx(ok: boolean, levelAfter: number, seq: number): void {
    const node = this.host.createPersistentFxNode(`LobbyForgeStep_${Date.now()}_${seq}`);
    node.setPosition(new Vec3(this.fxAnchor.x, this.fxAnchor.y, 0));
    node.addComponent(UITransform).setContentSize(new Size(360, 360));
    const ring = this.host.addChildPlainNode(node, 'Ring', 0, 0, 240, 240);
    const g = ring.addComponent(Graphics);
    const c = ok ? { r: 255, g: 206, b: 96 } : { r: 150, g: 160, b: 176 };
    g.strokeColor = rgba(c.r, c.g, c.b, 210);
    g.lineWidth = 6;
    g.circle(0, 0, 70);
    g.stroke();
    // 10 粒菱形火花,每锤旋转一点角度,连打时不重样
    for (let i = 0; i < 10; i += 1) {
      const a = (Math.PI * 2 * i) / 10 + seq * 0.37;
      const x = Math.cos(a) * 92;
      const y = Math.sin(a) * 92;
      g.fillColor = rgba(c.r, c.g, c.b, 235);
      g.moveTo(x, y + 7);
      g.lineTo(x + 5, y);
      g.lineTo(x, y - 7);
      g.lineTo(x - 5, y);
      g.close();
      g.fill();
    }
    ring.setScale(new Vec3(0.4, 0.4, 1));
    const ringOpacity = ring.addComponent(UIOpacity);
    tween(ring).to(0.32, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'quadOut' }).start();
    tween(ringOpacity).delay(0.08).to(0.3, { opacity: 0 }).start();
    const label = this.host.addChildLabel(node, 'Txt', ok ? `+${levelAfter}` : `失败 · +${levelAfter}`, 0, 60, ok ? 40 : 30, ok ? rgba(255, 230, 150) : rgba(222, 214, 206), new Size(320, 50));
    label.isBold = true;
    label.lineHeight = label.fontSize;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 235);
    label.outlineWidth = 2.4;
    const labelOpacity = label.node.addComponent(UIOpacity);
    tween(label.node).to(0.55, { position: new Vec3(0, 150, 0) }, { easing: 'quadOut' }).start();
    tween(labelOpacity).delay(0.3).to(0.3, { opacity: 0 }).start();
    setTimeout(() => {
      if (node.isValid) {
        node.destroy();
      }
    }, 700);
  }

  /** 连续强化中就地改展示环下的「+N」名牌与右栏大号等级(不整页重绘,整轮结束后才整刷)。 */
  patchEnhanceLevel(level: number): void {
    const root = this.overlayRoot;
    if (!root || !root.isValid) {
      return;
    }
    const setText = (name: string, child: string | null, text: string): void => {
      let found: Node | null = null;
      root.walk((n) => {
        if (!found && n.name === name) {
          found = n;
        }
      });
      const target = found ? (child ? (found as Node).getChildByName(child) : found) : null;
      const label = target?.getComponent(Label);
      if (label && label.string !== text) {
        label.string = text;
      }
    };
    setText('ForgeEnhLevelPlaque', 'Label', `+${level}`);
    setText('ForgeEnhLevelBig', null, `+${level}`);
  }

  /** 骨骼特效不可用时的兜底:中心光斑 + 8 道光芒(原 spawnForgeFlash 画法)。 */
  private drawForgeFlashFallback(node: Node, success: boolean): void {
    const color = success ? { r: 255, g: 214, b: 110 } : { r: 168, g: 168, b: 178 };
    const holder = this.host.addChildPlainNode(node, 'ForgeFlashRays', 0, 0, 640, 640);
    const g = holder.addComponent(Graphics);
    g.fillColor = rgba(color.r, color.g, color.b, success ? 132 : 84);
    g.circle(0, 0, 96);
    g.fill();
    g.fillColor = rgba(255, 246, 214, success ? 190 : 90);
    g.circle(0, 0, 46);
    g.fill();
    const rayCount = 8;
    for (let index = 0; index < rayCount; index += 1) {
      const angle = (Math.PI * 2 * index) / rayCount + Math.PI / 8;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const inner = 58;
      const outer = success ? 236 : 150;
      const half = 12;
      g.fillColor = rgba(color.r, color.g, color.b, success ? 168 : 84);
      g.moveTo(cos * inner - sin * half, sin * inner + cos * half);
      g.lineTo(cos * outer, sin * outer);
      g.lineTo(cos * inner + sin * half, sin * inner - cos * half);
      g.close();
      g.fill();
    }
    const op = holder.addComponent(UIOpacity);
    holder.setScale(new Vec3(0.55, 0.55, 1));
    tween(holder).to(0.55, { scale: new Vec3(success ? 1.35 : 1.1, success ? 1.35 : 1.1, 1) }).start();
    tween(op).delay(0.6).to(0.4, { opacity: 0 }).start();
  }

  private applyOutline(label: Label, scale: number, strong: boolean): void {
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, strong ? 230 : 188);
    label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
  }
}

function slotLabelOf(slotCode: string): string {
  return HERO_EQUIP_SLOTS.find((slot) => slot.code === slotCode)?.label ?? slotCode;
}

// 成功率分档配色:≥90% 绿 / ≥50% 黄 / <50% 红。
function chanceColor(chance: number): Color {
  if (chance >= 0.9) {
    return rgba(150, 216, 150);
  }
  if (chance >= 0.5) {
    return rgba(238, 208, 130);
  }
  return rgba(236, 120, 96);
}

function formatInteger(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return safe.toLocaleString('en-US');
}
