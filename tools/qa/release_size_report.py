# -*- coding: utf-8 -*-
"""正式包包体报告(2026-11-12,主城会话):只读 asset-manifest.json,不起浏览器、不改任何文件。
出完包先跑这个,把「整包 / 开局包多大、比上一版多在哪」的实际数字报给用户;同时离线核对「按设备只下一套主城图」的剔除规则。

  1. 整包 / 开局包的文件数和大小;开局包按目录、按文件类型(真彩 PNG = 没被压缩的)分账;
  2. 主城两套图(ui/world/citymoon 标准版、ui/world/citymoon_hd 高清版)各多大、有没有混进开局包;
     按 AssetOfflineCache.dropUnusedArt 的规则算电脑端 / 手持端各剔除多少(前缀表与 DeviceTier.unusedArtPrefixes 保持一致);
  3. 资源路径反查不出来的文件(会被强制算进开局包,也没法按设备剔除);
  4. 给了上一版清单就逐目录对比(可以直接给上一版的发版压缩包,脚本自己从里面取清单)。

用法:PYTHONUTF8=1 python tools/qa/release_size_report.py [当前清单] [上一版清单 或 上一版 tar.gz] [--png]
  当前清单缺省 build/web-mobile/asset-manifest.json;--png 会逐个打开开局包里的 PNG 看是不是调色板图(要 Pillow,十几秒)。
"""
import json
import os
import sys
import tarfile
from collections import defaultdict

MB = 1024 * 1024
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BUILD = os.path.join(ROOT, 'build', 'web-mobile')

# 与 assets/scripts/app/DeviceTier.ts 的 unusedArtPrefixes() 保持一致
DROP_ON_DESKTOP = ['ui/world/citymoon/base_', 'ui/world/citymoon/mask_', 'ui/world/citymoon/tree_',
                   'ui/world/citymoon/cloth_', 'ui/world/citymoon/water_']
DROP_ON_HANDHELD = ['ui/world/citymoon_hd/']


def load(path):
    if path.endswith('.tar.gz') or path.endswith('.tgz'):
        with tarfile.open(path, 'r:gz') as tar:
            for member in tar:
                if member.name.rsplit('/', 1)[-1] == 'asset-manifest.json':
                    return json.load(tar.extractfile(member))
        raise SystemExit('压缩包里没有 asset-manifest.json:' + path)
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def rows_of(manifest):
    files = manifest['files']
    res = manifest.get('res') or [''] * len(files)
    core = manifest.get('core', len(files))
    return [(rel, size, res[i], i < core) for i, (rel, size) in enumerate(files)]


def folder_of(rel, res, depth=2):
    if not rel.startswith('assets/resources/'):
        return '(引擎 / 脚本 / main / internal)'
    if res == '':
        return '(资源包配置 / 合包 JSON / 反查不到路径)'
    return '/'.join(res.split('/')[:depth])


def totals(rows):
    return (len(rows), sum(r[1] for r in rows), sum(1 for r in rows if r[3]), sum(r[1] for r in rows if r[3]))


def by_folder(rows, core_only, depth=2):
    out = defaultdict(lambda: [0, 0])
    for rel, size, res, core in rows:
        if core_only and not core:
            continue
        key = folder_of(rel, res, depth)
        out[key][0] += size
        out[key][1] += 1
    return out


