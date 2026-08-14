/** 玩家战斗接口类型。真实奖励、体力、进度字段只读自后端结算响应，客户端不得提交。 */
export interface PlayerBattleStartDTO {
  requestId: string;
  stageCode: string;
  heroIds: number[];
  leaderHeroId: number;
  clientVersion: string;
}

export interface PlayerBattleSettleDTO {
  requestId: string;
  result: 'WIN' | 'LOSE' | 'ABORT';
  durationSeconds: number;
  roundCount: number;
  clientChecksum: string;
  /** 输出试炼(难度Ⅲ):击破的 BOSS 层数(0~60,含手动大招伤害);非试炼关为 null。服务端封顶防作弊。 */
  trialLayers?: number | null;
}

// 战斗特殊属性(概率触发技能):type=lifesteal/truePierce/freeze/stun/splash/reflect。来自后端 effects_json。
export interface PlayerBattleSkillEffectVO {
  type: string;
  baseChance: number;
  magnitude: number;
}

// 战斗特殊属性配置(表现用,来自 hero_battle_skill_config)。字段存在即表示后端已下发(权威),否则回退客户端占位表。
/** 装备特级词条:combo(count 段连击)/execute(threshold 血线处决)。 */
export interface PlayerBattleEquipEffectVO {
  type: string;
  count?: number | null;
  threshold?: number | null;
}

export interface PlayerBattleSkillConfigVO {
  energyShieldScope: 'single' | 'team' | null;
  effects: PlayerBattleSkillEffectVO[];
}

export interface PlayerBattleLineupHeroVO {
  heroId: number;
  heroCode: string;
  heroName: string;
  rarity: string;
  level: number;
  star: number;
  power: number;
  attack: number;
  leader: boolean;
  protagonist: boolean;
  sourceType: string;
  portraitAsset?: string | null;
  spineAsset?: string | null;
  spineUuid?: string | null;
  // 后端下发时存在(即使无护盾/无技能也会是 {scope:null, effects:[]});缺省=旧服务端未下发,走客户端占位表。
  skillConfig?: PlayerBattleSkillConfigVO;
  // 装备特级词条(装备一期):已穿装备 special_effects_json 合并数组,sim 消费(连击/斩杀)。缺省=无装备词条。
  equipEffects?: PlayerBattleEquipEffectVO[];
  // 终极技能等级(P6):手动大招伤害倍率 ×(1+0.15×(Lv-1));缺省=旧服务端未下发,按 1 处理。
  ultimateSkillLevel?: number;
}

export interface PlayerBattleEnemyVO {
  enemyCode: string;
  enemyName: string;
  level: number;
  power: number;
  role: string;
  spineAsset?: string | null;
  scaleProfile?: string | null;
  // 独立数值(来自 battle_enemy_config,已按关卡放大);非空时战斗直接用,为空则按 power 派生。
  baseHp?: number | null;
  baseAttack?: number | null;
  baseDefense?: number | null;
  // 怪物系统(P8):模板展示字段;旧路径下发空,前端按空回退(旧AI图池→程序占位)。
  monsterType?: string | null;
  boss?: boolean;
  avatarAsset?: string | null;
  skinAsset?: string | null;
  spineSkin?: string | null;
  displayScale?: number | null;
}

export interface PlayerBattleStartVO {
  battleNo: string;
  stageCode: string;
  status: string;
  serverSeed: string;
  lineup: PlayerBattleLineupHeroVO[];
  enemyPreview: PlayerBattleEnemyVO[];
  expireTime: string;
  readonlyEconomy: boolean;
  guardrails: string[];
}

export interface PlayerBattleSettlementVO {
  battleNo: string;
  settlementNo: string;
  stageCode: string;
  result: string;
  status: string;
  settlementMode: string;
  rewardGranted: boolean;
  economyApplied: boolean;
  progressApplied: boolean;
  firstClear: boolean;
  staminaCost: number;
  staminaBefore: number | null;
  staminaAfter: number | null;
  message: string;
  rewardPreview: string[];
  rewardItems: PlayerBattleRewardItemVO[];
  currencyChanges: PlayerBattleCurrencyChangeVO[];
  mainlineProgress: PlayerBattleMainlineProgressVO | null;
  readonlyEconomy: boolean;
}

export interface PlayerBattleRewardItemVO {
  resourceType: string;
  resourceCode: string;
  resourceName: string;
  amount: number;
}

export interface PlayerBattleCurrencyChangeVO {
  currencyCode: string;
  beforeAmount: number | null;
  changeAmount: number;
  afterAmount: number | null;
}

export interface PlayerBattleMainlineProgressVO {
  beforeStageCode: string;
  afterStageCode: string;
  unlockedStageCode: string;
  progressed: boolean;
}

export interface PlayerBattleRecentVO {
  battleNo: string;
  settlementNo: string;
  stageCode: string;
  result: string;
  settlementMode: string;
  rewardGranted: boolean;
  readonlyEconomy: boolean;
  economyApplied: boolean;
  recordedTime: string;
  message: string;
  guardrails: string[];
}
