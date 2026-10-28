"""B 风格(毛玻璃)共用组件贴图生成(2026-10-28 用户选 B,原型 周报截图/2026-10-28_整体UI去AI感/proto/hero_b2.png)。
全部程序绘制(4 倍超采样后缩小,边缘抗锯齿),输出 assets/resources/ui/glass/*.png + meta(sprite-frame / trim none / 不压缩)。
九宫格边距在运行时设(UiGlassKit.GLASS_SLICES),meta 里 border 保持 0。
用法:python tools/qa/glass_kit_gen.py
"""
import json
import math
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
        stops = gradient if isinstance(gradient, list) else [(0.0, gradient[0]), (1.0, gradient[1])]
        d = ImageDraw.Draw(body)
        for y in range(H):
            t = y / max(1, H - 1)
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t0 <= t <= t1:
                    u = (t - t0) / max(1e-6, t1 - t0)
                    d.line([(0, y), (W, y)], fill=tuple(int(c0[i] * (1 - u) + c1[i] * u) for i in range(4)))
                    break
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
    # 面板(10-28 v2 原型逐像素取色):内底偏冷青 (19,29,38),沿边一圈向内渐隐的内光(上沿最亮、左上角再亮一点),亮一档细边框
    # 10-28 用户:面板 / 装备框也要不均匀光影(磨砂雾光成片、边框亮度沿边起伏);中段留宽,拉伸后仍是几片宽雾
    save('panel', lit_block(192, 192, 12, panel_inner, (66, 78, 92, 210), (120, 134, 152, 235)))
    # 面板选中态(香槟描边 + 微染)
    # 选中态(10-28 v2 原型 合成右栏选中行取色):金边 + 左右强上下弱的暖金内光 + 暗中性中心(全站选中行 / 选中格共用)
    save('panel_sel', panel_sel_tex())
    # 装备框 / 物品格(原型合成槽位):浅灰亮边 + 冷色内光向中心渐暗
    save('frame', lit_block(112, 112, 12, frame_inner, (110, 120, 138, 220), (182, 192, 210, 240), rim_w=2.0))
    # 选中格(原型背包 / 分解 / 英雄装备选中格):金边沿边起伏 + 很浅的暖色内光 + 暗心(小格子用,选中行仍用 panel_sel)
    save('frame_sel', lit_block(112, 112, 12, frame_sel_inner, (190, 160, 104, 235), (246, 220, 162, 250), rim_w=2.2))
    # 行底(表格行 / 列表行):更淡
    save('row', rounded(64, 40, 8, (255, 255, 255, 10), outline=WHITE + (14,)))
    # 胶囊按钮 160×56(圆角 28;九宫格左右 28)
    save('pill_primary', rounded(160, 56, 28, None, outline=(255, 240, 205, 150), gradient=(CHAMPAGNE_TOP + (255,), CHAMPAGNE_BOTTOM + (255,)), highlight=60))
    # 次按钮(原型取色):石板灰,上沿偏亮 (80,88,94) → 中段 (36,45,54),浅灰描边
    # 次按钮(10-28 v2 原型逐像素取色:强化 / 一键升星 / 技能升级 / 一键升级同一款):平涂 (37,46,54) + 浅灰蓝细边,上沿边略亮
    save('pill_disabled', rounded(160, 56, 28, (44, 48, 56, 150), outline=WHITE + (18,)))
    # 货币条 / 小标签:更暗的胶囊
    save('chip', rounded(120, 44, 22, (10, 12, 18, 175), outline=WHITE + (26,)))
    # 页签选中(竖排页签 / 分段页签共用):香槟渐变圆角 16
    save('tab_active', rounded(120, 64, 16, None, outline=(255, 240, 205, 140), gradient=(CHAMPAGNE_TOP + (255,), CHAMPAGNE_BOTTOM + (255,)), highlight=60))
    save('tab_idle', rounded(120, 64, 16, (34, 40, 52, 150), outline=WHITE + (26,)))
    # 竖排页签选中(原型取色):哑光暗金三段渐变 (141,120,86) → (174,143,97) → (146,124,90),亮描边 (219,197,149)
    save('tab_sel', rounded(120, 64, 16, None, outline=(219, 197, 149, 230), outline_w=1, gradient=[(0.0, (141, 120, 86, 240)), (0.5, (174, 143, 97, 240)), (1.0, (146, 124, 90, 240))]))
    # 名牌(原型取色):深色 (15,18,24) 胶囊 + 淡描边
    save('plate', rounded(160, 88, 44, (15, 18, 24, 228), outline=(120, 128, 140, 90)))
    # 标签胶囊(原型「大招 · Lv.5/5」「★3 解锁」):填充 (37,44,54) + 描边 (78,90,106)
    save('tag_pill', rounded(120, 36, 18, (37, 44, 54, 235), outline=(78, 90, 106, 255), outline_w=1))
    # 小标签(实底,运行时染色)
    save('tag', rounded(48, 28, 7, (255, 255, 255, 255)))
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
    # 名牌左右切换箭头(原型:粗白箭头)
    save('icon_arrow_l', line_icon(64, [[(0.64, 0.14), (0.34, 0.5), (0.64, 0.86)]], width=6.0))
    save('icon_arrow_r', line_icon(64, [[(0.36, 0.14), (0.66, 0.5), (0.36, 0.86)]], width=6.0))
    save('rail_sel', rail_selected())
    # 10-28 用户:锻造强化页的光照感(原型 forge_b 逐像素取色)
    # 10-29 用户定为全站次钮标准(原型 bag_detail_b「使用 / 合成」):石板蓝灰 (43,54,65)、沿边一圈渐隐内光、边框亮度沿边起伏、磨砂雾感;
    # 旧的平涂 pill_secondary 与中心一束光 pill_secondary_lit 统一成这一款(中段 200px 留宽,拉伸后仍有起伏)
    pill = lit_block(256, 56, 28, pill_inner, (84, 98, 114, 225), (178, 192, 208, 245), rim_w=2.0)
    save('pill_secondary', pill)
    save('pill_secondary_lit', pill)
    save('pill_primary_dim', shaded(160, 56, 28, primary_dim, outline=(198, 172, 128, 235), outline_w=2))
    save('tab_glow', shaded(120, 64, 14, tab_glow, outline=(232, 206, 150, 245), outline_w=2))
    save('line_fade', fade_line(False))
    # 左侧压暗条(背包左栏等无底板侧栏垫底):左半段平铺、右半段渐隐到 0
    shade = Image.new('RGBA', (256, 4), (0, 0, 0, 0))
    for x in range(256):
        t = x / 255
        a_ = 255 if t < 0.5 else int(255 * ((1 - t) / 0.5) ** 1.3)  # 左半段平铺压暗,右半段渐隐
        for y in range(4):
            shade.putpixel((x, y), (8, 10, 14, a_))
    save('shade_h', shade)
    save('line_fade_v', fade_line(True))
    extract_proto_icons()


