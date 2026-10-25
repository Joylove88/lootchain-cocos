// 守卫战服务端复演(docs/43,2026-10-24 用户:「守卫战胜负仍由客户端上报……这个也需要做了」)。
// 纯逻辑、无 cc 依赖:客户端建场与服务端复演(node 跑同一份编译产物)共用,保证两边从同一份数据、同一种子算出同一局。
//   1) resolveGuardStageSetup:关卡 → 波数 / 模式 / 怪物强度参数(原散在渲染层 mount 里)
//   2) buildGuardPool:开战回执阵容(服务端下发的原始属性 guardStats)→ 局内召唤池(局外属性 + 升星被动)
//   3) guardReplayBattle:按记录的操作(t + 类型 + 参数)逐 tick 重放,复算胜负 / 波次 / 试炼层数

import {
  createGuardBattle,
  guardBanishChoice,
  guardCallNextWave,
  guardCastHeroSkillNow,
  guardCastSpell,
  guardChooseOption,
  guardCollectPickup,
  guardDragTo,
  guardEnhance,
  guardMarkMonster,
  guardOpenChest,
  guardPlaceTrap,
  guardRerollChoice,
  guardSellHero,
  guardSetSkillAuto,
  guardRaidAttack,
  guardRaidDodge,
  guardRaidMove,
  guardRaidSkill,
  guardStartRaid,
  guardSetSpellLoadout,
  guardSkipChoice,
  guardSummon,
  guardTick,
  guardTrialLayers,
  guardUseCrystalSkill,
  guardApplyMonsterRoster,
  resolveGuardRole,
  GUARD_SPELL_IDS,
  GUARD_TRAP_KINDS,
  type GuardBattleState,
  type GuardInput,
  type GuardMode,
  type GuardMonsterRoster,
  type GuardPassive,
  type GuardPassiveType,
  type GuardPoolHero,
} from './GuardBattleModel';
import { HERO_BASE_CRIT_DAMAGE_PCT, heroAffixPct } from './HeroCombatStats';
import { resolveBattleHeroSkillProfile, resolveEnergyShieldHpRatio, resolveSkillTriggerChance, resolveUnlockedPassiveCount } from './LobbyBattleHeroSkillConfig';

/** 渲染层固定步长(LobbyGuardBattleRenderer TICK_MS);复演必须同一步长。 */
export const GUARD_REPLAY_TICK_MS = 50;
/** 复演载荷版本:模型改动影响结果时 +1,服务端只复演同版本的记录。 */
export const GUARD_REPLAY_VERSION = 1;
/** 主线难度锚点:monsterScale = 关卡推荐战力 / 本基线(钳 [0.25, 6])。 */
export const GUARD_MAIN_POWER_BASELINE = 2800;
/** 局外攻击 → 局内 1 星基础攻击折算。 */
export const GUARD_BASE_ATTACK_SCALE = 1.0;

/** 开战回执里服务端下发的单个上阵英雄原始属性(PlayerBattleLineupHeroVO.guardStats + 基本字段)。 */
export interface GuardRawHero {
  heroCode: string;
  heroName?: string;
  rarity: string;
  /** 模板原始职业(中文,不经翻译;定位判定用)。 */
  heroClass: string | null;
  star: number;
  /** 有效攻击(后端已含等级 / 星级 / 装备 / 宝石)。 */
  attack: number;
  ultimateSkillLevel: number;
  /** 基础有效属性(模板 × 等级 / 星系数,与名册 attr* 同口径)。 */
  hp: number;
  defense: number;
  speed: number;
  crit: number;
  /** 已穿装备平属性合计(模板 ×(1 + 0.1 × 强化))。 */
  equipHp: number;
  equipDefense: number;
  equipSpeed: number;
  equipCrit: number;
  /** 特性(词条)原始点数。 */
  affixes: Array<{ code: string; value: number }>;
  /** 技能配置(hero_battle_skill_config);effects 为 null 时回退客户端占位表。 */
  energyShieldScope: 'single' | 'team' | null;
  effects: Array<{ type: string; baseChance: number; magnitude: number }> | null;
}

