"""玩家资料弹框(11-02 原型 周报截图/2026-11-01_B风格补全/proto/profile_b2.png)素材:属性行 / 最近战斗类型 / 改名铅笔图标,
从原型按色差抠白色剪影(运行时染色)→ assets/resources/ui/glass/profile_*.png。
用法:python tools/qa/profile_dialog_assets.py
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glass_kit_gen as kit  # noqa: E402
from notice_dialog_assets import cut_white  # noqa: E402

PROTO = os.path.join(kit.ROOT, '周报截图', '2026-11-01_B风格补全', 'proto', 'profile_b2.png')

ICONS = {
    # 属性行(左列图标 x 372):等级 / 英雄上限共用头盔
    'profile_helmet': (372, 408, 24),
    'profile_star': (372, 460, 24),
    'profile_bolt': (372, 620, 24),
    'profile_swords': (372, 672, 24),
    'profile_bars': (372, 724, 24),
    # 最近战斗类型(图标格中心 x 935):矿境 / 秘境 / 守卫
    'battle_pickaxe': (935, 265, 28),
    'battle_gate': (935, 622, 28),
    'battle_shield': (935, 711, 28),
    # 改名按钮里的铅笔
    'profile_pencil': (678, 213, 14),
}


def main():
    P = np.asarray(Image.open(PROTO).convert('RGB')).astype(float)
    for name, (x, y, half) in ICONS.items():
        kit.save(name, cut_white(P, x, y, half, 30, 120))


if __name__ == '__main__':
    main()
