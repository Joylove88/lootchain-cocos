"""B 风格(毛玻璃)共用组件贴图生成(2026-10-28 用户选 B,原型 周报截图/2026-10-28_整体UI去AI感/proto/hero_b2.png)。
全部程序绘制(4 倍超采样后缩小,边缘抗锯齿),输出 assets/resources/ui/glass/*.png + meta(sprite-frame / trim none / 不压缩)。
九宫格边距在运行时设(UiGlassKit.GLASS_SLICES),meta 里 border 保持 0。
用法:python tools/qa/glass_kit_gen.py
"""
import json
import os
import uuid

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'resources', 'ui', 'glass')
META_TEMPLATE = os.path.join(ROOT, 'assets', 'resources', 'ui', 'town', 'terminal', 'ring_overlay.png.meta')
SS = 4  # 超采样倍数

# 色板(与原型取色一致)
GLASS = (20, 24, 33)
CHAMPAGNE_TOP = (238, 214, 164)
CHAMPAGNE_BOTTOM = (206, 172, 112)
WHITE = (255, 255, 255)


def rounded(w, h, r, fill, outline=None, outline_w=1, gradient=None, highlight=None):
    """w/h/r 为输出像素;fill = (r,g,b,a);gradient = (top_rgba, bottom_rgba) 覆盖 fill;highlight = 顶部 1px 内高光 alpha。"""
    W, H, R = w * SS, h * SS, r * SS
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), R, fill=255)
    body = Image.new('RGBA', (W, H), fill if gradient is None else (0, 0, 0, 0))
    if gradient is not None:
        top, bottom = gradient
        d = ImageDraw.Draw(body)
        for y in range(H):
            t = y / max(1, H - 1)
            d.line([(0, y), (W, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(4)))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(body, (0, 0), mask)
    if highlight:
        hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(hl).rounded_rectangle((SS, SS, W - 1 - SS, H - 1 - SS), R - SS, outline=(255, 255, 255, highlight), width=SS)
        clip = Image.new('L', (W, H), 0)
        ImageDraw.Draw(clip).rectangle((0, 0, W, int(H * 0.5)), fill=255)
        out.alpha_composite(Image.composite(hl, Image.new('RGBA', (W, H), (0, 0, 0, 0)), clip))
    if outline:
        ol = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(ol).rounded_rectangle((0, 0, W - 1, H - 1), R, outline=outline, width=outline_w * SS)
        out.alpha_composite(ol)
    return out.resize((w, h), Image.LANCZOS)


def line_icon(size, segments, width=2.2, color=(255, 255, 255, 235)):
    W = size * SS
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for seg in segments:
        pts = [(x * W, y * W) for x, y in seg]
        d.line(pts, fill=color, width=int(width * SS), joint='curve')
        for p in (pts[0], pts[-1]):
            rr = width * SS / 2
            d.ellipse((p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr), fill=color)
    return im.resize((size, size), Image.LANCZOS)


def write_meta(png_path, w, h):
    meta_path = png_path + '.meta'
    template = json.load(open(META_TEMPLATE, encoding='utf-8'))
    old = template['uuid']
    new = json.load(open(meta_path, encoding='utf-8'))['uuid'] if os.path.exists(meta_path) else str(uuid.uuid4())
    text = json.dumps(template, ensure_ascii=False, indent=2).replace(old, new)
    meta = json.loads(text)
    name = os.path.splitext(os.path.basename(png_path))[0]
    for sub in meta['subMetas'].values():
        sub['displayName'] = name
    frame = meta['subMetas']['f9941']['userData']
    frame.update({'width': w, 'height': h, 'rawWidth': w, 'rawHeight': h})
    frame['vertices']['rawPosition'] = [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, h / 2, 0]
    frame['vertices']['uv'] = [0, h, w, h, 0, 0, w, 0]
    frame['vertices']['minPos'] = [-w / 2, -h / 2, 0]
    frame['vertices']['maxPos'] = [w / 2, h / 2, 0]
    meta['userData']['compressSettings'] = {'useCompressTexture': False, 'presetId': ''}
    json.dump(meta, open(meta_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


def save(name, im):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.png')
    im.save(path)
    write_meta(path, im.width, im.height)
    print('wrote', name, im.size)


def main():
    # 面板:64×64,圆角 12(九宫格边距 16)——设计尺寸 1:1,按 UI 缩放
    save('panel', rounded(64, 64, 12, GLASS + (204,), outline=WHITE + (30,), highlight=14))
    # 面板选中态(香槟描边 + 微染)
    save('panel_sel', rounded(64, 64, 12, (70, 60, 40, 150), outline=CHAMPAGNE_TOP + (210,), outline_w=2, highlight=20))
    # 行底(表格行 / 列表行):更淡
    save('row', rounded(64, 40, 8, (255, 255, 255, 10), outline=WHITE + (14,)))
    # 胶囊按钮 160×56(圆角 28;九宫格左右 28)
    save('pill_primary', rounded(160, 56, 28, None, outline=(255, 240, 205, 150), gradient=(CHAMPAGNE_TOP + (255,), CHAMPAGNE_BOTTOM + (255,)), highlight=60))
    save('pill_secondary', rounded(160, 56, 28, (34, 40, 52, 215), outline=WHITE + (46,), highlight=18))
    save('pill_disabled', rounded(160, 56, 28, (44, 48, 56, 150), outline=WHITE + (18,)))
    # 货币条 / 小标签:更暗的胶囊
    save('chip', rounded(120, 44, 22, (10, 12, 18, 175), outline=WHITE + (26,)))
    # 页签选中(竖排页签 / 分段页签共用):香槟渐变圆角 16
    save('tab_active', rounded(120, 64, 16, None, outline=(255, 240, 205, 140), gradient=(CHAMPAGNE_TOP + (255,), CHAMPAGNE_BOTTOM + (255,)), highlight=60))
    save('tab_idle', rounded(120, 64, 16, (34, 40, 52, 150), outline=WHITE + (26,)))
    # 分区标题左侧竖条(4×24)
    save('accent_bar', rounded(4, 24, 2, CHAMPAGNE_TOP + (255,)))
    # 细分隔线(1px 白 12%,横向拉伸)
    line = Image.new('RGBA', (8, 2), (255, 255, 255, 0))
    ImageDraw.Draw(line).line([(0, 0), (8, 0)], fill=(255, 255, 255, 34))
    save('divider', line)
    # 线性图标(白色,运行时可染色)
    save('icon_back', line_icon(64, [[(0.62, 0.2), (0.32, 0.5), (0.62, 0.8)]], width=4.2))
    save('icon_close', line_icon(64, [[(0.24, 0.24), (0.76, 0.76)], [(0.76, 0.24), (0.24, 0.76)]], width=3.6))
    save('icon_chevron', line_icon(32, [[(0.38, 0.22), (0.66, 0.5), (0.38, 0.78)]], width=2.6))
    save('icon_plus', line_icon(32, [[(0.5, 0.24), (0.5, 0.76)], [(0.24, 0.5), (0.76, 0.5)]], width=2.6))


if __name__ == '__main__':
    main()
