// 矿境守卫(docs/30 守卫-P1/P2)纯逻辑 sim:召唤/合成/波次/车道行进/啃水晶/胜负 +
// P2:宝箱跳奖/局内升级三选一(跳过·刷新·放逐)/强化线/BOSS 读条集火打断/飞行·远程怪/水晶技能/波次预告。
// 无 cc 依赖(可 node 离线验证);渲染层每 tick 读状态绘制。确定性:全部随机走 seeded RNG
// (serverSeed 派生),同 seed+同操作序列 → 同结果,为 P3 服务端复演留口。
// 纯表现+现有结算通道:不新增经济写入口,胜负经 LobbyBattleFlow.settle 由后端权威裁决。

export type GuardHeroRole = 'melee' | 'ranged' | 'support' | 'control';
export type GuardMonsterKind = 'normal' | 'fast' | 'tank' | 'flying' | 'shooter' | 'elite' | 'boss';
export type GuardPhase = 'prep' | 'wave' | 'victory' | 'defeat';
/** standard=波次通关(难度Ⅰ 10 波/Ⅱ 20 波);rush=难度Ⅲ BOSS 车轮战(无尽,水晶碎即结算层数,不判负)。 */
export type GuardMode = 'standard' | 'rush';

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
  /** 出手计数:star≥2 每第 4 次为技能击(×1.6,渲染层播专属技能特效)。 */
  attackCount: number;
  /** 主动技能就绪时刻(2★ 解锁,自动施放;参考蔚蓝星球主动技,2026-08-26)。 */
  skillReadyMs: number;
}

/** 持续区域(灼烧区/旋风):确定性推进与跳伤,渲染层按 state.zones 绘制。 */
export interface GuardZone {
  zoneId: number;
  kind: 'burn' | 'cyclone';
  x: number;
  radiusCells: number;
  /** 每跳伤害(施放时按施放者攻击折算固定)。 */
  tickDamage: number;
  tickMs: number;
  nextTickAtMs: number;
  untilMs: number;
  /** cyclone:向刷怪口推进的速度;burn 为 0。 */
  speedCellsPerSec: number;
  /** cyclone:命中附带减速时长。 */
  slowMs: number;
}

export interface GuardMonster {
  monsterId: number;
  kind: GuardMonsterKind;
  lane: number;
  /** 距水晶的路程(格),SPAWN_X 起向 0 走;≤CRYSTAL_REACH_X(shooter 为 SHOOTER_STAND_X)停下攻击水晶。 */
  x: number;
  hp: number;
  maxHp: number;
  speedCellsPerSec: number;
  crystalDamage: number;
  attackCooldownMs: number;
  slowUntilMs: number;
  /** BOSS 读条被打断后的踉跄(不移动不读条)。 */
  stunnedUntilMs: number;
  spawnedWave: number;
  /** 渲染层骨骼资源名(spine/monster/<code>)。 */
  spineCode: string;
  dead: boolean;
  diedAtMs: number;
}

/** 精英掉落宝箱(点击开箱→跳奖)。 */
export interface GuardChest {
  chestId: number;
  x: number;
  lane: number;
  droppedAtMs: number;
}

/** 三选一选项(P2 白池=通用属性;蓝/金留 P4)。 */
export interface GuardChoiceOption {
  id: string;
  title: string;
  detail: string;
}

export interface GuardMods {
  /** 全队攻击 +%(词条与强化线合并计入)。 */
  teamAtkPct: number;
  /** 攻速 +%(缩短出手间隔)。 */
  atkSpeedPct: number;
  /** 金币获取 +%。 */
  goldGainPct: number;
  /** 召唤费直减。 */
  summonDiscount: number;
  /** 水晶荆棘 +%。 */
  thornsPct: number;
}

export interface GuardBossCast {
  monsterId: number;
  startMs: number;
  hitMs: number;
  /** 读条期间对 BOSS 造成的伤害;≥threshold 即打断。 */
  damageTaken: number;
  threshold: number;
}

export interface GuardEvent {
  type:
    | 'summon' | 'merge' | 'superMerge' | 'kill' | 'waveStart' | 'crystalHit' | 'victory' | 'defeat' | 'heroAttack'
    | 'chestDrop' | 'chestOpen' | 'levelUp' | 'bossCastStart' | 'bossCastHit' | 'bossCastInterrupt' | 'crystalSkill' | 'enhance' | 'cellsUnlock' | 'heroSkill';
  timeMs: number;
  heroCode?: string;
  star?: number;
  cell?: number;
  monsterId?: number;
  wave?: number;
  amount?: number;
  chestId?: number;
  /** chestOpen:跳奖档位(1/3/5)。 */
  tier?: number;
  /** heroAttack:本次为技能击(2星解锁,每第 4 次出手),渲染层播专属技能特效。 */
  skillProc?: boolean;
  /** merge/superMerge:本次合成首次跨过 2 星=解锁专属技能(渲染层播"技能解锁"横幅)。 */
  skillUnlocked?: boolean;
  /** heroSkill:技能名(渲染层飘字)与产生的区域 id(如有)。 */
  skillName?: string;
  zoneId?: number;
}

export interface GuardBattleState {
  seed: number;
  rng: () => number;
  timeMs: number;
  phase: GuardPhase;
  /** 覆盖层(开箱/三选一)打开时暂停 sim(时间不前进)。 */
  paused: boolean;
  wave: number;
  maxWave: number;
  /** 本波剩余待刷 + 刷怪计时。 */
  pendingSpawns: Array<{ kind: GuardMonsterKind; lane: number; atMs: number }>;
  /** 下一波构成(prep 期生成,供预告条;startWave 消费)。 */
  nextWaveSpawns: Array<{ kind: GuardMonsterKind; lane: number; atMs: number }> | null;
  waveStartedAtMs: number;
  gold: number;
  summonCost: number;
  summonCount: number;
  crystalHp: number;
  crystalMaxHp: number;
  heroes: GuardHeroUnit[];
  monsters: GuardMonster[];
  chests: GuardChest[];
  pool: GuardPoolHero[];
  killCount: number;
  xp: number;
  level: number;
  xpIntoLevel: number;
  /** 待处理三选一(存在即暂停;由 guardChooseOption/Skip/Reroll/Banish 消费)。 */
  pendingChoice: GuardChoiceOption[] | null;
  rerollLeft: number;
  banishLeft: number;
  banished: string[];
  mods: GuardMods;
  enhanceLevel: number;
  enhanceCost: number;
  crystalSkillReadyMs: number;
  bossCast: GuardBossCast | null;
  nextBossCastMs: number;
  chestOpenedCount: number;
  nextUnitId: number;
  nextMonsterId: number;
  nextChestId: number;
  /** 渲染层逐帧消费后清空(飘字/特效一次性事件)。 */
  events: GuardEvent[];
  bossKilled: boolean;
  mode: GuardMode;
  /** 持续区域(灼烧/旋风)与自增 id。 */
  zones: GuardZone[];
  nextZoneId: number;
  /** 辅助"圣辉涌泉"攻速增益截止时刻。 */
  supportSurgeUntilMs: number;
  /** 已解锁列数(3 起步,累计召唤达标解锁第 4 列)。 */
  unlockedCols: number;
  /** 车轮战累计击杀 BOSS 数(层数 = bossKills + wave,docs/30 口径)。 */
  bossKills: number;
  /** 车轮战下一只 BOSS 入场时刻(击杀后短暂间隔,下一只更强的入场)。 */
  nextRushBossAtMs: number;
}

