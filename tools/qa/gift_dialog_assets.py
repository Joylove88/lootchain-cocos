"""兑换码弹框(11-01 原型 周报截图/2026-11-01_B风格补全/proto/gift_b.png)素材:标题礼盒图标从原型按色差抠(保留原色)。
输入框底(原型实测:比弹框底更暗 + 淡灰细边,圆角约 14)程序画。
用法:python tools/qa/gift_dialog_assets.py → assets/resources/ui/glass/icon_gift.png / input.png
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glass_kit_gen as kit  # noqa: E402

PROTO = os.path.join(kit.ROOT, '周报截图', '2026-11-01_B风格补全', 'proto', 'gift_b.png')


def main():
    kit.P = np.asarray(Image.open(PROTO).convert('RGB')).astype(float)
    kit.save('icon_gift', kit.cut_keep(604, 276, 24, 14, 70))
    # 九宫格边距 18(UiGlassKit.GLASS_SLICES.input)
    kit.save('input', kit.rounded(96, 64, 14, (11, 14, 20, 225), outline=(84, 92, 106, 235), outline_w=2, highlight=18))


if __name__ == '__main__':
    main()
