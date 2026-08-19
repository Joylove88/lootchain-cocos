import type { BattlePresentationSnapshot, BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import type { BattlePresentationTimeline } from './LobbyBattlePresentationTimeline';
import { resolveBattleHeroSkillProfile, resolveEnergyShieldHpRatio, resolveSkillTriggerChance, resolveUnlockedPassiveCount, type BattleHeroSkillEffectType } from './LobbyBattleHeroSkillConfig';

export type BattleReplayMovementKind = 'approach' | 'stay';
export type BattleReplayActionKind = 'melee' | 'ranged';

export interface BattleReplayUnitState {
  unitKey: string;
  side: 'ally' | 'enemy';
  maxHp: number;
  initialHp: number;
  currentHp: number;
  stats: BattleReplayDerivedAttributes;
  dead: boolean;
  deadAtMs: number | null;
  // 能量护盾(策划):受击时先扣盾再扣血。maxShield=授予时的护盾上限,shield=当前剩余;
  // shieldKind 区分单体('single',坦克自护)/全体('team',辅助群护),表现层据此上色。
  maxShield: number;
  shield: number;
  shieldKind: 'single' | 'team' | null;
  // 硬控(冻结/眩晕):frozenUntilMs 之前该单位跳过出手;frozenKind 供表现层出图标/飘字。
  frozenUntilMs: number;
  frozenKind: 'freeze' | 'stun' | null;
}

export interface BattleReplayDerivedAttributes {
  maxHp: number;
  attack: number;
  defense: number;
  evasionRate: number;
  damageReduction: number;
  critRate: number;
  critDamage: number;
}

export interface BattleReplayHitEvent {
  hitKey: string;
  eventSeq: number;
  actionSeq: number;
  timeMs: number;
  actorKey: string;
  targetKey: string;
  displayValue: string;
  amount: number;
  hpBefore: number;
  hpAfter: number;
  evaded: boolean;
  critical: boolean;
  killed: boolean;
  // 职业克制命中(战士→刺客→远程→战士,+30%),表现层据此显示"克制"标识。
  countered: boolean;
  // 连击:同一次出手的第几段(0基)/总段数;>1 段时表现层显示"连击"标识,每段单独飘字。
  comboIndex: number;
  comboCount: number;
  // 能量护盾:本次受击前/后目标剩余护盾,HP 状态层据此把护盾条随时间刷新(先扣盾再扣血)。
  shieldBefore: number;
  shieldAfter: number;
  // 真伤穿透(概率触发技能):本次命中无视防御,表现层显示"穿透"高亮飘字。
  pierced: boolean;
  // 吸血:本次命中回给攻击者(actorKey)的血量;反弹:本次受击反给攻击者的血量伤害。0=未触发。
  lifestealHeal: number;
  reflectDamage: number;
  // 硬控:本次命中把目标冻结/眩晕(概率触发,攻击者技能);null=未触发。表现层据此出"冻结/眩晕"飘字。
  frozeTarget: 'freeze' | 'stun' | null;
  // 硬控结束的绝对时间(仅本命中新施加控制时>0);HP 状态层据此按播放时间算"当前是否被控",给头顶挂持续图标。
  frozeUntilMs: number;
  // 溅射追伤:此 hit 是主命中溅射到另一个敌人的追加段(概率触发,攻击者技能),表现层显示"溅射"飘字。
  splashHit: boolean;
  // 斩杀(装备特级词条 execute):目标血量落入处决线以下时本次命中直接击杀,表现层显示"斩杀"飘字。
  executed: boolean;
  // 破防加伤(doc 28):本次命中落在 BOSS 节奏性破防窗口内,伤害已 ×2,表现层飘"破防"。
  breakBonus: boolean;
}

export interface BattleReplayAction {
  seq: number;
  sourceEventSeq: number;
  round: number;
  startMs: number;
  hitMs: number;
  endMs: number;
  actor: BattlePresentationUnitSnapshot;
  primaryTarget: BattlePresentationUnitSnapshot;
  targetKeys: string[];
  actionKind: BattleReplayActionKind;
  movementKind: BattleReplayMovementKind;
  castMs: number;
  approachMs: number;
  recoverMs: number;
  hitEvents: BattleReplayHitEvent[];
  // BOSS 读条动作(doc 28):无 hitEvents,蓄力伤害由表现层叠加(便于"被打断即无伤")。
  bossCast?: boolean;
}

// BOSS 读条(doc 28):startMs 起读条,hitMs 读满放招;targetKeys=读满时刻存活的我方;hpRatio=各目标当前生命损失比例。
export interface BattleReplayBossCast {
  actionSeq: number;
  bossKey: string;
  startMs: number;
  hitMs: number;
  targetKeys: string[];
  hpRatio: number;
  skillName: string;
}

// BOSS 节奏性破防窗口(doc 28):窗口内对 BOSS 的命中 ×2(sim 内结算)。
export interface BattleReplayBreakWindow {
  startMs: number;
  endMs: number;
}

export interface BattleReplay {
  replayKey: string;
  durationMs: number;
  battleEndMs: number;
  victory: boolean;
  units: Map<string, BattleReplayUnitState>;
  actions: BattleReplayAction[];
  /** 输出试炼(限时副本难度Ⅲ):BOSS 巨血打不死,时间到即成功=我方存活即胜;演出用厚血条+伤害累计。 */
  trial: boolean;
  /** 战斗节奏点(doc 28):BOSS 单位 key(无 BOSS 为 null)、读条列表、节奏性破防窗口。 */
  bossKey: string | null;
  bossCasts: BattleReplayBossCast[];
  breakWindows: BattleReplayBreakWindow[];
}

// 战斗节奏点常量(doc 28)
export const BATTLE_BOSS_CAST_FIRST_DELAY_MS = 7_000;
export const BATTLE_BOSS_CAST_INTERVAL_MS = 12_000;
// 输出试炼节奏更密(视频验收:弱队 14s 全灭只体验到一次读条):首次 5s、间隔 10s。
export const BATTLE_TRIAL_BOSS_CAST_FIRST_DELAY_MS = 5_000;
export const BATTLE_TRIAL_BOSS_CAST_INTERVAL_MS = 10_000;
export const BATTLE_BOSS_CAST_MS = 2_400;
export const BATTLE_BOSS_CAST_HP_RATIO = 0.4;
export const BATTLE_BOSS_CAST_SKILL_NAME = '灭世咆哮';
export const BATTLE_BREAK_FIRST_DELAY_MS = 15_000;
export const BATTLE_BREAK_INTERVAL_MS = 20_000;
export const BATTLE_BREAK_WINDOW_MS = 3_500;
export const BATTLE_BREAK_DAMAGE_MULTIPLIER = 2;
/** 打断触发的破防时长(表现层叠加)。 */
export const BATTLE_INTERRUPT_BREAK_MS = 4_000;
/** 合击连锁:两名不同英雄大招间隔 ≤ 该值,第二发 ×1.5。 */
export const BATTLE_ULT_CHAIN_WINDOW_MS = 1_500;
export const BATTLE_ULT_CHAIN_MULTIPLIER = 1.5;

export function isBattleReplayBossBrokenAt(replay: BattleReplay, timeMs: number): boolean {
  return replay.breakWindows.some((window) => timeMs >= window.startMs && timeMs < window.endMs);
}

// 输出试炼关卡:DAILY_{THEME}_3(docs/27 v3)。BOSS 拼输出,时间到即成功。
export function isDailyTrialStageCode(stageCode: string): boolean {
  return /^DAILY_[A-Z]+_3$/i.test((stageCode || '').trim());
}

// 输出试炼 BOSS 血量放大倍数:让 BOSS 在整段演出内基本打不死,血条掉多少≈你的相对输出。
const TRIAL_BOSS_HP_FACTOR = 8;

interface BattleReplayStatContext {
  allyTotalPower: number;
  enemyTotalPower: number;
  stageRank: number;
  monsterDurabilityMultiplier: number;
}

interface BattleReplayDamageResult {
  amount: number;
  hpAfter: number;
  critical: boolean;
  didEvade: boolean;
  countered: boolean;
  shieldBefore: number;
  shieldAfter: number;
  pierced: boolean;
  lifestealHeal: number;
  reflectDamage: number;
}

// 职业克制环:近战(战士/坦克)克刺客,刺客克远程(法师/射手),远程克近战;辅助中立。
// 怪物没有职业字段时按站位近似:后排=远程系,前排/boss=近战系——玩家可以按敌方站位针对性配队。
export type BattleReplayCounterClass = 'melee' | 'assassin' | 'ranged' | 'support';
// 职业克制增伤(策划 2026-07-10):+10% 即可。之前 +30% 会让克制的暴击普攻叠得比大招还高。
const BATTLE_REPLAY_COUNTER_BONUS = 1.1;
// 连击(策划 2026-07-09 定稿):连击/斩杀属「非持续性」属性,**不放英雄技能**,后期走装备/宝石词条。
// 多段命中的机制(createSyntheticBattleReplayHit 的 combo 循环 + "连击" 飘字)保留待装备/宝石接入;
// 当前无来源 → 一律单发。等装备系统做出来后,把段数改由装备词条派生即可。
const BATTLE_REPLAY_COMBO_STEP_MS = 200;
// 连击来源=装备特级词条(装备一期,如金武器 combo count=2);无词条=单发。
// 每段伤害=总倍率/段数(3段总1.26×/2段总1.14×),多段合计略高于单发,与旧连击机制口径一致。
function resolveBattleReplayComboProfile(unit: BattlePresentationUnitSnapshot): { count: number; perHitScale: number } {
  const combo = (unit.equipEffects ?? []).find((effect) => effect.type === 'combo' && (effect.count ?? 0) >= 2);
  if (!combo) {
    return { count: 1, perHitScale: 1 };
  }
  const count = Math.min(3, Math.max(2, Math.trunc(combo.count ?? 2)));
  const totalScale = count >= 3 ? 1.26 : 1.14;
  return { count, perHitScale: totalScale / count };
}

export function resolveBattleReplayCounterClass(unit: BattlePresentationUnitSnapshot): BattleReplayCounterClass {
  const heroClass = (unit.heroClass || '').toLowerCase();
  if (heroClass) {
    if (heroClass.includes('刺') || heroClass.includes('assassin')) {
      return 'assassin';
    }
    if (
      heroClass.includes('法') || heroClass.includes('射') || heroClass.includes('弓') || heroClass.includes('远程')
      || heroClass.includes('mage') || heroClass.includes('marksman') || heroClass.includes('archer') || heroClass.includes('ranger')
    ) {
      return 'ranged';
    }
    if (heroClass.includes('辅') || heroClass.includes('牧') || heroClass.includes('support') || heroClass.includes('priest')) {
      return 'support';
    }
    return 'melee';
  }
  return unit.role === 'back' ? 'ranged' : 'melee';
}

export function resolveBattleReplayCounterMultiplier(
  actor: BattlePresentationUnitSnapshot,
  target: BattlePresentationUnitSnapshot,
): number {
  const actorClass = resolveBattleReplayCounterClass(actor);
  const targetClass = resolveBattleReplayCounterClass(target);
  if (actorClass === 'melee' && targetClass === 'assassin') {
    return BATTLE_REPLAY_COUNTER_BONUS;
  }
  if (actorClass === 'assassin' && targetClass === 'ranged') {
    return BATTLE_REPLAY_COUNTER_BONUS;
  }
  if (actorClass === 'ranged' && targetClass === 'melee') {
    return BATTLE_REPLAY_COUNTER_BONUS;
  }
  return 1;
}

const BATTLE_REPLAY_MAX_ACTIONS = 44;
// 输出试炼=连续战斗:动作持续生成直到打满 90 秒窗口(或我方全灭),全程无人冷场;
// 240 为安全上限(560ms 节奏 90 秒≈160 动作)。常规副本保持 44(数值标定基于它,不能动)。
const BATTLE_REPLAY_TRIAL_WINDOW_MS = 90_000;
const BATTLE_REPLAY_TRIAL_MAX_ACTIONS = 240;
const BATTLE_REPLAY_ACTION_CADENCE_MS = 560;
const BATTLE_REPLAY_MELEE_APPROACH_MS = 980;
const BATTLE_REPLAY_MELEE_CAST_MS = 460;
const BATTLE_REPLAY_MELEE_RECOVER_MS = 500;
const BATTLE_REPLAY_RANGED_CAST_MS = 560;
const BATTLE_REPLAY_RANGED_RECOVER_MS = 460;
const BATTLE_REPLAY_RESULT_PADDING_MS = 1_220;
const BATTLE_REPLAY_SYNTHETIC_EVENT_SEQ_BASE = 20_000;

// 2026-08-04:单槽引用 memo——本函数是完整确定性战斗 sim,此前每帧被 VisualCompletion/
// ActionPresentation/Hp 各自调用至少 3 次;snapshot/timeline 引用不变即直接复用结果。
let replayMemo: { snapshot: BattlePresentationSnapshot; timeline: BattlePresentationTimeline; result: BattleReplay } | null = null;

export function resolveBattleReplay(snapshot: BattlePresentationSnapshot, timeline: BattlePresentationTimeline): BattleReplay {
  if (replayMemo && replayMemo.snapshot === snapshot && replayMemo.timeline === timeline) {
    return replayMemo.result;
  }
  const result = buildBattleReplay(snapshot, timeline);
  replayMemo = { snapshot, timeline, result };
  return result;
}

function buildBattleReplay(snapshot: BattlePresentationSnapshot, timeline: BattlePresentationTimeline): BattleReplay {
  const trial = isDailyTrialStageCode(snapshot.stageCode);
  const unitByKey = createBattleReplayUnitMap(snapshot);
  const statContext = resolveBattleReplayStatContext(snapshot, unitByKey);
  const units = createBattleReplayInitialUnitStates(unitByKey, statContext);
  if (trial) {
    // 输出试炼:把敌方 BOSS 血量放大到基本打不死,整段演出拼总输出;血条掉多少≈相对输出。
    inflateTrialBossHp(unitByKey, units);
  }
  // 战斗节奏点(doc 28):BOSS(试炼=BOSS或血最厚敌人;常规=显式 role boss)读条 + 节奏性破防窗口。
  const bossKey = resolveBattleReplayBossKey(unitByKey, units, trial);
  const firstActionMs = resolveBattleReplayFirstActionMs(timeline);
  const breakWindows: BattleReplayBreakWindow[] = [];
  if (bossKey) {
    const horizonMs = firstActionMs + (trial ? BATTLE_REPLAY_TRIAL_WINDOW_MS : 60_000);
    for (let start = firstActionMs + BATTLE_BREAK_FIRST_DELAY_MS; start < horizonMs; start += BATTLE_BREAK_INTERVAL_MS) {
      breakWindows.push({ startMs: start, endMs: start + BATTLE_BREAK_WINDOW_MS });
    }
  }
  const bossCasts: BattleReplayBossCast[] = [];
  const actions = resolveBattleReplayCombatActions(snapshot, timeline, unitByKey, units, trial, bossKey, breakWindows, bossCasts);
  const battleEndMs = resolveBattleReplayBattleEndMs(timeline, actions);

  return {
    replayKey: `${trial ? 'trial:' : ''}${timeline.timelineKey}:${snapshot.unitSnapshotKey}`,
    durationMs: battleEndMs,
    battleEndMs,
    // 输出试炼=拼输出,永远算成功(时间到/全灭都算完成),死亡也计入输出榜、按输出分发档位奖励;
    // 常规副本=敌全灭且我方存活才胜。
    victory: trial ? true : hasLivingSide(units, 'ally') && !hasLivingSide(units, 'enemy'),
    units,
    actions,
    trial,
    bossKey,
    bossCasts,
    breakWindows,
  };
}

// BOSS 单位:显式 role='boss';输出试炼无显式 BOSS 时取血最厚敌人(与 inflateTrialBossHp 同口径)。
function resolveBattleReplayBossKey(
  unitByKey: Map<string, BattlePresentationUnitSnapshot>,
  units: Map<string, BattleReplayUnitState>,
  trial: boolean,
): string | null {
  let bossKey: string | null = null;
  unitByKey.forEach((snap, key) => {
    if (snap.side === 'enemy' && snap.role === 'boss') {
      bossKey = key;
    }
  });
  if (!bossKey && trial) {
    let best = -1;
    units.forEach((state, key) => {
      const snap = unitByKey.get(key);
      if (snap?.side === 'enemy' && state.maxHp > best) {
        best = state.maxHp;
        bossKey = key;
      }
    });
  }
  return bossKey;
}

// 输出试炼:把敌方 BOSS(role='boss',无则取血最厚的敌人)血量×factor,并同步 initial/current,让其在整段演出内存活。
function inflateTrialBossHp(
  unitByKey: Map<string, BattlePresentationUnitSnapshot>,
  units: Map<string, BattleReplayUnitState>,
): void {
  let bossKey: string | null = null;
  unitByKey.forEach((snap, key) => {
    if (snap.side !== 'enemy') {
      return;
    }
    if (snap.role === 'boss') {
      bossKey = key;
    }
  });
  if (!bossKey) {
    // 无显式 BOSS:取血量最厚的敌人当 BOSS。
    let best = -1;
    units.forEach((state, key) => {
      const snap = unitByKey.get(key);
      if (snap?.side === 'enemy' && state.maxHp > best) {
        best = state.maxHp;
        bossKey = key;
      }
    });
  }
  if (!bossKey) {
    return;
  }
  const boss = units.get(bossKey);
  if (!boss) {
    return;
  }
  const inflated = Math.max(1, Math.round(boss.maxHp * TRIAL_BOSS_HP_FACTOR));
  boss.maxHp = inflated;
  boss.initialHp = inflated;
  boss.currentHp = inflated;
}

function createBattleReplayUnitMap(snapshot: BattlePresentationSnapshot): Map<string, BattlePresentationUnitSnapshot> {
  const units = new Map<string, BattlePresentationUnitSnapshot>();
  [...snapshot.allies, ...snapshot.enemies].forEach((unit) => {
    if (unit.power <= 0 || unit.unitKey.includes('empty')) {
      return;
    }
    units.set(unit.unitKey, unit);
  });
  return units;
}

function createBattleReplayInitialUnitStates(
  unitByKey: Map<string, BattlePresentationUnitSnapshot>,
  context: BattleReplayStatContext,
): Map<string, BattleReplayUnitState> {
  const units = new Map<string, BattleReplayUnitState>();
  unitByKey.forEach((unit) => {
    const stats = resolveBattleReplayDerivedAttributes(unit, context);
    // 属性加成类被动(atkUp/hpUp,常驻):升星解锁后开场直接入面板,与触发型被动共用同一门禁。
    const passiveBuffs = resolveBattleReplaySkillEffects(unit);
    const atkUpMag = passiveBuffs.find((effect) => effect.type === 'atkUp')?.magnitude ?? 0;
    const hpUpMag = passiveBuffs.find((effect) => effect.type === 'hpUp')?.magnitude ?? 0;
    if (atkUpMag > 0) {
      stats.attack = Math.max(1, Math.round(stats.attack * (1 + atkUpMag)));
    }
    if (hpUpMag > 0) {
      stats.maxHp = Math.max(1, Math.round(stats.maxHp * (1 + hpUpMag)));
    }
    const maxHp = stats.maxHp;
    units.set(unit.unitKey, {
      unitKey: unit.unitKey,
      side: unit.side,
      maxHp,
      initialHp: maxHp,
      currentHp: maxHp,
      stats,
      dead: false,
      deadAtMs: null,
      maxShield: 0,
      shield: 0,
      shieldKind: null,
      frozenUntilMs: 0,
      frozenKind: null,
    });
  });
  grantBattleReplayInitialShields(unitByKey, units);
  return units;
}

// 能量护盾授予(策划原则:护盾是「技能/装备」赋予的特殊属性,不由职业硬触发):
//  · 逐个我方英雄读自己的技能表(hero_skill_config 占位),有护盾技能才叠盾;
//  · 单体护盾=只护施法者自己('single',偏青);全体护盾=开场给全队各叠一层('team',偏蓝);
//  · 同一单位被多个护盾技能覆盖时取最高的一层(避免叠满),盾量=受益者最大血量 × 技能 hpRatio。
// 受击先扣盾再扣血。表里没有护盾技能的英雄 → 无盾(等技能/装备做出来再补)。
function grantBattleReplayInitialShields(
  unitByKey: Map<string, BattlePresentationUnitSnapshot>,
  units: Map<string, BattleReplayUnitState>,
): void {
  const allies = [...unitByKey.values()].filter((unit) => unit.side === 'ally');
  if (allies.length === 0) {
    return;
  }
  const grants = new Map<string, { amount: number; kind: 'single' | 'team' }>();
  const applyGrant = (unitKey: string, amount: number, kind: 'single' | 'team') => {
    const current = grants.get(unitKey);
    if (!current || amount > current.amount) {
      grants.set(unitKey, { amount, kind });
    }
  };
  allies.forEach((caster) => {
    const scope = resolveBattleReplayShieldScope(caster);
    if (!scope) {
      return;
    }
    // 护盾是通用百分比属性:强度按「施法者稀有度」缩放(UR>SSR>SR>R),再乘各受益者自己的 maxHp。
    const hpRatio = resolveEnergyShieldHpRatio(scope, caster.rarity);
    const beneficiaries = scope === 'team' ? allies : [caster];
    beneficiaries.forEach((beneficiary) => {
      const state = units.get(beneficiary.unitKey);
      if (!state) {
        return;
      }
      applyGrant(beneficiary.unitKey, Math.max(1, Math.round(state.maxHp * hpRatio)), scope);
    });
  });
  grants.forEach((grant, unitKey) => {
    const state = units.get(unitKey);
    if (!state) {
      return;
    }
    state.maxShield = grant.amount;
    state.shield = grant.amount;
    state.shieldKind = grant.kind;
  });
}

function resolveBattleReplayCombatActions(
  snapshot: BattlePresentationSnapshot,
  timeline: BattlePresentationTimeline,
  unitByKey: Map<string, BattlePresentationUnitSnapshot>,
  units: Map<string, BattleReplayUnitState>,
  trial = false,
  bossKey: string | null = null,
  breakWindows: BattleReplayBreakWindow[] = [],
  bossCasts: BattleReplayBossCast[] = [],
): BattleReplayAction[] {
  const combatOrder = resolveBattleReplayCombatOrder(unitByKey);
  const isBrokenAt = (timeMs: number): boolean => breakWindows.some((window) => timeMs >= window.startMs && timeMs < window.endMs);
  const bossCastFirstDelayMs = trial ? BATTLE_TRIAL_BOSS_CAST_FIRST_DELAY_MS : BATTLE_BOSS_CAST_FIRST_DELAY_MS;
  const bossCastIntervalMs = trial ? BATTLE_TRIAL_BOSS_CAST_INTERVAL_MS : BATTLE_BOSS_CAST_INTERVAL_MS;
  let nextBossCastMs = bossKey ? resolveBattleReplayFirstActionMs(timeline) + bossCastFirstDelayMs : Number.POSITIVE_INFINITY;
  const seed = createBattleReplaySeed(`${timeline.timelineKey}:${snapshot.unitSnapshotKey}`);
  const random = nextBattleReplayRandom(seed);
  const firstActionMs = resolveBattleReplayFirstActionMs(timeline);
  const firstAllyCycle = combatOrder
    .filter((unit) => unit.side === 'ally' && isBattleReplayUnitAlive(units, unit.unitKey))
    .map((unit) => unit.unitKey);
  const cursors: Record<'ally' | 'enemy', number> = { ally: 0, enemy: 0 };
  const actions: BattleReplayAction[] = [];
  // 配对交战(参考 AFK 式对位):每个单位锁定自己的对位敌人,配对目标存活期间不换目标;
  // 目标阵亡后重配到"被配对人数最少"的存活目标。多组同时分散交战,不再全员围殴同一个。
  const pairAssignments = new Map<string, string>();
  let nextActionStartMs = firstActionMs;
  // 硬控空过保护:被冻结/眩晕导致无人可出手时,推进时间等待解控;连续空过过多则收尾,防止死循环。
  let consecutiveSkips = 0;

  // 试炼=连续战斗:不设 44 动作硬限,持续出手直到打满 90 秒窗口或一方全灭——战斗全程"活的",不再是有限回放。
  const maxActions = trial ? BATTLE_REPLAY_TRIAL_MAX_ACTIONS : BATTLE_REPLAY_MAX_ACTIONS;
  const trialWindowEndMs = firstActionMs + BATTLE_REPLAY_TRIAL_WINDOW_MS;
  while (
    actions.length < maxActions
    && (!trial || nextActionStartMs < trialWindowEndMs)
    && hasLivingSide(units, 'ally')
    && hasLivingSide(units, 'enemy')
  ) {
    const side: 'ally' | 'enemy' = resolveBattleReplayActionSide(actions.length, units, firstAllyCycle);
    const actor = selectBattleReplayActor(combatOrder, units, side, cursors, side === 'ally' ? firstAllyCycle : null, nextActionStartMs);
    if (!actor) {
      // 该出手方全员被控(或无可用单位):推进时间等待解控,累计过多则跳出。
      cursors[side] += 1;
      nextActionStartMs += BATTLE_REPLAY_ACTION_CADENCE_MS;
      consecutiveSkips += 1;
      if (consecutiveSkips > 10) {
        break;
      }
      continue;
    }
    consecutiveSkips = 0;
    const actionIndex = actions.length;
    // BOSS 读条(doc 28):到点且 BOSS 轮到出手 → 生成读条动作(无命中,蓄力伤害由表现层叠加,可被大招打断)。
    if (bossKey && actor.unitKey === bossKey && nextActionStartMs >= nextBossCastMs) {
      const startMs = nextActionStartMs;
      const hitMs = startMs + BATTLE_BOSS_CAST_MS;
      const eventSeq = BATTLE_REPLAY_SYNTHETIC_EVENT_SEQ_BASE + actionIndex * 3;
      const livingAllies = combatOrder.filter((unit) => unit.side === 'ally' && isBattleReplayUnitAlive(units, unit.unitKey));
      const castTarget = livingAllies[0] ?? null;
      if (castTarget) {
        actions.push({
          seq: actionIndex,
          sourceEventSeq: eventSeq,
          round: Math.floor(actionIndex / Math.max(1, snapshot.allies.length)) + 1,
          startMs,
          hitMs,
          endMs: hitMs + 600,
          actor,
          primaryTarget: castTarget,
          targetKeys: livingAllies.map((unit) => unit.unitKey),
          actionKind: 'ranged',
          movementKind: 'stay',
          castMs: BATTLE_BOSS_CAST_MS,
          approachMs: 0,
          recoverMs: 600,
          hitEvents: [],
          bossCast: true,
        });
        bossCasts.push({
          actionSeq: actionIndex,
          bossKey,
          startMs,
          hitMs,
          targetKeys: livingAllies.map((unit) => unit.unitKey),
          hpRatio: BATTLE_BOSS_CAST_HP_RATIO,
          skillName: BATTLE_BOSS_CAST_SKILL_NAME,
        });
        nextBossCastMs = startMs + bossCastIntervalMs;
        nextActionStartMs = hitMs + 400;
        continue;
      }
    }
    const target = selectBattleReplayTarget(actor, combatOrder, units, random, actionIndex, pairAssignments);
    if (!target) {
      break;
    }

    const movementKind: BattleReplayMovementKind = actor.role === 'back' ? 'stay' : 'approach';
    const actionKind: BattleReplayActionKind = movementKind === 'stay' ? 'ranged' : 'melee';
    const castMs = actionKind === 'ranged' ? BATTLE_REPLAY_RANGED_CAST_MS : BATTLE_REPLAY_MELEE_CAST_MS;
    const approachMs = actionKind === 'ranged' ? 0 : BATTLE_REPLAY_MELEE_APPROACH_MS;
    const recoverMs = actionKind === 'ranged' ? BATTLE_REPLAY_RANGED_RECOVER_MS : BATTLE_REPLAY_MELEE_RECOVER_MS;
    const startMs = nextActionStartMs;
    const hitMs = startMs + resolveBattleReplayDefaultHitDelayMs(actionKind);
    const eventSeq = BATTLE_REPLAY_SYNTHETIC_EVENT_SEQ_BASE + actionIndex * 3;
    // 连击:按职业分段,每段依次结算(顺序扣血,可跨段击杀),各段错峰飘字。
    const combo = resolveBattleReplayComboProfile(actor);
    const hitEvents: BattleReplayHitEvent[] = [];
    for (let ci = 0; ci < combo.count; ci += 1) {
      const comboHitMs = hitMs + ci * BATTLE_REPLAY_COMBO_STEP_MS;
      // 节奏性破防窗口(doc 28):命中 BOSS 时伤害 ×2 并打标,表现层飘"破防"。
      const breakBonus = !!bossKey && target.unitKey === bossKey && actor.side === 'ally' && isBrokenAt(comboHitMs);
      const comboHit = createSyntheticBattleReplayHit(
        actionIndex,
        eventSeq + ci,
        comboHitMs,
        actor,
        target,
        units,
        random,
        firstAllyCycle,
        combo.perHitScale * (breakBonus ? BATTLE_BREAK_DAMAGE_MULTIPLIER : 1),
        ci,
        combo.count,
      );
      comboHit.breakBonus = breakBonus && !comboHit.evaded && comboHit.amount > 0;
      hitEvents.push(comboHit);
    }
    // 溅射(概率触发,攻击者技能):只在主动作 roll 一次(不放 createSynthetic 内,避免溅射递归),
    // 命中就对另一个存活敌人追加一段 magnitude 比例伤害的 hit(错峰在末段之后),表现层标"溅射"。
    if (actor.side === 'ally' && target.side === 'enemy') {
      const splashMag = rollBattleReplaySkillMagnitude(actor, 'splash', random);
      if (splashMag > 0) {
        const splashTarget = pickBattleReplaySplashTarget(combatOrder, units, target);
        if (splashTarget) {
          hitEvents.push(createSyntheticBattleReplayHit(
            actionIndex,
            eventSeq + combo.count,
            hitMs + combo.count * BATTLE_REPLAY_COMBO_STEP_MS + 120,
            actor,
            splashTarget,
            units,
            random,
            firstAllyCycle,
            splashMag,
            0,
            1,
            true,
          ));
        }
      }
    }
    const lastHit = hitEvents[hitEvents.length - 1];
    const endMs = Math.max(startMs + approachMs + castMs + recoverMs, lastHit.timeMs + recoverMs);

    actions.push({
      seq: actionIndex,
      sourceEventSeq: eventSeq,
      round: Math.floor(actionIndex / Math.max(1, snapshot.allies.length)) + 1,
      startMs,
      hitMs,
      endMs,
      actor,
      primaryTarget: target,
      targetKeys: [target.unitKey],
      actionKind,
      movementKind,
      castMs,
      approachMs,
      recoverMs,
      hitEvents,
    });

    if (actor.side === 'ally') {
      removeBattleReplayRequiredAlly(firstAllyCycle, actor.unitKey);
    }
    nextActionStartMs = startMs + resolveBattleReplayActionCadenceMs(actionKind, actor, actionIndex);
  }

  return actions;
}

function resolveBattleReplayCombatOrder(unitByKey: Map<string, BattlePresentationUnitSnapshot>): BattlePresentationUnitSnapshot[] {
  return [...unitByKey.values()].sort((a, b) => {
    if (a.side !== b.side) {
      return a.side === 'ally' ? -1 : 1;
    }
    const roleA = resolveBattleReplayRolePriority(a);
    const roleB = resolveBattleReplayRolePriority(b);
    if (roleA !== roleB) {
      return roleA - roleB;
    }
    const powerDelta = (b.power || 0) - (a.power || 0);
    if (powerDelta !== 0) {
      return powerDelta;
    }
    return a.unitKey.localeCompare(b.unitKey);
  });
}

function resolveBattleReplayActionSide(
  actionCount: number,
  units: Map<string, BattleReplayUnitState>,
  firstAllyCycle: string[],
): 'ally' | 'enemy' {
  if (!hasLivingSide(units, 'enemy')) {
    return 'ally';
  }
  if (!hasLivingSide(units, 'ally')) {
    return 'enemy';
  }
  const shouldCounter = actionCount > 0 && actionCount % 3 === 2;
  if (shouldCounter) {
    return 'enemy';
  }
  return firstAllyCycle.length > 0 || actionCount % 4 !== 3 ? 'ally' : 'enemy';
}

function selectBattleReplayActor(
  combatOrder: BattlePresentationUnitSnapshot[],
  units: Map<string, BattleReplayUnitState>,
  side: 'ally' | 'enemy',
  cursors: Record<'ally' | 'enemy', number>,
  requiredKeys: string[] | null,
  nowMs: number,
): BattlePresentationUnitSnapshot | null {
  const candidates = combatOrder.filter((unit) => {
    if (unit.side !== side || !isBattleReplayUnitAlive(units, unit.unitKey)) {
      return false;
    }
    // 硬控:冻结/眩晕未结束的单位跳过出手(被排除出候选)。
    if ((units.get(unit.unitKey)?.frozenUntilMs ?? 0) > nowMs) {
      return false;
    }
    return !requiredKeys || requiredKeys.length <= 0 || requiredKeys.includes(unit.unitKey);
  });
  if (candidates.length <= 0) {
    return null;
  }
  const index = cursors[side] % candidates.length;
  cursors[side] += 1;
  return candidates[index] ?? null;
}

function selectBattleReplayTarget(
  actor: BattlePresentationUnitSnapshot,
  combatOrder: BattlePresentationUnitSnapshot[],
  units: Map<string, BattleReplayUnitState>,
  random: () => number,
  actionIndex: number,
  pairAssignments: Map<string, string>,
): BattlePresentationUnitSnapshot | null {
  void random;
  const targetSide = actor.side === 'ally' ? 'enemy' : 'ally';
  const livingTargetsAll = combatOrder
    .filter((unit) => unit.side === targetSide && isBattleReplayUnitAlive(units, unit.unitKey))
    .sort((a, b) => {
      return resolveBattleReplayRolePriority(a) - resolveBattleReplayRolePriority(b);
    });
  // 刺客定位:优先切入敌方后排(法师/射手),配合"刺客克远程"形成职业闭环——玩家用坦克保护后排即是应对。
  const livingBackTargets = livingTargetsAll.filter((unit) => unit.role === 'back');
  const livingCounterTargets = resolveBattleReplayCounterClass(actor) === 'assassin' && livingBackTargets.length > 0
    ? livingBackTargets
    : livingTargetsAll;
  // 配对交战:锁定自己的对位目标(存活时单目标),阵亡后由 helper 重配到负载最少的存活目标。
  const pairedTarget = resolveBattleReplayPairedTarget(actor, livingCounterTargets, pairAssignments);
  const livingTargets = pairedTarget ? [pairedTarget] : livingCounterTargets;
  if (livingTargets.length <= 0) {
    return null;
  }
  const preferredTargets = actor.role === 'back'
    ? livingTargets
    : resolveBattleReplayMeleePreferredTargets(actor, livingTargets);
  const finishingTargets = preferredTargets
    .filter((unit) => {
      const state = units.get(unit.unitKey);
      return !!state && state.currentHp <= state.maxHp * 0.42;
    })
    .sort((a, b) => {
      if (actor.role !== 'back') {
        const slotDelta = resolveBattleReplayTargetSlotDistance(actor, a) - resolveBattleReplayTargetSlotDistance(actor, b);
        if (slotDelta !== 0) {
          return slotDelta;
        }
      }
      const stateA = units.get(a.unitKey);
      const stateB = units.get(b.unitKey);
      const ratioA = stateA ? stateA.currentHp / Math.max(1, stateA.maxHp) : 1;
      const ratioB = stateB ? stateB.currentHp / Math.max(1, stateB.maxHp) : 1;
      return ratioA - ratioB;
    });
  if (finishingTargets.length > 0) {
    return finishingTargets[0] ?? null;
  }
  const focusFront = preferredTargets.filter((unit) => unit.role !== 'back');
  const targetPool = focusFront.length > 0 ? focusFront : preferredTargets;
  if (actor.role !== 'back') {
    return targetPool[0] ?? null;
  }
  const index = Math.abs(actionIndex + createBattleReplaySeed(actor.unitKey)) % targetPool.length;
  return targetPool[index] ?? targetPool[0] ?? null;
}

// 配对目标解析:已有配对且目标存活则沿用;否则(首次出手/目标阵亡)配到"被配对人数最少"的
// 存活候选(同负载按 slot 距离、unitKey 决胜),写回配对表。全程确定性,与回放种子无关。
function resolveBattleReplayPairedTarget(
  actor: BattlePresentationUnitSnapshot,
  livingCandidates: BattlePresentationUnitSnapshot[],
  pairAssignments: Map<string, string>,
): BattlePresentationUnitSnapshot | null {
  if (livingCandidates.length <= 0) {
    return null;
  }
  const currentKey = pairAssignments.get(actor.unitKey);
  const current = currentKey ? livingCandidates.find((unit) => unit.unitKey === currentKey) : undefined;
  if (current) {
    return current;
  }
  const load = new Map<string, number>();
  for (const candidate of livingCandidates) {
    load.set(candidate.unitKey, 0);
  }
  for (const [attackerKey, targetKey] of pairAssignments) {
    if (attackerKey !== actor.unitKey && load.has(targetKey)) {
      load.set(targetKey, (load.get(targetKey) ?? 0) + 1);
    }
  }
  const next = [...livingCandidates].sort((a, b) => {
    // 互配优先:对方已经配对了我 → 优先回配成 1v1 对打,战场自然形成多组对决。
    const reciprocalA = pairAssignments.get(a.unitKey) === actor.unitKey ? 0 : 1;
    const reciprocalB = pairAssignments.get(b.unitKey) === actor.unitKey ? 0 : 1;
    if (reciprocalA !== reciprocalB) {
      return reciprocalA - reciprocalB;
    }
    const loadDelta = (load.get(a.unitKey) ?? 0) - (load.get(b.unitKey) ?? 0);
    if (loadDelta !== 0) {
      return loadDelta;
    }
    const slotDelta = Math.abs(a.slot - actor.slot) - Math.abs(b.slot - actor.slot);
    if (slotDelta !== 0) {
      return slotDelta;
    }
    return a.unitKey.localeCompare(b.unitKey);
  })[0] ?? null;
  if (next) {
    pairAssignments.set(actor.unitKey, next.unitKey);
  }
  return next;
}

function resolveBattleReplayMeleePreferredTargets(
  actor: BattlePresentationUnitSnapshot,
  livingTargets: BattlePresentationUnitSnapshot[],
): BattlePresentationUnitSnapshot[] {
  const frontTargets = livingTargets.filter((unit) => unit.role !== 'back');
  const localFrontTargets = frontTargets.filter((unit) => Math.abs(unit.slot - actor.slot) <= 1);
  const localTargets = livingTargets.filter((unit) => Math.abs(unit.slot - actor.slot) <= 1);
  const candidates = localFrontTargets.length > 0
    ? localFrontTargets
    : frontTargets.length > 0
      ? frontTargets
      : localTargets.length > 0
        ? localTargets
        : livingTargets;
  return [...candidates].sort((a, b) => {
    const slotDelta = resolveBattleReplayTargetSlotDistance(actor, a) - resolveBattleReplayTargetSlotDistance(actor, b);
    if (slotDelta !== 0) {
      return slotDelta;
    }
    const roleDelta = resolveBattleReplayRolePriority(a) - resolveBattleReplayRolePriority(b);
    if (roleDelta !== 0) {
      return roleDelta;
    }
    return a.unitKey.localeCompare(b.unitKey);
  });
}

function resolveBattleReplayTargetSlotDistance(actor: BattlePresentationUnitSnapshot, target: BattlePresentationUnitSnapshot): number {
  return Math.abs(target.slot - actor.slot);
}

function createSyntheticBattleReplayHit(
  actionSeq: number,
  eventSeq: number,
  timeMs: number,
  actor: BattlePresentationUnitSnapshot,
  target: BattlePresentationUnitSnapshot,
  units: Map<string, BattleReplayUnitState>,
  random: () => number,
  firstAllyCycle: string[],
  damageScale: number,
  comboIndex: number,
  comboCount: number,
  isSplash = false,
): BattleReplayHitEvent {
  void firstAllyCycle;
  const targetState = units.get(target.unitKey);
  if (!targetState || targetState.dead) {
    return {
      hitKey: `${actionSeq}:${eventSeq}:${actor.unitKey}->${target.unitKey}`,
      eventSeq,
      actionSeq,
      timeMs,
      actorKey: actor.unitKey,
      targetKey: target.unitKey,
      displayValue: '失效',
      amount: 0,
      hpBefore: 0,
      hpAfter: 0,
      evaded: false,
      critical: false,
      killed: false,
      countered: false,
      comboIndex,
      comboCount,
      shieldBefore: targetState?.shield ?? 0,
      shieldAfter: targetState?.shield ?? 0,
      pierced: false,
      lifestealHeal: 0,
      reflectDamage: 0,
      frozeTarget: null,
      frozeUntilMs: 0,
      splashHit: isSplash,
      executed: false,
      breakBonus: false,
    };
  }
  const hpBefore = targetState.currentHp;
  const damage = resolveBattleReplayDamageResult(actor, target, targetState, units, random, actionSeq, damageScale);
  let hpAfter = damage.hpAfter;
  let amount = damage.amount;
  // 斩杀(装备特级词条 execute,确定性非概率):我方命中后若目标血量落到处决线(maxHp×threshold,上限50%)以下,
  // 直接补足伤害击杀。闪避不触发;仅对敌方生效。
  let executed = false;
  if (!damage.didEvade && actor.side === 'ally' && target.side === 'enemy' && hpAfter > 0) {
    const executeEffect = (actor.equipEffects ?? []).find((effect) => effect.type === 'execute' && (effect.threshold ?? 0) > 0);
    const threshold = Math.min(0.5, executeEffect?.threshold ?? 0);
    if (executeEffect && hpAfter <= targetState.maxHp * threshold) {
      amount += hpAfter;
      hpAfter = 0;
      executed = true;
    }
  }
  const livingEnemiesAfterThisHit = target.side === 'enemy'
    ? countLivingSide(units, 'enemy') - (hpBefore > 0 && hpAfter <= 0 ? 1 : 0)
    : countLivingSide(units, 'enemy');
  void livingEnemiesAfterThisHit;
  targetState.currentHp = hpAfter;
  targetState.shield = damage.shieldAfter;
  targetState.dead = hpAfter <= 0;
  targetState.deadAtMs = hpAfter <= 0 ? timeMs : null;
  // 吸血回血 / 反弹反伤都作用在攻击者身上,直接改攻击者的 sim 血量(HP 状态层随命中同步)。
  if ((damage.lifestealHeal > 0 || damage.reflectDamage > 0)) {
    const attackerState = units.get(actor.unitKey);
    if (attackerState && !attackerState.dead) {
      if (damage.lifestealHeal > 0) {
        attackerState.currentHp = Math.min(attackerState.maxHp, attackerState.currentHp + damage.lifestealHeal);
      }
      if (damage.reflectDamage > 0) {
        attackerState.currentHp = Math.max(0, attackerState.currentHp - damage.reflectDamage);
        if (attackerState.currentHp <= 0) {
          attackerState.dead = true;
          attackerState.deadAtMs = timeMs;
        }
      }
    }
  }
  // 硬控(冻结/眩晕):概率触发(攻击者技能),命中未死且未处于控制中才生效——不叠控、不控尸,避免永控。
  // freeze 优先,freeze 未触发再 roll stun。frozenUntilMs 之前目标被排除出出手候选(见 selectBattleReplayActor)。
  let frozeTarget: 'freeze' | 'stun' | null = null;
  if (hpAfter > 0 && targetState.frozenUntilMs <= timeMs) {
    const freezeMag = rollBattleReplaySkillMagnitude(actor, 'freeze', random);
    const stunMag = freezeMag > 0 ? 0 : rollBattleReplaySkillMagnitude(actor, 'stun', random);
    if (freezeMag > 0) {
      frozeTarget = 'freeze';
      targetState.frozenUntilMs = timeMs + Math.max(400, Math.round(freezeMag * 1000));
      targetState.frozenKind = 'freeze';
    } else if (stunMag > 0) {
      frozeTarget = 'stun';
      targetState.frozenUntilMs = timeMs + Math.max(400, Math.round(stunMag * 1000));
      targetState.frozenKind = 'stun';
    }
  }
  return {
    hitKey: `${actionSeq}:${eventSeq}:${actor.unitKey}->${target.unitKey}`,
    eventSeq,
    actionSeq,
    timeMs,
    actorKey: actor.unitKey,
    targetKey: target.unitKey,
    displayValue: damage.didEvade ? '闪避' : `-${formatReplayNumber(amount)}`,
    amount,
    hpBefore,
    hpAfter,
    evaded: damage.didEvade,
    critical: damage.critical,
    killed: hpAfter <= 0,
    countered: damage.countered,
    comboIndex,
    comboCount,
    shieldBefore: damage.shieldBefore,
    shieldAfter: damage.shieldAfter,
    pierced: damage.pierced,
    lifestealHeal: damage.lifestealHeal,
    reflectDamage: damage.reflectDamage,
    frozeTarget,
    frozeUntilMs: frozeTarget ? targetState.frozenUntilMs : 0,
    splashHit: isSplash,
    executed,
    breakBonus: false,
  };
}

function pickBattleReplaySplashTarget(
  combatOrder: BattlePresentationUnitSnapshot[],
  units: Map<string, BattleReplayUnitState>,
  primaryTarget: BattlePresentationUnitSnapshot,
): BattlePresentationUnitSnapshot | null {
  const candidates = combatOrder.filter((unit) =>
    unit.side === 'enemy'
    && unit.unitKey !== primaryTarget.unitKey
    && isBattleReplayUnitAlive(units, unit.unitKey));
  if (candidates.length <= 0) {
    return null;
  }
  return [...candidates].sort((a, b) =>
    Math.abs(a.slot - primaryTarget.slot) - Math.abs(b.slot - primaryTarget.slot)
    || a.unitKey.localeCompare(b.unitKey))[0] ?? null;
}

function removeBattleReplayRequiredAlly(requiredKeys: string[], unitKey: string): void {
  const index = requiredKeys.indexOf(unitKey);
  if (index >= 0) {
    requiredKeys.splice(index, 1);
  }
}

function resolveBattleReplayStatContext(
  snapshot: BattlePresentationSnapshot,
  unitByKey: Map<string, BattlePresentationUnitSnapshot>,
): BattleReplayStatContext {
  const units = [...unitByKey.values()];
  const allyTotalPower = units
    .filter((unit) => unit.side === 'ally')
    .reduce((sum, unit) => sum + Math.max(0, unit.power), 0);
  const enemyTotalPower = units
    .filter((unit) => unit.side === 'enemy')
    .reduce((sum, unit) => sum + Math.max(0, unit.power), 0);
  const stageRank = resolveBattleReplayStageRank(snapshot.stageCode);
  const powerPressure = allyTotalPower / Math.max(1, enemyTotalPower);
  const monsterDurabilityMultiplier = clamp(
    2.85 + powerPressure * 0.56 + stageRank * 0.016,
    3.05,
    10.2,
  );
  return {
    allyTotalPower,
    enemyTotalPower,
    stageRank,
    monsterDurabilityMultiplier,
  };
}

function resolveBattleReplayDerivedAttributes(
  unit: BattlePresentationUnitSnapshot,
  context: BattleReplayStatContext,
): BattleReplayDerivedAttributes {
  const rarity = (unit.rarity || '').toUpperCase();
  const power = Math.max(1, unit.power || 0);
  const level = Math.max(1, unit.level || 1);
  const enemy = unit.side === 'enemy';
  const rarityHpFactor = rarity === 'UR' ? 1.34 : rarity === 'SSR' ? 1.25 : rarity === 'SR' ? 1.12 : rarity === 'BOSS' ? 1.38 : 1;
  const rarityAttackFactor = rarity === 'UR' ? 1.18 : rarity === 'SSR' ? 1.12 : rarity === 'SR' ? 1.05 : 1;
  const roleHpFactor = unit.role === 'boss' ? 2.15 : unit.role === 'front' ? 1.18 : 0.92;
  const roleAttackFactor = unit.role === 'boss' ? 1.18 : unit.role === 'back' ? 0.96 : 1.06;
  const roleDefenseFactor = unit.role === 'boss' ? 1.28 : unit.role === 'front' ? 1.12 : 0.9;
  // 真实数值对抗(2026-07-10):maxHp/attack/defense 改为以 power 为主导(power 权重拉高、常数底压低),
  // 让「战力差」真正决定强弱与胜负——旧公式常数底过大,power 几乎不影响结果(300战力也能打赢2000)。
  // 同时去掉旧的敌人耐久橡皮筋 monsterDurabilityMultiplier(它让胜负与战力脱钩),敌人只保留 power 派生的自然强度。
  // 敌方攻击整体 ×0.88(enemyAttackMul):我方出手更频繁+略降敌方爆发,保证够战力时能存活输出、演出偏玩家但不脱离数值。
  // 敌人独立数值(battle_enemy_config 配了 baseHp/baseAttack/baseDefense,已按关卡放大)时仍直接用。
  // 标定见 scratchpad/sim_oracle.js:337必负 / 1800必负 / ~2300(≈敌人真实power)临界 / 2800+必胜,均 44 动作内清场。
  void context;
  const allyHpBoost = enemy ? 1 : 1.08;
  const enemyAttackMul = enemy ? 0.88 : 1;
  const explicitHp = enemy && typeof unit.enemyBaseHp === 'number' && unit.enemyBaseHp > 0 ? unit.enemyBaseHp : null;
  const explicitAttack = enemy && typeof unit.enemyBaseAttack === 'number' && unit.enemyBaseAttack > 0 ? unit.enemyBaseAttack : null;
  const explicitDefense = enemy && typeof unit.enemyBaseDefense === 'number' && unit.enemyBaseDefense > 0 ? unit.enemyBaseDefense : null;
  const maxHp = explicitHp !== null
    ? Math.max(1, Math.round(explicitHp))
    : Math.max(1, Math.round((power * 0.5 + level * (enemy ? 1.4 : 1.0) + 20) * rarityHpFactor * roleHpFactor * allyHpBoost));
  const attack = explicitAttack !== null
    ? Math.max(1, Math.round(explicitAttack * enemyAttackMul))
    : Math.max(1, Math.round((power * 0.17 + level * 0.5 + 5) * rarityAttackFactor * roleAttackFactor * enemyAttackMul));
  const defense = explicitDefense !== null
    ? Math.max(1, Math.round(explicitDefense))
    : Math.max(1, Math.round((power * 0.085 + 4) * roleDefenseFactor * (enemy ? 1.05 : 1)));
  const evasionRate = clamp((unit.role === 'back' ? 0.064 : 0.032) + (enemy ? 0.018 : 0) + Math.min(0.026, level * 0.00045), 0.01, enemy ? 0.12 : 0.1);
  const damageReduction = clamp((enemy ? 0.06 : 0.045) + (unit.role === 'boss' ? 0.1 : unit.role === 'front' ? 0.045 : 0.018) + level * 0.0008, 0.02, enemy ? 0.42 : 0.36);
  const critRate = clamp((enemy ? 0.035 : 0.07) + (rarity === 'UR' ? 0.055 : rarity === 'SSR' ? 0.04 : rarity === 'SR' ? 0.025 : 0.012), 0.02, 0.22);
  const critDamage = rarity === 'UR' ? 1.72 : rarity === 'SSR' ? 1.62 : rarity === 'SR' ? 1.52 : 1.46;
  return {
    maxHp,
    attack,
    defense,
    evasionRate,
    damageReduction,
    critRate,
    critDamage,
  };
}

function resolveBattleReplayDamageResult(
  actor: BattlePresentationUnitSnapshot,
  target: BattlePresentationUnitSnapshot,
  targetState: BattleReplayUnitState,
  units: Map<string, BattleReplayUnitState>,
  random: () => number,
  actionSeq: number,
  damageScale: number,
): BattleReplayDamageResult {
  const maxHp = Math.max(1, targetState.maxHp);
  const currentHp = Math.max(0, targetState.currentHp);
  const actorState = units.get(actor.unitKey);
  const actorStats = actorState?.stats ?? targetState.stats;
  const targetStats = targetState.stats;
  const evadeWindowOpen = actionSeq > 5 && actionSeq % 7 === 4;
  const didEvade = evadeWindowOpen && random() < targetStats.evasionRate * (target.side === 'enemy' ? 0.5 : 0.42);
  if (didEvade) {
    return {
      amount: 0,
      hpAfter: currentHp,
      critical: false,
      didEvade,
      countered: false,
      shieldBefore: targetState.shield,
      shieldAfter: targetState.shield,
      pierced: false,
      lifestealHeal: 0,
      reflectDamage: 0,
    };
  }
  // 真伤穿透(概率触发技能):按施法者技能表 roll,命中率随稀有度提升;触发则本段无视防御减伤。
  const pierced = rollBattleReplaySkillMagnitude(actor, 'truePierce', random) > 0;
  const critical = actor.side === 'ally'
    ? (actionSeq === 0 || random() < actorStats.critRate)
    : random() < actorStats.critRate * 0.55;
  const actorRoleFactor = actor.role === 'back' ? 0.94 : actor.role === 'boss' ? 1.1 : 1.05;
  const targetRoleFactor = target.role === 'boss' ? 0.86 : target.role === 'front' ? 0.94 : 1.04;
  const defenseMitigation = pierced ? 0 : clamp(targetStats.defense / Math.max(1, targetStats.defense + actorStats.attack * 3.4), 0.04, 0.42);
  const variance = 0.9 + random() * 0.18;
  const skillPulse = actor.side === 'ally' && actionSeq > 0 && actionSeq % 5 === 3 ? 1.16 : 1;
  const critMultiplier = critical ? actorStats.critDamage : 1;
  // 职业克制乘数:命中克制关系时 +30%,让配队针对敌方阵容成为有意义的决策。
  const counterMultiplier = resolveBattleReplayCounterMultiplier(actor, target);
  const countered = counterMultiplier > 1;
  const raw = actorStats.attack * actorRoleFactor * targetRoleFactor * variance * skillPulse * critMultiplier * counterMultiplier;
  // 连击每段伤害系数:让多段连击的每段更小、合计略高于单发。
  const reduced = raw * (1 - defenseMitigation) * (1 - targetStats.damageReduction) * damageScale;
  // 真实数值对抗(2026-07-10):伤害由攻击/防御/血量(reduced)决定,不再按"目标最大血量固定百分比"偏袒某一方
  // (旧版我方每刀恒 18~46%、敌人恒 3~18%,把战力/属性差 clamp 掉了,是"300战力打赢2000"的根因)。
  // 仅保留对称节奏安全夹(两边一致):单击 ≥2%(避免完全打不动、44 动作打不完)、≤55%(避免一击秒杀,至少两下)目标最大血量。
  const minHit = Math.max(1, Math.floor(maxHp * 0.02 * damageScale));
  const maxSingleHit = Math.max(1, Math.floor(maxHp * 0.55));
  const amount = clamp(Math.round(reduced), Math.min(minHit, maxSingleHit), maxSingleHit);
  // 能量护盾:先扣盾再扣血。amount 为本次总伤(飘字仍显示总量),护盾吸收后只有溢出部分打到血量;
  // 护盾全吸收时血量不动、护盾条明显下降。护盾为 0(绝大多数敌人)时行为与原来完全一致,无回归。
  const shieldBefore = Math.max(0, targetState.shield);
  const shieldAbsorbed = Math.min(shieldBefore, amount);
  const shieldAfter = shieldBefore - shieldAbsorbed;
  const hpDamage = amount - shieldAbsorbed;
  const hpAfter = Math.max(0, currentHp - hpDamage);
  // 吸血(施法者技能):按实际打到血量的伤害回施法者血。反弹(受击者技能):把一部分血量伤害反给攻击者。
  // 都只在真正扣血(hpDamage>0,即未被护盾全吸收)时结算,按各自 magnitude 比例。
  const lifestealMag = hpDamage > 0 ? rollBattleReplaySkillMagnitude(actor, 'lifesteal', random) : 0;
  const lifestealHeal = lifestealMag > 0 ? Math.max(1, Math.round(hpDamage * lifestealMag)) : 0;
  const reflectMag = hpDamage > 0 ? rollBattleReplaySkillMagnitude(target, 'reflect', random) : 0;
  const reflectDamage = reflectMag > 0 ? Math.max(1, Math.round(hpDamage * reflectMag)) : 0;
  return {
    amount,
    hpAfter,
    critical,
    didEvade,
    countered,
    shieldBefore,
    shieldAfter,
    pierced,
    lifestealHeal,
    reflectDamage,
  };
}

// 概率触发技能通用判定:读某单位技能表里指定类型的效果,按 baseChance×稀有度系数 roll。
// 触发返回该效果的 magnitude(效果量,语义随 type),未触发/无技能/敌人 → 返回 0。
// 用于:真伤穿透(magnitude 1,>0 即触发)、吸血/反弹(magnitude=回血/反伤比例)等。
function rollBattleReplaySkillMagnitude(
  unit: BattlePresentationUnitSnapshot,
  type: BattleHeroSkillEffectType,
  random: () => number,
): number {
  if (unit.side !== 'ally') {
    return 0;
  }
  const effect = resolveBattleReplaySkillEffects(unit).find((item) => item.type === type);
  if (!effect) {
    return 0;
  }
  return random() < resolveSkillTriggerChance(effect.baseChance, unit.rarity) ? effect.magnitude : 0;
}

// 技能特殊属性来源:优先用后端 hero_battle_skill_config 下发的 unit.skillConfig(权威);
// 缺省(旧服务端未下发 / 大厅挂机演出用花名册)时回退客户端占位表 LobbyBattleHeroSkillConfig。
// 被动技能按星级门禁(docs/25):有序被动列表 = [护盾?, ...effects];当前星级下已解锁的条数决定哪些生效。
function resolveBattleReplayRawSkill(unit: BattlePresentationUnitSnapshot): {
  shieldScope: 'single' | 'team' | null;
  effects: { type: string; baseChance: number; magnitude: number }[];
} {
  if (unit.skillConfig) {
    return { shieldScope: unit.skillConfig.energyShieldScope, effects: unit.skillConfig.effects };
  }
  const profile = resolveBattleHeroSkillProfile(unit.heroCode);
  return { shieldScope: profile.energyShield?.scope ?? null, effects: profile.effects ?? [] };
}

// 按星级门禁裁剪被动:护盾若存在占被动位 #1,其后为 effects;已解锁条数 = resolveUnlockedPassiveCount。
function resolveBattleReplayUnlockedSkill(unit: BattlePresentationUnitSnapshot): {
  shieldScope: 'single' | 'team' | null;
  effects: { type: string; baseChance: number; magnitude: number }[];
} {
  const raw = resolveBattleReplayRawSkill(unit);
  const unlocked = resolveUnlockedPassiveCount(unit.rarity, unit.star);
  const hasShield = raw.shieldScope !== null;
  const shieldUnlocked = hasShield && unlocked >= 1;
  const effectsUnlockedCount = Math.max(0, unlocked - (hasShield ? 1 : 0));
  return {
    shieldScope: shieldUnlocked ? raw.shieldScope : null,
    effects: raw.effects.slice(0, effectsUnlockedCount),
  };
}

function resolveBattleReplaySkillEffects(
  unit: BattlePresentationUnitSnapshot,
): { type: string; baseChance: number; magnitude: number }[] {
  return resolveBattleReplayUnlockedSkill(unit).effects;
}

function resolveBattleReplayShieldScope(unit: BattlePresentationUnitSnapshot): 'single' | 'team' | null {
  return resolveBattleReplayUnlockedSkill(unit).shieldScope;
}

function resolveBattleReplayStageRank(stageCode: string | undefined): number {
  const match = `${stageCode ?? ''}`.match(/^MAIN_(\d+)_(\d+)$/i);
  if (!match) {
    return 1;
  }
  const chapter = Number.parseInt(match[1], 10);
  const stage = Number.parseInt(match[2], 10);
  if (!Number.isFinite(chapter) || !Number.isFinite(stage)) {
    return 1;
  }
  return Math.max(1, (chapter - 1) * 16 + stage);
}

function resolveBattleReplayDefaultHitDelayMs(actionKind: BattleReplayActionKind): number {
  return actionKind === 'ranged' ? 860 : BATTLE_REPLAY_MELEE_APPROACH_MS + BATTLE_REPLAY_MELEE_CAST_MS;
}

function resolveBattleReplayActionCadenceMs(
  actionKind: BattleReplayActionKind,
  actor: BattlePresentationUnitSnapshot,
  actionIndex: number,
): number {
  const sidePressureMs = actor.side === 'enemy' ? 80 : 0;
  const roleWeightMs = actor.role === 'boss' ? 100 : actor.role === 'back' ? -80 : 0;
  const actionPulseMs = (actionIndex % 3) * 25;
  const rangedPressureMs = actionKind === 'ranged' ? -80 : 0;
  return clamp(BATTLE_REPLAY_ACTION_CADENCE_MS + sidePressureMs + roleWeightMs + actionPulseMs + rangedPressureMs, 430, 760);
}

function resolveBattleReplayFirstActionMs(timeline: BattlePresentationTimeline): number {
  const firstAction = timeline.events.find((event) => event.type === 'action_start');
  return Math.max(1_500, firstAction?.timeMs ?? 2_120);
}

function resolveBattleReplayBattleEndMs(timeline: BattlePresentationTimeline, actions: BattleReplayAction[]): number {
  const lastActionEndMs = actions.length > 0 ? Math.max(...actions.map((action) => action.endMs)) : resolveBattleReplayFirstActionMs(timeline);
  return Math.max(resolveBattleReplayFirstActionMs(timeline) + 1, Math.min(timeline.durationMs, lastActionEndMs + BATTLE_REPLAY_RESULT_PADDING_MS));
}

function hasLivingSide(units: Map<string, BattleReplayUnitState>, side: 'ally' | 'enemy'): boolean {
  for (const unit of units.values()) {
    if (unit.side === side && !unit.dead && unit.currentHp > 0) {
      return true;
    }
  }
  return false;
}

function countLivingSide(units: Map<string, BattleReplayUnitState>, side: 'ally' | 'enemy'): number {
  let count = 0;
  for (const unit of units.values()) {
    if (unit.side === side && !unit.dead && unit.currentHp > 0) {
      count += 1;
    }
  }
  return count;
}

function isBattleReplayUnitAlive(units: Map<string, BattleReplayUnitState>, unitKey: string): boolean {
  const unit = units.get(unitKey);
  return !!unit && !unit.dead && unit.currentHp > 0;
}

function resolveBattleReplayRolePriority(unit: BattlePresentationUnitSnapshot): number {
  if (unit.role === 'boss') {
    return 0;
  }
  if (unit.role === 'front') {
    return 1;
  }
  return 2;
}

function createBattleReplaySeed(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function nextBattleReplayRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function formatReplayNumber(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return rounded.toLocaleString('en-US');
}
