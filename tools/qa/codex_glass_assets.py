"""图鉴重设计(11-02 原型 周报截图/2026-11-01_B风格补全/proto/codex_b3.png)素材:左栏稀有度图标,从原型按色差抠白色剪影(运行时染色)。
用法:python tools/qa/codex_glass_assets.py → assets/resources/ui/glass/codex_*.png
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glass_kit_gen as kit  # noqa: E402
from notice_dialog_assets import cut_white  # noqa: E402

PROTO = os.path.join(kit.ROOT, '周报截图', '2026-11-01_B风格补全', 'proto', 'codex_b3.png')
ICONS = {'codex_all': (104, 155), 'codex_ur': (104, 253), 'codex_ssr': (104, 351), 'codex_sr': (104, 450), 'codex_r': (104, 549)}


def main():
    P = np.asarray(Image.open(PROTO).convert('RGB')).astype(float)
    for name, (x, y) in ICONS.items():
        kit.save(name, cut_white(P, x, y, 24, 30, 110))


if __name__ == '__main__':
    main()