type GuardBattleOpts = NonNullable<Parameters<typeof createGuardBattle>[4]>;
/** 守卫水晶养成快照(开战回执 guardCrystal;docs/38)。 */
export type GuardCrystalSnapshot = GuardBattleOpts['crystal'];

const GUARD_PASSIVE_TYPES: GuardPassiveType[] = ['lifesteal', 'truePierce', 'freeze', 'stun', 'splash', 'reflect', 'atkUp', 'hpUp'];

function affixSum(raw: GuardRawHero, code: string): number {
  return raw.affixes.filter((affix) => (affix.code || '').toUpperCase() === code).reduce((sum, affix) => sum + heroAffixPct(affix.value), 0);
}

/** 单个英雄 → 召唤池条目(局外属性口径同 HeroCombatStats:基础 + 装备 + 特性 %)。 */
export function buildGuardPoolHero(raw: GuardRawHero, sourceIndex: number): GuardPoolHero {
  const pct = (base: number, equip: number, code: string): number => (base + equip) * (1 + affixSum(raw, code) / 100);
  const rarity = raw.rarity || 'R';
  const shieldScope = raw.effects ? raw.energyShieldScope : resolveBattleHeroSkillProfile(raw.heroCode).energyShield?.scope ?? null;
  const effects = raw.effects ?? resolveBattleHeroSkillProfile(raw.heroCode).effects ?? [];
  const ordered: Array<{ shield: true } | { shield: false; type: string; baseChance: number; magnitude: number }> = [
    ...(shieldScope ? [{ shield: true as const }] : []),
    ...effects.map((effect) => ({ shield: false as const, type: effect.type, baseChance: effect.baseChance, magnitude: effect.magnitude })),
  ];
  const passives: GuardPassive[] = [];
  let shieldRatio = 0;
  ordered.slice(0, resolveUnlockedPassiveCount(rarity, raw.star)).forEach((entry) => {
    if (entry.shield) {
      shieldRatio = shieldScope ? resolveEnergyShieldHpRatio(shieldScope, rarity) : 0;
      return;
    }
    if (GUARD_PASSIVE_TYPES.indexOf(entry.type as GuardPassiveType) < 0) {
      return;
    }
    const flat = entry.type === 'atkUp' || entry.type === 'hpUp';
    passives.push({ type: entry.type as GuardPassiveType, chance: flat ? 1 : resolveSkillTriggerChance(entry.baseChance, rarity), magnitude: entry.magnitude });
  });
  return {
    heroCode: (raw.heroCode || '').toUpperCase(),
    displayName: raw.heroName || raw.heroCode,
    rarity,
    role: resolveGuardRole(raw.heroCode, raw.heroClass),
    baseAttack: Math.max(10, Math.round((raw.attack || 40) * GUARD_BASE_ATTACK_SCALE)),
    sourceIndex,
    outside: {
      hp: pct(raw.hp, raw.equipHp, 'HP_BONUS'),
      defense: pct(raw.defense, raw.equipDefense, 'DEF_BONUS'),
      speed: pct(raw.speed, raw.equipSpeed, 'SPD_BONUS'),
      critPct: raw.crit + raw.equipCrit + affixSum(raw, 'CRIT_RATE'),
      critDmgPct: HERO_BASE_CRIT_DAMAGE_PCT + affixSum(raw, 'CRIT_DMG'),
      ultLevel: Math.max(1, Math.trunc(raw.ultimateSkillLevel || 1)),
      atkBonusPct: affixSum(raw, 'ATK_BONUS'),
      passives,
      shieldRatio,
    },
  };
}

/** 上阵 4 人(2026-08-26 拍板 5→4)。 */
export function buildGuardPool(raws: readonly GuardRawHero[]): GuardPoolHero[] {
  return raws.slice(0, 4).map((raw, index) => buildGuardPoolHero(raw, index));
}

