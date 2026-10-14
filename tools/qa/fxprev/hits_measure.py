# -*- coding: utf-8 -*-
"""近战战技 / 大招特效的"打击时刻"量测(2026-10-14 用户:技能特效里有二次攻击画面,实际只结算一次伤害)。

直接渲染工程已入库的骨骼(assets/resources/spine/effect/<code>),按配置里的动画名与片段窗口每秒采 30 帧,
算每帧亮度(像素 max(RGB)>24 的平方和),平滑后找局部峰值:突出度 >= 全局峰值 22%、间隔 >= 0.28s,最多 4 段;
时刻换算成"特效开播后的真实秒数"(片段起点归零、按播放倍速换算)。
输出 hits_measure.json:{heroCode: {skill: {effect, anim, hits:[秒]}, ult: {...}}},再由人工核对后写进 GuardBattleModel。
用法:python tools/qa/fxprev/hits_measure.py [heroCode ...]
"""
import asyncio, json, os, re, subprocess, sys, time, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
FX = os.path.join(REPO, 'assets', 'resources', 'spine', 'effect')
CFG = os.path.join(REPO, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyBattleSkillEffectConfig.ts')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
CDP, HTTP = 9357, 8771
MELEE = ['UR_NYX', 'SSR_RON', 'SR_ABYSS_06', 'R_SCOUT_03', 'UR_ARTHAS', 'SSR_MICHAEL', 'SR_BLADE_04', 'R_PATROL_01',
         'UR_ATLAS', 'SSR_KANE', 'SR_PALADIN_02', 'R_GUARD_07']
FPS = 30


def parse_specs():
    src = open(CFG, encoding='utf-8').read()

    def table(name):
        body = src[src.index(f'const {name}'):]
        body = body[:body.index('\n};')]
        out = {}
        for m in re.finditer(r"^\s+(\w+): \{ effect: '([^']+)', animation: '([^']+)'[^\n]*", body, re.M):
            line = m.group(0)
            clip = re.search(r'clip: \{ start: ([\d.]+), end: ([\d.]+)(?:, speed: ([\d.]+))?', line)
            out[m.group(1)] = {'effect': m.group(2), 'anim': m.group(3),
                               'clip': [float(clip.group(1)), float(clip.group(2)), float(clip.group(3) or 1)] if clip else None}
        return out
    return table('HERO_GUARD_SKILL_EFFECTS'), table('HERO_ULT_EFFECTS')


JS = r"""
window.brightCurve = async function (name, animName, t0, t1, fps) {
  const SIZE = 384, canvas = document.getElementById('c'), gl = canvas.getContext('webgl');
  const ctx2 = new spine.ManagedWebGLRenderingContext(gl), renderer = new spine.SceneRenderer(canvas, ctx2);
  const am = new spine.AssetManager(ctx2, '/fx42/' + name + '/');
  am.loadBinary(name + '.skel'); am.loadTextureAtlas(name + '.atlas');
  for (let i = 0; i < 3000 && !am.isLoadingComplete(); i++) await new Promise(r => setTimeout(r, 20));
  if (am.hasErrors()) return { error: JSON.stringify(am.getErrors()) };
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(am.require(name + '.atlas'))).readSkeletonData(am.require(name + '.skel'));
  const want = (animName || '').toLowerCase();
  const anim = data.animations.find(a => a.name.toLowerCase() === want) || data.animations.find(a => a.name.toLowerCase().includes(want)) || data.animations[0];
  const skeleton = new spine.Skeleton(data), state = new spine.AnimationState(new spine.AnimationStateData(data));
  state.setAnimation(0, anim.name, false);
  const hid = (window.__hiddenAll || {})[name] || [];
  // 同游戏内 prepareBattleFxData:hu_* 满屏大招去掉角色本体 / 布阵底(附件名无目录或 bz/buzhen/zhu 目录),再按 hide_hu 去插槽
  const isHu = /^hu_/.test(name);
  const filter = () => { for (const slot of skeleton.slots) { const n = slot.data.name; if (hid.some(p => p.endsWith('*') ? n.startsWith(p.slice(0, -1)) : p === n)) { slot.attachment = null; continue; }
    if (!isHu) continue; const a = slot.attachment; if (!a) continue; const an = a.name || ''; const cut = an.indexOf('/'); if (cut < 0 || /^(bz\d*|buzhen|zhu)$/i.test(an.slice(0, cut))) slot.attachment = null; } };
  const pose = t => { state.getCurrent(0).trackTime = t; state.apply(skeleton); filter(); skeleton.update(0); skeleton.updateWorldTransform(spine.Physics.update); };
  const end = t1 > 0 ? t1 : anim.duration;
  const times = []; for (let t = t0; t <= end + 1e-6; t += 1 / fps) times.push(t);
  // 先用顶点包围盒定相机,再逐帧算亮度
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const off = new spine.Vector2(), size = new spine.Vector2();
  for (const t of times) { pose(t); skeleton.getBounds(off, size, []); if (size.x > 0 && size.y > 0 && isFinite(off.x)) { x0 = Math.min(x0, off.x); y0 = Math.min(y0, off.y); x1 = Math.max(x1, off.x + size.x); y1 = Math.max(y1, off.y + size.y); } }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, zoom = Math.max(x1 - x0, y1 - y0, 100) * 1.05 / SIZE;
  const buf = new Uint8Array(SIZE * SIZE * 4), sums = [];
  for (const t of times) { pose(t);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    renderer.camera.position.set(cx, cy, 0); renderer.camera.zoom = zoom; renderer.camera.setViewport(SIZE, SIZE);
    renderer.begin(); renderer.drawSkeleton(skeleton, false); renderer.end();
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let s = 0; for (let i = 0; i < buf.length; i += 4) { const m = Math.max(buf[i], buf[i + 1], buf[i + 2]); if (m > 24) s += m * m; }
    sums.push(s); }
  am.dispose();
  return { anim: anim.name, duration: anim.duration, t0, t1: end, sums };
};
"""


def find_hits(sums, t0, speed):
    """打击 = 亮度"突然上升":当前帧 >= 前 0.2s 内谷底的 1.45 倍(且至少高出全局峰值 1%),
    取起涨后 0.3s 内的最亮帧为打击时刻;打击间隔 >= 0.35s,最多 4 段(大招满屏特效里,前几段打击的绝对亮度
    常只有收尾大爆炸的 1/10,按峰值找会被压掉,所以按相对涨幅找)。"""
    if not sums or max(sums) <= 0:
        return [0.0]
    sm = [(sums[max(0, i - 1)] + 2 * sums[i] + sums[min(len(sums) - 1, i + 1)]) / 4 for i in range(len(sums))]
    peak = max(sm)
    win = max(2, int(FPS * 0.2))
    hits, i = [], 1
    while i < len(sm):
        base = min(sm[max(0, i - win):i])
        if sm[i] >= peak * 0.04 and sm[i] >= base * 1.45 + peak * 0.01:
            j_end = min(len(sm), i + int(FPS * 0.3) + 1)
            j = max(range(i, j_end), key=lambda k: sm[k])
            if not hits or (j - hits[-1]) / FPS >= 0.35:
                hits.append(j)
            i = j + 1
            continue
        i += 1
    if not hits:
        hits = [sm.index(peak)]
    if len(hits) > 4:
        hits = sorted(sorted(hits, key=lambda k: -sm[k])[:4])
    return [round(k / FPS / speed, 2) for k in hits]


async def main():
    skill_specs, ult_specs = parse_specs()
    only = set(sys.argv[1:])
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(HTTP)], env=dict(os.environ, FX_ROOT=FX))
    prof = os.path.join(os.environ.get('TEMP', HERE), 'lootchain-qa', 'edge_hits_profile')
    proc = subprocess.Popen([EDGE, '--headless=new', f'--remote-debugging-port={CDP}', f'--user-data-dir={prof}',
                             '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    out = {}
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{CDP}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        target = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{CDP}/json/new?http://127.0.0.1:{HTTP}/index.html', method='PUT'), timeout=5))
        async with websockets.connect(target['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def ev(expr):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True}}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), 300))
                    if msg.get('id') == my:
                        res = msg.get('result', {})
                        return {'error': str(res['exceptionDetails'])[:300]} if 'exceptionDetails' in res else res.get('result', {}).get('value')

            for _ in range(100):
                if await ev('!!window.__ready'):
                    break
                await asyncio.sleep(0.2)
            await ev('window.__hiddenAll = ' + json.dumps(json.load(open(os.path.join(HERE, 'hide_hu.json')))) + '; 1')
            await ev(JS)
            for hero in MELEE:
                if only and hero not in only:
                    continue
                row = {}
                for kind, spec in (('skill', skill_specs.get(hero)), ('ult', ult_specs.get(hero))):
                    if not spec:
                        continue
                    t0, t1, speed = spec['clip'] if spec['clip'] else (0.0, 0.0, 1.0)
                    r = await ev(f"brightCurve({json.dumps(spec['effect'])}, {json.dumps(spec['anim'])}, {t0}, {t1}, {FPS})")
                    if not r or 'error' in r:
                        row[kind] = {'effect': spec['effect'], 'error': (r or {}).get('error')}
                        continue
                    # 在归一化(保留两位)曲线上找打击:原始平方和的微小抖动会让阈值判定忽上忽下
                    curve = [round(v / max(1, max(r['sums'])), 2) for v in r['sums']]
                    hits = find_hits(curve, t0, speed)
                    row[kind] = {'effect': spec['effect'], 'anim': r['anim'], 'window': [t0, r['t1']], 'speed': speed,
                                 'hits': hits, 'curve': curve}
                    print(hero, kind, spec['effect'], 'hits', hits, flush=True)
                out[hero] = row
    finally:
        proc.terminate()
        srv.terminate()
    path = os.path.join(HERE, 'hits_measure.json')
    prev = json.load(open(path, encoding='utf-8')) if os.path.exists(path) and only else {}
    prev.update(out)
    json.dump(prev, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


asyncio.run(main())
