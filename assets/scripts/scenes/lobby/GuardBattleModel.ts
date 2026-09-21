// 矿境守卫(docs/30 守卫-P1/P2)纯逻辑 sim:召唤/合成/波次/车道行进/啃水晶/胜负 +
// P2:宝箱跳奖/局内升级三选一(跳过·刷新·放逐)/强化线/BOSS 读条集火打断/飞行·远程怪/水晶技能/波次预告。
// 无 cc 依赖(可 node 离线验证);渲染层每 tick 读状态绘制。确定性:全部随机走 seeded RNG
// (serverSeed 派生),同 seed+同操作序列 → 同结果,为 P3 服务端复演留口。
// 纯表现+现有结算通道:不新增经济写入口,胜负经 LobbyBattleFlow.settle 由后端权威裁决。

import {
  GUARD_ARCHETYPE_LABEL,
  GUARD_ATTACK_MAX_HITS,
  GUARD_ATTACK_MULT_CAP,
  GUARD_ATTACK_TARGET_COEF_CAP,
  GUARD_ATTACK_TOTAL_COEF_CAP,
  GUARD_BLUE_LAYERS_PER_HERO,
  GUARD_BLUE_PERKS,
  GUARD_CRIT_EVERY,
  GUARD_CRIT_MULT,
  GUARD_FREE_ENHANCE_BANK,
  GUARD_FREE_ENHANCE_FALLBACK_GOLD,
  GUARD_FREQ_CAP,
  GUARD_FREQ_POOL_CUTOFF,
  GUARD_GIANT_COEF,
  GUARD_GIANT_COUNT,
  GUARD_GIANT_RADIUS,
  GUARD_GOLD_BASE_CHANCE,
  GUARD_GOLD_FIRST_CHANCE,
  GUARD_GOLD_MAX_MISS,
  GUARD_GOLD_STAR3_BONUS,
  GUARD_GOLD_STAR3_BONUS_CAP,
  GUARD_GOLD_STEP_CHANCE,
  GUARD_HASTE_MULT,
  GUARD_MULTISHOT_COEF,
  GUARD_MULTISHOT_OVERFLOW,
  GUARD_MULTISHOT_SHOTS,
  GUARD_OFFFIELD_FROM_PICK,
  GUARD_OFFFIELD_WEIGHT,
  GUARD_OWNED_BIAS,
  GUARD_PERK_HEAL_CAP_PER_WAVE,
  GUARD_PIERCE_COEF,
  GUARD_PIERCE_COUNT,
  GUARD_SPREAD_COEF,
  GUARD_STAR_WEIGHT,
  GUARD_SUPPORT_BLUE_WEIGHT,
  GUARD_SUPPORT_FIRST_GOLD_WEIGHT,
  GUARD_ULT_CD_MULT,
  GUARD_ULT_DAMAGE_MULT,
  GUARD_ULT_LV3_EXTENT,
  GUARD_ULT_MAX_LEVEL,
  GUARD_WHITE_CAP,
  describeGuardUltLevel,
  guardFreeEnhanceWaves,
  guardPurplePerkId,
  guardRarityGate,
  guardWhiteValue,
  resolveGuardHeroPerkProfile,
  type GuardAttackArchetype,
  type GuardBluePerkDef,
  type GuardBluePerkId,
  type GuardHeroPerkProfile,
  type GuardPerkRarity,
  type GuardWhitePerkId,
} from './GuardPerkConfig';

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
  /** 奥蕾莉亚·追猎之翎:连续命中同一目标的叠层(其他英雄恒 0)。 */
  focusTargetId: number | null;
  focusStacks: number;
}

/** 每个英雄编码的词条状态(docs/32):蓝卡层数、紫卡层数(每英雄 1 条)、专属大招觉醒等级。 */
export interface GuardHeroPerks {
  blue: Partial<Record<GuardBluePerkId, number>>;
  purple: number;
  ultLv: number;
}

/** 一次普攻里单个命中的类别(渲染层按类别演:主弹/多重副发/散射/穿透/溅射/紫卡补击)。 */
export type GuardHitKind = 'main' | 'multi' | 'spread' | 'pierce' | 'splash' | 'perk';

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
  /** 施放者(跳伤计入其输出统计)。 */
  casterHeroCode?: string;
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
  /** BOSS 技能就绪时刻(2026-08-28:BOSS 进入自身攻击范围后冷却制放技能;非 BOSS 恒 0)。 */
  skillReadyMs: number;
  dead: boolean;
  diedAtMs: number;
}

/** 宝箱档次:精英掉普通箱(跳奖 1/3/5 连)、BOSS 掉豪华箱(固定 5 连、金币翻倍)——2026-09-18 用户拍板。 */
export type GuardChestGrade = 'normal' | 'deluxe';

/** 精英/BOSS 掉落宝箱(点击开箱→跳奖)。 */
export interface GuardChest {
  chestId: number;
  x: number;
  lane: number;
  droppedAtMs: number;
  grade: GuardChestGrade;
}

/** 三选一选项(docs/32):id 为实例 id(`atk_multishot@SSR_LIVIA` / `hero_<编码>_<后缀>` / `ult@<编码>` / `gen_*`)。 */
export interface GuardChoiceOption {
  id: string;
  title: string;
  detail: string;
  rarity: GuardPerkRarity;
  /** 归属英雄(白卡为空)。 */
  heroCode?: string;
  /** 词条定义 id(蓝卡=atk_*,紫卡=后缀,金卡='ult',白卡=gen_*)。 */
  perkId: string;
  /** 选中后到达的层数/等级。 */
  level: number;
  /** 所在格(0..2);金卡固定最后一格。 */
  slot: number;
  /** 金卡:不可放逐,刷新时保留。 */
  locked?: boolean;
  /** 归属英雄当前不在场(卡面置灰标注)。 */
  offField?: boolean;
  /** 紫卡:流派名。 */
  school?: string;
}

export interface GuardMods {
  /** 全队攻击 +%(词条累计;2026-09-18 起强化不再单独加攻击)。 */
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
    | 'chestDrop' | 'chestOpen' | 'levelUp' | 'bossCastStart' | 'bossCastHit' | 'bossCastInterrupt' | 'crystalSkill' | 'enhance' | 'cellsUnlock' | 'heroSkill' | 'sellHero' | 'bossSkill'
    | 'zoneTick' | 'ultUnlock' | 'perkGain' | 'perkProc' | 'freeEnhance';
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
  /** heroSkill(群体直击)/zoneTick(区域跳伤):本次被命中的全部怪物 id,渲染层逐只飘伤害(2026-09-11)。 */
  monsterIds?: number[];
  /** bossSkill:smash=近战重踏,volley=远程投射(渲染层分表现)。 */
  skillKind?: GuardBossSkillKind;
  /** heroAttack:本次出手的全部命中(主弹在首位);渲染层按它演多发弹道与逐只飘字。 */
  hits?: Array<{ monsterId: number; amount: number; kind: GuardHitKind }>;
  /** heroAttack:普攻原型(元素球/旋风/剑光/双匕/箭矢/盾枪/圣光)。 */
  pattern?: GuardAttackArchetype;
  /** heroAttack:会心暴击 / 巨型层数。 */
  crit?: boolean;
  giantLv?: number;
  /** heroAttack/perkProc/perkGain:触发或获得的词条(紫卡后缀或实例 id)。 */
  perkId?: string;
  /** heroSkill:该英雄的专属大招觉醒等级(0=未觉醒的通用战技)。 */
  ultLv?: number;
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
  /** 当前三选一来源。2026-09-18 起只有 'enhance'(付费必选);'levelUp' 保留供回退。 */
  choiceSource: 'levelUp' | 'enhance';
  /** 每次摇出新一组选项 +1,渲染层据此重建弹层。 */
  choiceSerial: number;
  rerollLeft: number;
  banishLeft: number;
  banished: string[];
  mods: GuardMods;
  /** 已选词条总次数(付费 + 赠送;标准模式 11 次封顶;抽取规则按它开闸)。 */
  enhanceLevel: number;
  /** 付费强化次数(价格档位按它走,赠送的不占档)。 */
  enhancePaid: number;
  /** 待用的免费强化(波末赠送,最多攒 2 次)。 */
  freeEnhance: number;
  enhanceCost: number;
  /** 词条抽取专用的派生随机流(不消耗主 rng:不买强化的对局与改版前逐位一致)。 */
  choiceRng: () => number;
  /** 每个英雄编码的词条状态。 */
  heroPerks: Record<string, GuardHeroPerks>;
  /** 白卡已选层数。 */
  whiteStacks: Record<string, number>;
  /** 金卡:已出现张数 / 上一张之后连续未出的层数;紫卡:连续未出层数。 */
  goldSeen: number;
  goldMiss: number;
  purpleMiss: number;
  /** 本波词条新增治疗量(每波上限 8%)。 */
  perkHealThisWave: number;
  /** 阿特拉斯·盾反的金印(0..3);契约魔女·血契累计扣掉的水晶;阿尔萨斯·龙焰爆上次触发的波次。 */
  riposteSeals: number;
  pactLost: number;
  dragonBurstWave: number;
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
  /** 怪物强度缩放(主线 P5 难度曲线;每日副本恒 1)。 */
  monsterScale: number;
  /** 每波怪物数量倍率(主线 2;每日 1)。 */
  spawnCountMult: number;
  /** 怪物血量额外倍率(只乘 HP;主线收紧用)。 */
  monsterHpMult: number;
  /** 怪物啃水晶倍率(缺省=√monsterHpMult 沿用主线难度包耦合;每日副本传 1 只加血不加啃咬)。 */
  monsterBiteMult: number;
  /** 小怪(非 BOSS/精英)额外血量倍率,叠乘在 monsterHpMult 之上(限时副本收紧用,缺省 1)。 */
  minionHpMult: number;
  /** 每英雄累计输出(heroCode→伤害;含普攻/技能/区域跳伤,2026-09-02 统计面板)。 */
  heroDamage: Record<string, number>;
  /** 辅助"圣辉涌泉"攻速增益截止时刻。 */
  supportSurgeUntilMs: number;
  /** 已解锁格数(6 起步,每累计召唤 GUARD_CELL_UNLOCK_EVERY 次 +1,按 rank 顺序开格)。 */
  unlockedCells: number;
  /** 车轮战累计击杀 BOSS 数(层数 = bossKills + wave,docs/30 口径)。 */
  bossKills: number;
  /** 车轮战下一只 BOSS 入场时刻(击杀后短暂间隔,下一只更强的入场)。 */
  nextRushBossAtMs: number;
}

// ── 配置(docs/30 待拍板口径;改数值只动这里)──
/** 2026-08-28 用户拍板分区布局:上下两排各 6 格贴地面顶/底,中间整条路怪物通行。 */
export const GUARD_GRID_ROWS = 2;
/** 总 12 格:开局开 6 格,之后每累计召唤 GUARD_CELL_UNLOCK_EVERY 次解锁 1 格(2026-08-26 用户拍板:逐格解锁)。 */
export const GUARD_GRID_COLS = 6;
export const GUARD_GRID_CELLS = GUARD_GRID_ROWS * GUARD_GRID_COLS;
export const GUARD_START_CELLS = 6;
export const GUARD_CELL_UNLOCK_EVERY = 4;
/** 解锁顺序=按列从左到右、列内从上到下:rank = col×行数 + row。 */
export function guardCellUnlockRank(cell: number): number {
  return (cell % GUARD_GRID_COLS) * GUARD_GRID_ROWS + Math.floor(cell / GUARD_GRID_COLS);
}
/** rank → cell(渲染层定位"下一个待解锁格")。 */
export function guardCellFromUnlockRank(rank: number): number {
  const col = Math.floor(rank / GUARD_GRID_ROWS);
  const row = rank % GUARD_GRID_ROWS;
  return row * GUARD_GRID_COLS + col;
}
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
// 2.2→1.75(2026-08-28 用户拍板:合成升星攻击翻倍太多):5★≈9.4×(原 23×)。
export const GUARD_STAR_ATTACK_MULT = 1.75;
export const GUARD_CRYSTAL_MAX_HP = 1600;

