# -*- coding: utf-8 -*-
"""主角野外骨骼换皮后的单块重画(2026-11-03,接 protag_spine_reskin.py):
- 女(Atlas 底):大腿 / 胯部部件原骨骼是短裙 + 过膝袜 → 重画成长裤;剑身太宽像船桨 → 细直木剑
- 男(Ron 底):大招里斗篷几块有白斑 → 重画干净斗篷;刘海遮眼 → 整齐短发露出眼睛
流程:<key>/out 打包 → spine-inspect → 只选要改的部件 → spine-edit-run(参考立绘)→ fx_tex_repack 搬回 → 方向检查 → 渲染到 <key>/preview_fix。
已成功的任务按 job_id 取回,不重交。产物:C:/mw/protag/<key>/out_fix。
用法:python tools/qa/protag_spine_fix.py [m|f ...] [--render-only]
"""
import glob, json, os, re, subprocess, sys, zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC_ART = os.path.join(REPO, '周报截图', '2026-11-02_主角', 'assets_src')
RUNNER = r'C:\Users\axian\.claude\skills\game-assets\meowart_api.py'
PROJECT, THREAD = 'proj_00cff6210fb14ad9b034383493c916a8', 'thread_2f9fd116cc164e9196538f51eb1d0ace'
OUT = 'C:/mw/protag'
QA = os.path.join(REPO, 'tools', 'qa')
KEEP = ('Keep each selected part exactly the same size, position, orientation and silhouette. Smooth refined semi-realistic painting matching '
        'the rest of the character, clean edges, no grain, not anime, not chibi.')
FIXES = {
    'f': ('Lucrecia', 'protag_f_v5.png',
          ['L_upleg01', 'L_upleg02', 'L_upleg03', 'R_upleg01', 'R_upleg02', 'pelvis01', 'pelvis02', 'sword01'],
          'Leg and hip parts (upleg / pelvis): plain loose brown cloth trousers fully covering the thighs and hips, no bare skin, no stockings, '
          'no straps, a few soft fabric folds. The sword part: a slim straight WOODEN practice rapier, narrow straight blade of pale worn wood '
          'with an even width from guard to point, simple wooden cross-guard; not wide, not leaf-shaped. ' + KEEP),
    'm': ('Eulenspigel', 'protag_m_v5.png',
          ['cloak01', 'cloak02', 'cape01', 'hair01'],
          'Cloak / cape parts: a long worn hooded traveller\u2019s cloak of rough brown wool, evenly painted with soft folds and a torn hem, '
          'NO white spots, NO bright patches, NO holes showing white. Hair part: neat short dark brown hair with a short side-swept fringe that '
          'stays above the eyebrows and does not cover the eyes. ' + KEEP),
    # 永夜龙骑底(11-03):全盔部件画成露脸的头 + 头发;头盔红眼光(eyes01)直接清透明,不走 AI
    'm2': ('IshmaelA', 'protag_m_v5.png',
           ['face01', 'face02'],
           'Head parts: the bare head of the young man in the reference image, NO helmet and NO hood: a realistic face with brown eyes and a '
           'calm expression, short neat dark brown hair filling the outline. ' + KEEP),
    'f2': ('IshmaelA', 'protag_f_v6.png',
           ['face01', 'face02'],  # 带 armor03 一起提交 Meowa 连续两次 generation_failed,护甲块另行处理
           'Head parts: the bare head of the young woman in the reference image, NO helmet: a realistic face with brown eyes, short brown '
           'chin-length bob hair filling the outline. ' + KEEP),
    # 11-04 炼魂境外观(m3):躯干 body01 / body02 和披风 cloak02 被画成带兜帽的人脸(技能时两个头)→ 按炼魂参考图重画成皮甲胸甲 / 深色披风;
    # 头部 face01 / face02 不重画,从觉醒版 m2 原样搬(换装后脸 / 发型不变)
    'm3': ('IshmaelA', 'skinref_m3.png',
           ['body01', 'body02', 'cloak02'],
           'Torso parts (body01 / body02): the upper body of a light traveller armour, dark leather chest piece with crossed straps and a small '
           'round bronze cape clasp, the collar of a short dark charcoal cape around the neck opening, NO face, NO head, NO hood with a face in it. '
           'Cloak part (cloak02): a short dark charcoal wool cape with soft folds and a torn hem only, NO face, NO head. ' + KEEP),
}
# 换皮后直接清成透明的部件(头盔红眼光等不该出现在主角身上的发光件)
BLANK = {'m2': ['eyes01'], 'f2': ['eyes01'], 'm3': ['eyes01']}
# 女版后处理(同一副底骨骼、同一张放大图集 → 区域坐标与男版完全一致):
# Meowa 把女版躯干 body01 / body02 画成了带兜帽的人脸(播技能时出现两个头),两块护甲 R_armor03 / armor03 没换皮还是原黑甲
# → 直接从男版搬这四块(皮背心 / 布兜帽 / 皮护甲);女版 face01 回来是空的 → 用她自己的 face02(同为侧前方的头)缩放填进去
COPY_FROM_MALE = {'f2': ('m2', ['body01', 'body02', 'R_armor03', 'armor03']), 'm3': ('m2', ['face01', 'face02'])}
FILL_FROM = {'f2': [('face01', 'face02')]}


