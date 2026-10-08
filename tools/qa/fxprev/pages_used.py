# -*- coding: utf-8 -*-
"""查某套特效的某个动画实际用到哪些图集页(用于给大套"只保留用到的页")。
用法:python pages_used.py <套名> <动画名>"""
import asyncio, json, os, subprocess, sys, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP_PORT = 9353
HTTP_PORT = 8767
PROFILE = os.path.join(HERE, 'edge_profile_pages')
SET, ANIM = sys.argv[1], sys.argv[2]

JS = r"""
(async () => {
  const name = __SET__, anim = __ANIM__;
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl');
  const ctx2 = new spine.ManagedWebGLRenderingContext(gl);
  const am = new spine.AssetManager(ctx2, '/fx42/' + encodeURIComponent(name) + '/');
  const skel = encodeURIComponent(name) + '.skel', atlas = encodeURIComponent(name) + '.atlas';
  am.loadBinary(skel); am.loadTextureAtlas(atlas);
  for (let i = 0; i < 3000 && !am.isLoadingComplete(); i++) await new Promise(r => setTimeout(r, 20));
  if (am.hasErrors()) return { error: JSON.stringify(am.getErrors()) };
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(am.require(atlas))).readSkeletonData(am.require(skel));
  const animation = data.findAnimation(anim);
  if (!animation) return { error: 'no anim', anims: data.animations.map(a => a.name) };
  // 动画里出现过的 (slot, attachmentName):attachment timeline 的名字 + 动画触及的槽位的 setup 附件
  const used = new Set();
  const touchedSlots = new Set();
  for (const tl of animation.timelines) {
    if (typeof tl.slotIndex === 'number') touchedSlots.add(tl.slotIndex);
    if (tl.attachmentNames) { for (const n of tl.attachmentNames) if (n) used.add(tl.slotIndex + '|' + n); }
    if (tl.attachment && typeof tl.slotIndex === 'number') used.add(tl.slotIndex + '|' + tl.attachment.name);
  }
  // 槽位 setup 附件:只要该槽位在动画里被触及(颜色/附件/变形)就算可能显示
  data.slots.forEach((sd, i) => { if (sd.attachmentName && touchedSlots.has(i)) used.add(i + '|' + sd.attachmentName); });
  const skin = data.defaultSkin;
  const pages = {}; const missing = [];
  for (const key of used) {
    const [si, an] = key.split('|');
    const att = skin.getAttachment(+si, an) || (data.skins.map(s => s.getAttachment(+si, an)).find(Boolean));
    if (!att) { missing.push(key); continue; }
    const region = att.region || (att.sequence && att.sequence.regions && att.sequence.regions[0]);
    const regions = att.sequence ? att.sequence.regions : [region];
    for (const rg of regions) { const p = rg && rg.page ? rg.page.name : (rg && rg.texture ? 'tex' : '?'); pages[p] = (pages[p] || 0) + 1; }
  }
  const allPages = am.require(atlas).pages.map(p => p.name);
  am.dispose();
  return { anim, duration: animation.duration, usedAttachments: used.size, pages, allPages, missing: missing.slice(0, 10) };
})()
"""


async def main():
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP_PORT)], cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={PROFILE}', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
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

            async def ev(expr):
                nonlocal seq
                seq += 1
                await ws.send(json.dumps({'id': seq, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get('id') == seq:
                        res = msg.get('result', {})
                        return res.get('result', {}).get('value') if 'exceptionDetails' not in res else str(res['exceptionDetails'])[:500]

            for _ in range(100):
                if await ev('!!window.__ready'):
                    break
                await asyncio.sleep(0.2)
            print(json.dumps(await ev(JS.replace('__SET__', json.dumps(SET)).replace('__ANIM__', json.dumps(ANIM))), ensure_ascii=False))
    finally:
        proc.terminate()
        srv.terminate()


if __name__ == '__main__':
    asyncio.run(main())
