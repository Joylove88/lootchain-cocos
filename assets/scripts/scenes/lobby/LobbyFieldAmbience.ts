import { gameAudio } from '../../audio/GameAudio';
import { MAP_LIGHTS, MAP_WATER } from './LobbyFieldGlowData';

/**
 * 野外环境声(2026-11-22 野外沉浸感第一步:「看着森林却听不到森林」)。
 * 买的音效包不在这台电脑上,先全部现场合成(WebAudio,零音频文件,做法同地宫小样 G3DAudio,这里独立一份不依赖实验模块):
 *   底层  = 循环噪声 → 滤波 → 音量,一个很慢的振荡器推音量和滤波频率 = 一阵一阵的风(林地树叶沙沙 / 荒原干风带沙 / 枯木林低沉阴风)
 *   水声  = 两层带通噪声 + 两个不同频率的起伏,按离最近水面的距离开大关小(MAP_WATER)
 *   火堆  = 稀疏小爆点的噼啪 + 一层低频呼呼,按离火堆的距离开大关小(MAP_LIGHTS 里的 fire)
 *   零星  = 林地 / 晨风村鸟叫(扫频短音串);荒原偶尔一声鹰啸;枯木林偶尔乌鸦
 * 跟「音效」开关走;每帧 step 续一次命,停止调用 0.8 秒后自己淡出(离开野外不用另外关),3 秒后挂起声卡。
 * 只有网页端有 WebAudio,原生端什么都不做。离线渲染自检:renderStats(code, 秒)。
 */
interface Profile {
  /** [滤波类型, 频率, Q, 音量, 起伏幅度, 起伏频率, 声像] */
  beds: Array<[BiquadFilterType, number, number, number, number, number, number]>;
  birds?: boolean;
  hawk?: boolean;
  crows?: boolean;
}

const PROFILES: Record<string, Profile> = {
  WOODS: {
    beds: [['bandpass', 520, 0.9, 0.05, 0.7, 0.06, -0.2], ['bandpass', 1500, 1.1, 0.024, 0.8, 0.09, 0.3], ['highpass', 4200, 0.5, 0.008, 0.9, 0.13, 0],
      ['lowpass', 110, 0.7, 0.08, 0, 0, 0]],
    birds: true,
  },
  VILLAGE: {
    beds: [['bandpass', 600, 0.9, 0.035, 0.6, 0.05, -0.2], ['bandpass', 1700, 1.2, 0.016, 0.7, 0.08, 0.3], ['lowpass', 120, 0.7, 0.07, 0, 0, 0]],
    birds: true,
  },
  GRAY: {
    // 干风:中低频一阵一阵 + 高频沙沙(风沙打地)
    beds: [['bandpass', 380, 0.8, 0.07, 0.85, 0.045, -0.25], ['bandpass', 900, 1.0, 0.03, 0.8, 0.07, 0.3], ['highpass', 3200, 0.6, 0.014, 0.95, 0.06, 0.1],
      ['lowpass', 90, 0.7, 0.09, 0.3, 0.03, 0]],
    hawk: true,
  },
  DEADWOOD: {
    // 阴风:低沉、起伏慢
    beds: [['lowpass', 240, 0.9, 0.09, 0.6, 0.035, -0.3], ['bandpass', 420, 2.2, 0.03, 0.75, 0.05, 0.35], ['bandpass', 1100, 3, 0.008, 0.85, 0.07, 0],
      ['lowpass', 70, 0.7, 0.08, 0, 0, 0]],
    crows: true,
  },
};

const MASTER = 0.78;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一套环境声(live 接声卡,离线渲染接 OfflineAudioContext)。 */
class AmbienceRig {
  readonly ctx: BaseAudioContext;
  readonly out: GainNode;
  private readonly rnd: () => number;
  private readonly noise: AudioBuffer;
  private readonly crackle: AudioBuffer;
  private readonly profile: Profile;
  private water: GainNode | null = null;
  private fire: GainNode | null = null;
  private fireRoar: GainNode | null = null;
  private nextBird = 0;
  private nextCall = 0;

