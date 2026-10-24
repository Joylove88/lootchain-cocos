// 由导出的账号英雄数据生成回归用例:node gen_cases.mjs <roster.json> <out.json> [withOutside=1] [scales=0.5,1,1.5,2,3]
// 第 5 参 = 构建目录(含 LobbyBattleHeroSkillConfig.mjs)时按星级带上已解锁的升星被动(docs/41 §6)。
// roster.json:{heroes:[{code,rarity,cls,level,star,power,hp,atk,def,spd,crit,ult,affixes:[{code,value}]}], equip:[...], formation:[heroId]}
// 局外属性口径同 assets/scripts/scenes/lobby/HeroCombatStats.ts(基础 + 装备 + 特性,特性点数 ÷10 = %)。
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const [rosterFile, outFile, withOutsideArg, scalesArg, skillBuildDir] = process.argv.slice(2);
const SK = skillBuildDir ? await import(pathToFileURL(path.resolve(skillBuildDir, 'LobbyBattleHeroSkillConfig.mjs')).href) : null;
function passivesOf(h) {
  if (!SK) return { passives: [], shieldRatio: 0 };
  const prof = SK.resolveBattleHeroSkillProfile(h.code);
  const ordered = [...(prof.energyShield ? [{ shield: prof.energyShield.scope }] : []), ...(prof.effects || [])];
  const unlocked = ordered.slice(0, SK.resolveUnlockedPassiveCount(h.rarity, h.star));
  let shieldRatio = 0;
  const passives = [];
  for (const e of unlocked) {
    if (e.shield) { shieldRatio = SK.resolveEnergyShieldHpRatio(e.shield, h.rarity); continue; }
    const flat = e.type === 'atkUp' || e.type === 'hpUp';
    passives.push({ type: e.type, chance: flat ? 1 : SK.resolveSkillTriggerChance(e.baseChance, h.rarity), magnitude: e.magnitude });
  }
  return { passives, shieldRatio };
}
const withOutside = withOutsideArg !== '0';
const scales = (scalesArg || '0.5,1,1.5,2,3').split(',').map(Number);
const d = JSON.parse(fs.readFileSync(rosterFile, 'utf8'));
const pct = (h, code) => (h.affixes || []).filter((a) => a.code === code).reduce((s, a) => s + (Number(a.value) || 0) / 10, 0);
const eqSum = (h, key) => (d.equip || []).filter((e) => e.heroId === h.id).reduce((s, e) => s + (Number(e[key]) || 0), 0);
function poolHero(h, i) {
  const hp = (h.hp + eqSum(h, 'hp')) * (1 + pct(h, 'HP_BONUS') / 100);
  const def = (h.def + eqSum(h, 'def')) * (1 + pct(h, 'DEF_BONUS') / 100);
  const spd = (h.spd + eqSum(h, 'spd')) * (1 + pct(h, 'SPD_BONUS') / 100);
  const entry = { heroCode: h.code, displayName: h.code, rarity: h.rarity, heroClass: h.cls, baseAttack: Math.max(10, Math.round(h.atk + eqSum(h, 'atk'))), sourceIndex: i };
  if (withOutside) {
    entry.outside = { hp, defense: def, speed: spd, critPct: h.crit + eqSum(h, 'crit') + pct(h, 'CRIT_RATE'), critDmgPct: 150 + pct(h, 'CRIT_DMG'), ultLevel: h.ult || 1, atkBonusPct: pct(h, 'ATK_BONUS'), ...passivesOf(h) };
  }
  return entry;
}
const byId = new Map(d.heroes.map((h) => [h.id, h]));
const teams = {
  formation: (d.formation || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 4),
  starterR: d.heroes.filter((h) => h.rarity === 'R').slice(0, 4),
  midSR: d.heroes.filter((h) => h.rarity === 'SR').slice(0, 4),
};
const cases = [];
for (const [name, team] of Object.entries(teams)) {
  if (team.length === 0) continue;
  const pool = team.map(poolHero);
  for (const sc of scales) {
    cases.push({ name: `${name}@${sc}`, maxWave: 10, mode: 'standard', opts: { monsterScale: sc, spawnCountMult: 2, monsterHpMult: 3, minionHpMult: 1 }, pool });
  }
}
fs.writeFileSync(outFile, JSON.stringify(cases, null, 1));
console.log(cases.length, 'cases ->', outFile);
