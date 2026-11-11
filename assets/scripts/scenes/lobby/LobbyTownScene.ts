import { Graphics, Material, Node, Rect, resources, Size, sp, Sprite, SpriteFrame, Texture2D, tween, UIOpacity, UITransform, Vec2, Vec3 } from 'cc';
import { GUARD_MONSTER_DB_SCALE } from './GuardBattleModel';
import { patchBattleUnitSpineRuntimeEnums, resolveBattleUnitSpineRuntimeData, resolveBattleUnitSpineSkinName } from './LobbyBattleUnitSpineRuntime';
import { rgba } from './LobbyHudTypes';
import { applyAdditive, applyWorldShader, occludeMaterial } from './LobbyWorldShaders';
import type { WorldMapDef, WorldSceneDef } from './LobbyWorldMaps';
import { loadSharedSpineData } from './SpineDataStore';

/**
 * 整图场景层(2026-11-11 主城重做演示,用户:「两个弄下,我看看效果」「部分摆件和NPC需要加入动效,或者动态」):
 * 地图底图是一张完整的画(贴地件),这一层负责让它「能进去、会动」:
 * - 遮挡条:「立在地面上的东西」按 32px 竖条切成一堆小精灵,各带一条脚线,和人物一起按脚线排序;
 *   每条直接取底图块上它盖住的那一块像素 × 同一块的遮罩(effects/world-occlude),和底图是同一张贴图,叠上去没有任何色差,
 *   只有人走到它后面时才显出遮挡——
 *   所以平时全关着,每帧只把「挡在某个人 / NPC / 走动的人 / 明火前面、且和它有重叠」的那几条打开(occlude);
 *   11-11 实测全开时同屏 240 多条 = 117 次绘制 + 半屏重复填充,按需打开后同屏通常只剩十几二十条;
 * - 灯火:光晕(叠加混合,盖在所有东西上,人走近也被照亮)按各自相位明暗起伏;明火用程序火焰(effects/world-flame),火星往上飘;
 * - 烟 / 薄雾 / 飞蛾 / 飘雪:固定数量的节点循环复用;
 * - 走动的人 / 动物:现成怪物骨骼(待机 + 跑动放慢当走路)沿路线来回,到点停一会儿;站着的人 = 静态图 + 原地呼吸。
 * 数据见 WorldSceneDef(LobbyWorldMaps)。
 */
export interface TownSceneHost {
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
}

const FOG_ASSETS = [0, 1, 2].map((i) => `ui/world/fx/fog_cloud_${i}/spriteFrame`);
const SMOKE_PUFFS = 6;
const MIST_COUNT = 4;

interface Glow { op: UIOpacity; base: number; flicker: number; seed: number }
interface Puff { node: Node; op: UIOpacity; sx: number; sy: number; size: number; age: number; life: number; drift: number; rise: number; spin: number }
interface Mist { node: Node; x: number; y: number; w: number; v: number }
interface Mote {
  node: Node; op: UIOpacity; kind: 'moth' | 'ember' | 'snow';
  cx: number; cy: number; x: number; y: number; vx: number; vy: number; age: number; life: number; seed: number; peak: number;
}
interface Walker {
  cfg: WorldSceneDef['walkers'][number];
  node: Node; art: Node; skeleton: sp.Skeleton | null;
  x: number; y: number; idx: number; dir: 1 | -1; wait: number; moving: boolean; facing: 1 | -1; base: number; idle: string; move: string;
}
/** 遮挡条:世界坐标包围盒 + 脚线;on = 当前是否打开;mark = 最近一次被需要的帧号。 */
interface Strip { node: Node; x0: number; x1: number; y0: number; y1: number; foot: number; on: boolean; mark: number }
interface FlameBox { node: Node; x0: number; x1: number; y0: number; y1: number; foot: number }
/** 会被遮挡条挡住的东西(世界坐标包围盒 + 脚线 y)。 */
export interface OccludeBox { x0: number; x1: number; y0: number; y1: number; foot: number }

const walkCache = new WeakMap<WorldSceneDef, Uint8Array>();

