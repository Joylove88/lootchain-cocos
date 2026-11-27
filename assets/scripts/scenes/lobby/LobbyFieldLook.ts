import { Color, Material, Node, resources, Size, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform, Vec4 } from 'cc';
import { applyAdditive } from './LobbyWorldShaders';

/**
 * 野外画质看齐守卫战(2026-11-20 用户:「守卫战画质很精细,野外差远了」→ 看完原型「按原型开做」)。
 * 诊断:野外不是不清晰,是太碎、太艳、没有光源,人物被地面吞掉。这里按原型(tools/qa/field_look_proto.py,LOOKS 同一组数值)做:
 *   ① 地面材质的高频细节离线收掉(tools/qa/field_tex_calm.py,不在这里)
 *   ② 地面着色器调色:饱和度 / 亮度 / S 曲线 / 分色(暗部偏冷、亮部偏暖)+ 光照图 + 斜向光柱 + 队伍光区(effects/world-ground lookA / toneLo / toneHi)
 *   ③ 光照图:整图一张低分辨率贴图(运行时按种子生成,树荫冷暗、透下来的光斑暖亮;荒原 = 大块云影),
 *      地面在着色器里乘;立物按脚下那一点的光照给精灵乘色(建时算一次,不加绘制)
 *   ④ 暗角 + 屏幕上方远处空气感:一张 128×64 的渐变图铺满屏幕,盖在世界层最上面(1 次绘制;只盖世界,不盖界面)
 *   ⑤ 发光点缀:枯木林鬼火(叠加混合共用一份材质,同贴图合批;只动镜头附近的)
 * 没登记的地图(主城)全部不动。
 */
export interface FieldLookDef {
  /** 地面饱和度 / 亮度倍数、S 曲线强度。 */
  sat: number;
  val: number;
  contrast: number;
  /** 分色调色:暗部 / 亮部乘子。 */
  shadowTint: [number, number, number];
  hiTint: [number, number, number];
  /** 光照图:暗处 / 光斑颜色乘子,光斑尺度(世界单位),光斑边缘硬度;不给 shade = 不用光照图(晨风村)。 */
  shade?: [number, number, number];
  sun?: [number, number, number];
  lightScale?: number;
  patch?: number;
  /** 队伍光区强度、斜向光柱强度。 */
  pool: number;
  rays: number;
  /** 暗角强度;远处空气感颜色 + 强度。 */
  vig: number;
  haze: [number, number, number, number];
  /** 没有多层地表的地图(晨风村平铺底纹):底纹精灵乘色。 */
  tileTint?: [number, number, number];
  /** 鬼火:个数 / 颜色。 */
  wisps?: { count: number; color: [number, number, number] };
}

export const FIELD_LOOKS: Record<string, FieldLookDef> = {
  WOODS: {
    sat: 0.9, val: 0.8, contrast: 0.22, shadowTint: [0.8, 0.94, 0.98], hiTint: [1.08, 1.02, 0.9],
    shade: [0.74, 0.82, 0.86], sun: [1.3, 1.18, 0.95], lightScale: 170, patch: 7, pool: 0.22, rays: 1,
    vig: 0.45, haze: [170, 188, 176, 0.1],
  },
  GRAY: {
    sat: 1.0, val: 0.74, contrast: 0.26, shadowTint: [0.82, 0.88, 1.0], hiTint: [1.1, 1.03, 0.92],
    shade: [0.7, 0.76, 0.88], sun: [1.18, 1.1, 0.96], lightScale: 420, patch: 3, pool: 0.18, rays: 0,
    vig: 0.4, haze: [196, 202, 214, 0.1],
  },
  DEADWOOD: {
    // 实机比原型偏暖(原型另有一条雾带):饱和度再降、空气感加重;鬼火 110 个时一屏平均不到 2 个,加到 220
    sat: 0.6, val: 0.88, contrast: 0.16, shadowTint: [0.8, 0.92, 1.0], hiTint: [1.02, 1.04, 1.0],
    shade: [0.78, 0.86, 0.92], sun: [1.14, 1.12, 1.04], lightScale: 320, patch: 3, pool: 0.26, rays: 0,
    vig: 0.36, haze: [168, 184, 188, 0.22], wisps: { count: 220, color: [120, 230, 200] },
  },
  VILLAGE: {
    sat: 0.92, val: 0.9, contrast: 0.18, shadowTint: [0.86, 0.94, 1.0], hiTint: [1.08, 1.03, 0.92],
    pool: 0.12, rays: 1, vig: 0.34, haze: [214, 208, 192, 0.08], tileTint: [236, 232, 222],
  },
};

