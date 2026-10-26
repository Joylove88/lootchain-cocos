set -u
# 矿境面板两页签安卓模拟器截图(UI 对原型自验):bash tools/qa/raid_ui_native_shots.sh <输出目录>(模拟器已登录大厅,本地游戏服 8081)
cd /d/project/lootchain-cocos
export MSYS_NO_PATHCONV=1
E="timeout 15 adb -s emulator-5554"; $E reverse tcp:8081 tcp:8081 >/dev/null; $E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
ev() { PYTHONIOENCODING=utf-8 timeout 25 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
D="$1"; mkdir -p "$D"
shot() { $E exec-out screencap -p > "$D/$1.png"; echo "shot $1"; }
ev "root.returnToLobbyFromScenePage(); return 'lobby';"; sleep 3
ev "root.openLobbyRaidPanel(); return 'raid';"; sleep 10
ev "root.selectLobbyRaidTab('pvp'); return 'pvp';"; sleep 5
ev "const s=root.currentLobbyRaidPvpState ? root.currentLobbyRaidPvpState() : null; return JSON.stringify(s && {err:s.error, loading:s.loading, n:s.home&&s.home.candidates.length});"
shot raid_pvp
ev "root.selectLobbyRaidTab('npc'); return 'npc';"; sleep 4
shot raid_npc
