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
                 '--reference-image', os.path.join(SRC_ART, ref), '--generation-model', 'nano-banana', '--resolution', '2K',
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
