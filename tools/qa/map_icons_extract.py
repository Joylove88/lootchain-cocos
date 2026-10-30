# -*- coding: utf-8 -*-
"""地图页图标(2026-10-30):从用户确认的原型 周报截图/2026-10-30_地图鸟瞰/proto_map_b.png 抠出标记 / 地点图标,
按「与面板暗底的亮度差」做透明度(保留原色),放大到 2 倍存 assets/resources/ui/world/mapui/。
用法:python tools/qa/map_icons_extract.py
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from town_install_assets import write_meta  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PROTO = os.path.join(ROOT, '周报截图', '2026-10-30_地图鸟瞰', 'proto_map_b.png')
DST = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'mapui')
BOXES = {
    'quest': (1420, 155, 1470, 205),
    'pin': (1505, 25, 1545, 65),
    'portal': (1430, 510, 1478, 558),
    'paw': (1430, 575, 1478, 623),
    'tent': (1430, 642, 1478, 690),
    'tree': (1430, 708, 1478, 758),
    'skull': (392, 734, 422, 766),
    'chest': (496, 736, 528, 766),
}


def main() -> None:
    os.makedirs(DST, exist_ok=True)
    img = np.asarray(Image.open(PROTO).convert('RGB')).astype(np.float32)
    for name, (x0, y0, x1, y1) in BOXES.items():
        box = img[y0:y1, x0:x1]
        lum = box @ np.array([0.299, 0.587, 0.114])
        edge = np.concatenate([lum[:3].ravel(), lum[-3:].ravel(), lum[:, :3].ravel(), lum[:, -3:].ravel()])
        bg = np.median(edge)
        sat = box.max(axis=2) - box.min(axis=2)
        # 亮于底色或明显有色(蓝漩涡 / 红骷髅)的算前景
        alpha = np.clip(np.maximum((lum - bg - 14) / 70, (sat - 40) / 60), 0, 1)
        rgb = box.copy()
        # 半透明边缘去掉暗底混色:按 alpha 反推前景色
        bgc = np.median(np.concatenate([box[:3].reshape(-1, 3), box[-3:].reshape(-1, 3)]), axis=0)
        safe = np.maximum(alpha, 0.05)[..., None]
        rgb = np.clip((rgb - bgc * (1 - safe)) / safe, 0, 255)
        out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
        im = Image.fromarray(out, 'RGBA')
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        path = os.path.join(DST, f'map_{name}.png')
        im.save(path)
        write_meta(path, f'map_{name}', im.width, im.height)
        print('wrote', name, im.size)


if __name__ == '__main__':
    main()
