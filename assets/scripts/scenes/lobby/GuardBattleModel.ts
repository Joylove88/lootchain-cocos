// 矿境守卫(docs/30 守卫-P1)纯逻辑 sim:召唤/合成/波次/车道行进/啃水晶/胜负。
// 无 cc 依赖(可 node 离线验证);渲染层每 tick 读状态绘制。确定性:全部随机走 seeded RNG
// (serverSeed 派生),同 seed+同操作序列 → 同结果,为 P3 服务端复演留口。
// 纯表现+现有结算通道:不新增经济写入口,胜负经 LobbyBattleFlow.settle 由后端权威裁决。

export type GuardHeroRole = 'melee' | 'ranged' | 'support' | 'control';
export type GuardMonsterKind = 'normal' | 'fast' | 'tank' | 'elite' | 'boss';
export type GuardPhase = 'prep' | 'wave' | 'victory' | 'defeat';

/** 上阵英雄(召唤池条目):由 battle start 回执 lineup 折算。 */
export interface GuardPoolHero {
  heroCode: string;
  displayName: string;
  rarity: string;
  role: GuardHeroRole;
  /** 局外面板折算的 1 星基础攻击。 */
  baseAttack: number;
  /** 渲染层用:骨骼/立绘沿用现有解析(直接透传 snapshot ally)。 */
  sourceIndex: number;
}

export interface GuardHeroUnit {
  unitId: number;
  heroCode: string;
  star: number;
  /** 格位 0..GRID_ROWS*GRID_COLS-1;row=车道。 */
  cell: number;
  role: GuardHeroRole;
  attackCooldownMs: number;
  /** 最近一次出手时间(渲染层放攻击动画用)。 */
  lastAttackAtMs: number;
  lastTargetId: number | null;
}

export interface GuardMonster {
  monsterId: number;
  kind: GuardMonsterKind;
  lane: number;
  /** 距水晶的路程(格),SPAWN_X 起向 0 走;≤CRYSTAL_REACH_X 停下啃水晶。 */
  x: number;
  hp: number;
  maxHp: number;
  speedCellsPerSec: number;
  crystalDamage: number;
  attackCooldownMs: number;
  slowUntilMs: number;
  spawnedWave: number;
  /** 渲染层骨骼资源名(spine/monster/<code>)。 */
  spineCode: string;
  dead: boolean;
  diedAtMs: number;
}

export interface GuardEvent {
  type: 'summon' | 'merge' | 'superMerge' | 'kill' | 'waveStart' | 'crystalHit' | 'victory' | 'defeat' | 'heroAttack';
  timeMs: number;
  heroCode?: string;
  star?: number;
  cell?: number;
  monsterId?: number;
  wave?: number;
  amount?: number;
}

export interface GuardBattleState {
  seed: number;
  rng: () => number;
  timeMs: number;
  phase: GuardPhase;
  wave: number;
  maxWave: number;
  /** 本波剩余待刷 + 刷怪计时。 */
  pendingSpawns: Array<{ kind: GuardMonsterKind; lane: number; atMs: number }>;
  waveStartedAtMs: number;
  gold: number;
  summonCost: number;
  summonCount: number;
  crystalHp: number;
  crystalMaxHp: number;
  heroes: GuardHeroUnit[];
  monsters: GuardMonster[];
  pool: GuardPoolHero[];
  killCount: number;
  xp: number;
  nextUnitId: number;
  nextMonsterId: number;
  /** 渲染层逐帧消费后清空(飘字/特效一次性事件)。 */
  events: GuardEvent[];
  bossKilled: boolean;
}

// ── 配置(docs/30 待拍板口径;改数值只动这里)──
export const GUARD_GRID_ROWS = 3;
export const GUARD_GRID_COLS = 4;
export const GUARD_GRID_CELLS = GUARD_GRID_ROWS * GUARD_GRID_COLS;
export const GUARD_SPAWN_X = 10;
export const GUARD_CRYSTAL_REACH_X = 0.6;
/** 格列→路程 x 坐标(col3 最靠前)。 */
export function guardCellX(cell: number): number {
  return 1.5 + (cell % GUARD_GRID_COLS);
}
export function guardCellLane(cell: number): number {
  return Math.floor(cell / GUARD_GRID_COLS);
}

