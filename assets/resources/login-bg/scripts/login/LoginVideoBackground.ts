import {
    _decorator,
    Component,
    resources,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    VideoPlayer,
    VideoClip,
    UIOpacity,
    view,
    input,
    Input
} from 'cc';

const { ccclass, property } = _decorator;

// 仅横屏(2026-10-02):竖版 h5 背景(720×1280)已移到 素材原始备份/unused-login-h5-20261002,手机也用横版。
type LoginBackgroundMode = 'pc';

const PC_VIDEO_PATH = 'login-bg/login_bg_loop_1080p';
const PC_POSTER_PATH = 'login-bg/login_bg_first';

@ccclass('LoginVideoBackground')
export class LoginVideoBackground extends Component {

    @property(VideoPlayer)
    video: VideoPlayer | null = null;

    @property(UIOpacity)
    posterOpacity: UIOpacity | null = null;

    @property
    fadeDuration = 0.4;

    private fadeTimer = 0;
    private fadingPoster = false;
    private posterHidden = false;
    private playRequested = false;
    private activeMode: LoginBackgroundMode | null = null;
    private assetLoadTicket = 0;
    private layoutCheckTimer = 0;
    private posterFallbackScheduled = false;

    onLoad() {
        if (!this.video) {
            this.video = this.getComponent(VideoPlayer);
        }

        if (!this.video) {
            console.error('[LoginVideoBackground] VideoPlayer not found');
            return;
        }

        // 背景视频只负责画面，必须静音，避免浏览器自动播放拦截
        this.video.mute = true;
        this.video.volume = 0;
        this.video.loop = true;
        this.video.playOnAwake = false;

        if (this.posterOpacity) {
            this.posterOpacity.opacity = 255;
        }

        this.applyResponsiveBackground(true);

        this.video.node.on(VideoPlayer.EventType.READY_TO_PLAY, this.onVideoReady, this);
        this.video.node.on(VideoPlayer.EventType.PLAYING, this.onVideoPlaying, this);
        this.video.node.on(VideoPlayer.EventType.COMPLETED, this.onVideoCompleted, this);
        this.video.node.on(VideoPlayer.EventType.ERROR, this.onVideoError, this);

        // 浏览器如果拦截了自动播放，用户点击页面后再补一次 play
        input.on(Input.EventType.MOUSE_DOWN, this.tryPlayVideo, this);
        input.on(Input.EventType.TOUCH_START, this.tryPlayVideo, this);
    }

    start() {
        this.scheduleOnce(() => {
            this.tryPlayVideo();
        }, 0.1);

        // 兜底：1 秒后如果还没开始播放，再试一次
        this.scheduleOnce(() => {
            if (!this.posterHidden) {
                this.tryPlayVideo();
            }
        }, 1.0);
    }

    public resumeForLoginView() {
        this.node.active = true;
        if (this.video) {
            this.video.node.active = true;
        }
        this.applyResponsiveBackground(false);
        this.tryPlayVideo();
    }

    private tryPlayVideo() {
        if (!this.video) return;

        try {
            this.video.mute = true;
            this.video.volume = 0;

            if (!this.playRequested) {
                this.playRequested = true;
            }

            this.video.play();
            this.schedulePosterHideFallback();
        } catch (err) {
            console.warn('[LoginVideoBackground] play failed:', err);
        }
    }

    private onVideoReady() {
        // ready 只代表能播，不代表已经真的在播放
        this.tryPlayVideo();
    }

    private onVideoPlaying() {
        // 真正开始播放后，再淡出首帧图
        if (this.posterHidden) return;

        this.fadeTimer = 0;
        this.fadingPoster = true;
    }

    private onVideoCompleted() {
        if (!this.video) return;

        // loop=true 理论上会自动循环，这里兜底
        try {
            this.video.currentTime = 0;
            this.video.play();
        } catch (err) {
            console.warn('[LoginVideoBackground] replay failed:', err);
        }
    }

    private onVideoError() {
        console.error('[LoginVideoBackground] video error');

        // 视频出错就保留 poster，别让用户看黑屏
        if (this.posterOpacity) {
            this.posterOpacity.opacity = 255;
        }
    }

    update(dt: number) {
        this.layoutCheckTimer += dt;
        if (this.layoutCheckTimer >= 0.5) {
            this.layoutCheckTimer = 0;
            this.applyResponsiveBackground(false);
        }

        if (!this.fadingPoster || !this.posterOpacity) return;

        this.fadeTimer += dt;

        const t = Math.min(this.fadeTimer / this.fadeDuration, 1);
        this.posterOpacity.opacity = 255 * (1 - t);

        if (t >= 1) {
            this.hidePosterForVideo();
        }
    }

