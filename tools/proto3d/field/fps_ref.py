# -*- coding: utf-8 -*-
"""参考的那个 FPS(fable52-fps-repro 的在线演示页)截图:单独起一个无头 Edge(9368、自己的配置目录)。
只是打开网页截图,不下载任何东西;和我们的并排对比见 fps_compare.py。

  python tools/proto3d/field/fps_ref.py start             # 放后台,常驻到 stop
  python tools/proto3d/field/fps_ref.py shots <输出目录>   # 开局,截 fps_floor / fps_wide / fps_fire / fps_hall .png
  python tools/proto3d/field/fps_ref.py eval <JS 或 @文件> # 页面里执行(要 return);window.__dbg 是它自带的调试钩子
  python tools/proto3d/field/fps_ref.py shot <输出.png>
  python tools/proto3d/field/fps_ref.py stop
"""
import asyncio
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, r'D:\project\lootchain-cocos\tools\qa')
import edge_guard  # noqa: E402
import websockets  # noqa: E402

PORT = 9368
URL = 'https://wquguru.github.io/fable52-fps-repro/demos/04-fps/'
SCR = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
PROFILE = os.path.join(SCR, 'fps_ref_browser_profile')
STATE = os.path.join(SCR, 'fps_ref_state.json')
STOP = os.path.join(SCR, 'fps_ref_stop.flag')
EDGE = None
for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'):
    if os.path.exists(p):
        EDGE = p
        break
CMD = sys.argv[1] if len(sys.argv) > 1 else 'probe'


async def call(ws, seq, m, p=None, timeout=120):
    seq[0] += 1
    my = seq[0]
    await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
    while True:
        x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
        if x.get('id') == my:
            return x


async def ev(ws, seq, body, timeout=120):
    r = (await call(ws, seq, 'Runtime.evaluate', {'expression': '(async () => { try { ' + body + " } catch (e) { return 'err ' + (e && e.stack || e); } })()",
                                                   'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
    if r.get('exceptionDetails'):
        return 'EXC ' + str(r['exceptionDetails'])[:600]
    return r.get('result', {}).get('value')


async def shot(ws, seq, path):
    r = await call(ws, seq, 'Page.captureScreenshot', {'format': 'png'})
    data = r.get('result', {}).get('data')
    if not data:
        print('shot failed', str(r)[:200])
        return
    open(path, 'wb').write(base64.b64decode(data))
    print('saved', path, flush=True)


async def start():
    os.makedirs(SCR, exist_ok=True)
    for p in (STOP, STATE):
        if os.path.exists(p):
            os.remove(p)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={PROFILE}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--window-size=1920,1080',
                             '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        info = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/json/new?about:blank', method='PUT'), timeout=5))
        json.dump({'ws': info['webSocketDebuggerUrl'], 'pid': proc.pid}, open(STATE, 'w', encoding='utf-8'))
        async with websockets.connect(info['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = [0]
            await call(ws, seq, 'Runtime.enable')
            await call(ws, seq, 'Page.bringToFront')
            await call(ws, seq, 'Emulation.setDeviceMetricsOverride', {'width': 1920, 'height': 1080, 'deviceScaleFactor': 1, 'mobile': False})
            await call(ws, seq, 'Page.navigate', {'url': URL})
            print('navigated; 常驻中', flush=True)
            while not os.path.exists(STOP):
                try:
                    await asyncio.wait_for(ws.recv(), 1.0)
                except asyncio.TimeoutError:
                    pass
                except Exception as e:  # noqa: BLE001
                    print('ws closed', e)
                    break
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        try:
            edge_guard.kill_profiles([PROFILE])
        except Exception:  # noqa: BLE001
            pass
        for p in (STOP, STATE):
            if os.path.exists(p):
                os.remove(p)
        print('stopped')


async def client():
    st = json.load(open(STATE, encoding='utf-8'))
    ws = await websockets.connect(st['ws'], max_size=None, ping_interval=None)
    seq = [0]
    try:
        if CMD == 'eval':
            src = sys.argv[2]
            if src.startswith('@'):
                src = open(src[1:], encoding='utf-8').read()
            out = await ev(ws, seq, src)
            print(out if isinstance(out, str) else json.dumps(out, ensure_ascii=False))
        elif CMD == 'shot':
            await shot(ws, seq, sys.argv[2])
        elif CMD == 'shots':
            out = sys.argv[2]
            os.makedirs(out, exist_ok=True)
            # 用它自带的调试钩子:开局(不锁鼠标)、手动推帧、摆位置和朝向
            steps = [
                ('fps_floor', "d.start(); d.step(1/60, 90); d.set({ yaw: -1.5, pitch: -0.1 }); d.step(1/60, 120);"),
                ('fps_wide', "d.set({ pos: [-3, 0, 6], yaw: -1.2, pitch: -0.06 }); d.step(1/60, 240);"),
                ('fps_fire', "const dr = d.drones(); const p = d.st().pos; if (dr[0]) { const q = dr[0].p;"
                             " d.set({ yaw: Math.atan2(-(q[0] - p[0]), -(q[2] - p[2])), pitch: Math.atan2(q[1] - 1.6, Math.hypot(q[0] - p[0], q[2] - p[2])) }); }"
                             " d.set({ fire: true, hp: 100 }); d.step(1/60, 14); d.set({ fire: false });"),
                ('fps_hall', "d.set({ pos: [4, 0, -4], yaw: 2.4, pitch: -0.1, hp: 100 }); d.step(1/60, 20);"),
            ]
            for _ in range(60):
                if await ev(ws, seq, "return window.__dbg ? 1 : 0;") == 1:
                    break
                await asyncio.sleep(1)
            for name, body in steps:
                print(name, await ev(ws, seq, "const d = window.__dbg; " + body + " return JSON.stringify(d.st());"), flush=True)
                await shot(ws, seq, os.path.join(out, name + '.png'))
    finally:
        await ws.close()


if CMD == 'start':
    asyncio.run(start())
elif CMD == 'stop':
    open(STOP, 'w').write('1')
    print('stop flag')
else:
    asyncio.run(client())
