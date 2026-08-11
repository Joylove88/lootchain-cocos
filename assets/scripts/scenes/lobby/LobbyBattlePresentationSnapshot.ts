import type { PlayerBattleEnemyVO, PlayerBattleLineupHeroVO, PlayerBattleStartVO } from '../../types/BattleTypes';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';
import {
  BATTLE_C1812_BOSS_GAUGE_BAR_ASSET,
  BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET,
  BATTLE_C1812_BUFF_ATTACK_UP_ASSET,
  BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET,
  BATTLE_C1812_BUFF_SHIELD_ASSET,
  BATTLE_C1812_BUFF_STUN_ASSET,
  BATTLE_C1812_HIT_BURST_ASSET,
  BATTLE_C1812_SKILL_TARGET_FRAME_ASSET,
} from '../C1812CommonUiAssets';
import type { LobbyBattlePanelState } from './LobbyBattleState';

export type BattlePresentationUnitSide = 'ally' | 'enemy';
export type BattlePresentationUnitRole = 'front' | 'back' | 'boss';

export interface BattlePresentationUnitSnapshot {
  unitKey: string;
  side: BattlePresentationUnitSide;
  slot: number;
  displayName: string;
  subline: string;
  rarity: string;
  level: number;
  // 星级(我方英雄):被动技能按星级门禁(docs/25 技能系统),未解锁不进战斗特殊属性;敌人/占位缺省 1。
  star?: number;
  power: number;
  // 有效攻击(后端下发,已含等级/星系数);伤害飘字按它做攻击力驱动,敌方/占位无则回退按 power 兜底。
  attack?: number;
  role: BattlePresentationUnitRole;
  leader: boolean;
  hpRatio: number;
  sourceHeroId?: number;
  heroCode?: string;
  heroClass?: string | null;
  portraitAsset?: string | null;
  spineAsset?: string | null;
  spineUuid?: string | null;
  scaleProfile?: string | null;
  enemyCode?: string;
  enemyRole?: string;
  // 敌人独立数值(来自 battle_enemy_config,已按关卡放大);非空时战斗直接用,为空则按 power 派生。
  enemyBaseHp?: number | null;
  enemyBaseAttack?: number | null;
  enemyBaseDefense?: number | null;
  // 怪物系统(P8):配置立绘/类型/BOSS标记/显示缩放;空=未配置(回退旧AI图池)。
  monsterSkinAsset?: string | null;
  monsterType?: string | null;
  monsterBoss?: boolean;
  monsterDisplayScale?: number | null;
  // 战斗特殊属性配置(后端 hero_battle_skill_config 下发);存在=权威,缺省=走客户端占位表。仅我方阵容有。
  skillConfig?: BattlePresentationSkillConfig | null;
  // 装备特级词条(装备一期,后端合并下发):sim 消费——combo 段数/execute 斩杀血线。仅我方阵容有。
  equipEffects?: { type: string; count?: number | null; threshold?: number | null }[] | null;
  // 终极技能等级(P6):手动大招伤害倍率;缺省 1。
  ultimateSkillLevel?: number;
}

export interface BattlePresentationSkillEffect {
  type: string;
  baseChance: number;
  magnitude: number;
}

export interface BattlePresentationSkillConfig {
  energyShieldScope: 'single' | 'team' | null;
  effects: BattlePresentationSkillEffect[];
}

export interface BattlePresentationStage2UiAssets {
  bossGaugeFrame: string;
  bossGaugeBar: string;
  skillTargetFrame: string;
  hitBurst: string;
  buffAttackUp: string;
  buffDefenseDown: string;
  buffShield: string;
  buffStun: string;
}

export interface BattlePresentationStage2AudioCues {
  battleBgm: string;
  battleStart: string;
  heroBasicAttack: string;
  rangedAttack: string;
  hitLight: string;
  heroSkill: string;
  healCast: string;
  buffApply: string;
  resultWin: string;
  resultLose: string;
}

export interface BattlePresentationSnapshot {
  stageCode: string;
  battleNo: string;
  serverSeed: string;
  readonlyEconomy: boolean;
  guardrails: string[];
  allies: BattlePresentationUnitSnapshot[];
  enemies: BattlePresentationUnitSnapshot[];
  leadEnemy: BattlePresentationUnitSnapshot;
  leadAlly: BattlePresentationUnitSnapshot;
  boss: boolean;
  unitSnapshotKey: string;
  stage2UiAssets: BattlePresentationStage2UiAssets;
  stage2AudioCues: BattlePresentationStage2AudioCues;
}

