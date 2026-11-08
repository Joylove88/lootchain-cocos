# -*- coding: utf-8 -*-
"""野外树木高质量重画(2026-11-08 用户手机实测晨风村:「这个树的换新的吧,需要高质量,细腻的」)。

旧 vil3_tree_oak 的树冠是同一种星形小叶团重复堆出来的,一眼 AI 感;这里用 Codex 桌面版命令行重画候选,
参考图只给视角 / 体量(旧树),提示词要求真实细碎叶片、成团的明暗体积、哑光写实。
输出:%TEMP%/lootchain-qa/tree_hq/<名字>.png(候选),再拼对比图给用户挑;入库另走 tree_hq_install.py。

用法:python tools/qa/tree_hq_gen.py [名字 ...]      (不带参数 = 全部候选;已存在的跳过)
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'tree_hq')
GEN = os.path.expanduser(os.path.join('~', '.codex', 'generated_images'))
REF_OAK = os.path.join(ROOT, 'assets', 'resources', 'ui', 'world', 'vil3', 'vil3_tree_oak.png')

BASE = (
    "Image 1 is the old tree sprite from our 2D fantasy RPG map. Use it ONLY for the viewing angle (high 3/4 bird's-eye view, "
    "like an isometric ARPG camera), overall size and silhouette proportions. Do NOT copy its leaf style - its leaves are repeated "
    "star-shaped blobs and look fake.\n"
    "Generate ONE new image with your image generation tool: a single isolated {subject}.\n"
    "Quality bar: a premium dark-fantasy ARPG environment asset (photo-real painted, like high-end isometric action RPG games). "
    "The crown is built from thousands of small, irregular, individually varied leaves grouped into a few large natural leaf masses; "
    "each mass has clear volume: lit top-left edges, soft sub-surface translucency, deep cool shadow pockets inside, "
    "small gaps of sky between masses, a few thin twigs visible. Bark has fine realistic texture and moss. "
    "Natural muted colours ({palette}), low saturation, matte, soft warm morning sunlight from the upper left. "
    "Crisp fine detail everywhere at full resolution, no blur, no noisy grain, no repeated stamp patterns, NOT cartoon, NOT glossy, "
    "NOT over-sharpened.\n"
    "Only the tree with its roots; no ground patch, no grass, no rocks, no cast shadow, no other objects. "
    "Fully TRANSPARENT background (PNG with alpha), clean anti-aliased edges, tree centered with a small margin. "
    "Square 1024x1024. No text, no frame."
)

# 第二轮(用户「为啥树叶看起来比较糊」):模型自己抠的透明底是一圈羽化的糊边(树冠外缘 18~21% 半透明),外圈叶子还画成了
# 空气透视的虚边。改为纯品红平底 + 外缘每片叶子硬朗清楚,由 tree_hq_install.py 自己按颜色抠图(边缘 1~2 像素抗锯齿)。
KEYED = BASE.replace(
    "Fully TRANSPARENT background (PNG with alpha), clean anti-aliased edges, tree centered with a small margin. ",
    "Background: perfectly flat solid pure magenta (#FF00FF) everywhere around the tree and in the gaps between leaf masses, "
    "no gradient, no shadow, no glow. The tree silhouette must be razor sharp against the magenta: every outer leaf individually "
    "defined with crisp edges, no depth of field, no atmospheric haze or soft fading at the crown edge, no magenta reflected on the leaves. "
    "Tree centered with a small margin. "
).replace(
    "The crown is built from thousands of small, irregular, individually varied leaves",
    "The crown is built from many medium-sized, clearly readable, irregular, individually varied leaves (each leaf large enough to read "
    "when the whole tree is shown about 600 pixels tall)",
)

JOBS = {
    'oak_a': BASE.format(subject='broad old oak tree with a wide spreading crown and a thick gnarled trunk',
                         palette='deep olive and moss greens with a few warmer yellow-green sunlit leaves'),
    'oak_b': BASE.format(subject='large European beech / oak tree with a dense rounded but irregular crown and a sturdy trunk with surface roots',
                         palette='fresh but muted mid greens, cooler blue-green in the shadows'),
    'oak_c': BASE.format(subject='ancient oak tree with a tall asymmetric crown, heavy leaf masses leaning slightly right, twisted trunk',
                         palette='dark forest greens and olive, darker and moodier, subtle grey-green highlights'),
    'oak_a2': KEYED.format(subject='broad old oak tree with a wide spreading crown and a thick gnarled trunk',
                           palette='deep olive and moss greens with a few warmer yellow-green sunlit leaves'),
    'oak_b2': KEYED.format(subject='large European oak tree with a dense rounded but irregular crown and a sturdy trunk with surface roots',
                           palette='fresh but muted mid greens, cooler blue-green in the shadows'),
}


def newest_after(t0):
    files = [f for f in glob.glob(os.path.join(GEN, '**', '*.png'), recursive=True) if os.path.getmtime(f) > t0]
    return max(files, key=os.path.getmtime) if files else None


def codex_exe():
    base = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
    found = glob.glob(os.path.join(base, '*', 'codex.exe'))
    return max(found, key=os.path.getmtime)


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    names = sys.argv[1:] or list(JOBS)
    os.makedirs(OUT, exist_ok=True)
    work = tempfile.mkdtemp(prefix='lc-tree-')
    for name in names:
        dst = os.path.join(OUT, name + '.png')
        if os.path.exists(dst):
            print('skip', name, flush=True)
            continue
        t0 = time.time()
        # 新电脑用户 config.toml 写的 gpt-5.5 订阅不支持:按次覆盖模型,不改用户配置
        cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"',
               '--skip-git-repo-check', '-s', 'read-only', '-C', work, '-i', REF_OAK, '-']
        print('gen', name, flush=True)
        r = subprocess.run(cmd, input=JOBS[name].encode('utf-8'), capture_output=True, timeout=900)
        got = newest_after(t0)
        if got:
            shutil.copy(got, dst)
            print('ok', name, dst, f'{time.time() - t0:.0f}s', flush=True)
        else:
            print('FAIL', name, r.returncode, r.stdout[-600:].decode('utf-8', 'ignore'), r.stderr[-600:].decode('utf-8', 'ignore'), flush=True)
    print('done', OUT, flush=True)


if __name__ == '__main__':
    main()
