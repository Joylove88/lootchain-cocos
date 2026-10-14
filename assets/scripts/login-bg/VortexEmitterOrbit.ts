import { _decorator, Component, ParticleSystem2D, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('VortexEmitterOrbit')
export class VortexEmitterOrbit extends Component {
    @property radiusX = 420;
    @property radiusY = 130;
    @property angularSpeed = 0.18; // rad/s, positive = counterclockwise
    @property phase = 0;
    @property followTangent = true;
    @property tangentOffsetDeg = 0;

    private time = 0;
    private particle: ParticleSystem2D | null = null;

    start() {
        this.particle = this.getComponent(ParticleSystem2D);
    }

    update(dt: number) {
        this.time += dt;
        const a = this.time * this.angularSpeed + this.phase;

        const x = Math.cos(a) * this.radiusX;
        const y = Math.sin(a) * this.radiusY;
        this.node.setPosition(x, y, 0);

        if (this.followTangent && this.particle) {
            const dx = -Math.sin(a) * this.radiusX * Math.sign(this.angularSpeed || 1);
            const dy =  Math.cos(a) * this.radiusY * Math.sign(this.angularSpeed || 1);
            const deg = Math.atan2(dy, dx) * 180 / Math.PI;
            this.particle.angle = deg + this.tangentOffsetDeg;
        }
    }
}
