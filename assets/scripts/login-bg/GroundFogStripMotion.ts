import { _decorator, Component, UIOpacity, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GroundFogStripMotion')
export class GroundFogStripMotion extends Component {
    @property driftX = 18;
    @property driftSpeed = 0.08;
    @property opacityPulse = 12;
    @property phase = 0;

    private basePos = new Vec3();
    private opacity: UIOpacity | null = null;
    private baseOpacity = 255;

    start() {
        this.basePos.set(this.node.position);
        this.opacity = this.getComponent(UIOpacity);
        if (this.opacity) this.baseOpacity = this.opacity.opacity;
    }

    update() {
        const t = performance.now() * 0.001;
        this.node.setPosition(
            this.basePos.x + Math.sin(t * this.driftSpeed + this.phase) * this.driftX,
            this.basePos.y,
            this.basePos.z
        );

        if (this.opacity) {
            this.opacity.opacity = Math.max(0, Math.min(255,
                this.baseOpacity + Math.sin(t * 0.18 + this.phase) * this.opacityPulse
            ));
        }
    }
}
