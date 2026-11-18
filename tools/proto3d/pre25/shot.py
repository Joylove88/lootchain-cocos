# -*- coding: utf-8 -*-
"""预渲染 2.5D 小样自验:无头 Edge(真逐帧跑,不像内置浏览器面板会卡住刷新)打开小样页,摆几个主角位置截图,再按住键走一段、按劈砍,记帧数。

  python tools/proto3d/pre25/shot.py <页面地址> <输出目录> [宽x高] [像素比]

独立调试端口 9369 + 配置目录 pre25_profile;跑完自己关浏览器(只关自己起的这个进程)。
"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

URL, OUT = sys.argv[1], sys.argv[2]
SIZE = [int(v) for v in (sys.argv[3] if len(sys.argv) > 3 else '1920x1080').split('x')]
DPR = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
PORT = 9369
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
SCRATCH = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
os.makedirs(OUT, exist_ok=True)

# 摆位:名字、x、z、朝向(0 = 画面上方 / 90 = 左 / 180 = 下 / 270 = 右)、状态、动作时间
POSES = [
    ('center', 0.0, 2.0, 180, 'stand', 0),
    ('behind_well', 0.55, -3.8, 0, 'stand', 0),
    ('behind_well_far', 1.5, -3.6, 0, 'stand', 0),
    ('behind_well_far2', 2.4, -3.6, 0, 'stand', 0),
    ('front_well', -2.6, -3.8, 180, 'jog', 0.2),
    ('behind_lamp', 3.1, 8.4, 0, 'stand', 0),
    ('near_forge', -6.0, -7.5, 90, 'cut', 0.5),
    ('stall', -3.0, 9.8, 270, 'cut', 0.45),
]


async def main():
    profile = os.path.join(SCRATCH, 'pre25_profile')
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', f'--window-size={SIZE[0]},{SIZE[1]}', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            issues = []

            async def call(m, p=None, timeout=60):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x
                    if x.get('method') == 'Runtime.exceptionThrown':
                        issues.append('exception ' + json.dumps(x['params'].get('exceptionDetails', {}), ensure_ascii=False)[:300])
                    elif x.get('method') == 'Runtime.consoleAPICalled' and x['params'].get('type') == 'error':
                        issues.append('console.error ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in x['params'].get('args', []))[:300])

            async def ev(js):
                r = await call('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
                return r.get('result', {}).get('result', {}).get('value')

            async def snap(name):
                r = await call('Page.captureScreenshot', {'format': 'png'})
                open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(r['result']['data']))

            async def snap_crop(name):
                # 主角附近一块放大看(镜头跟着主角,主角在画面中间偏下一点)
                r = await call('Page.captureScreenshot', {'format': 'png', 'clip': {'x': SIZE[0] / 2 - 260, 'y': SIZE[1] / 2 - 200, 'width': 520, 'height': 400, 'scale': 1}})
                open(os.path.join(OUT, name + '_crop.png'), 'wb').write(base64.b64decode(r['result']['data']))

            async def key(code, kc, down):
                await call('Input.dispatchKeyEvent', {'type': 'keyDown' if down else 'keyUp', 'code': code, 'key': code, 'windowsVirtualKeyCode': kc})

            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': SIZE[0], 'height': SIZE[1], 'deviceScaleFactor': DPR, 'mobile': False})
            t0 = time.time()
            await call('Page.navigate', {'url': URL})
            for _ in range(120):
                await asyncio.sleep(0.5)
                if await ev('!!window.__pre25'):
                    break
            print('loaded', round(time.time() - t0, 1), 's')
            await asyncio.sleep(1.5)
            for name, x, z, yaw, st, tt in POSES:
                await ev(f"(() => {{ const h = __pre25.hero; h.x = {x}; h.z = {z}; h.yaw = {yaw}; h.state = '{st}'; h.t = {tt}; h.freeze = true; return 1; }})()")
                await asyncio.sleep(0.6)
                await snap(name)
                await snap_crop(name)
            await ev("(() => { const h = __pre25.hero; h.freeze = false; h.x = 0; h.z = 2; h.state = 'stand'; h.t = 0; return 1; })()")
            # 按住 D(往右)走 1.5 秒、再按 W 走 1 秒,然后劈两下
            await key('KeyD', 68, True)
            await asyncio.sleep(1.5)
            await snap('walk_right')
            await key('KeyD', 68, False)
            await key('KeyW', 87, True)
            await asyncio.sleep(1.0)
            await key('KeyW', 87, False)
            await key('KeyJ', 74, True)
            await key('KeyJ', 74, False)
            for k in range(4):
                await asyncio.sleep(0.12)
                await snap_crop(f'attack{k}')
            await snap('attack')
            await asyncio.sleep(2.0)
            hud = await ev("document.getElementById('hud').textContent")
            pos = await ev("JSON.stringify({x: __pre25.hero.x, z: __pre25.hero.z, yaw: __pre25.hero.yaw, state: __pre25.hero.state})")
            print('hud', hud)
            print('pos', pos)
            print('issues', issues[:5])
    finally:
        proc.terminate()
        # 无头 Edge 的子进程 terminate 关不掉:按测试配置目录清理残留(只动 %TEMP%\lootchain-qa 下的测试浏览器)
        subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'qa', 'edge_guard.py')], capture_output=True)


asyncio.run(main())
