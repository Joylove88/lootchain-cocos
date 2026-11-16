# -*- coding: utf-8 -*-
"""野外 3D 的开发用常驻预览:起一个无头 Edge 一直开着(登录、进图只做一次),之后反复往里面执行 JS / 截图,
改完代码只用重载页面,不用每次重走一遍启动。field_shots.py 是出交付物用的(每次全新启动),这个是边改边看用的。

  python tools/proto3d/field/field_dev.py start  [--qs=?field3d=2] [--map=WOODS] [--view=pc]   # 放后台跑;一直活着,直到 stop
  python tools/proto3d/field/field_dev.py reload [--qs=…] [--map=…]     # 改完代码:重载页面、重新登录进图
  python tools/proto3d/field/field_dev.py eval   <JS 或 @文件>          # 在页面里执行(已备好 sleep / cc / root / t / F / W);要 return 一个值
  python tools/proto3d/field/field_dev.py shot   <输出.png> [--box=x0,y0,x1,y1] [--scale=0.5] [--nostep=1]
  python tools/proto3d/field/field_dev.py errors                         # 这次 start 以来的控制台报错 / 异常
  python tools/proto3d/field/field_dev.py stop

端口 9366、独立配置目录;stop 时按配置目录清残留。环境变量 QA_GPU=low 用核显。
"""
import asyncio
import base64
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
QA = os.path.normpath(os.path.join(HERE, '..', '..', 'qa'))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
CMD = ARGS[0] if ARGS else 'eval'
ACCOUNT = OPT.get('account', 'guidetest02')
VIEW = OPT.get('view', 'pc')

os.environ.setdefault('EDGE_PORT', '9366')
os.environ['QA_ACCOUNT'] = ACCOUNT
sys.path.insert(0, QA)
_argv = sys.argv
sys.argv = [sys.argv[0], os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'f3d_dev'), VIEW, '--only=field']
import battle_polish_shots as bps  # noqa: E402
sys.argv = _argv
base = bps.base
import websockets  # noqa: E402

STATE = os.path.join(base.SCRATCH, 'f3d_dev_state.json')
ERRLOG = os.path.join(base.SCRATCH, 'f3d_dev_errors.log')
STOP = os.path.join(base.SCRATCH, 'f3d_dev_stop.flag')
PROFILE = os.path.join(base.SCRATCH, 'f3d_dev_browser_profile')
_m = re.search(r"\{\{string:'\{ACCOUNT\}'\}\}, \{\{string:'([^']+)'\}\}", open(os.path.join(QA, 'battle_polish_shots.py'), encoding='utf-8').read())
PASSWORD = _m.group(1) if _m else ''
HJS = ("const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc; " + bps.ROOT_JS
       + " const F = window.__f3d; const W = window.__f3dw;")


def log(*a):
    print(*a, flush=True)


def load_state():
    try:
        return json.load(open(STATE, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return {}


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
            if p.get('type') == 'error' or (p.get('type') == 'warning' and ('[f3d' in text or '[g3d' in text)):
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


async def metrics(tab):
    w, h, dpr, mobile = bps.VIEWS[VIEW]
    await tab.call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr, 'mobile': mobile, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})


