# -*- coding: utf-8 -*-
"""把「图转 3D」的建筑模型临时放进工程 / 看完移出。模型不进仓库(在 D:\\project\\lootchain-3d-ref\\chars\\bld_<键>),留在工程里会被打进资源包。

  python tools/proto3d/char3d/stage_bld.py in  --keys=smithy[,cathedral,house,…,ground]   (ground = 石板地面的贴图 bld_ground/ground.jpg)
  python tools/proto3d/char3d/stage_bld.py out

in:拷 bld_<键>/ 下转出来的带贴图模型(gen_*pbr_model*.glb,没有就取最大的那个 glb)到 assets/resources/g3d_bld/<键>/<键>.glb,
    让 Creator 导入,再跑 gltf_meta_fix.py(贴图多级渐远 + 各向异性、算切线)。Creator 预览(7456)要开着。
out:整个 assets/resources/g3d_bld 删掉(连 .meta),再让 Creator 刷新。
主城里用 &bld=smithy 打开(见 G3DDungeon.ts 的 loadCityBuildings)。
"""
import glob
import os
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
SRC = os.environ.get('LC_CHAR_SRC', r'D:\project\lootchain-3d-ref\chars')
DST = os.path.join(ROOT, 'assets', 'resources', 'g3d_bld')
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
KEYS = [k for k in OPT.get('keys', 'smithy').split(',') if k]
CMD = next((a for a in sys.argv[1:] if not a.startswith('--')), 'in')


def refresh(wait):
    try:
        urllib.request.urlopen('http://localhost:7456/asset-db/refresh', timeout=180).read()
    except Exception as e:  # noqa: BLE001
        print('refresh error', e)
    time.sleep(wait)


def pick(key):
    d = os.path.join(SRC, 'bld_' + key)
    glbs = glob.glob(os.path.join(d, '*.glb'))
    if not glbs:
        raise SystemExit('没有模型:' + d)
    pbr = [g for g in glbs if 'pbr' in os.path.basename(g).lower()]
    return max(pbr or glbs, key=os.path.getsize)


def main():
    if CMD == 'in':
        for k in KEYS:
            if k == 'ground':          # 石板地面的贴图是一张图,不是模型
                d = os.path.join(DST, k)
                os.makedirs(d, exist_ok=True)
                shutil.copy2(os.path.join(SRC, 'bld_ground', 'ground.jpg'), os.path.join(d, 'ground.jpg'))
                print('in ground ground.jpg')
                continue
            src = pick(k)
            d = os.path.join(DST, k)
            os.makedirs(d, exist_ok=True)
            shutil.copy2(src, os.path.join(d, k + '.glb'))
            print('in', k, os.path.basename(src), os.path.getsize(src))
        refresh(20)
        for _ in range(30):
            if all(os.path.exists(os.path.join(DST, k, k + ('.jpg.meta' if k == 'ground' else '.glb.meta'))) for k in KEYS):
                break
            time.sleep(3)
        subprocess.run([sys.executable, '-I', os.path.join(HERE, 'gltf_meta_fix.py'), DST], check=False)
        refresh(20)
        print('staged')
    else:
        existed = os.path.exists(DST)
        shutil.rmtree(DST, ignore_errors=True)
        if os.path.exists(DST + '.meta'):
            os.remove(DST + '.meta')
        refresh(5)
        print('removed', existed)


if __name__ == '__main__':
    main()
