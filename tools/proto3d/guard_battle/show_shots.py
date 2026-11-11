# -*- coding: utf-8 -*-
"""守卫战全 3D 样板(引擎里的展示模式 ?g3dshow=1):无头 Edge 出图 / 测每帧耗时 / 逐帧录屏。

样板本身在 assets/scripts/scenes/lobby/guard3d/G3DStage.ts,不用登录、不进战斗;Creator 预览(7456)要开着。
这里自己起无头 Edge(真显卡;QA_GPU=low 用核显,QA_GPU=0 软件渲染),独立调试端口 9363 + 独立配置目录,退出时清残留。

用法(PYTHONIOENCODING=utf-8):
  python tools/proto3d/guard_battle/show_shots.py shots <输出目录> [--q=ultra] [--size=1920x1080] [--only=battle,cast,close,phone]
  python tools/proto3d/guard_battle/show_shots.py bench <输出目录>            # 三档画质 × 1920x1080,中档再测 2400x1080
  python tools/proto3d/guard_battle/show_shots.py video <输出目录> [--q=high] [--size=1600x900] [--secs=12] [--fps=30] [--cam=battle]
  python tools/proto3d/guard_battle/show_shots.py look  <输出目录> [--q=high] [--cam=battle] [--t=3] [--cast=1.2]   # 随手看一眼
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

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', '..', 'qa')))
try:
    import edge_guard  # 无头 Edge 收尾兜底:退出时按配置目录杀残留
    edge_guard.install()
except Exception:  # noqa: BLE001
    edge_guard = None

EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = int(os.environ.get('EDGE_PORT', '9363'))
SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp', 'lootchain-qa')
PROFILE = os.path.join(SCRATCH, 'g3dshow_browser_profile')
PREVIEW = os.environ.get('PREVIEW_URL', 'http://localhost:7456/')
UA_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
MODE = ARGS[0] if ARGS else 'look'
OUT = ARGS[1] if len(ARGS) > 1 else os.path.join(SCRATCH, 'g3dshow')

# 预览页自带一条工具栏,会把画布挤扁:藏掉,让画布铺满视口
LAYOUT = ("(() => { const tb = document.querySelector('.toolbar'); if (tb) tb.style.display = 'none'; const vc = document.getElementById('__vconsole'); if (vc) vc.style.display = 'none';"
          " for (const id of ['content', 'GameDiv']) { const e = document.getElementById(id); if (e) { e.style.position = 'absolute'; e.style.left = '0'; e.style.top = '0';"
          " e.style.width = innerWidth + 'px'; e.style.height = innerHeight + 'px'; e.style.margin = '0'; e.style.padding = '0'; e.style.transform = 'none'; } }"
          " document.body.style.overflow = 'hidden'; window.dispatchEvent(new Event('resize')); return [innerWidth, innerHeight]; })()")


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
                self.logs.append(x['params']['type'] + ' ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in x['params'].get('args', []))[:300])
            if x.get('id') == my:
                return x

    async def js(self, expr, timeout=300):
        r = (await self.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
        if r.get('exceptionDetails'):
            return 'EXC ' + (r['exceptionDetails'].get('exception', {}).get('description', '') or str(r['exceptionDetails']))[:600]
        return r.get('result', {}).get('value')

    async def open(self, w, h, q='high', mobile=False):
        """打开样板:等它建完场景、摆好画布,再暂停引擎的帧循环(之后一律手动逐帧推,结果可复现)。"""
        await self.call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': mobile})
        if mobile:
            await self.call('Network.setUserAgentOverride', {'userAgent': UA_PHONE, 'platform': 'Android'})
        # 换页面前先放掉上一页的显卡资源,不然弱显卡上后面几轮虚高
        await self.js("(() => { try { const g = cc.director.root.device.gl; const e = g.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (e) {} return 1; })()")
        await self.call('Page.navigate', {'url': 'about:blank'})
        await self.call('HeapProfiler.collectGarbage')
        await asyncio.sleep(0.6)
        await self.call('Page.navigate', {'url': f'{PREVIEW}?g3dshow=1&q={q}'})
        ok = False
        for _ in range(360):
            v = await self.js("(() => { const g = window.__g3dshow; return g ? JSON.stringify({ opened: g.stage.opened, err: g.stage.lastError }) : ''; })()")
            if isinstance(v, str) and v:
                st = json.loads(v)
                if st.get('err'):
                    print('  open error:', st['err'][:400], flush=True)
                    return False
                if st.get('opened'):
                    ok = True
                    break
            await asyncio.sleep(0.25)
        if not ok:
            print('  样板没起来(预览开着吗?)', *self.logs[-6:], sep='\n  ', flush=True)
            return False
        await self.js(LAYOUT)
        await asyncio.sleep(1.2)
        await self.js(LAYOUT)
        await self.js("(() => { cc.game.pause(); const st = __g3dshow.stage; st.fixedDt = 1 / 30; for (let i = 0; i < 4; i++) cc.game.step(); return 1; })()")
        return True

    async def step(self, n=1, dt=1 / 30):
        return await self.js(f"(() => {{ const st = __g3dshow.stage; st.fixedDt = {dt}; for (let i = 0; i < {int(n)}; i++) cc.game.step(); return st.time; }})()", 300)

    async def shot(self, path, quality=93):
        png = path.lower().endswith('.png')
        r = await self.call('Page.captureScreenshot', {'format': 'png' if png else 'jpeg', 'quality': quality} if not png else {'format': 'png'}, 120)
        data = r.get('result', {}).get('data')
        if not data:
            print('  shot failed', str(r)[:200], flush=True)
            return False
        with open(path, 'wb') as f:
            f.write(base64.b64decode(data))
        print('  shot', os.path.basename(path), flush=True)
        return True


def cast_js(at):
    """立刻开始施法,推到施法第 at 秒定格(蓄力 0~1.1,落雷 1.12,之后收势)。"""
    return (f"(() => {{ const st = __g3dshow.stage; st.fixedDt = 1 / 60; let n = 0; while (st.castT > {at} && n < 400) {{ cc.game.step(); n++; }}"
            f" if (st.castT < 0) st.castNow(); while ((st.castT < 0 || st.castT < {at}) && n < 1500) {{ cc.game.step(); n++; }}"
            f" return JSON.stringify({{ castT: +st.castT.toFixed(3), knights: st.knights.map(k => k.state) }}); }})()")


async def mode_look(p):
    w, h = size_of(opt('size', '1280x720'))
    q = opt('q', 'high')
    if not await p.open(w, h, q):
        return
    await p.js(f"__g3dshow.cam('{opt('cam', 'battle')}')")
    await p.step(int(float(opt('t', '3')) * 30))
    if opt('cast'):
        print(' ', await p.js(cast_js(float(opt('cast')))), flush=True)
    await p.step(1, 1 / 60)
    await p.shot(os.path.join(OUT, f"look_{opt('tag', q)}.jpg"))
    print(' ', await p.js('JSON.stringify(__g3dshow.info())'), flush=True)


async def mode_shots(p):
    w, h = size_of(opt('size', '1920x1080'))
    q = opt('q', 'ultra')
    only = [s for s in opt('only', 'battle,cast,close,phone').split(',') if s]
    if 'battle' in only or 'cast' in only or 'close' in only:
        if not await p.open(w, h, q):
            return
        await p.step(150)   # 先走 5 秒:骑士走进画面,火星、尘埃铺开
    if 'battle' in only:
        await p.js("__g3dshow.stage.mode = 'idle'; __g3dshow.cam('battle')")
        await p.step(2)
        await p.shot(os.path.join(OUT, '01_战场全景_待机.jpg'))
    if 'cast' in only:
        await p.js("__g3dshow.stage.mode = 'loop'; __g3dshow.cam('battle')")
        for at, name in [(0.95, '02_蓄力'), (1.14, '03_落雷'), (1.22, '04_连锁'), (1.75, '05_余烬')]:
            print(' ', await p.js(cast_js(at)), flush=True)
            await p.shot(os.path.join(OUT, f'{name}.jpg'))
        # 中景:落雷那一下从低机位再看一次
        await p.step(240)
        await p.js("__g3dshow.cam('low')")
        print(' ', await p.js(cast_js(1.15)), flush=True)
        await p.shot(os.path.join(OUT, '06_落雷_低机位.jpg'))
        await p.step(90)
    if 'close' in only:
        await p.js("__g3dshow.stage.mode = 'idle'")
        for cam, name in [('hero', '07_术士_中景'), ('crystal', '08_水晶'), ('low', '09_低机位全景')]:
            await p.js(f"__g3dshow.cam('{cam}')")
            await p.step(3)
            await p.shot(os.path.join(OUT, f'{name}.jpg'))
        # 骑士近景:把镜头摆到一个还活着的骑士身边
        await p.js("__g3dshow.stage.mode = 'loop'")
        await p.step(200)
        r = await p.js("(() => { const st = __g3dshow.stage; const ks = st.knights.filter(k => k.state === 'walk' || k.state === 'fight').sort((a, b) => b.x - a.x); const k = ks[Math.min(1, ks.length - 1)];"
                       " if (!k) return 'no knight'; st.setCam('knights'); st.camBase.set(k.x - 2.4, 1.45, k.z + 4.4); st.cam.node.setPosition(st.camBase); st.cam.fov = 26;"
                       " st.cam.node.lookAt(new cc.Vec3(k.x - 0.2, 1.05, k.z)); st.placeOverlays(); return k.state + '@' + k.x.toFixed(1); })()")
        print('  knight cam:', r, flush=True)
        await p.step(2)
        await p.shot(os.path.join(OUT, '10_骑士_近景.jpg'))
    if 'phone' in only:
        if not await p.open(2400, 1080, 'mid', True):
            return
        await p.step(150)
        await p.js("__g3dshow.stage.mode = 'loop'; __g3dshow.cam('battle')")
        await p.shot(os.path.join(OUT, '11_手机视口_中档_待机.jpg'))
        print(' ', await p.js(cast_js(1.14)), flush=True)
        await p.shot(os.path.join(OUT, '12_手机视口_中档_落雷.jpg'))


BENCH = ("(() => { const gl = cc.director.root.device.gl; const px = new Uint8Array(4); const st = __g3dshow.stage; st.fixedDt = 1 / 30; const run = (n) => { const ts = [];"
         " for (let i = 0; i < n; i++) { const t0 = performance.now(); cc.game.step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }"
         " ts.sort((a, b) => a - b); return { median: +ts[ts.length >> 1].toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2) }; };"
         " run(40); const r = run(240); const dev = cc.director.root.device; const cv = cc.game.canvas;"
         " return JSON.stringify({ canvas: [cv.width, cv.height], ms: r, draws: dev.numDrawCalls, tris: dev.numTris, fx: st.fx.stats, knights: st.knights.filter(k => k.state !== 'gone').length,"
         " cfg: { q: __g3dshow.cfg.quality, ss: __g3dshow.cfg.ss, shadow: __g3dshow.cfg.shadow, reflect: __g3dshow.cfg.reflect, fill: __g3dshow.cfg.fillLights }, gpu: dev.renderer }); })()")


async def mode_bench(p):
    rows = []
    for q, w, h, mobile in [('ultra', 1920, 1080, False), ('high', 1920, 1080, False), ('mid', 1920, 1080, False), ('mid', 2400, 1080, True)]:
        if not await p.open(w, h, q, mobile):
            continue
        await p.step(150)
        v = await p.js(BENCH, 600)
        try:
            row = json.loads(v)
        except Exception:  # noqa: BLE001
            print('  bench failed', q, str(v)[:300], flush=True)
            continue
        row['q'] = q
        row['view'] = f'{w}x{h}' + (' 手机' if mobile else '')
        rows.append(row)
        print(f"  {q:5s} {row['view']:14s} 画布 {row['canvas']}  每帧 {row['ms']['median']} ms(95% {row['ms']['p95']})  绘制 {row['draws']} 次  三角 {row['tris']}", flush=True)
    tag = {'low': '核显', '0': '软件渲染'}.get(os.environ.get('QA_GPU', '1'), '独显')
    with open(os.path.join(OUT, f'bench_样板_{tag}.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    if rows:
        print('  显卡:', rows[0].get('gpu'), flush=True)


async def mode_video(p):
    w, h = size_of(opt('size', '1600x900'))
    secs = float(opt('secs', '12'))
    fps = int(opt('fps', '30'))
    q = opt('q', 'high')
    frames = os.path.join(SCRATCH, 'g3dshow_frames')
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames, exist_ok=True)
    if not await p.open(w, h, q):
        return
    await p.step(140)
    await p.js(f"__g3dshow.stage.mode = 'loop'; __g3dshow.cam('{opt('cam', 'battle')}'); __g3dshow.stage.nextCast = __g3dshow.stage.time + 1.6")
    total = int(secs * fps)
    for i in range(total):
        await p.step(2, 1 / (fps * 2))
        r = await p.call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 92}, 120)
        open(os.path.join(frames, f'f{i:04d}.jpg'), 'wb').write(base64.b64decode(r['result']['data']))
        if i % 60 == 59:
            print(f'  frame {i + 1}/{total}', flush=True)
    out = os.path.join(OUT, opt('tag', f'录屏_{int(secs)}秒_{w}x{h}') + '.mp4')
    ff = shutil.which('ffmpeg')
    if not ff:
        print('  没找到 ffmpeg,帧在', frames, flush=True)
        return
    r = subprocess.run([ff, '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', opt('crf', '19'), '-preset', 'slow', '-movflags', '+faststart', out], capture_output=True, text=True)
    print('  video', out, os.path.getsize(out) // 1024 if os.path.exists(out) else 0, 'KB', r.stderr[-300:], flush=True)
    if os.path.exists(out):
        shutil.rmtree(frames, ignore_errors=True)


async def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(SCRATCH, exist_ok=True)
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
            await {'look': mode_look, 'shots': mode_shots, 'bench': mode_bench, 'video': mode_video}[MODE](p)
            if p.logs:
                print('  page logs:', *list(dict.fromkeys(p.logs))[:8], sep='\n    ', flush=True)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        if edge_guard:
            try:
                edge_guard.kill_profiles([PROFILE])
            except Exception:  # noqa: BLE001
                pass


if __name__ == '__main__':
    asyncio.run(main())
