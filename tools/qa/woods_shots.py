"""村外林地 v3 自验(2026-10-29):登录 → 切到林地 → 瞬移到各据点逐张 adb 截图 + 全图鸟瞰,和原型 woods_overview 比对。
前提同 village2_shots(模拟器 emulator-5554 / 游戏服 8081 / inspector 43086)。
用法:python tools/qa/woods_shots.py <输出目录> [--login guidetest02]
"""
import argparse
import os
import subprocess
import time
import urllib.request

from town_v3_round import ADB, PORT, ev, shot, wait_for

S, CX, CY = 7.5, 904, 435


def w(px: float, py: float) -> tuple:
    return round((px - CX) * S), round((CY - py) * S)


SPOTS = [
    ('camp', *w(240, 735)),       # 入口营地 + 传送阵
    ('ratnest', *w(430, 470)),    # 幼鼠窝
    ('bridge', *w(790, 455)),     # 木桥 + 溪流
    ('spider', *w(940, 260)),     # 林间蛛巢 + 瀑布方向
    ('hunter', *w(1250, 360)),    # 猎人营地
    ('ruins', *w(1100, 690)),     # 古树遗迹
    ('bearden', *w(1560, 215)),   # 熊穴
    ('chest', *w(435, 620)),      # 林间木箱(入口营地外)
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--login', default='guidetest02')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    subprocess.run(ADB + ['forward', 'tcp:43086', 'tcp:43086'], capture_output=True)
    subprocess.run(ADB + ['reverse', 'tcp:8081', 'tcp:8081'], capture_output=True)
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=2).read()
            break
        except Exception:
            time.sleep(1.5)
    time.sleep(3)
    view = wait_for("return root && (root.currentView === 'login' || root.currentView === 'lobby') ? 'view=' + root.currentView : 'wait';", 'view=')
    if 'view=login' in view:
        pw = os.environ.get('QA_PASS', 'pass1234')
        ev(f"root.loginFlow.setInputs({{string:'{args.login}'}}, {{string:'{pw}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
        print('login', args.login, flush=True)
    ev("const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); setTimeout(() => root.renderCurrentView(), 50); return 'patched';")
    time.sleep(2)
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait ' + root.currentView;", 'ready', 60), flush=True)
    # 走正常换图(带按图预载);林地对出村玩家开放
    ev("if (t.currentMapCode() !== 'WOODS') setTimeout(() => root.travelWorldMap('WOODS', null), 50); return 1;")
    print('map', wait_for("return t.currentMapCode() === 'WOODS' && t.leader ? 'ok ' + t.def.width + 'x' + t.def.height : 'wait';", 'ok', 60), flush=True)
    time.sleep(6)
    for name, x, y in SPOTS:
        print(name, ev(f"tp({x}, {y}); return t.monsters.length;"), flush=True)
        time.sleep(3)
        shot(args.out, name)
    # 全图鸟瞰:世界层缩到 0.095 居中(只改测试进程)
    ev("t._ac = t.applyCamera; t.applyCamera = () => {}; t.world.setScale(0.095, 0.095, 1); t.world.setPosition(0, -8, 0); return 1;")
    time.sleep(3)
    shot(args.out, 'overview')
    ev("t.applyCamera = t._ac; t.world.setScale(1, 1, 1); t.applyCamera(true); return 1;")


if __name__ == '__main__':
    main()
