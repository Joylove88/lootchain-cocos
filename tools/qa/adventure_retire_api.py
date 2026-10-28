"""冒险下架(docs/50 §15,2026-10-28)接口自验:本地游戏服 8081。
1) 冒险关卡开战被拒;2) 野外精英有奖击杀带出承接奖励(晶核 / 稀有材料),FIELD_ADV_LOOT 指针推进;3) 每日任务「野外清剿」计数。
用法:python tools/qa/adventure_retire_api.py [--login guidetest05] [--stage FIELD_GRAY_E] [--times 2]
"""
import argparse
import json
import os
import time
import urllib.request

BASE = 'http://127.0.0.1:8081'


def call(path, body=None, token=None, method=None):
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = urllib.request.Request(BASE + path, data=data, method=method or ('POST' if body is not None else 'GET'))
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header(token[0], token[1])
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--login', default='guidetest05')
    ap.add_argument('--stage', default='FIELD_GRAY_E')
    ap.add_argument('--times', type=int, default=2)
    args = ap.parse_args()
    login = call('/api/player/auth/login', {'username': args.login, 'password': os.environ.get('QA_PASS', 'pass1234')})
    tok = (login['data']['tokenName'], login['data']['tokenValue'])
    heroes = call('/api/player/heroes', token=tok)['data']
    items = heroes if isinstance(heroes, list) else (heroes.get('heroes') or heroes.get('items') or heroes.get('records') or [])
    ids = [h.get('id') or h.get('heroId') for h in items][:4]
    print('heroes', ids)
    r = call('/api/player/battles/start', {'requestId': f'qa-adv-{int(time.time())}', 'stageCode': 'MAIN_1_1', 'heroIds': ids, 'leaderHeroId': ids[0]}, tok)
    print('adventure start ->', r.get('code'), r.get('message') or r.get('msg'))
    for i in range(args.times):
        enc = call('/api/player/world/field/engage', {'requestId': f'qa-f-{time.time()}', 'stageCode': args.stage, 'heroIds': ids, 'leaderHeroId': ids[0]}, tok)
        if not enc.get('data'):
            print('engage failed', enc)
            return
        eid = enc['data']['encounterId']
        for wait in (3, 6, 12, 25):
            time.sleep(wait)
            res = call('/api/player/world/field/clear', {'encounterId': eid}, tok)
            if res.get('data'):
                break
            print('  clear retry', res.get('message') or res.get('msg'))
        data = res.get('data') or {}
        print(f'clear #{i + 1}', 'capped' if data.get('capped') else '', data.get('message'))
        for item in data.get('rewards') or []:
            print('   ', item.get('resourceType'), item.get('resourceCode'), item.get('resourceName'), item.get('amount'))


if __name__ == '__main__':
    main()