export interface GuardStageSetup {
  maxWave: number;
  mode: GuardMode;
  monsterScale: number;
  spawnCountMult: number;
  monsterHpMult: number;
  monsterBiteMult: number | undefined;
  minionHpMult: number;
}

/**
 * 关卡 → 局面参数。DAILY 三档后缀:Ⅰ=10 波 / Ⅱ=20 波 / Ⅲ=BOSS 车轮战;主线 MAIN_*=难度Ⅰ同款 10 波 + 推荐战力缩放怪物强度。
 * 主线难度包(P5a2):怪量 ×2、血量 ×3;限时副本:血量 ×3、小怪再 ×10/3(2026-09-11 拍板)。
 */
export function resolveGuardStageSetup(stageCode: string, recommendedPower: number | null | undefined): GuardStageSetup {
  const code = (stageCode || '').toUpperCase();
  const isDaily = code.startsWith('DAILY_');
  const isMain = /^MAIN_\d+_\d+$/.test(code);
  const rush = isDaily && code.endsWith('_3');
  // docs/47 P0:掠夺原型关卡(RAID_*)——波次不用,模式 raid 由 guardStartRaid 切入
  if (code.startsWith('RAID_')) {
    return { maxWave: 1, mode: 'raid', monsterScale: 1, spawnCountMult: 1, monsterHpMult: 1, monsterBiteMult: undefined, minionHpMult: 1 };
  }
  const scale = isMain && recommendedPower && recommendedPower > 0 ? Math.max(0.25, Math.min(6, recommendedPower / GUARD_MAIN_POWER_BASELINE)) : 1;
  return {
    maxWave: rush ? 999 : isDaily && code.endsWith('_2') ? 20 : 10,
    mode: rush ? 'rush' : 'standard',
    monsterScale: scale,
    spawnCountMult: isMain ? 2 : isDaily ? 3 : 1,
    monsterHpMult: isMain || isDaily ? 3 : 1,
    monsterBiteMult: isDaily ? 1 : undefined,
    minionHpMult: isDaily ? 10 / 3 : 1,
  };
}

/** 复演所需的全部服务端已知输入(开战会话里都有)。 */
/** 矿境掠夺建场参数(docs/48):服务端算好的进攻方 / 守卫 / 水晶,客户端与复演只认它。 */
export interface GuardRaidSetup {
  crystalHp: number;
  raider: { heroCode: string; attack: number; hp: number };
  defenders: Array<{ cell: number; hp: number; raw: GuardRawHero }>;
}

export interface GuardReplaySetup {
  seedText: string;
  stageCode: string;
  recommendedPower: number | null;
  lineup: GuardRawHero[];
  /** 掠夺建场(RAID_n);守卫战 / 本地原型为 null。 */
  raid?: GuardRaidSetup | null;
  monsterRoster: GuardMonsterRoster | null;
  crystal: GuardCrystalSnapshot | null;
  /** 新手宝箱脚本档位是否认可(服务端:玩家前 3 场守卫战)。 */
  allowChestScript: boolean;
}

/** 建池:阵容(上阵 ≤4)+ 掠夺 NPC 守卫(顺延在阵容之后、不受 4 人上限;sourceIndex 对应表现快照 lineup + npc 的顺序)。 */
export function buildGuardPoolForSetup(lineup: readonly GuardRawHero[], raid: GuardRaidSetup | null | undefined): GuardPoolHero[] {
  const pool = buildGuardPool(lineup);
  if (!raid) {
    return pool;
  }
  return pool.concat(raid.defenders.map((defender, index) => buildGuardPoolHero(defender.raw, pool.length + index)));
}

/** 掠夺开局:进攻方 = 回执里的 raider,守卫 = 回执里的 defenders(池里按 heroCode 找属性)。 */
export function guardStartRaidFromSetup(state: GuardBattleState, raid: GuardRaidSetup): void {
  guardStartRaid(
    state,
    { heroCode: raid.raider.heroCode, attack: raid.raider.attack, hp: raid.raider.hp, crystalHp: raid.crystalHp },
    raid.defenders.map((defender) => ({ heroCode: defender.raw.heroCode, cell: defender.cell, star: defender.raw.star, hp: defender.hp })),
  );
}

