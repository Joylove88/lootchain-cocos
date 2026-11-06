// docs/61 掠夺主角带队:复演一致性 + 新旧口径平衡对比。
// 用法:[ULT=1|0] [SWITCH=1] node tools/qa/guard_sim/raid_squad_check.mjs <新 guard-replay 目录> <旧 guard-replay 目录> <回执目录(raid_receipts.py 产出)> [每个回执局数=8]
// 1) 新口径回执(带同伴 / 首领):新模型机器人实打 → 新 cli 复演,逐项对比 胜负 / 时间 / 水晶血 / 主角血;
// 2) 旧口径回执:旧模型机器人实打(= 旧客户端)→ 新 cli 复演,必须逐位一致(兼容旧客户端 / 旧会话);
// 3) 同一座矿新旧口径的胜率 / 用时 / 剩余血量对比(同一套机器人打法)。
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

const [newDir, oldDir, receiptDir, nArg] = process.argv.slice(2);
const N = Number(nArg || 8);
const load = async (dir) => ({
  M: await import(pathToFileURL(path.resolve(dir, 'GuardBattleModel.mjs')).href),
  R: await import(pathToFileURL(path.resolve(dir, 'GuardReplay.mjs')).href),
  cli: path.join(dir, 'cli.mjs'),
});
const NEW = await load(newDir);
const OLD = await load(oldDir);

