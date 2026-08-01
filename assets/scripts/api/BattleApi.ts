import { HttpClient } from '../net/HttpClient';
import type {
  PlayerBattleCurrencyChangeVO,
  PlayerBattleEnemyVO,
  PlayerBattleLineupHeroVO,
  PlayerBattleMainlineProgressVO,
  PlayerBattleRecentVO,
  PlayerBattleRewardItemVO,
  PlayerBattleSettleDTO,
  PlayerBattleSettlementVO,
  PlayerBattleEquipEffectVO,
  PlayerBattleSkillConfigVO,
  PlayerBattleSkillEffectVO,
  PlayerBattleStartDTO,
  PlayerBattleStartVO,
} from '../types/BattleTypes';
import type { DailyDungeonRewardVO, DailyDungeonSummaryVO, DailyDungeonThemeVO, DailyDungeonTierVO } from '../types/DailyDungeonTypes';

type UnknownRecord = Record<string, unknown>;

const MAX_LINEUP = 5;
const MAX_ENEMIES = 8;
const MAX_TEXT = 128;
const ANNUAL_MAINLINE_TOTAL_STAGES = 393;
const FIRST_CHAPTER_STAGE_COUNT = 9;
const STAGES_PER_CHAPTER_AFTER_FIRST = 16;
const REAL_MAINLINE_MODE_PREFIX = 'REAL_MAINLINE_R';

/** 玩家战斗 API：只允许后端权威的 NO_REWARD 或 MAIN_1_1 至 MAIN_25_16 首通结算响应。 */
export class BattleApi {
  constructor(private readonly http: HttpClient) {}

  startBattle(dto: PlayerBattleStartDTO): Promise<PlayerBattleStartVO> {
    const request = normalizeStartDTO(dto);
    return this.http.post<unknown>('/api/player/battles/start', request).then((data) => validateBattleStart(data, request.stageCode));
  }

  settleBattle(battleNo: string, dto: PlayerBattleSettleDTO): Promise<PlayerBattleSettlementVO> {
    const safeBattleNo = battleNo.trim();
    if (!safeBattleNo) {
      throw new Error('战斗结算请求缺少 battleNo');
    }
    return this.http.post<unknown>(`/api/player/battles/${encodeURIComponent(safeBattleNo)}/settle`, dto).then(validateBattleSettlement);
  }

  recentBattles(): Promise<PlayerBattleRecentVO[]> {
    return this.http.get<unknown>('/api/player/battles/recent').then(validateRecentBattles);
  }

  dailyDungeonSummary(): Promise<DailyDungeonSummaryVO> {
    return this.http.get<unknown>('/api/player/daily-dungeon/summary').then(validateDailyDungeonSummary);
  }
}

// 每日材料副本(P7b):关卡码 DAILY_{THEME}_{TIER};结算模式 DAILY_DUNGEON,奖励限材料白名单。
const DAILY_STAGE_PATTERN = /^DAILY_(AWAKEN|FORGE|ARCANE|ABYSS)_[1-3]$/;
const DAILY_SETTLEMENT_MODE = 'DAILY_DUNGEON';
const DAILY_SAFE_ITEM_CODES = new Set([
  'ENHANCE_STONE',
  'ENHANCE_STONE_HIGH',
  'DEEP_REFORGE_STONE',
  'FUSION_LUCK_STONE',
  'EQUIP_REROLL_STONE',
  'ULT_SCROLL',
  'ABYSS_CRYSTAL',
  'BOSS_MARK',
  'GEM_HP_1',
  'GEM_ATK_1',
  'GEM_DEF_1',
]);

export function isDailyDungeonStageCode(stageCode: string): boolean {
  return DAILY_STAGE_PATTERN.test((stageCode || '').trim().toUpperCase());
}

