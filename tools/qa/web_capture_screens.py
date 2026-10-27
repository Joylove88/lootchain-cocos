# -*- coding: utf-8 -*-
"""网页正式包按手机分辨率(800×360 CSS × 3 = 2400×1080,走手机布局)逐个打开界面截图;界面清单复用 native_capture_screens.SCREENS。
调试安卓包在模拟器上会频繁触发 gfx-validator 断言崩溃(正式包没有),整屏审核截图用这个更稳。
用法:QA_USER=guidetest02 QA_PASS=*** PREVIEW_PORT=7460 python tools/qa/web_capture_screens.py <输出目录> [--only a,b]"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
from native_capture_screens import SCREENS, ROOT_JS, RESET_JS

OUT = sys.argv[1]
GATE_WAIT = int(sys.argv[sys.argv.index('--gate-wait') + 1]) if '--gate-wait' in sys.argv else 40  # 首开素材加载门最多等几秒(首访整包下载时要拉长)
PROBE = sys.argv[sys.argv.index('--probe') + 1] if '--probe' in sys.argv else None  # 每屏截图后求值并打印(排查用)
ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
os.makedirs(OUT, exist_ok=True)
USER = os.environ.get('QA_USER', 'guidetest02')
PASS = os.environ.get('QA_PASS', 'pass1234')
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } window.__cc = cc; return cc ? 'ok' : 'fail'; })()"""


async def main():
    profile = base.PROFILE + '_world'
    if '--fresh' in sys.argv:
        # 模拟首次访问:清空浏览器缓存 / 存储(冷启动素材时序问题只在这时出现)
        import shutil
        shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=800,360', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(body):
                r = await call('Runtime.evaluate', {'expression': "(()=>{ const cc=window.__cc; " + ROOT_JS + " " + body + " })()", 'returnByValue': True}, 120)
                return r.get('result', {}).get('result', {}).get('value')

            await call('Emulation.setDeviceMetricsOverride', {'width': 800, 'height': 360, 'deviceScaleFactor': 3, 'mobile': True})
            await call('Page.navigate', {'url': base.PAGE})
            await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            for _ in range(600):
                if await ev("return root && !root.bootPreloadActive ? 'd' : 'b';") == 'd':
                    break
                await asyncio.sleep(2)
            for _ in range(60):
                v = await ev("return root.currentView;")
                if v in ('login', 'lobby'):
                    break
                await asyncio.sleep(2)
            # 后端重启后浏览器里的旧会话会失效:一律先退出再登录
            if v == 'lobby':
                await ev("root.logoutToLoginPage(); return 1;")
                await asyncio.sleep(5)
                # 退出可能重载页面:window.__cc 会丢,重新取并等登录页
                await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
                for _ in range(60):
                    v = await ev("return root && !root.bootPreloadActive ? root.currentView : null;")
                    if v == 'login':
                        break
                    await asyncio.sleep(2)
            # 退出后登录页要过一会儿才接得住输入:登不进就重试
            for attempt in range(4):
                if v == 'lobby':
                    break
                await ev(f"root.loginFlow.setInputs({{string:'{USER}'}}, {{string:'{PASS}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 1;")
                for _ in range(20):
                    v = await ev("return root.currentView;")
                    if v == 'lobby':
                        break
                    await asyncio.sleep(2)
                print('login attempt', attempt, v, flush=True)
            if v != 'lobby':
                raise SystemExit('登录失败,不截图')
            await asyncio.sleep(10)
            for key, js, wait in SCREENS:
                if ONLY and key not in ONLY:
                    continue
                await ev(RESET_JS + " return 1;")
                await asyncio.sleep(2)
                await ev(js + " return 1;")
                await asyncio.sleep(wait * 2.2)
                # 首开有素材加载门:等它过去
                for _ in range(max(1, GATE_WAIT // 2)):
                    if not await ev("return Object.keys(root.uiSpriteFrameCache.groupWaits ? Object.fromEntries(root.uiSpriteFrameCache.groupWaits) : {}).some(g=>root.uiSpriteFrameCache.groupProgress(g)) ? 1 : 0;"):
                        break
                    await asyncio.sleep(2)
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{key}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', key, flush=True)
                if PROBE:
                    # 探针可以是 async(内部可 await),结果按 JSON 字符串返回
                    r = await call('Runtime.evaluate', {'expression': "(async()=>{ const cc=window.__cc; " + ROOT_JS + " " + PROBE + " })()", 'returnByValue': True, 'awaitPromise': True}, 300)
                    print('probe', key, r.get('result', {}).get('result', {}).get('value'), flush=True)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
