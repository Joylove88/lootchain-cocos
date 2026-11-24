# -*- coding: utf-8 -*-
"""启动「正在读取本地缓存」耗时实测(2026-11-24 用户:「这个界面等了 1 分钟,以为卡死了」)。

  python tools/qa/cache_boot_bench.py fill [--stale N]       用固定配置目录打开本地正式包,把清单里所有文件塞进缓存(+N 个旧版本假文件)
  python tools/qa/cache_boot_bench.py cold                    不进游戏直接量:读索引、并发查开局包 3 千个文件、整表列缓存各要多久(重启后第一次跑才是真冷)
  python tools/qa/cache_boot_bench.py boot [选项]             重开浏览器(冷启动)打开游戏,打印 lootchain.bootTrace 各阶段耗时
        --after S          进登录后再等 S 秒,看后台核对 / 清理做完没有(缓存条数、本地索引条数 / 是否完整、整表扫标记、后台下载队列)
        --keep-version     不清版本标记 = 平时再打开(走免加载页的快速启动);默认清 = 模拟「游戏更新后第一次打开」(用户卡 1 分钟就是这种)
        --no-index         开局前删掉本地索引(模拟这版第一次打开)
        --watch            每 0.1 秒读一次加载页标题 / 进度 / 提示,打印变化序列
        --delay-manifest S 资源清单请求拖 S 秒再放行(看没有进度时的走动光条 + 计秒)
        --shots 1.5,3      导航后这些秒数各截一张图(存 %TEMP%/lootchain-qa/cache_bench_shots/)
        --fresh            先清空配置目录(新玩家)
        --console          打印启动期间的 console 警告 / 报错
        --block-prefetch   后台下载请求一律失败(测清理时不让缓存长回去超过列表上限)
        --settle S         结束前等 S 秒再正常关浏览器(默认 4,让 localStorage 落盘)
  python tools/qa/cache_boot_bench.py stale-drop [--count N]  删掉 fill 塞的 N 个旧版本假文件(默认 20000)
  python tools/qa/cache_boot_bench.py stale-add [--count N] [--indexed M]  塞 N 个索引外 + M 个记进索引的假旧文件(测清理)
  python tools/qa/cache_boot_bench.py tamper                  把一个「同名改内容」文件在缓存里换成坏内容、清它的核对记录(下次启动应被删掉重下)
  python tools/qa/cache_boot_bench.py check-mutable --path P  查缓存里 P 的内容哈希和清单是否一致
  通用:--profile NAME 用 %TEMP%/lootchain-qa/cache_bench_profile_NAME(默认 cache_bench_profile);--port N 调试端口(默认 9399,并行跑两个时错开)
页面默认 http://localhost:7460/(PREVIEW_PORT 可改)。冷启动 = 浏览器进程重开,系统文件缓存还是热的,比用户开机后第一次打开快;看相对变化。
"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
QA = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
ARGS = sys.argv[1:]
PROFILE_NAME = ('cache_bench_profile_' + ARGS[ARGS.index('--profile') + 1]) if '--profile' in ARGS else 'cache_bench_profile'
PROFILE = os.path.join(QA, PROFILE_NAME)
SHOTS = os.path.join(QA, 'cache_bench_shots')
PORT = int(ARGS[ARGS.index('--port') + 1]) if '--port' in ARGS else 9399
PAGE = f"http://localhost:{os.environ.get('PREVIEW_PORT', '7460')}/"
INDEX_KEY = 'lootchain-cache-index.json'
CACHE = 'lootchain-assets-v1'


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


FILL = r"""(async () => {
  const m = await (await fetch('asset-manifest.json', { cache: 'no-store' })).json();
  const cache = await caches.open('%(cache)s');
  const files = m.files.map(f => f[0]); let i = 0, ok = 0; const t0 = performance.now();
  const worker = async () => { while (i < files.length) { const p = files[i++]; try { const r = await fetch(p); if (r.ok) { await cache.put(p, r); ok++; } } catch (e) {} } };
  await Promise.all(Array.from({ length: 24 }, worker));
  let stale = 0; const N = %(stale)d;
  for (let k = 0; k < N; k++) { await cache.put('assets/stale/old_' + k + '.bin', new Response('x'.repeat(64))); stale++; }
  return { files: files.length, ok, stale, sec: ((performance.now() - t0) / 1000).toFixed(1) };
})()"""

# 开局前在同源空页面上做:清上次的启动记录 + 版本标记(模拟「游戏更新后第一次打开」,否则走免加载页的快速启动,根本不经过读缓存这一步);
# --no-index 时删掉本地索引(模拟这版第一次打开)
PREP = r"""(async () => {
  const before = { preload: localStorage.getItem('lootchain.bootPreload.version'), fullPack: localStorage.getItem('lootchain.fullPack.version') };
  localStorage.removeItem('lootchain.bootTrace');
  if (%(release)s) { for (const k of ['lootchain.fullPack.version', 'lootchain.mutableChecked', 'lootchain.cacheSweep']) localStorage.removeItem(k); }
  let indexDeleted = null;
  if (%(drop)s) { const c = await caches.open('%(cache)s'); indexDeleted = await c.delete('%(key)s'); }
  return { indexDeleted, before };
})()"""

# 不进游戏,直接量冷缓存:读索引 → 开局包那 3 千个文件并发查一遍(新做法没有索引时)→ 再整表列一遍(旧做法)。机器重启后第一次跑才是真冷
COLD = r"""(async () => {
  const m = await (await fetch('asset-manifest.json', { cache: 'no-store' })).json();
  const core = m.files.slice(0, m.core || m.files.length).map(f => f[0]);
  const t0 = performance.now(); const c = await caches.open('%(cache)s'); const openMs = Math.round(performance.now() - t0);
  const t1 = performance.now(); const idx = await c.match('%(key)s'); const indexMs = Math.round(performance.now() - t1);
  let i = 0, hits = 0; const t2 = performance.now();
  await Promise.all(Array.from({ length: 24 }, async () => { while (i < core.length) { const p = core[i++]; try { if (await c.match(p, { ignoreVary: true })) hits++; } catch (e) {} } }));
  const matchMs = Math.round(performance.now() - t2);
  const t3 = performance.now(); let keys; try { keys = (await c.keys()).length; } catch (e) { keys = String(e.message || e); } const keysMs = Math.round(performance.now() - t3);
  return { openMs, indexMs, index: !!idx, coreMatchMs: matchMs, coreHits: hits, core: core.length, keysMs, keys };
})()"""

MEASURE = r"""(async () => {
  const c = await caches.open('%(cache)s');
  const t0 = performance.now(); let keys = null, stale = null; try { const ks = await c.keys(); keys = ks.length; stale = ks.filter(r => r.url.includes('/assets/stale/')).length; } catch (e) { keys = String(e.message || e); } const keysMs = Math.round(performance.now() - t0);
  let index = null;
  const hit = await c.match('%(key)s');
  if (hit) { const d = await hit.json(); index = { files: d.files.length, complete: d.complete }; }
  const pack = globalThis.__lootchainPack;
  const nav = performance.getEntriesByType('navigation')[0];
  const slow = performance.getEntriesByType('resource').sort((a, b) => b.duration - a.duration).slice(0, 4)
    .map(r => r.name.replace(location.origin, '').slice(0, 60) + ' ' + Math.round(r.startTime) + '+' + Math.round(r.duration) + 'ms');
  return { nav: nav ? { html: Math.round(nav.responseEnd), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) } : null, slow, keys, stale, keysMs, index, sweep: localStorage.getItem('lootchain.cacheSweep'), fullPack: localStorage.getItem('lootchain.fullPack.version'),
    preload: localStorage.getItem('lootchain.bootPreload.version'), sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), build: window.__lootchainBuild || null,
    mem: globalThis.__lootchainCacheIndex ? { size: globalThis.__lootchainCacheIndex.size(), complete: globalThis.__lootchainCacheIndex.complete() } : null,
    pack: pack ? { queue: pack.queue.length, inFlight: pack.inFlight.size, have: pack.have.size, failed: pack.failed.size, complete: pack.isComplete() } : null };
})()"""

# 加载页三行字(节点名见 LootChainGameRoot.runBootPreload)
WATCH = r"""(() => {
  const cc = globalThis.cc; const scene = cc && cc.director && cc.director.getScene(); if (!scene) return null;
  const find = (n, name) => { if (n.name === name) return n; for (const c of n.children) { const r = find(c, name); if (r) return r; } return null; };
  const get = (name) => { const n = find(scene, name); if (!n) return null; const l = n.getComponent(cc.Label) || n.getComponentInChildren(cc.Label); return l ? l.string : null; };
  return [get('BootLoadingTitle'), get('BootLoadingPercent'), get('BootLoadingHint')];
})()"""

STALE_DROP = r"""(async () => {
  const c = await caches.open('%(cache)s'); let n = 0, i = 0; const N = %(count)d;
  await Promise.all(Array.from({ length: 16 }, async () => { while (i < N) { const k = i++; if (await c.delete('assets/stale/old_' + k + '.bin')) n++; } }));
  return { deleted: n };
})()"""

# 塞 N 个索引外的假旧文件(模拟这版以前留下的)+ M 个记进索引的假旧文件(模拟上个版本下载、索引里记着的)
STALE_ADD = r"""(async () => {
  const c = await caches.open('%(cache)s'); const N = %(count)d, M = %(indexed)d;
  for (let k = 0; k < N; k++) await c.put('assets/stale/orphan_' + k + '.bin', new Response('x'));
  const hit = await c.match('%(key)s'); const d = hit ? await hit.json() : { v: 1, complete: false, files: [] };
  for (let k = 0; k < M; k++) { const p = 'assets/stale/indexed_' + k + '.bin'; await c.put(p, new Response('y')); d.files.push(p); }
  await c.put('%(key)s', new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } }));
  return { orphans: N, indexed: M, indexFiles: d.files.length, complete: d.complete };
})()"""

TAMPER = r"""(async () => {
  const m = await (await fetch('asset-manifest.json', { cache: 'no-store' })).json();
  const c = await caches.open('%(cache)s');
  const nonCore = new Set(m.files.slice(m.core).map(f => f[0]));
  const path = Object.keys(m.mutable || {}).find(p => nonCore.has(p));
  if (!path) return { error: 'no mutable path' };
  await c.put(path, new Response('broken-on-purpose', { headers: { 'content-type': 'image/png' } }));
  const v = JSON.parse(localStorage.getItem('lootchain.mutableVerified') || '{}'); v[path] = 'tampered'; localStorage.setItem('lootchain.mutableVerified', JSON.stringify(v));
  return { path, expect: m.mutable[path] };
})()"""

CHECK_MUTABLE = r"""(async () => {
  const m = await (await fetch('asset-manifest.json', { cache: 'no-store' })).json();
  const c = await caches.open('%(cache)s'); const hit = await c.match('%(path)s', { ignoreVary: true });
  if (!hit) return { cached: false };
  const buf = await hit.arrayBuffer(); const d = new Uint8Array(await crypto.subtle.digest('SHA-1', buf));
  const hex = Array.from(d.subarray(0, 8), b => b.toString(16).padStart(2, '0')).join('');
  return { cached: true, bytes: buf.byteLength, hash: hex, expect: (m.mutable || {})['%(path)s'], ok: hex === (m.mutable || {})['%(path)s'] };
})()"""


class Tab:
    """CDP 页面连接:后台读消息,按 id 回结果,事件按方法名分发。"""

    def __init__(self, ws):
        self.ws = ws
        self.n = 100
        self.pending = {}
        self.handlers = {}
        self.reader = asyncio.create_task(self._read())

    async def _read(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                if 'id' in msg:
                    fut = self.pending.pop(msg['id'], None)
                    if fut and not fut.done():
                        fut.set_result(msg)
                else:
                    handler = self.handlers.get(msg.get('method'))
                    if handler:
                        asyncio.create_task(handler(msg.get('params', {})))
        except Exception:
            pass

    async def call(self, method, params=None, timeout=60):
        self.n += 1
        mid = self.n
        fut = asyncio.get_running_loop().create_future()
        self.pending[mid] = fut
        await self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
        msg = await asyncio.wait_for(fut, timeout)
        if 'error' in msg:
            raise RuntimeError(msg['error'])
        return msg.get('result', {})

    async def ev(self, expr, timeout=900):
        r = await self.call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True}, timeout)
        if r.get('exceptionDetails'):
            return {'exception': r['exceptionDetails'].get('exception', {}).get('description') or r['exceptionDetails'].get('text')}
        return r.get('result', {}).get('value')

    async def goto(self, url, settle=1.0):
        await self.call('Page.navigate', {'url': url})
        await asyncio.sleep(settle)

    async def shot(self, name):
        r = await self.call('Page.captureScreenshot', {'format': 'png'})
        os.makedirs(SHOTS, exist_ok=True)
        path = os.path.join(SHOTS, name + '.png')
        open(path, 'wb').write(base64.b64decode(r['data']))
        return path


def kill_profile():
    # 只杀用这个配置目录的(目录名后面紧跟引号 / 空格 / 行尾),别把 cache_bench_profile_fresh 之类同前缀的一起杀了
    script = (r"""$pat = [regex]::Escape($env:LC_BENCH_PROFILE) + '(["\s]|$)'; """
              "Get-CimInstance Win32_Process | ? { $_.Name -eq 'msedge.exe' -and $_.CommandLine -match $pat } | "
              "% { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }")
    subprocess.run(['powershell', '-NoProfile', '-Command', script], capture_output=True, env={**os.environ, 'LC_BENCH_PROFILE': PROFILE})


def launch():
    kill_profile()   # 上次被打断留下的同配置目录浏览器会抢走调试端口
    if '--fresh' in ARGS:
        shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(PROFILE, exist_ok=True)
    proc = subprocess.Popen([EDGE, '--headless=new', '--disable-extensions', '--no-first-run', f'--remote-debugging-port={PORT}',
                             f'--user-data-dir={PROFILE}', '--window-size=1280,720', 'about:blank'])
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
            break
        except Exception:
            time.sleep(0.5)
    return proc


async def close_browser():
    # 正常关浏览器(本地存储要靠正常退出才落盘;直接杀进程会丢掉最后几秒写的 localStorage,下次启动看着像没记过标记)
    try:
        info = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=3))
        async with websockets.connect(info['webSocketDebuggerUrl'], max_size=2 ** 20) as bws:
            await bws.send(json.dumps({'id': 1, 'method': 'Browser.close'}))
            try:
                await asyncio.wait_for(bws.recv(), 5)
            except Exception:
                pass
    except Exception:
        pass


def stop(proc):
    try:
        proc.wait(timeout=15)
    except Exception:
        proc.kill()
    kill_profile()
    time.sleep(1)


def deltas(trace):
    try:
        items = json.loads(trace)
    except Exception:
        return trace
    out, last = [], 0
    for name, ms in items:
        out.append(f'{name} +{ms - last}ms')
        last = ms
    return ' | '.join(out) + f'  (total {last}ms)'


async def boot(tab):
    after = float(arg('--after', '0'))
    await tab.goto(PAGE + 'version.json', 1.0)
    print('prep', await tab.ev(PREP % {'drop': 'true' if '--no-index' in ARGS else 'false', 'key': INDEX_KEY, 'cache': CACHE,
                                       'release': 'false' if '--keep-version' in ARGS else 'true'}))
    logs = []
    if '--console' in ARGS:
        async def on_console(params):
            if params.get('type') in ('warning', 'error'):
                text = ' '.join(str(a.get('value', a.get('description', '')))[:160] for a in params.get('args', []))
                logs.append(f"{params.get('type')}: {text}")
        tab.handlers['Runtime.consoleAPICalled'] = on_console
        await tab.call('Runtime.enable')
    delay = float(arg('--delay-manifest', '0'))
    block = '--block-prefetch' in ARGS
    if delay > 0 or block:
        async def on_paused(params):
            url = params.get('request', {}).get('url', '')
            headers = {k.lower(): v for k, v in params.get('request', {}).get('headers', {}).items()}
            if 'asset-manifest.json' in url and delay > 0:
                await asyncio.sleep(delay)
            elif block and 'x-lootchain-prefetch' in headers:
                await tab.call('Fetch.failRequest', {'requestId': params['requestId'], 'errorReason': 'Aborted'})
                return
            await tab.call('Fetch.continueRequest', {'requestId': params['requestId']})
        tab.handlers['Fetch.requestPaused'] = on_paused
        patterns = ([{'urlPattern': '*asset-manifest.json*'}] if delay > 0 else []) + ([{'urlPattern': '*/assets/*'}, {'urlPattern': '*/cocos-js/*'}] if block else [])
        await tab.call('Fetch.enable', {'patterns': patterns})
    t0 = time.time()
    shot_tasks = []
    for t in [float(x) for x in arg('--shots', '').split(',') if x]:
        async def shot_at(t=t):
            await asyncio.sleep(max(0.0, t - (time.time() - t0)))
            try:
                print(f'shot {t}s ->', await tab.shot(f'boot_{t:.1f}s'))
            except Exception as error:
                print(f'shot {t}s failed', error)
        shot_tasks.append(asyncio.create_task(shot_at()))
    await tab.goto(PAGE, 0.2)
    trace, states, last_state = None, [], None
    while time.time() - t0 < 300:   # 等进到登录页(bootTrace 里出现 login)
        if '--watch' in ARGS:
            try:
                state = await tab.ev(WATCH, 5)
            except Exception:
                state = None
            if isinstance(state, list) and state != last_state:
                states.append((round(time.time() - t0, 2), state))
                last_state = state
        try:
            trace = await tab.ev("localStorage.getItem('lootchain.bootTrace')", 10)
        except Exception:
            trace = None
        if isinstance(trace, str) and '"login"' in trace:
            break
        if '--keep-version' in ARGS and trace is None and time.time() - t0 > 8:
            print('no bootTrace after 8 s -> quick path (no loading screen)')
            break
        await asyncio.sleep(0.1 if '--watch' in ARGS else 0.5)
    print('wall to login', round(time.time() - t0, 1), 's')
    print('bootTrace', deltas(trace) if isinstance(trace, str) else trace)
    for t, state in states:
        print(f'  {t:6.2f}s  {state}')
    for task in shot_tasks:
        await task
    if after > 0:
        await asyncio.sleep(after)
    print(f'after +{after:.0f}s', await tab.ev(MEASURE % {'key': INDEX_KEY, 'cache': CACHE}))
    for line in logs[:40]:
        print('  console', line)


async def main():
    cmd = ARGS[0] if ARGS else 'boot'
    proc = launch()
    try:
        page = next(t for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=5)) if t.get('type') == 'page')
        async with websockets.connect(page['webSocketDebuggerUrl'], max_size=2 ** 26) as ws:
            tab = Tab(ws)
            await tab.call('Page.enable')
            if cmd == 'cold':
                await tab.goto(PAGE + 'version.json', 1.0)
                print('cold', await tab.ev(COLD % {'key': INDEX_KEY, 'cache': CACHE}))
            elif cmd == 'fill':
                await tab.goto(PAGE, 25)   # 先让页面自己的开局包下载跑完、缓存建起来
                print('fill', await tab.ev(FILL % {'stale': int(arg('--stale', '0')), 'cache': CACHE}))
            elif cmd == 'stale-drop':
                await tab.goto(PAGE + 'version.json', 1.0)
                print('stale-drop', await tab.ev(STALE_DROP % {'count': int(arg('--count', '20000')), 'cache': CACHE}))
            elif cmd == 'stale-add':
                await tab.goto(PAGE + 'version.json', 1.0)
                print('stale-add', await tab.ev(STALE_ADD % {'count': int(arg('--count', '500')), 'indexed': int(arg('--indexed', '300')), 'cache': CACHE, 'key': INDEX_KEY}))
            elif cmd == 'tamper':
                await tab.goto(PAGE + 'version.json', 1.0)
                print('tamper', await tab.ev(TAMPER % {'cache': CACHE}))
            elif cmd == 'check-mutable':
                await tab.goto(PAGE + 'version.json', 1.0)
                print('check', await tab.ev(CHECK_MUTABLE % {'cache': CACHE, 'path': arg('--path', '')}))
            else:
                await boot(tab)
            tab.reader.cancel()
        await asyncio.sleep(float(arg('--settle', '4')))   # 等浏览器把 localStorage 写盘再正常关(硬杀会把写日志弄坏,之后写的全丢)
        await close_browser()
    finally:
        stop(proc)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