/** 整图场景的可走判定(世界坐标)。 */
export function sceneWalkable(scene: WorldSceneDef, x: number, y: number): boolean {
  const { cell, cols, rows } = scene.walk;
  let bits = walkCache.get(scene);
  if (!bits) {
    bits = new Uint8Array(cols * rows.length);
    for (let r = 0; r < rows.length; r += 1) {
      const hex = rows[r];
      for (let c = 0; c < cols; c += 1) {
        bits[r * cols + c] = (parseInt(hex.charAt(c >> 2) || '0', 16) >> (3 - (c & 3))) & 1;
      }
    }
    walkCache.set(scene, bits);
  }
  const c = Math.floor((x / scene.unit + scene.px[0] / 2) / cell);
  const r = Math.floor((scene.px[1] / 2 - y / scene.unit) / cell);
  return c >= 0 && c < cols && r >= 0 && r < rows.length && bits[r * cols + c] === 1;
}

export class TownScene {
  private root: Node | null = null;
  private glows: Glow[] = [];
  private puffs: Puff[] = [];
  private mists: Mist[] = [];
  private motes: Mote[] = [];
  private walkers: Walker[] = [];
  private flameBoxes: FlameBox[] = [];
  /** 遮挡条按列分桶(列宽 = 条宽),查「这个人挡在哪几条后面」只翻他身下那几列。 */
  private stripCols: Strip[][] = [];
  private stripColW = 1;
  private stripLeft = 0;
  private liveStrips: Strip[] = [];
  private frame = 0;
  private t = 0;
  private seed = 7;
  private mapW = 0;
  private mapH = 0;
  private loadAsked = false;

