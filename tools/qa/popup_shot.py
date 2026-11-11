# -*- coding: utf-8 -*-
"""通用小窗截图(11-11 二次确认 / 获取途径 B 风格改版留底 / 自验)。
用 login_b_flow 登录过的 profile(有会话直进大厅),在大厅直接调起两个小窗截图。
用法:PREVIEW_PORT=7456 python popup_shot.py <输出目录> [pc|phone]
  → <目录>/confirm_<视口>.png、source_<视口>.png、source_note_<视口>.png"""
import asyncio, base64, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

OUT = sys.argv[1]
ONLY = sys.argv[2] if len(sys.argv) > 2 else ''
PICK = sys.argv[3].split(',') if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 30 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } window.__cc = cc; return cc ? 'ok' : 'fail'; })()"""
# 编辑器当前场景不是 main 时(手机视口那轮常见)手动装 main 场景,同 login_b_flow
MANUAL_SCENE = r"""(async () => { const cc = window.__cc; try {
  await new Promise((res, rej) => cc.assetManager.loadBundle('resources', (e, b) => e ? rej(e) : res(b)));
  const uuid = '623f777a-eb33-4d74-ae88-eb79e749fcfe';
  const json = await (await fetch(`scene/${uuid}.json`, { cache: 'no-store' })).json();
  const asset = await new Promise((res, rej) => cc.assetManager.loadWithJson(json, { assetId: uuid }, (e, a) => e ? rej(e) : res(a)));
  cc.director._persistRootNodes = {}; cc.director.runSceneImmediate(asset); cc.game.resume(); return 'manual ok ' + cc.director.getScene().name; } catch (e) { return 'manual err ' + e.message; } })()"""
ROOT = "let root=null; window.__cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"
CLEAR = "clearInterval(window.__lcConfirmTimer); root.confirmPopupState = null; root.itemSourcePopupState = null; const cr=root.ensureContentRoot(); ['ConfirmPopup','ItemSourcePopup'].forEach(n=>cr.getChildByName(n)?.destroy());"
CONFIRM_JS = CLEAR + r"""
const mod = window.__lcPopupMods;
// 野外 HUD 周期性整页重建会清掉二次确认(它没有重建后恢复机制),截图期间缺了就补挂
const openIt = () => { const r2 = root; const cr = r2.ensureContentRoot(); if (!cr.getChildByName('ConfirmPopup')) mod.confirm(r2, cr, { title: '转移装备', message: '「烈焰之刃」正穿在 赤焰骑士 身上,\n转移后对方该部位会空出。\n确定转移给 夜帝?', confirmText: '转移', onConfirm: () => {} }); };
clearInterval(window.__lcConfirmTimer);
// 11-11 起宿主有 openConfirm(记状态 + 重建后补挂),直接走它顺带验证补挂;旧版本没有就定时补挂
if (typeof root.openConfirm === 'function') root.openConfirm({ title: '转移装备', message: '「烈焰之刃」正穿在 赤焰骑士 身上,\n转移后对方该部位会空出。\n确定转移给 夜帝?', confirmText: '转移', onConfirm: () => {} });
else { openIt(); window.__lcConfirmTimer = setInterval(openIt, 50); }
if (window.__lcProbe) { const cr2 = root.ensureContentRoot(); const pop = cr2.getChildByName('ConfirmPopup'); window.__lcKill = [];
  const wrap = (obj, fn, tag) => { const o = obj[fn].bind(obj); obj[fn] = (...a) => { window.__lcKill.push(tag + ' ' + (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 9).join(' | ')); return o(...a); }; };
  if (pop) { wrap(pop, 'destroy', 'pop.destroy'); wrap(pop, 'removeFromParent', 'pop.removeFromParent'); }
  wrap(cr2, 'destroyAllChildren', 'cr.destroyAllChildren'); wrap(cr2, 'removeAllChildren', 'cr.removeAllChildren'); wrap(cr2, 'removeChild', 'cr.removeChild'); }"""
SOURCE_JS = CLEAR + r"""root.openItemSourcePopup({ key: 'ENHANCE_STONE_HIGH', name: '高级强化石', owned: 3, need: 10 });"""
NOTE_JS = CLEAR + r"""root.openItemSourcePopup({ key: 'GOLD', name: '金币', owned: 12800, need: 50000 });"""
CAP_JS = CLEAR + r"""root.openItemSourcePopup({ key: 'LEVEL_CAP', name: '英雄等级上限', note: '英雄等级上限 = 玩家等级(当前 Lv.12)' });"""
RUNE_JS = CLEAR + r"""root.openItemSourcePopup({ key: 'ENHANCE_GUARD_RUNE', name: '强化护符', owned: 20, need: 5 });"""
MODS_JS = r"""(async () => { const im = await (await fetch('scripting/x/import-map.json', { cache: 'no-store' })).json();
 const key = Object.keys(im.imports).find(k => /lobby\/ConfirmPopup\.ts$/.test(k)); const ns = key ? await System.import(key) : null;
 window.__lcPopupMods = { confirm: ns && ns.openConfirmPopup }; return key + ' ' + !!(ns && ns.openConfirmPopup); })()"""

LOGIC_JS = r"""(async () => { const cc = window.__cc; let root = null; cc.director.getScene().walk(n => { if (!root) { const c = n.getComponent('LootChainGameRoot'); if (c) root = c; } });
 const sleep = ms => new Promise(r => setTimeout(r, ms)); const cr = () => root.ensureContentRoot(); const out = {};
 const find = (pop, path) => { let n = cr().getChildByName(pop); for (const p of path) n = n && n.getChildByName(p); return n; };
 const click = (n) => n.emit(cc.Button.EventType.CLICK, n.getComponent(cc.Button));
 const msg = { title: '转移装备', message: 'x', confirmText: '转移' };
 for (const [tag, path] of [['cancel', ['Panel', 'Cancel']], ['close', ['Panel', 'Close']], ['mask', []]]) {
   root.openConfirm({ ...msg, onConfirm: () => { out[tag + '_wrongConfirm'] = 1; } }); await sleep(300);
   click(find('ConfirmPopup', path)); await sleep(300);
   out[tag] = !cr().getChildByName('ConfirmPopup') && root.confirmPopupState === null; }
 let confirmed = 0; root.openConfirm({ ...msg, onConfirm: () => { confirmed++; } }); await sleep(300);
 click(find('ConfirmPopup', ['Panel', 'Confirm'])); await sleep(300);
 out.confirm = confirmed === 1 && !cr().getChildByName('ConfirmPopup') && root.confirmPopupState === null;
 // 重建后补挂:开着时整页重绘,应该还在
 root.openConfirm({ ...msg, onConfirm: () => {} }); await sleep(300); root.renderCurrentView(); await sleep(800);
 out.confirmRestore = !!cr().getChildByName('ConfirmPopup'); click(find('ConfirmPopup', ['Panel', 'Cancel'])); await sleep(300);
 root.openItemSourcePopup({ key: 'ENHANCE_STONE_HIGH', name: '高级强化石', owned: 3, need: 10 }); await sleep(300);
 click(find('ItemSourcePopup', ['Panel', 'Close'])); await sleep(300);
 out.sourceClose = !cr().getChildByName('ItemSourcePopup') && root.itemSourcePopupState === null;
 root.openItemSourcePopup({ key: 'ENHANCE_STONE_HIGH', name: '高级强化石', owned: 3, need: 10 }); await sleep(300);
 const go = find('ItemSourcePopup', ['Panel', 'Row_1', 'Go']); out.goIsButton = !!(go && go.getComponent(cc.Button));
 const off = find('ItemSourcePopup', ['Panel', 'Row_0', 'Go']); out.closedNoButton = !!off && !off.getComponent(cc.Button);
 click(go); await sleep(1500);
 out.sourceGo = !cr().getChildByName('ItemSourcePopup') && root.itemSourcePopupState === null; out.viewAfterGo = root.currentView;
 return JSON.stringify(out); })()"""


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

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(body):
                r = await call('Runtime.evaluate', {'expression': '(()=>{ ' + ROOT + ' ' + body + ' })()', 'returnByValue': True}, 120)
                res = r.get('result', {})
                if res.get('exceptionDetails'):
                    print('JS error', res['exceptionDetails'].get('exception', {}).get('description', '')[:500], flush=True)
                return res.get('result', {}).get('value')

            if mobile:
                await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            else:
                await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': "window.__lcConsoleErrors = []; const _e = console.error.bind(console); console.error = (...a) => { try { window.__lcConsoleErrors.push(a.map(String).join(' ').slice(0, 200)); } catch (x) {} _e(...a); }; window.addEventListener('error', (ev) => window.__lcConsoleErrors.push('onerror ' + ev.message));"})
            await call('Runtime.enable')
            if os.environ.get('POPUP_PROBE'):
                await call('Page.addScriptToEvaluateOnNewDocument', {'source': 'window.__lcProbe = 1;'})
            await call('Page.navigate', {'url': base.PAGE})
            await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            v = None
            for i in range(300):
                v = await ev("return window.__cc && window.__cc.director.getScene() ? (()=>{ " + ROOT + " return root && !root.bootPreloadActive ? root.currentView : null; })() : null;")
                if v in ('login', 'loginAccount', 'lobby'):
                    break
                if i % 10 == 9:
                    has_cc = (await call('Runtime.evaluate', {'expression': 'window.__cc ? 1 : 0', 'returnByValue': True})).get('result', {}).get('result', {}).get('value')
                    if not has_cc:
                        await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
                    elif i == 29:
                        r = await call('Runtime.evaluate', {'expression': MANUAL_SCENE, 'awaitPromise': True, 'returnByValue': True}, 400)
                        print(suffix, r.get('result', {}).get('result', {}).get('value'), flush=True)
                await asyncio.sleep(2)
            print(suffix, 'view', v, flush=True)
            if v != 'lobby':
                print('没有会话,先跑 login_b_flow.py 登录', flush=True)
                return
            await asyncio.sleep(10)
            r = await call('Runtime.evaluate', {'expression': MODS_JS, 'awaitPromise': True, 'returnByValue': True}, 60)
            print('confirm module', r.get('result', {}).get('result', {}).get('value'), flush=True)
            for name, js in (('confirm', CONFIRM_JS), ('source', SOURCE_JS), ('source_note', NOTE_JS), ('source_cap', CAP_JS), ('source_rune', RUNE_JS)):
                if PICK and name not in PICK:
                    continue
                await ev(js + ' return 1;')
                # 二次确认没有重建后恢复机制,野外 HUD 整页重建会清掉它:弹出后尽快截
                await asyncio.sleep(4)
                m = await call('Page.captureScreenshot', {'format': 'png'}, 120)
                if 'result' in m:
                    open(os.path.join(OUT, f'{name}_{suffix}.png'), 'wb').write(base64.b64decode(m['result']['data']))
                    print('shot', name, suffix, flush=True)
                if os.environ.get('POPUP_PROBE'):
                    print(name, 'kill', await ev("return JSON.stringify(window.__lcKill || []).slice(0, 3000);"), flush=True)
                print(name, 'mounted', await ev("const cr=root.ensureContentRoot(); const p=cr.getChildByName('ConfirmPopup')||cr.getChildByName('ItemSourcePopup'); return p ? (p.activeInHierarchy + ' idx ' + p.getSiblingIndex() + '/' + cr.children.length + ' kids ' + p.children.length + ' layer ' + p.layer + '/' + cr.layer) : 'none';"), flush=True)
            await ev('clearInterval(window.__lcConfirmTimer); ' + CLEAR + ' return 1;')
            if os.environ.get('POPUP_LOGIC'):
                r = await call('Runtime.evaluate', {'expression': LOGIC_JS, 'awaitPromise': True, 'returnByValue': True}, 120)
                print(suffix, 'logic', r.get('result', {}).get('result', {}).get('value') or json.dumps(r)[:600], flush=True)
            errs = await ev("return JSON.stringify((window.__lcConsoleErrors || []).slice(0, 20));")
            print(suffix, 'consoleErrors', errs, flush=True)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        # 按 profile 查残留(子进程偶尔甩出父进程树)
        subprocess.run(['powershell', '-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + os.path.basename(profile) + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], capture_output=True)


async def main() -> None:
    if ONLY != 'phone':
        await shoot(False, 'pc')
    if ONLY != 'pc':
        await shoot(True, 'phone')

if __name__ == '__main__':
    asyncio.run(main())
