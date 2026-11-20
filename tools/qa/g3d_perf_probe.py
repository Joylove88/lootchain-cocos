# -*- coding: utf-8 -*-
"""3D 小样性能账实测(2026-11-20,低端设备兼容方案用):无头 Edge 打开带 3D 开关的地址(线上 / 本地正式包都行),量:
  - 显存:钩住 WebGL 的贴图 / 缓冲区 / 渲染缓冲上传,按对象记字节(贴图按 层级 × 面 去重,generateMipmap 记 +1/3)
  - 下载:Network.loadingFinished 的 encodedDataLength,分「g3d_ 模型」和「其它」;首帧 / 主角就位 / 建筑到齐各自的秒数
  - 几何:info() 里的 draws / tris(引擎每帧统计)
  - 测速:地址带 &bench=1 时,等小样自己的逐项测速跑完,取 window.__g3dBench
用法:python tools/qa/g3d_perf_probe.py "<地址>" <标签> [--size=1440x900] [--dpr=2] [--wait=420] [--nobench]
     QA_GPU=low 时加 --force_low_power_gpu(本机 AMD 核显)。
输出 %TEMP%/lootchain-qa/perf/<标签>.json + .png。一次只跑一个;跑完按配置目录清掉自己起的 Edge(edge_guard)。"""
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

os.environ.setdefault('EDGE_PORT', '9368')
import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
URL = ARGS[0]
TAG = ARGS[1] if len(ARGS) > 1 else 'probe'
W, H = (int(x) for x in OPT.get('size', '1440x900').split('x'))
DPR = float(OPT.get('dpr', '2'))
WAIT = int(OPT.get('wait', '420'))
OUT = os.path.join(base.SCRATCH, 'perf')
os.makedirs(OUT, exist_ok=True)

