import { Color, EffectAsset, Material, Node, resources, Size, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform, Vec4 } from 'cc';
import { MAP_LIGHTS } from './LobbyFieldGlowData';
import type { AmbientOpts } from './LobbyTownAmbient';
import type { WorldMapDef } from './LobbyWorldMaps';

/**
 * 野外沉浸感第一步(2026-11-22 用户:「玩家看了就想沉浸在这个画面美术中,但是目前没有」→ 看完目标画面「开始做」)。
 * 诊断:野外是一张拼出来的地图,不是一幅画 —— 没有光的情绪、没有空气、世界是静止的。这里补「活」的一层:
 *   ① 树冠斑驳光(effects/world-dapple):树下叶影 + 暖色光斑,两层光斑慢慢晃;人走到树下也被叶影扫过
 *   ② 火堆炊烟(MAP_LIGHTS 里的 fire):一缕缕往上飘、被风带斜
 *   ③ 风沙带(荒原):贴地一缕缕顺风扫过
 *   ④ 低雾(枯木林):大团薄雾慢慢漂
 *   ⑤ 蝴蝶(林地 / 晨风村):镜头附近闲飞、扇翅
 *   ⑥ 鸟影:林地 / 晨风村一群小鸟的影子偶尔掠过;荒原一只鹰的影子在头顶盘旋;枯木林乌鸦
 *   ⑦ 近景枝叶(林地):树旁挂一簇近景枝叶,按 1.35 倍视差走(比地面近),只在屏幕边缘那圈显形,框住画面、不挡中间
 * 飘叶 / 云影 / 浮尘光点仍是 LobbyTownAmbient(这里给每张图的参数 ambient)。全部节点数量固定,只动镜头附近的。
 */
export interface FieldLifeDef {
  /** 斑驳光:叶影深度 / 光斑亮度 / 空地保底强度 / 光斑一格世界尺寸。 */
  dapple?: { shade: number; sun: number; open: number; scale: number };
  smoke?: boolean;
  dust?: number;
  mist?: number;
  flies?: number;
  birds?: 'flock' | 'hawk' | 'crows';
  foliage?: boolean;
  ambient: AmbientOpts;
}

const LIFE_DEFS: Record<string, FieldLifeDef> = {
  WOODS: {
    dapple: { shade: 0.55, sun: 0.46, open: 0.22, scale: 720 }, smoke: true, flies: 4, birds: 'flock', foliage: true,
    ambient: { leaves: 14, localClouds: 3, cloudOpacity: 44, motes: 16, moteTint: [255, 238, 196], canopy: false },
  },
  VILLAGE: {
    dapple: { shade: 0.46, sun: 0.4, open: 0.1, scale: 680 }, flies: 5, birds: 'flock',
    ambient: { leaves: 8, localClouds: 3, cloudOpacity: 38, motes: 12, moteTint: [255, 240, 205], canopy: false },
  },
  GRAY: {
    smoke: true, dust: 7, birds: 'hawk',
    ambient: { leaves: 0, localClouds: 3, cloudOpacity: 62, cloudScale: 1.3, motes: 0, canopy: false },
  },
  DEADWOOD: {
    smoke: true, mist: 7, birds: 'crows',
    ambient: { leaves: 10, leafTint: [158, 136, 108], localClouds: 3, cloudOpacity: 40, motes: 0, canopy: false },
  },
};

export function fieldLifeDef(code: string): FieldLifeDef | null {
  return LIFE_DEFS[code] ?? null;
}

const FX = 'ui/world/fx/';
const DAPPLE_EFFECT = 'effects/world-dapple';
const WIND = 1;
const FOLIAGE_PARALLAX = 1.35;
const FOLIAGE_CELL = 1700;
const MASK_CELL = 64;

interface Puff { node: Node; op: UIOpacity; age: number; life: number; x: number; y: number; vx: number; vy: number; s0: number; s1: number; rot: number }
interface Smoke { x: number; y: number; puffs: Puff[]; on: boolean }
interface Drift { node: Node; op: UIOpacity; x: number; y: number; vx: number; vy: number; age: number; life: number; peak: number }
interface Fly { node: Node; x: number; y: number; vx: number; vy: number; tx: number; ty: number; retarget: number; phase: number; speed: number }
interface Bird { node: Node; op: UIOpacity; x: number; y: number; vx: number; vy: number; phase: number; on: boolean }
interface Foliage { node: Node; op: UIOpacity; x: number; y: number; size: number; angle: number; phase: number }

