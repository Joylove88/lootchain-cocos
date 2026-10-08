# -*- coding: utf-8 -*-
"""无头 Edge:专属大招放大自验(2026-10-01)——逐个英雄触发 战技 / 大招,大招出现后定格截图,并回报特效节点缩放与亮核上屏尺寸。
用法:PREVIEW_PORT=7456 python ult_size_cdp.py <tag> [--codes A,B,...] [--skills]"""
import asyncio, base64, json, os, sys, time, subprocess, urllib.request
import websockets
import boss_bar_cdp as base
import fxv2_battle_cdp as fx

TAG = next((a for a in sys.argv[1:] if not a.startswith('--')), 'ultsz')
SHOTS = os.path.join(base.SCRATCH, 'shots')
ROLE = {
    'UR_NYX': 'melee', 'SSR_RON': 'melee', 'SR_ABYSS_06': 'melee', 'R_SCOUT_03': 'melee', 'UR_EVELYN': 'control', 'SSR_LIVIA': 'ranged',
    'SR_WITCH_03': 'ranged', 'R_CULT_05': 'ranged', 'UR_AURELIA': 'ranged', 'SR_SNIPER_05': 'ranged', 'R_RANGER_06': 'ranged',
    'UR_ARTHAS': 'melee', 'SSR_MICHAEL': 'melee', 'SR_BLADE_04': 'melee', 'R_PATROL_01': 'melee', 'UR_ATLAS': 'melee', 'SSR_KANE': 'melee',
    'SR_PALADIN_02': 'melee', 'R_GUARD_07': 'melee', 'UR_SERAPHINA': 'support', 'SR_PRIEST_01': 'support', 'R_ACOLY_02': 'support',
}
args = sys.argv[1:]
CODES = (args[args.index('--codes') + 1].split(',') if '--codes' in args else list(ROLE.keys()))
WITH_SKILLS = '--skills' in args