// 覆盖范围(2026-08-25 用户拍板:同类型英雄攻击范围与所站格子无关)——rangeCells=从水晶起算的覆盖距离,
// 怪物走进 [0, rangeCells] 即可被打;近战仍锁本车道。近战 6 / 远程 10(全跑道)/ 控制 8。
export const GUARD_ROLE_PROFILE: Record<GuardHeroRole, { rangeCells: number; intervalMs: number; damageScale: number; laneLocked: boolean }> = {
  // 2026-08-28 用户拍板:近战覆盖 9→6.3→6.9(2026-08-28 二调 +10%)且不再锁单车道——打全车道,只是够不远;飞行怪仍免疫近战。
  melee: { rangeCells: 6.9, intervalMs: 800, damageScale: 1.6, laneLocked: false },
  // 2026-09-07 用户拍板:远程覆盖 10.0→8.5(-15%)。
  ranged: { rangeCells: 8.5, intervalMs: 1200, damageScale: 1.25, laneLocked: false },
  support: { rangeCells: 6.0, intervalMs: 3000, damageScale: 0.35, laneLocked: false },
  control: { rangeCells: 8.0, intervalMs: 1500, damageScale: 0.7, laneLocked: false },
};
/** 主动技能(2★ 解锁,自动施放;参考蔚蓝星球主动技,2026-08-26 用户拍板"参考此图按横板做")。 */
export const GUARD_HERO_SKILL: Record<GuardHeroRole, { name: string; cdMs: number; desc: string }> = {
  melee: { name: '裂地横扫', cdMs: 12_000, desc: '对覆盖范围内所有敌人造成 200% 攻击,并击退 0.35 格' },
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

// P2:强化线/宝箱跳奖/三选一/BOSS 读条/水晶技能
/**
 * 强化改词条(2026-09-18 用户拍板):强化不再直接加攻击,付金币弹一次词条三选一;
 * 价格按次数走阶梯,标准模式买满 11 次封顶,车轮战(rush)超出后按末价继续。
 */
export const GUARD_ENHANCE_PRICES = [100, 200, 400, 600, 800, 1000, 1500, 1800, 2500, 3000, 3500];

/**
 * 下一次强化价格;标准模式选满 11 次返回 null(已封顶)。有免费强化(波末赠送)时为 0。
 * 价格档位只按付费次数走(赠送不占档);实测 10 波局金币只够买 2~5 次,所以另有波末赠送(docs/32 §2.2 甲案)。
 */
export function guardEnhanceNextCost(state: { mode: GuardMode; enhanceLevel: number; enhancePaid?: number; freeEnhance?: number }): number | null {
  if (state.mode === 'standard' && state.enhanceLevel >= GUARD_ENHANCE_PRICES.length) {
    return null;
  }
  if ((state.freeEnhance ?? 0) > 0) {
    return 0;
  }
  const paid = state.enhancePaid ?? state.enhanceLevel;
  return GUARD_ENHANCE_PRICES[Math.min(paid, GUARD_ENHANCE_PRICES.length - 1)];
}
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
// BOSS 经验 30→0(2026-09-18 用户拍板:击杀 BOSS 不再弹词条三选一,改掉豪华宝箱)。
export const GUARD_KILL_XP: Record<GuardMonsterKind, number> = { normal: 1, fast: 1, tank: 2, flying: 1, shooter: 2, elite: 10, boss: 0 };
// 速度整体 ×0.5(2026-08-26 用户拍板:怪物移动过快)。
const MONSTER_PROFILE: Record<GuardMonsterKind, { hpMult: number; speed: number; dmgMult: number; spineCodes: string[] }> = {
  normal: { hpMult: 1, speed: 0.28, dmgMult: 1, spineCodes: ['mutant_male', 'infected_male', 'goathead_blade'] },
  fast: { hpMult: 0.6, speed: 0.48, dmgMult: 0.7, spineCodes: ['medium_dog', 'medium_rat', 'small_spider'] },
  tank: { hpMult: 2.4, speed: 0.2, dmgMult: 1.2, spineCodes: ['large_bear', 'hammer_tanker', 'mutant_fatman'] },
  flying: { hpMult: 0.7, speed: 0.35, dmgMult: 0.8, spineCodes: ['small_bat', 'small_raven', 'crow_reaper'] },
  shooter: { hpMult: 0.9, speed: 0.25, dmgMult: 0.9, spineCodes: ['crossbow_male', 'bow_male', 'cursed_caster'] },
  elite: { hpMult: 8, speed: 0.22, dmgMult: 2.2, spineCodes: ['abyss_jailer', 'forge_overseer', 'gargoyle'] },
  boss: { hpMult: 40, speed: 0.14, dmgMult: 8, spineCodes: ['rock_golem', 'abyss_devilman', 'grand_magus'] },
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
// BOSS 技能(2026-08-28 用户拍板:BOSS 分近战/远程攻击范围,进入范围冷却制放技能):
// smash=近战重踏(进 3 格,水晶 4%/次),volley=远程投射(进 7 格,暗弹飞向水晶 3%/次);读条/踉跄期间不放。
export type GuardBossSkillKind = 'smash' | 'volley';
export const GUARD_BOSS_SKILL: Record<GuardBossSkillKind, { name: string; rangeCells: number; cdMs: number; crystalPct: number }> = {
  smash: { name: '裂地重踏', rangeCells: 3.0, cdMs: 9000, crystalPct: 0.04 },
  volley: { name: '暗焰投射', rangeCells: 7.0, cdMs: 8000, crystalPct: 0.03 },
};
/** BOSS 皮肤→技能类型(法系投射,武斗重踏)。 */
export const GUARD_BOSS_SKILL_TYPE: Record<string, GuardBossSkillKind> = {
  rock_golem: 'smash',
  abyss_devilman: 'smash',
  grand_magus: 'volley',
};
export function guardBossSkillKind(spineCode: string): GuardBossSkillKind {
  return GUARD_BOSS_SKILL_TYPE[spineCode] ?? 'smash';
}

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
export function guardWaveComposition(wave: number, rng: () => number, maxWave = 10, mode: GuardMode = 'standard', countMult = 1): Array<{ kind: GuardMonsterKind; lane: number; atMs: number }> {
  const spawns: Array<{ kind: GuardMonsterKind; lane: number; atMs: number }> = [];
  // 热身 6/8/10 只;第 4 波起 6+3×波(18/21/24…),上限 40(同屏性能护栏)。
  // countMult:主线 P5a2 怪量翻倍(2026-09-04 用户拍板);限时副本 ×3(2026-09-11 用户拍板)。
  // 上限按倍率分档,保证"翻几倍就是几倍"不被护栏吃掉:×1→40、×2→64、×3+→112。
  const base = wave <= 3 ? 4 + wave * 2 : 6 + wave * 3;
  const countCap = countMult >= 3 ? 112 : countMult > 1 ? 64 : 40;
  const count = Math.min(countCap, Math.round(base * countMult));
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

export function createGuardBattle(
  pool: GuardPoolHero[],
  seedText: string,
  maxWave = 10,
  mode: GuardMode = 'standard',
  opts?: {
    /** 怪物强度缩放(主线 P5:按关卡 recommended_power/基线,难度Ⅰ曲线整体乘;缺省 1=每日副本原样)。 */
    monsterScale?: number;
    /** 每波怪物数量倍率(主线 P5a2 翻倍;缺省 1=每日副本原样)。 */
    spawnCountMult?: number;
    /** 怪物血量额外倍率(主线收紧用,缺省 1)。 */
    monsterHpMult?: number;
    /** 怪物啃水晶倍率(缺省 √monsterHpMult;传 1 = 只加血不加啃咬)。 */
    monsterBiteMult?: number;
    /** 小怪(非 BOSS/精英)额外血量倍率,叠乘在 monsterHpMult 之上(缺省 1)。 */
    minionHpMult?: number;
  },
): GuardBattleState {
  const seed = guardHashSeed(seedText || 'guard');
  const rng = createGuardRng(seed);
  const monsterScale = Math.max(0.1, Math.min(10, opts?.monsterScale ?? 1));
  const spawnCountMult = Math.max(1, Math.min(3, opts?.spawnCountMult ?? 1));
  const monsterHpMult = Math.max(0.5, Math.min(10, opts?.monsterHpMult ?? 1));
  const monsterBiteMult = Math.max(0.5, Math.min(10, opts?.monsterBiteMult ?? Math.sqrt(monsterHpMult)));
  const minionHpMult = Math.max(0.5, Math.min(20, opts?.minionHpMult ?? 1));
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
    choiceSource: 'levelUp',
    choiceSerial: 0,
    rerollLeft: 1,
    banishLeft: 1,
    banished: [],
    mods: { teamAtkPct: 0, atkSpeedPct: 0, goldGainPct: 0, summonDiscount: 0, thornsPct: 0 },
    enhanceLevel: 0,
    enhancePaid: 0,
    freeEnhance: 0,
    enhanceCost: GUARD_ENHANCE_PRICES[0],
    choiceRng: createGuardRng((seed ^ 0x5bd1e995) >>> 0),
    heroPerks: {},
    whiteStacks: {},
    goldSeen: 0,
    goldMiss: 0,
    purpleMiss: 0,
    perkHealThisWave: 0,
    riposteSeals: 0,
    pactLost: 0,
    dragonBurstWave: -1,
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
    monsterScale,
    spawnCountMult,
    monsterHpMult,
    monsterBiteMult,
    minionHpMult,
    heroDamage: {},
    supportSurgeUntilMs: 0,
    unlockedCells: GUARD_START_CELLS,
    bossKills: 0,
    nextRushBossAtMs: GUARD_RUSH_FIRST_BOSS_DELAY_MS,
  };
}

export function guardFindHeroAt(state: GuardBattleState, cell: number): GuardHeroUnit | null {
  return state.heroes.find((hero) => hero.cell === cell) ?? null;
}

export function guardCellUnlocked(state: GuardBattleState, cell: number): boolean {
  return guardCellUnlockRank(cell) < state.unlockedCells;
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
  const unlockTarget = Math.min(GUARD_GRID_CELLS, GUARD_START_CELLS + Math.floor(state.summonCount / GUARD_CELL_UNLOCK_EVERY));
  if (unlockTarget > state.unlockedCells) {
    state.unlockedCells = unlockTarget;
    state.events.push({ type: 'cellsUnlock', timeMs: state.timeMs, amount: 1, cell: guardCellFromUnlockRank(unlockTarget - 1) });
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
    focusTargetId: null,
    focusStacks: 0,
  };
  state.heroes.push(unit);
  state.events.push({ type: 'summon', timeMs: state.timeMs, heroCode: unit.heroCode, star: 1, cell });
  return unit;
}

export type GuardEnhanceBlock = 'over' | 'capped' | 'busy' | 'gold';

/** 强化为何不可用:战斗已结束 / 标准模式买满 / 已有待选三选一 / 金币不足;可用返回 null。 */
export function guardEnhanceBlocked(state: GuardBattleState): GuardEnhanceBlock | null {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return 'over';
  }
  const cost = guardEnhanceNextCost(state);
  if (cost === null) {
    return 'capped';
  }
  if (state.pendingChoice) {
    return 'busy';
  }
  if (state.gold < cost) {
    return 'gold';
  }
  return null;
}

/**
 * 强化(2026-09-18 改版):付当前价 → 立刻弹词条三选一(必选,可刷新/放逐,不可跳过);不再直接加攻击。
 * 标准模式封顶 11 次(价格表长度):无上限强化=局内无限成长,账号养成失去闸门意义;rush 不封顶(层数爬升靠它)。
 */
export function guardEnhance(state: GuardBattleState): boolean {
  if (guardEnhanceBlocked(state)) {
    return false;
  }
  if (state.freeEnhance > 0) {
    state.freeEnhance -= 1;
  } else {
    state.gold -= guardEnhanceNextCost(state) ?? 0;
    state.enhancePaid += 1;
  }
  // 金卡位先判(与强化按钮公示的概率同一个函数、同一时点,逐位一致),再加层数、摇其余格。
  const gold = guardGoldCardChance(state);
  const wantGold = gold.available && (gold.forced || state.choiceRng() < gold.chance);
  state.enhanceLevel += 1;
  state.enhanceCost = guardEnhanceNextCost(state) ?? 0;
  state.pendingChoice = rollChoices(state, wantGold);
  const hasGold = state.pendingChoice.some((option) => option.rarity === 'gold');
  if (gold.available) {
    if (hasGold) {
      state.goldSeen += 1;
    } else {
      state.goldMiss += 1;
    }
  }
  if (state.heroes.length > 0) {
    state.purpleMiss = hasGold || state.pendingChoice.some((option) => option.rarity === 'purple') ? 0 : state.purpleMiss + 1;
  }
  state.choiceSource = 'enhance';
  state.choiceSerial += 1;
  state.events.push({ type: 'enhance', timeMs: state.timeMs, amount: state.enhanceLevel });
  return true;
}

/** 出售英雄(2026-08-26:格满且无可合成的死局解法——拖到水晶出售回金)。返回回收金币,不可售返回 null。
 *  回收价 = 当前召唤费 × 40% × 2^(星级-1)(近似投入成本的四成)。 */
export function guardSellHero(state: GuardBattleState, cell: number): number | null {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return null;
  }
  const hero = guardFindHeroAt(state, cell);
  if (!hero) {
    return null;
  }
  const value = Math.max(10, Math.round(guardCurrentSummonCost(state) * 0.4 * Math.pow(2, hero.star - 1)));
  state.heroes = state.heroes.filter((entry) => entry.unitId !== hero.unitId);
  state.gold += value;
  state.events.push({ type: 'sellHero', timeMs: state.timeMs, heroCode: hero.heroCode, star: hero.star, cell, amount: value });
  return value;
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
  const newStar = Math.min(GUARD_MAX_STAR, to.star + (superMerge ? 2 : 1));
  // 合成结果随机化(2026-09-10 用户拍板,Random Dice 式):升星后的英雄从召唤池均匀抽取——
  // 可能仍是合成时的英雄,也可能变身为阵容中其他英雄。确定性走 seeded rng(P3 复演不受影响)。
  // 实现为"移除两只+按新身份重生一只"(新 unitId),渲染层据此重建视图自动换骨骼。
  const pick = state.pool.length > 0 ? state.pool[Math.floor(state.rng() * state.pool.length)] : null;
  const mergedCode = pick ? pick.heroCode : to.heroCode;
  const mergedRole = pick ? pick.role : to.role;
  state.heroes = state.heroes.filter((hero) => hero.unitId !== from.unitId && hero.unitId !== to.unitId);
  const merged: GuardHeroUnit = {
    unitId: state.nextUnitId++,
    heroCode: mergedCode,
    star: newStar,
    cell: toCell,
    role: mergedRole,
    attackCooldownMs: 0,
    lastAttackAtMs: -10000,
    lastTargetId: null,
    attackCount: 0,
    skillReadyMs: state.timeMs + GUARD_HERO_SKILL_WARMUP_MS,
    focusTargetId: null,
    focusStacks: 0,
  };
  state.heroes.push(merged);
  state.events.push({
    type: superMerge ? 'superMerge' : 'merge',
    timeMs: state.timeMs,
    heroCode: mergedCode,
    star: newStar,
    cell: toCell,
    skillUnlocked: starBefore < 2 && newStar >= 2,
  });
  return superMerge ? 'superMerge' : 'merge';
}

