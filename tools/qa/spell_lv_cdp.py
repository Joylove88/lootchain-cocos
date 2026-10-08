# -*- coding: utf-8 -*-
"""无头 Edge:docs/39 法术等级战场自验——同一局里把 6 个法术分别按 Lv1 / Lv3 / Lv5 施放并截图(神雷 / 震荡 Lv5 加拍追加效果)。
用法:PREVIEW_PORT=7456 python spell_lv_cdp.py <tag> [--spells quake,thunder] [--levels 1,3,5]"""
import asyncio, base64, json, os, sys, time, subprocess, urllib.request
import websockets
import boss_bar_cdp as base
import fxv2_battle_cdp as fx
import ult_size_cdp as us

TAG = next((a for a in sys.argv[1:] if not a.startswith('--')), 'splv')
args = sys.argv[1:]
SPELLS = args[args.index('--spells') + 1].split(',') if '--spells' in args else ['quake', 'frost', 'thunder', 'goldrush', 'aegis', 'warhorn']
LEVELS = [int(v) for v in args[args.index('--levels') + 1].split(',')] if '--levels' in args else [1, 3, 5]
SHOTS = os.path.join(base.SCRATCH, 'shots')
# 截图时刻(秒,施放后):主效果 / 追加效果
WAIT = {'quake': 0.32, 'frost': 0.45, 'thunder': 0.3, 'goldrush': 0.55, 'aegis': 0.5, 'warhorn': 0.45}
if '--wait' in args:
    _w = float(args[args.index('--wait') + 1])
    WAIT = {k: _w for k in WAIT}
ECHO = {'quake': 1.45, 'thunder': 1.0}


def js_cast(spell, lv, wait, echo):
    return "(async () => {" + fx.HELPERS + r"""
  cc.game.resume();
  const id = '__ID__', lv = __LV__;
  await sleep(2500);
  sim.paused = false; if (sim.pendingChoice) M.guardSkipChoice(sim);
  if (sim.unlockedSpells.indexOf(id) < 0) sim.unlockedSpells = sim.unlockedSpells.concat([id]);
  if (sim.spellLoadout.indexOf(id) < 0) { sim.spellLoadout = [id].concat(sim.spellLoadout.filter(x => x !== id)).slice(0, Math.max(3, sim.spellSlots)); }
  sim.spellLevels[id] = lv; r.renderSpellBar();
  sim.spellEnergy = sim.spellEnergyMax; sim.goldrushWave = -1; sim.aegisUntilMs = 0; sim.warhornUntilMs = 0;
  if (sim.phase !== 'wave') { sim.phase = 'wave'; }
  const alive0 = sim.monsters.filter(m => !m.dead);
  if (alive0.length < 8) { for (let k = 0; k < 10 - alive0.length; k++) sim.pendingSpawns.unshift({ kind: k === 0 ? 'elite' : 'normal', lane: k % 2, atMs: sim.timeMs + 30 + k * 20 }); }
  for (let i = 0; i < 40 && sim.monsters.filter(m => !m.dead).length < 8; i++) await sleep(100);
  sim.monsters.filter(m => !m.dead).forEach((m, k) => { m.x = 3.2 + (k % 5) * 0.55; m.speedCellsPerSec = 0; m.hp = 9999999; m.maxHp = 9999999; m.stunnedUntilMs = 0; });
  await sleep(250);
  const tgt = sim.monsters.filter(m => !m.dead).sort((a, b) => a.x - b.x)[2] || sim.monsters.find(m => !m.dead);
  const ok = M.guardCastSpell(sim, id, tgt ? { lane: tgt.lane, x: tgt.x } : { lane: 0, x: 4 });
  await sleep(__WAIT__);
  cc.game.pause();
  return JSON.stringify({ id, lv, ok, level: sim.spellLevels[id], pending: sim.spellPending.length, floors: sim.frostFloors.length, gold: sim.gold });
})()""".replace('__ID__', spell).replace('__LV__', str(lv)).replace('__WAIT__', str(int(wait * 1000)))


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
            print('battle:', (await ev(us.JS_BATTLE2, 180) or '')[:200])
            print('prep:', (await ev(fx.JS_PREP, 120) or '')[:200])
            for spell in SPELLS:
                for lv in LEVELS:
                    print(spell, lv, await ev(js_cast(spell, lv, WAIT[spell], False), 90))
                    await snap(f'{spell}_lv{lv}')
                    if lv == 5 and spell in ECHO:
                        await ev('(async () => { window.__cc.game.resume(); await new Promise(r => setTimeout(r, %d)); window.__cc.game.pause(); return 1; })()' % int((ECHO[spell] - WAIT[spell]) * 1000))
                        await snap(f'{spell}_lv{lv}_echo')
            await ev('window.__cc.game.resume()')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == '__main__':
    asyncio.run(main())
