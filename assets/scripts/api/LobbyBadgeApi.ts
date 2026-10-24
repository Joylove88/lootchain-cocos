import { HttpClient } from '../net/HttpClient';
import { isRecord, readInteger } from './ApiValueGuards';

/** 大厅红点汇总(docs/45 §5):只标"现在点进去就能做的事"。 */
export interface LobbyBadges {
  quest: number;
  codex: number;
  gachaFree: boolean;
  gachaTicketTen: boolean;
  heroGrowable: boolean;
  growableHeroIds: number[];
  crystalUpgradable: boolean;
  dailyDungeonLeft: number;
  idleFull: boolean;
  mailUnread: number;
  /** 未穿戴的装备件数(首次获得装备的软引导用)。 */
  unwornEquip: number;
}

export class LobbyBadgeApi {
  constructor(private readonly http: HttpClient) {}

  badges(): Promise<LobbyBadges> {
    return this.http.get<unknown>('/api/player/lobby/badges').then(normalizeBadges);
  }
}

function normalizeBadges(data: unknown): LobbyBadges {
  if (!isRecord(data)) {
    throw new Error('大厅红点响应格式错误');
  }
  const ids = Array.isArray(data.growableHeroIds) ? data.growableHeroIds : [];
  return {
    quest: readInteger(data.quest, 0, 9999),
    codex: readInteger(data.codex, 0, 9999),
    gachaFree: data.gachaFree === true,
    gachaTicketTen: data.gachaTicketTen === true,
    heroGrowable: data.heroGrowable === true,
    growableHeroIds: ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0).slice(0, 8),
    crystalUpgradable: data.crystalUpgradable === true,
    dailyDungeonLeft: readInteger(data.dailyDungeonLeft, 0, 999),
    idleFull: data.idleFull === true,
    mailUnread: readInteger(data.mailUnread, 0, 9999),
    unwornEquip: readInteger(data.unwornEquip, 0, 9999),
  };
}
