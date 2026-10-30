import { Color, Graphics, type Node, type Sprite } from 'cc';
import type { UiLayout } from './LobbyHudTypes';

/**
 * 主城 HUD 原型(2026-10-27 用户确认;v1 proto_v1.png → docs/51 v3 proto_town_v3 / proto_field_v1,均 1870×841)1:1 坐标映射。
 * 原型像素 × u(= 舞台高 / 841),左侧件贴舞台左缘、右侧件贴右缘、底栏居中;窄屏(平板 / 电脑 16:9)由调用方按可用宽再压一道。
 */
export const TOWN_PROTO_W = 1870;
export const TOWN_PROTO_H = 841;
export const TOWN_HUD_PROTO = { w: TOWN_PROTO_W, h: TOWN_PROTO_H } as const;

export interface TownProtoFrame {
  u: number;
  /** 左缘锚定:原型 x → 设计 x */
  L(px: number): number;
  /** 右缘锚定 */
  R(px: number): number;
  /** 水平居中锚定 */
  C(px: number): number;
  /** 原型 y(自上而下)→ 设计 y */
  Y(py: number): number;
  /** 原型尺寸 → 设计尺寸 */
  S(size: number): number;
}

export function townProtoFrame(layout: UiLayout): TownProtoFrame {
  const u = layout.stageHeight / TOWN_PROTO_H;
  const cx = (layout.stageLeft + layout.stageRight) / 2;
  return {
    u,
    L: (px) => layout.stageLeft + px * u,
    R: (px) => layout.stageRight - (TOWN_PROTO_W - px) * u,
    C: (px) => cx + (px - TOWN_PROTO_W / 2) * u,
    Y: (py) => layout.stageTop - py * u,
    S: (size) => size * u,
  };
}

/** 主城 HUD 新素材(GPT 按原型逐件出,透明底,已裁到内容边)。 */
const HUD = 'ui/town/hud';
const KIT_RING = 'ui/common/ref/icon_ring/spriteFrame';
export const TOWN_HUD_ASSETS = {
  joyBase: `${HUD}/joy_base/spriteFrame`,
  joyKnob: `${HUD}/joy_knob/spriteFrame`,
  /** 主城小地图底图(俯视城区:中央圆广场 + 放射道路 + 边缘树林) */
  minimapCity: `${HUD}/minimap_city/spriteFrame`,
  iconQuest: `${HUD}/icon_quest/spriteFrame`,
  iconPortal: `${HUD}/icon_portal/spriteFrame`,
  mapTemple: `${HUD}/map_temple/spriteFrame`,
  mapGate: `${HUD}/map_gate/spriteFrame`,
  mapTower: `${HUD}/map_tower/spriteFrame`,
  mapCamp: `${HUD}/map_camp/spriteFrame`,
  mapCrystal: `${HUD}/map_crystal/spriteFrame`,
  mapForge: `${HUD}/map_forge/spriteFrame`,
  mapShop: `${HUD}/map_shop/spriteFrame`,
  mapGuild: `${HUD}/map_guild/spriteFrame`,
  mapHall: `${HUD}/map_hall/spriteFrame`,
  mapArrow: `${HUD}/map_arrow/spriteFrame`,
  // docs/51 原型 v3:框 / 环 / 条一律复用游戏现成 UiRefKit 件(2026-10-27 用户:「关闭图标和边框之前不是有吗」),只有图标是新生成的
  /** 尖刺金环 256×256:内孔半径 0.36d、环外沿 ≈ 0.43d、四尖刺到 0.48d;小地图 / 圆钮 / 头像 / 战斗钮共用 */
  ringSpiked: KIT_RING,
  /** 普通交互提示条(900×85 九宫格) / 高亮提示条(696×150) / 血条框(1112×120 两端箭头) */
  promptBar: 'ui/common/ref/stat_bar/spriteFrame',
  promptBarHot: 'ui/common/ref/plate_dark/spriteFrame',
  barFrame: 'ui/common/ref/info_banner/spriteFrame',
  eliteMedal: `${HUD}/elite_medal/spriteFrame`,
  // 2026-10-29 B 风格(原型 field_b / town_b):白色线稿图标(tools/qa/glass_kit_gen.cut_line_icons 从原型抠)
  icSword: 'ui/glass/hud_sword/spriteFrame',
  icSlash: 'ui/glass/hud_slash/spriteFrame',
  icDash: 'ui/glass/hud_dash/spriteFrame',
  icWhirl: 'ui/glass/hud_whirl/spriteFrame',
  icDodge: 'ui/glass/hud_dodge/spriteFrame',
  icTarget: 'ui/glass/hud_target/spriteFrame',
  icShop: 'ui/glass/hud_shop/spriteFrame',
  icMail: 'ui/glass/hud_mail/spriteFrame',
  icTerminal: 'ui/glass/hud_terminal/spriteFrame',
  icSummon: 'ui/glass/hud_summon/spriteFrame',
  icWorldPortal: 'ui/glass/hud_portal/spriteFrame',
  icRecall: 'ui/glass/hud_recall/spriteFrame',
  /** 大招 / 援护就绪光圈(香槟柔光环) */
  haloRing: 'ui/glass/halo_ring/spriteFrame',
  // 10-29 用户「边框糊」:圆钮 / 环 / 摇杆改 4 倍超采样贴图(原生端 Graphics 线不抗锯齿)
  hudDisc: 'ui/glass/hud_disc/spriteFrame',
  hudDiscHot: 'ui/glass/hud_disc_hot/spriteFrame',
  hudRingThin: 'ui/glass/hud_ring_thin/spriteFrame',
  hudJoyBase: 'ui/glass/hud_joy_base/spriteFrame',
  hudJoyKnob: 'ui/glass/hud_joy_knob/spriteFrame',
  minimapRing: 'ui/glass/minimap_ring/spriteFrame',
  /** 左实右淡的白色渐变条(程序生成,着色后当追踪条暗衬底) */
  fadeBand: `${HUD}/fade_band/spriteFrame`,
} as const;

