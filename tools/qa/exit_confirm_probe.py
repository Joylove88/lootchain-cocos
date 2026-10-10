# -*- coding: utf-8 -*-
"""正式包(7460)手机参数:设置 → 退出战斗 → 用真实触摸事件点「确认退出」,看是否回到大厅(2026-10-10 用户「点击确认退出没反应」)。
用法:python exit_confirm_probe.py <tag> [mode]"""
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
  for (const code of ['DAILY_DUNGEON_3', 'MAIN_2_6', 'MAIN_1_8', 'MAIN_1_1']) {
    try { root.openLobbyBattlePreviewPanel(code); } catch (e) { log.push(code + ' openerr ' + e.message); continue; }
    for (let k = 0; k < 6 && root.currentView !== 'battle'; k++) { await sleep(800);
      const ch = find('BattleChallengeDialogChallengeButton'); if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); continue; }
      const b = find('LobbyAdventureFormationButton'); if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); } }
    const gate = []; const g0 = performance.now(); let lastKey = '';
    for (let i = 0; i < 60; i++) { const st = root.currentLobbyBattleState();
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

OPEN = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr; cc.game.resume();
  const find = (root, name) => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(root); return f; };
  const btn = find(r.root, 'GuardSettingsButton'); if (btn) btn.emit(cc.Node.EventType.TOUCH_END); await sleep(600);
  const exit = find(cc.director.getScene(), 'GuardSettingsExit'); if (exit) exit.emit(cc.Node.EventType.TOUCH_END); await sleep(700);
  const ok = find(cc.director.getScene(), 'GuardExitConfirmOk');
  if (!ok) return JSON.stringify({ fail: 'no ok button', settings: !!find(cc.director.getScene(), 'GuardSettingsOverlay') });
  const ui = ok.getComponent(cc.UITransform); const wp = ok.getWorldPosition();
  const vp = cc.view.getViewportRect(); const sx = cc.view.getScaleX(), sy = cc.view.getScaleY();
  const canvas = document.getElementById('GameCanvas'); const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  const px = vp.x + wp.x * sx, py = vp.y + wp.y * sy;
  const cssX = rect.left + px / dpr, cssY = rect.top + (canvas.height - py) / dpr;
  // 命中测试:这个点上最上层接收触摸的节点是谁
  const hits = []; const walk = n => { if (!n.activeInHierarchy) return; const t = n.getComponent(cc.UITransform); if (t && t.hitTest && t.hitTest(new cc.Vec2(px / (canvas.width / canvas.width), py))) hits.push(n.name); n.children.forEach(walk); };
  try { walk(cc.director.getScene()); } catch (e) { hits.push('ERR ' + e.message); }
  return JSON.stringify({ hitsTail: hits.slice(-8), view: window.__root.currentView, okSize: [Math.round(ui.width), Math.round(ui.height)], cssX, cssY, settingsStill: !!find(cc.director.getScene(), 'GuardSettingsOverlay'), exitOpen: r.exitConfirmOpen }); })()"""


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
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:500] if 'exceptionDetails' in r else r.get('result', {}).get('value')

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
                if (await ev("!!(window.__root && window.__cc)")) is True:
                    break
                await asyncio.sleep(3)
            print(await ev(base.JS_LOGIN), flush=True)
            for _ in range(30):
                if (await ev("!!(window.__root && window.__root.currentView === 'lobby')")) is True:
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(4)
            print('ENTER', (await ev(ENTER) or '')[:1500], flush=True)
            print('STATE', await ev("JSON.stringify({ view: window.__root.currentView, status: (window.__root.lastStatusText || ''), st: (() => { const s = window.__root.currentLobbyBattleState(); return { error: s.error, loading: s.assetsLoading, start: !!s.start }; })() })"), flush=True)
            await asyncio.sleep(3)
            out = await ev(OPEN)
            print('OPEN', out, flush=True)
            await shot('exit_open')
            try:
                d = json.loads(out)
            except Exception:
                return
            x, y = d['cssX'], d['cssY']
            if '--emit' in ARGS:
                print('EMIT', await ev("(async () => { const cc = window.__cc; let ok = null; const w = n => { if (ok) return; if (n.name === 'GuardExitConfirmOk') { ok = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); ok.emit(cc.Node.EventType.TOUCH_END); await new Promise(z => setTimeout(z, 2500)); return window.__root.currentView; })()"), flush=True)
                return
            # 真实触摸:按下 → 抬起
            await call('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
            await asyncio.sleep(0.08)
            await call('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            await asyncio.sleep(2.5)
            print('AFTER', await ev("JSON.stringify({ view: window.__root.currentView, exitOpen: window.__gr && window.__gr.exitConfirmOpen, hasBattleRoot: (() => { let f = false; const w = n => { if (n.name === 'LobbyGuardBattleRoot') f = true; n.children.forEach(w); }; w(window.__cc.director.getScene()); return f; })() })"), flush=True)
            await shot('after_tap')
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