export const BATTLE_STAGE3_UI_ASSETS: BattlePresentationStage2UiAssets = {
  bossGaugeFrame: BATTLE_C1812_BOSS_GAUGE_FRAME_ASSET,
  bossGaugeBar: BATTLE_C1812_BOSS_GAUGE_BAR_ASSET,
  skillTargetFrame: BATTLE_C1812_SKILL_TARGET_FRAME_ASSET,
  hitBurst: BATTLE_C1812_HIT_BURST_ASSET,
  buffAttackUp: BATTLE_C1812_BUFF_ATTACK_UP_ASSET,
  buffDefenseDown: BATTLE_C1812_BUFF_DEFENSE_DOWN_ASSET,
  buffShield: BATTLE_C1812_BUFF_SHIELD_ASSET,
  buffStun: BATTLE_C1812_BUFF_STUN_ASSET,
};

export const BATTLE_STAGE3_AUDIO_CUES: BattlePresentationStage2AudioCues = {
  battleBgm: 'audio/battle/bgm/battle_loop_01',
  battleStart: 'audio/battle/ui/battle_start_stinger',
  heroBasicAttack: 'audio/battle/sfx/attack/hero_basic_01',
  rangedAttack: 'audio/battle/sfx/attack/ranged_01',
  hitLight: 'audio/battle/sfx/hit/hit_light_01',
  heroSkill: 'audio/battle/sfx/skill/hero_skill_01',
  healCast: 'audio/battle/sfx/heal/heal_cast_01',
  buffApply: 'audio/battle/sfx/buff/buff_apply_01',
  resultWin: 'audio/battle/ui/result_win',
  resultLose: 'audio/battle/ui/result_lose',
};

const EMPTY_ALLY: BattlePresentationUnitSnapshot = {
  unitKey: 'ally-empty',
  side: 'ally',
  slot: 0,
  displayName: '空位',
  subline: '待上阵',
  rarity: 'N',
  level: 1,
  power: 0,
  role: 'front',
  leader: false,
  hpRatio: 0.65,
};

const EMPTY_ENEMY: BattlePresentationUnitSnapshot = {
  unitKey: 'enemy-empty',
  side: 'enemy',
  slot: 0,
  displayName: '裂隙侍从',
  subline: 'Lv.1 / 预演',
  rarity: 'N',
  level: 1,
  power: 0,
  role: 'front',
  leader: false,
  hpRatio: 0.56,
  enemyRole: '预演',
};

/**
 * Stage 3 表现快照适配层。
 *
 * 输入只来自 battle start 回执、只读英雄列表与本地预演状态；输出只给 Cocos 表现层使用。
 * `serverSeed + battleNo + unitSnapshot` 可在后续阶段生成确定性本地时间轴，但本文件不提交奖励、
 * 体力、主线进度、货币、背包、英雄属性或战力。
 */
// 2026-08-04 复用重构:60Hz 演出帧驱动下本函数每帧被调用多次且调用方无缓存;
// 输出只依赖 state.start/stageCode 与 heroes(演出 tick 不改它们),单槽引用 memo 让
// 整场战斗命中同一对象,下游 timeline/replay 的引用 memo 因此连锁命中。
let snapshotMemo: {
  start: LobbyBattlePanelState['start'];
  stageCode: string;
  heroes: LobbyHeroItemVO[];
  result: BattlePresentationSnapshot;
} | null = null;

export function resolveLobbyBattlePresentationSnapshot(state: LobbyBattlePanelState, heroes: LobbyHeroItemVO[]): BattlePresentationSnapshot {
  if (snapshotMemo && snapshotMemo.start === state.start && snapshotMemo.stageCode === state.stageCode && snapshotMemo.heroes === heroes) {
    return snapshotMemo.result;
  }
  const result = buildLobbyBattlePresentationSnapshot(state, heroes);
  snapshotMemo = { start: state.start, stageCode: state.stageCode, heroes, result };
  return result;
}

function buildLobbyBattlePresentationSnapshot(state: LobbyBattlePanelState, heroes: LobbyHeroItemVO[]): BattlePresentationSnapshot {
  const start = state.start;
  const rosterById = new Map(heroes.map((hero) => [hero.id, hero]));
  const allies = fillUnits(resolveAllies(start, heroes, rosterById), 'ally');
  const enemies = fillUnits(resolveEnemies(start), 'enemy');
  const leadEnemy = enemies.find((enemy) => enemy.role === 'boss') ?? enemies[0] ?? { ...EMPTY_ENEMY };
  const leadAlly = allies.find((ally) => ally.leader) ?? allies[0] ?? { ...EMPTY_ALLY };
  return {
    stageCode: start?.stageCode || state.stageCode || 'MAIN_1_1',
    battleNo: start?.battleNo || 'pending',
    serverSeed: start?.serverSeed || 'pending',
    readonlyEconomy: start?.readonlyEconomy ?? true,
    guardrails: start?.guardrails ?? ['Cocos 表现层不提交奖励、体力、进度、货币、背包或英雄属性。'],
    allies,
    enemies,
    leadEnemy,
    leadAlly,
    boss: enemies.some((enemy) => enemy.role === 'boss'),
    unitSnapshotKey: buildUnitSnapshotKey(start, allies, enemies),
    stage2UiAssets: BATTLE_STAGE3_UI_ASSETS,
    stage2AudioCues: BATTLE_STAGE3_AUDIO_CUES,
  };
}

