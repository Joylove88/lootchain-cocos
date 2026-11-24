# -*- coding: utf-8 -*-
"""网页模板里「拿不到 WebGL / 画布上下文丢失」自愈逻辑的自检(2026-11-24,build-templates/web-mobile/index.ejs)。

  python tools/qa/webgl_recovery_check.py [<页面 URL>]
不给 URL:从模板抠出那段样式 + 脚本拼一个测试页(带 GameCanvas、模拟引擎建 WebGL2 上下文),无头 Edge 跑三种情况:
  1) 禁用 WebGL(--disable-webgl --disable-3d-apis)→ 应出提示页(nogl:precheck),每 2 秒检测;
  2) 正常 → 不出提示页;
  3) 正常 + 手动 loseContext → 应出「画面中断,正在恢复」(lost);restoreContext → 页面自动刷新(sessionStorage 计数 +1)。
给 URL(如 http://localhost:7460/)就对正式包跑 2) 和 3)(画布上下文用引擎建好的那个)。
截图存 %TEMP%/lootchain-qa/webgl_recovery/。
"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
QA = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
OUT = os.path.join(QA, 'webgl_recovery')
PORT = 9398


def test_page():
    s = open(os.path.join(ROOT, 'build-templates', 'web-mobile', 'index.ejs'), encoding='utf-8').read()
    i = s.index('<!-- 2026-11-24 用户线上黑屏')
    j = s.index('<%- include(cocosTemplate')
    html = ('<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title><style>html,body{background:#000;margin:0}</style></head><body>'
            '<canvas id="GameCanvas" width="640" height="360"></canvas>' + s[i:j] +
            '<script>(function(){ var c = document.getElementById("GameCanvas"); var gl = c.getContext("webgl2") || c.getContext("webgl");'
            ' window.__testGL = gl; if (gl) { gl.clearColor(0.2, 0.4, 0.2, 1); gl.clear(gl.COLOR_BUFFER_BIT); } })();</script></body></html>')
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, 'page.html')
    open(p, 'w', encoding='utf-8').write(html)
    return 'file:///' + p.replace('\\', '/')


class Tab:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0

    async def call(self, method, params=None):
        self.n += 1
        await self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params or {}}))
        while True:
            r = json.loads(await self.ws.recv())
            if r.get('id') == self.n:
                return r.get('result', {})

    async def ev(self, expr):
        r = await self.call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
        return r.get('result', {}).get('value')

    async def shot(self, name):
        r = await self.call('Page.captureScreenshot', {'format': 'png'})
        open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(r['data']))


async def run_case(name, url, flags, steps):
    prof = os.path.join(QA, 'webgl_recovery_profile_' + name)
    shutil.rmtree(prof, ignore_errors=True)
    proc = subprocess.Popen([EDGE, '--headless=new', '--disable-extensions', '--no-first-run', f'--remote-debugging-port={PORT}',
                             f'--user-data-dir={prof}', '--window-size=1280,720', *flags, 'about:blank'])
    out = {}
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.5)
        page = next(t for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=5)) if t.get('type') == 'page')
        async with websockets.connect(page['webSocketDebuggerUrl'], max_size=2 ** 27) as ws:
            tab = Tab(ws)
            await tab.call('Page.enable')
            await tab.call('Page.navigate', {'url': url})
            await asyncio.sleep(steps.get('load_wait', 3))
            out['initial'] = await tab.ev('JSON.stringify({ noGL: window.__lcNoWebGL || null, overlay: !!document.getElementById("lcNoGL") })')
            await tab.shot(name + '_1')
            if steps.get('lose'):
                await tab.ev(steps['grab'] + ' window.__testLoseExt = window.__testGL && window.__testGL.getExtension("WEBGL_lose_context"); window.__testLoseExt && window.__testLoseExt.loseContext(); 1')
                await asyncio.sleep(1.5)
                out['after_lose'] = await tab.ev('JSON.stringify({ noGL: window.__lcNoWebGL || null, text: (document.getElementById("lcNoGL") || {}).innerText || "" })')
                await tab.shot(name + '_2_lost')
                await tab.ev('sessionStorage.setItem("__probe_before_reload", "1"); window.__testLoseExt && window.__testLoseExt.restoreContext(); 1')
                await asyncio.sleep(steps.get('reload_wait', 4))
                out['after_restore'] = await tab.ev('JSON.stringify({ reloadedFresh: !window.__testLoseExt, autoReloads: sessionStorage.getItem("lcGlAutoReload"), noGL: window.__lcNoWebGL || null })')
                await tab.shot(name + '_3_restored')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        subprocess.run(['powershell', '-NoProfile', '-Command',
                        f"Get-CimInstance Win32_Process | ? {{ $_.CommandLine -like '*{os.path.basename(prof)}*' }} | % {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"],
                       capture_output=True)
    return out


async def main():
    os.makedirs(OUT, exist_ok=True)
    url = next((a for a in sys.argv[1:] if a.startswith('http')), None)
    if url:
        grab = 'window.__testGL = document.getElementById("GameCanvas").getContext("webgl2") || document.getElementById("GameCanvas").getContext("webgl");'
        print('release normal+lose', await run_case('rel', url, [], {'load_wait': 15, 'lose': True, 'grab': grab, 'reload_wait': 8}))
        return
    page = test_page()
    print('1 no-webgl', await run_case('nogl', page, ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'], {'load_wait': 3}))
    print('2+3 normal+lose', await run_case('lose', page, [], {'load_wait': 2, 'lose': True, 'grab': '', 'reload_wait': 4}))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