/**
 * 整图重绘的地图(11-20 林地):光影 / 投影 / 颜色都已经画进重绘图,地面着色器和立物乘色用不上;
 * 只留很轻的暗角 + 远处空气感,不要鬼火。11-27 用户「整体偏暗 / 发灰」→ 暗角约减四成、空气雾减半。
 */
const PAINTED_LOOKS: Record<string, FieldLookDef> = {
  WOODS: {
    sat: 1, val: 1, contrast: 0, shadowTint: [1, 1, 1], hiTint: [1, 1, 1], pool: 0, rays: 0,
    vig: 0.18, haze: [170, 188, 176, 0.03],
  },
  GRAY: {
    sat: 1, val: 1, contrast: 0, shadowTint: [1, 1, 1], hiTint: [1, 1, 1], pool: 0, rays: 0,
    vig: 0.18, haze: [196, 202, 214, 0.03],
  },
  // 枯木林保留鬼火(气氛件,不是调色)
  DEADWOOD: {
    sat: 1, val: 1, contrast: 0, shadowTint: [1, 1, 1], hiTint: [1, 1, 1], pool: 0, rays: 0,
    vig: 0.22, haze: [168, 184, 188, 0.07], wisps: { count: 220, color: [120, 230, 200] },
  },
  // 晨风村只重画了地面(建筑 / 树照旧实时画),立物不乘色
  VILLAGE: {
    sat: 1, val: 1, contrast: 0, shadowTint: [1, 1, 1], hiTint: [1, 1, 1], pool: 0, rays: 0,
    vig: 0.16, haze: [214, 208, 192, 0.03],
  },
};

const LIGHT_W = 1024;
const LIGHT_H = 512;
const MOTE = 'ui/world/fx/mote/spriteFrame';

interface LightMap {
  tex: Texture2D;
  /** 光照 × 0.5 × 255(RGB,每像素 4 字节,行 0 = 地图北边)。 */
  data: Uint8Array;
  w: number;
  h: number;
}

const lightCache = new Map<string, LightMap>();
const overlayCache = new Map<string, SpriteFrame>();

function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 值噪声(格点随机 + smoothstep 插值),x / y 以格为单位。 */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function makeTexture(data: Uint8Array, w: number, h: number): Texture2D {
  const tex = new Texture2D();
  tex.reset({ width: w, height: h, format: Texture2D.PixelFormat.RGBA8888 });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  tex.uploadData(data);
  return tex;
}

