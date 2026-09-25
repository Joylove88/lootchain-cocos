# -*- coding: utf-8 -*-
"""
构建后处理:把 Web 构建产物里的 PNG 量化成 256 色调色板(docs/31「构建产物体积」)。

- 只动构建产物(默认 build/web-mobile),不碰 assets/ 源素材——源图保持原样,符合"素材先备份、不改原图"规则。
- 首选 libimagequant(pngquant 引擎,`pip install imagequant`):带透明度也能抖动,设质量下限 MIN_QUALITY,
  达不到下限就保留原图——"不影响实际效果才压"(2026-09-24 用户要求)。骨骼特效光晕/英雄图集也走它。
- 没装 imagequant 时退回 Pillow:不透明图 RGB+FS 抖动,透明 UI 调色板量化,骨骼贴图不动(Pillow 带透明量化不抖动会出色带)。
- 只在结果更小时替换;已是调色板(P 模式)的跳过,所以重复执行是幂等的。
- 用法:
    python scripts/compress-build-png.py                 # 默认 build/web-mobile
    python scripts/compress-build-png.py build/web-desktop --skip spine/effect --dry-run
  或 npm run compress:build
"""
import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

from PIL import Image

try:
    import imagequant  # libimagequant 绑定
except Exception:  # 未安装时退回 Pillow 路径
    imagequant = None

# libimagequant 质量(0~100,同 pngquant --quality):达不到 MIN_QUALITY 就不压,保原图。
MIN_QUALITY = 80
MAX_QUALITY = 100


def _has_real_alpha(im):
    if im.mode not in ('LA', 'RGBA') and 'transparency' not in im.info:
        return False
    alpha = im.convert('RGBA').getchannel('A')
    return alpha.getextrema()[0] < 255


def compress_one(task):
    """task = (path, spine_mode)。返回 (path, before, after, status)。"""
    path, spine_mode = task
    try:
        before = os.path.getsize(path)
        with Image.open(path) as im:
            im.load()
            if im.mode == 'P':
                return path, before, before, 'skip-palette'
            has_alpha = _has_real_alpha(im)
            if imagequant is not None and spine_mode != 'palette':
                try:
                    quant = imagequant.quantize_pil_image(im.convert('RGBA'), dithering_level=1.0, max_colors=256,
                                                          min_quality=MIN_QUALITY, max_quality=MAX_QUALITY)
                except RuntimeError:
                    return path, before, before, 'skip-quality'
            elif not has_alpha:
                # 不透明图:RGB 调色板 + Floyd-Steinberg 抖动(Pillow 只对 RGB 抖动),立绘/背景渐变不出色带。
                quant = im.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
            else:
                # 带透明度:Pillow 的 RGBA 量化不抖动,柔和发光/皮肤渐变会出色带(2026-09-24 实测骨骼特效与英雄图集明显色带)。
                # 骨骼贴图(路径含 /spine/ 或 native 里的 spine 图集)默认不动;--spine palette 才强制量化。
                if spine_mode == 'keep' and _looks_like_spine(path):
                    return path, before, before, 'skip-spine'
                quant = im.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE)
        tmp = path + '.q.tmp'
        quant.save(tmp, format='PNG', optimize=True)
        after = os.path.getsize(tmp)
        if after < before:
            os.replace(tmp, path)
            return path, before, after, 'ok'
        os.remove(tmp)
        return path, before, before, 'skip-bigger'
    except Exception as error:  # 单张失败不影响整体,原文件保持不变
        tmp = path + '.q.tmp'
        if os.path.exists(tmp):
            os.remove(tmp)
        return path, 0, 0, 'error: %s' % error


SPINE_TEXTURE_UUIDS = set()


def _init_worker(uuids):
    # Windows 进程池是 spawn:子进程不继承主进程里填好的全局集合,靠 initializer 传入
    SPINE_TEXTURE_UUIDS.update(uuids)


def _looks_like_spine(path):
    norm = path.replace(os.sep, '/')
    if '/spine/' in norm:
        return True
    # 构建产物按 uuid 命名:用 --source 扫到的骨骼贴图 uuid 识别
    base = os.path.basename(norm).split('.')[0]
    return base.split('@')[0] in SPINE_TEXTURE_UUIDS


