# -*- coding: utf-8 -*-
"""找出片段里"铺满画面"的插槽(压暗底 / 满屏底色 / 镜头遮罩):逐帧算每个可见插槽附件的世界包围盒,
覆盖固定机位(1800x900,中心 0,150)面积 >= 55% 的记下来。 -> big_hu.json
用法:python big_hu.py [HERO ...]"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets
HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP, HTTP = 9356, 8770
FX = os.path.normpath(os.environ.get('FX_SRC') or 'D:/骨骼动画素材/hero_ult_out_4243/hero_ult_out_4243/fx42')
PICKS = json.load(open(os.path.join(HERE, 'picks_hu.json'), encoding='utf-8'))
JS = r"""
window.bigSlots = async function (name, t0, t1, samples) {
  const canvas = document.getElementById('c'), gl = canvas.getContext('webgl');
  const ctx2 = new spine.ManagedWebGLRenderingContext(gl);
  const am = new spine.AssetManager(ctx2, '/fx42/' + name + '/');
  am.loadBinary(name + '.skel'); am.loadTextureAtlas(name + '.atlas');
  for (let i = 0; i < 3000 && !am.isLoadingComplete(); i++) await new Promise(r => setTimeout(r, 20));
  if (am.hasErrors()) return { error: JSON.stringify(am.getErrors()) };
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(am.require(name + '.atlas'))).readSkeletonData(am.require(name + '.skel'));
  const skeleton = new spine.Skeleton(data), state = new spine.AnimationState(new spine.AnimationStateData(data));
  state.setAnimation(0, data.animations[0].name, false);
  const __hid = (window.__hiddenAll || {})['hu_' + name.replace(/^hu_/, '')] || [];
  const __filter = () => { for (const slot of skeleton.slots) { const n = slot.data.name; if (__hid.some(p => p.endsWith('*') ? n.startsWith(p.slice(0, -1)) : p === n)) { slot.attachment = null; continue; } const a = slot.attachment; if (!a) continue; const an = a.name || ''; const cut = an.indexOf('/'); if (cut < 0 || /^(bz\d*|buzhen|zhu)$/i.test(an.slice(0, cut))) slot.attachment = null; } };
  const VX0 = -900, VX1 = 900, VY0 = -300, VY1 = 600, VA = (VX1 - VX0) * (VY1 - VY0);
  const out = {};
  for (let k = 0; k < samples; k++) {
    const t = t0 + (t1 - t0) * (k + 0.5) / samples;
    state.getCurrent(0).trackTime = t; state.apply(skeleton); __filter(); skeleton.update(0); skeleton.updateWorldTransform(spine.Physics.update);
    for (const slot of skeleton.drawOrder) {
      const att = slot.attachment; if (!att || !slot.bone.active) continue;
      let verts = null;
      if (att instanceof spine.RegionAttachment) { verts = new Float32Array(8); att.computeWorldVertices(slot, verts, 0, 2); }
      else if (att instanceof spine.MeshAttachment) { verts = new Float32Array(att.worldVerticesLength); att.computeWorldVertices(slot, 0, att.worldVerticesLength, verts, 0, 2); }
      if (!verts) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < verts.length; i += 2) { x0 = Math.min(x0, verts[i]); x1 = Math.max(x1, verts[i]); y0 = Math.min(y0, verts[i + 1]); y1 = Math.max(y1, verts[i + 1]); }
      const ix = Math.max(0, Math.min(x1, VX1) - Math.max(x0, VX0)), iy = Math.max(0, Math.min(y1, VY1) - Math.max(y0, VY0));
      const cover = ix * iy / VA;
      const a = slot.color.a * skeleton.color.a * (att.color ? att.color.a : 1);
      if (cover >= 0.55 && a > 0.04) {
        const key = slot.data.name;
        const rec = out[key] || (out[key] = { att: att.name, region: att.region && att.region.name || att.path || att.name, blend: slot.data.blendMode, maxA: 0, frames: 0, rgb: null });
        rec.maxA = Math.max(rec.maxA, Math.round(a * 100) / 100); rec.frames += 1;
        rec.rgb = [slot.color.r, slot.color.g, slot.color.b].map(v => Math.round(v * 100) / 100).join(',');
      }
    }
  }
  am.dispose();
  return out;
};
"""


async def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP)], env=dict(os.environ, FX_ROOT=FX))
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP}', f'--user-data-dir={os.path.join(HERE, "edge_profile_bighu")}',
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
            await ev('window.__hiddenAll = {}; 1')
            await ev(JS)
            only = set(sys.argv[1:])
            for hero, row in PICKS.items():
                if only and hero not in only:
                    continue
                name, t0, t1 = row[:3]
                if os.environ.get('FX_PREFIX'):
                    name = os.environ['FX_PREFIX'] + name
                r = await ev(f'bigSlots({json.dumps(name)}, {t0}, {t1}, 30)')
                out[hero] = {'set': row[0], 'slots': r}
                print(hero, row[0], t0, t1)
                for slot, rec in (r or {}).items():
                    print('    ', slot, json.dumps(rec, ensure_ascii=False))
    finally:
        proc.terminate()
        srv.terminate()
    json.dump(out, open(os.path.join(HERE, 'big_hu.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


asyncio.run(main())
