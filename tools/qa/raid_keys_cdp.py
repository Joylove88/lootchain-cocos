# -*- coding: utf-8 -*-
"""掠夺 / 野怪动作战斗按键自验(2026-10-26 用户「攻击、技能键绑定 J K L,翻滚键绑定 Shift」):
无头 Edge 打开本地正式包 → 登录 → 开 NPC 矿 → 逐个按 J / K / L / I / Shift,看模型操作记录新增的操作类型 + 截图(按钮角标)。
用法:PREVIEW_PORT=7460 python tools/qa/raid_keys_cdp.py <输出目录> [关卡码,默认 RAID_1]"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'raid_keys')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const gr=root&&root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
KEYS = {'KeyJ': 74, 'KeyK': 75, 'KeyL': 76, 'KeyI': 73, 'ShiftLeft': 16, 'ArrowRight': 39, 'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowDown': 40, 'KeyD': 68, 'KeyA': 65, 'KeyW': 87, 'KeyS': 83}


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


async def main():
    profile = base.PROFILE + '_raidkeys'
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
            stage = sys.argv[2] if len(sys.argv) > 2 else 'RAID_1'
            await ev("root.openLobbyRaidPanel(); return 1;")
            await asyncio.sleep(8)
            await ev(f"root.selectLobbyRaidStage('{stage}'); root.startLobbyRaidBattle('{stage}'); return 1;")
            await asyncio.sleep(3)
            # 进战斗前的「编队确认」
            await ev("root.confirmLobbyBattleStart ? root.confirmLobbyBattleStart() : root.lobbyBattleFlow.start(root.selectedLobbyStageCode); return 'start';")
            ready = 'wait'
            for i in range(25):
                ready = await ev("return (gr && gr.isMounted() && raid && sim && sim.phase==='wave') ? 'ready' : 'wait';")
                if ready == 'ready':
                    break
                if i % 10 == 0:
                    print('diag', await ev("const b=root.currentLobbyBattleState?root.currentLobbyBattleState():null; return JSON.stringify({view:root.currentView, mounted:!!(gr&&gr.isMounted()), raid:!!raid, phase:sim&&sim.phase, err:b&&b.error, al:b&&b.assetsLoading, cnt:b&&(b.assetsLoadedCount+'/'+b.assetsTotalCount), starting:b&&b.starting, has:!!(b&&b.start), stage:b&&b.stageCode, sel:root.selectedLobbyStageCode, raidSt:(()=>{try{const s=root.currentLobbyRaidState();return s.error+'|'+(s.stages?s.stages.nextStageCode:'-')}catch(e){return 'x'}})()});"), flush=True)
                await asyncio.sleep(2)
            print('battle', ready, flush=True)
            if ready != 'ready':
                await shot('raid_stuck')
                print('mount', await ev("try { gr.unmount(); gr.render(root.lobbyLayout || root.currentLayout || root.layout); return 'ok sim=' + !!gr.sim; } catch(e) { return 'ERR ' + (e && e.stack ? e.stack.slice(0, 600) : e); }"), flush=True)
                print('grkeys', await ev("return JSON.stringify(Object.keys(gr).filter(k=>/sim|raid|gate|load|pend|ready|boot|start|wait/i.test(k)).map(k=>k+'='+(typeof gr[k]==='object'?(gr[k]===null?'null':'obj'):String(gr[k]).slice(0,40))));"), flush=True)
                print('progress', await ev("try { const c=root.uiSpriteFrameCache||root.spriteCache; return JSON.stringify({raid:c&&c.groupProgress?c.groupProgress('raid'):'?', guard:c&&c.groupProgress?c.groupProgress('guard'):'?', battle:c&&c.groupProgress?c.groupProgress('battle'):'?'}); } catch(e){ return 'err '+e; }"), flush=True)
                return
            await asyncio.sleep(2)
            await call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            await call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            await shot('raid_keys_hud')
            for code in ['KeyJ', 'KeyK', 'KeyL', 'KeyI', 'ShiftLeft']:
                before = await ev("return sim.inputs.length;")
                key_name = 'Shift' if code == 'ShiftLeft' else code[-1].lower()
                await call('Input.dispatchKeyEvent', {'type': 'keyDown', 'code': code, 'key': key_name, 'windowsVirtualKeyCode': KEYS[code]})
                await asyncio.sleep(0.08)
                await call('Input.dispatchKeyEvent', {'type': 'keyUp', 'code': code, 'key': key_name, 'windowsVirtualKeyCode': KEYS[code]})
                await asyncio.sleep(0.9)
                added = await ev(f"return JSON.stringify(sim.inputs.slice({before}).filter(i=>i.k!=='rmove' && i.k!==undefined).map(i=>i.k+(i.v!==undefined?':'+i.v:'')));")
                print(code, '->', added, flush=True)
            await ev("root.returnToLobbyFromBattlePreview(); return 1;")
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