export function createGuardBattleFromSetup(setup: GuardReplaySetup, pool: GuardPoolHero[] = buildGuardPoolForSetup(setup.lineup, setup.raid)): GuardBattleState {
  const stage = resolveGuardStageSetup(setup.stageCode, setup.recommendedPower);
  const state = createGuardBattle(pool, setup.seedText, stage.maxWave, stage.mode, {
    monsterScale: stage.monsterScale,
    spawnCountMult: stage.spawnCountMult,
    monsterHpMult: stage.monsterHpMult,
    monsterBiteMult: stage.monsterBiteMult,
    minionHpMult: stage.minionHpMult,
    monsterRoster: setup.monsterRoster,
    crystal: setup.crystal ?? null,
  });
  if (stage.mode === 'raid' && setup.raid) {
    guardStartRaidFromSetup(state, setup.raid);
  }
  return state;
}

/** 把一条记录的操作作用到局面上(与渲染层调用同一批导出函数)。 */
export function guardApplyInput(state: GuardBattleState, input: GuardInput, allowChestScript: boolean): void {
  const a = input.a ?? [];
  switch (input.k) {
    case 'summon': guardSummon(state); break;
    case 'drag': guardDragTo(state, input.v, a[0] ?? -1); break;
    case 'sell': guardSellHero(state, input.v); break;
    case 'enhance': guardEnhance(state); break;
    case 'choose': guardChooseOption(state, input.v); break;
    case 'skip': guardSkipChoice(state); break;
    case 'reroll': guardRerollChoice(state); break;
    case 'banish': guardBanishChoice(state, input.v); break;
    case 'chest': {
      const tier = allowChestScript && (a[0] === 1 || a[0] === 3 || a[0] === 5) ? (a[0] as 1 | 3 | 5) : undefined;
      guardOpenChest(state, input.v, tier);
      break;
    }
    case 'crystal': guardUseCrystalSkill(state); break;
    case 'spell': {
      const id = GUARD_SPELL_IDS[input.v];
      if (id) {
        guardCastSpell(state, id, a.length >= 2 ? { lane: a[0], x: a[1] } : undefined);
      }
      break;
    }
    case 'trap': {
      const kind = GUARD_TRAP_KINDS[input.v];
      if (kind) {
        guardPlaceTrap(state, kind, a[0] ?? 0);
      }
      break;
    }
    case 'mark': guardMarkMonster(state, input.v >= 0 ? input.v : null); break;
    case 'skill': guardCastHeroSkillNow(state, input.v); break;
    case 'callWave': guardCallNextWave(state); break;
    case 'pickup': guardCollectPickup(state, input.v); break;
    case 'loadout': guardSetSpellLoadout(state, (input.s ?? '').split(',').filter((id) => id.length > 0)); break;
    case 'auto': guardSetSkillAuto(state, input.v === 1); break;
    // docs/47 P0 掠夺
    case 'rmove': guardRaidMove(state, input.v); break;
    case 'ratk': guardRaidAttack(state); break;
    case 'rskill': guardRaidSkill(state, input.v); break;
    case 'rdodge': guardRaidDodge(state); break;
    default: break;
  }
}

export interface GuardReplayResult {
  phase: GuardBattleState['phase'];
  win: boolean;
  wave: number;
  trialLayers: number;
  timeMs: number;
  crystalHp: number;
  killCount: number;
  /** 未能应用的记录条数(时间早于当前局面 / 卡在三选一时)。 */
  skippedInputs: number;
}

/**
 * 逐 tick 复演:每个 tick 前先应用 t == 当前局内时间的全部操作(按记录顺序),再推进 50ms。
 * 三选一 / 暂停时局内时间不走,同一 t 的后续操作(如 choose)照常应用;局面卡住且没有可用操作即结束。
 */
