# -*- coding: utf-8 -*-
"""
构建后处理:把 Web 构建产物里的 PNG 量化成 256 色调色板(docs/31「构建产物体积」)。

- 只动构建产物(默认 build/web-mobile),不碰 assets/ 源素材——源图保持原样,符合"素材先备份、不改原图"规则。
- 用 libimagequant(pngquant 引擎,`pip install imagequant`):带透明度也能抖动,设质量下限 MIN_QUALITY,
  达不到下限就保留原图——"不影响实际效果才压"(2026-09-24 用户要求)。
- **没装 imagequant 直接报错退出**(2026-11-11):原先会悄悄退回 Pillow——带透明的图走不抖动的 256 色量化,
  换新电脑后漏装了这个库,11-07 ~ 11-10 的线上包里战场地面近景成了色块、雾带只剩 5 种颜色、野外树石和各界面柔光全是色带,
  而预览不走压缩,谁也没看见。确实要用 Pillow 兜底时显式加 --allow-pillow。
- 不压的:骨骼贴图(--spine keep,默认;英雄 / 怪物 / 特效光晕压成 256 色会出颗粒)、预乘图集、KEEP_PATHS 里点名的大面积渐变图。
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
# 点名不压(源素材相对 assets/resources 的路径前缀):大面积平滑渐变的图,256 色怎么抖都会露馅。
# 另外:还在用「整图 + _near 透明近景」两张 PNG 的分层战斗背景(近景和整图逐像素相同,各压各的就对不上)也不压,见 _collect_keep_uuids;
# 高清版背景(2026-11-11)是 JPG + 遮罩,不走这里。
KEEP_PATHS = (
    'ui/battle/battle_fog_strip',  # 流动的雾带
    'ui/battle/font/',             # 伤害数字位图字(渐变 + 描边)
)


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
        # 预乘透明的骨骼图集(源 .atlas 标了 pma: true,目前是 hu_* 满屏大招)一律不量化:调色板量化按直通透明处理,
        # 会给完全透明的像素留下颜色,预乘混合(ONE, ONE_MINUS_SRC_ALPHA)下直接叠到画面上,
        # 实机就是发绿的矩形 + 锯齿边(2026-10-07 用户手机实测罗恩大招 hu_100)。
        if _uuid_of(path) in PMA_TEXTURE_UUIDS:
            return path, before, before, 'skip-pma'
        if _uuid_of(path) in KEEP_TEXTURE_UUIDS:
            return path, before, before, 'skip-listed'
        # 骨骼贴图(英雄 / 怪物 / 特效)默认不动:256 色抖动会让特效光晕和角色渐变起颗粒(2026-11-11 用户要「精致高清」)
        if spine_mode == 'keep' and _looks_like_spine(path):
            return path, before, before, 'skip-spine'
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
            if has_alpha and _transparent_rgb_is_black(im):
                _zero_transparent_palette(quant)
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


def _transparent_rgb_is_black(im):
    """源图完全透明的像素是否(几乎)都是黑色:预乘图集的特征(RGB ≤ A),没在图集头标 pma 的预乘图集也靠这条认出来。
    导出工具常留几千个带色残点(召唤宝箱怪 boxman_text 约 2%),按 ≥98% 算。"""
    rgba = im.convert('RGBA')
    mask = rgba.getchannel('A').point(lambda v: 255 if v == 0 else 0)
    transparent = mask.histogram()[255]
    if transparent == 0:
        return False
    black = Image.new('RGBA', rgba.size, (0, 0, 0, 0))
    lum = Image.composite(rgba, black, mask).convert('RGB').convert('L').point(lambda v: 255 if v > 0 else 0)
    colored = lum.histogram()[255]
    return colored <= transparent * 0.02


def _zero_transparent_palette(quant):
    """量化后调色板里 alpha=0 的颜色清成黑色:量化器会给完全透明的像素随手配上别的颜色,
    预乘混合(ONE, ONE_MINUS_SRC_ALPHA)下这些颜色直接叠到画面上——2026-10-30 线上召唤页限定池骨骼满屏绿块。"""
    if quant.mode != 'P':
        return
    pal = quant.getpalette('RGBA')
    if not pal:
        return
    changed = False
    for i in range(0, len(pal), 4):
        if pal[i + 3] == 0 and (pal[i] or pal[i + 1] or pal[i + 2]):
            pal[i:i + 3] = [0, 0, 0]
            changed = True
    if changed:
        quant.putpalette(pal, 'RGBA')


SPINE_TEXTURE_UUIDS = set()
PMA_TEXTURE_UUIDS = set()
KEEP_TEXTURE_UUIDS = set()


def _init_worker(uuids, pma_uuids=frozenset(), keep_uuids=frozenset()):
    # Windows 进程池是 spawn:子进程不继承主进程里填好的全局集合,靠 initializer 传入
    SPINE_TEXTURE_UUIDS.update(uuids)
    PMA_TEXTURE_UUIDS.update(pma_uuids)
    KEEP_TEXTURE_UUIDS.update(keep_uuids)


def _collect_keep_uuids(source_assets):
    # KEEP_PATHS 点名的源图 → uuid(构建产物按 uuid 命名)
    import json as _json
    uuids = set()
    base = os.path.join(source_assets, 'resources')
    for dp, _dn, fn in os.walk(base):
        for f in fn:
            if not f.lower().endswith('.png.meta'):
                continue
            rel = os.path.relpath(os.path.join(dp, f), base).replace(os.sep, '/')
            metas = []
            if any(rel.startswith(prefix) for prefix in KEEP_PATHS):
                metas.append(os.path.join(dp, f))
            if rel.startswith('ui/battle/battle_scene_') and rel.endswith('_near.png.meta'):
                # 分层背景:近景 + 它对应的整图
                metas.append(os.path.join(dp, f))
                metas.append(os.path.join(dp, f[:-len('_near.png.meta')] + '.png.meta'))
            for meta in metas:
                try:
                    uuids.add(_json.load(open(meta, encoding='utf-8')).get('uuid'))
                except Exception:
                    pass
    return uuids


def _uuid_of(path):
    return os.path.basename(path.replace(os.sep, '/')).split('.')[0].split('@')[0]


def _collect_pma_uuids(source_assets):
    """源素材里图集头带 pma: true 的骨骼目录 → 该目录下 PNG 的 uuid。"""
    import json as _json
    uuids = set()
    for dp, _dn, fn in os.walk(source_assets):
        atlases = [f for f in fn if f.lower().endswith('.atlas')]
        if not atlases:
            continue
        pma = False
        for a in atlases:
            try:
                with open(os.path.join(dp, a), encoding='utf-8') as fp:
                    if any(line.strip().lower() == 'pma: true' for line in fp):
                        pma = True
                        break
            except Exception:
                pass
        if not pma:
            continue
        for f in fn:
            if f.lower().endswith('.png.meta'):
                try:
                    uuids.add(_json.load(open(os.path.join(dp, f), encoding='utf-8')).get('uuid'))
                except Exception:
                    pass
    return uuids


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
    parser.add_argument('--allow-pillow', action='store_true', help='没装 imagequant 时允许退回 Pillow(带透明的图会有色带,正式出包不要用)')
    args = parser.parse_args()
    if imagequant is None and not args.allow_pillow:
        print('缺少 imagequant(libimagequant 绑定):先 pip install imagequant 再出包。')
        print('没有它只能走 Pillow 的不抖动量化,带透明的图会出色块 / 色带(2026-11-07 ~ 11-10 的线上包就是这么来的)。')
        return 3

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
    if os.path.isdir(args.source):
        PMA_TEXTURE_UUIDS.update(_collect_pma_uuids(args.source))
        print('预乘透明骨骼贴图(不量化):%d 张' % len(PMA_TEXTURE_UUIDS))
        KEEP_TEXTURE_UUIDS.update(_collect_keep_uuids(args.source))
        print('点名不压的图:%d 张' % len(KEEP_TEXTURE_UUIDS))
    started = time.time()
    stats = {'ok': 0, 'skip-palette': 0, 'skip-bigger': 0, 'skip-spine': 0, 'skip-quality': 0, 'skip-pma': 0, 'skip-listed': 0, 'error': 0}
    engine = 'libimagequant' if imagequant is not None and args.spine != 'palette' else 'pillow'
    print('量化引擎:%s' % ('libimagequant(质量下限 %d)' % MIN_QUALITY if engine == 'libimagequant' else 'Pillow(带透明的图不抖动,会有色带)'))
    after_total = 0
    errors = []
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker,
                             initargs=(frozenset(SPINE_TEXTURE_UUIDS), frozenset(PMA_TEXTURE_UUIDS), frozenset(KEEP_TEXTURE_UUIDS))) as pool:
        tasks = [(f, args.spine) for f in files]
        for path, before, after, status in pool.map(compress_one, tasks, chunksize=16):
            key = 'error' if status.startswith('error') else status
            stats[key] += 1
            after_total += after if after else os.path.getsize(path)
            if key == 'error':
                errors.append((path, status))
    print('完成 %.0fs:压缩 %d / 已是调色板 %d / 量化后更大保留原图 %d / 达不到质量下限保留原图 %d / 骨骼贴图未动 %d / 预乘图集未动 %d / 点名不压 %d / 失败 %d' % (
        time.time() - started, stats['ok'], stats['skip-palette'], stats['skip-bigger'], stats['skip-quality'], stats['skip-spine'], stats['skip-pma'],
        stats['skip-listed'], stats['error']))
    print('PNG %.1f MB -> %.1f MB' % (total_before / 1048576, after_total / 1048576))
    build_total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _dn, fn in os.walk(root) for f in fn)
    print('构建产物总量 %.1f MB' % (build_total / 1048576))
    for path, status in errors[:20]:
        print('  失败', os.path.relpath(path, root), status)
    report = os.path.join(root, 'png-compress-report.json')
    with open(report, 'w', encoding='utf-8') as fp:
        json.dump({'files': len(files), 'before': total_before, 'after': after_total, 'engine': engine, 'stats': stats,
                   'buildTotal': build_total, 'errors': errors[:200]}, fp, ensure_ascii=False, indent=1)
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
