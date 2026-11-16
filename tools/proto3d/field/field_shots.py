# -*- coding: utf-8 -*-
"""野外即时战斗的 3D 单位层(?field3d=1,见 assets/scripts/scenes/lobby/guard3d/TownUnits3D.ts)的自验:
用测试号进野外地图,真的走到怪群旁边打一场,截图 / 录屏 / 同一刻 2D 和 3D 对比 / 测速 / 看控制台有没有报错。

  python tools/proto3d/field/field_shots.py look  <输出目录>   # 快速看一眼:直接站到怪群旁(队长血量锁满),截站姿 / 出手 / 跑动 / 怪倒地
  python tools/proto3d/field/field_shots.py real  <输出目录>   # 真实打一群:自己走过去(游戏的自动寻路)、不锁血,自动普攻 + 技能,打到这一群清完并上报;中途截图、同一刻 2D / 3D 对比
  python tools/proto3d/field/field_shots.py real  <输出目录> --rec=32 --roam=1   # 录一段实战(从动身开始:走过去 + 开打;这一群清完就去打旁边的,录够为止;录屏的这一遍不做定格对比)
  python tools/proto3d/field/field_shots.py stroll <输出目录> --map=CITY          # 不打怪,只在图里四个方向各跑一小段截图(主城也是这套渲染,顺便看一眼)
  python tools/proto3d/field/field_shots.py switch <输出目录> --qs=               # 不带开关进图,现场开 → 关,查:关着时没有 3D 的东西、开过再关场景的灯光 / 阴影设置原样还原
  python tools/proto3d/field/field_shots.py bench <输出目录>   # 同一个定格画面:关 / 开 3D,各测每帧耗时、绘制次数、三角形数

常用参数:
  --qs=?field3d=1            预览地址后面带的参数(默认就是它;--qs= 留空 = 不开,看 2D 原样)
  --account=guidetest02      测试号(密码取自 tools/qa/battle_polish_shots.py,不写在这里)
  --team=R_HUAXIONG,R_TAISHICI,R_XUNYOU   进图后把队友换成这几个英雄(留空 = 不动阵容;跑完用 team 模式换回去)
  --map=WOODS --camp=FIELD_WOODS_4        去哪张图、打哪一群(关卡码;不给 = 第一群普通怪)
  --rec=0                    real:录多少秒(0 = 不录,默认);--rec-from=walk|fight 从动身 / 从开打开始录;--roam=1 这一群清完接着打旁边的
  --compare=arrive,6         real(不录屏时):在哪些时刻做同一刻对比(arrive = 刚走到怪群旁还没开打,数字 = 开打后第几秒)
  --view=pc|phone            视口(电脑 1920×1080 / 手机 2400×1080)
  python tools/proto3d/field/field_shots.py team <输出目录> --team=编码,编码,编码   # 只换阵容(跑完测试把测试号的阵容换回去)
环境变量:QA_GPU=low 用核显、QA_GPU=0 软件渲染(默认独显)。Creator 预览(7456)和本地游戏服(8081)要开着。
无头 Edge 用独立调试端口 9365 + 独立配置目录,退出时按配置目录清残留。
"""
import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
QA = os.path.normpath(os.path.join(HERE, '..', '..', 'qa'))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
MODE = ARGS[0] if ARGS else 'look'
OUT = ARGS[1] if len(ARGS) > 1 else os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'f3d')
QS = OPT.get('qs', '?field3d=1')
ACCOUNT = OPT.get('account', 'guidetest02')
TEAM = [c for c in OPT.get('team', 'R_HUAXIONG,R_TAISHICI,R_XUNYOU').split(',') if c]
MAP = OPT.get('map', 'WOODS')
CAMP = OPT.get('camp', '')
VIEW = OPT.get('view', 'pc')
REC = float(OPT.get('rec', '0'))
ROAM = OPT.get('roam', '0') == '1'
os.makedirs(OUT, exist_ok=True)

os.environ.setdefault('EDGE_PORT', '9365')
os.environ['PAGE_QS'] = QS
os.environ['QA_ACCOUNT'] = ACCOUNT
sys.path.insert(0, QA)
_argv = sys.argv
sys.argv = [sys.argv[0], OUT, VIEW, '--only=field']
import battle_polish_shots as bps  # noqa: E402  (只借它的常量:取引擎模块 / 找根节点 / 视口表)
sys.argv = _argv
base = bps.base
import websockets  # noqa: E402

