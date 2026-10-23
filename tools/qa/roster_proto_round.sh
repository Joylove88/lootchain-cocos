#!/usr/bin/env bash
# 英雄名册原型 B 自审一轮:打调试包 → 装模拟器 → 登录 → 截名册(全部 / 切一个职业 / 点开再返回看高亮)→ 原型对比图
# 用法:bash tools/qa/roster_proto_round.sh <版本号> [--no-build]
set -u
V="$1"
cd /d/project/lootchain-cocos || exit 1
E="timeout 15 adb -s emulator-5554"
if [ "${2:-}" != "--no-build" ]; then
  npm run build:android > "$TEMP/lc-build-android-r$V.log" 2>&1
  grep -q "\[android\] 完成" "$TEMP/lc-build-android-r$V.log" || { echo BUILD_FAILED; tail -8 "$TEMP/lc-build-android-r$V.log"; exit 1; }
  APK=$(grep -o "APK:[^(]*" "$TEMP/lc-build-android-r$V.log" | tail -1 | sed 's/^APK://; s/[[:space:]]*$//')
  $E shell am force-stop com.lootchain.silentgods
  timeout 200 adb -s emulator-5554 install -r "$APK" 2>&1 | tail -1
fi
$E reverse tcp:8081 tcp:8081 >/dev/null
$E forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
J="(()=>{ $R if(!root) return 'noroot'; return root.currentView; })()"
ev() { timeout 20 python tools/qa/native_js_eval.py "(()=>{ $R $1 })()" 2>/dev/null | tail -1; }
launch() {
  $E shell am start -n com.lootchain.silentgods/com.cocos.game.AppActivity >/dev/null 2>&1
  local r=""
  for i in $(seq 1 60); do r=$(timeout 8 python tools/qa/native_js_eval.py "$J" 2>/dev/null | tail -1); case "$r" in *lobby*|*login*|*heroes*) break;; esac; sleep 3; done
  case "$r" in *login*) sleep 3; ev "root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'go';" >/dev/null; for i in $(seq 1 25); do r=$(timeout 8 python tools/qa/native_js_eval.py "$J" 2>/dev/null | tail -1); case "$r" in *lobby*) break;; esac; sleep 3; done;; esac
  sleep 4
  echo "view $r"
}
$E shell pidof com.lootchain.silentgods >/dev/null || launch
D="$TEMP/lootchain-qa/roster_r$V"; rm -rf "$D"; mkdir -p "$D"
shot() { timeout 20 adb -s emulator-5554 exec-out screencap -p > "$D/$1.png"; }
ev "root.openLobbyHeroRosterPanel(); return 'ok';"; sleep 5; shot roster_all
ev "root.lobbyHeroRosterPanelRenderer.selectHeroClassFilter('坦克'); return 'ok';"; sleep 3; shot roster_tank
ev "root.lobbyHeroRosterPanelRenderer.selectHeroClassFilter('全部'); return 'ok';"; sleep 3
P="周报截图/2026-10-23_英雄名册重设计/proto/hero_roster_B.png"
[ -f "$D/roster_all.png" ] && PYTHONIOENCODING=utf-8 python tools/qa/proto_compare.py "$P" "$D/roster_all.png" "$D/cmp" 0,0,1,1 0.17,0.08,1,0.5 0,0,0.2,1 | tail -1
ls "$D"
# 属性详情 / 洗练弹窗(英雄 133)
ev "root.openLobbyHeroDetail(133); return 'ok';"; sleep 9
ev "root.selectLobbyHeroDetailTab('attr'); return 'ok';"; sleep 3
ev "const r=root.lobbyHeroDetailPanelRenderer; const c=r.detailRenderContext; r.showAttrDetailPopup(c.panelGroup, root.currentLobbyHeroDetailHero(), c.scale); return 'ok';"; sleep 1; shot attr_detail
ev "root.selectLobbyHeroDetailTab('attr'); return 'ok';"; sleep 3
ev "root.openLobbyHeroRefineDialog(); return 'ok';"; sleep 4; shot refine
Q="周报截图/2026-10-23_属性详情洗练重设计/proto"
[ -f "$D/attr_detail.png" ] && PYTHONIOENCODING=utf-8 python tools/qa/proto_compare.py "$Q/attr_A.png" "$D/attr_detail.png" "$D/cmp_attr" 0.18,0.04,0.82,0.98 | tail -1
[ -f "$D/refine.png" ] && PYTHONIOENCODING=utf-8 python tools/qa/proto_compare.py "$Q/refine_B.png" "$D/refine.png" "$D/cmp_refine" 0.15,0.05,0.85,0.96 | tail -1
