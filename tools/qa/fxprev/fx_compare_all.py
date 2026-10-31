# -*- coding: utf-8 -*-
"""特效换皮批量验收(2026-11-01):C:/mw/fx/<effect>/ 有 src_x* + pack 的全部按当前回填工具重做 final,再逐个出原版 / 新版对比横条,
最后 12 个一页拼成总览(C:/mw/fx/_review_N.jpg),人工挑出变差的。
用法:python fx_compare_all.py [--skip-repack]
"""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
FX = 'C:/mw/fx'
EFFECT = os.path.join(REPO, 'assets', 'resources', 'spine', 'effect')
BACKUP = os.path.join(REPO, '素材原始备份', 'fx-meowa-20261031')
FONT = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 18)

done = []
for e in sorted(os.listdir(FX)):
    d = os.path.join(FX, e)
    src = next((os.path.join(d, x) for x in os.listdir(d) if x.startswith('src_x')), None) if os.path.isdir(d) else None
    if not src or not os.path.isdir(os.path.join(d, 'pack')):
        continue
    if '--skip-repack' not in sys.argv:
        subprocess.run([sys.executable, os.path.join(REPO, 'tools', 'qa', 'fx_tex_repack.py'), src, os.path.join(d, 'pack'), os.path.join(d, 'final'), e],
                       stdout=subprocess.DEVNULL, check=False)
    # 原版:已装过的从备份取(assets 里已经是新版)
    orig = os.path.join(BACKUP, e) if os.path.isdir(os.path.join(BACKUP, e)) else os.path.join(EFFECT, e)
    if orig.startswith(BACKUP):
        # 备份里只有 atlas / png,补上原 skel
        for f in os.listdir(os.path.join(EFFECT, e)):
            if f.endswith('.skel') and not os.path.exists(os.path.join(orig, f)):
                import shutil
                shutil.copy(os.path.join(EFFECT, e, f), os.path.join(orig, f))
    out = os.path.join(d, 'cmp.jpg')
    r = subprocess.run([sys.executable, os.path.join(HERE, 'fx_compare.py'), e, orig, os.path.join(d, 'final'), out], capture_output=True, text=True)
    print(e, 'ok' if os.path.exists(out) else 'FAIL ' + r.stderr[-200:], flush=True)
    if os.path.exists(out):
        done.append((e, out))

for page in range(0, len(done), 8):
    ims = [Image.open(p).resize((900, 220)) for _, p in done[page:page + 8]]
    sheet = Image.new('RGB', (900, 220 * len(ims)), (0, 0, 0))
    for i, im in enumerate(ims):
        sheet.paste(im, (0, i * 220))
    sheet.save(os.path.join(FX, f'_review_{page // 8 + 1}.jpg'), quality=85)
print('pages', (len(done) + 7) // 8)
