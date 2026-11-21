# -*- coding: utf-8 -*-
"""3D 小样技能逐帧录像(2026-11-22,大招演出对比):无头 Edge 打开地址,等就绪后把主角传到怪旁边、怪锁血,
暂停游戏后放技能,再一帧一帧推进(固定步长,慢镜 / 特效时间完全确定)、每帧截图,最后用 ffmpeg 合成 mp4。
改前 / 改后用同一个脚本、同样的参数录,时间轴严格对齐。

用法:python tools/qa/g3d_skill_video.py "<地址>" <标签> [--skill=smash] [--seq=attack,attack] [--gap=14] [--frames=80] [--fps=30] [--size=1280x720] [--pre=8]
     --pre = 放技能前先推进几帧(让镜头和怪站稳)。QA_GPU=low 用本机 AMD 核显。
输出 %TEMP%/lootchain-qa/video/<标签>.mp4(帧图在同名目录)。跑完按配置目录清掉 Edge。"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websockets

os.environ.setdefault('EDGE_PORT', '9372')
import boss_bar_cdp as base  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
URL, TAG = ARGS[0], ARGS[1]
SKILL = OPT.get('skill', 'smash')
FRAMES = int(OPT.get('frames', '80'))
FPS = int(OPT.get('fps', '30'))
PRE = int(OPT.get('pre', '8'))
W, H = (int(x) for x in OPT.get('size', '1280x720').split('x'))
OUT = os.path.join(base.SCRATCH, 'video')
FRAME_DIR = os.path.join(OUT, TAG)
os.makedirs(FRAME_DIR, exist_ok=True)
FFMPEG = shutil.which('ffmpeg') or 'ffmpeg'
JS_READY = r"""(() => { const d = window.__g3dd; if (!d) return 'nodbg'; const i = d.info(); const g = d.dungeon || {};
  if (i.error) return 'error ' + i.error; if (!i.opened || !g.leader) return 'wait'; if (g.bldTotal && g.bldDone < g.bldTotal) return 'bld'; return 'ok'; })()"""
JS_SETUP = (r"""(() => { const OPEN_SEARCH = __OPEN__; const g = __g3dd.dungeon; Object.keys(g.cd).forEach((k) => { g.cd[k] = 0; });
  // 主角原地(出生点一般是空地),转到和镜头同一个朝向(镜头在背后);前方两米多摆三只怪,都锁血
  // 找一块开阔地:主角附近 ±30 米每 2 米一个点、8 个方向,要求前方空出 9 米以上(剑气斩会撞障碍提前散)、身后留镜头的位置;找不到就用原地最空的方向
  const free = (x, z, dx, dz, max) => { let d = 0; while (d < max && !g.blocked(x + dx * (d + 0.5), z + dz * (d + 0.5), 0.3)) { d += 0.5; } return d; };
  let best = -1; let bx = g.lx; let bz = g.lz; let bfx = 1; let bfz = 0;
  const near = OPEN_SEARCH ? 30 : 0;
  for (let ox = -near; ox <= near; ox += 2) {
    for (let oz = -near; oz <= near; oz += 2) {
      const x = g.lx + ox; const z = g.lz + oz;
      if (g.blocked(x, z, 0.6)) { continue; }
      for (let k = 0; k < (near ? 8 : 16); k += 1) {
        const ang = (k / (near ? 8 : 16)) * Math.PI * 2; const dx = Math.cos(ang); const dz = Math.sin(ang);
        const f = free(x, z, dx, dz, 11); const back = free(x, z, -dx, -dz, 7);
        const score = Math.min(f, 9) * 2 + back - Math.hypot(ox, oz) * 0.02;
        if (score > best) { best = score; bx = x; bz = z; bfx = dx; bfz = dz; }
      }
    }
  }
  if (bx !== g.lx || bz !== g.lz) { __g3dd.tp(bx, bz); }
  const camYaw = (Math.atan2(-bfx, -bfz) * 180) / Math.PI;
  if (__g3dd.view) { __g3dd.view({ dist: 6.6, pitch: 16, yaw: camYaw }); }
  const a = (g.view.yaw * Math.PI) / 180; const fx = -Math.sin(a); const fz = -Math.cos(a);
  const yaw = (Math.atan2(-fz, fx) * 180) / Math.PI; __g3dd.tp(g.lx, g.lz, yaw);
  // 小怪优先(熊站在落点上会把特效挡住),摆在前方三米多
  const small = (m) => ['rat', 'wolf', 'spider2'].indexOf(m.c.name) >= 0;
  const ms = g.mobs.filter((m) => m.hp > 0 && small(m)).concat(g.mobs.filter((m) => m.hp > 0 && !small(m))).slice(0, 3);
  g.mobs.forEach((m) => { if (ms.indexOf(m) < 0) { m.x += 30; m.z += 30; m.home = { x: m.x, z: m.z }; } });
  // 放招会自动转向 3.4 米内最近的怪:正前方 3 米摆一只当目标,另两只放到 5.5 米外左右(免得侧面那只先凑近、把主角拐歪)
  ms.forEach((m, i) => { m.hp = 999; const fwd = i === 0 ? 3.0 : 5.5; const side = i === 0 ? 0 : (i === 1 ? -1.4 : 1.4); m.x = g.lx + fx * fwd - fz * side; m.z = g.lz + fz * fwd + fx * side; m.home = { x: m.x, z: m.z }; });
  g.mobs.forEach((m) => { m.hp = 999; });
  __g3dd.pause(true); return ms.length; })()""").replace('__OPEN__', 'true' if OPT.get('open') == '1' else 'false')


async def main():
    profile = os.path.join(base.SCRATCH, 'vid_profile_' + TAG)
    shutil.rmtree(profile, ignore_errors=True)
    for f in os.listdir(FRAME_DIR):
        os.remove(os.path.join(FRAME_DIR, f))
    flags = ['--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
             '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', f'--window-size={W},{H}',
             '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio']
    if os.environ.get('QA_GPU') == 'low':
        flags.append('--force_low_power_gpu')
    proc = subprocess.Popen([base.EDGE] + flags + ['about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(t['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=120):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(expr):
                r = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
                res = r.get('result', {})
                if 'exceptionDetails' in res:
                    raise RuntimeError(json.dumps(res['exceptionDetails'], ensure_ascii=False)[:500])
                return res.get('result', {}).get('value')

            await call('Runtime.enable')
            await call('Page.enable')
            await call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 1, 'mobile': False})
            await call('Page.navigate', {'url': URL})
            t0 = time.time()
            st = ''
            while time.time() - t0 < 600:
                await asyncio.sleep(3)
                st = await ev(JS_READY)
                if st == 'ok' or str(st).startswith('error'):
                    break
            print('ready', st, round(time.time() - t0), 's', flush=True)
            await asyncio.sleep(6)
            print('setup mobs', await ev(JS_SETUP), flush=True)
            dt = 1.0 / FPS
            await ev(f'__g3dd.step({dt}, {PRE})')
            # --seq=attack,attack,attack:每隔 --gap 帧放下一招(普攻连段);不给 = 只放 --skill 一招
            skills = OPT.get('seq', SKILL).split(',')
            gap = int(OPT.get('gap', '14'))
            await ev(f"__g3dd.skill('{skills[0]}')")
            for i in range(FRAMES):
                if i > 0 and i % gap == 0 and i // gap < len(skills):
                    await ev(f"__g3dd.skill('{skills[i // gap]}')")
                await ev(f'__g3dd.step({dt}, 1)')
                m = await call('Page.captureScreenshot', {'format': 'png'})
                open(os.path.join(FRAME_DIR, f'f{i:04d}.png'), 'wb').write(base64.b64decode(m['result']['data']))
            await ev('__g3dd.pause(false)')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            proc.kill()
        try:
            import edge_guard
            edge_guard.kill_profiles([profile])
        except Exception:  # noqa: BLE001
            pass
    mp4 = os.path.join(OUT, f'{TAG}.mp4')
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(FRAME_DIR, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4], check=True)
    print('VIDEO', mp4, flush=True)


asyncio.run(main())
