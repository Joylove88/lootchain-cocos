import { Color, Rect, Size, SpriteFrame, Texture2D, Vec2 } from 'cc';

/**
 * 守卫战程序图形烘焙(2026-10-07 手机战斗卡顿):弹体 / 命中爆闪 / 格位爆闪原先每次 new 一个 Graphics,
 * 每个 Graphics 是一个独立渲染模型(单独一次绘制 + 每帧 UBO 上传 + 首绘建缓冲),普攻超过骨骼特效上限后每秒几十个。
 * 改为:同一形状 + 颜色只在 CPU 上画一次成小贴图(2 倍超采样、抗锯齿),之后都是普通精灵,可合批、零缓冲分配。
 * 命中爆闪 / 出手闪光是带渐变的柔光星芒,按 4 倍精度烘,形状与配色分开(见 FlashStencil)。
 */
const SUPERSAMPLE = 2;
const cache = new Map<string, SpriteFrame>();

type Rgba = [number, number, number, number];

class Canvas {
  readonly data: Float32Array;

  constructor(readonly w: number, readonly h: number) {
    this.data = new Float32Array(w * h * 4);
  }

  /** 以中心为原点、y 向上的坐标系(与节点坐标一致),coverage 0..1 叠加(source-over)。 */
  private blend(px: number, py: number, color: Rgba, coverage: number): void {
    if (coverage <= 0) {
      return;
    }
    const a = Math.min(1, coverage) * color[3];
    const i = (py * this.w + px) * 4;
    const d = this.data;
    const outA = a + d[i + 3] * (1 - a);
    if (outA <= 0) {
      return;
    }
    for (let c = 0; c < 3; c += 1) {
      d[i + c] = (color[c] * a + d[i + c] * d[i + 3] * (1 - a)) / outA;
    }
    d[i + 3] = outA;
  }

