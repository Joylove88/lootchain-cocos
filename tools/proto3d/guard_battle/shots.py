# -*- coding: utf-8 -*-
"""守卫战 3D 光影小样:无头 Edge 截图 / 跑分 / 逐帧录屏(原型自验用)。

- 自己起一个只读静态服务(serve.py,端口 8791),不依赖别的服务;
- 独立调试端口 9361 + 独立配置目录 %TEMP%\\lootchain-qa\\proto3d_browser_profile(退出时按配置目录清残留,不碰别人的浏览器);
- 默认用显卡渲染;QA_GPU=0 改软件渲染(SwiftShader),QA_GPU=low 试着用核显(--use-angle=d3d11 + 低功耗偏好,不保证生效,以打印出的渲染器为准)。

用法(PYTHONIOENCODING=utf-8):
  python tools/proto3d/guard_battle/shots.py look  <输出目录> [--q=high] [--size=1920x1080] [--dpr=1] [--t=2.0] [--extra=地址参数]
  python tools/proto3d/guard_battle/shots.py shots <输出目录>     # 交付用的一组图:全景 / 三个技能 / 手机视口 / 三种角色受光
  python tools/proto3d/guard_battle/shots.py bench <输出目录>     # 三档 × 两种分辨率的帧耗时 / 批次 / 贴图数 → bench.json
  python tools/proto3d/guard_battle/shots.py video <输出目录> [--size=1600x900] [--secs=10] [--fps=30]   # 逐帧步进截图,ffmpeg 合成 mp4
  python tools/proto3d/guard_battle/shots.py profile <输出目录> [--size=1920x1080]   # 从低档一项项加回去,看每项值多少毫秒
"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request

import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', '..', 'qa')))
try:
    import edge_guard  # 无头 Edge 收尾兜底:退出时按配置目录杀残留
    edge_guard.install()
except Exception:  # noqa: BLE001
    edge_guard = None
sys.path.insert(0, HERE)
import serve  # noqa: E402

EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = int(os.environ.get('EDGE_PORT', '9361'))
HTTP_PORT = int(os.environ.get('PROTO_PORT', '8791'))
SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp', 'lootchain-qa')
PROFILE = os.path.join(SCRATCH, 'proto3d_browser_profile')
PAGE = f'http://127.0.0.1:{HTTP_PORT}/tools/proto3d/guard_battle/index.html'
UA_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
MODE = ARGS[0] if ARGS else 'look'
OUT = ARGS[1] if len(ARGS) > 1 else os.path.join(SCRATCH, 'proto3d')


def opt(name, default=''):
    return next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{name}=')), default)


def size_of(text, fallback=(1920, 1080)):
    try:
        w, h = text.lower().split('x')
        return int(w), int(h)
    except Exception:  # noqa: BLE001
        return fallback


class Page:
    def __init__(self, ws):
        self.ws = ws
        self.seq = 0
        self.logs = []

    async def call(self, method, params=None, timeout=300):
        self.seq += 1
        my = self.seq
        await self.ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
        while True:
            x = json.loads(await asyncio.wait_for(self.ws.recv(), timeout))
            if x.get('method') == 'Runtime.exceptionThrown':
                d = x['params']['exceptionDetails']
                self.logs.append('EXC ' + (d.get('exception', {}).get('description') or d.get('text', ''))[:400])
            if x.get('method') == 'Runtime.consoleAPICalled' and x['params'].get('type') in ('error', 'warning'):
                self.logs.append(x['params']['type'] + ' ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in x['params'].get('args', []))[:400])
            if x.get('id') == my:
                return x

    async def js(self, expr, timeout=300):
        r = (await self.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
        if r.get('exceptionDetails'):
            return 'EXC ' + (r['exceptionDetails'].get('exception', {}).get('description', '') or str(r['exceptionDetails']))[:600]
        return r.get('result', {}).get('value')

    async def open(self, w, h, dpr=1, mobile=False, query=''):
        await self.call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr, 'mobile': mobile,
                                                               'screenOrientation': {'type': 'landscapePrimary', 'angle': 90} if mobile else {'type': 'landscapePrimary', 'angle': 0}})
        if mobile:
            await self.call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await self.call('Network.setUserAgentOverride', {'userAgent': UA_PHONE, 'platform': 'Android'})
        # 换页面前先把上一页的显卡资源放掉:不然旧页面的贴图 / 缓冲还占着显存(回收是懒的),弱显卡上后面几轮会被拖慢、数字虚高
        await self.js("(() => { try { const r = window.__dbg && window.__dbg.renderer; if (r) { r.forceContextLoss(); r.dispose(); } } catch (e) {} return 1; })()")
        await self.call('Page.navigate', {'url': 'about:blank'})
        await self.call('HeapProfiler.collectGarbage')
        await asyncio.sleep(0.8)
        await self.call('Page.navigate', {'url': PAGE + ('?' + query if query else '')})
        for _ in range(240):
            if await self.js('!!(window.__dbg && window.__dbg.ready)') is True:
                return True
            await asyncio.sleep(0.25)
        print('  page not ready:', await self.js("document.getElementById('msg') && document.getElementById('msg').textContent"), *self.logs[-6:], sep='\n  ', flush=True)
        return False

    async def shot(self, path, png=False):
        data = await self.js(f"window.__dbg.shot('{'image/png' if png else 'image/jpeg'}', 0.95)", 120)
        if isinstance(data, str) and data.startswith('data:image/'):
            with open(path, 'wb') as f:
                f.write(base64.b64decode(data.split(',', 1)[1]))
            print('  shot', os.path.basename(path), flush=True)
            return True
        print('  shot failed', str(data)[:200], flush=True)
        return False


# 定格到某个技能的某个时刻(逐帧步进,结果可复现)
def cast_js(name, wait, lead=1.0):
    return (f"(() => {{ const d = window.__dbg; d.pause(); d.setAuto(false); d.reset(); d.step(1/60, {int(lead * 60)}); "
            f"const ok = d.cast('{name}'); d.step(1/120, {int(wait * 120)}); return ok + ' t=' + d.sim.t.toFixed(3); }})()")


async def mode_look(p):
    w, h = size_of(opt('size', '1920x1080'))
    dpr = float(opt('dpr', '1'))
    q = opt('q', 'high')
    t = float(opt('t', '0.5'))
    extra = opt('extra', '')
    tag = opt('tag', f'look_{q}_{w}x{h}')
    if not await p.open(w, h, dpr, False, f'q={q}&ui=0&pause=1&drift=0&auto=0&px=4000' + ('&' + extra if extra else '')):
        return
    seq = opt('seq', '')   # 例:--seq=fire:0.42,fire:hit,thunder:0.34,ice:0.5(技能:放出后多少秒;hit = 火球命中后 4 帧)
    if seq:
        for item in seq.split(','):
            name, when = item.split(':')
            if when == 'hit':
                print(' ', await p.js(cast_js(name, 0.05)), await p.js("(() => { const d = window.__dbg; let n = 0; while (!(d.sim.fire && d.sim.fire.hit) && n < 400) { d.step(1/120, 1); n++; } d.step(1/120, 4); return 'hit after ' + n; })()"), flush=True)
            else:
                print(' ', await p.js(cast_js(name, float(when))), flush=True)
            await p.shot(os.path.join(OUT, f'{tag}_{name}_{when}.jpg'))
        return
    cast = opt('cast', '')
    if cast:
        print(' ', await p.js(cast_js(cast, t)), flush=True)
    else:
        print(' ', await p.js(f"(() => {{ const d = window.__dbg; d.reset(); return d.step(1/60, {int(t * 60)}); }})()"), flush=True)
    await p.shot(os.path.join(OUT, tag + '.jpg'))
    if opt('ground', ''):
        data = await p.js('window.__dbg.ground(4096)', 120)
        open(os.path.join(OUT, tag + '_ground.jpg'), 'wb').write(base64.b64decode(data.split(',', 1)[1]))
    print(' ', json.dumps(json.loads(await p.js('JSON.stringify(window.__dbg.info())')), ensure_ascii=False), flush=True)


async def mode_shots(p):
    only = opt('only', '')   # --only=base,sprite,tier,phone 只重截其中几组
    want = lambda k: not only or k in only.split(',')
    base = 'ui=0&pause=1&drift=0&auto=0'
    hit = "(() => { const d = window.__dbg; let n = 0; while (!(d.sim.fire && d.sim.fire.hit) && n < 400) { d.step(1/120, 1); n++; } d.step(1/120, 4); return 'hit after ' + n; })()"
    # 电脑 1920×1080(高档)
    if (want('base') or want('sprite') or want('tier')) and await p.open(1920, 1080, 1, False, 'q=high&' + base):
        print(' pc', await p.js('JSON.stringify(window.__dbg.info())'), flush=True)
        if want('base'):
            await p.js("(() => { const d = window.__dbg; d.reset(); return d.step(1/60, 45); })()")
            await p.shot(os.path.join(OUT, 'pc_00_全景.png'), True)
            # 火球:飞行中 → 命中爆闪 → 余烬
            print(' ', await p.js(cast_js('fire', 0.5)), flush=True)
            await p.shot(os.path.join(OUT, 'pc_1_火球_a飞行.png'), True)
            print(' ', await p.js(hit), flush=True)
            await p.shot(os.path.join(OUT, 'pc_1_火球_b命中.png'), True)
            await p.js("window.__dbg.step(1/60, 30)")
            await p.shot(os.path.join(OUT, 'pc_1_火球_c余烬.png'), True)
            # 落雷:预警 → 劈下 → 焦痕
            print(' ', await p.js(cast_js('thunder', 0.2)), flush=True)
            await p.shot(os.path.join(OUT, 'pc_2_落雷_a预警.png'), True)
            await p.js("window.__dbg.step(1/120, 16)")
            await p.shot(os.path.join(OUT, 'pc_2_落雷_b劈下.png'), True)
            await p.js("window.__dbg.step(1/60, 45)")
            await p.shot(os.path.join(OUT, 'pc_2_落雷_c焦痕.png'), True)
            # 冰环:扩散中 → 冻住
            print(' ', await p.js(cast_js('ice', 0.36)), flush=True)
            await p.shot(os.path.join(OUT, 'pc_3_冰环_a扩散.png'), True)
            await p.js("window.__dbg.step(1/60, 42)")
            await p.shot(os.path.join(OUT, 'pc_3_冰环_b冻住.png'), True)
        if want('sprite'):
            # 三种角色受光方式(落雷劈下、整场被照亮的同一瞬间:最能看出角色跟不跟着场景的光走)
            for m, label in ((0, '不受光'), (1, '整体染色'), (2, '逐像素')):
                await p.js(f"window.__dbg.setSpriteMode({m})")
                print(' ', await p.js(cast_js('thunder', 0.34)), flush=True)
                await p.shot(os.path.join(OUT, f'pc_4_角色受光_{m}{label}.png'), True)
            await p.js("window.__dbg.setSpriteMode(1)")
        if want('tier'):
            # 三档画质同一帧
            for q in ('high', 'mid', 'low'):
                await p.js(f"window.__dbg.setQuality('{q}')")
                print(' ', q, await p.js(cast_js('fire', 0.5)), flush=True)
                await p.shot(os.path.join(OUT, f'pc_5_画质_{q}.png'), True)
    # 手机 2400×1080(1200×540 @2,中档 = 手机默认)
    if want('phone') and await p.open(1200, 540, 2, True, 'q=mid&' + base):
        print(' phone', await p.js('JSON.stringify(window.__dbg.info())'), flush=True)
        await p.js("(() => { const d = window.__dbg; d.reset(); return d.step(1/60, 45); })()")
        await p.shot(os.path.join(OUT, 'phone_00_全景.png'), True)
        print(' ', await p.js(cast_js('ice', 0.5)), flush=True)
        await p.shot(os.path.join(OUT, 'phone_1_冰环.png'), True)
        print(' ', await p.js(cast_js('fire', 0.5)), flush=True)
        await p.shot(os.path.join(OUT, 'phone_2_火球.png'), True)
        print(' ', await p.js(cast_js('thunder', 0.34)), flush=True)
        await p.shot(os.path.join(OUT, 'phone_3_落雷.png'), True)


async def mode_bench(p):
    rows = []
    for label, (w, h, dpr, mobile) in (('1920x1080', (1920, 1080, 1, False)), ('2400x1080', (1200, 540, 2, True))):
        for q in ('high', 'mid', 'low'):
            if not await p.open(w, h, dpr, mobile, f'q={q}&ui=0&pause=1&drift=0&px=4000&dpr={dpr}'):
                continue
            await p.js("(() => { const d = window.__dbg; d.reset(); d.setAuto(true); d.step(1/60, 30); return 1; })()")
            res = json.loads(await p.js('(async () => JSON.stringify(await window.__dbg.bench(240, 40)))()', 600))
            row = {k: res[k] for k in ('avg', 'median', 'p95', 'max', 'tier', 'buffer', 'calls', 'triangles', 'textures', 'geometries', 'programs', 'renderer', 'software', 'shadow', 'ao', 'msaa', 'bloom', 'groundTex')}
            row['view'] = label
            rows.append(row)
            print(f"  {label} {q}: 平均 {row['avg']} ms  中位 {row['median']}  95分位 {row['p95']}  批次 {row['calls']}  三角 {row['triangles']}  贴图 {row['textures']}  画布 {row['buffer']}", flush=True)
    # 低档按它自己的默认分辨率(画布短边封顶 720)再测一行:这才是手机「流畅档」实际要画的像素数
    if await p.open(1200, 540, 2, True, 'q=low&ui=0&pause=1&drift=0'):
        await p.js("(() => { const d = window.__dbg; d.reset(); d.setAuto(true); d.step(1/60, 30); return 1; })()")
        res = json.loads(await p.js('(async () => JSON.stringify(await window.__dbg.bench(240, 40)))()', 600))
        row = {k: res[k] for k in ('avg', 'median', 'p95', 'max', 'tier', 'buffer', 'calls', 'triangles', 'textures', 'geometries', 'programs', 'renderer', 'software', 'shadow', 'ao', 'msaa', 'bloom', 'groundTex')}
        row['view'] = '1600x720(低档默认)'
        rows.append(row)
        print(f"  1600x720 low(默认短边 720): 平均 {row['avg']} ms  中位 {row['median']}  95分位 {row['p95']}  批次 {row['calls']}  贴图 {row['textures']}  画布 {row['buffer']}", flush=True)
    if rows:
        print('  渲染器:', rows[0]['renderer'], '(软件渲染)' if rows[0]['software'] else '', flush=True)
        tag = opt('tag', 'bench')
        json.dump(rows, open(os.path.join(OUT, tag + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


async def mode_profile(p):
    """拆开销:从低档出发,一项一项加回去,看每一项值多少毫秒(--size / --dpr 指定画布)。"""
    w, h = size_of(opt('size', '1920x1080'))
    dpr = float(opt('dpr', '1'))
    if not await p.open(w, h, dpr, dpr > 1, f'q=low&ui=0&pause=1&drift=0&px=4000&dpr={dpr}'):
        return
    steps = [('低档去掉投影(只有 3 盏技能点光 + 月光)', '{ shadow: 0 }'), ('+ 主光投影 1024(= 低档)', '{ shadow: 1024 }'), ('+ 环境反射 / 补光 / 细节法线', '{ env: true }'),
             ('+ 环境光遮蔽半分辨率 + 泛光半分辨率(= 中档)', '{ ao: 0.5, aoSamples: 8, bloom: 0.5 }'), ('+ 火盆 / 水晶 4 盏点光逐像素算', '{ pl: true }'),
             ('+ 贴图 4096 / 投影 2048 / 遮蔽全分辨率 / 泛光全分辨率', '{ ground: 4096, shadow: 2048, ao: 1, aoSamples: 16, bloom: 1 }'), ('+ 4 倍多重采样(= 高档)', '{ msaa: 4 }')]
    rows = []
    for label, tw in steps:
        await p.js(f"(() => {{ const d = window.__dbg; d.tweak({tw}); d.reset(); d.setAuto(true); d.step(1/60, 30); return 1; }})()", 120)
        res = json.loads(await p.js('(async () => JSON.stringify(await window.__dbg.bench(160, 30)))()', 600))
        rows.append({'step': label, 'avg': res['avg'], 'p95': res['p95'], 'calls': res['calls'], 'buffer': res['buffer'], 'renderer': res['renderer']})
        print(f"  {label}: {res['avg']} ms(95 分位 {res['p95']},批次 {res['calls']})", flush=True)
    print('  渲染器:', rows[0]['renderer'], rows[0]['buffer'], flush=True)
    json.dump(rows, open(os.path.join(OUT, opt('tag', 'profile') + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


async def mode_video(p):
    w, h = size_of(opt('size', '1600x900'))
    secs = float(opt('secs', '10'))
    fps = int(opt('fps', '30'))
    q = opt('q', 'high')
    frames = os.path.join(OUT, '_frames')
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames, exist_ok=True)
    if not await p.open(w, h, 1, False, f'q={q}&ui=0&pause=1&px=4000'):
        return
    await p.js("(() => { const d = window.__dbg; d.reset(); d.setAuto(true); d.setDrift(true); return 1; })()")
    total = int(secs * fps)
    for i in range(total):
        data = await p.js(f"(() => {{ const d = window.__dbg; d.step({1 / (fps * 2)}, 2); return d.shot('image/jpeg', 0.93); }})()", 120)
        open(os.path.join(frames, f'f{i:04d}.jpg'), 'wb').write(base64.b64decode(data.split(',', 1)[1]))
        if i % 30 == 29:
            print(f'  frame {i + 1}/{total}', flush=True)
    out = os.path.join(OUT, opt('tag', '录屏_10秒') + '.mp4')
    ff = shutil.which('ffmpeg')
    if not ff:
        print('  没找到 ffmpeg,帧在', frames, flush=True)
        return
    r = subprocess.run([ff, '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', out], capture_output=True, text=True)
    print('  video', out, os.path.getsize(out) // 1024 if os.path.exists(out) else 0, 'KB', r.stderr[-300:], flush=True)
    if os.path.exists(out):
        shutil.rmtree(frames, ignore_errors=True)


async def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(SCRATCH, exist_ok=True)
    httpd = serve.make_server(HTTP_PORT, False)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    gpu = os.environ.get('QA_GPU', '1')
    if gpu == '0':
        flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    elif gpu == 'low':
        flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_low_power_gpu']
    else:
        flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={PROFILE}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--window-size=1920,1080',
                             '--disable-frame-rate-limit', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'] + flags + ['about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            p = Page(ws)
            await p.call('Runtime.enable')
            await p.call('Page.enable')
            await p.call('Page.bringToFront')
            await {'look': mode_look, 'shots': mode_shots, 'bench': mode_bench, 'video': mode_video, 'profile': mode_profile}[MODE](p)
            if p.logs:
                print('  page logs:', *list(dict.fromkeys(p.logs))[:10], sep='\n    ', flush=True)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        if edge_guard:
            try:
                edge_guard.kill_profiles([PROFILE])
            except Exception:  # noqa: BLE001
                pass
        httpd.shutdown()


if __name__ == '__main__':
    asyncio.run(main())
