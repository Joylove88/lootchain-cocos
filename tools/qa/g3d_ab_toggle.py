# -*- coding: utf-8 -*-
"""3D 小样「现场切换」A/B 对照(2026-11-20,低端设备兼容第 1 期):同一个页面里用两段 JS 在 A / B 两种做法之间来回切,
  1) 画面:暂停游戏逻辑 + 冻结着色器时间(cc_time),同一帧分别截 A、A、B 三张 —— A 对 A 是噪声底,A 对 B 的差别若不超过噪声底 = 画面不变;
  2) 速度:恢复运行,不锁 60 帧,A / B 交替各量若干轮(每轮 3 秒),比每帧毫秒、面数、绘制次数。
用法:python tools/qa/g3d_ab_toggle.py "<地址>" <标签> --a="<切到 A 的 JS>" --b="<切到 B 的 JS>" [--rounds=4] [--size=1440x900] [--dpr=2] [--settle=8]
     例:--a="__g3dd.dungeon.moon.csmLevel=4" --b="__g3dd.dungeon.moon.csmLevel=1"
     QA_GPU=low 时用本机 AMD 核显。输出 %TEMP%/lootchain-qa/perf/ab_<标签>_*.png + ab_<标签>.json。一次只跑一个,跑完按配置目录清掉 Edge。"""
import asyncio
import base64
import io
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets
from PIL import Image, ImageChops

os.environ.setdefault('EDGE_PORT', '9369')
import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
URL = ARGS[0]
TAG = ARGS[1] if len(ARGS) > 1 else 'ab'
# 多组:--multi=<json 文件>,内容 [{"name": "...", "a": "<JS>", "b": "<JS>", "pix": true}, ...],一次加载连测;--init=<JS> 页面就绪后先执行一次
PAIRS = json.load(open(OPT['multi'], encoding='utf-8')) if 'multi' in OPT else [{'name': TAG, 'a': OPT['a'], 'b': OPT['b'], 'pix': True}]
JS_INIT = OPT.get('init', '')
ROUNDS = int(OPT.get('rounds', '4'))
W, H = (int(x) for x in OPT.get('size', '1440x900').split('x'))
DPR = float(OPT.get('dpr', '2'))
SETTLE = float(OPT.get('settle', '8'))
OUT = os.path.join(base.SCRATCH, 'perf')
os.makedirs(OUT, exist_ok=True)

JS_READY = r"""(() => { const d = window.__g3dd; if (!d) return 'nodbg'; const i = d.info(); const g = d.dungeon || {};
  if (i.error) return 'error ' + i.error; if (!i.opened || !g.leader) return 'wait'; if (g.bldTotal && g.bldDone < g.bldTotal) return 'bld'; return 'ok'; })()"""

# 冻结:暂停逻辑(动画 / 粒子 / 角色),再让每帧传给渲染的时间增量为 0(着色器里的 cc_time 不再走)
JS_FREEZE = r"""(() => { const r = cc.director.root; cc.director.pause(); if (!r.__abMove) { r.__abMove = r.frameMove; r.frameMove = function () { return r.__abMove.call(this, 0); }; } return true; })()"""
JS_THAW = r"""(() => { const r = cc.director.root; if (r.__abMove) { r.frameMove = r.__abMove; delete r.__abMove; } cc.director.resume(); return true; })()"""

JS_MEASURE = r"""new Promise((res) => { const dev = cc.director.root.device; let n = 0, sum = 0, worst = 0, last = 0, tris = 0, draws = 0; const t0 = performance.now();
  const tick = (now) => { if (last) { const d = now - last; sum += d; n++; worst = Math.max(worst, d); tris += dev.numTris; draws += dev.numDrawCalls; } last = now;
    if (now - t0 < %d || n < 5) requestAnimationFrame(tick); else res({ avg: sum / n, worst, n, tris: Math.round(tris / n), draws: Math.round(draws / n) }); };
  requestAnimationFrame(tick); })"""


def diff(a, b):
    d = ImageChops.difference(a.convert('RGB'), b.convert('RGB'))
    r, g, bl = d.split()
    hist = ImageChops.lighter(ImageChops.lighter(r, g), bl).histogram()          # 每个像素三通道里差得最多的那个
    cnt = sum(hist[1:])
    mx = max((v for v in range(256) if hist[v]), default=0)
    return {'changedPx': cnt, 'changedPct': round(cnt * 100 / (a.width * a.height), 4), 'maxDiff': mx}, d


