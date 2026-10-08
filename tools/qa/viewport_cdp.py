# -*- coding: utf-8 -*-
"""多分辨率 / 横竖屏自验:同一个无头 Edge 里按视口逐个开标签,模拟手机(UA+触屏+DPR),依次截 登录 / 大厅 / 守卫战。
用法:EDGE_PORT=9351 EDGE_PROFILE=edge_boss_profile8 python viewport_cdp.py <tag> 667x375m 390x844m 1024x768m 1920x1080 ...
  后缀 m = 手机模拟(DPR 2、触屏、iPhone UA);--screens login,lobby,battle 选择截哪些;--js '<expr>' 每屏截图前额外打印的探针。"""
import asyncio, base64, json, os, sys, time, subprocess, urllib.request
import websockets
import boss_bar_cdp as base
import ult_size_cdp as us

args = sys.argv[1:]
TAG = args[0]
VIEWS = [a for a in args[1:] if 'x' in a and not a.startswith('--')]
SCREENS = args[args.index('--screens') + 1].split(',') if '--screens' in args else ['login', 'lobby', 'battle']
EXTRA_JS = args[args.index('--js') + 1] if '--js' in args else None
SHOTS = os.path.join(base.SCRATCH, 'shots', 'vp')
os.makedirs(SHOTS, exist_ok=True)
IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

PROBE = r"""(() => { const cc = window.__cc; if (!cc) return 'no cc';
  const vs = cc.view.getVisibleSize(), ds = cc.view.getDesignResolutionSize(), fr = cc.view.getFrameSize ? cc.view.getFrameSize() : null;
  const sa = cc.screen && cc.screen.windowSize; const c = document.getElementById('GameCanvas');
  const div = document.getElementById('GameDiv') || document.getElementById('Cocos3dGameContainer');
  return JSON.stringify({ inner: [innerWidth, innerHeight], design: [Math.round(ds.width), Math.round(ds.height)], visible: [Math.round(vs.width), Math.round(vs.height)],
    frame: fr ? [Math.round(fr.width), Math.round(fr.height)] : null, win: sa ? [Math.round(sa.width), Math.round(sa.height)] : null,
    canvasCss: c ? [c.style.width, c.style.height] : null, frameTransform: div ? (div.style.transform || getComputedStyle(div).transform) : null,
    view: window.__root ? window.__root.currentView : null });
})()"""


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
        for vp in VIEWS:
            mobile = vp.endswith('m')
            dpr_override = float(vp.split('@')[1]) if '@' in vp else None
            w, h = [int(v) for v in vp.split('@')[0].rstrip('m').split('x')]
            t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
            async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
                seq = 0

                async def call(method, params=None, timeout=400):
                    nonlocal seq
                    seq += 1
                    my = seq
                    await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                    while True:
                        m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                        if m.get('id') == my:
                            return m

                async def ev(expr, timeout=400):
                    r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                    return r.get('result', {}).get('value') if 'exceptionDetails' not in r else 'EXC ' + str(r['exceptionDetails'])[:300]

                async def snap(name):
                    if EXTRA_JS:
                        print('   js', await ev(EXTRA_JS, 30))
                    print('   probe', await ev(PROBE, 30))
                    m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                    path = os.path.join(SHOTS, f'{TAG}_{vp}_{name}.png')
                    open(path, 'wb').write(base64.b64decode(m['result']['data']))
                    print('   shot', path)

                await call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr_override or (2 if mobile else 1), 'mobile': mobile,
                                                                   'screenOrientation': {'type': 'portraitPrimary' if h > w else 'landscapePrimary', 'angle': 0 if h > w else 90}})
                if mobile:
                    await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                    await call('Network.setUserAgentOverride', {'userAgent': IPHONE_UA, 'platform': 'iPhone'})
                await call('Page.enable')
                await call('Page.navigate', {'url': base.PAGE})
                await asyncio.sleep(8)
                print(vp, 'boot', await ev(base.JS_BOOT, 900))
                if 'login' in SCREENS:
                    await asyncio.sleep(2)
                    await snap('login')
                if 'lobby' in SCREENS or 'battle' in SCREENS:
                    print(vp, 'login', await ev(base.JS_LOGIN, 120))
                    await asyncio.sleep(3)
                if 'lobby' in SCREENS:
                    await snap('lobby')
                if 'battle' in SCREENS:
                    print(vp, 'battle', (await ev(us.JS_BATTLE2, 240) or '')[:160])
                    await asyncio.sleep(3)
                    await snap('battle')
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{base.PORT}/json/close/{t['id']}", timeout=5)
            except Exception:
                pass
    finally:
        proc.terminate()


if __name__ == '__main__':
    asyncio.run(main())
