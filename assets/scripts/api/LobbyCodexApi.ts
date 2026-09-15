import { HttpClient } from '../net/HttpClient';
import type {
  LobbyCodexClaimPayload,
  LobbyCodexClaimResultVO,
  LobbyCodexItemVO,
  LobbyCodexMilestoneVO,
  LobbyCodexSummaryVO,
} from '../types/LobbyCodexTypes';
import type { QuestRewardItemVO } from '../types/QuestTypes';
import { isRecord, readArray, readInteger, readNumber, readOptionalText, readText } from './ApiValueGuards';

const MAX_CODEX_COUNT = 96;
const MAX_MILESTONE_COUNT = 16;
const MAX_REWARD_COUNT = 8;
const MAX_TEXT_LENGTH = 96;
const MAX_RESOURCE_PATH_LENGTH = 192;
const HERO_ASSET_FALLBACKS: Record<string, { portraitAsset: string; spineAsset: string; cardBackgroundAsset?: string }> = {
  // 只读展示兜底：当前公司/家里本地服务未重启时，图鉴列表可能暂时不带资源字段。
  R_PATROL_01: { portraitAsset: 'act_1001', spineAsset: 'npc_1001', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1001' },
  R_ACOLY_02: { portraitAsset: 'act_1012', spineAsset: 'npc_1012', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1012' },
  R_SCOUT_03: { portraitAsset: 'act_1004', spineAsset: 'npc_1004', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1004' },
  R_CULT_05: { portraitAsset: 'act_1008', spineAsset: 'npc_1008', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1008' },
  R_RANGER_06: { portraitAsset: 'act_1016', spineAsset: 'npc_1016', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1016' },
  R_GUARD_07: { portraitAsset: 'act_1003', spineAsset: 'npc_1003', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1003' },
  SR_PRIEST_01: { portraitAsset: 'act_21006', spineAsset: 'npc_21006', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_21006' },
  SR_PALADIN_02: { portraitAsset: 'act_1002', spineAsset: 'npc_1002', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1002' },
  SR_WITCH_03: { portraitAsset: 'act_1028', spineAsset: 'npc_1028', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1028' },
  SR_BLADE_04: { portraitAsset: 'act_1038', spineAsset: 'npc_1038', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1038' },
  SR_SNIPER_05: { portraitAsset: 'act_1037', spineAsset: 'npc_1037', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1037' },
  SR_ABYSS_06: { portraitAsset: 'act_1036', spineAsset: 'npc_1036', cardBackgroundAsset: 'ui/hero-roster/card_background/npc_1036' },
  UR_EVELYN: { portraitAsset: 'Nuu', spineAsset: 'Nuu', cardBackgroundAsset: 'ui/hero-roster/card_background/Nuu_Illust' },
};

/** 大厅图鉴 API(2026-09-15 图鉴系统一期):汇总 + 激活奖励/里程碑领取;不调用英雄养成 Controller。 */
export class LobbyCodexApi {
  constructor(private readonly http: HttpClient) {}

  /** 兼容旧口:只读列表。 */
  lobbyCodex(): Promise<LobbyCodexItemVO[]> {
    return this.http.get<unknown>('/api/player/lobby/codex').then(validateLobbyCodex);
  }

  /** 卡墙 + 收录进度 + 里程碑,一次拉取。 */
  lobbyCodexSummary(): Promise<LobbyCodexSummaryVO> {
    return this.http.get<unknown>('/api/player/lobby/codex/summary').then(validateSummary);
  }

  /** 领取单个激活奖励/里程碑。 */
  claim(payload: LobbyCodexClaimPayload): Promise<LobbyCodexClaimResultVO> {
    const body = payload.type === 'HERO'
      ? { type: 'HERO', heroCode: payload.heroCode }
      : { type: 'MILESTONE', targetCount: payload.targetCount };
    return this.http.post<unknown>('/api/player/lobby/codex/claim', body).then(validateClaimResult);
  }

  /** 一键领取全部可领。 */
  claimAll(): Promise<LobbyCodexClaimResultVO> {
    return this.http.post<unknown>('/api/player/lobby/codex/claim-all').then(validateClaimResult);
  }
}

function validateLobbyCodex(data: unknown): LobbyCodexItemVO[] {
  if (!Array.isArray(data)) {
    throw new Error('大厅图鉴响应格式错误：data 不是数组');
  }
  if (data.length > MAX_CODEX_COUNT) {
    throw new Error('大厅图鉴响应格式错误：图鉴数量超过上限');
  }
  return data
    .map((item, index) => normalizeCodexItem(item, index))
    .filter((item): item is LobbyCodexItemVO => item !== null);
}

function validateSummary(data: unknown): LobbyCodexSummaryVO {
  if (!isRecord(data)) {
    throw new Error('图鉴汇总响应格式错误：data 不是对象');
  }
  const items = validateLobbyCodex(readArray(data, 'items', MAX_CODEX_COUNT));
  const milestones = readArray(data, 'milestones', MAX_MILESTONE_COUNT)
    .map((row, index) => normalizeMilestone(row, index))
    .filter((row): row is LobbyCodexMilestoneVO => row !== null)
    .sort((a, b) => a.targetCount - b.targetCount);
  return {
    total: readInteger(data.total, 0, 999),
    ownedCount: readInteger(data.ownedCount, 0, 999),
    claimableCount: readInteger(data.claimableCount, 0, 999),
    milestones,
    items,
  };
}

function validateClaimResult(data: unknown): LobbyCodexClaimResultVO {
  if (!isRecord(data)) {
    throw new Error('图鉴领取响应格式错误：data 不是对象');
  }
  return {
    rewardName: readText(data, 'rewardName', 128, '图鉴奖励'),
    rewards: normalizeRewards(data.rewards),
    claimedCount: readInteger(data.claimedCount, 0, 999),
    summary: validateSummary(data.summary),
  };
}

function normalizeMilestone(row: unknown, index: number): LobbyCodexMilestoneVO | null {
  if (!isRecord(row)) {
    throw new Error(`图鉴里程碑响应格式错误：第 ${index + 1} 项不是对象`);
  }
  const targetCount = readInteger(row.targetCount, 0, 999);
  if (targetCount <= 0) {
    return null;
  }
  return {
    rewardCode: readText(row, 'rewardCode', 64, `MILESTONE_${targetCount}`),
    targetCount,
    rewardName: readText(row, 'rewardName', MAX_TEXT_LENGTH, `收录 ${targetCount} 位英雄`),
    rewards: normalizeRewards(row.rewards),
    reached: row.reached === true,
    claimed: row.claimed === true,
    claimable: row.claimable === true,
  };
}

function normalizeRewards(value: unknown): QuestRewardItemVO[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rewards: QuestRewardItemVO[] = [];
  for (const raw of value.slice(0, MAX_REWARD_COUNT)) {
    if (!isRecord(raw)) {
      continue;
    }
    const code = readText(raw, 'code', 64, '');
    if (!code) {
      continue;
    }
    rewards.push({
      type: readText(raw, 'type', 32, 'ITEM'),
      code,
      name: readText(raw, 'name', MAX_TEXT_LENGTH, code),
      amount: readNumber(raw.amount, 0, 1_000_000_000),
    });
  }
  return rewards;
}

function normalizeCodexItem(item: unknown, index: number): LobbyCodexItemVO | null {
  if (!isRecord(item)) {
    throw new Error(`大厅图鉴响应格式错误：第 ${index + 1} 项不是对象`);
  }
  const heroCode = readText(item, 'heroCode', MAX_TEXT_LENGTH, `hero-${index + 1}`);
  const rarity = readText(item, 'rarity', 16, 'R');
  // 前端再做一层过滤，防止服务端配置漂移时把未开放稀有度带到大厅。
  if (rarity.toUpperCase() === 'EX' || heroCode.toUpperCase().startsWith('EX_')) {
    return null;
  }
  const fallbackAssets = resolveHeroAssetFallback(heroCode);
  const portraitAsset = readOptionalText(item, 'portraitAsset', 64) ?? fallbackAssets?.portraitAsset ?? null;
  const cardBackgroundAsset = readOptionalText(item, 'cardBackgroundAsset', MAX_RESOURCE_PATH_LENGTH) ?? fallbackAssets?.cardBackgroundAsset ?? null;
  const spineAsset = readOptionalText(item, 'spineAsset', 128) ?? deriveSpineAssetFromPortrait(portraitAsset) ?? fallbackAssets?.spineAsset ?? null;
  const spineUuid = readOptionalText(item, 'spineUuid', 64);
  const owned = item.owned === true;
  return {
    heroCode,
    heroName: readText(item, 'heroName', MAX_TEXT_LENGTH, '未命名英雄'),
    rarity,
    faction: readText(item, 'faction', 32, '未知阵营'),
    heroClass: readText(item, 'heroClass', 32, '未知职业'),
    roleDesc: readOptionalText(item, 'roleDesc', MAX_TEXT_LENGTH),
    portraitAsset,
    cardBackgroundAsset,
    spineAsset,
    spineUuid,
    owned,
    ownedCount: readInteger(item.ownedCount, 0, 999),
    activateRewards: normalizeRewards(item.activateRewards),
    rewardClaimable: owned && item.rewardClaimable === true,
    rewardClaimed: item.rewardClaimed === true,
  };
}

function deriveSpineAssetFromPortrait(portraitAsset: string | null): string | null {
  const normalized = (portraitAsset ?? '').replace(/\.(png|jpg|jpeg|webp)$/i, '').trim();
  if (!/^act_[A-Za-z0-9_-]+$/i.test(normalized)) {
    return null;
  }
  return normalized.replace(/^act/i, 'npc').slice(0, 128);
}

function resolveHeroAssetFallback(heroCode: string): { portraitAsset: string; spineAsset: string; cardBackgroundAsset?: string } | null {
  return HERO_ASSET_FALLBACKS[heroCode.trim().toUpperCase()] ?? null;
}
