# 用法:MAT_WORK=<含 raw/ 的工作目录> python tools/qa/material_icon_install.py [--dry]
# 材料图标 A 方案入库:raw(1024 暗底)→ 抠透明 → 本体等比放进 256 画布的 86% 方框居中 → 覆盖原文件(先备份)→ 改 meta 尺寸
# 暗底 + 稀有度描边由游戏内 mountItemRarityBacking 程序画(背包格 / 详情),其余地方(消耗行 / 顶栏 / 奖励)直接用透明本体
import io, json, os, shutil, sys
import numpy as np
from PIL import Image, ImageDraw
HERE = os.environ.get('MAT_WORK') or os.path.dirname(os.path.abspath(__file__))  # 工作目录(raw/ out/);默认脚本所在目录
ROOT = r'D:\project\lootchain-cocos'
BAG = os.path.join(ROOT, r'assets\resources\ui\bag\ai')
FORGE = os.path.join(ROOT, r'assets\resources\ui\forge\ai')
BAK = os.path.join(ROOT, r'素材原始备份\ui-redesign-v3-20261019\material_icons_old')
MAP = {
    'mat_enhance_stone': os.path.join(BAG, 'icon_enhance_low.png'),
    'mat_enhance_high': os.path.join(BAG, 'icon_enhance_high.png'),
    'mat_bless_stone': os.path.join(FORGE, 'icon_bless_stone.png'),
    'mat_guard_rune': os.path.join(FORGE, 'icon_guard_rune.png'),
    'mat_reroll_stone': os.path.join(BAG, 'icon_reroll_stone.png'),
    'mat_luck_stone': os.path.join(BAG, 'icon_luck_stone.png'),
    'mat_reforge_stone': os.path.join(BAG, 'icon_reforge_stone.png'),
    'mat_awaken_stone': os.path.join(BAG, 'icon_awaken_stone.png'),
    'mat_boss_mark': os.path.join(BAG, 'icon_boss_mark.png'),
    'mat_guard_core': os.path.join(BAG, 'icon_guard_core.png'),
    'mat_exp_book': os.path.join(BAG, 'icon_expbook.png'),
    'mat_regression': os.path.join(BAG, 'icon_regression.png'),
    'mat_ticket_normal': os.path.join(BAG, 'icon_ticket_normal.png'),
    'mat_ticket_hero': os.path.join(BAG, 'icon_ticket_hero.png'),
    'mat_ticket_limited': os.path.join(BAG, 'icon_ticket_limited.png'),
    'mat_gold_chest': os.path.join(BAG, 'icon_gold_chest.png'),
    'mat_shard_n': os.path.join(BAG, 'icon_shard_n.png'),
    'mat_shard_r': os.path.join(BAG, 'icon_shard_r.png'),
    'mat_shard_sr': os.path.join(BAG, 'icon_shard_sr.png'),
    'mat_shard_ssr': os.path.join(BAG, 'icon_shard_ssr.png'),
    'mat_shard_ur': os.path.join(BAG, 'icon_shard_ur.png'),
}
OUT_SIZE = 256
BOX = 0.86
T1, T2 = 12, 48
RIM = 4  # 1024 原图上 4px ≈ 256 成品 1px
DRY = '--dry' in sys.argv  # 只出到 out/ 不覆盖

def region(mask, seeds):
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), 'L').convert('RGB')
    for sx, sy in seeds:
        if img.getpixel((sx, sy))[0] == 255:
            ImageDraw.floodfill(img, (sx, sy), (128, 0, 0))
    return np.asarray(img)[:, :, 0] == 128

def cutout(path):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(np.int16); h, w = a.shape[:2]
    ring = np.concatenate([a[:24].reshape(-1, 3), a[-24:].reshape(-1, 3), a[:, :24].reshape(-1, 3), a[:, -24:].reshape(-1, 3)])
    plate = np.median(ring, axis=0); dist = np.abs(a - plate).max(axis=2)
    seeds = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    # 底 = 与四边底色近似(dist<T1)且与四边连通的区域;柔边只在底外缘 RIM px 窄带内过渡,本体一律不透明
    # (旧做法按 T2 连通区整片做半透明,深色物体本体会被抠成虚影 → 放到亮底上发灰)
    R1 = region(dist < T1, seeds)
    from PIL import ImageFilter
    grown = np.asarray(Image.fromarray(R1.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(RIM * 2 + 1))) > 0
    band = grown & ~R1
    alpha = np.full((h, w), 255, np.float32)
    alpha[band] = np.clip((dist[band] - T1) / (T2 - T1), 0.15, 1) * 255
    alpha[R1] = 0
    rgba = Image.fromarray(np.dstack([np.asarray(im), alpha.astype(np.uint8)]), 'RGBA')
    bbox = Image.fromarray((alpha > 16).astype(np.uint8) * 255).getbbox()
    return rgba.crop(bbox) if bbox else rgba, round(100 * float((alpha < 8).mean()), 1)

def fix_meta(meta_path, size):
    m = json.load(io.open(meta_path, encoding='utf-8'))
    for sub in m.get('subMetas', {}).values():
        if sub.get('importer') != 'sprite-frame':
            continue
        u = sub['userData']
        u.update({'width': size, 'height': size, 'rawWidth': size, 'rawHeight': size, 'trimX': 0, 'trimY': 0, 'offsetX': 0, 'offsetY': 0, 'trimType': 'none'})
        h = size // 2
        v = u.get('vertices')
        if v:
            v['rawPosition'] = [-h, -h, 0, h, -h, 0, -h, h, 0, h, h, 0]
            v['uv'] = [0, size, size, size, 0, 0, size, 0]
            v['minPos'] = [-h, -h, 0]
            v['maxPos'] = [h, h, 0]
    io.open(meta_path, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, ensure_ascii=False, indent=2) + '\n')

out_dir = os.path.join(HERE, 'out'); os.makedirs(out_dir, exist_ok=True)
if not DRY:
    os.makedirs(BAK, exist_ok=True)
for name, dst in MAP.items():
    raw = os.path.join(HERE, 'raw', name + '.png')
    if not os.path.exists(raw):
        print('MISSING', name); continue
    obj, transp = cutout(raw)
    box = int(OUT_SIZE * BOX)
    k = box / max(obj.size)
    obj = obj.resize((max(1, round(obj.width * k)), max(1, round(obj.height * k))), Image.LANCZOS)
    canvas = Image.new('RGBA', (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(obj, ((OUT_SIZE - obj.width) // 2, (OUT_SIZE - obj.height) // 2))
    canvas.save(os.path.join(out_dir, os.path.basename(dst)))
    if not DRY:
        bak = os.path.join(BAK, os.path.basename(dst))
        if not os.path.exists(bak):
            shutil.copy2(dst, bak)
        canvas.save(dst)
        fix_meta(dst + '.meta', OUT_SIZE)
    print(name, '->', os.path.basename(dst), 'bg%', transp)
print('done', 'DRY' if DRY else 'installed')
