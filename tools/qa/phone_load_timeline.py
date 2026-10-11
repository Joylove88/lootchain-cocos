# -*- coding: utf-8 -*-
"""真机「卡顿时刻在加载什么」:几乎零开销地记录 贴图上传(texImage2D/texSubImage2D 尺寸与耗时)、骨骼首次解析(getRuntimeData 耗时)、
resources.load 回调(路径)的时间戳,以及 >80ms 的帧间隔;结束后按时间对齐打印。前提同 phone_probe.py。
用法:python phone_load_timeline.py <tag> [--match 1.210:7460] [--secs 170]"""
import asyncio, json, os, re, socket, sys, time
import websockets
import boss_bar_cdp as base

ARGS = sys.argv[1:]
TAG = ARGS[0] if ARGS and not ARGS[0].startswith('--') else 'load'
OPT = lambda k, d: ARGS[ARGS.index(k) + 1] if k in ARGS else d
MATCH = OPT('--match', '7460'); SECS = int(OPT('--secs', '170')); PORT = int(OPT('--port', '9555'))
_src = open(os.path.join(base.HERE, 'phone_probe.py'), encoding='utf-8').read()
ATTACH = re.search(r'^ATTACH = r"""(.*?)"""', _src, re.S | re.M).group(1)

INSTALL = r"""(() => { if (window.__lt) return 'already'; const cc = window.__cc; const L = window.__lt = { t0: performance.now(), gaps: [], tex: [], parse: [], loads: [], anim: [] };
  const now = () => Math.round(performance.now() - L.t0);
  let last = performance.now(); const tick = () => { const n = performance.now(); if (n - last > 80) L.gaps.push([now(), Math.round(n - last)]); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  for (const P of [window.WebGLRenderingContext && WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) { if (!P) continue;
    for (const fn of ['texImage2D', 'texSubImage2D', 'compressedTexImage2D']) { const o = P[fn]; if (!o) continue;
      P[fn] = function () { const t = performance.now(); const r = o.apply(this, arguments); const d = performance.now() - t; const a = arguments; let w = 0, h = 0;
        if (a.length >= 8 && typeof a[3] === 'number') { w = a[3]; h = a[4]; } else { const src = a[a.length - 1]; if (src && src.width) { w = src.width; h = src.height; } }
        if (d > 2 || w * h >= 1024 * 1024) L.tex.push([now(), fn, w, h, Math.round(d * 10) / 10]); return r; }; } }
  try { const SD = cc.sp.SkeletonData.prototype; const o = SD.getRuntimeData; SD.getRuntimeData = function () { const had = !!this._skeletonCache; const t = performance.now(); const r = o.apply(this, arguments); const d = performance.now() - t; if (!had || d > 5) L.parse.push([now(), (this.name || this._uuid || '?').slice(0, 40), Math.round(d)]); return r; }; } catch (e) { L.parseErr = String(e); }
  try { const o = cc.resources.load.bind(cc.resources); cc.resources.load = function (p, t, cb) { const path = Array.isArray(p) ? p.join(',') : String(p); const st = now(); const args = Array.from(arguments); const i = args.length - 1; const ocb = typeof args[i] === 'function' ? args[i] : null;
      if (ocb && /spine|effect|hu_|ui\//.test(path)) { args[i] = function () { L.loads.push([st, now(), path.slice(0, 60)]); return ocb.apply(this, arguments); }; } return o.apply(null, args); }; } catch (e) { L.loadErr = String(e); }
  try { const SK = cc.sp.Skeleton.prototype; const o = SK.setAnimation; SK.setAnimation = function (tr, name) { const t = performance.now(); const r = o.apply(this, arguments); const d = performance.now() - t; if (d > 8) L.anim.push([now(), String(name).slice(0, 30), Math.round(d), this.isAnimationCached() ? 'cache' : 'rt']); return r; }; } catch (e) { L.animErr = String(e); }
  return 'on ' + JSON.stringify({ parseErr: L.parseErr || '', loadErr: L.loadErr || '', animErr: L.animErr || '' }); })()"""
