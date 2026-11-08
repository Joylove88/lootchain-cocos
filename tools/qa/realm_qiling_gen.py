# -*- coding: utf-8 -*-
"""契灵境主角立绘(2026-11-08 docs/60 §5.1「契约者战甲 + 身后环绕的 3 枚悬浮契印」):以炼魂立绘为参考同姿势换装。

用法:python tools/qa/realm_qiling_gen.py [gen|install] [male|female ...]
- gen:Codex 出品红平底图到 %TEMP%/lootchain-qa/realm_qiling/<性别>.png(已存在跳过);
- install:抠图 + 按炼魂立绘同画布 810×1080、脚底对齐、等高缩放 → ui/realm/protag_<m|f>_qiling.png(meta 抄炼魂换 uuid)。
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_proto_gen import GEN, codex_exe, other_codex_exec  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REALM = os.path.join(ROOT, 'assets', 'resources', 'ui', 'realm')
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'realm_qiling')

PROMPT = (
    'Image 1 is our game character (the {who}) in the current outfit. Generate ONE new image with your image generation tool: '
    'the SAME character - identical face, hair, body proportions, pose, camera angle, framing and painting style - but promoted to a '
    'higher realm and wearing an upgraded outfit: a "contract-bearer battle armor": fitted dark steel plate with pale-gold engraved '
    'trim over a dark leather undersuit, a flowing dark half-cape, faint pale-gold contract runes glowing softly along the armor seams, '
    'and THREE floating circular contract seals (ornate rune rings about the size of a palm, pale gold with a soft inner light) '
    'hovering behind the shoulders in a gentle arc. Keep the same weapon type but upgraded ({weapon}). Realistic semi-painterly style '
    'matching image 1 exactly, muted natural colours, soft light from the upper left, no other glow or particles, no background scene.\n'
    'Background: perfectly flat solid pure magenta (#FF00FF) everywhere, no gradient, no floor, no shadow. Whole body visible from head '
    'to feet with a small margin, same position and size in the frame as image 1. Portrait 1024x1536. No text, no frame.'
)
SPECS = {
    'male': ('protag_m', 'young male hero', 'a longsword with a faintly glowing rune blade'),
    'female': ('protag_f', 'young female hero', 'a slender rapier with a faintly glowing rune blade'),
}


def gen(name):
    code, who, weapon = SPECS[name]
    dst = os.path.join(OUT, name + '.png')
    if os.path.exists(dst):
        print('skip', name)
        return
    while other_codex_exec() > 0:
        time.sleep(10)
    before = set(os.listdir(GEN)) if os.path.isdir(GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-qiling-')
    cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"', '--skip-git-repo-check', '-s', 'read-only',
           '-C', work, '-i', os.path.join(REALM, f'{code}_lianhun.png'), '-']
    t0 = time.time()
    r = subprocess.run(cmd, input=PROMPT.format(who=who, weapon=weapon).encode('utf-8'), capture_output=True, timeout=1200)
    text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
    new_dirs = [d for d in os.listdir(GEN) if d not in before]
    mine = [d for d in new_dirs if d in text] or (new_dirs if len(new_dirs) == 1 else [])
    imgs = [p for d in mine for p in glob.glob(os.path.join(GEN, d, '*.png'))]
    if not imgs:
        print('FAIL', name, text[-400:])
        return
    shutil.copy(max(imgs, key=os.path.getmtime), dst)
    print('ok', name, f'{time.time() - t0:.0f}s', flush=True)


def key_magenta(src):
    """按「离纯品红的颜色距离」抠图(通用的 (R+B)/2-G 判据会把暖肤色 / 金色契印当背景抠掉,脸上出洞):
    距离 < 40 全透明、> 100 全不透明,中间线性;半透明边缘按 I = a·F + (1-a)·K 反解前景色去品红溢色,再裁紧。"""
    import numpy as np
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    k = np.array([255.0, 0.0, 255.0])
    # 品红溢色反解:前景本身不带「R、B 都高于 G」的品红成分 → 多出来的 min(R,B) - G 全算底色贡献,
    # alpha = 1 - 溢出 / 255(纯品红 = 0,肤色 / 金色 = 1,契印外圈柔光 ≈ 半透明白金),再按 I = a·F + (1-a)·K 还原前景
    spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, 255)
    al = 1 - spill / 255
    al = np.where(al < 0.08, 0, al)
    fg = (a - (1 - al[..., None]) * k) / np.maximum(al[..., None], 1e-3)
    fg = fg.clip(0, 255)
    # 契印被模型画成了粉金(底色串色):B 高于 G 且偏红的像素压蓝通道 → 淡金;肤色 / 盔甲金边 B < G,不受影响
    pink = (fg[..., 2] > fg[..., 1]) & (fg[..., 0] > fg[..., 1] + 30)
    fg[..., 2] = np.where(pink, fg[..., 1] * 0.62, fg[..., 2])
    fg[..., 1] = np.where(pink, np.minimum(255, fg[..., 1] * 1.08), fg[..., 1])
    out = Image.fromarray(np.concatenate([fg, al[..., None] * 255], -1).round().astype(np.uint8), 'RGBA')
    bb = out.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    return out.crop(bb)


def install(name):
    code = SPECS[name][0]
    ref = Image.open(os.path.join(REALM, f'{code}_lianhun.png')).convert('RGBA')
    rb = ref.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    fig = key_magenta(os.path.join(OUT, name + '.png'))
    # 等高:新人物高度 = 炼魂人物高度 × 1.02(契印在肩后,整体略高一点无妨);脚底对齐、水平居中到炼魂人物中心
    h = round((rb[3] - rb[1]) * 1.02)
    w = round(fig.width * h / fig.height)
    fig = fig.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', ref.size, (0, 0, 0, 0))
    cx = (rb[0] + rb[2]) // 2
    canvas.alpha_composite(fig, (max(0, min(ref.width - w, cx - w // 2)), max(0, rb[3] - h)))
    out = os.path.join(REALM, f'{code}_qiling.png')
    canvas.save(out, optimize=True)
    meta = json.load(open(os.path.join(REALM, f'{code}_lianhun.png.meta'), encoding='utf-8'))
    s = json.dumps(meta, ensure_ascii=False, indent=2).replace(meta['uuid'], str(uuid.uuid4())).replace(f'{code}_lianhun', f'{code}_qiling')
    if not os.path.exists(out + '.meta'):
        open(out + '.meta', 'w', encoding='utf-8', newline='\n').write(s + '\n')
    print('installed', out, canvas.size)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    os.makedirs(OUT, exist_ok=True)
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'gen'
    for n in (sys.argv[2:] or list(SPECS)):
        gen(n) if cmd == 'gen' else install(n)
