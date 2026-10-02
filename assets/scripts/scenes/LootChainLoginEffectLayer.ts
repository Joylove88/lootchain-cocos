import {
  _decorator,
  Color,
  Component,
  Graphics,
  Node,
  Size,
  UIOpacity,
  UITransform,
  Vec3,
  view,
} from 'cc';

const { ccclass } = _decorator;

type EffectKind = 'beam' | 'cloud' | 'ember' | 'fire' | 'orb' | 'ring';

interface EffectNode {
  node: Node;
  opacity: UIOpacity;
  kind: EffectKind;
  baseX: number;
  baseY: number;
  baseOpacity: number;
  speed: number;
  amplitude: number;
  phase: number;
}

interface EffectLayout {
  width: number;
  height: number;
  compact: boolean;
}

function rgba(red: number, green: number, blue: number, alpha = 255): Color {
  return new Color(red, green, blue, alpha);
}

/**
 * 登录页背景特效层。
 *
 * 使用 Cocos Graphics 绘制云、光束、火焰、粒子等轻量效果，并在 update 中做循环动画。
 * 这是纯表现层，不参与登录流程和任何接口调用。
 */
@ccclass('LootChainLoginEffectLayer')
export class LootChainLoginEffectLayer extends Component {
  private readonly effects: EffectNode[] = [];
  private effectRoot: Node | null = null;
  private layoutKey = '';
  private time = 0;

  start(): void {
    this.renderEffects();
  }

  update(deltaTime: number): void {
    this.time += Math.min(deltaTime, 0.05);
    const nextKey = this.makeLayoutKey();
    if (this.layoutKey && this.layoutKey !== nextKey) {
      this.renderEffects();
    }
    this.animateEffects();
  }

  private renderEffects(): void {
    const layout = this.resolveLayout();
    this.layoutKey = this.makeLayoutKey();
    this.effects.length = 0;
    const root = this.ensureEffectRoot();
    for (const child of [...root.children]) {
      child.destroy();
    }
    const rootTransform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    rootTransform.setContentSize(new Size(layout.width, layout.height));

    // 所有特效位置都基于当前可视尺寸计算，避免旋转或缩放预览时偏出画面。
    const topCoreY = layout.height / 2 - (layout.compact ? 58 : 46);
    const gemY = layout.height / 2 - (layout.compact ? 250 : 320);
    this.addCloud('CloudBackA', -layout.width * 0.18, layout.height * 0.32, layout.width * 0.76, layout.height * 0.2, 54, 0.18, 0.08);
    this.addCloud('CloudBackB', layout.width * 0.22, layout.height * 0.29, layout.width * 0.64, layout.height * 0.18, 42, 0.14, 2.1);
    this.addAbyssOrb(0, topCoreY, layout.compact ? 108 : 132);
    this.addBeam(0, topCoreY - (layout.compact ? 210 : 275), layout.compact ? 4 : 5, layout.compact ? 470 : 640);
    this.addGemAura(0, gemY, layout.compact ? 70 : 95);
    this.addFireCluster(-Math.min(layout.width * 0.19, 320), -layout.height / 2 + (layout.compact ? 54 : 84), layout.compact ? 0.72 : 0.95, -1);
    this.addFireCluster(Math.min(layout.width * 0.19, 320), -layout.height / 2 + (layout.compact ? 54 : 84), layout.compact ? 0.72 : 0.95, 1);
    this.addEmbers(layout);
  }