export function guardReplayBattle(setup: GuardReplaySetup, inputs: readonly GuardInput[], maxTicks = 40_000): GuardReplayResult {
  const state = createGuardBattleFromSetup(setup);
  const queue = [...inputs].sort((left, right) => left.t - right.t);
  let cursor = 0;
  let skipped = 0;
  let ticks = 0;
  let stall = 0;
  while (state.phase !== 'victory' && state.phase !== 'defeat' && ticks < maxTicks) {
    while (cursor < queue.length && queue[cursor].t <= state.timeMs) {
      if (queue[cursor].t < state.timeMs - GUARD_REPLAY_TICK_MS) {
        skipped += 1;
      } else {
        guardApplyInput(state, queue[cursor], setup.allowChestScript);
      }
      cursor += 1;
    }
    const before = state.timeMs;
    guardTick(state, GUARD_REPLAY_TICK_MS);
    state.events.length = 0;
    ticks += 1;
    if (state.timeMs === before) {
      // 三选一 / 暂停卡住:下一条操作若也在当前时刻,下一轮会应用;否则就是玩家放弃了,结束复演
      stall += 1;
      if (cursor >= queue.length || queue[cursor].t > state.timeMs || stall > 4) {
        break;
      }
    } else {
      stall = 0;
    }
  }
  return {
    phase: state.phase,
    win: state.phase === 'victory',
    wave: state.wave,
    trialLayers: guardTrialLayers(state),
    timeMs: state.timeMs,
    crystalHp: state.crystalHp,
    killCount: state.killCount,
    skippedInputs: skipped + Math.max(0, queue.length - cursor),
  };
}

// ── 开战回执解析(客户端 BattleApi 与服务端复演共用同一份,保证两边建场输入逐位一致)──
type GuardRecord = Record<string, unknown>;
function guardIsRecord(value: unknown): value is GuardRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function guardNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function guardText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 技能配置 effectsJson(后端 hero_battle_skill_config.effects_json)→ 效果列表;坏数据跳过。 */
export function parseGuardSkillEffects(raw: unknown): Array<{ type: string; baseChance: number; magnitude: number }> {
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
  const out: Array<{ type: string; baseChance: number; magnitude: number }> = [];
  for (const entry of parsed) {
    if (!guardIsRecord(entry)) {
      continue;
    }
    const type = guardText(entry.type);
    const baseChance = guardNum(entry.baseChance, NaN);
    const magnitude = guardNum(entry.magnitude, NaN);
    if (type && Number.isFinite(baseChance) && Number.isFinite(magnitude)) {
      out.push({ type, baseChance, magnitude });
    }
  }
  return out;
}

/**
 * 阵容项(PlayerBattleLineupHeroVO JSON)→ 复演原始英雄;没有 guardStats(旧服务端)返回 null。
 * 技能配置:回执带了 energyShieldScope / effectsJson 字段即以它为准(可能为空列表),都没有才回退占位表(effects=null)。
 */