export const GUARD_START_GOLD = 240;
export const GUARD_SUMMON_BASE_COST = 60;
export const GUARD_SUMMON_COST_STEP = 10;
export const GUARD_SUMMON_COST_CAP = 300;
export const GUARD_SUPER_MERGE_CHANCE = 0.1;
export const GUARD_MAX_STAR = 5;
/** 星级攻击倍率:atk = base × 2.2^(star-1)。 */
export const GUARD_STAR_ATTACK_MULT = 2.2;
export const GUARD_CRYSTAL_MAX_HP = 1600;

export const GUARD_ROLE_PROFILE: Record<GuardHeroRole, { rangeCells: number; intervalMs: number; damageScale: number; laneLocked: boolean }> = {
  melee: { rangeCells: 1.2, intervalMs: 800, damageScale: 1.6, laneLocked: true },
  ranged: { rangeCells: 3.5, intervalMs: 1200, damageScale: 1.25, laneLocked: false },
  support: { rangeCells: 2.0, intervalMs: 3000, damageScale: 0.35, laneLocked: false },
  control: { rangeCells: 2.5, intervalMs: 1500, damageScale: 0.7, laneLocked: false },
};
export const GUARD_CONTROL_SLOW_RATIO = 0.4;
export const GUARD_CONTROL_SLOW_MS = 1500;
export const GUARD_SUPPORT_CRYSTAL_HEAL_RATIO = 0.025;
/** 水晶自卫反击(荆棘):对正在啃水晶的怪每秒反伤 6+3×波次——兜住"开局全近战+车道错位"的死亡螺旋,后期占比自然衰减。 */
export const GUARD_CRYSTAL_THORNS_BASE = 6;
export const GUARD_CRYSTAL_THORNS_PER_WAVE = 3;

export const GUARD_KILL_GOLD: Record<GuardMonsterKind, number> = { normal: 8, fast: 6, tank: 14, elite: 60, boss: 200 };
export const GUARD_KILL_XP: Record<GuardMonsterKind, number> = { normal: 1, fast: 1, tank: 2, elite: 10, boss: 30 };
const MONSTER_PROFILE: Record<GuardMonsterKind, { hpMult: number; speed: number; dmgMult: number; spineCodes: string[] }> = {
  normal: { hpMult: 1, speed: 0.55, dmgMult: 1, spineCodes: ['mutant_male', 'infected_male', 'goathead_blade'] },
  fast: { hpMult: 0.6, speed: 0.95, dmgMult: 0.7, spineCodes: ['medium_dog', 'medium_rat', 'small_spider'] },
  tank: { hpMult: 2.4, speed: 0.4, dmgMult: 1.2, spineCodes: ['large_bear', 'hammer_tanker', 'mutant_fatman'] },
  elite: { hpMult: 8, speed: 0.45, dmgMult: 2.2, spineCodes: ['abyss_jailer', 'forge_overseer', 'gargoyle'] },
  boss: { hpMult: 40, speed: 0.28, dmgMult: 8, spineCodes: ['rock_golem', 'abyss_devilman', 'grand_magus'] },
};
const MONSTER_BASE_HP = 34;
const MONSTER_HP_WAVE_EXP = 1.08;
const MONSTER_BASE_CRYSTAL_DMG = 5;
const MONSTER_ATTACK_INTERVAL_MS = 1200;
export const GUARD_WAVE_INTERMISSION_MS = 5000;
/** 超时保底:15 分钟仍未分出胜负(极端僵持)按失败收口,防无限局。 */
export const GUARD_TIME_LIMIT_MS = 15 * 60 * 1000;
const WAVE_SPAWN_WINDOW_MS = 18000;
export const GUARD_WAVE_WAGE_BASE = 40;

/** 难度Ⅰ:10 波;第 5 波精英,第 10 波 BOSS。 */
export function guardWaveComposition(wave: number, rng: () => number): Array<{ kind: GuardMonsterKind; lane: number; atMs: number }> {
  const spawns: Array<{ kind: GuardMonsterKind; lane: number; atMs: number }> = [];
  // 前两波只出普通怪且量少:开局站位/召唤还没成型,别让坏运气第 1 波就翻车。
  const count = (wave <= 2 ? 4 : 6) + wave * 2;
  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    const kind: GuardMonsterKind = wave <= 2 ? 'normal' : roll < 0.62 ? 'normal' : roll < 0.85 ? 'fast' : 'tank';
    spawns.push({ kind, lane: Math.floor(rng() * GUARD_GRID_ROWS), atMs: Math.round((i / count) * WAVE_SPAWN_WINDOW_MS) });
  }
  if (wave === 5) {
    spawns.push({ kind: 'elite', lane: Math.floor(rng() * GUARD_GRID_ROWS), atMs: 4000 });
  }
  if (wave === 10) {
    spawns.push({ kind: 'boss', lane: 1, atMs: 2000 });
  }
  return spawns;
}

