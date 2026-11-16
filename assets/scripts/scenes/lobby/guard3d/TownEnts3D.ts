import { Camera, Color, game, gfx, Material, Mesh, MeshRenderer, Node, RenderTexture, sys, UITransform, utils, Vec3, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';
import { addFieldExtra } from './TownUnits3D';
import type { FieldExtra } from './TownUnits3D';
import { FIELD_LAYER, TownWorld3D } from './TownWorld3D';

/**
 * 野外真 3D 场景里「还是 2D 的东西」怎么进 3D(实验,2026-11-16;跟着 ?field3d=2 一起开)。
 *
 * 没有 3D 模型的队友 / 怪 / NPC(2D 骨骼)、宝箱、采集点这些,如果照旧由界面相机画,就永远压在整个 3D 画面上面 ——
 * 站在树后面也盖着树,没有影子,也不会被树荫罩到。这里把它们请进 3D 世界:
 * 1. 多一台「2D 实体相机」:和界面相机同一个取景,只看这些东西,画进一张和屏幕一样大的透明底贴图;
 * 2. 每个实体在 3D 世界里立一块正对镜头的平板(立在它的脚线上),平板上贴的是那张贴图里它所在的那一块
 *    (镜头正交 + 固定俯角,平板上任何一点在画面上的位置是固定算得出来的,每帧把取样范围对上就行)。
 * 于是 2D 的骨骼动画、换帧、淡出全都照常(还是 2D 那边在画),但它在 3D 里有了深度:该被树挡的被挡、
 * 会往地上投影、会被树荫和技能的光照到。没被挡住时颜色和 2D 里一样(平板法线朝上,受光和地面相同)。
 *
 * 已知的小毛病:两个这样的实体在画面上重叠、中间又夹着一个 3D 物体时,前面那块平板里会带着后面那个实体的像素
 * (贴图是整屏一张),夹在中间的 3D 物体会被它错误地盖住一小块。
 * 主城传送阵这类「平铺在地上」的图直接交给地表相机(画进地面),角色永远踩在它上面。
 */

/** 这些 2D 东西单独一层:只有「2D 实体相机」看。 */
export const ENT_LAYER = 1 << 13;
/** 2D 骨骼单位(英雄 / 怪)取多大一块(地图单位):左右各 HALF_W,脚线往下 BELOW、往上 ABOVE。 */
const HALF_W = 300;
const BELOW = 90;
const ABOVE = 500;

interface Item {
  art: Node;
  /** 骨骼单位:野外渲染器里的那个对象(读 x / y);图片实体:它的节点。 */
  owner: any;
  unit: boolean;
  card: Node;
  mat: Material;
  layers: Array<[Node, number]>;
  restore: Array<() => void>;
}

const _p = new Vec3();
const _to = new Vec4();

class TownEnts3D implements FieldExtra {
  private self: any = null;
  private root: Node | null = null;
  private cam: Camera | null = null;
  private rt: RenderTexture | null = null;
  private mesh: Mesh | null = null;
  private base: Material | null = null;
  private items = new Map<Node, Item>();
  private flat = new Map<Node, () => void>();
  private tick = 0;
  private stats = { cards: 0, flat: 0 };
  cfg = { on: true };

  sync(self: any, world: TownWorld3D): void {
    if (!this.cfg.on) {
      if (this.items.size || this.cam) {
        this.stop();
      }
      return;
    }
    const entities: Node | null = self.entityRoot ?? null;
    if (!entities || !entities.isValid) {
      return;
    }
    if (this.self !== self) {
      this.stop();
      this.self = self;
    }
    this.ensure(world);
    this.tick += 1;
    const seen = new Set<Node>();
    // 2D 骨骼单位:骨骼节点还开着的(= 没有被 3D 模型顶替)
    const units: any[] = [self.leader, ...(self.followers ?? []), ...(self.monsters ?? [])];
    for (const u of units) {
      const art: Node | null = u?.spineNode ?? null;
      if (!u || !art || !art.isValid || !art.active || !u.skeleton || !u.node?.activeInHierarchy) {
        continue;
      }
      seen.add(art);
      if (!this.items.has(art)) {
        this.add(world, art, u, true);
      }
    }
    // 图片实体(宝箱 / 采集点 / NPC 立绘):隔一会儿扫一遍节点
    if (this.tick % 20 === 1) {
      for (const node of entities.children) {
        const name = node.name;
        if (name === 'TownWaypoint') {
          const art = node.getChildByName('Art');
          if (art && !this.flat.has(art)) {
            this.flat.set(art, world.toGround(art));       // 平铺在地上的:画进地面
            this.stats.flat += 1;
          }
          continue;
        }
        if (!/^Town(Chest|Poi|Npc)_/.test(name)) {
          continue;
        }
        const art = node.getChildByName('Art') ?? node.getChildByName('Still');
        if (art && art.isValid && !this.items.has(art)) {
          this.add(world, art, node, false);
        }
      }
    }
    for (const [art, item] of Array.from(this.items)) {
      const alive = art.isValid && item.card.isValid && (item.unit ? seen.has(art) : !!art.parent && art.parent.isValid);
      if (!alive) {
        this.remove(item);
        this.items.delete(art);
        continue;
      }
      this.place(world, item);
    }
    this.stats.cards = this.items.size;
  }

  /** 相机、贴图、公用的单位平板。 */
  private ensure(world: TownWorld3D): void {
    if (!this.root || !this.root.isValid) {
      this.root = new Node('TownEnts3D');
      this.root.layer = FIELD_LAYER;
      world.root.addChild(this.root);
      const camNode = new Node('TownEnts3DCam');
      this.root.addChild(camNode);
      const cam = camNode.addComponent(Camera);
      cam.projection = Camera.ProjectionType.ORTHO;
      cam.visibility = ENT_LAYER;
      cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
      cam.clearColor = new Color(0, 0, 0, 0);
      cam.priority = -19;
      this.cam = cam;
    }
    if (!this.mesh) {
      this.mesh = utils.MeshUtils.createMesh({
        positions: [-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        uvs: [0, 0, 1, 0, 0, 1, 1, 1],
        indices: [0, 1, 2, 2, 1, 3],
      }, undefined, { calculateBounds: true });
    }
    const canvas = game.canvas!;
    if (!this.rt || this.rt.width !== canvas.width || this.rt.height !== canvas.height) {
      const old = this.rt;
      const rt = new RenderTexture();
      rt.reset({ width: Math.max(4, canvas.width), height: Math.max(4, canvas.height) });
      rt.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
      rt.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
      this.rt = rt;
      this.cam!.targetTexture = rt;
      for (const item of this.items.values()) {
        item.mat.setProperty('mainTexture', rt);
      }
      this.base?.setProperty('mainTexture', rt);
      old?.destroy();
    }
    if (!this.base) {
      // 贴图里是「颜色 × 覆盖率」(画在透明底上的结果),所以用预乘的混合;按透明度裁掉空白处(投影也按这个轮廓)
      const m = new Material();
      m.initialize({ effectName: 'builtin-standard', technique: 1, defines: { USE_ALBEDO_MAP: true, USE_ALPHA_TEST: true },
        states: { rasterizerState: { cullMode: gfx.CullMode.NONE },
          blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.ONE, blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA, blendSrcAlpha: gfx.BlendFactor.ONE, blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA }] } } });
      m.setProperty('mainTexture', this.rt);
      m.setProperty('roughness', 1);
      m.setProperty('metallic', 0);
      m.setProperty('specularIntensity', 0);
      m.setProperty('alphaThreshold', 0.02);
      this.base = m;
    }
    // 取景跟界面相机一致(和地表相机同一套)
    const ui = world.uiCamera();
    if (ui && this.cam) {
      const n = this.cam.node;
      n.setWorldPosition(ui.node.worldPosition);
      n.setWorldRotation(ui.node.worldRotation);
      this.cam.orthoHeight = ui.orthoHeight;
      this.cam.near = ui.near;
      this.cam.far = ui.far;
    }
  }

  private add(world: TownWorld3D, art: Node, owner: any, unit: boolean): void {
    const layers: Array<[Node, number]> = [];
    art.walk((n) => {
      layers.push([n, n.layer]);
      n.layer = ENT_LAYER;
    });
    const card = new Node('Ent');
    card.layer = FIELD_LAYER;
    this.root!.addChild(card);
    const mr = card.addComponent(MeshRenderer);
    mr.mesh = this.mesh;
    const mat = new Material();
    mat.copy(this.base!);
    mat.setProperty('mainTexture', this.rt);
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
    mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
    const restore: Array<() => void> = [];
    const holder: Node | null = unit ? owner.node : owner;
    const contact = holder?.getChildByName('Contact') ?? null;
    if (contact && contact.active) {
      contact.active = false;         // 2D 的假影子:换成真投影了
      restore.push(() => contact.isValid && (contact.active = true));
    }
    const item: Item = { art, owner, unit, card, mat, layers, restore };
    this.items.set(art, item);
    this.place(world, item);
  }

  /** 平板摆到脚线上,取样范围对到贴图里它自己那一块。 */
  private place(world: TownWorld3D, item: Item): void {
    let x0: number;
    let x1: number;
    let y0: number;
    let h: number;
    if (item.unit) {
      const o = item.owner;
      x0 = o.x - HALF_W;
      x1 = o.x + HALF_W;
      y0 = o.y - BELOW;
      h = BELOW + ABOVE;
    } else {
      const node: Node = item.owner;
      const art = item.art;
      const size = art.getComponent(UITransform)?.contentSize;
      if (!size) {
        return;
      }
      const w = size.width * Math.abs(art.scale.x) + 24;
      const hh = size.height * Math.abs(art.scale.y) + 24;
      const cx = node.position.x + art.position.x;
      const cy = node.position.y + art.position.y;
      x0 = cx - w / 2;
      x1 = cx + w / 2;
      y0 = cy - hh / 2;
      h = hh;
    }
    const U = world.cfg.unitsPerM;
    world.toWorld((x0 + x1) / 2, y0, _p);
    item.card.setPosition(_p);
    item.card.setScale((x1 - x0) / U, h / world.upUnits(), 1);
    const visible = item.unit ? !!item.owner.node?.activeInHierarchy : item.art.activeInHierarchy;
    if (item.card.active !== visible) {
      item.card.active = visible;
    }
    // 画面在地图上的范围(地图单位):中心 = world.mapX / mapY,半宽半高 = 半个画面的米数 × U
    const hw = world.halfW * U;
    const hh2 = world.halfH * U;
    _to.set((x1 - x0) / (2 * hw), h / (2 * hh2), (x0 - (world.mapX - hw)) / (2 * hw), (y0 - (world.mapY - hh2)) / (2 * hh2));
    item.mat.setProperty('tilingOffset', _to);
  }

  private remove(item: Item): void {
    for (const [n, layer] of item.layers) {
      if (n.isValid) {
        n.layer = layer;
      }
    }
    for (const fn of item.restore) {
      try {
        fn();
      } catch (error) {
        void error;
      }
    }
    if (item.card.isValid) {
      item.card.destroy();
    }
    item.mat.destroy();
  }

  stop(): void {
    for (const item of this.items.values()) {
      this.remove(item);
    }
    this.items.clear();
    for (const fn of this.flat.values()) {
      fn();
    }
    this.flat.clear();
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.cam = null;
    this.self = null;
    this.rt?.destroy();
    this.rt = null;
    this.base = null;
    this.stats.flat = 0;
  }

  set(patch: Partial<TownEnts3D['cfg']>): void {
    Object.assign(this.cfg, patch);
  }

  info(): unknown {
    return { ents: { ...this.stats, rt: this.rt ? [this.rt.width, this.rt.height] : null, cfg: { ...this.cfg } } };
  }
}

const ents = new TownEnts3D();
if (!EDITOR && sys.isBrowser) {
  addFieldExtra(ents);
  (globalThis as any).__f3dents = ents;
}
