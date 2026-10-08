# -*- coding: utf-8 -*-
"""量 22 个专属大招的"核心亮区":逐帧按亮度加权取 10%~90% 分位框(去掉飞得很远的淡粒子),
再取亮度 >= 峰值 45% 的帧的并集,输出骨骼坐标系 {w,h,cx,cy}(与 BATTLE_FX_MEASURED_BOUNDS 同口径)。
用法:python core_measure.py  → core_bounds.json"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP_PORT = 9352
HTTP_PORT = 8766
PROFILE = os.path.join(HERE, 'edge_profile_core')

ULTS_ALL = {
    'v2_s681_4029': ('4029', 'skill02'), 'v2_s681_3022': ('3022', 'skill01_1'), 'v2_s681_6031': ('6031', 'attackall'),
    'v2_s681_6015': ('6015', 'attackall'), 'v2_s681_6014': ('6014', 'skill01_1'), 'v2_s681_5001': ('5001', 'skill01_3'),
    'v2_s681_2014': ('2014', 'skill04_1'), 'v2_s681_1006': ('1006', 'skill01_2'), 'v2_s681_3012': ('3012', 'skill01_1'),
    'v2_s681_4024': ('4024', 'skill01'), 'v2_s681_2001': ('2001', 'skill02_2'), 'v2_s681_5008': ('5008', 'skill01_1'),
    'v2_s681_4003': ('4003', 'skill01_2'), 'v2_s681_5012': ('5012', 'skill03'), 'v2_s681_1001': ('1001', 'attackall'),
    'v2_s681_6009': ('6009', 'skill02_3'), 'v2_s681_4006': ('4006', 'skill03'), 'v2_s681_4030': ('4030', 'skill03'),
    'v2_s681_1007': ('1007', 'skill02'), 'v2_s681_6033': ('6033', 'skill03_1'), 'v2_s681_1015': ('1015', 'skill01_1'),
    'v2_s681_4004': ('4004', 'skill01_1'), 'v2_s681_6030': ('6030', 'skill01_2_1'),
}

import sys as _s
ULTS = {k: v for k, v in ULTS_ALL.items() if len(_s.argv) < 2 or k in _s.argv[1:]}
JS_CORE = r"""
window.coreSet = async function (name, anim, samples) {
  const SIZE = 512;
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl');
  const ctx2 = new spine.ManagedWebGLRenderingContext(gl);
  const renderer = new spine.SceneRenderer(canvas, ctx2);
  const am = new spine.AssetManager(ctx2, '/fx42/' + encodeURIComponent(name) + '/');
  const skel = encodeURIComponent(name) + '.skel', atlas = encodeURIComponent(name) + '.atlas';
  am.loadBinary(skel); am.loadTextureAtlas(atlas);
  for (let i = 0; i < 3000 && !am.isLoadingComplete(); i++) await new Promise(r => setTimeout(r, 20));
  if (am.hasErrors()) return { error: JSON.stringify(am.getErrors()) };
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(am.require(atlas))).readSkeletonData(am.require(skel));
  const skeleton = new spine.Skeleton(data);
  const state = new spine.AnimationState(new spine.AnimationStateData(data));
  const names = data.animations.map(a => a.name);
  const real = names.find(n => n.toLowerCase() === anim.toLowerCase()) || names.find(n => n.toLowerCase().includes(anim.toLowerCase())) || names[0];
  state.setAnimation(0, real, false);
  const duration = state.getCurrent(0).animation.duration || 0.001;
  const pose = t => { const e = state.getCurrent(0); e.trackTime = t; state.apply(skeleton); skeleton.update(0); skeleton.updateWorldTransform(spine.Physics.update); };
  const times = []; for (let i = 0; i < samples; i++) times.push(duration * (i + 0.5) / samples);
  const off = new spine.Vector2(), size = new spine.Vector2();
  let vx0 = Infinity, vy0 = Infinity, vx1 = -Infinity, vy1 = -Infinity;
  for (const t of times) { pose(t); skeleton.getBounds(off, size); if (size.x > 0 && size.y > 0 && isFinite(size.x)) { vx0 = Math.min(vx0, off.x); vy0 = Math.min(vy0, off.y); vx1 = Math.max(vx1, off.x + size.x); vy1 = Math.max(vy1, off.y + size.y); } }
  if (!isFinite(vx0)) { vx0 = -600; vy0 = -600; vx1 = 600; vy1 = 600; }
  const cx = (vx0 + vx1) / 2, cy = (vy0 + vy1) / 2;
  const zoom = Math.max(vx1 - vx0, vy1 - vy0) * 1.1 / SIZE;
  const buf = new Uint8Array(SIZE * SIZE * 4);
  const frames = [];
  for (const t of times) {
    pose(t);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    renderer.camera.position.set(cx, cy, 0); renderer.camera.zoom = zoom; renderer.camera.setViewport(SIZE, SIZE);
    renderer.begin(); renderer.drawSkeleton(skeleton, false); renderer.end();
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const colW = new Float64Array(SIZE), rowW = new Float64Array(SIZE);
    let sum = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const m = Math.max(buf[i], buf[i + 1], buf[i + 2]);
      if (m > 24) { const w = m * m; colW[x] += w; rowW[y] += w; sum += w; }
    }
    if (sum <= 0) { frames.push({ t, sum: 0 }); continue; }
    const q = (arr, p) => { let acc = 0; const target = sum * p; for (let i = 0; i < SIZE; i++) { acc += arr[i]; if (acc >= target) return i; } return SIZE - 1; };
    const box = p => { const x0 = q(colW, p), x1 = q(colW, 1 - p) + 1, y0 = q(rowW, p), y1 = q(rowW, 1 - p) + 1;
      return { x0: cx + (x0 - SIZE / 2) * zoom, x1: cx + (x1 - SIZE / 2) * zoom, y0: cy + (y0 - SIZE / 2) * zoom, y1: cy + (y1 - SIZE / 2) * zoom }; };
    frames.push({ t, sum, b80: box(0.1), b90: box(0.05) });
  }
  am.dispose();
  return { anim: real, duration, frames };
};
"""


async def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP_PORT)], cwd=HERE)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={PROFILE}',
                             '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    out = {}
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        req = urllib.request.Request(f'http://127.0.0.1:{CDP_PORT}/json/new?http://127.0.0.1:{HTTP_PORT}/index.html', method='PUT')
        target = json.load(urllib.request.urlopen(req, timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def ev(expr, timeout=180):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if msg.get('id') == my:
                        res = msg.get('result', {})
                        if 'exceptionDetails' in res:
                            return {'error': str(res['exceptionDetails'])[:400]}
                        return res.get('result', {}).get('value')

            for _ in range(100):
                if await ev('!!window.__ready'):
                    break
                await asyncio.sleep(0.2)
            await ev(JS_CORE)
            for code, (setname, anim) in ULTS.items():
                r = await ev(f'coreSet({json.dumps(setname)}, {json.dumps(anim)}, 24)')
                if not r or 'frames' not in r:
                    print(code, 'ERR', r)
                    continue
                fr = [f for f in r['frames'] if f.get('sum', 0) > 0]
                peak = max(f['sum'] for f in fr)
                good = [f for f in fr if f['sum'] >= peak * 0.45]
                def union(key):
                    x0 = min(f[key]['x0'] for f in good); x1 = max(f[key]['x1'] for f in good)
                    y0 = min(f[key]['y0'] for f in good); y1 = max(f[key]['y1'] for f in good)
                    return {'w': round(x1 - x0), 'h': round(y1 - y0), 'cx': round((x0 + x1) / 2), 'cy': round((y0 + y1) / 2)}
                # 峰值帧的 80% 框(单帧最亮时刻的主体大小)
                pk = max(fr, key=lambda f: f['sum'])['b80']
                out[code] = {'anim': r['anim'], 'duration': round(r['duration'], 3), 'core80': union('b80'), 'core90': union('b90'),
                             'peak80': {'w': round(pk['x1'] - pk['x0']), 'h': round(pk['y1'] - pk['y0'])}, 'peakT': round(max(fr, key=lambda f: f['sum'])['t'], 3), 'goodFrames': len(good), 'frames': len(fr)}
                print(code, json.dumps(out[code], ensure_ascii=False))
    finally:
        proc.terminate()
        srv.terminate()
    with open(os.path.join(HERE, 'core_bounds.json' if len(sys.argv) < 2 else 'core_bounds_extra.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    asyncio.run(main())