  private each(fn: (x: number, y: number) => number, color: Rgba): void {
    const s = SUPERSAMPLE;
    for (let py = 0; py < this.h; py += 1) {
      for (let px = 0; px < this.w; px += 1) {
        // 纹理行 0 在底部(Texture2D.uploadData 约定),中心为原点,单位 = 设计像素
        const x = (px + 0.5 - this.w / 2) / s;
        const y = (py + 0.5 - this.h / 2) / s;
        this.blend(px, py, color, fn(x, y));
      }
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: Rgba): void {
    const aa = 1 / SUPERSAMPLE;
    this.each((x, y) => {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      return (1 - d) * Math.min(rx, ry) / aa + 0.5;
    }, color);
  }

  strokeCircle(cx: number, cy: number, r: number, lineWidth: number, color: Rgba): void {
    const aa = 1 / SUPERSAMPLE;
    this.each((x, y) => (lineWidth / 2 - Math.abs(Math.hypot(x - cx, y - cy) - r)) / aa + 0.5, color);
  }

  /** 椭圆描边:到椭圆边界的距离按短半轴换算成像素再做抗锯齿。 */
  strokeEllipse(cx: number, cy: number, rx: number, ry: number, lineWidth: number, color: Rgba): void {
    const aa = 1 / SUPERSAMPLE;
    const unit = Math.min(rx, ry);
    this.each((x, y) => (lineWidth / 2 - Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * unit) / aa + 0.5, color);
  }

  /** 菱形填充(中心 cx, cy,半对角 r)。 */
  fillDiamond(cx: number, cy: number, r: number, color: Rgba): void {
    const aa = 1 / SUPERSAMPLE;
    this.each((x, y) => ((r - (Math.abs(x - cx) + Math.abs(y - cy))) * Math.SQRT1_2) / aa + 0.5, color);
  }

  /** 圆角矩形描边(中心在 cx, cy;w/h/radius 指描边中线)。 */
  strokeRoundRectAt(cx: number, cy: number, w: number, h: number, radius: number, lineWidth: number, color: Rgba): void {
    const aa = 1 / SUPERSAMPLE;
    const r = Math.min(radius, w / 2, h / 2);
    this.each((x, y) => {
      const qx = Math.abs(x - cx) - (w / 2 - r);
      const qy = Math.abs(y - cy) - (h / 2 - r);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      return (lineWidth / 2 - Math.abs(d)) / aa + 0.5;
    }, color);
  }

  /** 圆角矩形填充(中心在 cx, cy);radius 为 0 时是直角矩形。 */
  fillRoundRectAt(cx: number, cy: number, w: number, h: number, radius: number, color: Rgba): void {
    const aa = 1 / SUPERSAMPLE;
    const r = Math.min(radius, w / 2, h / 2);
    this.each((x, y) => {
      const qx = Math.max(0, Math.abs(x - cx) - (w / 2 - r));
      const qy = Math.max(0, Math.abs(y - cy) - (h / 2 - r));
      const outside = Math.hypot(qx, qy) - r;
      const edge = r > 0 ? -outside : Math.min(w / 2 - Math.abs(x - cx), h / 2 - Math.abs(y - cy));
      return edge / aa + 0.5;
    }, color);
  }

  /** 圆角矩形填充,颜色随纵向位置变(shade(t):t = 0 在贴图首行一侧 = 精灵的上沿,1 在下沿);做上亮下暗的条用。 */
  fillRoundRectShadedAt(cx: number, cy: number, w: number, h: number, radius: number, shade: (t: number) => Rgba): void {
    const s = SUPERSAMPLE;
    const aa = 1 / s;
    const r = Math.min(radius, w / 2, h / 2);
    for (let py = 0; py < this.h; py += 1) {
      const y = (py + 0.5 - this.h / 2) / s;
      if (Math.abs(y - cy) > h / 2 + aa) {
        continue;
      }
      const color = shade(Math.max(0, Math.min(1, (y - (cy - h / 2)) / h)));
      const qy = Math.max(0, Math.abs(y - cy) - (h / 2 - r));
      for (let px = 0; px < this.w; px += 1) {
        const x = (px + 0.5 - this.w / 2) / s;
        const qx = Math.max(0, Math.abs(x - cx) - (w / 2 - r));
        this.blend(px, py, color, (r - Math.hypot(qx, qy)) / aa + 0.5);
      }
    }
  }

  strokeLine(x0: number, y0: number, x1: number, y1: number, lineWidth: number, color: Rgba): void {
    const aa = 1 / SUPERSAMPLE;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    this.each((x, y) => {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      const d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
      return (lineWidth / 2 - d) / aa + 0.5;
    }, color);
  }

  toFrame(): SpriteFrame {
    const bytes = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < bytes.length; i += 4) {
      const a = this.data[i + 3];
      bytes[i] = Math.round(this.data[i] * 255);
      bytes[i + 1] = Math.round(this.data[i + 1] * 255);
      bytes[i + 2] = Math.round(this.data[i + 2] * 255);
      bytes[i + 3] = Math.round(a * 255);
    }
    return frameFromBytes(bytes, this.w, this.h);
  }
}

/** 把一块 RGBA 像素做成精灵帧(线性过滤、不重复)。 */
function frameFromBytes(bytes: Uint8Array, w: number, h: number): SpriteFrame {
  const texture = new Texture2D();
  texture.reset({ width: w, height: h, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: 1 });
  texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  texture.uploadData(bytes);
  const frame = new SpriteFrame();
  frame.texture = texture;
  return frame;
}

function rgbaOf(color: Color, alpha: number): Rgba {
  return [color.r / 255, color.g / 255, color.b / 255, alpha / 255];
}

function key(kind: string, color: Color, extra = ''): string {
  return `${kind}:${color.r},${color.g},${color.b}${extra}`;
}

function bake(id: string, w: number, h: number, draw: (canvas: Canvas) => void): SpriteFrame | null {
  const hit = cache.get(id);
  if (hit) {
    return hit;
  }
  try {
    const canvas = new Canvas(Math.ceil(w * SUPERSAMPLE), Math.ceil(h * SUPERSAMPLE));
    draw(canvas);
    const frame = canvas.toFrame();
    cache.set(id, frame);
    return frame;
  } catch (error) {
    console.warn('[LootChain] baked shape failed', id, error);
    return null;
  }
}

/** 通用光弹(朝右,亮核 + 外辉 + 尾迹):设计尺寸 72×24,原点在弹头中心偏左 18px 处。 */
export const BOLT_SIZE = { w: 72, h: 24, originX: 18 } as const;