def js_cast(code, ult):
    return r"""(async () => {""" + fx.HELPERS + r"""
  const code = '__CODE__', role = '__ROLE__', ult = __ULT__;
  cc.game.resume();
  // 清场:去掉残留特效,等名额归零
  for (let i = 0; i < 40 && (r.ultFxLive > 0 || r.skillFxLive > 0); i++) await sleep(100);
  let hero = sim.heroes.find(h => h.heroCode === code);
  if (!hero) {
    hero = sim.heroes.find(h => h.role === role) || sim.heroes.find(h => h.role !== 'support') || sim.heroes[0];
    const entry = sim.pool.find(e => e.heroCode === hero.heroCode);
    if (entry) { entry.heroCode = code; entry.role = role; }
    hero.heroCode = code; hero.role = role;
  }
  hero.star = 2; M.guardHeroPerks(sim, code).ultLv = ult ? 1 : 0;
  r.heroFxLastAt.delete(code); r.lastUltDimAt = 0;
  if (sim.monsters.filter(m => !m.dead).length < 3) { for (let k = 0; k < 4; k++) sim.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: sim.timeMs + 40 + k * 30 }); }
  for (let i = 0; i < 40 && sim.monsters.filter(m => !m.dead).length < 3; i++) await sleep(100);
  sim.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 3.6 + (k % 4) * 0.45; m.speedCellsPerSec = 0; m.hp = __KILL__ ? 1 : 999999; m.maxHp = __KILL__ ? 50 : 999999; });
  // 指定施法者格子(下排 = 6..11)
  if (__CELL__ >= 0 && hero.cell !== __CELL__) { const other = sim.heroes.find(h => h.cell === __CELL__); if (other) { other.cell = hero.cell; } hero.cell = __CELL__; }
  await sleep(150);
  const fxBefore = r.fieldNode.children.filter(c => c.name === 'GuardSkillFx').length;
  hero.skillReadyMs = sim.timeMs; hero.skillPendingSinceMs = 0;
  let fired = false, node = null;
  for (let i = 0; i < 200; i++) {
    await sleep(50);
    if (M.guardHeroSkillPending && M.guardHeroSkillPending(sim, hero)) { M.guardCastHeroSkillNow(sim, hero.unitId); }
    const fxs = r.fieldNode.children.filter(c => c.name === 'GuardSkillFx');
    const EXPECT = {"UR_NYX": "hu_098", "SSR_RON": "hu_100", "SR_ABYSS_06": "hu_054", "R_SCOUT_03": "hu_073", "UR_EVELYN": "hu_077", "SSR_LIVIA": "hu_008", "SR_WITCH_03": "hu_018", "R_CULT_05": "hu_035", "UR_AURELIA": "hu_093", "SR_SNIPER_05": "hu_074", "R_RANGER_06": "hu_063", "UR_ARTHAS": "hu_085", "SSR_MICHAEL": "hu_044", "SR_BLADE_04": "hu_065", "R_PATROL_01": "hu_014", "UR_ATLAS": "hu_027", "SSR_KANE": "hu_013", "SR_PALADIN_02": "hu_052", "R_GUARD_07": "hu_028", "UR_SERAPHINA": "hu_067", "SR_PRIEST_01": "hu_049", "R_ACOLY_02": "hu_050"};
    node = fxs.find(c => { const sk = c.getComponent(cc.sp.Skeleton); return sk && sk.skeletonData && c.scale.x !== 1 && (!ult || sk.skeletonData.name === EXPECT[code]); }) || null;
    if (node) { fired = true; break; }
  }
  // 等到亮度峰值时刻再定格(大招按 core_measure 实测 peakT,战技取动画 45%)
  const PEAKS = {"hu_098": 3.621, "hu_100": 6.9, "hu_054": 2.138, "hu_073": 4.57, "hu_077": 1.32, "hu_008": 8.441, "hu_018": 6.515, "hu_035": 2.398, "hu_093": 6.004, "hu_074": 3.12, "hu_063": 5.471, "hu_085": 16.433, "hu_044": 9.75, "hu_065": 4.928, "hu_014": 2.281, "hu_027": 2.506, "hu_013": 4.133, "hu_052": 3.288, "hu_028": 4.852, "hu_067": 6.12, "hu_049": 1.958, "hu_050": 4.96};
  for (let i = 0; i < 80 && node && node.isValid; i++) {
    const sk = node.getComponent(cc.sp.Skeleton); const te = sk && sk.getCurrent && sk.getCurrent(0);
    if (te && te.animation) { const want = ult ? Math.max(0.12, PEAKS[sk.skeletonData.name] ?? te.animation.duration * 0.45) : te.animation.duration * 0.45; if (te.trackTime >= want) break; }
    await sleep(25);
  }
  cc.game.pause();
  let info = null;
  if (node && node.isValid) {
    const sk = node.getComponent(cc.sp.Skeleton);
    info = { data: sk.skeletonData && sk.skeletonData.name, anim: sk.animation, scale: +node.scale.x.toFixed(3), x: Math.round(node.position.x), y: Math.round(node.position.y) };
  }
  const plate = r.fieldNode.children.find(c => c.name.indexOf('GuardUltName_') === 0);
  const dim = r.fieldNode.getChildByName('GuardUltDim');
  return JSON.stringify({ code, role, ult, fired, info, ultLive: r.ultFxLive, skillLive: r.skillFxLive, plate: plate ? plate.getComponent(cc.Label).string : null, dim: !!dim, unit: Math.round(r.unitSize()) });
})()""".replace('__CODE__', code).replace('__ROLE__', ROLE.get(code, 'melee')).replace('__ULT__', 'true' if ult else 'false').replace('__KILL__', 'true' if '--killall' in args else 'false').replace('__CELL__', str(int(args[args.index('--cell') + 1]) if '--cell' in args else -1))


