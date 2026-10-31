# -*- coding: utf-8 -*-
"""角色骨骼预览(2026-10-31,评估 Meowa 生成的 Spine 角色):每个动作出一张 GIF + 一张总览图(每个动作一行关键帧)。
骨骼目录里要有 <base>.json / <base>.atlas / 贴图;同一镜头取景,看动作 / 比例 / 清晰度。
用法:python render_char.py <骨骼目录> <base> <输出目录> [--fps 20] [--pma]
"""
import asyncio, base64, io, json, os, subprocess, sys, time, urllib.request
import websockets
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP_PORT, HTTP_PORT = 9354, 8768
PROFILE = os.path.join(HERE, 'edge_profile_char')
FONT = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 18)
args = sys.argv[1:]
SRC, BASE, OUT = os.path.abspath(args[0]), args[1], os.path.abspath(args[2])
FPS = int(args[args.index('--fps') + 1]) if '--fps' in args else 20
PMA = '--pma' in args


def img(d):
    return Image.open(io.BytesIO(base64.b64decode(d.split(',', 1)[1]))).convert('RGB')


async def main():
    os.makedirs(OUT, exist_ok=True)
    env = dict(os.environ, FX_ROOT=os.path.dirname(SRC))
    server = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP_PORT)], env=env)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={PROFILE}', '--no-first-run',
                             '--window-size=600,700', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        target = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{CDP_PORT}/json/new?http://127.0.0.1:{HTTP_PORT}/char.html', method='PUT'), timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            async def ev(expr, timeout=600):
                await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if msg.get('id') == 1:
                        res = msg.get('result', {})
                        if 'exceptionDetails' in res:
                            raise RuntimeError(str(res['exceptionDetails'])[:600])
                        return res.get('result', {}).get('value')

            for _ in range(100):
                if await ev('!!window.__ready', 10):
                    break
                await asyncio.sleep(0.2)
            res = await ev(f'window.renderChar({json.dumps(os.path.basename(SRC))}, {json.dumps(BASE)}, {{fps: {FPS}, pma: {"true" if PMA else "false"}}})')
    finally:
        proc.terminate()
        server.terminate()

    rows = []
    for anim, entry in res['anims'].items():
        frames = [img(d) for d in entry['frames']]
        frames[0].save(os.path.join(OUT, f'{anim}.gif'), save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0)
        pick = [frames[int(i * (len(frames) - 1) / 5)] for i in range(6)]
        rows.append((anim, entry['duration'], len(frames), pick))
        print(f'{anim}: {entry["duration"]}s {len(frames)} frames', flush=True)
    tw, th = 160, 187
    sheet = Image.new('RGB', (200 + 6 * tw, len(rows) * th), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    for r, (anim, dur, n, pick) in enumerate(rows):
        d.text((8, r * th + th // 2 - 20), f'{anim}\n{dur}s', fill=(230, 220, 190), font=FONT)
        for i, f in enumerate(pick):
            sheet.paste(f.resize((tw, th), Image.LANCZOS), (200 + i * tw, r * th))
    sheet.save(os.path.join(OUT, '_overview.jpg'), quality=88)
    print('wrote', OUT)


asyncio.run(main())
