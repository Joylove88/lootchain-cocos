import {
  Button,
  EventKeyboard,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  Input,
  KeyCode,
  Label,
  Mask,
  Node,
  Size,
  Sprite,
  UIOpacity,
  UITransform,
  Vec2,
  Tween,
  Vec3,
  input,
  sp,
  tween,
} from 'cc';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';
import type { LobbyBadges } from '../../api/LobbyBadgeApi';
import type { PlayerIdleSummaryVO } from '../../types/IdleTypes';
import { safeText } from '../UiTextFormatter';
import { isPhoneDesign } from '../../app/ScreenAdapter';
import { lobbyGuide, type GuideFlag } from '../../guide/GuideManager';
import { rgba, type LobbyHudHost, type UiLayout } from './LobbyHudTypes';
import {
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineAnimationNames,
  resolveBattleUnitSpineMirrorScaleX,
  resolveBattleUnitSpineNodePosition,
  resolveBattleUnitSpineResource,
  resolveBattleUnitSpineRuntimeData,
  resolveBattleUnitSpineScale,
  resolveBattleUnitSpineSkinName,
  type BattleUnitSpineAnimationNames,
} from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import { TOWN_SPAWN } from './LobbyTownConfig';
import { TownWaypointFx } from './LobbyTownWaypointFx';
import { REF_PLATE_DARK, mountRefSliced } from '../UiRefKit';
import { TOWN_HUD_ASSETS, TOWN_MINIMAP_BUILDING_ICONS, mountRingBase, townProtoFrame } from './LobbyTownHudProto';
import { GLASS_SLICES, mountGlassSlice } from '../UiGlassKit';
import { GUARD_MONSTER_DB_SCALE } from './GuardBattleModel';
import { mountHeroAvatar } from './HeroHeadCrop';
import { TownCombatFx, resolveTownHeroFxKit, type TownHeroFxKit } from './LobbyTownCombatFx';
import { resolveGuardMonsterProjectileFx, resolveHeroAttackSfxKey, resolveHeroSkillSfxKey } from './LobbyBattleAttackFxConfig';
import { gameAudio } from '../../audio/GameAudio';
import { TownAmbient } from './LobbyTownAmbient';
import { applyWorldShader, isSwayAsset, updateWorldShaderOrigin } from './LobbyWorldShaders';
import { worldMapDef, type WorldMapBuilding, type WorldMapCamp, type WorldMapDef, type WorldMapExit, type WorldNpcCode } from './LobbyWorldMaps';
import type { WorldMapCode, WorldStateVO } from '../../types/WorldTypes';

/**
 * 主城跑图渲染器(2026-10-25,原型 v7):
 * - 世界节点 `LobbyTownWorld` 登记为可复用顶层节点:整页重绘时被摘下暂存、回大厅原样挂回,位置 / 骨骼动画都不丢;
 * - HUD(摇杆 / 进入钮 / 底栏 / 小地图 / 引导追踪)每次 render 重建,引用在 renderHud 里刷新;
 * - step(dt) 由 GameRoot.update 在大厅视图时驱动:移动 / 碰撞 / 跟随 / 镜头 / 前后遮挡 / 门口判定。
 * 角色只翻左右(现有英雄骨骼全是侧面视角);动画有 run 用 run,没有就 idle 走。
 */
export interface LobbyTownHost extends LobbyHudHost {
  /** docs/48:冒险之门 = 矿境面板(NPC 矿列表 → 掠夺)。 */
  openLobbyRaidPanel?(): void;
  /** docs/47 P0:本地掠夺原型(无服务端时的回退)。 */
  startRaidPrototype?(): void;
  currentIdleSummary?(): PlayerIdleSummaryVO | null;
  isIdleClaiming?(): boolean;
  claimIdleReward?(): void;
  /** docs/50 跑图世界:世界状态 / NPC 对话 / 世界地图 / 野外开战 / 出口换图 / 传送阵激活 / 回城。 */
  currentWorldState?(): WorldStateVO | null;
  openWorldNpcDialog?(npc: WorldNpcCode): void;
  openWorldMapPanel?(): void;
  startWorldFieldBattle?(stageCode: string): void;
  travelWorldMap?(code: WorldMapCode, spawn: { x: number; y: number } | null, reach?: string): void;
  activateWorldWaypoint?(code: WorldMapCode): void;
  openWorldQuestTracker?(): void;
  openWorldBountyPanel?(): void;
  /** docs/50 §14 野外即时战斗:登记遭遇(下发数值)/ 清怪上报 / 队长倒下。 */
  engageWorldField?(stageCode: string): Promise<TownFieldEncounter | null>;
  clearWorldField?(encounterId: number, stageCode: string, onRewards?: (items: Array<{ name: string; amount: number }>, capped: boolean) => void): void;
}

export interface TownFieldEncounter {
  encounterId: number;
  stageCode: string;
  raiderAttack: number;
  raiderHp: number;
  monsters: Array<{ monsterCode: string; monsterName: string; hp: number; hit: number; ranged: boolean }>;
  teamAttack: number;
  companions: Array<{ heroId: number; heroCode: string; attack: number; hp: number }>;
}

export interface TownGuideTarget {
  /** 主城建筑(旧引导);或 point = 地图上任意目标点(docs/50 任务追踪)。 */
  building: string;
  point?: { x: number; y: number; label: string };
  text: string;
  /** 软引导:进了这栋建筑就算看过。 */
  flag?: GuideFlag;
}

interface TownActor {
  node: Node;
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  skeleton: sp.Skeleton | null;
  spineNode: Node | null;
  names: BattleUnitSpineAnimationNames | null;
  baseScaleX: number;
  baseScaleY: number;
  anim: string | null;
  /** 程序画的脚底椭圆影;骨骼自带影子插槽(Shadow / ying)时清掉,避免脚下两个影子。 */
  shadow: Graphics | null;
  /** 跟随者:连续没位移的时长,超过阈值才切待机(防跑 / 停动画来回闪)。 */
  idleFor: number;
  /** 跟随者:反方向累计位移,超过阈值才翻面(防左右闪)。 */
  faceAcc: number;
  hero: LobbyHeroItemVO;
  // docs/51 §6 队友自动战斗(队长的血量走 leaderHp,这几项只给队友用)
  role: 'melee' | 'ranged' | 'support';
  hp: number;
  maxHp: number;
  attack: number;
  down: boolean;
  downUntil: number;
  nextAttackAt: number;
  skillReadyAt: number;
  /** 出手动画锁定到的时间;期间不切跑 / 待机。 */
  actionUntil: number;
  inAction: boolean;
  target: TownMonster | null;
  thinkAt: number;
  /** §3 援护技(点头像放大招)就绪时间 */
  assistReadyAt: number;
  /** 一次性动作(攻击 / 技能)播完的时刻;动作后已用 addAnimation 排好的循环动画名(播完不再 setAnimation 重播) */
  oneShotEnd: number;
  loopAfter: string | null;
}

interface TownBuildingEntity {
  cfg: WorldMapBuilding;
  node: Node;
  plate: Node | null;
  sprite: Sprite | null;
  /** 队伍走到建筑后面被挡住时把建筑淡成半透明(当前不透明度,逐帧逼近目标)。 */
  fade: number;
}

const HERO_SLOT_W = 180;
const HERO_SLOT_H = 230;
const LEADER_SPEED = 340;
const FOLLOW_SAMPLE = 8;
const FOLLOW_GAP_SAMPLES = 16;
/** 队员之间沿队长足迹的间距(世界单位);出生站位也用它,起步不会往回走。 */
const FOLLOW_SPACING = 112;
/** 被挡住时建筑的不透明度。 */
const BUILDING_SEE_THROUGH_OPACITY = 120;
const INTERACT_RADIUS = 180;
const ACTOR_RADIUS = 26;
const WORLD_NODE_NAME = 'LobbyTownWorld';
/** 明雷怪(docs/50):游走速度 / 追击速度 / 警戒半径 / 接触半径 / 战胜后刷新时长。 */
const MONSTER_WANDER_SPEED = 70;
const MONSTER_CHASE_SPEED = 190;
const MONSTER_AGGRO_RADIUS = 260;
const MONSTER_CONTACT_RADIUS = 72;
const MONSTER_RESPAWN_MS = 60_000;
const WAYPOINT_RADIUS = 150;
/** docs/51 §6 / §7:队友伤害折算(和后端 COMPANION_ATTACK_SHARE 同值,遭遇回来前的占位)、拉绳、闪现、复活、援护冷却;锁定 / 脱锁距离。 */
const FIELD_COMPANION_SHARE = 0.6;
const COMPANION_LEASH_DIST = 600;
const COMPANION_BLINK_DIST = 1000;
const COMPANION_REVIVE_MS = 8000;
const COMPANION_ASSIST_CD_MS = 20_000;
const LOCK_ACQUIRE_DIST = 600;
const LOCK_BREAK_DIST = 700;
/** docs/51 P2:长按 0.5 秒换队长、换完 3 秒公共冷却;破防持续 3 秒、每击累积 = 伤害占血量比 × 2.2(重击 ×1.5);战利品 5 分钟没捡自动结算(遭遇 10 分钟过期) */
const SWAP_HOLD_MS = 500;
const SWAP_CD_MS = 3000;
const STAGGER_MS = 3000;
const STAGGER_GAIN = 2.2;
const LOOT_AUTO_MS = 5 * 60_000;
const LOOT_ICON = 'ui/bag/ai/icon_gold_chest/spriteFrame';
/** 怪物骨骼原图朝向(1 = 朝右);翻面时乘进 scaleX。 */
const MONSTER_ART_FACING: 1 | -1 = 1;

interface TownMonster {
  camp: WorldMapCamp;
  node: Node;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  tx: number;
  ty: number;
  nextPickAt: number;
  facing: 1 | -1;
  baseScale: number;
  skeleton: sp.Skeleton | null;
  spineNode: Node | null;
  idleAnim: string;
  moveAnim: string;
  moving: boolean;
  /** docs/50 §14 即时战斗:遭遇下发后才有血量;0 = 未登记。 */
  hp: number;
  maxHp: number;
  hit: number;
  ranged: boolean;
  dead: boolean;
  diedAt: number;
  nextAttackAt: number;
  windupUntil: number;
  attackAnim: string;
  deathAnim: string;
  hpBar: Graphics | null;
  hpDrawn: number;
  flashUntil: number;
  /** docs/51 §7:被打后 3 秒内显示细血条;锁定时显示名字 + 血条。 */
  lastHitAt: number;
  hpKey: string;
  nameLabel: Label | null;
  /** 当前追打的队员(队长或队友) */
  victim: TownActor | null;
  /** 伤害飘字防叠:450ms 内同一只怪的第 n 条往上 / 左右错开 */
  floatAt: number;
  floatSeq: number;
  /** docs/51 P2 破防条(只精英):受击累积 0..1,满了破防 3 秒(不动不攻、受伤 ×1.5),之后清零;2 秒没挨打开始回落 */
  stagger: number;
  staggeredUntil: number;
  /** 动画防抖(10-28 用户:「怪物待命动作不连贯,像没播完又重播」):当前循环名 / 一次性动作锁到 / 上次切换时刻 */
  curAnim: string;
  animLockUntil: number;
  moveSince: number;
  /** 受击击退速度(世界单位 / 秒,逐帧衰减) */
  kbVX: number;
  /** 远程怪弹道特效(GUARD_MONSTER_PROJECTILE_FX) */
  shotFx: { effect: string; animation: string; size: number } | null;
}

/** docs/51 P2 拾取:怪群清完掉落战利品袋,走到旁边出「拾取 · 战利品」提示,拾取时才向服务端结算发奖。 */
interface TownLoot {
  key: string;
  stageCode: string;
  encounterId: number;
  x: number;
  y: number;
  node: Node;
  spawnedAt: number;
}

type TownInteract =
  | { kind: 'building'; key: string; label: string; x: number; y: number; building: WorldMapBuilding }
  | { kind: 'npc'; key: string; label: string; x: number; y: number; npc: WorldNpcCode }
  | { kind: 'waypoint'; key: string; label: string; x: number; y: number }
  | { kind: 'loot'; key: string; label: string; x: number; y: number; loot: TownLoot };

/** 循环动画选取:先精确名,再"以名开头",最后包含关键词;都排除受击 / 攻击 / 死亡 / 过渡(link)/ 转身片段。 */
function pickTownLoopAnim(names: string[], exact: string[], fallback: RegExp): string | null {
  const bad = /beaten|attack|atk|hit|hurt|death|die|dead|link|turn|stun|down|air|spawn|explosion/i;
  for (const want of exact) {
    const hit = names.find((name) => name.toLowerCase() === want);
    if (hit) {
      return hit;
    }
  }
  for (const want of exact) {
    const hit = names.find((name) => name.toLowerCase().startsWith(want) && !bad.test(name));
    if (hit) {
      return hit;
    }
  }
  return names.find((name) => fallback.test(name) && !bad.test(name)) ?? null;
}

export class LobbyTownRenderer {
  static readonly WORLD_NODE_NAME = WORLD_NODE_NAME;

  private world: Node | null = null;
  private groundRoot: Node | null = null;
  private readonly ambient = new TownAmbient();
  private entityRoot: Node | null = null;
  private layout: UiLayout | null = null;
  private k = 1;
  private leader: TownActor | null = null;
  private followers: TownActor[] = [];
  private partySignature = '';
  private trail: Vec2[] = [];
  private buildings: TownBuildingEntity[] = [];
  private lampNodes: Node[] = [];
  /** 非贴地装饰(树 / 货箱 / 石凳):参与前后遮挡。 */
  private propNodes: Array<{ node: Node; y: number }> = [];
  private camX: number = TOWN_SPAWN.x;
  private camY: number = TOWN_SPAWN.y;
  private orderKey = '';
  private nearKey: string | null = null;
  private readonly keys = new Set<number>();
  private joy = { active: false, id: -1, dx: 0, dy: 0 };
  private inputBound = false;
  private hudScale = 1;
  // HUD 引用(每次 renderHud 重建)
  private joyBase: Node | null = null;
  private joyKnob: Node | null = null;
  private joyHome = new Vec3();
  private joyRadius = 70;
  private minimapMe: Node | null = null;
  private minimapScale = 0.04;
  private guide: TownGuideTarget | null = null;
  private guidePointer: Node | null = null;
  private trackerLabel: Label | null = null;
  /** docs/50:当前所在地图 + 切图后的出生点。 */
  private mapCode: WorldMapCode = 'CITY';
  private pendingSpawn: { x: number; y: number } | null = null;
  private npcNodes: Array<{ code: WorldNpcCode; node: Node; y: number }> = [];
  private waypointNode: Node | null = null;
  private waypointGlow: Graphics | null = null;
  private waypointFx: TownWaypointFx | null = null;
  private monsters: TownMonster[] = [];
  private readonly campRespawnAt = new Map<string, number>();
  private battleLock = false;
  private exitCooldownUntil = 0;
  private waypointReported = new Set<string>();
  private hudNode: Node | null = null;
  private promptRoot: Node | null = null;
  private minimapContent: Node | null = null;
  private minimapLastPos: { x: number; y: number } | null = null;
  private minimapBottomY = 0;
  private lastPlayerLevel = 0;
  private trackerBottomY = 0;
  private recallButton: Node | null = null;
  private hudLayout: UiLayout | null = null;
  /** 读条(传送 3 秒 / 回城 5 秒):移动打断。 */
  private channel: { startAt: number; endAt: number; label: string; onDone: () => void } | null = null;
  private channelBar: { node: Node; fill: Graphics; label: Label; w: number; h: number } | null = null;
  private bannerUntil = 0;
  private respawnCheckAt = 0;
  // docs/50 §14 野外即时战斗
  private readonly encounters = new Map<string, { id: number; pending: boolean }>();
  private raiderAttack = 0;
  private leaderHp = 0;
  private leaderMaxHp = 0;
  private leaderDead = false;
  private lastHurtAt = 0;
  private comboStep = 0;
  private comboUntil = 0;
  private actionUntil = 0;
  private dashUntil = 0;
  private dashSpeed = 0;
  private dashDir = { x: 1, y: 0 };
  private iframesUntil = 0;
  private dodgeReadyAt = 0;
  private readonly skillReadyAt = [0, 0, 0];
  // docs/51 打击感(10-28):特效 / 顿帧 / 震屏 / 连招输入缓冲
  private combatFxInst: TownCombatFx | null = null;
  private readonly fxKits = new Map<string, TownHeroFxKit>();
  private hitStopUntil = 0;
  private hitStopStart = 0;
  private readonly pausedSkeletons: sp.Skeleton[] = [];
  private shakeUntil = 0;
  private shakeAmp = 0;
  private shakeDur = 1;
  private leaderActionStart = 0;
  private bufferedInput: { kind: 'attack' } | { kind: 'skill'; index: number } | null = null;
  private pendingHits: Array<{ at: number; mult: number; reach: number; around: boolean; heavy: boolean; dashLine?: { x0: number; y0: number; x1: number; y1: number }; skill?: number; ranged?: boolean }> = [];
  private leaderActionAnim = false;
  private combatButtons: Array<{ node: Node; cd: Label | null; mask: Graphics | null; index: number; size: number; drawn: number; halo: Node | null; haloOn: boolean }> = [];
  // docs/51 队友自动战斗 / 目标锁定 / 野外 HUD
  private inCombat = false;
  private lastCombatAt = 0;
  private companionHits: Array<{ at: number; target: TownMonster; damage: number; heavy: boolean; actor?: TownActor; skillFx?: boolean }> = [];
  private lockTarget: TownMonster | null = null;
  private lockRing: Graphics | null = null;
  private lockArrow: Node | null = null;
  private leaderHitFlashUntil = 0;
  private leaderBar: { fill: Graphics; text: Label; name: Label; w: number; h: number; key: string } | null = null;
  private partySlots: Array<{ actor: TownActor; node: Node; shade: Graphics; cdRing: Graphics; count: Label; hp: Graphics; hpW: number; hpH: number; d: number; key: string; halo: Node | null; haloOn: boolean }> = [];
  private eliteBar: { node: Node; fill: Graphics; name: Label; stagger: Graphics; sw: number; sh: number; w: number; h: number; key: string } | null = null;
  // docs/51 P2:换队长 / 战利品
  private swapReadyAt = 0;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holdFired = false;
  private loots: TownLoot[] = [];

  constructor(private readonly host: LobbyTownHost) {}

  private get def(): WorldMapDef {
    return worldMapDef(this.mapCode);
  }

  currentMapCode(): WorldMapCode {
    return this.mapCode;
  }

  /** 切地图(docs/50 传送阵 / 出口 / 回城):销毁当前世界,下次 render 按新地图建;spawn 缺省 = 该图出生点。 */
  enterMap(code: WorldMapCode, spawn?: { x: number; y: number } | null): void {
    this.claimAllLoot();
    this.mapCode = code;
    this.pendingSpawn = spawn ?? { ...worldMapDef(code).spawn };
    this.exitCooldownUntil = Date.now() + 1500;
    this.battleLock = false;
    this.channel = null;
    this.bannerUntil = Date.now() + 2600;
    this.encounters.clear();
    this.pendingHits = [];
    this.leaderDead = false;
    this.actionUntil = 0;
    this.dashUntil = 0;
    if (this.leaderMaxHp > 0) {
      this.leaderHp = this.leaderMaxHp;
    }
    if (this.world && this.world.isValid) {
      this.world.destroy();
    }
    this.world = null;
    this.groundRoot = null;
    this.entityRoot = null;
    this.leader = null;
    this.followers = [];
    this.buildings = [];
    this.lampNodes = [];
    this.propNodes = [];
    this.npcNodes = [];
    this.waypointNode = null;
    this.waypointGlow = null;
    this.waypointFx = null;
    this.monsters = [];
    this.trail = [];
    this.partySignature = '';
    this.orderKey = '';
    this.camX = this.pendingSpawn.x;
    this.camY = this.pendingSpawn.y;
    this.keys.clear();
    this.joy = { active: false, id: -1, dx: 0, dy: 0 };
  }

  /** 野外战斗回来(docs/50):赢了这群怪 60 秒后再刷;输了把队伍推离营地,免得一回来又撞上。 */
  onFieldBattleEnd(stageCode: string, win: boolean): void {
    this.battleLock = false;
    if (win) {
      this.campRespawnAt.set(stageCode, Date.now() + MONSTER_RESPAWN_MS);
      this.monsters.filter((monster) => monster.camp.stageCode === stageCode).forEach((monster) => monster.node.isValid && monster.node.destroy());
      this.monsters = this.monsters.filter((monster) => monster.camp.stageCode !== stageCode);
      return;
    }
    const camp = this.def.camps.find((item) => item.stageCode === stageCode);
    const leader = this.leader;
    if (camp && leader) {
      const dx = leader.x - camp.x;
      const dy = leader.y - camp.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const push = camp.radius + MONSTER_AGGRO_RADIUS + 80;
      const nx = camp.x + (dx / len) * push;
      const ny = camp.y + (dy / len) * push;
      if (this.walkable(nx, ny)) {
        leader.x = nx;
        leader.y = ny;
        leader.node.setPosition(nx, ny, 0);
        this.followers.forEach((actor) => {
          actor.x = nx;
          actor.y = ny;
          actor.node.setPosition(nx, ny, 0);
        });
        this.trail = [new Vec2(nx, ny)];
      }
    }
  }

  /** 大厅渲染入口:世界节点已被 restoreNodes 挂回时 restored=true,只做补图 / 对齐,不重建。 */
  render(layout: UiLayout, restored: boolean): void {
    this.bindInput();
    const layoutChanged = !this.layout || this.layout.stageWidth !== layout.stageWidth || this.layout.stageHeight !== layout.stageHeight
      || this.layout.stageLeft !== layout.stageLeft || this.layout.stageBottom !== layout.stageBottom;
    this.layout = layout;
    this.k = layout.stageHeight / 900;
    if (!restored || !this.world || !this.world.isValid || !this.world.parent) {
      this.buildWorld();
    }
    this.ensureGround();
    this.ensureBuildings();
    this.ensureLamps();
    this.ensureProps();
    this.ensureNpcs();
    this.ensureWaypoint();
    this.ensureExits();
    this.ensureMonsters();
    this.ensureParty();
    if (layoutChanged) {
      this.world?.setScale(this.k, this.k, 1);
    }
    this.applyCamera(true);
    this.sortEntities(true);
    this.ensureAmbient();
  }

  /** 环境动效(飘叶 / 云影):地图开了 ambient 才挂;世界层重建后重挂。 */
  private ensureAmbient(): void {
    const world = this.world;
    if (!world || !world.isValid || !this.def.ambient || !this.layout) {
      this.ambient.destroy();
      return;
    }
    if (world.getChildByName('Ambient')) {
      return;
    }
    const view = this.viewSize();
    this.ambient.mount(world, this.def.width, this.def.height, this.camX, this.camY, view.w, view.h);
  }

  private viewSize(): { w: number; h: number } {
    const layout = this.layout!;
    return { w: Math.max(layout.width, layout.stageWidth) / this.k, h: Math.max(layout.height, layout.stageHeight) / this.k };
  }

  /** 是否已挂好世界节点(供 GameRoot 决定要不要驱动 step)。 */
  isMounted(): boolean {
    return !!this.world && this.world.isValid && !!this.world.parent;
  }

  /** 离开大厅 / 换账号时丢弃全部状态(世界节点由 contentRoot 自己销毁)。 */
  reset(): void {
    this.world = null;
    this.groundRoot = null;
    this.entityRoot = null;
    this.leader = null;
    this.followers = [];
    this.buildings = [];
    this.lampNodes = [];
    this.propNodes = [];
    this.npcNodes = [];
    this.waypointNode = null;
    this.waypointGlow = null;
    this.waypointFx = null;
    this.monsters = [];
    this.trail = [];
    this.partySignature = '';
    this.camX = TOWN_SPAWN.x;
    this.camY = TOWN_SPAWN.y;
    this.mapCode = 'CITY';
    this.pendingSpawn = null;
    this.battleLock = false;
    this.waypointReported.clear();
    this.keys.clear();
    this.joy = { active: false, id: -1, dx: 0, dy: 0 };
  }

  // ── 世界 ──

  private buildWorld(): void {
    if (this.world && this.world.isValid) {
      this.world.destroy();
    }
    const layout = this.layout!;
    const world = this.host.createUiNode(WORLD_NODE_NAME);
    const def = this.def;
    world.addComponent(UITransform).setContentSize(new Size(def.width, def.height));
    world.setScale(this.k, this.k, 1);
    this.world = world;
    this.groundRoot = this.host.addChildPlainNode(world, 'Ground', 0, 0, def.width, def.height);
    this.entityRoot = this.host.addChildPlainNode(world, 'Entities', 0, 0, def.width, def.height);
    this.buildings = [];
    this.lampNodes = [];
    this.propNodes = [];
    this.npcNodes = [];
    this.waypointNode = null;
    this.waypointGlow = null;
    this.waypointFx = null;
    this.monsters = [];
    this.leader = null;
    this.followers = [];
    this.trail = [];
    this.partySignature = '';
    this.orderKey = '';
    void layout;
  }

