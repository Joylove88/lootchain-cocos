# -*- coding: utf-8 -*-
"""新批次英雄大招(hero_ult_out_4243,100 套,单动画 skill2,4~18s):每套 12 帧两行横条 + 亮区包围盒 + 逐帧亮度。
用法:python run_hu.py [--only 001,002] [--frames 12]
产物:D:\骨骼动画素材\hero_ult_选型\sheets\<套名>.png、render.jsonl"""
import asyncio, base64, io, json, os, subprocess, sys, time, urllib.request
import websockets
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = r'D:\骨骼动画素材\hero_ult_out_4243\hero_ult_out_4243'
OUT = r'D:\骨骼动画素材\hero_ult_选型'
SHEETS = os.path.join(OUT, 'sheets')
JSONL = os.path.join(OUT, 'render.jsonl')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP_PORT, HTTP_PORT = 9353, 8767
PROFILE = os.path.join(HERE, 'edge_profile_hu')
THUMB = 250
CROP = 0.5  # 固定机位 1800 宽,只留中间 50% 高(≈1800x900)
args = sys.argv[1:]
ONLY = set(args[args.index('--only') + 1].split(',')) if '--only' in args else set()
FRAMES = int(args[args.index('--frames') + 1]) if '--frames' in args else 18
FONT = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 16)
ROLE = {}
for line in io.open(os.path.join(ROOT, '说明.md'), encoding='utf-8-sig'):
    p = [c.strip() for c in line.split('|')]
    if len(p) > 3 and p[1].isdigit():
        ROLE[p[1]] = p[2]


def compose(name, anim, entry):
    frames = [Image.open(io.BytesIO(base64.b64decode(d.split(',', 1)[1]))).convert('RGB').crop((0, 128, 512, 384)).resize((THUMB, THUMB // 2), Image.LANCZOS) for d in entry['frames']]
    per = 6
    rows = (len(frames) + per - 1) // per
    sheet = Image.new('RGB', (THUMB * per + 6 * (per - 1), 26 + rows * (THUMB // 2 + 6)), (0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % per) * (THUMB + 6), 26 + (i // per) * (THUMB // 2 + 6)))
    b = entry.get('bounds') or {}
    ImageDraw.Draw(sheet).text((4, 4), f'{name} {ROLE.get(name, "")}  {anim}  {entry["duration"]}s  亮区 {b.get("w")}x{b.get("h")} c({b.get("cx")},{b.get("cy")})', fill=(230, 220, 190), font=FONT)
    path = os.path.join(SHEETS, f'{name}.png')
    sheet.save(path)
    return path


async def main():
    os.makedirs(SHEETS, exist_ok=True)
    names = sorted(os.listdir(os.path.join(ROOT, 'fx42')))
    if ONLY:
        names = [n for n in names if n in ONLY]
    env = dict(os.environ, FX_ROOT=os.path.join(ROOT, 'fx42'))
    server = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP_PORT)], env=env)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={PROFILE}', '--no-first-run',
                             '--window-size=600,600', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'])
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

            async def ev(expr, timeout=240):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if msg.get('id') == my:
                        res = msg.get('result', {})
                        if 'exceptionDetails' in res:
                            raise RuntimeError(str(res['exceptionDetails'])[:400])
                        return res.get('result', {}).get('value')

            for _ in range(100):
                if await ev('!!window.__ready', 10):
                    break
                await asyncio.sleep(0.2)
            t0 = time.time()
            for idx, name in enumerate(names):
                rec = {'name': name, 'role': ROLE.get(name), 'anims': {}, 'error': None}
                try:
                    res = await ev(f'window.renderSet({json.dumps(name)}, [], {{frames: {FRAMES}, samples: 24, pma: false, fixed: {{cx: 0, cy: 150, w: 1800}}}})')
                    for anim, entry in (res.get('anims') or {}).items():
                        compose(name, anim, entry)
                        rec['anims'][anim] = {k: entry[k] for k in ('duration', 'bounds', 'vertexBounds', 'brightness')}
                except Exception as e:
                    rec['error'] = str(e)[:300]
                with io.open(JSONL, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                if idx % 10 == 0 or rec['error']:
                    print(f'[{idx + 1}/{len(names)}] {name} {rec["error"] or "ok"} ({time.time() - t0:.0f}s)', flush=True)
    finally:
        proc.terminate()
        server.terminate()


asyncio.run(main())
