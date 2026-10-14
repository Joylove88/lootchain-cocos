import { _decorator, Component, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('AlphaPulse')
export class AlphaPulse extends Component {
    @property minOpacity = 60;
    @property maxOpacity = 150;
    @property speed = 1.2;
    @property phase = 0;

    private opacity: UIOpacity | null = null;

    start() {
        this.opacity = this.getComponent(UIOpacity);
    }

    update() {
        if (!this.opacity) return;
        const t = performance.now() * 0.001;
        const p = (Math.sin(t * this.speed + this.phase) + 1) * 0.5;
        this.opacity.opacity = this.minOpacity + (this.maxOpacity - this.minOpacity) * p;
    }
}
