# -*- coding: utf-8 -*-
"""正式包(7460)手机参数逐个英雄放专属大招,按片段时间连拍(查实机才有的特效问题,预览 7456 不走正式包路径)。
用法:python ult_release_cdp.py <tag> [mode=smooth|ultra] [--codes A,B] [--frames 5] [--dpr 2.6]"""
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
PRE = ("try{localStorage.setItem('lootchain.graphics.mode','%s');localStorage.setItem('lootchain.graphics.fps','30');"
       "localStorage.setItem('lootchain.bootPreload.version','%s');localStorage.setItem('lootchain.fullPack.version','%s')}catch(e){}") % (MODE, VER, VER)

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


_FXPREV = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fxprev')
PICKS = json.load(open(os.path.join(_FXPREV, 'picks_hu.json'), encoding='utf-8'))
CODES = OPT('--codes', ','.join(PICKS.keys())).split(',')
FRAMES = int(OPT('--frames', '5'))
DPR = float(OPT('--dpr', '2.6'))

CAST = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp; const code = '__CODE__';
  for (let i = 0; i < 60 && (r.ultFxLive > 0); i++) await sleep(100);
  if (s.monsters.filter(m => !m.dead).length < 3) { for (let k = 0; k < 4; k++) s.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: s.timeMs + 40 + k * 30 }); }
  for (let i = 0; i < 40 && s.monsters.filter(m => !m.dead).length < 3; i++) await sleep(100);
  s.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 3.6 + (k % 4) * 0.45; m.speedCellsPerSec = 0; m.hp = 999999; m.maxHp = 999999; });
  for (let i = 0; i < 12 && s.heroes.length < 2; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(300); }
  const hero = s.heroes.find(h => h.role !== 'support') || s.heroes[0]; if (!hero) return 'no hero';
  const mon = s.monsters.find(m => !m.dead) || null;
  r.ultFxLive = 0; const ok = r.spawnGuardSkillFx(code, hero.cell, mon);
  let node = null; for (let i = 0; i < 100 && !node; i++) { await sleep(50); node = r.fieldNode.children.find(c => c.name === 'GuardSkillFx' && c.__lcUltFx && c.getComponent(cc.sp.Skeleton) && c.getComponent(cc.sp.Skeleton).skeletonData); }
  window.__ultNode = node; const sk = node && node.getComponent(cc.sp.Skeleton);
  return JSON.stringify({ code, ok, data: sk && sk.skeletonData.name, pma: sk && sk.premultipliedAlpha, scale: node && +node.scale.x.toFixed(3) }); })()"""

MULTI = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp; const codes = __CODES__;
  for (let i = 0; i < 12 && s.heroes.length < 3; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(300); }
  for (let k = 0; k < 8; k++) s.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: s.timeMs + 40 + k * 30 });
  for (let i = 0; i < 40 && s.monsters.filter(m => !m.dead).length < 6; i++) await sleep(100);
  s.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 3.2 + (k % 6) * 0.4; m.speedCellsPerSec = 0; m.hp = 999999; m.maxHp = 999999; });
  const out = [];
  for (let i = 0; i < codes.length; i++) { const hero = s.heroes[i % s.heroes.length]; const mon = s.monsters.filter(m => !m.dead)[i % 3] || null;
    r.ultFxLive = 0; out.push(codes[i] + ':' + r.spawnGuardSkillFx(codes[i], hero.cell, mon)); await sleep(__GAP__); }
  return out.join(' '); })()"""

TRACK = r"""(() => { const n = window.__ultNode; const sk = n && n.isValid && n.getComponent(window.__cc.sp.Skeleton); const te = sk && sk.getCurrent && sk.getCurrent(0); return te ? +te.trackTime.toFixed(2) : -1; })()"""


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

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 85})
                open(os.path.join(base.SCRATCH, 'shots', f'{TAG}_{name}.jpg'), 'wb').write(base64.b64decode(m['result']['data']))

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
            print('gl', await ev("(() => { const c = document.getElementById('GameCanvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return (gl instanceof WebGL2RenderingContext ? 'webgl2 ' : 'webgl1 ') + (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'); })()"), flush=True)
            print('ENTER', (await ev(ENTER) or '')[:200], flush=True)
            if '--together' in ARGS:
                print('multi', await ev(MULTI.replace('__CODES__', json.dumps(CODES)).replace('__GAP__', OPT('--gap', '250'))), flush=True)
                for k in range(FRAMES):
                    await asyncio.sleep(float(OPT('--every', '0.45')))
                    await ev('window.__cc.game.pause()')
                    await shot(f'multi_{k}')
                    await ev('window.__cc.game.resume()')
                print('page exceptions:', exc)
                return
            for code in CODES:
                pick = PICKS.get(code)
                print('cast', await ev(CAST.replace('__CODE__', code)), flush=True)
                if not pick:
                    continue
                t0, t1 = pick[1], pick[2]
                for k in range(FRAMES):
                    want = t0 + (t1 - t0) * (k + 0.5) / FRAMES
                    for _ in range(200):
                        cur = await ev(TRACK)
                        if cur is None or cur < 0 or cur >= want:
                            break
                        await asyncio.sleep(0.03)
                    await ev('window.__cc.game.pause()')
                    await shot(f'{code}_{k}')
                    await ev('window.__cc.game.resume()')
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
