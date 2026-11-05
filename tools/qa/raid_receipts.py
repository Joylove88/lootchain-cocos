"""docs/61 掠夺主角带队:从本地游戏服抓真实开战回执(旧口径 raidSquad=false / 新口径 true),给 guard_sim/raid_squad_check.mjs 做复演自检与平衡对比。

用法:python tools/qa/raid_receipts.py <输出目录> [账号=guidetest02]
- 两档阵容(弱 = 编队里的 SR/R、强 = 战力最高 3 人)× NPC 矿若干座 × 新旧口径,外加真人矿 RAIDPVP_<guidetest03>(新旧各一)。
- 临时把 user_raid_progress.cleared_max 调到 59(才能开高序号矿),结束恢复原值;只开战不结算(会话 30 分钟后过期,不扣体力)。
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

B = 'http://127.0.0.1:8081'
MYSQL = r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'


def sql(q):
    out = subprocess.run([MYSQL, '-uroot', '-p123456', 'lootchain', '-N', '--default-character-set=utf8mb4', '-e', q], capture_output=True, text=True, encoding='utf-8')
    return [line.split('\t') for line in out.stdout.strip().splitlines() if line]


def req(path, body=None, tok=None):
    headers = {'Content-Type': 'application/json'}
    if tok:
        headers['satoken'] = tok
    r = urllib.request.Request(B + path, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST', headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as error:
        return json.loads(error.read().decode())


def main():
    out = sys.argv[1]
    account = sys.argv[2] if len(sys.argv) > 2 else 'guidetest02'
    os.makedirs(out, exist_ok=True)
    tok = req('/api/player/auth/login', {'username': account, 'password': 'pass1234'})['data']['tokenValue']
    uid = int(sql(f"select id from game_user where username='{account}'")[0][0])
    heroes = sql(f"select id, power, hero_code from user_hero where user_id={uid} and status=1 and source_type<>'PROTAGONIST' order by power desc")
    strong = [int(h[0]) for h in heroes[:3]]
    team = sql(f"select hero_ids from user_team where user_id={uid}")
    weak = [int(x) for x in team[0][0].split(',')][:3] if team else [int(h[0]) for h in heroes[-3:]]
    rival = sql("select id from game_user where username='guidetest03'")
    old_max = sql(f"select cleared_max from user_raid_progress where user_id={uid}")
    sql(f"update user_raid_progress set cleared_max=59 where user_id={uid}")
    saved = []
    try:
        cases = [('weak', weak, n) for n in (1, 5, 10, 15, 20)] + [('strong', strong, n) for n in (10, 20, 30, 40, 50, 60)]
        if rival:
            cases += [('weak', weak, f'PVP{rival[0][0]}'), ('strong', strong, f'PVP{rival[0][0]}')]
        for tier, ids, n in cases:
            stage = f'RAIDPVP_{str(n)[3:]}' if isinstance(n, str) else f'RAID_{n}'
            for squad in (False, True):
                body = {'requestId': f'qa-receipt-{tier}-{stage}-{int(squad)}-{int(time.time() * 1000)}', 'stageCode': stage, 'heroIds': ids, 'leaderHeroId': ids[0], 'clientVersion': 'qa-raid-receipts'}
                if squad:
                    body['raidSquad'] = True
                res = req('/api/player/battles/start', body, tok)
                tag = f'{tier}_{stage}_{"squad" if squad else "old"}'
                if not res.get('data'):
                    print('SKIP', tag, res.get('msg') or res.get('message'))
                    continue
                path = os.path.join(out, f'receipt_{tag}.json')
                with open(path, 'w', encoding='utf-8') as fh:
                    json.dump(res['data'], fh, ensure_ascii=False)
                raid = res['data'].get('raid') or {}
                print('OK  ', tag, 'raider', (raid.get('raider') or {}).get('heroCode'), 'atk', (raid.get('raider') or {}).get('attack'),
                      'allies', len(raid.get('allies') or []), 'defenders', len(raid.get('defenders') or []),
                      'boss', [d['hero']['heroName'] for d in raid.get('defenders', []) if d.get('boss')])
                saved.append(path)
    finally:
        if old_max:
            sql(f"update user_raid_progress set cleared_max={old_max[0][0]} where user_id={uid}")
    print(len(saved), 'receipts ->', out)


if __name__ == '__main__':
    main()
