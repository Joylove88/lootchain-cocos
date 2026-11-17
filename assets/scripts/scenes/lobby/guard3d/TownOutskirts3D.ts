import { game, Material, MeshRenderer, Node, sys, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { blocksView, buildProp, FADE_FREE, fadeRenderers } from './TownProps3D';
import { addFieldExtra } from './TownUnits3D';
import type { FieldExtra } from './TownUnits3D';
import { FIELD_LAYER, TownWorld3D } from './TownWorld3D';

/**
 * 野外真 3D 场景 · 地图外面的一圈树林(实验,2026-11-17;只在自由视角 ?fcam=1 下有)。
 *
 * 2D 的地图是一块长方形,固定镜头从不会看到地图外面。自由视角下镜头能转能压平,站在边上往外看就是「世界到头了」。
 * 地图外面先铺了一圈地面(TownGround3D 的 apron),这里在上面种一圈代码生成的树(和地图里的树同一批模型):
 * 贴着地图边的十几米种得密,再往外稀;只把离队长够近的建出来 / 显示出来(远的在雾里,不用画)。
 * 树的位置按格子抖动出来,是固定的(每次进图都一样);出口的路通到地图外的地方留一条空当。
 */

/** 种多宽一圈(米)、格子多大(米)、里圈多宽(米,里圈密外圈稀)。 */
const BAND = 34;
const CELL = 4.3;
const INNER = 15;

interface Tree {
  /** 3D 世界里的位置(米)。 */
  x: number;
  z: number;
  asset: string;
  w: number;
  h: number;
  seed: number;
  node: Node | null;
  sway: Node[];
  swayAmp: number;
  failed: boolean;
  /** 挡镜头时淡出用:网格、它们原来的共用材质、现在淡到多少。 */
  renderers: MeshRenderer[];
  shared: Material[];
  fade: number;
}

/** 树种(贴图路径里的关键字 → 用哪个生成器)、标准宽高(米)、占比。 */
const KINDS: Array<{ asset: string; w: number; h: number; share: number }> = [
  { asset: 'w3_tree_pine', w: 3.2, h: 7.3, share: 0.66 },
  { asset: 'w3_tree_oak', w: 4.4, h: 6.2, share: 0.22 },
  { asset: 'w3_tree_autumn', w: 3.6, h: 5.4, share: 0.12 },
];

function rand(ix: number, iz: number, salt: number): number {
  let h = (ix * 73856093) ^ (iz * 19349663) ^ (salt * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

const _p = new Vec3();

class TownOutskirts3D implements FieldExtra {
  private self: any = null;
  private root: Node | null = null;
  private trees: Tree[] = [];
  private tick = 0;
  private time = 0;
  private stats = { trees: 0, built: 0, shown: 0 };

  sync(self: any, world: TownWorld3D, dt: number): void {
    if (!world.free) {
      if (this.root) {
        this.stop();
      }
      return;
    }
    if (this.self !== self || !this.root || !this.root.isValid) {
      this.stop();
      this.self = self;
      this.root = new Node('TownOutskirts3D');
      this.root.layer = FIELD_LAYER;
      world.root.addChild(this.root);
      this.plant(self, world);
    }
    this.time += dt;
    this.tick += 1;
    if (this.tick % 10 === 1) {
      this.scan(self, world);
    }
    // 近处的随风摆(和地图里的树同一个摆法);挡在镜头前面的淡出(镜头会退到地图外面、钻进这圈树里)
    const t = this.time;
    const k = 1 - Math.exp(-10 * Math.min(0.05, Math.max(dt, game.deltaTime)));
    for (const tree of this.trees) {
      if (!tree.node || !tree.node.active) {
        continue;
      }
      const target = blocksView(world, tree.x, tree.z, tree.w * 0.36) ? FADE_FREE : 1;
      if (tree.fade !== target) {
        tree.fade = Math.abs(target - tree.fade) < 0.01 ? target : tree.fade + (target - tree.fade) * k;
        fadeRenderers(tree.renderers, tree.shared, tree.fade, true);
      }
      if (!tree.sway.length) {
        continue;
      }
      const ph = tree.x * 0.31 + tree.seed * 3;
      const a = (Math.sin(t * 1.3 - ph) * 0.7 + Math.sin(t * 2.9 - ph * 1.7) * 0.3) * tree.swayAmp;
      const b = Math.sin(t * 1.7 - ph * 1.3) * 0.5 * tree.swayAmp;
      for (const n of tree.sway) {
        n.setRotationFromEuler(b, 0, a);
      }
    }
  }

  /** 定下每棵树的位置(只算数据,不建模型)。 */
  private plant(self: any, world: TownWorld3D): void {
    const def = self.def;
    const U = world.cfg.unitsPerM;
    world.toWorld(def.width / 2, -def.height / 2, _p);      // 地图右下角(x 最大、z 最大)
    const hx = _p.x;
    const hz = _p.z;
    // 出口:路从这些地方通到地图外面,附近不种树
    const gaps: Array<[number, number]> = [];
    for (const e of (def.exits ?? []) as Array<{ x: number; y: number }>) {
      world.toWorld(e.x, e.y, _p);
      gaps.push([_p.x, _p.z]);
    }
    const n = Math.ceil(BAND / CELL);
    const cx0 = Math.floor(-hx / CELL) - n;
    const cx1 = Math.ceil(hx / CELL) + n;
    const cz0 = Math.floor(-hz / CELL) - n;
    const cz1 = Math.ceil(hz / CELL) + n;
    this.trees = [];
    for (let iz = cz0; iz <= cz1; iz += 1) {
      for (let ix = cx0; ix <= cx1; ix += 1) {
        const x = (ix + 0.15 + rand(ix, iz, 1) * 0.7) * CELL;
        const z = (iz + 0.15 + rand(ix, iz, 2) * 0.7) * CELL;
        // 离地图边多远(在地图里面的是负数)
        const out = Math.max(Math.abs(x) - hx, Math.abs(z) - hz);
        if (out < 0.6 || out > BAND) {
          continue;
        }
        if (rand(ix, iz, 3) > (out < INNER ? 0.84 : 0.5)) {
          continue;
        }
        if (gaps.some((g) => Math.hypot(g[0] - x, g[1] - z) < 6.5)) {
          continue;
        }
        let pick = rand(ix, iz, 4);
        let kind = KINDS[0];
        for (const k of KINDS) {
          if (pick < k.share) {
            kind = k;
            break;
          }
          pick -= k.share;
        }
        const s = 0.82 + rand(ix, iz, 5) * 0.5;
        this.trees.push({ x, z, asset: `props/${kind.asset}/spriteFrame`, w: kind.w * s, h: kind.h * s, seed: rand(ix, iz, 6), node: null, sway: [], swayAmp: 0, failed: false,
          renderers: [], shared: [], fade: 1 });
      }
    }
    this.stats.trees = this.trees.length;
    void U;
  }

  /** 离队长够近的建出来 / 显示,远的藏起来(一次最多新建十几棵,免得卡一下)。 */
  private scan(self: any, world: TownWorld3D): void {
    const lead = self.leader;
    world.toWorld(lead?.x ?? 0, lead?.y ?? 0, _p);
    const lx = _p.x;
    const lz = _p.z;
    const R = world.range.big;
    let built = 0;
    let shown = 0;
    for (const tree of this.trees) {
      const d = Math.hypot(tree.x - lx, tree.z - lz);
      const on = d < R;
      if (on && !tree.node && !tree.failed && built < 14) {
        let made = null;
        try {
          made = buildProp(this.root!, tree.asset, tree.w, tree.h, tree.seed, tree.seed > 0.5);
        } catch (error) {
          console.warn('[f3d] outskirts', tree.asset, error);
        }
        if (!made) {
          tree.failed = true;
          continue;
        }
        made.node.setPosition(tree.x, 0, tree.z);
        made.node.walk((n) => {
          n.layer = FIELD_LAYER;
        });
        tree.node = made.node;
        tree.sway = made.sway ?? [];
        tree.swayAmp = made.swayAmp ?? 0;
        tree.renderers = made.renderers;
        tree.shared = made.renderers.map((r) => r.sharedMaterials[0]!);
        tree.fade = 1;
        // 地图外的树不往地图里投影以外的地方投:离得远的那些本来也出了阴影贴图的范围,省掉
        if (d > 30) {
          for (const mr of made.renderers) {
            mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
          }
        }
        built += 1;
        this.stats.built += 1;
      }
      if (tree.node && tree.node.isValid) {
        if (tree.node.active !== on) {
          tree.node.active = on;
        }
        if (on) {
          shown += 1;
        }
      }
    }
    this.stats.shown = shown;
  }

  stop(): void {
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.self = null;
    this.trees = [];
    this.stats.built = 0;
    this.stats.shown = 0;
  }

  info(): unknown {
    return { outskirts: { ...this.stats } };
  }
}

const outskirts = new TownOutskirts3D();
if (!EDITOR && sys.isBrowser) {
  addFieldExtra(outskirts);
  (globalThis as any).__f3dout = outskirts;
}