export function boltFrame(color: Color, glowAlpha = 120, trailAlpha = 130): SpriteFrame | null {
  return bake(key('bolt', color, `:${glowAlpha}:${trailAlpha}`), BOLT_SIZE.w, BOLT_SIZE.h, (c) => {
    const ox = BOLT_SIZE.originX; // 弹头中心在纹理里的 x 偏移(纹理中心为 0)
    c.strokeLine(-30 + ox, 0, -8 + ox, 0, 5, rgbaOf(color, trailAlpha));
    c.fillEllipse(ox, 0, 13, 7, rgbaOf(color, glowAlpha));
    c.fillEllipse(1 + ox, 0, 8, 4, [1, 0.98, 0.92, 245 / 255]);
  });
}

/**
 * 命中爆闪 / 出手闪光(2026-11-11 战斗画面精致化,用户确认样片 06):主色柔光 + 细长星芒(芯白、向外染成主色并淡出)+ 白亮芯。
 * 原先是 2 倍超采样的 48 像素小图(白圆点 + 四根硬边斜线)和一个程序画的纯色圆饼;它们出现时还会再弹大到 1.3~1.7 倍,
 * 手机上画面又放大 1.5 倍,等于被放大着用,发虚又简陋。现在按 4 倍精度烘。
 *
 * 形状和配色分开烘:4 倍精度的渐变逐像素画一遍,手机级处理器要 12~22 毫秒(实测:处理器降速 4~6 倍;头一次连代码预热 20~33 毫秒),
 * 而颜色跟着英雄主色 / 控制效果走,一局里会陆续冒出十来种——每种新颜色都在交战中现画一遍就是一次掉帧。
 * 所以先画一张不带颜色的底稿(FlashStencil):每个像素只记「白 / 暖白 / 主色 / 提亮的主色」四种成分各占多少,再加透明度;
 * 一种形状整个应用只画一次(开局预烘时画),之后每种颜色只是把四种成分按比例混一遍(乘加,同样条件下 2~5 毫秒,
 * 和原先 2 倍精度的小图一个量级),结果与直接按那个颜色画出来的一样(差别不超过 1~2 个色阶)。
 */
const FLASH_SUPERSAMPLE = 4;
/** 底稿里的四种颜色成分(下标)。 */
const PART_WHITE = 0;
const PART_WARM = 1;
const PART_BASE = 2;
const PART_TINT = 3;
/** 底稿每像素 5 个数:四种成分的占比(合计 1)+ 透明度。 */
const STENCIL_STRIDE = 5;
/** 亮芯外圈的暖白。 */
const WARM_WHITE = [1, 253 / 255, 244 / 255];
/** 星芒中段「提亮的主色」= 主色各通道加这么多(封顶 1)。 */
const TINT_LIFT = 70 / 255;

class FlashStencil {
  /** 贴图边长(像素)。 */
  readonly px: number;

  /** 画的时候用浮点(0..1);画完 seal() 压成每个数 1 字节留存——4 倍精度的底稿用浮点留着要占几兆内存。 */
  private float: Float32Array | null;

  private packed: Uint8Array | null = null;

  /** size = 设计尺寸(正方形,原点在中心,y 向上);ss = 超采样倍数。 */
  constructor(size: number, private readonly ss: number) {
    this.px = Math.ceil(size * ss);
    this.float = new Float32Array(this.px * this.px * STENCIL_STRIDE);
  }

  /** 往一个像素上叠一层(source-over):这层的颜色 = partA 占 weightA、partB 占其余,透明度 alpha(> 0)。 */
  private put(d: Float32Array, px: number, py: number, partA: number, weightA: number, partB: number, alpha: number): void {
    const i = (py * this.px + px) * STENCIL_STRIDE;
    const under = d[i + 4] * (1 - alpha);
    const outA = alpha + under;
    const keep = under / outA;
    const add = alpha / outA;
    d[i] *= keep;
    d[i + 1] *= keep;
    d[i + 2] *= keep;
    d[i + 3] *= keep;
    d[i + partA] += add * weightA;
    d[i + partB] += add * (1 - weightA);
    d[i + 4] = outA;
  }

  /** 设计坐标的一段 [lo, hi] 落在哪些像素上(两头各放宽 1 像素,夹在贴图内)。 */
  private span(lo: number, hi: number): [number, number] {
    const half = this.px / 2;
    return [Math.max(0, Math.floor(lo * this.ss + half) - 1), Math.min(this.px - 1, Math.ceil(hi * this.ss + half) + 1)];
  }

