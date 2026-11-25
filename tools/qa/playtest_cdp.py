# -*- coding: utf-8 -*-
"""策划视角通玩驱动(2026-11-22):无头 Edge 开本地正式包(默认 7460),按步骤文件一步步玩,每步截图 + 记耗时 + 收页面异常。

  python tools/qa/playtest_cdp.py <输出目录> <步骤.json> [--fresh] [--keep] [--pc]
  --fresh:先关掉同配置目录的旧浏览器再清掉配置 = 全新访客(首访下载 / 没有登录会话);不带则沿用上次的配置(会话、已下的包都在)
  --keep:跑完不关浏览器,下一批不带 --fresh 就接管同一页接着玩
  编辑器预览:PREVIEW_PORT=7456 PT_PROFILE=<另起一个配置名> EDGE_PORT=<另一个端口>,别和正式包共用配置
  --pc:电脑 1600×900;默认手机横屏 1200×540 @2x(安卓 UA + 触屏),玩家大多在手机上
步骤文件:[{"label": "登录页", "js": "...return 某个字符串;", "wait": 秒, "shot": true}, ...]
js 里可用:cc / root / t(野外渲染器)/ sleep / find(节点名)/ tap(节点)/ texts()(当前屏上看得见的文字)/ buttons()(看得见的按钮名 + 文字)/ view()
  / scr(节点) = 节点中心的页面 CSS 坐标
真实输入(11-25,验遮罩挡不挡点击用;tap(节点) 是直接发节点事件,穿得过遮罩):
  "tap": "return scr(find('X'));" → 浏览器真实按下抬起(手机触摸 / 电脑鼠标);
  "drag": "return {x0, y0, x1, y1};" + "drag_ms" / "hold"(秒)/ "shot_hold"(松手前截一张 *_hold.png);
  "after": 输入打完后再跑的 JS,结果记在 log 的 after。顺序:js → tap / drag → after → wait → 截图
产物:<输出目录>/NN_<label>.png + log.jsonl(每步返回值 / 耗时 / 当前视图)+ exceptions.txt
要求:本地游戏服 8081;正式包服务 7460(tools/local-serve/serve_release.py)。
"""
import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import edge_guard  # noqa: E402  按配置目录精确关测试浏览器
SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = int(os.environ.get('EDGE_PORT', '9381'))
PAGE = 'http://localhost:' + os.environ.get('PREVIEW_PORT', '7460') + '/' + os.environ.get('PAGE_QS', '')
PROFILE = os.path.join(SCRATCH, os.environ.get('PT_PROFILE', 'playtest_profile'))
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT, STEPS = ARGS[0], ARGS[1]
FRESH = '--fresh' in sys.argv
KEEP = '--keep' in sys.argv          # 跑完不关浏览器,下一批步骤用 --keep 接着同一局玩(不重进游戏)
PC = '--pc' in sys.argv
W, H, DPR, MOBILE = (1600, 900, 1, False) if PC else (1200, 540, 2, True)

# 先等页面 load 完 + 引擎挂上 window.cc 再 System.import:编辑器预览(7456)的引擎是 19MB 的 q-bundled 包,
# 它没执行完就 import 会失败,而 SystemJS 会把失败缓存住 —— 连游戏自己的启动也跟着报「Get cce:/internal/x/cc failed!」
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null;
for (let i = 0; i < 240 && (document.readyState !== 'complete' || !window.cc); i++) await sleep(500);
for (let i = 0; i < 240 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(500); } }
if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""

