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
}

export interface WorldActionResultVO {
  state: WorldStateVO;
  rewards: WorldRewardItemVO[];
  message: string;
}