  /**
   * 圆心在原点的柔光圆:透明度从圆心 a0 → 0.45 半径处 a1 → 边缘 0;颜色从 inner(圆心)过渡到 outer(0.45 半径以外)。
   * 光晕(inner = outer = 主色)和亮芯(白 → 暖白)都用它。
   */
  softDisc(r: number, inner: number, outer: number, a0: number, a1: number): void {
    const d = this.float;
    if (!d) {
      return;
    }
    const [p0, p1] = this.span(-r, r);
    const half = this.px / 2;
    for (let py = p0; py <= p1; py += 1) {
      const y = (py + 0.5 - half) / this.ss;
      for (let px = p0; px <= p1; px += 1) {
        const x = (px + 0.5 - half) / this.ss;
        const t = Math.sqrt(x * x + y * y) / r;
        if (t >= 1) {
          continue;
        }
        const k = Math.min(1, t / 0.45);
        const alpha = t < 0.45 ? a0 + (a1 - a0) * k : a1 * (1 - (t - 0.45) / 0.55);
        if (alpha > 0.002) {
          this.put(d, px, py, inner, 1 - k, outer, alpha);
        }
      }
    }
  }

  /**
   * 星芒:从原点沿 angle 方向伸出 len 长的细长尖刺,根部宽 width、向尖端按二次曲线收成一个点;
   * 颜色沿长度从白 → 提亮的主色(42% 处)→ 主色并淡出到透明。
   */
  spike(angle: number, len: number, width: number): void {
    const d = this.float;
    if (!d) {
      return;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = width / 2;
    const aa = 1 / this.ss;
    // 包围盒:尖刺所在的旋转矩形四个角
    const ex = len * cos;
    const ey = len * sin;
    const [x0, x1] = this.span(Math.min(hw * sin, -hw * sin, ex + hw * sin, ex - hw * sin), Math.max(hw * sin, -hw * sin, ex + hw * sin, ex - hw * sin));
    const [y0, y1] = this.span(Math.min(hw * cos, -hw * cos, ey + hw * cos, ey - hw * cos), Math.max(hw * cos, -hw * cos, ey + hw * cos, ey - hw * cos));
    const half = this.px / 2;
    for (let py = y0; py <= y1; py += 1) {
      const y = (py + 0.5 - half) / this.ss;
      for (let px = x0; px <= x1; px += 1) {
        const x = (px + 0.5 - half) / this.ss;
        const along = x * cos + y * sin;
        if (along < 0 || along > len) {
          continue;
        }
        const t = along / len;
        // 轮廓 = 二次贝塞尔 (0, 宽/2) → 控制点 (0.3 长, 0.16 宽) → (长, 0);按沿长度的位置反解参数
        const q = (-0.6 + Math.sqrt(0.36 + 1.6 * t)) / 0.8;
        const halfWidth = (1 - q) * (1 - q) * hw + 2 * q * (1 - q) * 0.16 * width;
        const coverage = Math.min(1, (halfWidth - Math.abs(y * cos - x * sin)) / aa + 0.5);
        if (coverage <= 0) {
          continue;
        }
        if (t < 0.42) {
          const k = t / 0.42;
          const alpha = (0.98 - 0.02 * k) * coverage;
          if (alpha > 0.002) {
            this.put(d, px, py, PART_WHITE, 1 - k, PART_TINT, alpha);
          }
        } else {
          const k = (t - 0.42) / 0.58;
          const alpha = 0.96 * (1 - k) * coverage;
          if (alpha > 0.002) {
            this.put(d, px, py, PART_TINT, 1 - k, PART_BASE, alpha);
          }
        }
      }
    }
  }

  /** 画完:压成字节留存,浮点缓冲丢掉。 */
  seal(): void {
    const d = this.float;
    if (!d) {
      return;
    }
    const packed = new Uint8Array(d.length);
    for (let i = 0; i < d.length; i += 1) {
      packed[i] = Math.round(d[i] * 255);
    }
    this.packed = packed;
    this.float = null;
  }

  /** 按主色把底稿混成成品贴图(一遍乘加)。 */
  toFrame(color: Color): SpriteFrame {
    const d = this.packed;
    if (!d) {
      throw new Error('flash stencil not sealed');
    }
    const count = this.px * this.px;
    const bytes = new Uint8Array(count * 4);
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    const tr = Math.min(1, r + TINT_LIFT);
    const tg = Math.min(1, g + TINT_LIFT);
    const tb = Math.min(1, b + TINT_LIFT);
    for (let p = 0, i = 0, o = 0; p < count; p += 1, i += STENCIL_STRIDE, o += 4) {
      const alpha = d[i + 4];
      if (alpha === 0) {
        continue;
      }
      // 四种成分(各 0..255,合计约 255):白 = 1、暖白、主色、提亮的主色
      const white = d[i];
      const warm = d[i + 1];
      const base = d[i + 2];
      const tint = d[i + 3];
      bytes[o] = Math.min(255, Math.round(white + warm * WARM_WHITE[0] + base * r + tint * tr));
      bytes[o + 1] = Math.min(255, Math.round(white + warm * WARM_WHITE[1] + base * g + tint * tg));
      bytes[o + 2] = Math.min(255, Math.round(white + warm * WARM_WHITE[2] + base * b + tint * tb));
      bytes[o + 3] = alpha;
    }
    return frameFromBytes(bytes, this.px, this.px);
  }
}

/** 已经画好的底稿(按形状名)。 */
const stencils = new Map<string, FlashStencil>();

function flashFrame(kind: string, color: Color, size: number, draw: (stencil: FlashStencil) => void): SpriteFrame | null {
  const id = key(kind, color);
  const hit = cache.get(id);
  if (hit) {
    return hit;
  }
  try {
    let stencil = stencils.get(kind);
    if (!stencil) {
      stencil = new FlashStencil(size, FLASH_SUPERSAMPLE);
      draw(stencil);
      stencil.seal();
      stencils.set(kind, stencil);
    }
    const frame = stencil.toFrame(color);
    cache.set(id, frame);
    return frame;
  } catch (error) {
    console.warn('[LootChain] baked shape failed', id, error);
    return null;
  }
}

/** 命中爆闪的设计尺寸(正方形)。 */
export const IMPACT_SIZE = 72;

/** 命中爆闪:主色柔光 + 四长四短的细长星芒 + 白亮芯。长芒沿横竖方向,要斜着放就转节点。 */
export function impactFrame(color: Color): SpriteFrame | null {
  return flashFrame('impact2', color, IMPACT_SIZE, (s) => {
    s.softDisc(31, PART_BASE, PART_BASE, 0.62, 0.26);
    for (let i = 0; i < 4; i += 1) {
      s.spike((i * Math.PI) / 2, 34, 9.5);
    }
    for (let i = 0; i < 4; i += 1) {
      s.spike((i * Math.PI) / 2 + Math.PI / 4, 18, 6);
    }
    s.softDisc(10, PART_WHITE, PART_WARM, 1, 0.96);
  });
}

/** 出手闪光的设计尺寸(正方形)。 */
export const MUZZLE_SIZE = 96;

/** 出手闪光:主色柔光 + 一道横向长光 + 一道竖向短光 + 白亮芯(原先是一个纯色圆饼)。 */
export function muzzleFrame(color: Color): SpriteFrame | null {
  return flashFrame('muzzle', color, MUZZLE_SIZE, (s) => {
    s.softDisc(34, PART_BASE, PART_BASE, 0.62, 0.26);
    s.spike(0, 46, 8);
    s.spike(Math.PI, 46, 8);
    s.spike(Math.PI / 2, 21, 6);
    s.spike(-Math.PI / 2, 21, 6);
    s.softDisc(10, PART_WHITE, PART_WARM, 1, 0.96);
  });
}

/** 格位爆闪:扩散环 + 6 道星芒;big = 合成 / 超阶。设计尺寸 = 2 × 外沿半径 + 线宽。 */
export function cellBurstFrame(color: Color, big: boolean): SpriteFrame | null {
  const size = big ? 136 : 98;
  return bake(key('burst', color, big ? ':big' : ''), size, size, (c) => {
    c.strokeCircle(0, 0, big ? 46 : 32, big ? 6 : 4, rgbaOf(color, 235));
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const r0 = big ? 30 : 20;
      const r1 = big ? 62 : 44;
      c.strokeLine(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, 3, [1, 0.97, 0.88, 220 / 255]);
    }
  });
}