def rail_selected():
    """锻造右缘页签选中块(原型 forge_b 取色):左侧暗金 (150,122,82) 向右渐隐到竖条底色,左缘一道亮金竖边渐隐。"""
    w, h, r = 120, 114, 16
    W, H = w * SS, h * SS
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), r * SS, fill=255)
    body = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    for x in range(W):
        t = x / (W - 1)
        c0, c1 = (150, 122, 82), (30, 32, 36)
        d.line([(x, 0), (x, H)], fill=tuple(int(c0[i] * (1 - t) + c1[i] * t) for i in range(3)) + (int(240 * (1 - t) ** 1.2 + 20),))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(body, (0, 0), mask)
    edge = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle((0, 0, W - 1, H - 1), r * SS, outline=(205, 170, 112, 235), width=2 * SS)
    fade = Image.new('L', (W, H), 0)
    fd = ImageDraw.Draw(fade)
    for x in range(int(W * 0.35) + 1):
        fd.line([(x, 0), (x, H)], fill=int(255 * (1 - x / (W * 0.35))))
    edge.putalpha(Image.composite(edge.getchannel('A'), Image.new('L', (W, H), 0), fade))
    out.alpha_composite(edge)
    return out.resize((w, h), Image.LANCZOS)


def shaded(w, h, r, fn, outline=None, outline_w=1):
    """逐像素着色圆角块:fn(u, v, d) -> rgba,u/v 为 0..1 归一坐标,d 为到最近边的距离(输出像素)。"""
    W, H, R = w * SS, h * SS, r * SS
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), R, fill=255)
    body = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = body.load()
    for y in range(H):
        v = y / (H - 1)
        for x in range(W):
            u = x / (W - 1)
            d = min(x, W - 1 - x, y, H - 1 - y) / SS
            px[x, y] = fn(u, v, d)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(body, (0, 0), mask)
    if outline:
        ol = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(ol).rounded_rectangle((0, 0, W - 1, H - 1), R, outline=outline, width=outline_w * SS)
        out.alpha_composite(ol)
    return out.resize((w, h), Image.LANCZOS)


