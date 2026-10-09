# -*- coding: utf-8 -*-
"""正式包(7460)手机参数 + CPU 降速:名册首开素材加载门里点右上角 ×,看是否卡死(2026-10-09 用户手机实测)。
用法:python gate_close_probe.py <tag> [mode] [--cpu 6]"""
import asyncio, base64, collections, glob, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
TAG = sys.argv[1]
_pos = [a for a in sys.argv[2:] if not a.startswith('--') and not (sys.argv[sys.argv.index(a) - 1].startswith('--'))]
MODE = _pos[0] if _pos else 'smooth'
ARGS = sys.argv[1:]
OPT = lambda k, d: ARGS[ARGS.index(k) + 1] if k in ARGS else d
URL = 'http://localhost:7460/'
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
VER = json.load(open(glob.glob('D:/project/lootchain-cocos/build/web-mobile/src/settings.*.json')[0], encoding='utf-8'))['assets']['bundleVers']['resources']
PRE = ("try{localStorage.setItem('lootchain.graphics.mode','%s');localStorage.setItem('lootchain.graphics.fps','%s');"
       "localStorage.setItem('lootchain.bootPreload.version','%s');localStorage.setItem('lootchain.fullPack.version','%s')}catch(e){}") % (MODE, OPT('--fps', '60'), VER, VER)

ENTER = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const cc = window.__cc, root = window.__root;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  const log = [];
  for (const code of ['DAILY_DUNGEON_3', 'DAILY_ABYSS_3', 'DAILY_ARCANE_3', 'DAILY_AWAKEN_3', 'DAILY_FORGE_3']) {
    try { root.openLobbyBattlePreviewPanel(code); } catch (e) { log.push(code + ' openerr ' + e.message); continue; }
    for (let k = 0; k < 6 && root.currentView !== 'battle'; k++) { await sleep(800);
      const ch = find('BattleChallengeDialogChallengeButton'); if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); continue; }
      const b = find('LobbyAdventureFormationButton'); if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); } }
    const gate = []; const g0 = performance.now(); let lastKey = '';
    for (let i = 0; i < 480; i++) { const st = root.currentLobbyBattleState();
      const key = (st.assetsLoading ? 'L' : '-') + st.assetsLoadedCount + '/' + st.assetsTotalCount + (st.error ? ' ERR ' + st.error : '');
      if (key !== lastKey) { gate.push([Math.round(performance.now() - g0), key]); lastKey = key; }
      if (st.error) break; const r = root.lobbyGuardBattleRenderer; if (r && r.sim && !st.assetsLoading) break; await sleep(250); }
    const st = root.currentLobbyBattleState();
    log.push(code + ' view=' + root.currentView + ' err=' + (st.error || '') + ' gateMs=' + Math.round(performance.now() - g0) + ' gate=' + JSON.stringify(gate.slice(0, 60)));
    if (root.lobbyGuardBattleRenderer && root.lobbyGuardBattleRenderer.sim) { window.__gr = root.lobbyGuardBattleRenderer; window.__gateEnd = performance.now(); break; }
    try { root.currentView = 'lobby'; root.renderCurrentView(); } catch (e) {}
    await sleep(1500);
  }
  return log.join('\n'); })()"""




DPR = float(OPT('--dpr', '2.6'))
CPU = float(OPT('--cpu', '6'))

OPEN_HEROES = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const root = window.__root; const cc = window.__cc;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  root.openLobbyHeroRosterPanel();
  let gate = null; for (let i = 0; i < 40 && !gate; i++) { await sleep(100); gate = find('SceneAssetLoading'); }
  const back = find('SceneAssetLoadingBack');
  return JSON.stringify({ view: root.currentView, gate: !!gate, back: !!back, backHasButton: !!(back && back.getComponent(cc.Button)) }); })()"""

CLICK_BACK = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const root = window.__root; const cc = window.__cc;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  const back = find('SceneAssetLoadingBack'); if (!back) return 'no back';
  const b = back.getComponent(cc.Button); b.node.emit(cc.Button.EventType.CLICK, b);
  await sleep(2500);
  const gate = find('SceneAssetLoading'); const hud = find('LobbyHud') || find('LobbyHudRoot');
  return JSON.stringify({ view: root.currentView, gateStill: !!gate, uiChildren: root.node.children.length, names: root.node.children.slice(0, 12).map(n => n.name) }); })()"""

TICK = r"""(() => { const a = window.__ft || []; const n = performance.now(); const recent = a.filter(x => x[0] > n - window.__t0 - 3000); return JSON.stringify({ framesLast3s: recent.length, worstGap: Math.max(0, ...recent.map(x => x[1])) }); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    exc = []
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
                    if m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']; s = (d.get('exception', {}).get('description') or d.get('text', ''))[:600]
                        if s not in exc and len(exc) < 8:
                            exc.append(s)
                    if m.get('method') == 'Runtime.consoleAPICalled' and m['params'].get('type') in ('error', 'warning'):
                        s = ' '.join(str(a.get('value', a.get('description', '')))[:200] for a in m['params'].get('args', []))
                        if s and s not in exc and len(exc) < 12:
                            exc.append('console.' + m['params']['type'] + ': ' + s)
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 80})
                open(os.path.join(base.SCRATCH, 'shots', f'{TAG}_{name}.jpg'), 'wb').write(base64.b64decode(m['result']['data']))

            await call('Runtime.enable'); await call('Page.enable')
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': DPR, 'mobile': True,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': PRE})
            await call('Page.navigate', {'url': URL})
            await asyncio.sleep(6)
            for _ in range(5):
                print(await ev(base.JS_BOOT), flush=True)
                ok = await ev("!!(window.__root && window.__cc)")
                if ok is True:
                    break
                await asyncio.sleep(3)
            print(await ev(base.JS_LOGIN), flush=True)
            for _ in range(30):
                if (await ev("!!(window.__root && window.__root.currentView === 'lobby')")) is True:
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(4)
            await ev("(() => { window.__ft = []; window.__t0 = performance.now(); let last = performance.now(); const tick = () => { const n = performance.now(); window.__ft.push([n - window.__t0, n - last]); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()")
            if CPU > 1:
                await call('Emulation.setCPUThrottlingRate', {'rate': CPU})
            if '--after-battle' in ARGS:
                await call('Emulation.setCPUThrottlingRate', {'rate': 1})
                print('ENTER', (await ev(ENTER) or '')[:100], flush=True)
                await asyncio.sleep(4)
                print('EXIT', await ev("(async () => { window.__root.returnToLobbyFromBattlePreview(); await new Promise(z => setTimeout(z, 2500)); return window.__root.currentView; })()"), flush=True)
                await call('Emulation.setCPUThrottlingRate', {'rate': CPU})
            print('OPEN', await ev(OPEN_HEROES), flush=True)
            for k in range(8):
                await asyncio.sleep(0.6)
                print('PROG', await ev("(() => { const c = window.__root.uiSpriteFrameCache; const p = c.groupProgress('heroes'); const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(window.__cc.director.getScene()); return f; }; return JSON.stringify({ p, gate: !!find('SceneAssetLoading'), view: window.__root.currentView }); })()"), flush=True)
            await shot('gate')
            print('BACK', await ev(CLICK_BACK), flush=True)
            await shot('after_back')
            print('TICK', await ev(TICK), flush=True)
            await asyncio.sleep(4)
            print('TICK2', await ev(TICK), flush=True)
            print('VIEW2', await ev("JSON.stringify({ view: window.__root.currentView, children: window.__root.node.children.map(n => n.name).slice(0, 12) })"), flush=True)
            await shot('after_back2')
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
