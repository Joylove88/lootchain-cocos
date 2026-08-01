import { HttpClient } from '../net/HttpClient';
import { parseBattleSkillConfig } from './BattleApi';
import type { LobbyHeroAffixVO, LobbyHeroFilterOptionsVO, LobbyHeroItemVO } from '../types/LobbyHeroTypes';

type UnknownRecord = Record<string, unknown>;
interface HeroAssetFallback {
  portraitAsset: string;
  spineAsset: string;
  cardBackgroundAsset?: string;
  spineUuid?: string;
}

const MAX_HERO_COUNT = 80;
const MAX_TEXT_LENGTH = 96;
const MAX_RESOURCE_PATH_LENGTH = 192;
const HERO_ASSET_FALLBACKS: Record<string, HeroAssetFallback> = {
  // 只读展示兜底：当前公司/家里本地服务未重启时，英雄列表可能暂时不带资源字段。
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
  UR_ARTHAS: { portraitAsset: 'IshmaelA', spineAsset: 'IshmaelA', cardBackgroundAsset: 'ui/hero-roster/card_background/IshmaelA_Illust', spineUuid: '3e12af42-2d0f-4cb0-bb36-fd12425a0407' },
  UR_ATLAS: { portraitAsset: 'Lucrecia', spineAsset: 'Lucrecia', cardBackgroundAsset: 'ui/hero-roster/card_background/Lucrecia_Illust', spineUuid: '3af1df8e-5c10-4a4f-a8f7-2b49f5924988' },
  UR_AURELIA: { portraitAsset: 'Belladonna', spineAsset: 'Belladonna', cardBackgroundAsset: 'ui/hero-roster/card_background/Belladonna_Illust', spineUuid: '0b593cca-d1f8-4495-b6bf-2ed043f2d765' },
  UR_NYX: { portraitAsset: 'Sphinx', spineAsset: 'Sphinx', cardBackgroundAsset: 'ui/hero-roster/card_background/Sphinx_Illust', spineUuid: 'a25ac6d0-765c-4ac9-bc9a-3945d8ad6c79' },
  UR_SERAPHINA: { portraitAsset: 'LucienA', spineAsset: 'LucienA', cardBackgroundAsset: 'ui/hero-roster/card_background/LucienA_Illust', spineUuid: '5c80ea13-54f2-42b2-9fd3-8757a2dde3da' },
  SSR_KANE: { portraitAsset: 'Ishmael', spineAsset: 'Ishmael', cardBackgroundAsset: 'ui/hero-roster/card_background/Ishmael_center', spineUuid: 'a4f0537a-ff0e-4ab6-8be3-c19073c8c475' },
  SSR_LIVIA: { portraitAsset: 'Carmilla', spineAsset: 'Carmilla', cardBackgroundAsset: 'ui/hero-roster/card_background/Carmilla_center', spineUuid: '2b7cc014-e9c5-47b4-8f45-73dbaa62f268' },
  SSR_MICHAEL: { portraitAsset: 'HeylelS01', spineAsset: 'HeylelS01', cardBackgroundAsset: 'ui/hero-roster/card_background/HeylelS01_Illust', spineUuid: '81714937-7711-4e79-899d-f816a406f7ac' },
  SSR_RON: { portraitAsset: 'Eulenspigel', spineAsset: 'Eulenspigel', cardBackgroundAsset: 'ui/hero-roster/card_background/Eulenspigel_Illust', spineUuid: 'e99b6a83-6849-4175-be1f-55bc1a3a4e29' },
  UR_EVELYN: { portraitAsset: 'Nuu', spineAsset: 'Nuu', cardBackgroundAsset: 'ui/hero-roster/card_background/Nuu_Illust' },
};
const HERO_CLASS_FALLBACKS: Record<string, string> = {
  PROTAGONIST_MALE_ATTACK: '战士',
  PROTAGONIST_FEMALE_ATTACK: '战士',
  R_PATROL_01: '战士',
  R_ACOLY_02: '辅助',
  R_SCOUT_03: '刺客',
  R_MILITIA_04: '战士',
  R_CULT_05: '法师',
  R_RANGER_06: '射手',
  R_GUARD_07: '坦克',
  R_HERB_08: '辅助',
  R_THUG_09: '战士',
  R_WOLF_10: '刺客',
  SR_PRIEST_01: '辅助',
  SR_PALADIN_02: '坦克',
  SR_WITCH_03: '法师',
  SR_BLADE_04: '战士',
  SR_SNIPER_05: '射手',
  SR_ABYSS_06: '刺客',
  SR_TEMPLAR_07: '战士',
  SR_CHAIN_08: '坦克',
  SSR_LIVIA: '法师',
  SSR_KANE: '坦克',
  SSR_MICHAEL: '战士',
  SSR_DRACULA: '战士',
  SSR_RON: '刺客',
  UR_ARTHAS: '战士',
  UR_EVELYN: '法师',
  UR_SERAPHINA: '辅助',
  UR_NYX: '刺客',
  UR_AURELIA: '射手',
  UR_ATLAS: '坦克',
};