def _collect_spine_uuids(source_assets):
    import json as _json
    uuids = set()
    for dp, _dn, fn in os.walk(source_assets):
        if '/spine/' not in dp.replace(os.sep, '/') + '/':
            continue
        for f in fn:
            if f.lower().endswith('.png.meta'):
                try:
                    uuids.add(_json.load(open(os.path.join(dp, f), encoding='utf-8')).get('uuid'))
                except Exception:
                    pass
    return uuids


def main():
    try:  # Windows 控制台默认 GBK,中文统计行会乱码
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    parser = argparse.ArgumentParser(description='Quantize PNGs in a Cocos web build output.')
    parser.add_argument('build_dir', nargs='?', default='build/web-mobile')
    parser.add_argument('--skip', action='append', default=[], help='跳过路径中包含该片段的文件(可多次)')
    parser.add_argument('--dry-run', action='store_true', help='只统计,不改文件')
    parser.add_argument('--workers', type=int, default=max(1, (os.cpu_count() or 2) - 1))
    parser.add_argument('--spine', choices=['keep', 'palette'], default='keep',
                        help='带透明度的骨骼贴图:keep=不动(默认,避免色带);palette=强制 256 色量化(旧行为,体积最小但有色带)')
    parser.add_argument('--source', default='assets', help='源素材目录(用于识别构建产物里哪些 uuid 是骨骼贴图)')
    args = parser.parse_args()

    root = os.path.abspath(args.build_dir)
    if not os.path.isdir(os.path.join(root, 'assets')):
        print('找不到构建产物:%s(先在 Creator 里构建 web 平台)' % root)
        return 2
    files = []
    for dp, _dn, fn in os.walk(root):
        for f in fn:
            if f.lower().endswith('.png'):
                full = os.path.join(dp, f)
                rel = os.path.relpath(full, root).replace(os.sep, '/')
                if any(s in rel for s in args.skip):
                    continue
                files.append(full)
    total_before = sum(os.path.getsize(f) for f in files)
    print('PNG %d 张,%.1f MB' % (len(files), total_before / 1048576))
    if args.dry_run:
        return 0

    if args.spine == 'keep' and os.path.isdir(args.source):
        SPINE_TEXTURE_UUIDS.update(_collect_spine_uuids(args.source))
    started = time.time()
    stats = {'ok': 0, 'skip-palette': 0, 'skip-bigger': 0, 'skip-spine': 0, 'skip-quality': 0, 'error': 0}
    print('量化引擎:%s' % ('libimagequant(质量下限 %d)' % MIN_QUALITY if imagequant is not None and args.spine != 'palette' else 'Pillow'))
    after_total = 0
    errors = []
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker, initargs=(frozenset(SPINE_TEXTURE_UUIDS),)) as pool:
        tasks = [(f, args.spine) for f in files]
        for path, before, after, status in pool.map(compress_one, tasks, chunksize=16):
            key = 'error' if status.startswith('error') else status
            stats[key] += 1
            after_total += after if after else os.path.getsize(path)
            if key == 'error':
                errors.append((path, status))
    print('完成 %.0fs:压缩 %d / 已是调色板 %d / 量化后更大保留原图 %d / 达不到质量下限保留原图 %d / 骨骼贴图未动 %d / 失败 %d' % (
        time.time() - started, stats['ok'], stats['skip-palette'], stats['skip-bigger'], stats['skip-quality'], stats['skip-spine'], stats['error']))
    print('PNG %.1f MB -> %.1f MB' % (total_before / 1048576, after_total / 1048576))
    build_total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _dn, fn in os.walk(root) for f in fn)
    print('构建产物总量 %.1f MB' % (build_total / 1048576))
    for path, status in errors[:20]:
        print('  失败', os.path.relpath(path, root), status)
    report = os.path.join(root, 'png-compress-report.json')
    with open(report, 'w', encoding='utf-8') as fp:
        json.dump({'files': len(files), 'before': total_before, 'after': after_total, 'stats': stats,
                   'buildTotal': build_total, 'errors': errors[:200]}, fp, ensure_ascii=False, indent=1)
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
