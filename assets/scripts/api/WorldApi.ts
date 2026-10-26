import { HttpClient } from '../net/HttpClient';
import type { WorldActionResultVO, WorldBountyVO, WorldMapCode, WorldMapStateVO, WorldQuestVO, WorldRewardItemVO, WorldStateVO } from '../types/WorldTypes';
import { isRecord, readArray, readInteger, readText } from './ApiValueGuards';

const MAP_CODES: WorldMapCode[] = ['VILLAGE', 'WOODS', 'CITY', 'GRAY'];

/** 新手村 → 主城 → 野区(docs/50):世界状态 / 剧情任务 / 悬赏 / 传送阵;野外怪群开战结算复用 BattleApi(stageCode=FIELD_*)。 */
export class WorldApi {
  constructor(private readonly http: HttpClient) {}

  state(): Promise<WorldStateVO> {
    return this.http.get<unknown>('/api/player/world/state').then(validateState);
  }

  acceptQuest(questCode: string): Promise<WorldActionResultVO> {
    return this.http.post<unknown>('/api/player/world/quest/accept', { questCode }).then(validateAction);
  }

  reportQuest(questCode: string, kind: 'TALK' | 'REACH', target: string): Promise<WorldActionResultVO> {
    return this.http.post<unknown>('/api/player/world/quest/report', { questCode, kind, target }).then(validateAction);
  }

  claimQuest(questCode: string): Promise<WorldActionResultVO> {
    return this.http.post<unknown>('/api/player/world/quest/claim', { questCode }).then(validateAction);
  }

  activateWaypoint(mapCode: WorldMapCode): Promise<WorldActionResultVO> {
    return this.http.post<unknown>('/api/player/world/waypoint/activate', { mapCode }).then(validateAction);
  }

  acceptBounty(slot: number): Promise<WorldActionResultVO> {
    return this.http.post<unknown>('/api/player/world/bounty/accept', { slot }).then(validateAction);
  }

  claimBounty(slot: number): Promise<WorldActionResultVO> {
    return this.http.post<unknown>('/api/player/world/bounty/claim', { slot }).then(validateAction);
  }

  /** docs/50 §14 野外即时战斗:登记遭遇(阵容同开战)。 */
  engageField(stageCode: string, heroIds: number[], leaderHeroId: number | null): Promise<FieldEncounterVO> {
    return this.http.post<unknown>('/api/player/world/field/engage', { stageCode, heroIds, leaderHeroId, requestId: `field-${Date.now()}` }).then(validateEncounter);
  }

  clearField(encounterId: number): Promise<FieldClearVO> {
    return this.http.post<unknown>('/api/player/world/field/clear', { encounterId }).then((data) => {
      if (!isRecord(data)) {
        throw new Error('清怪结算响应格式错误');
      }
      return {
        rewards: readArray(data, 'rewards', 16).map(validateReward),
        capped: data.capped === true,
        message: readText(data, 'message', 80, ''),
        state: validateState(data.state),
      };
    });
  }
}

export interface FieldEncounterVO {
  encounterId: number;
  stageCode: string;
  raiderAttack: number;
  raiderHp: number;
  monsters: Array<{ monsterCode: string; monsterName: string; hp: number; hit: number; ranged: boolean }>;
}

export interface FieldClearVO {
  rewards: WorldRewardItemVO[];
  capped: boolean;
  message: string;
  state: WorldStateVO;
}

function validateEncounter(data: unknown): FieldEncounterVO {
  if (!isRecord(data)) {
    throw new Error('野外遭遇响应格式错误');
  }
  return {
    encounterId: readInteger(data.encounterId, 1, Number.MAX_SAFE_INTEGER),
    stageCode: readText(data, 'stageCode', 32, ''),
    raiderAttack: readInteger(data.raiderAttack, 1, Number.MAX_SAFE_INTEGER),
    raiderHp: readInteger(data.raiderHp, 1, Number.MAX_SAFE_INTEGER),
    monsters: readArray(data, 'monsters', 8).map((entry) => {
      const record = isRecord(entry) ? entry : {};
      return {
        monsterCode: readText(record, 'monsterCode', 32, ''),
        monsterName: readText(record, 'monsterName', 32, ''),
        hp: readInteger(record.hp, 1, Number.MAX_SAFE_INTEGER),
        hit: readInteger(record.hit, 1, Number.MAX_SAFE_INTEGER),
        ranged: record.ranged === true,
      };
    }),
  };
}

