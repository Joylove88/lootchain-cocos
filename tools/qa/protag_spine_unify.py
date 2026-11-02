# -*- coding: utf-8 -*-
"""主角野外骨骼「衣服统一」(2026-11-03 用户:跑步和战斗时衣服不一样):
永夜龙骑骨骼在跑步 / 技能里会把部件换成另一块(头 face01→face02、躯干 body01→body02、护甲 armor04→R_armor03 等),
换皮时这些替换件各画各的 → 跑起来像换了套衣服。以待机那套为准(露脸短发、棕皮背心),把替换件按待机全身参考图重画。
输入 C:/mw/protag/<m2|f2>/out_fix(protag_spine_fix 产物),输出 out_unify;分两次提交(头 + 躯干 / 护甲),多块一起交 Meowa 容易 generation_failed。
用法:python tools/qa/protag_spine_unify.py [m2|f2 ...]
"""
import glob, json, os, subprocess, sys, time, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from protag_spine_fix import OUT, PROJECT, QA, RUNNER, THREAD, job_of, run, status_of  # noqa: E402

BASE = 'IshmaelA'
KEEP = ('Keep each selected part exactly the same size, position, orientation and silhouette. Match the reference character exactly in colours, '
        'materials and design. Smooth refined semi-realistic painting, clean edges, no grain, not anime, not chibi.')
GROUPS = [
    ('head_body', ['face02', 'body02'],
     'These are alternate head and torso parts used while running. Paint them as the SAME outfit as the reference: the head is the bare head '
     '(NO hood, NO helmet) with the same face and short brown hair; the torso is the same brown leather vest over a light linen shirt, with the '
     'pale fur trim on the shoulder. '),
    ('armor', ['R_armor03', 'armor01', 'armor02', 'armor03'],
     'These are alternate shoulder / arm guard parts. Paint them as the SAME brown leather guards with pale fur trim as the reference, no metal. '),
]


def unify(key):
    d = os.path.join(OUT, key)
    src = os.path.join(d, 'out_fix')
    ref = os.path.join(OUT, f'{key}_idle_ref.png')
    for gname, parts, prompt in GROUPS:
        pkg = os.path.join(d, f'unify_{gname}_src.zip')
        with zipfile.ZipFile(pkg, 'w', zipfile.ZIP_DEFLATED) as z:
            for f in os.listdir(src):
                if os.path.splitext(f)[1] in ('.json', '.atlas', '.png'):
                    z.write(os.path.join(src, f), f)
        insp_path = os.path.join(d, f'unify_{gname}_inspect.json')
        with open(insp_path, 'w', encoding='utf-8') as fo:
            run([sys.executable, RUNNER, 'spine-inspect', '--source-spine-package', pkg, '--project-id', PROJECT], stdout=fo, check=True)
        insp = json.load(open(insp_path, encoding='utf-8'))
        chosen = [p for p in insp['selected_parts'] if p['name'] in parts]
        sel_path = os.path.join(d, f'unify_{gname}_sel.json')
        json.dump(dict(insp, selected_parts=chosen), open(sel_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        logpath = os.path.join(d, f'unify_{gname}.log')
        for attempt, model in enumerate(['nano-banana', 'image-2']):
            if job_of(logpath) and status_of(logpath) == 'success':
                break
            with open(logpath, 'w', encoding='utf-8') as log:
                run([sys.executable, RUNNER, 'spine-edit-run', '--source-spine-package', pkg, '--selected-parts-json', sel_path,
                     '--prompt', prompt + KEEP, '--project-id', PROJECT, '--thread-id', THREAD, '--display-name', f'protag_unify_{key}_{gname}',
                     '--client-operation-id', f'protag_unify_{key}_{gname}_{int(time.time())}', '--reference-image', ref,
                     '--generation-model', model, '--resolution', '2K', '--quality', 'ultimate', '--export-version', '4.2',
                     '--output-dir', os.path.join(d, 'uo')], stdout=log, stderr=subprocess.STDOUT)
        job = job_of(logpath)
        if not (job and status_of(logpath) == 'success'):
            return f'{gname} failed (job {job})'
        pdir = os.path.join(d, f'up_{gname}')
        run([sys.executable, RUNNER, 'spine-poll', '--job-id', job, '--output-dir', pdir, '--export-version', '4.2'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        zips = glob.glob(os.path.join(pdir, '*', '*.zip'))
        if not zips:
            return f'{gname} download failed (job {job})'
        pack = os.path.join(d, f'unify_{gname}_pack')
        os.makedirs(pack, exist_ok=True)
        with zipfile.ZipFile(zips[0]) as z:
            for i in z.infolist():
                ext = os.path.splitext(i.filename)[1]
                open(os.path.join(pack, BASE + ext if ext in ('.json', '.atlas') else i.filename), 'wb').write(z.read(i))
        out = os.path.join(d, f'unify_{gname}_out')
        run([sys.executable, os.path.join(QA, 'fx_tex_repack.py'), src, pack, out, BASE, '--no-color', '--halo', '0'], check=True)
        # 只收这一组的部件,其余保持上一步结果(Meowa 回来的整张图集其他块也可能被轻微改动)
        merge_regions(src, out, parts)
        src = out
    final = os.path.join(d, 'out_unify')
    os.makedirs(final, exist_ok=True)
    for f in os.listdir(src):
        import shutil
        shutil.copy(os.path.join(src, f), final)
    return 'ok'


def merge_regions(prev_dir, new_dir, parts):
    """new_dir 的贴图里只保留 parts 这几块的新内容,其余块恢复成 prev_dir 的。"""
    import numpy as np
    from PIL import Image
    from protag_spine_fix import atlas_regions
    _, boxes = atlas_regions(os.path.join(new_dir, BASE + '.atlas'))
    prev = np.array(Image.open(os.path.join(prev_dir, BASE + '.png')).convert('RGBA'))
    new = np.array(Image.open(os.path.join(new_dir, BASE + '.png')).convert('RGBA'))
    out = prev.copy()
    for n in parts:
        x, y, w, h = boxes[n]
        out[y:y + h, x:x + w] = new[y:y + h, x:x + w]
    Image.fromarray(out).save(os.path.join(new_dir, BASE + '.png'))


if __name__ == '__main__':
    keys = [a for a in sys.argv[1:] if not a.startswith('--')] or ['m2', 'f2']
    for k in keys:
        print(k, unify(k), flush=True)
