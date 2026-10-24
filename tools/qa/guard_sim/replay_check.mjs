// 复演一致性自检(docs/43):用自动打法打 N 局(操作经导出函数自动记录),再把记录交给 guardReplayBattle / cli.mjs 复演,
// 逐项核对 胜负 / 波次 / 局内时间 / 水晶血量 / 击杀数。任何一局不一致即报错退出。
// 用法:node tools/qa/guard_sim/replay_check.mjs <guard-replay 产物目录> <roster.json> [N=20] [stage=MAIN_3_12]
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

const [dir, rosterFile, nArg, stageArg] = process.argv.slice(2);
const N = Number(nArg || 20);
const stageCode = stageArg || 'MAIN_3_12';
const M = await import(pathToFileURL(path.resolve(dir, 'GuardBattleModel.mjs')).href);
const R = await import(pathToFileURL(path.resolve(dir, 'GuardReplay.mjs')).href);
const SK = await import(pathToFileURL(path.resolve(dir, 'LobbyBattleHeroSkillConfig.mjs')).href);
// PASSIVES=1:按高星(SSR/UR 9★、R/SR 6★)带上占位技能表里的全部被动,覆盖被动 / 护盾的复演一致性
const WITH_PASSIVES = process.env.PASSIVES === '1';
const roster = JSON.parse(fs.readFileSync(rosterFile, 'utf8'));
const byId = new Map(roster.heroes.map((h) => [h.id, h]));
const team = (roster.formation || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 4);
const classMap = { 法师: '法师', 战士: '战士', 坦克: '坦克', 刺客: '刺客', 射手: '射手', 辅助: '辅助' };

function fakeStart(seedIndex) {
  return {
    battleNo: `B-CHECK-${seedIndex}`,
    stageCode,
    serverSeed: `SEED-${seedIndex}`,
    guardRecommendedPower: Number(process.env.REC_POWER || 2800),
    guardCrystal: { level: 3, crystalHpPct: 10, startGold: 50, spellPowerPct: 10, startEnergy: 30, energyMaxBonus: 0, unlockedSpells: ['quake', 'frost', 'thunder'], spellSlots: 2, spellLoadout: ['thunder', 'frost'], spellLevels: { quake: 1, frost: 2, thunder: 1 } },
    guardMonsters: [],
    lineup: team.map((h) => ({
      heroId: h.id, heroCode: h.code, heroName: h.code, rarity: h.rarity, star: WITH_PASSIVES ? (h.rarity === 'SSR' || h.rarity === 'UR' ? 9 : 6) : h.star, attack: h.atk, ultimateSkillLevel: h.ult || 1,
      energyShieldScope: WITH_PASSIVES ? (SK.resolveBattleHeroSkillProfile(h.code).energyShield?.scope ?? null) : null,
      effectsJson: WITH_PASSIVES ? JSON.stringify(SK.resolveBattleHeroSkillProfile(h.code).effects ?? []) : null,
      guardStats: { heroClass: classMap[h.cls] || h.cls, hp: h.hp, defense: h.def, speed: h.spd, crit: h.crit, equipHp: 0, equipDefense: 0, equipSpeed: 0, equipCrit: 0, affixes: h.affixes },
    })),
  };
}

function botStep(s, tick) {
  if (s.pendingChoice) {
    if (tick % 3 === 0 && s.rerollLeft > 0) M.guardRerollChoice(s); else M.guardChooseOption(s, tick % 3);
  }
  for (const chest of [...s.chests]) M.guardOpenChest(s, chest.chestId, tick < 400 ? 3 : undefined);
  for (const pickup of [...s.pickups]) M.guardCollectPickup(s, pickup.pickupId);
  let merged = true;
  while (merged) {
    merged = false;
    const seen = new Map();
    for (const hero of s.heroes) {
      if (hero.star >= M.GUARD_MAX_STAR) continue;
      const key = `${hero.heroCode}|${hero.star}`;
      const other = seen.get(key);
      if (other) { const r = M.guardDragTo(s, hero.cell, other.cell); if (r === 'merge' || r === 'superMerge') { merged = true; break; } } else seen.set(key, hero);
    }
  }
  let guard = 0;
  while (guard++ < 12 && s.gold >= M.guardCurrentSummonCost(s) && M.guardSummon(s)) { /* 连召 */ }
  const cost = M.guardEnhanceNextCost(s);
  if (cost !== null && s.gold >= cost && !s.pendingChoice) M.guardEnhance(s);
  const alive = s.monsters.filter((m) => !m.dead);
  if (alive.length > 0) {
    const front = alive.reduce((a, b) => (a.x < b.x ? a : b));
    if (tick % 40 === 0) M.guardMarkMonster(s, front.monsterId);
    for (const id of s.spellLoadout) if (M.guardSpellCastable(s, id)) { M.guardCastSpell(s, id, { lane: front.lane ?? 0, x: front.x }); break; }
    if (front.x < 3 && M.guardCrystalSkillReady(s)) M.guardUseCrystalSkill(s);
  }
  if (s.phase === 'prep' && s.wave > 0 && tick % 7 === 0) M.guardCallNextWave(s);
  if (tick === 50) M.guardSetSkillAuto(s, true);
}

let bad = 0;
for (let i = 0; i < N; i += 1) {
  const start = fakeStart(i);
  const setup = R.guardReplaySetupFromStart(start, true);
  const s = R.createGuardBattleFromSetup(setup);
  let tick = 0;
  while (s.phase !== 'victory' && s.phase !== 'defeat' && tick < 40000) {
    botStep(s, tick);
    M.guardTick(s, R.GUARD_REPLAY_TICK_MS);
    s.events.length = 0;
    tick += 1;
  }
  const live = { win: s.phase === 'victory', wave: s.wave, timeMs: s.timeMs, crystalHp: s.crystalHp, killCount: s.killCount };
  const proc = spawnSync('node', [path.join(dir, 'cli.mjs')], { input: JSON.stringify({ start, replay: JSON.stringify({ v: R.GUARD_REPLAY_VERSION, inputs: s.inputs }), allowChestScript: true }), encoding: 'utf8' });
  const rep = JSON.parse(proc.stdout.trim());
  const same = rep.ok && rep.win === live.win && rep.wave === live.wave && rep.timeMs === live.timeMs && rep.crystalHp === live.crystalHp && rep.killCount === live.killCount;
  if (!same) bad += 1;
  console.log(`${same ? 'OK ' : 'BAD'} #${i} live=${JSON.stringify(live)} inputs=${s.inputs.length} replay=${JSON.stringify({ ok: rep.ok, reason: rep.reason, win: rep.win, wave: rep.wave, timeMs: rep.timeMs, crystalHp: rep.crystalHp, killCount: rep.killCount, skipped: rep.skippedInputs })}`);
}
console.log(bad === 0 ? `ALL ${N} MATCH` : `${bad}/${N} MISMATCH`);
process.exit(bad === 0 ? 0 : 1);
