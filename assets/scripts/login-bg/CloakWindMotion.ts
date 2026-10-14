import { _decorator, Component, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CloakWindMotion')
export class CloakWindMotion extends Component {
    @property speed = 0.9;
    @property moveX = 3;
    @property moveY = 1;
    @property rotateStrength = 1.2;
    @property phase = 0;

    private basePos = new Vec3();
    private baseAngle = 0;

    start() {
        this.basePos.set(this.node.position);
        this.baseAngle = this.node.angle;
    }

    update() {
        const t = performance.now() * 0.001;
        this.node.setPosition(
            this.basePos.x + Math.sin(t * this.speed + this.phase) * this.moveX,
            this.basePos.y + Math.cos(t * this.speed * 0.6 + this.phase) * this.moveY,
            this.basePos.z
        );
        this.node.angle = this.baseAngle + Math.sin(t * this.speed * 0.75 + this.phase) * this.rotateStrength;
    }
}
