# -*- coding: utf-8 -*-
"""正式包(7460)手机参数 + CPU 降速:长帧归因——渲染器全部方法 / 骨骼实例化 / 贴图上传 / 文字渲染挂计时,自动打车轮战,列出每个 >80ms 帧里谁花了时间。
用法:python longframe_probe.py <tag> [mode] [--cpu 4] [--secs 120]"""
import asyncio, base64, collections, glob, json, os, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base
TAG = sys.argv[1]
_pos = [a for a in sys.argv[2:] if not a.startswith('--') and not (sys.argv[sys.argv.index(a) - 1].startswith('--'))]
MODE = _pos[0] if _pos else 'smooth'
ARGS = sys.argv[1:]
OPT = lambda k, d: ARGS[ARGS.index(k) + 1] if k in ARGS else d
URL = 'http://localhost:7460/'
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
VER = json.load(open(glob.glob('D:/project/lootchain-cocos/build/web-mobile/src/settings.*.json')[0], encoding='utf-8'))['assets']['bundleVers']['resources']
PRE = ("try{localStorage.setItem('lootchain.graphics.mode','%s');localStorage.setItem('lootchain.graphics.fps','%s');"
       "localStorage.setItem('lootchain.bootPreload.version','%s');localStorage.setItem('lootchain.fullPack.version','%s')}catch(e){}") % (MODE, OPT('--fps', '60'), VER, VER)

