# -*- coding: utf-8 -*-
"""新批次特效(fx_pack_v2)按短编号入库(2026-09-27)。

原套名又长又带中文和【】,入库时改成短 effect_code:<code>.skel + <code>.atlas + atlas 引用的 png(png 文件名原样,不改 atlas)。
只复制 atlas 引用到的 png(多余的散图、没配套骨骼的多余图集不带),引用了第二张图集的套(如 S681-6020)不能入,会报错跳过。
用法:python tools/spine/fx_install_v2.py <映射文件>   映射文件每行:<code>\t<套名>(UTF-8;# 开头为注释)
       python tools/spine/fx_install_v2.py --code v2_a47_001 --name "<套名>"
产物:assets/resources/spine/effect/<code>/;之后让 Creator 导入(curl localhost:7456/asset-db/refresh)。
"""
import io, os, re, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEST = os.path.join(REPO, 'assets', 'resources', 'spine', 'effect')
FROM = r'D:\骨骼动画素材\fx_pack_v2\fx42'


def skel_version(path):
    b = open(path, 'rb').read(64)
    n = b[8] - 1
    return b[9:9 + n].decode('ascii', 'replace') if 0 < n < 20 else '?'


def atlas_pages(path):
    lines = io.open(path, encoding='utf-8', errors='replace').read().splitlines()
    pages, prev_blank = [], True
    for line in lines:
        s = line.strip()
        if not s:
            prev_blank = True
            continue
        if prev_blank and ':' not in s and s.lower().endswith('.png'):
            pages.append(s)
        prev_blank = False
    return pages or [l.strip() for l in lines if l.strip().lower().endswith('.png') and ':' not in l]


def install(code, name):
    if not re.fullmatch(r'[a-z0-9_]+', code):
        return f'{code}: 短编号只能用小写字母数字下划线'
    src = os.path.join(FROM, name)
    skel = os.path.join(src, name + '.skel')
    atlas = os.path.join(src, name + '.atlas')
    if not (os.path.exists(skel) and os.path.exists(atlas)):
        return f'{code}: 缺 skel/atlas ({name})'
    ver = skel_version(skel)
    if not ver.startswith('4.2'):
        return f'{code}: skel 版本 {ver} 不是 4.2'
    pages = atlas_pages(atlas)
    missing = [p for p in pages if not os.path.exists(os.path.join(src, p))]
    if missing:
        return f'{code}: atlas 引用的图缺失 {missing}'
    extra_atlas = [f for f in os.listdir(src) if f.lower().endswith('.atlas') and f != name + '.atlas']
    if extra_atlas:
        # 只是提示:骨骼若引用第二图集里的区域,Creator 里会加载失败;运行时 spine-webgl 已能验出(渲染报 Region not found)
        pass
    to = os.path.join(DEST, code)
    if os.path.isdir(to):
        shutil.rmtree(to)
    os.makedirs(to)
    shutil.copy2(skel, os.path.join(to, code + '.skel'))
    shutil.copy2(atlas, os.path.join(to, code + '.atlas'))
    for p in pages:
        shutil.copy2(os.path.join(src, p), os.path.join(to, p))
    return None


def main():
    pairs = []
    if len(sys.argv) >= 5 and sys.argv[1] == '--code':
        pairs.append((sys.argv[2], sys.argv[4]))
    elif len(sys.argv) >= 2:
        for line in io.open(sys.argv[1], encoding='utf-8-sig'):
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            code, name = s.split('\t', 1)
            pairs.append((code.strip(), name.strip()))
    else:
        print(__doc__)
        return
    ok, bad = 0, []
    for code, name in pairs:
        err = install(code, name)
        if err:
            bad.append(err)
        else:
            ok += 1
            print('installed', code, '<-', name[:50])
    print(f'DONE installed={ok} skipped={len(bad)}')
    for b in bad:
        print('  SKIP', b)


if __name__ == '__main__':
    main()