  constructor(ctx: BaseAudioContext, code: string, dest: AudioNode) {
    this.ctx = ctx;
    this.profile = PROFILES[code];
    this.rnd = mulberry(20261122);
    const sr = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, Math.floor(sr * 4), sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i += 1) {
      nd[i] = this.rnd() * 2 - 1;
    }
    this.crackle = ctx.createBuffer(1, Math.floor(sr * 6), sr);
    const cd = this.crackle.getChannelData(0);
    let pop = 0;
    let decay = 0.999;
    for (let i = 0; i < cd.length; i += 1) {
      if (this.rnd() < 13 / sr) {
        pop = (0.25 + this.rnd() * 0.75) * (this.rnd() < 0.12 ? 1.6 : 0.7);
        decay = 1 - 1 / (sr * (0.0015 + this.rnd() * 0.006));
      }
      cd[i] = (this.rnd() * 2 - 1) * (pop + 0.03);
      pop *= decay;
    }
    // 总线:压限 + 软削波 → 输出
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i += 1) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 1.3) / Math.tanh(1.3);
    }
    clip.curve = curve;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    comp.connect(clip);
    clip.connect(this.out);
    this.out.connect(dest);
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(comp);
    for (const [type, f, q, gain, wob, wobHz, pan] of this.profile.beds) {
      this.loop(bus, this.noise, type, f, q, gain, pan, wob, wobHz);
    }
    if (MAP_WATER[code]?.length) {
      // 溪水:两层带通 + 两个快慢不同的起伏(哗哗、咕咚)
      this.water = ctx.createGain();
      this.water.gain.value = 0;
      this.water.connect(bus);
      this.loop(this.water, this.noise, 'bandpass', 1250, 0.7, 0.12, -0.1, 0.35, 3.1);
      this.loop(this.water, this.noise, 'bandpass', 2600, 1.4, 0.05, 0.15, 0.5, 5.3);
      this.loop(this.water, this.noise, 'lowpass', 260, 0.8, 0.08, 0, 0.25, 0.7);
    }
    if ((MAP_LIGHTS[code] ?? []).some((l) => l[2] === 'fire')) {
      this.fire = this.loop(bus, this.crackle, 'highpass', 900, 0.6, 0, -0.1);
      this.fireRoar = this.loop(bus, this.noise, 'lowpass', 300, 0.8, 0, -0.1);
    }
  }

  private loop(out: AudioNode, buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, gain: number, pan: number, wob = 0, wobHz = 0.1): GainNode {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(fl);
    fl.connect(g);
    if (wob > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = wobHz;
      const d1 = ctx.createGain();
      d1.gain.value = gain * wob;
      const d2 = ctx.createGain();
      d2.gain.value = f * wob * 0.5;
      lfo.connect(d1);
      d1.connect(g.gain);
      lfo.connect(d2);
      d2.connect(fl.frequency);
      lfo.start();
    }
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(out);
    src.start(ctx.currentTime, this.rnd() * 3);
    return g;
  }

  /** 水 / 火的远近(0 = 听不见,1 = 就在旁边)。 */
  setNear(water: number, fire: number, when: number): void {
    this.water?.gain.setTargetAtTime(water, when, 0.4);
    this.fire?.gain.setTargetAtTime(0.15 * fire, when, 0.3);
    this.fireRoar?.gain.setTargetAtTime(0.1 * fire, when, 0.3);
  }

  /** 把零星的鸟叫 / 鹰啸 / 乌鸦排到 until 为止(live 每帧排半秒以后,离线一次排完)。 */
  schedule(until: number): void {
    const p = this.profile;
    while (p.birds && this.nextBird < until) {
      const t = Math.max(this.nextBird, this.ctx.currentTime + 0.05);
      this.song(t);
      this.nextBird = t + 2.5 + this.rnd() * 5.5;
    }
    while ((p.hawk || p.crows) && this.nextCall < until) {
      const t = Math.max(this.nextCall, this.ctx.currentTime + 0.05);
      if (this.nextCall > 0) {
        if (p.hawk) {
          this.hawkCry(t);
        } else {
          this.caw(t);
        }
      }
      this.nextCall = t + (p.hawk ? 24 : 18) + this.rnd() * 20;
    }
  }

  private tone(t: number, dur: number, f0: number, f1: number, vol: number, pan: number, type: OscillatorType = 'sine', vibrato = 0): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    if (vibrato > 0) {
      const v = ctx.createOscillator();
      v.frequency.value = 7;
      const vd = ctx.createGain();
      vd.gain.value = vibrato;
      v.connect(vd);
      vd.connect(o.frequency);
      v.start(t);
      v.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    o.connect(g);
    g.connect(pn);
    pn.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 一段鸟叫:两种,上扬的啾啾(2~5 声)或一串快速颤音。 */
  private song(t: number): void {
    const pan = this.rnd() * 1.6 - 0.8;
    const vol = 0.018 + this.rnd() * 0.02;
    if (this.rnd() < 0.6) {
      const n = 2 + Math.floor(this.rnd() * 4);
      const base = 2600 + this.rnd() * 1400;
      for (let i = 0; i < n; i += 1) {
        const f = base * (0.95 + this.rnd() * 0.12);
        this.tone(t + i * (0.13 + this.rnd() * 0.06), 0.07 + this.rnd() * 0.05, f, f * (1.25 + this.rnd() * 0.3), vol, pan);
      }
    } else {
      const n = 7 + Math.floor(this.rnd() * 6);
      const base = 3300 + this.rnd() * 700;
      for (let i = 0; i < n; i += 1) {
        this.tone(t + i * 0.055, 0.045, base * 1.08, base * 0.92, vol * 0.8, pan);
      }
    }
  }

  /** 鹰啸:很高的一声往下滑(kee-eer),带颤音,远处。 */
  private hawkCry(t: number): void {
    const pan = this.rnd() * 1.2 - 0.6;
    this.tone(t, 1.0, 2700, 1650, 0.016, pan, 'sine', 55);
    this.tone(t, 1.0, 5400, 3300, 0.004, pan, 'sine', 90);
  }

  /** 乌鸦:锯齿波过带通的两声沙哑短叫。 */
  private caw(t: number): void {
    const ctx = this.ctx;
    const pan = this.rnd() * 1.4 - 0.7;
    const n = 2 + Math.floor(this.rnd() * 2);
    for (let i = 0; i < n; i += 1) {
      const s = t + i * 0.42;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(430 + this.rnd() * 60, s);
      o.frequency.linearRampToValueAtTime(360, s + 0.26);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1300;
      bp.Q.value = 2.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.03, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.28);
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      o.connect(bp);
      bp.connect(g);
      g.connect(pn);
      pn.connect(this.out);
      o.start(s);
      o.stop(s + 0.32);
    }
  }
}

