# -*- coding: utf-8 -*-
"""正式包(7460)手机参数:绘制调用归因(逐类关掉 Graphics / Label / 骨骼 / 精灵再数;骨骼开合批、标签改 BITMAP 各省多少)+ 大厅 / 战场贴图显存按目录账。
用法:python dc_tex_release_probe.py <tag> [mode] [--dpr 2.6] [--lobby-wait 25]"""
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
LOBBY_WAIT = int(OPT('--lobby-wait', '25'))
import re as _re
TEX = _re.search(r'TEX = r"""(.*?)"""', open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'texmem_cdp.py'), encoding='utf-8').read(), _re.S).group(1)
TEX = 'r"""' + TEX + '"""'
TEX = eval(TEX)

DC = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp = 1e9;
  for (let i = 0; i < 16 && s.heroes.length < 5; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(250); }
  for (let k = 0; k < 12; k++) s.pendingSpawns.unshift({ kind: k % 6 === 0 ? 'elite' : 'normal', lane: k % 2, atMs: s.timeMs + 40 + k * 60 });
  for (let i = 0; i < 40 && s.monsters.filter(m => !m.dead).length < 10; i++) await sleep(100);
  s.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 3.0 + (k % 6) * 0.45; m.speedCellsPerSec = 0; m.hp = 999999; m.maxHp = 999999; });
  await sleep(1500);
  const dev = cc.director.root.device;
  const sample = async (n) => { let sum = 0; for (let i = 0; i < (n || 16); i++) { await new Promise(z => requestAnimationFrame(z)); sum += dev.numDrawCalls; } return Math.round(sum / (n || 16)); };
  const comps = (T) => { const out = []; const w = n => { if (!n.activeInHierarchy) return; const c = n.getComponent(T); if (c && c.isValid && c.node) out.push(c); n.children.forEach(w); }; w(cc.director.getScene()); return out; };
  const base = await sample(24);
  const safe = (c, fn) => { try { if (c && c.isValid && c.node && c.node.isValid) fn(c); } catch (e) {} };
  const toggle = async (T, name) => { const cs = comps(T).filter(c => c.enabled); cs.forEach(c => safe(c, x => { x.enabled = false; })); const v = await sample(); cs.forEach(c => safe(c, x => { x.enabled = true; })); await sample(4); return { name, count: cs.length, dcWithout: v, saved: base - v }; };
  const res = [];
  res.push(await toggle(cc.Graphics, 'Graphics'));
  res.push(await toggle(cc.Label, 'Label'));
  res.push(await toggle(cc.sp.Skeleton, 'Skeleton'));
  res.push(await toggle(cc.Sprite, 'Sprite'));
  const sks = comps(cc.sp.Skeleton); const cached = sks.filter(k => k.isAnimationCached());
  const skInfo = sks.filter(k => k.node && k.node.parent).map(k => [k.node.parent.name.replace(/_\d+$/, ''), k.isAnimationCached() ? 'C' : 'R', k.skeletonData ? k.skeletonData.name : '-']);
  cached.forEach(k => safe(k, x => { x.enableBatch = true; })); await sample(4); const dcBatch = await sample(); cached.forEach(k => safe(k, x => { x.enableBatch = false; }));
  const lbls = comps(cc.Label); const prev = lbls.map(l => l.cacheMode);
  const modes = {}; lbls.forEach(l => { const k = ['NONE', 'BITMAP', 'CHAR'][l.cacheMode] || l.cacheMode; modes[k] = (modes[k] || 0) + 1; });
  lbls.forEach(l => safe(l, x => { if (x.cacheMode === cc.Label.CacheMode.NONE) x.cacheMode = cc.Label.CacheMode.BITMAP; })); await sample(4); const dcBitmap = await sample(); lbls.forEach((l, i) => safe(l, x => { x.cacheMode = prev[i]; }));
  const lblNames = {}; lbls.filter(l => l.node).forEach(l => { const k = l.node.name.replace(/_\d+$/, ''); lblNames[k] = (lblNames[k] || 0) + 1; });
  const gfxNames = {}; comps(cc.Graphics).filter(g => g.node).forEach(g => { const k = g.node.name.replace(/_\d+$/, ''); gfxNames[k] = (gfxNames[k] || 0) + 1; });
  return JSON.stringify({ baseDC: base, heroes: s.heroes.length, monsters: s.monsters.filter(m => !m.dead).length, byType: res,
    skeletons: { total: sks.length, cached: cached.length, dcWithBatch: dcBatch, list: skInfo }, labels: { modes, dcWithBitmap: dcBitmap, names: lblNames }, graphics: gfxNames,
    texMB: Math.round(dev.memoryStatus.textureSize / 1048576) }); })()"""


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
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': DPR, 'mobile': True,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': PRE})
            await call('Page.navigate', {'url': URL})
            await asyncio.sleep(6)
            print(await ev(base.JS_BOOT), flush=True)
            print(await ev(base.JS_LOGIN), flush=True)
            await asyncio.sleep(LOBBY_WAIT)
            print('TEX lobby', await ev(TEX), flush=True)
            print('ENTER', (await ev(ENTER) or '')[:120], flush=True)
            await asyncio.sleep(3)
            out = await ev(DC)
            print('DC', out, flush=True)
            json.dump(json.loads(out) if out and out.startswith('{') else {'raw': out}, open(os.path.join(base.SCRATCH, f'{TAG}_dc.json'), 'w'), ensure_ascii=False, indent=1)
            tex = await ev(TEX)
            print('TEX battle', tex, flush=True)
            json.dump(json.loads(tex) if tex and tex.startswith('{') else {'raw': tex}, open(os.path.join(base.SCRATCH, f'{TAG}_tex.json'), 'w'), ensure_ascii=False, indent=1)
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