// ── 配置(docs/30 待拍板口径;改数值只动这里)──
export const GUARD_GRID_ROWS = 3;
/** 总列数 4(12 格):开局解锁 3 列,累计召唤 GUARD_COL4_UNLOCK_SUMMONS 次解锁第 4 列(参考 Lucky Defense 渐进解锁,2026-08-25 用户拍板)。 */
export const GUARD_GRID_COLS = 4;
export const GUARD_GRID_CELLS = GUARD_GRID_ROWS * GUARD_GRID_COLS;
export const GUARD_START_COLS = 3;
export const GUARD_COL4_UNLOCK_SUMMONS = 10;
export const GUARD_SPAWN_X = 10;
export const GUARD_CRYSTAL_REACH_X = 0.6;
/** 远程怪站桩位:任意列远程(后列 1.0+3.5=4.5)与中前列控制都够得着,前列近战可补刀;严格阵容检查交给飞行怪。 */
export const GUARD_SHOOTER_STAND_X = 4.5;
/** 格列→路程 x 坐标(col4 最靠前)。起点 1.45 给水晶塔让位(2026-08-25 用户验收:格子不许盖水晶)、列距 1.18。 */
export function guardCellX(cell: number): number {
  return 1.45 + (cell % GUARD_GRID_COLS) * 1.18;
}
export function guardCellLane(cell: number): number {
  return Math.floor(cell / GUARD_GRID_COLS);
}

export const GUARD_START_GOLD = 240;
export const GUARD_SUMMON_BASE_COST = 60;
export const GUARD_SUMMON_COST_STEP = 10;
export const GUARD_SUMMON_COST_CAP = 300;
export const GUARD_SUMMON_COST_MIN = 30;
export const GUARD_SUPER_MERGE_CHANCE = 0.1;
export const GUARD_MAX_STAR = 5;
/** 星级攻击倍率:atk = base × 2.2^(star-1)。 */
export const GUARD_STAR_ATTACK_MULT = 2.2;
export const GUARD_CRYSTAL_MAX_HP = 1600;

// 覆盖范围(2026-08-25 用户拍板:同类型英雄攻击范围与所站格子无关)——rangeCells=从水晶起算的覆盖距离,
// 怪物走进 [0, rangeCells] 即可被打;近战仍锁本车道。近战 6 / 远程 10(全跑道)/ 控制 8。
export const GUARD_ROLE_PROFILE: Record<GuardHeroRole, { rangeCells: number; intervalMs: number; damageScale: number; laneLocked: boolean }> = {
  melee: { rangeCells: 6.0, intervalMs: 800, damageScale: 1.6, laneLocked: true },
  ranged: { rangeCells: 10.0, intervalMs: 1200, damageScale: 1.25, laneLocked: false },
  support: { rangeCells: 2.0, intervalMs: 3000, damageScale: 0.35, laneLocked: false },
  control: { rangeCells: 8.0, intervalMs: 1500, damageScale: 0.7, laneLocked: false },
};
/** 主动技能(2★ 解锁,自动施放;参考蔚蓝星球主动技,2026-08-26 用户拍板"参考此图按横板做")。 */
export const GUARD_HERO_SKILL: Record<GuardHeroRole, { name: string; cdMs: number; desc: string }> = {
  melee: { name: '裂地横扫', cdMs: 12_000, desc: '对本车道覆盖范围内所有敌人造成 200% 攻击,并击退 0.35 格' },
  ranged: { name: '烈焰领域', cdMs: 15_000, desc: '在最前方敌人脚下生成灼烧区,4 秒内每 0.5 秒造成 50% 攻击' },
  control: { name: '飓风呼啸', cdMs: 18_000, desc: '召唤缓慢推进的旋风,5 秒内每 0.5 秒对触及敌人造成 60% 攻击并减速' },
  support: { name: '圣辉涌泉', cdMs: 20_000, desc: '水晶回复 6% 生命,全队攻速 +20% 持续 4 秒' },
};
/** 首个主动技能的开场预热(召唤后 6s 才可首放)。 */
export const GUARD_HERO_SKILL_WARMUP_MS = 6_000;
export const GUARD_SUPPORT_SURGE_MS = 4_000;
export const GUARD_SUPPORT_SURGE_ATKSPD = 1.2;

export const GUARD_CONTROL_SLOW_RATIO = 0.4;
export const GUARD_CONTROL_SLOW_MS = 1500;
export const GUARD_SUPPORT_CRYSTAL_HEAL_RATIO = 0.025;
/** 水晶自卫反击(荆棘):对正在啃水晶的怪每秒反伤 6+3×波次——兜住"开局全近战+车道错位"的死亡螺旋,后期占比自然衰减。 */
export const GUARD_CRYSTAL_THORNS_BASE = 6;
export const GUARD_CRYSTAL_THORNS_PER_WAVE = 3;

// P2:强化线(全队攻击等级)/宝箱跳奖/三选一/BOSS 读条/水晶技能
export const GUARD_ENHANCE_BASE_COST = 40;
export const GUARD_ENHANCE_COST_STEP = 20;
export const GUARD_ENHANCE_ATK_PCT = 8;
export const GUARD_CHEST_TIER5_CHANCE = 0.03;
export const GUARD_CHEST_TIER3_CHANCE = 0.1;
export const GUARD_BOSS_CAST_INTERVAL_MS = 12_000;
export const GUARD_BOSS_CAST_DURATION_MS = 5_000;
/** 读条期间打掉 BOSS 最大生命的这个比例即打断。 */
export const GUARD_BOSS_CAST_INTERRUPT_HP_RATIO = 0.06;
/** 读满轰击:水晶损失最大生命比例。 */
export const GUARD_BOSS_CAST_CRYSTAL_RATIO = 0.15;
export const GUARD_BOSS_STUN_MS = 2_500;
export const GUARD_CRYSTAL_SKILL_CD_MS = 45_000;
export const GUARD_CRYSTAL_SKILL_KNOCKBACK_CELLS = 1.2;
export function guardCrystalSkillDamage(wave: number): number {
  return 60 + 25 * Math.max(1, wave);
}