export function cellBurstSize(big: boolean): number {
  return big ? 136 : 98;
}

/**
 * 白条图集(2026-10-09 手机战斗绘制调用优化):血条 / 冷却条原先每条一个 Graphics = 一次独立绘制 + 一份顶点缓冲;
 * 改成所有条共用同一张贴图、按 Sprite 颜色染色,放在同一层里连续绘制就能合成一次。
 * 一张贴图里两块:左边圆角条(设计 24×8、圆角 3,九宫格左右各切 4,拉长保留圆头),右边纯白方块(直角条)。
 * 两块必须在同一张贴图上——不同贴图的精灵交替排列就合不了批。
 *
 * 2026-11-11(战斗画面精致化 · 样片 09 怪物血条):同一张贴图里再加怪物血条的胶囊色块,和冷却条在同一层里仍然合成一次绘制。
 * 第一排(高 8)接在圆角条 / 方块后面:深色底托、红 / 琥珀渐层填充、浅色残影;第二排(高 16):首领血条用的大号白胶囊(染色用)。
 * 色块都是半圆头胶囊,九宫格左右各切一个半径;块与块之间留 2 设计像素空隙,缩小取样不串色。
 */
const BAR_ATLAS = { w: 110, h: 26, rowH: 8, pillW: 24, pillInset: 4, squareX: 27, squareW: 4 } as const;