function resolveAllies(start: PlayerBattleStartVO | null, heroes: LobbyHeroItemVO[], rosterById: Map<number, LobbyHeroItemVO>): BattlePresentationUnitSnapshot[] {
  if (start?.lineup?.length) {
    const visibleLineup = start.lineup.filter((hero) => !hero.protagonist);
    if (visibleLineup.length > 0) {
      return visibleLineup.map((hero, index) => fromLineupHero(hero, index, rosterById.get(hero.heroId)));
    }
  }
  return [...heroes]
    .filter((hero) => hero.id > 0 && !hero.protagonist && !hero.heroCode.toUpperCase().startsWith('EX_') && hero.rarity.toUpperCase() !== 'EX')
    .sort((a, b) => b.power - a.power)
    .slice(0, 5)
    .map((hero, index) => fromRosterHero(hero, index));
}

function resolveEnemies(start: PlayerBattleStartVO | null): BattlePresentationUnitSnapshot[] {
  if (start?.enemyPreview?.length) {
    return start.enemyPreview.map((enemy, index) => fromEnemy(enemy, index));
  }
  return [
    { ...EMPTY_ENEMY, unitKey: 'enemy-preview-0', slot: 0 },
    { ...EMPTY_ENEMY, unitKey: 'enemy-preview-1', slot: 1, displayName: '黑甲守卫', hpRatio: 0.64 },
    { ...EMPTY_ENEMY, unitKey: 'enemy-preview-2', slot: 2, displayName: '裂隙法师', role: 'back', hpRatio: 0.7 },
  ];
}

function fromLineupHero(hero: PlayerBattleLineupHeroVO, index: number, rosterHero?: LobbyHeroItemVO): BattlePresentationUnitSnapshot {
  const heroClass = rosterHero?.heroClass ?? null;
  return {
    unitKey: `ally-${hero.heroId}`,
    side: 'ally',
    slot: index,
    displayName: safeName(hero.heroName, hero.heroCode),
    subline: `Lv.${hero.level} / ${formatInteger(hero.power)}${hero.leader ? ' / 队长' : ''}`,
    rarity: hero.rarity || rosterHero?.rarity || 'R',
    level: hero.level,
    star: rosterHero?.star ?? hero.star ?? 1,
    power: hero.power,
    attack: hero.attack,
    role: classifyHeroRole(heroClass),
    leader: hero.leader,
    hpRatio: hero.leader ? 0.92 : Math.max(0.62, 0.86 - index * 0.07),
    sourceHeroId: hero.heroId,
    heroCode: hero.heroCode,
    heroClass,
    portraitAsset: hero.portraitAsset ?? rosterHero?.portraitAsset ?? null,
    spineAsset: hero.spineAsset ?? rosterHero?.spineAsset ?? null,
    spineUuid: hero.spineUuid ?? rosterHero?.spineUuid ?? null,
    scaleProfile: resolveHeroScaleProfile(hero.rarity || rosterHero?.rarity),
    skillConfig: hero.skillConfig ?? null,
    equipEffects: hero.equipEffects ?? null,
    ultimateSkillLevel: hero.ultimateSkillLevel ?? 1,
  };
}

function fromRosterHero(hero: LobbyHeroItemVO, index: number): BattlePresentationUnitSnapshot {
  return {
    unitKey: `ally-${hero.id}`,
    side: 'ally',
    slot: index,
    displayName: safeName(hero.heroName, hero.heroCode),
    subline: `Lv.${hero.level} / ${formatInteger(hero.power)}${index === 0 ? ' / 队长' : ''}`,
    rarity: hero.rarity || 'R',
    level: hero.level,
    star: hero.star ?? 1,
    power: hero.power,
    role: classifyHeroRole(hero.heroClass),
    leader: index === 0,
    hpRatio: index === 0 ? 0.92 : 0.76,
    sourceHeroId: hero.id,
    heroCode: hero.heroCode,
    heroClass: hero.heroClass ?? null,
    portraitAsset: hero.portraitAsset ?? null,
    spineAsset: hero.spineAsset ?? null,
    spineUuid: hero.spineUuid ?? null,
    scaleProfile: resolveHeroScaleProfile(hero.rarity),
  };
}

