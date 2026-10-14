import { _decorator, Component, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DragonBreathMotion')
export class DragonBreathMotion extends Component {
    @property speed = 0.55;
    @property scaleStrength = 0.01;
    @property moveX = 2;
    @property moveY = 1.2;
    @property rotateStrength = 0.4;
    @property phase = 0;

    private baseScale = new Vec3();
    private basePos = new Vec3();
    private baseAngle = 0;

    start() {
        this.baseScale.set(this.node.scale);
        this.basePos.set(this.node.position);
        this.baseAngle = this.node.angle;
    }

    update() {
        const t = performance.now() * 0.001;
        const p = Math.sin(t * this.speed + this.phase);
        const s = 1 + p * this.scaleStrength;

        this.node.setScale(this.baseScale.x * s, this.baseScale.y * s, this.baseScale.z);
        this.node.setPosition(
            this.basePos.x + Math.sin(t * this.speed * 0.7 + this.phase) * this.moveX,
            this.basePos.y + Math.cos(t * this.speed * 0.6 + this.phase) * this.moveY,
            this.basePos.z
        );
        this.node.angle = this.baseAngle + Math.sin(t * this.speed * 0.5 + this.phase) * this.rotateStrength;
    }
}
