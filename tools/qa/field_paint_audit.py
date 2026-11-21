# -*- coding: utf-8 -*-
"""野外整图重绘的跑图自查(2026-11-21 用户:「好了后,你需要自己控制角色跑遍整体地图,优化调整不合理的地方」)。

  python tools/qa/field_paint_audit.py WOODS walk      # 游戏里用摇杆输入沿每条路走 + 横扫整张图,每 5 秒截一帧,记卡住的位置
  python tools/qa/field_paint_audit.py WOODS overlay   # 游戏里导出可走格 + 遮挡件,叠到重绘整图上(红 = 不可走,青 = 遮挡件轮廓)
  python tools/qa/field_paint_audit.py WOODS sheet     # walk 截图拼成 4×4 联络表,方便过目

产物在 %TEMP%/lootchain-qa/field_audit/<图>/。要求 7456 预览 + 8081 后端在跑。
"""
import base64
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import field_repaint as fr  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'field_audit')
Image.MAX_IMAGE_PIXELS = None
MAX_STEPS = 260

TELEPORT = r"""
const tp = (x, y) => { const all = [t.leader, ...t.followers]; all.forEach((a, i) => { a.x = x - i * 70; a.y = y; a.node.setPosition(a.x, a.y, 0); });
  t.trail = [new cc.Vec2(x - 300, y), new cc.Vec2(x, y)]; t.applyCamera(true); };
"""

SETUP = TELEPORT + r"""
const d = t.def; const wk = d.walk;
const route = [];
// 1) 每条路:跳到起点,沿折线走到底
for (const line of ((d.corridors && d.corridors.lines) || [])) {
  line.forEach((p, i) => route.push({ x: p[0], y: p[1], jump: i === 0, road: true }));
}
// 2) 横扫整张图(行距 1300,行内每 1500 一个点,蛇形)
// 行距 / 点距按地图大小(小图晨风村也要扫到 6 行以上)
const dyRow = Math.min(1300, (wk.top - wk.bottom) / 7), dxPt = Math.min(1500, (wk.right - wk.left) / 9);
const rows = []; for (let y = wk.top - dyRow * 0.4; y > wk.bottom + dyRow * 0.3; y -= dyRow) rows.push(y);
rows.forEach((y, r) => {
  const xs = []; for (let x = wk.left + dxPt * 0.3; x < wk.right - dxPt * 0.2; x += dxPt) xs.push(x);
  if (r % 2) xs.reverse();
  xs.forEach((x, i) => route.push({ x, y, jump: i === 0 }));
});
// 怪全部挪走(只看画面 / 可走,不打架)
(t.monsters || []).forEach(m => { if (m.node) m.node.active = false; m.x = 1e7; m.y = 1e7; });
window.__W = { route, i: 0, stuck: [], px: 0, py: 0, still: 0, shots: 0 };
return 'ROUTE ' + route.length;
"""

DRIVE = TELEPORT + r"""
const W = window.__W; if (!W || W.i >= W.route.length) return 'skip';
(t.monsters || []).forEach(m => { if (m.node) m.node.active = false; m.x = 1e7; m.y = 1e7; });
let el = 0;
while (el < 5000 && W.i < W.route.length) {
  const p = W.route[W.i]; const L = t.leader;
  if (p.jump) { t.joy.active = false; tp(p.x, p.y); W.i++; W.px = p.x; W.py = p.y; W.still = 0; await sleep(400); el += 400; continue; }
  const dx = p.x - L.x, dy = p.y - L.y, dd = Math.hypot(dx, dy);
  if (dd < 90) { W.i++; continue; }
  t.joy.active = true; t.joy.dx = dx / dd; t.joy.dy = dy / dd;
  await sleep(100); el += 100;
  const mv = Math.hypot(L.x - W.px, L.y - W.py); W.px = L.x; W.py = L.y;
  if (mv < 4) { W.still += 100; if (W.still >= 1500) {
    // 卡住:记一次(标上是路上还是横扫),跳到后面第一个能走的点继续
    W.stuck.push([Math.round(L.x), Math.round(L.y), p.x, p.y, p.road ? 1 : 0]); W.still = 0;
    let j = W.i; while (j < W.route.length && !t.walkable(W.route[j].x, W.route[j].y)) j++;
    if (j < W.route.length) { tp(W.route[j].x, W.route[j].y); W.px = W.route[j].x; W.py = W.route[j].y; }
    W.i = j + 1; } } else W.still = 0;
}
t.joy.active = false;
cc.director.pause(); cc.game.step(); const url = cc.game.canvas.toDataURL('image/jpeg', 0.82); cc.director.resume();
W.shots++;
return url;
"""

REPORT = r"""const W = window.__W; return 'REPORT' + JSON.stringify({ n: W.route.length, i: W.i, shots: W.shots, stuck: W.stuck });"""

# 可走格(每 40 单位一格,1 = 能走)+ 遮挡件 / 比人高的立物(脚点 / 显示尺寸 / 贴图路径)
OVERLAY = r"""
const d = t.def; const step = 40; const W = Math.ceil(d.width / step), H = Math.ceil(d.height / step);
const bytes = new Uint8Array(W * H);
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const x = -d.width / 2 + (c + 0.5) * step, y = d.height / 2 - (r + 0.5) * step;
  bytes[r * W + c] = t.walkable(x, y) ? 1 : 0;
}
let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
const occ = t.occluders.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, painted: !!o.painted }));
const props = d.props.map((p, i) => ({ i, asset: p.asset, x: p.x, y: p.y, w: p.width, flip: !!p.flipX, flat: !!p.flat }));
const json = JSON.stringify({ step, W, H, walk: btoa(bin), occ, props, mapW: d.width, mapH: d.height });
return 'data:image/json;base64,' + btoa(unescape(encodeURIComponent(json)));
"""


