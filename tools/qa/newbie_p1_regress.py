# -*- coding: utf-8 -*-
"""新手体验 P1 一键回归(2026-11-24,策划通玩 P1 修复;编辑器预览 7456 + 本地游戏服 8081)。

流程:本地注册一个新号 → 写 localStorage 会话并刷新(第一段 --fresh --keep)→ 接管同一页依次跑
  steps_newplayer.json:建角(故意用已占用的名字「圣契64」,验证自动名撞名自动换)→ 序幕 → 觉醒(首次进村要接上)
    → 契约之选(未选卡按钮禁用)→ 进村 HUD(召唤 / 商店未开放不显示)
    → docs/57 §3 V01 移动教学(契约后自动出 / 点遮罩外被拦 / 真实拖摇杆计步 / 走满收起 + 追踪条「点这里自动寻路」接力 / 重开点跳过记 skip:V01)
    → 终端锁格 → 点锁格只提示
    → 点追踪条自动寻路 → 弹窗队列(对话 / 发现卡)→ 进化第一次教学 + 稍后再选 → 右上「进化」入口
  steps_features.json:契约禁用态 → 对话开着时发现隐藏点要排队 → 发现卡开着和 NPC 对话先收卡 → 终端锁格样式
    → 本地模拟接到 V04 的功能开放播报 +「新」角标 → 召唤默认免费池 → 古碑面板走远自动收 → 对话大立绘
    → 进化「升级只提醒」/「跨 5 级自动弹」两条分支(桩接口,不确认)
  steps_guides.json:docs/57 §4 功能说明卡(终端 / 背包 / 锻造 / 秘境 / 水晶 / 矿境 / 图鉴 / 世界地图 / 野外探索,只出一次)
    → §3 强引导:模拟接到 V04 召唤页聚光免费召唤 + 跳过;模拟接到 V05 终端→英雄格→第一位伙伴→升级,升级后当场收起
    → docs/57 §12 服务端已存 intro:* / skip:V04 / skip:V01 / tracker_walk、本机待发队列为空(换设备不重放另见 guide_flag_sync_check.py)
  steps_formation.json:§3 V06 编队强引导(真抽一次免费单抽拿第二位英雄 → 模拟接到 V06 → 终端聚光「编队」格 → 真实点进编队页
    → 聚光还没上阵的英雄卡 / 点遮罩外下阵被拦 / 点卡上阵即自动保存(服务端阵容核对)→ 都在阵上时直接保存)
  steps_tips.json:§5 情境提示(拦红点接口模拟「有未穿装备」/「水晶可升级」→ 终端钮红点 + 格子脉冲气泡 / 点气泡或格子记看过;
    「新」格脉冲;本地体力改 0 → 秘境试炼开战被拦 + 第一次弱引导(点了开商店体力页)/ 第二次只说一句;野外走近采集点或隐藏点圆徽放大;服务端 tip:*)
  steps_move_pc.json(--pc 电脑 1600×900):移动教学电脑版 W A S D 键帽(按住哪个亮哪个、走满收起)
截图 / log 在 <输出目录>(默认 %TEMP%/lootchain-qa/newbie_p1_<时间>);跑完按配置目录关掉无头 Edge。
注意:「圣契64」是本地库 guidetest02 的主角名,换库后改 steps_newplayer.json 里的名字;
      steps_features.json 里的「模拟接到 V04」只改页面内存,不碰服务端。

用法:python tools/qa/newbie_p1_regress.py [输出目录] [--release]
     --release:跑本地正式包 7460(build/web-mobile,出包后验证用;全新配置会先下开局包,慢一些)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import edge_guard  # noqa: E402

API = 'http://localhost:8081'
STEPS = os.path.join(HERE, 'newbie_p1')
SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
RELEASE = '--release' in sys.argv
PROFILE_NAME = 'playtest_profile_newbie_rel' if RELEASE else 'playtest_profile_newbie'
ENV = dict(os.environ, PREVIEW_PORT='7460' if RELEASE else '7456', PT_PROFILE=PROFILE_NAME, EDGE_PORT='9385' if RELEASE else '9384', PYTHONIOENCODING='utf-8')


def register():
    name = 'nb' + time.strftime('%m%d%H%M%S')
    req = urllib.request.Request(API + '/api/player/auth/register', method='POST',
                                 data=json.dumps({'username': name, 'password': 'pass1234', 'nickname': None}).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
    data = json.load(urllib.request.urlopen(req, timeout=15))
    if data.get('code') != 0:
        raise SystemExit('注册失败: ' + str(data))
    return name, data['data']['tokenValue'], data['data']['userId']


def fill(src, out, token, uid):
    text = open(os.path.join(STEPS, src), encoding='utf-8').read().replace('{TOKEN}', token).replace('{UID}', str(uid))
    open(out, 'w', encoding='utf-8').write(text)
    return out


def run(out_dir, steps, *flags):
    cmd = [sys.executable, os.path.join(HERE, 'playtest_cdp.py'), out_dir, steps, *flags]
    print('>>', os.path.basename(steps), *flags, flush=True)
    subprocess.run(cmd, env=ENV, check=False)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = args[0] if args else os.path.join(SCRATCH, 'newbie_p1_' + ('rel_' if RELEASE else '') + time.strftime('%m%d_%H%M'))
    os.makedirs(out_dir, exist_ok=True)
    name, token, uid = register()
    print('新号', name, 'uid', uid, flush=True)
    try:
        run(out_dir, fill('steps_inject.json', os.path.join(out_dir, '_inject.json'), token, uid), '--fresh', '--keep')
        run(out_dir, fill('steps_newplayer.json', os.path.join(out_dir, '_newplayer.json'), token, uid), '--keep')
        run(out_dir, fill('steps_features.json', os.path.join(out_dir, '_features.json'), token, uid), '--keep')
        run(out_dir, fill('steps_guides.json', os.path.join(out_dir, '_guides.json'), token, uid), '--keep')
        run(out_dir, fill('steps_formation.json', os.path.join(out_dir, '_formation.json'), token, uid), '--keep')
        run(out_dir, fill('steps_tips.json', os.path.join(out_dir, '_tips.json'), token, uid), '--keep')
        run(out_dir, fill('steps_move_pc.json', os.path.join(out_dir, '_move_pc.json'), token, uid), '--keep', '--pc')
    finally:
        edge_guard.kill_profiles([os.path.join(SCRATCH, PROFILE_NAME)])
    print('结果:', os.path.join(out_dir, 'log.jsonl'), flush=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
