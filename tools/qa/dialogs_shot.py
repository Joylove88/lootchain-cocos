# -*- coding: utf-8 -*-
"""正式包(7460)手机参数截图:集火标记特效 / 退出确认弹层 / 宝箱轮盘 5 连大奖横幅(宝箱脚本计数预置 2,第 3 箱按脚本给 5 连)。
用法:python dialogs_shot.py <tag> [mode]"""
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
SCRIPT_KEY = OPT('--script-key', 'lootchainGuardChestScript')

MARK = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp = 1e9;
  for (let i = 0; i < 16 && s.heroes.length < 3; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(250); }
  for (let i = 0; i < 100 && s.phase !== 'wave'; i++) { const cb = r.root.getChildByName('GuardCallWaveButton'); if (cb) cb.emit(cc.Node.EventType.TOUCH_END); await sleep(100); }
  for (let k = 0; k < 4; k++) s.pendingSpawns.unshift({ kind: k === 0 ? 'tank' : 'normal', lane: k % 2, atMs: s.timeMs + 40 + k * 60 });
  for (let i = 0; i < 60 && s.monsters.filter(m => !m.dead).length < 4; i++) await sleep(100);
  const alive = s.monsters.filter(m => !m.dead); alive.forEach((m, k) => { m.maxHp = 9e8; m.hp = 9e8; m.speedCellsPerSec = 0; m.x = 2.2 + k * 0.7; });
  await sleep(1200);
  const target = alive.find(m => m.kind === 'tank') || alive[0];
  s.markedMonsterId = target.monsterId;
  await sleep(380); cc.game.pause();
  const v = r.monsterViews.get(target.monsterId); const ret = v.node.getChildByName('GuardMarkReticle'); const burst = v.node.getChildByName('GuardMarkBurst');
  return JSON.stringify({ target: target.monsterId, kind: target.kind, reticle: !!ret, reticleHasSkeleton: !!(ret && ret.getChildByName('Ring')), burst: !!burst, ready: Array.from(r.attackSpineFxReady.keys()).filter(k => /081|189/.test(k)) }); })()"""

EXIT = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr; cc.game.resume(); r.openExitConfirm(); await sleep(700); cc.game.pause(); return 'exit open=' + r.exitConfirmOpen; })()"""

WHEEL = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; r.closeExitConfirm(); cc.game.resume(); await sleep(300);
  s.chests.push({ chestId: 9901, x: 5, lane: 0, droppedAtMs: s.timeMs, grade: 'normal' }); r.openChestWithWheel(9901); await sleep(2500); return 'wheel open=' + r.wheelOverlayOpen; })()"""


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
                return 'EXC ' + str(r['exceptionDetails'])[:500] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'})
                open(os.path.join(base.SCRATCH, 'shots', f'{TAG}_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))

            await call('Runtime.enable'); await call('Page.enable')
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': DPR, 'mobile': True,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            # 宝箱脚本计数设成 2:下一箱(第 3 箱)按脚本给 5 连大奖
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': PRE + "try{localStorage.setItem('%s','2')}catch(e){}" % SCRIPT_KEY})
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
            print('ENTER', (await ev(ENTER) or '')[:100], flush=True)
            await asyncio.sleep(2)
            print('MARK', await ev(MARK), flush=True)
            await shot('mark')
            await asyncio.sleep(1.0)
            await ev('window.__cc.game.resume()'); await asyncio.sleep(0.5); await ev('window.__cc.game.pause()')
            await shot('mark2')
            print('EXIT', await ev(EXIT), flush=True)
            await shot('exit')
            print('WHEEL', await ev(WHEEL), flush=True)
            await asyncio.sleep(9)
            await shot('wheel_done')
    finally:
        proc.terminate()


asyncio.run(main())
