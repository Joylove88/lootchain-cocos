# -*- coding: utf-8 -*-
"""正式包(7460)手机参数 + CPU 降速:进场加载门逐资源耗时 / 最长卡顿,进场后怪物逐帧屏幕位移(查"一卡一卡")。
用法:python gate_move_probe.py <tag> [mode=smooth|ultra] [--cpu 4] [--fps 60] [--dpr 2.6]"""
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



CPU = float(OPT('--cpu', '4'))
DPR = float(OPT('--dpr', '2.6'))

INSTR = r"""(() => { const cc = window.__cc; if (window.__instr) return 'already'; window.__instr = true;
  window.__loads = []; const L = window.__loads; const t0 = performance.now(); window.__t0 = t0;
  const orig = cc.resources.load.bind(cc.resources);
  cc.resources.load = function () { const args = Array.from(arguments); const rec = { p: String(args[0]).slice(-60), s: Math.round(performance.now() - t0), e: -1 }; L.push(rec);
    for (let i = args.length - 1; i >= 1; i--) { if (typeof args[i] === 'function') { const cb = args[i]; args[i] = function (err) { rec.e = Math.round(performance.now() - t0); rec.err = !!err; const c0 = performance.now(); const r = cb.apply(this, arguments); rec.cb = Math.round(performance.now() - c0); return r; }; break; } }
    return orig.apply(null, args); };
  window.__ft = []; let last = performance.now();
  const tick = () => { const n = performance.now(); window.__ft.push([Math.round(n - t0), Math.round(n - last)]); last = n; requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return 'instr ok'; })()"""

GATE = r"""(() => { const L = window.__loads || [], ft = window.__ft || [];
  const g0 = window.__gateStart || 0, g1 = window.__gateEnd || performance.now() - window.__t0;
  const inGate = L.filter(x => x.s >= g0 - 50 && x.s <= g1);
  const slow = inGate.filter(x => x.e >= 0).map(x => [x.e - x.s, x.cb || 0, x.p]).sort((a, b) => b[0] - a[0]).slice(0, 12);
  const cbHeavy = inGate.filter(x => (x.cb || 0) > 30).map(x => [x.cb, x.p]).sort((a, b) => b[0] - a[0]).slice(0, 10);
  const gaps = ft.filter(x => x[0] >= g0 && x[0] <= g1 && x[1] > 100).map(x => x[1]);
  return JSON.stringify({ gateMs: Math.round(g1 - g0), loads: inGate.length, pending: inGate.filter(x => x.e < 0).map(x => x.p).slice(0, 8), slowest: slow, heavyCallbacks: cbHeavy, framesOver100: gaps.length, worstFrame: Math.max(0, ...gaps), sumOver100: gaps.reduce((a, b) => a + b, 0) }); })()"""

ENTER2 = ENTER.replace("const gate = []; const g0 = performance.now();", "const gate = []; const g0 = performance.now(); window.__gateStart = g0 - window.__t0;").replace("window.__gateEnd = performance.now();", "window.__gateEnd = performance.now() - window.__t0;")
assert ENTER2 != ENTER

MOVE = r"""(async (withHeroes, secs) => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp = 1e9;
  if (withHeroes) { for (let i = 0; i < 16 && s.heroes.length < 5; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(250); } }
  for (let k = 0; k < 10; k++) s.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: s.timeMs + 40 + k * 120 });
  await sleep(1500);
  const rec = []; let last = performance.now();
  const D = cc.director; const fn = () => { const n = performance.now(); const row = [Math.round((n - last) * 10) / 10];
    let k = 0; for (const [id, v] of r.monsterViews) { if (k >= 6) break; if (v.interp && v.node && v.node.isValid) { row.push(id, Math.round(v.node.position.x * 10) / 10); k++; } }
    rec.push(row); last = n; };
  D.on(cc.Director.EVENT_AFTER_DRAW, fn);
  await sleep(secs * 1000); D.off(cc.Director.EVENT_AFTER_DRAW, fn);
  const series = new Map(); rec.forEach((row, i) => { for (let j = 1; j < row.length; j += 2) { const id = row[j]; if (!series.has(id)) series.set(id, []); series.get(id).push([i, row[0], row[j + 1]]); } });
  const stats = []; for (const [id, arr] of series) { if (arr.length < 30) continue; const v = []; let stall = 0, back = 0;
    for (let i = 1; i < arr.length; i++) { if (arr[i][0] !== arr[i - 1][0] + 1) continue; const dx = arr[i][2] - arr[i - 1][2]; const dt = arr[i][1]; if (Math.abs(dx) < 0.05) stall++; if (dx > 0.3) back++; v.push(-dx / Math.max(1, dt)); }
    v.sort((a, b) => a - b); const med = v[Math.floor(v.length / 2)]; const p10 = v[Math.floor(v.length * 0.1)], p90 = v[Math.floor(v.length * 0.9)];
    stats.push({ id, frames: arr.length, stallPct: Math.round(stall / arr.length * 100), backPct: Math.round(back / arr.length * 100), medV: +med.toFixed(4), spread: +((p90 - p10) / Math.max(1e-6, Math.abs(med))).toFixed(2) }); }
  const dts = rec.map(x => x[0]).sort((a, b) => a - b);
  return JSON.stringify({ heroes: s.heroes.length, frames: rec.length, dtMed: dts[Math.floor(dts.length / 2)], dtP95: dts[Math.floor(dts.length * 0.95)], dtMax: dts[dts.length - 1], monsters: stats.slice(0, 6) }); })"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1000,500'] + (['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] if os.environ.get('QA_GPU') else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']) + ['about:blank'])
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
                        d = m['params']['exceptionDetails']; s = (d.get('exception', {}).get('description') or d.get('text', ''))[:500]
                        if s not in exc and len(exc) < 8:
                            exc.append(s)
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            await call('Runtime.enable'); await call('Page.enable')
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': DPR, 'mobile': True,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': PRE})
            await call('Page.navigate', {'url': URL})
            await asyncio.sleep(6)
            print(await ev(base.JS_BOOT), flush=True)
            print(await ev(base.JS_LOGIN), flush=True)
            await asyncio.sleep(12)
            print(await ev(INSTR), flush=True)
            if CPU > 1:
                await call('Emulation.setCPUThrottlingRate', {'rate': CPU})
            print('ENTER', (await ev(ENTER2) or '')[:160], flush=True)
            print('GATE', await ev(GATE), flush=True)
            print('MOVE plain', await ev(MOVE + '(false, 6)'), flush=True)
            print('MOVE heroes', await ev(MOVE + '(true, 8)'), flush=True)
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
