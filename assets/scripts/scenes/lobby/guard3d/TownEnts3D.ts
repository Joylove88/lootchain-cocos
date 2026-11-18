import { Camera, Color, EffectAsset, game, gfx, Graphics, Material, Mesh, MeshRenderer, Node, RenderTexture, resources, sys, UITransform, utils, Vec3, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';
import { addFieldExtra } from './TownUnits3D';
import type { FieldExtra } from './TownUnits3D';
import { linearBlend } from './TownPost3D';
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
 * 开了后期(高动态,线性空间里混合)时那张贴图要先换算一遍:贴图里存的是「颜色 × 覆盖率」,标准材质读它时会当成
 * 普通颜色去平方(显示颜色 → 线性),半透明的边缘就按覆盖率的平方变暗。不开后期时画面是在显示颜色里混合的,正好抵消;
 * 线性空间里混合 2D 角色就多一圈黑边。做法:再加一台相机,把整张贴图过一遍 resources/effects/g3d-unpremul
 * (颜色除以覆盖率的平方根)画进第二张贴图,平板改读第二张 —— 标准材质一平方,正好是「线性颜色 × 覆盖率」。
 * 平板在画面上和贴图是一个像素对一个像素的,所以第二张用最近点取样(换算过的颜色不能再插值)。
 * (试过另一条路:把引擎的标准着色器拷一份、改成读的时候除回覆盖率。结果一样,但那份着色器编译出来 1.7 MB,会进包,弃了。)
 *
 * 开了后期处理(TownPost3D)时每块平板后面再垫一块「只写深度」的平板(按透明度裁出轮廓、不出颜色):
 * 环境光遮蔽是照着深度图算的,2D 的东西不写深度的话,它身后的遮蔽会透到它身上、它脚下也压不出接地的暗部。
 *
 * 自由视角(TownWorld3D.free)下镜头不再和 2D 画面对着:那台相机改成按地图上的一块正方形范围画(以队长为中心),
 * 平板改成绕竖轴朝着镜头的纸片(老式 2.5D 游戏那种),贴图范围按地图坐标算。2D 骨骼是按俯视 45° 画的,镜头压得很低或
 * 从背后看时会穿帮 —— 这是没有 3D 模型的东西在自由视角下的上限。
 *
 * 已知的小毛病:两个这样的实体在画面上重叠、中间又夹着一个 3D 物体时,前面那块平板里会带着后面那个实体的像素
 * (贴图是整屏一张),夹在中间的 3D 物体会被它错误地盖住一小块。
 * 主城传送阵这类「平铺在地上」的图直接交给地表相机(画进地面),角色永远踩在它上面。
 */

/** 这些 2D 东西单独一层:只有「2D 实体相机」看。 */
export const ENT_LAYER = 1 << 13;
/** 换算贴图用的那块满屏方块单独一层:只有「换算相机」看。 */
const ENT_FIX_LAYER = 1 << 14;
/**
 * 自由视角下那张贴图的排法:切成 5 × 5 格,每个 2D 的东西单独占一格(每格 600 × 600 地图单位),贴图边长 3072 像素。
 * 做法是把它的 2D 画面节点挪到地图外面很远的一块「格子区」里对应的那一格去画(这个节点只有 2D 实体相机看,挪走不影响别的),
 * 相机对着格子区。固定镜头时不用这么做 —— 那时纸片和 2D 画面是对着的,相邻的角色带进来的像素正好重合;
 * 自由视角下纸片各自朝着镜头,带进来的邻居就成了重影。格子用完了(同屏超过 25 个)多出来的不显示。
 */
const CELLS = 5;
const CELL = 600;
const FREE_PX = 3072;
/** 格子区左下角在地图上的位置(地图单位;远在地图外面)。 */
const CELL_BASE = 200000;
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
  /** 自由视角:占的是哪一格(-1 = 没占到);2D 画面节点原来的位置(撤掉时放回去)。 */
  cell: number;
  home: Vec3;
  /** 只写深度的那块(开了后期才有)。 */
  depthCard: Node | null;
  depthMat: Material | null;
  layers: Array<[Node, number]>;
  restore: Array<() => void>;
}

const _p = new Vec3();
const _q = new Vec3();
const _to = new Vec4();

