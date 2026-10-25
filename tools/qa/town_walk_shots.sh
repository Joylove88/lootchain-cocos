set -u
# 主城跑图自验:出生点 → 键盘向右走 → 走到熔铸工坊门口(出现「进入」)→ 进入锻造 → 回大厅(位置保留)
# 用法:bash tools/qa/town_walk_shots.sh <输出目录>(模拟器已登录大厅,本地游戏服 8081)
cd /d/project/lootchain-cocos
export MSYS_NO_PATHCONV=1
E="timeout 15 adb -s emulator-5554"; $E reverse tcp:8081 tcp:8081 >/dev/null; $E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const town=root.lobbyTownRenderer;"
ev() { PYTHONIOENCODING=utf-8 timeout 25 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
D="$1"; mkdir -p "$D"
shot() { $E exec-out screencap -p > "$D/$1.png"; echo "shot $1"; }
# 按住某键 ms 毫秒(直接改渲染器的按键集合,走真实 step)
hold() { ev "town.keys.add($1); setTimeout(()=>town.keys.delete($1), $2); return 'hold';"; }

ev "root.returnToLobbyFromScenePage(); return root.currentView;"; sleep 4
ev "return town.isMounted() ? 'mounted leader=' + JSON.stringify(town.leader && {x:Math.round(town.leader.x), y:Math.round(town.leader.y)}) + ' buildings=' + town.buildings.length + ' sprites=' + town.buildings.filter(b=>b.sprite).length : 'not mounted';"
shot town_spawn
# 向右走 1.6 秒(KEY_D = 68)
hold 68 1600; sleep 2.2
ev "return 'after D: ' + JSON.stringify({x:Math.round(town.leader.x), y:Math.round(town.leader.y), facing: town.leader.facing, anim: town.leader.anim});"
shot town_walk_right
# 直接把队长放到熔铸工坊门口,看进入钮
ev "const cfg=town.buildings.find(b=>b.cfg.key==='forge').cfg; town.leader.x=cfg.x+cfg.door.x-40; town.leader.y=cfg.y+cfg.door.y-20; town.leader.node.setPosition(town.leader.x, town.leader.y, 0); return 'teleported';"; sleep 1
ev "return 'near=' + town.nearKey + ' enterActive=' + (town.enterButton && town.enterButton.active);"
shot town_forge_door
# 进入
ev "town.enterNearBuilding(); return 'enter';"; sleep 5
ev "return 'view=' + root.currentView;"
shot town_enter_forge
# 回大厅:位置应保留在工坊门口
ev "root.closeLobbyForgePanel(); return 'back';"; sleep 4
ev "return 'back view=' + root.currentView + ' leader=' + JSON.stringify({x:Math.round(town.leader.x), y:Math.round(town.leader.y)}) + ' near=' + town.nearKey;"
shot town_back
# 向左上走回广场看跟随
hold 65 1500; hold 87 900; sleep 2.5
shot town_walk_back
