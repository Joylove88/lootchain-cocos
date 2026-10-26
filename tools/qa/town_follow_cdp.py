# -*- coding: utf-8 -*-
"""主城跑图 跟随 / 遮挡 / 影子自验(2026-10-26 用户反馈「跟随英雄左右闪、人物被建筑挡、脚下两个影子」):
无头 Edge 1600×900 打开本地正式包 → 登录 QA 号 → 大厅 → 真实键盘按住方向键 / WSAD,
每 50ms 采样跟随者朝向与动画,统计翻面 / 切动画次数;把队伍放到守卫水晶背后截图看建筑是否变半透明;统计每人影子数。
用法:PREVIEW_PORT=7460 python tools/qa/town_follow_cdp.py <输出目录>(先 python -m http.server 7460 --directory build/web-mobile;游戏服 8081)"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'town_follow')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
KEYS = {'ArrowRight': 39, 'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowDown': 40, 'KeyD': 68, 'KeyA': 65, 'KeyW': 87, 'KeyS': 83}


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


SAMPLE = ("const t=root.lobbyTownRenderer; return JSON.stringify({l:[Math.round(t.leader.x),Math.round(t.leader.y)], "
          "f:t.followers.map(a=>[a.facing, a.anim, Math.round(a.x), Math.round(a.y)])});")


async def main():
    profile = base.PROFILE + '_townfollow'
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
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

            async def ev(body, timeout=120):
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', name, flush=True)

            async def hold(codes, seconds, label):
                """按住若干键 seconds 秒,期间每 50ms 采样一次跟随者;返回每名跟随者的翻面 / 切动画次数。"""
                for code in codes:
                    await call('Input.dispatchKeyEvent', {'type': 'keyDown', 'code': code, 'key': code, 'windowsVirtualKeyCode': KEYS[code]})
                samples = []
                end = time.time() + seconds
                while time.time() < end:
                    samples.append(json.loads(await ev(SAMPLE)))
                    await asyncio.sleep(0.05)
                for code in codes:
                    await call('Input.dispatchKeyEvent', {'type': 'keyUp', 'code': code, 'key': code, 'windowsVirtualKeyCode': KEYS[code]})
                await asyncio.sleep(0.6)
                samples.append(json.loads(await ev(SAMPLE)))
                stats = []
                for i in range(len(samples[0]['f'])):
                    seq_f = [s['f'][i][0] for s in samples]
                    seq_a = [s['f'][i][1] for s in samples]
                    flips = sum(1 for a, b in zip(seq_f, seq_f[1:]) if a != b)
                    anims = sum(1 for a, b in zip(seq_a, seq_a[1:]) if a != b)
                    stats.append({'flips': flips, 'animSwitch': anims})
                print(label, 'samples', len(samples), 'leader', samples[0]['l'], '->', samples[-1]['l'], json.dumps(stats), flush=True)
                return stats

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(240):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(2)
            if view != 'lobby':
                await ev("root.loginFlow.setInputs({string:'guidetest02'}, {string:'pass1234'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
                for _ in range(60):
                    view = await ev("return root.currentView;")
                    if view == 'lobby':
                        break
                    await asyncio.sleep(2)
            print('view', view, flush=True)
            for _ in range(45):
                state = await ev("const t=root.lobbyTownRenderer; return JSON.stringify({sprites:t.buildings.filter(b=>b.sprite).length, spines:[t.leader,...t.followers].filter(a=>a&&a.skeleton).length});")
                if '"sprites":9' in state and '"spines":4' in state:
                    break
                await asyncio.sleep(2)
            print(state, flush=True)
            await asyncio.sleep(2)
            await call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 800, 'y': 300, 'button': 'left', 'clickCount': 1})
            await call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 800, 'y': 300, 'button': 'left', 'clickCount': 1})
            await asyncio.sleep(0.3)
            # 影子:程序椭圆影清掉的人数 + 骨骼自带影子插槽
            print('shadows', await ev("const t=root.lobbyTownRenderer; return JSON.stringify([t.leader,...t.followers].map(a=>({graphicsShadow: !!a.shadow, spineShadowSlot: !!(a.skeleton && a.skeleton._skeleton && a.skeleton._skeleton.slots.some(s=>/^(shadow|ying|yingzi)$/i.test(s.data.name)))})));"), flush=True)
            await shot('follow_spawn')
            await hold(['ArrowRight'], 2.0, 'hold Right')
            await shot('follow_after_right')
            await hold(['ArrowUp'], 1.5, 'hold Up')
            await hold(['KeyA', 'KeyS'], 1.5, 'hold A+S')
            await hold(['ArrowLeft'], 2.0, 'hold Left')
            await shot('follow_after_left')
            # 走一段中途截图(看跑动中姿势)
            await call('Input.dispatchKeyEvent', {'type': 'keyDown', 'code': 'ArrowRight', 'key': 'ArrowRight', 'windowsVirtualKeyCode': 39})
            await asyncio.sleep(1.0)
            await shot('follow_running')
            await call('Input.dispatchKeyEvent', {'type': 'keyUp', 'code': 'ArrowRight', 'key': 'ArrowRight', 'windowsVirtualKeyCode': 39})
            # 遮挡:队伍放到守卫水晶背后(脚线之上)→ 建筑应淡成半透明
            await ev("const t=root.lobbyTownRenderer; const cfg=t.buildings.find(b=>b.cfg.key==='crystal').cfg; const place=(a,i)=>{ a.x=cfg.x-60+i*60; a.y=cfg.y+cfg.footprint.d+20+i*8; a.node.setPosition(a.x,a.y,0); }; place(t.leader,0); t.followers.forEach((a,i)=>place(a,i+1)); t.trail=[]; return 'tp';")
            await asyncio.sleep(1.5)
            print('crystal fade', await ev("const t=root.lobbyTownRenderer; const b=t.buildings.find(b=>b.cfg.key==='crystal'); const op=b.sprite.node.getComponent(cc.UIOpacity); return JSON.stringify({fade:Math.round(b.fade), opacity: op?op.opacity:255});"), flush=True)
            await shot('behind_crystal')
            # 走出来(往下)→ 恢复不透明
            await hold(['ArrowDown'], 1.8, 'hold Down')
            print('crystal fade after', await ev("const t=root.lobbyTownRenderer; const b=t.buildings.find(b=>b.cfg.key==='crystal'); return Math.round(b.fade);"), flush=True)
            await shot('front_of_crystal')
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
