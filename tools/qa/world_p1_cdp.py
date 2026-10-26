# -*- coding: utf-8 -*-
"""docs/50 P1 网页全流程自验(无头 Edge 1600×900,本地正式包 + 本地游戏服):
MODE=village(新号,默认 guidetest04):出生晨风村 → 村长交「醒来」接「拿起武器」→ 教官训练战(机器人打)→ 回图交任务 → 去林地;
MODE=city(老号,默认 guidetest02):主城传送阵 / 公告板 → 世界地图选点 → 传送林地 → 悬赏面板;
每步截图到 <输出目录>。
用法:MODE=village QA_USER=guidetest04 QA_PASS=*** PREVIEW_PORT=7460 python tools/qa/world_p1_cdp.py <输出目录>"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base.SCRATCH, 'world_p1')
os.makedirs(OUT, exist_ok=True)
MODE = os.environ.get('MODE', 'village')
USER = os.environ.get('QA_USER', 'guidetest04' if MODE == 'village' else 'guidetest02')
PASS = os.environ.get('QA_PASS', 'pass1234')
ROOT_JS = ("let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); "
           "const t=root&&root.lobbyTownRenderer; const gr=root&&root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;")
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BOT = ("window.__clearBot = setInterval(()=>{ try { const u=sim.monsters.find(m=>m.player); if(!u||sim.phase!=='wave'){ clearInterval(window.__clearBot); return; } "
       "const alive=sim.heroes.filter(h=>!h.dead); if(!alive.length) return; const tg=alive.reduce((a,b)=>Math.abs((b.fx||0)-u.x)<Math.abs((a.fx||0)-u.x)?b:a); "
       "const side=(tg.fx||0)<u.x?1:-1; const tx=(tg.fx||0)+side*0.55; const laneD=(tg.flane||0.5)-(u.laneF||0.5); "
       "[65,68,87,83].forEach(k=>raid.keys.delete(k)); "
       "if(Math.abs(tx-u.x)>0.35||Math.abs(laneD)>0.25){ if(Math.abs(tx-u.x)>0.35) raid.keys.add(tx<u.x?65:68); if(Math.abs(laneD)>0.25) raid.keys.add(laneD<0?87:83); "
       "setTimeout(()=>[65,68,87,83].forEach(k=>raid.keys.delete(k)),150); } "
       "else { if ((u.facing||-1) !== -side) { raid.keys.add(side>0?65:68); setTimeout(()=>[65,68].forEach(k=>raid.keys.delete(k)),60); } raid.attackPressedAt=Date.now(); if(Math.random()<0.1) raid.skillPressedAt[Math.floor(Math.random()*3)]=Date.now(); } } catch(e){} }, 220); return 'bot';")


def js(body):
    return "(()=>{ const cc = window.__cc; " + ROOT_JS + " " + body + " })()"


async def main():
    profile = base.PROFILE + '_world_' + MODE
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
                return res.get('value') if 'value' in res else json.dumps(res)[:400]

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', name, flush=True)

            async def world():
                return await ev("const w=root.worldState; return JSON.stringify(w && {stage:w.stage, lv:w.playerLevel, map:t.currentMapCode(), q:w.quests.filter(q=>q.state!=='LOCKED').map(q=>q.code+':'+q.state+':'+q.progress+'/'+q.target)});")

            async def fight(label):
                for _ in range(90):
                    if await ev("return (gr && gr.isMounted() && raid && sim && sim.phase==='wave') ? 'ready' : 'wait';") == 'ready':
                        break
                    await asyncio.sleep(2)
                await asyncio.sleep(1.5)
                await shot(f'{label}_battle')
                await ev(BOT)
                for _ in range(80):
                    ph = await ev("return sim ? sim.phase : 'nosim';")
                    if ph in ('victory', 'defeat'):
                        break
                    await asyncio.sleep(2)
                print(label, 'phase', ph, flush=True)
                for _ in range(40):
                    st = await ev("const b=root.currentLobbyBattleState(); return JSON.stringify({s: b.settlement && {r:b.settlement.result, rw:(b.settlement.rewardItems||[]).map(x=>x.resourceName+'x'+x.amount), m:b.settlement.message}, e:b.error});")
                    if '"s":{' in st or ('"e":"' in st and '"e":""' not in st):
                        print(label, 'settle', st, flush=True)
                        break
                    await asyncio.sleep(1)
                await asyncio.sleep(2)
                await shot(f'{label}_settle')
                await ev("root.returnToLobbyFromBattlePreview(); return 1;")
                await asyncio.sleep(4)

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
                await ev(f"root.loginFlow.setInputs({{string:'{USER}'}}, {{string:'{PASS}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
                for _ in range(60):
                    view = await ev("return root.currentView;")
                    if view == 'lobby':
                        break
                    await asyncio.sleep(2)
            print('view', view, flush=True)
            for _ in range(60):
                w = await world()
                if w and w != 'null' and '"stage"' in w:
                    break
                await asyncio.sleep(2)
            print('world', w, flush=True)
            for _ in range(90):
                if await ev("return root.uiSpriteFrameCache.groupProgress('town') ? 'loading' : 'done';") == 'done':
                    break
                await asyncio.sleep(2)
            for _ in range(45):
                ok = await ev("return JSON.stringify({b:t.buildings.filter(b=>b.sprite).length, n:t.npcNodes.length, m:t.monsters.length, spines:[t.leader,...t.followers].filter(a=>a&&a.skeleton).length});")
                if '"spines":4' in ok:
                    break
                await asyncio.sleep(2)
            print('map entities', ok, flush=True)
            await call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 800, 'y': 300, 'button': 'left', 'clickCount': 1})
            await call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 800, 'y': 300, 'button': 'left', 'clickCount': 1})
            await asyncio.sleep(1)
            await shot(f'{MODE}_spawn')
            if MODE == 'village':
                await ev("root.openWorldNpcDialog('CHIEF'); return 1;")
                await asyncio.sleep(1.5)
                await shot('village_dialog_v01')
                await ev("root.worldDialogPrimary(); return 1;")
                await asyncio.sleep(4)
                print('after V01', await world(), flush=True)
                await shot('village_dialog_v02')
                await ev("if(root.worldDialog) root.worldDialogPrimary(); return 1;")
                await asyncio.sleep(3)
                print('after accept V02', await world(), flush=True)
                await ev("root.closeWorldDialog(); root.openWorldNpcDialog('INSTRUCTOR'); return 1;")
                await asyncio.sleep(1.5)
                await shot('village_dialog_train')
                await ev("root.worldDialogPrimary(); return 1;")
                await fight('train')
                print('after train', await world(), flush=True)
                await shot('village_back')
                await ev("root.openWorldNpcDialog('INSTRUCTOR'); return 1;")
                await asyncio.sleep(1.5)
                await shot('village_dialog_claim_v02')
                await ev("root.worldDialogPrimary(); return 1;")
                await asyncio.sleep(4)
                print('after V02 claim', await world(), flush=True)
                await shot('village_dialog_v03')
                await ev("if(root.worldDialog) root.worldDialogPrimary(); return 1;")
                await asyncio.sleep(3)
                await ev("root.closeWorldDialog(); root.travelWorldMap('WOODS', {x:-1600,y:0}); return 1;")
                await asyncio.sleep(6)
                await shot('woods_spawn')
                print('woods', await ev("return JSON.stringify({map:t.currentMapCode(), monsters:t.monsters.map(m=>m.camp.stageCode+':'+!!m.skeleton)});"), flush=True)
                # 走到幼鼠窝撞怪
                await ev("const c=t.def.camps.find(c=>c.stageCode==='FIELD_WOODS_1'); t.leader.x=c.x-300; t.leader.y=c.y; t.leader.node.setPosition(t.leader.x,t.leader.y,0); return 1;")
                await asyncio.sleep(3)
                await shot('woods_near_camp')
                for _ in range(20):
                    v = await ev("return root.currentView;")
                    if v == 'battle':
                        break
                    await ev("const m=t.monsters.find(m=>m.camp.stageCode==='FIELD_WOODS_1'); if(m){ t.leader.x=m.x+40; t.leader.y=m.y; t.leader.node.setPosition(t.leader.x,t.leader.y,0);} return 1;")
                    await asyncio.sleep(1)
                await fight('woods1')
                print('after woods1', await world(), flush=True)
                await shot('woods_after')
            elif MODE == 'hunt':
                await ev("root.travelWorldMap('GRAY', null); return 1;")
                await asyncio.sleep(6)
                PROBE = "return JSON.stringify({view:root.currentView, worldId:t.world&&t.world.uuid, mounted:t.isMounted(), lock:t.battleLock, leader:t.leader&&[Math.round(t.leader.x),Math.round(t.leader.y)], mons:t.monsters.filter(m=>m.camp.stageCode==='FIELD_GRAY_1').length, field:root.worldFieldStage, respawn:Array.from(t.campRespawnAt.keys())});"
                for i in range(3):
                    print('before', i, await ev(PROBE), flush=True)
                    await ev("t.campRespawnAt.clear(); root.renderCurrentView(); return 1;")
                    await asyncio.sleep(3)
                    print('after render', i, await ev(PROBE), flush=True)
                    for _ in range(10):
                        if await ev("return root.currentView;") == 'battle':
                            break
                        await ev("const m=t.monsters.find(m=>m.camp.stageCode==='FIELD_GRAY_1'); if(m){ t.leader.x=m.x+40; t.leader.y=m.y; t.leader.node.setPosition(t.leader.x,t.leader.y,0);} return 1;")
                        await asyncio.sleep(1)
                    print('contact', i, await ev(PROBE), flush=True)
                    if await ev("return root.currentView;") == 'battle':
                        await fight(f'hunt{i}')
                    print('returned', i, await ev(PROBE), flush=True)
            elif MODE == 'chain':
                async def talk(npc, label, times=3):
                    for i in range(times):
                        st = await ev(f"root.openWorldNpcDialog('{npc}'); const d=root.worldDialog; return d ? d.mode+':'+d.questCode : 'none';")
                        print(label, npc, 'dialog', st, flush=True)
                        if not st or st.startswith('idle') or st.startswith('progress') or st == 'none':
                            await ev("root.closeWorldDialog(); return 1;")
                            break
                        await asyncio.sleep(1)
                        if i == 0:
                            await shot(f'chain_{label}_{npc}')
                        if st.startswith('grow') or st.startswith('train'):
                            await ev("root.closeWorldDialog(); return 1;")
                            break
                        await ev("root.worldDialogPrimary(); return 1;")
                        await asyncio.sleep(4)
                    await ev("root.closeWorldDialog(); return 1;")
                    print(label, 'state', await world(), flush=True)

                async def goto(map_code):
                    await ev(f"root.travelWorldMap('{map_code}', null); return 1;")
                    await asyncio.sleep(6)

                async def hunt(stage, label):
                    await ev("t.campRespawnAt.clear(); root.renderCurrentView(); return 1;")
                    await asyncio.sleep(3)
                    for _ in range(25):
                        v = await ev("return root.currentView;")
                        if v == 'battle':
                            break
                        await ev(f"const m=t.monsters.find(m=>m.camp.stageCode==='{stage}'); if(m){{ t.leader.x=m.x+40; t.leader.y=m.y; t.leader.node.setPosition(t.leader.x,t.leader.y,0);}} return 1;")
                        await asyncio.sleep(1)
                    await fight(label)

                async def api(path, body='null'):
                    return await ev(f"return root.api.http.post('{path}', {body}).then(r=>'ok').catch(e=>'ERR '+e.message);")

                async def quest():
                    q = await ev("const w=root.worldState; const qs=w?w.quests:[]; const q=qs.find(x=>x.state==='DONE')||qs.find(x=>x.state==='ACCEPTED')||qs.find(x=>x.state==='AVAILABLE'); return JSON.stringify({stage:w&&w.stage, q:q||null});")
                    return json.loads(q)
                camp_of = {'MINI_RAT': 'FIELD_WOODS_1', 'SMALL_SPIDER': 'FIELD_WOODS_2', 'MEDIUM_BEAR': 'FIELD_WOODS_E', 'SPIDER_SILK': 'FIELD_WOODS_2',
                           'MEDIUM_DOG': 'FIELD_GRAY_1', 'SWORD_MALE': 'FIELD_GRAY_2', 'BOW_MALE': 'FIELD_GRAY_3', 'GARGOYLE': 'FIELD_GRAY_E'}
                npc_map = {'BOARD': 'CITY'}
                stop_city = os.environ.get('UNTIL', 'city') == 'city'
                for step in range(40):
                    info = await quest()
                    q = info['q']
                    print('step', step, info['stage'], q and (q['code'] + ':' + q['state'] + ' ' + str(q['progress']) + '/' + str(q['target'])), flush=True)
                    if not q or (stop_city and info['stage'] == 'CITY'):
                        break
                    cur = await ev("return t.currentMapCode();")
                    if q['state'] in ('DONE', 'AVAILABLE') or (q['state'] == 'ACCEPTED' and q['objective'] == 'TALK'):
                        npc = q['turnInNpc'] if q['state'] == 'DONE' or q['objective'] == 'TALK' else q['acceptNpc']
                        if q['objective'] == 'TALK' and q['state'] == 'ACCEPTED':
                            npc = q['objectiveTarget']
                        nmap = npc_map.get(npc, 'VILLAGE')
                        if cur != nmap:
                            await goto(nmap)
                        await talk(npc, q['code'].lower(), 4)
                        if q['code'] == 'V10':
                            await asyncio.sleep(8)
                        continue
                    if q['objective'] == 'GROW':
                        tgt = q['objectiveTarget']
                        if tgt == 'GACHA_DRAW':
                            print('gacha', await ev("return root.api.http.post('/api/player/gacha/draw', {poolCode:'BASIC_CONTRACT_PREVIEW', requestId:'qa-'+Date.now(), drawCount:1, paymentMode:'AUTO'}).then(r=>'ok').catch(e=>'ERR '+e.message);"), flush=True)
                        elif tgt == 'HERO_LEVEL_UP':
                            ids = json.loads(await ev("return JSON.stringify(root.currentLobbyHeroRosterState().heroes.filter(h=>h.id>0&&!h.protagonist).slice(0,4).map(h=>h.id));") or '[]')
                            print('levelup', await api(f"/api/player/heroes/{ids[0]}/level-up"), flush=True)
                        elif tgt == 'TEAM_SAVE':
                            ids = json.loads(await ev("return JSON.stringify(root.currentLobbyHeroRosterState().heroes.filter(h=>h.id>0&&!h.protagonist).slice(0,4).map(h=>h.id));") or '[]')
                            print('team save', await api('/api/player/lobby/team/save', json.dumps({'heroIds': ids, 'leaderHeroId': ids[0]})), flush=True)
                        await ev("root.loadWorldState(); return 1;")
                        await asyncio.sleep(3)
                        continue
                    target = q['objectiveTarget']
                    stage = target[6:] if target.startswith('stage:') else camp_of.get(target)
                    want_map = 'VILLAGE' if stage == 'FIELD_VILLAGE_T' else q['map']
                    if cur != want_map:
                        await goto(want_map)
                    if stage == 'FIELD_VILLAGE_T':
                        await talk('INSTRUCTOR', 'train', 1)
                        await ev("root.openWorldNpcDialog('INSTRUCTOR'); root.worldDialogPrimary(); return 1;")
                        await fight('train')
                    else:
                        await hunt(stage, f"{q['code'].lower()}_{step}")
                    await ev("root.loadWorldState(); return 1;")
                    await asyncio.sleep(3)
                if not stop_city:
                    await goto('GRAY')
                    await shot('gray_map')
                    await ev("root.openWorldMapPanel(); root.selectWorldMapPoint('GRAY'); return 1;")
                    await asyncio.sleep(2)
                    await shot('gray_worldmap')
                    await ev("root.closeWorldMapPanel(); return 1;")
                await asyncio.sleep(4)
                await shot('chain_arrive_city')
                print('final', await world(), flush=True)
                await talk('BOARD', 'c101')
                await shot('chain_city_after_board')
            else:
                await shot('city_waypoint')
                await ev("root.openWorldNpcDialog('BOARD'); return 1;")
                await asyncio.sleep(1.5)
                await shot('city_board_dialog')
                await ev("root.worldDialogPrimary(); return 1;")
                await asyncio.sleep(4)
                print('after C101', await world(), flush=True)
                await ev("root.closeWorldDialog(); root.openWorldMapPanel(); return 1;")
                await asyncio.sleep(3)
                await shot('city_worldmap')
                await ev("root.selectWorldMapPoint('GRAY'); return 1;")
                await asyncio.sleep(1.5)
                await shot('city_worldmap_gray')
                await ev("root.selectWorldMapTab(1); return 1;")
                await asyncio.sleep(2)
                await shot('city_worldmap_world2')
                await ev("root.selectWorldMapTab(0); root.selectWorldMapPoint('WOODS'); return 1;")
                await asyncio.sleep(1.5)
                await shot('city_worldmap_woods')
                await ev("root.teleportWorldMap('WOODS'); return 1;")
                await asyncio.sleep(1.5)
                await shot('city_channel')
                await asyncio.sleep(5)
                await shot('woods_from_city')
                print('after teleport', await world(), flush=True)
                await ev("root.travelWorldMap('CITY', null); return 1;")
                await asyncio.sleep(5)
                await ev("root.openWorldBountyPanel(); return 1;")
                await asyncio.sleep(3)
                await shot('city_bounty')
                await ev("root.acceptWorldBounty(0); return 1;")
                await asyncio.sleep(3)
                await shot('city_bounty_accepted')
                await ev("root.closeWorldBountyPanel(); return 1;")
                await asyncio.sleep(2)
                await shot('city_tracker')
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


asyncio.run(main())