def atlas_regions(atlas_path):
    regs, cur = {}, None
    for line in open(atlas_path, encoding='utf-8').read().splitlines()[5:]:
        if line and not line.startswith(' ') and ':' not in line:
            cur = line.strip()
            regs[cur] = {}
        elif cur and ':' in line and line.startswith(' '):
            k, v = line.strip().split(':', 1)
            regs[cur][k.strip()] = v.strip()
    boxes = {}
    for n, r in regs.items():
        if 'xy' in r:
            x, y = (int(v) for v in r['xy'].split(','))
            w, h = (int(v) for v in r['size'].split(','))
            if r.get('rotate') == 'true':
                w, h = h, w
            boxes[n] = (x, y, w, h)
    return regs, boxes


def post_fix(key, out, base):
    import numpy as np
    from PIL import Image
    png = os.path.join(out, base + '.png')
    regs, boxes = atlas_regions(os.path.join(out, base + '.atlas'))
    page = np.array(Image.open(png).convert('RGBA'))
    if key in COPY_FROM_MALE:
        mk, names = COPY_FROM_MALE[key]
        # 来源版本统一过衣服(protag_spine_unify.py → out_unify)就从它搬,和游戏里装的一致
        msrc = os.path.join(OUT, mk, 'out_unify') if os.path.isdir(os.path.join(OUT, mk, 'out_unify')) else os.path.join(OUT, mk, 'out_fix')
        mregs, _ = atlas_regions(os.path.join(msrc, base + '.atlas'))
        mpage = np.array(Image.open(os.path.join(msrc, base + '.png')).convert('RGBA'))
        for n in names:
            assert mregs[n] == regs[n], n
            x, y, w, h = boxes[n]
            page[y:y + h, x:x + w] = mpage[y:y + h, x:x + w]
            print('  copied from', mk, n)
    img = Image.fromarray(page)
    for dst, src in FILL_FROM.get(key, []):
        x, y, w, h = boxes[dst]
        sx, sy, sw, sh = boxes[src]
        piece = img.crop((sx, sy, sx + sw, sy + sh)).resize((w, h), Image.LANCZOS)
        arr = np.array(img)
        arr[y:y + h, x:x + w] = 0
        img = Image.fromarray(arr)
        img.alpha_composite(piece, (x, y))
        print('  filled', dst, 'from', src)
    img.save(png)


def blank_regions(atlas_path, names):
    import numpy as np
    from PIL import Image
    page, regs, cur = None, {}, None
    for line in open(atlas_path, encoding='utf-8').read().splitlines():
        if line.strip().endswith('.png') and ':' not in line:
            page = line.strip()
        elif line and not line.startswith(' ') and ':' not in line:
            cur = line.strip()
            regs[cur] = {}
        elif cur and ':' in line:
            k, v = line.strip().split(':', 1)
            regs[cur][k.strip()] = v.strip()
    png = os.path.join(os.path.dirname(atlas_path), page)
    im = np.array(Image.open(png).convert('RGBA'))
    for n in names:
        r = regs.get(n)
        if not r:
            print('  blank: region not found', n)
            continue
        if 'bounds' in r:
            x, y, w, h = (int(v) for v in r['bounds'].split(','))
        else:
            x, y = (int(v) for v in r['xy'].split(','))
            w, h = (int(v) for v in r['size'].split(','))
        if r.get('rotate', 'false') in ('true', '90', '270'):
            w, h = h, w
        im[y:y + h, x:x + w, 3] = 0
        print('  blanked', n, (x, y, w, h))
    Image.fromarray(im).save(png)


def job_of(logpath):
    if not os.path.exists(logpath):
        return None
    m = re.search(r'job_id=(job_[0-9a-f]+)', open(logpath, encoding='utf-8', errors='replace').read())
    return m.group(1) if m else None


def status_of(logpath):
    found = re.findall(r'status=([a-z]+)', open(logpath, encoding='utf-8', errors='replace').read()) if os.path.exists(logpath) else []
    return found[-1] if found else None


