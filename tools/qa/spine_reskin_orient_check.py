"""换皮骨骼部件方向检查(2026-11-01 血月契约「播技能时头是倒的」):Meowa 换皮回填后,图集里 rotate: true 的部件
有一部分整块转反 180°(技能脸 / 受击脸 / 头发 / 手臂 / 裙摆…),待机多数看不出,技能 / 受击换附件时才露馅。
按轮廓(透明度)和原骨骼同名部件比对:转 180° 后明显更像原版的就判为转反;--fix 把这些块原地转回(先自己备份贴图)。
用法:python tools/qa/spine_reskin_orient_check.py <原骨骼 .atlas> <换皮 .atlas> [--fix]
"""
import sys
import numpy as np
from PIL import Image


def parse(path):
    regs, name = {}, None
    for line in open(path, encoding='utf-8').read().splitlines():
        if line and not line.startswith(' ') and ':' not in line and not line.endswith('.png'):
            name = line.strip()
            regs[name] = {}
        elif name and ':' in line:
            k, v = line.strip().split(':', 1)
            regs[name][k.strip()] = v.strip()
    return regs


def page_png(atlas):
    # 图集首个贴图页名(不一定和 .atlas 同名);找不到同目录文件时退回同名 .png
    import os
    for line in open(atlas, encoding='utf-8').read().splitlines():
        if line.strip().endswith('.png'):
            path = os.path.join(os.path.dirname(atlas), line.strip())
            if os.path.exists(path):
                return path
            break
    return atlas[:-6] + '.png'


def box(r):
    x, y = map(int, r['xy'].split(','))
    w, h = map(int, r['size'].split(','))
    bw, bh = (h, w) if r.get('rotate') == 'true' else (w, h)
    return (x, y, x + bw, y + bh)


def alpha(img):
    return np.asarray(img.resize((48, 48)).split()[3], dtype=float).ravel() / 255


def iou(p, q):
    return float(np.minimum(p, q).sum() / max(np.maximum(p, q).sum(), 1e-6))


def main():
    orig_atlas, skin_atlas = sys.argv[1], sys.argv[2]
    ro, rs = parse(orig_atlas), parse(skin_atlas)
    io = Image.open(page_png(orig_atlas)).convert('RGBA')
    skin_png = page_png(skin_atlas)
    is_ = Image.open(skin_png).convert('RGBA')
    flipped = []
    for n in ro:
        if n not in rs:
            continue
        po = alpha(io.crop(box(ro[n])))
        cs = is_.crop(box(rs[n]))
        keep, turn = iou(po, alpha(cs)), iou(po, alpha(cs.rotate(180)))
        if turn > keep + 0.03:
            flipped.append(n)
            print(f'转反 {n:16s} rotate={rs[n].get("rotate")} 原样={keep:.2f} 转180={turn:.2f}')
    print(f'共 {len(flipped)} 块转反')
    if '--fix' in sys.argv and flipped:
        for n in flipped:
            b = box(rs[n])
            is_.paste(is_.crop(b).rotate(180), b)
        is_.save(skin_png)
        print('已转回:', skin_png)


if __name__ == '__main__':
    main()
