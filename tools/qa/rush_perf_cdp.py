# -*- coding: utf-8 -*-
"""正式包(7460)手机参数车轮战测量:加载门逐资源耗时 + 每 10 秒帧间隔 / 显存 / 节点 / 骨骼数 + 战斗中 CPU 剖析。
用法:python rush_perf_cdp.py <tag> [mode=smooth] [secs=150]"""
import asyncio, base64, collections, glob, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
TAG = sys.argv[1]
MODE = sys.argv[2] if len(sys.argv) > 2 else 'smooth'
SECS = int(sys.argv[3]) if len(sys.argv) > 3 else 150
URL = 'http://localhost:7460/'
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
VER = json.load(open(glob.glob('D:/project/lootchain-cocos/build/web-mobile/src/settings.*.json')[0], encoding='utf-8'))['assets']['bundleVers']['resources']
PRE = ("try{localStorage.setItem('lootchain.graphics.mode','%s');localStorage.setItem('lootchain.graphics.fps','30');"
       "localStorage.setItem('lootchain.bootPreload.version','%s');localStorage.setItem('lootchain.fullPack.version','%s')}catch(e){}") % (MODE, VER, VER)

INSTR = r"""(() => { const cc = window.__cc; if (window.__instr) return 'already';
  window.__instr = true; window.__loads = []; const L = window.__loads; const t0 = performance.now();
  const orig = cc.resources.load.bind(cc.resources);
  cc.resources.load = function () { const args = Array.from(arguments); const rec = { p: String(args[0]).slice(0, 90), s: Math.round(performance.now() - t0), e: -1 }; L.push(rec);
    for (let i = args.length - 1; i >= 1; i--) { if (typeof args[i] === 'function') { const cb = args[i]; args[i] = function (err) { rec.e = Math.round(performance.now() - t0); rec.err = !!err; return cb.apply(this, arguments); }; break; } }
    return orig.apply(null, args); };
  window.__ft = []; let last = performance.now();
  const tick = () => { const n = performance.now(); window.__ft.push([Math.round(n - t0), Math.round(n - last)]); last = n; requestAnimationFrame(tick); };
  requestAnimationFrame(tick); window.__t0 = t0; return 'instr ok'; })()"""

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

LOADS = r"""(() => { const L = window.__loads || [];
  const pend = L.filter(x => x.e < 0).map(x => x.p); const done = L.filter(x => x.e >= 0).map(x => [x.e - x.s, x.p, x.s]).sort((a, b) => b[0] - a[0]);
  return JSON.stringify({ total: L.length, pending: pend.length, pendingSample: pend.slice(0, 15), slowest: done.slice(0, 20), errs: L.filter(x => x.err).map(x => x.p).slice(0, 10) }); })()"""

AUTO = r"""(() => { const cc = window.__cc, r = window.__gr; cc.game.resume();
  window.__auto = setInterval(() => { try { const s = r.sim; if (!s) return; s.crystalHp = s.crystalMaxHp; s.gold = Math.max(s.gold, 5000);
    const root = r.root; if (!root) return;
    const ov = root.getChildByName('GuardChoiceOverlay');
    if (ov) { const idx = s.pendingChoice ? Math.max(0, s.pendingChoice.findIndex(o => o.rarity === 'gold')) : 0;
      const c = ov.getChildByName('GuardChoiceCard_' + idx) || ov.getChildByName('GuardChoiceCard_0'); if (c) c.emit(cc.Node.EventType.TOUCH_END); return; }
    const sb = root.getChildByName('GuardSummonButton'); if (sb && Math.random() < 0.6) sb.emit(cc.Node.EventType.TOUCH_END);
    const eb = root.getChildByName('GuardEnhanceButton'); if (eb && Math.random() < 0.5) eb.emit(cc.Node.EventType.TOUCH_END);
  } catch (e) { window.__autoErr = String(e && e.stack || e).slice(0, 300); } }, 600);
  window.__ultCasts = []; let prev = 0;
  setInterval(() => { const n = r.ultFxLive || 0; if (n > prev) window.__ultCasts.push(Math.round(performance.now() - window.__t0)); prev = n; }, 50);
  return 'auto on mode=' + (r.sim && r.sim.mode); })()"""

