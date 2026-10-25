set -u
# 强化护符商店自验(docs/45 §12):商店护符页、买 1 张(本地库)、买后页、锻造强化页成功率、护符获取途径小窗
# 用法:bash tools/qa/rune_shop_shots.sh <输出目录>(模拟器已登录大厅,本地游戏服 8081)
cd /d/project/lootchain-cocos
export MSYS_NO_PATHCONV=1
E="timeout 15 adb -s emulator-5554"; $E reverse tcp:8081 tcp:8081 >/dev/null; $E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
ev() { PYTHONIOENCODING=utf-8 timeout 25 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
D="$1"; mkdir -p "$D"
shot() { $E exec-out screencap -p > "$D/$1.png"; echo "shot $1"; }

ev "root.returnToLobbyFromScenePage(); return 'lobby';"; sleep 3
ev "root.openLobbyShopDialog('rune'); return 'shop';"; sleep 5
ev "const c=root.lobbyShopDialog&&root.lobbyShopDialog.catalog; return c&&c.runeOffer ? JSON.stringify(c.runeOffer) : 'no runeOffer';"
shot shop_rune
ev "root.buyShopRune(1); return 'buy';"; sleep 5
ev "const c=root.lobbyShopDialog&&root.lobbyShopDialog.catalog; return (root.lobbyShopDialog&&root.lobbyShopDialog.notice)+' | '+(c&&c.runeOffer ? JSON.stringify(c.runeOffer) : '');"
shot shop_rune_bought
ev "root.closeLobbyShopDialog(); return 'closed';"; sleep 2

# 锻造强化页:选强化等级最高的一件看成功率
ev "root.openLobbyForgePanel(); return 'forge';"; sleep 6
ev "const it=root.lobbyEquipmentItems.slice().sort((a,b)=>(b.enhanceLevel||0)-(a.enhanceLevel||0))[0]; if(!it) return 'none'; root.lobbyForgeEnhanceSlotId=it.id; root.lobbyForgeEnhanceSlotTab=null; root.renderCurrentView(); return it.equipName+' +'+it.enhanceLevel;"
sleep 3; shot forge_enhance
ev "root.openItemSourcePopup({ key: 'ENHANCE_GUARD_RUNE', name: '强化护符' }); return 'popup';"; sleep 2
shot rune_source
ev "let f=null; cc.director.getScene().walk(n=>{ if(n.name==='ItemSourcePopup') f=n; }); if(f) f.destroy(); return 'x';"