/** T0 英雄守卫战力倍率(2026-09-07 专属技能体系,与 sql/110 被动增强配套):
 *  每稀有度一名"档位天花板/毕业之选",拿到即当前阶段最强,乘在最终攻击上。 */
const GUARD_T0_ATTACK_MULT_BY_CODE: Record<string, number> = {
  UR_ARTHAS: 1.35,
  SSR_LIVIA: 1.3,
  SR_SNIPER_05: 1.25,
  R_SCOUT_03: 1.2,
};

/** 是否 T0 英雄(详情页"毕业之选"标识与守卫战力倍率共用同一名单)。 */
export function isGuardT0Hero(heroCode: string | null | undefined): boolean {
  return !!GUARD_T0_ATTACK_MULT_BY_CODE[(heroCode || '').toUpperCase()];
}

/** 稀有度攻击倍率(2026-09-11 用户拍板:UR 与 R 要拉开数级伤害跨度;乘在守卫攻击上,与 T0 倍率叠乘)。 */
export const GUARD_RARITY_ATTACK_MULT: Record<string, number> = { R: 1, SR: 1.35, SSR: 1.8, UR: 2.4 };

export function guardHeroAttackValue(state: GuardBattleState, hero: GuardHeroUnit): number {
  const pool = state.pool.find((entry) => entry.heroCode === hero.heroCode);
  const base = pool?.baseAttack ?? 40;
  const profile = GUARD_ROLE_PROFILE[hero.role];
  const teamPct = state.mods.teamAtkPct;
  const t0Mult = GUARD_T0_ATTACK_MULT_BY_CODE[hero.heroCode.toUpperCase()] ?? 1;
  const rarityMult = GUARD_RARITY_ATTACK_MULT[(pool?.rarity ?? 'R').toUpperCase()] ?? 1;
  let perkMult = 1;
  const perks = state.heroPerks[hero.heroCode.toUpperCase()];
  if (perks && perks.purple > 0) {
    const purple = resolveGuardHeroPerkProfile(hero.heroCode, hero.role).purple;
    const value = purple ? purple.values[perks.purple - 1] : 0;
    if (purple?.suffix === 'veteran' || purple?.suffix === 'pact') {
      perkMult = 1 + value;
    } else if (purple?.suffix === 'fury') {
      perkMult = 1 + value * Math.floor((1 - state.crystalHp / state.crystalMaxHp) * 10 + 1e-9);
    } else if (purple?.suffix === 'formation') {
      const same = state.heroes.filter((unit) => unit.heroCode.toUpperCase() === hero.heroCode.toUpperCase()).length;
      perkMult = 1 + value * Math.min(4, Math.max(0, same - 1));
    }
  }
  return Math.max(1, Math.round(base * profile.damageScale * Math.pow(GUARD_STAR_ATTACK_MULT, hero.star - 1) * (1 + teamPct / 100) * t0Mult * rarityMult * perkMult));
}

// ── P2:XP(击杀经验只累计等级,不再弹词条,2026-09-19)──
function xpThreshold(level: number): number {
  // VS 分段线性:首级 5,每级 +10,21 级起 +13。
  return level <= 20 ? 5 + 10 * (level - 1) : 205 + 13 * (level - 20);
}

/**
 * 击杀经验:2026-09-18 用户反馈"局内击杀怪物还是有弹框选词条"——升级不再弹词条三选一。
 * 词条只从「强化」按钮获得(guardEnhance),击杀只给金币与经验计数;levelUp 事件保留给渲染层将来做飘字用。
 */
function grantXp(state: GuardBattleState, amount: number): void {
  state.xp += amount;
  state.xpIntoLevel += amount;
  while (state.xpIntoLevel >= xpThreshold(state.level)) {
    state.xpIntoLevel -= xpThreshold(state.level);
    state.level += 1;
    state.events.push({ type: 'levelUp', timeMs: state.timeMs, amount: state.level });
  }
}

// ── 词条体系(docs/32 v2,2026-09-21 用户拍板开工):白(通用)/蓝(普攻强化)/紫(英雄专属)/金(专属大招觉醒)──
// 词条状态按英雄编码存(heroPerks[heroCode]):合成换 unitId 或变身时词条不丢;合成身份不保留(用户拍板:作废也是运气)。
// 抽取全部走派生随机流 state.choiceRng,不消耗主 rng:不买强化的对局与改版前逐位一致。

/** 取(或建)某英雄编码的词条状态。 */
export function guardHeroPerks(state: GuardBattleState, heroCode: string): GuardHeroPerks {
  const code = (heroCode || '').toUpperCase();
  let perks = state.heroPerks[code];
  if (!perks) {
    perks = { blue: {}, purple: 0, ultLv: 0 };
    state.heroPerks[code] = perks;
  }
  return perks;
}

function guardPoolEntry(state: GuardBattleState, heroCode: string): GuardPoolHero | null {
  const code = (heroCode || '').toUpperCase();
  return state.pool.find((entry) => entry.heroCode.toUpperCase() === code) ?? null;
}

function guardHeroProfileOf(state: GuardBattleState, heroCode: string): GuardHeroPerkProfile {
  return resolveGuardHeroPerkProfile(heroCode, guardPoolEntry(state, heroCode)?.role ?? 'melee');
}

/** 卡面用的短名:取"·"后的名字(永夜龙骑·阿尔萨斯 → 阿尔萨斯)。 */
function guardHeroShortName(state: GuardBattleState, heroCode: string): string {
  const name = guardPoolEntry(state, heroCode)?.displayName ?? heroCode;
  const parts = name.split(/[·・]/);
  return (parts[parts.length - 1] || name).trim();
}

/** 某英雄编码在场单位的星级权重和(1/2/4/7/12);不在场为 0。 */
export function guardHeroFieldWeight(state: GuardBattleState, heroCode: string): number {
  const code = (heroCode || '').toUpperCase();
  let sum = 0;
  for (const hero of state.heroes) {
    if (hero.heroCode.toUpperCase() === code) {
      sum += GUARD_STAR_WEIGHT[Math.max(1, Math.min(GUARD_MAX_STAR, hero.star))];
    }
  }
  return sum;
}

function guardBlueLayers(perks: GuardHeroPerks): number {
  let sum = 0;
  for (const key of Object.keys(perks.blue)) {
    sum += perks.blue[key as GuardBluePerkId] ?? 0;
  }
  return sum;
}

