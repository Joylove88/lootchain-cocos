# -*- coding: utf-8 -*-
"""野外整图重绘:找回每块生图的原尺寸原图,并用原图重拼整图(2026-11-22)。

起因:field_tex_regen.run_codex 原来把生图结果统一缩成 1024×1024(给方形地表材质用的),整图重绘也走了它:
生图原本就是 1672×941 左右,先压成方图再拉回 1672×941,横向细节丢了约四成 → 用户「不是模糊的」。
生图原图都还在 ~/.codex/generated_images 里,这里按缩略图把每张 1024 方图(= 原图缩成方图)对回原图。

  python tools/qa/field_repaint_native.py GRAY match      # 写 native.json(块 / 修路 / 修图 → 原图路径 + 匹配误差)
  python tools/qa/field_repaint_native.py GRAY demo 1 4   # 第 1 列第 4 行:现在的块 vs 原图,1:1 局部对比图
  python tools/qa/field_repaint_native.py GRAY restore    # 备份 1024 方图 → 换成原图 → 重拼(assemble / roads / fix / flow)→ 导出图块
"""
import glob
import json
import os
import shutil
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import field_repaint as fr  # noqa: E402
from field_proto_gen import GEN  # noqa: E402

T = 24
BACKUP = 'backup_1024_20261122'


def thumb(path, src_size=None):
    im = Image.open(path).convert('L')
    if src_size:
        im = im.resize(src_size, Image.LANCZOS)
    return np.asarray(im.resize((T, T), Image.BILINEAR), dtype=np.float32)


def gen_thumbs():
    """11-20 以后的生图原图缩略图(缓存到 %TEMP%/lootchain-qa/field_repaint/gen_thumbs.npz)。"""
    cache = os.path.join(fr.QA, 'gen_thumbs.npz')
    t0 = time.mktime((2026, 11, 20, 0, 0, 0, 0, 0, -1))
    files = sorted(p for p in glob.glob(os.path.join(GEN, '*', '*.png')) if os.path.getmtime(p) >= t0)
    if os.path.exists(cache):
        z = np.load(cache, allow_pickle=True)
        if list(z['files']) == files:
            return files, z['thumbs']
    thumbs = np.stack([thumb(p, (1024, 1024)) for p in files])
    np.savez(cache, files=np.array(files, dtype=object), thumbs=thumbs)
    return files, thumbs


def queries(code):
    """要找原图的 1024 方图:块(pieces/piece_rr_cc_raw.png)、修路(roads/raw_r_c.png)、修图(fixes/raw_<id>.png)。"""
    d = fr.out_dir(code)
    q = {}
    for p in sorted(glob.glob(os.path.join(d, 'pieces', 'piece_??_??_raw.png'))):
        q['pieces/' + os.path.basename(p)] = p
    for sub in ('roads', 'fixes'):
        for p in sorted(glob.glob(os.path.join(d, sub, 'raw_*.png'))):
            if not p.endswith('_raw.png'):
                q[f'{sub}/' + os.path.basename(p)] = p
    return q


def cmd_match(code):
    d = fr.out_dir(code)
    files, ct = gen_thumbs()
    out = {}
    used = {}
    bk = os.path.join(d, BACKUP)
    for key, p in queries(code).items():
        src = os.path.join(bk, key) if os.path.exists(os.path.join(bk, key)) else p   # 已恢复过的用备份里的方图来对
        if Image.open(src).size != (1024, 1024):
            print('skip (not a 1024 square)', key)
            continue
        err = ((ct - thumb(src)[None]) ** 2).mean(axis=(1, 2))
        i = int(err.argmin())
        out[key] = {'native': files[i], 'err': round(float(err[i]), 3), 'size': list(Image.open(files[i]).size)}
        used.setdefault(files[i], []).append(key)
    dup = {k: v for k, v in used.items() if len(v) > 1}
    bad = {k: v for k, v in out.items() if v['err'] > 4}
    json.dump(out, open(os.path.join(d, 'native.json'), 'w', encoding='utf-8'), indent=1)
    print(code, 'matched', len(out), 'dup', len(dup), 'bad(err>4)', len(bad), 'max err', max(v['err'] for v in out.values()))
    for k, v in list(bad.items())[:10]:
        print('  bad', k, v)
    for k, v in list(dup.items())[:10]:
        print('  dup', k, v)
    return not bad and not dup


