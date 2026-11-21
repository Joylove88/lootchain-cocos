import { builtinResMgr, Color, gfx, Material, Node, Size, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform } from 'cc';
import { applyAdditive } from './LobbyWorldShaders';
import { ASSET_GLOWS, MAP_LIGHTS } from './LobbyFieldGlowData';
import type { WorldMapDef } from './LobbyWorldMaps';

/**
 * 野外昼夜循环(2026-11-21 用户看了 A 午后斜阳 / B 黄昏暗调两张原型:「A 和 B 都可以,随着时间变化自动切换」)。
 * 起因:和守卫图比,野外差在光太平、颜色太艳、没有光源(饱和度高 60%,大块明暗起伏只有一半),不是画得不细。
 * 全部是盖在世界层上的几张全屏图 + 一批叠加光晕,建筑 / 树 / 人物一起被照到,不重画图块:
 *   ① TodWash 普通混合的薄色层:压饱和、把暗部抬成冷色
 *   ② TodMul  正片叠底:整体压暗 / 偏色 + 中间亮四周暗(白天轻、黄昏重)
 *   ③ TodGlow 叠加混合:黄昏时窗户 / 路灯 / 炉火点亮(贴图上的位置见 LobbyFieldGlowData)+ 地上的暖色光圈 + 队伍身上一圈光
 *   ④ TodSun  叠加混合:白天从左上斜照进来的暖光 + 光柱(慢慢飘)
 *   ⑤ 投影(白天):建筑 / 树 / 路灯的长投影由渲染器建(Cast_ 组),这里按时间调整体浓淡;队伍脚下另加一条斜长影子
 * 时间按真实时钟循环(所有玩家同一时刻看到的一样),一圈 CYCLE 秒;?tod=0~1 固定在某个时刻(0 = 白天,1 = 黄昏)。
 */
interface TodLook {
  /** 薄色层 rgb(0~1) + 不透明度。 */
  wash: [number, number, number, number];
  /** 正片叠底乘子(0~1)。 */
  mul: [number, number, number];
}

interface TodDef {
  day: TodLook;
  dusk: TodLook;
  /** 白天斜照暖光强度(0~1)。 */
  sun: number;
  /** 黄昏四周压暗:正片叠底图边缘乘到多少(白天固定 0.88)。 */
  duskEdge: number;
}

const TOD_DEFS: Record<string, TodDef> = {
  // 11-21 实测对齐原型:白天亮度 = A,饱和度 0.47 → 0.36 靠薄色层压;黄昏亮度 = B,蓝通道补到 B
  VILLAGE: {
    day: { wash: [0.30, 0.31, 0.36, 0.2], mul: [1.0, 0.95, 0.88] },
    dusk: { wash: [0.10, 0.14, 0.34, 0.12], mul: [0.46, 0.46, 0.74] },
    sun: 0.55, duskEdge: 0.58,
  },
  WOODS: {
    day: { wash: [0.18, 0.24, 0.26, 0.06], mul: [0.96, 0.92, 0.82] },
    dusk: { wash: [0.10, 0.16, 0.28, 0.16], mul: [0.48, 0.52, 0.66] },
    sun: 0.32, duskEdge: 0.6,
  },
  GRAY: {
    day: { wash: [0.24, 0.26, 0.30, 0.06], mul: [0.96, 0.91, 0.82] },
    dusk: { wash: [0.14, 0.16, 0.30, 0.16], mul: [0.52, 0.50, 0.64] },
    sun: 0.26, duskEdge: 0.6,
  },
  DEADWOOD: {
    day: { wash: [0.18, 0.22, 0.24, 0.06], mul: [0.94, 0.94, 0.90] },
    dusk: { wash: [0.08, 0.14, 0.22, 0.16], mul: [0.46, 0.52, 0.60] },
    sun: 0.16, duskEdge: 0.58,
  },
};

/** 一圈 24 分钟:白天 → 2 分钟转黄昏 → 黄昏 → 2 分钟转回白天。 */
const CYCLE = 24 * 60;
const WARM: [number, number, number] = [255, 168, 86];