/** 常驻出手频率 = 白卡攻速 × 急速,钳 ×2.0(无急速时与改版前"间隔 -x%,上限 50%"逐位一致)。 */
export function guardPermanentFrequency(state: GuardBattleState, heroCode: string): number {
  const white = 1 / (1 - Math.min(50, state.mods.atkSpeedPct) / 100);
  const haste = GUARD_HASTE_MULT[guardHeroPerks(state, heroCode).blue.atk_haste ?? 0] ?? 1;
  return Math.min(GUARD_FREQ_CAP, white * haste);
}

/** 金卡候选:在场、有 ≥2★ 单位(1★ 没有战技,觉醒了也是废卡)、觉醒未满级。 */
function guardGoldCandidates(state: GuardBattleState): string[] {
  const codes: string[] = [];
  for (const entry of state.pool) {
    const code = entry.heroCode.toUpperCase();
    if (codes.indexOf(code) >= 0 || guardHeroPerks(state, code).ultLv >= GUARD_ULT_MAX_LEVEL) {
      continue;
    }
    if (state.heroes.some((hero) => hero.heroCode.toUpperCase() === code && hero.star >= 2)) {
      codes.push(code);
    }
  }
  return codes;
}

/**
 * 下一次强化的金卡概率(强化按钮常驻公示,与实际判定同一个函数,逐位一致)。
 * 第 1 次 25%;首张最晚第 2 次必出;之后 12% + 12%×n(n=连续未出层数),每个 ≥3★ 单位 +3%(封顶 +12%),最多连续 3 次不出。
 * 没有候选(场上没有 ≥2★ 单位)时 available=false,本层不判金卡、保底计数不动。
 */
export function guardGoldCardChance(state: GuardBattleState): { chance: number; forced: boolean; available: boolean } {
  if (guardGoldCandidates(state).length === 0) {
    return { chance: 0, forced: false, available: false };
  }
  if (state.goldSeen === 0) {
    const upcoming = state.enhanceLevel + 1;
    return upcoming <= 1
      ? { chance: GUARD_GOLD_FIRST_CHANCE, forced: false, available: true }
      : { chance: 1, forced: true, available: true };
  }
  if (state.goldMiss >= GUARD_GOLD_MAX_MISS) {
    return { chance: 1, forced: true, available: true };
  }
  const star3 = state.heroes.filter((hero) => hero.star >= 3).length;
  const chance = GUARD_GOLD_BASE_CHANCE + GUARD_GOLD_STEP_CHANCE * state.goldMiss + Math.min(GUARD_GOLD_STAR3_BONUS_CAP, GUARD_GOLD_STAR3_BONUS * star3);
  return { chance: Math.min(1, chance), forced: false, available: true };
}

function guardPickWeighted<T>(rng: () => number, entries: Array<{ item: T; weight: number }>): T | null {
  const usable = entries.filter((entry) => entry.weight > 0);
  if (usable.length === 0) {
    return null;
  }
  const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of usable) {
    roll -= entry.weight;
    if (roll < 0) {
      return entry.item;
    }
  }
  return usable[usable.length - 1].item;
}

interface GuardRollContext {
  taken: Set<string>;
  heroCount: Record<string, number>;
}

/** 蓝/紫格的英雄权重:在场=星级权重和;上阵不在场=前 3 次强化 0、之后 0.25;辅助在蓝格 ×0.5。 */
function guardChoiceHeroWeight(state: GuardBattleState, heroCode: string, forBlue: boolean): number {
  const field = guardHeroFieldWeight(state, heroCode);
  let weight = field > 0 ? field : (state.enhanceLevel >= GUARD_OFFFIELD_FROM_PICK ? GUARD_OFFFIELD_WEIGHT : 0);
  if (forBlue && guardPoolEntry(state, heroCode)?.role === 'support') {
    weight *= GUARD_SUPPORT_BLUE_WEIGHT;
  }
  return weight;
}

function guardAvailableBluePerks(state: GuardBattleState, heroCode: string, ctx: GuardRollContext, onlyIds?: GuardBluePerkId[]): GuardBluePerkDef[] {
  const perks = guardHeroPerks(state, heroCode);
  if (guardBlueLayers(perks) >= GUARD_BLUE_LAYERS_PER_HERO) {
    return [];
  }
  const profile = guardHeroProfileOf(state, heroCode);
  const ownedForm = GUARD_BLUE_PERKS.find((def) => def.category === 'form' && (perks.blue[def.id] ?? 0) > 0) ?? null;
  return GUARD_BLUE_PERKS.filter((def) => {
    if (onlyIds && onlyIds.indexOf(def.id) < 0) {
      return false;
    }
    if (def.archetypes && def.archetypes.indexOf(profile.archetype) < 0) {
      return false;
    }
    if ((perks.blue[def.id] ?? 0) >= def.maxStack) {
      return false;
    }
    if (def.category === 'form' && ownedForm && ownedForm.id !== def.id) {
      return false;
    }
    if (def.id === 'atk_haste' && guardPermanentFrequency(state, heroCode) >= GUARD_FREQ_POOL_CUTOFF) {
      return false;
    }
    const instanceId = `${def.id}@${heroCode}`;
    return !ctx.taken.has(instanceId) && state.banished.indexOf(instanceId) < 0;
  });
}

function guardMakeBlueOption(state: GuardBattleState, ctx: GuardRollContext, onlyIds?: GuardBluePerkId[], fixedHero?: string): GuardChoiceOption | null {
  const rng = state.choiceRng;
  const codes = fixedHero ? [fixedHero] : Array.from(new Set(state.pool.map((entry) => entry.heroCode.toUpperCase())));
  const candidates = codes
    .filter((code) => (ctx.heroCount[code] ?? 0) < 2 && guardAvailableBluePerks(state, code, ctx, onlyIds).length > 0)
    .map((code) => ({ item: code, weight: fixedHero ? 1 : guardChoiceHeroWeight(state, code, true) }));
  const heroCode = guardPickWeighted(rng, candidates);
  if (!heroCode) {
    return null;
  }
  const perks = guardHeroPerks(state, heroCode);
  const available = guardAvailableBluePerks(state, heroCode, ctx, onlyIds);
  const owned = available.filter((def) => (perks.blue[def.id] ?? 0) > 0);
  // 已拥有偏置:在场英雄 45% 概率先从"已持有未满层"里抽升级(顺序固定:先抽英雄再做偏置)。
  const useOwned = guardHeroFieldWeight(state, heroCode) > 0 && owned.length > 0 && rng() < GUARD_OWNED_BIAS;
  const list = useOwned ? owned : available;
  const def = list[Math.floor(rng() * list.length)];
  const level = (perks.blue[def.id] ?? 0) + 1;
  const profile = guardHeroProfileOf(state, heroCode);
  return {
    id: `${def.id}@${heroCode}`,
    title: `【${guardHeroShortName(state, heroCode)}】${GUARD_ARCHETYPE_LABEL[profile.archetype]}·${def.name}${level > 1 ? ` Lv${level}` : ''}`,
    detail: def.describe(level),
    rarity: 'blue',
    heroCode,
    perkId: def.id,
    level,
    slot: 0,
    offField: guardHeroFieldWeight(state, heroCode) <= 0,
  };
}

function guardMakePurpleOption(state: GuardBattleState, ctx: GuardRollContext): GuardChoiceOption | null {
  const codes = Array.from(new Set(state.pool.map((entry) => entry.heroCode.toUpperCase())));
  const candidates = codes
    .filter((code) => {
      const purple = guardHeroProfileOf(state, code).purple;
      if (!purple || (ctx.heroCount[code] ?? 0) >= 2 || guardHeroPerks(state, code).purple >= 3) {
        return false;
      }
      if (purple.standardOnly && state.mode === 'rush') {
        return false;
      }
      const instanceId = guardPurplePerkId(code, purple.suffix);
      return !ctx.taken.has(instanceId) && state.banished.indexOf(instanceId) < 0;
    })
    .map((code) => ({ item: code, weight: guardChoiceHeroWeight(state, code, false) }));
  const heroCode = guardPickWeighted(state.choiceRng, candidates);
  if (!heroCode) {
    return null;
  }
  const purple = guardHeroProfileOf(state, heroCode).purple;
  if (!purple) {
    return null;
  }
  const level = guardHeroPerks(state, heroCode).purple + 1;
  return {
    id: guardPurplePerkId(heroCode, purple.suffix),
    title: `【${guardHeroShortName(state, heroCode)}】${purple.name}${level > 1 ? ` Lv${level}` : ''}`,
    detail: purple.describe(purple.values[level - 1]),
    rarity: 'purple',
    heroCode,
    perkId: purple.suffix,
    level,
    slot: 0,
    school: purple.school,
    offField: guardHeroFieldWeight(state, heroCode) <= 0,
  };
}

const GUARD_WHITE_IDS: GuardWhitePerkId[] = ['gen_team_atk', 'gen_team_aspd', 'gen_gold_gain', 'gen_summon_discount', 'gen_crystal_repair', 'gen_thorns'];

function guardDescribeWhite(state: GuardBattleState, id: GuardWhitePerkId): { title: string; detail: string } {
  const value = guardWhiteValue(id, state.mode === 'rush');
  switch (id) {
    case 'gen_team_atk': return { title: `全队攻击 +${value}%`, detail: '立即生效,可叠加' };
    case 'gen_team_aspd': return { title: `全队攻速 +${value}%`, detail: '缩短出手间隔,可叠加' };
    case 'gen_gold_gain': return { title: `金币获取 +${value}%`, detail: '击杀金币加成,可叠加' };
    case 'gen_summon_discount': return { title: `召唤费 -${value}`, detail: '召唤更便宜(下限 30)' };
    case 'gen_thorns': return { title: `水晶荆棘 +${value}%`, detail: '啃水晶的怪反伤更痛,可叠加' };
    default: return { title: `水晶修复 ${value}%`, detail: '立即回复水晶生命' };
  }
}

function guardMakeWhiteOption(state: GuardBattleState, ctx: GuardRollContext): GuardChoiceOption {
  const usable = GUARD_WHITE_IDS.filter((id) => {
    if (ctx.taken.has(id) || state.banished.indexOf(id) >= 0 || (state.whiteStacks[id] ?? 0) >= GUARD_WHITE_CAP[id]) {
      return false;
    }
    if (id === 'gen_crystal_repair' && state.crystalHp >= state.crystalMaxHp * 0.9) {
      return false;
    }
    // 攻速已逼近常驻频率钳时不再出(出了也是被钳掉的死卡)。
    return !(id === 'gen_team_aspd' && 1 / (1 - Math.min(50, state.mods.atkSpeedPct) / 100) >= GUARD_FREQ_POOL_CUTOFF);
  });
  // 池子被上限/放逐掏空时用水晶修复兜底(允许重复),保证每格都有卡。
  const id = usable.length > 0 ? usable[Math.floor(state.choiceRng() * usable.length)] : 'gen_crystal_repair';
  const text = guardDescribeWhite(state, id);
  return { id, title: text.title, detail: text.detail, rarity: 'white', perkId: id, level: (state.whiteStacks[id] ?? 0) + 1, slot: 0 };
}