async def enter(tab, qs, world, set_metrics=True):
    """导航 → 登录 → 进图(和 field_shots.py 同一套流程)。视口大小只由常驻的那条连接设(连接一断,它设的视口就没了)。"""
    if set_metrics:
        await metrics(tab)
    page = 'http://localhost:' + os.environ.get('PREVIEW_PORT', '7456') + '/' + qs
    await tab.call('Page.navigate', {'url': page})
    log('page', page, '| cc', await tab.raw(bps.JS_CC, 400))
    view = ''
    for _ in range(240):
        view = await tab.js("return root ? root.currentView : 'noroot';")
        if view in ('login', 'lobby', 'loginAccount'):
            break
        await asyncio.sleep(1)
    if view != 'lobby':
        await tab.js(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'{PASSWORD}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
    for _ in range(400):
        if await tab.js("return (root.currentView === 'lobby' && t && t.isMounted()) ? 'ok' : 'wait';") == 'ok' and await tab.js(bps.BUSY) == 'ok':
            break
        await asyncio.sleep(2)
    idle = 0
    for _ in range(60):
        got = await tab.js(bps.CLEAR)
        idle = idle + 1 if got == 'none' else 0
        if idle >= 3:
            break
        await asyncio.sleep(1.5)
    if world:
        await tab.js(f"if (t.def.code !== '{world}') setTimeout(() => root.travelWorldMap('{world}', null), 50); return 1;")
        for _ in range(150):
            if await tab.js(f"return (t.def && t.def.code === '{world}' && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok' and await tab.js(bps.BUSY) == 'ok':
                break
            await asyncio.sleep(2)
        await asyncio.sleep(3)
    log('ready', await tab.js("const cv = cc.game.canvas; return JSON.stringify({ view: root.currentView, map: t && t.def && t.def.code, canvas: [cv.width, cv.height], leader: t && t.leader ? [Math.round(t.leader.x), Math.round(t.leader.y)] : null });"))


async def connect(sink=None):
    st = load_state()
    if not st.get('ws'):
        raise SystemExit('常驻预览没起来:先 python tools/proto3d/field/field_dev.py start(放后台)')
    ws = await websockets.connect(st['ws'], max_size=None, ping_interval=None)
    tab = Tab(ws, sink)
    await tab.call('Runtime.enable')
    return ws, tab


async def cmd_start():
    for p in (STOP, STATE, ERRLOG):
        if os.path.exists(p):
            os.remove(p)
    gpu = os.environ.get('QA_GPU', '1')
    if gpu == '0':
        flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    elif gpu == 'low':
        flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_low_power_gpu']
    else:
        flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={PROFILE}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--window-size=1920,1080',
                             '--autoplay-policy=no-user-gesture-required'] + flags + ['about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        info = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        json.dump({'ws': info['webSocketDebuggerUrl'], 'pid': proc.pid, 'port': base.PORT}, open(STATE, 'w', encoding='utf-8'))

        def sink(text):
            with open(ERRLOG, 'a', encoding='utf-8') as f:
                f.write(time.strftime('%H:%M:%S ') + text.replace('\n', ' | ') + '\n')

        async with websockets.connect(info['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            tab = Tab(ws, sink)
            await tab.call('Runtime.enable')
            await tab.call('Page.bringToFront')
            await enter(tab, OPT.get('qs', '?field3d=2'), OPT.get('map', 'WOODS'))
            log('started; 常驻中(stop 结束)')
            # 常驻:只收控制台消息,直到看到停止标记
            while not os.path.exists(STOP):
                try:
                    x = json.loads(await asyncio.wait_for(ws.recv(), 1.0))
                    tab.note(x)
                except asyncio.TimeoutError:
                    pass
                except Exception as e:  # noqa: BLE001
                    log('ws closed', e)
                    break
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        try:
            import edge_guard
            edge_guard.kill_profiles([PROFILE])
        except Exception:  # noqa: BLE001
            pass
        for p in (STOP, STATE):
            if os.path.exists(p):
                os.remove(p)
        log('stopped')


async def cmd_reload():
    def sink(text):
        with open(ERRLOG, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%H:%M:%S ') + text.replace('\n', ' | ') + '\n')
    ws, tab = await connect(sink)
    try:
        await enter(tab, OPT.get('qs', '?field3d=2'), OPT.get('map', 'WOODS'), set_metrics=False)
    finally:
        await ws.close()


async def cmd_eval():
    src = ARGS[1] if len(ARGS) > 1 else 'return 1;'
    if src.startswith('@'):
        src = open(src[1:], encoding='utf-8').read()
    ws, tab = await connect()
    try:
        out = await tab.js(src, float(OPT.get('timeout', '300')))
        log(out if isinstance(out, str) else json.dumps(out, ensure_ascii=False))
    finally:
        await ws.close()


async def cmd_shot():
    path = ARGS[1]
    ws, tab = await connect()
    try:
        step = "" if OPT.get('nostep') else "cc.game.step(); "
        data = await tab.raw("(() => { const cc = window.__cc; try { " + step + "return cc.game.canvas.toDataURL('image/png'); } catch (e) { return 'err ' + e.message; } })()", 300)
    finally:
        await ws.close()
    if not (isinstance(data, str) and data.startswith('data:image/png;base64,')):
        log('shot failed', str(data)[:200])
        return
    raw = base64.b64decode(data.split(',', 1)[1])
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if OPT.get('box') or OPT.get('scale') or path.lower().endswith('.jpg'):
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        if OPT.get('box'):
            im = im.crop(tuple(int(v) for v in OPT['box'].split(',')))
        if OPT.get('scale'):
            k = float(OPT['scale'])
            im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
        im.save(path, quality=90)
        log('shot', path, im.size)
    else:
        open(path, 'wb').write(raw)
        log('shot', path, len(raw) // 1024, 'KB')


def main():
    if CMD == 'start':
        asyncio.run(cmd_start())
    elif CMD == 'reload':
        asyncio.run(cmd_reload())
    elif CMD == 'eval':
        asyncio.run(cmd_eval())
    elif CMD == 'shot':
        asyncio.run(cmd_shot())
    elif CMD == 'errors':
        log(open(ERRLOG, encoding='utf-8').read() if os.path.exists(ERRLOG) else '(没有报错)')
    elif CMD == 'stop':
        open(STOP, 'w').write('1')
        for _ in range(40):
            if not os.path.exists(STATE):
                break
            time.sleep(0.5)
        st = load_state()
        if st.get('pid'):
            subprocess.run(['taskkill', '/PID', str(st['pid']), '/T', '/F'], capture_output=True)
        log('stop sent')
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
