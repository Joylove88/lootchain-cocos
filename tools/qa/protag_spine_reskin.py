# -*- coding: utf-8 -*-
"""docs/60 主角野外骨骼(2026-11-03):拿现有 SSR / UR 写实战斗骨骼换皮成主角(骨骼 / 动作 / 打击感不变,只换贴图)。
用户 11-03:R / SR 是 Q 版,SSR / UR 不是,主角按后者做;男底 = SSR Ron(Eulenspigel),女底 = UR Atlas(Lucrecia)。
管线(同 docs/56 血月契约):
  1. spine_atlas_scale ×2(AI 按两倍像素回填细节,游戏显示尺寸不变)
  2. spine-reskin-run --reference-image <同姿势写实原型>(protag_asset_gen.py skinref_m / skinref_f,GPT 按底骨骼待机姿势画的主角)
  3. fx_tex_repack --no-color --halo 0:只取 Meowa 画好的贴图按区域名搬回我们放大过的图集,骨骼仍用原 json
  4. spine_reskin_orient_check --fix:修 rotate 部件整块转反
  5. render_char 出各动作 GIF + 总览(原版对比另看 base_cands)
已成功的换皮任务按 job_id 取回,不重交(会再扣积分)。产物:C:/mw/protag/<m|f>/out(原素材只读不动)。
用法:python tools/qa/protag_spine_reskin.py [m|f ...] [--render-only]
"""
import glob, os, re, subprocess, sys, zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERO = os.path.join(REPO, 'assets', 'resources', 'spine', 'hero')
SRC_ART = os.path.join(REPO, '周报截图', '2026-11-02_主角', 'assets_src')
RUNNER = r'C:\Users\axian\.claude\skills\game-assets\meowart_api.py'
PROJECT, THREAD = 'proj_00cff6210fb14ad9b034383493c916a8', 'thread_2f9fd116cc164e9196538f51eb1d0ace'
OUT = 'C:/mw/protag'
QA = os.path.join(REPO, 'tools', 'qa')
STYLE = ('Smooth refined semi-realistic dark-fantasy painting like the reference image, realistic face, clean edges, no grain, no fuzzy hair. '
         'Keep every part exactly the same size, position, orientation and silhouette as the original. Not anime, not chibi, not cartoon.')
TARGETS = {
    'm': ('Eulenspigel', 'skinref_m.png',
          'Re-texture this character as a lean 18-year-old village youth: short neat dark brown hair, plain worn linen tunic with laced collar, '
          'long worn hooded brown wool travelling cloak, leather belt with pouch, leather bracers, brown trousers, leather boots; the blade in his '
          'hand is a pale WOODEN training sword and the big sword on his back is a WOODEN training greatsword.'),
    'f': ('Lucrecia', 'skinref_f.png',
          'Re-texture this character as a slender 18-year-old village girl: brown hair in a low ponytail, plain worn linen tunic, short worn brown '
          'wool cape, leather belt with pouch, leather bracers, brown trousers, leather boots (modest, not revealing); the long blade is a pale '
          'WOODEN practice blade and the big shield is a plain WOODEN tower shield of rough planks bound with dark iron bands, no spikes.'),
    # 11-03 用户「男女都只要带剑的」:SSR / UR 里只持一把剑的只有永夜龙骑(IshmaelA),男女共用这副底;重甲轮廓用斗篷 / 层叠布衣盖住
    'm2': ('IshmaelA', 'skinref_m2.png',
           'Re-texture this character as a lean 18-year-old village youth with NO armour: short neat dark brown hair and a bare face (no helmet), '
           'hooded brown wool travelling cloak over the shoulders, plain worn linen tunic, leather belt with pouch, leather bracers, brown trousers, '
           'leather boots, worn brown wool cape; the long sword is a pale WOODEN training sword.'),
    'f2': ('IshmaelA', 'skinref_f2.png',
           'Re-texture this character as a slender 18-year-old village girl with NO armour: short brown chin-length bob and a bare face (no helmet), '
           'hooded brown wool travelling cloak over the shoulders, plain worn linen tunic, leather belt with pouch, leather bracers, brown trousers, '
           'leather boots, worn brown wool cape, modest; the long sword is a pale WOODEN training sword.'),
    # 11-04 docs/60 §12 P1b 炼魂境外观(旅者轻甲 + 短兜帽披风 + 符文剑):同一副永夜龙骑底,参考图按 m2 同姿势换装(skinref_m3);
    # 女版照觉醒版终版口径:男版整套贴图 + 只留女主脸(protag_body_from_male.py),不单独换皮
    'm3': ('IshmaelA', 'skinref_m3.png',
           'Re-texture this character as the same lean 18-year-old youth, now a travelling swordsman: short neat dark brown hair and a bare face '
           '(no helmet), light traveller armour of dark leather with blued-steel shoulder plates, forearm plates and knee plates, belted layered '
           'tunic with straps, short dark charcoal hooded cape over the shoulders, dark trousers, leather boots with steel shin guards; the long '
           'sword is a rune-etched steel sword with a faint pale-blue line along the fuller and a bronze crossguard.'),
    # 11-04 炼魂大招「夜帝残影」的虚影(用户选 B:和原型一样有王冠 / 长发):同一副永夜龙骑底换成夜帝本人,游戏里放大 + 半透明 + 染紫;
    # 骨骼没有翅膀部件,翅膀另做特效层
    'yd': ('IshmaelA', 'skinref_yd.png',
           'Re-texture this character as 夜帝, a tall regal dark emperor: pale stern face, long wavy black hair kept close to the head and shoulders, '
           'a tall spiked dark-gold crown, ornate layered dark armour with thin gold filigree, a long torn dark-purple cape, dark gauntlets and greaves; '
           'the long sword is a great sword with a pale-violet blade and an ornate dark-gold crossguard.'),
}


