import { Node, resources, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';

/**
 * 跑图环境动效(2026-10-29 用户:地形都是静态贴纸,要树叶 / 草地随风):
 * - 飘落树叶:镜头附近常驻 LEAF_COUNT 片,顺风斜飘 + 翻转 + 淡入淡出,飘出视野就在上风处重生;
 * - 云影:几块很淡的大阴影慢慢掠过整张地图(盖在立物之上,人走进云影里也会暗一点)。
 * 只用 3 张叶片 + 1 张云影贴图(ui/world/fx,tools/qa/world_ambient_textures.py 生成),节点固定数量不增删。
 */
const LEAF_COUNT = 14;
const CLOUD_COUNT = 3;
const WIND_X = 46;
const LEAF_ASSETS = ['ui/world/fx/leaf_0/spriteFrame', 'ui/world/fx/leaf_1/spriteFrame', 'ui/world/fx/leaf_2/spriteFrame'];
const CLOUD_ASSET = 'ui/world/fx/cloud_shadow/spriteFrame';

interface Leaf {
  node: Node;
  opacity: UIOpacity;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  flip: number;
  life: number;
  age: number;
}

interface Cloud {
  node: Node;
  x: number;
  y: number;
  vx: number;
}

export class TownAmbient {
  private root: Node | null = null;
  private leaves: Leaf[] = [];
  private clouds: Cloud[] = [];
  private seed = 1;

  /** 挂到世界层最上面(实体层之后);mapW / mapH 用来放云影。 */
  mount(world: Node, mapW: number, mapH: number, camX: number, camY: number, viewW: number, viewH: number): void {
    this.destroy();
    const root = new Node('Ambient');
    root.layer = world.layer;
    root.addComponent(UITransform);
    world.addChild(root);
    this.root = root;
    for (let i = 0; i < CLOUD_COUNT; i += 1) {
      const node = this.spriteNode(root, CLOUD_ASSET, 1700 + i * 300, 1100 + i * 160);
      node.getComponent(UIOpacity)!.opacity = 34;
      this.clouds.push({ node, x: -mapW / 2 + (i + 0.5) * (mapW / CLOUD_COUNT), y: (this.rand() - 0.5) * mapH * 0.7, vx: 14 + this.rand() * 10 });
    }
    for (let i = 0; i < LEAF_COUNT; i += 1) {
      const node = this.spriteNode(root, LEAF_ASSETS[i % LEAF_ASSETS.length], 26, 26);
      const leaf: Leaf = { node, opacity: node.getComponent(UIOpacity)!, x: 0, y: 0, vx: 0, vy: 0, spin: 0, flip: 0, life: 1, age: 0 };
      this.respawnLeaf(leaf, camX, camY, viewW, viewH, true);
      this.leaves.push(leaf);
    }
  }

  destroy(): void {
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.leaves = [];
    this.clouds = [];
  }

  step(dt: number, camX: number, camY: number, viewW: number, viewH: number, mapW: number): void {
    if (!this.root || !this.root.isValid) {
      return;
    }
    this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    const t = Date.now() / 1000;
    for (const cloud of this.clouds) {
      cloud.x += cloud.vx * dt;
      if (cloud.x > mapW / 2 + 1200) {
        cloud.x = -mapW / 2 - 1200;
      }
      cloud.node.setPosition(cloud.x, cloud.y, 0);
    }
    for (const leaf of this.leaves) {
      leaf.age += dt;
      // 顺风斜飘 + 左右晃(阵风)
      const gust = Math.sin(t * 0.7 + leaf.flip * 3) * 0.5 + 0.5;
      leaf.x += (leaf.vx + WIND_X * gust) * dt + Math.sin(t * 2.1 + leaf.flip * 5) * 18 * dt;
      leaf.y += leaf.vy * dt;
      const k = leaf.age / leaf.life;
      leaf.opacity.opacity = Math.round(230 * Math.min(1, k * 4, (1 - k) * 4));
      leaf.node.setPosition(leaf.x, leaf.y, 0);
      leaf.node.angle += leaf.spin * dt;
      // 翻面:x 缩放在 ±1 之间摆
      leaf.node.setScale(Math.cos(t * 3 + leaf.flip * 7), 1, 1);
      const out = Math.abs(leaf.x - camX) > viewW * 0.7 || Math.abs(leaf.y - camY) > viewH * 0.7;
      if (k >= 1 || out) {
        this.respawnLeaf(leaf, camX, camY, viewW, viewH, false);
      }
    }
  }

  private respawnLeaf(leaf: Leaf, camX: number, camY: number, viewW: number, viewH: number, anywhere: boolean): void {
    // 首次铺满视野;之后从上风(左)和上方补
    leaf.x = camX + (anywhere ? (this.rand() - 0.5) * viewW : -viewW * 0.55 + this.rand() * viewW * 0.6);
    leaf.y = camY + (anywhere ? (this.rand() - 0.5) * viewH : viewH * (0.1 + this.rand() * 0.45));
    leaf.vx = 10 + this.rand() * 30;
    leaf.vy = -(26 + this.rand() * 30);
    leaf.spin = (this.rand() - 0.5) * 160;
    leaf.flip = this.rand() * 10;
    leaf.life = 7 + this.rand() * 6;
    leaf.age = anywhere ? this.rand() * leaf.life * 0.6 : 0;
    leaf.node.angle = this.rand() * 360;
  }

  private spriteNode(parent: Node, asset: string, w: number, h: number): Node {
    const node = new Node('Fx');
    node.layer = parent.layer;
    node.addComponent(UITransform).setContentSize(w, h);
    node.addComponent(UIOpacity).opacity = 0;
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    parent.addChild(node);
    const frame = resources.get(asset, SpriteFrame);
    if (frame) {
      sprite.spriteFrame = frame;
    } else {
      resources.load(asset, SpriteFrame, (error, loaded) => {
        if (!error && loaded && sprite.isValid) {
          sprite.spriteFrame = loaded;
        }
      });
    }
    return node;
  }

  private rand(): number {
    // 固定种子的线性同余,便于截图复现
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}