class FieldAmbienceManager {
  private ctx: AudioContext | null = null;
  private rig: AmbienceRig | null = null;
  private code = '';
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private unlockBound = false;
  private lastUpdate = -1;

  private supported(): boolean {
    return typeof window !== 'undefined' && typeof (window as unknown as { AudioContext?: unknown }).AudioContext === 'function';
  }

  /** 每帧调(只在野外):按地图 / 位置更新;停调 0.8 秒后自己淡出。 */
  step(code: string, x: number, y: number): void {
    if (!PROFILES[code] || !this.supported()) {
      return;
    }
    if (!gameAudio.sfxEnabled()) {
      if (this.rig) {
        this.rig.out.gain.setTargetAtTime(0, this.rig.ctx.currentTime, 0.2);
      }
      return;
    }
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch (error) {
        void error;
        return;
      }
      this.bindUnlock();
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    if (this.code !== code || !this.rig) {
      if (this.rig) {
        const old = this.rig;
        old.out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        setTimeout(() => old.out.disconnect(), 2000);
      }
      this.rig = new AmbienceRig(ctx, code, ctx.destination);
      this.code = code;
      this.lastUpdate = -1;
    }
    const rig = this.rig;
    const now = ctx.currentTime;
    // 自动化事件不要每帧都排:一秒 5 次够顺(续命窗口 0.8 秒)
    if (this.lastUpdate >= 0 && now - this.lastUpdate < 0.2 && now >= this.lastUpdate) {
      return;
    }
    this.lastUpdate = now;
    let dw = Infinity;
    for (const p of MAP_WATER[code] ?? []) {
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < dw) {
        dw = d;
      }
    }
    let df = Infinity;
    for (const l of MAP_LIGHTS[code] ?? []) {
      if (l[2] === 'fire') {
        df = Math.min(df, Math.hypot((l[0] as number) - x, (l[1] as number) - y));
      }
    }
    const water = Math.max(0, Math.min(1, 1 - (dw - 180) / 1100));
    const fire = Math.max(0, Math.min(1, 1 - (df - 120) / 900));
    rig.setNear(water * water, fire * fire, now);
    rig.schedule(now + 0.6);
    // 续命:现在升到正常音量,0.8 秒后若没再续就淡出
    const g = rig.out.gain;
    // 先把当前值钉住再排(有的浏览器 cancel 之后会退回最初的 0)
    const cur = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(cur, now);
    g.setTargetAtTime(MASTER, now, 0.6);
    g.setTargetAtTime(0, now + 0.8, 0.5);
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
    }
    this.suspendTimer = setTimeout(() => {
      void this.ctx?.suspend().catch(() => undefined);
    }, 3000);
  }

  private bindUnlock(): void {
    if (this.unlockBound || typeof window === 'undefined') {
      return;
    }
    this.unlockBound = true;
    const unlock = (): void => {
      void this.ctx?.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchend', unlock, { passive: true });
  }

  /** 离线渲染自检:某张图站在 (x, y) 渲染 sec 秒,返回峰值 / 响度(dBFS)/ 削波比例。 */
  async renderStats(code: string, x: number, y: number, sec = 12): Promise<{ peak: number; rms: number; clip: number } | null> {
    const Offline = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
    if (!Offline || !PROFILES[code]) {
      return null;
    }
    const ctx = new Offline(2, Math.floor(44100 * sec), 44100);
    const rig = new AmbienceRig(ctx, code, ctx.destination);
    rig.out.gain.value = MASTER;
    let dw = Infinity;
    for (const p of MAP_WATER[code] ?? []) {
      dw = Math.min(dw, Math.hypot(p[0] - x, p[1] - y));
    }
    let df = Infinity;
    for (const l of MAP_LIGHTS[code] ?? []) {
      if (l[2] === 'fire') {
        df = Math.min(df, Math.hypot((l[0] as number) - x, (l[1] as number) - y));
      }
    }
    const water = Math.max(0, Math.min(1, 1 - (dw - 180) / 1100));
    const fire = Math.max(0, Math.min(1, 1 - (df - 120) / 900));
    rig.setNear(water * water, fire * fire, 0);
    rig.schedule(sec);
    const buf = await ctx.startRendering();
    let peak = 0;
    let sum = 0;
    let clip = 0;
    for (let c = 0; c < buf.numberOfChannels; c += 1) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i += 1) {
        const v = Math.abs(d[i]);
        peak = Math.max(peak, v);
        sum += v * v;
        if (v > 0.99) {
          clip += 1;
        }
      }
    }
    const n = buf.length * buf.numberOfChannels;
    return { peak: 20 * Math.log10(peak || 1e-9), rms: 10 * Math.log10(sum / n || 1e-12), clip: clip / n };
  }
}

export const fieldAmbience = new FieldAmbienceManager();
