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
  icSword: `${HUD}/ic_sword/spriteFrame`,
  icSlash: `${HUD}/ic_slash/spriteFrame`,
  icDash: `${HUD}/ic_dash/spriteFrame`,
  icWhirl: `${HUD}/ic_whirl/spriteFrame`,
  icDodge: `${HUD}/ic_dodge/spriteFrame`,
  icTarget: `${HUD}/ic_target/spriteFrame`,
  icShop: `${HUD}/ic_shop/spriteFrame`,
  icMail: `${HUD}/ic_mail/spriteFrame`,
  icTerminal: `${HUD}/ic_terminal/spriteFrame`,
  icSummon: `${HUD}/ic_summon/spriteFrame`,
  icGear: `${HUD}/ic_gear/spriteFrame`,
  icGift: `${HUD}/ic_gift/spriteFrame`,
  icNotice: `${HUD}/ic_notice/spriteFrame`,
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

/** docs/51 终端(proto_terminal_v2):功能格图标 + 框。 */
const T = HUD;
export const TERMINAL_TILE_ICONS: Record<string, string> = {
  heroes: `${T}/t_hero/spriteFrame`, formation: `${T}/t_formation/spriteFrame`, bag: `${T}/t_bag/spriteFrame`, forge: `${T}/t_forge/spriteFrame`, gacha: `${T}/t_summon/spriteFrame`,
  adventure: `${T}/t_adventure/spriteFrame`, daily: `${T}/t_tower/spriteFrame`, crystal: `${T}/t_crystal/spriteFrame`, codex: `${T}/t_codex/spriteFrame`, quest: `${T}/t_quest/spriteFrame`,
  shop: `${T}/t_shop/spriteFrame`, guild: `${T}/t_guild/spriteFrame`, idle: `${T}/t_idle/spriteFrame`, worldmap: `${T}/t_worldmap/spriteFrame`, rank: `${T}/t_rank/spriteFrame`,
};
/** 终端框件:全部复用现成 UiRefKit(名片 = 弹窗框、格子 = 数值框 + 暗条、底栏 = 暗金牌、关闭 = 全局关闭钮)。 */
export const TERMINAL_ASSETS = {
  tileFrame: 'ui/common/ref/ult_stat_box/spriteFrame',
  tileStrip: 'ui/common/ref/stat_bar/spriteFrame',
  cardPanel: 'ui/common/ref/dialog_frame/spriteFrame',
  bottomStrip: 'ui/common/ref/plate_dark/spriteFrame',
  btnClose: 'ui/common/ai/button_close/spriteFrame',
} as const;
export const TERMINAL_ASSET_PATHS: string[] = Object.values(TERMINAL_TILE_ICONS).concat(Object.values(TERMINAL_ASSETS));


/** 圆钮底座:暗铁圆盘 + 尖刺金环(hot = 外加一圈细金线强调,不用光晕)。 */
export function mountRingBase(
  host: { addChildPlainNode(parent: Node, name: string, x: number, y: number, w: number, h: number): Node; addSprite(name: string, path: string, x: number, y: number, w: number, h: number, parent?: Node): Sprite | null },
  parent: Node,
  d: number,
  hot = false,
  fill: Color = new Color(20, 16, 14, 238),
): void {
  const disc = host.addChildPlainNode(parent, 'Disc', 0, 0, d, d).addComponent(Graphics);
  disc.fillColor = fill;
  disc.circle(0, 0, d * 0.39);
  disc.fill();
  if (hot) {
    disc.strokeColor = new Color(232, 190, 110, 200);
    disc.lineWidth = Math.max(1, d * 0.025);
    disc.circle(0, 0, d * 0.47);
    disc.stroke();
  }
  host.addSprite('Ring', TOWN_HUD_ASSETS.ringSpiked, 0, 0, d, d, parent);
}
