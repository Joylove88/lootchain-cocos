"""在模拟器 / 调试包里远程执行一段 JS(走 inspector 43086),打印返回值。排查用。
用法:python tools/qa/native_eval.py <js 文件>    —— 文件内容是函数体,可用 root(LootChainGameRoot)、cc,return 一个可 JSON 化的值。
"""
import asyncio
import sys

from native_capture_screens import ROOT_JS, evaluate

body = open(sys.argv[1], encoding='utf-8').read()
port = int(sys.argv[2]) if len(sys.argv) > 2 else 43086
print(asyncio.run(evaluate(port, f"(() => {{ {ROOT_JS} try {{ {body} }} catch (e) {{ return 'err ' + e.message; }} }})()")))
