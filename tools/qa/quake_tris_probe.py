# -*- coding: utf-8 -*-
"""正式包(7460):连放两次矿晶震荡,读 numTris / 场上 GuardSpellLoopFx 节点数,看持续域循环特效是否叠加不回收(2026-10-11)。"""
import asyncio, json, os, subprocess, time, urllib.request
import websockets
import boss_bar_cdp as base
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle_release.js'), encoding='utf-8').read()
SAMPLE = r"""(() => { const cc = window.__cc, r = window.__gr; const dev = cc.director.root.device; const f = r.fieldNode; let loops = 0, fx = 0; if (f) f.children.forEach(c => { if (c.name === 'GuardSpellLoopFx') loops++; if (c.name === 'GuardSkillFx' || c.name === 'GuardSpellFx') fx++; });
  return JSON.stringify({ tris: dev.numTris, dc: dev.numDrawCalls, loops, fx, mon: r.sim ? r.sim.monsters.filter(m => !m.dead).length : -1, zones: r.sim ? r.sim.zones.map(z => z.kind) : null }); })()"""
CAST = r"""(() => { const r = window.__gr; const cast = r.castSpell ? 'castSpell' : null; r.sim.spellEnergy = r.sim.spellEnergyMax; r.sim.gold += 500;
  const slot = r.root && r.root.getChildByName('GuardSpellBar') && r.root.getChildByName('GuardSpellBar').getChildByName('Spell_quake');
  if (slot) { slot.emit(window.__cc.Node.EventType.TOUCH_END); return 'tap'; } return 'no slot'; })()"""
async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run', '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try: urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception: time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            async def call(m, p=None):
                nonlocal seq; seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), 900))
                    if x.get('id') == my: return x
            async def ev(e):
                r = (await call('Runtime.evaluate', {'expression': e, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True})
            await call('Page.navigate', {'url': base.PAGE}); await asyncio.sleep(8)
            print(await ev(base.JS_BOOT)); print(await ev(base.JS_LOGIN)); print((await ev(JS_BATTLE) or '')[:80])
            for _ in range(60):
                if (await ev("!!(window.__gr && window.__gr.sim && window.__gr.sim.heroes && window.__gr.fieldNode)")) is True: break
                await asyncio.sleep(1)
            await asyncio.sleep(12)
            print('BEFORE', await ev(SAMPLE))
            print('CAST1', await ev(CAST)); await asyncio.sleep(0.6); print('T+0.6', await ev(SAMPLE))
            await asyncio.sleep(1.0); print('T+1.6', await ev(SAMPLE))
            print('CAST2', await ev(CAST)); await asyncio.sleep(0.6); print('T+2.2 (2nd cast)', await ev(SAMPLE))
            await asyncio.sleep(3.5); print('T+5.7', await ev(SAMPLE))
            await asyncio.sleep(3); print('T+8.7', await ev(SAMPLE))
    finally: proc.terminate()
asyncio.run(main())