/** 大厅英雄只读 API；只读取大厅门面，不调用带养成写入口的英雄 Controller。 */
export class LobbyHeroApi {
  constructor(private readonly http: HttpClient) {}

  lobbyHeroes(): Promise<LobbyHeroItemVO[]> {
    // 英雄队列接口仍只读；成长写入只允许通过 HeroApi.levelUp，不提供升星、觉醒或洗练动作。
    return this.http.get<unknown>('/api/player/lobby/heroes').then(validateLobbyHeroes);
  }

  lobbyHeroFilterOptions(): Promise<LobbyHeroFilterOptionsVO> {
    return this.http.get<unknown>('/api/player/lobby/heroes/filter-options').then(validateHeroFilterOptions);
  }
}

function validateLobbyHeroes(data: unknown): LobbyHeroItemVO[] {
  if (!Array.isArray(data)) {
    throw new Error('大厅英雄响应格式错误：data 不是数组');
  }
  if (data.length > MAX_HERO_COUNT) {
    throw new Error('大厅英雄响应格式错误：英雄数量超过上限');
  }
  return data
    .map((item, index) => normalizeHeroItem(item, index))
    .filter((item): item is LobbyHeroItemVO => item !== null && !isHiddenProtagonistHero(item))
    .sort((a, b) => b.power - a.power);
}

function isHiddenProtagonistHero(item: LobbyHeroItemVO): boolean {
  return item.protagonist === true;
}

function normalizeHeroItem(item: unknown, index: number): LobbyHeroItemVO | null {
  if (!isRecord(item)) {
    throw new Error(`大厅英雄响应格式错误：第 ${index + 1} 项不是对象`);
  }
  const heroCode = readText(item, 'heroCode', MAX_TEXT_LENGTH, `hero-${index + 1}`);
  const rarity = readText(item, 'rarity', 16, 'R');
  // 未开放稀有度前端再做一层过滤，避免服务端配置漂移导致大厅露出。
  if (rarity.toUpperCase() === 'EX' || heroCode.toUpperCase().startsWith('EX_')) {
    return null;
  }
  const id = readInteger(item.id, 0, Number.MAX_SAFE_INTEGER);
  if (id <= 0) {
    // 英雄队列只展示可用于编队/战斗的已拥有英雄，避免 UI 显示 id=0 但开战时被过滤。
    return null;
  }
  const fallbackAssets = resolveHeroAssetFallback(heroCode);
  const fallbackHeroClass = resolveHeroClassFallback(heroCode);
  const portraitAsset = readOptionalText(item, 'portraitAsset', 64) ?? fallbackAssets?.portraitAsset ?? null;
  const cardBackgroundAsset = readOptionalText(item, 'cardBackgroundAsset', MAX_RESOURCE_PATH_LENGTH) ?? fallbackAssets?.cardBackgroundAsset ?? null;
  const spineAsset = readOptionalText(item, 'spineAsset', 128) ?? deriveSpineAssetFromPortrait(portraitAsset) ?? fallbackAssets?.spineAsset ?? null;
  const spineUuid = readOptionalText(item, 'spineUuid', 64) ?? fallbackAssets?.spineUuid ?? null;
  return {
    id,
    heroCode,
    heroName: readText(item, 'heroName', MAX_TEXT_LENGTH, '未命名英雄'),
    rarity,
    faction: readOptionalText(item, 'faction', 64),
    heroClass: readOptionalText(item, 'heroClass', 32) ?? fallbackHeroClass,
    level: readInteger(item.level, 1, 999),
    star: readInteger(item.star, 0, 99),
    power: readInteger(item.power, 0, Number.MAX_SAFE_INTEGER),
    protagonist: item.protagonist === true,
    sourceType: readText(item, 'sourceType', 32, ''),
    portraitAsset,
    cardBackgroundAsset,
    spineAsset,
    spineUuid,
    currentForm: readOptionalText(item, 'currentForm', 32),
    formLabel: readOptionalText(item, 'formLabel', 32),
    attrHp: readOptionalStat(item.attrHp),
    attrAttack: readOptionalStat(item.attrAttack),
    attrDefense: readOptionalStat(item.attrDefense),
    attrSpeed: readOptionalStat(item.attrSpeed),
    attrCrit: readOptionalStat(item.attrCrit),
    skillConfig: parseBattleSkillConfig(item),
    affixes: parseHeroAffixes(item.affixes),
    luckValue: readOptionalStat(item.luckValue),
    awakenStatus: readOptionalStat(item.awakenStatus),
    ultimateSkillLevel: readOptionalStat(item.ultimateSkillLevel),
  };
}