def _mix(c0, c1, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(c0[i] * (1 - t) + c1[i] * t) for i in range(len(c0)))


def panel_lit(u, v, d):
    glow = math.exp(-d / 4.5) * (0.75 - 0.4 * v) + math.exp(-((u ** 2 + v ** 2) ** 0.5) / 0.18) * 0.35
    return _mix((19, 29, 38, 206), (62, 74, 88, 225), glow)


def _haze(u, v, seed):
    """低频"雾光"起伏 0..1(几组斜向正弦叠加,固定相位,可复现)。"""
    t = math.pi * 2
    return max(0.0, min(1.0, 0.5 + 0.24 * math.sin(t * (1.15 * u + 0.45 * v) + seed)
                        + 0.16 * math.sin(t * (-0.6 * u + 1.5 * v) + seed * 2.1)
                        + 0.10 * math.sin(t * (2.2 * u + 1.2 * v) + seed * 3.3)))


def lit_block(n_w, n_h, r, inner, rim_lo, rim_hi, rim_w=1.4):
    """不均匀光影圆角块:inner(u, v, dx, dy) -> rgba;边框颜色在 rim_lo..rim_hi 之间沿边起伏,左上角最亮。"""
    Wp, Hp = n_w * SS, n_h * SS
    im = Image.new('RGBA', (Wp, Hp), (0, 0, 0, 0))
    px = im.load()
    hw, hh = n_w / 2, n_h / 2
    for yy in range(Hp):
        y = (yy + 0.5) / SS - hh
        v = (y + hh) / n_h
        for xx in range(Wp):
            x = (xx + 0.5) / SS - hw
            u = (x + hw) / n_w
            qx, qy = abs(x) - (hw - r), abs(y) - (hh - r)
            sd = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
            if sd > 0.5:
                continue
            c = inner(u, v, hw - abs(x), hh - abs(y))
            if sd > -rim_w:
                along = u if abs(y) / hh > abs(x) / hw else v
                corner = math.exp(-((u ** 2 + v ** 2) ** 0.5) / 0.22)
                # 相位只区分上沿 / 下沿;左右沿用同一相位(按上下半区切会在两侧中点出现接缝)
                on_tb = abs(y) / hh > abs(x) / hw
                t = min(1.0, 0.15 + 0.7 * _haze(along, along * 0.3 + 0.2, (1.3 if y < 0 else 4.1) if on_tb else 2.7) ** 1.4 + 0.6 * corner)
                c = _mix(c, _mix(rim_lo, rim_hi, t), 0.95)
            if sd > -0.5:
                c = c[:3] + (int(c[3] * max(0.0, 0.5 - sd)),)
            px[xx, yy] = c
    return im.resize((n_w, n_h), Image.LANCZOS)


def panel_inner(u, v, dx, dy):
    """面板:冷青底 (19,29,38),成片磨砂雾光(左上偏亮),沿边内光随位置起伏。"""
    d = min(dx, dy)
    haze = (0.5 + 0.28 * math.sin(math.pi * 2 * (0.8 * u + 0.35 * v) + 0.8) + 0.18 * math.sin(math.pi * 2 * (-0.4 * u + 0.9 * v) + 2.0)) ** 2 * (1.1 - 0.5 * v) * (1.15 - 0.4 * u)
    along = u if dy < dx else v
    edge = math.exp(-d / 5.0) * (0.35 + 0.65 * _haze(along, 0.5, 2.4)) * (0.85 - 0.35 * v)
    corner = math.exp(-((u ** 2 + v ** 2) ** 0.5) / 0.2) * 0.4
    # 10-29 用户:面板青蓝偏重、缺磨砂感 → 底色往中性收 (20,26,33);雾光加强、改中性奶白,上半部更明显
    c = _mix((20, 26, 33, 208), (54, 62, 72, 222), min(1.0, edge + corner))
    milk = min(1.0, 0.42 * haze * (1.25 - 0.7 * v))
    return _mix(c, (62, 66, 72, 216), milk)


