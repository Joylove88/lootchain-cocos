# -*- coding: utf-8 -*-
"""野外树木 / 植被高质量重画(2026-11-08 用户手机实测晨风村:「这个树的换新的吧,需要高质量,细腻的」→「其他的也需要高质量细腻的」)。

旧素材树冠是同一种星形小叶团重复堆出来的,一眼 AI 感。这里用 Codex 桌面版命令行逐件重画:
- 参考图只给视角 / 体量(旧素材本身),提示词要求中等大小、在游戏显示尺寸下读得出的叶片 / 针叶,成团的明暗体积,哑光写实;
- 背景一律纯色平底(绿叶用品红,秋叶用青色),由 tree_hq_install.py 自己抠图——模型自带的透明底是一圈羽化糊边,
  外圈叶子还会画成空气透视的虚边(第一轮实测树冠外缘约 20% 半透明,用户「为啥树叶看起来比较糊」)。
输出:%TEMP%/lootchain-qa/tree_hq/<名字>.png;入库:python tools/qa/tree_hq_install.py <png> <资源> [--key cyan] [--no-shadow]。

用法:python tools/qa/tree_hq_gen.py [名字 ...]      (不带参数 = 全部;已存在的跳过)
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
RES = os.path.join(ROOT, 'assets', 'resources')

KEYS = {'magenta': 'pure magenta (#FF00FF)', 'cyan': 'pure cyan (#00FFFF)'}

TEMPLATE = (
    "Image 1 is the old sprite from our 2D fantasy RPG map. Use it ONLY for the viewing angle (high 3/4 bird's-eye view, "
    "like an isometric ARPG camera), overall shape and proportions. Do NOT copy its painting style - its foliage is made of "
    "repeated stamp-like blobs and looks fake.\n"
    "Generate ONE new image with your image generation tool: a single isolated {subject}.\n"
    "Quality bar: a premium dark-fantasy ARPG environment asset (photo-real painted, like high-end isometric action RPG games). "
    "{detail} Natural muted colours ({palette}), low saturation, matte, soft warm morning sunlight from the upper left, "
    "clear volume with lit top-left edges and deep cool shadow pockets. "
    "Crisp fine detail everywhere at full resolution, no blur, no noisy grain, no repeated stamp patterns, NOT cartoon, NOT glossy, "
    "NOT over-sharpened.\n"
    "Only the {short}; no ground patch, no grass, no rocks{extra_no}, no cast shadow, no other objects.\n"
    "Background: perfectly flat solid {key} everywhere around it and in every gap, no gradient, no shadow, no glow. "
    "The silhouette must be razor sharp against the background: every outer leaf / needle / twig individually defined with crisp edges, "
    "no depth of field, no atmospheric haze or soft fading at the edges, no background colour reflected on the object. "
    "Centered with a small margin. {size}. No text, no frame."
)

LEAVES = ("The crown is built from many medium-sized, clearly readable, irregular, individually varied leaves (each leaf large enough "
          "to read when the whole tree is shown about 600 pixels tall), grouped into a few large natural leaf masses with small gaps "
          "between them and a few thin twigs visible. Bark has fine realistic texture and moss.")
NEEDLES = ("The branches are layered tiers of dense needle sprays: each spray clearly readable (large enough to read when the whole tree "
           "is shown about 600 pixels tall), drooping branch tips, visible gaps between tiers showing the dark inner branches and a "
           "straight trunk. Bark has fine realistic texture.")

# 名字: (资源, 抠图底色, 提示词参数)
SPECS = {
    'oak_a2': ('ui/world/vil3/vil3_tree_oak', 'magenta', dict(
        subject='broad old oak tree with a wide spreading crown and a thick gnarled trunk', short='tree with its roots',
        detail=LEAVES, palette='deep olive and moss greens with a few warmer yellow-green sunlit leaves')),
    'vil_pine': ('ui/world/vil3/vil3_tree_pine', 'magenta', dict(
        subject='tall European spruce / fir tree with a narrow conical crown', short='tree with its roots', detail=NEEDLES,
        palette='deep blue-green and dark teal needles, a few warmer olive tips in the sun', size='Portrait 1024x1536')),
    'w_oak': ('ui/world/woods3/w3_tree_oak', 'magenta', dict(
        subject='mature forest oak tree with a dense, broad, slightly asymmetric crown and a mossy trunk with surface roots',
        short='tree with its roots', detail=LEAVES,
        palette='dark forest greens and olive, cooler blue-green shadows, moodier than a village tree')),
    'w_autumn': ('ui/world/woods3/w3_tree_autumn', 'cyan', dict(
        subject='autumn oak / maple tree with a broad crown of turning leaves and a dark trunk', short='tree with its roots',
        detail=LEAVES, palette='muted rust, ochre, burnt orange and a few remaining olive-green leaves; NOT neon orange')),
    'w_pine': ('ui/world/woods3/w3_tree_pine', 'magenta', dict(
        subject='tall dense forest spruce tree with a full conical crown down to near the ground', short='tree with its roots',
        detail=NEEDLES, palette='dark spruce green and deep teal, olive highlights on the lit tips', size='Portrait 1024x1536')),
    'w_ancient': ('ui/world/woods3/w3_ancient_tree', 'magenta', dict(
        subject='colossal ancient guardian tree, a forest landmark: enormous twisted multi-stem trunk, huge exposed roots spreading '
                'wide, a large crown on top', short='tree with its roots', detail=LEAVES,
        palette='old moss greens and olive, grey-brown ancient bark covered in moss and lichen', size='Portrait 1024x1536')),
    # 第二版:第一版村松树冠太稀太瘦(按旧图高宽比补边后比旧树瘦一圈)、古树树冠稀疏发灰撑不起地标
    'vil_pine2': ('ui/world/vil3/vil3_tree_pine', 'magenta', dict(
        subject='full, dense European spruce tree with a BROAD conical crown (crown width about 75% of the tree height), '
                'wide sweeping lower branch tiers reaching almost to the ground, short visible trunk at the base',
        short='tree with its roots', detail=NEEDLES,
        palette='deep blue-green and dark teal needles, a few warmer olive tips in the sun', size='Square 1024x1024')),
    'w_ancient2': ('ui/world/woods3/w3_ancient_tree', 'magenta', dict(
        subject='colossal ancient guardian tree, a forest landmark: enormous twisted multi-stem trunk, huge exposed roots spreading '
                'wide, and a MASSIVE, DENSE, full leafy crown that covers the whole upper half (no sparse or bare areas)',
        short='tree with its roots', detail=LEAVES,
        palette='rich deep moss and emerald greens with warm yellow-green sunlit tops, grey-brown ancient bark with moss',
        size='Portrait 1024x1536')),
    'dead_tree': ('ui/world/fld_dead_tree', 'magenta', dict(
        subject='dead leafless tree with a twisted grey trunk and gnarled bare branches ending in fine twigs',
        short='tree with its roots',
        detail='Every branch and twig is clearly defined and tapers naturally; weathered cracked bark with fine realistic texture.',
        palette='weathered grey and dark brown wood, a little dry lichen')),
    'bush': ('ui/world/vil3/vil3_bush', 'magenta', dict(
        subject='rounded leafy shrub / bush with a few small white flowers', short='bush', extra_no=', no flower petals on the ground',
        detail='Made of many medium-sized clearly readable leaves (large enough to read when the bush is shown about 200 pixels wide), '
               'grouped into soft leaf clusters with shadowed gaps.',
        palette='muted sage and olive greens, small off-white flowers')),
    'fern': ('ui/world/woods3/w3_fern', 'magenta', dict(
        subject='lush forest fern clump with long arching fronds spreading outward', short='fern clump',
        detail='Each frond has clearly defined pinnate leaflets (readable when the fern is shown about 220 pixels wide), '
               'overlapping fronds with darker inner fronds.',
        palette='fresh but muted fern greens, yellow-green lit fronds, darker inner fronds')),
}


def prompt_of(name):
    _, key, p = SPECS[name]
    args = dict(extra_no='', size='Square 1024x1024')
    args.update(p)
    args['key'] = KEYS[key]
    return TEMPLATE.format(**args)


def newest_after(t0):
    files = [f for f in glob.glob(os.path.join(GEN, '**', '*.png'), recursive=True) if os.path.getmtime(f) > t0]
    return max(files, key=os.path.getmtime) if files else None


def codex_exe():
    base = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
    found = glob.glob(os.path.join(base, '*', 'codex.exe'))
    return max(found, key=os.path.getmtime)


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    names = sys.argv[1:] or list(SPECS)
    os.makedirs(OUT, exist_ok=True)
    work = tempfile.mkdtemp(prefix='lc-tree-')
    for name in names:
        dst = os.path.join(OUT, name + '.png')
        if os.path.exists(dst):
            print('skip', name, flush=True)
            continue
        ref = os.path.join(RES, SPECS[name][0] + '.png')
        bak = os.path.join(ROOT, '素材原始备份', 'tree-hq-20261108', SPECS[name][0] + '.png')
        if os.path.exists(bak):
            ref = bak  # 已换过的用原图当参考
        t0 = time.time()
        # 新电脑用户 config.toml 写的 gpt-5.5 订阅不支持:按次覆盖模型,不改用户配置
        cmd = [codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"',
               '--skip-git-repo-check', '-s', 'read-only', '-C', work, '-i', ref, '-']
        print('gen', name, flush=True)
        r = subprocess.run(cmd, input=prompt_of(name).encode('utf-8'), capture_output=True, timeout=900)
        got = newest_after(t0)
        if got:
            shutil.copy(got, dst)
            print('ok', name, dst, f'{time.time() - t0:.0f}s', flush=True)
        else:
            print('FAIL', name, r.returncode, r.stdout[-600:].decode('utf-8', 'ignore'), r.stderr[-600:].decode('utf-8', 'ignore'), flush=True)
    print('done', OUT, flush=True)


if __name__ == '__main__':
    main()