function assertSafeDailyRewards(rewardItems: PlayerBattleRewardItemVO[]): void {
  for (const item of rewardItems) {
    const type = item.resourceType.toUpperCase();
    const code = item.resourceCode.toUpperCase();
    const safe = (type === 'CURRENCY' && code === 'GOLD') || (type === 'ITEM' && DAILY_SAFE_ITEM_CODES.has(code));
    if (!safe || item.amount <= 0) {
      throw new Error('每日副本结算响应奖励不在材料白名单内');
    }
  }
}

function validateDailyDungeonSummary(data: unknown): DailyDungeonSummaryVO {
  if (!isRecord(data)) {
    throw new Error('每日副本摘要响应格式错误：data 不是对象');
  }
  const themes = readArray(data, 'themes', 4).map(validateDailyTheme);
  return {
    todayDayOfWeek: readInteger(data.todayDayOfWeek, 0, 7),
    staminaCost: readInteger(data.staminaCost, 0, 999),
    themes,
  };
}

function validateDailyTheme(item: unknown): DailyDungeonThemeVO {
  if (!isRecord(item)) {
    throw new Error('每日副本摘要响应格式错误：主题不是对象');
  }
  const code = readText(item, 'code', 16, '');
  if (!/^(AWAKEN|FORGE|ARCANE|ABYSS)$/.test(code)) {
    throw new Error('每日副本摘要响应包含未知主题');
  }
  const openDays = readArray(item, 'openDays', 7)
    .map((day) => readInteger(day, 0, 7))
    .filter((day) => day >= 1 && day <= 7);
  return {
    code,
    name: readText(item, 'name', 32, code),
    openDays,
    openToday: item.openToday === true,
    usedToday: readInteger(item.usedToday, 0, 99),
    timesPerDay: readInteger(item.timesPerDay, 0, 99),
    tiers: readArray(item, 'tiers', 3).map(validateDailyTier),
  };
}

function validateDailyTier(item: unknown): DailyDungeonTierVO {
  if (!isRecord(item)) {
    throw new Error('每日副本摘要响应格式错误：难度档不是对象');
  }
  const stageCode = readText(item, 'stageCode', 32, '');
  if (!isDailyDungeonStageCode(stageCode)) {
    throw new Error('每日副本摘要响应包含非法关卡码');
  }
  return {
    tier: readInteger(item.tier, 1, 3),
    stageCode,
    unlocked: item.unlocked === true,
    unlockStageCode: readText(item, 'unlockStageCode', 32, ''),
    rewards: readArray(item, 'rewards', 8).map(validateDailyReward),
  };
}