def run(cmd, **kw):
    print('  $', os.path.basename(cmd[1]) if len(cmd) > 1 else cmd[0], ' '.join(cmd[2:5])[:160], flush=True)
    return subprocess.run(cmd, cwd=REPO, **kw)


def fix(key):
    base, ref, parts, prompt = FIXES[key]
    d = os.path.join(OUT, key)
    src = os.path.join(d, 'out')
    pkg = os.path.join(d, 'out.zip')
    with zipfile.ZipFile(pkg, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in os.listdir(src):
            if os.path.splitext(f)[1] in ('.json', '.atlas', '.png'):
                z.write(os.path.join(src, f), f)
    insp_path = os.path.join(d, 'inspect.json')
    if not os.path.exists(insp_path) or os.path.getsize(insp_path) < 10:
        with open(insp_path, 'w', encoding='utf-8') as fo:
            run([sys.executable, RUNNER, 'spine-inspect', '--source-spine-package', pkg, '--project-id', PROJECT], stdout=fo, check=True)
    insp = json.load(open(insp_path, encoding='utf-8'))
    chosen = [p for p in insp['selected_parts'] if p['name'] in parts]
    missing = sorted(set(parts) - {p['name'] for p in chosen})
    if missing:
        print('  WARNING parts not found:', missing)
    sel = dict(insp, selected_parts=chosen)
    sel_path = os.path.join(d, 'fix_selection.json')
    json.dump(sel, open(sel_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    logpath = os.path.join(d, 'fix.log')
    job = job_of(logpath)
    if not (job and status_of(logpath) == 'success'):
        with open(logpath, 'w', encoding='utf-8') as log:
            run([sys.executable, RUNNER, 'spine-edit-run', '--source-spine-package', pkg, '--selected-parts-json', sel_path,
                 '--prompt', prompt, '--project-id', PROJECT, '--thread-id', THREAD, '--display-name', f'protag_fix_{key}',
                 # 相同请求会被去重成同一个任务(失败的也一样)→ 每次重交带新的操作号
                 '--client-operation-id', f'protag_fix_{key}_{int(__import__("time").time())}',
                 '--reference-image', os.path.join(SRC_ART, ref), '--generation-model', os.environ.get('FIX_MODEL', 'nano-banana'), '--resolution', '2K',
                 '--quality', 'ultimate', '--export-version', '4.2', '--output-dir', os.path.join(d, 'fo')], stdout=log, stderr=subprocess.STDOUT)
        job = job_of(logpath)
    zips = glob.glob(os.path.join(d, 'fo', '*', '*.zip'))
    if not zips and job and status_of(logpath) == 'success':
        # 输出目录名取自提示词,超 Windows 路径上限会下载失败;任务已成功,用短目录按 job_id 取回(不重复扣费)
        run([sys.executable, RUNNER, 'spine-poll', '--job-id', job, '--output-dir', os.path.join(d, 'fp'), '--export-version', '4.2'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        zips = glob.glob(os.path.join(d, 'fp', '*', '*.zip'))
    if not zips:
        return f'failed (job {job}), see {logpath}'
    pack = os.path.join(d, 'fix_pack')
    os.makedirs(pack, exist_ok=True)
    with zipfile.ZipFile(zips[0]) as z:
        for i in z.infolist():
            ext = os.path.splitext(i.filename)[1]
            name = base + ext if ext in ('.json', '.atlas') else i.filename
            open(os.path.join(pack, name), 'wb').write(z.read(i))
    out = os.path.join(d, 'out_fix')
    run([sys.executable, os.path.join(QA, 'fx_tex_repack.py'), src, pack, out, base, '--no-color', '--halo', '0'], check=True)
    run([sys.executable, os.path.join(QA, 'spine_reskin_orient_check.py'), os.path.join(d, 'src_x2', base + '.atlas'), os.path.join(out, base + '.atlas'), '--fix'])
    if BLANK.get(key):
        blank_regions(os.path.join(out, base + '.atlas'), BLANK[key])
    if key in COPY_FROM_MALE or key in FILL_FROM:
        post_fix(key, out, base)
    return 'ok'


def render(key):
    base = FIXES[key][0]
    d = os.path.join(OUT, key)
    run([sys.executable, os.path.join(QA, 'fxprev', 'render_char.py'), os.path.join(d, 'out_fix'), base, os.path.join(d, 'preview_fix'), '--fps', '12'], check=True)


if __name__ == '__main__':
    keys = [a for a in sys.argv[1:] if not a.startswith('--')] or list(FIXES)
    for k in keys:
        if '--render-only' not in sys.argv:
            print(k, fix(k), flush=True)
        render(k)
