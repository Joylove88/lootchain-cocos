// 站到怪群旁,出一下手(window.__act = 'attack' | 0 | 1 | 2),等 window.__actWait 毫秒后定格
const camp = t.def.camps.find(x => !x.elite && !x.dummy);
const live = t.monsters.filter(m => !m.dead && m.node.isValid && m.camp.stageCode === camp.stageCode);
const all = [t.leader, ...t.followers];
if (window.__tpNear !== false && live.length) {
  // 站到离队长最近的活怪左边一点
  let best = live[0], bd = 1e9; for (const m of live) { const d = Math.hypot(m.x - t.leader.x, m.y - t.leader.y); if (d < bd) { bd = d; best = m; } }
  if (bd > 260) { all.forEach((a, i) => { a.x = best.x - 150 - i * 90; a.y = best.y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(best.x - 500, best.y), new cc.Vec2(best.x - 150, best.y)]; t.applyCamera(true); }
}
clearInterval(window.__lcKeepAlive);
window.__lcKeepAlive = setInterval(() => { try { const tt = window.__root.lobbyTownRenderer; tt.leaderHp = tt.leaderMaxHp || 99999; tt.followers.forEach(a => { a.hp = a.maxHp || 99999; a.down = false; }); } catch (e) {} }, 80);
t.hitStopUntil = 0;
await sleep(500);
t.skillReadyAt = [0, 0, 0]; t.actionUntil = 0;
const act = window.__act === undefined ? 'attack' : window.__act;
if (act === 'attack') t.leaderAttack(); else t.leaderSkill(act);
await sleep(window.__actWait || 300);
t.hitStopUntil = Date.now() + 3600000;
await sleep(120);
const u = F.info();
return JSON.stringify({ act, extras: u.extras, err: u.lastError });
