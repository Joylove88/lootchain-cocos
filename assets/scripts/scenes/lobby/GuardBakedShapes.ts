import { Color, SpriteFrame, Texture2D } from 'cc';

/**
 * 守卫战程序图形烘焙(2026-10-07 手机战斗卡顿):弹体 / 命中爆闪 / 格位爆闪原先每次 new 一个 Graphics,
 * 每个 Graphics 是一个独立渲染模型(单独一次绘制 + 每帧 UBO 上传 + 首绘建缓冲),普攻超过骨骼特效上限后每秒几十个。
 * 改为:同一形状 + 颜色只在 CPU 上画一次成小贴图(2 倍超采样、抗锯齿),之后都是普通精灵,可合批、零缓冲分配。
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
    const texture = new Texture2D();
    texture.reset({ width: this.w, height: this.h, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: 1 });
    texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
    texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    texture.uploadData(bytes);
    const frame = new SpriteFrame();
    frame.texture = texture;
    return frame;
  }
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

/** 命中爆闪:白核 + 4 道斜向光芒,设计尺寸 48×48。 */
export function impactFrame(color: Color): SpriteFrame | null {
  return bake(key('impact', color), 48, 48, (c) => {
    c.fillEllipse(0, 0, 9, 9, [1, 0.97, 0.9, 235 / 255]);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      c.strokeLine(Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * 20, Math.sin(a) * 20, 3, rgbaOf(color, 220));
    }
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
