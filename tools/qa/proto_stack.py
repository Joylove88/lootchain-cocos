"""原型在上 / 实机在下 的整屏对比图 + 局部放大对比(给用户看)。
用法:python tools/qa/proto_stack.py <proto.png> <shot.png> <out_prefix> [x0,y0,x1,y1 ...]   (局部框用 0..1 比例,按原型坐标)
实机按宽度对齐原型;局部框在两张图上按同一比例裁。
"""
import sys

from PIL import Image, ImageDraw, ImageFont

proto_path, shot_path, out = sys.argv[1:4]
boxes = [tuple(float(v) for v in b.split(',')) for b in sys.argv[4:]]
proto = Image.open(proto_path).convert('RGB')
shot = Image.open(shot_path).convert('RGB')
W = 1600
p = proto.resize((W, round(proto.height * W / proto.width)), Image.LANCZOS)
s = shot.resize((W, round(shot.height * W / shot.width)), Image.LANCZOS)
try:
    font = ImageFont.truetype('msyh.ttc', 34)
except OSError:
    font = ImageFont.load_default()


def stack(a: Image.Image, b: Image.Image, path: str) -> None:
    bar = 52
    img = Image.new('RGB', (max(a.width, b.width), a.height + b.height + bar * 2), (16, 14, 18))
    d = ImageDraw.Draw(img)
    d.text((14, 8), '原型', fill=(255, 220, 140), font=font)
    img.paste(a, (0, bar))
    d.text((14, bar + a.height + 8), '实机(模拟器)', fill=(140, 220, 255), font=font)
    img.paste(b, (0, bar * 2 + a.height))
    img.save(path, quality=90)
    print(path)


stack(p, s, f'{out}_full.jpg')
for i, (x0, y0, x1, y1) in enumerate(boxes):
    a = p.crop((round(x0 * p.width), round(y0 * p.height), round(x1 * p.width), round(y1 * p.height)))
    b = s.crop((round(x0 * s.width), round(y0 * s.height), round(x1 * s.width), round(y1 * s.height)))
    k = min(2.0, 1400 / a.width)
    stack(a.resize((round(a.width * k), round(a.height * k)), Image.LANCZOS), b.resize((round(b.width * k), round(b.height * k)), Image.LANCZOS), f'{out}_part{i + 1}.jpg')
