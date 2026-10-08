# -*- coding: utf-8 -*-
"""手机(UA)路径下的显存账:登录后 / 进战场 20 秒后,列出已加载 Texture2D 按字节排序 + 引擎 memoryStatus。"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
JS_BATTLE = open(os.path.join(base.SCRATCH, 'js_battle_release.js' if os.environ.get('PREVIEW_PORT') == '7460' else 'js_battle2.js'), encoding='utf-8').read()
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
TEX = r"""(() => { const cc = window.__cc; const out = []; let total = 0; const byDir = {};
  cc.assetManager.assets.forEach((a, k) => { if (a instanceof cc.Texture2D || a instanceof cc.ImageAsset) { if (a instanceof cc.ImageAsset) return; const w = a.width, h = a.height; const bytes = w * h * 4; total += bytes;
    const info = cc.assetManager.assets.get(k); let path = (a.nativeUrl || a.name || k); try { const inf = cc.resources.getAssetInfo(a._uuid.split('@')[0]); if (inf && inf.path) path = inf.path; } catch (e) {}
    const dir = String(path).split('/').slice(0, 3).join('/'); byDir[dir] = (byDir[dir] || 0) + bytes; out.push([Math.round(bytes / 1048576 * 10) / 10, w + 'x' + h, String(path).slice(0, 70)]); } });
  out.sort((a, b) => b[0] - a[0]);
  const ms = cc.director.root.device.memoryStatus; const dirs = Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([d, b]) => d + ':' + Math.round(b / 1048576));
  return JSON.stringify({ totalMB: Math.round(total / 1048576), count: out.length, gfxTexMB: Math.round(ms.textureSize / 1048576), gfxBufMB: Math.round(ms.bufferSize / 1048576), dirs, top: out.slice(0, 28) }); })()"""
async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run', '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
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
                    if m.get('id') == my: return m
            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print(await ev(base.JS_BOOT)); print(await ev(base.JS_LOGIN))
            await asyncio.sleep(25)
            print('LOBBY+25s', await ev(TEX))
            # 进战场:记录加载门时长 + 进场后前 12 秒的帧间隔(卡死 = 大间隔)
            await ev("(() => { window.__ft = []; let last = performance.now(); const tick = () => { const n = performance.now(); window.__ft.push(Math.round(n - last)); last = n; if (window.__ft.length < 100000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__t0 = performance.now(); return 1; })()")
            await call('Profiler.enable'); await call('Profiler.setSamplingInterval', {'interval': 500}); await call('Profiler.start')
            print((await ev(JS_BATTLE) or '')[:60])
            print('gate', await ev("(() => { const r = window.__gr; const ft = window.__ft; const since = Math.round(performance.now() - window.__t0); const big = ft.filter(x => x > 100); return JSON.stringify({ sinceOpenMs: since, frames: ft.length, stallsOver100ms: big.length, worst: Math.max(...ft), stallSum: big.reduce((a, b) => a + b, 0), top: ft.slice().sort((a, b) => b - a).slice(0, 8), mon: r && r.sim ? r.sim.monsterSpineCodes : null }); })()"))
            await asyncio.sleep(12)
            print('battle+12s frames', await ev("(() => { const ft = window.__ft.slice(-700); const big = ft.filter(x => x > 100); return JSON.stringify({ n: ft.length, avgMs: Math.round(ft.reduce((a, b) => a + b, 0) / ft.length), stallsOver100ms: big.length, worst: Math.max(...ft), top: ft.slice().sort((a, b) => b - a).slice(0, 6) }); })()"))
            prof = (await call('Profiler.stop'))['result']['profile']
            import collections
            nodes = {n['id']: n for n in prof['nodes']}; parent = {}
            for n in prof['nodes']:
                for c in n.get('children', []): parent[c] = n['id']
            self_us = collections.Counter()
            for nid, d in zip(prof['samples'], prof['timeDeltas']): self_us[nid] += d
            total = sum(prof['timeDeltas'])
            by = collections.Counter()
            for nid, us in self_us.items():
                cf = nodes[nid]['callFrame']; by[(cf.get('functionName') or '(anon)') + ':' + str(cf.get('lineNumber'))] += us
            print('ENTRY PROFILE total %.1fs' % (total / 1e6))
            for k, us in by.most_common(16): print('  %5.1f%% %s' % (us / total * 100, k))
            def chain(nid, depth=12):
                out = []
                while nid in parent and len(out) < depth:
                    nid = parent[nid]; cf = nodes[nid]['callFrame']; out.append((cf.get('functionName') or '(anon)') + ':' + str(cf.get('lineNumber')))
                return ' < '.join(out)
            for target in ('texSubImage2D', '(program)', 'texImage2D'):
                agg = collections.Counter()
                for nid, us in self_us.items():
                    if nodes[nid]['callFrame'].get('functionName') == target: agg[chain(nid)] += us
                for k, us in agg.most_common(3): print('  caller %4.1f%% %s: %s' % (us / total * 100, target, k[:300]))
            await asyncio.sleep(1)
            print('BATTLE+25s', await ev(TEX))
    finally:
        proc.terminate()
asyncio.run(main())
