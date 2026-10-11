# -*- coding: utf-8 -*-
"""正式包(7460)手机参数:进战场后统计 60s 内 共享动画缓存被作废次数(invalidAnimationCache)与 骨骼 updateAnimation 累计耗时,
用来 A/B 验证「setSkin 作废共享缓存」修复(2026-10-11)。复用 rush_perf_cdp 的 ENTER / AUTO。
用法:CPU_THROTTLE=4 python spine_cache_probe.py <tag> [secs=60]"""
import asyncio, json, os, re, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

TAG = sys.argv[1]
SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 60
_src = open(os.path.join(base.HERE, 'rush_perf_cdp.py'), encoding='utf-8').read()
ENTER = re.search(r'^ENTER = r"""(.*?)"""', _src, re.S | re.M).group(1)
AUTO = re.search(r'^AUTO = r"""(.*?)"""', _src, re.S | re.M).group(1)
URL = 'http://localhost:7460/'
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
PRE = "try{localStorage.setItem('lootchain.graphics.mode','ultra');localStorage.setItem('lootchain.graphics.fps','60')}catch(e){}"

WRAP = r"""(() => { const sp = window.__cc.sp; if (window.__sc) return 'already'; const S = window.__sc = { inval: 0, updMs: 0, updN: 0, frames: 0, ft: [] };
  const P = sp.Skeleton.prototype; const inv = P.invalidAnimationCache, upd = P.updateAnimation;
  P.invalidAnimationCache = function () { S.inval += 1; return inv.apply(this, arguments); };
  P.updateAnimation = function () { const t = performance.now(); const r = upd.apply(this, arguments); S.updMs += performance.now() - t; S.updN += 1; return r; };
  let last = performance.now(); const tick = () => { const n = performance.now(); S.ft.push(n - last); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  return 'wrapped'; })()"""
DUMP = r"""(() => { const S = window.__sc, r = window.__gr, s = r && r.sim; const ft = S.ft.slice().sort((a, b) => a - b); const q = p => ft.length ? Math.round(ft[Math.min(ft.length - 1, Math.floor(ft.length * p))]) : 0;
  const out = { inval: S.inval, updMs: Math.round(S.updMs), updN: S.updN, frames: ft.length, p50: q(0.5), p90: q(0.9), p99: q(0.99), over100: ft.filter(x => x > 100).length, mon: s ? s.monsters.filter(m => !m.dead).length : -1, wave: s && s.wave };
  S.inval = 0; S.updMs = 0; S.updN = 0; S.ft = []; return JSON.stringify(out); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(method, params=None, timeout=900):
                nonlocal seq
                seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            await call('Runtime.enable'); await call('Page.enable')
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            if os.environ.get('CPU_THROTTLE'):
                await call('Emulation.setCPUThrottlingRate', {'rate': float(os.environ['CPU_THROTTLE'])})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2.6, 'mobile': True,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': PRE})
            await call('Page.navigate', {'url': URL})
            await asyncio.sleep(6)
            print(await ev(base.JS_BOOT), flush=True)
            print(await ev(base.JS_LOGIN), flush=True)
            for _ in range(120):
                if (await ev("!!(window.__root && window.__root.currentView === 'lobby')")) is True:
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(3)
            print('ENTER', (await ev(ENTER) or '')[:160], flush=True)
            print('WRAP', await ev(WRAP), flush=True)
            print('AUTO', await ev(AUTO), flush=True)
            await asyncio.sleep(2)
            await ev(DUMP)
            t0 = time.time()
            while time.time() - t0 < SECS:
                await asyncio.sleep(10)
                print(f'[{time.time() - t0:3.0f}s]', await ev(DUMP), flush=True)
    finally:
        proc.terminate()


asyncio.run(main())