def frame_inner(u, v, dx, dy):
    """装备框:暗心 (15,20,26),磨砂雾光成片、上下沿各一段亮,沿边内光起伏。"""
    d = min(dx, dy)
    haze = _haze(u, v, 2.0) ** 2
    along = u if dy < dx else v
    edge = math.exp(-d / 7.0) * (0.4 + 0.75 * _haze(along, 0.3, (0.9 if v < 0.5 else 3.7) if dy < dx else 2.3))
    corner = math.exp(-((u ** 2 + v ** 2) ** 0.5) / 0.25) * 0.35
    return _mix((15, 20, 26, 226), (50, 60, 74, 238), min(1.0, 0.35 * haze + edge + corner))


def pill_inner(u, v, dx, dy):
    """次钮内部:底 (40,50,61),沿边内光随位置起伏(两端更亮),上半部轻微提亮 + 磨砂雾光。"""
    d = min(dx, dy)
    along = u if dy < dx else v
    edge = math.exp(-d / 6.0) * (0.35 + 0.75 * _haze(along, 0.4, (1.1 if v < 0.5 else 2.9) if dy < dx else 2.0))
    ends = math.exp(-dx / 22.0) * 0.35
    haze = 0.16 * _haze(u, v, 3.4) ** 2 + 0.08 * (1 - v)
    return _mix((38, 48, 59, 246), (70, 84, 100, 250), min(1.0, edge + ends + haze))


def frame_sel_inner(u, v, dx, dy):
    d = min(dx, dy)
    along = u if dy < dx else v
    edge = math.exp(-d / 5.5) * (0.35 + 0.65 * _haze(along, 0.6, (1.7 if v < 0.5 else 3.2) if dy < dx else 2.5))
    return _mix((17, 21, 26, 230), (96, 76, 46, 240), min(1.0, edge + 0.12 * _haze(u, v, 2.6) ** 2))


def _edge_dist(u, v, w, h):
    """到左右 / 上下边的距离(输出像素)。"""
    return min(u, 1 - u) * (w - 1), min(v, 1 - v) * (h - 1)


def panel_sel_tex():
    """选中块 256×112:中间 240×96 为本体,四周 8px 留给金边外晕(九宫格左右 44 / 上下 24,运行时 pad 8)。
    10-28 用户:原型光影不均匀、像波纹——金边亮度沿边起伏(左上 / 右下最亮)、外晕一段亮一段淡、上下沿内光成块、
    内底斜向缎面柔光带(右侧更亮);九宫格中段留宽(168 / 64px)让起伏拉伸后仍是几段宽波而不是被拉平。"""
    nw, nh, pad, r = 256, 112, 8, 12
    bw, bh = nw - pad * 2, nh - pad * 2
    Wp, Hp = nw * SS, nh * SS
    im = Image.new('RGBA', (Wp, Hp), (0, 0, 0, 0))
    px = im.load()
    hw, hh = bw / 2, bh / 2
    two_pi = math.pi * 2

    def wave(t, phase):
        return 0.5 + 0.32 * math.sin(two_pi * t * 1.6 + phase) + 0.18 * math.sin(two_pi * t * 3.9 + phase * 2.3)

    for yy in range(Hp):
        y = (yy + 0.5) / SS - nh / 2
        v = (y + hh) / bh
        for xx in range(Wp):
            x = (xx + 0.5) / SS - nw / 2
            u = (x + hw) / bw
            qx, qy = abs(x) - (hw - r), abs(y) - (hh - r)
            sd = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
            # 沿边位置参数:上 / 下沿用 u,左右沿用 v;对角(左上 / 右下)额外提亮
            along = u if abs(y) / hh > abs(x) / hw else v
            corner = max(math.exp(-((u ** 2 + v ** 2) ** 0.5) / 0.16), math.exp(-(((1 - u) ** 2 + (1 - v) ** 2) ** 0.5) / 0.2))
            rim = min(1.0, 0.25 + 0.8 * wave(along, 0.7 if y < 0 else 2.6) ** 1.3 + 0.55 * corner)
            if sd > 0:
                a = int(150 * math.exp(-sd / 2.6) * rim)
                if a > 0:
                    px[xx, yy] = (214, 168, 96, a)
                continue
            dx, dy = hw - abs(x), hh - abs(y)
            side = math.exp(-dx / 13.0) * (0.75 + 0.45 * wave(v, 1.4 if x < 0 else 3.1))
            topbot = math.exp(-dy / 7.0) * (0.1 + 0.95 * wave(u, 0.4 if y < 0 else 2.2) ** 1.6) * (0.8 + 0.4 * v)
            sheen = (0.30 * max(0.0, math.sin(two_pi * (u * 0.85 + v * 0.45) * 1.15 - 0.9)) ** 2 + 0.14 * max(0.0, math.sin(two_pi * (u * 1.9 - v * 0.6) + 2.0)) ** 3) * (0.55 + 0.7 * u)
            glow = min(1.0, side + topbot + sheen + 0.35 * corner)
            c = _mix((30, 31, 32, 235), (124, 94, 54, 248), glow)
            if sd > -2.0:
                c = _mix(c, _mix((176, 148, 100, 250), (246, 218, 160, 252), rim), 0.92)
            px[xx, yy] = c
    return im.resize((nw, nh), Image.LANCZOS)