export const GUARD_KILL_GOLD: Record<GuardMonsterKind, number> = { normal: 8, fast: 6, tank: 14, flying: 8, shooter: 12, elite: 60, boss: 200 };
export const GUARD_KILL_XP: Record<GuardMonsterKind, number> = { normal: 1, fast: 1, tank: 2, flying: 1, shooter: 2, elite: 10, boss: 30 };
const MONSTER_PROFILE: Record<GuardMonsterKind, { hpMult: number; speed: number; dmgMult: number; spineCodes: string[] }> = {
  normal: { hpMult: 1, speed: 0.55, dmgMult: 1, spineCodes: ['mutant_male', 'infected_male', 'goathead_blade'] },
  fast: { hpMult: 0.6, speed: 0.95, dmgMult: 0.7, spineCodes: ['medium_dog', 'medium_rat', 'small_spider'] },
  tank: { hpMult: 2.4, speed: 0.4, dmgMult: 1.2, spineCodes: ['large_bear', 'hammer_tanker', 'mutant_fatman'] },
  flying: { hpMult: 0.7, speed: 0.7, dmgMult: 0.8, spineCodes: ['small_bat', 'small_raven', 'crow_reaper'] },
  shooter: { hpMult: 0.9, speed: 0.5, dmgMult: 0.9, spineCodes: ['crossbow_male', 'bow_male', 'cursed_caster'] },
  elite: { hpMult: 8, speed: 0.45, dmgMult: 2.2, spineCodes: ['abyss_jailer', 'forge_overseer', 'gargoyle'] },
  boss: { hpMult: 40, speed: 0.28, dmgMult: 8, spineCodes: ['rock_golem', 'abyss_devilman', 'grand_magus'] },
};
/** 怪物骨骼资源:目录名≠数据文件基名(如 rock_golem/golem_001.json),按实际文件名映射。 */
export const GUARD_MONSTER_SPINE_FILE: Record<string, string> = {
  abyss_devilman: 'twohand_spear_001',
  abyss_jailer: 'jailer_001',
  bow_male: 'bow_001',
  crossbow_male: 'crossbow_001',
  crow_reaper: 'twohand_spear_001',
  cursed_caster: 'staff_001',
  forge_overseer: 'hammer_001',
  gargoyle: 'twohand_spear_001',
  goathead_blade: 'sword_001',
  grand_magus: 'wand_warlock_001',
  hammer_tanker: 'hammer_shield_001',
  infected_male: 'infected_bishop_001',
  large_bear: 'large_001',
  medium_dog: 'medium_base_001',
  medium_rat: 'medium_001',
  mutant_fatman: 'mutant_001',
  mutant_male: 'knuckle_002_darkness',
  rock_golem: 'golem_001',
  small_bat: 'small_base_001',
  small_raven: 'small_base_001',
  small_spider: 'small_base_001',
};
export function guardMonsterSpineResource(spineCode: string): string {
  const file = GUARD_MONSTER_SPINE_FILE[spineCode] ?? spineCode;
  return `spine/monster/${spineCode}/${file}`;
}

/** 视觉体型倍率(用户拍板 2026-08-21:精英×2,BOSS×6)。 */
export const GUARD_MONSTER_DISPLAY_SCALE: Record<GuardMonsterKind, number> = { normal: 1, fast: 0.85, tank: 1.3, flying: 0.9, shooter: 1, elite: 2, boss: 6 };
/** 逐皮肤 spine 皮肤名(源=DB monster_template.spine_skin):S196 怪物骨骼默认皮肤为空,不 setSkin 就渲染空白——怪物隐形的根因。 */
export const GUARD_MONSTER_SPINE_SKIN: Record<string, string> = {
  abyss_devilman: 'nude_001',
  abyss_jailer: 'largeman_cloth_002',
  bow_male: 'bow_001',
  crossbow_male: 'plate001_common_common',
  crow_reaper: 'nude_default',
  cursed_caster: 'cloth006_common_common',
  forge_overseer: 'cloth001_common_common',
  gargoyle: 'nude_001',
  goathead_blade: 'nude_default',
  grand_magus: 'cloth025_common_common',
  hammer_tanker: 'nude_default',
  infected_male: 'cloth001_common_common',
  large_bear: 'large_001',
  medium_dog: 'medium_base_001',
  medium_rat: 'medium_001',
  mutant_fatman: 'darkness_001',
  mutant_male: 'nude_001',
  rock_golem: 'larc_golem_001',
  small_bat: 'small_base_001',
  small_raven: 'small_base_001',
  small_spider: 'small_base_001',
};
/** 逐皮肤体型校准(源=DB monster_template.display_scale,与旧战斗渲染同一套标定;S196 bounds 虚标由它补偿)。 */
export const GUARD_MONSTER_DB_SCALE: Record<string, number> = {
  abyss_devilman: 1.45,
  abyss_jailer: 1.05,
  bow_male: 1.0,
  crossbow_male: 1.0,
  crow_reaper: 1.4,
  cursed_caster: 1.0,
  forge_overseer: 1.0,
  gargoyle: 1.2,
  goathead_blade: 1.35,
  grand_magus: 1.3,
  hammer_tanker: 1.2,
  infected_male: 1.0,
  large_bear: 1.35,
  medium_dog: 1.0,
  medium_rat: 1.0,
  mutant_fatman: 1.4,
  mutant_male: 1.05,
  rock_golem: 1.45,
  small_bat: 0.85,
  small_raven: 0.85,
  small_spider: 0.85,
};

const MONSTER_BASE_HP = 34;
// 1.08→1.14(2026-08-25):射程翻倍+12 格后英雄 DPS 上台阶,血量曲线同步抬升保持后期张力。
const MONSTER_HP_WAVE_EXP = 1.26;
const MONSTER_BASE_CRYSTAL_DMG = 5;
const MONSTER_ATTACK_INTERVAL_MS = 1200;
export const GUARD_WAVE_INTERMISSION_MS = 5000;
/** 超时保底:15 分钟仍未分出胜负(极端僵持)按失败收口,防无限局。 */
export const GUARD_TIME_LIMIT_MS = 15 * 60 * 1000;
const WAVE_SPAWN_WINDOW_MS = 18000;
export const GUARD_WAVE_WAGE_BASE = 40;

// 难度Ⅲ(输出试炼)BOSS 车轮战:开局即出 BOSS 极慢速压进(全程 ~2.4 分钟),击杀后更强的下一只入场;
// 小怪波照常无尽刷;水晶碎/超时 = 结算层数(永远算完成,层数走 trialLayers 换输出分)。
export const GUARD_RUSH_FIRST_BOSS_DELAY_MS = 6000;
export const GUARD_RUSH_BOSS_RESPAWN_MS = 2500;
export const GUARD_RUSH_BOSS_SPEED = 0.07;
/** 车轮 BOSS 走进该 x(前列远程射程边缘)才允许读条:远处轰水晶无人能打断=不可交互的必死倒计时。 */
export const GUARD_RUSH_BOSS_CAST_MAX_X = 7;
/** rush 单独时限:输出试炼是刷分局,10 分钟收口(层数即成绩),别拖成马拉松。 */
export const GUARD_RUSH_TIME_LIMIT_MS = 10 * 60 * 1000;
/** 第 n+1 只车轮 BOSS 的强度参考波次(hp/啃咬按此波次代入曲线);递增要陡于英雄成长,保证必然收敛。 */
export function guardRushBossRefWave(bossKills: number): number {
  return 6 + 6 * bossKills;
}
/** 难度Ⅲ层数(docs/30:层数 = 击杀 BOSS 数 + 当前波次进度)。 */
export function guardTrialLayers(state: GuardBattleState): number {
  return state.bossKills + state.wave;
}

