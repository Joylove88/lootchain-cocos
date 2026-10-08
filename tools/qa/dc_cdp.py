# -*- coding: utf-8 -*-
"""守卫战后期压力场景 CPU 剖析(预览包,手机横屏视口 + CPU 4 倍降速):
进战场 → 召满英雄(2★ + 觉醒)→ 维持 ~40 只高血量怪 → 采样 12 秒 → 按函数汇总自耗时 Top 35,并报帧率 / 节点统计。
用法:EDGE_PORT=94xx EDGE_PROFILE=xxx python perf_cdp.py [tag] [--monsters 40] [--throttle 4]"""
import asyncio, json, os, subprocess, sys, time, urllib.request, collections
import websockets
import boss_bar_cdp as base

args = sys.argv[1:]
TAG = next((a for a in args if not a.startswith('--') and not a.isdigit()), 'perf')
MONSTERS = int(args[args.index('--monsters') + 1]) if '--monsters' in args else 40
THROTTLE = float(args[args.index('--throttle') + 1]) if '--throttle' in args else 4
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle2.js'), encoding='utf-8').read()
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

SETUP = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cc = window.__cc, r = window.__gr, sim = r.sim, M = window.__M;
  cc.game.resume(); if (sim.pendingChoice) M.guardSkipChoice(sim);
  sim.crystalHp = sim.crystalMaxHp = 9e9;
  for (let i = 0; i < 30; i++) { sim.gold = 999999; if (!M.guardSummon(sim, true)) break; await sleep(60); }
  sim.heroes.forEach(h => { h.star = 2; M.guardHeroPerks(sim, h.heroCode).ultLv = 1; });
  window.__keep = setInterval(() => { try { const s = window.__gr.sim; if (!s) return; s.crystalHp = s.crystalMaxHp; if (s.pendingChoice) M.guardSkipChoice(s);
    const alive = s.monsters.filter(m => !m.dead).length;
    for (let k = alive; k < __N__; k++) s.pendingSpawns.unshift({ kind: k % 9 === 0 ? 'elite' : 'normal', lane: k % 2, atMs: s.timeMs + 30 + k * 5 });
    s.monsters.forEach(m => { if (!m.dead) { m.hp = Math.max(m.hp, 4000); m.maxHp = Math.max(m.maxHp, 8000); if (m.x < 3.2) m.x = 3.2 + (m.monsterId % 7) * 0.5; } });
  } catch (e) {} }, 400);
  await sleep(6000);
  return JSON.stringify({ heroes: sim.heroes.length, monsters: sim.monsters.filter(m => !m.dead).length, phase: sim.phase }); })()""".replace('__N__', str(MONSTERS))

STATS = r"""(async () => { const cc = window.__cc, r = window.__gr; const sleep = ms => new Promise(x => setTimeout(x, ms));
  let frames = 0, last = performance.now(), worst = 0, over50 = 0; let run = true;
  const tick = () => { const now = performance.now(); const d = now - last; last = now; frames++; if (d > worst) worst = d; if (d > 50) over50++; if (run) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); const t0 = performance.now(); await sleep(__MS__); run = false; const el = performance.now() - t0;
  let nodes = 0, skel = 0, labels = 0, sprites = 0, gfx = 0; const w = n => { if (!n.activeInHierarchy) return; nodes++; if (n.getComponent(cc.sp.Skeleton)) skel++; if (n.getComponent(cc.Label)) labels++; if (n.getComponent(cc.Sprite)) sprites++; if (n.getComponent(cc.Graphics)) gfx++; n.children.forEach(w); }; w(cc.director.getScene());
  const dc = cc.director.root && cc.director.root.device ? cc.director.root.device.numDrawCalls : -1;
  return JSON.stringify({ fps: +(frames / el * 1000).toFixed(1), worstMs: Math.round(worst), over50, nodes, skel, labels, sprites, gfx, drawCalls: dc, proj: r.projectiles.length, canvas: [cc.game.canvas.width, cc.game.canvas.height],
    heroes: r.sim.heroes.length, monsters: r.sim.monsters.filter(m => !m.dead).length }); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            logs = collections.Counter()

            async def call(method, params=None, timeout=900):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if m.get('method') == 'Runtime.consoleAPICalled':
                        a = m['params']['args']
                        logs[m['params']['type'] + ' ' + str(a[0].get('value', a[0].get('description', '')) if a else '')[:70]] += 1
                    if m.get('id') == my:
                        return m

            async def ev(expr, timeout=900):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            if '--vconsole' in args:
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2.6, 'mobile': True,
                                                               'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print('boot', await ev(base.JS_BOOT))
            print('login', await ev(base.JS_LOGIN))
            print('battle', (await ev(JS_BATTLE) or '')[:90])
            print('setup', await ev(SETUP))
            BREAK = r"""(async () => { const cc = window.__cc, r = window.__gr; const sleep = ms => new Promise(x => setTimeout(x, ms));
  const dev = cc.director.root.device; const dc = async () => { let m = 0, sum = 0, n = 0; for (let i = 0; i < 20; i++) { await new Promise(x => requestAnimationFrame(x)); sum += dev.numDrawCalls; n++; m = Math.max(m, dev.numDrawCalls); } return Math.round(sum / n); };
  const all = []; const w = n => { all.push(n); n.children.forEach(w); }; w(cc.director.getScene());
  const out = { base: await dc() };
  const toggle = async (name, pick) => { const comps = []; for (const n of all) { if (!n.isValid || !n.activeInHierarchy) continue; for (const c of pick(n)) if (c && c.enabled) { c.enabled = false; comps.push(c); } }
    out[name] = { count: comps.length, dcWithout: await dc() }; comps.forEach(c => { if (c.isValid) c.enabled = true; }); await sleep(100); };
  const inMon = n => { let p = n; while (p) { if (/^GuardMonster/.test(p.name)) return true; p = p.parent; } return false; };
  const inHero = n => { let p = n; while (p) { if (/^GuardHero|^GuardUnit/.test(p.name)) return true; p = p.parent; } return false; };
  await toggle('monsterSpine', n => inMon(n) ? [n.getComponent(cc.sp.Skeleton)] : []);
  await toggle('heroSpine', n => inHero(n) ? [n.getComponent(cc.sp.Skeleton)] : []);
  await toggle('otherSpine', n => (!inMon(n) && !inHero(n)) ? [n.getComponent(cc.sp.Skeleton)] : []);
  await toggle('graphics', n => [n.getComponent(cc.Graphics)]);
  await toggle('labels', n => [n.getComponent(cc.Label)]);
  await toggle('sprites', n => [n.getComponent(cc.Sprite)]);
  const names = {}; for (const n of all) { if (!n.isValid || !n.activeInHierarchy) continue; const g = n.getComponent(cc.Graphics); if (g) { const k = n.name.replace(/[_\d]+$/, ''); names[k] = (names[k] || 0) + 1; } }
  out.gfxNames = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 14);
  const ln = {}; for (const n of all) { if (!n.isValid || !n.activeInHierarchy) continue; const l = n.getComponent(cc.Label); if (l) { const k = n.name.replace(/[_\d]+$/, '') + ':' + l.cacheMode; ln[k] = (ln[k] || 0) + 1; } }
  out.labelNames = Object.entries(ln).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const sk = r.monsterViews ? Array.from(r.monsterViews.values())[0] : null; out.monBatch = sk && sk.skeleton ? { enableBatch: sk.skeleton.enableBatch, cache: sk.skeleton._cacheMode, pma: sk.skeleton.premultipliedAlpha } : null;
  return JSON.stringify(out); })()"""
            print('breakdown', await ev(BREAK))
    finally:
        proc.terminate()


asyncio.run(main())
