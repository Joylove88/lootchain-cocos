# -*- coding: utf-8 -*-
"""docs/50 P1 安卓模拟器全流程:新号从出生走到出村进主城,再做完主城第 1 章(灰岩荒原),每步 adb 截图。
前提:模拟器 emulator-5554 已装调试包并在前台;本地游戏服 8081;inspector 端口 43086(adb forward)。
用法:QA_USER=guidetest06 QA_PASS=*** python tools/qa/world_native_chain.py <输出目录>"""
import asyncio, json, os, subprocess, sys, time
import websockets

OUT = sys.argv[1] if len(sys.argv) > 1 else 'world_native'
os.makedirs(OUT, exist_ok=True)
USER = os.environ.get('QA_USER', 'guidetest06')
PASS = os.environ.get('QA_PASS', 'pass1234')
ADB = ['adb', '-s', 'emulator-5554']
WS = 'ws://127.0.0.1:43086/00010002-0003-4004-8005-000600070008'
ROOT = ("let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); "
        "const t=root&&root.lobbyTownRenderer; const gr=root&&root.lobbyGuardBattleRenderer; const raid=gr&&gr.raid; const sim=gr&&gr.sim;")
BOT = ("window.__clearBot = setInterval(()=>{ try { " + ROOT + " const u=sim&&sim.monsters.find(m=>m.player); if(!u||sim.phase!=='wave'){ clearInterval(window.__clearBot); return; } "
       "const alive=sim.heroes.filter(h=>!h.dead); if(!alive.length) return; const tg=alive.reduce((a,b)=>Math.abs((b.fx||0)-u.x)<Math.abs((a.fx||0)-u.x)?b:a); "
       "const side=(tg.fx||0)<u.x?1:-1; const tx=(tg.fx||0)+side*0.55; const laneD=(tg.flane||0.5)-(u.laneF||0.5); [65,68,87,83].forEach(k=>raid.keys.delete(k)); "
       "if(Math.abs(tx-u.x)>0.35||Math.abs(laneD)>0.25){ if(Math.abs(tx-u.x)>0.35) raid.keys.add(tx<u.x?65:68); if(Math.abs(laneD)>0.25) raid.keys.add(laneD<0?87:83); "
       "setTimeout(()=>[65,68,87,83].forEach(k=>raid.keys.delete(k)),150); } else { if ((u.facing||-1) !== -side) { raid.keys.add(side>0?65:68); setTimeout(()=>[65,68].forEach(k=>raid.keys.delete(k)),60); } "
       "raid.attackPressedAt=Date.now(); if(Math.random()<0.1) raid.skillPressedAt[Math.floor(Math.random()*3)]=Date.now(); } } catch(e){} }, 220); return 'bot';")
CAMP_OF = {'MINI_RAT': 'FIELD_WOODS_1', 'SMALL_SPIDER': 'FIELD_WOODS_2', 'MEDIUM_BEAR': 'FIELD_WOODS_E', 'SPIDER_SILK': 'FIELD_WOODS_2',
           'MEDIUM_DOG': 'FIELD_GRAY_1', 'SWORD_MALE': 'FIELD_GRAY_2', 'BOW_MALE': 'FIELD_GRAY_3', 'GARGOYLE': 'FIELD_GRAY_E'}
NPC_MAP = {'BOARD': 'CITY'}


def shot(name):
    with open(os.path.join(OUT, f'{name}.png'), 'wb') as f:
        f.write(subprocess.run(ADB + ['exec-out', 'screencap', '-p'], capture_output=True).stdout)
    print('shot', name, flush=True)


