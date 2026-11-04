# -*- coding: utf-8 -*-
"""跑图路线自验(11-04 用户「晨风村 → 林地 → 主城要找 NPC 接任务一路跑到出口切图;新图首次跑图解锁传送阵;出村后能回晨风村」):
网页正式包 + 本地游戏服 + 本地库。临时把 guidetest05(炼魂老号)改回「V10 待交、主城 / 荒原传送阵未激活、人在晨风村」,
依次:交 V10(不再自动传送)→ 林地东口 → 主城(罗盘激活)→ 东门 → 灰岩荒原(传送阵激活)→ 世界地图传回晨风村;每站截图 + 打印任务指路。
跑完从 qa_bak_route_* 恢复原数据。
用法:PREVIEW_PORT=7460 PYTHONIOENCODING=utf-8 python tools/qa/world_route_web.py [输出目录]
"""
import asyncio, base64, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'world_route_web'))
ACCOUNT = 'guidetest05'
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
T = ("const t = root.lobbyTownRenderer; const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 60; a.y = y; a.node.setPosition(a.x, a.y, 0); });"
     " t.trail = [new cc.Vec2(x - 200, y), new cc.Vec2(x, y)]; t.applyCamera(true); };")
INFO = (T + " const w = root.worldState; const g = t.resolveQuestGuide(w);"
        " return JSON.stringify({ map: t.def.code, pos: t.leader ? [Math.round(t.leader.x), Math.round(t.leader.y)] : null,"
        " maps: w.maps.map(m => m.mapCode + (m.unlocked ? '' : '(锁:' + m.lockReason + ')') + (m.activated ? '★' : '')),"
        " quest: (w.quests.find(q => q.state === 'DONE') || w.quests.find(q => q.state === 'ACCEPTED') || {}).code,"
        " guide: g && (g.text + ' → ' + g.point.label + ' @' + Math.round(g.point.x) + ',' + Math.round(g.point.y)), home: t.villageOrCity(w) });")
UID = 67
TABLES = ['user_story_quest', 'user_waypoint', 'user_world_position']


def sql(q):
    r = subprocess.run(['mysql', '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


def backup():
    if sql("SHOW TABLES LIKE 'qa_bak_route_user_waypoint'"):
        print('backup exists, reuse', flush=True)
        return
    for t in TABLES:
        sql(f"DROP TABLE IF EXISTS qa_bak_route_{t}; CREATE TABLE qa_bak_route_{t} AS SELECT * FROM {t} WHERE user_id={UID};")


def restore():
    for t in TABLES:
        sql(f"DELETE FROM {t} WHERE user_id={UID}; INSERT INTO {t} SELECT * FROM qa_bak_route_{t}; DROP TABLE qa_bak_route_{t};")
    print('restored', flush=True)


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    backup()
    # V10 回到「已接(对话类)」、主城第 1 章清掉、只留晨风村 / 林地传送阵、人站在村长旁
    sql(f"UPDATE user_story_quest SET state='ACCEPTED', claimed_at=NULL WHERE user_id={UID} AND quest_code='V10';"
        f" DELETE FROM user_story_quest WHERE user_id={UID} AND quest_code LIKE 'C1%';"
        f" DELETE FROM user_waypoint WHERE user_id={UID} AND map_code IN ('CITY','GRAY');"
        f" UPDATE user_world_position SET map_code='VILLAGE', pos_x=200, pos_y=420 WHERE user_id={UID};")
    profile = base.PROFILE + '_ult'
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

            async def settle(code):
                for _ in range(180):
                    if await ev(T + f" return t.def.code === '{code}' && t.leader && t.leader.node.isValid ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                        break
                    await asyncio.sleep(1)
                await asyncio.sleep(4)
                await ev("root.evolutionCheckDue = false; root.levelContractCheckDue = false; root.evolutionPick = null; root.removeNodeFromContent('LobbyEvolutionPick'); root.contractPick = null; root.removeNodeFromContent('LobbyContractPick'); root.setTownHudVisible(true); return 1;")

            async def step(name, code):
                await settle(code)
                print(name, await ev(INFO), flush=True)
                await shot(name)

            async def walk_exit(to_map):
                # 走进出口圈(队长落到出口中心,下一帧 checkExitsAndWaypoint 切图)
                print('  exit ->', to_map, await ev(T + f" const e = t.def.exits.find(x => x.toMap === '{to_map}'); t.exitCooldownUntil = 0; tp(e.x, e.y); return e.label;"), flush=True)

            async def walk_waypoint():
                await ev(T + " tp(t.def.waypoint.x + 20, t.def.waypoint.y - 10); return 1;")
                for _ in range(15):
                    await asyncio.sleep(1)
                    got = await ev(T + " const m = root.worldState.maps.find(x => x.mapCode === t.def.code); return m && m.activated ? 'ok' : 'wait';")
                    if got == 'ok':
                        break
                print('  waypoint activated', got, flush=True)

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(300):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount') and await ev("return (window.__lootchainPack && !root.bootPreloadActive) ? 'y' : 'n';") == 'y':
                    break
                await asyncio.sleep(1)
            print('view', view, flush=True)
            if view != 'lobby':
                await ev(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'pass1234'}}); root.loginFlow.acceptedAgreement = true; root.run(() => root.loginFlow.login()); return 1;")
            for _ in range(240):
                if await ev("return root.currentView === 'lobby' && root.worldState ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(1)
            await step('01_village_before_v10', 'VILLAGE')
            # 交 V10(同突破成功页「继续」流程)
            print('  claim V10', await ev("await root.leaveVillageAfterRealm(); return root.statusText || 'ok';"), flush=True)
            await asyncio.sleep(3)
            await step('02_village_after_v10', 'VILLAGE')
            await walk_exit('WOODS')
            await step('03_woods_arrive', 'WOODS')
            await ev(T + " const e = t.def.exits.find(x => x.toMap === 'CITY'); tp(e.x - 420, e.y); t.setActorFacing(t.leader, 1); return 1;")
            await asyncio.sleep(3)
            await shot('04_woods_city_exit')
            await walk_exit('CITY')
            await step('05_city_arrive', 'CITY')
            await walk_waypoint()
            await step('06_city_waypoint', 'CITY')
            await ev(T + " const e = t.def.exits.find(x => x.toMap === 'GRAY'); tp(e.x - 380, e.y + 40); t.setActorFacing(t.leader, 1); return 1;")
            await asyncio.sleep(3)
            await shot('07_city_gray_exit')
            await walk_exit('GRAY')
            await step('08_gray_arrive', 'GRAY')
            await walk_waypoint()
            await step('09_gray_waypoint', 'GRAY')
            # 世界地图:晨风村可传
            await ev("root.openWorldQuestTracker(); return 1;")
            await asyncio.sleep(1.5)
            await ev("root.selectWorldMapPoint('VILLAGE'); return 1;")
            await asyncio.sleep(2)
            await shot('10_worldmap_village')
            await ev("root.teleportWorldMap('VILLAGE'); return 1;")
            await asyncio.sleep(8)
            await step('11_back_village', 'VILLAGE')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)
        restore()


asyncio.run(main())