/** 光照图(按地图缓存):光斑 = 两层值噪声,按 patch 收紧边缘;mapW / mapH = 地图世界尺寸。 */
function buildLight(code: string, mapW: number, mapH: number, look: FieldLookDef): LightMap | null {
  if (!look.shade || !look.sun) {
    return null;
  }
  const hit = lightCache.get(code);
  if (hit) {
    return hit;
  }
  const w = LIGHT_W;
  const h = LIGHT_H;
  const data = new Uint8Array(w * h * 4);
  const scale = look.lightScale ?? 300;
  const patch = look.patch ?? 3;
  const [sr, sg, sb] = look.shade;
  const [ur, ug, ub] = look.sun;
  const seed = code.length * 131 + code.charCodeAt(0);
  for (let y = 0; y < h; y += 1) {
    const wy = (y / h) * mapH;
    for (let x = 0; x < w; x += 1) {
      const wx = (x / w) * mapW;
      let n = valueNoise(wx / scale, wy / scale, seed) * 0.7 + valueNoise(wx / (scale / 3), wy / (scale / 3), seed + 7) * 0.3;
      // 值噪声集中在中间:先拉开到接近 0~1(原型用的是整图最大最小归一),再按 patch 收紧边缘
      n = (n - 0.5) * 1.7 + 0.5;
      const lit = Math.max(0, Math.min(1, (n - 0.5) * patch + 0.5));
      const i = (y * w + x) * 4;
      data[i] = Math.min(255, Math.round((sr + (ur - sr) * lit) * 127.5));
      data[i + 1] = Math.min(255, Math.round((sg + (ug - sg) * lit) * 127.5));
      data[i + 2] = Math.min(255, Math.round((sb + (ub - sb) * lit) * 127.5));
      data[i + 3] = 255;
    }
  }
  const map = { tex: makeTexture(data, w, h), data, w, h };
  lightCache.set(code, map);
  return map;
}

/**
 * 暗角 + 远处空气感的叠加图(128×64,按地图缓存)。逐像素按「先雾后暗角」合成成一张普通透明图:
 * 结果 = 底 × (1 − A) + C,A = 1 − (1 − 雾)(1 − 暗角),C = 雾色 × 雾 × (1 − 暗角);存 C / A 和 A(精灵默认混合正好还原)。
 */
function buildOverlay(code: string, look: FieldLookDef): SpriteFrame {
  const hit = overlayCache.get(code);
  if (hit) {
    return hit;
  }
  const w = 128;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  const [hr, hg, hb, ha] = look.haze;
  for (let y = 0; y < h; y += 1) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const u = (x + 0.5) / w;
      const r = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
      const vg = look.vig * Math.pow(Math.min(1, r / 1.3), 2.4);
      const far = Math.pow(Math.max(0, 1 - v / 0.5), 1.8);
      const hz = far * ha;
      const a = 1 - (1 - hz) * (1 - vg);
      const k = a > 1e-4 ? (hz * (1 - vg)) / a : 0;
      const i = (y * w + x) * 4;
      data[i] = Math.round(hr * k);
      data[i + 1] = Math.round(hg * k);
      data[i + 2] = Math.round(hb * k);
      data[i + 3] = Math.round(a * 255);
    }
  }
  const frame = new SpriteFrame();
  frame.texture = makeTexture(data, w, h);
  overlayCache.set(code, frame);
  return frame;
}

