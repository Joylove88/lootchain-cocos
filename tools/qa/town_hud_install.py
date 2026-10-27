"""主城 HUD 原型 v1 素材入库(2026-10-27):切好的透明件 → 按显示尺寸等比缩 → assets/resources/ui/town/hud/ + meta(sprite-frame,trim none);
符文环 fx_rune_ring → ui/world/(传送阵特效与世界素材同组预载)。

用法:python tools/qa/town_hud_install.py <切图目录>
"""
import os
import sys

from PIL import Image

from town_install_assets import ROOT, write_meta

DST = os.path.join(ROOT, r'assets\resources\ui\town\hud')
WORLD_DST = os.path.join(ROOT, r'assets\resources\ui\world')
# 最长边上限(显示约原型尺寸 × 0.86 × 屏幕 DPR,留一倍余量)
MAX_SIDE = {
    'portrait_ring': 320, 'portrait_face': 232, 'name_plate': 560, 'joy_base': 400, 'joy_knob': 192,
    'action_rim': 400, 'label_plate': 320, 'minimap_frame': 512, 'dock_bar': 1534, 'btn_notice': 160,
    'icon_portal': 256, 'minimap_city': 384,
    # docs/51 原型 v3:九宫格件保持原尺寸(代码里按素材像素写 inset)
    'minimap_ring': 385, 'btn_round': 160, 'btn_round_hot': 200, 'prompt_bar': 508, 'prompt_bar_hot': 515, 'comp_ring': 220,
    'bar_frame': 665, 'elite_medal': 160, 'atk_ring': 320, 'skill_ring': 200, 'tile_frame': 504, 'card_panel': 476, 'bottom_strip': 640,
    'btn_close': 160, 'btn_power': 160,
}
DEFAULT_ICON = 192
MAP_ICON = 112


def main() -> None:
    src_dir = sys.argv[1]
    os.makedirs(DST, exist_ok=True)
    for file in sorted(os.listdir(src_dir)):
        if not file.endswith('.png'):
            continue
        name = file[:-4]
        im = Image.open(os.path.join(src_dir, file)).convert('RGBA')
        limit = 768 if name == 'fx_rune_ring' else MAX_SIDE.get(name, MAP_ICON if name.startswith('map_') else 256 if name.startswith('t_') else DEFAULT_ICON)
        k = min(1.0, limit / max(im.size))
        out = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS) if k < 1 else im
        dst = os.path.join(WORLD_DST if name == 'fx_rune_ring' else DST, file)
        out.save(dst, optimize=True)
        write_meta(dst, name, out.width, out.height)
        print(name, out.size)


if __name__ == '__main__':
    main()