/**
 * 整图重绘里画死的光源(MAP_LIGHTS,11-21 用户「加光源」)按种类点亮:
 * core = 亮芯直径;pool = 地上光圈宽(高 = 宽的一半);poolY = 光圈相对光源往下挪多少;amp = 闪烁幅度(0 = 不闪)。
 */
const LIGHT_KINDS: Record<string, { color: [number, number, number]; core: number; pool: number; poolA: number; poolY: number; amp: number }> = {
  fire: { color: [255, 146, 60], core: 70, pool: 560, poolA: 0.6, poolY: 0, amp: 0.2 },
  torch: { color: [255, 166, 78], core: 44, pool: 400, poolA: 0.58, poolY: 70, amp: 0.16 },
  lantern: { color: [255, 186, 106], core: 34, pool: 300, poolA: 0.5, poolY: 60, amp: 0.12 },
  window: { color: [255, 176, 96], core: 36, pool: 260, poolA: 0.4, poolY: 50, amp: 0.1 },
  crystal: { color: [110, 160, 255], core: 56, pool: 420, poolA: 0.5, poolY: 10, amp: 0.08 },
  wisp: { color: [140, 255, 200], core: 44, pool: 380, poolA: 0.42, poolY: 0, amp: 0.22 },
  ghost: { color: [150, 200, 255], core: 70, pool: 420, poolA: 0.4, poolY: 40, amp: 0.1 },
};

interface Glow {
  node: Node;
  x: number;
  y: number;
  /** 视野裁剪用的半径(世界单位)。 */
  reach: number;
  /** 闪烁相位(炉火 / 灯笼轻微跳动);-1 = 不闪(光圈)。 */
  phase: number;
  /** 闪烁幅度(0~1)。 */
  amp: number;
  op: UIOpacity;
  base: number;
}

let whiteFrame: SpriteFrame | null = null;
let glowFrame: SpriteFrame | null = null;
let multiplyMat: Material | null = null;
const mulFrames = new Map<number, SpriteFrame>();
let sunFrame: SpriteFrame | null = null;

function makeFrame(data: Uint8Array, w: number, h: number): SpriteFrame {
  const tex = new Texture2D();
  tex.reset({ width: w, height: h, format: Texture2D.PixelFormat.RGBA8888 });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  tex.uploadData(data);
  const frame = new SpriteFrame();
  frame.texture = tex;
  return frame;
}

function white(): SpriteFrame {
  if (!whiteFrame) {
    whiteFrame = makeFrame(new Uint8Array(4 * 4 * 4).fill(255), 4, 4);
  }
  return whiteFrame;
}

/** 柔光圆点:白色,alpha 按高斯衰减(叠加混合下 = 中心亮、边缘自然散开)。 */
function glowTex(): SpriteFrame {
  if (!glowFrame) {
    const n = 64;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const d = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
        const a = d >= 1 ? 0 : Math.exp(-d * d * 4.2) * (1 - d * d);
        const i = (y * n + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.round(a * 255);
      }
    }
    glowFrame = makeFrame(data, n, n);
  }
  return glowFrame;
}

/** 正片叠底底图:中间 1,四周衰减到 edge(灰度)。 */
function mulTex(edge: number): SpriteFrame {
  const key = Math.round(edge * 100);
  const hit = mulFrames.get(key);
  if (hit) {
    return hit;
  }
  const w = 128;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const r = Math.hypot(((x + 0.5) / w - 0.5) * 2, ((y + 0.5) / h - 0.5) * 2);
      const v = 1 - (1 - edge) * Math.pow(Math.min(1, r / 1.35), 2.2);
      const i = (y * w + x) * 4;
      const c = Math.round(v * 255);
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const frame = makeFrame(data, w, h);
  mulFrames.set(key, frame);
  return frame;
}