// ── RNG(mulberry32,seed 由 serverSeed 字符串散列)──
export function guardHashSeed(text: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export function createGuardRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 职业→守卫定位(docs/30 四分;冰法/典狱官划控制,可按 heroCode 覆盖)。 */
const ROLE_OVERRIDE_BY_CODE: Record<string, GuardHeroRole> = {
  UR_EVELYN: 'control',
  SR_CHAIN_08: 'control',
};
export function resolveGuardRole(heroCode: string, heroClass: string | null | undefined): GuardHeroRole {
  const byCode = ROLE_OVERRIDE_BY_CODE[(heroCode || '').toUpperCase()];
  if (byCode) {
    return byCode;
  }
  const cls = (heroClass || '').trim();
  if (cls.includes('辅')) {
    return 'support';
  }
  if (cls.includes('法') || cls.includes('射')) {
    return 'ranged';
  }
  return 'melee';
}

export function createGuardBattle(pool: GuardPoolHero[], seedText: string, maxWave = 10): GuardBattleState {
  const seed = guardHashSeed(seedText || 'guard');
  const rng = createGuardRng(seed);
  return {
    seed,
    rng,
    timeMs: 0,
    phase: 'prep',
    wave: 0,
    maxWave,
    pendingSpawns: [],
    waveStartedAtMs: 0,
    gold: GUARD_START_GOLD,
    summonCost: GUARD_SUMMON_BASE_COST,
    summonCount: 0,
    crystalHp: GUARD_CRYSTAL_MAX_HP,
    crystalMaxHp: GUARD_CRYSTAL_MAX_HP,
    heroes: [],
    monsters: [],
    pool,
    killCount: 0,
    xp: 0,
    nextUnitId: 1,
    nextMonsterId: 1,
    events: [],
    bossKilled: false,
  };
}

export function guardFindHeroAt(state: GuardBattleState, cell: number): GuardHeroUnit | null {
  return state.heroes.find((hero) => hero.cell === cell) ?? null;
}

function guardEmptyCells(state: GuardBattleState): number[] {
  const used = new Set(state.heroes.map((hero) => hero.cell));
  const cells: number[] = [];
  for (let cell = 0; cell < GUARD_GRID_CELLS; cell += 1) {
    if (!used.has(cell)) {
      cells.push(cell);
    }
  }
  return cells;
}

/** 召唤:金币够+有空格 → 随机池英雄 1 星放随机空格,费用递增。 */
export function guardSummon(state: GuardBattleState): GuardHeroUnit | null {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return null;
  }
  const cells = guardEmptyCells(state);
  if (cells.length === 0 || state.gold < state.summonCost || state.pool.length === 0) {
    return null;
  }
  state.gold -= state.summonCost;
  state.summonCount += 1;
  state.summonCost = Math.min(GUARD_SUMMON_COST_CAP, GUARD_SUMMON_BASE_COST + state.summonCount * GUARD_SUMMON_COST_STEP);
  const pick = state.pool[Math.floor(state.rng() * state.pool.length)];
  const cell = cells[Math.floor(state.rng() * cells.length)];
  const unit: GuardHeroUnit = {
    unitId: state.nextUnitId++,
    heroCode: pick.heroCode,
    star: 1,
    cell,
    role: pick.role,
    attackCooldownMs: 0,
    lastAttackAtMs: -10000,
    lastTargetId: null,
  };
  state.heroes.push(unit);
  state.events.push({ type: 'summon', timeMs: state.timeMs, heroCode: unit.heroCode, star: 1, cell });
  return unit;
}

