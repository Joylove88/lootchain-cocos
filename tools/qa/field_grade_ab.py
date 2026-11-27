# -*- coding: utf-8 -*-
"""野外调色层逐层 A/B(2026-11-27 用户:「整体看起来偏暗了,英雄和技能特效像做了透明化」)。
同一帧(怪群旁、普攻命中时定格)依次关掉 / 调整盖在世界层上的各层,截图 + 量化:
  画面平均亮度、队伍像素的暗部(5% 分位亮度,越高 = 越「发灰透明」)和亮度对比、对比环带背景。

  python tools/qa/field_grade_ab.py [输出目录] [--map=WOODS] [--spot=x,y]
产物:<输出目录>/phone_grade_<档>.png、grade_ab.json、grade_sheet.jpg。层的名字见 LobbyFieldTod / LobbyFieldLook / LobbyFieldLife。
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
import field_actor_read as far  # noqa: E402  复用 HELPERS(藏界面 / 队伍染黑 / 截图)

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = {a[2:].split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
OUT = ARGS[0] if ARGS else os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'grade_ab')
MAP = OPT.get('map', 'WOODS')

# 每档 = (名字, 说明, 应用 js, 还原 js);在定格帧里依次执行
LAYER = "const L = n => t.world.getChildByName(n); const op = (n, v) => { const x = L(n); if (!x) return -1; const o = x.getComponent(cc.UIOpacity) || x.addComponent(cc.UIOpacity); const old = o.opacity; o.opacity = v; return old; };"
VARIANTS = [
    ('now', '现在', '', ''),
    ('nosun', '关左上暖光(叠加)', "window.__o = op('TodSun', 0);", "op('TodSun', window.__o);"),
    ('nooverlay', '关暗角 + 空气雾', "window.__o = op('FieldLookOverlay', 0);", "op('FieldLookOverlay', window.__o);"),
    ('nowash', '关薄色层', "window.__o = op('TodWash', 0);", "op('TodWash', window.__o);"),
    ('nomul', '关正片叠底(压暗 + 四周暗)', "window.__o = op('TodMul', 0);", "op('TodMul', window.__o);"),
    ('nodapple', '关树冠叶影', "window.__o = op('LifeDapple', 0);", "op('LifeDapple', window.__o);"),
    ('alloff', '全部调色层关掉', "window.__oo = ['TodSun','FieldLookOverlay','TodWash','TodMul','LifeDapple','TodGlow'].map(n => [n, op(n, 0)]);",
     "window.__oo.forEach(([n, v]) => op(n, v));"),
] + [('tuneA', '调整 A:暖光减半 / 叠底变浅 / 四周暗减弱 / 叶影变淡', "const T = t.tod; window.__td = JSON.stringify(T.def); T.def.sun = 0.22; T.def.day.mul = [1.0, 0.97, 0.9]; T.def.dayEdge = 0.86; T.applyTime(T.def, 0); window.__ov = op('FieldLookOverlay', 150); const M = t.life && t.life.dappleMat; window.__dp = M ? M.getProperty('dappleParams').clone() : null; if (M) { const v = window.__dp; M.setProperty('dappleParams', new cc.Vec4(0.35, 0.4, v.z, v.w)); }", "const T2 = t.tod; T2.def = Object.assign(T2.def, JSON.parse(window.__td)); T2.applyTime(T2.def, 0); op('FieldLookOverlay', window.__ov); const M2 = t.life && t.life.dappleMat; if (M2 && window.__dp) M2.setProperty('dappleParams', window.__dp);"), ('tuneB', '调整 B:更亮更通透', "const T = t.tod; window.__td = JSON.stringify(T.def); T.def.sun = 0.12; T.def.day.mul = [1.0, 1.0, 0.95]; T.def.dayEdge = 0.92; T.applyTime(T.def, 0); window.__ov = op('FieldLookOverlay', 110); const M = t.life && t.life.dappleMat; window.__dp = M ? M.getProperty('dappleParams').clone() : null; if (M) { const v = window.__dp; M.setProperty('dappleParams', new cc.Vec4(0.25, 0.36, v.z, v.w)); }", "const T2 = t.tod; T2.def = Object.assign(T2.def, JSON.parse(window.__td)); T2.applyTime(T2.def, 0); op('FieldLookOverlay', window.__ov); const M2 = t.life && t.life.dappleMat; if (M2 && window.__dp) M2.setProperty('dappleParams', window.__dp);")]

SUN_STEPS = [(k, e) for k, e in ((0.75, 0.9), (1.0, 0.9), (1.0, 0.95))]
VARIANTS += [(f"sun{k}_e{e}", f"暖光 {k} / 四周 {e}",
              f"const T = t.tod; window.__td = JSON.stringify(T.def); T.def.sun = {k}; T.def.dayEdge = {e}; T.applyTime(T.def, 0);",
              "const T2 = t.tod; T2.def = Object.assign(T2.def, JSON.parse(window.__td)); T2.applyTime(T2.def, 0);") for k, e in SUN_STEPS]


def steps():
    st = [{'js': "return 'settle';", 'wait': 6}]
    if OPT.get('spot'):
        x, y = [float(v) for v in str(OPT['spot']).split(',')]
        st.append({'js': f"""const all=[t.leader,...t.followers]; all.forEach((a,i)=>{{a.x={x}-i*90;a.y={y}-(i%2)*40;a.node.setPosition(a.x,a.y,0);}});
