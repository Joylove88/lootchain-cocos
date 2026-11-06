# -*- coding: utf-8 -*-
"""无头 Edge 收尾兜底(2026-11-06:两次「电脑好卡」+ 出包卡死的真凶)。

msedge.exe 启动进程会把浏览器交给另一个进程,脚本 finally 里只杀 proc.pid 时真浏览器(带 swiftshader GPU 进程)会活下来,
后台满负荷跑几十分钟。本模块:
- install():接管 subprocess.Popen,记下每次启动 msedge 用的 --user-data-dir;进程退出(正常 / 异常 / Ctrl+C / 被 terminate)时
  按 profile 目录**精确匹配**找出残留 msedge 整树杀掉 —— 只碰本脚本自己起的测试浏览器,不碰用户自己的 Edge。
  boss_bar_cdp.py 一 import 就装上(89 个自验脚本都经它);其余脚本自己 `import edge_guard; edge_guard.install()`。
- 命令行 `python tools/qa/edge_guard.py [--dry]`:手动清理所有测试残留(带 --headless 且 profile 在 %TEMP%\\lootchain-qa 或 tools/qa/fxprev 下)。
脚本被 taskkill /F 硬杀时 atexit 不会跑,事后用命令行清理一次。
"""
import atexit, json, os, re, signal, subprocess, sys

_PROFILES = set()
_INSTALLED = False
_ORIG_POPEN = subprocess.Popen
_DIR_RE = re.compile(r'--user-data-dir=(?:"([^"]+)"|(\S+))')


def _norm(path):
    return os.path.normcase(os.path.abspath(path)).rstrip('\\/')


def _edge_processes():
    """[(pid, commandLine)] 全部 msedge.exe;查询失败返回 []。"""
    ps = ("Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
          "Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress")
    try:
        out = _ORIG_POPEN(['powershell', '-NoProfile', '-Command', ps], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).communicate(timeout=60)[0]
        data = json.loads(out.decode('utf-8', 'ignore') or '[]')
    except Exception:
        return []
    if isinstance(data, dict):
        data = [data]
    return [(int(d.get('ProcessId') or 0), d.get('CommandLine') or '') for d in data if d.get('ProcessId')]


def _profile_of(cmd):
    m = _DIR_RE.search(cmd)
    return _norm(m.group(1) or m.group(2)) if m else None


def kill_profiles(profiles, dry=False):
    """杀掉 user-data-dir 精确等于 profiles 之一的 msedge(主进程整树 + 落单子进程);返回杀掉的 pid。"""
    want = {_norm(p) for p in profiles}
    if not want:
        return []
    hits = [(pid, cmd) for pid, cmd in _edge_processes() if _profile_of(cmd) in want]
    # 主进程(无 --type=)先整树杀,再补杀落单的子进程
    hits.sort(key=lambda h: '--type=' in h[1])
    killed = []
    for pid, cmd in hits:
        if dry:
            killed.append(pid)
            continue
        r = _ORIG_POPEN(['taskkill', '/PID', str(pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        r.wait()
        killed.append(pid)
    return killed


def _cleanup():
    if _PROFILES:
        kill_profiles(_PROFILES)


def _record(args):
    try:
        argv = list(args) if isinstance(args, (list, tuple)) else [args]
        if not argv or 'msedge' not in os.path.basename(str(argv[0])).lower():
            return
        for a in argv:
            a = str(a)
            if a.startswith('--user-data-dir='):
                _PROFILES.add(a.split('=', 1)[1].strip('"'))
    except Exception:
        pass


class _GuardedPopen(_ORIG_POPEN):
    def __init__(self, args, *a, **kw):
        _record(args)
        super().__init__(args, *a, **kw)


def install():
    """幂等:接管 Popen + 退出 / 信号时清理本进程起过的测试浏览器。"""
    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True
    subprocess.Popen = _GuardedPopen
    atexit.register(_cleanup)

    def _on_signal(signum, frame):
        _cleanup()
        raise SystemExit(128 + signum)

    for name in ('SIGINT', 'SIGTERM', 'SIGBREAK'):
        sig = getattr(signal, name, None)
        if sig is not None:
            try:
                signal.signal(sig, _on_signal)
            except (ValueError, OSError):
                pass


def _qa_roots():
    here = os.path.dirname(os.path.abspath(__file__))
    temp = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP') or os.environ.get('TMP') or '/tmp', 'lootchain-qa')
    return [_norm(temp), _norm(os.path.join(here, 'fxprev'))]


def main():
    dry = '--dry' in sys.argv
    roots = _qa_roots()
    profiles = set()
    for pid, cmd in _edge_processes():
        prof = _profile_of(cmd)
        if prof and '--headless' in cmd and any(prof.startswith(r + os.sep) for r in roots):
            profiles.add(prof)
    killed = kill_profiles(profiles, dry=dry)
    print(('[dry] ' if dry else '') + f'test edge profiles: {len(profiles)}; processes: {len(killed)}')
    for p in sorted(profiles):
        print('  ', p)


if __name__ == '__main__':
    main()
