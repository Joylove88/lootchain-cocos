"""用 ChatGPT 订阅(Codex 桌面版命令行)出界面原型图。

用法:python tools/qa/gen_proto.py --prompt <提示词.txt> --out <输出.png> [--ref 参考图 ...]
- 提示词走 stdin(-i 后面的参数会被当图片吞掉);同一时间只跑一个(按 mtime 取 ~/.codex/generated_images 最新一张)。
- 取桌面版自带 codex.exe 里 mtime 最新的那个(npm 版拉不到模型),不带 -m。
"""
import argparse
import glob
import os
import shutil
import subprocess
import tempfile
import time


def codex_exe() -> str:
    base = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
    found = glob.glob(os.path.join(base, '*', 'codex.exe')) + glob.glob(os.path.join(base, 'codex.exe'))
    if not found:
        raise SystemExit('找不到 Codex 桌面版 codex.exe')
    return max(found, key=os.path.getmtime)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--prompt', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ref', nargs='*', default=[])
    ap.add_argument('--timeout', type=int, default=600)
    args = ap.parse_args()
    prompt = open(args.prompt, encoding='utf-8').read()
    work = tempfile.mkdtemp(prefix='lc-proto-')
    cmd = [codex_exe(), 'exec', '--skip-git-repo-check', '-s', 'read-only', '-C', work]
    for ref in args.ref:
        cmd += ['-i', os.path.abspath(ref)]
    cmd.append('-')
    started = time.time()
    proc = subprocess.run(cmd, input=prompt.encode('utf-8'), capture_output=True, timeout=args.timeout)
    tail = proc.stdout.decode('utf-8', 'replace')[-600:]
    images = [p for p in glob.glob(os.path.expanduser('~/.codex/generated_images/**/*.png'), recursive=True) if os.path.getmtime(p) >= started]
    if not images:
        raise SystemExit(f'没有生成图片(exit={proc.returncode}):\n{tail}\n{proc.stderr.decode("utf-8", "replace")[-600:]}')
    latest = max(images, key=os.path.getmtime)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    shutil.copyfile(latest, args.out)
    print('saved', args.out, 'from', latest, f'{time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
