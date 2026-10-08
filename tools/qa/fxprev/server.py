# -*- coding: utf-8 -*-
"""只读静态服务:/ → 本目录(index.html + spine-webgl.js),/fx42/<套名>/<文件> → D:\骨骼动画素材\fx_pack_v2\fx42(只读)。"""
import http.server, os, sys, urllib.parse, socketserver

HERE = os.path.dirname(os.path.abspath(__file__))
FX = os.environ.get('FX_ROOT') or r'D:\骨骼动画素材\fx_pack_v2\fx42'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.unquote(path.split('?', 1)[0].split('#', 1)[0])
        if path.startswith('/fx42/'):
            rel = path[len('/fx42/'):].replace('/', os.sep)
            full = os.path.normpath(os.path.join(FX, rel))
            if not full.startswith(FX):
                return os.path.join(HERE, '__nope__')
            return full
        return os.path.normpath(os.path.join(HERE, path.lstrip('/').replace('/', os.sep)))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, *a):
        pass


class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    TS(('127.0.0.1', PORT), H).serve_forever()