PRELUDE = r"""const cc = window.__cc; const sleep = ms => new Promise(z => setTimeout(z, ms));
const R = () => { let rr = null; try { cc.director.getScene().walk(n => { if (!rr) { const c = n.getComponent('LootChainGameRoot'); if (c) rr = c; } }); } catch (e) {} return rr; };
let root = R(); window.__root = root; let t = root && root.lobbyTownRenderer;
const refresh = () => { root = R(); window.__root = root; t = root && root.lobbyTownRenderer; return !!root; };
const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name && n.activeInHierarchy) { f = n; return; } n.children.forEach(w); }; try { w(cc.director.getScene()); } catch (e) {} return f; };
const fakeEv = () => { const p = new cc.Vec2(0, 0); return { propagationStopped: false, propagationImmediateStopped: false, stopPropagation() {}, stopPropagationImmediate() {}, getLocation: () => p, getUILocation: () => p, getStartLocation: () => p, getUIStartLocation: () => p, getDelta: () => p, getUIDelta: () => p, touch: null, getTouches: () => [], target: null, currentTarget: null }; };
const tap = n => { if (!n) return false; const b = n.getComponent(cc.Button); if (b) { n.emit(cc.Button.EventType.CLICK, b); } else { n.emit(cc.Node.EventType.TOUCH_START, fakeEv()); n.emit(cc.Node.EventType.TOUCH_END, fakeEv()); } return true; };
const view = () => root ? root.currentView : 'noroot';
// 节点中心 → 页面 CSS 坐标(给步骤里的 tap / drag 用:真实触摸 / 鼠标从浏览器打进去,遮罩挡不挡点击才验得出来)
const scr = n => { if (!n) return null; const wp = n.getWorldPosition(); const vp = cc.view.getViewportRect(); const c = document.getElementById('GameCanvas'); const rc = c.getBoundingClientRect(); const dpr = c.width / rc.width;
  return { x: rc.left + (vp.x + wp.x * cc.view.getScaleX()) / dpr, y: rc.top + (c.height - (vp.y + wp.y * cc.view.getScaleY())) / dpr }; };
const texts = (max = 80) => { const out = []; try { cc.director.getScene().walk(n => { if (!n.activeInHierarchy) return; const l = n.getComponent(cc.Label);
  if (l && l.string && l.string.trim()) { const op = n.getComponent(cc.UIOpacity); if (op && op.opacity < 10) return; out.push(l.string.replace(/\s+/g, ' ').slice(0, 60)); } }); } catch (e) {}
  return [...new Set(out)].slice(0, max); };
const buttons = (max = 60) => { const out = []; try { cc.director.getScene().walk(n => { if (!n.activeInHierarchy) return; const b = n.getComponent(cc.Button);
  if (b && b.interactable !== false) { let label = ''; n.walk(c => { const l = c.getComponent(cc.Label); if (!label && l && l.string) label = l.string.replace(/\s+/g, ' ').slice(0, 20); }); out.push(n.name + (label ? '「' + label + '」' : '')); } }); } catch (e) {}
  return out.slice(0, max); };
"""


def wrap(js):
    return '(async () => { ' + PRELUDE + js + ' })()'


