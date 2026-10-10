# -*- coding: utf-8 -*-
"""真机(安卓 Chrome,adb 转发)长帧归因 + CPU 采样 + 报错捕获:玩家在手机上正常玩,脚本旁路记录。

前提:手机开无线调试并 `adb tcpip 5555` 后 `adb connect <ip>:5555`;`adb forward tcp:9555 localabstract:chrome_devtools_remote`。
只连接 URL 含 --match(默认 7460)的那一个标签页,不碰其它页面。
用法:python phone_probe.py <tag> [--secs 90] [--match 7460] [--no-profile] [--light]
注意:不带 --light 时会给渲染器全部方法挂计时,录完不会自动卸掉,测完要让玩家刷新页面。
输出:%TEMP%/lootchain-qa/<tag>_phone.json(长帧归因 / 贴图上传 / 动画 / 报错)、<tag>_phone_profile.json(CPU 采样)。
"""
import asyncio, collections, json, os, re, socket, sys, time
import websockets
import boss_bar_cdp as base

TAG = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'phone'
ARGS = sys.argv[1:]
OPT = lambda k, d: ARGS[ARGS.index(k) + 1] if k in ARGS else d
SECS = int(OPT('--secs', '90'))
MATCH = OPT('--match', '7460')
PORT = int(OPT('--port', '9555'))
HERE = os.path.dirname(os.path.abspath(__file__))

# 复用 longframe_probe.py 的 HOOK / DUMP(那份脚本文件末尾直接 asyncio.run,不能 import)
_src = open(os.path.join(HERE, 'longframe_probe.py'), encoding='utf-8').read()
HOOK = re.search(r'^HOOK = r"""(.*?)"""', _src, re.S | re.M).group(1)
DUMP = re.search(r'^DUMP = r"""(.*?)"""', _src, re.S | re.M).group(1)

