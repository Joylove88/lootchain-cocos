# -*- coding: utf-8 -*-
"""主角野外姿势特写(11-03 女主头脖子对位,用户在游戏里看和离线渲染不一样):网页正式包登录 → 选掉积压的进化抉择 →
晨风村里截队长的 待机 / 跑步 / 普攻 / 大招 几个瞬间,按队长世界坐标裁出头胸部放大。
用法:PREVIEW_PORT=7460 python tools/qa/protag_pose_shots.py <输出目录> [--user=guidetest03]
"""
import asyncio, base64, io, json, os, subprocess, sys, time, urllib.request
import websockets
from PIL import Image
import boss_bar_cdp as base

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(base.SCRATCH, 'protag_pose_shots'))
USER = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--user=')), 'guidetest03')
os.makedirs(OUT, exist_ok=True)
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); const t = root && root.lobbyTownRenderer;"
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 60 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
# 队长头部在屏幕上的位置:取队长节点世界坐标 → 屏幕像素
LEADER_SCREEN = "const wp=t.leader.node.worldPosition; const vs=cc.view.getVisibleSize(); return JSON.stringify([wp.x, wp.y, vs.width, vs.height, 1]);"


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()"


async def main():
    profile = base.PROFILE + '_evolution'
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
                if 'result' not in m:
                    return None
                img = Image.open(io.BytesIO(base64.b64decode(m['result']['data']))).convert('RGB')
                img.save(os.path.join(OUT, f'{name}.png'))
                # 头部特写:队长脚点往上 300 屏幕像素一带
                pos = await ev(LEADER_SCREEN)
                try:
                    sx, sy, vw, vh, dpr = json.loads(pos)
                    px = sx * img.width / vw
                    py = img.height - sy * img.height / vh
                    # 队长脚点往上约 230~110 px 是头胸(1600×900 舞台);放大 4 倍
                    crop = img.crop((int(px - 110), int(py - 300), int(px + 110), int(py - 80))).resize((440, 440), Image.LANCZOS)
                    crop.save(os.path.join(OUT, f'{name}_head.png'))
                except Exception as error:
                    print('crop failed', pos, error)
                print('shot', name, flush=True)
                return img

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
                await ev(f"root.loginFlow.setInputs({{string:'{USER}'}}, {{string:'pass1234'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
            for _ in range(400):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted() && t.leader && t.leader.skeleton && t.leader.skeleton.skeletonData) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    break
                await asyncio.sleep(2)
            await asyncio.sleep(3)
            # 选掉积压的进化抉择
            for _ in range(80):
                if await ev("return root.evolutionPick ? 'pick' : 'none';") != 'pick':
                    break
                await ev("await root.confirmEvolution(); return 1;")
                await asyncio.sleep(1.2)
            await asyncio.sleep(1.5)
            print('leader', await ev("return JSON.stringify({ spine: t.leader.hero.spineAsset, anim: t.leader.anim, x: Math.round(t.leader.x), y: Math.round(t.leader.y) });"), flush=True)
            await shot('01_idle')
            # 跑步:塞方向键 1.2 秒后截,再松开
            await ev("t.keys.add(cc.KeyCode.ARROW_RIGHT); return 1;")
            await asyncio.sleep(1.1)
            await shot('02_run')
            await ev("t.keys.clear(); return 1;")
            await asyncio.sleep(1.5)
            # 普攻:出手后 0.25 秒
            for i, wait in enumerate([0.12, 0.25, 0.4]):
                await ev("t.leaderAttack(); return 1;")
                await asyncio.sleep(wait)
                await shot(f'03_attack_{i}')
                await asyncio.sleep(1.6)
            # 大招(I 键 = skill index 2):仰头保持段
            await ev("t.leaderSkill(2); return 1;")
            for i, wait in enumerate([0.5, 0.5, 0.5]):
                await asyncio.sleep(wait)
                await shot(f'04_ult_{i}')
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)


if __name__ == '__main__':
    asyncio.run(main())
