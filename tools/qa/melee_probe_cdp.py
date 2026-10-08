# -*- coding: utf-8 -*-
"""预览(7456)复现:怪物贴到水晶前时近战英雄是否还出手。统计每个英雄的 heroAttack 事件、攻击动画、弹体数量。"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle2.js'), encoding='utf-8').read()
PROBE = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const cc = window.__cc, r = window.__gr, M = window.__M, sim = r.sim;
  cc.game.resume();
  const log = [];
  // 准备:金币够、召唤到 5 个英雄,保证有近战
  sim.gold = 99999;
  for (let i = 0; i < 12 && sim.heroes.length < 6; i++) { try { M.guardSummon(sim); } catch (e) {} }
  // 把一个英雄强制改成近战(若没有)
  if (!sim.heroes.some(h => h.role === 'melee')) { const h = sim.heroes[0]; h.role = 'melee'; }
  log.push('heroes=' + sim.heroes.map(h => h.heroCode + ':' + h.role + '@' + h.cell).join(','));
  // 叫怪并让它们走到水晶前
  for (let k = 0; k < 6; k++) sim.pendingSpawns.unshift({ kind: k % 3 === 0 ? 'flying' : 'normal', lane: k % 2, atMs: sim.timeMs + 20 + k * 20 });
  for (let i = 0; i < 40 && sim.monsters.filter(m => !m.dead).length < 4; i++) await sleep(100);
  sim.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 0.6; m.hp = 1e9; m.maxHp = 1e9; m.speedCellsPerSec = 0; });
  sim.crystalHp = sim.crystalMaxHp;
  // 记录事件
  const counts = {}; const origConsume = r.consumeEvents.bind(r);
  r.consumeEvents = function () { for (const e of sim.events) { if (e.type === 'heroAttack' || e.type === 'heroSkill') { const k = e.heroCode + ':' + e.type; counts[k] = (counts[k] || 0) + 1; } } return origConsume(); };
  const anims = {}; const views = r.heroViews;
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) { sim.crystalHp = sim.crystalMaxHp;
    if (sim.monsters.filter(m => !m.dead).length < 3) { for (let k = 0; k < 3; k++) sim.pendingSpawns.unshift({ kind: k === 0 ? 'flying' : 'normal', lane: k % 2, atMs: sim.timeMs + 10 }); }
    sim.monsters.filter(m => !m.dead).forEach(m => { m.x = 0.6; m.hp = 1e9; m.maxHp = 1e9; m.speedCellsPerSec = 0; });
    for (const h of sim.heroes) { const v = views.get(h.unitId); const te = v && v.skeleton && v.skeleton.getCurrent && v.skeleton.getCurrent(0); const name = te && te.animation ? te.animation.name : '-'; const k = h.heroCode + ':' + h.role; anims[k] = anims[k] || {}; anims[k][name] = (anims[k][name] || 0) + 1; }
    await sleep(100); }
  r.consumeEvents = origConsume;
  const mons = sim.monsters.filter(m => !m.dead).map(m => m.kind + '@' + m.x.toFixed(2) + ' lane' + m.lane);
  const cds = sim.heroes.map(h => h.heroCode + ' cd=' + Math.round(h.attackCooldownMs) + ' pend=' + (h.skillPendingSinceMs || 0));
  return JSON.stringify({ log, mons, counts, anims, cds, projectiles: r.projectiles.length, simT: Math.round(sim.timeMs / 1000), paused: sim.paused, choice: !!sim.pendingChoice });
})()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            exc = []

            async def call(method, params=None):
                nonlocal seq
                seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 900))
                    if m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']; exc.append((d.get('exception', {}).get('description') or d.get('text', ''))[:300])
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            await call('Runtime.enable')
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT)); print(await ev(base.JS_LOGIN)); print((await ev(JS_BATTLE) or '')[:120])
            print('PROBE', await ev(PROBE))
            shot = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 70})
            open(os.path.join(base.SCRATCH, 'shots', 'melee_probe.jpg'), 'wb').write(base64.b64decode(shot['result']['data']))
            print('exceptions', exc[:5])
    finally:
        proc.terminate()


asyncio.run(main())
