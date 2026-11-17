# -*- coding: utf-8 -*-
"""把角色模型临时放进工程 / 看完移出。模型不进仓库(在 D:\\project\\lootchain-3d-ref\\chars),留在工程里会被打进资源包。

  python tools/proto3d/char3d/stage_chars.py in  [--lod] [--keys=hero_m,hero_f,rat,wolf,spider2,bear,rotbear]
  python tools/proto3d/char3d/stage_chars.py out

in:(有的话)先把 <键>/moves/ 下动作库转套出来的招式(moves.glb + moves_data.json,见 mixamo_retarget.py)拷到 assets/resources/g3d_moves/<键>/;
    拷 <键>/anim_model.glb(--lod 则拷 anim_model_lod.glb,没有就先用 glb_lod.py 出一份)到 assets/resources/g3d_char/<键>/<键>.glb,
    让 Creator 导入,再跑 gltf_meta_fix.py(贴图多级渐远 + 各向异性、算切线)。Creator 预览(7456)要开着。
out:整个 assets/resources/g3d_char 和 g3d_moves 删掉(连 .meta),再让 Creator 刷新。
换另一套(原版 ↔ 低配)之前先 out 再 in。
"""
import os
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
SRC = os.environ.get('LC_CHAR_SRC', r'D:\project\lootchain-3d-ref\chars')
DST = os.path.join(ROOT, 'assets', 'resources', 'g3d_char')
MOVES = os.path.join(ROOT, 'assets', 'resources', 'g3d_moves')
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
KEYS = [k for k in OPT.get('keys', 'hero_m,hero_f,rat,wolf,spider2,bear,rotbear').split(',') if k]
CMD = next((a for a in sys.argv[1:] if not a.startswith('--')), 'in')


def refresh(wait):
    try:
        urllib.request.urlopen('http://localhost:7456/asset-db/refresh', timeout=180).read()
    except Exception as e:  # noqa: BLE001
        print('refresh error', e)
    time.sleep(wait)


def main():
    if CMD == 'in':
        lod = bool(OPT.get('lod'))
        for k in KEYS:
            src = os.path.join(SRC, k, 'anim_model_lod.glb' if lod else 'anim_model.glb')
            if lod and not os.path.exists(src):
                subprocess.run([sys.executable, '-I', os.path.join(HERE, 'glb_lod.py'), os.path.join(SRC, k, 'anim_model.glb'), src], check=True)
            d = os.path.join(DST, k)
            os.makedirs(d, exist_ok=True)
            shutil.copy2(src, os.path.join(d, k + '.glb'))
            print('in', k, 'lod' if lod else 'full', os.path.getsize(src))
            mv = os.path.join(SRC, k, 'moves')
            if os.path.exists(os.path.join(mv, 'moves.glb')) and not OPT.get('nomoves'):
                md = os.path.join(MOVES, k)
                os.makedirs(md, exist_ok=True)
                for name in ('moves.glb', 'moves_data.json'):
                    shutil.copy2(os.path.join(mv, name), os.path.join(md, name))
                print('in', k, 'moves', os.path.getsize(os.path.join(mv, 'moves.glb')))
        refresh(25)
        for _ in range(30):
            if all(os.path.exists(os.path.join(DST, k, k + '.glb.meta')) for k in KEYS):
                break
            time.sleep(3)
        subprocess.run([sys.executable, os.path.join(HERE, 'gltf_meta_fix.py'), DST], check=False)
        refresh(25)
        print('staged', 'lod' if lod else 'full')
    elif CMD == 'out':
        for d in (DST, MOVES):
            if os.path.isdir(d):
                shutil.rmtree(d)
            if os.path.exists(d + '.meta'):
                os.remove(d + '.meta')
        refresh(8)
        print('removed', not os.path.exists(DST))


main()
