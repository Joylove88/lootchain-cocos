# -*- coding: utf-8 -*-
"""补 BATTLE_FX_MEASURED_BOUNDS 实测表(2026-10-15 安卓真机:新手阵营普攻全是圆点)。

原生(安卓)上 Spine 是 C++ 实现,实时测包围盒会直接崩进程,渲染层在原生上只认实测表;表里没有的特效永远预热不成,
普攻弹体 / 命中 / 战技全部退回通用光点。本脚本扫 assets/scripts/scenes 下所有 `effect: '…', animation: '…'` 配置,
找出表里缺的,读工程已入库的骨骼(assets/resources/spine/effect/<code>),按网页端运行时测量的同一算法
(动画 25%/50%/80% 三时刻附件顶点并集)算出 {w,h,cx,cy}——这样安卓上的表现与网页端完全一致。
MODE=pixel 改用多帧亮区像素并集(仅对照用,与表里已有的实拍项口径也不同)。
用法:python tools/qa/fxprev/bounds_measure.py [特效名… | effect:动画…]  → bounds_measure.json + 打印可直接粘进表的行
"""
import asyncio, collections, glob, json, os, re, subprocess, sys, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
FX = os.path.join(REPO, 'assets', 'resources', 'spine', 'effect')
CFG = os.path.join(REPO, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyBattleSkillEffectConfig.ts')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP, HTTP = 9358, 8772
PROFILE = os.path.join(os.environ.get('TEMP', HERE), 'lootchain-qa', 'edge_bounds_measure')


def missing_pairs():
    cfg = open(CFG, encoding='utf-8').read()
    table = cfg[cfg.index('BATTLE_FX_MEASURED_BOUNDS: Record'):]
    table = table[:table.index('\n};')]
    have = set(k.lower() for k in re.findall(r"'([^']+:[^']+)':", table))
    pairs = collections.OrderedDict()
    for f in sorted(glob.glob(os.path.join(REPO, 'assets', 'scripts', 'scenes', '**', '*.ts'), recursive=True)):
        for m in re.finditer(r"effect:\s*'([^']+)',\s*animation:\s*'([^']+)'", open(f, encoding='utf-8').read()):
            key = f'{m.group(1)}:{m.group(2).lower()}'
            if key not in have:
                pairs[key] = (m.group(1), m.group(2))
    return list(pairs.values())


JS = r"""
// 与网页端运行时测量(LobbyGuardBattleRenderer.measureGuardFxExtent)同算法:动画 25% / 50% / 80% 三个时刻,
// 所有附件世界顶点的并集(spine-core getBounds)。原生拿到的表项因此与网页端实时量出来的完全一致。
window.measureRuntime = async function (name, anim) {
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl');
  const ctx2 = new spine.ManagedWebGLRenderingContext(gl);
  const am = new spine.AssetManager(ctx2, '/fx42/' + name + '/');
  am.loadBinary(name + '.skel'); am.loadTextureAtlas(name + '.atlas');
  for (let i = 0; i < 3000 && !am.isLoadingComplete(); i++) await new Promise(r => setTimeout(r, 20));
  if (am.hasErrors()) return { error: JSON.stringify(am.getErrors()) };
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(am.require(name + '.atlas'))).readSkeletonData(am.require(name + '.skel'));
  const skeleton = new spine.Skeleton(data);
  const state = new spine.AnimationState(new spine.AnimationStateData(data));
  const names = data.animations.map(a => a.name);
  const real = names.find(n => n.toLowerCase() === anim.toLowerCase());
  if (!real) { am.dispose(); return { error: 'no anim ' + anim + ' in ' + names.join(',') }; }
  state.setAnimation(0, real, false);
  const duration = Math.max(0.2, state.getCurrent(0).animation.duration || 1);
  const off = new spine.Vector2(), size = new spine.Vector2();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ratio of [0.25, 0.5, 0.8]) {
    const e = state.getCurrent(0); e.trackTime = duration * ratio; state.apply(skeleton); skeleton.update(0); skeleton.updateWorldTransform(spine.Physics.update);
    skeleton.getBounds(off, size);
    if (size.x > 0 && size.y > 0 && isFinite(size.x)) { x0 = Math.min(x0, off.x); y0 = Math.min(y0, off.y); x1 = Math.max(x1, off.x + size.x); y1 = Math.max(y1, off.y + size.y); }
  }
  am.dispose();
  if (!(isFinite(x0) && x1 - x0 > 8 && y1 - y0 > 8)) return { anim: real, empty: true };
  return { anim: real, w: Math.round(x1 - x0), h: Math.round(y1 - y0), cx: Math.round((x0 + x1) / 2), cy: Math.round((y0 + y1) / 2) };
};

// 像素口径(多帧亮区并集),仅供对照:MODE=pixel 时使用
window.measure = async function (name, anim, samples) {
  const SIZE = 640;
  const canvas = document.getElementById('c');
  canvas.width = SIZE; canvas.height = SIZE;
  const gl = canvas.getContext('webgl');
  const ctx2 = new spine.ManagedWebGLRenderingContext(gl);
  const renderer = new spine.SceneRenderer(canvas, ctx2);
  const am = new spine.AssetManager(ctx2, '/fx42/' + name + '/');
  am.loadBinary(name + '.skel'); am.loadTextureAtlas(name + '.atlas');
  for (let i = 0; i < 3000 && !am.isLoadingComplete(); i++) await new Promise(r => setTimeout(r, 20));
  if (am.hasErrors()) return { error: JSON.stringify(am.getErrors()) };
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(am.require(name + '.atlas'))).readSkeletonData(am.require(name + '.skel'));
  const skeleton = new spine.Skeleton(data);
  const state = new spine.AnimationState(new spine.AnimationStateData(data));
  const names = data.animations.map(a => a.name);
  const real = names.find(n => n.toLowerCase() === anim.toLowerCase());
  if (!real) return { error: 'no anim ' + anim + ' in ' + names.join(',') };
  state.setAnimation(0, real, false);
  const duration = state.getCurrent(0).animation.duration || 0.001;
  const pose = t => { const e = state.getCurrent(0); e.trackTime = t; state.apply(skeleton); skeleton.update(0); skeleton.updateWorldTransform(spine.Physics.update); };
  const times = []; for (let i = 0; i < samples; i++) times.push(duration * (i + 0.5) / samples);
  const off = new spine.Vector2(), size = new spine.Vector2();
  let vx0 = Infinity, vy0 = Infinity, vx1 = -Infinity, vy1 = -Infinity;
  for (const t of times) { pose(t); skeleton.getBounds(off, size); if (size.x > 0 && size.y > 0 && isFinite(size.x)) { vx0 = Math.min(vx0, off.x); vy0 = Math.min(vy0, off.y); vx1 = Math.max(vx1, off.x + size.x); vy1 = Math.max(vy1, off.y + size.y); } }
  if (!isFinite(vx0)) { vx0 = -600; vy0 = -600; vx1 = 600; vy1 = 600; }
  const cx = (vx0 + vx1) / 2, cy = (vy0 + vy1) / 2;
  const zoom = Math.max(vx1 - vx0, vy1 - vy0, 50) * 1.15 / SIZE;
  const buf = new Uint8Array(SIZE * SIZE * 4);
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1, lit = 0;
  for (const t of times) {
    pose(t);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    renderer.camera.position.set(cx, cy, 0); renderer.camera.zoom = zoom; renderer.camera.setViewport(SIZE, SIZE);
    renderer.begin(); renderer.drawSkeleton(skeleton, false); renderer.end();
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (Math.max(buf[i], buf[i + 1], buf[i + 2]) > 24) { lit++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  am.dispose();
  if (x1 < 0) return { anim: real, empty: true };
  const bx0 = cx + (x0 - SIZE / 2) * zoom, bx1 = cx + (x1 + 1 - SIZE / 2) * zoom;
  const by0 = cy + (y0 - SIZE / 2) * zoom, by1 = cy + (y1 + 1 - SIZE / 2) * zoom;
  return { anim: real, w: Math.round(bx1 - bx0), h: Math.round(by1 - by0), cx: Math.round((bx0 + bx1) / 2), cy: Math.round((by0 + by1) / 2),
           edge: x0 <= 0 || y0 <= 0 || x1 >= SIZE - 1 || y1 >= SIZE - 1, lit };
};
"""


async def main():
    pairs = missing_pairs()
    # 参数:特效名(只量表里缺的这些)或 effect:动画(不管表里有没有都量,用来和已有表项对口径)
    explicit = [tuple(a.split(':', 1)) for a in sys.argv[1:] if ':' in a]
    only = set(a for a in sys.argv[1:] if ':' not in a)
    if explicit:
        pairs = explicit
    elif only:
        pairs = [p for p in pairs if p[0] in only]
    print('to measure:', len(pairs), flush=True)
    env = dict(os.environ, FX_ROOT=FX)
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP)], cwd=HERE, env=env)
    os.makedirs(PROFILE, exist_ok=True)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP}', f'--user-data-dir={PROFILE}',
                             '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    out = {}
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        req = urllib.request.Request(f'http://127.0.0.1:{CDP}/json/new?http://127.0.0.1:{HTTP}/index.html', method='PUT')
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
            await ev(JS)
            for effect, anim in pairs:
                if os.environ.get('MODE') == 'pixel':
                    r = await ev(f'measure({json.dumps(effect)}, {json.dumps(anim)}, 24)')
                else:
                    r = await ev(f'measureRuntime({json.dumps(effect)}, {json.dumps(anim)})')
                key = f'{effect}:{anim.lower()}'
                out[key] = r
                print(key, json.dumps(r, ensure_ascii=False), flush=True)
    finally:
        proc.terminate()
        srv.terminate()
    with open(os.path.join(HERE, 'bounds_measure.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('\n// ── paste ──')
    for key, r in out.items():
        if r and 'w' in r:
            print(f"  '{key}': {{ w: {r['w']}, h: {r['h']}, cx: {r['cx']}, cy: {r['cy']} }},")


if __name__ == '__main__':
    asyncio.run(main())
