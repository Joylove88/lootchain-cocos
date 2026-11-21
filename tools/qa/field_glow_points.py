# -*- coding: utf-8 -*-
"""野外昼夜循环的发光点(2026-11-21):立物 / 建筑贴图里的窗户 / 灯笼 / 炉火,傍晚在那里点亮光晕。

  python tools/qa/field_glow_points.py          # 写 assets/scripts/scenes/lobby/LobbyFieldGlowData.ts
  python tools/qa/field_glow_points.py --view   # 标注图存到 %TEMP%/lootchain-qa/field_glow/marked.jpg 过目

自动找暖色亮块试过(漏炉火、把晒亮的门板当窗),贴图只有十几张,改手工标:
坐标 u = 从左 0~1,v = 从底 0~1,r = 半径占贴图宽的比例,k = 亮度;c = 颜色(默认暖橙)。
"""
import json
import os
import sys
import tempfile

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'assets', 'resources')
OUT_TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyFieldGlowData.ts')
VIEW = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'field_glow')

V3 = 'ui/world/vil3/vil3_'
GLOWS = {
    V3 + 'chief_house': [[0.14, 0.66, 0.035, 0.9], [0.17, 0.50, 0.04, 1], [0.32, 0.52, 0.03, 0.8], [0.45, 0.55, 0.025, 0.9], [0.60, 0.53, 0.03, 0.8]],
    V3 + 'smithy': [[0.255, 0.39, 0.08, 1.2], [0.71, 0.27, 0.03, 0.8]],
    V3 + 'market_house': [[0.21, 0.62, 0.02, 0.7], [0.29, 0.34, 0.025, 0.8], [0.58, 0.36, 0.035, 1], [0.71, 0.30, 0.02, 0.7]],
    V3 + 'chapel': [[0.57, 0.55, 0.03, 0.8], [0.71, 0.55, 0.03, 0.8], [0.20, 0.20, 0.03, 0.8], [0.34, 0.16, 0.03, 0.8], [0.55, 0.16, 0.03, 0.8], [0.83, 0.22, 0.03, 0.8]],
    V3 + 'house_w': [[0.27, 0.40, 0.035, 0.9], [0.60, 0.25, 0.04, 0.9]],
    V3 + 'house_s': [[0.14, 0.41, 0.03, 0.8], [0.79, 0.20, 0.03, 0.9]],
    V3 + 'gate': [[0.32, 0.51, 0.04, 1], [0.70, 0.675, 0.04, 1]],
    V3 + 'altar': [[0.50, 0.62, 0.10, 1.1, [120, 170, 255]]],
    'ui/world/vil2/vil2_lamp': [[0.76, 0.83, 0.12, 1.2]],
}

# 整图重绘里画死的光源(11-21 用户「加光源」):荒原 / 枯木林原来黄昏只有队伍身上一圈光。
# 坐标 = 重绘成品大图(field_repaint 的 mosaic)像素,生成时按 FIELD_PAINT 的 px / mapW / mapH 换成世界坐标。
# 种类见 LobbyFieldTod 的 LIGHT_KINDS;k = 亮度;c = 颜色(不填用种类默认色)。画面里没画火焰的火堆圈 = 黄昏点上余烬。
BLUE = [90, 150, 255]
PURPLE = [190, 110, 255]
GHOST = [150, 200, 255]
WISP = [140, 255, 200]
MAP_LIGHTS = {
    'WOODS': [
        [13514, 1000, 'torch', 1.1], [14073, 1117, 'torch', 1.1], [13903, 1057, 'torch', 0.5],   # 熊洞门口两支火把 + 洞里一点
        [11917, 3712, 'fire', 1.1],                                                              # 猎人营地火堆
        [8887, 5773, 'crystal', 1, BLUE], [11350, 5472, 'crystal', 1, BLUE],                     # 遗迹两盏蓝晶灯
        [726, 5821, 'lantern', 0.7], [366, 6710, 'lantern', 0.7],                                # 西南营地帐篷门口
    ],
    'GRAY': [
        [1610, 3070, 'fire', 1.1],                                                               # 西边车队营地火堆圈
        [6510, 1350, 'lantern', 0.9],                                                            # 北边瞭望塔
        [7900, 4354, 'torch', 0.9], [9180, 4470, 'torch', 0.9], [9160, 4930, 'lantern', 0.8],    # 南营地寨门两塔 + 角塔
        [8090, 4800, 'lantern', 0.7],                                                            # 南营地帐篷门口
        [12400, 3940, 'lantern', 0.9],                                                           # 矿坑井架
        [10330, 3920, 'crystal', 0.9, PURPLE], [12180, 3810, 'crystal', 0.9, PURPLE], [11010, 5200, 'crystal', 0.9, PURPLE],  # 矿坑紫晶
    ],
    'DEADWOOD': [
        [1950, 3695, 'fire', 1.1],                                                               # 西边营地火堆圈
        [1160, 2460, 'lantern', 0.8],                                                            # 营地瞭望塔
        [7000, 3890, 'ghost', 1.0], [6550, 4850, 'ghost', 0.8],                  # 废教堂尖窗 / 门洞里的冷光
        [10370, 4360, 'window', 1.0], [12410, 2320, 'window', 0.8],                              # 木屋 / 林边小屋窗
        [7280, 5320, 'wisp', 0.9, WISP],                                                         # 墓地鬼火
    ],
}