export function guardRawHeroFromLineupJson(item: unknown): GuardRawHero | null {
  if (!guardIsRecord(item) || !guardIsRecord(item.guardStats)) {
    return null;
  }
  const stats = item.guardStats;
  const hasSkill = 'energyShieldScope' in item || 'effectsJson' in item;
  const scope = guardText(item.energyShieldScope).toLowerCase();
  const affixes = Array.isArray(stats.affixes)
    ? stats.affixes.filter(guardIsRecord).map((affix) => ({ code: guardText(affix.code).toUpperCase(), value: guardNum(affix.value) })).filter((affix) => affix.code.length > 0)
    : [];
  return {
    heroCode: guardText(item.heroCode).toUpperCase(),
    heroName: guardText(item.heroName),
    rarity: guardText(item.rarity) || 'R',
    heroClass: guardText(stats.heroClass) || null,
    star: Math.max(1, Math.trunc(guardNum(item.star, 1))),
    attack: Math.max(0, guardNum(item.attack)),
    ultimateSkillLevel: Math.max(1, Math.trunc(guardNum(item.ultimateSkillLevel, 1))),
    hp: Math.max(0, guardNum(stats.hp)),
    defense: Math.max(0, guardNum(stats.defense)),
    speed: Math.max(0, guardNum(stats.speed)),
    crit: Math.max(0, guardNum(stats.crit)),
    equipHp: Math.max(0, guardNum(stats.equipHp)),
    equipDefense: Math.max(0, guardNum(stats.equipDefense)),
    equipSpeed: Math.max(0, guardNum(stats.equipSpeed)),
    equipCrit: Math.max(0, guardNum(stats.equipCrit)),
    affixes,
    energyShieldScope: hasSkill ? (scope === 'single' || scope === 'team' ? scope : null) : null,
    effects: hasSkill ? parseGuardSkillEffects(item.effectsJson) : null,
  };
}

const GUARD_KNOWN_SPELLS = ['quake', 'frost', 'thunder', 'goldrush', 'aegis', 'warhorn'];
/** 开战水晶快照(docs/38):数值钳到合理范围,法术只认已知 id,出战法术只认已解锁的;格式不对返回 null(按 1 级)。 */
export function normalizeGuardCrystalSnapshot(raw: unknown): GuardCrystalSnapshot | null {
  if (!guardIsRecord(raw)) {
    return null;
  }
  const num = (key: string, max: number): number => Math.max(0, Math.min(max, Math.round(guardNum(raw[key]))));
  const spells = Array.isArray(raw.unlockedSpells)
    ? raw.unlockedSpells.filter((id): id is string => typeof id === 'string' && GUARD_KNOWN_SPELLS.indexOf(id) >= 0).slice(0, GUARD_KNOWN_SPELLS.length)
    : [];
  const slots = num('spellSlots', 5);
  const loadout = Array.isArray(raw.spellLoadout)
    ? raw.spellLoadout.filter((id): id is string => typeof id === 'string' && spells.indexOf(id) >= 0).slice(0, 5)
    : [];
  const spellLevels: Record<string, number> = {};
  const rawLevels = guardIsRecord(raw.spellLevels) ? raw.spellLevels : null;
  for (const id of spells) {
    const value = rawLevels ? guardNum(rawLevels[id], NaN) : NaN;
    spellLevels[id] = Number.isFinite(value) ? Math.max(1, Math.min(5, Math.round(value))) : 1;
  }
  return {
    level: Math.max(1, num('level', 999)),
    crystalHpPct: num('crystalHpPct', 200),
    startGold: num('startGold', 1000),
    spellPowerPct: num('spellPowerPct', 300),
    startEnergy: num('startEnergy', 150),
    energyMaxBonus: num('energyMaxBonus', 100),
    unlockedSpells: spells,
    spellSlots: slots > 0 ? slots : undefined,
    spellLoadout: loadout,
    spellLevels,
  };
}

const GUARD_ROSTER_KINDS = ['normal', 'fast', 'tank', 'flying', 'shooter', 'elite', 'boss'];
export interface GuardRosterEntry {
  monsterCode: string;
  monsterName: string;
  guardKind: 'normal' | 'fast' | 'tank' | 'flying' | 'shooter' | 'elite' | 'boss';
  spineAsset: string;
  displayScale: number;
  bossSkill: 'volley' | 'smash' | null;
}
/** 出场名单项:怪种只认已知值,骨骼路径必须是 spine/monster/<目录>/<文件>(只含安全字符),体型钳 0.3~3;不合格返回 null。 */
export function normalizeGuardMonsterEntry(raw: unknown): GuardRosterEntry | null {
  if (!guardIsRecord(raw)) {
    return null;
  }
  const kind = guardText(raw.guardKind).toLowerCase();
  const spineAsset = guardText(raw.spineAsset);
  if (GUARD_ROSTER_KINDS.indexOf(kind) < 0 || !/^spine\/monster\/[a-z0-9_]+\/[A-Za-z0-9_\-\[\]]+$/.test(spineAsset)) {
    return null;
  }
  const scale = guardNum(raw.displayScale, NaN);
  return {
    monsterCode: guardText(raw.monsterCode).slice(0, 64),
    monsterName: guardText(raw.monsterName).slice(0, 64),
    guardKind: kind as GuardRosterEntry['guardKind'],
    spineAsset,
    displayScale: Number.isFinite(scale) ? Math.max(0.3, Math.min(3, scale)) : 1,
    bossSkill: raw.bossSkill === 'volley' ? 'volley' : raw.bossSkill === 'smash' ? 'smash' : null,
  };
}