HOOK = r"""(() => {
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x881A: 8, 0x8814: 16, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822E: 4, 0x822F: 4, 0x8230: 8, 0x88F0: 4, 0x81A6: 4, 0x8CAC: 4, 0x81A5: 2,
    0x8C3A: 4, 0x8051: 4, 0x8C41: 4, 0x1908: 4, 0x1907: 4, 0x1909: 1, 0x190A: 2, 0x1906: 1, 0x1902: 4, 0x84F9: 4, 0x8D48: 1, 0x8056: 2, 0x8057: 2, 0x8D62: 2, 0x8CAD: 8 };
  const CH = { 0x1908: 4, 0x1907: 3, 0x1909: 1, 0x190A: 2, 0x1906: 1, 0x1902: 1, 0x84F9: 1, 0x1903: 1, 0x8227: 2, 0x8D94: 1, 0x8D98: 3, 0x8D99: 4 };
  const TS = { 0x1401: 1, 0x1400: 1, 0x1403: 2, 0x1402: 2, 0x1405: 4, 0x1404: 4, 0x1406: 4, 0x140B: 2, 0x8D61: 2, 0x8033: 2, 0x8034: 2, 0x8363: 2, 0x84FA: 4, 0x8368: 4, 0x8C3B: 4, 0x8DAD: 8 };
  const M = { tex: new Map(), buf: new Map(), rb: new Map() };
  window.__glm = M;
  const st = new WeakMap();
  const S = (gl) => { let s = st.get(gl); if (!s) { s = { unit: 0, tex: {}, buf: {}, rb: null }; st.set(gl, s); } return s; };
  const bound = (gl, target) => { const s = S(gl); const t = (target >= 0x8515 && target <= 0x851A) ? 0x8513 : target; return s.tex[s.unit + ':' + t]; };
  const put = (tex, key, bytes, w, h) => { if (!tex) return; let e = M.tex.get(tex); if (!e) { e = { parts: new Map(), w: 0, h: 0 }; M.tex.set(tex, e); } e.parts.set(key, bytes); if (w * h > e.w * e.h) { e.w = w; e.h = h; } };
  const wrap = (P) => {
    if (!P) return;
    const o = {};
    for (const k of ['activeTexture', 'bindTexture', 'texImage2D', 'texStorage2D', 'compressedTexImage2D', 'generateMipmap', 'deleteTexture', 'bindBuffer', 'bufferData', 'deleteBuffer',
                     'bindRenderbuffer', 'renderbufferStorage', 'renderbufferStorageMultisample', 'deleteRenderbuffer', 'texImage3D', 'texStorage3D']) o[k] = P[k];
    P.activeTexture = function (u) { S(this).unit = u - 0x84C0; return o.activeTexture.apply(this, arguments); };
    P.bindTexture = function (t, x) { S(this).tex[S(this).unit + ':' + t] = x; return o.bindTexture.apply(this, arguments); };
    P.texImage2D = function (target, level, ifmt) {
      try {
        let w, h, bpp;
        if (arguments.length >= 8) { w = arguments[3]; h = arguments[4]; const fmt = arguments[6], type = arguments[7]; bpp = BPP[ifmt] || (CH[fmt] || 4) * (TS[type] || 1); }
        else { const src = arguments[5]; w = src.videoWidth || src.naturalWidth || src.width; h = src.videoHeight || src.naturalHeight || src.height; const fmt = arguments[3], type = arguments[4]; bpp = BPP[ifmt] || (CH[fmt] || 4) * (TS[type] || 1); }
        put(bound(this, target), target + ':' + level, w * h * bpp, w, h);
      } catch (e) {}
      return o.texImage2D.apply(this, arguments);
    };
    if (o.texStorage2D) P.texStorage2D = function (target, levels, ifmt, w, h) {
      try { const faces = target === 0x8513 ? 6 : 1; let b = 0, ww = w, hh = h; for (let i = 0; i < levels; i++) { b += ww * hh; ww = Math.max(1, ww >> 1); hh = Math.max(1, hh >> 1); }
            put(bound(this, target), 'storage', b * faces * (BPP[ifmt] || 4), w, h); } catch (e) {}
      return o.texStorage2D.apply(this, arguments);
    };
    if (o.texStorage3D) P.texStorage3D = function (target, levels, ifmt, w, h, d) {
      try { put(bound(this, target), 'storage3d', w * h * d * (BPP[ifmt] || 4) * (levels > 1 ? 4 / 3 : 1), w, h); } catch (e) {}
      return o.texStorage3D.apply(this, arguments);
    };
    P.compressedTexImage2D = function (target, level, ifmt, w, h) {
      try { const d = arguments[arguments.length - 1]; put(bound(this, target), target + ':' + level, d && d.byteLength ? d.byteLength : w * h, w, h); } catch (e) {}
      return o.compressedTexImage2D.apply(this, arguments);
    };
    P.generateMipmap = function (target) {
      try { const e = M.tex.get(bound(this, target)); if (e) { let b0 = 0; for (const [k, v] of e.parts) if (k.endsWith(':0')) b0 += v; e.parts.set('mip', b0 / 3); } } catch (e) {}
      return o.generateMipmap.apply(this, arguments);
    };
    P.deleteTexture = function (x) { M.tex.delete(x); return o.deleteTexture.apply(this, arguments); };
    P.bindBuffer = function (t, x) { S(this).buf[t] = x; return o.bindBuffer.apply(this, arguments); };
    P.bufferData = function (t, d) { try { const x = S(this).buf[t]; if (x) M.buf.set(x, typeof d === 'number' ? d : (d ? d.byteLength : 0)); } catch (e) {} return o.bufferData.apply(this, arguments); };
    P.deleteBuffer = function (x) { M.buf.delete(x); return o.deleteBuffer.apply(this, arguments); };
    P.bindRenderbuffer = function (t, x) { S(this).rb = x; return o.bindRenderbuffer.apply(this, arguments); };
    P.renderbufferStorage = function (t, f, w, h) { try { if (S(this).rb) M.rb.set(S(this).rb, w * h * (BPP[f] || 4)); } catch (e) {} return o.renderbufferStorage.apply(this, arguments); };
    if (o.renderbufferStorageMultisample) P.renderbufferStorageMultisample = function (t, n, f, w, h) { try { if (S(this).rb) M.rb.set(S(this).rb, w * h * (BPP[f] || 4) * Math.max(1, n)); } catch (e) {} return o.renderbufferStorageMultisample.apply(this, arguments); };
    P.deleteRenderbuffer = function (x) { M.rb.delete(x); return o.deleteRenderbuffer.apply(this, arguments); };
  };
  wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  window.__glMem = () => {
    const MB = (b) => +(b / 1048576).toFixed(1);
    let tex = 0; const sizes = {};
    for (const e of M.tex.values()) { let b = 0; for (const v of e.parts.values()) b += v; tex += b; const k = e.w + 'x' + e.h; sizes[k] = sizes[k] || { n: 0, mb: 0 }; sizes[k].n++; sizes[k].mb += b / 1048576; }
    let buf = 0; for (const v of M.buf.values()) buf += v;
    let rb = 0; for (const v of M.rb.values()) rb += v;
    const top = Object.entries(sizes).map(([k, v]) => [k, v.n, +v.mb.toFixed(1)]).sort((a, b) => b[2] - a[2]).slice(0, 14);
    return { texMB: MB(tex), bufMB: MB(buf), rbMB: MB(rb), totalMB: MB(tex + buf + rb), texCount: M.tex.size, bufCount: M.buf.size, top };
  };
})();"""