def job_of(logpath):
    if not os.path.exists(logpath):
        return None
    m = re.search(r'job_id=(job_[0-9a-f]+)', open(logpath, encoding='utf-8', errors='replace').read())
    return m.group(1) if m else None


def status_of(logpath):
    found = re.findall(r'status=([a-z]+)', open(logpath, encoding='utf-8', errors='replace').read()) if os.path.exists(logpath) else []
    return found[-1] if found else None


def run(cmd, **kw):
    print('  $', ' '.join(os.path.basename(c) if i == 1 else c for i, c in enumerate(cmd))[:200], flush=True)
    return subprocess.run(cmd, cwd=REPO, **kw)


def reskin(key):
    base, ref, prompt = TARGETS[key]
    d = os.path.join(OUT, key)
    os.makedirs(d, exist_ok=True)
    x2 = os.path.join(d, 'src_x2')
    if not os.path.isdir(x2):
        run([sys.executable, os.path.join(QA, 'spine_atlas_scale.py'), os.path.join(HERO, base), base, x2], check=True, stdout=subprocess.DEVNULL)
    pkg = os.path.join(d, 'src.zip')
    with zipfile.ZipFile(pkg, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in os.listdir(x2):
            if os.path.splitext(f)[1] in ('.json', '.atlas', '.png'):
                z.write(os.path.join(x2, f), f)
    logpath = os.path.join(d, 'run.log')
    job = job_of(logpath)
    if not (job and status_of(logpath) == 'success'):
        with open(logpath, 'w', encoding='utf-8') as log:
            run([sys.executable, RUNNER, 'spine-reskin-run', '--source-spine-package', pkg, '--project-id', PROJECT, '--thread-id', THREAD,
                 '--display-name', f'protag_{key}', '--prompt', prompt + ' ' + STYLE, '--reference-image', os.path.join(SRC_ART, ref),
                 '--generation-model', 'nano-banana', '--resolution', '2K', '--quality', 'ultimate', '--export-version', '4.2',
                 '--output-dir', os.path.join(d, 'o')], stdout=log, stderr=subprocess.STDOUT)
        job = job_of(logpath)
    zips = glob.glob(os.path.join(d, 'o', '*', '*.zip'))
    if not zips and job and status_of(logpath) == 'success':
        run([sys.executable, RUNNER, 'spine-poll', '--job-id', job, '--output-dir', os.path.join(d, 'p'), '--export-version', '4.2'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        zips = glob.glob(os.path.join(d, 'p', '*', '*.zip'))
    if not zips:
        return f'failed (job {job}), see {logpath}'
    pack = os.path.join(d, 'pack')
    os.makedirs(pack, exist_ok=True)
    with zipfile.ZipFile(zips[0]) as z:
        for i in z.infolist():
            ext = os.path.splitext(i.filename)[1]
            # 包内 json / atlas 名可能是乱码:统一改回原基名;贴图名保持(atlas 里按名引用)
            name = base + ext if ext in ('.json', '.atlas') else i.filename
            open(os.path.join(pack, name), 'wb').write(z.read(i))
    out = os.path.join(d, 'out')
    run([sys.executable, os.path.join(QA, 'fx_tex_repack.py'), x2, pack, out, base, '--no-color', '--halo', '0'], check=True)
    run([sys.executable, os.path.join(QA, 'spine_reskin_orient_check.py'), os.path.join(x2, base + '.atlas'), os.path.join(out, base + '.atlas'), '--fix'])
    return 'ok'


def render(key):
    base = TARGETS[key][0]
    d = os.path.join(OUT, key)
    run([sys.executable, os.path.join(QA, 'fxprev', 'render_char.py'), os.path.join(d, 'out'), base, os.path.join(d, 'preview'), '--fps', '12'], check=True)


if __name__ == '__main__':
    keys = [a for a in sys.argv[1:] if not a.startswith('--')] or list(TARGETS)
    for k in keys:
        if '--render-only' not in sys.argv:
            print(k, reskin(k), flush=True)
        render(k)
