// 矿境守卫战斗渲染层(docs/30 守卫-P1):消费 GuardBattleModel 纯 sim,负责画面与输入。
// 复用现有 battle start/settle 通道:开战回执→建局,胜负→host.settleLobbyBattleSession()(奖励后端权威)。
// P1 视觉:英雄/怪物用现有骨骼(缺省回退色块),水晶/格子/按钮程序绘制;宝箱/三选一/水晶技能在 P2。
import {
  BlockInputEvents,
  Button,
  Color,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Mask,
  Vec2,
  Rect,
  Node,
  profiler,
  resources,
  Size,
  sp,
  Sprite,
  SpriteFrame,
  Texture2D,
  UIOpacity,
  UITransform,
  Vec3,
  VerticalTextAlignment,
  sys,
  tween,
  Tween,
  director,
  Director,
  view,
} from 'cc';
import { gameAudio } from '../../audio/GameAudio';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { GRAPHICS_FRAME_RATES, getGraphicsFrameRate, getGraphicsMode, graphicsCaps, setGraphicsFrameRate, setGraphicsMode } from '../../app/GraphicsSettings';
import { phoneDialogSizeForStage } from './LobbyPhoneDialogFrame';
import type { UiLayout } from './LobbyHudTypes';
import type { LobbyBattlePanelState } from './LobbyBattleState';
import type { LobbyHeroItemVO, LobbyHeroRosterPanelState } from '../../types/LobbyHeroTypes';
import {
  createGuardBattle,
  guardBanishChoice,
  guardCellLane,
  guardChooseOption,
  guardCrystalSkillReady,
  guardCurrentSummonCost,
  guardDragTo,
  guardEnhance,
  guardEnhanceBlocked,
  guardEnhanceNextCost,
  guardGoldCardChance,
  guardHeroSkillUnlocked,
  guardHeroPerks,
  guardPermanentFrequency,
  guardFindHeroAt,
  guardHeroAttackValue,
  guardOpenChest,
  guardRerollChoice,
  guardSkipChoice,
  guardSellHero,
  guardSetSkillAuto,
  guardStartRaid,
  guardSummarizeSpawns,
  guardSummon,
  guardTick,
  guardTrialLayers,
  guardUseCrystalSkill,
  guardMarkMonster,
  guardHeroSkillPending,
  guardCastHeroSkillNow,
  guardCallNextWave,
  guardCallWaveReward,
  guardCollectPickup,
  guardCastSpell,
  guardSpellCastable,
  GUARD_DEFAULT_SPELL_LOADOUT,
  GUARD_BASE_SPELL_SLOTS,
  GUARD_SPELLS,
  GUARD_SPELL_IDS,
  GUARD_SPELL_UNLOCK_LEVEL,
  GUARD_SPELL_CHAIN_RANGE,
  GUARD_SPELL_UNLOCK_NAMES,
  guardSpellDescribe,
  guardSpellLevel,
  guardSpellRow,
  guardSpellTier,
  type GuardSpellId,
  guardPlaceTrap,
  guardTrapBlockReason,
  GUARD_TRAPS,
  GUARD_TRAP_KINDS,
  GUARD_TRAP_MAX,
  type GuardTrapKind,
  GUARD_METEOR_LIFE_MS,
  GUARD_SKILL_MANUAL_WINDOW_MS,
  guardMonsterSpineResource,
  GUARD_CELL_UNLOCK_EVERY,
  GUARD_START_CELLS,
  guardCellFromUnlockRank,
  guardCellUnlockRank,
  GUARD_CRYSTAL_REACH_X,
  GUARD_CRYSTAL_SKILL_CD_MS,
  GUARD_MAX_STAR,
  GUARD_GRID_CELLS,
  GUARD_GRID_COLS,
  guardCellX,
  GUARD_GRID_ROWS,
  GUARD_HERO_SKILL,
  GUARD_MONSTER_DB_SCALE,
  GUARD_MONSTER_DISPLAY_SCALE,
  GUARD_ROLE_PROFILE,
  GUARD_RUSH_TIME_LIMIT_MS,
  GUARD_SPAWN_X,
  resolveGuardRole,
  type GuardBattleState,
  type GuardChoiceOption,
  type GuardEvent,
  type GuardChestGrade,
  type GuardChestReward,
  type GuardZone,
  type GuardHeroUnit,
  type GuardMonster,
  type GuardOutsideStats,
  type GuardPassive,
  type GuardPassiveType,
  type GuardPoolHero,
  guardPickMonsterSpineCodes,
  guardApplyMonsterRoster,
} from './GuardBattleModel';
import { GUIDE_BUBBLE_AVATAR_OVERHANG, mountGuideTriangle, mountZeroGuideBubble } from '../GuideKit';
import { resolveLobbyBattlePresentationSnapshot, type BattlePresentationSnapshot, type BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import {
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineAnimationNames,
  resolveBattleUnitSpineNodePosition,
  resolveBattleUnitSpinePrimaryAsset,
  resolveBattleUnitSpineResource,
  resolveBattleUnitSpineRuntimeData,
  resolveBattleUnitSpineScale,
  resolveBattleUnitSpineSkinName,
} from './LobbyBattleUnitSpineRuntime';
import { worldMapOfStage } from './LobbyWorldMaps';
import { loadSharedSpineData } from './SpineDataStore';
import { GuardRaidController, formatInt } from './GuardRaidController';
import { mountLobbySpineFx } from './LobbyUiSpineFx';
import type { UiKitHost } from '../UiKit';
import { GLASS_COLOR, GLASS_ICON, GLASS_SLICES, mountGlassButton, mountGlassFrame, mountGlassLine, mountGlassSectionHeader, mountGlassSlice } from '../UiGlassKit';
import { resolveBagStyleItemIconAsset } from './LobbyBagPanelRenderer';
import { estimateGlassTextWidth, makeGlassText, mountGlassCloseButton, mountGlassPopupShell, type GlassPopupShell, type GlassPopupShellOptions } from './GlassPopupShell';
import { applyBattleNumber, BATTLE_NUMBER_FONT_FRAME_PATH, battleNumberWidth, type BattleNumberStyle } from './BattleNumberFont';
import { prepareBattleFxData } from './BattleFxSlotFilter';
import { mountSceneNearLayer, preloadSceneNearEffect } from './GuardSceneNear';
import { BOLT_SIZE, boltFrame, cellBurstFrame, cellBurstSize, impactFrame, ringFrameSize, whiteBarFrame, whitePillFrame, whiteRingFrame } from './GuardBakedShapes';
import { battleFxPremultiplied, lookupBattleFxBounds, lookupBattleFxCoreBounds, resolveBattleFxHiddenSlots, resolveBattleSkillEffectResource, resolveHeroGuardSkillEffect, resolveHeroUltEffect, type BattleFxMeasuredBounds, type BattleSkillEffectSpec } from './LobbyBattleSkillEffectConfig';
import { GUARD_BOSS_ANIMS, GUARD_BOSS_FX, GUARD_CHEST_FX, GUARD_MARK_FX, GUARD_PASSIVE_FX, GUARD_SPELL_FX, GUARD_SUPPORT_FX, GUARD_WARHORN_BURST_FX, LOBBY_CRYSTAL_FX, LOBBY_UI_FX, type GuardSpellFxSpec, guardMonsterProjectileFxSpecs, resolveAttackFxSpritePath, resolveAttackSpineFxResource, resolveGuardMonsterProjectileFx, resolveGuardPerkProcFx, resolveHeroAttackFx, resolveHeroAttackSfxKey, resolveHeroAttackSpineFx, resolveHeroSkillSfxKey, type BattleAttackFxSpec } from './LobbyBattleAttackFxConfig';
import { resolveC1812HeroResultPortraitPath } from '../C1812CommonUiAssets';
import { buildHeroHeadCropFrame, heroHeadCropOf, mountHeroAvatar, resolveHeroAvatarPath } from './HeroHeadCrop';
import { resolveHeroCardArtPath } from '../../api/LobbyHeroApi';
import { resolveUltimateSkillName } from './LobbyHeroDetailPanelRenderer';
import { heroAffixSumPct, heroCombatTotal, resolveHeroCombatSources } from './HeroCombatStats';
import { buildGuardPoolForSetup, normalizeGuardRealmAura, GUARD_REPLAY_VERSION, guardRaidSetupFromStart, guardStartRaidFromSetup, resolveGuardStageSetup, type GuardRawHero } from './GuardReplay';
import { resolveBattleHeroSkillProfile, resolveEnergyShieldHpRatio, resolveSkillTriggerChance, resolveUnlockedPassiveCount } from './LobbyBattleHeroSkillConfig';

const GUARD_PASSIVE_TYPES: GuardPassiveType[] = ['lifesteal', 'truePierce', 'freeze', 'stun', 'splash', 'reflect', 'atkUp', 'hpUp'];
import type { EquipmentItemVO } from '../../api/EquipmentApi';
import { lobbyGuide } from '../../guide/GuideManager';
import { GUARD_ARCHETYPE_LABEL, GUARD_BLUE_PERKS, GUARD_GIANT_VISUAL_SCALE, guardBluePerkName, guardFreeEnhanceWaves, resolveGuardHeroPerkProfile, type GuardPerkRarity } from './GuardPerkConfig';

/** 守卫场逐英雄体型微调(乘在共享 EXTRA 表之上):罗恩共享表 1.55 后格子里仍偏小,守卫再 +20%(2026-09-02 用户)。 */
/** 怪物视高上限(屏高比例):BOSS 原 0.62 头顶出屏、整排上格被盖,2026-09-18 降到 0.52。 */
const GUARD_MONSTER_VISUAL_H_CAP = 0.52;
/** BOSS 血条锚头顶(2026-09-18 用户拍板);置 false 可切回顶部横幅。 */
const GUARD_BOSS_BAR_ON_HEAD = true;

const GUARD_HERO_SCALE_TWEAK_BY_ASSET: Record<string, number> = {
  Eulenspigel: 1.2,
};

export interface LobbyGuardBattleHost {
  node: Node;
  currentLobbyBattleState(): LobbyBattlePanelState;
  currentLobbyHeroRosterState(): LobbyHeroRosterPanelState;
  /** 局外属性合计用的已穿戴装备(docs/41;缺省 = 只算基础 + 特性)。 */
  currentLobbyHeroEquipState?(): { items: EquipmentItemVO[] };
  /** 主线 P5 难度曲线用:取关卡 recommendedPower(缺省可不实现,难度回落基线)。 */
  currentLobbyAdventureState?(): { adventure: { chapters: Array<{ stages: Array<{ stageCode: string; recommendedPower: number }> }>; maxCompletedStageCode?: string } | null };
  /** 输出试炼档位表(P3b near-miss 提示,缺省=不展示)。 */
  currentTrialOutputTiers?(): Array<{ tierCode: string; tierName: string; minScore: number }>;
  /** 物品稀有度(背包已加载时可查;结算物品格底边细线用,缺省 = 按编码兜底)。 */
  itemSourceRarityOf?(key: string): string | null;
  settleLobbyBattleSession(): void;
  returnToLobbyFromBattlePreview(): void;
  /** 等待页兜底:开战回执被作废(流程被重置)后重新发起开战(同 startLobbyBattleSession)。 */
  retryLobbyBattleStart?(): void;
  /** docs/61:掠夺结算后回矿境面板(retry = NPC 矿再来一次,直接进编队确认)。缺省退回大厅。 */
  returnToLobbyRaidPanel?(retry: boolean): void;
  setStatus(text: string): void;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
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

function rgba(r: number, g: number, b: number, a = 255): Color {
  return new Color(r, g, b, a);
}

const TICK_MS = 50;
/** 单帧最多补算的模拟 tick 数(2026-10-07:原上限 1000ms=20 tick,一次掉帧后集中补算又引出下一次卡顿;超出部分丢弃=短暂慢放)。 */
const MAX_CATCHUP_TICKS = 3;
/** 显式束状特效名单(包围盒宽高比判不准的,如凤凰焚世=大花瓣包裹的火柱):必须锚英雄身前沿目标方向喷射。 */
/** 水晶技能渲染开关(2026-09-02 用户拍板:先隐藏,机制保留)。 */
const GUARD_CRYSTAL_SKILL_HIDDEN = true;
const GUARD_BEAM_EFFECT_CODES = new Set(['fx_5601_fenghuang_skill']);
/** 束状根部视觉内缩(素材 AABB 左缘外圈是淡出羽尾,亮部起点在盒内一段;按比例内缩让亮部贴炮口)。逐特效标定。 */
const GUARD_BEAM_ROOT_INSET: Record<string, number> = { fx_5601_fenghuang_skill: 0.2 };
/** 同英雄技能特效表现冷却(视频验收:束状几乎常驻屏幕,视觉疲劳)。 */
const GUARD_HERO_FX_COOLDOWN_MS = 1600;
/** 技能特效放大上限(2026-09-12:低稀有度也要≥标准尺寸,再大只会糊);群体横扫为覆盖命中簇可再放宽。 */
const GUARD_FX_UPSCALE_CAP = 2.0;
const GUARD_FX_GROUP_UPSCALE_CAP = 2.6;
/**
 * 专属大招尺寸(2026-10-01 用户:"战场中的大招比较小,不易被区分出来"):不再按含淡粒子的宽松包围盒做面积适配,
 * 改按"核心亮区"(BATTLE_FX_CORE_BOUNDS)的几何均值定目标,单位 = unitSize;稀有度逐档放大,战技保持原口径。
 */
const GUARD_ULT_CORE_TARGET_U: Record<string, number> = { R: 2.3, SR: 2.6, SSR: 3.0, UR: 3.4 };
const GUARD_ULT_FIT_CAP = 2.0;
/** 核心亮区上屏上限(× 场宽 / 场高);宽松框(含淡粒子)上限——防止整屏发雾。 */
const GUARD_ULT_CORE_MAX_W = 0.55;
const GUARD_ULT_CORE_MAX_H = 0.56;
const GUARD_ULT_LOOSE_MAX = 0.85;
/** 没有核心表项时:核心 ≈ 宽松框 × 0.57(22 套实测中位数)。 */
const GUARD_ULT_CORE_FALLBACK_RATIO = 0.57;
/** 辅助大招挂在施法者身上,比打怪的大招小一档。 */
const GUARD_ULT_SUPPORT_MULT = 0.8;
/** 战技群体模式相对 baseFit 的放大上限(此前可拉到 2.6×,近战战技反而比大招大)。 */
const GUARD_SKILL_GROUP_GROWTH = 1.15;
/** 大招安全区(field 坐标 × 场宽 / 场高):核心亮区不压底部法术栏、不顶到顶部波次横幅。 */
const GUARD_FX_SAFE = { left: -0.48, right: 0.48, bottom: -0.28, top: 0.39 };
/** 骨骼特效同屏名额:战技与大招分开计数,大招永远有位置(不再被挤成一颗紫色技能弹)。 */
const GUARD_SKILL_FX_MAX_LIVE = 4;
const GUARD_ULT_FX_MAX_LIVE = 2;
/**
 * 灼烧区循环特效单独计名额(2026-10-12 用户:"有些英雄的战技地上是个红色的圆圈,没看到特效"):
 * 灼烧区要循环到期(4 秒+),此前与瞬发战技共用 4 个名额,几名远程同时放就占满,后放的只剩余烬环。
 */
const GUARD_ZONE_FX_MAX_LIVE = 6;
/** 名额满时灼烧区排队,隔这么久重试一次补播特效(不再画红圈)。 */
const GUARD_ZONE_FX_RETRY_MS = 200;
/** 大招压暗节流(同时多个大招只压一次)。 */
const GUARD_ULT_DIM_INTERVAL_MS = 2000;
/** 局外攻击 → 局内 1 星基础攻击折算(平衡口径:atk60≈成型阵容,见 guard_harness)。 */
const GUARD_BASE_ATTACK_SCALE = 1.0;
const GUARD_ROLE_LABEL: Record<string, string> = { melee: '近战', ranged: '远程', support: '辅助', control: '控制' };
/** 统计面板无头像图时的占位底色(按稀有度)。 */
const GUARD_RARITY_TINT: Record<string, Color> = {
  R: new Color(86, 96, 112),
  SR: new Color(58, 104, 168),
  SSR: new Color(126, 70, 176),
  UR: new Color(186, 132, 44),
};
const GUARD_ROLE_COLOR: Record<string, Color> = {
  melee: new Color(232, 150, 92),
  ranged: new Color(120, 196, 255),
  support: new Color(150, 230, 160),
  control: new Color(190, 150, 255),
};

// ── 战斗内设置偏好(2026-09-24 用户确认方案):存本地,跨局保留;读写失败按默认值处理 ──
const GUARD_PREF_SHAKE = 'lootchain.guard.shake';
const GUARD_PREF_DAMAGE_NUMBERS = 'lootchain.guard.damageNumbers';
/** 法术图标(现有素材拼:水晶徽章 / 冰旋 / 雷光 / 金币 / 金色盾波 / 剑徽)。 */
/** 金矿爆发金币堆(docs/39 §5):小堆 / 中堆 / 大堆 + 满仓宝箱。项目现成图,全部按原比例显示;宽 = unitSize × u。 */
const GUARD_GOLD_PILE_SPRITES: Array<{ path: string; aspect: number; u: number }> = [
  { path: 'ui/crystal/ai/stat_gold/spriteFrame', aspect: 72 / 76, u: 0.95 },
  { path: 'ui/common/ai/ic_gold_medium/spriteFrame', aspect: 153 / 176, u: 1.45 },
  { path: 'ui/common/ai/ic_gold_large/spriteFrame', aspect: 171 / 184, u: 2.0 },
];
const GUARD_GOLD_PILE_JACKPOT = { path: 'ui/bag/ai/icon_gold_chest/spriteFrame', aspect: 1, u: 1.7 };
/**
 * 金币堆骨骼版(docs/39 §5,2026-10-01 烘焙):fx_pack_v2 A49-005「挂机奖励」去掉宝箱 / 宝石 / 箱内飘币后只留金币堆 + 光芒闪光,
 * jiangli_2 / 3 / 4 = 小 / 中 / 大堆(静态堆 + 循环光效)。heap = 只算金币的包围盒(骨骼单位),
 * 三档用同一个缩放(大堆宽 = 2.6 × unitSize),天然大小差就是档位差。没就绪时退回上面的静态图。
 */
const GUARD_GOLD_PILE_SPINE = {
  effect: 'v2_a49_005c',
  anims: ['jiangli_2', 'jiangli_3', 'jiangli_4'],
  heap: [{ w: 648, h: 158, cx: -10, cy: -21 }, { w: 1034, h: 238, cx: 34, cy: 6 }, { w: 1543, h: 297, cx: -15, cy: 23 }],
  largeWidthU: 2.6,
};
/** 法术等级档位边框色(T1 青铜 / T2 银 / T3 金)与等级点缀用的通用贴图。 */
const GUARD_SPELL_TIER_RIM = [rgba(170, 128, 72, 235), rgba(214, 228, 248, 245), rgba(255, 214, 92, 255)];
const GUARD_SPELL_ICON: Record<GuardSpellId, string> = {
  quake: 'ui/battle/ai/ghud_btn_skill/spriteFrame',
  frost: 'ui/guard/fx_wind_zone/spriteFrame',
  thunder: 'ui/battle/attack/atk_abyss_rift/spriteFrame',
  goldrush: 'ui/bag/ai/icon_gold/spriteFrame',
  aegis: 'ui/battle/attack/atk_atlas_shieldwave/spriteFrame',
  warhorn: 'ui/battle/ai/buff_atk/spriteFrame',
};
/** 战技释放方式(docs/37 B):'0'=蓄满后给 1.5s 手动窗口(默认),'1'=立即自动释放。 */
const GUARD_PREF_SKILL_AUTO = 'lootchain.guard.skillAuto';

function readGuardPref(key: string, fallback: string): string {
  try {
    return sys.localStorage.getItem(key) ?? fallback;
  } catch (error) {
    void error;
    return fallback;
  }
}

function writeGuardPref(key: string, value: string): void {
  try {
    sys.localStorage.setItem(key, value);
  } catch (error) {
    void error;
  }
}

export interface GuardUnitView {
  /** 小怪血条上次画出的可见长度(像素;-1=满血不画),没变就不重画。 */
  hpDrawnKey?: number;
  node: Node;
  spineReady: boolean;
  /** BOSS 头顶血条高度(怪物节点坐标系,行走阶段实测顶点峰值 +14);未量到前 undefined。 */
  hpBarY?: number;
  /** 已采样次数;攒够 20 次(≈1 秒)后锁定。 */
  hpBarSamples?: number;
  /** 血条高度已锁定,不再重新量。 */
  hpBarLocked?: boolean;
  /** 攻击动作播放截止时刻(Date.now 毫秒),期间头顶血条不重新量。 */
  attackHoldUntil?: number;
  lastAnimKey: string;
  skeleton: sp.Skeleton | null;
  idleAnim: string;
  attackAnim: string;
  /** 死亡动画名(怪物,有则死亡时播放)。 */
  deathAnim: string;
  /** 跑步动画名(野外清怪模式的怪物追击时播;docs/50)。 */
  moveAnim?: string;
  /** 受击红闪截止时刻(打击感,2026-08-26)。 */
  hitFlashUntil: number;
  /** 受击闪色(缺省红;升星被动用自己的颜色:破甲红 / 溅射金 / 反伤白金,docs/41 §6)。 */
  hitFlashColor?: Color;
  /** 小怪血条(2026-10-09,共享条层里的两个白贴图精灵:底 / 填充);满血隐藏,受伤才建。 */
  hpBg?: Node;
  hpFill?: Node;
  /** 小怪血条相对怪物节点的高度与总宽(建视图时定)。 */
  hpBarOffsetY?: number;
  hpBarW?: number;
  /** 英雄主动技能冷却条(共享条层里的两个圆角条精灵:底 / 填充)。 */
  cdBg?: Node;
  cdFill?: Node;
  /** 冷却条上次画出的状态键,没变不动。 */
  cdDrawnKey?: string;
  /** BOSS 身体画面中心相对节点的 x 偏移(脚下法阵/出手弹道锚点;2026-09-24)。 */
  centerOffsetX?: number;
  /** 英雄当前朝左(目标在身后时转身出手;2026-10-07)。 */
  faceLeft?: boolean;
  /** 帧间插值(2026-10-07):上一 tick / 本 tick 的模拟位置;每渲染帧按累积器进度在两者之间取值。 */
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  /** 活着且由插值驱动(死亡 / 溜走后改为直接定位,让淡出下沉的 tween 生效)。 */
  interp?: boolean;
}

/** 普攻弹幕(轻量 Graphics 弹体,跟着出手时锁定的目标飞,目标死了落在它最后的位置;打击感系统 2026-08-26)。crystalTarget=BOSS 暗弹;visualOnly=保底技能弹(命中不出飘字)。 */
interface GuardProjectile {
  node: Node;
  targetId: number;
  x: number;
  y: number;
  amount: number;
  color: Color;
  crystalTarget?: boolean;
  visualOnly?: boolean;
  scale?: number;
  /** 近战弹道命中时全尺寸爆开的斩击规格(2026-09-12 用户反馈:近战也要有"从英雄身上飞出"的过程)。 */
  strikeSpec?: BattleAttackFxSpec;
  /** 会心暴击:命中走大号金字。 */
  crit?: boolean;
  /** 弹体是 Spine 飞行特效(同屏限额计数用)。 */
  spine?: boolean;
  /** 骨骼飞行特效的资源键:命中后节点按键回池复用(2026-10-10)。 */
  fxEffect?: string;
  /** 出手英雄(命中时播他的专属命中特效)。 */
  heroCode?: string;
  /** 飞行速度倍率(近战贴脸打,飞得更快)。 */
  speedMult?: number;
  /** crystalTarget 命中震屏强度(缺省 5=BOSS 暗弹;shooter 普攻弹传 0 防多怪齐射抖屏)。 */
  impactShake?: number;
  /** crystalTarget 命中时在水晶上播的骨骼爆点(BOSS 出手用;缺省走十字爆闪)。 */
  impactFx?: { effect: string; animation: string; size: number };
  /** crystalTarget 命中飘字前缀(如"灭世轰击")。 */
  impactLabel?: string;
  /** 目标最后所在的位置:目标中途死亡后弹体继续飞到这里落地,不改追别的怪。 */
  aimX?: number;
  aimY?: number;
}
/**
 * 词条卡框(2026-09-22 用户提供 ui/battle/ai/perk_card_{blue,purple,red},413 宽哥特竖框,只能等比):
 * 框内自带顶部标签带、圆形头像环、下方文字区,布局按各框实测像素折成比例(从顶边起算)。
 * 用户定的三色:蓝=普攻强化(白卡通用也用蓝框,靠标签与圆环里的图标区分)、紫=英雄专属流派、红=稀有专属大招。
 */
interface GuardPerkCardStyle {
  tag: string;
  frame: string;
  /** 框高/框宽。 */
  aspect: number;
  /** 顶部标签带中心 y、带高;圆环中心 y、可用直径;文字区上下沿——均为占框高/框宽的比例,y 从顶边起算。 */
  bandCy: number;
  bandH: number;
  ringCy: number;
  ringD: number;
  textTop: number;
  textBottom: number;
  text: [number, number, number];
}
const GUARD_PERK_CARD_STYLE: Record<GuardPerkRarity, GuardPerkCardStyle> = {
  white: { tag: '通用', frame: 'ui/battle/ai/perk_card_blue/spriteFrame', aspect: 685 / 413, bandCy: 0.191, bandH: 0.089, ringCy: 0.365, ringD: 0.34, textTop: 0.5, textBottom: 0.806, text: [206, 222, 240] },
  blue: { tag: '普攻强化', frame: 'ui/battle/ai/perk_card_blue/spriteFrame', aspect: 685 / 413, bandCy: 0.191, bandH: 0.089, ringCy: 0.365, ringD: 0.34, textTop: 0.5, textBottom: 0.806, text: [170, 215, 255] },
  purple: { tag: '专属流派', frame: 'ui/battle/ai/perk_card_purple/spriteFrame', aspect: 693 / 413, bandCy: 0.183, bandH: 0.094, ringCy: 0.361, ringD: 0.34, textTop: 0.495, textBottom: 0.808, text: [226, 180, 255] },
  gold: { tag: '稀有 · 专属大招', frame: 'ui/battle/ai/perk_card_red/spriteFrame', aspect: 692 / 413, bandCy: 0.197, bandH: 0.087, ringCy: 0.368, ringD: 0.34, textTop: 0.5, textBottom: 0.809, text: [255, 214, 130] },
};
/** 通用(白卡)词条在圆环里放的图标(等比;素材原有像素比写死)。 */
const GUARD_WHITE_PERK_ICON: Record<string, { path: string; aspect: number }> = {
  gen_team_atk: { path: 'ui/battle/ai/buff_atk/spriteFrame', aspect: 133 / 128 },
  gen_team_aspd: { path: 'ui/bag/ai/icon_stamina/spriteFrame', aspect: 1 },
  gen_gold_gain: { path: 'ui/common/ai/ic_gold_large/spriteFrame', aspect: 171 / 184 },
  gen_summon_discount: { path: 'ui/common/ai/ic_quest_summon/spriteFrame', aspect: 274 / 249 },
  gen_thorns: { path: 'ui/battle/ai/buff_shield/spriteFrame', aspect: 69 / 70 },
  gen_crystal_repair: { path: 'ui/battle/ai/ghud_crystal_tower/spriteFrame', aspect: 652 / 299 },
};
/** 战术卡 B 风格稀有度色(卡顶细线 / 标签描边 = line,标签字 = text;原型 guard_choice_b 取色)。 */
const GUARD_PERK_GLASS_TONE: Record<GuardPerkRarity, { line: Color; text: Color }> = {
  white: { line: new Color(150, 158, 172, 255), text: new Color(206, 212, 222, 255) },
  blue: { line: new Color(64, 140, 240, 255), text: new Color(160, 204, 255, 255) },
  purple: { line: new Color(176, 96, 244, 255), text: new Color(218, 178, 255, 255) },
  gold: { line: new Color(230, 172, 76, 255), text: new Color(255, 216, 146, 255) },
};
/** 同屏 Spine 普攻弹体上限(每个都是一次骨骼更新 + 一次合批打断),超额回退静态贴图弹道。 */
// 同屏上限改由画面设置决定(app/GraphicsSettings:流畅 6 / 极致 18)。
/** 战斗设置弹层原型尺寸(guard_settings_b,像素)。 */
const GUARD_SETTINGS_W = 939;
const GUARD_SETTINGS_H = 597;
/** 结算弹层原型尺寸(guard_result_b,像素)。 */
const GUARD_END_W = 910;
const GUARD_END_H = 613;
const GUARD_HIT_FLASH_COLOR = new Color(255, 130, 110, 255);
/** 伤害数字一个落位(列 × 排)被占用多久后可以再放下一个:数字寿命约 0.8~0.95 秒,到这时旧数字已经上飘并开始淡出。 */
const GUARD_DAMAGE_SLOT_MS = 460;
const GUARD_SPINE_WHITE = new Color(255, 255, 255, 255);
/** 偷金鼠金色染色(docs/37 D)。 */
const GUARD_GREEDY_TINT = new Color(255, 214, 120, 255);
// 减速染色加深(2026-09-02:去掉雪星挂件后本体染色是唯一标记,压低红绿通道让"结冰感"更明显)
const GUARD_SLOW_TINT_COLOR = new Color(96, 168, 255, 255);
/** 升星被动受击闪色(docs/41 §6)。 */
const GUARD_PASSIVE_PIERCE_FLASH = new Color(255, 90, 80, 255);
const GUARD_PASSIVE_SPLASH_FLASH = new Color(255, 214, 120, 255);
const GUARD_PASSIVE_REFLECT_FLASH = new Color(255, 245, 200, 255);
const GUARD_PASSIVE_LIFESTEAL_FLASH = new Color(255, 120, 140, 255);
/** 被动冻结染色:冰蓝(比减速的淡蓝更重)。 */
const GUARD_FROZEN_TINT_COLOR = new Color(160, 228, 255, 255);

// ── 开箱轮盘(2026-09-27 重做)──
type GuardWheelSector = 'gold' | 'summon' | 'teamAtk' | 'jackpot';
/** 8 扇区顺序(索引 k 的扇心角 = (k+0.5)×45°,逆时针自 +x 起;指针在 90° 正上方)。 */
const GUARD_WHEEL_SECTORS: GuardWheelSector[] = ['gold', 'summon', 'gold', 'teamAtk', 'summon', 'gold', 'teamAtk', 'jackpot'];
const GUARD_WHEEL_SECTOR_LABEL: Record<GuardWheelSector, string> = { gold: '金币', summon: '招募', teamAtk: '强攻', jackpot: '大奖' };
const GUARD_WHEEL_SECTOR_ICON: Record<GuardWheelSector, string> = {
  gold: 'ui/common/ai/ic_gold_medium/spriteFrame',
  summon: 'ui/common/ai/ic_quest_summon/spriteFrame',
  teamAtk: 'ui/common/ai/ic_quest_dungeon/spriteFrame',
  jackpot: 'ui/hero/ai/star_filled/spriteFrame',
};
/** 左上「统计」按钮底图(开局预热,HUD 只建一次)。 */
const GUARD_STATS_BUTTON_ART = 'ui/common/ai/bag_button_dark/spriteFrame';
/** 开局预热的宝箱/轮盘贴图:mountSprite 未命中缓存走异步,首箱 28 枚金币/8 个扇区图标会晚 0.3~1.3s 才显示。 */
const GUARD_CHEST_SPRITE_PRELOAD = [
  GUARD_STATS_BUTTON_ART,
  'ui/guard/chest_closed/spriteFrame', 'ui/guard/chest_open/spriteFrame', 'ui/codex/ai/chest_ready/spriteFrame', 'ui/codex/ai/chest_opened/spriteFrame',
  'ui/guard/cast_flash/spriteFrame', 'ui/guard/coin_gold/spriteFrame', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 'ui/battle/c1812/effects/hit_ring/spriteFrame',
  'ui/common/ai/star_orange/spriteFrame', 'ui/common/ai/star_red/spriteFrame', 'ui/hero/ai/btn_star_up/spriteFrame',
  GUARD_WHEEL_SECTOR_ICON.gold, GUARD_WHEEL_SECTOR_ICON.summon, GUARD_WHEEL_SECTOR_ICON.teamAtk, GUARD_WHEEL_SECTOR_ICON.jackpot,
];

/** 一次开箱轮盘演出的全部节点与状态(阶段机门控点击:entering/spinning/stopped/revealing/done)。 */
interface GuardWheelParts {
  overlay: Node;
  panelRoot: Node;
  panelOpacity: UIOpacity;
  dimOpacity: UIOpacity;
  wheel: Node;
  disc: Node;
  pointer: Node;
  sectorFlashOp: UIOpacity;
  bulbs: UIOpacity[];
  segIcons: Node[];
  segLabels: Node[];
  chestNode: Node;
  fxUnder: Node;
  fxOver: Node;
  resultTag: Label;
  hintLine: Label;
  result: { tier: number; rewards: GuardChestReward[]; grade: GuardChestGrade };
  deluxe: boolean;
  jackpot: boolean;
  compact: boolean;
  panelW: number;
  panelH: number;
  s: number;
  R: number;
  colX: number;
  colW: number;
  /** 标题行 y(档位文字 / 奖励卡从它往下排);手机全屏时标题贴近顶边。 */
  titleY: number;
  /** 手机全屏弹层(横幅不能再挂到面板外沿上方)。 */
  sheet: boolean;
  /** B 原型映射(2026-11-11):面板原型 1058×603 像素 → 面板中心原点设计坐标;T = 原型字号文字。 */
  k: number;
  S: (v: number) => number;
  X: (dx: number) => number;
  Y: (dy: number) => number;
  T: GlassPopupShell['T'];
  phase: 'entering' | 'spinning' | 'stopped' | 'revealing' | 'done';
  timers: Array<ReturnType<typeof setTimeout>>;
  ticker: ReturnType<typeof setInterval> | null;
  skippable: boolean;
  thetaEnd: number;
  landIdx: number;
  tickCount: number;
  lastIdx: number;
  cards: Node[];
  closeShown: boolean;
}

/** 以原点为中心的胶囊形闭合路径(两端半圆用 16 段折线),供描边用。 */
function pillStrokePath(g: Graphics, width: number, height: number): void {
  const r = height / 2;
  const half = Math.max(0, width / 2 - r);
  const segments = 16;
  g.moveTo(-half, r);
  g.lineTo(half, r);
  for (let i = 1; i <= segments; i += 1) {
    const a = Math.PI / 2 - (Math.PI * i) / segments;
    g.lineTo(half + Math.cos(a) * r, Math.sin(a) * r);
  }
  g.lineTo(-half, -r);
  for (let i = 1; i <= segments; i += 1) {
    const a = -Math.PI / 2 - (Math.PI * i) / segments;
    g.lineTo(-half + Math.cos(a) * r, Math.sin(a) * r);
  }
  g.close();
}

export class LobbyGuardBattleRenderer {
  constructor(private readonly host: LobbyGuardBattleHost) {}

  private root: Node | null = null;
  private fieldNode: Node | null = null;
  /**
   * 条层(2026-10-09 手机绘制调用优化):小怪血条 / 英雄冷却条全部放在这一个节点里、共用同一张白贴图,
   * 连续绘制合成一次;排在所有单位节点之后、特效之前(placeBarLayer),每帧跟随单位位置。
   */
  private barLayer: Node | null = null;
  /** 命中爆点骨骼节点复用池(按特效键);伤害数字节点复用池(有 / 无暴击箭头)。场地重建时随旧场地一起销毁,取用时按 isValid / parent 校验。 */
  private readonly hitFxPool = new Map<string, Node[]>();
  private readonly projectileFxPool = new Map<string, Node[]>();
  private readonly damageNumPool: { big: Node[]; small: Node[] } = { big: [], small: [] };
  /** 本帧补跑多个 tick 时,最后一个 tick 之前的怪物位置(插值起点用)。 */
  private readonly prevTickMonsterX = new Map<number, number>();
  /** 同一路径在途的贴图加载合并:石台格子等同帧挂 6 次原先发 6 个加载任务(加载门实测排队到最后)。 */
  private readonly spriteLoadWaiters = new Map<string, Array<(frame: SpriteFrame) => void>>();
  private sim: GuardBattleState | null = null;
  /** docs/47 P0 掠夺模式的进攻侧控制器(非掠夺局为 null)。 */
  private raid: GuardRaidController | null = null;
  /** 服务端掠夺(回执带 raid 建场):正常结算发奖;本地原型(RAID_P0)不结算。 */
  private serverRaid = false;
  /** 掠夺进攻方的 monsterId(-1 = 非掠夺):掉血飘字由 GuardRaidController 负责,这里的 queueDamage 要跳过它。 */
  private raiderMonsterId = -1;
  private simBattleNo = '';
  /**
   * 战斗循环挂在引擎帧事件上(2026-10-07 用户「战斗一卡一卡的,流畅和极致 120 帧都卡」):
   * 原先 setInterval(50ms) 驱动,怪物 / 弹体每秒只挪 20 次且不插值,120 帧也像 20 帧;且与刷新不同步,帧间位移忽大忽小。
   */
  private frameLoopOn = false;
  private lastFrameWallMs = 0;
  /** 本 tick 已新建的伤害数字 / 飘字数(群体大招一次打中几十只怪时只出前几个,避免同一帧建几十个文字节点)。 */
  private floatersThisStep = 0;
  private snapshot: BattlePresentationSnapshot | null = null;
  private heroViews = new Map<number, GuardUnitView>();
  private monsterViews = new Map<number, GuardUnitView>();
  private layoutWidth = 1280;
  private layoutHeight = 720;
  private settleRequested = false;
  private overlayShown = false;
  private dragFromCell: number | null = null;
  private dragGhost: Node | null = null;
  /** 墙钟累积器:后台/节流环境 setInterval 触发率不可靠,按真实流逝补跑固定步长子 tick。 */
  private lastTickWallMs = 0;
  /** 固定步长余数(ms):不足一个 TICK_MS 的真实流逝结转到下次回调,防模拟时间跑快。 */
  private tickAccumulatorMs = 0;
  private chestViews = new Map<number, Node>();
  private choiceOverlayLevel = 0;
  private wheelOverlayOpen = false;
  /** 战斗内设置面板 / 退出确认框是否打开(打开期间暂停 sim)。 */
  private settingsOpen = false;
  /** 战斗设置弹层外壳(切页时内容挂到它的面板上重画)。 */
  private settingsShell: GlassPopupShell | null = null;
  /** 结算弹层外壳(回执到达后往它的面板上挂物品格 / 返回钮)。 */
  private endShell: GlassPopupShell | null = null;
  private exitConfirmOpen = false;
  /** 设置项:战斗震屏(默认开)、伤害数字精简模式(默认全部显示)。 */
  private shakeEnabled = readGuardPref(GUARD_PREF_SHAKE, '1') !== '0';
  private damageNumbersLite = readGuardPref(GUARD_PREF_DAMAGE_NUMBERS, 'all') === 'lite';
  private skillAutoImmediate = readGuardPref(GUARD_PREF_SKILL_AUTO, '0') === '1';
  /** docs/37 交互玩法:每局只提示一次的引导 key;共鸣格视图签名;已飘过"共鸣"字的英雄。 */
  private interactHints = new Set<string>();
  private resonanceKey = '';
  private resonanceUnits = new Set<number>();
  /** 流星矿晶视图(docs/37 D)。 */
  private pickupViews = new Map<number, Node>();
  /** 水晶法术拖拽瞄准中的法术(docs/37 F)与上次壁垒"免疫"飘字时刻。 */
  private spellDrag: { id: GuardSpellId; moved: number; aim: { lane: number; x: number } | null; tipShown?: boolean } | null = null;
  private spellTipTimer: ReturnType<typeof setTimeout> | null = null;
  private aegisFloaterAt = 0;
  /** docs/39:本局已出过 Lv5 名牌的法术;法术追加效果飘字节流;金币堆飞币计数(独立于击杀金币的 12 枚上限)。 */
  private readonly spellLv5Shown = new Set<GuardSpellId>();
  private spellEchoFloaterAt = 0;
  private pileCoinLive = 0;
  /** 车道陷阱(docs/37 G):托盘开关、拖拽中的陷阱、场上陷阱视图。 */
  private trapTrayOpen = false;
  private trapDrag: { kind: GuardTrapKind; moved: number; x: number | null } | null = null;
  private trapViews = new Map<number, Node>();
  /** 点击英雄显示攻击范围(unitId;拖拽结束/再点空白清除)。 */
  private rangeShownUnitId: number | null = null;
  /** 已绘制选中层对应的格位:仅换人/换格时整层重建(每 tick 重建=详情框闪烁,2026-08-28 用户验收)。 */
  private rangeShownDrawnCell = -1;
  /** 技能特效包围盒缓存(effect:anim → 宽高+原点偏移),与在场技能特效计数。 */
  private readonly guardFxBoundsCache = new Map<string, { w: number; h: number; cx: number; cy: number } | null>();
  private skillFxLive = 0;
  private zoneFxLive = 0;
  private ultFxLive = 0;
  private lastUltDimAt = 0;
  /** 在场技能特效瞄准器(step 逐帧驱动:锁定目标方向,目标死亡自动转向最近怪物)。 */
  private readonly guardFxAimers = new Map<Node, () => void>();
  /** 同英雄特效上次触发时刻(表现冷却)与束状同屏计数(≤1)。 */
  private readonly heroFxLastAt = new Map<string, number>();
  private beamFxLive = 0;
  private lastSkillShakeAt = 0;
  /** 辅助周期治疗的水晶回血特效节流(多名辅助同时在场时不叠成一团)。 */
  private lastCrystalHealFxAt = 0;
  /** 场上是否挂着 BOSS 蓄力法阵(读条结束兜底清理用)。 */
  private bossChargeAuraLive = false;
  /** 车道/格子底图(解锁进度变化时整层重画;key=已解锁格数:提示倒数)。 */
  private fieldBaseG: Graphics | null = null;
  /** 建场时的布局签名;render() 发现签名变了就重建静态层(2026-09-12)。 */
  private mountedLayoutKey = '';
  /** 统计面板当前行序签名(英雄码顺序):不变时只刷数值与横条,不重建头像/骨骼。 */
  private statsPanelSignature = '';
  /** 统计行头像退到首字底时置位:立绘到货后下一次刷新强制重建行(2026-10-11 静态头像)。 */
  private statsAvatarPending = false;
  private paintedCellsKey = '';
  private layoutUiScale = 1;
  /** 金币 HUD 滚动显示值(-1=未初始化)与在场飞行金币计数。 */
  private displayedGold = -1;
  private goldCoinLive = 0;
  /** 持续区域(灼烧/旋风)视图。 */
  private readonly zoneViews = new Map<number, Node>();
  /** 区域技能起手飞行(zoneId→施放英雄位置):旋风/灼烧从英雄身上飞出落地,归属一眼可辨(2026-09-02 用户反馈像水晶放的)。 */
  private readonly zoneFlights = new Map<number, { fromX: number; fromY: number; startMs: number }>();
  /** 输出贡献统计面板(2026-09-02 用户拍板参考图):点"统计"展开每英雄伤害排行。 */
  private statsPanelOpen = false;
  private lastStatsRefreshMs = 0;
  /** 普攻弹幕(远程/控制;打击感系统 2026-08-26)。 */
  private readonly projectiles: GuardProjectile[] = [];
  /** 特效名额满 / 被限流的灼烧区:排队等名额补播循环特效(值 = 下次重试的 Date.now())。 */
  private plainBurnZones = new Map<number, number>();
  /** 水晶头顶血条上次绘制的数值(没变不重画)。 */
  private crystalHpPaintedKey = '';
  /** 普攻 Spine 飞行特效(fx_pack)的就绪表:开局按阵容预热,数据 + 动画名 + 实测包围盒齐了才用,否则回退贴图弹道。 */
  private readonly attackSpineFxReady = new Map<string, { spec: { effect: string; animation: string; size: number }; data: sp.SkeletonData; animation: string; w: number; h: number; cx: number; cy: number }>();
  private readonly attackSpineFxPending = new Set<string>();
  /** 预热时战场未建好的重试次数(按 effect)。 */
  private readonly attackSpineFxRetry = new Map<string, number>();
  private attackHitFxLive = 0;
  /** 紫卡触发喊话节流(每单位 2.5s 一次,防刷屏)。 */
  private perkShoutAt = new Map<number, number>();

  /**
   * 安卓返回键(2026-10-14):退出确认开着 → 关掉(=取消);设置面板开着 → 关掉;否则同右上角 ×(开战中弹退出确认)。
   * 返回 true 表示已处理。
   */
  handleBackKey(): boolean {
    if (!this.isMounted()) {
      return false;
    }
    if (this.exitConfirmOpen) {
      this.closeExitConfirm();
      return true;
    }
    if (this.settingsOpen) {
      this.closeBattleSettings();
      return true;
    }
    this.requestExitBattle();
    return true;
  }

  isMounted(): boolean {
    return !!this.root && this.root.isValid;
  }

  /** 真正在打的一局(不是「正在进入 / 部署中」的占位页)。 */
  isBattleLive(): boolean {
    return this.isMounted() && !!this.sim;
  }

  /** 结算胜负供 LobbyBattleFlow 使用;未分出前 null(flow 兜底旧逻辑,不应发生)。 */
  resolveOutcome(): 'WIN' | 'LOSE' | null {
    if (!this.sim) {
      return null;
    }
    return this.sim.phase === 'victory' ? 'WIN' : this.sim.phase === 'defeat' ? 'LOSE' : null;
  }

  /** 难度Ⅲ(车轮战)层数 = BOSS 击杀 + 波次,走现有 trialLayers 结算通道;非试炼模式 null。 */
  /** docs/43:本局操作记录(结算上报,服务端复演);没有 sim 返回 null。 */
  resolveReplayPayload(): string | null {
    const sim = this.sim;
    if (!sim) {
      return null;
    }
    return JSON.stringify({ v: GUARD_REPLAY_VERSION, inputs: sim.inputs });
  }

  resolveTrialLayers(): number | null {
    return this.sim && this.sim.mode === 'rush' ? guardTrialLayers(this.sim) : null;
  }

  unmount(): void {
    // 预热重试计数按局清零(渲染器是单例,不清会跨局累计到上限后不再重试)
    this.attackSpineFxRetry.clear();
    this.clearSpellTipTimer();
    this.stopFrameLoop();
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.fieldNode = null;
    this.raid?.dispose();
    this.raid = null;
    this.raiderMonsterId = -1;
    this.sim = null;
    this.simBattleNo = '';
    this.snapshot = null;
    this.heroViews.clear();
    this.monsterViews.clear();
    this.settleRequested = false;
    this.overlayShown = false;
    this.dragFromCell = null;
    this.dragGhost = null;
    this.chestViews.clear();
    this.pickupViews.clear();
    this.trapViews.clear();
    this.trapTrayOpen = false;
    this.choiceOverlayLevel = 0;
    this.wheelOverlayOpen = false;
    this.settingsOpen = false;
    this.exitConfirmOpen = false;
    this.rangeShownUnitId = null;
    this.skillFxLive = 0;
    this.zoneFxLive = 0;
    this.ultFxLive = 0;
    this.lastUltDimAt = 0;
    this.spellLv5Shown.clear();
    this.pileCoinLive = 0;
    this.guardFxAimers.clear();
    this.fieldBaseG = null;
    this.paintedCellsKey = '';
    this.crystalHpPaintedKey = '';
    this.resonanceKey = '';
    this.mountedLayoutKey = '';
    this.statsPanelSignature = '';
    this.displayedGold = -1;
    this.goldCoinLive = 0;
    this.zoneViews.clear();
    this.zoneFlights.clear();
    this.plainBurnZones.clear();
    this.projectiles.length = 0;
    this.heroFxLastAt.clear();
    this.beamFxLive = 0;
    this.damageColumns.clear();
    this.liveDamageFloaters = 0;
  }

  /** 战斗状态 bump(结算回执到达等):只刷新结算覆盖层,不整场重建。 */
  onBattleStateBump(): void {
    if (this.isMounted()) {
      this.refreshEndOverlay();
    }
  }

  render(layout: UiLayout): void {
    this.layoutWidth = layout.width;
    this.layoutHeight = layout.height;
    this.layoutUiScale = layout.uiScale;
    const battleState = this.host.currentLobbyBattleState();
    const battleNo = battleState.start?.battleNo ?? '';
    if (!battleState.start) {
      // start 未回:轻量等待页。
      this.unmount();
      this.root = this.host.addChildPlainNode(this.host.node, 'LobbyGuardBattleRoot', 0, 0, layout.width, layout.height);
      this.paintBackdrop(this.root, layout.width, layout.height);
      this.host.addChildLabel(this.root, 'GuardStarting', battleState.error ? `开战失败:${battleState.error}` : '正在进入矿境…', 0, 0, 20, rgba(230, 214, 178), new Size(layout.width * 0.8, 30));
      if (battleState.error) {
        this.renderExitButton(this.root, layout.width, layout.height);
      } else if (!battleState.starting) {
        this.armStartStallGuard(this.root, battleState.stageCode, layout.width, layout.height);
      }
      return;
    }
    if (battleState.assetsLoading) {
      this.unmount();
      this.root = this.host.addChildPlainNode(this.host.node, 'LobbyGuardBattleRoot', 0, 0, layout.width, layout.height);
      this.paintBackdrop(this.root, layout.width, layout.height);
      // 加载页铺本关战场背景(压暗)+ 进度条(2026-10-09 用户「这个加载界面可以放个背景图」);背景是加载门的第一项,通常第一次刷进度就有了
      this.mountLoadingBackdrop(this.root, layout.width, layout.height);
      const progress = battleState.assetsTotalCount > 0 ? Math.round((battleState.assetsLoadedCount / battleState.assetsTotalCount) * 100) : 0;
      this.host.addChildLabel(this.root, 'GuardLoading', `矿境部署中… ${progress}%`, 0, 18, 20, rgba(230, 214, 178), new Size(layout.width * 0.8, 30));
      const barW = Math.min(520, layout.width * 0.46);
      const track = this.host.addChildPlainNode(this.root, 'GuardLoadingBar', 0, -14, barW, 8);
      const g = track.addComponent(Graphics);
      g.fillColor = rgba(0, 0, 0, 150);
      g.roundRect(-barW / 2, -4, barW, 8, 4);
      g.fill();
      g.fillColor = rgba(222, 178, 96, 240);
      g.roundRect(-barW / 2, -4, Math.max(8, (barW * progress) / 100), 8, 4);
      g.fill();
      g.strokeColor = rgba(170, 130, 70, 200);
      g.lineWidth = 1.5;
      g.roundRect(-barW / 2, -4, barW, 8, 4);
      g.stroke();
      return;
    }
    if (this.isMounted() && this.simBattleNo === battleNo) {
      // 2026-09-12 用户反馈"英雄没有站在格子上":此前这里只更新 layoutWidth/Height 就返回,
      // 而石台/水晶/HUD/背景都是建场时一次性画好的——视口一变(窗口缩放、横竖屏),
      // 英雄每帧按新布局重排、石台却留在旧坐标,实测偏差可达 270px。签名变了就重建静态层。
      if (this.mountedLayoutKey !== this.layoutKey()) {
        this.remountSceneTree(layout, (battleState.start?.stageCode ?? '').toUpperCase());
      }
      this.refreshEndOverlay();
      return;
    }
    this.unmount();
    this.mount(battleState, layout);
  }

  /**
   * 本机调试专用(docs/39 P0):只在 localhost / 127.0.0.1 生效——URL 参数 guardSpellLv=goldrush:5,thunder:3
   * 或 window.__guardSpellLv 同格式字符串,覆盖开战快照里的法术等级,用于截图自验各档表现。正式环境原样返回。
   */
  private withLocalSpellLevelOverride<T extends { spellLevels?: Partial<Record<string, number>> | null } | null>(crystal: T): T {
    try {
      const w = globalThis as unknown as { location?: { hostname?: string; search?: string }; __guardSpellLv?: string };
      const host = w.location?.hostname ?? '';
      if (host !== 'localhost' && host !== '127.0.0.1') {
        return crystal;
      }
      const fromUrl = /[?&]guardSpellLv=([^&]+)/.exec(w.location?.search ?? '');
      const raw = w.__guardSpellLv ?? (fromUrl ? decodeURIComponent(fromUrl[1]) : '');
      if (!raw) {
        return crystal;
      }
      const levels: Record<string, number> = {};
      const base = crystal?.spellLevels ?? null;
      if (base) {
        for (const id of GUARD_SPELL_IDS) {
          if (typeof base[id] === 'number') {
            levels[id] = base[id] as number;
          }
        }
      }
      for (const part of raw.split(',')) {
        const [id, lv] = part.split(':');
        if (GUARD_SPELL_IDS.indexOf(id as GuardSpellId) >= 0) {
          levels[id] = Number(lv);
        }
      }
      return Object.assign({}, crystal ?? {}, { spellLevels: levels }) as T;
    } catch (error) {
      void error;
      return crystal;
    }
  }

  /** 旧服务端回执没有 guardRecommendedPower 时,从爬塔面板取关卡推荐战力(每日副本 / 查无关卡返回 null)。 */
  private resolveMainRecommendedPower(stageCode: string): number | null {
    if (!/^MAIN_\d+_\d+$/.test(stageCode)) {
      return null;
    }
    const adventure = this.host.currentLobbyAdventureState?.().adventure;
    const stage = adventure?.chapters
      .flatMap((chapter) => chapter.stages)
      .find((entry) => entry.stageCode.toUpperCase() === stageCode);
    return stage && stage.recommendedPower > 0 ? stage.recommendedPower : null;
  }

  /**
   * 局外属性(docs/41 A 方案):与属性详情「属性来源」同口径(HeroCombatStats:基础 + 装备 + 特性)。
   * 攻击仍取开战回执的 attack(后端已含装备 / 宝石),这里只补攻击加成特性;找不到名册英雄时不带(按旧口径)。
   */
  private resolveGuardOutsideStats(hero: LobbyHeroItemVO | null, ally: BattlePresentationUnitSnapshot): GuardOutsideStats | undefined {
    if (!hero) {
      return undefined;
    }
    const sources = resolveHeroCombatSources(hero, this.host.currentLobbyHeroEquipState?.().items ?? []);
    const ultimateSkillLevel = ally.ultimateSkillLevel;
    // 升星被动(docs/41 §6):有序 = [护盾?, ...概率 / 常驻效果],按星级解锁前 N 条;技能配置以开战回执(后端 hero_battle_skill_config)为准,缺省回退客户端占位表
    const rarity = ally.rarity || hero.rarity;
    const config = ally.skillConfig ?? null;
    const fallback = resolveBattleHeroSkillProfile(hero.heroCode);
    const shieldScope = config ? config.energyShieldScope : fallback.energyShield?.scope ?? null;
    const effects = config ? config.effects : fallback.effects ?? [];
    const ordered: Array<{ kind: 'shield' } | { kind: 'effect'; type: string; baseChance: number; magnitude: number }> = [
      ...(shieldScope ? [{ kind: 'shield' as const }] : []),
      ...effects.map((effect) => ({ kind: 'effect' as const, type: effect.type, baseChance: effect.baseChance, magnitude: effect.magnitude })),
    ];
    const unlocked = ordered.slice(0, resolveUnlockedPassiveCount(rarity, ally.star ?? hero.star));
    const passives: GuardPassive[] = [];
    let shieldRatio = 0;
    unlocked.forEach((entry) => {
      if (entry.kind === 'shield') {
        shieldRatio = shieldScope ? resolveEnergyShieldHpRatio(shieldScope, rarity) : 0;
        return;
      }
      if (GUARD_PASSIVE_TYPES.indexOf(entry.type as GuardPassiveType) < 0) {
        return;
      }
      const flat = entry.type === 'atkUp' || entry.type === 'hpUp';
      passives.push({ type: entry.type as GuardPassiveType, chance: flat ? 1 : resolveSkillTriggerChance(entry.baseChance, rarity), magnitude: entry.magnitude });
    });
    return {
      passives,
      shieldRatio,
      hp: heroCombatTotal(sources.生命),
      defense: heroCombatTotal(sources.防御),
      speed: heroCombatTotal(sources.速度),
      critPct: heroCombatTotal(sources.暴击),
      critDmgPct: heroCombatTotal(sources.暴伤),
      ultLevel: Math.max(1, Math.trunc(ultimateSkillLevel ?? hero.ultimateSkillLevel ?? 1)),
      atkBonusPct: heroAffixSumPct(hero, 'ATK_BONUS'),
    };
  }

  // ── 建场 ──
  private mount(battleState: LobbyBattlePanelState, layout: UiLayout): void {
    const heroes = this.host.currentLobbyHeroRosterState().heroes;
    const snapshot = resolveLobbyBattlePresentationSnapshot(battleState, heroes);
    this.snapshot = snapshot;
    // 上阵英雄(2026-11-05 起:主角固定带队只给境界光环 + 3 名英雄上格子;人数以开战回执为准)。
    // docs/43:回执带 guardStats 时按服务端原始属性建池(与服务端复演同一函数、同一阵容顺序);旧服务端走下面的本地口径
    const lineup = battleState.start?.lineup ?? [];
    // docs/48 矿境掠夺:NPC 守卫的原始属性也进池(顺延在阵容之后,与表现快照 / 复演同序)
    const raidSetup = guardRaidSetupFromStart(battleState.start?.raid ?? null);
    const raws = lineup.slice(0, 4).map((entry) => entry.guardRaw ?? null);
    const serverPool = raws.length > 0 && raws.every((raw) => !!raw)
      ? buildGuardPoolForSetup(raws as GuardRawHero[], raidSetup, normalizeGuardRealmAura(battleState.start?.guardRealmAura)).map((hero, index) => {
        const allyIndex = index < lineup.length
          ? snapshot.allies.findIndex((ally) => ally.sourceHeroId === lineup[index].heroId)
          : snapshot.allies.findIndex((ally) => ally.unitKey === `npc-${hero.heroCode}-${index - lineup.length}`);
        return { ...hero, displayName: allyIndex >= 0 ? snapshot.allies[allyIndex].displayName : hero.displayName, sourceIndex: allyIndex >= 0 ? allyIndex : index };
      })
      : null;
    const pool: GuardPoolHero[] = serverPool ?? snapshot.allies
      .filter((ally) => ally.power > 0 && !ally.unitKey.includes('empty'))
      .slice(0, 3)
      .map((ally, index) => ({
        heroCode: (ally.heroCode ?? ally.unitKey).toUpperCase(),
        displayName: ally.displayName,
        rarity: ally.rarity ?? 'R',
        role: resolveGuardRole(ally.heroCode ?? ally.unitKey, ally.heroClass),
        baseAttack: Math.max(10, Math.round((ally.attack ?? 40) * GUARD_BASE_ATTACK_SCALE)),
        sourceIndex: index,
        outside: this.resolveGuardOutsideStats(heroes.find((hero) => hero.id === ally.sourceHeroId) ?? null, ally),
      }));
    // 难度从 stageCode 取:DAILY 三档后缀(Ⅰ=10 波,Ⅱ=20 波,Ⅲ=BOSS 车轮战);
    // 主线 MAIN_*(P5,2026-09-03 用户拍板)=难度Ⅰ同款 10 波 + 关卡难度曲线缩放怪物强度。
    const stageCode = (battleState.start?.stageCode ?? '').toUpperCase();
    // docs/43:关卡参数与服务端复演同一函数;推荐战力以开战回执为准,旧服务端回退爬塔面板
    const stage = resolveGuardStageSetup(stageCode, battleState.start?.guardRecommendedPower ?? this.resolveMainRecommendedPower(stageCode));
    // 主线难度包(P5a2,2026-09-04 用户拍板"怪量翻倍/血量翻几倍"):怪量×2(击杀金币减半保持收入中性)、
    // 血量×3(啃咬 √3)、标准模式局内强化词条封顶 11 次(sim 内价格表)。
    // 限时副本三档(2026-09-11 用户拍板"太容易击杀"):怪物血量同样 ×3,怪量不变。
    this.sim = createGuardBattle(
      pool,
      `${battleState.start?.serverSeed ?? ''}:${battleState.start?.battleNo ?? ''}`,
      stage.maxWave,
      stage.mode,
      {
        monsterScale: stage.monsterScale,
        monsterVariety: LobbyGuardBattleRenderer.monsterVariety(),
        // 后台副本阵容 = 本关出场名单(docs/40 P2);与加载门同一份名单,保证预载的皮肤就是 sim 会抽到的。
        monsterRoster: guardApplyMonsterRoster(battleState.start?.guardMonsters),
        // 限时副本小怪数量 ×3(2026-09-11 用户拍板);BOSS/精英在波次编排循环外单独 push,不受此倍率影响。
        spawnCountMult: stage.spawnCountMult,
        monsterHpMult: stage.monsterHpMult,
        monsterBiteMult: stage.monsterBiteMult,
        // 限时副本小怪总计 ×10(2026-09-11 用户拍板;BOSS/精英维持 ×3):3 × 10/3。
        minionHpMult: stage.minionHpMult,
        // 守卫水晶养成快照(docs/38):服务端开战时下发,客户端不信本地(本机调试可覆盖法术等级,见 withLocalSpellLevelOverride)。
        crystal: this.withLocalSpellLevelOverride(battleState.start?.guardCrystal ?? null),
      },
    );
    guardSetSkillAuto(this.sim, this.skillAutoImmediate);
    this.raid?.dispose();
    this.raid = null;
    this.raiderMonsterId = -1;
    this.serverRaid = !!raidSetup;
    if (stage.mode === 'raid') {
      if (raidSetup) {
        guardStartRaidFromSetup(this.sim, raidSetup);
        this.mountRaidController(this.sim);
      } else {
        this.setupRaid(this.sim, pool);
      }
    }
    this.interactHints.clear();
    this.battleGuide = this.resolveBattleGuide(stageCode);
    this.battleGuidePhase = 0;
    this.resonanceUnits.clear();
    this.prewarmAttackFx(pool);
    if (this.sim && this.sim.spellLoadout.indexOf('goldrush') >= 0) {
      // 金币堆贴图开局预热(短命节点必须同步套用,见 mountSprite 注释)
      for (const pile of GUARD_GOLD_PILE_SPRITES.concat([GUARD_GOLD_PILE_JACKPOT])) {
        resources.load(pile.path, SpriteFrame, () => undefined);
      }
      this.prewarmAttackSpineFx({ effect: GUARD_GOLD_PILE_SPINE.effect, animation: GUARD_GOLD_PILE_SPINE.anims[0], size: 1 });
    }
    this.simBattleNo = battleState.start?.battleNo ?? '';
    this.settleRequested = false;
    this.overlayShown = false;

    this.buildSceneTree(layout, stageCode);
    this.host.setStatus(stage.mode === 'raid' ? '掠夺:冲进矿境打碎水晶!摇杆移动 · 普攻连段 · 翻滚有无敌帧' : stage.mode === 'rush' ? '输出试炼·BOSS 车轮战:击杀一只更强一只,层数换输出分!' : '矿境守卫:招募英雄,守住矿晶水晶!');
    this.lastTickWallMs = Date.now();
    this.tickAccumulatorMs = 0;
    this.startFrameLoop();
  }

  /**
   * docs/47 P0 掠夺原型:阵容第 1 人进攻(玩家操控),其余当守卫固定站 2 / 4 列两排;数值先按局外属性粗配,手感验收后再调。
   */
  private setupRaid(sim: GuardBattleState, pool: GuardPoolHero[]): void {
    const leader = pool[0];
    if (!leader) {
      return;
    }
    const defense = pool.length > 1 ? pool.slice(1) : pool;
    // 守卫站位(原型 v1):三四个人前后错开,不排成一列
    const cells = [1, 8, 3, 10];
    const hpOf = (hero: GuardPoolHero, mult: number, floor: number): number => Math.max(floor, Math.round((hero.outside?.hp ?? hero.baseAttack * 8) * mult));
    sim.unlockedCells = GUARD_GRID_CELLS;
    // 守卫血量跟进攻方攻击挂钩:至少吃 8 下普攻(约一套半连段),账号等级低时不会出现"下限血量把人定死"(2026-10-25 QA 账号实测)
    const raiderAttack = Math.round(leader.baseAttack * 1.6);
    guardStartRaid(
      sim,
      { heroCode: leader.heroCode, attack: raiderAttack, hp: hpOf(leader, 6, 4000), crystalHp: raiderAttack * 20 },
      defense.slice(0, 4).map((hero, index) => ({ heroCode: hero.heroCode, cell: cells[index], star: 2, hp: Math.max(hpOf(hero, 2, 0), raiderAttack * 8) })),
    );
    this.mountRaidController(sim);
  }

  /** 掠夺控制器(docs/48:服务端建场与本地原型共用)。 */
  private mountRaidController(sim: GuardBattleState): void {
    this.raiderMonsterId = sim.raider?.monsterId ?? -1;
    this.raid = new GuardRaidController({
      host: this.host,
      field: () => this.fieldNode,
      layout: () => ({ width: this.layoutWidth, height: this.layoutHeight, uiScale: this.layoutUiScale }),
      unitSize: () => this.unitSize(),
      heroDisplaySize: () => this.heroDisplaySize(),
      xToPx: (x) => this.xToPx(x),
      laneY: (laneF) => this.raidLaneY(laneF),
      cellCenter: (cell) => this.cellCenter(cell),
      heroViews: () => this.heroViews,
      allyFor: (heroCode, side) => this.raidSnapshotFor(heroCode, side),
      loadSpine: (node, fallback, resource, size, mirror, view, ally) => this.loadSpineInto(node, fallback, resource, size, mirror, view, { allyUnit: ally }),
      mountShade: (parent, name, x, y, width, height) => this.mountSoftShade(parent, name, x, y, width, height, 'blob'),
      spawnFloater: (x, y, text, color, fontSize) => this.spawnFloater(x, y, text, color, fontSize),
      shakeField: (amplitude) => this.shakeField(amplitude),
      hitFx: (heroCode, x, y, scale) => this.spawnRaidHitFx(heroCode, x, y, scale),
      openSettings: () => this.openBattleSettings(),
      mountSprite: (parent, name, path, x, y, w, h) => this.mountSprite(parent, name, path, x, y, w, h),
      attackSfx: (heroCode) => gameAudio.sfx(this.resolveRaidSfxKey(heroCode), 0.6),
    });
    this.raid.setRaiderCode(sim.raider?.heroCode ?? '', !!sim.raider?.ultOpen);
  }

  /** 掠夺表现快照按 heroCode 找单位;双方可能同码(两边都是男主角 / 同名英雄)→ 按阵营限定:我方 = ally- / raider-,守卫 = npc-(首领取最后一个同码)。 */
  private raidSnapshotFor(heroCode: string, side?: 'ours' | 'theirs' | 'boss'): BattlePresentationUnitSnapshot | null {
    const code = heroCode.toUpperCase();
    const all = (this.snapshot?.allies ?? []).filter((ally) => (ally.heroCode ?? ally.unitKey).toUpperCase() === code);
    if (!side) {
      return all[0] ?? null;
    }
    const scoped = all.filter((ally) => (side === 'ours') === !ally.unitKey.startsWith('npc-'));
    if (side === 'ours') {
      // 主角进攻方:补的 raider- 单位优先(主角不在 lineup 里)
      return scoped.find((ally) => ally.unitKey.startsWith('raider-')) ?? scoped[0] ?? all[0] ?? null;
    }
    return (side === 'boss' ? scoped[scoped.length - 1] : scoped[0]) ?? all[0] ?? null;
  }

  /** 掠夺(docs/47 P0):进攻方斩中守卫的命中特效——先用英雄专属 fx_pack 命中骨骼,没就绪退静态斩击图(2026-10-25 用户「特效都没了」)。 */
  private spawnRaidHitFx(heroCode: string, x: number, y: number, scale: number): void {
    if (!heroCode || this.spawnAttackHitFx(heroCode, x, y, scale)) {
      return;
    }
    const ally = this.snapshot?.allies.find((entry) => (entry.heroCode ?? entry.unitKey).toUpperCase() === heroCode.toUpperCase()) ?? null;
    this.spawnStrikeFx(resolveHeroAttackFx(heroCode, ally?.heroClass ?? null, true), x, y, scale);
  }

  private resolveRaidSfxKey(heroCode: string): string {
    const ally = this.snapshot?.allies.find((entry) => (entry.heroCode ?? entry.unitKey).toUpperCase() === heroCode.toUpperCase()) ?? null;
    return resolveHeroAttackSfxKey(heroCode, ally?.heroClass ?? null, true);
  }

  private startFrameLoop(): void {
    if (this.frameLoopOn) {
      return;
    }
    this.frameLoopOn = true;
    this.lastFrameWallMs = Date.now();
    // 挂在帧首(BEFORE_UPDATE):本帧新建 / 销毁的节点要赶在引擎 AFTER_UPDATE 的兄弟排序之前,
    // 否则当帧建了子节点又被销毁的父节点会在下一帧排序时读到空子节点表抛异常(同一事件后面的监听全部中断)
    director.on(Director.EVENT_BEFORE_UPDATE, this.onFrame, this);
  }

  private stopFrameLoop(): void {
    if (!this.frameLoopOn) {
      return;
    }
    this.frameLoopOn = false;
    director.off(Director.EVENT_BEFORE_UPDATE, this.onFrame, this);
  }

  /** 每渲染帧:攒够一个 tick 就跑模拟与视图同步;每帧都做位置插值与弹体推进。 */
  private onFrame(): void {
    try {
      const now = Date.now();
      // 系统时间被往回拨(网络校时 / 手动改时间)时重新对齐,否则要等时钟追回来战斗才继续
      if (now < this.lastTickWallMs) {
        this.lastTickWallMs = now;
      }
      const frameMs = Math.min(100, Math.max(0, now - this.lastFrameWallMs));
      this.lastFrameWallMs = now;
      if (now - this.lastTickWallMs + this.tickAccumulatorMs >= TICK_MS) {
        this.step();
      }
      if (!this.sim || !this.isMounted()) {
        return;
      }
      this.updateProjectiles(frameMs);
      this.interpolateMonsterViews(now);
      this.raid?.frame((now - this.lastTickWallMs + this.tickAccumulatorMs) / TICK_MS);
      this.followHeroBars();
    } catch (error) {
      // 战斗循环出异常时不再静默(否则画面像"卡死"却没有任何线索):底部提示一次,便于截图反馈
      if (!this.stepErrorShown) {
        this.stepErrorShown = true;
        const text = String((error as Error)?.message ?? error).slice(0, 90);
        console.error('[LootChain] guard battle step failed', error);
        this.host.setStatus(`战斗出现异常,请截图反馈:${text}`);
      }
    }
  }

  /** 活着的怪:在上一 tick 与本 tick 的模拟位置之间插值(进度 = 距上次 tick 的真实时间 / tick 长);受击顶退按真实时间衰减。 */
  private interpolateMonsterViews(now: number): void {
    const alpha = Math.max(0, Math.min(1, (now - this.lastTickWallMs + this.tickAccumulatorMs) / TICK_MS));
    for (const view of this.monsterViews.values()) {
      if (!view.interp || !view.node.isValid || view.toX === undefined || view.toY === undefined) {
        continue;
      }
      const fromX = view.fromX ?? view.toX;
      const fromY = view.fromY ?? view.toY;
      const flashLeft = view.hitFlashUntil - now;
      const hitJiggle = flashLeft > 0 ? (flashLeft / 90) * 7 : 0;
      const x = fromX + (view.toX - fromX) * alpha + hitJiggle;
      const y = fromY + (view.toY - fromY) * alpha;
      view.node.setPosition(x, y, 0);
      if (view.hpBg) {
        this.positionMonsterBars(view, x, y);
      }
    }
  }

  /**
   * 布局签名:视口尺寸、UI 缩放、两排格位 Y(后者随背景地平线变化)。
   * 任一变化都意味着一次性画好的静态层(石台、水晶、HUD、背景)坐标全部作废。
   */
  private layoutKey(): string {
    return `${Math.round(this.layoutWidth)}x${Math.round(this.layoutHeight)}:${Math.round(this.layoutUiScale * 100)}:${Math.round(this.laneToPy(0))}:${Math.round(this.laneToPy(1))}`;
  }

  /** 静态层建场(建场与重排布局共用):根节点、背景、场地、石台、水晶、HUD、按钮、首战引导。 */
  private buildSceneTree(layout: UiLayout, stageCode: string): void {
    const root = this.host.addChildPlainNode(this.host.node, 'LobbyGuardBattleRoot', 0, 0, layout.width, layout.height);
    this.root = root;
    // 点空白处关闭范围显示与英雄详情(英雄节点会拦截冒泡,2026-08-26 用户拍板)。
    root.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if (this.rangeShownUnitId !== null) {
        this.clearRangeIndicator();
      }
      // docs/37 A:点在战场上(事件目标就是根节点,按钮/英雄/宝箱各自接住的不算)= 点怪集火,点空地取消标记。
      if (event && (event as unknown as { target?: Node }).target === root) {
        this.handleFieldTap(event);
      }
    }, this);
    this.paintBackdrop(root, layout.width, layout.height);
    this.mountBackground(root);
    this.fieldNode = this.host.addChildPlainNode(root, 'GuardField', 0, -layout.height * 0.03, layout.width, layout.height);
    this.paintLanesAndGrid();
    this.renderCrystal();
    this.renderHud();
    if (this.sim?.mode === 'raid') {
      // docs/47 P0:进攻侧只有摇杆 / 普攻 / 技能 / 翻滚,防守侧的召唤 / 战术 / 法术栏不出现
      this.raid?.mountHud(root);
    } else {
      this.renderSummonButton();
      this.renderCallWaveButton();
      this.renderSpellBar();
      // 2026-09-28 用户:"陷阱移除掉吧,不然太挤了"——战场底栏不再挂陷阱按钮 / 托盘(模型保留,无入口即不会放置)。
      this.renderEnhanceButton();
      this.renderCrystalSkillButton();
    }
    // 新手引导(P1,2026-09-05):首战 MAIN_1_1 指向召唤按钮的强提示(image2 箭头+气泡),首次召唤后消失(step 里检测)。
    // 重排布局时若已召唤过就不再补建,避免引导气泡闪回。
    const ended = this.sim?.phase === 'victory' || this.sim?.phase === 'defeat';
    if (stageCode === 'MAIN_1_1' && (this.sim?.summonCount ?? 0) === 0 && !ended) {
      this.mountFirstBattleGuide(root, layout);
    }
    this.mountedLayoutKey = this.layoutKey();
  }

  /**
   * 布局变了但战斗还在打:销毁并重建静态层与全部视图节点,sim(波次/金币/英雄/怪物)原样保留——
   * 英雄/怪物/区域/宝箱视图都由每帧 sync 按 sim 重建,弹道与飘字这类瞬时表现丢弃即可。
   */
  private remountSceneTree(layout: UiLayout, stageCode: string): void {
    // 结算覆盖层必须自己补建:refreshEndOverlay() 只在 overlayShown 且节点还在时刷新文案,
    // 而 showEndOverlay() 唯一调用点在 step() 里,战斗结束时帧循环已停——
    // 若不在这里重放,结算后一旦 resize,"返回"按钮会连同覆盖层一起永久消失(玩家卡死在已结束的战斗里)。
    const restoreEndOverlay = this.overlayShown;
    const endVictory = this.sim?.phase === 'victory';
    // 设置面板 / 退出确认随 root 一起销毁:重建后按原状态补开;开箱轮盘不补(奖励已入 sim),统一重算暂停。
    const restoreSettings = this.settingsOpen;
    const restoreExitConfirm = this.exitConfirmOpen;
    this.settingsOpen = false;
    this.exitConfirmOpen = false;
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.fieldNode = null;
    this.fieldBaseG = null;
    this.paintedCellsKey = '';
    this.crystalHpPaintedKey = '';
    this.resonanceKey = '';
    this.statsPanelSignature = '';
    this.heroViews.clear();
    this.monsterViews.clear();
    this.pickupViews.clear();
    this.trapViews.clear();
    this.zoneViews.clear();
    this.zoneFlights.clear();
    this.plainBurnZones.clear();
    this.perkShoutAt.clear();
    this.attackHitFxLive = 0;
    this.chestViews.clear();
    this.projectiles.length = 0;
    this.guardFxAimers.clear();
    this.skillFxLive = 0;
    this.zoneFxLive = 0;
    this.ultFxLive = 0;
    this.lastUltDimAt = 0;
    this.beamFxLive = 0;
    this.heroFxLastAt.clear();
    this.dragFromCell = null;
    this.dragGhost = null;
    this.rangeShownUnitId = null;
    this.choiceOverlayLevel = 0;
    this.wheelOverlayOpen = false;
    this.overlayShown = false;
    this.displayedGold = -1;
    this.goldCoinLive = 0;
    this.liveDamageFloaters = 0;
    this.buildSceneTree(layout, stageCode);
    if (!restoreEndOverlay) {
      if (restoreSettings) {
        this.openBattleSettings();
      }
      if (restoreExitConfirm) {
        this.openExitConfirm();
      }
    }
    this.syncBattlePause();
    if (restoreEndOverlay) {
      this.showEndOverlay(endVictory);
    }
  }

  private paintBackdrop(root: Node, width: number, height: number): void {
    const g = root.addComponent(Graphics);
    g.fillColor = rgba(16, 12, 11, 255);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
  }

  /** 贴图挂载:同步建占位节点锁定兄弟序(异步补挂会排到末尾、盖住整场),资源到位只填 spriteFrame。 */
  private mountSprite(parent: Node, name: string, path: string, x: number, y: number, width: number, height: number, tint?: Color): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    const apply = (frame: SpriteFrame): void => {
      if (!node.isValid) {
        return;
      }
      const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      if (tint) {
        sprite.color = tint;
      }
      node.getComponent(UITransform)?.setContentSize(width, height);
    };
    // 已在缓存(开局全量预载/开局预热)则同步套用:resources.load 即使命中缓存也走异步管线,
    // 与骨骼/纹理并发时实测可拖到 1.3s——弹道只活 0.4s,异步等到贴图时早已命中消失(2026-09-12)。
    const cached = resources.get(path, SpriteFrame);
    if (cached) {
      apply(cached);
      return node;
    }
    // 同一路径已在加载:挂到等待名单,不再多发一个加载任务(2026-10-09:石台格子同帧 6 次重复加载把加载门拖到最后)
    const waiting = this.spriteLoadWaiters.get(path);
    if (waiting) {
      waiting.push(apply);
      return node;
    }
    this.spriteLoadWaiters.set(path, [apply]);
    const settle = (frame: SpriteFrame | null): void => {
      const list = this.spriteLoadWaiters.get(path) ?? [];
      this.spriteLoadWaiters.delete(path);
      if (frame) {
        list.forEach((fn) => fn(frame));
      }
    };
    resources.load(path, SpriteFrame, (error: Error | null, frame: SpriteFrame | null) => {
      if (!error && frame) {
        settle(frame);
        return;
      }
      // 兜底:spriteFrame 子资源未导出时(meta 尚未翻 sprite-frame),直接取 texture 运行时包一层
      resources.load(path.replace(/\/spriteFrame$/, '/texture'), Texture2D, (err2: Error | null, tex: Texture2D | null) => {
        if (err2 || !tex) {
          settle(null);
          return;
        }
        const wrapped = new SpriteFrame();
        wrapped.texture = tex;
        settle(wrapped);
      });
    });
    return node;
  }

  /** 主按钮(素材=英雄详情升级按钮 btn_star_up 431×100,2026-08-26 用户拍板);标签由调用方叠加。 */
  private mountPrimaryButton(parent: Node, name: string, x: number, y: number, w: number): Node {
    const h = w * (100 / 431);
    const button = this.host.addChildPlainNode(parent, name, x, y, w, h);
    this.mountSprite(button, `${name}Art`, 'ui/hero/ai/btn_star_up/spriteFrame', 0, 0, w, h);
    this.host.applyImageButtonFeedback(button);
    return button;
  }

  /** 战场背景(矿洞图 1536×1024):cover 等比铺满,裁洞顶保地面;顶部再压一条渐暗带保 HUD 可读。 */
  /**
   * 爬塔章节战场背景(2026-09-11 用户拍板:不同章节展示不同战场背景)。
   * 25 章按世界观主题分 8 组循环取图;每张 2048×1152 与守卫矿脉同规格。
   * 表外(每日副本/未知关卡)回退矿脉图。
   */
  private static readonly CHAPTER_SCENE_BG: Record<number, string> = {
    1: 'battle_scene_shadow_keep',    // 暗影之堡
    2: 'battle_scene_ash_cathedral',  // 灰烬圣堂
    3: 'battle_scene_blood_moon',     // 血月荒原
    4: 'battle_scene_frost_wall',     // 霜骨长城
    5: 'battle_scene_void_harbor',    // 虚空港湾
    6: 'battle_scene_shadow_keep',    // 黑曜王庭
    7: 'battle_scene_void_harbor',    // 星坠地窟
    8: 'battle_scene_blood_moon',     // 赤砂古域
    9: 'battle_scene_night_forest',   // 永夜林海
    10: 'battle_scene_final_throne',  // 雷鸣圣域
    11: 'battle_scene_molten_core',   // 熔核深渊
    12: 'battle_scene_void_harbor',   // 命运回廊
    13: 'battle_scene_final_throne',  // 终焉前线
    14: 'battle_scene_night_forest',  // 雾锁群岛
    15: 'battle_scene_final_throne',  // 断星高塔
    16: 'battle_scene_frost_wall',    // 龙骸荒冢
    17: 'battle_scene_molten_core',   // 苍银矿脉
    18: 'battle_scene_night_forest',  // 沉眠墓园
    19: 'battle_scene_void_harbor',   // 天幕裂谷
    20: 'battle_scene_ash_cathedral', // 圣辉废都
    21: 'battle_scene_void_harbor',   // 群星祭坛
    22: 'battle_scene_void_harbor',   // 虚妄回声
    23: 'battle_scene_shadow_keep',   // 王冠残垣
    24: 'battle_scene_ash_cathedral', // 永恒审判庭
    25: 'battle_scene_final_throne',  // 终焉王座
  };

  /**
   * 各战场背景图的地平线位置(从图顶算的比例,离线量测:行间亮度梯度峰值 + 目视校对)。
   * 2026-09-12 用户反馈"上面一排格子的英雄占位应该要在地面":AI 出图的地平线天然在 38%~49% 之间飘,
   * 与其把背景放大平移去迁就固定布局(必然损画质),不如让格位跟着当前背景的地平线走(见 laneToPy)。
   */
  private static readonly SCENE_BG_HORIZON: Record<string, number> = {
    // 2026-11-10 分层背景重画:地平线 = 石坎脚下(可站人的地面起点),scene_horizon 候选 + 目视
    battle_scene_guard_mine: 0.385,
    battle_scene_raid_mine: 0.39,
    battle_scene_field_wasteland: 0.40,
    battle_scene_field_forest: 0.43,
    battle_scene_shadow_keep: 0.425,
    battle_scene_ash_cathedral: 0.45,
    battle_scene_blood_moon: 0.381,
    battle_scene_frost_wall: 0.463,
    battle_scene_void_harbor: 0.487,
    battle_scene_night_forest: 0.406,
    battle_scene_molten_core: 0.403,
    battle_scene_final_throne: 0.438,
    // 限时副本新图(2026-10-11):先用回退图的地平线,出图落位后用 tools/qa 量一遍再改
    battle_scene_daily_awaken: 0.345,
    battle_scene_daily_arcane: 0.33,
    battle_scene_daily_abyss: 0.35,
  };

  /** 由 stageCode(MAIN_<章>_<关>)解析本局战场背景图名;非主线或越界回退矿脉图。 */
  /**
   * 战斗 BGM 键按章节场景分配(2026-09-18 用户拍板:不同场景不同音乐):
   * `audio/bgm/bgm_battle_<场景名>`,9 个场景各一首(C1812 包 BGM_Battle_xx,见 素材原始备份/audio-picks-20260918.md);
   * 非主线关(限时/日常)与解析失败走 guard_mine 那首。
   */
  static resolveBattleBgmKey(stageCode: string | null | undefined): string {
    const matched = /^MAIN_(\d+)_\d+$/.exec((stageCode ?? '').toUpperCase());
    const daily = /^DAILY_([A-Z]+)_\d+$/.exec((stageCode ?? '').toUpperCase());
    const dailyScene = daily ? LobbyGuardBattleRenderer.DAILY_SCENE_BG[daily[1]]?.fallback : undefined;
    const scene = (matched ? LobbyGuardBattleRenderer.CHAPTER_SCENE_BG[Number(matched[1])] : undefined) ?? dailyScene ?? 'battle_scene_guard_mine';
    return `bgm_battle_${scene.replace(/^battle_scene_/, '')}`;
  }

  /**
   * 限时副本四主题战场背景(2026-10-11 用户:四张地图都用熔火矿脉):按关卡码 DAILY_<主题>_<档> 取图。
   * 熔火矿脉沿用矿脉图;觉醒之门 / 秘法圣殿 / 深渊裂隙 三张为新出图(battle_scene_daily_*,1672×941 等比铺满,地平线已用 tools/qa/scene_horizon.py 量过),
   * 图未落位前回退到风格最近的现有章节图,不会黑屏。
   */
  private static readonly DAILY_SCENE_BG: Record<string, { asset: string; fallback: string }> = {
    FORGE: { asset: 'battle_scene_guard_mine', fallback: 'battle_scene_guard_mine' },
    AWAKEN: { asset: 'battle_scene_daily_awaken', fallback: 'battle_scene_ash_cathedral' },
    ARCANE: { asset: 'battle_scene_daily_arcane', fallback: 'battle_scene_void_harbor' },
    ABYSS: { asset: 'battle_scene_daily_abyss', fallback: 'battle_scene_blood_moon' },
  };

  private resolveSceneBgName(): string {
    const fallback = 'battle_scene_guard_mine';
    const stageCode = (this.host.currentLobbyBattleState().start?.stageCode ?? '').toUpperCase();
    const fieldDef = /^FIELD_/.test(stageCode) ? worldMapOfStage(stageCode) : null;
    if (fieldDef?.battleBg && this.uiAssetKnown(`ui/battle/${fieldDef.battleBg}/spriteFrame`)) {
      // 野外(docs/50):按所在地图的横版背景
      return fieldDef.battleBg;
    }
    if (/^(RAID(PVP)?|FIELD)_/.test(stageCode)) {
      // 矿境掠夺(原型 v1,2026-10-26):别人的矿洞,去格子的石板地面
      return this.uiAssetKnown('ui/battle/battle_scene_raid_mine/spriteFrame') ? 'battle_scene_raid_mine' : fallback;
    }
    const daily = /^DAILY_([A-Z]+)_\d+$/.exec(stageCode);
    if (daily) {
      const entry = LobbyGuardBattleRenderer.DAILY_SCENE_BG[daily[1]];
      if (!entry) {
        return fallback;
      }
      // 新图是否已入库:精灵缓存里有或能解析到就用,否则回退
      return this.uiAssetKnown(`ui/battle/${entry.asset}/spriteFrame`) ? entry.asset : entry.fallback;
    }
    const matched = /^MAIN_(\d+)_\d+$/.exec(stageCode);
    if (!matched) {
      return fallback;
    }
    return LobbyGuardBattleRenderer.CHAPTER_SCENE_BG[Number(matched[1])] ?? fallback;
  }

  /** 资源是否存在于包内(resources 的 uuid 表);用来决定新背景图未落位时走回退。 */
  private uiAssetKnown(path: string): boolean {
    try {
      return !!resources.getInfoWithPath(path.replace(/\/spriteFrame$/, ''), SpriteFrame) || !!resources.getInfoWithPath(path, SpriteFrame);
    } catch (error) {
      void error;
      return false;
    }
  }

  /**
   * 英雄脚下石台按地图主题换皮(2026-10-13 用户:"英雄脚下地块跟随主题风格"):
   * 限时副本 觉醒之门 / 秘法圣殿 / 深渊裂隙 用 ui/guard/ghud_cell_tile_<主题>[_active](384×288 透明底),
   * 熔火矿脉与主线沿用熔岩石台;主题图未入库时回退熔岩石台。
   */
  private static readonly DAILY_CELL_TILE: Record<string, string> = {
    AWAKEN: 'ghud_cell_tile_awaken',
    ARCANE: 'ghud_cell_tile_arcane',
    ABYSS: 'ghud_cell_tile_abyss',
  };

  private cellTilePath(active: boolean): string {
    const base = active ? 'ui/guard/ghud_cell_tile_active/spriteFrame' : 'ui/guard/ghud_cell_tile/spriteFrame';
    const stageCode = (this.host.currentLobbyBattleState().start?.stageCode ?? '').toUpperCase();
    const daily = /^DAILY_([A-Z]+)_\d+$/.exec(stageCode);
    const name = daily ? LobbyGuardBattleRenderer.DAILY_CELL_TILE[daily[1]] : undefined;
    if (!name) {
      return base;
    }
    const themed = `ui/guard/${name}${active ? '_active' : ''}/spriteFrame`;
    return this.uiAssetKnown(themed) ? themed : base;
  }

  private resolveSceneBgPath(): string {
    return `ui/battle/${this.resolveSceneBgName()}/spriteFrame`;
  }

  /**
   * 当前背景地平线的屏幕 Y(场地坐标系,向上为正)。
   * 背景按 cover 铺满且底边对齐屏幕底:地平线距图底 (1-r)·bgH,换算到屏幕即 bgH·(1-r) - H/2。
   */
  private horizonPy(): number {
    const height = this.layoutHeight;
    const ratio = LobbyGuardBattleRenderer.SCENE_BG_HORIZON[this.resolveSceneBgName()] ?? 0.39;
    const cover = Math.max(this.layoutWidth / 2048, height / 1152);
    const bgH = 1152 * cover;
    return this.sceneBgCenterY(bgH, height) + bgH * (0.5 - ratio);
  }

  /**
   * 背景超出屏幕的高度从上面裁掉多少(0~1):1 = 底边贴屏幕底、只裁上面(默认,各章节图按此调好);
   * 0 = 顶边贴屏幕顶、只裁地面。宽屏手机(比 16:9 更宽)cover 铺满后图比屏幕高,
   * 焦点在上方远景的图默认会被裁掉主体(2026-10-13 用户:"觉醒之门背景压太高,后面的门显示不全")。
   */
  private static readonly SCENE_BG_TOP_CROP: Record<string, number> = {};

  /** 背景节点中心 Y(屏幕坐标,向上为正);背景、加载底图、地平线三处共用。 */
  private sceneBgCenterY(bgH: number, height: number): number {
    // 2026-11-10 分层背景:远景只占顶上约 1/4,照旧只裁上面会把远景裁光 → 上面裁 30%、下面(全是地面)裁 70%
    const name = this.resolveSceneBgName();
    const topCrop = LobbyGuardBattleRenderer.SCENE_BG_TOP_CROP[name] ?? (LobbyGuardBattleRenderer.SCENE_BG_LAYER[name] ? 0.3 : 1);
    return ((bgH - height) / 2) * (2 * topCrop - 1);
  }

  /** 加载页底图:本关战场背景按 cover 铺满并压暗(与正式背景同一张图、同一套几何,进场不会跳)。 */
  private mountLoadingBackdrop(root: Node, width: number, height: number): void {
    const cover = Math.max(width / 2048, height / 1152);
    const bgW = 2048 * cover;
    const bgH = 1152 * cover;
    this.mountSprite(root, 'GuardLoadingBg', this.resolveSceneBgPath(), 0, this.sceneBgCenterY(bgH, height), bgW, bgH, rgba(112, 104, 98, 255));
  }

  private mountBackground(root: Node): void {
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    // 背景源图 2048×1152(gpt-image-2 原生 16:9 直出,零放大,2026-08-28 终版)
    const bgSrcW = 2048;
    const bgSrcH = 1152;
    const cover = Math.max(width / bgSrcW, height / bgSrcH);
    const bgW = bgSrcW * cover;
    const bgH = bgSrcH * cover;
    const centerY = this.sceneBgCenterY(bgH, height);
    this.mountSprite(root, 'GuardSceneBg', this.resolveSceneBgPath(), 0, centerY, bgW, bgH);
    this.sceneNearNode = null;
    const layer = this.sceneBgLayer();
    if (layer) {
      this.mountSceneLayers(root, layer, bgW, bgH, centerY);
    }
    // 顶部压暗改羽化渐变(2026-09-15 用户反馈平涂半透明黑带太难看):上沿最深、向下平滑透明,没有硬边。
    // 2026-10-13 用户:「顶部遮盖层不好看」——暗带改为真正的上深下浅渐变,并拉高到 22% 让过渡更缓
    const shadeH = height * 0.22;
    this.mountSoftShade(root, 'GuardTopShade', 0, height / 2 - shadeH / 2, width, shadeH, 'top-fade');
  }

  /**
   * 分层战场背景(2026-11-10 用户「远处做了层次感,很立体」「分层远处背景会动态吧」):
   * 远景层 = 整图(GuardSceneBg)→ 雾带(两条,不同速度横向飘)+ 远处浮尘 → 近景层 = 同一张图抠出的地面 + 石坎(_near,透明底)。
   * 近景像素与整图逐像素一致,静止时三层叠起来就是原图;雾从石坎后面穿过才显出纵深。震屏时近景跟着晃、远景不动(视差)。
   * ledge = 近景上沿(从图顶算,tools/qa/battle_bg_layer_install.py 量出);fog = 雾色;sky = 室外(顶上加一条慢云)。
   */
  private static readonly SCENE_BG_LAYER: Record<string, { ledge: number; fog: [number, number, number]; fogAlpha: number; mote: [number, number, number]; sky: boolean }> = {
    battle_scene_field_wasteland: { ledge: 0.259, fog: [206, 210, 220], fogAlpha: 150, mote: [230, 230, 235], sky: true },
    battle_scene_field_forest: { ledge: 0.312, fog: [200, 214, 206], fogAlpha: 140, mote: [235, 240, 200], sky: true },
    battle_scene_raid_mine: { ledge: 0.27, fog: [120, 150, 205], fogAlpha: 120, mote: [255, 200, 130], sky: false },
    battle_scene_guard_mine: { ledge: 0.284, fog: [255, 140, 80], fogAlpha: 110, mote: [255, 150, 70], sky: false },
    battle_scene_daily_awaken: { ledge: 0.238, fog: [255, 244, 222], fogAlpha: 150, mote: [255, 225, 150], sky: true },
    battle_scene_daily_arcane: { ledge: 0.226, fog: [170, 140, 255], fogAlpha: 120, mote: [190, 170, 255], sky: false },
    battle_scene_daily_abyss: { ledge: 0.25, fog: [225, 100, 80], fogAlpha: 120, mote: [255, 120, 80], sky: true },
  };

  /** 震屏视差用:近景层节点(没有分层图时为 null)。 */
  private sceneNearNode: Node | null = null;
  private sceneNearY = 0;

  /** masked = 高清版(2026-11-11):近景不另存图,用背景整图 + 遮罩(GuardSceneNear);否则是旧的 _near 透明图。 */
  private sceneBgLayer(): { name: string; ledge: number; fog: [number, number, number]; fogAlpha: number; mote: [number, number, number]; sky: boolean; masked: boolean } | null {
    const name = this.resolveSceneBgName();
    const cfg = LobbyGuardBattleRenderer.SCENE_BG_LAYER[name];
    if (!cfg) {
      return null;
    }
    const masked = this.uiAssetKnown(`ui/battle/${name}_mask/spriteFrame`);
    return masked || this.uiAssetKnown(`ui/battle/${name}_near/spriteFrame`) ? { name, ...cfg, masked } : null;
  }

  private mountSceneLayers(root: Node, layer: { name: string; ledge: number; fog: [number, number, number]; fogAlpha: number; mote: [number, number, number]; sky: boolean; masked: boolean }, bgW: number, bgH: number, centerY: number): void {
    const yOf = (ratio: number): number => centerY + bgH * (0.5 - ratio);
    const [r, g, b] = layer.fog;
    // 雾带:两张横向无缝雾图首尾相接,整条匀速左移一张宽后瞬移回原位(画面完全一样,看不出跳);远的那条更淡更慢
    const fogBand = (name: string, ratio: number, bandH: number, alpha: number, seconds: number): void => {
      const tileW = bgW * 1.25;
      const band = this.host.addChildPlainNode(root, name, 0, yOf(ratio), tileW * 2, bandH);
      for (let i = 0; i < 2; i += 1) {
        this.mountSprite(band, `${name}Tile${i}`, 'ui/battle/battle_fog_strip/spriteFrame', (i - 0.5) * tileW, 0, tileW + 2, bandH, new Color(r, g, b, alpha));
      }
      const start = new Vec3(tileW / 2, yOf(ratio), 0);
      const end = new Vec3(-tileW / 2, yOf(ratio), 0);
      band.setPosition(start.x - tileW * Math.random(), start.y, 0);
      const first = (band.position.x - end.x) / tileW * seconds;
      tween(band)
        .to(first, { position: end })
        .call(() => {
          band.setPosition(start);
          tween(band).repeatForever(tween<Node>().to(seconds, { position: end }).call(() => band.setPosition(start))).start();
        })
        .start();
    };
    if (layer.sky) {
      fogBand('GuardSkyDrift', Math.max(0.03, layer.ledge * 0.18), bgH * 0.14, Math.round(layer.fogAlpha * 0.45), 150);
    }
    fogBand('GuardFogFar', layer.ledge * 0.62, bgH * 0.2, Math.round(layer.fogAlpha * 0.7), 110);
    fogBand('GuardFogNear', layer.ledge * 0.97, bgH * 0.14, layer.fogAlpha, 70);
    // 远处浮尘 / 余烬:几颗柔光点在石坎后面缓慢上飘、忽明忽暗
    const [mr, mg, mb] = layer.mote;
    const count = sys.isMobile ? 6 : 10;
    for (let i = 0; i < count; i += 1) {
      const size = bgH * (0.006 + Math.random() * 0.008);
      const x0 = (Math.random() - 0.5) * bgW * 0.9;
      const y0 = yOf(layer.ledge * (0.35 + Math.random() * 0.6));
      const mote = this.mountSoftFx(root, `GuardMote${i}`, 'glow', x0, y0, size * 3, size * 3, new Color(mr, mg, mb, 255));
      const opacity = mote.getComponent(UIOpacity) ?? mote.addComponent(UIOpacity);
      opacity.opacity = 0;
      const rise = bgH * (0.04 + Math.random() * 0.05);
      const drift = (Math.random() - 0.5) * bgW * 0.05;
      const seconds = 6 + Math.random() * 6;
      // 位移与明暗同周期:每圈从起点淡入、上飘、淡出,回到起点时正好看不见
      tween(mote).delay(Math.random() * seconds).call(() => {
        tween(mote).repeatForever(tween<Node>()
          .call(() => mote.setPosition(x0, y0, 0))
          .to(seconds, { position: new Vec3(x0 + drift, y0 + rise, 0) })).start();
        tween(opacity).repeatForever(tween<UIOpacity>().to(seconds * 0.4, { opacity: 170 }).to(seconds * 0.6, { opacity: 0 })).start();
      }).start();
    }
    this.sceneNearY = centerY;
    if (layer.masked) {
      const near = this.host.addChildPlainNode(root, 'GuardSceneNear', 0, centerY, bgW, bgH);
      mountSceneNearLayer(near, `ui/battle/${layer.name}/spriteFrame`, `ui/battle/${layer.name}_mask/spriteFrame`);
      this.sceneNearNode = near;
    } else {
      this.sceneNearNode = this.mountSprite(root, 'GuardSceneNear', `ui/battle/${layer.name}_near/spriteFrame`, 0, centerY, bgW, bgH);
    }
  }

  /** 法术等级点缀用的白色柔光 / 光环纹理(运行时生成 64×64,按法术颜色染色)。 */
  private static readonly SOFT_FX_FRAMES = new Map<string, SpriteFrame>();

  private mountSoftFx(parent: Node, name: string, kind: 'glow' | 'ring', x: number, y: number, width: number, height: number, color: Color): Node {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    let frame = LobbyGuardBattleRenderer.SOFT_FX_FRAMES.get(kind) ?? null;
    if (!frame) {
      try {
        const n = 64;
        const data = new Uint8Array(n * n * 4);
        for (let py = 0; py < n; py += 1) {
          for (let px = 0; px < n; px += 1) {
            const dx = (px + 0.5) / n - 0.5;
            const dy = (py + 0.5) / n - 0.5;
            const r = Math.min(1, Math.hypot(dx, dy) * 2);
            const alpha = kind === 'glow'
              ? Math.pow(1 - r, 2.2)
              : Math.max(0, 1 - Math.abs(r - 0.82) / 0.14) * (r < 1 ? 1 : 0);
            const offset = (py * n + px) * 4;
            data[offset] = 255;
            data[offset + 1] = 255;
            data[offset + 2] = 255;
            data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
          }
        }
        const texture = new Texture2D();
        texture.reset({ width: n, height: n, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: 1 });
        texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        texture.uploadData(data);
        frame = new SpriteFrame();
        frame.texture = texture;
        LobbyGuardBattleRenderer.SOFT_FX_FRAMES.set(kind, frame);
      } catch (error) {
        void error;
        return node;
      }
    }
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.spriteFrame = frame;
    sprite.color = color;
    node.getComponent(UITransform)?.setContentSize(width, height);
    return node;
  }

  /** 柔和暗底纹理缓存(按样式键复用,重挂/重排布局不重复生成)。 */
  private static readonly SOFT_SHADE_FRAMES = new Map<string, SpriteFrame>();

  /**
   * 运行时生成羽化暗底并挂成 Sprite(替代程序平涂的硬边半透明框):
   * - top-fade:1×64 竖向渐变,alpha 从顶部 0.66 按 (1-v)^1.7 衰减到 0;
   * - blob:48×24 圆角矩形 SDF,内部 0.62、向四边 38% 宽度羽化到 0。
   * 纹理极小、双线性拉伸后视觉平滑;生成失败(极端环境)回退为原来的平涂,不影响功能。
   */
  /** 矢量条 / 环的"上次画出的样子"签名:没变就不 clear + 重新三角化 + 重新上传(2026-10-07 HUD 每 tick 重画优化)。 */
  private sameDrawKey(node: Node, key: string): boolean {
    const holder = node as Node & { __lcDrawKey?: string };
    if (holder.__lcDrawKey === key) {
      return true;
    }
    holder.__lcDrawKey = key;
    return false;
  }

  /**
   * 特效骨骼走引擎共享动画缓存(2026-10-10 真机剖析:战斗中骨骼逐帧计算占主线程大头):同一特效同一动画只算一遍,
   * 所有实例共用算好的帧,画面不变。只用于一次性 / 循环特效(不需要动画融合、事件、跳播);英雄本体、大招、战技仍实时计算。
   */
  private static useSharedFxCache(skeleton: sp.Skeleton | null): void {
    if (!skeleton) {
      return;
    }
    try {
      skeleton.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.SHARED_CACHE);
    } catch (error) {
      void error;
    }
  }

  /**
   * 设皮肤但不作废共享动画缓存(2026-10-11 真机剖析:_updateCache / updateToFrame 占主线程 25%+)。
   * 引擎 Skeleton.setSkin 末尾会调 invalidAnimationCache → 把这种骨骼**所有**已算好的共享帧全部作废,
   * 于是每刷一只怪,全场同类怪的动画都被重算一遍,共享缓存等于白做。这里直接给底层骨骼 / 烘焙实例设皮肤
   * 并记下 _skinName(新建缓存时引擎会用它),跳过作废。非缓存模式(英雄 / BOSS)仍走引擎原路径。
   */
  private static setSkinKeepCache(skeleton: sp.Skeleton, skin: string): void {
    const inner = skeleton as unknown as {
      _skeleton?: { setSkinByName(name: string): void; setSlotsToSetupPose(): void } | null;
      _instance?: { setSkin(name: string): void } | null;
      _animCache?: { setSkin(name: string): void } | null;
      _skinName?: string;
    };
    try {
      if (skeleton.isAnimationCached() && inner._skeleton && inner._instance) {
        inner._skeleton.setSkinByName(skin);
        inner._instance.setSkin(skin);
        inner._animCache?.setSkin(skin);
        inner._skinName = skin;
        inner._skeleton.setSlotsToSetupPose();
        return;
      }
    } catch (error) {
      void error;
    }
    skeleton.setSkin(skin);
    skeleton.setSlotsToSetupPose();
  }

  private static readonly DAMAGE_FONT_BUCKETS = new Map<number, string>();

  /** 伤害数字字体名:同一缩放同一名字(共享字形);缩放变了换成多一个尾随空格的同字体名(浏览器渲染相同,引擎缓存键不同)。 */
  private static damageFontFamily(): string {
    const scale = Math.round(view.getScaleX() * 100);
    let family = LobbyGuardBattleRenderer.DAMAGE_FONT_BUCKETS.get(scale);
    if (!family) {
      family = `Arial${' '.repeat(LobbyGuardBattleRenderer.DAMAGE_FONT_BUCKETS.size)}`;
      LobbyGuardBattleRenderer.DAMAGE_FONT_BUCKETS.set(scale, family);
    }
    return family;
  }

  /** 烘焙贴图精灵(GuardBakedShapes);烘焙失败时什么都不挂(纯表现,不影响结算)。 */
  private mountBakedSprite(parent: Node, frame: SpriteFrame | null, x: number, y: number, width: number, height: number): void {
    if (!frame) {
      return;
    }
    const node = this.host.addChildPlainNode(parent, 'Baked', x, y, width, height);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.spriteFrame = frame;
    node.getComponent(UITransform)?.setContentSize(width, height);
  }

  private mountSoftShade(parent: Node, name: string, x: number, y: number, width: number, height: number, style: 'top-fade' | 'blob' | 'flat'): Node | null {
    const node = this.host.addChildPlainNode(parent, name, x, y, width, height);
    let frame = LobbyGuardBattleRenderer.SOFT_SHADE_FRAMES.get(style) ?? null;
    if (!frame) {
      try {
        const pw = style === 'top-fade' ? 1 : style === 'flat' ? 2 : 48;
        const ph = style === 'top-fade' ? 64 : style === 'flat' ? 2 : 24;
        const data = new Uint8Array(pw * ph * 4);
        for (let py = 0; py < ph; py += 1) {
          for (let px = 0; px < pw; px += 1) {
            // uploadData 的行 0 在纹理顶部(2026-10-13 实测:原先按"行 0 在底部"写,顶部暗带上下颠倒,
            // 最暗处落在下沿成一道硬边,觉醒之门亮天空上尤其明显)。v=0 顶、v=1 底。
            const u = (px + 0.5) / pw;
            const v = (py + 0.5) / ph;
            let alpha: number;
            if (style === 'top-fade') {
              // 顶边最深,向下按 (1-v)^2.2 收到 0:尾段斜率趋零,没有可见的下沿
              alpha = 0.6 * Math.pow(1 - v, 2.2);
            } else if (style === 'flat') {
              alpha = 1;
            } else {
              // 圆角矩形距离场:中心区满强度,边缘按羽化宽度平滑归零
              const feather = 0.38;
              const dx = Math.max(0, Math.abs(u - 0.5) - (0.5 - feather));
              const dy = Math.max(0, Math.abs(v - 0.5) - (0.5 - feather));
              const d = Math.min(1, Math.hypot(dx / feather, dy / feather));
              const t = 1 - d;
              alpha = 0.62 * t * t * (3 - 2 * t);
            }
            const offset = (py * pw + px) * 4;
            data[offset] = 10;
            data[offset + 1] = 8;
            data[offset + 2] = 8;
            data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
          }
        }
        const texture = new Texture2D();
        texture.reset({ width: pw, height: ph, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: 1 });
        texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        texture.uploadData(data);
        frame = new SpriteFrame();
        frame.texture = texture;
        LobbyGuardBattleRenderer.SOFT_SHADE_FRAMES.set(style, frame);
      } catch (error) {
        void error;
        frame = null;
      }
    }
    if (!frame) {
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(10, 8, 8, style === 'top-fade' ? 118 : 150);
      g.roundRect(-width / 2, -height / 2, width, height, style === 'top-fade' ? 0 : 14);
      g.fill();
      return null;
    }
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.spriteFrame = frame;
    node.getComponent(UITransform)?.setContentSize(width, height);
    return node;
  }

  /**
   * 大招压暗(2026-10-01 用户:"大招不易被区分"):放大招的一瞬间整块战场压暗约 0.6s,
   * 之后挂上的大招特效 / 名牌 / 伤害数字都在压暗层之上,所以大招单独"亮"出来。HUD 在 root 上、不受影响。
   * 只用 Sprite(UIOpacity 淡不掉 Graphics 填充);同时多个大招 2s 内只压一次。
   */
  /** 压暗保持到的时刻(整段演出类大招按片段长度压暗;多个大招叠加时取最晚)。 */
  private ultDimHoldUntil = 0;

  /**
   * 整段演出类大招的压暗(2026-10-06):压到 120/255 并保持 durationSec,再 0.35s 淡出;期间再来一个大招就顺延。
   * 与 pulseUltDim 共用同一个 GuardUltDim 节点。
   */
  private holdUltDim(durationSec: number): void {
    const field = this.fieldNode;
    const sim = this.sim;
    if (!field || !sim || this.wheelOverlayOpen || sim.pendingChoice) {
      return;
    }
    const until = Date.now() + durationSec * 1000;
    const extend = this.ultDimHoldUntil > Date.now();
    this.ultDimHoldUntil = Math.max(this.ultDimHoldUntil, until);
    let node = field.getChildByName('GuardUltDim');
    let opacity = node?.getComponent(UIOpacity) ?? null;
    if (node && opacity) {
      Tween.stopAllByTarget(opacity);
    } else {
      node?.destroy();
      node = this.mountSoftShade(field, 'GuardUltDim', 0, this.layoutHeight * 0.03, this.layoutWidth * 1.1, this.layoutHeight * 1.12, 'flat');
      if (!node) {
        return;
      }
      opacity = node.addComponent(UIOpacity);
      opacity.opacity = 0;
    }
    const dimNode = node;
    this.lastUltDimAt = Date.now();
    this.placeUltDimBehindUnits(dimNode);
    const holdSec = Math.max(0.2, (this.ultDimHoldUntil - Date.now()) / 1000);
    tween(opacity)
      .to(extend ? 0.05 : 0.12, { opacity: 120 })
      .delay(holdSec)
      .to(0.35, { opacity: 0 })
      .call(() => {
        if (dimNode.isValid && this.ultDimHoldUntil <= Date.now() + 50) {
          dimNode.destroy();
        }
      })
      .start();
  }

  /**
   * 压暗层只压背景:放在战场层最底下,格子 / 英雄 / 怪物 / 特效都在它上面(2026-11-11 战斗画面精致化,用户确认样片)。
   * 原先放在「大招特效之下、其余战场元素之上」(2026-10-07),英雄和怪物跟着一起被压到 120/255 的黑幕下面,
   * 大招一出全场发闷、深色怪物几乎看不见;改成只压背景后,角色保持原亮度,大招照样有暗背景衬着。
   */
  private placeUltDimBehindUnits(dimNode: Node): void {
    dimNode.setSiblingIndex(0);
  }

  private pulseUltDim(): void {
    const field = this.fieldNode;
    const sim = this.sim;
    const now = Date.now();
    if (!field || !sim || this.wheelOverlayOpen || sim.pendingChoice || now - this.lastUltDimAt < GUARD_ULT_DIM_INTERVAL_MS) {
      return;
    }
    let node = field.getChildByName('GuardUltDim');
    let opacity = node?.getComponent(UIOpacity) ?? null;
    if (node && opacity) {
      // 复用唯一一层(切后台时 director 暂停,tween 不推进,每次新挂会在回前台时叠成一瞬黑屏)
      Tween.stopAllByTarget(opacity);
    } else {
      node?.destroy();
      node = this.mountSoftShade(field, 'GuardUltDim', 0, this.layoutHeight * 0.03, this.layoutWidth * 1.1, this.layoutHeight * 1.12, 'flat');
      if (!node) {
        field.getChildByName('GuardUltDim')?.destroy();
        return;
      }
      opacity = node.addComponent(UIOpacity);
      opacity.opacity = 0;
    }
    const dimNode = node;
    this.lastUltDimAt = now;
    this.placeUltDimBehindUnits(dimNode);
    tween(opacity).to(0.08, { opacity: 100 }).delay(0.25).to(0.3, { opacity: 0 }).call(() => {
      if (dimNode.isValid) {
        dimNode.destroy();
      }
    }).start();
  }

  // ── 几何(参考图 2026-08-21):水晶+3×3 格占左 1/3,怪物跑道占右 2/3 ──
  // 分段线性映射:sim x∈[0,5](英雄区)→ [-0.44W,-0.167W];x∈[5,10](跑道)→ [-0.167W,+0.47W]。
  // 格子与怪物共用同一映射,射程像素与 sim 判定天然对齐。
  private static readonly HERO_ZONE_SIM_END = 5;
  /**
   * 水晶几何(2026-09-28 用户:"水晶位置需要重新设计"——原先贴屏幕左缘被切掉一半、又压住第一列格子):
   * 水晶整座落在屏幕内(左留 1.2% 宽),底座压在中央走道上、垂直居中于两排格子之间;格子整体让到水晶右侧。
   */
  private crystalGeom(): { x: number; y: number; w: number; h: number } {
    const h = Math.min(this.layoutHeight * 0.32, this.layoutWidth * 0.2);
    const w = h * (299 / 652);
    const x = -this.layoutWidth * 0.488 + w / 2;
    // 掠夺(原型 v1):水晶抬高到走道上沿,让出左下角给摇杆
    const y = this.walkwayY() + h * (this.isRaidStage() ? 0.45 : 0.12);
    return { x, y, w, h };
  }

  /** 当前是否矿境掠夺(建场时 sim 可能还没建好,按关卡码判)。 */
  private isRaidStage(): boolean {
    return this.sim?.mode === 'raid' || /^(RAID(PVP)?|FIELD)_/i.test(this.host.currentLobbyBattleState().start?.stageCode ?? '');
  }
  /** 第一列格心 x:紧贴水晶右缘 + 英雄半宽 + 小间隙。 */
  private firstCellX(): number {
    const c = this.crystalGeom();
    return c.x + c.w / 2 + this.layoutWidth * 0.006 + this.heroDisplaySize() / 2;
  }
  /** sim x∈[0,5] 英雄区的像素端点:水晶接触点(GUARD_CRYSTAL_REACH_X)落在水晶右缘内侧,英雄区右端在最后一列格子之外半格。 */
  private heroZonePx(): { heroLeft: number; heroRight: number; runwayRight: number } {
    const crystal = this.crystalGeom();
    const heroRight = this.firstCellX() + (GUARD_GRID_COLS - 0.5) * this.cellPitchPx();
    const reachPx = crystal.x + crystal.w * 0.3;
    const reachT = GUARD_CRYSTAL_REACH_X / LobbyGuardBattleRenderer.HERO_ZONE_SIM_END;
    const heroLeft = (reachPx - reachT * heroRight) / (1 - reachT);
    return { heroLeft, heroRight, runwayRight: this.layoutWidth * 0.47 };
  }
  private xToPx(x: number): number {
    const { heroLeft, heroRight, runwayRight } = this.heroZonePx();
    if (x <= LobbyGuardBattleRenderer.HERO_ZONE_SIM_END) {
      return heroLeft + (x / LobbyGuardBattleRenderer.HERO_ZONE_SIM_END) * (heroRight - heroLeft);
    }
    return heroRight + ((x - LobbyGuardBattleRenderer.HERO_ZONE_SIM_END) / (GUARD_SPAWN_X - LobbyGuardBattleRenderer.HERO_ZONE_SIM_END)) * (runwayRight - heroRight);
  }
  private pathLeftPx(): number {
    return this.xToPx(0);
  }
  private pathRightPx(): number {
    return this.xToPx(GUARD_SPAWN_X);
  }
  /**
   * 两排格子(2026-08-28 用户拍板):row0 贴地面顶部,row1 贴地面底部,中间整条走道。
   * 2026-09-12:row0 不再写死 +0.12H,而是跟随当前背景地平线——踏台上沿(格心上方 0.021H)压在
   * 地平线下方,英雄才是"站在地面上"而不是浮在远景山上;地面极窄的图有下限保护,避免和走道挤成一团。
   */
  private laneToPy(lane: number): number {
    const height = this.layoutHeight;
    if (lane !== 0) {
      return height * -0.34;
    }
    // 余量口径(2026-09-12 审计校准):horizonPy() 是 root/屏幕坐标,而格位挂在 GuardField 内
    // (field 自身 y = -0.03H),故"踏台上沿正好贴地平线"的临界值是 horizonPy + 0.051H
    // (+0.0576H 台心下沉 -0.0367H 台半高 +0.03H 场地偏移)。这里取 horizonPy - 0.021H,
    // 即比临界值再压低约 0.072H(1080 下约 78px)——余量用于吸收各图地平线量测误差与近大远小的透视,
    // 9 张背景离线核算 + 暗影石堡/虚空港湾实拍均落在地面纹理区内。
    const onGround = this.horizonPy() - height * 0.021;
    return Math.max(height * -0.03, Math.min(height * 0.12, onGround));
  }

  /** 中央走道 Y(怪物通行,水晶垂直居中对准):始终取两排格位的中线。 */
  private walkwayY(): number {
    return (this.laneToPy(0) + this.laneToPy(1)) / 2;
  }

  /** 怪物 Y:跑道段(x≥5.6)上下两道散布,x∈[4.2,5.6] 平滑汇入走道,格子区只走走道——不踩英雄格。 */
  private monsterY(lane: number, x: number): number {
    const spreadY = this.walkwayY() + (0.5 - Math.min(1, lane)) * this.layoutHeight * 0.2;
    if (x >= 6.8) {
      return spreadY;
    }
    if (x <= 5.0) {
      return this.walkwayY();
    }
    const t = (x - 5.0) / 1.8;
    return this.walkwayY() + (spreadY - this.walkwayY()) * t;
  }

  /** 走道汇聚系数(1=跑道全散布,0.18=走道):抖动幅度随之收敛。 */
  private monsterSpread(x: number): number {
    if (x >= 6.8) {
      return 1;
    }
    if (x <= 5.0) {
      return 0.18;
    }
    return 0.18 + 0.82 * ((x - 5.0) / 1.8);
  }
  private unitSize(): number {
    return this.layoutHeight * 0.16;
  }
  /** 两排横铺布局(2026-08-28):格位独立排布,不再挂 sim 的 guardCellX 像素映射。 */
  private cellCenter(cell: number): { x: number; y: number } {
    const col = cell % GUARD_GRID_COLS;
    const row = Math.floor(cell / GUARD_GRID_COLS);
    if (this.isRaidStage()) {
      // 野外清怪(docs/50):怪物会追人,站位用模型里的实时位置
      // docs/61:守矿首领也不按格子站(fx / flane = 水晶正前方)
      const hero = this.sim?.heroes.find((item) => item.cell === cell);
      if (hero && hero.fx !== undefined) {
        return { x: this.xToPx(hero.fx), y: this.raidLaneY(hero.flane ?? 0.5) };
      }
      // 掠夺:x 与模拟坐标一致(进攻方挥刀范围所见即所得),上下两排在走道里错开站(原型 v1)
      return { x: this.xToPx(guardCellX(cell)), y: this.raidLaneY(row === 0 ? 0.25 : 0.75) };
    }
    return { x: this.firstCellX() + col * this.cellPitchPx(), y: this.laneToPy(row) };
  }

  /** 掠夺走道 Y:上排格位线(0)→ 下排格位线(1)整段线性,不随 x 收窄。 */
  private raidLaneY(laneF: number): number {
    const top = this.laneToPy(0);
    const bottom = this.laneToPy(1);
    return top + (bottom - top) * laneF;
  }

  private cellAtPosition(px: number, py: number): number | null {
    let best: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let cell = 0; cell < GUARD_GRID_CELLS; cell += 1) {
      const center = this.cellCenter(cell);
      const dist = Math.hypot(center.x - px, center.y - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }
    return bestDist <= this.unitSize() * 0.9 ? best : null;
  }

  /** 相邻格列的像素间距(2026-09-02 用户拍板:格子只占屏幕左 1/3)。 */
  private cellPitchPx(): number {
    return this.layoutWidth * 0.054;
  }

  /** 英雄立绘显示尺寸(随格距缩放;2026-09-02 用户:战场全部英雄放大15% → 1.35×1.15)。 */
  private heroDisplaySize(): number {
    return this.cellPitchPx() * 1.55;
  }

  /** 踏台几何(2026-09-02 用户拍板参考图:格子要在英雄脚底下,不是身后立卡):台面中心对英雄脚底线。 */
  private cellTileRect(cell: number): { x: number; y: number; w: number; h: number } {
    const center = this.cellCenter(cell);
    const pitch = this.cellPitchPx();
    const w = pitch * 1.02;
    return { x: center.x, y: center.y - pitch * 0.6, w, h: w * 0.75 };
  }

  private paintLanesAndGrid(): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    this.fieldBaseG = field.getComponent(Graphics) ?? field.addComponent(Graphics);
    this.repaintFieldBase();
  }

  /** 下一格解锁还差几次召唤(全开返回 0)。 */
  private nextCellUnlockNeed(sim: GuardBattleState): number {
    if (sim.unlockedCells >= GUARD_GRID_CELLS) {
      return 0;
    }
    const nextAt = (sim.unlockedCells - GUARD_START_CELLS + 1) * GUARD_CELL_UNLOCK_EVERY;
    return Math.max(1, nextAt - sim.summonCount);
  }

  /** 车道+格子底图(解锁进度变化时重画;锁定格画暗卡,下一个待解锁格标倒数)。 */
  private repaintFieldBase(): void {
    const g = this.fieldBaseG;
    const field = this.fieldNode;
    const sim = this.sim;
    if (!g || !field || !sim) {
      return;
    }
    g.clear();
    // 踏台改版(2026-09-02 用户拍板参考图):格子=英雄脚下石台(image2 生成 ghud_cell_tile),不再是身后立卡;
    // 锁图标/解锁提示压低 sibling,不再盖到路过的怪物身上。
    for (const stale of field.children.filter((child) => child.name === 'GuardLockIcon' || child.name === 'GuardCellCard')) {
      stale.destroy();
    }
    if (sim.mode === 'raid') {
      // 掠夺(原型 v1,2026-10-26):没有格子,守卫直接站在矿洞地面上
      field.getChildByName('GuardLockHint')?.destroy();
      return;
    }
    for (let cell = 0; cell < GUARD_GRID_CELLS; cell += 1) {
      const tile = this.cellTileRect(cell);
      const locked = guardCellUnlockRank(cell) >= sim.unlockedCells;
      const card = this.host.addChildPlainNode(field, 'GuardCellCard', tile.x, tile.y, tile.w, tile.h);
      card.setSiblingIndex(1);
      this.mountSprite(card, 'Img', this.cellTilePath(false), 0, 0, tile.w, tile.h);
      const cardOpacity = card.addComponent(UIOpacity);
      cardOpacity.opacity = locked ? 105 : 235;
      if (locked) {
        const lockNode = this.host.addChildPlainNode(field, 'GuardLockIcon', tile.x, tile.y + tile.h * 0.06, 26, 26);
        lockNode.setSiblingIndex(2);
        this.mountSprite(lockNode, 'Img', 'ui/common/ai/ic_lock/spriteFrame', 0, 0, 26, 26);
      }
    }
    field.getChildByName('GuardLockHint')?.destroy();
    if (sim.unlockedCells < GUARD_GRID_CELLS) {
      const nextCell = guardCellFromUnlockRank(sim.unlockedCells);
      const tile = this.cellTileRect(nextCell);
      const hint = this.host.addChildLabel(field, 'GuardLockHint', `再招募 ${this.nextCellUnlockNeed(sim)} 次
解锁此格`, tile.x, tile.y + tile.h * 0.72, 11, rgba(220, 202, 168, 225), new Size(tile.w * 1.2, 44));
      hint.node.setSiblingIndex(2);
      hint.enableOutline = true;
      hint.outlineColor = rgba(20, 12, 6, 255);
      hint.outlineWidth = 2;
    }
    // 脏标记落在重建完成之后:中途抛异常时宁可下一帧重画,也不要被误标为"已画好"而留下半成品。
    this.paintedCellsKey = `${sim.unlockedCells}:${this.nextCellUnlockNeed(sim)}`;
  }

  private renderCrystal(): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    // 野外清怪(docs/50):没有水晶
    if (this.sim?.raidClear) {
      return;
    }
    // 1:1 复刻:新水晶素材(ghud_cell 同批,299×652 熔岩基座蓝晶簇);位置见 crystalGeom()
    const geom = this.crystalGeom();
    const height = geom.h;
    const width = geom.w;
    const x = geom.x;
    const y = geom.y;
    // 2026-09-28 用户:"水晶弹窗里的水晶效果不错,战场中也用同样的效果"——与大厅弹窗同一套骨骼特效:
    // 背后蓝紫星云旋涡(LOBBY_CRYSTAL_FX.aura)+ 基座漩涡法阵(pedestal),都放在水晶节点之前(层级在下),不随水晶呼吸缩放。
    const fxHost = { addChildPlainNode: (p: Node, n: string, fx: number, fy: number, fw: number, fh: number) => this.host.addChildPlainNode(p, n, fx, fy, fw, fh) };
    const auraHolder = this.host.addChildPlainNode(field, 'GuardCrystalAuraFx', x, y + height * 0.08, 10, 10);
    mountLobbySpineFx(fxHost, auraHolder, LOBBY_CRYSTAL_FX.aura, 0, 0, height * LOBBY_CRYSTAL_FX.aura.size, true, 0);
    const pedestalHolder = this.host.addChildPlainNode(field, 'GuardCrystalPedestalFx', x, y - height * 0.4, 10, 10);
    // 战场里水晶旁就是英雄格:法阵比弹窗收小(×0.7),不压到下排英雄。
    mountLobbySpineFx(fxHost, pedestalHolder, LOBBY_CRYSTAL_FX.pedestal, 0, 0, height * LOBBY_CRYSTAL_FX.pedestal.size * 0.7, true, 0);
    const holder = this.host.addChildPlainNode(field, 'GuardCrystal', x, y, width, height);
    this.mountSprite(holder, 'GuardCrystalIcon', 'ui/battle/ai/ghud_crystal_tower/spriteFrame', 0, 0, width, height);
    tween(holder)
      .repeatForever(tween().to(1.4, { scale: new Vec3(1.03, 1.03, 1) }).to(1.4, { scale: Vec3.ONE }))
      .start();
    // 水晶血条挂在水晶头顶(2026-09-28 用户:"血条也要放到水晶上"),原左上角大血条移除;独立节点,不随水晶呼吸缩放。
    const barW = Math.max(width * 1.35, 132);
    // docs/61 掠夺(原型 battle_b3):细蓝条 + 数字(手机上水晶靠上,数字放条上方会压到左上输出面板 → 放条下方)
    const raidSlim = this.isRaidStage() && !this.sim?.raidClear;
    const barH = raidSlim ? 8 : 18;
    // 水晶贴左缘:血条整体钳在屏幕内(左留 12px)
    const barX = Math.max(x, -this.layoutWidth / 2 + 12 + barW / 2);
    const bar = this.host.addChildPlainNode(field, 'GuardCrystalHpBar', barX, y + height / 2 + 22, barW, barH);
    bar.addComponent(Graphics);
    const hpText = this.host.addChildLabel(bar, 'GuardCrystalHpText', '', 0, raidSlim ? -barH / 2 - 12 : 0, raidSlim ? 17 : 14, rgba(255, 250, 235, 250), new Size(barW - 8, raidSlim ? 22 : barH));
    hpText.enableOutline = true;
    hpText.outlineColor = rgba(8, 14, 30, 255);
    hpText.outlineWidth = 2;
    hpText.isBold = true;
    LobbyGuardBattleRenderer.hudCharCache(hpText);
    if (this.isRaidStage() && !this.sim?.raidClear) {
      return;
    }
    const cap = this.host.addChildPlainNode(field, 'GuardCrystalHpCap', barX, y + height / 2 + 22 + barH / 2 + 11, 120, 18);
    const capLabel = this.host.addChildLabel(cap, 'Text', '守卫水晶', 0, 0, 14, rgba(170, 215, 255, 240), new Size(120, 18));
    capLabel.enableOutline = true;
    capLabel.outlineColor = rgba(8, 14, 30, 255);
    capLabel.outlineWidth = 2;
  }

  // ── HUD:1:1 复刻用户提供的整套素材(2026-08-28)──
  private renderHud(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const hud = this.host.addChildPlainNode(root, 'GuardHud', 0, 0, width, height);
    // 左侧信息暗底板(2026-08-28 用户验收:亮背景处信息看不清;2026-09-02 职业计数移除后收矮)
    // 2026-09-15 用户反馈透明框难看:圆角平涂换四边羽化的柔和暗底(略放大让羽化边盖住内容外沿),仍保证亮背景可读。
    const panelW = 250;
    const panelH = height * 0.185;
    this.mountSoftShade(hud, 'GuardLeftPanel', -width / 2 + 4 + panelW / 2, height / 2 - 4 - panelH / 2, panelW, panelH, 'blob');
    // 水晶生命已挪到水晶头顶(renderCrystal,2026-09-28);左上只留"统计"按钮。
    // 左侧改版(2026-09-02 用户拍板参考图):去掉职业计数竖条,换"统计"按钮展开每英雄输出贡献
    const stripTop = height / 2 - 20;
    // 2026-10-10 全界面美化:圆角平涂框换背包同款暗铁按钮切图(bag_button_dark 512×158,按原比 3.24 等比)
    // 2026-10-11 用户:「统计」太小 → 加大一档
    const statsBtnH = 54;
    const statsBtnW = Math.round(statsBtnH * (512 / 158));
    const statsBtn = this.host.addChildPlainNode(hud, 'GuardStatsButton', -width / 2 + 24 + statsBtnW / 2, stripTop - statsBtnH / 2, statsBtnW, statsBtnH);
    this.mountSprite(statsBtn, 'Art', GUARD_STATS_BUTTON_ART, 0, 0, statsBtnW, statsBtnH);
    const sbLabel = this.host.addChildLabel(statsBtn, 'Text', '统计', 0, 0, 24, rgba(244, 220, 166, 252), new Size(statsBtnW * 0.7, 32));
    sbLabel.enableOutline = true;
    sbLabel.outlineColor = rgba(12, 8, 6, 255);
    sbLabel.outlineWidth = 2;
    statsBtn.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      this.statsPanelOpen = !this.statsPanelOpen;
      this.refreshStatsPanel(true);
    }, this);
    this.host.applyImageButtonFeedback(statsBtn, 1.05, 0.95);
    // 2026-09-18 用户要求:左上角不再显示"全队攻击 +x%"与"等级·击杀"(强化改词条后攻击加成不再是主线数值)。
    // 顶部中央:标题横幅(素材 704×110)
    const bannerW = Math.min(600, width * 0.42);
    const bannerH = bannerW * (110 / 704);
    const banner = this.host.addChildPlainNode(hud, 'GuardTopBanner', 0, height / 2 - 16 - bannerH / 2, bannerW, bannerH);
    this.mountSprite(banner, 'Img', 'ui/battle/ai/ghud_top_banner/spriteFrame', 0, 0, bannerW, bannerH);
    const waveText = this.host.addChildLabel(banner, 'GuardWaveText', '', 0, 2, 20, rgba(255, 236, 190, 252), new Size(bannerW - 60, 26));
    waveText.overflow = Label.Overflow.SHRINK;
    waveText.enableOutline = true;
    waveText.outlineColor = rgba(20, 12, 6, 255);
    waveText.outlineWidth = 2;
    // BOSS 顶部血条:名字 + 红条(名字在条上方,数字条内)
    const bossName = this.host.addChildLabel(hud, 'GuardBossTopName', '', 0, height / 2 - 16 - bannerH - 16, 17, rgba(255, 224, 190, 252), new Size(500, 22));
    bossName.enableOutline = true;
    bossName.outlineColor = rgba(30, 10, 6, 255);
    bossName.outlineWidth = 2;
    const bossBar = this.host.addChildPlainNode(hud, 'GuardBossTopBar', 0, height / 2 - 16 - bannerH - 40, 480, 24);
    bossBar.addComponent(Graphics);
    const bossText = this.host.addChildLabel(bossBar, 'GuardBossTopBarText', '', 0, 0, 16, rgba(255, 244, 230, 252), new Size(440, 22));
    bossText.enableOutline = true;
    bossText.outlineColor = rgba(40, 12, 8, 255);
    bossText.outlineWidth = 2;
    // 右上:战斗金币(素材 325×89)+ 设置 + 关闭
    const pillW = 240;
    const pillH = pillW * (89 / 325);
    const goldPill = this.host.addChildPlainNode(hud, 'GuardGoldPill', width / 2 - 128 - pillW / 2, height / 2 - 20 - pillH / 2, pillW, pillH);
    this.mountSprite(goldPill, 'Img', 'ui/battle/ai/ghud_gold_pill/spriteFrame', 0, 0, pillW, pillH);
    const goldText = this.host.addChildLabel(goldPill, 'GuardGoldText', '', pillW * 0.08, 1, 21, rgba(255, 222, 130, 252), new Size(pillW * 0.66, 26), HorizontalTextAlignment.CENTER);
    goldText.enableOutline = true;
    goldText.outlineColor = rgba(24, 14, 6, 255);
    goldText.outlineWidth = 2;
    LobbyGuardBattleRenderer.hudCharCache(goldText, true);
    const settingsBtn = this.host.addChildPlainNode(hud, 'GuardSettingsButton', width / 2 - 82, height / 2 - 20 - pillH / 2, 42, 42);
    this.mountSprite(settingsBtn, 'Img', 'ui/battle/ai/ghud_btn_settings/spriteFrame', 0, 0, 42, 42);
    this.host.applyImageButtonFeedback(settingsBtn);
    settingsBtn.on(Node.EventType.TOUCH_END, () => this.openBattleSettings(), this);
    const closeBtn = this.host.addChildPlainNode(hud, 'GuardCloseButton', width / 2 - 34, height / 2 - 20 - pillH / 2, 42, 42);
    this.mountSprite(closeBtn, 'Img', 'ui/battle/ai/ghud_btn_close/spriteFrame', 0, 0, 42, 42);
    this.host.applyImageButtonFeedback(closeBtn);
    // 2026-09-24:× 不再一点就走,战斗进行中先弹退出确认(已结束/未开战直接返回)。
    closeBtn.on(Node.EventType.TOUCH_END, () => this.requestExitBattle(), this);
    // 次级信息:下一波预告(右)/波次轨道(标准模式)
    this.host.addChildLabel(hud, 'GuardPreviewText', '', width / 2 - 250, height / 2 - 26 - pillH - 16, 15, rgba(255, 190, 150, 240), new Size(440, 20), HorizontalTextAlignment.RIGHT);
    const track = this.host.addChildPlainNode(hud, 'GuardWaveTrack', 0, height / 2 - 16 - bannerH - 14, 320, 14);
    track.addComponent(Graphics);
    // 2026-10-10 全界面巡检:原来居中横跨下排格子(手机字号抬到 20 后压在格子上);挪到下排格子与「强化」钮之间的空档,文案收短
    const hintText = this.host.addChildLabel(hud, 'GuardHintText', '同名同星英雄可合成 · 拖到水晶出售', width * 0.07, -height / 2 + 16, 15, rgba(196, 180, 150, 200), new Size(width * 0.26, 21));
    hintText.overflow = Label.Overflow.SHRINK;
  }

  /**
   * 输出贡献统计面板(2026-09-14 用户参考图重排):标题色带 + 每行「头像 · 名字 · 伤害值 · 占比横条」,伤害降序。
   * 行集合/顺序不变时只刷数值与横条(头像与骨骼不重建);变了才整体重建。开着时最快 0.5s 刷一次。
   */
  private refreshStatsPanel(force: boolean): void {
    const hud = this.root?.getChildByName('GuardHud');
    const sim = this.sim;
    if (!hud) {
      return;
    }
    const existing = hud.getChildByName('GuardStatsPanel');
    if (!this.statsPanelOpen || !sim) {
      if (existing) {
        existing.destroy();
      }
      this.statsPanelSignature = '';
      return;
    }
    const now = Date.now();
    if (!force && existing && now - this.lastStatsRefreshMs < 500) {
      return;
    }
    this.lastStatsRefreshMs = now;
    const entries = Object.entries(sim.heroDamage)
      .map(([heroCode, damage]) => {
        const pool = sim.pool.find((entry) => entry.heroCode === heroCode);
        return {
          heroCode,
          name: pool?.displayName ?? heroCode,
          rarity: (pool?.rarity ?? 'R').toUpperCase(),
          ally: this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null,
          damage,
        };
      })
      .sort((a, b) => b.damage - a.damage)
      .slice(0, 8);
    const maxDamage = Math.max(1, entries[0]?.damage ?? 1);
    const signature = entries.map((entry) => entry.heroCode).join('|') || '-';
    if (existing && existing.isValid && signature === this.statsPanelSignature && !this.statsAvatarPending) {
      this.updateStatsPanelRows(existing, entries, maxDamage);
      return;
    }
    this.statsAvatarPending = false;
    if (existing) {
      existing.destroy();
    }
    this.statsPanelSignature = signature;

    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const hpW = Math.min(390, width * 0.29);
    const hpH = hpW * (105 / 632);
    const panelTop = height / 2 - 20 - hpH - 14 - 44;
    const panelW = 340;
    const headerH = 42;
    const rowH = 60;
    const pad = 12;
    const avatar = 46;
    const panelH = headerH + (entries.length === 0 ? 48 : entries.length * rowH) + pad;
    const panel = this.host.addChildPlainNode(hud, 'GuardStatsPanel', -width / 2 + 16 + panelW / 2, panelTop - panelH / 2, panelW, panelH);
    const pg = panel.addComponent(Graphics);
    pg.fillColor = rgba(10, 8, 7, 228);
    pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
    pg.fill();
    pg.strokeColor = rgba(190, 150, 84, 200);
    pg.lineWidth = 1.4;
    pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
    pg.stroke();
    // 标题色带:参考图是整条独立色带压在面板顶部;本作配色用暗金,底角补方
    const header = this.host.addChildPlainNode(panel, 'Header', 0, panelH / 2 - headerH / 2, panelW, headerH);
    const hg = header.addComponent(Graphics);
    hg.fillColor = rgba(128, 88, 34, 240);
    hg.roundRect(-panelW / 2, -headerH / 2, panelW, headerH, 12);
    hg.fill();
    hg.rect(-panelW / 2, -headerH / 2, panelW, 14);
    hg.fill();
    hg.strokeColor = rgba(232, 190, 110, 160);
    hg.lineWidth = 1;
    hg.moveTo(-panelW / 2 + 10, -headerH / 2 + 0.5);
    hg.lineTo(panelW / 2 - 10, -headerH / 2 + 0.5);
    hg.stroke();
    const title = this.host.addChildLabel(header, 'Title', '我方贡献统计', 0, 0, 19, rgba(255, 236, 190, 255), new Size(panelW - 20, 26));
    title.enableOutline = true;
    title.outlineColor = rgba(40, 24, 8, 255);
    title.outlineWidth = 2;
    if (entries.length === 0) {
      this.host.addChildLabel(panel, 'Empty', '暂无输出记录', 0, -headerH / 2 - 2, 15, rgba(196, 182, 152, 220), new Size(panelW - 20, 21));
      return;
    }
    const nameX = -panelW / 2 + pad + avatar + 12;
    const rightX = panelW / 2 - pad;
    const barW = rightX - nameX;
    entries.forEach((entry, index) => {
      const rowTop = panelH / 2 - headerH - 4 - rowH * index;
      const rowCy = rowTop - rowH / 2;
      if (index > 0) {
        pg.strokeColor = rgba(255, 236, 200, 22);
        pg.lineWidth = 1;
        pg.moveTo(-panelW / 2 + pad, rowTop + 2);
        pg.lineTo(panelW / 2 - pad, rowTop + 2);
        pg.stroke();
      }
      // 头像:圆角方框 + 内容(有头像图直接贴;无图挂小骨骼露头)
      const frame = this.host.addChildPlainNode(panel, `Avatar_${index}`, -panelW / 2 + pad + avatar / 2, rowCy, avatar, avatar);
      const fg = frame.addComponent(Graphics);
      fg.fillColor = rgba(28, 22, 18, 255);
      fg.roundRect(-avatar / 2, -avatar / 2, avatar, avatar, 8);
      fg.fill();
      this.mountStatsAvatar(frame, entry, avatar - 6);
      const ring = this.host.addChildPlainNode(frame, 'Ring', 0, 0, avatar, avatar);
      const rg = ring.addComponent(Graphics);
      rg.strokeColor = rgba(214, 168, 92, 230);
      rg.lineWidth = 1.6;
      rg.roundRect(-avatar / 2, -avatar / 2, avatar, avatar, 8);
      rg.stroke();
      // addChildLabel 对 LEFT/RIGHT 对齐把 x 当作左/右边界(工厂内部再偏移半宽),这里直接传边界(2026-09-14 用户反馈名字跑中间)。
      const name = this.host.addChildLabel(panel, `Name_${index}`, entry.name, nameX, rowCy + 12, 17, rgba(240, 230, 204, 250), new Size(barW - 112, 24), HorizontalTextAlignment.LEFT);
      name.overflow = Label.Overflow.SHRINK;
      const value = this.host.addChildLabel(panel, `Value_${index}`, this.formatDamageValue(entry.damage), rightX, rowCy + 12, 17, rgba(255, 214, 120, 255), new Size(108, 24), HorizontalTextAlignment.RIGHT);
      value.enableOutline = true;
      value.outlineColor = rgba(12, 8, 6, 255);
      value.outlineWidth = 2;
      const bar = this.host.addChildPlainNode(panel, `Bar_${index}`, nameX + barW / 2, rowCy - 13, barW, 9);
      bar.addComponent(Graphics);
      this.paintStatsBar(bar, entry.damage / maxDamage);
    });
  }

  /** 统计面板轻量刷新:只改数值文本与横条占比,节点树不动。 */
  private updateStatsPanelRows(panel: Node, entries: Array<{ damage: number }>, maxDamage: number): void {
    entries.forEach((entry, index) => {
      const value = panel.getChildByName(`Value_${index}`)?.getComponent(Label);
      if (value) {
        value.string = this.formatDamageValue(entry.damage);
      }
      const bar = panel.getChildByName(`Bar_${index}`);
      if (bar && bar.isValid) {
        this.paintStatsBar(bar, entry.damage / maxDamage);
      }
    });
  }

  /** 占比横条:深色轨 + 橙色填充(参考图橙条),圆角,最短保留一个圆头。 */
  private paintStatsBar(bar: Node, ratio: number): void {
    const g = bar.getComponent(Graphics);
    const w = bar.getComponent(UITransform)?.width ?? 0;
    if (!g || w <= 0) {
      return;
    }
    const h = 9;
    g.clear();
    g.fillColor = rgba(46, 36, 26, 225);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    g.fillColor = rgba(255, 150, 46, 248);
    g.roundRect(-w / 2, -h / 2, Math.max(h, w * Math.max(0, Math.min(1, ratio))), h, h / 2);
    g.fill();
  }

  /**
   * 统计行头像:有名英雄用 result_portrait 方形头像;SR/R(act 系)没有头像图,
   * 在圆形遮罩窗口里挂一个放大的骨骼、把脚底压到窗口下方使头部落进窗口(不动素材,纯显示裁切);
   * 骨骼到位前先显示稀有度色底 + 名字首字(loadSpineInto 成功后会销毁该占位)。
   */
  /** 把名册立绘裁成头像贴进 size×size 的圆角窗口;图没读到 / 没有裁切表返回 false。 */
  private mountHeadCrop(parent: Node, artPath: string, size: number): boolean {
    // 裁切表与切帧逻辑在 HeroHeadCrop(挑战弹窗共用)
    const crop = heroHeadCropOf(artPath);
    if (!crop) {
      return false;
    }
    const clip = this.host.addChildPlainNode(parent, 'HeadClip', 0, 0, size, size);
    const mask = clip.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_STENCIL;
    const mg = clip.getComponent(Graphics) ?? clip.addComponent(Graphics);
    mg.roundRect(-size / 2, -size / 2, size, size, 7);
    mg.fill();
    const sprite = this.host.addSprite('Img', `${artPath}/spriteFrame`, 0, 0, size, size, clip);
    const sub = sprite?.spriteFrame ? buildHeroHeadCropFrame(sprite.spriteFrame, crop) : null;
    if (!sprite || !sub) {
      clip.destroy();
      return false;
    }
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = sub;
    sprite.node.getComponent(UITransform)?.setContentSize(size, size);
    return true;
  }

  private mountStatsAvatar(parent: Node, entry: { name: string; rarity: string; ally: BattlePresentationUnitSnapshot | null }, size: number): void {
    // 2026-10-15 用户「其他界面的头像也统一换成新生成的」:有 GPT 生成头像的一律用它(进游戏 / 进战斗已预读;
    // 万一还没到,先垫首字底,图到了盖上来)
    const heroCode = entry.ally?.heroCode ?? entry.ally?.unitKey ?? null;
    if (resolveHeroAvatarPath(heroCode)) {
      this.mountInitialFallback(parent, entry, size);
      mountHeroAvatar(parent, heroCode, size, 'round', () => parent.getChildByName('Fallback')?.destroy());
      return;
    }
    const portrait = resolveC1812HeroResultPortraitPath(entry.ally?.spineAsset ?? entry.ally?.portraitAsset);
    if (portrait) {
      this.mountSprite(parent, 'Img', portrait, 0, 0, size, size);
      return;
    }
    // 2026-10-11 用户「统计里的头像弄成静态图」:SR/R(act 系)没有头像图的,用名册立绘裁头部;图未就绪再退首字底(不再挂小骨骼)
    const cardArt = resolveHeroCardArtPath(entry.ally?.heroCode ?? entry.ally?.unitKey ?? null);
    if (cardArt) {
      if (this.mountHeadCrop(parent, cardArt, size)) {
        return;
      }
      // 立绘还没到:先画首字底,下一次刷新(≥500ms 后)重建行,图到了就换成头像
      this.statsAvatarPending = true;
    }
    this.mountInitialFallback(parent, entry, size);
    // (旧版此处在圆形遮罩窗口里挂放大的骨骼露头;2026-10-11 改静态图后不再需要)
  }

  /** 头像未就绪时的占位:稀有度色底 + 名字首字。 */
  private mountInitialFallback(parent: Node, entry: { name: string; rarity: string }, size: number): void {
    const fallback = this.host.addChildPlainNode(parent, 'Fallback', 0, 0, size, size);
    const fg = fallback.addComponent(Graphics);
    const tint = GUARD_RARITY_TINT[entry.rarity] ?? rgba(90, 80, 70, 255);
    fg.fillColor = rgba(tint.r, tint.g, tint.b, 255);
    fg.roundRect(-size / 2, -size / 2, size, size, 7);
    fg.fill();
    const initial = this.host.addChildLabel(fallback, 'Initial', entry.name.slice(0, 1), 0, 0, Math.round(size * 0.5), rgba(255, 246, 226, 252), new Size(size, size));
    initial.enableOutline = true;
    initial.outlineColor = rgba(10, 8, 6, 255);
    initial.outlineWidth = 2;
  }

  private refreshWaveTrack(): void {
    const sim = this.sim;
    const hud = this.root?.getChildByName('GuardHud');
    const track = hud?.getChildByName('GuardWaveTrack');
    const g = track?.getComponent(Graphics);
    if (!sim || !track || !g) {
      return;
    }
    const trackW = 320;
    // rush(车轮战)无固定波数,轨道让位给层数文案。
    if (sim.mode === 'rush') {
      g.clear();
      return;
    }
    // 波数没变不重画(2026-10-10 长帧归因:原先每 tick 清掉重铺 10 个圆点 + 轨道线)
    if (this.sameDrawKey(track, `${sim.wave}:${sim.maxWave}`)) {
      return;
    }
    const step = trackW / (sim.maxWave - 1);
    g.clear();
    g.strokeColor = rgba(120, 96, 60, 200);
    g.lineWidth = 2;
    g.moveTo(-trackW / 2, 0);
    g.lineTo(trackW / 2, 0);
    g.stroke();
    for (let wave = 1; wave <= sim.maxWave; wave += 1) {
      const x = -trackW / 2 + (wave - 1) * step;
      const isElite = wave % 5 === 0 && wave % 10 !== 0;
      const isBoss = wave % 10 === 0;
      const reached = sim.wave >= wave;
      const radius = isBoss ? 7 : isElite ? 6 : 4;
      g.fillColor = isBoss
        ? (reached ? rgba(240, 80, 60, 255) : rgba(120, 46, 40, 235))
        : isElite
          ? (reached ? rgba(255, 170, 80, 255) : rgba(120, 86, 46, 235))
          : (reached ? rgba(255, 214, 110, 255) : rgba(70, 58, 44, 235));
      g.circle(x, 0, radius);
      g.fill();
    }
  }

  private refreshHud(): void {
    const root = this.root;
    const sim = this.sim;
    if (!root || !sim) {
      return;
    }
    const hud = root.getChildByName('GuardHud');
    if (!hud) {
      return;
    }
    if (this.paintedCellsKey !== `${sim.unlockedCells}:${this.nextCellUnlockNeed(sim)}`) {
      this.repaintFieldBase();
    }
    // 水晶生命(水晶头顶胶囊条):深底 + 金边 + 蓝色填充(≤35% 变红)+ 数值居中
    const hpBar = this.fieldNode?.getChildByName('GuardCrystalHpBar');
    const hpTransform = hpBar?.getComponent(UITransform);
    const hpGraphics = hpBar?.getComponent(Graphics);
    const hpRatio = Math.max(0, sim.crystalHp / sim.crystalMaxHp);
    const hpKey = `${Math.ceil(sim.crystalHp)}/${sim.crystalMaxHp}`;
    if (hpBar && hpTransform && hpGraphics && this.crystalHpPaintedKey !== hpKey) {
      this.crystalHpPaintedKey = hpKey;
      const w = hpTransform.width;
      const h = hpTransform.height;
      const r = h / 2;
      hpGraphics.clear();
      hpGraphics.fillColor = rgba(8, 12, 22, 230);
      hpGraphics.roundRect(-w / 2, -h / 2, w, h, r);
      hpGraphics.fill();
      const inset = h <= 10 ? 1.5 : 3;
      const fillW = Math.max(r, (w - inset * 2) * hpRatio);
      hpGraphics.fillColor = hpRatio > 0.35 ? rgba(70, 165, 255, 250) : rgba(240, 86, 66, 250);
      hpGraphics.roundRect(-w / 2 + inset, -h / 2 + inset, fillW, h - inset * 2, r - inset);
      hpGraphics.fill();
      hpGraphics.fillColor = hpRatio > 0.35 ? rgba(190, 230, 255, 90) : rgba(255, 190, 170, 90);
      hpGraphics.roundRect(-w / 2 + inset, 0, fillW, h / 2 - inset, r - inset);
      hpGraphics.fill();
      hpGraphics.strokeColor = h <= 10 ? rgba(200, 214, 232, 120) : rgba(214, 170, 96, 235);
      hpGraphics.lineWidth = h <= 10 ? 1 : 1.5;
      hpGraphics.roundRect(-w / 2, -h / 2, w, h, r);
      hpGraphics.stroke();
    }
    const hpText = hpBar?.getChildByName('GuardCrystalHpText')?.getComponent(Label);
    if (hpText) {
      const hpString = sim.mode === 'raid' ? `${formatInt(Math.ceil(sim.crystalHp))} / ${formatInt(sim.crystalMaxHp)}` : `${Math.ceil(sim.crystalHp)} / ${sim.crystalMaxHp}`;
      if (hpText.string !== hpString) {
        hpText.string = hpString;
      }
    }
    const waveText = hud.getChildByName('GuardTopBanner')?.getChildByName('GuardWaveText')?.getComponent(Label);
    if (waveText && sim.mode !== 'raid') {
      // 掠夺模式这行由 GuardRaidController 写计时
      if (sim.mode === 'rush') {
        const leftSec = Math.max(0, Math.ceil((GUARD_RUSH_TIME_LIMIT_MS - sim.timeMs) / 1000));
        waveText.string = `车轮战 层数 ${guardTrialLayers(sim)} · BOSS×${sim.bossKills} · 剩余 ${Math.floor(leftSec / 60)}:${String(leftSec % 60).padStart(2, '0')}`;
      } else {
        waveText.string = sim.phase === 'prep'
          ? (sim.wave === 0 ? '首波来袭倒计时…' : `第 ${sim.wave}/${sim.maxWave} 波已清 · 备战中`)
          : `第 ${sim.wave}/${sim.maxWave} 波${sim.wave === sim.maxWave ? ' · BOSS!' : sim.wave % 10 === 0 ? ' · BOSS 节拍!' : ''}`;
      }
    }
    const goldText = hud.getChildByName('GuardGoldPill')?.getChildByName('GuardGoldText')?.getComponent(Label);
    if (goldText) {
      if (this.displayedGold < 0) {
        this.displayedGold = sim.gold;
      }
      const diff = sim.gold - this.displayedGold;
      if (diff !== 0) {
        const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
        this.displayedGold = Math.abs(step) >= Math.abs(diff) ? sim.gold : this.displayedGold + step;
      }
      goldText.string = `${this.displayedGold}`;
    }
    const summonCost = this.root?.getChildByName('GuardSummonButton')?.getChildByName('GuardSummonCost')?.getComponent(Label);
    if (summonCost) {
      // 2026-10-11 用户:召唤钮只显示当前所需金币
      summonCost.string = `${guardCurrentSummonCost(sim)}`;
    }
    this.refreshWaveTrack();
    this.refreshStatsPanel(false);
    const previewText = hud.getChildByName('GuardPreviewText')?.getComponent(Label);
    if (previewText) {
      if (sim.phase === 'prep' && sim.nextWaveSpawns) {
        const kindNames: Record<string, string> = { normal: '小怪', fast: '快速', tank: '肉盾', flying: '翼魔', shooter: '远程', elite: '精英', boss: 'BOSS' };
        const summary = guardSummarizeSpawns(sim.nextWaveSpawns);
        previewText.string = '下一波: ' + Object.entries(summary).map(([kind, count]) => `${kindNames[kind] ?? kind}×${count}`).join(' ');
      } else {
        previewText.string = '';
      }
    }
    const enhanceDesc = this.root?.getChildByName('GuardEnhanceButton')?.getChildByName('GuardEnhanceDesc')?.getComponent(Label);
    const enhanceCost = this.root?.getChildByName('GuardEnhanceButton')?.getChildByName('GuardEnhanceCost')?.getComponent(Label);
    const nextEnhanceCost = guardEnhanceNextCost(sim);
    if (enhanceDesc) {
      // 金卡概率公示:与 guardEnhance 内判定同一个函数、同一时点(docs/32 §4.3)。
      const gold = guardGoldCardChance(sim);
      // 按钮内文字区很窄:有金卡候选时只显示概率(玩家最关心的数),否则显示第几次。
      const goldText = !gold.available ? '' : gold.forced ? '大招必出!' : `大招 ${Math.round(gold.chance * 100)}%`;
      // 2026-10-11 用户:中间「第 n 次」一行移除;只在有金卡概率 / 已选满时才显示中间行
      enhanceDesc.string = nextEnhanceCost === null ? '战术卡已选满' : goldText || this.nextFreeEnhanceHint(sim, nextEnhanceCost);
      // 中间行为空时金币数上提到中线,按钮不留空洞
      const enhanceCostNode = enhanceCost?.node;
      if (enhanceCostNode) {
        const parentH = enhanceCostNode.parent?.getComponent(UITransform)?.height ?? 0;
        enhanceCostNode.setPosition(enhanceCostNode.position.x, enhanceDesc.string ? -parentH * 0.3 : -parentH * 0.17, 0);
      }
      enhanceDesc.color = gold.available && gold.forced ? rgba(255, 220, 120, 255) : rgba(232, 214, 180, 240);
    }
    if (enhanceCost) {
      enhanceCost.string = nextEnhanceCost === null ? '—' : nextEnhanceCost === 0 ? `免费 ×${sim.freeEnhance}` : `${nextEnhanceCost}`;
      enhanceCost.color = nextEnhanceCost === 0 ? rgba(150, 255, 170, 255) : rgba(255, 214, 110, 250);
    }
    const freeBadge = this.root?.getChildByName('GuardEnhanceButton')?.getChildByName('GuardEnhanceFreeBadge');
    if (freeBadge) {
      freeBadge.active = sim.freeEnhance > 0 && nextEnhanceCost !== null;
    }
    this.refreshCrystalSkillButton();
  }

  /** 战术按钮中间行:没有金卡概率可显示时,提示下一次免费战术在第几波后送(docs/45 §9);付费阶段才提示,已有免费次数不提示。 */
  private nextFreeEnhanceHint(sim: GuardBattleState, nextCost: number): string {
    if (nextCost === 0 || sim.mode !== 'standard') {
      return '';
    }
    const next = guardFreeEnhanceWaves(sim.maxWave).find((wave) => (sim.phase === 'prep' ? wave > sim.wave : wave >= sim.wave));
    return next ? `${next}波后免费` : '';
  }

  // ── P2:战术按钮(素材版,与招募争夺金币) ──
  private renderEnhanceButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const w = Math.min(236, width * 0.18);
    const h = w * (234 / 510);
    const summonW = Math.min(264, width * 0.2);
    const summonH = summonW * (236 / 560);
    // 窄屏(4:3 / 16:9 手机)右下整组按钮等比缩小到不压英雄格,节点内部仍按原尺寸绘制(bottomHudScale)
    const s = this.bottomHudScale();
    const button = this.host.addChildPlainNode(root, 'GuardEnhanceButton', width / 2 - 24 - (summonW + 16) * s - w * s / 2, -height / 2 + 18 + summonH * s / 2, w, h);
    button.setScale(s, s, 1);
    this.mountSprite(button, 'Art', 'ui/battle/ai/ghud_btn_enhance/spriteFrame', 0, 0, w, h);
    this.host.applyImageButtonFeedback(button);
    const title = this.host.addChildLabel(button, 'GuardEnhanceLabel', '战术', w * 0.1, h * 0.2, 22, rgba(255, 238, 190, 252), new Size(w * 0.6, 26));
    title.enableOutline = true;
    title.outlineColor = rgba(20, 12, 6, 255);
    title.outlineWidth = 2;
    LobbyGuardBattleRenderer.hudCharCache(title, true);
    const desc = this.host.addChildLabel(button, 'GuardEnhanceDesc', '', w * 0.14, -h * 0.08, 15, rgba(232, 214, 180, 240), new Size(w * 0.54, 16));
    desc.overflow = Label.Overflow.SHRINK;
    const cost = this.host.addChildLabel(button, 'GuardEnhanceCost', '', w * 0.1, -h * 0.3, 16, rgba(255, 214, 110, 250), new Size(w * 0.6, 20));
    cost.enableOutline = true;
    cost.outlineColor = rgba(24, 14, 6, 255);
    cost.outlineWidth = 2;
    LobbyGuardBattleRenderer.hudCharCache(cost, true);
    // 免费强化角标(波末赠送,docs/32 §2.2):按钮右上角绿点 + 呼吸缩放。
    const badge = this.host.addChildPlainNode(button, 'GuardEnhanceFreeBadge', w * 0.4, h * 0.36, 44, 22);
    const bg = badge.addComponent(Graphics);
    bg.fillColor = rgba(40, 150, 80, 250);
    bg.roundRect(-22, -11, 44, 22, 11);
    bg.fill();
    bg.strokeColor = rgba(200, 255, 210, 250);
    bg.lineWidth = 1.6;
    bg.roundRect(-22, -11, 44, 22, 11);
    bg.stroke();
    this.host.addChildLabel(badge, 'Text', '免费', 0, 0, 13, rgba(240, 255, 240), new Size(40, 16));
    badge.active = false;
    tween(badge).repeatForever(tween<Node>().to(0.5, { scale: new Vec3(1.14, 1.14, 1) }).to(0.5, { scale: new Vec3(1, 1, 1) })).start();
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim) {
        return;
      }
      const blocked = guardEnhanceBlocked(sim);
      if (blocked === 'gold') {
        this.host.setStatus(`战斗金币不足,战术需要 ${guardEnhanceNextCost(sim) ?? 0}。`);
        return;
      }
      if (blocked === 'capped') {
        this.host.setStatus('本局战术卡已选满。');
        return;
      }
      if (blocked) {
        return;
      }
      if (guardEnhance(sim)) {
        gameAudio.sfx('ui_click');
        this.host.setStatus(`战术 ×${sim.enhanceLevel}:选择一张战术卡`);
      }
    }, this);
  }

  // ── P2:水晶技能(素材圆钮+能量条;CD 进度映射为能量 0..300) ──
  private renderCrystalSkillButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    // 2026-09-02 用户拍板:水晶技能先隐藏(机制保留,后续再放出)
    if (GUARD_CRYSTAL_SKILL_HIDDEN) {
      return;
    }
    const height = this.layoutHeight;
    const size = 96;
    const button = this.host.addChildPlainNode(root, 'GuardCrystalSkillButton', -this.layoutWidth / 2 + 34 + size / 2, -height / 2 + 66 + size / 2, size, size);
    this.mountSprite(button, 'Art', 'ui/battle/ai/ghud_btn_skill/spriteFrame', 0, 0, size, size * (271 / 273));
    this.host.applyImageButtonFeedback(button);
    const label = this.host.addChildLabel(button, 'GuardCrystalSkillLabel', '水晶技能', 0, -size / 2 - 14, 16, rgba(200, 232, 255, 250), new Size(110, 22));
    label.enableOutline = true;
    label.outlineColor = rgba(10, 16, 28, 255);
    label.outlineWidth = 2;
    const pillW = 132;
    const pillH = pillW * (71 / 239);
    const pill = this.host.addChildPlainNode(root, 'GuardCrystalEnergy', -this.layoutWidth / 2 + 34 + size + 14 + pillW / 2, -height / 2 + 66 + size * 0.32, pillW, pillH);
    this.mountSprite(pill, 'Img', 'ui/battle/ai/ghud_energy_pill/spriteFrame', 0, 0, pillW, pillH);
    const energy = this.host.addChildLabel(pill, 'Text', '', pillW * 0.08, 1, 16, rgba(150, 214, 255, 252), new Size(pillW * 0.7, 22));
    energy.enableOutline = true;
    energy.outlineColor = rgba(10, 16, 28, 255);
    energy.outlineWidth = 2;
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim) {
        return;
      }
      if (!guardUseCrystalSkill(sim)) {
        this.host.setStatus('水晶能量未满…');
      } else {
        this.shakeField(10);
      }
    }, this);
    this.refreshCrystalSkillButton();
  }

  private refreshCrystalSkillButton(): void {
    if (GUARD_CRYSTAL_SKILL_HIDDEN) {
      return;
    }
    const sim = this.sim;
    const button = this.root?.getChildByName('GuardCrystalSkillButton');
    if (!sim || !button) {
      return;
    }
    const ready = guardCrystalSkillReady(sim);
    const remain = Math.max(0, sim.crystalSkillReadyMs - sim.timeMs);
    const frac = ready ? 1 : 1 - remain / GUARD_CRYSTAL_SKILL_CD_MS;
    const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
    opacity.opacity = ready ? 255 : 150;
    const energy = this.root?.getChildByName('GuardCrystalEnergy')?.getChildByName('Text')?.getComponent(Label);
    if (energy) {
      energy.string = `${Math.round(frac * 300)} / 300`;
    }
  }

  private shakeField(amplitude: number): void {
    const field = this.fieldNode;
    if (!field || !field.isValid || !this.shakeEnabled) {
      return;
    }
    const base = new Vec3(field.position.x, field.position.y, field.position.z);
    tween(field)
      .to(0.05, { position: new Vec3(base.x + amplitude, base.y - amplitude * 0.5, base.z) })
      .to(0.06, { position: new Vec3(base.x - amplitude * 0.7, base.y + amplitude * 0.4, base.z) })
      .to(0.05, { position: base })
      .start();
    // 分层背景视差:近景跟着晃一半,远景不动(2026-11-10)
    const near = this.sceneNearNode;
    if (near && near.isValid) {
      const nb = new Vec3(0, this.sceneNearY, 0);
      const k = amplitude * 0.5;
      Tween.stopAllByTarget(near);
      tween(near)
        .to(0.05, { position: new Vec3(nb.x + k, nb.y - k * 0.5, 0) })
        .to(0.06, { position: new Vec3(nb.x - k * 0.7, nb.y + k * 0.4, 0) })
        .to(0.05, { position: nb })
        .start();
    }
  }

  private renderSummonButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    // 2026-09-02 用户拍板:恢复横向摆放(格子已收左 1/3,右下无冲突)
    const w = Math.min(264, width * 0.2);
    const h = w * (236 / 560);
    const s = this.bottomHudScale();
    const button = this.host.addChildPlainNode(root, 'GuardSummonButton', width / 2 - 24 - w * s / 2, -height / 2 + 18 + h * s / 2, w, h);
    button.setScale(s, s, 1);
    this.mountSprite(button, 'Art', 'ui/battle/ai/ghud_btn_summon/spriteFrame', 0, 0, w, h);
    this.host.applyImageButtonFeedback(button);
    const title = this.host.addChildLabel(button, 'GuardSummonLabel', '招募', w * 0.08, h * 0.14, 28, rgba(255, 244, 210, 255), new Size(w * 0.6, 34));
    title.enableOutline = true;
    title.outlineColor = rgba(60, 26, 8, 255);
    title.outlineWidth = 3;
    LobbyGuardBattleRenderer.hudCharCache(title, true);
    // 2026-10-11 用户:只显示当前所需金币 → 字号 16→22,居中在标题下
    const cost = this.host.addChildLabel(button, 'GuardSummonCost', '', w * 0.08, -h * 0.22, 22, rgba(255, 224, 140, 250), new Size(w * 0.6, 28));
    cost.enableOutline = true;
    cost.outlineColor = rgba(50, 22, 8, 255);
    cost.outlineWidth = 2;
    LobbyGuardBattleRenderer.hudCharCache(cost, true);
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim) {
        return;
      }
      const unit = guardSummon(sim);
      if (!unit) {
        this.host.setStatus(sim.gold < sim.summonCost ? '战斗金币不足。' : '阵地已满,拖动相同英雄合成腾位。');
      } else {
        gameAudio.sfx('summon');
      }
    }, this);
  }

  /** 同一关卡已自动重发过开战的关卡码(只自动重发一次,再卡就给按钮)。 */
  private startStallRetriedFor = '';

  /**
   * 等待页卡死兜底(11-06 真人矿首进偶发停在「正在进入矿境…」:开战请求在途时流程被重置,回执按过期作废,
   * 之后既不在开战中、也没有回执和报错,页面再无任何出口)。空闲 4 秒仍是这个状态:第一次自动重发开战,
   * 之后显示「重新进入 / 返回」。正常流程里这个空闲窗口只有拉名册的几百毫秒,不会触发。
   */
  private armStartStallGuard(root: Node, stageCode: string, width: number, height: number): void {
    setTimeout(() => {
      if (!root.isValid) {
        return;
      }
      const state = this.host.currentLobbyBattleState();
      if (state.start || state.starting || state.error || state.stageCode !== stageCode) {
        return;
      }
      if (this.host.retryLobbyBattleStart && this.startStallRetriedFor !== stageCode) {
        this.startStallRetriedFor = stageCode;
        console.warn(`[LootChain] battle start stalled, retry ${stageCode}`);
        this.host.retryLobbyBattleStart();
        return;
      }
      this.renderExitButton(root, width, height);
      if (this.host.retryLobbyBattleStart) {
        const retry = this.host.addChildPlainNode(root, 'GuardStartRetry', 0, -56, 200, 48);
        const g = retry.addComponent(Graphics);
        g.fillColor = rgba(43, 54, 65, 235);
        g.roundRect(-100, -24, 200, 48, 24);
        g.fill();
        g.strokeColor = rgba(160, 170, 184, 200);
        g.lineWidth = 1.5;
        g.roundRect(-100, -24, 200, 48, 24);
        g.stroke();
        this.host.addChildLabel(retry, 'Label', '重新进入', 0, 0, 20, rgba(242, 242, 242), new Size(180, 30));
        this.host.applyImageButtonFeedback(retry);
        retry.on(Node.EventType.TOUCH_END, () => this.host.retryLobbyBattleStart?.(), this);
      }
    }, 4000);
  }

  private renderExitButton(parent: Node, width: number, height: number): void {
    const button = this.host.addChildPlainNode(parent, 'GuardExitButton', width / 2 - 34, height / 2 - 34, 44, 44);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(20, 14, 12, 220);
    g.circle(0, 0, 20);
    g.fill();
    g.strokeColor = rgba(214, 178, 110, 220);
    g.lineWidth = 1.8;
    g.circle(0, 0, 20);
    g.stroke();
    this.host.addChildLabel(button, 'GuardExitGlyph', '×', 0, 1, 24, rgba(238, 218, 180), new Size(40, 40));
    this.host.applyImageButtonFeedback(button);
    button.on(Node.EventType.TOUCH_END, () => this.host.returnToLobbyFromBattlePreview(), this);
  }

  // ── 主循环 ──
  /** 首战引导:箭头+气泡指向召唤按钮(素材缺图时程序绘制兜底)。 */
  private mountFirstBattleGuide(root: Node, layout: UiLayout): void {
    const summonBtn = root.getChildByName('GuardSummonButton');
    if (!summonBtn) {
      return;
    }
    const holder = this.host.addChildPlainNode(root, 'GuardGuideHint', 0, 0, 10, 10);
    const bx = summonBtn.position.x;
    const by = summonBtn.position.y;
    const btnTf = summonBtn.getComponent(UITransform);
    const btnH = (btnTf?.height ?? 80) * summonBtn.scale.y;
    // 11-07 B 风格(原型 guide_bubble_b):香槟小三角 + 「零」头像气泡,替换旧金框雕花素材
    const pointerH = 30;
    const pointerW = 34;
    const pointerY = by + btnH / 2 + pointerH / 2 + 8;
    const pointer = mountGuideTriangle(this.host, holder, 'Pointer', bx, pointerY, pointerW, pointerH, 0);
    tween(pointer)
      .repeatForever(tween()
        .to(0.55, { position: new Vec3(bx, pointerY + 10, 0) })
        .to(0.55, { position: new Vec3(bx, pointerY, 0) }))
      .start();
    const bubbleH = 104;
    const bubbleW = Math.min(470, layout.width * 0.42);
    const avatarOver = bubbleH * GUIDE_BUBBLE_AVATAR_OVERHANG;
    const bubbleX = Math.max(-layout.width / 2 + bubbleW / 2 + avatarOver + 10, Math.min(layout.width / 2 - bubbleW / 2 - 10, bx));
    const bubbleY = pointerY + pointerH / 2 + bubbleH / 2 + 8;
    mountZeroGuideBubble(this.host, holder, 'Bubble', bubbleX, bubbleY, bubbleW, bubbleH, '点击【招募】放置英雄,守住水晶!');
  }

  /**
   * 冒险前 3 层局内引导(2026-10-25 策划审核 P1-22,docs/45 §15):第 1 层教合成、第 2 层教战术三选一(+出售)、
   * 第 3 层教法术(+首领读条集火打断)。只在首次挑战、非老玩家、该条没出过时出现;纯表现层,不碰 sim,复演不受影响。
   */
  private battleGuide: 'merge' | 'perk' | 'spell' | null = null;
  private battleGuidePhase = 0;
  private battleGuideHoldUntil = 0;

  private resolveBattleGuide(stageCode: string): 'merge' | 'perk' | 'spell' | null {
    const kind = stageCode === 'MAIN_1_1' ? 'merge' : stageCode === 'MAIN_1_2' ? 'perk' : stageCode === 'MAIN_1_3' ? 'spell' : null;
    if (!kind) {
      return null;
    }
    const flag = kind === 'merge' ? 'battleMerge' : kind === 'perk' ? 'battlePerk' : 'battleSpell';
    if (lobbyGuide.isDone(flag)) {
      return null;
    }
    // 已打过本层 / 冒险进度过第 5 层(老玩家)不出
    const cleared = LobbyGuardBattleRenderer.mainStageOrder(this.host.currentLobbyAdventureState?.()?.adventure?.maxCompletedStageCode ?? '');
    if (cleared >= LobbyGuardBattleRenderer.mainStageOrder(stageCode) || cleared >= 5) {
      return null;
    }
    return kind;
  }

  /** MAIN_c_s → 冒险层序(第 1 章 9 层,之后每章 16 层);非冒险关返回 0。 */
  private static mainStageOrder(stageCode: string): number {
    const match = /^MAIN_(\d+)_(\d+)$/.exec((stageCode || '').toUpperCase());
    if (!match) {
      return 0;
    }
    const chapter = Number(match[1]);
    const stage = Number(match[2]);
    return chapter <= 1 ? stage : 9 + (chapter - 2) * 16 + stage;
  }

  /** 引导提示:手指 + 气泡(复用首战召唤引导素材);anchor 为目标顶部(战场 root 坐标),无 anchor 时只出气泡(上方居中)。 */
  private mountGuideHint(name: string, text: string, anchor: { x: number; y: number } | null): void {
    const root = this.root;
    if (!root || root.getChildByName(name)) {
      return;
    }
    const layoutW = root.getComponent(UITransform)?.width ?? 1600;
    const layoutH = root.getComponent(UITransform)?.height ?? 900;
    const holder = this.host.addChildPlainNode(root, name, 0, 0, 10, 10);
    holder.setSiblingIndex(root.children.length - 1);
    // 11-07 B 风格「零」气泡(原型 guide_bubble_b)
    const bubbleH = 104;
    const bubbleW = Math.min(480, layoutW * 0.42);
    // 气泡固定在战场中部空地(不压顶部波次横幅 / 统计钮,也不盖住手指);手指单独指向目标
    const bubbleX = 0;
    const bubbleY = layoutH * 0.06;
    if (anchor) {
      const pointerH = 30;
      const pointerW = 34;
      const pointerY = Math.min(layoutH / 2 - 130, anchor.y + pointerH / 2 + 8);
      const pointer = mountGuideTriangle(this.host, holder, 'Pointer', anchor.x, pointerY, pointerW, pointerH, 0);
      tween(pointer)
        .repeatForever(tween()
          .to(0.55, { position: new Vec3(anchor.x, pointerY + 12, 0) })
          .to(0.55, { position: new Vec3(anchor.x, pointerY, 0) }))
        .start();
    }
    // 气泡居中偏右半个头像位,头像压在左沿外也居中
    mountZeroGuideBubble(this.host, holder, 'Bubble', bubbleX + bubbleH * GUIDE_BUBBLE_AVATAR_OVERHANG / 2, bubbleY, bubbleW, bubbleH, text);
  }

  private dropGuideHint(name: string): void {
    this.root?.getChildByName(name)?.destroy();
  }

  /** 每步推进局内引导(只读 sim)。 */
  private stepBattleGuide(sim: GuardBattleState): void {
    const guide = this.battleGuide;
    if (!guide || !this.root) {
      return;
    }
    const now = Date.now();
    if (guide === 'merge') {
      // 场上第一次出现同名同星两人:指向其中一人,合成出 2★ 后撤掉
      if (sim.heroes.some((hero) => hero.star >= 2)) {
        this.dropGuideHint('GuardGuideMerge');
        lobbyGuide.markVisited('battleMerge');
        this.battleGuide = null;
        return;
      }
      if (!this.root.getChildByName('GuardGuideMerge') && sim.heroes.length > 0 && !this.root.getChildByName('GuardGuideHint')) {
        const pair = sim.heroes.find((hero) => sim.heroes.some((other) => other.unitId !== hero.unitId && other.heroCode === hero.heroCode && other.star === hero.star));
        const view = pair ? this.heroViews.get(pair.unitId) : undefined;
        if (view && view.node.isValid) {
          this.mountGuideHint('GuardGuideMerge', '同名同星的英雄拖到一起合成,局内星级 +1!', { x: view.node.position.x, y: view.node.position.y + this.unitSize() * 0.9 });
        }
      }
      return;
    }
    if (guide === 'perk') {
      if (this.battleGuidePhase === 0 && sim.pendingChoice) {
        this.mountGuideHint('GuardGuidePerk', '守住一波送一次免费战术:三选一,挑一张!', null);
        this.battleGuidePhase = 1;
      } else if (this.battleGuidePhase === 1) {
        // 选择弹层盖在上面时把气泡提到最上层
        const node = this.root.getChildByName('GuardGuidePerk');
        node?.setSiblingIndex(this.root.children.length - 1);
        if (!sim.pendingChoice) {
          this.dropGuideHint('GuardGuidePerk');
          this.mountGuideHint('GuardGuideSell', '用不上的英雄拖到水晶上可以出售,换回金币', this.crystalGuideAnchor());
          this.battleGuidePhase = 2;
          this.battleGuideHoldUntil = now + 6000;
        }
      } else if (this.battleGuidePhase === 2 && now >= this.battleGuideHoldUntil) {
        this.dropGuideHint('GuardGuideSell');
        lobbyGuide.markVisited('battlePerk');
        this.battleGuide = null;
      }
      return;
    }
    // spell:能量第一次够放任一已带法术 → 指向法术栏;施放(或 10 秒)后撤;首领第一次读条提示集火打断
    if (this.battleGuidePhase === 0) {
      const affordable = sim.spellLoadout.some((id) => sim.unlockedSpells.indexOf(id) >= 0 && sim.spellEnergy >= (GUARD_SPELLS[id]?.cost ?? Number.MAX_SAFE_INTEGER));
      const bar = this.root.getChildByName('GuardSpellBar');
      if (affordable && bar) {
        const barH = bar.getComponent(UITransform)?.height ?? 120;
        this.mountGuideHint('GuardGuideSpell', '能量够了!按住法术拖到怪物群上施放', { x: bar.position.x, y: bar.position.y + barH / 2 });
        this.battleGuidePhase = 1;
        this.battleGuideHoldUntil = now + 10000;
      }
    } else if (this.battleGuidePhase === 1) {
      const cast = sim.inputs.some((input) => input.k === 'spell');
      if (cast || now >= this.battleGuideHoldUntil) {
        this.dropGuideHint('GuardGuideSpell');
        this.battleGuidePhase = 2;
      }
    } else if (this.battleGuidePhase === 2 && sim.bossCast) {
      const bossView = this.monsterViews.get(sim.bossCast.monsterId);
      if (bossView && bossView.node.isValid) {
        this.mountGuideHint('GuardGuideBoss', '首领在蓄力!点它集火,打断蓄力', { x: bossView.node.position.x, y: bossView.node.position.y + this.unitSize() * 1.6 });
        this.battleGuidePhase = 3;
        this.battleGuideHoldUntil = now + 6000;
      }
    } else if (this.battleGuidePhase === 3 && (now >= this.battleGuideHoldUntil || !sim.bossCast)) {
      this.dropGuideHint('GuardGuideBoss');
      lobbyGuide.markVisited('battleSpell');
      this.battleGuide = null;
    }
  }

  /** 水晶上方(出售引导指向)。 */
  private crystalGuideAnchor(): { x: number; y: number } | null {
    const center = this.crystalFxCenter();
    return { x: center.x, y: center.y + this.unitSize() * 1.2 };
  }

  private stepErrorShown = false;
  private perfStatsShown = false;

  private step(): void {
    const sim = this.sim;
    if (!sim || !this.isMounted()) {
      return;
    }
    // 固定步长累积器(2026-09-11 修:原写法 spent 从 0 起算,真实流逝 51ms 也会跑满 2 个
    // 子 tick=100ms 模拟时间,且不结转余数 → 模拟时间系统性快 1.5~2 倍,英雄出手频率随之偏快、
    // 攻击动画被反复打断重播,观感"动画播两次只掉一次血")。改为余数累积,模拟与真实严格一致。
    const now = Date.now();
    if (this.raid && this.raid.hitStopUntil > now) {
      // 打击顿帧(docs/47 P0):几十毫秒内模拟停住、画面不动,时间不累积
      this.lastTickWallMs = now;
      return;
    }
    const elapsed = Math.min(1000, Math.max(0, now - this.lastTickWallMs));
    this.lastTickWallMs = now;
    // 补算上限 MAX_CATCHUP_TICKS:一次长帧后不再集中补跑十几个 tick(事件 / 飘字 / 特效扎堆 → 下一次卡顿),多出的时间丢掉
    this.tickAccumulatorMs = Math.min(TICK_MS * (MAX_CATCHUP_TICKS + 1) - 1, this.tickAccumulatorMs + elapsed);
    let phase = sim.phase;
    let ticks = 0;
    // 本帧要补跑几个 tick:最后一个 tick 之前记下怪物位置,插值只走"最后一个 tick"这一段(2026-10-09 用户「怪物移动一卡一卡」:
    // 掉帧补跑 2~3 个 tick 时原先从 2~3 个 tick 前的位置插到现在,一个 tick 的时间走完几个 tick 的路 = 忽快忽慢往前窜)
    const runnable = Math.min(MAX_CATCHUP_TICKS, Math.floor(this.tickAccumulatorMs / TICK_MS));
    this.prevTickMonsterX.clear();
    while (this.tickAccumulatorMs >= TICK_MS && ticks < MAX_CATCHUP_TICKS && phase !== 'victory' && phase !== 'defeat') {
      if (ticks === runnable - 1 && runnable > 1) {
        for (const monster of sim.monsters) {
          this.prevTickMonsterX.set(monster.monsterId, monster.x);
        }
      }
      this.tickAccumulatorMs -= TICK_MS;
      this.raid?.beforeTick(sim);
      phase = guardTick(sim, TICK_MS);
      ticks += 1;
    }
    if (this.tickAccumulatorMs >= TICK_MS) {
      this.tickAccumulatorMs = TICK_MS - 1;
    }
    this.floatersThisStep = 0;
    this.raid?.afterTick(sim, sim.events);
    this.consumeEvents();
    for (const aim of this.guardFxAimers.values()) {
      aim();
    }
    // 首战引导:完成第一次召唤即撤掉提示(P1,2026-09-05)。
    if (sim.heroes.length > 0) {
      this.root?.getChildByName('GuardGuideHint')?.destroy();
    }
    this.stepBattleGuide(sim);
    this.syncHeroes();
    this.raid?.sync(sim);
    for (const playerView of this.raid?.playerViews() ?? []) {
      if (!this.monsterViews.has(playerView.monsterId)) {
        // 进攻方 / 同伴(docs/61)也登记进怪物视图表:守卫的弹道 / 斩击 / 技能特效才找得到目标(2026-10-25 用户「攻击弹道、特效都没了」)
        this.monsterViews.set(playerView.monsterId, playerView.view);
      }
    }
    this.syncResonance();
    this.syncMonsters();
    this.syncChests();
    this.syncPickups();
    this.syncZones();
    this.refreshCallWaveButton();
    this.refreshSpellBar();
    this.syncTraps();
    this.refreshTrapTray();
    this.syncBossCastBar();
    this.syncChoiceOverlay();
    this.refreshHud();
    if (phase === 'victory' || phase === 'defeat') {
      this.stopFrameLoop();
      this.showEndOverlay(phase === 'victory');
      if (!this.settleRequested) {
        this.settleRequested = true;
        // 本地掠夺原型(RAID_P0)不结算(覆盖层自带返回);服务端掠夺(docs/48)照常结算发奖
        if (sim.mode !== 'raid' || this.serverRaid) {
          setTimeout(() => this.host.settleLobbyBattleSession(), 700);
        }
      }
    }
  }

  private consumeEvents(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    for (const event of sim.events) {
      if (event.type === 'kill' && typeof event.monsterId === 'number') {
        const view = this.monsterViews.get(event.monsterId);
        if (view && view.node.isValid) {
          this.spawnFloater(view.node.position.x, view.node.position.y + this.unitSize() * 0.5, `+${event.amount ?? 0}`, rgba(255, 214, 92), 16, true);
          this.spawnGoldCoin(view.node.position.x, view.node.position.y);
          // 2026-09-12 用户反馈:击杀处的金环+星芒像"锁定准星",去掉;金币掉落表现保留。
        }
      } else if (event.type === 'crystalHit') {
        gameAudio.sfx('crystal_hit');
        // 2026-09-07 用户反馈:远程怪隔空扣血像"水晶自己掉血"——攻击者必须有出手表现。
        const attacker = typeof event.monsterId === 'number' ? sim.monsters.find((entry) => entry.monsterId === event.monsterId) : null;
        const attackerView = attacker ? this.monsterViews.get(attacker.monsterId) : null;
        this.playUnitAttack(attackerView ?? undefined);
        if (attacker?.kind === 'shooter' && attackerView && attackerView.node.isValid) {
          // 远程怪:出手动画 + 弹道飞向水晶,命中时(crystalTarget 弹道到达)才出红闪+飘字。
          // 2026-09-24:按皮肤配 fx_pack 骨骼弹道(弩矢尾焰 / 细箭 / 鬼火);未就绪或超限额回退暗红箭矢贴图。
          this.spawnCrystalBolt(attacker, attackerView, event.amount ?? 0);
        } else {
          // 近战啃咬:水晶即时红闪+飘字(sim 已扣血)。
          this.spawnFloater(this.xToPx(0), this.walkwayY() + this.layoutHeight * 0.14, `-${event.amount ?? 0}`, rgba(255, 120, 100));
          const crystalSprite = field.getChildByName('GuardCrystal')?.getChildByName('GuardCrystalIcon')?.getComponent(Sprite);
          if (crystalSprite && crystalSprite.isValid) {
            crystalSprite.color = rgba(255, 130, 110, 255);
            setTimeout(() => {
              if (crystalSprite.isValid) {
                crystalSprite.color = rgba(255, 255, 255, 255);
              }
            }, 130);
          }
        }
      } else if (event.type === 'summon') {
        // 召唤落位爆闪(2026-08-27 用户拍板)
        if (typeof event.cell === 'number') {
          const center = this.cellCenter(event.cell);
          this.spawnCastFlash(center.x, center.y - this.unitSize() * 0.2, this.unitSize() * 1.05);
        }
      } else if (event.type === 'superMerge' || event.type === 'merge') {
        // 合成爆闪(超阶更大+金色)
        if (typeof event.cell === 'number') {
          const center = this.cellCenter(event.cell);
          this.spawnCastFlash(center.x, center.y - this.unitSize() * 0.2, this.unitSize() * (event.type === 'superMerge' ? 1.9 : 1.5));
        }
        if (event.type === 'superMerge') {
          this.host.setStatus('矿脉共鸣!直升 2 星!');
          if (typeof event.cell === 'number') {
            const center = this.cellCenter(event.cell);
            this.spawnFloater(center.x, center.y + this.unitSize() * 0.6, '矿脉共鸣 +2★', rgba(255, 240, 160));
          }
        }
        // 首次跨过 2 星=解锁专属技能:横幅点明"解锁了什么"(2026-08-25 用户拍板)。
        if (event.skillUnlocked && typeof event.cell === 'number') {
          this.showSkillUnlockBanner(event.cell, event.heroCode ?? '');
        }
      } else if (event.type === 'bossSkill') {
        // BOSS 技能(2026-08-28):重踏=脚下冲击环+大震屏+水晶掉血;投射=暗弹从 BOSS 飞向水晶
        // 2026-09-24 用户反馈"BOSS 没有攻击动画、没有弹道":按皮肤播技能出手动作,伤害随弹道/冲击波到达水晶才出爆点与飘字。
        const bossView = typeof event.monsterId === 'number' ? this.monsterViews.get(event.monsterId) : null;
        const bossMonster = typeof event.monsterId === 'number' ? sim.monsters.find((entry) => entry.monsterId === event.monsterId) ?? null : null;
        const bx = bossView?.node.isValid ? bossView.node.position.x + this.bossVisualOffsetX(bossView) : this.xToPx(5);
        const by = bossView?.node.isValid ? bossView.node.position.y : this.walkwayY();
        this.playBossAnim(bossMonster, bossView ?? undefined, 'skill');
        this.spawnFloater(bx, by + this.unitSize() * 1.1, `${event.skillName ?? 'BOSS技能'}!`, rgba(255, 140, 90), 20);
        if (event.skillKind === 'volley') {
          const chestY = by + (bossMonster ? this.monsterHeadOffsetY(bossMonster) * 0.5 : this.unitSize() * 0.6);
          this.spawnBossCrystalProjectile(bx - this.unitSize() * 0.4, chestY, GUARD_BOSS_FX.volley, GUARD_BOSS_FX.volleyHit, event.amount ?? 0, { shake: 6, speedMult: 0.8 });
        } else {
          // 重踏:BOSS 脚下冲击环 + 震屏,贴地冲击波飞向水晶,到达才出爆点与飘字
          this.spawnCellBurst(bx, by - this.unitSize() * 0.5, rgba(255, 130, 70), true);
          this.shakeField(9);
          this.spawnBossCrystalProjectile(bx - this.unitSize() * 0.5, by - this.unitSize() * 0.25, GUARD_BOSS_FX.smashWave, GUARD_BOSS_FX.smashHit, event.amount ?? 0, { shake: 8, speedMult: 1.2 });
        }
      } else if (event.type === 'heroSkill') {
        // 主动技能(2★ 冷却制):施法动画+技能名飘字;近战/远程附专属特效打向首个目标
        const caster = sim.heroes.find((entry) => entry.heroCode === event.heroCode && entry.cell === event.cell);
        if (caster) {
          this.playUnitAttack(this.heroViews.get(caster.unitId));
        }
        // docs/32 §5.1 方案 A:未觉醒=通用"战技"(职业机制名 + 轻量表现);金卡觉醒后才喊专属大招名、播专属 Spine 特效。
        const awakened = (event.ultLv ?? 0) > 0;
        if (awakened) {
          // 大招身份(2026-10-01 用户:"大招不易被区分"):先压暗战场,之后挂的出手闪光 / 名牌 / 大招特效都在压暗层之上
          this.pulseUltDim();
        }
        if (typeof event.cell === 'number') {
          this.highlightCaster(event.cell, awakened ? `${this.resolveGuardSkillDisplayName(event.heroCode, event.skillName)}!` : `战技·${event.skillName ?? '出击'}`, awakened);
        }
        gameAudio.sfx(resolveHeroSkillSfxKey(event.heroCode), awakened ? 1 : 0.6);
        if (event.manual && typeof event.cell === 'number') {
          // docs/37 B:手动释放 +25%;两名英雄 1.5s 内先后手动释放 = 合击,再 ×1.3。
          const at = this.cellCenter(event.cell);
          this.spawnFloater(at.x, at.y + this.unitSize() * 1.5, event.chained ? '合击!伤害 ×1.6' : '手动释放 +25%', event.chained ? rgba(255, 150, 90) : rgba(255, 214, 92), event.chained ? 22 : 18);
          if (event.chained) {
            this.shakeField(5);
            gameAudio.sfx('level_up', 0.7);
          }
        }
        if (caster?.role === 'support' && typeof event.monsterId !== 'number') {
          // 圣辉涌泉(2026-09-24 用户反馈"辅助没有技能效果"):水晶金色圣光爆发 + 每个友军套金色光罩,持续到攻速增益结束。
          this.playSupportSurge(sim, caster, event.amount ?? 0);
        }
        const skillZone = typeof event.zoneId === 'number' ? sim.zones.find((entry) => entry.zoneId === event.zoneId) ?? null : null;
        if (skillZone && skillZone.kind === 'cyclone' && typeof event.cell === 'number') {
          // 旋风从施放英雄身上飞出落地(灼烧区 2026-09-12 起由技能特效本体在落点循环播放,不再画地面黄圈、不再飞行)
          const from = this.cellCenter(event.cell);
          this.zoneFlights.set(skillZone.zoneId, { fromX: from.x, fromY: from.y, startMs: sim.timeMs });
        }
        if (typeof event.monsterId === 'number' && event.heroCode) {
          const target = sim.monsters.find((entry) => entry.monsterId === event.monsterId);
          if (target && awakened) {
            const played = this.spawnGuardSkillFx(event.heroCode, caster?.cell ?? null, target, { monsterIds: event.monsterIds, zone: skillZone, area: typeof event.areaFromX === 'number' && typeof event.areaToX === 'number' ? { fromX: event.areaFromX, toX: event.areaToX } : undefined });
            if (!played) {
              // 大招名额满:除了金色保底弹,落点补金色冲击环;灼烧区画余烬环,不会什么都看不到
              this.spawnCellBurst(this.xToPx(target.x), this.monsterY(target.lane, target.x), rgba(255, 200, 90), true);
              if (skillZone && skillZone.kind === 'burn') {
                this.plainBurnZones.set(skillZone.zoneId, 0);
              }
            }
          } else if (target && caster) {
            // 战技(docs/29 v3):通用战技骨骼特效(近战横扫 / 远程灼烧区本体 / 控制旋风本体),被限流时回退技能弹 + 冲击环。
            const skillSpec = resolveHeroGuardSkillEffect(event.heroCode, caster.role);
            const played = this.spawnGuardSkillFx(event.heroCode, caster.cell, target, { monsterIds: event.monsterIds, zone: skillZone, spec: skillSpec, area: typeof event.areaFromX === 'number' && typeof event.areaToX === 'number' ? { fromX: event.areaFromX, toX: event.areaToX } : undefined });
            if (!played) {
              this.spawnCellBurst(this.xToPx(target.x), this.monsterY(target.lane, target.x), rgba(255, 190, 120), false);
              if (skillZone && skillZone.kind === 'burn') {
                this.plainBurnZones.set(skillZone.zoneId, 0);
              }
            }
          }
        } else if (awakened && caster && event.heroCode) {
          // 控制 / 辅助的技能事件不带 monsterId,此前觉醒后也从没播过专属大招骨骼(只有旋风贴图 / 圣辉涌泉),2026-10-01 补上:
          // 控制 = 大招跟着旋风区域爆一次;辅助 = 大招挂在施法者身上(小一档)。
          const center = this.cellCenter(caster.cell);
          let nearest: GuardMonster | null = null;
          for (const entry of sim.monsters) {
            if (!entry.dead && (!nearest || entry.x < nearest.x)) {
              nearest = entry;
            }
          }
          let played = false;
          if (skillZone && skillZone.kind === 'cyclone') {
            played = this.spawnGuardSkillFx(event.heroCode, caster.cell, nearest, { zone: skillZone });
          } else if (caster.role === 'support') {
            played = this.spawnGuardSkillFx(event.heroCode, caster.cell, nearest, { anchorAt: { x: center.x, y: center.y + this.unitSize() * 0.2 } });
          }
          if (!played) {
            this.spawnCellBurst(center.x, center.y, rgba(255, 200, 90), true);
          }
        }
        // 群体直击技能(2026-09-11 用户反馈"技能打怪没伤害"):每只命中怪金色大号飘字+红闪,
        // 外加一次节流小震屏——此前技能只播特效不出数字,观感像空放。
        // 2026-10-14 起近战改分段结算:施放事件不带伤害(只带范围 / 锚点),飘字由 heroSkillHit 逐段出
        if (event.monsterIds && event.monsterIds.length > 0 && (event.amount ?? 0) > 0) {
          event.monsterIds.forEach((hitId, index) => {
            const hitView = this.monsterViews.get(hitId);
            if (!hitView || !hitView.node.isValid) {
              return;
            }
            const jitterX = ((event.timeMs + index * 37) % 48) - 24;
            this.queueDamage(hitId, event.amount ?? 0, true, hitView.node.position.x + jitterX, hitView.node.position.y);
            this.flashMonster(hitId);
          });
          const now = Date.now();
          if (now - this.lastSkillShakeAt > 900) {
            this.lastSkillShakeAt = now;
            this.shakeField(5);
          }
        }
      } else if (event.type === 'heroSkillHit') {
        // 近战战技 / 大招的分段打击(2026-10-14):与特效里每一次打击同步,逐只金色大号飘字 + 红闪 + 节流震屏
        (event.monsterIds ?? []).forEach((hitId, index) => {
          const hitView = this.monsterViews.get(hitId);
          if (!hitView || !hitView.node.isValid) {
            return;
          }
          const jitterX = ((event.timeMs + index * 37) % 48) - 24;
          this.queueDamage(hitId, event.amount ?? 0, true, hitView.node.position.x + jitterX, hitView.node.position.y);
          this.flashMonster(hitId);
        });
        const hitNow = Date.now();
        if (hitNow - this.lastSkillShakeAt > 450) {
          this.lastSkillShakeAt = hitNow;
          this.shakeField(4);
        }
      } else if (event.type === 'zoneTick') {
        // 区域跳伤(火海/旋风):每跳逐只红闪;飘字隔一跳出一次(每 0.5s 一跳,20 只怪全飘会糊屏)。
        const showFloater = Math.floor(event.timeMs / 500) % 2 === 0;
        (event.monsterIds ?? []).forEach((hitId, index) => {
          const hitView = this.monsterViews.get(hitId);
          if (!hitView || !hitView.node.isValid) {
            return;
          }
          this.flashMonster(hitId);
          if (showFloater) {
            const jitterX = ((event.timeMs + index * 53) % 40) - 20;
            this.queueDamage(hitId, event.amount ?? 0, false, hitView.node.position.x + jitterX, hitView.node.position.y + this.unitSize() * 0.1);
          }
        });
      } else if (event.type === 'cellsUnlock') {
        this.host.setStatus('阵地扩建!解锁 1 个新英雄格!');
        if (typeof event.cell === 'number') {
          const center = this.cellCenter(event.cell);
          this.spawnFloater(center.x, center.y + this.unitSize() * 0.4, '新格解锁!', rgba(150, 240, 160));
        }
      } else if (event.type === 'skillReady') {
        if (!sim.skillAutoImmediate) {
          this.showInteractHint('skillReady', '战技就绪:点击脚下发金光的英雄手动释放,伤害 +25%(不点 1.5 秒后自动释放)');
        }
      } else if (event.type === 'meteorSpawn') {
        this.showInteractHint('meteor', '流星矿晶落下!落地后点它拿金币,4 秒后会碎掉');
      } else if (event.type === 'meteorCollect') {
        const view = typeof event.pickupId === 'number' ? this.pickupViews.get(event.pickupId) : undefined;
        if (view && view.isValid) {
          const px = view.position.x;
          const py = view.position.y;
          this.spawnFloater(px, py + this.unitSize() * 0.7, `+${event.amount ?? 0} 金币`, rgba(255, 214, 92), 22);
          for (let i = 0; i < 3; i += 1) {
            this.spawnGoldCoin(px + (i - 1) * 18, py);
          }
          this.burstPickup(view, rgba(160, 200, 255));
        }
        gameAudio.sfx('coin');
      } else if (event.type === 'meteorExpire') {
        const view = typeof event.pickupId === 'number' ? this.pickupViews.get(event.pickupId) : undefined;
        if (view && view.isValid) {
          this.burstPickup(view, rgba(120, 110, 140));
        }
      } else if (event.type === 'greedySpawn') {
        this.host.setStatus('偷金鼠出现!点它集火,打死掉大笔金币,跑到水晶前就溜了');
        gameAudio.sfx('coin');
      } else if (event.type === 'greedyKill') {
        const view = typeof event.monsterId === 'number' ? this.monsterViews.get(event.monsterId) : undefined;
        if (view && view.node.isValid) {
          const px = view.node.position.x;
          const py = view.node.position.y;
          this.spawnFloater(px, py + this.unitSize() * 0.9, `偷金鼠 +${event.amount ?? 0} 金币`, rgba(255, 214, 92), 24);
          for (let i = 0; i < 6; i += 1) {
            this.spawnGoldCoin(px + (i - 2.5) * 16, py);
          }
          view.node.getChildByName('GuardGreedyBag')?.destroy();
        }
        gameAudio.sfx('coin_shower');
        this.host.setStatus(`打倒偷金鼠!夺回 ${event.amount ?? 0} 金币`);
      } else if (event.type === 'greedyEscape') {
        const view = typeof event.monsterId === 'number' ? this.monsterViews.get(event.monsterId) : undefined;
        if (view && view.node.isValid) {
          this.spawnFloater(view.node.position.x, view.node.position.y + this.unitSize() * 0.8, '偷金鼠带着金币跑了…', rgba(190, 180, 170), 18);
        }
      } else if (event.type === 'spellCast' && event.spellId) {
        this.playSpellFx(event.spellId, event.x ?? null, event.lane ?? 0, event.amount ?? 0, event.monsterIds ?? [], event);
      } else if (event.type === 'spellEcho' && event.spellId) {
        this.playSpellEcho(event);
      } else if (event.type === 'aegisBlock') {
        const now = Date.now();
        if (now - this.aegisFloaterAt > 700) {
          this.aegisFloaterAt = now;
          this.spawnFloater(this.xToPx(0.5), this.walkwayY() + this.unitSize() * 1.2, '圣光壁垒 免疫', rgba(255, 230, 150), 18);
        }
      } else if (event.type === 'trapPlace') {
        gameAudio.sfx('chest_land', 0.7);
        this.host.setStatus(`放下${GUARD_TRAPS[event.trapKind ?? 'spikes'].name}(-${event.amount ?? 0} 金币)`);
      } else if (event.type === 'trapTick') {
        for (const id of event.monsterIds ?? []) {
          this.flashMonster(id);
        }
      } else if (event.type === 'trapBoom' && typeof event.x === 'number') {
        this.playTrapBoom(event.x, event.amount ?? 0);
      } else if (event.type === 'trapExpire') {
        const view = typeof event.trapId === 'number' ? this.trapViews.get(event.trapId) : undefined;
        if (view && view.isValid) {
          this.spawnFloater(view.position.x, view.position.y + this.unitSize() * 0.6, `${GUARD_TRAPS[event.trapKind ?? 'spikes'].name}失效`, rgba(190, 180, 170), 16);
        }
      } else if (event.type === 'callWave') {
        gameAudio.sfx('coin');
        this.host.setStatus(`提前迎战!奖励 ${event.amount ?? 0} 金币`);
      } else if (event.type === 'waveStart') {
        this.host.setStatus(`第 ${event.wave} 波来袭!`);
        gameAudio.sfx('wave_start');
      } else if (event.type === 'chestDrop') {
        this.host.setStatus('精英宝箱掉落!点击开箱!');
        gameAudio.sfx('coin');
      } else if (event.type === 'bossCastStart') {
        this.host.setStatus(sim.markedMonsterId === event.monsterId ? 'BOSS 蓄力轰击水晶!已集火,打断所需伤害减半!' : 'BOSS 蓄力轰击水晶!点击 BOSS 集火,打断所需伤害减半!');
        // 蓄力:BOSS 播蓄力动作(循环)+ 脚下紫色法阵,直到读满/被打断(2026-09-24)。
        const castBoss = typeof event.monsterId === 'number' ? sim.monsters.find((entry) => entry.monsterId === event.monsterId) ?? null : null;
        const castView = castBoss ? this.monsterViews.get(castBoss.monsterId) : undefined;
        this.playBossAnim(castBoss, castView, 'charge');
        this.attachBossChargeAura(castView);
      } else if (event.type === 'bossCastInterrupt') {
        const stunView = typeof event.monsterId === 'number' ? this.monsterViews.get(event.monsterId) : undefined;
        this.clearBossChargeAura(stunView);
        this.playBossStun(stunView);
        const sx = stunView?.node.isValid ? stunView.node.position.x + this.bossVisualOffsetX(stunView) : this.xToPx(5);
        this.spawnFloater(sx, this.walkwayY() + this.layoutHeight * 0.12, '打断!', rgba(255, 240, 160));
        this.shakeField(8);
      } else if (event.type === 'bossCastHit') {
        // 灭世轰击:BOSS 出手动作 + 大号暗焰弹飞向水晶,命中才出紫色爆裂 + "灭世轰击 -N" + 大震屏。
        const blastBoss = typeof event.monsterId === 'number' ? sim.monsters.find((entry) => entry.monsterId === event.monsterId) ?? null : null;
        const blastView = blastBoss ? this.monsterViews.get(blastBoss.monsterId) : undefined;
        this.clearBossChargeAura(blastView);
        this.playBossAnim(blastBoss, blastView, 'blast');
        const ox = blastView?.node.isValid ? blastView.node.position.x + this.bossVisualOffsetX(blastView) : this.xToPx(5);
        const oy = blastView?.node.isValid ? blastView.node.position.y : this.walkwayY();
        const chest = oy + (blastBoss ? this.monsterHeadOffsetY(blastBoss) * 0.5 : this.unitSize() * 0.6);
        this.spawnBossCrystalProjectile(ox - this.unitSize() * 0.6, chest, GUARD_BOSS_FX.blast, GUARD_BOSS_FX.blastHit, event.amount ?? 0, { shake: 14, speedMult: 0.65, label: '灭世轰击' });
      } else if (event.type === 'ultUnlock') {
        this.showUltAwakenBanner(event.heroCode ?? '', event.ultLv ?? 1);
        gameAudio.sfx('level_up');
        this.shakeField(6);
      } else if (event.type === 'freeEnhance') {
        if ((event.amount ?? 0) > 0) {
          this.host.setStatus('守住一波!获得 1 次免费战术,点"战术"选一张战术卡。');
          this.spawnFloater(this.xToPx(3), this.walkwayY() + this.layoutHeight * 0.2, '免费战术 +1', rgba(150, 255, 170), 22);
        } else {
          this.spawnFloater(this.xToPx(3), this.walkwayY() + this.layoutHeight * 0.2, '免费战术已攒满 → 金币 +200', rgba(255, 220, 120), 18);
        }
        gameAudio.sfx('coin');
      } else if (event.type === 'perkProc') {
        // 击杀触发类紫卡(余烬爆燃/龙焰爆):逐只爆闪 + 紫字
        (event.monsterIds ?? []).forEach((hitId, index) => {
          const hitView = this.monsterViews.get(hitId);
          if (!hitView || !hitView.node.isValid) {
            return;
          }
          if (index >= 6 || !this.spawnSpineBurstFx(resolveGuardPerkProcFx(event.perkId), hitView.node.position.x, hitView.node.position.y, 1)) {
            this.spawnImpactFlash(hitView.node.position.x, hitView.node.position.y, rgba(255, 150, 90));
          }
          this.queueDamage(hitId, event.amount ?? 0, false, hitView.node.position.x + ((index * 31) % 30) - 15, hitView.node.position.y);
          this.flashMonster(hitId);
        });
        if (event.perkId === 'dragonslayer') {
          this.shakeField(9);
          this.spawnFloater(this.xToPx(4), this.walkwayY() + this.layoutHeight * 0.18, resolveGuardHeroPerkProfile(event.heroCode ?? '', 'melee').purple?.procCall ?? '龙焰爆!', rgba(255, 170, 90), 24);
        }
      } else if (event.type === 'passiveProc') {
        this.playPassiveProcFx(event);
      } else if (event.type === 'crystalShield') {
        // 能量护盾被动:波次开始水晶处壁垒法阵短播 + 金字护盾量
        const center = this.crystalFxCenter();
        this.spawnSpineBurstFx(GUARD_SPELL_FX.aegis, center.x + this.unitSize() * 1.0, center.y + this.unitSize() * 0.3, 0.6, 1400, true);
        this.spawnFloater(center.x, center.y + this.unitSize() * 0.55, `护盾 +${this.formatDamageValue(event.amount ?? 0)}`, rgba(255, 226, 150), 20);
      } else if (event.type === 'crystalHeal') {
        // 辅助周期治疗水晶:小圣光升起 + 绿色飘字(≥1.2s 一次,多辅助不叠)。
        const now = Date.now();
        if (now - this.lastCrystalHealFxAt >= 1200) {
          this.lastCrystalHealFxAt = now;
          const center = this.crystalFxCenter();
          this.spawnSpineBurstFx(GUARD_SUPPORT_FX.crystalHealSmall, center.x, center.y - this.unitSize() * 0.1, 1, 900);
          this.spawnFloater(center.x, center.y + this.unitSize() * 0.45, `+${this.formatDamageValue(event.amount ?? 0)}`, rgba(150, 255, 170), 20);
        }
      } else if (event.type === 'crystalSkill') {
        this.spawnFloater(this.xToPx(2), this.walkwayY(), `矿晶震荡 ${event.amount ?? 0}`, rgba(150, 220, 255));
      } else if (event.type === 'heroAttack') {
        // 攻击动画:怪进入范围出手时播 attack(用户 2026-08-21);技能击追加专属技能特效打在目标身上。
        const hero = sim.heroes.find((entry) => entry.heroCode === event.heroCode && entry.cell === event.cell);
        // 出手前转身面向目标(2026-10-07 用户「怪物靠近水晶后近战英雄站着不动」:啃水晶的怪都挤在英雄身后,
        // 英雄却一直朝右挥刀、斩击从身前倒飞回去,看起来像没在打)
        const attackTarget = typeof event.monsterId === 'number' ? this.monsterViews.get(event.monsterId) : undefined;
        if (hero) {
          const heroView = this.heroViews.get(hero.unitId);
          if (heroView && attackTarget && attackTarget.node.isValid) {
            this.faceHeroToward(heroView, this.cellCenter(hero.cell).x, attackTarget.node.position.x);
          }
          this.playUnitAttack(heroView);
        }
        // 打击感(2026-08-26):远程/控制普攻发弹幕(命中才结算表现);近战刀光斩闪;技能击照旧专属特效。
        if (typeof event.monsterId === 'number') {
          const target = sim.monsters.find((entry) => entry.monsterId === event.monsterId);
          const targetView = target ? this.monsterViews.get(target.monsterId) : null;
          if (target && targetView && targetView.node.isValid) {
            const jitterX = ((event.timeMs % 48) - 24);
            if (event.skillProc && event.heroCode) {
              // 2026-09-07 用户反馈:技能击(每4次普攻的强化击)不再播大招级专属特效——
              // 专属特效只在主动技能真正释放时出现,冷却期普攻只保留飘字/震屏打击感。
              if (hero) {
                this.highlightCaster(hero.cell, '技能击!');
              }
              this.queueDamage(target.monsterId, event.amount ?? 0, true, targetView.node.position.x + jitterX, targetView.node.position.y);
              this.flashMonster(target.monsterId);
              // 节流震屏:技能命中的重量感(≥1.2s 一次)
              const now = Date.now();
              if (now - this.lastSkillShakeAt > 1200) {
                this.lastSkillShakeAt = now;
                this.shakeField(4);
              }
            } else if (hero) {
              // 2026-09-12 用户反馈:近战/远程普攻都是同一颗魔法弹太单调 → 一人一套专属普攻表现(LobbyBattleAttackFxConfig):
              // bolt=专属弹道贴图从英雄身前飞向目标(命中才结算);strike=专属斩击/撞击贴图直接落在目标身上(即时结算)。
              const attackFx = this.resolveHeroAttackFxSpec(hero);
              const attackColor = new Color(attackFx.color[0], attackFx.color[1], attackFx.color[2]);
              // 近战与远程统一走弹道:都从英雄身前发出飞向目标,命中才结算伤害表现
              //(2026-09-12 用户反馈:近战斩击直接出现在怪身上,缺"发出→飞行"的过程)。
              const origin = this.cellCenter(hero.cell);
              // 普攻音(2026-09-18):随弹道发出,多英雄齐射时靠管理器 80ms/键节流 + 压低音量避免糊成一片。
              gameAudio.sfx(this.resolveHeroAttackSfxKey(hero), 0.55);
              // 弹道从英雄朝向的一侧发出(目标在身后时从左侧出手)
              const facing = this.heroViews.get(hero.unitId)?.faceLeft ? -1 : 1;
              this.spawnAttackVolley(hero, target, event, attackColor, attackFx, origin.x + this.unitSize() * 0.4 * facing, origin.y + this.unitSize() * 0.05);
            } else {
              this.queueDamage(target.monsterId, event.amount ?? 0, false, targetView.node.position.x + jitterX, targetView.node.position.y);
              this.flashMonster(target.monsterId);
            }
          }
        }
      }
    }
    sim.events.length = 0;
  }

  // ── P2:宝箱(点击→开箱轮盘) ──
  // 2026-09-27 用户反馈"宝箱和转盘效果太简单":场上宝箱改为掉落入场 + 旋转光芒 + 骨骼光环 + 浮动抖锁 + 箭头/胶囊提示;轮盘弹层见 openChestWithWheel。
  private syncChests(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const liveIds = new Set(sim.chests.map((chest) => chest.chestId));
    for (const [chestId, node] of Array.from(this.chestViews)) {
      if (!liveIds.has(chestId)) {
        if (node.isValid) {
          node.destroy();
        }
        this.chestViews.delete(chestId);
      }
    }
    for (const chest of sim.chests) {
      if (this.chestViews.has(chest.chestId)) {
        continue;
      }
      // BOSS 豪华箱(2026-09-18 用户拍板):图鉴哥特金箱素材、体型 ×1.3、红金配色;精英普通箱沿用矿脉石箱。
      const deluxe = chest.grade === 'deluxe';
      const size = this.unitSize() * (deluxe ? 1.04 : 0.8);
      const px = this.xToPx(chest.x);
      const py = this.monsterY(chest.lane, chest.x) - size * 0.15;
      const hot = deluxe ? rgba(255, 140, 80) : rgba(255, 214, 110);
      const node = this.host.addChildPlainNode(field, `GuardChest_${chest.chestId}`, px, py, size, size);
      // 骨骼光环容器(最底层;落地后再生成,避免箱子还在半空光环已经贴地)
      this.host.addChildPlainNode(node, 'GuardChestAura', 0, -size * 0.34, 10, 10);
      // 地面投影:让箱子"落在地上"而不是贴在地上
      const shadowG = this.host.addChildPlainNode(node, 'GuardChestShadow', 0, -size * 0.42, size, size * 0.3).addComponent(Graphics);
      shadowG.fillColor = rgba(0, 0, 0, 110);
      shadowG.ellipse(0, 0, size * 0.42, size * 0.12);
      shadowG.fill();
      // 2026-09-27 用户验收"背后旋转的特效换掉":cast_flash 星芒与程序圆底光全部去掉,宝箱的光只来自 GuardChestAura 里的骨骼光环(新批次 UI 特效)。
      // 箱体:上下浮动 + 每 3s 抖一下锁 + 锁口小闪
      const img = this.mountSprite(node, 'Img', deluxe ? 'ui/codex/ai/chest_ready/spriteFrame' : 'ui/guard/chest_closed/spriteFrame', 0, 0, size, size);
      tween(img)
        .repeatForever(tween().to(1.2, { position: new Vec3(0, size * 0.04, 0) }, { easing: 'sineInOut' }).to(1.2, { position: new Vec3(0, -size * 0.04, 0) }, { easing: 'sineInOut' }))
        .start();
      tween(img).repeatForever(tween().delay(2.7).to(0.08, { angle: -4 }).to(0.08, { angle: 4 }).to(0.14, { angle: 0 })).start();
      const lockPop = this.mountSprite(node, 'GuardChestLockPop', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, size * 0.22, size * 0.7, size * 0.7, hot);
      const lockOpacity = lockPop.addComponent(UIOpacity);
      lockOpacity.opacity = 0;
      lockPop.setScale(0.4, 0.4, 1);
      tween(lockPop).repeatForever(tween().delay(2.7).set({ scale: new Vec3(0.4, 0.4, 1) }).to(0.28, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' }).delay(0.02)).start();
      tween(lockOpacity).repeatForever(tween().delay(2.7).set({ opacity: 255 }).to(0.28, { opacity: 0 }).delay(0.02)).start();
      // 提示:胶囊 + 文字 + 上方跳动的金色倒三角(手机上"能点"要一眼看出)
      // 2026-09-27 用户验收:胶囊原先按箱宽 1.7 倍拉满、高 28 显得又长又细 → 宽度贴合文字(左右各留 20)、高 36。
      const hintText = deluxe ? 'BOSS 豪华宝箱 · 点击' : '点击开箱';
      const hintSize = 18;
      const hintTextW = Array.from(hintText).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e7f ? 1 : 0.55) * hintSize, 0);
      const pillW = hintTextW + 40;
      const pillH = 36;
      const pillY = size * 0.56;
      const pill = this.host.addChildPlainNode(node, 'GuardChestHintPill', 0, pillY, pillW, pillH);
      const pg = pill.addComponent(Graphics);
      pg.fillColor = rgba(10, 6, 4, 200);
      pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pg.fill();
      pg.strokeColor = deluxe ? rgba(255, 150, 90, 200) : rgba(210, 160, 80, 180);
      pg.lineWidth = 2;
      pg.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pg.stroke();
      const hint = this.host.addChildLabel(pill, 'GuardChestHint', hintText, 0, 0, hintSize, deluxe ? rgba(255, 200, 110) : rgba(255, 232, 150), new Size(pillW - 16, hintSize + 8));
      hint.overflow = Label.Overflow.SHRINK;
      hint.enableOutline = true;
      hint.outlineColor = rgba(40, 24, 10, 255);
      hint.outlineWidth = 2;
      const arrowY = pillY + pillH / 2 + 20;
      const arrow = this.host.addChildPlainNode(node, 'GuardChestArrow', 0, arrowY, 28, 28);
      const ag = arrow.addComponent(Graphics);
      ag.fillColor = rgba(255, 214, 92, 255);
      ag.strokeColor = rgba(90, 50, 10, 255);
      ag.lineWidth = 2;
      ag.moveTo(0, -12);
      ag.lineTo(-11, 9);
      ag.lineTo(11, 9);
      ag.close();
      ag.fill();
      ag.stroke();
      tween(arrow)
        .repeatForever(tween().to(0.5, { position: new Vec3(0, arrowY - 8, 0) }, { easing: 'sineInOut' }).to(0.5, { position: new Vec3(0, arrowY + 4, 0) }, { easing: 'sineInOut' }))
        .start();
      this.host.applyImageButtonFeedback(node);
      node.on(Node.EventType.TOUCH_END, () => this.openChestWithWheel(chest.chestId), this);
      this.chestViews.set(chest.chestId, node);
      // 刚掉的箱子从上方砸下来;重建/缩放窗口时补建的箱子直接落位(不再响一次落地音)。
      if (sim.timeMs - chest.droppedAtMs < 1500) {
        this.playChestLanding(node, px, py, size, deluxe);
      } else {
        this.spawnChestAura(node, size, deluxe);
      }
    }
  }

  /** 宝箱脚下循环骨骼光环(普通=金色雷纹环 / 豪华=红色熔岩环);未就绪静默跳过(贴图光芒已足够)。 */
  private spawnChestAura(node: Node, size: number, deluxe: boolean): void {
    const holder = node.getChildByName('GuardChestAura');
    if (!holder || !holder.isValid) {
      return;
    }
    const spec = deluxe ? GUARD_CHEST_FX.auraDeluxe : GUARD_CHEST_FX.auraNormal;
    this.spawnOverlaySpineFx(holder, spec, 0, 0, size * spec.size, 0, true);
  }

  /** 宝箱掉落:0.42s 砸地 + 压扁回弹 + 尘环/星屑 + 落地音 + 轻震;豪华箱加红闪。 */
  private playChestLanding(node: Node, px: number, py: number, size: number, deluxe: boolean): void {
    const field = this.fieldNode;
    if (!field || !node.isValid) {
      return;
    }
    node.setPosition(px, py + size * 1.6, 0);
    node.setScale(0.7, 0.7, 1);
    tween(node)
      .to(0.42, { position: new Vec3(px, py, 0), scale: Vec3.ONE }, { easing: 'quadIn' })
      .call(() => {
        if (!node.isValid || !field.isValid) {
          return;
        }
        gameAudio.sfx('chest_land');
        if (deluxe) {
          gameAudio.sfx('coin');
        }
        this.shakeField(deluxe ? 6 : 3);
        this.spawnChestAura(node, size, deluxe);
        const hot = deluxe ? rgba(255, 150, 90) : rgba(255, 214, 110);
        const dust = this.mountSprite(field, 'GuardChestDust', 'ui/battle/c1812/effects/hit_ring/spriteFrame', px, py - size * 0.3, size * 0.9, size * 0.9, hot);
        dust.setSiblingIndex(field.children.length - 1);
        dust.setScale(0.3, 0.3, 1);
        const dustOpacity = dust.addComponent(UIOpacity);
        tween(dust).to(0.35, { scale: new Vec3(1.6, 1.6, 1) }, { easing: 'quadOut' }).start();
        tween(dustOpacity).to(0.35, { opacity: 0 }).call(() => { if (dust.isValid) { dust.destroy(); } }).start();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
          const spark = this.mountSprite(field, 'GuardChestSpark', deluxe && i % 2 === 1 ? 'ui/common/ai/star_red/spriteFrame' : 'ui/common/ai/star_orange/spriteFrame', px, py - size * 0.2, 22, 22);
          spark.setSiblingIndex(field.children.length - 1);
          const sparkOpacity = spark.addComponent(UIOpacity);
          tween(spark)
            .to(0.4, { position: new Vec3(px + Math.cos(a) * size * 0.9, py + Math.sin(a) * size * 0.6, 0), scale: new Vec3(0.3, 0.3, 1) }, { easing: 'quadOut' })
            .start();
          tween(sparkOpacity).to(0.4, { opacity: 0 }).call(() => { if (spark.isValid) { spark.destroy(); } }).start();
        }
        if (deluxe) {
          this.spawnSpineBurstFx(GUARD_CHEST_FX.landFlash, px, py, size / this.unitSize(), 500, true);
        }
      })
      .to(0.09, { scale: new Vec3(1.18, 0.84, 1) })
      .to(0.1, { scale: new Vec3(0.94, 1.08, 1) })
      .to(0.08, { scale: Vec3.ONE })
      .start();
  }

  /** 账号前 3 箱固定 1-3-5 连(localStorage 计数;不可用则跳过脚本)。 */
  private nextChestScriptTier(): 1 | 3 | 5 | undefined {
    try {
      const store = (globalThis as { localStorage?: Storage }).localStorage;
      if (!store) {
        return undefined;
      }
      const opened = Number(store.getItem('lootchainGuardChestScript') ?? '0');
      if (opened >= 3) {
        return undefined;
      }
      store.setItem('lootchainGuardChestScript', String(opened + 1));
      return opened === 0 ? 1 : opened === 1 ? 3 : 5;
    } catch (error) {
      void error;
      return undefined;
    }
  }

  // ── 战斗内设置(2026-09-24 用户确认方案):齿轮 = 暂停 + 设置面板;× / 面板"退出战斗" = 退出确认 ──

  /** 统一暂停口径:开箱轮盘 / 设置面板 / 退出确认任一打开即暂停;恢复时重置步进时钟,避免补跑一大段模拟。 */
  private syncBattlePause(): void {
    const sim = this.sim;
    if (!sim) {
      return;
    }
    const want = this.wheelOverlayOpen || this.settingsOpen || this.exitConfirmOpen;
    if (sim.paused && !want) {
      this.lastTickWallMs = Date.now();
      this.tickAccumulatorMs = 0;
    }
    sim.paused = want;
  }

  private battleEnded(): boolean {
    const phase = this.sim?.phase;
    return this.overlayShown || phase === 'victory' || phase === 'defeat';
  }

  /**
   * 手机横屏(设计高 720)战斗内弹层一律全屏(2026-10-02 用户拍板 H5 横屏弹框全屏,内容重新排布用足空间);
   * 电脑 / 平板(设计高 1080)保持原居中弹框不变。
   */
  private phoneSheet(): boolean {
    return isPhoneDesign();
  }

  /** UiGlassKit 用的宿主视图(宿主即 UiKitHost 的超集)。 */
  private get kit(): UiKitHost {
    return this.host as unknown as UiKitHost;
  }

  /**
   * B 弹层缩放(2026-11-11):电脑 = 原型 1870×841 装进布局(同全站 glassProtoMap);
   * 手机 = 面板撑满全屏弹层区(与旧版「战斗内弹层手机全屏」口径一致),放大封顶 1.2,小窗不至于大得离谱。
   */
  private glassK(protoW: number, protoH: number): number {
    if (this.phoneSheet()) {
      const sheet = this.phoneSheetSize();
      return Math.min(1.2, sheet.w / protoW, sheet.h / protoH);
    }
    return Math.min(this.layoutWidth / 1870, this.layoutHeight / 841);
  }

  /** 战斗内 B 玻璃弹层外壳(压暗 + 双层玻璃面板,挂 root 最上层);坐标走原型像素。 */
  private mountGuardGlass(name: string, protoW: number, protoH: number, options: Partial<GlassPopupShellOptions>): GlassPopupShell | null {
    const root = this.root;
    if (!root) {
      return null;
    }
    return mountGlassPopupShell(this.kit, root, {
      name,
      width: protoW,
      height: protoH,
      title: '',
      stage: { width: this.layoutWidth, height: this.layoutHeight },
      k: this.glassK(protoW, protoH),
      minFont: this.phoneSheet() ? 20 : 12,
      ...options,
    });
  }

  /** 手机全屏弹层尺寸:与大厅全屏弹框同一口径(LobbyPhoneDialogFrame:左右留安全边距 40%,上下各 8)。 */
  private phoneSheetSize(): { w: number; h: number } {
    const size = phoneDialogSizeForStage(this.layoutWidth, this.layoutHeight);
    return { w: size.width, h: size.height };
  }

  /** 本局一句话信息:车轮战=层数/BOSS 数;标准=波次/击杀/水晶。 */
  private battleInfoText(): string {
    const sim = this.sim;
    if (!sim) {
      return '';
    }
    if (sim.mode === 'rush') {
      return `车轮战 · 层数 ${guardTrialLayers(sim)} · 已击败 BOSS ×${sim.bossKills} · 击杀 ${sim.killCount}`;
    }
    return `第 ${sim.wave}/${sim.maxWave} 波 · 击杀 ${sim.killCount} · 水晶 ${Math.ceil(sim.crystalHp)}/${sim.crystalMaxHp}`;
  }

  /** 齿轮:暂停战斗并打开设置面板(已结束/弹层中不响应)。 */
  private openBattleSettings(): void {
    if (!this.root || !this.sim || this.settingsOpen || this.battleEnded()) {
      return;
    }
    // 2026-11-11 B 毛玻璃(原型 周报截图/2026-11-11_守卫战弹层/proto/guard_settings_b.png 1:1):面板 939×597,点面板外关闭。
    const shell = this.mountGuardGlass('GuardSettingsOverlay', GUARD_SETTINGS_W, GUARD_SETTINGS_H, { bare: true, onClose: () => this.closeBattleSettings() });
    if (!shell) {
      return;
    }
    this.settingsShell = shell;
    this.settingsOpen = true;
    this.syncBattlePause();
    gameAudio.sfx('ui_click');
    this.renderSettingsPage(shell.overlay, 'main');
  }

  private closeBattleSettings(): void {
    this.root?.getChildByName('GuardSettingsOverlay')?.destroy();
    this.settingsShell = null;
    this.settingsOpen = false;
    this.syncBattlePause();
  }

  /** 设置面板页头:竖条 + 标题(dy 42,34 粗)+ ✕ + 可选信息行(dy 83)+ 分隔线(dy 110)。 */
  private paintSettingsHeader(shell: GlassPopupShell, content: Node, title: string, info: string): void {
    const { k, S, X, Y, T } = shell;
    const W = GUARD_SETTINGS_W;
    this.kit.addSprite('TitleBar', GLASS_ICON.accent, X(46), Y(42), S(7), S(37), content);
    T(content, 'Title', title, X(73), Y(42), 34, GLASS_COLOR.text, S(500), HorizontalTextAlignment.LEFT, true);
    mountGlassCloseButton(this.kit, content, X(W - 50), Y(42), k, () => this.closeBattleSettings()).name = 'GuardSettingsClose';
    if (info) {
      T(content, 'Info', info, X(73), Y(83), 20, GLASS_COLOR.sub, S(W - 146));
    }
    mountGlassLine(this.kit, content, 'Divider', 0, Y(110), S(W - 82), Math.max(1, S(1.5)), new Color(150, 158, 172, 70));
  }

  /** 子页底部「返回」(灰玻璃,与主页按钮同一行)。 */
  private mountSettingsBack(overlay: Node, shell: GlassPopupShell, content: Node, name: string): void {
    const { k, S, X, Y } = shell;
    mountGlassButton(this.kit, content, name, '返回', X(GUARD_SETTINGS_W / 2), Y(542), S(300), S(56), k, 'secondary', () => this.renderSettingsPage(overlay, 'main'), 28);
  }

  /** 设置面板内容页:main=信息 + 开关两栏 + 玩法速查 / 法术装备入口 + 退出/继续;help=玩法速查;spells=法术装备。切页/切开关整页重画。 */
  private renderSettingsPage(overlay: Node, page: 'main' | 'help' | 'spells'): void {
    const shell = this.settingsShell;
    if (!overlay.isValid || !shell || shell.overlay !== overlay) {
      return;
    }
    shell.panel.getChildByName('GuardSettingsContent')?.destroy();
    const content = this.host.addChildPlainNode(shell.panel, 'GuardSettingsContent', 0, 0, shell.S(GUARD_SETTINGS_W), shell.S(GUARD_SETTINGS_H));
    if (page === 'spells') {
      this.renderSpellLoadoutPage(overlay, shell, content);
      return;
    }
    if (page === 'help') {
      this.paintSettingsHeader(shell, content, '玩法速查', '');
      const lines = [
        '招募:花金币随机招募一名上阵英雄(1★)放到空格,每次招募费用递增。',
        '合成:同名同星英雄拖到一起合成,局内星级 +1(最高 5★,离场重置),局内 2★ 起解锁战技。',
        '战技:蓄满时英雄脚下发金光,点它手动释放 +25%;两人接连手动释放触发合击。',
        '集火:点怪物标记,射程内英雄优先打它、伤害 +20%;标记读条中的 BOSS 更易打断。',
        '共鸣格:每波发金光的格子,站上去的英雄本波攻击 +40%;把主力拖过去。',
        '迎战:波间点「提前迎战」立刻开下一波,越早奖励金币越多。',
        '法术:击杀和打断攒能量,冰封、九天神雷要拖到战场施放;出战法术在大厅「水晶」配置。',
        '事件:流星矿晶落地后点它拿金币;偷金鼠要点它集火,打死掉大笔金币。',
        '出售:把英雄拖到水晶上出售,返还部分金币。',
        '战术:花金币抽一张战术卡(三选一);第 2/4/6/8 波守住后各送一次免费战术,最多攒 2 次(20 波局为第 4/8/12/16 波)。',
        'BOSS:头顶出现蓄力条时集火打断,读满会轰掉水晶 15% 生命。',
        '辅助:圣辉涌泉为水晶回血并给全队加攻速(脚下金色光环)。',
      ];
      if (this.sim?.mode === 'rush') {
        lines.push('车轮战:BOSS 一只比一只强,水晶碎裂或时间到即按层数结算。');
      }
      // 两栏,每条可折两行:栏宽 (939 - 106 - 30) / 2,内容区 dy 128 .. 500
      const { S, X, Y, T } = shell;
      const perCol = Math.ceil(lines.length / 2);
      const colW = (GUARD_SETTINGS_W - 106 - 30) / 2;
      const top = 128;
      const step = (500 - top) / perCol;
      lines.forEach((text, index) => {
        const col = Math.floor(index / perCol);
        const row = index % perCol;
        const left = 53 + col * (colW + 30);
        // 条目名(冒号前)用白、说明用灰会拆成两段 Label,折行对不齐;整条统一浅灰白
        const label = T(content, `GuardSettingsHelp_${index}`, text, X(left), Y(top + step * (row + 0.5)), 18, new Color(214, 220, 230, 255), S(colW));
        label.enableWrapText = true;
        label.overflow = Label.Overflow.SHRINK;
        label.lineHeight = Math.round(label.fontSize * 1.35);
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.node.getComponent(UITransform)?.setContentSize(S(colW), S(step - 6));
      });
      this.mountSettingsBack(overlay, shell, content, 'GuardSettingsHelpBack');
      return;
    }
    this.paintSettingsHeader(shell, content, '战斗设置', `已暂停 · ${this.battleInfoText()}`);
    const rows: Array<{ key: string; label: string; options: string[]; active: number; pick: (index: number) => void }> = [
      { key: 'Bgm', label: '背景音乐', options: ['开', '关'], active: gameAudio.bgmEnabled() ? 0 : 1, pick: (index) => gameAudio.setBgmEnabled(index === 0) },
      {
        key: 'Sfx', label: '音效', options: ['开', '关'], active: gameAudio.sfxEnabled() ? 0 : 1,
        pick: (index) => {
          gameAudio.setSfxEnabled(index === 0);
          gameAudio.sfx('ui_click');
        },
      },
      {
        key: 'Shake', label: '战斗震屏', options: ['开', '关'], active: this.shakeEnabled ? 0 : 1,
        pick: (index) => {
          this.shakeEnabled = index === 0;
          writeGuardPref(GUARD_PREF_SHAKE, this.shakeEnabled ? '1' : '0');
          this.shakeField(6);
        },
      },
      {
        key: 'Graphics', label: '画面', options: ['流畅', '极致'], active: getGraphicsMode() === 'smooth' ? 0 : 1,
        pick: (index) => setGraphicsMode(index === 0 ? 'smooth' : 'ultra'),
      },
      {
        key: 'Fps', label: '帧率', options: GRAPHICS_FRAME_RATES.map((fps) => String(fps)), active: Math.max(0, GRAPHICS_FRAME_RATES.indexOf(getGraphicsFrameRate() as 30 | 60 | 120)),
        pick: (index) => setGraphicsFrameRate(GRAPHICS_FRAME_RATES[index]),
      },
      {
        // 性能面板(引擎自带统计:帧率 / 每帧耗时 / 绘制次数 / 逻辑与渲染耗时):卡顿时打开截图反馈,便于定位
        key: 'Perf', label: '性能面板', options: ['关', '开'], active: this.perfStatsShown ? 1 : 0,
        pick: (index) => {
          this.perfStatsShown = index === 1;
          if (this.perfStatsShown) {
            profiler.showStats();
          } else {
            profiler.hideStats();
          }
        },
      },
      {
        key: 'Damage', label: '伤害数字', options: ['全部', '精简'], active: this.damageNumbersLite ? 1 : 0,
        pick: (index) => {
          this.damageNumbersLite = index === 1;
          writeGuardPref(GUARD_PREF_DAMAGE_NUMBERS, this.damageNumbersLite ? 'lite' : 'all');
        },
      },
      {
        key: 'SkillAuto', label: '战技释放', options: ['手动加成', '立即自动'], active: this.skillAutoImmediate ? 1 : 0,
        pick: (index) => {
          this.skillAutoImmediate = index === 1;
          writeGuardPref(GUARD_PREF_SKILL_AUTO, this.skillAutoImmediate ? '1' : '0');
          if (this.sim) {
            guardSetSkillAuto(this.sim, this.skillAutoImmediate);
          }
        },
      },
    ];
    this.renderSettingsMainColumns(overlay, shell, content, rows);
  }

  /**
   * 设置主页两栏(原型 guard_settings_b):左栏「声音与画面」5 行、右栏「战斗」3 行 + 玩法速查 / 法术装备整行入口;
   * 每行 = 左对齐名字(字号 24)+ 分段胶囊(选中暗金底白字,未选灰玻璃);底部说明一行 + 退出(灰玻璃)/ 继续(香槟)两键。
   */
  private renderSettingsMainColumns(
    overlay: Node,
    shell: GlassPopupShell,
    content: Node,
    rows: Array<{ key: string; label: string; options: string[]; active: number; pick: (index: number) => void }>,
  ): void {
    const { k, S, X, Y, T } = shell;
    const leftKeys = ['Bgm', 'Sfx', 'Graphics', 'Fps', 'Perf'];
    const left = rows.filter((row) => leftKeys.indexOf(row.key) >= 0);
    const right = rows.filter((row) => leftKeys.indexOf(row.key) < 0);
    // 两栏:名字左沿 53 / 503,胶囊组 193..439 / 654..901(宽 247),首行 dy 200,行距 54.5
    const cols = [{ label: 53, segLeft: 193, header: 52 }, { label: 503, segLeft: 654, header: 503 }];
    const segW = 247;
    const rowDy = (index: number): number => 200 + index * 54.5;
    mountGlassSectionHeader(this.kit, content, 'GuardSettingsGroupL', '声音与画面', X(cols[0].header), Y(147), k, 26);
    mountGlassSectionHeader(this.kit, content, 'GuardSettingsGroupR', '战斗', X(cols[1].header), Y(147), k, 26);
    const paintColumn = (list: typeof rows, col: typeof cols[number]): void => {
      list.forEach((row, index) => {
        const dy = rowDy(index);
        T(content, `GuardSettingsRow${row.key}`, row.label, X(col.label), Y(dy), 24, GLASS_COLOR.text, S(col.segLeft - col.label - 8));
        const gap = 9;
        const pillW = (segW - gap * (row.options.length - 1)) / row.options.length;
        row.options.forEach((text, optionIndex) => {
          const active = optionIndex === row.active;
          const cx = col.segLeft + pillW / 2 + optionIndex * (pillW + gap);
          mountGlassButton(this.kit, content, `GuardSettings${row.key}_${optionIndex}`, text, X(cx), Y(dy), S(pillW), S(40), k, active ? 'selected' : 'secondary', () => {
            if (!active) {
              row.pick(optionIndex);
              this.renderSettingsPage(overlay, 'main');
            }
          }, 22);
        });
      });
    };
    paintColumn(left, cols[0]);
    paintColumn(right, cols[1]);
    // 右栏开关下接两条整行入口:501..901 宽 400 高 46,dy 363 / 418;字左沿 +25,› 距右沿 28
    const mountLink = (name: string, text: string, dy: number, onTap: () => void): void => {
      const w = 400;
      const node = this.host.addChildPlainNode(content, name, X(501 + w / 2), Y(dy), S(w), S(46));
      mountGlassSlice(this.kit, node, 'Bg', GLASS_SLICES.pillSecondary, 0, 0, S(w), S(46), k);
      T(node, 'Label', text, -S(w / 2 - 25), 0, 24, GLASS_COLOR.text, S(w - 80));
      this.kit.addSprite('Chevron', GLASS_ICON.chevron, S(w / 2 - 28), 0, S(18), S(18), node);
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, onTap, this);
      this.host.applyImageButtonFeedback(node, 1.02, 0.97);
    };
    mountLink('GuardSettingsHelpLink', '玩法速查', 363, () => this.renderSettingsPage(overlay, 'help'));
    mountLink('GuardSettingsSpellsLink', '法术装备', 418, () => this.renderSettingsPage(overlay, 'spells'));
    T(content, 'GuardSettingsHint', '画面「流畅」:降低分辨率、减少同屏特效,卡顿时选它;「极致」全部拉满(120 帧需要高刷屏)', X(53), Y(478), 19, GLASS_COLOR.sub, S(GUARD_SETTINGS_W - 106));
    // 退出(灰玻璃 353×56,中心 264.5)/ 继续(香槟 362×56,中心 680),行中 dy 542
    mountGlassButton(this.kit, content, 'GuardSettingsExit', '退出战斗', X(264.5), Y(542), S(353), S(56), k, 'secondary', () => this.openExitConfirm(), 28);
    mountGlassButton(this.kit, content, 'GuardSettingsResume', '继续战斗', X(680), Y(542), S(362), S(56), k, 'primary', () => this.closeBattleSettings(), 28);
  }

  /** ×:战斗进行中弹退出确认;未开战/已结束直接回大厅。 */
  private requestExitBattle(): void {
    if (!this.sim || this.battleEnded()) {
      this.host.returnToLobbyFromBattlePreview();
      return;
    }
    this.openExitConfirm();
  }

  /**
   * 退出确认(压在设置面板之上):后端开战不扣任何消耗,体力(主线首通)与每日次数都在结算时才扣——
   * 中途退出不结算,所以既不发奖也不消耗(PlayerBattleServiceImpl.startBattle / settleBattle,2026-09-24 核对)。
   */
  private openExitConfirm(): void {
    if (!this.root || !this.sim || this.exitConfirmOpen) {
      return;
    }
    // 2026-11-11 B 毛玻璃:与通用二次确认小窗同一套(原型 周报截图/2026-11-11_通用小窗/proto/confirm_b.png,815×433):
    // 标题 + ✕ + 居中两行说明 + 「确认退出(灰玻璃)/ 继续战斗(香槟)」;点面板外 = 继续战斗。
    const shell = this.mountGuardGlass('GuardExitConfirmOverlay', 815, 433, { title: '退出战斗?', onClose: () => this.closeExitConfirm() });
    if (!shell) {
      return;
    }
    const { panel, k, S, X, Y, T } = shell;
    this.exitConfirmOpen = true;
    this.syncBattlePause();
    gameAudio.sfx('ui_click');
    const rush = this.sim.mode === 'rush';
    const lines = [
      rush ? '退出后本局作废,已打到的层数不计入结算。' : '退出后本局作废,不结算奖励。',
      '本局尚未结算,不消耗体力,也不占用挑战次数。',
    ];
    // 两行中心 dy 172 / 218(原型正文行距 46,字号 26),第一行白、第二行灰
    lines.forEach((text, index) => {
      T(panel, `GuardExitConfirmLine_${index}`, text, X(407.5), Y(172 + index * 46), 26, index === 0 ? GLASS_COLOR.text : GLASS_COLOR.sub, S(815 - 120), HorizontalTextAlignment.CENTER);
    });
    // 2026-10-10 用户手机上「点确认退出没反应」:按下即生效(不等抬起,避免手指稍微滑动就丢掉 TOUCH_END),只触发一次;
    // 退出出错时状态栏显示原因(returnToLobbyFromBattlePreview 内逐步兜底)
    let exiting = false;
    const doExit = (): void => {
      if (exiting) {
        return;
      }
      exiting = true;
      this.exitConfirmOpen = false;
      this.settingsOpen = false;
      try {
        this.host.returnToLobbyFromBattlePreview();
      } catch (error) {
        console.error('[LootChain] exit battle failed', error);
        this.host.setStatus(`退出战斗时出现异常,请截图反馈:${String((error as Error)?.message ?? error).slice(0, 80)}`);
      }
    };
    const confirm = mountGlassButton(this.kit, panel, 'GuardExitConfirmOk', '确认退出', X(253.5), Y(358.5), S(269), S(67), k, 'secondary', undefined, 28);
    confirm.on(Node.EventType.TOUCH_END, doExit, this);
    confirm.on(Node.EventType.TOUCH_CANCEL, doExit, this);
    mountGlassButton(this.kit, panel, 'GuardExitConfirmCancel', '继续战斗', X(562), Y(358.5), S(270), S(67), k, 'primary', () => this.closeExitConfirm(), 28);
  }

  // ── docs/37 P1 交互玩法 ──

  /** 每局只弹一次的玩法提示(走状态栏,不加弹框)。 */
  private showInteractHint(key: string, text: string): void {
    if (this.interactHints.has(key)) {
      return;
    }
    this.interactHints.add(key);
    this.host.setStatus(text);
  }

  /** 点在战场上:命中怪物 = 集火标记(再点同一只取消),点空地 = 取消标记。 */
  private handleFieldTap(event: EventTouch): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field || sim.paused || sim.pendingChoice || sim.phase === 'victory' || sim.phase === 'defeat') {
      return;
    }
    const transform = field.getComponent(UITransform);
    if (!transform || typeof event.getUILocation !== 'function') {
      return;
    }
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    const monsterId = this.pickMonsterAt(local.x, local.y);
    if (monsterId === null) {
      if (sim.markedMonsterId !== null) {
        guardMarkMonster(sim, null);
      }
      return;
    }
    const marked = guardMarkMonster(sim, monsterId);
    if (marked === null) {
      return;
    }
    gameAudio.sfx('ui_click');
    const target = sim.monsters.find((entry) => entry.monsterId === marked);
    if (target && sim.bossCast && sim.bossCast.monsterId === marked) {
      this.host.setStatus('已集火 BOSS:打断所需伤害减半!');
    } else if (target) {
      this.showInteractHint('mark', '已集火:射程内的英雄优先攻击它,伤害 +20%。再点一次或点空地取消');
    }
  }

  /** 战场坐标下命中的活怪(按身体中心距离 / 体型半径取最近;BOSS 用身体画面中心偏移)。 */
  private pickMonsterAt(x: number, y: number): number | null {
    const sim = this.sim;
    if (!sim) {
      return null;
    }
    let best: number | null = null;
    let bestScore = 1;
    for (const monster of sim.monsters) {
      if (monster.dead) {
        continue;
      }
      const view = this.monsterViews.get(monster.monsterId);
      if (!view || !view.node.isValid) {
        continue;
      }
      const size = view.node.getComponent(UITransform)?.width ?? this.unitSize();
      const cx = view.node.position.x + this.bossVisualOffsetX(view);
      const cy = view.node.position.y + size * 0.1;
      const radius = Math.max(this.unitSize() * 0.6, size * 0.42);
      const score = Math.hypot(x - cx, y - cy) / radius;
      if (score < bestScore) {
        bestScore = score;
        best = monster.monsterId;
      }
    }
    return best;
  }

  /**
   * 集火标记(2026-10-09 用户「集火效果太简单」换骨骼特效):脚下红色电光环循环(A49-081 red,压扁成透视椭圆,
   * 排在影子之上、身体之下)+ 标记瞬间身体中心红色星芒冲击环一次性(A47-189 sj,自行销毁)。素材未就绪退回程序绘制准星。
   * 节点名 GuardMarkReticle 不变:取消标记 / 死亡时按名销毁。
   */
  private mountMarkReticle(view: GuardUnitView): void {
    const size = view.node.getComponent(UITransform)?.width ?? this.unitSize();
    const unit = this.unitSize();
    const ring = this.attackSpineFxReady.get(GUARD_MARK_FX.ring.effect);
    const burst = this.attackSpineFxReady.get(GUARD_MARK_FX.burst.effect);
    if (!ring) {
      this.prewarmAttackSpineFx(GUARD_MARK_FX.ring);
      this.prewarmAttackSpineFx(GUARD_MARK_FX.burst);
      this.mountMarkReticleFallback(view, size);
      return;
    }
    const offsetX = this.bossVisualOffsetX(view);
    // 脚下电光环:与影子同高(骨骼脚底 -unit×0.45),宽按体型取、钳在 0.9~2.2 格,压扁 0.42 成透视椭圆
    const ringW = Math.max(unit * 0.9, Math.min(unit * 2.2, size * 0.95));
    const node = this.host.addChildPlainNode(view.node, 'GuardMarkReticle', offsetX, -unit * 0.45, 10, 10);
    node.setSiblingIndex(1);
    const holder = this.host.addChildPlainNode(node, 'Ring', 0, 0, 10, 10);
    holder.setScale(1, 0.42, 1);
    const fit = ringW / Math.max(ring.w, ring.h);
    const ringFx = this.host.addChildPlainNode(holder, 'Fx', -ring.cx * fit, -ring.cy * fit, 10, 10);
    ringFx.setScale(fit, fit, 1);
    const ringSkeleton = ringFx.addComponent(sp.Skeleton);
    LobbyGuardBattleRenderer.useSharedFxCache(ringSkeleton);
    ringSkeleton.premultipliedAlpha = false;
    ringSkeleton.skeletonData = ring.data;
    try {
      ringSkeleton.setAnimation(0, ring.animation, true);
    } catch (error) {
      void error;
    }
    node.setScale(1.6, 1.6, 1);
    tween(node).to(0.22, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    if (burst) {
      const burstNode = this.host.addChildPlainNode(view.node, 'GuardMarkBurst', offsetX, size * 0.1, 10, 10);
      const burstFit = (unit * GUARD_MARK_FX.burst.size) / Math.max(burst.w, burst.h);
      const burstFx = this.host.addChildPlainNode(burstNode, 'Fx', -burst.cx * burstFit, -burst.cy * burstFit, 10, 10);
      burstFx.setScale(burstFit, burstFit, 1);
      const burstSkeleton = burstFx.addComponent(sp.Skeleton);
      LobbyGuardBattleRenderer.useSharedFxCache(burstSkeleton);
      burstSkeleton.premultipliedAlpha = false;
      burstSkeleton.skeletonData = burst.data;
      try {
        burstSkeleton.setAnimation(0, burst.animation, false);
      } catch (error) {
        void error;
      }
      tween(burstNode).delay(1.25).call(() => { if (burstNode.isValid) { burstNode.destroy(); } }).start();
    }
  }

  /** 程序绘制准星(骨骼素材未就绪时):红色旋转环 + 四向刻度,盖在怪物身体中心,出现时弹一下。 */
  private mountMarkReticleFallback(view: GuardUnitView, size: number): void {
    const r = Math.max(28, Math.min(90, size * 0.34));
    const node = this.host.addChildPlainNode(view.node, 'GuardMarkReticle', this.bossVisualOffsetX(view), size * 0.1, r * 2, r * 2);
    const g = node.addComponent(Graphics);
    g.strokeColor = rgba(255, 70, 60, 235);
    g.lineWidth = 3;
    g.circle(0, 0, r);
    g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      g.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
      g.lineTo(Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22);
    }
    g.stroke();
    g.fillColor = rgba(255, 90, 70, 230);
    g.circle(0, 0, 4);
    g.fill();
    node.setScale(1.8, 1.8, 1);
    tween(node).to(0.18, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    tween(node).repeatForever(tween().by(2.4, { angle: -360 })).start();
  }

  /** 战技等待手动释放:英雄脚下金色光环脉动 + 身后柔光。 */
  private syncSkillReadyGlow(heroNode: Node, pending: boolean): void {
    const existing = heroNode.getChildByName('GuardSkillReadyGlow');
    if (!pending) {
      existing?.destroy();
      return;
    }
    if (existing) {
      return;
    }
    const unit = this.unitSize();
    const glow = this.host.addChildPlainNode(heroNode, 'GuardSkillReadyGlow', 0, 0, 10, 10);
    glow.setSiblingIndex(0);
    const halo = this.mountSprite(glow, 'Halo', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, unit * 0.05, unit * 1.3, unit * 1.3, rgba(255, 214, 110));
    const haloOp = halo.addComponent(UIOpacity);
    haloOp.opacity = 170;
    tween(haloOp).repeatForever(tween().to(0.35, { opacity: 90 }).to(0.35, { opacity: 200 })).start();
    const ring = this.host.addChildPlainNode(glow, 'Ring', 0, -unit * 0.42, 10, 10);
    const rg = ring.addComponent(Graphics);
    rg.strokeColor = rgba(255, 214, 92, 255);
    rg.lineWidth = 4;
    rg.ellipse(0, 0, unit * 0.44, unit * 0.13);
    rg.stroke();
    tween(ring).repeatForever(tween().to(0.35, { scale: new Vec3(1.18, 1.18, 1) }).to(0.35, { scale: Vec3.ONE })).start();
  }

  /** 共鸣格:发金光的格子(旋转光芒 + 金框 + "共鸣 攻+40%");站上去的英雄飘字确认。 */
  private syncResonance(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const key = `${sim.resonanceCells.join(',')}|${this.mountedLayoutKey}`;
    if (key !== this.resonanceKey) {
      for (const stale of field.children.filter((child) => child.name === 'GuardResonance')) {
        stale.destroy();
      }
      for (const cell of sim.resonanceCells) {
        const tile = this.cellTileRect(cell);
        const node = this.host.addChildPlainNode(field, 'GuardResonance', tile.x, tile.y, tile.w, tile.h);
        node.setSiblingIndex(3);
        const ray = this.mountSprite(node, 'Ray', 'ui/guard/cast_flash/spriteFrame', 0, 0, tile.w * 1.15, tile.w * 1.15, rgba(255, 214, 110));
        ray.addComponent(UIOpacity).opacity = 150;
        tween(ray).repeatForever(tween().by(10, { angle: -360 })).start();
        const frame = this.host.addChildPlainNode(node, 'Frame', 0, 0, tile.w, tile.h);
        const fg = frame.addComponent(Graphics);
        fg.fillColor = rgba(255, 214, 110, 46);
        fg.roundRect(-tile.w * 0.47, -tile.h * 0.45, tile.w * 0.94, tile.h * 0.9, 10);
        fg.fill();
        fg.strokeColor = rgba(255, 220, 120, 235);
        fg.lineWidth = 3;
        fg.roundRect(-tile.w * 0.47, -tile.h * 0.45, tile.w * 0.94, tile.h * 0.9, 10);
        fg.stroke();
        const frameOp = frame.addComponent(UIOpacity);
        tween(frameOp).repeatForever(tween().to(0.7, { opacity: 150 }).to(0.7, { opacity: 255 })).start();
        const tag = this.host.addChildLabel(node, 'Tag', '共鸣 攻+40%', 0, -tile.h * 0.5 - 12, 15, rgba(255, 226, 140), new Size(tile.w * 1.3, 20));
        tag.enableOutline = true;
        tag.outlineColor = rgba(40, 24, 8, 255);
        tag.outlineWidth = 2;
      }
      this.resonanceKey = key;
      if (sim.resonanceCells.length > 0) {
        this.showInteractHint('resonance', '金色共鸣格:把英雄拖上去,本波攻击 +40%、攻速 +15%');
      }
    }
    for (const hero of sim.heroes) {
      const on = sim.resonanceCells.indexOf(hero.cell) >= 0;
      if (on && !this.resonanceUnits.has(hero.unitId)) {
        this.resonanceUnits.add(hero.unitId);
        const at = this.cellCenter(hero.cell);
        this.spawnFloater(at.x, at.y + this.unitSize() * 0.9, '共鸣 攻击+40%', rgba(255, 214, 92), 18);
      } else if (!on) {
        this.resonanceUnits.delete(hero.unitId);
      }
    }
  }

  /** 偷金鼠头顶钱袋(金币堆图标上下晃)+ 名牌。 */
  private mountGreedyBag(view: GuardUnitView): void {
    const size = view.node.getComponent(UITransform)?.width ?? this.unitSize();
    const bagSize = Math.max(34, this.unitSize() * 0.42);
    const bagY = size * 0.55;
    const bag = this.host.addChildPlainNode(view.node, 'GuardGreedyBag', 0, bagY, bagSize, bagSize);
    this.mountSprite(bag, 'Img', 'ui/common/ai/ic_gold_medium/spriteFrame', 0, 0, bagSize, bagSize);
    tween(bag).repeatForever(tween().to(0.25, { position: new Vec3(0, bagY + 6, 0) }).to(0.25, { position: new Vec3(0, bagY, 0) })).start();
    const tag = this.host.addChildLabel(bag, 'Tag', '偷金鼠', 0, bagSize * 0.75, 15, rgba(255, 220, 120), new Size(90, 20));
    tag.enableOutline = true;
    tag.outlineColor = rgba(40, 20, 6, 255);
    tag.outlineWidth = 2;
  }

  /** 流星矿晶视图:下落 → 落地冲击 → 发光待拾取(倒计时环);点击 = 拾取。 */
  private syncPickups(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const live = new Set(sim.pickups.map((pickup) => pickup.pickupId));
    for (const [pickupId, node] of Array.from(this.pickupViews)) {
      if (!live.has(pickupId)) {
        // 拾取/碎掉的演出在事件里已经播了,这里只兜底清理
        if (node.isValid && !node.getChildByName('Bursting')) {
          node.destroy();
        }
        this.pickupViews.delete(pickupId);
      }
    }
    const unit = this.unitSize();
    for (const pickup of sim.pickups) {
      let node = this.pickupViews.get(pickup.pickupId);
      const px = this.xToPx(pickup.x);
      const py = this.monsterY(pickup.lane, pickup.x);
      if (!node) {
        const hit = unit * 1.2;
        node = this.host.addChildPlainNode(field, `GuardPickup_${pickup.pickupId}`, px, py, hit, hit);
        const glow = this.mountSprite(node, 'Glow', 'ui/guard/cast_flash/spriteFrame', 0, 0, unit * 1.3, unit * 1.3, rgba(150, 200, 255));
        glow.addComponent(UIOpacity).opacity = 0;
        tween(glow).repeatForever(tween().by(6, { angle: -360 })).start();
        this.host.addChildPlainNode(node, 'Timer', 0, 0, 10, 10).addComponent(Graphics);
        const gem = this.mountSprite(node, 'Gem', 'ui/common/ai/ic_diamond_gem/spriteFrame', 0, 0, unit * 0.55, unit * 0.55);
        // 下落:从右上方斜砸下来,拖一条亮尾
        const fallFrom = new Vec3(unit * 1.6, unit * 5, 0);
        gem.setPosition(fallFrom);
        gem.angle = 30;
        const trail = this.host.addChildPlainNode(node, 'Trail', 0, 0, 10, 10);
        const tg = trail.addComponent(Graphics);
        const fallSec = Math.max(0.05, (pickup.landAtMs - sim.timeMs) / 1000);
        let elapsed = 0;
        const drawTrail = (): void => {
          if (!trail.isValid || !gem.isValid) {
            return;
          }
          tg.clear();
          tg.strokeColor = rgba(170, 210, 255, 200);
          tg.lineWidth = unit * 0.12;
          tg.moveTo(gem.position.x + unit * 0.6, gem.position.y + unit * 1.8);
          tg.lineTo(gem.position.x, gem.position.y);
          tg.stroke();
        };
        tween(gem)
          .to(fallSec, { position: new Vec3(0, unit * 0.1, 0), angle: 0 }, { easing: 'quadIn', onUpdate: () => { elapsed += 1; drawTrail(); } })
          .call(() => {
            if (!node || !node.isValid) {
              return;
            }
            trail.destroy();
            gameAudio.sfx('chest_land', 0.6);
            const ring = this.mountSprite(node, 'LandRing', 'ui/battle/c1812/effects/hit_ring/spriteFrame', 0, 0, unit * 0.8, unit * 0.8, rgba(170, 210, 255));
            ring.setScale(0.3, 0.3, 1);
            const ringOp = ring.addComponent(UIOpacity);
            tween(ring).to(0.35, { scale: new Vec3(1.8, 1.8, 1) }, { easing: 'quadOut' }).start();
            tween(ringOp).to(0.35, { opacity: 0 }).call(() => { if (ring.isValid) { ring.destroy(); } }).start();
            const glowOp = glow.getComponent(UIOpacity);
            if (glowOp) {
              tween(glowOp).to(0.2, { opacity: 170 }).start();
            }
            tween(gem).repeatForever(tween().to(0.5, { position: new Vec3(0, unit * 0.2, 0) }, { easing: 'sineInOut' }).to(0.5, { position: new Vec3(0, unit * 0.1, 0) }, { easing: 'sineInOut' })).start();
          })
          .start();
        void elapsed;
        node.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
          if (event) {
            event.propagationStopped = true;
          }
          const current = this.sim;
          if (current) {
            guardCollectPickup(current, pickup.pickupId);
          }
        }, this);
        this.pickupViews.set(pickup.pickupId, node);
      }
      // 倒计时环:落地后金蓝环按剩余时间缩(扇形一律 arc(..., true),见 Graphics.arc 方向坑)
      const timer = node.getChildByName('Timer')?.getComponent(Graphics);
      if (timer) {
        timer.clear();
        if (sim.timeMs >= pickup.landAtMs) {
          const left = Math.max(0, Math.min(1, (pickup.expireAtMs - sim.timeMs) / GUARD_METEOR_LIFE_MS));
          timer.strokeColor = rgba(20, 16, 30, 180);
          timer.lineWidth = 6;
          timer.circle(0, unit * 0.12, unit * 0.42);
          timer.stroke();
          timer.strokeColor = left > 0.3 ? rgba(150, 210, 255, 240) : rgba(255, 120, 90, 240);
          timer.lineWidth = 5;
          timer.arc(0, unit * 0.12, unit * 0.42, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * left, true);
          timer.stroke();
        }
      }
    }
  }

  /** 拾取/碎裂:爆一圈光后销毁(节点先打 Bursting 标记,syncPickups 不抢先销毁)。 */
  private burstPickup(node: Node, color: Color): void {
    if (!node.isValid || node.getChildByName('Bursting')) {
      return;
    }
    this.host.addChildPlainNode(node, 'Bursting', 0, 0, 1, 1);
    const unit = this.unitSize();
    node.getChildByName('Timer')?.destroy();
    const burst = this.mountSprite(node, 'Burst', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, unit * 0.12, unit * 0.9, unit * 0.9, color);
    burst.setScale(0.5, 0.5, 1);
    tween(burst).to(0.3, { scale: new Vec3(2.2, 2.2, 1) }, { easing: 'quadOut' }).start();
    const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    tween(op).delay(0.1).to(0.25, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  // ── docs/37 F 水晶法术栏 ──

  private static readonly SPELL_SLOT = 88;
  private static readonly SPELL_GAP = 26;

  /**
   * 右下操作区(法术栏 + 陷阱 + 强化 + 召唤)的统一缩放(2026-10-02 仅横屏 + 多分辨率):
   * 原尺寸按 1920 宽排成一行,4:3(1440 宽)与 16:9 手机(1280 宽)放不下,法术栏会压到强化按钮、英雄格上。
   * 这里算出「英雄格右缘 → 屏幕右缘」可用宽度能放下整行的比例,下限 0.6;1920 及更宽保持 1。
   */
  private bottomHudScale(): number {
    const width = this.layoutWidth;
    const summonW = Math.min(264, width * 0.2);
    const enhanceW = Math.min(236, width * 0.18);
    const required = 24 + summonW + 16 + enhanceW + 16 + 80 + 30 + this.spellBarWidth();
    const available = width / 2 - (this.heroZonePx().heroRight + 16);
    return Math.max(0.6, Math.min(1, available / required));
  }

  private spellBarCenterX(): number {
    // 宽屏保持原来的 x=60;窄屏贴在陷阱按钮左边(整组右对齐到强化按钮左侧)
    const width = this.layoutWidth;
    const s = this.bottomHudScale();
    const enhanceLeft = width / 2 - 24 - (Math.min(264, width * 0.2) + 16 + Math.min(236, width * 0.18)) * s;
    return Math.min(60, enhanceLeft - (16 + 80 + 30) * s - this.spellBarWidth() * s / 2);
  }

  /** 法术栏宽度随格数(2~5 格,docs/38 §9)。 */
  private spellBarWidth(): number {
    const size = LobbyGuardBattleRenderer.SPELL_SLOT;
    const count = Math.max(1, this.sim?.spellLoadout.length ?? 3);
    return size * count + LobbyGuardBattleRenderer.SPELL_GAP * (count - 1);
  }

  private spellBarY(): number {
    // 名字标签要让开最底部的操作提示行(-H/2+16)
    return -this.layoutHeight / 2 + (50 + LobbyGuardBattleRenderer.SPELL_SLOT / 2 + 14) * this.bottomHudScale();
  }

  /** 底部法术栏:出战法术圆形位(格数来自水晶快照)+ 上方能量条;点击 = 无目标法术直接放,按住拖 = 瞄准法术落点。 */
  private renderSpellBar(): void {
    const root = this.root;
    const sim = this.sim;
    if (!root || !sim) {
      return;
    }
    root.getChildByName('GuardSpellBar')?.destroy();
    const size = LobbyGuardBattleRenderer.SPELL_SLOT;
    const gap = LobbyGuardBattleRenderer.SPELL_GAP;
    const barW = this.spellBarWidth();
    const bar = this.host.addChildPlainNode(root, 'GuardSpellBar', this.spellBarCenterX(), this.spellBarY(), barW, size + 60);
    const hudScale = this.bottomHudScale();
    bar.setScale(hudScale, hudScale, 1);
    // 2026-10-11 美化:条加高到 18;2026-10-15 金框改为条体自身的圆角金边 + 沿边绕行的流光 / 星芒(mountEnergyBarFx)
    const energyBg = this.host.addChildPlainNode(bar, 'Energy', 0, size / 2 + 26, barW, 18);
    energyBg.addComponent(Graphics);
    const energyFx = this.host.addChildPlainNode(bar, 'EnergyFx', 0, size / 2 + 26, barW, 18);
    this.mountEnergyBarFx(energyFx, barW, 18);
    const energyText = this.host.addChildLabel(bar, 'EnergyText', '', -barW / 2, size / 2 + 46, 15, rgba(170, 220, 255), new Size(barW, 20), HorizontalTextAlignment.LEFT);
    energyText.enableOutline = true;
    energyText.outlineColor = rgba(10, 16, 28, 255);
    energyText.outlineWidth = 2;
    LobbyGuardBattleRenderer.hudCharCache(energyText, true);
    sim.spellLoadout.forEach((id, index) => {
      const def = GUARD_SPELLS[id];
      const x = -barW / 2 + size / 2 + index * (size + gap);
      const slot = this.host.addChildPlainNode(bar, `Spell_${id}`, x, 0, size, size);
      const g = slot.addComponent(Graphics);
      g.fillColor = rgba(14, 10, 8, 225);
      g.circle(0, 0, size / 2);
      g.fill();
      const iconSize = id === 'quake' ? size : size * 0.72;
      this.mountSprite(slot, 'Icon', GUARD_SPELL_ICON[id], 0, 0, iconSize, iconSize);
      this.host.addChildPlainNode(slot, 'Charge', 0, 0, 10, 10).addComponent(Graphics);
      // 档位边框(docs/39:T1 青铜 / T2 银 / T3 金,金边外加一圈细光环)——一眼看出法术等级
      const level = guardSpellLevel(sim, id);
      const tier = guardSpellTier(level);
      const rim = this.host.addChildPlainNode(slot, 'Rim', 0, 0, 10, 10).addComponent(Graphics);
      rim.strokeColor = GUARD_SPELL_TIER_RIM[tier - 1];
      rim.lineWidth = tier === 3 ? 4 : 3;
      rim.circle(0, 0, size / 2);
      rim.stroke();
      if (tier === 3) {
        rim.strokeColor = rgba(255, 236, 160, 150);
        rim.lineWidth = 2;
        rim.circle(0, 0, size / 2 + 4);
        rim.stroke();
      }
      const lvBadge = this.host.addChildLabel(slot, 'Level', `Lv.${level}`, -size * 0.34, size * 0.36, 14, tier === 3 ? rgba(255, 224, 120) : tier === 2 ? rgba(226, 236, 255) : rgba(236, 214, 170), new Size(44, 18));
      lvBadge.isBold = true;
      lvBadge.overflow = Label.Overflow.SHRINK;
      lvBadge.enableOutline = true;
      lvBadge.outlineColor = rgba(16, 10, 6, 255);
      lvBadge.outlineWidth = 2;
      const cost = this.host.addChildLabel(slot, 'Cost', `${def.cost}`, size * 0.36, size * 0.36, 15, rgba(170, 220, 255), new Size(40, 20));
      cost.enableOutline = true;
      cost.outlineColor = rgba(10, 16, 28, 255);
      cost.outlineWidth = 2;
      LobbyGuardBattleRenderer.hudCharCache(cost, true);
      const name = this.host.addChildLabel(slot, 'Name', def.name, 0, -size / 2 - 13, 15, rgba(240, 222, 186), new Size(size + gap, 20));
      name.overflow = Label.Overflow.SHRINK;
      name.enableOutline = true;
      name.outlineColor = rgba(20, 12, 6, 255);
      name.outlineWidth = 2;
      this.bindSpellSlot(slot, id);
    });
    this.refreshSpellBar();
  }

  /** 能量条特效:金框流光铺满条(用 sizePx=条宽,再按条高压扁)+ 蓝色光环「能量头」。特效没就绪时先预热,就绪后 refreshSpellBar 下一次重建时挂上。 */
  /**
   * 2026-10-15 用户「包裹能量条的长方形特效要圆角,并融合能量条的边框」:原 A49-394 是直角切角的序列帧框,
   * 怎么缩放都出不了圆角,而且比条体大一圈、和条边框是两条线。改为:金边框 + 外发光由 refreshSpellBar 直接画在
   * 条体圆角边上(同一条线);这里只挂两道沿圆角边框绕行的流光(烘焙光弹精灵)+ 三颗轮流闪的星芒,
   * 全是普通精灵,无骨骼、无遮罩、不逐帧重画 Graphics。
   */
  private mountEnergyBarFx(holder: Node, barW: number, barH: number): void {
    const r = barH / 2;
    const straight = Math.max(0, barW - barH);
    const arc = Math.PI * r;
    const perimeter = straight * 2 + arc * 2;
    // 沿圆角框顺时针取点(从上沿左端起):返回坐标 + 前进方向角(度),光弹头朝前进方向
    const pointAt = (s0: number): { x: number; y: number; angle: number } => {
      let d = ((s0 % perimeter) + perimeter) % perimeter;
      if (d < straight) {
        return { x: -straight / 2 + d, y: r, angle: 0 };
      }
      d -= straight;
      if (d < arc) {
        const a = Math.PI / 2 - d / r;
        return { x: straight / 2 + Math.cos(a) * r, y: Math.sin(a) * r, angle: ((a - Math.PI / 2) * 180) / Math.PI };
      }
      d -= arc;
      if (d < straight) {
        return { x: straight / 2 - d, y: -r, angle: 180 };
      }
      d -= straight;
      const a = -Math.PI / 2 - d / r;
      return { x: -straight / 2 + Math.cos(a) * r, y: Math.sin(a) * r, angle: ((a - Math.PI / 2) * 180) / Math.PI };
    };
    const streakFrame = boltFrame(new Color(255, 214, 130, 255), 130, 140);
    const period = Math.max(3, perimeter / 170);
    [0, 0.5].forEach((phase, index) => {
      if (!streakFrame) {
        return;
      }
      const streak = this.host.addChildPlainNode(holder, `EnergyStreak_${index}`, 0, 0, 10, 10);
      this.mountBakedSprite(streak, streakFrame, -BOLT_SIZE.originX * 0.8, 0, BOLT_SIZE.w * 0.8, barH * 0.95);
      const place = (t: number): void => {
        const pt = pointAt((t + phase) * perimeter);
        streak.setPosition(pt.x, pt.y, 0);
        streak.angle = pt.angle;
      };
      place(0);
      const proxy = { t: 0 };
      const tw: Tween<{ t: number }> = tween(proxy)
        .repeatForever(tween(proxy).set({ t: 0 }).to(period, { t: 1 }, {
          onUpdate: () => {
            if (!streak.isValid) {
              tw.stop();
              return;
            }
            place(proxy.t);
          },
        }))
        .start();
    });
    // 星芒:落在上下两条直边上随机位置,轮流放大闪一下
    const sparkleFrame = impactFrame(new Color(255, 236, 190, 255));
    for (let i = 0; i < 3 && sparkleFrame; i += 1) {
      const sparkle = this.host.addChildPlainNode(holder, `EnergySparkle_${i}`, 0, 0, 10, 10);
      this.mountBakedSprite(sparkle, sparkleFrame, 0, 0, barH * 1.2, barH * 1.2);
      sparkle.setScale(0, 0, 1);
      const reposition = (): void => {
        const top = Math.random() < 0.5;
        sparkle.setPosition(-straight / 2 + Math.random() * straight, top ? r : -r, 0);
      };
      tween(sparkle)
        .delay(0.4 + i * 0.9)
        .repeatForever(tween(sparkle)
          .call(reposition)
          .to(0.28, { scale: new Vec3(1, 1, 1) })
          .to(0.4, { scale: new Vec3(0, 0, 1) })
          .delay(1.4 + Math.random() * 1.2))
        .start();
    }
  }

  private refreshSpellBar(): void {
    const sim = this.sim;
    const bar = this.root?.getChildByName('GuardSpellBar');
    if (!sim || !bar || !bar.isValid) {
      return;
    }
    const size = LobbyGuardBattleRenderer.SPELL_SLOT;
    const barW = this.spellBarWidth();
    const energy = sim.spellEnergy;
    const eg = bar.getChildByName('Energy')?.getComponent(Graphics);
    const fillW = Math.max(8, barW * Math.min(1, energy / sim.spellEnergyMax));
    const full = energy >= sim.spellEnergyMax;
    if (eg && !this.sameDrawKey(eg.node, `${Math.round(barW)}:${Math.round(fillW)}:${full ? 1 : 0}`)) {
      // 2026-10-11 美化:深底 + 双层蓝填充(下深上亮,顶部一道高光)+ 满能量转金白;外框由 EnergyFx 的金框流光承担
      const h = 18;
      const r = h / 2;
      eg.clear();
      // 2026-10-15:金边框 + 外发光直接画在条体圆角边上(先画外发光,内半边被深底盖住),流光 / 星芒见 mountEnergyBarFx。
      // 描边不用 roundRect:半径 = 半高时两端留零长度竖边,描边会在左右端算出尖刺 → 两端半圆用折线自己画
      eg.lineJoin = Graphics.LineJoin.ROUND;
      eg.lineWidth = 7;
      eg.strokeColor = full ? rgba(255, 210, 110, 70) : rgba(255, 190, 90, 45);
      pillStrokePath(eg, barW, h);
      eg.stroke();
      eg.lineWidth = 4;
      eg.strokeColor = full ? rgba(255, 220, 130, 120) : rgba(255, 200, 110, 80);
      pillStrokePath(eg, barW, h);
      eg.stroke();
      eg.fillColor = rgba(6, 9, 20, 225);
      eg.roundRect(-barW / 2, -r, barW, h, r);
      eg.fill();
      eg.fillColor = full ? rgba(255, 214, 120, 250) : rgba(40, 120, 230, 250);
      eg.roundRect(-barW / 2 + 2, -r + 2, Math.max(4, fillW - 4), h - 4, r - 2);
      eg.fill();
      eg.fillColor = full ? rgba(255, 244, 200, 170) : rgba(140, 210, 255, 160);
      eg.roundRect(-barW / 2 + 2, 0, Math.max(4, fillW - 4), r - 3, r - 3);
      eg.fill();
      eg.strokeColor = full ? rgba(255, 240, 190, 250) : rgba(255, 222, 150, 235);
      eg.lineWidth = 1.6;
      pillStrokePath(eg, barW, h);
      eg.stroke();
    }

    const text = bar.getChildByName('EnergyText')?.getComponent(Label);
    const energyString = `水晶能量 ${Math.floor(energy)} / ${sim.spellEnergyMax}`;
    if (text && text.string !== energyString) {
      text.string = energyString;
    }
    for (const id of sim.spellLoadout) {
      const slot = bar.getChildByName(`Spell_${id}`);
      if (!slot) {
        continue;
      }
      const def = GUARD_SPELLS[id];
      const castable = guardSpellCastable(sim, id);
      const icon = slot.getChildByName('Icon');
      const iconOp = icon ? icon.getComponent(UIOpacity) ?? icon.addComponent(UIOpacity) : null;
      if (iconOp) {
        iconOp.opacity = castable ? 255 : 110;
      }
      // 金矿爆发每波限 1 次:用过后图标变暗并挂「下一波可用」,不让玩家以为坏了或在冷却(2026-10-02 用户反馈)
      const lockedThisWave = id === 'goldrush' && sim.goldrushWave === sim.wave;
      let stateTag = slot.getChildByName('StateTag')?.getComponent(Label) ?? null;
      if (lockedThisWave && !stateTag) {
        stateTag = this.host.addChildLabel(slot, 'StateTag', '下一波\n可用', 0, 0, 17, rgba(255, 214, 140), new Size(size, 44));
        stateTag.isBold = true;
        stateTag.lineHeight = 20;
        stateTag.overflow = Label.Overflow.SHRINK;
        stateTag.enableOutline = true;
        stateTag.outlineColor = rgba(16, 10, 6, 255);
        stateTag.outlineWidth = 3;
      }
      if (stateTag) {
        stateTag.node.active = lockedThisWave;
      }
      const charge = slot.getChildByName('Charge')?.getComponent(Graphics);
      const chargeFrac = Math.min(1, energy / def.cost);
      // 充能环按 2% 步进出签名;就绪脉冲改成透明度 tween(2026-10-10 长帧归因:原先按 8 档亮度每 tick 重画 Graphics,三格每秒几十次重铺顶点)
      const chargeKey = chargeFrac < 1 ? `a${Math.round(chargeFrac * 50)}` : castable ? 'p' : 'n';
      if (charge && !this.sameDrawKey(charge.node, chargeKey)) {
        charge.clear();
        const frac = chargeFrac;
        const chargeOpacity = charge.node.getComponent(UIOpacity) ?? charge.node.addComponent(UIOpacity);
        Tween.stopAllByTarget(chargeOpacity);
        chargeOpacity.opacity = 255;
        if (frac < 1) {
          // 充能进度环(扇形一律 arc(..., true))
          charge.strokeColor = rgba(110, 180, 255, 235);
          charge.lineWidth = 5;
          charge.arc(0, 0, size / 2 - 5, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * frac, true);
          charge.stroke();
        } else if (castable) {
          charge.strokeColor = rgba(255, 224, 130, 240);
          charge.lineWidth = 6;
          charge.circle(0, 0, size / 2 + 3);
          charge.stroke();
          tween(chargeOpacity).repeatForever(tween().to(0.5, { opacity: 150 }).to(0.5, { opacity: 255 })).start();
        }
      }
    }
  }

  /** 法术位手势:点击 = 无目标法术施放;按住拖到战场 = 瞄准(冰封/九天神雷),松手在战场内施放,拖回法术栏取消。 */
  private bindSpellSlot(slot: Node, id: GuardSpellId): void {
    // 长按 0.45 秒(手指 / 鼠标不动)= 显示法术详情,松手不施放(2026-10-02 用户:「长按显示技能详细信息」)。
    // 2026-10-05 用户「需要长按才显示详细信息,单击不显示」:去掉电脑端鼠标悬停显示,点击只施放。
    slot.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      (event as unknown as { propagationStopped?: boolean }).propagationStopped = true;
      this.spellDrag = { id, moved: 0, aim: null };
      this.clearSpellTipTimer();
      this.spellTipTimer = setTimeout(() => {
        this.spellTipTimer = null;
        const drag = this.spellDrag;
        if (drag && drag.id === id && drag.moved < 12 && slot.isValid) {
          drag.tipShown = true;
          this.showSpellTip(id, slot);
        }
      }, 450);
    }, this);
    slot.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      const drag = this.spellDrag;
      if (!drag || drag.id !== id) {
        return;
      }
      const delta = event.getUIDelta();
      drag.moved += Math.abs(delta.x) + Math.abs(delta.y);
      if (drag.moved >= 12) {
        // 开始拖动:取消长按详情,照常进入瞄准
        this.clearSpellTipTimer();
        if (drag.tipShown) {
          drag.tipShown = false;
          this.hideSpellTip();
        }
      }
      if (GUARD_SPELLS[id].target === 'none') {
        return;
      }
      const ui = event.getUILocation();
      // 2026-09-28 用户:"法术拖拽怎么取消"——拖回法术栏(出现「拖回这里取消」圈)或拖到战场怪物带之外,松手即取消。
      const overBar = this.isOverSpellBar(ui.x, ui.y);
      drag.aim = overBar ? null : this.spellAimAt(ui.x, ui.y);
      this.drawSpellAim(id, drag.aim);
      this.drawSpellCancelHint(drag.moved >= 12, overBar, drag.aim === null, ui.x, ui.y);
    }, this);
    const finish = (event: EventTouch | null): void => {
      const drag = this.spellDrag;
      this.spellDrag = null;
      this.clearSpellTipTimer();
      this.fieldNode?.getChildByName('GuardSpellAim')?.destroy();
      this.drawSpellCancelHint(false, false, false, 0, 0);
      const sim = this.sim;
      if (!drag || drag.id !== id || !sim) {
        return;
      }
      if (event) {
        (event as unknown as { propagationStopped?: boolean }).propagationStopped = true;
      }
      if (drag.tipShown) {
        // 长按看详情:松手只关详情,不施放
        this.hideSpellTip();
        return;
      }
      const def = GUARD_SPELLS[id];
      if (def.target === 'none') {
        if (!guardCastSpell(sim, id)) {
          this.host.setStatus(sim.spellLoadout.indexOf(id) >= 0 && id === 'goldrush' && sim.goldrushWave === sim.wave ? '金矿爆发每波只能用 1 次' : `水晶能量不足(需要 ${def.cost})`);
        }
        return;
      }
      if (drag.moved < 12) {
        this.host.setStatus(`按住「${def.name}」拖到战场上施放;拖回法术栏松手可取消`);
        return;
      }
      if (!drag.aim) {
        this.host.setStatus(`已取消「${def.name}」,未消耗能量`);
        return;
      }
      if (!guardCastSpell(sim, id, drag.aim)) {
        this.host.setStatus(`水晶能量不足(需要 ${def.cost})`);
      }
    };
    slot.on(Node.EventType.TOUCH_END, (event: EventTouch) => finish(event), this);
    slot.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => finish(event), this);
  }

  private clearSpellTipTimer(): void {
    if (this.spellTipTimer) {
      clearTimeout(this.spellTipTimer);
      this.spellTipTimer = null;
    }
  }

  /** 法术当前状态一句话(详情卡用)。 */
  private spellStateText(id: GuardSpellId): { text: string; ready: boolean } {
    const sim = this.sim;
    if (!sim) {
      return { text: '', ready: false };
    }
    const cost = GUARD_SPELLS[id].cost;
    if (id === 'goldrush' && sim.goldrushWave === sim.wave) {
      return { text: '本波已施放,下一波开始后可再用', ready: false };
    }
    if (sim.spellEnergy < cost) {
      return { text: `能量不足:${Math.floor(sim.spellEnergy)} / ${cost}(击杀怪物、波次进行中会回能量)`, ready: false };
    }
    return guardSpellCastable(sim, id) ? { text: '可施放', ready: true } : { text: '当前不可施放', ready: false };
  }

  /** 法术详情卡:名字 + 等级、能量与施放方式、当前效果、当前状态;显示在法术栏上方,对准该法术位。 */
  private showSpellTip(id: GuardSpellId, slot: Node): void {
    const root = this.root;
    const sim = this.sim;
    if (!root || !sim || !slot.isValid) {
      return;
    }
    this.hideSpellTip();
    const def = GUARD_SPELLS[id];
    const level = guardSpellLevel(sim, id);
    const w = 440;
    const h = 236;
    const rootTf = root.getComponent(UITransform);
    const local = rootTf ? rootTf.convertToNodeSpaceAR(slot.worldPosition) : new Vec3(0, 0, 0);
    const hudScale = this.bottomHudScale();
    const x = Math.max(-this.layoutWidth / 2 + w / 2 + 12, Math.min(this.layoutWidth / 2 - w / 2 - 12, local.x));
    const y = this.spellBarY() + (LobbyGuardBattleRenderer.SPELL_SLOT / 2 + 70) * hudScale + h / 2;
    const tip = this.host.addChildPlainNode(root, 'GuardSpellTip', x, y, w, h);
    tip.setSiblingIndex(root.children.length - 1);
    const g = tip.addComponent(Graphics);
    g.fillColor = rgba(14, 10, 8, 240);
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.fill();
    g.strokeColor = rgba(214, 168, 92, 230);
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.stroke();
    const pad = 20;
    const title = this.host.addChildLabel(tip, 'Title', `${def.name} Lv.${level}`, -w / 2 + pad, h / 2 - 26, 24, rgba(255, 226, 150), new Size(w - pad * 2, 30), HorizontalTextAlignment.LEFT);
    title.isBold = true;
    const how = def.target === 'none' ? '点击施放' : '按住拖到战场施放';
    const meta = this.host.addChildLabel(tip, 'Meta', `能量 ${def.cost} · ${how}${id === 'goldrush' ? ' · 每波限 1 次' : ''}`, -w / 2 + pad, h / 2 - 58, 17, rgba(160, 210, 255), new Size(w - pad * 2, 24), HorizontalTextAlignment.LEFT);
    meta.overflow = Label.Overflow.SHRINK;
    const desc = this.host.addChildLabel(tip, 'Desc', guardSpellDescribe(id, level), -w / 2 + pad, -6, 17, rgba(232, 222, 200), new Size(w - pad * 2, 96), HorizontalTextAlignment.LEFT);
    desc.enableWrapText = true;
    desc.lineHeight = 23;
    desc.overflow = Label.Overflow.SHRINK;
    desc.verticalAlign = VerticalTextAlignment.TOP;
    const state = this.spellStateText(id);
    const stateLabel = this.host.addChildLabel(tip, 'State', state.text, -w / 2 + pad, -h / 2 + 22, 18, state.ready ? rgba(150, 240, 160) : rgba(255, 176, 110), new Size(w - pad * 2, 26), HorizontalTextAlignment.LEFT);
    stateLabel.overflow = Label.Overflow.SHRINK;
  }

  private hideSpellTip(): void {
    this.root?.getChildByName('GuardSpellTip')?.destroy();
  }

  /** UI 坐标是否落在底部法术栏范围内(含上方能量条,四周放宽 24px)——拖回这里松手 = 取消。 */
  private isOverSpellBar(uiX: number, uiY: number): boolean {
    const bar = this.root?.getChildByName('GuardSpellBar');
    const transform = bar?.getComponent(UITransform);
    if (!bar || !transform) {
      return false;
    }
    const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
    return Math.abs(local.x) <= transform.width / 2 + 24 && Math.abs(local.y) <= transform.height / 2 + 24;
  }

  /**
   * 拖拽取消提示:拖动开始后法术栏上方出现「拖回这里取消」红圈(指到上面时变亮放大);
   * 指在无效区域(怪物带之外)时手指旁跟一个「松手取消」小标签。show=false 时全部移除。
   */
  private drawSpellCancelHint(show: boolean, overBar: boolean, invalid: boolean, uiX: number, uiY: number): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const zone = root.getChildByName('GuardSpellCancelZone');
    const tag = root.getChildByName('GuardSpellCancelTag');
    if (!show) {
      zone?.destroy();
      tag?.destroy();
      return;
    }
    const bar = root.getChildByName('GuardSpellBar');
    const barTransform = bar?.getComponent(UITransform);
    let zoneNode = zone;
    if (!zoneNode && bar && barTransform) {
      const zw = barTransform.width + 40;
      const zh = barTransform.height + 30;
      zoneNode = this.host.addChildPlainNode(root, 'GuardSpellCancelZone', bar.position.x, bar.position.y + 8 * bar.scale.y, zw, zh);
      zoneNode.setScale(bar.scale);
      zoneNode.addComponent(Graphics);
      const label = this.host.addChildLabel(zoneNode, 'Text', '✕ 拖回这里取消', 0, zh / 2 + 16, 18, rgba(255, 190, 180), new Size(zw, 24));
      label.enableOutline = true;
      label.outlineColor = rgba(40, 8, 8, 255);
      label.outlineWidth = 2;
      label.isBold = true;
    }
    if (zoneNode && barTransform) {
      const zw = barTransform.width + 40;
      const zh = barTransform.height + 30;
      const g = zoneNode.getComponent(Graphics);
      if (g) {
        g.clear();
        g.fillColor = overBar ? rgba(180, 30, 30, 110) : rgba(120, 20, 20, 55);
        g.roundRect(-zw / 2, -zh / 2, zw, zh, 18);
        g.fill();
        g.strokeColor = overBar ? rgba(255, 110, 100, 255) : rgba(220, 90, 80, 170);
        g.lineWidth = overBar ? 3 : 2;
        g.roundRect(-zw / 2, -zh / 2, zw, zh, 18);
        g.stroke();
      }
      zoneNode.setScale(overBar ? 1.04 : 1, overBar ? 1.04 : 1, 1);
    }
    // 手指旁标签:无效区域 / 在取消区上 → 「松手取消」
    const rootTransform = root.getComponent(UITransform);
    if (invalid && rootTransform) {
      const local = rootTransform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
      let tagNode = tag;
      if (!tagNode) {
        tagNode = this.host.addChildPlainNode(root, 'GuardSpellCancelTag', 0, 0, 120, 30);
        const tg = tagNode.addComponent(Graphics);
        tg.fillColor = rgba(20, 10, 10, 210);
        tg.roundRect(-60, -15, 120, 30, 15);
        tg.fill();
        tg.strokeColor = rgba(230, 110, 100, 220);
        tg.lineWidth = 1.5;
        tg.roundRect(-60, -15, 120, 30, 15);
        tg.stroke();
        const text = this.host.addChildLabel(tagNode, 'Text', '松手取消', 0, 0, 16, rgba(255, 200, 190), new Size(110, 24));
        text.isBold = true;
      }
      tagNode.setPosition(local.x + 70, local.y + 46, 0);
      tagNode.setSiblingIndex(root.children.length - 1);
    } else {
      tag?.destroy();
    }
  }

  /** xToPx 的反函数(战场像素 → 格)。 */
  private pxToX(px: number): number {
    const { heroLeft, heroRight, runwayRight } = this.heroZonePx();
    const split = LobbyGuardBattleRenderer.HERO_ZONE_SIM_END;
    if (px <= heroRight) {
      return ((px - heroLeft) / (heroRight - heroLeft)) * split;
    }
    return split + ((px - heroRight) / (runwayRight - heroRight)) * (GUARD_SPAWN_X - split);
  }

  /** UI 坐标 → 法术落点(x 格 + 最近车道);落在战场怪物带以外返回 null(松手即取消)。 */
  private spellAimAt(uiX: number, uiY: number): { lane: number; x: number } | null {
    const field = this.fieldNode;
    const transform = field?.getComponent(UITransform);
    if (!field || !transform) {
      return null;
    }
    const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
    const x = this.pxToX(local.x);
    if (x < 0.3 || x > GUARD_SPAWN_X) {
      return null;
    }
    const y0 = this.monsterY(0, x);
    const y1 = this.monsterY(1, x);
    const band = this.unitSize() * 1.1;
    if (local.y > Math.max(y0, y1) + band || local.y < Math.min(y0, y1) - band) {
      return null;
    }
    return { lane: Math.abs(local.y - y0) <= Math.abs(local.y - y1) ? 0 : 1, x };
  }

  /** 瞄准指示:落点处覆盖两条车道的椭圆范围(冰封蓝 / 九天神雷金),落点无效时不画。 */
  private drawSpellAim(id: GuardSpellId, aim: { lane: number; x: number } | null): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    let node = field.getChildByName('GuardSpellAim');
    if (!node) {
      node = this.host.addChildPlainNode(field, 'GuardSpellAim', 0, 0, 10, 10);
      node.addComponent(Graphics);
    }
    node.setSiblingIndex(field.children.length - 1);
    const g = node.getComponent(Graphics);
    if (!g) {
      return;
    }
    g.clear();
    if (!aim) {
      return;
    }
    const level = this.sim ? guardSpellLevel(this.sim, id) : 1;
    const row = guardSpellRow(id, level);
    const radius = row.radius;
    const cx = this.xToPx(aim.x);
    const rx = Math.max(this.unitSize() * 0.6, (this.xToPx(Math.min(GUARD_SPAWN_X, aim.x + radius)) - this.xToPx(Math.max(0, aim.x - radius))) / 2);
    const y0 = this.monsterY(0, aim.x);
    const y1 = this.monsterY(1, aim.x);
    const cy = (y0 + y1) / 2;
    const ry = Math.abs(y0 - y1) / 2 + this.unitSize() * 0.6;
    const color = id === 'frost' ? rgba(120, 200, 255, 255) : rgba(255, 220, 110, 255);
    g.fillColor = new Color(color.r, color.g, color.b, 50);
    g.ellipse(cx, cy, rx, ry);
    g.fill();
    g.strokeColor = new Color(color.r, color.g, color.b, 230);
    g.lineWidth = 3 + guardSpellTier(level);
    g.ellipse(cx, cy, rx, ry);
    g.stroke();
    if (id === 'thunder' && row.chain > 0) {
      // 「连锁闪电」弹射范围:落点 3 格内的外圈(虚线,只描边)
      const chainRx = Math.max(rx, (this.xToPx(Math.min(GUARD_SPAWN_X, aim.x + GUARD_SPELL_CHAIN_RANGE)) - this.xToPx(Math.max(0, aim.x - GUARD_SPELL_CHAIN_RANGE))) / 2);
      g.strokeColor = new Color(color.r, color.g, color.b, 150);
      g.lineWidth = 2;
      const steps = 36;
      for (let i = 0; i < steps; i += 2) {
        const a0 = (i / steps) * Math.PI * 2;
        const a1 = ((i + 1) / steps) * Math.PI * 2;
        g.moveTo(cx + Math.cos(a0) * chainRx, cy + Math.sin(a0) * (ry + this.unitSize() * 0.2));
        g.lineTo(cx + Math.cos(a1) * chainRx, cy + Math.sin(a1) * (ry + this.unitSize() * 0.2));
      }
      g.stroke();
    }
  }

  /** 法术表现(sim 已结算,这里只演)。 */
  /** 循环型法术(冰封 / 壁垒):挂到独立容器循环播放,holdMs 后整容器销毁;未就绪返回 false 走贴图回退。 */
  private spawnSpellLoopFx(spec: GuardSpellFxSpec, px: number, py: number, sizeMult = 1, holdMs = spec.holdMs, squashY = 1, opacity = 255): boolean {
    const field = this.fieldNode;
    if (!field) {
      return false;
    }
    const holder = this.host.addChildPlainNode(field, 'GuardSpellLoopFx', px, py, 10, 10);
    holder.setSiblingIndex(field.children.length - 1);
    const shaped = squashY !== 1 ? Object.assign({}, spec, { squashY }) : spec;
    if (!this.spawnOverlaySpineFx(holder, shaped, 0, 0, this.unitSize() * spec.size * sizeMult, 0, true)) {
      holder.destroy();
      return false;
    }
    if (opacity < 255) {
      holder.addComponent(UIOpacity).opacity = opacity;
    }
    setTimeout(() => { if (holder.isValid) { holder.destroy(); } }, holdMs);
    return true;
  }

  /**
   * 法术等级点缀(docs/39 "每一级都看得出提升"):Lv2 起施法处多一团同色光晕,Lv4 起再叠一圈向外扩的光环,
   * Lv5 加金色星芒。尺寸随等级递增。全部用 Sprite(UIOpacity 淡得掉),不占骨骼特效名额。
   */
  private spellLevelAccent(px: number, py: number, level: number, color: Color, baseSize: number): void {
    const field = this.fieldNode;
    if (!field || level < 2) {
      return;
    }
    // Lv2+:同色柔光一团(越高越大越亮)
    const bloom = (size: number, peak: number, sec: number): void => {
      const node = this.mountSoftFx(field, 'GuardSpellAccent', 'glow', px, py, size, size * 0.62, color);
      node.setSiblingIndex(field.children.length - 1);
      node.setScale(0.5, 0.5, 1);
      const op = node.addComponent(UIOpacity);
      op.opacity = 0;
      tween(node).to(sec * 0.35, { scale: Vec3.ONE }, { easing: 'quadOut' }).start();
      tween(op).to(sec * 0.25, { opacity: peak }).delay(sec * 0.25).to(sec * 0.5, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
    };
    bloom(baseSize * (0.7 + 0.15 * level), Math.min(255, 150 + 20 * level), 0.8);
    // Lv4+:贴地光环向外扩(压扁成地面椭圆),Lv5 两圈
    const ring = (delay: number, to: number): void => {
      const node = this.mountSoftFx(field, 'GuardSpellAccent', 'ring', px, py, baseSize * 0.6, baseSize * 0.6, color);
      node.setSiblingIndex(field.children.length - 1);
      node.setScale(0.3, 0.14, 1);
      const op = node.addComponent(UIOpacity);
      op.opacity = 0;
      tween(node).delay(delay).to(0.6, { scale: new Vec3(to, to * 0.42, 1) }, { easing: 'quadOut' }).start();
      tween(op).delay(delay).to(0.08, { opacity: 235 }).to(0.52, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
    };
    if (level >= 4) {
      ring(0, 1.6 + 0.3 * (level - 4));
    }
    if (level >= 5) {
      ring(0.16, 2.3);
      bloom(baseSize * 0.55, 255, 0.5);
    }
  }

  /** Lv5 新效果本局第一次触发:大招式金色名牌(不暂停,docs/37 口径)。 */
  private showSpellUnlockBanner(id: GuardSpellId, x: number, y: number): void {
    const field = this.fieldNode;
    if (!field || this.spellLv5Shown.has(id)) {
      return;
    }
    this.spellLv5Shown.add(id);
    const text = `${GUARD_SPELLS[id].name}·${GUARD_SPELL_UNLOCK_NAMES[id].lv5}!`;
    const u = this.unitSize();
    const px = Math.max(-0.5 * this.layoutWidth + 2 * u, Math.min(0.5 * this.layoutWidth - 2 * u, x));
    const py = Math.min(y, GUARD_FX_SAFE.top * this.layoutHeight - 30);
    const plate = this.host.addChildLabel(field, 'GuardSpellLv5Banner', text, px, py, 28, rgba(255, 220, 110), new Size(u * 4, 38));
    plate.isBold = true;
    plate.enableOutline = true;
    plate.outlineColor = rgba(90, 30, 0, 255);
    plate.outlineWidth = 3;
    plate.overflow = Label.Overflow.SHRINK;
    plate.node.setSiblingIndex(field.children.length - 1);
    plate.node.setScale(1.6, 1.6, 1);
    tween(plate.node).to(0.16, { scale: Vec3.ONE }, { easing: 'backOut' }).by(1.2, { position: new Vec3(0, 26, 0) }).start();
    const op = plate.node.addComponent(UIOpacity);
    tween(op).delay(1.0).to(0.35, { opacity: 0 }).call(() => { if (plate.node.isValid) { plate.node.destroy(); } }).start();
  }

  /** 战场位置 → 该怪当前像素位置(找不到视图时按 sim 坐标算)。 */
  private monsterPx(monsterId: number): { x: number; y: number } | null {
    const view = this.monsterViews.get(monsterId);
    if (view && view.node.isValid) {
      return { x: view.node.position.x, y: view.node.position.y };
    }
    const monster = this.sim?.monsters.find((entry) => entry.monsterId === monsterId);
    return monster ? { x: this.xToPx(monster.x), y: this.monsterY(monster.lane, monster.x) } : null;
  }

  private playSpellFx(id: GuardSpellId, x: number | null, lane: number, amount: number, hitIds: number[], event?: GuardEvent): void {
    const field = this.fieldNode;
    const sim = this.sim;
    if (!field || !sim) {
      return;
    }
    const unit = this.unitSize();
    const def = GUARD_SPELLS[id];
    // docs/39:等级 / 档位 / 本级数值;Lv2 起飘字带等级,让玩家一眼看出这是几级法术
    const level = event?.level ?? guardSpellLevel(sim, id);
    const row = guardSpellRow(id, level);
    const lvTag = level >= 2 ? ` Lv.${level}` : '';
    this.host.setStatus(`水晶法术:${def.name}${lvTag}!`);
    const crystal = field.getChildByName('GuardCrystal');
    const crystalX = crystal ? crystal.position.x : this.xToPx(0);
    const crystalY = crystal ? crystal.position.y : this.walkwayY();
    const spineAt = (spec: GuardSpellFxSpec, px: number, py: number, sizeMult = 1, holdMs = spec.holdMs): boolean => {
      const oy = (spec.offsetY ?? 0) * unit;
      const ox = (spec.offsetX ?? 0) * unit;
      if (spec.loop) {
        return this.spawnSpellLoopFx(spec, px + ox, py + oy, sizeMult, holdMs);
      }
      // spawnSpineBurstFx 的 sizePx = unitSize × spec.size × scale,这里 scale 传等级倍率(此前误传 spec.size 被平方,神雷放大到 6000px 出屏)。
      return this.spawnSpineBurstFx(spec, px + ox, py + oy, sizeMult, holdMs, true);
    };
    const flashAt = (px: number, py: number, path: string, size: number, color: Color, sec: number, spin = 0): Node => {
      const node = this.mountSprite(field, 'GuardSpellFx', path, px, py, size, size, color);
      node.setSiblingIndex(field.children.length - 1);
      node.setScale(0.4, 0.4, 1);
      const op = node.addComponent(UIOpacity);
      tween(node).to(sec * 0.4, { scale: Vec3.ONE, angle: spin }, { easing: 'quadOut' }).start();
      tween(op).delay(sec * 0.5).to(sec * 0.5, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
      return node;
    };
    if (id === 'quake') {
      gameAudio.sfx('wheel_stop');
      this.shakeField(12 + (level - 1));
      // 持续震荡域(2026-10-11):特效循环播到持续时长结束,不再一闪而过
      const quakeSpec = row.durationMs > 0 ? { ...GUARD_SPELL_FX.quake, loop: true } : GUARD_SPELL_FX.quake;
      if (!spineAt(quakeSpec, crystalX, crystalY, row.fxScale, row.durationMs > 0 ? row.durationMs : GUARD_SPELL_FX.quake.holdMs)) {
        flashAt(crystalX, crystalY, 'ui/guard/cast_flash/spriteFrame', unit * 4 * row.fxScale, rgba(140, 210, 255), 0.8, 40);
      }
      const wave = this.mountSprite(field, 'GuardSpellFx', 'ui/battle/c1812/effects/hit_ring/spriteFrame', crystalX, crystalY, unit, unit, rgba(150, 220, 255));
      wave.setSiblingIndex(field.children.length - 1);
      const waveOp = wave.addComponent(UIOpacity);
      tween(wave).to(0.6, { scale: new Vec3(14 * row.fxScale, 5 * row.fxScale, 1) }, { easing: 'quadOut' }).start();
      tween(waveOp).to(0.6, { opacity: 0 }).call(() => { if (wave.isValid) { wave.destroy(); } }).start();
      this.spellLevelAccent(crystalX + unit * 1.8, crystalY + unit * 0.6, level, rgba(150, 220, 255), unit * 3);
      this.spawnFloater(this.xToPx(2), this.walkwayY() + unit, `矿晶震荡${lvTag} -${amount}`, rgba(150, 220, 255), 22 + guardSpellTier(level) * 2);
      if (row.stunMs > 0) {
        const stunned = hitIds.filter((monsterId) => sim.monsters.some((entry) => entry.monsterId === monsterId && !entry.dead && entry.kind !== 'boss')).length;
        if (stunned > 0) {
          this.spawnFloater(this.xToPx(3.2), this.walkwayY() + unit * 1.5, `震慑 ×${stunned}`, rgba(255, 236, 150), 20);
        }
        this.showSpellUnlockBanner(id, this.xToPx(2.5), this.walkwayY() + unit * 2.2);
      }
    } else if ((id === 'frost' || id === 'thunder') && x !== null) {
      const px = this.xToPx(x);
      const py = (this.monsterY(0, x) + this.monsterY(1, x)) / 2;
      // 冰封 / 神雷:特效大小跟着本级半径走(和瞄准圈一致),Lv2 起加点缀
      const radiusMult = row.radius / guardSpellRow(id, 1).radius;
      if (id === 'frost') {
        gameAudio.sfx('wheel_tick');
        if (!spineAt(GUARD_SPELL_FX.frost, px, py, radiusMult, row.ms)) {
          const band = flashAt(px, py, 'ui/guard/fx_wind_zone/spriteFrame', unit * 3.4 * radiusMult, rgba(170, 225, 255), 1.6, -90);
          band.setScale(0.4, 0.25, 1);
          tween(band).to(0.3, { scale: new Vec3(1, 0.6, 1) }, { easing: 'quadOut' }).start();
        }
        if (row.floorMs > 0) {
          // 「霜冻地面」:同款冰晶压扁成地面冰层,淡一些铺在落点,持续 floorMs
          this.spawnSpellLoopFx(GUARD_SPELL_FX.frost, px, py - unit * 0.25, radiusMult * 1.25, row.floorMs, 0.32, 150);
        }
        this.spellLevelAccent(px, py, level, rgba(170, 225, 255), unit * 2.6 * radiusMult);
        this.spawnFloater(px, py + unit * 1.1, hitIds.length > 0 ? `冰封${lvTag} ×${hitIds.length}` : `冰封${lvTag}`, rgba(170, 225, 255), 20 + guardSpellTier(level) * 2);
      } else {
        gameAudio.sfx('chest_land');
        this.shakeField(8 + (level - 1));
        // 雷域(2026-10-11):落雷特效循环到持续时长结束,范围内持续落雷
        const thunderSpec = row.durationMs > 0 ? { ...GUARD_SPELL_FX.thunder, loop: true } : GUARD_SPELL_FX.thunder;
        if (!spineAt(thunderSpec, px, py, radiusMult, row.durationMs > 0 ? row.durationMs : GUARD_SPELL_FX.thunder.holdMs)) {
          const bolt = this.mountSprite(field, 'GuardSpellFx', 'ui/battle/attack/atk_abyss_rift/spriteFrame', px, py + unit * 2.4, unit * 4.6, unit * 1.6, rgba(220, 235, 255));
          bolt.setSiblingIndex(field.children.length - 1);
          bolt.angle = -62;
          const boltOp = bolt.addComponent(UIOpacity);
          tween(boltOp).to(0.08, { opacity: 255 }).delay(0.2).to(0.25, { opacity: 0 }).call(() => { if (bolt.isValid) { bolt.destroy(); } }).start();
          flashAt(px, py, 'ui/battle/c1812/effects/hit_burst/spriteFrame', unit * 2.6, rgba(210, 230, 255), 0.5);
          flashAt(px, py, 'ui/battle/c1812/effects/hit_ring/spriteFrame', unit * 3, rgba(255, 230, 140), 0.6);
        }
        this.spellLevelAccent(px, py, level, rgba(200, 210, 255), unit * 2.4 * radiusMult);
        this.spawnFloater(px, py + unit * 1.2, `${GUARD_SPELLS.thunder.name}${lvTag} -${amount}`, rgba(255, 230, 140), 22 + guardSpellTier(level) * 2);
        // 「连锁闪电」:落点到每个弹射目标一道折线电弧 + 小号神雷
        const chainIds = event?.chainIds ?? [];
        chainIds.forEach((monsterId, index) => {
          const at = this.monsterPx(monsterId);
          if (!at) {
            return;
          }
          const arc = this.host.addChildPlainNode(field, 'GuardSpellChain', 0, 0, 10, 10);
          arc.setSiblingIndex(field.children.length - 1);
          const g = arc.addComponent(Graphics);
          g.strokeColor = rgba(210, 230, 255, 235);
          g.lineWidth = 4;
          const segs = 6;
          g.moveTo(px, py);
          for (let k = 1; k < segs; k += 1) {
            const t = k / segs;
            const jitter = ((k + index) % 2 === 0 ? 1 : -1) * unit * 0.18;
            g.lineTo(px + (at.x - px) * t, py + (at.y - py) * t + jitter);
          }
          g.lineTo(at.x, at.y);
          g.stroke();
          setTimeout(() => { if (arc.isValid) { arc.destroy(); } }, 220 + index * 60);
          setTimeout(() => this.spawnSpineBurstFx(GUARD_SPELL_FX.thunder, at.x, at.y + unit * 0.2, 0.45, 600, true), 80 * index);
          this.flashMonster(monsterId);
        });
        if (chainIds.length > 0) {
          this.spawnFloater(px + unit * 1.4, py + unit * 1.6, `连锁 ×${chainIds.length}`, rgba(210, 230, 255), 20);
        }
        if (row.boltCount > 0) {
          this.showSpellUnlockBanner(id, px, py + unit * 2.4);
        }
      }
      void lane;
    } else if (id === 'goldrush') {
      gameAudio.sfx('coin_shower');
      if (!spineAt(GUARD_SPELL_FX.goldrush, crystalX, crystalY, row.fxScale)) {
        flashAt(crystalX, crystalY, 'ui/guard/cast_flash/spriteFrame', unit * 3 * row.fxScale, rgba(255, 214, 110), 0.7, 30);
      }
      // docs/39 §5:金币堆按档位(小堆 / 中堆 / 大堆),满仓再弹宝箱;金币从堆顶飞向 HUD
      const jackpot = event?.jackpot === true;
      this.spawnGoldPile(guardSpellTier(level), jackpot, crystalX + unit * 1.5, this.walkwayY() - unit * 0.1, level);
      if (jackpot) {
        gameAudio.sfx('chest_jackpot');
        this.shakeField(6);
        this.spawnFloater(crystalX + unit * 1.5, crystalY + unit * 1.6, `满仓!+${amount} 金币`, rgba(255, 226, 110), 30);
        this.showSpellUnlockBanner(id, crystalX + unit * 2, crystalY + unit * 2.4);
      } else {
        this.spawnFloater(crystalX + unit * 1.5, crystalY + unit * 1.3, `金矿爆发${lvTag} +${amount} 金币`, rgba(255, 214, 92), 22 + guardSpellTier(level) * 2);
      }
      if (row.boostMs > 0) {
        this.spawnFloater(crystalX + unit * 2.6, crystalY + unit * 0.7, `点金 ${Math.round(row.boostMs / 1000)} 秒 · 击杀金币 ×1.5`, rgba(255, 236, 160), 18);
      }
    } else if (id === 'aegis') {
      gameAudio.sfx('reward_claim');
      this.spellLevelAccent(crystalX + unit * 1.5, crystalY + unit * 0.6, level, rgba(255, 236, 170), unit * 3);
      if (row.pushRange > 0) {
        // 「驱邪」:金色光环从水晶向外扩到驱邪范围
        const push = this.mountSoftFx(field, 'GuardSpellFx', 'ring', this.xToPx(0.3), this.walkwayY(), unit, unit, rgba(255, 236, 170));
        push.setSiblingIndex(field.children.length - 1);
        push.setScale(0.3, 0.12, 1);
        const pushOp = push.addComponent(UIOpacity);
        const reachPx = Math.max(unit, this.xToPx(row.pushRange) - this.xToPx(0));
        tween(push).to(0.4, { scale: new Vec3((reachPx * 2) / unit, (reachPx * 0.8) / unit, 1) }, { easing: 'quadOut' }).start();
        tween(pushOp).delay(0.2).to(0.3, { opacity: 0 }).call(() => { if (push.isValid) { push.destroy(); } }).start();
        if (hitIds.length > 0) {
          this.spawnFloater(this.xToPx(1.4), this.walkwayY() + unit * 1.1, `驱邪 ×${hitIds.length}`, rgba(255, 236, 170), 20);
        }
      }
      if (row.reflectDmg > 0) {
        this.showSpellUnlockBanner(id, crystalX + unit * 2, crystalY + unit * 2.4);
      }
      if (!spineAt(GUARD_SPELL_FX.aegis, crystalX, crystalY, row.fxScale, row.ms)) {
        const shield = this.mountSprite(field, 'GuardAegisShield', 'ui/battle/attack/atk_atlas_shieldwave/spriteFrame', crystalX, crystalY + unit * 0.3, unit * 3.2, unit * 3.2, rgba(255, 236, 170));
        shield.setSiblingIndex(field.children.length - 1);
        const shieldOp = shield.addComponent(UIOpacity);
        shieldOp.opacity = 0;
        tween(shieldOp).to(0.2, { opacity: 220 }).repeat(Math.max(1, Math.floor(row.ms / 800)), tween().to(0.4, { opacity: 140 }).to(0.4, { opacity: 220 })).to(0.3, { opacity: 0 }).call(() => { if (shield.isValid) { shield.destroy(); } }).start();
        tween(shield).by(row.ms / 1000 + 0.5, { angle: 120 }).start();
      }
      this.spawnFloater(crystalX + unit, crystalY + unit * 1.4, amount > 0 ? `圣光壁垒${lvTag} +${amount}` : `圣光壁垒${lvTag}`, rgba(255, 236, 170), 22 + guardSpellTier(level) * 2);
    } else if (id === 'warhorn') {
      gameAudio.sfx('level_up');
      this.spawnSpineBurstFx(GUARD_WARHORN_BURST_FX, crystalX + unit * 1.5, crystalY + unit * 1.0, 1 + (row.fxScale - 1) * 0.5, 800, true);
      this.spellLevelAccent(crystalX + unit * 1.5, crystalY + unit * 1.0, level, rgba(255, 150, 110), unit * 3);
      for (const hero of sim.heroes) {
        const view = this.heroViews.get(hero.unitId);
        if (!view || !view.node.isValid) {
          continue;
        }
        if (row.dmgMult > 1) {
          this.mountRageGlow(view.node, unit, row.ms);
        }
        const hornSpec = GUARD_SPELL_FX.warhorn;
        const hornHolder = this.host.addChildPlainNode(view.node, 'GuardWarhornFx', 0, (hornSpec.offsetY ?? 0) * unit, 10, 10);
        hornHolder.setSiblingIndex(0);
        if (this.spawnOverlaySpineFx(hornHolder, hornSpec, 0, 0, unit * hornSpec.size * (1 + 0.1 * (level - 1)), 0, true)) {
          setTimeout(() => { if (hornHolder.isValid) { hornHolder.destroy(); } }, row.ms);
          if (row.cdCutMs > 0 && guardHeroSkillUnlocked(sim, hero)) {
            this.spawnFloater(view.node.position.x, view.node.position.y + unit * 0.9, `战技 −${Math.round(row.cdCutMs / 100) / 10}s`, rgba(255, 190, 140), 16);
          }
          continue;
        }
        hornHolder.destroy();
        const ring = this.host.addChildPlainNode(view.node, 'GuardWarhornRing', 0, -unit * 0.42, 10, 10);
        ring.setSiblingIndex(0);
        const rg = ring.addComponent(Graphics);
        rg.strokeColor = rgba(255, 110, 70, 235);
        rg.lineWidth = 4;
        rg.ellipse(0, 0, unit * 0.46, unit * 0.14);
        rg.stroke();
        tween(ring).repeat(Math.floor(row.ms / 500), tween().to(0.25, { scale: new Vec3(1.2, 1.2, 1) }).to(0.25, { scale: Vec3.ONE })).call(() => { if (ring.isValid) { ring.destroy(); } }).start();
      }
      const hornText = `狂战号角${lvTag}!攻速 +${Math.round((row.aspd - 1) * 100)}%` + (row.dmgMult > 1 ? ` 伤害 +${Math.round((row.dmgMult - 1) * 100)}%` : '');
      this.spawnFloater(this.xToPx(0.8), this.walkwayY() + unit * 1.6, hornText, rgba(255, 150, 110), 22 + guardSpellTier(level) * 2);
      if (row.dmgMult > 1) {
        this.showSpellUnlockBanner(id, this.xToPx(1.2), this.walkwayY() + unit * 2.4);
      }
    }
  }

  /** 狂怒(号角 Lv5)期间英雄脚下的红橙脉动光团:数值只 +3%,靠持续光团 + 橙红伤害数字让玩家看得出来。 */
  private mountRageGlow(heroNode: Node, unit: number, ms: number): void {
    const glow = this.mountSoftFx(heroNode, 'GuardRageGlow', 'glow', 0, -unit * 0.36, unit * 1.5, unit * 0.62, rgba(255, 90, 40));
    glow.setSiblingIndex(0);
    const op = glow.addComponent(UIOpacity);
    op.opacity = 0;
    const pulses = Math.max(1, Math.floor(ms / 700));
    tween(op).to(0.2, { opacity: 230 }).repeat(pulses, tween().to(0.35, { opacity: 140 }).to(0.35, { opacity: 230 })).to(0.3, { opacity: 0 })
      .call(() => { if (glow.isValid) { glow.destroy(); } }).start();
    // 地面光团会和号角自带的橙色地环混在一起,再在身后加一层竖向红色气焰,一眼区分「狂怒」。
    const aura = this.mountSoftFx(heroNode, 'GuardRageAura', 'glow', 0, unit * 0.3, unit * 1.05, unit * 1.5, rgba(255, 50, 30));
    aura.setSiblingIndex(0);
    const auraOp = aura.addComponent(UIOpacity);
    auraOp.opacity = 0;
    tween(auraOp).to(0.2, { opacity: 170 }).repeat(pulses, tween().to(0.35, { opacity: 90 }).to(0.35, { opacity: 170 })).to(0.3, { opacity: 0 })
      .call(() => { if (aura.isValid) { aura.destroy(); } }).start();
  }

  /** 狂怒期间(号角 Lv5 生效中)英雄造成的普通伤害数字改成橙红色并放大一号。 */
  private rageActive(): boolean {
    const sim = this.sim;
    return !!sim && sim.warhornDmgMult > 1 && sim.warhornUntilMs > sim.timeMs;
  }

  /** 法术追加效果(docs/39):余震 / 冰碎 / 九重雷劫单道 / 圣光反震。 */
  private playSpellEcho(event: GuardEvent): void {
    const field = this.fieldNode;
    const sim = this.sim;
    if (!field || !sim || !event.spellId) {
      return;
    }
    const unit = this.unitSize();
    const ids = event.monsterIds ?? [];
    const amount = event.amount ?? 0;
    const now = Date.now();
    if (event.echoKind === 'quakeEcho') {
      // 余震:三处地面同款冰晶小爆 + 小震屏
      this.shakeField(8);
      const midX = (this.xToPx(0.5) + this.xToPx(9)) / 2;
      this.spellLevelAccent(midX, this.walkwayY(), 5, rgba(150, 220, 255), Math.abs(this.xToPx(9) - this.xToPx(0.5)) * 0.55);
      for (const atX of [2.5, 5, 7.5]) {
        this.spawnSpineBurstFx(GUARD_SPELL_FX.quake, this.xToPx(atX), this.walkwayY() + unit * 0.3, 0.7, 700, true);
      }
      ids.forEach((monsterId) => this.flashMonster(monsterId));
      if (ids.length > 0) {
        this.spawnFloater(this.xToPx(4), this.walkwayY() + unit * 1.3, `余震 -${amount}`, rgba(150, 220, 255), 20);
      }
    } else if (event.echoKind === 'frostShatter') {
      // 冰碎:每只碎冰怪身上冰蓝爆点(最多 8 个)
      ids.slice(0, 8).forEach((monsterId) => {
        const at = this.monsterPx(monsterId);
        if (!at) {
          return;
        }
        this.spellLevelAccent(at.x, at.y + unit * 0.3, 4, rgba(170, 230, 255), unit * 1.6);
        this.spawnSpineBurstFx(GUARD_SPELL_FX.frost, at.x, at.y, 0.32, 500, true);
        this.flashMonster(monsterId);
      });
      if (ids.length > 0) {
        gameAudio.sfx('wheel_tick', 0.8);
        const at = this.monsterPx(ids[0]);
        this.spawnFloater(at ? at.x : this.xToPx(event.x ?? 4), (at ? at.y : this.walkwayY()) + unit * 1.2, `冰碎 ×${ids.length} -${amount} · 减速`, rgba(170, 230, 255), 20);
        this.showSpellUnlockBanner('frost', at ? at.x : this.xToPx(event.x ?? 4), this.walkwayY() + unit * 2.4);
      }
    } else if (event.echoKind === 'thunderBolt') {
      // 九重雷劫单道:神雷砸在落点 2 格内血量最高的怪身上
      const at = ids.length > 0 ? this.monsterPx(ids[0]) : null;
      if (at) {
        this.spawnSpineBurstFx(GUARD_SPELL_FX.thunder, at.x, at.y + unit * 0.3, 0.9, 650, true);
        this.spellLevelAccent(at.x, at.y + unit * 0.2, 2, rgba(220, 210, 255), unit * 1.8);
        this.shakeField(4);
        this.flashMonster(ids[0]);
        if (now - this.spellEchoFloaterAt > 260) {
          this.spellEchoFloaterAt = now;
          this.spawnFloater(at.x, at.y + unit * 1.3, `雷劫 -${amount}`, rgba(255, 230, 140), 18);
        }
      }
    } else if (event.echoKind === 'aegisReflect') {
      const at = ids.length > 0 ? this.monsterPx(ids[0]) : null;
      if (at) {
        this.spellLevelAccent(at.x, at.y + unit * 0.3, 4, rgba(255, 230, 150), unit * 1.4);
        if (now - this.aegisFloaterAt > 700) {
          this.aegisFloaterAt = now;
          this.spawnFloater(at.x, at.y + unit * 1.1, `反震 -${amount}`, rgba(255, 230, 150), 18);
        }
      }
    }
  }

  /**
   * 金矿爆发金币堆(docs/39 §5):小堆 / 中堆 / 大堆(+ 满仓宝箱)从水晶前地面弹出,
   * 金币从堆顶扇形飞向 HUD,最后金币堆缩小淡出("搬空")。金币数 6 / 12 / 18 / 满仓 28。
   */
  private spawnGoldPile(tier: 1 | 2 | 3, jackpot: boolean, x: number, y: number, level: number): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const unit = this.unitSize();
    const spec = GUARD_GOLD_PILE_SPRITES[tier - 1];
    // 同档内也随等级略放大(Lv2 / Lv4 比同档前一级大 10%)——每一级都看得出提升
    const levelBump = level % 2 === 0 ? 1.1 : 1;
    let w = unit * spec.u * levelBump;
    let h = w * spec.aspect;
    let pile: Node;
    const ready = this.attackSpineFxReady.get(GUARD_GOLD_PILE_SPINE.effect);
    if (ready) {
      // 骨骼金币堆:三档同一缩放;堆底中心对准地面点
      const heap = GUARD_GOLD_PILE_SPINE.heap[tier - 1];
      const fit = (unit * GUARD_GOLD_PILE_SPINE.largeWidthU * levelBump) / GUARD_GOLD_PILE_SPINE.heap[2].w;
      w = heap.w * fit;
      h = heap.h * fit;
      pile = this.host.addChildPlainNode(field, 'GuardGoldPile', x, y + h / 2, 10, 10);
      const holder = this.host.addChildPlainNode(pile, 'Spine', -heap.cx * fit, -heap.cy * fit, 10, 10);
      holder.setScale(fit, fit, 1);
      const skeleton = holder.addComponent(sp.Skeleton);
      LobbyGuardBattleRenderer.useSharedFxCache(skeleton);
      skeleton.premultipliedAlpha = false;
      skeleton.skeletonData = ready.data;
      try {
        skeleton.setAnimation(0, GUARD_GOLD_PILE_SPINE.anims[tier - 1], true);
      } catch (error) {
        void error;
      }
    } else {
      this.prewarmAttackSpineFx({ effect: GUARD_GOLD_PILE_SPINE.effect, animation: GUARD_GOLD_PILE_SPINE.anims[0], size: 1 });
      pile = this.mountSprite(field, 'GuardGoldPile', spec.path, x, y + h / 2, w, h);
    }
    pile.setSiblingIndex(field.children.length - 1);
    pile.setScale(0.3, 0.3, 1);
    const holdSec = [1.2, 1.6, 2.0][tier - 1] + (jackpot ? 0.4 : 0);
    tween(pile).to(0.18, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'quadOut' }).to(0.1, { scale: Vec3.ONE })
      .delay(holdSec).to(0.35, { scale: new Vec3(0.85, 0.85, 1) }).start();
    const pileOp = pile.addComponent(UIOpacity);
    tween(pileOp).delay(0.28 + holdSec).to(0.35, { opacity: 0 }).call(() => { if (pile.isValid) { pile.destroy(); } }).start();
    // 堆底光晕:档位越高越大越亮
    this.spellLevelAccent(x, y + h * 0.3, Math.max(2, level), rgba(255, 214, 110), w * 1.6);
    if (jackpot) {
      const cw = unit * GUARD_GOLD_PILE_JACKPOT.u;
      const chest = this.mountSprite(field, 'GuardGoldPile', GUARD_GOLD_PILE_JACKPOT.path, x, y + h + cw * 0.35, cw, cw * GUARD_GOLD_PILE_JACKPOT.aspect);
      chest.setSiblingIndex(field.children.length - 1);
      chest.setScale(0.2, 0.2, 1);
      tween(chest).delay(0.12).to(0.22, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' }).to(0.12, { scale: Vec3.ONE }).start();
      const chestOp = chest.addComponent(UIOpacity);
      tween(chestOp).delay(0.5 + holdSec).to(0.35, { opacity: 0 }).call(() => { if (chest.isValid) { chest.destroy(); } }).start();
    }
    const coins = jackpot ? 28 : [6, 12, 18][tier - 1];
    for (let i = 0; i < coins; i += 1) {
      const spread = (i % 7 - 3) * unit * 0.12;
      this.spawnPileCoin(x + spread, y + h * 0.9, 0.25 + i * 0.03);
    }
  }

  /** 金币堆飞币:独立计数(上限 28),不挤掉击杀金币;落地弹一下再飞向 HUD 金币数。 */
  private spawnPileCoin(fieldX: number, fieldY: number, delaySec: number): void {
    const root = this.root;
    if (!root || this.pileCoinLive >= 28) {
      return;
    }
    this.pileCoinLive += 1;
    const yOffset = -this.layoutHeight * 0.03;
    const size = 36;
    const coin = this.host.addChildPlainNode(root, 'GuardPileCoin', fieldX, fieldY + yOffset, size, size);
    this.mountSprite(coin, 'Img', 'ui/guard/coin_gold/spriteFrame', 0, 0, size, size);
    coin.setScale(0, 0, 1);
    const hopX = fieldX + (Math.random() - 0.5) * this.unitSize() * 0.8;
    const hopY = fieldY + yOffset + this.unitSize() * (0.35 + Math.random() * 0.3);
    const targetX = this.layoutWidth / 2 - 180;
    const targetY = this.layoutHeight / 2 - 42;
    let released = false;
    const done = (): void => {
      if (released) {
        return;
      }
      released = true;
      this.pileCoinLive = Math.max(0, this.pileCoinLive - 1);
      if (coin.isValid) {
        coin.destroy();
      }
      const goldText = root.getChildByName('GuardHud')?.getChildByName('GuardGoldText');
      if (goldText && goldText.isValid) {
        tween(goldText).to(0.06, { scale: new Vec3(1.18, 1.18, 1) }).to(0.1, { scale: Vec3.ONE }).start();
      }
    };
    tween(coin)
      .delay(delaySec)
      .to(0.05, { scale: Vec3.ONE })
      .to(0.2, { position: new Vec3(hopX, hopY, 0) }, { easing: 'quadOut' })
      .delay(0.08)
      .to(0.5, { position: new Vec3(targetX, targetY, 0), scale: new Vec3(0.6, 0.6, 1) }, { easing: 'quadIn' })
      .call(done)
      .start();
    tween(coin).delay(delaySec + 1.6).call(done).start();
  }

  /** 设置 → 法术装备:只读展示本局出战法术与格数(配置在大厅「水晶 → 法术装备」,服务端保存,docs/38 §9)。 */
  private renderSpellLoadoutPage(overlay: Node, shell: GlassPopupShell, content: Node): void {
    // docs/38 §9:出战法术在大厅「水晶 → 法术装备」里配置并由服务端保存,开战快照带入;战斗内只展示,不再改。
    const sim = this.sim;
    const unlocked = sim ? sim.unlockedSpells : (GUARD_DEFAULT_SPELL_LOADOUT.slice(0, GUARD_BASE_SPELL_SLOTS) as GuardSpellId[]);
    const equipped = sim ? sim.spellLoadout : [];
    const slots = sim ? sim.spellSlots : GUARD_BASE_SPELL_SLOTS;
    this.paintSettingsHeader(shell, content, '法术装备', `本局出战 ${equipped.length}/${slots} 格 · 守卫水晶 Lv.${sim ? sim.crystalLevel : 1} · 更换请到大厅「水晶 → 法术装备」`);
    // 2026-11-11 B:3×2 玻璃卡(出战 = 金边选中格),内容区 dy 128..502;卡内图标 56 + 名字 / 能量,描述占下半
    const { k, S, X, Y, T } = shell;
    const gap = 16;
    const cardW = (GUARD_SETTINGS_W - 106 - gap * 2) / 3;
    const top = 128;
    const cardH = (502 - top - gap) / 2;
    GUARD_SPELL_IDS.forEach((id, index) => {
      const def = GUARD_SPELLS[id];
      const col = index % 3;
      const row = Math.floor(index / 3);
      const cx = 53 + cardW / 2 + col * (cardW + gap);
      const cy = top + cardH / 2 + row * (cardH + gap);
      const slotIndex = equipped.indexOf(id);
      const selected = slotIndex >= 0;
      const locked = unlocked.indexOf(id) < 0;
      const w = S(cardW);
      const h = S(cardH);
      const card = this.host.addChildPlainNode(content, `GuardSpellCard_${id}`, X(cx), Y(cy), w, h);
      mountGlassSlice(this.kit, card, 'Glass', selected ? GLASS_SLICES.panelSel : GLASS_SLICES.panel, 0, 0, w, h, k);
      const iconX = -w / 2 + S(16 + 28);
      const iconY = h / 2 - S(14 + 28);
      this.mountSprite(card, 'Icon', GUARD_SPELL_ICON[id], iconX, iconY, S(56), S(56));
      const cardLevel = sim ? guardSpellLevel(sim, id) : 1;
      const textX = iconX + S(28 + 12);
      const textW = w / 2 - textX - S(12);
      T(card, 'Name', `${def.name} Lv.${cardLevel}`, textX, iconY + S(13), 22, selected ? GLASS_COLOR.champagne : GLASS_COLOR.text, textW, HorizontalTextAlignment.LEFT, true);
      const slotText = locked ? '未解锁' : selected ? `出战第 ${slotIndex + 1} 格` : '未装备';
      T(card, 'Cost', `能量 ${def.cost} · ${slotText}`, textX, iconY - S(15), 17, locked ? GLASS_COLOR.dim : selected ? GLASS_COLOR.green : GLASS_COLOR.sub, textW);
      const descText = locked ? `守卫水晶 Lv.${GUARD_SPELL_UNLOCK_LEVEL[id]} 解锁` : guardSpellDescribe(id, cardLevel);
      const descTop = iconY - S(28 + 8);
      const descH = descTop - (-h / 2 + S(10));
      const desc = T(card, 'Desc', descText, -w / 2 + S(16), descTop - descH / 2, 16, locked ? new Color(232, 150, 120, 255) : new Color(200, 206, 216, 255), w - S(32));
      desc.enableWrapText = true;
      desc.overflow = Label.Overflow.SHRINK;
      desc.lineHeight = Math.round(desc.fontSize * 1.35);
      desc.verticalAlign = VerticalTextAlignment.TOP;
      desc.node.getComponent(UITransform)?.setContentSize(w - S(32), descH);
      if (locked) {
        (card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity)).opacity = 150;
        this.kit.addSprite('Lock', GLASS_ICON.lock, iconX, iconY, S(30), S(30), card);
      } else if (!selected) {
        (card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity)).opacity = 200;
      }
    });
    this.mountSettingsBack(overlay, shell, content, 'GuardSpellsBack');
  }

  // ── docs/37 G 车道陷阱 ──

  private trapButtonX(): number {
    const barW = this.spellBarWidth();
    return this.spellBarCenterX() + (barW / 2 + 30 + 40) * this.bottomHudScale();
  }

  private static readonly TRAP_ICON_SIZE = 72;

  /** 法术栏右侧的"陷阱"按钮;点它展开 / 收起上方托盘(不暂停)。 */
  private renderTrapButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    root.getChildByName('GuardTrapButton')?.destroy();
    root.getChildByName('GuardTrapTray')?.destroy();
    const size = 80;
    const button = this.host.addChildPlainNode(root, 'GuardTrapButton', this.trapButtonX(), this.spellBarY(), size, size);
    const hudScale = this.bottomHudScale();
    button.setScale(hudScale, hudScale, 1);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(24, 16, 10, 230);
    g.circle(0, 0, size / 2);
    g.fill();
    g.strokeColor = rgba(214, 168, 92, 235);
    g.lineWidth = 3;
    g.circle(0, 0, size / 2);
    g.stroke();
    this.paintSpikes(button, size * 0.62, size * 0.36, rgba(200, 200, 210));
    const label = this.host.addChildLabel(button, 'Label', '陷阱', 0, -size / 2 - 13, 15, rgba(240, 222, 186), new Size(90, 20));
    label.enableOutline = true;
    label.outlineColor = rgba(20, 12, 6, 255);
    label.outlineWidth = 2;
    this.host.applyImageButtonFeedback(button);
    button.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      (event as unknown as { propagationStopped?: boolean }).propagationStopped = true;
      this.trapTrayOpen = !this.trapTrayOpen;
      this.renderTrapTray();
      if (this.trapTrayOpen) {
        this.showInteractHint('trap', '按住陷阱拖到跑道上放置(花金币,场上最多 3 个)');
      }
    }, this);
    this.renderTrapTray();
  }

  /** 托盘:3 个陷阱图标(名字 + 价格),按住拖到跑道放置。 */
  private renderTrapTray(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    root.getChildByName('GuardTrapTray')?.destroy();
    if (!this.trapTrayOpen) {
      return;
    }
    const icon = LobbyGuardBattleRenderer.TRAP_ICON_SIZE;
    const gap = 16;
    const trayW = icon * 3 + gap * 2 + 28;
    const trayH = icon + 58;
    // 托盘底边让开法术栏上方的能量条与文字(槽心 +90 以内)
    const hudScale = this.bottomHudScale();
    const trayY = this.spellBarY() + (LobbyGuardBattleRenderer.SPELL_SLOT / 2 + 64 + trayH / 2) * hudScale;
    const trayX = Math.min(this.trapButtonX(), this.layoutWidth / 2 - trayW * hudScale / 2 - 16);
    const tray = this.host.addChildPlainNode(root, 'GuardTrapTray', trayX, trayY, trayW, trayH);
    tray.setScale(hudScale, hudScale, 1);
    tray.addComponent(BlockInputEvents);
    const g = tray.addComponent(Graphics);
    g.fillColor = rgba(14, 10, 8, 225);
    g.roundRect(-trayW / 2, -trayH / 2, trayW, trayH, 12);
    g.fill();
    g.strokeColor = rgba(214, 168, 92, 220);
    g.lineWidth = 2;
    g.roundRect(-trayW / 2, -trayH / 2, trayW, trayH, 12);
    g.stroke();
    GUARD_TRAP_KINDS.forEach((kind, index) => {
      const def = GUARD_TRAPS[kind];
      const x = -trayW / 2 + 14 + icon / 2 + index * (icon + gap);
      const item = this.host.addChildPlainNode(tray, `Trap_${kind}`, x, 10, icon, icon);
      this.paintTrapIcon(item, kind, icon);
      const name = this.host.addChildLabel(item, 'Name', def.name, 0, -icon / 2 - 12, 15, rgba(240, 222, 186), new Size(icon + gap, 20));
      name.overflow = Label.Overflow.SHRINK;
      const cost = this.host.addChildLabel(item, 'Cost', `${def.cost}`, icon * 0.34, icon * 0.36, 15, rgba(255, 214, 92), new Size(40, 20));
      cost.enableOutline = true;
      cost.outlineColor = rgba(40, 20, 6, 255);
      cost.outlineWidth = 2;
      this.bindTrapItem(item, kind);
    });
    this.refreshTrapTray();
  }

  /** 托盘刷新:买不起 / 满 3 个时图标变暗。 */
  private refreshTrapTray(): void {
    const sim = this.sim;
    const tray = this.root?.getChildByName('GuardTrapTray');
    if (!sim || !tray || !tray.isValid) {
      return;
    }
    for (const kind of GUARD_TRAP_KINDS) {
      const item = tray.getChildByName(`Trap_${kind}`);
      if (!item) {
        continue;
      }
      const ok = sim.gold >= GUARD_TRAPS[kind].cost && sim.traps.length < GUARD_TRAP_MAX;
      const op = item.getComponent(UIOpacity) ?? item.addComponent(UIOpacity);
      op.opacity = ok ? 255 : 120;
    }
  }

  /** 陷阱图标:尖刺(程序绘制的金属刺)/ 冰霜(冰旋贴图)/ 爆炎(橙色宝石徽章)。 */
  private paintTrapIcon(parent: Node, kind: GuardTrapKind, size: number): void {
    const bg = parent.addComponent(Graphics);
    bg.fillColor = rgba(30, 22, 16, 235);
    bg.circle(0, 0, size / 2);
    bg.fill();
    bg.strokeColor = rgba(170, 130, 70, 220);
    bg.lineWidth = 2;
    bg.circle(0, 0, size / 2);
    bg.stroke();
    if (kind === 'spikes') {
      this.paintSpikes(parent, size * 0.64, size * 0.38, rgba(210, 210, 220));
    } else if (kind === 'frostfield') {
      this.mountSprite(parent, 'Img', 'ui/guard/fx_wind_zone/spriteFrame', 0, 0, size * 0.8, size * 0.8, rgba(190, 230, 255));
    } else {
      this.mountSprite(parent, 'Img', 'ui/equip/gem_t4/spriteFrame', 0, 0, size * 0.76, size * 0.76);
    }
  }

  /** 一排金属尖刺(Graphics):w 宽 h 高,刺尖带一点血色。 */
  private paintSpikes(parent: Node, w: number, h: number, metal: Color): void {
    const node = this.host.addChildPlainNode(parent, 'Spikes', 0, -h * 0.1, w, h);
    const g = node.addComponent(Graphics);
    const count = 5;
    const step = w / count;
    for (let i = 0; i < count; i += 1) {
      const left = -w / 2 + i * step;
      const tall = i % 2 === 0 ? h : h * 0.72;
      g.fillColor = metal;
      g.moveTo(left + step * 0.08, -h / 2);
      g.lineTo(left + step / 2, -h / 2 + tall);
      g.lineTo(left + step * 0.92, -h / 2);
      g.close();
      g.fill();
      g.strokeColor = rgba(40, 36, 40, 255);
      g.lineWidth = 1.5;
      g.moveTo(left + step * 0.08, -h / 2);
      g.lineTo(left + step / 2, -h / 2 + tall);
      g.lineTo(left + step * 0.92, -h / 2);
      g.close();
      g.stroke();
      g.fillColor = rgba(170, 40, 40, 230);
      g.circle(left + step / 2, -h / 2 + tall - 3, 2.5);
      g.fill();
    }
    g.fillColor = rgba(60, 50, 44, 255);
    g.roundRect(-w / 2, -h / 2 - 4, w, 6, 3);
    g.fill();
  }

  /** 托盘图标手势:按住拖到跑道(显示范围,不能放显示红色),松手放置;拖回托盘取消。 */
  private bindTrapItem(item: Node, kind: GuardTrapKind): void {
    item.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      (event as unknown as { propagationStopped?: boolean }).propagationStopped = true;
      this.trapDrag = { kind, moved: 0, x: null };
    }, this);
    item.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      const drag = this.trapDrag;
      if (!drag || drag.kind !== kind) {
        return;
      }
      const delta = event.getUIDelta();
      drag.moved += Math.abs(delta.x) + Math.abs(delta.y);
      const aim = this.spellAimAt(event.getUILocation().x, event.getUILocation().y);
      drag.x = aim ? aim.x : null;
      this.drawTrapAim(kind, drag.x);
    }, this);
    const finish = (event: EventTouch | null): void => {
      const drag = this.trapDrag;
      this.trapDrag = null;
      this.fieldNode?.getChildByName('GuardTrapAim')?.destroy();
      const sim = this.sim;
      if (!drag || drag.kind !== kind || !sim) {
        return;
      }
      if (event) {
        (event as unknown as { propagationStopped?: boolean }).propagationStopped = true;
      }
      if (drag.moved < 12 || drag.x === null) {
        this.host.setStatus(`按住「${GUARD_TRAPS[kind].name}」拖到跑道上放置`);
        return;
      }
      const reason = guardTrapBlockReason(sim, kind, drag.x);
      if (reason) {
        this.host.setStatus(reason);
        return;
      }
      guardPlaceTrap(sim, kind, drag.x);
    };
    item.on(Node.EventType.TOUCH_END, (event: EventTouch) => finish(event), this);
    item.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => finish(event), this);
  }

  /** 陷阱落点预览:覆盖两条车道的椭圆,能放 = 绿,不能放 = 红。 */
  private drawTrapAim(kind: GuardTrapKind, x: number | null): void {
    const field = this.fieldNode;
    const sim = this.sim;
    if (!field || !sim) {
      return;
    }
    let node = field.getChildByName('GuardTrapAim');
    if (!node) {
      node = this.host.addChildPlainNode(field, 'GuardTrapAim', 0, 0, 10, 10);
      node.addComponent(Graphics);
    }
    node.setSiblingIndex(field.children.length - 1);
    const g = node.getComponent(Graphics);
    if (!g) {
      return;
    }
    g.clear();
    if (x === null) {
      return;
    }
    const ok = guardTrapBlockReason(sim, kind, x) === null;
    const { cx, cy, rx, ry } = this.trapEllipse(x, GUARD_TRAPS[kind].radius);
    const color = ok ? rgba(130, 240, 150) : rgba(255, 90, 80);
    g.fillColor = new Color(color.r, color.g, color.b, 50);
    g.ellipse(cx, cy, rx, ry);
    g.fill();
    g.strokeColor = new Color(color.r, color.g, color.b, 230);
    g.lineWidth = 3;
    g.ellipse(cx, cy, rx, ry);
    g.stroke();
  }

  /** 陷阱在画面上的椭圆(覆盖两条车道的怪物带)。 */
  private trapEllipse(x: number, radius: number): { cx: number; cy: number; rx: number; ry: number } {
    const y0 = this.monsterY(0, x);
    const y1 = this.monsterY(1, x);
    return {
      cx: this.xToPx(x),
      cy: (y0 + y1) / 2,
      rx: Math.max(this.unitSize() * 0.45, (this.xToPx(Math.min(GUARD_SPAWN_X, x + radius)) - this.xToPx(Math.max(0, x - radius))) / 2),
      ry: Math.abs(y0 - y1) / 2 + this.unitSize() * 0.45,
    };
  }

  /** 场上陷阱视图:地面椭圆 + 本体(尖刺 / 冰旋 / 宝石符文)+ 剩余波数。 */
  private syncTraps(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const live = new Set(sim.traps.map((trap) => trap.trapId));
    for (const [trapId, node] of Array.from(this.trapViews)) {
      if (!live.has(trapId)) {
        if (node.isValid) {
          const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
          tween(op).to(0.3, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
        }
        this.trapViews.delete(trapId);
      }
    }
    const unit = this.unitSize();
    for (const trap of sim.traps) {
      const def = GUARD_TRAPS[trap.kind];
      let node = this.trapViews.get(trap.trapId);
      const shape = this.trapEllipse(trap.x, def.radius);
      if (!node) {
        node = this.host.addChildPlainNode(field, `GuardTrap_${trap.trapId}`, shape.cx, shape.cy, shape.rx * 2, shape.ry * 2);
        // 贴地:排在格子卡片之后、单位之前
        node.setSiblingIndex(3);
        const g = node.addComponent(Graphics);
        const tint = trap.kind === 'spikes' ? rgba(200, 200, 210) : trap.kind === 'frostfield' ? rgba(140, 210, 255) : rgba(255, 140, 70);
        g.fillColor = new Color(tint.r, tint.g, tint.b, 38);
        g.ellipse(0, 0, shape.rx, shape.ry);
        g.fill();
        g.strokeColor = new Color(tint.r, tint.g, tint.b, 150);
        g.lineWidth = 2;
        g.ellipse(0, 0, shape.rx, shape.ry);
        g.stroke();
        if (trap.kind === 'spikes') {
          for (let i = -1; i <= 1; i += 1) {
            const cluster = this.host.addChildPlainNode(node, 'Cluster', i * shape.rx * 0.5, (i === 0 ? 0.25 : -0.2) * shape.ry, 10, 10);
            this.paintSpikes(cluster, unit * 0.42, unit * 0.24, rgba(160, 160, 172));
          }
        } else if (trap.kind === 'frostfield') {
          const swirl = this.mountSprite(node, 'Swirl', 'ui/guard/fx_wind_zone/spriteFrame', 0, 0, shape.rx * 2, shape.ry * 2, rgba(180, 225, 255));
          swirl.addComponent(UIOpacity).opacity = 150;
          tween(swirl).repeatForever(tween().by(8, { angle: -360 })).start();
        } else {
          const glow = this.mountSprite(node, 'Glow', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, 0, unit * 1.2, unit * 0.8, rgba(255, 130, 60));
          const glowOp = glow.addComponent(UIOpacity);
          tween(glowOp).repeatForever(tween().to(0.5, { opacity: 110 }).to(0.5, { opacity: 230 })).start();
          const rune = this.mountSprite(node, 'Rune', 'ui/equip/gem_t4/spriteFrame', 0, 0, unit * 0.62, unit * 0.62);
          rune.setScale(1, 0.62, 1);
        }
        const left = this.host.addChildLabel(node, 'Left', '', 0, -shape.ry - 10, 15, rgba(230, 214, 180), new Size(120, 20));
        left.enableOutline = true;
        left.outlineColor = rgba(20, 12, 6, 255);
        left.outlineWidth = 2;
        node.setScale(0.4, 0.4, 1);
        tween(node).to(0.2, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        this.trapViews.set(trap.trapId, node);
      }
      const left = node.getChildByName('Left')?.getComponent(Label);
      const text = trap.kind === 'rune' ? '爆炎符文' : `${def.name} · 余 ${trap.wavesLeft} 波`;
      if (left && left.string !== text) {
        left.string = text;
      }
    }
  }

  /** 爆炎符文爆炸:橙色爆闪 + 冲击环 + 震屏 + 伤害飘字。 */
  private playTrapBoom(x: number, amount: number): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const unit = this.unitSize();
    const shape = this.trapEllipse(x, GUARD_TRAPS.rune.radius);
    gameAudio.sfx('chest_jackpot', 0.6);
    this.shakeField(10);
    for (const [path, size, sec] of [['ui/battle/c1812/effects/hit_burst/spriteFrame', unit * 3, 0.45], ['ui/guard/cast_flash/spriteFrame', unit * 3.6, 0.6], ['ui/battle/c1812/effects/hit_ring/spriteFrame', unit * 2.4, 0.5]] as Array<[string, number, number]>) {
      const node = this.mountSprite(field, 'GuardTrapBoom', path, shape.cx, shape.cy, size, size, rgba(255, 150, 70));
      node.setSiblingIndex(field.children.length - 1);
      node.setScale(0.3, 0.3, 1);
      const op = node.addComponent(UIOpacity);
      tween(node).to(sec, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' }).start();
      tween(op).to(sec, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
    }
    this.spawnFloater(shape.cx, shape.cy + unit * 1.2, `爆炎符文 -${amount}`, rgba(255, 160, 90), 22);
  }

  /** 提前迎战按钮:顶部波次横幅下方,只在波间运营窗口出现,文案带实时奖励。 */
  private renderCallWaveButton(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const bannerW = Math.min(600, width * 0.42);
    const bannerH = bannerW * (110 / 704);
    const btnW = 230;
    const btnH = btnW * (100 / 431);
    const y = height / 2 - 16 - bannerH - 14 - 22 - btnH / 2;
    const button = this.mountPrimaryButton(root, 'GuardCallWaveButton', 0, y, btnW);
    const label = this.host.addChildLabel(button, 'GuardCallWaveLabel', '提前迎战', 0, 0, 20, rgba(255, 238, 190), new Size(btnW * 0.86, 28));
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = rgba(60, 20, 8, 255);
    label.outlineWidth = 2;
    button.active = false;
    button.on(Node.EventType.TOUCH_END, () => {
      const sim = this.sim;
      if (!sim || this.wheelOverlayOpen) {
        return;
      }
      const reward = guardCallNextWave(sim);
      if (reward !== null) {
        this.spawnFloater(0, y + height * 0.03 - btnH, `+${reward} 金币`, rgba(255, 214, 92), 22);
      }
      this.refreshCallWaveButton();
    }, this);
  }

  private refreshCallWaveButton(): void {
    const sim = this.sim;
    const button = this.root?.getChildByName('GuardCallWaveButton');
    if (!sim || !button || !button.isValid) {
      return;
    }
    const reward = guardCallWaveReward(sim);
    // 开局还没召唤任何英雄时不显示(首战引导期间别抢注意力)。
    const show = reward > 0 && !this.wheelOverlayOpen && !(sim.wave === 0 && sim.heroes.length === 0);
    if (button.active !== show) {
      button.active = show;
      if (show) {
        button.setScale(0.7, 0.7, 1);
        tween(button).to(0.2, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        this.showInteractHint('callWave', '波间可点「提前迎战」立刻开下一波,越早奖励越多');
      }
    }
    if (show) {
      const label = button.getChildByName('GuardCallWaveLabel')?.getComponent(Label);
      const text = `提前迎战  +${reward} 金币`;
      if (label && label.string !== text) {
        label.string = text;
      }
    }
  }

  private closeExitConfirm(): void {
    this.root?.getChildByName('GuardExitConfirmOverlay')?.destroy();
    this.exitConfirmOpen = false;
    this.syncBattlePause();
  }

  /** 前 3 箱(与 nextChestScriptTier 同一 localStorage 计数)强制看完轮盘;之后允许点任意处跳过。计数不可用视作可跳过。 */
  private chestSkipAllowed(): boolean {
    try {
      const store = (globalThis as { localStorage?: Storage }).localStorage;
      if (!store) {
        return true;
      }
      return Number(store.getItem('lootchainGuardChestScript') ?? '0') >= 3;
    } catch (error) {
      void error;
      return true;
    }
  }

  private wheelLater(p: GuardWheelParts, ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      if (p.overlay.isValid) {
        fn();
      }
    }, ms);
    p.timers.push(id);
  }

  /** 节点横向抖动(面板自身震:场地被压暗后 shakeField 几乎看不见)。 */
  private shakeNodeX(node: Node, amplitude: number, times: number): void {
    if (!node.isValid || !this.shakeEnabled) {
      return;
    }
    const base = node.position.clone();
    let chain = tween(node);
    for (let i = 0; i < times; i += 1) {
      const dir = i % 2 === 0 ? 1 : -1;
      chain = chain.to(0.06, { position: new Vec3(base.x + dir * amplitude, base.y, base.z) });
    }
    chain.to(0.05, { position: base }).start();
  }

  /**
   * 开箱轮盘(2026-09-27 重做):0=点击 → 面板 backOut 入场 + 灯珠 → 350ms 预转/加速/减速三段(指针过格嘀嗒 + 扇区闪 + 灯珠追光)
   * → 2550ms 停格重击(指针大颤 / 面板震 / 结果标签)→ 2800ms 开箱爆发(光芒/圣环骨骼/金币喷泉/星屑)→ 3000ms 奖励卡逐张滑入
   * (5 连/豪华叠全屏闪金 + 横幅砸入 + 彩星雨)→ 收下:金币飞向 HUD、面板淡出、恢复战斗。落点=结果扇区(纯演出,结果由 guardOpenChest 定)。
   */
  private openChestWithWheel(chestId: number): void {
    const sim = this.sim;
    const root = this.root;
    if (!sim || !root || this.wheelOverlayOpen) {
      return;
    }
    // 新手 1-3-5 脚本只吃普通箱;豪华箱固定 5 连不占脚本名额。跳过许可要在脚本计数递增之前读。
    const grade: GuardChestGrade = sim.chests.find((chest) => chest.chestId === chestId)?.grade ?? 'normal';
    const skippable = this.chestSkipAllowed();
    const result = guardOpenChest(sim, chestId, grade === 'deluxe' ? undefined : this.nextChestScriptTier());
    if (!result) {
      return;
    }
    gameAudio.sfx('ui_click');
    const deluxe = result.grade === 'deluxe';
    const jackpot = deluxe || result.tier >= 5;
    this.wheelOverlayOpen = true;
    sim.paused = true;
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const compact = false;
    // 2026-11-11 B 毛玻璃(原型 周报截图/2026-11-11_守卫战弹层/proto/guard_wheel_b.png 1:1):面板 1058×603,
    // 标题行(竖条 + 标题 + 揭示时弹出的「5 连大奖」胶囊 + ✕)→ 左:暗玻璃转盘 + 香槟细环 + 灯珠 + 中心宝箱;右:「奖励」分区 + 玻璃奖励条 + 香槟「收下」。
    const W = 1058;
    const H = 603;
    const sheet = this.phoneSheet();
    const k = this.glassK(W, H);
    const S = (v: number): number => v * k;
    const X = (dx: number): number => (dx - W / 2) * k;
    const Y = (dy: number): number => (H / 2 - dy) * k;
    const T = makeGlassText(this.kit, k, sheet ? 20 : 12);
    const panelW = S(W);
    const panelH = S(H);
    const s = k;
    // 转盘:中心 (263, 320),盘面半径 200,香槟环在 206
    const R = S(200);
    const wheelX = X(263);
    const wheelY = Y(320);
    const colX = X(773.5);
    const colW = S(503);
    const titleY = Y(38);
    const hot = deluxe ? rgba(255, 170, 110) : rgba(240, 214, 160);
    const overlay = this.host.addChildPlainNode(root, 'GuardWheelOverlay', 0, 0, width, height);
    // 2026-09-19 审计:全屏弹层必须挡住点击,否则点空白处会穿透到底下的强化/召唤按钮(扣金币、再弹词条)。
    overlay.addComponent(BlockInputEvents);
    const dim = this.host.addChildPlainNode(overlay, 'Dim', 0, 0, width, height);
    const og = dim.addComponent(Graphics);
    og.fillColor = rgba(4, 6, 10, 170);
    og.rect(-width / 2, -height / 2, width, height);
    og.fill();
    const dimOpacity = dim.addComponent(UIOpacity);
    dimOpacity.opacity = 0;
    tween(dimOpacity).to(0.18, { opacity: 255 }).start();
    // 面板容器:入场 backOut;停格/大奖时自己震;关闭时整体淡出。
    const panelRoot = this.host.addChildPlainNode(overlay, 'GuardWheelPanelRoot', 0, 0, panelW, panelH);
    const panelOpacity = panelRoot.addComponent(UIOpacity);
    panelRoot.setScale(0.86, 0.86, 1);
    tween(panelRoot).to(0.32, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    gameAudio.sfx('panel_open');
    mountGlassSlice(this.kit, panelRoot, 'GlassBase', GLASS_SLICES.panel, 0, 0, panelW, panelH, k);
    mountGlassSlice(this.kit, panelRoot, 'Glass', GLASS_SLICES.panel, 0, 0, panelW, panelH, k);
    const titleText = deluxe ? 'BOSS 豪华宝箱' : '矿脉宝箱';
    this.kit.addSprite('GuardWheelTitleBar', GLASS_ICON.accent, X(45), titleY, S(7), S(37), panelRoot);
    T(panelRoot, 'GuardWheelTitle', titleText, X(72), titleY, 34, GLASS_COLOR.text, S(420), HorizontalTextAlignment.LEFT, true);
    mountGlassLine(this.kit, panelRoot, 'GuardWheelDivider', 0, Y(77), S(W - 84), Math.max(1, S(1.5)), new Color(150, 158, 172, 70));
    mountGlassSectionHeader(this.kit, panelRoot, 'GuardWheelRewardHead', '奖励', X(525), Y(116), k, 26);
    // ── 轮盘:只有 WheelDisc 转,其余(环/灯珠/轴心/指针/高亮扇)不转 ──
    const wheel = this.host.addChildPlainNode(panelRoot, 'GuardWheel', wheelX, wheelY, R * 2, R * 2);
    const rimG = this.host.addChildPlainNode(wheel, 'WheelRim', 0, 0, 10, 10).addComponent(Graphics);
    rimG.fillColor = rgba(8, 10, 16, 200);
    rimG.circle(0, 0, R + S(10));
    rimG.fill();
    // 灯珠:香槟小圆点坐在环上;偶数颗在 A、奇数颗在 B,交替明暗就是"追光"
    const bulbCount = 16;
    const bulbs: UIOpacity[] = [];
    for (let group = 0; group < 2; group += 1) {
      const bulbNode = this.host.addChildPlainNode(wheel, group === 0 ? 'WheelBulbsA' : 'WheelBulbsB', 0, 0, 10, 10);
      const bg = bulbNode.addComponent(Graphics);
      for (let i = group; i < bulbCount; i += 2) {
        const a = ((i + 0.5) / bulbCount) * Math.PI * 2;
        const bx = Math.cos(a) * (R + S(6));
        const by = Math.sin(a) * (R + S(6));
        bg.fillColor = rgba(240, 214, 160, 70);
        bg.circle(bx, by, S(9));
        bg.fill();
        bg.fillColor = rgba(244, 226, 186, 255);
        bg.circle(bx, by, S(4.5));
        bg.fill();
      }
      const op = bulbNode.addComponent(UIOpacity);
      op.opacity = group === 0 ? 255 : 90;
      bulbs.push(op);
    }
    // 转盘本体:暗玻璃 8 扇(相邻微差明暗,大奖扇暖一档)+ 灰细分隔线;外圈香槟细环压在灯珠下
    const disc = this.host.addChildPlainNode(wheel, 'WheelDisc', 0, 0, R * 2, R * 2);
    const dg = disc.addComponent(Graphics);
    GUARD_WHEEL_SECTORS.forEach((kind, idx) => {
      const a0 = (idx / 8) * Math.PI * 2;
      const a1 = ((idx + 1) / 8) * Math.PI * 2;
      // 注意:本引擎 Graphics.arc 的 counterclockwise=false 走长弧(2026-09-27 探针实拍,旧轮盘因此整盘同色),扇形一律传 true。
      dg.fillColor = kind === 'jackpot' ? rgba(46, 40, 30, 245) : idx % 2 === 0 ? rgba(22, 27, 36, 245) : rgba(28, 33, 43, 245);
      dg.moveTo(0, 0);
      dg.arc(0, 0, R, a0, a1, true);
      dg.close();
      dg.fill();
    });
    for (let idx = 0; idx < 8; idx += 1) {
      const a = (idx / 8) * Math.PI * 2;
      dg.strokeColor = rgba(170, 178, 192, 70);
      dg.lineWidth = Math.max(1, S(1.5));
      dg.moveTo(Math.cos(a) * R * 0.36, Math.sin(a) * R * 0.36);
      dg.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      dg.stroke();
    }
    // 中心柔光:淡淡一层暖光托住宝箱
    this.mountSprite(disc, 'WheelLight', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, 0, R * 1.5, R * 1.5, rgba(240, 214, 160)).addComponent(UIOpacity).opacity = 55;
    // 扇区:图标在上、名字在下,整组放一个容器(转动时容器反向转保持朝上);大奖扇的星换香槟柔光呼吸
    const segIcons: Node[] = [];
    const segLabels: Node[] = [];
    GUARD_WHEEL_SECTORS.forEach((kind, idx) => {
      const a = ((idx + 0.5) / 8) * Math.PI * 2;
      const ix = Math.cos(a) * R * 0.73;
      const iy = Math.sin(a) * R * 0.73;
      const seg = this.host.addChildPlainNode(disc, `Seg_${idx}`, ix, iy, S(90), S(90));
      if (kind === 'jackpot') {
        const glow = this.mountSprite(seg, 'JackpotGlow', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, S(14), S(90), S(90), rgba(240, 214, 160));
        const glowOp = glow.addComponent(UIOpacity);
        glowOp.opacity = 160;
        tween(glowOp).repeatForever(tween().to(0.6, { opacity: 70 }).to(0.6, { opacity: 180 })).start();
      }
      const icon = this.mountSprite(seg, 'Icon', GUARD_WHEEL_SECTOR_ICON[kind], 0, S(14), S(48), S(48));
      if (kind === 'jackpot') {
        const sprite = icon.getComponent(Sprite);
        if (sprite) {
          sprite.color = rgba(240, 214, 160);
        }
      }
      T(seg, 'Label', GUARD_WHEEL_SECTOR_LABEL[kind], 0, -S(24), 19, kind === 'jackpot' ? GLASS_COLOR.champagne : GLASS_COLOR.text, S(90), HorizontalTextAlignment.CENTER, kind === 'jackpot');
      segIcons.push(seg);
    });
    // 外圈香槟细环(盘面之上、灯珠之下)
    const ringG = this.host.addChildPlainNode(wheel, 'WheelRing', 0, 0, 10, 10).addComponent(Graphics);
    ringG.strokeColor = rgba(214, 186, 132, 235);
    ringG.lineWidth = Math.max(2, S(3.5));
    ringG.circle(0, 0, R + S(6));
    ringG.stroke();
    // 灯珠挪到环上方
    wheel.getChildByName('WheelBulbsA')?.setSiblingIndex(wheel.children.length - 1);
    wheel.getChildByName('WheelBulbsB')?.setSiblingIndex(wheel.children.length - 1);
    const sectorFlash = this.host.addChildPlainNode(wheel, 'SectorFlash', 0, 0, 10, 10);
    const sfG = sectorFlash.addComponent(Graphics);
    sfG.fillColor = rgba(240, 220, 170, 90);
    sfG.moveTo(0, 0);
    sfG.arc(0, 0, R, (67.5 / 180) * Math.PI, (112.5 / 180) * Math.PI, true);
    sfG.close();
    sfG.fill();
    const sectorFlashOp = sectorFlash.addComponent(UIOpacity);
    sectorFlashOp.opacity = 0;
    // 开箱光芒层(箱下)/ 中心宝箱 / 粒子层(箱上):先建空容器锁定层序
    const fxUnder = this.host.addChildPlainNode(wheel, 'OpenFxUnder', 0, 0, 10, 10);
    const chestSize = R * 0.75;
    const chestNode = this.host.addChildPlainNode(wheel, 'GuardWheelChest', 0, R * 0.02, chestSize, chestSize);
    this.mountSprite(chestNode, 'Img', deluxe ? 'ui/codex/ai/chest_ready/spriteFrame' : 'ui/guard/chest_closed/spriteFrame', 0, 0, chestSize, chestSize);
    const fxOver = this.host.addChildPlainNode(wheel, 'OpenFxOver', 0, 0, 10, 10);
    // 指针:香槟倒三角,底边贴环外、尖扎进盘面;入场从上方落下
    const pointerY = R + S(10);
    const pointer = this.host.addChildPlainNode(wheel, 'WheelPointer', 0, pointerY + S(30), 10, 10);
    const pg = pointer.addComponent(Graphics);
    pg.fillColor = rgba(232, 204, 146, 255);
    pg.strokeColor = rgba(90, 70, 40, 200);
    pg.lineWidth = Math.max(1, S(1.5));
    pg.moveTo(0, -S(22));
    pg.lineTo(-S(14), S(4));
    pg.lineTo(S(14), S(4));
    pg.close();
    pg.fill();
    pg.stroke();
    tween(pointer).delay(0.1).to(0.2, { position: new Vec3(0, pointerY, 0) }, { easing: 'backOut' }).start();
    // 结果标签(停格后在轮盘下方弹出,原型「大奖 ×5」dy 560)+ 提示行
    const resultTag = T(wheel, 'WheelResultTag', '', 0, Y(560) - wheelY, 28, GLASS_COLOR.champagne, R * 2.6, HorizontalTextAlignment.CENTER, true);
    resultTag.node.active = false;
    const hintLine = T(wheel, 'WheelHintLine', skippable ? '点击任意处跳过' : '停在哪格就是第一件奖励', 0, Y(560) - wheelY, 20, GLASS_COLOR.sub, R * 2.6, HorizontalTextAlignment.CENTER);
    // ✕:奖励全部到位(出现「收下」)后才响应,等同「收下」
    let wheelParts: GuardWheelParts | null = null;
    mountGlassCloseButton(this.kit, panelRoot, X(W - 48), titleY, k, () => {
      if (wheelParts && wheelParts.closeShown) {
        this.closeWheel(wheelParts);
      }
    }).name = 'GuardWheelX';
    // 落点:5 连/豪华落大奖扇,否则落第一件奖励同类扇;θ_end = 90 - 扇心角 - 整圈数 + 抖动(±14°,扇区 45° 留安全边)
    const firstKind = result.rewards[0]?.kind ?? 'gold';
    const candidates = jackpot ? [7] : GUARD_WHEEL_SECTORS.map((kind, k) => (kind === firstKind ? k : -1)).filter((k) => k >= 0);
    const landIdx = candidates[Math.floor(Math.random() * candidates.length)] ?? 7;
    const turns = result.tier >= 5 ? 7 : result.tier >= 3 ? 6 : 5;
    const thetaEnd = 90 - (landIdx + 0.5) * 45 - 360 * turns + (Math.random() * 2 - 1) * 14;
    const p: GuardWheelParts = {
      overlay, panelRoot, panelOpacity, dimOpacity, wheel, disc, pointer, sectorFlashOp, bulbs, segIcons, segLabels, chestNode, fxUnder, fxOver, resultTag, hintLine,
      result, deluxe, jackpot, compact, panelW, panelH, s, R, colX, colW, titleY, sheet, k, S, X, Y, T,
      phase: 'entering', timers: [], ticker: null, skippable, thetaEnd, landIdx, tickCount: 0, lastIdx: -1, cards: [], closeShown: false,
    };
    wheelParts = p;
    // 点空白:可跳过局里旋转段直跳停格、揭示段全卡到位;BlockInputEvents 只挡穿透,不影响 overlay 自身收事件。
    overlay.on(Node.EventType.TOUCH_END, () => {
      if (!p.skippable || !overlay.isValid) {
        return;
      }
      if (p.phase === 'spinning') {
        Tween.stopAllByTarget(disc);
        disc.angle = p.thetaEnd + 6;
        segIcons.forEach((icon) => { icon.angle = -disc.angle; });
        this.finishWheelSpin(p);
      } else if (p.phase === 'revealing') {
        this.snapWheelReveal(p);
      }
    }, this);
    this.wheelLater(p, 350, () => this.startWheelSpin(p));
  }

  /** 三段旋转:预转 +18°(蓄力)→ 加速到 -432° → 1.55s quartOut 减到 θ_end+6°;每帧检测指针过扇区 → 嘀嗒/指针踢/扇区闪/灯珠追光。 */
  private startWheelSpin(p: GuardWheelParts): void {
    if (p.phase !== 'entering') {
      return;
    }
    p.phase = 'spinning';
    gameAudio.sfx('wheel_spin');
    // 扇区(图标 + 名字)随盘面每帧反向转保持朝上;放在 tween 回调里,不靠下面的 16ms 定时器(定时器被节流时字会转歪)
    const keepUpright = (): void => {
      for (const icon of p.segIcons) {
        icon.angle = -p.disc.angle;
      }
    };
    tween(p.disc)
      .to(0.25, { angle: 18 }, { easing: 'quadOut', onUpdate: keepUpright })
      .to(0.4, { angle: -432 }, { easing: 'quadIn', onUpdate: keepUpright })
      .to(1.55, { angle: p.thetaEnd + 6 }, { easing: 'quartOut', onUpdate: keepUpright })
      .call(() => this.finishWheelSpin(p))
      .start();
    p.ticker = setInterval(() => {
      if (!p.disc.isValid) {
        if (p.ticker) {
          clearInterval(p.ticker);
          p.ticker = null;
        }
        return;
      }
      const theta = p.disc.angle;
      // 图标/文字反向转保持朝上(8+8 个节点,便宜)
      for (const icon of p.segIcons) {
        icon.angle = -theta;
      }
      for (const label of p.segLabels) {
        label.angle = -theta;
      }
      const idx = Math.floor(((((90 - theta) % 360) + 360) % 360) / 45);
      if (idx === p.lastIdx) {
        return;
      }
      p.lastIdx = idx;
      if (p.phase !== 'spinning') {
        return;
      }
      // gameAudio 对同 key 80ms 节流:加速段每 25ms 过一扇只响 1/3,减速末段每次都响
      gameAudio.sfx('wheel_tick');
      Tween.stopAllByTarget(p.pointer);
      p.pointer.angle = 0;
      tween(p.pointer).to(0.04, { angle: -14 }).to(0.12, { angle: 0 }, { easing: 'backOut' }).start();
      Tween.stopAllByTarget(p.sectorFlashOp);
      p.sectorFlashOp.opacity = 255;
      tween(p.sectorFlashOp).to(0.12, { opacity: 0 }).start();
      p.tickCount += 1;
      const on = p.tickCount % 2 === 0;
      p.bulbs[0].opacity = on ? 255 : 90;
      p.bulbs[1].opacity = on ? 90 : 255;
    }, 16);
  }

  /** 停格重击:回弹到 θ_end + 指针大颤 + 面板震 + 扇区闪 3 次常亮 + 停格图标放大 + 灯珠全亮同步闪 + 结果标签;250ms 后开箱。 */
  private finishWheelSpin(p: GuardWheelParts): void {
    if (!p.overlay.isValid || p.phase !== 'spinning') {
      return;
    }
    p.phase = 'stopped';
    Tween.stopAllByTarget(p.disc);
    tween(p.disc).to(0.14, { angle: p.thetaEnd }, { easing: 'backOut', onUpdate: () => p.segIcons.forEach((icon) => { icon.angle = -p.disc.angle; }) }).start();
    gameAudio.sfx('wheel_stop');
    this.shakeField(p.deluxe ? 10 : 6);
    this.shakeNodeX(p.panelRoot, 6, 4);
    Tween.stopAllByTarget(p.pointer);
    p.pointer.angle = 0;
    tween(p.pointer).to(0.05, { angle: -24 }).to(0.35, { angle: 0 }, { easing: 'elasticOut' }).start();
    Tween.stopAllByTarget(p.sectorFlashOp);
    tween(p.sectorFlashOp)
      .set({ opacity: 255 }).delay(0.09).set({ opacity: 60 }).delay(0.09)
      .set({ opacity: 255 }).delay(0.09).set({ opacity: 60 }).delay(0.09)
      .set({ opacity: 255 }).delay(0.09).set({ opacity: 90 })
      .start();
    const icon = p.segIcons[p.landIdx];
    if (icon && icon.isValid) {
      tween(icon).to(0.2, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'backOut' }).to(0.15, { scale: new Vec3(1.15, 1.15, 1) }).start();
    }
    for (const op of p.bulbs) {
      Tween.stopAllByTarget(op);
      tween(op)
        .set({ opacity: 255 }).delay(0.08).set({ opacity: 80 }).delay(0.08)
        .set({ opacity: 255 }).delay(0.08).set({ opacity: 80 }).delay(0.08)
        .set({ opacity: 255 }).delay(0.08).set({ opacity: 80 }).delay(0.08).set({ opacity: 255 })
        .repeatForever(tween().to(0.5, { opacity: 170 }).to(0.5, { opacity: 255 }))
        .start();
    }
    p.hintLine.node.active = false;
    this.wheelLater(p, 50, () => {
      const kind = GUARD_WHEEL_SECTORS[p.landIdx];
      p.resultTag.string = kind === 'jackpot' ? '大奖 ×5' : GUARD_WHEEL_SECTOR_LABEL[kind];
      p.resultTag.color = kind === 'gold' ? rgba(255, 214, 92) : kind === 'summon' ? rgba(200, 160, 255) : kind === 'teamAtk' ? rgba(255, 140, 110) : rgba(255, 220, 90);
      p.resultTag.node.active = true;
      p.resultTag.node.setScale(1.6, 1.6, 1);
      tween(p.resultTag.node).to(0.22, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    });
    this.wheelLater(p, 250, () => this.openWheelChest(p));
  }

  /** 开箱爆发:箱体蓄力压扁 → 换开箱图 1.32 backOut;光芒(cast_flash ×2 / hit_burst / hit_ring ×2 / 骨骼)→ 金币喷泉 → 星屑 → 200ms 后揭示奖励。 */
  private openWheelChest(p: GuardWheelParts): void {
    if (!p.overlay.isValid) {
      return;
    }
    const R = p.R;
    const chest = p.chestNode;
    gameAudio.sfx('chest_open');
    tween(chest)
      .to(0.07, { scale: new Vec3(0.9, 1.1, 1) })
      .call(() => {
        if (!chest.isValid) {
          return;
        }
        chest.getChildByName('Img')?.destroy();
        this.mountSprite(chest, 'Img', p.deluxe ? 'ui/codex/ai/chest_opened/spriteFrame' : 'ui/guard/chest_open/spriteFrame', 0, R * 0.05, R * 0.78, R * 0.78);
        this.spawnWheelOpenBurst(p);
      })
      .to(0.18, { scale: new Vec3(1.32, 1.32, 1) }, { easing: 'backOut' })
      .to(0.14, { scale: Vec3.ONE })
      .start();
    if (p.deluxe) {
      // 豪华开箱图内部是黑的:箱口常驻一枚柔光呼吸,避免"黑洞"
      const mouth = this.mountSprite(p.fxOver, 'MouthGlow', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, R * 0.15, R * 0.6, R * 0.6, rgba(255, 150, 90));
      mouth.addComponent(UIOpacity).opacity = 0;
      tween(mouth.getComponent(UIOpacity) as UIOpacity).delay(0.1).to(0.2, { opacity: 200 }).start();
      tween(mouth).repeatForever(tween().to(0.6, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineInOut' }).to(0.6, { scale: new Vec3(0.9, 0.9, 1) }, { easing: 'sineInOut' })).start();
    }
    this.wheelLater(p, 100, () => this.spawnWheelCoins(p));
    this.wheelLater(p, 150, () => this.spawnWheelStars(p));
    this.wheelLater(p, 200, () => this.revealWheelRewards(p));
  }

  private spawnWheelOpenBurst(p: GuardWheelParts): void {
    const R = p.R;
    const hot = p.deluxe ? rgba(255, 150, 90) : rgba(255, 214, 110);
    const ray = (name: string, size: number, angle0: number, angleDelta: number, peak: number): void => {
      const node = this.mountSprite(p.fxUnder, name, 'ui/guard/cast_flash/spriteFrame', 0, 0, size, size, hot);
      node.angle = angle0;
      node.setScale(0.2, 0.2, 1);
      const op = node.addComponent(UIOpacity);
      op.opacity = 0;
      tween(node).to(0.25, { scale: Vec3.ONE }, { easing: 'quadOut' }).to(1.2, { angle: angle0 + angleDelta }).start();
      tween(op).to(0.25, { opacity: peak }, { easing: 'quadOut' }).delay(0.25).to(0.9, { opacity: 0 }, { easing: 'sineInOut' }).call(() => { if (node.isValid) { node.destroy(); } }).start();
    };
    ray('RayA', R * 2.6, 0, 25, 230);
    if (!p.compact) {
      // 1024² 贴图两层叠 + 全屏压暗,手机端过绘制风险 → 手机只放一层
      ray('RayB', R * 1.8, 45, -30, 170);
    }
    const burst = this.mountSprite(p.fxUnder, 'Burst', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, 0, R * 0.9, R * 0.9, hot);
    burst.setScale(0.5, 0.5, 1);
    const burstOp = burst.addComponent(UIOpacity);
    tween(burst).to(0.35, { scale: new Vec3(3.2, 3.2, 1) }, { easing: 'quadOut' }).start();
    tween(burstOp).to(0.35, { opacity: 0 }).call(() => { if (burst.isValid) { burst.destroy(); } }).start();
    for (let i = 0; i < 2; i += 1) {
      const ring = this.mountSprite(p.fxUnder, `Ring_${i}`, 'ui/battle/c1812/effects/hit_ring/spriteFrame', 0, 0, R * 0.8, R * 0.8, hot);
      ring.setScale(0.4, 0.4, 1);
      const ringOp = ring.addComponent(UIOpacity);
      ringOp.opacity = i === 0 ? 220 : 0;
      tween(ring).delay(i * 0.12).to(0.45, { scale: new Vec3(3.8, 3.8, 1) }, { easing: 'quadOut' }).start();
      tween(ringOp).delay(i * 0.12).set({ opacity: 220 }).to(0.45, { opacity: 0 }).call(() => { if (ring.isValid) { ring.destroy(); } }).start();
    }
    // 骨骼槽位:普通=圣环荡开(箱下),大奖=凤翼光柱(箱上);未就绪静默跳过,贴图层已足够
    if (p.jackpot) {
      this.spawnOverlaySpineFx(p.fxOver, GUARD_CHEST_FX.burstJackpot, 0, R * 0.1, R * GUARD_CHEST_FX.burstJackpot.size, 1100, false);
    } else {
      this.spawnOverlaySpineFx(p.fxUnder, GUARD_CHEST_FX.burstNormal, 0, 0, R * GUARD_CHEST_FX.burstNormal.size, 900, false);
    }
  }

  /** 金币喷泉:数量按档位(1 连 8 / 3 连 14 / 5 连 22 / 豪华 28;手机减量),抛物线上升 quadOut 下落 quadIn,落到盘缘淡出。 */
  private spawnWheelCoins(p: GuardWheelParts): void {
    const R = p.R;
    const tier = p.result.tier;
    const full = p.deluxe ? 28 : tier >= 5 ? 22 : tier >= 3 ? 14 : 8;
    const count = p.compact ? Math.min(full, 20) : full;
    gameAudio.sfx('coin_shower');
    const coinSize = R * 0.19;
    for (let i = 0; i < count; i += 1) {
      const coin = this.mountSprite(p.fxOver, `Coin_${i}`, 'ui/guard/coin_gold/spriteFrame', 0, R * 0.2, coinSize, coinSize);
      const op = coin.addComponent(UIOpacity);
      op.opacity = 0;
      const endX = (Math.random() * 2 - 1) * R * 1.1;
      const peakX = endX * 0.55;
      const peakY = R * 0.2 + R * (0.9 + Math.random() * 0.7);
      const delay = i * 0.018;
      tween(coin)
        .delay(delay)
        .call(() => { op.opacity = 255; })
        .to(0.28, { position: new Vec3(peakX, peakY, 0), angle: (Math.random() * 2 - 1) * 180 }, { easing: 'quadOut' })
        .to(0.42, { position: new Vec3(endX, -R * 0.95, 0), angle: (Math.random() * 2 - 1) * 360 }, { easing: 'quadIn' })
        .start();
      tween(op).delay(delay + 0.5).to(0.2, { opacity: 0 }).call(() => { if (coin.isValid) { coin.destroy(); } }).start();
    }
  }

  /** 星屑:3 连起 12 颗(豪华 14 / 手机 10)橙红星径向散开 0.5s。 */
  private spawnWheelStars(p: GuardWheelParts): void {
    if (p.result.tier < 3) {
      return;
    }
    const R = p.R;
    const count = p.compact ? 10 : p.deluxe ? 14 : 12;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = R * (1.3 + Math.random() * 0.7);
      const star = this.mountSprite(p.fxOver, `Star_${i}`, i % 2 === 0 ? 'ui/common/ai/star_orange/spriteFrame' : 'ui/common/ai/star_red/spriteFrame', 0, 0, R * 0.16, R * 0.16);
      const op = star.addComponent(UIOpacity);
      tween(star).to(0.5, { position: new Vec3(Math.cos(a) * dist, Math.sin(a) * dist, 0), scale: new Vec3(0.3, 0.3, 1) }, { easing: 'quadOut' }).start();
      tween(op).delay(0.15).to(0.35, { opacity: 0 }).call(() => { if (star.isValid) { star.destroy(); } }).start();
    }
  }

  /** 奖励揭示:档位章盖入 + 奖励卡(图标/名称/数额)从右滑入逐张落位(每张按种类响一声、金币数额滚动)→ 收下按钮;5 连/豪华叠大奖演出。 */
  private revealWheelRewards(p: GuardWheelParts): void {
    if (!p.overlay.isValid) {
      return;
    }
    p.phase = 'revealing';
    const { tier, rewards } = p.result;
    const { S, X, Y, T, k } = p;
    // 档位:标题后弹出香槟描边胶囊(原型「5 连大奖」,替代旧红横幅 / 大字档位);1 连不出
    const tierText = p.deluxe || tier >= 5 ? '5 连大奖' : tier >= 3 ? '3 连奖' : '';
    if (tierText) {
      const titleText = p.deluxe ? 'BOSS 豪华宝箱' : '矿脉宝箱';
      const pillW = estimateGlassTextWidth(tierText, 24) + 40;
      const pill = this.host.addChildPlainNode(p.panelRoot, 'GuardWheelTier', X(72 + estimateGlassTextWidth(titleText, 34) * 1.1 + 22 + pillW / 2), p.titleY, S(pillW), S(40));
      const pg = pill.addComponent(Graphics);
      pg.fillColor = rgba(40, 32, 20, 200);
      pg.roundRect(-S(pillW) / 2, -S(20), S(pillW), S(40), S(12));
      pg.fill();
      pg.strokeColor = rgba(227, 196, 138, 255);
      pg.lineWidth = Math.max(1.2, S(2));
      pg.roundRect(-S(pillW) / 2, -S(20), S(pillW), S(40), S(12));
      pg.stroke();
      T(pill, 'Text', tierText, 0, 0, 24, GLASS_COLOR.champagne, S(pillW - 16), HorizontalTextAlignment.CENTER, true);
      const from = p.jackpot ? 2.4 : 1.8;
      pill.setScale(from, from, 1);
      pill.angle = -6;
      tween(pill).to(p.jackpot ? 0.3 : 0.25, { scale: Vec3.ONE, angle: 0 }, { easing: 'backOut' }).call(() => {
        if (p.jackpot) {
          this.shakeField(14);
          this.shakeNodeX(p.panelRoot, 10, 5);
        }
      }).start();
    }
    if (p.jackpot) {
      this.playWheelJackpot(p);
    } else {
      // 1/3 连:揭示短旋律(大奖走 chest_jackpot 铜管,不叠)
      gameAudio.sfx('chest_reveal');
    }
    // 奖励条:503×52,首条行中 dy 177,行距 64;图标中心距左沿 46(48 见方),名字左沿 105,数额右沿距右缘 18
    const colW = p.colW;
    const cardH = S(52);
    const stagger = tier >= 5 ? 0.16 : tier >= 3 ? 0.2 : 0;
    rewards.forEach((reward, i) => {
      const y = Y(177 + i * 64);
      const card = this.host.addChildPlainNode(p.panelRoot, `GuardWheelRewardCard_${i}`, p.colX + S(40), y, colW, cardH);
      mountGlassSlice(this.kit, card, 'Glass', GLASS_SLICES.panel, 0, 0, colW, cardH, k);
      this.mountSprite(card, 'CardIcon', GUARD_WHEEL_SECTOR_ICON[reward.kind], -colW / 2 + S(46), 0, S(44), S(44));
      const name = reward.kind === 'gold' ? (reward.label.startsWith('阵地已满') ? '阵地已满 → 金币' : '战斗金币') : reward.kind === 'summon' ? reward.label : '全队攻击';
      T(card, 'CardText', name, -colW / 2 + S(105), 0, 22, GLASS_COLOR.text, S(260));
      const amountX = colW / 2 - S(18);
      if (reward.kind === 'summon') {
        T(card, 'CardAmount', '已上阵', amountX, 0, 22, GLASS_COLOR.green, S(130), HorizontalTextAlignment.RIGHT);
      } else {
        T(card, 'CardAmount', reward.kind === 'teamAtk' ? '+8%' : '+0', amountX, 0, 26, GLASS_COLOR.champagne, S(130), HorizontalTextAlignment.RIGHT, true);
      }
      const op = card.addComponent(UIOpacity);
      op.opacity = 0;
      const delay = i * stagger;
      tween(card)
        .delay(delay)
        .to(0.22, { position: new Vec3(p.colX, y, 0) }, { easing: 'backOut' })
        .call(() => this.onWheelCardLand(p, card, reward))
        .to(0.06, { scale: new Vec3(1.06, 1.06, 1) })
        .to(0.1, { scale: Vec3.ONE })
        .start();
      tween(op).delay(delay).to(0.22, { opacity: 255 }).start();
      p.cards.push(card);
    });
    this.wheelLater(p, Math.round((rewards.length - 1) * stagger * 1000) + 220 + 150, () => this.showWheelClose(p));
  }

  /** 奖励卡落位:按种类响一声(金币 coin / 召唤 summon / 强攻 level_up)+ 金币数额 0→amount 滚动 + 免费召唤飘字。 */
  private onWheelCardLand(p: GuardWheelParts, card: Node, reward: GuardChestReward): void {
    if (!card.isValid) {
      return;
    }
    gameAudio.sfx(reward.kind === 'gold' ? 'coin' : reward.kind === 'summon' ? 'summon' : 'level_up');
    if (reward.kind === 'gold') {
      const amount = card.getChildByName('CardAmount')?.getComponent(Label) ?? null;
      const steps = 7;
      for (let k = 1; k <= steps; k += 1) {
        this.wheelLater(p, k * 40, () => {
          if (amount && amount.isValid) {
            amount.string = `+${Math.round((reward.amount * k) / steps)}`;
          }
        });
      }
    } else if (reward.kind === 'summon' && this.sim && this.sim.heroes.length > 0) {
      // 免费召唤是"开箱瞬间直接上阵到随机空格"(不涨召唤费):对应卡落位时给新英雄头上飘绿字点明
      const newest = this.sim.heroes.reduce((latest, hero) => (hero.unitId > latest.unitId ? hero : latest), this.sim.heroes[0]);
      const center = this.cellCenter(newest.cell);
      this.spawnFloater(center.x, center.y + this.unitSize() * 0.75, '免费招募!已上阵', rgba(150, 240, 160));
    }
  }

  /** 揭示段点空白:全部奖励卡立即到位、数额直接写满、收下按钮立刻出现。 */
  private snapWheelReveal(p: GuardWheelParts): void {
    p.cards.forEach((card, i) => {
      if (!card.isValid) {
        return;
      }
      Tween.stopAllByTarget(card);
      const op = card.getComponent(UIOpacity);
      if (op) {
        Tween.stopAllByTarget(op);
        op.opacity = 255;
      }
      card.setPosition(p.colX, card.position.y, 0);
      card.setScale(1, 1, 1);
      const reward = p.result.rewards[i];
      const amount = card.getChildByName('CardAmount')?.getComponent(Label) ?? null;
      if (reward && reward.kind === 'gold' && amount) {
        amount.string = `+${reward.amount}`;
      }
    });
    this.showWheelClose(p);
  }

  /** 5 连 / 豪华大奖:全屏闪金 + 横幅砸入(面板震)+ 面板背后大光芒 + 彩星雨 + 灯珠快闪 + 开箱图呼吸。 */
  private playWheelJackpot(p: GuardWheelParts): void {
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const hotFill = p.deluxe ? rgba(255, 140, 80, 255) : rgba(255, 236, 180, 255);
    gameAudio.sfx('chest_jackpot');
    // 2026-09-28 用户:"开启豪华宝箱的时候全屏黄"——原先是整屏纯色 Graphics 矩形 + UIOpacity 淡出,
    // 实测(无头冻结峰值帧)UIOpacity 对 Graphics 填充不生效,整屏不透明橙 0.44s。改为只用面板中心的径向柔光贴图(Sprite 能正常淡出)。
    const glowSize = Math.min(width, height) * 1.15;
    const glow = this.mountSprite(p.overlay, 'GuardWheelGlow', 'ui/battle/c1812/effects/hit_burst/spriteFrame', 0, 0, glowSize, glowSize, hotFill);
    glow.setSiblingIndex(1);
    glow.setScale(0.5, 0.5, 1);
    const glowOp = glow.addComponent(UIOpacity);
    glowOp.opacity = 0;
    tween(glow).to(0.45, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' }).start();
    tween(glowOp).to(0.08, { opacity: 170 }).to(0.5, { opacity: 0 }, { easing: 'quadIn' }).call(() => { if (glow.isValid) { glow.destroy(); } }).start();
    // 2026-11-11 B 改版:红横幅去掉,档位改成标题后的「5 连大奖」胶囊(revealWheelRewards 里砸入 + 震屏)
    // 面板背后大光芒(压暗层之上、面板之下):新批次金色光丝聚拢爆开(与结算胜利同款);豪华箱染暖红。未就绪才回退旧星芒贴图。
    const rayTint = p.deluxe ? rgba(255, 120, 70) : rgba(255, 214, 110);
    const rayFx = LOBBY_UI_FX.victoryTitle;
    const rayFxHolder = this.host.addChildPlainNode(p.overlay, 'GuardJackpotRayFx', 0, 0, 10, 10);
    rayFxHolder.setSiblingIndex(1);
    const rayFxNode = rayFx ? mountLobbySpineFx(this.host, rayFxHolder, rayFx, 0, 0, p.panelH * 1.5, false, 1700) : null;
    if (rayFxNode && p.deluxe) {
      const sk = rayFxNode.getComponent(sp.Skeleton);
      if (sk) {
        sk.color = rgba(255, 170, 130);
      }
    }
    const rayLayers = rayFxNode ? 0 : p.compact ? 1 : 2;
    for (let i = 0; i < rayLayers; i += 1) {
      const ray = this.mountSprite(p.overlay, `GuardJackpotRay_${i}`, 'ui/guard/cast_flash/spriteFrame', 0, 0, p.panelH * 1.4, p.panelH * 1.4, rayTint);
      ray.setSiblingIndex(1);
      ray.angle = i * 22;
      const rayOp = ray.addComponent(UIOpacity);
      rayOp.opacity = 0;
      tween(ray).to(1.4, { angle: i * 22 + (i === 0 ? 30 : -30) }).start();
      tween(rayOp).delay(0.05).to(0.2, { opacity: 160 }).to(1.2, { opacity: 0 }).call(() => { if (ray.isValid) { ray.destroy(); } }).start();
    }
    // 彩星雨
    const starCount = p.compact ? 12 : 20;
    for (let i = 0; i < starCount; i += 1) {
      const x = (Math.random() - 0.5) * width;
      const star = this.mountSprite(p.overlay, `GuardJackpotStar_${i}`, i % 2 === 0 ? 'ui/common/ai/star_orange/spriteFrame' : 'ui/common/ai/star_red/spriteFrame', x, height / 2 + 30, p.R * 0.16, p.R * 0.16);
      const starOp = star.addComponent(UIOpacity);
      const delay = 0.1 + Math.random() * 0.6;
      tween(star).delay(delay).to(1.4, { position: new Vec3(x + (Math.random() - 0.5) * 60, -height / 2 - 30, 0), angle: (Math.random() - 0.5) * 360 }, { easing: 'quadIn' }).start();
      tween(starOp).delay(delay + 1.1).to(0.3, { opacity: 0 }).call(() => { if (star.isValid) { star.destroy(); } }).start();
    }
    // 灯珠 2s 快闪后回慢呼吸;开箱图呼吸(等开箱弹跳结束再接)
    p.bulbs.forEach((op, group) => {
      Tween.stopAllByTarget(op);
      const seq = tween(op);
      for (let k = 0; k < 12; k += 1) {
        const on = (k + group) % 2 === 0;
        seq.set({ opacity: on ? 255 : 90 }).delay(0.08);
      }
      seq.repeatForever(tween().to(0.5, { opacity: 170 }).to(0.5, { opacity: 255 })).start();
    });
    this.wheelLater(p, 300, () => {
      if (p.chestNode.isValid) {
        tween(p.chestNode).repeatForever(tween().to(0.5, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' }).to(0.5, { scale: Vec3.ONE }, { easing: 'sineInOut' })).start();
      }
    });
  }

  private showWheelClose(p: GuardWheelParts): void {
    if (!p.overlay.isValid || p.closeShown) {
      return;
    }
    p.closeShown = true;
    // 收下:香槟主钮 258×60,中心 (896, 542)
    const close = mountGlassButton(this.kit, p.panelRoot, 'GuardWheelClose', '收下', p.X(896), p.Y(542), p.S(258), p.S(60), p.k, 'primary', undefined, 28);
    close.setScale(0.6, 0.6, 1);
    tween(close).to(0.25, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    if (p.result.tier !== 3) {
      gameAudio.sfx('reward_claim');
    }
    close.on(Button.EventType.CLICK, () => this.closeWheel(p), this);
  }

  /** 收下:立即解锁 wheelOverlayOpen(防"点不动")→ 金币卡飞币到右上 HUD → 面板/压暗淡出 → 260ms 销毁并恢复战斗。 */
  private closeWheel(p: GuardWheelParts): void {
    if (!p.overlay.isValid || p.phase === 'done') {
      return;
    }
    p.phase = 'done';
    this.wheelOverlayOpen = false;
    gameAudio.sfx('ui_click');
    if (p.ticker) {
      clearInterval(p.ticker);
      p.ticker = null;
    }
    const root = this.root;
    const rootTransform = root?.getComponent(UITransform) ?? null;
    if (root && rootTransform) {
      const targetX = this.layoutWidth / 2 - 180;
      const targetY = this.layoutHeight / 2 - 42;
      let coinIndex = 0;
      let sfxLeft = 3;
      p.result.rewards.forEach((reward, i) => {
        const card = p.cards[i];
        if (reward.kind !== 'gold' || !card || !card.isValid) {
          return;
        }
        const from = rootTransform.convertToNodeSpaceAR((card.getChildByName('CardIcon') ?? card).getWorldPosition());
        const count = reward.amount >= 300 ? 10 : 6;
        for (let k = 0; k < count; k += 1) {
          const coin = this.mountSprite(root, 'GuardWheelFlyCoin', 'ui/guard/coin_gold/spriteFrame', from.x, from.y, 28, 28);
          const midX = (from.x + targetX) / 2 + (Math.random() - 0.5) * 60;
          const midY = Math.max(from.y, targetY) + 80 + Math.random() * 40;
          let done = false;
          const finish = (): void => {
            if (done) {
              return;
            }
            done = true;
            if (coin.isValid) {
              coin.destroy();
            }
            const goldText = root.getChildByName('GuardHud')?.getChildByName('GuardGoldText');
            if (goldText && goldText.isValid) {
              tween(goldText).to(0.08, { scale: new Vec3(1.22, 1.22, 1) }).to(0.12, { scale: Vec3.ONE }).start();
            }
            if (sfxLeft > 0) {
              sfxLeft -= 1;
              gameAudio.sfx('coin');
            }
          };
          tween(coin)
            .delay(coinIndex * 0.04)
            .to(0.22, { position: new Vec3(midX, midY, 0) }, { easing: 'quadOut' })
            .to(0.23, { position: new Vec3(targetX, targetY, 0), scale: new Vec3(0.6, 0.6, 1) }, { easing: 'quadIn' })
            .call(finish)
            .start();
          setTimeout(finish, 1500);
          coinIndex += 1;
        }
      });
    }
    Tween.stopAllByTarget(p.panelRoot);
    tween(p.panelRoot).to(0.18, { scale: new Vec3(0.96, 0.96, 1) }, { easing: 'quadIn' }).start();
    tween(p.panelOpacity).to(0.18, { opacity: 0 }).start();
    tween(p.dimOpacity).to(0.22, { opacity: 0 }).start();
    this.wheelLater(p, 180, () => gameAudio.sfx('panel_close'));
    setTimeout(() => {
      this.destroyWheel(p);
      this.syncBattlePause();
    }, 260);
  }

  private destroyWheel(p: GuardWheelParts): void {
    for (const id of p.timers) {
      clearTimeout(id);
    }
    p.timers.length = 0;
    if (p.ticker) {
      clearInterval(p.ticker);
      p.ticker = null;
    }
    if (p.overlay.isValid) {
      p.overlay.destroy();
    }
  }

  // ── P2:升级三选一(pendingChoice 即暂停) ──
  private syncChoiceOverlay(): void {
    const sim = this.sim;
    const root = this.root;
    if (!sim || !root) {
      return;
    }
    const existing = root.getChildByName('GuardChoiceOverlay');
    if (!sim.pendingChoice) {
      if (existing) {
        existing.destroy();
        this.choiceOverlayLevel = 0;
        this.lastTickWallMs = Date.now();
        this.tickAccumulatorMs = 0;
      }
      return;
    }
    if (existing && this.choiceOverlayLevel === sim.choiceSerial) {
      return;
    }
    existing?.destroy();
    this.choiceOverlayLevel = sim.choiceSerial;
    // 2026-11-11 B 毛玻璃(原型 周报截图/2026-11-11_守卫战弹层/proto/guard_choice_b.png 1:1):面板 1042×646,
    // 居中标题(香槟竖条 + 标题)+ 副标题 + 分隔线 → 三张玻璃卡(顶边稀有度细线 + 同色标签胶囊 + 圆形头像 / 图标 + 英雄名 + 卡名 + 描述)→ 卡下「✕ 放逐」→ 底部灰玻璃「刷新」。
    const W = 1042;
    const H = 646;
    const shell = this.mountGuardGlass('GuardChoiceOverlay', W, H, { bare: true });
    if (!shell) {
      return;
    }
    const { panel, k, S, X, Y, T } = shell;
    const fromEnhance = sim.choiceSource === 'enhance';
    const hasGold = sim.pendingChoice.some((option) => option.rarity === 'gold');
    const titleCore = hasGold ? '稀有战术出现!专属大招觉醒' : fromEnhance ? `战术 ×${sim.enhanceLevel} · 选择一张战术卡` : `等级提升!Lv${sim.level} · 三选一`;
    // 标题组(竖条 7 + 间距 20 + 标题)整体居中;行中 dy 36,字号 34 粗
    const titleW = estimateGlassTextWidth(titleCore, 34);
    const groupLeft = W / 2 - (27 + titleW) / 2;
    this.kit.addSprite('GuardChoiceTitleBar', GLASS_ICON.accent, X(groupLeft + 3.5), Y(36), S(7), S(33), panel);
    T(panel, 'GuardChoiceTitle', titleCore, X(groupLeft + 27), Y(36), 34, hasGold ? GLASS_COLOR.champagne : GLASS_COLOR.text, S(W - 140), HorizontalTextAlignment.LEFT, true);
    T(panel, 'GuardChoiceSubtitle', '选择一张战术卡,获得强大的战斗增益', X(W / 2), Y(77), 20, GLASS_COLOR.sub, S(W - 160), HorizontalTextAlignment.CENTER);
    mountGlassLine(this.kit, panel, 'GuardChoiceDivider', 0, Y(103), S(W - 114), Math.max(1, S(1.5)), new Color(150, 158, 172, 70));
    if (hasGold) {
      gameAudio.sfx('gacha_rare');
    }
    // 卡:277×390,上沿 dy 129,卡距 32,整组居中
    const cardW = 277;
    const cardH = 390;
    const cardGap = 32;
    const count = sim.pendingChoice.length;
    const firstCx = W / 2 - ((count - 1) * (cardW + cardGap)) / 2;
    const cardCy = 129 + cardH / 2;
    sim.pendingChoice.forEach((option, index) => {
      const isGold = option.rarity === 'gold';
      const cx = firstCx + index * (cardW + cardGap);
      const card = this.host.addChildPlainNode(panel, `GuardChoiceCard_${index}`, X(cx), Y(cardCy), S(cardW), S(cardH));
      this.buildPerkCard(card, option, shell, cardW, cardH);
      // 入场:逐张弹入;金卡(专属大招)最后落下。
      card.setScale(0.6, 0.6, 1);
      tween(card).delay(0.06 * index + (isGold ? 0.12 : 0)).to(0.2, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' }).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
      this.host.applyImageButtonFeedback(card, 1.03, 0.97);
      card.on(Node.EventType.TOUCH_END, () => {
        guardChooseOption(sim, index);
      }, this);
      if (!option.locked && sim.banishLeft > 0) {
        // 「✕ 放逐」:卡下沿 + 24,字号 20 灰;点击区放大
        const banish = this.host.addChildPlainNode(panel, `GuardChoiceBanish_${index}`, X(cx), Y(129 + cardH + 24), S(160), S(44));
        T(banish, 'Label', '✕ 放逐', 0, 0, 20, GLASS_COLOR.sub, S(150), HorizontalTextAlignment.CENTER);
        this.host.applyImageButtonFeedback(banish, 1.06, 0.95);
        banish.on(Node.EventType.TOUCH_END, () => {
          if (guardBanishChoice(sim, index)) {
            this.choiceOverlayLevel = 0;
          }
        }, this);
      }
    });
    // 刷新(灰玻璃 279×52,行中 dy 600);升级三选一另有「跳过」,两键左右各让 160
    const rerollX = fromEnhance ? W / 2 : W / 2 + 160;
    mountGlassButton(this.kit, panel, 'GuardChoiceReroll', `刷新 (剩 ${sim.rerollLeft})`, X(rerollX), Y(600), S(279), S(52), k, 'secondary', () => {
      if (guardRerollChoice(sim)) {
        this.choiceOverlayLevel = 0;
      } else {
        this.host.setStatus('刷新次数已用完。');
      }
    }, 22);
    if (!fromEnhance) {
      mountGlassButton(this.kit, panel, 'GuardChoiceSkip', '跳过 (+50 金币)', X(W / 2 - 160), Y(600), S(279), S(52), k, 'secondary', () => {
        guardSkipChoice(sim);
      }, 22);
    }
  }

  /**
   * 单张战术卡(B 毛玻璃,原型 guard_choice_b):玻璃底 + 顶边稀有度细线 → 同色描边标签胶囊(卡顶 +40)→ 圆形头像 / 通用图标(+134,直径 122)
   * → 英雄名(+213,17 灰)→ 卡名(+249,28 粗白;金卡 = 「专属大招名」香槟色 + 副题)→ 描述(首行 +290,20 号,行高 29)。坐标为卡内原型像素(从卡顶算)。
   */
  private buildPerkCard(card: Node, option: GuardChoiceOption, shell: GlassPopupShell, cardW: number, cardH: number): void {
    const sim = this.sim;
    const { k, S, T } = shell;
    const isGold = option.rarity === 'gold';
    const tone = GUARD_PERK_GLASS_TONE[option.rarity] ?? GUARD_PERK_GLASS_TONE.white;
    const CY = (dy: number): number => S(cardH / 2 - dy);
    mountGlassSlice(this.kit, card, 'Glass', GLASS_SLICES.panel, 0, 0, S(cardW), S(cardH), k);
    // 顶边细线:圆角内缩 10,高 4
    mountGlassLine(this.kit, card, 'RarityLine', 0, CY(2), S(cardW - 20), Math.max(2, S(4)), tone.line);
    const heroMatch = /^【(.+?)】(.*)$/.exec(option.title);
    const heroName = heroMatch ? heroMatch[1] : '';
    const perkTitle = heroMatch ? heroMatch[2] : option.title;
    const style = GUARD_PERK_CARD_STYLE[option.rarity] ?? GUARD_PERK_CARD_STYLE.white;
    const tagText = option.rarity === 'purple' && option.school ? `专属流派 · ${option.school}` : style.tag;
    // 标签胶囊:高 36,字号 18,左右各留 22;描边 = 稀有度色
    const tagFont = 18;
    const tagW = Math.min(cardW - 40, estimateGlassTextWidth(tagText, tagFont) + 44);
    const tagNode = this.host.addChildPlainNode(card, 'Tag', 0, CY(40), S(tagW), S(36));
    const tg = tagNode.addComponent(Graphics);
    tg.fillColor = new Color(10, 14, 22, 170);
    tg.roundRect(-S(tagW) / 2, -S(18), S(tagW), S(36), S(18));
    tg.fill();
    tg.strokeColor = tone.line;
    tg.lineWidth = Math.max(1.2, S(1.8));
    tg.roundRect(-S(tagW) / 2, -S(18), S(tagW), S(36), S(18));
    tg.stroke();
    const tagLabel = T(tagNode, 'Text', tagText, 0, 0, tagFont, tone.text, S(tagW - 20), HorizontalTextAlignment.CENTER, true);
    tagLabel.fontSize = Math.max(12, Math.round(S(tagFont)));
    tagLabel.lineHeight = tagLabel.fontSize + 4;
    // 圆形头像位:暗底 + 细灰环
    const ringD = S(122);
    const ringY = CY(134);
    const disc = this.host.addChildPlainNode(card, 'AvatarDisc', 0, ringY, ringD + 6, ringD + 6).addComponent(Graphics);
    disc.fillColor = new Color(10, 12, 18, 220);
    disc.circle(0, 0, ringD / 2);
    disc.fill();
    if (option.heroCode && sim) {
      const pool = sim.pool.find((entry) => entry.heroCode.toUpperCase() === option.heroCode?.toUpperCase());
      const avatar = this.host.addChildPlainNode(card, 'Avatar', 0, ringY, ringD, ringD);
      const mask = avatar.addComponent(Mask);
      mask.type = Mask.Type.GRAPHICS_ELLIPSE;
      this.mountStatsAvatar(avatar, { name: pool?.displayName ?? option.heroCode, rarity: (pool?.rarity ?? 'R').toUpperCase(), ally: this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null }, ringD);
    } else {
      const icon = GUARD_WHITE_PERK_ICON[option.perkId];
      if (icon) {
        const box = ringD * 0.7;
        const iw = icon.aspect >= 1 ? box / icon.aspect : box;
        const ih = icon.aspect >= 1 ? box : box * icon.aspect;
        this.mountSprite(card, 'Icon', icon.path, 0, ringY, iw, ih);
      }
    }
    const ring = this.host.addChildPlainNode(card, 'AvatarRing', 0, ringY, ringD + 6, ringD + 6).addComponent(Graphics);
    ring.strokeColor = isGold ? new Color(227, 196, 138, 230) : new Color(176, 184, 198, 150);
    ring.lineWidth = Math.max(1.2, S(2));
    ring.circle(0, 0, ringD / 2);
    ring.stroke();
    const innerW = S(cardW - 40);
    if (heroName) {
      T(card, 'Hero', option.offField ? `${heroName}(未上场)` : heroName, 0, CY(213), 17, option.offField ? GLASS_COLOR.dim : GLASS_COLOR.sub, innerW, HorizontalTextAlignment.CENTER);
    }
    const mainTitle = isGold ? `「${this.resolveGuardSkillDisplayName(option.heroCode, '专属大招')}」` : perkTitle;
    T(card, 'Title', mainTitle, 0, CY(249), 28, isGold ? GLASS_COLOR.champagne : GLASS_COLOR.text, innerW, HorizontalTextAlignment.CENTER, true);
    let detailTop = 276;
    if (isGold) {
      T(card, 'Sub', perkTitle, 0, CY(282), 19, new Color(240, 200, 150, 255), innerW, HorizontalTextAlignment.CENTER);
      detailTop = 300;
    }
    const detailBottom = cardH - 18;
    const detailH = S(detailBottom - detailTop);
    const detail = T(card, 'Detail', option.detail, 0, CY((detailTop + detailBottom) / 2), 20, new Color(206, 212, 222, 255), innerW, HorizontalTextAlignment.CENTER);
    detail.enableWrapText = true;
    detail.overflow = Label.Overflow.SHRINK;
    detail.lineHeight = Math.round(detail.fontSize * 1.45);
    detail.verticalAlign = VerticalTextAlignment.TOP;
    detail.node.getComponent(UITransform)?.setContentSize(innerW, detailH);
    if (option.offField) {
      const shade = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);
      shade.opacity = 190;
    }
  }

  // ── P2:BOSS 读条条(集火打断) ──
  private syncBossCastBar(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const existing = field.getChildByName('GuardBossCastBar');
    if (!sim.bossCast) {
      existing?.destroy();
      if (this.bossChargeAuraLive) {
        // 读条被别的途径结束(BOSS 死亡/重开)时兜底收掉脚下法阵。
        this.monsterViews.forEach((view) => this.clearBossChargeAura(view));
        this.bossChargeAuraLive = false;
      }
      return;
    }
    const boss = sim.monsters.find((monster) => monster.monsterId === sim.bossCast?.monsterId && !monster.dead);
    if (!boss) {
      existing?.destroy();
      return;
    }
    const barW = 200;
    const barH = 14;
    const x = this.xToPx(boss.x);
    const bossView = this.monsterViews.get(boss.monsterId);
    const headY = bossView?.node.isValid ? bossView.node.position.y + this.monsterHeadOffsetY(boss) + 44 : this.laneToPy(boss.lane) + this.unitSize();
    const y = Math.min(headY, this.layoutHeight * 0.47);
    let bar = existing;
    if (!bar) {
      bar = this.host.addChildPlainNode(field, 'GuardBossCastBar', x, y, barW, barH + 22);
      bar.addComponent(Graphics);
      this.host.addChildLabel(bar, 'GuardBossCastText', '', 0, barH + 4, 12, rgba(255, 180, 150), new Size(barW + 80, 16));
    }
    bar.setPosition(x, y, 0);
    const g = bar.getComponent(Graphics);
    if (g) {
      const progress = Math.min(1, (sim.timeMs - sim.bossCast.startMs) / Math.max(1, sim.bossCast.hitMs - sim.bossCast.startMs));
      g.clear();
      g.fillColor = rgba(10, 8, 8, 220);
      g.roundRect(-barW / 2, -barH / 2, barW, barH, 6);
      g.fill();
      g.fillColor = rgba(235, 70, 50, 245);
      g.roundRect(-barW / 2, -barH / 2, Math.max(4, barW * progress), barH, 6);
      g.fill();
      g.strokeColor = rgba(255, 210, 160, 235);
      g.lineWidth = 1.6;
      g.roundRect(-barW / 2, -barH / 2, barW, barH, 6);
      g.stroke();
    }
    const text = bar.getChildByName('GuardBossCastText')?.getComponent(Label);
    if (text) {
      const pct = Math.round((sim.bossCast.damageTaken / Math.max(1, sim.bossCast.threshold)) * 100);
      text.string = `灭世轰击蓄力中 · 集火打断 ${Math.min(100, pct)}%`;
    }
  }

  // ── 打击感系统(2026-08-26 用户拍板:弹幕射击+受击反馈)──
  /** 普攻弹幕:发光弹体从英雄身前归巢飞向目标,命中才结算飘字+爆闪+受击红闪。 */
  private spawnProjectile(fromX: number, fromY: number, monster: GuardMonster, amount: number, color: Color, spec?: BattleAttackFxSpec, extra?: { scale?: number; crit?: boolean; heroCode?: string }): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    if (this.projectiles.length >= 40) {
      // 弹体满载:直接结算命中(伤害表现不丢)
      this.resolveProjectileHit(this.xToPx(monster.x), this.monsterY(monster.lane, monster.x) + this.monsterJitterY(monster) * this.monsterSpread(monster.x), monster.monsterId, amount, color);
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardProjectile', fromX, fromY, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const spineSpec = spec && extra?.heroCode ? resolveHeroAttackSpineFx(extra.heroCode) : null;
    const spineFx = spineSpec ? this.attackSpineFxReady.get(spineSpec.effect) : undefined;
    if (spineSpec && !spineFx) {
      // 开局预热时战场节点还没建好/合成换了新英雄:出手时补一次预热,本发先走贴图弹道。
      this.prewarmAttackSpineFx(spineSpec);
    }
    if (spec && spineSpec && spineFx && this.projectiles.filter((entry) => entry.spine).length < graphicsCaps().spineProjectiles) {
      // fx_pack 飞行特效(2026-09-21):骨骼动画弹体循环播放,按实测包围盒等比缩到目标长度并把包围盒中心对到弹道点上;
      // 近战命中时照旧由 strikeSpec 全尺寸爆开。同屏 Spine 弹体有限额,超额回退下面的贴图弹道。
      const melee = spec.kind === 'strike';
      const fit = (this.unitSize() * spineFx.spec.size * (extra?.scale ?? 1)) / Math.max(spineFx.w, spineFx.h);
      // 骨骼弹体复用池(2026-10-10 长帧归因:每发 new 骨骼实例 + 命中销毁):同一特效的弹体命中后隐藏回池,下次只重放动画
      const pool = this.projectileFxPool.get(spineSpec.effect) ?? [];
      this.projectileFxPool.set(spineSpec.effect, pool);
      let pooled = pool.pop() ?? null;
      while (pooled && (!pooled.isValid || pooled.parent !== field)) {
        pooled = pool.pop() ?? null;
      }
      let fxNode = pooled?.getChildByName('Fx') ?? null;
      let skeleton = fxNode?.getComponent(sp.Skeleton) ?? null;
      let projNode = pooled;
      if (!projNode || !fxNode || !skeleton) {
        projNode = node;
        fxNode = this.host.addChildPlainNode(projNode, 'Fx', 0, 0, 10, 10);
        skeleton = fxNode.addComponent(sp.Skeleton);
        LobbyGuardBattleRenderer.useSharedFxCache(skeleton);
        skeleton.premultipliedAlpha = false;
        skeleton.skeletonData = spineFx.data;
      } else {
        node.destroy();
        projNode.active = true;
        projNode.setPosition(fromX, fromY, 0);
        projNode.angle = 0;
        projNode.setSiblingIndex(field.children.length - 1);
      }
      fxNode.setPosition(-spineFx.cx * fit, -spineFx.cy * fit, 0);
      fxNode.setScale(fit, fit, 1);
      try {
        skeleton.setAnimation(0, spineFx.animation, true);
      } catch (error) {
        void error;
      }
      this.projectiles.push({
        node: projNode,
        fxEffect: spineSpec.effect,
        targetId: monster.monsterId,
        x: fromX,
        y: fromY,
        amount,
        color,
        strikeSpec: melee ? spec : undefined,
        crit: extra?.crit,
        scale: extra?.scale,
        heroCode: extra?.heroCode,
        spine: true,
        speedMult: melee ? 0.8 : 1,
      });
      return;
    }
    // 配了骨骼特效的英雄不再回退 AI 贴图(2026-10-05 用户:「圣光审判者普攻还有 AI 贴图」):
    // 骨骼还没读好 / 同屏超额时走下面的通用光弹,命中走爆闪,等骨骼就绪自动换成专属特效。
    if (spec && !spineSpec) {
      // 专属贴图(朝右绘制,飞行时父节点按方向旋转;等比设尺寸不拉伸)。
      // 近战(strike):飞行体取 0.6 倍,命中时再由 strikeSpec 全尺寸爆开,形成"蓄力飞出 → 命中炸开"。
      const melee = spec.kind === 'strike';
      const lengthPx = this.unitSize() * spec.size * (melee ? 0.6 : 1) * (extra?.scale ?? 1);
      this.mountSprite(node, 'Img', resolveAttackFxSpritePath(spec), 0, 0, lengthPx, lengthPx * spec.aspect);
      this.projectiles.push({
        node,
        targetId: monster.monsterId,
        x: fromX,
        y: fromY,
        amount,
        color,
        strikeSpec: melee ? spec : undefined,
        crit: extra?.crit,
        scale: extra?.scale,
        heroCode: extra?.heroCode,
        // 近战飞得比远程慢一点:贴脸距离本来就短(2~4 格),快了就成"瞬移",看不见飞出去的过程
        //(2026-09-12 实测 1.9 倍时 60ms 内已命中)。
        speedMult: melee ? 0.8 : 1,
      });
      return;
    }
    // 弹体:亮核+外辉+尾迹(朝右绘制,飞行时整体旋转)。2026-10-07 由每发 new Graphics 改为烘焙贴图精灵(见 GuardBakedShapes)
    this.mountBakedSprite(node, boltFrame(color), -BOLT_SIZE.originX, 0, BOLT_SIZE.w, BOLT_SIZE.h);
    this.projectiles.push({ node, targetId: monster.monsterId, x: fromX, y: fromY, amount, color, crit: extra?.crit, scale: extra?.scale, heroCode: extra?.heroCode });
  }

  /**
   * 一次普攻的全部命中(docs/32 §3):主弹/多重副发/散射=各自一发弹道从英雄身前扇形飞出(副发错开 70ms);
   * 穿透=从主目标身上再射向后排;溅射/紫卡补击=落点直接爆开。巨型放大弹体,会心走大号金字。
   * 模型"出手即结算",这里纯表现;同屏弹道满 40 时自动退化成直接结算。
   */
  private spawnAttackVolley(hero: GuardHeroUnit, mainTarget: GuardMonster, event: GuardEvent, color: Color, spec: BattleAttackFxSpec, fromX: number, fromY: number): void {
    const sim = this.sim;
    if (!sim) {
      return;
    }
    const hits = event.hits && event.hits.length > 0 ? event.hits : [{ monsterId: mainTarget.monsterId, amount: event.amount ?? 0, kind: 'main' as const }];
    const scale = GUARD_GIANT_VISUAL_SCALE[event.giantLv ?? 0] ?? 1;
    const flying = hits.filter((hit) => hit.kind === 'main' || hit.kind === 'multi' || hit.kind === 'spread');
    const fanStep = this.unitSize() * 0.22;
    flying.forEach((hit, index) => {
      const monster = sim.monsters.find((entry) => entry.monsterId === hit.monsterId) ?? mainTarget;
      const offsetY = (index - (flying.length - 1) / 2) * fanStep;
      const launch = (): void => {
        if (this.sim !== sim || !this.fieldNode?.isValid) {
          return;
        }
        this.spawnProjectile(fromX, fromY + offsetY, monster, hit.amount, color, spec, { scale: hit.kind === 'spread' ? scale * 0.8 : scale, crit: !!event.crit && hit.kind === 'main', heroCode: hero.heroCode });
      };
      if (index === 0) {
        launch();
      } else {
        setTimeout(launch, 70 * index);
      }
    });
    const mainX = this.xToPx(mainTarget.x);
    const mainY = this.monsterY(mainTarget.lane, mainTarget.x);
    hits.filter((hit) => hit.kind === 'pierce' || hit.kind === 'splash' || hit.kind === 'perk').forEach((hit, index) => {
      const monster = sim.monsters.find((entry) => entry.monsterId === hit.monsterId);
      if (!monster) {
        return;
      }
      setTimeout(() => {
        if (this.sim !== sim || !this.fieldNode?.isValid) {
          return;
        }
        if (hit.kind === 'pierce') {
          this.spawnProjectile(mainX, mainY + this.unitSize() * 0.12, monster, hit.amount, color, spec, { scale: scale * 0.85, heroCode: hero.heroCode });
          return;
        }
        const x = this.xToPx(monster.x);
        const y = this.monsterY(monster.lane, monster.x) + this.unitSize() * 0.12;
        if (hit.kind === 'perk' && this.spawnSpineBurstFx(resolveGuardPerkProcFx(event.perkId), x, y - this.unitSize() * 0.12, 1)) {
          // 专属词条补击:播该词条自己的特效(冰刺/光锤/咒阵…),伤害数字与受击红闪照常。
          this.queueDamage(monster.monsterId, hit.amount, false, x, y);
          this.flashMonster(monster.monsterId);
          return;
        }
        this.resolveProjectileHit(x, y, monster.monsterId, hit.amount, hit.kind === 'perk' ? rgba(220, 150, 255) : color, undefined, false, hit.kind === 'splash' ? 0.7 : 0.85, hero.heroCode);
      }, 160 + 50 * index);
    });
    if (event.perkId && hero) {
      const purple = resolveGuardHeroPerkProfile(hero.heroCode, hero.role).purple;
      const now = Date.now();
      if (purple && purple.suffix === event.perkId && now - (this.perkShoutAt.get(hero.unitId) ?? 0) > 2500) {
        this.perkShoutAt.set(hero.unitId, now);
        const center = this.cellCenter(hero.cell);
        this.spawnFloater(center.x, center.y + this.unitSize() * 0.75, `${purple.name}!`, rgba(226, 170, 255), 16);
      }
    }
  }

  /** 保底技能弹:完整特效被限流时,从英雄身前发一颗大号发光弹(纯表现)——技能归属永远可见。 */
  private spawnSkillBolt(heroCell: number, monster: GuardMonster | null, ult = false): void {
    const field = this.fieldNode;
    if (!field || !monster || (!ult && this.projectiles.length >= 40)) {
      return;
    }
    const origin = this.cellCenter(heroCell);
    const fromX = origin.x + this.heroDisplaySize() * 0.5;
    const fromY = origin.y + this.heroDisplaySize() * 0.1;
    const node = this.host.addChildPlainNode(field, 'GuardSkillBolt', fromX, fromY, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    node.setScale(ult ? 2.2 : 1.6, ult ? 2.2 : 1.6, 1);
    // 大招保底弹改金色(紫色 = 战技保底弹),一眼分得出是大招
    const tint = ult ? rgba(255, 200, 90) : rgba(200, 150, 255);
    // 烘焙贴图精灵(2026-10-07,原每发 new Graphics);外形与通用光弹同款、略放大
    this.mountBakedSprite(node, boltFrame(tint, ult ? 150 : 140, ult ? 160 : 150), -BOLT_SIZE.originX * 1.15, 0, BOLT_SIZE.w * 1.15, BOLT_SIZE.h * 1.15);
    this.projectiles.push({ node, targetId: monster.monsterId, x: fromX, y: fromY, amount: 0, color: tint, visualOnly: true });
  }

  /** 弹体落地:骨骼弹体隐藏回池(按特效键,每键最多 10 个),其余销毁。 */
  private releaseProjectileNode(proj: GuardProjectile): void {
    const node = proj.node;
    if (!node.isValid) {
      return;
    }
    if (proj.fxEffect && this.fieldNode && node.parent === this.fieldNode) {
      const pool = this.projectileFxPool.get(proj.fxEffect) ?? [];
      this.projectileFxPool.set(proj.fxEffect, pool);
      if (pool.length < 10) {
        node.active = false;
        pool.push(node);
        return;
      }
    }
    node.destroy();
  }

  /** 每 tick 推进弹幕(跟随锁定目标;目标死亡落在其最后位置;命中=爆闪+飘字+受击红闪)。 */
  private updateProjectiles(frameMs: number): void {
    const sim = this.sim;
    if (!sim || this.projectiles.length === 0 || sim.paused) {
      return;
    }
    // 每渲染帧推进,速度按真实帧时长折算(原 90px / 50ms tick ≈ 1800px/s,不变)
    const baseSpeed = 90 * (frameMs / TICK_MS);
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const proj = this.projectiles[i];
      if (!proj.node.isValid) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const speed = baseSpeed * (proj.speedMult ?? 1);
      if (proj.crystalTarget) {
        // BOSS 暗弹:飞向水晶,命中=水晶红闪+飘字+小震屏
        const tx = this.xToPx(GUARD_CRYSTAL_REACH_X) - this.unitSize() * 0.5;
        const ty = this.walkwayY() + this.layoutHeight * 0.02;
        const dx = tx - proj.x;
        const dy = ty - proj.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= speed) {
          if (!proj.impactFx || !this.spawnSpineBurstFx(proj.impactFx, tx, ty, 1, 700, true)) {
            this.spawnImpactFlash(tx, ty, proj.color);
          }
          const impactText = proj.impactLabel
            ? `${proj.impactLabel} -${this.formatDamageValue(proj.amount)}`
            : `-${this.formatDamageValue(proj.amount)}`;
          this.spawnFloater(tx, ty + this.unitSize() * 0.4, impactText, rgba(255, 120, 100), proj.impactLabel ? 26 : 20);
          const shake = proj.impactShake ?? 5;
          if (shake > 0) {
            this.shakeField(shake);
          }
          const crystalSprite = this.fieldNode?.getChildByName('GuardCrystal')?.getChildByName('GuardCrystalIcon')?.getComponent(Sprite);
          if (crystalSprite && crystalSprite.isValid) {
            crystalSprite.color = rgba(255, 130, 110, 255);
            setTimeout(() => {
              if (crystalSprite.isValid) {
                crystalSprite.color = rgba(255, 255, 255, 255);
              }
            }, 130);
          }
          this.releaseProjectileNode(proj);
          this.projectiles.splice(i, 1);
        } else {
          proj.x += (dx / dist) * speed;
          proj.y += (dy / dist) * speed;
          proj.node.setPosition(proj.x, proj.y, 0);
          proj.node.angle = Math.atan2(dy, dx) * (180 / Math.PI);
        }
        continue;
      }
      // 2026-10-05 用户「弹道飞一半突然自动换方向」:目标中途死亡不再改追别的怪,
      // 沿原方向飞到目标最后所在的位置落地(伤害在出手时已结算,这里只是表现)。
      // 死怪在 sim.monsters 里还会留几秒:照样取它的位置(伤害在出手时已结算,目标常常在弹体出手那一刻就已经死了,
      // 只认活怪的话弹体一出手就没有落点,会直接在英雄身上爆开)。
      const target = sim.monsters.find((entry) => entry.monsterId === proj.targetId) ?? null;
      if (target && target.player) {
        // 掠夺进攻方:位置由 GuardRaidController 插值,直接瞄它的节点
        const raiderView = this.monsterViews.get(target.monsterId);
        if (raiderView && raiderView.node.isValid) {
          proj.aimX = raiderView.node.position.x;
          proj.aimY = raiderView.node.position.y + this.unitSize() * 0.12;
        }
      } else if (target) {
        proj.aimX = this.xToPx(target.x);
        proj.aimY = this.monsterY(target.lane, target.x) + this.monsterJitterY(target) * this.monsterSpread(target.x) + this.unitSize() * 0.12;
      }
      const hasAim = proj.aimX !== undefined && proj.aimY !== undefined;
      const tx = proj.aimX ?? proj.x + speed;
      const ty = proj.aimY ?? proj.y;
      const dx = tx - proj.x;
      const dy = ty - proj.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= speed || !hasAim) {
        if (proj.visualOnly) {
          this.spawnImpactFlash(tx, ty, proj.color);
          this.flashMonster(proj.targetId);
        } else {
          this.resolveProjectileHit(tx, ty, proj.targetId, proj.amount, proj.color, proj.strikeSpec, proj.crit, proj.scale, proj.heroCode);
        }
        this.releaseProjectileNode(proj);
        this.projectiles.splice(i, 1);
        continue;
      }
      proj.x += (dx / dist) * speed;
      proj.y += (dy / dist) * speed;
      proj.node.setPosition(proj.x, proj.y, 0);
      proj.node.angle = Math.atan2(dy, dx) * (180 / Math.PI);
    }
  }

  /** 伤害数字缩写阶梯(2026-08-28 用户拍板):千=K,百万=M,十亿=B;再往上 T/Qa/Qi(放置游戏惯例)。 */
  private formatDamageValue(n: number): string {
    if (n < 1000) {
      return `${n}`;
    }
    const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let value = n;
    let idx = -1;
    while (value >= 1000 && idx < units.length - 1) {
      value /= 1000;
      idx += 1;
    }
    const text = value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '');
    return `${text}${units[idx]}`;
  }

  /**
   * 伤害数字:每次命中各自弹一个数字(2026-08-28 起不合并 ×N)。
   * 2026-11-11 战斗画面精致化(用户确认样片):改用粗斜体位图字(BattleNumberFont:普通 = 冷白,战技 / 大额 / 狂暴 = 橙红,
   * 字高按格子大小定,手机电脑同比例),落位从「绕着目标 12 方位撒开」改成「按列往上叠」——见 placeDamageNumber。
   * 位图字还没读到时退回原来的系统字体(开战加载门里已预读,正常不会走到)。同屏上限保性能(超限时小字让位给大字)。
   */
  private liveDamageFloaters = 0;
  /** 伤害数字占位:格键(横带 × 4096 + 列)→ 每一排最近一次被占用的时刻(毫秒)。 */
  private readonly damageColumns = new Map<number, number[]>();

  /**
   * 伤害数字落位:屏幕按 0.3 格宽分列、0.31 格高分排(最多 3 排)。一个数字按自己的宽度占连续几列,
   * 先在目标正上方从下往上找空排,正上方三排都占着再让到右 / 左邻位;全都占着才顶掉最旧的那个。
   * 同一时刻的数字互不压住,又都贴着各自的目标(原先是绕着目标 12 方位撒开,一密就叠成一团)。
   */
  private placeDamageNumber(x: number, y: number, width: number): { px: number; py: number } {
    const u = this.unitSize();
    const colW = u * 0.3;
    const rowH = u * 0.31;
    const now = Date.now();
    // 上下两路怪的数字各叠各的
    const band = Math.round(y / (u * 0.9)) + 64;
    const span = Math.max(1, Math.ceil((width + u * 0.04) / colW));
    const rowsOf = (col: number): number[] => {
      const key = band * 4096 + col + 2048;
      let rows = this.damageColumns.get(key);
      if (!rows) {
        rows = [0, 0, 0];
        this.damageColumns.set(key, rows);
      }
      return rows;
    };
    /** 从 start 列起连续 span 列的第 row 排,最晚一次被占是什么时候。 */
    const takenAt = (start: number, row: number): number => {
      let latest = 0;
      for (let col = start; col < start + span; col += 1) {
        latest = Math.max(latest, rowsOf(col)[row]);
      }
      return latest;
    };
    const centerStart = Math.round(x / colW - span / 2);
    let bestStart = centerStart;
    let bestRow = 0;
    let bestAt = Number.POSITIVE_INFINITY;
    let found = false;
    for (const shift of [0, 1, -1, 2, -2]) {
      for (let row = 0; row < 3 && !found; row += 1) {
        const at = takenAt(centerStart + shift, row);
        if (now - at >= GUARD_DAMAGE_SLOT_MS) {
          found = true;
        }
        if (found || at < bestAt) {
          bestStart = centerStart + shift;
          bestRow = row;
          bestAt = at;
        }
      }
      if (found) {
        break;
      }
    }
    for (let col = bestStart; col < bestStart + span; col += 1) {
      rowsOf(col)[bestRow] = now;
    }
    return { px: (bestStart + span / 2) * colW, py: y + u * 0.38 + bestRow * rowH };
  }

  private queueDamage(targetId: number, amount: number, skill: boolean, x: number, y: number): void {
    if (targetId === this.raiderMonsterId || this.sim?.monsters.find((entry) => entry.monsterId === targetId)?.player) {
      // 进攻方 / 同伴掉血由 GuardRaidController 按折算后的实际数值飘(heroAttack 的 amount 是折算前的)
      return;
    }
    const big = skill || amount >= 1000;
    // 精简模式(战斗设置):只留暴击/大额与打在 BOSS 身上的数字;水晶掉血走 spawnFloater,不受影响。
    if (this.damageNumbersLite && !big && this.sim?.monsters.find((entry) => entry.monsterId === targetId)?.kind !== 'boss') {
      return;
    }
    const floaterCap = big ? graphicsCaps().floatersBig : graphicsCaps().floatersSmall;
    if (this.liveDamageFloaters >= floaterCap || this.floatersThisStep >= graphicsCaps().floatersPerTick) {
      return;
    }
    this.floatersThisStep += 1;
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const u = this.unitSize();
    const rage = !big && this.rageActive();
    const valueText = this.formatDamageValue(amount);
    // 字高按格子定(手机电脑同比例):普通 0.15 格(1080p 上 26 像素)、狂暴 0.165、大额 0.19、战技 0.21(约 36 像素)
    const digitPx = u * (skill ? 0.21 : big ? 0.19 : rage ? 0.165 : 0.15);
    const { px, py } = this.placeDamageNumber(x, y, battleNumberWidth(valueText, digitPx));

    // 伤害数字复用池(2026-10-10 长帧归因:每个数字 new 节点 + Label + 3 个 tween 再销毁,是长帧里最大的脚本开销):
    // 用完隐藏回池,下次只改文字 / 字号。大小两池沿用(系统字体兜底时大数字带暴击箭头)。
    const pool = big ? this.damageNumPool.big : this.damageNumPool.small;
    let node = pool.pop() ?? null;
    while (node && (!node.isValid || node.parent !== field)) {
      node = pool.pop() ?? null;
    }
    let label = node?.getChildByName('Text')?.getComponent(Label) ?? null;
    if (!node || !label) {
      node = this.host.addChildPlainNode(field, 'GuardDamageNum', px, py, big ? 200 : 120, 32);
      label = this.host.addChildLabel(node, 'Text', '', 0, 0, 20, rgba(255, 255, 255, 255), new Size(big ? 140 : 116, 30));
      node.addComponent(UIOpacity);
    } else {
      Tween.stopAllByTarget(node);
      node.setPosition(px, py, 0);
      node.active = true;
    }
    if (applyBattleNumber(label, big || rage ? 'crit' : 'normal', valueText, digitPx)) {
      label.color = rgba(255, 255, 255, 255);
      label.node.setPosition(0, 0, 0);
      const icon = node.getChildByName('Icon');
      if (icon) {
        icon.active = false;
      }
    } else {
      this.applySystemDamageNumber(node, label, valueText, skill, big, rage);
    }
    node.setSiblingIndex(field.children.length - 1);
    this.liveDamageFloaters += 1;
    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    Tween.stopAllByTarget(opacity);
    opacity.opacity = 255;
    // 弹出:先小幅弹大再回落,再上飘淡出
    node.setScale(big ? 0.6 : 0.8, big ? 0.6 : 0.8, 1);
    tween(node).to(0.09, { scale: new Vec3(big ? 1.18 : 1.06, big ? 1.18 : 1.06, 1) }, { easing: 'backOut' })
      .to(0.1, { scale: Vec3.ONE }).start();
    const life = big ? 0.95 : 0.78;
    tween(node).by(life, { position: new Vec3(0, u * 0.22, 0) }, { easing: 'quadOut' }).start();
    const released = node;
    tween(opacity).delay(life * 0.5).to(life * 0.45, { opacity: 0 }).call(() => {
      this.liveDamageFloaters = Math.max(0, this.liveDamageFloaters - 1);
      if (!released.isValid) {
        return;
      }
      if (pool.length < 24) {
        released.active = false;
        pool.push(released);
      } else {
        released.destroy();
      }
    }).start();
  }

  /** 位图字没读到时的兜底:原来的系统字体数字(Arial 字符缓存 + 描边,大数字带暴击箭头)。 */
  private applySystemDamageNumber(node: Node, label: Label, valueText: string, skill: boolean, big: boolean, rage: boolean): void {
    const size = skill ? 24 : big ? 22 : rage ? 18 : 16;
    if (big && !node.getChildByName('Icon')) {
      this.mountSprite(node, 'Icon', 'ui/guard/crit_marker/spriteFrame', -46, -2, 34, 34);
    }
    label.node.setPosition(big ? 26 : 0, 0, 0);
    // 字符缓存(2026-10-07):数字字形进共享字符图集,不再每个飘字单独画一张画布 + 上传一张贴图 + 单独一次绘制。
    label.cacheMode = Label.CacheMode.CHAR;
    label.enableOutline = true;
    label.outlineColor = rgba(40, 12, 6, 255);
    label.outlineWidth = big ? 3 : 2;
    label.string = `-${valueText}`;
    label.fontSize = size;
    label.lineHeight = size + 8;
    label.color = skill ? rgba(255, 92, 92, 252) : big ? rgba(255, 120, 80, 250) : rage ? rgba(255, 150, 70, 250) : rgba(255, 248, 236, 240);
    label.node.getComponent(UITransform)?.setContentSize(big ? 140 : 116, size + 10);
    // 引擎字形缓存的键不含画面缩放,切换画质 / 窗口缩放后旧字形大小不对:按当前缩放换一个等价字体名,让新缩放用新字形。
    const family = LobbyGuardBattleRenderer.damageFontFamily();
    if (label.fontFamily !== family) {
      label.fontFamily = family;
    }
  }

  /** 命中结算:爆闪(近战=全尺寸斩击炸开)+伤害入聚合窗+目标受击红闪。 */
  private resolveProjectileHit(x: number, y: number, targetId: number, amount: number, color: Color, strikeSpec?: BattleAttackFxSpec, crit?: boolean, scale = 1, heroCode?: string): void {
    if (heroCode && this.spawnAttackHitFx(heroCode, x, y, scale)) {
      // fx_pack 配套命中特效已播:不再叠静态斩击图/十字爆闪。
    } else if (strikeSpec && !(heroCode && resolveHeroAttackSpineFx(heroCode))) {
      // 没配骨骼特效的英雄才用静态斩击图;配了的(骨骼未就绪时)走下面的爆闪
      this.spawnStrikeFx(strikeSpec, x, y, scale);
    } else {
      this.spawnImpactFlash(x, y, color);
    }
    this.queueDamage(targetId, amount, !!crit, x, y);
    this.flashMonster(targetId);
  }

  /**
   * 英雄专属命中特效(fx_pack 的 _hit 系列,2026-09-21):在命中点播一遍即销毁;按实测包围盒等比缩放并居中,
   * 过长的动画加速到 ≤0.5s。未预热好/同屏超限返回 false,由调用方回退静态斩击图或十字爆闪。
   */
  /** 水晶特效锚点:水晶节点中心略偏上(GuardCrystal 节点在 field 坐标系)。 */
  private crystalFxCenter(): { x: number; y: number } {
    const crystal = this.fieldNode?.getChildByName('GuardCrystal');
    if (crystal && crystal.isValid) {
      return { x: crystal.position.x, y: crystal.position.y + this.unitSize() * 0.15 };
    }
    return { x: this.xToPx(GUARD_CRYSTAL_REACH_X) - this.unitSize() * 0.5, y: this.walkwayY() + this.layoutHeight * 0.02 };
  }

  /**
   * 圣辉涌泉表现(2026-09-24):水晶处播大号金色圣光(播一遍,拉到 ~1.8s),回血绿字;
   * 每个在场友军套一层金色光罩(循环骨骼,跟随英雄节点),持续到 sim.supportSurgeUntilMs,再淡出。
   */
  private playSupportSurge(sim: GuardBattleState, caster: GuardHeroUnit, healed: number): void {
    const center = this.crystalFxCenter();
    if (!this.spawnSpineBurstFx(GUARD_SUPPORT_FX.crystalHealBig, center.x, center.y - this.unitSize() * 0.15, 1, 1800)) {
      this.spawnCellBurst(center.x, center.y, rgba(255, 230, 140), true);
    }
    if (healed > 0) {
      this.spawnFloater(center.x, center.y + this.unitSize() * 0.55, `+${this.formatDamageValue(healed)}`, rgba(160, 255, 180), 26);
    }
    const durationMs = Math.max(1200, sim.supportSurgeUntilMs - sim.timeMs);
    for (const hero of sim.heroes) {
      const view = this.heroViews.get(hero.unitId);
      if (!view || !view.node.isValid) {
        continue;
      }
      this.attachAllyShield(view, durationMs, hero.unitId === caster.unitId ? 1.15 : 1);
    }
  }

  /** 给友军脚下套金色光环(垫在英雄骨骼之下):已有则续时;循环播放,到期 0.35s 淡出销毁。未就绪时补预热并退化为金色描边脉动椭圆。 */
  private attachAllyShield(view: GuardUnitView, durationMs: number, scaleMult: number): void {
    const existing = view.node.getChildByName('GuardAllyShield');
    const until = Date.now() + durationMs;
    if (existing && existing.isValid) {
      (existing as unknown as { __shieldUntil?: number }).__shieldUntil = until;
      return;
    }
    const spec = GUARD_SUPPORT_FX.allyShield;
    const ready = this.attackSpineFxReady.get(spec.effect);
    const unit = this.unitSize();
    const shield = this.host.addChildPlainNode(view.node, 'GuardAllyShield', 0, -unit * 0.42, 10, 10);
    shield.setSiblingIndex(0);
    (shield as unknown as { __shieldUntil?: number }).__shieldUntil = until;
    if (ready) {
      const fit = (unit * spec.size * scaleMult) / Math.max(ready.w, ready.h);
      const fxNode = this.host.addChildPlainNode(shield, 'Fx', -ready.cx * fit, -ready.cy * fit, 10, 10);
      fxNode.setScale(fit, fit, 1);
      const skeleton = fxNode.addComponent(sp.Skeleton);
      LobbyGuardBattleRenderer.useSharedFxCache(skeleton);
      skeleton.premultipliedAlpha = false;
      skeleton.skeletonData = ready.data;
      try {
        skeleton.setAnimation(0, ready.animation, true);
      } catch (error) {
        void error;
      }
    } else {
      this.prewarmAttackSpineFx(spec);
      const g = shield.addComponent(Graphics);
      g.strokeColor = rgba(255, 220, 120, 220);
      g.lineWidth = 4;
      g.ellipse(0, 0, unit * 0.5 * scaleMult, unit * 0.16 * scaleMult);
      g.stroke();
      tween(shield).repeatForever(tween().to(0.5, { scale: new Vec3(1.06, 1.06, 1) }).to(0.5, { scale: Vec3.ONE })).start();
    }
    const opacity = shield.addComponent(UIOpacity);
    opacity.opacity = 0;
    tween(opacity).to(0.25, { opacity: 235 }).start();
    const tick = (): void => {
      if (!shield.isValid) {
        return;
      }
      const remain = ((shield as unknown as { __shieldUntil?: number }).__shieldUntil ?? 0) - Date.now();
      if (remain > 0) {
        setTimeout(tick, Math.min(remain, 500));
        return;
      }
      tween(opacity).to(0.35, { opacity: 0 }).call(() => { if (shield.isValid) { shield.destroy(); } }).start();
    };
    setTimeout(tick, Math.min(durationMs, 500));
  }

  /**
   * BOSS 按皮肤播专属动作(GUARD_BOSS_ANIMS):charge=循环直到被替换;blast/skill=播一遍接回行走。
   * 皮肤没配或骨骼里找不到该动画:charge 保持原样,出手类回退通用攻击动作。
   */
  private playBossAnim(monster: GuardMonster | null, view: GuardUnitView | undefined, key: 'charge' | 'blast' | 'skill'): void {
    if (!view || !view.spineReady || !view.skeleton || !view.skeleton.isValid) {
      return;
    }
    const name = monster ? GUARD_BOSS_ANIMS[monster.spineCode]?.[key] : undefined;
    let found = false;
    try {
      found = !!name && !!view.skeleton.findAnimation(name);
    } catch (error) {
      void error;
    }
    if (!found || !name) {
      if (key !== 'charge') {
        this.playUnitAttack(view);
      }
      return;
    }
    try {
      if (key === 'charge') {
        view.skeleton.setAnimation(0, name, true);
        // 蓄力期间不让头顶血条重新采样(动作顶点会高于行走姿态)。
        view.attackHoldUntil = Date.now() + 60_000;
        return;
      }
      const entry = view.skeleton.setAnimation(0, name, false);
      view.skeleton.addAnimation(0, view.idleAnim, true, 0);
      let ms = 1000;
      const end = (entry as unknown as { animationEnd?: number } | null)?.animationEnd;
      if (typeof end === 'number' && Number.isFinite(end) && end > 0) {
        ms = end * 1000;
      }
      view.attackHoldUntil = Date.now() + ms + 120;
    } catch (error) {
      void error;
    }
  }

  /** 读条被打断:有受击踉跄动作就播一遍再接回行走,否则直接回行走。 */
  private playBossStun(view: GuardUnitView | undefined): void {
    if (!view || !view.spineReady || !view.skeleton || !view.skeleton.isValid) {
      return;
    }
    try {
      if (view.skeleton.findAnimation('beaten_stun')) {
        view.skeleton.setAnimation(0, 'beaten_stun', false);
        view.skeleton.addAnimation(0, view.idleAnim, true, 0);
      } else {
        view.skeleton.setAnimation(0, view.idleAnim, true);
      }
    } catch (error) {
      void error;
    }
    view.attackHoldUntil = Date.now() + 1200;
  }

  /** 蓄力法阵:挂在 BOSS 节点脚下、垫在骨骼之下循环播放;未就绪退化为紫色脉动椭圆。 */
  private attachBossChargeAura(view: GuardUnitView | undefined): void {
    if (!view || !view.node.isValid || view.node.getChildByName('GuardBossChargeAura')) {
      return;
    }
    const unit = this.unitSize();
    const aura = this.host.addChildPlainNode(view.node, 'GuardBossChargeAura', this.bossVisualOffsetX(view), -unit * 0.45, 10, 10);
    aura.setSiblingIndex(0);
    const spec = GUARD_BOSS_FX.chargeAura;
    const ready = this.attackSpineFxReady.get(spec.effect);
    if (ready) {
      const fit = (unit * spec.size) / Math.max(ready.w, ready.h);
      const fxNode = this.host.addChildPlainNode(aura, 'Fx', -ready.cx * fit, -ready.cy * fit, 10, 10);
      fxNode.setScale(fit, fit, 1);
      const skeleton = fxNode.addComponent(sp.Skeleton);
      skeleton.premultipliedAlpha = false;
      skeleton.skeletonData = ready.data;
      try {
        skeleton.setAnimation(0, ready.animation, true);
      } catch (error) {
        void error;
      }
    } else {
      this.prewarmAttackSpineFx(spec);
      const g = aura.addComponent(Graphics);
      g.strokeColor = rgba(200, 90, 255, 230);
      g.lineWidth = 5;
      g.ellipse(0, 0, unit * 1.5, unit * 0.45);
      g.stroke();
      tween(aura).repeatForever(tween().to(0.4, { scale: new Vec3(1.08, 1.08, 1) }).to(0.4, { scale: Vec3.ONE })).start();
    }
    const opacity = aura.addComponent(UIOpacity);
    opacity.opacity = 0;
    tween(opacity).to(0.3, { opacity: 255 }).start();
    this.bossChargeAuraLive = true;
  }

  private clearBossChargeAura(view: GuardUnitView | undefined): void {
    const aura = view?.node.isValid ? view.node.getChildByName('GuardBossChargeAura') : null;
    if (!aura || !aura.isValid) {
      return;
    }
    aura.name = 'GuardBossChargeAuraFading';
    const opacity = aura.getComponent(UIOpacity) ?? aura.addComponent(UIOpacity);
    Tween.stopAllByTarget(opacity);
    tween(opacity).to(0.25, { opacity: 0 }).call(() => { if (aura.isValid) { aura.destroy(); } }).start();
  }

  /** BOSS 打水晶的骨骼弹道(不占普通弹道限额):循环飞行体飞向水晶,到达时播 impact 爆点 + 飘字 + 震屏;未就绪回退紫色暗弹。 */
  private spawnBossCrystalProjectile(
    sx: number,
    sy: number,
    spec: { effect: string; animation: string; size: number },
    impact: { effect: string; animation: string; size: number },
    amount: number,
    opts: { shake: number; speedMult: number; label?: string },
  ): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardBossBolt', sx, sy, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const ready = this.attackSpineFxReady.get(spec.effect);
    let spine = false;
    if (ready) {
      const fit = (this.unitSize() * spec.size) / Math.max(ready.w, ready.h);
      const fxNode = this.host.addChildPlainNode(node, 'Fx', -ready.cx * fit, -ready.cy * fit, 10, 10);
      fxNode.setScale(fit, fit, 1);
      const skeleton = fxNode.addComponent(sp.Skeleton);
      skeleton.premultipliedAlpha = false;
      skeleton.skeletonData = ready.data;
      try {
        skeleton.setAnimation(0, ready.animation, true);
        spine = true;
      } catch (error) {
        void error;
      }
    } else {
      this.prewarmAttackSpineFx(spec);
    }
    if (!spine) {
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(180, 90, 255, 150);
      g.ellipse(0, 0, 22, 12);
      g.fill();
      g.fillColor = rgba(255, 120, 200, 245);
      g.ellipse(2, 0, 12, 7);
      g.fill();
    }
    this.projectiles.push({
      node,
      targetId: -1,
      x: sx,
      y: sy,
      amount,
      color: rgba(200, 110, 255),
      crystalTarget: true,
      impactShake: opts.shake,
      speedMult: opts.speedMult,
      impactFx: impact,
      impactLabel: opts.label,
    });
  }

  /** 远程怪的弹道:按皮肤取 fx_pack 骨骼飞行体,循环播放并按包围盒等比缩放;未就绪/超限额回退暗红箭矢贴图。 */
  private spawnCrystalBolt(attacker: GuardMonster, attackerView: GuardUnitView, amount: number): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const sx = attackerView.node.position.x - this.unitSize() * 0.3;
    const sy = attackerView.node.position.y + this.unitSize() * 0.25;
    const node = this.host.addChildPlainNode(field, 'GuardShooterBolt', sx, sy, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const spec = resolveGuardMonsterProjectileFx(attacker.spineCode);
    const ready = spec ? this.attackSpineFxReady.get(spec.effect) : undefined;
    if (spec && !ready) {
      this.prewarmAttackSpineFx(spec);
    }
    if (spec && ready && this.projectiles.filter((entry) => entry.spine).length < graphicsCaps().spineProjectiles) {
      const fit = (this.unitSize() * spec.size) / Math.max(ready.w, ready.h);
      const fxNode = this.host.addChildPlainNode(node, 'Fx', -ready.cx * fit, -ready.cy * fit, 10, 10);
      fxNode.setScale(fit, fit, 1);
      const skeleton = fxNode.addComponent(sp.Skeleton);
      LobbyGuardBattleRenderer.useSharedFxCache(skeleton);
      skeleton.premultipliedAlpha = false;
      skeleton.skeletonData = ready.data;
      try {
        skeleton.setAnimation(0, ready.animation, true);
      } catch (error) {
        void error;
      }
      this.projectiles.push({ node, targetId: -1, x: sx, y: sy, amount, color: rgba(255, 130, 80), crystalTarget: true, impactShake: 0, spine: true });
      return;
    }
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(255, 110, 70, 160);
    g.ellipse(0, 0, 13, 6);
    g.fill();
    g.fillColor = rgba(255, 190, 120, 245);
    g.ellipse(1, 0, 7, 3);
    g.fill();
    this.projectiles.push({ node, targetId: -1, x: sx, y: sy, amount, color: rgba(255, 130, 80), crystalTarget: true, impactShake: 0 });
  }

  private spawnAttackHitFx(heroCode: string, x: number, y: number, scale: number): boolean {
    return this.spawnSpineBurstFx(resolveHeroAttackSpineFx(heroCode)?.hit ?? null, x, y, scale);
  }

  /** 一次性骨骼爆点(普攻命中 / 专属词条触发共用):未就绪时补预热并返回 false,由调用方回退。 */
  /**
   * 眩晕星星(docs/41 §6):头顶一圈 3 颗金星绕圈转(椭圆轨道 = 父节点压扁 + 星星反向拉回),跟着怪走,眩晕结束销毁。
   * 头顶高度按怪物体型(monsterHeadOffsetY),BOSS 头上也对得准。
   */
  private mountStunStars(view: GuardUnitView, monster: GuardMonster): void {
    const unit = this.unitSize();
    const radius = unit * 0.34 * Math.min(2, Math.sqrt(GUARD_MONSTER_DISPLAY_SCALE[monster.kind] ?? 1));
    // 小怪锚血条位置(已按体型校准、贴着头顶);monsterHeadOffsetY 对矮胖小怪高估一截,2026-10-24 实录星星悬在头顶上方约一格
    const starY = monster.kind !== 'boss' && view.hpBarOffsetY !== undefined ? view.hpBarOffsetY + unit * 0.12 : this.monsterHeadOffsetY(monster) - unit * 0.02;
    const holder = this.host.addChildPlainNode(view.node, 'GuardStunStars', view.centerOffsetX ?? 0, starY, radius * 2.4, radius * 2.4);
    holder.setScale(1, 0.42, 1);
    const ring = this.host.addChildPlainNode(holder, 'Ring', 0, 0, radius * 2.4, radius * 2.4);
    // 2026-10-24 实录:0.2 格的星星在手机上只有十来个像素,看不出来;放大到 0.36 格
    const size = unit * 0.36;
    for (let i = 0; i < 3; i += 1) {
      const angle = (Math.PI * 2 * i) / 3;
      const star = this.host.addChildPlainNode(ring, `Star_${i}`, Math.cos(angle) * radius, Math.sin(angle) * radius, size, size);
      this.mountSprite(star, 'Img', 'ui/hero/ai/star_filled/spriteFrame', 0, 0, size, size);
      star.setScale(1, 1 / 0.42, 1);
    }
    tween(ring).repeatForever(tween().by(0.9, { angle: -360 })).start();
    // 星星自身也要跟着反转,保持正立
    ring.children.forEach((star) => tween(star).repeatForever(tween().by(0.9, { angle: 360 })).start());
  }

  /** 被动受击闪色(破甲红 / 溅射金 / 反伤白金):比普通受击红闪长一点,一眼看出是被动打的。 */
  private flashMonsterColor(monsterId: number, color: Color, ms: number): void {
    const view = this.monsterViews.get(monsterId);
    if (!view || !view.skeleton || !view.skeleton.isValid || view.lastAnimKey === 'dead' || view.lastAnimKey === 'escaped') {
      return;
    }
    view.hitFlashUntil = Date.now() + ms;
    view.hitFlashColor = color;
    view.skeleton.color = color;
    setTimeout(() => {
      if (view.hitFlashUntil <= Date.now()) {
        view.hitFlashColor = undefined;
      }
    }, ms + 30);
  }

  /** 吸血:一颗血珠从怪身上飞回水晶(0.45s),到了水晶亮小圣环。 */
  private spawnLifestealOrb(fromX: number, fromY: number): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const center = this.crystalFxCenter();
    const size = this.unitSize() * 0.22;
    const orb = this.host.addChildPlainNode(field, 'GuardLifestealOrb', fromX, fromY, size, size);
    const g = orb.addComponent(Graphics);
    g.fillColor = rgba(255, 70, 70, 120);
    g.circle(0, 0, size * 0.5);
    g.fill();
    g.fillColor = rgba(255, 150, 150, 255);
    g.circle(0, 0, size * 0.28);
    g.fill();
    const midX = (fromX + center.x) / 2;
    const midY = Math.max(fromY, center.y) + this.unitSize() * 0.9;
    const t = { k: 0 };
    tween(t)
      .to(0.45, { k: 1 }, {
        easing: 'sineIn',
        onUpdate: () => {
          if (!orb.isValid) {
            return;
          }
          const k = t.k;
          const x = (1 - k) * (1 - k) * fromX + 2 * (1 - k) * k * midX + k * k * center.x;
          const y = (1 - k) * (1 - k) * fromY + 2 * (1 - k) * k * midY + k * k * center.y;
          orb.setPosition(x, y, 0);
        },
      })
      .call(() => {
        if (orb.isValid) {
          orb.destroy();
        }
        this.spawnSpineBurstFx(GUARD_SUPPORT_FX.crystalHealSmall, center.x, center.y - this.unitSize() * 0.1, 0.8, 800, true);
      })
      .start();
  }

  /** 升星被动触发表现(docs/41 §6):受影响的怪身上播对应特效 + 短字;同类型 180ms 内只播一次,防刷屏。 */
  private readonly passiveFxAt: Record<string, number> = {};
  private readonly passiveLabelAt: Record<string, number> = {};
  private playPassiveProcFx(event: GuardEvent): void {
    const type = event.passive ?? '';
    const now = Date.now();
    if (now - (this.passiveFxAt[type] ?? 0) < 180) {
      return;
    }
    this.passiveFxAt[type] = now;
    if (type === 'lifesteal') {
      const center = this.crystalFxCenter();
      const source = this.monsterViews.get((event.monsterIds ?? [])[0] ?? -1);
      if (source && source.node.isValid) {
        this.flashMonsterColor((event.monsterIds ?? [])[0], GUARD_PASSIVE_LIFESTEAL_FLASH, 160);
        this.spawnLifestealOrb(source.node.position.x, source.node.position.y + this.unitSize() * 0.3);
      } else {
        this.spawnSpineBurstFx(GUARD_SUPPORT_FX.crystalHealSmall, center.x, center.y - this.unitSize() * 0.1, 0.8, 800, true);
      }
      if (now - (this.passiveLabelAt.lifesteal ?? 0) >= 800) {
        this.passiveLabelAt.lifesteal = now;
        this.spawnFloater(center.x, center.y + this.unitSize() * 0.45, `吸血 +${this.formatDamageValue(event.amount ?? 0)}`, rgba(255, 140, 140), 18);
      }
      return;
    }
    const spec = (GUARD_PASSIVE_FX as Record<string, { effect: string; animation: string; size: number }>)[type] ?? null;
    const label: Record<string, { text: string; color: Color }> = {
      freeze: { text: '冻结', color: rgba(160, 220, 255) },
      stun: { text: '眩晕', color: rgba(255, 226, 120) },
      truePierce: { text: '破甲', color: rgba(255, 130, 110) },
      reflect: { text: '反伤', color: rgba(255, 220, 160) },
    };
    (event.monsterIds ?? []).slice(0, 3).forEach((monsterId, index) => {
      const view = this.monsterViews.get(monsterId);
      if (!view || !view.node.isValid) {
        return;
      }
      const x = view.node.position.x;
      const y = view.node.position.y;
      // 身体反应:破甲红闪 / 溅射金闪 / 反伤白金闪(冻结 / 眩晕走持续状态表现:定格 + 冰蓝 / 放慢 + 头顶星星)
      const bodyFlash = type === 'truePierce' ? GUARD_PASSIVE_PIERCE_FLASH : type === 'splash' ? GUARD_PASSIVE_SPLASH_FLASH : type === 'reflect' ? GUARD_PASSIVE_REFLECT_FLASH : null;
      if (bodyFlash) {
        this.flashMonsterColor(monsterId, bodyFlash, 220);
      }
      // 被动触发已按类型 180ms 节流,不吃普攻爆点的同屏名额(激战时名额被普攻占满,被动特效会被整段丢掉)
      if (!this.spawnSpineBurstFx(spec, x, y, 1, 550, true)) {
        // 还没就绪:当场补预热(下一次就有骨骼特效),这一次先闪光
        if (spec) {
          this.prewarmAttackSpineFx(spec);
        }
        this.spawnImpactFlash(x, y, label[type]?.color ?? rgba(255, 220, 160));
      }
      // 溅射伤害已并入 heroAttack 的 hits(随普攻飘字);反伤不在普攻里,单独飘
      if (type === 'reflect') {
        this.queueDamage(monsterId, event.amount ?? 0, false, x + ((index * 31) % 30) - 15, y);
      }
      // 提示字同类型 0.8 秒内只出一次(特效照播):多只怪 / 多名英雄同时触发时不再满屏重复
      if (index === 0 && label[type] && now - (this.passiveLabelAt[type] ?? 0) >= 800) {
        this.passiveLabelAt[type] = now;
        // 同一只怪同时触发几种被动时字会叠在一起:按类型错开高度 / 左右
        const slot: Record<string, [number, number]> = { freeze: [0.62, -0.42], stun: [0.92, 0.38], truePierce: [0.4, 0.42], reflect: [0.78, -0.1] };
        const [dy, dx] = slot[type] ?? [0.6, 0];
        this.spawnFloater(x + this.unitSize() * dx, y + this.unitSize() * dy, label[type].text, label[type].color, 18);
      }
    });
  }

  private spawnSpineBurstFx(hitSpec: { effect: string; animation: string; size: number } | null, x: number, y: number, scale: number, holdMs = 500, force = false): boolean {
    const field = this.fieldNode;
    if (!field || !hitSpec) {
      return false;
    }
    const ready = this.attackSpineFxReady.get(hitSpec.effect);
    if (!ready) {
      this.prewarmAttackSpineFx(hitSpec);
      return false;
    }
    if (!force && this.attackHitFxLive >= graphicsCaps().spineHitFx) {
      return false;
    }
    const fit = (this.unitSize() * hitSpec.size * scale) / Math.max(ready.w, ready.h);
    // 命中爆点复用池(2026-10-10 长帧归因:每次命中 new 一个骨骼实例再销毁,占长帧 2.6s/100s):同一特效的节点用完隐藏回池,下次只重放动画
    const pool = this.hitFxPool.get(hitSpec.effect) ?? [];
    this.hitFxPool.set(hitSpec.effect, pool);
    let pooled = pool.pop() ?? null;
    while (pooled && (!pooled.isValid || pooled.parent !== field)) {
      pooled = pool.pop() ?? null;
    }
    let skeleton = pooled?.getComponent(sp.Skeleton) ?? null;
    if (!pooled || !skeleton) {
      pooled = this.host.addChildPlainNode(field, 'GuardAttackHitFx', 0, 0, 10, 10);
      skeleton = pooled.addComponent(sp.Skeleton);
      LobbyGuardBattleRenderer.useSharedFxCache(skeleton);
      // 池按特效分,建节点时按图集定一次预乘(眩晕雷柱 v2_s576_022 去黑残影后是预乘图集)
      skeleton.premultipliedAlpha = battleFxPremultiplied(hitSpec.effect);
      skeleton.skeletonData = ready.data;
    }
    const node = pooled;
    node.active = true;
    node.setPosition(x - ready.cx * fit, y - ready.cy * fit, 0);
    node.setSiblingIndex(field.children.length - 1);
    node.setScale(fit, fit, 1);
    let duration = 0.4;
    try {
      duration = Math.max(0.12, skeleton.findAnimation(ready.animation)?.duration ?? 0.4);
      skeleton.timeScale = Math.max(1, duration / (holdMs / 1000));
      skeleton.setAnimation(0, ready.animation, false);
    } catch (error) {
      void error;
    }
    this.attackHitFxLive += 1;
    setTimeout(() => {
      this.attackHitFxLive = Math.max(0, this.attackHitFxLive - 1);
      if (!node.isValid) {
        return;
      }
      if (pool.length < 12) {
        node.active = false;
        pool.push(node);
      } else {
        node.destroy();
      }
    }, Math.min(holdMs, duration * 1000) + 30);
    return true;
  }

  /**
   * 挂到任意父节点的骨骼特效(宝箱光环 / 开箱爆发):按目标像素等比缩放、按实测包围盒居中,不占场上命中特效配额;
   * loop=true 随父节点销毁,否则 holdMs 后自毁。未就绪时补预热并返回 false(调用方静默跳过,贴图层已足够)。
   */
  private spawnOverlaySpineFx(parent: Node, spec: { effect: string; animation: string; size: number; squashY?: number }, x: number, y: number, sizePx: number, holdMs: number, loop: boolean): boolean {
    if (!parent.isValid) {
      return false;
    }
    const ready = this.attackSpineFxReady.get(spec.effect);
    if (!ready) {
      this.prewarmAttackSpineFx(spec);
      return false;
    }
    const fit = sizePx / Math.max(ready.w, ready.h);
    const squash = spec.squashY ?? 1;
    const node = this.host.addChildPlainNode(parent, 'GuardOverlaySpineFx', x - ready.cx * fit, y - ready.cy * fit * squash, 10, 10);
    node.setScale(fit, fit * squash, 1);
    const skeleton = node.addComponent(sp.Skeleton);
    LobbyGuardBattleRenderer.useSharedFxCache(skeleton);
    skeleton.premultipliedAlpha = battleFxPremultiplied(spec.effect);
    skeleton.skeletonData = ready.data;
    let duration = 0.6;
    try {
      duration = Math.max(0.12, skeleton.findAnimation(ready.animation)?.duration ?? 0.6);
      if (!loop) {
        skeleton.timeScale = Math.max(0.5, duration / (Math.max(120, holdMs) / 1000));
      }
      skeleton.setAnimation(0, ready.animation, loop);
    } catch (error) {
      void error;
    }
    if (!loop) {
      setTimeout(() => {
        if (node.isValid) {
          node.destroy();
        }
      }, holdMs + 60);
    }
    return true;
  }

  /** 命中爆闪:小十字星芒 0.18s。 */
  private spawnImpactFlash(x: number, y: number, color: Color): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardImpact', x, y, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    this.mountBakedSprite(node, impactFrame(color), 0, 0, 48, 48);
    const opacity = node.addComponent(UIOpacity);
    tween(node).to(0.18, { scale: new Vec3(1.7, 1.7, 1) }).start();
    tween(opacity).to(0.2, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 格位爆闪(召唤/合成/击杀通用):扩散金环+星芒,big=合成/超阶加倍。 */
  private spawnCellBurst(x: number, y: number, color: Color, big: boolean): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardCellBurst', x, y, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const burstSize = cellBurstSize(big);
    this.mountBakedSprite(node, cellBurstFrame(color, big), 0, 0, burstSize, burstSize);
    const opacity = node.addComponent(UIOpacity);
    tween(node).to(big ? 0.34 : 0.26, { scale: new Vec3(big ? 2.0 : 1.6, big ? 2.0 : 1.6, 1) }, { easing: 'quadOut' }).start();
    tween(opacity).to(big ? 0.36 : 0.28, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 出手金色爆闪(素材版 cast_flash,2026-08-28 用户验收:程序画的圆圈不好看)。 */
  private spawnCastFlash(x: number, y: number, sizePx: number): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const node = this.host.addChildPlainNode(field, 'GuardCastFlash', x, y, sizePx, sizePx);
    node.setSiblingIndex(field.children.length - 1);
    this.mountSprite(node, 'Img', 'ui/guard/cast_flash/spriteFrame', 0, 0, sizePx, sizePx);
    const opacity = node.addComponent(UIOpacity);
    node.setScale(0.55, 0.55, 1);
    tween(node).to(0.22, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' }).start();
    tween(opacity).delay(0.12).to(0.28, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 施放者亮相:英雄脚下金色爆闪+身形弹跳,一眼看清技能是谁放的(2026-08-27 用户验收)。 */
  private highlightCaster(cell: number, label: string, ult = false): void {
    const center = this.cellCenter(cell);
    const u = this.unitSize();
    this.spawnCastFlash(center.x, center.y - u * 0.24, u * (ult ? 2.0 : 1.2));
    const hero = this.sim?.heroes.find((entry) => entry.cell === cell);
    const view = hero ? this.heroViews.get(hero.unitId) : null;
    if (view && view.node.isValid) {
      if (ult) {
        tween(view.node).to(0.08, { scale: new Vec3(1.22, 1.22, 1) }).to(0.2, { scale: Vec3.ONE }).start();
      } else {
        tween(view.node).to(0.1, { scale: new Vec3(1.12, 1.12, 1) }).to(0.14, { scale: Vec3.ONE }).start();
      }
    }
    if (!label) {
      return;
    }
    if (!ult) {
      this.spawnFloater(center.x, center.y + u * 0.95, label, rgba(255, 226, 130), 18);
      return;
    }
    // 大招名牌(2026-10-01):固定在施法者头顶的 26 号金字,不跟普通飘字轮转抖动;同格新大招顶掉旧名牌。
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    const plateName = `GuardUltName_${cell}`;
    field.getChildByName(plateName)?.destroy();
    const w = this.layoutWidth;
    const h = this.layoutHeight;
    const px = Math.max(-0.5 * w + 1.7 * u, Math.min(0.5 * w - 1.7 * u, center.x));
    const py = Math.min(center.y + u * 1.1, GUARD_FX_SAFE.top * h - 24);
    const plate = this.host.addChildLabel(field, plateName, label, px, py, 26, rgba(255, 214, 92), new Size(u * 3.4, 34));
    plate.isBold = true;
    plate.enableOutline = true;
    plate.outlineColor = rgba(90, 24, 0, 255);
    plate.outlineWidth = 3;
    plate.overflow = Label.Overflow.SHRINK;
    plate.node.setSiblingIndex(field.children.length - 1);
    plate.node.setScale(1.5, 1.5, 1);
    tween(plate.node).to(0.14, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    tween(plate.node).by(1.1, { position: new Vec3(0, 24, 0) }).start();
    const opacity = plate.node.addComponent(UIOpacity);
    tween(opacity).delay(0.8).to(0.3, { opacity: 0 }).call(() => {
      if (plate.node.isValid) {
        plate.node.destroy();
      }
    }).start();
  }

  /** 近战刀光:目标处双弧斩闪 0.16s。 */
  /** 近战专属斩击/撞击贴图(2026-09-12):落在目标身上,0.14s 弹开 + 0.24s 淡出,角度按飘字轮转轻微错开。 */
  private spawnStrikeFx(spec: BattleAttackFxSpec, x: number, y: number, scale = 1): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    // 巨型词条:命中爆开的斩击同步放大(此前只放大了 0.6 倍的飞行体,近战几乎看不出)。
    const widthPx = this.unitSize() * spec.size * scale;
    const heightPx = widthPx * spec.aspect;
    const node = this.host.addChildPlainNode(field, 'GuardStrikeFx', x, y, widthPx, heightPx);
    node.setSiblingIndex(field.children.length - 1);
    node.angle = ((this.floaterCycle % 3) - 1) * 14;
    this.mountSprite(node, 'Img', resolveAttackFxSpritePath(spec), 0, 0, widthPx, heightPx);
    const opacity = node.addComponent(UIOpacity);
    node.setScale(0.55, 0.55, 1);
    tween(node).to(0.14, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' }).start();
    tween(opacity).delay(0.1).to(0.24, { opacity: 0 }).call(() => { if (node.isValid) { node.destroy(); } }).start();
  }

  /** 开局预热本阵容全部普攻贴图:首发弹道在飞行 0.4s 内贴图未到会"飞空"(实测首载 1.6s / 二载 6ms,2026-09-12)。 */
  private prewarmAttackFx(pool: GuardPoolHero[]): void {
    // 手机全屏弹层的实景背景 / 标题牌:开局先读,弹层打开时同步可用
    for (const path of ['ui/battle/ai/battle_bg_cathedral/spriteFrame', 'ui/common/ai/title_banner_new/spriteFrame']) {
      resources.load(path, SpriteFrame, () => undefined);
    }
    const seen = new Set<string>();
    for (const entry of pool) {
      const ally = this.snapshot?.allies[entry.sourceIndex] ?? null;
      const spec = resolveHeroAttackFx(entry.heroCode, ally?.heroClass ?? null, entry.role === 'melee');
      if (seen.has(spec.sprite)) {
        continue;
      }
      seen.add(spec.sprite);
      resources.load(resolveAttackFxSpritePath(spec), SpriteFrame, () => { /* 仅预热缓存 */ });
    }
    for (const entry of pool) {
      const spineSpec = resolveHeroAttackSpineFx(entry.heroCode);
      if (spineSpec) {
        this.prewarmAttackSpineFx(spineSpec);
      }
      const perkFx = resolveGuardPerkProcFx(resolveGuardHeroPerkProfile(entry.heroCode, entry.role).purple?.suffix);
      if (perkFx) {
        this.prewarmAttackSpineFx(perkFx);
      }
    }
    // 升星被动触发特效(docs/41 §6):5 套小特效都与词条特效同 effect 键,开局统一预热(2026-10-24 用户「特效未体现在受击怪物身上」:
    // 原先只按已解锁被动预热,一旦漏热触发时 spawnSpineBurstFx 直接返回 false 只剩闪光)
    Object.values(GUARD_PASSIVE_FX).forEach((spec) => this.prewarmAttackSpineFx(spec));
    // 辅助英雄在池子里就预热"圣辉涌泉"三件套(光罩 / 水晶大回血 / 周期小回血),首次施放不缺帧。
    if (pool.some((entry) => entry.role === 'support')) {
      this.prewarmAttackSpineFx(GUARD_SUPPORT_FX.allyShield);
      this.prewarmAttackSpineFx(GUARD_SUPPORT_FX.crystalHealBig);
      this.prewarmAttackSpineFx(GUARD_SUPPORT_FX.crystalHealSmall);
    }
    // 集火标记特效(脚下电光环 + 星芒冲击环):第一次点怪就要在
    this.prewarmAttackSpineFx(GUARD_MARK_FX.ring);
    this.prewarmAttackSpineFx(GUARD_MARK_FX.burst);
    // BOSS 蓄力法阵 / 灭世轰击 / 技能弹道与爆点(车轮战开局 6s 就上 BOSS,开局统一预热)。
    for (const spec of Object.values(GUARD_BOSS_FX)) {
      this.prewarmAttackSpineFx(spec);
    }
    // 水晶法术(六件全预热,体量小;首放不缺帧)/ 号角爆发 / 宝箱光环与落地闪(docs/29 v3)。
    for (const spec of Object.values(GUARD_SPELL_FX)) {
      this.prewarmAttackSpineFx(spec);
    }
    this.prewarmAttackSpineFx(GUARD_WARHORN_BURST_FX);
    for (const spec of Object.values(GUARD_CHEST_FX)) {
      this.prewarmAttackSpineFx(spec);
    }
    // 战技 / 专属大招骨骼数据按阵容池预热(共享缓存,首放不等加载)。
    const skillSeen = new Set<string>();
    for (const entry of pool) {
      const ally = this.snapshot?.allies[entry.sourceIndex] ?? null;
      for (const spec of [resolveHeroGuardSkillEffect(entry.heroCode, entry.role), resolveHeroUltEffect(entry.heroCode, ally?.heroClass ?? null)]) {
        if (!skillSeen.has(spec.effect)) {
          skillSeen.add(spec.effect);
          loadSharedSpineData(resolveBattleSkillEffectResource(spec), null, 'GuardSkillFx', () => { /* 仅预热缓存 */ });
        }
      }
    }
    // 远程怪三种皮肤的弹道(shooter 从第 3 波起才出,开局预热来得及)。
    for (const spec of guardMonsterProjectileFxSpecs()) {
      this.prewarmAttackSpineFx(spec);
    }
    // 宝箱 / 开箱轮盘(2026-09-27):光环与爆发骨骼 + 全部贴图,首箱不缺帧(精英 8 波前不掉,预热来得及)。
    for (const spec of Object.values(GUARD_CHEST_FX)) {
      this.prewarmAttackSpineFx(spec);
    }
    for (const path of GUARD_CHEST_SPRITE_PRELOAD) {
      resources.load(path, SpriteFrame, () => { /* 仅预热缓存 */ });
    }
  }

  /** 每种怪本局皮肤数:手机 1(显存),电脑 3(全部)。加载门与建场都从这里取,保证两边抽到同一份表。 */
  static monsterVariety(): number {
    return sys.isMobile ? 1 : 3;
  }

  /**
   * 开战加载门要预载的资源(2026-10-06 用户「初次进入战场卡死几秒」):本局抽到的怪物骨骼 + 阵容会用到的全部特效骨骼 + 贴图。
   * 与 prewarmAttackFx 同一份清单;加载门里逐个顺序读(每个让出一帧),进场时都已在内存,不再在第一帧里集中解码上传。
   */
  /**
   * 进场加载门的资源清单(2026-10-09 拆成两档,用户「加载要等几十秒」):
   * - spine / sprites:首波就会用到的——关卡背景、石台、首波怪物(第 1~2 波全是普通怪;车轮战 BOSS 开场即到)、
   *   上阵英雄的普攻贴图 / 普攻骨骼特效、辅助职业的护盾 / 回血特效。加载门只等这些。
   * - deferredSpine / deferredSprites:后面才会出现的——其余种类的怪(按出现先后排序)、战技 / 大招 / 词条特效、
   *   法术 / BOSS / 号角 / 宝箱 / 远程怪弹道。2026-10-10 真机剖析后两档都在加载门里读完(战斗中首次解析骨骼会卡几百毫秒),分档只用于排进度顺序。
   */
  collectBattlePrewarmResources(battleState: LobbyBattlePanelState): { spine: string[]; sprites: string[]; deferredSpine: string[]; deferredSprites: string[] } {
    const spine = new Set<string>();
    const deferredSpine = new Set<string>();
    // 进场第一眼就要的图排最前:关卡背景(加载页也拿它当底图)、石台格子、标题横幅
    const layer = this.sceneBgLayer();
    if (layer?.masked) {
      // 高清背景的近景层要用遮罩着色器:加载门期间先读进来
      preloadSceneNearEffect();
    }
    const sprites = new Set<string>([
      this.resolveSceneBgPath(),
      // 分层背景的近景层 + 雾带(2026-11-10)
      ...(layer ? [`ui/battle/${layer.name}_${layer.masked ? 'mask' : 'near'}/spriteFrame`, 'ui/battle/battle_fog_strip/spriteFrame'] : []),
      // 伤害数字位图字(2026-11-11)
      BATTLE_NUMBER_FONT_FRAME_PATH,
      this.cellTilePath(false),
      this.cellTilePath(true),
      'ui/battle/ai/battle_bg_cathedral/spriteFrame',
      'ui/common/ai/title_banner_new/spriteFrame',
    ]);
    const deferredSprites = new Set<string>();
    const start = battleState.start;
    if (!start) {
      return { spine: [], sprites: [], deferredSpine: [], deferredSprites: [] };
    }
    const stageCode = (start.stageCode ?? '').toUpperCase();
    const rushMode = stageCode.startsWith('DAILY_') && stageCode.endsWith('_3');
    const seedText = `${start.serverSeed ?? ''}:${start.battleNo ?? ''}`;
    const codesByKind = guardPickMonsterSpineCodes(seedText, LobbyGuardBattleRenderer.monsterVariety(), guardApplyMonsterRoster(start.guardMonsters));
    type MonsterKind = keyof typeof codesByKind;
    // 首波会出现的怪进加载门;其余按波次出现先后排队后台读(快/坦克第 3 波起,精英第 4 波,飞行第 4 波起,远程第 6 波起,BOSS 末波)
    const firstWaveKinds: MonsterKind[] = rushMode ? ['normal', 'boss'] : ['normal'];
    const laterKinds: MonsterKind[] = (['fast', 'tank', 'elite', 'flying', 'shooter', 'boss'] as MonsterKind[]).filter((kind) => firstWaveKinds.indexOf(kind) < 0);
    firstWaveKinds.forEach((kind) => (codesByKind[kind] ?? []).forEach((code) => spine.add(guardMonsterSpineResource(code))));
    laterKinds.forEach((kind) => (codesByKind[kind] ?? []).forEach((code) => deferredSpine.add(guardMonsterSpineResource(code))));
    const heroes = this.host.currentLobbyHeroRosterState().heroes;
    const snapshot = resolveLobbyBattlePresentationSnapshot(battleState, heroes);
    const allies = snapshot.allies.filter((ally) => ally.power > 0 && !ally.unitKey.includes('empty')).slice(0, 4);
    const addFxTo = (target: Set<string>, spec: { effect: string; hit?: { effect: string } } | null | undefined): void => {
      if (!spec) {
        return;
      }
      target.add(resolveAttackSpineFxResource(spec));
      if (spec.hit) {
        target.add(resolveAttackSpineFxResource(spec.hit));
      }
    };
    allies.forEach((ally) => {
      const heroCode = (ally.heroCode ?? ally.unitKey).toUpperCase();
      const role = resolveGuardRole(ally.heroCode ?? ally.unitKey, ally.heroClass);
      sprites.add(resolveAttackFxSpritePath(resolveHeroAttackFx(heroCode, ally.heroClass ?? null, role === 'melee')));
      // 统计面板 / 词条卡头像:第一次打开面板时才上传显卡会顿一下,进场就读;2026-10-15 起有生成头像的读它
      const avatarPath = resolveHeroAvatarPath(ally.heroCode ?? ally.unitKey);
      const portrait = resolveC1812HeroResultPortraitPath(ally.spineAsset ?? ally.portraitAsset);
      if (avatarPath) {
        sprites.add(avatarPath);
      } else if (portrait) {
        sprites.add(portrait);
      } else {
        // 没有头像图的 SR/R:统计 / 词条卡头像从名册立绘裁头部(2026-10-11),立绘要进战斗预读,否则首开统计只能显示首字
        const cardArt = resolveHeroCardArtPath(ally.heroCode ?? ally.unitKey);
        if (cardArt) {
          deferredSprites.add(`${cardArt}/spriteFrame`);
        }
      }
      addFxTo(spine, resolveHeroAttackSpineFx(heroCode));
      if (role === 'support') {
        addFxTo(spine, GUARD_SUPPORT_FX.allyShield);
        addFxTo(spine, GUARD_SUPPORT_FX.crystalHealBig);
        addFxTo(spine, GUARD_SUPPORT_FX.crystalHealSmall);
      }
      // 战技 / 大招要 2★ 才有,词条特效要先强化:开场用不到,排在后台队列前段
      deferredSpine.add(resolveBattleSkillEffectResource(resolveHeroGuardSkillEffect(heroCode, role)));
      deferredSpine.add(resolveBattleSkillEffectResource(resolveHeroUltEffect(heroCode, ally.heroClass ?? null)));
      addFxTo(deferredSpine, resolveGuardPerkProcFx(resolveGuardHeroPerkProfile(heroCode, role).purple?.suffix));
    });
    Object.values(GUARD_BOSS_FX).forEach((spec) => addFxTo(rushMode ? spine : deferredSpine, spec));
    Object.values(GUARD_SPELL_FX).forEach((spec) => addFxTo(deferredSpine, spec));
    Object.values(GUARD_PASSIVE_FX).forEach((spec) => addFxTo(deferredSpine, spec));
    addFxTo(deferredSpine, GUARD_WARHORN_BURST_FX);
    Object.values(GUARD_CHEST_FX).forEach((spec) => addFxTo(deferredSpine, spec));
    guardMonsterProjectileFxSpecs().forEach((spec) => addFxTo(deferredSpine, spec));
    addFxTo(deferredSpine, GUARD_MARK_FX.ring);
    addFxTo(deferredSpine, GUARD_MARK_FX.burst);
    // 局内弹层(三选一 / 轮盘 / 设置 / 结算,2026-11-11 改 B 毛玻璃)用到的玻璃九宫格与图标:首弹时才读会先空一帧
    [GLASS_SLICES.panel, GLASS_SLICES.panelSel, GLASS_SLICES.pillPrimary, GLASS_SLICES.pillSecondary, GLASS_SLICES.pillGold, GLASS_SLICES.frame].forEach((item) => deferredSprites.add(item.path));
    [GLASS_ICON.accent, GLASS_ICON.close, GLASS_ICON.chevron].forEach((path) => deferredSprites.add(path));
    GUARD_CHEST_SPRITE_PRELOAD.forEach((path) => deferredSprites.add(path));
    return {
      spine: Array.from(spine),
      sprites: Array.from(sprites),
      deferredSpine: Array.from(deferredSpine).filter((path) => !spine.has(path)),
      deferredSprites: Array.from(deferredSprites).filter((path) => !sprites.has(path)),
    };
  }

  /** 预热一个普攻 Spine 飞行特效:加载共享骨骼数据 → 选动画 → 用临时骨骼实测包围盒(等比缩放与居中要用)→ 记入就绪表。 */
  private prewarmAttackSpineFx(spec: { effect: string; animation: string; size: number; hit?: { effect: string; animation: string; size: number } }): void {
    if (spec.hit) {
      this.prewarmAttackSpineFx(spec.hit);
    }
    if (this.attackSpineFxReady.has(spec.effect) || this.attackSpineFxPending.has(spec.effect)) {
      return;
    }
    this.attackSpineFxPending.add(spec.effect);
    loadSharedSpineData(resolveAttackSpineFxResource(spec), null, 'GuardAttackFx', (data) => {
      this.attackSpineFxPending.delete(spec.effect);
      if (!data || this.attackSpineFxReady.has(spec.effect)) {
        return;
      }
      try {
        const runtimeData = resolveBattleUnitSpineRuntimeData(data);
        const names = (runtimeData?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
        if (!runtimeData || names.length === 0) {
          return;
        }
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        const wanted = spec.animation.trim().toLowerCase();
        const animation = names.find((name) => name.toLowerCase() === wanted) ?? names[0];
        // 2026-10-16 安卓真机「第一次放法术是贴图、第二次才是特效」:开战预热早于建场,加载门已缓存数据时这里同步回调,
        // 战场节点还不存在,原先直接 return 且不重试。有实测包围盒的(法术 / 普攻 / BOSS 等绝大多数)不需要探针,直接登记就绪。
        const tableBounds = lookupBattleFxBounds(spec.effect, animation);
        if (tableBounds) {
          this.attackSpineFxReady.set(spec.effect, { spec, data, animation, w: tableBounds.w, h: tableBounds.h, cx: tableBounds.cx, cy: tableBounds.cy });
          return;
        }
        const field = this.fieldNode;
        if (!field || !field.isValid) {
          // 需要现场测量但战场还没建好:稍后重试(有上限,战斗已关闭则放弃)
          const tries = (this.attackSpineFxRetry.get(spec.effect) ?? 0) + 1;
          this.attackSpineFxRetry.set(spec.effect, tries);
          if (tries <= 20) {
            setTimeout(() => {
              if (this.sim) {
                this.prewarmAttackSpineFx(spec);
              }
            }, 100);
          }
          return;
        }
        const probe = this.host.addChildPlainNode(field, 'GuardAttackFxProbe', -99999, -99999, 10, 10);
        const skeleton = probe.addComponent(sp.Skeleton);
        skeleton.premultipliedAlpha = false;
        skeleton.skeletonData = data;
        // 先查实测包围盒表(技能类特效前后帧差异大,三帧抽样会量偏,2026-09-24 圣女法阵实测放大成满屏),没有再现量。
        const bounds = lookupBattleFxBounds(spec.effect, animation) ?? this.measureGuardFxExtent(skeleton, animation, `atk:${spec.effect}:${animation}`);
        probe.destroy();
        if (!bounds) {
          // 量不出来就不缓存失败结果,下次出手再试;本发走贴图弹道。
          this.guardFxBoundsCache.delete(`atk:${spec.effect}:${animation}`);
          return;
        }
        this.attackSpineFxReady.set(spec.effect, { spec, data, animation, w: bounds.w, h: bounds.h, cx: bounds.cx, cy: bounds.cy });
      } catch (error) {
        void error;
      }
    });
  }

  /** 普攻表现解析:heroCode → 职业 → 角色三级兜底(职业取自阵容快照)。 */
  private resolveHeroAttackFxSpec(hero: GuardHeroUnit): BattleAttackFxSpec {
    const pool = this.sim?.pool.find((entry) => entry.heroCode === hero.heroCode);
    const ally = this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null;
    return resolveHeroAttackFx(hero.heroCode, ally?.heroClass ?? null, hero.role === 'melee');
  }

  private resolveHeroAttackSfxKey(hero: GuardHeroUnit): string {
    const pool = this.sim?.pool.find((entry) => entry.heroCode === hero.heroCode);
    const ally = this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null;
    return resolveHeroAttackSfxKey(hero.heroCode, ally?.heroClass ?? null, hero.role === 'melee');
  }

  /** 受击红闪(spine 染色 90ms,syncMonsters 每帧恢复)。 */
  private flashMonster(monsterId: number): void {
    const view = this.monsterViews.get(monsterId);
    if (view) {
      view.hitFlashUntil = Date.now() + 90;
      // 弹体改为每帧推进后命中不再与 tick 对齐:红闪当场染上,下一次 tick 的 syncMonsters 负责到期复原
      if (view.skeleton && view.skeleton.isValid && view.lastAnimKey !== 'dead' && view.lastAnimKey !== 'escaped') {
        view.skeleton.color = GUARD_HIT_FLASH_COLOR;
      }
    }
  }

  /** 飘字槽位轮转:连续飘字横向 3 槽×纵向 2 层错开,不再叠成一团(2026-08-26 用户验收)。 */
  private floaterCycle = 0;

  /**
   * 飘字是不是纯数字的伤害 / 回血,是的话用哪套位图字:
   * 「-123」「123」= 伤害——红色系是我方掉血(保留负号),暖金 / 橙 / 紫是重击或大招,其余是普通命中;
   * 「+123」只有绿色系算回血,别的颜色(击杀金币等)不动。带中文或别的符号的一律不是。
   */
  private static numericFloater(text: string, color: Color): { style: BattleNumberStyle; text: string } | null {
    if (!/^[+-]?\d[\d.]*(K|M|B|T|Qa|Qi)?$/.test(text)) {
      return null;
    }
    const { r, g, b } = color;
    if (text.charAt(0) === '+') {
      return g >= 225 && r <= 190 ? { style: 'heal', text } : null;
    }
    const digits = text.charAt(0) === '-' ? text.slice(1) : text;
    if (r >= 215 && g <= 150 && b <= 150) {
      return { style: 'hurt', text: `-${digits}` };
    }
    const warm = r >= 235 && g >= 140 && g <= 215 && b <= 140;
    const purple = b >= 230 && r >= 190 && g <= 190;
    return { style: warm || purple ? 'crit' : 'normal', text: digits };
  }

  private spawnFloater(x: number, y: number, text: string, color: Color, fontSize = 16, throttled = false): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    // 只有高频的(击杀 +金币)受每 tick 上限约束;玩法提示 / 法术结果 / 玩家操作反馈一律照出
    if (throttled) {
      if (this.floatersThisStep >= graphicsCaps().floatersPerTick * 2) {
        return;
      }
      this.floatersThisStep += 1;
    }
    this.floaterCycle = (this.floaterCycle + 1) % 6;
    const ox = ((this.floaterCycle % 3) - 1) * 38;
    const oy = Math.floor(this.floaterCycle / 3) * 26;
    const label = this.host.addChildLabel(field, 'GuardFloater', text, x + ox, y + oy, fontSize, color, new Size(190, fontSize + 8));
    // 飘字按文字自适应尺寸、不换行(2026-10-02 用户:「金矿爆发 Lv.N +N 金币」超出 190 宽换到第二行,被裁成半截)
    label.enableWrapText = false;
    label.overflow = Label.Overflow.NONE;
    // 纯数字的伤害 / 回血飘字(水晶掉血、掠夺里双方的伤害、治疗)和怪物头上的伤害数字用同一副位图字(2026-11-11);带文字的照旧
    const numeric = LobbyGuardBattleRenderer.numericFloater(text, color);
    if (numeric && applyBattleNumber(label, numeric.style, numeric.text, fontSize * 1.05)) {
      label.color = rgba(255, 255, 255, 255);
    } else {
      label.enableOutline = true;
      label.outlineColor = rgba(20, 12, 8, 255);
      label.outlineWidth = fontSize >= 20 ? 3 : 2;
      label.isBold = true;
    }
    label.node.setSiblingIndex(field.children.length - 1);
    const opacity = label.node.addComponent(UIOpacity);
    opacity.opacity = 240;
    tween(label.node).by(0.8, { position: new Vec3(0, 34, 0) }).start();
    tween(opacity).delay(0.4).to(0.35, { opacity: 0 }).call(() => {
      if (label.node.isValid) {
        label.node.destroy();
      }
    }).start();
  }

  // ── 英雄视图 ──
  private syncHeroes(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const liveIds = new Set(sim.heroes.map((hero) => hero.unitId));
    for (const [unitId, view] of [...Array.from(this.heroViews)]) {
      if (!liveIds.has(unitId)) {
        if (view.node.isValid) {
          view.node.destroy();
        }
        this.destroyUnitBars(view);
        this.heroViews.delete(unitId);
      }
    }
    for (const hero of sim.heroes) {
      let view = this.heroViews.get(hero.unitId);
      if (!view) {
        view = this.createHeroView(hero);
        this.heroViews.set(hero.unitId, view);
      }
      if (!view.node.isValid) {
        continue;
      }
      if (this.dragFromCell !== hero.cell) {
        const center = this.cellCenter(hero.cell);
        view.node.setPosition(center.x, center.y, 0);
        if (sim.raidClear && !hero.dead) {
          this.syncClearMonsterAnim(sim, hero, view, center.x);
        }
      }
      const starLabel = view.node.getChildByName('GuardHeroStar')?.getComponent(Label);
      if (starLabel) {
        starLabel.string = '★'.repeat(hero.star);
      }
      if (this.rangeShownUnitId === hero.unitId) {
        // 只在换格时整层重建;冷却/攻击文字逐帧轻量刷新(整层每 tick 重建会闪)
        if (this.rangeShownDrawnCell !== hero.cell) {
          this.drawRangeIndicator(hero);
        } else {
          this.refreshHeroInfoLive(hero);
        }
      }
      // 选中态合成指引(2026-08-28 用户拍板):可合成同名同星高亮+绿圈脉动,其余变暗
      const heroOpacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
      if (this.rangeShownUnitId !== null) {
        const selectedHero = sim.heroes.find((entry) => entry.unitId === this.rangeShownUnitId);
        const mergeable = !!selectedHero && selectedHero.unitId !== hero.unitId
          && selectedHero.heroCode === hero.heroCode && selectedHero.star === hero.star && hero.star < GUARD_MAX_STAR;
        heroOpacity.opacity = hero.unitId === this.rangeShownUnitId || mergeable ? 255 : 120;
        let mergeHint = view.node.getChildByName('GuardMergeHint');
        if (mergeable) {
          if (!mergeHint) {
            mergeHint = this.host.addChildPlainNode(view.node, 'GuardMergeHint', 0, -this.unitSize() * 0.42, 10, 10);
            const hintG = mergeHint.addComponent(Graphics);
            hintG.strokeColor = rgba(120, 255, 130, 235);
            hintG.lineWidth = 4;
            hintG.ellipse(0, 0, this.unitSize() * 0.42, this.unitSize() * 0.12);
            hintG.stroke();
            tween(mergeHint).repeatForever(tween().to(0.5, { scale: new Vec3(1.15, 1.15, 1) }).to(0.5, { scale: Vec3.ONE })).start();
          }
        } else if (mergeHint) {
          mergeHint.destroy();
        }
      } else {
        heroOpacity.opacity = 255;
        view.node.getChildByName('GuardMergeHint')?.destroy();
      }
      const attackLabel = view.node.getChildByName('GuardHeroAtk')?.getComponent(Label);
      if (attackLabel) {
        attackLabel.string = `${guardHeroAttackValue(sim, hero)}`;
      }
      // 主动技能冷却条(2★ 起):橙=充能中,亮蓝=就绪,金色回缩=等玩家点击手动释放(docs/37 B)
      const skillPending = !sim.skillAutoImmediate && guardHeroSkillPending(sim, hero);
      const cdUnlocked = guardHeroSkillUnlocked(sim, hero);
      const cdW = this.unitSize() * 0.8;
      const cdReady = cdUnlocked ? Math.max(0, Math.min(1, 1 - (hero.skillReadyMs - sim.timeMs) / GUARD_HERO_SKILL[hero.role].cdMs)) : 0;
      const cdLeft = skillPending ? Math.max(0, Math.min(1, 1 - (sim.timeMs - (hero.skillPendingSinceMs ?? sim.timeMs)) / GUARD_SKILL_MANUAL_WINDOW_MS)) : 0;
      const cdKey = !cdUnlocked ? 'off' : skillPending ? `p${Math.round(cdW * cdLeft)}` : `${cdReady >= 1 ? 'r' : 'c'}${Math.round(cdW * cdReady)}`;
      if (view.cdDrawnKey !== cdKey) {
        view.cdDrawnKey = cdKey;
        // 冷却条画在共享条层(2026-10-09):橙=充能中,亮蓝=就绪,金色回缩=手动窗口(缩完自动释放)
        this.syncHeroCdBar(view, cdUnlocked, cdW, skillPending ? cdLeft : cdReady, skillPending ? rgba(255, 214, 92, 255) : cdReady >= 1 ? rgba(140, 230, 255, 245) : rgba(255, 196, 90, 225));
      }
      this.positionHeroBars(view);
      this.syncSkillReadyGlow(view.node, skillPending);
    }
    this.placeBarLayer();
  }

  // ── 条层:小怪血条 / 英雄冷却条(2026-10-09 手机绘制调用优化)──

  /** 条层节点(场地子节点;建场 / 重排布局后首次用到时建)。 */
  private ensureBarLayer(): Node | null {
    const field = this.fieldNode;
    if (!field || !field.isValid) {
      return null;
    }
    if (this.barLayer && this.barLayer.isValid && this.barLayer.parent === field) {
      return this.barLayer;
    }
    this.barLayer = this.host.addChildPlainNode(field, 'GuardBarLayer', 0, 0, this.layoutWidth, this.layoutHeight);
    return this.barLayer;
  }

  /** 条层排在最后一个单位节点(怪物 / 英雄)之后:条在所有单位之上、之后追加的特效 / 飘字之下。 */
  private placeBarLayer(): void {
    const field = this.fieldNode;
    const layer = this.barLayer;
    if (!field || !layer || !layer.isValid || layer.parent !== field) {
      return;
    }
    const children = field.children;
    let lastUnit = -1;
    let layerIndex = -1;
    for (let i = 0; i < children.length; i += 1) {
      const name = children[i].name;
      if (children[i] === layer) {
        layerIndex = i;
      } else if (name.startsWith('GuardMonster_') || name.startsWith('GuardHero_')) {
        lastUnit = i;
      }
    }
    if (layerIndex < lastUnit) {
      layer.setSiblingIndex(lastUnit);
    } else if (layerIndex > lastUnit + 1) {
      layer.setSiblingIndex(lastUnit + 1);
    }
  }

  /** 条层里的一根条:共享白贴图精灵(bar=纯色矩形,pill=圆角九宫格),颜色含透明度由 Sprite 染色;anchorX=0 时左边缘定位。 */
  private mountBarSprite(parent: Node, name: string, kind: 'bar' | 'pill', color: Color, anchorX: number, width: number, height: number): Node {
    const node = this.host.addChildPlainNode(parent, name, 0, 0, width, height);
    const frame = kind === 'pill' ? whitePillFrame() : whiteBarFrame();
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.type = kind === 'pill' ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    if (frame) {
      sprite.spriteFrame = frame;
    }
    sprite.color = color;
    const transform = node.getComponent(UITransform);
    transform?.setAnchorPoint(anchorX, 0.5);
    transform?.setContentSize(width, height);
    return node;
  }

  private syncHeroCdBar(view: GuardUnitView, unlocked: boolean, width: number, ratio: number, fillColor: Color): void {
    const layer = this.ensureBarLayer();
    if (!layer) {
      return;
    }
    if (!unlocked) {
      if (view.cdBg?.isValid) {
        view.cdBg.active = false;
      }
      if (view.cdFill?.isValid) {
        view.cdFill.active = false;
      }
      return;
    }
    if (!view.cdBg || !view.cdBg.isValid || !view.cdFill || !view.cdFill.isValid) {
      view.cdBg = this.mountBarSprite(layer, `${view.node.name}CdBg`, 'pill', rgba(10, 8, 8, 190), 0.5, width, 6);
      view.cdFill = this.mountBarSprite(layer, `${view.node.name}CdFill`, 'pill', fillColor, 0, width, 6);
    }
    view.cdBg.active = true;
    view.cdFill.active = true;
    view.cdBg.getComponent(UITransform)?.setContentSize(width, 6);
    view.cdFill.getComponent(UITransform)?.setContentSize(Math.max(8, width * ratio), 6);
    const fill = view.cdFill.getComponent(Sprite);
    if (fill && !fill.color.equals(fillColor)) {
      fill.color = fillColor;
    }
    this.positionHeroBars(view);
  }

  /** 冷却条跟着英雄节点走(拖拽中每帧跟),并随英雄一起压暗(选中其它英雄时)。 */
  private positionHeroBars(view: GuardUnitView): void {
    const bg = view.cdBg;
    const fill = view.cdFill;
    if (!bg || !bg.isValid || !fill || !fill.isValid || !bg.active) {
      return;
    }
    const position = view.node.position;
    const y = position.y - this.heroDisplaySize() * 0.7;
    const width = bg.getComponent(UITransform)?.width ?? 0;
    bg.setPosition(position.x, y, 0);
    fill.setPosition(position.x - width / 2, y, 0);
    const heroOpacity = view.node.getComponent(UIOpacity)?.opacity ?? 255;
    const bgOpacity = bg.getComponent(UIOpacity) ?? bg.addComponent(UIOpacity);
    const fillOpacity = fill.getComponent(UIOpacity) ?? fill.addComponent(UIOpacity);
    if (bgOpacity.opacity !== heroOpacity) {
      bgOpacity.opacity = heroOpacity;
      fillOpacity.opacity = heroOpacity;
    }
  }

  private followHeroBars(): void {
    for (const view of this.heroViews.values()) {
      if (view.cdBg && view.node.isValid) {
        this.positionHeroBars(view);
      }
    }
  }

  /** 小怪血条:hpKey = 可见长度像素(-1 = 满血不显示)。 */
  private syncMonsterHpBar(view: GuardUnitView, monster: GuardMonster, hpKey: number): void {
    const layer = this.ensureBarLayer();
    if (!layer) {
      return;
    }
    if (hpKey < 0) {
      if (view.hpBg?.isValid) {
        view.hpBg.active = false;
      }
      if (view.hpFill?.isValid) {
        view.hpFill.active = false;
      }
      return;
    }
    const width = view.hpBarW ?? 0;
    if (!view.hpBg || !view.hpBg.isValid || !view.hpFill || !view.hpFill.isValid) {
      view.hpBg = this.mountBarSprite(layer, `${view.node.name}HpBg`, 'bar', rgba(8, 8, 10, 210), 0.5, width, 6);
      view.hpFill = this.mountBarSprite(layer, `${view.node.name}HpFill`, 'bar', monster.kind === 'elite' ? rgba(255, 150, 60, 240) : rgba(224, 82, 64, 230), 0, width, 6);
    }
    view.hpBg.active = true;
    view.hpFill.active = true;
    view.hpFill.getComponent(UITransform)?.setContentSize(Math.max(1, hpKey), 6);
    this.positionMonsterBars(view, view.node.position.x, view.node.position.y);
  }

  private positionMonsterBars(view: GuardUnitView, x: number, y: number): void {
    const bg = view.hpBg;
    const fill = view.hpFill;
    if (!bg || !bg.isValid || !fill || !fill.isValid || !bg.active) {
      return;
    }
    const barY = y + (view.hpBarOffsetY ?? 0);
    bg.setPosition(x, barY, 0);
    fill.setPosition(x - (view.hpBarW ?? 0) / 2, barY, 0);
  }

  /** 单位离场 / 死亡:条层里属于它的条一起销毁。 */
  private destroyUnitBars(view: GuardUnitView): void {
    for (const key of ['hpBg', 'hpFill', 'cdBg', 'cdFill'] as const) {
      const node = view[key];
      if (node && node.isValid) {
        node.destroy();
      }
      view[key] = undefined;
    }
  }

  /**
   * 固定 / 数字类 HUD 标签走字符缓存:字形进共享字符图集,几十个标签合成少数几次绘制(2026-10-09 手机 Draw call 143~215 的大头之一)。
   * 引擎的字符缓存不支持 SHRINK 自适应,缩放中的标签保持原样。
   */
  private static hudCharCache(label: Label, shortText = false): void {
    if (label.overflow === Label.Overflow.SHRINK) {
      // 手机端字号抬到下限后统一设成 SHRINK;数字 / 星级这类短文本框足够宽,改成不裁切即可走字符缓存
      if (!shortText) {
        return;
      }
      label.overflow = Label.Overflow.NONE;
    }
    label.fontFamily = LobbyGuardBattleRenderer.damageFontFamily();
    label.cacheMode = Label.CacheMode.CHAR;
  }

  /** 持续区域(灼烧区/旋风)视图:横跨三车道的地面区域,旋风随时间旋转并跟随推进。 */
  private syncZones(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const live = new Set(sim.zones.map((zone: GuardZone) => zone.zoneId));
    for (const zoneId of Array.from(this.plainBurnZones.keys())) {
      if (!live.has(zoneId)) {
        this.plainBurnZones.delete(zoneId);
      }
    }
    for (const [zoneId, node] of [...Array.from(this.zoneViews)]) {
      if (!live.has(zoneId)) {
        if (node.isValid) {
          node.destroy();
        }
        this.zoneViews.delete(zoneId);
        this.zoneFlights.delete(zoneId);
      }
    }
    for (const zone of sim.zones) {
      let node = this.zoneViews.get(zone.zoneId);
      if (!node) {
        node = this.host.addChildPlainNode(field, `GuardZone_${zone.zoneId}`, this.xToPx(zone.x), this.walkwayY(), 10, 10);
        node.setSiblingIndex(1);
        node.addComponent(Graphics);
        this.zoneViews.set(zone.zoneId, node);
      }
      if (!node.isValid) {
        continue;
      }
      // 起手飞行:450ms 内从施放英雄位置抛物线飞到落点,弹大成型
      const tx = this.xToPx(zone.x);
      const ty = this.walkwayY();
      let px = tx;
      let py = ty;
      let flightScale = 1;
      const flight = this.zoneFlights.get(zone.zoneId);
      if (flight) {
        const t = (sim.timeMs - flight.startMs) / 450;
        if (t >= 1) {
          this.zoneFlights.delete(zone.zoneId);
        } else {
          const eased = 1 - (1 - t) * (1 - t);
          px = flight.fromX + (tx - flight.fromX) * eased;
          py = flight.fromY + (ty - flight.fromY) * eased + Math.sin(Math.max(0, t) * Math.PI) * this.layoutHeight * 0.06;
          flightScale = 0.25 + 0.75 * eased;
        }
      }
      node.setPosition(px, py, 0);
      const g = node.getComponent(Graphics);
      if (!g) {
        continue;
      }
      const radiusPx = Math.max(48, this.xToPx(Math.min(GUARD_SPAWN_X, zone.x + zone.radiusCells)) - this.xToPx(zone.x));
      g.clear();
      if (zone.kind === 'burn') {
        // 2026-09-12 用户反馈图 3:地面黄色火海椭圆不要——灼烧区由技能特效本体在落点循环播放到期(spawnGuardSkillFx zone 模式),
        // 区域节点只保留结算用途,不画任何东西。
        node.angle = 0;
        node.setScale(1, 1, 1);
        const retryAt = this.plainBurnZones.get(zone.zoneId);
        if (retryAt !== undefined && Date.now() >= retryAt) {
          // 特效名额满时没播出来的灼烧区:不画红圈(2026-10-12 用户反馈),等名额空出来补播施放者的战技循环特效
          this.plainBurnZones.set(zone.zoneId, Date.now() + GUARD_ZONE_FX_RETRY_MS);
          if (this.retryBurnZoneFx(sim, zone)) {
            this.plainBurnZones.delete(zone.zoneId);
          }
        }
      } else if (zone.kind === 'spellQuake' || zone.kind === 'spellThunder') {
        // 法术持续域(2026-10-11):视觉由法术特效本体循环到期承担(playSpellFx),区域节点只做结算,不画东西
        node.angle = 0;
        node.setScale(1, 1, 1);
      } else {
        // 旋风素材化(2026-09-02 用户拍板 image2 方向):透明漩涡贴图子节点自旋,父节点压扁成地面椭圆
        node.angle = 0;
        let spin = node.getChildByName('GuardZoneWindSpin');
        if (!spin) {
          const d0 = radiusPx * 2.1;
          spin = this.host.addChildPlainNode(node, 'GuardZoneWindSpin', 0, 0, d0, d0);
          this.mountSprite(spin, 'Img', 'ui/guard/fx_wind_zone/spriteFrame', 0, 0, d0, d0);
        }
        node.setScale(flightScale, 0.42 * flightScale, 1);
        const d = radiusPx * 2.1;
        spin.getComponent(UITransform)?.setContentSize(d, d);
        spin.getChildByName('Img')?.getComponent(UITransform)?.setContentSize(d, d);
        spin.angle = ((sim.timeMs / 1000) * 200) % 360;
      }
    }
  }

  private createHeroView(hero: GuardHeroUnit): GuardUnitView {
    const field = this.fieldNode;
    const size = this.heroDisplaySize();
    const center = this.cellCenter(hero.cell);
    const node = this.host.addChildPlainNode(field ?? this.host.node, `GuardHero_${hero.unitId}`, center.x, center.y, size, size);
    const pool = this.sim?.pool.find((entry) => entry.heroCode === hero.heroCode);
    const roleColor = GUARD_ROLE_COLOR[hero.role] ?? rgba(220, 220, 220);
    // 底座色环(职业色):烘焙的白色椭圆环精灵按职业色染色(2026-10-09:原先每个英雄一个 Graphics = 一次独立绘制)
    const ringFrame = whiteRingFrame(size * 0.34, size * 0.08, 2);
    if (ringFrame) {
      const ringSize = ringFrameSize(size * 0.34, size * 0.08, 2);
      const ring = this.host.addChildPlainNode(node, 'GuardHeroRing', 0, -size * 0.42, ringSize.w, ringSize.h);
      const ringSprite = ring.addComponent(Sprite);
      ringSprite.sizeMode = Sprite.SizeMode.CUSTOM;
      ringSprite.trim = false;
      ringSprite.spriteFrame = ringFrame;
      ringSprite.color = rgba(roleColor.r, roleColor.g, roleColor.b, 200);
      ring.getComponent(UITransform)?.setContentSize(ringSize.w, ringSize.h);
    } else {
      const g = node.addComponent(Graphics);
      g.strokeColor = rgba(roleColor.r, roleColor.g, roleColor.b, 200);
      g.lineWidth = 2;
      g.ellipse(0, -size * 0.42, size * 0.34, size * 0.08);
      g.stroke();
    }
    // 骨骼(异步),回退色块+名字
    const ally = this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null;
    const fallback = this.host.addChildPlainNode(node, 'GuardHeroFallback', 0, 0, size * 0.62, size * 0.8);
    const fg = fallback.addComponent(Graphics);
    fg.fillColor = rgba(roleColor.r, roleColor.g, roleColor.b, 130);
    fg.roundRect(-size * 0.31, -size * 0.4, size * 0.62, size * 0.8, 8);
    fg.fill();
    const pendingView: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '', deathAnim: '', hitFlashUntil: 0 };
    const monsterSpine = this.sim?.raidClear && ally?.spineAsset && ally.spineAsset.startsWith('spine/monster/') ? ally.spineAsset : null;
    if (monsterSpine) {
      // 野外清怪(docs/50):防守方是怪物——按怪物骨骼挂(自动挑皮肤 / 怪物体型校准 / 默认镜像朝左),不走英雄解析
      const dir = monsterSpine.split('/')[2] ?? '';
      const elite = (pool?.rarity ?? 'N') !== 'N';
      const targetH = size * (elite ? 1.5 : 0.95) * (GUARD_MONSTER_DB_SCALE[dir] ?? 1);
      pendingView.faceLeft = true;
      this.loadSpineInto(node, fallback, monsterSpine, size, true, pendingView, {
        calibratedScale: (rawBoundsHeight) => targetH / rawBoundsHeight,
        footY: -size * 0.42,
        enemyAnimNames: true,
      });
    } else {
      this.attachUnitSpine(node, fallback, ally, size, false, pendingView);
    }
    // 名字宽度钳到格距内+SHRINK(视频验收:相邻列名字连成乱串);定位词收进详情卡,不再挤标签
    const nameLabel = this.host.addChildLabel(node, 'GuardHeroName', pool?.displayName ?? hero.heroCode, 0, size * 0.6, 15, rgba(236, 224, 196), new Size(this.cellPitchPx() * 0.94, 20));
    nameLabel.overflow = Label.Overflow.SHRINK;
    const star = this.host.addChildLabel(node, 'GuardHeroStar', '★', 0, size * 0.46, 16, rgba(255, 220, 110), new Size(size * 1.4, 20));
    star.enableOutline = true;
    star.outlineColor = rgba(40, 24, 10, 255);
    star.outlineWidth = 2;
    LobbyGuardBattleRenderer.hudCharCache(star, true);
    const atkLabel = this.host.addChildLabel(node, 'GuardHeroAtk', '', 0, -size * 0.58, 14, rgba(214, 196, 156, 230), new Size(size * 1.2, 18));
    LobbyGuardBattleRenderer.hudCharCache(atkLabel, true);
    this.bindHeroDrag(node, hero.unitId);
    return pendingView;
  }

  /** 骨骼挂载(英雄用 snapshot ally 解析;怪物用 spine/monster/<code> 直连);失败保留回退色块。 */
  private attachUnitSpine(node: Node, fallback: Node, ally: BattlePresentationUnitSnapshot | null, size: number, mirror: boolean, view?: GuardUnitView): void {
    const resource = ally ? resolveBattleUnitSpineResource(ally) : null;
    if (!resource || !ally) {
      return;
    }
    // 英雄体型走主战斗统一公式(布阵补偿表):act 系 bounds 虚标(断刃佣兵缩成小人)由逐资源表校准。
    this.loadSpineInto(node, fallback, resource, size, mirror, view, { allyUnit: ally });
  }

  private loadSpineInto(
    node: Node,
    fallback: Node,
    resource: string,
    size: number,
    mirror: boolean,
    view?: GuardUnitView,
    opts?: {
      /** S196 怪物:体型按 标定视高/bounds高 算(bounds 虚标由 DB 校准表补偿,同旧战斗渲染公式),不走英雄的钳制路径。 */
      calibratedScale?: (rawBoundsHeight: number) => number;
      /** S196 素材原点=脚底中心:骨骼节点直接放地面线,不做 bounds 偏移补偿。 */
      footY?: number;
      /** 循环动画优先级(怪物行进优先 walk/run/move)。 */
      preferAnim?: RegExp;
      /** 怪物:动画名走稀有度映射(原始名单会命中 *_turn_/*_link_ 过渡段)。 */
      enemyAnimNames?: boolean;
      /** 英雄:走主战斗统一体型公式(资源补偿表,修 act 系 bounds 虚标导致的体型忽大忽小)。 */
      allyUnit?: BattlePresentationUnitSnapshot;
      /**
       * 小怪:骨骼动画走引擎的共享缓存(同一种怪的同一个动画只算一遍,所有实例共用算好的帧)。
       * 2026-10-05 手机卡顿优化:后期 40~90 只怪各自逐帧算骨骼是 CPU 最大头。BOSS / 英雄不用(要量头顶、要混合动作)。
       */
      sharedCache?: boolean;
    },
  ): void {
    const spineNode = this.host.addChildPlainNode(node, 'GuardUnitSpine', 0, opts?.footY ?? -size * 0.36, size, size * 1.1);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    if (opts?.sharedCache) {
      try {
        skeleton.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.SHARED_CACHE);
      } catch (error) {
        void error;
      }
    }
    // 兜底直载:共享缓存层的在途合并队列若丢回调(极端环境观测到过)会永久悬空——4s 未回来就绕过缓存直载一次。
    let delivered = false;
    const applyData = (data: sp.SkeletonData | null): void => {
      if (delivered) {
        return;
      }
      delivered = true;
      if (!node.isValid || !spineNode.isValid) {
        return;
      }
      if (!data) {
        return;
      }
      try {
        const runtimeData = resolveBattleUnitSpineRuntimeData(data);
        const rawNames = (runtimeData?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
        if (!runtimeData || rawNames.length === 0) {
          return;
        }
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        skeleton.skeletonData = data;
        // S196 怪物骨骼没有 default 皮肤,全部附件挂在具名皮肤里——不 setSkin 就一个附件都不画(怪物隐形根因,2026-08-25)。
        const skin = resolveBattleUnitSpineSkinName(data, runtimeData);
        if (skin) {
          LobbyGuardBattleRenderer.setSkinKeepCache(skeleton, skin);
        }
        let idle: string;
        let attack: string;
        if (opts?.enemyAnimNames) {
          const mapped = resolveBattleUnitSpineAnimationNames(data, this.toGuardEnemyUnit(resource));
          idle = mapped.move ?? mapped.idle ?? rawNames[0];
          attack = mapped.attack ?? idle;
        } else {
          idle = (opts?.preferAnim ? rawNames.find((name) => opts.preferAnim!.test(name)) : undefined)
            ?? rawNames.find((name) => /idle|stand|daiji|wait/i.test(name))
            ?? rawNames[0];
          attack = rawNames.find((name) => /atk|attack|gongji|skill|普攻/i.test(name) && !/hit|hurt|dead|die/i.test(name)) ?? idle;
        }
        let fit: number;
        if (opts?.allyUnit) {
          // 体型=共享公式(含 EXTRA 表:罗恩 1.55)× 守卫场微调表(罗恩再 ×1.2)
          fit = resolveBattleUnitSpineScale(runtimeData.width, runtimeData.height, size, size, this.layoutUiScale, false, opts.allyUnit)
            * (GUARD_HERO_SCALE_TWEAK_BY_ASSET[resolveBattleUnitSpinePrimaryAsset(opts.allyUnit) ?? ''] ?? 1);
          const pos = resolveBattleUnitSpineNodePosition(runtimeData, fit, size, opts.allyUnit, false);
          // 横向偏移钳制 ±12%(2026-09-02 二收:±30% 仍挡不住深渊魔女的 bounds 过冲)——立绘钉在卡位中心附近
          spineNode.setPosition(Math.max(-size * 0.12, Math.min(size * 0.12, pos.x)), pos.y, 0);
        } else if (opts?.calibratedScale) {
          fit = opts.calibratedScale(Math.max(1, Number(runtimeData.height) || 300));
        } else {
          const rawHeight = Math.min(1200, Math.max(140, Number(runtimeData.height) || 300));
          fit = (size * 1.05) / rawHeight;
        }
        spineNode.setScale(mirror ? -fit : fit, fit, 1);
        const track = skeleton.setAnimation(0, idle, true);
        // 共享缓存模式下 setAnimation 不返回轨道对象(返回 null 属正常),不能当失败
        if (!track && !(opts?.sharedCache && skeleton.isAnimationCached())) {
          // 动画起不来按失败处理:保留回退块,别销毁。
          return;
        }
        if (view) {
          view.skeleton = skeleton;
          view.idleAnim = idle;
          view.attackAnim = attack;
          view.moveAnim = rawNames.find((name) => /run|walk|move/i.test(name) && !/hit|hurt|dead|die/i.test(name)) ?? '';
          if (opts?.enemyAnimNames) {
            const mappedNames = resolveBattleUnitSpineAnimationNames(data, this.toGuardEnemyUnit(resource));
            view.deathAnim = mappedNames.death ?? '';
          }
          view.spineReady = true;
        }
        if (fallback.isValid) {
          fallback.destroy();
        }
      } catch (error) {
        console.warn('[GuardBattle] spine attach failed', resource, error);
      }
    };
    loadSharedSpineData(resource, null, 'GuardBattle', applyData);
    setTimeout(() => {
      if (!delivered && node.isValid) {
        resources.load(resource, sp.SkeletonData, (error: Error | null, data: sp.SkeletonData | null) => {
          if (!error && data) {
            applyData(data);
          }
        });
      }
    }, 4000);
  }

  /** 野外清怪(docs/50):怪物一直朝向进攻方;移动中播跑步,停下 / 出手后回待机。 */
  private syncClearMonsterAnim(sim: GuardBattleState, hero: GuardHeroUnit, view: GuardUnitView, heroX: number): void {
    const raider = sim.monsters.find((monster) => monster.player && !monster.dead);
    if (raider) {
      this.faceHeroToward(view, heroX, this.xToPx(raider.x));
    }
    const skeleton = view.skeleton;
    if (!view.spineReady || !skeleton || !skeleton.isValid || !view.moveAnim || (view.attackHoldUntil ?? 0) > Date.now()) {
      return;
    }
    const want = hero.moving ? 'clear-move' : 'clear-idle';
    if (view.lastAnimKey === want) {
      return;
    }
    view.lastAnimKey = want;
    skeleton.setAnimation(0, hero.moving ? view.moveAnim : view.idleAnim, true);
  }

  /** 攻击动画:播一次 attack 再接回 idle(骨骼未就绪时静默跳过)。 */
  /** 英雄转身:目标明显在身后(左侧)就朝左,在身前就朝右。骨骼子节点水平翻转,横向偏移一起镜像,人仍站在格子中间。 */
  private faceHeroToward(view: GuardUnitView, heroX: number, targetX: number): void {
    const skeleton = view.skeleton;
    if (!skeleton || !skeleton.isValid) {
      return;
    }
    const margin = this.unitSize() * 0.25;
    const wantLeft = targetX < heroX - margin ? true : targetX > heroX + margin ? false : (view.faceLeft ?? false);
    if (wantLeft === (view.faceLeft ?? false)) {
      return;
    }
    view.faceLeft = wantLeft;
    const spineNode = skeleton.node;
    const scale = spineNode.scale;
    const position = spineNode.position;
    spineNode.setScale(-scale.x, scale.y, scale.z);
    spineNode.setPosition(-position.x, position.y, position.z);
  }

  private playUnitAttack(view: GuardUnitView | undefined): void {
    if (!view || !view.spineReady || !view.skeleton || !view.skeleton.isValid || view.attackAnim === view.idleAnim) {
      return;
    }
    try {
      const attackEntry = view.skeleton.setAnimation(0, view.attackAnim, false);
      view.skeleton.addAnimation(0, view.idleAnim, true, 0);
      // 攻击动作期间(挥臂/扑击顶点远高于头)BOSS 头顶血条冻结不量,动作结束再继续跟头。
      let attackMs = 900;
      try {
        const end = (attackEntry as unknown as { animationEnd?: number } | null)?.animationEnd;
        if (typeof end === 'number' && Number.isFinite(end) && end > 0) {
          attackMs = end * 1000;
        }
      } catch (error) {
        void error;
      }
      view.attackHoldUntil = Date.now() + attackMs + 120;
    } catch (error) {
      void error;
    }
  }

  // ── 点击英雄显示攻击范围(2026-08-28 用户拍板:区域制,参考蔚蓝星球——远程=大区域+远端弧形边界,近战=本车道矩形块)──
  private drawRangeIndicator(hero: GuardHeroUnit): void {
    const field = this.fieldNode;
    if (!field) {
      return;
    }
    this.rangeShownDrawnCell = hero.cell;
    field.getChildByName('GuardRangeIndicator')?.destroy();
    const profile = GUARD_ROLE_PROFILE[hero.role];
    // 覆盖范围从水晶起算(与所站格子无关)——同类型英雄范围永远一样大。
    const left = this.xToPx(0);
    const right = this.xToPx(Math.min(GUARD_SPAWN_X, profile.rangeCells));
    const layer = this.host.addChildPlainNode(field, 'GuardRangeIndicator', 0, 0, 10, 10);
    layer.setSiblingIndex(1);
    const g = layer.addComponent(Graphics);
    // 分区布局(2026-08-28):范围=走道打击区横带 + 以水晶为心的远端弧形边界
    const bandTop = this.walkwayY() + this.layoutHeight * 0.15;
    const bandBottom = this.walkwayY() - this.layoutHeight * 0.15;
    g.fillColor = rgba(120, 230, 110, 26);
    g.roundRect(left, bandBottom, right - left, bandTop - bandBottom, 18);
    g.fill();
    const cy = this.walkwayY();
    const radius = Math.max(60, right - left);
    const halfSpan = Math.atan2((bandTop - bandBottom) / 2, radius);
    g.strokeColor = rgba(190, 240, 130, 225);
    g.lineWidth = 6;
    g.arc(left, cy, radius, -halfSpan, halfSpan, false);
    g.stroke();
    // 选中格高亮:金光踏台(踏台改版配套,2026-09-02)
    const tile = this.cellTileRect(hero.cell);
    this.mountSprite(layer, 'SelectedCard', this.cellTilePath(true), tile.x, tile.y, tile.w * 1.1, tile.h * 1.1);
    this.showHeroInfo(hero);
  }

  /** 选中英雄信息卡(2026-08-25 用户拍板:点击展示信息,再点消失):名/星/定位/攻击/攻速/射程。 */
  private showHeroInfo(hero: GuardHeroUnit): void {
    const root = this.root;
    const sim = this.sim;
    if (!root || !sim) {
      return;
    }
    root.getChildByName('GuardHeroInfoPanel')?.destroy();
    const pool = sim.pool.find((entry) => entry.heroCode === hero.heroCode);
    const profile = GUARD_ROLE_PROFILE[hero.role];
    const skill = GUARD_HERO_SKILL[hero.role];
    // 放大+内容整体下移进框(2026-08-28 用户验收:名字盖住框顶);2026-09-21 加高:战技/专属大招分两行 + 已持有词条。
    const w = 404;
    const h = 408;
    const panel = this.host.addChildPlainNode(root, 'GuardHeroInfoPanel', -this.layoutWidth / 2 + 88 + w / 2, this.layoutHeight / 2 - 226 - h / 2, w, h);
    // 素净框(2026-08-28 用户验收:原框坠饰太多且全遮背景):细金线石板框 + 轻透明,背后英雄隐约可见
    this.mountSprite(panel, 'Frame', 'ui/common/ai/bag_grid_panel/spriteFrame', 0, 0, w, h);
    const panelOpacity = panel.addComponent(UIOpacity);
    panelOpacity.opacity = 232;
    const nameLabel = this.host.addChildLabel(panel, 'Name', pool?.displayName ?? hero.heroCode, 0, h / 2 - 58, 24, rgba(255, 234, 180), new Size(w - 96, 30));
    nameLabel.overflow = Label.Overflow.SHRINK;
    this.host.addChildLabel(panel, 'Star', '★'.repeat(hero.star), 0, h / 2 - 88, 18, rgba(255, 220, 110), new Size(w - 60, 22));
    const roleName = GUARD_ROLE_LABEL[hero.role] ?? hero.role;
    const perkProfile = resolveGuardHeroPerkProfile(hero.heroCode, hero.role);
    const roleLabel = this.host.addChildLabel(panel, 'Role', `定位 ${roleName} · 覆盖 ${profile.rangeCells} 格 · 普攻 ${GUARD_ARCHETYPE_LABEL[perkProfile.archetype]}`, 0, h / 2 - 118, 16, rgba(226, 214, 188), new Size(w - 60, 20));
    roleLabel.overflow = Label.Overflow.SHRINK;
    this.host.addChildLabel(panel, 'Atk', this.heroInfoAtkText(hero), 0, h / 2 - 146, 16, rgba(255, 200, 150), new Size(w - 60, 22));
    // 战技(2★ 自动施放,通用表现)与专属大招(金色词条觉醒)分两行
    const skillTitle = this.host.addChildLabel(panel, 'SkillName', this.heroInfoSkillText(hero), 0, h / 2 - 178, 17, rgba(150, 220, 255), new Size(w - 64, 22));
    skillTitle.overflow = Label.Overflow.SHRINK;
    const ultTitle = this.host.addChildLabel(panel, 'UltName', '', 0, h / 2 - 204, 17, rgba(255, 214, 110), new Size(w - 64, 22));
    ultTitle.overflow = Label.Overflow.SHRINK;
    const desc = this.host.addChildLabel(panel, 'SkillDesc', skill.desc, 0, h / 2 - 240, 14, rgba(206, 196, 172), new Size(w - 76, 40));
    desc.overflow = Label.Overflow.SHRINK;
    const perksLabel = this.host.addChildLabel(panel, 'Perks', '', 0, h / 2 - 316, 14, rgba(200, 220, 255), new Size(w - 76, 96));
    perksLabel.overflow = Label.Overflow.SHRINK;
    perksLabel.enableWrapText = true;
    perksLabel.lineHeight = 19;
    this.refreshHeroInfoLive(hero);
  }

  private heroInfoAtkText(hero: GuardHeroUnit): string {
    const sim = this.sim;
    if (!sim) {
      return '';
    }
    const profile = GUARD_ROLE_PROFILE[hero.role];
    return `攻击 ${guardHeroAttackValue(sim, hero)} · 攻速 ${((1000 / profile.intervalMs) * guardPermanentFrequency(sim, hero.heroCode)).toFixed(1)}/秒`;
  }

  private heroInfoSkillText(hero: GuardHeroUnit): string {
    const sim = this.sim;
    if (!sim) {
      return '';
    }
    const cdLeft = Math.max(0, (hero.skillReadyMs - sim.timeMs) / 1000);
    const skillState = guardHeroSkillUnlocked(sim, hero) ? (cdLeft <= 0 ? '就绪' : `冷却 ${cdLeft.toFixed(1)}s`) : '2★ 解锁';
    return `⚡ 战技 · ${GUARD_HERO_SKILL[hero.role].name} · ${skillState}`;
  }

  /** 已持有词条摘要:蓝卡按层、紫卡流派;词条按英雄编码存,合成重抽身份后换了谁就看谁的。 */
  private heroInfoPerksText(hero: GuardHeroUnit): string {
    const sim = this.sim;
    if (!sim) {
      return '';
    }
    const perks = guardHeroPerks(sim, hero.heroCode);
    const perkArchetype = resolveGuardHeroPerkProfile(hero.heroCode, hero.role).archetype;
    const parts: string[] = [];
    for (const def of GUARD_BLUE_PERKS) {
      const level = perks.blue[def.id] ?? 0;
      if (level > 0) {
        parts.push(`${guardBluePerkName(def, perkArchetype)} Lv${level}`);
      }
    }
    const purple = resolveGuardHeroPerkProfile(hero.heroCode, hero.role).purple;
    if (perks.purple > 0 && purple) {
      parts.push(`【${purple.name}】Lv${perks.purple}`);
    }
    return parts.length > 0 ? `战术卡:${parts.join(' · ')}` : '战术卡:暂无(点"战术"抽取)';
  }

  /** 守卫战场技能显示名(2026-09-07 专属技能体系):优先专属大招名,无专属(主角/下架)回退职业机制名。 */
  private resolveGuardSkillDisplayName(heroCode: string | null | undefined, fallback: string | null | undefined): string {
    const name = resolveUltimateSkillName(heroCode);
    return name !== '终极技能' ? name : (fallback ?? '技能');
  }

  /** 信息卡逐帧轻量刷新:只改冷却/攻击文字,不重建节点。 */
  private refreshHeroInfoLive(hero: GuardHeroUnit): void {
    const sim = this.sim;
    const panel = this.root?.getChildByName('GuardHeroInfoPanel');
    if (!sim || !panel || !panel.isValid) {
      return;
    }
    const skillLabel = panel.getChildByName('SkillName')?.getComponent(Label);
    if (skillLabel) {
      skillLabel.string = this.heroInfoSkillText(hero);
    }
    const ultLabel = panel.getChildByName('UltName')?.getComponent(Label);
    if (ultLabel) {
      const ultLv = guardHeroPerks(sim, hero.heroCode).ultLv;
      const ultName = this.resolveGuardSkillDisplayName(hero.heroCode, '专属大招');
      ultLabel.string = ultLv > 0 ? `✦ 专属大招 · ${ultName} · Lv${ultLv} 已觉醒` : `✦ 专属大招 · ${ultName} · 金色战术卡觉醒`;
      ultLabel.color = ultLv > 0 ? rgba(255, 214, 110, 255) : rgba(170, 150, 110, 255);
    }
    const perksLabel = panel.getChildByName('Perks')?.getComponent(Label);
    if (perksLabel) {
      const text = this.heroInfoPerksText(hero);
      if (perksLabel.string !== text) {
        perksLabel.string = text;
      }
    }
    const atkLabel = panel.getChildByName('Atk')?.getComponent(Label);
    if (atkLabel) {
      atkLabel.string = this.heroInfoAtkText(hero);
    }
    const starLabel = panel.getChildByName('Star')?.getComponent(Label);
    if (starLabel) {
      starLabel.string = '★'.repeat(hero.star);
    }
  }

  private clearRangeIndicator(): void {
    this.rangeShownUnitId = null;
    this.rangeShownDrawnCell = -1;
    this.fieldNode?.getChildByName('GuardRangeIndicator')?.destroy();
    this.root?.getChildByName('GuardHeroInfoPanel')?.destroy();
  }

  // ── 技能击特效(2026-08-25 用户拍板):束状=从英雄身前沿攻击方向延伸、锁定怪物方向;爆点=贴在目标身上;
  //    目标死亡自动转向最近存活怪(guardFxAimers 逐帧驱动)。──
  /** 返回 false = 被限流只放了保底技能弹(调用方可补冲击环等轻量表现)。group.spec 指定特效(战技),缺省取专属大招。 */
  /** 排队中的灼烧区补播施放者战技循环特效;剩余不足 0.6 秒就不补了(返回 true 出队)。 */
  private retryBurnZoneFx(sim: GuardBattleState, zone: GuardZone): boolean {
    if (zone.untilMs - sim.timeMs < 600 || !zone.casterHeroCode) {
      return true;
    }
    if (this.zoneFxLive >= GUARD_ZONE_FX_MAX_LIVE) {
      return false;
    }
    const caster = sim.heroes.find((entry) => entry.heroCode === zone.casterHeroCode) ?? null;
    if (!caster) {
      return true;
    }
    let target: GuardMonster | null = null;
    for (const entry of sim.monsters) {
      if (!entry.dead && (!target || Math.abs(entry.x - zone.x) < Math.abs(target.x - zone.x))) {
        target = entry;
      }
    }
    return this.spawnGuardSkillFx(zone.casterHeroCode, caster.cell, target, { zone, spec: resolveHeroGuardSkillEffect(zone.casterHeroCode, caster.role), internal: true });
  }

  private spawnGuardSkillFx(
    heroCode: string,
    heroCell: number | null,
    monster: GuardMonster | null,
    group?: { monsterIds?: number[]; zone?: GuardZone | null; spec?: BattleSkillEffectSpec; anchorAt?: { x: number; y: number }; internal?: boolean; area?: { fromX: number; toX: number } },
  ): boolean {
    const field = this.fieldNode;
    const sim = this.sim;
    if (!field || !sim || heroCell === null) {
      return false;
    }
    // 不带 spec = 专属大招(2026-10-01):与战技分开计名额,不吃同英雄 1.6s 冷却与束状名额——大招永远完整播放,
    // 只有大招名额也满了才退成金色保底弹(紫色保底弹 = 战技)。internal = 大招播完把灼烧区交还给战技循环,不算新出手。
    const isUlt = !group?.spec;
    const zoneLoop = !isUlt && group?.zone?.kind === 'burn';
    const liveFull = isUlt
      ? this.ultFxLive >= GUARD_ULT_FX_MAX_LIVE
      : zoneLoop ? this.zoneFxLive >= GUARD_ZONE_FX_MAX_LIVE : this.skillFxLive >= GUARD_SKILL_FX_MAX_LIVE;
    // 被限流时不再静默吞掉:保底从英雄身前发一颗大号技能弹(纯表现)——归属永远可见(2026-09-02 用户验收)
    if (liveFull) {
      if (!group?.internal) {
        this.spawnSkillBolt(heroCell, monster, isUlt);
      }
      return false;
    }
    const pool = sim.pool.find((entry) => entry.heroCode === heroCode);
    const ally = this.snapshot?.allies[pool?.sourceIndex ?? -1] ?? null;
    const spec: BattleSkillEffectSpec = group?.spec ?? resolveHeroUltEffect(heroCode, ally?.heroClass ?? null);
    // 表现限流(视频验收):同英雄 1.6s 内只放一次完整特效;束状同屏最多 1 条;被限流走保底技能弹。
    const now = Date.now();
    if (!isUlt && !zoneLoop && !group?.internal && now - (this.heroFxLastAt.get(heroCode) ?? -1e9) < GUARD_HERO_FX_COOLDOWN_MS) {
      this.spawnSkillBolt(heroCell, monster);
      return false;
    }
    if (!isUlt && GUARD_BEAM_EFFECT_CODES.has(spec.effect) && this.beamFxLive >= 1) {
      this.spawnSkillBolt(heroCell, monster);
      return false;
    }
    if (!group?.internal) {
      this.heroFxLastAt.set(heroCode, now);
    }
    const hero = sim.heroes.find((entry) => entry.cell === heroCell);
    const role = hero?.role ?? 'ranged';
    const origin = this.cellCenter(heroCell);
    const muzzleX = origin.x + this.unitSize() * 0.45;
    const muzzleY = origin.y + this.unitSize() * 0.02;
    const rangePx = Math.max(this.unitSize() * 1.5, this.xToPx(Math.min(GUARD_SPAWN_X, GUARD_ROLE_PROFILE[role].rangeCells)) - muzzleX);
    if (!group?.internal && !group?.anchorAt) {
      // 出手闪光:一眼看清技能从谁身前发出(2026-08-26 用户验收)。
      const flash = this.host.addChildPlainNode(field, 'GuardMuzzleFlash', muzzleX, muzzleY, 10, 10);
      const flashG = flash.addComponent(Graphics);
      flashG.fillColor = rgba(255, 230, 150, 210);
      flashG.circle(0, 0, 16);
      flashG.fill();
      const flashOpacity = flash.addComponent(UIOpacity);
      tween(flash).to(0.2, { scale: new Vec3(2.4, 2.4, 1) }).start();
      tween(flashOpacity).to(0.24, { opacity: 0 }).call(() => { if (flash.isValid) { flash.destroy(); } }).start();
    }
    const node = this.host.addChildPlainNode(field, 'GuardSkillFx', muzzleX, muzzleY, 10, 10);
    node.setSiblingIndex(field.children.length - 1);
    const skeleton = node.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = battleFxPremultiplied(spec.effect);
    if (isUlt) {
      this.ultFxLive += 1;
    } else if (zoneLoop) {
      this.zoneFxLive += 1;
    } else {
      this.skillFxLive += 1;
    }
    let released = false;
    let beamCounted = false;
    let started = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      if (beamCounted) {
        this.beamFxLive = Math.max(0, this.beamFxLive - 1);
      }
      this.guardFxAimers.delete(node);
      if (isUlt) {
        this.ultFxLive = Math.max(0, this.ultFxLive - 1);
      } else if (zoneLoop) {
        this.zoneFxLive = Math.max(0, this.zoneFxLive - 1);
      } else {
        this.skillFxLive = Math.max(0, this.skillFxLive - 1);
      }
      if (node.isValid) {
        node.destroy();
      }
      // 大招骨骼没能播出来(加载失败 / 动画为空):补一个金色冲击环,大招不会无声消失。
      if (isUlt && !started) {
        const zoneAt = group?.zone ?? null;
        const at = group?.anchorAt
          ?? (zoneAt ? { x: this.xToPx(zoneAt.x), y: this.walkwayY() } : monster ? { x: this.xToPx(monster.x), y: this.monsterY(monster.lane, monster.x) } : null);
        if (at) {
          this.spawnCellBurst(at.x, at.y, rgba(255, 200, 90), true);
        }
      }
    };
    const markBeamLive = (): boolean => {
      if (this.beamFxLive >= 1) {
        return false;
      }
      this.beamFxLive += 1;
      beamCounted = true;
      return true;
    };
    loadSharedSpineData(resolveBattleSkillEffectResource(spec), null, 'GuardSkillFx', (data) => {
      if (!node.isValid || !data) {
        release();
        return;
      }
      try {
        const runtimeData = resolveBattleUnitSpineRuntimeData(data);
        const names = (runtimeData?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
        if (!runtimeData || names.length === 0) {
          release();
          return;
        }
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        // 整段演出类大招:骨骼数据上一次性裁掉角色本体 / 压暗底(替代逐帧插槽过滤),必须在赋给骨骼之前
        prepareBattleFxData(data, runtimeData, resolveBattleFxHiddenSlots(spec));
        const wanted = spec.animation.trim().toLowerCase();
        const animationName = names.find((name) => name.toLowerCase() === wanted)
          ?? names.find((name) => name.toLowerCase().includes(wanted))
          ?? names[0];
        skeleton.skeletonData = data;
        // 有实测表优先(预览页探针实拍,2026-09-12);无表项才回退运行时 3 时刻采样。
        const bounds = lookupBattleFxBounds(spec.effect, animationName) ?? this.measureGuardFxExtent(skeleton, animationName, `${spec.effect}:${animationName}`);
        const extentW = Math.max(8, bounds?.w ?? 1100);
        const extentH = Math.max(8, bounds?.h ?? 1100);
        const centerX = bounds?.cx ?? 0;
        const centerY = bounds?.cy ?? 0;
        // 束状=仅显式名单(2026-08-27 用户拍板:除凤凰束外全部走"英雄飞向怪物"弹道表现)。
        const vertical = extentH >= extentW * 1.5;
        const beam = GUARD_BEAM_EFFECT_CODES.has(spec.effect);
        // 束状同屏 ≤1(含宽高比判入的):抢不到名额直接放弃本次表现
        if (beam && !markBeamLive()) {
          release();
          return;
        }
        const beamExtent = vertical ? extentH : extentW;
        const beamThickExtent = vertical ? extentW : extentH;
        // 放大上限 2.0×(2026-09-12:低稀有度也要≥标准尺寸;再大只会糊)。
        // 2026-09-18 用户反馈 UR 技能太小:原按"最长边"适配,横长条素材(阿鲁卡多横斩实测盒 5776×612)缩到目标宽后
        // 高度只剩 75px。改按面积(几何均值)适配——方形素材尺寸不变,细长素材横向铺开、纵向不再被压扁;
        // 再钳在战场 90% 宽 / 75% 高内不出屏。
        const targetLen = this.unitSize() * 1.7 * (spec.scale || 1);
        const areaFit = targetLen / Math.sqrt(extentW * extentH);
        const screenFit = Math.min((this.layoutWidth * 0.9) / extentW, (this.layoutHeight * 0.75) / extentH);
        const baseFit = Math.min(GUARD_FX_UPSCALE_CAP, areaFit, screenFit);
        // 大招按"核心亮区"定尺寸与对位(2026-10-01):目标 = 稀有度档位 × unitSize 的几何均值,
        // 再钳在核心 ≤ 场宽 55% / 场高 56%、宽松框 ≤ 85%(淡粒子不糊满屏)内;战技继续用上面的 baseFit。
        const u = this.unitSize();
        const core: BattleFxMeasuredBounds = isUlt
          ? (lookupBattleFxCoreBounds(spec.effect, animationName)
            ?? { w: extentW * GUARD_ULT_CORE_FALLBACK_RATIO, h: extentH * GUARD_ULT_CORE_FALLBACK_RATIO, cx: centerX, cy: centerY })
          : { w: extentW, h: extentH, cx: centerX, cy: centerY };
        // 整段演出类大招(spec.clip,满屏素材):粒子本来就飞出画面,宽松框不再按 85% 屏钳(否则整体被缩到三成),
        // 只按核心亮区钳;出屏的淡粒子由安全区裁掉即可(2026-10-06 用户「实机看着假」:上屏太小)
        const looseMax = spec.clip ? 1.7 : GUARD_ULT_LOOSE_MAX;
        const ultClampFit = Math.min(
          GUARD_ULT_FIT_CAP,
          (this.layoutWidth * GUARD_ULT_CORE_MAX_W) / Math.max(8, core.w),
          (this.layoutHeight * GUARD_ULT_CORE_MAX_H) / Math.max(8, core.h),
          (this.layoutWidth * looseMax) / extentW,
          (this.layoutHeight * looseMax) / extentH,
        );
        const tierU = (GUARD_ULT_CORE_TARGET_U[heroCode.split('_')[0]] ?? GUARD_ULT_CORE_TARGET_U.R) * (group?.anchorAt ? GUARD_ULT_SUPPORT_MULT : 1);
        let ultWant = (u * tierU) / Math.sqrt(Math.max(64, core.w * core.h));
        let currentTargetId = monster?.monsterId ?? -1;
        const zone = group?.zone ?? null;
        const hitIds = (group?.monsterIds ?? []).filter((hitId) => this.sim?.monsters.some((entry) => entry.monsterId === hitId && !entry.dead) ?? false);
        if (isUlt && zone && zone.kind === 'burn') {
          // 远程大招落在灼烧区:亮核至少盖满灼烧圈(与 syncZones 半径同口径)
          const zoneR = Math.max(48, this.xToPx(Math.min(GUARD_SPAWN_X, zone.x + zone.radiusCells)) - this.xToPx(zone.x));
          ultWant = Math.max(ultWant, (2 * zoneR) / Math.max(8, core.w));
        }
        // 2026-09-12 用户反馈图 2:横斩从英雄身前"飞"过去、半张在屏幕左下——技能不再飞行,直接锁在目标上:
        // zone=灼烧区中心循环播到区域到期(区域本体就是特效);group=群体命中簇中心、宽度拉到覆盖全部命中怪
        //(特效覆盖处即掉血处);target=贴住单个目标(目标死亡转最近怪)。束状(凤凰)照旧从英雄身前指向目标。
        // 近战横扫带判定范围(2026-10-14):哪怕只命中一只也按范围铺开,特效覆盖处 = 掉血处
        const area = group?.area ?? null;
        const anchorMode: 'fixed' | 'zone' | 'group' | 'target' = group?.anchorAt ? 'fixed' : zone ? 'zone' : (area || hitIds.length > 1) ? 'group' : 'target';
        let burstFit = isUlt ? Math.min(ultWant, ultClampFit) : baseFit;
        let groupX = 0;
        let groupY = 0;
        if (anchorMode === 'group' && this.sim) {
          let minX = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let sumY = 0;
          let count = 0;
          for (const hit of this.sim.monsters) {
            if (!hitIds.includes(hit.monsterId)) {
              continue;
            }
            const hx = this.xToPx(hit.x);
            minX = Math.min(minX, hx);
            maxX = Math.max(maxX, hx);
            sumY += this.monsterY(hit.lane, hit.x) + this.monsterJitterY(hit) * this.monsterSpread(hit.x);
            count += 1;
          }
          groupX = (minX + maxX) / 2;
          groupY = (count > 0 ? sumY / count : this.walkwayY()) + this.unitSize() * 0.1;
          if (area) {
            // 所见即所得:特效亮区横向正好铺满判定范围 [fromX, toX],中心对准范围中点
            const ax0 = this.xToPx(area.fromX);
            const ax1 = this.xToPx(area.toX);
            const areaPx = Math.max(u * 0.8, ax1 - ax0);
            groupX = (ax0 + ax1) / 2;
            burstFit = isUlt
              ? Math.min(ultClampFit, areaPx / Math.max(8, core.w))
              : Math.min(GUARD_FX_GROUP_UPSCALE_CAP, areaPx / extentW);
          } else if (isUlt) {
            // 大招:亮核横向盖住整个命中簇
            burstFit = Math.min(ultClampFit, Math.max(ultWant, (maxX - minX + u * 1.2) / Math.max(8, core.w)));
          } else {
            // 战技:最多比 baseFit 大 15%(此前可拉到 2.6×,近战战技反而比大招还大)
            burstFit = Math.min(GUARD_FX_GROUP_UPSCALE_CAP, baseFit * GUARD_SKILL_GROUP_GROWTH, Math.max(baseFit, (maxX - minX + u * 1.6) / extentW));
          }
        }
        // 出手时锚定目标已死(大招 ×1.5 一击清场常见):钉在它最后的位置(死怪 3s 内仍留在 sim.monsters 里),
        // 不然 aim 找不到活怪会直接 return,节点停在英雄身前、按原始骨骼尺寸(上千像素)播放。
        let pinned: { x: number; y: number } | null = null;
        if (monster && (monster.dead || !(this.sim?.monsters.some((entry) => entry.monsterId === monster.monsterId && !entry.dead) ?? false))) {
          pinned = {
            x: this.xToPx(monster.x),
            y: this.monsterY(monster.lane, monster.x) + this.monsterJitterY(monster) * this.monsterSpread(monster.x) + this.unitSize() * 0.1,
          };
        }
        const resolveTarget = (): GuardMonster | null => {
          if (!this.sim) {
            return null;
          }
          let target = this.sim.monsters.find((entry) => entry.monsterId === currentTargetId && !entry.dead) ?? null;
          if (!target) {
            // 目标死亡:自动转向离英雄最近的存活怪。
            let bestDist = Number.POSITIVE_INFINITY;
            for (const candidate of this.sim.monsters) {
              if (candidate.dead) {
                continue;
              }
              const dist = Math.abs(this.xToPx(candidate.x) - muzzleX);
              if (dist < bestDist) {
                bestDist = dist;
                target = candidate;
              }
            }
            if (target) {
              currentTargetId = target.monsterId;
            }
          }
          return target;
        };
        const place = (ax: number, ay: number): void => {
          node.setScale(burstFit, burstFit, 1);
          if (isUlt) {
            // 大招:亮核中心对准锚点,并整体收进安全区(不压底部法术栏、不顶顶部横幅、不出屏)
            const hw = (core.w * burstFit) / 2;
            const hh = (core.h * burstFit) / 2;
            const W = this.layoutWidth;
            const H = this.layoutHeight;
            const within = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
            const cx = within(ax, GUARD_FX_SAFE.left * W + hw, GUARD_FX_SAFE.right * W - hw);
            // 辅助大招挂在施法者身上:下排英雄脚下就是屏幕底部,下沿放宽到屏幕底边,否则会被顶离施法者
            const bottom = anchorMode === 'fixed' ? -0.5 * H + 8 : GUARD_FX_SAFE.bottom * H;
            const cy = within(ay, bottom + hh, GUARD_FX_SAFE.top * H - hh);
            node.setPosition(cx - core.cx * burstFit, cy - core.cy * burstFit, 0);
            return;
          }
          node.setPosition(ax - centerX * burstFit, ay - centerY * burstFit, 0);
        };
        const aim = (): void => {
          if (!node.isValid) {
            return;
          }
          if (anchorMode === 'fixed' && group?.anchorAt) {
            place(group.anchorAt.x, group.anchorAt.y);
            return;
          }
          if (anchorMode === 'zone' && zone && !beam) {
            if (this.sim && this.sim.timeMs >= zone.untilMs) {
              release();
              return;
            }
            place(this.xToPx(zone.x), this.walkwayY() + this.unitSize() * 0.35);
            return;
          }
          if (anchorMode === 'group' && !beam) {
            place(groupX, groupY);
            return;
          }
          if (pinned && !beam) {
            place(pinned.x, pinned.y);
            return;
          }
          const target = resolveTarget();
          if (!target) {
            return;
          }
          const tx = this.xToPx(target.x);
          const ty = this.monsterY(target.lane, target.x) + this.monsterJitterY(target) * this.monsterSpread(target.x) + this.unitSize() * 0.1;
          if (beam) {
            const dx = tx - muzzleX;
            const dy = ty - muzzleY;
            const dist = Math.max(this.unitSize(), Math.hypot(dx, dy));
            // 角度钳制:以英雄前方(朝右)为基准上下各 45°,火柱不乱转(2026-08-26 用户拍板)。
            const aimAngle = Math.max(-45, Math.min(45, Math.atan2(dy, dx) * (180 / Math.PI)));
            node.angle = aimAngle + (vertical ? -90 : 0);
            const len = Math.min(Math.max(dist, this.unitSize() * 1.5), rangePx);
            // 拉伸上限 1.5× 可读基准(视频验收 2.2× 仍占屏 1/3 且糊):柱身锚身前指向目标,尖端尽力延伸。
            const naturalFit = (this.unitSize() * 2.0) / Math.max(extentW, extentH);
            const fitLen = Math.min(len / beamExtent, naturalFit * 1.5);
            const fitThick = Math.min(fitLen * (spec.scale || 1), (this.unitSize() * 1.8) / beamThickExtent, naturalFit * 1.6);
            // 竖版素材长度轴=本地 Y(旋转 -90° 后指向目标),横版=本地 X。
            if (vertical) {
              node.setScale(fitThick, fitLen, 1);
            } else {
              node.setScale(fitLen, fitThick, 1);
            }
            // 根部贴炮口:内容"根部"(长度轴负端+视觉内缩标定)经缩放+最终旋转后补偿——亮部从英雄身前喷出。
            const inset = (GUARD_BEAM_ROOT_INSET[spec.effect] ?? 0) * beamExtent;
            const rootLx = vertical ? centerX * fitThick : (centerX - extentW / 2 + inset) * fitLen;
            const rootLy = vertical ? (centerY - extentH / 2 + inset) * fitLen : centerY * fitThick;
            const nodeRad = node.angle * (Math.PI / 180);
            const cos = Math.cos(nodeRad);
            const sin = Math.sin(nodeRad);
            node.setPosition(muzzleX - (rootLx * cos - rootLy * sin), muzzleY - (rootLx * sin + rootLy * cos), 0);
          } else {
            // 单目标:贴住目标(目标死了由 resolveTarget 换最近怪)
            place(tx, ty);
          }
        };
        aim();
        this.guardFxAimers.set(node, aim);
        if (beam) {
          let plays = 0;
          skeleton.setAnimation(0, animationName, false);
          skeleton.setCompleteListener(() => {
            plays += 1;
            if (plays >= 2 || spec.loop) {
              release();
              return;
            }
            try {
              skeleton.setAnimation(0, animationName, false);
            } catch (error) {
              void error;
              release();
            }
          });
        } else if (anchorMode === 'zone' && !isUlt) {
          // 灼烧区:循环播放,aim 内按 zone.untilMs 到期释放
          const zoneClip = spec.clip;
          if (zoneClip && zoneClip.end > zoneClip.start) {
            // 带片段:起手段播一遍,再只循环满状态段(TrackEntry.animationStart/End 限定动画时间轴)
            const intro = skeleton.setAnimation(0, animationName, false);
            if (intro) {
              intro.animationStart = zoneClip.start;
              intro.animationEnd = zoneClip.end;
            }
            const steady = skeleton.addAnimation(0, animationName, true, 0);
            if (steady) {
              steady.animationStart = Math.min(zoneClip.end - 0.1, Math.max(zoneClip.start, zoneClip.loopFrom ?? zoneClip.start));
              steady.animationEnd = zoneClip.end;
            }
          } else {
            skeleton.setAnimation(0, animationName, true);
          }
        } else {
          const mainEntry = skeleton.setAnimation(0, animationName, false);
          let finished = false;
          const finish = (): void => {
            if (finished) {
              return;
            }
            finished = true;
            release();
            // 远程大招(2026-10-01):在灼烧区上只爆一次大的,然后把还没到期的灼烧区交给战技循环特效接着烧
            const live = this.sim;
            if (isUlt && zone && zone.kind === 'burn' && live && live.timeMs < zone.untilMs && live.zones.some((entry) => entry.zoneId === zone.zoneId)) {
              const handed = this.spawnGuardSkillFx(heroCode, heroCell, resolveTarget(), { zone, spec: resolveHeroGuardSkillEffect(heroCode, role), internal: true });
              if (!handed) {
                this.plainBurnZones.set(zone.zoneId, 0);
              }
            }
          };
          skeleton.setCompleteListener(finish);
          // 整段演出类大招(2026-10-05 新批次 hu_*):跳到片段起点,播到片段终点淡出收掉
          const clip = spec.clip;
          if (clip && clip.end > clip.start) {
            const speed = Math.max(0.25, clip.speed ?? 1);
            skeleton.timeScale = 1;
            if (sys.isNative && mainEntry) {
              // 原生(安卓)上 Skeleton.updateAnimation 不推进动画(2026-10-16 真机:米迦勒大招从头播,雷云"往下掉"的入场段被播出来),
              // 直接把轨道时间设到片段起点;网页端保持原路径(已验收的画面不动)
              mainEntry.trackTime = Math.max(0, clip.start);
            } else {
              skeleton.updateAnimation(Math.max(0, clip.start));
            }
            skeleton.timeScale = speed;
            // 角色本体部件与压暗黑底已在骨骼数据上裁掉(prepareBattleFxData),不再逐帧过滤
            const playSec = (clip.end - clip.start) / speed;
            const fadeSec = Math.min(0.14, playSec * 0.25);
            // 2026-10-06 用户「实机看着假」:这批素材在 Spine 里是压暗全屏 + 角色一起看的,战场上只剩特效本体、
            // 又从片段中间直接蹦出来,叠在亮背景上像贴纸。补三件事:整段压暗战场(与片段同长)、0.15s 淡入、片段末淡出。
            if (isUlt) {
              this.holdUltDim(playSec);
            }
            const fadeInSec = Math.min(0.15, playSec * 0.2);
            const fade = { alpha: 0 };
            skeleton.color = new Color(255, 255, 255, 0);
            tween(fade)
              .to(fadeInSec, { alpha: 255 }, {
                onUpdate: () => {
                  if (node.isValid) {
                    skeleton.color = new Color(255, 255, 255, Math.round(fade.alpha));
                  }
                },
              })
              .delay(Math.max(0, playSec - fadeSec - fadeInSec))
              .to(fadeSec, { alpha: 0 }, {
                onUpdate: () => {
                  if (node.isValid) {
                    skeleton.color = new Color(255, 255, 255, Math.round(fade.alpha));
                  }
                },
              })
              .call(finish)
              .start();
          }
        }
        started = true;
      } catch (error) {
        void error;
        release();
      }
    });
    const lifetimeSec = !isUlt && group?.zone && this.sim ? Math.max(0.6, (group.zone.untilMs - this.sim.timeMs) / 1000 + 0.3) : Math.max(3.4, spec.clip ? (spec.clip.end - spec.clip.start) / Math.max(0.25, spec.clip.speed ?? 1) + 0.6 : 0);
    tween(node).delay(lifetimeSec).call(release).start();
    return true;
  }

  /** 采样动画 3 时刻,遍历 Region/Mesh 附件求 AABB 宽高与原点偏移(按套缓存;测不出返回 null 走兜底)。 */
  private measureGuardFxExtent(skeleton: sp.Skeleton, animationName: string, cacheKey: string): { w: number; h: number; cx: number; cy: number } | null {
    if (this.guardFxBoundsCache.has(cacheKey)) {
      return this.guardFxBoundsCache.get(cacheKey) ?? null;
    }
    // 原生(安卓)的 Spine 是 C++ 实现,updateWorldTransform / computeWorldVertices 参数不合法时直接断言中止进程(try/catch 接不住,
    // 2026-10-14 安卓真机一开战就崩);这类实时测量只是兜底(主要靠 BATTLE_FX_MEASURED_BOUNDS 实测表),原生上直接跳过。
    if (sys.isNative) {
      this.guardFxBoundsCache.set(cacheKey, null);
      return null;
    }
    let extent: { w: number; h: number; cx: number; cy: number } | null = null;
    try {
      skeleton.setAnimation(0, animationName, false);
      const raw = (skeleton as unknown as { _skeleton?: unknown })._skeleton as {
        slots?: Array<{ getAttachment?: () => unknown; bone?: unknown }>;
        updateWorldTransform?: () => void;
      } | undefined;
      const duration = Math.max(0.2, skeleton.findAnimation(animationName)?.duration ?? 1);
      if (raw && raw.slots) {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let lastTime = 0;
        for (const ratio of [0.25, 0.5, 0.8]) {
          const targetTime = duration * ratio;
          skeleton.updateAnimation(Math.max(0, targetTime - lastTime));
          lastTime = targetTime;
          // 引擎的 Spine 4.2 wasm 绑定里 updateWorldTransform 需要 Physics 枚举参数且该类型未导出(调用必抛"unbound types"),
          // 此前这里一抛整次测量就作废;updateAnimation 已经推进并刷新了世界变换,这里失败直接忽略(2026-09-21)。
          try {
            raw.updateWorldTransform?.();
          } catch (transformError) {
            void transformError;
          }
          for (const slot of raw.slots ?? []) {
            const attachment = slot.getAttachment?.() as {
              computeWorldVertices?: (...args: unknown[]) => void;
              width?: number;
              worldVerticesLength?: number;
            } | null | undefined;
            if (!attachment || typeof attachment.computeWorldVertices !== 'function') {
              continue;
            }
            let verts: number[] | null = null;
            if (typeof attachment.width === 'number') {
              // Spine 4.2 的 RegionAttachment.computeWorldVertices 第一个参数是 slot(3.x 才是 bone);
              // 传错会抛异常,整次测量作废(纯 Region 的飞行特效因此量不出包围盒,2026-09-21)。先按 4.2 传 slot,失败再退回 bone。
              verts = new Array<number>(8).fill(0);
              try {
                attachment.computeWorldVertices(slot, verts, 0, 2);
              } catch (regionError) {
                void regionError;
                verts = new Array<number>(8).fill(0);
                attachment.computeWorldVertices(slot.bone, verts, 0, 2);
              }
            } else if (typeof attachment.worldVerticesLength === 'number' && attachment.worldVerticesLength > 0) {
              const count = attachment.worldVerticesLength;
              verts = new Array<number>(count).fill(0);
              attachment.computeWorldVertices(slot, 0, count, verts, 0, 2);
            }
            if (!verts) {
              continue;
            }
            for (let i = 0; i + 1 < verts.length; i += 2) {
              if (!Number.isFinite(verts[i]) || !Number.isFinite(verts[i + 1])) {
                continue;
              }
              minX = Math.min(minX, verts[i]);
              maxX = Math.max(maxX, verts[i]);
              minY = Math.min(minY, verts[i + 1]);
              maxY = Math.max(maxY, verts[i + 1]);
            }
          }
        }
        if (Number.isFinite(minX) && maxX - minX > 8 && maxY - minY > 8) {
          extent = { w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
        }
      }
    } catch (error) {
      void error;
      extent = null;
    }
    this.guardFxBoundsCache.set(cacheKey, extent);
    return extent;
  }

  /** 金卡觉醒横幅:专属大招名大字 + 金边,2.6s 上浮淡出(docs/32 §6"稀有时刻")。 */
  private showUltAwakenBanner(heroCode: string, ultLv: number): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const pool = this.sim?.pool.find((entry) => entry.heroCode.toUpperCase() === heroCode.toUpperCase());
    root.getChildByName('GuardUltAwakenBanner')?.destroy();
    const w = 620;
    const h = 118;
    const banner = this.host.addChildPlainNode(root, 'GuardUltAwakenBanner', 0, this.layoutHeight * 0.24, w, h);
    const g = banner.addComponent(Graphics);
    g.fillColor = rgba(26, 12, 8, 244);
    g.roundRect(-w / 2, -h / 2, w, h, 18);
    g.fill();
    g.strokeColor = rgba(255, 214, 110, 255);
    g.lineWidth = 4;
    g.roundRect(-w / 2, -h / 2, w, h, 18);
    g.stroke();
    g.strokeColor = rgba(180, 40, 40, 220);
    g.lineWidth = 1.6;
    g.roundRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 13);
    g.stroke();
    const head = ultLv <= 1 ? '专属大招觉醒!' : `专属大招 Lv${ultLv}!`;
    const title = this.host.addChildLabel(banner, 'Title', `✦ ${pool?.displayName ?? heroCode} · ${head}`, 0, h * 0.2, 25, rgba(255, 226, 130), new Size(w - 36, 32));
    title.enableOutline = true;
    title.outlineColor = rgba(80, 24, 8, 255);
    title.outlineWidth = 3;
    title.overflow = Label.Overflow.SHRINK;
    const detail = this.host.addChildLabel(banner, 'Detail', `「${this.resolveGuardSkillDisplayName(heroCode, '专属大招')}」${ultLv <= 1 ? '取代战技:专属特效 · 伤害 ×1.5 · 冷却 -15%' : ultLv === 2 ? '伤害与冷却再强化' : '范围 / 持续 +50%'}`, 0, -h * 0.22, 17, rgba(240, 226, 196), new Size(w - 40, 24));
    detail.overflow = Label.Overflow.SHRINK;
    banner.setScale(0.7, 0.7, 1);
    const opacity = banner.addComponent(UIOpacity);
    tween(banner).to(0.18, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'backOut' }).to(0.1, { scale: new Vec3(1, 1, 1) }).by(2.3, { position: new Vec3(0, 36, 0) }).start();
    tween(opacity).delay(1.9).to(0.7, { opacity: 0 }).call(() => { if (banner.isValid) { banner.destroy(); } }).start();
  }

  /** 合成解锁战技横幅:点明解锁了什么(2 星=战技;专属大招要靠金色词条觉醒),2.2s 上浮淡出。 */
  private showSkillUnlockBanner(cell: number, heroCode: string): void {
    const root = this.root;
    if (!root) {
      return;
    }
    void cell;
    const pool = this.sim?.pool.find((entry) => entry.heroCode === heroCode);
    const name = pool?.displayName ?? heroCode;
    root.getChildByName('GuardSkillUnlockBanner')?.destroy();
    // 顶部居中吐司(原贴英雄位置会溢出/压弹框);文字 SHRINK 兜底,绝不截字。
    const w = 560;
    const h = 104;
    const banner = this.host.addChildPlainNode(root, 'GuardSkillUnlockBanner', 0, this.layoutHeight * 0.26, w, h);
    const g = banner.addComponent(Graphics);
    g.fillColor = rgba(30, 22, 14, 240);
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.fill();
    g.strokeColor = rgba(255, 210, 110, 250);
    g.lineWidth = 3;
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.stroke();
    const title = this.host.addChildLabel(banner, 'Title', `⚡ ${name} 战技解锁!`, 0, h * 0.2, 24, rgba(255, 226, 130), new Size(w - 28, 30));
    title.enableOutline = true;
    title.outlineColor = rgba(60, 30, 10, 255);
    title.outlineWidth = 2;
    title.overflow = Label.Overflow.SHRINK;
    const heroRole = this.sim?.heroes.find((entry) => entry.heroCode === heroCode)?.role ?? this.sim?.pool.find((entry) => entry.heroCode === heroCode)?.role;
    const skill = heroRole ? GUARD_HERO_SKILL[heroRole] : null;
    const detail = this.host.addChildLabel(banner, 'Detail', skill ? `战技「${skill.name}」:${skill.desc}(专属大招需金色战术卡觉醒)` : '2★ 战技已解锁', 0, -h * 0.22, 16, rgba(236, 224, 196), new Size(w - 32, 24));
    detail.overflow = Label.Overflow.SHRINK;
    const opacity = banner.addComponent(UIOpacity);
    tween(banner).by(2.4, { position: new Vec3(0, 40, 0) }).start();
    tween(opacity).delay(1.6).to(0.8, { opacity: 0 }).call(() => { if (banner.isValid) { banner.destroy(); } }).start();
  }

  /** 击杀掉金币:原地落地小弹跳 → 飞向右上角战斗金币 → 计数滚动+金币栏脉冲(2026-08-26 用户拍板)。 */
  private spawnGoldCoin(fieldX: number, fieldY: number): void {
    const root = this.root;
    if (!root || this.goldCoinLive >= 12) {
      return;
    }
    this.goldCoinLive += 1;
    const yOffset = -this.layoutHeight * 0.03;
    const size = 40;
    const coin = this.host.addChildPlainNode(root, 'GuardGoldCoin', fieldX, fieldY + yOffset, size, size);
    this.mountSprite(coin, 'Img', 'ui/guard/coin_gold/spriteFrame', 0, 0, size, size);
    const groundY = fieldY + yOffset - this.unitSize() * 0.35;
    const targetX = this.layoutWidth / 2 - 180;
    const targetY = this.layoutHeight / 2 - 42;
    let released = false;
    const done = (): void => {
      if (released) {
        return;
      }
      released = true;
      this.goldCoinLive = Math.max(0, this.goldCoinLive - 1);
      if (coin.isValid) {
        coin.destroy();
      }
      const goldText = root.getChildByName('GuardHud')?.getChildByName('GuardGoldText');
      if (goldText && goldText.isValid) {
        tween(goldText).to(0.08, { scale: new Vec3(1.22, 1.22, 1) }).to(0.12, { scale: Vec3.ONE }).start();
      }
    };
    tween(coin)
      .to(0.16, { position: new Vec3(fieldX, groundY, 0) }, { easing: 'quadIn' })
      .to(0.1, { position: new Vec3(fieldX, groundY + 16, 0) }, { easing: 'quadOut' })
      .to(0.08, { position: new Vec3(fieldX, groundY, 0) }, { easing: 'quadIn' })
      .delay(0.12)
      .to(0.45, { position: new Vec3(targetX, targetY, 0), scale: new Vec3(0.6, 0.6, 1) }, { easing: 'quadIn' })
      .call(done)
      .start();
    tween(coin).delay(1.6).call(done).start();
  }

  /** 怪物动画名解析用的敌方单位壳(resolveBattleUnitSpineAnimationNames 需要 side/rarity 上下文,抄 LobbyIdleStageRenderer)。 */
  private toGuardEnemyUnit(resource: string): BattlePresentationUnitSnapshot {
    return {
      unitKey: `guard-monster:${resource}`,
      side: 'enemy',
      slot: 0,
      displayName: '怪物',
      subline: '',
      rarity: 'ENEMY',
      level: 1,
      power: 0,
      role: 'front',
      leader: false,
      hpRatio: 1,
      sourceHeroId: 0,
      heroCode: '',
      heroClass: null,
      portraitAsset: null,
      spineAsset: resource,
      spineUuid: null,
    };
  }

  /** 怪物散布抖动(monsterId 哈希,确定性,不耗 rng):同车道内 ±0.32 车道高,摆脱"一条直线"。 */
  private monsterJitterY(monster: GuardMonster): number {
    const hash = (monster.monsterId * 2654435761) >>> 0;
    return (((hash % 1000) / 1000) - 0.5) * this.layoutHeight * 0.155 * 0.64;
  }

  /** 出售落点判定:拖过 0 列左缘(格子区之外)且在水晶高度带内才算,避免合成拖拽误碰(2026-09-02)。 */
  private isSellDropPosition(x: number, y: number): boolean {
    const sellBoundaryX = this.cellCenter(0).x - this.cellPitchPx() * 0.55;
    const crystalY = -this.layoutHeight * 0.055;
    return x < sellBoundaryX && Math.abs(y - crystalY) < this.layoutHeight * 0.24;
  }

  /** 拖拽悬停出售区:水晶染红提示"松手=卖"。 */
  private setCrystalSellHover(hover: boolean): void {
    const icon = this.fieldNode?.getChildByName('GuardCrystal')?.getChildByName('GuardCrystalIcon')?.getComponent(Sprite);
    if (icon && icon.isValid) {
      icon.color = hover ? rgba(255, 140, 120, 255) : rgba(255, 255, 255, 255);
    }
  }

  private bindHeroDrag(node: Node, unitId: number): void {
    // 点选与拖拽共存:位移 <10px 视为点击(选中/再点收起,2026-08-25 用户拍板);≥10px 走拖拽合成/换位。
    let movedPx = 0;
    node.on(Node.EventType.TOUCH_START, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      const hero = this.sim?.heroes.find((entry) => entry.unitId === unitId);
      if (hero) {
        movedPx = 0;
        this.dragFromCell = hero.cell;
        node.setSiblingIndex((this.fieldNode?.children.length ?? 2) - 1);
      }
    }, this);
    node.on(Node.EventType.TOUCH_MOVE, (event: { getUIDelta?: () => { x: number; y: number }; getDeltaX?: () => number; getDeltaY?: () => number }) => {
      if (this.dragFromCell === null || !node.isValid) {
        return;
      }
      const deltaX = event.getUIDelta ? event.getUIDelta().x : event.getDeltaX ? event.getDeltaX() : 0;
      const deltaY = event.getUIDelta ? event.getUIDelta().y : event.getDeltaY ? event.getDeltaY() : 0;
      movedPx += Math.abs(deltaX) + Math.abs(deltaY);
      node.setPosition(node.position.x + deltaX, node.position.y + deltaY, 0);
      // 拖到出售区时水晶染红提示,离开恢复(2026-09-02 误卖反馈配套)
      this.setCrystalSellHover(this.isSellDropPosition(node.position.x, node.position.y));
    }, this);
    const finishDrag = () => {
      const sim = this.sim;
      if (!sim || this.dragFromCell === null) {
        return;
      }
      const fromCell = this.dragFromCell;
      this.dragFromCell = null;
      if (!node.isValid) {
        return;
      }
      if (movedPx < 10) {
        // docs/37 B:战技已蓄满时点英雄 = 手动释放(+25%,可合击);没蓄满或没目标才走选中/范围显示。
        const tappedHero = sim.heroes.find((entry) => entry.unitId === unitId);
        if (tappedHero && guardHeroSkillUnlocked(sim, tappedHero) && sim.timeMs >= tappedHero.skillReadyMs && guardCastHeroSkillNow(sim, unitId)) {
          this.syncHeroes();
          return;
        }
        // 点击:选中显示范围+信息卡;再点同一英雄收起。
        if (this.rangeShownUnitId === unitId) {
          this.clearRangeIndicator();
        } else {
          const hero = sim.heroes.find((entry) => entry.unitId === unitId);
          if (hero) {
            this.rangeShownUnitId = unitId;
            this.drawRangeIndicator(hero);
          }
        }
        this.syncHeroes();
        return;
      }
      this.setCrystalSellHover(false);
      // 拖到水晶本体=出售(格满且无可合成的死局解法,2026-08-26)。
      // 判定收紧(2026-09-02 用户反馈:水晶离格子近,合成拖拽误碰被卖):必须拖过 0 列左缘且落在水晶高度带内,不再是整个左半区。
      if (this.isSellDropPosition(node.position.x, node.position.y)) {
        const value = guardSellHero(sim, fromCell);
        if (value !== null) {
          this.clearRangeIndicator();
          this.host.setStatus(`已出售,回收 ${value} 金币。`);
          gameAudio.sfx('coin');
          this.spawnFloater(this.xToPx(0.4), this.laneToPy(1) + this.unitSize() * 0.9, `出售 +${value}`, rgba(255, 214, 92), 18);
          this.syncHeroes();
          return;
        }
      }
      const targetCell = this.cellAtPosition(node.position.x, node.position.y);
      if (targetCell !== null) {
        const action = guardDragTo(sim, fromCell, targetCell);
        if (action === 'none' && guardFindHeroAt(sim, targetCell)) {
          this.host.setStatus('只有同名同星英雄才能合成。');
        }
        if (action === 'merge' || action === 'superMerge') {
          gameAudio.sfx('merge');
        }
        if (action !== 'none') {
          this.clearRangeIndicator();
        }
      }
      const stillThere = sim.heroes.find((entry) => entry.unitId === unitId);
      if (this.rangeShownUnitId === unitId && stillThere) {
        this.drawRangeIndicator(stillThere);
      } else if (this.rangeShownUnitId === unitId) {
        this.clearRangeIndicator();
      }
      this.syncHeroes();
    };
    // 冒泡拦截:英雄自己的点击不触发根节点"点空白关闭选中"
    node.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
      if (event) {
        event.propagationStopped = true;
      }
      finishDrag();
    }, this);
    node.on(Node.EventType.TOUCH_CANCEL, finishDrag, this);
  }

  // ── 怪物视图 ──
  private syncMonsters(): void {
    const sim = this.sim;
    const field = this.fieldNode;
    if (!sim || !field) {
      return;
    }
    const liveIds = new Set(sim.monsters.map((monster) => monster.monsterId));
    for (const [monsterId, view] of [...Array.from(this.monsterViews)]) {
      if (!liveIds.has(monsterId)) {
        if (view.node.isValid) {
          view.node.destroy();
        }
        this.destroyUnitBars(view);
        this.monsterViews.delete(monsterId);
      }
    }
    for (const monster of sim.monsters) {
      if (monster.player) {
        // 掠夺模式的进攻方由 GuardRaidController 画
        continue;
      }
      let view = this.monsterViews.get(monster.monsterId);
      if (!view) {
        view = this.createMonsterView(monster);
        this.monsterViews.set(monster.monsterId, view);
      }
      if (!view.node.isValid) {
        continue;
      }
      // 2026-10-11:飞行类怪只有跑步动画,抬高 0.45 格后像悬空走路,改为贴地(规则也按地面怪)
      const flyLift = 0;
      // 区域化散布:同车道内确定性 y 抖动(±0.32 车道高)+ sim 侧速度抖动,怪群成片不成线。
      const jitterY = monster.kind === 'boss' ? 0 : this.monsterJitterY(monster);
      // 受击顶退(打击感):红闪期间向后小位移,随时间衰减
      const targetX = this.xToPx(monster.x);
      const targetY = this.monsterY(monster.lane, monster.x) + jitterY * this.monsterSpread(monster.x) + flyLift;
      if (monster.dead) {
        // 死亡 / 溜走:停止插值,定在死亡点(淡出下沉 / 向左溜走的 tween 只在进入该状态时启动一次)
        if (view.interp !== false) {
          view.interp = false;
          view.node.setPosition(view.toX ?? targetX, view.toY ?? targetY, 0);
        }
      } else {
        // 首次出现直接落位;之后上一 tick → 本 tick 由 interpolateMonsterViews 每帧插值(补跑多个 tick 时起点取倒数第二个 tick 的位置)
        const prevX = view.toX !== undefined ? this.prevTickMonsterX.get(monster.monsterId) : undefined;
        if (prevX !== undefined) {
          view.fromX = this.xToPx(prevX);
          view.fromY = this.monsterY(monster.lane, prevX) + jitterY * this.monsterSpread(prevX) + flyLift;
        } else {
          view.fromX = view.toX ?? targetX;
          view.fromY = view.toY ?? targetY;
        }
        view.toX = targetX;
        view.toY = targetY;
        if (!view.interp) {
          view.interp = true;
          view.node.setPosition(targetX, targetY, 0);
        }
      }
      if (monster.dead && monster.escaped) {
        // 偷金鼠溜走:不播死亡,向左淡出
        if (view.lastAnimKey !== 'escaped') {
          view.lastAnimKey = 'escaped';
          view.node.getChildByName('GuardMonsterHp')?.destroy();
          this.destroyUnitBars(view);
          view.node.getChildByName('GuardMonsterShadow')?.destroy();
          const escapeOpacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
          tween(escapeOpacity).to(0.4, { opacity: 0 }).start();
          tween(view.node).by(0.4, { position: new Vec3(-this.unitSize() * 0.8, 0, 0) }).start();
        }
        continue;
      }
      if (monster.dead) {
        // 死亡演出:有死亡动画播动画后淡出,否则淡出下沉(打击感 2026-08-26)
        if (view.lastAnimKey !== 'dead') {
          view.lastAnimKey = 'dead';
          if (view.skeleton && view.skeleton.isValid) {
            view.skeleton.timeScale = 1;
          }
          view.node.getChildByName('GuardStunStars')?.destroy();
          view.node.getChildByName('GuardMarkReticle')?.destroy();
          // 死亡瞬间去掉血条(视频验收:'血没空就死'的错觉=死时血条残留旧值);直接销毁,尸体留场 3 秒期间不再占显存
          view.node.getChildByName('GuardMonsterHp')?.destroy();
          this.destroyUnitBars(view);
          const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
          if (view.skeleton && view.skeleton.isValid) {
            view.skeleton.color = GUARD_SPINE_WHITE;
          }
          if (view.skeleton && view.skeleton.isValid && view.deathAnim) {
            try {
              view.skeleton.setAnimation(0, view.deathAnim, false);
            } catch (error) {
              void error;
            }
            tween(opacity).delay(0.7).to(0.5, { opacity: 0 }).start();
          } else {
            tween(opacity).to(0.5, { opacity: 0 }).start();
            tween(view.node).by(0.5, { position: new Vec3(0, -14, 0) }).start();
          }
        }
        continue;
      }
      // 状态表现:受击红闪 > 减速冰蓝染色 > 正常。
      // 减速只染本体不加挂件(2026-09-02 用户反馈:雪星+蓝雾看着像技能,改成怪物身体变冰蓝一眼看出被减速)。
      const slowed = monster.slowUntilMs > sim.timeMs;
      const frozen = (monster.frozenUntilMs ?? 0) > sim.timeMs;
      const stunned = monster.stunnedUntilMs > sim.timeMs && !frozen;
      if (view.skeleton && view.skeleton.isValid) {
        // 被动冻结(docs/41 §6):整只怪冻成冰蓝,比减速的淡蓝更重,冻结期间一直保持
        view.skeleton.color = view.hitFlashUntil > Date.now() ? (view.hitFlashColor ?? GUARD_HIT_FLASH_COLOR) : frozen ? GUARD_FROZEN_TINT_COLOR : slowed ? GUARD_SLOW_TINT_COLOR : monster.greedy ? GUARD_GREEDY_TINT : GUARD_SPINE_WHITE;
        // 2026-10-24 用户「眩晕怪物应该停下来头顶冒星星,冻结也是停下来身体变蓝」:冻结动作定格,眩晕动作放慢到近乎静止
        const ccScale = frozen ? 0 : stunned ? 0.12 : 1;
        if (view.skeleton.timeScale !== ccScale) {
          view.skeleton.timeScale = ccScale;
        }
      }
      if (monster.greedy && !view.node.getChildByName('GuardGreedyBag')) {
        this.mountGreedyBag(view);
      }
      if (monster.kind === 'boss' || monster.kind === 'elite') {
        this.applyOccluderGhost(view, monster);
      }
      const slowMark = view.node.getChildByName('GuardSlowMark');
      if (slowMark) {
        slowMark.destroy();
      }
      const reticle = view.node.getChildByName('GuardMarkReticle');
      if (sim.markedMonsterId === monster.monsterId) {
        if (!reticle) {
          this.mountMarkReticle(view);
        }
      } else if (reticle) {
        reticle.destroy();
      }
      const stunStars = view.node.getChildByName('GuardStunStars');
      if (stunned && !stunStars) {
        this.mountStunStars(view, monster);
      } else if (!stunned && stunStars) {
        stunStars.destroy();
      }
      if (monster.kind !== 'boss') {
        // 小怪血条只在可见长度变了才动(2026-10-05:此前 40 只怪每帧各重画一次;2026-10-09 改共享条层精灵,满血不显示)
        const ratio = Math.max(0, monster.hp / monster.maxHp);
        const hpKey = ratio >= 1 ? -1 : Math.max(1, Math.round((view.hpBarW ?? 0) * ratio));
        if (view.hpDrawnKey !== hpKey) {
          view.hpDrawnKey = hpKey;
          this.syncMonsterHpBar(view, monster, hpKey);
        }
      }
      const hpBar = monster.kind === 'boss' ? view.node.getChildByName('GuardMonsterHp') : null;
      const hpGraphics = hpBar?.getComponent(Graphics);
      const hpTransform = hpBar?.getComponent(UITransform);
      if (hpBar && hpGraphics && hpTransform) {
        const ratio = Math.max(0, monster.hp / monster.maxHp);
        let hpDirty = true;
        {
          // BOSS 血条:头顶高度量定之前每 tick 都要走测量;量定后只在血量像素或文字变了才重画。
          // 2026-10-11:数字按 1/500 血量量化——原来每一下命中都换一次数字,整条 Graphics 重画 + 文字重新栅格化上传,BOSS 战里一秒好几次
          const hpStep = Math.max(1, Math.round(monster.maxHp / 500));
          const bossKey = Math.round(hpTransform.width * ratio) * 1e6 + Math.ceil(monster.hp / hpStep) % 1e6;
          hpDirty = !view.hpBarLocked || view.hpDrawnKey !== bossKey;
          view.hpDrawnKey = bossKey;
        }
        if (hpDirty) {
          hpGraphics.clear();
        }
        if (!hpDirty) {
          // 血条没变:跳过
        } else if (monster.kind === 'boss') {
          // 血条贴真实头顶(2026-09-18 用户反馈离头太远):骨骼 json 的声明高度含武器/翅膀外扩,
          // 改按当前姿态顶点实测的最高点定位;每 15 帧测一次,先读渲染顶点缓冲、再退 spine-core,都测不到保留初值。
          // 2026-09-18 用户拍板:血条位置要固定,不能随动作上下跳。做法:骨骼就绪后的行走阶段每 3 帧量一次,
          // 取这段时间(20 次≈1 秒)顶点最高值 +14 作为固定高度,之后锁死不再量;攻击动作期间不采样(挥臂顶点远高于头)。
          // 高度只会单调上调、从不下落,肉眼看就是"出场即定"。
          if (!view.hpBarLocked && view.spineReady && view.skeleton && view.skeleton.isValid) {
            this.bossHpBarTick = (this.bossHpBarTick + 1) % 3;
            const attacking = Date.now() < (view.attackHoldUntil ?? 0);
            if (this.bossHpBarTick === 0 && !attacking) {
              const headY = this.measureSkeletonTopY(view.skeleton);
              if (headY !== null) {
                const peak = Math.max(view.hpBarY ?? Number.NEGATIVE_INFINITY, headY + 14);
                view.hpBarY = peak;
                view.hpBarSamples = (view.hpBarSamples ?? 0) + 1;
                hpBar.setPosition(0, Math.min(peak, this.layoutHeight * 0.47 - view.node.position.y), 0);
                if (view.hpBarSamples >= 20) {
                  view.hpBarLocked = true;
                }
              }
            }
          }
          const barW = hpTransform.width;
          hpGraphics.fillColor = rgba(10, 8, 8, 225);
          hpGraphics.roundRect(-barW / 2, -7, barW, 14, 7);
          hpGraphics.fill();
          hpGraphics.fillColor = ratio > 0.35 ? rgba(235, 60, 45, 250) : rgba(255, 140, 60, 250);
          hpGraphics.roundRect(-barW / 2, -7, Math.max(8, barW * ratio), 14, 7);
          hpGraphics.fill();
          hpGraphics.strokeColor = rgba(255, 200, 120, 235);
          hpGraphics.lineWidth = 2;
          hpGraphics.roundRect(-barW / 2, -7, barW, 14, 7);
          hpGraphics.stroke();
          const hpText = hpBar.getChildByName('GuardMonsterHpText')?.getComponent(Label);
          if (hpText) {
            hpText.string = `BOSS  ${Math.ceil(monster.hp)} / ${monster.maxHp}`;
          }
        }
      }
    }
    this.sortMonsterViewsByDepth();
    this.placeBarLayer();
    this.refreshBossTopBar();
  }

  private bossHpBarTick = 0;

  /**
   * 从骨骼组件本帧的渲染顶点缓冲取最高 y(怪物节点坐标系)。
   * 顶点格式 pos(3f) uv(2f) color(4B)[+color2(4B)],用 renderData.floatStride 取步长;alpha 为 0 的顶点(隐藏 slot)跳过。
   * enableBatch 时顶点已是世界坐标,转回怪物节点空间;否则是骨骼节点本地坐标,乘节点缩放加偏移。
   */
  /** BOSS 身体画面中心相对怪物节点的 x 偏移(建视图时按 GUARD_BOSS_ANIMS.centerX × 视高算好;非 BOSS/未配置为 0)。 */
  private bossVisualOffsetX(view: GuardUnitView | undefined): number {
    return view?.centerOffsetX ?? 0;
  }

  private measureRenderedTopY(skeleton: sp.Skeleton): number | null {
    const rd = (skeleton as unknown as { renderData?: { vertexCount: number; floatStride: number; chunk?: { vb: Float32Array } } }).renderData;
    if (!rd || !rd.chunk || !rd.chunk.vb || rd.vertexCount < 3 || rd.floatStride < 6) {
      return null;
    }
    const vb = rd.chunk.vb;
    const stride = rd.floatStride;
    const bytes = new Uint8Array(vb.buffer, vb.byteOffset, vb.byteLength);
    const count = Math.min(rd.vertexCount, Math.floor(vb.length / stride));
    let maxY = Number.NEGATIVE_INFINITY;
    let maxX = 0;
    for (let i = 0; i < count; i++) {
      const base = i * stride;
      const alpha = bytes[(base + 5) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      const y = vb[base + 1];
      if (Number.isFinite(y) && y > maxY) {
        maxY = y;
        maxX = vb[base];
      }
    }
    if (!Number.isFinite(maxY)) {
      return null;
    }
    const spineNode = skeleton.node;
    const batched = (skeleton as unknown as { enableBatch?: boolean }).enableBatch === true;
    if (batched) {
      const monsterNode = spineNode.parent;
      const transform = monsterNode?.getComponent(UITransform);
      if (!transform) {
        return null;
      }
      return transform.convertToNodeSpaceAR(new Vec3(maxX, maxY, 0)).y;
    }
    return spineNode.position.y + maxY * Math.abs(spineNode.scale.y);
  }

  /**
   * 当前姿态下骨骼最高顶点在怪物节点坐标系里的 y(spine 原生单位 × 节点缩放 + 骨骼节点偏移)。
   * 走 spine-core 的 slot/attachment.computeWorldVertices(与特效量尺同法);拿不到返回 null。
   */
  private measureSkeletonTopY(skeleton: sp.Skeleton): number | null {
    // 首选:直接读本帧提交给 GPU 的顶点缓冲(wasm / JS 两种 spine 后端都有),跳过 alpha=0 的隐藏顶点,
    // 得到的就是"画面上真正画出来的最高点"。2026-09-18 用户二次反馈:走 spine-core 那条路在 wasm 后端拿不到 slots。
    const fromBuffer = this.measureRenderedTopY(skeleton);
    if (fromBuffer !== null) {
      return fromBuffer;
    }
    // 原生:下面走 spine-core computeWorldVertices,C++ 断言会中止进程,跳过
    if (sys.isNative) {
      return null;
    }
    const raw = (skeleton as unknown as { _skeleton?: unknown })._skeleton as {
      slots?: Array<{ getAttachment?: () => unknown; bone?: unknown }>;
    } | undefined;
    if (!raw || !raw.slots) {
      return null;
    }
    let maxY = Number.NEGATIVE_INFINITY;
    for (const slot of raw.slots) {
      const attachment = slot.getAttachment?.() as {
        computeWorldVertices?: (...args: unknown[]) => void;
        width?: number;
        worldVerticesLength?: number;
      } | null | undefined;
      if (!attachment || typeof attachment.computeWorldVertices !== 'function') {
        continue;
      }
      let verts: number[] | null = null;
      try {
        if (typeof attachment.width === 'number') {
          verts = new Array<number>(8).fill(0);
          attachment.computeWorldVertices(slot.bone, verts, 0, 2);
        } else if (typeof attachment.worldVerticesLength === 'number' && attachment.worldVerticesLength > 0) {
          const count = attachment.worldVerticesLength;
          verts = new Array<number>(count).fill(0);
          attachment.computeWorldVertices(slot, 0, count, verts, 0, 2);
        }
      } catch (error) {
        void error;
        continue;
      }
      if (!verts) {
        continue;
      }
      for (let i = 1; i < verts.length; i += 2) {
        if (Number.isFinite(verts[i])) {
          maxY = Math.max(maxY, verts[i]);
        }
      }
    }
    if (!Number.isFinite(maxY)) {
      return null;
    }
    const spineNode = skeleton.node;
    return spineNode.position.y + maxY * Math.abs(spineNode.scale.y);
  }

  /** 怪物脚底→头顶的相对高度(与 createMonsterView 的视高公式一致)。 */
  private monsterHeadOffsetY(monster: GuardMonster): number {
    const unit = this.unitSize();
    const kindMult = GUARD_MONSTER_DISPLAY_SCALE[monster.kind] ?? 1;
    const dbScale = GUARD_MONSTER_DB_SCALE[monster.spineCode] ?? 1;
    const visualH = Math.min(unit * kindMult * dbScale, this.layoutHeight * GUARD_MONSTER_VISUAL_H_CAP);
    return -unit * 0.45 + visualH;
  }

  /**
   * 大体型单位(BOSS/精英)身体盖到有英雄的格子时整体降到 55% 不透明(2026-09-18 用户拍板):
   * 英雄层已在怪物层之上,这里再让格位/脚下特效透出来;离开重叠区回到不透明,每帧渐变不闪。
   */
  private applyOccluderGhost(view: GuardUnitView, monster: GuardMonster): void {
    const sim = this.sim;
    if (!sim) {
      return;
    }
    const unit = this.unitSize();
    const bodyH = this.monsterHeadOffsetY(monster) + unit * 0.45;
    const halfW = bodyH * 0.4;
    const footY = view.node.position.y - unit * 0.45;
    const topY = footY + bodyH;
    const bx = view.node.position.x;
    const heroSize = this.heroDisplaySize();
    let overlap = false;
    for (const hero of sim.heroes) {
      const tile = this.cellTileRect(hero.cell);
      const center = this.cellCenter(hero.cell);
      const heroBottom = tile.y - tile.h / 2;
      const heroTop = center.y + heroSize * 0.55;
      if (Math.abs(tile.x - bx) < halfW + tile.w / 2 && heroBottom < topY && heroTop > footY) {
        overlap = true;
        break;
      }
    }
    const opacity = view.node.getComponent(UIOpacity) ?? view.node.addComponent(UIOpacity);
    const target = overlap ? 140 : 255;
    const delta = target - opacity.opacity;
    if (delta !== 0) {
      opacity.opacity += Math.max(-16, Math.min(16, delta));
    }
  }

  /**
   * 怪物层级按纵深排序(2026-09-11 用户反馈:BOSS 身后远车道的小怪画在了 BOSS 身上):
   * 屏幕越靠上(y 越大)越远,先画;只在怪物节点已占的兄弟槽位内重排,不动英雄/特效层级。
   */
  private sortMonsterViewsByDepth(): void {
    const views = [...Array.from(this.monsterViews.values())].filter((view) => view.node.isValid && view.node.parent);
    if (views.length < 2) {
      return;
    }
    const slots = views.map((view) => view.node.getSiblingIndex()).sort((a, b) => a - b);
    views.sort((a, b) => b.node.position.y - a.node.position.y);
    views.forEach((view, index) => {
      if (view.node.getSiblingIndex() !== slots[index]) {
        view.node.setSiblingIndex(slots[index]);
      }
    });
  }

  /** BOSS 顶部大血条(视频验收:×6 体型配 220px 小条看不见):取当前存活最强 BOSS,画在波次标题下方。 */
  private refreshBossTopBar(): void {
    const sim = this.sim;
    const hud = this.root?.getChildByName('GuardHud');
    const bar = hud?.getChildByName('GuardBossTopBar');
    const g = bar?.getComponent(Graphics);
    const label = bar?.getChildByName('GuardBossTopBarText')?.getComponent(Label);
    if (!sim || !bar || !g || !label) {
      return;
    }
    const boss = sim.monsters.find((entry) => entry.kind === 'boss' && !entry.dead) ?? null;
    g.clear();
    // 2026-09-18 用户拍板:BOSS 血条改锚头顶(syncMonsters 里画),顶部横幅只留名字。
    if (!boss || GUARD_BOSS_BAR_ON_HEAD) {
      label.string = '';
      return;
    }
    const barW = 460;
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    g.fillColor = rgba(10, 8, 8, 225);
    g.roundRect(-barW / 2, -11, barW, 22, 10);
    g.fill();
    g.fillColor = ratio > 0.35 ? rgba(235, 60, 45, 250) : rgba(255, 140, 60, 250);
    g.roundRect(-barW / 2, -11, Math.max(8, barW * ratio), 22, 10);
    g.fill();
    g.strokeColor = rgba(255, 200, 120, 235);
    g.lineWidth = 2;
    g.roundRect(-barW / 2, -11, barW, 22, 10);
    g.stroke();
    label.string = `BOSS  ${Math.ceil(boss.hp)} / ${boss.maxHp}`;
  }

  private createMonsterView(monster: GuardMonster): GuardUnitView {
    const field = this.fieldNode;
    const unit = this.unitSize();
    const kindMult = GUARD_MONSTER_DISPLAY_SCALE[monster.kind] ?? 1;
    const baseSize = unit * kindMult;
    const node = this.host.addChildPlainNode(field ?? this.host.node, `GuardMonster_${monster.monsterId}`, this.xToPx(monster.x), this.monsterY(monster.lane, monster.x), baseSize, baseSize);
    // 2026-09-18 用户拍板:英雄层永远在怪物层之上(BOSS 再大也盖不住上排英雄)——新怪插到第一个英雄节点之前。
    if (field) {
      const firstHero = field.children.findIndex((child) => child.name.startsWith('GuardHero_'));
      if (firstHero >= 0) {
        node.setSiblingIndex(firstHero);
      }
    }
    // 地面阴影:近黑素材在暖色地面上的剪影分离。
    // 2026-10-07 由 Graphics 改为共享柔光贴图精灵:每只怪一个 Graphics = 一份独立显存缓冲 + 一次不能合批的绘制。
    const shadowW = Math.min(baseSize, unit * 2.4) * 0.68;
    const shadow = this.mountSoftShade(node, 'GuardMonsterShadow', 0, -unit * 0.45, shadowW, Math.max(6, unit * 0.15), 'blob');
    const shadowSprite = shadow?.getComponent(Sprite);
    if (shadowSprite) {
      shadowSprite.color = rgba(255, 255, 255, 170);
    }
    shadow?.setSiblingIndex(0);
    const fallback = this.host.addChildPlainNode(node, 'GuardMonsterFallback', 0, 0, baseSize * 0.6, baseSize * 0.7);
    const g = fallback.addComponent(Graphics);
    g.fillColor = monster.kind === 'boss' ? rgba(190, 70, 60, 200) : monster.kind === 'elite' ? rgba(200, 130, 60, 190) : rgba(120, 96, 88, 180);
    g.roundRect(-baseSize * 0.3, -baseSize * 0.35, baseSize * 0.6, baseSize * 0.7, 8);
    g.fill();
    // 怪物朝左走:素材原始朝右为主,镜像面向水晶。目录名≠文件基名,走映射表。
    // 体型 = 标定视高(unit×体型倍率×DB逐皮肤校准,BOSS 钳 0.72 屏高)/ bounds 高——与旧战斗渲染同一公式;
    // S196 素材原点=脚底中心,直接脚踩地面线,不吃 bounds 偏移。
    const dbScale = GUARD_MONSTER_DB_SCALE[monster.spineCode] ?? 1;
    // BOSS 视高钳 0.62→0.52 屏高(2026-09-18:原尺寸头顶出屏、整排上格被盖)。
    const targetVisualH = Math.min(unit * kindMult * dbScale, this.layoutHeight * GUARD_MONSTER_VISUAL_H_CAP);
    const view: GuardUnitView = { node, spineReady: false, lastAnimKey: '', skeleton: null, idleAnim: '', attackAnim: '', deathAnim: '', hitFlashUntil: 0 };
    if (monster.kind === 'boss') {
      view.centerOffsetX = (GUARD_BOSS_ANIMS[monster.spineCode]?.centerX ?? 0) * targetVisualH;
    }
    this.loadSpineInto(node, fallback, guardMonsterSpineResource(monster.spineCode), baseSize, true, view, {
      calibratedScale: (rawBoundsHeight) => targetVisualH / rawBoundsHeight,
      footY: -unit * 0.45,
      enemyAnimNames: true,
      sharedCache: monster.kind !== 'boss',
    });
    // BOSS 血条锚在头顶(2026-09-18 用户拍板,不再走顶部横幅):头顶再往上 18px,并钳在屏内。
    const hpBarY = monster.kind === 'boss'
      ? Math.min(this.monsterHeadOffsetY(monster) + 18, this.layoutHeight * 0.47 - node.position.y)
      : Math.min(baseSize * 0.58, this.layoutHeight * 0.4);
    if (monster.kind !== 'boss') {
      // 小怪血条(2026-10-09):不再每只怪一个 Graphics;受伤后在共享条层里用白贴图精灵画,全部合成一次绘制
      view.hpBarOffsetY = hpBarY;
      view.hpBarW = Math.min(baseSize * 0.9, 110);
      return view;
    }
    const hpBar = this.host.addChildPlainNode(node, 'GuardMonsterHp', 0, hpBarY, 280, 14);
    hpBar.addComponent(Graphics);
    if (monster.kind === 'boss') {
      const hpText = this.host.addChildLabel(hpBar, 'GuardMonsterHpText', '', 0, 0, 13, rgba(255, 244, 230, 252), new Size(260, 18));
      hpText.enableOutline = true;
      hpText.outlineColor = rgba(40, 12, 8, 255);
      hpText.outlineWidth = 2;
    }
    return view;
  }

  // ── 终局覆盖层与结算 ──
  private showEndOverlay(victory: boolean): void {
    if (this.overlayShown || !this.root) {
      return;
    }
    this.overlayShown = true;
    gameAudio.sfx(victory ? 'victory' : 'defeat');
    const width = this.layoutWidth;
    const height = this.layoutHeight;
    const sim = this.sim;
    const rush = sim?.mode === 'rush';
    const raid = sim?.mode === 'raid';
    if (raid && sim && !sim.raidClear && this.serverRaid && this.raid) {
      // docs/61(原型 result_b):结果 + 奖励 + 我方 / 敌方输出对比;按钮等结算回执到了再挂
      const overlay = this.host.addChildPlainNode(this.root, 'GuardEndOverlay', 0, 0, width, height);
      overlay.addComponent(BlockInputEvents);
      const g = overlay.addComponent(Graphics);
      // 原型 result_b:战场压暗约 60%,战斗 HUD 由控制器藏掉
      g.fillColor = rgba(6, 8, 12, 196);
      g.rect(-width / 2, -height / 2, width, height);
      g.fill();
      this.raid.mountResult(overlay, sim, victory, width, height);
      return;
    }
    // 2026-11-11 B 毛玻璃(原型 周报截图/2026-11-11_守卫战弹层/proto/guard_result_b.png 1:1):面板 910×613,
    // 居中大标题 + 胜负签(WIN 绿 / LOSE 红,同掠夺结算)+ 战况一行 + 分隔线 →「本场奖励」分区 + 物品格(结算回执到了再挂)→ 说明一行 →「返回大厅」。
    const W = GUARD_END_W;
    const shell = this.mountGuardGlass('GuardEndOverlay', W, GUARD_END_H, { bare: true });
    if (!shell) {
      return;
    }
    this.endShell = shell;
    const { overlay, panel, S, X, Y, T } = shell;
    const clear = !!sim?.raidClear;
    const title = clear ? (victory ? '清除完成!' : '撤退…') : raid ? (victory ? '掠夺成功!' : '掠夺失败') : rush ? '试炼结束!' : victory ? '守卫成功!' : '水晶破碎…';
    const detail = sim
      ? clear
        ? `击败 ${sim.heroes.filter((hero) => hero.dead).length}/${sim.heroes.length} · 用时 ${formatGuardDuration(sim.timeMs)}`
        : raid
        ? `击倒守卫 ${sim.heroes.filter((hero) => hero.dead).length}/${sim.heroes.length} · 水晶剩余 ${Math.round((sim.crystalHp / sim.crystalMaxHp) * 100)}% · 用时 ${formatGuardDuration(sim.timeMs)}`
        : rush
          ? `层数 ${guardTrialLayers(sim)}(BOSS×${sim.bossKills} + 波次 ${sim.wave})· 击杀 ${sim.killCount} · 用时 ${formatGuardDuration(sim.timeMs)}`
          : `坚守 ${sim.wave} 波 · 击杀 ${sim.killCount} · 用时 ${formatGuardDuration(sim.timeMs)}`
      : '';
    // 标题(字号 50 粗)+ 签(高 36,字号 18;胜绿 / 败红 / 试炼香槟)整组居中,行中 dy 55
    const good = victory || rush;
    const tagText = rush ? `${sim ? guardTrialLayers(sim) : 0} 层` : victory ? 'WIN' : 'LOSE';
    const tagColor = rush ? GLASS_COLOR.champagne : victory ? new Color(110, 214, 120, 255) : new Color(236, 104, 92, 255);
    const titleW = estimateGlassTextWidth(title, 50);
    const tagW = estimateGlassTextWidth(tagText, 20) + 30;
    const groupLeft = W / 2 - (titleW + 20 + tagW) / 2;
    if (good && LOBBY_UI_FX.victoryTitle) {
      // docs/29 v3:胜利标题背后金色光丝聚拢再炸开(一次性);失败不放
      const titleFx = LOBBY_UI_FX.victoryTitle;
      const titleFxHolder = this.host.addChildPlainNode(overlay, 'GuardEndTitleFx', X(W / 2), Y(55), 10, 10);
      titleFxHolder.setSiblingIndex(1);
      mountLobbySpineFx(this.host, titleFxHolder, titleFx, 0, 0, 300 * titleFx.size, titleFx.loop, titleFx.holdMs);
    }
    T(panel, 'GuardEndTitle', title, X(groupLeft), Y(55), 50, GLASS_COLOR.text, S(titleW + 40), HorizontalTextAlignment.LEFT, true);
    const tag = this.host.addChildPlainNode(panel, 'GuardEndTag', X(groupLeft + titleW + 20 + tagW / 2), Y(57), S(tagW), S(36));
    const tg = tag.addComponent(Graphics);
    tg.fillColor = new Color(tagColor.r * 0.16, tagColor.g * 0.16, tagColor.b * 0.16, 200);
    tg.roundRect(-S(tagW) / 2, -S(18), S(tagW), S(36), S(8));
    tg.fill();
    tg.strokeColor = tagColor;
    tg.lineWidth = Math.max(1.2, S(2));
    tg.roundRect(-S(tagW) / 2, -S(18), S(tagW), S(36), S(8));
    tg.stroke();
    const tagLabel = T(tag, 'Text', tagText, 0, 0, 20, tagColor, S(tagW - 10), HorizontalTextAlignment.CENTER, true);
    tagLabel.fontSize = Math.max(12, Math.round(S(20)));
    T(panel, 'GuardEndDetail', detail, X(W / 2), Y(112), 24, GLASS_COLOR.sub, S(W - 120), HorizontalTextAlignment.CENTER);
    mountGlassLine(this.kit, panel, 'GuardEndDivider', 0, Y(149), S(W - 104), Math.max(1, S(1.5)), new Color(150, 158, 172, 70));
    mountGlassSectionHeader(this.kit, panel, 'GuardEndRewardHead', '本场奖励', X(57), Y(187), shell.k, 26);
    // near-miss 提示(P3b,2026-09-04):本场档位 + 差几层升下一档(分=层×100,镜像后端 TrialRules.SCORE_PER_LAYER);放在分区标题右侧。
    if (rush && sim) {
      const layers = guardTrialLayers(sim);
      const score = Math.min(layers, 60) * 100;
      const tiers = (this.host.currentTrialOutputTiers?.() ?? []).slice().sort((a, b) => a.minScore - b.minScore);
      if (tiers.length > 0) {
        let current = tiers[0];
        let next: { tierCode: string; tierName: string; minScore: number } | null = null;
        for (const tier of tiers) {
          if (score >= tier.minScore) {
            current = tier;
          } else {
            next = tier;
            break;
          }
        }
        const nearMiss = next
          ? `本场 ${current.tierName}(${current.tierCode})档 · 再多 ${Math.ceil((next.minScore - score) / 100)} 层升 ${next.tierName}(${next.tierCode})档!`
          : `本场 ${current.tierName}(${current.tierCode})档 · 已是最高档!`;
        T(panel, 'GuardEndNearMiss', nearMiss, X(W - 52), Y(187), 19, next ? GLASS_COLOR.green : GLASS_COLOR.champagne, S(560), HorizontalTextAlignment.RIGHT);
      }
    }
    // 结算说明:回执前「正在提交结算…」放在物品格区中间;回执到了挪到 dy 476
    const localRaid = raid && !this.serverRaid;
    const settle = T(panel, 'GuardEndSettle', localRaid ? 'P0 原型:本地模拟,不结算、不发奖' : '正在提交结算…', X(W / 2), Y(320), 20, GLASS_COLOR.sub, S(W - 120), HorizontalTextAlignment.CENTER);
    settle.enableWrapText = true;
    settle.node.getComponent(UITransform)?.setContentSize(S(W - 120), S(56));
    if (localRaid) {
      mountGlassButton(this.kit, panel, 'GuardRaidBack', '返回主城', X(W / 2), Y(546.5), S(327), S(65), shell.k, 'primary', () => this.host.returnToLobbyFromBattlePreview(), 30);
    }
  }

  /** NPC 矿可「再来一次」;真人矿有 24 小时限制,只回矿境。 */
  private selectedRaidRetryable(): boolean {
    return /^RAID_\d+$/i.test(this.host.currentLobbyBattleState().start?.stageCode ?? '');
  }

  /** 结算回执到达:更新覆盖层为奖励与返回按钮。 */
  private refreshEndOverlay(): void {
    const root = this.root;
    if (!root || !this.overlayShown) {
      return;
    }
    const battleState = this.host.currentLobbyBattleState();
    const overlay = root.getChildByName('GuardEndOverlay');
    if (!overlay) {
      return;
    }
    if (overlay.getChildByName('GuardRaidResult') && this.raid) {
      this.raid.refreshResult(overlay, battleState, this.selectedRaidRetryable(), (retry) => {
        if (this.host.returnToLobbyRaidPanel) {
          this.host.returnToLobbyRaidPanel(retry);
        } else {
          this.host.returnToLobbyFromBattlePreview();
        }
      });
      return;
    }
    const shell = this.endShell;
    if (!shell || shell.overlay !== overlay) {
      return;
    }
    const { panel, k, S, X, Y, T } = shell;
    const settleLabel = panel.getChildByName('GuardEndSettle')?.getComponent(Label);
    if (battleState.settling && settleLabel) {
      settleLabel.string = '正在提交结算…';
      return;
    }
    if (battleState.error && settleLabel) {
      settleLabel.string = `结算失败:${battleState.error}`;
    }
    const settlement = battleState.settlement;
    if (!settlement || panel.getChildByName('GuardEndBack')) {
      return;
    }
    const W = GUARD_END_W;
    const items = (settlement.rewardItems ?? []).filter((item) => item.amount > 0).slice(0, 6);
    if (settleLabel) {
      settleLabel.string = settlement.message || (settlement.rewardGranted ? '奖励已发放。' : '本场未产生奖励。');
      if (items.length > 0) {
        settleLabel.node.setPosition(X(W / 2), Y(476), 0);
      }
    }
    // 物品格:136 见方,中心 dy 295,格距 201(5~6 件时收到 112 / 142),整排居中;格底稀有度细线,格下数量(28 粗白)+ 名字(20 灰)
    const n = items.length;
    const box = n <= 4 ? 136 : 112;
    const pitch = n <= 4 ? 201 : 142;
    const firstCx = W / 2 - ((n - 1) * pitch) / 2;
    items.forEach((item, index) => {
      const cx = firstCx + index * pitch;
      const rarity = this.host.itemSourceRarityOf?.(item.resourceCode) ?? '';
      const frame = mountGlassFrame(this.kit, panel, `GuardEndReward_${index}`, X(cx), Y(295), S(box), S(box), k);
      const icon = resolveBagStyleItemIconAsset(item.resourceCode, item.resourceType, rarity);
      if (icon) {
        // 用本渲染器的 mountSprite(缓存命中同步套用、未命中直载):宿主 addSprite 在手机预览里实测 7 秒仍有图标没挂上
        this.mountSprite(frame, 'Icon', icon, 0, S(2), S(box * 0.8), S(box * 0.8));
      }
      mountGlassLine(this.kit, frame, 'Rarity', 0, -S(box / 2 - 4), S(box - 8), Math.max(2, S(4)), guardRewardRarityColor(rarity, item.resourceCode));
      T(panel, `GuardEndRewardAmount_${index}`, `×${formatInt(item.amount)}`, X(cx), Y(295 + box / 2 + 27), 28, GLASS_COLOR.text, S(pitch - 6), HorizontalTextAlignment.CENTER, true);
      T(panel, `GuardEndRewardName_${index}`, item.resourceName ?? item.resourceCode, X(cx), Y(295 + box / 2 + 61), 20, GLASS_COLOR.sub, S(pitch - 6), HorizontalTextAlignment.CENTER);
    });
    mountGlassButton(this.kit, panel, 'GuardEndBack', this.sim?.raidClear ? '返回地图' : '返回大厅', X(W / 2), Y(546.5), S(327), S(65), k, 'primary', () => this.host.returnToLobbyFromBattlePreview(), 30);
  }
}

/** 结算用时 m:ss(原型「用时 3:42」)。 */
function formatGuardDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** 结算物品格底边稀有度色(背包格同款;查不到稀有度时金币 / 货币用灰,其余按编码里的档位词兜底)。 */
function guardRewardRarityColor(rarity: string, code: string): Color {
  const key = (rarity || '').toUpperCase();
  const upper = code.toUpperCase();
  const tier = key || (/_(UR|SSR)\b|LEGEND/.test(upper) ? 'SSR' : /_(SR|EPIC)\b|ADVANCED|HIGH/.test(upper) ? 'SR' : /_(R|RARE)\b/.test(upper) ? 'R' : '');
  return tier === 'UR' || tier === 'SSR' ? new Color(240, 163, 52, 255)
    : tier === 'SR' || tier === 'EPIC' ? new Color(186, 84, 246, 255)
      : tier === 'R' || tier === 'RARE' ? new Color(52, 132, 242, 255) : new Color(150, 158, 170, 255);
}
