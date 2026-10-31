# -*- coding: utf-8 -*-
"""骨骼特效超清写实换皮(2026-10-31 用户「特效也换贴图,现在特效太难看」「特效用超清贴图」):
特效包图集先 ×N(spine_atlas_scale)→ Meowa spine-reskin-run 重画贴图(动画 / 形状 / 色相不变)→ 解包 → 渲染对比横条。
特效动画多是加色发光,提示词要求保住每块贴图的轮廓、透明度和色相,只提升质感与细节。
产物:C:/mw/fx/<effect>/(src_xN、pack = Meowa 原样产物、final = 回填原骨骼后的可用包);原素材只读不动。
用法:python tools/qa/meowa_fx_reskin.py <effect:倍数:描述>... 例:fx_150079_laierde_hit:2:"purple arcane impact"
"""
import glob, os, re, subprocess, sys, zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EFFECT = os.path.join(REPO, 'assets', 'resources', 'spine', 'effect')
RUNNER = r'C:\Users\axian\.claude\skills\game-assets\meowart_api.py'
PROJECT, THREAD = 'proj_0b56db9e42b748ae926b852342cd4d8d', 'thread_d3fc5c1f0f0d425a95a35191358a5663'
OUT = 'C:/mw/fx'
VFX = ('Ultra-HD realistic game VFX texture repaint of this exact effect: keep every sprite piece\'s outline, transparency falloff, '
       'brightness distribution and color hue exactly the same so the animation still reads the same; upgrade only the material quality — '
       'fine realistic energy filaments, plasma wisps, sparks and crisp glow gradients, no flat cartoon shapes, no outlines, no hard edges, '
       'clean pure transparent background around each piece.')


def job_of(log):
    m = re.search(r'job_id=(job_[0-9a-f]+)', open(log, encoding='utf-8', errors='replace').read()) if os.path.exists(log) else None
    return m.group(1) if m else None


def status_of(log):
    found = re.findall(r'status=([a-z]+)', open(log, encoding='utf-8', errors='replace').read()) if os.path.exists(log) else []
    return found[-1] if found else None


def run(effect, factor, desc):
    d = os.path.join(OUT, effect)
    os.makedirs(d, exist_ok=True)
    src = os.path.join(d, f'src_x{factor}')
    subprocess.run([sys.executable, os.path.join(REPO, 'tools', 'qa', 'spine_atlas_scale.py'), os.path.join(EFFECT, effect), effect, src, '--factor', str(factor)],
                   check=True, stdout=subprocess.DEVNULL)
    pkg = os.path.join(d, 'src.zip')
    with zipfile.ZipFile(pkg, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in os.listdir(src):
            z.write(os.path.join(src, f), f)
    log = os.path.join(d, 'run.log')
    if status_of(log) != 'success':
        with open(log, 'w', encoding='utf-8') as fh:
            subprocess.run([sys.executable, RUNNER, 'spine-reskin-run', '--source-spine-package', pkg, '--project-id', PROJECT, '--thread-id', THREAD,
                            '--display-name', effect, '--prompt', f'{desc}. {VFX}', '--generation-model', 'nano-banana', '--resolution', '2K',
                            '--quality', 'ultimate', '--export-version', '4.2', '--output-dir', os.path.join(d, 'o')], stdout=fh, stderr=subprocess.STDOUT, cwd=REPO)
    zips = glob.glob(os.path.join(d, 'o', '*', '*.zip'))
    job = job_of(log)
    if not zips and job and status_of(log) == 'success':
        # 输出目录名取自提示词,长了超 Windows 路径上限:按 job_id 短目录取回(不重复扣费)
        subprocess.run([sys.executable, RUNNER, 'spine-poll', '--job-id', job, '--output-dir', os.path.join(d, 'p'), '--export-version', '4.2'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=REPO)
        zips = glob.glob(os.path.join(d, 'p', '*', '*.zip'))
    if not zips:
        return f'failed (job {job})'
    pack = os.path.join(d, 'pack')
    os.makedirs(pack, exist_ok=True)
    with zipfile.ZipFile(zips[0]) as z:
        for i in z.infolist():
            ext = os.path.splitext(i.filename)[1]
            out = effect + ext if ext in ('.json', '.skel', '.atlas') else i.filename
            open(os.path.join(pack, out), 'wb').write(z.read(i))
    # 只取贴图回填进我们自己放大的图集 + 原骨骼(Meowa 会按图集尺寸重建附件大小,骨骼不能直接用)+ 逐块颜色对齐
    final = os.path.join(d, 'final')
    subprocess.run([sys.executable, os.path.join(REPO, 'tools', 'qa', 'fx_tex_repack.py'), src, pack, final, effect], check=True)
    return 'ok -> ' + final


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        effect, factor, desc = arg.split(':', 2)
        print(effect, run(effect, int(factor), desc), flush=True)