JS_BATTLE2 = r"""(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cc = window.__cc, root = window.__root;
  const find = name => { let f = null; const w = n => { if (f) return; if (n.name === name) { f = n; return; } n.children.forEach(w); }; w(cc.director.getScene()); return f; };
  try { await root.openLobbyBattlePreviewPanel('MAIN_1_1'); } catch (e) { return 'open err ' + e.message; }
  for (let i = 0; i < 20 && root.currentView !== 'battle'; i++) await sleep(500);
  // 进关前的「编队确认」步骤
  for (let k = 0; k < 4 && root.currentView !== 'battle'; k++) {
    const ch = find('BattleChallengeDialogChallengeButton');
    if (ch && ch.activeInHierarchy) { ch.emit(cc.Button.EventType.CLICK, ch.getComponent(cc.Button)); for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(500); continue; }
    const b = find('LobbyAdventureFormationButton');
    if (b) { b.emit(cc.Node.EventType.TOUCH_END); b.emit(cc.Button.EventType.CLICK); }
    for (let i = 0; i < 24 && root.currentView !== 'battle'; i++) await sleep(500);
  }
  const im = await (await fetch('scripting/x/import-map.json', { cache: 'no-store' })).json();
  const mKey = Object.keys(im.imports).find(k => /GuardBattleModel\.ts$/.test(k));
  window.__M = await System.import(mKey);
  let r = root.lobbyGuardBattleRenderer;
  for (let i = 0; i < 60 && !(r && r.sim); i++) { await sleep(500); r = root.lobbyGuardBattleRenderer; }
  window.__gr = r;
  return 'view=' + root.currentView + ' sim=' + !!(r && r.sim) + ' newCode=' + (r && typeof r.pulseUltDim === 'function');
})()"""


