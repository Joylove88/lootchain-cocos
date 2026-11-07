# -*- coding: utf-8 -*-
"""D26 异界神州英雄美术(2026-11-07):以骨骼待机透明立绘为参考,经本机 Codex(GPT 订阅)生成
  roster  = 横版半身卡面 16:9(名册卡 / 属性详情头条 / 契约之选卡)
  avatar  = 1:1 胸像头像
参考图:fxprev/render_portrait.py 渲出的 D:/骨骼动画素材/d26_portrait/<资源名>.png(透明底,垫中灰底后送参考)。
产物:D:/骨骼动画素材/d26_art/<kind>/<英雄码>.png(已存在则跳过,可断点续跑)。一次只跑一张(按生成时间取图会串)。
用法:python tools/qa/d26_art_gen.py [roster|avatar ...] [--only UR_LVBU,SR_HUATUO]
"""
import glob, os, shutil, subprocess, sys, tempfile, time
from PIL import Image

PORTRAIT = 'D:/骨骼动画素材/d26_portrait'
OUT = 'D:/骨骼动画素材/d26_art'
MODEL = os.environ.get('CODEX_MODEL', 'gpt-6.1-sol')  # 本机 config.toml 写的 gpt-5.5 用订阅账号跑不了
GEN_DIR = os.path.expanduser('~/.codex/generated_images')

# 英雄码 → 资源名
HEROES = {
    'UR_ZHAOYUN': 'sz_zhaoyun', 'UR_ZHUGELIANG': 'sz_zhugeliang', 'UR_LVBU': 'sz_lvbu',
    'SSR_SUNWUKONG': 'sz_sunwukong', 'SSR_DIAOCHAN': 'sz_diaochan', 'SSR_SUNSHANGXIANG': 'sz_sunshangxiang', 'SSR_ZHANGFEI': 'sz_zhangfei',
    'SR_YANGJIAN': 'sz_yangjian', 'SR_HUATUO': 'sz_huatuo', 'SR_ZHANGCHUNHUA': 'sz_zhangchunhua', 'SR_ZHANGJIAO': 'sz_zhangjiao',
    'SR_HUANGZHONG': 'sz_huangzhong', 'SR_CAOREN': 'sz_caoren',
    'R_DAQIAO': 'sz_daqiao', 'R_HUAXIONG': 'sz_huaxiong', 'R_GANNING': 'sz_ganning', 'R_XUNYOU': 'sz_xunyou',
    'R_TAISHICI': 'sz_taishici', 'R_DIANWEI': 'sz_dianwei',
}

COMMON = ('Use the attached image as the exact character design reference: keep the same face, hairstyle, outfit colors, armor '
          'ornaments, accessories and signature weapon. Re-draw it as a high-end game illustration in a semi-realistic painted '
          'style (detailed rendering, cinematic rim light, natural skin, not chibi, not cartoon, not flat cel shading). '
          'No text, no letters, no logo, no watermark, no UI, no frame, no border.')
PROMPTS = {
    'roster': ('Create ONE horizontal 16:9 hero card illustration (landscape, about 1672x941). ' + COMMON +
               ' Composition: waist-up / half-body shot of this single character, centered, body turned 3/4 toward the viewer, '
               'face fully visible in the upper-middle area, weapon partly in frame. Background: a mythic ancient Chinese otherworld - '
               'misty mountain peaks, ruined palace pavilions and stone stairs at dusk, drifting embers, kept dark and desaturated '
               'with soft depth of field so the character clearly stands out.'),
    'avatar': ('Create ONE square 1:1 avatar portrait (about 1024x1024). ' + COMMON +
               ' Composition: head-and-shoulders bust of this single character, face centered and large, looking at the viewer, '
               'both eyes visible. Background: dark smoky gradient with a soft glow in the character\'s main color, nothing else.'),
}


def find_codex():
    base = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
    exes = glob.glob(os.path.join(base, '*', 'codex.exe'))
    if not exes:
        sys.exit('codex.exe not found under ' + base)
    return max(exes, key=os.path.getmtime)


def reference(asset, tmp):
    im = Image.open(os.path.join(PORTRAIT, asset + '.png')).convert('RGBA')
    im.thumbnail((900, 900), Image.LANCZOS)
    bg = Image.new('RGBA', (im.width + 80, im.height + 80), (70, 72, 80, 255))
    bg.alpha_composite(im, (40, 40))
    p = os.path.join(tmp, 'ref.png')
    bg.convert('RGB').save(p)
    return p


def gen(codex, kind, code, asset):
    dst = os.path.join(OUT, kind, code + '.png')
    if os.path.exists(dst):
        return 'skip'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='d26art_')
    ref = reference(asset, tmp)
    t0 = time.time()
    r = subprocess.run([codex, 'exec', '--skip-git-repo-check', '-m', MODEL, '-c', 'model_reasoning_effort="low"', '-s', 'read-only', '-C', tmp, '-i', ref, '-'],
                       input=PROMPTS[kind], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    news = [p for p in glob.glob(os.path.join(GEN_DIR, '**', '*.png'), recursive=True) if os.path.getmtime(p) >= t0 - 1]
    shutil.rmtree(tmp, ignore_errors=True)
    if not news:
        return f'FAILED rc={r.returncode} {r.stdout[-400:]} {r.stderr[-400:]}'
    src = max(news, key=os.path.getmtime)
    shutil.copyfile(src, dst)
    w, h = Image.open(dst).size
    return f'ok {w}x{h} {time.time() - t0:.0f}s'


def main():
    args = sys.argv[1:]
    only = set()
    if '--only' in args:
        i = args.index('--only')
        only = set(args[i + 1].split(','))
        del args[i:i + 2]
    kinds = args or ['roster', 'avatar']
    codex = find_codex()
    for kind in kinds:
        for code, asset in HEROES.items():
            if only and code not in only:
                continue
            print(f'[{kind}] {code}: {gen(codex, kind, code, asset)}', flush=True)


if __name__ == '__main__':
    main()
