# -*- coding: utf-8 -*-
"""正式包(7460)手机参数:集火标记行为测试——啃水晶怪 / 精英 / BOSS 同场,标记后看各英雄 lastTargetId;并测点选命中。
用法:python focus_probe.py <tag> [mode]"""
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

FOCUS = r"""(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim; cc.game.resume();
  s.crystalHp = s.crystalMaxHp = 1e9;
  for (let i = 0; i < 16 && s.heroes.length < 4; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(250); }
  // 3 只啃水晶的普通怪(两条车道)+ 1 精英在中场 + 1 BOSS 在远处
  // 先把波打开(prep 期 startWave 会整个替换 pendingSpawns),再往队列里塞怪
  for (let i = 0; i < 100 && s.phase !== 'wave'; i++) { const cb = r.root.getChildByName('GuardCallWaveButton'); if (cb) cb.emit(cc.Node.EventType.TOUCH_END); await sleep(100); }
  const kinds = ['normal', 'normal', 'normal', 'tank', 'tank'];
  kinds.forEach((kind, k) => s.pendingSpawns.unshift({ kind, lane: k % 2, atMs: s.timeMs + 40 + k * 60 }));
  s.nextRushBossAtMs = s.timeMs;
  await sleep(600); s.monsters.forEach(m => { m.maxHp = 9e8; m.hp = 9e8; });
  for (let i = 0; i < 80 && s.monsters.filter(m => !m.dead && m.kind === 'tank').length < 2; i++) { if (s.phase === 'prep' && i % 20 === 0) { const cb = r.root.getChildByName('GuardCallWaveButton'); if (cb) cb.emit(cc.Node.EventType.TOUCH_END); } await sleep(100); }
  const alive = s.monsters.filter(m => !m.dead);
  if (!alive.some(m => m.kind === 'normal') || !alive.some(m => m.kind === 'tank')) return JSON.stringify({ fail: 'spawn', phase: s.phase, alive: alive.map(m => m.kind), pending: s.pendingSpawns.length });
  let tankIdx = 0; alive.forEach((m, k) => { m.maxHp = 9e8; m.hp = 9e8; m.speedCellsPerSec = 0; if (m.kind === 'normal') m.x = 0.15 + (k % 3) * 0.03; else if (m.kind === 'tank') { m.x = tankIdx === 0 ? 2.6 : 4.5; tankIdx += 1; } else m.x = 4.5; });
  await sleep(1200);
  const biter = alive.find(m => m.kind === 'normal'); const boss = alive.find(m => m.kind === 'boss') || alive.filter(m => m.kind === 'tank')[1] || alive.find(m => m.kind === 'tank'); const elite = alive.find(m => m.kind === 'tank');
  const snapshot = () => s.heroes.map(h => [h.heroCode.slice(0, 10), h.role, h.cell, h.lastTargetId, (alive.find(m => m.monsterId === h.lastTargetId) || {}).kind]);
  const before = snapshot();
  // 用渲染层的点选:点在啃水晶怪的身体中心 / BOSS 中心,看各自挑中谁
  const bv = r.monsterViews.get(biter.monsterId), bo = r.monsterViews.get(boss.monsterId);
  const pickBiter = r.pickMonsterAt(bv.node.position.x, bv.node.position.y + 20), pickBoss = r.pickMonsterAt(bo.node.position.x + r.bossVisualOffsetX(bo), bo.node.position.y + 40);
  // 集火啃水晶的怪
  s.markedMonsterId = biter.monsterId;
  await sleep(3000);
  const afterMark = snapshot();
  s.markedMonsterId = elite.monsterId;
  await sleep(3000);
  const afterElite = snapshot();
  return JSON.stringify({ monsters: alive.map(m => [m.monsterId, m.kind, +m.x.toFixed(2), m.lane, m.greedy]), pickBiter, pickBoss, biter: biter.monsterId, boss: boss.monsterId, elite: elite.monsterId, before, afterMark, afterElite }); })()"""


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
            print('ENTER', (await ev(ENTER) or '')[:100], flush=True)
            print('FOCUS', await ev(FOCUS), flush=True)
    finally:
        proc.terminate()


asyncio.run(main())
