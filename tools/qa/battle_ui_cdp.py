# -*- coding: utf-8 -*-
"""手机横屏:进守卫战,依次截 战斗设置 / 豪华宝箱轮盘(转完)。"""
import asyncio, base64, json, os, subprocess, time, urllib.request
import websockets
import boss_bar_cdp as base
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle2.js'), encoding='utf-8').read()
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run', '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            async def call(method, params=None):
                nonlocal seq
                seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 900))
                    if m.get('id') == my: return m
            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')
            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'})
                open(os.path.join(base.SCRATCH, 'shots', f'bui_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT)); print(await ev(base.JS_LOGIN)); print((await ev(JS_BATTLE) or '')[:80])
            await asyncio.sleep(3)
            print(await ev("(async () => { const r = window.__gr, M = window.__M; if (r.sim.pendingChoice) M.guardSkipChoice(r.sim); r.openBattleSettings(); await new Promise(z => setTimeout(z, 1200)); return 'settings'; })()"))
            await shot('settings')
            print(await ev("(async () => { const cc = window.__cc, r = window.__gr; let n = null; const w = x => { if (n) return; if (x.name === 'GuardSheetClose') { n = x; return; } x.children.forEach(w); }; w(r.root); if (n) n.emit(cc.Node.EventType.TOUCH_END); await new Promise(z => setTimeout(z, 600)); const s = r.sim; s.chests.push({ chestId: 9901, x: 5, lane: 0, droppedAtMs: s.timeMs, grade: 'deluxe' }); r.openChestWithWheel(9901); await new Promise(z => setTimeout(z, 2500)); return 'wheel open=' + r.wheelOverlayOpen; })()"))
            await shot('wheel_idle')
            await asyncio.sleep(9)
            await shot('wheel_done')
    finally:
        proc.terminate()
asyncio.run(main())