DUMP = r"""JSON.stringify(window.__lt ? { gaps: window.__lt.gaps, tex: window.__lt.tex, parse: window.__lt.parse, loads: window.__lt.loads, anim: window.__lt.anim } : null)"""
PHASE = r"""(() => { const rr = window.__root && window.__root.lobbyGuardBattleRenderer; const s = rr && rr.sim; return s ? s.phase : (window.__root ? window.__root.currentView : 'none'); })()"""


def http_get(path):
    s = socket.create_connection(('127.0.0.1', PORT), timeout=20)
    s.sendall(f'GET {path} HTTP/1.1\r\nHost: localhost:{PORT}\r\nConnection: close\r\n\r\n'.encode())
    data = b''
    try:
        while True:
            c = s.recv(65536)
            if not c:
                break
            data += c
            head, _, body = data.partition(b'\r\n\r\n')
            m = re.search(rb'Content-Length:\s*(\d+)', head)
            if m and len(body) >= int(m.group(1)):
                break
    except Exception:
        pass
    return data.partition(b'\r\n\r\n')[2]


async def main():
    tabs = json.loads(http_get('/json/list'))
    page = next((t for t in tabs if t.get('type') == 'page' and MATCH in t.get('url', '')), None)
    if not page:
        print('no game tab'); return
    async with websockets.connect(page['webSocketDebuggerUrl'], max_size=None, ping_interval=None, open_timeout=30) as ws:
        seq = 0

        async def call(method, params=None, timeout=120):
            nonlocal seq
            seq += 1; my = seq
            await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
            while True:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                if m.get('id') == my:
                    return m

        async def ev(expr, timeout=120):
            r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
            return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

        await call('Runtime.enable')
        # 等玩家进入战斗(刷新期间求值会失败,忽略继续等)
        deadline = time.time() + int(OPT('--wait-max', '900'))
        while time.time() < deadline:
            try:
                await ev(ATTACH, 40)
                if (await ev("!!(window.__root && window.__root.currentView === 'battle' && window.__root.lobbyGuardBattleRenderer && window.__root.lobbyGuardBattleRenderer.sim)", 20)) is True:
                    break
            except Exception as error:
                print('wait..', str(error)[:60], flush=True)
            await asyncio.sleep(3)
        print('battle detected', time.strftime('%H:%M:%S'), flush=True)
        print('ATTACH', await ev(ATTACH, 60), flush=True)
        print('INSTALL', await ev(INSTALL), time.strftime('%H:%M:%S'), flush=True)
        t0 = time.time()
        while time.time() - t0 < SECS:
            await asyncio.sleep(10)
            ph = await ev(PHASE)
            print(f'[{time.time() - t0:4.0f}s] phase={ph}', flush=True)
            if ph in ('victory', 'defeat', 'lobby'):
                break
        raw = await ev(DUMP)
        data = json.loads(raw) if raw and raw.startswith('{') else None
        json.dump(data, open(os.path.join(base.SCRATCH, f'{TAG}_load.json'), 'w'))
        if not data:
            print('no data'); return
        ev_list = []
        for t, fn, w, h, d in data['tex']:
            ev_list.append((t, f'TEX {fn} {w}x{h} {d}ms'))
        for t, name, d in data['parse']:
            ev_list.append((t, f'PARSE {name} {d}ms'))
        for st, en, path in data['loads']:
            ev_list.append((en, f'LOAD {path} ({en - st}ms)'))
        for t, name, d, mode in data['anim']:
            ev_list.append((t, f'ANIM {name} {d}ms {mode}'))
        for t, gap in data['gaps']:
            ev_list.append((t, f'--- GAP {gap}ms'))
        ev_list.sort(key=lambda x: x[0])
        print(f"gaps>80: {len(data['gaps'])}  tex: {len(data['tex'])}  parse: {len(data['parse'])}  loads: {len(data['loads'])}  slowAnim: {len(data['anim'])}")
        for t, s in ev_list:
            print(f'{t / 1000:6.1f}  {s}')

asyncio.run(main())
