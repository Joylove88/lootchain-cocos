# -*- coding: utf-8 -*-
"""预览里直接调 mountHeadCrop 看它为什么返回 false(2026-10-11 统计头像静态裁图排查)。"""
import asyncio, json, os, subprocess, time, urllib.request
import websockets
import boss_bar_cdp as base
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle2.js'), encoding='utf-8').read()
PROBE = r"""(async () => { const r = window.__gr, cc = window.__cc; const out = {};
  const ally = (r.snapshot && r.snapshot.allies || []).find(a => a && a.heroCode);
  out.ally = ally ? { heroCode: ally.heroCode, unitKey: ally.unitKey, portraitAsset: ally.portraitAsset, spineAsset: ally.spineAsset } : null;
  const im = await (await fetch('scripting/x/import-map.json', { cache: 'no-store' })).json();
  const k = Object.keys(im.imports).find(x => /LobbyHeroApi\.ts$/.test(x)); const H = await System.import(k);
  out.hasResolver = typeof H.resolveHeroCardArtPath; out.cardArt = ally ? H.resolveHeroCardArtPath(ally.heroCode) : null;
  if (out.cardArt) { const path = out.cardArt + '/spriteFrame'; const f = cc.resources.get(path, cc.SpriteFrame); out.cached = !!f;
    if (f) { out.frame = { rect: [f.rect.x, f.rect.y, f.rect.width, f.rect.height], orig: [f.originalSize.width, f.originalSize.height], off: [f.offset.x, f.offset.y], tex: f.texture ? [f.texture.width, f.texture.height] : null, valid: f.isValid }; }
    const key = out.cardArt.split('/').pop(); out.cropKey = key; out.cropRow = r.constructor.HERO_HEAD_CROPS ? r.constructor.HERO_HEAD_CROPS[key] : 'no table';
    try { const holder = r.host.addChildPlainNode(r.root, 'ProbeHolder', 0, 0, 40, 40); out.mountResult = r.mountHeadCrop(holder, out.cardArt, 36); out.children = holder.children.map(c => c.name + ':' + c.children.length); holder.destroy(); } catch (e) { out.mountErr = String(e && e.stack || e).slice(0, 400); }
  }
  return JSON.stringify(out); })()"""
async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run', '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try: urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception: time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            async def call(m, p=None):
                nonlocal seq; seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), 900))
                    if x.get('id') == my: return x
            async def ev(e):
                r = (await call('Runtime.evaluate', {'expression': e, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:500] if 'exceptionDetails' in r else r.get('result', {}).get('value')
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True})
            await call('Page.navigate', {'url': base.PAGE}); await asyncio.sleep(8)
            print(await ev(base.JS_BOOT)); print(await ev(base.JS_LOGIN)); print((await ev(JS_BATTLE) or '')[:80])
            for _ in range(40):
                if (await ev("!!(window.__gr && window.__gr.sim && window.__gr.snapshot)")) is True: break
                await asyncio.sleep(1)
            await asyncio.sleep(4)
            print('PROBE', await ev(PROBE))
    finally: proc.terminate()
asyncio.run(main())
