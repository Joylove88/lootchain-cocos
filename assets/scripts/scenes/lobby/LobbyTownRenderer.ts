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
import {
  TOWN_BUILDINGS,
  TOWN_GROUND_ASSET,
  TOWN_GROUND_TILE,
  TOWN_LAMPS,
  TOWN_LAMP_ASSET,
  TOWN_MAP,
  TOWN_PROPS,
  TOWN_SPAWN,
  TOWN_WALK_BOUNDS,
  townBuildingAsset,
  townPropAsset,
  type TownBuildingConfig,
  type TownBuildingKey,
} from './LobbyTownConfig';

/**
 * 主城跑图渲染器(2026-10-25,原型 v7):
 * - 世界节点 `LobbyTownWorld` 登记为可复用顶层节点:整页重绘时被摘下暂存、回大厅原样挂回,位置 / 骨骼动画都不丢;
 * - HUD(摇杆 / 进入钮 / 底栏 / 小地图 / 引导追踪)每次 render 重建,引用在 renderHud 里刷新;
 * - step(dt) 由 GameRoot.update 在大厅视图时驱动:移动 / 碰撞 / 跟随 / 镜头 / 前后遮挡 / 门口判定。
 * 角色只翻左右(现有英雄骨骼全是侧面视角);动画有 run 用 run,没有就 idle 走。
 */
export interface LobbyTownHost extends LobbyHudHost {
  /** docs/47 P0:掠夺原型直达(验收手感期间「冒险之门」走这里)。 */
  startRaidPrototype?(): void;
  currentIdleSummary?(): PlayerIdleSummaryVO | null;
  isIdleClaiming?(): boolean;
  claimIdleReward?(): void;
}

export interface TownGuideTarget {
  building: TownBuildingKey;
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
}

interface TownBuildingEntity {
  cfg: TownBuildingConfig;
  node: Node;
  plate: Node | null;
  sprite: Sprite | null;
}