function fromEnemy(enemy: PlayerBattleEnemyVO, index: number): BattlePresentationUnitSnapshot {
  const role = classifyEnemyRole(enemy.role, index, enemy.enemyCode);
  return {
    unitKey: `enemy-${enemy.enemyCode || index}`,
    side: 'enemy',
    slot: index,
    displayName: safeName(enemy.enemyName, enemy.enemyCode),
    subline: `Lv.${enemy.level} / ${formatInteger(enemy.power)} / ${safeName(enemy.role, 'enemy')}`,
    rarity: role === 'boss' ? 'BOSS' : 'N',
    level: enemy.level,
    power: enemy.power,
    role,
    leader: false,
    hpRatio: index === 0 ? 0.72 : Math.max(0.34, 0.72 - index * 0.08),
    enemyCode: enemy.enemyCode,
    enemyRole: enemy.role,
    spineAsset: enemy.spineAsset ?? null,
    scaleProfile: enemy.scaleProfile ?? (role === 'boss' ? 'BOSS' : 'DEFAULT'),
    enemyBaseHp: enemy.baseHp ?? null,
    enemyBaseAttack: enemy.baseAttack ?? null,
    enemyBaseDefense: enemy.baseDefense ?? null,
    monsterSkinAsset: enemy.skinAsset ?? null,
    monsterType: enemy.monsterType ?? null,
    monsterBoss: enemy.boss === true,
    monsterDisplayScale: enemy.displayScale ?? null,
  };
}

function fillUnits(units: BattlePresentationUnitSnapshot[], side: BattlePresentationUnitSide): BattlePresentationUnitSnapshot[] {
  const result = units.slice(0, 5);
  const empty = side === 'ally' ? EMPTY_ALLY : EMPTY_ENEMY;
  while (result.length < 5) {
    result.push({
      ...empty,
      unitKey: `${side}-empty-${result.length}`,
      side,
      slot: result.length,
    });
  }
  return result;
}

function classifyHeroRole(heroClass: string | null | undefined): BattlePresentationUnitRole {
  const value = (heroClass || '').toLowerCase();
  // 远程职业判定需与 screenshot 验收脚本的 isBackRoleHero 对齐：法师/辅助/射手/弓手等留在后排放弹道，
  // 只有战士/刺客/坦克等近战职业才走 melee_move 跑到目标面前。早期遗漏 marksman/射手 会让射手冲过去肉搏。
  if (
    value.includes('mage') || value.includes('archer') || value.includes('marksman') || value.includes('gunner') || value.includes('ranger')
    || value.includes('support') || value.includes('priest')
    || value.includes('法') || value.includes('弓') || value.includes('射') || value.includes('牧') || value.includes('辅') || value.includes('远程')
  ) {
    return 'back';
  }
  return 'front';
}

function classifyEnemyRole(role: string | null | undefined, index: number, enemyCode?: string | null): BattlePresentationUnitRole {
  const value = `${role || ''} ${enemyCode || ''}`.toLowerCase();
  if (value.includes('boss') || value.includes('首领') || value.includes('领主')) {
    return 'boss';
  }
  if (index === 0 && (value.includes('elite') || value.includes('精英'))) {
    return 'boss';
  }
  return value.includes('mage') || value.includes('archer') || value.includes('caster') || value.includes('priest') || value.includes('witch')
    || value.includes('法') || value.includes('魔') || value.includes('术') || value.includes('弓') || value.includes('射')
    || value.includes('辅') || value.includes('后排') || value.includes('远程')
    ? 'back'
    : 'front';
}

function resolveHeroScaleProfile(rarity: string | null | undefined): string {
  const value = (rarity || '').trim().toUpperCase();
  return value === 'UR' || value === 'SSR' || value === 'SR' || value === 'R' ? value : 'DEFAULT';
}

function buildUnitSnapshotKey(start: PlayerBattleStartVO | null, allies: BattlePresentationUnitSnapshot[], enemies: BattlePresentationUnitSnapshot[]): string {
  const battleKey = `${start?.serverSeed || 'pending'}:${start?.battleNo || 'pending'}`;
  const unitKey = [...allies, ...enemies]
    .map((unit) => `${unit.side}:${unit.unitKey}:${unit.level}:${unit.power}:${unit.role}`)
    .join('|');
  return `${battleKey}:${unitKey}`;
}

function safeName(name: string | null | undefined, fallback: string): string {
  const value = (name || '').trim();
  return value || fallback;
}

function formatInteger(value: number | null | undefined): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return numeric.toLocaleString('en-US');
}
