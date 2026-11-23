# -*- coding: utf-8 -*-
"""把 playtest_autopilot.js 拼成 playtest_cdp.py 的步骤文件(2026-11-23 策划通玩第二轮)。

  python tools/qa/playtest_autopilot.py <输出步骤.json> [--slices 6] [--sec 240] [--pre 先跑的步骤.json] [--label 段名前缀]
每段 = 自动跟主线 sec 秒 + 截图;返回 {"log": 本段事件, "stop": 停下原因, "snap": 当前快照}。
停下原因不是 slice(到时)时,后面的段会直接跳过(省得在不认识的界面上空转),交给手动步骤处理后再接着跑。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:]]
out = args[0]


def opt(name, default):
    if name in args:
        return args[args.index(name) + 1]
    return default


slices = int(opt('--slices', '6'))
sec = int(opt('--sec', '240'))
pre = opt('--pre', None)
label = opt('--label', '主线')
lib = open(os.path.join(HERE, 'playtest_autopilot.js'), encoding='utf-8').read()
# 绕路用仓库里当前的寻路器(现场转成 JS 注入页面,和 reach_sweep.py 同一做法)
import subprocess
_TS = r'D:/Program Files/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
_SRC = os.path.join(HERE, '..', '..', 'assets', 'scripts', 'scenes', 'lobby', 'LobbyTownPathfinder.ts')
try:
    _pf = subprocess.run(['node', '-e', "const ts=require(process.argv[1]);const fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[2],'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText)", _TS, _SRC], capture_output=True, text=True, encoding='utf-8', check=True).stdout
    lib = 'const __m = { exports: {} }; (function (module, exports) { ' + _pf + ' })(__m, __m.exports); const PF2 = __m.exports.TownPathfinder;\n' + lib
except Exception as e:
    print('寻路器注入失败,绕路退回页面自带寻路:', e)
steps = json.load(open(pre, encoding='utf-8')) if pre else []
steps.append({'label': f'{label}_开跑', 'js': "window.__apHalt = null; return 'reset';", 'wait': 0, 'shot': False})
for i in range(slices):
    js = lib + (
        "\nif (window.__apHalt) return JSON.stringify({ skipped: window.__apHalt });"
        f"\nconst stop = await apRun({sec});"
        "\nif (stop !== 'slice') window.__apHalt = stop;"
        "\nreturn JSON.stringify({ log: slice, stop, snap: apSnapshot() });")
    steps.append({'label': f'{label}{i + 1:02d}', 'js': js, 'wait': 0, 'timeout': sec + 240})
json.dump(steps, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('steps', len(steps), '->', out)