function guardMakeGoldOption(state: GuardBattleState): GuardChoiceOption | null {
  const candidates = guardGoldCandidates(state);
  const allSupport = candidates.every((code) => guardPoolEntry(state, code)?.role === 'support');
  const entries = candidates.map((code) => {
    const awakened = guardHeroPerks(state, code).ultLv > 0;
    // 阶段系数:第 4 次强化之前未觉醒 ×2(先把大招铺开),之后已觉醒 ×2(把主角做深)。
    const phase = state.enhanceLevel < 4 ? (awakened ? 1 : 2) : (awakened ? 2 : 1);
    // 首张金卡尽量不是一个回血:辅助权重 ×0.3(候选全是辅助时不生效)。
    const support = state.goldSeen === 0 && !allSupport && guardPoolEntry(state, code)?.role === 'support' ? GUARD_SUPPORT_FIRST_GOLD_WEIGHT : 1;
    return { item: code, weight: guardHeroFieldWeight(state, code) * phase * support };
  });
  const heroCode = guardPickWeighted(state.choiceRng, entries);
  if (!heroCode) {
    return null;
  }
  const level = guardHeroPerks(state, heroCode).ultLv + 1;
  return {
    id: `ult@${heroCode}`,
    title: `【${guardHeroShortName(state, heroCode)}】${level <= 1 ? '专属大招觉醒' : `专属大招 Lv${level}`}`,
    detail: describeGuardUltLevel(level),
    rarity: 'gold',
    heroCode,
    perkId: 'ult',
    level,
    slot: 0,
    locked: true,
  };
}

/** 一个非金格:按进度开闸掷稀有度,抽不到就依次降级,白卡兜底。 */
function guardMakeNormalOption(state: GuardBattleState, ctx: GuardRollContext, forcePurple: boolean): GuardChoiceOption {
  let option: GuardChoiceOption | null = null;
  if (state.heroes.length > 0) {
    const gate = guardRarityGate(state.enhanceLevel);
    const rolled = guardPickWeighted<GuardPerkRarity>(state.choiceRng, [
      { item: 'white', weight: gate.white },
      { item: 'blue', weight: gate.blue },
      { item: 'purple', weight: gate.purple },
    ]) ?? 'white';
    const order: GuardPerkRarity[] = forcePurple ? ['purple', 'blue'] : rolled === 'purple' ? ['purple', 'blue'] : rolled === 'blue' ? ['blue', 'purple'] : [];
    for (const rarity of order) {
      option = rarity === 'purple' ? guardMakePurpleOption(state, ctx) : guardMakeBlueOption(state, ctx);
      if (option) {
        break;
      }
    }
  }
  const made = option ?? guardMakeWhiteOption(state, ctx);
  ctx.taken.add(made.id);
  if (made.heroCode) {
    ctx.heroCount[made.heroCode] = (ctx.heroCount[made.heroCode] ?? 0) + 1;
  }
  return made;
}

/** 摇一层三选一。wantGold 由 guardEnhance 用 guardGoldCardChance 在加层数之前判定(与按钮公示同源)。 */
function rollChoices(state: GuardBattleState, wantGold: boolean): GuardChoiceOption[] {
  const ctx: GuardRollContext = { taken: new Set<string>(), heroCount: {} };
  const gold = wantGold && state.heroes.length > 0 ? guardMakeGoldOption(state) : null;
  if (gold?.heroCode) {
    ctx.taken.add(gold.id);
    ctx.heroCount[gold.heroCode] = 1;
  }
  const normalSlots = gold ? 2 : 3;
  const options: GuardChoiceOption[] = [];
  // 紫卡保底:连续 2 层没出紫卡及以上,这一层必含 1 张(金卡也算,有金卡就不用补)。
  const needPurple = !gold && state.heroes.length > 0 && state.purpleMiss >= 2;
  for (let slot = 0; slot < normalSlots; slot += 1) {
    let option: GuardChoiceOption | null = null;
    if (state.enhanceLevel === 1 && slot === 0 && state.heroes.length > 0) {
      // 首抽第 1 格固定:给场上权重最高的英雄一张数量/形态类蓝卡,保证首抽 1 秒内画面就变。
      const top = Array.from(new Set(state.heroes.map((hero) => hero.heroCode.toUpperCase())))
        .sort((a, b) => guardHeroFieldWeight(state, b) - guardHeroFieldWeight(state, a) || (a < b ? -1 : 1))[0];
      option = guardMakeBlueOption(state, ctx, ['atk_multishot', 'atk_spread', 'atk_pierce'], top);
      if (option) {
        ctx.taken.add(option.id);
        ctx.heroCount[top] = (ctx.heroCount[top] ?? 0) + 1;
      }
    }
    if (!option) {
      const hasPurple = options.some((entry) => entry.rarity === 'purple');
      option = guardMakeNormalOption(state, ctx, needPurple && !hasPurple && slot === normalSlots - 1);
    }
    options.push(option);
  }
  if (gold) {
    options.push(gold);
  }
  options.forEach((option, index) => { option.slot = index; });
  return options;
}

function applyChoice(state: GuardBattleState, option: GuardChoiceOption): void {
  if (option.rarity === 'white') {
    const id = option.perkId as GuardWhitePerkId;
    const value = guardWhiteValue(id, state.mode === 'rush');
    state.whiteStacks[id] = (state.whiteStacks[id] ?? 0) + 1;
    switch (id) {
      case 'gen_team_atk': state.mods.teamAtkPct += value; break;
      case 'gen_team_aspd': state.mods.atkSpeedPct = Math.min(50, state.mods.atkSpeedPct + value); break;
      case 'gen_gold_gain': state.mods.goldGainPct += value; break;
      case 'gen_summon_discount': state.mods.summonDiscount += value; break;
      case 'gen_thorns': state.mods.thornsPct += value; break;
      default: state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + Math.round(state.crystalMaxHp * value / 100)); break;
    }
    return;
  }
  if (!option.heroCode) {
    return;
  }
  const perks = guardHeroPerks(state, option.heroCode);
  if (option.rarity === 'blue') {
    perks.blue[option.perkId as GuardBluePerkId] = option.level;
  } else if (option.rarity === 'purple') {
    perks.purple = option.level;
  } else if (option.rarity === 'gold') {
    perks.ultLv = Math.min(GUARD_ULT_MAX_LEVEL, option.level);
    // 试放:只让该英雄星级最高的 1 个单位立刻就绪(跳过预热);场上没目标时等首个目标出现即放。
    const code = option.heroCode.toUpperCase();
    const best = state.heroes
      .filter((hero) => hero.heroCode.toUpperCase() === code && hero.star >= 2)
      .sort((a, b) => b.star - a.star || a.unitId - b.unitId)[0];
    if (best) {
      best.skillReadyMs = state.timeMs;
    }
    state.events.push({ type: 'ultUnlock', timeMs: state.timeMs, heroCode: option.heroCode, amount: perks.ultLv, cell: best?.cell });
  }
  state.events.push({ type: 'perkGain', timeMs: state.timeMs, heroCode: option.heroCode, perkId: option.id, amount: option.level });
}

function afterChoiceResolved(state: GuardBattleState, chosen: GuardChoiceOption | null): void {
  // 金卡保底记账:选了金卡清零;出现了没选,n 减半取整(不白白清零)。
  if (state.pendingChoice?.some((option) => option.rarity === 'gold')) {
    state.goldMiss = chosen?.rarity === 'gold' ? 0 : Math.floor(state.goldMiss / 2);
  }
  // 选完即关:词条弹框只由强化触发(2026-09-18),不再因攒够经验接着弹下一个。
  state.pendingChoice = null;
}

export function guardChooseOption(state: GuardBattleState, index: number): boolean {
  const option = state.pendingChoice?.[index];
  if (!option) {
    return false;
  }
  applyChoice(state, option);
  afterChoiceResolved(state, option);
  return true;
}

/** 跳过=换 50 金币;强化弹出的词条不可跳过(现在只有强化这一个来源,此函数恒返回 false,保留供回退)。 */
export function guardSkipChoice(state: GuardBattleState): boolean {
  if (!state.pendingChoice || state.choiceSource === 'enhance') {
    return false;
  }
  state.gold += 50;
  afterChoiceResolved(state, null);
  return true;
}

/** 刷新:只重摇非金格;金卡仍是金卡但重抽英雄归属;不重判金卡位、不动任何保底计数。 */
export function guardRerollChoice(state: GuardBattleState): boolean {
  if (!state.pendingChoice || state.rerollLeft <= 0) {
    return false;
  }
  state.rerollLeft -= 1;
  const hadGold = state.pendingChoice.some((option) => option.rarity === 'gold');
  state.pendingChoice = rollChoices(state, hadGold);
  state.choiceSerial += 1;
  return true;
}

/** 放逐:只替换被放逐的那一格(其余两格原样保留);金卡不可放逐;按实例 id 记,本局不再出现。 */
export function guardBanishChoice(state: GuardBattleState, index: number): boolean {
  const option = state.pendingChoice?.[index];
  if (!state.pendingChoice || !option || option.locked || state.banishLeft <= 0) {
    return false;
  }
  state.banishLeft -= 1;
  state.banished.push(option.id);
  const ctx: GuardRollContext = { taken: new Set<string>(), heroCount: {} };
  state.pendingChoice.forEach((entry, entryIndex) => {
    if (entryIndex === index) {
      return;
    }
    ctx.taken.add(entry.id);
    if (entry.heroCode) {
      ctx.heroCount[entry.heroCode] = (ctx.heroCount[entry.heroCode] ?? 0) + 1;
    }
  });
  const replacement = guardMakeNormalOption(state, ctx, false);
  replacement.slot = index;
  state.pendingChoice[index] = replacement;
  state.choiceSerial += 1;
  return true;
}

// ── P2:宝箱跳奖 ──
export interface GuardChestReward {
  kind: 'gold' | 'summon' | 'teamAtk';
  amount: number;
  label: string;
}

/**
 * 开箱:普通箱跳奖档位 3%→5连 / 10%→3连 / 其余 1连(账号前 3 箱由渲染层传 scriptTier 固定 1-3-5);
 * 豪华箱(BOSS 掉落)固定 5 连、金币件翻倍,不吃新手脚本。
 * 返回逐件奖励(渲染层轮盘演出逐件揭示);奖励立即入账。
 */
