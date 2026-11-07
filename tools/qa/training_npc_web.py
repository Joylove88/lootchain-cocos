# -*- coding: utf-8 -*-
"""训练场教官 NPC 自验(2026-11-07 用户:「训练场这里没有人物,NPC 看不到」):晨风村训练场门口 / 教官身边各截一张 + 打印 NPC 节点状态。
(由 field_fix_web.py 改写)原:野外三处修复自验(网页正式包,2026-10-30;模拟器内存吃紧时用):无头 Edge 打开本地正式包 → 登录 QA 号 → 林地:
1. 用户卡住的位置(坐标 26,45)真实键盘按住 ←↑ 2.5 秒,看是否走动、是否原地踏步;
2. 进战后重建世界层,同群怪仍有数值、会打人、能被打掉血;
3. 同群怪最近间距。
用法:PREVIEW_PORT=7460 python tools/qa/field_fix_web.py <输出目录>(先 python -m http.server 7460 在 build/web-mobile;游戏服 8081)
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'training_npc')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
TP = "const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
CAMP = 'FIELD_WOODS_7'
KEYS = {'ArrowLeft': 37, 'ArrowUp': 38}


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + TP + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_trainnpc'
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
        tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
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

            async def keys(names, down):
                for n in names:
                    await call('Input.dispatchKeyEvent', {'type': 'keyDown' if down else 'keyUp', 'code': n, 'key': n, 'windowsVirtualKeyCode': KEYS[n]})

            if os.environ.get('PHONE'):
                await call('Emulation.setDeviceMetricsOverride', {'width': 800, 'height': 360, 'deviceScaleFactor': 3, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            else:
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
            for _ in range(90):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted() && root.worldState) ? 'ready' : 'wait';") == 'ready':
                    break
                await asyncio.sleep(2)
            await ev("if (t.def.code !== 'VILLAGE') setTimeout(() => root.travelWorldMap('VILLAGE', null), 50); return 1;")
            for _ in range(60):
                if await ev("return t.def.code === 'VILLAGE' && t.leader ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(2)
            for _ in range(60):
                if await ev("let pl = false; root.node.walk(n => { if (n.name === 'PackLoading') pl = true; }); return pl ? 'wait' : 'ok';") == 'ok':
                    break
                await asyncio.sleep(2)
            await asyncio.sleep(6)
            npc = ("const n = t.npcNodes.find(e => e.code === 'INSTRUCTOR'); const d = t.def.npcs.find(e => e.code === 'INSTRUCTOR'); "
                   "const tb = t.def.buildings.find(b => b.key === 'training'); "
                   "return JSON.stringify({ def: d && [d.x, d.y], node: n && n.node.isValid ? [Math.round(n.node.position.x), Math.round(n.node.position.y), n.node.activeInHierarchy, n.node.parent && n.node.parent.name, n.node.getSiblingIndex()] : null, "
                   "art: n && n.node.getChildByName('Art') ? !!n.node.getChildByName('Art').getComponent(cc.Sprite).spriteFrame : null, door: tb && [tb.x + tb.door.x, tb.y + tb.door.y], leader: [Math.round(t.leader.x), Math.round(t.leader.y)] });")
            print('npc', await ev(npc), flush=True)
            print('all', await ev("const names = []; t.entityRoot.children.forEach(c => { if (/Npc/.test(c.name)) names.push(c.name + ':' + c.active); }); return JSON.stringify({ npcNodes: t.npcNodes.map(e => e.code + ':' + (e.node.isValid)), names, defNpcs: t.def.npcs.map(n => n.code + ':' + !!n.asset), hidden: Object.keys(t).filter(k => /npc/i.test(k)) });"), flush=True)
            sfx = '_phone' if os.environ.get('PHONE') else ''
            for name, (x, y) in [('door_out' + sfx, tuple(map(int, os.environ.get('DOOR_TP', '1250,520').split(','))))]:
                await ev(f"tp({x}, {y}); return 1;")
                await asyncio.sleep(5)
                await ev("try { root.worldDialog = null; root.renderCurrentView(); } catch (e) {} return 1;")
                await asyncio.sleep(1.5)
                print(name, await ev(npc), flush=True)
                await shot(name)
            # 剧情框 B 风格:接任务(带任务卡)/ 闲聊两种
            for mode in ['offer', 'idle']:
                print('dialog', mode, await ev("const q = (root.worldState && root.worldState.quests || [])[0]; root.worldDialog = { npc: 'INSTRUCTOR', mode: '" + mode + "', questCode: q ? q.code : '', busy: false }; root.syncLobbyShopOverlay(); root.refreshLobbyViewPreservingBackground(); return q ? q.code + ':' + q.state : 'no quest';"), flush=True)
                await asyncio.sleep(3)
                await shot('dialog_' + mode + sfx)
            await ev("root.worldDialog = null; root.refreshLobbyViewPreservingBackground(); return 1;")
            # 召唤任务「前往召唤」应预选免费池(11-07 用户:没有默认选中可免费召唤的页签):先把选中改成限时池,再走 grow 主按钮
            print('gacha prep', await ev("root.gachaSceneState = { ...root.gachaSceneState, selectedPoolCode: 'LIMITED_YIJIE_SHENZHOU' }; "
                "const fake = { code: 'QA_GACHA', name: '祭坛的回应', desc: '在圣契祭坛召唤一次(今日免费)。', state: 'ACCEPTED', objective: 'GROW', objectiveTarget: 'GACHA_DRAW', progress: 0, target: 1, rewards: [], map: 'VILLAGE' }; "
                "root.worldState.quests = root.worldState.quests.filter(q => q.code !== 'QA_GACHA').concat([fake]); "
                "root.worldDialog = { npc: 'PRIEST', mode: 'grow', questCode: 'QA_GACHA', busy: false }; root.worldDialogPrimary(); return root.currentView;"), flush=True)
            await asyncio.sleep(9)
            print('gacha selected', await ev("return root.currentView + ' ' + root.gachaSceneState.selectedPoolCode;"), flush=True)
            await shot('gacha_from_quest' + sfx)
            await ev("root.worldState.quests = root.worldState.quests.filter(q => q.code !== 'QA_GACHA'); root.closeGachaScene(); return 1;")
    finally:
        proc.terminate()
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


if __name__ == '__main__':
    asyncio.run(main())
