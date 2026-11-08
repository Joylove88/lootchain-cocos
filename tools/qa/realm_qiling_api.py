# -*- coding: utf-8 -*-
"""契灵突破(docs/60 §14)接口自验:本地 127.0.0.1:8081 + 本地库,用自检号 selfchk1108(uid 83,Lv.60 炼魂),跑完恢复。
- 炼魂 Lv.60 → 三选一(等级已满足)→ canBreak / conditionMode=ANY / nextTeamAuraPct=8;
- 改到 Lv.20(三条都不满足)→ 不可突破、试炼上报被拒;
- 恢复 Lv.60 → 带错目标(LIANHUN)上报不升 → 正常上报 QILING 升契灵(加成 0.30 / 光环 8 / 无下一境)→ 重复上报不变;
- 恢复成炼魂(--keep 则保留契灵给界面自验)。
用法:PYTHONIOENCODING=utf-8 python tools/qa/realm_qiling_api.py [--keep]
"""
import json
import subprocess
import sys
import urllib.request

B = 'http://127.0.0.1:8081'
ACC, UID = 'selfchk1108', 83
MYSQL = r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'


def sql(q):
    return subprocess.run([MYSQL, '-uroot', '-p123456', '-h127.0.0.1', 'lootchain', '-N', '-e', q], capture_output=True, text=True, encoding='utf-8').stdout.strip()


def req(path, body=None, tok=None):
    headers = {'Content-Type': 'application/json'}
    if tok:
        headers['satoken'] = tok
    r = urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST', headers=headers)
    return json.load(urllib.request.urlopen(r, timeout=20))


def show(tag, d):
    x = d.get('data') or {}
    conds = ' / '.join(f"{c['label']}:{c['current']}{'✓' if c['done'] else '✗'}" for c in x.get('conditions') or [])
    print(f"{tag} | code {d.get('code')} {d.get('msg') or ''} | {x.get('realmCode')} {x.get('title')} next={x.get('nextRealmCode')} canBreak={x.get('canBreak')} "
          f"mode={x.get('conditionMode')} bonus={x.get('bonus')}/{x.get('nextBonus')} aura={x.get('teamAuraPct')}/{x.get('nextTeamAuraPct')} | {conds}", flush=True)
    return x


tok = req('/api/player/auth/login', {'username': ACC, 'password': 'pass1234'})['data']['tokenValue']
lv = sql(f'select player_level from game_user where id={UID}')
row = sql(f'select realm_code, source from user_protagonist_realm where user_id={UID}')
print('start: level', lv, 'realm row', row)
ok = True
s = show('Lv.60 炼魂', req('/api/player/realm', tok=tok))
ok &= s.get('realmCode') == 'LIANHUN' and s.get('canBreak') and s.get('conditionMode') == 'ANY' and s.get('nextTeamAuraPct') == 8 and len(s.get('conditions') or []) == 3

sql(f'update game_user set player_level=20 where id={UID}')
s = show('Lv.20', req('/api/player/realm', tok=tok))
power_ok = any(c['key'] == 'POWER' and c['done'] for c in s.get('conditions') or [])
explore_ok = any(c['key'] == 'EXPLORE' and c['done'] for c in s.get('conditions') or [])
if not (power_ok or explore_ok):
    ok &= not s.get('canBreak')
    d = req('/api/player/realm/trial', {'durationMs': 60000, 'targetRealm': 'QILING'}, tok)
    show('Lv.20 上报(应被拒)', d)
    ok &= d.get('code') != 0
else:
    print('  (战力 / 探索已满足,跳过「都不满足」用例)')
sql(f'update game_user set player_level={lv} where id={UID}')

s = show('错目标 LIANHUN', req('/api/player/realm/trial', {'durationMs': 60000, 'targetRealm': 'LIANHUN'}, tok))
ok &= s.get('realmCode') == 'LIANHUN'
s = show('不带目标(旧客户端)', req('/api/player/realm/trial', {'durationMs': 60000}, tok))
ok &= s.get('realmCode') == 'LIANHUN'
d = req('/api/player/realm/trial', {'durationMs': 3000, 'targetRealm': 'QILING'}, tok)
show('用时过短(应被拒)', d)
ok &= d.get('code') != 0
s = show('正常上报 QILING', req('/api/player/realm/trial', {'durationMs': 60000, 'targetRealm': 'QILING'}, tok))
ok &= s.get('realmCode') == 'QILING' and abs((s.get('bonus') or 0) - 0.30) < 1e-6 and s.get('teamAuraPct') == 8 and not s.get('nextRealmCode')
s = show('重复上报', req('/api/player/realm/trial', {'durationMs': 60000, 'targetRealm': 'QILING'}, tok))
ok &= s.get('realmCode') == 'QILING'
print('db row:', sql(f'select realm_code, source, trial_ms from user_protagonist_realm where user_id={UID}'))
if '--keep' not in sys.argv:
    sql(f"update user_protagonist_realm set realm_code='LIANHUN' where user_id={UID}")
    print('restored: ', sql(f'select realm_code from user_protagonist_realm where user_id={UID}'))
print('PASS' if ok else 'FAIL')
