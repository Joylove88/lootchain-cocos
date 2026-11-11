# -*- coding: utf-8 -*-
"""守卫战局内弹层截图(11-11 B 风格统一留底 / 自验):三选一 / 宝箱轮盘(转前 + 停后)/ 战斗设置 / 退出确认 / 输出统计 / 胜利 / 失败。
冒险已下架:从限时副本(默认熔火矿脉 DAILY_FORGE_1,QA_STAGE 可改)进守卫战。用 login_b_flow 登录过的 profile(有会话直进大厅)。
结算覆盖层直接调 showEndOverlay(先暂停 sim),不提交结算。
用法:PREVIEW_PORT=7456 python guard_overlay_shot.py <输出目录> [pc|phone] [只截的名字,逗号分隔]"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
import popup_shot as ps

OUT = sys.argv[1]
ONLY = sys.argv[2] if len(sys.argv) > 2 else ''
PICK = sys.argv[3].split(',') if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
STAGE = os.environ.get('QA_STAGE', 'DAILY_FORGE_1')

ENTER = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const cc = window.__cc; let root = null;
  cc.director.getScene().walk(n => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } }); window.__root = root;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  const log = [];
  // 限时副本按星期开放:挨个试,进得去就停
  for (const code of %s) {
    try { root.openLobbyBattlePreviewPanel(code); } catch (e) { log.push(code + ' openerr ' + e.message); continue; }
    for (let k = 0; k < 8 && root.currentView !== 'battle'; k++) { await sleep(800);
      const ch = find('BattleChallengeDialogChallengeButton'); if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); continue; }
      const b = find('LobbyAdventureFormationButton'); if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); } }
    let err = '';
    for (let i = 0; i < 480; i++) { const st = root.currentLobbyBattleState(); if (st.error) { err = st.error; break; }
      const r = root.lobbyGuardBattleRenderer; if (r && r.sim && !st.assetsLoading) break; await sleep(250); }
    log.push(code + ' ' + (err || 'ok'));
    if (!err && root.lobbyGuardBattleRenderer && root.lobbyGuardBattleRenderer.sim) break;
    try { root.currentView = 'lobby'; root.renderCurrentView(); } catch (e) {}
    await sleep(1500);
  }
  const im = await (await fetch('scripting/x/import-map.json', { cache: 'no-store' })).json();
  window.__M = await System.import(Object.keys(im.imports).find(k => /GuardBattleModel\.ts$/.test(k)));
  window.__gr = root.lobbyGuardBattleRenderer;
  return log.join(' | ') + ' → view=' + root.currentView + ' sim=' + !!(window.__gr && window.__gr.sim); })()""" % json.dumps([STAGE] + [c for c in ('DAILY_FORGE_1', 'DAILY_ARCANE_1', 'DAILY_AWAKEN_1', 'DAILY_ABYSS_1') if c != STAGE])

SLEEP = "const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, s = r.sim, M = window.__M;"
# 每张截图前清场:轮盘 / 三选一 / 设置 / 退出 / 统计 / 英雄卡 / 结算全关,sim 恢复(轮盘开着会暂停 sim,三选一要 sim 跑着才会同步销毁)
CLEAN = ("try { r.closeBattleSettings(); } catch (e) {} try { r.closeExitConfirm(); } catch (e) {} "
         "['GuardWheelOverlay', 'GuardChoiceOverlay', 'GuardHeroInfoPanel', 'GuardEndOverlay'].forEach(n => { const o = r.root.getChildByName(n); if (o) o.destroy(); }); "
         "r.wheelOverlayOpen = false; r.overlayShown = false; r.choiceOverlayLevel = 0; for (let i = 0; i < 12 && s.pendingChoice; i++) M.guardSkipChoice(s); "
         "if (r.statsPanelOpen) { r.statsPanelOpen = false; r.refreshStatsPanel(true); } s.paused = false; await sleep(600); "
         "for (let i = 0; i < 12 && s.pendingChoice; i++) M.guardSkipChoice(s); { const o = r.root.getChildByName('GuardChoiceOverlay'); if (o) o.destroy(); } await sleep(300);")
