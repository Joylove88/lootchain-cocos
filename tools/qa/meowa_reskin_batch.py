# -*- coding: utf-8 -*-
"""Meowa 骨骼换皮批量出变种(2026-10-31):现有怪物 Spine 包 → AI 重画贴图(骨骼 / 动作不变)→ 解包 → 渲染动作对比 GIF。
换皮任务串行提交(同项目并发导入会被拒);已成功的按 job_id 取回不重交;渲染串行(无头 Edge 一次一个)。
产物:C:/mw/variants/<变种>/(Spine 包 + preview/ + compare.gif),原素材只读不动。
用法:python tools/qa/meowa_reskin_batch.py [--x2] [--only 变种1,变种2] [--render-only]   (--x2 = 精英 / 首领高清写实版)
"""
import glob, json, os, re, subprocess, sys, zipfile
from PIL import Image, ImageDraw, ImageFont, ImageSequence

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MONSTER = os.path.join(REPO, 'assets', 'resources', 'spine', 'monster')
RUNNER = r'C:\Users\axian\.claude\skills\game-assets\meowart_api.py'
PROJECT, THREAD = 'proj_00cff6210fb14ad9b034383493c916a8', 'thread_2f9fd116cc164e9196538f51eb1d0ace'
OUT = 'C:/mw/variants'
RENDER = os.path.join(REPO, 'tools', 'qa', 'fxprev', 'render_char.py')
STYLE = ('Keep the exact same realistic painterly dark-fantasy style, silhouette, part shapes and lighting direction as the original. '
         'Realistic detailed textures, not cartoon, not anime.')
VARIANTS = [
    # (变种目录, 中文名, 原怪目录, 提示词)
    ('spider_frost', '冰霜林蛛', 'small_spider', 'Frost spider variant: pale icy blue-white chitin coated in rime frost, sharp ice crystals growing on its back and leg joints, glowing cold cyan eyes.'),
    ('spider_lava', '熔岩林蛛', 'small_spider', 'Lava spider variant: charred black volcanic carapace with glowing molten orange cracks and embers, ember-red eyes, smoldering ash on the legs.'),
    ('dog_undead', '亡灵野犬', 'medium_dog', 'Undead hound variant: rotting grey-green hide torn open showing exposed ribs and bones, tattered fur, ghostly pale blue glowing eyes.'),
    ('dog_snow', '雪原野犬', 'medium_dog', 'Snowfield wild dog variant: thick white and pale grey winter fur with frost on the tips, icy blue eyes, darker grey muzzle and paws.'),
    ('bear_corrupt', '腐化熊', 'medium_bear', 'Corrupted bear variant: dark fur overgrown with glowing purple fungal growths and corrupted crystal shards, sickly violet glowing eyes, patches of rot.'),
]
# 精英 / 首领高清写实版(10-31 用户「画质更高、更写实更真实」):先把原图集 ×2(spine_atlas_scale)再换皮,AI 按两倍像素回填细节
REAL = ('Photorealistic creature, like a high-end realistic film creature render: real micro surface detail, individual fur strands, pores, '
        'wet glossy highlights, physically based lighting and materials. Keep each part shape, silhouette and orientation exactly as the original. '
        'Not cartoon, not painterly, not stylized.')
VARIANTS_X2 = [
    ('elite_spider_lava', '熔岩蛛后', 'small_spider', 'Lava spider queen: charred black volcanic chitin plates with deep glowing molten orange-yellow magma veins running across the abdomen and legs, '
     'bright embers and heat glow seeping from cracks, smoldering ash on the hairs, glowing ember-red eyes. Strong visible lava glow.'),
    ('elite_bear_brown', '棕鬃熊', 'medium_bear', 'Massive brown-maned grizzly bear: thick realistic dark brown fur with a shaggy reddish-brown mane, scars, wet nose, sharp worn claws, angry amber eyes.'),
    ('boss_bear_corrupt', '腐木巨熊', 'medium_bear', 'Corrupted rotten-wood giant bear boss: dark matted fur rotting in patches, overgrown with real bracket fungus, moss, rotten bark and glowing deep-violet '
     'fungal crystals, dim sickly violet glowing eyes, dripping dark sap. Grim and menacing, muted colors, the violet glow only in the fungus and eyes.'),
]
X2 = '--x2' in sys.argv
args = sys.argv[1:]
ONLY = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
RENDER_ONLY = '--render-only' in args
FONT = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 22)
SHOW = ['idle', 'run_h', 'death_slash']


def base_of(src):
    return os.path.splitext(os.path.basename(glob.glob(os.path.join(MONSTER, src, '*.json'))[0]))[0]


def job_of(logpath):
    if not os.path.exists(logpath):
        return None
    m = re.search(r'job_id=(job_[0-9a-f]+)', open(logpath, encoding='utf-8', errors='replace').read())
    return m.group(1) if m else None


def status_of(logpath):
    found = re.findall(r'status=([a-z]+)', open(logpath, encoding='utf-8', errors='replace').read()) if os.path.exists(logpath) else []
    return found[-1] if found else None