function validateReward(entry: unknown): WorldRewardItemVO {
  const record = isRecord(entry) ? entry : {};
  return {
    resourceType: readText(record, 'resourceType', 24, ''),
    resourceCode: readText(record, 'resourceCode', 48, ''),
    resourceName: readText(record, 'resourceName', 32, ''),
    amount: readInteger(record.amount, 0, Number.MAX_SAFE_INTEGER),
  };
}

function validateState(data: unknown): WorldStateVO {
  if (!isRecord(data)) {
    throw new Error('世界状态响应格式错误:data 不是对象');
  }
  const maps: WorldMapStateVO[] = readArray(data, 'maps', 16).map((entry) => {
    const record = isRecord(entry) ? entry : {};
    const code = readText(record, 'mapCode', 16, 'CITY') as WorldMapCode;
    return {
      mapCode: MAP_CODES.indexOf(code) >= 0 ? code : 'CITY',
      mapName: readText(record, 'mapName', 32, ''),
      minLevel: readInteger(record.minLevel, 1, 999),
      unlocked: record.unlocked === true,
      activated: record.activated === true,
      lockReason: readText(record, 'lockReason', 64, ''),
    };
  });
  const quests: WorldQuestVO[] = readArray(data, 'quests', 64).map((entry) => {
    const record = isRecord(entry) ? entry : {};
    return {
      code: readText(record, 'code', 16, ''),
      chapter: readText(record, 'chapter', 16, ''),
      seq: readInteger(record.seq, 0, 999),
      name: readText(record, 'name', 32, ''),
      desc: readText(record, 'desc', 120, ''),
      state: readText(record, 'state', 12, 'LOCKED') as WorldQuestVO['state'],
      progress: readInteger(record.progress, 0, 9999),
      target: readInteger(record.target, 1, 9999),
      objective: readText(record, 'objective', 12, ''),
      objectiveTarget: readText(record, 'objectiveTarget', 48, ''),
      map: readText(record, 'map', 16, ''),
      acceptNpc: readText(record, 'acceptNpc', 16, ''),
      turnInNpc: readText(record, 'turnInNpc', 16, ''),
      minLevel: readInteger(record.minLevel, 1, 999),
      rewards: readArray(record, 'rewards', 8).map(validateReward),
    };
  });
  const bounties: WorldBountyVO[] = readArray(data, 'bounties', 8).map((entry) => {
    const record = isRecord(entry) ? entry : {};
    return {
      slot: readInteger(record.slot, 0, 9),
      code: readText(record, 'code', 32, ''),
      name: readText(record, 'name', 32, ''),
      desc: readText(record, 'desc', 64, ''),
      difficulty: readText(record, 'difficulty', 4, '易'),
      map: readText(record, 'map', 16, ''),
      monsterCode: readText(record, 'monsterCode', 32, ''),
      state: readText(record, 'state', 12, 'OPEN') as WorldBountyVO['state'],
      progress: readInteger(record.progress, 0, 9999),
      target: readInteger(record.target, 1, 9999),
      rewards: readArray(record, 'rewards', 8).map(validateReward),
    };
  });
  return {
    stage: readText(data, 'stage', 12, 'CITY') === 'VILLAGE' ? 'VILLAGE' : 'CITY',
    playerLevel: readInteger(data.playerLevel, 1, 999),
    villageDone: data.villageDone === true,
    maps,
    quests,
    bounties,
    bountyDate: readText(data, 'bountyDate', 16, ''),
  };
}

function validateAction(data: unknown): WorldActionResultVO {
  if (!isRecord(data)) {
    throw new Error('世界操作响应格式错误:data 不是对象');
  }
  return {
    state: validateState(data.state),
    rewards: readArray(data, 'rewards', 16).map(validateReward),
    message: readText(data, 'message', 80, ''),
  };
}