export class FieldLife {
  private def: FieldLifeDef | null = null;
  private world: Node | null = null;
  private low: Node | null = null;
  private high: Node | null = null;
  private dapple: Node | null = null;
  private dappleMat: Material | null = null;
  private readonly origin = new Vec4(0, 0, 1, 0);
  private smokes: Smoke[] = [];
  private dusts: Drift[] = [];
  private mists: Drift[] = [];
  private flies: Fly[] = [];
  private birds: Bird[] = [];
  private birdWait = 8;
  private hawk: (Bird & { cx: number; cy: number; r: number; ang: number; cycle: number }) | null = null;
  private foliage: Foliage[] = [];
  private seed = 20261122;

  get active(): boolean {
    return !!this.def && !!this.high?.isValid;
  }

  /** 挂到世界层(世界重建后重挂;重复调用无副作用)。ground = 贴地层(风沙 / 鸟影挂在它里面,压在人物之下)。 */
  mount(world: Node, ground: Node | null, map: WorldMapDef, camX: number, camY: number, viewW: number, viewH: number): void {
    const def = LIFE_DEFS[map.code] ?? null;
    if (!def || !world.isValid) {
      return;
    }
    if (this.high?.isValid && this.high.parent === world) {
      return;
    }
    this.reset();
    this.def = def;
    this.world = world;
    const layer = world.layer;
    const high = new Node('LifeHigh');
    high.layer = layer;
    high.addComponent(UITransform).setContentSize(new Size(10, 10));
    world.addChild(high);
    this.high = high;
    if (ground && ground.isValid) {
      const low = new Node('LifeLow');
      low.layer = ground.layer;
      low.addComponent(UITransform).setContentSize(new Size(10, 10));
      ground.addChild(low);
      const vignette = ground.getChildByName('Vignette');
      if (vignette) {
        low.setSiblingIndex(vignette.getSiblingIndex());
      }
      this.low = low;
    }
    if (def.dapple) {
      this.mountDapple(world, map, def.dapple, viewW, viewH);
    }
    if (def.mist) {
      for (let i = 0; i < def.mist; i += 1) {
        const w = 900 + this.rand() * 800;
        // 同一张贴图的节点挨着建(相邻同贴图才能合批)
        const node = this.sprite(high, `${FX}fog_cloud_${Math.floor((i * 3) / def.mist)}/spriteFrame`, w, w * 0.5, new Color(176, 192, 200, 255));
        const d: Drift = { node, op: node.getComponent(UIOpacity)!, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, peak: 0 };
        this.respawnMist(d, camX, camY, viewW, viewH, true);
        this.mists.push(d);
      }
    }
    if (def.smoke) {
      for (const l of MAP_LIGHTS[map.code] ?? []) {
        if (l[2] !== 'fire') {
          continue;
        }
        const s: Smoke = { x: l[0] as number, y: l[1] as number, puffs: [], on: false };
        for (let i = 0; i < 14; i += 1) {
          const node = this.sprite(high, `${FX}life_smoke/spriteFrame`, 80, 80, new Color(236, 234, 230, 255));
          node.active = false;
          s.puffs.push({ node, op: node.getComponent(UIOpacity)!, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, s0: 0, s1: 0, rot: 0 });
        }
        this.smokes.push(s);
      }
    }
    if (def.dust && this.low) {
      for (let i = 0; i < def.dust; i += 1) {
        const node = this.sprite(this.low, `${FX}life_dust/spriteFrame`, 900, 110, new Color(242, 232, 212, 255));
        const d: Drift = { node, op: node.getComponent(UIOpacity)!, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, peak: 0 };
        this.respawnDust(d, camX, camY, viewW, viewH, true);
        this.dusts.push(d);
      }
    }
    if (def.flies) {
      for (let i = 0; i < def.flies; i += 1) {
        const size = 26 + this.rand() * 10;
        const node = this.sprite(high, `${FX}life_fly_${Math.floor((i * 3) / def.flies)}/spriteFrame`, size, size);
        node.getComponent(UIOpacity)!.opacity = 255;
        const f: Fly = { node, x: camX + (this.rand() - 0.5) * viewW * 0.7, y: camY + (this.rand() - 0.5) * viewH * 0.7, vx: 0, vy: 0, tx: 0, ty: 0,
          retarget: 0, phase: this.rand() * 10, speed: 70 + this.rand() * 50 };
        this.flies.push(f);
      }
    }
    if (def.birds && this.low) {
      if (def.birds === 'hawk') {
        const node = this.sprite(this.low, `${FX}life_bird/spriteFrame`, 170, 85);
        this.hawk = { node, op: node.getComponent(UIOpacity)!, x: camX, y: camY, vx: 0, vy: 0, phase: 0, on: true, cx: camX, cy: camY, r: 480, ang: 0, cycle: 0 };
      } else {
        const big = def.birds === 'crows';
        for (let i = 0; i < 6; i += 1) {
          const node = this.sprite(this.low, `${FX}life_bird/spriteFrame`, big ? 84 : 58, big ? 42 : 29);
          node.active = false;
          this.birds.push({ node, op: node.getComponent(UIOpacity)!, x: 0, y: 0, vx: 0, vy: 0, phase: this.rand() * 10, on: false });
        }
      }
    }
    if (def.foliage) {
      this.mountFoliage(high, map);
    }
  }

