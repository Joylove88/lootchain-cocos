# -*- coding: utf-8 -*-
"""正式包发版前冒烟(2026-11-12):无头 Edge 打开本地正式包 7460(tools/local-serve/serve_release.py,等同首次访问的全新配置目录),
一次会话走完 启动 → 登录 → 大厅 → 主城(高清 / 标准素材探针 + 着色器 + 可达性 + 巡检截图)→ 守卫战打到结算并返回 → 野外清一群怪,
全程收集页面异常 / console.error / 失败请求,最后按 asset-manifest.json 统计下载了哪一套主城图。
正式包里拿不到预览的 import-map,所以战斗全走真实点击路径(招募 / 战术 / 三选一 / 轮盘 / 结算按钮),不直接调模型函数。

用法:PYTHONIOENCODING=utf-8 python tools/qa/release_smoke_web.py [输出目录] [--only=city,guard,field]
环境变量:PREVIEW_PORT(缺省 7460)、PAGE_QS(如 ?cityHd=0)、QA_ACCOUNT、QA_GPU=0 退回软件渲染、QA_STAGE 守卫战关卡码、QA_FIELD 野外地图码
独立调试端口 9361 + 配置目录 release_smoke_profile(不以 edge_ 开头,别的会话收尾清残留时不会连带关掉);跑完自己删。
退出码:0 = 没有页面异常且各段都走通;1 = 有问题(看末尾 SUMMARY)。
"""
import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

os.environ.setdefault('EDGE_PORT', '9361')
os.environ.setdefault('PREVIEW_PORT', '7460')

import boss_bar_cdp as base  # noqa: E402
import city_moon_web as cm  # noqa: E402  只借它的可达性 / 巡检点 / 瞬移片段,不跑它的 main

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'release_smoke')
ONLY = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), ['city', 'guard', 'field'])
ACCOUNT = os.environ.get('QA_ACCOUNT', 'selfchk1108')
# 测试号口令不在这里再写一份:沿用主城自验脚本登录那一行里的
PASSWORD = os.environ.get('QA_PASSWORD') or re.search(r"\{\{string:'\{ACCOUNT\}'\}\}, \{\{string:'([^']+)'\}\}",
                                                      open(os.path.join(base.HERE, 'city_moon_web.py'), encoding='utf-8').read()).group(1)
STAGES = list(dict.fromkeys([os.environ.get('QA_STAGE', 'DAILY_FORGE_1'), 'DAILY_FORGE_1', 'DAILY_ARCANE_1', 'DAILY_AWAKEN_1', 'DAILY_ABYSS_1', 'RAID_1']))
FIELD_MAP = os.environ.get('QA_FIELD', 'WOODS')
ORIGIN = 'http://localhost:' + os.environ['PREVIEW_PORT']
VIEW_W, VIEW_H = 1600, 900
os.makedirs(OUT, exist_ok=True)

JS_CC = cm.JS_CC
ROOT_JS = ("let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); window.__root = root;"
           " const t = root && root.lobbyTownRenderer; const r = root && root.lobbyGuardBattleRenderer; const sleep = ms => new Promise(z => setTimeout(z, ms));"
           " const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name && n.activeInHierarchy) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };"
           " const tap = n => { if (!n) return false; n.emit(cc.Node.EventType.TOUCH_END); const b = n.getComponent(cc.Button); if (b) n.emit(cc.Button.EventType.CLICK, b); return true; };")
BUSY = cm.BUSY
CLEAR = cm.CLEAR
TP = cm.TP

