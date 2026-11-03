# -*- coding: utf-8 -*-
"""英雄契约里程碑(docs/58 §3.1)接口自验:QA 号依次验 V04 / V09 未领奖 → V04 领奖后 → V09 领奖后(都是 R 级)→ Lv.31(补 Lv.30 SR 级)。
会改本地库(V04 / V09 任务状态、player_level、发英雄);跑完恢复原状态、删发放日志和测试发的英雄行(连同 user_hero_attr)、扣回转出的碎片。只连本地 127.0.0.1:8081 + 本地库。
用法:python tools/qa/level_contract_api.py [--account guidetest06] [--uid 68]
"""
import json, subprocess, sys, time, urllib.request

B = 'http://127.0.0.1:8081'
ACCOUNT = sys.argv[sys.argv.index('--account') + 1] if '--account' in sys.argv else 'guidetest06'
UID = int(sys.argv[sys.argv.index('--uid') + 1]) if '--uid' in sys.argv else 68
API = '/api/player/contract/level'


def sql(q):
    out = subprocess.run(['mysql', '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8')
    return out.stdout.strip()


def req(path, body=None, tok=None):
    headers = {'Content-Type': 'application/json'}
    if tok:
        headers['satoken'] = tok
    r = urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST', headers=headers)
    return json.load(urllib.request.urlopen(r, timeout=20))


def show(tag, d):
    data = d.get('data') or {}
    print(tag, '| code', d.get('code'), d.get('msg') or d.get('message') or '', '| milestone', data.get('milestone'), data.get('rarity'), data.get('storyQuest'),
          [(c['heroCode'], c['rarity'], '已有→碎片%d' % c['fragments'] if c.get('owned') else '新') for c in data.get('candidates') or []], flush=True)
    return data


for _ in range(60):
    try:
        urllib.request.urlopen(B + API, timeout=2)
    except urllib.error.HTTPError:
        break
    except Exception:
        time.sleep(3)
level0 = sql(f'select player_level from game_user where id={UID}')
orig = {q: sql(f"select state from user_story_quest where user_id={UID} and quest_code='{q}'") for q in ('V04', 'V09')}
max_hero = sql(f'select ifnull(max(id),0) from user_hero where user_id={UID}')
print('orig level', level0, orig, 'max hero id', max_hero)
tok = req('/api/player/auth/login', {'username': ACCOUNT, 'password': 'pass1234'})['data']['tokenValue']
try:
    sql(f'update game_user set player_level=13 where id={UID}')
    sql(f"update user_story_quest set state='DONE' where user_id={UID} and quest_code in ('V04','V09')")
    show('V04 / V09 未领奖', req(API, tok=tok))
    show('V09 未领奖就订立 (应拒)', req(API, {'milestone': 'V09', 'heroCode': 'R_PATROL_01'}, tok))
    sql(f"update user_story_quest set state='CLAIMED' where user_id={UID} and quest_code='V04'")
    d = show('V04 领奖后', req(API, tok=tok))
    show('V04 订立 ' + d['candidates'][0]['heroCode'], req(API, {'milestone': 'V04', 'heroCode': d['candidates'][0]['heroCode']}, tok))
    show('Lv.30 未到就订立 (应拒)', req(API, {'milestone': '30', 'heroCode': 'R_PATROL_01'}, tok))
    sql(f"update user_story_quest set state='CLAIMED' where user_id={UID} and quest_code='V09'")
    d = show('V09 领奖后', req(API, tok=tok))
    show('选候选外 (应拒)', req(API, {'milestone': 'V09', 'heroCode': 'UR_ARTHAS'}, tok))
    first = d['candidates'][0]['heroCode']
    show('V09 订立 ' + first, req(API, {'milestone': 'V09', 'heroCode': first}, tok))
    show('V09 重复提交', req(API, {'milestone': 'V09', 'heroCode': d['candidates'][1]['heroCode']}, tok))
    sql(f'update game_user set player_level=31 where id={UID}')
    d = show('Lv.31', req(API, tok=tok))
    # 有已拥有的候选就选它(验转碎片),否则选第一名
    pick = next((c for c in d['candidates'] if c.get('owned')), d['candidates'][0])
    show('Lv.30 订立 ' + pick['heroCode'] + (' (已有)' if pick.get('owned') else ''), req(API, {'milestone': '30', 'heroCode': pick['heroCode']}, tok))
    print('granted', sql(f"select request_id, resource_type, resource_code, amount from reward_grant_log where user_id={UID} and request_id like 'LEVEL_CONTRACT:%'").replace('\n', ' ; '))
    print('new heroes', sql(f'select id, hero_code from user_hero where user_id={UID} and id>{max_hero}').replace('\n', ' ; '))
finally:
    # 转碎片的那档:按发放日志把碎片扣回去
    for line in sql(f"select resource_code, amount from reward_grant_log where user_id={UID} and request_id like 'LEVEL_CONTRACT:%' and resource_type='HERO_FRAGMENT'").splitlines():
        code, amount = line.split('	')
        sql(f"update user_hero_fragment set fragment_count=fragment_count-{int(float(amount))} where user_id={UID} and hero_code='{code}'")
        print('fragments restored', code, sql(f"select fragment_count from user_hero_fragment where user_id={UID} and hero_code='{code}'"))
    sql(f"delete from user_hero_attr where user_hero_id in (select id from user_hero where user_id={UID} and id>{max_hero})")
    sql(f"delete from user_hero where user_id={UID} and id>{max_hero}")
    sql(f"delete from reward_grant_log where user_id={UID} and request_id like 'LEVEL_CONTRACT:%'")
    sql(f'update game_user set player_level={level0} where id={UID}')
    for q, st in orig.items():
        if st:
            sql(f"update user_story_quest set state='{st}' where user_id={UID} and quest_code='{q}'")
    print('restored level', sql(f'select player_level from game_user where id={UID}'),
          {q: sql(f"select state from user_story_quest where user_id={UID} and quest_code='{q}'") for q in orig})
