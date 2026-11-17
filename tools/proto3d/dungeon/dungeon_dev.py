# -*- coding: utf-8 -*-
"""地宫小样(?g3ddungeon=1,代码在 assets/scripts/scenes/lobby/guard3d/G3DDungeon.ts)的常驻预览:
起一个无头 Edge 一直开着,之后反复往里面执行 JS / 截图;改完代码只用 reload。Creator 预览(7456)要开着,不用登录。

  python tools/proto3d/dungeon/dungeon_dev.py start [--qs=&dpost=2] [--size=1920x1080]   # 放后台跑,一直活着直到 stop
  python tools/proto3d/dungeon/dungeon_dev.py reload [--qs=…]                            # 改完代码:刷新资源库、重载页面、等场景建好
  python tools/proto3d/dungeon/dungeon_dev.py eval <JS 或 @文件>                          # 页面里执行(已备好 D = window.__g3dd、sleep);要 return
  python tools/proto3d/dungeon/dungeon_dev.py shot <输出.png|.jpg> [--scale=0.5]
  python tools/proto3d/dungeon/dungeon_dev.py bench [--n=60]                             # 定格后量每帧耗时(毫秒,中位数)、绘制次数、三角形数
  python tools/proto3d/dungeon/dungeon_dev.py video <输出.mp4> --script=<JS 文件> [--secs=20] [--fps=30]   # 逐帧推着录(脚本里定义 window.__dgScript = (t) => {…})
  python tools/proto3d/dungeon/dungeon_dev.py errors
  python tools/proto3d/dungeon/dungeon_dev.py stop

端口 9369、独立配置目录,stop 时按配置目录清残留。QA_GPU=low 用核显。
角色模型不在仓库里:要看带角色的,先把模型临时拷进 assets/resources/g3d_char(见 tools/proto3d/char3d),看完移出。
"""
import asyncio
import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', '..', 'qa')))
import edge_guard  # noqa: E402
import websockets  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
CMD = ARGS[0] if ARGS else 'eval'
PORT = int(os.environ.get('EDGE_PORT', '9369'))
SCR = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
PROFILE = os.path.join(SCR, 'g3dd_browser_profile')
STATE = os.path.join(SCR, 'g3dd_state.json')
STOP = os.path.join(SCR, 'g3dd_stop.flag')
ERRLOG = os.path.join(SCR, 'g3dd_errors.log')
PREVIEW = 'http://localhost:' + os.environ.get('PREVIEW_PORT', '7456') + '/'
EDGE = next((p for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe') if os.path.exists(p)), '')
# 预览页自带一条工具栏,会把画布挤扁:藏掉,让画布铺满视口
LAYOUT = ("(() => { const tb = document.querySelector('.toolbar'); if (tb) tb.style.display = 'none'; const vc = document.getElementById('__vconsole'); if (vc) vc.style.display = 'none';"
          " for (const id of ['content', 'GameDiv']) { const e = document.getElementById(id); if (e) { e.style.position = 'absolute'; e.style.left = '0'; e.style.top = '0';"
          " e.style.width = innerWidth + 'px'; e.style.height = innerHeight + 'px'; e.style.margin = '0'; e.style.padding = '0'; e.style.transform = 'none'; } }"
          " document.body.style.overflow = 'hidden'; window.dispatchEvent(new Event('resize')); return [innerWidth, innerHeight]; })()")
# 工具栏还在,或者画布没铺满视口(重载之后偶尔会按设计分辨率 1920×1080 建画布):要重新铺一遍
NEED_LAYOUT = ("(() => { const tb = document.querySelector('.toolbar'); const cv = document.querySelector('canvas');"
               " return !!(tb && tb.style.display !== 'none') || !!(cv && (Math.abs(cv.clientWidth - innerWidth) > 2 || Math.abs(cv.clientHeight - innerHeight) > 2)); })()")
HJS = "const sleep = ms => new Promise(z => setTimeout(z, ms)); const D = window.__g3dd;"


def log(*a):
    print(*a, flush=True)


class Tab:
    def __init__(self, ws, sink=None):
        self.ws = ws
        self.seq = 0
        self.sink = sink

    def note(self, x):
        if not self.sink:
            return
        m = x.get('method')
        if m == 'Runtime.exceptionThrown':
            d = x['params']['exceptionDetails']
            self.sink('EXC ' + (d.get('exception', {}).get('description') or d.get('text', ''))[:600])
        elif m == 'Runtime.consoleAPICalled':
            p = x['params']
            text = ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))[:600]
            if p.get('type') == 'error' or (p.get('type') == 'warning' and ('[g3d' in text or '[f3d' in text)):
                self.sink(p.get('type').upper() + ' ' + text)

    async def call(self, m, p=None, timeout=300):
        self.seq += 1
        my = self.seq
        await self.ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
        while True:
            x = json.loads(await asyncio.wait_for(self.ws.recv(), timeout))
            self.note(x)
            if x.get('id') == my:
                return x

    async def raw(self, expr, timeout=300):
        r = (await self.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
        if r.get('exceptionDetails'):
            return 'EXC ' + (r['exceptionDetails'].get('exception', {}).get('description', '') or str(r['exceptionDetails']))[:800]
        return r.get('result', {}).get('value')

    async def js(self, body, timeout=300):
        return await self.raw("(async () => { " + HJS + " try { " + body + " } catch (e) { return 'err ' + (e && e.stack || e); } })()", timeout)


def sink(text):
    with open(ERRLOG, 'a', encoding='utf-8') as f:
        f.write(time.strftime('%H:%M:%S ') + text.replace('\n', ' | ') + '\n')


async def enter(tab, qs):
    """打开预览页,等地宫建好(刚改完脚本时编辑器还在重新打包,页面会加载到半截的代码:等几秒重进)。"""
    page = PREVIEW + '?g3ddungeon=1' + qs
    got = ''
    for attempt in range(6):
        await tab.call('Page.navigate', {'url': page})
        got = ''
        for _ in range(90):
            await asyncio.sleep(1)
            got = await tab.raw("(() => { const d = window.__g3dd; if (!d) return 'nodbg'; const i = d.info(); return i.opened ? 'ok' : (i.error ? 'error ' + i.error : 'wait'); })()")
            if got == 'ok' or str(got).startswith('error'):
                break
        if got == 'ok':
            break
        log('没起来,重进一遍:', str(got)[:300])
        await asyncio.sleep(6)
    await tab.raw(LAYOUT)
    await asyncio.sleep(1.5)
    if await tab.raw(NEED_LAYOUT):
        await asyncio.sleep(1.5)
        await tab.raw(LAYOUT)
        await asyncio.sleep(1.5)
    log('ready', got, await tab.js("const i = D.info(); return JSON.stringify({ stats: i.stats, canvas: i.canvas, leader: i.leader, mobs: i.mobs.length, post: i.post && i.post.on });"))


async def connect(with_sink=False):
    try:
        st = json.load(open(STATE, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        raise SystemExit('常驻预览没起来:先 python tools/proto3d/dungeon/dungeon_dev.py start(放后台)')
    ws = await websockets.connect(st['ws'], max_size=None, ping_interval=None)
    tab = Tab(ws, sink if with_sink else None)
    await tab.call('Runtime.enable')
    return ws, tab


async def cmd_start():
    os.makedirs(SCR, exist_ok=True)
    for p in (STOP, STATE, ERRLOG):
        if os.path.exists(p):
            os.remove(p)
    w, h = (int(v) for v in OPT.get('size', '1920x1080').split('x'))
    gpu = os.environ.get('QA_GPU', '1')
    flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] + (['--force_low_power_gpu'] if gpu == 'low' else [])
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={PROFILE}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', f'--window-size={w},{h}',
                             '--autoplay-policy=no-user-gesture-required', '--mute-audio'] + flags + ['about:blank'])
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
            tab = Tab(ws, sink)
            await tab.call('Runtime.enable')
            await tab.call('Page.bringToFront')
            await tab.call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': False})
            await enter(tab, OPT.get('qs', ''))
            log('started; 常驻中(stop 结束)')
            while not os.path.exists(STOP):
                try:
                    tab.note(json.loads(await asyncio.wait_for(ws.recv(), 1.0)))
                except asyncio.TimeoutError:
                    pass
                except Exception as e:  # noqa: BLE001
                    log('ws closed', e)
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
        log('stopped')


