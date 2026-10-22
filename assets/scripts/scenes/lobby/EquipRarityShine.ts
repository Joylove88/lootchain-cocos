import { Color, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, tween, Tween } from 'cc';
import { equipGlowFrame, equipPlateFrame, equipSweepFrames, itemRarityRingFrame } from './GuardBakedShapes';
import { equipQualityColorByCode } from './EquipIconAssets';

/**
 * 装备图标垫底 + 橙 / 红装背景流光(2026-10-22 用户「橙装、红装可以加流光吧」「不用加在边框绕行」「加图标背景上」)。
 * 图标素材(ui/forge/ai/equip)已把暗底抠成透明(只剩装备本体 + 稀有度描边),所以凡是显示装备图标的地方都先用本助手垫一块暗底;
 * 橙 / 红装再在暗底与装备图之间放两层光:稀有度色呼吸辉光(整块缓慢明暗)+ 隔几秒一道斜向扫光(烘焙序列帧,画布天然裁边,无遮罩)。
 * 全是普通精灵 + tween,不逐帧画 Graphics;背包整页十几格同时跑无压力。
 */
export type EquipShineTier = 'orange' | 'red';

export interface EquipShineHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
}

export function equipShineTierByCode(equipCode: string | null | undefined): EquipShineTier | null {
  const q = equipQualityColorByCode(equipCode);
  return q === 'orange' || q === 'red' ? q : null;
}

const TIER_STYLE: Record<EquipShineTier, { glow: Color; sweep: Color; double: boolean; pause: number }> = {
  orange: { glow: new Color(255, 150, 40, 255), sweep: new Color(255, 228, 170, 255), double: false, pause: 2.6 },
  red: { glow: new Color(255, 70, 50, 255), sweep: new Color(255, 196, 176, 255), double: true, pause: 1.9 },
};

/** 图标素材里暗底边缘 / 描边中心 / 圆角占边长的比例(512 版:描边 14~30、圆角 40) */
const PLATE_FRAC = 0.94;
const GLOW_FRAC = 0.96;

function mountBaked(host: EquipShineHost, parent: Node, name: string, frame: SpriteFrame | null, x: number, y: number, width: number, height: number): Node | null {
  if (!frame) {
    return null;
  }
  const node = host.addChildPlainNode(parent, name, x, y, width, height);
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.trim = false;
  sprite.spriteFrame = frame;
  node.getComponent(UITransform)?.setContentSize(width, height);
  return node;
}

/**
 * 在 parent 的 (x, y) 处、边长 box 的装备图标后面垫暗底;橙 / 红装附带背景流光。必须在 addSprite 图标之前调用(同级节点按创建顺序绘制)。
 * 返回垫底容器(可能为 null:烘焙失败时退回无底,图标仍能显示)。
 */