  private ensureGround(): void {
    const root = this.groundRoot;
    if (!root || !root.isValid) {
      return;
    }
    const def = this.def;
    const tileSize = def.groundTile;
    const cols = Math.ceil(def.width / tileSize) + 1;
    const rows = Math.ceil(def.height / tileSize) + 1;
    const x0 = -def.width / 2 - tileSize / 2;
    const y0 = -def.height / 2 - tileSize / 2;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const name = `Tile_${c}_${r}`;
        if (root.getChildByName(name)) {
          continue;
        }
        // 图没到时 addSprite 返回 null(并在到货后触发整刷),下次 render 再补
        const tile = this.host.addSprite(name, def.ground, x0 + c * tileSize + tileSize / 2, y0 + r * tileSize + tileSize / 2, tileSize + 1, tileSize + 1, root);
        if (tile) {
          // 无缝贴图不再逐格调明暗(会把平铺格子暴露出来);地砖永远排最底
          tile.node.setSiblingIndex(0);
        }
      }
    }
    if (!root.getChildByName('Vignette')) {
      // 地图外沿压暗:四周一圈渐变(16 层低透明度叠出平滑过渡;10-27 用户:原来 6 层 × 70 叠成一条硬黑边)
      const g = this.host.addChildPlainNode(root, 'Vignette', 0, 0, def.width, def.height).addComponent(Graphics);
      const band = 220;
      const w = def.width;
      const h = def.height;
      for (let i = 0; i < 16; i += 1) {
        const inset = (band / 16) * i;
        g.fillColor = rgba(4, 4, 8, 9);
        g.rect(-w / 2 + inset, h / 2 - band + inset, w - inset * 2, band - inset);
        g.rect(-w / 2 + inset, -h / 2, w - inset * 2, band - inset);
        g.rect(-w / 2, -h / 2, band - inset, h);
        g.rect(w / 2 - band + inset, -h / 2, band - inset, h);
        g.fill();
      }
    }
  }

  private ensureBuildings(): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      return;
    }
    const badges = this.host.currentLobbyBadges?.() ?? null;
    for (const cfg of this.def.buildings) {
      let entity = this.buildings.find((item) => item.cfg.key === cfg.key);
      if (!entity || !entity.node.isValid) {
        const node = this.host.addChildPlainNode(root, `TownBuilding_${cfg.key}`, cfg.x, cfg.y, cfg.footprint.w, cfg.footprint.d);
        entity = { cfg, node, plate: null, sprite: null, fade: 255 };
        this.buildings = this.buildings.filter((item) => item.cfg.key !== cfg.key).concat(entity);
      }
      if (!entity.sprite || !entity.sprite.isValid) {
        const sprite = this.host.addSprite('Art', cfg.asset, 0, 0, cfg.width, cfg.width, entity.node);
        if (sprite) {
          const frame = sprite.spriteFrame;
          const ow = frame?.originalSize.width ?? 1;
          const oh = frame?.originalSize.height ?? 1;
          const h = cfg.width * (oh / Math.max(1, ow));
          sprite.node.getComponent(UITransform)?.setContentSize(new Size(cfg.width, h));
          sprite.node.setPosition(0, h / 2, 0);
          // 名牌挂在图顶上方;图没到前不挂,免得浮在空地上
          entity.sprite = sprite;
          entity.plate?.destroy();
          // 纯装饰建筑(水井 / 村口)不挂名牌
          entity.plate = cfg.action === 'none' ? null : this.mountPlate(entity.node, cfg, h + 36, this.buildingBadge(cfg.key, badges));
        }
      } else if (entity.plate) {
        const dot = entity.plate.getChildByName('Dot');
        if (dot) {
          dot.active = this.buildingBadge(cfg.key, badges);
        }
      }
    }
  }

  private ensureProps(): void {
    const ground = this.groundRoot;
    const entities = this.entityRoot;
    if (!ground || !ground.isValid || !entities || !entities.isValid) {
      return;
    }
    this.def.props.forEach((prop, index) => {
      const name = `TownProp_${index}`;
      const parent = prop.flat ? ground : entities;
      if (parent.getChildByName(name)) {
        return;
      }
      const node = this.host.addChildPlainNode(parent, name, prop.x, prop.y, prop.width, prop.width);
      const sprite = this.host.addSprite('Art', prop.asset, 0, 0, prop.width, prop.width, node);
      if (!sprite) {
        node.destroy();
        return;
      }
      const frame = sprite.spriteFrame;
      const ow = frame?.originalSize.width ?? 1;
      const oh = frame?.originalSize.height ?? 1;
      const h = prop.width * (oh / Math.max(1, ow)) * (prop.flat ? prop.tilt ?? 1 : 1);
      sprite.node.getComponent(UITransform)?.setContentSize(new Size(prop.width, h));
      if (prop.angle) {
        node.angle = prop.angle;
      }
      if (prop.flipX) {
        sprite.node.setScale(-1, 1, 1);
      }
      if (prop.flat) {
        // 贴地:中心对齐,排在地砖之后、压暗层之前
        sprite.node.setPosition(0, 0, 0);
        if (prop.water) {
          applyWorldShader(sprite, 'water');
        }
        const vignette = ground.getChildByName('Vignette');
        if (vignette) {
          node.setSiblingIndex(vignette.getSiblingIndex());
        }
        return;
      }
      sprite.node.setPosition(0, h / 2, 0);
      if (prop.sway ?? isSwayAsset(prop.asset)) {
        applyWorldShader(sprite, 'wind');
      }
      this.propNodes.push({ node, y: prop.y });
    });
  }

  private mountPlate(parent: Node, cfg: { label: string }, y: number, badge: boolean): Node {
    const w = Math.max(150, cfg.label.length * 30 + 60);
    const h = 46;
    const plate = this.host.addChildPlainNode(parent, 'Plate', 0, y, w, h);
    // B 风格(10-29):暗玻璃胶囊 + 浅细边,白字(原旧金框菱形名牌)
    mountGlassSlice(this.host as never, plate, 'Bg', GLASS_SLICES.hudCapsule, 0, 0, w, h, h / 48);
    const label = this.host.addChildLabel(plate, 'Label', cfg.label, 0, 1, 24, rgba(240, 242, 246), new Size(w - 40, 34));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 200);
    label.outlineWidth = 2;
    const dot = this.host.addChildPlainNode(plate, 'Dot', w / 2 - 4, h / 2 - 4, 16, 16);
    const dg = dot.addComponent(Graphics);
    dg.fillColor = rgba(200, 32, 40, 240);
    dg.circle(0, 0, 7);
    dg.fill();
    dg.strokeColor = rgba(255, 210, 200, 220);
    dg.lineWidth = 1.5;
    dg.circle(0, 0, 7);
    dg.stroke();
    dot.active = badge;
    // 名牌不随世界前后排序遮挡:始终盖在建筑图上(同节点内,图先挂)
    plate.setSiblingIndex(parent.children.length - 1);
    return plate;
  }

  private buildingBadge(key: string, badges: LobbyBadges | null): boolean {
    if (!badges) {
      return false;
    }
    switch (key) {
      case 'camp': return badges.heroGrowable;
      case 'hall': return badges.codex > 0;
      case 'guild': return badges.quest > 0;
      case 'tower': return badges.dailyDungeonLeft > 0;
      case 'temple': return badges.gachaFree || badges.gachaTicketTen;
      case 'crystal': return badges.crystalUpgradable;
      default: return false;
    }
  }

  private ensureLamps(): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      return;
    }
    this.def.lamps.forEach((lamp, index) => {
      const name = `TownLamp_${index}`;
      if (root.getChildByName(name)) {
        return;
      }
      const node = this.host.addChildPlainNode(root, name, lamp.x, lamp.y, 40, 40);
      const sprite = this.host.addSprite('Art', this.def.lampAsset, 0, 0, 90, 90, node);
      if (!sprite) {
        node.destroy();
        return;
      }
      const frame = sprite.spriteFrame;
      const ow = frame?.originalSize.width ?? 1;
      const oh = frame?.originalSize.height ?? 1;
      const h = 230;
      const w = h * (ow / Math.max(1, oh));
      sprite.node.getComponent(UITransform)?.setContentSize(new Size(w, h));
      sprite.node.setPosition(0, h / 2, 0);
      this.lampNodes.push(node);
    });
  }

  // ── 队伍 ──

  private resolveParty(): LobbyHeroItemVO[] {
    const state = this.host.currentLobbyHeroRosterState();
    const selectedIds = this.host.currentLobbyFormationHeroIds();
    const byId = new Map(state.heroes.map((hero) => [hero.id, hero]));
    let party = selectedIds.map((id) => byId.get(id)).filter((hero): hero is LobbyHeroItemVO => !!hero);
    if (party.length === 0) {
      party = state.heroes
        .filter((hero) => hero.id > 0 && !hero.protagonist)
        .sort((a, b) => b.power - a.power)
        .slice(0, 4);
    }
    return party.slice(0, 4);
  }

  private ensureParty(): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      return;
    }
    const party = this.resolveParty();
    const signature = party.map((hero) => `${hero.id}:${hero.heroCode}`).join(',');
    if (signature === this.partySignature && this.leader && this.leader.node.isValid) {
      return;
    }
    // 阵容变了:保留队长位置,重建全队
    const spawn = this.pendingSpawn ?? this.def.spawn;
    const keepX = this.leader?.x ?? spawn.x;
    const keepY = this.leader?.y ?? spawn.y;
    this.pendingSpawn = null;
    const keepFacing = this.leader?.facing ?? 1;
    [this.leader, ...this.followers].forEach((actor) => actor?.node.isValid && actor.node.destroy());
    this.leader = null;
    this.followers = [];
    this.trail = [];
    this.partySignature = signature;
    if (party.length === 0) {
      return;
    }
    this.leader = this.createActor(root, party[0], 0, keepX, keepY, keepFacing);
    for (let i = 1; i < party.length; i += 1) {
      this.followers.push(this.createActor(root, party[i], i, keepX - keepFacing * i * FOLLOW_SPACING, keepY, keepFacing));
    }
    // 预铺一条从最后一名队员到队长的直线足迹:起步时队员沿它走,不会先跑回出生点
    const tail = party.length * FOLLOW_SPACING;
    for (let d = tail; d > 0; d -= FOLLOW_SAMPLE) {
      this.trail.push(new Vec2(keepX - keepFacing * d, keepY));
    }
    this.trail.push(new Vec2(keepX, keepY));
    this.orderKey = '';
    this.camX = keepX;
    this.camY = keepY;
    // 野外:预热全队的弹道 / 命中 / 技能特效(首发打出去就有,不是贴图)
    if (this.def.camps.length > 0) {
      for (const actor of [this.leader, ...this.followers]) {
        if (actor) {
          this.fx.prewarmKit(this.kitOf(actor));
        }
      }
    }
  }

  private createActor(parent: Node, hero: LobbyHeroItemVO, index: number, x: number, y: number, facing: 1 | -1): TownActor {
    const node = this.host.addChildPlainNode(parent, `TownActor_${index}`, x, y, HERO_SLOT_W, HERO_SLOT_H);
    const shadow = node.addComponent(Graphics);
    shadow.fillColor = rgba(0, 0, 0, 120);
    shadow.ellipse(0, 2, HERO_SLOT_W * 0.3, 8);
    shadow.fill();
    const actor: TownActor = {
      node, x, y, facing, moving: false, skeleton: null, spineNode: null, names: null, baseScaleX: 1, baseScaleY: 1, anim: null, shadow, idleFor: 0, faceAcc: 0,
      hero, role: companionRole(hero.heroClass), hp: 0, maxHp: 0, attack: 0, down: false, downUntil: 0, nextAttackAt: 0, skillReadyAt: 0,
      actionUntil: 0, inAction: false, target: null, thinkAt: 0, assistReadyAt: Date.now() + COMPANION_ASSIST_CD_MS / 2,
      oneShotEnd: 0, loopAfter: null,
    };
    const unit = this.toUnit(hero);
    const resourcePath = resolveBattleUnitSpineResource(unit);
    if (!resourcePath) {
      this.mountActorFallback(node, hero);
      return actor;
    }
    const spineNode = this.host.addChildPlainNode(node, 'Spine', 0, HERO_SLOT_H * 0.44, HERO_SLOT_W * 2.2, HERO_SLOT_H * 2.2);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    skeleton.timeScale = 1;
    loadSharedSpineData(resourcePath, null, 'Town', (data) => {
      if (!node.isValid || !spineNode.isValid) {
        return;
      }
      const runtimeData = data ? resolveBattleUnitSpineRuntimeData(data) : null;
      if (!data || !runtimeData) {
        spineNode.destroy();
        this.mountActorFallback(node, hero);
        return;
      }
      try {
        patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        skeleton.skeletonData = data;
        const skin = resolveBattleUnitSpineSkinName(data, runtimeData);
        if (skin) {
          skeleton.setSkin(skin);
        }
        const resolvedScale = resolveBattleUnitSpineScale(runtimeData.width, runtimeData.height, HERO_SLOT_W, HERO_SLOT_H, 1, false, unit);
        actor.baseScaleX = resolveBattleUnitSpineMirrorScaleX(resolvedScale, false);
        actor.baseScaleY = resolvedScale;
        spineNode.setScale(actor.baseScaleX * actor.facing, actor.baseScaleY, 1);
        const pos = resolveBattleUnitSpineNodePosition(runtimeData, resolvedScale, HERO_SLOT_H, unit, false);
        // 挂机舞台的 actor 原点在槽中心、脚底在 -0.44 槽高;这里 actor 原点就是脚底,整体上提
        spineNode.setPosition(pos.x, pos.y + HERO_SLOT_H * 0.44, 0);
        actor.names = resolveBattleUnitSpineAnimationNames(data, unit);
        actor.skeleton = skeleton;
        // 动作之间 0.08s 过渡混合:攻击 → 待机 / 跑 → 攻击不再硬切
        mixAll(skeleton, [actor.names.idle, actor.names.move, actor.names.attack, actor.names.skill1, actor.names.skill2, actor.names.skill3, actor.names.ult], 0.08);
        // 英雄骨骼大多自带脚底影子插槽:有就不再叠程序椭圆影(否则脚下两个影子,且骨骼有横向偏移会错开)
        if (actor.shadow && skeletonHasShadowSlot(data)) {
          actor.shadow.clear();
          actor.shadow = null;
        }
        actor.spineNode = spineNode;
        this.applyActorAnimation(actor, true);
      } catch (error) {
        console.warn('[Town] spine apply failed', hero.heroCode, error);
        if (spineNode.isValid) {
          spineNode.destroy();
        }
        this.mountActorFallback(node, hero);
      }
    });
    return actor;
  }

  private mountActorFallback(parent: Node, hero: LobbyHeroItemVO): void {
    const body = this.host.addChildPlainNode(parent, 'Fallback', 0, HERO_SLOT_H * 0.45, 70, 110);
    const g = body.addComponent(Graphics);
    g.fillColor = rgba(60, 44, 70, 230);
    g.roundRect(-30, -50, 60, 100, 26);
    g.fill();
    g.strokeColor = rgba(200, 160, 90, 220);
    g.lineWidth = 2;
    g.roundRect(-30, -50, 60, 100, 26);
    g.stroke();
    const label = this.host.addChildLabel(body, 'Initial', safeText(hero.heroName).slice(0, 1), 0, 0, 30, rgba(255, 230, 180), new Size(60, 40));
    label.isBold = true;
  }

  private toUnit(hero: LobbyHeroItemVO): BattlePresentationUnitSnapshot {
    return {
      unitKey: `town:${hero.id}`,
      side: 'ally',
      slot: 0,
      displayName: safeText(hero.heroName),
      subline: '',
      rarity: safeText(hero.rarity),
      level: hero.level,
      power: hero.power,
      role: 'front',
      leader: !!hero.protagonist,
      hpRatio: 1,
      sourceHeroId: hero.id,
      heroCode: hero.heroCode,
      heroClass: hero.heroClass,
      portraitAsset: hero.portraitAsset,
      spineAsset: hero.spineAsset,
      spineUuid: hero.spineUuid,
    };
  }

  private applyActorAnimation(actor: TownActor, force = false): void {
    const skeleton = actor.skeleton;
    const names = actor.names;
    if (!skeleton || !names || !skeleton.isValid) {
      return;
    }
    const wanted = actor.moving ? (names.move || names.idle) : names.idle;
    if (!wanted) {
      return;
    }
    if (!force && wanted === actor.anim) {
      return;
    }
    actor.anim = wanted;
    skeleton.setAnimation(0, wanted, true);
  }

  private setActorFacing(actor: TownActor, facing: 1 | -1): void {
    if (actor.facing === facing) {
      return;
    }
    actor.facing = facing;
    actor.spineNode?.setScale(actor.baseScaleX * facing, actor.baseScaleY, 1);
  }

  // ── 输入 ──

  private bindInput(): void {
    if (this.inputBound) {
      return;
    }
    this.inputBound = true;
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  private onKeyDown(event: EventKeyboard): void {
    this.keys.add(event.keyCode);
    if (!this.isMounted() || !this.layout) {
      return;
    }
    if (event.keyCode === KeyCode.KEY_F || event.keyCode === KeyCode.KEY_E || event.keyCode === KeyCode.SPACE || event.keyCode === KeyCode.ENTER) {
      this.enterNearBuilding();
      return;
    }
    // docs/50 §14 野外即时战斗(和掠夺同一套键位):J 普攻 / K L I 技能 / Shift 翻滚
    if (this.def.camps.length === 0) {
      return;
    }
    switch (event.keyCode) {
      case KeyCode.KEY_J: this.leaderAttack(); break;
      case KeyCode.KEY_K: this.leaderSkill(0); break;
      case KeyCode.KEY_L: this.leaderSkill(1); break;
      case KeyCode.KEY_I: this.leaderSkill(2); break;
      case KeyCode.SHIFT_LEFT: case KeyCode.SHIFT_RIGHT: this.leaderDodge(); break;
      case KeyCode.TAB: this.cycleLockTarget(); break;
      case KeyCode.DIGIT_1: case KeyCode.DIGIT_2: case KeyCode.DIGIT_3: {
        const index = event.keyCode - KeyCode.DIGIT_1;
        // Alt + 数字 = 换队长(Shift 已是翻滚),数字 = 援护技
        if (this.keys.has(KeyCode.ALT_LEFT) || this.keys.has(KeyCode.ALT_RIGHT)) {
          this.swapLeader(index);
        } else {
          this.triggerAssist(index);
        }
        break;
      }
      default: break;
    }
  }

  private onKeyUp(event: EventKeyboard): void {
    this.keys.delete(event.keyCode);
  }

  private inputVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.joy.active) {
      x = this.joy.dx;
      y = this.joy.dy;
    } else {
      if (this.keys.has(KeyCode.KEY_A) || this.keys.has(KeyCode.ARROW_LEFT)) x -= 1;
      if (this.keys.has(KeyCode.KEY_D) || this.keys.has(KeyCode.ARROW_RIGHT)) x += 1;
      if (this.keys.has(KeyCode.KEY_W) || this.keys.has(KeyCode.ARROW_UP)) y += 1;
      if (this.keys.has(KeyCode.KEY_S) || this.keys.has(KeyCode.ARROW_DOWN)) y -= 1;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  // ── 每帧 ──

  step(dt: number): void {
    if (!this.isMounted() || !this.layout) {
      return;
    }
    const clamped = Math.min(0.05, Math.max(0, dt));
    if (this.stepHitStop(Date.now())) {
      this.applyCamera(false, clamped);
      return;
    }
    this.stepLeader(clamped);
    this.stepFollowers(clamped);
    this.stepCombat(clamped);
    this.stepMonsters(clamped);
    if (Date.now() >= this.respawnCheckAt) {
      this.respawnCheckAt = Date.now() + 2000;
      if (this.def.camps.length > 0) {
        this.ensureMonsters();
      }
    }
    this.checkExitsAndWaypoint();
    this.stepChannel();
    this.updateBuildingSeeThrough(clamped);
    this.applyCamera(false, clamped);
    this.sortEntities(false);
    this.updateNearBuilding();
    this.updateMinimap();
    this.updateGuidePointer();
    this.waypointFx?.step(clamped);
    if (this.def.ambient) {
      const view = this.viewSize();
      this.ambient.step(clamped, this.camX, this.camY, view.w, view.h, this.def.width);
    }
  }

  private stepLeader(dt: number): void {
    const leader = this.leader;
    if (!leader || !leader.node.isValid) {
      return;
    }
    let v = this.inputVector();
    const nowMs = Date.now();
    if (this.leaderDead || (nowMs < this.actionUntil && nowMs >= this.dashUntil)) {
      v = { x: 0, y: 0 };
    }
    if (nowMs < this.dashUntil) {
      // 翻滚 / 突进:按冲刺方向强制位移
      const dashSpeed = this.dashSpeed;
      const nx = leader.x + this.dashDir.x * dashSpeed * dt;
      const ny = leader.y + this.dashDir.y * dashSpeed * dt * 0.8;
      if (this.walkable(nx, leader.y)) {
        leader.x = nx;
      }
      if (this.walkable(leader.x, ny)) {
        leader.y = ny;
      }
      leader.node.setPosition(leader.x, leader.y, 0);
      this.pushTrail(leader);
      return;
    }
    const moving = v.x !== 0 || v.y !== 0;
    if (moving) {
      // 俯视 3/4:纵向视觉距离短,速度打八折更自然
      const nx = leader.x + v.x * LEADER_SPEED * dt;
      const ny = leader.y + v.y * LEADER_SPEED * 0.8 * dt;
      if (this.walkable(nx, leader.y)) {
        leader.x = nx;
      }
      if (this.walkable(leader.x, ny)) {
        leader.y = ny;
      }
      leader.node.setPosition(leader.x, leader.y, 0);
      if (v.x !== 0) {
        this.setActorFacing(leader, v.x > 0 ? 1 : -1);
      }
      this.pushTrail(leader);
    }
    if (nowMs < this.actionUntil) {
      return;
    }
    if (this.leaderActionAnim) {
      // 10-28 用户:「连续点击时英雄总会重复播放起手攻击,总是播放不完整」——原先锁 300ms 一到就切待机 / 下一下从头播。
      // 现在过了取消点只有两种情况打断:按了移动(切跑)、缓冲了下一招(stepCombat 里接);否则让动作播完自然接上排好的循环
      if (moving) {
        this.leaderActionAnim = false;
        this.endOneShot(leader);
        leader.moving = true;
        this.applyActorAnimation(leader, true);
      } else if (nowMs >= leader.oneShotEnd) {
        this.leaderActionAnim = false;
        leader.moving = false;
        this.endOneShot(leader);
      }
      return;
    }
    if (leader.moving !== moving) {
      leader.moving = moving;
      this.applyActorAnimation(leader);
    }
  }

  /** 从队长当前位置沿足迹往回量 distance 的点(按弧长插值);足迹不够长返回 null。 */
  private trailPoint(distance: number): Vec2 | null {
    const leader = this.leader;
    if (!leader) {
      return null;
    }
    let px = leader.x;
    let py = leader.y;
    let left = distance;
    for (let i = this.trail.length - 1; i >= 0; i -= 1) {
      const p = this.trail[i];
      const seg = Math.hypot(p.x - px, p.y - py);
      if (seg >= left && seg > 0) {
        const t = left / seg;
        return new Vec2(px + (p.x - px) * t, py + (p.y - py) * t);
      }
      left -= seg;
      px = p.x;
      py = p.y;
    }
    return null;
  }

  private pushTrail(leader: TownActor): void {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - leader.x, last.y - leader.y) >= FOLLOW_SAMPLE) {
      this.trail.push(new Vec2(leader.x, leader.y));
      if (this.trail.length > 400) {
        this.trail.splice(0, this.trail.length - 400);
      }
    }
  }

  private stepFollowers(dt: number): void {
    const now = Date.now();
    this.followers.forEach((actor, index) => {
      if (!actor.node.isValid || actor.down) {
        return;
      }
      // docs/51 §6:战斗中自己走位 / 出手;出手动画期间不切跑 / 待机
      if (this.stepCompanion(actor, index, dt, now)) {
        return;
      }
      if (now < actor.actionUntil) {
        return;
      }
      if (actor.inAction) {
        actor.inAction = false;
        this.endOneShot(actor);
      }
      // 旧做法追离散采样点:追上就停 → 切待机,队长再走 8px 又切跑步,动画来回闪;朝向按单帧 dx 翻,也会闪。
      // 现在按弧长在足迹上取连续目标点,平滑逼近;动画 / 朝向都加防抖。
      const target = this.trailPoint((index + 1) * FOLLOW_SPACING);
      let stepX = 0;
      let stepLen = 0;
      if (target) {
        const dx = target.x - actor.x;
        const dy = target.y - actor.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          stepLen = Math.min(dist, LEADER_SPEED * 1.35 * dt);
          stepX = (dx / dist) * stepLen;
          actor.x += stepX;
          actor.y += (dy / dist) * stepLen;
          actor.node.setPosition(actor.x, actor.y, 0);
        }
      }
      if (stepLen > LEADER_SPEED * 0.12 * dt) {
        actor.idleFor = 0;
      } else {
        actor.idleFor += dt;
      }
      const moving = actor.idleFor < 0.16;
      if (Math.abs(stepX) > 0.05) {
        const dir: 1 | -1 = stepX > 0 ? 1 : -1;
        if (dir === actor.facing) {
          actor.faceAcc = 0;
        } else {
          actor.faceAcc += Math.abs(stepX);
          if (actor.faceAcc > 12) {
            actor.faceAcc = 0;
            this.setActorFacing(actor, dir);
          }
        }
      }
      if (actor.moving !== moving) {
        actor.moving = moving;
        this.applyActorAnimation(actor);
      }
    });
  }

  /** 队伍走到建筑后面、被建筑图盖住时,把建筑淡成半透明(看得见人);走出来恢复。 */
  private updateBuildingSeeThrough(dt: number): void {
    const party = [this.leader, ...this.followers].filter((actor): actor is TownActor => !!actor && actor.node.isValid);
    const t = 1 - Math.exp(-10 * dt);
    for (const building of this.buildings) {
      const sprite = building.sprite;
      if (!sprite || !sprite.isValid) {
        continue;
      }
      const size = sprite.node.getComponent(UITransform);
      const artW = size?.width ?? building.cfg.width;
      const artH = size?.height ?? building.cfg.width;
      const covered = party.some((actor) => actor.y > building.cfg.y
        && Math.abs(actor.x - building.cfg.x) < artW * 0.42
        && actor.y < building.cfg.y + artH * 0.85);
      const want = covered ? BUILDING_SEE_THROUGH_OPACITY : 255;
      if (Math.abs(building.fade - want) < 1) {
        if (building.fade === want) {
          continue;
        }
        building.fade = want;
      } else {
        building.fade += (want - building.fade) * t;
      }
      const opacity = sprite.node.getComponent(UIOpacity) ?? sprite.node.addComponent(UIOpacity);
      opacity.opacity = Math.round(building.fade);
    }
  }

  private walkable(x: number, y: number): boolean {
    const def = this.def;
    if (x < def.walk.left || x > def.walk.right || y < def.walk.bottom || y > def.walk.top) {
      return false;
    }
    for (const building of def.buildings) {
      const halfW = building.footprint.w / 2 + ACTOR_RADIUS * 0.6;
      if (x > building.x - halfW && x < building.x + halfW && y > building.y - ACTOR_RADIUS * 0.3 && y < building.y + building.footprint.d) {
        return false;
      }
    }
    for (const block of def.blocks ?? []) {
      const halfW = block.w / 2 + ACTOR_RADIUS * 0.4;
      if (x > block.x - halfW && x < block.x + halfW && y > block.y - ACTOR_RADIUS * 0.3 && y < block.y + block.d) {
        return false;
      }
    }
    for (const prop of def.props) {
      if (!prop.block) {
        continue;
      }
      const halfW = prop.block.w / 2 + ACTOR_RADIUS * 0.4;
      if (x > prop.x - halfW && x < prop.x + halfW && y > prop.y - ACTOR_RADIUS * 0.3 && y < prop.y + prop.block.d) {
        return false;
      }
    }
    return true;
  }

  private applyCamera(snap: boolean, dt = 0): void {
    const world = this.world;
    const layout = this.layout;
    if (!world || !world.isValid || !layout) {
      return;
    }
    // 用整屏宽高夹镜头(舞台比屏幕窄:手机刘海安全区),否则屏幕边缘会露出地图外的一条(10-27 用户:野外右侧黑边)
    const viewW = Math.max(layout.width, layout.stageWidth) / this.k;
    const viewH = Math.max(layout.height, layout.stageHeight) / this.k;
    const target = this.leader ?? this.def.spawn;
    const maxX = Math.max(0, this.def.width / 2 - viewW / 2);
    const maxY = Math.max(0, this.def.height / 2 - viewH / 2);
    const wantX = Math.max(-maxX, Math.min(maxX, target.x));
    const wantY = Math.max(-maxY, Math.min(maxY, target.y + 40));
    if (snap) {
      this.camX = wantX;
      this.camY = wantY;
    } else {
      const t = 1 - Math.exp(-9 * dt);
      this.camX += (wantX - this.camX) * t;
      this.camY += (wantY - this.camY) * t;
    }
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const cy = (layout.stageTop + layout.stageBottom) / 2;
    let ox = 0;
    let oy = 0;
    const left = this.shakeUntil - Date.now();
    if (left > 0) {
      const k = (left / (this.shakeDur * 1000)) * this.shakeAmp;
      ox = (Math.random() * 2 - 1) * k;
      oy = (Math.random() * 2 - 1) * k * 0.6;
    }
    world.setPosition(cx - this.camX * this.k + ox, cy - this.camY * this.k + oy, 0);
    updateWorldShaderOrigin(world);
  }

  /** 前后遮挡:脚线 y 越大越靠后,先画;只在顺序变化时重排兄弟索引。 */
  private sortEntities(force: boolean): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      return;
    }
    const items: Array<{ node: Node; y: number }> = [];
    for (const building of this.buildings) {
      if (building.node.isValid) {
        items.push({ node: building.node, y: building.cfg.y });
      }
    }
    for (const lamp of this.lampNodes) {
      if (lamp.isValid) {
        items.push({ node: lamp, y: lamp.position.y });
      }
    }
    for (const prop of this.propNodes) {
      if (prop.node.isValid) {
        items.push({ node: prop.node, y: prop.y });
      }
    }
    for (const npc of this.npcNodes) {
      if (npc.node.isValid) {
        items.push({ node: npc.node, y: npc.y });
      }
    }
    if (this.waypointNode && this.waypointNode.isValid) {
      items.push({ node: this.waypointNode, y: this.def.waypoint.y + 40 });
    }
    for (const monster of this.monsters) {
      if (monster.node.isValid) {
        items.push({ node: monster.node, y: monster.y });
      }
    }
    for (const actor of [this.leader, ...this.followers]) {
      if (actor && actor.node.isValid) {
        items.push({ node: actor.node, y: actor.y });
      }
    }
    items.sort((a, b) => b.y - a.y);
    const key = items.map((item) => item.node.name).join('|');
    if (!force && key === this.orderKey) {
      return;
    }
    this.orderKey = key;
    items.forEach((item, index) => item.node.setSiblingIndex(index));
  }

  // ── 门口交互 ──

  /** 可交互点:功能建筑门口 / NPC / 传送阵(docs/50)。 */
  private interactables(): TownInteract[] {
    const def = this.def;
    const out: TownInteract[] = [];
    for (const building of def.buildings) {
      if (building.action === 'none') {
        continue;
      }
      if (building.action === 'npc' && building.npc) {
        out.push({ kind: 'npc', key: building.key, label: building.label, x: building.x + building.door.x, y: building.y + building.door.y, npc: building.npc });
      } else {
        out.push({ kind: 'building', key: building.key, label: building.label, x: building.x + building.door.x, y: building.y + building.door.y, building });
      }
    }
    for (const npc of def.npcs) {
      if (npc.asset) {
        out.push({ kind: 'npc', key: `npc_${npc.code}`, label: npc.name, x: npc.x, y: npc.y, npc: npc.code });
      }
    }
    out.push({ kind: 'waypoint', key: 'waypoint', label: `传送阵 · ${def.name}`, x: def.waypoint.x, y: def.waypoint.y });
    for (const loot of this.loots) {
      if (loot.node.isValid) {
        out.push({ kind: 'loot', key: loot.key, label: '战利品', x: loot.x, y: loot.y, loot });
      }
    }
    return out;
  }

  /** 交互范围内的全部对象(由近到远,最多 3 个);战斗中不出传送 / 进入类提示,避免误触。 */
  private nearbyInteracts(): TownInteract[] {
    const leader = this.leader;
    if (!leader) {
      return [];
    }
    // 主城传送阵 = 广场整块罗盘(rx 290,地砖透视压 0.56):站在盘面上任何位置都算到了传送阵
    const cityDisc = !this.def.waypoint.drawn;
    const hits: Array<{ item: TownInteract; dist: number }> = [];
    for (const item of this.interactables()) {
      if (this.inCombat && item.kind !== 'npc' && item.kind !== 'loot') {
        continue;
      }
      const radius = item.kind === 'waypoint' ? WAYPOINT_RADIUS : INTERACT_RADIUS;
      const dist = Math.hypot(item.x - leader.x, item.y - leader.y);
      const inside = item.kind === 'waypoint' && cityDisc
        ? ((item.x - leader.x) / 300) ** 2 + ((item.y - leader.y) / (300 * 0.56 + 40)) ** 2 < 1
        : dist < radius;
      if (inside) {
        hits.push({ item, dist });
      }
    }
    // 建筑门口(action npc)和站在门边的 NPC 本人指向同一段对话:同一个 NPC 只留最近的一条
    const seenNpc = new Set<WorldNpcCode>();
    return hits.sort((a, b) => a.dist - b.dist).filter((hit) => {
      if (hit.item.kind !== 'npc') {
        return true;
      }
      if (seenNpc.has(hit.item.npc)) {
        return false;
      }
      seenNpc.add(hit.item.npc);
      return true;
    }).slice(0, 3).map((hit) => hit.item);
  }

  private nearestInteract(): TownInteract | null {
    return this.nearbyInteracts()[0] ?? null;
  }

  private promptText(item: TownInteract): string {
    if (item.kind === 'waypoint') {
      return '传送 · 世界地图';
    }
    if (item.kind === 'npc') {
      return `对话 · ${item.label}`;
    }
    if (item.kind === 'loot') {
      return '拾取 · 战利品';
    }
    return `${item.building.action === 'quest' ? '查看' : '进入'} · ${item.label}`;
  }

  private promptIcon(item: TownInteract): string {
    if (item.kind === 'waypoint') {
      return TOWN_HUD_ASSETS.iconPortal;
    }
    if (item.kind === 'building') {
      return TOWN_MINIMAP_BUILDING_ICONS[item.key] ?? TOWN_HUD_ASSETS.iconQuest;
    }
    if (item.kind === 'loot') {
      return LOOT_ICON;
    }
    return TOWN_HUD_ASSETS.iconQuest;
  }

  /**
   * 交互提示条(docs/51 §5,原型 v3):队长右侧竖排,最近的一条高亮(电脑端带 F 角标);点哪条做哪条。
   * 列表变了才重建,每帧只跟着队长挪位置。
   */
  private updateNearBuilding(): void {
    const list = this.nearbyInteracts();
    const key = list.map((item) => item.key).join('|');
    const root = this.promptRoot;
    if (root && root.isValid && key !== this.nearKey) {
      this.nearKey = key;
      root.destroyAllChildren();
      const layout = this.hudLayout;
      if (layout && list.length > 0) {
        const P = townProtoFrame(layout);
        const w = P.S(292);
        const h = P.S(50);
        const showKeys = !isPhoneDesign();
        list.forEach((item, index) => {
          const hot = index === 0;
          const bar = this.host.addChildPlainNode(root, `Prompt_${index}`, w / 2, -index * P.S(63), w, h);
          // 普通条 = 暗条(stat_bar 900×85)、高亮条 = 暗金牌(plate_dark 696×150),都是现成 UiRefKit 件
          // B 风格(原型 town_b):暗玻璃胶囊 + 浅色细边
          mountGlassSlice(this.host as never, bar, 'Bg', hot ? GLASS_SLICES.hudCapsule : GLASS_SLICES.hudCapsuleDim, 0, 0, w, h, h / 48);
          let x = -w / 2 + P.S(28);
          if (showKeys && hot) {
            const key = this.host.addChildPlainNode(bar, 'Key', x, 0, P.S(30), P.S(30));
            const kg = key.addComponent(Graphics);
            kg.fillColor = rgba(22, 27, 34, 240);
            kg.roundRect(-P.S(13), -P.S(13), P.S(26), P.S(26), P.S(3));
            kg.fill();
            kg.strokeColor = rgba(220, 226, 234, 230);
            kg.lineWidth = Math.max(1, P.S(1.5));
            kg.roundRect(-P.S(13), -P.S(13), P.S(26), P.S(26), P.S(3));
            kg.stroke();
            this.host.addChildLabel(key, 'Label', 'F', 0, 0, P.S(18), rgba(250, 236, 200), new Size(P.S(26), P.S(24))).isBold = true;
            x += P.S(48);
          } else {
            x += P.S(4);
          }
          this.addFitSprite('Icon', this.promptIcon(item), x + P.S(6), 0, P.S(38), P.S(38), bar);
          const label = this.host.addChildLabel(bar, 'Label', this.promptText(item), x + P.S(36), 0, P.S(20), hot ? rgba(252, 240, 214) : rgba(222, 212, 192),
            new Size(w / 2 - x - P.S(46), P.S(30)), HorizontalTextAlignment.LEFT);
          label.overflow = Label.Overflow.SHRINK;
          bar.addComponent(Button);
          bar.on(Button.EventType.CLICK, () => this.performInteract(item), this);
          this.host.applyImageButtonFeedback(bar, 1.03, 0.97);
        });
      }
    }
    this.positionPrompts();
    // 门口建筑名牌高亮
    const nearKey = list[0]?.key ?? null;
    for (const building of this.buildings) {
      const label = building.plate?.getChildByName('Label')?.getComponent(Label);
      if (label) {
        // 毛玻璃名牌(mountPlate 底色 240/242/246):走近的提亮成纯白,其余略压暗
        label.color = building.cfg.key === nearKey ? rgba(255, 255, 255) : rgba(214, 220, 228);
      }
    }
  }

  /** 提示条跟着队长:左缘在队长脚下右侧 100、首条比脚线高 97(原型像素);出屏则夹回。 */
  private positionPrompts(): void {
    const root = this.promptRoot;
    const leader = this.leader;
    const world = this.world;
    const layout = this.hudLayout;
    if (!root || !root.isValid || !leader || !world || !world.isValid || !layout || root.children.length === 0) {
      return;
    }
    const P = townProtoFrame(layout);
    const sx = world.position.x + leader.x * this.k;
    const sy = world.position.y + leader.y * this.k;
    const x = Math.min(sx + P.S(100), layout.stageRight - P.S(292) - P.S(130));
    const y = Math.max(layout.stageBottom + P.S(60) + (root.children.length - 1) * P.S(63), Math.min(sy + P.S(97), layout.stageTop - P.S(150)));
    root.setPosition(x, y, 0);
  }

  private enterNearBuilding(): void {
    const near = this.nearestInteract();
    if (near) {
      this.performInteract(near);
    }
  }

  private performInteract(near: TownInteract): void {
    this.keys.clear();
    this.joy = { active: false, id: -1, dx: 0, dy: 0 };
    if (this.leader) {
      this.leader.moving = false;
      this.applyActorAnimation(this.leader);
    }
    if (near.kind === 'npc') {
      this.host.openWorldNpcDialog?.(near.npc);
      return;
    }
    if (near.kind === 'waypoint') {
      this.host.openWorldMapPanel?.();
      return;
    }
    if (near.kind === 'loot') {
      this.pickupLoot(near.loot);
      return;
    }
    if (this.guide?.flag && this.guide.building === near.building.key) {
      lobbyGuide.markVisited(this.guide.flag);
    }
    this.openBuildingAction(near.building.action);
  }

  /** 建筑功能入口(走到门口点交互钮 / 底部快捷栏共用)。 */
  private openBuildingAction(action: WorldMapBuilding['action']): void {
    switch (action) {
      case 'adventure':
        // docs/47(2026-10-26 用户拍板):冒险之门 = 矿境掠夺;原守卫战(冒险关卡)挪到秘境试炼塔「特殊玩法 · 守卫战」
        if (this.host.openLobbyRaidPanel) {
          this.host.openLobbyRaidPanel();
        } else if (this.host.startRaidPrototype) {
          this.host.startRaidPrototype();
        } else {
          this.host.openLobbyAdventurePanel();
        }
        return;
      case 'gacha': this.host.openLobbyGachaScene(); return;
      case 'forge': this.host.openLobbyForgePanel(); return;
      case 'daily': this.host.openLobbyDailyDungeonPanel(); return;
      case 'crystal': this.host.openGuardCrystalDialog?.(); return;
      case 'shop': this.host.openLobbyShopDialog?.('gold'); return;
      case 'quest': if (this.host.openWorldBountyPanel) { this.host.openWorldBountyPanel(); } else { this.host.openLobbyQuestPanel?.(); } return;
      case 'heroes': this.host.openLobbyHeroRosterPanel(); return;
      case 'codex': this.host.openLobbyCodexPanel(); return;
      default: return;
    }
  }

  // ── HUD ──

  /** 每次大厅 render 重建 HUD 层(摇杆 / 进入 / 底栏 / 小地图 / 引导);guide 为引导当前指向的建筑。 */
  renderHud(layout: UiLayout, guide: TownGuideTarget | null): void {
    const phone = isPhoneDesign();
    const scale = Math.max(0.6, Math.min(1, layout.uiScale)) * (phone ? 1.25 : 1);
    this.hudScale = scale;
    const world = this.host.currentWorldState?.() ?? null;
    const questGuide = this.resolveQuestGuide(world);
    // 跑图世界只用剧情任务带路(2026-10-27 UI 审核:顶部旧引导条和左侧追踪条同时出现、指向不同)
    const effectiveGuide = world ? questGuide : guide;
    this.guide = effectiveGuide;
    const hud = this.host.createUiNode('LobbyTownHud');
    hud.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    this.hudNode = hud;
    this.hudLayout = layout;
    // docs/51 原型 v3:左上圆形小地图 + 追踪;队长右侧交互提示条;野外加右下战斗簇 / 底部队长血条 / 右侧援护位 / 顶部精英条
    this.renderJoystick(hud, layout, scale);
    this.renderMinimap(hud, layout, scale);
    this.renderQuestTracker(hud, layout, scale, world);
    this.renderRecallButton(hud, layout, scale, world);
    this.renderCombatButtons(hud, layout, scale);
    this.renderLeaderBar(hud, layout);
    this.renderPartyColumn(hud, layout);
    this.renderEliteBar(hud, layout);
    this.promptRoot = this.host.addChildPlainNode(hud, 'LobbyTownPrompts', 0, 0, 1, 1);
    this.renderAreaBanner(hud, layout, scale);
    this.renderLevelToast(hud, layout);
    // 任务追踪条在左侧;旧的顶部追踪条只在旧引导时出现
    this.renderGuideTracker(hud, layout, scale, effectiveGuide === questGuide ? null : effectiveGuide);
    this.mountGuidePointer(effectiveGuide);
    this.refreshNpcMarkers(world);
    this.refreshWaypointGlow(world);
    this.channelBar = null;
    this.nearKey = null;
    this.updateNearBuilding();
    this.updateMinimap();
  }

  private renderJoystick(hud: Node, layout: UiLayout, scale: number): void {
    // 原型 v3:主城石盘直径 187、中心 (140, 690);野外 210、中心 (145, 660);摇杆头 = 盘径 × 0.43,最大行程 = 盘半径 - 头半径
    const P = townProtoFrame(layout);
    const field = this.def.camps.length > 0;
    const baseD = P.S(field ? 210 : 187);
    const radius = baseD * 0.29;
    this.joyRadius = radius;
    const homeX = P.L(field ? 145 : 140);
    const homeY = P.Y(field ? 660 : 690);
    this.joyHome = new Vec3(homeX, homeY, 0);
    // 触摸板:舞台左半、底栏以上 —— 在哪按下摇杆就从哪起(浮动摇杆)
    const padW = layout.stageWidth * 0.5;
    const padH = layout.stageHeight * 0.72;
    const pad = this.host.addChildPlainNode(hud, 'LobbyTownJoyPad', layout.stageLeft + padW / 2, layout.stageBottom + padH / 2, padW, padH);
    const base = this.host.addChildPlainNode(hud, 'LobbyTownJoyBase', homeX, homeY, baseD, baseD);
    // B 风格(原型 town_b / field_b):淡磨砂圆盘 + 浅色细环 + 四个小箭头;摇杆头 = 磨砂灰圆 + 细边
    const baseArt = this.host.addSprite('Art', TOWN_HUD_ASSETS.hudJoyBase, 0, 0, baseD, baseD, base);
    const bg = base.addComponent(Graphics);
    bg.fillColor = rgba(18, 22, 28, baseArt ? 0 : 120);
    bg.circle(0, 0, baseD * 0.47);
    bg.fill();
    if (!baseArt) {
      bg.strokeColor = rgba(176, 186, 200, 170);
      bg.lineWidth = Math.max(1.2, baseD * 0.01);
      bg.circle(0, 0, baseD * 0.47);
      bg.stroke();
    }
    bg.fillColor = rgba(220, 226, 234, baseArt ? 0 : 190);
    const t = baseD * 0.035;
    const at = baseD * 0.39;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([ux, uy]) => {
      const cx = ux * at;
      const cy = uy * at;
      bg.moveTo(cx + ux * t, cy + uy * t);
      bg.lineTo(cx - ux * t * 0.4 - uy * t, cy - uy * t * 0.4 + ux * t);
      bg.lineTo(cx - ux * t * 0.4 + uy * t, cy - uy * t * 0.4 - ux * t);
      bg.close();
      bg.fill();
    });
    void scale;
    const knobD = baseD * 0.4;
    const knob = this.host.addChildPlainNode(base, 'Knob', 0, 0, knobD, knobD);
    const knobArt = this.host.addSprite('Art', TOWN_HUD_ASSETS.hudJoyKnob, 0, 0, knobD, knobD, knob);
    const kg = knob.addComponent(Graphics);
    kg.fillColor = rgba(92, 104, 118, knobArt ? 0 : 215);
    kg.circle(0, 0, knobD / 2);
    kg.fill();
    if (!knobArt) {
      kg.strokeColor = rgba(196, 204, 216, 200);
      kg.lineWidth = Math.max(1.2, knobD * 0.025);
      kg.circle(0, 0, knobD / 2);
      kg.stroke();
    }
    this.joyBase = base;
    this.joyKnob = knob;
    const toLocal = (event: EventTouch): Vec3 => {
      const ui = event.getUILocation();
      const tf = hud.getComponent(UITransform)!;
      return tf.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    };
    const apply = (local: Vec3): void => {
      if (!this.joyBase || !this.joyBase.isValid) {
        return;
      }
      const origin = this.joyBase.position;
      let dx = local.x - origin.x;
      let dy = local.y - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      this.joyKnob?.setPosition(dx, dy, 0);
      const dead = radius * 0.12;
      const mag = Math.hypot(dx, dy);
      if (mag < dead) {
        this.joy.dx = 0;
        this.joy.dy = 0;
      } else {
        this.joy.dx = dx / radius;
        this.joy.dy = dy / radius;
      }
    };
    const release = (): void => {
      this.joy = { active: false, id: -1, dx: 0, dy: 0 };
      this.joyKnob?.setPosition(0, 0, 0);
      this.joyBase?.setPosition(this.joyHome);
    };
    pad.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      if (this.joy.active) {
        return;
      }
      const local = toLocal(event);
      this.joy = { active: true, id: event.getID() ?? 0, dx: 0, dy: 0 };
      this.joyBase?.setPosition(local.x, local.y, 0);
      this.joyKnob?.setPosition(0, 0, 0);
    }, this);
    pad.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      if (!this.joy.active || (event.getID() ?? 0) !== this.joy.id) {
        return;
      }
      apply(toLocal(event));
    }, this);
    pad.on(Node.EventType.TOUCH_END, release, this);
    pad.on(Node.EventType.TOUCH_CANCEL, release, this);
  }

  /**
   * 圆形小地图(docs/51 原型 v3:主城左上直径 192、野外 236):以队长为中心滚动,底图 / 建筑图标 / 怪群点 / 传送阵圈画在圆形遮罩里;
   * 环下名牌写地图名(野外带等级段);点整块打开世界地图。
   */
  private renderMinimap(hud: Node, layout: UiLayout, scale: number): void {
    void scale;
    const P = townProtoFrame(layout);
    const field = this.def.camps.length > 0;
    // 原型 proto_field_v1 量得:圆心 (160,120)、外沿 r 118、暗带 r 106..116 两侧细金线、顶上一枚金菱尖;名牌 216×38 中心在圆心下 111
    const outer = P.S(field ? 118 : 105);
    const cx = P.L(field ? 160 : 165);
    const cy = P.Y(field ? 120 : 118);
    const node = this.host.addChildPlainNode(hud, 'LobbyTownMinimap', cx, cy, outer * 2, outer * 2);
    const holeR = outer * (106 / 118);
    const area = this.host.addChildPlainNode(node, 'MapArea', 0, 0, holeR * 2, holeR * 2);
    const mask = area.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_ELLIPSE;
    mask.segments = 64;
    const bg = this.host.addChildPlainNode(area, 'Bg', 0, 0, holeR * 2, holeR * 2).addComponent(Graphics);
    bg.fillColor = rgba(26, 24, 22, 240);
    bg.circle(0, 0, holeR);
    bg.fill();
    const def = this.def;
    // 圆里看多大范围:主城 3200 世界单位(原型一圈建筑图标都在圆里)、野外 2400(能看到几群怪)
    const mapScale = (holeR * 2) / (field ? 2400 : 3200);
    this.minimapScale = mapScale;
    const content = this.host.addChildPlainNode(area, 'Content', 0, 0, def.width * mapScale, def.height * mapScale);
    this.minimapContent = content;
    const wx = def.waypoint.x * mapScale;
    const wy = def.waypoint.y * mapScale;
    const cityBg = this.mapCode === 'CITY' && !!this.host.addSprite('CityBg', TOWN_HUD_ASSETS.minimapCity, wx, wy, def.width * mapScale * 1.04, def.width * mapScale * 1.04, content);
    if (cityBg) {
      // 主城底图偏亮偏黄:压一层暗色(原型是暗色广场,金色建筑图标才跳得出来)
      const shade = this.host.addChildPlainNode(content, 'CityShade', 0, 0, def.width * mapScale * 1.1, def.height * mapScale * 1.1).addComponent(Graphics);
      shade.fillColor = rgba(12, 12, 16, 120);
      shade.rect(-def.width * mapScale * 0.55, -def.height * mapScale * 0.55, def.width * mapScale * 1.1, def.height * mapScale * 1.1);
      shade.fill();
    } else {
      // 野外:原型样式的地形(灰地 + 地表纹理 + 深色岩块团),圆边压暗
      this.mountMinimapTerrain(content, def, mapScale);
    }
    this.mountMinimapVignette(area, holeR);
    const marks = this.host.addChildPlainNode(content, 'Marks', 0, 0, def.width * mapScale, def.height * mapScale).addComponent(Graphics);
    if (!cityBg) {
      // 地标:岩堆 / 残墙 / 枯树画成小三角(原型小地图上的灰三角)
      marks.fillColor = rgba(150, 140, 120, 200);
      // 只标大件(岩群 / 残墙 / 枯树 / 营帐);碎石枯草这些贴地装饰不标,否则满图三角
      for (const prop of def.props) {
        if (prop.flat || prop.width < 250) {
          continue;
        }
        const px = prop.x * mapScale;
        const py = prop.y * mapScale;
        const t = P.S(5);
        marks.moveTo(px, py + t);
        marks.lineTo(px + t, py - t * 0.7);
        marks.lineTo(px - t, py - t * 0.7);
        marks.close();
        marks.fill();
      }
      marks.strokeColor = rgba(150, 126, 84, 120);
      marks.lineWidth = Math.max(1, P.S(1.5));
      marks.circle(wx, wy, P.S(16));
      marks.stroke();
    }
    marks.strokeColor = rgba(110, 190, 255, 220);
    marks.lineWidth = Math.max(1, P.S(2));
    marks.circle(wx, wy, P.S(7));
    marks.stroke();
    for (const camp of def.camps) {
      marks.fillColor = camp.elite ? rgba(246, 200, 70, 245) : rgba(220, 54, 44, 245);
      marks.circle(camp.x * mapScale, camp.y * mapScale, Math.max(3, P.S(camp.elite ? 7 : 6)));
      marks.fill();
    }
    for (const building of def.buildings) {
      const icon = TOWN_MINIMAP_BUILDING_ICONS[building.key];
      const bx = building.x * mapScale;
      const by = (building.y + building.footprint.d / 2) * mapScale;
      if (!icon || !this.addFitSprite(`Icon_${building.key}`, icon, bx, by, P.S(30), P.S(30), content)) {
        marks.fillColor = rgba(214, 176, 100, 240);
        marks.rect(bx - P.S(4), by - P.S(3), P.S(8), P.S(6));
        marks.fill();
      }
    }
    // 队长箭头固定在圆心,按移动方向转
    const me = this.host.addChildPlainNode(area, 'Me', 0, 0, P.S(26), P.S(26));
    // B 风格(原型 field_b):香槟色箭头
    {
      const mg = me.addComponent(Graphics);
      mg.fillColor = rgba(232, 204, 148, 255);
      mg.moveTo(0, P.S(11));
      mg.lineTo(P.S(8), -P.S(8));
      mg.lineTo(0, -P.S(4));
      mg.lineTo(-P.S(8), -P.S(8));
      mg.close();
      mg.fill();
    }
    this.minimapMe = me;
    this.drawMinimapRing(node, outer);
    const plateText = field && def.levelText ? `${def.name} ${def.levelText}` : def.name;
    const plateW = P.S(field ? 216 : 140);
    const plateH = P.S(field ? 38 : 36);
    const plateY = -outer * (field ? 111 / 118 : 94 / 105);
    // B 风格(原型 town_b / field_b):暗玻璃胶囊 + 浅色细边
    mountGlassSlice(this.host as never, node, 'Plate', GLASS_SLICES.hudCapsule, 0, plateY, plateW, plateH, plateH / 48);
    const title = this.host.addChildLabel(node, 'Title', plateText, 0, plateY, P.S(22), rgba(246, 232, 200), new Size(plateW - P.S(28), P.S(30)));
    title.overflow = Label.Overflow.SHRINK;
    title.isBold = true;
    title.enableOutline = true;
    title.outlineColor = rgba(0, 0, 0, 230);
    title.outlineWidth = Math.max(1, P.S(2));
    this.minimapBottomY = cy + plateY - plateH / 2;
    // 圆环右侧偏下(约 4 点前)小圆钮「传送」:任何地方都能打开世界地图传送(10-28);再往下会压地名牌和追踪条
    const mapBtnD = P.S(field ? 58 : 52);
    const ang = -Math.PI / 9;
    const mapBtn = this.host.addChildPlainNode(hud, 'LobbyTownWorldMapBtn', cx + Math.cos(ang) * outer * 1.14, cy + Math.sin(ang) * outer * 1.14, mapBtnD + P.S(30), mapBtnD + P.S(30));
    mountRingBase(this.host, mapBtn, mapBtnD * 1.12);
    this.addFitSprite('Icon', TOWN_HUD_ASSETS.icWorldPortal, 0, 0, mapBtnD * 0.54, mapBtnD * 0.54, mapBtn);
    const mapBtnLabel = this.host.addChildLabel(mapBtn, 'Label', '传送', 0, -mapBtnD * 0.5 - P.S(10), P.S(18), rgba(244, 232, 206), new Size(P.S(80), P.S(24)));
    mapBtnLabel.enableOutline = true;
    mapBtnLabel.outlineColor = rgba(0, 0, 0, 230);
    mapBtnLabel.outlineWidth = 2;
    mapBtn.addComponent(Button);
    mapBtn.on(Button.EventType.CLICK, () => this.host.openWorldMapPanel?.(), this);
    this.host.applyImageButtonFeedback(mapBtn, 1.08, 0.94);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.openWorldMapPanel?.(), this);
    this.host.applyImageButtonFeedback(node, 1.02, 0.98);
    this.minimapLastPos = null;
    this.updateMinimap();
  }

  /** 小地图圆环(2026-10-29 B 风格,原型 field_b):一道浅色细环 + 内侧淡环 + 顶上小「N」。outer = 外沿半径。 */
  private drawMinimapRing(node: Node, outer: number): void {
    const k = outer / 118;
    if (this.host.addSprite('Ring', TOWN_HUD_ASSETS.minimapRing, 0, 0, outer * 2.4, outer * 2.4, node)) {
      const north = this.host.addChildLabel(node, 'North', 'N', 0, 104 * k, 17 * k, rgba(226, 230, 238), new Size(30 * k, 24 * k));
      north.isBold = true;
      north.enableOutline = true;
      north.outlineColor = rgba(0, 0, 0, 220);
      north.outlineWidth = 2;
      return;
    }
    const g = this.host.addChildPlainNode(node, 'Ring', 0, 0, outer * 2.4, outer * 2.4).addComponent(Graphics);
    g.strokeColor = rgba(14, 18, 24, 200);
    g.lineWidth = 8 * k;
    g.circle(0, 0, 112 * k);
    g.stroke();
    g.strokeColor = rgba(176, 186, 200, 220);
    g.lineWidth = Math.max(1.5, 2.2 * k);
    g.circle(0, 0, 116 * k);
    g.stroke();
    g.strokeColor = rgba(120, 130, 144, 150);
    g.lineWidth = Math.max(1, 1.2 * k);
    g.circle(0, 0, 107 * k);
    g.stroke();
    const n = this.host.addChildLabel(node, 'North', 'N', 0, 104 * k, 17 * k, rgba(226, 230, 238), new Size(30 * k, 24 * k));
    n.isBold = true;
    n.enableOutline = true;
    n.outlineColor = rgba(0, 0, 0, 220);
    n.outlineWidth = 2;
  }

  /** 圆边压暗:几圈低透明度描边叠出向边缘渐暗(原型圆内四周暗)。 */
  private mountMinimapVignette(area: Node, holeR: number): void {
    const g = this.host.addChildPlainNode(area, 'Vignette', 0, 0, holeR * 2, holeR * 2).addComponent(Graphics);
    for (let i = 0; i < 5; i += 1) {
      const w = holeR * 0.05;
      g.strokeColor = rgba(8, 8, 10, 16);
      g.lineWidth = w * (i + 1) * 2;
      g.circle(0, 0, holeR - w * (i + 1));
      g.stroke();
    }
  }

  /**
   * 小地图地形底(原型:灰色地表带纹理 + 深色岩块团,地图外也是山石,没有方形边界):
   * 整块铺灰 → 本图地面贴图放大平铺做纹理(半透明)→ 大件装饰处叠几团两色圆当岩块。
   */
  private mountMinimapTerrain(content: Node, def: WorldMapDef, mapScale: number): void {
    const w = def.width * mapScale;
    const h = def.height * mapScale;
    const big = Math.max(w, h) * 2;
    const holder = this.host.addChildPlainNode(content, 'Terrain', 0, 0, big, big);
    const base = holder.addComponent(Graphics);
    base.fillColor = rgba(108, 110, 114, 255);
    base.rect(-big / 2, -big / 2, big, big);
    base.fill();
    const tex = this.host.addSprite('Tex', def.ground, 0, 0, big, big, holder);
    const frame = tex?.spriteFrame;
    if (tex && frame) {
      // 一格铺成约 1/3 圆径,看得出是地表纹理而不是噪点
      const k = (w * 0.28) / Math.max(1, frame.originalSize.width);
      tex.type = Sprite.Type.TILED;
      tex.sizeMode = Sprite.SizeMode.CUSTOM;
      tex.node.setScale(k, k, 1);
      tex.node.getComponent(UITransform)?.setContentSize(big / k, big / k);
      tex.color = rgba(255, 255, 255, 80);
    }
    const g = this.host.addChildPlainNode(holder, 'Rocks', 0, 0, big, big).addComponent(Graphics);
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const blobs: Array<[number, number, number]> = [];
    for (const prop of def.props) {
      if (prop.flat || prop.width < 160) {
        continue;
      }
      const r = prop.width * mapScale * 0.42;
      for (let i = 0; i < 3; i += 1) {
        blobs.push([prop.x * mapScale + (rand() - 0.5) * r * 1.4, prop.y * mapScale + (rand() - 0.5) * r, r * (0.6 + rand() * 0.5)]);
      }
    }
    // 地图外一圈:密集岩块(原型圆边全是山石)
    const wl = def.walk.left * mapScale;
    const wr = def.walk.right * mapScale;
    const wb = def.walk.bottom * mapScale;
    const wt = def.walk.top * mapScale;
    const step = w * 0.035;
    for (let x = wl - step * 6; x <= wr + step * 6; x += step) {
      for (const y of [wt + step * 1.5, wt + step * 3.5, wb - step * 1.5, wb - step * 3.5]) {
        blobs.push([x + (rand() - 0.5) * step, y + (rand() - 0.5) * step, step * (0.7 + rand() * 0.6)]);
      }
    }
    for (let y = wb - step * 4; y <= wt + step * 4; y += step) {
      for (const x of [wl - step * 1.5, wl - step * 3.5, wr + step * 1.5, wr + step * 3.5]) {
        blobs.push([x + (rand() - 0.5) * step, y + (rand() - 0.5) * step, step * (0.7 + rand() * 0.6)]);
      }
    }
    // 两色:外圈偏蓝灰的软边,里面深色
    g.fillColor = rgba(66, 70, 78, 150);
    for (const [x, y, r] of blobs) {
      g.ellipse(x, y, r * 1.25, r * 1.05);
    }
    g.fill();
    // 左上亮边(原型岩块顶面偏亮)
    g.fillColor = rgba(104, 106, 112, 255);
    for (const [x, y, r] of blobs) {
      g.ellipse(x - r * 0.12, y + r * 0.14, r * 1.02, r * 0.9);
    }
    g.fill();
    g.fillColor = rgba(48, 52, 60, 255);
    for (const [x, y, r] of blobs) {
      g.ellipse(x, y, r, r * 0.86);
    }
    g.fill();
  }

  /** 按素材原比例塞进 boxW × boxH 的框(图标宽高比各不相同,直接拉伸会变形)。 */
  private addFitSprite(name: string, asset: string, x: number, y: number, boxW: number, boxH: number, parent: Node): Sprite | null {
    const sprite = this.host.addSprite(name, asset, x, y, boxW, boxH, parent);
    const frame = sprite?.spriteFrame;
    if (!sprite || !frame) {
      return sprite;
    }
    const size = frame.originalSize;
    const k = Math.min(boxW / Math.max(1, size.width), boxH / Math.max(1, size.height));
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.node.getComponent(UITransform)?.setContentSize(size.width * k, size.height * k);
    return sprite;
  }

  private updateMinimap(): void {
    const me = this.minimapMe;
    const content = this.minimapContent;
    const leader = this.leader;
    if (!me || !me.isValid || !content || !content.isValid || !leader) {
      return;
    }
    content.setPosition(-leader.x * this.minimapScale, -leader.y * this.minimapScale, 0);
    const last = this.minimapLastPos;
    if (last) {
      const dx = leader.x - last.x;
      const dy = leader.y - last.y;
      if (Math.hypot(dx, dy) > 3) {
        me.angle = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
        this.minimapLastPos = { x: leader.x, y: leader.y };
      }
    } else {
      this.minimapLastPos = { x: leader.x, y: leader.y };
    }
  }

  private renderGuideTracker(hud: Node, layout: UiLayout, scale: number, guide: TownGuideTarget | null): void {
    this.trackerLabel = null;
    if (!guide) {
      return;
    }
    const cfg = this.guideTargetPoint(guide);
    if (!cfg) {
      return;
    }
    const w = Math.min(460 * scale, layout.stageWidth * 0.5);
    const h = 44 * scale;
    const node = this.host.addChildPlainNode(hud, 'LobbyTownGuideTracker', (layout.stageLeft + layout.stageRight) / 2, layout.stageTop - 36 * scale, w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 10, 200);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = rgba(214, 170, 92, 220);
    g.lineWidth = Math.max(1, 1.6 * scale);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();
    const label = this.host.addChildLabel(node, 'Label', `前往「${cfg.label}」· ${guide.text}`, 0, 1, 19 * scale, rgba(255, 236, 190), new Size(w - 24 * scale, 28 * scale));
    label.overflow = Label.Overflow.SHRINK;
    this.trackerLabel = label;
  }

  /** 引导目标点:任务追踪给的地图点,或主城建筑门口。 */
  private guideTargetPoint(guide: TownGuideTarget): { x: number; y: number; label: string } | null {
    if (guide.point) {
      return guide.point;
    }
    const cfg = this.def.buildings.find((item) => item.key === guide.building);
    return cfg ? { x: cfg.x + cfg.door.x, y: cfg.y + cfg.door.y, label: cfg.label } : null;
  }

  private mountGuidePointer(guide: TownGuideTarget | null): void {
    this.guidePointer?.isValid && this.guidePointer.destroy();
    this.guidePointer = null;
    const leader = this.leader;
    if (!guide || !leader || !leader.node.isValid) {
      return;
    }
    const pointerH = 70;
    const pointerW = pointerH * (192 / 256);
    const holder = this.host.addChildPlainNode(leader.node, 'GuidePointer', 0, HERO_SLOT_H + 60, pointerW, pointerH);
    const art = this.host.addChildPlainNode(holder, 'Art', 0, 0, pointerW, pointerH);
    if (!this.host.addSprite('Img', 'ui/guide/lguide_pointer/spriteFrame', 0, 0, pointerW, pointerH, art)) {
      const g = art.addComponent(Graphics);
      g.fillColor = rgba(255, 214, 110, 240);
      g.moveTo(-pointerW * 0.3, pointerH * 0.3);
      g.lineTo(pointerW * 0.3, pointerH * 0.3);
      g.lineTo(0, -pointerH * 0.4);
      g.close();
      g.fill();
    }
    tween(art).repeatForever(tween<Node>().to(0.5, { position: new Vec3(0, 10, 0) }).to(0.5, { position: new Vec3(0, 0, 0) })).start();
    this.guidePointer = holder;
  }

  private updateGuidePointer(): void {
    const holder = this.guidePointer;
    const guide = this.guide;
    const leader = this.leader;
    if (!holder || !holder.isValid || !guide || !leader) {
      return;
    }
    const cfg = this.guideTargetPoint(guide);
    if (!cfg) {
      return;
    }
    const dx = cfg.x - leader.x;
    const dy = cfg.y - leader.y;
    const near = Math.hypot(dx, dy) < INTERACT_RADIUS;
    // 10-28 录屏:战斗里橙色指引箭头和红色锁定箭头混在一起 → 交战中藏起来(指针是 Sprite,active 开关没有 Graphics 的坑)
    holder.active = !near && !this.inCombat;
    if (this.trackerLabel && this.trackerLabel.isValid) {
      this.trackerLabel.string = near ? `到了「${cfg.label}」· 点交互提示` : `前往「${cfg.label}」· ${guide.text}`;
    }
    if (near) {
      return;
    }
    // 指针素材默认朝下(-y):朝向 θ 需转 θ+90°
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    holder.angle = angle;
    // 指针挂在队长头顶,随队长翻面时不能跟着镜像:holder 不在 spine 下,无需处理
  }

  // ── docs/50:NPC / 传送阵 / 出口 / 明雷怪 ──

  private ensureNpcs(): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      return;
    }
    for (const npc of this.def.npcs) {
      if (!npc.asset) {
        continue;
      }
      const name = `TownNpc_${npc.code}`;
      if (root.getChildByName(name)) {
        continue;
      }
      const node = this.host.addChildPlainNode(root, name, npc.x, npc.y, 120, npc.height);
      const sprite = this.host.addSprite('Art', npc.asset, 0, 0, 100, npc.height, node);
      if (!sprite) {
        node.destroy();
        continue;
      }
      const frame = sprite.spriteFrame;
      const ow = frame?.originalSize.width ?? 1;
      const oh = frame?.originalSize.height ?? 1;
      const w = npc.height * (ow / Math.max(1, oh));
      sprite.node.getComponent(UITransform)?.setContentSize(new Size(w, npc.height));
      sprite.node.setPosition(0, npc.height / 2, 0);
      sprite.node.setScale(npc.flip, 1, 1);
      const shadow = node.addComponent(Graphics);
      shadow.fillColor = rgba(0, 0, 0, 110);
      shadow.ellipse(0, 2, w * 0.36, 9);
      shadow.fill();
      // 头顶名牌 + 任务标记(! 可接 / ? 可交)
      const plate = this.host.addChildLabel(node, 'Name', npc.name, 0, npc.height + 18, 20, rgba(250, 232, 190), new Size(220, 28));
      plate.enableOutline = true;
      plate.outlineColor = rgba(16, 8, 4, 255);
      plate.outlineWidth = 2;
      const marker = this.host.addChildLabel(node, 'Marker', '', 0, npc.height + 52, 44, rgba(255, 210, 80), new Size(60, 56));
      marker.isBold = true;
      marker.enableOutline = true;
      marker.outlineColor = rgba(40, 20, 0, 255);
      marker.outlineWidth = 3;
      tween(marker.node).repeatForever(tween<Node>().by(0.6, { position: new Vec3(0, 8, 0) }).by(0.6, { position: new Vec3(0, -8, 0) })).start();
      this.npcNodes.push({ code: npc.code, node, y: npc.y });
    }
  }

  /** NPC 头顶标记:有可接任务 = 金色 !;有可交任务 = 金色 ?;进行中 = 灰色 ?。 */
  private refreshNpcMarkers(world: WorldStateVO | null): void {
    for (const entry of this.npcNodes) {
      const marker = entry.node.isValid ? entry.node.getChildByName('Marker')?.getComponent(Label) : null;
      if (!marker) {
        continue;
      }
      const quests = world?.quests ?? [];
      const done = quests.some((quest) => quest.state === 'DONE' && quest.turnInNpc === entry.code);
      const available = quests.some((quest) => quest.state === 'AVAILABLE' && quest.acceptNpc === entry.code);
      const pending = quests.some((quest) => quest.state === 'ACCEPTED' && quest.turnInNpc === entry.code);
      marker.string = done ? '?' : available ? '!' : pending ? '?' : '';
      marker.color = done || available ? rgba(255, 210, 80) : rgba(170, 170, 170);
    }
  }

  private ensureWaypoint(): void {
    const root = this.entityRoot;
    const ground = this.groundRoot;
    if (!root || !root.isValid || !ground || !ground.isValid || this.waypointGlow) {
      return;
    }
    const wp = this.def.waypoint;
    // 符文光圈(贴地,压在地砖上;按地砖透视压扁)
    const glowNode = this.host.addChildPlainNode(ground, 'TownWaypointGlow', wp.x, wp.y, 400, 240);
    const vignette = ground.getChildByName('Vignette');
    if (vignette) {
      glowNode.setSiblingIndex(vignette.getSiblingIndex());
    }
    this.waypointGlow = glowNode.addComponent(Graphics);
    // 激活后的旋转符文环 / 呼吸光 / 光点(2026-10-27 主城 HUD 原型 v1);野外石台的挂到石台台面上(见下)
    if (!wp.drawn) {
      this.waypointFx = new TownWaypointFx(this.host, ground, wp.x, wp.y, 290);
      if (vignette) {
        this.waypointFx.node.setSiblingIndex(vignette.getSiblingIndex());
      }
    }
    if (wp.drawn) {
      const node = this.host.addChildPlainNode(root, 'TownWaypoint', wp.x, wp.y, 300, 200);
      const sprite = this.host.addSprite('Art', 'ui/world/waypoint/spriteFrame', 0, 0, 300, 190, node);
      if (sprite) {
        const frame = sprite.spriteFrame;
        const ow = frame?.originalSize.width ?? 1;
        const oh = frame?.originalSize.height ?? 1;
        const w = 300;
        const h = w * (oh / Math.max(1, ow));
        sprite.node.getComponent(UITransform)?.setContentSize(new Size(w, h));
        sprite.node.setPosition(0, h * 0.32, 0);
        this.waypointNode = node;
        // 10-29 用户「传送阵特效没显示」:符文环原在地面层、被石台盖住只露底边一段 → 挂到石台台面中心(贴图 y 140 / 322)、
        // 对齐台面蓝色内圈(半径 ≈ 宽 × 0.35)、按台面透视压扁 0.53,画在石台之上
        this.waypointFx = new TownWaypointFx(this.host, node, 0, h * 0.32 + h * (161 - 140) / 322, w * 0.34, 0.53);
      } else {
        node.destroy();
        this.waypointFx = new TownWaypointFx(this.host, ground, wp.x, wp.y, 120);
      }
    }
    this.refreshWaypointGlow(this.host.currentWorldState?.() ?? null);
  }

  /** 传送阵符文:已激活亮蓝,未激活暗灰(docs/50 §5.4)。 */
  private refreshWaypointGlow(world: WorldStateVO | null): void {
    const g = this.waypointGlow;
    if (!g || !g.isValid) {
      return;
    }
    const activated = !!world?.maps.find((map) => map.mapCode === this.mapCode)?.activated;
    const city = !this.def.waypoint.drawn;
    const rx = city ? 290 : 120;
    const ry = rx * 0.56;
    g.clear();
    this.waypointFx?.setActive(activated);
    // 激活后符文环 / 呼吸光交给 TownWaypointFx;这里只补一道细内圈,未激活画暗灰圈
    const rings = activated ? [[0.62, 70]] : [[1, 40], [0.8, 50]];
    for (const [k, alpha] of rings) {
      g.strokeColor = activated ? rgba(110, 200, 255, alpha) : rgba(150, 150, 160, alpha);
      g.lineWidth = activated ? 3 : 3;
      g.ellipse(0, 0, rx * k, ry * k);
      g.stroke();
    }
  }

  private ensureExits(): void {
    const ground = this.groundRoot;
    const root = this.entityRoot;
    if (!ground || !ground.isValid || !root || !root.isValid) {
      return;
    }
    for (const exit of this.def.exits) {
      const name = `TownExit_${exit.key}`;
      if (ground.getChildByName(name)) {
        continue;
      }
      const node = this.host.addChildPlainNode(ground, name, exit.x, exit.y, exit.radius * 2, exit.radius * 1.2);
      const vignette = ground.getChildByName('Vignette');
      if (vignette) {
        node.setSiblingIndex(vignette.getSiblingIndex());
      }
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(255, 220, 140, 40);
      g.ellipse(0, 0, exit.radius, exit.radius * 0.56);
      g.fill();
      g.strokeColor = rgba(255, 220, 140, 150);
      g.lineWidth = 3;
      g.ellipse(0, 0, exit.radius, exit.radius * 0.56);
      g.stroke();
      const plate = this.host.addChildLabel(node, 'Label', exit.label, 0, exit.radius * 0.56 + 26, 22, rgba(255, 232, 180), new Size(260, 30));
      plate.enableOutline = true;
      plate.outlineColor = rgba(16, 8, 4, 255);
      plate.outlineWidth = 2;
    }
  }

  private checkExitsAndWaypoint(): void {
    const leader = this.leader;
    if (!leader || this.battleLock) {
      return;
    }
    const now = Date.now();
    if (now >= this.exitCooldownUntil) {
      const exit: WorldMapExit | undefined = this.def.exits.find((item) => Math.hypot(item.x - leader.x, item.y - leader.y) < item.radius * 0.7);
      if (exit) {
        this.exitCooldownUntil = now + 3000;
        this.host.travelWorldMap?.(exit.toMap, exit.toSpawn, exit.reach);
        return;
      }
    }
    const wp = this.def.waypoint;
    if (Math.hypot(wp.x - leader.x, wp.y - leader.y) < WAYPOINT_RADIUS && !this.waypointReported.has(this.mapCode)) {
      const world = this.host.currentWorldState?.() ?? null;
      const state = world?.maps.find((map) => map.mapCode === this.mapCode);
      if (state && !state.activated && state.unlocked) {
        this.waypointReported.add(this.mapCode);
        this.host.activateWorldWaypoint?.(this.mapCode);
      }
    }
  }

  /** 传送阵首次激活成功(服务端已记账):本图就在脚下 → 光柱 / 冲击环 / 音效 / 屏幕中上横幅。 */
  playWaypointActivated(mapCode: string): void {
    if (mapCode !== this.mapCode) {
      return;
    }
    this.waypointFx?.playActivation();
    gameAudio.sfx('waypoint_activate', 1);
    this.shake(5, 0.25);
    const layout = this.hudLayout;
    const hud = this.hudNode;
    if (!layout || !hud || !hud.isValid) {
      return;
    }
    const P = townProtoFrame(layout);
    const w = P.S(520);
    const h = P.S(64);
    const banner = this.host.addChildPlainNode(hud, 'WaypointActivatedBanner', P.C(935), P.Y(200), w, h);
    mountGlassSlice(this.host as never, banner, 'Bg', GLASS_SLICES.hudCapsule, 0, 0, w, h, h / 48);
    const label = this.host.addChildLabel(banner, 'Text', `已激活 · ${this.def.name}传送阵`, 0, 0, P.S(26), rgba(196, 232, 255), new Size(w - P.S(40), h));
    label.isBold = true;
    banner.setScale(0.7, 0.7, 1);
    const fade = banner.addComponent(UIOpacity);
    tween(banner).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    tween(fade).delay(2.2).to(0.5, { opacity: 0 }).call(() => banner.isValid && banner.destroy()).start();
  }

  private ensureMonsters(): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      return;
    }
    const now = Date.now();
    for (const camp of this.def.camps) {
      const respawnAt = this.campRespawnAt.get(camp.stageCode) ?? 0;
      if (respawnAt > now || this.monsters.some((monster) => monster.camp.stageCode === camp.stageCode)) {
        continue;
      }
      // 玩家还站在营地里:先不刷(否则一刷出来就撞上直接开战),走远了下次 render 再刷
      const leader = this.leader;
      if (respawnAt > 0 && leader && Math.hypot(leader.x - camp.x, leader.y - camp.y) < camp.radius + MONSTER_AGGRO_RADIUS) {
        continue;
      }
      for (let i = 0; i < camp.count; i += 1) {
        const angle = (Math.PI * 2 * i) / Math.max(1, camp.count);
        const x = camp.x + Math.cos(angle) * camp.radius * 0.5;
        const y = camp.y + Math.sin(angle) * camp.radius * 0.3;
        this.monsters.push(this.createMonster(root, camp, i, x, y));
      }
    }
  }

  private createMonster(parent: Node, camp: WorldMapCamp, index: number, x: number, y: number): TownMonster {
    const node = this.host.addChildPlainNode(parent, `TownMonster_${camp.stageCode}_${index}`, x, y, 160, 200);
    const shadow = node.addComponent(Graphics);
    shadow.fillColor = rgba(0, 0, 0, 110);
    shadow.ellipse(0, 2, camp.elite ? 70 : 44, camp.elite ? 14 : 9);
    shadow.fill();
    const target = camp.elite ? 250 : 140;
    // docs/51 §7:名字只在被锁定时显示(满屏名字太乱)
    const label = this.host.addChildLabel(node, 'Name', `${camp.label.replace(/群|窝|巢|哨岗|营地/g, '') || camp.label} Lv.${camp.level}`, 0, target + 24, 21,
      rgba(250, 236, 214), new Size(240, 28));
    label.enableOutline = true;
    label.outlineColor = rgba(16, 6, 4, 255);
    label.outlineWidth = 2;
    label.node.active = false;
    if (camp.elite) {
      // 精英:脚下淡黄光圈(原型 p2)
      const ring = this.host.addChildPlainNode(node, 'EliteRing', 0, 0, 200, 80).addComponent(Graphics);
      ring.strokeColor = rgba(255, 214, 110, 170);
      ring.lineWidth = 3;
      ring.ellipse(0, 0, 90, 26);
      ring.stroke();
    }
    const monster: TownMonster = {
      camp, node, x, y, homeX: x, homeY: y, tx: x, ty: y, nextPickAt: Date.now() + 500 + Math.random() * 1500,
      facing: -1, baseScale: 1, skeleton: null, spineNode: null, idleAnim: '', moveAnim: '', moving: false,
      hp: 0, maxHp: 0, hit: 1, ranged: false, dead: false, diedAt: 0, nextAttackAt: 0, windupUntil: 0,
      attackAnim: '', deathAnim: '', hpBar: null, hpDrawn: -1, flashUntil: 0, lastHitAt: 0, hpKey: '', nameLabel: label, victim: null, stagger: 0, staggeredUntil: 0, floatAt: 0, floatSeq: 0,
      curAnim: '', animLockUntil: 0, moveSince: 0, kbVX: 0, shotFx: null,
    };
    // 点怪直接锁它
    node.on(Node.EventType.TOUCH_END, () => {
      if (!monster.dead) {
        this.setLockTarget(monster);
      }
    }, this);
    monster.hpBar = this.host.addChildPlainNode(node, 'HpBar', 0, target + 4, 110, 12).addComponent(Graphics);
    if (!camp.spine) {
      return monster;
    }
    const spineNode = this.host.addChildPlainNode(node, 'Spine', 0, 0, 200, 200);
    const skeleton = spineNode.addComponent(sp.Skeleton);
    skeleton.premultipliedAlpha = false;
    loadSharedSpineData(camp.spine, null, 'TownMonster', (data) => {
      if (!data || !node.isValid || !spineNode.isValid) {
        return;
      }
      try {
        const runtimeData = resolveBattleUnitSpineRuntimeData(data);
        if (runtimeData) {
          patchBattleUnitSpineRuntimeEnums(data, runtimeData);
        }
        skeleton.skeletonData = data;
        // S196 怪物骨骼没有 default 皮肤,不设皮肤一个附件都不画(和守卫战同一根因)
        const skin = runtimeData ? resolveBattleUnitSpineSkinName(data, runtimeData) : null;
        if (skin) {
          skeleton.setSkin(skin);
          skeleton.setSlotsToSetupPose();
        }
        const runtime = data.getRuntimeData(true) as unknown as { height?: number; animations?: Array<{ name: string }> } | null;
        const names = (runtime?.animations ?? []).map((item) => item.name);
        // 10-29 用户「怪物站着像卡了」:旧写法按"名字带 idle"取第一个,拿到的是 beaten_knockback_bounce_link_idle(0.5 秒受击接回过渡)
        // 在循环播;移动也会拿到 p3_attack_rush_01_run(冲锋攻击)。改为精确名优先,排除受击 / 攻击 / 过渡片段
        monster.idleAnim = pickTownLoopAnim(names, ['idle', 'stand', 'wait'], /idle|stand|wait/i) ?? names[0] ?? '';
        monster.moveAnim = pickTownLoopAnim(names, ['run_b', 'walk', 'run', 'move', 'run_h'], /run|walk|move/i) ?? monster.idleAnim;
        monster.attackAnim = names.find((name) => /atk|attack/i.test(name) && !/hit|hurt/i.test(name)) ?? '';
        monster.deathAnim = names.find((name) => /die|dead|death/i.test(name)) ?? '';
        const height = Math.max(40, runtime?.height ?? 200);
        const dir = camp.spine.split('/')[2] ?? '';
        monster.baseScale = (target * (GUARD_MONSTER_DB_SCALE[dir] ?? 1)) / height;
        spineNode.setScale(monster.baseScale * MONSTER_ART_FACING * monster.facing, monster.baseScale, 1);
        monster.skeleton = skeleton;
        monster.spineNode = spineNode;
        mixAll(skeleton, [monster.idleAnim, monster.moveAnim, monster.attackAnim], 0.1);
        monster.shotFx = resolveGuardMonsterProjectileFx(dir);
        if (monster.shotFx) {
          this.fx.prewarm(monster.shotFx);
        }
        if (monster.idleAnim) {
          skeleton.setAnimation(0, monster.idleAnim, true);
          monster.curAnim = monster.idleAnim;
        }
      } catch (error) {
        console.warn('[Town] monster spine failed', camp.spine, error);
      }
    });
    return monster;
  }

  /**
   * 明雷怪(docs/50 §14 即时战斗):营地里游走;队长进警戒圈 → 登记遭遇并追击;
   * 近战贴身、远程保持距离,蓄力 0.35 秒后出手;死了播死亡 / 淡出,一营全灭上报清怪。
   */
  private stepMonsters(dt: number): void {
    const leader = this.leader;
    if (!leader || this.monsters.length === 0) {
      return;
    }
    const now = Date.now();
    for (const monster of this.monsters) {
      if (!monster.node.isValid) {
        continue;
      }
      if (monster.dead) {
        continue;
      }
      const camp = monster.camp;
      const toLeader = Math.hypot(leader.x - monster.x, leader.y - monster.y);
      const leashed = Math.hypot(monster.x - camp.x, monster.y - camp.y) > camp.radius + 520;
      const engaged = this.encounters.has(camp.stageCode);
      // docs/51:追打离自己最近的在场队员(队长 / 队友),不再只盯队长
      const victim = engaged ? this.monsterVictim(monster) : this.leaderDead ? null : leader;
      const toVictim = victim ? Math.hypot(victim.x - monster.x, victim.y - monster.y) : Number.POSITIVE_INFINITY;
      const chasing = !!victim && !this.leaderDead && !leashed && (toLeader < MONSTER_AGGRO_RADIUS || (engaged && toVictim < MONSTER_AGGRO_RADIUS * 2.2));
      monster.victim = chasing ? victim : null;
      let speed = MONSTER_WANDER_SPEED;
      if (chasing && victim) {
        if (!engaged) {
          this.engageCamp(camp.stageCode);
        }
        // 近战停在身前 70,远程停在 300 外
        const keep = monster.ranged ? 300 : 70;
        const dxL = monster.x - victim.x;
        const dyL = monster.y - victim.y;
        const len = Math.max(1, Math.hypot(dxL, dyL));
        monster.tx = victim.x + (dxL / len) * keep;
        monster.ty = victim.y + (dyL / len) * keep * 0.6;
        speed = MONSTER_CHASE_SPEED;
        this.tryMonsterAttack(monster, victim, toVictim, now);
      } else if (leashed) {
        monster.tx = monster.homeX;
        monster.ty = monster.homeY;
        speed = MONSTER_CHASE_SPEED;
        // 脱战回营:血回满(遭遇留着,下次再打照旧登记)
        if (monster.maxHp > 0 && monster.hp < monster.maxHp) {
          monster.hp = monster.maxHp;
          this.drawMonsterHp(monster);
        }
      } else if (now >= monster.nextPickAt) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * camp.radius;
        monster.tx = camp.x + Math.cos(angle) * r;
        monster.ty = camp.y + Math.sin(angle) * r * 0.6;
        monster.nextPickAt = now + 1800 + Math.random() * 2600;
      }
      const winding = now < monster.windupUntil || now < monster.staggeredUntil || now < monster.animLockUntil;
      const dx = monster.tx - monster.x;
      const dy = monster.ty - monster.y;
      const dist = Math.hypot(dx, dy);
      // 回差:走着的 3 以内才停、停着的 16 以外才走(原先 6 一刀切,追击目标点抖动 → 跑 / 待机每帧来回切、待机动画反复从头播)
      const moving = !winding && dist > (monster.moving ? 3 : 16);
      // 击退:速度逐帧衰减
      if (Math.abs(monster.kbVX) > 5) {
        const kx = monster.x + monster.kbVX * dt;
        if (this.walkable(kx, monster.y)) {
          monster.x = kx;
          monster.node.setPosition(monster.x, monster.y, 0);
        }
        monster.kbVX *= Math.exp(-14 * dt);
      } else {
        monster.kbVX = 0;
      }
      if (moving) {
        const step = Math.min(dist, speed * dt);
        const nx = monster.x + (dx / dist) * step;
        const ny = monster.y + (dy / dist) * step * 0.8;
        if (this.walkable(nx, ny)) {
          monster.x = nx;
          monster.y = ny;
          monster.node.setPosition(nx, ny, 0);
        } else {
          monster.nextPickAt = now;
        }
      }
      const faceX = chasing && victim ? victim.x - monster.x : dx;
      if (Math.abs(faceX) > 3) {
        const facing: 1 | -1 = faceX > 0 ? 1 : -1;
        if (facing !== monster.facing) {
          monster.facing = facing;
          monster.spineNode?.setScale(monster.baseScale * MONSTER_ART_FACING * facing, monster.baseScale, 1);
        }
      }
      // 状态切换至少隔 160ms;一次性动作(攻击)锁期间不切
      if (!winding && moving !== monster.moving && now - monster.moveSince > 160) {
        monster.moving = moving;
        monster.moveSince = now;
        this.setMonsterLoop(monster, moving);
      }
      this.drawMonsterHp(monster);
      // 受击闪红(只在变化时写颜色)
      if (monster.skeleton && monster.skeleton.isValid) {
        const flash = now < monster.flashUntil;
        const want = flash ? 1 : 0;
        if ((monster as unknown as { __flash?: number }).__flash !== want) {
          (monster as unknown as { __flash?: number }).__flash = want;
          monster.skeleton.color = flash ? rgba(255, 120, 110, 255) : rgba(255, 255, 255, 255);
        }
      }
    }
    // 死亡淡出 1.2 秒后移除
    for (const monster of this.monsters) {
      if (monster.dead && now - monster.diedAt > 1200 && monster.node.isValid) {
        monster.node.destroy();
      }
    }
    this.monsters = this.monsters.filter((monster) => monster.node.isValid);
  }

  // ── docs/50:任务追踪 / 回城 / 读条 / 区域横幅 ──

  /** 当前剧情任务 → 引导目标点(本图 NPC / 怪群 / 传送阵;目标在别的图就指向本图传送阵或出口)。 */
  private resolveQuestGuide(world: WorldStateVO | null): TownGuideTarget | null {
    const quest = this.primaryQuest(world);
    if (!quest) {
      return null;
    }
    const def = this.def;
    if (quest.state === 'LOCKED') {
      // 等级不够接下一条剧情(2026-10-27 UI 审核):指去村外林地打怪升级
      if (this.mapCode === 'WOODS') {
        const camp = def.camps[0];
        return camp ? { building: '', point: { x: camp.x, y: camp.y, label: camp.label }, text: `打怪升到 Lv.${quest.minLevel}` } : null;
      }
      const exit = def.exits.find((item) => item.toMap === 'WOODS');
      const point = exit ? { x: exit.x, y: exit.y, label: exit.label } : { x: def.waypoint.x, y: def.waypoint.y, label: '传送阵 · 去村外林地' };
      return { building: '', point, text: `去村外林地打怪升到 Lv.${quest.minLevel}` };
    }
    const npcPoint = (code: string): { x: number; y: number; label: string } | null => {
      const npc = def.npcs.find((item) => item.code === code);
      if (npc) {
        return { x: npc.x, y: npc.y, label: npc.name };
      }
      const building = def.buildings.find((item) => item.npc === code);
      return building ? { x: building.x + building.door.x, y: building.y + building.door.y, label: building.label } : null;
    };
    const travel = (mapCode: string): { x: number; y: number; label: string } => {
      const exit = def.exits.find((item) => item.toMap === mapCode);
      if (exit) {
        return { x: exit.x, y: exit.y, label: exit.label };
      }
      const target = worldMapDef(mapCode as WorldMapCode);
      return { x: def.waypoint.x, y: def.waypoint.y, label: `传送阵 · 去${target.name}` };
    };
    let point: { x: number; y: number; label: string } | null = null;
    if (quest.state === 'AVAILABLE') {
      point = npcPoint(quest.acceptNpc);
    } else if (quest.state === 'DONE' || quest.objective === 'TALK' || quest.objective === 'GROW') {
      point = npcPoint(quest.state === 'DONE' || quest.objective !== 'TALK' ? quest.turnInNpc : quest.objectiveTarget);
      if (!point && quest.map !== this.mapCode) {
        point = travel(this.villageOrCity(world));
      }
    } else if (quest.objective === 'KILL' || quest.objective === 'COLLECT') {
      if (quest.map !== this.mapCode) {
        point = travel(quest.map);
      } else {
        const code = quest.objective === 'COLLECT' ? 'SMALL_SPIDER' : quest.objectiveTarget;
        const camp = code.startsWith('stage:')
          ? def.camps.find((item) => item.stageCode === code.slice(6))
          : def.camps.find((item) => item.monsterCode === code);
        point = camp ? { x: camp.x, y: camp.y, label: camp.label } : null;
      }
    }
    if (!point) {
      return null;
    }
    return { building: '', point, text: quest.name };
  }

  private villageOrCity(world: WorldStateVO | null): WorldMapCode {
    return world?.villageDone ? 'CITY' : 'VILLAGE';
  }

  private primaryQuest(world: WorldStateVO | null) {
    const quests = world?.quests ?? [];
    return quests.find((quest) => quest.state === 'DONE')
      ?? quests.find((quest) => quest.state === 'ACCEPTED')
      ?? quests.find((quest) => quest.state === 'AVAILABLE')
      ?? quests.find((quest) => quest.state === 'LOCKED')
      ?? null;
  }

  /** 左侧任务追踪条(原型 p1 / p2):剧情一条 + 已接悬赏。 */
  private renderQuestTracker(hud: Node, layout: UiLayout, scale: number, world: WorldStateVO | null): void {
    void scale;
    // 原型 v3:小地图下方无底板的一行行追踪——金菱 = 剧情(主行 + 灰副行)、蓝菱 = 悬赏;点任意一行打开任务详情
    const P = townProtoFrame(layout);
    hud.getChildByName('LobbyWorldQuestTracker')?.destroy();
    const top = this.minimapBottomY - P.S(18);
    this.trackerBottomY = top;
    const quest = this.primaryQuest(world);
    const bounties = (world?.bounties ?? []).filter((item) => item.state === 'ACCEPTED' || item.state === 'DONE');
    const rows: Array<{ text: string; sub: string; tone: 'story' | 'bounty' }> = [];
    if (quest) {
      const progress = quest.objective === 'KILL' || quest.objective === 'COLLECT' ? ` ${Math.min(quest.progress, quest.target)}/${quest.target}` : '';
      const status = quest.state === 'DONE' ? ' · 可交付' : quest.state === 'AVAILABLE' ? ' · 可接取' : '';
      const sub = quest.state === 'LOCKED' ? `Lv.${quest.minLevel} 可接 · 去村外林地升级` : this.def.camps.length > 0 ? '' : quest.desc.replace(/[。.]$/, '');
      rows.push({ text: `${quest.name}${progress}${status}`, sub, tone: 'story' });
    }
    for (const bounty of bounties.slice(0, 2)) {
      rows.push({ text: `悬赏 · ${bounty.name} ${Math.min(bounty.progress, bounty.target)}/${bounty.target}${bounty.state === 'DONE' ? ' · 可领取' : ''}`, sub: '', tone: 'bounty' });
    }
    if (rows.length === 0) {
      return;
    }
    const w = P.S(380);
    const rowH = (row: { sub: string }) => P.S(row.sub ? 70 : 42);
    const h = rows.reduce((sum, row) => sum + rowH(row), 0);
    const left = P.L(44);
    const node = this.host.addChildPlainNode(hud, 'LobbyWorldQuestTracker', left + w / 2, top - h / 2, w, h);
    this.trackerBottomY = top - h;
    // 暗色衬底:左实右淡的渐变条,比文字区上下各多出一点(原型追踪条下面压着一层暗影)
    const band = this.host.addSprite('Backing', TOWN_HUD_ASSETS.fadeBand, -P.S(20), 0, w + P.S(110), h + P.S(40), node);
    if (band) {
      band.color = rgba(6, 5, 8, 150);
    }
    let y = h / 2;
    rows.forEach((row, index) => {
      const lineY = y - P.S(18);
      const diamond = this.host.addChildPlainNode(node, `Mark_${index}`, -w / 2 + P.S(18), lineY, P.S(28), P.S(28)).addComponent(Graphics);
      const d = P.S(11);
      const edge = row.tone === 'story' ? rgba(236, 184, 90, 255) : rgba(110, 180, 255, 255);
      diamond.fillColor = rgba(20, 14, 10, 220);
      diamond.moveTo(0, d);
      diamond.lineTo(d, 0);
      diamond.lineTo(0, -d);
      diamond.lineTo(-d, 0);
      diamond.close();
      diamond.fill();
      diamond.strokeColor = edge;
      diamond.lineWidth = Math.max(1.5, P.S(2.5));
      diamond.moveTo(0, d);
      diamond.lineTo(d, 0);
      diamond.lineTo(0, -d);
      diamond.lineTo(-d, 0);
      diamond.close();
      diamond.stroke();
      diamond.fillColor = edge;
      const c = P.S(4);
      diamond.moveTo(0, c);
      diamond.lineTo(c, 0);
      diamond.lineTo(0, -c);
      diamond.lineTo(-c, 0);
      diamond.close();
      diamond.fill();
      const textX = -w / 2 + P.S(44);
      const textW = w - P.S(48);
      const main = this.host.addChildLabel(node, `Text_${index}`, row.text, textX, lineY, P.S(24), rgba(246, 238, 222), new Size(textW, P.S(32)), HorizontalTextAlignment.LEFT);
      main.overflow = Label.Overflow.SHRINK;
      main.enableOutline = true;
      main.outlineColor = rgba(0, 0, 0, 220);
      main.outlineWidth = Math.max(1, P.S(2));
      if (row.sub) {
        const sub = this.host.addChildLabel(node, `Sub_${index}`, row.sub, textX, lineY - P.S(30), P.S(19), rgba(200, 190, 170), new Size(textW, P.S(26)), HorizontalTextAlignment.LEFT);
        sub.overflow = Label.Overflow.SHRINK;
        sub.enableOutline = true;
        sub.outlineColor = rgba(0, 0, 0, 200);
        sub.outlineWidth = 1;
      }
      y -= rowH(row);
    });
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.openWorldQuestTracker?.(), this);
    this.host.applyImageButtonFeedback(node, 1.01, 0.99);
  }

  private positionRecallButton(layout: UiLayout): void {
    const button = this.recallButton;
    if (!button || !button.isValid) {
      return;
    }
    const P = townProtoFrame(layout);
    const size = button.getComponent(UITransform)!.contentSize.width;
    button.setPosition(P.L(44) + size / 2, this.trackerBottomY - P.S(26) - size / 2, 0);
  }

  /** 野外 / 林地左侧「回城」(5 秒读条,移动打断):追踪条下方的小圆钮。 */
  private renderRecallButton(hud: Node, layout: UiLayout, scale: number, world: WorldStateVO | null): void {
    void scale;
    const home = this.villageOrCity(world);
    if (this.mapCode === home) {
      return;
    }
    const P = townProtoFrame(layout);
    const size = P.S(64);
    const button = this.host.addChildPlainNode(hud, 'LobbyWorldRecall', 0, 0, size, size);
    this.recallButton = button;
    this.positionRecallButton(layout);
    mountRingBase(this.host, button, size * 1.12);
    this.addFitSprite('Icon', TOWN_HUD_ASSETS.icRecall, 0, 0, size * 0.52, size * 0.52, button);
    const label = this.host.addChildLabel(button, 'Label', home === 'CITY' ? '回城' : '回村', 0, -size * 0.5 - P.S(12), P.S(18), rgba(244, 230, 200), new Size(P.S(90), P.S(26)));
    label.enableOutline = true;
    label.outlineColor = rgba(0, 0, 0, 230);
    label.outlineWidth = 2;
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => {
      this.startChannel(5, home === 'CITY' ? '回城中…' : '回村中…', () => this.host.travelWorldMap?.(home, null));
    }, this);
    this.host.applyImageButtonFeedback(button, 1.05, 0.95);
  }

  /** docs/51 §4:主界面不放经验条;玩家升级时屏幕中上方弹「Lv.X ↑」2 秒。 */
  private renderLevelToast(hud: Node, layout: UiLayout): void {
    const level = this.host.currentLobbyProfile().playerLevel ?? 0;
    const previous = this.lastPlayerLevel;
    this.lastPlayerLevel = level;
    if (previous <= 0 || level <= previous) {
      return;
    }
    const P = townProtoFrame(layout);
    const node = this.host.addChildPlainNode(hud, 'LobbyLevelToast', P.C(935), P.Y(230), P.S(360), P.S(80));
    // 10-28 用户:「这个是什么等级」→ 写明是玩家等级;副行写这一级实际带来的东西(英雄等级上限 = 玩家等级 + 10,服务端 levelProgress.maxHeroLevel)
    const label = this.host.addChildLabel(node, 'Label', `玩家等级 Lv.${level} ↑`, 0, 0, P.S(40), rgba(255, 220, 120), new Size(P.S(520), P.S(60)));
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(60, 24, 4, 255);
    label.outlineWidth = Math.max(2, P.S(3));
    const profile = this.host.currentLobbyProfile();
    const heroCap = profile.levelProgress?.maxHeroLevel ?? level + 10;
    // 跨过 5 的倍数:服务端投了升级礼包邮件(docs/08),副行改提示去邮箱领
    const gotPack = Math.floor(level / 5) > Math.floor(previous / 5);
    const subText = gotPack ? `升级礼包已送到邮箱 · 英雄等级上限 Lv.${heroCap}` : `英雄等级上限提升至 Lv.${heroCap}`;
    const sub = this.host.addChildLabel(node, 'Sub', subText, 0, -P.S(38), P.S(20), gotPack ? rgba(255, 214, 120) : rgba(246, 232, 200), new Size(P.S(520), P.S(28)));
    sub.enableOutline = true;
    sub.outlineColor = rgba(0, 0, 0, 230);
    sub.outlineWidth = 2;
    const opacity = node.addComponent(UIOpacity);
    node.setScale(0.6, 0.6, 1);
    tween(node).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    tween(opacity).delay(1.8).to(0.4, { opacity: 0 }).call(() => node.isValid && node.destroy()).start();
  }

  /** 读条:传送 3 秒 / 回城 5 秒;任何移动输入打断。 */
  /**
   * 世界地图传送口径(10-28 用户录屏:精英点走 15 秒回传送阵才传送):任何地方都能传;
   * 站在传送阵上 0 秒(立即),别处读条 5 秒;交战中(有怪在打)不能传。返回 -1 = 不能传。
   */
  teleportChannelSec(): number {
    if (this.inCombat && this.def.camps.length > 0) {
      return -1;
    }
    return this.nearbyInteracts().some((item) => item.kind === 'waypoint') ? 0 : 5;
  }

  startChannel(seconds: number, label: string, onDone: () => void): void {
    const now = Date.now();
    this.channel = { startAt: now, endAt: now + seconds * 1000, label, onDone };
    this.mountChannelBar();
  }

  private mountChannelBar(): void {
    const hud = this.hudNode;
    const layout = this.hudLayout;
    if (!hud || !hud.isValid || !layout || !this.channel) {
      return;
    }
    this.channelBar?.node.isValid && this.channelBar.node.destroy();
    const scale = this.hudScale;
    const w = 360 * scale;
    const h = 22 * scale;
    const node = this.host.addChildPlainNode(hud, 'LobbyWorldChannel', (layout.stageLeft + layout.stageRight) / 2, layout.stageBottom + 190 * scale, w, h + 34 * scale);
    const bg = node.addComponent(Graphics);
    bg.fillColor = rgba(8, 6, 6, 210);
    bg.roundRect(-w / 2, -h / 2, w, h, h / 2);
    bg.fill();
    bg.strokeColor = rgba(196, 154, 86, 230);
    bg.lineWidth = Math.max(1, 1.5 * scale);
    bg.roundRect(-w / 2, -h / 2, w, h, h / 2);
    bg.stroke();
    const fill = this.host.addChildPlainNode(node, 'Fill', 0, 0, w, h).addComponent(Graphics);
    const label = this.host.addChildLabel(node, 'Label', this.channel.label, 0, h / 2 + 16 * scale, 20 * scale, rgba(255, 236, 190), new Size(w, 26 * scale));
    label.enableOutline = true;
    label.outlineColor = rgba(16, 8, 4, 255);
    label.outlineWidth = 2;
    this.channelBar = { node, fill, label, w, h };
  }

  private stepChannel(): void {
    const channel = this.channel;
    if (!channel) {
      return;
    }
    const v = this.inputVector();
    if (v.x !== 0 || v.y !== 0) {
      this.channel = null;
      this.channelBar?.node.isValid && this.channelBar.node.destroy();
      this.channelBar = null;
      this.host.setStatus('移动打断了读条');
      return;
    }
    if (!this.channelBar || !this.channelBar.node.isValid) {
      this.mountChannelBar();
    }
    const bar = this.channelBar;
    const t = Math.max(0, Math.min(1, (Date.now() - channel.startAt) / Math.max(1, channel.endAt - channel.startAt)));
    if (bar) {
      bar.fill.clear();
      bar.fill.fillColor = rgba(110, 200, 255, 235);
      bar.fill.roundRect(-bar.w / 2 + 3, -bar.h / 2 + 3, Math.max(2, (bar.w - 6) * t), bar.h - 6, (bar.h - 6) / 2);
      bar.fill.fill();
    }
    if (t >= 1) {
      this.channel = null;
      bar?.node.isValid && bar.node.destroy();
      this.channelBar = null;
      channel.onDone();
    }
  }

  /** 进图横幅(原型 p2 顶部「灰岩荒原 · Lv.10-20」),2.6 秒后淡出。 */
  private renderAreaBanner(hud: Node, layout: UiLayout, scale: number): void {
    const left = this.bannerUntil - Date.now();
    if (left <= 0) {
      return;
    }
    const def = this.def;
    const text = def.levelText ? `${def.name} · ${def.levelText}` : def.name;
    const w = Math.max(320, text.length * 34) * scale;
    const h = 56 * scale;
    const node = this.host.addChildPlainNode(hud, 'LobbyWorldAreaBanner', (layout.stageLeft + layout.stageRight) / 2, layout.stageTop - 110 * scale, w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 8, 200);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = rgba(214, 170, 92, 230);
    g.lineWidth = Math.max(1, 2 * scale);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();
    const label = this.host.addChildLabel(node, 'Label', text, 0, 1, 28 * scale, rgba(255, 232, 180), new Size(w - 30 * scale, 38 * scale));
    label.isBold = true;
    const opacity = node.addComponent(UIOpacity);
    tween(opacity).delay(Math.max(0.2, left / 1000 - 0.6)).to(0.6, { opacity: 0 }).call(() => node.isValid && node.destroy()).start();
  }

  // ── docs/50 §14:野外即时战斗 ──

  /**
   * 三段普攻(10-28 打击感):每段用不同动作(attack → skill1 → skill2,骨骼没有就退回 attack),
   * 伤害落在动作 38% 处(出手帧附近),70% 处是取消点(可接下一段 / 移动),动作必须播到取消点,连点只进缓冲、不再从头重播。
   * cap = 单段最长时长(超过的动作加速播,不拖手感)。
   */
  private static readonly COMBO: Array<{ kind: 'attack' | 'skill1' | 'skill2'; mult: number; reach: number; cap: number; heavy: boolean }> = [
    { kind: 'attack', mult: 1.0, reach: 170, cap: 620, heavy: false },
    { kind: 'skill1', mult: 1.15, reach: 180, cap: 680, heavy: false },
    { kind: 'skill2', mult: 1.8, reach: 200, cap: 820, heavy: true },
  ];
  private static readonly SKILLS = [
    { name: '重斩', mult: 2.6, reach: 210, around: false, cdMs: 5000, cap: 900, dash: 0, anim: 'skill3' as const },
    { name: '突进斩', mult: 2.0, reach: 120, around: false, cdMs: 7000, cap: 700, dash: 280, anim: 'skill1' as const },
    { name: '旋风斩', mult: 1.6, reach: 220, around: true, cdMs: 9000, cap: 1000, dash: 0, anim: 'ult' as const },
  ];

  private get fx(): TownCombatFx {
    if (!this.combatFxInst) {
      this.combatFxInst = new TownCombatFx(this.host);
    }
    return this.combatFxInst;
  }

  private kitOf(actor: TownActor): TownHeroFxKit {
    const key = `${actor.hero.heroCode}:${actor.role}`;
    let kit = this.fxKits.get(key);
    if (!kit) {
      kit = resolveTownHeroFxKit(actor.hero.heroCode, actor.hero.heroClass, actor.role);
      this.fxKits.set(key, kit);
    }
    return kit;
  }

  /** 队长正在出招(取消点前 / 突进中)。 */
  private leaderBusy(now: number): boolean {
    return now < this.actionUntil || now < this.dashUntil;
  }

  private engageCamp(stageCode: string): void {
    if (this.encounters.has(stageCode) || !this.host.engageWorldField) {
      return;
    }
    this.encounters.set(stageCode, { id: 0, pending: true });
    void this.host.engageWorldField(stageCode).then((encounter) => {
      if (!encounter) {
        this.encounters.delete(stageCode);
        return;
      }
      this.encounters.set(stageCode, { id: encounter.encounterId, pending: false });
      // 队长数值以服务端为准;最大血量变了按比例换算当前血
      if (encounter.raiderHp > 0 && encounter.raiderHp !== this.leaderMaxHp) {
        const ratio = this.leaderMaxHp > 0 ? this.leaderHp / this.leaderMaxHp : 1;
        this.leaderMaxHp = encounter.raiderHp;
        this.leaderHp = Math.max(1, Math.round(this.leaderMaxHp * ratio));
      }
      this.raiderAttack = encounter.raiderAttack;
      // docs/51:队友数值(按英雄 id 对上;旧服务端没下发就按队长折算的占位继续打)
      for (const actor of this.followers) {
        const spec = encounter.companions.find((item) => item.heroId === actor.hero.id);
        if (!spec) {
          continue;
        }
        actor.attack = spec.attack;
        if (spec.hp !== actor.maxHp) {
          const ratio = actor.maxHp > 0 ? actor.hp / actor.maxHp : 1;
          actor.maxHp = spec.hp;
          actor.hp = actor.down ? 0 : Math.max(1, Math.round(spec.hp * ratio));
        }
      }
      const mine = this.monsters.filter((monster) => monster.camp.stageCode === stageCode && !monster.dead);
      mine.forEach((monster, index) => {
        const spec = encounter.monsters[index] ?? encounter.monsters[0];
        if (!spec) {
          return;
        }
        monster.maxHp = spec.hp;
        monster.hp = spec.hp;
        monster.hit = spec.hit;
        monster.ranged = spec.ranged;
        this.drawMonsterHp(monster);
      });
      this.drawLeaderHp();
    });
  }

  private ensureLeaderStats(): void {
    if (this.leaderMaxHp <= 0) {
      // 第一次遭遇前的占位(遭遇下发后按服务端换算)
      this.leaderMaxHp = 4000;
      this.leaderHp = 4000;
    }
    for (const actor of this.followers) {
      if (actor.maxHp <= 0) {
        actor.maxHp = Math.round(this.leaderMaxHp * 0.8);
        actor.hp = actor.maxHp;
      }
      if (actor.attack <= 0) {
        actor.attack = Math.max(1, Math.round((this.raiderAttack || 20) * FIELD_COMPANION_SHARE));
      }
    }
  }

  private leaderAttack(): void {
    const now = Date.now();
    if (!this.leader || this.leaderDead || this.def.camps.length === 0) {
      return;
    }
    if (this.leaderBusy(now)) {
      // 出招前 120ms 内的连点算手抖不缓冲;之后按的进缓冲,到取消点自动接下一段
      if (now - this.leaderActionStart > 120) {
        this.bufferedInput = { kind: 'attack' };
      }
      return;
    }
    this.comboStep = now < this.comboUntil ? (this.comboStep % 3) + 1 : 1;
    const spec = LobbyTownRenderer.COMBO[this.comboStep - 1];
    const leader = this.leader;
    this.magnetToTarget(spec.reach);
    const dur = this.playLeaderAction(spec.kind, spec.cap);
    this.leaderActionStart = now;
    this.actionUntil = now + dur * 0.7;
    this.comboUntil = now + dur + 450;
    const ranged = leader.role !== 'melee';
    this.pendingHits.push({ at: now + dur * 0.38, mult: spec.mult, reach: spec.reach, around: false, heavy: spec.heavy, ranged });
    gameAudio.sfx(resolveHeroAttackSfxKey(leader.hero.heroCode, leader.hero.heroClass, !ranged), spec.heavy ? 0.8 : 0.6);
  }

  private leaderSkill(index: number): void {
    const now = Date.now();
    if (!this.leader || this.leaderDead || this.def.camps.length === 0) {
      return;
    }
    if (this.leaderBusy(now)) {
      if (now - this.leaderActionStart > 120 && now >= this.skillReadyAt[index]) {
        this.bufferedInput = { kind: 'skill', index };
      }
      return;
    }
    if (now < this.skillReadyAt[index]) {
      return;
    }
    const spec = LobbyTownRenderer.SKILLS[index];
    this.skillReadyAt[index] = now + spec.cdMs;
    this.comboUntil = 0;
    const leader = this.leader;
    // 大招键(旋风斩 = 'ult'):R / SR 自带大招动作 skill4 约 2.5 秒,上限放到 1.8 秒(原 1.0 秒会快进成一闪)
    const dur = this.playLeaderAction(spec.anim, spec.anim === 'ult' && this.hasOwnUlt(leader) ? 1800 : spec.cap);
    this.leaderActionStart = now;
    this.actionUntil = now + dur * 0.8;
    gameAudio.sfx(resolveHeroSkillSfxKey(leader.hero.heroCode), 0.8);
    if (spec.dash > 0) {
      // 突进:朝锁定目标(没有就沿朝向)冲 dash 距离,冲过的路径上都算命中
      const target = this.ensureLockTarget();
      if (target) {
        this.setActorFacing(leader, target.x >= leader.x ? 1 : -1);
      }
      const dx = target ? target.x - leader.x : leader.facing;
      const dy = target ? target.y - leader.y : 0;
      const len = Math.max(1, Math.hypot(dx, dy));
      const dist = target ? Math.min(spec.dash, Math.max(60, len - 70)) : spec.dash;
      this.dashDir = { x: dx / len, y: dy / len };
      this.dashSpeed = dist / 0.2;
      this.dashUntil = now + 200;
      const x1 = leader.x + this.dashDir.x * dist;
      const y1 = leader.y + this.dashDir.y * dist * 0.8;
      this.pendingHits.push({ at: now + 200, mult: spec.mult, reach: spec.reach, around: false, heavy: true, skill: index, dashLine: { x0: leader.x, y0: leader.y, x1, y1 } });
    } else {
      if (!spec.around) {
        this.magnetToTarget(spec.reach);
      }
      this.pendingHits.push({ at: now + dur * 0.42, mult: spec.mult, reach: spec.reach, around: spec.around, heavy: true, skill: index });
    }
  }

  private leaderDodge(): void {
    const leader = this.leader;
    const now = Date.now();
    if (!leader || this.leaderDead || now < this.dodgeReadyAt || now < this.dashUntil) {
      return;
    }
    const v = this.inputVector();
    const len = Math.hypot(v.x, v.y);
    this.dashDir = len > 0.1 ? { x: v.x / len, y: v.y / len } : { x: leader.facing, y: 0 };
    if (this.dashDir.x !== 0) {
      this.setActorFacing(leader, this.dashDir.x > 0 ? 1 : -1);
    }
    this.dashSpeed = 220 / 0.25;
    this.dashUntil = now + 250;
    this.actionUntil = now + 250;
    this.iframesUntil = now + 400;
    this.dodgeReadyAt = now + 1200;
    this.comboUntil = 0;
    this.bufferedInput = null;
    this.leaderActionAnim = false;
    this.endOneShot(leader);
  }

  private canAct(): boolean {
    const now = Date.now();
    return !!this.leader && !this.leaderDead && now >= this.actionUntil && now >= this.dashUntil && this.def.camps.length > 0;
  }

  /** 队长出招,返回本段动作的实际时长(ms,已按 cap 加速)。没骨骼时按 cap 计。 */
  private playLeaderAction(kind: 'attack' | 'skill1' | 'skill2' | 'skill3' | 'ult', capMs: number): number {
    const leader = this.leader;
    if (!leader) {
      return capMs;
    }
    const dur = this.playActorAction(leader, kind, capMs);
    if (dur > 0) {
      this.leaderActionAnim = true;
      return dur;
    }
    return capMs;
  }

  /**
   * 一次性动作:setAnimation(动作) + addAnimation(播完接的循环),整段播完、不被下一帧的待机 / 跑步覆盖。
   * capMs > 0 时超长动作加速到 capMs 内;返回实际时长 ms(0 = 没播)。
   */
  private playActorAction(actor: TownActor, kind: 'attack' | 'skill1' | 'skill2' | 'skill3' | 'ult', capMs = 0): number {
    const skeleton = actor.skeleton;
    const names = actor.names;
    if (!skeleton || !skeleton.isValid || !names) {
      return 0;
    }
    // R / SR 骨骼没有 ult,自带大招动作是 skill4(映射里叫 skill3,2.5 秒,含光效);UR / SSR 有 ult
    const anim = (kind === 'ult' ? names.ult || names.skill3 : names[kind]) || names.attack || names.idle;
    if (!anim) {
      return 0;
    }
    let lengthMs = 600;
    try {
      lengthMs = Math.max(150, (skeleton.findAnimation(anim)?.duration ?? 0.6) * 1000);
    } catch (error) {
      void error;
    }
    const speed = capMs > 0 && lengthMs > capMs ? lengthMs / capMs : 1;
    const loop = (actor.moving ? names.move || names.idle : names.idle) || null;
    try {
      skeleton.setAnimation(0, anim, false);
      if (loop) {
        skeleton.addAnimation(0, loop, true, 0);
      }
      skeleton.timeScale = speed;
    } catch (error) {
      void error;
      return 0;
    }
    actor.anim = anim;
    actor.loopAfter = loop;
    const dur = lengthMs / speed;
    actor.oneShotEnd = Date.now() + dur;
    return dur;
  }

  /** 一次性动作结束:动画已经自己接上排好的循环,这里只同步记录、恢复播放速度(不再 setAnimation 重播)。 */
  private endOneShot(actor: TownActor): void {
    actor.anim = actor.loopAfter ?? null;
    actor.oneShotEnd = 0;
    if (actor.skeleton && actor.skeleton.isValid && actor.skeleton.timeScale !== 1) {
      actor.skeleton.timeScale = 1;
    }
  }

  // ── docs/51 打击感:命中反馈 / 顿帧 / 震屏 ──

  /** 怪物身体中心(世界坐标 y)。 */
  private monsterBodyY(monster: TownMonster): number {
    return monster.y + (monster.camp.elite ? 120 : 70);
  }

  /**
   * 命中反馈:专属命中特效(没有就贴斩击图)+ 受击闪白 + 形变 + 击退;by = 打出这一下的人(队长 / 队友)。
   * 队长的命中再加顿帧 + 震屏 + 打击音;队友的只出特效和击退(频率高,全加会糊)。
   */
  private impactMonster(monster: TownMonster, by: TownActor, heavy: boolean, leaderHit: boolean): void {
    const root = this.entityRoot;
    if (!root || !root.isValid || monster.dead) {
      return;
    }
    const kit = this.kitOf(by);
    const bodyY = this.monsterBodyY(monster);
    const dir = monster.x >= by.x ? 1 : -1;
    const scale = (heavy ? 1.25 : 1) * (leaderHit ? 1 : 0.8) * (monster.camp.elite ? 1.2 : 1);
    const hit = kit.spine?.hit;
    const hitNode = hit ? this.fx.play(root, hit, monster.x - dir * 10, bodyY, 150 * hit.size * scale, { flipX: dir < 0 }) : null;
    if (!hitNode && by.role === 'melee') {
      this.fx.strikeSprite(root, kit.strike, monster.x - dir * 10, bodyY, 150 * kit.strike.size * scale, dir > 0 ? -12 : 12);
    }
    monster.flashUntil = Date.now() + (heavy ? 130 : 80);
    // 受击形变:横向压扁 / 纵向拉伸一下再回弹
    const spine = monster.spineNode;
    if (spine && spine.isValid) {
      const sx = monster.baseScale * MONSTER_ART_FACING * monster.facing;
      const sy = monster.baseScale;
      Tween.stopAllByTarget(spine);
      spine.setScale(sx * (heavy ? 0.86 : 0.92), sy * (heavy ? 1.1 : 1.05), 1);
      tween(spine).to(heavy ? 0.12 : 0.08, { scale: new Vec3(sx, sy, 1) }, { easing: 'quadOut' }).start();
    }
    // 击退:精英只退一点
    if (monster.staggeredUntil <= Date.now() || heavy) {
      monster.kbVX += dir * (heavy ? 620 : 300) * (monster.camp.elite ? 0.3 : 1);
    }
    if (leaderHit) {
      this.hitStop(heavy ? 85 : 45);
      this.shake(heavy ? 9 : 4, heavy ? 0.18 : 0.1);
      gameAudio.sfx(heavy ? 'chest_land' : 'merge', heavy ? 0.7 : 0.4);
    }
  }

  /** 顿帧:这几十毫秒里全场骨骼停住、逻辑不推进(计时在恢复时整体后移)。 */
  private hitStop(ms: number): void {
    const now = Date.now();
    this.hitStopUntil = Math.max(this.hitStopUntil, now + ms);
  }

  private shake(amp: number, sec: number): void {
    const now = Date.now();
    if (now < this.shakeUntil && this.shakeAmp > amp) {
      return;
    }
    this.shakeAmp = amp;
    this.shakeDur = sec;
    this.shakeUntil = now + sec * 1000;
  }

  /** 顿帧开始 / 结束:暂停 / 恢复骨骼;结束时把所有按 Date.now() 记的计时往后挪顿帧时长,出招节奏不被吃掉。 */
  private stepHitStop(now: number): boolean {
    if (now < this.hitStopUntil) {
      if (this.pausedSkeletons.length === 0) {
        this.hitStopStart = now;
        for (const skeleton of this.combatSkeletons()) {
          if (skeleton.timeScale > 0) {
            this.pausedSkeletons.push(skeleton);
            (skeleton as unknown as { __ts: number }).__ts = skeleton.timeScale;
            skeleton.timeScale = 0;
          }
        }
      }
      return true;
    }
    if (this.pausedSkeletons.length > 0) {
      for (const skeleton of this.pausedSkeletons) {
        if (skeleton.isValid) {
          skeleton.timeScale = (skeleton as unknown as { __ts?: number }).__ts ?? 1;
        }
      }
      this.pausedSkeletons.length = 0;
      const delta = now - this.hitStopStart;
      this.actionUntil += delta;
      this.comboUntil += delta;
      this.dashUntil += delta;
      this.iframesUntil += delta;
      this.leaderActionStart += delta;
      this.pendingHits.forEach((hit) => { hit.at += delta; });
      this.companionHits.forEach((hit) => { hit.at += delta; });
      for (const actor of [this.leader, ...this.followers]) {
        if (actor) {
          if (actor.oneShotEnd > 0) {
            actor.oneShotEnd += delta;
          }
          actor.actionUntil += delta;
        }
      }
      for (const monster of this.monsters) {
        monster.windupUntil = monster.windupUntil > 0 ? monster.windupUntil + delta : 0;
        monster.animLockUntil += delta;
      }
    }
    return false;
  }

  private combatSkeletons(): sp.Skeleton[] {
    const out: sp.Skeleton[] = [];
    for (const actor of [this.leader, ...this.followers]) {
      if (actor?.skeleton && actor.skeleton.isValid) {
        out.push(actor.skeleton);
      }
    }
    for (const monster of this.monsters) {
      if (monster.skeleton && monster.skeleton.isValid && !monster.dead) {
        out.push(monster.skeleton);
      }
    }
    return out;
  }

  /** 怪物循环动画:只在名字真变了才 setAnimation(同名不重播)。 */
  private setMonsterLoop(monster: TownMonster, moving: boolean): void {
    const skeleton = monster.skeleton;
    if (!skeleton || !skeleton.isValid) {
      return;
    }
    const anim = moving ? monster.moveAnim || monster.idleAnim : monster.idleAnim || monster.moveAnim;
    if (anim && anim !== monster.curAnim) {
      skeleton.setAnimation(0, anim, true);
      monster.curAnim = anim;
    }
  }

  /** 怪物一次性动作(攻击):整段播完再接循环;锁动画期间移动 / 待机切换不打断。 */
  private playMonsterOneShot(monster: TownMonster, anim: string): void {
    const skeleton = monster.skeleton;
    if (!skeleton || !skeleton.isValid || !anim) {
      return;
    }
    try {
      skeleton.setAnimation(0, anim, false);
      const loop = monster.idleAnim || monster.moveAnim;
      if (loop) {
        skeleton.addAnimation(0, loop, true, 0);
      }
      const len = Math.max(0.2, skeleton.findAnimation(anim)?.duration ?? 0.6);
      monster.animLockUntil = Date.now() + len * 1000;
      monster.curAnim = loop;
      monster.moving = false;
    } catch (error) {
      void error;
    }
  }

  // ── docs/51 §7 目标锁定 ──

  /** 活着、离队长 maxDist 内的怪。 */
  private liveMonsters(maxDist: number): TownMonster[] {
    const leader = this.leader;
    if (!leader) {
      return [];
    }
    return this.monsters.filter((monster) => !monster.dead && monster.node.isValid && Math.hypot(monster.x - leader.x, monster.y - leader.y) <= maxDist);
  }

  /** 没有锁定目标时:先找队长前方 120° 内最近的,扇形里没有就全向最近。 */
  private ensureLockTarget(): TownMonster | null {
    const leader = this.leader;
    if (!leader) {
      return null;
    }
    const current = this.lockTarget;
    if (current && !current.dead && current.node.isValid && Math.hypot(current.x - leader.x, current.y - leader.y) <= LOCK_BREAK_DIST) {
      return current;
    }
    const candidates = this.liveMonsters(LOCK_ACQUIRE_DIST);
    const dist = (monster: TownMonster): number => Math.hypot(monster.x - leader.x, monster.y - leader.y);
    const front = candidates.filter((monster) => {
      const dx = monster.x - leader.x;
      const dy = monster.y - leader.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      return (dx * leader.facing) / len >= 0.5;
    });
    const pool = front.length > 0 ? front : candidates;
    pool.sort((a, b) => dist(a) - dist(b));
    this.setLockTarget(pool[0] ?? null);
    return this.lockTarget;
  }

  /** 切换目标(Tab / 按钮):按距离轮换下一只。 */
  private cycleLockTarget(): void {
    const leader = this.leader;
    if (!leader) {
      return;
    }
    const candidates = this.liveMonsters(LOCK_BREAK_DIST).sort((a, b) => Math.hypot(a.x - leader.x, a.y - leader.y) - Math.hypot(b.x - leader.x, b.y - leader.y));
    if (candidates.length === 0) {
      this.setLockTarget(null);
      return;
    }
    const index = this.lockTarget ? candidates.indexOf(this.lockTarget) : -1;
    this.setLockTarget(candidates[(index + 1) % candidates.length]);
  }

  private setLockTarget(monster: TownMonster | null): void {
    if (this.lockTarget === monster) {
      return;
    }
    const previous = this.lockTarget;
    this.lockTarget = monster;
    if (this.lockRing && this.lockRing.isValid) {
      this.lockRing.node.destroy();
    }
    if (this.lockArrow && this.lockArrow.isValid) {
      this.lockArrow.destroy();
    }
    this.lockRing = null;
    this.lockArrow = null;
    if (previous) {
      this.drawMonsterHp(previous);
    }
    if (monster && monster.node.isValid) {
      const size = monster.camp.elite ? 220 : 150;
      const ringNode = this.host.addChildPlainNode(monster.node, 'LockRing', 0, 0, size * 1.2, size * 0.5);
      ringNode.setSiblingIndex(0);
      this.lockRing = ringNode.addComponent(Graphics);
      const top = (monster.camp.elite ? 250 : 140) + 44;
      const arrow = this.host.addChildPlainNode(monster.node, 'LockArrow', 0, top, 30, 24);
      const ag = arrow.addComponent(Graphics);
      ag.fillColor = rgba(235, 50, 40, 245);
      ag.moveTo(-11, 9);
      ag.lineTo(11, 9);
      ag.lineTo(0, -9);
      ag.close();
      ag.fill();
      ag.strokeColor = rgba(60, 6, 4, 255);
      ag.lineWidth = 2;
      ag.moveTo(-11, 9);
      ag.lineTo(11, 9);
      ag.lineTo(0, -9);
      ag.close();
      ag.stroke();
      tween(arrow).repeatForever(tween<Node>().by(0.45, { position: new Vec3(0, 8, 0) }).by(0.45, { position: new Vec3(0, -8, 0) })).start();
      this.lockArrow = arrow;
      this.drawMonsterHp(monster);
    }
    this.refreshEliteBar();
  }

  /** 锁定圈:脚下缓慢旋转的红色细环 + 四个向内三角(按地面透视压扁)。 */
  private drawLockRing(now: number): void {
    const g = this.lockRing;
    const monster = this.lockTarget;
    if (!g || !g.isValid || !monster) {
      return;
    }
    const rx = monster.camp.elite ? 110 : 72;
    const ry = rx * 0.34;
    const spin = (now / 1000) * 0.9;
    g.clear();
    // 底下一层很淡的红色地光,让锁定圈在暗地面上跳出来(原型锁定圈很醒目)
    g.fillColor = rgba(200, 30, 20, 38);
    g.ellipse(0, 0, rx, ry);
    g.fill();
    g.strokeColor = rgba(246, 64, 50, 240);
    g.lineWidth = 4.5;
    // 四段弧(留缺口转起来才看得出在转)
    for (let i = 0; i < 4; i += 1) {
      const a0 = spin + (i * Math.PI) / 2 + 0.18;
      const a1 = a0 + Math.PI / 2 - 0.36;
      for (let k = 0; k <= 10; k += 1) {
        const a = a0 + ((a1 - a0) * k) / 10;
        const x = Math.cos(a) * rx;
        const y = Math.sin(a) * ry;
        if (k === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke();
    }
    g.fillColor = rgba(240, 60, 48, 235);
    for (let i = 0; i < 4; i += 1) {
      const a = -spin + (i * Math.PI) / 2;
      const cx = Math.cos(a) * (rx + 12);
      const cy = Math.sin(a) * (ry + 5);
      const ix = -Math.cos(a);
      const iy = -Math.sin(a) * 0.34;
      const il = Math.max(0.01, Math.hypot(ix, iy));
      const ux = ix / il;
      const uy = iy / il;
      g.moveTo(cx + ux * 12, cy + uy * 12);
      g.lineTo(cx - uy * 9, cy + ux * 9);
      g.lineTo(cx + uy * 9, cy - ux * 9);
      g.close();
      g.fill();
    }
  }

  /** 出手前吸附:转向锁定目标;目标在 reach + 140 内而够不着时向它小幅贴近(最多 40)。 */
  private magnetToTarget(reach: number): void {
    const leader = this.leader;
    const target = this.ensureLockTarget();
    if (!leader || !target) {
      return;
    }
    const dx = target.x - leader.x;
    const dy = target.y - leader.y;
    if (Math.abs(dx) > 4) {
      this.setActorFacing(leader, dx > 0 ? 1 : -1);
    }
    const dist = Math.hypot(dx, dy);
    if (dist > reach * 0.7 && dist < reach + 140) {
      const step = Math.min(40, dist - reach * 0.6);
      const nx = leader.x + (dx / dist) * step;
      const ny = leader.y + (dy / dist) * step;
      if (this.walkable(nx, ny)) {
        leader.x = nx;
        leader.y = ny;
        leader.node.setPosition(nx, ny, 0);
        this.pushTrail(leader);
      }
    }
  }

  // ── docs/51 §6 队友自动战斗 ──

  /** 队友这一帧在战斗里自己走位 / 出手;返回 false = 不在战斗,照常跟随。 */
  private stepCompanion(actor: TownActor, index: number, dt: number, now: number): boolean {
    const leader = this.leader;
    if (!leader || !this.inCombat) {
      actor.target = null;
      return false;
    }
    const toLeader = Math.hypot(actor.x - leader.x, actor.y - leader.y);
    if (toLeader > COMPANION_BLINK_DIST) {
      // 离太远直接闪到队长身后
      actor.x = leader.x - leader.facing * (60 + index * 40);
      actor.y = leader.y + (index - 1) * 30;
      actor.node.setPosition(actor.x, actor.y, 0);
      actor.target = null;
      return true;
    }
    if (now >= actor.thinkAt) {
      actor.thinkAt = now + 200;
      actor.target = this.pickCompanionTarget(actor, toLeader);
    }
    const target = actor.target;
    if (!target || target.dead || !target.node.isValid) {
      actor.target = null;
      return false;
    }
    const melee = actor.role === 'melee';
    const keep = melee ? 62 : 290;
    // 目标位:近战站目标身侧(按编号上下错开),远程沿「目标 → 自己」方向退到 keep 外
    let wantX: number;
    let wantY: number;
    if (melee) {
      const side = actor.x >= target.x ? 1 : -1;
      wantX = target.x + side * keep;
      wantY = target.y + (index - 1) * 26;
    } else {
      // 10-28 录屏:两个远程队友同方向同距离叠在一起 → 按编号在「目标 → 自己」方向上各偏 50°
      const base = Math.atan2(actor.y - target.y, actor.x - target.x);
      const angle = base + (index - 1) * 0.87;
      wantX = target.x + Math.cos(angle) * keep;
      wantY = target.y + Math.sin(angle) * keep * 0.5;
    }
    const busy = now < actor.actionUntil;
    const mx = wantX - actor.x;
    const my = wantY - actor.y;
    const md = Math.hypot(mx, my);
    let moving = false;
    if (!busy && md > (actor.moving ? 8 : 26)) {
      const step = Math.min(md, LEADER_SPEED * 1.1 * dt);
      const nx = actor.x + (mx / md) * step;
      const ny = actor.y + (my / md) * step * 0.85;
      if (this.walkable(nx, actor.y)) {
        actor.x = nx;
      }
      if (this.walkable(actor.x, ny)) {
        actor.y = ny;
      }
      actor.node.setPosition(actor.x, actor.y, 0);
      moving = true;
    }
    const faceDx = target.x - actor.x;
    if (Math.abs(faceDx) > 6) {
      this.setActorFacing(actor, faceDx > 0 ? 1 : -1);
    }
    if (actor.inAction && !busy) {
      actor.inAction = false;
      this.endOneShot(actor);
    }
    if (!busy && actor.moving !== moving) {
      actor.moving = moving;
      this.applyActorAnimation(actor);
    } else if (!busy && actor.anim === null) {
      this.applyActorAnimation(actor, true);
    }
    // 出手
    const dx = Math.abs(target.x - actor.x);
    const dy = Math.abs(target.y - actor.y);
    const inRange = melee ? dx <= 110 && dy <= 70 : Math.hypot(dx, dy) <= 400;
    if (inRange && !busy && now >= actor.nextAttackAt) {
      this.companionAct(actor, target, now);
    }
    return true;
  }

  /** 选目标:队长锁定目标(集火)> 正在打自己的怪 > 离队长最近的怪。 */
  private pickCompanionTarget(actor: TownActor, toLeader: number): TownMonster | null {
    const leader = this.leader!;
    const engaged = this.monsters.filter((monster) => !monster.dead && monster.node.isValid && this.encounters.has(monster.camp.stageCode)
      && Math.hypot(monster.x - leader.x, monster.y - leader.y) < COMPANION_LEASH_DIST);
    if (engaged.length === 0) {
      return null;
    }
    const lock = this.lockTarget;
    if (lock && engaged.includes(lock) && toLeader < COMPANION_LEASH_DIST) {
      const attacker = engaged.find((monster) => monster.victim === actor && Math.hypot(monster.x - actor.x, monster.y - actor.y) < 140);
      return attacker ?? lock;
    }
    const attacker = engaged.find((monster) => monster.victim === actor);
    if (attacker) {
      return attacker;
    }
    engaged.sort((a, b) => Math.hypot(a.x - leader.x, a.y - leader.y) - Math.hypot(b.x - leader.x, b.y - leader.y));
    return engaged[0];
  }

  /** 队友出手:普攻 / 小技能(冷却好就放);辅助优先给血量最低的队员回血。 */
  private companionAct(actor: TownActor, target: TownMonster, now: number): void {
    const cadence = actor.role === 'melee' ? 1000 : actor.role === 'ranged' ? 1300 : 1500;
    actor.inAction = true;
    if (actor.role === 'support' && now >= actor.skillReadyAt) {
      const hurt = this.partyMembers().filter((member) => this.memberHpRatio(member) < 0.6).sort((a, b) => this.memberHpRatio(a) - this.memberHpRatio(b))[0];
      if (hurt) {
        actor.skillReadyAt = now + 6000;
        const dur = this.playActorAction(actor, 'skill1', 1100) || 600;
        actor.actionUntil = now + dur;
        actor.nextAttackAt = now + Math.max(cadence, dur + 150);
        this.healMember(hurt, Math.round(actor.attack * 2.4));
        if (this.entityRoot) {
          const kit = this.kitOf(actor);
          this.fx.play(this.entityRoot, kit.skill, hurt.x, hurt.y + 90, 240 * kit.skill.scale);
        }
        return;
      }
    }
    const skill = now >= actor.skillReadyAt;
    if (skill) {
      actor.skillReadyAt = now + 6000 + Math.random() * 2000;
    }
    // 动作整段播完再允许走位 / 出下一下(原先锁 420ms 就切回待机,攻击动作只播一半)
    const dur = this.playActorAction(actor, skill ? 'skill1' : 'attack', skill ? 1000 : 750) || 500;
    actor.actionUntil = now + dur;
    actor.nextAttackAt = now + Math.max(cadence * (0.9 + Math.random() * 0.2), dur + 120);
    const damage = Math.max(1, Math.round(actor.attack * (skill ? 2.2 : 1) * (0.92 + Math.random() * 0.16)));
    if (actor.role === 'melee') {
      this.companionHits.push({ at: now + dur * 0.4, target, damage, heavy: skill, actor, skillFx: skill });
    } else {
      this.fireProjectile(actor, target, damage, skill, dur * 0.35);
    }
  }

  /** 远程弹道:英雄专属骨骼弹道(没有 / 没就绪退回专属贴图)飞到目标,到了才结算伤害和命中特效。 */
  private fireProjectile(actor: TownActor, target: TownMonster, damage: number, heavy: boolean, releaseMs = 160): void {
    const root = this.entityRoot;
    const now = Date.now();
    const sx = actor.x + actor.facing * 30;
    const sy = actor.y + 110;
    const ex = target.x;
    const ey = this.monsterBodyY(target);
    const travel = Math.max(120, Math.min(420, (Math.hypot(ex - sx, ey - sy) / 1500) * 1000));
    // 伤害按时间结算(顿帧时 companionHits 会整体后移);弹道只管表现
    this.companionHits.push({ at: now + releaseMs + travel, target, damage, heavy, actor, skillFx: heavy });
    if (!root || !root.isValid) {
      return;
    }
    const kit = this.kitOf(actor);
    setTimeout(() => {
      if (root.isValid && !target.dead) {
        this.fx.projectile(root, kit, sx, sy, ex, ey, travel, heavy ? 190 : 150, () => undefined);
      }
    }, releaseMs);
  }

  private partyMembers(): TownActor[] {
    const out: TownActor[] = [];
    if (this.leader && !this.leaderDead) {
      out.push(this.leader);
    }
    for (const actor of this.followers) {
      if (!actor.down && actor.node.isValid) {
        out.push(actor);
      }
    }
    return out;
  }

  private memberHpRatio(actor: TownActor): number {
    if (actor === this.leader) {
      return this.leaderMaxHp > 0 ? this.leaderHp / this.leaderMaxHp : 1;
    }
    return actor.maxHp > 0 ? actor.hp / actor.maxHp : 1;
  }

  private healMember(actor: TownActor, amount: number): void {
    if (actor === this.leader) {
      this.leaderHp = Math.min(this.leaderMaxHp, this.leaderHp + amount);
      this.drawLeaderHp();
    } else {
      actor.hp = Math.min(actor.maxHp, actor.hp + amount);
    }
    this.spawnFloater(actor.x, actor.y + 230, `+${amount}`, rgba(120, 240, 140), 24);
  }

  /** 队友倒下:变灰,8 秒后在队长身边以 30% 血复活(队长倒下回传送阵时全员满血)。 */
  private downCompanion(actor: TownActor): void {
    actor.down = true;
    actor.hp = 0;
    actor.downUntil = Date.now() + COMPANION_REVIVE_MS;
    actor.target = null;
    actor.inAction = false;
    actor.actionUntil = 0;
    if (actor.skeleton && actor.skeleton.isValid) {
      if (actor.names?.death) {
        actor.skeleton.setAnimation(0, actor.names.death, false);
      }
      actor.skeleton.color = rgba(150, 150, 150, 255);
    }
    for (const monster of this.monsters) {
      if (monster.victim === actor) {
        monster.victim = null;
      }
    }
  }

  private reviveCompanion(actor: TownActor, ratio: number): void {
    const leader = this.leader;
    actor.down = false;
    actor.downUntil = 0;
    actor.hp = Math.max(1, Math.round(actor.maxHp * ratio));
    if (leader) {
      const point = this.trailPoint((this.followers.indexOf(actor) + 1) * FOLLOW_SPACING);
      actor.x = point ? point.x : leader.x - leader.facing * FOLLOW_SPACING;
      actor.y = point ? point.y : leader.y;
      actor.node.setPosition(actor.x, actor.y, 0);
    }
    if (actor.skeleton && actor.skeleton.isValid) {
      actor.skeleton.color = rgba(255, 255, 255, 255);
    }
    actor.anim = null;
    actor.moving = false;
    this.applyActorAnimation(actor, true);
  }

  // ── docs/51 §3 援护技:点队友头像 / 数字键 1~3 ──

  /** 这名英雄的骨骼有没有自带大招动作(R / SR 的 skill4):有就只播动作本身,不再叠外部特效包。 */
  private hasOwnUlt(actor: TownActor): boolean {
    const rarity = (actor.hero.rarity || '').toUpperCase();
    return (rarity === 'R' || rarity === 'SR') && !!actor.names?.skill3;
  }

  private triggerAssist(index: number): void {
    const actor = this.followers[index];
    const now = Date.now();
    if (!actor || actor.down || this.leaderDead || now < actor.assistReadyAt || this.def.camps.length === 0) {
      return;
    }
    if (actor.role === 'support') {
      actor.assistReadyAt = now + COMPANION_ASSIST_CD_MS;
      // 自带大招动作完整播(2.5 秒),不再压到 1.2 秒
      this.playActorAction(actor, 'ult', this.hasOwnUlt(actor) ? 0 : 1200);
      if (this.entityRoot && !this.hasOwnUlt(actor)) {
        const kit = this.kitOf(actor);
        this.fx.play(this.entityRoot, kit.skill, actor.x, actor.y + 100, 460 * kit.skill.scale);
      }
      gameAudio.sfx(resolveHeroSkillSfxKey(actor.hero.heroCode), 0.9);
      for (const member of this.partyMembers()) {
        this.healMember(member, Math.round((member === this.leader ? this.leaderMaxHp : member.maxHp) * 0.3));
      }
      this.spawnFloater(actor.x, actor.y + 270, '援护 · 治愈', rgba(150, 240, 170), 26);
      return;
    }
    const target = this.ensureLockTarget();
    if (!target) {
      // 10-29 用户:没有怪也可以释放 —— 原地朝当前朝向出大招 + 特效,照常进冷却(不造成伤害)
      actor.assistReadyAt = now + COMPANION_ASSIST_CD_MS;
      actor.inAction = true;
      const freeDur = this.playActorAction(actor, 'ult', this.hasOwnUlt(actor) ? 0 : 1200) || 700;
      actor.actionUntil = now + freeDur;
      const freeKit = this.kitOf(actor);
      gameAudio.sfx(resolveHeroSkillSfxKey(actor.hero.heroCode), 0.9);
      if (this.entityRoot && !this.hasOwnUlt(actor)) {
        const reach = actor.role === 'melee' ? 150 : 320;
        this.fx.play(this.entityRoot, freeKit.skill, actor.x + actor.facing * reach, actor.y + 110 + freeKit.skill.offsetY, 420 * freeKit.skill.scale, { flipX: actor.facing < 0 });
      }
      this.shake(8, 0.2);
      this.spawnFloater(actor.x, actor.y + 270, '援护!', rgba(255, 214, 110), 26);
      return;
    }
    actor.assistReadyAt = now + COMPANION_ASSIST_CD_MS;
    if (!this.encounters.has(target.camp.stageCode)) {
      this.engageCamp(target.camp.stageCode);
    }
    if (actor.role === 'melee') {
      // 近战援护:闪到目标身侧再出手
      const side = actor.x >= target.x ? 1 : -1;
      actor.x = target.x + side * 70;
      actor.y = target.y;
      actor.node.setPosition(actor.x, actor.y, 0);
      this.setActorFacing(actor, side > 0 ? -1 : 1);
    }
    actor.inAction = true;
    actor.target = target;
    const own = this.hasOwnUlt(actor);
    const dur = this.playActorAction(actor, 'ult', own ? 0 : 1200) || 700;
    actor.actionUntil = now + dur;
    const damage = Math.max(1, Math.round(actor.attack * 4.5));
    const kit = this.kitOf(actor);
    gameAudio.sfx(resolveHeroSkillSfxKey(actor.hero.heroCode), 0.9);
    if (this.entityRoot && !own) {
      this.fx.play(this.entityRoot, kit.skill, target.x, this.monsterBodyY(target) + kit.skill.offsetY, 420 * kit.skill.scale, { flipX: actor.x > target.x });
    }
    this.shake(12, 0.28);
    this.hitStop(110);
    if (actor.role === 'melee') {
      this.companionHits.push({ at: now + dur * 0.4, target, damage, heavy: true, actor });
    } else {
      this.fireProjectile(actor, target, damage, true, dur * 0.35);
    }
    this.spawnFloater(actor.x, actor.y + 270, '援护!', rgba(255, 214, 110), 26);
  }

  /**
   * 换队长(docs/51 §3):操控权交给第 index 个队友,原队长变队友进同一个援护位;位置不动、各自血量按比例带走;
   * 怪的目标 / 锁定不变;3 秒公共冷却;队长倒下或该队友倒下时不换。
   */
  private swapLeader(index: number): void {
    const now = Date.now();
    const leader = this.leader;
    const target = this.followers[index];
    if (!leader || !target || target.down || this.leaderDead || now < this.swapReadyAt || this.def.camps.length === 0) {
      return;
    }
    this.swapReadyAt = now + SWAP_CD_MS;
    // 原队长的数值交给 actor 字段;新队长的 actor 数值交给 leaderHp / raiderAttack(队友攻击 = 队长口径 × 0.6)
    const oldHp = this.leaderHp;
    const oldMax = this.leaderMaxHp;
    const oldAttack = this.raiderAttack;
    this.leaderHp = target.hp;
    this.leaderMaxHp = target.maxHp;
    this.raiderAttack = Math.max(1, Math.round(target.attack / FIELD_COMPANION_SHARE));
    leader.hp = oldHp;
    leader.maxHp = oldMax;
    leader.attack = Math.max(1, Math.round(oldAttack * FIELD_COMPANION_SHARE));
    leader.target = null;
    leader.inAction = false;
    leader.actionUntil = 0;
    leader.anim = null;
    leader.moving = false;
    this.applyActorAnimation(leader, true);
    target.target = null;
    target.inAction = false;
    target.actionUntil = 0;
    target.anim = null;
    target.moving = false;
    this.applyActorAnimation(target, true);
    this.followers[index] = leader;
    this.leader = target;
    this.pendingHits = [];
    this.comboStep = 0;
    this.comboUntil = 0;
    this.actionUntil = 0;
    this.dashUntil = 0;
    this.leaderActionAnim = false;
    this.trail = [new Vec2(target.x, target.y)];
    for (const monster of this.monsters) {
      if (monster.victim === leader) {
        monster.victim = target;
      }
    }
    // 脚环挪到新队长脚下;底部血条换名字;援护位重建(头像 / 血量换人)
    const ring = leader.node.getChildByName('LeaderRing');
    if (ring) {
      ring.destroy();
    }
    this.ensureLeaderRing(target);
    if (this.leaderBar && this.leaderBar.name.isValid) {
      this.leaderBar.name.string = `${safeText(target.hero.heroName)} Lv.${target.hero.level}`;
      this.leaderBar.key = '';
      this.drawLeaderHp();
    }
    this.rebuildPartyColumn();
    this.spawnFloater(target.x, target.y + 270, `操控 · ${safeText(target.hero.heroName)}`, rgba(150, 220, 255), 26);
    this.applyCamera(true);
  }

  private ensureLeaderRing(leader: TownActor): void {
    if (!leader.node.isValid) {
      return;
    }
    let ring = leader.node.getChildByName('LeaderRing');
    if (!ring) {
      ring = this.host.addChildPlainNode(leader.node, 'LeaderRing', 0, 0, 160, 60);
      ring.setSiblingIndex(0);
      ring.addComponent(Graphics);
    }
    const g = ring.getComponent(Graphics)!;
    g.clear();
    if (this.def.camps.length > 0) {
      g.fillColor = rgba(80, 200, 255, 34);
      g.ellipse(0, 0, 56, 18);
      g.fill();
      g.strokeColor = rgba(110, 215, 255, 210);
      g.lineWidth = 3;
      g.ellipse(0, 0, 56, 18);
      g.stroke();
    }
  }

  private rebuildPartyColumn(): void {
    const hud = this.hudNode;
    const layout = this.hudLayout;
    if (!hud || !hud.isValid || !layout) {
      return;
    }
    for (const slot of this.partySlots) {
      if (slot.node.isValid) {
        slot.node.destroy();
      }
    }
    this.renderPartyColumn(hud, layout);
  }

  private stepCombat(dt: number): void {
    const leader = this.leader;
    if (!leader || this.def.camps.length === 0) {
      return;
    }
    this.ensureLeaderStats();
    const now = Date.now();
    this.inCombat = this.monsters.some((monster) => !monster.dead && this.encounters.has(monster.camp.stageCode)
      && Math.hypot(monster.x - leader.x, monster.y - leader.y) < COMPANION_LEASH_DIST + 300);
    if (this.inCombat) {
      this.lastCombatAt = now;
    }
    // 到点的打击
    if (this.pendingHits.length > 0) {
      const due = this.pendingHits.filter((hit) => hit.at <= now);
      this.pendingHits = this.pendingHits.filter((hit) => hit.at > now);
      for (const hit of due) {
        this.resolveLeaderHit(hit);
      }
    }
    if (this.companionHits.length > 0) {
      const due = this.companionHits.filter((hit) => hit.at <= now);
      this.companionHits = this.companionHits.filter((hit) => hit.at > now);
      for (const hit of due) {
        if (!hit.target.dead && hit.target.node.isValid) {
          if (hit.actor) {
            this.impactMonster(hit.target, hit.actor, hit.heavy, false);
            if (hit.skillFx && this.entityRoot) {
              const kit = this.kitOf(hit.actor);
              this.fx.play(this.entityRoot, kit.skill, hit.target.x, this.monsterBodyY(hit.target) + kit.skill.offsetY, 260 * kit.skill.scale);
            }
          }
          this.damageMonster(hit.target, hit.damage, hit.heavy, true);
        }
      }
    }
    // 缓冲的下一招:到取消点就接(连点 = 一段接一段完整打出)
    if (this.bufferedInput && !this.leaderBusy(now) && !this.leaderDead) {
      const input = this.bufferedInput;
      this.bufferedInput = null;
      if (input.kind === 'attack') {
        this.leaderAttack();
      } else {
        this.leaderSkill(input.index);
      }
    }
    // 脱战回血:4 秒没挨打,每秒回 8%
    if (!this.leaderDead && this.leaderHp < this.leaderMaxHp && now - this.lastHurtAt > 4000) {
      this.leaderHp = Math.min(this.leaderMaxHp, this.leaderHp + this.leaderMaxHp * 0.08 * dt);
      this.drawLeaderHp();
    }
    for (const actor of this.followers) {
      if (actor.down) {
        if (now >= actor.downUntil) {
          this.reviveCompanion(actor, 0.3);
        }
        continue;
      }
      if (actor.hp < actor.maxHp && now - this.lastCombatAt > 3000) {
        actor.hp = Math.min(actor.maxHp, actor.hp + actor.maxHp * 0.08 * dt);
      }
    }
    // 锁定目标:死了换最近的下一只,离太远解锁
    const lock = this.lockTarget;
    if (lock && (lock.dead || !lock.node.isValid || Math.hypot(lock.x - leader.x, lock.y - leader.y) > LOCK_BREAK_DIST)) {
      const next = lock.dead ? this.liveMonsters(LOCK_ACQUIRE_DIST).sort((a, b) => Math.hypot(a.x - leader.x, a.y - leader.y) - Math.hypot(b.x - leader.x, b.y - leader.y))[0] ?? null : null;
      this.setLockTarget(next);
    }
    this.drawLockRing(now);
    // 破防条回落:破防结束清零;2 秒没挨打每秒掉 15%
    for (const monster of this.monsters) {
      if (!monster.camp.elite || monster.dead) {
        continue;
      }
      if (monster.staggeredUntil > 0 && now >= monster.staggeredUntil) {
        monster.staggeredUntil = 0;
        monster.stagger = 0;
      } else if (monster.stagger > 0 && now >= monster.staggeredUntil && now - monster.lastHitAt > 2000) {
        monster.stagger = Math.max(0, monster.stagger - 0.15 * dt);
      }
    }
    this.stepLoot(now);
    this.refreshEliteBar();
    this.refreshCombatButtons(now);
    this.refreshPartyHud(now);
  }

  private resolveLeaderHit(hit: { mult: number; reach: number; around: boolean; heavy: boolean; dashLine?: { x0: number; y0: number; x1: number; y1: number }; skill?: number; ranged?: boolean }): void {
    const leader = this.leader;
    if (!leader) {
      return;
    }
    const attack = Math.max(1, this.raiderAttack || 20);
    const damage = Math.max(1, Math.round(attack * hit.mult));
    const root = this.entityRoot;
    const kit = this.kitOf(leader);
    if (hit.skill !== undefined && root) {
      // 技能:专属战技特效(target = 落在锁定目标 / 前方;self = 绕自身),再加一记重震
      const target = this.ensureLockTarget();
      const self = kit.skill.anchor === 'self' || hit.around;
      const fxX = self || !target ? leader.x + (self ? 0 : leader.facing * 150) : target.x;
      const fxY = self || !target ? leader.y + 90 : this.monsterBodyY(target);
      const size = (hit.skill === 2 ? 420 : 340) * kit.skill.scale;
      this.fx.play(root, kit.skill, fxX, fxY + kit.skill.offsetY, size, { flipX: leader.facing < 0 });
      this.shake(10, 0.22);
    }
    if (hit.ranged && hit.skill === undefined && root) {
      // 远程普攻:专属弹道飞到锁定目标,到了才结算伤害和命中特效
      const target = this.ensureLockTarget();
      const sx = leader.x + leader.facing * 40;
      const sy = leader.y + 120;
      if (!target || Math.hypot(target.x - leader.x, target.y - leader.y) > 520) {
        this.fx.projectile(root, kit, sx, sy, sx + leader.facing * 420, sy, 260, 170, () => undefined);
        return;
      }
      const ex = target.x;
      const ey = this.monsterBodyY(target);
      const travel = Math.max(120, Math.min(380, (Math.hypot(ex - sx, ey - sy) / 1600) * 1000));
      this.fx.projectile(root, kit, sx, sy, ex, ey, travel, 170, () => {
        if (!target.dead && target.node.isValid && this.leader === leader) {
          this.impactMonster(target, leader, hit.heavy, true);
          this.damageMonster(target, damage, hit.heavy, false);
        }
      });
      return;
    }
    let landed = false;
    for (const monster of this.monsters) {
      if (monster.dead || !monster.node.isValid) {
        continue;
      }
      const dx = monster.x - leader.x;
      const dy = monster.y - leader.y;
      let inRange: boolean;
      if (hit.dashLine) {
        // 线段到点的距离(突进方向可以斜着)
        const lx = hit.dashLine.x1 - hit.dashLine.x0;
        const ly = hit.dashLine.y1 - hit.dashLine.y0;
        const ll = Math.max(1, lx * lx + ly * ly);
        const t = Math.max(0, Math.min(1, ((monster.x - hit.dashLine.x0) * lx + (monster.y - hit.dashLine.y0) * ly) / ll));
        inRange = Math.hypot(monster.x - (hit.dashLine.x0 + lx * t), (monster.y - (hit.dashLine.y0 + ly * t)) * 1.3) <= 100;
      } else if (hit.around) {
        inRange = Math.hypot(dx, dy * 1.4) <= hit.reach;
      } else {
        inRange = dx * leader.facing >= -40 && Math.abs(dx) <= hit.reach && Math.abs(dy) <= 95;
        // 锁定目标:吸附后仍差一点也算中(解决「挥空」)
        if (!inRange && monster === this.lockTarget) {
          inRange = Math.hypot(dx, dy) <= hit.reach + 40;
        }
      }
      if (!inRange) {
        continue;
      }
      if (!this.lockTarget) {
        this.setLockTarget(monster);
      }
      this.impactMonster(monster, leader, hit.heavy || hit.skill !== undefined, !landed);
      landed = true;
      this.damageMonster(monster, damage, hit.heavy, false);
    }
    if (!landed && hit.skill === undefined && root) {
      // 挥空也要有刀光:在身前贴一记斩击图
      this.fx.strikeSprite(root, kit.strike, leader.x + leader.facing * 110, leader.y + 100, 150 * kit.strike.size * 0.8, leader.facing > 0 ? -10 : 10);
    }
  }

  /** 统一扣血 / 飘字 / 击杀;遭遇没回来时只出受击不扣血。 */
  /** 破防:3 秒不动不攻、受伤 ×1.5;结束清零再重新积。 */
  private staggerMonster(monster: TownMonster, now: number): void {
    monster.stagger = 1;
    monster.staggeredUntil = now + STAGGER_MS;
    monster.windupUntil = 0;
    monster.nextAttackAt = now + STAGGER_MS + 400;
    monster.moving = false;
    monster.animLockUntil = 0;
    this.setMonsterLoop(monster, false);
    this.spawnFloater(monster.x, monster.y + 260, '破防!', rgba(255, 230, 120), 34);
    this.shake(8, 0.2);
    this.refreshEliteBar();
  }

  private damageMonster(monster: TownMonster, damage: number, heavy: boolean, companion: boolean): void {
    if (!this.encounters.has(monster.camp.stageCode)) {
      this.engageCamp(monster.camp.stageCode);
    }
    monster.flashUntil = Date.now() + 120;
    monster.lastHitAt = Date.now();
    if (monster.maxHp <= 0) {
      return;
    }
    const now = Date.now();
    if (monster.camp.elite) {
      if (now < monster.staggeredUntil) {
        damage = Math.round(damage * 1.5);
      } else if (monster.maxHp > 0) {
        monster.stagger = Math.min(1, monster.stagger + (damage / monster.maxHp) * STAGGER_GAIN * (heavy ? 1.5 : 1));
        if (monster.stagger >= 1) {
          this.staggerMonster(monster, now);
        }
      }
    }
    monster.hp = Math.max(0, monster.hp - damage);
    // 10-28 录屏:三条 -588 叠成一团、9855 盖住名字 → 同一只怪 450ms 内的飘字按序号上抬 + 左右交错
    monster.floatSeq = now - monster.floatAt < 450 ? monster.floatSeq + 1 : 0;
    monster.floatAt = now;
    const seq = monster.floatSeq;
    const lift = seq * 26;
    const sway = (seq % 2 === 0 ? 1 : -1) * Math.ceil(seq / 2) * 34;
    const y = monster.y + (monster.camp.elite ? 230 : 130) + lift;
    if (companion) {
      // 队友伤害小一号、颜色偏淡,和队长区分
      this.spawnFloater(monster.x + 30 + sway, y - 20, `${damage}`, heavy ? rgba(255, 226, 150) : rgba(236, 226, 200), heavy ? 24 : 20);
    } else {
      this.spawnFloater(monster.x + sway, y, `${damage}`, heavy ? rgba(255, 210, 90) : rgba(255, 245, 230), heavy ? 34 : 28);
    }
    this.drawMonsterHp(monster);
    if (monster.hp <= 0) {
      this.killMonster(monster);
    }
  }

  private killMonster(monster: TownMonster): void {
    monster.dead = true;
    monster.diedAt = Date.now();
    monster.hpBar?.clear();
    if (monster.nameLabel && monster.nameLabel.isValid) {
      monster.nameLabel.node.active = false;
    }
    if (monster.skeleton && monster.skeleton.isValid && monster.deathAnim) {
      monster.skeleton.setAnimation(0, monster.deathAnim, false);
    }
    const opacity = monster.node.getComponent(UIOpacity) ?? monster.node.addComponent(UIOpacity);
    tween(opacity).delay(0.5).to(0.6, { opacity: 0 }).start();
    const stageCode = monster.camp.stageCode;
    const alive = this.monsters.some((item) => item.camp.stageCode === stageCode && !item.dead);
    if (!alive) {
      const encounter = this.encounters.get(stageCode);
      this.encounters.delete(stageCode);
      this.campRespawnAt.set(stageCode, Date.now() + MONSTER_RESPAWN_MS);
      if (encounter && encounter.id > 0) {
        // docs/51 P2:不再立刻结算,掉一袋战利品在最后一只怪脚下,走过去拾取
        this.spawnLoot(encounter.id, stageCode, monster.x, monster.y);
      }
    }
  }

  // ── docs/51 P2 战利品 ──

  private spawnLoot(encounterId: number, stageCode: string, x: number, y: number): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      this.host.clearWorldField?.(encounterId, stageCode);
      return;
    }
    const node = this.host.addChildPlainNode(root, `TownLoot_${encounterId}`, x, y, 120, 120);
    const glow = node.addComponent(Graphics);
    glow.fillColor = rgba(255, 200, 90, 40);
    glow.ellipse(0, 0, 54, 18);
    glow.fill();
    glow.strokeColor = rgba(255, 214, 120, 150);
    glow.lineWidth = 2;
    glow.ellipse(0, 0, 46, 15);
    glow.stroke();
    const art = this.host.addChildPlainNode(node, 'Art', 0, 36, 72, 72);
    if (!this.host.addSprite('Icon', LOOT_ICON, 0, 0, 68, 68, art)) {
      const g = art.addComponent(Graphics);
      g.fillColor = rgba(120, 84, 40, 255);
      g.roundRect(-26, -20, 52, 40, 8);
      g.fill();
      g.strokeColor = rgba(240, 200, 110, 255);
      g.lineWidth = 3;
      g.roundRect(-26, -20, 52, 40, 8);
      g.stroke();
    }
    tween(art).repeatForever(tween<Node>().to(0.6, { position: new Vec3(0, 46, 0) }).to(0.6, { position: new Vec3(0, 36, 0) })).start();
    this.loots.push({ key: `loot_${encounterId}`, stageCode, encounterId, x, y, node, spawnedAt: Date.now() });
    this.spawnFloater(x, y + 150, '战利品掉落', rgba(255, 224, 150), 24);
  }

  private pickupLoot(loot: TownLoot): void {
    const index = this.loots.indexOf(loot);
    if (index < 0) {
      return;
    }
    this.loots.splice(index, 1);
    if (loot.node.isValid) {
      const art = loot.node.getChildByName('Art');
      if (art) {
        Tween.stopAllByTarget(art);
      }
      const opacity = loot.node.getComponent(UIOpacity) ?? loot.node.addComponent(UIOpacity);
      tween(loot.node).to(0.25, { position: new Vec3(loot.x, loot.y + 90, 0) }).start();
      tween(opacity).to(0.25, { opacity: 0 }).call(() => loot.node.isValid && loot.node.destroy()).start();
    }
    this.host.clearWorldField?.(loot.encounterId, loot.stageCode, (items, capped) => this.showLootRewards(items, capped));
    this.nearKey = null;
  }

  /** 拾取到的奖励在队长头上逐条飘字(大厅不显示底部状态字)。 */
  private showLootRewards(items: Array<{ name: string; amount: number }>, capped: boolean): void {
    const leader = this.leader;
    if (!leader || !leader.node.isValid) {
      return;
    }
    const lines = items.slice(0, 4).map((item) => `${item.name} +${this.host.formatInteger(item.amount)}`);
    if (capped) {
      lines.push('今日有奖次数已用完');
    }
    lines.forEach((text, index) => {
      setTimeout(() => {
        if (leader.node.isValid) {
          this.spawnFloater(leader.x, leader.y + 250 + index * 10, text, capped ? rgba(220, 200, 160) : rgba(255, 226, 140), 24);
        }
      }, index * 260);
    });
  }

  /** 切图 / 超时:没捡的战利品直接结算,别让遭遇过期把奖励丢了。 */
  private claimAllLoot(): void {
    const pending = this.loots.splice(0, this.loots.length);
    for (const loot of pending) {
      if (loot.node.isValid) {
        loot.node.destroy();
      }
      this.host.clearWorldField?.(loot.encounterId, loot.stageCode);
    }
  }

  private stepLoot(now: number): void {
    const leader = this.leader;
    for (const loot of this.loots.slice()) {
      if (!loot.node.isValid) {
        this.loots.splice(this.loots.indexOf(loot), 1);
        continue;
      }
      if (now - loot.spawnedAt > LOOT_AUTO_MS) {
        this.pickupLoot(loot);
        continue;
      }
      // 直接走到袋子上也算捡(不用点)
      if (leader && !this.leaderDead && Math.hypot(leader.x - loot.x, (leader.y - loot.y) * 1.6) < 48) {
        this.pickupLoot(loot);
      }
    }
  }

  /** 怪物该追打谁:离自己最近的在场队员(队长 / 队友),有当前目标时近很多才换。 */
  private monsterVictim(monster: TownMonster): TownActor | null {
    const members = this.partyMembers();
    if (members.length === 0) {
      return null;
    }
    const dist = (actor: TownActor): number => Math.hypot(actor.x - monster.x, actor.y - monster.y);
    let best = members[0];
    for (const actor of members) {
      if (dist(actor) < dist(best)) {
        best = actor;
      }
    }
    const current = monster.victim;
    if (current && members.includes(current) && dist(best) > dist(current) * 0.6) {
      return current;
    }
    return best;
  }

  private tryMonsterAttack(monster: TownMonster, victim: TownActor, toVictim: number, now: number): void {
    if (monster.maxHp <= 0 || now < monster.staggeredUntil) {
      return;
    }
    const range = monster.ranged ? 420 : 105;
    if (monster.windupUntil > 0 && now >= monster.windupUntil) {
      monster.windupUntil = 0;
      // 出手:蓄力结束仍在范围内才命中;队长翻滚无敌期躲开
      const dodged = victim === this.leader && now < this.iframesUntil;
      const hits = toVictim <= range + 30 && !dodged;
      if (monster.ranged && this.entityRoot) {
        // 远程怪:弹道飞到目标,到了才扣血(原先直接扣,看不出被什么打了)
        const root = this.entityRoot;
        const sx = monster.x + monster.facing * 30;
        const sy = this.monsterBodyY(monster);
        const ex = victim.x;
        const ey = victim.y + 110;
        const travel = Math.max(140, Math.min(420, (Math.hypot(ex - sx, ey - sy) / 1300) * 1000));
        const shot = monster.shotFx ? this.fx.play(root, monster.shotFx, sx, sy, 150 * monster.shotFx.size, { loop: true, angle: (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI }) : null;
        if (shot) {
          tween(shot).to(travel / 1000, { position: new Vec3(ex, ey, 0) }).call(() => shot.isValid && shot.destroy()).start();
        }
        setTimeout(() => {
          if (hits && !this.leaderDead && victim.node.isValid) {
            this.hurtActor(victim, monster.hit);
          }
        }, travel);
      } else if (hits) {
        this.hurtActor(victim, monster.hit);
      }
      if (dodged) {
        this.spawnFloater(victim.x, victim.y + 240, '闪避', rgba(150, 220, 255), 24);
      }
      return;
    }
    if (monster.windupUntil === 0 && toVictim <= range && now >= monster.nextAttackAt) {
      monster.windupUntil = now + 350;
      monster.nextAttackAt = now + (monster.camp.elite ? 1100 : monster.ranged ? 1900 : 1300);
      if (monster.attackAnim) {
        this.playMonsterOneShot(monster, monster.attackAnim);
      }
    }
  }

  private hurtActor(actor: TownActor, amount: number): void {
    if (actor === this.leader) {
      this.hurtLeader(amount);
      return;
    }
    if (actor.down) {
      return;
    }
    actor.hp = Math.max(0, actor.hp - amount);
    this.spawnFloater(actor.x, actor.y + 230, `-${amount}`, rgba(255, 120, 100), 22);
    if (actor.skeleton && actor.skeleton.isValid) {
      actor.skeleton.color = rgba(255, 140, 140, 255);
      setTimeout(() => actor.skeleton && actor.skeleton.isValid && !actor.down && (actor.skeleton.color = rgba(255, 255, 255, 255)), 120);
    }
    if (actor.hp <= 0) {
      this.downCompanion(actor);
    }
  }

  private hurtLeader(amount: number): void {
    const leader = this.leader;
    if (!leader || this.leaderDead) {
      return;
    }
    this.leaderHp = Math.max(0, this.leaderHp - amount);
    this.lastHurtAt = Date.now();
    this.shake(3, 0.1);
    this.spawnFloater(leader.x, leader.y + 240, `-${amount}`, rgba(255, 90, 80), 28);
    if (leader.skeleton && leader.skeleton.isValid) {
      leader.skeleton.color = rgba(255, 140, 140, 255);
      setTimeout(() => leader.skeleton && leader.skeleton.isValid && (leader.skeleton.color = rgba(255, 255, 255, 255)), 120);
    }
    // 10-28 录屏:连续受击每次都重触发,血条一直白 → 闪过一次后 600ms 内不再闪
    if (Date.now() > this.leaderHitFlashUntil + 600) {
      this.leaderHitFlashUntil = Date.now() + 160;
    }
    this.drawLeaderHp();
    if (this.leaderHp <= 0) {
      this.onLeaderDown();
    }
  }

  /** 队长倒下:2 秒后回本图传送阵满血复活(队友一起);交战中的怪群回满血(不掉东西)。 */
  private onLeaderDown(): void {
    const leader = this.leader;
    if (!leader) {
      return;
    }
    this.leaderDead = true;
    this.pendingHits = [];
    this.companionHits = [];
    this.setLockTarget(null);
    this.host.setStatus('你倒下了…将在传送阵复活');
    const names = leader.names;
    if (leader.skeleton && leader.skeleton.isValid && names?.death) {
      leader.skeleton.setAnimation(0, names.death, false);
    }
    setTimeout(() => {
      if (!this.leader || this.leader !== leader || !leader.node.isValid) {
        return;
      }
      const wp = this.def.waypoint;
      const x = wp.x + 40;
      const y = wp.y - 150;
      for (const actor of [leader, ...this.followers]) {
        actor.x = x;
        actor.y = y;
        actor.node.setPosition(x, y, 0);
      }
      this.trail = [new Vec2(x, y)];
      for (const monster of this.monsters) {
        monster.victim = null;
        if (!monster.dead && monster.maxHp > 0) {
          monster.hp = monster.maxHp;
          monster.windupUntil = 0;
          this.drawMonsterHp(monster);
        }
      }
      this.leaderHp = this.leaderMaxHp;
      this.leaderDead = false;
      leader.anim = null;
      this.applyActorAnimation(leader, true);
      for (const actor of this.followers) {
        if (actor.down) {
          this.reviveCompanion(actor, 1);
        } else {
          actor.hp = actor.maxHp;
        }
      }
      this.drawLeaderHp();
      this.applyCamera(true);
    }, 2000);
  }

  /**
   * 怪物头顶血条(docs/51 §7):被锁的普通怪 = 名字 + 血条;被锁的精英只留箭头(名字血条走顶部精英条);
   * 没锁的怪只在挨打后 3 秒显示一条细血条。
   */
  private drawMonsterHp(monster: TownMonster): void {
    const g = monster.hpBar;
    if (!g || !g.isValid) {
      return;
    }
    const locked = monster === this.lockTarget;
    const recent = Date.now() - monster.lastHitAt < 3000;
    const ratio = monster.maxHp > 0 ? monster.hp / monster.maxHp : 1;
    const mode = monster.dead || monster.maxHp <= 0 ? 'none' : locked ? (monster.camp.elite ? 'none' : 'full') : recent ? 'thin' : 'none';
    const key = `${mode}:${Math.round(ratio * 100)}`;
    if (monster.nameLabel && monster.nameLabel.isValid) {
      const showName = !monster.dead && locked && !monster.camp.elite;
      if (monster.nameLabel.node.active !== showName) {
        monster.nameLabel.node.active = showName;
      }
    }
    if (key === monster.hpKey) {
      return;
    }
    monster.hpKey = key;
    g.clear();
    if (mode === 'none') {
      return;
    }
    const full = mode === 'full';
    const w = full ? 128 : 84;
    const h = full ? 10 : 5;
    g.fillColor = rgba(10, 6, 6, 220);
    g.roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 3);
    g.fill();
    g.fillColor = rgba(220, 52, 44, 255);
    g.rect(-w / 2, -h / 2, w * ratio, h);
    g.fill();
  }

  /** 底部中间队长血条(docs/51 §4);野外才有。 */
  private drawLeaderHp(): void {
    const bar = this.leaderBar;
    if (!bar || !bar.fill.isValid) {
      return;
    }
    const ratio = this.leaderMaxHp > 0 ? Math.max(0, Math.min(1, this.leaderHp / this.leaderMaxHp)) : 1;
    const flash = Date.now() < this.leaderHitFlashUntil;
    const key = `${Math.round(ratio * 400)}:${flash ? 1 : 0}`;
    if (key === bar.key) {
      return;
    }
    bar.key = key;
    const g = bar.fill;
    g.clear();
    const color = flash ? rgba(255, 255, 255, 255) : ratio > 0.5 ? rgba(98, 176, 104, 255) : ratio > 0.3 ? rgba(214, 180, 90, 255) : rgba(206, 84, 70, 255);
    g.fillColor = color;
    g.roundRect(-bar.w / 2, -bar.h / 2, Math.max(bar.h, bar.w * ratio), bar.h, bar.h / 2);
    g.fill();
    // 顶部一道亮线,不至于一整块死色
    g.fillColor = rgba(255, 255, 255, 50);
    g.rect(-bar.w / 2, bar.h / 2 - Math.max(1, bar.h * 0.28), bar.w * ratio, Math.max(1, bar.h * 0.28));
    g.fill();
    if (bar.text.isValid) {
      bar.text.string = `${this.host.formatInteger(Math.round(this.leaderHp))} / ${this.host.formatInteger(this.leaderMaxHp)}`;
    }
  }

  private spawnFloater(x: number, y: number, text: string, color: ReturnType<typeof rgba>, size: number): void {
    const root = this.entityRoot;
    if (!root || !root.isValid) {
      return;
    }
    // 宽按字数给(10-28 录屏:「操控 · 圣光审判者·米迦勒」塞进 260 宽被 SHRINK 压成一团)
    const width = Math.max(260, text.length * size * 1.15 + 40);
    const label = this.host.addChildLabel(root, 'Floater', text, x + (Math.random() - 0.5) * 30, y, size, color, new Size(width, size * 1.4));
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(20, 8, 4, 255);
    label.outlineWidth = 3;
    label.node.setSiblingIndex(root.children.length - 1);
    const opacity = label.node.addComponent(UIOpacity);
    if (size >= 28) {
      // 重击 / 队长伤害:先放大再落回(打击感)
      label.node.setScale(1.6, 1.6, 1);
      tween(label.node).to(0.09, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    }
    tween(label.node).by(0.7, { position: new Vec3(0, 70, 0) }).start();
    tween(opacity).delay(0.35).to(0.35, { opacity: 0 }).call(() => label.node.isValid && label.node.destroy()).start();
  }

  // ── 野外战斗 HUD(原型 proto_field_v1:右下战斗簇 / 底部队长血条 / 右侧援护位 / 顶部精英条) ──

  /** 右下战斗按钮簇:大普攻 + 三技能弧排 + 翻滚 + 切换目标;电脑端挂按键角标。 */
  private renderCombatButtons(hud: Node, layout: UiLayout, scale: number): void {
    void scale;
    this.combatButtons = [];
    if (this.def.camps.length === 0) {
      return;
    }
    const P = townProtoFrame(layout);
    const showKeys = !isPhoneDesign();
    const mk = (name: string, px: number, py: number, d: number, hot: boolean, icon: string, iconK: number, key: string, onPress: () => void, index: number, caption = ''): void => {
      const size = P.S(d);
      const node = this.host.addChildPlainNode(hud, name, P.R(px), P.Y(py), size, size);
      // 大招就绪光圈(10-29 用户):挂在圆盘下面,冷却结束时外扩一次 + 呼吸
      const halo = index === 2 ? this.mountHalo(node, size * 1.5) : null;
      mountRingBase(this.host, node, size * 1.12, hot);
      this.addFitSprite('Icon', icon, 0, 0, size * iconK, size * iconK, node);
      let cd: Label | null = null;
      let mask: Graphics | null = null;
      if (index >= 0 || index === -2) {
        mask = this.host.addChildPlainNode(node, 'CdMask', 0, 0, size, size).addComponent(Graphics);
        cd = this.host.addChildLabel(node, 'Cd', '', 0, 0, size * 0.36, rgba(255, 236, 196), new Size(size, size * 0.5));
        cd.isBold = true;
        cd.enableOutline = true;
        cd.outlineColor = rgba(10, 6, 4, 255);
        cd.outlineWidth = 2;
      }
      if (caption) {
        const label = this.host.addChildLabel(node, 'Caption', caption, 0, -size * 0.5 - P.S(14), P.S(18), rgba(244, 230, 200), new Size(P.S(110), P.S(26)));
        label.enableOutline = true;
        label.outlineColor = rgba(0, 0, 0, 230);
        label.outlineWidth = 2;
      }
      if (showKeys) {
        const r = size * 0.15;
        const bw = key.length > 1 ? r * (1.2 + key.length * 0.62) : r * 2;
        const badge = this.host.addChildPlainNode(node, 'KeyHint', size * 0.36 - (bw / 2 - r) * 0.5, size * 0.36, bw, r * 2);
        const bg = badge.addComponent(Graphics);
        bg.fillColor = rgba(14, 12, 10, 235);
        bg.roundRect(-bw / 2, -r, bw, r * 2, r);
        bg.fill();
        bg.strokeColor = rgba(214, 170, 92, 240);
        bg.lineWidth = 1.5;
        bg.roundRect(-bw / 2, -r, bw, r * 2, r);
        bg.stroke();
        const k = this.host.addChildLabel(badge, 'Key', key, 0, 0, key.length > 1 ? r * 0.9 : r * 1.15, rgba(255, 236, 190), new Size(bw - r * 0.5, r * 1.6));
        k.isBold = true;
      }
      node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
        event.propagationStopped = true;
        onPress();
      }, this);
      this.host.applyImageButtonFeedback(node, 1.06, 0.94);
      this.combatButtons.push({ node, cd, mask, index, size, drawn: -1, halo, haloOn: false });
    };
    const A = TOWN_HUD_ASSETS;
    // B 风格(原型 field_b):白色线稿图标约占圆盘 0.6
    mk('LobbyFieldAttack', 1668, 690, 165, true, A.icSword, 0.6, 'J', () => this.leaderAttack(), -1);
    mk('LobbyFieldSkill0', 1560, 598, 92, false, A.icSlash, 0.62, 'K', () => this.leaderSkill(0), 0);
    mk('LobbyFieldSkill1', 1666, 520, 92, false, A.icDash, 0.62, 'L', () => this.leaderSkill(1), 1);
    mk('LobbyFieldSkill2', 1773, 590, 92, false, A.icWhirl, 0.62, 'I', () => this.leaderSkill(2), 2);
    mk('LobbyFieldDodge', 1522, 712, 84, false, A.icDodge, 0.6, 'Shift', () => this.leaderDodge(), -2);
    mk('LobbyFieldTarget', 1805, 700, 70, false, A.icTarget, 0.56, 'Tab', () => this.cycleLockTarget(), -3, '切换目标');
  }

  /** 就绪光圈节点(香槟柔光环,默认透明);挂在调用处当前子节点之上、圆盘之下由调用顺序保证。 */
  private mountHalo(parent: Node, size: number): Node | null {
    const sprite = this.host.addSprite('Halo', TOWN_HUD_ASSETS.haloRing, 0, 0, size, size, parent);
    if (!sprite) {
      return null;
    }
    sprite.node.addComponent(UIOpacity).opacity = 0;
    return sprite.node;
  }

  /**
   * 就绪光圈开关(10-29 用户:大招 / 队友援护冷却结束要有特效):变就绪那一下从 1.35 倍外扩收回 + 亮闪,之后慢呼吸;
   * 不就绪立即隐去。只在状态翻转时动 tween,每帧调用无开销。
   */
  private setHalo(holder: { halo: Node | null; haloOn: boolean }, on: boolean): void {
    const halo = holder.halo;
    if (!halo || !halo.isValid || holder.haloOn === on) {
      return;
    }
    holder.haloOn = on;
    const fade = halo.getComponent(UIOpacity)!;
    Tween.stopAllByTarget(halo);
    Tween.stopAllByTarget(fade);
    if (!on) {
      fade.opacity = 0;
      halo.setScale(1, 1, 1);
      return;
    }
    halo.setScale(1.35, 1.35, 1);
    fade.opacity = 255;
    tween(halo).to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
      .then(tween(halo).repeatForever(tween(halo).to(0.9, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' }).to(0.9, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })))
      .start();
    tween(fade).delay(0.32).repeatForever(tween(fade).to(0.9, { opacity: 140 }, { easing: 'sineInOut' }).to(0.9, { opacity: 255 }, { easing: 'sineInOut' })).start();
  }

  private refreshCombatButtons(now: number): void {
    for (const button of this.combatButtons) {
      if (!button.node.isValid) {
        continue;
      }
      const readyAt = button.index >= 0 ? this.skillReadyAt[button.index] : button.index === -2 ? this.dodgeReadyAt : 0;
      const total = button.index >= 0 ? LobbyTownRenderer.SKILLS[button.index].cdMs : 1200;
      const left = Math.max(0, readyAt - now);
      if (button.cd && button.cd.isValid) {
        const text = left > 0 && button.index >= 0 ? `${Math.ceil(left / 1000)}` : '';
        if (button.cd.string !== text) {
          button.cd.string = text;
        }
      }
      if (button.mask && button.mask.isValid) {
        // 冷却扇形:从 12 点方向顺时针退去(arc 第六参 true = 逆时针短弧,见 Graphics.arc 方向坑)
        const frac = left > 0 ? Math.min(1, left / total) : 0;
        const key = Math.round(frac * 60);
        if (key !== button.drawn) {
          button.drawn = key;
          const g = button.mask;
          g.clear();
          if (frac > 0) {
            const r = button.size * 0.4;
            g.fillColor = rgba(0, 0, 0, 150);
            g.moveTo(0, 0);
            g.arc(0, 0, r, Math.PI / 2 - Math.PI * 2 * frac, Math.PI / 2, true);
            g.close();
            g.fill();
          }
        }
      }
      if (button.halo) {
        this.setHalo(button, left <= 0 && !this.leaderDead);
      }
      const opacity = button.node.getComponent(UIOpacity) ?? button.node.addComponent(UIOpacity);
      const want = this.leaderDead ? 140 : 255;
      if (opacity.opacity !== want) {
        opacity.opacity = want;
      }
    }
  }

  /** 底部中间队长血条:「英雄名 Lv.X」+ 长条 + 血量数字(原型 x 580~1255、y 786)。 */
  private renderLeaderBar(hud: Node, layout: UiLayout): void {
    this.leaderBar = null;
    const leader = this.leader;
    // 野外队长脚下一圈青色细环(原型:一眼认出自己操控的是谁);主城清空。
    // 不用 active 开关:原生端 Graphics 停用会销毁绘制数据,再启用后调试包切图触发 gfx-validator 断言 → 按地图重画 / 清空
    if (leader) {
      this.ensureLeaderRing(leader);
    }
    if (this.def.camps.length === 0 || !leader) {
      return;
    }
    const P = townProtoFrame(layout);
    // 原型实测:条 707..1118、名字右沿 692、数字左沿 1140
    const w = P.S(411);
    const h = P.S(16);
    const node = this.host.addChildPlainNode(hud, 'LobbyFieldLeaderBar', P.C(912.5), P.Y(786), w + P.S(40), P.S(40));
    // 原型:圆角暗槽 + 2px 金边,填充留 2px 内缩
    mountGlassSlice(this.host as never, node, 'Groove', GLASS_SLICES.hudCapsuleDim, 0, 0, w + P.S(8), h + P.S(8), (h + P.S(8)) / 48);
    const fill = this.host.addChildPlainNode(node, 'Fill', 0, 0, w, h).addComponent(Graphics);
    const hero = leader.hero;
    const name = this.host.addChildLabel(node, 'Name', `${safeText(hero.heroName)} Lv.${hero.level}`, -w / 2 - P.S(15), P.S(1), P.S(22), rgba(246, 236, 214), new Size(P.S(220), P.S(30)), HorizontalTextAlignment.RIGHT);
    name.overflow = Label.Overflow.SHRINK;
    name.enableOutline = true;
    name.outlineColor = rgba(0, 0, 0, 230);
    name.outlineWidth = 2;
    const text = this.host.addChildLabel(node, 'Hp', '', w / 2 + P.S(22), P.S(1), P.S(19), rgba(236, 226, 206), new Size(P.S(200), P.S(28)), HorizontalTextAlignment.LEFT);
    text.overflow = Label.Overflow.SHRINK;
    text.enableOutline = true;
    text.outlineColor = rgba(0, 0, 0, 230);
    text.outlineWidth = 2;
    this.leaderBar = { fill, text, name, w, h, key: '' };
    this.drawLeaderHp();
  }

  /** 右侧援护位:3 个队友圆头像 + 血条 + 援护冷却环;倒下变灰 + 倒计时(原型 x 1790、y 205 / 312 / 420)。 */
  private renderPartyColumn(hud: Node, layout: UiLayout): void {
    this.partySlots = [];
    if (this.def.camps.length === 0) {
      return;
    }
    const P = townProtoFrame(layout);
    const d = P.S(84);
    // 编号角标手机也显示(原型 1 / 2 / 3;电脑端同时是数字键提示)
    const showKeys = true;
    this.followers.slice(0, 3).forEach((actor, index) => {
      const node = this.host.addChildPlainNode(hud, `LobbyFieldAssist_${index}`, P.R(1790), P.Y(205 + index * 107), d * 1.3, d * 1.3);
      // 援护技(队友大招)就绪光圈(10-29 用户):冷却结束外扩一次 + 呼吸
      const halo = this.mountHalo(node, d * 1.45);
      const face = this.host.addChildPlainNode(node, 'Face', 0, 0, d * 0.82, d * 0.82);
      if (!mountHeroAvatar(face, actor.hero.heroCode, d * 0.82, 'circle')) {
        const g = face.addComponent(Graphics);
        g.fillColor = rgba(40, 32, 46, 240);
        g.circle(0, 0, d * 0.41);
        g.fill();
        const initial = this.host.addChildLabel(face, 'Initial', safeText(actor.hero.heroName).slice(0, 1), 0, 0, d * 0.38, rgba(255, 230, 180), new Size(d, d * 0.5));
        initial.isBold = true;
      }
      const shade = this.host.addChildPlainNode(node, 'Shade', 0, 0, d, d).addComponent(Graphics);
      const cdRing = this.host.addChildPlainNode(node, 'Cd', 0, 0, d * 1.2, d * 1.2).addComponent(Graphics);
      // B 风格:头像外一圈浅色细环(原型 field_b),不用尖刺金环
      // 细环贴图(环半径 110/256):外径对齐 d × 0.46
      this.host.addSprite('Ring', TOWN_HUD_ASSETS.hudRingThin, 0, 0, d * 1.07, d * 1.07, node);
      const count = this.host.addChildLabel(node, 'Count', '', 0, 0, d * 0.42, rgba(255, 255, 255), new Size(d, d * 0.5));
      count.isBold = true;
      count.enableOutline = true;
      count.outlineColor = rgba(0, 0, 0, 255);
      count.outlineWidth = 2;
      const hpW = d * 0.84;
      const hpH = Math.max(4, P.S(8));
      const hpNode = this.host.addChildPlainNode(node, 'Hp', 0, -d * 0.5 - P.S(10), hpW + 4, hpH + 4);
      mountGlassSlice(this.host as never, hpNode, 'Bg', GLASS_SLICES.hudCapsuleDim, 0, 0, hpW + 4, hpH + 4, (hpH + 4) / 48);
      const hp = this.host.addChildPlainNode(hpNode, 'Fill', 0, 0, hpW, hpH).addComponent(Graphics);
      if (showKeys) {
        const badge = this.host.addChildPlainNode(node, 'Key', -d * 0.82, 0, P.S(30), P.S(30));
        // 编号小圆:同圆钮贴图(盘半径 0.41 → 外框 = 14 / 0.41)
        this.host.addSprite('Bg', TOWN_HUD_ASSETS.hudDisc, 0, 0, P.S(34), P.S(34), badge);
        this.host.addChildLabel(badge, 'Label', `${index + 1}`, 0, 0, P.S(18), rgba(242, 242, 242), new Size(P.S(28), P.S(24))).isBold = true;
      }
      // 点一下 = 援护技;按住 0.5 秒 = 换队长(docs/51 §3)
      node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
        event.propagationStopped = true;
        this.holdFired = false;
        if (this.holdTimer) {
          clearTimeout(this.holdTimer);
        }
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          this.holdFired = true;
          this.swapLeader(index);
        }, SWAP_HOLD_MS);
      }, this);
      const release = (): void => {
        if (this.holdTimer) {
          clearTimeout(this.holdTimer);
          this.holdTimer = null;
          if (!this.holdFired) {
            this.triggerAssist(index);
          }
        }
      };
      node.on(Node.EventType.TOUCH_END, release, this);
      node.on(Node.EventType.TOUCH_CANCEL, release, this);
      this.host.applyImageButtonFeedback(node, 1.06, 0.94);
      this.partySlots.push({ actor, node, shade, cdRing, count, hp, hpW, hpH, d, key: '', halo, haloOn: false });
    });
    this.refreshPartyHud(Date.now());
  }

  private refreshPartyHud(now: number): void {
    for (const slot of this.partySlots) {
      if (!slot.node.isValid) {
        continue;
      }
      const actor = slot.actor;
      const ratio = actor.maxHp > 0 ? Math.max(0, actor.hp / actor.maxHp) : 1;
      const cdFrac = actor.down ? 0 : Math.max(0, Math.min(1, 1 - (actor.assistReadyAt - now) / COMPANION_ASSIST_CD_MS));
      const downLeft = actor.down ? Math.max(0, Math.ceil((actor.downUntil - now) / 1000)) : 0;
      const key = `${Math.round(ratio * 50)}:${Math.round(cdFrac * 48)}:${actor.down ? downLeft : -1}`;
      // 没怪也能放(10-29 用户):冷却好了就亮
      this.setHalo(slot, !actor.down && cdFrac >= 1);
      if (key === slot.key) {
        continue;
      }
      slot.key = key;
      const hp = slot.hp;
      hp.clear();
      hp.fillColor = ratio > 0.3 ? rgba(98, 176, 104, 255) : rgba(206, 84, 70, 255);
      hp.roundRect(-slot.hpW / 2, -slot.hpH / 2, slot.hpW * ratio, slot.hpH, slot.hpH / 2);
      hp.fill();
      slot.shade.clear();
      if (actor.down) {
        slot.shade.fillColor = rgba(20, 20, 24, 170);
        slot.shade.circle(0, 0, slot.d * 0.42);
        slot.shade.fill();
      }
      slot.count.string = actor.down ? `${downLeft}` : '';
      const g = slot.cdRing;
      g.clear();
      if (!actor.down) {
        const r = slot.d * 0.5;
        if (cdFrac >= 1) {
          // 就绪:光圈节点负责(setHalo),这里只补一圈香槟细环
          g.strokeColor = rgba(232, 202, 142, 255);
          g.lineWidth = slot.d * 0.035;
          g.circle(0, 0, r - slot.d * 0.04);
          g.stroke();
        } else if (cdFrac > 0) {
          // 冷却进度:香槟细弧
          g.strokeColor = rgba(226, 196, 138, 220);
          g.lineWidth = slot.d * 0.035;
          g.arc(0, 0, r, Math.PI / 2 - Math.PI * 2 * cdFrac, Math.PI / 2, true);
          g.stroke();
        }
      }
    }
  }

  /** 顶部中间精英条:锁定精英时显示名字 + 长血条(原型 x 620~1225、y 42~92)。 */
  private renderEliteBar(hud: Node, layout: UiLayout): void {
    this.eliteBar = null;
    if (!this.def.camps.some((camp) => camp.elite)) {
      return;
    }
    const P = townProtoFrame(layout);
    const w = P.S(530);
    const h = P.S(16);
    const node = this.host.addChildPlainNode(hud, 'LobbyFieldEliteBar', P.C(950), P.Y(68), w + P.S(140), P.S(80));
    const groove = node.addComponent(Graphics);
    groove.fillColor = rgba(10, 6, 6, 225);
    groove.rect(-w / 2, -h / 2, w, h);
    groove.fill();
    mountRefSliced(this.host, node, 'Frame', { path: TOWN_HUD_ASSETS.barFrame, w: 1112, h: 120, inset: [96, 96, 30, 30] }, 0, 0, w + P.S(60), P.S(36));
    const fill = this.host.addChildPlainNode(node, 'Fill', 0, 0, w, h).addComponent(Graphics);
    this.host.addSprite('Medal', TOWN_HUD_ASSETS.eliteMedal, -w / 2 - P.S(48), 0, P.S(70), P.S(68), node);
    const name = this.host.addChildLabel(node, 'Name', '', 0, P.S(27), P.S(24), rgba(250, 236, 210), new Size(w, P.S(32)));
    name.isBold = true;
    name.enableOutline = true;
    name.outlineColor = rgba(0, 0, 0, 235);
    name.outlineWidth = 2;
    // 破防条(原型:血条下一条琥珀色分段细条,约 0.8 血条宽)
    const sw = w * 0.8;
    const sh = P.S(7);
    const sy = -h / 2 - P.S(11);
    const sg = this.host.addChildPlainNode(node, 'StaggerBg', 0, sy, sw + 4, sh + 4).addComponent(Graphics);
    sg.fillColor = rgba(10, 8, 6, 225);
    sg.roundRect(-sw / 2 - 2, -sh / 2 - 2, sw + 4, sh + 4, 2);
    sg.fill();
    sg.strokeColor = rgba(170, 132, 70, 200);
    sg.lineWidth = 1;
    sg.roundRect(-sw / 2 - 2, -sh / 2 - 2, sw + 4, sh + 4, 2);
    sg.stroke();
    const stagger = this.host.addChildPlainNode(node, 'Stagger', 0, sy, sw, sh).addComponent(Graphics);
    this.eliteBar = { node, fill, name, stagger, sw, sh, w, h, key: '' };
    this.refreshEliteBar();
  }

  private refreshEliteBar(): void {
    const bar = this.eliteBar;
    if (!bar || !bar.node.isValid) {
      return;
    }
    const target = this.lockTarget;
    const show = !!target && target.camp.elite && !target.dead;
    // 显隐用不透明度(节点里有 Graphics,原生端 active 开关会销毁绘制数据,见队长脚环注释)
    const opacity = bar.node.getComponent(UIOpacity) ?? bar.node.addComponent(UIOpacity);
    const want = show ? 255 : 0;
    if (opacity.opacity !== want) {
      opacity.opacity = want;
    }
    if (!show || !target) {
      return;
    }
    const ratio = target.maxHp > 0 ? Math.max(0, target.hp / target.maxHp) : 1;
    const staggered = Date.now() < target.staggeredUntil;
    const flash = staggered && Math.floor(Date.now() / 160) % 2 === 0;
    const key = `${target.camp.stageCode}:${Math.round(ratio * 300)}:${Math.round(target.stagger * 40)}:${flash ? 1 : 0}`;
    if (key === bar.key) {
      return;
    }
    bar.key = key;
    bar.name.string = `精英 · ${target.camp.label.replace(/群|窝|巢|哨岗|营地/g, '') || target.camp.label}  Lv.${target.camp.level}${staggered ? '  破防' : ''}`;
    bar.fill.clear();
    bar.fill.fillColor = rgba(196, 40, 34, 255);
    bar.fill.rect(-bar.w / 2, -bar.h / 2, bar.w * ratio, bar.h);
    bar.fill.fill();
    // 破防条:4 段琥珀;破防中整条闪白
    const g = bar.stagger;
    g.clear();
    const frac = staggered ? 1 : target.stagger;
    if (frac > 0) {
      g.fillColor = flash ? rgba(255, 250, 230, 255) : rgba(236, 170, 50, 255);
      g.rect(-bar.sw / 2, -bar.sh / 2, bar.sw * frac, bar.sh);
      g.fill();
    }
    g.fillColor = rgba(10, 8, 6, 230);
    for (let i = 1; i < 4; i += 1) {
      g.rect(-bar.sw / 2 + (bar.sw * i) / 4 - 1, -bar.sh / 2, 2, bar.sh);
    }
    g.fill();
  }
}

/** 一组动画两两设过渡混合(缺的 / 重名跳过)。 */
function mixAll(skeleton: sp.Skeleton, anims: Array<string | null | undefined>, sec: number): void {
  const list = Array.from(new Set(anims.filter((name): name is string => !!name)));
  for (const a of list) {
    for (const b of list) {
      if (a !== b) {
        try {
          skeleton.setMix(a, b, sec);
        } catch (error) {
          void error;
        }
      }
    }
  }
}

/** 队友定位(docs/51 §6):坦克 / 战士 / 刺客贴身,射手 / 法师远程,辅助远程 + 治疗。 */
function companionRole(heroClass: string | null | undefined): 'melee' | 'ranged' | 'support' {
  const value = safeText(heroClass);
  if (value.includes('辅助')) {
    return 'support';
  }
  return value.includes('射手') || value.includes('法师') ? 'ranged' : 'melee';
}

function skeletonHasShadowSlot(data: sp.SkeletonData): boolean {
  try {
    const runtime = data.getRuntimeData(true) as unknown as { slots?: Array<{ name?: string }> } | null;
    return !!runtime?.slots?.some((slot) => /^(shadow|ying|yingzi)$/i.test((slot.name || '').trim()));
  } catch {
    return false;
  }
}
