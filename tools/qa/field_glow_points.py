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
    print('wrote', OUT_TS, len(data))


if __name__ == '__main__':
    main()