async def cmd_client():
    ws, tab = await connect(CMD == 'reload')
    try:
        if CMD == 'reload':
            try:
                urllib.request.urlopen(PREVIEW + 'asset-db/refresh', timeout=180).read()
            except Exception as e:  # noqa: BLE001
                log('refresh', e)
            await enter(tab, OPT.get('qs', ''))
        elif CMD == 'eval':
            src = ARGS[1] if len(ARGS) > 1 else 'return 1;'
            if src.startswith('@'):
                src = open(src[1:], encoding='utf-8').read()
            out = await tab.js(src, float(OPT.get('timeout', '300')))
            log(out if isinstance(out, str) else json.dumps(out, ensure_ascii=False))
        elif CMD == 'shot':
            path = ARGS[1]
            # 预览页的工具栏有时晚于场景出来:还在的话先藏掉(画布会跟着铺满),等两帧再截
            if await tab.raw(NEED_LAYOUT):
                await tab.raw(LAYOUT)
                await asyncio.sleep(1.2)
            r = await tab.call('Page.captureScreenshot', {'format': 'png'})
            data = r.get('result', {}).get('data')
            if not data:
                log('shot failed', str(r)[:200])
                return
            raw = base64.b64decode(data)
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            if OPT.get('scale') or path.lower().endswith('.jpg'):
                from PIL import Image
                im = Image.open(io.BytesIO(raw)).convert('RGB')
                if OPT.get('scale'):
                    k = float(OPT['scale'])
                    im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
                im.save(path, quality=90)
            else:
                open(path, 'wb').write(raw)
            log('saved', path)
        elif CMD == 'video':
            import shutil
            out = ARGS[1]
            fps = int(OPT.get('fps', '30'))
            secs = float(OPT.get('secs', '20'))
            frames = os.path.join(SCR, 'g3dd_frames')
            shutil.rmtree(frames, ignore_errors=True)
            os.makedirs(frames)
            if await tab.raw("(() => { const tb = document.querySelector('.toolbar'); return !!(tb && tb.style.display !== 'none'); })()"):
                await tab.raw(LAYOUT)
                await asyncio.sleep(1.2)
            if OPT.get('script'):
                log('script', await tab.js(open(OPT['script'], encoding='utf-8').read() + '\n return 1;'))
            # 引擎暂停后每调一次「走一帧」固定前进 1/60 秒:录 30 帧就每张推两帧
            sub = max(1, round(60 / fps))
            await tab.js("D.freeze(false); D.pause(true); return 1;")
            try:
                for i in range(int(secs * fps)):
                    await tab.js(f"if (window.__dgScript) window.__dgScript({i / fps:.4f}); D.step(1 / 60, {sub}); return 1;")
                    r = await tab.call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 92})
                    open(os.path.join(frames, f'f_{i:05d}.jpg'), 'wb').write(base64.b64decode(r['result']['data']))
                    if i % 90 == 0:
                        log('frame', i)
            finally:
                await tab.js("D.pause(false); return 1;")
            ff = shutil.which('ffmpeg')
            if not ff:
                log('没找到 ffmpeg,帧留在', frames)
                return
            os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
            r = subprocess.run([ff, '-y', '-framerate', str(fps), '-i', os.path.join(frames, 'f_%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
                                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out], capture_output=True, text=True, encoding='utf-8', errors='replace')
            log('video', out if r.returncode == 0 else r.stderr[-400:])
            shutil.rmtree(frames, ignore_errors=True)
        elif CMD == 'bench':
            n = int(OPT.get('n', '60'))
            turn = '1' if OPT.get('orbit') else '0'      # --orbit=1:每帧把镜头转一点(倒影只在镜头动过的帧重画,不转量不到它)
            out = await tab.js(
                "D.freeze(true); await sleep(300); const cc = window.cc || null; const gl = document.querySelector('canvas').getContext('webgl') || document.querySelector('canvas').getContext('webgl2');"
                " const px = new Uint8Array(4); const game = D.dungeon.cam.node.scene ? null : null; const ts = [];"
                f" for (let i = 0; i < {n}; i++) {{ if ({turn}) D.dungeon.view.yaw += 0.4; const t0 = performance.now(); D.step(0, 1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }}"
                " ts.sort((a, b) => a - b); const i = D.info(); D.freeze(false);"
                " return JSON.stringify({ ms: +ts[Math.floor(ts.length / 2)].toFixed(2), p90: +ts[Math.floor(ts.length * 0.9)].toFixed(2), draws: i.draws, tris: i.tris, canvas: i.canvas, post: i.cfg.post, reflect: i.cfg.reflect });", 600)
            log(out)
    finally:
        await ws.close()


if CMD == 'start':
    asyncio.run(cmd_start())
elif CMD == 'stop':
    open(STOP, 'w').write('1')
    log('stop sent')
elif CMD == 'errors':
    log(open(ERRLOG, encoding='utf-8').read()[-6000:] if os.path.exists(ERRLOG) else '(没有报错)')
else:
    asyncio.run(cmd_client())