const HERO_SLOT_W = 180;
const HERO_SLOT_H = 230;
const LEADER_SPEED = 340;
const FOLLOW_SAMPLE = 8;
const FOLLOW_GAP_SAMPLES = 16;
const INTERACT_RADIUS = 180;
const ACTOR_RADIUS = 26;
const WORLD_NODE_NAME = 'LobbyTownWorld';

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
  private nearKey: TownBuildingKey | null = null;
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

  constructor(private readonly host: LobbyTownHost) {}

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
    this.trail = [];
    this.partySignature = '';
    this.camX = TOWN_SPAWN.x;
    this.camY = TOWN_SPAWN.y;
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
    world.addComponent(UITransform).setContentSize(new Size(TOWN_MAP.width, TOWN_MAP.height));
    world.setScale(this.k, this.k, 1);
    this.world = world;
    this.groundRoot = this.host.addChildPlainNode(world, 'Ground', 0, 0, TOWN_MAP.width, TOWN_MAP.height);
    this.entityRoot = this.host.addChildPlainNode(world, 'Entities', 0, 0, TOWN_MAP.width, TOWN_MAP.height);
    this.buildings = [];
    this.lampNodes = [];
    this.propNodes = [];
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
    const cols = Math.ceil(TOWN_MAP.width / TOWN_GROUND_TILE) + 1;
    const rows = Math.ceil(TOWN_MAP.height / TOWN_GROUND_TILE) + 1;
    const x0 = -TOWN_MAP.width / 2 - TOWN_GROUND_TILE / 2;
    const y0 = -TOWN_MAP.height / 2 - TOWN_GROUND_TILE / 2;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const name = `Tile_${c}_${r}`;
        if (root.getChildByName(name)) {
          continue;
        }
        // 图没到时 addSprite 返回 null(并在到货后触发整刷),下次 render 再补
        const tile = this.host.addSprite(name, TOWN_GROUND_ASSET, x0 + c * TOWN_GROUND_TILE + TOWN_GROUND_TILE / 2, y0 + r * TOWN_GROUND_TILE + TOWN_GROUND_TILE / 2, TOWN_GROUND_TILE + 1, TOWN_GROUND_TILE + 1, root);
        if (tile) {
          // 每格明暗微调(按格子坐标取伪随机),打散平铺的重复感;地砖永远排最底
          const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
          const v = 216 + (h % 40);
          tile.color = rgba(v, v, v, 255);
          tile.node.setSiblingIndex(0);
        }
      }
    }
    if (!root.getChildByName('Vignette')) {
      // 地图外沿压暗:四周一圈暗色渐变矩形(程序画),镜头到边时不露硬边
      const g = this.host.addChildPlainNode(root, 'Vignette', 0, 0, TOWN_MAP.width, TOWN_MAP.height).addComponent(Graphics);
      const band = 260;
      const w = TOWN_MAP.width;
      const h = TOWN_MAP.height;
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
    for (const cfg of TOWN_BUILDINGS) {
      let entity = this.buildings.find((item) => item.cfg.key === cfg.key);
      if (!entity || !entity.node.isValid) {
        const node = this.host.addChildPlainNode(root, `TownBuilding_${cfg.key}`, cfg.x, cfg.y, cfg.footprint.w, cfg.footprint.d);
        entity = { cfg, node, plate: null, sprite: null };
        this.buildings = this.buildings.filter((item) => item.cfg.key !== cfg.key).concat(entity);
      }
      if (!entity.sprite || !entity.sprite.isValid) {
        const sprite = this.host.addSprite('Art', townBuildingAsset(cfg.key), 0, 0, cfg.width, cfg.width, entity.node);
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
          entity.plate = this.mountPlate(entity.node, cfg, h + 36, this.buildingBadge(cfg.key, badges));
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
    TOWN_PROPS.forEach((prop, index) => {
      const name = `TownProp_${index}`;
      const parent = prop.flat ? ground : entities;
      if (parent.getChildByName(name)) {
        return;
      }
      const node = this.host.addChildPlainNode(parent, name, prop.x, prop.y, prop.width, prop.width);
      const sprite = this.host.addSprite('Art', townPropAsset(prop.key), 0, 0, prop.width, prop.width, node);
      if (!sprite) {
        node.destroy();
        return;
      }
      const frame = sprite.spriteFrame;
      const ow = frame?.originalSize.width ?? 1;
      const oh = frame?.originalSize.height ?? 1;
      const h = prop.width * (oh / Math.max(1, ow));
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

  private mountPlate(parent: Node, cfg: TownBuildingConfig, y: number, badge: boolean): Node {
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

  private buildingBadge(key: TownBuildingKey, badges: LobbyBadges | null): boolean {
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
    TOWN_LAMPS.forEach((lamp, index) => {
      const name = `TownLamp_${index}`;
      if (root.getChildByName(name)) {
        return;
      }
      const node = this.host.addChildPlainNode(root, name, lamp.x, lamp.y, 40, 40);
      const sprite = this.host.addSprite('Art', TOWN_LAMP_ASSET, 0, 0, 90, 90, node);
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
    const keepX = this.leader?.x ?? TOWN_SPAWN.x;
    const keepY = this.leader?.y ?? TOWN_SPAWN.y;
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
      this.followers.push(this.createActor(root, party[i], i, keepX - keepFacing * i * 70, keepY - 6 * i, keepFacing));
    }
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
    const actor: TownActor = { node, x, y, facing, moving: false, skeleton: null, spineNode: null, names: null, baseScaleX: 1, baseScaleY: 1, anim: null };
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

  private stepFollowers(dt: number): void {
    this.followers.forEach((actor, index) => {
      if (!actor.node.isValid) {
        return;
      }
      const back = (index + 1) * FOLLOW_GAP_SAMPLES;
      const target = this.trail[this.trail.length - 1 - back];
      let moving = false;
      if (target) {
        const dx = target.x - actor.x;
        const dy = target.y - actor.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) {
          const step = Math.min(dist, LEADER_SPEED * 1.15 * dt);
          actor.x += (dx / dist) * step;
          actor.y += (dy / dist) * step;
          actor.node.setPosition(actor.x, actor.y, 0);
          moving = true;
          if (Math.abs(dx) > 2) {
            this.setActorFacing(actor, dx > 0 ? 1 : -1);
          }
        }
      }
      if (actor.moving !== moving) {
        actor.moving = moving;
        this.applyActorAnimation(actor);
      }
    });
  }

  private walkable(x: number, y: number): boolean {
    if (x < TOWN_WALK_BOUNDS.left || x > TOWN_WALK_BOUNDS.right || y < TOWN_WALK_BOUNDS.bottom || y > TOWN_WALK_BOUNDS.top) {
      return false;
    }
    for (const building of TOWN_BUILDINGS) {
      const halfW = building.footprint.w / 2 + ACTOR_RADIUS * 0.6;
      if (x > building.x - halfW && x < building.x + halfW && y > building.y - ACTOR_RADIUS * 0.3 && y < building.y + building.footprint.d) {
        return false;
      }
    }
    for (const prop of TOWN_PROPS) {
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
    const target = this.leader ?? { x: TOWN_SPAWN.x, y: TOWN_SPAWN.y };
    const maxX = Math.max(0, TOWN_MAP.width / 2 - viewW / 2);
    const maxY = Math.max(0, TOWN_MAP.height / 2 - viewH / 2);
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

  private nearestBuilding(): TownBuildingConfig | null {
    const leader = this.leader;
    if (!leader) {
      return null;
    }
    let best: TownBuildingConfig | null = null;
    let bestDist = INTERACT_RADIUS;
    for (const cfg of TOWN_BUILDINGS) {
      const dist = Math.hypot(cfg.x + cfg.door.x - leader.x, cfg.y + cfg.door.y - leader.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = cfg;
      }
    }
    return best;
  }

  private updateNearBuilding(): void {
    const near = this.nearestBuilding();
    const key = near?.key ?? null;
    if (key === this.nearKey && this.enterButton && this.enterButton.isValid) {
      return;
    }
    this.nearKey = key;
    if (this.enterButton && this.enterButton.isValid) {
      this.enterButton.active = !!near;
      const opacity = this.enterButton.getComponent(UIOpacity);
      if (opacity) {
        opacity.opacity = 255;
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
    const near = this.nearestBuilding();
    if (!near) {
      return;
    }
    this.keys.clear();
    this.joy = { active: false, id: -1, dx: 0, dy: 0 };
    if (this.leader) {
      this.leader.moving = false;
      this.applyActorAnimation(this.leader);
    }
    if (this.guide?.flag && this.guide.building === near.key) {
      lobbyGuide.markVisited(this.guide.flag);
    }
    switch (near.action) {
      case 'adventure':
        // docs/47 P0 验收期:冒险之门直接进掠夺原型;验收后改回冒险面板
        if (this.host.startRaidPrototype) {
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
      case 'quest': this.host.openLobbyQuestPanel?.(); return;
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
    this.guide = guide;
    const hud = this.host.createUiNode('LobbyTownHud');
    hud.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    this.renderJoystick(hud, layout, scale);
    this.renderEnterButton(hud, layout, scale);
    this.renderBottomBar(hud, layout, scale);
    this.renderMinimap(hud, layout, scale);
    this.renderGuideTracker(hud, layout, scale, guide);
    this.mountGuidePointer(guide);
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
    const mapScale = (radius * 1.7) / TOWN_MAP.width;
    this.minimapScale = mapScale;
    g.fillColor = rgba(60, 54, 60, 160);
    g.rect(-TOWN_MAP.width / 2 * mapScale, -TOWN_MAP.height / 2 * mapScale, TOWN_MAP.width * mapScale, TOWN_MAP.height * mapScale);
    g.fill();
    g.fillColor = rgba(214, 176, 100, 240);
    for (const building of TOWN_BUILDINGS) {
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
    const cfg = TOWN_BUILDINGS.find((item) => item.key === guide.building);
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
    const cfg = TOWN_BUILDINGS.find((item) => item.key === guide.building);
    if (!cfg) {
      return;
    }
    const dx = cfg.x + cfg.door.x - leader.x;
    const dy = cfg.y + cfg.door.y - leader.y;
    const near = Math.hypot(dx, dy) < INTERACT_RADIUS;
    holder.active = !near;
    if (this.trackerLabel && this.trackerLabel.isValid) {
      this.trackerLabel.string = near ? `到了「${cfg.label}」· 点右下「进入」` : `前往「${cfg.label}」· ${guide.text}`;
    }
    if (near) {
      return;
    }
    // 指针素材默认朝下(-y):朝向 θ 需转 θ+90°
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    holder.angle = angle;
    // 指针挂在队长头顶,随队长翻面时不能跟着镜像:holder 不在 spine 下,无需处理
  }
}
