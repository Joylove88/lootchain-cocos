# -*- coding: utf-8 -*-
"""野外沉浸感自验(2026-11-22):每张图几个机位,队伍站过去等几秒,强制放一群鸟 / 鹰影进场,截图(默认藏界面)。

  python tools/qa/field_life_shots.py WOODS            # 该图预设机位
  python tools/qa/field_life_shots.py WOODS --ui       # 带界面截(看近景枝叶和界面的关系)
  python tools/qa/field_life_shots.py WOODS 0 0        # 指定机位
产物:%TEMP%/lootchain-qa/field_life/<图>/phone_s<i>.png + life_sheet.jpg。要求 7456 预览 + 8081 后端;别和重拼图块同时跑(写图块会让预览页自动刷新)。
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'field_life')
SPOTS = {
    'WOODS': [(0, 0), (5350, -260), (1500, -2500)],
    'VILLAGE': [(-200, 650), (700, -350)],
    'GRAY': [(-6300, 700), (2300, -1750)],
    'DEADWOOD': [(0, 0), (-6150, -250)],
}
HIDE = r"""
window.__lifeHide = () => { const hide = n => { if (!n || !n.isValid) return; const o = n.getComponent(cc.UIOpacity) || n.addComponent(cc.UIOpacity); o.opacity = 0; };
let n = t.world; while (n.parent && n.parent !== cc.director.getScene()) { n.parent.children.forEach(s => { if (s !== n && s.getComponent(cc.UITransform)) hide(s); }); n = n.parent; } };
"""


def tp_js(x, y):
    return f"""const all=[t.leader,...t.followers]; all.forEach((a,i)=>{{a.x={x}-i*70;a.y={y};a.node.setPosition(a.x,a.y,0);}});
t.trail=[new cc.Vec2({x}-300,{y}),new cc.Vec2({x},{y})]; t.applyCamera(true);
(t.monsters || []).forEach(m => {{ if (m.node) m.node.active = false; m.x = 1e7; m.y = 1e7; }});
await sleep(3000);
const L = t.life; if (L) {{ L.birdWait = 0; if (L.hawk) {{ L.hawk.cycle = 6; L.hawk.cx = t.camX + 200; L.hawk.cy = t.camY + 60; }} }}
await sleep(2300); return 'tp';"""


def shot_js(ui):
    hide = '' if ui else 'window.__lifeHide();'
    return HIDE + f"""
cc.director.pause(); cc.game.step(); {hide} await sleep(120); cc.game.step(); {hide} cc.game.step();
const u = cc.game.canvas.toDataURL('image/png'); cc.director.resume(); return u;"""


def main():
    code = sys.argv[1]
    ui = '--ui' in sys.argv
    nums = [a for a in sys.argv[2:] if not a.startswith('--')]
    spots = [(float(nums[0]), float(nums[1]))] if len(nums) >= 2 else SPOTS[code]
    d = os.path.join(OUT, code)
    os.makedirs(d, exist_ok=True)
    steps = [{'js': "return 'settle';", 'wait': 8}]
    for i, (x, y) in enumerate(spots):
        steps.append({'js': tp_js(x, y)})
        steps.append({'js': shot_js(ui), 'save': f's{i}{"_ui" if ui else ""}.png'})
    sp = os.path.join(d, 'steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'))
    env = dict(os.environ, PYTHONIOENCODING='utf-8', QA_FIELD=code)
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'battle_polish_shots.py'), d, 'phone', '--only=field', f'--steps={sp}'],
                       env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'edge_guard.py')], capture_output=True)
    print('\n'.join(l for l in (p.stdout + p.stderr).splitlines() if 'EXC' in l or 'rror' in l)[-1200:])
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 26)
    ims = []
    for i, (x, y) in enumerate(spots):
        f = os.path.join(d, f'phone_s{i}{"_ui" if ui else ""}.png')
        if os.path.exists(f):
            im = Image.open(f).convert('RGB').resize((1200, 540), Image.LANCZOS)
            ImageDraw.Draw(im).text((12, 8), f'{code} ({int(x)}, {int(y)})', fill=(255, 235, 140), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
            ims.append(im)
    if ims:
        sheet = Image.new('RGB', (1200, 540 * len(ims)))
        for i, im in enumerate(ims):
            sheet.paste(im, (0, i * 540))
        out = os.path.join(d, f'life_sheet{"_ui" if ui else ""}.jpg')
        sheet.save(out, quality=86)
        print('sheet', out)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
