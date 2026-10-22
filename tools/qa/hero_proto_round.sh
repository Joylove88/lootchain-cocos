#!/usr/bin/env bash
# 英雄详情原型自审一轮:打调试包 → 装模拟器 → 登录 → 逐页截图(闪退自动拉起)→ 生成原型对比图
# 用法:bash tools/qa/hero_proto_round.sh <版本号,如 116>
set -u
V="$1"
cd /d/project/lootchain-cocos || exit 1
npm run build:android > "$TEMP/lc-build-android-v$V.log" 2>&1
grep -q "\[android\] 完成" "$TEMP/lc-build-android-v$V.log" || { echo BUILD_FAILED; tail -8 "$TEMP/lc-build-android-v$V.log"; exit 1; }
APK=$(grep -o "APK:[^(]*" "$TEMP/lc-build-android-v$V.log" | tail -1 | sed 's/^APK://; s/[[:space:]]*$//')
for p in $(adb -s emulator-5554 shell "pm list packages -3" | sed 's/package://' | tr -d '\r' | grep -v lootchain); do adb -s emulator-5554 shell am force-stop "$p"; done
adb -s emulator-5554 shell am force-stop com.lootchain.silentgods
timeout 200 adb -s emulator-5554 install -r "$APK" 2>&1 | tail -1
adb -s emulator-5554 reverse tcp:8081 tcp:8081 >/dev/null
adb -s emulator-5554 forward tcp:43086 tcp:43086 >/dev/null
R="let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
J="(()=>{ $R if(!root) return 'noroot'; return root.currentView; })()"
launch() {
  adb -s emulator-5554 shell am start -n com.lootchain.silentgods/com.cocos.game.AppActivity >/dev/null 2>&1
  local r=""
  for i in $(seq 1 60); do r=$(timeout 8 python tools/qa/native_js_eval.py "$J" 2>/dev/null | tail -1); case "$r" in *lobby*|*login*) break;; esac; sleep 3; done
  case "$r" in *login*) sleep 3; timeout 20 python tools/qa/native_js_eval.py "(()=>{ $R root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'go'; })()" >/dev/null; for i in $(seq 1 25); do r=$(timeout 8 python tools/qa/native_js_eval.py "$J" 2>/dev/null | tail -1); case "$r" in *lobby*) break;; esac; sleep 3; done;; esac
  sleep 4
  echo "view $r"
}
launch
D="$TEMP/lootchain-qa/hero_v$V"; mkdir -p "$D"
for t in hero_attr hero_skill hero_star hero_equip; do
  adb -s emulator-5554 shell pidof com.lootchain.silentgods >/dev/null || launch
  PYTHONIOENCODING=utf-8 timeout 300 python tools/qa/native_capture_screens.py --device emulator-5554 --out "$D" --only "$t" 2>&1 | tail -1
  [ -f "$D/$t.png" ] || { launch; PYTHONIOENCODING=utf-8 timeout 300 python tools/qa/native_capture_screens.py --device emulator-5554 --out "$D" --only "$t" 2>&1 | tail -1; }
done
P="周报截图/2026-10-22_英雄详情打磨/proto"
for t in attr skill star; do
  [ -f "$D/hero_$t.png" ] && PYTHONIOENCODING=utf-8 python tools/qa/proto_compare.py "$P/hero_$t.png" "$D/hero_$t.png" "$D/cmp_$t" 0,0,1,1 0.55,0.06,1,1 0,0,0.56,1 | tail -1
done
ls "$D"
