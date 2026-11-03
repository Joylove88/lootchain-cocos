# -*- coding: utf-8 -*-
"""Spine JSON 改绘制顺序(11-03 女主头脖子画在上衣前面、看着和衣领错位 → 头放到上衣后面,让衣领盖住脖子根)。
不能只改 slots 顺序:动画里的 drawOrder 关键帧是「相对 setup 顺序的偏移」,setup 一改就全错位。
做法:每个 drawOrder 关键帧先按旧 setup 解出完整顺序 → 同样把指定插槽挪到目标插槽前 → 按新 setup 重新编码(所有插槽都写偏移,解码结果唯一)。
用法(库函数):move_slots_before(data, ['face01', 'eyes01'], 'body01')
"""


def decode(order_slots, offsets):
    """Spine 运行时同款解码:返回绘制顺序(插槽名列表)。"""
    n = len(order_slots)
    index = {name: i for i, name in enumerate(order_slots)}
    draw = [-1] * n
    unchanged = []
    original = 0
    for item in offsets:
        slot = index[item['slot']]
        while original != slot:
            unchanged.append(original)
            original += 1
        draw[original + item.get('offset', 0)] = original
        original += 1
    while original < n:
        unchanged.append(original)
        original += 1
    for i in range(n - 1, -1, -1):
        if draw[i] == -1:
            draw[i] = unchanged.pop()
    return [order_slots[i] for i in draw]


def encode(setup_slots, order):
    """按 setup 顺序给每个插槽写偏移(新位置 - setup 位置)。"""
    pos = {name: i for i, name in enumerate(order)}
    return [{'slot': name, 'offset': pos[name] - i} for i, name in enumerate(setup_slots) if pos[name] - i != 0] or []


def _move(order, moving, before):
    rest = [s for s in order if s not in moving]
    block = [s for s in order if s in moving]
    i = rest.index(before)
    return rest[:i] + block + rest[i:]


def move_slots_before(data, moving, before):
    old_setup = [s['name'] for s in data['slots']]
    new_setup = _move(old_setup, set(moving), before)
    by_name = {s['name']: s for s in data['slots']}
    data['slots'] = [by_name[name] for name in new_setup]
    for anim in data.get('animations', {}).values():
        for key in anim.get('drawOrder', []) or []:
            full = decode(old_setup, key.get('offsets', []))
            target = _move(full, set(moving), before)
            # 全写偏移才能唯一解码:省略 0 偏移的插槽会被当成「未变」填空,结果可能不同 → 校验,不一致就全写
            offs = encode(new_setup, target)
            if decode(new_setup, offs) != target:
                pos = {name: i for i, name in enumerate(target)}
                offs = [{'slot': name, 'offset': pos[name] - i} for i, name in enumerate(new_setup)]
            assert decode(new_setup, offs) == target
            key['offsets'] = offs
    return data
