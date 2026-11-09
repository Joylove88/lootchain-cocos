# -*- coding: utf-8 -*-
"""第 3 章「枯木林」任务链接口实走(docs/59 §13):本地 127.0.0.1:8081 + 本地库,自检号 selfchk1108(uid 83,已交 C210)。
每条:接取 → 按目标走真实接口(TALK / REACH 上报;KILL 走野外遭遇 engage → kill 累计上报 / 精英首领 clear;COLLECT 打毒蛛等掉落)→ 交付。
用时按服务端最短清怪校验等够;首领要体力,先补满。跑完删掉 C301~C311 行、恢复等级 / 体力 / 金币经验不动(本地号)。
用法:PYTHONIOENCODING=utf-8 python tools/qa/chapter3_api.py [--keep]
"""
import json
import subprocess
import sys
import time
import urllib.request

B = 'http://127.0.0.1:8081'
ACC, UID = 'selfchk1108', 83
MYSQL = r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
# 怪物码 → 用来打的营地(普通群)
CAMP_OF = {'SMALL_RAVEN': 'FIELD_DEADWOOD_1', 'STAFF_PRIEST': 'FIELD_DEADWOOD_12', 'MUTANT_MALE': 'FIELD_DEADWOOD_14', 'LARGE_SPIDER': 'FIELD_DEADWOOD_6'}


def sql(q):
    return subprocess.run([MYSQL, '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8').stdout.strip()


def req(path, body=None, tok=None):
    headers = {'Content-Type': 'application/json'}
    if tok:
        headers['satoken'] = tok
    r = urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST', headers=headers)
    return json.load(urllib.request.urlopen(r, timeout=30))


tok = req('/api/player/auth/login', {'username': ACC, 'password': 'pass1234'})['data']['tokenValue']
heroes = sql(f"select id, source_type from user_hero where user_id={UID} order by (source_type='PROTAGONIST') desc, power desc limit 4").splitlines()
hero_ids = [int(h.split('\t')[0]) for h in heroes]
leader = hero_ids[0]
print('heroes', hero_ids)


def quest_row(code):
    st = req('/api/player/world/state', tok=tok)['data']
    return next((q for q in st['quests'] if q['code'] == code), None)


def engage(stage):
    d = req('/api/player/world/field/engage', {'stageCode': stage, 'heroIds': hero_ids, 'leaderHeroId': leader, 'requestId': f'qa-{time.time()}'}, tok)
    if d.get('code') != 0:
        raise SystemExit(f'engage {stage} 失败: {d.get("msg")}')
    return d['data']


def kill_normal(stage, n):
    """普通群:一次遭遇最多登记 6 只,等够最短用时后累计上报击杀数。"""
    e = engage(stage)
    eid = e.get('encounterId') or e.get('id')
    time.sleep(0.8 * n + 0.5)
    d = req('/api/player/world/field/kill', {'encounterId': eid, 'killed': n}, tok)
    if d.get('code') != 0:
        print('  kill 失败', d.get('msg'))
    c = req('/api/player/world/field/clear', {'encounterId': eid}, tok)
    return c.get('code'), c.get('msg')


def clear_elite(stage, wait):
    e = engage(stage)
    eid = e.get('encounterId') or e.get('id')
    time.sleep(wait)
    c = req('/api/player/world/field/clear', {'encounterId': eid}, tok)
    return c.get('code'), c.get('msg')


ok = True
lv = sql(f'select player_level from game_user where id={UID}')
sql(f'update game_user set stamina=200 where id={UID}')
try:
    for code in ['C301', 'C302', 'C303', 'C304', 'C305', 'C306', 'C307', 'C308', 'C309', 'C310', 'C311']:
        q = quest_row(code)
        if not q:
            print(code, '世界状态里没有这条'); ok = False; break
        if q['state'] == 'AVAILABLE':
            a = req('/api/player/world/quest/accept', {'questCode': code}, tok)
            if a.get('code') != 0:
                print(code, '接取失败', a.get('msg')); ok = False; break
            q = quest_row(code)
        obj, target, need = q['objective'], q['objectiveTarget'], q['target']
        tries = 0
        while q['state'] == 'ACCEPTED' and tries < 12:
            tries += 1
            if obj in ('TALK', 'REACH'):
                r = req('/api/player/world/quest/report', {'questCode': code, 'kind': obj, 'target': target}, tok)
                if r.get('code') != 0:
                    print('  report 失败', r.get('msg'))
            elif obj == 'KILL' and target.startswith('stage:'):
                stage = target[6:]
                print('  clear', stage, clear_elite(stage, 6 if stage.endswith('_B') else 3))
            elif obj == 'KILL':
                print('  kill', CAMP_OF[target], kill_normal(CAMP_OF[target], min(6, need - q['progress'])))
            elif obj == 'COLLECT':
                print('  collect via', CAMP_OF['LARGE_SPIDER'], kill_normal(CAMP_OF['LARGE_SPIDER'], 5))
            q = quest_row(code)
        print(code, q['name'], obj, target, f"{q['progress']}/{q['target']}", q['state'], flush=True)
        if q['state'] != 'DONE':
            ok = False; break
        c = req('/api/player/world/quest/claim', {'questCode': code}, tok)
        if c.get('code') != 0:
            print(code, '交付失败', c.get('msg')); ok = False; break
    st = req('/api/player/world/state', tok=tok)['data']
    print('after', [(q['code'], q['state']) for q in st['quests'] if q['code'].startswith('C3')])
finally:
    if '--keep' not in sys.argv:
        sql(f"delete from user_story_quest where user_id={UID} and quest_code like 'C3%'")
        sql(f"delete from user_quest_item where user_id={UID} and item_code='SPIDER_GLAND'")
    sql(f'update game_user set player_level={lv} where id={UID}')
print('PASS' if ok else 'FAIL')
