# -*- coding: utf-8 -*-
"""登录页 B 风格白色线条图标(11-11,原型 周报截图/2026-11-11_登录页/proto/login_b.png):
人像 / 锁 / 地球 / 扳手,统一线宽,8 倍超采样画再缩到 96×96 透明 PNG。
扳手借 ui/glass/notice_wrench.png 的实心剪影取外轮廓(膨胀 - 腐蚀)成线稿。
用法:python tools/qa/login_icons_gen.py → assets/resources/ui/login/b/icon_*.png"""
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT_DIR = os.path.join(ROOT, 'assets', 'resources', 'ui', 'login', 'b')
SIZE = 96
SS = 8
N = SIZE * SS
STROKE = 6.5 * SS  # 96 像素图上约 6.5 像素线宽(显示 28~32 时约 2 像素)
WHITE = (255, 255, 255, 255)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def p(v: float) -> float:
    return v * SS


def finish(img: Image.Image, name: str) -> None:
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{name}.png')
    out.save(path, optimize=True)
    print('saved', os.path.abspath(path))


def user() -> None:
    img, d = canvas()
    w = int(STROKE)
    d.ellipse([p(34), p(12), p(62), p(40)], outline=WHITE, width=w)
    # 肩:上半椭圆弧
    d.arc([p(18), p(48), p(78), p(108)], start=180, end=360, fill=WHITE, width=w)
    d.line([p(18) + w / 2, p(78), p(18) + w / 2, p(84)], fill=WHITE, width=w)
    d.line([p(78) - w / 2, p(78), p(78) - w / 2, p(84)], fill=WHITE, width=w)
    d.line([p(18), p(84) - w / 2, p(78), p(84) - w / 2], fill=WHITE, width=w)
    finish(img, 'icon_user')


def lock() -> None:
    img, d = canvas()
    w = int(STROKE)
    d.arc([p(30), p(10), p(66), p(52)], start=180, end=360, fill=WHITE, width=w)
    d.line([p(30) + w / 2, p(30), p(30) + w / 2, p(44)], fill=WHITE, width=w)
    d.line([p(66) - w / 2, p(30), p(66) - w / 2, p(44)], fill=WHITE, width=w)
    d.rounded_rectangle([p(20), p(42), p(76), p(86)], radius=p(7), outline=WHITE, width=w)
    d.ellipse([p(44), p(56), p(52), p(64)], fill=WHITE)
    d.line([p(48), p(60), p(48), p(72)], fill=WHITE, width=int(w * 0.8))
    finish(img, 'icon_lock')


def globe() -> None:
    img, d = canvas()
    w = int(STROKE * 0.85)
    d.ellipse([p(12), p(12), p(84), p(84)], outline=WHITE, width=w)
    d.ellipse([p(32), p(12), p(64), p(84)], outline=WHITE, width=w)
    d.line([p(12), p(48), p(84), p(48)], fill=WHITE, width=w)
    # 上下两条纬线:按圆的弦长截短
    for y, half in ((30, 29), (66, 29)):
        d.line([p(48 - half), p(y), p(48 + half), p(y)], fill=WHITE, width=w)
    finish(img, 'icon_globe')


def wrench() -> None:
    src = Image.open(os.path.join(ROOT, 'assets', 'resources', 'ui', 'glass', 'notice_wrench.png')).convert('RGBA')
    alpha = src.getchannel('A').resize((N, N), Image.LANCZOS).point(lambda v: 255 if v > 110 else 0)
    # 剪影外缘 → 线稿:内缩一圈后相减(线宽 ≈ STROKE),再整体缩 80% 留出边距与其他图标视觉等大
    k = int(STROKE) | 1
    inner = alpha.filter(ImageFilter.MinFilter(k))
    ring = ImageChops.subtract(alpha, inner).filter(ImageFilter.GaussianBlur(SS * 0.4))
    box = ring.getbbox()
    ring = ring.crop(box)
    scale = (N * 0.78) / max(ring.size)
    ring = ring.resize((int(ring.width * scale), int(ring.height * scale)), Image.LANCZOS)
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    solid = Image.new('RGBA', ring.size, WHITE)
    img.paste(solid, ((N - ring.width) // 2, (N - ring.height) // 2), ring)
    finish(img, 'icon_wrench')


if __name__ == '__main__':
    user()
    lock()
    globe()
    wrench()
