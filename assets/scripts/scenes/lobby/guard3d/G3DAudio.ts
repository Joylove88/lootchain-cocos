/**
 * 程序化音效(实验,2026-11-17;地宫小样 / 野外小样用)。
 *
 * 用户:「还有音效我们也需要做一下。」参考的那个 FPS 仓库里有一个「程序化音效台」:所有声音都是代码现场合成的,没有任何音频文件。
 * 这里按同一条路子做我们自己的一套(冷兵器、地宫、野外),全部用浏览器的 WebAudio:
 * - 原料只有两样:噪声(一段随机数,循环着用)和振荡器(正弦 / 锯齿);
 * - 一个声音 = 几层叠起来,每层 = 原料 → 滤波(只留某一段频率,可以随时间滑动)→ 音量包络(多快起来、多快没掉);
 *   比如「挥剑」是一段带通噪声、中心频率先升后降;「命中」是一下低频的闷响 + 一下很短的噪声脆响 + 几个不成倍数关系的高频(金属味);
 * - 每次触发都带一点随机(音高、长短、左右),连着听不会像同一段录音在重复;
 * - 混响也是合成的:一段按指数衰减、越往后越闷的噪声当「房间的回声」(石头大厅 2.4 秒,野外很短);
 * - 总线上有压限和软削波,同一帧打中五只怪也不会爆音。
 *
 * 同一套配方既能接真实的声卡(AudioContext),也能离线渲染(OfflineAudioContext):
 * 自检(每个声音渲染出来量峰值 / 响度 / 有没有削波)和「给逐帧录的视频配音轨」(把录制期间触发过的声音按时刻重放一遍、渲染成波形)都靠后者。
 *
 * 只有网页端有 WebAudio;原生端这个模块什么都不做(sfx.play 直接返回)。浏览器规定要用户点过 / 按过键之后才能出声,所以第一次输入时调 sfx.unlock()。
 */

export interface PlayOpts {
  /** 音量倍数(按远近算好再传进来);左右声像 -1 ~ 1。 */
  gain?: number;
  pan?: number;
  /** 重击 / 大个子:更沉、更长。 */
  heavy?: boolean;
  /** 这一下大概多长(秒;挥剑按招式的快慢给)。 */
  dur?: number;
}

type Space = 'hall' | 'open' | 'town';
type Ctx = BaseAudioContext;

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

/** 一条声音通路:自己的噪声、混响、总线。live 的和离线渲染的各建一条。 */
export class AudioRig {
  readonly ctx: Ctx;
  readonly space: Space;
  private rnd: () => number;
  private noise: AudioBuffer;
  private crackle: AudioBuffer;
  private dry: GainNode;
  private wet: GainNode;
  private master: GainNode;
  private fire: GainNode | null = null;
  private fireRoar: GainNode | null = null;
  private amb: GainNode | null = null;
  private next: Record<string, number> = {};
  private last: Record<string, number> = {};