def js_leak(code):
    return r"""(async () => {""" + fx.HELPERS + r"""
  cc.game.resume();
  const code = '__CODE__', role = '__ROLE__';
  let hero = sim.heroes.find(h => h.heroCode === code);
  if (!hero) { hero = sim.heroes.find(h => h.role !== 'support') || sim.heroes[0]; const e = sim.pool.find(x => x.heroCode === hero.heroCode); if (e) { e.heroCode = code; e.role = role; } hero.heroCode = code; hero.role = role; }
  hero.star = 2; M.guardHeroPerks(sim, code).ultLv = 1;
  if (sim.monsters.filter(m => !m.dead).length < 3) { for (let k = 0; k < 4; k++) sim.pendingSpawns.unshift({ kind: 'normal', lane: k % 2, atMs: sim.timeMs + 40 + k * 30 }); }
  for (let i = 0; i < 40 && sim.monsters.filter(m => !m.dead).length < 3; i++) await sleep(100);
  sim.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 3.6 + (k % 4) * 0.45; m.speedCellsPerSec = 0; m.hp = 999999; m.maxHp = 999999; });
  if (__CELL__ >= 0 && hero.cell !== __CELL__) { const other = sim.heroes.find(h => h.cell === __CELL__); if (other) { other.cell = hero.cell; } hero.cell = __CELL__; }
  const t0 = performance.now();
  hero.skillReadyMs = sim.timeMs; hero.skillPendingSinceMs = 0;
  const trace = [];
  for (let i = 0; i < 70; i++) {
    await sleep(100);
    if (M.guardHeroSkillPending && M.guardHeroSkillPending(sim, hero)) { M.guardCastHeroSkillNow(sim, hero.unitId); }
    if (i % 5 === 0) {
      const fieldKids = r.fieldNode.children;
      const n = fieldKids.filter(c => c.name === 'GuardSkillFx').map(c => { const sk = c.getComponent(cc.sp.Skeleton); const te = sk && sk.getCurrent && sk.getCurrent(0); const wp = c.worldPosition; return (sk && sk.skeletonData ? sk.skeletonData.name : '?') + '@' + (te ? te.trackTime.toFixed(2) + '/' + (te.animation ? te.animation.duration.toFixed(2) : '?') : 'noTrack') + ' idx=' + fieldKids.indexOf(c) + '/' + fieldKids.length + ' wp=' + Math.round(wp.x) + ',' + Math.round(wp.y) + ' s=' + c.scale.x.toFixed(3) + ' act=' + c.activeInHierarchy + ' col=' + (sk ? sk.color.a : -1) + ' layer=' + c.layer + '/' + r.fieldNode.layer; });
      trace.push(Math.round(performance.now() - t0) + 'ms ult=' + r.ultFxLive + ' skill=' + r.skillFxLive + ' paused=' + cc.game.isPaused() + ' ' + n.join(','));
    }
  }
  return trace.join(' | ');
})()""".replace('__CODE__', code).replace('__ROLE__', ROLE.get(code, 'melee')).replace('__CELL__', str(int(args[args.index('--cell') + 1]) if '--cell' in args else -1))


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={base.PROFILE}',
                             '--no-first-run', '--no-default-browser-check', '--window-size=1600,900',
                             '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                             '--autoplay-policy=no-user-gesture-required', 'about:blank'])
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        req = urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?{base.PAGE}', method='PUT')
        target = json.load(urllib.request.urlopen(req, timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(method, params=None):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': method, 'params': params or {}}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get('id') == my:
                        return msg

            async def ev(expr, timeout=120):
                r = await asyncio.wait_for(call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}), timeout)
                res = r.get('result', {})
                if 'exceptionDetails' in res:
                    return 'EXC: ' + json.dumps(res['exceptionDetails'].get('exception', {}).get('description', res['exceptionDetails']), ensure_ascii=False)[:600]
                return res.get('result', {}).get('value')

            async def snap(name):
                shot = await call('Page.captureScreenshot', {'format': 'png'})
                data = shot.get('result', {}).get('data')
                if data:
                    with open(os.path.join(SHOTS, f'{TAG}_{name}.png'), 'wb') as f:
                        f.write(base64.b64decode(data))

            await call('Emulation.setDeviceMetricsOverride', {'width': 1600, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await asyncio.sleep(10)
            print('boot:', await ev(base.JS_BOOT, 330))
            print('login:', await ev(base.JS_LOGIN, 90))
            print('battle:', (await ev(JS_BATTLE2, 180) or '')[:200])
            print('prep:', (await ev(fx.JS_PREP, 120) or '')[:300])
            if '--help' in args:
                print('help', await ev("(async () => {" + fx.HELPERS + r"""
  r.openBattleSettings(); await sleep(600);
  r.renderSettingsPage(find('GuardSettingsOverlay'), 'help'); await sleep(700);
  const l = find('GuardSettingsHelp_6'); const lab = l && l.getComponent(cc.Label);
  return JSON.stringify({ text: lab && lab.string, size: lab && lab.actualFontSize });
})()""", 60))
                await snap('help')
                return
            if '--thunder' in args:
                print('thunder', await ev("(async () => {" + fx.HELPERS + r"""
  cc.game.resume();
  if (sim.spellLoadout.indexOf('thunder') < 0) { sim.spellLoadout = ['thunder'].concat(sim.spellLoadout.filter(x => x !== 'thunder')).slice(0, Math.max(1, sim.spellSlots)); sim.unlockedSpells = Array.from(new Set(sim.unlockedSpells.concat(['thunder']))); r.renderSpellBar(); }
  sim.spellEnergy = 150;
  const m = sim.monsters.find(x => !x.dead);
  const ok = M.guardCastSpell(sim, 'thunder', m ? { lane: m.lane, x: m.x } : { lane: 0, x: 5 });
  await sleep(500);
  const labels = []; const w = n => { const l = n.getComponent && n.getComponent(cc.Label); if (l && /神雷/.test(l.string)) labels.push(n.name + ':' + l.string); n.children.forEach(w); }; w(cc.director.getScene());
  return JSON.stringify({ ok, labels });
})()""", 60))
                await snap('thunder_cast')
                return
            if '--burst' in args:
                for code in CODES:
                    js = js_cast(code, True).replace('cc.game.pause();', '/*nopause*/')
                    print('burst-cast', (await ev(js.replace("for (let i = 0; i < 80 && node && node.isValid; i++)", "for (let i = 0; i < 0 && node && node.isValid; i++)"), 60) or '')[:200])
                    for k in range(6):
                        await snap(f'burst_{code}_{k}')
                        await asyncio.sleep(0.08)
                return
            if '--leak' in args:
                for code in CODES:
                    print('leak', code, await ev(js_leak(code), 60))
                return
            for code in CODES:
                if WITH_SKILLS:
                    print('skill', await ev(js_cast(code, False), 60))
                    await snap(f'skill_{code}')
                print('ult  ', await ev(js_cast(code, True), 60))
                await snap(f'ult_{code}')
            await ev('window.__cc.game.resume()')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == '__main__':
    asyncio.run(main())
