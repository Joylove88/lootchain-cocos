import { HttpClient } from '../net/HttpClient';
import type { LobbyCodexItemVO } from '../types/LobbyCodexTypes';
import { isRecord, readInteger, readOptionalText, readText } from './ApiValueGuards';

const MAX_CODEX_COUNT = 96;
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

/** 大厅图鉴只读 API；只允许读取窄口径大厅门面，不能调用英雄养成 Controller。 */
export class LobbyCodexApi {
  constructor(private readonly http: HttpClient) {}

  lobbyCodex(): Promise<LobbyCodexItemVO[]> {
    // 大厅只读图鉴使用独立门面，避免前端直接依赖带养成写入口的英雄模块 Controller。
    return this.http.get<unknown>('/api/player/lobby/codex').then(validateLobbyCodex);
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
    owned: item.owned === true,
    ownedCount: readInteger(item.ownedCount, 0, 999),
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