CITY_PROBE = r"""
  const props = t.def.props || [];
  const tiles = (t.def.scene && t.def.scene.tiles) || {};
  const fx = {}; let sprites = 0;
  t.world.walk(n => { const s = n.getComponent(cc.Sprite); if (!s || !n.activeInHierarchy) return; sprites++;
    const m = s.customMaterial || s.getSharedMaterial(0); const name = (m && (m.effectName || (m.effectAsset && m.effectAsset.name))) || 'none'; fx[name] = (fx[name] || 0) + 1; });
  const tex = []; t.groundRoot.children.slice(0, 40).forEach(n => { const s = n.getComponent(cc.Sprite); if (s && s.spriteFrame && s.spriteFrame.texture && tex.length < 3) tex.push([s.spriteFrame.texture.width, s.spriteFrame.texture.height]); });
  return JSON.stringify({ map: t.def.code, hdAssets: props.filter(p => /citymoon_hd\//.test(p.asset || '')).length, stdAssets: props.filter(p => /citymoon\//.test(p.asset || '')).length,
    tileScale: tiles.scale, tileBase0: (tiles.base || [])[0], baseTex: tex, sprites, effects: fx, strips: t.entityRoot.children.filter(n => n.name.startsWith('SceneStrip_')).length,
    npcs: t.npcNodes.length, glows: t.scene.glows.length, walkers: t.scene.walkers.map(w => !!w.skeleton), drawCalls: cc.director.root.device.numDrawCalls,
    mem: navigator.deviceMemory, ua: navigator.userAgent.slice(0, 60) });
"""

GUARD_ENTER = r"""
  const log = [];
  for (const code of %s) {
    try { root.openLobbyBattlePreviewPanel(code); } catch (e) { log.push(code + ' openerr ' + e.message); continue; }
    for (let k = 0; k < 8 && root.currentView !== 'battle'; k++) { await sleep(800);
      const ch = find('BattleChallengeDialogChallengeButton'); if (ch) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); continue; }
      const b = find('LobbyAdventureFormationButton'); if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); } }
    let err = '';
    for (let i = 0; i < 480; i++) { const st = root.currentLobbyBattleState(); if (st.error) { err = st.error; break; }
      const g = root.lobbyGuardBattleRenderer; if (root.currentView === 'battle' && g && g.sim && !st.assetsLoading) break; await sleep(250); }
    log.push(code + ' ' + (err || 'ok'));
    const g = root.lobbyGuardBattleRenderer;
    if (!err && root.currentView === 'battle' && g && g.sim) { window.__stage = code; break; }
    try { root.currentView = 'lobby'; root.renderCurrentView(); } catch (e) {}
    await sleep(1500);
  }
  const g = root.lobbyGuardBattleRenderer;
  // 正式包里项目脚本注册成 chunks:///_virtual/<文件名>:合成 / 法术走模型里带操作记录的那层(结算时服务端照记录复演)
  try { window.__M = await System.import('chunks:///_virtual/GuardBattleModel.ts'); } catch (e) { window.__M = null; log.push('model import ' + e.message); }
  // 3D 实验包过一层的那几个方法各被调了多少次(实例上再包一层计数,不动原型)
  window.__cnt = {};
  // 先记下原型上那一层是不是 3D 实验包过的(实例上再包计数之后就看不出来了)
  const proto = g ? Object.getPrototypeOf(g) : {};
  const hooks = ['mountBackground', 'spawnImpactFlash', 'spawnCellBurst', 'spawnGuardSkillFx', 'playSpellFx'].map(n => n + ':' + (typeof proto[n]) + ':' + !!(proto[n] && proto[n].__g3d));
  if (g && g.sim) { for (const n of ['mountBackground', 'spawnImpactFlash', 'spawnCellBurst', 'spawnGuardSkillFx', 'playSpellFx']) { const o = g[n];
    if (typeof o === 'function') g[n] = function () { window.__cnt[n] = (window.__cnt[n] || 0) + 1; return o.apply(this, arguments); }; } }
  return JSON.stringify({ log, view: root.currentView, sim: !!(g && g.sim), stage: window.__stage || '', model: !!window.__M,
    hooks,
    g3d: typeof window.__g3d, g3dInfo: (() => { try { return window.__g3d ? window.__g3d.info() : null; } catch (e) { return 'err ' + e.message; } })() });
""" % json.dumps(STAGES)

