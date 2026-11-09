import { Color, Node, resources, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';

/**
 * 跑图环境动效(2026-10-29 用户:地形都是静态贴纸,要树叶 / 草地随风):
 * - 飘落树叶:镜头附近常驻 LEAF_COUNT 片,顺风斜飘 + 翻转 + 淡入淡出,飘出视野就在上风处重生;
 * - 云影:几块很淡的大阴影慢慢掠过整张地图(盖在立物之上,人走进云影里也会暗一点)。
 * 只用 3 张叶片 + 1 张云影贴图(ui/world/fx,tools/qa/world_ambient_textures.py 生成),节点固定数量不增删。
 *
 * 加强层 depth(11-10 主城「远景 + 动态层」原型通过;贴图 tools/qa/city_backdrop_install.py):
 * - 云影改成在镜头附近循环飘(原来 3 块散在整张 1.4 万宽的图上,屏上几乎看不到),更深一点;
 * - 浮尘光点:暖色柔光点慢慢上飘 + 呼吸闪;
 * - 近景树冠:地图上撒一组虚化暗树冠,按 FG_PARALLAX 倍速相对镜头移动(比地面快 = 离镜头更近),只在屏幕下沿那截显形。
 */
const LEAF_COUNT = 14;
const CLOUD_COUNT = 3;
const WIND_X = 46;
const LEAF_ASSETS = ['ui/world/fx/leaf_0/spriteFrame', 'ui/world/fx/leaf_1/spriteFrame', 'ui/world/fx/leaf_2/spriteFrame'];
const CLOUD_ASSET = 'ui/world/fx/cloud_shadow/spriteFrame';
const MOTE_ASSET = 'ui/world/fx/mote/spriteFrame';
const FG_ASSET = 'ui/world/fx/fg_canopy/spriteFrame';
const DEPTH_CLOUD_COUNT = 4;
const MOTE_COUNT = 22;
const FG_PARALLAX = 1.45;
const FG_SIZE = 620;
const FG_STEP_X = 2200;
const FG_STEP_Y = 1200;

interface Mote {
  node: Node;
  opacity: UIOpacity;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  peak: number;
}

interface Canopy {
  node: Node;
  opacity: UIOpacity;
  x: number;
  y: number;
}

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
  private motes: Mote[] = [];
  private canopies: Canopy[] = [];
  private depth = false;
  private seed = 1;

  /** 挂到世界层最上面(实体层之后);mapW / mapH 用来放云影。 */
  mount(world: Node, mapW: number, mapH: number, camX: number, camY: number, viewW: number, viewH: number, depth = false): void {
    this.destroy();
    const root = new Node('Ambient');
    root.layer = world.layer;
    root.addComponent(UITransform);
    world.addChild(root);
    this.root = root;
    this.depth = depth;
    if (depth) {
      this.mountDepth(root, mapW, mapH, camX, camY, viewW, viewH);
    }
    for (let i = 0; i < (depth ? 0 : CLOUD_COUNT); i += 1) {
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
    this.motes = [];
    this.canopies = [];
  }

  private mountDepth(root: Node, mapW: number, mapH: number, camX: number, camY: number, viewW: number, viewH: number): void {
    // 云影:镜头附近循环飘(出了视野右边就从左边重新进来)
    for (let i = 0; i < DEPTH_CLOUD_COUNT; i += 1) {
      const w = 1700 + this.rand() * 900;
      const node = this.spriteNode(root, CLOUD_ASSET, w, w * (0.55 + this.rand() * 0.2));
      node.getComponent(UIOpacity)!.opacity = 58;
      node.angle = (this.rand() - 0.5) * 30;
      this.clouds.push({ node, x: camX + (this.rand() - 0.5) * (viewW + w), y: camY + (this.rand() - 0.5) * viewH, vx: 18 + this.rand() * 14 });
    }
    // 浮尘光点
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      const size = 12 + this.rand() * 22;
      const node = this.spriteNode(root, MOTE_ASSET, size, size);
      node.getComponent(Sprite)!.color = new Color(255, 232, 186, 255);
      const mote: Mote = { node, opacity: node.getComponent(UIOpacity)!, x: 0, y: 0, vx: 0, vy: 0, phase: 0, peak: 0 };
      this.respawnMote(mote, camX, camY, viewW, viewH, true);
      this.motes.push(mote);
    }
    // 近景树冠:按网格撒点 + 抖动(固定种子,每次进图位置一样)
    for (let gx = -mapW / 2 + FG_STEP_X / 2; gx < mapW / 2; gx += FG_STEP_X) {
      for (let gy = -mapH / 2 + FG_STEP_Y / 2; gy < mapH / 2; gy += FG_STEP_Y) {
        const node = this.spriteNode(root, FG_ASSET, FG_SIZE, FG_SIZE * 1.02);
        node.setScale(this.rand() < 0.5 ? -1 : 1, 1, 1);
        node.active = false;
        this.canopies.push({ node, opacity: node.getComponent(UIOpacity)!, x: gx + (this.rand() - 0.5) * FG_STEP_X * 0.6, y: gy + (this.rand() - 0.5) * FG_STEP_Y * 0.5 });
      }
    }
  }

  private stepDepth(dt: number, t: number, camX: number, camY: number, viewW: number, viewH: number): void {
    for (const cloud of this.clouds) {
      cloud.x += cloud.vx * dt;
      const half = cloud.node.getComponent(UITransform)!.width / 2;
      if (cloud.x - half > camX + viewW * 0.6) {
        cloud.x = camX - viewW * 0.6 - half;
        cloud.y = camY + (this.rand() - 0.5) * viewH;
      } else if (cloud.x + half < camX - viewW * 0.6 - 400) {
        cloud.x = camX + viewW * 0.6 + half - 200;
      }
      if (Math.abs(cloud.y - camY) > viewH * 0.9) {
        cloud.y = camY + (cloud.y > camY ? -1 : 1) * viewH * 0.6;
      }
      cloud.node.setPosition(cloud.x, cloud.y, 0);
    }
    for (const mote of this.motes) {
      mote.x += (mote.vx + Math.sin(t * 0.6 + mote.phase) * 10) * dt;
      mote.y += mote.vy * dt;
      mote.opacity.opacity = Math.round(mote.peak * (0.35 + 0.65 * (Math.sin(t * 1.3 + mote.phase) * 0.5 + 0.5)));
      mote.node.setPosition(mote.x, mote.y, 0);
      if (Math.abs(mote.x - camX) > viewW * 0.6 || Math.abs(mote.y - camY) > viewH * 0.6) {
        this.respawnMote(mote, camX, camY, viewW, viewH, false);
      }
    }
    const halfH = viewH / 2;
    for (const c of this.canopies) {
      const px = camX + (c.x - camX) * FG_PARALLAX;
      const py = camY + (c.y - camY) * FG_PARALLAX;
      const rel = (py - camY) / halfH;
      const show = Math.abs(px - camX) < viewW / 2 + FG_SIZE && rel < -0.5 && rel > -1.6;
      if (c.node.active !== show) {
        c.node.active = show;
      }
      if (!show) {
        continue;
      }
      // 只在屏幕下沿那截显形:相对高度 -0.55 → -0.85 淡入
      const k = Math.max(0, Math.min(1, (-0.55 - rel) / 0.3));
      c.opacity.opacity = Math.round(205 * k * k * (3 - 2 * k));
      c.node.setPosition(px, py, 0);
    }
  }

  private respawnMote(mote: Mote, camX: number, camY: number, viewW: number, viewH: number, anywhere: boolean): void {
    mote.x = camX + (this.rand() - 0.5) * viewW * (anywhere ? 1 : 1.1);
    mote.y = anywhere ? camY + (this.rand() - 0.5) * viewH : camY - viewH * (0.3 + this.rand() * 0.25);
    mote.vx = 6 + this.rand() * 14;
    mote.vy = 8 + this.rand() * 16;
    mote.phase = this.rand() * 10;
    mote.peak = 120 + this.rand() * 110;
  }

  step(dt: number, camX: number, camY: number, viewW: number, viewH: number, mapW: number): void {
    if (!this.root || !this.root.isValid) {
      return;
    }
    this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    const t = Date.now() / 1000;
    if (this.depth) {
      this.stepDepth(dt, t, camX, camY, viewW, viewH);
    }
    for (const cloud of this.depth ? [] : this.clouds) {
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
