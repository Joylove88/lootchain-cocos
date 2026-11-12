# -*- coding: utf-8 -*-
"""AI 图转 3D 的第一步:出一张角色三视图设定图(原创设计),给后面的「多视图转 3D」当输入。

用本机 Codex 桌面版(用户的 ChatGPT 订阅)出图。只给文字提示词,不喂任何参考图
(硬规则:任何情况下都不把别家游戏的截图 / 素材喂给生图)。

用法:python concept_gen.py <提示词文件> <输出 png>
例子:python concept_gen.py prompts/sorcerer_turnaround.txt "..\\..\\..\\周报截图\\<日期>_<主题>\\concept\\术士_三视图_v1.png"

出来的图不进 git(和截图一个口径)。下一步用 sheet_split.py 切成单视图。
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    prompt = open(sys.argv[1], encoding='utf-8').read()
    out = sys.argv[2]
    exes = glob.glob(os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin', '*', 'codex.exe'))
    if not exes:
        raise SystemExit('没找到 Codex 桌面版的 codex.exe')
    exe = max(exes, key=os.path.getmtime)
    work = tempfile.mkdtemp(prefix='concept_')
    t0 = time.time()
    r = subprocess.run([exe, 'exec', '--skip-git-repo-check', '-s', 'read-only', '-C', work, '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"', '-'],
                       input=prompt.encode('utf-8'), capture_output=True, timeout=600)
    tail = (r.stdout.decode('utf-8', 'replace') + r.stderr.decode('utf-8', 'replace'))[-600:]
    root = os.path.join(os.path.expanduser('~'), '.codex', 'generated_images')
    new = [p for p in glob.glob(os.path.join(root, '**', '*.png'), recursive=True) if os.path.getmtime(p) >= t0 - 2]
    if not new:
        print('没出图。输出尾部:', tail)
        raise SystemExit(1)
    src = max(new, key=os.path.getmtime)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    shutil.copyfile(src, out)
    print('ok', out, os.path.getsize(out) // 1024, 'KB', f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
