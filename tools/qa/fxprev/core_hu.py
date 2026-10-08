# -*- coding: utf-8 -*-
"""新批次大招(时间窗口)量包围盒:两遍相机(先粗后细),逐帧亮度加权分位框;
core = 亮度>=峰值45% 帧的 10~90% 框并集;loose = 亮度>=峰值20% 帧的 2~98% 框并集。 -> core_hu.json"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets
HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP, HTTP = 9355, 8769
FX = os.path.normpath('D:/骨骼动画素材/hero_ult_out_4243/hero_ult_out_4243/fx42')
PICKS = json.load(open(os.path.join(HERE, 'picks_hu.json'), encoding='utf-8'))
JS = r"""
window.coreWin = async function (name, t0, t1, samples) {
  const SIZE = 512, canvas = document.getElementById('c'), gl = canvas.getContext('webgl');
  const ctx2 = new spine.ManagedWebGLRenderingContext(gl), renderer = new spine.SceneRenderer(canvas, ctx2);
  const am = new spine.AssetManager(ctx2, '/fx42/' + name + '/');
  am.loadBinary(name + '.skel'); am.loadTextureAtlas(name + '.atlas');
  for (let i = 0; i < 3000 && !am.isLoadingComplete(); i++) await new Promise(r => setTimeout(r, 20));
  if (am.hasErrors()) return { error: JSON.stringify(am.getErrors()) };
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(am.require(name + '.atlas'))).readSkeletonData(am.require(name + '.skel'));
  const skeleton = new spine.Skeleton(data), state = new spine.AnimationState(new spine.AnimationStateData(data));
  const anim = data.animations[0].name; state.setAnimation(0, anim, false);
  const __hid = (window.__hiddenAll || {})['hu_' + name.replace(/^hu_/, '')] || [];
  const __filter = () => { for (const slot of skeleton.slots) { const n = slot.data.name; if (__hid.some(p => p.endsWith('*') ? n.startsWith(p.slice(0, -1)) : p === n)) { slot.attachment = null; continue; } const a = slot.attachment; if (!a) continue; const an = a.name || ''; const cut = an.indexOf('/'); if (cut < 0 || /^(bz\d*|buzhen|zhu)$/i.test(an.slice(0, cut))) slot.attachment = null; } };
  const pose = t => { state.getCurrent(0).trackTime = t; state.apply(skeleton); __filter(); skeleton.update(0); skeleton.updateWorldTransform(spine.Physics.update); };
  const times = []; for (let i = 0; i < samples; i++) times.push(t0 + (t1 - t0) * (i + 0.5) / samples);
  const buf = new Uint8Array(SIZE * SIZE * 4);
  const pass = (cx, cy, zoom) => { const frames = [];
    for (const t of times) { pose(t);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.camera.position.set(cx, cy, 0); renderer.camera.zoom = zoom; renderer.camera.setViewport(SIZE, SIZE);
      renderer.begin(); renderer.drawSkeleton(skeleton, false); renderer.end();
      gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const colW = new Float64Array(SIZE), rowW = new Float64Array(SIZE); let sum = 0;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const i = (y * SIZE + x) * 4; const m = Math.max(buf[i], buf[i + 1], buf[i + 2]); if (m > 24) { const w = m * m; colW[x] += w; rowW[y] += w; sum += w; } }
      if (sum <= 0) { frames.push({ t, sum: 0 }); continue; }
      const q = (arr, p) => { let acc = 0; const target = sum * p; for (let i = 0; i < SIZE; i++) { acc += arr[i]; if (acc >= target) return i; } return SIZE - 1; };
      const box = p => ({ x0: cx + (q(colW, p) - SIZE / 2) * zoom, x1: cx + (q(colW, 1 - p) + 1 - SIZE / 2) * zoom, y0: cy + (q(rowW, p) - SIZE / 2) * zoom, y1: cy + (q(rowW, 1 - p) + 1 - SIZE / 2) * zoom });
      frames.push({ t, sum: sum * zoom * zoom, b80: box(0.1), b96: box(0.02) }); }
    return frames; };
  const union = (frames, key, ratio) => { const fr = frames.filter(f => f.sum > 0); const peak = Math.max(...fr.map(f => f.sum)); const good = fr.filter(f => f.sum >= peak * ratio);
    return { x0: Math.min(...good.map(f => f[key].x0)), x1: Math.max(...good.map(f => f[key].x1)), y0: Math.min(...good.map(f => f[key].y0)), y1: Math.max(...good.map(f => f[key].y1)) }; };
  let frames = pass(0, 150, 12000 / SIZE);
  if (!frames.some(f => f.sum > 0)) { am.dispose(); return { error: 'empty window' }; }
  let u = union(frames, 'b96', 0.2);
  let cx = (u.x0 + u.x1) / 2, cy = (u.y0 + u.y1) / 2, zoom = Math.max(u.x1 - u.x0, u.y1 - u.y0, 200) * 1.5 / SIZE;
  frames = pass(cx, cy, zoom);
  const rnd = b => ({ w: Math.round(b.x1 - b.x0), h: Math.round(b.y1 - b.y0), cx: Math.round((b.x0 + b.x1) / 2), cy: Math.round((b.y0 + b.y1) / 2) });
  const fr = frames.filter(f => f.sum > 0); const pk = fr.reduce((a, b) => (b.sum > a.sum ? b : a));
  am.dispose();
  return { anim, core: rnd(union(frames, 'b80', 0.45)), loose: rnd(union(frames, 'b96', 0.2)), peakT: Math.round(pk.t * 1000) / 1000 };
};
"""


async def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP)], env=dict(os.environ, FX_ROOT=FX))
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP}', f'--user-data-dir={os.path.join(HERE, "edge_profile_corehu")}',
                             '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    out = {}
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        target = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{CDP}/json/new?http://127.0.0.1:{HTTP}/index.html', method='PUT'), timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def ev(expr):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), 180))
                    if msg.get('id') == my:
                        res = msg.get('result', {})
                        return {'error': str(res['exceptionDetails'])[:300]} if 'exceptionDetails' in res else res.get('result', {}).get('value')

            for _ in range(100):
                if await ev('!!window.__ready'):
                    break
                await asyncio.sleep(0.2)
            await ev('window.__hiddenAll = ' + json.dumps(json.load(open(os.path.join(HERE, 'hide_hu.json')))) + '; 1')
            await ev(JS)
            only = set(sys.argv[1:])
            for hero, row in PICKS.items():
                name, t0, t1, speed, anchor = row[:5]
                m0, m1 = (row[5], row[6]) if len(row) > 6 else (t0, t1)
                if only and hero not in only:
                    continue
                r = await ev(f'coreWin({json.dumps(name)}, {m0}, {m1}, 24)')
                out[hero] = dict(r or {}, set=name, t0=t0, t1=t1, speed=speed, anchor=anchor)
                print(hero, name, json.dumps(r, ensure_ascii=False))
    finally:
        proc.terminate()
        srv.terminate()
    path = os.path.join(HERE, 'core_hu.json')
    prev = json.load(open(path, encoding='utf-8')) if os.path.exists(path) and sys.argv[1:] else {}
    prev.update(out)
    json.dump(prev, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


asyncio.run(main())