  private animateEffects(): void {
    for (const effect of this.effects) {
      const wave = Math.sin(this.time * effect.speed + effect.phase);
      // 不同类型使用不同运动曲线，让背景有层次但不干扰登录按钮可读性。
      if (effect.kind === 'cloud') {
        effect.node.setPosition(new Vec3(effect.baseX + wave * effect.amplitude, effect.baseY + Math.cos(this.time * 0.11 + effect.phase) * 8, 0));
        effect.node.setScale(new Vec3(1 + wave * 0.018, 1 + wave * 0.012, 1));
        effect.opacity.opacity = this.clampOpacity(effect.baseOpacity + wave * 20);
        continue;
      }
      if (effect.kind === 'ring') {
        const rotatable = effect.node as Node & { angle: number };
        rotatable.angle = effect.phase + this.time * effect.speed * 18;
        effect.node.setScale(new Vec3(1 + wave * 0.025, 1 + wave * 0.025, 1));
        effect.opacity.opacity = this.clampOpacity(effect.baseOpacity + wave * 34);
        continue;
      }
      if (effect.kind === 'orb' || effect.kind === 'beam') {
        effect.node.setScale(new Vec3(1 + wave * 0.04, 1 + wave * 0.08, 1));
        effect.opacity.opacity = this.clampOpacity(effect.baseOpacity + wave * 42);
        continue;
      }
      if (effect.kind === 'fire') {
        effect.node.setScale(new Vec3(1 + wave * 0.12, 0.92 + Math.abs(wave) * 0.24, 1));
        effect.opacity.opacity = this.clampOpacity(effect.baseOpacity + wave * 35);
        continue;
      }

      const progress = (this.time * effect.speed + effect.phase) % 1;
      const y = effect.baseY + progress * effect.amplitude;
      const x = effect.baseX + Math.sin(progress * Math.PI * 2 + effect.phase) * 26;
      effect.node.setPosition(new Vec3(x, y, 0));
      effect.node.setScale(new Vec3(1 - progress * 0.55, 1 - progress * 0.55, 1));
      effect.opacity.opacity = this.clampOpacity(Math.sin(progress * Math.PI) * effect.baseOpacity);
    }
  }

  private addCloud(name: string, x: number, y: number, width: number, height: number, opacity: number, speed: number, phase: number): void {
    const node = this.createEffectNode(name, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(118, 125, 145, 42);
    for (let index = 0; index < 8; index += 1) {
      const offsetX = -width * 0.42 + index * width * 0.12;
      const offsetY = Math.sin(index * 1.37) * height * 0.18;
      graphics.circle(offsetX, offsetY, height * (0.36 + (index % 3) * 0.08));
      graphics.fill();
    }
    graphics.fillColor = rgba(122, 18, 31, 24);
    graphics.circle(width * 0.08, -height * 0.04, height * 0.72);
    graphics.fill();
    this.registerEffect(node, 'cloud', x, y, opacity, speed, width * 0.045, phase);
  }

  private addAbyssOrb(x: number, y: number, radius: number): void {
    this.addRing('AbyssOuterRing', x, y, radius, rgba(201, 39, 61, 128), 2, 112, 0.42, 0);
    this.addRing('AbyssInnerRing', x, y, radius * 0.62, rgba(245, 210, 122, 92), 1, 96, -0.55, 2.4);
    const node = this.createEffectNode('AbyssRedOrb', x, y, radius * 0.55, radius * 0.55);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(25, 2, 8, 190);
    graphics.circle(0, 0, radius * 0.2);
    graphics.fill();
    graphics.strokeColor = rgba(255, 60, 82, 210);
    graphics.lineWidth = 3;
    graphics.circle(0, 0, radius * 0.25);
    graphics.stroke();
    graphics.fillColor = rgba(255, 238, 200, 230);
    graphics.circle(0, 0, radius * 0.025);
    graphics.fill();
    this.registerEffect(node, 'orb', x, y, 176, 2.7, 0, 0.8);
  }

  private addRing(name: string, x: number, y: number, radius: number, color: Color, lineWidth: number, opacity: number, speed: number, phase: number): void {
    const node = this.createEffectNode(name, x, y, radius * 2, radius * 2);
    const graphics = node.addComponent(Graphics);
    graphics.strokeColor = color;
    graphics.lineWidth = lineWidth;
    graphics.circle(0, 0, radius);
    graphics.stroke();
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      const start = radius * 0.82;
      const end = radius * 1.06;
      graphics.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
      graphics.lineTo(Math.cos(angle) * end, Math.sin(angle) * end);
      graphics.stroke();
    }
    this.registerEffect(node, 'ring', x, y, opacity, speed, 0, phase);
  }

