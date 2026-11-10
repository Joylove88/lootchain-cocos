# -*- coding: utf-8 -*-
"""主城重做演示广场实机自验 + 录屏(2026-11-11;由 city_web.py 改出):
无头 Edge 打开预览 7456/?cityDemo=<路> → 登录 → 进主城 → 检查场景层挂载(遮挡条 / 骨骼 / 路线可走)→ 几个站位截图 → 暂停主循环逐帧步进录一段走位。
用法:DEMO=moon|lit PYTHONIOENCODING=utf-8 python tools/qa/city_demo_web.py [输出目录] [--no-video]
产物:<输出目录>/shot_*.jpg、frames/f_0001.jpg…、<路>_demo.mp4(ffmpeg 在 PATH 里才出)
开跑前确认没有别的无头 Edge 在跑(电脑负载上限);跑完本脚本自己按 profile 收尾。
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

STYLE = os.environ.get('DEMO', 'moon')
os.environ['PAGE_QS'] = f'?cityDemo={STYLE}'   # boss_bar_cdp 在导入时拼 PAGE

import websockets  # noqa: E402

import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, f'city_demo_{STYLE}')
VIDEO = '--no-video' not in sys.argv
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
W, H, UNIT = 1672, 941, 2240 / 1672


def wp(px, py):
    """底图像素 → 世界坐标。"""
    return round((px - W / 2) * UNIT), round((H / 2 - py) * UNIT)


# 站位(底图像素):名字 → 队长脚点
SHOTS = {
    'moon': [('center', 800, 500), ('behind_lamp', 545, 612), ('by_fence', 420, 705), ('by_well', 600, 335), ('stairs', 1300, 285),
             ('under_arch', 1520, 725), ('by_bush', 1185, 565), ('by_roofs', 985, 725), ('by_smithy', 330, 440)],
    'lit': [('center', 800, 480), ('behind_brazier', 1190, 600), ('front_brazier', 1195, 775), ('by_well', 640, 735), ('under_arch', 235, 320),
            ('stairs', 1150, 262), ('by_banner', 345, 560), ('by_forge', 1440, 485), ('by_board', 600, 360)],
}
# 录屏走位(底图像素):起点 + 依次自动寻路到的点,每段给多少帧(20 帧 / 秒)
WALK = {
    'moon': [(800, 500, 30), (560, 606, 70), (640, 345, 80), (1190, 560, 90), (1520, 728, 80)],
    'lit': [(800, 480, 30), (1190, 600, 70), (740, 700, 70), (470, 440, 80), (240, 325, 70)],
}


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_citydemo'
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
                        if any(k in low for k in ('error', 'townscene', 'worldshaders', 'citydemo', 'effect', 'shader', 'spine failed')):
                            logs.append(text[:400])
                    if x.get('method') == 'Runtime.exceptionThrown':
                        det = x['params'].get('exceptionDetails', {})
                        props = ((det.get('exception') or {}).get('preview') or {}).get('properties') or []
                        logs.append('EXC ' + (det.get('text') or '') + ' ' + json.dumps({p.get('name'): p.get('value') for p in props}, ensure_ascii=False)[:500]
                                    + ' ' + str((det.get('exception') or {}).get('description', ''))[:300])
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
            print('cc', r.get('result', {}).get('result', {}).get('value'), 'page', base.PAGE, flush=True)
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
            await asyncio.sleep(5)
            print('map', await ev("return JSON.stringify({ code: t.def.code, scene: !!t.def.scene, size: [t.def.width, t.def.height], leader: [Math.round(t.leader.x), Math.round(t.leader.y)], view: t.viewSize() });"), flush=True)
            print('scene', await ev("""
              const sc = t.scene; const ent = t.entityRoot;
              const cnt = p => ent.children.filter(n => n.name.startsWith(p)).length;
              const bad = [];
              const s = t.def.scene;
              s.walkers.forEach((w, i) => { if (w.perch === undefined) w.route.forEach(([x, y], k) => { if (!t.walkable(x, y)) bad.push('walker' + i + '#' + k); }); });
              s.idlers.forEach((n, i) => { if (!t.walkable(n.x, n.y)) bad.push('idler' + i); });
              if (!t.walkable(t.def.waypoint.x, t.def.waypoint.y)) bad.push('waypoint');
              return JSON.stringify({ root: !!(sc.root && sc.root.isValid), strips: cnt('SceneStrip_'), flames: cnt('SceneFlame_'), idlers: cnt('SceneIdler_'), walkers: sc.walkers.map(w => [w.cfg.spine.split('/')[2], !!w.skeleton, w.idle, w.move, Math.round(w.base * 1000) / 1000]),
                glows: sc.glows.length, puffs: sc.puffs.length, mists: sc.mists.length, motes: sc.motes.length, props: t.propNodes.length, occluders: t.occluders.length, notWalkable: bad });"""), flush=True)
            await shot('00_arrive')
            for name, px, py in SHOTS[STYLE]:
                x, y = wp(px, py)
                await ev(TP.replace('{x}', str(x)).replace('{y}', str(y)))
                await asyncio.sleep(2.5)
                ok = await ev(f"return t.walkable({x}, {y}) ? 'walkable' : 'BLOCKED';")
                dc = await ev("const dc = cc.director.root && cc.director.root.device && cc.director.root.device.numDrawCalls; return dc;")
                print(name, (x, y), ok, 'drawCalls', dc, flush=True)
                await shot(f'shot_{name}')
            if VIDEO:
                frames = os.path.join(OUT, 'frames')
                shutil.rmtree(frames, ignore_errors=True)
                os.makedirs(frames)
                path = WALK[STYLE]
                x, y = wp(path[0][0], path[0][1])
                await ev(TP.replace('{x}', str(x)).replace('{y}', str(y)))
                await asyncio.sleep(2)
                await ev("cc.game.pause(); return 1;")
                n = 0
                for i, (px, py, count) in enumerate(path):
                    if i > 0:
                        x, y = wp(px, py)
                        print('walk to', (x, y), await ev(f"return t.autoWalkTo({x}, {y}) ? 'ok' : 'NO PATH';"), flush=True)
                    for _ in range(count):
                        # 固定步长:一帧 1/60 秒,3 帧出一张 = 20 帧 / 秒
                        await ev("cc.game.step(); cc.game.step(); cc.game.step(); return 1;")
                        n += 1
                        await grab(os.path.join(frames, f'f_{n:04d}.jpg'), 88)
                await ev("cc.game.resume(); return 1;")
                print('frames', n, flush=True)
                ff = shutil.which('ffmpeg')
                if ff:
                    mp4 = os.path.join(OUT, f'{STYLE}_demo.mp4')
                    subprocess.run([ff, '-y', '-loglevel', 'error', '-framerate', '20', '-i', os.path.join(frames, 'f_%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                                    '-crf', '19', '-vf', 'scale=1600:-2', mp4], check=False)
                    print('video', mp4, os.path.getsize(mp4) // 1024 if os.path.exists(mp4) else 'FAILED', 'KB', flush=True)
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)
        print('logs', json.dumps(logs[:60], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    asyncio.run(main())
