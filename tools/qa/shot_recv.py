# -*- coding: utf-8 -*-
"""预览页截图接收端:页面里 canvas.toDataURL 后 POST 到 http://127.0.0.1:8765/<名字>,存成 <输出目录>/<名字>.jpg|png。
用法:python tools/qa/shot_recv.py [输出目录,默认 %TEMP%/lootchain-qa/shots]
"""
import base64
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'shots')
os.makedirs(OUT, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('ascii', 'ignore')
        name = os.path.basename(self.path.strip('/')) or 'shot'
        head, _, data = body.partition(',')
        ext = 'png' if 'png' in head else 'jpg'
        with open(os.path.join(OUT, f'{name}.{ext}'), 'wb') as f:
            f.write(base64.b64decode(data))
        self.send_response(200)
        self._cors()
        self.end_headers()

    def log_message(self, *args):
        pass


HTTPServer(('127.0.0.1', 8765), H).serve_forever()
