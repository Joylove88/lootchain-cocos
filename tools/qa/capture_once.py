"""native_capture_screens 的单连接版:整轮只 attach 一次 inspector(调试包每次 attach 都可能撞 gfx-validator 崩)。
用法:python tools/qa/capture_once.py <输出目录> <界面键,逗号分隔>(键见 native_capture_screens.SCREENS)
"""
import os
import sys
import time
import urllib.request

from native_capture_screens import RESET_JS, ROOT_JS, SCREENS
from town_v3_round import ADB, INSPECTOR, PORT, shot


def main() -> None:
    out, keys = sys.argv[1], [k for k in sys.argv[2].split(',') if k]
    os.makedirs(out, exist_ok=True)
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=2).read()
            break
        except Exception:
            time.sleep(1.5)
    time.sleep(3)
    for _ in range(40):
        view = INSPECTOR.call(f"(() => {{ {ROOT_JS} return root ? root.currentView : 'none'; }})()")
        if 'lobby' in view:
            break
        if 'login' in view:
            # 服务重启后旧登录态失效:用本地 QA 账号登录(QA_LOGIN / QA_PASS)
            user, pw = os.environ.get('QA_LOGIN', 'guidetest05'), os.environ.get('QA_PASS', 'pass1234')
            INSPECTOR.call(f"(() => {{ {ROOT_JS} root.loginFlow.setInputs({{string:'{user}'}}, {{string:'{pw}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 1; }})()")
        time.sleep(1.5)
    time.sleep(4)
    if os.environ.get('QA_FULLSCREEN') == '1':
        # 这台 AVD 自带顶部 136px 挖孔:安全区打成整屏再整刷,和原型 1:1 对比(只改测试进程)
        INSPECTOR.call(f"(() => {{ {ROOT_JS} const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); setTimeout(() => root.renderCurrentView(), 50); return 1; }})()")
        time.sleep(2)
    # 模拟器重启后游戏可能先于 adb reverse 起来,首批请求失败(英雄列表为空):截图前补拉一次英雄 / 资料
    INSPECTOR.call(f"(() => {{ {ROOT_JS} setTimeout(() => {{ try {{ root.loadLobbyHeroRoster && root.loadLobbyHeroRoster(); }} catch (e) {{}} }}, 50); return 1; }})()")
    time.sleep(3)
    table = {key: (js, wait) for key, js, wait in SCREENS}
    for key in keys:
        js, wait = table[key]
        res = INSPECTOR.call(f"(() => {{ {ROOT_JS} setTimeout(() => {{ {RESET_JS} try {{ {js} }} catch (e) {{ console.warn(e); }} }}, 50); return root.currentView; }})()")
        time.sleep(wait + 0.5)
        shot(out, key)
        print(key, res, flush=True)


if __name__ == '__main__':
    main()
