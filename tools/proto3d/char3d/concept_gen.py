# -*- coding: utf-8 -*-
"""AI 图转 3D 的第一步:出角色的三视图设定图(原创设计),给后面的「多视图转 3D」当输入。

用本机 Codex 桌面版(用户的 ChatGPT 订阅)出图。只给文字提示词,不喂任何参考图
(硬规则:任何情况下都不把别家游戏的截图 / 素材喂给生图)。约 70 秒一张,一次只跑一张。

两种用法:
  1) 单张,提示词文件里是完整提示词:
     python concept_gen.py <提示词文件> <输出 png>
  2) 一批,只写每个角色的设计描述,版式 / 站姿 / 画风由这里的模板统一补上:
     python concept_gen.py --batch <批次文件> <输出目录> [--only=键1,键2] [--suffix=_三视图_v1] [--force]
     批次文件的格式(见 prompts/batch2_opening.txt):
        ### 键 | 中文名 | biped 或 beast
        Character (...): ……
        Costume: ……
     输出 <输出目录>/<中文名><suffix>.png;已经有的跳过(--force 重出)。

出来的图不进 git(和截图一个口径)。下一步用 sheet_split.py 切成单视图。
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

HEAD = 'Generate one image. Do not write files, do not ask questions, just create the image.\n\n'

# 人形:正 / 右侧 / 背三视图,A 字站姿,空手(武器单独做、挂到手骨上)
BIPED = HEAD + '''A character design turnaround sheet for building a 3D game character model: three full-body views of the SAME character standing side by side on a plain, seamless light-grey studio background — FRONT view on the left, SIDE view (profile, facing right) in the middle, BACK view on the right. Orthographic look with no perspective distortion; all three figures exactly the same height with feet on the same baseline; evenly spaced with clear gaps, nothing overlapping, the whole body of each figure inside the frame with margin above the head and below the feet.

{DESC}

Pose: neutral A-pose for 3D modeling — standing straight, arms held away from the body at about 40 degrees, hands open with fingers slightly spread, legs slightly apart, head level, looking straight ahead. Empty hands: NO weapon, nothing held.

Style: realistic, grounded, physically plausible materials, natural muted colors. Soft, even studio lighting from the front; no rim light, no glow, no magic effects, no dramatic shadows, no shadow on the background. No text, no labels, no arrows, no borders, no UI. High detail, sharp focus. Wide 3:2 landscape image.
'''

# 四足 / 多足:正 / 右侧(头朝右)/ 背三视图,对称站姿
BEAST = HEAD + '''A creature design turnaround sheet for building a 3D game monster model: three full-body views of the SAME creature side by side on a plain, seamless light-grey studio background — FRONT view (head-on, facing the viewer) on the left, SIDE view (profile, head pointing to the right) in the middle, BACK view (seen from directly behind) on the right. Orthographic look with no perspective distortion; the same scale in all three views with all feet on the same baseline; evenly spaced with clear gaps, nothing overlapping; each view drawn as large as possible while the whole creature stays inside the frame with a small margin around it.

{DESC}

Style: realistic, grounded, like a reference photograph of a real animal; physically plausible fur, skin, claws, chitin, wood, stone and mineral crust; natural muted colors. Soft, even studio lighting from the front; no rim light, no glow, no magic effects, no dramatic shadows, no shadow on the background. No text, no labels, no arrows, no borders, no UI. High detail, sharp focus. Wide 3:2 landscape image.
'''


def codex_exe():
    exes = glob.glob(os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin', '*', 'codex.exe'))
    if not exes:
        raise SystemExit('没找到 Codex 桌面版的 codex.exe')
    return max(exes, key=os.path.getmtime)


def generate(prompt, out):
    """出一张图存到 out;成功返回 True。"""
    work = tempfile.mkdtemp(prefix='concept_')
    t0 = time.time()
    r = subprocess.run([codex_exe(), 'exec', '--skip-git-repo-check', '-s', 'read-only', '-C', work, '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"', '-'],
                       input=prompt.encode('utf-8'), capture_output=True, timeout=600)
    tail = (r.stdout.decode('utf-8', 'replace') + r.stderr.decode('utf-8', 'replace'))[-400:]
    root = os.path.join(os.path.expanduser('~'), '.codex', 'generated_images')
    new = [p for p in glob.glob(os.path.join(root, '**', '*.png'), recursive=True) if os.path.getmtime(p) >= t0 - 2]
    if not new:
        print('没出图:', os.path.basename(out), '| 输出尾部:', tail.replace('\n', ' ')[-240:], flush=True)
        return False
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    shutil.copyfile(max(new, key=os.path.getmtime), out)
    print('ok', out, os.path.getsize(out) // 1024, 'KB', f'{time.time() - t0:.0f}s', flush=True)
    return True


def parse_batch(path):
    """批次文件 → [(键, 中文名, biped|beast, 描述)]。"""
    items = []
    cur = None
    for line in open(path, encoding='utf-8').read().splitlines():
        if line.startswith('###'):
            key, cn, kind = [x.strip() for x in line[3:].split('|')]
            cur = [key, cn, kind, []]
            items.append(cur)
        elif cur is not None and not line.startswith('#'):
            cur[3].append(line)
    return [(k, cn, kind, '\n'.join(d).strip()) for k, cn, kind, d in items]


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    args = [a for a in sys.argv[1:] if not a.startswith('--') or a == '--batch']
    opts = {a.split('=', 1)[0][2:]: (a.split('=', 1)[1] if '=' in a else '1') for a in sys.argv[1:] if a.startswith('--') and a != '--batch'}
    if args and args[0] == '--batch':
        if len(args) < 3:
            raise SystemExit(__doc__)
        only = [k for k in opts.get('only', '').split(',') if k]
        suffix = opts.get('suffix', '_三视图_v1')
        done = failed = 0
        for key, cn, kind, desc in parse_batch(args[1]):
            if only and key not in only:
                continue
            out = os.path.join(args[2], f'{cn}{suffix}.png')
            if os.path.exists(out) and 'force' not in opts:
                print('已有,跳过', out, flush=True)
                continue
            ok = generate((BEAST if kind == 'beast' else BIPED).replace('{DESC}', desc), out)
            done += 1 if ok else 0
            failed += 0 if ok else 1
        print(f'出了 {done} 张,失败 {failed} 张', flush=True)
        return
    if len(args) < 2:
        raise SystemExit(__doc__)
    if not generate(open(args[0], encoding='utf-8').read(), args[1]):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
