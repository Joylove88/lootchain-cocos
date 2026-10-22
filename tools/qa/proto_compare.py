# 原型 vs 实机截图并排对比(整屏 + 放大局部),用于按原型 1:1 自审
# 用法:python tools/qa/proto_compare.py <proto.png> <shot.png> <out_prefix> [x0,y0,x1,y1 ...]
#   局部框用原型坐标比例(0..1),例如 0.56,0.07,1,1 = 右栏
import sys
from PIL import Image, ImageDraw, ImageFont

proto_path, shot_path, out = sys.argv[1:4]
boxes = [tuple(float(v) for v in b.split(',')) for b in sys.argv[4:]] or [(0.0, 0.0, 1.0, 1.0)]
proto = Image.open(proto_path).convert('RGB')
shot = Image.open(shot_path).convert('RGB')
# 都按 cover 对齐到截图尺寸(原型 1870×841 ≈ 2.22:1,截图 2400×1080 ≈ 2.22:1)
W, H = shot.size
k = max(W / proto.width, H / proto.height)
p2 = proto.resize((round(proto.width * k), round(proto.height * k)), Image.LANCZOS)
ox = (p2.width - W) // 2
oy = (p2.height - H) // 2
p2 = p2.crop((ox, oy, ox + W, oy + H))
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 28)
except OSError:
    font = ImageFont.load_default()
for i, (x0, y0, x1, y1) in enumerate(boxes):
    box = (round(x0 * W), round(y0 * H), round(x1 * W), round(y1 * H))
    a = p2.crop(box)
    b = shot.crop(box)
    scale = min(1.0, 1100 / a.width)
    a = a.resize((round(a.width * scale), round(a.height * scale)), Image.LANCZOS)
    b = b.resize(a.size, Image.LANCZOS)
    sheet = Image.new('RGB', (a.width * 2 + 20, a.height + 44), (16, 14, 16))
    d = ImageDraw.Draw(sheet)
    d.text((8, 6), '原型', font=font, fill=(240, 220, 170))
    d.text((a.width + 28, 6), '实机', font=font, fill=(240, 220, 170))
    sheet.paste(a, (0, 44))
    sheet.paste(b, (a.width + 20, 44))
    sheet.save(f'{out}_{i}.jpg', quality=88)
print('ok', len(boxes))