/** 怪物血条色块在图集里的位置(设计像素,左上角为原点)。 */
const HP_BLOCKS = {
  plate: { x: 34, y: 0, w: 20, h: 8 },
  red: { x: 56, y: 1, w: 16, h: 6 },
  amber: { x: 74, y: 1, w: 16, h: 6 },
  trail: { x: 92, y: 1, w: 16, h: 6 },
  bossCap: { x: 0, y: 10, w: 40, h: 16 },
} as const;

export type HpBarPart = keyof typeof HP_BLOCKS;

/** 渐层色标:[位置 0..1(上沿 → 下沿), r, g, b](0..255)。 */
type ShadeStops = ReadonlyArray<readonly [number, number, number, number]>;
const HP_SHADES: Record<'red' | 'amber' | 'trail', ShadeStops> = {
  red: [[0, 255, 138, 112], [0.38, 236, 78, 62], [1, 170, 36, 36]],
  amber: [[0, 255, 214, 134], [0.38, 250, 164, 60], [1, 198, 106, 26]],
  trail: [[0, 255, 228, 206], [1, 244, 190, 164]],
};
const HP_PLATE_COLOR: Rgba = [9 / 255, 9 / 255, 14 / 255, 0.88];

function shadeAt(stops: ShadeStops, t: number): Rgba {
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i + 1 < stops.length; i += 1) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const k = hi[0] > lo[0] ? Math.max(0, Math.min(1, (t - lo[0]) / (hi[0] - lo[0]))) : 0;
  return [(lo[1] + (hi[1] - lo[1]) * k) / 255, (lo[2] + (hi[2] - lo[2]) * k) / 255, (lo[3] + (hi[3] - lo[3]) * k) / 255, 1];
}

type BarAtlasFrames = { pill: SpriteFrame; bar: SpriteFrame } & Record<HpBarPart, SpriteFrame>;
let barAtlas: BarAtlasFrames | null = null;

