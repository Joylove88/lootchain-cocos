# -*- coding: utf-8 -*-
"""守卫战挂机压测:自动召唤 / 强化 / 选卡 / 开箱 / 提前叫波,跑 N 秒,抓 step 里的异常、页面异常、WebGL 丢失、sim 是否还在推进。
用法:python soak_cdp.py [秒数=150] [stage=MAIN_1_1]"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 150
STAGE = sys.argv[2] if len(sys.argv) > 2 else 'MAIN_1_1'
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle2.js'), encoding='utf-8').read().replace('MAIN_1_1', STAGE)
HOOK = r"""(async () => { const cc = window.__cc, r = window.__gr, M = window.__M; cc.game.resume();
  window.__errs = []; window.__ctxLost = 0;
  cc.game.canvas.addEventListener('webglcontextlost', () => { window.__ctxLost++; });
  const orig = r.step.bind(r);
  r.step = function () { try { orig(); } catch (e) { const s = String(e && e.stack || e).slice(0, 900); if (window.__errs.length < 4 && !window.__errs.includes(s)) window.__errs.push(s); } };
  clearInterval(r.tickTimer); r.tickTimer = setInterval(() => r.step(), 50);
  window.__auto = setInterval(() => { try { const s = window.__gr.sim; if (!s) return; s.crystalHp = s.crystalMaxHp; s.gold = Math.max(s.gold, 3000);
    if (s.pendingChoice) { const g = s.pendingChoice.find(o => o.rarity === 'gold') || s.pendingChoice[0]; M.guardChooseOption(s, g.slot); return; }
    if (Math.random() < 0.5) M.guardSummon(s); if (Math.random() < 0.3) M.guardEnhance(s);
    if (s.chests.length && !window.__gr.wheelOverlayOpen) M.guardOpenChest(s, s.chests[0].chestId);
    if (M.guardCallNextWave) M.guardCallNextWave(s);
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 12; b++) { const ha = M.guardFindHeroAt(s, a), hb = M.guardFindHeroAt(s, b); if (ha && hb && ha.heroCode === hb.heroCode && ha.star === hb.star && Math.random() < 0.2) { M.guardDragTo(s, a, b); return; } }
  } catch (e) { const t = 'AUTO ' + String(e && e.stack || e).slice(0, 500); if (window.__errs.length < 6 && !window.__errs.includes(t)) window.__errs.push(t); } }, 700);
  return 'hooked mode=' + r.sim.mode; })()"""
STAT = "(() => { const r = window.__gr, s = r && r.sim; return JSON.stringify({ t: s ? Math.round(s.timeMs / 1000) : -1, phase: s && s.phase, wave: s && s.wave, heroes: s ? s.heroes.map(h => h.heroCode.split('_')[1] + h.star).join(',') : '', mon: s ? s.monsters.filter(m => !m.dead).length : 0, view: window.__root.currentView, errs: window.__errs, ctxLost: window.__ctxLost, fxNodes: r && r.fieldNode ? r.fieldNode.children.length : -1 }); })()"
async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run', '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
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
            async def call(method, params=None):
                nonlocal seq
                seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 900))
                    if m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']; s = (d.get('exception', {}).get('description') or d.get('text', ''))[:700]
                        if s not in exc and len(exc) < 6: exc.append(s)
                    if m.get('id') == my: return m
            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')
            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT)); print(await ev(base.JS_LOGIN)); print((await ev(JS_BATTLE) or '')[:80]); print(await ev(HOOK))
            t0 = time.time(); last = None
            while time.time() - t0 < SECS:
                await asyncio.sleep(15)
                st = await ev(STAT); print(f'[{time.time() - t0:5.0f}s]', (st or '')[:600], flush=True)
            print('page exceptions:', exc)
    finally:
        proc.terminate()
asyncio.run(main())
