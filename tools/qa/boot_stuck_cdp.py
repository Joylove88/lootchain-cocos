# -*- coding: utf-8 -*-
"""正式包手机路径:登录 → 刷新(恢复会话),逐秒记录 currentView、异常与报错,截最终画面。用法:python boot_stuck_cdp.py <url> <mode:ultra|smooth> <tag>"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
URL, MODE, TAG = sys.argv[1], sys.argv[2], sys.argv[3]
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
WATCH = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const seq = [];
  let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(500); } }
  if (!cc) return JSON.stringify({err: 'no cc'}); window.__cc = cc;
  const findRoot = () => { const s = cc.director.getScene(); if (!s) return null; let f = null; const w = n => { if (f) return; const c = n.getComponent && n.getComponent('LootChainGameRoot'); if (c) { f = c; return; } n.children.forEach(w); }; w(s); return f; };
  const t0 = performance.now(); let last = '';
  for (let i = 0; i < __SECS__ * 4; i++) { const r = findRoot(); if (r) window.__root = r;
    let loginBtn = false; const sc = cc.director.getScene(); if (sc) { const w = n => { if (loginBtn) return; if (n.name === 'MainAccountLoginButton' || n.name === 'LoginAccountSubmitButton') { loginBtn = true; return; } n.children.forEach(w); }; w(sc); }
    const v = r ? (r.currentView + (r.bootPreloadActive ? '+preload' : '') + (loginBtn ? '+LOGINUI' : '')) : 'noroot';
    if (v !== last) { seq.push([Math.round((performance.now() - t0) / 100) / 10, v]); last = v; }
    if (r && r.currentView === 'lobby' && !r.bootPreloadActive) { await sleep(9000); break; } await sleep(250); }
  const r = window.__root; return JSON.stringify({ seq, view: r && r.currentView, loading: r && r.lobbyLoadingFlow && r.lobbyLoadingFlow.state, logo: !!document.getElementById('splash'), bg: (() => { const out = []; const w = n => { if (/^Lobby_BG|Poster|LobbyBackground/i.test(n.name)) out.push(n.name + ':' + n.active); n.children.forEach(w); }; w(cc.director.getScene()); return out; })(), ctl: (() => { const c = window.__root.lobbyBackgroundController; return { poster: !!c.posterFrame, rendered: !!c.renderedPosterFrame, posterNode: !!(c.posterNode && c.posterNode.isValid), fb: !!(c.fallbackNode && c.fallbackNode.isValid) }; })(), posterCached: !!cc.resources.get('lobby/lobby_bg_poster/spriteFrame', cc.SpriteFrame) });
})()"""
async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run', '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try: urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception: time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0; errs = []
            async def call(method, params=None, timeout=600):
                nonlocal seq
                seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']; errs.append('EXC ' + (d.get('exception', {}).get('description') or d.get('text', ''))[:400])
                    elif m.get('method') == 'Runtime.consoleAPICalled' and m['params']['type'] in ('error', 'warning'):
                        errs.append(m['params']['type'].upper() + ' ' + ' '.join(str(a.get('value', a.get('description', '')))[:300] for a in m['params']['args']))
                    if m.get('id') == my: return m
            await call('Runtime.enable'); await call('Page.enable')
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2.6, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': f"try{{localStorage.setItem('lootchain.graphics.mode','{MODE}');localStorage.removeItem('lootchain.graphics.fps');localStorage.setItem('lootchain.bootPreload.version','976fa');localStorage.setItem('lootchain.fullPack.version','976fa')}}catch(e){{}}"})
            for phase in ('first', 'reload'):
                errs.clear()
                await call('Page.navigate', {'url': URL})
                await asyncio.sleep(0.2)
                r = await call('Runtime.evaluate', {'expression': WATCH.replace('__SECS__', '120'), 'awaitPromise': True, 'returnByValue': True})
                print(phase, 'WATCH', r['result']['result'].get('value'))
                if phase == 'first':
                    r = await call('Runtime.evaluate', {'expression': base.JS_LOGIN, 'awaitPromise': True, 'returnByValue': True})
                    print(phase, 'LOGIN', r['result']['result'].get('value'))
                    await asyncio.sleep(8)
                v = await call('Runtime.evaluate', {'expression': 'window.__root && window.__root.currentView', 'returnByValue': True})
                print(phase, 'VIEW', v['result']['result'].get('value'))
                for e in errs[:25]: print('  ', e)
                shot = await call('Page.captureScreenshot', {'format': 'png'})
                open(os.path.join(base.SCRATCH, 'shots', f'{TAG}_{phase}.png'), 'wb').write(base64.b64decode(shot['result']['data']))
    finally:
        proc.terminate()
asyncio.run(main())
