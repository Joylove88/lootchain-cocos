# 英雄详情原型素材入库:raw(GPT,#15151a 平底)→ 抠透明(四边洪水填充 + 外缘 4px 柔边,本体不透明)→ 裁边 → 定尺寸 → assets/resources/ui/hero/proto/ + meta(sprite-frame,trim none)
# 背景 hero_bg 不抠,直接 1870×841 存 jpg
import io, json, os, sys, uuid
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
HERE = os.environ.get('HERO_WORK') or os.path.dirname(os.path.abspath(__file__))  # 工作目录(含 raw/)
RAW = os.path.join(HERE, 'raw')
ROOT = r'D:\project\lootchain-cocos'
DST = os.path.join(ROOT, r'assets\resources\ui\hero\proto')
os.makedirs(DST, exist_ok=True)
PNG_TPL = os.path.join(ROOT, r'assets\resources\ui\hero\ai\stat_hp.png.meta')
JPG_TPL = os.path.join(ROOT, r'assets\resources\ui\forge\ref\enh_bg_smoke.jpg.meta')
T1, T2, RIM = 12, 48, 4

def region(mask, seeds):
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), 'L').convert('RGB')
    for sx, sy in seeds:
        if img.getpixel((sx, sy))[0] == 255:
            ImageDraw.floodfill(img, (sx, sy), (128, 0, 0))
    return np.asarray(img)[:, :, 0] == 128

def cutout(path):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(np.int16); h, w = a.shape[:2]
    ring = np.concatenate([a[:16].reshape(-1, 3), a[-16:].reshape(-1, 3), a[:, :16].reshape(-1, 3), a[:, -16:].reshape(-1, 3)])
    plate = np.median(ring, axis=0); dist = np.abs(a - plate).max(axis=2)
    seeds = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    R1 = region(dist < T1, seeds)
    grown = np.asarray(Image.fromarray(R1.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(RIM * 2 + 1))) > 0
    band = grown & ~R1
    alpha = np.full((h, w), 255, np.float32)
    alpha[band] = np.clip((dist[band] - T1) / (T2 - T1), 0.15, 1) * 255
    alpha[R1] = 0
    rgba = Image.fromarray(np.dstack([np.asarray(im), alpha.astype(np.uint8)]), 'RGBA')
    bbox = Image.fromarray((alpha > 16).astype(np.uint8) * 255).getbbox()
    return rgba.crop(bbox) if bbox else rgba

def write_meta(path, tpl_path, name, w, h):
    meta_path = path + '.meta'
    if os.path.exists(meta_path):
        m = json.load(io.open(meta_path, encoding='utf-8'))
    else:
        tpl = io.open(tpl_path, encoding='utf-8').read()
        old = json.loads(tpl)['uuid']
        m = json.loads(tpl.replace(old, str(uuid.uuid4())))
        for sub in m['subMetas'].values():
            sub['displayName'] = name
    m['userData']['hasAlpha'] = path.endswith('.png')
    sf = m['subMetas']['f9941']['userData']
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

report = {}
names = sys.argv[1:] or sorted(os.path.splitext(f)[0] for f in os.listdir(RAW) if f.endswith('.png'))
for name in names:
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        print('missing', name); continue
    if name == 'hero_bg':
        im = Image.open(src).convert('RGB').resize((1870, 841), Image.LANCZOS)
        dst = os.path.join(DST, 'hero_bg.jpg')
        im.save(dst, quality=88)
        write_meta(dst, JPG_TPL, name, 1870, 841)
        report[name] = (1870, 841)
        continue
    obj = cutout(src)
    if name.startswith('tab_'):
        hh = 160
        ww = round(obj.width * hh / obj.height)
        out = obj.resize((ww, hh), Image.LANCZOS)
    else:
        side = 256
        k = side * 0.94 / max(obj.size)
        o2 = obj.resize((max(1, round(obj.width * k)), max(1, round(obj.height * k))), Image.LANCZOS)
        if not name.startswith('sk_'):
            # 去 AI 感:金色图标降饱和 / 略压亮,避免塑料金
            alpha_ch = o2.getchannel('A')
            rgb = ImageEnhance.Brightness(ImageEnhance.Color(o2.convert('RGB')).enhance(0.78)).enhance(0.92)
            o2 = rgb.convert('RGBA'); o2.putalpha(alpha_ch)
        out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        out.alpha_composite(o2, ((side - o2.width) // 2, (side - o2.height) // 2))
    dst = os.path.join(DST, name + '.png')
    out.save(dst)
    write_meta(dst, PNG_TPL, name, out.width, out.height)
    report[name] = out.size
print(json.dumps(report))
