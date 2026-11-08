# -*- coding: utf-8 -*-
"""主城 v4 素材入库(city4_assets_gen.py 的产物 → assets/resources/ui/world/city4/);NPC 立绘按 768 高入库(对话框大立绘也用它)。

- 物件(品红 / 青色平底):tree_hq_install.prepare 硬遮罩抠图 + 边缘回填 + 裁紧(底边 = 站地线);
- 贴地件(峡谷段 / 矿坑 / 遗迹地面):抠图后外缘羽化,融进多层地表;峡谷段上下两端再做渐隐,串段时互相盖住接缝;桥不羽化;
- 按布局里最大显示宽 × 1.2 ÷ 镜头 1.4 × 1.1 预乘透明 Lanczos 缩小(上限 2048),同 world_tex_fit 口径(WebGL1 非 2 次幂无 mipmap);
- 地面材质(tex_*)→ 1024² JPG,带 mipmap / 平铺;
- 开了 groundShadows,投影 / 接地暗斑由渲染层画,素材不烘阴影;
- Codex 原图备份到 素材原始备份/gray4-20261108/。

用法:python tools/qa/gray4_install.py [名字 ...]     不带参数 = 生成目录里有的全部
"""
import json
import os
import shutil
import sys
import tempfile
import uuid

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tree_hq_install import prepare  # noqa: E402
from world_tex_fit import resize_premul  # noqa: E402
import woods_ground_install as WG  # noqa: E402
import city4_assets_gen as GEN  # noqa: E402
import city_v4_gen as LAY  # noqa: E402

ROOT = LAY.ROOT
SRC = GEN.OUT
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'city4')
BACKUP = os.path.join(ROOT, '素材原始备份', 'city4-20261108')
ZOOM = 1.4
MAX_PX = 2048


def display_widths():
    L, _ = LAY.generate()
    need = {}
    for it in L['flats'] + L['stands'] + L['tall'] + L['low'] + L['bridges'] + [L['board']] + [{'asset': LAY.C4('lamp'), 'width': 130}]:
        a = it['asset']
        need[a] = max(need.get(a, 0), it['width'])
    return need


def png_meta(name, w, h):
    m = WG.meta_for(name, '.png', w, h, False, True)
    m['userData']['hasAlpha'] = True
    m['userData']['fixAlphaTransparencyArtifacts'] = True
    return m


def ensure_dir():
    os.makedirs(DST, exist_ok=True)
    dm = DST + '.meta'
    if not os.path.exists(dm):
        with open(dm, 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'ver': '1.2.0', 'importer': 'directory', 'imported': True, 'uuid': str(uuid.uuid4()), 'files': [],
                       'subMetas': {}, 'userData': {}}, f, indent=2)


def feather(rgba, frac=0.012, ends=0.0):
    """贴地件外缘羽化(收进 1 个羽化半径再模糊);ends > 0 时上下两端各留 ends 比例做线性渐隐(串段接缝)。"""
    a = rgba.getchannel('A')
    r = max(2, round(max(rgba.size) * frac))
    soft = a.filter(ImageFilter.MinFilter(r * 2 + 1 if r < 8 else 15)).filter(ImageFilter.GaussianBlur(r))
    al = np.minimum(np.asarray(a).astype(np.float32), np.asarray(soft).astype(np.float32))
    if ends > 0:
        h = al.shape[0]
        n = max(1, round(h * ends))
        ramp = np.ones(h, np.float32)
        ramp[:n] = np.linspace(0, 1, n)
        ramp[-n:] = np.linspace(1, 0, n)
        al *= ramp[:, None]
    out = rgba.copy()
    out.putalpha(Image.fromarray(al.clip(0, 255).astype(np.uint8)))
    return out


def install_obj(name, need):
    tpl, _, key, _ = GEN.SPECS[name]
    src = os.path.join(SRC, name + '.png')
    asset = LAY.C4(name)
    os.makedirs(BACKUP, exist_ok=True)
    shutil.copy2(src, os.path.join(BACKUP, name + '.png'))
    rgba = prepare(src, key or 'magenta')
    if name == 'canal':
        # 运河段:左右两端直切串段,端头渐隐盖接缝(横向)
        rgba = feather(rgba.rotate(90, expand=True), 0.01, ends=0.06).rotate(-90, expand=True)
    elif tpl == 'flat' and name not in ('canal_bridge', 'plaza', 'boat'):
        rgba = feather(rgba, 0.015)
    disp = need.get(asset) if tpl != 'npc' else 99999
    if not disp:
        print('  (布局里没用到,按原尺寸的一半入库)', name)
        disp = rgba.width / 2
    w = min(MAX_PX, round(disp * 1.2 / ZOOM * 1.1))
    if rgba.width > w * 1.05:
        rgba = resize_premul(rgba, w, round(rgba.height * w / rgba.width))
    if tpl == 'npc' and rgba.height > 768:
        rgba = resize_premul(rgba, round(rgba.width * 768 / rgba.height), 768)
    out = os.path.join(DST, f'city4_{name}.png')
    rgba.save(out, optimize=True)
    WG.write_meta(out, png_meta(f'city4_{name}', rgba.width, rgba.height))
    print('installed', out, rgba.size, f'(显示宽 {disp:.0f})')


def install_tex(name):
    src = os.path.join(SRC, name + '.png')
    os.makedirs(BACKUP, exist_ok=True)
    shutil.copy2(src, os.path.join(BACKUP, name + '.png'))
    im = Image.open(src).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    out = os.path.join(DST, f'{name}.jpg')
    im.save(out, quality=90, subsampling=0)
    WG.write_meta(out, WG.meta_for(name, '.jpg', 1024, 1024, True, True))
    print('installed', out)


def main():
    ensure_dir()
    names = sys.argv[1:] or [n for n in GEN.SPECS if os.path.exists(os.path.join(SRC, n + '.png'))]
    need = display_widths()
    for n in names:
        if GEN.SPECS[n][0] == 'tex':
            install_tex(n)
        else:
            install_obj(n, need)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
