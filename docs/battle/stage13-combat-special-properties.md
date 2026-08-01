# Stage 13 战斗特殊属性系统（RPG 化）

更新时间：2026-07-09

在 Stage 12 战场表现基础上，新增一套 RPG 化的战斗特殊属性（职业克制、连击、能量护盾、概率触发技能、显眼飘字）。全部在客户端确定性 sim（`LobbyBattleReplayModel`）与表现层结算；战斗仍是「表现层可视化」，不作为发奖、体力、进度或掉落依据，后端只裁决胜负与奖励。

## 一、策划定稿（属性归属）

- 特殊属性只来自**技能 / 装备 / 宝石**，**职业本身不触发任何特殊属性**。唯一例外是**职业克制环**（近战→刺客→远程→近战 +30%），那是职业间相对克制关系，不是单体特殊属性。
- **连击 / 斩杀**（非持续性）→ 不放英雄技能，后期走**装备 / 宝石**词条。sim 保留多段命中机制（combo 循环 + "连击" 飘字）待接入，当前无来源即单发。
- **英雄技能的特殊属性 = 概率触发**：吸血 / 真伤穿透 / 冻结X秒 / 眩晕X秒 / 溅射 / 反弹。
  实际触发概率 = `baseChance × 稀有度系数`（`resolveSkillTriggerChance`；UR 1.6 / SSR 1.3 / SR 1.0 / R 0.75，夹在 [0, 0.95]）。稀有度越高触发率越高。
- **能量护盾** = 通用百分比属性（非概率），全稀有度都有，强度按稀有度缩放（`resolveEnergyShieldHpRatio`：单体 UR 0.5→R 0.3、全体 UR 0.22→R 0.12）× 受益者最大生命。受击**先扣盾再扣血**，血条上叠**半透明护盾层**（单体偏青 / 全体偏蓝）。
- **暴击 / 暴击伤害 / 减伤 / 闪避** 等纯百分比属性按稀有度缩放（数值大小随稀有度拉开），已在 `resolveBattleReplayDerivedAttributes` 内。

## 二、数据源

- 英雄模板级配置落在后端 `hero_battle_skill_config`（`D:\project\LootChain\sql\69_hero_battle_skill_config.sql`），按 `hero_code` 存 `energy_shield_scope` + `effects_json`。
- **下发管线已打通（2026-07-09）**：`battle start` 回执 `lineup[]` 每个英雄新增 `energyShieldScope`+`effectsJson`（后端 `PlayerBattleServiceImpl.toLineup` 读 `hero_battle_skill_config`）。客户端 `BattleApi.parseBattleSkillConfig` 解析 → `PlayerBattleLineupHeroVO.skillConfig` → 快照 `BattlePresentationUnitSnapshot.skillConfig` → sim `resolveBattleReplaySkillEffects` / `resolveBattleReplayShieldScope` **优先用下发配置**，字段缺省(旧服务端/大厅挂机花名册)才回退占位 `LobbyBattleHeroSkillConfig.ts`。实测 battle start 已返回正确配置(SSR_KANE=single+reflect、SSR_LIVIA=freeze…)。
- heroCode 取值见 `assets/scripts/api/LobbyHeroApi.ts` 的 `HERO_CLASS_FALLBACKS`（后端下发同名字段）。

## 三、实现映射（客户端）

