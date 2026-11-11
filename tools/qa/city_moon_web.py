# -*- coding: utf-8 -*-
"""主城(月夜整图场景)实机自验 + 录屏(2026-11-11;由演示广场的自验脚本改出):
无头 Edge 打开预览 7456 → 登录 → 进主城 → 场景层挂载检查 → 可达性(出口 / NPC / 告示板 / 传送阵 / 默认落点)→ 巡检截图
(9 个街区 + 每个 NPC + 两个出口)→ 地图页 → 可选录一段走位。
用法:PYTHONIOENCODING=utf-8 python tools/qa/city_moon_web.py [输出目录] [--video] [--only=tour|npc|exit]
产物:<输出目录>/tour_*.jpg / npc_*.jpg / exit_*.jpg / map_page.jpg、frames/ + city_moon.mp4(--video)
开跑前确认没有别的无头 Edge 在跑(电脑负载上限)。
"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

import boss_bar_cdp as base

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'city_moon_web')
VIDEO = '--video' in sys.argv
PROBE_ONLY = '--probe' in sys.argv
# 调试自动寻路:--debug-walk=x0,y0,x1,y1(世界坐标)把队伍放到起点、寻路到终点,逐帧打印队长位置和剩余折点
DEBUG_WALK = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--debug-walk=')), '')
# 录屏每段路最多录多少张(20 张 = 1 秒);走到了提前收
MAX_LEG = 320
ONLY = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--only=')), '')
ACCOUNT = os.environ.get('QA_ACCOUNT', 'selfchk1108')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 40 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
CLEAR = ("if (root.evolutionPick && !root.evolutionPick.busy && root.evolutionPick.state.choice) { root.selectEvolutionCard(root.evolutionPick.state.choice.candidates[0].key); await root.confirmEvolution(); return 'evo'; }"
         " if (root.contractPick && !root.contractPick.busy) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await root.confirmStarterContract(); return 'contract'; }"
         " return 'none';")
TP = ("t.autoPath = null; const all=[t.leader,...t.followers]; all.forEach((a,i)=>{ a.x={x}-i*50; a.y={y}; a.node.setPosition(a.x,a.y,0); });"
      " t.trail=[new cc.Vec2({x}-160,{y}), new cc.Vec2({x},{y})]; t.applyCamera(true); return 1;")
# 巡检点:9 个街区的中心(就近找能站的点)+ 每个 NPC 旁边 + 两个出口门内
POINTS = """
  const d = t.def; const out = [];
  const near = (x, y) => t.walkable(x, y) ? { x, y } : t.nearestWalkable(x, y);
  const names = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const p = near(Math.round((c - 1) * d.width * 0.31), Math.round((1 - r) * d.height * 0.31));
    if (p) out.push(['tour_' + r + c + '_' + names[r * 3 + c], Math.round(p.x), Math.round(p.y)]);
  }
  for (const n of d.npcs) { const p = near(n.x - 110 * (n.flip || 1), n.y - 50); if (p) out.push(['npc_' + n.code.toLowerCase(), Math.round(p.x), Math.round(p.y)]); }
  // 出口:站在门内(离出口圈 110 以外,朝出生点方向),踩进圈里会直接换图
  for (const e of d.exits) { const dx = d.spawn.x - e.x, dy = d.spawn.y - e.y, L = Math.hypot(dx, dy) || 1;
    const p = near(e.x + dx / L * (e.radius + 110), e.y + dy / L * (e.radius + 110)); if (p) out.push(['exit_' + e.key, Math.round(p.x), Math.round(p.y)]); }
  return JSON.stringify(out);