async def run():
    os.makedirs(OUT, exist_ok=True)
    attached = False
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
        attached = not FRESH          # 上一批留着的浏览器还在:直接接管那一页
    except Exception:
        pass
    if FRESH:
        # 上一批 --keep 留着的无头浏览器按配置目录精确关掉(只碰本脚本这个 profile);不关的话新开的 msedge 会把页面交给旧进程,配置也删不干净
        edge_guard.kill_profiles([PROFILE])
        time.sleep(1)
        shutil.rmtree(PROFILE, ignore_errors=True)
    proc = None if attached else subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={PROFILE}', '--no-first-run',
                             '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update',
                             '--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
                             'about:blank'])
    logf = open(os.path.join(OUT, 'log.jsonl'), 'a', encoding='utf-8')
    exc = []
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        tab = None
        if attached:
            tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=5))
            tab = next((x for x in tabs if x.get('type') == 'page' and 'localhost' in x.get('url', '')), None)
        if not tab:
            attached = False
            tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0
            pending = {}

            async def reader():
                async for raw in ws:
                    m = json.loads(raw)
                    if 'id' in m and m['id'] in pending:
                        pending.pop(m['id']).set_result(m)
                    elif m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']
                        exc.append((d.get('exception') or {}).get('description', d.get('text', ''))[:300])
                    elif m.get('method') == 'Runtime.consoleAPICalled' and m['params'].get('type') == 'error':
                        exc.append('console.error: ' + ' '.join(str(a.get('value', a.get('description', '')))[:200] for a in m['params'].get('args', [])))

            rt = asyncio.ensure_future(reader())

            async def call(method, params=None, timeout=300):
                nonlocal seq
                seq += 1
                fut = asyncio.get_event_loop().create_future()
                pending[seq] = fut
                await ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
                return await asyncio.wait_for(fut, timeout)

            async def ev(js, timeout=300):
                r = await call('Runtime.evaluate', {'expression': js, 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {})
                if 'exceptionDetails' in res:
                    return 'EXC ' + (res['exceptionDetails'].get('exception') or {}).get('description', res['exceptionDetails'].get('text', ''))[:400]
                return res.get('result', {}).get('value')

            async def shot(name):
                r = await call('Page.captureScreenshot', {'format': 'png'})
                data = r.get('result', {}).get('data')
                if data:
                    open(os.path.join(OUT, name), 'wb').write(base64.b64decode(data))

            async def touch(kind, x, y):
                # 手机模式发触摸(已开触摸模拟),电脑模式发鼠标
                if MOBILE:
                    pts = [] if kind == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]
                    await call('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})
                else:
                    mt = {'touchStart': 'mousePressed', 'touchMove': 'mouseMoved', 'touchEnd': 'mouseReleased'}[kind]
                    await call('Input.dispatchMouseEvent', {'type': mt, 'x': x, 'y': y, 'button': 'left', 'buttons': 0 if kind == 'touchEnd' else 1, 'clickCount': 1})

            await call('Runtime.enable')
            await call('Page.enable')
            await call('Page.bringToFront')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': DPR, 'mobile': MOBILE,
                                                               'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            if MOBILE:
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            t0 = time.time()
            if not attached:
                await call('Page.navigate', {'url': PAGE})
            print('attached' if attached else 'navigated', 'cc', await ev(JS_CC, 400), f'{time.time() - t0:.1f}s', flush=True)
            n0 = len([f for f in os.listdir(OUT) if f.endswith('.png')])
            for i, step in enumerate(json.load(open(STEPS, encoding='utf-8'))):
                ts = time.time()
                res = await ev(wrap(step['js']), step.get('timeout', 600)) if step.get('js') else None
                name = f"{n0 + i:02d}_{re.sub(r'[^0-9A-Za-z_\u4e00-\u9fff-]+', '_', step.get('label', 'step'))}.png"
                # tap:JS \u8fd4\u56de {x, y}(CSS \u5750\u6807,\u53ef\u7528 scr(node))\u2192 \u771f\u5b9e\u6309\u4e0b\u62ac\u8d77;
                # drag:JS \u8fd4\u56de {x0, y0, x1, y1} \u2192 \u6309\u4e0b\u3001drag_ms \u5185\u79fb\u8fc7\u53bb\u3001\u505c hold \u79d2(shot_hold = \u677e\u624b\u524d\u622a\u4e00\u5f20)\u518d\u677e\u624b;
                # after:\u8f93\u5165\u6253\u5b8c\u540e\u518d\u8dd1\u7684 JS(\u7ed3\u679c\u8bb0\u5728 after)
                inp = None
                if step.get('tap'):
                    inp = await ev(wrap(step['tap']))
                    if isinstance(inp, dict) and 'x' in inp:
                        await touch('touchStart', inp['x'], inp['y'])
                        await asyncio.sleep(0.07)
                        await touch('touchEnd', inp['x'], inp['y'])
                if step.get('drag'):
                    inp = await ev(wrap(step['drag']))
                    if isinstance(inp, dict) and 'x0' in inp:
                        await touch('touchStart', inp['x0'], inp['y0'])
                        n = max(1, int(float(step.get('drag_ms', 400)) / 16))
                        for j in range(1, n + 1):
                            await touch('touchMove', inp['x0'] + (inp['x1'] - inp['x0']) * j / n, inp['y0'] + (inp['y1'] - inp['y0']) * j / n)
                            await asyncio.sleep(0.016)
                        if step.get('hold'):
                            await asyncio.sleep(float(step['hold']))
                        if step.get('shot_hold'):
                            await shot(name.replace('.png', '_hold.png'))
                        await touch('touchEnd', inp['x1'], inp['y1'])
                after = await ev(wrap(step['after']), step.get('timeout', 600)) if step.get('after') else None
                if step.get('wait'):
                    await asyncio.sleep(float(step['wait']))
                v = await ev(wrap("return view() + (t && t.isMounted && t.isMounted() ? ' @' + t.def.code : '');"))
                if step.get('shot', True):
                    await shot(name)
                rec = {'step': step.get('label'), 'sec': round(time.time() - ts, 1), 'since_start': round(time.time() - t0, 1), 'view': v, 'result': res, 'shot': name if step.get('shot', True) else None}
                if inp is not None:
                    rec['input'] = inp
                if step.get('after'):
                    rec['after'] = after
                logf.write(json.dumps(rec, ensure_ascii=False) + '\n')
                logf.flush()
                print(json.dumps(rec, ensure_ascii=False)[:2500], flush=True)
            rt.cancel()
    finally:
        logf.close()
        open(os.path.join(OUT, 'exceptions.txt'), 'a', encoding='utf-8').write('\n'.join(exc) + ('\n' if exc else ''))
        print('exceptions', len(exc), *exc[:8], sep='\n  ', flush=True)
        if not KEEP:
            if proc:
                subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
            edge_guard.kill_profiles([PROFILE])   # 启动进程会把浏览器交给别的进程,只杀 proc 会漏


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(run())