/** 波次节奏(2026-08-25 用户拍板):前 3 波正常量热身,第 4 波起怪量陡增成势;精英第 4/8 波(每 10 波循环),BOSS 第 10 波/末波。 */
export function guardWaveComposition(wave: number, rng: () => number, maxWave = 10, mode: GuardMode = 'standard'): Array<{ kind: GuardMonsterKind; lane: number; atMs: number }> {
  const spawns: Array<{ kind: GuardMonsterKind; lane: number; atMs: number }> = [];
  // 热身 6/8/10 只;第 4 波起 6+3×波(18/21/24…),上限 40(同屏性能护栏)。
  const count = Math.min(40, wave <= 3 ? 4 + wave * 2 : 6 + wave * 3);
  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    let kind: GuardMonsterKind;
    if (wave <= 2) {
      kind = 'normal';
    } else if (wave >= 6 && roll > 0.9) {
      kind = 'shooter';
    } else if (wave >= 4 && roll > 0.8) {
      kind = 'flying';
    } else if (roll > 0.78) {
      kind = 'tank';
    } else if (roll > 0.55) {
      kind = 'fast';
    } else {
      kind = 'normal';
    }
    spawns.push({ kind, lane: Math.floor(rng() * GUARD_GRID_ROWS), atMs: Math.round((i / count) * WAVE_SPAWN_WINDOW_MS) });
  }
  const waveInCycle = ((wave - 1) % 10) + 1;
  const isEliteWave = mode === 'rush' ? wave % 4 === 0 : waveInCycle === 4 || waveInCycle === 8;
  if (isEliteWave) {
    spawns.push({ kind: 'elite', lane: Math.floor(rng() * GUARD_GRID_ROWS), atMs: 4000 });
  }
  // rush 的 BOSS 走车轮机制(guardTick),波次里不再脚本化。
  if (mode === 'standard' && (wave % 10 === 0 || wave === maxWave)) {
    spawns.push({ kind: 'boss', lane: 1, atMs: 2000 });
  }
  return spawns;
}

/** 波次预告汇总(渲染层直接展示)。 */
export function guardSummarizeSpawns(spawns: Array<{ kind: GuardMonsterKind }> | null): Partial<Record<GuardMonsterKind, number>> {
  const summary: Partial<Record<GuardMonsterKind, number>> = {};
  for (const spawn of spawns ?? []) {
    summary[spawn.kind] = (summary[spawn.kind] ?? 0) + 1;
  }
  return summary;
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

export function createGuardBattle(pool: GuardPoolHero[], seedText: string, maxWave = 10, mode: GuardMode = 'standard'): GuardBattleState {
  const seed = guardHashSeed(seedText || 'guard');
  const rng = createGuardRng(seed);
  // 长局(难度Ⅱ 20 波)水晶加厚:波数每多 1 波 +60,漏怪容错随局长同步放大;rush 保持基准(水晶量=层数上限的节奏阀)。
  const crystalHp = GUARD_CRYSTAL_MAX_HP + (mode === 'standard' ? Math.max(0, maxWave - 10) * 60 : 0);
  return {
    seed,
    rng,
    timeMs: 0,
    phase: 'prep',
    paused: false,
    wave: 0,
    maxWave,
    pendingSpawns: [],
    nextWaveSpawns: null,
    waveStartedAtMs: 0,
    gold: GUARD_START_GOLD,
    summonCost: GUARD_SUMMON_BASE_COST,
    summonCount: 0,
    crystalHp,
    crystalMaxHp: crystalHp,
    heroes: [],
    monsters: [],
    chests: [],
    pool,
    killCount: 0,
    xp: 0,
    level: 1,
    xpIntoLevel: 0,
    pendingChoice: null,
    rerollLeft: 1,
    banishLeft: 1,
    banished: [],
    mods: { teamAtkPct: 0, atkSpeedPct: 0, goldGainPct: 0, summonDiscount: 0, thornsPct: 0 },
    enhanceLevel: 0,
    enhanceCost: GUARD_ENHANCE_BASE_COST,
    crystalSkillReadyMs: 0,
    bossCast: null,
    nextBossCastMs: 0,
    chestOpenedCount: 0,
    nextUnitId: 1,
    nextMonsterId: 1,
    nextChestId: 1,
    events: [],
    bossKilled: false,
    mode,
    zones: [],
    nextZoneId: 1,
    supportSurgeUntilMs: 0,
    unlockedCols: GUARD_START_COLS,
    bossKills: 0,
    nextRushBossAtMs: GUARD_RUSH_FIRST_BOSS_DELAY_MS,
  };
}

export function guardFindHeroAt(state: GuardBattleState, cell: number): GuardHeroUnit | null {
  return state.heroes.find((hero) => hero.cell === cell) ?? null;
}

export function guardCellUnlocked(state: GuardBattleState, cell: number): boolean {
  return cell % GUARD_GRID_COLS < state.unlockedCols;
}

function guardEmptyCells(state: GuardBattleState): number[] {
  const used = new Set(state.heroes.map((hero) => hero.cell));
  const cells: number[] = [];
  for (let cell = 0; cell < GUARD_GRID_CELLS; cell += 1) {
    if (!used.has(cell) && guardCellUnlocked(state, cell)) {
      cells.push(cell);
    }
  }
  return cells;
}

export function guardCurrentSummonCost(state: GuardBattleState): number {
  return Math.max(GUARD_SUMMON_COST_MIN, state.summonCost - state.mods.summonDiscount);
}

/** 召唤:金币够+有空格 → 随机池英雄 1 星放随机空格,费用递增。free=宝箱奖励召唤(不扣费不涨价)。 */
export function guardSummon(state: GuardBattleState, free = false): GuardHeroUnit | null {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return null;
  }
  const cells = guardEmptyCells(state);
  const cost = guardCurrentSummonCost(state);
  if (cells.length === 0 || state.pool.length === 0 || (!free && state.gold < cost)) {
    return null;
  }
  if (!free) {
    state.gold -= cost;
    state.summonCount += 1;
    state.summonCost = Math.min(GUARD_SUMMON_COST_CAP, GUARD_SUMMON_BASE_COST + state.summonCount * GUARD_SUMMON_COST_STEP);
  }
  if (state.unlockedCols < GUARD_GRID_COLS && state.summonCount >= GUARD_COL4_UNLOCK_SUMMONS) {
    state.unlockedCols = GUARD_GRID_COLS;
    state.events.push({ type: 'cellsUnlock', timeMs: state.timeMs, amount: GUARD_GRID_ROWS });
  }
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
    attackCount: 0,
    skillReadyMs: state.timeMs + GUARD_HERO_SKILL_WARMUP_MS,
  };
  state.heroes.push(unit);
  state.events.push({ type: 'summon', timeMs: state.timeMs, heroCode: unit.heroCode, star: 1, cell });
  return unit;
}

