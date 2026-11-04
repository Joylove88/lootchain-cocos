// 主角带队(11-05):把 gen_cases 生成的 4 人用例派生成「4 人现状」vs「3 人(依次去掉一人)+ 境界光环」对比用例,交给 run.mjs 跑。
// 用法:node protag_aura_cases.mjs <base_cases.json> <out.json> [光环档位 atk:hp,...  默认 0:0,5:5,10:10,15:15,20:20] [只取名字前缀=formation]
// 光环口径与 GuardReplay.applyGuardRealmAura 一致:攻击加成进 outside.atkBonusPct,生命加成乘 outside.hp。
import fs from 'fs';

const [baseFile, outFile, auraArg, prefixArg] = process.argv.slice(2);
const auras = (auraArg || '0:0,5:5,10:10,15:15,20:20').split(',').map((pair) => pair.split(':').map(Number));
const prefix = prefixArg || 'formation';
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8')).filter((c) => c.name.startsWith(prefix));
const out = [];
const clone = (value) => JSON.parse(JSON.stringify(value));
for (const c of base) {
  out.push({ ...clone(c), name: `${c.name} 4人` });
  for (const [atk, hp] of auras) {
    for (let drop = 0; drop < c.pool.length; drop += 1) {
      const pool = clone(c.pool).filter((_, index) => index !== drop).map((hero, index) => {
        hero.sourceIndex = index;
        if (hero.outside) {
          hero.outside.atkBonusPct = (hero.outside.atkBonusPct || 0) + atk;
          hero.outside.hp = hero.outside.hp * (1 + hp / 100);
        }
        return hero;
      });
      out.push({ ...clone(c), name: `${c.name} 3人-${drop} +${atk}/${hp}`, pool });
    }
  }
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(out.length, 'cases ->', outFile);