export function guardOpenChest(state: GuardBattleState, chestId: number, scriptTier?: 1 | 3 | 5): { tier: number; rewards: GuardChestReward[]; grade: GuardChestGrade } | null {
  const chestIndex = state.chests.findIndex((chest) => chest.chestId === chestId);
  if (chestIndex < 0) {
    return null;
  }
  const grade: GuardChestGrade = state.chests[chestIndex].grade ?? 'normal';
  state.chests.splice(chestIndex, 1);
  state.chestOpenedCount += 1;
  let tier: number;
  if (grade === 'deluxe') {
    tier = 5;
  } else if (scriptTier) {
    tier = scriptTier;
  } else {
    const roll = state.rng();
    tier = roll < GUARD_CHEST_TIER5_CHANCE ? 5 : roll < GUARD_CHEST_TIER5_CHANCE + GUARD_CHEST_TIER3_CHANCE ? 3 : 1;
  }
  const goldBase = grade === 'deluxe' ? 300 : 150;
  const rewards: GuardChestReward[] = [];
  for (let i = 0; i < tier; i += 1) {
    const roll = state.rng();
    if (roll < 0.45) {
      const amount = Math.round(goldBase * (1 + state.mods.goldGainPct / 100));
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
  return { tier, rewards, grade };
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
function killMonster(state: GuardBattleState, monster: GuardMonster, killerCode: string | null = null): void {
  monster.dead = true;
  monster.diedAtMs = state.timeMs;
  state.killCount += 1;
  // 击杀金币随怪物所属波次成长(+6%/波):怪血 wave^1.08 超线性,经济不同步涨则 15 波后必然入不敷出。
  // ÷spawnCountMult:主线怪量翻倍后单只金币减半(总收入中性),否则怪越多经济越富、难度自抵消。
  const gold = Math.round(GUARD_KILL_GOLD[monster.kind] * (1 + 0.06 * monster.spawnedWave) * (1 + state.mods.goldGainPct / 100) / state.spawnCountMult);
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
  if (monster.kind === 'elite' || monster.kind === 'boss') {
    const chest: GuardChest = {
      chestId: state.nextChestId++,
      x: monster.x,
      lane: monster.lane,
      droppedAtMs: state.timeMs,
      grade: monster.kind === 'boss' ? 'deluxe' : 'normal',
    };
    state.chests.push(chest);
    state.events.push({ type: 'chestDrop', timeMs: state.timeMs, chestId: chest.chestId });
  }
  state.events.push({ type: 'kill', timeMs: state.timeMs, monsterId: monster.monsterId, amount: gold, heroCode: killerCode ?? undefined });
  if (killerCode) {
    guardOnKillPerks(state, monster, killerCode.toUpperCase());
  }
}

let guardKillPerkDepth = 0;

/** 按编码计的击杀触发:莉维娅·余烬爆燃(不连锁)、阿尔萨斯·屠龙者击杀精英的龙焰爆(每波 1 次)。 */
function guardOnKillPerks(state: GuardBattleState, monster: GuardMonster, killerCode: string): void {
  if (guardKillPerkDepth > 0) {
    return;
  }
  const perks = state.heroPerks[killerCode];
  if (!perks || perks.purple <= 0) {
    return;
  }
  const purple = resolveGuardHeroPerkProfile(killerCode, 'melee').purple;
  if (!purple) {
    return;
  }
  const value = purple.values[perks.purple - 1];
  let victims: GuardMonster[] = [];
  let coef = 0;
  if (purple.suffix === 'pyre') {
    victims = state.monsters
      .filter((other) => !other.dead && other !== monster && Math.abs(other.x - monster.x) <= 0.8)
      .sort((a, b) => Math.abs(a.x - monster.x) - Math.abs(b.x - monster.x) || a.monsterId - b.monsterId)
      .slice(0, 4);
    coef = value;
  } else if (purple.suffix === 'dragonslayer' && monster.kind === 'elite' && state.dragonBurstWave !== state.wave) {
    state.dragonBurstWave = state.wave;
    victims = state.monsters
      .filter((other) => !other.dead && other !== monster)
      .sort((a, b) => a.x - b.x || a.monsterId - b.monsterId)
      .slice(0, 10);
    coef = 1.5;
  }
  const amount = Math.round(guardCodeAttackValue(state, killerCode) * coef);
  if (victims.length === 0 || amount <= 0) {
    return;
  }
  state.events.push({ type: 'perkProc', timeMs: state.timeMs, heroCode: killerCode, perkId: purple.suffix, amount, monsterId: monster.monsterId, monsterIds: victims.map((other) => other.monsterId) });
  guardKillPerkDepth += 1;
  try {
    for (const other of victims) {
      state.heroDamage[killerCode] = (state.heroDamage[killerCode] ?? 0) + amount;
      damageMonster(state, other, amount, null, killerCode);
    }
  } finally {
    guardKillPerkDepth -= 1;
  }
}

function damageMonster(state: GuardBattleState, monster: GuardMonster, damage: number, byHero: GuardHeroUnit | null, sourceCode: string | null = null): void {
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
  if (byHero) {
    state.heroDamage[byHero.heroCode] = (state.heroDamage[byHero.heroCode] ?? 0) + damage;
  }
  if (monster.hp <= 0) {
    killMonster(state, monster, byHero?.heroCode ?? sourceCode);
  }
}

function startWave(state: GuardBattleState): void {
  state.wave += 1;
  state.phase = 'wave';
  state.waveStartedAtMs = state.timeMs;
  const spawns = state.nextWaveSpawns ?? guardWaveComposition(state.wave, state.rng, state.maxWave, state.mode, state.spawnCountMult);
  state.nextWaveSpawns = null;
  state.pendingSpawns = spawns.map((spawn) => ({ ...spawn, atMs: spawn.atMs + state.timeMs }));
  state.gold += GUARD_WAVE_WAGE_BASE + state.wave * 10;
  state.events.push({ type: 'waveStart', timeMs: state.timeMs, wave: state.wave });
  state.perkHealThisWave = 0;
  // 契约魔女·血契:她有单位在场的波次开始时扣水晶(单局 ≤12%,不低于 10%;车轮战该卡不入池)。
  const witch = state.heroPerks.SR_WITCH_03;
  if (witch && witch.purple > 0 && state.mode !== 'rush' && state.heroes.some((hero) => hero.heroCode.toUpperCase() === 'SR_WITCH_03')) {
    const want = Math.round(state.crystalMaxHp * [0.02, 0.03, 0.04][witch.purple - 1]);
    const allowed = Math.min(want, Math.round(state.crystalMaxHp * 0.12) - state.pactLost, state.crystalHp - Math.round(state.crystalMaxHp * 0.1));
    if (allowed > 0) {
      state.pactLost += allowed;
      state.crystalHp -= allowed;
      state.events.push({ type: 'perkProc', timeMs: state.timeMs, heroCode: 'SR_WITCH_03', perkId: 'pact', amount: allowed });
    }
  }
}

/** 波末赠送强化(docs/32 §2.2 甲案):标准模式在指定波结束时送 1 次,走同一个强化按钮;最多攒 2 次,封顶/攒满改发局内金币。 */
function guardGrantFreeEnhance(state: GuardBattleState): void {
  if (state.mode !== 'standard' || guardFreeEnhanceWaves(state.maxWave).indexOf(state.wave) < 0) {
    return;
  }
  if (state.freeEnhance >= GUARD_FREE_ENHANCE_BANK || state.enhanceLevel + state.freeEnhance >= GUARD_ENHANCE_PRICES.length) {
    state.gold += GUARD_FREE_ENHANCE_FALLBACK_GOLD;
    state.events.push({ type: 'freeEnhance', timeMs: state.timeMs, amount: 0 });
    return;
  }
  state.freeEnhance += 1;
  state.events.push({ type: 'freeEnhance', timeMs: state.timeMs, amount: state.freeEnhance });
}

function spawnMonster(state: GuardBattleState, kind: GuardMonsterKind, lane: number, opts?: { refWave?: number; speed?: number }): void {
  const profile = MONSTER_PROFILE[kind];
  const refWave = Math.max(1, opts?.refWave ?? state.wave);
  // monsterScale:主线 P5 关卡难度曲线(HP 全乘;啃咬伤害 ^0.85 软化,低层不至于刮痧、高层不至于秒晶)。
  const minionMult = kind === 'boss' || kind === 'elite' ? 1 : state.minionHpMult;
  const hp = Math.max(1, Math.round(MONSTER_BASE_HP * profile.hpMult * Math.pow(refWave, MONSTER_HP_WAVE_EXP) * state.monsterScale * state.monsterHpMult * minionMult));
  const monster: GuardMonster = {
    monsterId: state.nextMonsterId++,
    kind,
    lane,
    x: GUARD_SPAWN_X,
    hp,
    maxHp: hp,
    speedCellsPerSec: opts?.speed ?? profile.speed * (0.88 + state.rng() * 0.24),
    crystalDamage: Math.max(1, Math.round(MONSTER_BASE_CRYSTAL_DMG * profile.dmgMult * Math.pow(refWave, 0.95) * Math.pow(state.monsterScale, 0.85) * state.monsterBiteMult)),
    attackCooldownMs: 0,
    slowUntilMs: 0,
    stunnedUntilMs: 0,
    spawnedWave: state.wave,
    spineCode: profile.spineCodes[Math.floor(state.rng() * profile.spineCodes.length)],
    skillReadyMs: kind === 'boss' ? state.timeMs + 5000 : 0,
    dead: false,
    diedAtMs: 0,
  };
  state.monsters.push(monster);
  if (kind === 'boss') {
    state.nextBossCastMs = state.timeMs + GUARD_BOSS_CAST_INTERVAL_MS;
  }
}

/**
 * 近战能否命中该怪(2026-09-11):飞行怪在飞行途中免疫近战(阵容检查器),
 * 落地啃水晶后视为落地目标,近战可打——避免"怪在啃水晶、近战全程发呆"。
 */
function guardMeleeCanHit(monster: GuardMonster): boolean {
  return monster.kind !== 'flying' || monster.x <= GUARD_CRYSTAL_REACH_X + 0.01;
}

/** 主动技能施放(2★,冷却制,自动):近战横扫/远程灼烧区/控制旋风/辅助圣辉。返回是否成功施放。 */
function castHeroSkill(state: GuardBattleState, hero: GuardHeroUnit): boolean {
  const profile = GUARD_ROLE_PROFILE[hero.role];
  const attack = guardHeroAttackValue(state, hero);
  const skill = GUARD_HERO_SKILL[hero.role];
  // 金卡觉醒(docs/32 §5.1 方案 A):战技升级为专属大招——伤害/回复 ×1.5(Lv2 ×1.95),Lv3 击退/持续 +50%。
  const ultLv = guardHeroPerks(state, hero.heroCode).ultLv;
  const ultMult = GUARD_ULT_DAMAGE_MULT[ultLv] ?? 1;
  const ultExtent = ultLv >= GUARD_ULT_MAX_LEVEL ? GUARD_ULT_LV3_EXTENT : 1;
  if (hero.role === 'melee') {
    // 2026-09-11 用户拍板:横扫打覆盖范围内全部敌人(此前硬编码只打本车道,与普攻
    // laneLocked=false 不一致,观感"特效扫过一片却只有一只掉血")。飞行怪落地啃水晶后可被打。
    const targets = state.monsters.filter((monster) => !monster.dead && guardMeleeCanHit(monster) && monster.x <= profile.rangeCells);
    if (targets.length === 0) {
      return false;
    }
    const damage = Math.round(attack * 2.0 * ultMult);
    // 特效锚点取命中群按 x 排序的中位怪(2026-09-11 用户反馈:锚在数组首怪时横扫画到射程外的怪身上,
    // "看着打右边、掉血在左边");中位锚点让斩击艺术覆盖命中簇本身。
    const sortedByX = [...targets].sort((a, b) => a.x - b.x);
    const anchorId = sortedByX[Math.floor(sortedByX.length / 2)].monsterId;
    for (const monster of targets) {
      monster.x = Math.min(GUARD_SPAWN_X, monster.x + 0.35 * ultExtent);
      damageMonster(state, monster, damage, hero);
    }
    state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name, amount: damage, monsterId: anchorId, monsterIds: targets.map((monster) => monster.monsterId), ultLv });
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
      tickDamage: Math.max(1, Math.round(attack * 0.5 * ultMult)),
      tickMs: 500,
      nextTickAtMs: state.timeMs + 250,
      untilMs: state.timeMs + 4000 * ultExtent,
      speedCellsPerSec: 0,
      slowMs: 0,
      casterHeroCode: hero.heroCode,
    };
    state.zones.push(zone);
    state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name, zoneId: zone.zoneId, monsterId: front.monsterId, ultLv });
    return true;
  }
  if (hero.role === 'control') {
    // 旋风瞄怪(2026-09-02 用户反馈:固定刷在水晶旁像水晶放的,且推不到怪就到期):
    // 落点=最逼近水晶的活怪,落地后向刷怪口回扫穿过怪群;跳伤延迟到落地(飞行 ~450ms)之后。
    let front: GuardMonster | null = null;
    for (const monster of state.monsters) {
      if (!monster.dead && (!front || monster.x < front.x)) {
        front = monster;
      }
    }
    if (!front) {
      return false;
    }
    const zone: GuardZone = {
      zoneId: state.nextZoneId++,
      kind: 'cyclone',
      x: front.x,
      radiusCells: 1.0,
      tickDamage: Math.max(1, Math.round(attack * 0.6 * ultMult)),
      tickMs: 500,
      nextTickAtMs: state.timeMs + 600,
      untilMs: state.timeMs + 5000 * ultExtent,
      // 落地后随怪群向水晶方向漂(负速),最低漂到 0.8 格在水晶前收口——保住旧版漏斗防线价值
      // (纯驻留/向刷怪口推进两版 harness 弱阵容都大幅回归:w17→w10、Ⅲ弱A 11→4 层)
      speedCellsPerSec: -0.7,
      slowMs: 1000,
      casterHeroCode: hero.heroCode,
    };
    state.zones.push(zone);
    state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name, zoneId: zone.zoneId, ultLv });
    return true;
  }
  // support:有怪压场才放(空场省冷却)
  if (!state.monsters.some((monster) => !monster.dead)) {
    return false;
  }
  state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + Math.round(state.crystalMaxHp * 0.06));
  // 觉醒带来的回复增量(6% → 9%/11.7%)计入词条治疗的每波上限。
  if (ultMult > 1) {
    guardPerkHeal(state, state.crystalMaxHp * 0.06 * (ultMult - 1));
  }
  state.supportSurgeUntilMs = state.timeMs + GUARD_SUPPORT_SURGE_MS * ultExtent;
  state.events.push({ type: 'heroSkill', timeMs: state.timeMs, heroCode: hero.heroCode, cell: hero.cell, skillName: skill.name, ultLv });
  return true;
}