/** 强化线:花金币升全队攻击等级(每级 +8%),费用递增——与召唤争夺同一份金币。 */
export function guardEnhance(state: GuardBattleState): boolean {
  if (state.phase === 'victory' || state.phase === 'defeat' || state.gold < state.enhanceCost) {
    return false;
  }
  state.gold -= state.enhanceCost;
  state.enhanceLevel += 1;
  state.enhanceCost = GUARD_ENHANCE_BASE_COST + state.enhanceLevel * GUARD_ENHANCE_COST_STEP;
  state.events.push({ type: 'enhance', timeMs: state.timeMs, amount: state.enhanceLevel });
  return true;
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
    if (!guardCellUnlocked(state, toCell)) {
      return 'none';
    }
    from.cell = toCell;
    return 'move';
  }
  if (to.heroCode !== from.heroCode || to.star !== from.star || to.star >= GUARD_MAX_STAR) {
    return 'none';
  }
  const superMerge = state.rng() < GUARD_SUPER_MERGE_CHANCE;
  const starBefore = to.star;
  to.star = Math.min(GUARD_MAX_STAR, to.star + (superMerge ? 2 : 1));
  state.heroes = state.heroes.filter((hero) => hero.unitId !== from.unitId);
  state.events.push({
    type: superMerge ? 'superMerge' : 'merge',
    timeMs: state.timeMs,
    heroCode: to.heroCode,
    star: to.star,
    cell: toCell,
    skillUnlocked: starBefore < 2 && to.star >= 2,
  });
  return superMerge ? 'superMerge' : 'merge';
}

export function guardHeroAttackValue(state: GuardBattleState, hero: GuardHeroUnit): number {
  const pool = state.pool.find((entry) => entry.heroCode === hero.heroCode);
  const base = pool?.baseAttack ?? 40;
  const profile = GUARD_ROLE_PROFILE[hero.role];
  const teamPct = state.mods.teamAtkPct + state.enhanceLevel * GUARD_ENHANCE_ATK_PCT;
  return Math.max(1, Math.round(base * profile.damageScale * Math.pow(GUARD_STAR_ATTACK_MULT, hero.star - 1) * (1 + teamPct / 100)));
}

// ── P2:XP/三选一 ──
function xpThreshold(level: number): number {
  // VS 分段线性:首级 5,每级 +10,21 级起 +13。
  return level <= 20 ? 5 + 10 * (level - 1) : 205 + 13 * (level - 20);
}

const CHOICE_POOL: GuardChoiceOption[] = [
  { id: 'atk10', title: '全队攻击 +10%', detail: '立即生效,可叠加' },
  { id: 'speed8', title: '全队攻速 +8%', detail: '缩短出手间隔,可叠加' },
  { id: 'gold10', title: '金币获取 +10%', detail: '击杀金币加成,可叠加' },
  { id: 'summon-10', title: '召唤费 -10', detail: '召唤更便宜(下限 30)' },
  { id: 'heal25', title: '水晶修复 25%', detail: '立即回复水晶生命' },
  { id: 'thorns50', title: '水晶荆棘 +50%', detail: '啃水晶的怪反伤更痛,可叠加' },
];

function rollChoices(state: GuardBattleState): GuardChoiceOption[] {
  const pool = CHOICE_POOL.filter((option) => !state.banished.includes(option.id));
  const picked: GuardChoiceOption[] = [];
  const candidates = [...pool];
  while (picked.length < 3 && candidates.length > 0) {
    const index = Math.floor(state.rng() * candidates.length);
    picked.push(candidates.splice(index, 1)[0]);
  }
  return picked;
}

function grantXp(state: GuardBattleState, amount: number): void {
  state.xp += amount;
  state.xpIntoLevel += amount;
  // 一次只弹一个三选一;溢出经验保留,选完继续判级。
  if (!state.pendingChoice && state.xpIntoLevel >= xpThreshold(state.level)) {
    state.xpIntoLevel -= xpThreshold(state.level);
    state.level += 1;
    state.pendingChoice = rollChoices(state);
    state.events.push({ type: 'levelUp', timeMs: state.timeMs, amount: state.level });
  }
}

function applyChoice(state: GuardBattleState, option: GuardChoiceOption): void {
  switch (option.id) {
    case 'atk10': state.mods.teamAtkPct += 10; break;
    case 'speed8': state.mods.atkSpeedPct = Math.min(50, state.mods.atkSpeedPct + 8); break;
    case 'gold10': state.mods.goldGainPct += 10; break;
    case 'summon-10': state.mods.summonDiscount += 10; break;
    case 'heal25': state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + Math.round(state.crystalMaxHp * 0.25)); break;
    case 'thorns50': state.mods.thornsPct += 50; break;
    default: break;
  }
}

function afterChoiceResolved(state: GuardBattleState): void {
  state.pendingChoice = null;
  // 溢出经验可能直接再升一级。
  if (state.xpIntoLevel >= xpThreshold(state.level)) {
    state.xpIntoLevel -= xpThreshold(state.level);
    state.level += 1;
    state.pendingChoice = rollChoices(state);
    state.events.push({ type: 'levelUp', timeMs: state.timeMs, amount: state.level });
  }
}

export function guardChooseOption(state: GuardBattleState, index: number): boolean {
  const option = state.pendingChoice?.[index];
  if (!option) {
    return false;
  }
  applyChoice(state, option);
  afterChoiceResolved(state);
  return true;
}

/** 跳过=换 50 金币。 */
export function guardSkipChoice(state: GuardBattleState): boolean {
  if (!state.pendingChoice) {
    return false;
  }
  state.gold += 50;
  afterChoiceResolved(state);
  return true;
}

export function guardRerollChoice(state: GuardBattleState): boolean {
  if (!state.pendingChoice || state.rerollLeft <= 0) {
    return false;
  }
  state.rerollLeft -= 1;
  state.pendingChoice = rollChoices(state);
  return true;
}

/** 放逐:把某选项本局踢出池并立刻重摇(不耗刷新次数)。 */
export function guardBanishChoice(state: GuardBattleState, index: number): boolean {
  const option = state.pendingChoice?.[index];
  if (!option || state.banishLeft <= 0) {
    return false;
  }
  state.banishLeft -= 1;
  state.banished.push(option.id);
  state.pendingChoice = rollChoices(state);
  return true;
}

// ── P2:宝箱跳奖 ──
export interface GuardChestReward {
  kind: 'gold' | 'summon' | 'teamAtk';
  amount: number;
  label: string;
}

/**
 * 开箱:跳奖档位 3%→5连 / 10%→3连 / 其余 1连(账号前 3 箱由渲染层传 scriptTier 固定 1-3-5)。
 * 返回逐件奖励(渲染层轮盘演出逐件揭示);奖励立即入账。
 */
