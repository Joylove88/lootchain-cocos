# -*- coding: utf-8 -*-
"""3D 实验小样 · 真实输入自检(2026-11-18):用浏览器调试协议发「真的」键盘 / 鼠标事件(Input.dispatchKeyEvent / dispatchMouseEvent,
和用户在键盘上按、用鼠标点走同一条路:先到有焦点的元素,再冒泡),看主角动没动、技能出没出。
和 dungeon_dev 的 check_input.js 不同:那个是页面里合成事件,绕开了焦点;线上「按了没反应」要用这个查。

用法:python tools/qa/g3d_input_check.py "<地址,如 http://localhost:7460/?g3dcity=1>" [--click-first] [--focus-input]
  --click-first:先在画面中间点一下(用户通常会先点一下页面)
  --focus-input:先把焦点放到页面上第一个输入框(模拟登录页输入框抢走焦点)
  --login:先用测试号登录(只用于本地服 localhost),再打开地址 —— 有会话时游戏直进大厅,3D 小样开在大厅上面
输出每一步的主角位置 / 当前动作 / 冷却 / 当前焦点元素。端口 9368,配置目录 g3d_input_profile(每次清空)。"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

os.environ.setdefault('EDGE_PORT', '9368')
import boss_bar_cdp as base  # noqa: E402

URL = next(a for a in sys.argv[1:] if not a.startswith('--'))
CLICK_FIRST = '--click-first' in sys.argv
FOCUS_INPUT = '--focus-input' in sys.argv
LOGIN = '--login' in sys.argv
ACCOUNT = os.environ.get('QA_ACCOUNT', 'selfchk1108')
ROOT = "let root=null; try { cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); } catch(e) {} "

STATE = r"""(() => { const d = window.__g3dd; if (!d) return null; const i = d.info();
  const ae = document.activeElement; return { opened: i.opened, err: i.error, leader: i.leader, act: i.act, cd: i.cd, combo: i.combo,
  focus: ae ? (ae.tagName + (ae.id ? '#' + ae.id : '') + (ae.className && typeof ae.className === 'string' ? '.' + ae.className.split(' ')[0] : '')) : null }; })()"""
BAR = r"""(() => { const out = {}; document.querySelectorAll('div').forEach(d => { const l = d.dataset && d.dataset.label; if (l) { const r = d.getBoundingClientRect();
  out[l] = [r.left + r.width / 2, r.top + r.height / 2]; } }); return out; })()"""


async def main():
    profile = os.path.join(base.SCRATCH, 'g3d_input_profile')
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--window-size=1600,900', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=120):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(expr):
                r = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
                return r.get('result', {}).get('result', {}).get('value')

            async def key(code, k, vk, hold):
                # 方向键这类不出字的键要用 rawKeyDown、不带 text(带了 text 浏览器会当成打字)
                if len(k) == 1:
                    await call('Input.dispatchKeyEvent', {'type': 'keyDown', 'code': code, 'key': k, 'windowsVirtualKeyCode': vk, 'text': k})
                else:
                    await call('Input.dispatchKeyEvent', {'type': 'rawKeyDown', 'code': code, 'key': k, 'windowsVirtualKeyCode': vk})
                await asyncio.sleep(hold)
                await call('Input.dispatchKeyEvent', {'type': 'keyUp', 'code': code, 'key': k, 'windowsVirtualKeyCode': vk})

            async def click(x, y):
                for typ in ('mousePressed', 'mouseReleased'):
                    await call('Input.dispatchMouseEvent', {'type': typ, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            if LOGIN:
                if 'localhost' not in URL and '127.0.0.1' not in URL:
                    raise SystemExit('--login 只用于本地服')
                import re
                pw = os.environ.get('QA_PASSWORD') or re.search(r"\{\{string:'\{ACCOUNT\}'\}\}, \{\{string:'([^']+)'\}\}",
                                                             open(os.path.join(base.HERE, 'city_moon_web.py'), encoding='utf-8').read()).group(1)
                await call('Page.navigate', {'url': URL.split('?')[0]})
                for _ in range(120):
                    await asyncio.sleep(1)
                    v = await ev('(() => { ' + ROOT + ' return root ? root.currentView : null; })()')
                    if v in ('login', 'lobby', 'loginAccount'):
                        break
                if v != 'lobby':
                    await ev('(() => { ' + ROOT + ' root.loginFlow.setInputs(' + json.dumps(ACCOUNT) + ', ' + json.dumps(pw) + '); try { root.loginFlow.acceptedAgreement = true; } catch (e) {} root.run(() => root.loginFlow.login()); return 1; })()')
                for _ in range(240):
                    await asyncio.sleep(1)
                    v = await ev('(() => { ' + ROOT + ' return root ? root.currentView : null; })()')
                    if v == 'lobby':
                        break
                lf = await ev('(() => { ' + ROOT + ' const f = root && root.loginFlow; if (!f) return null; const o = {}; Object.keys(f).forEach(k => { const v = f[k]; if (["string","number","boolean"].includes(typeof v) && !/pass|pwd|token/i.test(k)) o[k] = v; }); return o; })()')
                print('logged in, view =', v, 'loginFlow =', json.dumps(lf, ensure_ascii=False)[:400], flush=True)
                await asyncio.sleep(5)
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            st = None
            while time.time() - t0 < 300:
                await asyncio.sleep(3)
                st = await ev(STATE)
                if st and (st.get('opened') or st.get('err')):
                    break
            print('opened', round(time.time() - t0), 's', json.dumps(st, ensure_ascii=False), flush=True)
            print('game view under 3D:', await ev('(() => { ' + ROOT + ' return root ? root.currentView : null; })()'), flush=True)
            # 线上:主角模型是按需取的,载到之前 leader 是空的(这段时间按键 / 点按钮都没有反应)。每 10 秒试按一次 W,记下哪一刻开始能动
            t1 = time.time()
            while time.time() - t1 < 900:
                s0 = await ev(STATE)
                await key('KeyW', 'w', 87, 0.5)
                await asyncio.sleep(0.3)
                s1 = await ev(STATE)
                moved = s0['leader'] and s1['leader'] and ((s0['leader'][0] - s1['leader'][0]) ** 2 + (s0['leader'][1] - s1['leader'][1]) ** 2) ** 0.5
                print(f'  {round(time.time() - t0):4d}s leader={s1["leader"]} W moved={moved}', flush=True)
                if moved:
                    break
                await asyncio.sleep(10)
            if FOCUS_INPUT:
                print('focus input:', await ev("(() => { const i = document.querySelector('input,textarea'); if (!i) return 'no input'; i.focus(); return i.outerHTML.slice(0, 120); })()"))
            if CLICK_FIRST:
                await click(800, 450)
                await asyncio.sleep(1.2)
                print('after click', json.dumps(await ev(STATE), ensure_ascii=False))
            for code, k, vk in (('ArrowDown', 'ArrowDown', 40), ('KeyW', 'w', 87), ('KeyD', 'd', 68), ('ArrowLeft', 'ArrowLeft', 37)):
                a = await ev(STATE)
                await key(code, k, vk, 0.9)
                await asyncio.sleep(0.3)
                b = await ev(STATE)
                la, lb = a['leader'], b['leader']
                print(f'{code} 0.9s: moved {((la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2) ** 0.5:.2f} m  focus={b["focus"]}', flush=True)
            for code, k, vk in (('KeyJ', 'j', 74), ('KeyK', 'k', 75)):
                await key(code, k, vk, 0.05)
                await asyncio.sleep(0.15)
                print(f'{code}: act={(await ev(STATE))["act"]!r} cd={(await ev(STATE))["cd"]}', flush=True)
                await asyncio.sleep(1.5)
            bar = await ev(BAR)
            print('bar buttons', json.dumps(bar, ensure_ascii=False))
            for label in ('旋', '攻'):
                if bar and label in bar:
                    await click(*bar[label])
                    await asyncio.sleep(0.15)
                    s = await ev(STATE)
                    print(f'click {label}: act={s["act"]!r} cd={s["cd"]}', flush=True)
                    await asyncio.sleep(1.8)
            hit = await ev("(() => { const b = document.querySelector('[data-label]'); if (!b) return null; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);"
                           " return e ? (e.tagName + ' ' + (e.dataset.label || '') + ' z=' + getComputedStyle(e).zIndex + ' parent=' + (e.parentElement && e.parentElement.tagName)) : null; })()")
            print('element under first button:', hit)
            over = await ev("(() => Array.from(document.body.children).map(e => e.tagName + (e.id ? '#' + e.id : '') + ' z=' + getComputedStyle(e).zIndex + ' pos=' + getComputedStyle(e).position + ' pe=' + getComputedStyle(e).pointerEvents).join(' | '))()")
            print('body children:', over)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            proc.kill()
        try:
            import edge_guard
            edge_guard.kill_profiles([profile])
        except Exception:  # noqa: BLE001
            pass


asyncio.run(main())