/** 机器人打法:走到最近守卫右侧同一排 → 有技能放技能(2→0→1),没有就普攻;守卫清完去砸水晶。 */
function botStep(M, s, tick) {
  if (s.phase !== 'wave' || !s.raider) return;
  // SWITCH=1(docs/61 §9):每 9 秒轮换操控 主角 → 同伴 1 → 同伴 2 → 同伴 3 → 主角…(冷却 / 出招中失败照常,失败不进记录)
  if (process.env.SWITCH === '1' && M.guardRaidSwitch && s.raidAllies.length > 0 && tick % 90 === 45) {
    const order = [s.raider.monsterId, ...s.raidAllies.map((a) => a.monsterId)];
    M.guardRaidSwitch(s, order[Math.floor(tick / 90) % order.length]);
  }
  const ctl = M.guardRaidCtl ? M.guardRaidCtl(s) : s.raider;
  const me = s.monsters.find((m) => m.monsterId === ctl.monsterId);
  if (!me || me.dead) return;
  const lane = me.laneF ?? 0.5;
  // 锁定目标直到它倒下(两个守卫等距时不来回横跳)
  let locked = s.heroes.find((h) => h.unitId === s.__botTarget && !h.dead) ?? null;
  if (!locked) {
    let best = Infinity;
    for (const h of s.heroes) {
      if (h.dead || h.hp === undefined) continue;
      const x = h.fx ?? M.guardCellX(h.cell);
      const l = h.flane ?? (Math.floor(h.cell / M.GUARD_GRID_COLS) === 0 ? 0.25 : 0.75);
      const d = Math.abs(x - me.x) + Math.abs(l - lane) * 2;
      if (d < best) { best = d; locked = h; }
    }
    s.__botTarget = locked ? locked.unitId : -1;
  }
  const target = locked ? { x: locked.fx ?? M.guardCellX(locked.cell), l: locked.flane ?? (Math.floor(locked.cell / M.GUARD_GRID_COLS) === 0 ? 0.25 : 0.75) } : null;
  // 站位窗口:目标右侧 [x+0.45, x+1.25];从左边掉进来就先退到窗口右沿再往左走(保证朝向水晶,挥刀打得到)
  const tx = target ? target.x : M.GUARD_CRYSTAL_REACH_X - 0.2;
  // 砸水晶要贴到 x ≤ 水晶触及 + 0.55 才打得到
  const lo = target ? tx + 0.45 : M.GUARD_CRYSTAL_REACH_X;
  const hi = target ? tx + 1.25 : M.GUARD_CRYSTAL_REACH_X + 0.5;
  const goalL = target ? target.l : 0.5;
  const dl = goalL - lane;
  let vx = 0;
  if (s.__botReset) {
    if (me.x >= hi - 0.05) s.__botReset = false; else vx = 1;
  }
  if (!s.__botReset) {
    if (me.x < lo) { s.__botReset = true; vx = 1; } else if (me.x > hi || (me.facing ?? -1) > 0) vx = -1;
  }
  const vy = Math.abs(dl) >= 0.15 ? -Math.sign(dl) : 0;
  if (vx !== 0 || vy !== 0) {
    const table = [[0, 0], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
    M.guardRaidMove(s, Math.max(0, table.findIndex(([x, y]) => x === vx && y === vy)));
    return;
  }
  M.guardRaidMove(s, 0);
  if (tick % 97 === 13) { M.guardRaidDodge(s); return; }
  // docs/61 §8 主角大招(炼魂回执 raider.ult;旧模型没有这个函数)
  if (M.guardRaidUlt && s.raider.ultOpen && s.timeMs >= s.raider.ultReadyMs && M.guardRaidUlt(s)) return;
  for (const i of [2, 0, 1]) {
    if (s.timeMs >= ctl.skillReadyMs[i] && M.guardRaidSkill(s, i)) return;
  }
  M.guardRaidAttack(s);
}

function play(mod, start) {
  const setup = mod.R.guardReplaySetupFromStart(start, false);
  const s = mod.R.createGuardBattleFromSetup(setup);
  let tick = 0;
  while (s.phase !== 'victory' && s.phase !== 'defeat' && tick < 5000) {
    botStep(mod.M, s, tick);
    mod.M.guardTick(s, mod.R.GUARD_REPLAY_TICK_MS);
    s.events.length = 0;
    tick += 1;
  }
  const me = s.monsters.find((m) => m.monsterId === s.raider?.monsterId);
  return {
    s,
    live: { win: s.phase === 'victory', timeMs: s.timeMs, crystalHp: s.crystalHp },
    hpPct: me ? Math.round((me.hp / me.maxHp) * 100) : 0,
    guardsDown: s.heroes.filter((h) => h.dead).length,
    guards: s.heroes.length,
    dealt: s.raidDealt ?? {},
    taken: s.raidTaken ?? {},
  };
}

function replay(cli, start, inputs, version) {
  const proc = spawnSync('node', [cli], { input: JSON.stringify({ start, replay: JSON.stringify({ v: version, inputs }), allowChestScript: false }), encoding: 'utf8' });
  return JSON.parse(proc.stdout.trim());
}

const files = fs.readdirSync(receiptDir).filter((f) => /^receipt_.*\.json$/.test(f)).sort();
let bad = 0;
const summary = {};
for (const file of files) {
  const base = JSON.parse(fs.readFileSync(path.join(receiptDir, file), 'utf8'));
  const squad = Array.isArray(base.raid?.allies) && base.raid.allies.length > 0;
  // ULT=1:新口径回执强制开主角大招(docs/61 §8,炼魂号)——测大招进复演一致;ULT=0 强制关
  if (squad && (process.env.ULT === '1' || process.env.ULT === '0')) base.raid.raider.ult = process.env.ULT === '1';
  // LIVE_OLD=1:新口径回执也用旧模型实打(= 线上旧网页),验新复演对旧客户端兼容
  const live = squad && process.env.LIVE_OLD !== '1' ? NEW : OLD;
  const rows = [];
  for (let i = 0; i < N; i += 1) {
    const start = { ...base, battleNo: `${base.battleNo}-S${i}` };
    const run = play(live, start);
    const rep = replay(NEW.cli, start, run.s.inputs, NEW.R.GUARD_REPLAY_VERSION);
    const same = rep.ok && rep.win === run.live.win && rep.timeMs === run.live.timeMs && rep.crystalHp === run.live.crystalHp;
    if (!same) {
      bad += 1;
      console.log(`BAD ${file} #${i} live=${JSON.stringify(run.live)} replay=${JSON.stringify({ ok: rep.ok, reason: rep.reason, win: rep.win, timeMs: rep.timeMs, crystalHp: rep.crystalHp })}`);
    }
    rows.push(run);
  }
  const wins = rows.filter((r) => r.live.win).length;
  const avg = (f) => Math.round(rows.reduce((t, r) => t + f(r), 0) / rows.length);
  const tag = file.replace(/^receipt_|\.json$/g, '');
  const dealtShare = (() => {
    const total = {};
    for (const r of rows) for (const [k, v] of Object.entries(r.dealt)) total[k] = (total[k] ?? 0) + v;
    const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(total).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.replace(/_ATTACK$/, '')} ${Math.round((v / sum) * 100)}%`).join(' / ');
  })();
  summary[tag] = { wins, n: N, avgSec: Math.round(avg((r) => r.live.timeMs) / 1000), hpLeft: avg((r) => r.hpPct), guardsDown: `${avg((r) => r.guardsDown)}/${rows[0].guards}` };
  console.log(`${tag.padEnd(34)} ${squad ? 'SQUAD' : 'OLD  '} 胜 ${wins}/${N} · 均用时 ${summary[tag].avgSec}s · 主角剩血 ${summary[tag].hpLeft}% · 击倒 ${summary[tag].guardsDown} · 我方输出 ${dealtShare || '-'}`);
}
console.log(bad === 0 ? `ALL REPLAYS MATCH (${files.length} 回执 × ${N} 局)` : `${bad} MISMATCH`);
fs.writeFileSync(path.join(receiptDir, 'summary.json'), JSON.stringify(summary, null, 1));
process.exit(bad === 0 ? 0 : 1);
