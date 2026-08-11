import { HttpClient } from '../net/HttpClient';
import { expectRecord, expectRecordArray } from './ApiValueGuards';

/** 玩家装备项(装备一期,与后端 PlayerEquipmentItemVO 对齐)。 */
export interface EquipmentItemVO {
  id: number;
  equipCode: string;
  equipName: string;
  /** WEAPON/HELMET/CHEST/BOOTS/RING/NECKLACE。 */
  slot: string;
  /** WHITE/BLUE/PURPLE/GOLD/RED/MYTHIC。 */
  quality: string;
  /** 装备阶级(1起);高一阶蓝装≈低一阶金装。 */
  tier: number;
  /** 穿戴等级门槛(1阶Lv1/2阶Lv20),等级不足服务端拒绝。 */
  requiredLevel: number;
  attrHp: number;
  attrAttack: number;
  attrDefense: number;
  attrSpeed: number;
  attrCrit: number;
  /** 特级词条 JSON(连击/斩杀);展示用。 */
  specialEffectsJson?: string | null;
  /** 穿戴英雄ID;空=背包未穿。 */
  heroId?: number | null;
  /** 强化等级 0~10:装备基础属性 ×(1+0.1×等级)。 */
  enhanceLevel: number;
  /** 实例词条(2.0 P4):紫1/橙2/红3,档位色随数值区间。 */
  specialAffixes?: EquipAffixVO[] | null;
  /** 镶嵌宝石(P5):固定 5 孔数组,空孔 null;开孔数=稀有度阶数。 */
  gems?: (string | null)[] | null;
}

/** 装备实例词条:tier=GREEN/BLUE/PURPLE/ORANGE/CRIMSON;special=特级词条(连击/斩杀线/无视防御/烈焰冲击/对Boss伤害)。 */
export interface EquipAffixVO {
  code: string;
  name: string;
  tier: string;
  value: number;
  percent: boolean;
  special: boolean;
}

/** 装备一期接口:列表/穿戴(同部位自动替换)/卸下。穿卸后英雄战力由服务器重算。 */
export class EquipmentApi {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<EquipmentItemVO[]> {
    return this.http.get<unknown>('/api/player/equipment').then(expectRecordArray<EquipmentItemVO>('装备列表', 1000));
  }

  equip(equipmentId: number, heroId: number): Promise<EquipmentItemVO> {
    return this.http.post<unknown>('/api/player/equipment/equip', { equipmentId, heroId }).then(expectRecord<EquipmentItemVO>('装备穿戴'));
  }

  unequip(equipmentId: number): Promise<EquipmentItemVO> {
    return this.http.post<unknown>('/api/player/equipment/unequip', { equipmentId }).then(expectRecord<EquipmentItemVO>('装备卸下'));
  }

  // 合成(2.0 P2):3 件同部位同稀有度未穿戴 → 有概率合成上一稀有度;失败返还同档 1 件。
  fuse(equipmentIds: number[], useLuckStone: boolean): Promise<EquipFuseResultVO> {
    return this.http.post<unknown>('/api/player/equipment/fuse', { equipmentIds, useLuckStone }).then(expectRecord<EquipFuseResultVO>('装备合成'));
  }

  // 强化(2.0 P3):+1;+5 起失败降级(护符抵消);消耗强化石×(等级+1)+金币。
  enhance(equipmentId: number, useBlessStone: boolean, useGuardRune: boolean): Promise<EquipEnhanceResultVO> {
    return this.http.post<unknown>('/api/player/equipment/enhance', { equipmentId, useBlessStone, useGuardRune }).then(expectRecord<EquipEnhanceResultVO>('装备强化'));
  }

  // 分解(2.0 P3):未穿戴装备换强化石。
  decompose(equipmentIds: number[]): Promise<EquipDecomposeResultVO> {
    return this.http.post<unknown>('/api/player/equipment/decompose', { equipmentIds }).then(expectRecord<EquipDecomposeResultVO>('装备分解'));
  }

  // 词条洗练(2.0 P4):洗练石×1+金币(紫500/橙2000/红5000),整件重roll全部词条。
  reroll(equipmentId: number): Promise<EquipRerollResultVO> {
    return this.http.post<unknown>('/api/player/equipment/reroll', { equipmentId }).then(expectRecord<EquipRerollResultVO>('装备洗练'));
  }

  // 宝石镶嵌(P5):第 i 孔只收 i 阶宝石;孔上有旧宝石=收拆卸费+退回背包再镶。
  gemSocket(equipmentId: number, slotIndex: number, gemCode: string): Promise<EquipmentItemVO> {
    return this.http.post<unknown>('/api/player/equipment/gem/socket', { equipmentId, slotIndex, gemCode }).then(expectRecord<EquipmentItemVO>('宝石镶嵌'));
  }

  // 宝石拆卸(P5):金币费 100×2^(阶-1),宝石退回背包。
  gemUnsocket(equipmentId: number, slotIndex: number): Promise<EquipmentItemVO> {
    return this.http.post<unknown>('/api/player/equipment/gem/unsocket', { equipmentId, slotIndex }).then(expectRecord<EquipmentItemVO>('宝石拆卸'));
  }
}

export interface EquipRerollResultVO {
  item: EquipmentItemVO;
}

export interface EquipFuseResultVO {
  success: boolean;
  chance: number;
  usedLuckStone: boolean;
  resultItem: EquipmentItemVO;
}

export interface EquipEnhanceResultVO {
  success: boolean;
  levelBefore: number;
  levelAfter: number;
  chance: number;
  downgraded: boolean;
  stoneCost: number;
  goldCost: number;
}

export interface EquipDecomposeResultVO {
  count: number;
  stonesGained: number;
  blessGained: number;
  runeGained: number;
  /** 分解炽红装备附加宝石编码列表(可重复,客户端归组展示)。 */
  gemsGained: string[];
}
