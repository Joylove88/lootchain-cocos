# -*- coding: utf-8 -*-
"""矿境掠夺 真人矿 PVP 自验(docs/49)(docs/48,电脑端):无头 Edge 打开本地正式包 → 登录 → 主城 → 矿境面板截图 → 掠夺 RAID_n(走编队确认 → battles/start)
→ 机器人打(清守卫 → 砸水晶)→ 结算 → 打印结算回执(奖励 / 体力 / 复演裁定)+ 终局截图。
用法:PREVIEW_PORT=7460 python tools/qa/raid_server_cdp.py <输出目录> [RAID_1]"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'raid_pvp')
TARGET = sys.argv[2] if len(sys.argv) > 2 else ''  # 对方 userId;空 = 候选里第一个可打的
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
    profile = base.PROFILE + '_raidpvp'
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
                await ev("root.loginFlow.setInputs({string:'" + os.environ.get('QA_USER', 'guidetest02') + "'}, {string:'" + os.environ.get('QA_PASS', 'pass1234') + "'}); try { root.loginFlow.acceptedAgreement = true; } catch(e){} root.run(() => root.loginFlow.login()); return 'login';")
                for _ in range(60):
                    if await ev("return root.currentView;") == 'lobby':
                        break
                    await asyncio.sleep(2)
            for _ in range(45):
                if '"sprites":9' in await ev("const t=root.lobbyTownRenderer; return JSON.stringify({sprites:t.buildings.filter(b=>b.sprite).length});"):
                    break
                await asyncio.sleep(2)
            # 矿境面板(真人矿页默认)
            await ev("root.openLobbyRaidPanel(); return 'raid-panel';")
            for _ in range(30):
                st = await ev("const s=root.currentLobbyRaidPvpState(); return JSON.stringify({loading:s.loading, has:!!s.home, err:s.error});")
                if '"has":true' in st or ('"err":"' in st and '"err":""' not in st):
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(3)
            print('pvp', await ev("const s=root.currentLobbyRaidPvpState(); const h=s.home; return JSON.stringify({err:s.error, my:h&&h.myCrystal, power:h&&h.lineupPower, shield:h&&h.shieldUntil, cands:h&&h.candidates.map(c=>c.userId+':'+c.nickname+':'+c.lineupPower+':'+c.crystal+':'+c.stealPreview+':'+(c.attackedRecently?'X':'')), reports:h&&h.reports.length});"), flush=True)
            await shot('pvp_panel')
            if os.environ.get('PVP_REVENGE') == '1':
                rep = await ev("const h=root.currentLobbyRaidPvpState().home; const r=h&&h.reports.find(x=>x.canRevenge); return r ? JSON.stringify({u:r.opponentUserId, id:r.id}) : '';")
                if not rep:
                    print('no revenge target', flush=True)
                    return
                r = json.loads(rep)
                print('revenge', rep, flush=True)
                await ev(f"root.startLobbyRaidPvp({r['u']}, {r['id']}); return 'preview';")
            else:
                target = TARGET or await ev("const h=root.currentLobbyRaidPvpState().home; const c=h&&h.candidates.find(x=>!x.attackedRecently); return c ? String(c.userId) : '';")
                if not target:
                    print('no target', flush=True)
                    return
                print('target', target, flush=True)
                await ev(f"root.startLobbyRaidPvp({target}, null); return 'preview';")
            await asyncio.sleep(3)
            print('preview view', await ev("return root.currentView + ' stage=' + root.selectedLobbyStageCode;"), flush=True)
            await shot('pvp_preview')
            await ev("root.confirmLobbyBattleStart ? root.confirmLobbyBattleStart() : root.lobbyBattleFlow.start(root.selectedLobbyStageCode); return 'start';")
            for _ in range(90):
                st = await ev("const b=root.currentLobbyBattleState(); return JSON.stringify({starting:b.starting, has:!!b.start, err:b.error, mounted: !!(gr && gr.isMounted() && raid)});")
                if '"mounted":true' in st or ('"err":"' in st and '"err":""' not in st):
                    print('start', st, flush=True)
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(2)
            print('battle', await ev(STATE), flush=True)
            print('pool', await ev("if(!sim) return 'nosim'; return JSON.stringify({pool: sim.pool.map(p=>p.heroCode+':'+p.displayName+':'+p.sourceIndex), allies: (gr.snapshot? gr.snapshot.allies.map(a=>a.unitKey+':'+a.displayName) : null), raidRaw: !!(root.currentLobbyBattleState().start||{}).raid, npcAssets: (gr.snapshot? gr.snapshot.allies.filter(a=>a.unitKey.startsWith('npc')).map(a=>a.spineAsset+'|'+a.portraitAsset) : null), views: [...gr.heroViews.values()].map(v=>v.node.name+':'+v.spineReady), lineupRaw: (root.currentLobbyBattleState().start||{}).lineup.map(h=>!!h.guardRaw)});"), flush=True)
            await shot('pvp_battle_start')
            await call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            await call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 800, 'y': 200, 'button': 'left', 'clickCount': 1})
            await ev(BOT)
            for i in range(60):
                await asyncio.sleep(3)
                st = await ev(STATE)
                if i % 5 == 0:
                    print('t', st, flush=True)
                if i == 4:
                    await shot('pvp_battle_mid')
                if '"phase":"victory"' in st or '"phase":"defeat"' in st:
                    print('end', st, flush=True)
                    break
            await ev("clearInterval(window.__raidBot); return 'stop';")
            # 等结算回执
            for _ in range(30):
                st = await ev("const b=root.currentLobbyBattleState(); return JSON.stringify({settling:b.settling, err:b.error, s: b.settlement && {result:b.settlement.result, mode:b.settlement.settlementMode, granted:b.settlement.rewardGranted, first:b.settlement.firstClear, stamina:[b.settlement.staminaBefore,b.settlement.staminaAfter], rewards:(b.settlement.rewardItems||[]).map(r=>r.resourceName+'x'+r.amount), msg:b.settlement.message}});")
                if '"s":{' in st or ('"err":"' in st and '"err":""' not in st):
                    print('settlement', st, flush=True)
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(2)
            await shot('pvp_settlement')
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