SAMPLE = r"""(() => { const cc = window.__cc, r = window.__gr, s = r && r.sim; const ms = cc.director.root.device.memoryStatus;
  let nodes = 0, sk = 0, skRT = 0, gfx = 0, lbl = 0;
  const w = n => { nodes++; const k = n.getComponent(cc.sp.Skeleton); if (k) { sk++; if (!k.isAnimationCached()) skRT++; } if (n.getComponent(cc.Graphics)) gfx++; if (n.getComponent(cc.Label)) lbl++; n.children.forEach(w); };
  w(cc.director.getScene());
  const now = performance.now() - window.__t0; const ft = (window.__ft || []).filter(x => x[0] > now - 10000).map(x => x[1]);
  return JSON.stringify({ t: s ? Math.round(s.timeMs / 1000) : -1, layer: s ? (s.bossKills || 0) + s.wave : -1, mon: s ? s.monsters.filter(m => !m.dead).length : 0, heroes: s ? s.heroes.length : 0,
    texMB: Math.round(ms.textureSize / 1048576), bufMB: Math.round(ms.bufferSize / 1048576), nodes, sk, skRT, gfx, lbl,
    fps: Math.round(ft.length / 10), gapsOver100: ft.filter(x => x > 100).length, worst: Math.max(0, ...ft), ultLive: r.ultFxLive, autoErr: window.__autoErr || '' }); })()"""


def summarize(prof, out):
    nodes = {n['id']: n for n in prof['nodes']}
    parent = {}
    for n in prof['nodes']:
        for c in n.get('children', []):
            parent[c] = n['id']
    self_us = collections.Counter()
    for nid, d in zip(prof['samples'], prof['timeDeltas']):
        self_us[nid] += d
    total = sum(prof['timeDeltas']) or 1
    by = collections.Counter()
    for nid, us in self_us.items():
        cf = nodes[nid]['callFrame']
        by[(cf.get('functionName') or '(anon)') + ':' + str(cf.get('lineNumber')) + ':' + cf.get('url', '')[-24:]] += us
    incl = collections.Counter()
    for nid, us in self_us.items():
        seen = set(); cur = nid
        while cur is not None:
            cf = nodes[cur]['callFrame']
            fn = (cf.get('functionName') or '(anon)') + ':' + cf.get('url', '')[-18:]
            if fn not in seen:
                incl[fn] += us; seen.add(fn)
            cur = parent.get(cur)
    out('PROFILE self top:')
    for k, us in by.most_common(28):
        out('  %5.1f%% %s' % (us / total * 100, k))
    out('PROFILE inclusive top:')
    for k, us in incl.most_common(50):
        out('  %5.1f%% %s' % (us / total * 100, k))


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
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2.6, 'mobile': True,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': PRE})
            await call('Page.navigate', {'url': URL})
            await asyncio.sleep(6)
            print(await ev(base.JS_BOOT), flush=True)
            print(await ev(base.JS_LOGIN), flush=True)
            await asyncio.sleep(12)
            print('canvas', await ev("JSON.stringify([document.getElementById('GameCanvas').width, document.getElementById('GameCanvas').height, window.devicePixelRatio])"), flush=True)
            print(await ev(INSTR), flush=True)
            print('ENTER', await ev(ENTER), flush=True)
            print('LOADS', await ev(LOADS), flush=True)
            print(await ev(AUTO), flush=True)
            t0 = time.time(); profiled = False
            while time.time() - t0 < SECS:
                await asyncio.sleep(10)
                print(f'[{time.time() - t0:4.0f}s]', await ev(SAMPLE), flush=True)
                if not profiled and time.time() - t0 > SECS * 0.45:
                    profiled = True
                    await call('Profiler.enable'); await call('Profiler.setSamplingInterval', {'interval': 400}); await call('Profiler.start')
                    await asyncio.sleep(20)
                    prof = (await call('Profiler.stop'))['result']['profile']
                    json.dump(prof, open(os.path.join(base.SCRATCH, f'{TAG}_profile.json'), 'w'))
                    summarize(prof, lambda s: print(s, flush=True))
            print('ult casts at ms:', await ev('JSON.stringify(window.__ultCasts)'))
            print('frame gaps >150ms (t, gap):', await ev("JSON.stringify((window.__ft||[]).filter(x => x[1] > 150).slice(-80))"))
            shot = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 70})
            open(os.path.join(base.SCRATCH, 'shots', f'{TAG}.jpg'), 'wb').write(base64.b64decode(shot['result']['data']))
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
