# -*- coding: utf-8 -*-
"""本机局域网提供正式包(手机真机测试用):http://<电脑IP>:7460 → build/web-mobile。
已注册为当前用户登录时自动运行的计划任务「LootChain 正式包服务 7460」(2026-10-06);
手动跑:pythonw tools/local-serve/serve_release.py。改动 build/web-mobile(release:web)后无需重启,直接刷新手机页面。"""
import http.server, os, socketserver

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'build', 'web-mobile'))
PORT = 7460


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 入口文件不缓存,带 md5 的资源长期缓存(与线上 nginx 规则一致)
        if self.path.split('?')[0] in ('/', '/index.html', '/sw.js', '/version.json', '/asset-manifest.json'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    Server(('0.0.0.0', PORT), Handler).serve_forever()
