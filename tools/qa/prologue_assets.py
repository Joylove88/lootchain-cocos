"""docs/60 序幕「神庭陨落」素材入库(2026-11-03 用户「先接序幕视频」):
- 视频:周报截图/2026-11-02_主角/video/prologue_720p.mp4(即梦参考生成正片压的 720p30 ~4MB)→ assets/resources/video/prologue.mp4
- 对话卡头像:人物参考图 proto/prologue_char_ref_v2.png 裁夜帝 / 天枢头部 → ui/protagonist/b/portrait_yedi.png / portrait_tianshu.png(圆形,256)
用法:python tools/qa/prologue_assets.py
"""
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '周报截图', '2026-11-02_主角')
OUT_UI = os.path.join(ROOT, 'assets', 'resources', 'ui', 'protagonist', 'b')
OUT_VIDEO = os.path.join(ROOT, 'assets', 'resources', 'video')
# 参考图 1672×941 里两人头部中心与裁切边长(像素)
HEADS = {'portrait_yedi': (504, 168, 250), 'portrait_tianshu': (1280, 168, 270)}


def round_portrait(box, out):
    im = Image.open(os.path.join(SRC, 'proto', 'prologue_char_ref_v2.png')).convert('RGB')
    cx, cy, side = box
    crop = im.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)).resize((256, 256), Image.LANCZOS)
    mask = Image.new('L', (1024, 1024), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 1023, 1023), fill=255)
    crop.putalpha(mask.resize((256, 256), Image.LANCZOS))
    path = os.path.join(OUT_UI, out + '.png')
    crop.save(path, optimize=True)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'install_sprite_meta.py'), path], check=True)


def main():
    os.makedirs(OUT_VIDEO, exist_ok=True)
    shutil.copy(os.path.join(SRC, 'video', 'prologue_720p.mp4'), os.path.join(OUT_VIDEO, 'prologue.mp4'))
    print('video', os.path.getsize(os.path.join(OUT_VIDEO, 'prologue.mp4')))
    for name, box in HEADS.items():
        round_portrait(box, name)


if __name__ == '__main__':
    main()
