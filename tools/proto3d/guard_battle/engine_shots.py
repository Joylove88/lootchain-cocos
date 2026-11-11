# -*- coding: utf-8 -*-
"""守卫战 3D 光影层(引擎里的技术验证):在 Creator 预览里进一局守卫战,开 / 关 3D 层截图、测每帧耗时。

进战场 / 登录 / 截图这一套直接复用 tools/qa/battle_polish_shots.py(它的自定义步骤机制),这里只负责:
- 自己起无头 Edge(可以选核显:QA_GPU=low;软件渲染:QA_GPU=0),独立调试端口 9362 + 独立配置目录,退出时清残留;
- 提供几组现成的步骤(--plan=look|bench|skills),也可以 --steps=自己的 json。

用法(PYTHONIOENCODING=utf-8,Creator 预览要开着):
  python tools/proto3d/guard_battle/engine_shots.py <输出目录> [pc|phone] [--plan=look|bench|skills] [--steps=xx.json]
"""
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
QA = os.path.normpath(os.path.join(HERE, '..', '..', 'qa'))
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'g3d_engine')
VIEW = ARGS[1] if len(ARGS) > 1 else 'pc'
PLAN = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--plan=')), 'look')
STEPS = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--steps=')), '')

# 每帧耗时:暂停着一帧一帧推(cc.game.step),每帧后读回一个像素强制显卡把活干完
BENCH = ("const gl = cc.director.root.device.gl; const px = new Uint8Array(4);"
         " const run = (n) => { const ts = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); cc.game.step(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }"
         " ts.sort((a, b) => a - b); return { avg: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2), median: +ts[ts.length >> 1].toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2) }; };")
ON = "window.__g3d.toggle(true); for (let i = 0; i < 60 && !window.__g3d.info().on; i++) await sleep(100); cc.game.step(); cc.game.step();"   # 着色器是按需加载的,等它接上
OFF = "window.__g3d.toggle(false); await sleep(100); cc.game.step(); cc.game.step();"
# 放一个水晶法术并在 wait 毫秒后定格
SPELL = ("cc.game.resume(); const id = '%s'; if (sim.spellLoadout.indexOf(id) < 0) { sim.spellLoadout = [id].concat(sim.spellLoadout.filter(x => x !== id)).slice(0, Math.max(1, sim.spellSlots || 2));"
         " sim.unlockedSpells = Array.from(new Set((sim.unlockedSpells || []).concat([id]))); try { r.renderSpellBar(); } catch (e) {} }"
         " alive().forEach((m, k) => { m.x = 3.4 + (k %% 5) * 0.5; m.speedCellsPerSec = 0; m.hp = 9e8; m.maxHp = 9e8; }); sim.spellEnergy = sim.spellEnergyMax || 150; const m0 = alive()[0];"
         " const ok = M.guardCastSpell(sim, id, m0 ? { lane: m0.lane, x: m0.x } : { lane: 0, x: 4 }); await sleep(%d); cc.game.pause(); return JSON.stringify({ id, ok, g3d: window.__g3d.info() });")

PLANS = {
    # 看一眼:确认模块加载了、3D 层接上了,同一帧开 / 关各截一张
    'look': [
        {'js': "return window.__g3d ? JSON.stringify(window.__g3d.info()) : 'no __g3d(模块没加载)';"},
        {'js': OFF + " return 'off';", 'shot': 'g3d_00_关'},
        {'js': ON + " return JSON.stringify(window.__g3d.info());", 'shot': 'g3d_01_开'},
    ],
    # 测耗时:同一个定格画面,3D 层开 / 关各测 150 帧;再测有技能光时
    'bench': [
        {'js': ON + BENCH + " run(30); const on = run(150); " + OFF + " run(30); const off = run(150); " + ON
               + " for (let i = 0; i < 3; i++) window.__g3d.pulse(r.xToPx(3 + i * 1.5), r.walkwayY(), [1, 0.7, 0.4], 120, 12, 600, 1, 2); run(10); const lit = run(150);"
               + " const cv = cc.game.canvas; return JSON.stringify({ canvas: [cv.width, cv.height], g3dOff: off, g3dOn: on, g3dOnWith3Lights: lit, info: window.__g3d.info() });"},
    ],
    # 技能光:神雷 / 冰封 / 震荡 + 一个英雄战技和大招
    'skills': [
        {'js': ON + " return JSON.stringify(window.__g3d.info());", 'shot': 'g3d_10_平时'},
        {'js': SPELL % ('thunder', 110), 'shot': 'g3d_11_神雷'},
        {'js': "cc.game.resume(); await sleep(2500); return 1;"},
        {'js': SPELL % ('frost', 700), 'shot': 'g3d_12_冰封'},
        {'js': "cc.game.resume(); await sleep(3000); return 1;"},
        {'js': SPELL % ('quake', 400), 'shot': 'g3d_13_震荡'},
        {'js': "cc.game.resume(); await sleep(2500); return 1;"},
        {'cast': {'idx': 0, 'ult': False}, 'shot': 'g3d_14_战技'},
        {'js': "cc.game.resume(); await sleep(2500); return 1;"},
        {'cast': {'idx': 1, 'ult': True}, 'shot': 'g3d_15_大招'},
        {'js': OFF + " return 'off';", 'shot': 'g3d_16_大招_关3D同一帧'},
    ],
}

os.makedirs(OUT, exist_ok=True)
steps_file = STEPS
if not steps_file:
    steps_file = os.path.join(tempfile.gettempdir(), 'lootchain-qa', f'g3d_steps_{PLAN}.json')
    os.makedirs(os.path.dirname(steps_file), exist_ok=True)
    json.dump(PLANS[PLAN], open(steps_file, 'w', encoding='utf-8'), ensure_ascii=False)

os.environ.setdefault('EDGE_PORT', '9362')
sys.path.insert(0, QA)
sys.argv = [sys.argv[0], OUT, VIEW, '--only=guard', f'--steps={steps_file}']
import battle_polish_shots as bps  # noqa: E402  (会按上面的 argv 读输出目录 / 视口 / 步骤)
base = bps.base


async def main():
    profile = os.path.join(base.SCRATCH, 'g3d_engine_browser_profile')
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
        for attempt in range(3):
            try:
                await bps.run_view(VIEW, base.PORT)
                break
            except bps.Reloaded as e:
                print(VIEW, f'page reloaded at {e}, retry {attempt + 1}', flush=True)
                await asyncio.sleep(20)
    finally:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
        try:
            import edge_guard
            edge_guard.kill_profiles([profile])
        except Exception:  # noqa: BLE001
            pass


if __name__ == '__main__':
    asyncio.run(main())
