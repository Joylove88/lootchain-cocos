set -u
# docs/47 P0 掠夺原型自验:主城 → 冒险之门直达掠夺 → 键盘向左冲 → 普攻连段 → 技能 → 翻滚 → 看守卫掉血 / 水晶掉血 / 终局
# 用法:bash tools/qa/raid_p0_shots.sh <输出目录>(模拟器已登录大厅,本地游戏服 8081)
cd /d/project/lootchain-cocos
export MSYS_NO_PATHCONV=1
E="timeout 15 adb -s emulator-5554"; $E reverse tcp:8081 tcp:8081 >/dev/null; $E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const gr=root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;"
ev() { PYTHONIOENCODING=utf-8 timeout 25 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
D="$1"; mkdir -p "$D"
shot() { $E exec-out screencap -p > "$D/$1.png"; echo "shot $1"; }
hold() { ev "raid.keys.add($1); setTimeout(()=>raid.keys.delete($1), $2); return 'hold';"; }
press() { ev "$1 = Date.now(); return 'press';"; }
state() { ev "const u=sim.monsters.find(m=>m.player); return JSON.stringify({phase:sim.phase, t:Math.round(sim.timeMs), raider:u&&{x:+u.x.toFixed(2), lane:+(u.laneF||0).toFixed(2), hp:Math.round(u.hp), max:u.maxHp, facing:u.facing}, heroes:sim.heroes.map(h=>({c:h.cell, hp:Math.round(h.hp||0), max:h.maxHp, dead:!!h.dead})), crystal:Math.round(sim.crystalHp)+'/'+sim.crystalMaxHp, combo:sim.raider&&sim.raider.comboStep, inputs:sim.inputs.length});"; }

ev "root.returnToLobbyFromScenePage(); return 'lobby';"; sleep 3
ev "root.startRaidPrototype(); return 'raid';"; sleep 12
ev "return 'view=' + root.currentView + ' mounted=' + (gr && gr.isMounted()) + ' raid=' + !!raid + ' mode=' + (sim && sim.mode);"
state; shot raid_start
# 向左冲 2.2 秒(KEY_A = 65)
hold 65 1100; sleep 1.5; state; shot raid_approach
# 普攻 x3(每次间隔 0.35s,连段窗口内)
press raid.attackPressedAt; sleep 0.35; press raid.attackPressedAt; sleep 0.35; press raid.attackPressedAt; sleep 0.25; shot raid_combo; sleep 0.6; state
# 技能 0 重斩
press "raid.skillPressedAt[0]"; sleep 0.3; shot raid_skill0; sleep 0.8; state
# 翻滚
press raid.dodgePressedAt; sleep 0.5; state
# 自动打:每 0.4s 普攻,直到守卫倒下或 25s
ev "window.__raidBot = setInterval(()=>{ try { const u=sim.monsters.find(m=>m.player); if(!u||sim.phase!=='wave'){ clearInterval(window.__raidBot); return; } const alive=sim.heroes.filter(h=>!h.dead); const target=alive.length? alive.reduce((a,b)=>Math.abs(b.cell%6*1.18+1.45-u.x)<Math.abs(a.cell%6*1.18+1.45-u.x)?b:a) : null; const tx = target ? (target.cell%6)*1.18+1.45 : 0.9; const stop = target ? 1.1 : 0.2; if (Math.abs(tx-u.x) > stop) { raid.keys.add(tx<u.x?65:68); setTimeout(()=>{ raid.keys.delete(65); raid.keys.delete(68); }, 120); } else { raid.attackPressedAt = Date.now(); if (Math.random()<0.15) raid.skillPressedAt[Math.floor(Math.random()*3)] = Date.now(); } } catch(e){} }, 400); return 'bot';"
sleep 12; state; shot raid_fight
sleep 14; state; shot raid_late
# 等终局(守卫清完后机器人去砍水晶),最多 60s
for i in $(seq 1 12); do ph=$(ev "return sim.phase;"); [ "$ph" != '"wave"' ] && break; sleep 5; done
ev "clearInterval(window.__raidBot); return 'stop';"
state; sleep 2; shot raid_end