    onDestroy() {
        if (this.video) {
            this.video.node.off(VideoPlayer.EventType.READY_TO_PLAY, this.onVideoReady, this);
            this.video.node.off(VideoPlayer.EventType.PLAYING, this.onVideoPlaying, this);
            this.video.node.off(VideoPlayer.EventType.COMPLETED, this.onVideoCompleted, this);
            this.video.node.off(VideoPlayer.EventType.ERROR, this.onVideoError, this);
        }

        input.off(Input.EventType.MOUSE_DOWN, this.tryPlayVideo, this);
        input.off(Input.EventType.TOUCH_START, this.tryPlayVideo, this);
    }

    private applyResponsiveBackground(force: boolean) {
        const mode = this.resolveBackgroundMode();
        this.applyBackgroundSize();

        if (!force && mode === this.activeMode) {
            return;
        }

        this.activeMode = mode;
        this.posterHidden = false;
        this.fadingPoster = false;
        this.fadeTimer = 0;

        if (this.posterOpacity) {
            this.posterOpacity.opacity = 255;
        }

        const ticket = ++this.assetLoadTicket;
        void mode;
        const videoPath = PC_VIDEO_PATH;
        const posterPath = PC_POSTER_PATH;

        this.loadPoster(posterPath, ticket);
        this.loadVideoClip(videoPath, ticket);
    }

    private schedulePosterHideFallback() {
        if (this.posterFallbackScheduled) return;
        this.posterFallbackScheduled = true;
        this.scheduleOnce(() => {
            this.posterFallbackScheduled = false;
            if (!this.video?.clip || this.posterHidden || this.fadingPoster) {
                return;
            }
            this.hidePosterForVideo();
        }, 0.6);
    }

    private hidePosterForVideo() {
        if (this.posterOpacity) {
            this.posterOpacity.opacity = 0;
        }
        this.fadingPoster = false;
        this.posterHidden = true;
    }

    private resolveBackgroundMode(): LoginBackgroundMode {
        // 仅横屏(2026-10-02):手机也用 1920×1080 横版背景;h5 竖版素材(720×1280)拉到横屏会严重变形。
        return 'pc';
    }

    private applyBackgroundSize() {
        // 一体构图背景只能等比缩放:节点按 16:9 铺满(cover),超出部分由画面边缘裁掉,不再拉伸到可视区比例。
        const visibleSize = view.getVisibleSize();
        const unit = Math.max(visibleSize.width / 16, visibleSize.height / 9, 1);
        const contentSize = new Size(Math.ceil(unit * 16), Math.ceil(unit * 9));
        this.video?.node.getComponent(UITransform)?.setContentSize(contentSize);
        this.posterOpacity?.node.getComponent(UITransform)?.setContentSize(contentSize);
    }

    private loadVideoClip(path: string, ticket: number) {
        if (!this.video) return;

        try {
            this.video.stop();
            this.video.clip = null;
        } catch (err) {
            console.warn('[LoginVideoBackground] stop before switch failed:', err);
        }

        resources.load(path, VideoClip, (error, clip) => {
            if (ticket !== this.assetLoadTicket || !this.video) {
                return;
            }

            if (error || !clip) {
                console.error(`[LoginVideoBackground] video load failed: ${path}`, error);
                return;
            }

            this.video.clip = clip;
            this.tryPlayVideo();
        });
    }

    private loadPoster(path: string, ticket: number) {
        const posterSprite = this.posterOpacity?.node.getComponent(Sprite);
        if (!posterSprite) return;

        resources.load(`${path}/spriteFrame`, SpriteFrame, (spriteError, spriteFrame) => {
            if (ticket !== this.assetLoadTicket) {
                return;
            }

            if (!spriteError && spriteFrame) {
                posterSprite.spriteFrame = spriteFrame;
                return;
            }

            resources.load(`${path}/texture`, Texture2D, (textureError, texture) => {
                if (ticket !== this.assetLoadTicket) {
                    return;
                }

                if (textureError || !texture) {
                    console.error(`[LoginVideoBackground] poster load failed: ${path}`, textureError || spriteError);
                    return;
                }

                const runtimeSpriteFrame = new SpriteFrame();
                runtimeSpriteFrame.texture = texture;
                posterSprite.spriteFrame = runtimeSpriteFrame;
            });
        });
    }
}