JS_STATE = r"""(() => {
  const d = window.__g3dd;
  if (!d) return { state: 'nodbg' };
  const i = d.info();
  const dg = d.dungeon || {};
  return { state: i.opened ? 'ok' : (i.error ? 'error ' + i.error : 'wait'), lead: !!dg.leader, bldDone: dg.bldDone, bldTotal: dg.bldTotal, tier: i.tier, fps: i.fps, fpsLow: i.fpsLow,
           draws: i.draws, tris: i.tris, hud: i.hud, gpu: i.gpu, autoQ: i.autoQ, bench: window.__g3dBench || null, mem: window.__glMem ? window.__glMem() : null };
})()"""


async def main():
    profile = os.path.join(base.SCRATCH, 'perf_profile_' + TAG)
    shutil.rmtree(profile, ignore_errors=True)
    flags = ['--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', f'--window-size={W},{H}',
             '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--enable-precise-memory-info']
    if os.environ.get('QA_GPU') == 'low':
        flags.append('--force_low_power_gpu')
    if 'uncap' in OPT:          # 不锁 60 帧:独显上才量得出真实帧时
        flags += ['--disable-gpu-vsync', '--disable-frame-rate-limit']
    proc = subprocess.Popen([base.EDGE] + flags + ['about:blank'])
    rec = {'url': URL, 'tag': TAG, 'size': [W, H], 'dpr': DPR, 'gpuFlag': os.environ.get('QA_GPU', 'default')}
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
            net = {'g3d': 0, 'other': 0, 'g3dFiles': 0, 'files': 0}
            urls = {}
            big = []
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
                    meth = x.get('method')
                    if meth == 'Network.responseReceived':
                        urls[x['params']['requestId']] = x['params']['response'].get('url', '')
                    elif meth == 'Network.loadingFinished':
                        u = urls.get(x['params']['requestId'], '')
                        n = x['params'].get('encodedDataLength', 0)
                        k = 'g3d' if '/g3d_' in u else 'other'
                        net[k] += n
                        big.append((n, u[-110:]))
                        net['files'] += 1
                        if k == 'g3d':
                            net['g3dFiles'] += 1
                    elif meth == 'Runtime.exceptionThrown':
                        issues.append('exception ' + json.dumps(x['params'].get('exceptionDetails', {}), ensure_ascii=False)[:240])

            await call('Runtime.enable')
            await call('Network.enable')
            await call('Network.setBypassServiceWorker', {'bypass': True})          # 否则 sw.js 代取的模型不出现在页面的网络事件里
            await call('Performance.enable')
            await call('Page.enable')
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': HOOK})
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': DPR, 'mobile': False})
            await call('Page.bringToFront')
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            marks = {}
            last = None
            stable = 0
            benchWanted = 'bench=1' in URL and 'nobench' not in OPT
            while time.time() - t0 < WAIT:
                await asyncio.sleep(3)
                r = await call('Runtime.evaluate', {'expression': JS_STATE, 'returnByValue': True})
                cur = r.get('result', {}).get('result', {}).get('value') or {}
                el = round(time.time() - t0, 1)
                if cur.get('state') == 'ok' and 'opened' not in marks:
                    marks['opened'] = el
                if cur.get('lead') and 'hero' not in marks:
                    marks['hero'] = el
                if cur.get('bldTotal') and cur.get('bldDone') == cur.get('bldTotal') and 'bld' not in marks:
                    marks['bld'] = el
                    rec['memAtLoad'] = cur.get('mem')
                brief = {k: cur.get(k) for k in ('state', 'lead', 'bldDone', 'bldTotal', 'fps', 'draws', 'tris')}
                if brief != last:
                    print('%5.1fs' % el, json.dumps(brief, ensure_ascii=False), flush=True)
                last = brief
                if str(cur.get('state', '')).startswith('error'):
                    break
                if benchWanted:
                    if cur.get('bench'):
                        break
                elif cur.get('state') == 'ok' and (not cur.get('bldTotal') or cur.get('bldDone') == cur.get('bldTotal')):
                    stable += 1
                    if stable >= 6:
                        break
            r = await call('Runtime.evaluate', {'expression': JS_STATE, 'returnByValue': True})
            rec['final'] = r.get('result', {}).get('result', {}).get('value')
            pm = await call('Performance.getMetrics')
            rec['jsHeapMB'] = round(next((m['value'] for m in pm['result']['metrics'] if m['name'] == 'JSHeapUsedSize'), 0) / 1048576, 1)
            rec['marks'] = marks
            rec['netMB'] = {k: (round(v / 1048576, 1) if k in ('g3d', 'other') else v) for k, v in net.items()}
            rec['issues'] = issues[:8]
            big.sort(reverse=True)
            rec['bigFiles'] = [[round(n / 1048576, 2), u] for n, u in big[:40]]
            ext = {}
            for n, u in big:
                e = u.split('?')[0].rsplit('.', 1)[-1][:6]
                ext[e] = ext.get(e, 0) + n
            rec['netByExt'] = {k: round(v / 1048576, 1) for k, v in sorted(ext.items(), key=lambda kv: -kv[1])[:10]}
            rec['secs'] = round(time.time() - t0)
            m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 80}, 120)
            if 'result' in m:
                open(os.path.join(OUT, TAG + '.jpg'), 'wb').write(base64.b64decode(m['result']['data']))
            with open(os.path.join(OUT, TAG + '.json'), 'w', encoding='utf-8') as f:
                json.dump(rec, f, ensure_ascii=False, indent=1)
            fin = rec['final'] or {}
            print('RESULT', json.dumps({'tag': TAG, 'marks': marks, 'net': rec['netMB'], 'mem': fin.get('mem'), 'draws': fin.get('draws'), 'tris': fin.get('tris'), 'tier': fin.get('tier'),
                                        'gpu': (fin.get('gpu') or '')[:60], 'hud': fin.get('hud'), 'jsHeapMB': rec['jsHeapMB'], 'bench': fin.get('bench'), 'issues': len(issues)}, ensure_ascii=False), flush=True)
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
