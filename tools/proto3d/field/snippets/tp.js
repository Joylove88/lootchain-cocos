// 传到指定地图坐标(window.__tp = [x, y]);队友藏起来(开发时看清 3D);锁血
const P = window.__tp || [t.def.camps[0].x - 300, t.def.camps[0].y];
const all = [t.leader, ...t.followers];
all.forEach((a, i) => { a.x = P[0] - i * 90; a.y = P[1]; a.node.setPosition(a.x, a.y, 0); });
t.trail = [new cc.Vec2(P[0] - 400, P[1]), new cc.Vec2(P[0], P[1])];
t.applyCamera(true);
if (window.__hideFollowers !== false) t.followers.forEach(a => { a.node.active = false; });
clearInterval(window.__lcKeepAlive);
window.__lcKeepAlive = setInterval(() => { try { const tt = window.__root.lobbyTownRenderer; tt.leaderHp = tt.leaderMaxHp || 99999; tt.followers.forEach(a => { a.hp = a.maxHp || 99999; a.down = false; if (window.__hideFollowers !== false) a.node.active = false; }); } catch (e) {} }, 80);
await sleep(window.__tpWait || 3000);
const u = F.info();
return JSON.stringify({ at: P, h3: u.heroes3d, m3: u.monsters3d, extras: u.extras, err: u.lastError });
