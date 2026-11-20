# -*- coding: utf-8 -*-
"""野外画质原型(2026-11-20「野外达到守卫战精细度」):用同一帧的分层截图合成「按方案改完大概什么样」。

输入 = battle_polish_shots.py --only=field --steps=layer_steps.json 截的四层(同一帧、导演暂停):
  L0_full 完整画面 / L1_actors 去界面 / L2_bg 去角色 + 特效 / L3_ground 去所有立物(只剩地面 + 贴地件)
做法(每一步都对应游戏里能做的改动,不画原型里做不到的东西):
  ① 地面「降噪留白」:地面层高频细节按 detail 倍数收(着色器里做:材质取低一级精度混回去),降饱和、压亮度
  ② 统一光照:一张低频光照图(林地 = 树荫里冷暗、透下来的光斑暖亮;荒原 = 大块云影)乘在地面 + 立物上
  ③ 立物跟着降一点饱和、吃同一张光照
  ④ 屏幕空间:暗角 + 上方远处空气感(地面着色器已有 depthFx)
  ⑤ 大气:一条很淡的雾带 + 几颗浮尘(守卫战同款做法)
  角色 / 特效 / 界面原样贴回(只差在背景变安静、角色自然跳出来)。

用法:python tools/qa/field_look_proto.py <分层目录> <地图码> <输出.png>
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

LOOKS = {
    # detail: 地面高频保留比例;sat: 饱和度;val: 整体亮度;contrast: S 曲线;shadowTint / hiTint: 分色调色(暗部 / 亮部乘子);
    # shade / sun: 光照图暗部 / 光斑乘子;lightScale: 光斑尺度;patch: 光斑边缘硬度(越大越清楚);pool: 队伍光区强度;
    # vig: 暗角;haze: 远处空气感;fog: 雾带;rays: 斜向光柱
    'WOODS': dict(detail=0.5, sat=0.9, val=0.80, contrast=0.22, shadowTint=(0.80, 0.94, 0.98), hiTint=(1.08, 1.02, 0.90),
                  shade=(0.74, 0.82, 0.86), sun=(1.30, 1.18, 0.95), lightScale=170, patch=7.0, pool=0.22, propSat=0.92,
                  vig=0.45, haze=((170, 188, 176), 0.10), fog=((200, 214, 200), 0.05), rays=True),
    'GRAY': dict(detail=0.42, sat=1.0, val=0.74, contrast=0.26, shadowTint=(0.82, 0.88, 1.00), hiTint=(1.10, 1.03, 0.92),
                 shade=(0.70, 0.76, 0.88), sun=(1.18, 1.10, 0.96), lightScale=420, patch=3.0, pool=0.18, propSat=0.95,
                 vig=0.40, haze=((196, 202, 214), 0.10), fog=((220, 222, 228), 0.05), rays=False),
    'DEADWOOD': dict(detail=0.45, sat=0.72, val=0.88, contrast=0.16, shadowTint=(0.82, 0.92, 0.98), hiTint=(1.04, 1.04, 0.98),
                     shade=(0.78, 0.86, 0.92), sun=(1.14, 1.12, 1.04), lightScale=320, patch=3.0, pool=0.26, propSat=0.75,
                     vig=0.36, haze=((168, 184, 188), 0.18), fog=((190, 206, 206), 0.14), rays=False,
                     wisps=(6, (120, 230, 200))),
    'VILLAGE': dict(detail=0.62, sat=0.92, val=0.90, contrast=0.18, shadowTint=(0.86, 0.94, 1.00), hiTint=(1.08, 1.03, 0.92),
                    shade=(0.80, 0.86, 0.92), sun=(1.18, 1.10, 0.94), lightScale=240, patch=5.0, pool=0.12, propSat=0.95,
                    vig=0.34, haze=((214, 208, 192), 0.08), fog=((236, 230, 214), 0.04), rays=True),
}


def arr(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255


def blur(a, r):
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255


def lum(a):
    return a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def saturate(a, k):
    l = lum(a)[..., None]
    return l + (a - l) * k


def mask(a, b, thr, grow):
    d = np.abs(a - b).max(axis=2)
    m = (d > thr).astype(np.float32)
    img = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(grow)).filter(ImageFilter.GaussianBlur(1.2))
    return (np.asarray(img, dtype=np.float32) / 255)[..., None]


def noise(h, w, scale, seed):
    rng = np.random.default_rng(seed)
    small = rng.random((max(2, h // scale + 2), max(2, w // scale + 2))).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(scale * 0.35))
    n = np.asarray(img, dtype=np.float32) / 255
    return (n - n.min()) / max(1e-6, n.max() - n.min())


def main():
    d, code, out = sys.argv[1], sys.argv[2], sys.argv[3]
    L = LOOKS[code]
    pre = d.rstrip('/\\') + '/phone_'
    full, actors, bg, ground = (arr(pre + n + '.png') for n in ('L0_full', 'L1_actors', 'L2_bg', 'L3_ground'))
    h, w, _ = full.shape
    m_ui = mask(full, actors, 0.06, 3)
    m_act = mask(actors, bg, 0.09, 3)
    m_prop = mask(bg, ground, 0.05, 3)

    # ① 地面降噪留白(只动地面层;立物不收细节)
    low = blur(ground, 5)
    g = saturate(low + (ground - low) * L['detail'], L['sat'])
    p = saturate(bg, L['propSat'])
    scene = g * (1 - m_prop) + p * m_prop
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    # 调色:压亮度 + S 曲线 + 分色(暗部偏冷青、亮部偏暖)
    scene = scene * L['val']
    l = lum(scene)[..., None]
    scene = scene + (l - 0.42) * L['contrast'] * 1.0
    l = np.clip(lum(scene)[..., None], 0, 1)
    k = np.clip(l * 2.2, 0, 1)
    scene = scene * (np.array(L['shadowTint'], dtype=np.float32) * (1 - k) + np.array(L['hiTint'], dtype=np.float32) * k)

    # ② 统一光照:光斑(树冠缝里透下的阳光 / 云层缝)边缘按 patch 收紧,暗处偏冷
    n = noise(h, w, L['lightScale'], 7) * 0.7 + noise(h, w, max(24, L['lightScale'] // 3), 11) * 0.3
    lit = np.clip((n - 0.5) * L['patch'] + 0.5, 0, 1)[..., None]
    shade = np.array(L['shade'], dtype=np.float32)
    sun = np.array(L['sun'], dtype=np.float32)
    light = shade + (sun - shade) * lit
    if L['rays']:
        t = (xx * 0.55 + yy) / w
        rays = np.clip(np.sin(t * 7.0 + 1.3) * 0.5 + 0.5, 0, 1) ** 8 * np.clip(1.1 - yy / h, 0, 1)
        light = light + rays[..., None] * np.array([0.16, 0.14, 0.08], dtype=np.float32)
    scene = scene * light

    # ③ 队伍光区:以角色中心为圆心提亮、外圈压暗(俯视动作游戏常用,让人物从环境里跳出来)
    am = m_act[..., 0]
    tot = am.sum()
    cx, cy = ((am * xx).sum() / tot, (am * yy).sum() / tot) if tot > 50 else (w / 2, h / 2)
    rr = np.sqrt(((xx - cx) / (w * 0.42)) ** 2 + ((yy - cy) / (h * 0.62)) ** 2)
    pool = 1 + L['pool'] * (np.exp(-rr * rr * 2.2) * 1.2 - 0.45)
    scene = scene * pool[..., None]

    # ④ 屏幕空间:暗角 + 远处空气感(屏幕上方)
    r = np.sqrt(((xx / w - 0.5) * 2) ** 2 + ((yy / h - 0.5) * 2) ** 2)
    vig = 1 - L['vig'] * np.clip(r / 1.3, 0, 1) ** 2.4
    far = np.clip(1 - yy / (h * 0.5), 0, 1) ** 1.8
    hc, ha = L['haze']
    scene = scene + (np.array(hc, dtype=np.float32) / 255 - scene) * (far * ha)[..., None]
    scene = scene * vig[..., None]

    # ⑤ 大气:很淡的雾带 + 浮尘
    fc, fa = L['fog']
    fog = noise(h // 4, w // 4, 40, 3)
    fog = np.asarray(Image.fromarray((fog * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), dtype=np.float32) / 255
    band = np.exp(-((yy / h - 0.25) / 0.14) ** 2)
    scene = scene + (np.array(fc, dtype=np.float32) / 255 - scene) * (fog * band * fa)[..., None]
    rng = np.random.default_rng(5)
    motes = np.zeros((h, w), dtype=np.float32)
    for _ in range(14):
        mx, my, mr = rng.random() * w, rng.random() * h * 0.8, 3 + rng.random() * 5
        motes += np.exp(-(((xx - mx) ** 2 + (yy - my) ** 2) / (2 * mr * mr))) * (0.4 + rng.random() * 0.4)
    scene = scene + np.clip(motes, 0, 1)[..., None] * np.array([1.0, 0.95, 0.8], dtype=np.float32) * 0.45
    if L.get('wisps'):
        # 发光点缀(枯木林鬼火):亮芯 + 大范围柔光,照亮脚下一小片地面(游戏里 = 叠加混合的柔光贴图 + 呼吸闪烁)
        count, wc = L['wisps']
        wc = np.array(wc, dtype=np.float32) / 255
        glow = np.zeros((h, w), dtype=np.float32)
        core = np.zeros((h, w), dtype=np.float32)
        rng2 = np.random.default_rng(21)
        for _ in range(count):
            gx, gy = (0.1 + rng2.random() * 0.8) * w, (0.15 + rng2.random() * 0.7) * h
            d2 = (xx - gx) ** 2 + (yy - gy) ** 2
            glow += np.exp(-d2 / (2 * 90.0 ** 2)) * 0.5
            core += np.exp(-d2 / (2 * 7.0 ** 2))
        scene = scene * (1 + glow[..., None] * wc * 0.9) + np.clip(core, 0, 1)[..., None] * (wc * 0.6 + 0.4) * 0.9

    # 角色 / 特效 / 界面原样贴回
    res = scene * (1 - m_act) + actors * m_act
    res = res * (1 - m_ui) + full * m_ui
    Image.fromarray(np.clip(res * 255, 0, 255).astype(np.uint8)).save(out)
    print('saved', out)


if __name__ == '__main__':
    main()
