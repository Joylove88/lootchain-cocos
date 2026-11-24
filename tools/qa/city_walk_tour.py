# -*- coding: utf-8 -*-
"""手绘主城整城实走巡查(2026-11-24 用户:「人物到这个位置不能往下了」「需要你全量全图跑测试」)。

  python tools/qa/city_walk_tour.py [--release] [--only 走遍,出城,地图]
  默认编辑器预览 7456(改完 asset-db/refresh、等 chunk 更新;每次 --fresh 新配置);--release = 本地正式包 7460。
  账号 guidetest05 / pass1234(本地库测试号)。

走遍:从出生点按「最近的下一个」顺序,用游戏自己的寻路真走到每个地点 / NPC(不瞬移),每到一处截图;
      NPC 旁边看有没有「对话 · 名字」按钮;离目标 > 目标半径、或 60 秒没走到 = 有问题。
出城:模拟按住方向键 / 推摇杆(不用寻路)从城门口几个位置往门里走,应在几秒内换到对面的图(南门 → 林地、东门 → 荒原)。
地图:打开地图页截图(新鸟瞰图、地点图标)。
产物:%TEMP%/lootchain-qa/city_walk_tour/NN_*.png + log.jsonl;终端打印每步结果。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import field_walk_regress as F  # noqa: E402  登录 / 进图 / 瞬移 / 寻路走到底

QA = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
OUT = os.path.join(QA, 'city_walk_tour')

# 走到下一个目标(按名字找:地点 / NPC);NPC 再看交互按钮
VISIT = F.C + r"""
await enter('CITY'); refresh();
const want = %(target)s;
const list = [...t.def.places.map(p => ({ kind: '地点', name: p.name, x: p.x, y: p.y, near: 140 })),
  ...t.def.npcs.map(n => ({ kind: 'NPC', name: n.name, code: n.code, x: n.x, y: n.y - 60, near: 160 }))];
const g = list.find(v => v.kind === want[0] && v.name === want[1] && (!want[2] || v.code === want[2]));
if (!g) return '找不到目标 ' + JSON.stringify(want);
const r = await walk(null, null, g.x, g.y, g.kind + ' ' + g.name, 60);
await sleep(900); refresh();
if (t.def.code !== 'CITY') return r + ' | 走进出口,已换到 ' + t.def.code;   // 城门处的地点就在出口圈里:走到 = 出城
const d = Math.round(Math.hypot(t.leader.x - g.x, t.leader.y - g.y));
let talk = '';
if (g.kind === 'NPC') { const key = g.name.split(' · ').pop(); const b = [...buttons(60), ...texts(80)].filter(s => s.includes('对话') && s.includes(key)); talk = ' | 交互按钮 ' + (b.length ? JSON.stringify(b[0]) : '无'); }
return (d > g.near ? '【没走到】' : '') + r + talk;"""

# 按住方向(不寻路)往城门里走;ox, oy = 起点;dir = [dx, dy](摇杆方向,y 向上为正)
PUSH = F.C + r"""
await enter('CITY'); await sleep(600); refresh(); t.exitCooldownUntil = 0;
warp(%(x)s, %(y)s); await sleep(1600); refresh(); t.exitCooldownUntil = 0;
const p0 = P(t.leader); const t0 = Date.now();
t.joy.active = true; t.joy.dx = %(dx)s; t.joy.dy = %(dy)s;
let left = 'CITY'; let last = { x: t.leader.x, y: t.leader.y }, still = 0;
for (let i = 0; i < 40 && t.def.code === 'CITY'; i++) { await sleep(200); refresh(); if (t.def.code !== 'CITY') break;
  if (Math.hypot(t.leader.x - last.x, t.leader.y - last.y) < 2) still++; else still = 0; last = { x: t.leader.x, y: t.leader.y }; if (still >= 8) break; }
