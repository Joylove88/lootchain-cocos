# -*- coding: utf-8 -*-
"""Tripo 接口:设定图 → 3D 模型 → 绑骨 → 预设动作 → 下载。只用标准库。

密钥:环境变量 TRIPO_API_KEY,或 D:\\project\\lootchain-3d-ref\\tripo_key.txt(仓库外,用户自己放的)。
      脚本只把它放进请求头,不打印、不写进任何文件。
产物:D:\\project\\lootchain-3d-ref\\chars\\<名字>\\(仓库外;state.json 记每一步的任务号、花的积分、下到的文件)。

每个花积分的命令都必须带 --ok=<积分>:这一步用户点过头的额度。脚本先按价目表算这一步要花多少,
超过 --ok 就不发请求。失败 / 取消的任务平台不扣积分(冻结的会退回)。

用法:
  python tripo_run.py balance
  python tripo_run.py mv <名字> <正面图> --ok=10                 单图 → 四视图(确认平台的左 / 右视图约定用)
  python tripo_run.py gen <名字> --front=<图> [--right=<图>] [--back=<图>] [--left=<图>]
                         [--faces=60000] [--tex=detailed] [--geo=detailed] [--texver=v3.5-20260815] [--seed=20261112] --ok=60
  python tripo_run.py rigcheck <名字>                              免费
  python tripo_run.py rig <名字> [--type=biped] [--spec=mixamo] --ok=25
  python tripo_run.py anim <名字> idle,walk,slash,hurt,fall --ok=50   (一次最多 5 个;两足预设只有 idle walk run dive climb jump slash shoot hurt fall turn)
  python tripo_run.py wait <名字> <步骤>                           命令被打断后接着等那一步的任务并下载(不会重复扣费)
  花积分的命令加 --nowait:只建任务不等结果(几个角色一起跑),之后用 wait 取回
  python tripo_run.py status <名字>

价目(2026-11-12 查的 developers.tripo3d.com/en/pricing,H 系列):转 3D 带贴图 30、不带 20;高清贴图 +10、8K +20;
高精度几何 +20;四边面 +5;智能低模 +10;绑骨检查 0;自动绑骨 25;预设动作 10 / 个;单图转四视图 10。
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = 'https://openapi.tripo3d.com/v3'
KEY_FILE = r'D:\project\lootchain-3d-ref\tripo_key.txt'
OUT_ROOT = r'D:\project\lootchain-3d-ref\chars'
UA = 'char3d-pipeline/1.0'


def api_key():
    k = os.environ.get('TRIPO_API_KEY', '').strip()
    if not k and os.path.exists(KEY_FILE):
        k = open(KEY_FILE, encoding='utf-8-sig').read().strip()
    if not k:
        raise SystemExit('没有密钥:设环境变量 TRIPO_API_KEY,或把密钥存到 ' + KEY_FILE)
    return k


def call(method, path, body=None, upload=None, timeout=90):
    """发一个请求,返回 data 字段。upload = (文件名, 内容, 类型) 时按表单上传。"""
    headers = {'Authorization': 'Bearer ' + api_key(), 'User-Agent': UA, 'Accept': 'application/json'}
    data = None
    if upload:
        fname, content, ctype = upload
        boundary = '----char3d' + uuid.uuid4().hex
        head = ('--' + boundary + '\r\n'
                + f'Content-Disposition: form-data; name="file"; filename="{fname}"\r\n'
                + f'Content-Type: {ctype}\r\n\r\n').encode('ascii')
        data = head + content + ('\r\n--' + boundary + '--\r\n').encode('ascii')
        headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
    elif body is not None:
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            j = json.loads(raw)
        except Exception:
            raise SystemExit(f'接口报错 HTTP {e.code}:{raw[:300]!r}')
        raise SystemExit(f'接口报错 HTTP {e.code}:code={j.get("code")} {j.get("message")} | {j.get("suggestion", "")}')
    j = json.loads(raw)
    if j.get('code') != 0:
        raise SystemExit(f'接口报错:code={j.get("code")} {j.get("message")} | {j.get("suggestion", "")}')
    return j.get('data')


def opt(name, default=None):
    for a in sys.argv[2:]:
        if a.startswith('--' + name + '='):
            return a.split('=', 1)[1]
    return default


def char_dir(name):
    d = os.path.join(OUT_ROOT, name)
    os.makedirs(d, exist_ok=True)
    return d


def load_state(name):
    p = os.path.join(char_dir(name), 'state.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {'name': name, 'steps': {}}


def save_state(name, st):
    with open(os.path.join(char_dir(name), 'state.json'), 'w', encoding='utf-8') as f:
        json.dump(st, f, ensure_ascii=False, indent=2)


def balance():
    d = call('GET', '/account/balance')
    return float(d.get('balance', 0)), float(d.get('frozen', 0))


def approve(cost):
    ok = opt('ok')
    if ok is None:
        raise SystemExit(f'这一步要花 {cost} 积分;带上 --ok={cost}(用户点过头的额度)才会发请求')
    if cost > float(ok):
        raise SystemExit(f'这一步要花 {cost} 积分,超过 --ok={ok},没有发请求')
    bal, frozen = balance()
    print(f'余额 {bal:.0f}(冻结 {frozen:.0f}),这一步预计 {cost} 积分')
    if bal < cost:
        raise SystemExit('余额不够,没有发请求')


def upload_image(path):
    ext = os.path.splitext(path)[1].lower()
    ctype = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}.get(ext)
    if not ctype:
        raise SystemExit('只支持 png / jpg / webp:' + path)
    content = open(path, 'rb').read()
    d = call('POST', '/files', upload=('view' + ext, content, ctype), timeout=180)     # 文件名用纯英文,避免表单头里出现中文
    tok = d.get('file_token')
    if not tok:
        raise SystemExit('上传没返回 file_token')
    print(f'已上传 {os.path.basename(path)}({len(content) // 1024} KB)')
    return tok


def download(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, 'wb') as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return os.path.getsize(dest)


def wait_and_fetch(name, step, timeout=1500):
    """等 state 里这一步的任务跑完,把 output 里的文件都下下来。"""
    st = load_state(name)
    info = st['steps'].get(step)
    if not info or not info.get('task_id'):
        raise SystemExit(f'{name} 没有「{step}」这一步的任务')
    tid = info['task_id']
    t0 = time.time()
    last = None
    fails = 0
    while True:
        try:
            d = call('GET', '/tasks/' + tid, timeout=30)
            fails = 0
        except SystemExit:
            raise
        except Exception as e:                      # 网络抖动:多试几次
            fails += 1
            if fails > 8:
                raise SystemExit(f'查询任务连续失败:{type(e).__name__}')
            time.sleep(5)
            continue
        status, prog = d.get('status'), d.get('progress')
        if (status, prog) != last:
            print(f'  [{step}] {status} {prog}%  {time.time() - t0:.0f}s')
            last = (status, prog)
        if status == 'success':
            break
        if status in ('failed', 'cancelled', 'banned', 'expired'):
            info.update(status=status, error_code=d.get('error_code'), error_message=d.get('error_message'))
            save_state(name, st)
            raise SystemExit(f'任务{status}:{d.get("error_code")} {d.get("error_message")}(失败 / 取消不扣积分)')
        if time.time() - t0 > timeout:
            raise SystemExit(f'等了 {timeout} 秒还没完,任务号已记在 state.json,稍后用 wait {name} {step} 接着等')
        time.sleep(3)
    # output 可能套了几层(比如四视图在 generate_multiview_image 下面):摊平,地址都下载,别的值记下来。
    # 下载地址带临时签名,不打印、不存盘。
    leaves = []

    def flat(key, obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                flat(k, v)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                flat(f'{key}_{i}', v)
        else:
            leaves.append((key, obj))

    flat('output', d.get('output') or {})
    info.update(status='success', credits=d.get('credits_consumed'), files={},
                output={k: v for k, v in leaves if not (isinstance(v, str) and v.startswith('http'))})
    for k, v in leaves:
        if isinstance(v, str) and v.startswith('http'):
            ext = os.path.splitext(urllib.parse.urlparse(v).path)[1] or '.bin'
            dest = os.path.join(char_dir(name), f'{step}_{k.replace("_url", "")}{ext}')
            size = download(v, dest)
            info['files'][k] = os.path.basename(dest)
            print(f'  下载 {os.path.basename(dest)}  {size / 1048576:.2f} MB')
    save_state(name, st)
    print(f'[{step}] 完成,实际扣 {d.get("credits_consumed")} 积分;其它输出 {info["output"]}')
    return info


def start(name, step, path, body, cost):
    st = load_state(name)
    old = st['steps'].get(step)
    if old and old.get('task_id') and old.get('status') in (None, 'success') and '--again' not in sys.argv:
        raise SystemExit(f'{name} 的「{step}」已经有任务了(状态 {old.get("status")});没跑完用 wait,确实要重做加 --again')
    approve(cost)
    d = call('POST', path, body=body)
    tid = d.get('task_id')
    if not tid:
        raise SystemExit('没返回任务号:' + json.dumps(d)[:200])
    logged = {k: v for k, v in body.items() if k not in ('inputs', 'input')}
    st['steps'][step] = {'task_id': tid, 'request': logged, 'expected_credits': cost, 'status': None, 'created': time.strftime('%Y-%m-%d %H:%M:%S')}
    save_state(name, st)
    print(f'[{step}] 任务已创建 {tid}')
    if '--nowait' in sys.argv:          # 只建任务不等结果(几个角色一起跑时用),之后 wait <名字> <步骤> 取回
        return st['steps'][step]
    return wait_and_fetch(name, step)


def precheck(name, step, cost):
    """上传之前先过两关:额度够不够、这一步是不是已经做过(上传不花钱,但没必要白传)。"""
    ok = opt('ok')
    if ok is None or cost > float(ok):
        raise SystemExit(f'这一步要花 {cost} 积分;带上 --ok={cost}(用户点过头的额度)才会发请求')
    old = load_state(name)['steps'].get(step)
    if old and old.get('task_id') and old.get('status') in (None, 'success') and '--again' not in sys.argv:
        raise SystemExit(f'{name} 的「{step}」已经有任务了(状态 {old.get("status")});没跑完用 wait,确实要重做加 --again')


def cmd_mv(name):
    precheck(name, 'mv', 10)
    tok = upload_image(sys.argv[3])
    start(name, 'mv', '/generation/image-to-multiview', {'input': tok}, 10)


def cmd_gen(name):
    views = {k: opt(k) for k in ('front', 'left', 'back', 'right')}
    if not views['front'] or sum(1 for v in views.values() if v) < 2:
        raise SystemExit('至少要 --front 再加一张别的视图')
    tex, geo = opt('tex', 'detailed'), opt('geo', 'detailed')
    cost = 30 + {'standard': 0, 'fast': 0, 'detailed': 10, 'extreme': 20}[tex] + {'standard': 0, 'detailed': 20}[geo]
    precheck(name, 'gen', cost)
    inputs = [{k: upload_image(v)} for k, v in views.items() if v]
    seed = int(opt('seed', '20261112'))
    body = {
        'inputs': inputs,
        'model': opt('model', 'v3.1-20260211'),
        'texture': True,
        'pbr': True,
        'texture_quality': tex,
        'geometry_quality': geo,
        'texture_alignment': 'original_image',
        'auto_size': True,                 # 按真实尺寸(米)出
        'model_seed': seed,
        'texture_seed': seed,
        # 不设 export_orientation:后面还要绑骨,设了后处理朝向会错而且不报错
    }
    texver = opt('texver', 'v3.5-20260815')      # 最新贴图模型:会先去掉参考图里烘死的光影(delight 默认开),适合进引擎重新打光
    if texver and texver != 'auto':
        body['texture_version'] = texver
    faces = int(opt('faces', '60000'))
    if faces > 0:
        body['face_limit'] = faces
    st = load_state(name)
    st['views'] = {k: os.path.basename(v) for k, v in views.items() if v}
    save_state(name, st)
    start(name, 'gen', '/generation/multiview-to-model', body, cost)


def need_task(name, step):
    info = load_state(name)['steps'].get(step)
    if not info or info.get('status') != 'success':
        raise SystemExit(f'{name} 的「{step}」还没成功,先做那一步')
    return info['task_id']


def cmd_rigcheck(name):
    st = load_state(name)
    d = call('POST', '/animations/rig-check', body={'input': need_task(name, 'gen')})
    st['steps']['rigcheck'] = {'task_id': d['task_id'], 'status': None, 'expected_credits': 0}
    save_state(name, st)
    wait_and_fetch(name, 'rigcheck', timeout=600)


def cmd_rig(name):
    body = {'input': need_task(name, 'gen'), 'model': opt('rigmodel', 'v3.0-20260909'), 'rig_type': opt('type', 'biped'), 'out_format': 'glb'}
    if body['rig_type'] == 'biped':
        body['spec'] = opt('spec', 'mixamo')
    start(name, 'rig', '/animations/rig', dict(body), 25)


def cmd_anim(name):
    names = [a if a.startswith('preset:') else 'preset:' + a for a in sys.argv[3].split(',') if a]
    if not 1 <= len(names) <= 5:
        raise SystemExit('一次 1~5 个动作')
    step = opt('step', 'anim')
    body = {'input': need_task(name, 'rig'), 'out_format': 'glb', 'animate_in_place': True}
    if len(names) == 1:
        body['animation'] = names[0]
    else:
        body['animations'] = names
    start(name, step, '/animations/retarget', dict(body), 10 * len(names))


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]
    if cmd == 'balance':
        bal, frozen = balance()
        print(f'余额 {bal:.2f} 积分(约 ¥{bal * 0.07:.2f}),冻结 {frozen:.2f}')
        return
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    name = sys.argv[2]
    if cmd == 'mv':
        cmd_mv(name)
    elif cmd == 'gen':
        cmd_gen(name)
    elif cmd == 'rigcheck':
        cmd_rigcheck(name)
    elif cmd == 'rig':
        cmd_rig(name)
    elif cmd == 'anim':
        cmd_anim(name)
    elif cmd == 'wait':
        wait_and_fetch(name, sys.argv[3])
    elif cmd == 'status':
        st = load_state(name)
        total = 0.0
        for step, info in st['steps'].items():
            total += float(info.get('credits') or 0)
            print(f'{step}: {info.get("status")}  积分 {info.get("credits")}  文件 {list((info.get("files") or {}).values())}  {info.get("output") or ""}')
        print(f'合计已扣 {total:.0f} 积分')
    else:
        raise SystemExit(__doc__)
    if cmd in ('mv', 'gen', 'rig', 'anim', 'rigcheck', 'wait'):
        bal, frozen = balance()
        print(f'现在余额 {bal:.0f}(冻结 {frozen:.0f})')


if __name__ == '__main__':
    main()