  constructor(ctx: Ctx, space: Space, volume = 0.8, seed = 20261117) {
    this.ctx = ctx;
    this.space = space;
    this.rnd = mulberry(seed);
    const sr = ctx.sampleRate;
    // 噪声:4 秒白噪声,所有带噪声的层都从里面随机截一段
    this.noise = ctx.createBuffer(1, Math.floor(sr * 4), sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i += 1) {
      nd[i] = this.rnd() * 2 - 1;
    }
    // 火的噼啪:稀疏的小爆点(每秒十几个,大小不一,各自很快衰减)+ 一层很轻的嘶嘶声
    this.crackle = ctx.createBuffer(1, Math.floor(sr * 6), sr);
    const cd = this.crackle.getChannelData(0);
    let pop = 0;
    let decay = 0.999;
    for (let i = 0; i < cd.length; i += 1) {
      if (this.rnd() < 14 / sr) {
        pop = (0.25 + this.rnd() * 0.75) * (this.rnd() < 0.12 ? 1.6 : 0.7);
        decay = 1 - 1 / (sr * (0.0015 + this.rnd() * 0.006));
      }
      cd[i] = (this.rnd() * 2 - 1) * (pop + 0.035);
      pop *= decay;
    }
    // 总线:干声 + 混响 → 压限 → 软削波 → 总音量
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i += 1) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
    }
    clip.curve = curve;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    comp.connect(clip);
    clip.connect(this.master);
    this.master.connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(comp);
    this.wet = ctx.createGain();
    const conv = ctx.createConvolver();
    // 石头大厅 2.4 秒;野外很短;城里的广场四面是房子,有一点回声(1.2 秒)
    conv.buffer = this.impulse(space === 'hall' ? 2.4 : space === 'town' ? 1.2 : 0.55, space === 'hall' ? 0.018 : space === 'town' ? 0.03 : 0.006, space === 'hall' ? 5200 : space === 'town' ? 4200 : 7000);
    const back = ctx.createGain();
    back.gain.value = space === 'hall' ? 0.9 : 0.35;
    this.wet.connect(conv);
    conv.connect(back);
    back.connect(comp);
  }

  /** 合成的房间回声:按指数衰减的噪声,越往后高频越少(石头吸掉了);两个声道各用各的随机数,听起来有宽度。 */
  private impulse(decay: number, pre: number, bright: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * (decay + pre));
    const buf = this.ctx.createBuffer(2, n, sr);
    const p = Math.floor(sr * pre);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = p; i < n; i += 1) {
        const t = (i - p) / sr;
        const k = t / decay;
        // 一阶低通:截止频率从 bright 一路降到三分之一
        const fc = bright * (1 - 0.67 * k);
        const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        lp += a * ((this.rnd() * 2 - 1) - lp);
        const early = t < 0.06 ? 1 + 1.4 * (1 - t / 0.06) : 1;         // 开头几十毫秒密一点、响一点(早期反射)
        d[i] = lp * Math.exp(-6.9 * k) * early;
      }
    }
    return buf;
  }

  setVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // ───────────────────────── 积木 ─────────────────────────
  private r(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }

  /** 包络:pts = [相对时刻, 值]…;exp = 指数过渡(音量衰减、频率滑动更自然)。 */
  private env(p: AudioParam, t: number, pts: Array<[number, number]>, exp = true): void {
    p.setValueAtTime(Math.max(1e-4, pts[0][1]), t + pts[0][0]);
    for (let i = 1; i < pts.length; i += 1) {
      const v = Math.max(1e-4, pts[i][1]);
      if (exp) {
        p.exponentialRampToValueAtTime(v, t + pts[i][0]);
      } else {
        p.linearRampToValueAtTime(v, t + pts[i][0]);
      }
    }
  }

  /** 接到总线:pan = 左右,send = 送多少进混响。返回要往里接的那个节点。 */
  private bus(gain: number, pan: number, send: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(this.dry);
    if (send > 0) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      p.connect(s);
      s.connect(this.wet);
    }
    return g;
  }

  /**
   * 一层噪声:dur 秒;type / f / q = 滤波器(f 可以给 [时刻比例, 频率] 的折线让它滑动);amp = 音量折线 [时刻比例, 值]。
   */
  private nz(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f: number | Array<[number, number]>, q: number, amp: Array<[number, number]>, rate = 1): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = rate;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    if (typeof f === 'number') {
      fl.frequency.value = f;
    } else {
      this.env(fl.frequency, t, f.map(([k, v]) => [k * dur, v] as [number, number]));
    }
    const g = this.ctx.createGain();
    this.env(g.gain, t, amp.map(([k, v]) => [k * dur, v] as [number, number]));
    src.connect(fl);
    fl.connect(g);
    g.connect(out);
    src.start(t, this.r(0, 3.5));
    src.stop(t + dur + 0.02);
  }

  /** 一层有音高的:wave 波形,频率从 f0 滑到 f1,amp 同上;lp > 0 再过一道低通。 */
  private tone(out: AudioNode, t: number, dur: number, wave: OscillatorType, f0: number, f1: number, amp: Array<[number, number]>, lp = 0): void {
    const o = this.ctx.createOscillator();
    o.type = wave;
    this.env(o.frequency, t, [[0, f0], [dur, f1]]);
    const g = this.ctx.createGain();
    this.env(g.gain, t, amp.map(([k, v]) => [k * dur, v] as [number, number]));
    if (lp > 0) {
      const fl = this.ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = lp;
      o.connect(fl);
      fl.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** 金属味:几个不成倍数关系的正弦一起响,各自衰减快慢不同(高的先没)。 */
  private metal(out: AudioNode, t: number, base: number, dur: number, peak: number): void {
    const ratios = [1, 1.47, 2.09, 2.83, 3.71, 4.9];
    ratios.forEach((k, i) => {
      const d = dur * (1 - i * 0.12) * this.r(0.8, 1.15);
      this.tone(out, t, d, 'sine', base * k * this.r(0.985, 1.015), base * k * 0.995, [[0, peak / (1 + i * 0.7)], [1, 0.0001]]);
    });
  }

  // ───────────────────────── 配方 ─────────────────────────
  /**
   * 放一个声音。when = 上下文里的时刻(不给 = 现在)。同一个声音 30 毫秒内再触发只算一次(一刀砍中五只怪不叠成一声巨响)。
   */
  play(name: string, o: PlayOpts = {}, when?: number): void {
    const t = Math.max(when ?? this.ctx.currentTime, this.ctx.currentTime) + 0.002;
    const gap = name === 'step' || name === 'stepGrass' || name === 'stepMud' ? 0.12 : 0.03;
    if (this.last[name] !== undefined && Math.abs(t - this.last[name]) < gap) {
      return;
    }
    this.last[name] = t;
    const g = o.gain ?? 1;
    const pan = (o.pan ?? 0) + this.r(-0.06, 0.06);
    const hall = this.space === 'hall';
    const heavy = !!o.heavy;
    switch (name) {
      case 'swing': {
        // 挥剑:一段带通噪声,中心频率先升后降(剑越快声音越尖);大剑另加一层更低的「呼」
        const d = (o.dur ?? (heavy ? 0.36 : 0.28)) * this.r(0.92, 1.08);
        const k = this.r(0.9, 1.12) * (heavy ? 0.78 : 1);
        const out = this.bus(0.85 * g, pan, hall ? 0.22 : 0.08);
        this.nz(out, t, d, 'bandpass', [[0, 420 * k], [0.45, 2300 * k], [1, 700 * k]], 1.6, [[0, 0.001], [0.42, 1], [1, 0.001]]);
        this.nz(out, t + d * 0.1, d * 0.8, 'highpass', 5200, 0.6, [[0, 0.001], [0.4, 0.16], [1, 0.001]]);
        this.nz(out, t, d * 1.1, 'lowpass', [[0, 160], [0.5, 420 * k], [1, 140]], 0.8, [[0, 0.001], [0.5, heavy ? 0.9 : 0.45], [1, 0.001]]);
        break;
      }
      case 'hit': {
        // 命中:低频闷响(砍进肉里)+ 很短的脆响(刃口)+ 一点金属味;重击更沉、尾巴更长
        const out = this.bus(0.85 * g, pan, hall ? 0.3 : 0.1);
        const f = this.r(0.9, 1.1);
        this.tone(out, t, heavy ? 0.22 : 0.13, 'sine', (heavy ? 150 : 185) * f, (heavy ? 42 : 60) * f, [[0, heavy ? 1.2 : 0.9], [1, 0.001]]);
        this.nz(out, t, heavy ? 0.09 : 0.055, 'bandpass', this.r(1500, 2300), 0.9, [[0, 1.3], [1, 0.001]]);
        this.nz(out, t, 0.03, 'bandpass', this.r(3000, 4200), 1.2, [[0, 0.7], [1, 0.001]]);
        this.nz(out, t + 0.004, heavy ? 0.2 : 0.11, 'lowpass', [[0, 1300], [1, 260]], 0.7, [[0, 0.55], [1, 0.001]]);
        this.metal(out, t, this.r(1900, 2500), heavy ? 0.16 : 0.09, 0.09);
        if (heavy) {
          this.tone(out, t, 0.34, 'sine', 70, 36, [[0, 0.9], [1, 0.001]]);
        }
        break;
      }
      case 'step': {
        // 石板地上的靴子:脚跟一下闷的 + 一点砂砾的沙沙;地是湿的,偶尔带一声很轻的水响
        const out = this.bus(0.34 * g, pan, hall ? 0.34 : 0.08);
        const f = this.r(0.85, 1.2);
        this.tone(out, t, 0.06, 'sine', 125 * f, 62 * f, [[0, 0.9], [1, 0.001]]);
        this.nz(out, t, 0.035, 'bandpass', this.r(850, 1500), 1.2, [[0, 0.5], [1, 0.001]]);
        this.nz(out, t + 0.012, 0.05, 'highpass', 3200, 0.5, [[0, 0.1], [1, 0.001]]);
        if (this.rnd() < 0.4) {
          this.nz(out, t + 0.01, 0.07, 'bandpass', [[0, 2600], [1, 1400]], 2.2, [[0, 0.16], [1, 0.001]]);
        }
        break;
      }
      case 'stepGrass': {
        // 草地 / 泥地:没有硬的脚跟声,主要是草叶被踩的一小片沙沙
        const out = this.bus(0.3 * g, pan, 0.05);
        this.nz(out, t, this.r(0.08, 0.12), 'bandpass', [[0, this.r(2600, 3800)], [1, 1500]], 0.8, [[0, 0.001], [0.2, 0.6], [1, 0.001]]);
        this.tone(out, t, 0.07, 'sine', 95, 55, [[0, 0.45], [1, 0.001]]);
        this.nz(out, t + 0.02, 0.09, 'highpass', 5200, 0.5, [[0, 0.001], [0.3, 0.12], [1, 0.001]]);
        break;
      }
      case 'stepMud': {
        // 湿泥地:没有硬的脚跟声,一下软的闷响 + 泥被踩开的「噗嗤」(慢起的低频噪声),有时带一点水声
        const out = this.bus(0.34 * g, pan, 0.06);
        const f = this.r(0.85, 1.2);
        this.tone(out, t, 0.07, 'sine', 105 * f, 52 * f, [[0, 0.7], [1, 0.001]]);
        this.nz(out, t, this.r(0.09, 0.13), 'lowpass', [[0, 950], [1, 280]], 0.9, [[0, 0.001], [0.25, 0.75], [1, 0.001]]);
        this.nz(out, t + 0.015, 0.03, 'bandpass', this.r(1500, 2200), 1.4, [[0, 0.22], [1, 0.001]]);
        if (this.rnd() < 0.45) {
          this.nz(out, t + 0.02, 0.09, 'bandpass', [[0, 2700], [1, 1300]], 2.2, [[0, 0.001], [0.2, 0.2], [1, 0.001]]);
        }
        break;
      }
      case 'owl': {
        // 远处的猫头鹰:低低的两三声「呜 —— 呜呜」,大半是回声
        const out = this.bus(0.1 * g, pan, 0.8);
        const f = this.r(310, 380);
        let tt = t;
        for (const [d, k] of [[0.42, 1], [0.2, 0.96], [0.34, 0.94]] as Array<[number, number]>) {
          this.tone(out, tt, d, 'sine', f * k * 1.03, f * k * 0.97, [[0, 0.001], [0.2, 0.9], [0.7, 0.7], [1, 0.001]], 700);
          this.tone(out, tt, d, 'sine', f * k * 2.02, f * k * 1.96, [[0, 0.001], [0.2, 0.12], [1, 0.001]]);
          tt += d + (d > 0.4 ? 0.34 : 0.09);
        }
        break;
      }
      case 'bell': {
        // 远处教堂的钟:很低的一声,带着不成倍数的泛音,拖得很长,大半是回声
        const out = this.bus(0.07 * g, pan, 0.9);
        const f = 196 * this.r(0.99, 1.01);
        for (const [k, a, d] of [[1, 1, 4.2], [2.0, 0.55, 3.2], [2.76, 0.4, 2.4], [5.4, 0.22, 1.4], [8.9, 0.1, 0.8]] as Array<[number, number, number]>) {
          this.tone(out, t, d, 'sine', f * k, f * k * 0.998, [[0, 0.001], [0.004, a], [1, 0.001]]);
        }
        this.nz(out, t, 0.03, 'bandpass', 900, 1.5, [[0, 0.3], [1, 0.001]]);
        break;
      }
      case 'dash': {
        // 突进:一长段「呼」+ 膝盖和靴子在石板上滑的摩擦声(断断续续的中高频噪声)
        const d = o.dur ?? 0.6;
        const out = this.bus(0.55 * g, pan, hall ? 0.25 : 0.08);
        this.nz(out, t, d, 'bandpass', [[0, 300], [0.35, 1500], [1, 420]], 1.1, [[0, 0.001], [0.3, 1], [1, 0.001]]);
        this.nz(out, t, d * 0.9, 'lowpass', [[0, 200], [0.4, 520], [1, 160]], 0.7, [[0, 0.001], [0.35, 0.8], [1, 0.001]]);
        const n = Math.floor(d * 34);
        for (let i = 0; i < n; i += 1) {
          const tt = t + d * 0.2 + (i / n) * d * 0.7 + this.r(0, 0.012);
          this.nz(out, tt, this.r(0.012, 0.03), 'bandpass', this.r(1700, 3400), 2.5, [[0, this.r(0.1, 0.3) * (1 - i / n)], [1, 0.001]]);
        }
        break;
      }
      case 'slam': {
        // 砸地:很低的一下「咚」(带一点失真才有分量)+ 石头开裂的脆响 + 往后滚的低频隆隆 + 碎石落地的一串小声
        const out = this.bus(1.0 * g, pan, hall ? 0.4 : 0.15);
        this.tone(out, t, 0.55, 'sine', 92, 30, [[0, 1.5], [0.15, 0.9], [1, 0.001]]);
        this.tone(out, t, 0.2, 'triangle', 160, 50, [[0, 0.7], [1, 0.001]]);
        this.nz(out, t, 0.05, 'highpass', 900, 0.5, [[0, 1.1], [1, 0.001]]);
        this.nz(out, t + 0.01, 0.9, 'lowpass', [[0, 420], [1, 90]], 0.8, [[0, 0.9], [1, 0.001]]);
        this.nz(out, t + 0.02, 0.28, 'bandpass', [[0, 900], [1, 500]], 1.4, [[0, 0.5], [0.3, 0.3], [1, 0.001]]);
        for (let i = 0; i < 9; i += 1) {
          const tt = t + this.r(0.12, 0.75);
          this.nz(out, tt, this.r(0.015, 0.04), 'bandpass', this.r(1200, 4200), 3, [[0, this.r(0.08, 0.26)], [1, 0.001]]);
        }
        break;
      }
      case 'wave': {
        // 剑气:一声带音高的「嗡 —— 呼」(两条略微错开的锯齿波过一个往上滑的带通)+ 一层气流声;尾巴多送一些进混响
        const d = o.dur ?? 0.62;
        const out = this.bus(0.5 * g, pan, hall ? 0.45 : 0.18);
        const f = this.r(0.94, 1.06);
        for (const det of [1, 1.012, 0.5]) {
          const os = this.ctx.createOscillator();
          os.type = 'sawtooth';
          this.env(os.frequency, t, [[0, 210 * f * det], [d, 150 * f * det]]);
          const fl = this.ctx.createBiquadFilter();
          fl.type = 'bandpass';
          fl.Q.value = 2.2;
          this.env(fl.frequency, t, [[0, 500], [d * 0.3, 2100], [d, 700]]);
          const gg = this.ctx.createGain();
          this.env(gg.gain, t, [[0, 0.001], [d * 0.12, det === 0.5 ? 0.35 : 0.24], [d, 0.001]]);
          os.connect(fl);
          fl.connect(gg);
          gg.connect(out);
          os.start(t);
          os.stop(t + d + 0.02);
        }
        this.nz(out, t, d, 'bandpass', [[0, 900], [0.3, 3200], [1, 1100]], 1.2, [[0, 0.001], [0.15, 0.8], [1, 0.001]]);
        break;
      }
      case 'bite': {
        // 怪扑咬:喉咙里一声短的低吼(锯齿波 + 颤)+ 牙齿合上的两下脆响
        const out = this.bus(0.5 * g, pan, hall ? 0.25 : 0.08);
        const f = (heavy ? 62 : 105) * this.r(0.88, 1.15);
        const d = heavy ? 0.42 : 0.26;
        const os = this.ctx.createOscillator();
        os.type = 'sawtooth';
        this.env(os.frequency, t, [[0, f * 1.25], [d * 0.3, f], [d, f * 0.8]]);
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = this.r(24, 34);
        const depth = this.ctx.createGain();
        depth.gain.value = 0.5;
        const gg = this.ctx.createGain();
        this.env(gg.gain, t, [[0, 0.001], [d * 0.15, 0.55], [d, 0.001]]);
        const trem = this.ctx.createGain();
        trem.gain.value = 0.6;
        lfo.connect(depth);
        depth.connect(trem.gain);
        const fl = this.ctx.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.value = heavy ? 480 : 760;
        os.connect(fl);
        fl.connect(trem);
        trem.connect(gg);
        gg.connect(out);
        os.start(t);
        lfo.start(t);
        os.stop(t + d + 0.02);
        lfo.stop(t + d + 0.02);
        this.nz(out, t + d * 0.1, d * 0.8, 'bandpass', heavy ? 520 : 900, 1.2, [[0, 0.001], [0.2, 0.28], [1, 0.001]]);
        this.nz(out, t + d * 0.55, 0.022, 'bandpass', this.r(1600, 2400), 2, [[0, 0.5], [1, 0.001]]);
        this.nz(out, t + d * 0.55 + 0.035, 0.018, 'bandpass', this.r(2000, 2900), 2, [[0, 0.3], [1, 0.001]]);
        break;
      }
      case 'fall': {
        // 怪倒地:身子砸在石板上的一下闷响 + 一小段拖擦
        const out = this.bus(0.6 * g, pan, hall ? 0.3 : 0.1);
        this.tone(out, t, heavy ? 0.32 : 0.2, 'sine', heavy ? 78 : 105, heavy ? 34 : 48, [[0, 1], [1, 0.001]]);
        this.nz(out, t, 0.24, 'lowpass', [[0, 600], [1, 150]], 0.7, [[0, 0.6], [1, 0.001]]);
        this.nz(out, t + 0.06, 0.2, 'bandpass', this.r(900, 1500), 1.5, [[0, 0.001], [0.2, 0.14], [1, 0.001]]);
        break;
      }
      case 'drip': {
        // 水滴进积水:一声很短、音高往下掉的「叮咚」,大半声音是回声
        const out = this.bus(0.12 * g, pan, 0.9);
        const f = this.r(900, 1900);
        this.tone(out, t, 0.07, 'sine', f * 1.5, f, [[0, 0.8], [1, 0.001]]);
        this.tone(out, t + 0.03, 0.09, 'sine', f * 0.74, f * 0.7, [[0, 0.35], [1, 0.001]]);
        break;
      }
      case 'bird': {
        // 鸟:几个很快的小滑音(正弦,音高各不相同),一串两到五个
        const out = this.bus(0.09 * g, pan, 0.3);
        const n = 2 + Math.floor(this.rnd() * 4);
        const base = this.r(2400, 4600);
        let tt = t;
        for (let i = 0; i < n; i += 1) {
          const d = this.r(0.05, 0.11);
          const a = base * this.r(0.85, 1.25);
          this.tone(out, tt, d, 'sine', a, a * this.r(0.7, 1.35), [[0, 0.001], [0.2, 0.9], [1, 0.001]]);
          tt += d + this.r(0.03, 0.09);
        }
        break;
      }
      default:
        break;
    }
  }

  // ───────────────────────── 环境声 ─────────────────────────
  /** 一条一直响着的环境声:buf 循环 → 滤波 → 音量;wob > 0 = 慢慢起伏。 */
  private loop(buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, gain: number, pan: number, wob = 0, wobHz = 0.1): GainNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(fl);
    fl.connect(g);
    if (wob > 0) {
      // 慢慢起伏(阵风):一个很慢的振荡器同时推音量和滤波频率
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = wobHz;
      const d1 = this.ctx.createGain();
      d1.gain.value = gain * wob;
      const d2 = this.ctx.createGain();
      d2.gain.value = f * wob * 0.6;
      lfo.connect(d1);
      d1.connect(g.gain);
      lfo.connect(d2);
      d2.connect(fl.frequency);
      lfo.start();
    }
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.amb!);
    src.start(this.ctx.currentTime, this.r(0, 3));
    return g;
  }

  /**
   * 开环境声。地宫:很低的房间底噪、从天窗灌下来的风、火盆的噼啪(远近由 setFire 给)、水滴;
   * 野外:树叶里的风(一阵一阵)、草叶的沙沙、鸟。
   */
  ambience(): void {
    if (this.amb) {
      return;
    }
    this.amb = this.ctx.createGain();
    this.amb.gain.value = 1;
    this.amb.connect(this.dry);
    const s = this.ctx.createGain();
    s.gain.value = this.space === 'hall' ? 0.25 : 0.06;
    this.amb.connect(s);
    s.connect(this.wet);
    if (this.space === 'town') {
      // 城里:很轻的风、锻炉的火(走近了才响)
      this.loop(this.noise, 'bandpass', 420, 0.9, 0.03, -0.2, 0.6, 0.05);
      this.loop(this.noise, 'bandpass', 1300, 1.1, 0.012, 0.3, 0.7, 0.08);
      this.loop(this.noise, 'lowpass', 110, 0.7, 0.07, 0);
      this.fire = this.loop(this.crackle, 'highpass', 900, 0.6, 0, -0.2);
      this.fireRoar = this.loop(this.noise, 'lowpass', 300, 0.8, 0, -0.2);
    } else if (this.space === 'hall') {
      this.loop(this.noise, 'lowpass', 130, 0.7, 0.13, 0);
      this.loop(this.noise, 'bandpass', 380, 2.4, 0.035, -0.3, 0.6, 0.07);
      this.loop(this.noise, 'bandpass', 760, 3.2, 0.014, 0.4, 0.7, 0.11);
      // 火:噼啪 + 一层低频的「呼呼」,两层一起随远近变(setFire)
      this.fire = this.loop(this.crackle, 'highpass', 900, 0.6, 0, 0.25);
      this.fireRoar = this.loop(this.noise, 'lowpass', 300, 0.8, 0, 0.25);
    } else {
      this.loop(this.noise, 'bandpass', 520, 0.9, 0.05, -0.2, 0.7, 0.06);
      this.loop(this.noise, 'bandpass', 1500, 1.1, 0.022, 0.3, 0.8, 0.09);
      this.loop(this.noise, 'highpass', 4200, 0.5, 0.008, 0, 0.9, 0.13);
      this.loop(this.noise, 'lowpass', 110, 0.7, 0.1, 0);
      this.fire = this.loop(this.crackle, 'highpass', 900, 0.6, 0, -0.15);
      this.fireRoar = this.loop(this.noise, 'lowpass', 300, 0.8, 0, -0.15);
      // 蟋蟀:很高的一个音,被一个几十赫兹的方波切成一粒一粒,再整体一阵一阵地响。两只,音高和快慢各不相同
      for (const [freq, rate, slow, pan, vol] of [[4300, 58, 0.9, -0.5, 0.012], [3850, 47, 0.63, 0.55, 0.009]] as Array<[number, number, number, number, number]>) {
        const car = this.ctx.createOscillator();
        car.frequency.value = freq;
        const chop = this.ctx.createGain();
        chop.gain.value = 0.5;
        const sq = this.ctx.createOscillator();
        sq.type = 'square';
        sq.frequency.value = rate;
        const sqd = this.ctx.createGain();
        sqd.gain.value = 0.5;
        sq.connect(sqd);
        sqd.connect(chop.gain);
        const swell = this.ctx.createGain();
        swell.gain.value = vol * 0.5;
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = slow;
        const ld = this.ctx.createGain();
        ld.gain.value = vol * 0.5;
        lfo.connect(ld);
        ld.connect(swell.gain);
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        car.connect(chop);
        chop.connect(swell);
        swell.connect(p);
        p.connect(this.amb!);
        car.start();
        sq.start();
        lfo.start();
      }
    }
  }

  /** 火盆离得多近(0 = 听不见,1 = 就在旁边);when = 从哪个时刻起(不给 = 现在)。 */
  setFire(level: number, when?: number): void {
    const t = when ?? this.ctx.currentTime;
    this.fire?.gain.setTargetAtTime(0.16 * level, t, 0.25);
    this.fireRoar?.gain.setTargetAtTime(0.11 * level, t, 0.25);
  }

  /** 把零星的环境声(水滴 / 鸟)排到 until 这个时刻为止。live 每帧调一次(排到半秒以后),离线渲染一次排完。 */
  schedule(until: number): void {
    if (!this.amb) {
      return;
    }
    const kinds: Array<[string, number, number]> = this.space === 'hall' ? [['drip', 1.2, 4.5]] : this.space === 'town' ? [['bell', 9, 26], ['drip', 3, 9]] : [['owl', 7, 19]];
    for (const [name, lo, hi] of kinds) {
      if (this.next[name] === undefined) {
        this.next[name] = this.ctx.currentTime + this.r(0.3, lo);
      }
      while (this.next[name] < until) {
        this.last[name] = -1;
        this.play(name, { gain: this.r(0.5, 1), pan: this.r(-0.8, 0.8) }, this.next[name]);
        this.next[name] += this.r(lo, hi);
      }
    }
  }
}

