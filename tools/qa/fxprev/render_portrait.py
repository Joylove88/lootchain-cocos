# -*- coding: utf-8 -*-
"""英雄透明底立绘(2026-11-07):用 portrait.html 把骨骼待机帧画成透明底 PNG(按 alpha 亮区收边)。
用法:python render_portrait.py <骨骼父目录> <输出目录> <资源名...> [--anim idle] [--t 0] [--measure](--measure 只打印骨骼头部高度 / 待机实际可见高度,体型校准用)
  例:python render_portrait.py D:/project/lootchain-cocos/assets/resources/spine/hero out sz_lvbu sz_zhaoyun
一次起一个无头 Edge 画完全部(机器负载口径:同时只跑一个)。
"""
import asyncio, base64, io, json, os, subprocess, sys, time, urllib.request
import websockets
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import edge_guard
edge_guard.install()
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP_PORT, HTTP_PORT = 9356, 8769
PROFILE = os.path.join(HERE, 'edge_profile_char')
args = sys.argv[1:]
opts = {}
MEASURE = '--measure' in args
if MEASURE:
    args.remove('--measure')
for k in ('--anim', '--t'):
    if k in args:
        i = args.index(k)
        opts[k[2:]] = args[i + 1]
        del args[i:i + 2]
ROOT, OUT, NAMES = os.path.abspath(args[0]), os.path.abspath(args[1]), args[2:]


async def main():
    os.makedirs(OUT, exist_ok=True)
    env = dict(os.environ, FX_ROOT=ROOT)
    server = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP_PORT)], env=env)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={PROFILE}', '--no-first-run',
                             '--window-size=1400,1600', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        target = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{CDP_PORT}/json/new?http://127.0.0.1:{HTTP_PORT}/portrait.html', method='PUT'), timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = [0]

            async def ev(expr, timeout=300):
                seq[0] += 1
                mid = seq[0]
                await ws.send(json.dumps({'id': mid, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if msg.get('id') == mid:
                        res = msg.get('result', {})
                        if 'exceptionDetails' in res:
                            raise RuntimeError(str(res['exceptionDetails'])[:600])
                        return res.get('result', {}).get('value')

            for _ in range(100):
                if await ev('!!window.__ready', 10):
                    break
                await asyncio.sleep(0.2)
            for name in NAMES:
                binary = 'false' if os.path.exists(os.path.join(ROOT, name, name + '.json')) else 'true'
                o = json.dumps({'anim': opts.get('anim', 'idle'), 't': float(opts.get('t', 0)), 'binary': binary == 'true'})
                if MEASURE:
                    o2 = json.dumps({'anim': opts.get('anim', 'idle'), 't': float(opts.get('t', 0)), 'binary': binary == 'true', 'measure': True})
                    print(name, await ev(f'window.renderPortrait({json.dumps(name)}, {json.dumps(name)}, {o2})'), flush=True)
                    continue
                url = await ev(f'window.renderPortrait({json.dumps(name)}, {json.dumps(name)}, {o})')
                im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGBA')
                bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
                if bbox:
                    im = im.crop(bbox)
                im.save(os.path.join(OUT, name + '.png'))
                print(f'{name}: {im.size}', flush=True)
    finally:
        proc.terminate()
        server.terminate()


asyncio.run(main())