def reskin(v):
    name, cn, src, prompt = v
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    base = base_of(src)
    srcdir = os.path.join(MONSTER, src)
    if X2:
        srcdir = os.path.join(d, 'src_x2')
        subprocess.run([sys.executable, os.path.join(REPO, 'tools', 'qa', 'spine_atlas_scale.py'), os.path.join(MONSTER, src), base, srcdir], check=True, stdout=subprocess.DEVNULL)
        prompt = prompt + ' ' + REAL
    pkg = os.path.join(d, 'src.zip')
    with zipfile.ZipFile(pkg, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in os.listdir(srcdir):
            if os.path.splitext(f)[1] in ('.json', '.atlas', '.png'):
                z.write(os.path.join(srcdir, f), f)
    logpath = os.path.join(d, 'run.log')
    job = job_of(logpath)
    if not (job and status_of(logpath) == 'success'):
        # 已成功的任务不重交(会再扣积分),直接按 job_id 取回
        log = open(logpath, 'w', encoding='utf-8')
        subprocess.run([sys.executable, RUNNER, 'spine-reskin-run', '--source-spine-package', pkg, '--project-id', PROJECT, '--thread-id', THREAD,
                        '--display-name', name, '--prompt', prompt if X2 else prompt + ' ' + STYLE, '--generation-model', 'nano-banana', '--resolution', '2K',
                        '--quality', 'ultimate', '--export-version', '4.2', '--output-dir', os.path.join(d, 'o')], stdout=log, stderr=subprocess.STDOUT, cwd=REPO)
        log.close()
        job = job_of(logpath)
    zips = glob.glob(os.path.join(d, 'o', '*', '*.zip'))
    if not zips and job and status_of(logpath) == 'success':
        # 输出目录名取自提示词,长了超 Windows 路径上限 → 下载失败;任务本身成功,用短目录按 job_id 取回(不重复扣费)
        subprocess.run([sys.executable, RUNNER, 'spine-poll', '--job-id', job, '--output-dir', os.path.join(d, 'p'), '--export-version', '4.2'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=REPO)
        zips = glob.glob(os.path.join(d, 'p', '*', '*.zip'))
    if not zips:
        return name, f'failed (job {job}), see run.log'
    pack = os.path.join(d, 'pack')
    os.makedirs(pack, exist_ok=True)
    with zipfile.ZipFile(zips[0]) as z:
        for i in z.infolist():
            ext = os.path.splitext(i.filename)[1]
            # 包内 json / atlas 名是 GBK 乱码:统一改回原基名;贴图名保持(atlas 里按名引用)
            out = base + ext if ext in ('.json', '.atlas') else i.filename
            open(os.path.join(pack, out), 'wb').write(z.read(i))
    return name, 'ok'


def frames(path):
    return [f.convert('RGB') for f in ImageSequence.Iterator(Image.open(path))]


def render(v):
    name, cn, src, _ = v
    d = os.path.join(OUT, name)
    base = base_of(src)
    orig = os.path.join(OUT, '_orig_' + src)
    if not os.path.isdir(orig):
        subprocess.run([sys.executable, RENDER, os.path.join(MONSTER, src), base, orig], check=True)
    subprocess.run([sys.executable, RENDER, os.path.join(d, 'pack'), base, os.path.join(d, 'preview')], check=True)
    have = [a for a in SHOW if os.path.exists(os.path.join(orig, a + '.gif'))]
    if not have:
        have = sorted(os.path.splitext(p)[0] for p in os.listdir(orig) if p.endswith('.gif'))[:3]
    A = [frames(os.path.join(orig, a + '.gif')) for a in have]
    B = [frames(os.path.join(d, 'preview', a + '.gif')) for a in have]
    n = max(len(s) for s in A)
    out = []
    for i in range(n):
        W = Image.new('RGB', (360 * len(have), 850), (20, 20, 24))
        dr = ImageDraw.Draw(W)
        for k, a in enumerate(have):
            for r, S in enumerate((A, B)):
                s = S[k]
                f = s[min(i, len(s) - 1)] if 'death' in a else s[i % len(s)]
                W.paste(f.resize((360, 420)), (k * 360, r * 430))
        dr.text((10, 8), f'原版 {src}', fill=(240, 220, 180), font=FONT)
        dr.text((10, 438), f'{cn}(Meowa 换皮)', fill=(180, 255, 160), font=FONT)
        out.append(W)
    out[0].save(os.path.join(d, 'compare.gif'), save_all=True, append_images=out[1:], duration=50, loop=0)
    # 静帧:每个动作取中间一帧
    out[len(out) // 3].save(os.path.join(d, 'compare.jpg'), quality=88)


if __name__ == '__main__':
    todo = [v for v in (VARIANTS_X2 if X2 else VARIANTS) if not ONLY or v[0] in ONLY]
    if not RENDER_ONLY:
        # 串行:同一项目并发导入骨骼包会被服务端拒(spine_import_in_progress)
        for v in todo:
            name, status = reskin(v)
            print('reskin', name, status, flush=True)
    for v in todo:
        if os.path.isdir(os.path.join(OUT, v[0], 'pack')):
            render(v)
            print('render', v[0], 'ok', flush=True)