// ───────────────────────── 全局入口 ─────────────────────────
interface Logged { n: string; t: number; o: PlayOpts }

function wav16(chs: Float32Array[], sr: number): Uint8Array {
  const n = chs[0].length;
  const out = new Uint8Array(44 + n * chs.length * 2);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i += 1) {
      dv.setUint8(o + i, s.charCodeAt(i));
    }
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * chs.length * 2, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, chs.length, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * chs.length * 2, true);
  dv.setUint16(32, chs.length * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * chs.length * 2, true);
  let p = 44;
  for (let i = 0; i < n; i += 1) {
    for (const c of chs) {
      dv.setInt16(p, Math.round(Math.max(-1, Math.min(1, c[i])) * 32767), true);
      p += 2;
    }
  }
  return out;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

class Sfx {
  rig: AudioRig | null = null;
  space: Space = 'hall';
  volume = 0.8;
  muted = false;
  /** 记录模式:触发过的声音连同时刻记下来(逐帧录视频时没有真实的时间轴,录完按这份记录离线渲染成音轨)。 */
  log: Logged[] | null = null;
  /** 记录用的钟(秒):由场景每帧推进(逐帧录的时候就是视频的时间)。 */
  clock = 0;
  fireLevel = 0;

  get ok(): boolean {
    return typeof window !== 'undefined' && !!((window as any).AudioContext || (window as any).webkitAudioContext);
  }