interface Wisp {
  node: Node;
  glow: UIOpacity;
  core: UIOpacity;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export class FieldLook {
  private code = '';
  private def: FieldLookDef | null = null;
  private light: LightMap | null = null;
  private mapW = 1;
  private mapH = 1;
  private overlay: Node | null = null;
  private wisps: Wisp[] = [];
  private wispRoot: Node | null = null;
  private wispLoading = false;

  /** 进图 / 换图时调(建世界之前):光照图同步生成并缓存;没登记的地图返回 false。 */
  prepare(code: string, mapW: number, mapH: number, painted = false): boolean {
    const key = painted ? `${code}#paint` : code;
    if (this.code !== key) {
      this.code = key;
      // ?fieldlook=0:关掉(性能 / 观感 A/B 对比用;地面材质的离线降噪不受影响)
      const off = typeof location !== 'undefined' && /[?&]fieldlook=0(&|$)/.test(location.search);
      this.def = off ? null : (painted ? PAINTED_LOOKS[code] : FIELD_LOOKS[code]) ?? null;
      this.mapW = mapW;
      this.mapH = mapH;
      this.light = this.def ? buildLight(key, mapW, mapH, this.def) : null;
    }
    return !!this.def;
  }

  get active(): boolean {
    return !!this.def;
  }

  /** 多层地表材质(按地图缓存的那一份)上设调色 / 光照图;地面自带的暗角关掉(改由屏幕叠加图统一做)。 */
  applyGround(material: Material): void {
    const d = this.def;
    if (!d) {
      return;
    }
    material.setProperty('lookA', new Vec4(d.sat, d.val, d.contrast, this.light ? 1 : 0));
    material.setProperty('toneLo', new Vec4(d.shadowTint[0], d.shadowTint[1], d.shadowTint[2], d.rays));
    material.setProperty('toneHi', new Vec4(d.hiTint[0], d.hiTint[1], d.hiTint[2], d.pool));
    material.setProperty('grade', new Vec4(0.10, 0, 1.06, 0));
    if (this.light) {
      material.setProperty('lightTex', this.light.tex);
    }
  }

  /** 世界坐标处的光照乘子(0~2,1 = 不变)。 */
  private lightAt(x: number, y: number): [number, number, number] {
    const m = this.light;
    if (!m) {
      return [1, 1, 1];
    }
    const px = Math.max(0, Math.min(m.w - 1, Math.round((x / this.mapW + 0.5) * m.w)));
    const py = Math.max(0, Math.min(m.h - 1, Math.round((0.5 - y / this.mapH) * m.h)));
    const i = (py * m.w + px) * 4;
    return [m.data[i] / 127.5, m.data[i + 1] / 127.5, m.data[i + 2] / 127.5];
  }

  /**
   * 立物 / 贴地件乘色(0~255):和地面一样吃亮度 + 分色 + 光照,否则在调过色的地面上像一块没调过的贴纸;
   * 精灵乘色不能提亮,所以超过 1 的部分(光斑里)截到原色。
   */
  propColor(x: number, y: number, flat: boolean, base?: [number, number, number]): Color | null {
    const d = this.def;
    if (!d) {
      return null;
    }
    const [lr, lg, lb] = this.lightAt(x, y);
    // 原型里亮度 / 分色作用在整个画面(地面 + 立物)上:立物多是中间调,分色按暗部 1/4、亮部 3/4 取
    const tone = (i: number): number => d.val * (d.shadowTint[i] * 0.25 + d.hiTint[i] * 0.75);
    const [br, bgc, bb] = base ?? [255, 255, 255];
    const c = (b: number, l: number, i: number): number => Math.round(Math.max(0, Math.min(255, b * Math.min(1, l * tone(i)))));
    void flat;
    return new Color(c(br, lr, 0), c(bgc, lg, 1), c(bb, lb, 2), 255);
  }

  /** 平铺底纹(晨风村)乘色;没配返回 null。 */
  tileColor(): Color | null {
    const t = this.def?.tileTint;
    return t ? new Color(t[0], t[1], t[2], 255) : null;
  }

  /** 世界层最上面挂屏幕叠加图 + 鬼火层;世界重建后重挂。view = 镜头看到的世界宽高。 */
  mount(world: Node, camX: number, camY: number, viewW: number, viewH: number): void {
    const d = this.def;
    if (!d || !world.isValid) {
      return;
    }
    if (d.wisps && !world.getChildByName('FieldWisps')) {
      this.mountWisps(world, d.wisps);
    }
    if (!this.overlay || !this.overlay.isValid || this.overlay.parent !== world) {
      const node = new Node('FieldLookOverlay');
      node.layer = world.layer;
      node.addComponent(UITransform).setContentSize(new Size(viewW, viewH));
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = buildOverlay(this.code, d);
      world.addChild(node);
      this.overlay = node;
    }
    this.overlay.setSiblingIndex(world.children.length - 1);
    this.follow(camX, camY, viewW, viewH);
  }

  /** 叠加图跟镜头(每帧);视口变了顺带改尺寸(略放大一圈,震屏时边缘不露)。 */
  follow(camX: number, camY: number, viewW: number, viewH: number): void {
    const node = this.overlay;
    if (!node || !node.isValid) {
      return;
    }
    node.setPosition(camX, camY, 0);
    const tf = node.getComponent(UITransform)!;
    const w = viewW * 1.04;
    const h = viewH * 1.04;
    if (Math.abs(tf.width - w) > 1 || Math.abs(tf.height - h) > 1) {
      tf.setContentSize(new Size(w, h));
    }
  }

  private mountWisps(world: Node, cfg: { count: number; color: [number, number, number] }): void {
    const frame = resources.get(MOTE, SpriteFrame);
    if (!frame) {
      if (!this.wispLoading) {
        this.wispLoading = true;
        resources.load(MOTE, SpriteFrame, () => {
          this.wispLoading = false;
        });
      }
      return;
    }
    const root = new Node('FieldWisps');
    root.layer = world.layer;
    root.addComponent(UITransform).setContentSize(new Size(10, 10));
    world.addChild(root);
    this.wispRoot = root;
    this.wisps = [];
    const [r, g, b] = cfg.color;
    const seed = 97;
    for (let i = 0; i < cfg.count; i += 1) {
      const x = (hash(i, 1, seed) - 0.5) * this.mapW * 0.92;
      const y = (hash(i, 2, seed) - 0.5) * this.mapH * 0.92;
      const node = new Node('Wisp');
      node.layer = world.layer;
      node.addComponent(UITransform).setContentSize(new Size(10, 10));
      root.addChild(node);
      node.setPosition(x, y, 0);
      const mk = (name: string, size: number, alpha: number): UIOpacity => {
        const n = new Node(name);
        n.layer = world.layer;
        n.addComponent(UITransform).setContentSize(new Size(size, size));
        const s = n.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM;
        s.spriteFrame = frame;
        s.color = new Color(r, g, b, alpha);
        applyAdditive(s);
        node.addChild(n);
        return n.addComponent(UIOpacity);
      };
      // 实机量:mote 贴图亮芯很小,核心 24 时屏上只有几个像素 → 核心 56、光晕 380(照亮脚下一小片地)
      const glow = mk('Glow', 380, 110);
      const core = mk('Core', 56, 255);
      node.active = false;
      this.wisps.push({ node, glow, core, x, y, phase: hash(i, 3, seed) * Math.PI * 2, speed: 0.6 + hash(i, 4, seed) * 0.6 });
    }
  }

  /** 每帧:叠加图跟镜头;镜头附近的鬼火上下浮动 + 呼吸闪,远处的关掉。 */
  step(camX: number, camY: number, viewW: number, viewH: number, world: Node | null): void {
    if (!this.def) {
      return;
    }
    if (this.def.wisps && world && world.isValid && (!this.wispRoot || !this.wispRoot.isValid)) {
      this.mountWisps(world, this.def.wisps);
      this.overlay?.isValid && this.overlay.setSiblingIndex(world.children.length - 1);
    }
    this.follow(camX, camY, viewW, viewH);
    if (this.wisps.length === 0) {
      return;
    }
    const t = Date.now() / 1000;
    const hw = viewW / 2 + 260;
    const hh = viewH / 2 + 260;
    for (const w of this.wisps) {
      const on = Math.abs(w.x - camX) < hw && Math.abs(w.y - camY) < hh;
      if (w.node.active !== on) {
        w.node.active = on;
      }
      if (!on) {
        continue;
      }
      const p = t * w.speed + w.phase;
      w.node.setPosition(w.x + Math.sin(p * 0.7) * 18, w.y + Math.sin(p) * 14, 0);
      const pulse = 0.55 + 0.45 * Math.sin(p * 1.9) * Math.sin(p * 0.83 + 1.1);
      w.glow.opacity = Math.round(255 * Math.max(0.15, pulse));
      w.core.opacity = Math.round(255 * Math.max(0.3, pulse));
    }
  }

  /** 换图 / 离开野外:节点随世界一起销毁,这里只清引用。 */
  reset(): void {
    this.overlay = null;
    this.wisps = [];
    this.wispRoot = null;
  }
}
