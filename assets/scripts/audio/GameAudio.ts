import { AudioClip, AudioSource, Node, director, resources, sys } from 'cc';

/**
 * 全局音频管理器(音效底铺,上线冲刺 2026-09-04)。
 *
 * - SFX:playOneShot,按 key 懒加载缓存(resources/audio/sfx/<key>);缺资源静默跳过,不阻断玩法。
 * - BGM:循环播放(resources/audio/bgm/<key>);Web 自动播放策略下首次可能被浏览器拦,
 *   任意一次 SFX 触发(=用户手势)后自动补播 pending 的 BGM。
 * - 开关持久化 localStorage(lootchain.audio.sfx / lootchain.audio.bgm),默认开;
 *   当前占位音源为程序合成 WAV,正式音源同名替换即可(设置面板开关接线随后续轮次)。
 */
const SFX_VOLUME = 0.8;
const BGM_VOLUME = 0.4;
const SFX_KEY = 'lootchain.audio.sfx';
const BGM_KEY = 'lootchain.audio.bgm';

class GameAudioManager {
  private hostNode: Node | null = null;
  private bgmSource: AudioSource | null = null;
  private sfxSource: AudioSource | null = null;
  private readonly clips = new Map<string, AudioClip>();
  private readonly loading = new Set<string>();
  private pendingBgmKey = '';
  private currentBgmKey = '';
  /** 同帧同音效去重(一波怪 60 只同时死=一次 hit,不叠成噪声)。 */
  private readonly lastPlayedAt = new Map<string, number>();

  sfxEnabled(): boolean {
    return sys.localStorage.getItem(SFX_KEY) !== '0';
  }

  bgmEnabled(): boolean {
    return sys.localStorage.getItem(BGM_KEY) !== '0';
  }

  setSfxEnabled(enabled: boolean): void {
    sys.localStorage.setItem(SFX_KEY, enabled ? '1' : '0');
  }

  setBgmEnabled(enabled: boolean): void {
    sys.localStorage.setItem(BGM_KEY, enabled ? '1' : '0');
    if (!enabled) {
      this.stopBgm();
    } else if (this.pendingBgmKey || this.currentBgmKey) {
      this.bgm(this.pendingBgmKey || this.currentBgmKey);
    }
  }

  /** 播放音效(节流 80ms/键)。任何用户手势路径都会经过这里,顺带补播被浏览器拦下的 BGM。 */
  sfx(key: string, volumeScale = 1): void {
    this.resumePendingBgm();
    if (!this.sfxEnabled() || !key) {
      return;
    }
    const now = Date.now();
    const last = this.lastPlayedAt.get(key) ?? 0;
    if (now - last < 80) {
      return;
    }
    this.lastPlayedAt.set(key, now);
    this.withClip(`audio/sfx/${key}`, (clip) => {
      const source = this.ensureSources()?.sfx;
      source?.playOneShot(clip, SFX_VOLUME * volumeScale);
    });
  }

  /** 循环播放 BGM;重复同 key 调用是幂等的。 */
  bgm(key: string): void {
    if (!key) {
      return;
    }
    this.pendingBgmKey = key;
    if (!this.bgmEnabled()) {
      return;
    }
    if (this.currentBgmKey === key && this.bgmSource?.playing) {
      return;
    }
    this.withClip(`audio/bgm/${key}`, (clip) => {
      const source = this.ensureSources()?.bgm;
      if (!source) {
        return;
      }
      source.stop();
      source.clip = clip;
      source.loop = true;
      source.volume = BGM_VOLUME;
      try {
        source.play();
        this.currentBgmKey = key;
      } catch (error) {
        // Web 自动播放策略:等首次用户手势(sfx 路径)重试。
        void error;
      }
    });
  }

  stopBgm(): void {
    this.currentBgmKey = '';
    this.bgmSource?.stop();
  }

  private resumePendingBgm(): void {
    if (this.pendingBgmKey && this.bgmEnabled() && (!this.bgmSource || !this.bgmSource.playing)) {
      this.bgm(this.pendingBgmKey);
    }
  }

  private withClip(path: string, apply: (clip: AudioClip) => void): void {
    const cached = this.clips.get(path);
    if (cached) {
      apply(cached);
      return;
    }
    if (this.loading.has(path)) {
      return;
    }
    this.loading.add(path);
    resources.load(path, AudioClip, (error, clip) => {
      this.loading.delete(path);
      if (error || !clip) {
        // 音源缺失静默(占位期正常);缓存空标记避免每次都发请求——用 clips 不存即重试,轻量接受。
        return;
      }
      this.clips.set(path, clip);
      apply(clip);
    });
  }

  private ensureSources(): { bgm: AudioSource; sfx: AudioSource } | null {
    if (this.hostNode && this.hostNode.isValid && this.bgmSource && this.sfxSource) {
      return { bgm: this.bgmSource, sfx: this.sfxSource };
    }
    const scene = director.getScene();
    if (!scene) {
      return null;
    }
    const node = new Node('GameAudioHost');
    scene.addChild(node);
    try {
      director.addPersistRootNode(node);
    } catch (error) {
      void error; // 场景切换少的单场景架构,持久化失败也可用
    }
    this.hostNode = node;
    this.bgmSource = node.addComponent(AudioSource);
    this.sfxSource = node.addComponent(AudioSource);
    return { bgm: this.bgmSource, sfx: this.sfxSource };
  }
}

export const gameAudio = new GameAudioManager();