function ensureBarAtlas(): BarAtlasFrames | null {
  if (barAtlas) {
    return barAtlas;
  }
  // 烘焙画布以图集中心为原点、纵坐标随贴图行号增大;块的中心 = 左上角位置 + 半个块 − 半张图集
  const centerX = (x: number, w: number): number => -BAR_ATLAS.w / 2 + x + w / 2;
  const centerY = (y: number, h: number): number => -BAR_ATLAS.h / 2 + y + h / 2;
  const rowY = centerY(0, BAR_ATLAS.rowH);
  const base = bake('whitebaratlas', BAR_ATLAS.w, BAR_ATLAS.h, (c) => {
    // 左:圆角条
    c.fillRoundRectAt(centerX(0, BAR_ATLAS.pillW), rowY, BAR_ATLAS.pillW - 1, BAR_ATLAS.rowH - 1, 3, [1, 1, 1, 1]);
    // 右:纯白方块(比取样区大一圈,双线性取样不会混进透明边)
    c.fillRoundRectAt(centerX(BAR_ATLAS.squareX, BAR_ATLAS.squareW), rowY, BAR_ATLAS.squareW, BAR_ATLAS.rowH, 0, [1, 1, 1, 1]);
    // 怪物血条:底托(纯色)、三种渐层填充、首领大胶囊(纯白)
    const plate = HP_BLOCKS.plate;
    c.fillRoundRectAt(centerX(plate.x, plate.w), centerY(plate.y, plate.h), plate.w, plate.h, plate.h / 2, HP_PLATE_COLOR);
    for (const name of ['red', 'amber', 'trail'] as const) {
      const block = HP_BLOCKS[name];
      const stops = HP_SHADES[name];
      c.fillRoundRectShadedAt(centerX(block.x, block.w), centerY(block.y, block.h), block.w, block.h, block.h / 2, (t) => shadeAt(stops, t));
    }
    const cap = HP_BLOCKS.bossCap;
    c.fillRoundRectAt(centerX(cap.x, cap.w), centerY(cap.y, cap.h), cap.w, cap.h, cap.h / 2, [1, 1, 1, 1]);
  });
  const texture = base?.texture as Texture2D | null | undefined;
  if (!texture) {
    return null;
  }
  const s = SUPERSAMPLE;
  // 子图的原始尺寸必须等于切块本身(默认是整张图集的尺寸,不裁剪的精灵会把切块缩成框里的一个小点)
  const sub = (rect: Rect): SpriteFrame => {
    const frame = new SpriteFrame();
    frame.reset({ texture, rect, originalSize: new Size(rect.width, rect.height), offset: new Vec2(0, 0), isRotate: false });
    return frame;
  };
  const pill = sub(new Rect(0, 0, BAR_ATLAS.pillW * s, BAR_ATLAS.rowH * s));
  pill.insetLeft = BAR_ATLAS.pillInset * s;
  pill.insetRight = BAR_ATLAS.pillInset * s;
  // 取方块正中 2×2 设计像素,四周留 1 像素白边防取样渗色
  const bar = sub(new Rect((BAR_ATLAS.squareX + 1) * s, 3 * s, 2 * s, 2 * s));
  const capsule = (name: HpBarPart): SpriteFrame => {
    const block = HP_BLOCKS[name];
    const frame = sub(new Rect(block.x * s, block.y * s, block.w * s, block.h * s));
    frame.insetLeft = (block.h / 2) * s;
    frame.insetRight = (block.h / 2) * s;
    return frame;
  };
  barAtlas = { pill, bar, plate: capsule('plate'), red: capsule('red'), amber: capsule('amber'), trail: capsule('trail'), bossCap: capsule('bossCap') };
  return barAtlas;
}

/**
 * 怪物血条色块的贴图精度(贴图像素 ÷ 设计像素)。九宫格的圆头按贴图像素算,
 * 所以用的时候节点内容尺寸乘它、节点缩放除它,圆头才是正圆而不是被拉扁的椭圆。
 */
export const HP_BAR_TEXEL = SUPERSAMPLE;

/** 怪物血条的胶囊色块:plate 深色底托、red / amber 渐层填充、trail 浅色残影、bossCap 首领血条用的大号白胶囊(Sprite.color 染色)。 */
export function hpBarFrame(part: HpBarPart): SpriteFrame | null {
  return ensureBarAtlas()?.[part] ?? null;
}

/** 直角纯白条(小怪血条):直接拉伸,颜色由 Sprite.color 给。 */
export function whiteBarFrame(): SpriteFrame | null {
  return ensureBarAtlas()?.bar ?? null;
}

/** 圆角纯白条(冷却条):九宫格,任意拉长保留圆头。 */
export function whitePillFrame(): SpriteFrame | null {
  return ensureBarAtlas()?.pill ?? null;
}

/** 英雄底座色环:白色椭圆描边,按实际半径烘焙(同一布局下所有英雄同尺寸,只烘一次),Sprite 染职业色;贴图尺寸见 ringFrameSize。 */
export function whiteRingFrame(rx: number, ry: number, lineWidth: number): SpriteFrame | null {
  const size = ringFrameSize(rx, ry, lineWidth);
  return bake(`whitering:${Math.round(rx)}x${Math.round(ry)}:${lineWidth}`, size.w, size.h, (c) => c.strokeEllipse(0, 0, rx, ry, lineWidth, [1, 1, 1, 1]));
}