async def main():
    subprocess.run(ADB + ['forward', 'tcp:43086', 'tcp:43086'], capture_output=True)
    subprocess.run(ADB + ['reverse', 'tcp:8081', 'tcp:8081'], capture_output=True)
    async with websockets.connect(WS, max_size=None, open_timeout=15, ping_interval=None) as ws:
        seq = 0

        async def call(m, p=None, timeout=60):
            nonlocal seq
            seq += 1
            my = seq
            await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
            while True:
                x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                if x.get('id') == my:
                    return x

        await call('Runtime.enable')

        async def ev(body, timeout=60):
            r = await call('Runtime.evaluate', {'expression': f'(async () => {{ {ROOT} {body} }})()', 'awaitPromise': True, 'returnByValue': True}, timeout)
            res = r.get('result', {})
            if 'exceptionDetails' in res:
                return 'EXC ' + json.dumps(res['exceptionDetails'])[:300]
            return res.get('result', {}).get('value')

        async def world():
            return await ev("const w=root.worldState; return JSON.stringify(w && {stage:w.stage, lv:w.playerLevel, map:t.currentMapCode(), q:w.quests.filter(q=>q.state!=='LOCKED').map(q=>q.code+':'+q.state+':'+q.progress+'/'+q.target)});")

        async def fight(label):
            for _ in range(60):
                if await ev("return (gr && gr.isMounted() && raid && sim && sim.phase==='wave') ? 'ready' : 'wait';") == 'ready':
                    break
                await asyncio.sleep(2)
            await asyncio.sleep(1.5)
            shot(f'{label}_battle')
            await ev(BOT)
            ph = ''
            for _ in range(90):
                ph = await ev("return sim ? sim.phase : 'nosim';")
                if ph in ('victory', 'defeat'):
                    break
                await asyncio.sleep(2)
            for _ in range(40):
                st = await ev("const b=root.currentLobbyBattleState(); return JSON.stringify({s: b.settlement && {r:b.settlement.result, rw:(b.settlement.rewardItems||[]).map(x=>x.resourceName+'x'+x.amount)}, e:b.error});")
                if st and ('"s":{' in st or ('"e":"' in st and '"e":""' not in st)):
                    break
                await asyncio.sleep(1)
            print(label, ph, st, flush=True)
            await asyncio.sleep(2)
            shot(f'{label}_settle')
            await ev("root.returnToLobbyFromBattlePreview(); return 1;")
            await asyncio.sleep(5)

        async def talk(npc, label, times=4):
            for i in range(times):
                st = await ev(f"root.openWorldNpcDialog('{npc}'); const d=root.worldDialog; return d ? d.mode+':'+d.questCode : 'none';")
                print(label, npc, st, flush=True)
                if not st or st.startswith('idle') or st.startswith('progress') or st == 'none':
                    await ev("root.closeWorldDialog(); return 1;")
                    break
                await asyncio.sleep(1.5)
                if i == 0:
                    shot(f'{label}_{npc}')
                if st.startswith('grow') or st.startswith('train'):
                    await ev("root.closeWorldDialog(); return 1;")
                    break
                await ev("root.worldDialogPrimary(); return 1;")
                await asyncio.sleep(4)
            await ev("root.closeWorldDialog(); return 1;")

        async def goto(code):
            await ev(f"root.travelWorldMap('{code}', null); return 1;")
            await asyncio.sleep(8)

        async def hunt(stage, label):
            for _ in range(25):
                if await ev("return root.currentView;") == 'battle':
                    break
                await ev(f"const m=t.monsters.find(m=>m.camp.stageCode==='{stage}'); if(m){{ t.leader.x=m.x+40; t.leader.y=m.y; t.leader.node.setPosition(t.leader.x,t.leader.y,0);}} else {{ t.campRespawnAt.clear(); t.ensureMonsters(); }} return 1;")
                await asyncio.sleep(1.2)
            await fight(label)

        # 换号登录
        view = await ev("return root.currentView;")
        print('view', view, flush=True)
        if view != 'login':
            await ev("root.logoutToLoginPage(); return 1;")
            await asyncio.sleep(5)
        await ev(f"root.loginFlow.setInputs({{string:'{USER}'}}, {{string:'{PASS}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'go';")
        for _ in range(60):
            if await ev("return root.currentView;") == 'lobby':
                break
            await asyncio.sleep(2)
        for _ in range(90):
            w = await world()
            if w and '"stage"' in w and await ev("return root.uiSpriteFrameCache.groupProgress('town') ? 'l' : 'd';") == 'd':
                break
            await asyncio.sleep(2)
        await asyncio.sleep(6)
        print('start', await world(), flush=True)
        shot('00_spawn')
        if os.environ.get('MODE') == 'fight':
            # docs/50 §14 地图即时战斗:机器人走向最近的怪、J 连打、偶尔技能
            fbot = ("window.__fieldBot = setInterval(()=>{ try { " + ROOT + " const L=t.leader; if(!L) return; "
                    "const alive=t.monsters.filter(m=>!m.dead && m.camp.stageCode===window.__target); [65,68,87,83].forEach(k=>t.keys.delete(k)); "
                    "if(!alive.length) return; const m=alive.reduce((a,b)=>Math.hypot(b.x-L.x,b.y-L.y)<Math.hypot(a.x-L.x,a.y-L.y)?b:a); "
                    "const dx=m.x-L.x, dy=m.y-L.y; if(Math.abs(dx)>130||Math.abs(dy)>60){ if(Math.abs(dx)>110) t.keys.add(dx<0?65:68); if(Math.abs(dy)>50) t.keys.add(dy>0?87:83); } "
                    "else { if((dx>0?1:-1)!==L.facing){ t.keys.add(dx<0?65:68); setTimeout(()=>[65,68].forEach(k=>t.keys.delete(k)),40);} t.leaderAttack(); if(Math.random()<0.08) t.leaderSkill(Math.floor(Math.random()*3)); } } catch(e){} }, 120); return 'bot';")
            fmap = os.environ.get('FMAP', 'WOODS')
            await ev(f"root.travelWorldMap('{fmap}', null); return 1;")
            for _ in range(120):
                ok = await ev("const g=t.groundRoot; const tiles=g?g.children.filter(c=>c.name.startsWith('Tile_')).length:0; return (tiles>20 && t.leader && t.leader.skeleton && t.monsters.filter(m=>m.skeleton).length>=3) ? 'ok' : 'wait';")
                if ok == 'ok':
                    break
                await asyncio.sleep(2)
            await asyncio.sleep(3)
            shot('10_field_map')
            await ev(fbot)
            for i, camp in enumerate(os.environ.get('FCAMPS', 'FIELD_WOODS_1,FIELD_WOODS_2,FIELD_WOODS_E').split(',')):
                await ev(f"window.__target='{camp}'; t.campRespawnAt.delete('{camp}'); t.ensureMonsters(); const c=t.def.camps.find(c=>c.stageCode==='{camp}'); t.leader.x=c.x-260; t.leader.y=c.y; t.leader.node.setPosition(t.leader.x,t.leader.y,0); t.trail=[]; return 1;")
                t0 = time.time()
                shots = 0
                st = ''
                while time.time() - t0 < 90:
                    st = await ev(f"const ms=t.monsters.filter(m=>m.camp.stageCode==='{camp}'); return JSON.stringify({{alive:ms.filter(m=>!m.dead).length, hp:ms.map(m=>m.hp+'/'+m.maxHp), lhp:Math.round(t.leaderHp)+'/'+t.leaderMaxHp, resp:t.campRespawnAt.has('{camp}')}});")
                    if shots < 2 and time.time() - t0 > 2.5 + shots * 2.5:
                        shot(f'{20 + i}_{camp}_{shots}')
                        shots += 1
                    if '"resp":true' in (st or ''):
                        break
                    await asyncio.sleep(0.8)
                print(camp, round(time.time() - t0, 1), 's', st, flush=True)
                await asyncio.sleep(3)
                shot(f'{20 + i}_{camp}_done')
            await ev("clearInterval(window.__fieldBot); return 1;")
            print('world', await world(), flush=True)
            return
        for step in range(60):
            info = json.loads(await ev("const w=root.worldState; const qs=w?w.quests:[]; const q=qs.find(x=>x.state==='DONE')||qs.find(x=>x.state==='ACCEPTED')||qs.find(x=>x.state==='AVAILABLE'); return JSON.stringify({stage:w&&w.stage, q:q||null});"))
            q = info['q']
            print('step', step, info['stage'], q and f"{q['code']}:{q['state']} {q['progress']}/{q['target']}", flush=True)
            if not q:
                break
            cur = await ev("return t.currentMapCode();")
            if q['state'] in ('DONE', 'AVAILABLE') or (q['state'] == 'ACCEPTED' and q['objective'] == 'TALK'):
                npc = q['objectiveTarget'] if (q['state'] == 'ACCEPTED' and q['objective'] == 'TALK') else (q['turnInNpc'] if q['state'] == 'DONE' else q['acceptNpc'])
                nmap = NPC_MAP.get(npc, 'VILLAGE' if info['stage'] == 'VILLAGE' else 'CITY')
                if cur != nmap:
                    await goto(nmap)
                await talk(npc, f"{step:02d}_{q['code'].lower()}")
                if q['code'] == 'V10':
                    await asyncio.sleep(10)
                    shot(f'{step:02d}_arrive_city')
                continue
            if q['objective'] == 'GROW':
                tgt = q['objectiveTarget']
                ids = json.loads(await ev("return JSON.stringify(root.currentLobbyHeroRosterState().heroes.filter(h=>h.id>0&&!h.protagonist).slice(0,4).map(h=>h.id));") or '[]')
                if tgt == 'GACHA_DRAW':
                    r = await ev("return root.api.http.post('/api/player/gacha/draw', {poolCode:'BASIC_CONTRACT_PREVIEW', requestId:'qa-'+Date.now(), drawCount:1, paymentMode:'AUTO'}).then(r=>'ok').catch(e=>'ERR '+e.message);")
                elif tgt == 'HERO_LEVEL_UP':
                    r = await ev(f"return root.api.http.post('/api/player/heroes/{ids[0]}/level-up').then(r=>'ok').catch(e=>'ERR '+e.message);")
                else:
                    r = await ev(f"return root.api.http.post('/api/player/lobby/team/save', {json.dumps({'heroIds': ids, 'leaderHeroId': ids[0]})}).then(r=>'ok').catch(e=>'ERR '+e.message);")
                print('grow', tgt, r, flush=True)
                await ev("root.loadWorldState(); return 1;")
                await asyncio.sleep(3)
                continue
            target = q['objectiveTarget']
            stage = target[6:] if target.startswith('stage:') else CAMP_OF.get(target)
            want = 'VILLAGE' if stage == 'FIELD_VILLAGE_T' else q['map']
            if cur != want:
                await goto(want)
                shot(f'{step:02d}_map_{want.lower()}')
            if stage == 'FIELD_VILLAGE_T':
                await ev("root.openWorldNpcDialog('INSTRUCTOR'); return 1;")
                await asyncio.sleep(1.5)
                shot(f'{step:02d}_train_dialog')
                await ev("root.worldDialogPrimary(); return 1;")
                await fight(f'{step:02d}_train')
            else:
                await hunt(stage, f"{step:02d}_{q['code'].lower()}")
            await ev("root.loadWorldState(); return 1;")
            await asyncio.sleep(3)
        print('final', await world(), flush=True)
        await ev("root.openWorldMapPanel(); root.selectWorldMapPoint('GRAY'); return 1;")
        await asyncio.sleep(3)
        shot('90_worldmap')
        await ev("root.closeWorldMapPanel(); root.openWorldBountyPanel(); return 1;")
        await asyncio.sleep(3)
        shot('91_bounty')
        await ev("root.closeWorldBountyPanel(); return 1;")


asyncio.run(main())
