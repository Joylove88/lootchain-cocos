# -*- coding: utf-8 -*-
"""正式包(7460)手机参数截图:进场加载页(CPU 降速拉长加载门)+ 战斗中血条 / 冷却条(5 英雄 2★、8 只不同血量的怪)。
用法:python battle_bars_shot.py <tag> [mode]"""
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

SETUP = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp = 1e9;
  for (let i = 0; i < 16 && s.heroes.length < __HEROES__; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(250); }
  s.heroes.forEach((h, k) => { h.star = 2; h.skillReadyMs = s.timeMs + 2000 + k * 1500; });
  for (let k = 0; k < 10; k++) s.pendingSpawns.unshift({ kind: k % 5 === 0 ? 'elite' : 'normal', lane: k % 2, atMs: s.timeMs + 40 + k * 60 });
  for (let i = 0; i < 40 && s.monsters.filter(m => !m.dead).length < 8; i++) await sleep(100);
  s.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 3.4 + (k % 5) * 0.55; m.speedCellsPerSec = 0.05; m.maxHp = 999999; m.hp = 999999 * (0.25 + 0.12 * (k % 6)); });
  await sleep(900); cc.game.pause();
  return JSON.stringify({ heroes: s.heroes.length, monsters: s.monsters.filter(m => !m.dead).length, bars: (r.fieldNode.getChildByName('GuardBarLayer') || { children: [] }).children.length }); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
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
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'})
                open(os.path.join(base.SCRATCH, 'shots', f'{TAG}_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))

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
            await asyncio.sleep(10)
            # 加载页:进场时 CPU 降速拉长加载门,在门里截图
            await call('Emulation.setCPUThrottlingRate', {'rate': 6})
            await ws.send(json.dumps({'id': 99999, 'method': 'Runtime.evaluate', 'params': {'expression': ENTER, 'awaitPromise': True, 'returnByValue': True}}))
            for k in range(3):
                await asyncio.sleep(1.2)
                await shot(f'loading_{k}')
            await call('Emulation.setCPUThrottlingRate', {'rate': 1})
            for _ in range(60):
                st = await ev("(() => { const r = window.__root && window.__root.lobbyGuardBattleRenderer; return !!(r && r.sim) && !window.__root.currentLobbyBattleState().assetsLoading; })()")
                if st is True:
                    break
                await asyncio.sleep(1)
            await ev("window.__gr = window.__root.lobbyGuardBattleRenderer; 1")
            print('SETUP', await ev(SETUP.replace('__HEROES__', OPT('--heroes', '5'))), flush=True)
            await shot('battle')
            print('BARS', await ev(r"""(() => { const cc = window.__cc, r = window.__gr; const L = r.fieldNode.getChildByName('GuardBarLayer'); if (!L) return 'no layer';
  const out = L.children.map(n => { const sp = n.getComponent(cc.Sprite); const t = n.getComponent(cc.UITransform); const f = sp && sp.spriteFrame;
    return [n.name.replace('GuardMonster_', 'M').replace('GuardHero_', 'H'), n.active, Math.round(n.position.x), Math.round(n.position.y), Math.round(t.width), Math.round(t.height), !!f, f ? [f.rect.x, f.rect.y, f.rect.width, f.rect.height].join(',') : '-', sp ? [sp.color.r, sp.color.a].join('/') : '-', sp ? sp.type : '-']; });
  const mons = Array.from(r.monsterViews.values()).map(v => [v.node.name, Math.round(v.node.position.x), Math.round(v.node.position.y), v.hpBarOffsetY, v.hpBarW, v.hpDrawnKey]);
  return JSON.stringify({ layerIdx: L.getSiblingIndex(), fieldChildren: r.fieldNode.children.length, out, mons }); })()"""), flush=True)
    finally:
        proc.terminate()


asyncio.run(main())
