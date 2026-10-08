# -*- coding: utf-8 -*-
"""扫描 hu_* 图集:哪些区域的内容贴到矩形边框(边缘 alpha 不为 0)→ 实机会显示成硬边矩形。输出 edge_scan.json。"""
import glob, json, os, re, sys, collections
import numpy as np
from PIL import Image
ROOT = 'assets/resources/spine/effect'
ORIG = '素材原始备份/hu-ult-pma-20261006'
J42 = 'D:/骨骼动画素材/hero_ult_out_4243/hero_ult_out_4243/fx42json'

def parse_atlas(path):
    regs = {}; cur = None; pagehdr = True
    for ln in open(path, encoding='utf-8').read().splitlines():
        if not ln.strip():
            cur = None; pagehdr = True; continue
        if pagehdr and ln.strip().endswith('.png'):
            continue
        if ':' in ln and (ln.startswith(' ') or ln.startswith('\t') or pagehdr and ln.split(':')[0] in ('size','format','filter','repeat','pma','scale')):
            if cur is None:
                continue
            k, v = ln.split(':', 1); regs[cur][k.strip()] = v.strip()
        else:
            pagehdr = False; cur = ln.strip(); regs[cur] = {}
    out = {}
    for name, r in regs.items():
        if 'bounds' in r:
            x, y, w, h = map(int, r['bounds'].split(','))
        else:
            x, y = map(int, r['xy'].split(',')); w, h = map(int, r['size'].split(','))
        rot = r.get('rotate', 'false') in ('true', '90')
        out[name] = (x, y, w, h, rot)
    return out

def slot_map(num):
    m = {}
    for p in glob.glob(os.path.join(J42, num, '*.json')):
        d = json.load(open(p, encoding='utf-8'))
        blend = {s['name']: s.get('blend', 'normal') for s in d['slots']}
        skins = d['skins'] if isinstance(d['skins'], list) else [{'attachments': d['skins'].get('default', {})}]
        for sk in skins:
            for slot, atts in sk.get('attachments', {}).items():
                for an, a in atts.items():
                    if a.get('type', 'region') in ('region', 'mesh'):
                        m.setdefault(a.get('path', an), set()).add((slot, blend.get(slot, 'normal')))
    return m

rows = []
for d in sorted(p for p in glob.glob(os.path.join(ROOT, 'hu_*')) if os.path.isdir(p)):
    code = os.path.basename(d); num = code[3:]
    img = np.asarray(Image.open(os.path.join(ORIG, code + '.png')).convert('RGBA'))
    regs = parse_atlas(os.path.join(d, code + '.atlas'))
    smap = slot_map(num)
    for name, (x, y, w, h, rot) in regs.items():
        if rot: w, h = h, w
        c = img[y:y+h, x:x+w]; a = c[..., 3].astype(float)
        if a.size < 32*32: continue
        edge = np.concatenate([a[:2].ravel(), a[-2:].ravel(), a[:, :2].ravel(), a[:, -2:].ravel()])
        em = edge.mean(); efrac = (edge > 12).mean()
        if em > 6 or efrac > 0.15:
            slots = sorted(smap.get(name, []))
            rows.append({'set': code, 'region': name, 'w': w, 'h': h, 'edgeMean': round(em, 1), 'edgeFrac': round(efrac, 2), 'meanA': round(a.mean(), 1), 'nonzero': round((a > 0).mean(), 2), 'slots': [s for s, _ in slots], 'blend': sorted(set(b for _, b in slots))})
json.dump(rows, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'edge_scan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
bys = collections.defaultdict(list)
for r in rows: bys[r['set']].append(r)
for s in sorted(bys):
    print(s, len(bys[s]), 'regions')
    for r in sorted(bys[s], key=lambda r: -r['edgeMean'])[:6]:
        print('   %-34s %4dx%-4d edge %5.1f/%.2f meanA %5.1f nz %.2f %s %s' % (r['region'], r['w'], r['h'], r['edgeMean'], r['edgeFrac'], r['meanA'], r['nonzero'], r['blend'], r['slots'][:3]))
print('total flagged', len(rows))