/** 斜照暖光:左上最亮往右下衰减 + 几道斜向光柱(白色,alpha 存强度)。 */
function sunTex(): SpriteFrame {
  if (!sunFrame) {
    const w = 256;
    const h = 128;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      const v = (y + 0.5) / h;
      for (let x = 0; x < w; x += 1) {
        const u = (x + 0.5) / w;
        const g = Math.pow(Math.max(0, 1 - (u * 0.75 + v * 0.9) / 1.25), 1.5);
        const t = u * 1.0 - v * 0.55;
        const s = 0.5 + 0.5 * Math.sin(t * 28) * Math.sin(t * 11 + 1.3);
        const a = g * (0.45 + 0.55 * s);
        const i = (y * w + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.round(Math.min(1, a) * 255);
      }
    }
    sunFrame = makeFrame(data, w, h);
  }
  return sunFrame;
}

function applyMultiply(sprite: Sprite): void {
  if (!multiplyMat) {
    const src = builtinResMgr.get<Material>('ui-sprite-material');
    if (!src || !src.effectAsset) {
      return;
    }
    const mat = new Material();
    mat.initialize({
      effectAsset: src.effectAsset,
      defines: { USE_TEXTURE: true },
      states: {
        blendState: {
          targets: [{
            blend: true, blendSrc: gfx.BlendFactor.DST_COLOR, blendDst: gfx.BlendFactor.ZERO,
            blendSrcAlpha: gfx.BlendFactor.ZERO, blendDstAlpha: gfx.BlendFactor.ONE,
          }],
        },
      },
    });
    multiplyMat = mat;
  }
  sprite.customMaterial = multiplyMat;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 当前黄昏程度 0(白天)~1(黄昏)。 */
export function fieldNight(now = Date.now()): number {
  if (typeof location !== 'undefined') {
    const m = /[?&]tod=([0-9.]+)/.exec(location.search);
    if (m) {
      return Math.max(0, Math.min(1, Number(m[1])));
    }
  }
  const p = (now / 1000 % CYCLE) / CYCLE;
  // 0~0.42 白天,0.42~0.5 转黄昏,0.5~0.92 黄昏,0.92~1 转回白天
  if (p < 0.42) {
    return 0;
  }
  if (p < 0.5) {
    return smooth((p - 0.42) / 0.08);
  }
  if (p < 0.92) {
    return 1;
  }
  return 1 - smooth((p - 0.92) / 0.08);
}

export class FieldTod {
  private def: TodDef | null = null;
  private code = '';
  private mapDef: WorldMapDef | null = null;
  private wash: Sprite | null = null;
  private mul: Sprite | null = null;
  private sun: Sprite | null = null;
  private glowRoot: Node | null = null;
  private glowOp: UIOpacity | null = null;
  private glows: Glow[] = [];
  private party: Node | null = null;
  private shadowRoot: Node | null = null;
  private shadows: Node[] = [];
  private night = -1;
  private nightAt = 0;

  /** 进图 / 换图(look 生效的野外图才有昼夜)。 */
  prepare(def: WorldMapDef, enabled: boolean): boolean {
    this.mapDef = def;
    if (this.code !== def.code) {
      this.code = def.code;
      this.night = -1;
    }
    this.def = enabled ? TOD_DEFS[def.code] ?? null : null;
    return !!this.def;
  }

  get active(): boolean {
    return !!this.def;
  }

  /** 当前黄昏程度(渲染器调投影浓淡用)。 */
  get nightness(): number {
    return Math.max(0, this.night);
  }

  /**
   * 世界层上挂各层(世界重建后重挂)。插在鬼火 / 暗角层前面:FieldLook.mount 随后会把暗角挪回最上面。
   * ground = 贴地层(队伍斜影挂在它最上面、压暗层之前)。
   */
  mount(world: Node, ground: Node | null): void {
    const d = this.def;
    if (!d || !world.isValid) {
      return;
    }
    if (this.wash?.isValid && this.wash.node.parent === world) {
      return;
    }
    const layer = world.layer;
    const mk = (name: string, frame: SpriteFrame): Sprite => {
      const node = new Node(name);
      node.layer = layer;
      node.addComponent(UITransform).setContentSize(new Size(10, 10));
      const s = node.addComponent(Sprite);
      s.sizeMode = Sprite.SizeMode.CUSTOM;
      s.spriteFrame = frame;
      world.addChild(node);
      return s;
    };
    this.wash = mk('TodWash', white());
    this.mul = mk('TodMul', mulTex(0.88));
    applyMultiply(this.mul);
    const glowRoot = new Node('TodGlow');
    glowRoot.layer = layer;
    glowRoot.addComponent(UITransform).setContentSize(new Size(10, 10));
    this.glowOp = glowRoot.addComponent(UIOpacity);
    world.addChild(glowRoot);
    this.glowRoot = glowRoot;
    this.sun = mk('TodSun', sunTex());
    applyAdditive(this.sun);
    // 插到鬼火 / 暗角之前
    const anchor = world.getChildByName('FieldWisps') ?? world.getChildByName('FieldLookOverlay');
    if (anchor) {
      let idx = anchor.getSiblingIndex();
      for (const n of [this.wash.node, this.mul.node, glowRoot, this.sun.node]) {
        n.setSiblingIndex(idx);
        idx = n.getSiblingIndex() + 1;
      }
    }
    this.buildGlows(glowRoot);
    this.mountShadows(ground);
    this.night = -1;
  }

  /** 贴图里的发光点 → 世界坐标的光晕(窗 / 灯本身)+ 地上的光圈。 */
  private buildGlows(root: Node): void {
    const def = this.mapDef;
    this.glows = [];
    if (!def) {
      return;
    }
    const frame = glowTex();
    const add = (x: number, y: number, w: number, h: number, color: [number, number, number], alpha: number, flicker: boolean | number): void => {
      const node = new Node('G');
      node.layer = root.layer;
      node.addComponent(UITransform).setContentSize(new Size(w, h));
      const s = node.addComponent(Sprite);
      s.sizeMode = Sprite.SizeMode.CUSTOM;
      s.spriteFrame = frame;
      s.color = new Color(color[0], color[1], color[2], 255);
      applyAdditive(s);
      const op = node.addComponent(UIOpacity);
      const base = Math.round(Math.min(1, alpha) * 255);
      op.opacity = base;
      node.setPosition(x, y, 0);
      root.addChild(node);
      node.active = false;
      const amp = flicker === true ? 0.14 : flicker || 0;
      this.glows.push({ node, x, y, reach: Math.max(w, h) / 2, phase: amp > 0 ? Math.random() * 100 : -1, amp, op, base });
    };
    const place = (asset: string, x: number, y: number, w: number, flip: boolean, lamp: boolean): void => {
      const g = ASSET_GLOWS[asset];
      if (!g) {
        return;
      }
      const h = w * g.a;
      for (const p of g.p) {
        const u = p[0] as number;
        const v = p[1] as number;
        const r = (p[2] as number) * w;
        const k = p[3] as number;
        const c = (p[4] as number[] | undefined) ?? WARM;
        const color: [number, number, number] = [c[0], c[1], c[2]];
        const gx = x + ((flip ? 1 - u : u) - 0.5) * w;
        const gy = y + v * h;
        // 窗 / 灯本身:亮芯 + 一圈散光
        const core = Math.max(26, r * 3.2);
        add(gx, gy, core, core, color, 0.75 * k, true);
        add(gx, gy, core * 3.2, core * 3.2, color, 0.32 * k, true);
        // 地上的光圈:路灯照在灯下;窗户照在房前(建筑底边往下一点)
        const pw = lamp ? 420 : Math.max(160, r * 14);
        const py = lamp ? y + 8 : y - pw * 0.12;
        add(gx, py, pw, pw * 0.5, color, (lamp ? 0.5 : 0.34) * k, false);
      }
    };
    for (const b of def.buildings) {
      if (!b.flat) {
        place(b.asset, b.x, b.y, b.width, false, false);
      }
    }
    const lampGlow = ASSET_GLOWS[def.lampAsset];
    if (lampGlow) {
      const h = 230;
      const w = h / lampGlow.a;
      for (const l of def.lamps) {
        place(def.lampAsset, l.x, l.y, w, false, true);
      }
    }
    for (const p of def.props) {
      if (ASSET_GLOWS[p.asset]) {
        place(p.asset, p.x, p.y, p.width, !!p.flipX, /lamp/.test(p.asset));
      }
    }
    for (const l of MAP_LIGHTS[def.code] ?? []) {
      const kind = LIGHT_KINDS[l[2] as string];
      if (!kind) {
        continue;
      }
      const x = l[0] as number;
      const y = l[1] as number;
      const k = l[3] as number;
      const c = (l[4] as number[] | undefined) ?? kind.color;
      const color: [number, number, number] = [c[0], c[1], c[2]];
      add(x, y - kind.poolY, kind.pool, kind.pool * 0.5, color, kind.poolA * k, kind.amp * 0.5);
      add(x, y, kind.core * 3.4, kind.core * 3.4, color, 0.34 * k, kind.amp);
      add(x, y, kind.core, kind.core, color, 0.8 * k, kind.amp);
    }
    // 队伍身上一圈光(黄昏里人物不被压暗吞掉)
    const party = new Node('TodParty');
    party.layer = root.layer;
    party.addComponent(UITransform).setContentSize(new Size(760, 460));
    const ps = party.addComponent(Sprite);
    ps.sizeMode = Sprite.SizeMode.CUSTOM;
    ps.spriteFrame = frame;
    ps.color = new Color(255, 214, 170, 64);
    applyAdditive(ps);
    root.addChild(party);
    this.party = party;
  }

  /** 队伍斜长影子的容器(贴地层最上面,压暗层之前)。 */
  private mountShadows(ground: Node | null): void {
    this.shadows = [];
    this.shadowRoot = null;
    if (!ground || !ground.isValid) {
      return;
    }
    const root = new Node('TodShadows');
    root.layer = ground.layer;
    root.addComponent(UITransform).setContentSize(new Size(10, 10));
    root.addComponent(UIOpacity);
    ground.addChild(root);
    const vignette = ground.getChildByName('Vignette');
    if (vignette) {
      root.setSiblingIndex(vignette.getSiblingIndex());
    }
    this.shadowRoot = root;
  }

  /**
   * 每帧:各层跟镜头、按时间插值;发光点只开镜头附近的。actors = 队伍脚点(第一个是队长)。
   * 返回当前黄昏程度。
   */
  step(camX: number, camY: number, viewW: number, viewH: number, actors: Array<{ x: number; y: number }>): number {
    const d = this.def;
    if (!d || !this.wash?.isValid || !this.mul?.isValid || !this.sun?.isValid) {
      return 0;
    }
    const now = Date.now();
    // 时间每 0.25 秒重算一次(过渡期 2 分钟,够顺)
    if (this.night < 0 || now - this.nightAt > 250) {
      const n = fieldNight(now);
      this.nightAt = now;
      if (Math.abs(n - this.night) > 1e-3) {
        this.night = n;
        this.applyTime(d, n);
      }
    }
    const n = this.night;
    const w = viewW * 1.06;
    const h = viewH * 1.06;
    for (const s of [this.wash, this.mul]) {
      s.node.setPosition(camX, camY, 0);
      const tf = s.node.getComponent(UITransform)!;
      if (Math.abs(tf.width - w) > 1 || Math.abs(tf.height - h) > 1) {
        tf.setContentSize(new Size(w, h));
      }
    }
    // 光柱慢慢飘(屏幕空间,左右来回 3% 屏宽)
    const t = now / 1000;
    this.sun.node.setPosition(camX + Math.sin(t * 0.07) * viewW * 0.03, camY + Math.sin(t * 0.05 + 1) * viewH * 0.02, 0);
    const stf = this.sun.node.getComponent(UITransform)!;
    if (Math.abs(stf.width - w * 1.1) > 1) {
      stf.setContentSize(new Size(w * 1.1, h * 1.1));
    }
    this.sun.node.active = n < 0.999;
    if (this.glowRoot?.isValid) {
      const on = n > 0.001;
      this.glowRoot.active = on;
      if (on) {
        const hw = viewW / 2;
        const hh = viewH / 2;
        for (const g of this.glows) {
          const vis = Math.abs(g.x - camX) < hw + g.reach && Math.abs(g.y - camY) < hh + g.reach;
          if (g.node.active !== vis) {
            g.node.active = vis;
          }
          if (vis && g.phase >= 0) {
            const f = 1 - g.amp + g.amp * Math.sin(t * 7.3 + g.phase) * Math.sin(t * 3.1 + g.phase * 1.7);
            g.op.opacity = Math.round(g.base * f);
          }
        }
        const lead = actors[0];
        if (this.party?.isValid && lead) {
          this.party.setPosition(lead.x, lead.y + 60, 0);
        }
      }
    }
    this.stepShadows(actors, n);
    return n;
  }

  private applyTime(d: TodDef, n: number): void {
    const wa = d.day.wash;
    const wb = d.dusk.wash;
    this.wash!.color = new Color(
      Math.round(lerp(wa[0], wb[0], n) * 255), Math.round(lerp(wa[1], wb[1], n) * 255), Math.round(lerp(wa[2], wb[2], n) * 255),
      Math.round(lerp(wa[3], wb[3], n) * 255));
    const ma = d.day.mul;
    const mb = d.dusk.mul;
    this.mul!.color = new Color(Math.round(lerp(ma[0], mb[0], n) * 255), Math.round(lerp(ma[1], mb[1], n) * 255), Math.round(lerp(ma[2], mb[2], n) * 255), 255);
    // 四周压暗:白天 0.88 → 黄昏 duskEdge(按 0.05 一档换图,过渡期最多换几次)
    const edge = Math.round(lerp(0.88, d.duskEdge, n) * 20) / 20;
    const frame = mulTex(edge);
    if (this.mul!.spriteFrame !== frame) {
      this.mul!.spriteFrame = frame;
    }
    this.sun!.color = new Color(255, 196, 120, Math.round(d.sun * (1 - n) * 255));
    if (this.glowOp) {
      this.glowOp.opacity = Math.round(smooth(n) * 255);
    }
    if (this.shadowRoot?.isValid) {
      this.shadowRoot.getComponent(UIOpacity)!.opacity = Math.round((1 - n) * 255);
    }
  }

  /** 队伍脚下斜长影子(白天往右下拖,和立物投影同方向)。 */
  private stepShadows(actors: Array<{ x: number; y: number }>, n: number): void {
    const root = this.shadowRoot;
    if (!root || !root.isValid) {
      return;
    }
    root.active = n < 0.999;
    if (!root.active) {
      return;
    }
    while (this.shadows.length < actors.length) {
      const node = new Node('S');
      node.layer = root.layer;
      node.addComponent(UITransform).setContentSize(new Size(200, 52));
      const s = node.addComponent(Sprite);
      s.sizeMode = Sprite.SizeMode.CUSTOM;
      s.spriteFrame = glowTex();
      s.color = new Color(12, 18, 30, 150);
      node.angle = -28;
      root.addChild(node);
      this.shadows.push(node);
    }
    this.shadows.forEach((node, i) => {
      const a = actors[i];
      node.active = !!a;
      if (a) {
        node.setPosition(a.x + 70, a.y - 30, 0);
      }
    });
  }

  /** 换图 / 离开野外:节点随世界一起销毁,这里只清引用。 */
  reset(): void {
    this.wash = null;
    this.mul = null;
    this.sun = null;
    this.glowRoot = null;
    this.glowOp = null;
    this.glows = [];
    this.party = null;
    this.shadowRoot = null;
    this.shadows = [];
    this.night = -1;
  }
}
