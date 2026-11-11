# -*- coding: utf-8 -*-
"""战斗画面精致化(2026-11-11)实机截图:守卫战(限时副本入口,冒险已下架)+ 野外战斗,手机 / 电脑两种视口。
诊断「哪里糊 / 粗 / 脏」和改完后的前后对比都用它:同一视口、同一套定格时刻,输出全分辨率 PNG。

- 手机:1200×540 CSS、DPR 2、移动端 UA → 画布 2400×1080(等同 1080p 手机「极致」档;竖握时引擎自己转成横屏,画面相同)
- 电脑:1920×1080、DPR 1
- 独立调试端口 9352 + 独立配置目录 battlepolish_browser_profile(不以 edge_ 开头,别的会话收尾清残留时不会连带关掉)
- 默认用显卡渲染(软件渲染在 2400×1080 下每帧几百毫秒,sim 追帧后特效全对不上);QA_GPU=0 退回软件渲染

用法:PYTHONIOENCODING=utf-8 python tools/qa/battle_polish_shots.py <输出目录> [phone|pc|both] [--only=guard|field|lobby] [--codes=英雄码,...] [--steps=步骤.json]
--steps 配 --only=guard(js 里有 r / sim / M)、--only=field(js 里有 t = 野外渲染器)或 --only=lobby 用;步骤种类见 run_steps
产物:<输出目录>/<视口>_guard_*.png、<视口>_field_*.png + 控制台打印的画布 / 特效节点缩放等量化信息
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

os.environ.setdefault('EDGE_PORT', '9352')

import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(base.SCRATCH, 'battle_polish')
WHICH = ARGS[1] if len(ARGS) > 1 else 'both'
ONLY = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--only=')), '')
CODES = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--codes=')), [])
STEPS_FILE = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--steps=')), '')
ACCOUNT = os.environ.get('QA_ACCOUNT', 'selfchk1108')
STAGES = [os.environ.get('QA_STAGE', 'DAILY_FORGE_1'), 'DAILY_FORGE_1', 'DAILY_ARCANE_1', 'DAILY_AWAKEN_1', 'DAILY_ABYSS_1', 'RAID_1']
FIELD_MAP = os.environ.get('QA_FIELD', 'WOODS')
os.makedirs(OUT, exist_ok=True)
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
# 电脑视口:预览页顶部有 48px 工具栏,视口加高 48、截图时裁掉,游戏画布正好 1920×1080
TOOLBAR = 48
VIEWS = {'phone': (1200, 540, 2, True), 'pc': (1920, 1080 + TOOLBAR, 1, False)}

JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let cc = null; for (let i = 0; i < 40 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1500); } } if (!cc) return 'cc import failed'; window.__cc = cc; return 'ok'; })()"""
ROOT_JS = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } }); window.__root = root; const t = root && root.lobbyTownRenderer;"
BUSY = "let busy=false; root.node.walk(x=>{ if((x.name==='PackLoading' || x.name==='SceneAssetLoading' || x.name==='WorldEntryLoading') && x.activeInHierarchy) busy=true; }); return busy ? 'wait' : 'ok';"
CLEAR = ("if (root.evolutionPick && !root.evolutionPick.busy && root.evolutionPick.state.choice) { root.selectEvolutionCard(root.evolutionPick.state.choice.candidates[0].key); await root.confirmEvolution(); return 'evo'; }"
         " if (root.contractPick && !root.contractPick.busy) { root.selectStarterContract(root.contractPick.candidates[0].heroCode); await root.confirmStarterContract(); return 'contract'; }"
         " return 'none';")

ENTER = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const cc = window.__cc; let root = window.__root;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  const log = [];
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
  return log.join(' | ') + ' → view=' + root.currentView + ' sim=' + !!(window.__gr && window.__gr.sim); })()""" % json.dumps(list(dict.fromkeys(STAGES)))

H = r"""const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, r = window.__gr, sim = r.sim, M = window.__M;
  const alive = () => sim.monsters.filter(m => !m.dead);
  const fxNodes = () => r.fieldNode.children.filter(c => c.name === 'GuardSkillFx');
  const describe = n => { const sk = n.getComponent(cc.sp.Skeleton); const te = sk && sk.getCurrent && sk.getCurrent(0);
    return { data: sk && sk.skeletonData && sk.skeletonData.name, anim: sk && sk.animation, scale: +n.scale.x.toFixed(3), t: te ? +te.trackTime.toFixed(2) : -1, dur: te && te.animation ? +te.animation.duration.toFixed(2) : -1 }; };