def cmd_restore(code):
    """备份 1024 方图和旧整图 → 原图放回原位(文件名不变,尺寸变成生图原尺寸)→ 重拼 → 导出。"""
    fr.PX = fr.PX_MAP.get(code, fr.PX)
    d = fr.out_dir(code)
    if not cmd_match(code):
        print('match not clean, abort')
        return
    m = json.load(open(os.path.join(d, 'native.json'), encoding='utf-8'))
    bk = os.path.join(d, BACKUP)
    os.makedirs(bk, exist_ok=True)
    for name in ('mosaic.png', 'mosaic_roads.png', 'mosaic_fixed.png'):
        p = os.path.join(d, name)
        if os.path.exists(p) and not os.path.exists(os.path.join(bk, name)):
            shutil.copy2(p, os.path.join(bk, name))
    for key, v in m.items():
        dst = os.path.join(d, key)
        b = os.path.join(bk, key)
        os.makedirs(os.path.dirname(b), exist_ok=True)
        if not os.path.exists(b):
            shutil.copy2(dst, b)
        Image.open(v['native']).convert('RGB').save(dst)
    print('natives in place', len(m), flush=True)
    fr.cmd_assemble(code)
    if os.path.isdir(os.path.join(d, 'roads')):
        # 修路是在 mosaic.png 上增量做的:清掉旧结果,用缓存的生图(现已换成原图)重合
        for name in ('mosaic_roads.png', os.path.join('roads', 'done.json')):
            p = os.path.join(d, name)
            if os.path.exists(p):
                os.remove(p)
        fr.cmd_roads(code)
    if os.path.isdir(os.path.join(d, 'fixes')):
        fr.cmd_fix(code)
    if os.path.exists(os.path.join(fr.ROOT, 'assets', 'resources', 'ui', 'world', f'{code.lower()}_paint', 'flow.png')):
        fr.cmd_flow(code)
    fr.cmd_export(code)


def cmd_demo(code, c, r):
    from PIL import ImageDraw, ImageFont
    d = fr.out_dir(code)
    m = json.load(open(os.path.join(d, 'native.json'), encoding='utf-8'))
    key = f'pieces/piece_{r:02d}_{c:02d}_raw.png'
    cur = Image.open(os.path.join(d, 'pieces', f'piece_{r:02d}_{c:02d}.png')).convert('RGB')
    nat = Image.open(m[key]['native']).convert('RGB').resize((fr.PW, fr.PH), Image.LANCZOS)
    cw, ch = 836, 470
    box = ((fr.PW - cw) // 2, (fr.PH - ch) // 2, (fr.PW + cw) // 2, (fr.PH + ch) // 2)
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 30)
    s = Image.new('RGB', (cw * 2, ch), (12, 12, 12))
    for i, (lab, im) in enumerate([('现在(压过方图)· 原尺寸局部', cur), ('同一张画的生图原图 · 原尺寸局部', nat)]):
        t = im.crop(box)
        ImageDraw.Draw(t).text((16, 10), lab, fill=(255, 235, 140), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
        s.paste(t, (i * cw, 0))
    out = os.path.join(os.environ['TEMP'], 'lootchain-qa', 'ai_feel', f'{code}_native_piece_{r:02d}_{c:02d}.jpg')
    s.save(out, quality=92)
    print('demo', out)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    code, cmd = sys.argv[1], sys.argv[2]
    if cmd == 'match':
        cmd_match(code)
    elif cmd == 'restore':
        cmd_restore(code)
    elif cmd == 'demo':
        cmd_demo(code, int(sys.argv[3]), int(sys.argv[4]))