# 一拍:该点的弹层点掉,有钱就招募,阵地满了点战术;返回当前战况
GUARD_TICK = r"""
  const sim = r && r.sim; if (!sim) return JSON.stringify({ gone: true, view: root.currentView });
  const acts = [];
  if (sim.phase !== 'victory' && sim.phase !== 'defeat') {
    if (sim.pendingChoice) { const cards = sim.pendingChoice.map((o, i) => o.locked ? -1 : i).filter(i => i >= 0); const i = cards.length ? cards[0] : 0;
      if (tap(find('GuardChoiceCard_' + i))) acts.push('choice' + i); }
    else if (r.wheelOverlayOpen) { if (tap(find('GuardWheelClose'))) acts.push('wheelClose'); }
    else {
      const M = window.__M; const before = sim.heroes.length;
      // 同名同星的两个英雄合成(真实操作是拖到一起)
      if (M) { const seen = new Map(); for (const h of sim.heroes) { const key = h.heroCode + ':' + h.star; const other = seen.get(key);
        if (other) { const res = M.guardDragTo(sim, h.cell, other.cell); if (res === 'merge' || res === 'superMerge') { acts.push(res); break; } } else seen.set(key, h); } }
      if (!acts.length && sim.gold >= sim.summonCost) { tap(find('GuardSummonButton')); acts.push(sim.heroes.length > before ? 'summon' : 'summonFull'); }
      if (!acts.includes('summon') && sim.gold >= (sim.enhanceCost || 1e9) && (window.__enhAt || 0) + 4000 < Date.now()) { window.__enhAt = Date.now(); tap(find('GuardEnhanceButton')); acts.push('enhance'); }
      // 水晶法术:有怪就往第一只怪身上放
      const target = sim.monsters.find(m => !m.dead && m.x < 9);
      if (M && target && (window.__spellAt || 0) + 5000 < Date.now()) { for (const id of sim.spellLoadout || []) {
        if (M.guardSpellCastable(sim, id) && M.guardCastSpell(sim, id, { lane: target.lane, x: target.x })) { window.__spellAt = Date.now(); acts.push('spell:' + id); break; } } }
    }
  }
  const overlays = r.root ? r.root.children.filter(n => /Overlay$/.test(n.name) && n.active).map(n => n.name) : [];
  return JSON.stringify({ phase: sim.phase, wave: sim.wave, lv: sim.level, gold: Math.round(sim.gold), heroes: sim.heroes.length, stars: sim.heroes.map(h => h.star).join(''),
    alive: sim.monsters.filter(m => !m.dead).length, hp: Math.round(sim.crystalHp), maxHp: Math.round(sim.crystalMaxHp || 0), t: Math.round(sim.timeMs / 1000), acts, overlays, cnt: window.__cnt });
"""

GUARD_END = r"""
  const text = name => { const n = find(name); const l = n && n.getComponent(cc.Label); return l ? l.string : null; };
  let back = null;
  for (let i = 0; i < 120 && !back; i++) { back = find('GuardEndBack') || find('GuardRaidBack'); if (!back) await sleep(500); }
  return JSON.stringify({ phase: r && r.sim ? r.sim.phase : '', title: text('GuardEndTitle'), detail: text('GuardEndDetail'), settle: text('GuardEndSettle'), backButton: !!back,
    battleState: (() => { try { const st = root.currentLobbyBattleState(); return { error: st.error || '', settled: !!st.settlement, result: st.settlement && (st.settlement.result || st.settlement.battleResult || '') }; } catch (e) { return 'err ' + e.message; } })() });
"""

GUARD_BACK = r"""
  const back = find('GuardEndBack') || find('GuardRaidBack'); let how = 'none';
  if (back) { tap(back); how = 'tap'; }
  for (let i = 0; i < 20 && root.currentView === 'battle'; i++) await sleep(500);
  if (root.currentView === 'battle') { root.returnToLobbyFromBattlePreview(); how += '+direct'; for (let i = 0; i < 20 && root.currentView === 'battle'; i++) await sleep(500); }
  return JSON.stringify({ how, view: root.currentView });
"""

FIELD_T = ("const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); });"
           " t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };")
