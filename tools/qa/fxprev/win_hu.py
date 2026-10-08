# -*- coding: utf-8 -*-
"""候选大招时间窗口细看:python win_hu.py 073:4.2:5.5 051:1.5:4.0 ...  → D:/骨骼动画素材/hero_ult_选型/win/<套>_<t0>_<t1>.png(10 帧,固定机位 1800 宽),并打印窗口亮区包围盒"""
import asyncio, base64, io, json, os, subprocess, sys, time, urllib.request
import websockets
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = r'D:/骨骼动画素材/hero_ult_out_4243/hero_ult_out_4243'
OUT = r'D:/骨骼动画素材/hero_ult_选型/win'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP, HTTP = 9364, 8778
FONT = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 18)
HIDE = os.environ.get('HIDE_JS', '')


async def main():
    os.makedirs(OUT, exist_ok=True)
    env = dict(os.environ, FX_ROOT=os.path.normpath(os.path.join(ROOT, 'fx42')))
    server = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP)], env=env)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP}', f'--user-data-dir={os.path.join(HERE, "edge_profile_win")}', '--no-first-run',
                             '--window-size=600,600', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP}/json/version', timeout=1); break
            except Exception:
                time.sleep(0.2)
        target = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{CDP}/json/new?http://127.0.0.1:{HTTP}/index.html', method='PUT'), timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            async def ev(expr, timeout=240):
                nonlocal seq
                seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if msg.get('id') == my:
                        res = msg.get('result', {})
                        if 'exceptionDetails' in res: raise RuntimeError(str(res['exceptionDetails'])[:400])
                        return res.get('result', {}).get('value')
            for _ in range(100):
                if await ev('!!window.__ready', 10): break
                await asyncio.sleep(0.2)
            hidden = json.load(open(os.path.join(HERE, 'hide_hu.json')))
            await ev('window.__hidden = ' + json.dumps(hidden) + '; window.__bg = 0.22; window.__cur = ""; window.__hide = (name, slot) => { const list = window.__hidden["hu_" + window.__cur] || []; if (list.some(p => p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : p === name)) return true; const a = slot.attachment; if (!a) return false; const n = a.name || ""; const cut = n.indexOf("/"); return cut < 0 || /^(bz\d*|buzhen|zhu)$/i.test(n.slice(0, cut)); }; 1')
            for spec in sys.argv[1:]:
                name, t0, t1 = spec.split(':')
                await ev(f'window.__cur = {json.dumps(name)}; 1')
                res = await ev(f'window.renderSet({json.dumps(name)}, [], {{frames: 10, samples: 24, pma: false, window: [{t0}, {t1}], fixed: {{cx: 0, cy: 150, w: 1800}}}})')
                for anim, entry in res['anims'].items():
                    frames = [Image.open(io.BytesIO(base64.b64decode(d.split(',', 1)[1]))).convert('RGB').crop((0, 128, 512, 384)) for d in entry['frames']]
                    sheet = Image.new('RGB', (512 * 5 + 16, 26 + 2 * 262), (40, 40, 40))
                    for i, f in enumerate(frames):
                        sheet.paste(f, ((i % 5) * 516, 26 + (i // 5) * 262))
                    b = entry['bounds']
                    ImageDraw.Draw(sheet).text((4, 2), f'{name} {t0}-{t1}s 亮区 {b}', fill=(255, 240, 200), font=FONT)
                    sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
                    sheet.save(os.path.join(OUT, f'{name}_{t0}_{t1}.png'))
                    print(name, t0, t1, json.dumps(b))
    finally:
        proc.terminate(); server.terminate()
asyncio.run(main())
