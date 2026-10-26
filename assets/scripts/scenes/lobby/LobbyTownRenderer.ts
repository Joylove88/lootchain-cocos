import {
  Button,
  EventKeyboard,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  Input,
  KeyCode,
  Label,
  Node,
  Size,
  Sprite,
  UIOpacity,
  UITransform,
  Vec2,
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
import { LOBBY_C1812_NAV_ICON_ASSETS } from '../C1812CommonUiAssets';
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
import { GUARD_MONSTER_DB_SCALE } from './GuardBattleModel';
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
}

type TownInteract =
  | { kind: 'building'; key: string; label: string; x: number; y: number; building: WorldMapBuilding }
  | { kind: 'npc'; key: string; label: string; x: number; y: number; npc: WorldNpcCode }
  | { kind: 'waypoint'; key: string; label: string; x: number; y: number };

export class LobbyTownRenderer {
  static readonly WORLD_NODE_NAME = WORLD_NODE_NAME;

  private world: Node | null = null;
  private groundRoot: Node | null = null;
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
  private enterButton: Node | null = null;
  private enterPlate: Label | null = null;
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
  private monsters: TownMonster[] = [];
  private readonly campRespawnAt = new Map<string, number>();
  private battleLock = false;
  private exitCooldownUntil = 0;
  private waypointReported = new Set<string>();
  private nearInteract: TownInteract | null = null;
  private hudNode: Node | null = null;
  private hudLayout: UiLayout | null = null;
  /** 读条(传送 3 秒 / 回城 5 秒):移动打断。 */
  private channel: { startAt: number; endAt: number; label: string; onDone: () => void } | null = null;
  private channelBar: { node: Node; fill: Graphics; label: Label; w: number; h: number } | null = null;
  private bannerUntil = 0;
  private respawnCheckAt = 0;

  constructor(private readonly host: LobbyTownHost) {}

  private get def(): WorldMapDef {
    return worldMapDef(this.mapCode);
  }

  currentMapCode(): WorldMapCode {
    return this.mapCode;
  }