/**
 * 开战回执(PlayerBattleStartVO JSON)→ 复演输入。服务端把会话重建出的同一份回执原样交给本函数;
 * 有任一上阵英雄缺 guardStats(旧服务端快照)返回 null,不复演。
 */
export function guardReplaySetupFromStart(start: unknown, allowChestScript: boolean): GuardReplaySetup | null {
  if (!guardIsRecord(start)) {
    return null;
  }
  const lineupRaw = Array.isArray(start.lineup) ? start.lineup : [];
  const lineup = lineupRaw.map(guardRawHeroFromLineupJson);
  if (lineup.length === 0 || lineup.some((entry) => entry === null)) {
    return null;
  }
  const roster = Array.isArray(start.guardMonsters)
    ? start.guardMonsters.slice(0, 40).map(normalizeGuardMonsterEntry).filter((entry): entry is GuardRosterEntry => entry !== null)
    : [];
  const recommended = guardNum(start.guardRecommendedPower, NaN);
  return {
    seedText: guardText(start.serverSeed) + ':' + guardText(start.battleNo),
    stageCode: guardText(start.stageCode).toUpperCase(),
    recommendedPower: Number.isFinite(recommended) && recommended > 0 ? recommended : null,
    lineup: lineup as GuardRawHero[],
    monsterRoster: guardApplyMonsterRoster(roster),
    crystal: normalizeGuardCrystalSnapshot(start.guardCrystal),
    allowChestScript,
    raid: guardRaidSetupFromStart(start.raid),
  };
}

/** 回执 raid 字段解析(与 BattleApi 的解析互不依赖:复演端只认这里)。 */
export function guardRaidSetupFromStart(raw: unknown): GuardRaidSetup | null {
  if (!guardIsRecord(raw) || !guardIsRecord(raw.raider)) {
    return null;
  }
  const defenders: Array<{ cell: number; hp: number; raw: GuardRawHero }> = [];
  for (const entry of Array.isArray(raw.defenders) ? raw.defenders.slice(0, 6) : []) {
    if (!guardIsRecord(entry)) {
      continue;
    }
    // 服务端原始 JSON(hero.guardStats)或客户端 BattleApi 已解析的 VO(hero.guardRaw)都认
    const heroRecord = guardIsRecord(entry.hero) ? entry.hero : null;
    const hero = guardRawHeroFromLineupJson(entry.hero) ?? (heroRecord && guardIsRecord(heroRecord.guardRaw) ? (heroRecord.guardRaw as unknown as GuardRawHero) : null);
    if (!hero) {
      continue;
    }
    defenders.push({ cell: Math.max(0, Math.min(11, Math.trunc(guardNum(entry.cell)))), hp: Math.max(1, Math.round(guardNum(entry.hp, 1))), raw: hero });
  }
  if (defenders.length === 0) {
    return null;
  }
  return {
    crystalHp: Math.max(1, Math.round(guardNum(raw.crystalHp, 1))),
    raider: { heroCode: guardText(raw.raider.heroCode).toUpperCase(), attack: Math.max(1, Math.round(guardNum(raw.raider.attack, 1))), hp: Math.max(1, Math.round(guardNum(raw.raider.hp, 1))) },
    defenders,
  };
}
