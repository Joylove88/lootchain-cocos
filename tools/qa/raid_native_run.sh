set -u
# 矿境掠夺 PVE 安卓模拟器自验(docs/48):主城 → 矿境面板截图 → 掠夺当前可打的矿 → 机器人打到终局 → 截图(结算奖励)
# 用法:bash tools/qa/raid_native_run.sh <输出目录>(模拟器已登录大厅,本地游戏服 8081)
cd /d/project/lootchain-cocos
export MSYS_NO_PATHCONV=1
E="timeout 15 adb -s emulator-5554"; $E reverse tcp:8081 tcp:8081 >/dev/null; $E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const gr=root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;"
ev() { PYTHONIOENCODING=utf-8 timeout 25 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
D="$1"; mkdir -p "$D"
shot() { $E exec-out screencap -p > "$D/$1.png"; echo "shot $1"; }
state() { ev "if(!sim) return 'nosim'; const u=sim.monsters.find(m=>m.player); return JSON.stringify({phase:sim.phase, t:Math.round(sim.timeMs), hp:u&&Math.round(u.hp), heroes:sim.heroes.map(h=>Math.round(h.hp||0)+(h.dead?'X':'')), crystal:sim.crystalHp+'/'+sim.crystalMaxHp, serverRaid:gr.serverRaid, views:[...gr.heroViews.values()].map(v=>v.spineReady)});"; }
ev "root.returnToLobbyFromScenePage(); return 'lobby';"; sleep 3
ev "root.openLobbyRaidPanel(); return 'raid';"; sleep 8
ev "const s=root.currentLobbyRaidState(); return JSON.stringify({err:s.error, sel:s.selectedStageCode, cleared:s.stages&&s.stages.clearedMax});"
shot raid_panel
ev "const s=root.currentLobbyRaidState(); root.startLobbyRaidBattle(s.stages.nextStageCode); return s.stages.nextStageCode;"
for i in $(seq 1 30); do m=$(ev "return (gr && gr.isMounted() && raid) ? 'ready' : 'wait';"); [ "$m" = '"ready"' ] && break; sleep 2; done
sleep 3; state; shot raid_battle_start
ev "window.__raidBot = setInterval(()=>{ try { const u=sim.monsters.find(m=>m.player); if(!u||sim.phase!=='wave'){ clearInterval(window.__raidBot); return; } const alive=sim.heroes.filter(h=>!h.dead); const cellX=(c)=>1.45+(c%6)*1.18; const target=alive.length? alive.reduce((a,b)=>Math.abs(cellX(b.cell)-u.x)<Math.abs(cellX(a.cell)-u.x)?b:a) : null; const tx = target ? cellX(target.cell) : 0.9; const stop = target ? 1.1 : 0.2; const laneT = target ? (Math.floor(target.cell/6)===0 ? 0.25 : 0.75) : 0.5; const laneD = laneT - (u.laneF||0.5); raid.keys.delete(65); raid.keys.delete(68); raid.keys.delete(87); raid.keys.delete(83); if (Math.abs(tx-u.x) > stop || Math.abs(laneD) > 0.3) { if (Math.abs(tx-u.x) > stop) raid.keys.add(tx<u.x?65:68); if (Math.abs(laneD) > 0.3) raid.keys.add(laneD<0?87:83); setTimeout(()=>{ raid.keys.delete(65); raid.keys.delete(68); raid.keys.delete(87); raid.keys.delete(83); }, 120); } else { raid.attackPressedAt = Date.now(); if (Math.random()<0.15) raid.skillPressedAt[Math.floor(Math.random()*3)] = Date.now(); } } catch(e){} }, 300); return 'bot';"
sleep 12; state; shot raid_battle_mid
for i in $(seq 1 24); do ph=$(ev "return sim ? sim.phase : 'nosim';"); [ "$ph" != '"wave"' ] && break; sleep 5; done
ev "clearInterval(window.__raidBot); return 'stop';"; state
for i in $(seq 1 20); do s=$(ev "const b=root.currentLobbyBattleState(); return JSON.stringify({settling:b.settling, err:b.error, s:b.settlement&&{result:b.settlement.result, rewards:(b.settlement.rewardItems||[]).map(r=>r.resourceName+'x'+r.amount), msg:b.settlement.message}});"); echo "$s" | grep -q '"s":{' && { echo "$s"; break; }; sleep 1; done
sleep 2; shot raid_settlement
