# -*- coding: utf-8 -*-
"""预渲染 2.5D:连着拍很多张时用的快速调试连接(一条连接一直开着;dungeon_dev 的 eval / shot 每次都新起进程、重连,一张要 3 秒多)。

  from cdp_fast import Fast
  with Fast() as f:
      f.js("D.tp(0,0,90); return 1")
      f.shot('a.png', wait=0.12)

前提:dungeon_dev.py start 开着(读它的状态文件拿调试地址)。js 的写法和 dungeon_dev eval 一样(函数体,要 return)。
"""
import asyncio
import base64
import json
import os

import websockets

STATE = os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa', 'g3dd_state.json')


class Fast:
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.ws = None
        self.seq = 0

    def __enter__(self):
        st = json.load(open(STATE, encoding='utf-8'))
        self.ws = self.loop.run_until_complete(websockets.connect(st['ws'], max_size=None, ping_interval=None))
        return self

    def __exit__(self, *a):
        self.loop.run_until_complete(self.ws.close())
        self.loop.close()

    async def _call(self, method, params=None):
        self.seq += 1
        sid = self.seq
        await self.ws.send(json.dumps({'id': sid, 'method': method, 'params': params or {}}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get('id') == sid:
                return msg

    def call(self, method, params=None):
        return self.loop.run_until_complete(self._call(method, params))

    def js(self, body):
        expr = "(async () => { const D = window.__g3dd; " + body + " })()"
        r = self.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})
        res = r.get('result', {})
        if 'exceptionDetails' in res:
            raise RuntimeError(str(res['exceptionDetails'])[:400])
        return res.get('result', {}).get('value')

    def shot(self, path, wait=0.12):
        if wait:
            self.loop.run_until_complete(asyncio.sleep(wait))
        r = self.call('Page.captureScreenshot', {'format': 'png'})
        data = r.get('result', {}).get('data')
        if not data:
            raise RuntimeError('shot failed ' + str(r)[:200])
        open(path, 'wb').write(base64.b64decode(data))