  private addBeam(x: number, y: number, width: number, height: number): void {
    const node = this.createEffectNode('AbyssLightBeam', x, y, width * 5, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(255, 226, 182, 112);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.fillColor = rgba(255, 40, 72, 72);
    graphics.rect(-width * 1.8, -height / 2, width * 3.6, height);
    graphics.fill();
    this.registerEffect(node, 'beam', x, y, 138, 5.2, 0, 1.6);
  }

  private addGemAura(x: number, y: number, size: number): void {
    const node = this.createEffectNode('FloatingGemAura', x, y, size * 1.4, size * 2.2);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = rgba(255, 45, 83, 88);
    graphics.circle(0, 0, size * 0.62);
    graphics.fill();
    graphics.fillColor = rgba(201, 39, 61, 136);
    graphics.moveTo(0, size);
    graphics.lineTo(size * 0.36, 0);
    graphics.lineTo(0, -size);
    graphics.lineTo(-size * 0.36, 0);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = rgba(245, 210, 122, 148);
    graphics.lineWidth = 2;
    graphics.moveTo(0, size);
    graphics.lineTo(size * 0.36, 0);
    graphics.lineTo(0, -size);
    graphics.lineTo(-size * 0.36, 0);
    graphics.close();
    graphics.stroke();
    this.registerEffect(node, 'orb', x, y, 88, 2.2, 0, 2.2);
  }

  private addFireCluster(x: number, y: number, scale: number, direction: number): void {
    for (let index = 0; index < 6; index += 1) {
      const flameX = x + direction * (index - 2.5) * 12 * scale;
      const flameY = y + (index % 2) * 6 * scale;
      const width = (20 + (index % 3) * 7) * scale;
      const height = (72 + (index % 4) * 16) * scale;
      const node = this.createEffectNode(`LoginFire_${direction}_${index}`, flameX, flameY, width, height);
      const graphics = node.addComponent(Graphics);
      this.drawFlame(graphics, width, height);
      this.registerEffect(node, 'fire', flameX, flameY, 126 - index * 5, 5.1 + index * 0.47, 0, index * 0.72);
    }
  }

  private drawFlame(graphics: Graphics, width: number, height: number): void {
    graphics.fillColor = rgba(255, 224, 142, 126);
    graphics.moveTo(0, height / 2);
    graphics.bezierCurveTo(width * 0.5, height * 0.12, width * 0.28, -height * 0.26, 0, -height / 2);
    graphics.bezierCurveTo(-width * 0.42, -height * 0.12, -width * 0.28, height * 0.2, 0, height / 2);
    graphics.close();
    graphics.fill();
    graphics.fillColor = rgba(255, 76, 42, 156);
    graphics.moveTo(0, height * 0.42);
    graphics.bezierCurveTo(width * 0.64, height * 0.06, width * 0.22, -height * 0.36, 0, -height * 0.5);
    graphics.bezierCurveTo(-width * 0.56, -height * 0.04, -width * 0.22, height * 0.14, 0, height * 0.42);
    graphics.close();
    graphics.fill();
  }

  private addEmbers(layout: EffectLayout): void {
    const count = layout.compact ? 28 : 48;
    for (let index = 0; index < count; index += 1) {
      const x = -layout.width * 0.44 + ((index * 73) % Math.floor(layout.width * 0.88));
      const y = -layout.height / 2 - 20 - (index % 5) * 8;
      const radius = 1.5 + (index % 4) * 0.65;
      const node = this.createEffectNode(`Ember_${index}`, x, y, radius * 2, radius * 2);
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = rgba(255, 112, 58, 190);
      graphics.circle(0, 0, radius);
      graphics.fill();
      this.registerEffect(node, 'ember', x, y, 180, 0.09 + (index % 7) * 0.012, layout.height * (0.5 + (index % 3) * 0.08), (index * 0.173) % 1);
    }
  }

  private createEffectNode(name: string, x: number, y: number, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = this.node.layer;
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    this.ensureEffectRoot().addChild(node);
    return node;
  }

  private registerEffect(node: Node, kind: EffectKind, baseX: number, baseY: number, baseOpacity: number, speed: number, amplitude: number, phase: number): void {
    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    opacity.opacity = this.clampOpacity(baseOpacity);
    this.effects.push({
      node,
      opacity,
      kind,
      baseX,
      baseY,
      baseOpacity,
      speed,
      amplitude,
      phase,
    });
  }

  private ensureEffectRoot(): Node {
    if (this.effectRoot?.isValid) {
      return this.effectRoot;
    }
    const root = new Node('LootChainLoginEffects');
    root.layer = this.node.layer;
    this.node.addChild(root);
    this.effectRoot = root;
    return root;
  }

  private resolveLayout(): EffectLayout {
    // 特效按设计坐标(可视区)摆放;旧版读 window.innerWidth(CSS 像素)当设计尺寸,手机 / 大屏上会摆到屏幕中间或屏外。
    const visible = view.getVisibleSize();
    const width = Math.max(1440, Math.round(visible.width || 1920));
    const height = Math.max(720, Math.round(visible.height || 1080));
    return {
      width,
      height,
      compact: false,
    };
  }

  private makeLayoutKey(): string {
    const layout = this.resolveLayout();
    return `${layout.width}x${layout.height}:${layout.compact ? 'compact' : 'desktop'}`;
  }

  private clampOpacity(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
  }
}
