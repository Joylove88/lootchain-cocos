# -*- coding: utf-8 -*-
"""召唤结果页自验(2026-11-26,结果页改 B 风格):本地测试号登录 → 进召唤页 → 注入固定的抽卡结果(不真抽、不动账号)逐屏截图。

批次(手机横屏 1200×540 @2x,再用 --pc 跑一遍电脑 1600×900):
  单抽新英雄(R)→ 单抽重复 SSR(UP、转碎片)→ 十连(UR UP 新 / SSR 重复 / SR / R / 经验书 / 重铸石)
  → 点英雄卡看详情 → 点空白收起 → 点材料卡看详情 → 装备池十连(红 / 橙 / 紫 / 蓝 / 白装 + 强化石等)
  → 左上返回回到召唤主页 → 召唤动画页的「跳过」钮
截图 / log 在 <输出目录>(默认 %TEMP%/lootchain-qa/gacha_result_<时间>);跑完按配置目录关掉无头 Edge。
要求:编辑器预览 7456(--release 用正式包 7460)+ 本地游戏服 8081;测试号 guidetest02 / pass1234(本地库)。

用法:python tools/qa/gacha_result_check.py [输出目录] [--release] [--phone-only | --pc-only]
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
SCRATCH = os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa')
RELEASE = '--release' in sys.argv
PROFILE_NAME = 'playtest_profile_gacha_rel' if RELEASE else 'playtest_profile_gacha'
ENV = dict(os.environ, PREVIEW_PORT='7460' if RELEASE else '7456', PT_PROFILE=PROFILE_NAME, EDGE_PORT='9387' if RELEASE else '9386', PYTHONIOENCODING='utf-8')
ACCOUNT = ('guidetest02', 'pass1234')

# 节点查找:新版结果卡 GachaResultCard_<序号>;旧版 GachaMockResultCard_<稀有度>_<名字>(按出现顺序)
HELPERS = (
    "const cards = () => { const out = []; const w = n => { if (!n.activeInHierarchy) return; "
    "if (n.name.indexOf('GachaResultCard_') === 0 || n.name.indexOf('GachaMockResultCard_') === 0) out.push(n); n.children.forEach(w); }; "
    "try { w(cc.director.getScene()); } catch (e) {} return out; }; "
    "const show = (mode, poolCode, items) => { const s = root.gachaSceneState; "
    "root.gachaSceneState = Object.assign({}, s, { drawing: false, error: null, activeAction: null, lastDrawResult: { drawNo: 'GACHA_QA_' + Date.now(), poolCode: poolCode || s.selectedPoolCode, configVersion: 1, items: items } }); "
    "root.gachaResultMode = mode; root.currentView = 'gachaResult'; root.renderCurrentView(); }; "
    "const H = (code, name, rarity, opts) => Object.assign({ rewardType: 'HERO', rewardCode: code, rewardName: name, rarity: rarity, up: false, duplicate: false, fragmentCount: 0, amount: 1 }, opts || {}); "
    "const I = (type, code, name, rarity, amount) => ({ rewardType: type, rewardCode: code, rewardName: name, rarity: rarity, up: false, duplicate: false, fragmentCount: 0, amount: amount || 1 }); "
    "const shown = () => JSON.stringify({ view: view(), cards: cards().length, texts: texts(80) }); "
)

ONCE_NEW = "[H('R_DAQIAO', '江东明珠·大乔', 'R')]"
ONCE_DUP = "[H('SSR_SUNWUKONG', '齐天大圣·孙悟空', 'SSR', { up: true, duplicate: true, fragmentCount: 30 })]"
TEN_HERO = ("[H('UR_ZHAOYUN', '龙胆枪神·赵云', 'UR', { up: true }), H('R_DIANWEI', '古之恶来·典韦', 'R', { duplicate: true, fragmentCount: 5 }), "
            "I('ITEM', 'HERO_EXP_BOOK', '英雄经验书', 'R', 2), H('SR_YANGJIAN', '显圣真君·杨戬', 'SR'), H('R_GANNING', '锦帆游侠·甘宁', 'R'), "
            "H('SSR_SUNWUKONG', '齐天大圣·孙悟空', 'SSR', { up: true, duplicate: true, fragmentCount: 30 }), I('ITEM', 'DEEP_REFORGE_STONE', '深渊重铸石', 'R', 1), "
            "H('SR_HUATUO', '妙手神医·华佗', 'SR', { duplicate: true, fragmentCount: 10 }), H('R_DAQIAO', '江东明珠·大乔', 'R'), I('ITEM', 'HERO_EXP_BOOK', '英雄经验书', 'R', 1)]")
TEN_EQUIP = ("[I('EQUIP', 'EQ_T1_RED_WEAPON', '灼世噬魂刃', 'SSR'), I('ITEM', 'ENHANCE_STONE', '强化石', 'R', 3), I('EQUIP', 'EQ_WEAPON_GOLD', '深渊噬魂刃', 'SR'), "
             "I('EQUIP', 'EQ_CHEST_PURPLE', '裂隙鳞甲', 'R'), I('ITEM', 'ENHANCE_STONE_HIGH', '高阶强化石', 'SR', 1), I('EQUIP', 'EQ_HELMET_BLUE', '铁誓头盔', 'R'), "
             "I('ITEM', 'ENHANCE_BLESS_STONE', '强化祝福石', 'SR', 1), I('EQUIP', 'EQ_V2_WHITE_WEAPON', '粗铁短剑', 'R'), I('ITEM', 'EQUIP_REROLL_STONE', '词缀洗练石', 'SR', 1), "
             "I('EQUIP', 'EQ_V2_WHITE_CHEST', '粗铁胸甲', 'R')]")


def step(label, body, wait=0, shot=True):
    return {'label': label, 'js': HELPERS + body, 'wait': wait, 'shot': shot}


def result_steps(tag):
    return [
        step(f'{tag}进召唤页',
             "refresh(); for (let i = 0; i < 80; i++) { if (root && root.currentView === 'lobby' && root.worldState) break; await sleep(500); refresh(); } "
             "if (root.closeLobbyTerminalPanel) root.closeLobbyTerminalPanel(); root.terminalReturn = null; "
             "if (root.worldDialog) root.closeWorldDialog(); if (root.worldPoiDialog) root.closeWorldPoiDialog(); if (root.evolutionPick) root.closeEvolutionPickLater(); "
             "if (view() !== 'gacha') root.runLobbyTerminalAction('gacha'); "
             "for (let i = 0; i < 60; i++) { await sleep(500); const s = root.gachaSceneState; if (view() === 'gacha' && s.pools.length > 0 && !s.loading) break; } "
             "await sleep(2500); return JSON.stringify({ view: view(), pools: root.gachaSceneState.pools.map(p => p.poolCode), sel: root.gachaSceneState.selectedPoolCode });"),
        step(f'{tag}单抽新英雄', f"refresh(); show('once', null, {ONCE_NEW}); await sleep(3000); return shown();"),
        step(f'{tag}单抽重复SSR', f"refresh(); show('once', null, {ONCE_DUP}); await sleep(3000); return shown();"),
        step(f'{tag}十连', f"refresh(); show('ten', null, {TEN_HERO}); await sleep(3500); return shown();"),
        step(f'{tag}点英雄卡详情',
             "refresh(); const c = cards(); tap(c[0]); await sleep(1500); "
             "return JSON.stringify({ cards: c.length, overlay: !!find('GachaResultInfoOverlay'), texts: texts(80) });"),
        # 抽完后资料回读会整页重绘:点开的详情要接着挂回去;点空白收起后再重绘不能又冒出来
        step(f'{tag}详情经整页重绘仍在',
             "refresh(); root.renderCurrentView(); await sleep(1200); return JSON.stringify({ overlay: !!find('GachaResultInfoOverlay') });", shot=False),
        step(f'{tag}点空白收起详情',
             "refresh(); const o = find('GachaResultInfoOverlay'); if (o) tap(o); await sleep(600); root.renderCurrentView(); await sleep(900); "
             "return JSON.stringify({ overlay: !!find('GachaResultInfoOverlay') });", shot=False),
        step(f'{tag}点材料卡详情',
             "refresh(); const c = cards(); tap(c[2]); await sleep(1500); const ok = !!find('GachaResultInfoOverlay'); "
             "return JSON.stringify({ overlay: ok, texts: texts(80) });"),
        step(f'{tag}装备十连',
             f"refresh(); const o = find('GachaResultInfoOverlay'); if (o) tap(o); await sleep(500); show('ten', 'EQUIP_POOL', {TEN_EQUIP}); await sleep(3500); return shown();"),
        step(f'{tag}返回召唤主页',
             "refresh(); const b = find('GachaResultGlassBack') || find('GachaResultBackButton'); tap(b); await sleep(2000); "
             "return JSON.stringify({ back: b ? b.name : null, view: view() });"),
        # 召唤动画:模拟「抽卡请求已返回、正在播动画」(pendingGachaDraw 带结果)→ 网页上 <video> 盖住画布,要有 DOM 跳过钮
        step(f'{tag}召唤动画跳过钮',
             "refresh(); const s = root.gachaSceneState; const pool = s.selectedPoolCode; "
             "const res = { drawNo: 'GACHA_QA_VIDEO', poolCode: pool, configVersion: 1, items: [H('R_GANNING', '锦帆游侠·甘宁', 'R')] }; "
             "root.gachaSummonTicket = (root.gachaSummonTicket || 0) + 1; "
             "root.pendingGachaDraw = { ticket: root.gachaSummonTicket, mode: 'once', poolCode: pool, drawCount: 1, requestId: 'qa', result: res, highestRarity: 'R' }; "
             "root.gachaSceneState = Object.assign({}, s, { drawing: true, lastDrawResult: null }); "
             "root.gachaSummonRarity = 'R'; root.gachaResultMode = 'once'; root.currentView = 'gachaSummon'; root.renderCurrentView(); await sleep(1800); "
             "return JSON.stringify({ view: view(), canvasSkip: !!find('GachaSummonSkipButton'), domSkip: !!document.querySelector('[data-lc=gacha-video-skip]') });"),
        step(f'{tag}点跳过进结果页',
             "refresh(); const dom = document.querySelector('[data-lc=gacha-video-skip]'); if (dom) dom.click(); await sleep(2500); "
             "return JSON.stringify({ clicked: !!dom, view: view(), domLeft: !!document.querySelector('[data-lc=gacha-video-skip]'), cards: cards().length, texts: texts(40) });"),
        step(f'{tag}收尾回召唤页',
             "refresh(); root.gachaResultMode = null; root.currentView = 'gacha'; root.renderCurrentView(); await sleep(1500); return view();", shot=False),
    ]


def login():
    req = urllib.request.Request(API + '/api/player/auth/login', method='POST',
                                 data=json.dumps({'username': ACCOUNT[0], 'password': ACCOUNT[1]}).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
    data = json.load(urllib.request.urlopen(req, timeout=15))
    if data.get('code') != 0:
        raise SystemExit('登录失败: ' + str(data))
    return data['data']['tokenValue'], data['data']['userId']


def run(out_dir, steps, *flags):
    cmd = [sys.executable, os.path.join(HERE, 'playtest_cdp.py'), out_dir, steps, *flags]
    print('>>', os.path.basename(steps), *flags, flush=True)
    subprocess.run(cmd, env=ENV, check=False)


def write(out_dir, name, steps):
    path = os.path.join(out_dir, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(steps, f, ensure_ascii=False, indent=1)
    return path


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = args[0] if args else os.path.join(SCRATCH, 'gacha_result_' + ('rel_' if RELEASE else '') + time.strftime('%m%d_%H%M'))
    os.makedirs(out_dir, exist_ok=True)
    token, uid = login()
    print('测试号', ACCOUNT[0], 'uid', uid, flush=True)
    inject = [{
        'label': '注入会话',
        'js': f"localStorage.setItem('lootchain.player.tokenName', 'satoken'); localStorage.setItem('lootchain.player.tokenValue', '{token}'); "
              f"localStorage.setItem('lootchain.player.userId', '{uid}'); setTimeout(() => location.reload(), 300); return 'set';",
        'wait': 3, 'shot': False,
    }]
    try:
        run(out_dir, write(out_dir, '_inject.json', inject), '--fresh', '--keep')
        if '--pc-only' not in sys.argv:
            run(out_dir, write(out_dir, '_phone.json', result_steps('手机_')), '--keep')
        if '--phone-only' not in sys.argv:
            run(out_dir, write(out_dir, '_pc.json', result_steps('电脑_')), '--keep', '--pc')
    finally:
        edge_guard.kill_profiles([os.path.join(SCRATCH, PROFILE_NAME)])
    print('结果:', os.path.join(out_dir, 'log.jsonl'), flush=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
