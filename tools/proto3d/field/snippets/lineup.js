// 对照台:window.__lineup = { keys: [...], at: [x, y], n: 2, cam: [x, y] } → 后排手绘立牌、前排程序模型;队伍挪到一边、镜头对准
const L = window.__lineup || { keys: ['w3_tree_pine'], at: [-8000, -3500], n: 2 };
const P = window.__f3dprops;
const all = [t.leader, ...t.followers];
const cam = L.cam || [L.at[0] + 900, L.at[1]];
all.forEach((a, i) => { a.x = cam[0]; a.y = cam[1]; a.node.setPosition(a.x, a.y, 0); a.node.active = false; });
t.trail = [new cc.Vec2(cam[0] - 10, cam[1]), new cc.Vec2(cam[0], cam[1])];
t.applyCamera(true);
clearInterval(window.__lcKeepAlive);
window.__lcKeepAlive = setInterval(() => { try { const tt = window.__root.lobbyTownRenderer; tt.leaderHp = tt.leaderMaxHp || 99999; [tt.leader, ...tt.followers].forEach(a => { a.x = cam[0]; a.y = cam[1]; a.node.active = false; }); } catch (e) {} }, 30);
t.hitStopUntil = 0;
await sleep(2500);
const out = P.lineup(L.keys, L.at[0], L.at[1], L.n || 1, L.gap || 640);
await sleep(L.wait || 2500);
return out;