STEPS = [
    # 先召满英雄,不然统计 / 英雄卡都是空的
    ('_prep', "(async () => { %s s.crystalHp = s.crystalMaxHp = 1e9; for (let i = 0; i < 16 && s.heroes.length < 4; i++) { s.gold = Math.max(s.gold, 5000); const sb = r.root.getChildByName('GuardSummonButton'); if (sb) sb.emit(cc.Node.EventType.TOUCH_END); await sleep(300); } if (s.pendingChoice) M.guardSkipChoice(s); return 'heroes=' + s.heroes.length; })()" % SLEEP),
    ('choice', "(async () => { %s %s s.gold += 3000; M.guardEnhance(s); await sleep(2200); return 'choice=' + !!s.pendingChoice; })()" % (SLEEP, CLEAN)),
    ('wheel', "(async () => { %s %s s.chests.push({ chestId: 9901, x: 5, lane: 0, droppedAtMs: s.timeMs, grade: 'normal' }); r.openChestWithWheel(9901); await sleep(900); return 'wheel=' + r.wheelOverlayOpen; })()" % (SLEEP, CLEAN)),
    ('wheel_done', "(async () => { %s await sleep(9000); return 'wheel=' + r.wheelOverlayOpen; })()" % SLEEP),
    ('wheel_deluxe', "(async () => { %s %s s.chests.push({ chestId: 9902, x: 5, lane: 0, droppedAtMs: s.timeMs, grade: 'deluxe' }); r.openChestWithWheel(9902); await sleep(9500); return 'wheel=' + r.wheelOverlayOpen; })()" % (SLEEP, CLEAN)),
    ('settings', "(async () => { %s %s r.openBattleSettings(); await sleep(1500); return 1; })()" % (SLEEP, CLEAN)),
    ('exit', "(async () => { %s %s r.openExitConfirm(); await sleep(900); return 'exit=' + r.exitConfirmOpen; })()" % (SLEEP, CLEAN)),
    ('stats', "(async () => { %s %s const codes = (s.pool || []).map(p => p.heroCode).slice(0, 6); codes.forEach((c, i) => { s.heroDamage[c] = 24000 - i * 3100; }); r.statsPanelOpen = true; r.refreshStatsPanel(true); await sleep(1800); return codes.length; })()" % (SLEEP, CLEAN)),
    ('hero_info', "(async () => { %s %s const h = s.heroes[0]; if (h) r.showHeroInfo(h); await sleep(1500); return !!h; })()" % (SLEEP, CLEAN)),
    ('victory', "(async () => { %s %s s.paused = true; r.showEndOverlay(true); await sleep(3500); return 1; })()" % (SLEEP, CLEAN)),
    ('defeat', "(async () => { %s %s s.paused = true; r.showEndOverlay(false); await sleep(3500); return 1; })()" % (SLEEP, CLEAN)),
]


async def shoot(mobile: bool, suffix: str) -> None:
    profile = base.PROFILE + '_login'
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

            async def call(m, p=None, timeout=600):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def run(expr, timeout=300):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
                if r.get('exceptionDetails'):
                    return 'EXC ' + r['exceptionDetails'].get('exception', {}).get('description', '')[:300]
                return r.get('result', {}).get('value')

            if mobile:
                await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                await call('Network.setUserAgentOverride', {'userAgent': ps.UA, 'platform': 'Android'})
            else:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': "window.__lcConsoleErrors = []; const _e = console.error.bind(console); console.error = (...a) => { try { window.__lcConsoleErrors.push(a.map(String).join(' ').slice(0, 200)); } catch (x) {} _e(...a); }; window.addEventListener('error', (ev) => window.__lcConsoleErrors.push('onerror ' + ev.message));"})
            await call('Runtime.enable')
            await call('Page.navigate', {'url': base.PAGE})
            await run(ps.JS_CC, 400)
            v = None
            for i in range(300):
                v = await run("window.__cc && window.__cc.director.getScene() ? (()=>{ " + ps.ROOT + " return root && !root.bootPreloadActive ? root.currentView : null; })() : null")
                if v in ('login', 'loginAccount', 'lobby'):
                    break
                if i % 10 == 9:
                    if not await run('window.__cc ? 1 : 0'):
                        await run(ps.JS_CC, 400)
                    elif i == 29:
                        print(suffix, await run(ps.MANUAL_SCENE, 400), flush=True)
                await asyncio.sleep(2)
            print(suffix, 'view', v, flush=True)
            if v != 'lobby':
                print('没有会话,先跑 login_b_flow.py 登录', flush=True)
                return
            await asyncio.sleep(6)
            print(suffix, 'enter', await run(ENTER, 600), flush=True)
            await asyncio.sleep(3)
            for name, js in STEPS:
                if PICK and not name.startswith('_') and name not in PICK:
                    continue
                print(suffix, name, await run(js, 120), flush=True)
                if not name.startswith('_'):
                    m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                    if 'result' in m:
                        open(os.path.join(OUT, f'{name}_{suffix}.png'), 'wb').write(base64.b64decode(m['result']['data']))
            print(suffix, 'consoleErrors', await run("JSON.stringify((window.__lcConsoleErrors || []).slice(0, 20))"), flush=True)
            # 退出战斗回大厅,别把会话留在战斗里
            await run("(async () => { const root = window.__root; try { root.currentView = 'lobby'; root.renderCurrentView(); } catch (e) {} return 1; })()")
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        subprocess.run(['powershell', '-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + os.path.basename(profile) + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], capture_output=True)


async def main() -> None:
    if ONLY != 'phone':
        await shoot(False, 'pc')
    if ONLY != 'pc':
        await shoot(True, 'phone')

if __name__ == '__main__':
    asyncio.run(main())