# 测试号的密码不在这里再写一遍:从巡检脚本的登录那一行里取
_m = re.search(r"\{\{string:'\{ACCOUNT\}'\}\}, \{\{string:'([^']+)'\}\}", open(os.path.join(QA, 'battle_polish_shots.py'), encoding='utf-8').read())
PASSWORD = _m.group(1) if _m else ''
W, H_, DPR, MOBILE = bps.VIEWS[VIEW]

# js 片段头:sleep / cc / root(游戏根)/ t(野外渲染器)/ F(3D 层的调试接口)
HJS = "const sleep = ms => new Promise(z => setTimeout(z, ms)); const cc = window.__cc; " + bps.ROOT_JS + " const F = window.__f3d;"

TEAM_JS = r"""const want = %s; const heroes = root.currentLobbyHeroRosterState().heroes || []; const codeOf = id => (heroes.find(h => h.id === id) || {}).heroCode || id;
  const before = (root.selectedLobbyFormationHeroIds || []).map(codeOf);
  const ids = want.map(code => (heroes.find(h => h.heroCode === code) || {}).id).filter(Boolean);
  if (ids.length !== want.length) return JSON.stringify({ err: '名册里没有这些英雄', want });
  root.selectedLobbyFormationHeroIds = ids; root.saveLobbyFormationNow(); if (t && t.isMounted()) t.ensureParty(); await sleep(1200);
  return JSON.stringify({ before, now: ids.map(codeOf), party: t && t.leader ? [t.leader, ...t.followers].map(a => a.hero.heroCode) : null });"""

CAMP_JS = "const camp = (" + json.dumps(CAMP) + " && t.def.camps.find(x => x.stageCode === " + json.dumps(CAMP) + ")) || t.def.camps.find(x => !x.elite && !x.dummy) || t.def.camps[0];"
MINE = "const mine = () => t.monsters.filter(m => m.camp.stageCode === camp.stageCode);"

# 自动打:走真实的输入入口(方向键 / 普攻 / 技能),朝最近的活怪靠过去打;不改血量、不改数值
AUTO = HJS + CAMP_JS + MINE + r"""
  clearInterval(window.__fauto); window.__fautoLog = { atk: 0, skill: 0, err: '' }; window.__froam = __ROAM__;
  const K = cc.KeyCode; const keys = [K.KEY_W, K.KEY_A, K.KEY_S, K.KEY_D];
  window.__fauto = setInterval(() => { try { const L = window.__fautoLog; const leader = t.leader; keys.forEach(k => t.keys.delete(k));
    if (!leader || t.leaderDead) return;
    const pool = window.__froam ? t.monsters.filter(m => !m.camp.elite && !m.camp.dummy) : mine();
    const live = pool.filter(m => !m.dead && m.node.isValid); if (!live.length) return;
    let best = live[0], bd = 1e9; for (const m of live) { const d = Math.hypot(m.x - leader.x, m.y - leader.y); if (d < bd) { bd = d; best = m; } }
    const dx = best.x - leader.x, dy = best.y - leader.y;
    if (bd > 520) { const now = Date.now(); if (now - (window.__fwalkAt || 0) > 2500) { window.__fwalkAt = now; t.autoWalkTo(best.x - Math.sign(dx) * 140, best.y); } return; }
    if (bd > 150) { if (Math.abs(dx) > 60) t.keys.add(dx > 0 ? K.KEY_D : K.KEY_A); if (Math.abs(dy) > 60) t.keys.add(dy > 0 ? K.KEY_W : K.KEY_S); return; }
    const now = Date.now();
    for (let i = 0; i < 3; i++) { if (now >= t.skillReadyAt[i] && Math.random() < 0.2) { t.leaderSkill(i); L.skill++; return; } }
    t.leaderAttack(); L.atk++;
  } catch (e) { window.__fautoLog.err = String(e && e.stack || e).slice(0, 300); } }, 110);
  return 'auto on';"""
