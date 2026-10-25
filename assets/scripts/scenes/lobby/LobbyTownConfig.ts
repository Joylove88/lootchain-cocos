/**
 * 主城跑图(2026-10-25 用户拍板,docs 见后端仓 docs/46):大厅改成俯视 3/4 可走动小镇,
 * 摇杆 / 键盘控制队长移动,队友跟随,走到建筑门口点「进入」打开对应功能页。
 * 原型 v7 定稿(周报截图/2026-10-25_主城跑图),建筑用 v4 科技感版。
 *
 * 坐标系:世界单位 = 900 高舞台下的设计像素,y 向上;地图中心为原点。
 * 建筑 (x, y) 是贴图底边中点(脚线);footprint 是从脚线往"里"(屏幕上方)延伸的不可走矩形;door 是门口交互点(相对脚线)。
 */
export type TownBuildingKey = 'gate' | 'temple' | 'forge' | 'tower' | 'crystal' | 'shop' | 'guild' | 'camp' | 'hall';
export type TownAction = 'adventure' | 'gacha' | 'forge' | 'daily' | 'crystal' | 'shop' | 'quest' | 'heroes' | 'codex';

export interface TownBuildingConfig {
  key: TownBuildingKey;
  label: string;
  action: TownAction;
  x: number;
  y: number;
  /** 贴图显示宽(世界单位),高按图片比例。 */
  width: number;
  /** 不可走区:宽 × 深(从脚线往上)。 */
  footprint: { w: number; d: number };
  /** 门口交互点(相对脚线)。 */
  door: { x: number; y: number };
}

export const TOWN_ASSET_DIR = 'ui/town';
export const TOWN_GROUND_ASSET = `${TOWN_ASSET_DIR}/ground/spriteFrame`;
export const TOWN_LAMP_ASSET = `${TOWN_ASSET_DIR}/lamp/spriteFrame`;
export function townBuildingAsset(key: TownBuildingKey): string {
  return `${TOWN_ASSET_DIR}/${key}/spriteFrame`;
}

/** 地图尺寸与可走范围(世界单位)。 */
export const TOWN_MAP = { width: 4400, height: 2600 } as const;
export const TOWN_WALK_BOUNDS = { left: -2050, right: 2050, bottom: -1150, top: 880 } as const;
export const TOWN_SPAWN = { x: 0, y: -380 } as const;
/** 地面平铺贴图一格的世界尺寸。 */
export const TOWN_GROUND_TILE = 512;

export const TOWN_BUILDINGS: readonly TownBuildingConfig[] = [
  // 后排
  { key: 'temple', label: '圣契神殿', action: 'gacha', x: -1500, y: 620, width: 680, footprint: { w: 520, d: 150 }, door: { x: 0, y: -60 } },
  { key: 'gate', label: '冒险之门', action: 'adventure', x: 0, y: 760, width: 820, footprint: { w: 580, d: 130 }, door: { x: 0, y: -60 } },
  { key: 'tower', label: '秘境试炼塔', action: 'daily', x: 1500, y: 650, width: 600, footprint: { w: 430, d: 160 }, door: { x: 0, y: -60 } },
  // 中排
  { key: 'camp', label: '英雄营地', action: 'heroes', x: -1650, y: -180, width: 660, footprint: { w: 580, d: 190 }, door: { x: 60, y: -60 } },
  { key: 'crystal', label: '守卫水晶', action: 'crystal', x: 560, y: 110, width: 420, footprint: { w: 300, d: 130 }, door: { x: 0, y: -70 } },
  { key: 'forge', label: '熔铸工坊', action: 'forge', x: 1620, y: -140, width: 700, footprint: { w: 580, d: 170 }, door: { x: -80, y: -60 } },
  // 前排
  { key: 'shop', label: '商行', action: 'shop', x: -1400, y: -900, width: 620, footprint: { w: 520, d: 160 }, door: { x: 0, y: -60 } },
  { key: 'guild', label: '佣兵公会', action: 'quest', x: -380, y: -980, width: 640, footprint: { w: 560, d: 160 }, door: { x: 0, y: -60 } },
  { key: 'hall', label: '英灵殿', action: 'codex', x: 1320, y: -960, width: 700, footprint: { w: 600, d: 160 }, door: { x: 0, y: -60 } },
];

/** 路灯位置(装饰,也参与前后遮挡,不挡路)。 */
export const TOWN_LAMPS: ReadonlyArray<{ x: number; y: number }> = [
  { x: -780, y: 420 }, { x: 780, y: 420 },
  { x: -860, y: -600 }, { x: 860, y: -600 },
  { x: -1900, y: 220 }, { x: 1960, y: 250 },
  { x: 0, y: -40 },
];

export const TOWN_ASSET_PATHS: readonly string[] = [
  TOWN_GROUND_ASSET,
  TOWN_LAMP_ASSET,
  ...TOWN_BUILDINGS.map((building) => townBuildingAsset(building.key)),
];
