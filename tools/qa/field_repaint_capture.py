# -*- coding: utf-8 -*-
"""野外整图重绘第 1 步:游戏里逐格截整张地图(只留地面 + 立物),产出 capture/ 和 mosaic.json,之后跑 field_repaint.py <图> stitch。

做法:battle_polish_shots 进野外 → 第一步隐藏界面 / 角色 / 怪 / 特效 / 第一期调色层并算格子 → 逐格移镜头截 canvas。
页面带 ?fieldlook=0&fieldpaint=0(不带第一期调色、不用已有重绘图块),要求 7456 预览和 8081 后端都在。
11-21 起重绘图的旧地面材质 / 贴地件已移到 素材原始备份/field-ground-slim-20261121/(field_ground_slim.py),重截原图前先整目录挪回 assets/。

  python tools/qa/field_repaint_capture.py GRAY
  python tools/qa/field_repaint_capture.py VILLAGE --flats   # 只截地面 + 贴地件(只重画地面的图)
"""
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_repaint import out_dir  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MAX_CELLS = 160

SETUP = r"""
cc.director.pause();
window.__mosHide = () => {
const hide = n => { if (!n || !n.isValid) return; const o = n.getComponent(cc.UIOpacity) || n.addComponent(cc.UIOpacity); o.opacity = 0; };
let n = t.world; while (n.parent && n.parent !== cc.director.getScene()) { n.parent.children.forEach(s => { if (s !== n && s.getComponent(cc.UITransform)) hide(s); }); n = n.parent; }
[t.leader, ...t.followers].forEach(a => hide(a.node)); t.monsters.forEach(m => hide(m.node));
t.entityRoot.children.forEach(c => { if (/^Town(Fx|Strike|Bolt|Dodge|Loot|Actor|Monster|Npc|Chest|Poi|Exit|Waypoint)/.test(c.name)) hide(c); });
t.groundRoot.children.forEach(c => { if (/^Town(Waypoint|Exit|Poi|Chest)/.test(c.name)) hide(c); });
['Ambient', 'FieldLookOverlay', 'FieldWisps'].forEach(nm => hide(t.world.getChildByName(nm)));
if (window.__mosFlats) {
  // 只留地面 + 贴地件:立物 / 建筑 / 路灯 / 立物投影 / 名牌全藏
  t.entityRoot.children.forEach(c => { const m = /^TownProp_(\d+)$/.exec(c.name); if ((m && !(t.def.props[+m[1]] || {}).flat) || /^Town(Building|Lamp|Npc)/.test(c.name)) hide(c); });
  t.groundRoot.children.forEach(c => { if (/^(Shadows|Town(Building|Lamp))/.test(c.name)) hide(c); });
  const walk = nd => { nd.children.forEach(ch => { if (ch.getComponent(cc.Label)) hide(ch); walk(ch); }); }; walk(t.world);
}
};
window.__mosFlats = __FLATS__;
window.__mosHide();
const L = t.layout; const k = t.k; const vw = Math.max(L.width, L.stageWidth) / k, vh = Math.max(L.height, L.stageHeight) / k;
const W = t.def.width, H = t.def.height; const sx = vw * 0.88, sy = vh * 0.88;
const cols = Math.ceil((W - vw) / sx) + 1, rows = Math.ceil((H - vh) / sy) + 1;
window.__mos = { vw, vh, W, H, sx: (W - vw) / (cols - 1), sy: (H - vh) / (rows - 1), cols, rows, cx: (L.stageLeft + L.stageRight) / 2, cy: (L.stageTop + L.stageBottom) / 2, k };
return 'MOS' + JSON.stringify({ ...window.__mos, map: t.def.code, canvas: [cc.game.canvas.width, cc.game.canvas.height], look: !!(t.look && t.look.active) });
"""

CELL = r"""
const m = window.__mos; const i = %d; if (i >= m.cols * m.rows) return 'skip';
const c = i %% m.cols, r = Math.floor(i / m.cols);
const X = -m.W / 2 + m.vw / 2 + c * m.sx, Y = m.H / 2 - m.vh / 2 - r * m.sy;
t.camX = X; t.camY = Y; t.world.setPosition(m.cx - X * m.k, m.cy - Y * m.k, 0);
t.cullKey = ''; t.updateCulling(); t.sortEntities(true);
cc.game.step(); window.__mosHide(); await sleep(120); cc.game.step(); window.__mosHide(); cc.game.step();
return cc.game.canvas.toDataURL('image/png');
"""


def main():
    code = sys.argv[1]
    d = out_dir(code)
    cap = os.path.join(d, 'capture')
    os.makedirs(cap, exist_ok=True)
    flats = '--flats' in sys.argv
    steps = [{'js': "return 'settle';", 'wait': 8}, {'js': SETUP.replace('__FLATS__', 'true' if flats else 'false')}] + [{'js': CELL % i, 'save': f'mos_{i:03d}.png'} for i in range(MAX_CELLS)]
    sp = os.path.join(d, 'mosaic_steps.json')
    json.dump(steps, open(sp, 'w', encoding='utf-8'))
    env = dict(os.environ, PYTHONIOENCODING='utf-8', QA_FIELD=code, PAGE_QS='?fieldlook=0&fieldpaint=0')
    p = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'battle_polish_shots.py'), cap, 'phone', '--only=field', f'--steps={sp}'],
                       env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600)
    out = p.stdout + p.stderr
    m = re.search(r'MOS(\{.*?\})\s*$', out, re.M)
    if not m:
        print(out[-3000:])
        raise SystemExit('setup step returned nothing')
    meta = json.loads(m.group(1))
    if meta.get('map') != code:
        raise SystemExit(f'wrong map: {meta.get("map")}')
    json.dump(meta, open(os.path.join(d, 'mosaic.json'), 'w', encoding='utf-8'))
    n = len([f for f in os.listdir(cap) if f.startswith('phone_mos_')])
    print('captured', n, '/', meta['cols'] * meta['rows'], 'cells', meta)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'edge_guard.py')], capture_output=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
