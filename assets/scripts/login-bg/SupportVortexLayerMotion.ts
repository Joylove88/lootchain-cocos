import { _decorator, Component, UIOpacity, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SupportVortexLayerMotion')
export class SupportVortexLayerMotion extends Component {
    @property rotationSpeed = 0.8; // deg/s
    @property scalePulse = 0.006;
    @property opacityPulse = 8;
    @property phase = 0;

    private baseScale = new Vec3();
    private opacityComp: UIOpacity | null = null;
    private baseOpacity = 255;
    private t = 0;

    start() {
        this.baseScale.set(this.node.scale);
        this.opacityComp = this.getComponent(UIOpacity);
        if (this.opacityComp) this.baseOpacity = this.opacityComp.opacity;
    }

    update(dt: number) {
        this.t += dt;
        this.node.angle += this.rotationSpeed * dt;

        const s = 1 + Math.sin(this.t * 0.2 + this.phase) * this.scalePulse;
        this.node.setScale(this.baseScale.x * s, this.baseScale.y * s, this.baseScale.z);

        if (this.opacityComp) {
            this.opacityComp.opacity = Math.max(0, Math.min(255,
                this.baseOpacity + Math.sin(this.t * 0.22 + this.phase) * this.opacityPulse
            ));
        }
    }
}
