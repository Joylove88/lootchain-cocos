import {
    _decorator,
    Component,
    AudioSource,
    input,
    Input
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('BgmController')
export class BgmController extends Component {

    @property(AudioSource)
    bgm: AudioSource | null = null;

    @property
    targetVolume = 1;

    @property
    fadeInDuration = 1.5;

    private unlocked = false;
    private fading = false;
    private fadeTimer = 0;

    onLoad() {
        if (!this.bgm) {
            this.bgm = this.getComponent(AudioSource);
        }

        if (!this.bgm) {
            console.error('[BgmController] AudioSource not found');
            return;
        }

        this.bgm.loop = true;
        this.bgm.volume = 0;

        // Web端需要用户交互后才能稳定播放有声音乐
        input.on(Input.EventType.MOUSE_DOWN, this.unlockAndPlay, this);
        input.on(Input.EventType.TOUCH_START, this.unlockAndPlay, this);
    }

    private unlockAndPlay() {
        if (this.unlocked || !this.bgm) return;

        this.unlocked = true;

        if (!this.bgm.playing) {
            this.bgm.play();
        }

        this.fadeTimer = 0;
        this.fading = true;
    }

    update(dt: number) {
        if (!this.fading || !this.bgm) return;

        this.fadeTimer += dt;

        const t = Math.min(this.fadeTimer / this.fadeInDuration, 1);

        this.bgm.volume = this.targetVolume * t;

        if (t >= 1) {
            this.bgm.volume = this.targetVolume;
            this.fading = false;
        }
    }

    public mute() {
        if (!this.bgm) return;
        this.bgm.volume = 0;
    }

    public unmute() {
        if (!this.bgm) return;

        if (!this.bgm.playing) {
            this.bgm.play();
        }

        this.bgm.volume = this.targetVolume;
    }

    public toggleMute() {
        if (!this.bgm) return;

        if (this.bgm.volume > 0) {
            this.mute();
        } else {
            this.unmute();
        }
    }

    onDestroy() {
        input.off(Input.EventType.MOUSE_DOWN, this.unlockAndPlay, this);
        input.off(Input.EventType.TOUCH_START, this.unlockAndPlay, this);
    }
}