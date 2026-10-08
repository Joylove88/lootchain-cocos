import asyncio, json, os, subprocess, time, urllib.request, sys
import websockets
import boss_bar_cdp as base
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
URL = sys.argv[1]
async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run', '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception:
                time.sleep(0.3)
        for mode in ('ultra', 'smooth', None):
            t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
            async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
                seq = 0
                async def call(method, params=None):
                    nonlocal seq
                    seq += 1; my = seq
                    await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                    while True:
                        m = json.loads(await asyncio.wait_for(ws.recv(), 600))
                        if m.get('id') == my: return m
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2.6, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                await call('Page.enable')
                js = "try{localStorage.removeItem('lootchain.graphics.fps');" + (f"localStorage.setItem('lootchain.graphics.mode','{mode}')" if mode else "localStorage.removeItem('lootchain.graphics.mode')") + "}catch(e){}"
                await call('Page.addScriptToEvaluateOnNewDocument', {'source': js})
                await call('Page.navigate', {'url': URL})
                await asyncio.sleep(25)
                r = await call('Runtime.evaluate', {'expression': "(async () => { const c = document.getElementById('GameCanvas'); let fps = null; try { const cc = await System.import('cc'); fps = cc.game.frameRate; } catch (e) {} const gd = document.getElementById('GameDiv'); return JSON.stringify({ style: [c.style.width, c.style.height], rect: [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)], gd: gd && [gd.style.width, gd.style.height], mode: localStorage.getItem('lootchain.graphics.mode'), canvas: [c.width, c.height], css: [innerWidth, innerHeight], dpr: window.devicePixelRatio, fps }); })()", 'awaitPromise': True, 'returnByValue': True})
                print(mode, r['result']['result'].get('value'))
    finally:
        proc.terminate()
asyncio.run(main())
