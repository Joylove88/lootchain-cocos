# -*- coding: utf-8 -*-
"""手机横屏模拟:进账号登录页,真实点账号输入框(CDP 触摸),输入中触发 3 次整刷 + 后台图片到货,
检查输入框是否还是同一个、焦点还在、已输入内容还在;然后正常登录进大厅。"""
import asyncio, json, os, subprocess, time, urllib.request
import websockets
import boss_bar_cdp as base

UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
TO_ACCOUNT = r"""(async () => { const cc = window.__cc, root = window.__root; const sleep = ms => new Promise(r => setTimeout(r, ms));
  let btn = null; const w = n => { if (btn) return; if (n.name === 'MainAccountLoginButton') { btn = n; return; } n.children.forEach(w); }; w(cc.director.getScene());
  if (btn) btn.emit(cc.Button.EventType.CLICK); for (let i = 0; i < 20 && root.currentView !== 'loginAccount'; i++) await sleep(300);
  const boxes = []; const w2 = n => { const e = n.getComponent && n.getComponent(cc.EditBox); if (e) boxes.push(e); n.children.forEach(w2); }; w2(cc.director.getScene());
  const b = boxes[0]; const p = b.node.getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3(0, 0, 0)); const vs = cc.view.getVisibleSize(); const c = cc.game.canvas.getBoundingClientRect();
  window.__box0 = b; return JSON.stringify({ view: root.currentView, n: boxes.length, x: c.left + p.x / vs.width * c.width, y: c.top + (1 - p.y / vs.height) * c.height }); })()"""
CHECK = r"""(() => { const b = window.__box0; const a = document.activeElement;
  return JSON.stringify({ sameAlive: !!(b && b.isValid && b.node.isValid), active: a ? a.tagName : null, val: a && a.value, str: b && b.isValid ? b.string : null }); })()"""
STRESS = r"""(async () => { const root = window.__root; const sleep = ms => new Promise(r => setTimeout(r, ms));
  const im = await (await fetch('scripting/x/import-map.json', { cache: 'no-store' })).json();
  const key = Object.keys(im.imports).find(k => /ScreenAdapter\.ts$/.test(k)); const SA = await System.import(key);
  const pre = { active: SA.isTextInputActive(), last: root.lastRenderedView, cur: root.currentView };
  root.renderCurrentView(); const b = window.__box0; pre.afterOne = !!(b && b.isValid); pre.deferred = root.renderDeferredForInput;
  if (!pre.afterOne) return JSON.stringify(pre);
  for (let k = 0; k < 3; k++) { root.renderCurrentView(); root.uiSpriteFrameCache.scheduleRenderRefresh(); await sleep(400); }
  root.uiSpriteFrameCache.preloadGroup('forge'); await sleep(2500); return JSON.stringify(pre); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(method, params=None):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 400))
                    if m.get('id') == my:
                        return m

            async def ev(expr, timeout=400):
                r = (await asyncio.wait_for(call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}), timeout)).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True,
                                                               'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.navigate', {'url': base.PAGE})
            await asyncio.sleep(8)
            print('boot', await ev(base.JS_BOOT, 900))
            pos = json.loads(await ev(TO_ACCOUNT))
            print('account', pos)
            pt = [{'x': pos['x'], 'y': pos['y'], 'id': 1}]
            await call('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pt})
            await asyncio.sleep(0.08)
            await call('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            await asyncio.sleep(0.8)
            print('点开后', await ev(CHECK))
            await call('Input.insertText', {'text': 'abc'})
            await asyncio.sleep(0.3)
            print('输入 abc', await ev(CHECK))
            print('stress', await ev(STRESS))
            print('整刷 + 图片到货后', await ev(CHECK))
            await call('Input.insertText', {'text': '12'})
            await asyncio.sleep(0.3)
            print('继续输入 12', await ev(CHECK))
    finally:
        proc.terminate()


asyncio.run(main())