ATTACH = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms));
  let cc = null; for (let i = 0; i < 10 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1000); } }
  if (!cc) return 'cc import failed'; window.__cc = cc;
  const s = cc.director.getScene(); let root = null; const walk = n => { if (root) return; const c = n.getComponent && n.getComponent('LootChainGameRoot'); if (c) { root = c; return; } n.children.forEach(walk); }; if (s) walk(s);
  if (!root) return 'no root'; window.__root = root; window.__gr = root.lobbyGuardBattleRenderer;
  return 'attached view=' + root.currentView + ' dpr=' + window.devicePixelRatio + ' canvas=' + document.getElementById('GameCanvas').width + 'x' + document.getElementById('GameCanvas').height; })()"""

# 帧间隔分布 + 每秒 GC / 主线程长任务(PerformanceObserver longtask 在安卓 Chrome 可用)
FRAMES = r"""(() => { if (window.__pf) return 'already'; const P = window.__pf = { ft: [], lt: [] }; let last = performance.now();
  const tick = () => { const n = performance.now(); P.ft.push([Math.round(n), Math.round(n - last)]); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { P.ltErr = String(e); }
  return 'frames on'; })()"""

FRAMES_DUMP = r"""(() => { const P = window.__pf || { ft: [], lt: [] }; const ft = P.ft.map(x => x[1]).sort((a, b) => a - b); const n = ft.length;
  const q = p => n ? ft[Math.min(n - 1, Math.floor(n * p))] : 0;
  const gaps = P.ft.filter(x => x[1] > 100);
  // 长帧 vs 长任务:长帧期间有没有对应的主线程长任务(没有 = GPU / 合成 / 系统侧卡住)
  const lt = P.lt; let withTask = 0, noTask = 0;
  for (const [t, d] of gaps) { const hit = lt.some(([s, dur]) => s <= t && s + dur >= t - d); if (hit) withTask++; else noTask++; }
  return JSON.stringify({ frames: n, median: q(0.5), p90: q(0.9), p99: q(0.99), over100: gaps.length, over200: gaps.filter(x => x[1] > 200).length, gapsWithLongTask: withTask, gapsWithoutLongTask: noTask, longTasks: lt.length, longTaskMs: lt.reduce((a, x) => a + x[1], 0), ltErr: P.ltErr || '' }); })()"""

STATE = r"""(() => { const r = window.__gr, root = window.__root; const s = r && r.sim; const dev = window.__cc.director.root.device;
  return JSON.stringify({ view: root.currentView, mode: s && s.mode, wave: s && s.wave, mon: s ? s.monsters.filter(m => !m.dead).length : -1, heroes: s ? s.heroes.length : -1,
    texMB: Math.round(dev.memoryStatus.textureSize / 1048576), dc: dev.numDrawCalls, tris: dev.numTris, gfx: (window.__lcGraphicsMode || '') }); })()"""


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
            m = re.search(rb'Content-Length:(\d+)', head)
            if m and len(body) >= int(m.group(1)):
                break
    except Exception:
        pass
    return data.partition(b'\r\n\r\n')[2]


def summarize(prof, out, top=40):
    nodes = {n['id']: n for n in prof['nodes']}
    parent = {}
    for n in prof['nodes']:
        for c in n.get('children', []):
            parent[c] = n['id']
    self_t = collections.Counter()
    incl = collections.Counter()
    deltas = prof.get('timeDeltas', [])
    for sid, dt in zip(prof.get('samples', []), deltas):
        fr = nodes[sid]['callFrame']
        self_t['%s:%s' % (fr['functionName'] or '(anon)', fr['url'].split('/')[-1][:28])] += dt
        seen = set()
        cur = sid
        while cur is not None:
            f2 = nodes[cur]['callFrame']
            key = '%s:%s' % (f2['functionName'] or '(anon)', f2['url'].split('/')[-1][:28])
            if key not in seen:
                incl[key] += dt
                seen.add(key)
            cur = parent.get(cur)
    total = sum(deltas) or 1
    out('PROFILE self top:')
    for k, us in self_t.most_common(top):
        out('  %5.1f%% %s' % (us / total * 100, k))
    out('PROFILE inclusive top:')
    for k, us in incl.most_common(top):
        out('  %5.1f%% %s' % (us / total * 100, k))


async def main():
    tabs = json.loads(http_get('/json/list'))
    page = next((t for t in tabs if t.get('type') == 'page' and MATCH in t.get('url', '')), None)
    if not page:
        print('no game tab matching', MATCH)
        return
    ws_url = page['webSocketDebuggerUrl'].replace('ws://localhost', f'ws://localhost')
    print('tab', page['id'], page['url'])
    exc = []
    async with websockets.connect(ws_url, max_size=None, ping_interval=None, open_timeout=30) as ws:
        seq = 0

        async def call(method, params=None, timeout=300):
            nonlocal seq
            seq += 1
            my = seq
            await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
            while True:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                meth = m.get('method')
                if meth == 'Runtime.exceptionThrown':
                    d = m['params']['exceptionDetails']
                    s = (d.get('exception', {}).get('description') or d.get('text', ''))[:900]
                    exc.append([time.strftime('%H:%M:%S'), 'exception', s])
                    print('!! EXCEPTION', s[:600], flush=True)
                elif meth == 'Runtime.consoleAPICalled' and m['params'].get('type') in ('error', 'warning'):
                    s = ' '.join(str(a.get('value', a.get('description', '')))[:300] for a in m['params'].get('args', []))
                    exc.append([time.strftime('%H:%M:%S'), 'console.' + m['params']['type'], s])
                    print('!! console.' + m['params']['type'], s[:400], flush=True)
                elif meth == 'Log.entryAdded' and m['params']['entry'].get('level') in ('error',):
                    e = m['params']['entry']
                    exc.append([time.strftime('%H:%M:%S'), 'log', (e.get('text') or '')[:400]])
                if m.get('id') == my:
                    return m

        async def ev(expr, timeout=300):
            r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
            return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

        await call('Runtime.enable')
        await call('Log.enable')
        if '--wait-battle' in ARGS:
            # 等玩家刷新页面并进入战斗(刷新期间求值会失败,忽略继续等)
            deadline = time.time() + int(OPT('--wait-max', '900'))
            while time.time() < deadline:
                try:
                    # 每轮都重新取引擎对象(玩家可能刚刷新过页面),并要求战场里真的有模拟在跑
                    await ev(ATTACH, timeout=40)
                    v = await ev("(() => { const r = window.__root; const g = r && r.lobbyGuardBattleRenderer; return r && r.currentView === 'battle' && g && g.sim && g.sim.phase !== 'victory' && g.sim.phase !== 'defeat' ? 'battle' : (r ? r.currentView : 'none'); })()", timeout=20)
                    if v == 'battle':
                        await asyncio.sleep(2)
                        break
                except Exception as error:
                    print('wait..', str(error)[:80], flush=True)
                await asyncio.sleep(3)
            print('battle detected', time.strftime('%H:%M:%S'), flush=True)
        print('ATTACH', await ev(ATTACH), flush=True)
        print('STATE', await ev(STATE), flush=True)
        if '--light' not in ARGS:
            print('HOOK', (await ev(HOOK) or '')[:200], flush=True)
        else:
            print('HOOK skipped (--light: 只记帧间隔与长任务,几乎不加负担)', flush=True)
        print('FRAMES', await ev(FRAMES), flush=True)
        profiling = '--no-profile' not in ARGS
        if profiling:
            await call('Profiler.enable')
            await call('Profiler.setSamplingInterval', {'interval': 1000})
            await call('Profiler.start')
        t0 = time.time()
        while time.time() - t0 < SECS:
            await asyncio.sleep(10)
            print(f'[{time.time() - t0:4.0f}s] STATE', await ev(STATE), flush=True)
        prof = None
        if profiling:
            prof = (await call('Profiler.stop', timeout=600))['result']['profile']
            json.dump(prof, open(os.path.join(base.SCRATCH, f'{TAG}_phone_profile.json'), 'w'))
        frames = await ev(FRAMES_DUMP)
        print('FRAMES_DUMP', frames, flush=True)
        dump = await ev(DUMP) if '--light' not in ARGS else '{}'
        out = {'frames': json.loads(frames) if frames and frames.startswith('{') else frames,
               'longframes': json.loads(dump) if dump and dump.startswith('{') else dump, 'errors': exc}
        json.dump(out, open(os.path.join(base.SCRATCH, f'{TAG}_phone.json'), 'w'), ensure_ascii=False, indent=1)
        lf = out['longframes'] if isinstance(out['longframes'], dict) else {}
        print('LONGFRAMES', lf.get('longFrames'), 'sumMs', lf.get('sumMs'))
        print('AGG', lf.get('agg'))
        print('UPLOADS', [(u[0], u[1], u[2]) for u in (lf.get('uploads') or [])][:12])
        print('ANIMS', (lf.get('anims') or [])[:10])
        if prof:
            summarize(prof, lambda s: print(s, flush=True))
        print('errors:', len(exc))


asyncio.run(main())