/** 副目标资格:射程内;近战打不到飞行途中的飞行怪(穿透/溅射/多重副发都不能绕过"飞行怪=阵容检查器")。 */
function guardCanHit(hero: GuardHeroUnit, monster: GuardMonster, rangeCells: number): boolean {
  if (monster.dead || monster.x > rangeCells) {
    return false;
  }
  return hero.role !== 'melee' || guardMeleeCanHit(monster);
}

/** 某英雄编码当前最强单位的攻击值(区域/爆燃等按编码结算的效果用);不在场为 0。 */
function guardCodeAttackValue(state: GuardBattleState, heroCode: string): number {
  const code = heroCode.toUpperCase();
  const best = state.heroes
    .filter((hero) => hero.heroCode.toUpperCase() === code)
    .sort((a, b) => b.star - a.star || a.unitId - b.unitId)[0];
  return best ? guardHeroAttackValue(state, best) : 0;
}

/** 词条新增的治疗走每波上限(占水晶最大生命 8%),返回实际加上的量。 */
function guardPerkHeal(state: GuardBattleState, amount: number): number {
  const cap = Math.round(state.crystalMaxHp * GUARD_PERK_HEAL_CAP_PER_WAVE);
  const allowed = Math.max(0, Math.min(Math.round(amount), cap - state.perkHealThisWave));
  if (allowed > 0) {
    state.perkHealThisWave += allowed;
    state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + allowed);
  }
  return allowed;
}

interface GuardPendingHit {
  monster: GuardMonster;
  coef: number;
  /** 伤害基数(辅助的追加段按未乘 0.35 的攻击值)。 */
  base: number;
  kind: GuardHitKind;
  /** 本击倍率是否作用于该命中(紫卡"补一击"只吃条件乘区)。 */
  strike: boolean;
}

/**
 * 一次普攻的结算(docs/32 §4):主命中 + 多重/散射/穿透/巨型 + 紫卡补击,过两道硬钳后即时扣血,
 * 只发一条 heroAttack 事件(带 hits[] 与原型 pattern,渲染层据此演多发弹道)。无词条时与改版前逐位一致。
 */
function resolveBasicAttack(state: GuardBattleState, hero: GuardHeroUnit, target: GuardMonster): void {
  const roleProfile = GUARD_ROLE_PROFILE[hero.role];
  const profile = guardHeroProfileOf(state, hero.heroCode);
  const perks = guardHeroPerks(state, hero.heroCode);
  const suffix = perks.purple > 0 ? profile.purple?.suffix ?? '' : '';
  const purpleValue = perks.purple > 0 && profile.purple ? profile.purple.values[perks.purple - 1] : 0;
  const attack = guardHeroAttackValue(state, hero);
  const extraBase = hero.role === 'support' ? attack / roleProfile.damageScale : attack;
  // 辅助出手 3s 一次,计数触发次数减半(每第 4 次 → 每第 2 次)。
  const every = (n: number): boolean => hero.attackCount % (hero.role === 'support' ? Math.max(1, Math.round(n / 2)) : n) === 0;
  let perkProc = '';

  // ── 本击倍率:技能击 / 会心 / 处刑 / 盾反 / 爆头 同击取最高,不相乘 ──
  let skillMult = 1.6;
  let critMult = GUARD_CRIT_MULT[perks.blue.atk_crit ?? 0] ?? 1;
  if (suffix === 'verdict') {
    skillMult = purpleValue;
  }
  if (suffix === 'mark') {
    skillMult += purpleValue;
    critMult = critMult > 1 ? critMult + purpleValue : critMult;
  }
  // 技能击(2★ 起每第 4 次出手);辅助沿用现状不触发。
  const skillProc = hero.role !== 'support' && hero.star >= 2 && hero.attackCount % 4 === 0;
  let strike = skillProc ? skillMult : 1;
  const crit = critMult > 1 && hero.attackCount % GUARD_CRIT_EVERY === 0;
  if (crit) {
    strike = Math.max(strike, critMult);
  }
  if (suffix === 'execute' && target.hp / target.maxHp < purpleValue) {
    const full = purpleValue <= 0.2 ? 1.5 : purpleValue <= 0.25 ? 1.75 : 2.0;
    strike = Math.max(strike, target.kind === 'boss' ? 1 + (full - 1) / 2 : full);
    perkProc = 'execute';
  }
  if (suffix === 'riposte' && state.riposteSeals > 0) {
    state.riposteSeals -= 1;
    strike = Math.max(strike, 1 + purpleValue);
    perkProc = 'riposte';
  }
  if (suffix === 'headhunt' && every(4)) {
    strike = Math.max(strike, 1 + purpleValue);
    perkProc = 'headhunt';
  }
  // ── 条件乘区(连乘),与本击倍率合计钳 ×3.2 ──
  let cond = 1;
  if (suffix === 'dragonslayer' && (target.kind === 'elite' || target.kind === 'boss')) {
    cond *= 1 + purpleValue;
    perkProc = perkProc || 'dragonslayer';
  }
  if (suffix === 'focus') {
    hero.focusStacks = hero.focusTargetId === target.monsterId ? Math.min(5, hero.focusStacks + 1) : 0;
    hero.focusTargetId = target.monsterId;
    cond *= 1 + purpleValue * hero.focusStacks;
    if (hero.focusStacks >= 5) {
      perkProc = perkProc || 'focus';
    }
  }
  const strikeMult = Math.min(GUARD_ATTACK_MULT_CAP, strike * cond);
  const condMult = Math.min(GUARD_ATTACK_MULT_CAP, cond);

  // ── 命中列表 ──
  const inRange = state.monsters
    .filter((monster) => guardCanHit(hero, monster, roleProfile.rangeCells))
    .sort((a, b) => a.x - b.x || a.monsterId - b.monsterId);
  const others = inRange.filter((monster) => monster !== target);
  const multishotLv = perks.blue.atk_multishot ?? 0;
  const shotCoef = GUARD_MULTISHOT_COEF[multishotLv] ?? 1;
  const hits: GuardPendingHit[] = [{ monster: target, coef: shotCoef, base: attack, kind: 'main', strike: true }];
  // 多重:副发依次打下一只;目标不足时多余的发回到主目标,只计 50%。
  for (let shot = 1; shot < (GUARD_MULTISHOT_SHOTS[multishotLv] ?? 1); shot += 1) {
    const next = others[shot - 1];
    hits.push(next
      ? { monster: next, coef: shotCoef, base: extraBase, kind: 'multi', strike: true }
      : { monster: target, coef: shotCoef * GUARD_MULTISHOT_OVERFLOW, base: extraBase, kind: 'multi', strike: true });
  }
  // 散射:额外 2 发侧翼弹打射程内最远的 2 只(不吃多重的每发系数)。
  const spreadLv = perks.blue.atk_spread ?? 0;
  if (spreadLv > 0) {
    for (const far of others.slice(-2).reverse()) {
      hits.push({ monster: far, coef: GUARD_SPREAD_COEF[spreadLv], base: extraBase, kind: 'spread', strike: true });
    }
  }
  // 穿透(主弹)/凯恩·贯日长枪:主目标身后(远离水晶一侧)最近 N 只;两者同时持有只数不叠、系数 +10pp/层。
  const lanceCount = suffix === 'longlance' ? purpleValue : 0;
  const pierceCount = Math.max(GUARD_PIERCE_COUNT[perks.blue.atk_pierce ?? 0] ?? 0, lanceCount);
  if (pierceCount > 0) {
    const both = lanceCount > 0 && (perks.blue.atk_pierce ?? 0) > 0;
    const coef = GUARD_PIERCE_COEF + (both ? 0.1 * perks.purple : 0);
    const behind = others.filter((monster) => monster.x >= target.x);
    for (const monster of behind.slice(0, pierceCount)) {
      hits.push({ monster, coef, base: extraBase, kind: 'pierce', strike: true });
    }
    if (lanceCount > 0) {
      perkProc = perkProc || 'longlance';
    }
  }
  // 巨型:命中点 ±0.7 格内最近 N 只各 25% 溅射(计数制,不是"范围内全部")。
  const giantLv = perks.blue.atk_giant ?? 0;
  if (giantLv > 0) {
    const near = others
      .filter((monster) => Math.abs(monster.x - target.x) <= GUARD_GIANT_RADIUS)
      .sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x) || a.monsterId - b.monsterId);
    for (const monster of near.slice(0, GUARD_GIANT_COUNT[giantLv])) {
      hits.push({ monster, coef: GUARD_GIANT_COEF, base: extraBase, kind: 'splash', strike: true });
    }
  }
  // ── 紫卡"补一击"(次数类,只吃条件乘区)──
  const pushPerk = (monsters: GuardMonster[], coef: number, name: string): void => {
    for (const monster of monsters) {
      hits.push({ monster, coef, base: extraBase, kind: 'perk', strike: false });
    }
    if (monsters.length > 0) {
      perkProc = name;
    }
  };
  if (suffix === 'deepchill' && every(5)) {
    pushPerk(inRange.filter((monster) => monster.slowUntilMs > state.timeMs).slice(0, 5), purpleValue, 'deepchill');
  } else if (suffix === 'phase' && every(5)) {
    const top = [...inRange].sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp || a.monsterId - b.monsterId)[0];
    pushPerk(top ? [top] : [], purpleValue, 'phase');
  } else if (suffix === 'punish' && every(4)) {
    const biting = inRange.filter((monster) => monster.x <= (monster.kind === 'shooter' ? GUARD_SHOOTER_STAND_X : GUARD_CRYSTAL_REACH_X) + 0.01).slice(0, 3);
    pushPerk(biting.length > 0 ? biting : [target], purpleValue, 'punish');
  } else if (suffix === 'echo' && every(4)) {
    pushPerk([target], purpleValue, 'echo');
  } else if (suffix === 'curseburst' && every(4)) {
    const near = others
      .filter((monster) => Math.abs(monster.x - target.x) <= 0.8)
      .sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x) || a.monsterId - b.monsterId);
    pushPerk(near.slice(0, 4), purpleValue, 'curseburst');
  } else if (suffix === 'skirmish' && every(3)) {
    const far = inRange[inRange.length - 1];
    pushPerk(far ? [far] : [], purpleValue, 'skirmish');
  } else if (suffix === 'cutthroat' && every(5)) {
    const weakest = [...inRange].sort((a, b) => a.hp - b.hp || a.monsterId - b.monsterId)[0];
    pushPerk(weakest ? [weakest] : [], purpleValue, 'cutthroat');
  }

  // ── 次数类硬钳:命中数 ≤12;合计 ≤×4.0;同一目标 ≤×2.0。主命中不缩,副命中等比缩 ──
  const kept = hits.slice(0, GUARD_ATTACK_MAX_HITS);
  const mainCoef = kept[0].coef;
  const secondarySum = kept.slice(1).reduce((sum, hit) => sum + hit.coef, 0);
  const totalScale = secondarySum > 0 ? Math.min(1, Math.max(0, GUARD_ATTACK_TOTAL_COEF_CAP - mainCoef) / secondarySum) : 1;
  const perTarget: Record<number, number> = {};
  perTarget[target.monsterId] = mainCoef;
  const resolved: Array<{ monster: GuardMonster; amount: number; kind: GuardHitKind }> = [];
  kept.forEach((hit, index) => {
    let coef = hit.coef;
    if (index > 0) {
      coef *= totalScale;
      const used = perTarget[hit.monster.monsterId] ?? 0;
      coef = Math.max(0, Math.min(coef, GUARD_ATTACK_TARGET_COEF_CAP - used));
      perTarget[hit.monster.monsterId] = used + coef;
    }
    const amount = Math.round(hit.base * coef * (hit.strike ? strikeMult : condMult));
    if (amount > 0) {
      resolved.push({ monster: hit.monster, amount, kind: hit.kind });
    }
  });

  if (hero.role === 'control') {
    target.slowUntilMs = state.timeMs + GUARD_CONTROL_SLOW_MS;
  }
  const mainAmount = resolved[0]?.amount ?? 0;
  state.events.push({
    type: 'heroAttack',
    timeMs: state.timeMs,
    heroCode: hero.heroCode,
    monsterId: target.monsterId,
    amount: mainAmount,
    cell: hero.cell,
    skillProc,
    crit,
    giantLv,
    pattern: profile.archetype,
    perkId: perkProc || undefined,
    hits: resolved.map((hit) => ({ monsterId: hit.monster.monsterId, amount: hit.amount, kind: hit.kind })),
  });
  for (const hit of resolved) {
    damageMonster(state, hit.monster, hit.amount, hero);
  }
}

