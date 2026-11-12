# -*- coding: utf-8 -*-
"""从 Poly Haven(polyhaven.com,素材全部 CC0)取一个现成的写实模型的 glTF 版,做「引擎不是瓶颈」的对照验证用。

只读它公开的接口:/files/<素材名> 给出每个文件的地址、大小和校验值;按原来的相对路径(textures/…)存到指定目录,下完逐个核对校验值。
下载下来的文件一律当数据看待:存到游戏仓库之外的单独目录里,不在那个目录里跑任何东西。

用法:python tools/proto3d/guard_battle/ref_fetch.py <素材名> <1k|2k|4k> <输出目录>
例:  python tools/proto3d/guard_battle/ref_fetch.py gothic_statue 2k D:/project/lootchain-3d-ref/gothic_statue
"""
import hashlib
import json
import os
import sys
import urllib.request

UA = {'User-Agent': 'asset-check/1.0'}


def get_json(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={**UA, 'Accept': 'application/json'}), timeout=60))


def fetch(url, path, md5):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()
    if md5 and hashlib.md5(data).hexdigest() != md5:
        raise SystemExit(f'校验值不对:{os.path.basename(path)}')
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    aid, res, out = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3])
    if os.path.isdir(out) and os.listdir(out):
        raise SystemExit(f'输出目录不是空的:{out}')
    entry = get_json(f'https://api.polyhaven.com/files/{aid}').get('gltf', {}).get(res, {}).get('gltf')
    if not entry:
        raise SystemExit(f'没有 {aid} 的 glTF {res} 版')
    total = fetch(entry['url'], os.path.join(out, entry['url'].split('/')[-1]), entry.get('md5'))
    for rel, v in entry.get('include', {}).items():
        if '..' in rel or os.path.isabs(rel):
            raise SystemExit(f'可疑的相对路径:{rel}')
        total += fetch(v['url'], os.path.join(out, *rel.split('/')), v.get('md5'))
        print('  ', rel, v.get('size'))
    print(f'{aid} {res}:{total / 1048576:.1f} MB → {out}')


if __name__ == '__main__':
    main()
