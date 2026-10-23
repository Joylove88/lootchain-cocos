// 守卫战平衡回归:自动打法(召唤→合成→强化→法术→水晶技能→宝箱/流星)跑 N 个种子,输出胜率 / 平均剩余水晶 / 平均到达波次。
// 用法:node tools/qa/guard_sim/run.mjs <buildDir> <cases.json> [N=100]
//   cases.json:[{ name, maxWave?, mode?, opts: {monsterScale, spawnCountMult, monsterHpMult, minionHpMult, monsterBiteMult}, pool: GuardPoolHero[] }]
//   pool 条目字段同 GuardPoolHero(heroCode/displayName/rarity/role/baseAttack/sourceIndex + 可选局外属性 stats)。
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

const [buildDir, casesFile, nArg] = process.argv.slice(2);
const N = Number(nArg || 100);
const M = await import(pathToFileURL(path.resolve(buildDir, 'GuardBattleModel.mjs')).href);
const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
for (const c of cases) {
  for (const h of c.pool) {
    h.role = h.role || M.resolveGuardRole(h.heroCode, h.heroClass ?? null);
  }
}

function botStep(s) {
  if (s.pendingChoice) {
    M.guardChooseOption(s, 0);
  }
  for (const chest of [...s.chests]) {
    M.guardOpenChest(s, chest.chestId);
  }
  for (const pickup of [...s.pickups]) {
    M.guardCollectPickup(s, pickup.pickupId);
  }
  // 合成:同编码同星两两合并
  let merged = true;
  while (merged) {
    merged = false;
    const byKey = new Map();
    for (const hero of s.heroes) {
      if (hero.star >= M.GUARD_MAX_STAR) {
        continue;
      }
      const key = `${hero.heroCode}|${hero.star}`;
      const other = byKey.get(key);
      if (other) {
        const r = M.guardDragTo(s, hero.cell, other.cell);
        if (r === 'merge' || r === 'superMerge') {
          merged = true;
          break;
        }
      } else {
        byKey.set(key, hero);
      }
    }
  }
  // 召唤优先;召唤满格后攒钱强化
  let guard = 0;
  while (guard++ < 12 && s.gold >= M.guardCurrentSummonCost(s) && M.guardSummon(s)) {
    /* 连召 */
  }
  const enhanceCost = M.guardEnhanceNextCost ? M.guardEnhanceNextCost(s) : null;
  if (enhanceCost !== null && s.gold >= enhanceCost && !s.pendingChoice) {
    M.guardEnhance(s);
  }
  // 法术:能放就放,落点取离水晶最近的怪
  const alive = s.monsters.filter((m) => !m.dead);
  if (alive.length > 0) {
    const front = alive.reduce((a, b) => (a.x < b.x ? a : b));
    for (const id of s.spellLoadout) {
      if (M.guardSpellCastable(s, id)) {
        M.guardCastSpell(s, id, { lane: front.lane ?? 0, x: front.x });
        break;
      }
    }
    if (front.x < 3 && M.guardCrystalSkillReady(s)) {
      M.guardUseCrystalSkill(s);
    }
  }
}

function runOne(c, seedIndex) {
  const s = M.createGuardBattle(c.pool, `bal:${c.name}:${seedIndex}`, c.maxWave ?? 10, c.mode ?? 'standard', c.opts ?? {});
  let steps = 0;
  while (s.phase !== 'victory' && s.phase !== 'defeat' && steps < 20000) {
    botStep(s);
    M.guardTick(s, 100);
    s.events.length = 0;
    steps += 1;
  }
  return { win: s.phase === 'victory', crystal: s.crystalHp / s.crystalMaxHp, wave: s.wave };
}

for (const c of cases) {
  let wins = 0;
  let crystal = 0;
  let wave = 0;
  for (let i = 0; i < N; i += 1) {
    const r = runOne(c, i);
    wins += r.win ? 1 : 0;
    crystal += r.win ? r.crystal : 0;
    wave += r.wave;
  }
  console.log(`${c.name.padEnd(28)} win ${(wins / N * 100).toFixed(1).padStart(5)}%  crystal ${(wins ? crystal / wins * 100 : 0).toFixed(1).padStart(5)}%  wave ${(wave / N).toFixed(2)}`);
}
