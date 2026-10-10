# -*- coding: utf-8 -*-
"""守卫战界面巡检(预览 7456):进战场后依次截 三选一 / 战斗中 HUD / 战斗设置 / 胜利或失败结算覆盖层。
结算覆盖层直接调 showEndOverlay 显示,不改 sim.phase,不会向后端提交结算。
用法:PREVIEW_PORT=7456 python battle_tour.py <tag> 915x412m 1600x900 [--defeat]"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

args = sys.argv[1:]
TAG = args[0]
VIEWS = [a for a in args[1:] if 'x' in a and not a.startswith('--')]
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle2.js'), encoding='utf-8').read()
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
        for vi, vp in enumerate(VIEWS):
            mobile = vp.endswith('m')
            w, h = [int(v) for v in vp.rstrip('m').split('x')]
            t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
            async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
                seq = 0

                async def call(method, params=None, timeout=600):
                    nonlocal seq
                    seq += 1
                    my = seq
                    await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                    while True:
                        m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                        if m.get('method') == 'Runtime.exceptionThrown':
                            d = m['params']['exceptionDetails']
                            print('  !! page exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:500], flush=True)
                        if m.get('id') == my:
                            return m

                async def ev(expr, timeout=600):
                    r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                    return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

                async def shot(name):
                    m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                    if 'result' in m:
                        open(os.path.join(SHOTS, f'{TAG}_{vp}_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print(vp, 'shot', name, flush=True)

                await call('Runtime.enable')
                await call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                                   'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                if mobile:
                    await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                    await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
                await call('Page.navigate', {'url': base.PAGE})
                await asyncio.sleep(8)
                print(vp, 'boot', await ev(base.JS_BOOT, 900), flush=True)
                await shot('login')
                await ev("(async () => { const cc = window.__cc, root = window.__root; let btn = null; const w = n => { if (btn) return; if (n.name === 'MainAccountLoginButton') { btn = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); if (btn) btn.emit(cc.Button.EventType.CLICK); for (let i = 0; i < 40 && root.currentView !== 'loginAccount'; i++) await new Promise(z => setTimeout(z, 300)); await new Promise(z => setTimeout(z, 1500)); return root.currentView; })()", 60)
                await shot('login_account')
                print(vp, 'login', await ev(base.JS_LOGIN, 120), flush=True)
                print(vp, 'battle', (await ev(JS_BATTLE, 600) or '')[:120], flush=True)
                await asyncio.sleep(3)
                if await ev("!!(window.__gr && window.__gr.sim && window.__gr.sim.pendingChoice)"):
                    await shot('choice')
                    await ev("(() => { const r = window.__gr; window.__M.guardSkipChoice(r.sim); return 1; })()")
                await asyncio.sleep(12)
                await ev("(() => { const r = window.__gr; if (r.sim.pendingChoice) window.__M.guardSkipChoice(r.sim); return 1; })()")
                await asyncio.sleep(2)
                await shot('hud')
                # 强化触发三选一(词条只从强化来)
                await ev("(async () => { const r = window.__gr; r.sim.gold += 2000; window.__M.guardEnhance(r.sim); await new Promise(z => setTimeout(z, 2000)); return !!r.sim.pendingChoice; })()")
                await shot('choice')
                await ev("(() => { const r = window.__gr; if (r.sim.pendingChoice) window.__M.guardSkipChoice(r.sim); return 1; })()")
                await asyncio.sleep(1)
                await ev("(async () => { const r = window.__gr; r.openBattleSettings(); await new Promise(z => setTimeout(z, 1500)); return 1; })()")
                await shot('settings')
                victory = not ('--defeat' in args or vi % 2 == 1)
                print(vp, 'end', await ev("(async () => { const r = window.__gr, cc = window.__cc; let n = null; const w = x => { if (n) return; if (x.name === 'GuardSheetClose') { n = x; return; } x.children.forEach(w); }; w(r.root); if (n) n.emit(cc.Node.EventType.TOUCH_END); await new Promise(z => setTimeout(z, 600)); r.sim.paused = true; r.showEndOverlay(%s); await new Promise(z => setTimeout(z, 3500)); return 'ok'; })()" % ('true' if victory else 'false')), flush=True)
                await shot('victory' if victory else 'defeat')
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{base.PORT}/json/close/{t['id']}", timeout=5)
            except Exception:
                pass
    finally:
        proc.terminate()


if __name__ == '__main__':
    asyncio.run(main())
