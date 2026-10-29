"""docs/53 §4.1 晨风村自验(10-29 v3 点位):登录 → 切到晨风村 → 瞬移到各点位逐张 adb 截图,和原型 village_ingame / village_overview 比对。
前提:模拟器 emulator-5554 已装调试包并在前台;本地游戏服 8081;inspector 43086。
用法:python tools/qa/village2_shots.py <输出目录> [--login guidetest02]
"""
import argparse
import os
import subprocess
import time
import urllib.request

from town_v3_round import ADB, PORT, ev, shot, wait_for

SPOTS = [
    ('plaza', 784, -820),       # 村口广场 + 传送阵(出生点)
    ('market', 900, -200),      # 集市屋 / 小屋 / 铁匠铺方向
    ('bridge', 100, 120),       # 河潭木桥
    ('chief', 250, 500),        # 村长屋石台台阶
    ('altar', -1300, 430),      # 礼拜堂 + 圣契祭坛
    ('training', 1150, 250),    # 训练场入口
    ('windmill', -2100, -380),  # 风车坡 + 溪流
    ('falls', -500, -880),      # 跌水瀑布 + 水车磨坊
    ('gate', 2300, -1000),      # 村口出口
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
    # AVD 顶部挖孔:安全区打成整屏(只改测试进程)
    ev("const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); setTimeout(() => root.renderCurrentView(), 50); return 'patched';")
    time.sleep(2)
    print('world', wait_for("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait ' + root.currentView;", 'ready', 60), flush=True)
    # QA 账号多半已离开过晨风村(服务端锁图「你已离开晨风村」):测试进程里直接让渲染层切图,只看画面
    ev("if (t.currentMapCode() !== 'VILLAGE') setTimeout(() => { t.enterMap('VILLAGE', { x: 784, y: -820 }); root.renderCurrentView(); }, 50); return 1;")
    print('map', wait_for("return t.currentMapCode() === 'VILLAGE' && t.leader ? 'ok ' + t.def.width + 'x' + t.def.height : 'wait';", 'ok'), flush=True)
    time.sleep(6)
    for name, x, y in SPOTS:
        print(name, ev(f"tp({x}, {y}); return t.currentMapCode();"), flush=True)
        time.sleep(2.5)
        shot(args.out, name)
    # 全村鸟瞰:临时停掉跟镜头,把世界层缩到 0.2 居中(只改测试进程),和 village_overview 比布局
    ev("t._ac = t.applyCamera; t.applyCamera = () => {}; t.world.setScale(0.2, 0.2, 1); t.world.setPosition(0, -8, 0); return 1;")
    time.sleep(2.5)
    shot(args.out, 'overview')
    ev("t.applyCamera = t._ac; t.world.setScale(1, 1, 1); t.applyCamera(true); return 1;")


if __name__ == '__main__':
    main()
