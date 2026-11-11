# -*- coding: utf-8 -*-
"""守卫战 3D 光影小样的本地静态服务(原型用,不是游戏的一部分)。

小样页面要读游戏里现成的角色静态图(assets/resources/ui/ 下的 png),浏览器不允许 file:// 页面把本地图片当贴图用,
所以得经 http 打开。本脚本只放行两个目录,别的路径一律 404:
  /tools/proto3d/          小样本身
  /assets/resources/ui/    角色静态图(只读)

用法:
  python tools/proto3d/guard_battle/serve.py            # 只本机:http://localhost:8790/tools/proto3d/guard_battle/
  python tools/proto3d/guard_battle/serve.py --lan      # 局域网可访问(手机真机看效果用):http://<电脑IP>:8790/tools/proto3d/guard_battle/
  python tools/proto3d/guard_battle/serve.py --port 8791
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
ALLOW = ('/tools/proto3d/', '/assets/resources/ui/')
EXT = ('.html', '.js', '.png', '.jpg', '.jpeg', '.webp', '.json', '.ico')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _allowed(self):
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        if '..' in path:
            return False
        if not any(path.startswith(prefix) for prefix in ALLOW):
            return False
        return path.endswith('/') or path.lower().endswith(EXT)

    def do_GET(self):
        if not self._allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._allowed():
            self.send_error(404)
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(port=8790, lan=False):
    return Server(('0.0.0.0' if lan else '127.0.0.1', port), Handler)


if __name__ == '__main__':
    port = 8790
    if '--port' in sys.argv:
        port = int(sys.argv[sys.argv.index('--port') + 1])
    lan = '--lan' in sys.argv
    print(f"serving {ROOT} ({'LAN' if lan else 'localhost only'}) → http://localhost:{port}/tools/proto3d/guard_battle/", flush=True)
    make_server(port, lan).serve_forever()