export function ringFrameSize(rx: number, ry: number, lineWidth: number): { w: number; h: number } {
  return { w: Math.ceil(rx * 2 + lineWidth + 4), h: Math.ceil(ry * 2 + lineWidth + 4) };
}

/** 装备图标暗底(透明底图标的垫底):128 方、圆角 10,色 (14,14,17)。 */
export function equipPlateFrame(): SpriteFrame | null {
  return bake('equip-plate', 128, 128, (c) => {
    c.fillRoundRectAt(0, 0, 128, 128, 10, [14 / 255, 14 / 255, 17 / 255, 1]);
  });
}

/** 橙 / 红装背景辉光:中心亮向外柔和衰减(10 层同心椭圆叠加),128 方。 */
export function equipGlowFrame(color: Color): SpriteFrame | null {
  return bake(key('equip-glow', color), 128, 128, (c) => {
    for (let i = 10; i >= 1; i -= 1) {
      const r = 6 + (58 * i) / 10;
      c.fillEllipse(0, 0, r, r, rgbaOf(color, 22));
    }
    c.fillEllipse(0, 0, 14, 14, rgbaOf(color, 40));
  });
}

/** 橙 / 红装斜向扫光序列帧:96 方画布,一道(或两道)45° 柔光带从左扫到右,画布天然裁掉越界部分(无需遮罩)。 */
export function equipSweepFrames(color: Color, double: boolean): SpriteFrame[] {
  const frames: SpriteFrame[] = [];
  const count = 14;
  const w = 96;
  for (let i = 0; i < count; i += 1) {
    const frame = bake(key('equip-sweep', color, `:${double ? 2 : 1}:${i}`), w, w, (c) => {
      const t = i / (count - 1);
      const cx = -w * 0.95 + t * w * 1.9;
      const bands = double ? [cx, cx - w * 0.3] : [cx];
      for (const bx of bands) {
        // 三层叠加做软边:宽淡 → 窄亮
        c.strokeLine(bx - w, -w, bx + w, w, w * 0.3, rgbaOf(color, 40));
        c.strokeLine(bx - w, -w, bx + w, w, w * 0.16, rgbaOf(color, 60));
        c.strokeLine(bx - w, -w, bx + w, w, w * 0.06, rgbaOf(color, 110));
      }
    });
    if (frame) {
      frames.push(frame);
    }
  }
  return frames;
}

/**
 * 道具稀有度描边(材料图标 A 方案,2026-10-22):128 方画布,与装备图标烘焙描边同比例——
 * 512 版描边外沿内缩 14、宽 16、外圆角 40,外侧 2px 暗线;换算到 128:中线内缩 5.5、宽 4、中线圆角 8;暗线中线 3.25、宽 0.5。
 */
export function itemRarityRingFrame(color: Color): SpriteFrame | null {
  return bake(key('item-ring', color), 128, 128, (c) => {
    c.strokeRoundRectAt(0, 0, 128 - 6.5, 128 - 6.5, 10.25, 0.6, [0, 0, 0, 160 / 255]);
    c.strokeRoundRectAt(0, 0, 128 - 11, 128 - 11, 8, 4, rgbaOf(color, 255));
  });
}

/**
 * 分区标题渐隐线(白,按 sprite.color 着色):128×4;symmetric=false 从左向右渐隐,true 中间亮、两端渐隐。
 * 2026-10-22 内层分区标题 A 方案。
 */
export function sectionFadeLineFrame(symmetric: boolean): SpriteFrame | null {
  return bake(`section-fade:${symmetric ? 'sym' : 'ltr'}`, 128, 4, (c) => {
    const n = 64;
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const a = symmetric ? Math.pow(1 - Math.abs(t - 0.5) * 2, 0.7) : Math.max(0, 1 - t * 1.12);
      if (a <= 0.01) {
        continue;
      }
      c.fillRoundRectAt(-64 + (i + 0.5) * 2, 0, 2.02, 4, 0, [1, 1, 1, a]);
    }
  });
}

/** 分区标题小金菱形(金面 + 暗芯),32 方,自带颜色不着色。 */
export function sectionDiamondFrame(): SpriteFrame | null {
  return bake('section-diamond', 32, 32, (c) => {
    c.fillDiamond(0, 0, 15, [236 / 255, 200 / 255, 128 / 255, 1]);
    c.fillDiamond(0, 0, 7, [90 / 255, 60 / 255, 30 / 255, 1]);
  });
}

