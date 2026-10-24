set -u
# docs/45 第二批自验(交互):普通召唤页、绑钻获取途径小窗、装备转移确认弹窗
# 用法:bash tools/qa/batch2_interact_shots.sh <输出目录>(模拟器已登录大厅)
cd /d/project/lootchain-cocos
export MSYS_NO_PATHCONV=1
E="timeout 15 adb -s emulator-5554"; $E reverse tcp:8081 tcp:8081 >/dev/null; $E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
ev() { PYTHONIOENCODING=utf-8 timeout 25 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
D="$1"; mkdir -p "$D"
shot() { $E exec-out screencap -p > "$D/$1.png"; echo "shot $1"; }

# 1) 召唤页选普通召唤(顶部公告写"不会消耗钻石",顶栏绑钻胶囊)
ev "root.returnToLobbyFromScenePage(); return 'lobby';"; sleep 3
ev "root.openLobbyGachaScene(); return 'gacha';"; sleep 6
ev "root.selectGachaPool('BASIC_CONTRACT_PREVIEW'); return 'basic';"; sleep 3
shot gacha_basic
# 2) 绑钻获取途径小窗
ev "root.openItemSourcePopup({ key: 'BOUND_DIAMOND', name: '绑钻', owned: 0, need: 800 }); return 'popup';"; sleep 2
shot bound_source
ev "let f=null; cc.director.getScene().walk(n=>{ if(n.name==='ItemSourcePopup') f=n; }); if(f) f.destroy(); root.closeGachaScene(); return 'closed';"; sleep 3

# 3) 装备转移确认:英雄详情装备页,选一件穿在别的英雄身上的同部位装备,点主操作钮
ev "const all=root.lobbyHeroRosterLoader.currentState().heroes.filter(h=>h.id>0); root.openLobbyHeroDetail(all[0].id); setTimeout(()=>root.selectLobbyHeroDetailTab('equip'), 1500); return 'detail '+all[0].heroName;"; sleep 5
ev "const hero=root.currentLobbyHeroDetailHero(); const other=root.lobbyEquipmentItems.find(i=>i.heroId!=null && i.heroId!==hero.id); if(!other) return 'no other-worn item'; root.selectLobbyHeroEquipSlot(other.slot); root.selectLobbyHeroWearEquip(other.id); return 'pick '+other.equipName+' slot '+other.slot;"; sleep 3
ev "root.transferLobbyHeroEquipment(root.lobbyHeroWearSelectedEquipId); return 'confirm';"; sleep 2
shot transfer_confirm
ev "let f=null; cc.director.getScene().walk(n=>{ if(n.name==='ConfirmPopup') f=n; }); if(f) f.destroy(); return 'cancelled';"
