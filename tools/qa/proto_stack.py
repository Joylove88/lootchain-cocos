"""原型在上 / 实机在下 的整屏对比图 + 局部放大对比(给用户看)。
用法:python tools/qa/proto_stack.py <proto.png> <shot.png> <out_prefix> [--inset=0.0592] [x0,y0,x1,y1 ...]   (局部框用 0..1 比例,按原型坐标;--inset 两侧裁掉安全区)
实机按宽度对齐原型;局部框在两张图上按同一比例裁。
"""
import sys

from PIL import Image, ImageDraw, ImageFont

args = [a for a in sys.argv[1:] if not a.startswith('--inset=')]
inset = next((float(a.split('=')[1]) for a in sys.argv[1:] if a.startswith('--inset=')), 0.0)
proto_path, shot_path, out = args[:3]
boxes = [tuple(float(v) for v in b.split(',')) for b in args[3:]]
proto = Image.open(proto_path).convert('RGB')
shot = Image.open(shot_path).convert('RGB')
if inset > 0:
    # --inset=比例:截图两侧各裁掉这么多(手机安全区内缩),再和原型对齐
    shot = shot.crop((round(shot.width * inset), 0, round(shot.width * (1 - inset)), shot.height))
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