def panel_sel_lit(u, v, d):
    dx, dy = _edge_dist(u, v, 64, 64)
    glow = min(1.0, math.exp(-dx / 6.0) + 0.38 * math.exp(-dy / 4.0) * (0.8 + 0.4 * v))
    return _mix((27, 31, 34, 232), (112, 85, 48, 245), glow)


def frame_lit(u, v, d):
    glow = math.exp(-d / 7.0) * (0.9 + 0.2 * (1 - v)) + math.exp(-((u ** 2 + v ** 2) ** 0.5) / 0.2) * 0.25
    return _mix((15, 20, 26, 228), (44, 53, 66, 238), glow)


def secondary_lit(u, v, d):
    """次钮(原型 词缀洗练 / 筛选 / 品质优先):边缘 / 下部 (22,29,37),上中部一束光 (43,55,67)。"""
    light = math.exp(-((u - 0.47) / 0.30) ** 2) * (1 - 0.6 * v) + 0.18 * (1 - v)
    return _mix((22, 29, 37), (44, 56, 68), light) + (242,)


def primary_dim(u, v, d):
    """材料不足主钮(原型):哑光暗金,上 (166,137,87) → 下 (124,98,62),左右边缘略亮。"""
    c = _mix((166, 137, 87), (124, 98, 62), v)
    edge = math.exp(-d / 10) * 0.12
    return tuple(min(255, int(ch * (1 + edge))) for ch in c) + (255,)


def tab_glow(u, v, d):
    """分类页签选中(原型「全部」):中间暗金 (118,97,66),贴边一圈内发光,下沿更亮。"""
    glow = math.exp(-d / 6.5) * (0.55 + 0.6 * v) + 0.12 * v
    return _mix((118, 97, 66), (214, 176, 108), glow) + (245,)


def fade_line(vertical):
    """渐隐分割线(原型强化页名称 / 消耗线):1px 暗线压在 2px 亮线上,中间最实、两端淡出;运行时染色。"""
    n = 256
    im = Image.new('RGBA', (n, 3), (0, 0, 0, 0))
    px = im.load()
    for x in range(n):
        p = 0.16 + 0.84 * math.sin(math.pi * x / (n - 1)) ** 1.1
        px[x, 0] = (0, 0, 0, int(140 * p))
        px[x, 1] = (255, 255, 255, int(255 * p))
        px[x, 2] = (255, 255, 255, int(200 * p))
    return im.transpose(Image.Transpose.ROTATE_90) if vertical else im


P = None  # 当前抠图用的原型像素(extract_proto_icons 切换)
PROTO = os.path.join(ROOT, '周报截图', '2026-10-28_整体UI去AI感', 'proto', 'hero_b2.png')