function heroTick(state: GuardBattleState, hero: GuardHeroUnit, dtMs: number): void {
  const profile = GUARD_ROLE_PROFILE[hero.role];
  const perks = guardHeroPerks(state, hero.heroCode);
  // 战技:2★ 解锁,冷却就绪且有合法目标时自动施放;金卡觉醒为专属大招后冷却缩短(docs/32 §5.1 方案 A)。
  if (hero.star >= 2 && state.timeMs >= hero.skillReadyMs && castHeroSkill(state, hero)) {
    hero.skillReadyMs = state.timeMs + GUARD_HERO_SKILL[hero.role].cdMs * (GUARD_ULT_CD_MULT[perks.ultLv] ?? 1);
  }
  hero.attackCooldownMs -= dtMs;
  if (hero.attackCooldownMs > 0) {
    return;
  }
  // 出手频率:常驻 = 白卡攻速 × 急速(钳 ×2.0);临时增益(圣辉涌泉 ×1.2)在钳外。
  const surgeDiv = state.supportSurgeUntilMs > state.timeMs ? GUARD_SUPPORT_SURGE_ATKSPD : 1;
  const interval = profile.intervalMs / guardPermanentFrequency(state, hero.heroCode) / surgeDiv;
  const heroProfile = guardHeroProfileOf(state, hero.heroCode);
  const purpleSuffix = perks.purple > 0 ? heroProfile.purple?.suffix ?? '' : '';
  const purpleValue = perks.purple > 0 && heroProfile.purple ? heroProfile.purple.values[perks.purple - 1] : 0;
  if (hero.role === 'support') {
    // 辅助:周期治疗水晶,同时对覆盖内最紧迫怪物打一发轻普攻(2026-08-28 用户拍板:辅助也要有普攻)。
    hero.attackCooldownMs = interval;
    hero.lastAttackAtMs = state.timeMs;
    const baseHeal = Math.round(state.crystalMaxHp * GUARD_SUPPORT_CRYSTAL_HEAL_RATIO);
    state.crystalHp = Math.min(state.crystalMaxHp, state.crystalHp + baseHeal);
    // 塞拉菲娜·晨星恩典 / 侍僧·微光祷告:词条带来的回复增量计入每波治疗上限。
    if (purpleSuffix === 'grace') {
      guardPerkHeal(state, state.crystalMaxHp * (purpleValue - GUARD_SUPPORT_CRYSTAL_HEAL_RATIO));
    } else if (purpleSuffix === 'prayer' && state.crystalHp < state.crystalMaxHp * 0.5) {
      guardPerkHeal(state, baseHeal * (purpleValue - 1));
    }
    let healTarget: GuardMonster | null = null;
    let healBest = Number.POSITIVE_INFINITY;
    for (const monster of state.monsters) {
      if (!monster.dead && monster.x <= profile.rangeCells && monster.x < healBest) {
        healBest = monster.x;
        healTarget = monster;
      }
    }
    if (healTarget) {
      hero.lastTargetId = healTarget.monsterId;
      hero.attackCount += 1;
      resolveBasicAttack(state, hero, healTarget);
    }
    return;
  }
  const heroLane = guardCellLane(hero.cell);
  let target: GuardMonster | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const monster of state.monsters) {
    if (monster.dead) {
      continue;
    }
    // 飞行怪无视近战格挡(阵容检查器):飞行途中只能被远程/控制打;
    // 落地啃水晶后可被近战攻击(2026-09-11 用户反馈"近战没打正在啃水晶的怪")。
    if (hero.role === 'melee' && !guardMeleeCanHit(monster)) {
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
  // 狙击手·猎首:优先锁精英/BOSS,其次血量最高的怪。
  if (target && purpleSuffix === 'headhunt') {
    const inRange = state.monsters.filter((monster) => guardCanHit(hero, monster, profile.rangeCells));
    const priority = inRange.filter((monster) => monster.kind === 'elite' || monster.kind === 'boss').sort((a, b) => a.x - b.x || a.monsterId - b.monsterId)[0]
      ?? [...inRange].sort((a, b) => b.hp - a.hp || a.monsterId - b.monsterId)[0];
    target = priority ?? target;
  }
  if (!target) {
    return;
  }
  hero.attackCooldownMs = interval;
  hero.lastAttackAtMs = state.timeMs;
  hero.lastTargetId = target.monsterId;
  hero.attackCount += 1;
  resolveBasicAttack(state, hero, target);
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
      state.nextWaveSpawns = guardWaveComposition(state.wave + 1, state.rng, state.maxWave, state.mode, state.spawnCountMult);
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
      guardGrantFreeEnhance(state);
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
  // BOSS 技能(2026-08-28):进入自身攻击范围(近战3格/远程7格)后冷却制施放,轰水晶;读条/踉跄中不放。
  for (const bossMonster of state.monsters) {
    if (bossMonster.kind !== 'boss' || bossMonster.dead) {
      continue;
    }
    const skillKind = guardBossSkillKind(bossMonster.spineCode);
    const skillSpec = GUARD_BOSS_SKILL[skillKind];
    const casting = state.bossCast?.monsterId === bossMonster.monsterId;
    const bossStunned = bossMonster.stunnedUntilMs > state.timeMs;
    if (!casting && !bossStunned && bossMonster.x <= skillSpec.rangeCells && state.timeMs >= bossMonster.skillReadyMs) {
      bossMonster.skillReadyMs = state.timeMs + skillSpec.cdMs;
      const damage = Math.max(1, Math.round(state.crystalMaxHp * skillSpec.crystalPct));
      state.crystalHp = Math.max(0, state.crystalHp - damage);
      state.events.push({ type: 'bossSkill', timeMs: state.timeMs, monsterId: bossMonster.monsterId, amount: damage, skillName: skillSpec.name, skillKind });
      if (state.crystalHp <= 0) {
        state.phase = state.mode === 'rush' ? 'victory' : 'defeat';
        state.events.push({ type: state.mode === 'rush' ? 'victory' : 'defeat', timeMs: state.timeMs });
        return state.phase;
      }
    }
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
        if ((state.heroPerks.UR_ATLAS?.purple ?? 0) > 0 && state.heroes.some((hero) => hero.heroCode.toUpperCase() === 'UR_ATLAS')) {
          state.riposteSeals = Math.min(3, state.riposteSeals + 1);
        }
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
          killMonster(state, monster, null);
        }
      }
    }
  }
  // 持续区域(灼烧区/旋风):推进与跳伤(确定性,无 rng;旋风附带减速)。
  for (const zone of state.zones) {
    if (zone.speedCellsPerSec !== 0) {
      zone.x = Math.min(GUARD_SPAWN_X, Math.max(0.8, zone.x + zone.speedCellsPerSec * (dtMs / 1000)));
    }
    while (state.timeMs >= zone.nextTickAtMs && zone.nextTickAtMs <= zone.untilMs) {
      zone.nextTickAtMs += zone.tickMs;
      const hitIds: number[] = [];
      for (const monster of state.monsters) {
        if (monster.dead || Math.abs(monster.x - zone.x) > zone.radiusCells) {
          continue;
        }
        hitIds.push(monster.monsterId);
        if (zone.slowMs > 0) {
          monster.slowUntilMs = Math.max(monster.slowUntilMs, state.timeMs + zone.slowMs);
        }
        if (zone.casterHeroCode) {
          state.heroDamage[zone.casterHeroCode] = (state.heroDamage[zone.casterHeroCode] ?? 0) + zone.tickDamage;
        }
        damageMonster(state, monster, zone.tickDamage, null, zone.casterHeroCode ?? null);
      }
      if (hitIds.length > 0) {
        state.events.push({ type: 'zoneTick', timeMs: state.timeMs, zoneId: zone.zoneId, amount: zone.tickDamage, heroCode: zone.casterHeroCode, monsterIds: hitIds });
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

// 2026-09-18 强化改词条:见 GUARD_ENHANCE_PRICES / guardEnhance。
