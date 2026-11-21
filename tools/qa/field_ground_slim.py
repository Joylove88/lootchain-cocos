# -*- coding: utf-8 -*-
"""野外整图重绘后的包体瘦身(2026-11-21 用户:「把旧地面材质移出去压包体」)。

整图重绘的图(LobbyFieldPaintData 里登记的)运行时不再用:多层地表的遮罩 / 材质、已画进图块的贴地件。
这些贴图只在 ?fieldpaint=0 兜底和 field_repaint_capture.py 重新截原图时才用,移到 素材原始备份/field-ground-slim-<日期>/(保留原路径,
要重截原图时整目录挪回 assets/ 即可)。

  python tools/qa/field_ground_slim.py           # 列出可移的贴图和大小(不动文件)
  python tools/qa/field_ground_slim.py --move    # 真的移走

依据:%TEMP%/lootchain-qa/asset_slim/<图>/phone_def.json(游戏里导出的各图 ground / splat / props,导出法见本文件末尾注释)。
保留规则:任何一张图里当立物(非贴地)/ 建筑 / 地面底纹 / 灯用到的;脚本里直接写了文件名的;非重绘图(主城等)用到的。
"""
import json
import os
import re
import shutil
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'assets', 'resources')
SRC = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(tempfile.gettempdir(), 'lootchain-qa'), 'asset_slim')
DST = os.path.join(ROOT, '素材原始备份', 'field-ground-slim-20261121')
MAPS = ['VILLAGE', 'WOODS', 'GRAY', 'DEADWOOD']


def strip(a):
    return re.sub(r'/(spriteFrame|texture)$', '', a)


def main():
    painted = set(re.findall(r'"(\w+)": \{"px"', open(os.path.join(ROOT, 'assets/scripts/scenes/lobby/LobbyFieldPaintData.ts'), encoding='utf-8').read()))
    cand, keep = set(), set()
    for m in MAPS:
        d = json.load(open(os.path.join(SRC, m, 'phone_def.json'), encoding='utf-8'))
        keep.update(strip(x) for x in [d['ground'], d['lamp']] + d['buildings'] if x)
        sp = d.get('splat') or {}
        splat = [strip(v) for k, v in sp.items() if isinstance(v, str) and '/' in v]
        for asset, flat, _w in d['props']:
            a = strip(asset)
            (cand if (flat and m in painted) else keep).add(a)
        (cand if m in painted else keep).update(splat)
    scripts = ''
    for dp, _dn, fns in os.walk(os.path.join(ROOT, 'assets', 'scripts')):
        for fn in fns:
            if fn.endswith('.ts') and 'FieldPaintData' not in fn:
                scripts += open(os.path.join(dp, fn), encoding='utf-8').read()
    out, total = [], 0
    for a in sorted(cand - keep):
        base = os.path.basename(a)
        # 脚本里有完整路径(不是靠地图表拼出来的)→ 别处直接用到,保留
        if re.search(re.escape(a) + r'[/\'"`]', scripts):
            continue
        files = [os.path.join(RES, a + ext) for ext in ('.png', '.jpg', '.webp') if os.path.exists(os.path.join(RES, a + ext))]
        if not files:
            continue
        size = sum(os.path.getsize(f) for f in files)
        total += size
        out.append((a, files, size))
        _ = base
    for a, _f, s in out:
        print(f'{s / 1e6:6.2f} MB  {a}')
    print(f'{len(out)} files, {total / 1e6:.1f} MB')
    if '--move' in sys.argv:
        for a, files, _s in out:
            for f in files:
                for p in (f, f + '.meta'):
                    if os.path.exists(p):
                        rel = os.path.relpath(p, ROOT)
                        dst = os.path.join(DST, rel)
                        os.makedirs(os.path.dirname(dst), exist_ok=True)
                        shutil.move(p, dst)
        print('moved to', DST)


if __name__ == '__main__':
    main()

# 导出 phone_def.json:battle_polish_shots.py <out>/<图> phone --only=field,QA_FIELD=<图>,一步 js:
#   const d=t.def; return 'data:image/json;base64,'+btoa(unescape(encodeURIComponent(JSON.stringify(
#     {code:d.code, ground:d.ground, splat:d.groundSplat||null, lamp:d.lampAsset, buildings:d.buildings.map(b=>b.asset), props:d.props.map(p=>[p.asset,!!p.flat,p.width])}))));
