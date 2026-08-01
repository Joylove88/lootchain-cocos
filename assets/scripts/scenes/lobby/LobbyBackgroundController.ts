import {
  Color,
  Graphics,
  Node,
  Size,
  Sprite,
  SpriteFrame,
  UIOpacity,
  UITransform,
  Vec3,
  VideoClip,
  VideoPlayer,
} from 'cc';
import { clamp, rgba, type UiLayout } from './LobbyHudTypes';

export const LOBBY_VIDEO_PATH = 'lobby/lobby_bg_loop';
export const LOBBY_POSTER_PATH = 'lobby/lobby_bg_poster';
// 大厅改为静态王座大厅图(挂机演出层叠加其上),旧循环视频停用。
export const USE_LOBBY_NATIVE_VIDEO_BACKGROUND = false;
const LOBBY_POSTER_FADE_DURATION = 0.4;

export interface LobbyBackgroundHost {
  createUiNode(name: string): Node;
  addRect(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke?: Color, lineWidth?: number): Graphics;
  isLobbyViewActive(): boolean;
  scheduleOnce(callback: () => void, delay?: number): void;
}

/**
 * 大厅背景控制器。
 *
 * 负责 poster、原生 VideoPlayer、淡出和播放重试；不负责 HUD 和任何业务状态。
 * Root 切换视图或重绘时会调用 release，避免旧视频事件继续影响新视图。
 */
export class LobbyBackgroundController {
  private posterFrame: SpriteFrame | null = null;
  private videoClip: VideoClip | null = null;
  private videoPlayer: VideoPlayer | null = null;
  private posterOpacity: UIOpacity | null = null;
  private posterFadeTimer = 0;
  private posterFading = false;
  private posterHidden = false;
  private posterNode: Node | null = null;
  private videoNode: Node | null = null;
  private fallbackNode: Node | null = null;
  private renderedPosterFrame: SpriteFrame | null = null;
  private renderedVideoClip: VideoClip | null = null;

  constructor(private readonly host: LobbyBackgroundHost) {}

  setResources(posterFrame: SpriteFrame | null, videoClip: VideoClip | null): void {
    this.posterFrame = posterFrame;
    this.videoClip = videoClip;
  }

  render(layout: UiLayout): void {
    if (this.isRendered() && this.renderedPosterFrame === this.posterFrame && this.renderedVideoClip === this.videoClip) {
      this.resize(layout);
      return;
    }
    this.release();
    // poster 永远先铺底；视频播放成功后再淡出 poster，失败时仍保留静态背景。
    if (this.posterFrame) {
      this.renderPoster(layout);
    } else {
      this.fallbackNode = this.host.addRect('Lobby_BG_Fallback', 0, 0, layout.width, layout.height, rgba(5, 4, 7, 255)).node;
    }

    if (!USE_LOBBY_NATIVE_VIDEO_BACKGROUND || !this.videoClip) {
      this.renderedPosterFrame = this.posterFrame;
      this.renderedVideoClip = this.videoClip;
      return;
    }

    this.renderVideo(layout);
    this.renderedPosterFrame = this.posterFrame;
    this.renderedVideoClip = this.videoClip;
  }

  isRendered(): boolean {
    return Boolean(this.posterNode?.isValid || this.videoNode?.isValid || this.fallbackNode?.isValid);
  }

  resize(layout: UiLayout): void {
    // 大厅内 resize 或 UI 图片补帧时只调整已有背景节点尺寸，避免视频 stop/play 引起闪屏。
    this.resizeNode(this.posterNode, layout.width, layout.height);
    this.resizeNode(this.videoNode, layout.width, layout.height);
    this.resizeNode(this.fallbackNode, layout.width, layout.height);
    if (this.fallbackNode?.isValid) {
      const graphics = this.fallbackNode.getComponent(Graphics);
      if (graphics) {
        graphics.clear();
        graphics.fillColor = rgba(5, 4, 7, 255);
        graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
        graphics.fill();
      }
    }
  }

  tryPlay(): void {
    // 浏览器预览通常需要用户交互后才能播放视频，所以 root 会在点击/触摸时反复尝试。
    if (!USE_LOBBY_NATIVE_VIDEO_BACKGROUND || !this.host.isLobbyViewActive() || !this.videoPlayer) {
      return;
    }
    try {
      this.videoPlayer.mute = true;
      this.videoPlayer.volume = 0;
      this.videoPlayer.play();
    } catch (error) {
      console.warn('[LootChain] lobby background video play failed:', error);
    }
  }