AUTO = AUTO.replace('__ROAM__', 'true' if ROAM else 'false')
AUTO_OFF = HJS + "clearInterval(window.__fauto); [cc.KeyCode.KEY_W, cc.KeyCode.KEY_A, cc.KeyCode.KEY_S, cc.KeyCode.KEY_D].forEach(k => t.keys.delete(k)); return JSON.stringify(window.__fautoLog || null);"

STATE = HJS + CAMP_JS + MINE + r"""
  const ms = mine(); const u = F ? F.info() : null;
  return JSON.stringify({ leader: t.leader ? [Math.round(t.leader.x), Math.round(t.leader.y)] : null, hp: Math.round(t.leaderHp) + '/' + Math.round(t.leaderMaxHp), dead: !!t.leaderDead,
    camp: camp.stageCode, alive: ms.filter(m => !m.dead).length, total: ms.length, engaged: t.encounters ? t.encounters.has(camp.stageCode) : null,
    followers: t.followers.map(a => a.hero.heroCode + (a.down ? '(倒)' : '')), haul: t.haul ? { kills: t.haul.kills, groups: t.haul.groups } : null, auto: window.__fautoLog || null,
    f3d: u ? { on: u.on, h3: u.heroes3d, m3: u.monsters3d, drawn: u.drawn, tris: u.tris, free: u.freeCells, stats: u.stats, err: u.lastError } : null });"""

# 定格(借游戏自己的顿帧:逻辑不推进、2D 骨骼停住;3D 层照常跟着,所以开关可以在定格里切)
FREEZE = "t.hitStopUntil = Date.now() + 3600000;"
UNFREEZE = "t.hitStopUntil = Date.now();"
# 每帧耗时:定格着一帧一帧推(cc.game.step),每帧后读回一个像素强制显卡把活干完;再记一帧的绘制次数 / 三角形数
BENCH = ("const dev = cc.director.root.device; const gl = dev.gl; const px = new Uint8Array(4);"
         " const run = (n) => { const ts = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); cc.game.step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }"
         " ts.sort((a, b) => a - b); return { median: +ts[ts.length >> 1].toFixed(2), avg: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2), draws: dev.numDrawCalls, tris: dev.numTris, instances: dev.numInstances }; };")
# 切开关并等它切完(定格里靠 cc.game.step 推帧)
SWITCH = ("const setOn = async (on) => { F.toggle(on); for (let i = 0; i < 120; i++) { cc.game.step(); await sleep(50); const u = F.info(); if (!on && !u.on) break;"
          " if (on && u.on && u.ready && u.heroes3d >= 1 && i > 12) break; } for (let i = 0; i < 4; i++) cc.game.step(); return F.info(); };")


def log(*a):
    print(*a, flush=True)