def print_totals(label, manifest, rows):
    n, b, cn, cb = totals(rows)
    print(f'== {label}:版本 {manifest.get("version")} ==')
    print(f'  整包 {n} 个文件 {b / MB:.1f} MB;开局包 {cn} 个文件 {cb / MB:.1f} MB')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    want_png = '--png' in sys.argv
    cur_path = args[0] if args else os.path.join(BUILD, 'asset-manifest.json')
    cur = load(cur_path)
    rows = rows_of(cur)
    print_totals('当前包', cur, rows)

    print('== 开局包按目录(前 20)==')
    for key, (b, n) in sorted(by_folder(rows, True).items(), key=lambda x: -x[1][0])[:20]:
        print(f'  {b / MB:8.2f} MB  {n:5d} 个  {key}')

    # 主城两套图
    groups = defaultdict(lambda: [0, 0, 0])
    for rel, size, res, core in rows:
        if res.startswith('ui/world/citymoon_hd/'):
            key = '高清版 citymoon_hd'
        elif any(res.startswith(p) for p in DROP_ON_DESKTOP):
            key = '标准版 citymoon(底图 / 遮罩 / 抠图)'
        elif res.startswith('ui/world/citymoon/'):
            key = '两端共用 citymoon(鸟瞰图等)'
        else:
            continue
        groups[key][0] += 1
        groups[key][1] += size
        groups[key][2] += 1 if core else 0
    print('== 主城两套图 ==')
    for key in sorted(groups):
        c, b, k = groups[key]
        print(f'  {key:36s} {c:4d} 个 {b / MB:7.2f} MB;其中在开局包里 {k} 个' + ('  ← 不应该进开局包' if k else ''))
    n, b, cn, cb = totals(rows)
    for label, skip in (('电脑端(用高清版,剔除标准版)', DROP_ON_DESKTOP), ('手持端(用标准版,剔除高清版)', DROP_ON_HANDHELD)):
        dropped = [r for r in rows if any(r[2].startswith(p) for p in skip)]
        db = sum(r[1] for r in dropped)
        dc = sum(r[1] for r in dropped if r[3])
        print(f'  {label}:剔除 {len(dropped)} 个 {db / MB:.2f} MB → 要下 {(b - db) / MB:.1f} MB,开局包 {(cb - dc) / MB:.1f} MB')

    unresolved = sorted(((size, rel) for rel, size, res, _ in rows if rel.startswith('assets/resources/') and res == ''), reverse=True)
    print(f'== 反查不到资源路径的文件(强制进开局包):{len(unresolved)} 个 {sum(s for s, _ in unresolved) / MB:.1f} MB ==')
    for size, rel in unresolved[:6]:
        print(f'  {size / MB:7.2f} MB  {rel}')

    if want_png:
        from PIL import Image
        build_dir = os.path.dirname(os.path.abspath(cur_path))
        kinds = defaultdict(lambda: [0, 0])
        raw_by_folder = defaultdict(lambda: [0, 0])
        for rel, size, res, core in rows:
            if not core:
                continue
            ext = rel.rsplit('.', 1)[-1].lower()
            kind = ext
            if ext == 'png':
                try:
                    mode = Image.open(os.path.join(build_dir, rel)).mode
                except Exception:
                    mode = '?'
                kind = 'png 调色板(已压)' if mode == 'P' else 'png 真彩(没压)'
                if mode != 'P':
                    key = folder_of(rel, res)
                    raw_by_folder[key][0] += size
                    raw_by_folder[key][1] += 1
            kinds[kind][0] += size
            kinds[kind][1] += 1
        print('== 开局包按文件类型 ==')
        for key, (b2, n2) in sorted(kinds.items(), key=lambda x: -x[1][0]):
            print(f'  {b2 / MB:8.2f} MB  {n2:5d} 个  {key}')
        print('== 开局包里没压的 PNG 按目录(前 10;骨骼贴图按规则不压)==')
        for key, (b2, n2) in sorted(raw_by_folder.items(), key=lambda x: -x[1][0])[:10]:
            print(f'  {b2 / MB:8.2f} MB  {n2:5d} 个  {key}')

    if len(args) > 1:
        prev = load(args[1])
        prev_rows = rows_of(prev)
        print_totals('上一版', prev, prev_rows)
        pn, pb, pcn, pcb = totals(prev_rows)
        print(f'== 变化:整包 {(b - pb) / MB:+.1f} MB({n - pn:+d} 个文件),开局包 {(cb - pcb) / MB:+.1f} MB({cn - pcn:+d} 个文件)==')
        for title, core_only, depth in (('开局包', True, 3), ('整包', False, 3)):
            a, c = by_folder(rows, core_only, depth), by_folder(prev_rows, core_only, depth)
            diff = sorted(((a.get(k, [0, 0])[0] - c.get(k, [0, 0])[0], k) for k in set(a) | set(c)), key=lambda x: -abs(x[0]))
            print(f'== 变化最大的目录 · {title} ==')
            for delta, key in diff[:16]:
                if abs(delta) < 0.3 * MB:
                    continue
                print(f'  {delta / MB:+8.2f} MB  {key:40s} {c.get(key, [0, 0])[0] / MB:7.2f} → {a.get(key, [0, 0])[0] / MB:7.2f} MB'
                      f'(文件 {c.get(key, [0, 0])[1]} → {a.get(key, [0, 0])[1]})')


if __name__ == '__main__':
    main()
