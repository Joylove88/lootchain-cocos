// 装备图标资产映射(AI 素材 v2,2026-07-17):装备编码 → ui/forge/ai/equip 下的图标文件。
// 注意:装备编码带历史颜色后缀(装备 2.0 P1 稀有度改制"原地重标",编码未动:如 EQ_WEAPON_BLUE 现为绿装),
// 图标文件名按**当前真实稀有度**命名(equip_{色}_{部位}),脏映射集中在本表,业务侧只调 equipIconAssetByCode。
// v2 素材为不透明暗渐晕底正方图(Diablo 式写实,零后处理直出;备份在 素材原始备份/equip_v2_20260714)。

const EQUIP_ICON_DIR = 'ui/forge/ai/equip';

const EQUIP_ICON_FILES: Record<string, string> = {
  // 白 · 粗铁
  EQ_V2_WHITE_WEAPON: 'equip_white_weapon',
  EQ_V2_WHITE_HELMET: 'equip_white_helmet',
  EQ_V2_WHITE_CHEST: 'equip_white_chest',
  EQ_V2_WHITE_BOOTS: 'equip_white_boots',
  EQ_V2_WHITE_RING: 'equip_white_ring',
  EQ_V2_WHITE_NECK: 'equip_white_neck',
  // 绿 · 铁誓(编码历史后缀 BLUE)
  EQ_WEAPON_BLUE: 'equip_green_weapon',
  EQ_HELMET_BLUE: 'equip_green_helmet',
  EQ_CHEST_BLUE: 'equip_green_chest',
  EQ_BOOTS_BLUE: 'equip_green_boots',
  EQ_RING_BLUE: 'equip_green_ring',
  EQ_NECK_BLUE: 'equip_green_neck',
  // 蓝 · 裂隙(编码历史后缀 PURPLE)
  EQ_WEAPON_PURPLE: 'equip_blue_weapon',
  EQ_HELMET_PURPLE: 'equip_blue_helmet',
  EQ_CHEST_PURPLE: 'equip_blue_chest',
  EQ_BOOTS_PURPLE: 'equip_blue_boots',
  EQ_RING_PURPLE: 'equip_blue_ring',
  EQ_NECK_PURPLE: 'equip_blue_neck',
  // 紫 · 深渊(编码历史后缀 GOLD)
  EQ_WEAPON_GOLD: 'equip_purple_weapon',
  EQ_HELMET_GOLD: 'equip_purple_helmet',
  EQ_CHEST_GOLD: 'equip_purple_chest',
  EQ_BOOTS_GOLD: 'equip_purple_boots',
  EQ_RING_GOLD: 'equip_purple_ring',
  EQ_NECK_GOLD: 'equip_purple_neck',
  // 橙 · 灼世(编码历史前缀 T1_RED)
  EQ_T1_RED_WEAPON: 'equip_orange_weapon',
  EQ_T1_RED_HELMET: 'equip_orange_helmet',
  EQ_T1_RED_CHEST: 'equip_orange_chest',
  EQ_T1_RED_BOOTS: 'equip_orange_boots',
  EQ_T1_RED_RING: 'equip_orange_ring',
  EQ_T1_RED_NECK: 'equip_orange_neck',
  // 红 · 烬灭
  EQ_V2_RED_WEAPON: 'equip_red_weapon',
  EQ_V2_RED_HELMET: 'equip_red_helmet',
  EQ_V2_RED_CHEST: 'equip_red_chest',
  EQ_V2_RED_BOOTS: 'equip_red_boots',
  EQ_V2_RED_RING: 'equip_red_ring',
  EQ_V2_RED_NECK: 'equip_red_neck',
};

/** 全量装备图标路径(36 件):登录预载用,免得首进锻造/背包逐图现拉触发重渲风暴。 */
export const EQUIP_ICON_ALL_ASSETS: readonly string[] = Object.values(EQUIP_ICON_FILES).map((file) => `${EQUIP_ICON_DIR}/${file}/spriteFrame`);

/** 装备编码 → 真实品质色(图标文件名按当前稀有度命名,借它反查;白装归绿档由调用方处理)。 */
export type EquipQualityColor = 'white' | 'green' | 'blue' | 'purple' | 'orange' | 'red';
export function equipQualityColorByCode(equipCode: string | null | undefined): EquipQualityColor | null {
  if (!equipCode) {
    return null;
  }
  const file = EQUIP_ICON_FILES[equipCode.trim().toUpperCase()];
  if (!file) {
    return null;
  }
  return file.split('_')[1] as EquipQualityColor;
}

/** 装备编码 → 部位键(weapon/helmet/chest/boots/ring/neck),同样借图标文件名反查。 */
export function equipSlotKeyByCode(equipCode: string | null | undefined): string | null {
  if (!equipCode) {
    return null;
  }
  const file = EQUIP_ICON_FILES[equipCode.trim().toUpperCase()];
  if (!file) {
    return null;
  }
  const parts = file.split('_');
  return parts.length >= 3 ? parts[2] : null;
}

/** 装备编码 → 图标 spriteFrame 路径;未登记(未来新装备)返回 null,调用方回退部位图标/线稿。 */
export function equipIconAssetByCode(equipCode: string | null | undefined): string | null {
  if (!equipCode) {
    return null;
  }
  const file = EQUIP_ICON_FILES[equipCode.trim().toUpperCase()];
  return file ? `${EQUIP_ICON_DIR}/${file}/spriteFrame` : null;
}