  /** 世界层(重)建后挂一次;已挂在这个世界上就什么都不做。素材没到返回 false(调用方稍后再试)。 */
  mount(
    host: TownSceneHost, world: Node, entities: Node, def: WorldMapDef,
    addStatic: (node: Node, y: number, batch?: number) => void,
    addCull: (node: Node, x0: number, x1: number, y0: number, y1: number) => void,
  ): boolean {
    const scene = def.scene;
    if (!scene) {
      this.clear();
      return true;
    }
    if (this.root && this.root.isValid && this.root.parent === world) {
      return true;
    }
    const tiles = scene.tiles.base.map((asset) => resources.get<SpriteFrame>(asset, SpriteFrame));
    const masks = scene.tiles.masks.map((asset) => resources.get<SpriteFrame>(asset, SpriteFrame));
    const dot = resources.get<SpriteFrame>(scene.dot, SpriteFrame);
    // 每块一份遮挡材质(着色器没到会返回 null,顺便触发加载)
    const mats: Array<Material | null> = masks.map((mask) => (mask ? occludeMaterial(mask.texture as Texture2D) : null));
    if (!dot || tiles.some((tile) => !tile) || mats.some((mat) => !mat)) {
      if (!this.loadAsked && (!dot || tiles.some((tile) => !tile) || masks.some((mask) => !mask))) {
        this.loadAsked = true;
        resources.load([...scene.tiles.base, ...scene.tiles.masks, scene.dot], SpriteFrame, () => { this.loadAsked = false; });
      }
      return false;
    }
    this.clear();
    this.mapW = def.width;
    this.mapH = def.height;
    const root = host.addChildPlainNode(world, 'SceneFx', 0, 0, 10, 10);
    root.setSiblingIndex(entities.getSiblingIndex() + 1);
    this.root = root;
    const [W, H] = scene.px;
    const u = scene.unit;

    // ── 遮挡条:一条一个精灵(跨两行底图块的切成两段),默认关着,occlude 每帧按需打开 ──
    // 贴图区域 = 底图块上对应的那一条(底图块带补边:整图像素 + pad = 块里的像素),材质 = 这一块的遮罩
    const { cols, tileW, tileH, pad } = scene.tiles;
    const stripPx = Math.max(1, ...scene.strips.map((item) => item[2]));
    this.stripColW = stripPx * u;
    this.stripLeft = (-W / 2) * u;
    scene.strips.forEach(([sx, sy, sw, sh, foot], i) => {
      const footY = (H / 2 - foot) * u;
      const x = (sx + sw / 2 - W / 2) * u;
      const tx = sx + pad[0];
      const col = Math.min(cols - 1, Math.floor(tx / tileW));
      let y = sy;
      const yEnd = sy + sh;
      let part = 0;
      while (y < yEnd) {
        const ty = y + pad[1];
        const row = Math.floor(ty / tileH);
        const index = row * cols + col;
        const tile = tiles[index];
        const mat = mats[index];
        const y1 = Math.min(yEnd, (row + 1) * tileH - pad[1]);
        const h = y1 - y;
        if (!tile || !mat || h <= 0) {
          break;
        }
        const node = host.addChildPlainNode(entities, `SceneStrip_${i}${part ? 'b' : ''}`, x, (H / 2 - (y + h / 2)) * u, sw * u, h * u);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const frame = new SpriteFrame();
        frame.reset({ texture: tile.texture, rect: new Rect(tx - col * tileW, ty - row * tileH, sw, h), originalSize: new Size(sw, h), offset: new Vec2(0, 0), isRotate: false });
        frame.packable = false;
        sprite.spriteFrame = frame;
        sprite.customMaterial = mat;
        node.getComponent(UITransform)?.setContentSize(new Size(sw * u, h * u));
        node.active = false;
        const strip: Strip = { node, x0: x - (sw * u) / 2, x1: x + (sw * u) / 2, y0: (H / 2 - y1) * u, y1: (H / 2 - y) * u, foot: footY, on: false, mark: -1 };
        const bucket = Math.floor(sx / stripPx);
        (this.stripCols[bucket] ??= []).push(strip);
        // 排序键 = 脚线;batch = 底图块编号(相邻的条按它排到一起才能合批)
        addStatic(node, footY, index);
        y = y1;
        part += 1;
      }
    });

    // ── 明火(按火盆 / 炉子的脚线排序,人站到火前面会挡住它)+ 火星 ──
    scene.flames.forEach((f, i) => {
      const footY = f.foot ?? f.y;
      const node = host.addChildPlainNode(entities, `SceneFlame_${i}`, f.x, footY, f.w, f.h);
      const art = host.addChildPlainNode(node, 'Art', 0, f.y - footY + f.h / 2, f.w, f.h);
      const sprite = art.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = dot;
      art.getComponent(UITransform)?.setContentSize(new Size(f.w, f.h));
      applyWorldShader(sprite, 'flame');
      addStatic(node, footY);
      addCull(node, f.x - f.w, f.x + f.w, footY - 40, f.y + f.h + 40);
      this.flameBoxes.push({ node, x0: f.x - f.w / 2, x1: f.x + f.w / 2, y0: Math.min(footY, f.y), y1: f.y + f.h, foot: footY });
      for (let k = 0; k < (f.embers ?? 0); k += 1) {
        this.addMote(host, root, dot, 'ember', f.x, f.y + f.h * 0.35, 7);
      }
    });

    // ── 光晕 + 绕灯飞蛾 ──
    scene.glows.forEach((g, i) => {
      const node = host.addChildPlainNode(root, `Glow_${i}`, g.x, g.y, g.r * 2, g.r * 2);
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = dot;
      node.getComponent(UITransform)?.setContentSize(new Size(g.r * 2, g.r * 2));
      sprite.color = rgba(g.color[0], g.color[1], g.color[2]);
      applyAdditive(sprite);
      const op = node.addComponent(UIOpacity);
      op.opacity = g.alpha;
      this.glows.push({ op, base: g.alpha, flicker: g.flicker, seed: this.rand() * 40 });
      addCull(node, g.x - g.r, g.x + g.r, g.y - g.r, g.y + g.r);
      for (let k = 0; k < (g.moths ?? 0); k += 1) {
        this.addMote(host, root, dot, 'moth', g.x, g.y, 9);
      }
    });

    // ── 烟囱烟 + 薄雾:按贴图分三轮建(同一张贴图的节点相邻才能合批;烟团之间谁先画无所谓)──
    const mistSpecs: Array<{ x: number; y: number; w: number; v: number }> = [];
    if (scene.mist) {
      for (let i = 0; i < MIST_COUNT; i += 1) {
        const w = 1100 + this.rand() * 600;
        const x = (this.rand() - 0.5) * (def.width + w);
        const y = (i / (MIST_COUNT - 1) - 0.5) * def.height * 0.9 + (this.rand() - 0.5) * 120;
        mistSpecs.push({ x, y, w, v: (10 + this.rand() * 10) * (i % 2 === 0 ? 1 : -1) });
      }
    }
    for (let tex = 0; tex < FOG_ASSETS.length; tex += 1) {
      scene.smokes.forEach((smoke, i) => {
        for (let k = 0; k < SMOKE_PUFFS; k += 1) {
          if ((i + k) % FOG_ASSETS.length !== tex) {
            continue;
          }
          const sprite = host.addSprite(`Smoke_${i}_${k}`, FOG_ASSETS[tex], smoke.x, smoke.y, smoke.size, smoke.size * 0.82, root);
          if (!sprite) {
            continue;
          }
          sprite.color = rgba(smoke.tint[0], smoke.tint[1], smoke.tint[2]);
          const op = sprite.node.addComponent(UIOpacity);
          op.opacity = 0;
          const life = 6 + this.rand() * 2.5;
          this.puffs.push({ node: sprite.node, op, sx: smoke.x, sy: smoke.y, size: smoke.size, age: (k / SMOKE_PUFFS) * life, life, drift: 10 + this.rand() * 12, rise: 30 + this.rand() * 14, spin: (this.rand() - 0.5) * 16 });
        }
      });
      // 薄雾:几大片很淡的云团慢慢横移
      mistSpecs.forEach((m, i) => {
        if (!scene.mist || i % FOG_ASSETS.length !== tex) {
          return;
        }
        const sprite = host.addSprite(`Mist_${i}`, FOG_ASSETS[tex], m.x, m.y, m.w, m.w * 0.46, root);
        if (!sprite) {
          return;
        }
        sprite.color = rgba(scene.mist.tint[0], scene.mist.tint[1], scene.mist.tint[2]);
        sprite.node.addComponent(UIOpacity).opacity = scene.mist.alpha;
        this.mists.push({ node: sprite.node, x: m.x, y: m.y, w: m.w, v: m.v });
      });
    }

    // ── 飘雪 ──
    for (let i = 0; i < (scene.snow ?? 0); i += 1) {
      this.addMote(host, root, dot, 'snow', 0, 0, 7 + this.rand() * 7);
    }

    // ── 站着的人:静态图 + 原地呼吸 ──
    scene.idlers.forEach((n, i) => {
      const node = host.addChildPlainNode(entities, `SceneIdler_${i}`, n.x, n.y, 100, n.height);
      const sprite = host.addSprite('Art', n.asset, 0, 0, 100, n.height, node);
      if (!sprite) {
        node.destroy();
        return;
      }
      const frame = sprite.spriteFrame;
      const w = n.height * ((frame?.originalSize.width ?? 1) / Math.max(1, frame?.originalSize.height ?? 1));
      const ui = sprite.node.getComponent(UITransform);
      ui?.setContentSize(new Size(w, n.height));
      ui?.setAnchorPoint(0.5, 0);
      sprite.node.setPosition(0, 0, 0);
      const sx = n.flip ? -1 : 1;
      sprite.node.setScale(sx, 1, 1);
      if (def.actorTint) {
        sprite.color = rgba(def.actorTint[0], def.actorTint[1], def.actorTint[2]);
      }
      const shadow = node.addComponent(Graphics);
      shadow.fillColor = rgba(0, 0, 0, 105);
      shadow.ellipse(0, 2, w * 0.34, 9);
      shadow.fill();
      const period = 1.5 + this.rand() * 0.6;
      tween(sprite.node).delay(this.rand() * 1.5).repeatForever(
        tween<Node>().to(period, { scale: new Vec3(sx * 1.01, 1.022, 1) }, { easing: 'sineInOut' }).to(period, { scale: new Vec3(sx, 1, 1) }, { easing: 'sineInOut' }),
      ).start();
      addStatic(node, n.y);
      addCull(node, n.x - w, n.x + w, n.y - 40, n.y + n.height + 40);
    });

    // ── 走动的人 / 动物 ──
    scene.walkers.forEach((cfg, i) => {
      const [x, y] = cfg.route[0];
      const node = host.addChildPlainNode(entities, `SceneWalker_${i}`, x, y, 120, cfg.height);
      const shadow = node.addComponent(Graphics);
      shadow.fillColor = rgba(0, 0, 0, 100);
      shadow.ellipse(0, 2, cfg.height * 0.2, cfg.perch === undefined ? 9 : 0.01);
      shadow.fill();
      const art = host.addChildPlainNode(node, 'Spine', 0, 0, 200, 200);
      const skeleton = art.addComponent(sp.Skeleton);
      skeleton.premultipliedAlpha = false;
      const walker: Walker = { cfg, node, art, skeleton: null, x, y, idx: cfg.route.length > 1 ? 1 : 0, dir: 1, wait: this.rand() * 2, moving: false, facing: 1, base: 1, idle: '', move: '' };
      this.walkers.push(walker);
      loadSharedSpineData(cfg.spine, null, 'TownScene', (data) => {
        if (!data || !node.isValid || !art.isValid) {
          return;
        }
        try {
          const runtimeData = resolveBattleUnitSpineRuntimeData(data);
          if (runtimeData) {
            patchBattleUnitSpineRuntimeEnums(data, runtimeData);
          }
          skeleton.skeletonData = data;
          const skin = runtimeData ? resolveBattleUnitSpineSkinName(data, runtimeData) : null;
          if (skin) {
            skeleton.setSkin(skin);
            skeleton.setSlotsToSetupPose();
          }
          const runtime = data.getRuntimeData(true) as unknown as { height?: number; animations?: Array<{ name: string }> } | null;
          const names = (runtime?.animations ?? []).map((item) => item.name);
          walker.idle = names.find((name) => name === 'idle') ?? names[0] ?? '';
          walker.move = names.find((name) => name === 'run_b') ?? names.find((name) => name === 'run_h') ?? walker.idle;
          const dir = cfg.spine.split('/')[2] ?? '';
          walker.base = (cfg.height * (GUARD_MONSTER_DB_SCALE[dir] ?? 1)) / Math.max(40, runtime?.height ?? 200);
          art.setScale(walker.base * walker.facing, walker.base, 1);
          if (def.actorTint) {
            skeleton.color = rgba(def.actorTint[0], def.actorTint[1], def.actorTint[2]);
          }
          walker.skeleton = skeleton;
          if (walker.idle) {
            skeleton.setAnimation(0, walker.idle, true);
          }
        } catch (error) {
          console.warn('[TownScene] walker spine failed', cfg.spine, error);
        }
      });
    });
    return true;
  }

