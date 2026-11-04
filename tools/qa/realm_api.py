# -*- coding: utf-8 -*-
"""主角境界突破(docs/60 §12)接口自验:本地 127.0.0.1:8081 + 本地库,会改 QA 号数据,跑完恢复。
- 新号(默认 guidetest03 / uid 65):觉醒 → 条件不足拒绝试炼 → Lv.10 + V09 已交付 → 圆满可突破、V10 领奖被拦 → 用时过短拒绝 → 正常用时升炼魂 → 重复上报不变。
- 老号(默认 guidetest04 / uid 66,V10 = SKIPPED):Lv.12 首次查询自动补炼魂(LEGACY);Lv.9 不补。
用法:PYTHONIOENCODING=utf-8 python tools/qa/realm_api.py
"""
import json, subprocess, time, urllib.request

B = 'http://127.0.0.1:8081'
NEW = ('guidetest03', 65)
OLD = ('guidetest04', 66)


def sql(q):
    return subprocess.run(['mysql', '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8').stdout.strip()


def req(path, body=None, tok=None):
    headers = {'Content-Type': 'application/json'}
    if tok:
        headers['satoken'] = tok
    r = urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST', headers=headers)
    return json.load(urllib.request.urlopen(r, timeout=20))


def login(account):
    return req('/api/player/auth/login', {'username': account, 'password': 'pass1234'})['data']['tokenValue']


def show(tag, d):
    x = d.get('data') or {}
    conds = ' / '.join(f"{c['label']}:{c['current']}{'✓' if c['done'] else '✗'}" for c in x.get('conditions') or [])
    print(f"{tag} | code {d.get('code')} {d.get('msg') or ''} | {x.get('title')} next={x.get('nextRealmName')} canBreak={x.get('canBreak')} "
          f"bonus={x.get('bonus')} legend={x.get('legendOpen')} src={x.get('source')} | {conds}", flush=True)
    return x


for _ in range(60):
    try:
        urllib.request.urlopen(B + '/api/player/realm', timeout=2)
    except urllib.error.HTTPError:
        break
    except Exception:
        time.sleep(3)

uid = NEW[1]
lvl0 = sql(f'select player_level from game_user where id={uid}')
max_story = sql(f'select ifnull(max(id),0) from user_story_quest where user_id={uid}')
old_lvl0 = sql(f'select player_level from game_user where id={OLD[1]}')
try:
    tok = login(NEW[0])
    show('新号 觉醒', req('/api/player/realm', tok=tok))
    show('条件不足上报 (应拒)', req('/api/player/realm/trial', {'durationMs': 40000}, tok))
    sql(f'update game_user set player_level=10 where id={uid}')
    for code, state in (('V09', 'CLAIMED'), ('V10', 'DONE')):
        sql(f"insert into user_story_quest(user_id, quest_code, state, progress, baseline, accepted_at) values ({uid}, '{code}', '{state}', 1, 0, now())")
    show('Lv.10 + V09 交付', req('/api/player/realm', tok=tok))
    d = req('/api/player/world/quest/claim', {'questCode': 'V10'}, tok)
    print('V10 领奖 (应拒) | code', d.get('code'), d.get('msg'), flush=True)
    show('用时 5 秒 (应拒)', req('/api/player/realm/trial', {'durationMs': 5000}, tok))
    show('用时 42 秒 → 炼魂', req('/api/player/realm/trial', {'durationMs': 42000}, tok))
    show('重复上报', req('/api/player/realm/trial', {'durationMs': 42000}, tok))
    evo = req('/api/player/evolution', tok=tok).get('data') or {}
    print('进化页称号', evo.get('realm'), flush=True)
    print('库里', sql(f'select realm_code, source, trial_ms from user_protagonist_realm where user_id={uid}'), flush=True)

    otok = login(OLD[0])
    sql(f'update game_user set player_level=9 where id={OLD[1]}')
    show('老号 Lv.9 (不补)', req('/api/player/realm', tok=otok))
    sql(f'update game_user set player_level=12 where id={OLD[1]}')
    show('老号 Lv.12 (补炼魂)', req('/api/player/realm', tok=otok))
finally:
    sql(f'delete from user_protagonist_realm where user_id in ({uid}, {OLD[1]})')
    sql(f'delete from user_story_quest where user_id={uid} and id>{max_story}')
    sql(f'update game_user set player_level={lvl0} where id={uid}')
    sql(f'update game_user set player_level={old_lvl0} where id={OLD[1]}')
    print('restored', sql(f'select id, player_level from game_user where id in ({uid}, {OLD[1]})').replace('\n', ' ; '),
          '| story', sql(f'select group_concat(quest_code) from user_story_quest where user_id={uid}'))