FIELD_PREP = FIELD_T + r"""
  clearInterval(window.__lcKeepAlive);
  window.__lcKeepAlive = setInterval(() => { try { const tt = window.__root.lobbyTownRenderer; tt.leaderHp = tt.leaderMaxHp || 99999; tt.followers.forEach(a => { a.hp = a.maxHp || 99999; a.down = false; }); } catch (e) {} }, 80);
  const api = root.api.world;
  if (!api.__wrapped) { const k = api.fieldKill.bind(api); api.fieldKill = async (id, n) => { const res = await k(id, n);
    (window.__kills = window.__kills || []).push({ id, n, rewards: (res.rewards || []).map(x => x.resourceName + x.amount).join(','), capped: res.capped }); return res; }; api.__wrapped = true; }
  const c = t.def.camps.find(x => !x.elite && !x.dummy) || t.def.camps[0]; window.__camp = c.stageCode; tp(c.x - 300, c.y);
  return JSON.stringify({ map: t.def.code, camp: c.stageCode, camps: t.def.camps.length, party: [t.leader, ...t.followers].map(a => a.hero.heroCode),
    alive: t.monsters.filter(m => m.camp.stageCode === c.stageCode && !m.dead).length });
"""
FIELD_FIGHT = FIELD_T + r"""
  const mine = () => t.monsters.filter(m => m.camp.stageCode === window.__camp && !m.dead);
  const start = mine().length; let n = 0;
  for (let i = 0; i < 400 && mine().length > 0; i++) {
    const m = mine()[0]; const node = m.node || (m.view && m.view.node); const mx = m.x !== undefined ? m.x : node.position.x, my = m.y !== undefined ? m.y : node.position.y;
    if (Math.hypot(t.leader.x - mx, t.leader.y - my) > 260) tp(mx - 110, my);
    t.skillReadyAt = [0, 0, 0]; t.actionUntil = 0;
    if (i % 5 === 4) t.leaderSkill(n++ % 3); else t.leaderAttack();
    await sleep(220);
  }
  return JSON.stringify({ start, left: mine().length });
"""


def js(body):
    return "(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message + ' @ ' + String(e.stack).split('\\n').slice(1, 3).join(' | '); } })()"