async def main():
    profile = os.path.join(base.SCRATCH, 'ab_profile_' + TAG)
    shutil.rmtree(profile, ignore_errors=True)
    flags = ['--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', f'--window-size={W},{H}',
             '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit']
    if os.environ.get('QA_GPU') == 'low':
        flags.append('--force_low_power_gpu')
    proc = subprocess.Popen([base.EDGE] + flags + ['about:blank'])
    rec = {'url': URL, 'tag': TAG, 'gpuFlag': os.environ.get('QA_GPU', 'default')}
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            issues = []

            async def call(m, p=None, timeout=120):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x
                    if x.get('method') == 'Runtime.exceptionThrown':
                        issues.append(json.dumps(x['params'].get('exceptionDetails', {}), ensure_ascii=False)[:240])

            async def ev(expr, timeout=120):
                r = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True}, timeout)
                res = r.get('result', {})
                if 'exceptionDetails' in res:
                    raise RuntimeError(json.dumps(res['exceptionDetails'], ensure_ascii=False)[:400])
                return res.get('result', {}).get('value')

            async def shot(name):
                await asyncio.sleep(1.2)          # 冻结状态下让几帧画完(切换后阴影图 / 管线重建)
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                data = base64.b64decode(m['result']['data'])
                open(os.path.join(OUT, f'ab_{TAG}_{name}.png'), 'wb').write(data)
                return Image.open(io.BytesIO(data))

            await call('Runtime.enable')
            await call('Page.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': DPR, 'mobile': False})
            await call('Page.bringToFront')
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            st = ''
            while time.time() - t0 < 600:
                await asyncio.sleep(3)
                st = await ev(JS_READY)
                if st == 'ok' or str(st).startswith('error'):
                    break
            print('ready', st, round(time.time() - t0), 's', flush=True)
            if st != 'ok':
                raise RuntimeError('not ready: ' + str(st))
            await asyncio.sleep(SETTLE)
            if JS_INIT:
                await ev(JS_INIT)
                await asyncio.sleep(2)
            rec['pairs'] = []
            for pair in PAIRS:
                name, JS_A, JS_B = pair['name'], pair['a'], pair['b']
                pr = {'name': name, 'a': JS_A, 'b': JS_B}
                if pair.get('pix', True):
                    # 1) 画面
                    await ev(JS_FREEZE)
                    await ev(JS_A)
                    a1 = await shot(name + '_A1')
                    a2 = await shot(name + '_A2')
                    await ev(JS_B)
                    b1 = await shot(name + '_B')
                    await ev(JS_A)
                    a3 = await shot(name + '_A3')
                    noise, _ = diff(a1, a2)
                    ab, dimg = diff(a1, b1)
                    back, _ = diff(a1, a3)
                    dimg.point(lambda v: min(255, v * 16)).save(os.path.join(OUT, f'ab_{TAG}_{name}_diffx16.png'))
                    pr['pixels'] = {'A_vs_A': noise, 'A_vs_B': ab, 'A_vs_A_after_B': back}
                    print(name, 'pixels', json.dumps(pr['pixels'], ensure_ascii=False), flush=True)
                    await ev(JS_THAW)
                # 2) 速度
                runs = []
                for i in range(ROUNDS):
                    for lab, js in (('A', JS_A), ('B', JS_B)) if i % 2 == 0 else (('B', JS_B), ('A', JS_A)):
                        await ev(js)
                        await asyncio.sleep(1.5)
                        m = await ev(JS_MEASURE % 3000, 60)
                        if not isinstance(m, dict):
                            print('measure failed', lab, m, flush=True)
                            continue
                        m['ab'] = lab
                        runs.append(m)
                summ = {}
                for lab in ('A', 'B'):
                    rs = [r for r in runs if r['ab'] == lab] or [{'avg': 0, 'tris': 0, 'draws': 0}]
                    summ[lab] = {'avg': round(sum(r['avg'] for r in rs) / len(rs), 2), 'tris': round(sum(r['tris'] for r in rs) / len(rs)), 'draws': round(sum(r['draws'] for r in rs) / len(rs))}
                summ['B_vs_A_pct'] = round((summ['B']['avg'] - summ['A']['avg']) * 100 / summ['A']['avg'], 1) if summ['A']['avg'] else None
                await ev(JS_A)
                pr['runs'] = runs
                pr['summary'] = summ
                rec['pairs'].append(pr)
                print('RESULT', name, json.dumps({'pixels': pr.get('pixels'), 'summary': summ}, ensure_ascii=False), flush=True)
            rec['issues'] = issues[:6]
            with open(os.path.join(OUT, f'ab_{TAG}.json'), 'w', encoding='utf-8') as f:
                json.dump(rec, f, ensure_ascii=False, indent=1)
            print('ISSUES', len(issues), flush=True)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            proc.kill()
        try:
            import edge_guard
            edge_guard.kill_profiles([profile])
        except Exception:  # noqa: BLE001
            pass


asyncio.run(main())