function validateDailyReward(item: unknown): DailyDungeonRewardVO {
  if (!isRecord(item)) {
    throw new Error('每日副本摘要响应格式错误：产出项不是对象');
  }
  return {
    resourceType: readText(item, 'resourceType', 32, ''),
    resourceCode: readText(item, 'resourceCode', MAX_TEXT, ''),
    resourceName: readText(item, 'resourceName', MAX_TEXT, '奖励'),
    amount: readNumber(item.amount, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeStartDTO(dto: PlayerBattleStartDTO): PlayerBattleStartDTO {
  const stageCode = normalizeMainStageCode(dto.stageCode);
  if (!Array.isArray(dto.heroIds) || dto.heroIds.length === 0 || dto.heroIds.length > MAX_LINEUP) {
    throw new Error('战斗启动请求阵容数量异常');
  }
  const heroIds = dto.heroIds.map((heroId) => readInteger(heroId, 0, Number.MAX_SAFE_INTEGER)).filter((heroId) => heroId > 0);
  if (heroIds.length !== dto.heroIds.length) {
    throw new Error('战斗启动请求包含非法英雄 ID');
  }
  const leaderHeroId = readInteger(dto.leaderHeroId, 0, Number.MAX_SAFE_INTEGER);
  if (leaderHeroId <= 0 || !heroIds.includes(leaderHeroId)) {
    throw new Error('战斗启动请求队长不在阵容中');
  }
  return {
    ...dto,
    stageCode,
    heroIds,
    leaderHeroId,
    requestId: String(dto.requestId || '').trim(),
    clientVersion: String(dto.clientVersion || '').trim(),
  };
}

function validateBattleStart(data: unknown, expectedStageCode: string): PlayerBattleStartVO {
  if (!isRecord(data)) {
    throw new Error('战斗会话响应格式错误：data 不是对象');
  }
  const stageCode = readStageCode(data, 'stageCode');
  const readonlyEconomy = data.readonlyEconomy === true;
  if (!readonlyEconomy && !isRealMainlineStage(stageCode) && !isDailyDungeonStageCode(stageCode)) {
    throw new Error('战斗会话响应格式错误：只有年度主线 MAIN_1_1 至 MAIN_25_16 可进入真实首通结算');
  }
  if (stageCode !== expectedStageCode) {
    throw new Error(`战斗会话关卡不一致：请求 ${expectedStageCode}，返回 ${stageCode}`);
  }
  return {
    battleNo: readRequiredText(data, 'battleNo', MAX_TEXT, '战斗会话响应缺少 battleNo'),
    stageCode,
    status: readText(data, 'status', 32, 'STARTED'),
    serverSeed: readRequiredText(data, 'serverSeed', MAX_TEXT, '战斗会话响应缺少 serverSeed'),
    lineup: readArray(data, 'lineup', MAX_LINEUP).map(normalizeLineupHero),
    enemyPreview: readArray(data, 'enemyPreview', MAX_ENEMIES).map(normalizeEnemy),
    expireTime: readText(data, 'expireTime', MAX_TEXT, ''),
    readonlyEconomy,
    guardrails: sanitizeTextArray(readArray(data, 'guardrails', 10), MAX_TEXT),
  };
}

function validateBattleSettlement(data: unknown): PlayerBattleSettlementVO {
  if (!isRecord(data)) {
    throw new Error('战斗结算响应格式错误：data 不是对象');
  }
  const settlementMode = readSettlementMode(data);
  const rewardGranted = data.rewardGranted === true;
  const readonlyEconomy = data.readonlyEconomy === true;
  const economyApplied = data.economyApplied === true;
  const progressApplied = data.progressApplied === true;
  const stageCode = readStageCode(data, 'stageCode');
  const rewardItems = readArray(data, 'rewardItems', 8).map(normalizeRewardItem);
  const currencyChanges = readArray(data, 'currencyChanges', 4).map(normalizeCurrencyChange);
  const mainlineProgress = normalizeMainlineProgress(data.mainlineProgress);
  if (settlementMode === 'NO_REWARD') {
    if (rewardGranted || !readonlyEconomy || economyApplied || progressApplied) {
      throw new Error('战斗结算响应格式错误：NO_REWARD 必须保持无经济变更');
    }
  } else if (settlementMode === DAILY_SETTLEMENT_MODE) {
    // 每日副本:每次胜利发放材料,不推进主线进度。
    if (!isDailyDungeonStageCode(stageCode) || !rewardGranted || readonlyEconomy || !economyApplied || progressApplied) {
      throw new Error('战斗结算响应格式错误：每日副本结算字段不完整');
    }
    assertSafeDailyRewards(rewardItems);
  } else {
    const config = realMainlineSettlementForStage(stageCode);
    if (!config || settlementMode !== config.settlementMode || !rewardGranted || readonlyEconomy || !economyApplied || !progressApplied) {
      throw new Error('战斗结算响应格式错误：真实首通结算字段不完整');
    }
    assertSafeMainlineRewards(stageCode, rewardItems);
  }
  return {
    battleNo: readRequiredText(data, 'battleNo', MAX_TEXT, '战斗结算响应缺少 battleNo'),
    settlementNo: readRequiredText(data, 'settlementNo', MAX_TEXT, '战斗结算响应缺少 settlementNo'),
    stageCode,
    result: readText(data, 'result', 16, 'WIN'),
    status: readText(data, 'status', 32, 'RECORDED'),
    settlementMode,
    rewardGranted,
    economyApplied,
    progressApplied,
    firstClear: data.firstClear === true,
    staminaCost: readInteger(data.staminaCost, 0, 999),
    staminaBefore: readNullableInteger(data.staminaBefore, 0, 99999),
    staminaAfter: readNullableInteger(data.staminaAfter, 0, 99999),
    message: readText(data, 'message', 180, isRealSettlementMode(settlementMode) ? '主线首通结算完成' : '战斗记录完成，奖励未开放'),
    rewardPreview: sanitizeTextArray(readArray(data, 'rewardPreview', 6), 80),
    rewardItems,
    currencyChanges,
    mainlineProgress,
    readonlyEconomy,
  };
}

function validateRecentBattles(data: unknown): PlayerBattleRecentVO[] {
  if (!Array.isArray(data)) {
    throw new Error('最近战斗记录响应格式错误：data 不是数组');
  }
  return data.slice(0, 20).map(validateRecentBattle);
}

function validateRecentBattle(item: unknown): PlayerBattleRecentVO {
  if (!isRecord(item)) {
    throw new Error('最近战斗记录响应格式错误：记录不是对象');
  }
  const settlementMode = readText(item, 'settlementMode', 32, '');
  const realMainline = isRealSettlementMode(settlementMode);
  const noReward = settlementMode === 'NO_REWARD';
  const daily = settlementMode === DAILY_SETTLEMENT_MODE;
  if (!realMainline && !noReward && !daily) {
    throw new Error('最近战斗记录响应包含未开放结算模式');
  }
  if (daily && (item.rewardGranted !== true || item.readonlyEconomy === true || item.economyApplied !== true)) {
    throw new Error('最近战斗记录响应越过每日副本结算约束');
  }
  if (noReward && (item.rewardGranted === true || item.readonlyEconomy !== true || item.economyApplied === true)) {
    throw new Error('最近战斗记录响应越过 NO_REWARD 红线');
  }
  const stageCode = readStageCode(item, 'stageCode');
  const config = realMainline ? realMainlineSettlementForStage(stageCode) : null;
  if (realMainline && (!config || settlementMode !== config.settlementMode || item.rewardGranted !== true || item.readonlyEconomy === true || item.economyApplied !== true)) {
    throw new Error('最近战斗记录响应越过真实首通白名单');
  }
  return {
    battleNo: readRequiredText(item, 'battleNo', MAX_TEXT, '最近战斗记录缺少 battleNo'),
    settlementNo: readRequiredText(item, 'settlementNo', MAX_TEXT, '最近战斗记录缺少 settlementNo'),
    stageCode,
    result: readText(item, 'result', 16, 'WIN'),
    settlementMode: realMainline && config ? config.settlementMode : daily ? DAILY_SETTLEMENT_MODE : 'NO_REWARD',
    rewardGranted: item.rewardGranted === true,
    readonlyEconomy: item.readonlyEconomy === true,
    economyApplied: item.economyApplied === true,
    recordedTime: readRequiredText(item, 'recordedTime', MAX_TEXT, '最近战斗记录缺少 recordedTime'),
    message: readText(item, 'message', 180, '最近挑战记录只读展示'),
    guardrails: sanitizeTextArray(readArray(item, 'guardrails', 10), MAX_TEXT),
  };
}

function readSettlementMode(record: UnknownRecord): string {
  const mode = readText(record, 'settlementMode', 32, 'NO_REWARD');
  if (mode === 'NO_REWARD' || mode === DAILY_SETTLEMENT_MODE || isRealSettlementMode(mode)) {
    return mode;
  }
  throw new Error(`战斗结算响应包含未开放模式：${mode}`);
}

function normalizeRewardItem(item: unknown): PlayerBattleRewardItemVO {
  if (!isRecord(item)) {
    throw new Error('战斗奖励响应格式错误：奖励项不是对象');
  }
  return {
    resourceType: readText(item, 'resourceType', 32, ''),
    resourceCode: readText(item, 'resourceCode', MAX_TEXT, ''),
    resourceName: readText(item, 'resourceName', MAX_TEXT, '奖励'),
    amount: readNumber(item.amount, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeCurrencyChange(item: unknown): PlayerBattleCurrencyChangeVO {
  if (!isRecord(item)) {
    throw new Error('战斗货币变更响应格式错误：变更项不是对象');
  }
  return {
    currencyCode: readText(item, 'currencyCode', 32, ''),
    beforeAmount: readNullableNumber(item.beforeAmount, 0, Number.MAX_SAFE_INTEGER),
    changeAmount: readNumber(item.changeAmount, 0, Number.MAX_SAFE_INTEGER),
    afterAmount: readNullableNumber(item.afterAmount, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeMainlineProgress(value: unknown): PlayerBattleMainlineProgressVO | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error('战斗主线进度响应格式错误：进度不是对象');
  }
  return {
    beforeStageCode: readText(value, 'beforeStageCode', MAX_TEXT, ''),
    afterStageCode: readText(value, 'afterStageCode', MAX_TEXT, ''),
    unlockedStageCode: readText(value, 'unlockedStageCode', MAX_TEXT, ''),
    progressed: value.progressed === true,
  };
}

function assertSafeMainlineRewards(stageCode: string, rewardItems: PlayerBattleRewardItemVO[]): void {
  const config = realMainlineSettlementForStage(stageCode);
  if (!config) {
    throw new Error('真实首通结算响应关卡未开放');
  }
  const blockedTypes = new Set(['USDT', 'HERO', 'HERO_FRAGMENT']);
  const blockedCodes = new Set(['USDT', 'DIAMOND', 'BOUND_DIAMOND', 'STAMINA', 'EX_CORE_SHARD']);
  const safePairs = new Set(['PLAYER_EXP:PLAYER_EXP', 'CURRENCY:GOLD', 'ITEM:LOW_ENHANCE_STONE', 'ITEM:HERO_EXP_BOOK']);
  let hasPlayerExp = false;
  let hasGold = false;
  for (const item of rewardItems) {
    const type = item.resourceType.toUpperCase();
    const code = item.resourceCode.toUpperCase();
    if (blockedTypes.has(type) || blockedCodes.has(code) || code.startsWith('EX_')) {
      throw new Error('真实首通结算响应包含未开放奖励资源');
    }
    if (!safePairs.has(`${type}:${code}`) || item.amount <= 0) {
      throw new Error('真实首通结算响应奖励不在年度主线安全集合内');
    }
    hasPlayerExp = hasPlayerExp || (type === 'PLAYER_EXP' && code === 'PLAYER_EXP');
    hasGold = hasGold || (type === 'CURRENCY' && code === 'GOLD');
  }
  if (!hasPlayerExp || !hasGold) {
    throw new Error('真实首通结算响应缺少玩家经验或金币');
  }
}

function isRealSettlementMode(mode: string): boolean {
  const match = /^REAL_MAINLINE_R(\d{1,3})$/.exec(mode);
  if (!match) {
    return false;
  }
  const order = Number(match[1]);
  return Number.isInteger(order) && order >= 1 && order <= ANNUAL_MAINLINE_TOTAL_STAGES;
}

function isRealMainlineStage(stageCode: string): boolean {
  return annualMainlineStageOrder(stageCode) > 0;
}

function realMainlineSettlementForStage(stageCode: string): { settlementMode: string } | null {
  const order = annualMainlineStageOrder(stageCode);
  return order > 0 ? { settlementMode: `${REAL_MAINLINE_MODE_PREFIX}${order}` } : null;
}

function annualMainlineStageOrder(stageCode: string): number {
  const match = /^MAIN_(\d{1,2})_(\d{1,2})$/.exec(stageCode);
  if (!match) {
    return 0;
  }
  const chapter = Number(match[1]);
  const stage = Number(match[2]);
  if (chapter === 1) {
    return stage >= 1 && stage <= FIRST_CHAPTER_STAGE_COUNT ? stage : 0;
  }
  if (chapter < 2 || chapter > 25 || stage < 1 || stage > STAGES_PER_CHAPTER_AFTER_FIRST) {
    return 0;
  }
  return FIRST_CHAPTER_STAGE_COUNT + (chapter - 2) * STAGES_PER_CHAPTER_AFTER_FIRST + stage;
}

function normalizeLineupHero(item: unknown): PlayerBattleLineupHeroVO {
  if (!isRecord(item)) {
    throw new Error('战斗阵容响应格式错误：阵容项不是对象');
  }
  const heroCode = readText(item, 'heroCode', MAX_TEXT, '');
  const rarity = readText(item, 'rarity', 16, 'R');
  if (rarity.toUpperCase() === 'EX' || heroCode.toUpperCase().startsWith('EX_')) {
    throw new Error('战斗阵容响应包含未开放 EX 内容');
  }
  return {
    heroId: readInteger(item.heroId, 0, Number.MAX_SAFE_INTEGER),
    heroCode,
    heroName: readText(item, 'heroName', MAX_TEXT, '未命名英雄'),
    rarity,
    level: readInteger(item.level, 1, 999),
    star: readInteger(item.star, 0, 99),
    power: readInteger(item.power, 0, Number.MAX_SAFE_INTEGER),
    attack: readInteger(item.attack, 0, Number.MAX_SAFE_INTEGER),
    leader: item.leader === true,
    protagonist: item.protagonist === true,
    sourceType: readText(item, 'sourceType', 32, ''),
    portraitAsset: readOptionalText(item, 'portraitAsset', MAX_TEXT),
    spineAsset: readOptionalText(item, 'spineAsset', MAX_TEXT),
    spineUuid: readOptionalText(item, 'spineUuid', 64),
    skillConfig: parseBattleSkillConfig(item),
    equipEffects: parseBattleEquipEffects(item),
  };
}

// 装备特级词条(装备一期):解析 equipEffectsJson(已穿装备 special_effects_json 合并数组)。
// 非法/缺省返回 undefined;逐项校验 type,数值字段非法时丢弃该项。最多 8 条防御异常数据。
export function parseBattleEquipEffects(item: Record<string, unknown>): PlayerBattleEquipEffectVO[] | undefined {
  const raw = item.equipEffectsJson;
  if (typeof raw !== 'string' || raw.trim().length <= 0) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const effects: PlayerBattleEquipEffectVO[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const type = typeof record.type === 'string' ? record.type.trim() : '';
      if (!type || type.length > 32) {
        continue;
      }
      const count = typeof record.count === 'number' && Number.isFinite(record.count) ? Math.trunc(record.count) : null;
      const threshold = typeof record.threshold === 'number' && Number.isFinite(record.threshold) ? record.threshold : null;
      effects.push({ type, count, threshold });
      if (effects.length >= 8) {
        break;
      }
    }
    return effects.length > 0 ? effects : undefined;
  } catch {
    return undefined;
  }
}

// 解析后端下发的战斗特殊属性配置(hero_battle_skill_config)。字段存在才返回(权威),否则 undefined → 回退客户端占位表。
// 复用点:battle start 阵容 + 大厅英雄列表(英雄详情技能预览)都用它解析同一套 energyShieldScope+effectsJson。
export function parseBattleSkillConfig(item: Record<string, unknown>): PlayerBattleSkillConfigVO | undefined {
  if (!('energyShieldScope' in item) && !('effectsJson' in item)) {
    return undefined;
  }
  const scopeRaw = typeof item.energyShieldScope === 'string' ? item.energyShieldScope.trim().toLowerCase() : '';
  const energyShieldScope = scopeRaw === 'single' || scopeRaw === 'team' ? scopeRaw : null;
  return { energyShieldScope, effects: parseBattleSkillEffects(item.effectsJson) };
}

function parseBattleSkillEffects(raw: unknown): PlayerBattleSkillEffectVO[] {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const effects: PlayerBattleSkillEffectVO[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    const baseChance = typeof record.baseChance === 'number' ? record.baseChance : Number(record.baseChance);
    const magnitude = typeof record.magnitude === 'number' ? record.magnitude : Number(record.magnitude);
    if (!type || !Number.isFinite(baseChance) || !Number.isFinite(magnitude)) {
      continue;
    }
    effects.push({ type, baseChance, magnitude });
  }
  return effects;
}

function normalizeEnemy(item: unknown): PlayerBattleEnemyVO {
  if (!isRecord(item)) {
    throw new Error('战斗敌方响应格式错误：敌方项不是对象');
  }
  return {
    enemyCode: readText(item, 'enemyCode', MAX_TEXT, ''),
    enemyName: readText(item, 'enemyName', MAX_TEXT, '未知敌人'),
    level: readInteger(item.level, 1, 999),
    power: readInteger(item.power, 0, Number.MAX_SAFE_INTEGER),
    role: readText(item, 'role', 32, ''),
    spineAsset: readOptionalText(item, 'spineAsset', MAX_TEXT),
    scaleProfile: readOptionalText(item, 'scaleProfile', 32),
    baseHp: readOptionalEnemyStat(item.baseHp),
    baseAttack: readOptionalEnemyStat(item.baseAttack),
    baseDefense: readOptionalEnemyStat(item.baseDefense),
    monsterType: readOptionalText(item, 'monsterType', 16),
    boss: item.boss === true,
    avatarAsset: readOptionalText(item, 'avatarAsset', MAX_TEXT),
    skinAsset: readOptionalText(item, 'skinAsset', MAX_TEXT),
    spineSkin: readOptionalText(item, 'spineSkin', 64),
    displayScale: typeof item.displayScale === 'number' && Number.isFinite(item.displayScale) ? item.displayScale : null,
  };
}

// 敌人独立数值:后端可空,非数字/缺省返回 null(客户端据此决定用配置值还是按 power 派生)。
function readOptionalEnemyStat(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.trunc(value));
}

function readStageCode(record: UnknownRecord, key: string): string {
  return normalizeMainStageCode(readText(record, key, MAX_TEXT, ''));
}

function readOptionalText(record: UnknownRecord, key: string, maxLength: number): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function normalizeMainStageCode(stageCode: string): string {
  const value = (stageCode || '').trim().toUpperCase();
  if (isDailyDungeonStageCode(value)) {
    return value;
  }
  if (!/^MAIN_\d+_\d+$/.test(value)) {
    throw new Error('战斗关卡必须显式返回 MAIN_数字_数字，不允许默认兜底');
  }
  if (annualMainlineStageOrder(value) <= 0) {
    throw new Error('战斗关卡超出年度主线 MAIN_1_1 至 MAIN_25_16 范围');
  }
  return value;
}

function sanitizeTextArray(values: unknown[], maxLength: number): string[] {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().slice(0, maxLength))
    .filter((value) => value && !value.toUpperCase().includes('EX_'));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArray(record: UnknownRecord, key: string, maxLength: number): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value.slice(0, maxLength) : [];
}

function readText(record: UnknownRecord, key: string, maxLength: number, fallback: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function readRequiredText(record: UnknownRecord, key: string, maxLength: number, errorMessage: string): string {
  const value = readText(record, key, maxLength, '');
  if (!value) {
    throw new Error(errorMessage);
  }
  return value;
}

function readInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function readNullableInteger(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return readInteger(value, min, max);
}

function readNumber(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.max(min, Math.min(max, numeric));
}

function readNullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return readNumber(value, min, max);
}
