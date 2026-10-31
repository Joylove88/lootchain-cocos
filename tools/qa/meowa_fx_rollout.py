# -*- coding: utf-8 -*-
"""野外战斗特效超清换皮铺开(2026-11-01 用户选「普攻 + 战技 64 个」;大招 hu 包不动):
从配置表取全部英雄的普攻弹道 / 命中(HERO_ATTACK_SPINE_FX)+ 战技(HERO_GUARD_SKILL_EFFECTS),逐个走 meowa_fx_reskin.run
(图集按面积自动放大 1~4 倍、换皮、回填原骨骼 + 颜色对齐)。已有 final 的跳过,可断点续跑;结果写 C:/mw/fx/rollout.tsv。
--install 把 final 装进 assets(原 atlas / png 先备份到 素材原始备份/fx-meowa-20261031)。
用法:python tools/qa/meowa_fx_rollout.py [--only e1,e2] [--install] [--list]
"""
import math, os, re, shutil, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meowa_fx_reskin as fxr  # noqa: E402

REPO = fxr.REPO
LOBBY = os.path.join(REPO, 'assets', 'scripts', 'scenes', 'lobby')
EFFECT = fxr.EFFECT
BACKUP = os.path.join(REPO, '素材原始备份', 'fx-meowa-20261031')
fxr.PROJECT, fxr.THREAD = 'proj_45445243e73e4c5d9b15d2e272d06749', 'thread_e2c86251e38246898bd740372ee5b027'
args = sys.argv[1:]
ONLY = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None


def block(src, start):
    i = src.index(start)
    return src[i:src.index('\n};', i)]


def targets():
    a = open(os.path.join(LOBBY, 'LobbyBattleAttackFxConfig.ts'), encoding='utf-8').read()
    s = open(os.path.join(LOBBY, 'LobbyBattleSkillEffectConfig.ts'), encoding='utf-8').read()
    out = {}
    for e in re.findall(r"effect: '([^']+)'", block(a, 'HERO_ATTACK_SPINE_FX')):
        kind = 'projectile in flight' if e.endswith(('_fly', '_fxw')) or 'fly' in e else 'hit impact burst'
        out.setdefault(e, f'Hero attack {kind} effect')
    for e in re.findall(r"effect: '([^']+)'", block(s, 'const HERO_GUARD_SKILL_EFFECTS')):
        out.setdefault(e, 'Hero combat skill magic effect')
    return out


def factor_of(e):
    d = os.path.join(EFFECT, e)
    area = sum(Image.open(os.path.join(d, f)).size[0] * Image.open(os.path.join(d, f)).size[1] for f in os.listdir(d) if f.endswith('.png'))
    return max(1, min(4, int(math.sqrt(2.2e6 / max(1, area)))))


def install(e):
    final = os.path.join(fxr.OUT, e, 'final')
    # 装之前按当前回填工具重做一遍 final(柔光底等后加的处理对早出的也生效;只是本地重算,不扣积分)
    src = next((os.path.join(fxr.OUT, e, d) for d in os.listdir(os.path.join(fxr.OUT, e)) if d.startswith('src_x')), None)
    if src:
        import subprocess
        subprocess.run([sys.executable, os.path.join(HERE, 'fx_tex_repack.py'), src, os.path.join(fxr.OUT, e, 'pack'), final, e], check=True, stdout=subprocess.DEVNULL)
    dst = os.path.join(EFFECT, e)
    os.makedirs(os.path.join(BACKUP, e), exist_ok=True)
    for f in os.listdir(dst):
        if f.endswith(('.atlas', '.png')) and not os.path.exists(os.path.join(BACKUP, e, f)):
            shutil.copy(os.path.join(dst, f), os.path.join(BACKUP, e, f))
    for f in os.listdir(final):
        if f.endswith(('.atlas', '.png')):
            shutil.copy(os.path.join(final, f), os.path.join(dst, f))


if __name__ == '__main__':
    extra = {e: '' for e in ('v2_a47_376', 'v2_a47_162', 'v2_a47_453', 'v2_a49_405')}  # 精英 / 首领光环(另一批出的)
    todo = {e: d for e, d in targets().items() if (not ONLY or e in ONLY)}
    if '--install' in args:
        todo.update({e: d for e, d in extra.items() if not ONLY or e in ONLY})
    if '--list' in args:
        for e, d in todo.items():
            print(e, factor_of(e), d)
        sys.exit(0)
    if '--install' in args:
        for e in todo:
            if os.path.isdir(os.path.join(fxr.OUT, e, 'final')):
                install(e)
                print('installed', e, flush=True)
        sys.exit(0)
    report = open(os.path.join(fxr.OUT, 'rollout.tsv'), 'a', encoding='utf-8')
    for i, (e, desc) in enumerate(todo.items()):
        if os.path.isdir(os.path.join(fxr.OUT, e, 'final')):
            print(f'[{i + 1}/{len(todo)}] {e} skip (done)', flush=True)
            continue
        k = factor_of(e)
        try:
            res = fxr.run(e, k, desc)
        except Exception as err:  # 单个失败不中断
            res = f'error {err}'
        print(f'[{i + 1}/{len(todo)}] {e} x{k} {res}', flush=True)
        report.write(f'{e}\t{k}\t{res}\n')
        report.flush()