export function guardOpenChest(state: GuardBattleState, chestId: number, scriptTier?: 1 | 3 | 5): { tier: number; rewards: GuardChestReward[] } | null {
  const chestIndex = state.chests.findIndex((chest) => chest.chestId === chestId);
  if (chestIndex < 0) {
    return null;
  }
  state.chests.splice(chestIndex, 1);
  state.chestOpenedCount += 1;
  let tier: number;
  if (scriptTier) {
    tier = scriptTier;
  } else {
    const roll = state.rng();
    tier = roll < GUARD_CHEST_TIER5_CHANCE ? 5 : roll < GUARD_CHEST_TIER5_CHANCE + GUARD_CHEST_TIER3_CHANCE ? 3 : 1;
  }
  const rewards: GuardChestReward[] = [];
  for (let i = 0; i < tier; i += 1) {
    const roll = state.rng();
    if (roll < 0.45) {
      const amount = Math.round(150 * (1 + state.mods.goldGainPct / 100));
      state.gold += amount;
      rewards.push({ kind: 'gold', amount, label: `战斗金币 +${amount}` });
    } else if (roll < 0.75) {
      const unit = guardSummon(state, true);
      const unitName = unit ? state.pool.find((entry) => entry.heroCode === unit.heroCode)?.displayName ?? unit.heroCode : '';
      rewards.push(unit
        ? { kind: 'summon', amount: 1, label: `免费召唤:${unitName}` }
        : { kind: 'gold', amount: 100, label: '阵地已满 → 金币 +100' });
      if (!unit) {
        state.gold += 100;
      }
    } else {
      state.mods.teamAtkPct += 8;
      rewards.push({ kind: 'teamAtk', amount: 8, label: '全队攻击 +8%' });
    }
  }
  state.events.push({ type: 'chestOpen', timeMs: state.timeMs, chestId, tier });
  return { tier, rewards };
}

// ── P2:水晶技能(矿晶震荡) ──
export function guardCrystalSkillReady(state: GuardBattleState): boolean {
  return state.timeMs >= state.crystalSkillReadyMs;
}

export function guardUseCrystalSkill(state: GuardBattleState): boolean {
  if (!guardCrystalSkillReady(state) || state.phase === 'victory' || state.phase === 'defeat') {
    return false;
  }
  state.crystalSkillReadyMs = state.timeMs + GUARD_CRYSTAL_SKILL_CD_MS;
  const damage = guardCrystalSkillDamage(state.wave);
  for (const monster of state.monsters) {
    if (monster.dead) {
      continue;
    }
    monster.x = Math.min(GUARD_SPAWN_X, monster.x + GUARD_CRYSTAL_SKILL_KNOCKBACK_CELLS);
    damageMonster(state, monster, damage, null);
  }
  state.events.push({ type: 'crystalSkill', timeMs: state.timeMs, amount: damage });
  return true;
}

// ── 击杀/伤害统一入口 ──
function killMonster(state: GuardBattleState, monster: GuardMonster): void {
  monster.dead = true;
  monster.diedAtMs = state.timeMs;
  state.killCount += 1;
  // 击杀金币随怪物所属波次成长(+6%/波):怪血 wave^1.08 超线性,经济不同步涨则 15 波后必然入不敷出。
  const gold = Math.round(GUARD_KILL_GOLD[monster.kind] * (1 + 0.06 * monster.spawnedWave) * (1 + state.mods.goldGainPct / 100));
  state.gold += gold;
  grantXp(state, GUARD_KILL_XP[monster.kind]);
  if (monster.kind === 'boss') {
    state.bossKilled = true;
    state.bossKills += 1;
    if (state.mode === 'rush') {
      state.nextRushBossAtMs = state.timeMs + GUARD_RUSH_BOSS_RESPAWN_MS;
    }
    if (state.bossCast?.monsterId === monster.monsterId) {
      state.bossCast = null;
    }
  }
  if (monster.kind === 'elite') {
    const chest: GuardChest = { chestId: state.nextChestId++, x: monster.x, lane: monster.lane, droppedAtMs: state.timeMs };
    state.chests.push(chest);
    state.events.push({ type: 'chestDrop', timeMs: state.timeMs, chestId: chest.chestId });
  }
  state.events.push({ type: 'kill', timeMs: state.timeMs, monsterId: monster.monsterId, amount: gold });
}

function damageMonster(state: GuardBattleState, monster: GuardMonster, damage: number, byHero: GuardHeroUnit | null): void {
  if (monster.dead) {
    return;
  }
  monster.hp -= damage;
  // BOSS 读条集火:读条期间受到的伤害计入打断阈值。
  if (state.bossCast && state.bossCast.monsterId === monster.monsterId) {
    state.bossCast.damageTaken += damage;
    if (state.bossCast.damageTaken >= state.bossCast.threshold) {
      monster.stunnedUntilMs = state.timeMs + GUARD_BOSS_STUN_MS;
      state.events.push({ type: 'bossCastInterrupt', timeMs: state.timeMs, monsterId: monster.monsterId });
      state.bossCast = null;
      state.nextBossCastMs = state.timeMs + GUARD_BOSS_CAST_INTERVAL_MS;
    }
  }
  void byHero;
  if (monster.hp <= 0) {
    killMonster(state, monster);
  }
}

function startWave(state: GuardBattleState): void {
  state.wave += 1;
  state.phase = 'wave';
  state.waveStartedAtMs = state.timeMs;
  const spawns = state.nextWaveSpawns ?? guardWaveComposition(state.wave, state.rng, state.maxWave, state.mode);
  state.nextWaveSpawns = null;
  state.pendingSpawns = spawns.map((spawn) => ({ ...spawn, atMs: spawn.atMs + state.timeMs }));
  state.gold += GUARD_WAVE_WAGE_BASE + state.wave * 10;
  state.events.push({ type: 'waveStart', timeMs: state.timeMs, wave: state.wave });
}

function spawnMonster(state: GuardBattleState, kind: GuardMonsterKind, lane: number, opts?: { refWave?: number; speed?: number }): void {
  const profile = MONSTER_PROFILE[kind];
  const refWave = Math.max(1, opts?.refWave ?? state.wave);
  const hp = Math.max(1, Math.round(MONSTER_BASE_HP * profile.hpMult * Math.pow(refWave, MONSTER_HP_WAVE_EXP)));
  const monster: GuardMonster = {
    monsterId: state.nextMonsterId++,
    kind,
    lane,
    x: GUARD_SPAWN_X,
    hp,
    maxHp: hp,
    speedCellsPerSec: opts?.speed ?? profile.speed * (0.88 + state.rng() * 0.24),
    crystalDamage: Math.max(1, Math.round(MONSTER_BASE_CRYSTAL_DMG * profile.dmgMult * Math.pow(refWave, 0.95))),
    attackCooldownMs: 0,
    slowUntilMs: 0,
    stunnedUntilMs: 0,
    spawnedWave: state.wave,
    spineCode: profile.spineCodes[Math.floor(state.rng() * profile.spineCodes.length)],
    dead: false,
    diedAtMs: 0,
  };
  state.monsters.push(monster);
  if (kind === 'boss') {
    state.nextBossCastMs = state.timeMs + GUARD_BOSS_CAST_INTERVAL_MS;
  }
}

