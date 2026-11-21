# -*- coding: utf-8 -*-
"""野外昼夜循环自验(2026-11-21):同一机位截 白天 / 过渡 / 黄昏 三张(?tod= 改地址栏参数,不用等真实时间)。

  python tools/qa/field_tod_shots.py VILLAGE [x y]     # 队伍站到 (x, y),默认村长屋前
  python tools/qa/field_tod_shots.py GRAY --lights     # 黄昏逐个光源(MAP_LIGHTS,相近的合一张)截图 → lights_sheet.jpg
产物:%TEMP%/lootchain-qa/field_tod/<图>/phone_tod_0.png / _05 / _1 + tod_sheet.jpg。要求 7456 预览 + 8081 后端。
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'field_tod')
SPOTS = {'VILLAGE': (-200, 650), 'WOODS': (0, 0), 'GRAY': (0, 0), 'DEADWOOD': (0, 0)}

HIDE = r"""
window.__todHide = () => { const hide = n => { if (!n || !n.isValid) return; const o = n.getComponent(cc.UIOpacity) || n.addComponent(cc.UIOpacity); o.opacity = 0; };
let n = t.world; while (n.parent && n.parent !== cc.director.getScene()) { n.parent.children.forEach(s => { if (s !== n && s.getComponent(cc.UITransform)) hide(s); }); n = n.parent; } };
"""


def shot_js(tod):
    return HIDE + f"""
const q = location.search.replace(/[?&]tod=[^&]*/g, ''); history.replaceState(null, '', location.pathname + (q ? q + '&' : '?') + 'tod={tod}');
(t.monsters || []).forEach(m => {{ if (m.node) m.node.active = false; m.x = 1e7; m.y = 1e7; }});
await sleep(900); cc.director.pause(); cc.game.step(); window.__todHide(); await sleep(120); cc.game.step(); window.__todHide(); cc.game.step();
const u = cc.game.canvas.toDataURL('image/png'); cc.director.resume(); return u;"""


def map_lights(code):
    src = open(os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyFieldGlowData.ts'), encoding='utf-8').read()
    return json.loads(src.split('MAP_LIGHTS', 1)[1].split(' = ', 1)[1].rsplit(';', 1)[0]).get(code, [])


def run(code, d, steps):
    sp = os.path.join(d, 'steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'))
    env = dict(os.environ, PYTHONIOENCODING='utf-8', QA_FIELD=code)
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'battle_polish_shots.py'), d, 'phone', '--only=field', f'--steps={sp}'],
                       env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'edge_guard.py')], capture_output=True)
    print((p.stdout + p.stderr)[-600:])


def tp_js(x, y, wait=1500):
    return f"""const all=[t.leader,...t.followers]; all.forEach((a,i)=>{{a.x={x}-i*70;a.y={y};a.node.setPosition(a.x,a.y,0);}}); t.trail=[new cc.Vec2({x}-300,{y}),new cc.Vec2({x},{y})]; t.applyCamera(true); await sleep({wait}); return 'tp';"""


def lights_main(code):
    d = os.path.join(OUT, code, 'lights')
    os.makedirs(d, exist_ok=True)
    groups = []
    for l in map_lights(code):
        g = next((g for g in groups if abs(g[0][0] - l[0]) < 1100 and abs(g[0][1] - l[1]) < 600), None)
        (g.append(l) if g else groups.append([l]))
    steps = [{'js': "return 'settle';", 'wait': 8}]
    for i, g in enumerate(groups):
        cx = sum(l[0] for l in g) / len(g)
        cy = sum(l[1] for l in g) / len(g)
        # 队伍站在光源左下一点(别挡住光源);?tod=1 = 黄昏
        steps.append({'js': tp_js(cx - 260, cy - 220)})
        steps.append({'js': shot_js(1), 'save': f'L{i:02d}.png'})
    run(code, d, steps)
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 22)
    ims = [os.path.join(d, f'phone_L{i:02d}.png') for i in range(len(groups))]
    ims = [Image.open(f).convert('RGB').resize((800, 360)) for f in ims if os.path.exists(f)]
    sheet = Image.new('RGB', (1600, 360 * ((len(ims) + 1) // 2)))
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % 2) * 800, (i // 2) * 360))
        ImageDraw.Draw(sheet).text(((i % 2) * 800 + 10, (i // 2) * 360 + 6), ' / '.join(l[2] for l in groups[i]), fill=(255, 230, 120), font=font)
    sheet.save(os.path.join(d, 'lights_sheet.jpg'), quality=86)
    print('sheet', os.path.join(d, 'lights_sheet.jpg'), len(groups), 'groups')


def main():
    code = sys.argv[1]
    if '--lights' in sys.argv:
        lights_main(code)
        return
    x, y = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else SPOTS.get(code, (0, 0))
    d = os.path.join(OUT, code)
    os.makedirs(d, exist_ok=True)
    tp = f"""const all=[t.leader,...t.followers]; all.forEach((a,i)=>{{a.x={x}-i*70;a.y={y};a.node.setPosition(a.x,a.y,0);}}); t.trail=[new cc.Vec2({x}-300,{y}),new cc.Vec2({x},{y})]; t.applyCamera(true); await sleep(1500); return 'tp';"""
    steps = [{'js': "return 'settle';", 'wait': 8}, {'js': tp}]
    for tod, tag in ((0, '0'), (0.5, '05'), (1, '1')):
        steps.append({'js': shot_js(tod), 'save': f'tod_{tag}.png'})
    sp = os.path.join(d, 'steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'))
    env = dict(os.environ, PYTHONIOENCODING='utf-8', QA_FIELD=code)
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'battle_polish_shots.py'), d, 'phone', '--only=field', f'--steps={sp}'],
                       env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'edge_guard.py')], capture_output=True)
    print((p.stdout + p.stderr)[-600:])
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 28)
    ims = [(lab, os.path.join(d, f'phone_tod_{tag}.png')) for lab, tag in (('白天', '0'), ('过渡', '05'), ('黄昏', '1'))]
    ims = [(lab, Image.open(f).convert('RGB').resize((1200, 540))) for lab, f in ims if os.path.exists(f)]
    if ims:
        sheet = Image.new('RGB', (1200, 540 * len(ims)))
        for i, (lab, im) in enumerate(ims):
            sheet.paste(im, (0, i * 540))
            ImageDraw.Draw(sheet).text((14, i * 540 + 10), lab, fill=(255, 230, 120), font=font)
        sheet.save(os.path.join(d, 'tod_sheet.jpg'), quality=86)
        print('sheet', os.path.join(d, 'tod_sheet.jpg'))


if __name__ == '__main__':
    main()