/** 换算贴图用的着色器(读一次,全场共用);null = 还没读到 / 读失败(读失败就不换算:开后期时 2D 角色边缘会有一圈黑边,别的不受影响)。 */
let fixEffect: EffectAsset | null = null;
let fixEffectState = 0;      // 0 没读 / 1 在读 / 2 读完(成功或失败)
function loadFixEffect(): boolean {
  if (fixEffectState === 0) {
    fixEffectState = 1;
    resources.load('effects/g3d-unpremul', EffectAsset, (error, asset) => {
      if (error || !asset) {
        console.warn('[f3d] load g3d-unpremul', error?.message);
      } else {
        asset.addRef();
        fixEffect = asset;
      }
      fixEffectState = 2;
    });
  }
  return fixEffectState === 2;
}

class TownEnts3D implements FieldExtra {
  private self: any = null;
  private root: Node | null = null;
  private cam: Camera | null = null;
  private rt: RenderTexture | null = null;
  /** 线性空间里用的:换算过的那一张(只在开了后期的高动态渲染下有)。 */
  private rt2: RenderTexture | null = null;
  private fixCam: Camera | null = null;
  private fixMat: Material | null = null;
  private fixMesh: Mesh | null = null;
  private linear = false;
  private mesh: Mesh | null = null;
  private base: Material | null = null;
  private depthBase: Material | null = null;
  private items = new Map<Node, Item>();
  private cells: Array<Item | null> = [];
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
    if (!loadFixEffect()) {
      return;      // 着色器还在读:这几帧 2D 的东西照旧由界面相机画
    }
    // 画面是不是在线性空间里混合(开了后期的高动态):变了的话平板的贴图 / 相机要换一套,整个重来
    const linear = world.post.linear() && !!fixEffect;
    if (this.linear !== linear) {
      if (this.root) {
        this.stop();
      }
      this.linear = linear;
    }
    if (this.self !== self) {
      this.stop();
      this.self = self;
    }
    this.ensure(world);
    this.tick += 1;
    const lx = self.leader?.x ?? 0;
    const ly = self.leader?.y ?? 0;
    const seen = new Set<Node>();
    // 2D 骨骼单位:骨骼节点还开着的(= 没有被 3D 模型顶替)
    const units: any[] = [self.leader].concat(Array.from(self.followers ?? []), Array.from(self.monsters ?? []));
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
          if (world.free) {
            // 自由视角:传送阵那圈贴地的光环 / 光晕也画进地面(留在界面那一层的话是一个不跟镜头转、竖在半空的圈)
            const fx = node.getChildByName('TownWaypointFx');
            for (const name2 of ['Flat', 'Glow']) {
              const ring = fx?.getChildByName(name2) ?? null;
              if (ring && !this.flat.has(ring)) {
                this.flat.set(ring, world.toGround(ring));
                this.stats.flat += 1;
              }
            }
          }
          continue;
        }
        if (!/^Town(Chest|Poi|Npc)_/.test(name)) {
          continue;
        }
        // 自由视角:贴图里一个东西占一格、一共 25 格,全地图的宝箱 / 采集点都收进来格子就不够了 —— 只收队长附近的
        if (world.free && world.metres(node.position.x, node.position.y, lx, ly) > world.range.unit) {
          continue;
        }
        const art = node.getChildByName('Art') ?? node.getChildByName('Still');
        if (art && art.isValid && !this.items.has(art)) {
          this.add(world, art, node, false);
        }
      }
    }
    for (const [art, item] of Array.from(this.items)) {
      let alive = art.isValid && item.card.isValid && (item.unit ? seen.has(art) : !!art.parent && art.parent.isValid);
      if (alive && !item.unit && world.free && world.metres(item.owner.position.x, item.owner.position.y, lx, ly) > world.range.unit + 3) {
        alive = false;       // 走远了:格子让出来(2D 的图放回去,由 TownOverlay3D 按「太远不画」藏掉)
      }
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
      if (this.linear && fixEffect) {
        // 换算相机:排在 2D 实体相机之后、3D 相机之前;只看一块铺满的方块(方块的着色器直接给屏幕坐标,相机怎么摆无所谓,
        // 只要方块在它的视野里不被裁掉)
        const fixNode = new Node('TownEnts3DFixCam');
        this.root.addChild(fixNode);
        const fc = fixNode.addComponent(Camera);
        fc.projection = Camera.ProjectionType.ORTHO;
        fc.orthoHeight = 1;
        fc.near = 0.1;
        fc.far = 10;
        fc.visibility = ENT_FIX_LAYER;
        fc.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        fc.clearColor = new Color(0, 0, 0, 0);
        fc.priority = -18;
        this.fixCam = fc;
        if (!this.fixMesh) {
          this.fixMesh = utils.MeshUtils.createMesh({
            positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 2, 1, 3],
          }, undefined, { calculateBounds: true });
        }
        const quad = new Node('TownEnts3DFix');
        quad.layer = ENT_FIX_LAYER;
        fixNode.addChild(quad);
        quad.setPosition(0, 0, -2);
        const qr = quad.addComponent(MeshRenderer);
        qr.mesh = this.fixMesh;
        const fm = new Material();
        fm.initialize({ effectAsset: fixEffect });
        this.fixMat = fm;
        qr.setSharedMaterial(fm, 0);
        qr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
        qr.receiveShadow = MeshRenderer.ShadowReceivingMode.OFF;
      }
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
    // 后期的放大档位下 3D 画面比窗口大,这张贴图跟着放大(同地表贴图),免得 2D 角色被放大再缩小糊一遍
    const scale = world.post.scale();
    const rw = world.free ? FREE_PX : Math.max(4, Math.round(canvas.width * scale));
    const rh = world.free ? FREE_PX : Math.max(4, Math.round(canvas.height * scale));
    if (!this.rt || this.rt.width !== rw || this.rt.height !== rh) {
      const old = this.rt;
      const old2 = this.rt2;
      const rt = new RenderTexture();
      rt.reset({ width: rw, height: rh });
      rt.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
      rt.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
      this.rt = rt;
      this.cam!.targetTexture = rt;
      let rt2: RenderTexture | null = null;
      if (this.fixCam) {
        rt2 = new RenderTexture();
        rt2.reset({ width: rw, height: rh });
        rt2.setFilters(RenderTexture.Filter.NEAREST, RenderTexture.Filter.NEAREST);
        rt2.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
        this.fixCam.targetTexture = rt2;
        this.fixMat?.setProperty('mainTexture', rt);
      }
      this.rt2 = rt2;
      const shown = rt2 ?? rt;
      for (const item of this.items.values()) {
        item.mat.setProperty('mainTexture', shown);
        item.depthMat?.setProperty('mainTexture', rt);
      }
      this.base?.setProperty('mainTexture', shown);
      this.depthBase?.setProperty('mainTexture', rt);
      old?.destroy();
      old2?.destroy();
    }
    if (!this.base) {
      // 贴图里是「颜色 × 覆盖率」(画在透明底上的结果),所以用预乘的混合;按透明度裁掉空白处(投影也按这个轮廓)。
      // 线性空间下读的是换算过的那一张(见文件头)
      const m = new Material();
      const BF = gfx.BlendFactor;
      m.initialize({ effectName: 'builtin-standard', technique: 1, defines: { USE_ALBEDO_MAP: true, USE_ALPHA_TEST: true },
        states: { rasterizerState: { cullMode: gfx.CullMode.NONE },
          blendState: { targets: [{ blend: true, blendSrc: BF.ONE, blendDst: BF.ONE_MINUS_SRC_ALPHA, blendSrcAlpha: BF.ONE, blendDstAlpha: BF.ONE_MINUS_SRC_ALPHA }] } } });
      m.setProperty('mainTexture', this.rt2 ?? this.rt);
      m.setProperty('roughness', 1);
      m.setProperty('metallic', 0);
      m.setProperty('specularIntensity', 0);
      m.setProperty('alphaThreshold', 0.02);
      this.base = m;
    }
    if (!this.depthBase) {
      // 只写深度:不受光的最简单的着色器,颜色通道全关,透明度过半的地方才算「有东西」。
      // 要排在半透明那一批里画(开着混合就会被排过去):放在不透明那一批的话,它会抢在身后的地面前面写深度,地面那几个像素就画不上了(露黑)
      const m = new Material();
      m.initialize({ effectName: 'builtin-unlit', technique: 1, defines: { USE_TEXTURE: true, USE_ALPHA_TEST: true },
        states: { rasterizerState: { cullMode: gfx.CullMode.NONE }, depthStencilState: { depthTest: true, depthWrite: true },
          blendState: { targets: [{ blend: true, blendColorMask: gfx.ColorMask.NONE }] } } });
      m.setProperty('mainTexture', this.rt);
      m.setProperty('alphaThreshold', 0.5);
      this.depthBase = m;
    }
    // 取景:固定镜头时跟界面相机一致(和地表相机同一套);自由视角时对着地图上以队长为中心的一块正方形
    const ui = world.uiCamera();
    if (ui && this.cam) {
      const n = this.cam.node;
      n.setWorldRotation(ui.node.worldRotation);
      this.cam.near = ui.near;
      this.cam.far = ui.far;
      const world2d: Node | null = this.self?.world ?? null;
      const tf = world2d?.getComponent(UITransform) ?? null;
      if (world.free && world2d && tf) {
        const span = CELLS * CELL;
        _p.set(CELL_BASE + span / 2, CELL_BASE + span / 2, 0);
        tf.convertToWorldSpaceAR(_p, _q);
        n.setWorldPosition(_q.x, _q.y, ui.node.worldPosition.z);
        this.cam.orthoHeight = (span * world2d.worldScale.y) / 2;
      } else {
        n.setWorldPosition(ui.node.worldPosition);
        this.cam.orthoHeight = ui.orthoHeight;
      }
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
    linearBlend(mat);
    mat.setProperty('mainTexture', this.rt2 ?? this.rt);
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
    mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
    let depthCard: Node | null = null;
    let depthMat: Material | null = null;
    if (world.post.isOn()) {
      depthCard = new Node('EntDepth');
      depthCard.layer = FIELD_LAYER;
      this.root!.addChild(depthCard);
      const dr = depthCard.addComponent(MeshRenderer);
      dr.mesh = this.mesh;
      depthMat = new Material();
      depthMat.copy(this.depthBase!);
      depthMat.setProperty('mainTexture', this.rt);
      dr.setSharedMaterial(depthMat, 0);
      dr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
      dr.receiveShadow = MeshRenderer.ShadowReceivingMode.OFF;
    }
    const restore: Array<() => void> = [];
    const holder: Node | null = unit ? owner.node : owner;
    const contact = holder?.getChildByName('Contact') ?? null;
    if (contact && contact.active) {
      contact.active = false;         // 2D 的假影子:换成真投影了
      restore.push(() => contact.isValid && (contact.active = true));
    }
    // 单位节点自己身上的程序椭圆影(在界面那一层,会盖在立进 3D 的角色上面):同样关掉
    const oval = unit && holder ? (holder.getComponent(Graphics) as Graphics | null) : null;
    if (oval && oval.enabled) {
      oval.enabled = false;
      restore.push(() => oval.isValid && (oval.enabled = true));
    }
    const item: Item = { art, owner, unit, card, mat, cell: -1, home: art.position.clone(), depthCard, depthMat, layers, restore };
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
      // 图在地图上的位置按它原来的位置算(自由视角下这个节点被挪到格子区里去了)
      const cx = node.position.x + item.home.x;
      const cy = node.position.y + item.home.y;
      x0 = cx - w / 2;
      x1 = cx + w / 2;
      y0 = cy - hh / 2;
      h = hh;
    }
    const U = world.cfg.unitsPerM;
    let visible = item.unit ? !!item.owner.node?.activeInHierarchy : item.art.activeInHierarchy;
    const w = x1 - x0;
    if (world.free) {
      // 自由视角:纸片立在它脚下那一点上、绕竖轴朝着镜头;2D 画面节点挪到格子区里它那一格去画,取样范围就是那一格里它占的一块
      if (item.cell < 0 && visible) {
        const free = this.cells.findIndex((c, i) => i < CELLS * CELLS && !c);
        const at = free >= 0 ? free : this.cells.length < CELLS * CELLS ? this.cells.length : -1;
        if (at >= 0) {
          this.cells[at] = item;
          item.cell = at;
        }
      }
      if (item.cell < 0 || w > CELL || h > CELL) {
        visible = false;        // 格子用完了,或者这张图比一格还大:不显示
      } else {
        const col = item.cell % CELLS;
        const row = Math.floor(item.cell / CELLS);
        const span = CELLS * CELL;
        // 这一格里它的那一块:横向居中;纵向从格子底边起
        const cx0 = CELL_BASE + col * CELL + (CELL - w) / 2;
        const cy0 = CELL_BASE + row * CELL;
        // 2D 画面节点:原来画在地图上 (x0..x1, y0..y0+h) 这一块,平移到格子里
        const parent = item.art.parent;
        if (parent && parent.isValid) {
          item.art.setPosition(item.home.x + (cx0 - x0), item.home.y + (cy0 - y0), item.home.z);
        }
        _to.set(w / span, h / span, (cx0 - CELL_BASE) / span, (cy0 - CELL_BASE) / span);
        // 脚线(单位:脚下那一点;图片:图的底边往上一点)落在地面上,脚线以下那一截埋在地面下面
        const footY = item.unit ? y0 + BELOW : y0 + Math.min(h * 0.12, 24);
        world.toWorld((x0 + x1) / 2, footY, _p, -(footY - y0) / world.upUnits());
        item.card.setPosition(_p);
        item.card.setRotationFromEuler(0, world.camYaw(), 0);
      }
    } else {
      world.toWorld((x0 + x1) / 2, y0, _p);
      item.card.setPosition(_p);
      // 画面在地图上的范围(地图单位):中心 = world.mapX / mapY,半宽半高 = 半个画面的米数 × U
      const hw = world.halfW * U;
      const hh2 = world.halfH * U;
      _to.set((x1 - x0) / (2 * hw), h / (2 * hh2), (x0 - (world.mapX - hw)) / (2 * hw), (y0 - (world.mapY - hh2)) / (2 * hh2));
    }
    item.card.setScale((x1 - x0) / U, h / world.upUnits(), 1);
    if (item.card.active !== visible) {
      item.card.active = visible;
    }
    item.mat.setProperty('tilingOffset', _to);
    if (item.depthCard && item.depthMat) {
      // 比出颜色的那块靠后 3 厘米(颜色那块的深度测试要「比已有的近」才过得去);顺着镜头的视线退,画面上的位置不变
      if (world.free) {
        Vec3.subtract(_q, _p, world.cam.node.position).normalize();
        item.depthCard.setPosition(_p.x + _q.x * 0.03, _p.y + _q.y * 0.03, _p.z + _q.z * 0.03);
        item.depthCard.setRotation(item.card.rotation);
      } else {
        const pr = (world.cfg.pitch * Math.PI) / 180;
        item.depthCard.setPosition(_p.x, _p.y - Math.sin(pr) * 0.03, _p.z - Math.cos(pr) * 0.03);
      }
      item.depthCard.setScale(item.card.scale);
      if (item.depthCard.active !== visible) {
        item.depthCard.active = visible;
      }
      item.depthMat.setProperty('tilingOffset', _to);
    }
  }

  private remove(item: Item): void {
    if (item.cell >= 0) {
      this.cells[item.cell] = null;
      item.cell = -1;
    }
    if (item.art.isValid) {
      item.art.setPosition(item.home);
    }
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
    if (item.depthCard && item.depthCard.isValid) {
      item.depthCard.destroy();
    }
    item.depthMat?.destroy();
  }

  stop(): void {
    for (const item of this.items.values()) {
      this.remove(item);
    }
    this.items.clear();
    this.cells = [];
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
    this.rt2?.destroy();
    this.rt2 = null;
    this.fixCam = null;
    this.fixMat?.destroy();
    this.fixMat = null;
    this.base = null;
    this.depthBase = null;
    this.stats.flat = 0;
  }

  set(patch: Partial<TownEnts3D['cfg']>): void {
    Object.assign(this.cfg, patch);
  }

  info(): unknown {
    return { ents: { ...this.stats, rt: this.rt ? [this.rt.width, this.rt.height] : null, linear: this.linear, fix: !!this.rt2, cfg: { ...this.cfg } } };
  }
}

const ents = new TownEnts3D();
if (!EDITOR && sys.isBrowser) {
  addFieldExtra(ents);
  (globalThis as any).__f3dents = ents;
}
