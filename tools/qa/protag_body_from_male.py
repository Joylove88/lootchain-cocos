# -*- coding: utf-8 -*-
"""女主衣服整套换成男主的(11-03 用户「直接衣服和男主的一样就行了」):两套骨骼同底、图集同布局,
取男主整张贴图,只把女主的头(face01 / face02)和眼睛(eyes01)区域贴回去 → 女主 = 男主身体 + 女主脸。
用法:python tools/qa/protag_body_from_male.py <女主 png 输入> <输出 png> [男主 png](男主贴图默认仓库 protag_m.png;区域按 protag_f.atlas)
11-04 炼魂:女主炼魂 = 炼魂男主贴图 + 女主(觉醒版 protag_f.png)的脸,第三个参数传炼魂男主贴图
"""
import os, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MALE = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero', 'protag_m', 'protag_m.png')
ATLAS = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero', 'protag_f', 'protag_f.atlas')
KEEP = ('face01', 'face02', 'eyes01')


def regions(path):
    out, cur = {}, None
    for l in open(path, encoding='utf-8').read().splitlines()[5:]:
        if not l.startswith(' '):
            cur = l.strip()
            out[cur] = {}
        else:
            k, v = l.strip().split(':', 1)
            out[cur][k] = v.strip()
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    f = Image.open(src).convert('RGBA')
    out = Image.open(sys.argv[3] if len(sys.argv) > 3 else MALE).convert('RGBA')
    reg = regions(ATLAS)
    for name in KEEP:
        r = reg[name]
        x, y = map(int, r['xy'].split(','))
        w, h = map(int, r['size'].split(','))
        if r['rotate'] == 'true':
            w, h = h, w
        out.paste(f.crop((x, y, x + w, y + h)), (x, y))
        print('keep female', name)
    out.save(dst, optimize=True)


if __name__ == '__main__':
    main()
