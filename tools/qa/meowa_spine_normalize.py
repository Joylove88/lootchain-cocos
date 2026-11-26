# -*- coding: utf-8 -*-
"""用 Meowa 的 Spine 上传接口把旧版本骨骼(3.6~4.1)转成 4.2 运行时包(2026-11-26)。
本机 Spine 命令行被防火墙规则拦着(不改),上传到 Meowa 项目时服务端会统一规整成 4.2,下载回来即可预览 / 入库。
只上传不生成,不扣积分(脚本前后各查一次余额并打印)。

  python tools/qa/meowa_spine_normalize.py <输出目录> <骨骼目录>[|基名] ...
骨骼目录里要有 <基名>.skel 或 .json、<基名>.atlas 和图集贴图;基名默认取目录名。产物 <输出目录>/<基名>/(zip 解开,文件改名 char.*)。
依赖:C:/Users/Ethan/tools/meowa-skills/skills/game-assets(meowart_api.py + .env 里的密钥)。
"""
import io
import json
import os
import sys
import zipfile

SKILL = r'C:\Users\Ethan\tools\meowa-skills\skills\game-assets'
sys.path.insert(0, SKILL)
os.chdir(SKILL)  # 让 meowart_api 找到同目录 .env
import meowart_api as m  # noqa: E402
import requests  # noqa: E402


def api_key():
    for line in open(os.path.join(SKILL, '.env'), encoding='utf-8'):
        if line.startswith('MEOWART_API_KEY='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('no key')


def balance(key):
    r = requests.get(m._normalize_base_url(m.DEFAULT_API_BASE, '/api/credits/balance'), headers=m._base_headers(key), timeout=60)
    try:
        return r.json().get('total_credits')
    except Exception:
        return None


def pack(src, base):
    names = [f'{base}.skel' if os.path.exists(os.path.join(src, f'{base}.skel')) else f'{base}.json', f'{base}.atlas']
    atlas = open(os.path.join(src, f'{base}.atlas'), encoding='utf-8').read().splitlines()
    pages = [l.strip() for l in atlas if l.strip().lower().endswith('.png')]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names + pages:
            z.write(os.path.join(src, n), n)
    path = os.path.join(os.environ.get('TEMP', '.'), f'mw_norm_{base}.zip')
    open(path, 'wb').write(buf.getvalue())
    return path


def main():
    out = sys.argv[1]
    key = api_key()
    before = balance(key)
    print('credits before', before)
    project_id, _thread = m._create_spine_project_context(api_base=m.DEFAULT_API_BASE, api_key=key, timeout=120, verify=True)
    for arg in sys.argv[2:]:
        src, _, base = arg.partition('|')
        base = base or os.path.basename(os.path.normpath(src))
        try:
            info = m.upload_project_spine_package(api_base=m.DEFAULT_API_BASE, api_key=key, project_id=project_id, package_path=pack(src, base), timeout=300, verify=True)
        except Exception as e:  # noqa: BLE001
            print(base, 'upload failed', str(e)[:300])
            continue
        url = info['download_url']
        if url.startswith('/'):
            url = m._normalize_base_url(m.DEFAULT_API_BASE, url)
        r = requests.get(url, headers=m._base_headers(key), timeout=300)
        d = os.path.join(out, base)
        os.makedirs(d, exist_ok=True)
        try:
            z = zipfile.ZipFile(io.BytesIO(r.content))
        except zipfile.BadZipFile:
            print(base, 'download not zip', r.status_code, r.content[:200])
            continue
        for i in z.infolist():
            name = i.filename
            ext = os.path.splitext(name)[1].lower()
            target = f'char{ext}' if ext in ('.json', '.skel', '.atlas') else os.path.basename(name)
            open(os.path.join(d, target), 'wb').write(z.read(i))
        print(base, info.get('source_spine_version'), '->', info.get('spine_version'), info.get('conversion_mode'), sorted(os.listdir(d)))
    print('credits after', balance(key))


if __name__ == '__main__':
    main()
