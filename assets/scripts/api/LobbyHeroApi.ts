import { equippedHeroSkin } from '../scenes/lobby/HeroSkins';
import { HttpClient } from '../net/HttpClient';
import { parseBattleSkillConfig } from './BattleApi';
import type { LobbyHeroAffixVO, LobbyHeroFilterOptionsVO, LobbyHeroItemVO } from '../types/LobbyHeroTypes';
import { isRecord, readInteger, readOptionalStat, readOptionalText, readText, type UnknownRecord } from './ApiValueGuards';
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
  const items = data.map((item, index) => normalizeHeroItem(item, index));
  // 主角不进英雄列表(名册 / 编队 / 各战斗选人都看不到),单独记下给野外当队长(docs/60)
  lobbyProtagonistHero = items.find((item): item is LobbyHeroItemVO => item !== null && isHiddenProtagonistHero(item)) ?? null;
  return items
    .filter((item): item is LobbyHeroItemVO => item !== null && !isHiddenProtagonistHero(item))
    .sort((a, b) => b.power - a.power);
}

let lobbyProtagonistHero: LobbyHeroItemVO | null = null;
let protagonistRealmSkin = false;

/** 主角野外外观跟境界走(docs/60 P1b):true = 炼魂及以上,换炼魂装;境界读到后由 GameRoot 设置。返回是否有变化。 */
export function setProtagonistRealmSkin(lianhun: boolean): boolean {
  if (protagonistRealmSkin === lianhun) {
    return false;
  }
  protagonistRealmSkin = lianhun;
  return true;
}

/** 最近一次大厅英雄接口里的主角(user_hero source_type=PROTAGONIST);还没拉到 / 没建主角时为 null。 */
export function currentLobbyProtagonistHero(): LobbyHeroItemVO | null {
  return lobbyProtagonistHero;
}

/** 野外队伍上限(与后端 FieldStageRules.MAX_PARTY 一致)。 */
const FIELD_PARTY_MAX = 4;

/**
 * 野外队伍(docs/60,11-03 用户「接进野外当队长」):主角当队长(玩家操控)+ 编队里最多 3 名英雄跟随;
 * 没编队按战力取前几名;没有主角(旧数据)时退回原口径 4 名英雄。跑图渲染与登记遭遇共用,保证两边队伍一致(第一个 = 队长)。
 */
export function resolveFieldParty(heroes: readonly LobbyHeroItemVO[], formationHeroIds: readonly number[]): LobbyHeroItemVO[] {
  const base = lobbyProtagonistHero;
  // 境界外观(docs/60 P1b):炼魂起换 protag_m_lh / protag_f_lh(同一副骨骼换装)
  const lead = base && protagonistRealmSkin && base.spineAsset ? { ...base, spineAsset: `${base.spineAsset}_lh` } : base;
  const byId = new Map(heroes.map((hero) => [hero.id, hero]));
  let companions = formationHeroIds.map((id) => byId.get(id)).filter((hero): hero is LobbyHeroItemVO => !!hero && !hero.protagonist);
  if (companions.length === 0) {
    companions = heroes.filter((hero) => hero.id > 0 && !hero.protagonist).slice().sort((a, b) => b.power - a.power);
  }
  return lead ? [lead, ...companions.slice(0, FIELD_PARTY_MAX - 1)] : companions.slice(0, FIELD_PARTY_MAX);
}

/** 主角骨骼按性别(男 / 女两套,永夜龙骑底换皮,docs/60)。 */
function protagonistSpineAsset(heroCode: string): string | null {
  const code = heroCode.trim().toUpperCase();
  if (!code.startsWith('PROTAGONIST_')) {
    return null;
  }
  return code.indexOf('FEMALE') >= 0 ? 'protag_f' : 'protag_m';
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
  // 主角:骨骼固定用 spine/hero/protag_m|protag_f(服务端旧的立绘 / 骨骼字段是 5 月占位,不用)
  const protagonistAsset = protagonistSpineAsset(heroCode);
  const portraitAsset = protagonistAsset ?? readOptionalText(item, 'portraitAsset', 64) ?? fallbackAssets?.portraitAsset ?? null;
  const cardBackgroundAsset = readOptionalText(item, 'cardBackgroundAsset', MAX_RESOURCE_PATH_LENGTH) ?? fallbackAssets?.cardBackgroundAsset ?? null;
  const spineAsset = protagonistAsset ?? readOptionalText(item, 'spineAsset', 128) ?? deriveSpineAssetFromPortrait(portraitAsset) ?? fallbackAssets?.spineAsset ?? null;
  const spineUuid = protagonistAsset ? null : readOptionalText(item, 'spineUuid', 64) ?? fallbackAssets?.spineUuid ?? null;
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

/** 某英雄要整块下到本地的资源前缀(网页分层下载:召唤结果 / 名册展示前):骨骼、立绘骨骼、名册卡面。 */
export function heroPackPrefixes(heroCode: string | null | undefined): string[] {
  const fallback = heroCode ? resolveHeroAssetFallback(heroCode) : null;
  if (!fallback) {
    return [];
  }
  // 穿着的皮肤骨骼也要一起下(HeroSkins)
  const skin = equippedHeroSkin(heroCode);
  return [`spine/hero/${fallback.spineAsset}`, `spine/hero/${fallback.portraitAsset}`, fallback.cardBackgroundAsset, skin ? skin.spine.slice(0, skin.spine.lastIndexOf('/')) : null]
    .filter((path): path is string => !!path);
}

/** 英雄名册卡立绘路径(不带 /spriteFrame);守卫战统计 / 词条卡头像用它裁头部静态图(2026-10-11)。 */
export function resolveHeroCardArtPath(heroCode: string | null | undefined): string | null {
  const art = heroCode ? resolveHeroAssetFallback(heroCode)?.cardBackgroundAsset : undefined;
  return art ? art : null;
}

function resolveHeroClassFallback(heroCode: string): string | null {
  return HERO_CLASS_FALLBACKS[heroCode.trim().toUpperCase()] ?? null;
}
