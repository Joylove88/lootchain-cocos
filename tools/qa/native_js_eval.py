"""在安卓原生调试包里执行 JS(V8 inspector,端口 43086)。

用法:
  adb -s <设备> forward tcp:43086 tcp:43086
  python tools/qa/native_js_eval.py "表达式"         # 打印结果(JSON 序列化)
  python tools/qa/native_js_eval.py --file x.js      # 执行文件内容

只对 debug 包有效(Cocos 原生调试包默认开 inspector);表达式按 REPL 语义求值,支持 await。
"""
import argparse
import asyncio
import json

import websockets

WS = 'ws://127.0.0.1:43086/00010002-0003-4004-8005-000600070008'


async def run(expr: str, timeout: float) -> None:
    async with websockets.connect(WS, max_size=None, open_timeout=10) as ws:
        msg_id = 0

        async def call(method: str, params: dict | None = None) -> dict:
            nonlocal msg_id
            msg_id += 1
            my_id = msg_id
            await ws.send(json.dumps({'id': my_id, 'method': method, 'params': params or {}}))
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                data = json.loads(raw)
                if data.get('id') == my_id:
                    return data

        await call('Runtime.enable')
        res = await call('Runtime.evaluate', {
            'expression': f'(async () => {{ const __r = await (async () => ({expr}))(); return JSON.stringify(__r); }})()',
            'awaitPromise': True,
            'returnByValue': True,
        })
        result = res.get('result', {})
        if 'exceptionDetails' in result:
            print('EXCEPTION', json.dumps(result['exceptionDetails'], ensure_ascii=False)[:2000])
        else:
            print(result.get('result', {}).get('value'))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('expr', nargs='?')
    parser.add_argument('--file')
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args()
    expr = open(args.file, encoding='utf-8').read() if args.file else args.expr
    asyncio.run(run(expr, args.timeout))


if __name__ == '__main__':
    main()