/** 主动技能施放(2★,冷却制,自动):近战横扫/远程灼烧区/控制旋风/辅助圣辉。返回是否成功施放。 */
function castHeroSkill(state: GuardBattleState, hero: GuardHeroUnit): boolean {
  const profile = GUARD_ROLE_PROFILE[hero.role];
  const attack = guardHeroAttackValue(state, hero);
  const skill = GUARD_HERO_SKILL[hero.role];
  if (hero.role === 'melee') {
    const heroLane = guardCellLane(hero.cell);
    const targets = state.monsters.filter((monster) => !monster.dead && monster.lane === heroLane && monster.kind !== 'flying' && monster.x <= profile.rangeCells);
    if (targets.length === 0) {
      return false;
    }
    const damage = Math.round(attack * 2.0);
    let firstId: number | null = null;
    for (const monster of targets) {
      monster.x = Math.min(GUARD_SPAWN_X, monster.x + 0.35);
      if (firstId === null) {
        firstId = monster.monsterId;
      }
      damageMonster(state, monster, damage, hero);
    }
    state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name, amount: damage, monsterId: firstId ?? undefined });
    return true;
  }
  if (hero.role === 'ranged') {
    let front: GuardMonster | null = null;
    for (const monster of state.monsters) {
      if (!monster.dead && monster.x <= profile.rangeCells && (!front || monster.x < front.x)) {
        front = monster;
      }
    }
    if (!front) {
      return false;
    }
    const zone: GuardZone = {
      zoneId: state.nextZoneId++,
      kind: 'burn',
      x: front.x,
      radiusCells: 1.2,
      tickDamage: Math.max(1, Math.round(attack * 0.5)),
      tickMs: 500,
      nextTickAtMs: state.timeMs + 250,
      untilMs: state.timeMs + 4000,
      speedCellsPerSec: 0,
      slowMs: 0,
    };
    state.zones.push(zone);
    state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name, zoneId: zone.zoneId, monsterId: front.monsterId });
    return true;
  }
  if (hero.role === 'control') {
    if (!state.monsters.some((monster) => !monster.dead)) {
      return false;
    }
    const zone: GuardZone = {
      zoneId: state.nextZoneId++,
      kind: 'cyclone',
      x: 1.2,
      radiusCells: 1.0,
      tickDamage: Math.max(1, Math.round(attack * 0.6)),
      tickMs: 500,
      nextTickAtMs: state.timeMs + 250,
      untilMs: state.timeMs + 5000,
      speedCellsPerSec: 0.9,
      slowMs: 1000,
    };
    state.zones.push(zone);
    state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name, zoneId: zone.zoneId });
    return true;
  }
  // support:有怪压场才放(空场省冷却)
  if (!state.monsters.some((monster) => !monster.dead)) {
    return false;
  }
  state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + Math.round(state.crystalMaxHp * 0.06));
  state.supportSurgeUntilMs = state.timeMs + GUARD_SUPPORT_SURGE_MS;
  state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name });
  return true;
}

function heroTick(state: GuardBattleState, hero: GuardHeroUnit, dtMs: number): void {
  const profile = GUARD_ROLE_PROFILE[hero.role];
  // 主动技能:2★ 解锁,冷却就绪且有合法目标时自动施放
  if (hero.star >= 2 && state.timeMs >= hero.skillReadyMs && castHeroSkill(state, hero)) {
    hero.skillReadyMs = state.timeMs + GUARD_HERO_SKILL[hero.role].cdMs;
  }
  hero.attackCooldownMs -= dtMs;
  if (hero.attackCooldownMs > 0) {
    return;
  }
  const surgeDiv = state.supportSurgeUntilMs > state.timeMs ? GUARD_SUPPORT_SURGE_ATKSPD : 1;
  const interval = (profile.intervalMs * (1 - Math.min(50, state.mods.atkSpeedPct) / 100)) / surgeDiv;
  if (hero.role === 'support') {
    // 辅助:周期治疗水晶。
    hero.attackCooldownMs = interval;
    hero.lastAttackAtMs = state.timeMs;
    state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + Math.round(state.crystalMaxHp * GUARD_SUPPORT_CRYSTAL_HEAL_RATIO));
    return;
  }
  const heroLane = guardCellLane(hero.cell);
  let target: GuardMonster | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const monster of state.monsters) {
    if (monster.dead) {
      continue;
    }
    // 飞行怪无视近战格挡(阵容检查器):只能被远程/控制打。
    if (monster.kind === 'flying' && hero.role === 'melee') {
      continue;
    }
    if (profile.laneLocked && monster.lane !== heroLane) {
      continue;
    }
    // 覆盖范围从水晶起算(与站位无关);优先打离水晶最近(最紧迫)的怪。
    if (monster.x <= profile.rangeCells && monster.x < bestDistance) {
      bestDistance = monster.x;
      target = monster;
    }
  }
  if (!target) {
    return;
  }
  hero.attackCooldownMs = interval;
  hero.lastAttackAtMs = state.timeMs;
  hero.lastTargetId = target.monsterId;
  hero.attackCount += 1;
  // 技能击(用户 2026-08-21:解锁技能词条要播技能动画且打在怪身上):2星起每第 4 次出手 ×1.6。
  const skillProc = hero.star >= 2 && hero.attackCount % 4 === 0;
  const damage = Math.round(guardHeroAttackValue(state, hero) * (skillProc ? 1.6 : 1));
  if (hero.role === 'control') {
    target.slowUntilMs = state.timeMs + GUARD_CONTROL_SLOW_MS;
  }
  state.events.push({ type: 'heroAttack', timeMs: state.timeMs, heroCode: hero.heroCode, monsterId: target.monsterId, amount: damage, cell: hero.cell, skillProc });
  damageMonster(state, target, damage, hero);
}

