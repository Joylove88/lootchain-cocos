"""设置弹框(11-02 原型 周报截图/2026-11-01_B风格补全/proto/settings_b2.png)素材:声音区音乐 / 音效图标,从原型按色差抠白色剪影(运行时染色)。
用法:python tools/qa/settings_dialog_assets.py → assets/resources/ui/glass/settings_music.png / settings_sound.png
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glass_kit_gen as kit  # noqa: E402
from notice_dialog_assets import cut_white  # noqa: E402

PROTO = os.path.join(kit.ROOT, '周报截图', '2026-11-01_B风格补全', 'proto', 'settings_b2.png')


def main():
    P = np.asarray(Image.open(PROTO).convert('RGB')).astype(float)
    kit.save('settings_music', cut_white(P, 420, 505, 24, 30, 120))
    kit.save('settings_sound', cut_white(P, 422, 588, 24, 30, 120))


if __name__ == '__main__':
    main()