  update(deltaTime: number): void {
    if (!this.posterFading || !this.posterOpacity) {
      return;
    }
    this.posterFadeTimer += deltaTime;
    const progress = clamp(this.posterFadeTimer / LOBBY_POSTER_FADE_DURATION, 0, 1);
    this.posterOpacity.opacity = 255 * (1 - progress);
    if (progress >= 1) {
      this.posterOpacity.opacity = 0;
      this.posterFading = false;
      this.posterHidden = true;
    }
  }

  release(): void {
    const video = this.videoPlayer;
    if (video) {
      video.node.off(VideoPlayer.EventType.READY_TO_PLAY, this.onVideoReady, this);
      video.node.off(VideoPlayer.EventType.PLAYING, this.onVideoPlaying, this);
      video.node.off(VideoPlayer.EventType.COMPLETED, this.onVideoCompleted, this);
      video.node.off(VideoPlayer.EventType.ERROR, this.onVideoError, this);
      try {
        video.stop();
      } catch (error) {
        console.warn('[LootChain] lobby background video stop failed:', error);
      }
    }
    this.videoPlayer = null;
    this.posterOpacity = null;
    this.destroyNode(this.posterNode);
    this.destroyNode(this.videoNode);
    this.destroyNode(this.fallbackNode);
    this.posterNode = null;
    this.videoNode = null;
    this.fallbackNode = null;
    this.renderedPosterFrame = null;
    this.renderedVideoClip = null;
    this.posterFadeTimer = 0;
    this.posterFading = false;
    this.posterHidden = false;
  }

  private renderPoster(layout: UiLayout): void {
    const posterNode = this.host.createUiNode('Lobby_BG_Poster');
    this.posterNode = posterNode;
    posterNode.setPosition(Vec3.ZERO);
    posterNode.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    this.posterOpacity = posterNode.addComponent(UIOpacity);
    this.posterOpacity.opacity = 255;
    const poster = posterNode.addComponent(Sprite);
    poster.type = Sprite.Type.SIMPLE;
    poster.sizeMode = Sprite.SizeMode.CUSTOM;
    poster.spriteFrame = this.posterFrame;
  }

  private renderVideo(layout: UiLayout): void {
    const videoNode = this.host.createUiNode('Lobby_BG_Video');
    this.videoNode = videoNode;
    videoNode.setPosition(Vec3.ZERO);
    videoNode.addComponent(UITransform).setContentSize(new Size(layout.width, layout.height));
    const video = videoNode.addComponent(VideoPlayer);
    video.clip = this.videoClip;
    video.mute = true;
    video.volume = 0;
    video.loop = true;
    video.playOnAwake = false;
    video.fullScreenOnAwake = false;
    video.keepAspectRatio = false;
    // stayOnBottom 是关键：让原生视频保持在 Cocos UI 后面，避免遮挡 HUD。
    video.stayOnBottom = true;
    this.videoPlayer = video;
    videoNode.on(VideoPlayer.EventType.READY_TO_PLAY, this.onVideoReady, this);
    videoNode.on(VideoPlayer.EventType.PLAYING, this.onVideoPlaying, this);
    videoNode.on(VideoPlayer.EventType.COMPLETED, this.onVideoCompleted, this);
    videoNode.on(VideoPlayer.EventType.ERROR, this.onVideoError, this);
    this.tryPlay();
    this.host.scheduleOnce(() => this.tryPlay(), 0.1);
    this.host.scheduleOnce(() => {
      if (!this.posterHidden) {
        this.tryPlay();
      }
    }, 1.0);
  }

  private onVideoReady(): void {
    this.tryPlay();
  }

  private onVideoPlaying(): void {
    if (!this.posterOpacity || this.posterHidden) {
      return;
    }
    // 只有真正进入 PLAYING 后才开始淡出 poster，避免视频首帧黑屏时露底。
    this.posterFadeTimer = 0;
    this.posterFading = true;
  }

  private onVideoCompleted(): void {
    if (!this.videoPlayer) {
      return;
    }
    try {
      this.videoPlayer.currentTime = 0;
      this.videoPlayer.play();
    } catch (error) {
      console.warn('[LootChain] lobby background video replay failed:', error);
    }
  }

  private onVideoError(): void {
    console.warn('[LootChain] lobby background video error; keeping poster background');
    if (this.posterOpacity) {
      this.posterOpacity.opacity = 255;
    }
    this.posterFading = false;
    this.posterHidden = false;
  }

  private resizeNode(node: Node | null, width: number, height: number): void {
    if (!node?.isValid) {
      return;
    }
    node.setPosition(Vec3.ZERO);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(new Size(width, height));
  }

  private destroyNode(node: Node | null): void {
    if (!node?.isValid) {
      return;
    }
    node.removeFromParent();
    node.destroy();
  }
}