/** 前进一个 tick。dtMs 建议 50;返回 phase 便于调用方判断结束。paused/三选一悬挂时时间不前进。 */
export function guardTick(state: GuardBattleState, dtMs: number): GuardPhase {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return state.phase;
  }
  if (state.paused || state.pendingChoice) {
    return state.phase;
  }
  state.timeMs += dtMs;
  if (state.timeMs >= (state.mode === 'rush' ? GUARD_RUSH_TIME_LIMIT_MS : GUARD_TIME_LIMIT_MS)) {
    // rush(输出试炼)没有失败:到时按完成收口,层数即成绩。
    state.phase = state.mode === 'rush' ? 'victory' : 'defeat';
    state.events.push({ type: state.mode === 'rush' ? 'victory' : 'defeat', timeMs: state.timeMs });
    return state.phase;
  }
  // 波次推进:prep(波间窗口)→ wave;首波在 GUARD_WAVE_INTERMISSION_MS 后开。
  if (state.phase === 'prep') {
    if (!state.nextWaveSpawns) {
      // prep 期生成下一波构成(供预告条;startWave 消费,保持确定性)。
      state.nextWaveSpawns = guardWaveComposition(state.wave + 1, state.rng, state.maxWave, state.mode);
    }
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
    // rush:车轮 BOSS 常驻,不阻塞小怪波推进。
    const anyAlive = state.monsters.some((monster) => !monster.dead && (state.mode !== 'rush' || monster.kind !== 'boss'));
    if (state.pendingSpawns.length === 0 && !anyAlive) {
      if (state.mode !== 'rush' && state.wave >= state.maxWave) {
        state.phase = 'victory';
        state.events.push({ type: 'victory', timeMs: state.timeMs });
        return state.phase;
      }
      state.phase = 'prep';
      state.waveStartedAtMs = state.timeMs;
    }
  }
  // 车轮战:场上始终一只 BOSS——开局 6s 首只入场,击杀后 2.5s 换更强的下一只(强度参考波次递增,速度极慢压迫感)。
  if (state.mode === 'rush') {
    const bossAlive = state.monsters.some((monster) => monster.kind === 'boss' && !monster.dead);
    if (!bossAlive && state.timeMs >= state.nextRushBossAtMs) {
      spawnMonster(state, 'boss', 1, { refWave: guardRushBossRefWave(state.bossKills), speed: GUARD_RUSH_BOSS_SPEED });
    }
  }
  // BOSS 读条:存活 BOSS 到点起手(踉跄中顺延);读满轰水晶。
  const boss = state.monsters.find((monster) => monster.kind === 'boss' && !monster.dead) ?? null;
  if (boss) {
    const castReachable = state.mode !== 'rush' || boss.x <= GUARD_RUSH_BOSS_CAST_MAX_X;
    if (!state.bossCast && state.timeMs >= state.nextBossCastMs && boss.stunnedUntilMs <= state.timeMs && boss.x < GUARD_SPAWN_X - 0.5 && castReachable) {
      state.bossCast = {
        monsterId: boss.monsterId,
        startMs: state.timeMs,
        hitMs: state.timeMs + GUARD_BOSS_CAST_DURATION_MS,
        damageTaken: 0,
        threshold: Math.max(1, Math.round(boss.maxHp * GUARD_BOSS_CAST_INTERRUPT_HP_RATIO)),
      };
      state.events.push({ type: 'bossCastStart', timeMs: state.timeMs, monsterId: boss.monsterId });
    }
    if (state.bossCast && state.timeMs >= state.bossCast.hitMs) {
      const damage = Math.round(state.crystalMaxHp * GUARD_BOSS_CAST_CRYSTAL_RATIO);
      state.crystalHp = Math.max(0, state.crystalHp - damage);
      state.events.push({ type: 'bossCastHit', timeMs: state.timeMs, monsterId: state.bossCast.monsterId, amount: damage });
      state.bossCast = null;
      state.nextBossCastMs = state.timeMs + GUARD_BOSS_CAST_INTERVAL_MS;
      if (state.crystalHp <= 0) {
        state.phase = state.mode === 'rush' ? 'victory' : 'defeat';
        state.events.push({ type: state.mode === 'rush' ? 'victory' : 'defeat', timeMs: state.timeMs });
        return state.phase;
      }
    }
  } else {
    state.bossCast = null;
  }
  // 怪物:行进/啃水晶(shooter 站远程位;BOSS 读条或踉跄中不移动)。
  const thornsPerSec = (GUARD_CRYSTAL_THORNS_BASE + GUARD_CRYSTAL_THORNS_PER_WAVE * state.wave) * (1 + state.mods.thornsPct / 100);
  for (const monster of state.monsters) {
    if (monster.dead) {
      continue;
    }
    const standX = monster.kind === 'shooter' ? GUARD_SHOOTER_STAND_X : GUARD_CRYSTAL_REACH_X;
    const casting = state.bossCast?.monsterId === monster.monsterId;
    const stunned = monster.stunnedUntilMs > state.timeMs;
    if (monster.x > standX && !casting && !stunned) {
      const slowFactor = monster.slowUntilMs > state.timeMs ? 1 - GUARD_CONTROL_SLOW_RATIO : 1;
      monster.x = Math.max(standX, monster.x - monster.speedCellsPerSec * slowFactor * (dtMs / 1000));
    } else if (monster.x <= standX && !casting && !stunned) {
      monster.attackCooldownMs -= dtMs;
      if (monster.attackCooldownMs <= 0) {
        monster.attackCooldownMs = MONSTER_ATTACK_INTERVAL_MS;
        state.crystalHp = Math.max(0, state.crystalHp - monster.crystalDamage);
        state.events.push({ type: 'crystalHit', timeMs: state.timeMs, monsterId: monster.monsterId, amount: monster.crystalDamage });
        if (state.crystalHp <= 0) {
          // rush(输出试炼):水晶碎 = 结算当前层数,不判负(docs/30)。
          state.phase = state.mode === 'rush' ? 'victory' : 'defeat';
          state.events.push({ type: state.mode === 'rush' ? 'victory' : 'defeat', timeMs: state.timeMs });
          return state.phase;
        }
      }
      // 水晶荆棘反伤(按 tick 折算;shooter 站远程位不吃荆棘——用远程/控制处理它)。
      if (monster.kind !== 'shooter') {
        monster.hp -= thornsPerSec * (dtMs / 1000);
        if (monster.hp <= 0) {
          killMonster(state, monster);
        }
      }
    }
  }
  // 持续区域(灼烧区/旋风):推进与跳伤(确定性,无 rng;旋风附带减速)。
  for (const zone of state.zones) {
    if (zone.speedCellsPerSec > 0) {
      zone.x = Math.min(GUARD_SPAWN_X, zone.x + zone.speedCellsPerSec * (dtMs / 1000));
    }
    while (state.timeMs >= zone.nextTickAtMs && zone.nextTickAtMs <= zone.untilMs) {
      zone.nextTickAtMs += zone.tickMs;
      for (const monster of state.monsters) {
        if (monster.dead || Math.abs(monster.x - zone.x) > zone.radiusCells) {
          continue;
        }
        if (zone.slowMs > 0) {
          monster.slowUntilMs = Math.max(monster.slowUntilMs, state.timeMs + zone.slowMs);
        }
        damageMonster(state, monster, zone.tickDamage, null);
      }
    }
  }
  state.zones = state.zones.filter((zone) => state.timeMs < zone.untilMs);
  // 英雄出手。
  for (const hero of state.heroes) {
    heroTick(state, hero, dtMs);
  }
  // 尸体延迟清理(渲染层要播死亡),3s 后移除。
  state.monsters = state.monsters.filter((monster) => !monster.dead || state.timeMs - monster.diedAtMs < 3000);
  return state.phase;
}