/** 拖拽:目标空格=换位;同名同星=合成(10% 超阶 +2 星);其余无操作。返回操作类型。 */
export function guardDragTo(state: GuardBattleState, fromCell: number, toCell: number): 'move' | 'merge' | 'superMerge' | 'none' {
  if (fromCell === toCell) {
    return 'none';
  }
  const from = guardFindHeroAt(state, fromCell);
  if (!from) {
    return 'none';
  }
  const to = guardFindHeroAt(state, toCell);
  if (!to) {
    from.cell = toCell;
    return 'move';
  }
  if (to.heroCode !== from.heroCode || to.star !== from.star || to.star >= GUARD_MAX_STAR) {
    return 'none';
  }
  const superMerge = state.rng() < GUARD_SUPER_MERGE_CHANCE;
  to.star = Math.min(GUARD_MAX_STAR, to.star + (superMerge ? 2 : 1));
  state.heroes = state.heroes.filter((hero) => hero.unitId !== from.unitId);
  state.events.push({ type: superMerge ? 'superMerge' : 'merge', timeMs: state.timeMs, heroCode: to.heroCode, star: to.star, cell: toCell });
  return superMerge ? 'superMerge' : 'merge';
}

export function guardHeroAttackValue(state: GuardBattleState, hero: GuardHeroUnit): number {
  const pool = state.pool.find((entry) => entry.heroCode === hero.heroCode);
  const base = pool?.baseAttack ?? 40;
  const profile = GUARD_ROLE_PROFILE[hero.role];
  return Math.max(1, Math.round(base * profile.damageScale * Math.pow(GUARD_STAR_ATTACK_MULT, hero.star - 1)));
}

function startWave(state: GuardBattleState): void {
  state.wave += 1;
  state.phase = 'wave';
  state.waveStartedAtMs = state.timeMs;
  state.pendingSpawns = guardWaveComposition(state.wave, state.rng).map((spawn) => ({ ...spawn, atMs: spawn.atMs + state.timeMs }));
  state.gold += GUARD_WAVE_WAGE_BASE + state.wave * 10;
  state.events.push({ type: 'waveStart', timeMs: state.timeMs, wave: state.wave });
}

function spawnMonster(state: GuardBattleState, kind: GuardMonsterKind, lane: number): void {
  const profile = MONSTER_PROFILE[kind];
  const hp = Math.max(1, Math.round(MONSTER_BASE_HP * profile.hpMult * Math.pow(state.wave, MONSTER_HP_WAVE_EXP)));
  state.monsters.push({
    monsterId: state.nextMonsterId++,
    kind,
    lane,
    x: GUARD_SPAWN_X,
    hp,
    maxHp: hp,
    speedCellsPerSec: profile.speed,
    crystalDamage: Math.max(1, Math.round(MONSTER_BASE_CRYSTAL_DMG * profile.dmgMult * Math.pow(state.wave, 0.95))),
    attackCooldownMs: 0,
    slowUntilMs: 0,
    spawnedWave: state.wave,
    spineCode: profile.spineCodes[Math.floor(state.rng() * profile.spineCodes.length)],
    dead: false,
    diedAtMs: 0,
  });
}

function heroTick(state: GuardBattleState, hero: GuardHeroUnit, dtMs: number): void {
  const profile = GUARD_ROLE_PROFILE[hero.role];
  hero.attackCooldownMs -= dtMs;
  if (hero.attackCooldownMs > 0) {
    return;
  }
  if (hero.role === 'support') {
    // 辅助:周期治疗水晶(P2 再加金币光环)。
    hero.attackCooldownMs = profile.intervalMs;
    hero.lastAttackAtMs = state.timeMs;
    state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + Math.round(state.crystalMaxHp * GUARD_SUPPORT_CRYSTAL_HEAL_RATIO));
    return;
  }
  const heroX = guardCellX(hero.cell);
  const heroLane = guardCellLane(hero.cell);
  let target: GuardMonster | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const monster of state.monsters) {
    if (monster.dead) {
      continue;
    }
    if (profile.laneLocked && monster.lane !== heroLane) {
      continue;
    }
    const distance = Math.abs(monster.x - heroX);
    if (distance <= profile.rangeCells && distance < bestDistance) {
      bestDistance = distance;
      target = monster;
    }
  }
  if (!target) {
    return;
  }
  hero.attackCooldownMs = profile.intervalMs;
  hero.lastAttackAtMs = state.timeMs;
  hero.lastTargetId = target.monsterId;
  const damage = guardHeroAttackValue(state, hero);
  target.hp -= damage;
  if (hero.role === 'control') {
    target.slowUntilMs = state.timeMs + GUARD_CONTROL_SLOW_MS;
  }
  state.events.push({ type: 'heroAttack', timeMs: state.timeMs, heroCode: hero.heroCode, monsterId: target.monsterId, amount: damage, cell: hero.cell });
  if (target.hp <= 0) {
    target.dead = true;
    target.diedAtMs = state.timeMs;
    state.killCount += 1;
    state.gold += GUARD_KILL_GOLD[target.kind];
    state.xp += GUARD_KILL_XP[target.kind];
    if (target.kind === 'boss') {
      state.bossKilled = true;
    }
    state.events.push({ type: 'kill', timeMs: state.timeMs, monsterId: target.monsterId, amount: GUARD_KILL_GOLD[target.kind] });
  }
}