async def main():
    profile = os.path.join(base.SCRATCH, 'release_smoke_profile')
    shutil.rmtree(profile, ignore_errors=True)
    gpu = os.environ.get('QA_GPU', '1') != '0'
    flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] if gpu else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update',
                             f'--window-size={VIEW_W},{VIEW_H}', '--autoplay-policy=no-user-gesture-required'] + flags + ['about:blank'])
    issues = {'exceptions': [], 'errors': [], 'warnings': [], 'http': [], 'failed': []}
    urls, requested = {}, set()
    notes, bad = [], []
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            pending, seq = {}, 0

            def on_event(x):
                m, p = x.get('method'), x.get('params') or {}
                if m == 'Runtime.exceptionThrown':
                    d = p.get('exceptionDetails') or {}
                    issues['exceptions'].append(((d.get('exception') or {}).get('description') or d.get('text') or '')[:500] + ' @' + str(d.get('url', ''))[-60:])
                elif m == 'Runtime.consoleAPICalled':
                    kind = p.get('type')
                    if kind in ('error', 'assert', 'warning'):
                        text = ' '.join(str(a.get('value', a.get('description', ''))) for a in (p.get('args') or []))[:400]
                        issues['errors' if kind != 'warning' else 'warnings'].append(text)
                elif m == 'Log.entryAdded':
                    e = p.get('entry') or {}
                    if e.get('level') == 'error':
                        issues['errors'].append('[log] ' + str(e.get('text', ''))[:300] + ' ' + str(e.get('url', ''))[-80:])
                elif m == 'Network.requestWillBeSent':
                    u = (p.get('request') or {}).get('url', '')
                    urls[p.get('requestId')] = u
                    if u.startswith(ORIGIN):
                        requested.add(u[len(ORIGIN):].split('?')[0])
                elif m == 'Network.responseReceived':
                    resp = p.get('response') or {}
                    if resp.get('status', 0) >= 400:
                        issues['http'].append(f"{resp.get('status')} {resp.get('url', '')[-120:]}")
                elif m == 'Network.loadingFailed':
                    if not p.get('canceled'):
                        issues['failed'].append(f"{p.get('errorText')} {urls.get(p.get('requestId'), '')[-120:]}")

            async def reader():
                try:
                    async for raw in ws:
                        x = json.loads(raw)
                        fut = pending.pop(x.get('id'), None) if 'id' in x else None
                        if fut is not None and not fut.done():
                            fut.set_result(x)
                        elif 'method' in x:
                            on_event(x)
                except Exception as e:  # 连接断了:让所有等待中的调用立即失败
                    for fut in pending.values():
                        if not fut.done():
                            fut.set_exception(e)

            pump = asyncio.create_task(reader())

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                fut = asyncio.get_event_loop().create_future()
                pending[seq] = fut
                await ws.send(json.dumps({'id': seq, 'method': m, 'params': p or {}}))
                return await asyncio.wait_for(fut, timeout)

            async def ev(body, timeout=180):
                x = await call('Runtime.evaluate', {'expression': js(body), 'awaitPromise': True, 'returnByValue': True}, timeout)
                res = x.get('result', {}).get('result', {})
                return res.get('value') if 'value' in res else json.dumps(x.get('result', {}))[:300]

            async def shot(name):
                m = await call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 85}, 120)
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

            async def wait_map(code, tries=200):
                for _ in range(tries):
                    if await ev(f"return (root.currentView === 'lobby' && t && t.def && t.def.code === '{code}' && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                        return True
                    await asyncio.sleep(2)
                return False

            def stage(name, ok, info=''):
                notes.append(f"{'OK  ' if ok else 'FAIL'} {name} {info}")
                if not ok:
                    bad.append(name)
                print(notes[-1], flush=True)

            for dom in ('Runtime', 'Log', 'Network', 'Page'):
                await call(dom + '.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': VIEW_W, 'height': VIEW_H, 'deviceScaleFactor': 1, 'mobile': False})

            # ── 启动 → 登录 → 大厅 ──
            t0 = time.time()
            await call('Page.navigate', {'url': base.PAGE})
            x = await call('Runtime.evaluate', {'expression': JS_CC, 'awaitPromise': True, 'returnByValue': True}, 400)
            print('cc', x.get('result', {}).get('result', {}).get('value'), flush=True)
            view, seen = '', []
            for _ in range(300):
                view = await ev("return root ? root.currentView : 'noroot';")
                if not seen or seen[-1] != view:
                    seen.append(view)
                if view in ('login', 'lobby', 'loginAccount'):
                    break
                await asyncio.sleep(1)
            print('boot', seen, 'in', round(time.time() - t0, 1), 's', await ev(
                "return JSON.stringify({ build: window.__lootchainBuild, api: (() => { try { return root.api.baseUrl || root.api.http.baseUrl || ''; } catch (e) { return ''; } })() });"), flush=True)
            await asyncio.sleep(3)
            await shot('01_first_view')
            stage('boot', view in ('login', 'lobby', 'loginAccount'), f'views={seen}')
            # 首次访问先下开局包(下载页盖在登录页上面):等它下完再截一张登录页
            t_pack = time.time()
            for _ in range(300):
                if await ev("return root.bootPreloadActive === false ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    break
                await asyncio.sleep(1)
            print('core pack gate', round(time.time() - t_pack, 1), 's', flush=True)
            await asyncio.sleep(1.5)
            await shot('01b_login_page')
            if view != 'lobby':
                await ev(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'{PASSWORD}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
            t1 = time.time()
            ok = False
            for _ in range(450):
                if await ev("return (root.currentView === 'lobby' && t && t.isMounted()) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    ok = True
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
            first_map = await ev("return t && t.def ? t.def.code : '';")
            stage('login→lobby', ok, f'{round(time.time() - t1, 1)}s map={first_map} view={await ev("return root.currentView;")}')
            await shot('02_lobby')
            if not ok:
                return

            # ── 主城 ──
            if 'city' in ONLY:
                await ev("if (t.def.code !== 'CITY') setTimeout(() => root.travelWorldMap('CITY', null), 50); return 1;")
                in_city = await wait_map('CITY')
                await settle(400)
                await asyncio.sleep(5)
                probe = await ev(CITY_PROBE)
                print('city probe', probe, flush=True)
                reach = await ev(cm.REACH, 600)
                print('city reach', reach, flush=True)
                try:
                    pr, rc = json.loads(probe), json.loads(reach)
                    want_hd = 'cityHd=0' not in base.PAGE
                    art_ok = (pr['hdAssets'] > 0) == want_hd
                    stage('city', in_city and art_ok and not rc['unreachable'] and not rc['blocked'],
                          f"hd={pr['hdAssets']} std={pr['stdAssets']} tex={pr['baseTex']} reach={rc['total'] - len(rc['unreachable'])}/{rc['total']} blocked={rc['blocked']} effects={pr['effects']}")
                except Exception as e:
                    stage('city', False, f'probe parse {e}')
                await shot('10_city_arrive')
                points = json.loads(await ev(cm.POINTS))
                for name, px, py in [p for p in points if p[0] in ('tour_11_c', 'tour_01_n', 'tour_12_e', 'tour_21_s', 'tour_10_w', 'npc_vendor', 'exit_south', 'exit_east') or p[0].startswith('exit_')]:
                    await ev(TP.replace('{x}', str(px)).replace('{y}', str(py)))
                    await asyncio.sleep(2.5)
                    print(name, (px, py), 'drawCalls', await ev("return cc.director.root.device.numDrawCalls;"), flush=True)
                    await shot('11_' + name)

            # ── 守卫战:打到结算再返回 ──
            if 'guard' in ONLY:
                entered = await ev(GUARD_ENTER, 400)
                print('guard enter', entered, flush=True)
                try:
                    in_battle = json.loads(entered).get('sim')
                except Exception:
                    in_battle = False
                if not in_battle:
                    stage('guard', False, 'could not enter ' + str(entered)[:300])
                else:
                    await asyncio.sleep(3)
                    await shot('20_guard_start')
                    last_print, phase, shots, st = 0, '', 0, {}
                    t2 = time.time()
                    while time.time() - t2 < 900:
                        raw = await ev(GUARD_TICK)
                        try:
                            st = json.loads(raw)
                        except Exception:
                            print('guard tick', raw, flush=True)
                            break
                        phase = st.get('phase', '')
                        if st.get('gone') or phase in ('victory', 'defeat'):
                            break
                        if time.time() - last_print > 20 or [a for a in st.get('acts', []) if a != 'summonFull']:
                            last_print = time.time()
                            print('guard', json.dumps(st, ensure_ascii=False), flush=True)
                        if shots < 3 and st.get('t', 0) > (20, 60, 120)[shots]:
                            shots += 1
                            await shot(f'21_guard_mid{shots}')
                        await asyncio.sleep(0.6)
                    print('guard last', json.dumps(st, ensure_ascii=False), 'wall', round(time.time() - t2), 's', flush=True)
                    await asyncio.sleep(3)
                    end = await ev(GUARD_END, 200)
                    print('guard end', end, flush=True)
                    await asyncio.sleep(1.5)
                    await shot('22_guard_end')
                    back = await ev(GUARD_BACK, 120)
                    print('guard back', back, flush=True)
                    home = False
                    for _ in range(120):
                        if await ev("return (root.currentView === 'lobby' && t && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                            home = True
                            break
                        await asyncio.sleep(2)
                    await settle()
                    await shot('23_after_guard')
                    try:
                        e = json.loads(end)
                    except Exception:
                        e = {}
                    stage('guard', phase in ('victory', 'defeat') and bool(e.get('backButton')) and home,
                          f"phase={phase} title={e.get('title')} settle={e.get('settle')} state={e.get('battleState')} back={back} home={home}")

            # ── 野外:清一群怪 ──
            if 'field' in ONLY:
                await ev(f"if (t.def.code !== '{FIELD_MAP}') setTimeout(() => root.travelWorldMap('{FIELD_MAP}', null), 50); return 1;")
                in_field = await wait_map(FIELD_MAP, 150)
                await asyncio.sleep(6)
                prep = await ev(FIELD_PREP)
                print('field prep', prep, flush=True)
                await asyncio.sleep(3)
                await shot('30_field_before')
                fight = await ev(FIELD_FIGHT, 300)
                print('field fight', fight, flush=True)
                await shot('31_field_after')
                await asyncio.sleep(5)
                haul = await ev("return JSON.stringify({ haul: t.haul ? { kills: t.haul.kills, groups: t.haul.groups } : null, reports: window.__kills || [] });")
                print('field result', haul, flush=True)
                await ev("clearInterval(window.__lcKeepAlive); return 1;")
                try:
                    f, h = json.loads(fight), json.loads(haul)
                    stage('field', in_field and f['start'] > 0 and f['left'] == 0 and len(h['reports']) > 0, f"map={FIELD_MAP} killed={f['start'] - f['left']}/{f['start']} reports={h['reports'][:3]}")
                except Exception as e:
                    stage('field', False, f'{e} fight={str(fight)[:200]}')

            # ── 下载了哪些文件(浏览器缓存里的 + 页面请求过的)──
            if '--wait-pack' in sys.argv:
                # 等后台整包下载停下来(缓存里的文件数 30 秒不再涨)再统计,最多等 8 分钟
                count_js = "let n = 0; for (const name of await caches.keys()) n += (await (await caches.open(name)).keys()).length; return n;"
                last, calm, t3 = -1, 0, time.time()
                while time.time() - t3 < 480 and calm < 3:
                    n = await ev(count_js, 120)
                    calm = calm + 1 if n == last else 0
                    last = n
                    await asyncio.sleep(10)
                print('pack settled', last, 'files in', round(time.time() - t3), 's', flush=True)
            cached = await ev("""const out = []; for (const name of await caches.keys()) { const c = await caches.open(name); for (const q of await c.keys()) out.push(new URL(q.url).pathname); } return JSON.stringify(out);""", 120)
            try:
                got = set(json.loads(cached)) | requested
                man = json.load(urllib.request.urlopen(ORIGIN + '/asset-manifest.json', timeout=30))
                size, res = {}, {}
                for (rel, n), rp in zip(man['files'], man['res']):
                    size['/' + rel], res['/' + rel] = n, rp
                have = [p for p in got if p in size]
                hd = [p for p in have if res[p].startswith('ui/world/citymoon_hd/')]
                std = [p for p in have if re.match(r'ui/world/citymoon/(base_|mask_|tree_|cloth_|water_)', res[p])]
                core = sum(n for _, n in man['files'][:man['core']])
                print('download', json.dumps({'manifestFiles': len(man['files']), 'manifestMB': round(sum(size.values()) / 1048576, 1), 'coreFiles': man['core'], 'coreMB': round(core / 1048576, 1),
                                              'gotFiles': len(have), 'gotMB': round(sum(size[p] for p in have) / 1048576, 1), 'citymoon_hd': len(hd), 'citymoon_std_art': len(std)}), flush=True)
                want_hd = 'cityHd=0' not in base.PAGE
                if 'city' in ONLY:
                    stage('city art tier', (len(hd) > 0 and len(std) == 0) if want_hd else (len(std) > 0 and len(hd) == 0), f'hd={len(hd)} std={len(std)}')
            except Exception as e:
                print('download tally failed', e, str(cached)[:200], flush=True)
            pump.cancel()
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)
        time.sleep(1.5)
        shutil.rmtree(profile, ignore_errors=True)
        g3d = [w for w in issues['warnings'] + issues['errors'] if '[g3d' in w]
        print('\nSUMMARY', flush=True)
        for line in notes:
            print(' ', line, flush=True)
        for key in ('exceptions', 'errors', 'http', 'failed'):
            uniq = list(dict.fromkeys(issues[key]))
            print(f'  {key}: {len(issues[key])} ({len(uniq)} distinct)', flush=True)
            for text in uniq[:15]:
                print('    -', text, flush=True)
        warn = list(dict.fromkeys(issues['warnings']))
        print(f"  warnings: {len(issues['warnings'])} ({len(warn)} distinct); g3d-related: {len(g3d)}", flush=True)
        for text in warn[:12]:
            print('    ~', text[:200], flush=True)
    if bad or issues['exceptions'] or not notes:
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