  /** 走动的人(脚线每帧在变):给渲染层排序用。 */
  sortables(): Array<{ node: Node; y: number }> {
    const out: Array<{ node: Node; y: number }> = [];
    for (const w of this.walkers) {
      if (w.node.isValid && w.node.active) {
        out.push({ node: w.node, y: w.cfg.perch ?? w.y });
      }
    }
    return out;
  }

  /**
   * 每帧(排序之前)调:只打开「挡在某个东西前面、且和它有重叠」的遮挡条,其余关掉。
   * boxes = 队伍 / 镜头里的 NPC / 怪;走动的人和明火由这一层自己补上。view = 镜头范围(带余量),外面的走动的人直接不画。
   */
  occlude(boxes: OccludeBox[], view: { x0: number; x1: number; y0: number; y1: number }): void {
    if (!this.root || !this.root.isValid) {
      return;
    }
    this.frame += 1;
    const mark = this.frame;
    const live: Strip[] = [];
    const colW = this.stripColW;
    const left = this.stripLeft;
    const cols = this.stripCols;
    const visit = (x0: number, x1: number, y0: number, y1: number, foot: number): void => {
      const c0 = Math.max(0, Math.floor((x0 - left) / colW));
      const c1 = Math.min(cols.length - 1, Math.floor((x1 - left) / colW));
      for (let c = c0; c <= c1; c += 1) {
        const list = cols[c];
        if (!list) {
          continue;
        }
        for (const s of list) {
          if (s.mark !== mark && s.foot < foot && s.y1 > y0 && s.y0 < y1) {
            s.mark = mark;
            live.push(s);
            if (!s.on) {
              s.on = true;
              s.node.active = true;
            }
          }
        }
      }
    };
    for (const b of boxes) {
      visit(b.x0, b.x1, b.y0, b.y1, b.foot);
    }
    for (const w of this.walkers) {
      const h = w.cfg.height;
      const on = w.x + h > view.x0 && w.x - h < view.x1 && w.y + h * 1.4 > view.y0 && w.y - 60 < view.y1;
      if (w.node.isValid && w.node.active !== on) {
        // 关着的时候位置 / 动作照常推进(stepWalker 不看节点开关),重新进镜头直接接上
        w.node.active = on;
      }
      if (on) {
        const foot = w.cfg.perch ?? w.y;
        visit(w.x - h * 0.6, w.x + h * 0.6, Math.min(foot, w.y) - 10, w.y + h * 1.25, foot);
      }
    }
    for (const f of this.flameBoxes) {
      if (f.node.isValid && f.node.active) {
        visit(f.x0, f.x1, f.y0, f.y1, f.foot);
      }
    }
    for (const s of this.liveStrips) {
      if (s.mark !== mark) {
        s.on = false;
        s.node.active = false;
      }
    }
    this.liveStrips = live;
  }

