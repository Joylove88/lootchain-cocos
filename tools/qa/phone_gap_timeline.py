# -*- coding: utf-8 -*-
"""真机卡顿时刻归因:记录每次 >80ms 的帧间隔发生的时刻,同时每 250ms 快照战斗状态(波次 / 怪数 / 刷怪 / 大招 / 三选一 / 轮盘 / 新建怪视图),
结束后把每次卡顿和当时的事件对齐打印。前提同 phone_probe.py。用法:python phone_gap_timeline.py <tag> [--match 1.210:7460] [--secs 150]"""
import asyncio, json, os, re, socket, sys, time
import websockets
import boss_bar_cdp as base

ARGS = sys.argv[1:]
TAG = ARGS[0] if ARGS and not ARGS[0].startswith('--') else 'gap'
OPT = lambda k, d: ARGS[ARGS.index(k) + 1] if k in ARGS else d
MATCH = OPT('--match', '7460'); SECS = int(OPT('--secs', '150')); PORT = int(OPT('--port', '9555'))
_src = open(os.path.join(base.HERE, 'phone_probe.py'), encoding='utf-8').read()
ATTACH = re.search(r'^ATTACH = r"""(.*?)"""', _src, re.S | re.M).group(1)

INSTALL = r"""(() => { if (window.__gt) return 'already'; const G = window.__gt = { gaps: [], st: [], t0: performance.now() };
  let last = performance.now(); const tick = () => { const n = performance.now(); if (n - last > 80) G.gaps.push([Math.round(n - G.t0), Math.round(n - last)]); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  setInterval(() => { try { const rr = window.__root.lobbyGuardBattleRenderer; const s = rr && rr.sim; if (!s) return;
    G.st.push([Math.round(performance.now() - G.t0), s.wave, s.monsters.filter(m => !m.dead).length, s.heroes.length, rr.ultFxLive || 0, s.pendingChoice ? 1 : 0, rr.wheelOverlayOpen ? 1 : 0, s.phase, rr.monsterViews ? rr.monsterViews.size : -1, s.monsters.length, s.chests ? s.chests.length : 0]); } catch (e) {} }, 250);
  return 'on'; })()"""
DUMP = r"""JSON.stringify(window.__gt ? { gaps: window.__gt.gaps, st: window.__gt.st } : null)"""
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
        json.dump(data, open(os.path.join(base.SCRATCH, f'{TAG}_gaps.json'), 'w'))
        if not data:
            print('no data'); return
        st = data['st']; gaps = data['gaps']
        print(f"gaps>80ms: {len(gaps)}  >100: {sum(1 for g in gaps if g[1] > 100)}  >200: {sum(1 for g in gaps if g[1] > 200)}  snapshots: {len(st)}")
        print(' t(s)   gap  wave  mon heroes ult choice wheel phase  +spawn1s +views1s +chest1s')
        for t, gap in gaps:
            cur = max((x for x in st if x[0] <= t), key=lambda x: x[0], default=None)
            prev = max((x for x in st if x[0] <= t - 1000), key=lambda x: x[0], default=cur)
            if not cur:
                print(f'{t/1000:5.1f} {gap:5d}  (no snapshot)'); continue
            print(f'{t/1000:5.1f} {gap:5d}  {cur[1]:4} {cur[2]:4} {cur[3]:6} {cur[4]:3} {cur[5]:6} {cur[6]:5} {str(cur[7]):7} {cur[9]-prev[9]:8} {cur[8]-prev[8]:8} {cur[10]-prev[10]:8}')

asyncio.run(main())