t.trail=[new cc.Vec2({x}-300,{y}),new cc.Vec2({x},{y})]; t.applyCamera(true); await sleep(3500); return 'tp';"""})
    st.append({'js': far.HELPERS + "return 'helpers';"})
    # 普攻命中时定格(带上刀光 / 命中特效)
    st.append({'js': "t.skillReadyAt=[0,0,0]; t.actionUntil=0; t.leaderAttack(); await sleep(300); cc.director.pause(); cc.game.step(); return 'hit';"})
    st.append({'js': "return window.__ar.measure();"})
    st.append({'js': "window.__ar.party(0); const u = window.__ar.shot(); window.__ar.party(255); return u;", 'save': 'grade_bg.png'})
    st.append({'js': "window.__ar.black(true); const u = window.__ar.shot(); window.__ar.black(false); return u;", 'save': 'grade_black.png'})
    for key, _label, apply, undo in VARIANTS:
        st.append({'js': LAYER + apply + " const u = window.__ar.shot(); " + undo + " return u;", 'save': f'grade_{key}.png'})
    st.append({'js': "cc.director.resume(); return 'resumed';"})
    return st


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def main():
    os.makedirs(OUT, exist_ok=True)
    sp = os.path.join(OUT, 'steps_grade.json')
    json.dump(steps(), open(sp, 'w', encoding='utf-8'))
    env = dict(os.environ, PYTHONIOENCODING='utf-8', QA_FIELD=MAP)
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'battle_polish_shots.py'), OUT, 'phone', '--only=field', f'--steps={sp}'],
                       env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'edge_guard.py')], capture_output=True)
    open(os.path.join(OUT, 'log_grade.txt'), 'w', encoding='utf-8').write(p.stdout + p.stderr)
    pre = os.path.join(OUT, 'phone_')
    bg = np.asarray(Image.open(pre + 'grade_bg.png').convert('RGB')).astype(np.float32)
    blk = np.asarray(Image.open(pre + 'grade_black.png').convert('RGB')).astype(np.float32)
    alpha = np.clip(1 - lum(blk) / np.maximum(lum(bg), 1), 0, 1)
    mask = alpha > 0.6
    res = {}
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 24)
    tiles = []
    for key, label, _a, _u in VARIANTS:
        f = pre + f'grade_{key}.png'
        if not os.path.exists(f):
            continue
        im = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        L = lum(im)
        act = L[mask]
        r = {'frameLum': round(float(L.mean()), 1), 'actorLum': round(float(act.mean()), 1),
             'actorDark5': round(float(np.percentile(act, 5)), 1), 'actorBright95': round(float(np.percentile(act, 95)), 1),
             'actorSpread': round(float(np.percentile(act, 95) - np.percentile(act, 5)), 1)}
        res[key] = r
        t = Image.fromarray(im.astype(np.uint8)).resize((800, 360), Image.LANCZOS)
        ImageDraw.Draw(t).text((8, 6), f"{label}  画面 {r['frameLum']} · 人物暗部 {r['actorDark5']} · 反差 {r['actorSpread']}",
                               fill=(255, 232, 150), font=font, stroke_width=3, stroke_fill=(0, 0, 0))
        tiles.append(t)
    json.dump(res, open(os.path.join(OUT, 'grade_ab.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    cols = 2
    rows = (len(tiles) + 1) // 2
    sheet = Image.new('RGB', (800 * cols, 360 * rows), (10, 10, 10))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 800, (i // cols) * 360))
    sheet.save(os.path.join(OUT, 'grade_sheet.jpg'), quality=88)
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