ENTER = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const cc = window.__cc, root = window.__root;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  const log = [];
  for (const code of ['DAILY_DUNGEON_3', 'MAIN_2_6', 'MAIN_1_8', 'MAIN_1_1']) {
    try { root.openLobbyBattlePreviewPanel(code); } catch (e) { log.push(code + ' openerr ' + e.message); continue; }
    for (let k = 0; k < 6 && root.currentView !== 'battle'; k++) { await sleep(800);
      const ch = find('BattleChallengeDialogChallengeButton'); if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); continue; }
      const b = find('LobbyAdventureFormationButton'); if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); } }
    const gate = []; const g0 = performance.now(); let lastKey = '';
    for (let i = 0; i < 60; i++) { const st = root.currentLobbyBattleState();
      const key = (st.assetsLoading ? 'L' : '-') + st.assetsLoadedCount + '/' + st.assetsTotalCount + (st.error ? ' ERR ' + st.error : '');
      if (key !== lastKey) { gate.push([Math.round(performance.now() - g0), key]); lastKey = key; }
      if (st.error) break; const r = root.lobbyGuardBattleRenderer; if (r && r.sim && !st.assetsLoading) break; await sleep(250); }
    const st = root.currentLobbyBattleState();
    log.push(code + ' view=' + root.currentView + ' err=' + (st.error || '') + ' gateMs=' + Math.round(performance.now() - g0) + ' gate=' + JSON.stringify(gate.slice(0, 60)));
    if (root.lobbyGuardBattleRenderer && root.lobbyGuardBattleRenderer.sim) { window.__gr = root.lobbyGuardBattleRenderer; window.__gateEnd = performance.now(); break; }
    try { root.currentView = 'lobby'; root.renderCurrentView(); } catch (e) {}
    await sleep(1500);
  }
  return log.join('\n'); })()"""




DPR = float(OPT('--dpr', '2.6'))
CPU = float(OPT('--cpu', '4'))
SECS = int(OPT('--secs', '120'))

HOOK = r"""(() => { const cc = window.__cc, r = window.__gr; if (window.__lf) return 'already'; window.__lf = { frames: [], cur: {}, depth: 0, stack: [] };
  const L = window.__lf; const now = () => performance.now();
  const rec = (name, d) => { L.cur[name] = (L.cur[name] || 0) + d; };
  // 渲染器全部方法:记录最外层调用的含子时间(depth 1),以及嵌套方法的自耗时(便于看 step 里谁重)
  const proto = Object.getPrototypeOf(r); const names = Object.getOwnPropertyNames(proto).filter(n => typeof proto[n] === 'function' && n !== 'constructor');
  for (const n of names) { const orig = proto[n]; proto[n] = function () { const t0 = now(); L.depth++; const childBefore = L.childAcc || 0; L.childAcc = 0; try { return orig.apply(this, arguments); } finally { const d = now() - t0; const self = d - L.childAcc; L.depth--; L.childAcc = childBefore + d; if (L.depth === 0) { L.childAcc = 0; } rec('R.' + n + (L.depth === 0 ? '' : '~'), self); } }; }
  // 引擎:骨骼数据赋值(wasm 实例化)、贴图上传、文字渲染、节点销毁
  const wrap = (obj, key, label) => { const o = obj[key]; if (typeof o !== 'function') return 'no:' + label; obj[key] = function () { const t0 = now(); try { return o.apply(this, arguments); } finally { rec(label, now() - t0); } }; return label; };
  const out = [];
  const sd = Object.getOwnPropertyDescriptor(cc.sp.Skeleton.prototype, 'skeletonData'); if (sd && sd.set) { const set = sd.set; Object.defineProperty(cc.sp.Skeleton.prototype, 'skeletonData', { configurable: true, get: sd.get, set(v) { const t0 = now(); try { return set.call(this, v); } finally { rec('E.Skeleton.setData', now() - t0); } } }); out.push('skeletonData'); }
  { const o = cc.Texture2D.prototype.uploadData; L.uploads = {}; L.anims = {}; cc.Texture2D.prototype.uploadData = function () { const t0 = now(); try { return o.apply(this, arguments); } finally { const d = now() - t0; rec('E.Texture2D.uploadData', d); const key = (this.name || this._uuid || '?').toString().slice(0, 40) + ' ' + this.width + 'x' + this.height; const u = L.uploads[key] = L.uploads[key] || { n: 0, ms: 0, stacks: [] }; u.n++; u.ms += d; if (u.stacks.length < 2 && (u.n === 1 || u.n === 6)) { u.stacks.push(String(new Error().stack).split(String.fromCharCode(10)).slice(2, 16).map(l => l.trim().slice(3, 40)).join(' < ')); } } }; out.push('uploadData+names'); }
  { const o = cc.sp.Skeleton.prototype.setAnimation; cc.sp.Skeleton.prototype.setAnimation = function (tr, name, loop) { const t0 = now(); try { return o.apply(this, arguments); } finally { const d = now() - t0; rec('E.Skeleton.setAnimation', d); const key = (this.isAnimationCached && this.isAnimationCached() ? 'C:' : 'R:') + (this.skeletonData ? this.skeletonData.name : '?') + '/' + name; const u = L.anims[key] = L.anims[key] || { n: 0, ms: 0, max: 0 }; u.n++; u.ms += d; if (d > u.max) u.max = d; } }; out.push('setAnimation+names'); }
  out.push(wrap(cc.Label.prototype, 'updateRenderData', 'E.Label.updateRenderData'));
  out.push(wrap(cc.Node.prototype, 'destroy', 'E.Node.destroy'));
  out.push(wrap(cc.Graphics.prototype, 'fill', 'E.Graphics.fill'));
  out.push(wrap(cc.Graphics.prototype, 'stroke', 'E.Graphics.stroke'));
  if (cc.sp.SkeletonData && cc.sp.SkeletonData.prototype.getRuntimeData) out.push(wrap(cc.sp.SkeletonData.prototype, 'getRuntimeData', 'E.SkeletonData.getRuntimeData'));
  // 每帧收口:记录长帧的归因
  let last = now(); const dev = cc.director.root.device;
  const tick = () => { const n = now(); const dt = n - last; last = n; const cur = L.cur; L.cur = {};
    const s = r.sim; const mon = s ? s.monsters.filter(m => !m.dead).length : -1;
    if (dt > 80) { const items = Object.entries(cur).filter(([k, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + Math.round(v)); L.frames.push([Math.round(n), Math.round(dt), mon, dev.numTris, dev.numDrawCalls, items]); }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return 'hooked ' + names.length + ' methods; ' + out.join(','); })()"""

AUTO = r"""(() => { const cc = window.__cc, r = window.__gr; cc.game.resume();
  window.__auto = setInterval(() => { try { const s = r.sim; if (!s) return; s.crystalHp = s.crystalMaxHp; s.gold = Math.max(s.gold, 5000);
    const root = r.root; if (!root) return;
    const ov = root.getChildByName('GuardChoiceOverlay');
    if (ov) { const idx = s.pendingChoice ? Math.max(0, s.pendingChoice.findIndex(o => o.rarity === 'gold')) : 0; const c = ov.getChildByName('GuardChoiceCard_' + idx) || ov.getChildByName('GuardChoiceCard_0'); if (c) c.emit(cc.Node.EventType.TOUCH_END); return; }
    s.monsters.forEach(m => { if (!m.dead && m.kind !== 'boss' && m.maxHp < 6000) { m.maxHp = 6000; m.hp = Math.max(m.hp, 3000); } });
    const sb = root.getChildByName('GuardSummonButton'); if (sb && Math.random() < 0.6) sb.emit(cc.Node.EventType.TOUCH_END);
    const eb = root.getChildByName('GuardEnhanceButton'); if (eb && Math.random() < 0.5) eb.emit(cc.Node.EventType.TOUCH_END);
    const cb = root.getChildByName('GuardCallWaveButton'); if (cb && Math.random() < 0.3) cb.emit(cc.Node.EventType.TOUCH_END);
    if (Math.random() < 0.25) { const alive = s.monsters.filter(m => !m.dead); if (alive.length) s.markedMonsterId = alive[Math.floor(Math.random() * alive.length)].monsterId; }
  } catch (e) { window.__autoErr = String(e && e.stack || e).slice(0, 300); } }, 600);
  return 'auto on mode=' + (r.sim && r.sim.mode); })()"""

DUMP = r"""(() => { const L = window.__lf; const fr = L.frames; const agg = {};
  for (const f of fr) for (const it of f[5]) { const [k, v] = it.split(':'); agg[k] = (agg[k] || 0) + Number(v); }
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 25);
  const ups = Object.entries(L.uploads || {}).map(([k, v]) => [k, v.n, Math.round(v.ms), v.stacks]).sort((a, b) => b[2] - a[2]).slice(0, 12);
  const an = Object.entries(L.anims || {}).map(([k, v]) => [k, v.n, Math.round(v.ms), Math.round(v.max)]).sort((a, b) => b[2] - a[2]).slice(0, 20);
  return JSON.stringify({ longFrames: fr.length, sumMs: fr.reduce((a, f) => a + f[1], 0), agg: top.slice(0, 14), uploads: ups, anims: an, autoErr: window.__autoErr || '' }); })()"""


async def main():
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}', '--no-first-run',
                             '--window-size=1000,500', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    exc = []
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1); break
            except Exception:
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(method, params=None, timeout=900):
                nonlocal seq
                seq += 1; my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if m.get('method') == 'Runtime.exceptionThrown':
                        d = m['params']['exceptionDetails']; s = (d.get('exception', {}).get('description') or d.get('text', ''))[:500]
                        if s not in exc and len(exc) < 8:
                            exc.append(s)
                    if m.get('id') == my:
                        return m

            async def ev(expr):
                r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
                return 'EXC ' + str(r['exceptionDetails'])[:500] if 'exceptionDetails' in r else r.get('result', {}).get('value')

            await call('Runtime.enable'); await call('Page.enable')
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Emulation.setDeviceMetricsOverride', {'width': 915, 'height': 412, 'deviceScaleFactor': DPR, 'mobile': True,
                                                              'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            await call('Page.addScriptToEvaluateOnNewDocument', {'source': PRE})
            await call('Page.navigate', {'url': URL})
            await asyncio.sleep(6)
            for _ in range(5):
                print(await ev(base.JS_BOOT), flush=True)
                if (await ev("!!(window.__root && window.__cc)")) is True:
                    break
                await asyncio.sleep(3)
            print(await ev(base.JS_LOGIN), flush=True)
            for _ in range(30):
                if (await ev("!!(window.__root && window.__root.currentView === 'lobby')")) is True:
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(4)
            print('ENTER', (await ev(ENTER) or '')[:100], flush=True)
            await asyncio.sleep(2)
            print('HOOK', await ev(HOOK), flush=True)
            if CPU > 1:
                await call('Emulation.setCPUThrottlingRate', {'rate': CPU})
            print('AUTO', await ev(AUTO), flush=True)
            await asyncio.sleep(SECS)
            out = await ev(DUMP)
            print('DUMP', out, flush=True)
            json.dump(json.loads(out) if out and out.startswith('{') else {'raw': out}, open(os.path.join(base.SCRATCH, f'{TAG}_longframes.json'), 'w'), ensure_ascii=False, indent=1)
            print('page exceptions:', exc)
    finally:
        proc.terminate()


asyncio.run(main())
