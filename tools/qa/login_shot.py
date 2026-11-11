# -*- coding: utf-8 -*-
"""登录首页 + 账号登录框截图(11-11 登录页 B 风格改版留底 / 自验)。
有会话的 profile 会直进大厅:先 logoutToLoginPage 再截。
用法:PREVIEW_PORT=7456 python login_shot.py <输出目录> [pc|phone]  → <目录>/login_<视口>.png、login_account_<视口>.png"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1]
ONLY = sys.argv[2] if len(sys.argv) > 2 else ''
os.makedirs(OUT, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } window.__cc = cc; return cc ? 'ok' : 'fail'; })()"""
ROOT = "let root=null; window.__cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"


async def shoot(mobile: bool, suffix: str) -> None:
    profile = base.PROFILE + '_login'
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(body):
                r = await call('Runtime.evaluate', {'expression': '(()=>{ ' + ROOT + ' ' + body + ' })()', 'returnByValue': True}, 120)
                return r.get('result', {}).get('result', {}).get('value')

            if mobile:
                await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            else:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': "window.__lcConsoleErrors = []; const _e = console.error.bind(console); console.error = (...a) => { try { window.__lcConsoleErrors.push(a.map(String).join(' ').slice(0, 200)); } catch (x) {} _e(...a); }; window.addEventListener('error', (ev) => window.__lcConsoleErrors.push('onerror ' + ev.message));"})
            await call('Runtime.enable')
            await call('Page.navigate', {'url': base.PAGE})
            await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            v = None
            for _ in range(300):
                v = await ev("return root && !root.bootPreloadActive ? root.currentView : null;")
                if v in ('login', 'loginAccount', 'lobby'):
                    break
                await asyncio.sleep(2)
            if v == 'lobby':
                await ev("root.logoutToLoginPage(); return 1;")
                await asyncio.sleep(6)
                await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
                for _ in range(60):
                    v = await ev("return root && !root.bootPreloadActive ? root.currentView : null;")
                    if v in ('login', 'loginAccount'):
                        break
                    await asyncio.sleep(2)
            print(suffix, 'view', v, flush=True)
            await asyncio.sleep(6)
            errs = await ev("return JSON.stringify((window.__lcConsoleErrors || []).slice(0, 20));")
            print(suffix, 'consoleErrors', errs, flush=True)
            for name, js in (('login', ''), ('login_language', 'root.openLoginLanguageDialog();')):
                if js:
                    await ev(js + ' return 1;')
                    await asyncio.sleep(4)
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}_{suffix}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', name, suffix, flush=True)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


async def main() -> None:
    if ONLY != 'phone':
        await shoot(False, 'pc')
    if ONLY != 'pc':
        await shoot(True, 'phone')

asyncio.run(main())