"""

PREP = "(async () => { " + H + r"""
  cc.game.resume();
  if (sim.pendingChoice) M.guardSkipChoice(sim);
  sim.crystalHp = sim.crystalMaxHp = 9e9; sim.gold = 99999;
  for (let i = 0; i < 16; i++) { const before = sim.heroes.length; try { M.guardSummon(sim, true); } catch (e) { break; } await sleep(160); if (sim.pendingChoice) M.guardSkipChoice(sim); if (sim.heroes.length === before && i > 6) break; }
  const cv = cc.game.canvas;
  return JSON.stringify({ phase: sim.phase, stage: sim.stageCode, heroes: sim.heroes.map(h => h.heroCode + ':' + h.role + ':' + h.star + '@' + h.cell), pool: (sim.pool || []).map(p => p.heroCode),
    unit: Math.round(r.unitSize()), spells: sim.spellLoadout, canvas: [cv.width, cv.height], css: [cv.clientWidth, cv.clientHeight], dpr: window.devicePixelRatio,
    design: [cc.view.getDesignResolutionSize().width, cc.view.getDesignResolutionSize().height], scaleX: +cc.view.getScaleX().toFixed(3), bg: r.resolveSceneBgName ? r.resolveSceneBgName() : '' });
})()"""

# 怪物拉到阵前不动、血量极大:普攻 / 命中 / 飘字持续出
HOLD = "(async () => { " + H + r"""
  cc.game.resume();
  if (sim.pendingChoice) M.guardSkipChoice(sim);
  if (alive().length < 5) { for (let k = 0; k < 6; k++) sim.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: sim.timeMs + 40 + k * 30 }); }
  for (let i = 0; i < 50 && alive().length < 5; i++) await sleep(100);
  alive().forEach((m, k) => { m.x = 3.4 + (k % 5) * 0.5; m.speedCellsPerSec = 0; m.hp = 9e8; m.maxHp = 9e8; });
  await sleep(__WAIT__);
  cc.game.pause();
  return JSON.stringify({ monsters: alive().length, nums: r.fieldNode.children.filter(c => c.name === 'GuardDamageNum' && c.active).length });
})()"""

CAST = "(async () => { " + H + r"""
  cc.game.resume();
  const idx = __IDX__, ult = __ULT__, want = '__CODE__';
  for (let i = 0; i < 40 && (r.ultFxLive > 0 || r.skillFxLive > 0); i++) await sleep(100);
  let hero = want ? sim.heroes.find(h => h.heroCode === want) : sim.heroes[idx];
  if (!hero && want) { hero = sim.heroes[idx % sim.heroes.length]; const entry = (sim.pool || []).find(e => e.heroCode === hero.heroCode); if (entry) entry.heroCode = want; hero.heroCode = want; }
  if (!hero) return JSON.stringify({ err: 'no hero ' + idx });
  hero.star = Math.max(hero.star, 2); M.guardHeroPerks(sim, hero.heroCode).ultLv = ult ? 1 : 0;
  r.heroFxLastAt.delete(hero.heroCode); r.lastUltDimAt = 0;
  if (alive().length < 4) { for (let k = 0; k < 5; k++) sim.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: sim.timeMs + 40 + k * 30 }); }
  for (let i = 0; i < 40 && alive().length < 4; i++) await sleep(100);
  alive().forEach((m, k) => { m.x = 3.4 + (k % 5) * 0.5; m.speedCellsPerSec = 0; m.hp = 9e8; m.maxHp = 9e8; });
  await sleep(150);
  const known = new Set(fxNodes());
  hero.skillReadyMs = sim.timeMs; hero.skillPendingSinceMs = 0;
  let node = null;
  for (let i = 0; i < 160 && !node; i++) { await sleep(50);
    if (M.guardHeroSkillPending && M.guardHeroSkillPending(sim, hero)) M.guardCastHeroSkillNow(sim, hero.unitId);
    node = fxNodes().find(c => !known.has(c) && c.getComponent(cc.sp.Skeleton) && c.getComponent(cc.sp.Skeleton).skeletonData) || null; }
  let info = null;
  if (node) {
    // 定格时刻:大招有实测亮度峰值(fxprev/core_hu.json 的 peakT)就用它,否则片段开播后 0.8 秒;战技取整段 45%
    const PEAKS = __PEAKS__;
    let t0 = -1;
    for (let i = 0; i < 160 && node.isValid; i++) { const d = describe(node);
      if (d.dur > 0) { if (t0 < 0) t0 = d.t; const peak = PEAKS[d.data];
        const stopAt = ult ? (peak !== undefined && peak > t0 ? peak : t0 + 0.8) : Math.max(t0 + 0.25, d.dur * __AT__);
        if (d.t >= stopAt) break; }
      else if (i > 20) break;
      await sleep(30); }
    info = node.isValid ? Object.assign(describe(node), { t0 }) : null;
  }
  cc.game.pause();
  return JSON.stringify({ hero: hero.heroCode, role: hero.role, rarity: hero.rarity, ult, fired: !!node, info, unit: Math.round(r.unitSize()), nums: r.fieldNode.children.filter(c => c.name === 'GuardDamageNum' && c.active).length });
})()"""

SPELL = "(async () => { " + H + r"""
  cc.game.resume();
  const id = '__ID__';
  if (sim.spellLoadout.indexOf(id) < 0) { sim.spellLoadout = [id].concat(sim.spellLoadout.filter(x => x !== id)).slice(0, Math.max(1, sim.spellSlots || 2)); sim.unlockedSpells = Array.from(new Set((sim.unlockedSpells || []).concat([id]))); try { r.renderSpellBar(); } catch (e) {} }
  if (alive().length < 4) { for (let k = 0; k < 5; k++) sim.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: sim.timeMs + 40 + k * 30 }); }
  for (let i = 0; i < 40 && alive().length < 4; i++) await sleep(100);
  alive().forEach((m, k) => { m.x = 3.4 + (k % 5) * 0.5; m.speedCellsPerSec = 0; m.hp = 9e8; m.maxHp = 9e8; });
  sim.spellEnergy = sim.spellEnergyMax || 150;
  const m = alive()[0];
  const ok = M.guardCastSpell(sim, id, m ? { lane: m.lane, x: m.x } : { lane: 0, x: 4 });
  await sleep(__WAIT__);
  cc.game.pause();
  return JSON.stringify({ id, ok });
})()"""

BOSS = "(async () => { " + H + r"""
  cc.game.resume();
  alive().forEach(m => { m.dead = true; });
  sim.pendingSpawns.unshift({ kind: 'boss', lane: 1, atMs: sim.timeMs + 100 });
  let boss = null;
  for (let i = 0; i < 80 && !boss; i++) { await sleep(150); boss = sim.monsters.find(m => m.kind === 'boss' && !m.dead) || null; }
  if (!boss) return JSON.stringify({ err: 'no boss' });
  boss.speedCellsPerSec = 0; boss.x = 4.4; boss.hp = boss.maxHp = 9e9;
  let v = null;
  for (let i = 0; i < 60; i++) { await sleep(300); v = r.monsterViews.get(boss.monsterId); if (v && v.spineReady) break; }
  await sleep(2600);
  cc.game.pause();
  return JSON.stringify({ boss: boss.spineCode, ready: !!(v && v.spineReady) });
})()"""

RESUME = "(() => { window.__cc.game.resume(); return 1; })()"
# 退出战斗回大厅:走「确认退出」同一个宿主入口(只改 currentView 的话战场层还挂着,野外截图会截到战场)
EXIT = "(async () => { const root = window.__root; window.__cc.game.resume(); try { window.__gr.sim.paused = true; } catch (e) {} try { root.returnToLobbyFromBattlePreview(); } catch (e) { return 'exit err ' + e.message; } for (let i = 0; i < 40 && root.currentView !== 'lobby'; i++) await new Promise(z => setTimeout(z, 250)); return 'view=' + root.currentView; })()"

# 贴图上屏倍率:场上每个骨骼 / 精灵的「屏幕像素 ÷ 贴图像素」(>1 就是被放大)
DENSITY = "(async () => { " + H + r"""
  const out = { sprites: [], spines: [] }; const sx = cc.view.getScaleX();
  const seen = new Set();
  const walk = n => { if (!n.activeInHierarchy) return;
    const sp = n.getComponent(cc.Sprite); const ut = n.getComponent(cc.UITransform);
    if (sp && sp.spriteFrame && ut) { const rect = sp.spriteFrame.rect; const ws = n.worldScale; const key = (sp.spriteFrame.texture && sp.spriteFrame.texture._uuid) + ':' + n.name;
      if (!seen.has(key) && ut.width * Math.abs(ws.x) * sx > 160) { seen.add(key); out.sprites.push([n.name, Math.round(rect.width) + 'x' + Math.round(rect.height), Math.round(ut.width * Math.abs(ws.x) * sx) + 'x' + Math.round(ut.height * Math.abs(ws.y) * sx), +(ut.width * Math.abs(ws.x) * sx / rect.width).toFixed(2)]); } }
    const sk = n.getComponent(cc.sp.Skeleton);
    if (sk && sk.skeletonData) { const key = sk.skeletonData.name; if (!seen.has('sk:' + key)) { seen.add('sk:' + key); const ws = n.worldScale; let root = 1; try { const b = sk._skeleton && sk._skeleton.bones && sk._skeleton.bones[0]; if (b) root = Math.abs(b.scaleX || 1); } catch (e) {}
      out.spines.push([key, n.name, +(Math.abs(ws.x) * sx).toFixed(3), +root.toFixed(3)]); } }
    n.children.forEach(walk); };
  walk(r.root);
  return JSON.stringify(out);
})()"""


try:
    _CORE = json.load(open(os.path.join(base.HERE, 'fxprev', 'core_hu.json'), encoding='utf-8'))
    PEAKS = {'hu_' + v['set']: v['peakT'] for v in _CORE.values() if 'peakT' in v}
except Exception:
    PEAKS = {}


class Reloaded(Exception):
    """预览页中途被整页重载(别的会话改脚本 / 刷新素材库触发),这个视口要从头再来。"""


def cast_js(idx, ult, code='', at=0.45):
    return CAST.replace('__PEAKS__', json.dumps(PEAKS)).replace('__IDX__', str(idx)).replace('__ULT__', 'true' if ult else 'false').replace('__CODE__', code).replace('__AT__', str(at))


async def run_view(name, port):
    w, h, dpr, mobile = VIEWS[name]
    tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/json/new?about:blank', method='PUT'), timeout=5))
    async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
        seq = 0
        logs = []

        async def call(m, p=None, timeout=300):
            nonlocal seq
            seq += 1
            my = seq
            await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
            while True:
                x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                if x.get('method') == 'Runtime.exceptionThrown':
                    d = x['params']['exceptionDetails']
                    logs.append('EXC ' + (d.get('exception', {}).get('description') or d.get('text', ''))[:300])
                if x.get('id') == my:
                    return x

        async def raw(expr, timeout=300):
            r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
            if r.get('exceptionDetails'):
                return 'EXC ' + (r['exceptionDetails'].get('exception', {}).get('description', '') or str(r['exceptionDetails']))[:400]
            return r.get('result', {}).get('value')

        async def ev(body, timeout=180):
            return await raw("(async ()=>{ const cc = window.__cc; " + ROOT_JS + " try { " + body + " } catch (e) { return 'err ' + e.message; } })()", timeout)

        async def shot(tag):
            # 直接读游戏画布(先补画一帧,同一个任务里读回,绘图缓冲还在):拿到的就是游戏渲染出的原始像素,
            # 不带预览页工具栏 / 浏览器浮标;读回失败再退回整页截图
            path = os.path.join(OUT, f'{name}_{tag}.png')
            data = await raw("(() => { const cc = window.__cc; try { cc.game.step(); return cc.game.canvas.toDataURL('image/png'); } catch (e) { return 'err ' + e.message; } })()", 300)
            if not isinstance(data, str) or data.startswith('err Cannot read properties of undefined'):
                raise Reloaded(tag)
            if isinstance(data, str) and data.startswith('data:image/png;base64,') and len(data) > 60000:
                open(path, 'wb').write(base64.b64decode(data.split(',', 1)[1]))
                print('  shot', os.path.basename(path), flush=True)
                return
            m = await call('Page.captureScreenshot', {'format': 'png'}, 300)
            if 'result' in m:
                open(path, 'wb').write(base64.b64decode(m['result']['data']))
                print('  shot(page)', os.path.basename(path), str(data)[:60], flush=True)

        async def run_steps(wrap):
            """跑 --steps 里的自定义步骤;wrap(js) 把步骤里的 js 包成可执行表达式(守卫战 / 野外各带各的环境变量)。"""
            for step in json.load(open(STEPS_FILE, encoding='utf-8')):
                if step.get('cpu'):
                    # {"cpu": 4}:处理器降速到 1/4(量「手机上这段代码要跑多久」用;量完记得 {"cpu": 1} 还原)
                    await call('Emulation.setCPUThrottlingRate', {'rate': float(step['cpu'])})
                if step.get('metrics'):
                    # {"metrics": "small"}:视口宽高各缩到 82%(触发战场重建,验「重建后还在不在」用);{"metrics": "restore"} 还原
                    k = 0.82 if step['metrics'] == 'small' else 1
                    await call('Emulation.setDeviceMetricsOverride', {'width': round(w * k), 'height': round(h * k), 'deviceScaleFactor': dpr, 'mobile': mobile,
                                                                       'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
                if step.get('cast'):
                    # {"cast": {"idx": 0, "ult": true, "code": "UR_NYX"}}:放一次战技 / 大招并定格在亮度峰值(只在守卫战里有意义)
                    c = step['cast']
                    print(name, 'cast', await raw(cast_js(int(c.get('idx', 0)), bool(c.get('ult')), c.get('code', '')), 120), flush=True)
                if step.get('js'):
                    res = await raw(wrap(step['js']), 300)
                    if step.get('save') and isinstance(res, str) and res.startswith('data:image/'):
                        # {"js": ..., "save": "文件名.png"}:js 返回一张图(data URL)时存成文件——页面里自己拼好的巡检图 / 对照图
                        path = os.path.join(OUT, f"{name}_{step['save']}")
                        open(path, 'wb').write(base64.b64decode(res.split(',', 1)[1]))
                        print(name, 'saved', os.path.basename(path), flush=True)
                    else:
                        print(name, 'step', (str(res) or '')[:20000], flush=True)
                if step.get('wait'):
                    await asyncio.sleep(float(step['wait']))
                if step.get('shot'):
                    await shot(step['shot'])

        await call('Runtime.enable')
        # 保证本页在前台(后台页不出帧):万一还有别的页被打开,也不至于把游戏页晾在后面
        await call('Page.bringToFront')
        await call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr, 'mobile': mobile,
                                                           'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
        if mobile:
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Network.setUserAgentOverride', {'userAgent': UA, 'platform': 'Android'})
        await call('Page.navigate', {'url': base.PAGE})
        print(name, 'cc', await raw(JS_CC, 400), flush=True)
        view = ''
        for _ in range(240):
            view = await ev("return root ? root.currentView : 'noroot';")
            if view in ('login', 'lobby', 'loginAccount'):
                break
            await asyncio.sleep(1)
        print(name, 'view', view, flush=True)
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
        print(name, 'lobby', await ev("const cv = cc.game.canvas; return JSON.stringify({ view: root.currentView, map: t && t.def && t.def.code, canvas: [cv.width, cv.height], css: [cv.clientWidth, cv.clientHeight], dpr: window.devicePixelRatio, mobile: cc.sys.isMobile, gl: (() => { try { const g = cc.director.root.device.gl; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch (e) { return 'err'; } })() });"), flush=True)

        if ONLY == 'lobby':
            # --only=lobby --steps=…:只在大厅里跑自定义步骤(不进战斗 / 野外),js 里可用 cc / root / sleep;看英雄详情等界面用
            for step in (json.load(open(STEPS_FILE, encoding='utf-8')) if STEPS_FILE else []):
                if step.get('js'):
                    lobby_js = "(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc, root = window.__root; " + step['js'] + " })()"
                    print(name, 'step', (str(await raw(lobby_js, 300)) or '')[:20000], flush=True)
                if step.get('wait'):
                    await asyncio.sleep(float(step['wait']))
                if step.get('shot'):
                    await shot(step['shot'])
            if logs:
                print(name, 'page exceptions:', *logs[:12], sep='\n  ', flush=True)
            return
        if ONLY in ('', 'guard'):
            print(name, 'enter', await raw(ENTER, 600), flush=True)
            calm = 0
            for _ in range(360):
                live = await raw("(() => { const root = window.__root, r = root.lobbyGuardBattleRenderer; const st = root.currentLobbyBattleState(); return !!(r && r.sim && !st.assetsLoading && r.isBattleLive() && r.root && !r.root.getChildByName('GuardLoading')); })()")
                calm = calm + 1 if live is True else 0
                if calm >= 4:
                    break
                await asyncio.sleep(0.5)
            await raw("(() => { window.__gr = window.__root.lobbyGuardBattleRenderer; return 1; })()")
            await asyncio.sleep(2)
            print(name, 'prep', await raw(PREP, 120), flush=True)
            await asyncio.sleep(5)
            await raw("(() => { window.__cc.game.pause(); return 1; })()")
            if not STEPS_FILE:
                await shot('guard_00_calm')
            await raw(RESUME)
            print(name, 'hold', await raw(HOLD.replace('__WAIT__', '2600'), 120), flush=True)
            if STEPS_FILE:
                # 自定义步骤(做样片 / 前后对比用):JSON 数组,每步 {"js": 表达式(可用 H 里的 r / sim / M / cc / sleep,写成 async 函数体), "shot": 名字, "wait": 秒}
                await run_steps(lambda js: "(async () => { " + H + js + " })()")
                await raw(RESUME)
                await raw(EXIT)
                if logs:
                    print(name, 'page exceptions:', *logs[:12], sep='\n  ', flush=True)
                return
            await shot('guard_01_melee')
            print(name, 'density', await raw(DENSITY, 60), flush=True)
            await raw(RESUME)
            heroes = json.loads(await raw("JSON.stringify(window.__gr.sim.heroes.map(h => h.heroCode))") or '[]')
            picks = CODES or heroes[:4]
            for i, code in enumerate(picks):
                print(name, 'skill', await raw(cast_js(i, False, code if CODES else ''), 120), flush=True)
                await shot(f'guard_1{i}_skill_{code}')
                await raw(RESUME)
                await asyncio.sleep(2.5)
                print(name, 'ult', await raw(cast_js(i, True, code if CODES else ''), 120), flush=True)
                await shot(f'guard_2{i}_ult_{code}')
                await raw(RESUME)
                await asyncio.sleep(3.5)
            for sid, wait in (('quake', 700), ('thunder', 450), ('frost', 700)):
                print(name, 'spell', await raw(SPELL.replace('__ID__', sid).replace('__WAIT__', str(wait)), 60), flush=True)
                await shot(f'guard_3_spell_{sid}')
                await raw(RESUME)
                await asyncio.sleep(2.5)
            print(name, 'boss', await raw(BOSS, 120), flush=True)
            await shot('guard_4_boss')
            await raw(RESUME)
            print(name, 'exit', await raw(EXIT), flush=True)
            await asyncio.sleep(4)

        if ONLY in ('', 'field'):
            await ev(f"if (t.def.code !== '{FIELD_MAP}') setTimeout(() => root.travelWorldMap('{FIELD_MAP}', null), 50); return 1;")
            for _ in range(150):
                if await ev(f"return (t.def && t.def.code === '{FIELD_MAP}' && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok' and await ev(BUSY) == 'ok':
                    break
                await asyncio.sleep(2)
            await asyncio.sleep(6)
            T = "const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"
            # 队伍保持满血(测试号队长血量没登记时是 0,一碰就倒、被送回传送阵),站到怪群左侧 300 让怪围上来
            print(name, 'field', await ev(T + " clearInterval(window.__lcKeepAlive); window.__lcKeepAlive = setInterval(() => { try { const tt = window.__root.lobbyTownRenderer; tt.leaderHp = tt.leaderMaxHp || 99999; tt.followers.forEach(a => { a.hp = a.maxHp || 99999; a.down = false; }); } catch (e) {} }, 80);"
                                          " const c = t.def.camps.find(x => !x.elite && !x.dummy) || t.def.camps[0]; tp(c.x - 300, c.y); const cv = cc.game.canvas; return JSON.stringify({ map: t.def.code, camp: c.stageCode, at: [Math.round(t.leader.x), Math.round(t.leader.y)], party: [t.leader, ...t.followers].map(a => a.hero.heroCode), canvas: [cv.width, cv.height], zoom: t.cameraZoom });"), flush=True)
            await asyncio.sleep(3)
            for _ in range(4):
                far = await ev(T + " const c = t.def.camps.find(x => !x.elite && !x.dummy) || t.def.camps[0]; const d = Math.hypot(t.leader.x - c.x, t.leader.y - c.y); if (d > 700) { tp(c.x - 300, c.y); return 'retp ' + Math.round(d); } return 'ok ' + Math.round(d);")
                print(name, 'field pos', far, flush=True)
                if isinstance(far, str) and far.startswith('ok'):
                    break
                await asyncio.sleep(3)
            if STEPS_FILE:
                # --only=field --steps=…:站到怪群旁边后跑自定义步骤(js 里可用 cc / root / t(野外渲染器)/ sleep),不走默认的四组截图
                await run_steps(lambda js: "(async () => { const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc; " + ROOT_JS + js + " })()")
                await ev("clearInterval(window.__lcKeepAlive); return 1;")
                if logs:
                    print(name, 'page exceptions:', *logs[:12], sep='\n  ', flush=True)
                return
            await shot('field_00_before')
            for label, call_js, delays in (('atk', 't.leaderAttack()', (0.18, 0.3, 0.3)), ('K', 't.leaderSkill(0)', (0.2, 0.3, 0.4)), ('L', 't.leaderSkill(1)', (0.2, 0.3, 0.4)), ('I', 't.leaderSkill(2)', (0.3, 0.5, 0.7))):
                await ev("t.skillReadyAt = [0, 0, 0]; t.dodgeReadyAt = 0; t.actionUntil = 0; t.dashUntil = 0; return 1;")
                await ev(f"{call_js}; return 1;")
                for i, d in enumerate(delays):
                    await asyncio.sleep(d)
                    if label == 'atk':
                        await ev("t.actionUntil = 0; t.leaderAttack(); return 1;")
                    await ev("cc.director.pause(); return 1;")
                    await shot(f'field_{label}_{i}')
                    await ev("cc.director.resume(); return 1;")
                print(name, label, await ev("const out = []; t.entityRoot.walk(n => { if (/^Town(Fx|Strike|Bolt|Dodge)/.test(n.name)) out.push(n.name + '@' + n.scale.x.toFixed(2)); }); return out.join(',');"), flush=True)
                await asyncio.sleep(1.6)
        if logs:
            print(name, 'page exceptions:', *logs[:12], sep='\n  ', flush=True)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/json/close/{tab['id']}", timeout=5)
    except Exception:
        pass


async def main():
    profile = os.path.join(base.SCRATCH, 'battlepolish_browser_profile')
    gpu = os.environ.get('QA_GPU', '1') != '0'
    flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] if gpu else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    # --disable-extensions 必须带:本机 Edge 给每个新配置目录自动装上 Grammarly / Monica 等扩展,它们会弹出引导页(还会去连外网)、
    # 把游戏页挤到后台 → 后台页不出帧,游戏画面停更,脚本卡在「进入战斗」不返回(2026-11-11 实际遇到)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update',
                             '--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required'] + flags + ['about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        for name in (['phone', 'pc'] if WHICH == 'both' else [WHICH]):
            for attempt in range(4):
                try:
                    await run_view(name, base.PORT)
                    break
                except Reloaded as e:
                    print(name, f'page reloaded at {e}, retry {attempt + 1}', flush=True)
                    await asyncio.sleep(20)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)


if __name__ == '__main__':
    asyncio.run(main())