  /** 建好声音通路(还不出声,等 unlock)。space = 混响和环境声用哪一套。 */
  init(space: Space): void {
    this.space = space;
    if (!this.ok || this.muted || (this.rig && this.rig.space === space)) {
      return;
    }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC() as AudioContext;
      this.rig = new AudioRig(ctx, space, this.volume);
      this.rig.ambience();
    } catch (error) {
      console.warn('[g3d] audio', (error as Error)?.message);
      this.rig = null;
    }
  }

  /** 用户第一次点 / 按键时调:浏览器这时才允许出声。 */
  unlock(): void {
    const ctx = this.rig?.ctx as AudioContext | undefined;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  play(name: string, o: PlayOpts = {}): void {
    if (this.log) {
      this.log.push({ n: name, t: this.clock, o: { ...o } });
    }
    const rig = this.rig;
    if (!rig || this.muted || (rig.ctx as AudioContext).state !== 'running') {
      return;
    }
    rig.play(name, o);
  }

  /** 每帧:推进记录用的钟、排零星的环境声、更新火盆的远近。 */
  tick(dt: number, fire: number): void {
    this.clock += dt;
    if (this.log && Math.abs(fire - this.fireLevel) > 0.04) {
      this.log.push({ n: '@fire', t: this.clock, o: { gain: fire } });
    }
    this.fireLevel = fire;
    const rig = this.rig;
    if (rig && (rig.ctx as AudioContext).state === 'running') {
      rig.setFire(fire);
      rig.schedule(rig.ctx.currentTime + 0.5);
    }
  }

  capture(on: boolean): void {
    this.log = on ? [] : null;
    this.clock = 0;
    if (on) {
      this.log!.push({ n: '@fire', t: 0, o: { gain: this.fireLevel } });
    }
  }

  /** 把一份记录(或者单独一个声音)离线渲染成波形。 */
  async render(events: Logged[], secs: number, ambience: boolean, sr = 44100): Promise<Float32Array[]> {
    const OC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const ctx = new OC(2, Math.ceil(secs * sr), sr) as OfflineAudioContext;
    const rig = new AudioRig(ctx, this.space, this.volume);
    if (ambience) {
      rig.ambience();
      rig.schedule(secs);
    }
    for (const e of events) {
      if (e.n === '@fire') {
        rig.setFire(e.o.gain ?? 0, e.t);
      } else if (e.t < secs) {
        rig.play(e.n, e.o, e.t);
      }
    }
    const buf = await ctx.startRendering();
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }

  /** 录制期间记下来的声音 → 一段 WAV(base64)。 */
  async renderLog(secs: number): Promise<string> {
    const chs = await this.render(this.log ?? [], secs, true);
    return b64(wav16(chs, 44100));
  }

  /** 自检:每个声音单独渲染,量峰值、响度(均方根)、多长、有没有削波 / 没声。 */
  async selftest(space: Space = this.space): Promise<Record<string, { peak: number; rms: number; secs: number; ok: boolean }>> {
    const keep = this.space;
    this.space = space;
    const out: Record<string, { peak: number; rms: number; secs: number; ok: boolean }> = {};
    const list: Array<[string, PlayOpts]> = [['swing', {}], ['swing', { heavy: true }], ['hit', {}], ['hit', { heavy: true }], ['step', {}], ['stepGrass', {}], ['dash', {}], ['slam', {}], ['wave', {}],
      ['bite', {}], ['bite', { heavy: true }], ['fall', {}], ['drip', {}], ['bird', {}], ['stepMud', {}], ['owl', {}], ['bell', {}]];
    for (const [name, o] of list) {
      const chs = await this.render([{ n: name, t: 0.05, o }], 3.2, false);
      let peak = 0;
      let sum = 0;
      let end = 0;
      const d = chs[0];
      for (let i = 0; i < d.length; i += 1) {
        const v = Math.max(Math.abs(d[i]), Math.abs(chs[1][i]));
        peak = Math.max(peak, v);
        if (v > 0.003) {
          end = i;
        }
      }
      const n = Math.max(1, end);
      for (let i = 0; i < n; i += 1) {
        sum += d[i] * d[i];
      }
      const key = name + (o.heavy ? '+' : '');
      out[key] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4), secs: +(end / 44100).toFixed(2), ok: peak > 0.02 && peak < 0.99 };
    }
    this.space = keep;
    return out;
  }

  /** 试听带:每个声音各放两遍,排成一段 WAV(base64)。 */
  async reel(space: Space = this.space): Promise<{ wav: string; marks: Array<[number, string]>; secs: number }> {
    const keep = this.space;
    this.space = space;
    const hall: Array<[string, PlayOpts, number]> = [['swing', {}, 0.6], ['swing', { heavy: true }, 0.7], ['hit', {}, 0.7], ['hit', { heavy: true }, 0.9], ['step', {}, 0.38], ['step', {}, 0.38], ['step', {}, 0.38], ['step', {}, 0.6],
      ['dash', {}, 1.1], ['slam', {}, 1.8], ['wave', {}, 1.5], ['bite', {}, 0.8], ['bite', { heavy: true }, 1.0], ['fall', {}, 0.9], ['fall', { heavy: true }, 1.2]];
    const open: Array<[string, PlayOpts, number]> = [['stepMud', {}, 0.38], ['stepMud', {}, 0.38], ['stepMud', {}, 0.38], ['stepMud', {}, 0.7], ['owl', {}, 2.4], ['swing', {}, 0.6], ['hit', {}, 0.8], ['slam', {}, 1.6], ['wave', {}, 1.4], ['bite', {}, 0.9], ['fall', {}, 1.0]];
    const ev: Logged[] = [];
    const marks: Array<[number, string]> = [];
    let t = 1.0;
    for (const [name, o, gap] of space === 'hall' ? hall : open) {
      for (let k = 0; k < (gap < 0.5 ? 1 : 2); k += 1) {
        ev.push({ n: name, t, o });
        marks.push([+t.toFixed(2), name + (o.heavy ? '+' : '')]);
        t += gap;
      }
    }
    ev.push({ n: '@fire', t: 0, o: { gain: 0.5 } });
    const secs = t + 3;
    const chs = await this.render(ev, secs, true);
    this.space = keep;
    return { wav: b64(wav16(chs, 44100)), marks, secs };
  }
}

export const sfx = new Sfx();