// 词条数组解析(后端 user_hero_attr 下发,可空);非法项跳过,最多取 12 条防御异常数据。
function parseHeroAffixes(raw: unknown): LobbyHeroAffixVO[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const affixes: LobbyHeroAffixVO[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as UnknownRecord;
    const code = readOptionalText(record, 'code', 32);
    const name = readOptionalText(record, 'name', 32);
    if (!code && !name) {
      continue;
    }
    const value = typeof record.value === 'number' ? record.value : Number(record.value);
    const affixId = typeof record.id === 'number' ? record.id : Number(record.id);
    affixes.push({
      id: Number.isFinite(affixId) && affixId > 0 ? Math.trunc(affixId) : 0,
      code: code ?? '',
      name: name ?? (code ?? ''),
      value: Number.isFinite(value) ? value : 0,
      quality: (readOptionalText(record, 'quality', 8) ?? '').toUpperCase(),
      type: readOptionalText(record, 'type', 16),
    });
    if (affixes.length >= 12) {
      break;
    }
  }
  return affixes;
}

// 有效属性字段(后端下发,可空);非数字返回 null,面板据此回退旧估算。
function readOptionalStat(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.round(numeric));
}

function validateHeroFilterOptions(data: unknown): LobbyHeroFilterOptionsVO {
  if (!isRecord(data)) {
    throw new Error('invalid lobby hero filter options response');
  }
  const rawClasses = Array.isArray(data.heroClasses) ? data.heroClasses : [];
  const heroClasses = rawClasses
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item, index, list) => item.length > 0 && item.length <= 32 && list.indexOf(item) === index)
    .slice(0, 16);
  return { heroClasses };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(record: UnknownRecord, key: string, maxLength: number, fallback: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function readOptionalText(record: UnknownRecord, key: string, maxLength: number): string | null {
  const value = record[key];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function deriveSpineAssetFromPortrait(portraitAsset: string | null): string | null {
  const normalized = (portraitAsset ?? '').replace(/\.(png|jpg|jpeg|webp)$/i, '').trim();
  if (!/^act_[A-Za-z0-9_-]+$/i.test(normalized)) {
    return null;
  }
  return normalized.replace(/^act/i, 'npc').slice(0, 128);
}

function resolveHeroAssetFallback(heroCode: string): HeroAssetFallback | null {
  return HERO_ASSET_FALLBACKS[heroCode.trim().toUpperCase()] ?? null;
}

function resolveHeroClassFallback(heroCode: string): string | null {
  return HERO_CLASS_FALLBACKS[heroCode.trim().toUpperCase()] ?? null;
}

function readInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}
