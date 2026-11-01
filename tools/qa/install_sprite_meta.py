# -*- coding: utf-8 -*-
"""给新入库的透明 PNG 写 sprite-frame meta(2026-11-01):trim none、尺寸按实图,模板沿用 ui/hero/proto/band_star.png.meta(新 uuid)。
已有 meta 只更新尺寸 / 裁边,不换 uuid。Creator 导入新图默认是 texture,不改成 sprite-frame 运行时 resources.load(SpriteFrame) 取不到。
用法:python tools/qa/install_sprite_meta.py <png> [<png> ...]
"""
import io, json, os, sys, uuid
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TPL = os.path.join(ROOT, 'assets', 'resources', 'ui', 'hero', 'proto', 'band_star.png.meta')


def write_meta(path):
    w, h = Image.open(path).size
    name = os.path.splitext(os.path.basename(path))[0]
    meta_path = path + '.meta'
    if os.path.exists(meta_path):
        m = json.load(io.open(meta_path, encoding='utf-8'))
    else:
        tpl = io.open(TPL, encoding='utf-8').read()
        m = json.loads(tpl.replace(json.loads(tpl)['uuid'], str(uuid.uuid4())))
        for sub in m['subMetas'].values():
            sub['displayName'] = name
    m['userData']['hasAlpha'] = True
    sub_key = next(k for k, v in m['subMetas'].items() if v.get('importer') == 'sprite-frame')
    sf = m['subMetas'][sub_key]['userData']
    sf['trimType'] = 'none'
    for key, v in (('width', w), ('height', h), ('rawWidth', w), ('rawHeight', h), ('trimX', 0), ('trimY', 0), ('offsetX', 0), ('offsetY', 0)):
        sf[key] = v
    if 'vertices' in sf:
        hw, hh = w // 2, h // 2
        sf['vertices']['rawPosition'] = [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0]
        sf['vertices']['minPos'] = [-hw, -hh, 0]
        sf['vertices']['maxPos'] = [hw, hh, 0]
        sf['vertices']['uv'] = [0, h, w, h, 0, 0, w, 0]
    io.open(meta_path, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
    print('meta', path, w, h)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        write_meta(p)
