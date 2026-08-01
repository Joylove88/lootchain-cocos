import { HttpClient } from '../net/HttpClient';

type UnknownRecord = Record<string, unknown>;

const MAX_LINEUP = 5;
const MAX_HERO_ID = Number.MAX_SAFE_INTEGER;

export interface LobbyTeamFormationVO {
  heroIds: number[];
  leaderHeroId: number | null;
}

/**
 * 玩家队伍阵容持久化 API。
 * 大厅编队后 save 把上阵英雄写入服务端，登录时 get 读取还原，替代旧的"仅本地保存、下次登录回落默认"。
 * 归属/可用性校验在服务端（与战斗 start 同口径）；此处仅做基础形状与数量约束。
 */
export class LobbyTeamApi {
  constructor(private readonly http: HttpClient) {}

  getTeam(): Promise<LobbyTeamFormationVO> {
    return this.http.get<unknown>('/api/player/lobby/team').then(validateTeam);
  }

  saveTeam(heroIds: number[], leaderHeroId?: number | null): Promise<LobbyTeamFormationVO> {
    const payloadHeroIds = normalizeHeroIds(heroIds);
    const payloadLeader = normalizeLeader(leaderHeroId ?? null, payloadHeroIds);
    return this.http
      .post<unknown>('/api/player/lobby/team/save', { heroIds: payloadHeroIds, leaderHeroId: payloadLeader })
      .then(validateTeam);
  }
}

function validateTeam(data: unknown): LobbyTeamFormationVO {
  if (!isRecord(data)) {
    throw new Error('队伍阵容响应格式错误：data 不是对象');
  }
  const heroIds = normalizeHeroIds(Array.isArray(data.heroIds) ? data.heroIds : []);
  const leaderHeroId = normalizeLeader(readOptionalInteger(data.leaderHeroId), heroIds);
  return { heroIds, leaderHeroId };
}

function normalizeHeroIds(raw: unknown[]): number[] {
  const out: number[] = [];
  for (const value of raw) {
    const id = readOptionalInteger(value);
    if (id !== null && id > 0 && !out.includes(id)) {
      out.push(id);
    }
    if (out.length >= MAX_LINEUP) {
      break;
    }
  }
  return out;
}

function normalizeLeader(leaderHeroId: number | null, heroIds: number[]): number | null {
  if (leaderHeroId !== null && heroIds.includes(leaderHeroId)) {
    return leaderHeroId;
  }
  return heroIds.length > 0 ? heroIds[0] : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalInteger(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const truncated = Math.trunc(numeric);
  if (truncated <= 0 || truncated > MAX_HERO_ID) {
    return null;
  }
  return truncated;
}