| 属性 | 触发 | sim 落点 | 表现 |
|---|---|---|---|
| 职业克制 | 职业相对关系 | `resolveBattleReplayCounterMultiplier`（+30%） | "克制" 描金飘字 |
| 能量护盾 | 开场授予（技能表 scope，强度按稀有度） | `grantBattleReplayInitialShields` + `resolveBattleReplayDamageResult` 末尾拆盾/血 | `renderHpBar` 半透明护盾层覆盖血条 |
| 真伤穿透 | 概率（施法者） | `rollBattleReplaySkillMagnitude(actor,'truePierce')`→`defenseMitigation=0` | "穿透" 紫色高亮飘字 |
| 吸血 | 概率（施法者） | 命中回攻击者血：`lifestealHeal`，攻击者 sim 血量与血条同步 | 攻击者身上绿色 "吸血 +N" |
| 反弹 | 概率（受击者） | 受击反伤攻击者：`reflectDamage`，攻击者掉血 | 攻击者身上红色 "反弹 -N" |
| 连击 | （待装备/宝石） | `resolveBattleReplayComboProfile` 恒返回单发；机制保留 | "连击xN" 首段飘字（当前不触发） |
| 冻结 / 眩晕 | 概率（攻击者） | 命中给目标 `frozenUntilMs`，`selectBattleReplayActor` 排除被控单位（跳过出手）；不叠控/不控尸 | 触发时 "冻结"（冰蓝）/"眩晕"（晕黄）高亮飘字；被控期间头顶挂持续 CC 图标（`buff_stun` 染色，冰蓝/晕黄）直到解控，并可见地停手 |
| 溅射 | 概率（攻击者） | 主动作 roll 一次（不进 createSynthetic，防递归）→ 对最近的另一个存活敌人追加一段 `magnitude` 比例伤害的 hit（`pickBattleReplaySplashTarget`） | 溅射目标 "溅射"（橙）飘字 |

飘字配色/放大（`LobbyBattleImpactDirector.resolveBattleImpactProfile`）优先级：冻结冰蓝 / 眩晕晕黄 > 穿透紫 > 暴击红 > 克制金 > 连击青 > 普通暖黄；闪避冷灰不放大；吸血绿 / 反弹红为攻击者侧独立飘字。暴击/克制/连击/穿透/冻结/眩晕播 pop 放大动画。

硬控（冻结/眩晕）回合处理：被控单位 `frozenUntilMs > 当前动作时间` 时被 `selectBattleReplayActor` 排除；若某方全员被控则推进时间等待解控，连续空过 >10 拍收尾（防死循环，`real-combat`/状态机守卫已验证不 stall）。敌人无技能表→不会控我方；只我方英雄能控敌人。

硬控持续图标：`hit.frozeUntilMs`（控制结束绝对时间）随命中透传到 `BattlePresentationHpUnitState.frozenUntilMs`，HP 状态层按当前播放时间算 `frozen = frozenUntilMs > visibleTimeMs && !dead`；`renderHpBar` 新增 `ccKind` 参数，被控时在血条上方挂一个 `buff_stun` 图标（冻结染冰蓝 / 眩晕染晕黄）。血条逐帧重建，图标随 `frozen` 出现/消失，不做 tween（避免逐帧重建抖动）。

概率技能通用判定入口：`rollBattleReplaySkillMagnitude(unit, type, random)`（触发返回 magnitude，否则 0；仅我方英雄、按 heroCode 读技能表）。

## 四、验证

- `tsc`（ES2020 / bundler / strict）：`LobbyBattleHeroSkillConfig` / `LobbyBattleReplayModel` / `LobbyBattlePresentationHp` / `LobbyBattleActionPresentation` / `LobbyBattleImpactDirector` / `LobbyBattlePreviewPanelRenderer` 全过。
- `npm.cmd run check:battle-stage13i` 战斗 sim 守卫全过（Phase A impact / real-combat / visual state machine）。
- 战斗为软件渲染路径，绝对帧率不可信，观感需真机验证。

## 五、待办

- ~~交付管线：`battle start` 回执下发 `hero_battle_skill_config`~~（2026-07-09 已打通，见二/三节）。
- ~~冻结/眩晕（动回合生成）~~（2026-07-10 已实装）。
- ~~溅射（多目标追伤）~~（2026-07-10 已实装）。至此 A 档概率技能（穿透/吸血/反弹/冻结/眩晕/溅射）全部落地。
- 连击 / 斩杀 随装备/宝石系统接入（非本期）。
