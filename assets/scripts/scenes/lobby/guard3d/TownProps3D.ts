import { Color, director, gfx, Material, Mesh, MeshRenderer, Node, Sprite, SpriteFrame, sys, UITransform, utils, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { addFieldExtra } from './TownUnits3D';
import type { FieldExtra } from './TownUnits3D';
import { FIELD_LAYER, TownWorld3D } from './TownWorld3D';

/**
 * 野外真 3D 场景里的摆件(实验,2026-11-16;跟着 ?field3d=2 一起开)。
 *
 * 地图上立着的摆件(树、岩石、草、营帐、栅栏、旗…,LobbyTownRenderer 的 TownProp_N)在 2D 里是按脚线排序的贴图。
 * 进了 3D 场景要有真的前后遮挡和投影,这里给每个摆件在 3D 世界里立一个替身,2D 的贴图藏起来:
 * - 「立牌」(默认,什么摆件都能用):一块立在脚线上、正对镜头的平板,贴的就是原来那张图。镜头是正交 + 固定俯角,
 *   立牌按 1 / cos 俯角拉高之后投到画面上和 2D 里一模一样(位置、大小、图案都不变),但它在 3D 世界里有深度:
 *   会挡住站在它后面的角色、被站在它前面的角色挡住,会照着图案的轮廓往地上投影,也会被别的东西的影子盖到。
 *   法线一律朝上 —— 受到的光和地面一样,所以没被挡住时颜色就是原图的颜色。
 * - 「模型」(登记了生成器的摆件类型):代码生成的 3D 网格(见 G3DFlora.ts),替掉立牌。
 * 立牌的边缘用「透明度转覆盖率」抗锯齿(画布开了多重采样时):不用排序,边是软的;没开多重采样时退回硬边裁切。
 * 队长走到高的摆件身后时,那个摆件淡到半透明(对应 2D 里的树冠透视孔 / 整块淡出)。
 *
 * 只看得见的才建(跟着 2D 那边的视野裁剪走),走出视野只是隐藏,不销毁。
 */

/** 高过这个数(地图单位)的摆件才会挡住人 / 才值得淡出(同 LobbyTownRenderer 的 OCCLUDER_MIN_H)。 */
const TALL = 260;
const FADE_TO = 0.4;

/** 代码生成的摆件:build 返回挂好网格的节点(原点 = 脚底中心,+y 朝上,单位米)。 */
export interface PropBuilder {
  /** 这个生成器管不管这个摆件(按贴图路径认)。 */
  match(asset: string): boolean;
  /** w / h = 这个摆件在 3D 世界里该有多宽多高(米,按 2D 贴图的大小换算);seed = 每个摆件固定的随机种子。 */
  build(parent: Node, asset: string, w: number, h: number, seed: number, flip: boolean): Built | null;
}
/** sway = 会随风摆的节点(绕自己的原点摇),swayAmp = 摆多大(度)。 */
export interface Built { node: Node; renderers: MeshRenderer[]; sway?: Node[]; swayAmp?: number }
const builders: PropBuilder[] = [];
export function addPropBuilder(b: PropBuilder): void {
  builders.push(b);
}

interface Item {
  index: number;
  node2d: Node;
  art: Node;
  node: Node;
  renderers: MeshRenderer[];
  shared: Material[];
  /** 会随风摆的部分:每帧小幅摇。立牌只在自己的平面里左右摇(flat),模型前后左右都摇。 */
  sway: Node[];
  swayAmp: number;
  flat: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  tall: boolean;
  fade: number;
  seed: number;
  kind: 'card' | 'mesh';
}

const _v = new Vec3();

class TownProps3D implements FieldExtra {
  private self: any = null;
  private entities: Node | null = null;
  private root: Node | null = null;
  private items = new Map<number, Item>();
  private failed = new Set<number>();
  private indexOf = new WeakMap<Node, number>();
  private meshes = new Map<SpriteFrame, Mesh>();
  private mats = new Map<string, Material>();
  private key = '';
  private tick = 0;
  private time = 0;
  private msaa: boolean | null = null;
  /**
   * 现场开关:mesh = 登记了生成器的摆件换成代码生成的模型(G3DFlora);默认关 —— 2026-11-16 实测,镜头固定俯视时
   * 手绘图立进 3D 世界的效果明显好于第一版程序模型(树偏平、岩石偏素),程序模型留着当对照,__f3dprops.set({ mesh: true }) 切。
   */
  cfg = { mesh: false, sway: true };
  private stats = { cards: 0, meshes: 0, shown: 0, faded: 0 };

  sync(self: any, world: TownWorld3D, dt: number): void {
    const entities: Node | null = self.entityRoot ?? null;
    if (!entities || !entities.isValid) {
      return;
    }
    if (this.self !== self || this.entities !== entities) {
      this.stop();
      this.self = self;
      this.entities = entities;
    }
    if (!this.root || !this.root.isValid) {
      this.root = new Node('TownProps3D');
      this.root.layer = FIELD_LAYER;
      world.root.addChild(this.root);
    }
    this.time += dt;
    this.tick += 1;
    const list: Array<{ node: Node; y: number }> = self.propNodes ?? [];
    const key = `${self.cullKey}:${list.length}`;
    if (key !== this.key || this.tick % 20 === 0) {
      this.key = key;
      this.scan(self, world, list);
    }
    this.animate(self, dt);
  }

  /** 照着 2D 那边的视野裁剪结果:在视野里的摆件建 / 显示替身,出了视野的隐藏。 */
  private scan(self: any, world: TownWorld3D, list: Array<{ node: Node; y: number }>): void {
    let built = 0;
    let shown = 0;
    for (const entry of list) {
      const node = entry.node;
      if (!node || !node.isValid) {
        continue;
      }
      let index = this.indexOf.get(node);
      if (index === undefined) {
        index = Number(node.name.slice(node.name.lastIndexOf('_') + 1));
        this.indexOf.set(node, index);
      }
      const on = node.active;
      let item = this.items.get(index);
      if (!item && on && built < 60 && !this.failed.has(index)) {
        item = this.build(self, world, node, index) ?? undefined;
        if (item) {
          this.items.set(index, item);
          built += 1;
        }
      }
      if (item) {
        if (item.node.active !== on) {
          item.node.active = on;
        }
        if (on) {
          shown += 1;
        }
      }
    }
    this.stats.shown = shown;
  }

  private build(self: any, world: TownWorld3D, node2d: Node, index: number): Item | null {
    const prop = self.def?.props?.[index];
    const art = node2d.getChildByName('Art');
    const sprite = art?.getComponent(Sprite) ?? null;
    const frame = sprite?.spriteFrame ?? null;
    const size = art?.getComponent(UITransform)?.contentSize ?? null;
    if (!prop || !art || !sprite || !frame || !frame.texture || !size) {
      return null;       // 贴图还没到:下一轮再试
    }
    const U = world.cfg.unitsPerM;
    const wM = size.width / U;
    const hM = size.height / world.upUnits();
    const flip = art.scale.x < 0;
    const seed = ((index * 2654435761) >>> 0) / 4294967296;
    world.toWorld(prop.x, prop.y, _v);
    let made: Built | null = null;
    let kind: Item['kind'] = 'card';
    if (this.cfg.mesh) {
      const b = builders.find((x) => x.match(prop.asset));
      if (b) {
        try {
          made = b.build(this.root!, prop.asset, wM, hM, seed, flip);
          kind = 'mesh';
        } catch (error) {
          console.warn('[f3d] prop builder', prop.asset, error);
          made = null;
        }
      }
    }
    if (!made) {
      kind = 'card';
      made = this.card(frame, wM, hM, flip, prop.tint, size.height >= 110 || size.width >= 160);
      // 2D 里随风摆的那些(树 / 灌木 / 草):立牌绕脚底在自己的平面里小幅摇,高的摇得小
      if (prop.sway ?? /tree|bush|grass|fern/.test(prop.asset)) {
        made.sway = [made.node];
        made.swayAmp = size.height >= TALL ? 0.45 : 2.2;
      }
    }
    if (!made) {
      this.failed.add(index);
      return null;
    }
    made.node.setPosition(_v);
    made.node.walk((n) => {
      n.layer = FIELD_LAYER;
    });
    art.active = false;
    if (kind === 'card') {
      this.stats.cards += 1;
    } else {
      this.stats.meshes += 1;
    }
    return { index, node2d, art, node: made.node, renderers: made.renderers, shared: made.renderers.map((r) => r.sharedMaterials[0]!), sway: made.sway ?? [], swayAmp: made.swayAmp ?? 1, flat: kind === 'card',
      x: prop.x, y: prop.y, w: size.width, h: size.height, tall: size.height >= TALL, fade: 1, seed, kind };
  }

  // ───────────────────────── 立牌 ─────────────────────────
  private hasMsaa(): boolean {
    if (this.msaa === null) {
      try {
        const gl = (director.root!.device as any).gl as WebGLRenderingContext;
        this.msaa = !!gl && gl.getParameter(gl.SAMPLES) > 1;
      } catch (error) {
        this.msaa = false;
      }
    }
    return this.msaa;
  }

  /** 贴一张 2D 图的 3D 材质:粗糙不反光、按透明度裁切、两面都画。 */
  private cardMaterial(frame: SpriteFrame, tint?: [number, number, number]): Material {
    const tex = frame.texture;
    const key = `${(tex as any)._id || (tex as any).uuid || tex.getHash()}:${tint ? tint.join(',') : ''}`;
    let m = this.mats.get(key);
    if (!m) {
      const a2c = this.hasMsaa();
      m = new Material();
      m.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true, USE_ALPHA_TEST: true },
        states: { rasterizerState: { cullMode: gfx.CullMode.NONE }, blendState: { isA2C: a2c } } });
      m.setProperty('mainTexture', tex);
      m.setProperty('roughness', 1);
      m.setProperty('metallic', 0);
      m.setProperty('specularIntensity', 0);
      m.setProperty('alphaThreshold', a2c ? 0.06 : 0.5);
      if (tint) {
        m.setProperty('mainColor', new Color(tint[0], tint[1], tint[2], 255));
      }
      this.mats.set(key, m);
    }
    return m;
  }

  /** 一张图一块单位平板(宽 1、高 1,底边中点在原点),贴图坐标取这张图在图集里的位置;法线朝上。 */
  private frameMesh(frame: SpriteFrame): Mesh {
    let mesh = this.meshes.get(frame);
    if (!mesh) {
      const uv = frame.uv;
      mesh = utils.MeshUtils.createMesh({
        positions: [-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        uvs: [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[6], uv[7]],
        indices: [0, 1, 2, 2, 1, 3],
      }, undefined, { calculateBounds: true });
      this.meshes.set(frame, mesh);
    }
    return mesh;
  }

  private card(frame: SpriteFrame, w: number, h: number, flip: boolean, tint: [number, number, number] | undefined, cast: boolean): Built {
    const node = new Node('Card');
    this.root!.addChild(node);
    node.setScale(flip ? -w : w, h, 1);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = this.frameMesh(frame);
    mr.setSharedMaterial(this.cardMaterial(frame, tint), 0);
    mr.shadowCastingMode = cast ? MeshRenderer.ShadowCastingMode.ON : MeshRenderer.ShadowCastingMode.OFF;
    mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
    return { node, renderers: [mr] };
  }

  // ───────────────────────── 每帧:挡住队长的淡出、随风摆 ─────────────────────────
  private animate(self: any, dt: number): void {
    const leader = self.leader;
    const k = 1 - Math.exp(-10 * dt);
    let faded = 0;
    for (const item of this.items.values()) {
      if (!item.node.active) {
        continue;
      }
      if (item.tall) {
        const covered = !!leader && leader.y > item.y + 8 && Math.abs(leader.x - item.x) < item.w * 0.42 && leader.y < item.y + item.h * 0.9;
        const target = covered ? FADE_TO : 1;
        if (item.fade !== target) {
          item.fade = Math.abs(target - item.fade) < 0.01 ? target : item.fade + (target - item.fade) * k;
          this.applyFade(item);
        }
        if (item.fade < 1) {
          faded += 1;
        }
      }
      if (this.cfg.sway && item.sway.length) {
        const t = this.time;
        // 两个频率叠起来的小幅摇晃;相位按地图上的位置错开,一阵风从左吹到右
        const ph = item.x * 0.0021 + item.seed * 3;
        const a = (Math.sin(t * 1.3 - ph) * 0.7 + Math.sin(t * 2.9 - ph * 1.7) * 0.3) * item.swayAmp;
        const b = Math.sin(t * 1.7 - ph * 1.3) * 0.5 * item.swayAmp;
        for (let i = 0; i < item.sway.length; i += 1) {
          item.sway[i].setRotationFromEuler(item.flat ? 0 : b, 0, a);
        }
      }
    }
    this.stats.faded = faded;
  }

  /** 淡出靠材质实例上的不透明度(配合「透明度转覆盖率」得到半透明);恢复到 1 就换回共用材质。 */
  private applyFade(item: Item): void {
    for (let i = 0; i < item.renderers.length; i += 1) {
      const mr = item.renderers[i];
      if (!mr.isValid) {
        continue;
      }
      if (item.fade >= 1) {
        mr.setSharedMaterial(item.shared[i], 0);
        continue;
      }
      const inst = mr.getMaterialInstance(0);
      if (inst) {
        const base = (item.shared[i].getProperty('mainColor') as Color | null) ?? Color.WHITE;
        inst.setProperty('mainColor', new Color(base.r, base.g, base.b, Math.round(255 * item.fade)));
      }
    }
  }

  stop(): void {
    for (const item of this.items.values()) {
      if (item.art.isValid) {
        item.art.active = true;
      }
    }
    this.items.clear();
    this.failed.clear();
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.self = null;
    this.entities = null;
    this.key = '';
    this.meshes.clear();
    this.stats.cards = 0;
    this.stats.meshes = 0;
  }

  /** 现场改开关(改了要整层重建)。 */
  set(patch: Partial<TownProps3D['cfg']>): void {
    Object.assign(this.cfg, patch);
    this.stop();
  }

  info(): unknown {
    return { props: { ...this.stats, items: this.items.size, mats: this.mats.size, msaa: this.msaa, cfg: { ...this.cfg } } };
  }
}

const props = new TownProps3D();
if (!EDITOR && sys.isBrowser) {
  addFieldExtra(props);
  (globalThis as any).__f3dprops = props;
}