/** 小地图建筑图标(按主城建筑 key);野外图没有建筑,只画怪群点。 */
export const TOWN_MINIMAP_BUILDING_ICONS: Record<string, string> = {
  temple: TOWN_HUD_ASSETS.mapTemple,
  gate: TOWN_HUD_ASSETS.mapGate,
  tower: TOWN_HUD_ASSETS.mapTower,
  camp: TOWN_HUD_ASSETS.mapCamp,
  crystal: TOWN_HUD_ASSETS.mapCrystal,
  forge: TOWN_HUD_ASSETS.mapForge,
  shop: TOWN_HUD_ASSETS.mapShop,
  guild: TOWN_HUD_ASSETS.mapGuild,
  hall: TOWN_HUD_ASSETS.mapHall,
};

export const TOWN_HUD_ASSET_PATHS: string[] = Object.values(TOWN_HUD_ASSETS);

/** 终端 B 风格(10-30 用户确认 proto_terminal_b2):原型整张静态底层 + 头像环覆盖层(tools/qa/terminal_b_extract.py 产出,1:1 还原)。 */
export const TERMINAL_ASSETS = {
  staticLayer: 'ui/town/terminal/static_b/spriteFrame',
  ringOverlay: 'ui/town/terminal/ring_overlay_b/spriteFrame',
} as const;
export const TERMINAL_ASSET_PATHS: string[] = Object.values(TERMINAL_ASSETS);


/**
 * 圆钮底座(2026-10-29 B 风格,原型 town_b / field_b):深色磨砂圆盘 + 一圈浅色细边;hot = 细边换香槟色(普攻 / 终端)。
 * d 为外框直径(圆盘半径 0.41d)。不再用尖刺金环。
 */
export function mountRingBase(
  host: { addChildPlainNode(parent: Node, name: string, x: number, y: number, w: number, h: number): Node; addSprite(name: string, path: string, x: number, y: number, w: number, h: number, parent?: Node): Sprite | null },
  parent: Node,
  d: number,
  hot = false,
  fill: Color = new Color(34, 38, 43, 228),
): void {
  // 贴图优先(超采样,边缘细腻);缺图才退 Graphics
  if (host.addSprite('Disc', hot ? TOWN_HUD_ASSETS.hudDiscHot : TOWN_HUD_ASSETS.hudDisc, 0, 0, d, d, parent)) {
    return;
  }
  const disc = host.addChildPlainNode(parent, 'Disc', 0, 0, d, d).addComponent(Graphics);
  const r = d * 0.41;
  disc.fillColor = fill;
  disc.circle(0, 0, r);
  disc.fill();
  disc.strokeColor = hot ? new Color(226, 196, 138, 240) : new Color(184, 192, 202, 215);
  disc.lineWidth = Math.max(1.5, d * (hot ? 0.02 : 0.016));
  disc.circle(0, 0, r);
  disc.stroke();
}