async def run(port):
    tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/json/new?about:blank', method='PUT'), timeout=5))
    async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
        seq = 0
        errors = []      # 页面异常 + console.error / 带 [f3d、[g3d 的告警

        def note(x):
            m = x.get('method')
            if m == 'Runtime.exceptionThrown':
                d = x['params']['exceptionDetails']
                errors.append('EXC ' + (d.get('exception', {}).get('description') or d.get('text', ''))[:400])
            elif m == 'Runtime.consoleAPICalled':
                p = x['params']
                text = ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))[:400]
                if p.get('type') == 'error' or (p.get('type') == 'warning' and ('[f3d' in text or '[g3d' in text)):
                    errors.append(p.get('type').upper() + ' ' + text)

        async def call(m, p=None, timeout=300):
            nonlocal seq
            seq += 1
            my = seq
            await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
            while True:
                x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                note(x)
                if x.get('id') == my:
                    return x

        async def raw(expr, timeout=300):
            r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)).get('result', {})
            if r.get('exceptionDetails'):
                return 'EXC ' + (r['exceptionDetails'].get('exception', {}).get('description', '') or str(r['exceptionDetails']))[:400]
            return r.get('result', {}).get('value')

        async def js(body, timeout=300):
            return await raw("(async () => { " + HJS + " try { " + body + " } catch (e) { return 'err ' + (e && e.stack || e); } })()", timeout)

        async def whole(body, timeout=300):
            return await raw("(async () => { try { " + body + " } catch (e) { return 'err ' + (e && e.stack || e); } })()", timeout)

        async def shot(tag, step=True):
            path = os.path.join(OUT, f'{tag}.png')
            data = await raw("(() => { const cc = window.__cc; try { " + ("cc.game.step(); " if step else "") + "return cc.game.canvas.toDataURL('image/png'); } catch (e) { return 'err ' + e.message; } })()", 300)
            if isinstance(data, str) and data.startswith('data:image/png;base64,') and len(data) > 60000:
                open(path, 'wb').write(base64.b64decode(data.split(',', 1)[1]))
                log('  shot', os.path.basename(path))
            else:
                log('  shot failed', tag, str(data)[:120])

        async def frozen_shot(tag):
            """定格这一刻截一张(借顿帧定住,截完放开)。"""
            await js(FREEZE + " await sleep(120); return 1;")
            await shot(tag, step=True)
            await js(UNFREEZE + " return 1;")

        async def rec_start():
            """开始录:页面里用 MediaRecorder 录游戏画布(实时,不拖慢对局)。录的同时主循环照常跑。"""
            started = await raw("(() => { try { const cv = window.__cc.game.canvas; const stream = cv.captureStream(30); const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];"
                                " const type = types.find(t => MediaRecorder.isTypeSupported(t)); const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 14000000 }); const chunks = [];"
                                " rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); }; window.__rec = { rec, chunks, type, b64: '' }; rec.start(1000); return 'rec ' + type; } catch (e) { return 'err ' + e.message; } })()")
            log('  ', started)
            return isinstance(started, str) and started.startswith('rec')

        async def rec_stop(name):
            """结束录:分块取回,转成 mp4。"""
            size = await raw("(async () => { const R = window.__rec; await new Promise(res => { R.rec.onstop = res; R.rec.stop(); }); const blob = new Blob(R.chunks, { type: R.type });"
                             " const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; const N = 0x8000; for (let i = 0; i < buf.length; i += N) s += String.fromCharCode.apply(null, buf.subarray(i, i + N)); R.b64 = btoa(s); return R.b64.length; })()", 600)
            webm = os.path.join(OUT, name + '.webm')
            with open(webm, 'wb') as f:
                pos = 0
                while isinstance(size, int) and pos < size:
                    part = await raw(f"window.__rec.b64.slice({pos}, {pos + 6000000})", 600)
                    f.write(base64.b64decode(part))
                    pos += 6000000
            await raw("(() => { window.__rec = null; return 1; })()")
            ff = shutil.which('ffmpeg')
            if ff and os.path.exists(webm):
                mp4 = os.path.join(OUT, name + '.mp4')
                r = subprocess.run([ff, '-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-r', '30', '-an', mp4], capture_output=True, text=True)
                if os.path.exists(mp4) and os.path.getsize(mp4) > 10000:
                    os.remove(webm)
                    log('  video', os.path.basename(mp4), os.path.getsize(mp4) // 1024, 'KB')
                else:
                    log('  ffmpeg failed', r.stderr[-300:])
            else:
                log('  没找到 ffmpeg,留着', webm)

        await call('Runtime.enable')
        await call('Page.bringToFront')
        await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H_, 'deviceScaleFactor': DPR, 'mobile': MOBILE, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
        if MOBILE:
            await call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
            await call('Network.setUserAgentOverride', {'userAgent': bps.UA, 'platform': 'Android'})
        await call('Page.navigate', {'url': base.PAGE})
        log('page', base.PAGE, '| cc', await raw(bps.JS_CC, 400))
        view = ''
        for _ in range(240):
            view = await js("return root ? root.currentView : 'noroot';")
            if view in ('login', 'lobby', 'loginAccount'):
                break
            await asyncio.sleep(1)
        if view != 'lobby':
            await js(f"root.loginFlow.setInputs({{string:'{ACCOUNT}'}}, {{string:'{PASSWORD}'}}); try {{ root.loginFlow.acceptedAgreement = true; }} catch(e){{}} root.run(() => root.loginFlow.login()); return 'login';")
        for _ in range(400):
            if await js("return (root.currentView === 'lobby' && t && t.isMounted()) ? 'ok' : 'wait';") == 'ok' and await js(bps.BUSY) == 'ok':
                break
            await asyncio.sleep(2)
        idle = 0
        for _ in range(60):
            got = await js(bps.CLEAR)
            idle = idle + 1 if got == 'none' else 0
            if idle >= 3:
                break
            await asyncio.sleep(1.5)
        log('lobby', await js("const cv = cc.game.canvas; return JSON.stringify({ view: root.currentView, map: t && t.def && t.def.code, account: '" + ACCOUNT + "', canvas: [cv.width, cv.height], f3d: F ? 'ok' : 'no __f3d',"
                              " gl: (() => { try { const g = cc.director.root.device.gl; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch (e) { return 'err'; } })() });"))
        if TEAM:
            log('team', await js(TEAM_JS % json.dumps(TEAM), 60))
        if MODE == 'team':
            return errors
        # 去地图(游戏自己的传送入口),等进图门走完
        await js(f"if (t.def.code !== '{MAP}') setTimeout(() => root.travelWorldMap('{MAP}', null), 50); return 1;")
        for _ in range(150):
            if await js(f"return (t.def && t.def.code === '{MAP}' && t.isMounted() && t.leader) ? 'ok' : 'wait';") == 'ok' and await js(bps.BUSY) == 'ok':
                break
            await asyncio.sleep(2)
        await asyncio.sleep(5)
        log('map', await js(CAMP_JS + " return JSON.stringify({ map: t.def.code, leader: [Math.round(t.leader.x), Math.round(t.leader.y)], camp: camp.stageCode, label: camp.label, monster: camp.monsterCode, at: [camp.x, camp.y],"
                             " party: [t.leader, ...t.followers].map(a => a.hero.heroCode), f3d: F ? F.info() : null });"))

        async def compare(tag):
            # 同一刻:定格,3D 开着截一张 → 关掉(换回 2D 骨骼)截一张 → 再开回来
            await js(FREEZE + " await sleep(150); return 1;")
            await shot(f'对比_{tag}_a_3D', step=True)
            off = await js(SWITCH + " return JSON.stringify(await setOn(false));")
            await shot(f'对比_{tag}_b_2D原样', step=True)
            back = await js(SWITCH + " const u = await setOn(true); return JSON.stringify({ on: u.on, h3: u.heroes3d, m3: u.monsters3d, err: u.lastError });")
            await js(UNFREEZE + " return 1;")
            log('  compare', tag, '| off:', str(off)[:80], '| back:', back)

        TP = "const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 90; a.y = y; a.node.setPosition(a.x, a.y, 0); }); t.trail = [new cc.Vec2(x - 400, y), new cc.Vec2(x, y)]; t.applyCamera(true); };"

        if MODE == 'look':
            # 直接站到怪群左边 300(队长血量锁满:只看画面,不是真实对局)
            log('tp', await js(CAMP_JS + TP + " clearInterval(window.__lcKeepAlive); window.__lcKeepAlive = setInterval(() => { try { const tt = window.__root.lobbyTownRenderer; tt.leaderHp = tt.leaderMaxHp || 99999; tt.followers.forEach(a => { a.hp = a.maxHp || 99999; a.down = false; }); } catch (e) {} }, 80);"
                                " tp(camp.x - 300, camp.y); await sleep(3500); return JSON.stringify(F.info());"))
            await frozen_shot('look_00_站到怪群旁')
            log('dump', await js("return JSON.stringify(F.dump().filter(u => u.ready));"))
            await js("t.skillReadyAt = [0, 0, 0]; t.actionUntil = 0; t.leaderAttack(); await sleep(160); return 1;")
            await frozen_shot('look_01_普攻出手')
            await asyncio.sleep(2.2)
            await frozen_shot('look_02_打了两秒')
            if OPT.get('compare', '1') != '0' and 'field3d=1' in QS:
                await compare('打怪中')
            await js("t.skillReadyAt = [0, 0, 0]; t.actionUntil = 0; t.leaderSkill(2); await sleep(420); return 1;")
            await frozen_shot('look_03_技能')
            await asyncio.sleep(2.5)
            await frozen_shot('look_04_再过一会儿')
            for key, tag in (('KEY_D', 'look_05_往右跑'), ('KEY_W', 'look_06_往上跑'), ('KEY_A', 'look_07_往左跑'), ('KEY_S', 'look_08_往下跑')):
                await js(f"t.keys.add(cc.KeyCode.{key}); await sleep(650); return 1;")
                await frozen_shot(tag)
                await js(f"t.keys.delete(cc.KeyCode.{key}); await sleep(250); return 1;")
            log('info', await js("clearInterval(window.__lcKeepAlive); return JSON.stringify(F.info());"))

        elif MODE == 'bench':
            log('tp', await js(CAMP_JS + TP + " clearInterval(window.__lcKeepAlive); window.__lcKeepAlive = setInterval(() => { try { const tt = window.__root.lobbyTownRenderer; tt.leaderHp = tt.leaderMaxHp || 99999; tt.followers.forEach(a => { a.hp = a.maxHp || 99999; a.down = false; }); } catch (e) {} }, 80);"
                                " tp(camp.x - 200, camp.y); await sleep(5000); return JSON.stringify(F.info());"))
            res = await js(FREEZE + " await sleep(200); " + SWITCH + BENCH + " const out = { canvas: [cc.game.canvas.width, cc.game.canvas.height] };"
                           " out.info = await setOn(true); run(30); out.on = run(150); await setOn(false); run(30); out.off = run(150); out.back = await setOn(true); " + UNFREEZE
                           + " clearInterval(window.__lcKeepAlive); return JSON.stringify(out);", 900)
            log('bench', res)
            open(os.path.join(OUT, f'bench_{VIEW}_gpu{os.environ.get("QA_GPU", "1")}.json'), 'w', encoding='utf-8').write(res if isinstance(res, str) else json.dumps(res))

        elif MODE == 'switch':
            G = ("const snap = () => { const sc = cc.director.getScene(); const g = sc.globals; const ml = sc.getChildByName('Main Light'); const mc = sc.getChildByName('Main Camera');"
                 " return { skyIllum: Math.round(g.ambient.skyIllum), sky: g.ambient.skyLightingColor.toString(), ground: g.ambient.groundLightingColor.toString(), shadows: g.shadows.enabled, shType: g.shadows.type, shSize: g.shadows.shadowMapSize,"
                 " env: g.skybox.envmap ? g.skybox.envmap.name || 'cube' : null, envType: g.skybox.envLightingType, mainLight: ml ? ml.getComponent(cc.DirectionalLight).enabled : null, mainCamVis: mc ? mc.getComponent(cc.Camera).visibility : null,"
                 " studio: !!(sc.getChildByName('G3DStudio') || {}).active, imps: (() => { let n = 0; t.entityRoot.walk(x => { if (x.name === 'G3DImp') n++; }); return n; })(),"
                 " spinesHidden: [t.leader, ...t.followers].filter(a => a.spineNode && !a.spineNode.active).length }; };")
            before = await js(G + " return JSON.stringify({ f3d: F.info().on, snap: snap() });")
            log('关着(进图时没带开关)', before)
            await shot('switch_a_关着')
            on = await js(G + " F.toggle(true); for (let i = 0; i < 100; i++) { await sleep(100); const u = F.info(); if (u.on && u.studioOpen && u.heroes3d >= 1) break; } await sleep(1500); return JSON.stringify({ f3d: F.info(), snap: snap() });")
            log('开了', on)
            await shot('switch_b_开了')
            off = await js(G + " F.toggle(false); await sleep(800); return JSON.stringify({ f3d: F.info().on, snap: snap() });")
            log('再关掉', off)
            await shot('switch_c_再关掉')
            try:
                same = json.loads(before)['snap'] == json.loads(off)['snap']
            except Exception:  # noqa: BLE001
                same = False
            log('开过再关,和一开始逐项一致:', same)

        elif MODE == 'stroll':
            # 不打怪:四个方向各跑一小段,看站姿 / 跑姿 / 转身 / 遮挡
            await frozen_shot('stroll_00_站着')
            for key, tag in (('KEY_D', 'stroll_01_往右跑'), ('KEY_W', 'stroll_02_往上跑'), ('KEY_A', 'stroll_03_往左跑'), ('KEY_S', 'stroll_04_往下跑')):
                await js(f"t.keys.add(cc.KeyCode.{key}); await sleep(900); return 1;")
                await frozen_shot(tag)
                await js(f"t.keys.delete(cc.KeyCode.{key}); await sleep(300); return 1;")
            log('info', await js("return JSON.stringify(F ? F.info() : null);"))
            log('dump', await js("return JSON.stringify(F ? F.dump() : null);"))

        elif MODE == 'real':
            rec_from = OPT.get('rec-from', 'walk')
            compares = [c for c in OPT.get('compare', 'arrive,6').split(',') if c] if REC <= 0 else []      # 录屏的这一遍不做对比(对比要定格好几秒)
            rec_name = OPT.get('rec-name', '实战录屏')
            rec_t0 = 0.0

            if REC > 0 and rec_from == 'walk' and await rec_start():
                rec_t0 = time.time()
            # 自己走过去:游戏的自动寻路,走到怪群警戒圈边上
            log('walk', await js(CAMP_JS + " const ok = t.autoWalkTo(camp.x - 330, camp.y); return JSON.stringify({ ok, from: [Math.round(t.leader.x), Math.round(t.leader.y)], to: [camp.x - 330, camp.y] });"))
            if not rec_t0:
                await asyncio.sleep(1.2)
                await shot('real_00_走过去的路上')
            for _ in range(120):
                st = json.loads(await whole(STATE))
                d = await js(CAMP_JS + " return Math.round(Math.hypot(t.leader.x - camp.x, t.leader.y - camp.y));")
                if (isinstance(d, (int, float)) and d < 480) or st.get('engaged'):
                    break
                await asyncio.sleep(0.4)
            log('arrived', await whole(STATE))
            if 'arrive' in compares:
                compares.remove('arrive')
                await compare('刚到怪群旁')
            log(await whole(AUTO))
            if REC > 0 and not rec_t0 and await rec_start():
                rec_t0 = time.time()
            t0 = time.time()
            shots_at = [float(x) for x in OPT.get('shots', '4,9,15,22').split(',') if x] if REC <= 0 else []
            compare_at = sorted(float(c) for c in compares)
            seen_alive = False
            last_log = -10
            while time.time() - t0 < float(OPT.get('max', '150')):
                el = time.time() - t0
                st = json.loads(await whole(STATE))
                if el - last_log >= 5:
                    last_log = el
                    log(f'  {el:5.1f}s', json.dumps(st, ensure_ascii=False))
                if rec_t0 and time.time() - rec_t0 >= REC:
                    await rec_stop(rec_name)
                    rec_t0 = 0.0
                    if ROAM:
                        break
                    continue
                seen_alive = seen_alive or st.get('alive', 0) > 0
                if st.get('dead') or (not ROAM and not rec_t0 and seen_alive and st.get('alive', 1) == 0):
                    break
                if compare_at and el >= compare_at[0] and st.get('alive', 0) > 0:
                    await compare(f'开打{int(compare_at.pop(0))}秒')
                    continue
                if shots_at and el >= shots_at[0]:
                    await shot(f'real_{int(shots_at.pop(0)):02d}s')
                    continue
                await asyncio.sleep(0.4)
            if rec_t0:
                await rec_stop(rec_name)
            log('auto', await whole(AUTO_OFF))
            await asyncio.sleep(2.5)       # 等击杀上报和「本轮战果」
            log('end', await whole(STATE))
            await shot('real_打完')
            log('units', await js("return JSON.stringify(F ? F.info() : null);"))

        return errors


async def main():
    profile = os.path.join(base.SCRATCH, 'f3d_field_browser_profile')
    gpu = os.environ.get('QA_GPU', '1')
    if gpu == '0':
        flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    elif gpu == 'low':
        flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_low_power_gpu']
    else:
        flags = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
                             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--window-size=1920,1080',
                             '--autoplay-policy=no-user-gesture-required'] + flags + ['about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        errors = await run(base.PORT)
        log('控制台报错 / 异常:', len(errors or []))
        for e in (errors or [])[:40]:
            log('  ', e)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        try:
            import edge_guard
            edge_guard.kill_profiles([profile])
        except Exception:  # noqa: BLE001
            pass


if __name__ == '__main__':
    asyncio.run(main())
