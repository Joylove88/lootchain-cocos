import { director, Director, game } from 'cc';

/**
 * 每帧显卡实际耗时(11-20,低端设备兼容第 0 期):在引擎每帧的 BEFORE_DRAW / AFTER_DRAW 之间包一个 GPU 计时查询
 * (WebGL2 的 EXT_disjoint_timer_query_webgl2,WebGL1 的 EXT_disjoint_timer_query),结果晚几帧才可读,轮询取回。
 * 帧时(rAF 间隔)混着 CPU、等垂直同步;这个数只算显卡干活的时间,核显上判断「卡在显卡还是卡在脚本」靠它。
 * 浏览器不给这个扩展时 ok = false,测速表里显示「—」。
 */
export class GpuTimer {
  readonly ok: boolean;
  private gl: (WebGL2RenderingContext & WebGLRenderingContext) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ext: any = null;
  private v2 = false;
  private active: unknown = null;
  private pending: unknown[] = [];
  private samples: number[] = [];
  private on = false;
  private readonly onBefore = (): void => this.begin();
  private readonly onAfter = (): void => this.end();

  constructor() {
    const cv = game.canvas as HTMLCanvasElement | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gl: any = null;
    try {
      gl = cv ? cv.getContext('webgl2') : null;          // 画布已经是 WebGL1 时这里返回 null,不会新建上下文
    } catch (error) {
      void error;
    }
    if (gl) {
      const e = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (e) {
        this.gl = gl;
        this.ext = e;
        this.v2 = true;
      }
    }
    if (!this.ext) {
      try {
        gl = cv ? cv.getContext('webgl') : null;
      } catch (error) {
        void error;
      }
      if (gl) {
        const e = gl.getExtension('EXT_disjoint_timer_query');
        if (e) {
          this.gl = gl;
          this.ext = e;
        }
      }
    }
    this.ok = !!this.ext;
  }

  start(): void {
    if (!this.ok || this.on) {
      return;
    }
    this.on = true;
    director.on(Director.EVENT_BEFORE_DRAW, this.onBefore);
    director.on(Director.EVENT_AFTER_DRAW, this.onAfter);
  }

  stop(): void {
    if (!this.on) {
      return;
    }
    this.on = false;
    director.off(Director.EVENT_BEFORE_DRAW, this.onBefore);
    director.off(Director.EVENT_AFTER_DRAW, this.onAfter);
    this.end();
    this.poll();
  }

  /** 取走目前攒下的样本(毫秒),顺便清空;没有样本返回 null。 */
  take(): { avg: number; median: number; n: number } | null {
    this.poll();
    const s = this.samples;
    this.samples = [];
    if (!s.length) {
      return null;
    }
    const sorted = s.slice().sort((a, b) => a - b);
    return { avg: s.reduce((a, b) => a + b, 0) / s.length, median: sorted[Math.floor(sorted.length / 2)], n: s.length };
  }

  private begin(): void {
    if (this.active || !this.gl) {
      return;
    }
    this.poll();
    const gl = this.gl;
    const ext = this.ext;
    try {
      const q = this.v2 ? gl.createQuery() : ext.createQueryEXT();
      if (this.v2) {
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q as WebGLQuery);
      } else {
        ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, q);
      }
      this.active = q;
    } catch (error) {
      void error;
    }
  }

  private end(): void {
    if (!this.active || !this.gl) {
      return;
    }
    try {
      if (this.v2) {
        this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      } else {
        this.ext.endQueryEXT(this.ext.TIME_ELAPSED_EXT);
      }
      this.pending.push(this.active);
    } catch (error) {
      void error;
    }
    this.active = null;
  }

  private drop(q: unknown): void {
    try {
      if (this.v2) {
        this.gl?.deleteQuery(q as WebGLQuery);
      } else {
        this.ext.deleteQueryEXT(q);
      }
    } catch (error) {
      void error;
    }
  }

  private poll(): void {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !this.pending.length) {
      return;
    }
    let disjoint = false;
    try {
      disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);          // 期间显卡被打断过(切后台、降频):这批结果不可信,丢掉
    } catch (error) {
      void error;
    }
    while (this.pending.length) {
      const q = this.pending[0];
      let ready = false;
      let ns = 0;
      try {
        ready = this.v2 ? !!gl.getQueryParameter(q as WebGLQuery, gl.QUERY_RESULT_AVAILABLE) : !!ext.getQueryObjectEXT(q, ext.QUERY_RESULT_AVAILABLE_EXT);
        if (ready) {
          ns = Number(this.v2 ? gl.getQueryParameter(q as WebGLQuery, gl.QUERY_RESULT) : ext.getQueryObjectEXT(q, ext.QUERY_RESULT_EXT));
        }
      } catch (error) {
        void error;
        ready = true;
        ns = -1;
      }
      if (!ready && this.pending.length < 24) {
        break;
      }
      this.pending.shift();
      this.drop(q);
      if (ready && !disjoint && ns > 0) {
        this.samples.push(ns / 1e6);
      }
    }
  }
}

/** 设备 / 浏览器 / 电源信息(测速表表头和复制结果用;拿不到的项是 null)。 */
export async function deviceInfo(): Promise<Record<string, unknown>> {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & {
    deviceMemory?: number;
    userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string; mobile?: boolean };
    getBattery?: () => Promise<{ charging: boolean; level: number }>;
  };
  let battery: { charging: boolean; level: number } | null = null;
  try {
    if (nav.getBattery) {
      const b = await nav.getBattery();
      battery = { charging: b.charging, level: Math.round(b.level * 100) };
    }
  } catch (error) {
    void error;
  }
  const brands = nav.userAgentData?.brands?.filter((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(' / ');
  return {
    browser: brands || null,
    platform: nav.userAgentData?.platform ?? null,
    ua: nav.userAgent ?? null,
    cores: nav.hardwareConcurrency ?? null,
    memGB: nav.deviceMemory ?? null,
    battery,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : null,
    screen: typeof screen !== 'undefined' ? [screen.width, screen.height] : null,
  };
}
