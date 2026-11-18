# -*- coding: utf-8 -*-
"""预渲染 2.5D:素材导入后改 meta(Creator 新导入的图默认是 texture、重复平铺、线性过滤)。

  python tools/proto3d/pre25/fix_meta.py <资源目录 ...>

- 颜色块 c_*:要 sprite-frame(当贴地件用),先跑 tools/qa/install_sprite_meta.py 写好 sprite-frame meta,这里补「边缘夹住、不透明」;
- 遮挡块 o_*:texture,边缘夹住、最近点取样、不要多级渐远(深度拆成两个 8 位,插值会搅坏);
- 其余图(主角图集页):texture,边缘夹住。
改完要再 curl http://localhost:7456/asset-db/refresh。
"""
import glob
import io
import json
import os
import sys

for d in sys.argv[1:]:
    for p in glob.glob(os.path.join(d, '*.meta')):
        name = os.path.basename(p)
        if name.endswith('.json.meta'):
            continue
        m = json.load(io.open(p, encoding='utf-8'))
        for sub in m.get('subMetas', {}).values():
            if sub.get('importer') == 'texture':
                u = sub['userData']
                u['wrapModeS'] = 'clamp-to-edge'
                u['wrapModeT'] = 'clamp-to-edge'
                if name.startswith('o_'):
                    u['minfilter'] = 'nearest'
                    u['magfilter'] = 'nearest'
                    u['mipfilter'] = 'none'
        if name.startswith('c_'):
            m.setdefault('userData', {})['hasAlpha'] = False
        io.open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
        print('meta', p)
