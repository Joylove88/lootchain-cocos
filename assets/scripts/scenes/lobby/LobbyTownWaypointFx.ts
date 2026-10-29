import { Graphics, Node, Sprite, tween, UIOpacity, Vec3 } from 'cc';
import { rgba } from './LobbyHudTypes';

/** 传送阵符文环贴图(主城 HUD 原型 v1,2026-10-27;正圆俯视图,运行时按地砖透视压扁)。 */
export const TOWN_WAYPOINT_RING_ASSET = 'ui/world/fx_rune_ring/spriteFrame';

interface WaypointFxHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
}

interface Mote {
  node: Node;
  opacity: UIOpacity;
  x: number;
  y: number;
  t: number;
  life: number;
  rise: number;
}

/**
 * 传送阵特效(用户 10-27「传送阵要有特效」,按原型克制做):
 * 外圈符文环慢转 + 阵面淡蓝呼吸光 + 6~8 个光点缓升淡出;未激活只留暗灰圈(由调用方画),这里整组隐藏。
 */
export class TownWaypointFx {
  private readonly root: Node;
  private readonly spin: Node | null;
  private readonly glow: Graphics;
  private readonly motes: Mote[] = [];
  private active = false;
  private time = 0;

  constructor(private readonly host: WaypointFxHost, parent: Node, x: number, y: number, private readonly rx: number, private readonly tilt = 0.56) {
    this.root = host.addChildPlainNode(parent, 'TownWaypointFx', x, y, rx * 2, rx * 2 * tilt);
    // 呼吸光(压扁椭圆)
    const glowNode = host.addChildPlainNode(this.root, 'Glow', 0, 0, rx * 2, rx * 2 * tilt);
    this.glow = glowNode.addComponent(Graphics);
    // 符文环:正圆贴图放进纵向压扁的容器里转,看起来就是贴地旋转
    const flat = host.addChildPlainNode(this.root, 'Flat', 0, 0, rx * 2, rx * 2);
    flat.setScale(1, tilt, 1);
    const spin = host.addChildPlainNode(flat, 'Spin', 0, 0, rx * 2, rx * 2);
    this.spin = host.addSprite('Ring', TOWN_WAYPOINT_RING_ASSET, 0, 0, rx * 2.04, rx * 2.04, spin) ? spin : null;
    if (!this.spin) {
      spin.destroy();
    }
    const count = rx > 200 ? 8 : 6;
    for (let i = 0; i < count; i += 1) {
      const node = host.addChildPlainNode(this.root, `Mote_${i}`, 0, 0, 12, 12);
      const g = node.addComponent(Graphics);
      g.fillColor = rgba(150, 225, 255, 90);
      g.circle(0, 0, 5);
      g.fill();
      g.fillColor = rgba(220, 248, 255, 230);
      g.circle(0, 0, 2.2);
      g.fill();
      const mote: Mote = { node, opacity: node.addComponent(UIOpacity), x: 0, y: 0, t: 0, life: 1, rise: 0 };
      this.respawnMote(mote, Math.random());
      this.motes.push(mote);
    }
    this.setActive(false);
  }

  get node(): Node {
    return this.root;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (this.root.isValid) {
      this.root.active = active;
    }
  }

  /**
   * 首次激活演出(docs/53 §3,10-29 用户「靠近传送阵时发生光效和音效自动激活」):
   * 符文环从小放大 + 一道光柱从阵心升起再淡出 + 两圈冲击环外扩 + 光点一齐上浮;之后转入常驻激活态。
   */
  playActivation(): void {
    if (!this.root.isValid) {
      return;
    }
    this.setActive(true);
    const flat = this.spin?.parent;
    if (flat && flat.isValid) {
      const base = flat.scale.clone();
      flat.setScale(base.x * 0.2, base.y * 0.2, 1);
      tween(flat).to(0.55, { scale: base }, { easing: 'backOut' }).start();
    }
    // 光柱:细长竖椭圆叠三层,从阵心升起
    const pillar = this.host.addChildPlainNode(this.root, 'ActivatePillar', 0, 0, this.rx, this.rx * 4);
    const pg = pillar.addComponent(Graphics);
    const h = this.rx * 3.2;
    [[0.42, 40], [0.26, 80], [0.12, 200]].forEach(([w, a]) => {
      pg.fillColor = rgba(150, 220, 255, a);
      pg.roundRect(-this.rx * w, 0, this.rx * w * 2, h, this.rx * w);
      pg.fill();
    });
    pillar.setScale(1, 0.05, 1);
    const pf = pillar.addComponent(UIOpacity);
    tween(pillar).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    tween(pf).delay(0.9).to(0.7, { opacity: 0 }).call(() => pillar.isValid && pillar.destroy()).start();
    // 两圈冲击环
    [0, 0.18].forEach((delay, i) => {
      const ring = this.host.addChildPlainNode(this.root, `ActivateRing_${i}`, 0, 0, this.rx * 2, this.rx * 2);
      const rg = ring.addComponent(Graphics);
      rg.strokeColor = rgba(170, 230, 255, 230);
      rg.lineWidth = 6;
      rg.ellipse(0, 0, this.rx * 0.5, this.rx * 0.5 * this.tilt);
      rg.stroke();
      ring.setScale(0.4, 0.4, 1);
      const rf = ring.addComponent(UIOpacity);
      tween(ring).delay(delay).to(0.8, { scale: new Vec3(2.6, 2.6, 1) }, { easing: 'quadOut' }).start();
      tween(rf).delay(delay + 0.3).to(0.5, { opacity: 0 }).call(() => ring.isValid && ring.destroy()).start();
    });
    // 光点一齐从地面升起
    for (const mote of this.motes) {
      this.respawnMote(mote, 0);
      mote.rise *= 1.8;
    }
  }

  step(dt: number): void {
    if (!this.active || !this.root.isValid) {
      return;
    }
    this.time += dt;
    if (this.spin && this.spin.isValid) {
      // 约 40 秒一圈:看得出在转,又不晃眼
      this.spin.angle = (this.time * 9) % 360;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    const g = this.glow;
    g.clear();
    g.fillColor = rgba(80, 170, 255, Math.round(16 + 20 * pulse));
    g.ellipse(0, 0, this.rx * 0.86, this.rx * 0.86 * this.tilt);
    g.fill();
    g.fillColor = rgba(120, 210, 255, Math.round(10 + 14 * pulse));
    g.ellipse(0, 0, this.rx * 0.5, this.rx * 0.5 * this.tilt);
    g.fill();
    for (const mote of this.motes) {
      mote.t += dt;
      if (mote.t >= mote.life) {
        this.respawnMote(mote, 0);
      }
      const k = mote.t / mote.life;
      mote.node.setPosition(mote.x, mote.y + mote.rise * k, 0);
      // 淡入 → 停留 → 淡出
      mote.opacity.opacity = Math.round(255 * Math.min(1, k * 4, (1 - k) * 2.5));
    }
  }

  private respawnMote(mote: Mote, progress: number): void {
    const angle = Math.random() * Math.PI * 2;
    const r = this.rx * (0.25 + Math.random() * 0.7);
    mote.x = Math.cos(angle) * r;
    mote.y = Math.sin(angle) * r * this.tilt;
    mote.life = 2.4 + Math.random() * 1.8;
    mote.t = mote.life * progress;
    mote.rise = this.rx * (0.32 + Math.random() * 0.25);
  }
}
