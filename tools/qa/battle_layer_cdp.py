# -*- coding: utf-8 -*-
"""战斗背景分层自验(2026-11-10):进一局守卫战后,把背景依次换成各分层背景(删旧背景节点 → mountBackground → 插回战场层下面),
每张隔 4 秒连拍两张(看雾带 / 浮尘在动),再震一次屏拍视差。由 battle_tour.py 改出。
用法:PREVIEW_PORT=7456 python battle_layer_cdp.py <tag> 1600x900 [背景名...]"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

args = sys.argv[1:]
TAG = args[0]
VIEWS = [a for a in args[1:] if 'x' in a and not a.startswith('--') and not a.startswith('battle_')]
NAMES = [a for a in args[1:] if a.startswith('battle_')] or ['battle_scene_field_wasteland', 'battle_scene_field_forest', 'battle_scene_raid_mine', 'battle_scene_guard_mine', 'battle_scene_daily_awaken', 'battle_scene_daily_arcane', 'battle_scene_daily_abyss']
# 正式包(7460)没有 TS 模块可 import,用 release 版进战脚本(不挂 window.__M);--ui-check 里需要模型函数时从渲染器实例拿
JS_BATTLE = open(os.path.join(base.HERE, 'js_battle_release.js' if os.environ.get('PREVIEW_PORT') == '7460' else 'js_battle2.js'), encoding='utf-8').read()
# 冒险关已下架(docs/50 §15):改走限时副本熔火矿脉进守卫战
JS_BATTLE = JS_BATTLE.replace("openLobbyBattlePreviewPanel('MAIN_1_1')", "openLobbyBattlePreviewPanel('" + os.environ.get('QA_STAGE', 'DAILY_FORGE_1') + "')")
SHOTS = os.path.join(base.SCRATCH, 'shots', 'bglayer')
os.makedirs(SHOTS, exist_ok=True)

SWAP = r"""(async (name) => {
  const sleep = ms => new Promise(z => setTimeout(z, ms));
  const cc = window.__cc, r = window.__gr, root = r.root;
  r.resolveSceneBgName = () => name;
  const ps = [`ui/battle/${name}/spriteFrame`, `ui/battle/${name}_near/spriteFrame`, 'ui/battle/battle_fog_strip/spriteFrame'];
  await Promise.all(ps.map(p => new Promise(res => cc.resources.load(p, cc.SpriteFrame, () => res()))));
  const kill = ['GuardSceneBg', 'GuardSceneNear', 'GuardSkyDrift', 'GuardFogFar', 'GuardFogNear', 'GuardTopShade'];
  root.children.slice().forEach(c => { if (kill.includes(c.name) || /^GuardMote/.test(c.name)) { c.removeFromParent(); c.destroy(); } });
  const before = root.children.length;
  r.mountBackground(root);
  const added = root.children.slice(before);
  const fieldIdx = root.getChildByName('GuardField').getSiblingIndex();
  added.forEach((c, i) => c.setSiblingIndex(fieldIdx + i));
  await sleep(1500);
  return name + ' layer=' + !!r.sceneBgLayer() + ' near=' + !!root.getChildByName('GuardSceneNear') + ' added=' + added.length;
})"""

UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        for vi, vp in enumerate(VIEWS):
            mobile = vp.endswith('m')
            w, h = [int(v) for v in vp.rstrip('m').split('x')]
            t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
            async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
                seq = 0

                async def call(method, params=None, timeout=600):
                    nonlocal seq
                    seq += 1
                    my = seq
                    await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                    while True:
                        m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                        if m.get('method') == 'Runtime.exceptionThrown':
                            d = m['params']['exceptionDetails']
                            print('  !! page exception', (d.get('exception', {}).get('description') or d.get('text', ''))[:500], flush=True)
                        if m.get('id') == my:
                            return m

                async def ev(expr, timeout=600):
                    r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                    return 'EXC ' + str(r['exceptionDetails'])[:300] if 'exceptionDetails' in r else r.get('result', {}).get('value')

                async def shot(name):
                    m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                    if 'result' in m:
                        open(os.path.join(SHOTS, f'{TAG}_{vp}_{name}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print(vp, 'shot', name, flush=True)

                await call('Runtime.enable')
                await call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 2 if mobile else 1, 'mobile': mobile,
                                                                   'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                if mobile:
                    await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                    await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
                await call('Page.navigate', {'url': base.PAGE})
                await asyncio.sleep(8)
                print(vp, 'boot', await ev(base.JS_BOOT, 900), flush=True)
                await shot('login')
                await ev("(async () => { const cc = window.__cc, root = window.__root; let btn = null; const w = n => { if (btn) return; if (n.name === 'MainAccountLoginButton') { btn = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); if (btn) btn.emit(cc.Button.EventType.CLICK); for (let i = 0; i < 40 && root.currentView !== 'loginAccount'; i++) await new Promise(z => setTimeout(z, 300)); await new Promise(z => setTimeout(z, 1500)); return root.currentView; })()", 60)
                await shot('login_account')
                print(vp, 'login', await ev(base.JS_LOGIN, 120), flush=True)
                print(vp, 'battle', (await ev(JS_BATTLE, 600) or '')[:120], flush=True)
                for _ in range(40):
                    if (await ev("!!(window.__root && window.__root.currentView === 'battle' && window.__gr && window.__gr.sim)")) is True:
                        break
                    await asyncio.sleep(1)
                for _ in range(90):
                    st = await ev("(() => { const r = window.__root && window.__root.lobbyGuardBattleRenderer; window.__gr = r || window.__gr; if (r && r.sim) r.sim.paused = true; const bs = window.__root.currentLobbyBattleState ? window.__root.currentLobbyBattleState() : null; return r ? ((r.sim ? 'sim ' : 'nosim ') + (bs ? ('err=' + bs.error + ' stage=' + bs.stageCode + ' ') : '') + (r.root ? r.root.children.map(c => c.name).slice(0, 12).join(',') : 'noroot')) : 'norenderer'; })()")
                    if st and st.startswith('sim') and 'GuardField' in st:
                        break
                    await asyncio.sleep(2)
                print(vp, 'state', st, flush=True)
                for name in NAMES:
                    print(vp, await ev(SWAP + "('%s')" % name, 120), flush=True)
                    await ev("(() => { const r = window.__gr; if (r.sim && r.sim.pendingChoice) window.__M.guardSkipChoice(r.sim); return 1; })()")
                    await shot(name.replace('battle_scene_', '') + '_a')
                    await asyncio.sleep(4)
                    await shot(name.replace('battle_scene_', '') + '_b')
                await ev("(() => { const r = window.__gr; r.shakeEnabled = true; r.shakeField(24); return 1; })()")
                await asyncio.sleep(0.06)
                await shot('shake')
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{base.PORT}/json/close/{t['id']}", timeout=5)
            except Exception:
                pass
    finally:
        proc.terminate()


if __name__ == '__main__':
    asyncio.run(main())
