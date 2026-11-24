# -*- coding: utf-8 -*-
"""本机浏览器 WebGL 体检(2026-11-24 用户线上黑屏:引擎报 16405 / 16333,浏览器拿不到 WebGL)。

  python tools/qa/webgl_probe.py [chrome|edge] [--headless] [--url <页面>]
另起一个独立的浏览器实例(单独配置目录 %TEMP%/lootchain-qa/webgl_probe_<浏览器>,窗口放屏幕外,不碰用户正在用的浏览器),
用 CDP 读:能不能建 WebGL2 / WebGL1、用的哪块显卡(UNMASKED_RENDERER)、chrome://gpu 的「Graphics Feature Status」和「Problems Detected」。
--url 给了就再打开那个页面,看引擎有没有报 16333 / 16405。跑完只关自己起的那个实例。
"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

BROWSERS = {
    'chrome': r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'edge': r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
}
QA = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
PORT = 9397

PROBE = r"""(() => { const out = {};
  for (const kind of ['webgl2', 'webgl']) { const c = document.createElement('canvas'); let gl = null;
    try { gl = c.getContext(kind); } catch (e) { out[kind + '_err'] = String(e); }
    out[kind] = !!gl;
    if (gl) { const e = gl.getExtension('WEBGL_debug_renderer_info'); out[kind + '_renderer'] = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); } }
  return JSON.stringify(out); })()"""

GPU_PAGE = r"""(() => { const v = document.querySelector('info-view'); const root = v && v.shadowRoot ? v.shadowRoot : document;
  const t = (root.textContent || '').replace(/\s+/g, ' ');
  const pick = (a, b) => { const i = t.indexOf(a); if (i < 0) return ''; const j = b ? t.indexOf(b, i + a.length) : -1; return t.slice(i, j > 0 ? j : i + 900); };
  return JSON.stringify({ status: pick('Graphics Feature Status', 'Driver Bug Workarounds'), problems: pick('Problems Detected', 'Driver Bug Workarounds').slice(0, 900),
    gpu0: pick('GPU0', 'GPU1').slice(0, 300), active: pick('Active GPU', '').slice(0, 200) }); })()"""


async def ws_eval(ws, expr, msg_id=[0]):
    msg_id[0] += 1
    await ws.send(json.dumps({'id': msg_id[0], 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
    while True:
        r = json.loads(await ws.recv())
        if r.get('id') == msg_id[0]:
            return r.get('result', {}).get('result', {}).get('value')


async def ws_nav(ws, url, msg_id=[1000]):
    msg_id[0] += 1
    await ws.send(json.dumps({'id': msg_id[0], 'method': 'Page.navigate', 'params': {'url': url}}))
    while True:
        r = json.loads(await ws.recv())
        if r.get('id') == msg_id[0]:
            return


async def main():
    which = next((a for a in sys.argv[1:] if a in BROWSERS), 'chrome')
    headless = '--headless' in sys.argv
    url = sys.argv[sys.argv.index('--url') + 1] if '--url' in sys.argv else None
    prof = os.path.join(QA, f'webgl_probe_{which}{"_hl" if headless else ""}')
    shutil.rmtree(prof, ignore_errors=True)
    args = [BROWSERS[which], f'--remote-debugging-port={PORT}', f'--user-data-dir={prof}', '--no-first-run', '--no-default-browser-check',
            '--disable-extensions', '--window-position=-2400,-2400', '--window-size=900,600', 'about:blank']
    if headless:
        args.insert(1, '--headless=new')
    proc = subprocess.Popen(args)
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.5)
        tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=5))
        page = next(t for t in tabs if t.get('type') == 'page')
        async with websockets.connect(page['webSocketDebuggerUrl'], max_size=2 ** 26) as ws:
            print('probe about:blank', await ws_eval(ws, PROBE))
            await ws_nav(ws, 'chrome://gpu' if which == 'chrome' else 'edge://gpu')
            await asyncio.sleep(3)
            print('gpu page', await ws_eval(ws, GPU_PAGE))
            if url:
                await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
                await ws_nav(ws, url)
                await asyncio.sleep(12)
                print('page canvas', await ws_eval(ws, "JSON.stringify({ noGL: window.__lcNoWebGL || null, title: document.title, hasGame: !!(window.cc && cc.director && cc.director.root) })"))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        # 只清自己这个配置目录起的进程(按命令行里的配置目录认)
        subprocess.run(['powershell', '-NoProfile', '-Command',
                        f"Get-CimInstance Win32_Process | ? {{ $_.CommandLine -like '*{os.path.basename(prof)}*' }} | % {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"],
                       capture_output=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