t.joy.active = false; t.joy.dx = 0; t.joy.dy = 0;
for (let i = 0; i < 20 && t.def.code === 'CITY'; i++) { await sleep(250); refresh(); }
const sec = ((Date.now() - t0) / 1000).toFixed(1);
return '%(tag)s | 起点 ' + p0 + ' | ' + (t.def.code !== 'CITY' ? '换到 ' + t.def.code + '(' + sec + 's)' : '【没出城】停在 ' + P(t.leader) + ' 卡住 ' + (still >= 8));"""

MAP = F.C + r"""
await enter('CITY'); await sleep(800); refresh();
const before = root.currentView;
try { root.run(async () => root.openAreaMapPanel()); } catch (e) { return 'open map failed ' + e; }
await sleep(3500); refresh();
return 'view ' + before + ' → ' + root.currentView + ' | 文字 ' + JSON.stringify(texts(30).slice(0, 12));"""


def order_targets(d):
    """出生点起,每次去最近的下一个(地点 + NPC)。"""
    pts = [('地点', p['name'], '', p['x'], p['y']) for p in d['places']]
    pts += [('NPC', n['name'], n['code'], n['x'], n['y'] - 60) for n in d['npcs']]
    cur = (d['spawn']['x'], d['spawn']['y'])
    out = []
    while pts:
        k = min(range(len(pts)), key=lambda i: (pts[i][3] - cur[0]) ** 2 + (pts[i][4] - cur[1]) ** 2)
        p = pts.pop(k)
        out.append(p)
        cur = (p[3], p[4])
    return out


def main():
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else ['走遍', '出城', '地图']
    from walk_map_overlay import dump_maps
    d = dump_maps()['CITY']
    os.makedirs(OUT, exist_ok=True)
    steps = [{'label': '登录', 'js': F.LOGIN, 'wait': 0, 'shot': False}]
    if '走遍' in only:
        for kind, name, code, _, _ in order_targets(d):
            steps.append({'label': f'{kind}_{name}', 'js': VISIT % {'target': json.dumps([kind, name, code], ensure_ascii=False)},
                          'wait': 0, 'shot': True, 'timeout': 120})
    if '出城' in only:
        south = next(e for e in d['exits'] if e['key'] == 'to_woods')
        east = next(e for e in d['exits'] if e['key'] == 'to_gray')
        for k, dx in enumerate((-140, 0, 140)):
            steps.append({'label': f'南门按下_{k}', 'js': PUSH % {'x': round(south['x'] + dx), 'y': round(south['y'] + 300), 'dx': 0, 'dy': -1,
                                                                    'tag': f'南门 按住下 偏移 {dx}'}, 'wait': 0, 'shot': True, 'timeout': 90})
        for k, (ox, oy) in enumerate(((-360, -260), (-420, -120), (-300, -360))):
            vx, vy = -ox, -oy
            n = (vx * vx + vy * vy) ** 0.5
            steps.append({'label': f'东门推向门_{k}', 'js': PUSH % {'x': round(east['x'] + ox), 'y': round(east['y'] + oy), 'dx': round(vx / n, 3), 'dy': round(vy / n, 3),
                                                                     'tag': f'东门 从 ({ox},{oy}) 推向门'}, 'wait': 0, 'shot': True, 'timeout': 90})
    if '地图' in only:
        steps.append({'label': '地图页', 'js': MAP, 'wait': 0, 'shot': True, 'timeout': 60})
    sp = os.path.join(OUT, 'steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    env = dict(os.environ)
    if '--release' in sys.argv:
        env.setdefault('PREVIEW_PORT', '7460')
        env.setdefault('PT_PROFILE', 'playtest_profile_citytour_rel')
    else:
        env.setdefault('PREVIEW_PORT', '7456')
        env.setdefault('PT_PROFILE', 'playtest_profile_citytour')
    env.setdefault('EDGE_PORT', '9391')
    proc = subprocess.Popen([sys.executable, os.path.join(HERE, 'playtest_cdp.py'), OUT, sp, '--fresh', '--pc'], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    bad = 0
    for line in proc.stdout:
        line = line.rstrip('\n')
        if line.startswith('{'):
            try:
                r = json.loads(line)
                res = str(r['result'])
                bad += ('【' in res) or ('交互按钮 无' in res)
                print(f"== {r['step']} {r['sec']}s | {res}")
                continue
            except Exception:
                pass
        print(line[:400])
    proc.wait()
    print('有问题的步骤:', bad)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