def extract_proto_icons():
    """属性 / 页签图标直接从已确认的原型 hero_b2 抠剪影(原型面板底色均匀,按与底色的色差算透明度),显示尺寸与原型一致。
    stat_* 保留原型暗金;nav_* 存白色剪影,运行时按选中 / 未选染色。"""
    import numpy as np
    if not os.path.exists(PROTO):
        print('skip proto icons (no prototype file)')
        return
    global P
    P = np.asarray(Image.open(PROTO).convert('RGB')).astype(float)

    def cut(cx, cy, half, lo, hi, white):
        box = P[cy - half:cy + half, cx - half:cx + half]
        bg = np.median(np.concatenate([box[0], box[-1], box[:, 0], box[:, -1]]), axis=0)
        a = np.clip((np.sqrt(((box - bg) ** 2).sum(2)) - lo) / (hi - lo), 0, 1)
        core = box[a > 0.85].reshape(-1, 3)
        color = np.array([255, 255, 255]) if white else (np.median(core, axis=0) if len(core) > 5 else np.array([212, 177, 120]))
        out = np.zeros(box.shape[:2] + (4,), np.uint8)
        out[..., :3] = color
        out[..., 3] = (a * 255).astype(np.uint8)
        im = Image.fromarray(out, 'RGBA')
        return im.resize((half * 4, half * 4), Image.LANCZOS)

    stats = {'hp': (1235, 165), 'def': (1235, 201), 'crit': (1235, 237), 'luck': (1235, 273), 'atk': (1517, 165), 'spd': (1517, 201),
             'awaken': (1517, 273), 'sword': (1235, 394), 'loot': (1517, 430)}
    for key, (x, y) in stats.items():
        save(f'stat_{key}', cut(x, y, 19, 20, 110, False))
    for key, (x, y) in {'attr': (85, 159), 'equip': (85, 262), 'skill': (85, 365), 'star': (85, 468)}.items():
        save(f'nav_{key}', cut(x, y, 24, 25, 120, True))
    # 装备 / 升星页原型(hero_equip_b / hero_star_b):部位线稿(浅灰,运行时可染色)、铜锁(保留原色,含外圈细环)
    for proto_name, items in (('hero_equip_b.png', {'part_helmet': (367, 190, 26), 'part_chest': (367, 385, 26), 'part_boots': (367, 583, 26),
                                                    'part_ring': (1040, 387, 26), 'part_necklace': (1040, 583, 26)}),
                              ('hero_star_b.png', {'lock': (1238, 256, 18)}),
                              # 锻造原型 forge_b:右栏「合成」图标(避开右上红点)+ 列表部位页签实心图标
                              ('forge_b.png', {'nav_fuse': (1795, 323, 26), 'nav_gem': (1797, 625, 28), 'tab_weapon': (180, 168, 20), 'tab_helmet': (250, 168, 20), 'tab_chest': (318, 168, 20),
                                               'tab_boots': (388, 168, 20), 'tab_ring': (458, 168, 20), 'tab_necklace': (528, 168, 20)}),
                              # 背包原型 bag_b:左栏分类线稿(白色剪影,运行时染色;「全部」压在香槟底上同样按色差抠)
                              ('bag_b.png', {'bag_all': (89, 158, 26), 'bag_material': (88, 244, 27), 'bag_equip': (89, 324, 27), 'bag_ticket': (89, 405, 27),
                                             'bag_consume': (89, 486, 27), 'bag_fragment': (89, 569, 27), 'bag_box': (88, 649, 27), 'bag_pass': (88, 730, 27)})):
        path = os.path.join(os.path.dirname(PROTO), proto_name)
        if not os.path.exists(path):
            continue
        img = Image.open(path).convert('RGB')
        if img.size != (1870, 841):
            img = img.resize((1870, 841), Image.LANCZOS)
        P = np.asarray(img).astype(float)
        for key, (x, y, half) in items.items():
            if key == 'lock':
                save(key, cut_keep(x, y, half, 30, 120))
            else:
                save(key, cut(x, y, half, 18, 90, True))


def cut_keep(cx, cy, half, lo, hi):
    """保留原色的抠图(锁这类多色小件)。"""
    import numpy as np
    box = P[cy - half:cy + half, cx - half:cx + half]
    bg = np.median(np.concatenate([box[0], box[-1], box[:, 0], box[:, -1]]), axis=0)
    a = np.clip((np.sqrt(((box - bg) ** 2).sum(2)) - lo) / (hi - lo), 0, 1)
    # 半透明边缘反推前景色,避免发暗边
    fg = np.clip((box - bg * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3), 0, 255)
    out = np.zeros(box.shape[:2] + (4,), np.uint8)
    out[..., :3] = fg.astype(np.uint8)
    out[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA').resize((half * 4, half * 4), Image.LANCZOS)


if __name__ == '__main__':
    main()