def out_dir(code):
    d = os.path.join(OUT, code)
    os.makedirs(d, exist_ok=True)
    return d


def run_steps(code, steps, sub):
    d = out_dir(code)
    sd = os.path.join(d, sub)
    os.makedirs(sd, exist_ok=True)
    sp = os.path.join(d, f'{sub}_steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'))
    env = dict(os.environ, PYTHONIOENCODING='utf-8', QA_FIELD=code)
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'battle_polish_shots.py'), sd, 'phone', '--only=field', f'--steps={sp}'],
                       env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=7200)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'edge_guard.py')], capture_output=True)
    return sd, p.stdout + p.stderr


def cmd_walk(code):
    for f in glob.glob(os.path.join(out_dir(code), 'walk', '*')):
        os.remove(f)
    steps = [{'js': "return 'settle';", 'wait': 6}, {'js': SETUP}]
    steps += [{'js': DRIVE, 'save': f'w_{i:03d}.jpg'} for i in range(MAX_STEPS)]
    steps += [{'js': REPORT}]
    sd, out = run_steps(code, steps, 'walk')
    m = re.search(r'REPORT(\{.*\})', out)
    rep = json.loads(m.group(1)) if m else {'error': out[-2000:]}
    json.dump(rep, open(os.path.join(out_dir(code), 'walk_report.json'), 'w', encoding='utf-8'))
    print(json.dumps({k: v for k, v in rep.items() if k != 'stuck'}), 'stuck', len(rep.get('stuck', [])))
    for s in rep.get('stuck', [])[:60]:
        print('  stuck at', s[:2], 'heading to', s[2:4], 'ROAD' if len(s) > 4 and s[4] else 'sweep')


def cmd_sheet(code):
    d = out_dir(code)
    shots = sorted(glob.glob(os.path.join(d, 'walk', 'phone_w_*.jpg')))
    for k in range(0, len(shots), 16):
        sheet = Image.new('RGB', (2400, 1080), (0, 0, 0))
        for j, p in enumerate(shots[k:k + 16]):
            im = Image.open(p).convert('RGB').resize((600, 270))
            ImageDraw.Draw(im).text((8, 6), os.path.basename(p)[8:11], fill=(255, 255, 0))
            sheet.paste(im, ((j % 4) * 600, (j // 4) * 270))
        sheet.save(os.path.join(d, f'sheet_{k // 16:02d}.jpg'), quality=85)
    print('sheets', -(-len(shots) // 16), 'from', len(shots), 'shots')


def cmd_overlay(code):
    steps = [{'js': "return 'settle';", 'wait': 6}, {'js': OVERLAY, 'save': 'overlay.json'}]
    sd, out = run_steps(code, steps, 'ov')
    data = json.load(open(os.path.join(sd, 'phone_overlay.json'), encoding='utf-8'))
    fd = fr.out_dir(code)
    img = Image.open(fr._final_src(fd)).convert('RGB')
    px = fr.PX_MAP.get(code, fr.PX)
    q = 4   # 出图 1/4
    W, H = img.width // q, img.height // q
    base = img.resize((W, H), Image.LANCZOS)
    walk = np.frombuffer(base64.b64decode(data['walk']), dtype=np.uint8).reshape(data['H'], data['W'])
    blocked = Image.fromarray(((1 - walk) * 255).astype(np.uint8)).resize((W, H), Image.NEAREST)
    a = np.asarray(base, dtype=np.float32)
    m = (np.asarray(blocked) > 127)[..., None]
    a = np.where(m, a * 0.55 + np.array([255, 0, 0]) * 0.45, a)
    ov = Image.fromarray(a.astype(np.uint8))
    dr = ImageDraw.Draw(ov)
    s = px / q
    mapW, mapH = data['mapW'], data['mapH']
    # 遮挡件:原立物贴图的轮廓(青),对不上画面里的树 / 石 = 人走到后面会被一块「看不见的形状」挡住
    for p in data['props']:
        if p['flat']:
            continue
        o = next((o for o in data['occ'] if abs(o['x'] - p['x']) < 1 and abs(o['y'] - p['y']) < 1), None)
        if not o:
            continue
        path = os.path.join(ROOT, 'assets', 'resources', p['asset'].replace('/spriteFrame', '') + '.png')
        if not os.path.exists(path):
            continue
        mk = Image.open(path).convert('RGBA').split()[3]
        w, h = max(1, round(o['w'] * s)), max(1, round(o['h'] * s))
        mk = mk.resize((w, h))
        if p['flip']:
            mk = mk.transpose(Image.FLIP_LEFT_RIGHT)
        edge = mk.point(lambda v: 255 if v > 100 else 0).filter(ImageFilter.FIND_EDGES)
        x0 = round((o['x'] - o['w'] / 2 + mapW / 2) * s)
        y0 = round((mapH / 2 - (o['y'] + o['h'])) * s)
        ov.paste((0, 255, 255), (x0, y0), edge)
    ov.save(os.path.join(out_dir(code), 'overlay.png'))
    print('overlay', ov.size, 'occluders', len(data['occ']))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    code, cmd = sys.argv[1], sys.argv[2]
    {'walk': cmd_walk, 'sheet': cmd_sheet, 'overlay': cmd_overlay}[cmd](code)
