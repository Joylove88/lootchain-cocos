"""接口耗时探针:登录 QA 账号,逐个接口连测 N 次,打印每次毫秒数(区分网络往返与服务器处理用)。

用法:python tools/qa/api_latency_probe.py [--base http://127.0.0.1:8081] [--n 5] [--mutate]
--mutate 会对 QA 账号真实执行英雄升级(仅本地库测试账号用)。
"""
import argparse
import json
import time
import urllib.request

USER, PASS = 'guidetest02', 'pass1234'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8081')
    ap.add_argument('--n', type=int, default=5)
    ap.add_argument('--mutate', action='store_true')
    args = ap.parse_args()
    header: dict[str, str] = {}

    def call(method: str, path: str, body=None) -> tuple[float, dict]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(args.base + path, data=data, method=method)
        req.add_header('Content-Type', 'application/json')
        for k, v in header.items():
            req.add_header(k, v)
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
        ms = (time.perf_counter() - t0) * 1000
        return ms, json.loads(raw.decode() or '{}')

    _, login = call('POST', '/api/player/auth/login', {'username': USER, 'password': PASS})
    d = login.get('data') or {}
    name = d.get('tokenName') or 'satoken'
    value = d.get('tokenValue') or d.get('token') or d.get('accessToken')
    if not value:
        print('login failed', login.get('code'), login.get('msg'))
        return
    header[name] = value
    _, heroes = call('GET', '/api/player/lobby/heroes')
    hd = heroes.get('data')
    rows = hd if isinstance(hd, list) else (hd or {}).get('records') or (hd or {}).get('heroes') or []
    hero_id = next((h.get('id') or h.get('heroId') for h in rows if isinstance(h, dict)), None)
    probes = [('GET', '/api/player/me/lobby', None), ('GET', '/api/player/lobby/heroes', None)]
    if hero_id:
        probes.append(('GET', f'/api/player/heroes/{hero_id}', None))
        if args.mutate:
            probes.append(('POST', f'/api/player/heroes/{hero_id}/level-up', None))
    for method, path, body in probes:
        times = []
        last = None
        for _ in range(args.n):
            ms, res = call(method, path, body)
            times.append(round(ms))
            last = res.get('code')
        print(f'{method} {path}: {times} ms  code={last}')


if __name__ == '__main__':
    main()
