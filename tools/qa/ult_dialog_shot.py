# -*- coding: utf-8 -*-
"""大招升级弹窗截图(手机 / 电脑尺寸)+ 洗练后飘字位置截图。用法:PREVIEW_PORT=7456 python ult_dialog_shot.py <tag> <915x412m|1600x900>"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
from dock_diag_probe import OPEN_DETAIL

TAG = sys.argv[1]
VP = sys.argv[2] if len(sys.argv) > 2 else '915x412m'
mobile = VP.endswith('m')
W, H = [int(v) for v in VP.rstrip('m').split('x')]
SHOTS = os.path.join(base.SCRATCH, 'shots', 'tour')
os.makedirs(SHOTS, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=600):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('method') == 'Runtime.exceptionThrown':
                        d = x['params']['exceptionDetails']
                        print('  !! page exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:300], flush=True)
                    if x.get('id') == my:
                        return x

            async def ev(e, timeout=600):
                r = (await call('Runtime.evaluate', {'expression': e, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(SHOTS, f'{TAG}_{VP}_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                print('shot', name, flush=True)

            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            if mobile:
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT, 900))
            for _try in range(3):
                res = await ev(base.JS_LOGIN, 120)
                if 'view=lobby' in str(res):
                    break
                await asyncio.sleep(10)
            print('detail', await ev(OPEN_DETAIL), flush=True)
            print('ult', await ev("(async () => { const r = window.__root; r.openLobbyHeroUltimateDialog(); await new Promise(z => setTimeout(z, 2500)); return r.lobbyHeroUltimateDialogOpen; })()"))
            await shot('ult')
            print('ult up', await ev("(async () => { const r = window.__root; const h = r.currentLobbyHeroDetailHero(); r.confirmLobbyHeroUltimateUp(h.id); await new Promise(z => setTimeout(z, 1300)); return 'ok'; })()"))
            await shot('ult_after')
            print('refine', await ev("(async () => { const r = window.__root; r.closeLobbyHeroUltimateDialog(); await new Promise(z => setTimeout(z, 800)); r.openLobbyHeroRefineDialog(); await new Promise(z => setTimeout(z, 1500)); const h = r.currentLobbyHeroDetailHero(); r.refineLobbyHero(h.id); await new Promise(z => setTimeout(z, 1200)); return 'ok'; })()"))
            await shot('refine_after')
    finally:
        proc.terminate()


asyncio.run(main())
