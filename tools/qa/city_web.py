# -*- coding: utf-8 -*-
"""主城 P1 + 伐木村画风(11-09)实机自验:登录 → 进主城 → 出口 / NPC / 告示板可达 → 各区截图 → 地图页。
(由 deadwood_web.py 改出;原说明:枯木林 v4(docs/52 §11)实机自验:无头 Edge 打开预览 7456 → 登录 selfchk1108 → 传送进枯木林 →
① 怪物:每种怪的骨骼是否挂上、当前动作名、体型(包围盒高);② 怪群圈可走比例(≥0.97 合格);
③ 寻路可达:出生点 → 每个怪群 / 宝箱 / 兴趣点 / 出口 / NPC;④ 兴趣点运行时吸附挪位([POI] 日志,要写回 dead_v4_gen POI_FIX);
⑤ 一屏绘制次数;⑥ 各区截图(营地 / 古树林 / 沼泽 / 树根桥 / 墓园 / 伐木村 / 石阵 / 女巫谷)。
用法:PYTHONIOENCODING=utf-8 python tools/qa/city_web.py [输出目录]
"""
import asyncio
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import websockets

import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'city_web')
ACCOUNT = os.environ.get('QA_ACCOUNT', 'selfchk1108')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 40 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
CLEAR = ("if (root.evolutionPick && !root.evolutionPick.busy && root.evolutionPick.state.choice) { root.selectEvolutionCard(root.evolutionPick.state.choice.candidates[0].key); await root.confirmEvolution(); return 'evo'; }"
         " if (root.contractPick && !root.contractPick.busy) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await root.confirmStarterContract(); return 'contract'; }"
         " return 'none';")
# 传送到 (x, y):队长 + 队友 + 足迹 + 镜头
TP = ("const all=[t.leader,...t.followers]; all.forEach((a,i)=>{ a.x={x}-i*60; a.y={y}; a.node.setPosition(a.x,a.y,0); });"
      " t.trail=[new cc.Vec2({x}-200,{y}), new cc.Vec2({x},{y})]; t.applyCamera(true); return 1;")
# 原型像素 → 世界坐标:x = px / 1774 * 14000 - 7000, y = 3500 - py / 887 * 7000
SPOTS = [('plaza', 0, -150), ('avenue', 0, 900), ('west_houses', -4600, 900), ('guild', -3000, 300), ('market', 3200, -900),
         ('academy', 2900, 700), ('pond_canal', -3800, -2000), ('south_gate', 0, -2700), ('east_gate', 6000, -1000), ('east_bridge', 5000, -2200)]
# 只拍部分区域:CITY_SPOTS=plaza,avenue
if os.environ.get('CITY_SPOTS'):
    SPOTS = [s for s in SPOTS if s[0] in os.environ['CITY_SPOTS'].split(',')]


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_city'
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    logs = []
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
                    if x.get('method') == 'Runtime.consoleAPICalled':
                        args = x['params'].get('args') or []
                        text = ' '.join(str(a.get('value', '')) for a in args)
                        if '[POI]' in text or 'spine' in text.lower() or 'error' in text.lower():
                            logs.append(text[:300])
                    if x.get('id') == my:
                        return x

            async def ev(body, timeout=180):
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            async def shot(name):
                await ev("cc.game.step(); cc.game.step(); return 1;")
                await asyncio.sleep(0.5)
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 85}, 400)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}.jpg'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', name, flush=True)

            async def settle(max_s=300):
                calm = 0
                for _ in range(max_s // 2):
                    calm = calm + 1 if await ev(BUSY) == 'ok' else 0
                    if calm >= 3:
                        return
                    await asyncio.sleep(2)

            await call('Runtime.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': base.PAGE})
            r = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', r.get('result', {}).get('result', {}).get('value'), flush=True)
            view = ''
            for _ in range(240):
                view = await ev("return root ? root.currentView : 'noroot';")
                if view in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(1)
            if view != 'lobby':
                await ev(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'pass1234'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
            for _ in range(400):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted()) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    break
                await asyncio.sleep(2)
            idle = 0
            for _ in range(60):
                got = await ev(CLEAR)
                idle = idle + 1 if got == 'none' else 0
                if idle >= 3:
                    break
                await asyncio.sleep(1.5)
            await settle()
            print('map before', await ev("return t.def.code;"), flush=True)
            await ev("if (t.def.code !== 'CITY') setTimeout(() => root.travelWorldMap('CITY', null), 50); return 1;")
            for _ in range(200):
                if await ev("return (t.def && t.def.code === 'CITY' && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(2)
            await settle(400)
            await asyncio.sleep(4)
            print('map', await ev("return JSON.stringify({ code: t.def.code, leader: [Math.round(t.leader.x), Math.round(t.leader.y)] });"), flush=True)
            await shot('00_arrive')
            reach = await ev("""
              const out = { unreachable: [] };
              const w = t.def.walk;
              t.autoWalkTo(t.leader.x + 40, t.leader.y); t.autoWalkTo(t.leader.x, t.leader.y);
              const PF = t.pathfinder && t.pathfinder.constructor;
              const pf = PF ? new PF(w.left, w.bottom, w.right - w.left, w.top - w.bottom, (x, y) => t.walkable(x, y)) : null;
              const sx = t.def.spawn.x, sy = t.def.spawn.y;
              const targets = [...t.def.exits.map(e => ['exit ' + e.key, e.x, e.y]), ...t.def.npcs.map(n => ['npc ' + n.code, n.x, n.y - 60]),
                ...(t.def.pois || []).map(p => ['poi ' + p.code, p.x, p.y])];
              if (t.def.waypoint) targets.push(['waypoint', t.def.waypoint.x, t.def.waypoint.y]);
              out.pf = !!pf;
              if (pf) for (const [name, x, y] of targets) { const p = pf.find(sx, sy, x, y); if (!p) out.unreachable.push(name); }
              out.total = targets.length;
              return JSON.stringify(out);""", 600)
            print('reach', reach, flush=True)
            for name, x, y in SPOTS:
                await ev(TP.replace('{x}', str(x)).replace('{y}', str(y)))
                await asyncio.sleep(6)
                await settle(60)
                stats = await ev("const dc = cc.director.root && cc.director.root.device && cc.director.root.device.numDrawCalls; return JSON.stringify({ drawCalls: dc });")
                print(name, stats, flush=True)
                await shot(f'spot_{name}')
            # 打开地图页(鸟瞰图 + 地点)
            await ev("root.openAreaMapPanel(); return 1;")
            await asyncio.sleep(4)
            await shot('map_page')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)
        print('logs', json.dumps(logs[:40], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    asyncio.run(main())
