# -*- coding: utf-8 -*-
"""模型(.glb / .gltf)被 Creator 导入之后,改它的 .meta:
- 自带的贴图子资源:打开多级渐远 + 各向异性(默认是关的,缩小了看会闪、斜着看会糊);
- 模型:法线 / 切线设成「没有就算出来」(AI 生成的模型不带切线,法线贴图要用)。
改完要再触发一次导入(curl http://localhost:7456/asset-db/refresh)。

用法:python gltf_meta_fix.py <assets 下的目录>
"""
import glob
import io
import json
import os
import sys


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    root = sys.argv[1]
    metas = glob.glob(os.path.join(root, '**', '*.glb.meta'), recursive=True) + glob.glob(os.path.join(root, '**', '*.gltf.meta'), recursive=True)
    for p in metas:
        m = json.load(io.open(p, encoding='utf-8'))
        ud = m.setdefault('userData', {})
        before = (ud.get('normals'), ud.get('tangents'))
        ud['normals'] = 2      # 0 可有可无 / 1 不要 / 2 没有就算 / 3 重算
        ud['tangents'] = 2
        n = 0
        for sm in m.get('subMetas', {}).values():
            if sm.get('importer') == 'texture':
                t = sm.setdefault('userData', {})
                t['minfilter'] = 'linear'
                t['magfilter'] = 'linear'
                t['mipfilter'] = 'linear'
                t['anisotropy'] = 8
                n += 1
        io.open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
        print(f'{os.path.relpath(p, root)}:法线 / 切线 {before} → (2, 2),贴图 {n} 张开了多级渐远和各向异性')
    if not metas:
        print('没找到 .glb.meta / .gltf.meta(模型还没被 Creator 导入?)')


if __name__ == '__main__':
    main()
