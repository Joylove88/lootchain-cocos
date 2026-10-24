set -u
# docs/45 第二批自验:锻造词缀洗练弹窗、冒险挑战弹框(首通奖励带数量)、守卫战底部按钮(战术 / 招募)
# 用法:bash tools/qa/batch2_extra_shots.sh <输出目录>(模拟器已登录大厅)
cd /d/project/lootchain-cocos
export MSYS_NO_PATHCONV=1
E="timeout 15 adb -s emulator-5554"; $E reverse tcp:8081 tcp:8081 >/dev/null; $E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
ev() { PYTHONIOENCODING=utf-8 timeout 25 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
D="$1"; mkdir -p "$D"
shot() { $E exec-out screencap -p > "$D/$1.png"; echo "shot $1"; }
FIND="const find=(name)=>{ let f=null; const w=(n)=>{ if(f) return; if(n.name===name){f=n;return;} n.children.forEach(w); }; w(cc.director.getScene()); return f; };"

# 1) 锻造强化页 → 选一件紫装以上 → 词缀洗练弹窗
ev "root.returnToLobbyFromScenePage(); return 'lobby';"; sleep 3
ev "root.openLobbyForgePanel(); return 'forge';"; sleep 6
ev "const it=root.lobbyEquipmentItems.find(i=>['PURPLE','ORANGE','RED'].indexOf(String(i.quality).toUpperCase())>=0); if(!it) return 'no purple'; root.lobbyForgeEnhanceSlotId=it.id; root.lobbyForgeEnhanceSlotTab=it.slot; root.renderCurrentView(); setTimeout(()=>root.openLobbyForgeRerollDialog(), 1200); return 'reroll '+it.equipName;"
sleep 4; shot forge_reroll
ev "root.closeLobbyForgeRerollDialog(); root.returnToLobbyFromScenePage(); return 'back';"; sleep 3

# 2) 冒险挑战弹框(MAIN_1_2 首通奖励)
ev "root.openLobbyAdventurePanel(); return 'adv';"; sleep 5
ev "root.lobbyAdventurePanelRenderer.showChallengeDialog('MAIN_1_2'); return 'shown';"; sleep 3
shot challenge_dialog

# 3) 进守卫战,看底部 战术 / 招募 按钮与帮助
ev "$FIND const ch=find('BattleChallengeDialogChallengeButton'); if(!ch) return 'nobtn'; ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); return 'clicked';"
sleep 25
ev "const gr=root.lobbyGuardBattleRenderer; if(!gr||!gr.sim) return 'nosim'; gr.sim.gold=600; return 'wave '+gr.sim.wave+' phase '+gr.sim.phase;"
sleep 2; shot battle_hud