"""
REACH = """
  const out = { unreachable: [], blocked: [] };
  const w = t.def.walk;
  const pf = t.makePathfinder ? t.makePathfinder() : null;
  const sx = t.def.spawn.x, sy = t.def.spawn.y;
  const targets = [...t.def.exits.map(e => ['exit ' + e.key, e.x, e.y]), ...t.def.npcs.map(n => ['npc ' + n.code, n.x, n.y - 60]),
    ...t.def.buildings.map(b => ['door ' + b.key, b.x + b.door.x, b.y + b.door.y]), ['waypoint', t.def.waypoint.x, t.def.waypoint.y],
    ['landing', t.def.waypoint.x + 40, t.def.waypoint.y - 150], ['spawn', sx, sy],
    ...(t.def.scene ? t.def.scene.walkers.filter(wk => wk.perch === undefined).flatMap((wk, i) => wk.route.map(([x, y], k) => ['walker' + i + '#' + k, x, y])) : [])];
  out.pf = !!pf;
  for (const [name, x, y] of targets) {
    if (!t.walkable(x, y)) out.blocked.push(name);
    if (pf && !pf.find(sx, sy, x, y)) out.unreachable.push(name);
  }
  out.total = targets.length;
  return JSON.stringify(out);
"""


# 逐层开关量帧耗时 / 绘制批次:找出哪一层最费(--probe)。帧耗时带一次 readPixels 强制等 GPU 画完。
PROBE = """
  const gl = (cc.director.root.device && cc.director.root.device.gl) || null;
  const px = new Uint8Array(4);
  const measure = () => {
    cc.game.step(); cc.game.step();
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) { cc.game.step(); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return [Math.round((performance.now() - t0) / 3), cc.director.root.device.numDrawCalls];
  };
  const ent = t.entityRoot, ground = t.groundRoot, world = t.world;
  const on = list => list.filter(n => n && n.isValid && n.active);
  const groups = {
    world: [world],
    fx: [t.scene.root],
    glows: t.scene.root ? t.scene.root.children.filter(n => n.name.startsWith('Glow_')) : [],
    mist: t.scene.root ? t.scene.root.children.filter(n => n.name.startsWith('Mist_') || n.name.startsWith('Smoke_')) : [],
    strips: ent.children.filter(n => n.name.startsWith('SceneStrip_')),
    entProps: ent.children.filter(n => n.name.startsWith('TownProp_')),
    npcs: t.npcNodes.map(n => n.node),
    base: ground.children.filter(n => n.name.startsWith('TownProp_') && !t.def.props[Number(n.name.split('_')[1])].water),
    water: ground.children.filter(n => n.name.startsWith('TownProp_') && t.def.props[Number(n.name.split('_')[1])].water),
    worldOther: world.children.filter(n => n !== ent && n !== ground && n !== t.scene.root),
  };
  const out = { worldKids: world.children.map(n => n.name + ':' + n.children.length), all: measure() };
  for (const key of Object.keys(groups)) {
    const list = on(groups[key]);
    list.forEach(n => { n.active = false; });
    out[key] = [list.length, ...measure()];
    list.forEach(n => { n.active = true; });
  }
  measure();
  return JSON.stringify(out);
