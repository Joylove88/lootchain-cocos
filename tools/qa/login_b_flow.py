# -*- coding: utf-8 -*-
"""登录页 B 风格单页回归(11-11):电脑视口 + CDP 真实鼠标点击 / 真实键入(无头触摸事件到不了引擎)。
1 点账号框输入 → 输入中强制整刷 3 次,框还是同一个、焦点和内容都在;
2 点密码框输入;3 点协议勾选两次(整页重绘)后两个框内容仍在;4 点「登录」进大厅。
用法:PREVIEW_PORT=7456 QA_USER=guidetest02 QA_PASS=pass1234 python login_b_flow.py"""
import asyncio, json, os, subprocess, time, urllib.request
import websockets
import boss_bar_cdp as base

USER = os.environ.get('QA_USER', 'guidetest02')
PASS = os.environ.get('QA_PASS', 'pass1234')
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
FIND_ROOT = "(() => { const cc = window.__cc; const sc = cc && cc.director.getScene(); if (!sc) return null; let root = null; sc.walk(n => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } }); window.__root = root; return root && !root.bootPreloadActive ? root.currentView : null; })()"
# 编辑器当前场景不是 main(别的会话开了别的场景)时预览里没有 GameRoot:手动装 main 场景(同 boss_bar_cdp.JS_BOOT)
MANUAL_SCENE = r"""(async () => { const cc = window.__cc; try {
  await new Promise((res, rej) => cc.assetManager.loadBundle('resources', (e, b) => e ? rej(e) : res(b)));
  const uuid = '623f777a-eb33-4d74-ae88-eb79e749fcfe';
  const json = await (await fetch(`scene/${uuid}.json`, { cache: 'no-store' })).json();
  const asset = await new Promise((res, rej) => cc.assetManager.loadWithJson(json, { assetId: uuid }, (e, a) => e ? rej(e) : res(a)));
  cc.director._persistRootNodes = {}; cc.director.runSceneImmediate(asset); cc.game.resume(); return 'manual ok ' + cc.director.getScene().name; } catch (e) { return 'manual err ' + e.message; } })()"""
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } }
  window.__cc = cc; if (!cc) return 'fail'; let root = null; cc.director.getScene().walk(n => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } }); window.__root = root; return 'ok'; })()"""
# 节点中心 → 页面 CSS 坐标(触摸用)
POS = r"""((name) => { const cc = window.__cc; let f = null; cc.director.getScene().walk(n => { if (!f && n.name === name && n.activeInHierarchy) f = n; });
  if (!f) return null; const p = f.getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3(0, 0, 0)); const vs = cc.view.getVisibleSize(); const c = cc.game.canvas.getBoundingClientRect();
  return JSON.stringify({ x: c.left + p.x / vs.width * c.width, y: c.top + (1 - p.y / vs.height) * c.height }); })"""
WORLD = r"""((name) => { const cc = window.__cc; let f = null; cc.director.getScene().walk(n => { if (!f && n.name === name && n.activeInHierarchy) f = n; });
  if (!f) return null; const p = f.getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3(0, 0, 0)); return JSON.stringify({ x: p.x, y: p.y }); })"""
BOXES = r"""(() => { const cc = window.__cc; const out = []; cc.director.getScene().walk(n => { const e = n.getComponent && n.getComponent(cc.EditBox); if (e && n.activeInHierarchy) out.push(e); }); return out; })()"""
STATE = r"""(() => { const cc = window.__cc, root = window.__root; const boxes = %s; const a = document.activeElement;
  return JSON.stringify({ view: root.currentView, n: boxes.length, strs: boxes.map(b => b.string), active: a ? a.tagName : null, val: a && a.value, agree: root.loginFlow.agreementAccepted,
    same0: !!(window.__b0 && window.__b0.isValid && window.__b0.node.isValid) }); })()""" % BOXES


async def main():
    profile = base.PROFILE + '_login'
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    ok = True
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

            async def call(method, params=None, timeout=400):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            async def click(x, y):
                for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
                    await call('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left' if t != 'mouseMoved' else 'none', 'clickCount': 1})
                    await asyncio.sleep(0.06)

            cal = {}

            async def calibrate():
                # 全局 input 收不到被 UI 吞掉的点击(登录页根节点挂了 BlockInputEvents),标定挂在根节点上
                await ev("(() => { const cc = window.__cc; window.__mloc = []; window.__dom = []; let r = null; cc.director.getScene().walk(n => { if (!r && n.name === 'LoginGlassRoot') r = n; }); r.on(cc.Node.EventType.TOUCH_START, (e) => { const l = e.getUILocation(); window.__mloc.push([l.x, l.y]); }); return 1; })()")
                pts = [(300, 300), (1300, 700)]
                for x, y in pts:
                    await click(x, y)
                    await asyncio.sleep(2)
                locs = json.loads(await ev('JSON.stringify(window.__mloc)'))
                print('  DOM 收到', await ev('JSON.stringify(window.__dom)'), 'engine', await ev('JSON.stringify(window.__mloc)'), flush=True)
                print('  点到的元素', await ev("(() => { const e = document.elementFromPoint(800, 450); return e ? e.tagName + '#' + e.id + '.' + e.className : null; })()"), await ev("document.querySelectorAll('iframe').length"), flush=True)
                print('  报错层', await ev("(() => { const e = document.querySelector('.error-stack'); if (!e) return null; const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return JSON.stringify({ text: (e.innerText || '').slice(0, 1500), rect: [r.left, r.top, r.width, r.height], vis: st.visibility, op: st.opacity, disp: st.display, parent: e.parentElement && (e.parentElement.id + '.' + e.parentElement.className) }); })()"), flush=True)
                if len(locs) < 2:
                    raise SystemExit('鼠标事件没到引擎')
                (x1, y1), (x2, y2) = pts
                (u1, v1), (u2, v2) = locs[-2], locs[-1]
                cal['ax'] = (x2 - x1) / (u2 - u1)
                cal['bx'] = x1 - cal['ax'] * u1
                cal['ay'] = (y2 - y1) / (v2 - v1)
                cal['by'] = y1 - cal['ay'] * v1
                print('  标定', locs, cal, flush=True)

            def css(u, v):
                return cal['ax'] * u + cal['bx'], cal['ay'] * v + cal['by']

            async def tap(name):
                pos = await ev(WORLD + f"('{name}')")
                if not pos:
                    print('  找不到节点', name)
                    return False
                w = json.loads(pos)
                x, y = css(w['x'], w['y'])
                p = {'x': x, 'y': y}
                await click(p['x'], p['y'])
                await asyncio.sleep(0.8)
                return True

            async def tap_box(index):
                raw = await ev(r"""(() => { const cc = window.__cc; const b = %s[%d]; window.__b%d = b; const p = b.node.getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3(0, 0, 0));
                  return JSON.stringify({ x: p.x, y: p.y }); })()""" % (BOXES, index, index))
                w = json.loads(raw)
                x, y = css(w['x'], w['y'])
                print('  tap_box', index, raw, round(x), round(y), flush=True)
                p = {'x': x, 'y': y}
                await click(p['x'], p['y'])
                await asyncio.sleep(0.8)

            # 无头 Edge 里 CDP 触摸事件到不了引擎(11-11 实测全局 TOUCH_START 都收不到),改电脑视口 + 真实鼠标点击
            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            await ev(JS_CC)
            for i in range(300):
                v = await ev(FIND_ROOT)
                if i % 10 == 0:
                    print('  等待登录页', i, v, await ev("window.__cc ? 'cc' : 'nocc'"), await ev("location.href"), flush=True)
                    if await ev("window.__cc ? 1 : 0") == 0:
                        print('  重取 cc', await ev(JS_CC), flush=True)
                    elif i == 20 and v is None:
                        print('  场景', await ev("window.__cc.director.getScene() && window.__cc.director.getScene().name"), await ev(MANUAL_SCENE), flush=True)
                if v in ('login', 'loginAccount', 'lobby'):
                    break
                await asyncio.sleep(2)
            if v == 'lobby':
                await ev("window.__root.logoutToLoginPage(), 1")
                await asyncio.sleep(6)
                await ev(JS_CC)
                for _ in range(60):
                    v = await ev(FIND_ROOT)
                    if v in ('login', 'loginAccount'):
                        break
                    await asyncio.sleep(2)
            await asyncio.sleep(5)
            print('进入', await ev(STATE))
            print('探针', await ev(r"""(() => { const cc = window.__cc; window.__dbg = []; const boxes = %s; boxes.forEach((b, i) => { b.node.on(cc.Node.EventType.TOUCH_START, () => window.__dbg.push('ts' + i)); b.node.on('editing-did-began', () => window.__dbg.push('began' + i)); });
              cc.input.on(cc.Input.EventType.TOUCH_START, (e) => { const l = e.getUILocation(); window.__dbg.push('global ' + Math.round(l.x) + ',' + Math.round(l.y)); });
              const b = boxes[0]; const t = b.node.getComponent(cc.UITransform); const w = t.convertToWorldSpaceAR(new cc.Vec3(0,0,0)); const vs = cc.view.getVisibleSize(); const c = cc.game.canvas.getBoundingClientRect();
              return JSON.stringify({ world: [Math.round(w.x), Math.round(w.y)], size: [t.width, t.height], vs: [vs.width, vs.height], canvas: [c.left, c.top, c.width, c.height], parent: b.node.parent.name, idx: b.node.getSiblingIndex(), sibs: b.node.parent.children.length }); })()""" % BOXES))
            await calibrate()
            await tap('Rail_language')
            await asyncio.sleep(1.2)
            d1 = json.loads(await ev(r"""(() => { const cc = window.__cc, root = window.__root; let d = null; cc.director.getScene().walk(n => { if (!d && n.name === 'LoginLanguageDialog') d = n; });
  const vis = [...document.querySelectorAll('input,textarea')].filter(e => { const st = getComputedStyle(e); const r = e.getBoundingClientRect(); return st.display !== 'none' && r.width > 0 && e.isConnected && r.top > 40 && e.style.visibility !== 'hidden'; }).map(e => (e.style.visibility || 'shown') + '@' + Math.round(e.getBoundingClientRect().top)); return JSON.stringify({ dialog: !!d, open: root.loginLanguageDialogOpen, inputs: vis }); })()"""))
            print('0 点语言', d1, flush=True)
            await tap('LoginLanguageOption_zh-CN')
            await asyncio.sleep(1.2)
            d2 = json.loads(await ev(r"""(() => { const cc = window.__cc, root = window.__root; let d = null; cc.director.getScene().walk(n => { if (!d && n.name === 'LoginLanguageDialog') d = n; });
  const vis = [...document.querySelectorAll('input,textarea')].filter(e => { const st = getComputedStyle(e); const r = e.getBoundingClientRect(); return st.display !== 'none' && r.width > 0 && e.isConnected && r.top > 40 && e.style.visibility !== 'hidden'; }).map(e => (e.style.visibility || 'shown') + '@' + Math.round(e.getBoundingClientRect().top)); return JSON.stringify({ dialog: !!d, open: root.loginLanguageDialogOpen, inputs: vis }); })()"""))
            print('  点简体中文', d2, flush=True)
            ok &= d1['dialog'] and not d1['inputs'] and not d2['dialog']  # 弹框开着时画布区域内没有可点的原生输入框(预览工具栏 FPS 框 top<40 不算)
            await tap_box(0)
            await call('Input.insertText', {'text': USER[:4]})
            await asyncio.sleep(0.3)
            s1 = json.loads(await ev(STATE))
            print('1 账号框输入一半', s1, await ev('JSON.stringify(window.__dbg)'))
            await ev("(async () => { const root = window.__root; for (let k = 0; k < 3; k++) { root.renderCurrentView(); root.uiSpriteFrameCache.scheduleRenderRefresh(); await new Promise(z => setTimeout(z, 400)); } return 1; })()")
            await call('Input.insertText', {'text': USER[4:]})
            await asyncio.sleep(0.3)
            s2 = json.loads(await ev(STATE))
            print('  强制整刷后继续输入', s2)
            ok &= s2['same0'] and s2['val'] == USER
            await tap_box(1)
            await call('Input.insertText', {'text': PASS})
            await asyncio.sleep(0.3)
            s3 = json.loads(await ev(STATE))
            print('2 密码框输入', s3)
            # 收起输入:点卡片标题空白处
            await tap('LoginTitle')
            for i in range(2):
                await tap('LoginAgreementBox')
                await asyncio.sleep(1.2)
                print(f'3 点协议勾选 #{i + 1}', await ev(STATE))
            s4 = json.loads(await ev(STATE))
            ok &= s4['strs'] == [USER, PASS] and s4['agree'] is True
            await tap('AccountLoginSubmit')
            for _ in range(40):
                v = await ev("window.__root.currentView")
                if v == 'lobby':
                    break
                await asyncio.sleep(1)
            print('4 点登录后视图', v)
            ok &= v == 'lobby'
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
    print('RESULT', 'PASS' if ok else 'FAIL')


asyncio.run(main())
