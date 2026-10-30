/** 新手村 → 主城 → 野区(docs/50)世界状态,后端 GET /api/player/world/state。 */
export type WorldMapCode = 'VILLAGE' | 'WOODS' | 'CITY' | 'GRAY';
export type WorldQuestState = 'LOCKED' | 'AVAILABLE' | 'ACCEPTED' | 'DONE' | 'CLAIMED' | 'SKIPPED';
export type WorldBountyState = 'OPEN' | 'ACCEPTED' | 'DONE' | 'CLAIMED';

export interface WorldRewardItemVO {
  resourceType: string;
  resourceCode: string;
  resourceName: string;
  amount: number;
}

export interface WorldMapStateVO {
  mapCode: WorldMapCode;
  mapName: string;
  minLevel: number;
  unlocked: boolean;
  activated: boolean;
  lockReason: string;
}

export interface WorldQuestVO {
  code: string;
  chapter: string;
  seq: number;
  name: string;
  desc: string;
  state: WorldQuestState;
  progress: number;
  target: number;
  /** TALK / REACH / KILL / COLLECT / GROW */
  objective: string;
  objectiveTarget: string;
  map: string;
  acceptNpc: string;
  turnInNpc: string;
  minLevel: number;
  rewards: WorldRewardItemVO[];
}

export interface WorldBountyVO {
  slot: number;
  code: string;
  name: string;
  desc: string;
  difficulty: string;
  map: string;
  monsterCode: string;
  state: WorldBountyState;
  progress: number;
  target: number;
  rewards: WorldRewardItemVO[];
}

export interface WorldStateVO {
  stage: 'VILLAGE' | 'CITY';
  playerLevel: number;
  villageDone: boolean;
  maps: WorldMapStateVO[];
  quests: WorldQuestVO[];
  bounties: WorldBountyVO[];
  bountyDate: string;
  /** 今日已开的野外宝箱码(docs/52 §3.1)。 */
  openedChests: string[];
  /** 迷雾 / 探索度(docs/53 §2.2):每张图一条。 */
  explore: WorldExploreVO[];
  /** 今日已采的采集点码(docs/54)。 */
  gatheredToday: string[];
}

/** 探索度:bits = 已点亮块(格号 = 行 × 8 + 列,行从地图顶边往下),mask = 可探索块,tier = 已发奖档位 0..4。 */
export interface WorldExploreVO {
  mapCode: WorldMapCode;
  bits: number;
  mask: number;
  percent: number;
  tier: number;
  /** 已发现兴趣点 key(POI:码 / CHEST:码 / BOSS:关卡码 / WAYPOINT,docs/54 §4)。 */
  found: string[];
  /** 本图全部兴趣点 key。 */
  items: string[];
}

export interface WorldActionResultVO {
  state: WorldStateVO;
  rewards: WorldRewardItemVO[];
  message: string;
}
