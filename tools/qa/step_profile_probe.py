# -*- coding: utf-8 -*-
"""正式包(7460)手机参数 + CPU 降速:战斗中每个同步函数的耗时 / 调用数 / 最大值,带 step 与不带 step 的帧时长分布,每秒新建节点与组件数。
用法:python step_profile_probe.py <tag> [mode] [--cpu 4] [--fps 60] [--secs 12]"""
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
SECS = int(OPT('--secs', '12'))

PROF = r"""(async (secs) => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp = 1e9;
  for (let i = 0; i < 16 && s.heroes.length < 5; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(250); }
  for (let k = 0; k < 12; k++) s.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: s.timeMs + 40 + k * 100 });
  await sleep(1500);
  const names = ['step','consumeEvents','syncHeroes','syncResonance','syncMonsters','syncChests','syncPickups','syncZones','refreshCallWaveButton','refreshSpellBar','syncTraps','refreshTrapTray','syncBossCastBar','syncChoiceOverlay','refreshHud','updateProjectiles','interpolateMonsterViews','spawnFloater','playUnitAttack','spawnGuardSkillFx','spawnAttackProjectile'];
  const acc = {}, orig = {};
  for (const n of names) { if (typeof r[n] !== 'function') continue; orig[n] = r[n]; acc[n] = { t: 0, c: 0, max: 0 };
    r[n] = function () { const a = performance.now(); try { return orig[n].apply(this, arguments); } finally { const d = performance.now() - a; const x = acc[n]; x.t += d; x.c++; if (d > x.max) x.max = d; if (n === 'step') window.__stepRan = d; } }; }
  const comp = {}; const origAdd = cc.Node.prototype.addComponent;
  cc.Node.prototype.addComponent = function (t) { const k = typeof t === 'string' ? t : (t && t.name) || '?'; comp[k] = (comp[k] || 0) + 1; return origAdd.apply(this, arguments); };
  let nodesNew = 0; const origCtor = cc.Node; const H = r.host; const oL = H.addChildLabel, oN = H.addChildPlainNode; H.addChildLabel = function () { nodesNew++; return oL.apply(this, arguments); }; H.addChildPlainNode = function () { nodesNew++; return oN.apply(this, arguments); };
  const frames = []; let last = performance.now(); window.__stepRan = 0;
  const raf = () => { const n = performance.now(); frames.push([n - last, window.__stepRan]); window.__stepRan = 0; last = n; if (frames.length < 100000) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const t0 = performance.now(); await sleep(secs * 1000); const T = performance.now() - t0;
  for (const n in orig) r[n] = orig[n]; cc.Node.prototype.addComponent = origAdd; H.addChildLabel = oL; H.addChildPlainNode = oN;
  const rows = Object.entries(acc).filter(([, x]) => x.c > 0).map(([n, x]) => [n, Math.round(x.t), x.c, +(x.t / x.c).toFixed(1), Math.round(x.max), +(x.t / T * 100).toFixed(1)]).sort((a, b) => b[1] - a[1]);
  const withStep = frames.filter(f => f[1] > 0).map(f => f[0]), noStep = frames.filter(f => f[1] === 0).map(f => f[0]);
  const q = (arr, p) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1); };
  let sk = 0, skRT = 0, gfx = 0, lbl = 0, nodes = 0; const w = n => { nodes++; const k = n.getComponent(cc.sp.Skeleton); if (k) { sk++; if (!k.isAnimationCached()) skRT++; } if (n.getComponent(cc.Graphics)) gfx++; if (n.getComponent(cc.Label)) lbl++; n.children.forEach(w); }; w(cc.director.getScene());
  return JSON.stringify({ secs: +(T / 1000).toFixed(1), heroes: s.heroes.length, monsters: s.monsters.filter(m => !m.dead).length, frames: frames.length,
    frameDt: { all: [q(frames.map(f => f[0]), .5), q(frames.map(f => f[0]), .95), q(frames.map(f => f[0]), 1)], withStep: [withStep.length, q(withStep, .5), q(withStep, .95)], noStep: [noStep.length, q(noStep, .5), q(noStep, .95)] },
    perSec: { nodesCreated: Math.round(nodesNew / T * 1000), components: Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, Math.round(v / T * 1000)])) },
    scene: { nodes, skeletons: sk, skeletonsRealtime: skRT, graphics: gfx, labels: lbl },
    fn: rows }); })"""


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
            print('ENTER', (await ev(ENTER) or '')[:120], flush=True)
            if CPU > 1:
                await call('Emulation.setCPUThrottlingRate', {'rate': CPU})
            out = await ev(PROF + f'({SECS})')
            print('PROF', out, flush=True)
            json.dump(json.loads(out) if out and out.startswith('{') else {'raw': out}, open(os.path.join(base.SCRATCH, f'{TAG}_stepprof.json'), 'w'), ensure_ascii=False, indent=1)
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
