# -*- coding: utf-8 -*-
"""骨骼特效换皮前后对比(2026-10-31):原版 / 新版各出 6 帧横条,上下叠成一张图(同一镜头,按原版亮区取景)。
用法:python fx_compare.py <effect> <原版目录(含 effect.skel)> <新版目录> <输出 jpg> [--anim 名] [--pma]
"""
import asyncio, base64, io, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
import websockets
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP_PORT, HTTP_PORT = 9355, 8769
PROFILE = os.path.join(HERE, 'edge_profile_fxcmp')
FONT = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 20)
args = sys.argv[1:]
EFFECT, ORIG, NEW, OUT = args[0], args[1], args[2], args[3]
ANIM = args[args.index('--anim') + 1] if '--anim' in args else None
PMA = '--pma' in args


async def main():
    root = tempfile.mkdtemp(prefix='fxcmp_')
    shutil.copytree(ORIG, os.path.join(root, 'orig_' + EFFECT))
    shutil.copytree(NEW, os.path.join(root, 'new_' + EFFECT))
    for tag in ('orig_', 'new_'):
        d = os.path.join(root, tag + EFFECT)
        for f in os.listdir(d):
            stem, ext = os.path.splitext(f)
            if stem == EFFECT and ext in ('.skel', '.json', '.atlas'):
                os.rename(os.path.join(d, f), os.path.join(d, tag + EFFECT + ext))
    server = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP_PORT)], env=dict(os.environ, FX_ROOT=root))
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={PROFILE}', '--no-first-run',
                             '--window-size=600,600', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    rows = []
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        target = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{CDP_PORT}/json/new?http://127.0.0.1:{HTTP_PORT}/index.html', method='PUT'), timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def ev(expr, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if msg.get('id') == my:
                        res = msg.get('result', {})
                        if 'exceptionDetails' in res:
                            raise RuntimeError(str(res['exceptionDetails'])[:500])
                        return res.get('result', {}).get('value')

            for _ in range(100):
                if await ev('!!window.__ready', 10):
                    break
                await asyncio.sleep(0.2)
            json_sets = [tag + EFFECT for tag in ('orig_', 'new_') if os.path.exists(os.path.join(root, tag + EFFECT, tag + EFFECT + '.json'))]
            await ev(f'window.__jsonSets = {json.dumps(json_sets)}; 1')
            anims = json.dumps([ANIM] if ANIM else [])
            pma = 'true' if PMA else 'false'
            first = await ev(f'window.renderSet({json.dumps("orig_" + EFFECT)}, {anims}, {{frames: 6, samples: 12, pma: {pma}}})')
            anim = next(iter(first['anims']))
            b = first['anims'][anim]['bounds'] or first['anims'][anim]['vertexBounds']
            fixed = {'cx': b['cx'], 'cy': b['cy'], 'w': max(b['w'], b['h']) * 1.1}
            for tag, label in (('orig_', '原版'), ('new_', '超清换皮')):
                res = await ev(f'window.renderSet({json.dumps(tag + EFFECT)}, {json.dumps([anim])}, {{frames: 6, samples: 12, pma: {pma}, fixed: {json.dumps(fixed)}}})')
                frames = [Image.open(io.BytesIO(base64.b64decode(x.split(',', 1)[1]))).convert('RGB') for x in res['anims'][anim]['frames']]
                rows.append((label, frames))
    finally:
        proc.terminate()
        server.terminate()
        shutil.rmtree(root, ignore_errors=True)
    t = 300
    sheet = Image.new('RGB', (6 * t, len(rows) * (t + 30)), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for r, (label, frames) in enumerate(rows):
        d.text((6, r * (t + 30) + 4), f'{EFFECT} {anim} · {label}', fill=(230, 220, 190), font=FONT)
        for i, f in enumerate(frames):
            sheet.paste(f.resize((t, t), Image.LANCZOS), (i * t, r * (t + 30) + 30))
    sheet.save(OUT, quality=90)
    print('wrote', OUT)


asyncio.run(main())