  step(dt: number): void {
    if (!this.root || !this.root.isValid) {
      return;
    }
    this.t += dt;
    const t = this.t;
    for (const g of this.glows) {
      const n = Math.sin(t * 7.3 + g.seed) * 0.5 + Math.sin(t * 13.1 + g.seed * 2.7) * 0.3 + Math.sin(t * 2.9 + g.seed * 1.3) * 0.2;
      g.op.opacity = Math.max(0, Math.min(255, Math.round(g.base * (1 + g.flicker * n))));
    }
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.life) {
        p.age -= p.life;
      }
      const k = p.age / p.life;
      p.node.setPosition(p.sx + p.drift * p.age + Math.sin(t * 0.7 + p.life * 3) * 6, p.sy + p.rise * p.age, 0);
      const s = 0.22 + k * 0.85;
      p.node.setScale(s, s, 1);
      p.node.angle += p.spin * dt;
      p.op.opacity = Math.round(56 * Math.pow(Math.sin(Math.PI * k), 0.8));
    }
    for (const m of this.mists) {
      m.x += m.v * dt;
      const half = (this.mapW + m.w) / 2;
      if (m.x > half) {
        m.x = -half;
      } else if (m.x < -half) {
        m.x = half;
      }
      m.node.setPosition(m.x, m.y + Math.sin(t * 0.13 + m.w) * 18, 0);
    }
    for (const m of this.motes) {
      this.stepMote(m, dt, t);
    }
    for (const w of this.walkers) {
      this.stepWalker(w, dt);
    }
  }

  private stepMote(m: Mote, dt: number, t: number): void {
    m.age += dt;
    if (m.kind === 'moth') {
      // 绕灯乱飞:两个不同频率的正弦叠出 8 字 + 抖动
      const a = t * (1.6 + m.seed * 0.5) + m.seed * 9;
      m.x = m.cx + Math.cos(a) * (26 + m.seed * 30) + Math.sin(t * 5.1 + m.seed * 7) * 6;
      m.y = m.cy + Math.sin(a * 1.7) * (18 + m.seed * 16) + Math.cos(t * 4.3 + m.seed * 3) * 5;
      m.op.opacity = Math.round(m.peak * (0.55 + 0.45 * Math.sin(t * 9 + m.seed * 20)));
    } else if (m.kind === 'ember') {
      if (m.age >= m.life) {
        m.age = 0;
        m.life = 0.9 + this.rand() * 1.2;
        m.x = m.cx + (this.rand() - 0.5) * 26;
        m.y = m.cy;
        m.vx = (this.rand() - 0.5) * 40;
        m.vy = 70 + this.rand() * 80;
      }
      m.x += (m.vx + Math.sin(t * 6 + m.seed * 9) * 22) * dt;
      m.y += m.vy * dt;
      m.op.opacity = Math.round(m.peak * (1 - m.age / m.life));
    } else {
      // 雪:慢慢往下飘,带一点横摆;出了地图下沿从上面重来
      m.x += (m.vx + Math.sin(t * 0.9 + m.seed * 12) * 14) * dt;
      m.y += m.vy * dt;
      if (m.y < -this.mapH / 2 - 30) {
        m.y = this.mapH / 2 + 30;
        m.x = (this.rand() - 0.5) * (this.mapW + 200);
      }
      if (m.x > this.mapW / 2 + 120) {
        m.x -= this.mapW + 240;
      }
    }
    m.node.setPosition(m.x, m.y, 0);
  }

  private stepWalker(w: Walker, dt: number): void {
    const route = w.cfg.route;
    let moving = false;
    if (w.wait > 0) {
      w.wait -= dt;
    } else if (route.length > 1) {
      const [tx, ty] = route[w.idx];
      const dx = tx - w.x;
      const dy = ty - w.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        // 到点:停一会儿,再去下一个点(走到头折返)
        w.wait = w.cfg.pause[0] + this.rand() * (w.cfg.pause[1] - w.cfg.pause[0]);
        if (w.idx + w.dir < 0 || w.idx + w.dir >= route.length) {
          w.dir = (w.dir === 1 ? -1 : 1);
        }
        w.idx += w.dir;
      } else {
        const step = Math.min(dist, w.cfg.speed * dt);
        w.x += (dx / dist) * step;
        w.y += (dy / dist) * step;
        if (Math.abs(dx) > 4) {
          w.facing = dx > 0 ? 1 : -1;
        }
        moving = true;
      }
    }
    w.node.setPosition(w.x, w.y, 0);
    const sk = w.skeleton;
    if (!sk || !sk.isValid) {
      return;
    }
    w.art.setScale(w.base * w.facing, w.base, 1);
    if (moving !== w.moving) {
      w.moving = moving;
      const anim = moving ? w.move : w.idle;
      if (anim) {
        sk.setAnimation(0, anim, true);
      }
      sk.timeScale = moving ? (w.cfg.timeScale ?? 0.6) : 1;
    }
  }

  private addMote(host: TownSceneHost, root: Node, dot: SpriteFrame, kind: Mote['kind'], cx: number, cy: number, size: number): void {
    const node = host.addChildPlainNode(root, `Mote_${kind}_${this.motes.length}`, cx, cy, size, size);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = dot;
    node.getComponent(UITransform)?.setContentSize(new Size(size, size));
    const op = node.addComponent(UIOpacity);
    const mote: Mote = { node, op, kind, cx, cy, x: cx, y: cy, vx: 0, vy: 0, age: 0, life: 0, seed: this.rand(), peak: 200 };
    if (kind === 'snow') {
      sprite.color = rgba(232, 238, 250);
      mote.x = (this.rand() - 0.5) * (this.mapW + 200);
      mote.y = (this.rand() - 0.5) * (this.mapH + 60);
      mote.vx = 8 + this.rand() * 14;
      mote.vy = -(34 + this.rand() * 36);
      mote.peak = 110 + this.rand() * 90;
      op.opacity = Math.round(mote.peak);
    } else {
      sprite.color = kind === 'ember' ? rgba(255, 170, 70) : rgba(255, 232, 170);
      applyAdditive(sprite);
      mote.peak = kind === 'ember' ? 230 : 170;
      // 火星错开起跑
      mote.life = 1;
      mote.age = 1 + this.rand();
      op.opacity = 0;
    }
    this.motes.push(mote);
  }

  private clear(): void {
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
    this.glows = [];
    this.puffs = [];
    this.mists = [];
    this.motes = [];
    this.walkers = [];
    this.flameBoxes = [];
    this.stripCols = [];
    this.liveStrips = [];
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