/** 前进一个 tick。dtMs 建议 50;返回 phase 便于调用方判断结束。 */
export function guardTick(state: GuardBattleState, dtMs: number): GuardPhase {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return state.phase;
  }
  state.timeMs += dtMs;
  if (state.timeMs >= GUARD_TIME_LIMIT_MS) {
    state.phase = 'defeat';
    state.events.push({ type: 'defeat', timeMs: state.timeMs });
    return state.phase;
  }
  // 波次推进:prep(波间窗口)→ wave;首波在 GUARD_WAVE_INTERMISSION_MS 后开。
  if (state.phase === 'prep') {
    const readyAtMs = state.wave === 0 ? GUARD_WAVE_INTERMISSION_MS : state.waveStartedAtMs + GUARD_WAVE_INTERMISSION_MS;
    if (state.timeMs >= readyAtMs) {
      startWave(state);
    }
  } else if (state.phase === 'wave') {
    while (state.pendingSpawns.length > 0 && state.pendingSpawns[0].atMs <= state.timeMs) {
      const spawn = state.pendingSpawns.shift();
      if (spawn) {
        spawnMonster(state, spawn.kind, spawn.lane);
      }
    }
    const anyAlive = state.monsters.some((monster) => !monster.dead);
    if (state.pendingSpawns.length === 0 && !anyAlive) {
      if (state.wave >= state.maxWave) {
        state.phase = 'victory';
        state.events.push({ type: 'victory', timeMs: state.timeMs });
        return state.phase;
      }
      state.phase = 'prep';
      state.waveStartedAtMs = state.timeMs;
    }
  }
  // 怪物:行进/啃水晶。
  for (const monster of state.monsters) {
    if (monster.dead) {
      continue;
    }
    if (monster.x > GUARD_CRYSTAL_REACH_X) {
      const slowFactor = monster.slowUntilMs > state.timeMs ? 1 - GUARD_CONTROL_SLOW_RATIO : 1;
      monster.x = Math.max(GUARD_CRYSTAL_REACH_X, monster.x - monster.speedCellsPerSec * slowFactor * (dtMs / 1000));
    } else {
      monster.attackCooldownMs -= dtMs;
      if (monster.attackCooldownMs <= 0) {
        monster.attackCooldownMs = MONSTER_ATTACK_INTERVAL_MS;
        state.crystalHp = Math.max(0, state.crystalHp - monster.crystalDamage);
        state.events.push({ type: 'crystalHit', timeMs: state.timeMs, monsterId: monster.monsterId, amount: monster.crystalDamage });
        if (state.crystalHp <= 0) {
          state.phase = 'defeat';
          state.events.push({ type: 'defeat', timeMs: state.timeMs });
          return state.phase;
        }
      }
      // 水晶荆棘反伤(按 tick 折算)。
      monster.hp -= (GUARD_CRYSTAL_THORNS_BASE + GUARD_CRYSTAL_THORNS_PER_WAVE * state.wave) * (dtMs / 1000);
      if (monster.hp <= 0) {
        monster.dead = true;
        monster.diedAtMs = state.timeMs;
        state.killCount += 1;
        state.gold += GUARD_KILL_GOLD[monster.kind];
        state.xp += GUARD_KILL_XP[monster.kind];
        if (monster.kind === 'boss') {
          state.bossKilled = true;
        }
        state.events.push({ type: 'kill', timeMs: state.timeMs, monsterId: monster.monsterId, amount: GUARD_KILL_GOLD[monster.kind] });
      }
    }
  }
  // 英雄出手。
  for (const hero of state.heroes) {
    heroTick(state, hero, dtMs);
  }
  // 尸体延迟清理(渲染层要播死亡),3s 后移除。
  state.monsters = state.monsters.filter((monster) => !monster.dead || state.timeMs - monster.diedAtMs < 3000);
  return state.phase;
}