"""


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_citymoon'
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
                        text = ' '.join(str(a.get('value', a.get('description', ''))) for a in args)
                        low = text.lower()
                        if any(k in low for k in ('error', 'townscene', 'worldshaders', 'effect', 'shader', 'spine failed')):
                            logs.append(text[:400])
                    if x.get('id') == my:
                        return x

            async def ev(body, timeout=180):
                r = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = r.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(res)[:300]

            async def grab(path, quality=85):
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': quality}, 400)
                if 'result' in m:
                    open(path, 'wb').write(base64.b64decode(m['result']['data']))
                    return True
                return False

            async def shot(name):
                await ev("cc.game.step(); cc.game.step(); return 1;")
                await asyncio.sleep(0.5)
                if await grab(os.path.join(OUT, f'{name}.jpg')):
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
            await ev("if (t.def.code !== 'CITY') setTimeout(() => root.travelWorldMap('CITY', null), 50); return 1;")
            for _ in range(200):
                if await ev("return (t.def && t.def.code === 'CITY' && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok':
                    break
                await asyncio.sleep(2)
            await settle(400)
            await asyncio.sleep(5)
            print('map', await ev("return JSON.stringify({ code: t.def.code, scene: !!t.def.scene, size: [t.def.width, t.def.height], leader: [Math.round(t.leader.x), Math.round(t.leader.y)], view: t.viewSize() });"), flush=True)
            print('scene', await ev("""
              const sc = t.scene; const ent = t.entityRoot;
              const cnt = p => ent.children.filter(n => n.name.startsWith(p)).length;
              return JSON.stringify({ root: !!(sc.root && sc.root.isValid), strips: cnt('SceneStrip_'), stripsOn: ent.children.filter(n => n.name.startsWith('SceneStrip_') && n.active).length, npcsOn: t.npcNodes.filter(n => n.node.active).length,
                flames: cnt('SceneFlame_'), walkers: sc.walkers.map(w => [w.cfg.spine.split('/')[2], !!w.skeleton, Math.round(w.base * 1000) / 1000]),
                glows: sc.glows.length, puffs: sc.puffs.length, mists: sc.mists.length, motes: sc.motes.length, props: t.propNodes.length, occluders: t.occluders.length, npcs: t.npcNodes.length });"""), flush=True)
            print('reach', await ev(REACH, 600), flush=True)
            await shot('00_arrive')
            points = json.loads(await ev(POINTS))
            if DEBUG_WALK:
                x0, y0, x1, y1 = [float(v) for v in DEBUG_WALK.split(',')]
                await ev(TP.replace('{x}', str(x0)).replace('{y}', str(y0)))
                await asyncio.sleep(1)
                await ev("cc.game.pause(); return 1;")
                print('debug walk', await ev(f"return t.autoWalkTo({x1}, {y1}) ? 'ok' : 'NO PATH';"), flush=True)
                for i in range(140):
                    line = await ev("""cc.game.step();
                      const sc = t.def.scene; const u = sc.unit, c = sc.walk.cell;
                      const cellOf = (x, y) => [Math.floor((x / u + sc.px[0] / 2) / c * 100) / 100, Math.floor((sc.px[1] / 2 - y / u) / c * 100) / 100];
                      const p = t.autoPath || [];
                      return JSON.stringify({ at: [Math.round(t.leader.x * 10) / 10, Math.round(t.leader.y * 10) / 10], cell: cellOf(t.leader.x, t.leader.y),
                        left: p.length, next: p.slice(0, 3).map(q => cellOf(q.x, q.y)), replans: t.autoProbe.replans, ok: t.walkable(t.leader.x, t.leader.y) });""")
                    if i < 40 or i % 10 == 0:
                        print(' ', i, line, flush=True)
                await ev("cc.game.resume(); return 1;")
                return
            if PROBE_ONLY:
                await ev("cc.game.pause(); return 1;")
                for name, x, y in [p for p in points if p[0] in ('tour_11_c', 'tour_12_e', 'tour_21_s')]:
                    await ev(TP.replace('{x}', str(x)).replace('{y}', str(y)))
                    await ev("cc.game.step(); cc.game.step(); cc.game.step(); return 1;")
                    print('probe', name, await ev(PROBE, 900), flush=True)
                await ev("cc.game.resume(); return 1;")
                return
            for name, x, y in points:
                if ONLY and not name.startswith(ONLY):
                    continue
                await ev(TP.replace('{x}', str(x)).replace('{y}', str(y)))
                await asyncio.sleep(2.5)
                dc = await ev("const dc = cc.director.root && cc.director.root.device && cc.director.root.device.numDrawCalls; return dc;")
                print(name, (x, y), 'drawCalls', dc, flush=True)
                await shot(name)
            await ev("root.openAreaMapPanel(); return 1;")
            await asyncio.sleep(4)
            await shot('map_page')
            await ev("try { root.closeWorldMapPanel(); } catch (e) {} return 1;")
            await asyncio.sleep(1.5)
            if VIDEO:
                frames = os.path.join(OUT, 'frames')
                shutil.rmtree(frames, ignore_errors=True)
                os.makedirs(frames)
                # 走一圈(自动寻路,走到了停半秒再去下一个):广场 → 教堂台阶 → 穿拱门到集市 → 东门 → 回头过广场下台阶到南门 → 公会院子
                by_name = {p[0]: p for p in points}
                order = ['npc_bard', 'npc_flower_girl', 'npc_scholar', 'npc_old_man', 'npc_vendor', 'npc_merchant', 'npc_guard_e', 'npc_guard_s', 'npc_guildmaster']
                route = [by_name[k] for k in order if k in by_name]
                sp = json.loads(await ev("return JSON.stringify([t.def.spawn.x, t.def.spawn.y]);"))
                await ev(TP.replace('{x}', str(sp[0])).replace('{y}', str(sp[1])))
                await asyncio.sleep(2)
                await ev("try { root.closeWorldMapPanel(); } catch (e) {} return 1;")
                await asyncio.sleep(1)
                await ev("cc.game.pause(); return 1;")
                n = 0
                for name, x, y in route:
                    print('walk to', name, await ev(f"return t.autoWalkTo({x}, {y}) ? 'ok' : 'NO PATH';"), flush=True)
                    rest = -1
                    for _ in range(MAX_LEG):
                        # 一张画面 = 游戏里走 3 帧(50 毫秒)→ 按 20 帧 / 秒合成就是原速
                        state = await ev("cc.game.step(); cc.game.step(); cc.game.step(); return t.autoPath ? 'walking' : 'arrived';")
                        n += 1
                        await grab(os.path.join(frames, f'f_{n:04d}.jpg'), 88)
                        if state == 'arrived':
                            rest = 10 if rest < 0 else rest - 1
                            if rest == 0:
                                break
                    print('  leg frames', n, 'leader', await ev("return JSON.stringify([Math.round(t.leader.x), Math.round(t.leader.y)]);"), flush=True)
                await ev("cc.game.resume(); return 1;")
                await asyncio.sleep(1)
                ff = shutil.which('ffmpeg')
                if ff:
                    mp4 = os.path.join(OUT, 'city_moon.mp4')
                    subprocess.run([ff, '-y', '-loglevel', 'error', '-framerate', '20', '-i', os.path.join(frames, 'f_%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                                    '-crf', '19', '-vf', 'scale=1600:-2', mp4], check=False)
                    print('video', mp4, os.path.getsize(mp4) // 1024 if os.path.exists(mp4) else 'FAILED', 'KB', flush=True)
            # 出口往返(放最后,会换图):踩进主城出口 → 到对面图 → 踩对面图通往主城的出口 → 回到主城,落点要能站、离门不远
            if not ONLY:
                for key in json.loads(await ev("return JSON.stringify(t.def.exits.map(e => e.key));")):
                    ex = json.loads(await ev(f"const e = t.def.exits.find(v => v.key === '{key}'); return JSON.stringify([e.x, e.y, e.toMap]);"))
                    await ev(TP.replace('{x}', str(ex[0])).replace('{y}', str(ex[1])))
                    code = 'CITY'
                    for _ in range(90):
                        await asyncio.sleep(2)
                        code = await ev("return (t && t.def && t.isMounted() && t.leader) ? t.def.code : 'wait';")
                        if code not in ('CITY', 'wait'):
                            break
                    await settle(200)
                    there = await ev("return JSON.stringify({ map: t.def.code, leader: [Math.round(t.leader.x), Math.round(t.leader.y)], ok: t.walkable(t.leader.x, t.leader.y) });")
                    back = json.loads(await ev("const e = t.def.exits.find(v => v.toMap === 'CITY'); return JSON.stringify(e ? [e.x, e.y, e.toSpawn.x, e.toSpawn.y] : []);"))
                    if not back:
                        print('exit', key, '->', there, 'NO EXIT BACK', flush=True)
                        continue
                    await ev(TP.replace('{x}', str(back[0])).replace('{y}', str(back[1])))
                    for _ in range(90):
                        await asyncio.sleep(2)
                        if await ev("return (t && t.def && t.isMounted() && t.leader) ? t.def.code : 'wait';") == 'CITY':
                            break
                    await settle(200)
                    await asyncio.sleep(3)
                    here = await ev(f"return JSON.stringify({{ map: t.def.code, leader: [Math.round(t.leader.x), Math.round(t.leader.y)], ok: t.walkable(t.leader.x, t.leader.y), want: [{back[2]}, {back[3]}], off: Math.round(Math.hypot(t.leader.x - {back[2]}, t.leader.y - {back[3]})) }});")
                    print('exit', key, '->', there, '-> back', here, flush=True)
                    await shot('back_from_' + ex[2].lower())
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)
        print('logs', json.dumps(logs[:40], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    asyncio.run(main())