  /** 树冠密度图:地图上每棵树在它投影一侧(光从左上来 → 右下)盖一块柔边圆,模糊后当斑驳光强度。 */
  private buildMask(map: WorldMapDef): Texture2D {
    const W = Math.ceil(map.width / MASK_CELL);
    const H = Math.ceil(map.height / MASK_CELL);
    const acc = new Float32Array(W * H);
    for (const p of map.props) {
      if (p.flat || !/tree/.test(p.asset) || /dead/.test(p.asset)) {
        continue;
      }
      const r = (p.width * 0.78) / MASK_CELL;
      const cx = (p.x + p.width * 0.14 + map.width / 2) / MASK_CELL;
      const cy = (map.height / 2 - (p.y - p.width * 0.1)) / MASK_CELL;
      const x0 = Math.max(0, Math.floor(cx - r - 1));
      const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
      const y0 = Math.max(0, Math.floor(cy - r - 1));
      const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.25) / r;
          if (d < 1) {
            const i = y * W + x;
            acc[i] = Math.min(1, acc[i] + (1 - d * d) * 0.85);
          }
        }
      }
    }
    // 两遍 3×3 均值模糊,边缘更柔
    let src = acc;
    for (let pass = 0; pass < 2; pass += 1) {
      const dst = new Float32Array(W * H);
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          let s = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            const yy = y + dy;
            if (yy < 0 || yy >= H) {
              continue;
            }
            for (let dx = -1; dx <= 1; dx += 1) {
              const xx = x + dx;
              if (xx < 0 || xx >= W) {
                continue;
              }
              s += src[yy * W + xx];
              n += 1;
            }
          }
          dst[y * W + x] = s / n;
        }
      }
      src = dst;
    }
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i += 1) {
      const v = Math.round(Math.min(1, src[i]) * 255);
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new Texture2D();
    tex.reset({ width: W, height: H, format: Texture2D.PixelFormat.RGBA8888 });
    tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    tex.uploadData(data);
    return tex;
  }

  private mountDapple(world: Node, map: WorldMapDef, cfg: NonNullable<FieldLifeDef['dapple']>, viewW: number, viewH: number): void {
    const node = new Node('LifeDapple');
    node.layer = world.layer;
    node.addComponent(UITransform).setContentSize(new Size(viewW * 1.1, viewH * 1.1));
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, 255);
    // 插在昼夜调色层之前(调色在它之上);没有就插在暗角 / 鬼火之前
    const anchor = ['TodWash', 'FieldWisps', 'FieldLookOverlay', 'Ambient'].map((n) => world.getChildByName(n)).find((n) => !!n);
    world.addChild(node);
    if (anchor) {
      node.setSiblingIndex(anchor.getSiblingIndex());
    }
    node.active = false;
    this.dapple = node;
    const mask = this.buildMask(map);
    let effect: EffectAsset | null = null;
    let frame: SpriteFrame | null = null;
    const ready = (): void => {
      if (!effect || !frame || !node.isValid) {
        return;
      }
      const tex = frame.texture as Texture2D;
      tex.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
      const mat = new Material();
      mat.initialize({ effectAsset: effect });
      mat.setProperty('dappleTex', tex);
      mat.setProperty('maskTex', mask);
      mat.setProperty('maskRect', new Vec4(map.width, map.height, 0, 0));
      mat.setProperty('dappleParams', new Vec4(cfg.shade, cfg.sun, cfg.open, cfg.scale));
      mat.setProperty('mapOrigin', this.origin);
      sprite.spriteFrame = frame;
      sprite.customMaterial = mat;
      this.dappleMat = mat;
      node.active = true;
    };
    const cachedEffect = resources.get(DAPPLE_EFFECT, EffectAsset);
    if (cachedEffect) {
      effect = cachedEffect;
    } else {
      resources.load(DAPPLE_EFFECT, EffectAsset, (error, asset) => {
        effect = error ? null : asset;
        ready();
      });
    }
    const path = `${FX}life_dapple/spriteFrame`;
    const cachedFrame = resources.get(path, SpriteFrame);
    if (cachedFrame) {
      frame = cachedFrame;
      ready();
    } else {
      resources.load(path, SpriteFrame, (error, asset) => {
        frame = error ? null : asset;
        ready();
      });
    }
  }

  /** 近景枝叶:每 1700 见方取最大的一棵树,在树冠处挂一簇(三种轮换、随机翻转 / 转角)。 */
  private mountFoliage(parent: Node, map: WorldMapDef): void {
    const best = new Map<string, { x: number; y: number; w: number }>();
    for (const p of map.props) {
      if (p.flat || !/tree/.test(p.asset) || /dead/.test(p.asset)) {
        continue;
      }
      const key = `${Math.floor(p.x / FOLIAGE_CELL)}_${Math.floor(p.y / FOLIAGE_CELL)}`;
      const cur = best.get(key);
      if (!cur || p.width > cur.w) {
        best.set(key, { x: p.x, y: p.y + p.width * 0.55, w: p.width });
      }
    }
    // 三种枝叶轮换分配,但按贴图分组建节点(相邻同贴图才能合批)
    const list = Array.from(best.values()).map((t, i) => ({ ...t, tex: i % 3 })).sort((a, b) => a.tex - b.tex);
    for (const t of list) {
      const size = Math.max(560, Math.min(920, t.w * 1.25));
      const node = this.sprite(parent, `${FX}life_leaf_${t.tex}/spriteFrame`, size, size, new Color(226, 228, 212, 255));
      node.setScale(this.rand() < 0.5 ? -1 : 1, 1, 1);
      const angle = (this.rand() - 0.5) * 50;
      node.angle = angle;
      node.active = false;
      this.foliage.push({ node, op: node.getComponent(UIOpacity)!, x: t.x, y: t.y, size, angle, phase: this.rand() * 10 });
    }
  }

  step(dt: number, camX: number, camY: number, viewW: number, viewH: number): void {
    if (!this.def || !this.high?.isValid) {
      return;
    }
    const world = this.world!;
    if (world.children[world.children.length - 1] !== this.high) {
      this.high.setSiblingIndex(world.children.length - 1);
    }
    const t = Date.now() / 1000;
    const gust = 0.75 + 0.5 * (Math.sin(t * 0.31) * 0.5 + 0.5);
    if (this.dapple?.isValid && this.dappleMat) {
      const p = world.worldPosition;
      const s = world.worldScale.x || 1;
      if (this.origin.x !== p.x || this.origin.y !== p.y || this.origin.z !== 1 / s) {
        this.origin.set(p.x, p.y, 1 / s, 0);
        this.dappleMat.setProperty('mapOrigin', this.origin);
      }
      this.dapple.setPosition(camX, camY, 0);
      const tf = this.dapple.getComponent(UITransform)!;
      if (Math.abs(tf.width - viewW * 1.1) > 1 || Math.abs(tf.height - viewH * 1.1) > 1) {
        tf.setContentSize(new Size(viewW * 1.1, viewH * 1.1));
      }
    }
    this.stepSmoke(dt, t, gust, camX, camY, viewW, viewH);
    for (const d of this.dusts) {
      d.age += dt;
      d.x += d.vx * gust * dt;
      d.y += d.vy * dt;
      const k = d.age / d.life;
      d.op.opacity = Math.round(d.peak * Math.max(0, Math.min(1, k / 0.18, (1 - k) / 0.3)));
      d.node.setPosition(d.x, d.y, 0);
      if (k >= 1 || Math.abs(d.y - camY) > viewH) {
        this.respawnDust(d, camX, camY, viewW, viewH, false);
      }
    }
    for (const d of this.mists) {
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const k = d.age / d.life;
      d.op.opacity = Math.round(d.peak * Math.max(0, Math.min(1, k / 0.2, (1 - k) / 0.2)));
      d.node.setPosition(d.x, d.y, 0);
      if (k >= 1 || Math.abs(d.x - camX) > viewW * 1.1 || Math.abs(d.y - camY) > viewH) {
        this.respawnMist(d, camX, camY, viewW, viewH, false);
      }
    }
    this.stepFlies(dt, t, camX, camY, viewW, viewH);
    this.stepBirds(dt, t, camX, camY, viewW, viewH);
    this.stepFoliage(t, camX, camY, viewW, viewH);
  }

  private stepSmoke(dt: number, t: number, gust: number, camX: number, camY: number, viewW: number, viewH: number): void {
    for (const s of this.smokes) {
      const near = Math.abs(s.x - camX) < viewW / 2 + 700 && Math.abs(s.y - camY) < viewH / 2 + 900;
      if (near !== s.on) {
        s.on = near;
        s.puffs.forEach((p, i) => {
          p.node.active = near;
          if (near) {
            this.respawnPuff(p, s);
            p.age = (i / s.puffs.length) * p.life;   // 错开,一进来就是一缕完整的烟
            p.x += (p.vx * WIND) * p.age;
            p.y += p.vy * p.age * 0.8;
          }
        });
      }
      if (!near) {
        continue;
      }
      for (const p of s.puffs) {
        p.age += dt;
        if (p.age >= p.life) {
          this.respawnPuff(p, s);
        }
        const k = p.age / p.life;
        p.x += (p.vx * gust + Math.sin(t * 0.8 + p.rot) * 6) * dt;
        p.y += p.vy * (1 - k * 0.45) * dt;
        const size = p.s0 + (p.s1 - p.s0) * k;
        p.node.getComponent(UITransform)!.setContentSize(size, size);
        p.node.setPosition(p.x, p.y, 0);
        p.node.angle = p.rot + k * 40;
        p.op.opacity = Math.round(178 * Math.min(1, k * 6) * Math.pow(1 - k, 1.3));
      }
    }
  }

  private respawnPuff(p: Puff, s: Smoke): void {
    p.age = 0;
    p.life = 5.4 + this.rand() * 2.6;
    p.x = s.x + (this.rand() - 0.5) * 24;
    p.y = s.y + 26;
    p.vx = 10 + this.rand() * 12;
    p.vy = 42 + this.rand() * 16;
    p.s0 = 70 + this.rand() * 30;
    p.s1 = 300 + this.rand() * 140;
    p.rot = this.rand() * 360;
  }

  private respawnDust(d: Drift, camX: number, camY: number, viewW: number, viewH: number, anywhere: boolean): void {
    const w = 700 + this.rand() * 650;
    d.node.getComponent(UITransform)!.setContentSize(w, 70 + this.rand() * 80);
    d.vx = 150 + this.rand() * 90;
    d.vy = (this.rand() - 0.5) * 24;
    d.life = (viewW * 1.25 + w) / d.vx;
    d.age = anywhere ? this.rand() * d.life * 0.7 : 0;
    d.x = camX - viewW * 0.62 - w * 0.3 + (anywhere ? d.vx * d.age : this.rand() * viewW * 0.2);
    d.y = camY + (this.rand() - 0.5) * viewH * 0.95;
    d.peak = 95 + this.rand() * 70;
    d.node.angle = -2 + (this.rand() - 0.5) * 6;
  }

  private respawnMist(d: Drift, camX: number, camY: number, viewW: number, viewH: number, anywhere: boolean): void {
    d.vx = 10 + this.rand() * 14;
    d.vy = (this.rand() - 0.5) * 6;
    d.life = 38 + this.rand() * 26;
    d.age = anywhere ? this.rand() * d.life * 0.8 : 0;
    d.x = camX + (anywhere ? (this.rand() - 0.5) * viewW * 1.2 : -viewW * 0.62 + this.rand() * viewW * 0.5);
    d.y = camY + (this.rand() - 0.5) * viewH * 1.1;
    d.peak = 30 + this.rand() * 28;
  }

  private stepFlies(dt: number, t: number, camX: number, camY: number, viewW: number, viewH: number): void {
    for (const f of this.flies) {
      f.retarget -= dt;
      const far = Math.abs(f.x - camX) > viewW * 0.75 || Math.abs(f.y - camY) > viewH * 0.75;
      if (far) {
        // 跑出视野:从视野边上重新飞进来
        const side = this.rand() < 0.5 ? -1 : 1;
        f.x = camX + side * viewW * 0.52;
        f.y = camY + (this.rand() - 0.5) * viewH * 0.8;
        f.retarget = 0;
      }
      if (f.retarget <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 40) {
        f.tx = camX + (this.rand() - 0.5) * viewW * 0.8;
        f.ty = camY + (this.rand() - 0.5) * viewH * 0.75;
        f.retarget = 3 + this.rand() * 4;
      }
      const dx = f.tx - f.x;
      const dy = f.ty - f.y;
      const d = Math.hypot(dx, dy) || 1;
      // 蝴蝶飞得一顿一顿:速度带一点抖动,方向慢慢转
      const wob = 0.7 + 0.6 * Math.abs(Math.sin(t * 3.3 + f.phase));
      f.vx += ((dx / d) * f.speed * wob - f.vx) * Math.min(1, dt * 1.6);
      f.vy += ((dy / d) * f.speed * wob - f.vy) * Math.min(1, dt * 1.6);
      f.x += f.vx * dt;
      f.y += f.vy * dt + Math.sin(t * 5.1 + f.phase) * 14 * dt;
      f.node.setPosition(f.x, f.y, 0);
      f.node.angle = (Math.atan2(f.vy, f.vx) * 180) / Math.PI - 90;
      f.node.setScale(0.22 + 0.78 * Math.abs(Math.sin(t * 15 + f.phase)), 1, 1);
    }
  }

  private stepBirds(dt: number, t: number, camX: number, camY: number, viewW: number, viewH: number): void {
    const hawk = this.hawk;
    if (hawk) {
      // 鹰影:盘旋 30 秒、离开 18 秒,一圈一圈;盘旋中心慢慢跟着镜头
      hawk.cycle += dt;
      if (hawk.cycle > 48) {
        hawk.cycle = 0;
        hawk.cx = camX + (this.rand() - 0.5) * viewW * 0.4;
        hawk.cy = camY + (this.rand() - 0.5) * viewH * 0.3;
        hawk.r = 380 + this.rand() * 200;
      }
      hawk.cx += (camX - hawk.cx) * Math.min(1, dt * 0.08);
      hawk.cy += (camY - hawk.cy) * Math.min(1, dt * 0.08);
      hawk.ang += dt * 0.24;
      const x = hawk.cx + Math.cos(hawk.ang) * hawk.r;
      const y = hawk.cy + Math.sin(hawk.ang) * hawk.r * 0.62;
      hawk.node.setPosition(x, y, 0);
      hawk.node.angle = (hawk.ang * 180) / Math.PI;   // 切线方向(剪影头朝上 → 绕圈时头朝前)
      const flap = Math.pow(Math.max(0, Math.sin(t * 1.4)), 10);
      hawk.node.setScale(1 - flap * 0.3, 1, 1);
      const vis = Math.min(1, hawk.cycle / 3, Math.max(0, (30 - hawk.cycle) / 3));
      hawk.op.opacity = Math.round(92 * Math.max(0, vis));
    }
    if (!this.birds.length) {
      return;
    }
    const crows = this.def?.birds === 'crows';
    this.birdWait -= dt;
    if (this.birdWait <= 0 && !this.birds.some((b) => b.on)) {
      this.birdWait = (crows ? 26 : 16) + this.rand() * 18;
      const n = 3 + Math.floor(this.rand() * 3);
      const speed = crows ? 210 + this.rand() * 50 : 300 + this.rand() * 80;
      const ang = (-12 - this.rand() * 26) * (Math.PI / 180);
      const sx = camX - viewW * 0.72;
      const sy = camY + viewH * (0.05 + this.rand() * 0.4);
      for (let i = 0; i < n; i += 1) {
        const b = this.birds[i];
        const row = Math.ceil(i / 2);
        const side = i % 2 ? 1 : -1;
        b.x = sx - row * (crows ? 110 : 80);
        b.y = sy + side * row * (crows ? 70 : 50) + (this.rand() - 0.5) * 30;
        b.vx = Math.cos(ang) * speed;
        b.vy = Math.sin(ang) * speed;
        b.on = true;
        b.node.active = true;
        b.node.angle = (ang * 180) / Math.PI - 90;
      }
    }
    for (const b of this.birds) {
      if (!b.on) {
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt + Math.sin(t * 2 + b.phase) * 8 * dt;
      b.node.setPosition(b.x, b.y, 0);
      const flapRate = crows ? 7 : 11;
      b.node.setScale(0.62 + 0.38 * Math.abs(Math.sin(t * flapRate + b.phase)), 1, 1);
      b.op.opacity = crows ? 96 : 70;
      if (b.x > camX + viewW * 0.8 || b.y < camY - viewH) {
        b.on = false;
        b.node.active = false;
      }
    }
  }

  private stepFoliage(t: number, camX: number, camY: number, viewW: number, viewH: number): void {
    const hw = viewW / 2;
    const hh = viewH / 2;
    for (const f of this.foliage) {
      const px = camX + (f.x - camX) * FOLIAGE_PARALLAX;
      const py = camY + (f.y - camY) * FOLIAGE_PARALLAX;
      const ex = Math.abs(px - camX) / hw;
      const ey = Math.abs(py - camY) / hh;
      const reach = (f.size / 2) / Math.min(hw, hh);
      const e = Math.max(ex, ey);
      const show = e > 0.5 && ex < 1 + reach && ey < 1 + reach;
      if (f.node.active !== show) {
        f.node.active = show;
      }
      if (!show) {
        continue;
      }
      // 只在屏幕边缘那圈显形:越靠中间越淡(不挡战斗)
      const k = Math.max(0, Math.min(1, (e - 0.62) / 0.3));
      f.op.opacity = Math.round(238 * k * k * (3 - 2 * k));
      f.node.setPosition(px, py, 0);
      f.node.angle = f.angle + Math.sin(t * 0.55 + f.phase) * 1.6;
    }
  }

  private sprite(parent: Node, asset: string, w: number, h: number, color?: Color): Node {
    const node = new Node('L');
    node.layer = parent.layer;
    node.addComponent(UITransform).setContentSize(w, h);
    node.addComponent(UIOpacity).opacity = 0;
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (color) {
      sprite.color = color;
    }
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
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  /** 换图 / 世界重建:节点随世界销毁,这里只清引用。 */
  reset(): void {
    this.def = null;
    this.world = null;
    this.low = null;
    this.high = null;
    this.dapple = null;
    this.dappleMat = null;
    this.smokes = [];
    this.dusts = [];
    this.mists = [];
    this.flies = [];
    this.birds = [];
    this.hawk = null;
    this.foliage = [];
    this.birdWait = 8;
  }
}