def map_lights():
    src = open(os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyFieldPaintData.ts'), encoding='utf-8').read()
    paint = json.loads(src.split('FIELD_PAINT: Record<string, FieldPaintDef> = ', 1)[1].rsplit(';', 1)[0])
    out = {}
    for code, pts in MAP_LIGHTS.items():
        d = paint[code]
        out[code] = [[round(p[0] / d['px'] - d['mapW'] / 2), round(d['mapH'] / 2 - p[1] / d['px'])] + p[2:] for p in pts]
    return out


def main():
    data = {}
    marks = []
    for rel, pts in GLOWS.items():
        im = Image.open(os.path.join(RES, rel + '.png'))
        data[rel + '/spriteFrame'] = {'a': round(im.height / im.width, 4), 'p': pts}
        if '--view' in sys.argv:
            v = im.convert('RGBA')
            v.thumbnail((480, 480))
            bg = Image.new('RGB', (512, 512), (25, 25, 25))
            bg.paste(v, (0, 0), v)
            d = ImageDraw.Draw(bg)
            for p in pts:
                x, y, R = p[0] * v.width, (1 - p[1]) * v.height, max(4, p[2] * v.width)
                d.ellipse((x - R, y - R, x + R, y + R), outline=(0, 255, 255), width=2)
            marks.append(bg)
    if marks:
        os.makedirs(VIEW, exist_ok=True)
        sheet = Image.new('RGB', (512 * 4, 512 * ((len(marks) + 3) // 4)))
        for i, m in enumerate(marks):
            sheet.paste(m, ((i % 4) * 512, (i // 4) * 512))
        sheet.save(os.path.join(VIEW, 'marked.jpg'), quality=85)
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(OUT_TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// 由 tools/qa/field_glow_points.py 生成:立物 / 建筑贴图里的窗户 / 灯笼 / 炉火,昼夜循环傍晚点亮。\n')
        f.write('// a = 贴图高 / 宽;p = [u(左 0~1), v(底 0~1), 半径(占宽), 亮度, 颜色?]。\n')
        f.write('export const ASSET_GLOWS: Record<string, { a: number; p: Array<Array<number | number[]>> }> = ' + body + ';\n')
        f.write('// 整图重绘里画死的光源(世界坐标):[x, y, 种类, 亮度, 颜色?]。\n')
        f.write('export const MAP_LIGHTS: Record<string, Array<Array<number | string | number[]>>> = '
                + json.dumps(map_lights(), ensure_ascii=False, separators=(',', ':')) + ';\n')
        water = map_water()
        f.write('// 水声用的水面采样点(世界坐标,约每 220 见方一个):[x, y]。\n')
        f.write('export const MAP_WATER: Record<string, number[][]> = ' + json.dumps(water, separators=(',', ':')) + ';\n')
    print('wrote', OUT_TS, len(data), {k: len(v) for k, v in MAP_LIGHTS.items()}, 'water', {k: len(v) for k, v in water.items()})


def map_water(step=220):
    """水声用的水面采样点(世界坐标):读重绘图的水流遮罩(R = 水面),每 step 见方有水就取一个点(该格水面像素的质心)。"""
    import numpy as np
    src = open(os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyFieldPaintData.ts'), encoding='utf-8').read()
    paint = json.loads(src.split('FIELD_PAINT: Record<string, FieldPaintDef> = ', 1)[1].rsplit(';', 1)[0])
    out = {}
    for code, d in paint.items():
        fp = os.path.join(RES, d['dir'], 'flow.png')
        if not d.get('flow') or not os.path.exists(fp):
            continue
        a = np.asarray(Image.open(fp).convert('RGB'))[..., 0] > 128
        fh, fw = a.shape
        upx = d['mapW'] / fw          # 遮罩一像素 = 多少世界单位
        cell = max(1, int(round(step / upx)))
        pts = []
        for y0 in range(0, fh, cell):
            for x0 in range(0, fw, cell):
                blk = a[y0:y0 + cell, x0:x0 + cell]
                if blk.sum() < 3:
                    continue
                ys, xs = np.nonzero(blk)
                cx = (x0 + xs.mean() + 0.5) * upx - d['mapW'] / 2
                cy = d['mapH'] / 2 - (y0 + ys.mean() + 0.5) * upx
                pts.append([round(float(cx)), round(float(cy))])
        out[code] = pts
    return out


if __name__ == '__main__':
    main()