  /** 切地图(docs/50 传送阵 / 出口 / 回城):销毁当前世界,下次 render 按新地图建;spawn 缺省 = 该图出生点。 */
  enterMap(code: WorldMapCode, spawn?: { x: number; y: number } | null): void {
    this.mapCode = code;
    this.pendingSpawn = spawn ?? { ...worldMapDef(code).spawn };
    this.exitCooldownUntil = Date.now() + 1500;
    this.battleLock = false;
    this.channel = null;
    this.bannerUntil = Date.now() + 2600;
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
      // 地图外沿压暗:四周一圈暗色渐变矩形(程序画),镜头到边时不露硬边
      const g = this.host.addChildPlainNode(root, 'Vignette', 0, 0, def.width, def.height).addComponent(Graphics);
      const band = 260;
      const w = def.width;
      const h = def.height;
      for (let i = 0; i < 6; i += 1) {
        const inset = (band / 6) * i;
        g.fillColor = rgba(4, 4, 8, 70);
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
      if (prop.flat) {
        // 贴地:中心对齐,排在地砖之后、压暗层之前
        sprite.node.setPosition(0, 0, 0);
        const vignette = ground.getChildByName('Vignette');
        if (vignette) {
          node.setSiblingIndex(vignette.getSiblingIndex());
        }
        return;
      }
      sprite.node.setPosition(0, h / 2, 0);
      this.propNodes.push({ node, y: prop.y });
    });
  }

  private mountPlate(parent: Node, cfg: { label: string }, y: number, badge: boolean): Node {
    const w = Math.max(150, cfg.label.length * 30 + 60);
    const h = 46;
    const plate = this.host.addChildPlainNode(parent, 'Plate', 0, y, w, h);
    const g = plate.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 10, 215);
    g.roundRect(-w / 2, -h / 2, w, h, 8);
    g.fill();
    g.strokeColor = rgba(196, 154, 86, 230);
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, 8);
    g.stroke();
    // 两端小菱形
    g.fillColor = rgba(220, 180, 100, 240);
    for (const side of [-1, 1]) {
      const cx = side * (w / 2 - 14);
      g.moveTo(cx, 7);
      g.lineTo(cx + 5, 0);
      g.lineTo(cx, -7);
      g.lineTo(cx - 5, 0);
      g.close();
    }
    g.fill();
    const label = this.host.addChildLabel(plate, 'Label', cfg.label, 0, 1, 26, rgba(255, 228, 160), new Size(w - 40, 34));
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(20, 10, 4, 255);
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
  }

  private createActor(parent: Node, hero: LobbyHeroItemVO, index: number, x: number, y: number, facing: 1 | -1): TownActor {
    const node = this.host.addChildPlainNode(parent, `TownActor_${index}`, x, y, HERO_SLOT_W, HERO_SLOT_H);
    const shadow = node.addComponent(Graphics);
    shadow.fillColor = rgba(0, 0, 0, 120);
    shadow.ellipse(0, 2, HERO_SLOT_W * 0.3, 8);
    shadow.fill();
    const actor: TownActor = { node, x, y, facing, moving: false, skeleton: null, spineNode: null, names: null, baseScaleX: 1, baseScaleY: 1, anim: null, shadow, idleFor: 0, faceAcc: 0 };
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
    if (event.keyCode === KeyCode.KEY_E || event.keyCode === KeyCode.SPACE || event.keyCode === KeyCode.ENTER) {
      this.enterNearBuilding();
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
    this.stepLeader(clamped);
    this.stepFollowers(clamped);
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
  }

  private stepLeader(dt: number): void {
    const leader = this.leader;
    if (!leader || !leader.node.isValid) {
      return;
    }
    const v = this.inputVector();
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
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - leader.x, last.y - leader.y) >= FOLLOW_SAMPLE) {
        this.trail.push(new Vec2(leader.x, leader.y));
        if (this.trail.length > 400) {
          this.trail.splice(0, this.trail.length - 400);
        }
      }
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

  private stepFollowers(dt: number): void {
    this.followers.forEach((actor, index) => {
      if (!actor.node.isValid) {
        return;
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
    const viewW = layout.stageWidth / this.k;
    const viewH = layout.stageHeight / this.k;
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
    world.setPosition(cx - this.camX * this.k, cy - this.camY * this.k, 0);
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
    return out;
  }

  private nearestInteract(): TownInteract | null {
    const leader = this.leader;
    if (!leader) {
      return null;
    }
    let best: TownInteract | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const item of this.interactables()) {
      const radius = item.kind === 'waypoint' ? WAYPOINT_RADIUS : INTERACT_RADIUS;
      const dist = Math.hypot(item.x - leader.x, item.y - leader.y);
      if (dist < radius && dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    }
    return best;
  }

  private updateNearBuilding(): void {
    const near = this.nearestInteract();
    const key = near?.key ?? null;
    if (key === (this.nearInteract?.key ?? null) && this.enterButton && this.enterButton.isValid && this.nearKey === key) {
      return;
    }
    this.nearInteract = near;
    this.nearKey = key;
    if (this.enterButton && this.enterButton.isValid) {
      this.enterButton.active = !!near;
      const opacity = this.enterButton.getComponent(UIOpacity);
      if (opacity) {
        opacity.opacity = 255;
      }
      const label = this.enterButton.getChildByName('Label')?.getComponent(Label);
      if (label) {
        label.string = near?.kind === 'npc' ? '对话' : near?.kind === 'waypoint' ? '传送' : '进入';
      }
    }
    if (this.enterPlate && this.enterPlate.isValid) {
      this.enterPlate.string = near ? near.label : '';
      this.enterPlate.node.active = !!near;
    }
    // 门口建筑名牌高亮
    for (const building of this.buildings) {
      const label = building.plate?.getChildByName('Label')?.getComponent(Label);
      if (label) {
        label.color = building.cfg.key === key ? rgba(255, 246, 210) : rgba(255, 228, 160);
      }
    }
  }

  private enterNearBuilding(): void {
    const near = this.nearestInteract();
    if (!near) {
      return;
    }
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
    if (this.guide?.flag && this.guide.building === near.building.key) {
      lobbyGuide.markVisited(this.guide.flag);
    }
    switch (near.building.action) {
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
    const effectiveGuide = world?.stage === 'VILLAGE' ? questGuide : guide ?? questGuide;
    this.guide = effectiveGuide;
    const hud = this.host.createUiNode('LobbyTownHud');
    hud.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    this.hudNode = hud;
    this.hudLayout = layout;
    this.renderJoystick(hud, layout, scale);
    this.renderEnterButton(hud, layout, scale);
    this.renderBottomBar(hud, layout, scale);
    this.renderMinimap(hud, layout, scale);
    this.renderQuestTracker(hud, layout, scale, world);
    this.renderRecallButton(hud, layout, scale, world);
    this.renderAreaBanner(hud, layout, scale);
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
    const radius = 72 * scale;
    this.joyRadius = radius;
    const homeX = layout.stageLeft + 150 * scale;
    const homeY = layout.stageBottom + 150 * scale;
    this.joyHome = new Vec3(homeX, homeY, 0);
    // 触摸板:舞台左半、底栏以上 —— 在哪按下摇杆就从哪起(浮动摇杆)
    const padW = layout.stageWidth * 0.5;
    const padH = layout.stageHeight * 0.72;
    const pad = this.host.addChildPlainNode(hud, 'LobbyTownJoyPad', layout.stageLeft + padW / 2, layout.stageBottom + padH / 2, padW, padH);
    const base = this.host.addChildPlainNode(hud, 'LobbyTownJoyBase', homeX, homeY, radius * 2, radius * 2);
    const bg = base.addComponent(Graphics);
    bg.fillColor = rgba(8, 8, 12, 120);
    bg.circle(0, 0, radius);
    bg.fill();
    bg.strokeColor = rgba(196, 154, 86, 150);
    bg.lineWidth = Math.max(1.5, 2 * scale);
    bg.circle(0, 0, radius);
    bg.stroke();
    // 四向小三角
    bg.fillColor = rgba(220, 190, 130, 110);
    const t = 7 * scale;
    const r2 = radius - 12 * scale;
    for (const [ax, ay] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>) {
      const px = ax * r2;
      const py = ay * r2;
      bg.moveTo(px + ax * t, py + ay * t);
      bg.lineTo(px - ay * t, py + ax * t);
      bg.lineTo(px + ay * t, py - ax * t);
      bg.close();
    }
    bg.fill();
    const knob = this.host.addChildPlainNode(base, 'Knob', 0, 0, radius, radius);
    const kg = knob.addComponent(Graphics);
    kg.fillColor = rgba(226, 206, 160, 200);
    kg.circle(0, 0, radius * 0.42);
    kg.fill();
    kg.strokeColor = rgba(120, 90, 40, 200);
    kg.lineWidth = Math.max(1, 1.5 * scale);
    kg.circle(0, 0, radius * 0.42);
    kg.stroke();
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

  private renderEnterButton(hud: Node, layout: UiLayout, scale: number): void {
    const size = 128 * scale;
    const x = layout.stageRight - 110 * scale;
    const y = layout.stageBottom + 150 * scale;
    const button = this.host.addChildPlainNode(hud, 'LobbyTownEnterButton', x, y, size, size);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(16, 10, 10, 225);
    g.circle(0, 0, size / 2);
    g.fill();
    g.strokeColor = rgba(214, 170, 92, 240);
    g.lineWidth = Math.max(2, 3 * scale);
    g.circle(0, 0, size / 2);
    g.stroke();
    g.strokeColor = rgba(120, 30, 26, 220);
    g.lineWidth = Math.max(1.5, 2 * scale);
    g.circle(0, 0, size / 2 - 7 * scale);
    g.stroke();
    // 门形图记
    g.fillColor = rgba(230, 190, 110, 235);
    const dw = size * 0.22;
    const dh = size * 0.3;
    g.roundRect(-dw / 2, -dh / 2 + size * 0.08, dw, dh, dw / 2);
    g.fill();
    const label = this.host.addChildLabel(button, 'Label', '进入', 0, -size * 0.3, 24 * scale, rgba(255, 236, 190), new Size(size, 30 * scale));
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(20, 10, 4, 255);
    label.outlineWidth = Math.max(1, 2 * scale);
    button.addComponent(UIOpacity);
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => this.enterNearBuilding(), this);
    this.host.applyImageButtonFeedback(button, 1.05, 0.95);
    // 上方建筑名牌
    const plateW = 200 * scale;
    const plateH = 40 * scale;
    const plate = this.host.addChildPlainNode(hud, 'LobbyTownEnterPlate', x, y + size / 2 + 36 * scale, plateW, plateH);
    const pg = plate.addComponent(Graphics);
    pg.fillColor = rgba(10, 8, 10, 215);
    pg.roundRect(-plateW / 2, -plateH / 2, plateW, plateH, 7 * scale);
    pg.fill();
    pg.strokeColor = rgba(196, 154, 86, 230);
    pg.lineWidth = Math.max(1, 1.6 * scale);
    pg.roundRect(-plateW / 2, -plateH / 2, plateW, plateH, 7 * scale);
    pg.stroke();
    const plateLabel = this.host.addChildLabel(plate, 'Label', '', 0, 1, 22 * scale, rgba(255, 228, 160), new Size(plateW - 20 * scale, 30 * scale));
    plateLabel.overflow = Label.Overflow.SHRINK;
    plateLabel.isBold = true;
    this.enterButton = button;
    this.enterPlate = plateLabel;
    button.active = false;
    plate.active = false;
  }

  private renderBottomBar(hud: Node, layout: UiLayout, scale: number): void {
    const badges = this.host.currentLobbyBadges?.() ?? null;
    const idle = this.host.currentIdleSummary?.() ?? null;
    const idleFull = !!idle && idle.capSeconds > 0 && idle.accruedSeconds >= idle.capSeconds;
    const mailUnread = (this.host.lobbyMailUnreadCount?.() ?? 0) > 0 || (badges?.mailUnread ?? 0) > 0;
    const items: Array<{ key: string; label: string; icon: string; badge: boolean; onTap: () => void }> = [
      { key: 'bag', label: '背包', icon: LOBBY_C1812_NAV_ICON_ASSETS.bag, badge: false, onTap: () => this.host.openLobbyBagPanel() },
      {
        key: 'idle',
        label: idle && idle.pendingGold > 0 ? `挂机收益 +${this.host.compactResourceValue(idle.pendingGold)}` : '挂机收益',
        icon: 'ui/bag/ai/icon_gold/spriteFrame',
        badge: idleFull,
        onTap: () => {
          if (this.host.isIdleClaiming?.()) {
            return;
          }
          if (idle && idle.claimable) {
            this.host.claimIdleReward?.();
          } else {
            this.host.setStatus(idle ? `挂机收益 金币 ${this.host.formatInteger(idle.goldPerHour)} / 时,累计到一定时长后可领取` : '挂机收益读取中…');
          }
        },
      },
      { key: 'mail', label: '邮件', icon: 'ui/lobby/ai/lhud_btn_mail/spriteFrame', badge: mailUnread, onTap: () => this.host.openLobbyMailPanel?.() },
    ];
    const itemW = 150 * scale;
    const barW = itemW * items.length + 40 * scale;
    const barH = 92 * scale;
    const bar = this.host.addChildPlainNode(hud, 'LobbyTownBottomBar', (layout.stageLeft + layout.stageRight) / 2, layout.stageBottom + barH / 2 + 6 * scale, barW, barH);
    if (!this.host.addSprite('Bg', 'ui/lobby/ai/nav_bar_bg/spriteFrame', 0, 0, barW * 1.25, barH * 1.5, bar)) {
      const g = bar.addComponent(Graphics);
      g.fillColor = rgba(8, 6, 8, 200);
      g.roundRect(-barW / 2, -barH / 2, barW, barH, 12 * scale);
      g.fill();
    }
    items.forEach((item, index) => {
      const x = -barW / 2 + 20 * scale + itemW * index + itemW / 2;
      const node = this.host.addChildPlainNode(bar, `LobbyTownBarItem_${item.key}`, x, 4 * scale, itemW, barH);
      const iconSize = 42 * scale;
      if (!this.host.addSprite('Icon', item.icon, 0, 12 * scale, iconSize, iconSize, node)) {
        const g = node.addComponent(Graphics);
        g.fillColor = rgba(120, 90, 40, 200);
        g.circle(0, 12 * scale, iconSize * 0.4);
        g.fill();
      }
      const label = this.host.addChildLabel(node, 'Label', item.label, 0, -24 * scale, 18 * scale, rgba(240, 222, 180), new Size(itemW - 8 * scale, 24 * scale));
      label.overflow = Label.Overflow.SHRINK;
      label.enableOutline = true;
      label.outlineColor = rgba(16, 8, 4, 255);
      label.outlineWidth = Math.max(1, 1.5 * scale);
      if (item.badge) {
        const dot = this.host.addChildPlainNode(node, 'Dot', iconSize / 2 + 2 * scale, 12 * scale + iconSize / 2 - 2 * scale, 16 * scale, 16 * scale);
        const dg = dot.addComponent(Graphics);
        dg.fillColor = rgba(200, 32, 40, 240);
        dg.circle(0, 0, 6 * scale);
        dg.fill();
      }
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, item.onTap, this);
      this.host.applyImageButtonFeedback(node, 1.05, 0.95);
    });
  }

  private renderMinimap(hud: Node, layout: UiLayout, scale: number): void {
    const radius = 62 * scale;
    const x = layout.stageRight - 90 * scale;
    const y = layout.stageTop - 170 * scale;
    const node = this.host.addChildPlainNode(hud, 'LobbyTownMinimap', x, y, radius * 2, radius * 2);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(6, 6, 10, 200);
    g.circle(0, 0, radius);
    g.fill();
    g.strokeColor = rgba(196, 154, 86, 230);
    g.lineWidth = Math.max(1.5, 2.2 * scale);
    g.circle(0, 0, radius);
    g.stroke();
    // 地图按长边缩进圆里
    const def = this.def;
    const mapScale = (radius * 1.7) / def.width;
    this.minimapScale = mapScale;
    g.fillColor = rgba(60, 54, 60, 160);
    g.rect(-def.width / 2 * mapScale, -def.height / 2 * mapScale, def.width * mapScale, def.height * mapScale);
    g.fill();
    // 怪群红点 / 精英黄点 / 传送阵蓝圈(原型 p2)
    for (const camp of def.camps) {
      g.fillColor = camp.elite ? rgba(246, 200, 70, 240) : rgba(220, 60, 50, 240);
      g.circle(camp.x * mapScale, camp.y * mapScale, Math.max(2.5, 3 * scale));
      g.fill();
    }
    g.strokeColor = rgba(110, 190, 255, 240);
    g.lineWidth = Math.max(1, 1.6 * scale);
    g.circle(def.waypoint.x * mapScale, def.waypoint.y * mapScale, Math.max(3, 4 * scale));
    g.stroke();
    g.fillColor = rgba(214, 176, 100, 240);
    for (const building of def.buildings) {
      const bx = building.x * mapScale;
      const by = (building.y + building.footprint.d / 2) * mapScale;
      const bw = Math.max(5 * scale, building.footprint.w * mapScale);
      const bh = Math.max(4 * scale, building.footprint.d * mapScale);
      g.rect(bx - bw / 2, by - bh / 2, bw, bh);
    }
    g.fill();
    const me = this.host.addChildPlainNode(node, 'Me', 0, 0, 12 * scale, 12 * scale);
    const mg = me.addComponent(Graphics);
    mg.fillColor = rgba(255, 255, 255, 255);
    mg.circle(0, 0, 4 * scale);
    mg.fill();
    mg.strokeColor = rgba(90, 160, 230, 230);
    mg.lineWidth = Math.max(1, 1.5 * scale);
    mg.circle(0, 0, 4 * scale);
    mg.stroke();
    this.minimapMe = me;
  }

  private updateMinimap(): void {
    const me = this.minimapMe;
    const leader = this.leader;
    if (!me || !me.isValid || !leader) {
      return;
    }
    me.setPosition(leader.x * this.minimapScale, leader.y * this.minimapScale, 0);
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
    holder.active = !near;
    if (this.trackerLabel && this.trackerLabel.isValid) {
      this.trackerLabel.string = near ? `到了「${cfg.label}」· 点右下按钮` : `前往「${cfg.label}」· ${guide.text}`;
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
      } else {
        node.destroy();
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
    const rings = activated ? [[1, 70], [0.82, 120], [0.62, 60]] : [[1, 40], [0.8, 50]];
    for (const [k, alpha] of rings) {
      g.strokeColor = activated ? rgba(110, 200, 255, alpha) : rgba(150, 150, 160, alpha);
      g.lineWidth = activated ? 5 : 3;
      g.ellipse(0, 0, rx * k, ry * k);
      g.stroke();
    }
    if (activated) {
      g.fillColor = rgba(90, 170, 255, 34);
      g.ellipse(0, 0, rx * 0.9, ry * 0.9);
      g.fill();
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
    const label = this.host.addChildLabel(node, 'Name', `${camp.label.replace(/群|窝|巢|哨岗|营地/g, '') || camp.label} Lv.${camp.level}`, 0, target + 22, 20,
      camp.elite ? rgba(255, 214, 90) : rgba(255, 120, 100), new Size(240, 28));
    label.enableOutline = true;
    label.outlineColor = rgba(16, 6, 4, 255);
    label.outlineWidth = 2;
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
    };
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
        monster.idleAnim = names.find((name) => /idle|stand|wait/i.test(name)) ?? names[0] ?? '';
        monster.moveAnim = names.find((name) => /run|walk|move/i.test(name)) ?? monster.idleAnim;
        const height = Math.max(40, runtime?.height ?? 200);
        const dir = camp.spine.split('/')[2] ?? '';
        monster.baseScale = (target * (GUARD_MONSTER_DB_SCALE[dir] ?? 1)) / height;
        spineNode.setScale(monster.baseScale * MONSTER_ART_FACING * monster.facing, monster.baseScale, 1);
        monster.skeleton = skeleton;
        monster.spineNode = spineNode;
        if (monster.idleAnim) {
          skeleton.setAnimation(0, monster.idleAnim, true);
        }
      } catch (error) {
        console.warn('[Town] monster spine failed', camp.spine, error);
      }
    });
    return monster;
  }

  /** 明雷怪:营地里游走;队长进警戒圈就追;碰到 = 开这一营的战斗(docs/50 §5.1)。 */
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
      const camp = monster.camp;
      const toLeader = Math.hypot(leader.x - monster.x, leader.y - monster.y);
      const leashed = Math.hypot(monster.x - camp.x, monster.y - camp.y) > camp.radius + 320;
      let speed = MONSTER_WANDER_SPEED;
      if (!this.battleLock && toLeader < MONSTER_AGGRO_RADIUS && !leashed) {
        monster.tx = leader.x;
        monster.ty = leader.y;
        speed = MONSTER_CHASE_SPEED;
      } else if (leashed) {
        monster.tx = monster.homeX;
        monster.ty = monster.homeY;
      } else if (now >= monster.nextPickAt) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * camp.radius;
        monster.tx = camp.x + Math.cos(angle) * r;
        monster.ty = camp.y + Math.sin(angle) * r * 0.6;
        monster.nextPickAt = now + 1800 + Math.random() * 2600;
      }
      const dx = monster.tx - monster.x;
      const dy = monster.ty - monster.y;
      const dist = Math.hypot(dx, dy);
      const moving = dist > 6;
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
        if (Math.abs(dx) > 3) {
          const facing: 1 | -1 = dx > 0 ? 1 : -1;
          if (facing !== monster.facing) {
            monster.facing = facing;
            monster.spineNode?.setScale(monster.baseScale * MONSTER_ART_FACING * facing, monster.baseScale, 1);
          }
        }
      }
      if (moving !== monster.moving && monster.skeleton && monster.skeleton.isValid) {
        monster.moving = moving;
        const anim = moving ? monster.moveAnim : monster.idleAnim;
        if (anim) {
          monster.skeleton.setAnimation(0, anim, true);
        }
      }
      if (!this.battleLock && toLeader < MONSTER_CONTACT_RADIUS) {
        this.battleLock = true;
        this.keys.clear();
        this.joy = { active: false, id: -1, dx: 0, dy: 0 };
        this.channel = null;
        this.host.startWorldFieldBattle?.(camp.stageCode);
        return;
      }
    }
  }

  // ── docs/50:任务追踪 / 回城 / 读条 / 区域横幅 ──

  /** 当前剧情任务 → 引导目标点(本图 NPC / 怪群 / 传送阵;目标在别的图就指向本图传送阵或出口)。 */
  private resolveQuestGuide(world: WorldStateVO | null): TownGuideTarget | null {
    const quest = this.primaryQuest(world);
    if (!quest || quest.state === 'LOCKED') {
      return null;
    }
    const def = this.def;
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
    const quest = this.primaryQuest(world);
    const bounties = (world?.bounties ?? []).filter((item) => item.state === 'ACCEPTED' || item.state === 'DONE');
    const rows: Array<{ tag: string; text: string; color: ReturnType<typeof rgba> }> = [];
    if (quest) {
      const progress = quest.objective === 'KILL' || quest.objective === 'COLLECT' ? ` ${Math.min(quest.progress, quest.target)}/${quest.target}` : '';
      const status = quest.state === 'DONE' ? '(可交付)' : quest.state === 'AVAILABLE' ? '(可接取)' : quest.state === 'LOCKED' ? `(Lv.${quest.minLevel} 可接)` : '';
      rows.push({ tag: '剧情', text: `${quest.name} · ${quest.desc.replace(/[。.]$/, '')}${progress}${status}`, color: rgba(255, 214, 120) });
    }
    for (const bounty of bounties.slice(0, 2)) {
      rows.push({ tag: '悬赏', text: `${bounty.name} ${Math.min(bounty.progress, bounty.target)}/${bounty.target}${bounty.state === 'DONE' ? '(可领取)' : ''}`, color: rgba(140, 200, 255) });
    }
    if (rows.length === 0) {
      return;
    }
    const w = Math.min(430 * scale, layout.stageWidth * 0.34);
    const rowH = 40 * scale;
    const h = rows.length * rowH + 14 * scale;
    const x = layout.stageLeft + 24 * scale + w / 2;
    const y = layout.stageTop - 170 * scale - h / 2;
    const node = this.host.addChildPlainNode(hud, 'LobbyWorldQuestTracker', x, y, w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 8, 175);
    g.roundRect(-w / 2, -h / 2, w, h, 8 * scale);
    g.fill();
    g.strokeColor = rgba(196, 154, 86, 200);
    g.lineWidth = Math.max(1, 1.5 * scale);
    g.roundRect(-w / 2, -h / 2, w, h, 8 * scale);
    g.stroke();
    rows.forEach((row, index) => {
      const ry = h / 2 - 7 * scale - rowH * index - rowH / 2;
      const tag = this.host.addChildLabel(node, `Tag_${index}`, row.tag, -w / 2 + 34 * scale, ry, 18 * scale, row.color, new Size(56 * scale, 26 * scale));
      tag.isBold = true;
      const text = this.host.addChildLabel(node, `Text_${index}`, row.text, -w / 2 + 66 * scale, ry, 18 * scale, rgba(240, 228, 204), new Size(w - 80 * scale, 26 * scale), HorizontalTextAlignment.LEFT);
      text.overflow = Label.Overflow.SHRINK;
    });
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => this.host.openWorldQuestTracker?.(), this);
    this.host.applyImageButtonFeedback(node, 1.02, 0.98);
  }

  /** 野外 / 林地右下「回城」(5 秒读条,移动打断)。 */
  private renderRecallButton(hud: Node, layout: UiLayout, scale: number, world: WorldStateVO | null): void {
    const home = this.villageOrCity(world);
    if (this.mapCode === home) {
      return;
    }
    const size = 84 * scale;
    const x = layout.stageRight - 110 * scale;
    const y = layout.stageBottom + 300 * scale;
    const button = this.host.addChildPlainNode(hud, 'LobbyWorldRecall', x, y, size, size);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(16, 10, 10, 225);
    g.circle(0, 0, size / 2);
    g.fill();
    g.strokeColor = rgba(214, 170, 92, 240);
    g.lineWidth = Math.max(2, 2.5 * scale);
    g.circle(0, 0, size / 2);
    g.stroke();
    // 城堡图记
    g.fillColor = rgba(230, 190, 110, 235);
    const cw = size * 0.36;
    g.rect(-cw / 2, -size * 0.02, cw, size * 0.2);
    for (const dx of [-cw / 2, -cw / 10, cw * 0.3]) {
      g.rect(dx, size * 0.18, cw * 0.2, size * 0.1);
    }
    g.fill();
    const label = this.host.addChildLabel(button, 'Label', home === 'CITY' ? '回城' : '回村', 0, -size * 0.26, 20 * scale, rgba(255, 236, 190), new Size(size, 26 * scale));
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = rgba(20, 10, 4, 255);
    label.outlineWidth = Math.max(1, 2 * scale);
    button.addComponent(Button);
    button.on(Button.EventType.CLICK, () => {
      this.startChannel(5, home === 'CITY' ? '回城中…' : '回村中…', () => this.host.travelWorldMap?.(home, null));
    }, this);
    this.host.applyImageButtonFeedback(button, 1.05, 0.95);
  }

  /** 读条:传送 3 秒 / 回城 5 秒;任何移动输入打断。 */
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
}

/** 骨骼是否自带脚底影子插槽(命名 Shadow / ying 等)。 */
function skeletonHasShadowSlot(data: sp.SkeletonData): boolean {
  try {
    const runtime = data.getRuntimeData(true) as unknown as { slots?: Array<{ name?: string }> } | null;
    return !!runtime?.slots?.some((slot) => /^(shadow|ying|yingzi)$/i.test((slot.name || '').trim()));
  } catch {
    return false;
  }
}
