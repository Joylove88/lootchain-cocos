# -*- coding: utf-8 -*-
"""矿境面板截图(docs/61 真人矿 B 风格 pvp_b_v4):无头 Edge 打开本地正式包 → 登录 → 主城 → 矿境面板(真人矿页)截图,可选再切 NPC 矿页。
用法:PREVIEW_PORT=7460 [PHONE=1] [NPC=1] python tools/qa/raid_panel_shots.py <输出目录>
打印 home 数据 + 真人矿面板节点包围盒(--probe 口径:名字 / 世界坐标 / 宽高),便于对原型逐块核对。"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'raid_panel')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const gr=root&&root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
STATE = "if(!sim) return 'nosim'; const u=sim.monsters.find(m=>m.player); return JSON.stringify({phase:sim.phase, t:Math.round(sim.timeMs), x:u&&+u.x.toFixed(2), hp:u&&Math.round(u.hp), max:u&&u.maxHp, heroes:sim.heroes.map(h=>Math.round(h.hp||0)+'/'+h.maxHp+(h.dead?'X':'')), crystal:sim.crystalHp+'/'+sim.crystalMaxHp, inputs:sim.inputs.length, serverRaid: gr.serverRaid});"
BOT = ("window.__raidBot = setInterval(()=>{ try { const u=sim.monsters.find(m=>m.player); if(!u||sim.phase!=='wave'){ clearInterval(window.__raidBot); return; } const alive=sim.heroes.filter(h=>!h.dead); "
       "const cellX=(c)=>1.45+(c%6)*1.18; const target=alive.length? alive.reduce((a,b)=>Math.abs(cellX(b.cell)-u.x)<Math.abs(cellX(a.cell)-u.x)?b:a) : null; const tx = target ? cellX(target.cell) : 0.9; const stop = target ? 1.1 : 0.2; "
       "const laneT = target ? (Math.floor(target.cell/6)===0 ? 0.25 : 0.75) : 0.5; const laneD = laneT - (u.laneF||0.5); "
       "raid.keys.delete(65); raid.keys.delete(68); raid.keys.delete(87); raid.keys.delete(83); "
       "if (Math.abs(tx-u.x) > stop || Math.abs(laneD) > 0.3) { if (Math.abs(tx-u.x) > stop) raid.keys.add(tx<u.x?65:68); if (Math.abs(laneD) > 0.3) raid.keys.add(laneD<0?87:83); setTimeout(()=>{ raid.keys.delete(65); raid.keys.delete(68); raid.keys.delete(87); raid.keys.delete(83); }, 120); } "
       "else { raid.attackPressedAt = Date.now(); if (Math.random()<0.15) raid.skillPressedAt[Math.floor(Math.random()*3)] = Date.now(); } } catch(e){} }, 300); return 'bot';")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


async def main():
    profile = base.PROFILE + '_raidpanel'
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

            if os.environ.get('PHONE') == '1':
                await call('Network.setUserAgentOverride', {'userAgent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', 'platform': 'Android'})
                await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
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
                await ev("root.loginFlow.setInputs({string:'" + os.environ.get('QA_USER', 'guidetest02') + "'}, {string:'" + os.environ.get('QA_PASS', 'pass1234') + "'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
                for _ in range(60):
                    if await ev("return root.currentView;") == 'lobby':
                        break
                    await asyncio.sleep(2)
            for _ in range(120):  # 新包首访要整块下开局包,无头 SwiftShader 偶尔 > 90s
                if '"sprites":9' in await ev("const t=root.lobbyTownRenderer; return JSON.stringify({sprites:t.buildings.filter(b=>b.sprite).length});"):
                    break
                await asyncio.sleep(2)
            await ev("root.openLobbyRaidPanel(); return 'raid-panel';")
            for _ in range(30):
                st = await ev("const s=root.currentLobbyRaidPvpState(); return JSON.stringify({loading:s.loading, has:!!s.home, err:s.error});")
                if '"has":true' in st or ('"err":"' in st and '"err":""' not in st):
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(4)
            print('pvp', await ev("const s=root.currentLobbyRaidPvpState(); const h=s.home; return JSON.stringify({err:s.error, my:h&&h.myCrystal, power:h&&h.lineupPower, team:h&&h.myTeam.map(t=>t.heroCode), cands:h&&h.candidates.map(c=>c.nickname+':'+(c.protagonist&&c.protagonist.heroCode)+':'+c.realmTitle+':'+c.lianhun+':'+c.stealPreview+(c.attackedRecently?':X':'')), reports:h&&h.reports.length});"), flush=True)
            probe = await ev("const out=[]; cc.director.getScene().walk(n=>{ if(/^LobbyRaid/.test(n.name) && n.activeInHierarchy){ const t=n.getComponent(cc.UITransform); if(t){ const p=n.worldPosition; out.push(n.name+' '+Math.round(p.x)+','+Math.round(p.y)+' '+Math.round(t.width*n.worldScale.x)+'x'+Math.round(t.height*n.worldScale.y)); } } }); return out.slice(0,400).join('\n');")
            open(os.path.join(OUT, 'probe.txt'), 'w', encoding='utf-8').write(str(probe))
            await shot('pvp_panel')
            if os.environ.get('SHOP') == '1':
                # 顶栏体力「+」→ 体力补充弹框要盖在矿境面板上
                print('plus', await ev("let hit=null; cc.director.getScene().walk(n=>{ if(n.name==='Plus' && n.parent && /LobbyRaidGlassChip_stamina/.test(n.parent.name)) hit=n; }); if(!hit) return 'no-plus'; hit.emit('click'); hit.getComponent(cc.Button) && cc.Component.EventHandler.emitEvents(hit.getComponent(cc.Button).clickEvents, null); return 'clicked';"), flush=True)
                await asyncio.sleep(3)
                await shot('stamina_plus')
                await ev("root.closeLobbyShopDialog && root.closeLobbyShopDialog(); return 'closed';")
                await asyncio.sleep(2)
            if os.environ.get('NPC') == '1':
                await ev("root.selectLobbyRaidTab('npc'); return 'npc';")
                await asyncio.sleep(4)
                await shot('npc_panel')
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