export function mountEquipIconBacking(
  host: EquipShineHost,
  parent: Node,
  name: string,
  box: number,
  equipCode: string | null | undefined,
  opts: { x?: number; y?: number; shine?: boolean } = {},
): Node | null {
  if (!(box > 0)) {
    return null;
  }
  const layer = host.addChildPlainNode(parent, name, opts.x ?? 0, opts.y ?? 0, box, box);
  const plateSize = box * PLATE_FRAC;
  mountBaked(host, layer, 'Plate', equipPlateFrame(), 0, 0, plateSize, plateSize);
  const tier = opts.shine === false ? null : equipShineTierByCode(equipCode);
  if (!tier || box < 32) {
    return layer;
  }
  const style = TIER_STYLE[tier];
  // 1) 呼吸辉光:中心亮、向外柔和衰减,缓慢明暗 + 轻微缩放
  const glowSize = box * GLOW_FRAC;
  const glow = mountBaked(host, layer, 'Glow', equipGlowFrame(style.glow), 0, 0, glowSize, glowSize);
  if (glow) {
    const opacity = glow.addComponent(UIOpacity);
    opacity.opacity = 150;
    tween(opacity)
      .repeatForever(tween(opacity).to(1.3, { opacity: 235 }).to(1.3, { opacity: 150 }))
      .start();
    tween(glow)
      .repeatForever(tween(glow).to(1.3, { scale: new Vec3(1.06, 1.06, 1) }).to(1.3, { scale: new Vec3(0.97, 0.97, 1) }))
      .start();
  }
  // 2) 斜向扫光:序列帧,一次 0.6s,停 pause 秒再扫;红装双带、更频繁
  const frames = equipSweepFrames(style.sweep, style.double);
  if (frames.length > 0) {
    const sweep = mountBaked(host, layer, 'Sweep', frames[0], 0, 0, plateSize, plateSize);
    if (sweep) {
      const sprite = sweep.getComponent(Sprite)!;
      const sweepOpacity = sweep.addComponent(UIOpacity);
      sweepOpacity.opacity = 0;
      const proxy = { f: 0 };
      const tw: Tween<{ f: number }> = tween(proxy)
        .delay(Math.random() * style.pause)
        .repeatForever(
          tween(proxy)
            .call(() => {
              if (sweep.isValid) {
                sweepOpacity.opacity = 255;
              }
            })
            .set({ f: 0 })
            .to(0.6, { f: frames.length - 1 }, {
              onUpdate: () => {
                if (!sweep.isValid) {
                  tw.stop();
                  return;
                }
                const index = Math.max(0, Math.min(frames.length - 1, Math.round(proxy.f)));
                if (sprite.spriteFrame !== frames[index]) {
                  sprite.spriteFrame = frames[index];
                }
              },
            })
            .call(() => {
              if (sweep.isValid) {
                sweepOpacity.opacity = 0;
              }
            })
            .delay(style.pause),
        )
        .start();
    }
  }
  return layer;
}

/** 道具稀有度 → 描边色(与装备图标烘焙描边实测色一致:白 / 绿 / 蓝 / 紫 / 橙 / 红)。 */
const ITEM_RING_COLORS: Record<string, Color> = {
  WHITE: new Color(218, 222, 227, 255),
  GREEN: new Color(59, 208, 108, 255),
  BLUE: new Color(53, 128, 248, 255),
  PURPLE: new Color(165, 71, 247, 255),
  ORANGE: new Color(251, 163, 49, 255),
  RED: new Color(236, 50, 43, 255),
};

export function itemRarityRingColor(rarity: string | null | undefined): Color {
  switch ((rarity || '').toUpperCase()) {
    case 'UR':
    case 'RED':
    case 'MYTHIC':
      return ITEM_RING_COLORS.RED;
    case 'SSR':
    case 'GOLD':
    case 'ORANGE':
    case 'LEGENDARY':
      return ITEM_RING_COLORS.ORANGE;
    case 'SR':
    case 'EPIC':
    case 'PURPLE':
      return ITEM_RING_COLORS.PURPLE;
    case 'R':
    case 'RARE':
    case 'BLUE':
      return ITEM_RING_COLORS.BLUE;
    case 'GREEN':
    case 'UNCOMMON':
      return ITEM_RING_COLORS.GREEN;
    default:
      return ITEM_RING_COLORS.WHITE;
  }
}

/**
 * 材料 / 道具图标垫底(2026-10-22 用户定 A 方案:材料与装备同款「暗底 + 稀有度细描边」)。
 * 材料图标素材是透明本体(占画布 ~86%),这里在 box 边长处画暗底 + 稀有度描边;描边落在图标透明边距里,不压本体。
 * 必须在 addSprite 图标之前调用(同级节点按创建顺序绘制)。
 */
export function mountItemRarityBacking(
  host: EquipShineHost,
  parent: Node,
  name: string,
  box: number,
  rarity: string | null | undefined,
  opts: { x?: number; y?: number } = {},
): Node | null {
  if (!(box > 0)) {
    return null;
  }
  const layer = host.addChildPlainNode(parent, name, opts.x ?? 0, opts.y ?? 0, box, box);
  const plateSize = box * PLATE_FRAC;
  mountBaked(host, layer, 'Plate', equipPlateFrame(), 0, 0, plateSize, plateSize);
  mountBaked(host, layer, 'Ring', itemRarityRingFrame(itemRarityRingColor(rarity)), 0, 0, box, box);
  return layer;
}

